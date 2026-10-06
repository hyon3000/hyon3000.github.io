import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8901), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page, tag = sys.argv[1], sys.argv[2]
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
try:
    d.get(f"http://127.0.0.1:8901/{page}"); time.sleep(5)
    d.execute_script("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message+' @'+e.lineno));")
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(6)
    F = "PolyBattle.oppFrame.contentWindow.PolyBattle"
    d.execute_script(f"var F = {F}; F.__orig = F.aiUseSlots; F.aiUseSlots = function () {{}}; F.slots = [117, 8, 21];")
    d.execute_script("PolyBattle.slots = [4];"); time.sleep(1.5)
    oppw = d.find_element(By.ID, "oppw")
    a = ActionChains(d).move_to_element(oppw); a.click_and_hold().pause(.05).release().pause(.1).click_and_hold().pause(.05).release().perform()
    time.sleep(0.5); print("score2x mine:", d.execute_script("return window.__poly.state.score2x"))
    time.sleep(2.5)
    print("I steal:   my slots", d.execute_script("return JSON.stringify(PolyBattle.slots)"), "| opponent slots", d.execute_script(f"return JSON.stringify({F}.slots)"))
    d.save_screenshot(f"/tmp/bt/{tag}_stolen.png")
    # 4 on myself: nothing
    d.execute_script("PolyBattle.slots = [4, 125];"); own = d.find_element(By.ID, "own")
    sc = d.execute_script("return JSON.stringify([window.__poly.state.score, window.__poly.state.score2x])")
    ActionChains(d).move_to_element_with_offset(own, 0, -200).click_and_hold().pause(.05).release().pause(.1).click_and_hold().pause(.05).release().perform(); time.sleep(.8)
    print("4 on myself: slots", d.execute_script("return JSON.stringify(PolyBattle.slots)"), "| score,score2x before", sc, "after", d.execute_script("return JSON.stringify([window.__poly.state.score, window.__poly.state.score2x])"))
    # the opponent steals from me
    d.execute_script(f"var F = {F}; F.slots = [4]; F.aiUseSlots = F.__orig; window.__poly; PolyBattle.slots = [9, 21, 126];")
    time.sleep(0.3); d.execute_script(f"{F}.aiUseSlots()"); time.sleep(3)
    print("opp steals: my slots", d.execute_script("return JSON.stringify(PolyBattle.slots)"), "| opponent slots", d.execute_script(f"return JSON.stringify({F}.slots)"))
    print("errors:", d.execute_script("return JSON.stringify(window.__errs)"))
finally:
    d.quit()
