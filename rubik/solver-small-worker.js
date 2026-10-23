// Web Worker of solver-small.js: builds the solving structure of one puzzle (exact table or Schreier-Sims chain with short words) and solves colourings with it.
importScripts('solver-small-core.js');
let cur = null;          // { key, spec, kind, solver, ready }
onmessage = function (ev) {
  const m = ev.data;
  try {
    if (m.cmd === 'init') {
      if (cur && cur.key === m.key) { postMessage({ cmd: 'ready', key: m.key, ms: 0, info: cur.info }); return; }
      const t0 = Date.now(), perms = m.perms.map((p) => Int16Array.from(p)), spec = { N: m.N, perms: perms, solved: Uint8Array.from(m.solved), nColours: m.nColours, order: m.order };
      cur = { key: m.key, spec: spec, kind: m.kind, orders: m.orders };
      if (m.kind === 'exact') { cur.solver = RBSmall.makeExact(spec, m.depth, m.maxStates || 5000000); cur.info = { size: cur.solver.size, depth: cur.solver.depth, full: cur.solver.full }; }
      else if (m.bases) { const r = RBSmall.makeChainChecked(spec, m.bases, { totalMs: m.maxMs || 150000, polishMs: 2000 }); cur.solver = r.chain; cur.info = Object.assign({ base: r.base, checked: r.ok }, cur.solver.stats()); }
      else { cur.solver = RBSmall.makeChain(spec, { maxMs: m.maxMs || 40000, polishMs: m.polishMs === undefined ? 3000 : m.polishMs }); cur.info = cur.solver.stats(); }
      postMessage({ cmd: 'ready', key: m.key, ms: Date.now() - t0, info: cur.info });
    } else if (m.cmd === 'solve') {
      if (!cur || cur.key !== m.key) { postMessage({ cmd: 'solved', id: m.id, key: m.key, word: null, error: 'not initialised' }); return; }
      const t0 = Date.now(), col = Uint8Array.from(m.col);
      let word = cur.kind === 'exact' ? cur.solver.solve(col, 12) : cur.solver.solve(col, cur.spec.solved, 400000);
      if (word && cur.kind !== 'exact') word = RBSmall.simplify(word, cur.orders);
      postMessage({ cmd: 'solved', id: m.id, key: m.key, word: word, ms: Date.now() - t0 });
    }
  } catch (e) { postMessage({ cmd: 'error', key: m.key, id: m.id, error: String(e && e.message || e) }); }
};
