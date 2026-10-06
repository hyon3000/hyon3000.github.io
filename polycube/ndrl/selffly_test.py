import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8993), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(1000, 914)
out = pathlib.Path("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad")
cnt = "return document.querySelectorAll('.btfly').length"
try:
    for name, page in (("3d", "game.html"), ("2d", "polynomino/game.html"), ("4d", "polytesseract/game.html")):
        d.get(f"http://127.0.0.1:8993/{page}?battle=1"); time.sleep(4)
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
        d.execute_script("var F=PolyBattle.oppFrame.contentWindow; try{F.PolyND.stop()}catch(e){}; try{F.PolyAIControl.stop()}catch(e){}; F.PolyBattle.slots=[116,9]; PolyBattle.slots=[125,117,8]; window.__mine=[]; var o=PolyBattle.api.applyStored; PolyBattle.api.applyStored=function(c){window.__mine.push(c); return o.apply(this,arguments)};")
        d.execute_script("PolyBattle.useFrontNow('self')"); time.sleep(0.25)
        a = d.execute_script(cnt); d.save_screenshot(str(out / f"selffly_me_{name}.png")); time.sleep(1.2)
        d.execute_script("PolyBattle.oppFrame.contentWindow.PolyBattle.useFrontNow('self')"); time.sleep(0.25)
        b = d.execute_script(cnt); d.save_screenshot(str(out / f"selffly_opp_{name}.png")); time.sleep(1.2)
        print(name, "flights while I use on myself:", a, "| while the opponent uses on itself:", b, "| after:", d.execute_script(cnt), "| applied on me:", d.execute_script("return JSON.stringify(window.__mine)"), flush=True)
finally: d.quit()
