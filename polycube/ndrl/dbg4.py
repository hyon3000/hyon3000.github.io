import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8984), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_script_timeout(120)
try:
    t=time.time(); d.get("http://127.0.0.1:8984/polytesseract/game.html?battle=1"); print("loaded", round(time.time()-t,1)); time.sleep(3)
    t=time.time(); print(d.execute_async_script("var cb=arguments[arguments.length-1]; var sc=document.createElement('script'); sc.src='./polytesseract/web/ai-battle-4d.js'; sc.onload=function(){cb('ok')}; sc.onerror=function(){cb('err')}; document.head.appendChild(sc);"), round(time.time()-t,1))
    t=time.time(); print(d.execute_script("var m=window.POLY_AI_BATTLE_4D; return m? Object.keys(m).join(): 'none'"), round(time.time()-t,1))
    t=time.time(); print(d.execute_script("PolyND._loadModel2(window.POLY_AI_BATTLE_4D); return 'loaded'"), round(time.time()-t,1))
finally: d.quit()
