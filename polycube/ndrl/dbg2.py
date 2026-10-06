import sys, time, pathlib, http.server, threading, functools, base64
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8852), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(500, 1000)
try:
    d.get("http://127.0.0.1:8852/polynomino/game.html?battle=1&role=opp"); time.sleep(6)
    d.execute_script("var Q = PolyBattle; Q.aiUseSlots = function () {}; Q.slots = [117, 9, 21];"); time.sleep(2)
    d.save_screenshot('/tmp/bt/oppframe.png')
    print(d.execute_script("return JSON.stringify({slots: PolyBattle.slots, battle: window.__battle, playing: PolyBattle.api.isPlaying()})"))
finally:
    d.quit()
