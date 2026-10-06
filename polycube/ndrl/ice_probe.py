import time, sys, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8974), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless")
for kv in sys.argv[1:]:
    k, v = kv.split("="); o.set_preference(k, v == "true" if v in ("true", "false") else v)
d = webdriver.Firefox(options=o); d.set_script_timeout(30)
try:
    d.get("http://127.0.0.1:8974/game.html"); time.sleep(3)
    print(d.execute_async_script("""var cb=arguments[arguments.length-1]; var pc=new RTCPeerConnection({iceServers:[]}); pc.createDataChannel('x'); var c=[];
      pc.onicecandidate=function(e){ if(!e.candidate){cb(c.join('\\n')); return;} c.push(e.candidate.candidate)};
      pc.createOffer().then(function(o){return pc.setLocalDescription(o)}); setTimeout(function(){cb(c.join('\\n')+'\\n(timeout)')},4000);"""))
    print(d.execute_script("return navigator.userAgent"))
finally: d.quit()
