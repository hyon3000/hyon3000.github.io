// Web Worker of solver-poly.js: a Schreier-Sims chain with short words (solver-small-core.js) over the sticker permutation group of one polyhedral puzzle; the base is given piece by piece.
importScripts('solver-small-core.js');
let cur = null;
// a chain whose build is cut by a wall-clock limit can come out incomplete when the machine is busy (then the colour search backtracks for minutes): it is checked on random scrambles of the puzzle
// and made again with twice the time and another seed when a check fails
function buildChecked(spec, ms, polishMs, seed0) {
  const M = spec.perms.length, N = spec.N; let r = null, rs = (seed0 || 12345) >>> 0;
  const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
  for (let attempt = 0; attempt < 3; attempt++) {
    const ch = RBSmall.makeChain(spec, { maxMs: ms, polishMs: polishMs, seed: (seed0 || 99) + attempt * 17 });
    let ok = true;
    for (let k = 0; k < 5 && ok; k++) {
      let col = Uint8Array.from(spec.solved);
      for (let i = 0; i < 250; i++) { const p = spec.perms[Math.floor(rnd() * M)], nx = new Uint8Array(N); for (let j = 0; j < N; j++) nx[p[j]] = col[j]; col = nx; }
      const w = ch.solve(col, spec.solved, 100000); if (!w) ok = false;
    }
    r = { chain: ch, ok: ok, attempts: attempt + 1 }; if (ok) return r; ms *= 2;
  }
  return r;
}
onmessage = function (ev) {
  const m = ev.data;
  try {
    if (m.cmd === 'init') {
      if (cur && cur.key === m.key) { postMessage({ cmd: 'ready', key: m.key, ms: 0, info: cur.info }); return; }
      const t0 = Date.now(), spec = { N: m.N, perms: m.perms.map((p) => Int16Array.from(p)), solved: Uint8Array.from(m.solved), nColours: m.nColours, base: m.base };
      cur = { key: m.key, spec: spec, orders: m.orders };
      if (m.bases) { const r = RBSmall.makeChainChecked(spec, m.bases, { totalMs: m.maxMs || 150000, polishMs: 2000 }); cur.solver = r.chain; cur.info = Object.assign({ base: r.base, checked: r.ok }, cur.solver.stats()); }
      else { const r = buildChecked(spec, m.maxMs || 40000, m.polishMs === undefined ? 2000 : m.polishMs); cur.solver = r.chain; cur.info = Object.assign({ checked: r.ok, attempts: r.attempts }, cur.solver.stats()); cur.rebuild = (seed) => buildChecked(spec, (m.maxMs || 40000) * 2, 2000, seed); }
      postMessage({ cmd: 'ready', key: m.key, ms: Date.now() - t0, info: cur.info });
    } else if (m.cmd === 'solve') {
      if (!cur || cur.key !== m.key) { postMessage({ cmd: 'solved', id: m.id, key: m.key, word: null, error: 'not initialised' }); return; }
      const t0 = Date.now();
      let word = cur.solver.solve(Uint8Array.from(m.col), cur.spec.solved, 200000);
      if (!word && cur.rebuild) { const r = cur.rebuild(777); cur.solver = r.chain; cur.rebuild = null; word = cur.solver.solve(Uint8Array.from(m.col), cur.spec.solved, 400000); }          // (a chain made while the machine was busy can lack entries: make it again with more time)
      if (word) word = RBSmall.simplify(word, cur.orders);
      postMessage({ cmd: 'solved', id: m.id, key: m.key, word: word, ms: Date.now() - t0 });
    }
  } catch (e) { postMessage({ cmd: 'error', key: m.key, id: m.id, error: String(e && e.message || e) }); }
};
