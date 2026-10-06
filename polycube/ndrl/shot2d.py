import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8980), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o)
out = pathlib.Path("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad")
try:
    d.set_window_size(1100, 914); d.get("http://127.0.0.1:8980/polynomino/game.html?battle=1"); time.sleep(4)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(6)
    d.execute_script("var F=PolyBattle.oppFrame.contentWindow; try{F.PolyAIControl.stop()}catch(e){}; F.PolyBattle.slots=[116,117,125,8,126,118,21,104,9,5];"); time.sleep(1.5)
    for w, hh in ((700, 800), (1400, 600), (900, 1000)):
        d.set_window_size(w, hh); time.sleep(2.5)
        print(w, hh, d.execute_script("var q=function(i){var e=document.getElementById(i),r=e.getBoundingClientRect();return [i,Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]}; var c=document.querySelector('#oppslots canvas'); return JSON.stringify([innerWidth,innerHeight,q('viewport'),q('oppbox'),q('oppw'),q('oppslots'),[c.width,c.height]])"))
        d.save_screenshot(str(out / f"r2d_{w}x{hh}.png"))
finally: d.quit()
