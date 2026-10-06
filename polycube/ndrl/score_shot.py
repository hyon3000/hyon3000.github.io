import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 9004), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(1000, 760)
out = pathlib.Path("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad")
try:
    for name, page in (("3d", "game.html"), ("4d", "polytesseract/game.html")):
        for mode in ("normal", "battle"):
            d.get(f"http://127.0.0.1:9004/{page}" + ("?battle=1" if mode == "battle" else "")); time.sleep(4)
            if mode == "battle":
                d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
                d.execute_script("var F=PolyBattle.oppFrame.contentWindow; try{F.PolyND.stop()}catch(e){}")
            else:
                d.execute_script("window.__poly.state.startscreen = 0;"); time.sleep(2)
            for sc in (0, 7, 450, 12345, 987654321):
                d.execute_script("var S=window.__poly.state; S.oscore=%d; S.goverflg=1;" % sc); time.sleep(0.6)
                d.save_screenshot(str(out / f"score_{name}_{mode}_{sc}.png"))
finally: d.quit()
