"""TD afterstate learning for 2048 on several board sizes at once (one size-independent conv net).
V(afterstate) ~ expected discounted sum of future merge rewards (reward of a merge = exponent of the new tile / 10).
Acting: argmax_a  r(s,a) + gamma * V_target(after(s,a)).   Target of the previous afterstate: max_a Q(s,a)  (0 if s is terminal).
usage: python3.12 train_2048.py --out runs/a --minutes 120
"""
import argparse, os, sys, time, math, random
import torch
import torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env2048 import all_moves, spawn, new_boards, spawn_count
from net2048 import Net

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="runs/a"); ap.add_argument("--minutes", type=float, default=60)
ap.add_argument("--resume", default=""); ap.add_argument("--gamma", type=float, default=0.99)
ap.add_argument("--lr", type=float, default=1e-3); ap.add_argument("--tau", type=float, default=0.01)
ap.add_argument("--ch", type=int, default=48); ap.add_argument("--layers", type=int, default=5)
ap.add_argument("--maxmoves", type=int, default=6000, help="episode cap (large boards practically never end)")
ap.add_argument("--seed", type=int, default=0)
ap.add_argument("--focus", action="store_true", help="mostly 4x4 (a few other sizes keep the net general)")
a = ap.parse_args()
torch.manual_seed(a.seed); random.seed(a.seed)
dev = "cuda"
os.makedirs(a.out, exist_ok=True)
RS = 0.1                                                            # reward scale: merge reward = new exponent * RS

# size groups: (H, W, envs, replay capacity, weight in the sampling)
GROUPS = [(4, 4, 1024, 600000), (6, 6, 256, 300000), (8, 8, 128, 200000), (3, 5, 128, 200000), (5, 5, 128, 200000), (2, 6, 64, 100000), (4, 8, 64, 100000), (3, 3, 64, 100000)]

if a.focus: GROUPS = [(4, 4, 3072, 1500000), (6, 6, 64, 120000), (5, 5, 64, 120000), (3, 5, 64, 100000), (8, 8, 32, 60000)]
net = Net(a.ch, a.layers).to(dev)
if a.resume: net.load_state_dict(torch.load(a.resume)["net"])
tgt = Net(a.ch, a.layers).to(dev); tgt.load_state_dict(net.state_dict())
opt = torch.optim.Adam(net.parameters(), lr=a.lr)


class Group:
    def __init__(s, H, W, n, cap):
        s.H, s.W, s.n, s.cap = H, W, n, cap
        s.b = new_boards(n, H, W, dev)                                   # current (post-spawn) boards
        s.prev = torch.zeros(n, H, W, dtype=torch.long, device=dev); s.has = torch.zeros(n, dtype=torch.bool, device=dev)
        s.rb = torch.zeros(cap, H, W, dtype=torch.long, device=dev); s.rt = torch.zeros(cap, device=dev); s.ptr = 0; s.size = 0
        s.moves = torch.zeros(n, dtype=torch.long, device=dev); s.ret = torch.zeros(n, device=dev)
        s.done_scores = []; s.done_max = []; s.done_len = []
        s.sp = spawn_count(H, W)

    def push(s, x, t):
        k = x.shape[0]
        idx = (s.ptr + torch.arange(k, device=dev)) % s.cap
        s.rb[idx] = x; s.rt[idx] = t; s.ptr = (s.ptr + k) % s.cap; s.size = min(s.cap, s.size + k)

    def step(s, eps):
        bs, re, sc, lg = all_moves(s.b)
        with torch.no_grad():
            v = tgt(bs.flatten(0, 1)).view(4, s.n)
        q = re * RS + a.gamma * v
        q = torch.where(lg, q, torch.full_like(q, -1e9))
        best, act = q.max(0)
        term = ~lg.any(0)
        # target of the previous afterstate
        tg = torch.where(term, torch.zeros_like(best), best)
        m = s.has
        if m.any(): s.push(s.prev[m], tg[m])
        # epsilon-greedy among legal moves
        rnd = torch.rand(s.n, 4, device=dev); rnd = torch.where(lg.t(), rnd, torch.full_like(rnd, -1.0))
        act = torch.where(torch.rand(s.n, device=dev) < eps, rnd.argmax(1), act)
        ar = torch.arange(s.n, device=dev)
        after = bs[act, ar]
        s.ret += torch.where(term, torch.zeros_like(sc[0]), sc[act, ar]); s.moves += 1
        s.prev = after; s.has = ~term
        nb = spawn(after.clone(), s.sp)
        # finished games (dead or capped) are replaced
        fin = term | (s.moves >= a.maxmoves)
        if fin.any():
            mx = s.b.flatten(1).amax(1)
            s.done_scores += s.ret[fin].tolist(); s.done_max += mx[fin].tolist(); s.done_len += s.moves[fin].tolist()
            k = int(fin.sum()); nb[fin] = new_boards(k, s.H, s.W, dev)
            s.has[fin] = False; s.moves[fin] = 0; s.ret[fin] = 0
        s.b = nb

    def sample(s, k):
        i = torch.randint(0, s.size, (k,), device=dev)
        x = s.rb[i]
        # random dihedral symmetry (the game is symmetric)
        if random.random() < 0.5: x = x.flip(-1)
        if random.random() < 0.5: x = x.flip(-2)
        if s.H == s.W and random.random() < 0.5: x = x.transpose(1, 2)
        return x, s.rt[i]


groups = [Group(*g) for g in GROUPS]
t0 = time.time(); total_s = a.minutes * 60; it = 0; upd = 0; steps = 0
best_score = -1; last_log = 0; loss_ema = 0
while time.time() - t0 < total_s:
    frac = (time.time() - t0) / total_s
    eps = max(0.01, 0.1 * (1 - frac * 2))
    for g in groups: g.step(eps)
    steps += sum(g.n for g in groups); it += 1
    if it % 2 == 0 and all(g.size > 5000 for g in groups):
        lr = a.lr * (0.5 * (1 + math.cos(math.pi * min(1.0, frac))) * 0.95 + 0.05)
        for pg in opt.param_groups: pg["lr"] = lr
        loss = 0
        for g in groups:
            x, t = g.sample((2048 if a.focus else 768) if g.H * g.W <= 16 else 256)
            loss = loss + F.smooth_l1_loss(net(x), t)
        opt.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(net.parameters(), 5.0); opt.step(); upd += 1
        loss_ema = 0.99 * loss_ema + 0.01 * loss.item() if upd % 10 == 0 else loss_ema
        with torch.no_grad():
            for pt, p in zip(tgt.parameters(), net.parameters()): pt.mul_(1 - a.tau).add_(p, alpha=a.tau)
    if time.time() - last_log > 60:
        last_log = time.time()
        line = f"t {(time.time()-t0)/60:6.1f}m it {it} upd {upd} steps {steps/1e6:6.1f}M eps {eps:.3f} loss {loss_ema:.4f} |"
        stat = {}
        for g in groups:
            if g.done_scores:
                n = len(g.done_scores); sc = sum(g.done_scores[-200:]) / min(200, n); mx = sorted(g.done_max[-200:])[len(g.done_max[-200:]) // 2]
                ln = sum(g.done_len[-200:]) / min(200, n)
                line += f" {g.H}x{g.W}: sc {sc:8.0f} max 2^{int(mx)} len {ln:6.0f}"
                stat[(g.H, g.W)] = sc
            g.done_scores = g.done_scores[-400:]; g.done_max = g.done_max[-400:]; g.done_len = g.done_len[-400:]
        print(line, flush=True)
        torch.save({"net": net.state_dict(), "ch": a.ch, "layers": a.layers}, f"{a.out}/last.pt")
        s44 = stat.get((4, 4), -1)
        if s44 > best_score: best_score = s44; torch.save({"net": net.state_dict(), "ch": a.ch, "layers": a.layers}, f"{a.out}/best.pt")
torch.save({"net": net.state_dict(), "ch": a.ch, "layers": a.layers}, f"{a.out}/last.pt")
print("done", flush=True)
