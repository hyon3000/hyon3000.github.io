"""JS recurrent forward pass (web/ai.js + web/ai-model.js) vs PyTorch along real simulator trajectories."""
import json, pathlib, sys, numpy as np, quickjs, torch
from simlib import VecEnv
from rnnnet import RNet, Round, candidate_q, H

ckpt = sys.argv[1] if len(sys.argv) > 1 else "runs/rand/last.pt"
web = pathlib.Path(__file__).parent.parent / "web"
ctx = quickjs.Context(); ctx.set_time_limit(900)
ctx.eval("var window = globalThis; window.atob = function (s) { var c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',o='',b=0,n=0; for (var i=0;i<s.length;i++){var v=c.indexOf(s[i]);if(v<0)continue;b=(b<<6)|v;n+=6;if(n>=8){n-=8;o+=String.fromCharCode((b>>n)&255);}} return o; };")
ctx.eval((web / "ai.js").read_text())
ctx.eval((web / "ai-model.js").read_text())
ctx.eval("PolyAI.load(window.POLY_AI_MODEL); var hprev = null;")
ctx.eval("""
function qs(sumact, cands) {
  hprev = PolyAI.hiddenStep(hprev, new Float32Array(sumact));
  var cs = cands.map(function (c) {
    return { dead: c.dead, lines: c.lines, feat: { f: new Float32Array(c.f), ids: new Int16Array(c.ids) }, sum: new Float32Array(c.s) };
  });
  return JSON.stringify(PolyAI.qValues(cs, hprev));
}
""")
net = RNet(); net.load_state_dict(torch.load(pathlib.Path(__file__).parent / ckpt, map_location="cpu")); net.eval()
n = 6; env = VecEnv(n, 3); rng = np.random.default_rng(0); hp = torch.zeros(n, H)
worst = 0.0; cmp = 0
for step in range(40):
    env.gen(); r = Round(env, torch.device("cpu"))
    hp = torch.where(r.first[:, None], torch.zeros_like(hp), hp)
    hp = net.gru_step(r.sumact, hp)
    q = candidate_q(net, r.x, r.ids, r.rew, r.valid, r.sumc, hp).numpy()
    if env.first[0]:
        ctx.eval("hprev = null;")
    cands = [{"dead": bool(env.done[0, k]), "lines": int(env.lines[0, k]), "f": [float(x) for x in env.feats[0, k]],
              "ids": [int(x) for x in env.ids[0, k]], "s": [float(x) for x in env.sumc[0, k]]} for k in range(int(env.counts[0]))]
    js = json.loads(ctx.eval("qs(%s, %s)" % (json.dumps([float(x) for x in env.sumact[0]]), json.dumps(cands))))
    for k, v in enumerate(js):
        if not env.done[0, k] and v > -1e8 and q[0, k] > -1e8:   # dead candidates carry no features (the JS side prices them at the fixed death reward)
            worst = max(worst, abs(v - q[0, k]) / (abs(q[0, k]) + 1.0)); cmp += 1
    env.step((rng.random(n) * env.counts).astype(np.int32))
print("compared", cmp, "candidate Q-values over 40 steps with carried memory; worst relative error", worst)
