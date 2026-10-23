// Worker of the cuboid solver: builds the lattice table (heli-solve-cuboid-core.js) once per size and answers {id, dims, state} with the moves, or null when the state is not in the table.
importScripts('heli-solve-cuboid-core.js');
self.onmessage = function (ev) {
  const m = ev.data;
  try {
    if (m.cmd === 'solveG' || m.cmd === 'prepG') {
      const G = self.CUBOID.buildG(m.key, m.desc, m.cap || 2500000), mv = m.cmd === 'solveG' && G.complete ? self.CUBOID.solveWith(G, m.state, m.forb, m.extra) : null;
      self.postMessage({ id: m.id, ok: true, complete: G.complete, size: G.size, depth: G.depth, moves: mv }); return;
    }
    const M = self.CUBOID.build(m.dims, m.cap || 2500000);
    if (m.cmd === 'prep') { self.postMessage({ id: m.id, ok: true, complete: M.complete, size: M.size }); return; }
    const mv = M.complete ? self.CUBOID.solve(m.dims, m.state, m.cap || 2500000, m.forb, m.extra) : null;
    self.postMessage({ id: m.id, ok: true, complete: M.complete, size: M.size, moves: mv });
  } catch (e) { self.postMessage({ id: m.id, ok: false, error: String(e) }); }
};
