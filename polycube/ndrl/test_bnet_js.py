"""JS (web/ai-nd.js, the exported ai-battle-*.js) vs torch: plan values and item advantages of the battle network"""
import os, sys, time, json, pathlib, http.server, threading, functools
import numpy as np, torch
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from simnd import NF, NIDS, KIDS, DIM
from bnet import BRNet, CTXD
from rnnnet import H, VSCALE
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8982), h); threading.Thread(target=s.serve_forever, daemon=True).start()
ck = sys.argv[1]; page = "game.html" if DIM == 3 else "polytesseract/game.html"; sub = "web" if DIM == 3 else "polytesseract/web"
net = BRNet(); net.load_state_dict(torch.load(ck, map_location="cpu")); net.eval()
rng = np.random.default_rng(1); n = 12
x = (rng.random((n, NF)) * (rng.random((n, NF)) < 0.3)).astype(np.float32); hc = rng.normal(0, 0.5, (n, H)).astype(np.float32); ctx = (rng.random((n, CTXD)) * (rng.random((n, CTXD)) < 0.2)).astype(np.float32)
ids = np.full((n, KIDS), -1, np.int16)
for i in range(n): k = rng.integers(2, 12); ids[i, :k] = rng.integers(0, NIDS, k)
with torch.no_grad():
    v = (net.value(torch.from_numpy(x), torch.from_numpy(ids), torch.from_numpy(hc), torch.from_numpy(ctx)) * VSCALE).clamp(-20, 1500).numpy()
    a = (net.item_adv(torch.from_numpy(x), torch.from_numpy(ctx), torch.from_numpy(hc)) * VSCALE).numpy()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_script_timeout(180)
try:
    d.get(f"http://127.0.0.1:8982/{page}?battle=1"); time.sleep(4)
    d.execute_async_script("var cb=arguments[arguments.length-1]; var sc=document.createElement('script'); sc.src='./web/ai-battle-%dd.js'; sc.onload=function(){cb(1)}; sc.onerror=function(){cb(0)}; document.head.appendChild(sc);" % DIM)
    res = d.execute_script("""var N=PolyND, m=window['POLY_AI_BATTLE_%dD']; N._loadModel2(m); var X=arguments[0], HC=arguments[1], CX=arguments[2], IDS=arguments[3], v=[], a=[];
      for (var i=0;i<X.length;i++){ v.push(N._forwardCtx({f:Float32Array.from(X[i]), ids:Int16Array.from(IDS[i])}, Float32Array.from(HC[i]), Float32Array.from(CX[i]))); a.push(Array.from(N._itemAdv(Float32Array.from(X[i]), Float32Array.from(HC[i]), Float32Array.from(CX[i])))); }
      return JSON.stringify({v:v, a:a});""" % DIM, x.tolist(), hc.tolist(), ctx.tolist(), ids.tolist())
    r = json.loads(res); jv = np.array(r["v"]); ja = np.array(r["a"])
    print("DIM", DIM, "value max |diff|", float(np.abs(jv - v).max()), "(values", float(v.min()), "..", float(v.max()), ") | item adv max |diff|", float(np.abs(ja - a).max()), "(range", float(a.min()), "..", float(a.max()), ")")
finally: d.quit()
