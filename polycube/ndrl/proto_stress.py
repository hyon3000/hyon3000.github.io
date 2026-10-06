import sys, time, json, pathlib, http.server, threading, functools, random
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 9010), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page = sys.argv[1] if len(sys.argv) > 1 else "game.html"; secs = int(sys.argv[2]) if len(sys.argv) > 2 else 60
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(1000, 914); d.set_script_timeout(60)
CODES = [116, 117, 125, 8, 9, 10, 16, 2, 6, 19, 18, 5, 21, 22, 11, 17, 127, 91, 200]
try:
    d.get(f"http://127.0.0.1:9010/{page}?battle=1"); time.sleep(4)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(5)
    d.execute_script("""var F=PolyBattle.oppFrame.contentWindow; window.__sent={me2opp:[], opp2me:[]}; window.__got={onOpp:[], onMe:[]};
      var fo=F.PolyBattle.api.applyStored; F.PolyBattle.api.applyStored=function(c){ var S=F.__poly.state; window.__got.onOpp.push([c, S.goverflg?1:0, S.startscreen?1:0]); return fo.apply(this,arguments) };
      var mo=PolyBattle.api.applyStored; PolyBattle.api.applyStored=function(c){ var S=window.__poly.state; window.__got.onMe.push([c, S.goverflg?1:0, S.startscreen?1:0]); return mo.apply(this,arguments) };""")
    t0 = time.time(); n = 0
    while time.time() - t0 < secs:
        c1, c2 = random.choice(CODES), random.choice(CODES)
        d.execute_script("""var F=PolyBattle.oppFrame.contentWindow; var c1=arguments[0], c2=arguments[1];
          PolyBattle.slots=[c1]; PolyBattle.useFrontNow('opponent'); window.__sent.me2opp.push(c1);
          F.PolyBattle.slots=[c2]; F.PolyBattle.useFrontNow('opponent'); window.__sent.opp2me.push(c2);""", c1, c2)
        n += 1; time.sleep(random.choice([0.15, 0.4, 1.0]))
        if n % 40 == 0:                      # now and then a game ends and the next one starts
            d.execute_script("PolyBattle.api.forceOver();"); time.sleep(1.5)
            d.execute_script("PolyBattle.replay(function(){ window.__poly.state.goverflg = 0; })"); time.sleep(2.5)
    time.sleep(3)
    r = json.loads(d.execute_script("return JSON.stringify({sent: window.__sent, got: window.__got})"))
    def diff(sent, got):
        from collections import Counter
        cs, cg = Counter(sent), Counter(g[0] for g in got)
        miss = {k: cs[k] - cg.get(k, 0) for k in cs if cs[k] > cg.get(k, 0)}
        late = [g for g in got if g[1] or g[2]]
        return miss, len(late)
    print("items me -> opponent: sent", len(r['sent']['me2opp']), "arrived", len(r['got']['onOpp']), "| missing by code", diff(r['sent']['me2opp'], r['got']['onOpp'])[0], "| arrived while its game was over/restarting:", diff(r['sent']['me2opp'], r['got']['onOpp'])[1])
    print("items opponent -> me: sent", len(r['sent']['opp2me']), "arrived", len(r['got']['onMe']), "| missing by code", diff(r['sent']['opp2me'], r['got']['onMe'])[0], "| arrived while my game was over/restarting:", diff(r['sent']['opp2me'], r['got']['onMe'])[1])
finally: d.quit()
