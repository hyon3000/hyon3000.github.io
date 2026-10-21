// Edge-turning cube (ET) with jumbling, size n >= 2.  For every one of the 6 edge axes n = (+-1,+-1,0)/sqrt2 (and permutations) there are n - 1 parallel cut planes n.p = d, equally
// spaced between -h and h (h = 1/sqrt2; n = 2: the single plane through the centre = Little Chop, n = 3: the planes at +-h = Helicopter Cube).  The cube is cut into convex pieces.  A turn rotates everything on the far side of one plane (a right triangular prism and whatever has been moved into it) about the plane's
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
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) [[1, 1], [1, -1]].forEach((s) => { const n = [0, 0, 0]; n[i] = s[0] * H; n[j] = s[1] * H; NORMALS.push(n); });
  // face tags of the cube: 0 +y (U) 1 +x (R) 2 +z (F) 3 -y (D) 4 -x (L) 5 -z (B), -1 = interior
  const FACES = [[0, 1, 0], [1, 0, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 0, -1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // the tetrahedron (vertices (1,1,1) (1,-1,-1) (-1,1,-1) (-1,-1,1); face f is opposite vertex f, outward unit normal -T[f] / sqrt3, distance 1 / sqrt3 from the centre)
  const TV = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], S3 = Math.sqrt(3);
  const TFACES = TV.map((t) => [-t[0] / S3, -t[1] / S3, -t[2] / S3]);
  function tetraPoly() { return TV.map((_, f) => ({ v: [0, 1, 2, 3].filter((i) => i !== f).map((i) => TV[i].slice()), tag: f })); }
  // the octahedron (vertices +-e_i; face s = (+-1,+-1,+-1) has the outward unit normal s / sqrt3, distance 1 / sqrt3 from the centre)
  const OSG = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]], OFACES = OSG.map((q) => [q[0] / S3, q[1] / S3, q[2] / S3]);
  function octaPoly() { return OSG.map((q, f) => ({ v: [[q[0], 0, 0], [0, q[1], 0], [0, 0, q[2]]], tag: f })); }
  // the dodecahedron (face turning, deep cut): vertices as in puzzles.js (radius sqrt3); 12 pentagons, face f has the unit normal DN[f] at the distance DD from the centre
  const PHI = (1 + Math.sqrt(5)) / 2, DOD = (function () {
    const vs = [];
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => [-1, 1].forEach((c) => vs.push([a, b, c]))));
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => { vs.push([0, a / PHI, b * PHI]); vs.push([b * PHI, 0, a / PHI]); vs.push([a / PHI, b * PHI, 0]); }));
    const nrm = [];
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => { nrm.push([0, a * PHI, b]); nrm.push([b, 0, a * PHI]); nrm.push([a * PHI, b, 0]); }));
    const faces = [], DN = [];
    let DD = 0;
    nrm.forEach((n0, fi) => {
      const l = Math.hypot(n0[0], n0[1], n0[2]), n = [n0[0] / l, n0[1] / l, n0[2] / l];
      let mx = -1e9; vs.forEach((v) => { mx = Math.max(mx, dot(v, n)); }); DD = mx;
      const fv = vs.filter((v) => dot(v, n) > mx - 1e-6), C = [0, 0, 0]; fv.forEach((v) => { C[0] += v[0] / 5; C[1] += v[1] / 5; C[2] += v[2] / 5; });
      const t = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], u0 = cross(n, t), ul = Math.hypot(u0[0], u0[1], u0[2]), u = [u0[0] / ul, u0[1] / ul, u0[2] / ul], w = cross(n, u);
      fv.sort((a, b) => Math.atan2(dot(sub(a, C), w), dot(sub(a, C), u)) - Math.atan2(dot(sub(b, C), w), dot(sub(b, C), u)));
      faces.push({ v: fv.map((p) => p.slice()), tag: fi }); DN.push(n);
    });
    const axes = []; DN.forEach((n, i) => { if (DN.findIndex((m) => dot(m, n) < -0.999) > i) axes.push(n); });
    return { faces: faces, DN: DN, DD: DD, axes: axes };
  })();
  // the icosahedron (vertices (0,+-1,+-PHI) and cyclic), 20 triangles
  const ICO = (function () {
    const vs = [];
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => { vs.push([0, a, b * PHI]); vs.push([b * PHI, 0, a]); vs.push([a, b * PHI, 0]); }));
    const faces = [], DN = [];
    let DD = 0;
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
      const a = vs[i], b = vs[j], c = vs[k], L = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (Math.abs(L(a, b) - 2) < 1e-6 && Math.abs(L(b, c) - 2) < 1e-6 && Math.abs(L(a, c) - 2) < 1e-6) {
        const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], l = Math.hypot(m[0], m[1], m[2]), n = [m[0] / l, m[1] / l, m[2] / l];
        DD = dot(n, a); faces.push({ v: [a.slice(), b.slice(), c.slice()], tag: faces.length }); DN.push(n);
      }
    }
    return { faces: faces, DN: DN, DD: DD, vs: vs };
  })();
  function icosaPoly() { return ICO.faces.map((f) => ({ v: f.v.map((p) => p.slice()), tag: f.tag })); }
  // axes through the midpoints of opposite edges (unit vectors, one per pair) and the distance of an edge midpoint from the centre
  function edgeAxesOf(faces) {
    const out = []; let re = 0;
    faces.forEach((f) => f.v.forEach((p, i) => {
      const q = f.v[(i + 1) % f.v.length], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], l = Math.hypot(m[0], m[1], m[2]), u = [m[0] / l, m[1] / l, m[2] / l];
      re = l;
      if (!out.some((w) => Math.abs(Math.abs(dot(w, u)) - 1) < 1e-6)) out.push(u);
    }));
    return { axes: out, re: re };
  }
  const DODE = edgeAxesOf(DOD.faces), ICOE = edgeAxesOf(ICO.faces);
  // twisted corner turning (octahedron / icosahedron): the cut planes are tilted by about 10 degrees away from the vertex axes (like the skewb planes they avoid the exact regular section)
  function twistedVertexAxes(vs) {
    const ax = []; vs.forEach((v) => { const l = Math.hypot(v[0], v[1], v[2]), u = [v[0] / l, v[1] / l, v[2] / l]; if (!ax.some((w) => Math.abs(Math.abs(dot(w, u)) - 1) < 1e-6)) ax.push(u); });
    const g = [0.37, 0.52, 0.77], tau = 10 * Math.PI / 180;
    return ax.map((u) => { const t0 = cross(u, g), tl = Math.hypot(t0[0], t0[1], t0[2]), t = [t0[0] / tl, t0[1] / tl, t0[2] / tl]; return [u[0] * Math.cos(tau) + t[0] * Math.sin(tau), u[1] * Math.cos(tau) + t[1] * Math.sin(tau), u[2] * Math.cos(tau) + t[2] * Math.sin(tau)]; });
  }
  const OCTV = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], OCTTW = twistedVertexAxes(OCTV), ICOTW = twistedVertexAxes(ICO.vs);
  const ICO_O = (function () { const v0 = ICO.vs[0], l = Math.hypot(v0[0], v0[1], v0[2]); let mn = 1e9, O = 0; ICO.vs.forEach((w) => { const d = Math.hypot(w[0] - v0[0], w[1] - v0[1], w[2] - v0[2]); if (d > 1e-6 && d < mn - 1e-9) { mn = d; O = dot([v0[0] / l, v0[1] / l, v0[2] / l], w); } }); return O; })();
  // the angles (mod 360) at which a turn about plane p's axis lines the cuts of the turned part up with the fixed cuts: a turned cut normal lands on +-another cut normal of the same depth
  function alignStops(planes, p) {
    const a = planes[p].axis, out = [0, Math.PI];
    const proj = (v) => { const k = dot(v, a); return [v[0] - k * a[0], v[1] - k * a[1], v[2] - k * a[2]]; };
    for (let k = 0; k < planes.length; k++) {
      if (k === p) continue;
      for (let l = 0; l < planes.length; l++) {
        if (Math.abs(Math.abs(planes[k].d) - Math.abs(planes[l].d)) > 1e-9) continue;
        for (const sg of [1, -1]) {
          const nk = planes[k].n, nl = planes[l].n.map((x) => x * sg);
          if (Math.abs(dot(nk, a) - dot(nl, a)) > 1e-9) continue;
          const pk = proj(nk), pm = proj(nl), lk = Math.hypot(pk[0], pk[1], pk[2]), lm = Math.hypot(pm[0], pm[1], pm[2]);
          if (lk < 1e-6 || Math.abs(lk - lm) > 1e-9) continue;
          const ang = Math.atan2(dot(cross(pk, pm), a), dot(pk, pm)), v = ((ang % TAU) + TAU) % TAU;
          if (!out.some((w) => Math.abs(w - v) < 1e-7 || Math.abs(Math.abs(w - v) - TAU) < 1e-7)) out.push(v);
        }
      }
    }
    return out.sort((x, y) => x - y);
  }
  function dodecaPoly() { return DOD.faces.map((f) => ({ v: f.v.map((p) => p.slice()), tag: f.tag })); }
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
  function planeDepths(n, O, tet) {
    if (n < 2) return [];
    if (n === 2) return [0];
    const a = [];
    // equally spaced between -O and O (the tetrahedron: a plane away from the centre cuts a rectangle, not a square, so only the central cut keeps a quarter turn attached: see stops)
    for (let k = 0; k <= n - 2; k++) a.push(O * (1 - 2 * k / (n - 2)));
    return a;
  }
  const CFG = {};
  const TAXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], HALFPI = Math.PI / 2;
  const TSTOPS = [0, HALFPI, Math.PI, 3 * HALFPI];        // tetrahedron: the cut planes of the three axes are mutually perpendicular, a quarter turn lines them up
  const OSTOPS = STOPS, OCOL = ['#f2f2f2', '#ffd400', '#d91e18', '#ff7f0e', '#0fa34a', '#1f4fd8', '#8b2fc9', '#00c4d4'];       // the octahedron has the same six edge axes as the cube: the cuts line up at 70.53 / 109.47 degrees
  const DSTOPS = [0, 1, 2, 3, 4].map((k) => k * 2 * Math.PI / 5), DCOL = ['#f2f2f2', '#ffe000', '#d41f26', '#ff8000', '#0f9d58', '#1a4fd6', '#7b2fbe', '#ff78b4', '#9be000', '#00c2d6', '#8c8c8c', '#9c5a2e'];
  const ICOL = ['#f2f2f2', '#ffd400', '#d91e18', '#ff7f0e', '#0fa34a', '#1f4fd8', '#8b2fc9', '#00c4d4', '#ff78b4', '#9be000', '#8c8c8c', '#9c5a2e', '#0b1f6b', '#00796b', '#7a0f2e', '#e6c88f', '#2b2b2b', '#b9a6ff', '#6b7a00', '#8fd0ff'];
  const CCOL = ['#f2f2f2', '#d91e18', '#0fa34a', '#ffd400', '#ff7f0e', '#1f4fd8'], TCOL = ['#d91e18', '#0fa34a', '#1f4fd8', '#ffd400'];
  function config(n, shape) {
    shape = shape || 'cube';
    const ck = shape + n; if (CFG[ck]) return CFG[ck];
    const tet = shape === 'tetra', oct = shape === 'octa', dod = shape === 'dodeca', dte = shape === 'dodecaet', ice = shape === 'icosaet', oct2 = shape === 'octact', ice2 = shape === 'icosact', big = dte || ice || oct2 || ice2;
    const axes = tet ? TAXES : dod ? DOD.axes : dte ? DODE.axes : ice ? ICOE.axes : oct2 ? OCTTW : ice2 ? ICOTW : NORMALS;
    const depths = dod ? (n < 2 ? [] : Array.from({ length: n - 1 }, (_, k) => -DOD.DD * k / (n - 1))) : planeDepths(n, tet ? 0.25 : oct ? 1 / (2 * Math.SQRT2) : dte ? DODE.re / 2 : ice ? ICOE.re / 2 : oct2 ? 0.5 : ice2 ? ICO_O : H, tet);
    // plane = a cut n.p = d; the cap it turns is the side away from the centre (for d = 0 the positive side); axis = unit normal pointing into that side
    const planes = [];
    axes.forEach((nv, ax) => depths.forEach((d) => { const sg = d < 0 ? -1 : 1; planes.push({ stops: null, ax: ax, n: nv, d: d, sg: sg, depth: Math.abs(d), axis: [nv[0] * sg, nv[1] * sg, nv[2] * sg] }); }));
    let cells = [tet ? tetraPoly() : oct || oct2 ? octaPoly() : dod || dte ? dodecaPoly() : ice || ice2 ? icosaPoly() : cubePoly()];
    planes.forEach((pl) => {
      const next = [];
      cells.forEach((c) => { const a = clip(c, pl.n, pl.d), b = clip(c, [-pl.n[0], -pl.n[1], -pl.n[2]], -pl.d); if (a && b) { next.push(a); next.push(b); } else next.push(c); });
      cells = next;
    });
    planes.forEach((pl, i) => { if (!pl.stops) pl.stops = (big || tet) ? alignStops(planes, i) : tet ? TSTOPS : oct ? OSTOPS : dod ? DSTOPS : STOPS; });
    return (CFG[ck] = { n: n, shape: shape, planes: planes, cells: cells, axes: axes, stops: planes.length ? planes[0].stops : STOPS, colours: tet ? TCOL : oct || oct2 ? OCOL : dod || dte ? DCOL : ice || ice2 ? ICOL : CCOL, faceN: tet ? TFACES : oct || oct2 ? OFACES : dod || dte ? DOD.DN : ice || ice2 ? ICO.DN : FACES, faceD: tet || oct || oct2 ? 1 / S3 : dod || dte ? DOD.DD : ice || ice2 ? ICO.DD : 1, noJumble: dod });
  }
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function rotMat(n, a) {
    const c = Math.cos(a), s = Math.sin(a), t = 1 - c, x = n[0], y = n[1], z = n[2];
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  const mul = (A, B) => { const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; };
  const app = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];

  function world(S, i) { const pc = S.pieces[i]; return pc.home.map((f) => f.v.map((p) => app(pc.R, p))); }
  function qr(l, pl) { return pl.sg > 0 ? l : [-l[1], -l[0]]; }
  function refresh(S, i) { S.pieces[i].W = world(S, i); const W = S.pieces[i].W; let mn = [], mx = []; S.pieces[i].lim = S.cfg.axes.map((n) => { let lo = 1e9, hi = -1e9; W.forEach((f) => f.forEach((p) => { const d = dot(n, p); if (d < lo) lo = d; if (d > hi) hi = d; })); return [lo, hi]; }); }
  function create(n, shape) {
    const cfg = config(n === undefined ? 3 : n, shape);
    const S = { cfg: cfg, pieces: cfg.cells.map((c) => ({ home: c, R: I3.slice(), W: null, lim: null })), hist: [], ang: new Array(cfg.planes.length).fill(0) };
    for (let i = 0; i < S.pieces.length; i++) refresh(S, i);
    return S;
  }
  // the pieces in the cap of plane p (null when a piece straddles it: the plane is locked)
  function inCap(S, i, p) { const pl = S.cfg.planes[p], l = qr(S.pieces[i].lim[pl.ax], pl); return l[0] >= pl.depth - EPS; }
  function members(S, p) {
    const pl = S.cfg.planes[p], out = [];
    for (let i = 0; i < S.pieces.length; i++) {
      const l = qr(S.pieces[i].lim[pl.ax], pl);
      if (l[0] >= pl.depth - EPS) out.push(i);
      else if (l[1] > pl.depth + EPS) return null;
    }
    return out;
  }
  function isFree(S, p) { return members(S, p) !== null; }
  function apply(S, mv) {
    const m = members(S, mv.p); if (!m) return false;
    const Rm = rotMat(S.cfg.planes[mv.p].axis, mv.a);
    m.forEach((i) => { S.pieces[i].R = mul(Rm, S.pieces[i].R); refresh(S, i); });
    S.ang[mv.p] = normAng(S.ang[mv.p] + mv.a);
    S.hist.push(mv); return true;
  }
  function inverse(mv) { return { p: mv.p, a: -mv.a }; }
  function isSolved(S) {
    const cfg = S.cfg, col = {}, FN = cfg.faceN, FD = cfg.faceD;
    for (const pc of S.pieces) {
      for (let k = 0; k < pc.home.length; k++) {
        const f = pc.home[k], w = pc.W[k];
        for (const p of w) for (let q = 0; q < FN.length; q++) if (dot(FN[q], p) > FD + 1e-5) return false;          // inside the original solid
        if (f.tag < 0) continue;
        const nrm = app(pc.R, FN[f.tag]);
        let fi = -1; for (let q = 0; q < FN.length; q++) if (Math.abs(nrm[0] - FN[q][0]) + Math.abs(nrm[1] - FN[q][1]) + Math.abs(nrm[2] - FN[q][2]) < 1e-4) fi = q;
        if (fi < 0) return false;
        for (const p of w) if (Math.abs(dot(FN[fi], p) - FD) > 1e-5) return false;
        if (col[fi] === undefined) col[fi] = f.tag; else if (col[fi] !== f.tag) return false;
      }
    }
    return true;
  }
  // a long run of random half turns first (they keep the cube shape; never the same plane twice in a row), then a random number (1-4) of jumbling turns of 70.53 degrees:
  // each one is only made on a plane that is free at that moment (locked planes are detected and skipped), so the result is always reachable and solvable backwards
  function scramble(S, cnt, rnd, jum) {
    const mvs = []; let last = -1; const NPL = S.cfg.planes.length; if (!NPL) return mvs;
    for (let i = 0; i < cnt; i++) {
      let p; do { p = Math.floor(rnd() * NPL); } while (p === last && NPL > 1);
      last = p; const mv = { p: p, a: S.cfg.noJumble ? (1 + Math.floor(rnd() * 4)) * 2 * Math.PI / 5 : Math.PI };
      if (apply(S, mv)) mvs.push(mv);
    }
    let nj = S.cfg.noJumble ? 0 : jum === undefined ? 1 + Math.floor(rnd() * 4) : jum;
    for (let tries = 0; nj > 0 && tries < 60; tries++) {
      const jp = (p) => S.cfg.planes[p].stops.some((t) => t > 1e-7 && Math.abs(t - Math.PI) > 1e-7), freeP = []; for (let p = 0; p < NPL; p++) if (p !== last && jp(p) && isFree(S, p)) freeP.push(p);
      if (!freeP.length) break;
      const p = freeP[Math.floor(rnd() * freeP.length)], cur = S.ang[p], tg = S.cfg.planes[p].stops.filter((t) => t > 1e-7 && Math.abs(t - Math.PI) > 1e-7 && Math.abs(normAng(t - cur)) > 1e-7), t = tg[Math.floor(rnd() * tg.length)], dl = normAng(t - cur), mv = { p: p, a: dl > Math.PI ? dl - TAU : dl };
      if (apply(S, mv)) { mvs.push(mv); last = p; nj--; }
    }
    return mvs;
  }
  (typeof window !== 'undefined' ? window : globalThis).HELI = { NORMALS: NORMALS, config: config, inCap: inCap, H: H, FACES: FACES, STOPS: STOPS, normAng: normAng, ANG: ANG, create: create, members: members, isFree: isFree, apply: apply, inverse: inverse, isSolved: isSolved, scramble: scramble, rotMat: rotMat, app: app };
})();
