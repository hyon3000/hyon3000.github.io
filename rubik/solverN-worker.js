// Web Worker of the NxN solver (solverN-core.js).  {cmd:'init', key} -> {cmd:'init', ms}   {cmd:'solve', key, id, col:[...]} -> {cmd:'solve', id, plan:[[b, d], ...], ms | error}
// {cmd:'solvefl', key, id, fl:[6 n n colours in the net order U R F D L B]} -> {cmd:'solvefl', id, plan, ms | error}
importScripts('engine.js', 'puzzles.js', 'vendor/cubejs/cube.js', 'vendor/cubejs/solve.js', 'solverN-core.js');
var SV = null, SKEY = null;
function ready(key) {
  if (SV && SKEY === key) return;
  Cube.initSolver();
  if (/^x:/.test(key)) { var pk = RBPuzzles.parseKey(key); if (pk) RBPuzzles.customKey(pk.topo, pk.n); }          // a custom size is only known after customKey registered it in this worker
  SV = RBNX.create(RBPuzzles.get(key), Cube); SKEY = key;
  SV.warm();
}
self.onmessage = function (ev) {
  var m = ev.data;
  try {
    var t = Date.now();
    ready(m.key);
    if (m.cmd === 'init') self.postMessage({ cmd: 'init', ms: Date.now() - t });
    else if (m.cmd === 'solve' || m.cmd === 'solvefl') {
      var col = m.col;
      if (m.cmd === 'solvefl') { col = new Uint8Array(SV.faceletGrid.length); for (var q = 0; q < col.length; q++) col[SV.faceletGrid[q]] = m.fl[q]; }          // facelets in the net order of cube.js (pages that read the cube from pieces)
      var r = SV.solve(col);
      if (!r.plan) self.postMessage({ cmd: m.cmd, id: m.id, error: String(r.error) });
      else self.postMessage({ cmd: m.cmd, id: m.id, plan: r.plan.map(function (q) { return [q.b, q.d]; }), ms: Date.now() - t });
    }
  } catch (e) { self.postMessage({ cmd: m.cmd, id: m.id, error: String(e) }); }
};
