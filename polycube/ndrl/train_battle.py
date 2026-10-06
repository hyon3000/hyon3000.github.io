"""Self-play training of the ONE battle network (bnet.BRNet) for 3D / 4D: it places the blocks and decides which stored item to throw / use and when.

Two players (two boards, items are stored, one side's death ends both) play each other with the same network. Every round, for both sides:
  1. the memory absorbs what happened; the root candidates are valued -> ystar0 (best plan value before any item decision)
  2. item decision: A(s, a) for {wait, take item k of the first 4 and use it on me / throw it at the opponent}. eps-greedy (exploration also follows the old rule).
     The item is applied at once on the right board.
  3. placement decision on the resulting state (the opponent window and my queue are inputs of the plan values): eps-greedy over afterstates
  4. both blocks are placed.
Targets:  placement (as in train_nd.py): bootstrapped from the next decision, whose state value is  ystar0 + max_a A(s, a)  (so that the value of holding /
throwing items flows back into the plans); death -> DEATH, the survivor of a decided duel gets WINB on top.
Item head: advantage of the action over waiting  =  lam * (Phi(after) - Phi(before)) + (ystar_after - ystar0), with the convex stack-danger potential
Phi = ((opp height / ceiling)^2 - (my height / ceiling)^2): throwing damage is worth more when the opponent's stack is already high; line removal helps me most when mine is.
"""
import argparse, collections, os, pathlib, time
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as Fn
import sys
DIM = int(os.environ.get("DIM", "3"))
if DIM == 2:       # 2D: the polynomino simulator and its networks (same interface)
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "polynomino", "training"))
    from simlib import VecEnv, NF, KIDS, SD, VIEWD, QD, BSD
else:
    from simnd import VecEnv, NF, KIDS, SD, VIEWD, QD, BSD
import rnnnet
from rnnnet import RNet, Round, H, VSCALE, GAMMA, DEATH, GreedyAgent
from bnet import BRNet, candidate_q_b, CTXD
from duel_nd import NA, action_mask, pol_rule

HERE = pathlib.Path(__file__).parent
W, BURN = 64, 16
S = W - BURN - 1
R = W + S + 8
CEIL = 9.0 if DIM in (3, 4) else 20.0
HSC = 10.0 if DIM in (3, 4) else 20.0          # the opponent / own window features hold maxheight / HSC


def phi(X, lam):
    ho = torch.clamp(X[:, NF] * HSC, 0, CEIL) / CEIL; hm = torch.clamp(X[:, NF + VIEWD] * HSC, 0, CEIL) / CEIL
    return lam * (ho * ho - hm * hm)


def combine(rA, rB, dev):
    cm = max(rA.cmax, rB.cmax)
    def pad(t, fill):
        if t.shape[1] == cm: return t
        sh = list(t.shape); sh[1] = cm - t.shape[1]
        return torch.cat([t, torch.full(sh, fill, dtype=t.dtype, device=t.device)], 1)
    c = lambda a, b, f: torch.cat([pad(a, f), pad(b, f)], 0)
    o = type("RR", (), {})()
    o.x = c(rA.x, rB.x, 0.0); o.ids = c(rA.ids, rB.ids, -1); o.sumc = c(rA.sumc, rB.sumc, 0.0); o.rew = c(rA.rew, rB.rew, 0.0); o.valid = c(rA.valid, rB.valid, False)
    o.sumact = torch.cat([rA.sumact, rB.sumact], 0); o.first = torch.cat([rA.first, rB.first], 0)
    n = rA.x.shape[0]
    o.chosen_dead = lambda act: np.concatenate([rA.chosen_dead_fn(act[:n]), rB.chosen_dead_fn(act[n:])])
    return o


def ctx_of(X):
    return torch.cat([X[:, NF:NF + VIEWD], X[:, NF + 2 * VIEWD:]], 1)


class BaseReward:
    """the old opponent keeps playing with the reward it was trained with (score), whatever the new net is trained for"""
    def __init__(self, spec):
        mode, base, div, death = spec.split(":"); self.v = dict(REWARD=mode, BASE=float(base), SCORE_DIV=float(div), DEATH=float(death), VMAX=1500.0, VMIN=-20.0)
    def __enter__(self):
        self.old = {k: getattr(rnnnet, k) for k in self.v}
        for k, x in self.v.items(): setattr(rnnnet, k, x)
    def __exit__(self, *a):
        for k, x in self.old.items(): setattr(rnnnet, k, x)


def evaluate(net, base_net, dev, games, item_scale, maxdec, n=48, base_reward=None):
    """BRNet (placement + items) against the old setup (solo placement net + the old item rule)"""
    EA, EB = VecEnv(n, 901, items=True), VecEnv(n, 902, items=True); EA.set_battle(True, item_scale); EB.set_battle(True, item_scale)
    agB = GreedyAgent(base_net, n, dev); hA = torch.zeros(n, H, device=dev); dec = np.zeros(n, np.int32)
    res = collections.Counter(); done_games = 0; rule = pol_rule(EB); lens = []
    while done_games < games:
        EA.gen(); rA = Round(EA, dev)
        hA = torch.where(rA.first[:, None], torch.zeros_like(hA), hA); hA = net.gru_step(rA.sumact, hA)
        xa, _ = EA.bstate(EB); X = torch.from_numpy(xa).to(dev)
        with torch.no_grad():
            adv = net.item_adv(X[:, :NF], ctx_of(X), hA).masked_fill(~torch.from_numpy(action_mask(EA)).to(dev), -1e9)
            aA = adv.argmax(1).cpu().numpy().astype(np.int32)
        xb, _ = EB.bstate(EA); aB = rule(xb, action_mask(EB))
        EA.buse(EB, aA); EB.buse(EA, aB)
        EA.gen(); rA2 = Round(EA, dev); xa1, _ = EA.bstate(EB); X1 = torch.from_numpy(xa1).to(dev)
        q = candidate_q_b(net, rA2.x, rA2.ids, rA2.rew, rA2.valid, rA2.sumc, hA, ctx_of(X1)); actA = q.argmax(1).cpu().numpy()
        with base_reward: actB = agB.act(EB)
        epA = EA.step(actA, 10 ** 6).copy(); epB = EB.step(actB, 10 ** 6).copy(); dec += 1
        dA, dB = epA[:, 0] == 1, epB[:, 0] == 1; cap = dec >= maxdec; done = dA | dB | cap
        for i in np.nonzero(done)[0]:
            res[(-1 if dA[i] and not dB[i] else (1 if dB[i] and not dA[i] else 0))] += 1; lens.append(int(dec[i])); done_games += 1
            EA.reset_one(i); EB.reset_one(i); dec[i] = 0; hA[i] = 0; agB.h[i] = 0
    tot = sum(res.values())
    return dict(win=res[1] / tot, lose=res[-1] / tot, draw=res[0] / tot, games=tot, mean_len=float(np.mean(lens)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=64, help="duels in parallel (2n boards)")
    ap.add_argument("--minutes", type=float, default=120); ap.add_argument("--maxpieces", type=int, default=1000000000)
    ap.add_argument("--item_scale", type=int, default=6); ap.add_argument("--batch", type=int, default=64); ap.add_argument("--updates", type=int, default=1)
    ap.add_argument("--lr", type=float, default=5e-5); ap.add_argument("--tau", type=float, default=0.01)
    ap.add_argument("--eps0", type=float, default=0.08); ap.add_argument("--eps1", type=float, default=0.01); ap.add_argument("--eps_steps", type=float, default=2e6)
    ap.add_argument("--ieps0", type=float, default=0.3); ap.add_argument("--ieps1", type=float, default=0.05)
    ap.add_argument("--lam", type=float, default=40.0, help="weight of the stack-danger potential in the item targets")
    ap.add_argument("--winb", type=float, default=50.0); ap.add_argument("--capacity", type=int, default=9000)
    ap.add_argument("--init", default="", help="RNet / BRNet checkpoint to start from (empty: a new network, trained from scratch)"); ap.add_argument("--base", default="", help="old solo RNet to evaluate against (default: --init)")
    ap.add_argument("--out", default="runs/bat3"); ap.add_argument("--seed", type=int, default=0); ap.add_argument("--eval_every", type=float, default=15)
    ap.add_argument("--hole0", type=float, default=0.0, help="shaping reward per hole removed at the start of the run, annealed to 0 over the first 60% (helps a new network learn to stack)")
    ap.add_argument("--base_reward", default="score:0:20:0", help="reward of the old opponent: mode:base:score_div:death (2D: score:1:50:-10)")
    ap.add_argument("--per_alpha", type=float, default=0.6); ap.add_argument("--per_beta", type=float, default=0.4)
    a = ap.parse_args()
    out = HERE / a.out; out.mkdir(parents=True, exist_ok=True)
    dev = torch.device("cuda"); torch.manual_seed(a.seed); np.random.seed(a.seed)
    net, tgt = BRNet().to(dev), BRNet().to(dev)
    if a.init:
        miss = net.load_state_dict(torch.load(a.init, map_location=dev), strict=False); print("init:", a.init, "| new tensors:", miss.missing_keys, flush=True)
    else: print("training from scratch", flush=True)
    tgt.load_state_dict(net.state_dict())
    base_net = RNet().to(dev); base_net.load_state_dict(torch.load(a.base, map_location=dev), strict=False); base_net.eval()
    opt = torch.optim.Adam(net.parameters(), lr=a.lr)
    n = a.n; N = 2 * n
    A, B = VecEnv(n, a.seed * 2 + 1, items=True), VecEnv(n, a.seed * 2 + 2, items=True); A.set_battle(True, a.item_scale); B.set_battle(True, a.item_scale)
    ruleA, ruleB = pol_rule(A), pol_rule(B)

    RX = torch.zeros(R, N, NF, device=dev); RI = torch.full((R, N, KIDS), -1, dtype=torch.int16, device=dev)
    RSC = torch.zeros(R, N, SD, device=dev); RSA = torch.zeros(R, N, SD, device=dev); RH = torch.zeros(R, N, H, device=dev); RC = torch.zeros(R, N, CTXD, device=dev)
    RY = torch.zeros(R, N, device=dev); RM = torch.zeros(R, N, dtype=torch.bool, device=dev)
    age = torch.zeros(N, dtype=torch.long, device=dev); emitted = torch.zeros(N, dtype=torch.long, device=dev); ar = torch.arange(N, device=dev); hprev = torch.zeros(N, H, device=dev)
    C = a.capacity
    BX = torch.zeros(C, W, NF, dtype=torch.float16, device=dev); BI = torch.full((C, W, KIDS), -1, dtype=torch.int16, device=dev)
    BSC = torch.zeros(C, W, SD, dtype=torch.float16, device=dev); BSA = torch.zeros(C, W, SD, dtype=torch.float16, device=dev); BCX = torch.zeros(C, W, CTXD, dtype=torch.float16, device=dev)
    BY = torch.zeros(C, W, device=dev); BM = torch.zeros(C, W, dtype=torch.bool, device=dev); BH = torch.zeros(C, H, device=dev)
    BP = torch.ones(C, device=dev); maxp = 1.0; bn = bp = 0; posr = torch.arange(W, device=dev)[None]
    IC = 150000      # item decisions (single transitions)
    IX = torch.zeros(IC, NF, dtype=torch.float16, device=dev); ICX = torch.zeros(IC, CTXD, dtype=torch.float16, device=dev); IH = torch.zeros(IC, H, device=dev)
    IA = torch.zeros(IC, dtype=torch.long, device=dev); IY = torch.zeros(IC, device=dev); ibn = ibp = 0

    def emit(envs, train_end):
        nonlocal bn, bp
        if envs.numel() == 0: return
        ts = emitted[envs]; start = torch.clamp(ts - BURN, min=0); nn_ = train_end - start + 1
        step = start[:, None] + posr; ok = posr < nn_[:, None]; ri = step % R; e2 = envs[:, None]
        m = RM[ri, e2] & ok & (step >= ts[:, None]); keep = m.any(1)
        if not bool(keep.any()): return
        okf = ok.float()[..., None]
        x = RX[ri, e2]; ids = RI[ri, e2]; sc = RSC[ri, e2] * okf; sa = RSA[ri, e2] * okf; cx = RC[ri, e2] * okf; y = RY[ri, e2]
        h0 = torch.where((start > 0)[:, None], RH[(start - 1) % R, envs], torch.zeros(envs.numel(), H, device=dev))
        sel = keep.nonzero().squeeze(1); k = sel.numel()
        if k > C: sel = sel[-C:]; k = C
        pos = (torch.arange(k, device=dev) + bp) % C
        BX[pos] = x[sel].half(); BI[pos] = ids[sel]; BSC[pos] = sc[sel].half(); BSA[pos] = sa[sel].half(); BCX[pos] = cx[sel].half()
        BY[pos] = y[sel]; BM[pos] = m[sel]; BH[pos] = h0[sel]; BP[pos] = maxp
        bp = (bp + k) % C; bn = min(bn + k, C)

    def add_items(root, cx, h, a_, y):
        nonlocal ibn, ibp
        k = root.shape[0]
        if k == 0: return
        idx = (torch.arange(k, device=dev) + ibp) % IC
        IX[idx] = root.half(); ICX[idx] = cx.half(); IH[idx] = h; IA[idx] = a_; IY[idx] = y
        ibp = (ibp + k) % IC; ibn = min(ibn + k, IC)

    steps = rnd = 0; t0 = time.time(); total_s = a.minutes * 60; last_eval = time.time() - a.eval_every * 60 + 90; best = -1.0
    loss_ema = iloss_ema = 0.0; stat = collections.Counter(); ep_len = collections.deque(maxlen=300); outcomes = collections.deque(maxlen=300)
    A.reset_one(0); [A.reset_one(i) or B.reset_one(i) for i in range(n)]
    while time.time() - t0 < total_s:
        if rnd % 200 == 0: rnnnet.HOLE_W = a.hole0 * max(0.0, 1.0 - (time.time() - t0) / (total_s * 0.6))
        # ---- 1. root: memory, state value
        A.gen(); B.gen(); r0 = combine(Round(A, dev), Round(B, dev), dev)
        hprev = torch.where(r0.first[:, None], torch.zeros_like(hprev), hprev); hprev = net.gru_step(r0.sumact, hprev).detach()
        xa, _ = A.bstate(B); xb, _ = B.bstate(A); X0 = torch.from_numpy(np.concatenate([xa, xb])).to(dev); root = X0[:, :NF]; ctx0 = ctx_of(X0)
        vmA, vmB = action_mask(A), action_mask(B); vm = torch.from_numpy(np.concatenate([vmA, vmB])).to(dev); has_item = vm.sum(1) > 1
        q0o = candidate_q_b(net, r0.x, r0.ids, r0.rew, r0.valid, r0.sumc, hprev, ctx0); q0t = candidate_q_b(tgt, r0.x, r0.ids, r0.rew, r0.valid, r0.sumc, hprev, ctx0)
        ystar0 = q0t.gather(1, q0o.argmax(1)[:, None]).squeeze(1)
        with torch.no_grad():
            adv_t = (tgt.item_adv(root, ctx0, hprev) * VSCALE).masked_fill(~vm, -1e9).max(1).values
        vstate = ystar0 + torch.clamp(adv_t, min=0.0)
        prev = age > 0
        if bool(prev.any()):
            pi = ((age - 1) % R)[prev]; pe = ar[prev]; RY[pi, pe] = vstate[prev]; RM[pi, pe] = True
        # ---- 2. item decision
        with torch.no_grad():
            adv_o = (net.item_adv(root, ctx0, hprev) * VSCALE).masked_fill(~vm, -1e9)
            ai = adv_o.argmax(1).cpu().numpy().astype(np.int32)
        ieps = max(a.ieps1, a.ieps0 + (a.ieps1 - a.ieps0) * steps / a.eps_steps)
        rnd_i = np.random.rand(N) < ieps
        if rnd_i.any():
            rl = np.concatenate([ruleA(xa, vmA), ruleB(xb, vmB)]); vmn = np.concatenate([vmA, vmB])
            rr = (np.random.rand(N, NA) * vmn).argmax(1).astype(np.int32)
            ai = np.where(rnd_i, np.where(np.random.rand(N) < 0.5, rl, rr), ai).astype(np.int32)
        ai = np.where(has_item.cpu().numpy(), ai, 0)
        A.buse(B, ai[:n]); B.buse(A, ai[n:])
        for k_ in np.nonzero(ai)[0][:0]: pass
        stat['items_used'] += int((ai > 0).sum()); stat['item_rows'] += int(has_item.sum().item()); stat['picked_k>0'] += int((ai > 2).sum()); stat['thrown'] += int(((ai > 0) & ((ai - 1) % 2 == 1)).sum())
        xa1, _ = A.bstate(B); xb1, _ = B.bstate(A); X1 = torch.from_numpy(np.concatenate([xa1, xb1])).to(dev); ctx1 = ctx_of(X1)
        # ---- 3. placement decision on the state after the items
        A.gen(); B.gen(); r2 = combine(Round(A, dev), Round(B, dev), dev)
        qo = candidate_q_b(net, r2.x, r2.ids, r2.rew, r2.valid, r2.sumc, hprev, ctx1); qt = candidate_q_b(tgt, r2.x, r2.ids, r2.rew, r2.valid, r2.sumc, hprev, ctx1)
        best_a = qo.argmax(1); ystar = qt.gather(1, best_a[:, None]).squeeze(1)
        # item sample: advantage target of the action that was taken
        ait = torch.from_numpy(ai).to(dev).long(); hi = has_item
        yadv = a.lam * 0 + (phi(X1, a.lam) - phi(X0, a.lam)) * (ait > 0).float() + (ystar - ystar0)
        if bool(hi.any()): add_items(root[hi], ctx0[hi], hprev[hi], ait[hi], yadv[hi].detach())
        eps = max(a.eps1, a.eps0 + (a.eps1 - a.eps0) * steps / a.eps_steps)
        rand_pick = torch.multinomial(r2.valid.float(), 1).squeeze(1)
        act = torch.where(torch.rand(N, device=dev) < eps, rand_pick, best_a)
        idx = age % R
        RX[idx, ar] = r2.x[ar, act]; RI[idx, ar] = r2.ids[ar, act]; RSC[idx, ar] = r2.sumc[ar, act]; RSA[idx, ar] = r0.sumact; RH[idx, ar] = hprev; RC[idx, ar] = ctx1
        RY[idx, ar] = 0.0; RM[idx, ar] = False
        act_np = act.cpu().numpy(); chosen_dead = torch.from_numpy(r2.chosen_dead(act_np)).to(dev)
        # ---- 4. both blocks are placed
        epA = A.step(act_np[:n], a.maxpieces).copy(); epB = B.step(act_np[n:], a.maxpieces).copy()
        steps += N; rnd += 1
        stA, stB = epA[:, 0], epB[:, 0]
        pair_done = (stA > 0) | (stB > 0)
        for i in np.nonzero(pair_done)[0]:
            ep_len.append(max(epA[i, 3], epB[i, 3])); outcomes.append(-1 if (stA[i] == 1 and stB[i] != 1) else (1 if (stB[i] == 1 and stA[i] != 1) else 0))
        status = torch.from_numpy(np.concatenate([stA, stB])).to(dev); ended = torch.from_numpy(np.concatenate([pair_done, pair_done])).to(dev)
        dead = status == 1
        if bool(ended.any()):
            pd = ended & dead & ~chosen_dead
            if bool(pd.any()): RY[idx[pd], ar[pd]] = DEATH; RM[idx[pd], ar[pd]] = True
            win = ended & ~dead & torch.from_numpy(np.concatenate([stB == 1, stA == 1])).to(dev)        # the other side died: this one outlasted it
            if bool(win.any()): RY[idx[win], ar[win]] = ystar[win] + a.winb; RM[idx[win], ar[win]] = True
            ee = ar[ended]; emit(ee, age[ee])
            age = torch.where(ended, torch.zeros_like(age), age); emitted = torch.where(ended, torch.zeros_like(emitted), emitted)
            for i in np.nonzero(pair_done)[0]: A.reset_one(i); B.reset_one(i)
        run = ~ended; ready = run & (age >= emitted + S)
        if bool(ready.any()):
            ee = ar[ready]; emit(ee, emitted[ee] + S - 1); emitted = torch.where(ready, emitted + S, emitted)
        age = torch.where(run, age + 1, age)
        # ---- learning
        if bn >= 600:
            for _ in range(a.updates):
                if a.per_alpha > 0:
                    pr = BP[:bn] ** a.per_alpha; ii = torch.multinomial(pr / pr.sum(), a.batch, replacement=True)
                    wis = (bn * (pr[ii] / pr.sum())) ** (-a.per_beta); wis = wis / wis.max()
                else:
                    ii = torch.randint(0, bn, (a.batch,), device=dev); wis = torch.ones(a.batch, device=dev)
                x = BX[ii].float(); ids = BI[ii]; sc = BSC[ii].float(); sa = BSA[ii].float(); cx = BCX[ii].float(); y = BY[ii] / VSCALE; m = BM[ii]
                hseq, _ = net.gru(sa, BH[ii][None].contiguous()); Bn = x.shape[0]
                hc = net.gru_step(sc.reshape(Bn * W, -1), hseq.reshape(Bn * W, -1))
                v = net.value(x.reshape(Bn * W, -1), ids.reshape(Bn * W, -1), hc, cx.reshape(Bn * W, -1)).reshape(Bn, W)
                per = Fn.smooth_l1_loss(v, y, reduction="none") * m.float()
                loss = (per.sum(1) / m.float().sum(1).clamp(min=1) * wis).mean()
                with torch.no_grad():
                    ae = (v - y).abs() * m.float(); pri = 0.9 * ae.max(1).values + 0.1 * ae.sum(1) / m.float().sum(1).clamp(min=1)
                    BP[ii] = pri + 1e-4; maxp = max(maxp * 0.999, float(pri.max()))
                il = torch.zeros((), device=dev)
                if ibn >= 2000:
                    jj = torch.randint(0, ibn, (256,), device=dev)
                    adv = net.item_adv(IX[jj].float(), ICX[jj].float(), IH[jj])
                    il = Fn.smooth_l1_loss(adv.gather(1, IA[jj][:, None]).squeeze(1), IY[jj] / VSCALE)
                tot = loss + 5.0 * il
                opt.zero_grad(set_to_none=True); tot.backward(); nn.utils.clip_grad_norm_(net.parameters(), 2.0); opt.step()
                if rnd % 10 == 0: loss_ema = 0.99 * loss_ema + 0.01 * loss.item(); iloss_ema = 0.99 * iloss_ema + 0.01 * float(il)
            with torch.no_grad():
                for pt, pn in zip(tgt.parameters(), net.parameters()): pt.lerp_(pn, a.tau)
        if rnd % 100 == 0:
            torch.save(net.state_dict(), out / "last.pt")
            fr = stat['items_used'] / max(1, stat['item_rows'])
            print(f"rnd {rnd} steps {steps/1e6:.2f}M t {(time.time()-t0)/60:.1f}m eps {eps:.3f} pairs_len {np.mean(ep_len) if ep_len else 0:.0f} wins A/B/draw {outcomes.count(1)}/{outcomes.count(-1)}/{outcomes.count(0)} "
                  f"loss {loss_ema:.4f} item_loss {iloss_ema:.5f} items: used {fr:.2f} of rows-with-items, k>0 {stat['picked_k>0']}, thrown {stat['thrown']}/{stat['items_used']}", flush=True)
            stat.clear()
        if time.time() - last_eval > a.eval_every * 60:
            last_eval = time.time(); net.eval()
            r = evaluate(net, base_net, dev, 96, a.item_scale, 500, base_reward=BaseReward(a.base_reward)); print("EVAL battle-net(A) vs solo-net + old rule(B):", r, flush=True)
            score = r["win"] - r["lose"]
            if score > best: best = score; torch.save(net.state_dict(), out / "best.pt")
            net.train()
    torch.save(net.state_dict(), out / "last.pt")


if __name__ == "__main__":
    main()
