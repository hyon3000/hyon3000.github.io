"""Warm start: the policy imitates the scripted 'dig the best column' player (with some random exploration), then PPO (train2d.py / train3d.py --resume) refines it."""
import argparse, os, sys, time, torch, torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ppo import Net
ap = argparse.ArgumentParser(); ap.add_argument("--mode", choices=["2d", "3d"], required=True); ap.add_argument("--samples", type=int, default=3000000); ap.add_argument("--out", required=True); ap.add_argument("--eval", action="store_true")
a = ap.parse_args()
if a.mode == "2d":
    from env2d import Env2D, OBS, NBINS; env = Env2D(2048, "cuda"); heads = [NBINS]; nh = 1
else:
    from env3d import Env3D, OBS, NB; env = Env3D(1024, "cuda"); heads = [NB, NB]; nh = 2
net = Net(OBS, heads).cuda()
opt = torch.optim.Adam(net.parameters(), lr=1e-3)
def expert_actions():
    x = env.expert()
    return x[:, None] if x.dim() == 1 else x
# collect
O, A = [], []
obs = env.obs(); n = 0; t0 = time.time()
stat = {"score": 0.0, "dead": 0.0, "behind": 0.0, "n": 0}
while n < a.samples:
    act = expert_actions()
    noisy = act.clone()
    rnd = torch.rand(act.shape[0], device="cuda") < 0.08                       # a little exploration so the states are diverse
    for k in range(nh):
        noisy[:, k] = torch.where(rnd, torch.randint(0, heads[k], (act.shape[0],), device="cuda"), act[:, k])
    O.append(obs); A.append(act)
    obs, r, d, info = env.step(noisy[:, 0] if nh == 1 else noisy)
    stat["score"] += info["score"].sum().item(); stat["dead"] += info["dead"].float().sum().item(); stat["behind"] += info["behind"].sum().item(); stat["n"] += act.shape[0]
    n += act.shape[0]
print(f"expert data: {n} samples in {time.time()-t0:.0f}s | expert play: score/decision {stat['score']/stat['n']:.3f}, deaths/1k {1000*stat['dead']/stat['n']:.2f}, behind {100*stat['behind']/stat['n']:.1f}%", flush=True)
O = torch.cat(O); A = torch.cat(A)
N_ = O.shape[0]
for ep in range(12):
    perm = torch.randperm(N_, device="cuda"); tot = 0; acc = 0
    for i in range(0, N_, 4096):
        ix = perm[i:i + 4096]
        logits, _ = net(O[ix])
        loss = sum(F.cross_entropy(l, A[ix][:, k]) for k, l in enumerate(logits))
        opt.zero_grad(); loss.backward(); opt.step(); tot += loss.item() * len(ix)
        acc += sum((l.argmax(-1) == A[ix][:, k]).float().sum().item() for k, l in enumerate(logits)) / nh
    print(f"epoch {ep} loss {tot/N_:.3f} accuracy {acc/N_:.3f}", flush=True)
torch.save(net.state_dict(), a.out)
