// Cube - scramble-independent solvers for the fully functional cuboids (cuboidff) the first box solver leaves out:
//  * 3x3x3: the two-phase solver of vendor/cubejs on the facelets of the lattice state,
//  * every other size whose lattice group fits a table (2x2x3, about 1.9 million states): breadth-first table from the solved states, built in a worker (heli-solve-cuboid-core.js).
// A state is read from the pieces only (never S.hist).  Jumbling turns of the game's scramble (90 degree turns of rectangular layers) are undone first by a short search.
// Sizes whose table does not fit (2x2x4 ...) are not handled: the hook returns undefined and the old behaviour (replaying the history) remains.
(function () {
  'use strict';
  const H = window.HELI, B = window.__hbox; if (!H || !B) return;
  window.HSOLVERS = window.HSOLVERS || [];
  const HALF = Math.PI / 2, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const dimsOf = (cfg) => (Array.isArray(cfg.n) ? cfg.n : null);
  const sigOf = (S) => { let s = ''; for (const pc of S.pieces) { for (const x of pc.R) s += Math.round(x * 8) + ','; for (const x of pc.T) s += Math.round(x * 64) + ','; s += ';'; } return s; };
  const snapshot = (S) => S.pieces.map((pc) => ({ R: pc.R.slice(), T: pc.T.slice() }));
  const restore = (S, snap) => { snap.forEach((q, i) => { S.pieces[i].R = q.R.slice(); S.pieces[i].T = q.T.slice(); H._refresh(S, i); }); };
  const appM = (R, p) => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]];
  const homeCentre = (pc) => { if (!pc._hc) { const c = [0, 0, 0]; let n = 0; pc.home.forEach((f) => f.v.forEach((p) => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; n++; })); pc._hc = c.map((x) => x / n); } return pc._hc; };
  const scOf = (cfg) => { const p = cfg.planes[0]; return (p.hi - p.d) / 2; };          // the cell size is 2 sc
  const ROTK = (R) => R.map((x) => Math.round(x)).join(',');

  // ---- the lattice state of the pieces: Uint8Array(2n) indexed by the home slot of the piece, or null when some piece is off the lattice / the box
  function modelState(S, dims) {
    const C = window.CUBOID, M = C.build(dims, 1), sc = scOf(S.cfg), n = S.pieces.length, st = new Uint8Array(2 * n), seen = new Set();
    if (n !== M.n) return null;
    for (const pc of S.pieces) {
      const hc = homeCentre(pc).map((x) => x / sc), h = M.idx[hc.map(Math.round).join(',')]; if (h === undefined) return null;
      const q = appM(pc.R, homeCentre(pc)).map((x, a) => (x + pc.T[a]) / sc); if (q.some((x) => Math.abs(x - Math.round(x)) > 1e-3)) return null;
      const s = M.idx[q.map(Math.round).join(',')]; if (s === undefined || seen.has(s)) return null; seen.add(s);
      if (pc.R.some((x) => Math.abs(Math.abs(x) - 1) > 1e-3 && Math.abs(x) > 1e-3)) return null;
      const r = C.ROTIDX[ROTK(pc.R)]; if (r === undefined) return null;
      st[2 * h] = s; st[2 * h + 1] = r;
    }
    return st;
  }
  // bring a jumbled state back onto the lattice: breadth-first over 90 degree turns of the rectangular layers (the only turns that deform the box)
  function dejumble(S, dims) {
    const C = window.CUBOID; if (modelState(S, dims)) return [];
    // 1st pass: only quarter turns of the rectangular layers (cheap, nearly always enough); 2nd pass: every layer, quarter and half turns, deeper (the inverse of a scramble turn can be refused by the body rule)
    for (const wide of [false, true]) {
      const X = B.cloneS(S), pl = []; X.cfg.planes.forEach((p, i) => { if (wide || !p.square) pl.push(i); });
      const angs = wide ? [HALF, -HALF, 2 * HALF] : [HALF, -HALF], maxD = wide ? 6 : 4;
      const seen = new Set([sigOf(X)]); let layer = [{ snap: snapshot(X), path: [] }];
      for (let depth = 0; depth < maxD && layer.length && seen.size < 60000; depth++) {
        const next = [];
        for (const st of layer) for (const p of pl) for (const a of angs) {
          restore(X, st.snap); X.hist = []; if (!H.apply(X, { p: p, a: a })) continue;
          const sg = sigOf(X); if (seen.has(sg)) continue; seen.add(sg);
          const path = st.path.concat([{ p: p, a: a }]); if (modelState(X, dims)) return path;
          next.push({ snap: snapshot(X), path: path });
        }
        layer = next;
      }
    }
    return null;
  }

  // ---- the worker (lattice table) and the cubejs worker, one of each per page
  const W = { worker: null, ready: false, failed: false, id: 0, cb: {}, info: {} };
  function wInit() {
    if (W.worker || W.failed) return;
    try {
      W.worker = new Worker('heli-solve-cuboid-worker.js');
      W.worker.onmessage = (ev) => { const m = ev.data; if (m.complete !== undefined) W.info = { complete: m.complete, size: m.size }; if (W.cb[m.id]) { const f = W.cb[m.id]; delete W.cb[m.id]; f(m); } };
      W.worker.onerror = () => { W.failed = true; };
    } catch (e) { W.failed = true; }
  }
  const wAsk = (msg, cb) => { W.id++; msg.id = W.id; W.cb[W.id] = cb; W.worker.postMessage(msg); };
  const K = { worker: null, ready: false, failed: false, id: 0, cb: {} };
  function kInit() {
    if (K.worker || K.failed) return;
    try {
      K.worker = new Worker('vendor/cubejs/worker.js');
      K.worker.onmessage = (ev) => { const m = ev.data; if (m.cmd === 'init') K.ready = true; else if (m.cmd === 'solve' && K.cb[m.id]) { const f = K.cb[m.id]; delete K.cb[m.id]; f(m.error ? null : m.algorithm); } };
      K.worker.onerror = () => { K.failed = true; };
      K.worker.postMessage({ cmd: 'init' });
    } catch (e) { K.failed = true; }
  }

  // ---- the plan, followed by the states (the page asks for the next move at every state)
  const PL = { plan: null, sigs: null, pending: false, failed: false, key: '', end: '' };
  function setPlan(S, moves) {
    const X = B.cloneS(S); PL.plan = []; PL.sigs = [];
    for (const m of moves) { const s = sigOf(X); if (!H.apply(X, m)) { PL.plan = null; return false; } PL.plan.push(m); PL.sigs.push(s); }
    PL.end = sigOf(X); return true;
  }
  const planIdx = (S) => (PL.plan ? PL.sigs.indexOf(sigOf(S)) : -1);
  function planIndex(cfg, k) { return cfg.planes.findIndex((pl) => pl.ax === k.ax && Math.abs((pl.d / scOf(cfg) + cfg.n[k.ax]) / 2 - k.k) < 1e-6); }
  function engineMoves(S, dims, mv) {
    const out = []; for (const m of mv) { const p = planIndex(S.cfg, m); if (p < 0) return null; out.push({ p: p, a: m.q === 3 ? -HALF : m.q * HALF }); } return out;
  }

  // ---- strategy A: the lattice table.  The worker answers with move indices of the lattice model; every move is tried on the real engine (the body may not fall apart), a refused
  // (state, move) pair is sent back as forbidden and the search goes around it.
  function strategyTable(S) {
    const dims = dimsOf(S.cfg), i = planIdx(S);
    if (i >= 0 && i < PL.plan.length) return PL.plan[i];
    if (H.isSolved(S)) return null;
    if (PL.failed && PL.failSig === sigOf(S)) return undefined;
    if (W.failed) return undefined;
    wInit(); if (PL.pending) return 'wait';
    PL.failed = false;
    const dj = dejumble(S, dims); if (!dj) return undefined;
    const X = B.cloneS(S); dj.forEach((m) => H.apply(X, m));
    const st = modelState(X, dims); if (!st) return undefined;
    const M = window.CUBOID.build(dims, 1), forb = [], sig0 = sigOf(S); PL.pending = true; PL.failSig = sig0;
    const attempt = (n) => {
      wAsk({ cmd: 'solve', dims: dims, state: Array.from(st), cap: 2500000, forb: forb }, (m) => {
        if (!m.ok || !m.complete || !m.moves) { PL.pending = false; PL.failed = true; PL.why = 'worker ' + JSON.stringify([m.ok, m.complete, !!m.moves, n, forb.length]); return; }          // the table of this size does not fit (or no way within the bound): not handled
        if (sigOf(S) !== sig0) { PL.pending = false; return; }
        const Y = B.cloneS(S); dj.forEach((q) => H.apply(Y, q));
        let cur = new Uint8Array(st), em = [];
        for (let t = 0; t < m.moves.length; t++) {
          const mm = M.moves[m.moves[t]], p = planIndex(S.cfg, mm), mv = { p: p, a: mm.q === 3 ? -HALF : mm.q * HALF };
          if (p >= 0 && mm.q === 2 && S.cfg.planes[p].square) {          // a half turn the engine refuses (the body would come apart half way): two quarter turns may be accepted
            const Z = B.cloneS(Y); if (H.apply(Z, { p: p, a: HALF }) && H.apply(Z, { p: p, a: HALF })) { H.apply(Y, { p: p, a: HALF }); H.apply(Y, { p: p, a: HALF }); em.push({ p: p, a: HALF }, { p: p, a: HALF }); cur = M.apply(cur, mm); continue; }
          }
          if (p < 0 || !H.apply(Y, mv)) { forb.push(M.key(cur) + '|' + m.moves[t]); if (n < 300) attempt(n + 1); else { PL.pending = false; PL.failed = true; PL.why = 'attempts'; } return; }
          em.push(mv); cur = M.apply(cur, mm);
        }
        PL.pending = false;
        if (!setPlan(S, dj.concat(em)) || !H.isSolved(Y)) { PL.plan = null; PL.failed = true; }
      });
    };
    attempt(0);
    return 'wait';
  }
  // ---- strategy C: fused and shared cubes by the general piece model (heli-solve-cuboid-core.js buildGen): pieces are boxes with a centre and half extents in doubled units, a plane is a box
  // of layers turned about a centre.  Only small structures fit a table (a few million states); the others are not handled (the hook returns undefined).
  const INFV = 1e9;
  function genDesc(S) {
    if (S.cfg._gd) return S.cfg._gd;
    const pcs = S.pieces; let u = 1e9; const bb = pcs.map((pc) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; pc.home.forEach((f) => f.v.forEach((q) => { for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], q[a]); mx[a] = Math.max(mx[a], q[a]); } })); for (let a = 0; a < 3; a++) u = Math.min(u, (mx[a] - mn[a]) / 2); return { mn: mn, mx: mx }; });
    const I = (x) => { const r = Math.round(x / u); return Math.abs(x / u - r) < 1e-3 ? r : null; };
    const pieces = [], hb = [];
    for (const b of bb) {
      const c = [0, 1, 2].map((a) => I((b.mn[a] + b.mx[a]) / 2)), e = [0, 1, 2].map((a) => I((b.mx[a] - b.mn[a]) / 2)); if (c.some((x) => x === null) || e.some((x) => x === null)) return null;
      pieces.push({ c: c, e: e }); hb.push([0, 1, 2].map((a) => (b.mn[a] + b.mx[a]) / 2));
    }
    const moves = []; let okAll = true;
    S.cfg.planes.forEach((pl, k) => {
      const ax = pl.ax; if (ax === undefined || !pl.axis || Math.abs(pl.axis[ax] - 1) > 1e-6) { okAll = false; return; }
      let box;
      if (pl.bx) box = [0, 1, 2].map((a) => [I(pl.bx.lo[a]), I(pl.bx.hi[a])]);
      else { box = [[-INFV, INFV], [-INFV, INFV], [-INFV, INFV]]; box[ax] = [pl.d < -8 ? -INFV : I(pl.d), pl.hi === undefined ? INFV : I(pl.hi)]; }
      const ctr = (pl.center || [0, 0, 0]).map(I);
      if (ctr.some((x) => x === null) || box.some((b) => b[0] === null || b[1] === null)) { okAll = false; return; }
      const q4 = pl.stops.some((t) => Math.abs(t - HALF) < 1e-6);
      moves.push({ box: box, ctr: ctr, rot: window.CUBOID.rotAbout(ax, 1), qs: q4 ? [1, 2, 3] : [2], p: k });
    });
    if (!okAll || !moves.length) return null;
    return (S.cfg._gd = { u: u, desc: { pieces: pieces, moves: moves }, hb: hb, key: S.cfg.shape + ':' + (S.cfg.n.join ? S.cfg.n.join('_') : S.cfg.n) + ':' + pieces.length + ':' + moves.length + ':' + u.toFixed(6) });
  }
  function genState(S, gd) {
    const C = window.CUBOID, st = new Int16Array(4 * S.pieces.length);
    for (let i = 0; i < S.pieces.length; i++) {
      const pc = S.pieces[i]; if (pc.R.some((x) => Math.abs(Math.abs(x) - 1) > 1e-3 && Math.abs(x) > 1e-3)) return null;
      const c = appM(pc.R, gd.hb[i]).map((x, a) => (x + pc.T[a]) / gd.u); if (c.some((x) => Math.abs(x - Math.round(x)) > 1e-3)) return null;
      const r = C.ROTIDX[ROTK(pc.R)]; if (r === undefined) return null;
      st[4 * i] = Math.round(c[0]); st[4 * i + 1] = Math.round(c[1]); st[4 * i + 2] = Math.round(c[2]); st[4 * i + 3] = r;
    }
    return st;
  }
  function strategyGen(S) {
    const i = planIdx(S);
    if (i >= 0 && i < PL.plan.length) return PL.plan[i];
    if (H.isSolved(S)) return null;
    if (PL.failed && PL.failSig === sigOf(S)) return undefined;
    if (W.failed) return undefined;
    wInit(); if (PL.pending) return 'wait';
    PL.failed = false;
    const gd = genDesc(S); if (!gd) return undefined;
    const st = genState(S, gd); if (!st) return undefined;
    const M = window.CUBOID.buildG(gd.key, gd.desc, 1), forb = [], sig0 = sigOf(S); PL.pending = true; PL.failSig = sig0;
    const attempt = (n) => {
      wAsk({ cmd: 'solveG', key: gd.key, desc: gd.desc, state: Array.from(st), cap: 2500000, forb: forb }, (m) => {
        if (!m.ok || !m.complete || !m.moves) { PL.pending = false; PL.failed = true; PL.why = 'worker ' + JSON.stringify([m.ok, m.complete, m.size, !!m.moves, n, forb.length]); return; }
        if (sigOf(S) !== sig0) { PL.pending = false; return; }
        const Y = B.cloneS(S); let cur = new Int16Array(st), em = [];
        for (let t = 0; t < m.moves.length; t++) {
          const mm = M.moves[m.moves[t]], mv = { p: mm.src.p, a: mm.q === 3 ? -HALF : mm.q * HALF };
          if (!H.apply(Y, mv)) { forb.push(M.key(cur) + '|' + m.moves[t]); if (n < 300) attempt(n + 1); else { PL.pending = false; PL.failed = true; PL.why = 'attempts'; } return; }
          em.push(mv); cur = M.apply(cur, mm);
        }
        PL.pending = false;
        if (!setPlan(S, em) || !H.isSolved(Y)) { PL.plan = null; PL.failed = true; PL.why = 'end'; }
      });
    };
    attempt(0);
    return 'wait';
  }
  // facelets of a 3x3x3 lattice state (the cut planes of a cuboid include its faces, so the slot comes from the cell coordinates instead)
  const FN = H.FACES, FRv = [[1, 0, 0], [0, 0, -1], [1, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0]], FDv = [[0, 0, 1], [0, -1, 0], [0, -1, 0], [0, 0, -1], [0, -1, 0], [0, -1, 0]];
  function facelets3(S) {
    const fl = new Array(54).fill(-1), sc = scOf(S.cfg);
    for (const pc of S.pieces) {
      if (pc.R.some((x) => Math.abs(Math.abs(x) - 1) > 1e-3 && Math.abs(x) > 1e-3)) return null;
      const c = appM(pc.R, homeCentre(pc)).map((x, a) => (x + pc.T[a]) / sc), sl = c.map((x) => (Math.round(x) + 2) / 2);
      if (c.some((x) => Math.abs(x - Math.round(x)) > 1e-3) || sl.some((x) => x < 0 || x > 2 || x !== Math.floor(x))) return null;
      for (let d = 0; d < 6; d++) {
        const ax = FN[d].findIndex((x) => Math.abs(x) > 0.5), onEnd = FN[d][ax] > 0 ? 2 : 0; if (sl[ax] !== onEnd) continue;
        const R = pc.R, v = FN[d], h = [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
        let q = -1; FN.forEach((w, k) => { if (dot(w, h) > 0.9) q = k; }); if (q < 0) return null;
        const ci = (u) => { const a = u.findIndex((x) => x !== 0); return u[a] > 0 ? sl[a] : 2 - sl[a]; };
        fl[d * 9 + ci(FDv[d]) * 3 + ci(FRv[d])] = q;
      }
    }
    return fl.every((x) => x >= 0) ? fl : null;
  }
  // ---- strategy B: 3x3x3 by the two-phase solver
  function strategyCube(S) {
    const i = planIdx(S);
    if (i >= 0 && i < PL.plan.length) return PL.plan[i];
    if (PL.plan && PL.end === sigOf(S) && !H.isSolved(S)) { const fx = B.orientFix(S); if (fx && fx.length && setPlan(S, fx)) return PL.plan[0]; PL.plan = null; }
    if (H.isSolved(S)) return null;
    if (K.failed || PL.failed) return undefined;
    kInit(); if (!K.ready || PL.pending) return 'wait';
    const fl = facelets3(S), fs = fl && B.faceletString(fl); if (!fs) return undefined;
    PL.pending = true; const sig0 = sigOf(S);
    K.id++; K.cb[K.id] = (alg) => {
      PL.pending = false; if (!alg && alg !== '') { K.failed = true; return; }
      if (sigOf(S) !== sig0) return;
      let mv; try { mv = alg ? B.movesOf(alg) : []; } catch (e) { K.failed = true; return; }
      const Y = B.cloneS(S); let ok = true; mv.forEach((m) => { if (!H.apply(Y, m)) ok = false; });
      if (!ok) { K.failed = true; return; }
      const all = mv.slice(); if (!H.isSolved(Y)) { const fx = B.orientFix(Y); if (fx) all.push.apply(all, fx); }
      if (!setPlan(S, all)) K.failed = true;
    };
    K.worker.postMessage({ cmd: 'solve', id: K.id, facelets: fs });
    return 'wait';
  }
  const is333 = (cfg) => { const d = dimsOf(cfg); return d && d[0] === 3 && d[1] === 3 && d[2] === 3; };
  // sizes whose lattice table is tried (the others, e.g. 2x2x4, are far beyond a table): at most 12 cells
  const tableSize = (cfg) => { const d = dimsOf(cfg); return d && d[0] * d[1] * d[2] <= 12 && d[0] * d[1] * d[2] > 9; };
  window.HSOLVERS.push({
    match: (shape, cfg) => shape === 'cuboidff' && (is333(cfg) || tableSize(cfg)),          // (fused and shared cubes: heli-solve-grp-core.js)
    next: (S) => (S.cfg.shape === 'cubefused' || S.cfg.shape === 'cubeshared' ? strategyGen(S) : is333(S.cfg) ? strategyCube(S) : strategyTable(S)),
    plan: (S) => { const i = planIdx(S); return i >= 0 && PL.plan ? PL.plan.slice(i) : null; },
  });
  window.__hcub = { genDesc: genDesc, genState: genState, modelState: modelState, dejumble: dejumble, PL: PL, W: W, K: K };
})();
