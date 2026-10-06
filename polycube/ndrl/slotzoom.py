import time, pathlib, http.server, threading, functools, json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from PIL import Image
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 9005), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o)
out = pathlib.Path("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad")
tiles = []
try:
    for name, page in (("2d", "polynomino/game.html"), ("3d", "game.html"), ("4d", "polytesseract/game.html")):
        d.set_window_size(1100, 914); d.get(f"http://127.0.0.1:9005/{page}?battle=1"); time.sleep(4)
        d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
        d.execute_script("var F=PolyBattle.oppFrame.contentWindow; try{F.PolyND.stop()}catch(e){}; try{F.PolyAIControl.stop()}catch(e){}; PolyBattle.slots=[116,117,125,8,126,118,21,104,9,5]; F.PolyBattle.slots=[116,117,125,8,126,118,21,104,9,5];"); time.sleep(1.5)
        r = json.loads(d.execute_script("""var cv=document.querySelector('#own canvas'), rc=cv.getBoundingClientRect(), k=rc.width/cv.width, r=PolyBattle.api.slotRect(cv.width,cv.height), br=PolyBattle.api.boardRect(cv.width,cv.height);
          return JSON.stringify({box:[rc.left+r[0]*k, rc.top+r[1]*k, r[2]*k, r[3]*k], board:[rc.left+br[0]*k, rc.top+br[1]*k, br[2]*k, br[3]*k], slots: PolyBattle.slots.length})"""))
        print(name, {k: [round(v, 1) for v in x] if isinstance(x, list) else x for k, x in r.items()}, "ratio w/h", round(r['box'][2] / r['box'][3], 2), flush=True)
        d.save_screenshot(str(out / f"zoom_{name}.png"))
        im = Image.open(out / f"zoom_{name}.png").convert("RGB"); bx, by, bw, bh = r['box']
        c = im.crop((int(bx - 20), int(by - 10), int(bx + bw + 20), int(by + bh + 10))); c = c.resize((c.width * 2, c.height * 2), Image.NEAREST); tiles.append(c)
finally: d.quit()
W = max(t.width for t in tiles); sheet = Image.new("RGB", (W, sum(t.height for t in tiles))); y = 0
for t in tiles: sheet.paste(t, (0, y)); y += t.height
sheet.save(out / "slotzoom.png")
