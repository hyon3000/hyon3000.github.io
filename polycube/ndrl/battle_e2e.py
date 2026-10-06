import sys, time, pathlib, http.server, threading, functools, json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8961), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page, secs = sys.argv[1], int(sys.argv[2])
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000); d.set_script_timeout(120)
try:
    d.get(f"http://127.0.0.1:8961/{page}"); time.sleep(5)
    d.execute_script("window.__errs=[];window.addEventListener('error',e=>window.__errs.push(e.message+' @'+e.lineno));")
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(3)
    d.execute_script("(window.PolyND ? PolyND.start() : PolyAIControl.start());"); time.sleep(8)
    # give both sides items now and then so the item decisions get exercised
    t0 = time.time()
    while time.time() - t0 < secs:
        d.execute_script("var P = PolyBattle, F = P.oppFrame.contentWindow.PolyBattle; [116, 117, 125, 8, 126, 118, 21, 104, 9, 5].forEach(function (c) { if (P.slots.length < 10 && Math.random() < 0.5) P.slots.push(c); if (F.slots.length < 10 && Math.random() < 0.5) F.slots.push(c); });")
        time.sleep(10)
        print(d.execute_script("var S = window.__poly.state, a = window.PolyND ? PolyND._ai : null; var F = PolyBattle.oppFrame.contentWindow; var fa = F.PolyND ? F.PolyND._ai : null; return JSON.stringify({score: S.score, over: S.goverflg, slots: PolyBattle.slots.length, oppSlots: PolyBattle.opp.slots.length, useStats: a && a.useStats, oppUseStats: fa && fa.useStats, oppOn: fa && fa.on, oppPieces: F.__poly && F.__poly.state && F.__poly.state.score, oppOver: F.__poly && F.__poly.state.goverflg, phase: PolyBattle.phase, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, errs: window.__errs})"), flush=True)
finally:
    d.quit()
