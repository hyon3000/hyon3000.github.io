import sys, time, pathlib, http.server, threading, functools, json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8881), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page, tag = sys.argv[1], sys.argv[2]
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
cells = "var b = %s.__poly.state.%s, n = 0; function rec(a, dep) { for (var i = 0; i < a.length; i++) { if (Array.isArray(a[i])) rec(a[i]); else if (a[i]) n++; } } rec(b); return n;"
key = "board" if "polynomino" in page else "blk"
def dblclick(el, fx, fy):
    a = ActionChains(d).move_to_element_with_offset(el, int(el.size['width'] * (fx - .5)), int(el.size['height'] * (fy - .5)))
    a.click_and_hold().pause(0.06).release().pause(0.12).click_and_hold().pause(0.06).release().perform()
try:
    d.get(f"http://127.0.0.1:8881/{page}"); time.sleep(5)
    d.execute_script("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message+' @'+e.lineno));")
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(6)
    d.execute_script("var F = PolyBattle.oppFrame.contentWindow.PolyBattle; F.__orig = F.aiUseSlots; F.aiUseSlots = function () {}; F.slots = [126, 4];")
    d.execute_script("PolyBattle.store(117); PolyBattle.store(125); PolyBattle.store(8); PolyBattle.store(5);"); time.sleep(2)
    print("hint:", d.execute_script("var e = document.getElementById('bthint'); return [getComputedStyle(e).display, e.textContent]"))
    d.save_screenshot(f"/tmp/bt/{tag}_use0.png")
    own = d.find_element(By.ID, "own"); oppw = d.find_element(By.ID, "oppw")
    # single click on the opponent window: nothing
    ActionChains(d).move_to_element(oppw).click_and_hold().pause(.1).release().perform(); time.sleep(.4)
    print("after SINGLE click on the opponent window, slots:", d.execute_script("return JSON.stringify(PolyBattle.slots)"))
    opp0 = d.execute_script(cells % ("PolyBattle.oppFrame.contentWindow", key))
    # double click on the opponent window: the oldest item (+2 lines) flies there
    a = ActionChains(d).move_to_element(oppw); a.click_and_hold().pause(.05).release().pause(.1).click_and_hold().pause(.05).release().perform()
    time.sleep(0.45); fl = d.execute_script("return document.querySelectorAll('.btfly').length"); d.save_screenshot(f"/tmp/bt/{tag}_fly_to_opp.png")
    print("flying elements mid-flight:", fl)
    time.sleep(1.2)
    print("slots now:", d.execute_script("return JSON.stringify(PolyBattle.slots)"), "| opp cells", opp0, "->", d.execute_script(cells % ("PolyBattle.oppFrame.contentWindow", key)))
    # double click on my window: the next item (+1 line) is used on me, no flight
    mine0 = d.execute_script(cells % ("window", key)); dblclick(own, .5, .3); time.sleep(.6)
    print("slots after double-click on MY window:", d.execute_script("return JSON.stringify(PolyBattle.slots)"), "| my cells", mine0, "->", d.execute_script(cells % ("window", key)))
    # the opponent uses an item on me: it flies from its strip to my window
    d.execute_script("var F = PolyBattle.oppFrame.contentWindow.PolyBattle; F.slots = [125]; F.aiUseSlots = F.__orig;")
    time.sleep(1.2); mine1 = d.execute_script(cells % ("window", key))
    d.execute_script("PolyBattle.oppFrame.contentWindow.PolyBattle.aiUseSlots()"); time.sleep(0.4)
    print("opponent's item in flight:", d.execute_script("return document.querySelectorAll('.btfly').length")); d.save_screenshot(f"/tmp/bt/{tag}_fly_to_me.png")
    time.sleep(1.2); print("my cells", mine1, "->", d.execute_script(cells % ("window", key)))
    print("errors:", d.execute_script("return JSON.stringify(window.__errs)"))
finally:
    d.quit()
