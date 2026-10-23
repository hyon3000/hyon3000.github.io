// Page side of the star / dodecahedron / octahedron / tetrahedron solver (see heli-solve-star-core.js): the plan comes from a Web Worker (the table of a puzzle is built there on first use),
// then every turn is looked up by the pose of the pieces, so the plan survives the animation; a state that is not in the plan (the player turned something) is solved again from the present state.
(function () {
  'use strict';
  const HC = window.HELI, X = window.HSTAR; if (!HC || !X) return;
  window.HSOLVERS = window.HSOLVERS || [];
  const SHAPES = { starft: 1, starct: 1, skewbult: 1, qjdodeca: 1, dodecaet: 1, dodecaft: 1, dodeca: 1, octa: 1, octact: 1, icosaet: 1, icosact: 1, tetra: 1 };
  const ST = { key: '', plan: null, sigs: null, pending: false, failed: false, id: 0, worker: null, tried: 0 };
  function worker() {
    if (ST.worker) return ST.worker;
    try {
      ST.worker = new Worker('heli-solve-star-worker.js');
      ST.worker.onmessage = (e) => {
        const m = e.data; if (m.id !== ST.id) return; ST.pending = false;
        if (m.error || !m.result || m.result.error) { ST.failed = true; ST.err = m.error || (m.result && m.result.error); return; }
        ST.plan = m.result.plan; ST.sigs = m.result.sigs; ST.info = m.result;
        ST.dur = Math.max(0.06, Math.min(0.25, 12 / Math.max(1, ST.plan.length)));
      };
      ST.worker.onerror = () => { ST.failed = true; ST.pending = false; ST.worker = null; };
    } catch (err) { ST.failed = true; }
    return ST.worker;
  }
  function state(S) { return { R: S.pieces.map((p) => p.R), T: S.pieces.map((p) => p.T), ang: S.ang.slice() }; }
  function find(S) { if (!ST.plan) return -1; return ST.sigs.indexOf(X.poseSig(S)); }
  function reset(key) { ST.key = key; ST.plan = null; ST.sigs = null; ST.pending = false; ST.failed = false; ST.tried = 0; }
  window.HSOLVERS.push({
    match: (shape, cfg) => !!SHAPES[shape] && cfg.planes.length > 0,
    next: (S, G) => {
      if (HC.isSolved(S)) return null;
      const key = S.cfg.shape + ':' + S.cfg.n; if (ST.key !== key) reset(key);
      const i = find(S);
      if (i >= 0 && i < ST.plan.length) return Object.assign({ dur: ST.dur }, ST.plan[i]);
      if (ST.plan) { ST.plan = null; ST.sigs = null; }          // the state left the plan (or the plan ran out): plan again
      if (ST.failed) return undefined;
      if (!ST.pending) {
        const w = worker(); if (!w) return undefined;
        ST.pending = true; ST.id++; w.postMessage({ cmd: 'solve', id: ST.id, shape: S.cfg.shape, n: S.cfg.n, state: state(S) });
      }
      return 'wait';
    },
    plan: (S) => { const i = find(S); return i >= 0 ? ST.plan.slice(i) : null; },
  });
  window.__hstar = { ST: ST };
})();
