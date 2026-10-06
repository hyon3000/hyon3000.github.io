import sys, time, pathlib, http.server, threading, functools
import numpy as np
from PIL import Image
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
def serve(directory, port):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory)); h.log_message = lambda *a, **k: None
    s = http.server.ThreadingHTTPServer(("127.0.0.1", port), h); threading.Thread(target=s.serve_forever, daemon=True).start()
serve(root, 8811); serve("/tmp/base", 8812)
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
try:
    for g, page in (("2d", "polynomino/game.html"), ("3d", "game.html"), ("4d", "polytesseract/game.html")):
        ims = {}
        for tag, port in (("base", 8812), ("now", 8811)):
            d.get(f"http://127.0.0.1:{port}/{page}"); time.sleep(6)
            d.execute_script("var P = window.__poly; if (P) { P.state.startscreen = 0; P.state.score = 1234; P.state.goverflg = 1; } else { }")
            time.sleep(1.5); d.save_screenshot(f"/tmp/bt/o_{g}_{tag}.png"); ims[tag] = np.asarray(Image.open(f"/tmp/bt/o_{g}_{tag}.png").convert("RGB")).astype(int)
        diff = np.abs(ims["base"] - ims["now"]).sum(2) > 60
        print(g, "game over, normal mode, now vs original:", f"{diff.mean()*100:.2f}% pixels differ")
finally:
    d.quit()
