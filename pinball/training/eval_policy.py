"""evaluate on full games (3 balls) in the virtual-clock harness: python3.12 eval_policy.py --ckpt runs/p1/best.pt --games 24 [--random] [--sample]"""
import argparse, os, sys, json, time
import numpy as np, torch
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pbenv import Env, NACT
ap = argparse.ArgumentParser(); ap.add_argument('--ckpt', default=''); ap.add_argument('--games', type=int, default=24); ap.add_argument('--envs', type=int, default=8)
ap.add_argument('--random', action='store_true'); ap.add_argument('--sample', action='store_true'); ap.add_argument('--const', type=int, default=-1); ap.add_argument('--out', default=''); ap.add_argument('--rule', type=float, default=-1)
a = ap.parse_args()
W = None
if a.ckpt:
    W = {k: v.numpy().astype(np.float32) for k, v in torch.load(a.ckpt, map_location='cpu').items()}
def act(o, rng):
    if a.rule >= 0:      # hand rule: the ball is low and moving down -> hit with the flipper on its side (x > 0 is the LEFT flipper); features: o[0]=x/8, o[1]=y/12, o[3]=vy
        if o[1] * 12 > a.rule and o[3] > -0.05: return 1 if o[0] > 0 else 2
        return 0
    if a.const >= 0: return a.const
    if a.random or W is None: return int(rng.integers(NACT))
    h = np.tanh(W['body.0.weight'] @ o + W['body.0.bias']); h = np.tanh(W['body.2.weight'] @ h + W['body.2.bias']); lg = W['pi.weight'] @ h + W['pi.bias']
    if a.sample:
        p = np.exp(lg - lg.max()); p /= p.sum(); return int(rng.choice(NACT, p=p))
    return int(np.argmax(lg))
def run(i):
    rng = np.random.default_rng(100 + i); e = Env(); n = a.games // a.envs + (1 if i < a.games % a.envs else 0); stats = []
    try:
        while len(e.game_scores) < n:
            e.step(act(e.obs, rng))
    finally: e.close()
    return e.game_scores
t = time.time()
with ThreadPoolExecutor(a.envs) as ex: res = sum(ex.map(run, range(a.envs)), [])
res = res[:a.games] if len(res) > a.games else res
print('games', len(res), 'mean %.0f median %.0f std %.0f min %d max %d' % (np.mean(res), np.median(res), np.std(res), min(res), max(res)), 'sem %.0f' % (np.std(res) / np.sqrt(len(res))), 'time %.0fs' % (time.time() - t))
print(sorted(res))
if a.out: json.dump(res, open(a.out, 'w'))
