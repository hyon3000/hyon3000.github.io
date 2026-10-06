import sys, time, pathlib, http.server, threading, functools, json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8965), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 914); d.set_script_timeout(300)
JS = """
var N=PolyND, ai=N._ai, S=window.__poly.state, out=[];
ai.on=false; var h0=ai.h;
function run(ctx){ var r=N._enumerate(ctx); var q=N._q(r.cands, ai.h); var bi=0; for(var i=1;i<q.length;i++) if(q[i]>q[bi]) bi=i; return {n:r.cands.length,bi:bi,qmax:q[bi],q:q.slice(0,40)}; }
for (var trial=0; trial<%d; trial++) {
  var mode = trial %% 3;
  var bel = N._flatB(S.blk).slice();
  var ctx = {seed0: ai.seed0, dec: ai.dec, bel: mode<2 ? bel : null, now: PolyND._ai ? performance.now() : 0, holdBan:false};
  if (mode==0) S.blindboard = performance.now()+1e9; else S.blindboard = 0;
  var a = run(ctx);
  // scramble the real (hidden) board while the belief stays the same
  var saved = S.blk.slice ? null : null;
  var keep = N._snap();
  var cnt=0; for (var k=0;k<60;k++){ var x=Math.floor(Math.random()*7), y=Math.floor(Math.random()*7), z=Math.floor(Math.random()*12); try{ if(!S.blk[x][y][z]){S.blk[x][y][z]=3; cnt++;} }catch(e){} }
  var b = run(ctx);
  N._restore(keep);
  out.push({mode:mode, same: a.bi===b.bi && a.qmax===b.qmax, a:[a.n,a.bi,a.qmax], b:[b.n,b.bi,b.qmax], scrambled:cnt});
  S.blindboard = 0;
}
return JSON.stringify(out);
"""
try:
    d.get("http://127.0.0.1:8965/" + sys.argv[1]); time.sleep(5)
    d.execute_script("window.__poly.state.startscreen=0; PolyND.start();"); time.sleep(20)
    print(d.execute_script(JS % 6))
finally: d.quit()
