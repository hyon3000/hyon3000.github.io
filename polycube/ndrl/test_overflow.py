import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8968), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 914)
JS = {
 "3d": "for(var x=0;x<7;x++)for(var y=0;y<7;y++)for(var z=0;z<26;z++)S.blk[x][y][z]=0; for(var z=0;z<LV;z++) S.blk[2][2][z]=5;",
 "4d": "for(var x=0;x<7;x++)for(var y=0;y<7;y++)for(var z=0;z<26;z++)for(var w=0;w<7;w++)S.blk[x][y][z][w]=0; for(var z=0;z<LV;z++) S.blk[2][2][z][2]=5;",
 "2d": "for(var r=0;r<20;r++)for(var c=0;c<S.board[0].length;c++)S.board[r][c]=0; for(var r=0;r<LV;r++) S.board[r][2]=5;",
}
page = {"3d": "game.html", "4d": "polytesseract/game.html", "2d": "polynomino/game.html"}
top = {"3d": 9, "4d": 9, "2d": 20}
try:
    for dim in ("3d", "4d", "2d"):
        d.get(f"http://127.0.0.1:8968/{page[dim]}?battle=1"); time.sleep(5)
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
        d.execute_script("try{PolyBattle.oppFrame.contentWindow.location.href='about:blank'}catch(e){}")
        res = []
        for lv, code in ((top[dim] - 2, 125), (top[dim] - 1, 125), (top[dim] - 2, 117), (top[dim], 125)):
            r = d.execute_script("var S=window.__poly.state, LV=%d; S.goverflg=0; S.startscreen=0; %s PolyBattle.api.applyStored(%d); return S.goverflg" % (lv, JS[dim], code))
            res.append((lv, code, r))
        print(dim, "(stack height, item, game over after)", res, flush=True)
finally: d.quit()
