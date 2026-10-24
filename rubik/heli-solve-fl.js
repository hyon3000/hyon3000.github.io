// Page side of the facelet-chain solver (see heli-solve-fl-core.js).  Registered before heli-solve-star.js: puzzles for which the star solver has an offline table are handed over to it, the others
// (every other size of the star / dodecahedron / octahedron / tetrahedron shapes) get a chain built in a Web Worker on first use.  The plan is looked up by the pose of the pieces, so it survives the
// animation; a state that is not in the plan (the player turned something) is solved again from the present state.
(function () {
  'use strict';
  const HC = window.HELI, X = window.HSTAR; if (!HC || !X) return;
  window.HSOLVERS = window.HSOLVERS || [];
  const SHAPES = { starft: 1, starct: 1, skewbult: 1, qjdodeca: 1, dodecaet: 1, dodecaft: 1, dodeca: 1, octa: 1, icosaet: 1, tetra: 1 };
  const ST = { key: '', plan: null, sigs: null, pending: false, failed: false, delegate: false, noDelegate: false, visits: {}, stalls: 0, id: 0, worker: null, dur: 0.2 };
  let me = null;
  function worker() {
    if (ST.worker) return ST.worker;
    try {
      ST.worker = new Worker('heli-solve-fl-worker.js');
      ST.worker.onmessage = (e) => {
        const m = e.data; if (m.id !== ST.id) return; ST.pending = false;
        if (m.delegate) { ST.delegate = true; return; }
        if (m.error || !m.result || m.result.error) { ST.failed = true; ST.err = m.error || (m.result && m.result.error); return; }
        ST.plan = m.result.plan; ST.sigs = m.result.sigs; ST.info = m.result; ST.dur = Math.max(0.05, Math.min(0.25, 12 / Math.max(1, ST.plan.length)));
      };
      ST.worker.onerror = (ev) => { ST.failed = true; ST.pending = false; ST.err = 'worker error'; ST.worker = null; };
    } catch (err) { ST.failed = true; }
    return ST.worker;
  }
  function state(S) { return { R: S.pieces.map((p) => p.R), T: S.pieces.map((p) => p.T), ang: S.ang.slice() }; }
  function find(S) { if (!ST.plan) return -1; return ST.sigs.indexOf(X.poseSig(S)); }
  function starEntry() { const L = window.HSOLVERS, i = L.indexOf(me); return i >= 0 ? L[i + 1] : null; }
  // A plan that does not advance (the engine refused a turn the model thought legal, or the plan runs in a circle) would keep the auto solve spinning for ever: the pose of the pieces is counted at every
  // call; a state met again and again means the plan is bad - the table of the star solver is dropped for the chain, a bad chain plan is solved again, and after that the solver gives up.
  function stalled(S) {
    const sg = X.poseSig(S), c = (ST.visits[sg] = (ST.visits[sg] || 0) + 1);
    return c > 4;
  }
  function restart(why) {
    ST.stalls++; ST.plan = null; ST.sigs = null; ST.pending = false; ST.visits = {}; ST.why = why;
    if (ST.delegate) { ST.delegate = false; ST.noDelegate = true; ST.failed = false; return; }
    if (ST.stalls > 2) ST.failed = true;
  }
  me = {
    match: (shape, cfg) => !!SHAPES[shape] && cfg.planes.length > 0,
    next: (S, G) => {
      if (HC.isSolved(S)) return null;
      const key = S.cfg.shape + ':' + S.cfg.n;
      if (ST.key !== key) { ST.key = key; ST.plan = null; ST.sigs = null; ST.pending = false; ST.failed = false; ST.delegate = false; ST.noDelegate = false; ST.visits = {}; ST.stalls = 0; }
      if (ST.armed) { ST.armed = false; if (stalled(S)) restart('stalled'); }          // (counted only at the calls that follow a turn handed out)
      if (ST.delegate) { const se = starEntry(), r = se ? se.next(S, G) : undefined; if (r && r !== 'wait') ST.armed = true; return r; }
      const i = find(S);
      if (i >= 0 && i < ST.plan.length) { ST.armed = true; const mv = Object.assign({ dur: ST.dur }, ST.plan[i]); if (i >= ((ST.info && ST.info.pre) || 0)) mv.trust = true; return mv; }          // (lattice turns were legal from the solved state; skipping the engine's bond check makes a big octahedron turn in milliseconds instead of 0.1 s)
      if (ST.plan) { ST.plan = null; ST.sigs = null; }
      if (ST.failed) return undefined;
      if (!ST.pending) { const w = worker(); if (!w) return undefined; ST.pending = true; ST.id++; w.postMessage({ cmd: 'solve', id: ST.id, shape: S.cfg.shape, n: S.cfg.n, state: state(S), noDelegate: ST.noDelegate }); }
      return 'wait';
    },
    plan: (S) => { if (ST.delegate) { const se = starEntry(); return se ? se.plan(S) : null; } const i = find(S); return i >= 0 ? ST.plan.slice(i) : null; },
  };
  window.HSOLVERS.push(me);
  window.__hfl = { ST: ST };
})();
