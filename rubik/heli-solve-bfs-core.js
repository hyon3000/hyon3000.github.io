// Exhaustive solver for the piece-engine puzzles whose turns jam almost at once (the octahedron / icosahedron "CT" shapes octact / icosact of heli.html, whose cuts are twisted against the solid so a
// half turn changes the shape of the whole solid): the states reachable from the solved one are few (4, 7, 48, 21 ... a few hundred), so the whole component is enumerated breadth first with the
// engine itself (HELI.apply decides what is legal) and the way back to the solved state is read off the parent pointers.  It knows nothing of the scramble (never S.hist).  Runs in a Web Worker
// (heli-solve-bfs-worker.js); needs heli-core.js and heli-solve-star-core.js (poseSig / loadState).
(function (root) {
  'use strict';
  const H = root.HELI, X = root.HSTAR, TAU = 2 * Math.PI, PI = Math.PI;
  const normA = (a) => { a = ((a % TAU) + TAU) % TAU; return a > PI + 1e-9 ? a - TAU : a; };
  // identity of a state: the poses of the pieces and the angle every plane stands at (the engine keeps both)
  function key(S) {
    let h1 = 0, h2 = 5381, len = 0;
    const put = (v) => { h1 = (Math.imul(h1, 31) + v) | 0; h2 = (Math.imul(h2 ^ v, 16777619) + 0x9e3779b9) | 0; len++; };
    for (const pc of S.pieces) { for (let i = 0; i < 9; i++) put(Math.round(pc.R[i] * 97.3)); for (let i = 0; i < 3; i++) put(Math.round(pc.T[i] * 97.3)); }
    for (let p = 0; p < S.ang.length; p++) put(Math.round(normA(S.ang[p]) * 997));
    return h1 + ':' + h2 + ':' + len;
  }
  const snap = (S) => ({ R: S.pieces.map((p) => p.R.slice()), T: S.pieces.map((p) => p.T.slice()), ang: S.ang.slice() });
  function load(S, st) { S.pieces.forEach((pc, i) => { pc.R = st.R[i].slice(); pc.T = st.T[i].slice(); H._refresh(S, i); }); S.ang = st.ang.slice(); S.hist = []; }
  const TABLES = {};

  // the component of the solved state: { par: Map key -> {from key, move {p, a}} , done: bool }.  Stops when maxStates / maxMs is exceeded (done = false).
  function build(shape, n, opts) {
    const ck = shape + ':' + n; if (TABLES[ck]) return TABLES[ck];
    opts = opts || {}; const maxStates = opts.maxStates || 60000, maxMs = opts.maxMs || 90000, t0 = Date.now();
    const S = H.create(n, shape), np = S.cfg.planes.length, par = new Map(), root0 = key(S);
    par.set(root0, null);
    let frontier = [snap(S)], over = false;
    while (frontier.length && !over) {
      const next = [];
      for (const st of frontier) {
        load(S, st);
        const k0 = key(S);
        for (let p = 0; p < np && !over; p++) {
          const stops = S.cfg.planes[p].stops, tried = new Set();
          for (const t of stops) {
            const a = normA(t - S.ang[p]); if (Math.abs(a) < 1e-7) continue;
            const ak = Math.round(a * 1e6); if (tried.has(ak)) continue; tried.add(ak);
            const ang0 = S.ang[p];
            if (!H.apply(S, { p: p, a: a })) continue;
            const k1 = key(S);
            if (!par.has(k1)) { par.set(k1, { from: k0, move: { p: p, a: a } }); next.push(snap(S)); }
            H.apply(S, { p: p, a: -a, trust: true }); S.ang[p] = ang0; S.hist.length = 0;
            if (par.size > maxStates || Date.now() - t0 > maxMs) { over = true; break; }
          }
        }
        if (over) break;
      }
      frontier = next;
    }
    return (TABLES[ck] = { par: par, root: root0, done: !over, states: par.size, ms: Date.now() - t0 });
  }

  // state = { R: [...], T: [...], ang: [...] } as the page sends it.  Returns { plan, sigs } like HSTAR.solve, or { error }.
  function solve(shape, n, st, opts) {
    const t0 = Date.now(), S = H.create(n, shape);
    load(S, st);
    if (H.isSolved(S)) return { plan: [], sigs: [], ms: 0 };
    const T = build(shape, n, opts), k = key(S);
    if (!T.par.has(k)) return { error: T.done ? 'state not in the component of the solved state' : 'component too large (' + T.states + '+ states)' };
    const plan = []; let cur = k;
    while (T.par.get(cur)) { const e = T.par.get(cur); plan.push({ p: e.move.p, a: normA(-e.move.a) }); cur = e.from; }
    // replay on the engine: the sigs of the page's lookup (HSTAR.poseSig) and a check that the plan really solves it
    const R = X.loadState(shape, n, st), sigs = [];
    for (const m of plan) { sigs.push(X.poseSig(R)); if (!H.apply(R, m)) return { error: 'engine refused ' + JSON.stringify(m) }; }
    if (!H.isSolved(R)) return { error: 'replay not solved' };
    return { plan: plan, sigs: sigs, ms: Date.now() - t0, states: T.states, tableMs: T.ms };
  }
  root.HBFS = { build: build, solve: solve, key: key, tables: TABLES };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
