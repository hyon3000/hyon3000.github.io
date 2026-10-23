// Web Worker of the 4x4x4 solver (solver4.js).  {cmd:'init'} -> {cmd:'init', ms}   {cmd:'solve', id, col:[...]} -> {cmd:'solve', id, plan:[[b, d], ...], ms | error}
importScripts('engine.js', 'puzzles.js', 'vendor/cubejs/cube.js', 'vendor/cubejs/solve.js', 'solver4-data.js', 'solver4.js');
var SV = null;
function ready() {
  if (SV) return;
  Cube.initSolver();
  SV = Solver4.create(RBPuzzles.get('cube4'), Cube);
  SV.warm();
}
self.onmessage = function (ev) {
  var m = ev.data;
  try {
    var t = Date.now();
    ready();
    if (m.cmd === 'init') self.postMessage({ cmd: 'init', ms: Date.now() - t });
    else if (m.cmd === 'solve') {
      var r = SV.solve(m.col);
      if (!r.plan) self.postMessage({ cmd: 'solve', id: m.id, error: String(r.error) });
      else self.postMessage({ cmd: 'solve', id: m.id, plan: r.plan.map(function (q) { return [q.b, q.d]; }), ms: Date.now() - t });
    }
  } catch (e) { self.postMessage({ cmd: m.cmd, id: m.id, error: String(e) }); }
};
