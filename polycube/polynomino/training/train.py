"""n-step afterstate Double-DQN for Polynomino (items, real-time inputs, blind/hide-next observation cuts).

Q(c) = r(c) + gamma * V(afterstate_c). V is an MLP over dense features plus a learned embedding of every item
(type, cell) on the board and of the items in the upcoming/held piece, so each item type is told apart.
Targets are n-step returns bootstrapped with a Polyak-averaged target network (double-DQN action selection).
Item frequency is annealed from `--item_scale0`x to 1x so the agent meets many items early on.
"""
import argparse, collections, pathlib, time
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as Fn
from simlib import VecEnv, NF, KIDS, NIDS, MAXC

HERE = pathlib.Path(__file__).parent
VSCALE = 100.0
GAMMA = 0.997
DEATH = -10.0
R_BOOM = 0.0   # no item-specific reward shaping: the value net has to foresee item consequences itself
R_GARB = 0.0


class ValueNet(nn.Module):
    def __init__(self, hidden=(256, 256, 128)):
        super().__init__()
        self.dense = nn.Linear(NF, hidden[0])                       # includes the bias
        self.emb = nn.EmbeddingBag(NIDS + 1, hidden[0], mode="sum", padding_idx=NIDS)
        nn.init.normal_(self.emb.weight, 0, 0.05)
        with torch.no_grad(): self.emb.weight[NIDS].zero_()
        layers, d = [], hidden[0]
        for h in hidden[1:]:
            layers += [nn.Linear(d, h), nn.ReLU()]; d = h
        layers += [nn.Linear(d, 1)]
        self.mlp = nn.Sequential(*layers)

    def forward(self, x, ids):
        ids = ids.long(); ids = torch.where(ids < 0, torch.full_like(ids, NIDS), ids)
        h = torch.relu(self.dense(x) + self.emb(ids))
        return self.mlp(h).squeeze(-1)


def reward_of(lines, done, ev):
    r = 1.0 + 2.0 * lines * lines - R_BOOM * ev[..., 0] - R_GARB * ev[..., 1]
    return np.where(done > 0, DEATH, r).astype(np.float32)


@torch.no_grad()
def q_values(net, x, ids, rew, valid):
    B, C = x.shape[:2]
    v = net(x.reshape(B * C, -1), ids.reshape(B * C, -1)).reshape(B, C) * VSCALE
    return (rew + GAMMA * v).masked_fill(~valid, -1e9)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--envs", type=int, default=512)
    ap.add_argument("--minutes", type=float, default=60)
    ap.add_argument("--maxpieces", type=int, default=3000)
    ap.add_argument("--batch", type=int, default=1024)
    ap.add_argument("--updates", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--tau", type=float, default=0.01)
    ap.add_argument("--nstep", type=int, default=1)  # n>1 stalled learning in tests (see README)
    ap.add_argument("--gamma", type=float, default=GAMMA)
    ap.add_argument("--eps0", type=float, default=0.2)
    ap.add_argument("--eps1", type=float, default=0.01)
    ap.add_argument("--eps_steps", type=float, default=3e6)
    ap.add_argument("--item_scale0", type=float, default=1.0)
    ap.add_argument("--anneal_frac", type=float, default=0.6)
    ap.add_argument("--buffer", type=int, default=500_000)
    ap.add_argument("--out", default="runs/v3")
    ap.add_argument("--resume", default="")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--noitems", action="store_true")
    ap.add_argument("--boost", default="bombs:2,plines:3,obstacles:5,shuffle:2.5,gap:4,size:1.5",
                    help="start frequency multiplier per item group, annealed to 1 (groups: bombs plines obstacles shuffle timing size minus range clear gap score mono)")
    a = ap.parse_args()
    globals()["GAMMA"] = a.gamma

    out = HERE / a.out; out.mkdir(parents=True, exist_ok=True)
    dev = torch.device("cuda")
    torch.manual_seed(a.seed)
    net = ValueNet().to(dev); tgt = ValueNet().to(dev)
    if a.resume:
        sd = torch.load(a.resume)
        w = sd["dense.weight"]
        if w.shape[1] < NF:  # warm start from a model with fewer inputs: the new inputs (event memory) start at zero weight
            sd["dense.weight"] = torch.cat([w, torch.zeros(w.shape[0], NF - w.shape[1], device=w.device)], 1)
        net.load_state_dict(sd)
    tgt.load_state_dict(net.state_dict())
    opt = torch.optim.Adam(net.parameters(), lr=a.lr)

    env = VecEnv(a.envs, a.seed + 1, items=not a.noitems)
    N, n = a.envs, a.nstep
    bx = torch.zeros(a.buffer, NF, device=dev); bi = torch.full((a.buffer, KIDS), -1, dtype=torch.int16, device=dev)
    by = torch.zeros(a.buffer, device=dev)
    bn = bp = 0
    # window of the last n chosen afterstates per env
    WX = torch.zeros(n, N, NF, device=dev); WI = torch.full((n, N, KIDS), -1, dtype=torch.int16, device=dev)
    WR = torch.zeros(n, N, device=dev)
    age = torch.zeros(N, dtype=torch.long, device=dev)
    ar = torch.arange(N, device=dev)

    def add_samples(xs, is_, ys):
        nonlocal bn, bp
        k = xs.shape[0]
        if k == 0: return
        if k > a.buffer: xs, is_, ys, k = xs[-a.buffer:], is_[-a.buffer:], ys[-a.buffer:], a.buffer
        pos = (torch.arange(k, device=dev) + bp) % a.buffer
        bx[pos] = xs; bi[pos] = is_; by[pos] = ys / VSCALE
        bp = (bp + k) % a.buffer; bn = min(bn + k, a.buffer)

    ep_pieces = collections.deque(maxlen=300); ep_lines = collections.deque(maxlen=300); ep_score = collections.deque(maxlen=300)
    ep_trunc = collections.deque(maxlen=300)
    GROUP_IDX = {"bombs": 0, "plines": 1, "obstacles": 2, "shuffle": 3, "timing": 4, "size": 5, "minus": 6, "range": 7, "clear": 8, "gap": 9, "score": 10, "mono": 11}
    boost0 = np.ones(12)
    for kv in filter(None, a.boost.split(",")):
        k, v = kv.split(":"); boost0[GROUP_IDX[k]] = float(v)
    steps = rnd = 0; t0 = time.time(); best = -1; loss_ema = 0.0; scale = a.item_scale0
    total_s = a.minutes * 60
    while time.time() - t0 < total_s:
        if rnd % 200 == 0 and not a.noitems:   # item exposure curriculum
            frac = min(1.0, (time.time() - t0) / (total_s * a.anneal_frac))
            scale = a.item_scale0 + (1.0 - a.item_scale0) * frac
            env.set_item_scale(scale)
            env.set_group_scale(1.0 + (boost0 - 1.0) * (1.0 - frac))
        env.gen()
        cmax = int(env.counts.max())
        x = torch.from_numpy(env.feats[:, :cmax]).to(dev)
        ids = torch.from_numpy(env.ids[:, :cmax]).to(dev)
        rew = torch.from_numpy(reward_of(env.lines[:, :cmax], env.done[:, :cmax], env.ev[:, :cmax])).to(dev)
        idx = torch.arange(cmax, device=dev)[None]
        inrange = idx < torch.from_numpy(env.counts).to(dev)[:, None]
        dn = torch.from_numpy(env.done[:, :cmax]).to(dev) > 0
        alive = inrange & ~dn
        valid = torch.where(alive.any(1, keepdim=True), alive, inrange)  # forced death: any candidate

        qo = q_values(net, x, ids, rew, valid)
        qt = q_values(tgt, x, ids, rew, valid)
        best_a = qo.argmax(1)
        ystar = qt.gather(1, best_a[:, None]).squeeze(1)

        # n-step bootstrap target for the oldest entry of every full window:
        # V(x_{t-n}) = sum_{k=1}^{n-1} g^{k-1} r_{t-n+k} + g^{n-1} maxQ(s_t)
        full = age >= n
        if bool(full.any()):
            oldest = rnd % n
            y = ystar.clone() * (GAMMA ** (n - 1))
            for k in range(1, n):
                y = y + (GAMMA ** (k - 1)) * WR[(rnd - n + k) % n]
            add_samples(WX[oldest][full], WI[oldest][full], y[full])

        # action selection (epsilon-greedy over valid candidates)
        eps = max(a.eps1, a.eps0 + (a.eps1 - a.eps0) * steps / a.eps_steps)
        rand_pick = torch.multinomial(valid.float(), 1).squeeze(1)
        explore = torch.rand(N, device=dev) < eps
        act = torch.where(explore, rand_pick, best_a)
        slot = rnd % n
        WX[slot] = x[ar, act]; WI[slot] = ids[ar, act]; WR[slot] = rew[ar, act]
        age = torch.clamp(age + 1, max=n)
        act_np = act.cpu().numpy()
        chosen_done = env.done[np.arange(N), act_np] > 0

        ep = env.step(act_np, a.maxpieces)
        steps += N
        status = torch.from_numpy(ep[:, 0].copy()).to(dev)
        for i in np.nonzero(ep[:, 0] > 0)[0]:
            ep_pieces.append(ep[i, 3]); ep_lines.append(ep[i, 2]); ep_score.append(ep[i, 1]); ep_trunc.append(ep[i, 0] == 2)

        # death: flush the window backwards. A chosen afterstate that was predicted alive but really died gets DEATH.
        dead = status == 1
        if bool(dead.any()):
            cd = torch.from_numpy(chosen_done).to(dev)
            pend_dead = dead & ~cd
            yprev = torch.where(pend_dead, torch.full((N,), DEATH, device=dev), torch.zeros(N, device=dev))
            xs, is_, ys = [], [], []
            if bool(pend_dead.any()):
                xs.append(WX[slot][pend_dead]); is_.append(WI[slot][pend_dead]); ys.append(yprev[pend_dead])
            for m in range(1, n):
                r_next = WR[(rnd - m + 1) % n]          # reward of the transition out of x_{t-m}
                yprev = r_next + GAMMA * yprev
                mk = dead & (age > m)
                if bool(mk.any()):
                    sl = (rnd - m) % n
                    xs.append(WX[sl][mk]); is_.append(WI[sl][mk]); ys.append(yprev[mk])
            if xs: add_samples(torch.cat(xs), torch.cat(is_), torch.cat(ys))
        age = torch.where(status > 0, torch.zeros_like(age), age)   # dead or truncated: start a new chain
        rnd += 1

        # learning
        if bn >= 20000:
            for _ in range(a.updates):
                ii = torch.randint(0, bn, (a.batch,), device=dev)
                pred = net(bx[ii], bi[ii])
                loss = Fn.smooth_l1_loss(pred, by[ii])
                opt.zero_grad(set_to_none=True); loss.backward()
                nn.utils.clip_grad_norm_(net.parameters(), 5.0)
                opt.step()
                if rnd % 10 == 0: loss_ema = 0.99 * loss_ema + 0.01 * loss.item()
            with torch.no_grad():
                for pt, pn in zip(tgt.parameters(), net.parameters()):
                    pt.lerp_(pn, a.tau)

        if rnd % 100 == 0 and ep_pieces:
            mp = float(np.mean(ep_pieces))
            print(f"rnd {rnd} steps {steps/1e6:.2f}M eps {eps:.3f} itemx {scale:.2f} t {(time.time()-t0)/60:.1f}m "
                  f"pieces {mp:.0f} lines {np.mean(ep_lines):.0f} score {np.mean(ep_score):.0f} "
                  f"trunc {np.mean(ep_trunc):.2f} loss {loss_ema:.4f}", flush=True)
            torch.save(net.state_dict(), out / "last.pt")
            if scale <= 1.0001 and mp > best and steps > 1e6:
                best = mp; torch.save(net.state_dict(), out / "best.pt")
    torch.save(net.state_dict(), out / "last.pt")


if __name__ == "__main__":
    main()
