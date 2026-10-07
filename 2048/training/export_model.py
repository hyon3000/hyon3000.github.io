"""export a checkpoint to ../ai-model.js (base64 float32 weights, order as decoded by ../ai.js)"""
import argparse, base64, os, sys
import numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from net2048 import Net, NE, NP
ap = argparse.ArgumentParser(); ap.add_argument("--ckpt", default="runs/a/best.pt"); ap.add_argument("--out", default="../ai-model.js")
a = ap.parse_args()
ck = torch.load(a.ckpt, map_location="cpu"); net = Net(ck["ch"], ck["layers"]); net.load_state_dict(ck["net"])
parts = [net.inp.weight, net.inp.bias]
for c, g in zip(net.convs, net.glob): parts += [c.weight, c.bias, g.weight, g.bias]
parts += [net.h1.weight, net.h1.bias, net.h2.weight.reshape(-1), net.h2.bias]
buf = np.concatenate([p.detach().numpy().astype("<f4").reshape(-1) for p in parts]).tobytes()
js = "window.AI2048_MODEL = %s;\n" % ('{ch:%d,layers:%d,hid:%d,w:"%s"}' % (net.ch, net.layers, net.hid, base64.b64encode(buf).decode()))
open(a.out, "w").write(js); print("wrote", a.out, len(js) // 1024, "KB from", a.ckpt)
