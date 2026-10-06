"""Time-sliced planning must give exactly the plan a one-shot search gives (and the game must keep running while it thinks)."""
import json, pathlib, sys, quickjs
root = pathlib.Path(__file__).parent.parent
web = root / "web"
STUBS = r"""
var window = globalThis; window.window = window;
var __t = 100000; var performance = { now: function () { return __t; } };
var Image = function () {};
var ctxProxy = new Proxy(function () {}, { get: function (t, k) { if (k === 'measureText') return function () { return { width: 10 }; }; return ctxProxy; }, set: function () { return true; }, apply: function () { return ctxProxy; } });
var canvasStub = { getContext: function () { return ctxProxy; }, addEventListener: function () {}, style: {}, width: 400, height: 800, getBoundingClientRect: function () { return { left: 0, top: 0, width: 400, height: 800 }; }, setPointerCapture: function () {} };
var document = { getElementById: function (id) { return id === 'app' ? canvasStub : null; }, querySelectorAll: function () { return []; }, createElement: function () { return {}; }, head: { appendChild: function () {} } };
window.innerWidth = 400; window.innerHeight = 800; window.devicePixelRatio = 1; window.addEventListener = function () {};
window.location = { search: '' }; var navigator = { language: 'en' };
var localStorage = { getItem: function () { return null; }, setItem: function () {} };
var URLSearchParams = function () { this.get = function () { return null; }; };
window.requestAnimationFrame = function () {}; var requestAnimationFrame = window.requestAnimationFrame;
window.atob = function (s) { var c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',o='',b=0,n=0; for (var i=0;i<s.length;i++){var v=c.indexOf(s[i]);if(v<0)continue;b=(b<<6)|v;n+=6;if(n>=8){n-=8;o+=String.fromCharCode((b>>n)&255);}} return o; }; var atob = window.atob;
var __rs = 1;
Math.random = function () { __rs = (__rs + 0x6D2B79F5) >>> 0; var t = __rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
window.__rngHook = { get: function () { return __rs; }, set: function (v) { __rs = v; } };
"""
MODEL = (web / "ai-model.js").read_text()
def run(sliced):
    ctx = quickjs.Context(); ctx.set_time_limit(3000); ctx.eval(STUBS)
    for f in ["rawblock-data.js", "ai.js", "app.js"]: ctx.eval((web / f).read_text())
    ctx.execute_pending_job()
    ctx.eval(MODEL)
    ctx.eval("""
var P = window.__poly, S = P.state;
S.rawblock = window.RAWBLOCK_DATA_2D; S.ready = true; S.startscreen = 0; P.setItems(true); __rs = 5; P.init();
PolyAI.load(window.POLY_AI_MODEL); P.ai.on = true;
var calls = 0, SLICED = %s;
window.__aiSliceReset = function () { calls = 0; };
window.__aiSliceHook = function () { return SLICED && (++calls >= 40); };   // like a clock: once the slice is used up it stays expired
var frames = 0, planFrames = 0, plans = [];
function run(maxFrames) {
  while (plans.length < 3 && frames < maxFrames) {
    __t += 1; frames++;
    var before = P.ai.plan;
    P.logicFrame();
    if (P.ai.gen) planFrames++;
    if (P.ai.plan && P.ai.plan !== before && P.ai.plan.length) plans.push(P.ai.plan.slice());
  }
}
""" % ("true" if sliced else "false"))
    ctx.eval("run(4000)")
    return json.loads(ctx.eval("JSON.stringify({plans: plans, planFrames: planFrames, frames: frames})"))
a = run(False); b = run(True)
print("one-shot plans:", a["plans"], "| planning spanned", a["planFrames"], "frames")
print("sliced   plans:", b["plans"], "| planning spanned", b["planFrames"], "frames (the game kept running meanwhile)")
print("SAME PLANS" if a["plans"] == b["plans"] and b["planFrames"] > a["planFrames"] else "DIFFERENT / NOT SLICED")
