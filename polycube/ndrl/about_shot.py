import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8973), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); o.set_preference("intl.accept_languages", "ko"); d = webdriver.Firefox(options=o); d.set_window_size(1100, 914)
out = pathlib.Path("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad")
try:
    for name, page in (("3d", "game.html"), ("4d", "polytesseract/game.html"), ("2d", "polynomino/game.html")):
        d.get(f"http://127.0.0.1:8973/{page}?battle=1"); time.sleep(5)
        d.execute_script("window.__poly.state.about = 1"); time.sleep(1.5)
        d.save_screenshot(str(out / f"about_{name}.png"))
finally: d.quit()
