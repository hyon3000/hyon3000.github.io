// NxN cubes (n >= 5, and penrose / pandora n >= 4): the auto solver that knows nothing of the scramble.  The reduction solver (solverN-core.js) runs in a Web Worker (solverN-worker.js), the whole plan comes back at once;
// registered in window.RBSOLVERS (see extSolver in game.js).
(function () {
  'use strict';
  const S = { worker: null, key: null, ready: false, failed: false, pending: false, plan: null, sigs: null, id: 0, reqCol: null, P: null };
  const sigOf = (col) => String.fromCharCode.apply(null, col);
  // cube5..7 and every custom size of the plain cube (n >= 5); penrose and pandora cubes have the moves of the plain cube, so their custom sizes n >= 4 (n = 3 has its own kociemba solver) go through the same solver
  function sizeOf(key) {
    let m = /^cube(\d+)$/.exec(key || ''); if (m) return +m[1] >= 5 ? +m[1] : 0;
    m = /^x:cube:(\d+)$/.exec(key || ''); if (m) return +m[1] >= 5 ? +m[1] : 0;
    m = /^x:cube(?:penrose|pandora):(\d+)$/.exec(key || ''); return m && +m[1] >= 4 ? +m[1] : 0;          // (penrose: the end orientation is fixed by orientFix below)
  }
  // turn the whole cube (every layer of one axis together), shortest first, until the puzzle calls it solved
  function orientFix(P, c0) {
    const acts = []; P.lines.forEach((ln, li) => { const bs = P.bands.filter((b) => b.line === li).map((b) => b.idx); [1, -1].forEach((d) => acts.push(bs.map((b) => ({ b: b, d: d })))); });
    const seen = new Set([sigOf(c0)]); let layer = [{ c: c0, path: [] }];
    for (let depth = 0; depth < 5 && layer.length; depth++) {
      const next = [];
      for (const st of layer) for (const a of acts) {
        let c = st.c; a.forEach((mv) => { c = P.apply(c, P.moveOf(mv.b, mv.d)); });
        const sg = sigOf(c); if (seen.has(sg)) continue; seen.add(sg);
        const path = st.path.concat(a); if (P.isSolved(c)) return path;
        next.push({ c: c, path: path });
      }
      layer = next;
    }
    return [];
  }
  function init(key, P) {
    if (S.key === key && (S.worker || S.failed)) return;
    if (S.worker) { try { S.worker.terminate(); } catch (e) {} }
    S.key = key; S.worker = null; S.ready = false; S.failed = false; S.pending = false; S.plan = null; S.sigs = null; S.P = P;
    try {
      const w = new Worker('solverN-worker.js'); S.worker = w;
      w.onmessage = function (ev) {
        const m = ev.data; if (S.worker !== w) return;
        if (m.cmd === 'init') S.ready = true;
        else if (m.cmd === 'solve' && m.id === S.id) {
          S.pending = false; if (m.error || !m.plan) { S.failed = true; return; }
          const moves = [], sigs = [], seen = new Map(); let c = S.reqCol;
          m.plan.forEach((q) => {          // a colouring met twice (penrose / pandora share colours) cuts the loop out: the page finds its place in the plan by the colouring
            const sg = sigOf(c); if (seen.has(sg)) { const i = seen.get(sg); for (let k = i; k < sigs.length; k++) seen.delete(sigs[k]); moves.length = i; sigs.length = i; }
            seen.set(sg, moves.length); sigs.push(sg); moves.push({ b: q[0], d: q[1] }); c = S.P.apply(c, S.P.moveOf(q[0], q[1]));
          });
          if (!S.P.isSolved(c)) orientFix(S.P, c).forEach((q) => { sigs.push(sigOf(c)); moves.push(q); c = S.P.apply(c, S.P.moveOf(q.b, q.d)); });          // penrose: the solved cube may stand in another orientation than the pairs of faces want
          S.plan = moves; S.sigs = sigs;
        }
      };
      w.onerror = function () { S.failed = true; S.worker = null; };
      w.postMessage({ cmd: 'init', key: key });
    } catch (e) { S.failed = true; S.worker = null; }
  }
  window.RBSOLVERS = window.RBSOLVERS || [];
  window.RBSOLVERS.push({
    match: function (key) { return sizeOf(key) >= 5; },
    next: function (G, P) {
      init(G.key, P);
      if (S.plan) { const i = S.sigs.indexOf(sigOf(G.col)); if (i >= 0) return S.plan[i]; }
      if (S.failed) return undefined;
      if (!S.ready) return 'wait';
      if (!S.pending) { S.pending = true; S.reqCol = G.col.slice(); S.id++; S.worker.postMessage({ cmd: 'solve', key: G.key, id: S.id, col: Array.from(G.col) }); }
      return 'wait';
    },
    plan: function (G, P) { if (S.plan && S.key === G.key) { const i = S.sigs.indexOf(sigOf(G.col)); if (i >= 0) return S.plan.slice(i); } return null; },
  });
})();
