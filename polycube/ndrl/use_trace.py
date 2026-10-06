import sys, time, pathlib, http.server, threading, functools, json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8964), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 914)
try:
    d.get(f"http://127.0.0.1:8964/{sys.argv[1]}"); time.sleep(5)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(3)
    d.execute_script("""window.__tr=[]; var P=PolyBattle, st=P.store, a=P.api.applyStored;
      P.api.applyStored=function(c){window.__tr.push(['apply',c, P.slots.length]); return a.apply(this,arguments)};
      P.onUseOnOpponent=null;
      var u=P.useFrontNow; P.useFrontNow=function(t){window.__tr.push(['use',t,P.slots[0]]); return u.apply(this,arguments)};
      var og=P.store; P.store=function(c){var r=og.apply(this,arguments); window.__tr.push(['store',c,r,P.slots.length]); return r};""")
    d.execute_script("(window.PolyND ? PolyND.start() : PolyAIControl.start());")
    print(d.execute_script("return typeof window.__tr"), flush=True)
    for i in range(int(sys.argv[2])//5):
        time.sleep(5)
    print(json.dumps(d.execute_script("return JSON.stringify(window.__tr)")))
finally: d.quit()
