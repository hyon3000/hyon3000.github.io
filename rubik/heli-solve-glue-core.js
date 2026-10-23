// Group solver for lattice puzzles made of rigid boxes (fused / shared cubes, fully functional cuboids).  It runs in a worker (heli-solve-glue-worker.js) and in plain JS shells.
// A piece sits at a pose (centre in doubled integer units, one of the 24 rotations); a turn moves the pieces inside its box to the pose rotated about the turn centre.  When no piece is ever cut
// by a box the turns are a permutation group on the "points" (piece, pose).  Solving = Schreier-Sims chain over the pieces (base = the home point of every piece that has a sticker): look up,
// level after level, the transversal word that brings the next piece home without disturbing the earlier ones.  Independent parts (pieces no turn connects) are solved separately.
(function (root) {
  'use strict';
  function mulM(A, B) { const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; }
  function rotAbout(ax, q) {          // q quarter turns counter-clockwise about +axis (right handed): (u, w) -> (-w, u)
    const u = (ax + 1) % 3, w = (ax + 2) % 3, R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    R[u * 3 + u] = 0; R[u * 3 + w] = -1; R[w * 3 + u] = 1; R[w * 3 + w] = 0;
    let out = [1, 0, 0, 0, 1, 0, 0, 0, 1]; for (let i = 0; i < ((q % 4) + 4) % 4; i++) out = mulM(R, out); return out;
  }
  const RK = (M) => M.join(',');
  const ROTS = [], ROTIDX = {};
  (function () { const id = [1, 0, 0, 0, 1, 0, 0, 0, 1]; ROTS.push(id); ROTIDX[RK(id)] = 0; for (let i = 0; i < ROTS.length; i++) for (let ax = 0; ax < 3; ax++) { const M = mulM(rotAbout(ax, 1), ROTS[i]); if (ROTIDX[RK(M)] === undefined) { ROTIDX[RK(M)] = ROTS.length; ROTS.push(M); } } })();
  const MUL = ROTS.map((A) => ROTS.map((B) => ROTIDX[RK(mulM(A, B))]));
  const ap = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const absM = (M) => M.map(Math.abs);

  // desc: { pieces: [{c:[3], e:[3]}], moves: [{box: [[lo,hi] x 3], ctr: [3], rot: quarter turn matrix, qs: [1,2,3]}] }
  // Returns { error } when a turn would cut a piece at some pose (then the turns are no group), else the point model.
  function buildModel(desc, maxPts) {
    const P = desc.pieces, moves = [];
    desc.moves.forEach((m, mi) => { for (const q of m.qs) { let R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; for (let i = 0; i < q; i++) R = mulM(m.rot, R); moves.push({ box: m.box, ctr: m.ctr, R: R, ri: ROTIDX[RK(R)], q: q, mi: mi, name: m.name }); } });
    moves.forEach((m) => { m.inv = moves.findIndex((o) => o.mi === m.mi && o.q === (4 - m.q) % 4); if (m.inv < 0) m.inv = moves.findIndex((o) => o.mi === m.mi && o.q === m.q && m.q === 2); });
    const ids = new Map(), pts = [], pieceOf = [], first = [];
    const key = (i, c, ri) => i + ':' + c[0] + ',' + c[1] + ',' + c[2] + ':' + ri;
    const idOf = (i, c, ri) => { const k = key(i, c, ri); let v = ids.get(k); if (v === undefined) { v = pts.length; ids.set(k, v); pts.push([i, c[0], c[1], c[2], ri]); pieceOf.push(i); } return v; };
    const step = (i, c, ri, m) => {
      const e = ap(absM(ROTS[ri]), P[i].e); let inside = true, ov = true;
      for (let a = 0; a < 3; a++) { if (c[a] - e[a] < m.box[a][0] || c[a] + e[a] > m.box[a][1]) inside = false; if (!(c[a] - e[a] < m.box[a][1] && c[a] + e[a] > m.box[a][0])) ov = false; }
      if (inside) { const q = ap(m.R, [c[0] - m.ctr[0], c[1] - m.ctr[1], c[2] - m.ctr[2]]); return [[q[0] + m.ctr[0], q[1] + m.ctr[1], q[2] + m.ctr[2]], MUL[m.ri][ri]]; }
      if (ov) return null;
      return [c, ri];
    };
    for (let i = 0; i < P.length; i++) {
      first.push(idOf(i, P[i].c, 0));
      for (let h = first[i]; h < pts.length; h++) {
        const t = pts[h]; if (pts.length > maxPts) return { error: 'too many points' };
        for (const m of moves) { const r = step(i, [t[1], t[2], t[3]], t[4], m); if (!r) return { error: 'straddle' }; idOf(i, r[0], r[1]); }
      }
    }
    const gens = moves.map((m) => { const g = new Int32Array(pts.length); for (let q = 0; q < pts.length; q++) { const t = pts[q], r = step(t[0], [t[1], t[2], t[3]], t[4], m); g[q] = idOf(t[0], r[0], r[1]); } return g; });
    return { pts: pts, pieceOf: pieceOf, first: first, moves: moves, gens: gens, npieces: P.length, ids: ids, key: key };
  }
  // pieces connected by the turns -> components (lists of piece indices)
  function components(model) {
    const par = model.first.map((_, i) => i), find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
    model.gens.forEach((g) => { let r = -1; for (let q = 0; q < g.length; q++) if (g[q] !== q) { const i = model.pieceOf[q]; if (r < 0) r = i; else par[find(i)] = find(r); } });
    const comps = {}; model.first.forEach((_, i) => { (comps[find(i)] = comps[find(i)] || []).push(i); });
    return Object.keys(comps).map((k) => comps[k]);
  }

  // ---- Schreier-Sims with words.  Elements are Int32Array perms over the component's points; words are arrays of generator indices (into the model's moves).
  function invWord(w, inv) { const o = new Array(w.length); for (let i = 0; i < w.length; i++) o[i] = inv[w[w.length - 1 - i]]; return o; }
  function Chain(npts, gens, ginv, baseOrder, baseStart, opts) {
    this.n = npts; this.gens = gens; this.ginv = ginv; this.m = baseOrder.length; this.base = baseOrder.map((i) => baseStart[i]);
    this.levels = []; for (let l = 0; l < this.m; l++) this.levels.push({ S: [], orb: new Map(), list: [], checked: new Set() });
    this.opts = opts || {};
  }
  const compose = (a, b, n) => { const c = new Int32Array(n); for (let i = 0; i < n; i++) c[i] = b[a[i]]; return c; };          // first a, then b
  const invert = (a, n) => { const c = new Int32Array(n); for (let i = 0; i < n; i++) c[a[i]] = i; return c; };
  Chain.prototype.build = function () {
    const n = this.n, m = this.m, B = this.base, L = this.levels, ginv = this.ginv;
    const idn = new Int32Array(n); for (let i = 0; i < n; i++) idn[i] = i;
    const gensEl = this.gens.map((g, k) => ({ p: g, w: [k] }));
    L[0].S = gensEl.slice();
    const growOrbit = (l) => {          // BFS extension of the orbit of B[l] by the strong generators of the level; transversal elements keep their words (shortest by BFS order)
      const lv = L[l]; if (!lv.orb.size) { lv.orb.set(B[l], { p: idn, ip: idn, w: [] }); lv.list.push(B[l]); }
      for (let h = 0; h < lv.list.length; h++) {
        const x = lv.list[h], ux = lv.orb.get(x);
        for (let si = 0; si < lv.S.length; si++) {
          const s = lv.S[si], y = s.p[x]; if (lv.orb.has(y)) continue;
          const p = compose(ux.p, s.p, n); lv.orb.set(y, { p: p, ip: invert(p, n), w: ux.w.concat(s.w) }); lv.list.push(y);
        }
      }
    };
    // An element is a list of parts [perm, word, inverted?] applied in order; its base images are tracked while it is sifted, the full perm and word are only composed when it is kept.
    const realise = (parts) => {
      let p = idn; const w = [];
      for (const q of parts) { p = p === idn ? q[0] : compose(p, q[0], n); for (const k of (q[2] ? invWord(q[1], ginv) : q[1])) w.push(k); }
      return { p: p, w: w };
    };
    // sift from level l0: img = base images of the element so far; returns null when it sifts to the identity on the base, else {level, el} of the residue
    const sift = (img, parts, l0) => {
      parts = parts.slice();
      for (let l = l0; l < m; l++) {
        const x = img[l]; if (x === B[l]) continue;
        const t = L[l].orb.get(x); if (!t) return { level: l, el: realise(parts) };
        parts.push([t.ip, t.w, true]);
        for (let j = 0; j < m; j++) img[j] = t.ip[img[j]];
      }
      return null;
    };
    let total = 0, changed = true, rounds = 0, tlimit = this.opts.timeMs ? Date.now() + this.opts.timeMs : 0;
    while (changed) {
      changed = false; rounds++;
      for (let l = m - 1; l >= 0 && !changed; l--) {
        const lv = L[l]; growOrbit(l);
        for (let h = 0; h < lv.list.length && !changed; h++) {
          const x = lv.list[h], ux = lv.orb.get(x);
          for (let si = 0; si < lv.S.length && !changed; si++) {
            const ck = x * 100000 + si; if (lv.checked.has(ck)) continue; lv.checked.add(ck);
            const s = lv.S[si], y = s.p[x], uy = lv.orb.get(y);
            let trivial = true; const img = new Array(m);          // base images of the Schreier generator u_x s u_y^-1
            for (let j = 0; j < m; j++) { const v = uy.ip[s.p[ux.p[B[j]]]]; img[j] = v; if (v !== B[j]) trivial = false; }
            if (trivial) continue;
            const r = sift(img, [[ux.p, ux.w, false], [s.p, s.w, false], [uy.ip, uy.w, true]], l + 1);
            if (r) { for (let t = 0; t <= r.level && t < m; t++) L[t].S.push(r.el); total++; changed = true; if (tlimit && Date.now() > tlimit) return false; }
          }
        }
      }
    }
    this.strong = total; this.rounds = rounds; return true;
  };
  // word that brings the state to the solved one: imgs[j] = the point of base piece j (global point ids already mapped into this component)
  Chain.prototype.solve = function (imgs) {
    const n = this.n, m = this.m, B = this.base, L = this.levels, ginv = this.ginv, out = [];
    // elements act on points; we track the current images of the base pieces and apply the inverse transversal words (as perms) to them
    const cur = imgs.slice();
    for (let l = 0; l < m; l++) {
      const x = cur[l]; if (x === B[l]) continue;
      const t = L[l].orb.get(x); if (!t) return null;
      // the state's point x for piece l is B[l] moved by u_x; undo with u_x^-1: the word of the inverse
      for (let j = 0; j < m; j++) cur[j] = t.ip[cur[j]];
      for (const k of invWord(t.w, ginv)) out.push(k);
    }
    for (let j = 0; j < m; j++) if (cur[j] !== B[j]) return null;
    return out;
  };
  // ---- prepared puzzle: components with chains (several base orders tried, the order with the shortest solutions on random states is kept), cached by key in the worker
  const PREP = {};
  const rngS = { s: 12345 }; const rnd = () => { rngS.s = (Math.imul(rngS.s, 1103515245) + 12345) & 0x7fffffff; return rngS.s / 0x7fffffff; };
  function mergeWord(word, model) {          // cancel / merge consecutive turns of the same move: [{mi, q}]
    const out = [];
    for (const k of word) {
      const m = model.moves[k], last = out[out.length - 1];
      if (last && last.mi === m.mi) { last.q = (last.q + m.q) % 4; if (!last.q) out.pop(); } else out.push({ mi: m.mi, q: m.q });
    }
    return out;
  }
  function prepare(key, desc, baseIdx, opts) {
    if (PREP[key]) return PREP[key];
    opts = opts || {};
    const model = buildModel(desc, opts.maxPts || 60000); if (model.error) return (PREP[key] = { error: model.error });
    const isBase = {}; baseIdx.forEach((i) => { isBase[i] = 1; });
    const comps = components(model).filter((c) => c.some((i) => isBase[i]));
    const out = { model: model, comps: [], key: key };
    for (const comp of comps) {
      const inComp = {}; comp.forEach((i) => { inComp[i] = 1; });
      const ptIdx = new Map(), ptsG = []; model.pts.forEach((t, q) => { if (inComp[t[0]]) { ptIdx.set(q, ptsG.length); ptsG.push(q); } });
      const gens = model.gens.map((g) => { const a = new Int32Array(ptsG.length); for (let i = 0; i < ptsG.length; i++) a[i] = ptIdx.get(g[ptsG[i]]); return a; });
      const bases = comp.filter((i) => isBase[i]), baseStart = bases.map((i) => ptIdx.get(model.first[i]));
      const ginv = model.moves.map((m) => m.inv);
      const samples = []; for (let t = 0; t < 6; t++) { let cur = baseStart.slice(); for (let s = 0; s < 80; s++) { const k = Math.floor(rnd() * gens.length); cur = cur.map((q) => gens[k][q]); } samples.push(cur); }
      // the base order decides the length of the solutions: hill climbing over swaps of the order (score = mean length of the solutions of a few random states) until the time is up
      const score = (order) => {
        const ch = new Chain(ptsG.length, gens, ginv, order, baseStart, { timeMs: 8000 }); if (ch.build() !== true) return null;
        let tot = 0; for (const sm of samples) { const w = ch.solve(order.map((j) => sm[j])); if (!w) return null; tot += mergeWord(w, model).length; }
        return { chain: ch, order: order, len: tot / samples.length };
      };
      let best = null; const t0 = Date.now(), budget = opts.orderMs || 6000, id0 = bases.map((_, j) => j);
      const first1 = score(id0); if (first1) best = first1;
      for (let tr = 0; Date.now() - t0 < budget; tr++) {
        let order;
        if (!best || tr < 3) { order = id0.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = order[i]; order[i] = order[j]; order[j] = x; } }
        else { order = best.order.slice(); const i = Math.floor(rnd() * order.length), j = Math.floor(rnd() * order.length), x = order[i]; if (rnd() < 0.5) { order[i] = order[j]; order[j] = x; } else { order.splice(i, 1); order.splice(j, 0, x); } }
        const sc = score(order); if (sc && (!best || sc.len <= best.len)) best = sc;
        if (best && best.len < 30) break;
      }
      const bestLen = best ? best.len * samples.length : Infinity;
      if (!best) return (PREP[key] = { error: 'no chain' });
      if (best.len > (opts.maxLen || 4000)) return (PREP[key] = { error: 'too long' });          // the solutions would take minutes to play
      out.comps.push({ comp: comp, bases: bases, ptIdx: ptIdx, chain: best.chain, order: best.order, avg: best.len });
    }
    return (PREP[key] = out);
  }
  // st: Int16Array (cx, cy, cz, rot) per piece of the desc; returns [{mi, q}] or an error string
  function solvePrepared(prep, st) {
    if (prep.error) return prep.error;
    const model = prep.model; let all = [];
    for (const c of prep.comps) {
      const imgs = [];
      for (const i of c.bases) {
        const id = model.ids.get(model.key(i, [st[4 * i], st[4 * i + 1], st[4 * i + 2]], st[4 * i + 3])); if (id === undefined) return 'pose';
        imgs.push(c.ptIdx.get(id));
      }
      const w = c.chain.solve(c.order.map((j) => imgs[j])); if (!w) return 'sift';
      all = all.concat(w);
    }
    return mergeWord(all, model);
  }
  root.HGLUE = { prepare: prepare, solvePrepared: solvePrepared, mergeWord: mergeWord, ROTS: ROTS, ROTIDX: ROTIDX, RK: RK, MUL: MUL, rotAbout: rotAbout, buildModel: buildModel, components: components, Chain: Chain, invWord: invWord, mulM: mulM, ap: ap };
})(typeof self !== 'undefined' ? self : globalThis);
