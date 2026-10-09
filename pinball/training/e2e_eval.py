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
        d.get('http://127.0.0.1:%d/index.html%s' % (a.port, '?bot=rl' if a.mode == 'rl' else ''))
        d.execute_script("window.__errs=[]; window.addEventListener('error',function(e){__errs.push(e.message)})")
        t = time.time()
        while time.time() - t < 90:
            if d.execute_script("return !!(window.Module && Module.HEAPF32 && Module.HEAPF32.length>1e6 && window.PinballAI && PinballAI.check(Module))"): break
            time.sleep(1)
        else: return None, 'no state', 0, [], 0, 0, 0, 0
        time.sleep(2)
        d.execute_script("window.__A = PinballAI.check(Module);")
        d.execute_script("""window.__M={w:[],k:[],tog:0,e1:0,e2:0,in1:0,in2:0,pk:0,t:0,l1:0,l2:0};
          document.getElementById('canvas').addEventListener('keydown',function(e){ if(e.code==='KeyZ'||e.code==='Slash') __M.tog++; },true);
          setInterval(function(){ var s=PinballAI.read(Module,window.__A); var M=__M; M.t++;
            if(!(s.x===0&&s.y===0) && s.y>8 && s.x>-6.5){ M.w.push([s.x,s.y,M.tog]); if(M.w.length>22) M.w.shift();
              if(M.w.length===22){ var x0=1e9,x1=-1e9,y0=1e9,y1=-1e9; M.w.forEach(function(p){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);});
                var sp=Math.max(x1-x0,y1-y0), tg=M.w[21][2]-M.w[0][2];
                var a=(sp<0.05&&tg>=2), b=(sp<0.3&&tg>=2); if(a&&!M.in1) M.e1++; M.in1=a; if(b&&!M.in2) M.e2++; M.in2=b; } } else { M.w=[]; M.in1=0; M.in2=0; } },66);""")
        d.execute_script("toggleAuto()")
        t0 = time.time(); gone = 0; best = 0; mode = ''
        while time.time() - t0 < a.maxs:
            time.sleep(1)
            s = d.execute_script("var s=PinballAI.read(Module, window.__A); return [s.x, s.y, s.score, s.ctr, window.pinballAuto, __errs.length]")
            best = max(best, s[2]); mode = s[4]
            present = not (s[0] == 0 and s[1] == 0)
            gone = gone + 1 if (s[3] >= 3 and not present) else 0
            if gone >= 3: break
        errs = d.execute_script("return __errs")
        nd, tl, e1, e2 = d.execute_script("return [window.pinballNudges, window.pinballTilts, __M.e1, __M.e2]")
        return best, mode, time.time() - t0, errs, nd, tl, e1, e2
    except Exception as e:
        return None, 'exc %r' % e, 0, [], 0, 0, 0, 0
    finally:
        try: d.quit()
        except Exception: pass

res = []
def worker(k):
    out = []
    while len(res) + len(out) < a.games and len(res) < a.games:
        r = play(k); print(a.mode, r, flush=True)
        if r[0] is not None and len(res) < a.games: res.append(r)
    return 1
with ThreadPoolExecutor(a.par) as ex: list(ex.map(worker, range(a.par)))
sc = [r[0] for r in res][:a.games]
print('MODE', a.mode, 'games', len(sc), 'mean %.0f median %.0f std %.0f min %d max %d sem %.0f' % (np.mean(sc), np.median(sc), np.std(sc), min(sc), max(sc), np.std(sc) / np.sqrt(len(sc))))
print('nudges/game mean %.1f  nudges/ball %.2f  tilts/game %.2f  secs/game %.0f' % (np.mean([r[4] for r in res]), np.mean([r[4] for r in res]) / 3, np.mean([r[5] for r in res]), np.mean([r[2] for r in res])))
print('stuck episodes per ball (spread<0.05, flipper toggled >=2 in 1.5 s): %.3f ; looser (<0.3): %.3f' % (np.mean([r[6] for r in res]) / 3, np.mean([r[7] for r in res]) / 3))
print('modes', sorted(set(r[1] for r in res)), 'errors', [r[3] for r in res if r[3]], 'durations', [round(r[2]) for r in res])
if a.out: json.dump(sc, open(a.out, 'w'))
