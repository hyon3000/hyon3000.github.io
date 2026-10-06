import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8986), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(1000, 914)
try:
    for name, page in (("3d", "game.html"), ("2d", "polynomino/game.html"), ("4d", "polytesseract/game.html")):
        d.get(f"http://127.0.0.1:8986/{page}?battle=1"); time.sleep(4)
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(6)
        # stop the opponent AI, then feed rot-lock and try to rotate by hand
        print(name, d.execute_script("""var F=PolyBattle.oppFrame.contentWindow, S=F.__poly.state; try{F.PolyND.stop()}catch(e){} try{F.PolyAIControl.stop()}catch(e){}
          return JSON.stringify({before: S.spinlock})"""), flush=True)
        d.execute_script("PolyBattle.slots.push(91); PolyBattle.useFrontNow('opponent');"); time.sleep(3)
        print(name, d.execute_script("""var F=PolyBattle.oppFrame.contentWindow, S=F.__poly.state, P=F.__poly;
          var sig=function(){ return JSON.stringify(S.nowblock.cells ? S.nowblock.cells : S.nowblock) }; var a=sig();
          try { if (P.rotate) { P.rotate(%s); } else { P.execKey('KeyZ'); } } catch(e){ return 'err '+e.message }
          var b=sig(); return JSON.stringify({spinlock: S.spinlock, rotatedByHand: a!==b});""" % ("1, 1" if name != "2d" else "1")), flush=True)
finally: d.quit()
