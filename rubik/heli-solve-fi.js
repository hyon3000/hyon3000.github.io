// Abstract model of the fisher cube for the size-generic solver (heli-solve-tc-core.js).  The fisher cube is an ordinary n x n x n cube in the frame (y, u, v) (u = (x+z)/sqrt2, v = (x-z)/sqrt2, equal layers
// on every axis, turns of 90 / 180 degrees); a piece is a cell of that grid (cut by the outer cube) with one of 24 poses, and a turn moves the pieces whose CELL lies in the layer.  So the pieces fall into classes (orbits
// of the cells under the 24 rotations); the 24 poses of a class representative are the 24 "slots" of the class and a turn is a fixed permutation of them: slot u = a rotation (position and orientation of the
// representative); piece j of the class sits in slot g * pi_j when its pose is g (pi_j carries the representative's cell to the cell of j).  Classes with trivial stabilizer have one slot per cell (alternating group on
// the 24 slots), classes on a rotation axis (corners, face and edge centres of odd sizes) have blocks of 2, 3 or 4 slots per cell and are handled as special orbits by the core.
(function (root) {
  'use strict';
  const H = root.HELI;
  const R2 = Math.SQRT1_2, PI = Math.PI;
  const B = [0, 1, 0, R2, 0, R2, R2, 0, -R2];          // rows: y, u, v
  const mul = (A, C) => { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * C[j] + A[i * 3 + 1] * C[3 + j] + A[i * 3 + 2] * C[6 + j]; return r; };
  const tr = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
  const rnd = (A) => A.map((x) => { const v = Math.round(x); return v === 0 ? 0 : v; });
  const key = (A) => A.join(',');
  const MATS = [], MID = {};
  (function () {
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const p of perms) for (let s = 0; s < 8; s++) {
      const M = [0, 0, 0, 0, 0, 0, 0, 0, 0]; for (let r = 0; r < 3; r++) M[r * 3 + p[r]] = (s >> r) & 1 ? -1 : 1;
      const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6]);
      if (det === 1) { MID[key(M)] = MATS.length; MATS.push(M); }
    }
  })();
  const apply = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  // quarter turn about axis ax (right handed): e_u -> e_w, e_w -> -e_u with (ax, u, w) cyclic
  function quarter(ax) { const u = (ax + 1) % 3, w = (ax + 2) % 3, Q = [1, 0, 0, 0, 1, 0, 0, 0, 1]; Q[ax * 3 + ax] = 1; Q[u * 3 + u] = 0; Q[w * 3 + w] = 0; Q[u * 3 + w] = -1; Q[w * 3 + u] = 1; return Q; }
  function hashR(S) {          // the poses of all pieces, rounded (the same on the page and in the worker)
    let a = 0x811c9dc5 | 0, b = 0x9747b28c | 0;
    for (const pc of S.pieces) for (let k = 0; k < 9; k++) { const v = Math.round(pc.R[k] * 64); a = Math.imul(a ^ v, 16777619); b = Math.imul(b + v + 7, 40503) ^ (b >>> 15); }
    return 'R' + (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36);
  }
  function build(n) {
    const S = H.create(n, 'cubefisher'), L = n, bnd = []; for (let k = 1; k < L; k++) bnd.push(-1 + 2 * k / L);
    const idx = (x) => { let i = 0; for (let k = 0; k < bnd.length; k++) if (x > bnd[k]) i++; return i; };
    const cen = (c) => [2 * c[0] - (n - 1), 2 * c[1] - (n - 1), 2 * c[2] - (n - 1)];
    const cidx = (v) => [(v[0] + n - 1) / 2, (v[1] + n - 1) / 2, (v[2] + n - 1) / 2];
    const rot = (M, c) => cidx(apply(M, cen(c)));
    const ck = (c) => c[0] + ',' + c[1] + ',' + c[2];
    const tracked = [];
    // pieces that carry no sticker still count when some pose could push them out of the cube (isSolved wants every polygon inside the solid): the rotated polygons are tested for all 24 poses
    const FN = S.cfg.faceN, FD = S.cfg.faceD, Bt0 = tr(B);
    const risky = (pc) => {
      for (const M of MATS) {
        const Rl = mul(Bt0, mul(M, B));
        for (const w of pc.W) for (const p of w) { const q = apply(Rl, p); for (const nn of FN) if (nn[0] * q[0] + nn[1] * q[1] + nn[2] * q[2] > FD + 1e-5) return true; }
      }
      return false;
    };
    S.pieces.forEach((pc, i) => {
      if (!pc.home.some((f) => f.tag >= 0) && !risky(pc)) return;
      let c = [0, 0, 0], cnt = 0; pc.W.forEach((f) => f.forEach((p) => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; cnt++; })); c = c.map((x) => x / cnt);
      const a = apply(B, c); tracked.push({ i: i, cell: [idx(a[0]), idx(a[1]), idx(a[2])] });
    });
    // classes
    const cls = new Map(), classes = [];
    for (const t of tracked) {
      let best = null; for (const M of MATS) { const c = rot(M, t.cell), k = ck(c); if (best === null || k < best.k) best = { k: k, c: c }; }
      let ci = cls.get(best.k); if (ci === undefined) { ci = classes.length; cls.set(best.k, ci); classes.push({ rep: best.c, cellsOf: null }); }
      t.cls = ci;
    }
    const K = classes.length, d = 24 * K;
    for (const t of tracked) {
      const rep = classes[t.cls].rep; t.pi = -1;
      for (let u = 0; u < 24; u++) { const c = rot(MATS[u], rep); if (c[0] === t.cell[0] && c[1] === t.cell[1] && c[2] === t.cell[2]) { t.pi = u; break; } }
      if (t.pi < 0) throw new Error('cell not in its class');
      t.home = t.cls * 24 + t.pi;
    }
    const block = new Int32Array(d); for (let c = 0; c < K; c++) for (let u = 0; u < 24; u++) { const cell = rot(MATS[u], classes[c].rep); block[c * 24 + u] = c * n * n * n + (cell[0] * n + cell[1]) * n + cell[2]; }
    const real = new Uint8Array(d); for (const t of tracked) { if (real[t.home]) throw new Error('two pieces on one slot'); real[t.home] = 1; }
    // generators: layer l of axis ax, quarter turns a = 1 (+90), 2 (180), 3 (-90); gen index = (ax * L + l) * 3 + a - 1
    const perms = [], inv = [], planeOf = [], codeOf = [];
    const Q = [quarter(0), quarter(1), quarter(2)];
    for (let ax = 0; ax < 3; ax++) for (let l = 0; l < L; l++) {
      const Rs = [Q[ax], mul(Q[ax], Q[ax]), mul(Q[ax], mul(Q[ax], Q[ax]))].map(rnd);
      for (let a = 0; a < 3; a++) {
        const pm = new Uint16Array(d);
        for (let c = 0; c < K; c++) for (let u = 0; u < 24; u++) { const cell = rot(MATS[u], classes[c].rep); pm[c * 24 + u] = c * 24 + (cell[ax] === l ? MID[key(rnd(mul(Rs[a], MATS[u])))] : u); }
        perms.push(pm); planeOf.push(ax * L + l); codeOf.push(a + 1);
      }
    }
    for (let k = 0; k < perms.length; k++) { const base = k - (k % 3); inv.push(k % 3 === 0 ? base + 2 : k % 3 === 2 ? base : k); }
    // lab -> abstract
    const Bt = tr(B);
    function posOf(S2) {          // slot of every tracked piece in the state S2 (pos[f] for the real facelets f = home slot, -1 for the others)
      const pos = new Int32Array(d).fill(-1);
      for (const t of tracked) {
        const Rr = mul(B, mul(S2.pieces[t.i].R, Bt)); if (Rr.some((x) => Math.abs(x - Math.round(x)) > 1e-3)) return null;
        const Ra = rnd(Rr);
        const g = MID[key(Ra)]; if (g === undefined) return null;
        const u = MID[key(rnd(mul(Ra, MATS[t.pi])))]; if (u === undefined) return null;
        pos[t.home] = t.cls * 24 + u;
      }
      return pos;
    }
    return { n: n, d: d, K: K, perms: perms, inv: inv, planeOf: planeOf, codeOf: codeOf, real: real, block: block, tracked: tracked, posOf: posOf, hashR: hashR, classes: classes };
  }
  root.HFI = { build: build, hashR: hashR, MATS: MATS };
})(typeof self !== 'undefined' ? self : globalThis);
