import sys, time, numpy as np
from simnd import *
n = int(sys.argv[1]) if len(sys.argv) > 1 else 32
env = VecEnv(n, 1)
print("DIM", DIM, "NF", NF, "MAXC", MAXC, "NIDS", NIDS)
rng = np.random.default_rng(0)
t0 = time.time(); steps = 0; cc = []; ends = []
for it in range(int(sys.argv[2]) if len(sys.argv) > 2 else 200):
    env.gen(); cc.append(env.counts.mean())
    live = (np.arange(MAXC)[None] < env.counts[:, None]) & (env.done == 0)
    # random alive candidate
    act = np.array([rng.choice(np.nonzero(live[i])[0]) if live[i].any() else 0 for i in range(n)], np.int32)
    ep = env.step(act, 3000); steps += n
    for e in ep:
        if e[0] > 0: ends.append(e.copy())
dt = time.time() - t0
print(f"{steps/dt:.0f} decisions/s; mean cands {np.mean(cc):.0f} max {max(cc):.0f}; games ended {len(ends)}")
if ends: E = np.array(ends); print("mean pieces", E[:,3].mean(), "mean lines", E[:,2].mean(), "score", E[:,1].mean())
