import time, pathlib, http.server, threading, functools, sys
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8963), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o)
out = pathlib.Path("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad")
try:
    for name, page, w, hh in [("2d", "polynomino/game.html?battle=1", 900, 800), ("3d", "game.html?battle=1", 900, 914), ("4d", "polytesseract/game.html?battle=1", 900, 914), ("3d_big", "game.html?battle=1", 1400, 1000)]:
        d.set_window_size(w, hh); d.get(f"http://127.0.0.1:8963/{page}"); time.sleep(5)
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(10)
        print(name, d.execute_script("var q=function(i){var e=document.getElementById(i),r=e.getBoundingClientRect();return [i,Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]}; return JSON.stringify([innerWidth,innerHeight,q('oppbox'),q('oppw'),q('oppslots')])"))
        d.save_screenshot(str(out / f"box_{name}.png"))
finally: d.quit()
