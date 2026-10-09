"""collect ball positions in the low part of the table with the flippers left DOWN (and with both UP) to calibrate the flipper geometry"""
import sys, os, numpy as np, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pbenv import Env
mode = sys.argv[1]; balls = int(sys.argv[2])
P = []
def run(i):
    e = Env(); rng = np.random.default_rng(i); n = 0; out = []
    while n < balls // 8:
        a = {'down': 0, 'up': 3}[mode] if mode != 'rand' else int(rng.integers(4))
        o = e.obs; out.append((o[0] * 8, o[1] * 12, o[2] / 0.4, o[3] / 0.4))  # x, y, vx, vy per decision  (obs vel = delta*VS, VS=1/2.5)
        _, _, dn, ov = e.step(a, 0)
        if dn: n += 1
    e.close(); return out
with ThreadPoolExecutor(8) as ex: res = sum(ex.map(run, range(8)), [])
np.save('/tmp/geo_%s.npy' % mode, np.array(res)); print(len(res))
