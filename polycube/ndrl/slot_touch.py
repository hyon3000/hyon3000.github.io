import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.action_chains import ActionChains
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8972), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(1100, 914)
out = pathlib.Path("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad")
try:
    for page in sys.argv[1:]:
        d.get(f"http://127.0.0.1:8972/{page}?battle=1"); time.sleep(5)
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
        d.execute_script("try{PolyBattle.oppFrame.contentWindow.PolyND.stop()}catch(e){}; try{PolyBattle.oppFrame.contentWindow.PolyAIControl.stop()}catch(e){}; PolyBattle.slots=[116,117,125,8];")
        time.sleep(0.5)
        pt = d.execute_script("""var cv=document.querySelector('#own canvas'), rc=cv.getBoundingClientRect(), k=rc.width/cv.width, r=PolyBattle.api.slotRect(cv.width,cv.height); return [rc.left+(r[0]+r[3]*0.5)*k, rc.top+(r[1]+r[3]*0.5)*k]""")
        before = d.execute_script("return PolyBattle.slots.join()")
        for _ in range(2):
            ActionChains(d).move_by_offset(0, 0).perform()
            ActionChains(d).move_to_element_with_offset(d.find_element("tag name", "body"), int(pt[0] - d.execute_script("return document.body.getBoundingClientRect().width")/2), int(pt[1] - d.execute_script("return document.body.getBoundingClientRect().height")/2)).click_and_hold().pause(0.1).release().perform()
            time.sleep(0.4)
            print(page, "before", before, "after", d.execute_script("return PolyBattle.slots.join()"), flush=True)
            before = d.execute_script("return PolyBattle.slots.join()")
        d.save_screenshot(str(out / ("slot_" + page.split("/")[0].replace(".html", "") + ".png")))
finally: d.quit()
