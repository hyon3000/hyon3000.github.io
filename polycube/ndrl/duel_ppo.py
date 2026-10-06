"""PPO for the item-use decision in battle mode (3D / 4D), started from the behaviour-cloned rule. Self-play: both players use the same net.
Reward: +1 outlast the opponent / -1 die first, plus potential-based shaping on the visible height difference."""
import argparse, os, time, collections, numpy as np, torch, torch.nn as nn, torch.nn.functional as Fn
from duel_nd import Duel, UseNet, pol_rule, evaluate, NF, VIEWD, BSD, NA


class Policy(nn.Module):
    """same layers as UseNet (so the exported file is identical): trunk f[0..3] + logits f[4]; extra value head"""
    def __init__(self, d=BSD, h=256):
        super().__init__()
        self.f = nn.Sequential(nn.Linear(d, h), nn.ReLU(), nn.Linear(h, h), nn.ReLU(), nn.Linear(h, NA))
        self.v = nn.Sequential(nn.Linear(d, 128), nn.ReLU(), nn.Linear(128, 1))
    def forward(self, x): return self.f(x), self.v(x).squeeze(-1)


def phi(x): return np.clip(0.6 * (x[:, NF] - x[:, NF + VIEWD]), -1, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--placement", required=True); ap.add_argument("--init", default=""); ap.add_argument("--out", default="runs/ppo3"); ap.add_argument("--n", type=int, default=96)
    ap.add_argument("--minutes", type=float, default=120); ap.add_argument("--item_scale", type=int, default=8); ap.add_argument("--maxdec", type=int, default=500)
    ap.add_argument("--R", type=int, default=48); ap.add_argument("--lr", type=float, default=1e-4); ap.add_argument("--ent", type=float, default=0.01); ap.add_argument("--eval_every", type=float, default=8); ap.add_argument("--soft", type=float, default=0.15)
    a = ap.parse_args()
    dev = torch.device("cuda"); os.makedirs(a.out, exist_ok=True)
    duel = Duel(a.n, a.placement, dev, seed=11, item_scale=a.item_scale, maxdec=a.maxdec)
    ev = Duel(a.n, a.placement, dev, seed=77, item_scale=a.item_scale, maxdec=a.maxdec)
    net = Policy().to(dev)
    if a.init:
        sd = torch.load(a.init, map_location=dev); net.f.load_state_dict({k[2:]: v for k, v in sd.items() if k.startswith("f.")}); net.f[-1].weight.data.mul_(a.soft); net.f[-1].bias.data.mul_(a.soft); print("init from", a.init, "(logits softened by", a.soft, ")")
    opt = torch.optim.Adam(net.parameters(), lr=a.lr)
    use_greedy = UseNet().to(dev)
    def greedy_pol(x, v):
        with torch.no_grad(): return net(torch.from_numpy(x).to(dev))[0].masked_fill(~torch.from_numpy(v).to(dev), -1e9).argmax(1).cpu().numpy().astype(np.int32)
    duel.reset_done(np.ones(a.n, bool)); gamma, lam = 0.99, 0.95; t0 = time.time(); last_eval = time.time() - a.eval_every * 60 + 60; it = 0
    while time.time() - t0 < a.minutes * 60:
        # ---- rollout of R+1 rounds (the last one only gives the bootstrap state)
        rec = {s: collections.defaultdict(list) for s in 'AB'}
        for k in range(a.R + 1):
            store = {}
            def pol(side):
                def f(x, vm):
                    with torch.no_grad():
                        lg, v = net(torch.from_numpy(x).to(dev)); lg = lg.masked_fill(~torch.from_numpy(vm).to(dev), -1e9)
                        dist = torch.distributions.Categorical(logits=lg); act = dist.sample()
                        store[side] = (x, vm, act.cpu().numpy().astype(np.int32), dist.log_prob(act).cpu().numpy(), v.cpu().numpy())
                    return store[side][2]
                return f
            r = duel.round(pol('A'), pol('B'))
            for side, win in (('A', r['win']), ('B', -r['win'])):
                x, vm, act, lp, v = store[side]; d = rec[side]; qn = (vm.sum(1) > 1)       # a real choice exists (an item is held)
                d['x'].append(x); d['qn'].append(qn.copy()); d['mk'].append(vm.copy()); d['a'].append(np.where(qn, act, 0)); d['lp'].append(lp); d['v'].append(v)
                d['done'].append(r['done'].copy()); d['term'].append(np.where(r['done'], win, 0).astype(np.float32))
            duel.reset_done(r['done'])
        # ---- GAE per side
        X, A_, LP, ADV, RET, MASK, MK = [], [], [], [], [], [], []
        for side in 'AB':
            d = rec[side]; R = a.R
            x = np.stack(d['x']); v = np.stack(d['v']); done = np.stack(d['done']).astype(np.float32); term = np.stack(d['term'])
            ph = np.stack([phi(x[t]) for t in range(R + 1)])
            rew = np.where(done[:R] > 0, term[:R] - ph[:R], gamma * ph[1:] - ph[:R])
            adv = np.zeros((R, a.n), np.float32); last = np.zeros(a.n, np.float32)
            for t in reversed(range(R)):
                nv = v[t + 1]; delta = rew[t] + gamma * (1 - done[t]) * nv - v[t]
                last = delta + gamma * lam * (1 - done[t]) * last; adv[t] = last
            ret = adv + v[:R]
            X.append(x[:R].reshape(-1, BSD)); A_.append(np.stack(d['a'])[:R].reshape(-1)); LP.append(np.stack(d['lp'])[:R].reshape(-1))
            ADV.append(adv.reshape(-1)); RET.append(ret.reshape(-1)); MASK.append((np.stack(d['qn'])[:R] > 0).reshape(-1)); MK.append(np.stack(d['mk'])[:R].reshape(-1, NA))
        X = torch.from_numpy(np.concatenate(X)).to(dev); A_ = torch.from_numpy(np.concatenate(A_)).long().to(dev); LP = torch.from_numpy(np.concatenate(LP)).to(dev)
        ADV = torch.from_numpy(np.concatenate(ADV)).to(dev); RET = torch.from_numpy(np.concatenate(RET)).to(dev); MASK = torch.from_numpy(np.concatenate(MASK)).to(dev); MKt = torch.from_numpy(np.concatenate(MK)).to(dev)
        advn = (ADV - ADV[MASK].mean()) / (ADV[MASK].std() + 1e-6) if MASK.any() else ADV
        for ep in range(4):
            perm = torch.randperm(len(X), device=dev)
            for i in range(0, len(X), 2048):
                b = perm[i:i + 2048]; lg, v = net(X[b]); lg = lg.masked_fill(~MKt[b], -1e9); dist = torch.distributions.Categorical(logits=lg)
                ratio = torch.exp(dist.log_prob(A_[b]) - LP[b]); m = MASK[b].float()
                pl = -(torch.min(ratio * advn[b], torch.clamp(ratio, 0.8, 1.2) * advn[b]) * m).sum() / m.sum().clamp(min=1)
                vl = Fn.mse_loss(v, RET[b]); el = (dist.entropy() * m).sum() / m.sum().clamp(min=1)
                loss = pl + 0.5 * vl - a.ent * el; opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(), 1.0); opt.step()
        it += 1
        if it % 5 == 0: print(f"iter {it} t {(time.time()-t0)/60:.1f}m policy {pl.item():.4f} value {vl.item():.4f} entropy {el.item():.3f} decisions {int(MASK.sum())}", flush=True)
        if time.time() - last_eval > a.eval_every * 60:
            last_eval = time.time()
            r1 = evaluate(ev, greedy_pol, pol_rule(ev.B), 60); print("EVAL learned(A) vs rule(B):", r1, flush=True)
            torch.save({"f." + k[2:] if False else k: v for k, v in net.state_dict().items()}, os.path.join(a.out, "policy.pt"))
    torch.save(net.state_dict(), os.path.join(a.out, "policy.pt"))


if __name__ == "__main__":
    main()
