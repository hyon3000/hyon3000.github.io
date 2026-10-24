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
  // face-turning dodecahedron with an even n (the pentagram faces): the middle of a face is the pentagon inside the pentagram, the five spikes of the pentagram are gaps (pieces left out)
  function dodecaFTInfo() {
    const D = DOD.DD, d2 = D / PHI; return { D: D, d2: d2 };
  }
  function pointIn2D(P, p, nrm) {
    const t = Math.abs(nrm[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], u0 = cross(nrm, t), ul = Math.hypot(u0[0], u0[1], u0[2]), u = [u0[0] / ul, u0[1] / ul, u0[2] / ul], w = cross(nrm, u);
    const pt = [dot(p, u), dot(p, w)], q = P.map((v) => [dot(v, u), dot(v, w)]); let c = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > pt[1]) !== (q[j][1] > pt[1]) && pt[0] < (q[j][0] - q[i][0]) * (pt[1] - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) c = !c;
    return c;
  }
  function starOfFace(fi) {            // the pentagram of the chords joining the midpoints of non-adjacent edges: [10 points tip, notch, ...]
    const v = DOD.faces[fi].v, M = v.map((q, i) => [(q[0] + v[(i + 1) % 5][0]) / 2, (q[1] + v[(i + 1) % 5][1]) / 2, (q[2] + v[(i + 1) % 5][2]) / 2]);
    const inter = (a, b, c2, d) => { const d1 = sub(b, a), d2v = sub(d, c2), cr = cross(d1, d2v), t = dot(cross(sub(c2, a), d2v), cr) / dot(cr, cr); return [a[0] + d1[0] * t, a[1] + d1[1] * t, a[2] + d1[2] * t]; };
    const out = []; for (let i = 0; i < 5; i++) { out.push(M[i]); out.push(inter(M[i], M[(i + 2) % 5], M[(i + 4) % 5], M[(i + 1) % 5])); }
    return out;
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
  const ICOL = ['#f2f2f2', '#ffd400', '#d41f26', '#ff7f0e', '#0f9d58', '#1a4fd6', '#7b2fbe', '#ff78b4', '#9be000', '#00c2d6', '#8c8c8c', '#9c5a2e', '#0b1f6b', '#00796b', '#7a0f2e', '#e6c88f', '#2b2b2b', '#b9a6ff', '#6b7a00', '#8fd0ff'];          // the same palette as the discrete engine (puzzles.js META.icosa)
  const CCOL = ['#f2f2f2', '#d91e18', '#0fa34a', '#ffd400', '#ff7f0e', '#1f4fd8'], TCOL = ['#d91e18', '#0fa34a', '#1f4fd8', '#ffd400'];
  // special solids: Starminx FT / CT, Skewb Ultimate and QJ Dodecahedron (n = 2 is the original, n more layers) and the Mixup cube (cube FT-mixup, n layers: the outer layers are 1 wide, the inner ones sqrt2)
  // and the Fisher cube (cube FT-fisher, the vertical cuts turned by 45 degrees)
  const SPEC = { starft: 1, starct: 1, skewbult: 1, qjdodeca: 1, cubemix: 1, cubefisher: 1, cubewindmill: 1, cubemirror: 1, cubeaxis: 1, cubefused: 1, cubeshared: 1 };
  function specialConfig(n0, shape) {
    const ck = shape + n0; if (CFG[ck]) return CFG[ck];
    const n = Array.isArray(n0) ? n0[0] : n0, fzFlat = Array.isArray(n0) ? n0.slice(1) : [];          // the fused cube: n and the fused blocks (cx, cy, cz, lx, ly, lz) in cell units
    const dod = shape !== 'cubemix' && shape !== 'cubefisher' && shape !== 'cubewindmill' && shape !== 'cubemirror' && shape !== 'cubeaxis' && shape !== 'cubefused' && shape !== 'cubeshared', cuts = [], moves = [], vs = [], neg = (v) => v.map((x) => -x), nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
    DOD.faces.forEach((f) => f.v.forEach((p) => { if (!vs.some((q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) < 1e-6)) vs.push(p); }));
    const L = Math.max(1, Math.floor(n));
    let axes, stops = DSTOPS, step = 2 * Math.PI / 5, mult = 4, noJ = true, mirrorB = null, fusedBoxes = null, sharedCells = null, sharedInfo = null;
    // caps on both sides of the centre and the slabs below them (pos = the positive plane depths, outermost first); the middle part stays put
    const sides = (i, pos) => { const nv = axes[i]; pos.forEach((v) => cuts.push({ n: nv, d: v }, { n: nv, d: -v })); [1, -1].forEach((sg) => pos.forEach((v, k) => moves.push({ ax: i, n: nv, d: sg * v, sg: sg, depth: v, hi: k === 0 ? undefined : pos[k - 1], axis: sg > 0 ? nv : neg(nv), center: [0, 0, 0] }))); };
    // every layer between the planes of an axis (bounds ascending), the whole puzzle is layered
    const layers = (i, bounds) => { const nv = axes[i]; bounds.forEach((v) => cuts.push({ n: nv, d: v })); for (let k = 0; k <= bounds.length; k++) moves.push({ ax: i, n: nv, d: k === 0 ? -9 : bounds[k - 1], sg: 1, depth: k === 0 ? -9 : bounds[k - 1], hi: k === bounds.length ? undefined : bounds[k], axis: nv, center: [0, 0, 0] }); };
    const spread = (top) => { const a = []; for (let k = 0; k < L - 1; k++) a.push(top * (1 - k / (L - 1))); return a; };          // L - 1 depths from top towards the centre
    const sym = (s, m) => { const a = []; if (m === 1) return [0]; for (let k = 0; k < m; k++) a.push(s * (-1 + 2 * k / (m - 1))); return a; };          // m depths between -s and s
    if (L >= 2) {
      if (shape === 'starft') {          // face turning: the plane of the face cap goes through the five vertices of the ring below the face (the diagonals of the five neighbouring faces)
        axes = DOD.axes; const hs = []; vs.forEach((v) => { const h = dot(v, axes[0]); if (!hs.some((x) => Math.abs(x - h) < 1e-6)) hs.push(h); }); hs.sort((a, b) => b - a);
        axes.forEach((_, i) => sides(i, spread(hs[1])));
      } else if (shape === 'starct') {          // corner turning: the plane of the corner cap goes through the three neighbours of the corner (a diagonal in each of its faces)
        axes = []; const el = Math.min.apply(null, vs.slice(1).map((v) => Math.hypot(v[0] - vs[0][0], v[1] - vs[0][1], v[2] - vs[0][2]))); let dN = 0;
        vs.forEach((v) => { const u = nrm(v); if (axes.some((w) => Math.abs(Math.abs(dot(w, u)) - 1) < 1e-6)) return; axes.push(u); const nb = vs.find((w) => Math.abs(Math.hypot(w[0] - v[0], w[1] - v[1], w[2] - v[2]) - el) < 1e-6); dN = dot(nb, u); });
        axes.forEach((_, i) => sides(i, spread(dN))); stops = [0, 2 * Math.PI / 3, 4 * Math.PI / 3]; step = 2 * Math.PI / 3; mult = 2;
      } else if (shape === 'skewbult') {          // planes perpendicular to the body diagonals of the inscribed cube (n = 2: all through the centre); a layer turns by 120 degrees
        axes = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]].map(nrm);
        axes.forEach((_, i) => layers(i, sym(0.4, L - 1))); stops = [0, 2 * Math.PI / 3, 4 * Math.PI / 3]; step = 2 * Math.PI / 3; mult = 2;
      } else if (shape === 'qjdodeca') {          // planes x, y, z = d (n planes between -0.4 and 0.4, the pyritohedron axes); the layers turn by 90 degrees and deform the solid
        axes = TAXES; axes.forEach((_, i) => layers(i, sym(0.4, L))); stops = TSTOPS; step = HALFPI; mult = 3; noJ = false;
      } else if (shape === 'cubemix') {          // n layers per axis, outer ones 1, inner ones sqrt2 wide
        axes = TAXES; const w = []; for (let i = 0; i < L; i++) w.push(i === 0 || i === L - 1 ? 1 : Math.SQRT2);
        const W = w.reduce((a, b) => a + b, 0), b = [-1]; for (let i = 0; i < L; i++) b.push(b[i] + 2 * w[i] / W);
        axes.forEach((_, i) => layers(i, b.slice(1, L))); stops = []; for (let k = 0; k < 8; k++) stops.push(k * Math.PI / 4); step = Math.PI / 4; mult = 7; noJ = false;
      } else if (shape === 'cubefused') {          // the fused cube: an n x n x n cube in which some blocks of cells are fused into one piece (a block = centre (cx, cy, cz) and lengths (lx, ly, lz) in cell units, the cube is [0, n]^3);
        // a layer that would cut a fused block cannot turn; the layers that hold a block as a whole (the range of layers it spans) can turn together
        axes = TAXES; const bnd = (k) => -1 + 2 * k / L, blocks = []; for (let q = 0; q + 5 < fzFlat.length; q += 6) { const f = fzFlat.slice(q, q + 6); blocks.push({ lo: [0, 1, 2].map((a) => f[a] - f[3 + a] / 2), hi: [0, 1, 2].map((a) => f[a] + f[3 + a] / 2) }); }
        const used = new Set(), boxes = [];
        blocks.forEach((bl) => { boxes.push({ lo: bl.lo, hi: bl.hi }); for (let i = bl.lo[0]; i < bl.hi[0]; i++) for (let j = bl.lo[1]; j < bl.hi[1]; j++) for (let k = bl.lo[2]; k < bl.hi[2]; k++) used.add(i + ',' + j + ',' + k); });
        for (let i = 0; i < L; i++) for (let j = 0; j < L; j++) for (let k = 0; k < L; k++) if (!used.has(i + ',' + j + ',' + k)) boxes.push({ lo: [i, j, k], hi: [i + 1, j + 1, k + 1] });
        fusedBoxes = boxes;
        const seen = new Set(), addMove = (ax, a, b) => { const key = ax + ':' + a + ':' + b; if (seen.has(key)) return; seen.add(key); moves.push({ ax: ax, n: axes[ax], d: a === 0 ? -9 : bnd(a), sg: 1, depth: a === 0 ? -9 : bnd(a), hi: b === L - 1 ? undefined : bnd(b + 1), axis: axes[ax], center: [0, 0, 0] }); };
        axes.forEach((_, i) => { for (let k = 0; k < L; k++) addMove(i, k, k); blocks.forEach((bl) => { const a = bl.lo[i], b = bl.hi[i] - 1; if (b > a && b - a + 1 <= L - 1) addMove(i, a, b); }); });
        stops = TSTOPS; step = HALFPI; mult = 3; noJ = false;
      } else if (shape === 'cubeshared') {          // the shared cube: n x n x n cubes, each shifted from the one before by an offset (dx, dy, dz) cells, sharing the cells where they overlap (one set of pieces).  Each cube turns its own layers
        // about its own axes; a layer turns only if the turn carries every cell of it onto a cell that lies in the same cubes (by 90 degrees if that holds for 90, else by 180 degrees if it holds for 180, else not at all)
        axes = TAXES; const cubes = [[0, 0, 0]]; for (let q = 0; q + 2 < fzFlat.length; q += 3) { const pv = cubes[cubes.length - 1]; cubes.push([0, 1, 2].map((a) => pv[a] + Math.round(fzFlat[q + a] || 0))); }
        const mn = [0, 1, 2].map((a) => Math.min.apply(null, cubes.map((o) => o[a]))), mx = [0, 1, 2].map((a) => Math.max.apply(null, cubes.map((o) => o[a])) + L);
        const ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]), sc = 2 / ext, mid = [0, 1, 2].map((a) => (mn[a] + mx[a]) / 2), key = (v) => v.join(',');
        const inCube = (v, o) => v.every((x, a) => x >= o[a] && x < o[a] + L), sig = (v) => cubes.map((o, c) => (inCube(v, o) ? c : -1)).filter((c) => c >= 0).join('+'), slots = new Set();
        for (let i = mn[0]; i < mx[0]; i++) for (let j = mn[1]; j < mx[1]; j++) for (let k = mn[2]; k < mx[2]; k++) if (sig([i, j, k])) slots.add(key([i, j, k]));
        sharedCells = []; slots.forEach((kk) => {
          const v = kk.split(',').map(Number), lo = v.map((x, a) => (x - mid[a]) * sc);
          sharedCells.push(cubePoly().map((f) => { const nv = FACES[f.tag], nb = [v[0] + nv[0], v[1] + nv[1], v[2] + nv[2]]; return { v: f.v.map((q) => q.map((x, a) => lo[a] + (x + 1) / 2 * sc)), tag: slots.has(key(nb)) ? -1 : f.tag }; }));
        });
        sharedInfo = { slots: slots, mid: mid, sc: sc };
        const seen = new Map();
        cubes.forEach((o, X) => {
          const ctr = [0, 1, 2].map((a) => (o[a] + L / 2 - mid[a]) * sc);
          axes.forEach((_, ax) => {
            const u = (ax + 1) % 3, w = (ax + 2) % 3;
            for (let k = 0; k < L; k++) {
              const lay = [];
              for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) { const v = [0, 0, 0]; v[ax] = o[ax] + k; v[u] = o[u] + a; v[w] = o[w] + b; lay.push(v); }
              const ok = (r) => lay.every((v) => { const ru = v[u] + 0.5 - (o[u] + L / 2), rw = v[w] + 0.5 - (o[w] + L / 2), q = r === 1 ? [-rw, ru] : [-ru, -rw], nvv = v.slice(); nvv[u] = Math.round(q[0] + o[u] + L / 2 - 0.5); nvv[w] = Math.round(q[1] + o[w] + L / 2 - 0.5); return sig(nvv) === sig(v); });
              const q4 = ok(1), q2 = ok(2); if (!q4 && !q2) continue;
              const sk = ax + '|' + [ctr[u], ctr[w]].map((x) => x.toFixed(6)).join(',') + '|' + lay.map(key).sort().join(';');
              if (seen.has(sk)) { seen.get(sk).names.push({ cube: X, ax: ax, k: k }); continue; }
              const lo = [0, 1, 2].map((a) => (a === ax ? o[a] + k : o[a]) - mid[a]), hi = [0, 1, 2].map((a) => (a === ax ? o[a] + k + 1 : o[a] + L) - mid[a]);
              const mv = { ax: ax, n: axes[ax], d: lo[ax] * sc, sg: 1, depth: lo[ax] * sc, hi: hi[ax] * sc, axis: axes[ax], center: ctr, bx: { lo: lo.map((x) => x * sc), hi: hi.map((x) => x * sc) }, names: [{ cube: X, ax: ax, k: k }], stops: q4 ? TSTOPS.slice() : [0, Math.PI] };
              seen.set(sk, mv); moves.push(mv);
            }
          });
        });
        stops = TSTOPS; step = HALFPI; mult = 3; noJ = false;
      } else if (shape === 'cubeaxis') {          // the axis cube: an ordinary n x n x n mechanism (cut planes x, y, z = -1 + 2 k / n, every layer turns by 90 degrees about the axes through the centre) inside a cube that is turned
        // by 60 degrees about the body diagonal (1, 1, 1): the pieces are the cells of the mechanism cut off by that outer cube, so the solved shape is the turned cube and any turn changes the shape; the axes leave the
        // outer cube on its edges, a quarter of the way from a corner (n = 3: the pattern on a face is 45 degree lines plus lines from one corner)
        axes = TAXES; const b = []; for (let k = 1; k < L; k++) b.push(-1 + 2 * k / L); axes.forEach((_, i) => layers(i, b)); stops = []; for (let k = 0; k < 8; k++) stops.push(k * Math.PI / 4); step = Math.PI / 4; mult = 7; noJ = false;          // jumbling: a layer also turns by 45 degree steps; then the pieces of the turned layer cut the other layers, which jam until the layer is turned back to a multiple of 90 degrees
      } else if (shape === 'cubemirror') {          // the mirror cube: n layers per axis of the thicknesses 1, 2, ..., 2, 3 (the inner ones are equal); a layer is the set of pieces in its slots (a turn always works, the
        // pieces keep their size so the shape changes); every visible face is grey, the cube is solved when the shape is a cube again
        axes = TAXES; const w = []; for (let i = 0; i < L; i++) w.push(i === 0 ? 1 : i === L - 1 ? 3 : 2);
        const W = w.reduce((a, b) => a + b, 0), b = [-1]; for (let i = 0; i < L; i++) b.push(b[i] + 2 * w[i] / W);
        const c0 = (b[1] + b[L - 1]) / 2, cc = [c0, c0, c0];          // the axes go through the middle of the inner layers (the core), not through the centre of the cube: that is why the shape changes
        axes.forEach((nv, i) => { for (let k = 1; k < L; k++) cuts.push({ n: nv, d: b[k] }); for (let k = 0; k < L; k++) moves.push({ ax: i, n: nv, d: b[k], sg: 1, depth: b[k], hi: k === L - 1 ? undefined : b[k + 1], axis: nv, center: cc, logical: true, slot: k }); });
        stops = TSTOPS; step = HALFPI; mult = 3; noJ = false; mirrorB = b;
      } else if (shape === 'cubewindmill') {          // the horizontal layers (y = +-1/sqrt13, the same boundaries as on the other two axes), the vertical cuts turned by atan(2/3) instead of 45 degrees (a pinwheel): n1 = (3, 0, -2) / sqrt13, n2 = (2, 0, 3) / sqrt13 at the offsets +-1/sqrt13:
        // on a side face the cuts land at x = -1 (the left cell has no width) and x = -1/3 (the right cell is twice the middle one); the top face has nine pieces (a square in the middle, four trapezoids, four triangles), 90 degree symmetric
        const r13 = Math.sqrt(13); axes = [[0, 1, 0], [3 / r13, 0, -2 / r13], [2 / r13, 0, 3 / r13]]; const a13 = 1 / r13;          // the page shows x to the right, y up, z away from the viewer: seen from above (X = x, Y = z) the top face lines are (0,0)-(2/3,1), (1/3,0)-(1,1), (0,1)-(1,1/3), (0,2/3)-(1,0) in the unit square; the front face (z = -1) has the cuts x = -1, -1/3: widths 0, 1, 2
        layers(0, [-a13, a13]); layers(1, [-a13, a13]); layers(2, [-a13, a13]);          // the same layer boundaries on all three axes: every layer turns by 90 degrees like in the ordinary cube
        stops = TSTOPS; moves.forEach((m) => { m.stops = alignStops(cuts.concat([{ n: m.axis, d: 99, axis: m.axis }]), cuts.length); }); noJ = false;
      } else {          // cubefisher: n horizontal layers (axis y); the vertical cuts are turned by 45 degrees: layers perpendicular to u = (1,0,1), v = (1,0,-1)
        const R2 = Math.SQRT1_2; axes = [[0, 1, 0], [R2, 0, R2], [R2, 0, -R2]]; const b = []; for (let k = 1; k < L; k++) b.push(-1 + 2 * k / L); stops = TSTOPS;
        axes.forEach((_, i) => layers(i, b)); moves.forEach((m) => { m.stops = alignStops(cuts.concat([{ n: m.axis, d: 99, axis: m.axis }]), cuts.length); }); noJ = false;
      }
    } else axes = shape === 'cubemix' || shape === 'cubefisher' || shape === 'qjdodeca' || shape === 'cubemirror' || shape === 'cubewindmill' || shape === 'cubeaxis' ? TAXES : DOD.axes;
    const RAX = shape === 'cubeaxis' ? rotMat([1, 1, 1].map((x) => x / Math.sqrt(3)), -Math.PI / 3) : null;
    let cells = [RAX ? cubePoly().map((f) => ({ v: f.v.map((p) => app(RAX, p)), tag: f.tag })) : dod ? dodecaPoly() : cubePoly()];
    cuts.forEach((pl) => { const next = []; cells.forEach((c) => { const a = clip(c, pl.n, pl.d), bb = clip(c, [-pl.n[0], -pl.n[1], -pl.n[2]], -pl.d); if (a && bb) { next.push(a); next.push(bb); } else next.push(c); }); cells = next; });
    if (sharedCells) cells = sharedCells;
    if (fusedBoxes) cells = fusedBoxes.map((bx) => { let c = cubePoly(); const lo = bx.lo.map((v) => -1 + 2 * v / L), hi = bx.hi.map((v) => -1 + 2 * v / L); for (let ax = 0; ax < 3 && c; ax++) { const nv = [0, 0, 0]; nv[ax] = 1; if (hi[ax] < 1 - 1e-9) c = clip(c, nv, hi[ax]); const mv = [0, 0, 0]; mv[ax] = -1; if (c && lo[ax] > -1 + 1e-9) c = clip(c, mv, -lo[ax]); } return c; }).filter((c) => c);
    moves.forEach((m) => { if (!m.stops) m.stops = stops.slice(); });
    return (CFG[ck] = { n: n, shape: shape, planes: moves, cells: cells, axes: axes, stops: stops, colours: shape === 'cubemirror' ? ['#a9b0b9', '#a9b0b9', '#a9b0b9', '#a9b0b9', '#a9b0b9', '#a9b0b9'] : dod ? DCOL : CCOL, faceN: RAX ? FACES.map((n) => app(RAX, n)) : dod ? DOD.DN : FACES, faceD: dod ? DOD.DD : 1, noJumble: noJ, faceDs: null, step: step, mult: mult, sc: 1, surf: shape === 'cubemix', mirror: mirrorB ? { b: mirrorB, L: L } : null, shapeOnly: shape === 'cubemirror', bond: !noJ && shape !== 'cubemix' && shape !== 'cubemirror' && shape !== 'cubeshared' ? 'face' : false, shared: sharedInfo, fz: fzFlat });
  }
  // Clover / curvy cube (cube ET with spherical cuts): the pieces are the patches of the surface (thin shells: the outer polygon and an inner one just below it); a move turns the patches inside a ball
  // (a shell for n > 2) about the edge axis through its centre.  Like the helicopter cube the turn is 180 degrees or the jumbling turn of 70.53 degrees (the angles at which the edge centres line up);
  // a ball can turn only while no patch is cut by its sphere.
  function ccConfig(n, shape) {
    const ck = shape + n; if (CFG[ck]) return CFG[ck];
    const info = window.RBPuzzles.ccSpec(shape === 'cccurvy', n), sp = info.info, planes = [], TH = 0.05, byCell = new Map();
    const sigOf = (q) => sp.spheres.map((s) => (((q[0] - s.c[0]) * (q[0] - s.c[0]) + (q[1] - s.c[1]) * (q[1] - s.c[1]) + (q[2] - s.c[2]) * (q[2] - s.c[2])) < s.r * s.r ? '1' : '0')).join('');
    const cellOf = (sig) => { if (!byCell.has(sig)) { const c = []; c.samp = []; c.cloud = []; byCell.set(sig, c); } return byCell.get(sig); };
    info.stickers.forEach((s) => {          // the patches of one solid cell (equal "inside which spheres" signature) are one rigid piece
      const nf = info.facets[s.facet].normal, tag = FACES.findIndex((q) => Math.abs(q[0] - nf[0]) + Math.abs(q[1] - nf[1]) + Math.abs(q[2] - nf[2]) < 1e-6), cell = cellOf(s.sig);
      cell.push({ v: s.verts.map((v) => v.slice()), tag: tag }, { v: s.verts.map((v) => [v[0] - nf[0] * TH, v[1] - nf[1] * TH, v[2] - nf[2] * TH]), tag: -1 });
      cell.samp.push(s.pt.slice()); s.samp.forEach((q) => cell.samp.push(q));
    });
    const G = 16; for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) for (let k = 0; k < G; k++) { const q = [-1 + (2 * i + 1) / G, -1 + (2 * j + 1) / G, -1 + (2 * k + 1) / G]; cellOf(sigOf(q)).cloud.push(q); }          // the solid: grid points per cell
    const cells = []; byCell.forEach((c) => {
      if (!c.cloud.length) c.cloud = c.samp.slice();          // a thin cell without a grid point: its surface points stand for it
      if (!c.samp.length) { const m = [0, 0, 0]; c.cloud.forEach((q) => { m[0] += q[0] / c.cloud.length; m[1] += q[1] / c.cloud.length; m[2] += q[2] / c.cloud.length; }); c.samp = [m]; }          // an inner cell: its middle
      cells.push(c);
    });
    sp.axes.forEach((e) => [1, -1].forEach((sg) => {
      const M = e.map((x) => x * sg), u = M.map((x) => x / Math.hypot(M[0], M[1], M[2]));
      sp.radii.forEach((r1, q) => planes.push({ ax: 0, n: u, d: 0, sg: 1, depth: 0, axis: u, center: [0, 0, 0], sph: { c: M.map((x) => x * sp.a), r0: q ? sp.radii[q - 1] : 0, r1: r1 }, stops: STOPS.slice() }));
    }));
    return (CFG[ck] = { n: n, shape: shape, planes: planes, cells: cells, axes: [], stops: STOPS, colours: CCOL, faceN: FACES, faceD: 1, noJumble: false, faceDs: null, step: null, sc: 1, shell: true, bond: 'cloud' });
  }
  function config(n, shape) {
    shape = shape || 'cube';
    if (shape === 'ccclover' || shape === 'cccurvy') return ccConfig(n, shape);
    if (SPEC[shape]) return specialConfig(n, shape);
    const ck = shape + (Array.isArray(n) ? n.join('x') : n); if (CFG[ck]) return CFG[ck];
    const tet = shape === 'tetra', oct = shape === 'octa', dod = shape === 'dodeca', dft = shape === 'dodecaft', dte = shape === 'dodecaet', ice = shape === 'icosaet', oct2 = shape === 'octact', ice2 = shape === 'icosact', ff = shape === 'cuboidff', ex = shape === 'cuboidx', cub = ff || ex, big = dte || ice || oct2 || ice2;
    const dims = cub ? n : null, sc = ff ? S3 / Math.hypot(dims[0], dims[1], dims[2]) : 1;          // the box is scaled so that its radius is sqrt3 like the other solids
    const axes = tet || cub ? TAXES : dod || dft ? DOD.axes : dte ? DODE.axes : ice ? ICOE.axes : oct2 ? OCTTW : ice2 ? ICOTW : NORMALS;
    const depths = cub ? [] : dft ? (function () { const info = dodecaFTInfo(), vals = [info.d2], m = n / 2; for (let k = 1; k <= m - 1; k++) vals.push(info.d2 + (info.D - info.d2) * k / m); return vals.concat(vals.map((x) => -x)).sort((a, b) => b - a); })() : dod ? (n < 2 ? [] : Array.from({ length: n - 1 }, (_, k) => -DOD.DD * k / (n - 1))) : planeDepths(n, tet ? 0.25 : oct ? 1 / (2 * Math.SQRT2) : dte ? DODE.re / 2 : ice ? ICOE.re / 2 : oct2 ? 0.5 : ice2 ? ICO_O : H, tet);
    // plane = a cut n.p = d; the cap it turns is the side away from the centre (for d = 0 the positive side); axis = unit normal pointing into that side
    let planes = [];
    axes.forEach((nv, ax) => depths.forEach((d) => { const sg = d < 0 ? -1 : 1; planes.push({ stops: null, ax: ax, n: nv, d: d, sg: sg, depth: Math.abs(d), axis: [nv[0] * sg, nv[1] * sg, nv[2] * sg] }); }));
    if (cub) { axes.forEach((nv, ax) => { const L = dims[ax]; for (let k = 1; k < L; k++) planes.push({ stops: null, ax: ax, n: nv, d: ff ? (-L + 2 * k) * sc : -1 + 2 * k / L, sg: 1, depth: 0, axis: nv }); }); }
    let cells = [ff ? cubePoly().map((f) => ({ v: f.v.map((p) => [p[0] * dims[0] * sc, p[1] * dims[1] * sc, p[2] * dims[2] * sc]), tag: f.tag })) : ex ? cubePoly() : tet ? tetraPoly() : oct || oct2 ? octaPoly() : dod || dft || dte ? dodecaPoly() : ice || ice2 ? icosaPoly() : cubePoly()];
    planes.forEach((pl) => {
      const next = [];
      cells.forEach((c) => { const a = clip(c, pl.n, pl.d), b = clip(c, [-pl.n[0], -pl.n[1], -pl.n[2]], -pl.d); if (a && b) { next.push(a); next.push(b); } else next.push(c); });
      cells = next;
    });
    if (dft) {              // leave the spikes of the pentagrams out: a piece with an outer face centred inside a pentagram but not holding the middle of the face is removed
      const stars = DOD.faces.map((f, fi) => starOfFace(fi)), cen = DOD.faces.map((f) => { const c = [0, 0, 0]; f.v.forEach((p) => { c[0] += p[0] / 5; c[1] += p[1] / 5; c[2] += p[2] / 5; }); return c; });
      cells = cells.filter((cell) => !cell.some((f) => {
        if (f.tag < 0) return false;
        const m = [0, 0, 0]; f.v.forEach((p) => { m[0] += p[0] / f.v.length; m[1] += p[1] / f.v.length; m[2] += p[2] / f.v.length; });
        return pointIn2D(stars[f.tag], m, DOD.DN[f.tag]) && !pointIn2D(f.v, cen[f.tag], DOD.DN[f.tag]);
      }));
    }
    if (dft) {              // the moves: independent layers (slabs) of every axis, from the outside: the cap beyond the first plane, then the slab between the first and the second plane, ...
      const pos = depths.filter((d) => d > 1e-9).sort((a, b) => b - a), moves = [];
      axes.forEach((nv, ax) => [1, -1].forEach((sg) => pos.forEach((v, k) => moves.push({ stops: null, ax: ax, n: nv, d: sg * v, sg: sg, depth: v, hi: k === 0 ? undefined : pos[k - 1], axis: [nv[0] * sg, nv[1] * sg, nv[2] * sg] }))));
      planes = moves;
    }
    if (cub) {              // the moves: every layer (slab) of every axis with at least two layers.  Fully functional (ff): the box of cubes, a layer turns by 90 degrees at any time (no piece ever blocks it,
      // pieces may stick out; the layer holds the pieces that are at its place now); a layer whose two sections differ in parity turns about a lattice axis next to the middle.  Extended (ex): the cube with
      // a, b, c layers along the axes (cells are bricks): a turn is allowed when no cut is in the way, 90 degrees leaves the other layers jammed (jumbling).
      const moves = [];
      axes.forEach((nv, ax) => {
        const L = dims[ax]; if (L < 2) return;
        const o = [0, 1, 2].filter((i) => i !== ax), pu = (dims[o[0]] - 1) & 1, pv = (dims[o[1]] - 1) & 1, cen = [0, 0, 0];
        // every axis goes through the middle of the layer (the middle of the puzzle); a 90 degree turn keeps the cells on the lattice only if both section sizes have the same parity
        for (let k = 0; k < L; k++) {
          const lo = ff ? (-L + 2 * k) * sc : -1 + 2 * k / L, hi = ff ? (-L + 2 * k + 2) * sc : -1 + 2 * (k + 1) / L;
          moves.push({ stops: null, ax: ax, n: nv, d: lo, sg: 1, depth: lo, hi: hi, axis: nv, free: false, center: cen, square: dims[o[0]] === dims[o[1]], quarter: pu === pv });
        }
      });
      planes = moves;
    }
    planes.forEach((pl, i) => { if (!pl.stops) pl.stops = (big || tet) ? alignStops(planes, i) : cub ? TSTOPS : tet ? TSTOPS : oct ? OSTOPS : dod || dft ? DSTOPS : STOPS; });
    return (CFG[ck] = { n: n, shape: shape, planes: planes, cells: cells, axes: axes, stops: planes.length ? planes[0].stops : STOPS, colours: tet ? TCOL : oct || oct2 ? OCOL : dod || dft || dte ? DCOL : ice || ice2 ? ICOL : CCOL, faceN: tet ? TFACES : oct || oct2 ? OFACES : dod || dft || dte ? DOD.DN : ice || ice2 ? ICO.DN : FACES, faceD: tet || oct || oct2 ? 1 / S3 : dod || dft || dte ? DOD.DD : ice || ice2 ? ICO.DD : 1, bond: ff ? 'ff' : dod || dft ? false : 'face', noJumble: dod || dft || ff, faceDs: ff ? [dims[1] * sc, dims[0] * sc, dims[2] * sc, dims[1] * sc, dims[0] * sc, dims[2] * sc] : null, step: ff ? Math.PI / 2 : null, sc: sc });
  }
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function rotMat(n, a) {
    const c = Math.cos(a), s = Math.sin(a), t = 1 - c, x = n[0], y = n[1], z = n[2];
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  const mul = (A, B) => { const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; };
  const app = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];

  function world(S, i) { const pc = S.pieces[i], T = pc.T; return pc.home.map((f) => f.v.map((p) => { const q = app(pc.R, p); return [q[0] + T[0], q[1] + T[1], q[2] + T[2]]; })); }
  function qr(l, pl) { return pl.sg > 0 ? l : [-l[1], -l[0]]; }
  function refresh(S, i) { S.pieces[i].W = world(S, i); S.pieces[i].IF = null; if (S.pieces[i].samp) { const pc = S.pieces[i]; pc.SW = pc.samp.map((p) => { const q = app(pc.R, p); return [q[0] + pc.T[0], q[1] + pc.T[1], q[2] + pc.T[2]]; }); } const W = S.pieces[i].W; let mn = [], mx = []; S.pieces[i].lim = S.cfg.axes.map((n) => { let lo = 1e9, hi = -1e9; W.forEach((f) => f.forEach((p) => { const d = dot(n, p); if (d < lo) lo = d; if (d > hi) hi = d; })); return [lo, hi]; })
    if (S.cfg.surf) {          // the mixup cube: only the lines on the six surfaces count (the outer faces of the piece), a piece without an outer face has no limits
      const pc = S.pieces[i], os = []; pc.home.forEach((f, k) => { if (f.tag >= 0) os.push(W[k]); });
      pc.slim = os.length ? S.cfg.axes.map((n) => { let lo = 1e9, hi = -1e9; os.forEach((f) => f.forEach((p) => { const d = dot(n, p); if (d < lo) lo = d; if (d > hi) hi = d; })); return [lo, hi]; }) : null;
    }
  }
  function create(n, shape) {
    const cfg = config(n === undefined ? 3 : n, shape);
    const S = { cfg: cfg, pieces: cfg.cells.map((c) => ({ home: c, samp: c.samp || null, cloud: c.cloud || null, IF: null, R: I3.slice(), T: [0, 0, 0], W: null, lim: null, SW: null })), hist: [], ang: new Array(cfg.planes.length).fill(0) };
    if (cfg.mirror) S.pieces.forEach((pc) => {          // the slot of a piece (-(L-1) .. L-1 in steps of 2 on every axis), kept up to date by the turns
      const c = [0, 0, 0], N = pc.home.reduce((a, f) => a + f.v.length, 0); pc.home.forEach((f) => f.v.forEach((p) => { c[0] += p[0] / N; c[1] += p[1] / N; c[2] += p[2] / N; }));
      pc.lg = c.map((x) => { let k = 0; for (let j = 1; j < cfg.mirror.b.length - 1; j++) if (x > cfg.mirror.b[j]) k = j; return 2 * k - (cfg.mirror.L - 1); });
    });
    for (let i = 0; i < S.pieces.length; i++) refresh(S, i);
    return S;
  }
  // the pieces in the cap of plane p (null when a piece straddles it: the plane is locked)
  // the range of piece i along the axis of plane pl (oriented); for the mixup cube the range of its outer faces only; a piece without outer face: its middle (mid = true)
  function rangeOf(S, i, pl) {
    const pc = S.pieces[i];
    if (S.cfg.surf) { if (!pc.slim) { const l = qr(pc.lim[pl.ax], pl); return { l: l, m: (l[0] + l[1]) / 2, mid: true }; } return { l: qr(pc.slim[pl.ax], pl), mid: false }; }
    return { l: qr(pc.lim[pl.ax], pl), mid: false };
  }
  // the pieces in the cap of plane p (null when a piece straddles it: the plane is locked)
  // ball move (clover / curvy cube): is the patch inside the ball (shell), is it cut by its sphere
  function sphIn(S, i, pl) { const q = S.pieces[i].SW[0], d = Math.hypot(q[0] - pl.sph.c[0], q[1] - pl.sph.c[1], q[2] - pl.sph.c[2]); return d < pl.sph.r1 && d >= pl.sph.r0; }
  function sphCut(S, i, pl) {
    const E = 2e-3, bs = pl.sph.r0 > 0 ? [pl.sph.r0, pl.sph.r1] : [pl.sph.r1];
    return bs.some((b) => { let lo = false, hi = false; S.pieces[i].SW.forEach((q) => { const d = Math.hypot(q[0] - pl.sph.c[0], q[1] - pl.sph.c[1], q[2] - pl.sph.c[2]); if (d < b - E) lo = true; else if (d > b + E) hi = true; }); return lo && hi; });
  }
  function bxCentre(S, i) { let x = 0, y = 0, z = 0, n = 0; S.pieces[i].W.forEach((f) => f.forEach((q) => { x += q[0]; y += q[1]; z += q[2]; n++; })); return [x / n, y / n, z / n]; }
  function inBx(S, i, pl) { const c = bxCentre(S, i); return c.every((v, a) => v > pl.bx.lo[a] + 1e-6 && v < pl.bx.hi[a] - 1e-6); }
  function inCap(S, i, p) {
    const pl = S.cfg.planes[p]; if (pl.bx) return inBx(S, i, pl); if (pl.sph) return sphIn(S, i, pl);
    if (pl.logical) return S.pieces[i].lg[pl.ax] === 2 * pl.slot - (S.cfg.mirror.L - 1);
    const r = rangeOf(S, i, pl), l = r.l;
    if (r.mid) return r.m > pl.depth - EPS && (pl.hi === undefined || r.m < pl.hi + EPS);
    if (pl.free) { const m = (l[0] + l[1]) / 2; return m > pl.depth - EPS && m < pl.hi + EPS; }
    return l[0] >= pl.depth - EPS && (pl.hi === undefined || l[1] <= pl.hi + EPS);
  }
  function members(S, p) {
    const pl = S.cfg.planes[p], out = [];
    if (pl.bx) { for (let i = 0; i < S.pieces.length; i++) if (inBx(S, i, pl)) out.push(i); return out; }
    if (pl.logical) { for (let i = 0; i < S.pieces.length; i++) if (inCap(S, i, p)) out.push(i); return out; }
    if (pl.sph) { for (let i = 0; i < S.pieces.length; i++) { if (sphCut(S, i, pl)) return null; if (sphIn(S, i, pl)) out.push(i); } return out; }
    if (pl.free) { for (let i = 0; i < S.pieces.length; i++) if (inCap(S, i, p)) out.push(i); return out; }          // fully functional: the pieces at this place turn, nothing blocks
    for (let i = 0; i < S.pieces.length; i++) {
      const r = rangeOf(S, i, pl), l = r.l;
      if (r.mid) { if (inCap(S, i, p)) out.push(i); continue; }
      if (l[0] >= pl.depth - EPS && (pl.hi === undefined || l[1] <= pl.hi + EPS)) out.push(i);
      else if ((l[0] < pl.depth - EPS && l[1] > pl.depth + EPS) || (pl.hi !== undefined && l[0] < pl.hi - EPS && l[1] > pl.hi + EPS)) return null;
    }
    return out;
  }
  function isFree(S, p) { return members(S, p) !== null; }
  // fully functional cuboid: a turn is refused when it leaves a cell (or a group) cut off from the rest (only inner face against inner face holds cells together; a sticker face touching anything is no bond).  Returns '' when the turn is fine.
  // while the layer turns (fully functional cuboid): at every angle of the turn the body must stay in one piece through inner face against inner face contacts: the contacts inside the turning
  // layer and inside the rest are fixed, the contacts across the layer's plane slide (the two squares must still overlap).  true = the bond breaks somewhere on the way
  function sqPoly(cx, cy, h, th) { const c = Math.cos(th), s = Math.sin(th); return [[-h, -h], [h, -h], [h, h], [-h, h]].map((q) => [cx + c * q[0] - s * q[1], cy + s * q[0] + c * q[1]]); }
  function overlapArea(P, Q) {
    let out = P;
    for (let i = 0; i < Q.length && out.length; i++) {
      const a = Q[i], b = Q[(i + 1) % Q.length], inp = out, side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); out = [];
      for (let j = 0; j < inp.length; j++) { const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q); if (sp >= 0) out.push(p); if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) { const tt = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * tt, p[1] + (q[1] - p[1]) * tt]); } }
    }
    let A = 0; for (let i = 0; i < out.length; i++) { const p = out[i], q = out[(i + 1) % out.length]; A += p[0] * q[1] - q[0] * p[1]; } return Math.abs(A) / 2;
  }
  function ffMid(S, pl, m, a) {
    const sc = S.cfg.sc, N = S.pieces.length, k = pl.axis.findIndex((x) => Math.abs(x) > 0.5), u = (k + 1) % 3, v = (k + 2) % 3, C = pl.center || [0, 0, 0], sa = pl.axis[k] > 0 ? 1 : -1, inM = new Set(m), TOL = 1e-5;
    const dirIdx = (w) => (Math.abs(w[0]) > 0.5 ? (w[0] > 0 ? 0 : 1) : Math.abs(w[1]) > 0.5 ? (w[1] > 0 ? 2 : 3) : (w[2] > 0 ? 4 : 5));
    const cen = S.pieces.map((pc) => [(pc.lim[0][0] + pc.lim[0][1]) / 2, (pc.lim[1][0] + pc.lim[1][1]) / 2, (pc.lim[2][0] + pc.lim[2][1]) / 2]);
    const kind = S.pieces.map((pc) => { const q = [false, false, false, false, false, false]; for (const f of pc.home) { if (f.tag < 0) continue; q[dirIdx(app(pc.R, FACES[f.tag]))] = true; } return q; });
    const par = new Array(N), find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const fixed = [], cross = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const di = [0, 1, 2].map((d) => Math.abs(cen[i][d] - cen[j][d]));
      for (let d = 0; d < 3; d++) {
        if (Math.abs(di[d] - 2 * sc) > TOL || di[(d + 1) % 3] > 2 * sc - TOL || di[(d + 2) % 3] > 2 * sc - TOL) continue;          // touching along axis d with a positive contact area (no turn yet)
        const sg = cen[j][d] > cen[i][d] ? 0 : 1;
        if (kind[i][2 * d + sg] || kind[j][2 * d + (sg ^ 1)]) continue;          // a sticker face is no bond
        if (inM.has(i) === inM.has(j)) fixed.push([i, j]); else if (d === k) cross.push(inM.has(i) ? [i, j] : [j, i]);
      }
    }
    const steps = Math.max(2, Math.ceil(Math.abs(a) / (15 * Math.PI / 180) - 1e-9));
    for (let s = 1; s < steps; s++) {
      const th = sa * a * s / steps; for (let i = 0; i < N; i++) par[i] = i;
      fixed.forEach((e) => { par[find(e[0])] = find(e[1]); });
      const c = Math.cos(th), sn = Math.sin(th);
      cross.forEach((e) => {
        const ci = cen[e[0]], cj = cen[e[1]], x = ci[u] - C[u], y = ci[v] - C[v];
        if (overlapArea(sqPoly(C[u] + c * x - sn * y, C[v] + sn * x + c * y, sc, th), sqPoly(cj[u], cj[v], sc, 0)) > 1e-6 * sc * sc) par[find(e[0])] = find(e[1]);
      });
      const r = find(0); for (let i = 1; i < N; i++) if (find(i) !== r) return true;
    }
    return false;
  }
  function ffProblem(S, pl, m, a) {
    const sc = S.cfg.sc, Rm = rotMat(pl.axis, a), C = pl.center || [0, 0, 0], inM = new Set(m), idx = new Map(), pos = [], rots = []; let off = false;
    const ri = (x) => Math.round(x / sc);
    S.pieces.forEach((pc, i) => {
      let v = [(pc.lim[0][0] + pc.lim[0][1]) / 2, (pc.lim[1][0] + pc.lim[1][1]) / 2, (pc.lim[2][0] + pc.lim[2][1]) / 2], R = pc.R;
      if (inM.has(i)) { const q = app(Rm, [v[0] - C[0], v[1] - C[1], v[2] - C[2]]); v = [q[0] + C[0], q[1] + C[1], q[2] + C[2]]; R = mul(Rm, pc.R); }
      for (let d = 0; d < 3; d++) { const t = v[d] / sc; if (Math.abs(t - Math.round(t)) > 1e-5 || (((Math.round(t) - (S.cfg.n[d] - 1)) % 2) + 2) % 2 !== 0) off = true; }          // not on the lattice of the cells (half a cell off)
      const p = [ri(v[0]), ri(v[1]), ri(v[2])]; pos.push(p); rots.push(R); idx.set(p.join(','), i);
    });
    if (off) return ffMid(S, pl, m, a) ? 'detach' : '';          // half a cell off the lattice: the cells no longer touch face to face, only the jamming of the other layers counts
    const dirIdx = (v) => (Math.abs(v[0]) > 0.5 ? (v[0] > 0 ? 0 : 1) : Math.abs(v[1]) > 0.5 ? (v[1] > 0 ? 2 : 3) : (v[2] > 0 ? 4 : 5));
    const kind = S.pieces.map((pc, i) => { const k = [false, false, false, false, false, false]; for (const f of pc.home) { if (f.tag < 0) continue; k[dirIdx(app(rots[i], FACES[f.tag]))] = true; } return k; });          // kind[i][d]: the face of cell i towards d carries a sticker
    const seen = new Set([0]), stack = [0];
    while (stack.length) {
      const i = stack.pop(), p = pos[i];
      for (let d = 0; d < 3; d++) for (const sg of [-2, 2]) { const q = p.slice(); q[d] += sg; const j = idx.get(q.join(',')); const e = d * 2 + (sg > 0 ? 0 : 1); if (j !== undefined && !seen.has(j) && !kind[i][e] && !kind[j][e ^ 1]) { seen.add(j); stack.push(j); } }          // only an inner face against an inner face holds cells together
    }
    if (seen.size !== S.pieces.length) return 'detach';
    return ffMid(S, pl, m, a) ? 'detach' : '';
  }
  // ---- the rotation constraint of every jumbling puzzle (as in the fully functional cuboid): the body may not fall apart, after the turn and on the way ----
  // 'face' (cells with flat cut faces): only an inner face against an inner face holds cells together (same plane, opposite normals, positive overlap); inside the turning group and inside the rest the contacts are fixed, the
  // contacts across the plane of the turn slide (the faces must still overlap at every angle, tested every 15 degrees).  'cloud' (clover / curvy cube): the cells are point clouds of their solid, two cells hold when
  // enough points of the two lie close together.
  function newellN(P) { let n = [0, 0, 0]; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])]; } const l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l]; }
  function innerFaces(S, i) {
    const pc = S.pieces[i]; if (pc.IF) return pc.IF;
    const out = [], W = pc.W; let cen = [0, 0, 0], cnt = 0; W.forEach((f) => f.forEach((p) => { cen[0] += p[0]; cen[1] += p[1]; cen[2] += p[2]; cnt++; })); cen = cen.map((x) => x / (cnt || 1));
    pc.home.forEach((hf, k) => {
      if (hf.tag >= 0) return;
      const P = W[k]; let n = newellN(P); const fc = [0, 0, 0]; P.forEach((p) => { fc[0] += p[0] / P.length; fc[1] += p[1] / P.length; fc[2] += p[2] / P.length; });
      if (n[0] * (fc[0] - cen[0]) + n[1] * (fc[1] - cen[1]) + n[2] * (fc[2] - cen[2]) < 0) n = [-n[0], -n[1], -n[2]];
      out.push({ n: n, d: dot(n, P[0]), P: P });
    });
    return (pc.IF = out);
  }
  const rkey = (x) => Math.round(x * 1e3 + 0.37);
  function faceOverlap(a, b) {          // overlap area of two coplanar convex polygons (a.n = -b.n)
    const t = Math.abs(a.n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], e1 = cross(a.n, t), l1 = Math.hypot(e1[0], e1[1], e1[2]), u = [e1[0] / l1, e1[1] / l1, e1[2] / l1], v = cross(a.n, u);
    const pr = (P) => { const q = P.map((p) => [dot(p, u), dot(p, v)]); let s = 0; for (let i = 0; i < q.length; i++) { const x = q[i], y = q[(i + 1) % q.length]; s += x[0] * y[1] - y[0] * x[1]; } return s < 0 ? q.reverse() : q; }, A = pr(a.P), B = pr(b.P);          // both counter-clockwise
    return overlapArea(A, B);
  }
  function faceContactsRef(F) {          // (the plain version: every face against every face of the partner plane; kept for tests)
    const byKey = new Map(), edges = [];
    F.forEach((fl, i) => fl.forEach((f) => { const k = rkey(f.n[0]) + ',' + rkey(f.n[1]) + ',' + rkey(f.n[2]) + ',' + rkey(f.d); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push([i, f]); }));
    F.forEach((fl, i) => fl.forEach((f) => {
      const k = rkey(-f.n[0]) + ',' + rkey(-f.n[1]) + ',' + rkey(-f.n[2]) + ',' + rkey(-f.d), l = byKey.get(k); if (!l) return;
      l.forEach((e) => { if (e[0] <= i) return; if (Math.abs(dot(f.n, e[1].n) + 1) > 1e-6 || Math.abs(f.d + e[1].d) > 1e-4) return; if (faceOverlap(f, e[1]) > 1e-6) edges.push([i, e[0]]); });
    }));
    return edges;
  }
  function bboxOf(f) { if (f.bb) return f.bb; let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9; for (const p of f.P) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2]; } return (f.bb = [x0 - 1e-6, y0 - 1e-6, z0 - 1e-6, x1 + 1e-6, y1 + 1e-6, z1 + 1e-6]); }
  const gcell = (ix, iy, iz) => (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) | 0;
  // a bucket of faces on one plane gets a grid over the bounding boxes so that a face is only tested against the faces near it (the cut planes of a big puzzle hold thousands of faces)
  function bucketGrid(l) {
    let ext = 0; for (const e of l) { const b = bboxOf(e[1]); ext += Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]); }
    const cs = Math.max(1.5 * ext / l.length, 1e-3), cells = new Map(), big = [];
    l.forEach((e, j) => {
      const b = bboxOf(e[1]), x0 = Math.floor(b[0] / cs), x1 = Math.floor(b[3] / cs), y0 = Math.floor(b[1] / cs), y1 = Math.floor(b[4] / cs), z0 = Math.floor(b[2] / cs), z1 = Math.floor(b[5] / cs);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 48) { big.push(j); return; }
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const k = gcell(x, y, z), c = cells.get(k); if (c) c.push(j); else cells.set(k, [j]); }
    });
    return { cs: cs, cells: cells, big: big, mark: new Int32Array(l.length), st: 0 };
  }
  function faceContacts(F) {          // F[i] = the inner faces of piece i; returns the pairs of pieces in contact
    const byKey = new Map(), edges = [];
    const hk = (a, b, c, d) => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791) ^ Math.imul(d, 2654435761)) | 0;          // (a clash only mixes two planes in a bucket: the test below checks the planes)
    F.forEach((fl, i) => fl.forEach((f) => { const k = hk(rkey(f.n[0]), rkey(f.n[1]), rkey(f.n[2]), rkey(f.d)); let c = byKey.get(k); if (!c) byKey.set(k, (c = [])); c.push([i, f]); }));
    const test = (f, i, e) => { if (e[0] <= i) return; if (Math.abs(dot(f.n, e[1].n) + 1) > 1e-6 || Math.abs(f.d + e[1].d) > 1e-4) return; if (faceOverlap(f, e[1]) > 1e-6) edges.push([i, e[0]]); };
    F.forEach((fl, i) => fl.forEach((f) => {
      const k = hk(rkey(-f.n[0]), rkey(-f.n[1]), rkey(-f.n[2]), rkey(-f.d)), l = byKey.get(k); if (!l) return;
      if (l.length <= 12) { l.forEach((e) => test(f, i, e)); return; }
      const g = l.grid || (l.grid = bucketGrid(l)), b = bboxOf(f), st = ++g.st;
      const x0 = Math.floor(b[0] / g.cs), x1 = Math.floor(b[3] / g.cs), y0 = Math.floor(b[1] / g.cs), y1 = Math.floor(b[4] / g.cs), z0 = Math.floor(b[2] / g.cs), z1 = Math.floor(b[5] / g.cs);
      const visit = (j) => { if (g.mark[j] === st) return; g.mark[j] = st; const e = l[j], c = bboxOf(e[1]); if (c[0] > b[3] || c[3] < b[0] || c[1] > b[4] || c[4] < b[1] || c[2] > b[5] || c[5] < b[2]) return; test(f, i, e); };
      for (const j of g.big) visit(j);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 4000) { for (let j = 0; j < l.length; j++) visit(j); return; }
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const c = g.cells.get(gcell(x, y, z)); if (c) for (const j of c) visit(j); }
    }));
    return edges;
  }
  // contacts between two sets of faces ([piece, face] lists): a face of A looks for its partners in B and the other way round (as faceContacts does within one set)
  function contactPairs(A, B, emit) {
    const hk = (a, b, c, d) => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791) ^ Math.imul(d, 2654435761)) | 0;
    const own = (f) => hk(rkey(f.n[0]), rkey(f.n[1]), rkey(f.n[2]), rkey(f.d)), partner = (f) => hk(rkey(-f.n[0]), rkey(-f.n[1]), rkey(-f.n[2]), rkey(-f.d));
    const index = (L) => { const m = new Map(); for (const e of L) { const k = own(e[1]); let c = m.get(k); if (!c) m.set(k, (c = [])); c.push(e); } return m; };
    const byA = index(A), byB = index(B);
    const look = (src, by, flip) => {
      for (const q of src) {
        const f = q[1], l = by.get(partner(f)); if (!l) continue;
        const test = (e) => { if (Math.abs(dot(f.n, e[1].n) + 1) > 1e-6 || Math.abs(f.d + e[1].d) > 1e-4) return; if (faceOverlap(f, e[1]) > 1e-6) { if (flip) emit(e[0], q[0]); else emit(q[0], e[0]); } };
        if (l.length <= 12) { l.forEach(test); continue; }
        const g = l.grid || (l.grid = bucketGrid(l)), b = bboxOf(f), st = ++g.st;
        const x0 = Math.floor(b[0] / g.cs), x1 = Math.floor(b[3] / g.cs), y0 = Math.floor(b[1] / g.cs), y1 = Math.floor(b[4] / g.cs), z0 = Math.floor(b[2] / g.cs), z1 = Math.floor(b[5] / g.cs);
        const visit = (j) => { if (g.mark[j] === st) return; g.mark[j] = st; const e = l[j], c = bboxOf(e[1]); if (c[0] > b[3] || c[3] < b[0] || c[1] > b[4] || c[4] < b[1] || c[2] > b[5] || c[5] < b[2]) return; test(e); };
        for (const j of g.big) visit(j);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 4000) { for (let j = 0; j < l.length; j++) visit(j); continue; }
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const c = g.cells.get(gcell(x, y, z)); if (c) for (const j of c) visit(j); }
      }
    };
    look(A, byB, false); look(B, byA, true);
  }
  function connectedAll(N, edges) {
    const par = new Array(N); for (let i = 0; i < N; i++) par[i] = i; const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    edges.forEach((e) => { par[find(e[0])] = find(e[1]); }); const r = find(0); for (let i = 1; i < N; i++) if (find(i) !== r) return false; return true;
  }
  function rotFace(f, R, C) { const P = f.P.map((p) => { const q = app(R, [p[0] - C[0], p[1] - C[1], p[2] - C[2]]); return [q[0] + C[0], q[1] + C[1], q[2] + C[2]]; }), n = app(R, f.n); return { n: n, d: dot(n, P[0]), P: P }; }
  function faceBondBrokenRef(S, pl, m, a) {
    const N = S.pieces.length, inM = new Set(m), C = pl.center || [0, 0, 0], ax = pl.axis;
    const F0 = S.pieces.map((_, i) => innerFaces(S, i));
    const R1 = rotMat(ax, a), F1 = F0.map((fl, i) => (inM.has(i) ? fl.map((f) => rotFace(f, R1, C)) : fl));
    if (!connectedAll(N, faceContactsRef(F1))) return true;          // the body would fall apart after the turn
    const fixedE = faceContactsRef(F0).filter((e) => inM.has(e[0]) === inM.has(e[1]));
    const t = Math.abs(ax[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], e1c = cross(ax, t), l1 = Math.hypot(e1c[0], e1c[1], e1c[2]), e1 = [e1c[0] / l1, e1c[1] / l1, e1c[2] / l1], e2 = cross(ax, e1);          // (e1, e2, ax) right handed
    const rot = [], fix = [];
    F0.forEach((fl, i) => fl.forEach((f) => { const al = dot(f.n, ax); if (Math.abs(Math.abs(al) - 1) > 1e-6) return; (inM.has(i) ? rot : fix).push({ i: i, s: dot(f.P[0], ax), sg: al > 0 ? 1 : -1, f: f }); }));
    const pr = (P) => { const q = P.map((p) => [dot(p, e1), dot(p, e2)]); let s = 0; for (let i = 0; i < q.length; i++) { const x = q[i], y = q[(i + 1) % q.length]; s += x[0] * y[1] - y[0] * x[1]; } return s < 0 ? q.reverse() : q; }, c2 = [dot(C, e1), dot(C, e2)], pairs = [];
    rot.forEach((r) => fix.forEach((g) => { if (r.sg === -g.sg && Math.abs(r.s - g.s) < 1e-4) pairs.push({ i: r.i, j: g.i, A: pr(r.f.P), B: pr(g.f.P) }); }));
    if (!pairs.length) return false;
    const steps = Math.max(1, Math.ceil(Math.abs(a) / (15 * Math.PI / 180) - 1e-9));
    for (let s = 1; s < steps; s++) {
      const th = a * s / steps, c = Math.cos(th), sn = Math.sin(th), E = fixedE.slice();
      pairs.forEach((q) => { const A = q.A.map((p) => [c2[0] + c * (p[0] - c2[0]) - sn * (p[1] - c2[1]), c2[1] + sn * (p[0] - c2[0]) + c * (p[1] - c2[1])]); if (overlapArea(A, q.B) > 1e-6) E.push([q.i, q.j]); });
      if (!connectedAll(N, E)) return true;
    }
    return false;
  }
  // the bond test of a turn.  The contact graph of the present state is kept (S._fc, valid while the pieces are where they were) and the one after an allowed turn becomes the next one (S._fcNext, taken over by apply):
  // on a big puzzle the plain version spent seconds per turn in this test
  function stateFp(S) { let h = 0; const P = S.pieces; for (let i = 0; i < P.length; i++) { const R = P[i].R, T = P[i].T; for (let k = 0; k < 9; k++) h = (Math.imul(h, 31) + Math.round(R[k] * 4096)) | 0; for (let k = 0; k < 3; k++) h = (Math.imul(h, 31) + Math.round(T[k] * 4096)) | 0; } return h + ':' + P.length; }
  function faceBondBroken(S, pl, m, a) {
    const N = S.pieces.length, moved = new Uint8Array(N), C = pl.center || [0, 0, 0], ax = pl.axis; for (const i of m) moved[i] = 1;
    const F0 = S.pieces.map((_, i) => innerFaces(S, i)), fp0 = stateFp(S); let E0;
    if (S._fc && S._fc.fp === fp0) E0 = S._fc.edges; else { E0 = faceContacts(F0); S._fc = { fp: fp0, edges: E0 }; }
    const R1 = rotMat(ax, a), F1 = F0.map((fl, i) => (moved[i] ? fl.map((f) => rotFace(f, R1, C)) : fl));
    // contacts after the turn: those inside the turning group and inside the rest are the old ones, only the contacts across the plane are new
    const E1 = []; for (const e of E0) if (moved[e[0]] === moved[e[1]]) E1.push(e);
    const MF = [], FF = []; for (let i = 0; i < N; i++) { const L = moved[i] ? MF : FF; for (const f of F1[i]) L.push([i, f]); }
    contactPairs(MF, FF, (i, j) => E1.push([i, j]));
    if (!connectedAll(N, E1)) return true;          // the body would fall apart after the turn
    S._fcNext = { m: m, a: a, edges: E1 };
    // contacts inside the turning group and inside the rest stay; components of them
    const par = new Int32Array(N); for (let i = 0; i < N; i++) par[i] = i; const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (const e of E0) if (moved[e[0]] === moved[e[1]]) { const x = find(e[0]), y = find(e[1]); if (x !== y) par[x] = y; }
    const t = Math.abs(ax[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], e1c = cross(ax, t), l1 = Math.hypot(e1c[0], e1c[1], e1c[2]), e1 = [e1c[0] / l1, e1c[1] / l1, e1c[2] / l1], e2 = cross(ax, e1);          // (e1, e2, ax) right handed
    const rot = [], fix = [];
    F0.forEach((fl, i) => fl.forEach((f) => { const al = dot(f.n, ax); if (Math.abs(Math.abs(al) - 1) > 1e-6) return; (moved[i] ? rot : fix).push({ i: i, s: dot(f.P[0], ax), sg: al > 0 ? 1 : -1, f: f }); }));
    const pr = (P) => { const q = P.map((p) => [dot(p, e1), dot(p, e2)]); let s = 0; for (let i = 0; i < q.length; i++) { const x = q[i], y = q[(i + 1) % q.length]; s += x[0] * y[1] - y[0] * x[1]; } return s < 0 ? q.reverse() : q; }, c2 = [dot(C, e1), dot(C, e2)], pairs = [];
    // (the faces perpendicular to the axis that face each other across the plane of the turn: sorted by their height so that only equal heights are paired)
    const byS = new Map(); fix.forEach((g) => { const k = Math.round(g.s * 1e4); let l = byS.get(k); if (!l) byS.set(k, (l = [])); l.push(g); });
    rot.forEach((r) => { for (const dk of [-1, 0, 1]) { const l = byS.get(Math.round(r.s * 1e4) + dk); if (l) for (const g of l) if (r.sg === -g.sg && Math.abs(r.s - g.s) < 1e-4) pairs.push({ i: r.i, j: g.i, A: pr(r.f.P), B: pr(g.f.P) }); } });
    if (!pairs.length) return false;
    const roots = new Map(); for (let i = 0; i < N; i++) { const r = find(i); if (!roots.has(r)) roots.set(r, roots.size); }
    const K = roots.size, steps = Math.max(1, Math.ceil(Math.abs(a) / (15 * Math.PI / 180) - 1e-9));
    for (let s = 1; s < steps; s++) {
      const th = a * s / steps, c = Math.cos(th), sn = Math.sin(th), p2 = new Int32Array(K); for (let k = 0; k < K; k++) p2[k] = k; const f2 = (x) => { while (p2[x] !== x) { p2[x] = p2[p2[x]]; x = p2[x]; } return x; };
      let comps = K;
      for (const q of pairs) {
        if (comps === 1) break;
        const x = f2(roots.get(find(q.i))), y = f2(roots.get(find(q.j))); if (x === y) continue;
        const A = q.A.map((p) => [c2[0] + c * (p[0] - c2[0]) - sn * (p[1] - c2[1]), c2[1] + sn * (p[0] - c2[0]) + c * (p[1] - c2[1])]);
        if (overlapArea(A, q.B) > 1e-6) { p2[x] = y; comps--; }
      }
      if (comps !== 1) return true;
    }
    return false;
  }
  function cloudBroken(S, pl, m, a) {
    const N = S.pieces.length, inM = new Set(m), ax = pl.axis, D = 0.2, thr = 3, steps = Math.max(1, Math.ceil(Math.abs(a) / (15 * Math.PI / 180) - 1e-9));
    const hashOf = (q) => Math.floor(q[0] / D) + ',' + Math.floor(q[1] / D) + ',' + Math.floor(q[2] / D);
    const W = S.pieces.map((pc) => pc.cloud.map((p) => { const q = app(pc.R, p); return [q[0] + pc.T[0], q[1] + pc.T[1], q[2] + pc.T[2]]; }));
    const all = [], gridAll = new Map(), gridFix = new Map();
    W.forEach((pts, i) => pts.forEach((p) => { const e = [p, i], k = hashOf(p); all.push(e); const l = gridAll.get(k); if (l) l.push(e); else gridAll.set(k, [e]); if (!inM.has(i)) { const l2 = gridFix.get(k); if (l2) l2.push(e); else gridFix.set(k, [e]); } }));
    const near = (grid, q, fn) => { const bx = Math.floor(q[0] / D), by = Math.floor(q[1] / D), bz = Math.floor(q[2] / D); for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) { const l = grid.get((bx + x) + ',' + (by + y) + ',' + (bz + z)); if (l) for (let t = 0; t < l.length; t++) { const f = l[t], dx = f[0][0] - q[0], dy = f[0][1] - q[1], dz = f[0][2] - q[2]; if (dx * dx + dy * dy + dz * dz <= D * D) fn(f[1]); } } };
    const count = (cnt, i, j) => { const kk = Math.min(i, j) * N + Math.max(i, j); cnt.set(kk, (cnt.get(kk) || 0) + 1); };
    const fixedCnt = new Map();          // contacts inside the turning group and inside the rest (they stay)
    all.forEach((e) => near(gridAll, e[0], (j) => { if (j !== e[1] && inM.has(j) === inM.has(e[1])) count(fixedCnt, e[1], j); }));
    const edgesOf = (cnt, k) => { const E = []; cnt.forEach((v, kk) => { if (v >= k) E.push([Math.floor(kk / N), kk % N]); }); return E; };
    const fixedE = edgesOf(fixedCnt, 2 * thr);          // every pair is counted from both sides
    const test = (th) => {
      const R = rotMat(ax, th), cnt = new Map();
      m.forEach((i) => W[i].forEach((p) => { const q = app(R, p); near(gridFix, q, (j) => count(cnt, i, j)); }));
      return connectedAll(N, fixedE.concat(edgesOf(cnt, thr)));
    };
    if (!test(a)) return true;
    for (let s = 1; s < steps; s++) if (!test(a * s / steps)) return true;
    return false;
  }
  function bondBroken(S, pl, m, a) {
    const bk = S.cfg.bond;
    if (bk === 'ff') return ffProblem(S, pl, m, a) !== '';
    if (bk === 'face') return faceBondBroken(S, pl, m, a);
    if (bk === 'cloud') return cloudBroken(S, pl, m, a);
    return false;
  }
  function apply(S, mv) {
    const m = members(S, mv.p); if (!m) return false;
    S.fail = ''; if (S.cfg.bond && !mv.trust) { if (S.cfg.bond === 'ff') { const why = ffProblem(S, S.cfg.planes[mv.p], m, mv.a); S.fail = why; if (why) return false; } else if (bondBroken(S, S.cfg.planes[mv.p], m, mv.a)) { S.fail = 'detach'; return false; } }
    const Rm = rotMat(S.cfg.planes[mv.p].axis, mv.a);
    const C = S.cfg.planes[mv.p].center || [0, 0, 0], RC = app(Rm, C);
    m.forEach((i) => { const pc = S.pieces[i], t = app(Rm, pc.T); pc.R = mul(Rm, pc.R); pc.T = [t[0] + C[0] - RC[0], t[1] + C[1] - RC[1], t[2] + C[2] - RC[2]]; refresh(S, i); });
    if (S.cfg.planes[mv.p].logical) {          // the turned pieces move to the slots a quarter-turn grid takes them to
      const ax = S.cfg.planes[mv.p].ax, P = (ax + 1) % 3, Q = (ax + 2) % 3, q = ((Math.round(mv.a / HALFPI) % 4) + 4) % 4;
      m.forEach((i) => { const lg = S.pieces[i].lg; for (let r = 0; r < q; r++) { const a = lg[P], b = lg[Q]; lg[P] = -b; lg[Q] = a; } });
    }
    S.ang[mv.p] = normAng(S.ang[mv.p] + mv.a);
    if (S._fcNext) { if (S._fcNext.m === m && S._fcNext.a === mv.a) S._fc = { fp: stateFp(S), edges: S._fcNext.edges }; S._fcNext = null; }          // (the contacts computed for the bond test are the ones of the new state)
    S.hist.push(mv); return true;
  }
  function inverse(mv) { return { p: mv.p, a: -mv.a }; }
  // shared cube: every face on the outside shows the colour of its direction, every face on the inside (against another cell) is an inner face
  function solvedShared(S) {
    const sh = S.cfg.shared, FN = S.cfg.faceN, col = {};
    for (const pc of S.pieces) {
      const c = bxCentre(S, S.pieces.indexOf(pc));
      for (let k = 0; k < pc.home.length; k++) {
        const w = pc.W[k], f = pc.home[k];
        let a = [w[1][0] - w[0][0], w[1][1] - w[0][1], w[1][2] - w[0][2]], b = [w[2][0] - w[0][0], w[2][1] - w[0][1], w[2][2] - w[0][2]], nv = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const l = Math.hypot(nv[0], nv[1], nv[2]) || 1; nv = nv.map((x) => x / l);
        const fc = [0, 1, 2].map((q) => (w[0][q] + w[1][q] + w[2][q] + w[3 % w.length][q]) / 4); if (dot(nv, [fc[0] - c[0], fc[1] - c[1], fc[2] - c[2]]) < 0) nv = nv.map((x) => -x);
        const nb = [0, 1, 2].map((q) => Math.round((c[q] + nv[q] * sh.sc) / sh.sc + sh.mid[q] - 0.5)), exposed = !sh.slots.has(nb.join(','));
        if ((f.tag >= 0) !== exposed) return false;
        if (f.tag < 0) continue;
        let fi = -1; for (let q = 0; q < FN.length; q++) if (Math.abs(nv[0] - FN[q][0]) + Math.abs(nv[1] - FN[q][1]) + Math.abs(nv[2] - FN[q][2]) < 1e-4) fi = q;
        if (fi < 0) return false;
        if (col[fi] === undefined) col[fi] = f.tag; else if (col[fi] !== f.tag) return false;
      }
    }
    return true;
  }
  function isSolved(S) {
    if (S.cfg.shared) return solvedShared(S);
    const cfg = S.cfg, col = {}, FN = cfg.faceN, FD = cfg.faceD, EP = cfg.shell ? 0.02 : 1e-5;          // (the curved patches of the clover / curvy cube come from a raster and may stick out of the face by half a pixel)
    for (const pc of S.pieces) {
      for (let k = 0; k < pc.home.length; k++) {
        const f = pc.home[k], w = pc.W[k];
        for (const p of w) for (let q = 0; q < FN.length; q++) if (dot(FN[q], p) > (cfg.faceDs ? cfg.faceDs[q] : FD) + EP) return false;          // inside the original solid
        if (f.tag < 0) continue;
        const nrm = app(pc.R, FN[f.tag]);
        let fi = -1; for (let q = 0; q < FN.length; q++) if (Math.abs(nrm[0] - FN[q][0]) + Math.abs(nrm[1] - FN[q][1]) + Math.abs(nrm[2] - FN[q][2]) < 1e-4) fi = q;
        if (fi < 0) return false;
        for (const p of w) if (Math.abs(dot(FN[fi], p) - (cfg.faceDs ? cfg.faceDs[fi] : FD)) > EP) return false;
        if (cfg.shapeOnly) continue;          // the mirror cube: every face is grey, a cube is a solved cube
        if (col[fi] === undefined) col[fi] = f.tag; else if (col[fi] !== f.tag) return false;
      }
    }
    return true;
  }
  // a long run of random half turns first (they keep the cube shape; never the same plane twice in a row), then a random number (1-4) of jumbling turns of 70.53 degrees:
  // each one is only made on a plane that is free at that moment (locked planes are detected and skipped), so the result is always reachable and solvable backwards
  // fully functional cuboid: first turns that keep the shape (a layer with a square section by 90 or 180 degrees, a rectangular one by 180 degrees), at the end a few 90 degree turns of
  // rectangular layers that deform it (only turns that keep the cells joined)
  function scrambleFF(S, cnt, rnd) {
    const mvs = [], pls = S.cfg.planes, NPL = pls.length; let last = -1; if (!NPL) return mvs;
    for (let i = 0; i < cnt; i++) {
      let p; do { p = Math.floor(rnd() * NPL); } while (p === last && NPL > 1);
      last = p; const mv = { p: p, a: pls[p].square ? [Math.PI / 2, -Math.PI / 2, Math.PI][Math.floor(rnd() * 3)] : Math.PI };
      if (apply(S, mv)) mvs.push(mv);
    }
    const rect = []; pls.forEach((pl, i) => { if (!pl.square) rect.push(i); });          // layers whose 90 degree turn deforms the shape
    const snap = () => ({ pc: S.pieces.map((pc) => ({ R: pc.R.slice(), T: pc.T.slice() })), ang: S.ang.slice(), h: S.hist.length });
    const rest = (sn) => { sn.pc.forEach((q, i) => { S.pieces[i].R = q.R.slice(); S.pieces[i].T = q.T.slice(); refresh(S, i); }); S.ang = sn.ang.slice(); S.hist.length = sn.h; };
    const base = snap(), nMv = mvs.length, last0 = last;
    for (let attempt = 0; attempt < 12; attempt++) {
      let nj = rect.length ? 1 + Math.floor(rnd() * 3) : 0; const jm = []; last = last0;
      for (let tries = 0; nj > 0 && tries < 60; tries++) {
        const p = rect[Math.floor(rnd() * rect.length)]; if (p === last && rect.length > 1) continue;
        const mv = { p: p, a: rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
        if (apply(S, mv)) { jm.push(mv); last = p; nj--; }
      }
      // the body rule is not symmetric: a state can be reached by a turn that no turn undoes (nothing can move any more); such a scramble is thrown away
      const after = snap(); let back = true;
      for (let k = jm.length - 1; k >= 0 && back; k--) if (!apply(S, inverse(jm[k]))) back = false;
      rest(after);
      if (back) { mvs.push.apply(mvs, jm); break; }
      rest(base); mvs.length = nMv;
    }
    return mvs;
  }
  function scramble(S, cnt, rnd, jum) {
    if (S.cfg.shape === 'cuboidff') return scrambleFF(S, cnt, rnd);
    const mvs = []; let last = -1; const NPL = S.cfg.planes.length; if (!NPL) return mvs;
    for (let i = 0; i < cnt; i++) {
      let p; do { p = Math.floor(rnd() * NPL); } while (p === last && NPL > 1);
      last = p; const mv = { p: p, a: S.cfg.noJumble ? (1 + Math.floor(rnd() * (S.cfg.mult || (S.cfg.step ? 3 : 4)))) * (S.cfg.step || 2 * Math.PI / 5) : Math.PI };
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
  (typeof window !== 'undefined' ? window : globalThis).HELI = { NORMALS: NORMALS, config: config, inCap: inCap, H: H, FACES: FACES, STOPS: STOPS, normAng: normAng, ANG: ANG, create: create, members: members, isFree: isFree, splits: function (S, p, a) { const m = members(S, p); return !!m && !!S.cfg.bond && bondBroken(S, S.cfg.planes[p], m, a); }, apply: apply, _refresh: refresh, _contacts: faceContacts, _contactsRef: faceContactsRef, _bondRef: faceBondBrokenRef, _bond: faceBondBroken, _innerFaces: innerFaces, inverse: inverse, isSolved: isSolved, scramble: scramble, rotMat: rotMat, app: app };
})();
