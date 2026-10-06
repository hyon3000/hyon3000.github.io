import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 9002), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(1000, 914)
out = pathlib.Path("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad")
try:
    for name, page in (("3d", "game.html"), ("2d", "polynomino/game.html"), ("4d", "polytesseract/game.html")):
        d.get(f"http://127.0.0.1:9002/{page}?battle=1"); time.sleep(4)
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
        d.execute_script("var F=PolyBattle.oppFrame.contentWindow; try{F.PolyND.stop()}catch(e){}; try{F.PolyAIControl.stop()}catch(e){}")
        d.execute_script("PolyBattle.api.forceOver();"); time.sleep(1.5); d.execute_script("PolyBattle.loser = %s;" % ("'opp'" if name != "2d" else "'me'")); time.sleep(0.5)
        print(name, d.execute_script("return JSON.stringify({phase: PolyBattle.phase, result: PolyBattle.result()})"), flush=True)
        d.save_screenshot(str(out / f"result_lose_{name}.png"))
finally: d.quit()
