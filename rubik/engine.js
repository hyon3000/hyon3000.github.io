// Generic face-turning puzzle engine.
// A puzzle is a convex polyhedron whose surface is tiled with sticker polygons.  A "band" is a slab (lo, hi] along a rotation axis;
// a move turns every sticker whose centroid lies in the slab by +-2*pi/n about the axis.  The permutation of sticker slots of each move
// is derived purely from the geometry (rotate the centroid, find the slot at the new position), so the same code serves every puzzle.
(function (root) {
  'use strict';
  const EPS = 1e-6;
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; },
    avg: (list) => { const r = [0, 0, 0]; list.forEach((p) => { r[0] += p[0]; r[1] += p[1]; r[2] += p[2]; }); return [r[0] / list.length, r[1] / list.length, r[2] / list.length]; },
    rot: (p, ax, c, s) => { const d = V.dot(ax, p), cr = V.cross(ax, p); return [p[0] * c + cr[0] * s + ax[0] * d * (1 - c), p[1] * c + cr[1] * s + ax[1] * d * (1 - c), p[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; },
  };

  // clip a convex 3D polygon by the half space dot(n,x) <= d
  function clipPoly(poly, n, d) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = V.dot(n, a) - d, db = V.dot(n, b) - d;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push(V.add(a, V.mul(V.sub(b, a), t))); }
    }
    return out;
  }

  function build(spec) {
    const k = spec.scale || 1;
    const sc = (x) => (isFinite(x) ? x * k : x);
    const facets = spec.facets.map((f, i) => {
      const o = { verts: f.verts.map((v) => V.mul(v, k)), normal: V.norm(f.normal), colour: f.colour !== undefined ? f.colour : i };
      o.centre = V.avg(o.verts); o.d = V.dot(o.normal, o.verts[0]);
      return o;
    });
    const st = spec.stickers.map((s, idx) => {
      let verts = s.verts.map((v) => V.mul(v, k));
      const N = facets[s.facet].normal;
      if (V.dot(V.cross(V.sub(verts[1], verts[0]), V.sub(verts[2], verts[0])), N) < 0) verts = verts.slice().reverse();
      const c = V.avg(verts);
      // distance from the centroid to the nearest edge (used for marks / minimum size)
      let rad = 1e9;
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i], b = verts[(i + 1) % verts.length], e = V.norm(V.sub(b, a)), w = V.sub(c, a);
        rad = Math.min(rad, V.len(V.sub(w, V.mul(e, V.dot(w, e)))));
      }
      // inset polygon (constant gap between neighbouring stickers)
      const gap = (spec.gap || 0) * k, ins = [];
      for (let i = 0; i < verts.length; i++) {
        const p = verts[(i + verts.length - 1) % verts.length], v = verts[i], q = verts[(i + 1) % verts.length];
        const m1 = V.cross(N, V.norm(V.sub(v, p))), m2 = V.cross(N, V.norm(V.sub(q, v)));
        const f = gap / (1 + V.dot(m1, m2));
        ins.push(V.add(v, V.mul(V.add(m1, m2), f)));
      }
      return { i: idx, verts: verts, ins: ins, c: c, n: N, facet: s.facet, colour: facets[s.facet].colour, rad: rad, kind: s.kind || '' };
    });
    const N = st.length;
    const lines = [], bands = [];
    spec.lines.forEach((ln, li) => {
      const ax = V.norm(ln.axis);
      lines.push({ axis: ax, n: ln.n, bands: [] });
      ln.bands.forEach((bd) => {
        const lo = sc(bd.lo), hi = sc(bd.hi), members = [], inb = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
          const p = V.dot(st[i].c, ax);
          const inside = p > lo && p <= hi;
          if (inside) { members.push(i); inb[i] = 1; }
          // no sticker may be cut by a plane
          let mn = 1e9, mx = -1e9;
          st[i].verts.forEach((v) => { const q = V.dot(v, ax); mn = Math.min(mn, q); mx = Math.max(mx, q); });
          if (inside) { if (mn < lo - 1e-5 || mx > hi + 1e-5) throw new Error('sticker ' + i + ' cut by band ' + li); }
          else if (!(mx <= lo + 1e-5 || mn >= hi - 1e-5)) throw new Error('sticker ' + i + ' cut by band(out) ' + li);
        }
        const b = { idx: bands.length, line: li, axis: ax, n: ln.n, lo: lo, hi: hi, members: members, inb: inb, name: bd.name || '', secLo: null, secHi: null };
        // cross sections of the polyhedron at the finite boundary planes (drawn as dark "cut faces" during a turn)
        [['secLo', lo], ['secHi', hi]].forEach((pr) => {
          if (!isFinite(pr[1])) return;
          const tmp = Math.abs(ax[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0], u = V.norm(V.cross(ax, tmp)), w = V.cross(ax, u), c0 = V.mul(ax, pr[1]), B = 5;
          let poly = [V.add(c0, V.add(V.mul(u, B), V.mul(w, B))), V.add(c0, V.add(V.mul(u, -B), V.mul(w, B))), V.add(c0, V.add(V.mul(u, -B), V.mul(w, -B))), V.add(c0, V.add(V.mul(u, B), V.mul(w, -B)))];
          facets.forEach((f) => { poly = clipPoly(poly, f.normal, f.d + 1e-9); });
          b[pr[0]] = poly.length >= 3 ? poly : null;
        });
        bands.push(b); lines[li].bands.push(b.idx);
      });
    });
    // sticker permutations of every move: move m = band*2 + (dir > 0 ? 0 : 1); perm[i] = slot that receives the sticker of slot i
    const perms = new Array(bands.length * 2);
    function findSlot(q, nrm) {
      for (let j = 0; j < N; j++) {
        if (Math.abs(st[j].c[0] - q[0]) < 1e-5 && Math.abs(st[j].c[1] - q[1]) < 1e-5 && Math.abs(st[j].c[2] - q[2]) < 1e-5) {
          if (V.dot(st[j].n, nrm) < 1 - 1e-5) return -1;
          return j;
        }
      }
      return -1;
    }
    bands.forEach((b) => {
      [1, -1].forEach((dir) => {
        const ang = dir * 2 * Math.PI / b.n, c = Math.cos(ang), s = Math.sin(ang), perm = new Int16Array(N);
        for (let i = 0; i < N; i++) perm[i] = i;
        const seen = new Uint8Array(N);
        b.members.forEach((i) => {
          const j = findSlot(V.rot(st[i].c, b.axis, c, s), V.rot(st[i].n, b.axis, c, s));
          if (j < 0 || !b.inb[j] || seen[j]) throw new Error('bad permutation band ' + b.idx);
          // same polygon shape: compare the sorted distances of the vertices to the axis / height
          perm[i] = j; seen[j] = 1;
        });
        perms[b.idx * 2 + (dir > 0 ? 0 : 1)] = perm;
      });
    });
    const facetStk = facets.map(() => []);
    st.forEach((s) => facetStk[s.facet].push(s.i));
    const slotBands = st.map(() => []);
    bands.forEach((b) => b.members.forEach((i) => slotBands[i].push(b.idx)));
    const P = {
      name: spec.name, N: N, stickers: st, facets: facets, lines: lines, bands: bands, perms: perms, facetStk: facetStk, slotBands: slotBands, nColours: facets.length,
      solvedCol: Uint8Array.from(st.map((s) => s.colour)),
      moveOf: (b, d) => b * 2 + (d > 0 ? 0 : 1),
      apply: function (col, m, out) { const p = perms[m]; out = out || new Uint8Array(N); for (let i = 0; i < N; i++) out[p[i]] = col[i]; return out; },
      isSolved: function (col) {
        for (let f = 0; f < facetStk.length; f++) { const l = facetStk[f], c0 = col[l[0]]; for (let q = 1; q < l.length; q++) if (col[l[q]] !== c0) return false; }
        return true;
      },
      // history of turns with cancellation: entries {b, k}; k = net number of +1 steps in (-n/2, n/2]
      histPush: function (hist, b, d) {
        const band = bands[b], n = band.n;
        let idx = -1;
        for (let i = hist.length - 1; i >= 0; i--) { const e = hist[i]; if (bands[e.b].line !== band.line) break; if (e.b === b) { idx = i; break; } }
        if (idx < 0) { hist.push({ b: b, k: d }); return; }
        let kk = hist[idx].k + d; kk = ((kk % n) + n) % n; if (kk > n / 2) kk -= n;
        if (kk === 0) hist.splice(idx, 1); else hist[idx].k = kk;
      },
      // validation used by the tests: every move's inverse, n-fold identity, polygon shapes preserved
      validate: function () {
        const errs = [];
        bands.forEach((b) => {
          const mp = b.idx * 2, mm = mp + 1;
          let col = Uint8Array.from(st.map((_, i) => i % 251));
          const orig = col.slice();
          let t = P.apply(P.apply(col, mp), mm);
          for (let i = 0; i < N; i++) if (t[i] !== orig[i]) { errs.push('inverse ' + b.idx); break; }
          t = orig.slice(); for (let r = 0; r < b.n; r++) t = P.apply(t, mp);
          for (let i = 0; i < N; i++) if (t[i] !== orig[i]) { errs.push('order ' + b.idx); break; }
          // polygon shapes: slot i's vertices rotated must equal slot perm[i]'s vertices (as a set)
          const ang = 2 * Math.PI / b.n, c = Math.cos(ang), s = Math.sin(ang), perm = perms[mp];
          b.members.forEach((i) => {
            const j = perm[i], A = st[i].verts.map((v) => V.rot(v, b.axis, c, s)), B = st[j].verts;
            if (A.length !== B.length) { errs.push('shape ' + i); return; }
            A.forEach((a) => { if (!B.some((q) => V.len(V.sub(a, q)) < 1e-5)) errs.push('shape-vertex ' + i + '->' + j); });
          });
        });
        return errs;
      },
    };
    return P;
  }
  root.RBEngine = { build: build, V: V, EPS: EPS };
})(typeof window !== 'undefined' ? window : globalThis);
