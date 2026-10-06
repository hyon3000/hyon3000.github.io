import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 9003), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page = sys.argv[1] if len(sys.argv) > 1 else "game.html"
url = f"http://127.0.0.1:9003/{page}?battle=1"
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 914); d.set_script_timeout(60)
try:
    d.get(url); t1 = d.current_window_handle; time.sleep(3)
    d.execute_script("window.__w2 = window.open(arguments[0], '_blank', 'width=900,height=914')", url); time.sleep(4)
    t2 = [w for w in d.window_handles if w != t1][0]
    def go(t, code): d.switch_to.window(t); return d.execute_script(code)
    for t in (t1, t2): go(t, "PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; });")
    t0 = time.time()
    while time.time() - t0 < 10 and not (go(t1, "return PolyBattle.mode") == "peer" and go(t2, "return PolyBattle.mode") == "peer"): time.sleep(0.3)
    time.sleep(3)
    print("hosts:", go(t1, "return PolyBattle.isHost"), go(t2, "return PolyBattle.isHost"))
    for rnd, (s1, s2) in enumerate([(100, 50), (50, 100), (70, 70), (70, 70), (0, 30), (30, 0)]):
        go(t1, "window.__poly.state.score = %d; window.__w2.__poly.state.score = %d" % (s1, s2))
        time.sleep(0.5)                                              # (the scores reach the other side in the state messages)
        go(t1, "PolyBattle.api.forceOver(); window.__w2.PolyBattle.api.forceOver();")      # both die in the very same instant
        time.sleep(1.5)
        r1 = go(t1, "return PolyBattle.result()"); r2 = go(t2, "return PolyBattle.result()")
        print("round", rnd, "scores", s1, s2, "| tab1:", r1, "tab2:", r2, "| exactly one winner:", sorted([r1, r2]) == ["lose", "win"], flush=True)
        for t in (t1, t2): go(t, "PolyBattle.replay(function(){ window.__poly.state.goverflg = 0; })")
        time.sleep(2)
finally: d.quit()
