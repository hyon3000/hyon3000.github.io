import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8951), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page, bx, by = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])      # a control button position (fractions of the own window)
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
def two(el, fx, fy):
    ActionChains(d).move_to_element_with_offset(el, int(el.size['width'] * (fx - .5)), int(el.size['height'] * (fy - .5))).click_and_hold().pause(0.06).release().pause(0.12).click_and_hold().pause(0.06).release().perform()
try:
    d.get(f"http://127.0.0.1:8951/{page}"); time.sleep(5)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(6)
    d.execute_script("PolyBattle.slots = [125, 8, 9]; var F = PolyBattle.oppFrame.contentWindow.PolyBattle; F.aiUseSlots = function () {};")
    own = d.find_element(By.ID, "own"); time.sleep(.5)
    two(own, bx, by); time.sleep(1.2)
    print("quick double press on a CONTROL BUTTON: slots", d.execute_script("return JSON.stringify(PolyBattle.slots)"))
    two(own, .5, .3); time.sleep(1.2)
    print("double-click on the BOARD:           slots", d.execute_script("return JSON.stringify(PolyBattle.slots)"))
finally:
    d.quit()
