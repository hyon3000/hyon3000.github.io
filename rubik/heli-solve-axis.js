// Cube - scramble-independent solver of the axis cube n >= 4 (cubeaxis).  The pieces are the cells of an n x n x n lattice clipped by the tilted outer cube, so same-coloured centres and wings are different
// pieces and the solved state needs every piece in a slot of its own shape.  The lattice is described to the general group solver (heli-solve-grp-core.js, run in heli-solve-glue-worker.js): every cell is a
// unit piece with six unit stickers (one per cell face, direction = normal), the label of a sticker is (shape class of the piece, orbit of the face under the rotations that map the shape to itself), so cells
// of one shape (the unclipped cubes, the empty cells) are interchangeable and a clipped cell must come home with its turn.  A layer turn is a permutation of these stickers (state independent); the group
// solver finds the word.  The state is read from the pieces alone (never from S.hist); jumbling (45 degree turns of the scramble) is undone first.
// CAVEAT: the engine refuses turns that would break the contact of the pieces (face bond rule, state dependent); from n = 5 about a third to a half of the turns of a word are refused in the scrambled
// positions, and a search for a legal path did not work, so those turns are put in the plan with `trust` (applied without the contact test).  n = 4 plans need none (checked).
(function () {
  'use strict';
  const H = window.HELI, B = window.__hbox, G = window.__hglue, R = window.HGLUE; if (!H || !B || !G || !R) return;
  window.HSOLVERS = window.HSOLVERS || [];
  const HALF = Math.PI / 2, ROTS = R.ROTS, ap = R.ap;
  const DIRV = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const dirOf = (v) => (v[0] > 0.5 ? 0 : v[0] < -0.5 ? 1 : v[1] > 0.5 ? 2 : v[1] < -0.5 ? 3 : v[2] > 0.5 ? 4 : 5);
  const rotIdx = (Rm) => ROTS.findIndex((r) => r.every((x, k) => Math.abs(x - Rm[k]) < 1e-4));
  const cellsKey = (vs) => vs.map((v) => v.map((x) => Math.round(x * 1000)).join(',')).sort().join(';');

  // description of the lattice model of the puzzle (cached by the shape and size on the cfg)
  function describe(S) {
    const cfg = S.cfg, n = cfg.n; if (cfg._ax) return cfg._ax;
    const cuts = [[], [], []]; cfg.planes.forEach((pl) => { [pl.d, pl.hi].forEach((v) => { if (typeof v === 'number' && Math.abs(v) < 8 && !cuts[pl.ax].some((x) => Math.abs(x - v) < 1e-6)) cuts[pl.ax].push(v); }); }); cuts.forEach((a) => a.sort((x, y) => x - y));
    const cellOf = (p) => p.map((x, a) => cuts[a].filter((v) => x > v).length), cellCentre = (c) => c.map((i) => -1 + (2 * i + 1) / n);
    const idx = (c) => (c[0] * n + c[1]) * n + c[2], nC = n * n * n, pieceOfCell = new Array(nC).fill(-1);
    const classes = new Map(), labels = new Map(), cellLabel = new Array(nC), cellCls = new Array(nC);
    let lab = 1; const labelOf = (cls, orb) => { const k = cls + '|' + orb; if (!labels.has(k)) labels.set(k, lab++); return labels.get(k); };
    S.pieces.forEach((pc, j) => {
      const vs = []; pc.home.forEach((f) => f.v.forEach((q) => vs.push(q)));
      const cen = [0, 1, 2].map((a) => vs.reduce((s, q) => s + q[a], 0) / vs.length), c = cellOf(cen), ci = idx(c);
      if (c.some((x) => x < 0 || x >= n) || pieceOfCell[ci] >= 0) { cfg._ax = { error: 'cells' }; return; }
      pieceOfCell[ci] = j;
      const cc = cellCentre(c), faces = pc.home.map((f) => ({ vs: f.v.map((q) => [0, 1, 2].map((a) => (q[a] - cc[a]) * n / 2)), tag: f.tag }));          // the faces in the frame of the cell (cell = [-1, 1]^3), with their colours
      const keyOf = (Rm) => faces.map((f) => cellsKey(f.vs.map((q) => ap(Rm, q))) + '#' + f.tag).sort().join('|');
      // canonical form: the smallest key over the 24 rotations (colours are part of the form: congruent pieces of different faces are different)
      let best = null, bk = null; ROTS.forEach((Rm, k) => { const key = keyOf(Rm); if (bk === null || key < bk) { bk = key; best = k; } });
      let cls = classes.get(bk); if (!cls) { const sym = ROTS.filter((Rm) => { const cm = ROTS[best]; return faces.map((f) => cellsKey(f.vs.map((q) => ap(Rm, ap(cm, q)))) + '#' + f.tag).sort().join('|') === bk; }); cls = { id: classes.size + 1, sym: sym }; classes.set(bk, cls); }
      cellCls[ci] = { cls: cls, R0: ROTS[best] };
    });
    if (cfg._ax) return cfg._ax;
    const free = new Array(nC).fill(false);
    for (let ci = 0; ci < nC; ci++) { if (pieceOfCell[ci] < 0 || cellCls[ci].cls.sym.length === 24) free[ci] = true; }
    for (let ci = 0; ci < nC; ci++) {
      if (pieceOfCell[ci] < 0) { cellLabel[ci] = [0, 0, 0, 0, 0, 0].map(() => labelOf('void', 0)); continue; }
      const { cls, R0 } = cellCls[ci];
      cellLabel[ci] = DIRV.map((v) => { const dc = ap(R0, v); let orb = 9; cls.sym.forEach((Sm) => { orb = Math.min(orb, dirOf(ap(Sm, dc))); }); return labelOf('c' + cls.id, orb); });
    }
    const pieces = [];
    for (let ci = 0; ci < nC; ci++) {
      const c = [Math.floor(ci / (n * n)), Math.floor(ci / n) % n, ci % n].map((i) => 2 * i - (n - 1));
      pieces.push({ c: c, e: [1, 1, 1], stk: pieceOfCell[ci] < 0 ? [] : free[ci] ? [{ h: c, d: 0, col: cellLabel[ci][0] }] : DIRV.map((v, d) => ({ h: c, d: d, col: cellLabel[ci][d] })) });          // (an empty cell has no sticker, an unclipped cube one: which cells hold cubes matters, how they are turned not)
    }
    const moves = [];
    cfg.planes.forEach((pl, k) => {
      const ax = pl.ax, layer = k % n, box = [[-1e9, 1e9], [-1e9, 1e9], [-1e9, 1e9]]; box[ax] = [2 * layer - n, 2 * layer - n + 2];
      moves.push({ box: box, ctr: [0, 0, 0], rot: R.rotAbout(ax, 1), qs: [1, 3], p: k });
    });
    return (cfg._ax = { n: n, desc: { pieces: pieces, moves: moves }, pieceOfCell: pieceOfCell, cellCls: cellCls.map(function (c) { return c ? c.cls.id + (c.cls.sym.length === 24 ? 'F' : '') : 'V'; }), classes: classes.size, key: 'axis:' + n });
  }
  function stateOf(S, ax) {          // Int16Array (cx, cy, cz, rot) per lattice cell, or null (a piece is off the lattice)
    const n = ax.n, nC = n * n * n, st = new Int16Array(4 * nC), occ = new Set();
    const hc = (ci) => [Math.floor(ci / (n * n)), Math.floor(ci / n) % n, ci % n].map((i) => -1 + (2 * i + 1) / n);
    for (let ci = 0; ci < nC; ci++) {
      const j = ax.pieceOfCell[ci]; if (j < 0) continue;
      const pc = S.pieces[j]; if (pc.R.some((x) => Math.abs(Math.abs(x) - 1) > 1e-3 && Math.abs(x) > 1e-3)) return null;
      const h = hc(ci), cur = [0, 1, 2].map((a) => (pc.R[3 * a] * h[0] + pc.R[3 * a + 1] * h[1] + pc.R[3 * a + 2] * h[2] + pc.T[a]) * n), r = rotIdx(Array.from(pc.R));
      if (r < 0 || cur.some((x) => Math.abs(x - Math.round(x)) > 1e-3)) return null;
      st[4 * ci] = Math.round(cur[0]); st[4 * ci + 1] = Math.round(cur[1]); st[4 * ci + 2] = Math.round(cur[2]); st[4 * ci + 3] = r;
      occ.add(Math.round(cur[0]) + ',' + Math.round(cur[1]) + ',' + Math.round(cur[2]));
    }
    const free = []; for (let ci = 0; ci < nC; ci++) { const c = [Math.floor(ci / (n * n)), Math.floor(ci / n) % n, ci % n].map((i) => 2 * i - (n - 1)); if (!occ.has(c.join(','))) free.push(c); }
    let f = 0; for (let ci = 0; ci < nC; ci++) if (ax.pieceOfCell[ci] < 0) { const c = free[f++]; if (!c) return null; st[4 * ci] = c[0]; st[4 * ci + 1] = c[1]; st[4 * ci + 2] = c[2]; st[4 * ci + 3] = 0; }
    return st;
  }

  const PL = { plan: null, sigs: null, pending: false, failed: false, failSig: '', why: '' };
  const sigOf = G.sigOf, PI = Math.PI;
  // The group model does not know that the engine refuses a turn that would break the contact of the pieces (the face bond rule, which depends on the state).  The word is replayed on a copy of the puzzle;
  // a turn the engine refuses (a half turn is tried as two quarter turns first) is marked `trust` in the plan: the page then applies it without the contact test (the auto solver is a cheat anyway, and the
  // finished plan is checked: the end state must be solved).  Searching for a legal path instead did not converge (a detour randomises the word of the solver).
  function follow(S, X, ax, sg, pre, word, done) {
    const plan = pre.slice(), sigs = [], seen = new Map(); let k = 0; const Y = B.cloneS(X);
    const emit = (s0, m) => {
      const j0 = seen.get(s0);
      if (j0 !== undefined) { for (let q = j0; q < sigs.length; q++) seen.delete(sigs[q]); plan.length = pre.length + j0; sigs.length = j0; }
      seen.set(s0, sigs.length); sigs.push(s0); plan.push(m);
    };
    const tryMove = (m) => {
      const s0 = sigOf(Y);
      if (H.apply(Y, { p: m.p, a: m.a })) { emit(s0, { p: m.p, a: m.a }); return; }
      if (Math.abs(Math.abs(m.a) - PI) < 1e-6) {
        const W2 = B.cloneS(Y);
        if (H.apply(W2, { p: m.p, a: HALF }) && H.apply(W2, { p: m.p, a: HALF })) { H.apply(Y, { p: m.p, a: HALF }); emit(s0, { p: m.p, a: HALF }); const s1 = sigOf(Y); H.apply(Y, { p: m.p, a: HALF }); emit(s1, { p: m.p, a: HALF }); return; }
      }
      H.apply(Y, { p: m.p, a: m.a, trust: true }); emit(s0, { p: m.p, a: m.a, trust: true }); PL.trusted = (PL.trusted || 0) + 1;
    };
    const tick = () => {
      if (sigOf(S) !== sg) { PL.detail = 'moved'; done(null); return; }
      const t0 = Date.now();
      while (k < word.length) { if (Date.now() - t0 > 20) { setTimeout(tick, 0); return; } tryMove(word[k++]); }
      if (!H.isSolved(Y)) PL.detail = 'unsolved';
      done(H.isSolved(Y) ? { plan: plan, sigs: sigs, end: sigOf(Y) } : null);
    };
    PL.trusted = 0; tick();
  }
  function next(S) {
    const i = PL.plan ? PL.sigs.indexOf(sigOf(S)) : -1;
    if (i >= 0 && i < PL.plan.length) return PL.plan[i];
    if (H.isSolved(S)) return null;
    if (PL.pending) return 'wait';
    const sg = sigOf(S); if (PL.failed && PL.failSig === sg) return undefined;
    const fail = (why) => { PL.failed = true; PL.failSig = sg; PL.why = why; PL.pending = false; return undefined; };
    let pre = [];
    if (!B.latticeOk(S)) { const dj = B.dejumbleStops(S, 20000, S.cfg.n >= 5) || B.dejumble(S) || B.dejumbleExact(S) || B.dejumbleSearch(S, 6000); if (!dj) return fail('dejumble'); pre = dj; }
    const X = B.cloneS(S); pre.forEach((m) => H.apply(X, m));
    const ax = describe(X); if (ax.error) return fail(ax.error);
    const st = stateOf(X, ax); if (!st) return fail('state');
    G.wInit(); if (G.W.failed) return fail('worker');
    PL.pending = true; PL.failed = false;
    G.ask({ cmd: 'grp', key: ax.key, desc: ax.desc, st: Array.from(st), opts: { maxSlots: 12000, ms: ax.n <= 7 ? 120000 : 400000 } }, (m) => {
      if (!m.ok) { PL.pending = false; PL.failed = true; PL.failSig = sg; PL.why = 'worker ' + m.error; return; }
      if (sigOf(S) !== sg) { PL.pending = false; return; }
      const word = m.moves.map((q) => ({ p: ax.desc.moves[q.mi].p, a: G.angOf(q.q) }));
      // the plan is [dejumble turns] + the replayed word; the copy starts after the dejumble turns
      follow(S, X, ax, sg, pre, word, (res) => {
        PL.pending = false; if (sigOf(S) !== sg) return;
        if (res) {
          // sigs of the dejumble turns come first: the page finds its place by the state
          const C = B.cloneS(S), allSigs = []; pre.forEach((mv) => { allSigs.push(sigOf(C)); H.apply(C, mv); });
          PL.plan = res.plan; PL.sigs = allSigs.concat(res.sigs); PL.end = res.end;
          const dur = Math.max(0.03, Math.min(0.25, 25 / Math.max(1, PL.plan.length))); PL.plan.forEach((mv) => { mv.dur = dur; });
        } else { PL.failed = true; PL.failSig = sg; PL.why = 'plan'; }
      });
    });
    return 'wait';
  }
  window.HSOLVERS.push({
    match: (shape, cfg) => shape === 'cubeaxis' && cfg.n >= 4,
    next: next,
    plan: (S) => { const i = PL.plan ? PL.sigs.indexOf(sigOf(S)) : -1; return i >= 0 ? PL.plan.slice(i) : null; },
  });
  window.__haxis = { describe: describe, stateOf: stateOf, PL: PL };
})();
