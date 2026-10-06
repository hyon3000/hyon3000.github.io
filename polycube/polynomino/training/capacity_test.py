"""Is the value network too small?  Fit the true return-to-go of states visited by the current agent with MLPs of growing width and
compare the error on held-out games."""
import numpy as np, torch, torch.nn as nn, torch.nn.functional as Fn, time
from simlib import VecEnv, NF, KIDS, NIDS
from rnnnet import RNet, GreedyAgent, GAMMA, VSCALE
dev = torch.device("cuda")
net = RNet().to(dev); net.load_state_dict(torch.load("runs/h1/chk_final.pt")); net.eval()
N, T = 256, 2600
env = VecEnv(N, 77, items=True); ag = GreedyAgent(net, N, dev)
X = np.zeros((T, N, NF), np.float16); I = np.full((T, N, KIDS), -1, np.int16); Rw = np.zeros((T, N), np.float32)
term = np.zeros((T, N), bool); ep_id = np.zeros((T, N), np.int32); cur = np.arange(N, dtype=np.int32); nxt = N
t0 = time.time()
for t in range(T):
    act = ag.act(env)
    ar = np.arange(N)
    X[t] = env.feats[ar, act]; I[t] = env.ids[ar, act]
    from rnnnet import reward_of
    Rw[t] = reward_of(env.lines[ar, act], env.done[ar, act], env.gain[ar, act])
    ep_id[t] = cur
    ep = env.step(act, 3000)
    for i in np.nonzero(ep[:, 0] > 0)[0]:
        term[t, i] = ep[i, 0] == 1; cur[i] = nxt; nxt += 1
print(f"collected {T*N} decisions in {time.time()-t0:.0f}s, {nxt-N} finished games")
# discounted return-to-go inside each game (games cut off at the end of collection are dropped for their last 600 decisions)
G = np.zeros((T, N), np.float32); ok = np.ones((T, N), bool)
for i in range(N):
    g = 0.0; carry_ok = False
    for t in range(T - 1, -1, -1):
        if t + 1 < T and ep_id[t + 1, i] != ep_id[t, i]: g = 0.0; carry_ok = True        # t is the last step of its game
        g = Rw[t, i] + GAMMA * g
        G[t, i] = g
    # unfinished tail game: its returns are truncated -> drop its last 600 steps
    last_ep = ep_id[T - 1, i]
    for t in range(T - 1, -1, -1):
        if ep_id[t, i] != last_ep or T - 1 - t >= 600: break
        ok[t, i] = False
# split by env (held-out games = held-out envs)
tr_env = np.arange(N) < int(N * 0.8)
def flat(mask_env):
    m = ok & mask_env[None, :]
    return X[m], I[m], G[m]
Xtr, Itr, Gtr = flat(tr_env); Xva, Iva, Gva = flat(~tr_env)
print("train", len(Gtr), "val", len(Gva), "| return-to-go mean %.0f std %.0f" % (Gtr.mean(), Gtr.std()))
Xtr, Itr, Gtr, Xva, Iva, Gva = [torch.from_numpy(a).to(dev) for a in (Xtr, Itr, Gtr, Xva, Iva, Gva)]
class MLP(nn.Module):
    def __init__(s, w):
        super().__init__(); s.d = nn.Linear(NF, w); s.e = nn.EmbeddingBag(NIDS + 1, w, mode="sum", padding_idx=NIDS)
        s.m = nn.Sequential(nn.ReLU(), nn.Linear(w, w), nn.ReLU(), nn.Linear(w, w // 2), nn.ReLU(), nn.Linear(w // 2, 1))
    def forward(s, x, ids):
        ids = ids.long(); ids = torch.where(ids < 0, torch.full_like(ids, NIDS), ids)
        return s.m(s.d(x.float()) + s.e(ids)).squeeze(-1)
def evaluate(m):
    m.eval(); e = []
    with torch.no_grad():
        for i in range(0, len(Gva), 20000): e.append(((m(Xva[i:i+20000], Iva[i:i+20000]) * VSCALE - Gva[i:i+20000]) ** 2))
    m.train(); return float(torch.cat(e).mean().sqrt())
print("width |  params | train RMSE | held-out RMSE  (null model = std of the return)")
print("  -   |       - |          - | %.1f" % float(Gva.std()))
for w in (64, 128, 256, 512, 1024):
    torch.manual_seed(0); m = MLP(w).to(dev); opt = torch.optim.Adam(m.parameters(), lr=1e-3)
    n = len(Gtr); steps = 6000; sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, steps)
    for it in range(steps):
        ii = torch.randint(0, n, (4096,), device=dev)
        loss = Fn.smooth_l1_loss(m(Xtr[ii], Itr[ii]), Gtr[ii] / VSCALE)
        opt.zero_grad(set_to_none=True); loss.backward(); opt.step(); sched.step()
    with torch.no_grad():
        tr_e = float(((m(Xtr[:100000], Itr[:100000]) * VSCALE - Gtr[:100000]) ** 2).mean().sqrt())
    print(f" {w:>4} | {sum(p.numel() for p in m.parameters())/1e6:>5.1f}M | {tr_e:>10.1f} | {evaluate(m):>10.1f}", flush=True)
