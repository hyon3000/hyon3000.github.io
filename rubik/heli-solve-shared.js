// Cube - scramble-independent solver for the shared cube (n = 3, cubes that touch each other in one corner cell, chains of them).
// Every cube is solved on its own: a cube with one shared corner cell is a 3x3x3 whose corner cell cannot move (the layers through it do not turn), so its state is read as a 3x3x3
// (the corner cell has no stickers: the missing corner is inferred), solved by the two-phase solver of vendor/cubejs, and every turn of the solution is carried out with the layers
// the shared corner allows: a face turn on the side of the corner becomes the turn of the other two layers the other way round, and the frame of the solution turns along.
// A cube in the middle of a chain (two opposite shared corners: only its middle slices turn) is solved by the group method (heli-solve-glue-core.js).  Every other shared cube (any n, any chain
// of offsets, also when this method fails) goes to the general group solver (heli-solve-grp-core.js) through __hglue.grpNext.  The state is read from the pieces alone (never from S.hist).
(function () {
  'use strict';
  const H = window.HELI, B = window.__hbox, C = window.__hcub, G = window.__hglue, R = window.HGLUE; if (!H || !B || !C || !G || !R) return;
  window.HSOLVERS = window.HSOLVERS || [];
  const FN = H.FACES, LET = 'URFDLB';
  const FRv = [[1, 0, 0], [0, 0, -1], [1, 0, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0]], FDv = [[0, 0, 1], [0, -1, 0], [0, -1, 0], [0, 0, -1], [0, -1, 0], [0, -1, 0]];
  const CORNERS = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];          // cubejs order; the U / D letter first, then clockwise
  const dir = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const faceOf = (n) => FN.findIndex((f) => Math.abs(f[0] - n[0]) + Math.abs(f[1] - n[1]) + Math.abs(f[2] - n[2]) < 1e-6);
  const slotOf = (fi, p) => fi * 9 + (Math.round(dot(p, FDv[fi]) / 2) + 1) * 3 + (Math.round(dot(p, FRv[fi]) / 2) + 1);

  // ---- the cubes of the puzzle (cfg.n = [n, dx, dy, dz, ...], each offset from the cube before)
  function cubesOf(cfg) {
    const n = cfg.n, fz = cfg.fz || [], o = [[0, 0, 0]];
    for (let q = 0; q + 2 < fz.length; q += 3) { const pv = o[o.length - 1]; o.push([0, 1, 2].map((a) => pv[a] + Math.round(fz[q + a]))); }
    const mn = [0, 1, 2].map((a) => Math.min.apply(null, o.map((x) => x[a]))), mx = [0, 1, 2].map((a) => Math.max.apply(null, o.map((x) => x[a])) + n);
    return { n: n, o: o, mid: [0, 1, 2].map((a) => (mn[a] + mx[a]) / 2) };
  }
  // pieces of cube X that belong to no other cube, and the shared cells of X
  function partOf(cubes, desc, X) {
    const n = cubes.n, inCube = (cell, Y) => cell.every((x, a) => x >= cubes.o[Y][a] && x < cubes.o[Y][a] + n), own = [], shared = [];
    desc.pieces.forEach((p, i) => {
      const cell = p.c.map((c, a) => c / 2 + cubes.mid[a] - 0.5), ce = cell.map(Math.round);
      if (cell.some((x, a) => Math.abs(x - ce[a]) > 1e-6) || !inCube(ce, X)) return;
      if (cubes.o.some((_, Y) => Y !== X && inCube(ce, Y))) shared.push({ i: i, cell: ce }); else own.push(i);
    });
    return { own: own, shared: shared };
  }
  const centreOf = (cubes, X) => cubes.o[X].map((x, a) => 2 * (x + cubes.n / 2 - cubes.mid[a]));          // in the doubled units of the pieces

  // ---- cubejs worker
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
  const kAsk = (fs, cb) => { K.id++; K.cb[K.id] = cb; K.worker.postMessage({ cmd: 'solve', id: K.id, facelets: fs }); };

  // ---- the facelets of a cube with one shared corner cell (st: Int16Array (cx, cy, cz, rot) per piece, gd: the desc with the home centres)
  function facelets(S, st, gd, ctr, own, sc) {
    const fl = new Array(54).fill(-1), P = gd.desc.pieces;
    for (const i of own) {
      const hc = [0, 1, 2].map((a) => P[i].c[a] - ctr[a]), Rm = R.ROTS[st[4 * i + 3]], p = R.ap(Rm, hc), cur = [0, 1, 2].map((a) => st[4 * i + a] - ctr[a]);
      if (p.some((x, a) => Math.abs(x - cur[a]) > 1e-6)) return null;
      for (const f of S.pieces[i].home) { if (f.tag < 0) continue; const fi = faceOf(R.ap(Rm, FN[f.tag])); if (fi < 0) return null; fl[slotOf(fi, p)] = f.tag; }
    }
    const letterOf = {};
    for (let fi = 0; fi < 6; fi++) { const t = fl[fi * 9 + 4]; if (t < 0 || letterOf[t] !== undefined) return null; letterOf[t] = LET[fi]; }
    const L = fl.map((t) => (t < 0 ? '?' : letterOf[t]));
    // corner cubicles: the faces of cubicle j in cubejs order and the cell position
    const cub = CORNERS.map((c) => { const fs = c.split(''), p = [0, 0, 0]; fs.forEach((ch) => { dir[ch].forEach((x, a) => { p[a] += 2 * x; }); }); return { fs: fs, p: p, sl: fs.map((ch) => slotOf(LET.indexOf(ch), p)) }; });
    let sum = 0, miss = -1; const present = [];
    cub.forEach((c, j) => {
      const l = c.sl.map((s) => L[s]);
      if (l.some((x) => x === '?')) { if (l.filter((x) => x === '?').length !== 3 || miss >= 0) { miss = -2; } else miss = j; return; }
      const o = l.findIndex((x) => x === 'U' || x === 'D'); if (o < 0) { miss = -2; return; } sum += o; present.push(l.slice().sort().join(''));
    });
    if (miss < 0) return null;
    const home = CORNERS.findIndex((c) => !present.includes(c.split('').sort().join(''))); if (home < 0) return null;
    const om = (3 - (sum % 3)) % 3, hl = CORNERS[home].split('');
    hl.forEach((ch, jj) => { L[cub[miss].sl[(om + jj) % 3]] = ch; });
    const str = LET.split('').map((_, fi) => L.slice(fi * 9, fi * 9 + 9).join('')).join('');
    return str.indexOf('?') >= 0 ? null : str;
  }

  // ---- the physical turns of a face turn of the virtual cube (frame F: virtual -> lab); returns the new frame
  function carry(tok, F, s, planeOf, out) {
    const face = tok[0], q = tok[1] === '2' ? 2 : tok[1] === "'" ? 3 : 1, nv = dir[face], u = R.ap(F, nv), a = u.findIndex((x) => Math.abs(x) > 0.5), su = u[a] > 0 ? 1 : -1;
    if (su !== s[a]) { const k = su > 0 ? 2 : 0, p = planeOf(a, k); if (p < 0) return null; out.push({ p: p, a: G.angOf(-su * q) }); return F; }
    const ks = s[a] > 0 ? [0, 1] : [1, 2];
    for (const k of ks) { const p = planeOf(a, k); if (p < 0) return null; out.push({ p: p, a: G.angOf(su * q) }); }
    return R.mulM(R.rotAbout(a, su * q), F);
  }

  // ---- the plan
  const PL = { pending: false, failed: false, failSig: '', why: '', tries: 0 };
  function startShared(S) {
    const cfg = S.cfg, cubes = cubesOf(cfg); if (cubes.n !== 3) return undefined;
    const dd = G.descOf(S, 'shared'); if (!dd) return undefined;
    const gd = dd.gd, st0 = C.genState(S, gd); if (!st0) return undefined;
    // classify the cubes
    const jobs = [];
    for (let X = 0; X < cubes.o.length; X++) {
      const pt = partOf(cubes, gd.desc, X), ctr = centreOf(cubes, X);
      if (pt.shared.length === 1) {
        const sc = pt.shared[0].cell.map((x, a) => x - cubes.o[X][a]);
        if (sc.some((x) => x !== 0 && x !== 2)) return undefined;
        jobs.push({ kind: 'half', X: X, own: pt.own, ctr: ctr, s: sc.map((x) => (x === 2 ? 1 : -1)) });
      } else if (pt.shared.length === 2) {
        const [u, v] = pt.shared.map((q) => q.cell.map((x, a) => x - cubes.o[X][a]));
        if (!u.every((x, a) => Math.abs(x - v[a]) === 2 && (x === 0 || x === 2))) return undefined;          // opposite corners only
        jobs.push({ kind: 'mid', X: X, own: pt.own, ctr: ctr });
      } else if (pt.shared.length > 2) return undefined;
    }
    if (!jobs.length) return undefined;
    const planeOfCube = (X) => (a, k) => cfg.planes.findIndex((pl) => (pl.names || []).some((nm) => nm.cube === X && nm.ax === a && nm.k === k));
    kInit(); if (K.failed) return undefined;
    PL.pending = true; PL.failed = false; PL.failSig = G.sigOf(S); PL.why = ''; const sig0 = PL.failSig; PL.tries = 0;
    const finishAll = (moves) => {
      PL.pending = false;
      if (!G.setPlan(S, moves)) return false; return true;
    };
    const attempt = () => {
      const pre = [], X0 = B.cloneS(S);
      if (PL.tries > 0) {          // another start (random turns allowed everywhere) gives another solution, and so another turn of the frame of every half
        const pls = cfg.planes.map((_, i) => i); for (let t = 0; t < Math.min(6, PL.tries + 1); t++) { const p = pls[Math.floor(Math.random() * pls.length)], m = { p: p, a: Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 }; const Y = B.cloneS(X0); if (cfg.planes[p].stops.some((x) => Math.abs(x - Math.PI / 2) < 1e-6) && H.apply(Y, m)) { H.apply(X0, m); pre.push(m); } }
      }
      const st = C.genState(X0, gd); if (!st) { PL.pending = false; PL.failed = true; PL.why = 'state'; return; }
      let moves = pre.slice(), ji = 0;
      const next = () => {
        if (G.sigOf(S) !== sig0) { PL.pending = false; return; }
        if (ji >= jobs.length) {
          if (finishAll(moves)) return;
          if (++PL.tries > 40) { PL.failed = true; PL.why = 'colours'; PL.pending = false; return; }
          PL.pending = true; attempt(); return;
        }
        const job = jobs[ji++];
        if (job.kind === 'half') {
          const fs = facelets(S, st, gd, job.ctr, job.own); if (!fs) { PL.pending = false; PL.failed = true; PL.why = 'facelets'; return; }
          kAsk(fs, (alg) => {
            if (alg === null || alg === undefined) { PL.pending = false; PL.failed = true; PL.why = 'cubejs'; return; }
            const out = [], planeOf = planeOfCube(job.X); let F = [1, 0, 0, 0, 1, 0, 0, 0, 1];
            for (const tok of alg.trim().split(/\s+/).filter((x) => x)) { F = carry(tok, F, job.s, planeOf, out); if (!F) { PL.pending = false; PL.failed = true; PL.why = 'carry'; return; } }
            moves = moves.concat(out); next();
          });
        } else {
          // a middle cube: the group method on its own cells and its own planes
          const idxs = job.own, pieces = idxs.map((i) => gd.desc.pieces[i]);
          const pl = []; cfg.planes.forEach((p, k) => { if ((p.names || []).some((nm) => nm.cube === job.X)) pl.push(k); });
          const mvs = pl.map((k) => Object.assign({}, gd.desc.moves[k], { p: k }));
          const cst = new Int16Array(4 * idxs.length); idxs.forEach((i, j) => { for (let t = 0; t < 4; t++) cst[4 * j + t] = st[4 * i + t]; });
          const base = []; idxs.forEach((i, j) => { if (S.pieces[i].home.some((f) => f.tag >= 0)) base.push(j); });
          G.ask({ cmd: 'solve', key: 'shmid:' + gd.key + ':' + job.X, desc: { pieces: pieces, moves: mvs }, base: base, st: Array.from(cst) }, (m) => {
            if (!m.ok) { PL.pending = false; PL.failed = true; PL.why = 'mid ' + m.error; return; }
            moves = moves.concat(m.moves.map((x) => ({ p: mvs[x.mi].p, a: G.angOf(x.q) }))); next();
          });
        }
      };
      next();
    };
    G.wInit(); if (G.W.failed) { PL.pending = false; return undefined; }
    attempt();
    return 'wait';
  }

  const SHARED_OK = (cfg) => cfg.shape === 'cubeshared' && cfg.n === 3 && Array.isArray(cfg.fz) && cfg.fz.length >= 3 && cfg.fz.every((x) => Math.abs(x) === 2);
  window.HSOLVERS.push({
    match: (shape, cfg) => cfg.shape === 'cubeshared',
    next: (S) => {
      const P = G.PL, i = G.planIdx(S); if (i >= 0 && i < P.plan.length) return P.plan[i];
      if (H.isSolved(S)) return null;
      if (!SHARED_OK(S.cfg)) return G.grpNext(S);          // every other chain: the general group solver (heli-solve-grp-core.js)
      if (PL.pending) return 'wait';
      if (PL.failed && PL.failSig === G.sigOf(S)) return G.grpNext(S);          // the cube-by-cube method did not work out: the general solver
      const r = startShared(S); if (r === undefined) { PL.failed = true; PL.failSig = G.sigOf(S); PL.why = PL.why || 'request'; return G.grpNext(S); }
      return r;
    },
    plan: (S) => { const i = G.planIdx(S); return i >= 0 && G.PL.plan ? G.PL.plan.slice(i) : null; },
  });
  window.__hshared = { PL: PL, K: K, cubesOf: cubesOf, partOf: partOf, facelets: facelets };
})();
