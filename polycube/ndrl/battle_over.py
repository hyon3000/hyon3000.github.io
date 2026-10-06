import sys, time, pathlib, http.server, threading, functools, json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8831), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page, tag, retry_y = sys.argv[1], sys.argv[2], float(sys.argv[3])
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
def click(el, fx, fy):
    ActionChains(d).move_to_element_with_offset(el, int(el.size['width'] * (fx - .5)), int(el.size['height'] * (fy - .5))).click_and_hold().pause(0.2).release().perform()
def st(): return d.execute_script("var P = PolyBattle, F = P.oppFrame && P.oppFrame.contentWindow; return JSON.stringify({phase: P.phase, mine_over: __poly.state.goverflg, opp_over: F ? F.__poly.state.goverflg : null, split: document.getElementById('viewport').classList.contains('split'), msg: document.getElementById('btmsg').textContent, res: document.getElementById('btres').textContent, died: P.diedMs && Math.round(P.diedMs), oppdied: P.opp.diedMs && Math.round(P.opp.diedMs), highscore: localStorage.getItem('polycube_highscore'), slots: PolyBattle.slots})")
try:
    d.get(f"http://127.0.0.1:8831/{page}"); time.sleep(5)
    d.execute_script("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message+' @'+e.lineno));")
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(8)
    print("playing:", st())
    # (1) I die: the game ends for both at once, no waiting screen
    d.execute_script("__poly.gover();"); time.sleep(1.5)
    print("I died:", st()); d.save_screenshot(f"/tmp/bt/{tag}_i_died.png")
    own = d.find_element(By.ID, "own")
    # (2) RETRY: the AI counts as already pressed -> restarts at once
    click(own, .5, retry_y); time.sleep(3)
    print("after retry:", st()); d.save_screenshot(f"/tmp/bt/{tag}_restarted.png")
    # (3) the opponent dies first: my game ends at once, I win
    d.execute_script("var F = PolyBattle.oppFrame.contentWindow; F.__poly.gover();"); time.sleep(2)
    print("opponent died:", st()); d.save_screenshot(f"/tmp/bt/{tag}_opp_died.png")
    click(own, .5, retry_y); time.sleep(3)
    print("after retry 2:", st())
    print("errors:", d.execute_script("return JSON.stringify(window.__errs)"))
finally:
    d.quit()
