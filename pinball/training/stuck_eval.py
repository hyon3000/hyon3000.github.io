"""stuck-ball measurement in the virtual-clock env: python3.12 stuck_eval.py --ckpt runs/n1_final.pt --games 32 [--random]
a stuck episode = the ball stays inside a 0.05-unit box for >= 22 decisions (1.5 s) while it is in the flipper zone (y > 8, outside the plunger lane) and the flipper action changed >= 2 times in that window"""
import argparse, os, sys, time
import numpy as np, torch
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pbenv import Env, NACT, NNUD
ap = argparse.ArgumentParser(); ap.add_argument('--ckpt', default=''); ap.add_argument('--games', type=int, default=32); ap.add_argument('--envs', type=int, default=16); ap.add_argument('--random', action='store_true')
a = ap.parse_args()
W = {k: v.numpy().astype(np.float32) for k, v in torch.load(a.ckpt, map_location='cpu').items()} if a.ckpt else None
WIN = 22
def act(o, m, rng):
    if a.random or W is None: return int(rng.integers(NACT)), 0
    h = np.tanh(W['body.0.weight'] @ o + W['body.0.bias']); h = np.tanh(W['body.2.weight'] @ h + W['body.2.bias'])
    lg = W['pi.weight'] @ h + W['pi.bias']; ln = W['pn.weight'] @ h + W['pn.bias']
    if m is not None: lg = np.where(m[:4], lg, -1e9); ln = np.where(m[4:], ln, -1e9)
    def pick(l): p = np.exp(l - l.max()); p /= p.sum(); return int(rng.choice(len(l), p=p))
    return pick(lg), pick(ln)
RES = []; SP = []
def run(i):
    rng = np.random.default_rng(300 + i); e = Env(); n = a.games // a.envs + (1 if i < a.games % a.envs else 0)
    pos = []; acts = []; stuck = 0; inst = False; balls = 0; steps = 0; stuckdec = 0; nud = 0; lens = []; bl = 0
    try:
        while len(e.game_scores) < n:
            o = e.obs; x, y = o[0] * 8, o[1] * 12
            pos.append((x, y)); pos = pos[-WIN:]
            m = getattr(e, 'mask', None)
            fa, na = act(o, m, rng); acts.append(fa); acts = acts[-WIN:]
            _, _, dn, ov = e.step(fa, na); bl += 1
            nud += 1 if na else 0
            if len(pos) == WIN:
                P = np.array(pos); zone = (P[:, 1] > 8).all() and (P[:, 0] > -6.5).all()
                box = (P.max(0) - P.min(0)).max() < 0.05; tog = sum(1 for k in range(1, WIN) if acts[k] != acts[k - 1])
                if zone: SP.append(((P.max(0) - P.min(0)).max(), tog))
                s = zone and box and tog >= 2
                if s: stuckdec += 1
                if s and not inst: stuck += 1
                inst = s
            if dn:
                balls += 1; lens.append(bl); bl = 0; pos = []; acts = []; inst = False
    finally: e.close()
    RES.append((stuck, balls, stuckdec, nud, sum(lens), list(e.game_scores)))
with ThreadPoolExecutor(a.envs) as ex: list(ex.map(run, range(a.envs)))
st = sum(r[0] for r in RES); b = sum(r[1] for r in RES); sc = sum((r[5] for r in RES), [])
print('games %d balls %d | stuck episodes %d = %.3f per ball | stuck decisions per ball %.1f | nudges/ball %.1f | ball length %.0f decisions | mean score %.0f' % (len(sc), b, st, st / b, sum(r[2] for r in RES) / b, sum(r[3] for r in RES) / b, sum(r[4] for r in RES) / b, np.mean(sc)))

SP = np.array(SP); print('in-zone 1.5s windows', len(SP), 'spread<0.05: %d  <0.2: %d  <0.5: %d  <1: %d' % tuple((SP[:, 0] < t).sum() for t in (0.05, 0.2, 0.5, 1)), ' per ball: %.2f %.2f %.2f %.2f' % tuple((SP[:, 0] < t).sum() / b for t in (0.05, 0.2, 0.5, 1)))
