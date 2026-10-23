// Scramble-independent auto-solve of the polyhedral discrete puzzles (octa, dodeca, pentult, chopasaurus, icosamate, icosaminx): a Schreier-Sims chain with short words over the sticker
// permutations (solver-small-core.js, built in solver-poly-worker.js on first use).  The base follows the pieces: the stickers of one piece (the stickers that lie in the same layers) are
// consecutive base points, so a wrong choice among equally coloured stickers shows up at once; the order of the pieces decides the length of the solutions and was chosen per puzzle by experiment.
// Hook of game.js: window.RBSOLVERS = [{ match(key, P), next(G, P), plan(G, P) }].
(function () {
  'use strict';
  const MODE = { octa: 'F', dodeca: 'A', pentult: 'D', chopasaurus: 'C', icosamate: 'A', icosaminx: 'F' };
  const CMP = {
    A: (a, b) => a.length - b.length || a[0] - b[0], C: (a, b) => b.length - a.length || a[0] - b[0],
    D: (a, b) => b.length - a.length || b[0] - a[0], F: (a, b) => a[0] - b[0],
  };
  const MAXN = 2500;          // any other discrete puzzle without a dedicated solver (custom sizes of octa / dodeca / icosa / tetra / skewb-like shapes ...) gets the generic chain
  const S = { key: null, worker: null, ready: false, failed: false, pending: false, id: 0, plan: null, sigs: null, reqSig: null, reqCol: null, badSig: null, ms: 0 };
  function sigOf(col) { return String.fromCharCode.apply(null, col); }
  function baseOf(P, mode) {
    const g = {}; for (let i = 0; i < P.N; i++) { const k = P.bands.map((b) => (b.inb[i] ? 1 : 0)).join(''); (g[k] = g[k] || []).push(i); }
    const groups = Object.keys(g).map((k) => g[k]).sort(CMP[mode] || CMP.C);
    return [].concat.apply([], groups);
  }
  function start(key, P) {
    if (S.key === key && (S.worker || S.failed)) return;
    if (S.worker) { try { S.worker.terminate(); } catch (e) {} }
    Object.assign(S, { key: key, worker: null, ready: false, failed: false, pending: false, plan: null, sigs: null, reqSig: null, badSig: null, t0: 0, restarts: 0 });
    let w; try { w = new Worker('solver-poly-worker.js'); } catch (e) { S.failed = true; return; }
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
    w.postMessage({ cmd: 'init', key: key, N: P.N, perms: P.perms.map((p) => Array.from(p)), solved: Array.from(P.solvedCol), nColours: P.nColours, orders: P.bands.map((b) => b.n), base: MODE[key] ? baseOf(P, MODE[key]) : undefined, bases: MODE[key] ? undefined : ['F', 'C', 'A'].map((m) => baseOf(P, m)), maxMs: MODE[key] ? 40000 : Math.max(150000, P.N * 500) });          // the named puzzles keep their tuned order; any other discrete puzzle tries three orders and keeps the first chain that passes a check
  }
  function next(G, P) {
    start(G.key, P);
    if (S.failed) return undefined;
    const sig = sigOf(G.col);
    if (S.plan) { const i = S.sigs.indexOf(sig); if (i >= 0) return S.plan[i]; }
    if (S.badSig === sig) return undefined;          // unsolvable by the chain: the game falls back to replaying its history
    // watchdog: a worker that has not answered for a long time (killed by the browser under memory pressure, stuck) is started again, twice at most
    const now = performance.now(); if (!S.t0) S.t0 = now;
    if (!S.plan && now - S.t0 > 240000 && (S.restarts || 0) < 2) { const r = (S.restarts || 0) + 1, k = S.key; try { S.worker.terminate(); } catch (e) {} S.worker = null; S.key = null; start(k, P); S.restarts = r; S.t0 = now; return 'wait'; }
    if (!S.ready) return 'wait';
    if (!S.pending) { S.pending = true; S.reqSig = sig; S.reqCol = G.col.slice(); S.id++; S.worker.postMessage({ cmd: 'solve', id: S.id, key: S.key, col: Array.from(G.col) }); }
    return 'wait';
  }
  function plan(G, P) {
    if (S.key === G.key && S.plan) { const i = S.sigs.indexOf(sigOf(G.col)); if (i >= 0) return S.plan.slice(i); }
    return null;
  }
  (window.RBSOLVERS = window.RBSOLVERS || []).push({ match: function (key, P) { return !!MODE[key] || !!(P && P.meta && P.meta.solver === 'history' && P.N <= MAXN); }, next: next, plan: plan });
  window.__poly = S;
})();
