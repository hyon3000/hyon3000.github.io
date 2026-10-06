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
    # A runs away in the middle of the game (closes the page): B wins at once
    js(A, "window.dispatchEvent(new Event('pagehide'))")
    time.sleep(1.5)
    print("B right after A ran away:", js(B, "return JSON.stringify({phase:PolyBattle.phase, result:PolyBattle.result(), over: window.__poly.state.goverflg, mode:PolyBattle.mode, why:PolyBattle.lostWhy})"))
    # the other way round, with a silent disconnect (page killed): the silence timeout
finally:
    A.quit(); B.quit()
