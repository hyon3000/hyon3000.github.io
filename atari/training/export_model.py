"""export a trained policy (ppo.Net) to ../ai-model-2d.js / ../ai-model-3d.js:  window.ATARI_AI_2D = {obs, hid, heads, w: base64 float32}
weight order: body.0.weight (hid x obs), body.0.bias, body.2.weight (hid x hid), body.2.bias, pi.weight (sum(heads) x hid), pi.bias  (the value head is not needed)"""
import argparse, base64, os, sys
import numpy as np, torch
ap = argparse.ArgumentParser(); ap.add_argument("--mode", choices=["2d", "3d"], required=True); ap.add_argument("--ckpt", required=True); ap.add_argument("--out", default="")
a = ap.parse_args()
sd = torch.load(a.ckpt, map_location="cpu")
hid, obs = sd["body.0.weight"].shape
heads = [41] if a.mode == "2d" else [21, 21]
parts = [sd["body.0.weight"], sd["body.0.bias"], sd["body.2.weight"], sd["body.2.bias"], sd["pi.weight"], sd["pi.bias"]]
buf = np.concatenate([p.numpy().astype("<f4").reshape(-1) for p in parts]).tobytes()
out = a.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ai-model-%s.js" % a.mode)
open(out, "w").write('window.ATARI_AI_%s = {obs:%d,hid:%d,heads:%s,w:"%s"};\n' % (a.mode.upper(), obs, hid, heads, base64.b64encode(buf).decode()))
print("wrote", out, len(buf) // 1024, "KB of weights; obs", obs, "hid", hid)
