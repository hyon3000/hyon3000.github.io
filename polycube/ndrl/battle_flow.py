import sys, time, pathlib, http.server, threading, functools, json
from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); handler.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8778), handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
page, tag, sy = sys.argv[1], sys.argv[2], float(sys.argv[3])      # sy: START button y as fraction of the own canvas height
o = Options(); o.add_argument("-headless")
d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
def click(el, fx, fy):
    ActionChains(d).move_to_element_with_offset(el, int(el.size['width'] * (fx - .5)), int(el.size['height'] * (fy - .5))).click_and_hold().pause(0.2).release().perform()
try:
    d.get(f"http://127.0.0.1:8778/{page}"); time.sleep(6)
    d.execute_script("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message+' @'+e.lineno));")
    own = d.find_element(By.ID, "own"); d.execute_script("window.__log=[];['pointerdown','pointerup'].forEach(t=>document.addEventListener(t,e=>window.__log.push([t,e.clientX,e.clientY,e.target.id||e.target.tagName]),true));")
    click(own, .5, sy); time.sleep(1.5)
    print("log", d.execute_script("return JSON.stringify([window.__log, window.__errs, window.__poly && window.__poly.state.startscreen])")); d.save_screenshot(f"/tmp/bt/{tag}_pair.png")
    print("pair visible:", d.execute_script("return getComputedStyle(document.getElementById('bt-pair')).display"), "key:", d.execute_script("return document.getElementById('bt-mykey').textContent"))
    d.find_element(By.ID, "bt-ai").click(); time.sleep(6)
    print("started:", d.execute_script("return JSON.stringify({paired: PolyBattle.paired, mode: PolyBattle.mode, key: PolyBattle.opponentKey, start: window.__poly ? window.__poly.state.startscreen : 'n/a'})"))
    d.execute_script("PolyBattle.store(125); PolyBattle.store(126); PolyBattle.store(4);"); time.sleep(8)
    d.save_screenshot(f"/tmp/bt/{tag}_game.png")
    slots = d.find_elements(By.CSS_SELECTOR, "#slots .btslot")
    slots[0].click(); time.sleep(.3)
    print("selected:", d.execute_script("return PolyBattle.selected"))
    click(own, .5, .5); time.sleep(.5)
    print("opp", d.execute_script("return JSON.stringify([PolyBattle.opp.slots, PolyBattle.opp.score, PolyBattle.opp.lines, PolyBattle.opp.info && PolyBattle.opp.info.pos])"))
    print("slots after use on me:", d.execute_script("return JSON.stringify(PolyBattle.slots)"))
    d.find_elements(By.CSS_SELECTOR, "#slots .btslot")[1].click(); ActionChains(d).move_to_element(d.find_element(By.ID, "oppw")).click_and_hold().pause(0.2).release().perform(); time.sleep(.3)
    print("slots after use on opponent:", d.execute_script("return JSON.stringify(PolyBattle.slots)"), "opp items", d.execute_script("return JSON.stringify(PolyBattle.opp.items)"))
    print("errors:", d.execute_script("return JSON.stringify(window.__errs)"))
finally:
    d.quit()
