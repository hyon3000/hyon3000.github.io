"""Lockstep: C++ sim_nd vs the REAL game script (web/app.js or polytesseract/web/app.js) with identical RNG streams."""
import json, pathlib, sys, numpy as np, quickjs
from simnd import *

ROOT = pathlib.Path(__file__).parent.parent
web = ROOT / ("web" if DIM == 3 else "polytesseract/web")
N = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--decisions=")), 300))
SEED = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--seed=")), 7))
ctx = quickjs.Context(); ctx.set_time_limit(20000)
ctx.eval(r"""
var window = globalThis; window.window = window;
var __t = 99999; var performance = { now: function () { return __t; } };
var ctxProxy = new Proxy(function () {}, { get: function (t, k) { if (k === 'measureText') return function () { return { width: 10 }; }; return ctxProxy; },
  set: function () { return true; }, apply: function () { return ctxProxy; }, construct: function () { return ctxProxy; } });
var Image = function () { var s = this; Object.defineProperty(s, 'src', { set: function () { if (s.onerror) s.onerror(); } }); };
var canvasStub = { getContext: function () { return ctxProxy; }, addEventListener: function () {}, style: {}, width: 400, height: 800, parentElement: { appendChild: function () {} },
  getBoundingClientRect: function () { return { left: 0, top: 0, width: 400, height: 800 }; }, setPointerCapture: function () {} };
var document = { getElementById: function (id) { return id === 'app' ? canvasStub : null; }, createElement: function () { return canvasStub; }, querySelectorAll: function () { return []; },
  addEventListener: function () {}, body: canvasStub };
window.innerWidth = 400; window.innerHeight = 800; window.devicePixelRatio = 1;
window.addEventListener = function () {};
window.location = { search: '' };
var navigator = { language: 'en', maxTouchPoints: 0 };
var localStorage = { getItem: function () { return null; }, setItem: function () {} };
var URLSearchParams = function () { this.get = function () { return null; }; };
window.requestAnimationFrame = function () {}; var requestAnimationFrame = window.requestAnimationFrame;
window.FixedPipelineGL = function () { return ctxProxy; };
var __rs = 1;
Math.random = function () { __rs = (__rs + 0x6D2B79F5) >>> 0; var t = __rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Date = function () { this.getHours = function () { return 5; }; this.getMinutes = function () { return 30; }; this.getDate = function () { return 3; }; this.getMonth = function () { return 4; }; this.getFullYear = function () { return 2026; }; };
""")
ctx.eval("""
window.__battle = true;
window.PolyBattle = { on: true, trial: false, SLOTS: 10, STEP: 1, slots: [], api: null,
  store: function (code) { if (!this.api || !this.api.itemDesc || !this.api.itemDesc(code)) return false; if ([1, 30, 31, 32, 98, 103, 120, 121, 122, 123].indexOf(code) >= 0) return false;
    if (this.trial) return true; if (this.slots.length < this.SLOTS) { this.slots.push(code); return true; } return false; },
  useAt: function (k, t) { for (var i = 0; i < k; i++) if (this.slots.length > 1) this.slots.push(this.slots.shift()); var c = this.slots.shift(); if (c && c !== 4 && t === 'self') this.api.applyStored(c); },
  clear: function () { this.slots = []; }, attach: function (api) { this.api = api; }, begin: function (cb) { cb(); }, canLeave: function () { return true; }, replay: function (cb) { cb(); }, aiUseSlots: function () {} };
""")
ctx.eval((ROOT / "web/ai-nd.js").read_text())
for f in ["rawblock-data.js", "app.js"]:
    try: ctx.eval((web / f).read_text())
    except Exception as ex: print("LOAD ERROR", f, ex); raise
for _ in range(50):
    if not ctx.execute_pending_job(): break
D = DIM
ctx.eval(f"""
var P = window.__poly, S = P.state; S.startscreen = 0; S.ready = true; S.goverflg = 0; S.pause = false;
__rs = {SEED}; P.init();
function cs(a, dims) {{ var c = 0; (function rec(x, d) {{ if (d === 0) {{ c = (c * 131 + x + 7) % 1000000007; return; }} for (var i = 0; i < x.length; i++) rec(x[i], d - 1); }})(a, dims); return c; }}
function summary() {{
  return [S.score, S.lines, S.level, __rs, cs(S.blk, {D}), cs(S.nowblock, {D}), cs(S.holdblock, {D}), cs(S.nextblock, {D}), S.nowhb, S.nexthb, S.holdhb,
    S.blockpos[0] * 1000 + S.blockpos[1] * 100 + S.blockpos[2], 0, S.speedup * 1000000 + S.spinlock * 10000 + S.hidenext * 100 + S.holdlock];
}}
var KEYS = ['KeyA','KeyZ','KeyS','KeyX','KeyD','KeyC','KeyF','KeyV','KeyG','KeyB','KeyH','KeyN'];
function runPlan(hd, seq, dx, dy, dw) {{
  if (hd) {{ var nb0 = S.nowblock; P.execKey('ShiftLeft'); if (S.nowblock === nb0) return; }}
  for (var i = 0; i < seq.length; i++) P.execKey(KEYS[seq[i]]);
  var n = Math.abs(dx); for (i = 0; i < n; i++) P.move(0, dx > 0 ? 1 : -1);
  n = Math.abs(dy); for (i = 0; i < n; i++) P.move(1, dy > 0 ? 1 : -1);
  n = Math.abs(dw); for (i = 0; i < n; i++) P.move(3, dw > 0 ? 1 : -1);
  P.execKey('Enter'); S.goverflg = 0;
}}
""")
env = VecEnv(1, seeds=np.array([SEED], np.uint32)); env.set_battle(True, 1)
rng = np.random.default_rng(3)
ITEMS = [116, 117, 118, 119, 104, 124, 125, 91, 102, 126, 105, 127, 17, 20, 21, 22, 11, 2, 8, 9, 10, 5, 6, 204, 200, 19, 18, 4, 32, 103]
envB = VecEnv(1, seeds=np.array([SEED + 1000], np.uint32)); envB.set_battle(True, 8)
bad = 0; fields = ["score", "lines", "level", "rng", "board", "now", "hold", "next", "nowhb", "nexthb", "holdhb", "pos", "t", "flags"]
for d in range(N):
    # battle mode: random items appear in the queue, the front item is used on myself now and then (same on both sides)
    if rng.random() < 0.5:
        code = int(rng.choice(ITEMS)); env.push(0, code); ctx.eval("PolyBattle.slots.length < 10 && PolyBattle.slots.push(%d);" % code)
    mh = int(ctx.eval("(function(){var m=0; for(var x=0;x<7;x++)for(var y=0;y<7;y++)for(var z=0;z<26;z++){var c=S.blk[x][y][z]; if(Array.isArray(c)){for(var w=0;w<7;w++) if(c[w]&&z+1>m)m=z+1;} else if(c&&z+1>m)m=z+1;} return m;})()"))
    qn_ = int(env.queue(0)[0]); pk = int(rng.integers(0, min(4, qn_))) if qn_ else 0
    front = int(env.queue(0)[1 + pk]) if qn_ else 0
    if rng.random() < 0.45 and not (front in (117, 125) and mh >= 5):      # (death by added lines: test_overflow.py)
        env.use(0, 1 + 2 * pk); ctx.eval("PolyBattle.useAt(%d, 'self');" % pk)
    env.gen()
    live = np.nonzero(env.done[0, :env.counts[0]] == 0)[0]
    k = int(rng.choice(live)) if len(live) else 0
    hd, nrot, dx, dy, dw, code = [int(x) for x in env.info[0, k, :6]]
    seq = []
    for _ in range(nrot): seq.append(code % 12); code //= 12
    seq = seq[::-1]
    ctx.eval(f"runPlan({hd}, {json.dumps(seq)}, {dx}, {dy}, {dw})")
    env.step(np.array([k], np.int32), 100000)
    js = json.loads(ctx.eval("JSON.stringify(summary())"))
    cpp = env.summary(0)
    # --- item-use state: JS (real game + sanitised opponent snapshot) vs C++
    envB.gen(); liveB = np.nonzero(envB.done[0, :envB.counts[0]] == 0)[0]
    envB.step(np.array([int(rng.choice(liveB)) if len(liveB) else 0], np.int32), 100000)
    if rng.random() < 0.3: envB.push(0, int(rng.choice(ITEMS)))
    bl, nw, ps, qnB = envB.snapshot(0)
    env.gen()
    blind = int(ctx.eval("S.blindboard > __t ? 1 : 0"))
    if not blind:
        cx, _ = env.bstate(envB)
        jx = np.array(json.loads(ctx.eval("JSON.stringify(Array.prototype.slice.call(PolyND._bstate({ blk: %s, now: %s, pos: %s }, %d, PolyBattle.slots.slice(), null)))" % (json.dumps(bl.tolist()), json.dumps(nw.tolist()), json.dumps([int(v) for v in ps]), qnB))), np.float32)
        dif = np.abs(jx - cx[0]); worst = float(dif.max())
        if worst > 1e-4:
            bad += 1; idx = np.nonzero(dif > 1e-4)[0]; print("decision", d, "BSTATE MISMATCH max", worst, "at", idx[:8], "js", jx[idx[:4]], "cpp", cx[0][idx[:4]])
        nb = globals().get("nb_checked", 0) + 1; globals()["nb_checked"] = nb
    qj = json.loads(ctx.eval("JSON.stringify(PolyBattle.slots)")); qc = [int(v) for v in env.queue(0)[1:1 + int(env.queue(0)[0])]]
    if qj != qc: bad += 1; print("decision", d, "QUEUE MISMATCH js", qj, "cpp", qc)
    # after a game over the C++ side already re-initialised: compare anyway (same RNG continuation)
    diff = [(fields[i], js[i], int(cpp[i])) for i in range(14) if i not in (12,) and js[i] != int(cpp[i])]
    if diff:
        bad += 1; print("decision", d, "plan", (hd, seq, dx, dy, dw), "MISMATCH", diff[:5])
        if bad > 3: break
print("decisions", N, "mismatching", bad, "bstate checked", globals().get("nb_checked", 0))
