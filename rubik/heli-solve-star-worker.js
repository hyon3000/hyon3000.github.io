// Web Worker of the star / dodecahedron / octahedron / tetrahedron solver: builds the table of a puzzle on the first request (or loads the offline one) and answers with the whole plan.
importScripts('heli-core.js', 'heli-solve-star-data.js', 'heli-solve-star-core.js');
self.onmessage = function (e) {
  const m = e.data;
  if (m.cmd !== 'solve') return;
  try {
    const model = self.HSTAR.buildModel(m.shape, m.n);
    if (model.d > (m.maxFacelets || 700)) { self.postMessage({ id: m.id, error: 'too large (' + model.d + ' facelets)' }); return; }
    const r = self.HSTAR.solve(m.shape, m.n, m.state, { table: { ms: m.tableMs || 150000 }, budget: { ms: 20000 } });
    self.postMessage({ id: m.id, result: r });
  } catch (err) { self.postMessage({ id: m.id, error: String(err && err.message || err) }); }
};
