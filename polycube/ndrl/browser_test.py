"""Real-browser run of the auto-solver (headless Firefox, real game page): decisions per minute, score, errors."""
import json, pathlib, sys, time, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); handler.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8771), handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
DIM = int(sys.argv[1]); SECS = int(sys.argv[2]) if len(sys.argv) > 2 else 60
page = "game.html" if DIM == 3 else "polytesseract/game.html"
o = Options(); o.add_argument("-headless"); o.add_argument("--width=800"); o.add_argument("--height=800")
d = webdriver.Firefox(options=o); d.set_script_timeout(300)
try:
    d.get(f"http://127.0.0.1:8771/{page}"); time.sleep(4)
    d.execute_script("window.__errs = []; window.addEventListener('error', function (e) { window.__errs.push(e.message + ' @' + e.lineno); });")
    d.execute_script("var S = window.__poly.state; S.startscreen = 0; window.__poly.init();")
    time.sleep(1)
    print("bridge status", d.execute_script("return JSON.stringify(window.PolyAutoSolve.status())"))
    d.execute_script("window.PolyND.start();")
    t0 = time.time(); last = None
    while time.time() - t0 < SECS:
        time.sleep(10)
        r = d.execute_script("var S = window.__poly.state, a = window.PolyND._ai; return JSON.stringify({on: a.on, dec: a.dec, score: S.score, lines: S.lines, level: S.level, over: S.goverflg, errs: window.__errs, msg: a.msg, hud: document.getElementById('hud').textContent})")
        print(f"{time.time()-t0:5.0f}s", r, flush=True)
        if json.loads(r)["over"]: break
finally:
    d.quit()
