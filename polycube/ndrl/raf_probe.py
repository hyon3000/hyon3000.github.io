import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8962), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
try:
    d.get("http://127.0.0.1:8962/game.html?battle=1"); time.sleep(5)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(8)
    js = "var F=PolyBattle.oppFrame.contentWindow; window.__n=0; window.__m=0; (function f(){window.__n++; requestAnimationFrame(f)})(); (function g(){F.__m=(F.__m||0)+1; F.requestAnimationFrame(g)})();"
    d.execute_script(js); time.sleep(5)
    print(d.execute_script("return [window.__n, PolyBattle.oppFrame.contentWindow.__m]"))
finally: d.quit()
