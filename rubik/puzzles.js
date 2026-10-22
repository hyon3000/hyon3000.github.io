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
    const bands = nl === 1 ? [{ lo: -INF, hi: INF }] : [{ lo: bounds[nl - 2], hi: INF }];
    if (nl > 1) { for (let k = nl - 2; k > 0; k--) bands.push({ lo: bounds[k - 1], hi: bounds[k] }); bands.push({ lo: -INF, hi: bounds[0] }); }
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

  // ---------------- 2x2x2: optimal solver ----------------
  // 3,674,160 positions (corner 0 fixed): corner permutation (5040) x orientation (3^7), BFS table of the quarter-turn distance (God's number 14).
  // A state with any whole-cube orientation is first rotated until the reference corner piece sits in its home place; the moves found there are
  // translated back with the same rotation, so every kind of turn the player may have made (both halves of every axis) is handled.
  function cube2Extras(P) {
    let S = null;
    P.initSolver = function () {
      if (S) return S;
      const t0 = Date.now(), sc = P.solvedCol, k = P.stickers[0].c; // (stickers are scaled by 1/(2*sqrt(3)))
      const unit = 1 / (2 * Math.sqrt(3));
      function slotAt(x, y, z) {
        for (let i = 0; i < P.N; i++) { const c = P.stickers[i].c; if (Math.abs(c[0] - x * unit) < 1e-6 && Math.abs(c[1] - y * unit) < 1e-6 && Math.abs(c[2] - z * unit) < 1e-6) return i; }
        throw new Error('cube2: no sticker');
      }
      const cs = [], sg = [];      // corner position p (bit0 x, bit1 y, bit2 z set = positive side): its x / y / z facing stickers
      for (let p = 0; p < 8; p++) {
        const x = p & 1 ? 1 : -1, y = p & 2 ? 1 : -1, z = p & 4 ? 1 : -1;
        cs.push([slotAt(2 * x, y, z), slotAt(x, 2 * y, z), slotAt(x, y, 2 * z)]); sg.push(x * y * z);
      }
      const home = cs.map((t) => t.map((i) => sc[i]));
      const pieceOf = {};
      home.forEach((h, p) => { pieceOf[h.slice().sort().join(',')] = p; });
      // clockwise (seen from outside) colour list of piece p at its home: positive parity corners read x,y,z clockwise, the others x,z,y
      const L = home.map((h, p) => (sg[p] > 0 ? [h[0], h[1], h[2]] : [h[0], h[2], h[1]]));
      function encode(col) {                  // -> { perm[8], ori[8] } or null
        const perm = [], ori = [];
        for (let p = 0; p < 8; p++) {
          const c = [col[cs[p][0]], col[cs[p][1]], col[cs[p][2]]], pc = pieceOf[c.slice().sort().join(',')];
          if (pc === undefined) return null;
          const o = L[pc].indexOf(c[0]); if (o < 0) return null;
          // the stickers of position p in clockwise order: x,y,z (positive parity) or x,z,y; check that the cyclic order matches the piece
          const cw = sg[p] > 0 ? [c[0], c[1], c[2]] : [c[0], c[2], c[1]];
          if (cw[1] !== L[pc][(o + 1) % 3]) return null;
          perm.push(pc); ori.push(o);
        }
        return { perm: perm, ori: ori };
      }
      function decode(st) {
        const col = new Uint8Array(P.N);
        for (let p = 0; p < 8; p++) {
          const l = L[st.perm[p]], o = st.ori[p], a = [l[o % 3], l[(o + 1) % 3], l[(o + 2) % 3]];
          if (sg[p] > 0) { col[cs[p][0]] = a[0]; col[cs[p][1]] = a[1]; col[cs[p][2]] = a[2]; } else { col[cs[p][0]] = a[0]; col[cs[p][2]] = a[1]; col[cs[p][1]] = a[2]; }
        }
        return col;
      }
      // canonical moves: the positive half of every axis (they never touch corner 0 = the all-negative corner), both directions
      const moves = []; for (let li = 0; li < 3; li++) for (const d of [1, -1]) moves.push({ li: li, d: d, b: li * 2, m: P.moveOf(li * 2, d) });
      const posMap = [], delta = [];
      moves.forEach((mv) => {
        const id = { perm: [0, 1, 2, 3, 4, 5, 6, 7], ori: [0, 0, 0, 0, 0, 0, 0, 0] }, st = encode(P.apply(decode(id), mv.m));
        const pm = [], dl = [];
        for (let q = 0; q < 8; q++) { const pc = st.perm[q]; pm[pc] = q; dl[pc] = st.ori[q]; }
        if (pm[0] !== 0 || dl[0] !== 0) throw new Error('cube2: corner 0 moved');
        posMap.push(pm); delta.push(dl);
      });
      // tables: permutation (7 pieces at positions 1..7 -> rank), orientation (7 digits, base 3)
      const FACT = [1, 1, 2, 6, 24, 120, 720];
      function rankPerm(a) { let r = 0; for (let i = 0; i < 7; i++) { let c = 0; for (let j = i + 1; j < 7; j++) if (a[j] < a[i]) c++; r += c * FACT[6 - i]; } return r; }
      function unrankPerm(r) { const av = [0, 1, 2, 3, 4, 5, 6], out = []; for (let i = 0; i < 7; i++) { const f = FACT[6 - i], c = Math.floor(r / f); r -= c * f; out.push(av.splice(c, 1)[0]); } return out; }
      const NP = 5040, NO = 2187, PM = moves.map(() => new Uint16Array(NP)), OM = moves.map(() => new Uint16Array(NO));
      for (let r = 0; r < NP; r++) {
        const a = unrankPerm(r);              // a[pos-1] = piece-1
        moves.forEach((mv, mi) => { const n = new Array(7); for (let p = 1; p < 8; p++) n[posMap[mi][p] - 1] = a[p - 1]; PM[mi][r] = rankPerm(n); });
      }
      for (let o = 0; o < NO; o++) {
        const dg = []; let x = o; for (let i = 0; i < 7; i++) { dg.push(x % 3); x = Math.floor(x / 3); }       // dg[pos-1]
        moves.forEach((mv, mi) => { const n = new Array(7); for (let p = 1; p < 8; p++) n[posMap[mi][p] - 1] = (dg[p - 1] + delta[mi][p]) % 3; let v = 0; for (let i = 6; i >= 0; i--) v = v * 3 + n[i]; OM[mi][o] = v; });
      }
      const dist = new Int8Array(NP * NO).fill(-1), queue = new Int32Array(3674160 + 10);
      let qh = 0, qt = 0; dist[0] = 0; queue[qt++] = 0;
      while (qh < qt) {
        const s = queue[qh++], r = (s / NO) | 0, o = s - r * NO, d = dist[s] + 1;
        for (let mi = 0; mi < 6; mi++) { const ns = PM[mi][r] * NO + OM[mi][o]; if (dist[ns] < 0) { dist[ns] = d; queue[qt++] = ns; } }
      }
      // the 24 whole-cube rotations: matrix + sticker permutation
      const rots = [], seenM = {};
      const gx = [[1, 0, 0], [0, 0, -1], [0, 1, 0]], gy = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
      const mmul = (A, B) => A.map((row, i) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
      const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], fr = [I3]; seenM[JSON.stringify(I3)] = 1;
      for (let i = 0; i < fr.length; i++) [gx, gy].forEach((g) => { const m = mmul(g, fr[i]), key = JSON.stringify(m); if (!seenM[key]) { seenM[key] = 1; fr.push(m); } });
      fr.forEach((M) => {
        const perm = new Int16Array(P.N);
        for (let i = 0; i < P.N; i++) { const c = P.stickers[i].c, q = [0, 1, 2].map((r) => M[r][0] * c[0] + M[r][1] * c[1] + M[r][2] * c[2]); let f = -1; for (let j = 0; j < P.N; j++) { const cj = P.stickers[j].c; if (Math.abs(cj[0] - q[0]) < 1e-6 && Math.abs(cj[1] - q[1]) < 1e-6 && Math.abs(cj[2] - q[2]) < 1e-6) { f = j; break; } } perm[i] = f; }
        rots.push({ M: M, perm: perm });
      });
      S = {
        states: qt, maxDepth: dist[queue[qt - 1]], ms: Date.now() - t0, dist: dist,
        // distance (quarter turns) of a state in any orientation, -1 when it is not a valid state
        distance: function (col) { const c = canon(col); return c ? c.d : -1; },
        // next move toward the solved state: {b, d} | null when solved | undefined when the state is not reachable
        next: function (col) {
          const c = canon(col); if (!c) return undefined; if (c.d === 0) return null;
          const r0 = c.r;
          for (let mi = 0; mi < 6; mi++) {
            const ns = PM[mi][c.pr] * NO + OM[mi][c.po]; if (dist[ns] !== c.d - 1) continue;
            const mv = moves[mi], e = [0, 0, 0]; e[mv.li] = 1;
            const v = [0, 1, 2].map((q) => r0.M[0][q] * e[0] + r0.M[1][q] * e[1] + r0.M[2][q] * e[2]);     // M^T e: the same half-space in the frame of the real cube
            const li = Math.abs(v[0]) > 0.5 ? 0 : Math.abs(v[1]) > 0.5 ? 1 : 2, sgn = v[li] > 0 ? 1 : -1;
            return sgn > 0 ? { b: li * 2, d: mv.d } : { b: li * 2 + 1, d: -mv.d };
          }
          return undefined;
        },
      };
      function canon(col) {
        for (let ri = 0; ri < rots.length; ri++) {
          const rp = rots[ri].perm, c2 = new Uint8Array(P.N); for (let i = 0; i < P.N; i++) c2[rp[i]] = col[i];
          const st = encode(c2); if (!st || st.perm[0] !== 0 || st.ori[0] !== 0) continue;
          const a = []; for (let p = 1; p < 8; p++) a.push(st.perm[p] - 1);
          let o = 0; for (let p = 7; p >= 1; p--) o = o * 3 + st.ori[p];
          const pr = rankPerm(a), d = dist[pr * NO + o]; if (d < 0) return null;
          return { r: rots[ri], pr: pr, po: o, d: d };
        }
        return null;
      }
      return S;
    };
  }

  // ---------------- helicopter cube ----------------
  // A cube cut by the six planes through its centre that contain two opposite edges (x = +-y, x = +-z, y = +-z): every face is split by its two diagonals into 4 triangles (24
  // stickers). A turn flips one half of the cube by 180 degrees about the axis through the midpoints of two opposite edges (the normal of the cut plane).
  function heliSpec() {
    const facets = [], stickers = [], h = Math.SQRT1_2;
    FACE_ORDER.forEach((nm, fi) => {
      const n = FACE[nm], u = Math.abs(n[1]) === 1 ? [1, 0, 0] : [0, 1, 0], w = V.cross(n, u), P = (a, b) => V.add(n, V.add(V.mul(u, a), V.mul(w, b)));
      const cs = [P(1, 1), P(-1, 1), P(-1, -1), P(1, -1)], ms = [P(0, 1), P(-1, 0), P(0, -1), P(1, 0)], c = P(0, 0);
      facets.push({ verts: cs, normal: n });
      for (let k = 0; k < 4; k++) stickers.push({ facet: fi, verts: [cs[k], ms[k], ms[(k + 3) % 4]], kind: 't' });
      for (let k = 0; k < 4; k++) stickers.push({ facet: fi, verts: [c, ms[k], ms[(k + 1) % 4]], kind: 'i' });
    });
    // three central planes (quarter turns of a half) and the twelve planes through the edge midpoints x+-y = +-1 ... (half turns of the edge cap)
    const lines = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((ax) => ({ axis: ax, n: 4, bands: [{ lo: 0, hi: INF }, { lo: -INF, hi: 0 }] }));
    [[1, -1, 0], [1, 1, 0], [1, 0, -1], [1, 0, 1], [0, 1, -1], [0, 1, 1]].forEach((ax) => lines.push({ axis: ax, n: 2, bands: [{ lo: h, hi: INF }, { lo: -INF, hi: -h }] }));
    return { name: 'heli', facets: facets, stickers: stickers, lines: lines, scale: 1 / Math.sqrt(3), gap: 0.05 };
  }

  // ---------------- skewb ----------------
  // A cube cut by the four planes through its centre perpendicular to the body diagonals: every face shows a diamond (the centre) and four corner triangles
  // (30 stickers). A turn rotates one half of the cube (4 corners + 3 centres) by 120 degrees about a body diagonal; both halves of every diagonal can be turned.
  function skewbSpec() {
    const facets = [], stickers = [];
    FACE_ORDER.forEach((nm, fi) => {
      const n = FACE[nm], u = Math.abs(n[1]) === 1 ? [1, 0, 0] : [0, 1, 0], w = V.cross(n, u);
      const P = (a, b) => V.add(n, V.add(V.mul(u, a), V.mul(w, b)));
      facets.push({ verts: [P(1, 1), P(-1, 1), P(-1, -1), P(1, -1)], normal: n });
      stickers.push({ facet: fi, verts: [P(1, 0), P(0, 1), P(-1, 0), P(0, -1)], kind: 'd' });
      [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach((q) => stickers.push({ facet: fi, verts: [P(q[0], q[1]), P(0, q[1]), P(q[0], 0)], kind: 't' }));
    });
    const lines = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]].map((ax) => ({ axis: ax, n: 3, bands: [{ lo: 0, hi: INF }, { lo: -INF, hi: 0 }] }));
    return { name: 'skewb', facets: facets, stickers: stickers, lines: lines, scale: 1 / Math.sqrt(3), gap: 0.05 };
  }

  // ---------------- tetrahedron ----------------
  // n triangles per edge (n = 3: tips + two layers); the cut planes are parallel to the face opposite the vertex, at the rows of the triangle lattice
  function tetraSpec(n) {
    n = n || 3;
    const T = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], facets = [], stickers = [];
    for (let f = 0; f < 4; f++) {
      const o = [0, 1, 2, 3].filter((i) => i !== f).map((i) => T[i]);
      facets.push({ verts: o, normal: V.mul(T[f], -1) });
      triCells(o[0], o[1], o[2], n, f, stickers);
    }
    const s3 = Math.sqrt(3), h = 4 / s3;
    const lines = T.map((t) => {
      const bands = [];
      for (let k = 1; k < n; k++) bands.push({ lo: s3 - k * h / n, hi: INF, name: n === 3 ? (k === 1 ? 'tip' : 'big') : '' });
      return { axis: t, n: 3, bands: bands };
    });
    return { name: n === 3 ? 'tetra' : 'tetra' + n, facets: facets, stickers: stickers, lines: lines, scale: 1 / s3, gap: n > 6 ? 0.02 : 0.04 };
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
      // ---- shortest solution: IDA* over the core moves (h = core table distance, admissible); the tips only matter at the end: a core solution of g moves
      // leaves every tip rotated by the big turns of its own vertex, and each tip that is still off costs one extra tip turn. ----
      const cyc = [];
      for (let v = 0; v < 4; v++) { const pm = P.perms[P.moveOf(tipBand[v], 1)], t = tipStk[v], a0 = t[0], b0 = pm[a0], c0 = pm[b0]; cyc.push([a0, b0, c0]); }
      function shiftOf(col, v) {
        const cy = cyc[v];
        for (let r = 0; r < 3; r++) { let ok = true; for (let k = 0; k < 3; k++) if (col[cy[k]] !== sc[cy[(k - r + 3) % 3]]) ok = false; if (ok) return r; }
        return -1;
      }
      const bigDelta = [[0, 0], [0, 0], [0, 0], [0, 0]]; let tipsOk = true;
      for (let v = 0; v < 4; v++) [1, -1].forEach((d, di) => {
        const c2 = P.apply(sc, P.moveOf(bigBand[v], d));
        bigDelta[v][di] = shiftOf(c2, v);
        for (let w = 0; w < 4; w++) if (w !== v && shiftOf(c2, w) !== 0) tipsOk = false;
        if (bigDelta[v][di] < 0) tipsOk = false;
      });
      const mv2 = moves.map((m, mi) => ({ v: (mi / 2) | 0, di: mi & 1, d: m.d, b: m.b }));
      let cachePlan = null, cacheSigs = null;
      function plan(col, limitMs) {
        const e0 = encE(col), a0 = encA(col), sh0 = [0, 1, 2, 3].map((v) => shiftOf(col, v));
        if (e0 < 0 || a0 < 0 || sh0.some((x) => x < 0) || !tipsOk) return null;
        const h0 = dist[e0 * NA + a0]; if (h0 < 0) return null;
        const tEnd = Date.now() + limitMs; let nodes = 0, timeout = false, path = [], finalSh = null;
        function dfs(e, a, sh, g, B, lastV) {
          if ((++nodes & 4095) === 0 && Date.now() > tEnd) { timeout = true; return false; }
          const d = dist[e * NA + a];
          if (g + d > B) return false;
          if (d === 0) { let extra = 0; for (let v = 0; v < 4; v++) if (sh[v] !== 0) extra++; if (g + extra <= B) { finalSh = sh; return true; } }
          for (let mi = 0; mi < 8; mi++) {
            const m = mv2[mi]; if (m.v === lastV) continue;
            const ne = TE[mi][e], na = TA[mi][a];
            if (g + 1 + dist[ne * NA + na] > B) continue;
            const sh2 = sh.slice(); sh2[m.v] = (sh[m.v] + bigDelta[m.v][m.di]) % 3;
            path.push(mi);
            if (dfs(ne, na, sh2, g + 1, B, m.v)) return true;
            if (timeout) return false;
            path.pop();
          }
          return false;
        }
        for (let B = h0; B <= h0 + 6; B++) {
          path = []; if (dfs(e0, a0, sh0, 0, B, -1)) break; if (timeout) return null;
          if (B === h0 + 6) return null;
        }
        const out = path.map((mi) => ({ b: mv2[mi].b, d: mv2[mi].d }));
        for (let v = 0; v < 4; v++) if (finalSh[v] !== 0) out.push({ b: tipBand[v], d: finalSh[v] === 2 ? 1 : -1 });
        return out;
      }
      S.nextGreedy = S.next;
      S.plan = plan;
      S.next = function (col) {
        const sig = col.join(',');
        if (cacheSigs) { const i = cacheSigs.indexOf(sig); if (i >= 0) return cachePlan[i]; }
        const pl = plan(col, 2500);
        if (!pl || !pl.length) return S.nextGreedy(col);
        cachePlan = pl; cacheSigs = []; let c = col;
        pl.forEach((m) => { cacheSigs.push(c.join(',')); c = P.apply(c, P.moveOf(m.b, m.d)); });
        return pl[0];
      };
      return S;
    };
  }

  // ---------------- face turning octahedron ----------------
  // n triangles per edge (n = 3: the face turning octahedron); a turn moves the cap of k rows next to a face (k = 1 .. n/2), at either end of every face axis
  function octaSpec(n) {
    n = n || 3;
    const facets = [], stickers = [], sg = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]];
    sg.forEach((s, f) => {
      const A = [s[0], 0, 0], B = [0, s[1], 0], C = [0, 0, s[2]];
      facets.push({ verts: [A, B, C], normal: s });
      triCells(A, B, C, n, f, stickers);
    });
    const dd = 1 / Math.sqrt(3), caps = [];
    for (let k = 1; k <= Math.floor(n / 2); k++) caps.push(dd - k * 2 * dd / n);
    const lines = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map((q) => ({ axis: [1, q[0], q[1]], n: 3, bands: caps.map((c) => ({ lo: c, hi: INF })).concat(caps.map((c) => ({ lo: -INF, hi: -c }))) }));
    return { name: n === 3 ? 'octa' : 'octa' + n, facets: facets, stickers: stickers, lines: lines, scale: 1, gap: n > 3 ? 0.054 / n : 0.018 };
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

  // ---------------- layered polyhedra (custom sizes) ----------------
  // n layers between the two ends of every turn axis: planes at equal spacing perpendicular to the axis cut the surface, the stickers are the cells of the
  // faces between all planes, a turn rotates one slab (the n slabs of an axis are listed from its positive end).
  function layeredSpec(name, facets, axes, n, order, scale, gap, maxStickers) {
    const planes = [];
    axes.forEach((ax) => { const ds = ax.ds || (() => { const a = []; for (let k = 1; k < n; k++) a.push(ax.D * (2 * k / n - 1)); return a; })(); ds.forEach((d) => planes.push({ n: ax.u, d: d })); });
    const stickers = [];
    facets.forEach((f, fi) => {
      let cells = [f.verts];
      planes.forEach((pl) => {
        const next = [];
        cells.forEach((cl) => {
          const lo = clipSide(cl, pl.n, pl.d, 1), hi = clipSide(cl, pl.n, pl.d, -1);
          if (lo.length >= 3 && hi.length >= 3 && polyArea(lo) > 1e-7 && polyArea(hi) > 1e-7) next.push(lo, hi); else next.push(cl);
        });
        cells = next;
      });
      cells.forEach((cl) => stickers.push({ facet: fi, verts: cl }));
      if (maxStickers && stickers.length > maxStickers) throw new Error('too many stickers');
    });
    const lines = axes.map((ax) => {
      const lv = ax.ds ? ax.ds.slice().sort((x, y) => y - x) : []; if (!ax.ds) for (let k = n - 1; k >= 1; k--) lv.push(ax.D * (2 * k / n - 1));
      const bands = []; let hi = INF;
      lv.forEach((p) => { bands.push({ lo: p, hi: hi }); hi = p; });
      bands.push({ lo: -INF, hi: hi });
      return { axis: ax.u, n: order, bands: bands };
    });
    return { name: name, facets: facets, stickers: stickers, lines: lines, scale: scale, gap: gap };
  }
  function icosaFacets() {
    const vs = [];
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => { vs.push([0, a, b * PHI]); vs.push([b * PHI, 0, a]); vs.push([a, b * PHI, 0]); }));
    const facets = [];
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) {
      const a = vs[i], b = vs[j], c = vs[k];
      if (Math.abs(V.len(V.sub(a, b)) - 2) < 1e-6 && Math.abs(V.len(V.sub(b, c)) - 2) < 1e-6 && Math.abs(V.len(V.sub(a, c)) - 2) < 1e-6) facets.push({ verts: [a, b, c], normal: V.norm(V.add(V.add(a, b), c)) });
    }
    return { facets: facets, radius: V.len(vs[0]) };
  }
  function dodecaFacets() {
    const vs = [];
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => [-1, 1].forEach((c) => vs.push([a, b, c]))));
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => { vs.push([0, a / PHI, b * PHI]); vs.push([b * PHI, 0, a / PHI]); vs.push([a / PHI, b * PHI, 0]); }));
    const nrm = [];
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => { nrm.push([0, a * PHI, b]); nrm.push([b, 0, a * PHI]); nrm.push([a * PHI, b, 0]); }));
    const facets = [];
    nrm.forEach((n0) => {
      const n = V.norm(n0);
      let mx = -1e9; vs.forEach((v) => { mx = Math.max(mx, V.dot(v, n)); });
      const fv = vs.filter((v) => V.dot(v, n) > mx - 1e-6), C = V.avg(fv);
      const t = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], u = V.norm(V.cross(n, t)), w = V.cross(n, u);
      fv.sort((a, b) => Math.atan2(V.dot(V.sub(a, C), w), V.dot(V.sub(a, C), u)) - Math.atan2(V.dot(V.sub(b, C), w), V.dot(V.sub(b, C), u)));
      facets.push({ verts: fv, normal: n });
    });
    return { facets: facets, radius: Math.sqrt(3) };
  }
  function oppositePairs(facets) {
    const out = [];
    facets.forEach((f, i) => { const j = facets.findIndex((g) => V.dot(g.normal, f.normal) < -0.999); if (j > i) out.push(f); });
    return out;
  }
  function icosaNSpec(n) {
    const g = icosaFacets(), D = V.dot(g.facets[0].normal, g.facets[0].verts[0]);
    return layeredSpec('icosa' + n, g.facets, oppositePairs(g.facets).map((f) => ({ u: f.normal, D: D })), n, 3, 1 / g.radius, 0.02, 0);
  }
  // n = 2: every face is a pentagram (one sticker, tips on the edge midpoints) with a quadrilateral at each vertex; the two cap planes per axis at D / PHI decide which
  // stickers turn (a sticker belongs to a cap by its centre: the puzzle is "loose", the star is one rigid face), only the caps turn.
  function dodeca2Spec() {
    const g = dodecaFacets(), D = V.dot(g.facets[0].normal, g.facets[0].verts[0]), d2 = D / PHI, stickers = [];
    function lineInt(a, b, c, d) { const d1 = V.sub(b, a), d2v = V.sub(d, c), cr = V.cross(d1, d2v), t = V.dot(V.cross(V.sub(c, a), d2v), cr) / V.dot(cr, cr); return V.add(a, V.mul(d1, t)); }
    g.facets.forEach((f, fi) => {
      const v = f.verts, M = v.map((p, i) => V.mul(V.add(p, v[(i + 1) % 5]), 0.5)), N = [];
      for (let i = 0; i < 5; i++) N.push(lineInt(M[i], M[(i + 2) % 5], M[(i + 4) % 5], M[(i + 1) % 5]));      // notch between the tips i and i + 1
      const star = []; for (let i = 0; i < 5; i++) { star.push(M[i]); star.push(N[i]); }
      stickers.push({ facet: fi, verts: star, kind: 's' });
      for (let i = 0; i < 5; i++) stickers.push({ facet: fi, verts: [v[(i + 1) % 5], M[(i + 1) % 5], N[i], M[i]], kind: 'q' });
    });
    const lines = oppositePairs(g.facets).map((f) => ({ axis: f.normal, n: 5, bands: [{ lo: d2, hi: INF }, { lo: -INF, hi: -d2 }] }));
    return { name: 'dodeca2', facets: g.facets, stickers: stickers, lines: lines, scale: 1 / g.radius, gap: 0.022, loose: true };
  }
  // n = 3 is the dodecahedron of the theme list (face turns of the caps cut at height h).  Cap planes (one pair +- per value, only the caps turn) for the other sizes:
  // even n = 2m: D / PHI (the pentagram chords) and m - 1 more equally spaced up to the face (n = 4: the middle one cuts every quadrilateral into four by a cross);
  // odd n >= 5: D / PHI, h and (n - 5) / 2 more equally spaced between h and the face.  The centre of every face is ONE sticker: the pentagram of the chords for an even n (the cells
  // inside it are merged: the puzzle is "loose", a sticker belongs to a cap by its centre only), the pentagon inside the chords (a cell) for an odd n.
  function inPoly2(P, p, nrm) {
    const t = Math.abs(nrm[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], u = V.norm(V.cross(nrm, t)), w = V.cross(nrm, u), pt = [V.dot(p, u), V.dot(p, w)], q = P.map((v) => [V.dot(v, u), V.dot(v, w)]);
    let c = false;
    for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > pt[1]) !== (q[j][1] > pt[1]) && pt[0] < (q[j][0] - q[i][0]) * (pt[1] - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) c = !c;
    return c;
  }
  function dodecaNSpec(n) {
    const base = dodecaSpec(); if (n === 3) return base;
    const h = base.lines[0].bands[0].lo, g = dodecaFacets(), D = V.dot(g.facets[0].normal, g.facets[0].verts[0]), d2 = D / PHI, vals = [d2];
    if (n % 2 === 0) { const m = n / 2; for (let k = 1; k <= m - 1; k++) vals.push(d2 + (D - d2) * k / m); }
    else { vals.push(h); const m = (n - 5) / 2; for (let k = 1; k <= m; k++) vals.push(h + (D - h) * k / (m + 1)); }
    const ds = vals.concat(vals.map((x) => -x));
    const sp = layeredSpec('dodeca' + n, g.facets, oppositePairs(g.facets).map((f) => ({ u: f.normal, ds: ds })), n, 5, 1 / g.radius, 0.022, 0);
    sp.lines.forEach((l) => { const mid = (l.bands.length - 1) / 2; l.bands = l.bands.filter((bd, i) => i !== mid); });          // every cap layer of an axis turns, the big middle slab does not
    if (n % 2) return sp;
    // even n: the middle of every face is the pentagon inside the pentagram; the five spikes of the pentagram are left out (open gaps), so every sticker is a real cell of the planes and every
    // turn is exact (the model has large gaps)
    const reg = dodeca2Spec().stickers.filter((s) => s.kind === 's'), out = [];
    sp.stickers.forEach((s) => {
      const r = reg.find((x) => x.facet === s.facet), nrm = g.facets[s.facet].normal;
      if (!inPoly2(r.verts, V.avg(s.verts), nrm) || inPoly2(s.verts, V.avg(g.facets[s.facet].verts), nrm)) out.push(s);
    });
    sp.stickers = out;
    return sp;
  }
  // face-turning dodecahedron, deep cut: n = 2 is the Pentultimate (one plane per face axis through the centre).  For a larger n the planes are: the one through the centre and, for t = 1 .. n - 2,
  // the pair +- (D / PHI + (D - D / PHI) t / (n - 1)) (D = distance of a face from the centre): the nearest lines to the centre are then five lines parallel to the edges, so the middle of
  // every face is ONE pentagon, and every turn is exact (the stickers are the cells the planes cut out of the faces).
  function dodecaDeepSpec(n) {
    const g = dodecaFacets(), D = V.dot(g.facets[0].normal, g.facets[0].verts[0]), d2 = D / PHI, vals = [0];
    for (let t = 1; t <= n - 2; t++) { const d = d2 + (D - d2) * t / (n - 1); vals.push(d); vals.push(-d); }
    const ds = vals.sort((a, b) => b - a);
    return layeredSpec('dodecadc' + n, g.facets, oppositePairs(g.facets).map((f) => ({ u: f.normal, ds: ds })), n, 5, 1 / g.radius, 0.022, 0);
  }
  // axes through opposite vertices: unit vectors (one per pair) and O = the height of the plane through the neighbours of a vertex (a plane there cuts the corner off)
  function vertexAxes(facets) {
    const vs = []; facets.forEach((f) => f.verts.forEach((v) => { if (!vs.some((w) => V.len(V.sub(w, v)) < 1e-6)) vs.push(v); }));
    const ax = []; vs.forEach((v) => { const u = V.norm(v); if (!ax.some((w) => Math.abs(Math.abs(V.dot(w, u)) - 1) < 1e-6)) ax.push(u); });
    let mn = 1e9, O = 0; vs.forEach((w) => { const d = V.len(V.sub(w, vs[0])); if (d > 1e-6 && d < mn - 1e-9) { mn = d; O = V.dot(V.norm(vs[0]), w); } });
    return { axes: ax, O: O };
  }
  function ctSpec(name, g, order, n, np) {              // np planes per axis (default n - 1)
    const va = vertexAxes(g.facets), ds = [];
    np = np || n - 1;
    if (np === 1) ds.push(0); else for (let k = 0; k < np; k++) ds.push(va.O * (1 - 2 * k / (np - 1)));
    return layeredSpec(name + n, g.facets, va.axes.map((u) => ({ u: u, ds: ds })), n, order, 1 / g.radius, 0.022, 0);
  }
  // corner-turning dodecahedron / icosahedron: n - 1 planes per vertex axis equally spaced between the planes that cut the corners off (n = 2: the plane through the centre)
  // Corner-turning octahedron (CT): the three axes through opposite vertices carry n - 1 parallel cut planes (n = 3 and more; the planes are equally spaced between -1/2 and 1/2); a slab
  // turns by 90 degrees about its axis.  n = 2 (one plane through the centre) and n = 1 are easter eggs: the faces are not cut, the puzzle is solved at once.
  function octactSpec(n) {
    const facets = [], sg = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]];
    sg.forEach((s) => facets.push({ verts: [[s[0], 0, 0], [0, s[1], 0], [0, 0, s[2]]], normal: V.norm(s) }));
    const ds = []; if (n === 2) ds.push(0); else for (let k = 0; k <= n - 2; k++) ds.push(0.5 * (1 - 2 * k / (n - 2)));
    return layeredSpec('octact' + n, facets, [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((a) => ({ u: a, ds: ds })), n, 4, 1, 0.03, 0);
  }
  // dodecahedron CT: the corner planes pass through the centres of the three faces at the vertex (depth D cos(angle vertex axis - face axis)), so every line cut into a face goes through the
  // centre of that face (n = 2 = Chopasaurus: just these two planes per vertex axis, only the two corners turn); n planes equally spaced between them in general
  function dodecactSpec(n) {
    const g = dodecaFacets(), va = vertexAxes(g.facets), D = V.dot(g.facets[0].normal, g.facets[0].verts[0]);
    let c = -1; g.facets.forEach((f) => { c = Math.max(c, V.dot(va.axes[0], f.normal)); });
    const Cd = D * c, ds = []; for (let k = 0; k < n; k++) ds.push(Cd * (1 - 2 * k / (n - 1)));
    const sp = layeredSpec('dodecact' + n, g.facets, va.axes.map((u) => ({ u: u, ds: ds })), n, 3, 1 / g.radius, 0.022, 0);
    if (n === 2) {
      sp.lines.forEach((l) => { l.bands = [l.bands[0], l.bands[2]]; });
      // Chopasaurus: every face is cut by five lines that all go through its centre (each perpendicular to the direction centre - vertex): 5 quadrilaterals (with a vertex) and 5 triangles
      // (with an edge midpoint).  The stickers are built directly and belong to a corner by their centre only ("loose").
      const out = [];
      g.facets.forEach((f, fi) => {
        const v = f.verts, C = V.avg(v), nrm = f.normal, t0 = V.norm(V.sub(v[0], C)), w0 = V.cross(nrm, t0);
        const ang = (p) => { const r = V.sub(p, C); return Math.atan2(V.dot(r, w0), V.dot(r, t0)); };
        // boundary point of the ray from the centre in direction (cos a, sin a) in the face plane
        const hit = (a) => {
          const dir = V.add(V.mul(t0, Math.cos(a)), V.mul(w0, Math.sin(a)));
          let best = null;
          for (let i = 0; i < v.length; i++) {
            const A = v[i], B = v[(i + 1) % v.length], e = V.sub(B, A), cr = V.cross(dir, e), den = V.dot(cr, cr);
            if (den < 1e-12) continue;
            const s = V.dot(V.cross(V.sub(A, C), dir), cr) / den, tt = V.dot(V.cross(V.sub(A, C), e), cr) / den;
            if (tt > 1e-9 && s > -1e-9 && s < 1 + 1e-9) best = V.add(C, V.mul(dir, tt));
          }
          return best;
        };
        const vang = v.map(ang), rays = [];
        // rays: perpendicular to every vertex direction (both ways) - angles vang + 90 degrees, + 270 degrees
        v.forEach((q, i) => { rays.push(vang[i] + Math.PI / 2); rays.push(vang[i] - Math.PI / 2); });
        const norm = (a) => { while (a < -Math.PI) a += 2 * Math.PI; while (a >= Math.PI) a -= 2 * Math.PI; return a; };
        const ra = rays.map(norm).sort((a, b) => a - b), pts = ra.map(hit);
        for (let j = 0; j < ra.length; j++) {
          const a0 = ra[j], a1 = j + 1 < ra.length ? ra[j + 1] : ra[0] + 2 * Math.PI, poly = [C, pts[j]];
          v.forEach((q, i) => { let a = norm(vang[i]); for (const k of [0, 2 * Math.PI]) { if (a + k > a0 + 1e-9 && a + k < a1 - 1e-9) poly.push(q); } });
          poly.push(pts[(j + 1) % ra.length]);
          out.push({ facet: fi, verts: poly, kind: poly.length > 4 ? 'q' : 't' });
        }
      });
      sp.stickers = out; sp.loose = true;
    }
    return sp;
  }
  // icosahedron CT/FT-Deepcut: n + 1 planes per vertex axis between the two planes that cut the corners off, the faces are then cut into n^2 triangles (n = 2: four, n = 3: nine) by planes
  // only, all turns of 72 degrees about a vertex are exact.  n = 1 (the two corner planes, faces not cut) is the easter egg.  (n = 2 is the Icosamate.)
  function icosadcSpec(n) { return ctSpec('icosadc', icosaFacets(), 5, n, n + 1); }
  // icosahedron CT/FT: shallow caps around the vertices.  For k = 1 .. n - 1 the plane perpendicular to a vertex axis at the height where the strip next to the opposite side of a face has the width
  // k / (3 n - 2) of the altitude (n = 2: one quarter).  Such a plane cuts only the five faces that meet in the vertex, so every face gets three strips (one along each side): a rhombus at each
  // corner (two strips overlap), a trapezoid on each side and a triangle in the middle (n = 2: 7 pieces, the same under a turn of 120 degrees).  Only the caps turn (72 degrees).
  function icosactSpec(n) {
    const g = icosaFacets(), va = vertexAxes(g.facets), R = V.len(g.facets[0].verts[0]), vals = [];
    for (let k = 1; k <= n - 1; k++) { const w = k / (3 * n - 2); vals.push(R - (1 - w) * (R - va.O)); }
    const ds = vals.concat(vals.map((x) => -x)).sort((x, y) => y - x);
    const sp = layeredSpec('icosact' + n, g.facets, va.axes.map((u) => ({ u: u, ds: ds })), n, 5, 1 / g.radius, 0.02, 0);
    sp.lines.forEach((l) => { const mid = (l.bands.length - 1) / 2; l.bands = l.bands.filter((bd, i) => i !== mid); });
    return sp;
  }
  // the dodecahedron cut through the centre (one plane per axis): the two halves of every axis turn by 72 degrees
  function dodecaDsSpec(ds) { const g = dodecaFacets(); return layeredSpec('dodecaX', g.facets, oppositePairs(g.facets).map((f) => ({ u: f.normal, ds: ds })), 2, 5, 1 / g.radius, 0.022, 0); }
  function pentultSpec() {
    const g = dodecaFacets();
    return layeredSpec('pentult', g.facets, oppositePairs(g.facets).map((f) => ({ u: f.normal, ds: [0] })), 2, 5, 1 / g.radius, 0.022, 0);
  }
  // Edge-turning tetrahedron (ET): the three axes through the midpoints of opposite edges carry n - 1 parallel cut planes (n = 2: the plane through the centre; the others are equally
  // spaced between -1/2 and 1/2); a slab turns by 180 degrees about its axis (the tetrahedron has this symmetry, so every slab fits back).
  function tetraDsSpec(ds) {
    const T = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], facets = [];
    for (let f = 0; f < 4; f++) facets.push({ verts: [0, 1, 2, 3].filter((i) => i !== f).map((i) => T[i]), normal: V.norm(V.mul(T[f], -1)) });
    return layeredSpec('tetraX', facets, [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((a) => ({ u: a, ds: ds })), 2, 2, 1 / Math.sqrt(3), 0.04, 0);
  }
  function tetraETSpec(n) {
    const T = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]], facets = [];
    for (let f = 0; f < 4; f++) facets.push({ verts: [0, 1, 2, 3].filter((i) => i !== f).map((i) => T[i]), normal: V.norm(V.mul(T[f], -1)) });
    const ds = []; if (n === 2) ds.push(0); else for (let k = 0; k <= n - 2; k++) ds.push(0.5 * (1 - 2 * k / (n - 2)));
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((a) => ({ u: a, ds: ds }));
    return layeredSpec('tetraet' + n, facets, axes, n, 2, 1 / Math.sqrt(3), 0.04, 0);
  }
  // Corner-turning cube (CT): the four body diagonals (vertex - centre - opposite vertex) each carry n - 1 parallel cut planes n.p = d, equally spaced between -1 and 1
  // (n = 2: the one plane through the centre = Skewb; n = 3: the planes at +-1 that cut the eight corners off = Dino Cube, whose faces are split into four right triangles).
  // A slab turns by 120 degrees about its diagonal.
  function cubectSpec(n) {
    const facets = [];
    FACE_ORDER.forEach((nm) => {
      const nn = FACE[nm], u = Math.abs(nn[1]) === 1 ? [1, 0, 0] : [0, 1, 0], w = V.cross(nn, u), P = (a, b) => V.add(nn, V.add(V.mul(u, a), V.mul(w, b)));
      facets.push({ verts: [P(1, 1), P(-1, 1), P(-1, -1), P(1, -1)], normal: nn });
    });
    const ds = []; if (n === 2) ds.push(0); else for (let k = 0; k <= n - 2; k++) ds.push(1 - 2 * k / (n - 2));
    const axes = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((a) => ({ u: V.norm(a), ds: ds.map((d) => d / Math.sqrt(3)) }));
    return layeredSpec('cubect' + n, facets, axes, n, 3, 1 / Math.sqrt(3), 0.04, 0);
  }


  // Rex cube (cube CT-rex): the cube turns about its eight corners like the skewb, but the cuts are spheres: a sphere about a corner whose radius is the edge length for n = 2 (it passes through
  // the three neighbours of the corner), so every face is cut by quarter circles about its four corners (the lens of two spheres about the two ends of a body diagonal looks like "( )").
  // Larger n adds nested spheres (the radii follow the planes of the skewb family).  The surface is tiled by regions of equal "inside which sphere" signature: they are found on a fine grid of
  // the face (a pixel staircase outline, exactly symmetric), turned into stickers and copied to the other five faces.
  // a cube whose surface is cut by spheres (given as {c: centre, r: radius}): the surface is tiled by the regions of equal "inside which sphere" signature (found on a fine grid of a face, their
  // outlines moved onto the true circles); the caller gives the turn axes with their bands (a band = the stickers whose interior point satisfies fn)
  function sphereCubeSpec(name, spheres, mkLines, gap) {
    const SQ3 = Math.sqrt(3), facets = [], stickers = [];
    FACE_ORDER.forEach((nm) => {
      const nn = FACE[nm], u = Math.abs(nn[1]) === 1 ? [1, 0, 0] : [0, 1, 0], w = V.cross(nn, u), P = (a, b) => V.add(nn, V.add(V.mul(u, a), V.mul(w, b)));
      facets.push({ verts: [P(1, 1), P(-1, 1), P(-1, -1), P(1, -1)], normal: nn, u: u, w: w });
    });
    if (!spheres.length) {          // nothing is cut
      facets.forEach((f, fi) => stickers.push({ facet: fi, verts: f.verts.map((v) => v.slice()), pt: f.verts[0].map((x, i) => x * 0.5 + f.normal[i] * 0.5) }));
      return { name: name, facets: facets, stickers: stickers, lines: [], scale: 1 / SQ3, gap: 0.03, loose: true };
    }
    const N = 160, gx = (i) => -1 + 2 * i / N, cx = (i) => -1 + (2 * i + 1) / N;
    // the regions of one face (in its own frame (u, w) with the point  normal + u x + w y): cells of equal "inside which sphere" signature, their outlines moved onto the true circles
    function faceStickers(f, fi) {
      const sig = new Array(N * N), to3 = (a, b) => V.add(f.normal, V.add(V.mul(f.u, a), V.mul(f.w, b)));
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const q = to3(cx(i), cx(j)); let key = '';
        spheres.forEach((s) => { const c = s.c, d2 = (q[0] - c[0]) * (q[0] - c[0]) + (q[1] - c[1]) * (q[1] - c[1]) + (q[2] - c[2]) * (q[2] - c[2]); key += d2 < s.r * s.r ? '1' : '0'; });
        sig[j * N + i] = key;
      }
      const comp = new Int32Array(N * N).fill(-1), regions = [];
      for (let s0 = 0; s0 < N * N; s0++) {
        if (comp[s0] >= 0) continue;
        const id = regions.length, cells = [s0], key = sig[s0]; comp[s0] = id;
        for (let h = 0; h < cells.length; h++) {
          const c = cells[h], i = c % N, j = (c - i) / N;
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((d) => { const a = i + d[0], b = j + d[1]; if (a < 0 || b < 0 || a >= N || b >= N) return; const t = b * N + a; if (comp[t] < 0 && sig[t] === key) { comp[t] = id; cells.push(t); } });
        }
        regions.push(cells);
      }
      const circ = spheres.map((s) => { const dn = 1 - V.dot(s.c, f.normal), r2 = s.r * s.r - dn * dn; return { x: V.dot(s.c, f.u), y: V.dot(s.c, f.w), r: r2 > 1e-9 ? Math.sqrt(r2) : 0 }; });
      function smooth(i, j) {
        const x = gx(i), y = gx(j), sg = [];
        [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]].forEach((q) => { if (q[0] >= 0 && q[1] >= 0 && q[0] < N && q[1] < N) sg.push(sig[q[1] * N + q[0]]); });
        const D = []; for (let b = 0; b < sg[0].length; b++) if (sg.some((s) => s[b] !== sg[0][b]) && circ[b].r > 0) D.push(b);
        const bx = i === 0 || i === N, by = j === 0 || j === N;
        if (bx && by) return [x, y];
        if (D.length === 1) {
          const c = circ[D[0]];
          if (bx) { const t = c.r * c.r - (x - c.x) * (x - c.x); if (t < 0) return [x, y]; const s = Math.sqrt(t), y1 = c.y + s, y2 = c.y - s; return [x, Math.abs(y1 - y) < Math.abs(y2 - y) ? y1 : y2]; }
          if (by) { const t = c.r * c.r - (y - c.y) * (y - c.y); if (t < 0) return [x, y]; const s = Math.sqrt(t), x1 = c.x + s, x2 = c.x - s; return [Math.abs(x1 - x) < Math.abs(x2 - x) ? x1 : x2, y]; }
          const dx = x - c.x, dy = y - c.y, l = Math.hypot(dx, dy) || 1; return [c.x + c.r * dx / l, c.y + c.r * dy / l];
        }
        if (D.length === 2 && !bx && !by) {
          const a = circ[D[0]], b = circ[D[1]], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          if (d < 1e-9 || d > a.r + b.r || d < Math.abs(a.r - b.r)) return [x, y];
          const l = (a.r * a.r - b.r * b.r + d * d) / (2 * d), h2 = a.r * a.r - l * l; if (h2 < 0) return [x, y];
          const h = Math.sqrt(h2), mx = a.x + dx * l / d, my = a.y + dy * l / d, p1 = [mx + h * dy / d, my - h * dx / d], p2 = [mx - h * dy / d, my + h * dx / d];
          return Math.hypot(p1[0] - x, p1[1] - y) < Math.hypot(p2[0] - x, p2[1] - y) ? p1 : p2;
        }
        return [x, y];
      }
      regions.forEach((cells, id) => {
        if (cells.length < 4) return;          // a speck of the grid
        const out = new Map(), add = (a, b, c2, d) => { const kk = a + ',' + b; if (!out.has(kk)) out.set(kk, []); out.get(kk).push([c2, d]); };
        cells.forEach((c) => {
          const i = c % N, j = (c - i) / N, inC = (a, b) => a >= 0 && b >= 0 && a < N && b < N && comp[b * N + a] === id;
          if (!inC(i, j - 1)) add(i, j, i + 1, j); if (!inC(i + 1, j)) add(i + 1, j, i + 1, j + 1); if (!inC(i, j + 1)) add(i + 1, j + 1, i, j + 1); if (!inC(i - 1, j)) add(i, j + 1, i, j);
        });
        let best = null, bestA = -1;
        while (out.size) {
          const k0 = out.keys().next().value, loop = [], parts = k0.split(',').map(Number); let cur = parts;
          for (let guard = 0; guard < 4 * N * N; guard++) {
            loop.push(cur); const kk = cur[0] + ',' + cur[1], l = out.get(kk); if (!l) break;
            const e = l.pop(); if (!l.length) out.delete(kk); cur = e; if (cur[0] === parts[0] && cur[1] === parts[1]) break;
          }
          let A = 0; for (let q = 0; q < loop.length; q++) { const a = loop[q], b = loop[(q + 1) % loop.length]; A += a[0] * b[1] - b[0] * a[1]; }
          if (Math.abs(A) > bestA) { bestA = Math.abs(A); best = loop; }
        }
        const L = best.length, keep = best.filter((q, t) => { const a = best[(t + L - 1) % L], b = best[(t + 1) % L]; return (q[0] - a[0]) * (b[1] - q[1]) - (q[1] - a[1]) * (b[0] - q[0]) !== 0; });
        const sm = keep.map((q) => smooth(q[0], q[1])), res = sm.filter((q, t) => { const o = sm[(t + sm.length - 1) % sm.length]; return Math.hypot(q[0] - o[0], q[1] - o[1]) > 2e-4; });
        const c0 = cells[0], i0 = c0 % N, j0 = (c0 - i0) / N;
        const st = Math.max(1, Math.floor(cells.length / 12)), samp = []; for (let t = 0; t < cells.length; t += st) { const ci = cells[t] % N; samp.push(to3(cx(ci), cx((cells[t] - ci) / N))); }          // interior points of the region (grid cell centres)
        stickers.push({ facet: fi, verts: res.map((q) => to3(q[0], q[1])), pt: to3(cx(i0), cx(j0)), samp: samp, sig: sig[c0] });
      });
    }
    facets.forEach((f, fi) => faceStickers(f, fi));
    return { name: name, facets: facets, stickers: stickers, lines: mkLines(), scale: 1 / SQ3, gap: gap, loose: true, areaC: true };
  }
  function rexSpec(n, ivy) {
    const SQ3 = Math.sqrt(3), H = SQ3, k = 2 / SQ3;
    const pos = []; if (n === 2) pos.push(0); else for (let q = 0; q <= n - 2; q++) { const d = (1 - 2 * q / (n - 2)) / SQ3; if (d > -1e-12) pos.push(Math.max(0, d)); }
    const radii = pos.map((d) => (H - d) * k).sort((a, b) => a - b), corners = [], spheres = [];
    [1, -1].forEach((a) => [1, -1].forEach((b) => [1, -1].forEach((c) => { if (!ivy || a * b * c > 0) corners.push([a, b, c]); })));          // ivy: only one end of every body diagonal (the 4 corners of a tetrahedron)
    corners.forEach((c) => radii.forEach((r) => spheres.push({ c: c, r: r })));
    return sphereCubeSpec('cubectrex' + (ivy ? 'i' : '') + n, spheres, function () {
      const lines = [], INFB = 1e9;
      [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].forEach((a) => {
        const ends = ivy ? [a] : [a, a.map((x) => -x)], bands = [];
        ends.forEach((A) => {
          for (let q = 0; q < radii.length; q++) { const r0 = q ? radii[q - 1] : -1, r1 = radii[q]; bands.push({ lo: INFB, hi: 2 * INFB, name: 'rex', fn: (s) => { const d = Math.hypot(s.pt[0] - A[0], s.pt[1] - A[1], s.pt[2] - A[2]); return d >= r0 && d < r1; } }); }
        });
        lines.push({ axis: V.norm(a), n: 3, bands: bands });
      });
      return lines;
    }, 0.02);
  }
  // Curvy clover (cube ET with spherical cuts): a sphere about every edge midpoint pushed out by the factor a (a = 1: clover, the radius is half an edge, every face is cut into 8 pieces; a > 1: curvy, the
  // centre is outside the cube and the sphere still passes through the centres of the two faces at the edge, so the circles on a face meet in its centre; 12 pieces).  The ball about an edge turns by 180 degrees.
  function cloverSpec(a, n) {
    const R = Math.hypot(a - 1, a), dist = (a - 1) * Math.SQRT2, edges = [], spheres = [], radii = [];
    for (let q = 1; q <= n - 1; q++) { const r = R * q / (n - 1); if (r > dist + 0.05) radii.push(r); }          // concentric shells (nested balls) about every edge: n = 2 is the single ball
    [[1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]].forEach((e) => { edges.push(e); edges.push(e.map((x) => -x)); });
    edges.forEach((e) => radii.forEach((r) => spheres.push({ c: e.map((x) => x * a), r: r })));
    const spec = sphereCubeSpec('cubeetcc' + a + 'n' + n, spheres, function () {
      const lines = [], INFB = 1e9;
      [[1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]].forEach((e) => {
        const bands = [];
        [e, e.map((x) => -x)].forEach((M) => { for (let q = 0; q < radii.length; q++) { const r0 = q ? radii[q - 1] : -1, r1 = radii[q]; bands.push({ lo: INFB, hi: 2 * INFB, name: 'cc', fn: (s) => { const d = Math.hypot(s.pt[0] - M[0] * a, s.pt[1] - M[1] * a, s.pt[2] - M[2] * a); return d >= r0 && d < r1; } }); } });
        lines.push({ axis: V.norm(e), n: 2, bands: bands });
      });
      return lines;
    }, 0.02);
    spec.info = { a: a, R: R, radii: radii, spheres: spheres, axes: [[1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]] };          // for the 3D piece engine (heli.html)
    return spec;
  }
  // Redi cube (cube CT-redi): corner turning with planar cuts.  D = floor(n / 2) caps per corner A (n = 2: 1, 4: 2, 6: 3; odd n like the even n below it but with a square in the middle of every face).  The cube has D + 2 layers
  // per side (grid planes at -1 + 2 i / (D + 2), h = 2 / (D + 2)); cap k = 0 .. D - 1 is {A_i x_i >= -1 + h + k h for the three coordinates} cut by the diagonal plane A.x >= 1 + (k + e) h (e = 0 for an even n, 1/2 for an odd n):
  // the farthest diagonal plane (s = 1, through the centres of the three faces at the corner) starts nearer than the opposite end, the others follow one layer apart towards the corner.  n = 2: every face has four corner squares
  // and four pentagons (an edge square of the 3 x 3 grid joined with the triangle of the X-split centre pointing at it), a turn moves a corner with its three edges (on a face one square and two pentagons); with an odd n
  // the four diagonal lines near the face centre make a square instead of the X.  The stickers are the regions of equal "inside which cap" signature (exact: the face is cut by all the boundary lines, equal cells are merged);
  // the nested caps give the shells cap k without cap k + 1.  A sticker belongs to a band by its interior point.
  function rediSpec(n) {
    const facets = [], stickers = [], caps = [], EPSG = 1e-9;
    FACE_ORDER.forEach((nm) => {
      const nn = FACE[nm], u = Math.abs(nn[1]) === 1 ? [1, 0, 0] : [0, 1, 0], w = V.cross(nn, u), P = (a, b) => V.add(nn, V.add(V.mul(u, a), V.mul(w, b)));
      facets.push({ verts: [P(1, 1), P(-1, 1), P(-1, -1), P(1, -1)], normal: nn, u: u, w: w });
    });
    const corners = []; [1, -1].forEach((a) => [1, -1].forEach((b) => [1, -1].forEach((c) => corners.push([a, b, c]))));
    const D = n >= 2 ? Math.floor(n / 2) : 0, hh = 2 / (D + 2), odd = n % 2 === 1, capOf = (A, k) => ({ A: A, b: -1 + hh + k * hh, s: 1 + (k + (odd ? 0.5 : 0)) * hh });          // D caps per corner (0 is the largest): D + 2 layers, the grid plane and the diagonal plane move towards the corner by one layer per step; an odd n shifts the diagonals by half a layer (a square in the middle of every face)
    if (D >= 1) corners.forEach((A, ci) => { for (let k = 0; k < D; k++) caps.push(capOf(A, k)); });
    const inCap = (c, p) => c.A[0] * p[0] >= c.b - EPSG && c.A[1] * p[1] >= c.b - EPSG && c.A[2] * p[2] >= c.b - EPSG && c.A[0] * p[0] + c.A[1] * p[1] + c.A[2] * p[2] >= c.s - EPSG;
    const polyArea2 = (q) => { let s = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
    function splitBy(poly, A, B, C) {          // the parts of a convex polygon with A x + B y + C > 0 and < 0
      const pos = [], neg = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], sp = A * p[0] + B * p[1] + C, sq = A * q[0] + B * q[1] + C;
        if (sp >= -1e-12) pos.push(p); if (sp <= 1e-12) neg.push(p);
        if ((sp > 1e-12 && sq < -1e-12) || (sp < -1e-12 && sq > 1e-12)) { const t = sp / (sp - sq), r = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; pos.push(r); neg.push(r); }
      }
      return [pos, neg];
    }
    facets.forEach((f, fi) => {
      const to3 = (a, b) => V.add(f.normal, V.add(V.mul(f.u, a), V.mul(f.w, b)));
      if (!caps.length) { stickers.push({ facet: fi, verts: f.verts.map((v) => v.slice()), pt: to3(0.5, 0.5) }); return; }
      // the lines of all the cap boundaries on this face
      const lines = [], seen = new Set();
      const addLine = (nu, h) => { const A = V.dot(nu, f.u), B = V.dot(nu, f.w), C = V.dot(nu, f.normal) - h, l = Math.hypot(A, B); if (l < 1e-9) return; const a = A / l, b = B / l, c = C / l, key = [a, b, c].map((x) => Math.round(x * 1e6 + 0.37)).join(','), key2 = [-a, -b, -c].map((x) => Math.round(x * 1e6 + 0.37)).join(','); if (seen.has(key) || seen.has(key2)) return; seen.add(key); lines.push([a, b, c]); };
      caps.forEach((c) => { for (let i = 0; i < 3; i++) { const nu = [0, 0, 0]; nu[i] = c.A[i]; addLine(nu, c.b); } addLine(c.A, c.s); });
      let cells = [[[1, 1], [-1, 1], [-1, -1], [1, -1]]];
      lines.forEach((L) => { const next = []; cells.forEach((cl) => { const s = splitBy(cl, L[0], L[1], L[2]); if (s[0].length >= 3 && s[1].length >= 3 && Math.abs(polyArea2(s[0])) > 1e-9 && Math.abs(polyArea2(s[1])) > 1e-9) next.push(s[0], s[1]); else next.push(cl); }); cells = next; });
      const cen = cells.map((cl) => { let x = 0, y = 0; cl.forEach((q) => { x += q[0] / cl.length; y += q[1] / cl.length; }); return [x, y]; });
      const sig = cells.map((cl, i) => { const p = to3(cen[i][0], cen[i][1]); return caps.map((c) => (inCap(c, p) ? '1' : '0')).join(''); });
      // equal neighbouring cells (sharing an edge) are one sticker
      const qk = (q) => Math.round(q[0] * 1e6 + 0.37) + ',' + Math.round(q[1] * 1e6 + 0.37), edgeOwner = new Map();
      cells.forEach((cl, i) => { for (let t = 0; t < cl.length; t++) { const a = qk(cl[t]), b = qk(cl[(t + 1) % cl.length]); edgeOwner.set(a + '>' + b, i); } });
      const comp = new Array(cells.length).fill(-1), groups = [];
      for (let i0 = 0; i0 < cells.length; i0++) {
        if (comp[i0] >= 0) continue; const id = groups.length, mem = [i0]; comp[i0] = id;
        for (let h = 0; h < mem.length; h++) { const cl = cells[mem[h]]; for (let t = 0; t < cl.length; t++) { const a = qk(cl[t]), b = qk(cl[(t + 1) % cl.length]), o = edgeOwner.get(b + '>' + a); if (o !== undefined && comp[o] < 0 && sig[o] === sig[i0]) { comp[o] = id; mem.push(o); } } }
        groups.push(mem);
      }
      groups.forEach((mem) => {
        const inG = new Set(mem), out = new Map();
        mem.forEach((i) => { const cl = cells[i]; for (let t = 0; t < cl.length; t++) { const a = cl[t], b = cl[(t + 1) % cl.length], o = edgeOwner.get(qk(b) + '>' + qk(a)); if (o !== undefined && inG.has(o)) continue; const k = qk(a); if (!out.has(k)) out.set(k, []); out.get(k).push([a, b]); } });
        let best = null, bestA = -1;
        while (out.size) {
          const k0 = out.keys().next().value, first = out.get(k0)[0][0], loop = []; let cur = first;
          for (let guard = 0; guard < 10000; guard++) { loop.push(cur); const l = out.get(qk(cur)); if (!l) break; const e = l.pop(); if (!l.length) out.delete(qk(cur)); cur = e[1]; if (qk(cur) === qk(first)) break; }
          const ar = Math.abs(polyArea2(loop)); if (ar > bestA) { bestA = ar; best = loop; }
        }
        const L = best.length, keep = best.filter((q, t) => { const a = best[(t + L - 1) % L], b = best[(t + 1) % L]; return Math.abs((q[0] - a[0]) * (b[1] - q[1]) - (q[1] - a[1]) * (b[0] - q[0])) > 1e-9; });
        let bi = mem[0], ba = -1; mem.forEach((i) => { const ar = Math.abs(polyArea2(cells[i])); if (ar > ba) { ba = ar; bi = i; } });
        stickers.push({ facet: fi, verts: keep.map((q) => to3(q[0], q[1])), pt: to3(cen[bi][0], cen[bi][1]) });
      });
    });
    const lines = [], INFB = 1e9;
    if (caps.length) [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].forEach((a) => {
      const bands = [];
      [a, a.map((x) => -x)].forEach((A) => { for (let k = 0; k < D; k++) { const cj = capOf(A, k), cn = k < D - 1 ? capOf(A, k + 1) : null; bands.push({ lo: INFB, hi: 2 * INFB, name: 'redi', fn: (s) => inCap(cj, s.pt) && !(cn && inCap(cn, s.pt)) }); } });
      lines.push({ axis: V.norm(a), n: 3, bands: bands });
    });
    return { name: 'cubectredi' + n, facets: facets, stickers: stickers, lines: lines, scale: 1 / Math.sqrt(3), gap: 0.04, loose: true };
  }
  // Penrose cube (cube FT-penrose): the ordinary cube (the same moves, the same solver) with three colours: every colour is on two neighbouring faces (U+R, F+D, L+B: the three joining edges are skew to each
  // other) and these three edges are rounded (fillet).  The rounding is only in the drawing: the slots keep their flat centres (the permutations are those of the cube), the identity of a sticker is still the face
  // it belongs to (the solver needs it), only the palette shows the pairs in one colour.
  function penroseSpec(nl) {
    const sp = cubeSpec(nl), H = nl, r = 0.3 * nl, PAIRS = [['U', 'R'], ['F', 'D'], ['L', 'B']], partner = {}, axisOf = (nm) => { const v = FACE[nm], a = v[0] ? 0 : v[1] ? 1 : 2; return [a, v[a]]; };
    PAIRS.forEach((pr) => { partner[pr[0]] = pr[1]; partner[pr[1]] = pr[0]; });
    const sOf = (pt, X, Y) => H - Y[1] * pt[Y[0]];          // distance from the rounded edge along the face X
    const bend = (pt, X, Y) => { const s = sOf(pt, X, Y); if (s >= r - 1e-9) return pt.slice(); const u = Math.PI / 4 * (1 - s / r), q = pt.slice(); q[X[0]] = X[1] * (H - r + r * Math.cos(u)); q[Y[0]] = Y[1] * (H - r + r * Math.sin(u)); return q; };
    const refine = (poly, X, Y) => {          // points on the edges of the polygon where the distance to the rounded edge passes r, 3/4 r, 1/2 r, 1/4 r
      const out = [];
      poly.forEach((p0, i) => {
        const q0 = poly[(i + 1) % poly.length], s0 = sOf(p0, X, Y), s1 = sOf(q0, X, Y), ts = [];
        out.push(p0);
        if (Math.abs(s0 - s1) > 1e-9) [1, 0.75, 0.5, 0.25].forEach((L) => { const t = (s0 - L * r) / (s0 - s1); if (t > 1e-9 && t < 1 - 1e-9) ts.push(t); });
        ts.sort((a, b) => a - b).forEach((t) => out.push([p0[0] + (q0[0] - p0[0]) * t, p0[1] + (q0[1] - p0[1]) * t, p0[2] + (q0[2] - p0[2]) * t]));
      });
      return out;
    };
    // the faces at the two ends of a rounded edge meet it at right angles: their corner there is rounded too (a quarter circle of the same radius)
    const corners = [];          // {fname: [corner (axis, sign) pair]}
    PAIRS.forEach((pr) => { const X = axisOf(pr[0]), Y = axisOf(pr[1]), c = 3 - X[0] - Y[0]; [1, -1].forEach((sc) => { const v = [0, 0, 0]; v[c] = sc; const nm = FACE_ORDER.find((f) => FACE[f][c] === sc); corners.push({ nm: nm, X: X, Y: Y }); }); });
    const cornerUV = (q, C) => [C.X[1] * q[C.X[0]] - (H - r), C.Y[1] * q[C.Y[0]] - (H - r)];
    const roundCorner = (q, C) => { const uv = cornerUV(q, C), u = uv[0], v = uv[1]; if (u <= 1e-9 || v <= 1e-9) return q.slice(); const f = Math.max(u, v) / Math.hypot(u, v), o = q.slice(); o[C.X[0]] = C.X[1] * (H - r + u * f); o[C.Y[0]] = C.Y[1] * (H - r + v * f); return o; };
    const refineCorner = (poly, C) => {          // an edge that reaches into the corner square is cut into 8 pieces so that the rounded outline is smooth
      const out = [];
      poly.forEach((p0, i) => {
        const q0 = poly[(i + 1) % poly.length], a = cornerUV(p0, C), b = cornerUV(q0, C); out.push(p0);
        if (Math.max(a[0], b[0]) > 1e-9 && Math.max(a[1], b[1]) > 1e-9) for (let t = 1; t < 8; t++) out.push([p0[0] + (q0[0] - p0[0]) * t / 8, p0[1] + (q0[1] - p0[1]) * t / 8, p0[2] + (q0[2] - p0[2]) * t / 8]);
      });
      return out;
    };
    const round = (poly, nm) => {
      const X = axisOf(nm), Y = axisOf(partner[nm]); let v = refine(poly, X, Y).map((q) => bend(q, X, Y));
      corners.forEach((C) => { if (C.nm === nm) v = refineCorner(v, C).map((q) => roundCorner(q, C)); });
      return v;
    };
    const facets = sp.facets.map((f, i) => { const nm = FACE_ORDER[i]; let v = round(f.verts, nm); const X = axisOf(nm), Y = axisOf(partner[nm]), k0 = v.findIndex((q) => sOf(q, X, Y) >= r - 1e-9 && !corners.some((C) => C.nm === nm && cornerUV(q, C)[0] > 1e-9 && cornerUV(q, C)[1] > 1e-9)); if (k0 > 0) v = v.slice(k0).concat(v.slice(0, k0)); return { verts: v, normal: f.normal }; });          // the dark body is rounded too (its first corner stays flat: it fixes the plane)
    const stickers = sp.stickers.map((s) => ({ facet: s.facet, verts: round(s.verts, FACE_ORDER[s.facet]), flat: s.verts }));
    return { name: 'penrose' + nl, facets: facets, stickers: stickers, lines: sp.lines, scale: sp.scale, gap: sp.gap };
  }
  const PENROSE_COLOURS = ['#d91e18', '#d91e18', '#1f4fd8', '#1f4fd8', '#ffd400', '#ffd400'];          // U R F D L B: the pairs U+R, F+D, L+B
  function penroseExtras(n) {
    return function (P) {
      if (n === 3) cubeExtras(P);
      const pairOf = [0, 0, 1, 1, 2, 2];          // the solved state: the two faces of a pair show one colour (the engine itself needs the identity, so the check is here)
      P.isSolved = function (col) {
        for (let g = 0; g < 3; g++) for (let q = 0; q < 2; q++) { const f = g * 2 + q, l = P.facetStk[f]; for (let t = 0; t < l.length; t++) if (pairOf[col[l[t]]] !== g) return false; }
        return true;
      };
    };
  }
  // Pandora cube (cube FT-pandora, n >= 3): only the shapes change, the cube (the same moves, the same solver for n = 3) stays.  The faces are not divided in equal parts.  On a face (side 2): the blocks at the corners
  // extend to the midpoints of the sides (right triangles (1,1) (0,1) (1,0), legs 1); the blocks on the edge of the face between the corners lose the length of their outer side (it is squashed to a point, the midpoint of
  // the side: n - 2 triangles around every midpoint, their bases divide a side of the middle square into n - 2 equal parts); the blocks that do not touch the edge of the face stay squares: they fill the middle square
  // [-1/2, 1/2]^2 ((n - 2) x (n - 2) of them).  Everything fills the face exactly.  The slots keep their flat centres (the permutations are those of the cube), a piece keeps its type, so a piece moves to a place of the same shape.
  function pandoraSpec(nl) {
    const sp = cubeSpec(nl); if (nl < 3) return sp;
    const stickers = [], m = nl - 2, q = (k) => -0.5 + k / m;
    FACE_ORDER.forEach((nm, fi) => {
      const n = FACE[nm], t = Math.abs(n[1]) === 1 ? [1, 0, 0] : [0, 1, 0], u = t, w = V.cross(n, u), c0 = V.mul(n, nl);
      const P = (a, b) => V.add(c0, V.add(V.mul(u, nl * a), V.mul(w, nl * b)));          // a, b in -1 .. 1
      for (let i = 0; i < nl; i++) for (let j = 0; j < nl; j++) {
        const flat = sp.stickers[fi * nl * nl + i * nl + j].verts, ci = i === 0 || i === nl - 1, cj = j === 0 || j === nl - 1; let pts;
        if (ci && cj) { const sa = i === 0 ? -1 : 1, sb = j === 0 ? -1 : 1; pts = [[sa, sb], [0, sb], [sa, 0]]; }
        else if (!ci && !cj) pts = [[q(i - 1), q(j - 1)], [q(i), q(j - 1)], [q(i), q(j)], [q(i - 1), q(j)]];
        else if (cj) { const sb = j === 0 ? -1 : 1; pts = [[0, sb], [q(i - 1), sb * 0.5], [q(i), sb * 0.5]]; }
        else { const sa = i === 0 ? -1 : 1; pts = [[sa, 0], [sa * 0.5, q(j - 1)], [sa * 0.5, q(j)]]; }
        stickers.push({ facet: fi, verts: pts.map((r) => P(r[0], r[1])), flat: flat });
      }
    });
    return { name: 'pandora' + nl, facets: sp.facets, stickers: stickers, lines: sp.lines, scale: sp.scale, gap: sp.gap, loose: true };
  }
  const CURVY_A = 1.5;          // the centres of the curvy spheres: 1.5 times as far out as the edge midpoints (x = +-1: centre (-1.5, 0)); the circle passes through the face centre
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
  [2, 4, 6, 7].forEach(function (n) {
    META['cube' + n] = { key: 'cube' + n, spec: function () { return cubeSpec(n); }, extras: n === 2 ? cube2Extras : null, scramble: { 2: 15, 4: 45, 6: 80, 7: 100 }[n], solver: n === 2 ? 'table' : 'history', view: { yaw: 0.55, pitch: 0.5 }, colours: META.cube.colours };
  });
  META.heli = { key: 'heli', spec: heliSpec, extras: null, scramble: 24, solver: 'history', view: { yaw: 0.55, pitch: 0.5 }, colours: META.cube.colours };
  META.pentult = { key: 'pentult', spec: pentultSpec, extras: null, scramble: 40, solver: 'history', view: { yaw: 0.4, pitch: 0.35 }, colours: META.dodeca.colours };
  META.pyramorphix = { key: 'pyramorphix', spec: function () { return tetraETSpec(2); }, extras: null, scramble: 14, solver: 'history', view: META.tetra.view, colours: META.tetra.colours };
  META.rex = { key: 'rex', spec: function () { return rexSpec(2); }, extras: null, scramble: 25, solver: 'history', view: { yaw: 0.55, pitch: 0.5 }, colours: META.cube.colours };
  META.ivy = { key: 'ivy', spec: function () { return rexSpec(2, true); }, extras: null, scramble: 25, solver: 'history', view: { yaw: 0.55, pitch: 0.5 }, colours: META.cube.colours };
  META.clover = { key: 'clover', spec: function () { return cloverSpec(1, 2); }, extras: null, scramble: 25, solver: 'history', view: { yaw: 0.55, pitch: 0.5 }, colours: META.cube.colours };
  META.curvy = { key: 'curvy', spec: function () { return cloverSpec(CURVY_A, 2); }, extras: null, scramble: 25, solver: 'history', view: { yaw: 0.55, pitch: 0.5 }, colours: META.cube.colours };
  META.redi = { key: 'redi', spec: function () { return rediSpec(2); }, extras: null, scramble: 25, solver: 'history', view: { yaw: 0.55, pitch: 0.5 }, colours: META.cube.colours };
  META.penrose = { key: 'penrose', spec: function () { return penroseSpec(3); }, extras: penroseExtras(3), scramble: 25, solver: 'kociemba', view: { yaw: 0.55, pitch: 0.5 }, colours: PENROSE_COLOURS, topo: 'cubepenrose', size: 3, trivial: false };
  META.pandora = { key: 'pandora', spec: function () { return pandoraSpec(3); }, extras: cubeExtras, scramble: 25, solver: 'kociemba', view: { yaw: 0.55, pitch: 0.5 }, colours: META.cube.colours, topo: 'cubepandora', size: 3, trivial: false };
  META.skewb = { key: 'skewb', spec: skewbSpec, extras: null, scramble: 25, solver: 'history', view: { yaw: 0.55, pitch: 0.5 }, colours: META.cube.colours };
  META.icosa = { key: 'icosa', spec: function () { return icosaSpec(ICOSA_H); }, extras: null, scramble: 40, solver: 'history', view: { yaw: 0.4, pitch: 0.3 },
    colours: ['#f2f2f2', '#ffd400', '#d41f26', '#ff7f0e', '#0f9d58', '#1a4fd6', '#7b2fbe', '#ff78b4', '#9be000', '#00c2d6', '#8c8c8c', '#9c5a2e', '#0b1f6b', '#00796b', '#7a0f2e', '#e6c88f', '#2b2b2b', '#b9a6ff', '#6b7a00', '#8fd0ff'] };
  // ---------------- custom puzzles: topology + size ----------------
  // ---------------- cuboidff: a x b x c cells, face turning ----------------
  // The layers of an axis (perpendicular slabs of one cell) turn by 90 degrees only when their section is a square (the other two sizes are equal), otherwise only by 180 degrees: a
  // rectangular slab does not fit back after a quarter turn.  An axis with one layer is the whole puzzle (not a move).
  function cuboidSpec(a, b, c) {
    const dim = [a, b, c], facets = [], stickers = [];
    FACE_ORDER.forEach((nm, fi) => {
      const nv = FACE[nm], ax = nv[0] ? 0 : nv[1] ? 1 : 2, t = [0, 1, 2].filter((i) => i !== ax), U = [0, 0, 0], W = [0, 0, 0]; U[t[0]] = 1; W[t[1]] = 1;
      const c0 = V.mul(nv, dim[ax]), hu = dim[t[0]], hw = dim[t[1]], cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      facets.push({ verts: cs.map((q) => V.add(c0, V.add(V.mul(U, hu * q[0]), V.mul(W, hw * q[1])))), normal: nv });
      for (let i = 0; i < hu; i++) for (let j = 0; j < hw; j++) {
        const ce = V.add(c0, V.add(V.mul(U, 2 * i - (hu - 1)), V.mul(W, 2 * j - (hw - 1))));
        stickers.push({ facet: fi, verts: cs.map((q) => V.add(ce, V.add(V.mul(U, q[0]), V.mul(W, q[1])))) });
      }
    });
    const lines = [];
    [0, 1, 2].forEach((ax) => {
      const L = dim[ax]; if (L < 2) return;
      const o = [0, 1, 2].filter((i) => i !== ax), order = dim[o[0]] === dim[o[1]] ? 4 : 2, bounds = []; for (let k = 0; k < L - 1; k++) bounds.push(-(L - 2) + 2 * k);
      const bands = [{ lo: bounds[L - 2], hi: INF }]; for (let k = L - 2; k > 0; k--) bands.push({ lo: bounds[k - 1], hi: bounds[k] }); bands.push({ lo: -INF, hi: bounds[0] });
      const axv = [0, 0, 0]; axv[ax] = 1; lines.push({ axis: axv, n: order, bands: bands });
    });
    return { name: 'cuboidff' + a + b + c, facets: facets, stickers: stickers, lines: lines, scale: 1 / Math.sqrt(a * a + b * b + c * c), gap: 0.07 };
  }
  const CUBOID_THEMES = { '1,1,2': 'cuboid112', '1,3,3': 'cuboid133', '2,2,3': 'cuboid223', '2,2,4': 'cuboid224' };
  function cuboidMeta(key, a, b, c) {
    if (!META[key]) META[key] = { key: key, spec: function () { return cuboidSpec(a, b, c); }, extras: null, scramble: Math.min(250, 15 + 6 * (a + b + c)), solver: 'history', view: META.cube.view, colours: META.cube.colours, topo: 'cuboidff', size: a, trivial: false };
    return key;
  }
  Object.keys(CUBOID_THEMES).forEach((k) => { const d = k.split(',').map(Number); cuboidMeta(CUBOID_THEMES[k], d[0], d[1], d[2]); });
  // key of an a x b x c cuboid (the sizes in any order); equal sizes are the ordinary cube (111 = its easter egg)
  function cuboidKey(abc) {
    const d = (Array.isArray(abc) ? abc : String(abc).split(/[^0-9]+/).filter((x) => x !== '')).map((x) => Math.floor(+x));
    if (d.length !== 3 || d.some((x) => !(x >= 1) || !isFinite(x))) return null;
    d.sort((x, y) => x - y);
    if (d[0] === d[2]) return customKey('cube', d[0]);
    const th = CUBOID_THEMES[d.join(',')]; if (th) return th;
    return cuboidMeta('x:cuboidff:' + d.join(':'), d[0], d[1], d[2]);
  }
  // key of an extended cuboid (the whole is a cube cut into a, b, c layers along the axes: the cells are bricks); equal sizes are the ordinary cube
  function cuboidXKey(abc) {
    const d = (Array.isArray(abc) ? abc : String(abc).split(/[^0-9]+/).filter((x) => x !== '')).map((x) => Math.floor(+x));
    if (d.length !== 3 || d.some((x) => !(x >= 1) || !isFinite(x))) return null;
    d.sort((x, y) => x - y);
    return d[0] === d[2] ? customKey('cube', d[0]) : 'x:cuboidx:' + d.join(':');
  }
  const TOPOS = ['tetra', 'tetraet', 'cube', 'cubectrex', 'cubeetclover', 'cubemix', 'cubefisher', 'cuboidff', 'cuboidx', 'cubeet', 'starft', 'starct', 'skewbult', 'qjdodeca', 'octa', 'octact', 'octaet', 'dodeca', 'dodecadc', 'dodecact', 'dodecaet', 'icosact', 'icosadc', 'icosaet', 'cubect', 'square'];
  META.chopasaurus = { key: 'chopasaurus', spec: function () { return dodecactSpec(2); }, extras: null, scramble: 40, solver: 'history', view: META.dodeca.view, colours: META.dodeca.colours };
  META.icosamate = { key: 'icosamate', spec: function () { return icosadcSpec(2); }, extras: null, scramble: 40, solver: 'history', view: META.icosa.view, colours: META.icosa.colours };
  META.icosaminx = { key: 'icosaminx', spec: function () { return icosactSpec(2); }, extras: null, scramble: 40, solver: 'history', view: META.icosa.view, colours: META.icosa.colours };
  const MINN = { cubemirror: 3, cubepandora: 3, cubepenrose: 2, cubewindmill: 3, cubectredi: 2, cubeetclover: 2, cubeetcurvy: 2, cubectivy: 2, cubectrex: 2, cubemix: 3, cubefisher: 2, starft: 2, starct: 2, skewbult: 2, qjdodeca: 2, cuboidx: 1, cuboidff: 1, icosadc: 2, dodecact: 2, dodecaet: 2, icosact: 2, icosaet: 2, dodecadc: 2, tetra: 2, tetraet: 2, octact: 3, octaet: 2, cube: 2, cubeet: 2, octa: 2, dodeca: 2, cubect: 2, square: -1 };
  const MAXN = { cubemirror: Infinity, cubepandora: Infinity, cubepenrose: Infinity, cubewindmill: 3, cubectredi: Infinity, cubeetclover: Infinity, cubeetcurvy: Infinity, cubectivy: Infinity, cubectrex: Infinity, cubemix: Infinity, cubefisher: Infinity, starft: Infinity, starct: Infinity, skewbult: Infinity, qjdodeca: Infinity, cuboidx: Infinity, cuboidff: Infinity, icosadc: Infinity, dodecact: Infinity, dodecaet: Infinity, icosact: Infinity, icosaet: Infinity, dodecadc: Infinity, tetra: Infinity, tetraet: Infinity, octact: Infinity, octaet: Infinity, cube: Infinity, cubeet: Infinity, octa: Infinity, dodeca: Infinity, cubect: Infinity, square: Infinity };      // no upper limit on the size
  const BUILTIN = { cubemirror: { 3: 'mirror' }, cubepandora: { 3: 'pandora' }, cubepenrose: { 3: 'penrose' }, cubewindmill: { 3: 'windmill' }, cubectredi: { 2: 'redi' }, cubeetclover: { 2: 'clover' }, cubeetcurvy: { 2: 'curvy' }, cubectivy: { 2: 'ivy' }, cubectrex: { 2: 'rex' }, cubemix: { 3: 'mixup' }, cubefisher: { 3: 'fisher' }, starft: { 2: 'starminxft' }, starct: { 2: 'starminxct' }, skewbult: { 2: 'skewbult' }, qjdodeca: { 2: 'qjdodeca' }, cuboidx: {}, cuboidff: {}, cube: { 2: 'cube2', 3: 'cube', 4: 'cube4', 5: 'cube5', 6: 'cube6', 7: 'cube7' }, tetra: { 3: 'tetra' }, tetraet: { 2: 'pyramorphix' }, octact: {}, octaet: {}, dodecadc: { 2: 'pentult' }, dodecact: { 2: 'chopasaurus' }, dodecaet: { 2: 'bigchop' }, icosact: { 2: 'icosaminx' }, icosadc: { 2: 'icosamate' }, icosaet: {}, octa: { 3: 'octa' }, cubect: { 2: 'skewb' }, dodeca: { 3: 'dodeca' }, square: { 1: 'sq1' }, cubeet: { 2: 'chop', 3: 'heli' } };
  const BASE = { tetra: 'tetra', tetraet: 'tetra', octact: 'octa', octaet: 'octa', dodecadc: 'dodeca', dodecact: 'dodeca', dodecaet: 'dodeca', icosact: 'icosa', icosadc: 'icosa', icosaet: 'icosa', cube: 'cube', octa: 'octa', dodeca: 'dodeca', cubect: 'skewb', cubectrex: 'skewb', cubectivy: 'skewb', cubeetclover: 'cube', cubeetcurvy: 'cube', cubectredi: 'skewb', cubepandora: 'cube' };
  const SPECS = { cubepandora: pandoraSpec, cubectredi: rediSpec, cubeetclover: function (n) { return cloverSpec(1, n); }, cubeetcurvy: function (n) { return cloverSpec(CURVY_A, n); }, cubectivy: function (n) { return rexSpec(n, true); }, cubectrex: rexSpec, tetra: tetraSpec, tetraet: tetraETSpec, dodecadc: dodecaDeepSpec, cube: cubeSpec, octa: octaSpec, dodeca: dodecaNSpec, icosact: icosactSpec, icosadc: icosadcSpec, octact: octactSpec, dodecact: dodecactSpec, cubect: cubectSpec };
  // key of the puzzle for a topology and a size: a built-in key when the combination exists (with its own solver), else a generated 'x:topo:n'
  // Square-n: n = -1 (2 pieces), 0 (4), 0.5 (6) or an integer of 1 or more (4 (n + 1) pieces); every other value is refused
  function squareOk(n) { return n === -1 || n === 0 || n === 0.5 || (Number.isInteger(n) && n >= 1); }
  function customKey(topo, n) {
    if (topo === 'cuboidff') return cuboidKey(n);
    if (topo === 'cuboidx') return cuboidXKey(n);
    if (topo === 'cubepenrose') {
      n = Math.floor(+n); if (!isFinite(n) || !(n >= 2 || n === 1)) return null;
      if (n === 3) return 'penrose';
      const key = 'x:cubepenrose:' + n;
      if (!META[key]) META[key] = { key: key, spec: function () { return penroseSpec(n); }, extras: penroseExtras(n), scramble: n === 1 ? 1 : Math.min(250, 20 + 10 * (n - 3)), solver: 'history', view: { yaw: 0.55, pitch: 0.5 }, colours: PENROSE_COLOURS, topo: 'cubepenrose', size: n, trivial: n < 2 };
      return key;
    }
    n = topo === 'square' ? +n : Math.floor(+n);
    if ((TOPOS.indexOf(topo) < 0 && topo !== 'cubectivy' && topo !== 'cubectredi' && topo !== 'cubewindmill' && topo !== 'cubepandora' && topo !== 'cubemirror' && topo !== 'cubeetcurvy') || !isFinite(n)) return null;
    if (topo === 'cubemix' && n % 2 === 0) return null;          // the mixup cube: odd sizes only
    if (topo === 'square') { if (!squareOk(n)) return null; }
    else if (!(n >= MINN[topo] || n === 1 || (n === 2 && (topo === 'octact' || topo === 'icosact'))) || n > MAXN[topo]) return null;          // n = 1 (below the minimum) is an easter egg: an unscrambled puzzle that is solved at once
    if (BUILTIN[topo][n]) return BUILTIN[topo][n];
    if (topo === 'dodeca' && n % 2 === 0) return 'x:dodeca:' + n;          // the even sizes (pentagram faces with gaps) are modelled by the 3D piece engine (heli.html, face turns only)
    const key = 'x:' + topo + ':' + n;
    if (topo === 'square' || topo === 'cubemix' || topo === 'cubefisher' || topo === 'cubewindmill' || topo === 'cubemirror' || topo === 'starft' || topo === 'starct' || topo === 'skewbult' || topo === 'qjdodeca' || topo === 'cubeet' || topo === 'tetraet' || topo === 'octaet' || topo === 'dodecaet' || topo === 'icosaet') return key;        // Square-n (sq1.html) and the edge-turning cube (heli.html) have their own pages and engines
    if (!META[key]) {
      const bm = META[BASE[topo]];
      META[key] = { key: key, spec: function () { return SPECS[topo](n); }, extras: null, scramble: topo === 'cube' ? Math.min(250, 20 + 10 * (n - 3)) : Math.max(25, Math.min(300, Math.round(n * (topo === 'tetra' ? 12 : topo === 'octa' ? 10 : 24)))),
        solver: 'history', view: bm.view, colours: bm.colours, topo: topo, size: n, trivial: n < MINN[topo] };
    }
    return key;
  }
  function parseKey(key) { const mc = /^x:cuboidff:(\d+):(\d+):(\d+)$/.exec(key || ''); if (mc) return { topo: 'cuboidff', n: +mc[1], abc: [+mc[1], +mc[2], +mc[3]] }; const mx = /^x:cuboidx:(\d+):(\d+):(\d+)$/.exec(key || ''); if (mx) return { topo: 'cuboidx', n: +mx[1], abc: [+mx[1], +mx[2], +mx[3]] }; const m = /^x:(\w+):(-?\d+(?:\.\d+)?)$/.exec(key || ''); return m ? { topo: m[1], n: +m[2] } : null; }
  // display name of a custom puzzle (KO / EN)
  function nameOf(key, ko) {
    const p = parseKey(key); if (!p) return null;
    const T = ko ? { dodecact: '정십이면체CT', dodecaet: '정십이면체ET', icosact: '정이십면체CT/FT', icosadc: '정이십면체CT/FT-Deepcut', icosaet: '정이십면체ET', dodecadc: '정십이면체FT-Deepcut', octact: '정팔면체CT', octaet: '정팔면체ET', tetraet: '정사면체ET', tetra: '정사면체FT/CT', cube: '큐브', octa: '정팔면체FT', dodeca: '정십이면체FT', cubect: '정육면체CT', square: '스퀘어', cubeet: '정육면체ET', cubectrex: '정육면체CT-rex', cubectivy: '정육면체CT-ivy', cubectredi: '정육면체CT-redi', cubeetclover: '정육면체ET-clover', cubeetcurvy: '정육면체ET-curvy', cubemix: '정육면체FT-mixup', cubefisher: '정육면체FT-fisher', cubewindmill: '정육면체FT-windmill', cubepenrose: '정육면체FT-penrose', cubepandora: '정육면체FT-pandora', cubemirror: '정육면체FT-mirror', starft: '정십이면체FT-starminx', starct: '정십이면체CT-starminx', skewbult: '정십이면체FT-skewb ultimate', qjdodeca: '정십이면체FT-QJ' } : { dodecact: 'Dodecahedron CT', dodecaet: 'Dodecahedron ET', icosact: 'Icosahedron CT/FT', icosadc: 'Icosahedron CT/FT-Deepcut', icosaet: 'Icosahedron ET', dodecadc: 'Dodecahedron FT-Deepcut', octact: 'Octahedron CT', octaet: 'Octahedron ET', tetraet: 'Tetrahedron ET', tetra: 'Tetrahedron FT/CT', cube: 'Cube', octa: 'Octahedron FT', dodeca: 'Dodecahedron FT', cubect: 'Cube CT', square: 'Square', cubeet: 'Cube ET', cubectrex: 'Cube CT-rex', cubectivy: 'Cube CT-ivy', cubectredi: 'Cube CT-redi', cubeetclover: 'Cube ET-clover', cubeetcurvy: 'Cube ET-curvy', cubemix: 'Cube FT-mixup', cubefisher: 'Cube FT-fisher', cubewindmill: 'Cube FT-windmill', cubepenrose: 'Cube FT-penrose', cubepandora: 'Cube FT-pandora', cubemirror: 'Cube FT-mirror', starft: 'Dodecahedron FT-starminx', starct: 'Dodecahedron CT-starminx', skewbult: 'Dodecahedron FT-skewb ultimate', qjdodeca: 'Dodecahedron FT-QJ' };
    if (p.topo === 'cuboidx') return p.abc.join('×') + (ko ? ' 익스텐디드 큐보이드' : ' Extended Cuboid');
    if (p.topo === 'cuboidff') return p.abc.join('×') + (ko ? ' 풀리펑셔널 큐보이드' : ' Fully Functional Cuboid');
    if (p.topo === 'square') return T.square + '-' + (p.n < 0 ? '(' + p.n + ')' : p.n);
    return p.topo === 'cube' ? (ko ? '큐브' : 'Cube') + p.n : T[p.topo] + ' (n=' + p.n + ')';
  }
  // the key a built-in puzzle has as a (topology, size) pair, or null
  function describe(key) {
    const p = parseKey(key); if (p) return p;
    for (const k in CUBOID_THEMES) if (CUBOID_THEMES[k] === key) { const d = k.split(',').map(Number); return { topo: 'cuboidff', n: d[0], abc: d }; }
    for (const t in BUILTIN) for (const n in BUILTIN[t]) if (BUILTIN[t][n] === key) return { topo: t, n: +n };
    return null;
  }
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
  root.RBPuzzles = { ccSpec: function (curvy, n) { return cloverSpec(curvy ? CURVY_A : 1, n); }, get: getPuzzle, META: META, customKey: customKey, parseKey: parseKey, nameOf: nameOf, describe: describe, TOPOS: TOPOS, MINN: MINN, MAXN: MAXN, KEYS: ['cube2', 'cube', 'cube4', 'cube5', 'cube6', 'cube7', 'cuboid112', 'cuboid133', 'cuboid223', 'cuboid224', 'skewb', 'chop', 'heli', 'bigchop', 'tetra', 'pyramorphix', 'octa', 'dodeca', 'chopasaurus', 'pentult', 'icosamate', 'icosaminx', 'rex', 'ivy', 'redi', 'clover', 'curvy', 'mixup', 'fisher', 'windmill', 'penrose', 'pandora', 'mirror', 'starminxft', 'starminxct', 'skewbult', 'qjdodeca'], icosaSpec: icosaSpec, build: E.build, _dodecaDs: dodecaDsSpec, _icosaVDs: function (ds) { const g = icosaFacets(), va = vertexAxes(g.facets); return layeredSpec('icosaV', g.facets, va.axes.map((u) => ({ u: u, ds: ds })), 2, 5, 1 / g.radius, 0.02, 0); }, _icosaDs: function (ds) { const g = icosaFacets(); return layeredSpec('icosaX', g.facets, oppositePairs(g.facets).map((f) => ({ u: f.normal, ds: ds })), 2, 3, 1 / g.radius, 0.02, 0); }, _icosaGeom: function () { const g = icosaFacets(); const f = g.facets; const n0 = f[0].normal; const D = V.dot(n0, f[0].verts[0]); const adj = f.filter((q) => Math.abs(V.dot(q.normal, n0) - Math.sqrt(5) / 3) < 1e-6); const L = V.len(V.sub(f[0].verts[0], f[0].verts[1])); return { D: D, c: V.dot(n0, adj[0].normal), L: L, nAdj: adj.length }; }, _tetraDs: tetraDsSpec };
})(typeof window !== 'undefined' ? window : globalThis);
