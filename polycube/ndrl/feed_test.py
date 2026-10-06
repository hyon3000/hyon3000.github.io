import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8821), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
try:
    d.get("http://127.0.0.1:8821/polynomino/game.html?battle=1"); time.sleep(5)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(6)
    cnt = "var b = PolyBattle.oppFrame.contentWindow.__poly.state.board, n = 0; for (var r = 0; r < b.length; r++) for (var c = 0; c < b[r].length; c++) if (b[r][c]) n++; return n;"
    print("opp cells before", d.execute_script(cnt))
    d.execute_script("PolyBattle.store(117); PolyBattle.select(0);")
    d.execute_script("document.getElementById('oppw').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}))"); time.sleep(1.5)
    print("opp cells after +2 lines fed to the opponent", d.execute_script(cnt))
    print("my slots", d.execute_script("return JSON.stringify(PolyBattle.slots)"))
    # the opponent AI's items: give the opponent frame a harmful item to use on me
    mine = "var b = window.__poly.state.board, n = 0; for (var r = 0; r < b.length; r++) for (var c = 0; c < b[r].length; c++) if (b[r][c]) n++; return n"
    print("my cells before", d.execute_script(mine))
    d.execute_script("var F = PolyBattle.oppFrame.contentWindow; F.PolyBattle.slots[0] = 125; F.PolyBattle.aiUseSlots();"); time.sleep(1)
    print("my board cells", d.execute_script("var b = window.__poly.state.board, n = 0; for (var r = 0; r < b.length; r++) for (var c = 0; c < b[r].length; c++) if (b[r][c]) n++; return n"))
finally:
    d.quit()
