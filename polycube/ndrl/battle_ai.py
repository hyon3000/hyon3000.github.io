import sys, time, pathlib, http.server, threading, functools, json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); handler.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8781), handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
page = sys.argv[1]; secs = int(sys.argv[2])
o = Options(); o.add_argument("-headless")
d = webdriver.Firefox(options=o); d.set_window_size(900, 1000); d.set_script_timeout(120)
try:
    d.get(f"http://127.0.0.1:8781/{page}"); time.sleep(6)
    d.execute_script("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message+' @'+e.lineno));")
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click(); window.__poly.init();")
    time.sleep(1)
    d.execute_script("(window.PolyND ? PolyND.start() : PolyAIControl.start());")
    time.sleep(8)
    d.execute_script("PolyBattle.store(125); PolyBattle.store(116); PolyBattle.store(117); PolyBattle.store(4);")
    print("slots filled:", d.execute_script("return JSON.stringify(PolyBattle.slots)"))
    t0 = time.time()
    while time.time() - t0 < secs:
        time.sleep(10)
        print(d.execute_script("var S = window.__poly.state; return JSON.stringify({score: S.score, lines: S.lines, over: S.goverflg, slots: PolyBattle.slots, oppItems: PolyBattle.opp.items, errs: window.__errs})"), flush=True)
finally:
    d.quit()
