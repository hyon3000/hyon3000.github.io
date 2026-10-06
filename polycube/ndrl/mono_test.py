import time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8991), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(1000, 914)
JS = {"3d": ("var nb=S.nextblock, cells=[]; for(var x=0;x<7;x++)for(var y=0;y<7;y++)for(var z=0;z<7;z++) if(nb[x][y][z]) cells.push(nb[x][y][z]); return JSON.stringify({cells:cells, tie:nb._mono});", "enter"),
      "4d": ("var nb=S.nextblock, cells=[]; for(var x=0;x<7;x++)for(var y=0;y<7;y++)for(var z=0;z<7;z++)for(var w=0;w<7;w++) if(nb[x][y][z][w]) cells.push(nb[x][y][z][w]); return JSON.stringify({cells:cells, tie:nb._mono});", "enter"),
      "2d": ("var nb=S.nextblock; return JSON.stringify({cells:nb.vals, tie:nb._mono});", "enter")}
try:
    for name, page in (("3d", "game.html"), ("2d", "polynomino/game.html"), ("4d", "polytesseract/game.html")):
        d.get(f"http://127.0.0.1:8991/{page}?battle=1"); time.sleep(4)
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
        d.execute_script("var F=PolyBattle.oppFrame.contentWindow; try{F.PolyND.stop()}catch(e){}; try{F.PolyAIControl.stop()}catch(e){}")
        d.execute_script("var S=window.__poly.state; S.pause=false; PolyBattle.slots=[126,102,8];")
        d.execute_script("PolyBattle.useFrontNow('self')")     # row delete, then top delete
        d.execute_script("PolyBattle.useFrontNow('self')")
        print(name, "next block after two position items:", d.execute_script("var S=window.__poly.state; " + JS[name][0]), flush=True)
        # drop the current block and the mono; the first position item acts when the mono (the NEXT block) has locked
        for i in range(3):
            d.execute_script("window.dispatchEvent(new KeyboardEvent('keydown',{code:'Enter',key:'Enter',bubbles:true}))"); time.sleep(0.5)
            print("  after drop", i + 1, d.execute_script("var S=window.__poly.state; " + JS[name][0]), "center", d.execute_script("return JSON.stringify(window.__btCenter||null)"), flush=True)
finally: d.quit()
