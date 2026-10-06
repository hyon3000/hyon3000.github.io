import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8969), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o)
out = pathlib.Path("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad")
pages = {"3d": "game.html", "4d": "polytesseract/game.html", "2d": "polynomino/game.html"}
try:
    for dim in sys.argv[1].split(","):
        for mode in ("normal", "battle"):
            d.set_window_size(900, 914) if mode == "normal" else d.set_window_size(1100, 914)
            d.get(f"http://127.0.0.1:8969/{pages[dim]}" + ("?battle=1" if mode == "battle" else "")); time.sleep(5)
            if mode == "battle":
                d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(6)
                d.execute_script("try{PolyBattle.oppFrame.contentWindow.PolyND.stop()}catch(e){}; var P=PolyBattle; [116,117,125,8,126,118,21,104,9,5].forEach(function(c){P.slots.push(c)});")
            else:
                d.execute_script("window.__poly.state.startscreen = 0;"); time.sleep(3)
            time.sleep(1); d.save_screenshot(str(out / f"ui_{dim}_{mode}.png"))
finally: d.quit()
