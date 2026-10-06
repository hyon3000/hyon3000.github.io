import sys, time, json, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8970), h); threading.Thread(target=s.serve_forever, daemon=True).start()
page = sys.argv[1] if len(sys.argv) > 1 else "game.html"
def mk():
    o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 914); d.set_script_timeout(60); return d
A, B = mk(), mk()
def js(d, code): return d.execute_script(code)
def wait(d, cond, t=20):
    t0 = time.time()
    while time.time() - t0 < t:
        if js(d, "return !!(" + cond + ")"): return True
        time.sleep(0.3)
    return False
try:
    for d in (A, B):
        d.get(f"http://127.0.0.1:8970/{page}?battle=1" + __import__("os").environ.get("EXTRA", "")); time.sleep(4)
        js(d, "window.__errs=[]; window.addEventListener('error',function(e){window.__errs.push(e.message)}); PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; });")
    print("host code ready:", wait(A, "document.getElementById('bt-mycode').value.charAt(0)==='O'"))
    code = js(A, "return document.getElementById('bt-mycode').value"); print("offer code length", len(code))
    B.execute_script("document.getElementById('bt-in').value=arguments[0]; document.getElementById('bt-go').click()", code)
    print("answer ready:", wait(B, "document.getElementById('bt-mycode').value.charAt(0)==='A'"))
    ans = js(B, "return document.getElementById('bt-mycode').value"); print("answer code length", len(ans))
    A.execute_script("document.getElementById('bt-in').value=arguments[0]; document.getElementById('bt-go').click()", ans)
    print("connected:", wait(A, "PolyBattle.mode==='peer' && PolyBattle.paired"), wait(B, "PolyBattle.mode==='peer' && PolyBattle.paired"))
    time.sleep(4)
    for n, d in (("A", A), ("B", B)):
        print(n, js(d, "return JSON.stringify({mode:PolyBattle.mode, snap: !!PolyBattle.opp.snap, startscreen: window.__poly.state.startscreen, iframe: !!PolyBattle.oppFrame, errs: window.__errs})"))
    # an item from A on B
    js(B, "window.__ap=[]; var o=PolyBattle.api.applyStored; PolyBattle.api.applyStored=function(c){window.__ap.push(c); return o.apply(this,arguments)};")
    js(A, "PolyBattle.slots.push(125); PolyBattle.useFrontNow('opponent');")
    time.sleep(2.5); print("B applied:", js(B, "return JSON.stringify(window.__ap)"))
    # steal: B holds items, A steals
    js(B, "PolyBattle.slots.push(116); PolyBattle.slots.push(117);")
    time.sleep(0.5)
    js(A, "PolyBattle.slots.push(4); PolyBattle.useFrontNow('opponent');")
    time.sleep(3); print("after steal A slots", js(A, "return JSON.stringify(PolyBattle.slots)"), "B slots", js(B, "return JSON.stringify(PolyBattle.slots)"))
    # A dies -> both over
    js(A, "PolyBattle.api.forceOver()")
    time.sleep(2)
    for n, d in (("A", A), ("B", B)):
        print(n, "after A died:", js(d, "return JSON.stringify({phase:PolyBattle.phase, loser:PolyBattle.loser, over: window.__poly.state.goverflg})"))
    # both retry
    js(A, "PolyBattle.replay(function(){ window.__poly.state.goverflg = 0; })"); time.sleep(1)
    print("after only A retry B:", js(B, "return JSON.stringify({phase:PolyBattle.phase})"), js(A, "return JSON.stringify({phase:PolyBattle.phase})"))
    js(B, "PolyBattle.replay(function(){ window.__poly.state.goverflg = 0; })"); time.sleep(3)
    for n, d in (("A", A), ("B", B)):
        print(n, "after both retry:", js(d, "return JSON.stringify({phase:PolyBattle.phase, over: window.__poly.state.goverflg, oppover: PolyBattle.opp.over})"))
    # disconnect: A closes
    js(A, "PolyBattle.unpair()")
    time.sleep(4)
    print("B after A left:", js(B, "return JSON.stringify({mode:PolyBattle.mode, phase:PolyBattle.phase, over: window.__poly.state.goverflg, iframe: !!PolyBattle.oppFrame, errs: window.__errs})"))
    js(B, "PolyBattle.replay(function(){ window.__poly.state.goverflg = 0; })"); time.sleep(4)
    print("B retry vs AI:", js(B, "return JSON.stringify({mode:PolyBattle.mode, phase:PolyBattle.phase, over: window.__poly.state.goverflg, snap: !!PolyBattle.opp.snap})"))
finally:
    A.quit(); B.quit()
