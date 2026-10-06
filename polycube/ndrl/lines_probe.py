import sys, numpy as np, torch
from simnd import VecEnv, DIM, MAXC
from rnnnet import RNet, GreedyAgent
ck = sys.argv[1]; N = 32; P = 300
dev = torch.device("cuda"); net = RNet().to(dev); net.load_state_dict(torch.load(ck)); net.eval()
def run(policy):
    env = VecEnv(N, 7); ag = GreedyAgent(net, N, dev); rng = np.random.default_rng(0); tl = np.zeros(N); ts = np.zeros(N); hs = []; pcs = np.zeros(N)
    for t in range(P):
        if policy == "model": act = ag.act(env)
        else:
            env.gen(); live = (np.arange(MAXC)[None] < env.counts[:, None]) & (env.done == 0)
            act = np.array([rng.choice(np.nonzero(live[i])[0]) if live[i].any() else 0 for i in range(N)], np.int32)
        hs.append(env.rootmaxh.mean()); ep = env.step(act, 10**6)
    # cumulative lines/score of unfinished games = last ep values
    return ep[:, 2].mean(), ep[:, 1].mean(), float(np.mean(hs)), (ep[:, 0] > 0).mean()
for pol in ("random", "model"):
    l, s, h, d = run(pol); print(f"DIM {DIM} {pol}: lines/piece {l/P:.3f}  score/piece {s/P:.1f}  mean stack height {h:.1f}  (games ended in window {d:.2f})")
