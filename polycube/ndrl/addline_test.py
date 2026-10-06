import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8966), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 914)
try:
    d.get("http://127.0.0.1:8966/" + sys.argv[1]); time.sleep(5)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(8)
    cnt = "var F=PolyBattle.oppFrame.contentWindow; var S=F.__poly.state; var b=S.blk||S.board; return JSON.stringify(b).replace(/[\\[\\]]/g,\"\").split(\",\").filter(function(v){v=+v; return v>0&&v<256}).length"
    d.execute_script("try{PolyBattle.oppFrame.contentWindow.PolyND.stop()}catch(e){}")
    for code in (125, 125, 125, 117, 117):
        a = d.execute_script(cnt); d.execute_script("PolyBattle.slots.push(%d); PolyBattle.useFrontNow('opponent');" % code); time.sleep(1.5)
        print(code, a, d.execute_script(cnt), flush=True)
finally: d.quit()
