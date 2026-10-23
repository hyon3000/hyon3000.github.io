// Web Worker of the facelet-chain solver (heli-solve-fl-core.js).  When the star solver has an offline table for the puzzle it answers { delegate: true } (heli-solve-star.js is the better one then:
// shorter plans, no chain to build) and builds nothing.
importScripts('heli-core.js', 'heli-solve-star-data.js', 'heli-solve-star-core.js', 'solver-small-core.js', 'heli-solve-fl-core.js');
self.onmessage = function (e) {
  const m = e.data;
  if (m.cmd !== 'solve') return;
  try {
    const ck = m.shape + ':' + m.n;
    if (!m.noDelegate && self.HSTAR_DATA && self.HSTAR_DATA[ck]) {
      const model = self.HSTAR.buildModel(m.shape, m.n);
      if (self.HSTAR.importTable(model, self.HSTAR_DATA[ck])) { self.postMessage({ id: m.id, delegate: true }); return; }
    }
    self.postMessage({ id: m.id, result: self.HFL.solve(m.shape, m.n, m.state, { chain: { totalMs: m.chainMs } }) });
  } catch (err) { self.postMessage({ id: m.id, error: String(err && err.message || err) }); }
};
