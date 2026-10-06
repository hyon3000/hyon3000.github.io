import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); handler.log_message = lambda *a, **k: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8779), handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless")
d = webdriver.Firefox(options=o); d.set_window_size(1400, 900)
try:
    d.get("http://127.0.0.1:8779/index.html"); time.sleep(4)
    w0 = d.execute_script("return document.querySelector('.polycube-window').getBoundingClientRect().width")
    d.execute_script("toggleBattle()"); time.sleep(5)
    w1 = d.execute_script("return document.querySelector('.polycube-window').getBoundingClientRect().width")
    print("window width normal", w0, "battle", w1, "ratio", w1 / w0, "| menu text:", d.execute_script("return document.querySelector('.poly-battle-toggle a').textContent"))
    print("iframe", d.execute_script("return document.getElementById('game').src"))
    d.save_screenshot("/tmp/bt/shell_battle.png")
    d.execute_script("toggleBattle()"); time.sleep(3)
    print("back:", d.execute_script("return document.getElementById('game').src"), d.execute_script("return document.querySelector('.polycube-window').getBoundingClientRect().width"))
finally:
    d.quit()
