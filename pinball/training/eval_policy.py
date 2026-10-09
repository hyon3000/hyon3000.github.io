"""evaluate on full games (3 balls) in the virtual-clock harness: python3.12 eval_policy.py --ckpt runs/p1/best.pt --games 24 [--random] [--sample]"""
import argparse, os, sys, json, time
import numpy as np, torch
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pbenv import Env, NACT, NNUD
ap = argparse.ArgumentParser(); ap.add_argument('--ckpt', default=''); ap.add_argument('--games', type=int, default=24); ap.add_argument('--envs', type=int, default=8)
ap.add_argument('--random', action='store_true'); ap.add_argument('--sample', action='store_true'); ap.add_argument('--const', type=int, default=-1); ap.add_argument('--out', default=''); ap.add_argument('--rule', type=float, default=-1)
a = ap.parse_args()
W = None
if a.ckpt:
    W = {k: v.numpy().astype(np.float32) for k, v in torch.load(a.ckpt, map_location='cpu').items()}
def act(o, rng):
    if a.random or W is None: return int(rng.integers(NACT)), 0
    h = np.tanh(W['body.0.weight'] @ o + W['body.0.bias']); h = np.tanh(W['body.2.weight'] @ h + W['body.2.bias']); lg = W['pi.weight'] @ h + W['pi.bias']
    ln = W['pn.weight'] @ h + W['pn.bias'] if 'pn.weight' in W else None
    def pick(l):
        if a.sample:
            p = np.exp(l - l.max()); p /= p.sum(); return int(rng.choice(len(l), p=p))
        return int(np.argmax(l))
    return pick(lg), (pick(ln) if ln is not None else 0)
STAT = []
def run(i):
    rng = np.random.default_rng(100 + i); e = Env(); n = a.games // a.envs + (1 if i < a.games % a.envs else 0); stats = []
    try:
        while len(e.game_scores) < n:
            x, y = act(e.obs, rng); _, _, dn, ov = e.step(x, y); STAT.append((e.last_nn, e.last_tilt)) if dn else None
    finally: e.close()
    return e.game_scores
t = time.time()
with ThreadPoolExecutor(a.envs) as ex: res = sum(ex.map(run, range(a.envs)), [])
res = res[:a.games] if len(res) > a.games else res
print('games', len(res), 'mean %.0f median %.0f std %.0f min %d max %d' % (np.mean(res), np.median(res), np.std(res), min(res), max(res)), 'sem %.0f' % (np.std(res) / np.sqrt(len(res))), 'time %.0fs' % (time.time() - t))
print('balls', len(STAT), 'nudges/ball %.2f tilts/ball %.3f' % (np.mean([x[0] for x in STAT]), np.mean([x[1] for x in STAT])))
print(sorted(res))
if a.out: json.dump(res, open(a.out, 'w'))
