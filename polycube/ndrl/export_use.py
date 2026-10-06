"""Export the item-use net (duel_ppo.py / duel_nd.py) to plain JS: ai-use-2d.js / ai-use-3d.js / ai-use-4d.js"""
import argparse, base64, json, os, pathlib, numpy as np, torch
from duel_nd import UseNet, BSD, DIM
ap = argparse.ArgumentParser(); ap.add_argument("--ckpt", required=True); a = ap.parse_args()
net = UseNet(); sd = torch.load(a.ckpt, map_location="cpu"); net.load_state_dict({k: v for k, v in sd.items() if k.startswith("f.")}); net.eval()
b64 = lambda t: base64.b64encode(t.detach().numpy().astype("<f4").tobytes()).decode()
layers = [{"in": m.in_features, "out": m.out_features, "w": b64(m.weight), "b": b64(m.bias)} for m in net.f if isinstance(m, torch.nn.Linear)]
root = pathlib.Path(__file__).parent.parent
out = root / {2: "polynomino/web/ai-use-2d.js", 3: "web/ai-use-3d.js", 4: "polytesseract/web/ai-use-4d.js"}[DIM]
out.write_text(f"window.POLY_USE_{DIM}D=" + json.dumps({"dim": BSD, "layers": layers}) + ";\n"); print("exported", out, out.stat().st_size // 1024, "KB")
