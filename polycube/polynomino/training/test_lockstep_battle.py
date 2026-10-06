"""Lockstep check: C++ sim.cpp vs the REAL web/app.js (DOM stubbed, run in quickjs) with identical RNG streams.

The JS side runs the real frame loop (1 ms frames): aiTick (one input / 200 ms), gravity, items... with
PolyAI.pick replaced by "take candidate k", where k is chosen in Python. At every decision root we compare
the game state (score, lines, level, RNG, board checksum, clocks, piece position) and all candidates
(action, status, lines, feature vector). Blind / speed / hide-next / lock states are injected at random.
"""
import json, pathlib, sys, time
import numpy as np, quickjs
from simlib import VecEnv

web = pathlib.Path(__file__).parent.parent / "web"
ITEMS = "--noitems" not in sys.argv
GREEDY = "--greedy" in sys.argv
INJECT = "--noinject" not in sys.argv
PIECES = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--decisions=")), 300))
SEED = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--seed=")), 7))

ctx = quickjs.Context()
ctx.set_time_limit(6000)
ctx.eval(r"""
var window = globalThis; window.window = window;
var __t = 99999; var performance = { now: function () { return __t; } };
var Image = function () {};
var ctxProxy = new Proxy(function () {}, { get: function (t, k) { if (k === 'measureText') return function () { return { width: 10 }; }; return ctxProxy; },
  set: function () { return true; }, apply: function () { return ctxProxy; } });
var canvasStub = { getContext: function () { return ctxProxy; }, addEventListener: function () {}, style: {}, width: 400, height: 800,
  getBoundingClientRect: function () { return { left: 0, top: 0, width: 400, height: 800 }; }, setPointerCapture: function () {} };
var document = { getElementById: function (id) { return id === 'app' ? canvasStub : null; }, createElement: function () { return canvasStub; }, querySelectorAll: function () { return []; } };
window.innerWidth = 400; window.innerHeight = 800; window.devicePixelRatio = 1;
window.addEventListener = function () {};
window.location = { search: '' };
var navigator = { language: 'en' };
var localStorage = { getItem: function () { return null; }, setItem: function () {} };
var URLSearchParams = function () { this.get = function () { return null; }; };
window.requestAnimationFrame = function () {}; var requestAnimationFrame = window.requestAnimationFrame;
window.atob = function (s) { return ''; }; var atob = window.atob;
// mulberry32 as Math.random (same generator as sim.cpp)
var __rs = 1;
Math.random = function () { __rs = (__rs + 0x6D2B79F5) >>> 0; var t = __rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
window.__rngHook = { get: function () { return __rs; }, set: function (v) { __rs = v; } };
""")
ctx.eval("""
window.__battle = true;
window.PolyBattle = { on: true, trial: false, SLOTS: 10, STEP: 1, slots: [], api: null,
  useAt: function (k, t) { for (var i = 0; i < k; i++) if (this.slots.length > 1) this.slots.push(this.slots.shift()); var c = this.slots.shift(); if (c && c !== 4 && t === 'self') this.api.applyStored(c); },
  store: function (code) { if (!this.api || !this.api.itemDesc || !this.api.itemDesc(code)) return false; if ([1, 30, 31, 32, 98, 103, 120, 121, 122, 123].indexOf(code) >= 0) return false;
    if (this.trial) return true; if (this.slots.length < this.SLOTS) { this.slots.push(code); return true; } return false; },
  clear: function () { this.slots = []; }, attach: function (api) { this.api = api; }, begin: function (cb) { cb(); }, canLeave: function () { return true; }, replay: function (cb) { cb(); }, aiUseSlots: function () {} };
var bpend = null;
""") if "--battle" in sys.argv else None
for f in ["rawblock-data.js", "ai.js", "app.js"]:
    ctx.eval((web / f).read_text())
for _ in range(20):
    if not ctx.execute_pending_job(): break

env = VecEnv(1, seeds=np.array([SEED], np.uint32), items=ITEMS)
ctx.eval(f"""
var P = window.__poly, S = P.state;
P.setItems({'true' if ITEMS else 'false'});
S.rawblock = window.RAWBLOCK_DATA_2D; S.ready = true; S.startscreen = 0;
__rs = {SEED}; P.init();
PolyAI.isLoaded = function () {{ return true; }};
window.__aiForcePick = true;
PolyAI.hiddenStep = function () {{ return null; }};   // the recurrent state is irrelevant here: candidate choice is forced
P.ai.on = true; P.ai.autoRestart = true;
var childrenAtPick = null, sumActAtPick = null, forced = 0, pickCount = 0, lastCands = null, lastSummary = null, pending = null;
function summary() {{
  var cs = 0; for (var r = 0; r < 20; r++) for (var c = 0; c < 10; c++) cs = (cs * 131 + S.board[r][c] + 7) % 1000000007;
  return [S.score, S.lines, S.level, __rs, cs, S.nowblock.cells.length, S.holdblock.cells.length, S.nextblock.cells.length,
          __t, P.ai.lastAct, S.timestamp, S.blindboard, S.blockpos[0], S.blockpos[1]];
}}
PolyAI.pick = function (cands) {{ lastCands = cands; lastSummary = summary(); lastBS = (window.__testOpp && P.battleBState) ? Array.prototype.slice.call(P.battleBState(window.__testOpp.snap, window.__testOpp.qn)) : null; lastQ = (typeof PolyBattle !== 'undefined') ? PolyBattle.slots.slice() : null; sumActAtPick = Array.prototype.slice.call(P.ai.lastSumAct);
  childrenAtPick = []; var pi = 0;
  for (var q = 0; q < cands.length && pi < 3; q++) {{ if (cands[q].dead) continue; pi++;
    var ch = P.aiChildren(cands[q]);
    childrenAtPick.push({{ idx: q, kids: ch.map(function (c) {{ return {{ dead: c.dead ? 1 : 0, lines: c.lines, f: c.feat ? Array.prototype.slice.call(c.feat.f) : null, ids: c.feat ? Array.prototype.slice.call(c.feat.ids) : null, s: c.sum ? Array.prototype.slice.call(c.sum) : null }}; }}) }}); }} pickCount++; return cands[Math.min(forced, cands.length - 1)]; }};
window.__aiPreEnum = function () {{
  if (typeof bpend !== 'undefined' && bpend) {{ if (bpend[0]) PolyBattle.slots.length < 10 && PolyBattle.slots.push(bpend[0]); if (bpend[1]) {{ PolyBattle.useAt(bpend[1] - 1, 'self'); }} bpend = null; }}
  if (!pending) return;
  var w = pending[0], v = pending[1]; pending = null;
  if (w === 0) S.blindboard = v; else if (w === 1) S.speedup = v; else if (w === 2) S.speeddown = v;
  else if (w === 3) S.hidenext = v; else if (w === 4) S.spinlock = v; else if (w === 5) S.holdlock = v;
}};
function runToPick(k) {{
  forced = k; var target = pickCount + 1, guard = 0;
  while (pickCount < target && guard++ < 20000) {{ __t += 1; P.logicFrame(); }}
  return guard < 20000;
}}
function getChildren() {{ return JSON.stringify(childrenAtPick); }}
function getCands() {{
  return JSON.stringify(lastCands.map(function (c) {{ return {{ info: [c.hold, c.rot, c.dcol, c.status], dead: c.dead ? 1 : 0, lines: c.lines, gain: c.gain, boom: c.boom, garb: c.garb, f: c.feat ? Array.prototype.slice.call(c.feat.f) : null, ids: c.feat ? Array.prototype.slice.call(c.feat.ids) : null, s: c.sum ? Array.prototype.slice.call(c.sum) : null }}; }}));
}}
""")
def blind_now_flag(x): return False
rng = np.random.default_rng(SEED)
BATTLE = "--battle" in sys.argv
BITEMS = [116, 117, 118, 119, 104, 124, 125, 91, 102, 126, 127, 17, 20, 21, 22, 11, 2, 8, 9, 10, 5, 6, 204, 200, 19, 18, 4]
if BATTLE:
    env.set_battle(True, 1); envB = VecEnv(1, seeds=np.array([SEED + 1000], np.uint32)); envB.set_battle(True, 8)
bad = 0; total = 0; maxdiff = 0.0; deaths = 0; injected = 0; t0 = time.time(); blind_dec = 0; fast_dec = 0
first = True; prev_dead = False
for step in range(PIECES):
    if BATTLE:     # random items appear in the queue and the front item is used on myself now and then: both sides do the same at the decision root
        pu = int(rng.choice(BITEMS)) if rng.random() < 0.5 else 0
        if pu: env.push(0, pu)
        qn_ = int(env.queue(0)[0]); pk = int(rng.integers(0, min(4, qn_))) if qn_ else 0           # any of the first 4 items may be taken
        qq = [int(v) for v in env.queue(0)[1:1 + qn_]]
        mh = int(ctx.eval("(function(){var m=0; for (var r=0;r<S.board.length;r++) for (var c=0;c<S.board[r].length;c++) if (S.board[r][c] && S.board[r][c] < 256 && r+1>m) m=r+1; return m;})()"))
        us = (pk + 1) if (qn_ and rng.random() < 0.45 and not (qq[pk] in (117, 125) and mh >= 12)) else 0     # (death by added lines is checked separately: the sim notices it at the next plan, the game at once)
        if us: env.use(0, 1 + 2 * pk)
        ctx.eval("bpend = [%d, %d];" % (pu, us))
    if BATTLE:     # an opponent that plays on (random plans): what its window shows is sanitised and sent to the JS side
        envB.gen(); aliveB = [q for q in range(int(envB.counts[0])) if not envB.done[0, q]]
        envB.step(np.array([int(rng.choice(aliveB)) if aliveB else 0], np.int32))
        if rng.random() < 0.3: envB.push(0, int(rng.choice(BITEMS)))
        bd, pc, qnB = envB.snapshot(0)
        ctx.eval("window.__testOpp = { snap: { board: Uint8Array.from(%s), piece: %s }, qn: %d };" % (json.dumps(bd.tolist()), json.dumps(pc.tolist()), qnB))
    env.gen()
    if BATTLE: cbx, _ = env.bstate(envB)
    n = int(env.counts[0])
    alive = [k for k in range(n) if not env.done[0, k]]
    pool = alive if (alive and rng.random() > 0.02) else list(range(n))
    k = int(rng.choice(pool))
    if GREEDY and alive and rng.random() > 0.03:
        sc = [(-env.lines[0, q] * 100 + env.feats[0, q, 350] * 20 + env.feats[0, q, 348] * 30 + rng.random() * 0.5) for q in alive]
        k = alive[int(np.argmin(sc))]
    if not ctx.eval(f"runToPick({k})"):
        print("JS never reached a decision"); bad += 1; break
    if BATTLE:
        qj = json.loads(ctx.eval("JSON.stringify(lastQ)")); qc = [int(v) for v in env.queue(0)[1:1 + int(env.queue(0)[0])]]
        if qj != qc: print("QUEUE MISMATCH at decision", step, "js", qj, "cpp", qc, "| prev death:", prev_dead, "| pushed/used this step", pu, us); print("  cpp summary", list(env.summary(0))[:14], "js", ctx.eval("JSON.stringify(lastSummary)"), "js score/lines", ctx.eval("S.score + ',' + S.lines + ',' + S.goverflg")); bad += 1; break
    if BATTLE:
        jb = json.loads(ctx.eval("JSON.stringify(lastBS)"))
        if jb is not None and not blind_now_flag(cbx):
            dif = np.abs(np.array(jb, np.float32) - cbx[0])
            if dif.max() > 1e-4: bad += 1; ii = np.nonzero(dif > 1e-4)[0]; print("BSTATE MISMATCH at decision", step, "max", float(dif.max()), "at", ii[:8], "js", np.array(jb)[ii[:4]], "cpp", cbx[0][ii[:4]]); break
            nbs = globals().get("nbs", 0) + 1; globals()["nbs"] = nbs
    cpp_sum = list(env.summary(0))[:14]
    j_sum = json.loads(ctx.eval("JSON.stringify(lastSummary)"))
    j_sum[9] = cpp_sum[9] = 0  # lastAct is stored differently after a game over (equivalent decision time)
    if cpp_sum != j_sum:
        print("STATE DIVERGED at decision", step, "\n cpp", cpp_sum, "\n js ", j_sum); bad += 1; break
    sa_js = np.array(json.loads(ctx.eval("JSON.stringify(sumActAtPick)")), np.float32)
    if np.abs(sa_js - env.sumact[0]).max() > 1e-5:
        idx = np.nonzero(np.abs(sa_js - env.sumact[0]) > 1e-5)[0][:8]
        print("EVENT SUMMARY DIVERGED at decision", step, "idx", idx, "cpp", env.sumact[0][idx], "js", sa_js[idx]); bad += 1; break
    js = json.loads(ctx.eval("getCands()"))
    if len(js) != n:
        a = [tuple(int(v) for v in env.info[0, q]) for q in range(n)]; b = [tuple(c["info"]) for c in js]
        print("decision", step, "candidate count mismatch: js", len(js), "cpp", n, "\n only cpp", [x for x in a if x not in b][:6], "\n only js", [x for x in b if x not in a][:6]); bad += 1; break
    fail = False
    for q in range(n):
        total += 1
        c = js[q]
        if list(map(int, env.info[0, q])) != c["info"] or int(env.done[0, q]) != c["dead"] or int(env.lines[0, q]) != c["lines"]:
            print("decision", step, "cand", q, "meta mismatch", list(env.info[0, q]), c["info"], env.done[0, q], c["dead"], env.lines[0, q], c["lines"]); fail = True; break
        if not c["dead"]:
            if list(map(int, env.ids[0, q])) != c["ids"] or int(env.ev[0, q, 0]) != c["boom"] or int(env.ev[0, q, 1]) != c["garb"]:
                a_ = [int(v) for v in env.ids[0, q]]; di = [i for i in range(len(a_)) if a_[i] != c["ids"][i]]; print("decision", step, "cand", q, "ids/events mismatch at", di[:6], [a_[i] for i in di[:6]], [c["ids"][i] for i in di[:6]], "ev", list(env.ev[0, q]), c["boom"], c["garb"]); fail = True; break
            if abs(float(env.gain[0, q]) - c["gain"]) > 1e-3:
                print("decision", step, "cand", q, "score gain mismatch", env.gain[0, q], c["gain"]); fail = True; break
            dsum = np.abs(env.sumc[0, q] - np.array(c["s"], np.float32))
            if dsum.max() > 1e-5:
                print("decision", step, "cand", q, "candidate summary mismatch at", np.nonzero(dsum > 1e-5)[0][:8]); fail = True; break
            d = np.abs(env.feats[0, q] - np.array(c["f"], np.float32))
            maxdiff = max(maxdiff, float(d.max()))
            if d.max() > 1e-5:
                idx = np.nonzero(d > 1e-5)[0][:8]
                print("decision", step, "cand", q, "feature mismatch at", idx, "cpp", env.feats[0, q][idx], "js", np.array(c["f"])[idx]); fail = True; break
    if fail: bad += 1; break
    if cpp_sum[11] > cpp_sum[8]: blind_dec += 1
    if env.done[0, k]: deaths += 1
    prev_dead = bool(env.done[0, k])
    env.step(np.array([k], np.int32))
    # inject a special state at the next root (both sides, before its enumeration)
    if INJECT and rng.random() < 0.05:
        which = int(rng.integers(0, 6)); f_next = int(env.summary(0)[8])
        value = f_next + 10000 if which == 0 else int(rng.integers(3, 12))
        env.inject(0, which, value); ctx.eval(f"pending = [{which}, {value}]"); injected += 1
print("bstate checked", globals().get("nbs", 0)); print(("greedy " if GREEDY else "") + ("items" if ITEMS else "noitems"), "decisions", step + 1, "candidates checked", total, "deaths", deaths,
      "injected", injected, "blind decisions", blind_dec, "bad", bad, "maxfeatdiff", maxdiff, f"{time.time()-t0:.0f}s")
