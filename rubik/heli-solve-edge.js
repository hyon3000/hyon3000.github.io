// Scramble-independent solver for the piece-engine cubes whose layers turn about edge axes (little chop, helicopter, clover, curvy) or about a tilted frame (fisher, windmill).
// The state is read from the pieces alone (never from S.hist).  Model: every piece that carries a sticker sits in one of a few "poses" (a rotation of the cube group, found by closing
// the turn rotations); a turn moves the pieces of its layer to the pose rotated by it.  So a turn is a permutation of the points (piece, pose), and a state is one point per piece.
// Solving = Schreier-Sims chain over the pieces (base) with short coset words searched offline (heli-solve-edge-data.js, tools/ in the scratchpad of the session): for the next base piece
// look up the word that carries its present point home without disturbing the earlier pieces, apply it, go on.  Jumbled states (ET shapes turned by 70.53 degrees...) are first
// brought back onto the lattice by turning the jumbled layers back (searched on a copy of the state).
(function () {
  'use strict';
  const HC = window.HELI; if (!HC) return;
  const PI = Math.PI, EPS = 1e-4;
  const SHAPES = { cube: 1, ccclover: 1, cccurvy: 1, cubefisher: 1, cubewindmill: 1 };
  const mul3 = (A, B) => { const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; };
  const mkey = (R) => R.map((x) => { const v = Math.round(x * 1000); return v === 0 ? 0 : v; }).join(',');
  const normAng = (a) => { a = ((a % (2 * PI)) + 2 * PI) % (2 * PI); return a > PI ? a - 2 * PI : a; };

  // the turns the solver uses: [plane, angle]; ET shapes: half turns; the tilted-frame cubes: quarter and half turns
  function genList(shape, S0) {
    const out = [];
    S0.cfg.planes.forEach((pl, p) => { if (shape === 'cubefisher' || shape === 'cubewindmill') [PI / 2, PI, -PI / 2].forEach((a) => out.push({ p: p, a: a })); else out.push({ p: p, a: PI }); });
    return out;
  }
  const MODELS = {};
  function buildModel(shape, n) {
    const mk = shape + ':' + n; if (MODELS[mk]) return MODELS[mk];
    const S0 = HC.create(n, shape), pcs = S0.pieces, gens = genList(shape, S0), cfg = S0.cfg;
    gens.forEach((g) => { const c = cfg.planes[g.p].center; if (c && (Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2])) > 1e-9) throw new Error('turn axis off the centre'); g.Rm = HC.rotMat(cfg.planes[g.p].axis, g.a); });
    // the rotation group the poses live in
    const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1], mats = [I3], mid = { [mkey(I3)]: 0 };
    for (let h = 0; h < mats.length; h++) gens.forEach((g) => { const R = mul3(g.Rm, mats[h]), k = mkey(R); if (mid[k] === undefined) { mid[k] = mats.length; mats.push(R); } });
    if (mats.length > 200) throw new Error('pose group too large');
    const sp = []; pcs.forEach((pc, i) => { if (pc.home.some((f) => f.tag >= 0)) sp.push(i); });
    // membership of piece i in the cap of plane p at pose g: 1 member, 0 not, -1 the plane is cut through the piece
    const memb = (i, g, p) => { const pc = pcs[i], c = { home: pc.home, samp: pc.samp, cloud: pc.cloud, IF: null, R: mats[g].slice(), T: [0, 0, 0], W: null, lim: null, SW: null }; const S1 = { cfg: cfg, pieces: [c], hist: [], ang: [] }; HC._refresh(S1, 0); const m = HC.members(S1, p); return m === null ? -1 : m.length; };
    const pid = {}, pts = []; const idOf = (i, g) => { const k = i + ':' + g; if (pid[k] === undefined) { pid[k] = pts.length; pts.push([i, g]); } return pid[k]; };
    const mcache = {}, M = (i, g, p) => { const k = i + ':' + g + ':' + p; if (mcache[k] === undefined) mcache[k] = memb(i, g, p); return mcache[k]; };
    const base = sp.map((i) => idOf(i, 0)); let blocked = 0;
    const actOf = (k, pt) => { const i = pts[pt][0], g = pts[pt][1], m = M(i, g, gens[k].p); if (m < 0) { blocked++; return pt; } if (m === 0) return pt; return idOf(i, mid[mkey(mul3(gens[k].Rm, mats[g]))]); };
    const act = gens.map(() => []);
    for (let q = 0; q < pts.length; q++) gens.forEach((_, k) => { act[k][q] = actOf(k, q); });
    const inv = gens.map((g) => gens.findIndex((h) => h.p === g.p && Math.abs(normAng(h.a + g.a)) < EPS));
    return (MODELS[mk] = { shape: shape, n: n, gens: gens, mats: mats, mid: mid, sp: sp, pts: pts, pid: pid, act: act, base: base, inv: inv, blocked: blocked });
  }
  // the generator tables as a plain array (for the offline tool) and a checksum that must match the one the data was made with
  function dump(model) {
    let h = 0; model.act.forEach((a, k) => a.forEach((x, q) => { h = (h * 31 + x * (k + 1) + q) % 1000000007; }));
    return { npts: model.pts.length, ngens: model.gens.length, act: model.act, base: model.base, inv: model.inv, sp: model.sp, blocked: model.blocked, sum: h, nm: model.gens.map((g) => g.p + ':' + Math.round(g.a / PI * 180)) };
  }
  // the point of every base piece in the present state; null when a piece is off the lattice
  function readPoints(model, S) {
    const out = [];
    for (let j = 0; j < model.sp.length; j++) {
      const pc = S.pieces[model.sp[j]];
      if (Math.abs(pc.T[0]) + Math.abs(pc.T[1]) + Math.abs(pc.T[2]) > 1e-3) return null;
      const g = model.mid[mkey(pc.R)]; if (g === undefined) return null;
      const q = model.pid[model.sp[j] + ':' + g]; if (q === undefined) return null;
      out.push(q);
    }
    return out;
  }
  const sigOfPoints = (model, P) => P.join(',');
  function sigOfState(S) { return S.pieces.map((pc) => mkey(pc.R) + '/' + pc.T.map((x) => Math.round(x * 100)).join(',')).join('|'); }

  // ---- the chain (data) and the sifting
  function loadChain(model) {
    const D = (window.HEDGE_DATA || {})[model.shape + ':' + model.n]; if (!D) return null;
    if (D.sum !== dump(model).sum) return null;          // another model than the data was made for
    return D;
  }
  // word (list of generator indices) that brings the state to the solved one; null when impossible
  function solveWord(model, D, P0) {
    const P = P0.slice(), out = [], act = model.act;
    for (let lv = 0; lv < D.order.length; lv++) {
      const j = D.order[lv], w = D.tab[lv][P[j]];
      if (w === undefined) return null;
      // w brings the base point (solved position of piece j) to P[j]; its inverse brings P[j] back
      const iw = w.slice().reverse().map((k) => model.inv[k]);
      iw.forEach((k) => { out.push(k); for (let t = 0; t < P.length; t++) P[t] = act[k][P[t]]; });
      if (P[j] !== model.base[j]) return null;
    }
    return P.every((q, j) => q === model.base[j]) ? out : null;
  }
  function cloneState(S) { const C = { cfg: S.cfg, pieces: S.pieces.map((pc) => ({ home: pc.home, samp: pc.samp, cloud: pc.cloud, IF: null, R: pc.R.slice(), T: pc.T.slice(), W: null, lim: null, SW: null, lg: pc.lg ? pc.lg.slice() : undefined })), hist: [], ang: S.ang.slice() }; for (let i = 0; i < C.pieces.length; i++) HC._refresh(C, i); return C; }

  // layers that are off the lattice (turned by a jumbling angle): turn them back, searched on a copy
  function offPlanes(S, planes) { const out = []; S.ang.forEach((a, p) => { const d = Math.min(Math.abs(normAng(a)), Math.abs(normAng(a - PI))); if (d > 1e-3) out.push(p); }); return out; }
  function undoJumbles(S, model) {
    const off = offPlanes(S); if (!off.length) return [];
    const onLattice = (C) => !!readPoints(model, C);
    // the scramble turns the jumbled layers last, one after the other: undo them in some order, each back to its lattice angle (tried for every order, then with the other lattice angle)
    const perms = (a) => a.length <= 1 ? [a] : a.reduce((acc, x, k) => acc.concat(perms(a.slice(0, k).concat(a.slice(k + 1))).map((r) => [x].concat(r))), []);
    for (const ord of perms(off)) for (let mask = 0; mask < (1 << ord.length); mask++) {
      const C = cloneState(S), seq = []; let ok = true;
      for (let k = 0; k < ord.length && ok; k++) {
        const p = ord[k], a = C.ang[p], d0 = normAng(-a), d1 = normAng(PI - a), dd = (mask >> k) & 1 ? d1 : d0, mv = { p: p, a: dd };
        if (!HC.apply(C, mv)) ok = false; else seq.push(mv);
      }
      if (ok && onLattice(C)) return seq;
    }
    // a few lattice turns of the planes in between may be needed: breadth-first over jumble-free turns of free planes (half turns) on top
    return null;
  }

  // ---- planning: moves [{p, a}] with the signature of the state before each of them
  const PLAN = { sig: null, moves: null, sigs: null, key: null, fail: false };
  function plan(S, shape, n) {
    const model = buildModel(shape, n), D = loadChain(model); if (!D) return null;
    const moves = [], sigs = [];
    let C = S;
    if (S.cfg.noJumble === false && (shape === 'cube' || shape === 'ccclover' || shape === 'cccurvy')) {
      const us = undoJumbles(S, model); if (!us) return null;
      if (us.length) { C = cloneState(S); us.forEach((m) => { sigs.push(sigOfState(C)); moves.push(m); HC.apply(C, m); }); }
    }
    const P = readPoints(model, C); if (!P) return null;
    const w = solveWord(model, D, P); if (!w) return null;
    // the abstract run: the state after each move as a signature of the poses
    const poseSig = (Pn) => Pn.join(',');
    let Pc = P.slice();
    w.forEach((k) => {
      sigs.push('L' + poseSig(Pc)); moves.push({ p: model.gens[k].p, a: model.gens[k].a });
      Pc = Pc.map((q) => model.act[k][q]);
    });
    return { moves: moves, sigs: sigs, model: model };
  }
  function poseSigNow(model, S) { const P = readPoints(model, S); return P ? 'L' + P.join(',') : null; }
  function current(S, shape, n) {
    const key = shape + ':' + n + ':' + S.pieces.length;
    const model = buildModel(shape, n);
    const ps = poseSigNow(model, S), ss = ps === null ? sigOfState(S) : null;
    if (PLAN.moves && PLAN.key === key) { let i = -1; for (let t = PLAN.sigs.length - 1; t >= 0; t--) if (PLAN.sigs[t] === ps || PLAN.sigs[t] === ss) { i = t; break; } if (i >= 0) return { i: i }; }
    return null;
  }
  const solver = {
    match: (shape, cfg) => !!SHAPES[shape] && !!(window.HEDGE_DATA || {})[shape + ':' + cfg.n],
    next: (S, G) => {
      const shape = S.cfg.shape, n = S.cfg.n;
      if (HC.isSolved(S)) return null;
      let c = current(S, shape, n);
      if (!c) {
        const pl = plan(S, shape, n);
        if (!pl) return undefined;          // not handled: the game falls back to replaying its history
        PLAN.moves = pl.moves; PLAN.sigs = pl.sigs; PLAN.key = shape + ':' + n + ':' + S.pieces.length;
        c = { i: 0 };
      }
      const mv = PLAN.moves[c.i]; if (!mv) return null;
      const left = PLAN.moves.length - c.i;
      return { p: mv.p, a: mv.a, dur: Math.max(0.05, Math.min(0.25, 30 / Math.max(1, PLAN.moves.length))) , left: left };
    },
    plan: (S) => {
      const shape = S.cfg.shape, n = S.cfg.n; const c = current(S, shape, n);
      if (c) return PLAN.moves.slice(c.i);
      const pl = plan(S, shape, n); if (!pl) return null;
      PLAN.moves = pl.moves; PLAN.sigs = pl.sigs; PLAN.key = shape + ':' + n + ':' + S.pieces.length;
      return pl.moves.slice();
    },
  };
  window.HSOLVERS = window.HSOLVERS || []; window.HSOLVERS.push(solver);
  window.HEDGE = { buildModel: buildModel, dump: dump, readPoints: readPoints, solveWord: solveWord, cloneState: cloneState, undoJumbles: undoJumbles, plan: plan, SHAPES: SHAPES };
})();
