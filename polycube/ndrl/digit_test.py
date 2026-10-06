import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.action_chains import ActionChains
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8989), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(1000, 914)
try:
    for name, page in (("3d", "game.html"), ("2d", "polynomino/game.html"), ("4d", "polytesseract/game.html")):
        d.get(f"http://127.0.0.1:8989/{page}?battle=1"); time.sleep(4)
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
        d.execute_script("""var F=PolyBattle.oppFrame.contentWindow; try{F.PolyND.stop()}catch(e){}; try{F.PolyAIControl.stop()}catch(e){}
          window.__mine=[]; var o=PolyBattle.api.applyStored; PolyBattle.api.applyStored=function(c){window.__mine.push(c); return o.apply(this,arguments)};
          window.__opp=[]; var fo=F.PolyBattle.api.applyStored; F.PolyBattle.api.applyStored=function(c){window.__opp.push(c); return fo.apply(this,arguments)};
          PolyBattle.slots=[125,116,117,8,9];""")
        res = []
        for key in ("4", "3", "9"):                   # move 4th -> front, then 3rd -> front, 9th does nothing (only 5 items)
            ActionChains(d).send_keys(key).perform(); time.sleep(0.3); res.append(d.execute_script("return PolyBattle.slots.join()"))
        ActionChains(d).send_keys("1").perform(); time.sleep(2)       # front item on the opponent
        ActionChains(d).send_keys("0").perform(); time.sleep(1.5)     # next front item on me
        print(name, res, d.execute_script("return JSON.stringify({slots: PolyBattle.slots, onMe: window.__mine, onOpp: window.__opp})"), flush=True)
finally: d.quit()
