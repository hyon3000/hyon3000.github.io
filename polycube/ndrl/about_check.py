import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8931), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); o.add_argument("--lang=ko"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
js = """var out = []; document.querySelectorAll('.it').forEach(function (it) { var im = it.querySelector('img'); if (im && /item_210|item_242|item_145|item_178|sp_scoreboost/.test(im.getAttribute('alt'))) { var box = it.closest('.ao'); out.push([box ? box.id : null, (it.closest('.lang-en') ? 'en' : 'ko/inline'), it.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120)]); } }); return JSON.stringify(out);"""
try:
    for page in ("polynomino/game.html", "game.html", "polytesseract/game.html"):
        for q in ("", "?battle=1"):
            d.get(f"http://127.0.0.1:8931/{page}{q}"); time.sleep(4)
            print(page, q or "(normal)", d.execute_script(js))
    d.get("http://127.0.0.1:8931/game.html?battle=1"); time.sleep(4)
    d.execute_script("var s = window.__poly.state; s.startscreen = 1; for (var i = 1; i <= 9; i++) { var e = document.getElementById('about' + i); if (e && /item_145/.test(e.innerHTML)) { s.about = i; break; } }"); time.sleep(1.5)
    d.save_screenshot("/tmp/bt/about3d.png")
finally:
    d.quit()
