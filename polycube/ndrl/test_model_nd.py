"""JS recurrent forward pass (web/ai-nd.js + exported model) vs PyTorch along real simulator trajectories."""
import json, pathlib, sys, numpy as np, quickjs, torch
from simnd import VecEnv, DIM
from rnnnet import RNet, Round, candidate_q, H
ckpt = sys.argv[1]
root = pathlib.Path(__file__).parent.parent
mfile = root / ("web/ai-model-3d.js" if DIM == 3 else "polytesseract/web/ai-model-4d.js")
ctx = quickjs.Context(); ctx.set_time_limit(900)
ctx.eval("var window = globalThis; window.atob = function (s) { var c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',o='',b=0,n=0; for (var i=0;i<s.length;i++){var v=c.indexOf(s[i]);if(v<0)continue;b=(b<<6)|v;n+=6;if(n>=8){n-=8;o+=String.fromCharCode((b>>n)&255);}} return o; };")
ctx.eval((root / "web/ai-nd.js").read_text()); ctx.eval(mfile.read_text())
ctx.eval(f"PolyND._loadModel(window.POLY_AI_MODEL_{DIM}D); var hprev = null;")
ctx.eval("""
function qs(sumact, cands) {
  hprev = PolyND._gru(hprev, new Float32Array(sumact));
  var cs = cands.map(function (c) { return { dead: c.dead, lines: c.lines, gain: c.gain, feat: { f: new Float32Array(c.f), ids: new Int16Array(c.ids) }, sum: new Float32Array(c.s) }; });
  return JSON.stringify(PolyND._q(cs, hprev));
}""")
net = RNet(); net.load_state_dict(torch.load(pathlib.Path(__file__).parent / ckpt, map_location="cpu")); net.eval()
n = 4; env = VecEnv(n, 3); rng = np.random.default_rng(0); hp = torch.zeros(n, H); worst = 0.0; cmp = 0
for step in range(int(sys.argv[2]) if len(sys.argv) > 2 else 12):
    env.gen(); r = Round(env, torch.device("cpu"))
    hp = torch.where(r.first[:, None], torch.zeros_like(hp), hp); hp = net.gru_step(r.sumact, hp)
    q = candidate_q(net, r.x, r.ids, r.rew, r.valid, r.sumc, hp).numpy()
    if env.first[0]: ctx.eval("hprev = null;")
    m = min(int(env.counts[0]), 60)
    cands = [{"dead": bool(env.done[0, k]), "lines": int(env.lines[0, k]), "gain": float(env.gain[0, k]), "f": [float(x) for x in env.feats[0, k]], "ids": [int(x) for x in env.ids[0, k]], "s": [float(x) for x in env.sumc[0, k]]} for k in range(m)]
    js = json.loads(ctx.eval("qs(%s, %s)" % (json.dumps([float(x) for x in env.sumact[0]]), json.dumps(cands))))
    for k, v in enumerate(js):
        if not env.done[0, k] and v > -1e8 and q[0, k] > -1e8:
            worst = max(worst, abs(v - q[0, k]) / (abs(q[0, k]) + 1.0)); cmp += 1
    live = (np.arange(env.feats.shape[1])[None] < env.counts[:, None]) & (env.done == 0)
    env.step(np.array([rng.choice(np.nonzero(live[i])[0]) if live[i].any() else 0 for i in range(n)], np.int32))
print("compared", cmp, "Q-values; worst relative error", worst)
