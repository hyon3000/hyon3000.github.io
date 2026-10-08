"""export a trained policy (train.py Net) to ../ai-model.js:  window.PINBALL_AI = {obs, hid, heads, w: base64 float32}
weight order: body.0.weight (hid x obs), body.0.bias, body.2.weight, body.2.bias, pi.weight (4 x hid), pi.bias  (the value head is not needed)"""
import argparse, base64, os
import numpy as np, torch
ap = argparse.ArgumentParser(); ap.add_argument('--ckpt', required=True); ap.add_argument('--out', default='')
a = ap.parse_args()
sd = torch.load(a.ckpt, map_location='cpu')
hid, obs = sd['body.0.weight'].shape; na = sd['pi.weight'].shape[0]
parts = [sd['body.0.weight'], sd['body.0.bias'], sd['body.2.weight'], sd['body.2.bias'], sd['pi.weight'], sd['pi.bias']]
buf = np.concatenate([p.numpy().astype('<f4').reshape(-1) for p in parts]).tobytes()
out = a.out or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ai-model.js')
open(out, 'w').write('window.PINBALL_AI = {obs:%d,hid:%d,heads:[%d],w:"%s"};\n' % (obs, hid, na, base64.b64encode(buf).decode()))
print('wrote', out, len(buf) // 1024, 'KB of weights; obs', obs, 'hid', hid)
