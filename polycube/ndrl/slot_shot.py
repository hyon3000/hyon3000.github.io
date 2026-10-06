import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8841), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page, tag = sys.argv[1], sys.argv[2]
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
try:
    d.get(f"http://127.0.0.1:8841/{page}"); time.sleep(5)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(7)
    d.execute_script("PolyBattle.store(125); PolyBattle.store(126); PolyBattle.store(4); PolyBattle.store(8);")
    d.execute_script("var Q = PolyBattle.oppFrame.contentWindow.PolyBattle; Q.aiUseSlots = function () {}; Q.slots = [117, 9, 21];")
    time.sleep(3); d.save_screenshot(f"/tmp/bt/{tag}_slots.png")
    print(d.execute_script("return JSON.stringify([PolyBattle.slots, PolyBattle.opp.slots, PolyBattle.selected, (PolyBattle.opp.slotImg||'').length])"))
finally:
    d.quit()
