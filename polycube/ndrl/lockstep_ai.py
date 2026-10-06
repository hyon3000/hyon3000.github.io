"""JS enumeration/features/summaries (web/ai-nd.js running in the REAL game script) vs the C++ sim_nd, decision by decision."""
import json, pathlib, sys, numpy as np, quickjs
from simnd import *

ROOT = pathlib.Path(__file__).parent.parent
web = ROOT / ("web" if DIM == 3 else "polytesseract/web")
N = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--decisions=")), 40))
SEED = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--seed=")), 11))
pre = open(pathlib.Path(__file__).parent / "lockstep_nd.py").read().split('ctx.eval(r"""')[1].split('""")')[0]
ctx = quickjs.Context(); ctx.set_time_limit(100000)
ctx.eval(pre)
ctx.eval("window.atob = function (s) { return ''; };")
ctx.eval((ROOT / "web/ai-nd.js").read_text())
for f in ["rawblock-data.js", "app.js"]:
    ctx.eval((web / f).read_text())
for _ in range(50):
    if not ctx.execute_pending_job(): break
ctx.eval(f"""
var P = window.__poly, S = P.state, PN = window.PolyND, ai = PN._ai; S.startscreen = 0; S.ready = true; S.goverflg = 0; S.pause = false;
__rs = {SEED}; P.init();
ai.seed0 = {SEED}; ai.dec = 0; ai.on = true;
window.__testClock = function (i) {{ __t = ai.T0 + 200 * i; }};
ai.T0 = __t;
var NFJ = PN._NF();
var lastOut = null;
function enumerateAll() {{ ai.choose = function () {{ return 0; }}; PN._begin(); var r = null; var g = ai.gen; var res; while (true) {{ var s = g.next(); if (s.done) {{ res = s.value; break; }} }}
  lastOut = res; ai.gen = null;
  // restore after the synchronous run (the driver normally does it)
  return JSON.stringify(res.res.cands.map(function (c) {{ return {{ hd: c.plan.hd, seq: c.plan.seq, dx: c.plan.dx, dy: c.plan.dy, dw: c.plan.dw, dead: c.dead ? 1 : 0, lines: c.lines, gain: c.gain,
    f: Array.prototype.slice.call(c.feat.f), ids: Array.prototype.slice.call(c.feat.ids), s: Array.prototype.slice.call(c.sum) }}; }})); }}
""")
env = VecEnv(1, seeds=np.array([SEED], np.uint32))
rng = np.random.default_rng(5)
bad = 0
for d in range(N):
    env.gen()
    nC = int(env.counts[0])
    # JS enumeration at the same root (the decision is made by the real planning code with the real game state)
    live = json.loads(ctx.eval("(function(){ var live = PN._snap(); var r = enumerateAll(); PN._restore(live); return r; })()"))
    msgs = []
    if len(live) != nC: msgs.append(f"count js {len(live)} cpp {nC}")
    else:
        mf = ms = 0.0
        for k in range(nC):
            j = live[k]
            ci = env.info[0, k]
            code = int(ci[5]); seq = []
            for _ in range(int(ci[1])): seq.append(code % 12); code //= 12
            seq = seq[::-1]
            if (j["hd"], j["seq"], j["dx"], j["dy"], j["dw"]) != (int(ci[0]), seq, int(ci[2]), int(ci[3]), int(ci[4])): msgs.append(f"plan {k}"); break
            if j["dead"] != int(env.done[0, k]): msgs.append(f"dead {k}"); break
            if j["lines"] != int(env.lines[0, k]) or j["gain"] != int(env.gain[0, k]): msgs.append(f"lines/gain {k}: {j['lines']},{j['gain']} vs {env.lines[0,k]},{env.gain[0,k]}"); break
            if not j["dead"]:
                mf = max(mf, float(np.max(np.abs(np.array(j["f"]) - env.feats[0, k]))))
                ms = max(ms, float(np.max(np.abs(np.array(j["s"]) - env.sumc[0, k]))))
                if j["ids"] != [int(v) for v in env.ids[0, k]]: msgs.append(f"ids {k}"); break
        if mf > 1e-5 or ms > 1e-5: msgs.append(f"feature diff {mf:.2e} summary diff {ms:.2e}")
    if msgs:
        bad += 1; print("decision", d, "MISMATCH", msgs[:3])
        if bad > 3: break
    # play the same random candidate on both sides
    liveC = np.nonzero(env.done[0, :nC] == 0)[0]
    k = int(rng.choice(liveC)) if len(liveC) else 0
    ctx.eval(f"ai.choose = function () {{ return {k}; }}; ai.T0 = __t; var dd = PN._decideSync(); __t = ai.T0 + 200 * (dd.aborted ? 1 : dd.n); S.goverflg = 0;")
    env.step(np.array([k], np.int32), 100000)
    js = json.loads(ctx.eval("JSON.stringify([S.score, S.lines, S.level, __rs])"))
    cpp = env.summary(0)
    if [js[0], js[1], js[2], js[3]] != [int(cpp[0]), int(cpp[1]), int(cpp[2]), int(cpp[3])]:
        bad += 1; print("decision", d, "STATE MISMATCH js", js, "cpp", list(cpp[:4]))
        if bad > 3: break
    sa = np.array(json.loads(ctx.eval("JSON.stringify(Array.prototype.slice.call(ai.sa))")), np.float32)
    # summary of the real step: compared against the one C++ hands to the next decision
    env.gen()
    dsa = float(np.max(np.abs(sa - env.sumact[0])))
    if dsa > 1e-5 and not env.first[0]:
        bad += 1; print("decision", d, "sumact diff", dsa, np.nonzero(np.abs(sa - env.sumact[0]) > 1e-5)[0])
        if bad > 3: break
print("decisions", N, "problems", bad)
