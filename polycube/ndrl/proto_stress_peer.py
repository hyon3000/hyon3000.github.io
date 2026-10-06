import sys, time, json, pathlib, http.server, threading, functools, random
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 9012), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page = sys.argv[1] if len(sys.argv) > 1 else "game.html"; secs = int(sys.argv[2]) if len(sys.argv) > 2 else 40
url = f"http://127.0.0.1:9012/{page}?battle=1"
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 914); d.set_script_timeout(60)
CODES = [116, 117, 125, 8, 9, 10, 16, 2, 6, 19, 18, 5, 21, 22, 11, 17, 127, 91, 200]
try:
    d.get(url); t1 = d.current_window_handle; time.sleep(3)
    d.execute_script("window.__w2 = window.open(arguments[0], '_blank', 'width=900,height=914')", url); time.sleep(4)
    def go(w, code, *args): d.switch_to.window(w); return d.execute_script(code, *args)
    t2 = [w for w in d.window_handles if w != t1][0]
    for t in (t1, t2): go(t, "PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; });")
    t0 = time.time()
    while time.time() - t0 < 10 and not (go(t1, "return PolyBattle.mode") == "peer" and go(t2, "return PolyBattle.mode") == "peer"): time.sleep(0.3)
    time.sleep(3)
    for t in (t1, t2): go(t, "try{ (window.PolyND||window.PolyAIControl).start() }catch(e){}")
    time.sleep(6)
    go(t1, """window.__got=[]; var o=PolyBattle.api.applyStored; PolyBattle.api.applyStored=function(c){window.__got.push(c); return o.apply(this,arguments)}; window.__sent=[]; var w=window.__w2; w.__got=[]; w.__sent=[];
      var o2=w.PolyBattle.api.applyStored; w.PolyBattle.api.applyStored=function(c){w.__got.push(c); return o2.apply(this,arguments)};""")
    t0 = time.time(); n = 0
    while time.time() - t0 < secs:
        c1, c2 = random.choice(CODES), random.choice(CODES)
        go(t1, """var w=window.__w2, c1=arguments[0], c2=arguments[1]; PolyBattle.slots=[c1]; PolyBattle.useFrontNow('opponent'); window.__sent.push(c1);
          w.PolyBattle.slots=[c2]; w.PolyBattle.useFrontNow('opponent'); w.__sent.push(c2);""", c1, c2)
        n += 1; time.sleep(random.choice([0.1, 0.3, 0.8]))
    time.sleep(4)
    r = json.loads(go(t1, "var w=window.__w2; return JSON.stringify({s1: window.__sent, g1: window.__got, s2: w.__sent, g2: w.__got, dropped: [PolyBattle.dropped, w.PolyBattle.dropped]})"))
    from collections import Counter
    print("tab1 -> tab2: sent", len(r['s1']), "applied on tab2", len(r['g2']), "| missing", dict((Counter(r['s1']) - Counter(r['g2']))))
    print("tab2 -> tab1: sent", len(r['s2']), "applied on tab1", len(r['g1']), "| missing", dict((Counter(r['s2']) - Counter(r['g1']))), "| dropped counters", r['dropped'])
finally: d.quit()
