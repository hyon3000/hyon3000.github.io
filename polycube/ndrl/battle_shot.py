import sys, time, pathlib, http.server, threading, functools, json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); handler.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8777), handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
page = sys.argv[1]; tag = sys.argv[2]
o = Options(); o.add_argument("-headless"); o.add_argument("--width=900"); o.add_argument("--height=1000")
d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
try:
    d.get(f"http://127.0.0.1:8777/{page}"); time.sleep(5)
    d.execute_script("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message+' @'+e.lineno));")
    d.save_screenshot(f"/tmp/bt/{tag}_start.png")
    print("battle", d.execute_script("return window.__battle"))
    # press START by calling the click handler through the battle api (start button position differs per game)
    print(d.execute_script("return JSON.stringify({pb: !!window.PolyBattle, on: window.PolyBattle.on})"))
finally:
    d.quit()
