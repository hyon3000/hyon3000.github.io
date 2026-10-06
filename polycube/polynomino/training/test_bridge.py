"""Shell <-> game protocol test: Cheat > Solve Automatically messages against the real app.js (quickjs, DOM stubbed)."""
import json, pathlib, quickjs
root = pathlib.Path(__file__).parent.parent.parent
web = root / "polynomino" / "web"
ctx = quickjs.Context(); ctx.set_time_limit(900)
ctx.eval(r"""
var window = globalThis; window.window = window;
var __t = 100000; var performance = { now: function () { return __t; } };
var Image = function () {};
var ctxProxy = new Proxy(function () {}, { get: function (t, k) { if (k === 'measureText') return function () { return { width: 10 }; }; return ctxProxy; }, set: function () { return true; }, apply: function () { return ctxProxy; } });
var canvasStub = { getContext: function () { return ctxProxy; }, addEventListener: function () {}, style: {}, width: 400, height: 800, getBoundingClientRect: function () { return { left: 0, top: 0, width: 400, height: 800 }; }, setPointerCapture: function () {} };
var __pendingScript = null;
var document = { getElementById: function (id) { return id === 'app' ? canvasStub : null; }, querySelectorAll: function () { return []; },
  createElement: function (tag) { return { tag: tag }; },
  head: { appendChild: function (el) { globalThis.__pendingScript = el; } } };
window.innerWidth = 400; window.innerHeight = 800; window.devicePixelRatio = 1;
var __handlers = {};
window.addEventListener = function (t, h) { (__handlers[t] = __handlers[t] || []).push(h); };
var __toShell = [];
window.parent = { postMessage: function (m) { __toShell.push(m); } };
var __intervals = []; window.setInterval = function (f) { __intervals.push(f); }; var setInterval = window.setInterval;
window.location = { search: '' }; var navigator = { language: 'en' };
var localStorage = { getItem: function () { return null; }, setItem: function () {} };
var URLSearchParams = function () { this.get = function () { return null; }; };
window.requestAnimationFrame = function () {}; var requestAnimationFrame = window.requestAnimationFrame;
window.atob = function (s) { var c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',o='',b=0,n=0; for (var i=0;i<s.length;i++){var v=c.indexOf(s[i]);if(v<0)continue;b=(b<<6)|v;n+=6;if(n>=8){n-=8;o+=String.fromCharCode((b>>n)&255);}} return o; }; var atob = window.atob;
""")
for f in [root / "autosolve-bridge.js", web / "rawblock-data.js", web / "ai.js", web / "app.js"]:
    ctx.eval(f.read_text())
for _ in range(20):
    if not ctx.execute_pending_job(): break
ctx.eval("""
var P = window.__poly, S = P.state;
S.rawblock = window.RAWBLOCK_DATA_2D; S.ready = true; P.setItems(true); P.init();
function shell(cmd) { (__handlers.message || []).forEach(function (h) { h({ data: { type: 'polycube-autosolve', cmd: cmd }, source: window.parent }); }); var m = __toShell[__toShell.length - 1]; return JSON.stringify(m); }
function frames(n) { for (var i = 0; i < n; i++) { __t += 16; P.logicFrame(); } }
function loadModel() { var el = __pendingScript; __pendingScript = null; if (!el) return 'no script requested'; eval(MODEL_SRC); el.onload(); return 'loaded ' + el.src; }
""")
ctx.eval("var MODEL_SRC = " + json.dumps((web / "ai-model.js").read_text()) + ";")
T = lambda code: ctx.eval(code)
ok = True
def check(name, cond, info=""):
    global ok; ok &= bool(cond); print(("PASS " if cond else "FAIL ") + name, info)

st = json.loads(T("shell('status')")); check("status reply on start screen", st["supported"] and st["dim"] == 2 and not st["running"] and not st["solving"], st)
T("shell('toggle')"); st = json.loads(T("shell('status')")); check("toggle does nothing while no game is running", not st["solving"] and T("__pendingScript") is None, st)
T("S.startscreen = 0"); st = json.loads(T("shell('status')")); check("game running -> running=true", st["running"] and not st["solving"], st)
r = T("shell('toggle')"); st = json.loads(r); check("toggle starts model loading (solving=true)", st["solving"], st)
check("model requested lazily", T("__pendingScript && __pendingScript.src") == "./web/ai-model.js", T("__pendingScript && __pendingScript.src"))
print(T("loadModel()"))
T("frames(1)"); st = json.loads(T("shell('status')")); check("solving after model loaded", st["solving"] and T("P.ai.on"), st)
import time as _t; _t0 = _t.time(); T("frames(400)"); print("   (400 frames incl. planning with the 2-ply search: %.1fs in quickjs)" % (_t.time() - _t0))
check("AI pressed keys and played a piece", T("P.ai.pieces") >= 1 and T("S.goverflg") == 0, "pieces=%s" % T("P.ai.pieces"))
st = json.loads(T("shell('toggle')")); check("toggle again stops auto-solve (game keeps running)", st["running"] and not st["solving"] and not T("P.ai.on"), st)
n = T("P.ai.pieces"); T("frames(600)"); check("no more inputs after stop", T("P.ai.pieces") == n)
T("shell('toggle')"); T("frames(1)"); check("restart works without reloading the model", T("P.ai.on") and T("__pendingScript") is None)
T("S.goverflg = 1; frames(2)"); st = json.loads(T("shell('status')")); check("auto-solve ends when the game is over", not st["solving"] and not T("P.ai.on"), st)
T("S.goverflg = 0; S.startscreen = 0; P.init()")
T("(__handlers.keydown || []).forEach(function (h) { h({ code: 'F3', repeat: false, preventDefault: function () {} }); }); frames(1)")
check("F3 inside the game toggles auto-solve", T("P.ai.on"))
print("ALL PASS" if ok else "SOME FAILED")
