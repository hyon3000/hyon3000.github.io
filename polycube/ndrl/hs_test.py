import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8861), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
try:
    for page, key in (("polynomino/game.html?battle=1", "polynomino_highscore"), ("game.html?battle=1", "polycube_highscore"), ("polytesseract/game.html?battle=1", "polytesseract_highscore")):
        d.get("http://127.0.0.1:8861/" + page); time.sleep(5)
        d.execute_script("localStorage.removeItem(arguments[0])", key)
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
        d.execute_script("var F = PolyBattle.oppFrame.contentWindow; F.__poly.state.score = 777; F.__poly.gover();"); time.sleep(.5)
        a = d.execute_script("return localStorage.getItem(arguments[0])", key)
        d.execute_script("window.__poly.state.score = 555; window.__poly.gover();"); time.sleep(.5)
        b = d.execute_script("return localStorage.getItem(arguments[0])", key)
        print(page.split('?')[0], "| after the OPPONENT's game over (score 777):", a, "| after MY game over (score 555):", b)
finally:
    d.quit()
