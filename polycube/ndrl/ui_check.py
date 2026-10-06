import sys, time, pathlib, http.server, threading, functools, json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8911), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page, tag = sys.argv[1], sys.argv[2]
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(int(sys.argv[3]) if len(sys.argv) > 3 else 900, int(sys.argv[4]) if len(sys.argv) > 4 else 1000)
try:
    d.get(f"http://127.0.0.1:8911/{page}"); time.sleep(5)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(6)
    d.execute_script("PolyBattle.slots = [117, 125, 8, 5, 9, 21, 126, 118, 104, 22]; var F = PolyBattle.oppFrame.contentWindow.PolyBattle; F.aiUseSlots = function () {}; F.slots = [116, 20, 102];")
    d.execute_script("var st = window.__poly.state; if (st.board) { st.board[0][4] = 121; } else { var b = st.blk; if (Array.isArray(b[3][3][0])) b[3][3][0][3] = 121; else b[3][3][0] = 121; }")
    time.sleep(2.5); d.save_screenshot(f"/tmp/bt/{tag}_ui.png")
    print(d.execute_script("var cv0 = document.querySelector('#own canvas'), r0 = PolyBattle.api.boardRect(cv0.width, cv0.height), ow = document.getElementById('oppw').getBoundingClientRect(), sl = document.getElementById('oppslots').getBoundingClientRect(); return JSON.stringify({my_block_area: [Math.round(r0[2]), Math.round(r0[3])], opp_window: [Math.round(ow.width), Math.round(ow.height)], ratio: [(ow.width / r0[2]).toFixed(3), (ow.height / r0[3]).toFixed(3)], opp_slots_w: Math.round(sl.width)})"))
    print(d.execute_script("var S = window.__poly.state, cv = document.querySelector('#own canvas'); var r = PolyBattle.api.slotRect(cv.width, cv.height); return JSON.stringify({canvas: [cv.width, cv.height], slotRect: r.map(Math.round), hint: document.getElementById('bthint').style.top})"))
finally:
    d.quit()
