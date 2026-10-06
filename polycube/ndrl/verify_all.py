"""Final visual check in headless Firefox: normal mode must look exactly like before; battle mode: wide main screen, pairing, split game, game over."""
import sys, time, pathlib, http.server, threading, functools, io
import numpy as np
from PIL import Image
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
def serve(directory, port):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory)); h.log_message = lambda *a, **k: None
    s = http.server.ThreadingHTTPServer(("127.0.0.1", port), h); threading.Thread(target=s.serve_forever, daemon=True).start()
serve(root, 8801); serve("/tmp/base", 8802)
GAMES = {"2d": ("polynomino/game.html", 0.56), "3d": ("game.html", 0.6), "4d": ("polytesseract/game.html", 0.6)}
o = Options(); o.add_argument("-headless")
d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
def shot(name):
    d.save_screenshot(f"/tmp/bt/v_{name}.png"); return Image.open(f"/tmp/bt/v_{name}.png").convert("RGB")
def click(el, fx, fy):
    ActionChains(d).move_to_element_with_offset(el, int(el.size['width'] * (fx - .5)), int(el.size['height'] * (fy - .5))).click_and_hold().pause(0.2).release().perform()
res = {}
try:
    for g, (page, sy) in GAMES.items():
        # 1. normal mode vs the original (HEAD) page
        d.get(f"http://127.0.0.1:8802/{page}"); time.sleep(6); a = np.asarray(shot(f"{g}_base_start")).astype(int)
        d.get(f"http://127.0.0.1:8801/{page}"); time.sleep(6); b = np.asarray(shot(f"{g}_now_start")).astype(int)
        diff = np.abs(a - b).sum(2) > 60
        ys, xs = np.nonzero(diff)
        res[f"{g} normal start screen vs original"] = f"{diff.mean()*100:.2f}% pixels differ" + (f", bbox x {xs.min()}-{xs.max()} y {ys.min()}-{ys.max()}" if diff.any() else "")
        # 2. battle: wide main screen, pairing, split game
        d.get(f"http://127.0.0.1:8801/{page}?battle=1"); time.sleep(6)
        d.execute_script("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message+' @'+e.lineno));")
        shot(f"{g}_battle_start")
        own = d.find_element(By.ID, "own"); click(own, .5, sy); time.sleep(1.5); shot(f"{g}_battle_pair")
        d.find_element(By.ID, "bt-ai").click(); time.sleep(7)
        d.execute_script("PolyBattle.store(125); PolyBattle.store(126); PolyBattle.store(4);"); time.sleep(5)
        shot(f"{g}_battle_game")
        res[f"{g} battle layout"] = d.execute_script("""var r = id => { var e = document.getElementById(id); if (!e) return null; var b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
          return JSON.stringify({split: document.getElementById('viewport').classList.contains('split'), own: r('own'), opp: r('oppw'), oppslots: r('oppslots'), slots: r('slots'), pause_button_in_game: false, errs: window.__errs})""")
        # 3. game over screen in battle mode (wide)
        d.execute_script("window.__poly.state.goverflg = 1;"); time.sleep(2); shot(f"{g}_battle_over")
        res[f"{g} after game over"] = d.execute_script("return JSON.stringify({split: document.getElementById('viewport').classList.contains('split'), errs: window.__errs})")
finally:
    d.quit()
for k, v in res.items(): print(k, "->", v)
