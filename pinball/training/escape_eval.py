"""time-to-escape test: drive the game with random flips then NO flippers until the ball is in the flipper region moving slowly (speed < 0.35 units per decision, y > 10.3, not rising),
then hand control to the policy and measure how long the ball takes to leave the flipper zone upwards (y < 8.8).  python3.12 escape_eval.py --port 8765 --ckpt runs/g2.pt --trials 60"""
import argparse, os, sys, numpy as np, torch
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pbenv import Env
ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=8765); ap.add_argument('--ckpt', required=True); ap.add_argument('--trials', type=int, default=60); ap.add_argument('--envs', type=int, default=12); ap.add_argument('--tmax', type=int, default=150)
a = ap.parse_args()
W = {k: v.numpy().astype(np.float32) for k, v in torch.load(a.ckpt, map_location='cpu').items()}
def act(o, m, rng):
    h = np.tanh(W['body.0.weight'] @ o + W['body.0.bias']); h = np.tanh(W['body.2.weight'] @ h + W['body.2.bias'])
    lg = W['pi.weight'] @ h + W['pi.bias']; ln = W['pn.weight'] @ h + W['pn.bias']
    if m is not None: lg = np.where(m[:4], lg, -1e9); ln = np.where(m[4:], ln, -1e9)
    def pick(l): p = np.exp(l - l.max()); p /= p.sum(); return int(rng.choice(len(l), p=p))
    return pick(lg), pick(ln)
def pad(o, n): return np.concatenate([o, np.zeros(n - len(o), np.float32)]) if len(o) < n else o
R = []
def run(i):
    rng = np.random.default_rng(1000 + i); e = Env('http://127.0.0.1:%d/harness.html' % a.port); nin = W['body.0.weight'].shape[1]; k = 0
    try:
        while k < a.trials // a.envs + (1 if i < a.trials % a.envs else 0):
            # phase 1: warm-up, then no flippers until the slow-ball state
            warm = int(rng.integers(20, 200)); t = 0; ok = False
            while t < 4000:
                o = e.obs; x, y = o[0] * 8, o[1] * 12; sp = np.hypot(o[2], o[3]) * 2.5; vy = o[3] * 2.5
                if t >= warm and y > 10.3 and abs(x) < 3.5 and sp < 0.35 and vy > -0.05: ok = True; break
                _, _, dn, ov = e.step(int(rng.integers(4)) if t < warm else 0, 0); t += 1
            if not ok: continue
            # phase 2: the policy
            t0 = 0; esc = None; drained = False; tog = 0; prev = 0; pres = 0
            for t0 in range(a.tmax):
                o = e.obs; y = o[1] * 12
                if y < 8.8: esc = t0; break
                f, n = act(pad(o, nin)[:nin], e.mask, rng); tog += (f != prev); prev = f; pres += (f != 0)
                _, _, dn, ov = e.step(f, n)
                if dn: drained = True; break
            R.append((esc, drained, tog, pres, t0)); k += 1
    finally: e.close()
with ThreadPoolExecutor(a.envs) as ex: list(ex.map(run, range(a.envs)))
n = len(R); esc = [r[0] for r in R if r[0] is not None]; dr = sum(r[1] for r in R)
print('trials %d | escaped upward %d (%.0f%%) median time %.2fs mean %.2fs | drained %d (%.0f%%) | no result in %.1fs: %d | flipper toggles/trial %.1f | decisions with a flipper pressed %.1f' % (
    n, len(esc), 100 * len(esc) / n, np.median(esc) * 4 / 60 if esc else -1, np.mean(esc) * 4 / 60 if esc else -1, dr, 100 * dr / n, a.tmax * 4 / 60, n - len(esc) - dr, np.mean([r[2] for r in R]), np.mean([r[3] for r in R])))
