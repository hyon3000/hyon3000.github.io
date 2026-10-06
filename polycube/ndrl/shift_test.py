import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8988), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); o.set_preference("intl.accept_languages", "ko"); d = webdriver.Firefox(options=o); d.set_window_size(1000, 914)
out = pathlib.Path("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad")
try:
    for name, page in (("3d", "game.html"), ("2d", "polynomino/game.html"), ("4d", "polytesseract/game.html")):
        d.get(f"http://127.0.0.1:8988/{page}?battle=1"); time.sleep(4)
        d.execute_script("document.body.focus()")
        d.execute_script("window.__poly.state.about = 1"); time.sleep(1.2); d.save_screenshot(str(out / f"shift_about_{name}.png")); d.execute_script("window.__poly.state.about = 0")
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
        d.execute_script("try{PolyBattle.oppFrame.contentWindow.PolyND.stop()}catch(e){}; try{PolyBattle.oppFrame.contentWindow.PolyAIControl.stop()}catch(e){}; PolyBattle.slots=[116,117,125,8]; window.__holdBefore = window.__poly.state.holdblock ? 1 : 0")
        before = d.execute_script("return PolyBattle.slots.join()")
        ActionChains(d).key_down(Keys.SHIFT).pause(0.1).key_up(Keys.SHIFT).perform(); time.sleep(0.5)
        print(name, before, "->", d.execute_script("return PolyBattle.slots.join()"), "| hold untouched:", d.execute_script("return JSON.stringify([window.__holdBefore, window.__poly.state.holdblock ? 1 : 0])"), flush=True)
finally: d.quit()
