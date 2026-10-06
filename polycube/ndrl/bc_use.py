"""Behaviour cloning of the old rule (helpful items on myself, the rest on the opponent) as the starting point of the item-use net."""
import argparse, numpy as np, torch, torch.nn.functional as Fn, time
from duel_nd import *
ap = argparse.ArgumentParser(); ap.add_argument("--placement", required=True); ap.add_argument("--n", type=int, default=96); ap.add_argument("--rounds", type=int, default=500)
ap.add_argument("--item_scale", type=int, default=8); ap.add_argument("--maxdec", type=int, default=500); ap.add_argument("--out", default="runs/duel3/bc.pt"); ap.add_argument("--scale", type=float, default=0.2); a = ap.parse_args()
dev = torch.device("cuda"); duel = Duel(a.n, a.placement, dev, seed=5, item_scale=a.item_scale, maxdec=a.maxdec); duel.reset_done(np.ones(a.n, bool))
X, Y = [], []; t0 = time.time()
def recorder(env, eps):
    rule = pol_rule(env)
    def f(x, v):
        m = rule(x, v); idx = v.sum(1) > 1
        if idx.any(): X.append(x[idx]); Y.append(m[idx].astype(np.int64))
        r = np.random.rand(len(x)) < eps; m = m.copy()
        if r.any(): m[r] = pol_random(x[r], v[r])          # some exploration: states reached by other choices too
        return m
    return f
pa, pb = recorder(duel.A, 0.15), recorder(duel.B, 0.15)
for k in range(a.rounds):
    r = duel.round(pa, pb); duel.reset_done(r['done'])
X = torch.from_numpy(np.concatenate(X)).to(dev); Y = torch.from_numpy(np.concatenate(Y)).to(dev)
print("collected", len(X), "states in", round(time.time() - t0), "s; label shares", [round(float((Y == k).float().mean()), 3) for k in range(NA)], flush=True)
net = UseNet().to(dev); opt = torch.optim.Adam(net.parameters(), lr=1e-3)
perm = torch.randperm(len(X), device=dev); ntr = int(len(X) * 0.9); tr, va = perm[:ntr], perm[ntr:]
for ep in range(30):
    p = tr[torch.randperm(len(tr), device=dev)]
    for i in range(0, len(p), 512):
        b = p[i:i + 512]; loss = Fn.cross_entropy(net(X[b]), Y[b]); opt.zero_grad(); loss.backward(); opt.step()
    with torch.no_grad(): acc = (net(X[va]).argmax(1) == Y[va]).float().mean().item()
    if ep % 5 == 4: print(f"epoch {ep+1} val accuracy {acc:.3f}", flush=True)
# logits -> small Q-values: the rule's choice starts out best, the RL then refines it
with torch.no_grad(): net.f[-1].weight.mul_(a.scale); net.f[-1].bias.mul_(a.scale)
torch.save(net.state_dict(), a.out); print("saved", a.out)
