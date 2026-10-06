"""Real-browser audit: is the fall speed with the AI attached the same as without it?  (headless Firefox, real game page)"""
import json, pathlib, sys, time, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
handler.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
LEVEL = int(sys.argv[1]) if len(sys.argv) > 1 else 12
SECS = int(sys.argv[2]) if len(sys.argv) > 2 else 40
GRAV = [800, 717, 633, 550, 467, 383, 300, 217]

def run(ai_on):
    o = Options(); o.add_argument("-headless"); o.add_argument("--width=480"); o.add_argument("--height=960")
    d = webdriver.Firefox(options=o); d.set_script_timeout(300)
    try:
        d.get("http://127.0.0.1:8765/game.html?items=0" if False else "http://127.0.0.1:8765/game.html")
        time.sleep(3)
        d.execute_script("""
          window.__fallLog = []; window.__frameLog = [];
          var P = window.__poly, S = P.state;
          S.startscreen = 0; S.score = %d; S.level = Math.min(16, Math.floor((S.score + 600) / 800) + 1);
          window.__aiOn = %s;
        """ % ((LEVEL - 1) * 800 - 600 + 100, "true" if ai_on else "false"))
        if ai_on:
            d.execute_script("window.PolyAIControl.toggle();")
            time.sleep(8)     # model download + decode
            d.execute_script("window.__fallLog = []; window.__frameLog = [];")
        else:
            d.execute_script("window.__fallLog = []; window.__frameLog = [];")
        time.sleep(SECS)
        out = d.execute_script("return JSON.stringify({falls: window.__fallLog, frames: window.__frameLog, level: window.__poly.state.level, on: window.PolyAIControl.isOn(), pieces: window.__poly.ai.pieces, think: window.__poly.ai.thinkEst, over: window.__poly.state.goverflg})")
        return json.loads(out)
    finally:
        d.quit()

import numpy as np
for name, on in (("no AI (human baseline: gravity only)", False), ("AI attached", True)):
    r = run(on)
    f = np.array(r["falls"]); fr = np.array(r["frames"])
    print(f"== {name}: level {r['level']}, AI on={r['on']}, pieces placed by the AI {r['pieces']}, game over={r['over']}")
    if len(f) > 3:
        same = f[1:, 3] == f[:-1, 3]                       # consecutive falls of the SAME piece (a hard drop restarts the timer in the game itself)
        iv = np.diff(f[:, 0])[same]; nominal = f[1:, 2][same].mean()
        lv = f[1:, 1][same]
        print(f"   falls logged {len(f)}; same-piece intervals {len(iv)}; nominal {nominal:.0f} ms; measured mean {iv.mean():.0f} ms (median {np.median(iv):.0f}, p90 {np.percentile(iv, 90):.0f}, max {iv.max():.0f}) -> {iv.mean()/nominal*100-100:+.1f}% vs nominal")
        for L in sorted(set(lv.astype(int))):
            m = lv == L
            if m.sum() >= 15: print(f"      level {L}: {m.sum()} intervals, mean {iv[m].mean():.0f} ms vs nominal {f[1:,2][same][m].mean():.0f} ms")
    print(f"   frames {len(fr)}: mean {fr.mean():.1f} ms ({1000/fr.mean():.0f} fps), p95 {np.percentile(fr, 95):.0f} ms, max {fr.max():.0f} ms, frames > 33 ms: {np.mean(fr > 33)*100:.1f}%")
