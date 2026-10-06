"""How long does the AI take per piece at each level, and how far does a piece fall while it plays?"""
import numpy as np, torch
from simlib import VecEnv
from rnnnet import RNet, GreedyAgent
import os
dev = torch.device("cuda")
net = RNet().to(dev); net.load_state_dict(torch.load("runs/e1/chk60.pt")); net.eval()
os.environ.setdefault("REWARD", "survival")
N = 48; env = VecEnv(N, 21, items=True); ag = GreedyAgent(net, N, dev)
prev_f = np.array([env.summary(i)[8] for i in range(N)]); acc = {}
GRAV = [800, 717, 633, 550, 467, 383, 300, 217]
for t in range(900):
    act = ag.act(env)
    lv = np.array([env.summary(i)[2] for i in range(N)])
    n_inputs = 1 + env.info[np.arange(N), act, 0] + env.info[np.arange(N), act, 1] + np.abs(env.info[np.arange(N), act, 2])
    env.step(act)
    f = np.array([env.summary(i)[8] for i in range(N)])
    d = f - prev_f; prev_f = f
    for i in range(N):
        if 0 < d[i] < 5000 and not env.first[i] if False else 0 < d[i] < 5000:
            acc.setdefault(int(lv[i]), []).append((d[i], n_inputs[i]))
print("level | ms per piece (AI) | inputs per piece | gravity ms/row | rows a piece falls while the AI plays it")
for l in sorted(acc):
    a = np.array(acc[l]); g = GRAV[min(l - 1, 7)]
    if len(a) < 50: continue
    print(f" {l:>4} | {a[:,0].mean():>8.0f} ms        | {a[:,1].mean():>6.1f}           | {g:>6}         | {a[:,1].mean()*200/g:>4.1f}   ({len(a)} pieces)")
