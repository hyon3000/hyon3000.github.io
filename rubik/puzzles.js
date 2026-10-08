// The four puzzles (geometry -> RBEngine.build) and their solvers.
//   cube   : 3x3x3 cube, Kociemba two-phase solver (vendor/cubejs, MIT) run in a Web Worker - see game.js
//   tetra  : tetrahedron (tips + two layers per vertex, 36 stickers), exact table solver (BFS over 933,120 core states + tips)
//   octa   : face-turning octahedron (8 triangular faces, 3x3 triangles each = 72 stickers), solved by undoing the history
//   dodeca : dodecahedron (12 pentagonal faces, 11 stickers each = 132), solved by undoing the history
(function (root) {
  'use strict';
  const ICOSA_H = 0;
  const E = root.RBEngine, V = E.V, INF = Infinity, PHI = (1 + Math.sqrt(5)) / 2;

  function triCells(A, B, C, n, facet, out) {
    const pt = (i, j, k) => V.mul(V.add(V.add(V.mul(A, i), V.mul(B, j)), V.mul(C, k)), 1 / n);
    for (let i = 0; i < n; i++) for (let j = 0; j + i < n; j++) { const k = n - 1 - i - j; if (k >= 0) out.push({ facet: facet, verts: [pt(i + 1, j, k), pt(i, j + 1, k), pt(i, j, k + 1)] }); }
    for (let i = 0; i < n; i++) for (let j = 0; j + i < n; j++) { const k = n - 2 - i - j; if (k >= 0) out.push({ facet: facet, verts: [pt(i, j + 1, k + 1), pt(i + 1, j, k + 1), pt(i + 1, j + 1, k)] }); }
  }

  // ---------------- cube ----------------
  const FACE = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
  const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];       // = facet order = Kociemba face order
  function cubeSpec(nl) {
    nl = nl || 3;
    const facets = [], stickers = [];
    FACE_ORDER.forEach((nm, fi) => {
      const n = FACE[nm], t = Math.abs(n[1]) === 1 ? [1, 0, 0] : [0, 1, 0], u = t, w = V.cross(n, u);
      const c0 = V.mul(n, nl), cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      facets.push({ verts: cs.map((q) => V.add(c0, V.add(V.mul(u, nl * q[0]), V.mul(w, nl * q[1])))), normal: n });
      for (let i = 0; i < nl; i++) for (let j = 0; j < nl; j++) {
        const c = V.add(c0, V.add(V.mul(u, 2 * i - (nl - 1)), V.mul(w, 2 * j - (nl - 1))));
        stickers.push({ facet: fi, verts: cs.map((q) => V.add(c, V.add(V.mul(u, q[0]), V.mul(w, q[1])))) });
      }
    });
    const bounds = []; for (let k = 0; k < nl - 1; k++) bounds.push(-(nl - 2) + 2 * k);     // slab boundaries, e.g. -1, 1 or -3, -1, 1, 3
    const bands = [{ lo: bounds[nl - 2], hi: INF }];
    for (let k = nl - 2; k > 0; k--) bands.push({ lo: bounds[k - 1], hi: bounds[k] });
    bands.push({ lo: -INF, hi: bounds[0] });
    const lines = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((ax) => ({ axis: ax, n: 4, bands: bands }));
    return { name: nl === 3 ? 'cube' : 'cube' + nl, facets: facets, stickers: stickers, lines: lines, scale: 1 / (nl * Math.sqrt(3)), gap: nl === 3 ? 0.08 : 0.07 };
  }
  // Kociemba facelet order (U1..U9 R1.. F1.. D1.. L1.. B1..): right / down vectors of every face as drawn in the cube.js net
  const FR = { U: [1, 0, 0], R: [0, 0, -1], F: [1, 0, 0], D: [1, 0, 0], L: [0, 0, 1], B: [-1, 0, 0] };
  const FD = { U: [0, 0, 1], R: [0, -1, 0], F: [0, -1, 0], D: [0, 0, -1], L: [0, -1, 0], B: [0, -1, 0] };
  function cubeExtras(P) {
    const k = 1 / (3 * Math.sqrt(3)), faceletSlot = [];
    FACE_ORDER.forEach((nm) => {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const pos = V.mul(V.add(V.mul(FACE[nm], 3), V.add(V.mul(FR[nm], 2 * (c - 1)), V.mul(FD[nm], 2 * (r - 1)))), k);
        let best = -1, bd = 1e9;
        P.stickers.forEach((s) => { const d = V.len(V.sub(s.c, pos)); if (d < bd) { bd = d; best = s.i; } });
        faceletSlot.push(best);
      }
    });
    P.faceletSlot = faceletSlot;
    // line index of axis x,y,z = 0,1,2 ; band 0 = positive cap, 1 = middle, 2 = negative cap
    P.faceMove = {};
    FACE_ORDER.forEach((nm) => {
      const n = FACE[nm], li = n[0] ? 0 : n[1] ? 1 : 2, sgn = n[0] + n[1] + n[2];
      P.faceMove[nm] = { b: li * 3 + (sgn > 0 ? 0 : 2), d: -sgn };         // clockwise seen from outside = -90 deg about the outward normal
    });
    P.faceletString = function (col) {
      const centreOf = {};     // colour -> letter of the face whose centre has it
      FACE_ORDER.forEach((nm, fi) => { centreOf[col[P.facetStk[fi][4]]] = nm; });
      let s = '';
      for (let i = 0; i < 54; i++) { const ch = centreOf[col[faceletSlot[i]]]; if (!ch) return null; s += ch; }
      return s;
    };
    P.parseAlg = function (alg) {
      const out = [];
      alg.trim().split(/\s+/).forEach((tok) => {
        if (!tok) return;
        const mv = P.faceMove[tok[0]]; if (!mv) throw new Error('bad token ' + tok);
        if (tok[1] === '2') { out.push({ b: mv.b, d: mv.d }, { b: mv.b, d: mv.d }); }
        else if (tok[1] === "'") out.push({ b: mv.b, d: -mv.d }); else out.push({ b: mv.b, d: mv.d });
      });
      return out;
    };
    P.moveName = function (b, d) {
      for (const nm of FACE_ORDER) { const mv = P.faceMove[nm]; if (mv.b === b) return d === mv.d ? nm : nm + "'"; }
      const li = Math.floor(b / 3); return ['M', 'E', 'S'][li] + (d > 0 ? '+' : '-');
    };
  }

  // ---------------- tetrahedron ----------------
  function tetraSpec() {
    const T = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], facets = [], stickers = [];
    for (let f = 0; f < 4; f++) {
      const o = [0, 1, 2, 3].filter((i) => i !== f).map((i) => T[i]);
      facets.push({ verts: o, normal: V.mul(T[f], -1) });
      triCells(o[0], o[1], o[2], 3, f, stickers);
    }
    const s3 = Math.sqrt(3);
    const lines = T.map((t) => ({ axis: t, n: 3, bands: [{ lo: 5 * s3 / 9, hi: INF, name: 'tip' }, { lo: s3 / 9, hi: INF, name: 'big' }] }));
    return { name: 'tetra', facets: facets, stickers: stickers, lines: lines, scale: 1 / s3, gap: 0.04 };
  }

  // exact solver for the tetrahedron: core = 6 edge pieces (perm+flip) + 4 axial twists, 933,120 reachable states, plus 4 tips
  function tetraExtras(P) {
    let S = null;
    P.initSolver = function () {
      if (S) return S;
      const t0 = Date.now();
      const tipBand = [], bigBand = [];
      for (let v = 0; v < 4; v++) { tipBand.push(P.lines[v].bands[0]); bigBand.push(P.lines[v].bands[1]); }
      const isTip = new Uint8Array(P.N);
      tipBand.forEach((b) => P.bands[b].members.forEach((i) => { isTip[i] = 1; }));
      const axStk = [], isAx = new Uint8Array(P.N);
      for (let v = 0; v < 4; v++) {
        const band = P.bands[bigBand[v]], ax = band.axis, picks = [];
        const byFacet = {};
        band.members.forEach((i) => { if (isTip[i]) return; (byFacet[P.stickers[i].facet] = byFacet[P.stickers[i].facet] || []).push(i); });
        Object.keys(byFacet).forEach((f) => { const l = byFacet[f].sort((a, b) => V.dot(P.stickers[b].c, ax) - V.dot(P.stickers[a].c, ax)); picks.push(l[0]); });
        const tmp = Math.abs(ax[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], u = V.norm(V.cross(ax, tmp)), w = V.cross(ax, u);
        picks.sort((a, b) => Math.atan2(V.dot(P.stickers[a].c, w), V.dot(P.stickers[a].c, u)) - Math.atan2(V.dot(P.stickers[b].c, w), V.dot(P.stickers[b].c, u)));
        axStk.push(picks); picks.forEach((i) => { isAx[i] = 1; });
      }
      const rest = []; for (let i = 0; i < P.N; i++) if (!isTip[i] && !isAx[i]) rest.push(i);
      const es = [], used = new Set();
      rest.forEach((i) => {
        if (used.has(i)) return;
        let best = -1, bd = 1e9;
        rest.forEach((j) => { if (j !== i && !used.has(j) && P.stickers[j].facet !== P.stickers[i].facet) { const d = V.len(V.sub(P.stickers[i].c, P.stickers[j].c)); if (d < bd) { bd = d; best = j; } } });
        used.add(i); used.add(best); es.push([i, best]);
      });
      if (es.length !== 6) throw new Error('tetra: edge pieces ' + es.length);
      const sc = P.solvedCol, pairMap = {};
      es.forEach((e, q) => { const a = sc[e[0]], b = sc[e[1]]; pairMap[a * 16 + b] = q * 2; pairMap[b * 16 + a] = q * 2 + 1; });
      const FACT = [1, 1, 2, 6, 24, 120];
      function encE(col) {
        const perm = [], ori = [];
        for (let e = 0; e < 6; e++) { const r = pairMap[col[es[e][0]] * 16 + col[es[e][1]]]; if (r === undefined) return -1; perm.push(r >> 1); ori.push(r & 1); }
        let r = 0;
        for (let i = 0; i < 6; i++) { let c = 0; for (let j = i + 1; j < 6; j++) if (perm[j] < perm[i]) c++; r = i === 0 ? c : r * (6 - i) + c; }
        let o = 0; for (let e = 0; e < 6; e++) o = o * 2 + ori[e];
        return r * 64 + o;
      }
      function decE(idx, col) {
        let o = idx & 63, r = idx >> 6; const c = new Array(6);
        for (let i = 5; i >= 0; i--) { const base = i === 0 ? 6 : 6 - i; c[i] = r % base; r = Math.floor(r / base); }
        const avail = [0, 1, 2, 3, 4, 5], perm = [];
        for (let i = 0; i < 6; i++) perm.push(avail.splice(c[i], 1)[0]);
        for (let e = 5; e >= 0; e--) {
          const q = perm[e], flip = o & 1; o >>= 1;
          const a = sc[es[q][0]], b = sc[es[q][1]];
          col[es[e][0]] = flip ? b : a; col[es[e][1]] = flip ? a : b;
        }
      }
      const axCol = axStk.map((l) => l.map((i) => sc[i]));
      function encA(col) {
        let a = 0;
        for (let v = 0; v < 4; v++) { const x = col[axStk[v][0]]; const o = axCol[v].indexOf(x); if (o < 0) return -1; a = a * 3 + o; }
        return a;
      }
      function decA(a, col) {
        for (let v = 3; v >= 0; v--) { const o = a % 3; a = Math.floor(a / 3); for (let k = 0; k < 3; k++) col[axStk[v][k]] = axCol[v][(k + o) % 3]; }
      }
      const moves = [];
      for (let v = 0; v < 4; v++) for (const d of [1, -1]) moves.push({ b: bigBand[v], d: d, m: P.moveOf(bigBand[v], d) });
      const NE = 720 * 64, NA = 81, TE = moves.map(() => new Uint16Array(NE)), TA = moves.map(() => new Uint8Array(NA));
      const tmp = new Uint8Array(P.N), tmp2 = new Uint8Array(P.N);
      moves.forEach((mv, mi) => {
        for (let idx = 0; idx < NE; idx++) {
          // only valid edge arrangements matter, but every index decodes to some arrangement, so the table is total
          tmp.set(sc); decE(idx, tmp); P.apply(tmp, mv.m, tmp2); TE[mi][idx] = encE(tmp2);
        }
        for (let a = 0; a < NA; a++) { tmp.set(sc); decA(a, tmp); P.apply(tmp, mv.m, tmp2); TA[mi][a] = encA(tmp2); }
      });
      const dist = new Int8Array(NE * NA).fill(-1), queue = new Int32Array(1000000), s0 = encE(sc) * NA + encA(sc);
      let qh = 0, qt = 0; dist[s0] = 0; queue[qt++] = s0;
      while (qh < qt) {
        const s = queue[qh++], e = (s / NA) | 0, a = s - e * NA, d = dist[s] + 1;
        for (let mi = 0; mi < moves.length; mi++) { const ns = TE[mi][e] * NA + TA[mi][a]; if (dist[ns] < 0) { dist[ns] = d; queue[qt++] = ns; } }
      }
      const tipStk = tipBand.map((b) => P.bands[b].members);
      function tipSolved(col, v) { return tipStk[v].every((i) => col[i] === sc[i]); }
      S = {
        states: qt, maxDepth: dist[queue[qt - 1]], ms: Date.now() - t0, dist: dist,
        // next move toward the solved state, null when solved, undefined when the state is not in the table (cannot happen)
        next: function (col) {
          const e = encE(col), a = encA(col); if (e < 0 || a < 0) return undefined;
          const s = e * NA + a, d = dist[s]; if (d < 0) return undefined;
          if (d > 0) {
            for (let mi = 0; mi < moves.length; mi++) { const ns = TE[mi][e] * NA + TA[mi][a]; if (dist[ns] === d - 1) return { b: moves[mi].b, d: moves[mi].d }; }
            return undefined;
          }
          for (let v = 0; v < 4; v++) {
            if (tipSolved(col, v)) continue;
            let c2 = col;
            for (let r = 1; r <= 2; r++) { c2 = P.apply(c2, P.moveOf(tipBand[v], 1)); if (tipSolved(c2, v)) return { b: tipBand[v], d: r === 1 ? 1 : -1 }; }
            return undefined;
          }
          return null;
        },
      };
      return S;
    };
  }

  // ---------------- face turning octahedron ----------------
  function octaSpec() {
    const facets = [], stickers = [], sg = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]];
    sg.forEach((s, f) => {
      const A = [s[0], 0, 0], B = [0, s[1], 0], C = [0, 0, s[2]];
      facets.push({ verts: [A, B, C], normal: s });
      triCells(A, B, C, 3, f, stickers);
    });
    const c = 1 / (3 * Math.sqrt(3));
    const lines = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map((q) => ({ axis: [1, q[0], q[1]], n: 3, bands: [{ lo: c, hi: INF }, { lo: -INF, hi: -c }] }));
    return { name: 'octa', facets: facets, stickers: stickers, lines: lines, scale: 1, gap: 0.018 };
  }

  // ---------------- dodecahedron ----------------
  function dodecaSpec() {
    const vs = [];
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => [-1, 1].forEach((c) => vs.push([a, b, c]))));
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => { vs.push([0, a / PHI, b * PHI]); vs.push([b * PHI, 0, a / PHI]); vs.push([a / PHI, b * PHI, 0]); }));
    const nrm = [];
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => { nrm.push([0, a * PHI, b]); nrm.push([b, 0, a * PHI]); nrm.push([a * PHI, b, 0]); }));
    const FRAC = 0.5, facets = [], stickers = [], info = [];
    nrm.forEach((n0, fi) => {
      const n = V.norm(n0);
      let mx = -1e9; vs.forEach((v) => { mx = Math.max(mx, V.dot(v, n)); });
      const fv = vs.filter((v) => V.dot(v, n) > mx - 1e-6), C = V.avg(fv);
      const t = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], u = V.norm(V.cross(n, t)), w = V.cross(n, u);
      fv.sort((a, b) => Math.atan2(V.dot(V.sub(a, C), w), V.dot(V.sub(a, C), u)) - Math.atan2(V.dot(V.sub(b, C), w), V.dot(V.sub(b, C), u)));
      facets.push({ verts: fv, normal: n }); info.push({ n: n, C: C, fv: fv });
    });
    const L = V.len(V.sub(info[0].fv[1], info[0].fv[0])), r = L / (2 * Math.tan(Math.PI / 5)), delta = FRAC * r, tt = delta / Math.sin(3 * Math.PI / 5) / L;
    info.forEach((f, fi) => {
      const Vs = f.fv, C = f.C, P = Vs.map((v) => V.add(C, V.mul(V.sub(v, C), 1 - FRAC)));
      const E1 = Vs.map((v, i) => V.add(v, V.mul(V.sub(Vs[(i + 1) % 5], v), tt)));          // on edge i->i+1 near vertex i
      const E2 = Vs.map((v, i) => V.add(Vs[(i + 1) % 5], V.mul(V.sub(v, Vs[(i + 1) % 5]), tt)));  // on edge i->i+1 near vertex i+1
      stickers.push({ facet: fi, verts: P, kind: 'c' });
      for (let i = 0; i < 5; i++) {
        stickers.push({ facet: fi, verts: [E1[i], E2[i], P[(i + 1) % 5], P[i]], kind: 'e' });
        stickers.push({ facet: fi, verts: [Vs[i], E1[i], P[i], E2[(i + 4) % 5]], kind: 'k' });
      }
    });
    // height of the cut plane of a face turn: the plane parallel to the face that meets a neighbour face on its inner pentagon line
    const f0 = info[0], nb = info.findIndex((g, i) => i !== 0 && g.fv.filter((v) => f0.fv.some((q) => V.len(V.sub(q, v)) < 1e-6)).length === 2);
    const sh = info[nb].fv.filter((v) => f0.fv.some((q) => V.len(V.sub(q, v)) < 1e-6)), M = V.avg(sh), uG = V.norm(V.sub(info[nb].C, M));
    const h = V.dot(f0.n, V.add(M, V.mul(uG, delta)));
    const lines = [];
    info.forEach((f, i) => {
      const j = info.findIndex((g) => V.dot(g.n, f.n) < -0.999);
      if (j > i) lines.push({ axis: f.n, n: 5, bands: [{ lo: h, hi: INF }, { lo: -INF, hi: -h }] });
    });
    return { name: 'dodeca', facets: facets, stickers: stickers, lines: lines, scale: 1 / Math.sqrt(3), gap: 0.022 };
  }


  // ---------------- icosahedron ----------------
  // Stickers are the cells into which the 20 cut planes (one per face, parallel to it at depth hFrac * inradius) divide every face, so no
  // sticker can ever be cut by any plane.
  function polyArea(poly) { let s = [0, 0, 0]; for (let i = 0; i < poly.length; i++) { const c = V.cross(poly[i], poly[(i + 1) % poly.length]); s = V.add(s, c); } return V.len(s) / 2; }
  function clipSide(poly, n, d, sgn) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = sgn * (V.dot(n, a) - d), db = sgn * (V.dot(n, b) - d);
      if (da >= -1e-9) out.push(a);
      if ((da > 1e-9 && db < -1e-9) || (da < -1e-9 && db > 1e-9)) { const t = da / (da - db); out.push(V.add(a, V.mul(V.sub(b, a), t))); }
    }
    return out;
  }
  function icosaSpec(hFrac) {
    const vs = [];
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => { vs.push([0, a, b * PHI]); vs.push([b * PHI, 0, a]); vs.push([a, b * PHI, 0]); }));
    const facets = [], stickers = [];
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
      const a = vs[i], b = vs[j], c = vs[k];
      if (Math.abs(V.len(V.sub(a, b)) - 2) < 1e-6 && Math.abs(V.len(V.sub(b, c)) - 2) < 1e-6 && Math.abs(V.len(V.sub(a, c)) - 2) < 1e-6) facets.push({ verts: [a, b, c], normal: V.norm(V.add(V.add(a, b), c)) });
    }
    const d = V.dot(facets[0].normal, facets[0].verts[0]), h = hFrac * d, lines = [];
    facets.forEach((f, fi) => {
      let cells = [f.verts];
      facets.forEach((g, gi) => {
        if (gi === fi) return;
        const next = [];
        cells.forEach((cl) => {
          const lo = clipSide(cl, g.normal, h, 1), hi = clipSide(cl, g.normal, h, -1);
          if (lo.length >= 3 && hi.length >= 3 && polyArea(lo) > 1e-7 && polyArea(hi) > 1e-7) { next.push(lo, hi); } else next.push(cl);
        });
        cells = next;
      });
      cells.forEach((cl) => stickers.push({ facet: fi, verts: cl }));
    });
    facets.forEach((f, i) => { const j = facets.findIndex((g) => V.dot(g.normal, f.normal) < -0.999); if (j > i) lines.push({ axis: f.normal, n: 3, bands: [{ lo: h, hi: INF }, { lo: -INF, hi: -h }] }); });
    return { name: 'icosa', facets: facets, stickers: stickers, lines: lines, scale: 1 / V.len(vs[0]), gap: 0.02 };
  }

  const META = {
    cube: { key: 'cube', spec: cubeSpec, extras: cubeExtras, scramble: 25, solver: 'kociemba', view: { yaw: 0.55, pitch: 0.5 },
      colours: ['#f2f2f2', '#d91e18', '#0fa34a', '#ffd400', '#ff7f0e', '#1f4fd8'] },
    tetra: { key: 'tetra', spec: tetraSpec, extras: tetraExtras, scramble: 15, solver: 'table', view: { yaw: -0.75, pitch: 0.6 },
      colours: ['#d91e18', '#0fa34a', '#1f4fd8', '#ffd400'] },
    octa: { key: 'octa', spec: octaSpec, extras: null, scramble: 30, solver: 'history', view: { yaw: 0.5, pitch: 0.4 },
      colours: ['#f2f2f2', '#ffd400', '#d91e18', '#ff7f0e', '#0fa34a', '#1f4fd8', '#8b2fc9', '#00c4d4'] },
    dodeca: { key: 'dodeca', spec: dodecaSpec, extras: null, scramble: 60, solver: 'history', view: { yaw: 0.4, pitch: 0.35 },
      colours: ['#f2f2f2', '#ffe000', '#d41f26', '#ff8000', '#0f9d58', '#1a4fd6', '#7b2fbe', '#ff78b4', '#9be000', '#00c2d6', '#8c8c8c', '#9c5a2e'] },
  };
  META.cube5 = { key: 'cube5', spec: function () { return cubeSpec(5); }, extras: null, scramble: 60, solver: 'history', view: { yaw: 0.55, pitch: 0.5 }, colours: META.cube.colours };
  META.icosa = { key: 'icosa', spec: function () { return icosaSpec(ICOSA_H); }, extras: null, scramble: 40, solver: 'history', view: { yaw: 0.4, pitch: 0.3 },
    colours: ['#f2f2f2', '#ffd400', '#d41f26', '#ff7f0e', '#0f9d58', '#1a4fd6', '#7b2fbe', '#ff78b4', '#9be000', '#00c2d6', '#8c8c8c', '#9c5a2e', '#0b1f6b', '#00796b', '#7a0f2e', '#e6c88f', '#2b2b2b', '#b9a6ff', '#6b7a00', '#8fd0ff'] };
  const cache = {};
  function getPuzzle(key) {
    if (cache[key]) return cache[key];
    const m = META[key], P = E.build(m.spec());
    P.meta = m; P.key = key;
    // moves used by the scrambler: whole-face / whole-cap turns only (no slices, so the cube centres stay put)
    P.scrambleBands = P.bands.filter((b) => !(key === 'cube' && b.idx % 3 === 1)).map((b) => b.idx);
    if (m.extras) m.extras(P);
    cache[key] = P; return P;
  }
  root.RBPuzzles = { get: getPuzzle, META: META, KEYS: ['cube', 'cube5', 'tetra', 'octa', 'dodeca', 'icosa'], icosaSpec: icosaSpec, build: E.build };
})(typeof window !== 'undefined' ? window : globalThis);
