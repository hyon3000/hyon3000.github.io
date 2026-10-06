import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8975), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page = sys.argv[1] if len(sys.argv) > 1 else "game.html"
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 914); d.set_script_timeout(60)
url = (sys.argv[2] if len(sys.argv) > 2 else f"http://127.0.0.1:8975/{page}?battle=1")
try:
    d.get(url); t1 = d.current_window_handle; time.sleep(3)
    d.execute_script("window.open(arguments[0], '_blank', 'width=900,height=914')", url); time.sleep(4)
    t2 = [w for w in d.window_handles if w != t1][0]
    def go(t, code):
        d.switch_to.window(t); return d.execute_script(code)
    for t in (t1, t2): go(t, "window.__errs=[]; window.addEventListener('error',function(e){window.__errs.push(e.message)}); PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; });")
    t0 = time.time(); ok = False
    while time.time() - t0 < 20:
        a = go(t1, "return PolyBattle.mode"); b = go(t2, "return PolyBattle.mode")
        if a == "peer" and b == "peer": ok = True; break
        time.sleep(0.5)
    print("auto connected:", ok, a, b, "after", round(time.time() - t0, 1), "s", flush=True)
    time.sleep(3)
    for n, t in (("tab1", t1), ("tab2", t2)):
        print(n, go(t, "return JSON.stringify({mode:PolyBattle.mode, snap:!!PolyBattle.opp.snap, err:window.__errs, started: window.__poly.state.startscreen})"))
    go(t2, "window.__ap=[]; var o=PolyBattle.api.applyStored; PolyBattle.api.applyStored=function(c){window.__ap.push(c); return o.apply(this,arguments)};")
    go(t1, "PolyBattle.slots.push(125); PolyBattle.useFrontNow('opponent');"); time.sleep(3)
    print("tab2 applied:", go(t2, "return JSON.stringify(window.__ap)"))
    for n, t in (("tab1", t1), ("tab2", t2)):
        print(n, "layout:", go(t, "var q=function(i){var e=document.getElementById(i),r=e.getBoundingClientRect();return [i,Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]}; return JSON.stringify([q('oppbox'),q('oppw'),q('oppslots')])"))
    d.switch_to.window(t1); d.save_screenshot("/tmp/claude-1000/-home-a-Desktop-stuff-polycube/e838e2f1-83f4-4d95-bef7-514d5f6ef727/scratchpad/peer_layout_%s.png" % page.split("/")[0].replace(".html", ""))
    go(t1, "PolyBattle.api.forceOver()"); time.sleep(3)
    for n, t in (("tab1", t1), ("tab2", t2)): print(n, "after tab1 died:", go(t, "return JSON.stringify({phase:PolyBattle.phase, loser:PolyBattle.loser})"))
finally: d.quit()
