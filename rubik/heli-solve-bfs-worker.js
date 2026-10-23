// Web Worker of the exhaustive solver (heli-solve-bfs-core.js): enumerates the states reachable from the solved one on the first request of a puzzle and answers with the whole plan.
importScripts('heli-core.js', 'heli-solve-star-core.js', 'heli-solve-bfs-core.js');
self.onmessage = function (e) {
  const m = e.data;
  if (m.cmd !== 'solve') return;
  try { self.postMessage({ id: m.id, result: self.HBFS.solve(m.shape, m.n, m.state, { maxStates: m.maxStates, maxMs: m.maxMs }) }); }
  catch (err) { self.postMessage({ id: m.id, error: String(err && err.message || err) }); }
};
