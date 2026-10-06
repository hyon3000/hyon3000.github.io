import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8941), h); threading.Thread(target=s.serve_forever, daemon=True).start()
js = """var r = []; document.querySelectorAll('.it').forEach(function (it) { var im = it.querySelector('img'); if (!im || !/item_210|item_242|item_145|item_178|sp_scoreboost/.test(im.getAttribute('alt'))) return; var box = it.closest('.ao'); if (!box || getComputedStyle(it).display === 'none') return; var vis = it.offsetParent !== null; var sp = it.querySelector('span'); var lh = parseFloat(getComputedStyle(sp).lineHeight) || (parseFloat(getComputedStyle(sp).fontSize) * 1.2); var neigh = []; it.parentElement.querySelectorAll('.it').forEach(function (o) { neigh.push(Math.round(o.getBoundingClientRect().height)); }); r.push({about: box.id, visible: vis, height: Math.round(it.getBoundingClientRect().height), lineH: Math.round(lh), lines: Math.round(it.getBoundingClientRect().height / lh), medianOther: neigh.sort(function (a, b) { return a - b; })[Math.floor(neigh.length / 2)]}); }); return JSON.stringify(r);"""
shots = {"polynomino/game.html": "about4", "game.html": "about9", "polytesseract/game.html": "about5"}
try:
    for lang in ("ko", "en"):
        o = Options(); o.add_argument("-headless"); o.set_preference("intl.accept_languages", lang); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
        try:
            for page, ab in shots.items():
                d.get(f"http://127.0.0.1:8941/{page}?battle=1"); time.sleep(4)
                d.execute_script("var s = window.__poly.state; s.startscreen = 1; s.about = parseInt(arguments[0].replace('about', ''));", ab); time.sleep(1.5)
                print(lang, page, d.execute_script(js))
                d.save_screenshot(f"/tmp/bt/about_{lang}_{page.split('/')[0].split('.')[0]}.png")
        finally:
            d.quit()
finally:
    pass
