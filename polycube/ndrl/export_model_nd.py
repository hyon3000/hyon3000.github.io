"""Export a trained RNet checkpoint to ../web/ai-model.js (plain-JS inference; float16 for the big tables)."""
import argparse, base64, json, pathlib
import numpy as np, torch
from rnnnet import RNet, VSCALE, H, REWARD, SCORE_CLIP, SCORE_DIV, BASE, DEATH
from simnd import NF, NIDS, SD, DIM

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="runs/r1/last.pt")
ap.add_argument("--out", default=""); ap.add_argument("--battle", action="store_true", help="export a bnet.BRNet checkpoint (placement + items) as ai-battle-*.js")
a = ap.parse_args()
if not a.out: a.out = ("../web/ai-%s-3d.js" if DIM == 3 else "../polytesseract/web/ai-%s-4d.js") % ("battle" if a.battle else "model")
here = pathlib.Path(__file__).parent
if a.battle:
    from bnet import BRNet, CTXD
    net = BRNet(); net.load_state_dict(torch.load(here / a.ckpt, map_location="cpu")); net.eval()
else:
    net = RNet(); net.load_state_dict(torch.load(here / a.ckpt, map_location="cpu")); net.eval()
b64 = lambda arr: base64.b64encode(arr.tobytes()).decode()
f32 = lambda t: b64(t.detach().numpy().astype("<f4"))
wd = net.dense.weight.detach().numpy().astype("<f2")           # [hidden, NF]
emb = net.emb.weight.detach().numpy()[:NIDS].astype("<f2")     # [NIDS, hidden]
layers = [{"in": m.in_features, "out": m.out_features, "w": f32(m.weight), "b": f32(m.bias)}
          for m in net.mlp if isinstance(m, torch.nn.Linear)]
model = {"vscale": VSCALE, "reward": {"mode": REWARD, "clip": SCORE_CLIP, "div": SCORE_DIV, "base": BASE, "death": DEATH},
         "dense": {"in": NF, "out": wd.shape[0], "w": b64(wd)}, "emb": {"n": NIDS, "out": wd.shape[0], "w": b64(emb)}, "b1": f32(net.dense.bias),
         "gru": {"in": SD, "hid": H, "w_ih": f32(net.gru.weight_ih_l0), "w_hh": f32(net.gru.weight_hh_l0),
                 "b_ih": f32(net.gru.bias_ih_l0), "b_hh": f32(net.gru.bias_hh_l0)},
         "wm": {"in": H, "out": wd.shape[0], "w": f32(net.wm.weight)},
         "ln": {"w": f32(net.ln.weight), "b": f32(net.ln.bias)}, "layers": layers}
if a.battle:
    lin = lambda m: {"in": m.in_features, "out": m.out_features, "w": f32(m.weight), "b": f32(m.bias)}
    model["cdense"] = lin(net.cdense); model["ih"] = [lin(net.ih1), lin(net.ih2)]
(here / a.out).write_text(("window.POLY_AI_%s_%dD=" % ("BATTLE" if a.battle else "MODEL", DIM)) + json.dumps(model) + ";\n")
print("exported", sum(p.numel() for p in net.parameters()), "params ->", (here / a.out).stat().st_size // 1024, "KB")
