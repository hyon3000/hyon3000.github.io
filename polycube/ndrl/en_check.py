import re, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8979), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); o.set_preference("intl.accept_languages", "en-US,en"); d = webdriver.Firefox(options=o); d.set_window_size(1100, 914)
H = re.compile("[ㄱ-ㆎ가-힣]")
try:
    print("navigator.language:", end=" ")
    for page in ("index.html", "game.html", "polytesseract/game.html", "polynomino/game.html"):
        d.get(f"http://127.0.0.1:8979/{page}" + ("?battle=1" if page != "index.html" else "")); time.sleep(5)
        if page == "index.html":
            print(d.execute_script("return navigator.language"))
            txt = d.execute_script("return document.body.innerText"); print(page, "korean chars in shell:", H.findall(txt)[:10])
            continue
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; });"); time.sleep(1)
        t1 = d.execute_script("return document.getElementById('bt-pair').innerText"); print(page, "pairing text korean:", H.findall(t1)[:5])
        d.execute_script("document.getElementById('bt-ai').click()"); time.sleep(5)
        d.execute_script("PolyBattle.slots=[116,117,125]"); time.sleep(1)
        t2 = d.execute_script("return document.getElementById('viewport').innerText"); print(page, "in-game text korean:", H.findall(t2)[:5])
        d.execute_script("window.__poly.state.about=0; PolyBattle.api.forceOver()"); time.sleep(2)
        t3 = d.execute_script("return document.getElementById('viewport').innerText"); print(page, "result screen korean:", H.findall(t3)[:5], repr(t3[:80]))
finally: d.quit()
