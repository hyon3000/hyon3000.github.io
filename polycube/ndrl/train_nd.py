"""Recurrent afterstate Double-DQN (R2D2-style sequence replay) for Polynomino.

The value network carries a GRU memory through a whole game (see rnnnet.py). Training therefore uses *sequences*:
every env writes its decisions into a ring; every S decisions a window of W steps (a burn-in of BURN steps that only
refreshes the memory, then S trained steps) is stored together with the memory state it started from, and updates
re-run the GRU over the window with the current weights. Targets are 1-step double-DQN bootstraps computed at
collection time with a Polyak-averaged target network. No item-specific reward shaping: the memory has to find out
what went wrong and why.
"""
import argparse, collections, pathlib, time
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as Fn
from simnd import VecEnv, NF, KIDS, SD
from rnnnet import RNet, Round, candidate_q, H, VSCALE, GAMMA, DEATH

HERE = pathlib.Path(__file__).parent
W, BURN = 64, 16
S = W - BURN - 1        # trained steps per window (+1 slack for a flush that adds the last step)
R = W + S + 8           # ring length per env

GROUP_IDX = {"bombs": 0, "plines": 1, "obstacles": 2, "shuffle": 3, "timing": 4, "size": 5, "minus": 6, "range": 7, "clear": 8, "gap": 9,
             "score": 10, "mono": 11}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--envs", type=int, default=512)
    ap.add_argument("--minutes", type=float, default=60)
    ap.add_argument("--maxpieces", type=int, default=1000000000, help="no limit: the goal is simply to place as many blocks as possible")
    ap.add_argument("--batch", type=int, default=64, help="windows per update")
    ap.add_argument("--updates", type=int, default=1)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--tau", type=float, default=0.01)
    ap.add_argument("--eps0", type=float, default=0.2)
    ap.add_argument("--eps1", type=float, default=0.01)
    ap.add_argument("--eps_steps", type=float, default=4e6)
    ap.add_argument("--anneal_frac", type=float, default=0.5)
    ap.add_argument("--capacity", type=int, default=9000, help="windows kept in the replay")
    ap.add_argument("--out", default="runs/r1")
    ap.add_argument("--resume", default="", help="checkpoint of RNet, or of the memory-less ValueNet (state/emb/mlp are reused)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--restart", type=float, default=0.3, help="probability that a new game starts from a remembered near-failure state of the agent itself")
    ap.add_argument("--eps_restart", type=float, default=0.12, help="exploration rate inside such games")
    ap.add_argument("--per_alpha", type=float, default=0.6, help="prioritised replay exponent (0 = uniform)")
    ap.add_argument("--per_beta", type=float, default=0.4)
    ap.add_argument("--crisis", type=float, default=0.0, help="start probability of games on a bad board (annealed to crisis_end)")
    ap.add_argument("--crisis_end", type=float, default=0.08)
    ap.add_argument("--crisis_hold", type=float, default=0.5, help="in such games: probability that a pierce piece waits in the hold")
    ap.add_argument("--pierce", type=float, default=0.0, help="extra probability per piece of being a pierce piece (annealed to 0.003)")
    ap.add_argument("--guide", type=float, default=0.0, help="exploration: on a bad board try a pierce-using plan with this probability (annealed to 0.1)")
    ap.add_argument("--boost", default="", help="item-specific frequency multipliers (off by default: no item-specific handling)")
    ap.add_argument("--base0", type=float, default=0.4, help="initial survival bonus per decision (a cleared line is worth ~1); annealed away as the agent starts clearing lines")
    ap.add_argument("--lpp_target", type=float, default=0.3, help="lines per piece at which the survival bonus has fully vanished")
    ap.add_argument("--base_end", type=float, default=0.7, help="fraction of the run after which the bonus is 0 regardless")
    ap.add_argument("--hole0", type=float, default=0.3, help="initial shaping reward per hole removed (fades together with the survival bonus)")
    ap.add_argument("--battle", action="store_true", help="battle placement: eaten items go to a queue and are used by the rule (helpful on me, the rest sent away); ITEM_BONUS env rewards eating them")
    ap.add_argument("--item_scale", type=int, default=4)
    a = ap.parse_args()

    out = HERE / a.out; out.mkdir(parents=True, exist_ok=True)
    dev = torch.device("cuda"); torch.manual_seed(a.seed)
    net, tgt = RNet().to(dev), RNet().to(dev)
    if a.resume:
        sd = torch.load(a.resume, map_location=dev)
        missing = net.load_state_dict(sd, strict=False)
        print("resume:", a.resume, "| new (randomly/zero initialised) tensors:", [k for k in missing.missing_keys], flush=True)
    tgt.load_state_dict(net.state_dict())
    opt = torch.optim.Adam(net.parameters(), lr=a.lr)

    N = a.envs
    env = VecEnv(N, a.seed + 1, items=True)
    SELF_RULE = {9, 20, 21, 102, 104, 116, 118, 119, 124, 126, 105, 106, 204}
    dummy = None
    if a.battle:
        env.set_battle(True, a.item_scale); dummy = VecEnv(N, a.seed + 99, items=True); dummy.set_battle(True, a.item_scale)

    # per-env ring of the current game
    RX = torch.zeros(R, N, NF, device=dev); RI = torch.full((R, N, KIDS), -1, dtype=torch.int16, device=dev)
    RSC = torch.zeros(R, N, SD, device=dev); RSA = torch.zeros(R, N, SD, device=dev); RH = torch.zeros(R, N, H, device=dev)
    RY = torch.zeros(R, N, device=dev); RM = torch.zeros(R, N, dtype=torch.bool, device=dev)
    age = torch.zeros(N, dtype=torch.long, device=dev); emitted = torch.zeros(N, dtype=torch.long, device=dev)
    ar = torch.arange(N, device=dev); hprev = torch.zeros(N, H, device=dev)
    # replay of windows
    C = a.capacity
    BX = torch.zeros(C, W, NF, dtype=torch.float16, device=dev); BI = torch.full((C, W, KIDS), -1, dtype=torch.int16, device=dev)
    BSC = torch.zeros(C, W, SD, dtype=torch.float16, device=dev); BSA = torch.zeros(C, W, SD, dtype=torch.float16, device=dev)
    BY = torch.zeros(C, W, device=dev); BM = torch.zeros(C, W, dtype=torch.bool, device=dev); BH = torch.zeros(C, H, device=dev)
    BP = torch.ones(C, device=dev)          # replay priorities (new windows get the maximum)
    maxp = 1.0
    bn = bp = 0
    posr = torch.arange(W, device=dev)[None]

    def emit(envs, train_end):
        """store a window for each env in `envs` covering its not-yet-emitted steps up to train_end (inclusive)"""
        nonlocal bn, bp
        if envs.numel() == 0: return
        ts = emitted[envs]; start = torch.clamp(ts - BURN, min=0)
        n = train_end - start + 1
        step = start[:, None] + posr                       # [E,W]
        ok = posr < n[:, None]
        ri = step % R
        e2 = envs[:, None]
        m = RM[ri, e2] & ok & (step >= ts[:, None])
        keep = m.any(1)
        if not bool(keep.any()): return
        okf = ok.float()[..., None]
        x = RX[ri, e2]; ids = RI[ri, e2]; sc = RSC[ri, e2] * okf; sa = RSA[ri, e2] * okf; y = RY[ri, e2]
        h0 = torch.where((start > 0)[:, None], RH[(start - 1) % R, envs], torch.zeros(envs.numel(), H, device=dev))
        sel = keep.nonzero().squeeze(1); k = sel.numel()
        if k > C: sel = sel[-C:]; k = C
        pos = (torch.arange(k, device=dev) + bp) % C
        BX[pos] = x[sel].half(); BI[pos] = ids[sel]; BSC[pos] = sc[sel].half(); BSA[pos] = sa[sel].half()
        BY[pos] = y[sel]; BM[pos] = m[sel]; BH[pos] = h0[sel]; BP[pos] = maxp
        bp = (bp + k) % C; bn = min(bn + k, C)

    ep_fresh = collections.deque(maxlen=300)   # games that started from scratch (restarted games are harder: only these are comparable over time)
    ep_pieces = collections.deque(maxlen=300); ep_lines = collections.deque(maxlen=300); ep_score = collections.deque(maxlen=300)
    ep_trunc = collections.deque(maxlen=300)
    guide_p = a.guide
    steps = rnd = 0; t0 = time.time(); best = -1; loss_ema = 0.0; frac = 0.0; bad_logs = 0; rollbacks = 0; qmax_ema = 0.0
    total_s = a.minutes * 60
    while time.time() - t0 < total_s:
        if rnd % 200 == 0: frac = min(1.0, (time.time() - t0) / (total_s * a.anneal_frac))
        if rnd % 200 == 0:
            import rnnnet
            lpp = (sum(ep_lines) / max(1.0, sum(ep_pieces))) if len(ep_pieces) >= 100 else 0.0
            time_cap = max(0.0, 1.0 - (time.time() - t0) / (total_s * a.base_end))
            target = a.base0 * max(0.0, 1.0 - lpp / a.lpp_target) * (1.0 if time_cap > 0 else 0.0)
            cur = rnnnet.BASE if rnd else a.base0
            rnnnet.BASE = min(cur, target, a.base0 * time_cap) if rnd else a.base0   # never grows back: the bonus only shrinks
            rnnnet.HOLE_W = a.hole0 * (rnnnet.BASE / a.base0 if a.base0 > 0 else 0.0)   # hole shaping fades with the survival bonus; finally only the score remains
        if dummy is not None:           # battle: use the front item of every queue now - helpful ones on myself, the rest are sent to the (dummy) opponent
            fr = env.qfront(); env.buse(dummy, np.where(fr == 0, 0, np.where(np.isin(fr, list(SELF_RULE)), 1, 2)).astype(np.int32))
            if rnd % 100 == 0:
                for i_ in range(N): dummy.reset_one(i_)
        env.gen()
        r = Round(env, dev)
        # recurrent memory: absorb what happened since the last decision (online net; zeros at a game start)
        hprev = torch.where(r.first[:, None], torch.zeros_like(hprev), hprev)
        hprev = net.gru_step(r.sumact, hprev).detach()
        qo = candidate_q(net, r.x, r.ids, r.rew, r.valid, r.sumc, hprev)
        qt = candidate_q(tgt, r.x, r.ids, r.rew, r.valid, r.sumc, hprev)
        best_a = qo.argmax(1)
        ystar = qt.gather(1, best_a[:, None]).squeeze(1)
        qmax_ema = 0.99 * qmax_ema + 0.01 * float(ystar.mean())

        # the previous decision of every running game now has its bootstrap target
        prev = age > 0
        if bool(prev.any()):
            pi = ((age - 1) % R)[prev]; pe = ar[prev]
            RY[pi, pe] = ystar[prev]; RM[pi, pe] = True

        # action selection
        eps = max(a.eps1, a.eps0 + (a.eps1 - a.eps0) * steps / a.eps_steps)
        rand_pick = torch.multinomial(r.valid.float(), 1).squeeze(1)
        rs_np = np.zeros(N, np.int32)
        act = torch.where(torch.rand(N, device=dev) < eps, rand_pick, best_a)
        idx = age % R
        RX[idx, ar] = r.x[ar, act]; RI[idx, ar] = r.ids[ar, act]; RSC[idx, ar] = r.sumc[ar, act]
        RSA[idx, ar] = r.sumact; RH[idx, ar] = hprev; RY[idx, ar] = 0.0; RM[idx, ar] = False
        act_np = act.cpu().numpy()
        chosen_dead = torch.from_numpy(r.chosen_dead_fn(act_np)).to(dev)

        ep = env.step(act_np, a.maxpieces)
        steps += N; rnd += 1
        status = torch.from_numpy(ep[:, 0].copy()).to(dev)
        for i in np.nonzero(ep[:, 0] > 0)[0]:
            ep_pieces.append(ep[i, 3]); ep_lines.append(ep[i, 2]); ep_score.append(ep[i, 1]); ep_trunc.append(ep[i, 0] == 2)
            if not rs_np[i]: ep_fresh.append(ep[i, 3])

        # game over: a chosen afterstate that looked fine but killed gets DEATH; then flush the game's remaining steps
        ended = status > 0
        if bool(ended.any()):
            pd = ended & (status == 1) & ~chosen_dead
            if bool(pd.any()):
                RY[idx[pd], ar[pd]] = DEATH; RM[idx[pd], ar[pd]] = True
            ee = ar[ended]
            emit(ee, age[ee])
            age = torch.where(ended, torch.zeros_like(age), age); emitted = torch.where(ended, torch.zeros_like(emitted), emitted)
        # regular windows: S fresh steps with known targets
        run = ~ended
        ready = run & (age >= emitted + S)
        if bool(ready.any()):
            ee = ar[ready]
            emit(ee, emitted[ee] + S - 1)
            emitted = torch.where(ready, emitted + S, emitted)
        age = torch.where(run, age + 1, age)

        # learning on sequences
        if bn >= 600:
            for _ in range(a.updates):
                if a.per_alpha > 0:
                    pr = BP[:bn] ** a.per_alpha
                    ii = torch.multinomial(pr / pr.sum(), a.batch, replacement=True)
                    wis = (bn * (pr[ii] / pr.sum())) ** (-a.per_beta); wis = wis / wis.max()
                else:
                    ii = torch.randint(0, bn, (a.batch,), device=dev); wis = torch.ones(a.batch, device=dev)
                x = BX[ii].float(); ids = BI[ii]; sc = BSC[ii].float(); sa = BSA[ii].float()
                y = BY[ii] / VSCALE; m = BM[ii]
                hseq, _ = net.gru(sa, BH[ii][None].contiguous())                  # memory after each step's events  [B,W,H]
                B = x.shape[0]
                hc = net.gru_step(sc.reshape(B * W, -1), hseq.reshape(B * W, -1))
                v = net.value(x.reshape(B * W, -1), ids.reshape(B * W, -1), hc).reshape(B, W)
                per = Fn.smooth_l1_loss(v, y, reduction="none") * m.float()
                loss = (per.sum(1) / m.float().sum(1).clamp(min=1) * wis).mean()
                with torch.no_grad():   # priority = mix of max and mean absolute TD error over the trained steps of the window
                    ae = (v - y).abs() * m.float()
                    pri = 0.9 * ae.max(1).values + 0.1 * ae.sum(1) / m.float().sum(1).clamp(min=1)
                    BP[ii] = pri + 1e-4; maxp = max(maxp * 0.999, float(pri.max()))
                opt.zero_grad(set_to_none=True); loss.backward()
                nn.utils.clip_grad_norm_(net.parameters(), 2.0)
                opt.step()
                if rnd % 10 == 0: loss_ema = 0.99 * loss_ema + 0.01 * loss.item()
            with torch.no_grad():
                for pt, pn in zip(tgt.parameters(), net.parameters()):
                    pt.lerp_(pn, a.tau)

        if rnd % 500 == 0: torch.save(net.state_dict(), out / 'last.pt')   # games may never end (unbounded play): do not tie checkpoints to finished games
        if rnd % 100 == 0 and ep_pieces and len(ep_fresh) >= 50:
            mp = float(np.mean(ep_fresh)); mall = float(np.mean(ep_pieces))
            print(f"rnd {rnd} steps {steps/1e6:.2f}M windows {bn} eps {eps:.3f} boost {1-frac:.2f} t {(time.time()-t0)/60:.1f}m "
                  f"fresh {mp:.0f} all {mall:.0f} lines {np.mean(ep_lines):.0f} score {np.mean(ep_score):.0f} trunc {np.mean(ep_trunc):.2f} "
                  f"loss {loss_ema:.4f} qmax {qmax_ema:.0f} base {__import__('rnnnet').BASE:.3f} hole {__import__('rnnnet').HOLE_W:.3f} lpp {sum(ep_lines)/max(1.0,sum(ep_pieces)):.3f}", flush=True)
            torch.save(net.state_dict(), out / "last.pt")
            if len(ep_fresh) >= 200 and mp > best and steps > 1e6:
                best = mp; torch.save(net.state_dict(), out / "best.pt"); bad_logs = 0
            elif best > 100 and mp < 0.4 * best:
                bad_logs += 1
            else:
                bad_logs = 0
            if bad_logs >= 10 and rollbacks < 20:   # the policy collapsed: go back to the best weights, fresh optimizer and replay
                print(f"ROLLBACK to best ({best:.0f} pieces) after collapse to {mp:.0f}", flush=True)
                net.load_state_dict(torch.load(out / "best.pt")); tgt.load_state_dict(net.state_dict())
                opt = torch.optim.Adam(net.parameters(), lr=a.lr); bn = bp = 0; age.zero_(); emitted.zero_()
                bad_logs = 0; rollbacks += 1; ep_pieces.clear(); ep_fresh.clear()
            if int((time.time() - t0) / 600) > getattr(main, "_snap", -1):   # a snapshot every 10 minutes
                main._snap = int((time.time() - t0) / 600)
                torch.save(net.state_dict(), out / f"snap_{main._snap:03d}.pt")
    torch.save(net.state_dict(), out / "last.pt")


if __name__ == "__main__":
    main()
