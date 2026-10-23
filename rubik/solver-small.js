// Scramble-independent auto-solve for the small discrete corner-turning cubes: skewb, ivy, rex, redi, pyramorphix (and the custom sizes of the rex / ivy / redi topologies).
// The heavy work (an exact table, or a Schreier-Sims chain with short words, see solver-small-core.js) runs in solver-small-worker.js; this file only registers the hook of game.js:
// window.RBSOLVERS = [{ match(key, P), next(G, P), plan(G, P) }].
(function () {
  'use strict';
  const FIXED = {
    skewb: { kind: 'exact', depth: 7 }, ivy: { kind: 'exact', depth: 30 }, pyramorphix: { kind: 'exact', depth: 30 },
    rex: { kind: 'chain', order: 4945650314421542584320000000 }, redi: { kind: 'chain', order: 1571364748800 },
  };
  function conf(key) { return FIXED[key] || (/^x:cubect(rex|ivy|redi):\d+$/.test(key) ? { kind: 'chain', maxMs: 150000, pieces: true } : null); }
  // base of the chain taken piece by piece (the stickers lying in the same layers are consecutive): a wrong choice among equally coloured stickers then shows up at once (without it the search of the custom rex n >= 4 never ends)
  function pieceBases(P) {          // several orders of the pieces (the first one that gives a verified chain is used)
    const g = {}; for (let i = 0; i < P.N; i++) { const k = P.bands.map((b) => (b.inb[i] ? 1 : 0)).join(''); (g[k] = g[k] || []).push(i); }
    const grp = Object.keys(g).map((k) => g[k]), flat = (cmp) => [].concat.apply([], grp.slice().sort(cmp));
    return [flat((a, b) => a[0] - b[0]), flat((a, b) => b.length - a.length || a[0] - b[0]), flat((a, b) => a.length - b.length || a[0] - b[0])];
  }
  const S = { key: null, worker: null, ready: false, failed: false, pending: false, id: 0, plan: null, sigs: null, reqSig: null, badSig: null, ms: 0 };
  function sigOf(col) { return String.fromCharCode.apply(null, col); }
  function start(key, P) {
    if (S.key === key && (S.worker || S.failed)) return;
    if (S.worker) { try { S.worker.terminate(); } catch (e) {} }
    Object.assign(S, { key: key, worker: null, ready: false, failed: false, pending: false, plan: null, sigs: null, reqSig: null, badSig: null });
    const c = conf(key); let w;
    try { w = new Worker('solver-small-worker.js'); } catch (e) { S.failed = true; return; }
    S.worker = w; const t0 = performance.now();
    w.onmessage = function (ev) {
      const m = ev.data; if (m.key !== S.key) return;
      if (m.cmd === 'ready') { S.ready = true; S.ms = Math.round(performance.now() - t0); }
      else if (m.cmd === 'solved') {
        S.pending = false;
        if (!m.word) { S.badSig = S.reqSig; return; }
        const moves = [], sigs = [], seen = new Map(); let col = Uint8Array.from(S.reqCol);
        m.word.forEach((mm) => {          // a colouring met twice (equal colours make that possible) cuts the loop out: the game finds its place in the plan by the colouring
          const sg = sigOf(col); if (seen.has(sg)) { const i = seen.get(sg); for (let k = i; k < sigs.length; k++) seen.delete(sigs[k]); moves.length = i; sigs.length = i; }
          seen.set(sg, moves.length); sigs.push(sg); moves.push({ b: mm >> 1, d: (mm & 1) ? -1 : 1 }); col = P.apply(col, mm);
        });
        if (!P.isSolved(col)) { S.badSig = S.reqSig; return; }
        S.plan = moves; S.sigs = sigs;
      } else if (m.cmd === 'error') { S.pending = false; S.failed = true; }
    };
    w.onerror = function () { S.failed = true; S.worker = null; };
    w.postMessage({ cmd: 'init', key: key, kind: c.kind, depth: c.depth, order: c.order, maxMs: c.pieces ? Math.max(c.maxMs, P.N * 500) : c.maxMs, N: P.N, perms: P.perms.map((p) => Array.from(p)), solved: Array.from(P.solvedCol), nColours: P.nColours, orders: P.bands.map((b) => b.n), bases: c.pieces ? pieceBases(P) : null });
  }
  function next(G, P) {
    start(G.key, P);
    if (S.failed) return undefined;
    const sig = sigOf(G.col);
    if (S.plan) { const i = S.sigs.indexOf(sig); if (i >= 0) return S.plan[i]; }
    if (S.badSig === sig) return undefined;          // this state could not be solved by the table: the game falls back to replaying its history
    if (!S.ready) return 'wait';
    if (!S.pending) { S.pending = true; S.reqSig = sig; S.reqCol = G.col.slice(); S.id++; S.worker.postMessage({ cmd: 'solve', id: S.id, key: S.key, col: Array.from(G.col) }); }
    return 'wait';
  }
  function plan(G, P) {
    if (S.key === G.key && S.plan) { const i = S.sigs.indexOf(sigOf(G.col)); if (i >= 0) return S.plan.slice(i); }
    return null;
  }
  (window.RBSOLVERS = window.RBSOLVERS || []).push({ match: function (key) { return !!conf(key); }, next: next, plan: plan });
  window.__small = S;
})();
