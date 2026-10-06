import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8921), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page, mode = sys.argv[1], sys.argv[2]
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
count = {"2d": "var b = __poly.state.board, n = 0; for (var r = 0; r < b.length; r++) for (var c = 0; c < b[r].length; c++) if (b[r][c]) n++; return n;",
         "3d": "var b = __poly.state.blk, n = 0; for (var x = 0; x < 7; x++) for (var y = 0; y < 7; y++) for (var z = 0; z < 26; z++) if (b[x][y][z]) n++; return n;",
         "4d": "var b = __poly.state.blk, n = 0; for (var x = 0; x < 7; x++) for (var y = 0; y < 7; y++) for (var z = 0; z < 26; z++) for (var w = 0; w < 7; w++) if (b[x][y][z][w]) n++; return n;"}[mode]
fill = {"2d": "var b = __poly.state.board; for (var r = 0; r < 6; r++) for (var c = 0; c < 10; c++) b[r][c] = (c === 9 - r) ? 0 : 40;",
        "3d": "var b = __poly.state.blk; for (var x = 0; x < 7; x++) for (var y = 0; y < 7; y++) for (var z = 0; z < 4; z++) b[x][y][z] = ((x + y + z) % 5 === 0) ? 0 : 40;",
        "4d": "var b = __poly.state.blk; for (var x = 0; x < 7; x++) for (var y = 0; y < 7; y++) for (var z = 0; z < 3; z++) for (var w = 0; w < 7; w++) b[x][y][z][w] = ((x + y + z + w) % 5 === 0) ? 0 : 40;"}[mode]
try:
    d.get(f"http://127.0.0.1:8921/{page}"); time.sleep(5)
    d.execute_script("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message+' @'+e.lineno));")
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
    d.execute_script("PolyBattle.oppFrame.contentWindow.PolyBattle.slots = [];")
    d.execute_script(fill); n0 = d.execute_script(count)
    d.execute_script("PolyBattle.api.applyStored(118); window.__btCenter = null;")
    d.execute_script("window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Enter'}));"); time.sleep(.4)      # the falling block locks: nothing yet
    n1 = d.execute_script(count); c1 = d.execute_script("return window.__btCenter")
    d.execute_script("window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Enter'}));"); time.sleep(.4)      # the next block locks: the effect, centred on it
    n2 = d.execute_script(count); c2 = d.execute_script("return JSON.stringify(window.__btCenter)")
    print(mode, "cells before", n0, "| after 1st lock", n1, "centre", c1, "| after 2nd lock", n2, "centre", c2)
    print("errors:", d.execute_script("return JSON.stringify(window.__errs)"))
finally:
    d.quit()
