import time, sys, numpy as np
from simlib import VecEnv, MAXC, NF
items = "--noitems" not in sys.argv
env = VecEnv(256, 1, items=items)
rng = np.random.default_rng(0)
t = time.time(); steps = 0; pieces=[]; scores=[]; cnts=[]
for it in range(200):
    env.gen()
    cnts += list(env.counts)
    act = (rng.random(env.n) * env.counts).astype(np.int32)
    ep = env.step(act)
    steps += env.n
    for e in ep:
        if e[0]: pieces.append(e[3]); scores.append(e[1])
dt = time.time() - t
print("items" if items else "noitems", "steps/s", steps/dt, "avg cands", np.mean(cnts), "max", max(cnts), "random ep len", np.mean(pieces), "score", np.mean(scores))
