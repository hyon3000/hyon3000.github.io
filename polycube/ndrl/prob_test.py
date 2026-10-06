import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8891), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(600, 800)
js2d = "var n = 0, N = 3000; for (var i = 0; i < N; i++) { __poly.init(); var v = __poly.state.holdblock.vals[0]; if ((v & 255) === 4) n++; } return n / N;"
js3d = "var n = 0, N = 3000; for (var i = 0; i < N; i++) { __poly.init(); var v = __poly.state.holdblock[3][3][3]; if ((v & 255) === 4) n++; } return n / N;"
try:
    for name, page, js in (("2D", "polynomino/game.html", js2d), ("3D", "game.html", js3d)):
        r = []
        for q in ("", "?battle=1"):
            d.get(f"http://127.0.0.1:8891/{page}{q}"); time.sleep(4)
            r.append(d.execute_script(js))
        print(name, "initial hold = score-boost block: normal", round(r[0], 4), "| battle", round(r[1], 4), "| ratio normal/battle", round(r[0] / max(r[1], 1e-9), 1))
finally:
    d.quit()
