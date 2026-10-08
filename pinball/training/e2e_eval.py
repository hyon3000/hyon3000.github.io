"""end to end, REAL TIME, through the real page (index.html served on 127.0.0.1:PORT, game files from pinball.alula.me):
   python3.12 e2e_eval.py --mode rl|vision --games 20 --par 6 [--port 8766]
one game (3 balls) per fresh page load; the score is read from the game memory (PinballAI.check/read); the game is over when ball 3 is gone and the score stays put."""
import argparse, json, sys, time
import numpy as np
from concurrent.futures import ThreadPoolExecutor
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
ap = argparse.ArgumentParser(); ap.add_argument('--mode', default='rl'); ap.add_argument('--games', type=int, default=20); ap.add_argument('--par', type=int, default=6)
ap.add_argument('--port', type=int, default=8766); ap.add_argument('--maxs', type=float, default=420); ap.add_argument('--out', default='')
a = ap.parse_args()

def play(i):
    o = Options(); o.add_argument('-headless'); d = webdriver.Firefox(options=o); d.set_script_timeout(30); d.set_window_size(800, 640)
    try:
        d.get('http://127.0.0.1:%d/index.html%s' % (a.port, '?bot=vision' if a.mode == 'vision' else ''))
        d.execute_script("window.__errs=[]; window.addEventListener('error',function(e){__errs.push(e.message)})")
        t = time.time()
        while time.time() - t < 90:
            if d.execute_script("return !!(window.Module && Module.HEAPF32 && Module.HEAPF32.length>1e6 && window.PinballAI && PinballAI.check(Module))"): break
            time.sleep(1)
        else: return None, 'no state', 0
        time.sleep(2)
        d.execute_script("window.__A = PinballAI.check(Module); toggleAuto()")
        t0 = time.time(); gone = 0; best = 0; mode = ''
        while time.time() - t0 < a.maxs:
            time.sleep(1)
            s = d.execute_script("var s=PinballAI.read(Module, window.__A); return [s.x, s.y, s.score, s.ctr, window.pinballAuto, __errs.length]")
            best = max(best, s[2]); mode = s[4]
            present = not (s[0] == 0 and s[1] == 0)
            gone = gone + 1 if (s[3] >= 3 and not present) else 0
            if gone >= 6: break
        errs = d.execute_script("return __errs")
        return best, mode, time.time() - t0, errs
    except Exception as e:
        return None, 'exc %r' % e, 0, []
    finally:
        try: d.quit()
        except Exception: pass

res = []
def worker(k):
    out = []
    while len(res) + len(out) < a.games and len(res) < a.games:
        r = play(k); print(a.mode, r, flush=True)
        if r[0] is not None: res.append(r)
    return 1
with ThreadPoolExecutor(a.par) as ex: list(ex.map(worker, range(a.par)))
sc = [r[0] for r in res][:a.games]
print('MODE', a.mode, 'games', len(sc), 'mean %.0f median %.0f std %.0f min %d max %d sem %.0f' % (np.mean(sc), np.median(sc), np.std(sc), min(sc), max(sc), np.std(sc) / np.sqrt(len(sc))))
print('modes', sorted(set(r[1] for r in res)), 'errors', [r[3] for r in res if r[3]], 'durations', [round(r[2]) for r in res])
if a.out: json.dump(sc, open(a.out, 'w'))
