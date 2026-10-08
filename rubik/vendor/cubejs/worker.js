// Web Worker wrapper around cube.js (Kociemba two-phase solver, MIT, (c) 2013-2017 Petri Lehtinen, (c) 2018 Ludovic Fernandez).
// Messages: {cmd:'init'} -> {cmd:'init', ms}   {cmd:'solve', id, facelets} -> {cmd:'solve', id, algorithm | error}
importScripts('cube.js', 'solve.js');
var ready = false;
self.onmessage = function (ev) {
  var m = ev.data;
  try {
    if (m.cmd === 'init') {
      var t = Date.now();
      if (!ready) { Cube.initSolver(); ready = true; }
      self.postMessage({ cmd: 'init', ms: Date.now() - t });
    } else if (m.cmd === 'solve') {
      if (!ready) { Cube.initSolver(); ready = true; }
      var t2 = Date.now();
      var alg = Cube.fromString(m.facelets).solve();
      self.postMessage({ cmd: 'solve', id: m.id, algorithm: alg, ms: Date.now() - t2 });
    }
  } catch (e) { self.postMessage({ cmd: m.cmd, id: m.id, error: String(e) }); }
};
