// Helicopter cube with jumbling.  The cube is cut by 12 fixed planes n.p = h (n = (+-1,+-1,0)/sqrt2 and permutations, h = 1/sqrt2, the planes through an edge's
// neighbours) into convex pieces.  A turn rotates everything on the far side of one plane (a right triangular prism and whatever has been moved into it) about the plane's
// normal; it is possible only while no piece straddles that plane.  Turns of 180 degrees always map the cut pattern onto itself; a turn by acos(1/3) = 70.53 degrees
// deforms the cube, and from then on planes are free or locked depending on how the cuts happen to line up.
(function () {
  'use strict';
  const H = Math.SQRT1_2, EPS = 1e-6;
  const ANG = Math.acos(1 / 3);                       // 70.5288 degrees
  // the positions a prism can rest in (angle from its home position): 0, 70.53, 109.47, 180, 180+70.53, 180+109.47
  const STOPS = [0, ANG, Math.PI - ANG, Math.PI, Math.PI + ANG, 2 * Math.PI - ANG];
  const TAU = 2 * Math.PI;
  const normAng = (v) => { v = ((v % TAU) + TAU) % TAU; return v > TAU - 1e-7 ? 0 : v; };
  const NORMALS = [];
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach((s) => { const n = [0, 0, 0]; n[i] = s[0] * H; n[j] = s[1] * H; NORMALS.push(n); });
  // face tags of the cube: 0 +y (U) 1 +x (R) 2 +z (F) 3 -y (D) 4 -x (L) 5 -z (B), -1 = interior
  const FACES = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  function cubePoly() {
    const faces = [];
    FACES.forEach((n, t) => {
      const u = Math.abs(n[1]) === 1 ? [1, 0, 0] : [0, 1, 0], w = cross(n, u), P = (a, b) => [n[0] + u[0] * a + w[0] * b, n[1] + u[1] * a + w[1] * b, n[2] + u[2] * a + w[2] * b];
      faces.push({ v: [P(1, 1), P(-1, 1), P(-1, -1), P(1, -1)], tag: t });
    });
    return faces;
  }
  // keep the part of a convex polyhedron with n.p <= d; null when nothing (or only a face) remains
  function clip(poly, n, d) {
    let any = false, below = false;
    poly.forEach((f) => f.v.forEach((p) => { const s = dot(n, p) - d; if (s > EPS) any = true; if (s < -EPS) below = true; }));
    if (!below) return null;
    if (!any) return poly;
    const out = [], cut = [];
    poly.forEach((f) => {
      const nv = [];
      for (let i = 0; i < f.v.length; i++) {
        const a = f.v[i], b = f.v[(i + 1) % f.v.length], sa = dot(n, a) - d, sb = dot(n, b) - d;
        if (sa <= EPS) nv.push(a);
        if (Math.abs(sa) <= EPS) cut.push(a);
        if ((sa < -EPS && sb > EPS) || (sa > EPS && sb < -EPS)) { const t = sa / (sa - sb), q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; nv.push(q); cut.push(q); }
      }
      if (nv.length >= 3) out.push({ v: nv, tag: f.tag });
    });
    const uniq = [];
    cut.forEach((p) => { if (!uniq.some((q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < 1e-7)) uniq.push(p); });
    if (uniq.length >= 3) {
      const c = [0, 0, 0]; uniq.forEach((p) => { c[0] += p[0] / uniq.length; c[1] += p[1] / uniq.length; c[2] += p[2] / uniq.length; });
      const e1 = (() => { const v = sub(uniq[0], c), l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })(), e2 = cross(n, e1);
      uniq.sort((p, q) => Math.atan2(dot(sub(p, c), e2), dot(sub(p, c), e1)) - Math.atan2(dot(sub(q, c), e2), dot(sub(q, c), e1)));
      out.push({ v: uniq, tag: -1 });
    }
    return out;
  }
  const CELLS = (function () {
    let cells = [cubePoly()];
    NORMALS.forEach((n) => {
      const next = [];
      cells.forEach((c) => { const a = clip(c, n, H), b = clip(c, [-n[0], -n[1], -n[2]], -H); if (a && b) { next.push(a); next.push(b); } else next.push(c); });
      cells = next;
    });
    return cells;
  })();
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function rotMat(n, a) {
    const c = Math.cos(a), s = Math.sin(a), t = 1 - c, x = n[0], y = n[1], z = n[2];
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  const mul = (A, B) => { const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; };
  const app = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];

  function world(S, i) { const pc = S.pieces[i]; return pc.home.map((f) => f.v.map((p) => app(pc.R, p))); }
  function refresh(S, i) { S.pieces[i].W = world(S, i); const W = S.pieces[i].W; let mn = [], mx = []; S.pieces[i].lim = NORMALS.map((n) => { let lo = 1e9, hi = -1e9; W.forEach((f) => f.forEach((p) => { const d = dot(n, p); if (d < lo) lo = d; if (d > hi) hi = d; })); return [lo, hi]; }); }
  function create() {
    const S = { pieces: CELLS.map((c) => ({ home: c, R: I3.slice(), W: null, lim: null })), hist: [], ang: new Array(12).fill(0) };
    for (let i = 0; i < S.pieces.length; i++) refresh(S, i);
    return S;
  }
  // the pieces on the far side of plane p (null when a piece straddles it: the plane is locked)
  function members(S, p) {
    const out = [];
    for (let i = 0; i < S.pieces.length; i++) {
      const l = S.pieces[i].lim[p];
      if (l[0] >= H - EPS) out.push(i);
      else if (l[1] > H + EPS) return null;
    }
    return out;
  }
  function isFree(S, p) { return members(S, p) !== null; }
  function apply(S, mv) {
    const m = members(S, mv.p); if (!m) return false;
    const Rm = rotMat(NORMALS[mv.p], mv.a);
    m.forEach((i) => { S.pieces[i].R = mul(Rm, S.pieces[i].R); refresh(S, i); });
    S.ang[mv.p] = normAng(S.ang[mv.p] + mv.a);
    S.hist.push(mv); return true;
  }
  function inverse(mv) { return { p: mv.p, a: -mv.a }; }
  function isSolved(S) {
    const col = {};
    for (const pc of S.pieces) {
      for (let k = 0; k < pc.home.length; k++) {
        const f = pc.home[k], w = pc.W[k];
        for (const p of w) if (Math.abs(p[0]) > 1 + 1e-5 || Math.abs(p[1]) > 1 + 1e-5 || Math.abs(p[2]) > 1 + 1e-5) return false;
        if (f.tag < 0) continue;
        const nrm = app(pc.R, FACES[f.tag]);
        let ax = -1; for (let q = 0; q < 3; q++) if (Math.abs(Math.abs(nrm[q]) - 1) < 1e-5) ax = q;
        if (ax < 0) return false;
        const sg = nrm[ax] > 0 ? 1 : -1;
        for (const p of w) if (Math.abs(p[ax] - sg) > 1e-5) return false;
        const key = ax * 2 + (sg > 0 ? 0 : 1);
        if (col[key] === undefined) col[key] = f.tag; else if (col[key] !== f.tag) return false;
      }
    }
    return true;
  }
  // a long run of random half turns first (they keep the cube shape; never the same plane twice in a row), then a random number (1-4) of jumbling turns of 70.53 degrees:
  // each one is only made on a plane that is free at that moment (locked planes are detected and skipped), so the result is always reachable and solvable backwards
  function scramble(S, cnt, rnd, jum) {
    const mvs = []; let last = -1;
    for (let i = 0; i < cnt; i++) {
      let p; do { p = Math.floor(rnd() * 12); } while (p === last);
      last = p; const mv = { p: p, a: Math.PI };
      if (apply(S, mv)) mvs.push(mv);
    }
    let nj = jum === undefined ? 1 + Math.floor(rnd() * 4) : jum;
    for (let tries = 0; nj > 0 && tries < 60; tries++) {
      const freeP = []; for (let p = 0; p < 12; p++) if (p !== last && isFree(S, p)) freeP.push(p);
      if (!freeP.length) break;
      const p = freeP[Math.floor(rnd() * freeP.length)], cur = S.ang[p], tg = STOPS.filter((t) => t > 1e-7 && Math.abs(t - Math.PI) > 1e-7 && Math.abs(normAng(t - cur)) > 1e-7), t = tg[Math.floor(rnd() * tg.length)], dl = normAng(t - cur), mv = { p: p, a: dl > Math.PI ? dl - TAU : dl };
      if (apply(S, mv)) { mvs.push(mv); last = p; nj--; }
    }
    return mvs;
  }
  (typeof window !== 'undefined' ? window : globalThis).HELI = { NORMALS: NORMALS, H: H, FACES: FACES, STOPS: STOPS, normAng: normAng, ANG: ANG, CELLS: CELLS, create: create, members: members, isFree: isFree, apply: apply, inverse: inverse, isSolved: isSolved, scramble: scramble, rotMat: rotMat, app: app };
})();
