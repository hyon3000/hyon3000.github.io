// Size-generic solver for permutation puzzles whose group is (nearly) a product of alternating groups on its orbits (the edge-turning cubes: little chop family, clover, curvy copter) - the idea of
// solverN-core.js in group language, no tables.  The model is a list of move permutations of the sticker slots (generators, closed under inverse).
//  1. orbits of the generators; a "seed" per orbit = a pure 3-cycle on the orbit: the commutator [x, y] of two elements of small support that meet in exactly one point is a 3-cycle (found among
//     commutators of generator pairs and their conjugates; stubborn orbits get a support-reduction loop that commutes elements meeting in a few points until a 3-cycle falls out);
//  2. per orbit a breadth-first search over 3-cycles, conjugating by the generators: every 3-cycle of the orbit gets a word (2 * depth + seed length);
//  3. solving: signs (parity) per orbit are fixed first by a subset of generators found by Gaussian elimination over GF(2); then each orbit is solved with 3-cycles that put one or two slots home
//     per step; the result is verified by simulation.
// Words are arrays of generator indices, applied left to right.  A state is pos[f] = slot of facelet f (solved: pos[f] = f).
(function (root) {
  'use strict';
  function rngMake(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

  // ---- orbits
  function orbitsOf(d, mv) {
    const par = new Int32Array(d); for (let i = 0; i < d; i++) par[i] = i;
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (const m of mv) for (let i = 0; i < d; i++) { const a = find(i), b = find(m[i]); if (a !== b) par[a] = b; }
    const id = new Int32Array(d).fill(-1), list = [], of = new Int32Array(d);
    for (let i = 0; i < d; i++) { const r = find(i); if (id[r] < 0) { id[r] = list.length; list.push([]); } of[i] = id[r]; list[id[r]].push(i); }
    return { of: of, list: list };
  }

  // ---- sparse elements: { w: word, s: Int32Array support, im: Int32Array images of the support }
  function Tool(model, opts) {
    opts = opts || {};
    this.d = model.d; this.mv = model.perms; this.iv = model.inv; this.M = this.mv.length;
    this.ivp = this.iv.map((k) => this.mv[k]);
    this.SUP = opts.sup || 40; this.NSEED = opts.nseed || 40; this.real = opts.real || null; this.block = opts.block || null; this.pureMode = false; this.free = null; this.rnd = rngMake(opts.seed || 7);          // (real: facelets that are real tokens, the others are blanks that may end anywhere)
    const d = this.d;
    this.sa = new Int32Array(d); this.sb = new Int32Array(d); this.sc = new Int32Array(d); this.sdd = new Int32Array(d);          // dense scratch maps (identity between uses)
    for (let i = 0; i < d; i++) { this.sa[i] = i; this.sb[i] = i; this.sc[i] = i; this.sdd[i] = i; }
    this.mark = new Int32Array(d); this.stamp = 0;
  }
  Tool.prototype.invWord = function (w) { const r = new Array(w.length); for (let i = 0; i < w.length; i++) r[i] = this.iv[w[w.length - 1 - i]]; return r; };
  // the commutator of two generators as a sparse element (null when trivial or support above the limit)
  Tool.prototype.genComm = function (a, b) {
    const d = this.d, A = this.mv[a], B = this.mv[b], Ai = this.ivp[a], Bi = this.ivp[b], s = [], im = [];
    // [a,b]: a, b, a^-1, b^-1 applied in this order
    for (let x = 0; x < d; x++) { const y = Bi[Ai[B[A[x]]]]; if (y !== x) { s.push(x); im.push(y); if (s.length > this.SUP) return null; } }
    return s.length ? { w: [a, b, this.iv[a], this.iv[b]], s: Int32Array.from(s), im: Int32Array.from(im) } : null;
  };
  // g-conjugate: word [g] + w + [g^-1], support g^-1(s)
  Tool.prototype.conj = function (e, g) {
    const gi = this.ivp[g], G = this.mv[g], n = e.s.length, s = new Int32Array(n), im = new Int32Array(n);
    for (let i = 0; i < n; i++) { s[i] = gi[e.s[i]]; im[i] = gi[e.im[i]]; }
    return { w: [g].concat(e.w, [this.iv[g]]), s: s, im: im };
  };
  // [X, Y] = X Y X^-1 Y^-1 as sparse element (support above the limit -> null)
  Tool.prototype.comm = function (X, Y, lim) {
    const sa = this.sa, sb = this.sb, sc = this.sc, sdd = this.sdd;
    // sa: X, sb: X^-1, sc: Y, sdd: Y^-1
    for (let i = 0; i < X.s.length; i++) { sa[X.s[i]] = X.im[i]; sb[X.im[i]] = X.s[i]; }
    for (let i = 0; i < Y.s.length; i++) { sc[Y.s[i]] = Y.im[i]; sdd[Y.im[i]] = Y.s[i]; }
    const s = [], im = []; let over = false;
    const st = ++this.stamp, mk = this.mark;
    const cand = (arr) => { for (let i = 0; i < arr.length && !over; i++) { const x = arr[i]; if (mk[x] === st) continue; mk[x] = st; const y = sdd[sb[sc[sa[x]]]]; if (y !== x) { s.push(x); im.push(y); if (s.length > lim) over = true; } } };
    cand(X.s); cand(Y.s);
    for (let i = 0; i < X.s.length; i++) { sa[X.s[i]] = X.s[i]; sb[X.im[i]] = X.im[i]; }
    for (let i = 0; i < Y.s.length; i++) { sc[Y.s[i]] = Y.s[i]; sdd[Y.im[i]] = Y.im[i]; }
    if (over || !s.length) return null;
    return { w: X.w.concat(Y.w, this.invWord(X.w), this.invWord(Y.w)), s: Int32Array.from(s), im: Int32Array.from(im) };
  };
  Tool.prototype.overlap = function (X, Y, maxK) {          // number of common support points (stops counting above maxK)
    const st = ++this.stamp, mk = this.mark; let k = 0;
    for (let i = 0; i < X.s.length; i++) mk[X.s[i]] = st;
    for (let i = 0; i < Y.s.length; i++) if (mk[Y.s[i]] === st) { k++; if (k > maxK) return k; }
    return k;
  };

  // ---- seeds: a pure 3-cycle per orbit
  Tool.prototype.sparseOf = function (w) {
    const d = this.d, s = [], im = [];
    for (let x = 0; x < d; x++) { let y = x; for (const g of w) y = this.mv[g][y]; if (y !== x) { s.push(x); im.push(y); } }
    return { w: w, s: Int32Array.from(s), im: Int32Array.from(im) };
  };
  Tool.prototype.prepare = function (orbs) {
    const M = this.M, d = this.d, E = [];
    // elementary elements: the generators and the products of two generators with a much smaller support (two turns of the same axis: a thin slab)
    for (let a = 0; a < M; a++) E.push(this.sparseOf([a]));
    for (let a = 0; a < M; a++) for (let b = a + 1; b < M; b++) {
      const A = this.mv[a], B = this.mv[b]; let cnt = 0; const lim = Math.min(E[a].s.length, E[b].s.length) * 0.6;
      for (let x = 0; x < d; x++) if (B[A[x]] !== x && ++cnt > lim) break;
      if (cnt && cnt <= lim) E.push(this.sparseOf([a, b]));
    }
    this.E = E; this.orbs = orbs; this.seed = new Array(orbs.list.length).fill(null); this.seeds = orbs.list.map(() => new Map());
    this.indexBase(this.SUP);
  };
  // the base commutators of the elementary elements with a support up to lim (rebuilt with a larger limit for the orbits no small element reaches)
  Tool.prototype.indexBase = function (lim) {
    const E = this.E, d = this.d; this.base = []; this.byPt = new Array(d);
    for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
      if (this.overlap(E[i], E[j], 1e9) === 0) continue;
      const e = this.comm(E[i], E[j], lim); if (e) this.base.push(e);
    }
    for (let i = 0; i < this.base.length; i++) for (const x of this.base[i].s) (this.byPt[x] = this.byPt[x] || []).push(i);
  };
  // the 3-cycles of an element when it is a product of 3-cycles lying in different orbits (at most 4), else null
  Tool.prototype.cyclesOf = function (e) {
    const n = e.s.length; if (n % 3 || n > 12) return null;
    const map = new Map(); for (let i = 0; i < n; i++) map.set(e.s[i], e.im[i]);
    const seen = new Set(), out = [], orbSeen = new Set();
    for (let i = 0; i < n; i++) {
      const a = e.s[i]; if (seen.has(a)) continue;
      const b = map.get(a), c = map.get(b); if (map.get(c) !== a || b === a || c === a || c === b) return null;
      seen.add(a); seen.add(b); seen.add(c);
      const o = this.orbs.of[a]; if (orbSeen.has(o) || this.orbs.of[b] !== o || this.orbs.of[c] !== o) return null; orbSeen.add(o);
      out.push({ o: o, tri: [a, b, c] });
    }
    return out;
  };
  Tool.prototype.setSeed = function (e) {
    const cyc = this.cyclesOf(e); if (!cyc) return false;
    for (const c of cyc) {
      const o = c.o, t = c.tri, k = [[t[0], t[1], t[2]], [t[1], t[2], t[0]], [t[2], t[0], t[1]]].map((x) => x.join(',')).sort()[0];
      const ent = { w: e.w, tri: t, pure: cyc.length === 1 }, cur = this.seeds[o].get(k);
      if (!cur || e.w.length < cur.w.length) this.seeds[o].set(k, ent);
      this.seed[o] = this.seed[o] || ent;
      if (ent.pure && (!this.seed[o].pure || e.w.length < this.seed[o].w.length)) this.seed[o] = ent;
    }
    return true;
  };
  // candidate elements that touch the point x: conjugates of base commutators by one generator (or none)
  Tool.prototype.candidates = function (x, cap) {
    const out = [], M = this.M;
    for (let g = -1; g < M; g++) {
      const y = g < 0 ? x : this.mv[g][x], L = this.byPt[y]; if (!L) continue;
      for (let i = 0; i < L.length; i++) out.push(g < 0 ? this.base[L[i]] : this.conj(this.base[L[i]], g));
      if (out.length > cap * 3) break;
    }
    return out;
  };
  // a random small-support element that moves the point x: a base commutator conjugated by a short random word
  Tool.prototype.randomAt = function (x, maxK) {
    const rnd = this.rnd, M = this.M, k = Math.floor(rnd() * (maxK + 1)), gs = [];
    for (let i = 0; i < k; i++) gs.push(Math.floor(rnd() * M));
    let y = x; for (let i = k - 1; i >= 0; i--) y = this.mv[gs[i]][y];
    const L = this.byPt[y]; if (!L || !L.length) return null;
    let e = this.base[L[Math.floor(rnd() * L.length)]];
    for (let i = 0; i < k; i++) e = this.conj(e, gs[i]);
    return e;
  };
  Tool.prototype.findSeed = function (o) {
    const pts = this.orbs.list[o], rnd = this.rnd;
    let pure = 0; for (let trial = 0; trial < 20000 && pure < this.NSEED; trial++) {
      if ((trial & 255) === 0) { pure = 0; for (const v of this.seeds[o].values()) if (v.pure) pure++; }
      const x = pts[Math.floor(rnd() * pts.length)], A = this.randomAt(x, 1 + (trial >> 9)), B = this.randomAt(x, 1 + (trial >> 9)); if (!A || !B) continue;
      const k = this.overlap(A, B, 3); if (k < 1 || k > 3) continue;
      const e = this.comm(A, B, 3 * k); if (e && e.s.length % 3 === 0) this.setSeed(e);
    }
    if (this.seed[o]) return true;
    return this.reduceSeed(o);
  };
  Tool.prototype.debugOrbit = function (o) {
    const pts = this.orbs.list[o], cnt = [], sup = [];
    for (const x of pts) { const L = this.byPt[x] || []; cnt.push(L.length); for (const i of L) sup.push(this.base[i].s.length); }
    sup.sort((a, b) => a - b);
    let eTouch = 0, eMin = 1e9; for (const e of this.E) { let t = false; for (const x of e.s) if (this.orbs.of[x] === o) { t = true; break; } if (t) { eTouch++; eMin = Math.min(eMin, e.s.length); } }
    return { size: pts.length, baseTouch: cnt, minSupports: sup.slice(0, 5), eTouch: eTouch, eMin: eMin };
  };
  // support reduction: commutators of elements meeting in a few points have a small support; keep going until a 3-cycle appears
  Tool.prototype.reduceSeed = function (o) {
    const pts = this.orbs.list[o], rnd = this.rnd; let pool = [];
    for (let attempt = 0; attempt < 4 && !this.seed[o]; attempt++) {
      const x = pts[Math.floor(rnd() * pts.length)], C = this.candidates(x, 300).slice(0, 500);
      for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) {
        const k = this.overlap(C[i], C[j], 3);
        if (k >= 1 && k <= 3) { const e = this.comm(C[i], C[j], 14); if (e) { if (this.setSeed(e) && this.seed[o]) return true; if (this.orbs.of[e.s[0]] === o) pool.push(e); } }
      }
      pool.sort((p, q) => p.s.length - q.s.length); pool = pool.slice(0, 120);
      for (let round = 0; round < 5 && !this.seed[o]; round++) {
        const nw = [];
        for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
          if (this.overlap(pool[i], pool[j], 14) < 1) continue;
          const e = this.comm(pool[i], pool[j], 14); if (!e || this.orbs.of[e.s[0]] !== o) continue;
          if (this.setSeed(e) && this.seed[o]) return true;
          nw.push(e);
        }
        pool = pool.concat(nw).sort((p, q) => p.s.length - q.s.length).slice(0, 150);
      }
    }
    return !!this.seed[o];
  };

  // ---- 3-cycle library of an orbit: BFS from its seed by conjugation with the generators
  Tool.prototype.library = function (o) {
    const pts = this.orbs.list[o], m = pts.length, seed = this.seed[o];
    if (!seed) return null;
    const loc = new Int32Array(this.d).fill(-1); pts.forEach((p, i) => { loc[p] = i; });
    const key = (a, b, c) => { const k1 = (a * m + b) * m + c, k2 = (b * m + c) * m + a, k3 = (c * m + a) * m + b; return k1 < k2 ? (k1 < k3 ? k1 : k3) : (k2 < k3 ? k2 : k3); };
    const N = m * m * m, dist = new Uint8Array(N), par = new Int32Array(N).fill(-1), pm = new Int16Array(N).fill(-1);
    const cost = new Uint16Array(N).fill(65535), srcWord = new Map();
    const lmv = []; for (let g = 0; g < this.M; g++) { const arr = new Int32Array(m); for (let i = 0; i < m; i++) arr[i] = loc[this.ivp[g][pts[i]]]; lmv.push(arr); }
    const buckets = []; let count = 0;
    const push = (k, c) => { (buckets[c] = buckets[c] || []).push(k); };
    let list = Array.from(this.seeds[o].values()); if (list.some((x) => x.pure)) list = list.filter((x) => x.pure);
    const impure = list.some((x) => !x.pure);
    for (const e of list) {
      const k = key(loc[e.tri[0]], loc[e.tri[1]], loc[e.tri[2]]), c = e.w.length; if (cost[k] > c) { cost[k] = c; srcWord.set(k, e.w); push(k, c); }
    }
    for (let c = 0; c < buckets.length; c++) {
      const B = buckets[c]; if (!B) continue;
      for (let h = 0; h < B.length; h++) {
        const k = B[h]; if (cost[k] !== c || dist[k] === 1) continue; dist[k] = 1; count++;
        const cc = k % m, b = ((k - cc) / m) % m, a = ((k - cc) / m - b) / m;
        for (let g = 0; g < this.M; g++) {
          const arr = lmv[g], a2 = arr[a], b2 = arr[b], c2 = arr[cc]; if (a2 < 0 || b2 < 0 || c2 < 0) return null;
          const k2 = key(a2, b2, c2), nc = c + 2; if (cost[k2] > nc) { cost[k2] = nc; par[k2] = k; pm[k2] = g; push(k2, nc); }
        }
      }
    }
    return { impure: impure, m: m, pts: pts, loc: loc, key: key, cost: cost, par: par, pm: pm, srcWord: srcWord, count: count, full: m * (m - 1) * (m - 2) / 3 };
  };
  Tool.prototype.tripleWord = function (L, k) {
    const gs = []; let cur = k;
    while (L.par[cur] >= 0) { gs.push(L.pm[cur]); cur = L.par[cur]; }
    let w = L.srcWord.get(cur).slice();
    for (let i = gs.length - 1; i >= 0; i--) w = [gs[i]].concat(w, [this.iv[gs[i]]]);
    return w;
  };


  // ---- orbits without a 3-cycle (not alternating, e.g. the odd cubes' ring of 24): the pure elements of the orbit (support inside it) are collected and a small stabilizer chain with words is built
  function SmallChain(tool, m, base) {
    this.t = tool; this.m = m; this.lv = []; this.changed = false; this.fixed = !!base;
    if (base) for (const b of base) { this.lv.push({ b: b, gens: [], orb: null }); this.orbit(this.lv.length - 1); }
  }
  SmallChain.prototype.sift = function (p, w, from) {
    const m = this.m; let cur = p, parts = [];
    for (let i = from || 0; i < this.lv.length; i++) {
      const L = this.lv[i], beta = cur[L.b]; const tr = L.orb.get(beta);
      if (!tr) return { level: i, res: cur, rw: w.concat(...parts.map((q) => this.t.invWord(q))) };
      // cur := tr^-1 o cur ; word: w then tr^-1 (applied after)
      const inv = new Int32Array(m); for (let x = 0; x < m; x++) inv[tr.p[x]] = x;
      const nc = new Int32Array(m); for (let x = 0; x < m; x++) nc[x] = inv[cur[x]];
      cur = nc; parts.push(tr.w);
    }
    if (!this.fixed) for (let x = 0; x < m; x++) if (cur[x] !== x) return { level: this.lv.length, res: cur, rw: w.concat(...parts.map((q) => this.t.invWord(q))) };
    return { ok: true, parts: parts };
  };
  SmallChain.prototype.orbit = function (i) {          // transversal by Dijkstra on the LENGTH OF THE WORDS (the strong generators have very different lengths)
    const L = this.lv[i], m = this.m; L.orb = new Map(); const id = new Int32Array(m); for (let x = 0; x < m; x++) id[x] = x;
    L.orb.set(L.b, { p: id, w: [] });
    const gens = []; for (const g of L.gens) { gens.push(g); gens.push(this.inverse(g)); }
    const done = new Set(), cand = new Map(); cand.set(L.b, 0);
    while (cand.size) {
      let x = -1, best = 1e18; for (const [k, v] of cand) if (v < best) { best = v; x = k; }
      cand.delete(x); done.add(x); const tx = L.orb.get(x);
      for (const g of gens) {
        const y = g.p[x]; if (done.has(y)) continue;
        const len = tx.w.length + g.w.length, cur = L.orb.get(y);
        if (!cur || len < cur.w.length) { const np = new Int32Array(m); for (let z = 0; z < m; z++) np[z] = g.p[tx.p[z]]; L.orb.set(y, { p: np, w: tx.w.concat(g.w) }); cand.set(y, len); }
      }
    }
  };
  SmallChain.prototype.inverse = function (g) { const m = this.m, p = new Int32Array(m); for (let x = 0; x < m; x++) p[g.p[x]] = x; return { p: p, w: this.t.invWord(g.w) }; };
  SmallChain.prototype.add = function (level, g) {
    if (level === this.lv.length) { let b = 0; while (g.p[b] === b) b++; this.lv.push({ b: b, gens: [], orb: null }); }
    for (let j = 0; j <= level; j++) { this.lv[j].gens.push(g); this.orbit(j); }
  };
  SmallChain.prototype.feed = function (g) { const r = this.sift(g.p, g.w, 0); if (r.ok) return false; this.add(r.level, { p: r.res, w: r.rw }); return true; };
  SmallChain.prototype.complete = function () {          // Schreier generators of every level sift through the deeper ones
    const m = this.m;
    for (let guard = 0; guard < 50; guard++) {
      let any = false;
      for (let i = 0; i < this.lv.length; i++) {
        const L = this.lv[i];
        for (const [beta, tb] of Array.from(L.orb.entries())) for (const s of L.gens.slice()) {
          const y = s.p[beta], ty = L.orb.get(y); if (!ty) continue;
          // t_y^-1 o s o t_beta
          const inv = new Int32Array(m); for (let x = 0; x < m; x++) inv[ty.p[x]] = x;
          const sp = new Int32Array(m); for (let x = 0; x < m; x++) sp[x] = inv[s.p[tb.p[x]]];
          const w = tb.w.concat(s.w, this.t.invWord(ty.w));
          const r = this.sift(sp, w, i + 1); if (!r.ok) { this.add(r.level, { p: r.res, w: r.rw }); any = true; }
        }
      }
      if (!any) return;
    }
  };
  SmallChain.prototype.solveWord = function (p) {          // word whose permutation is p (applied left to right)
    const r = this.sift(p, [], 0); if (!r.ok) return null;
    let w = []; for (let i = r.parts.length - 1; i >= 0; i--) w = w.concat(r.parts[i]);
    return w;
  };
  // fixed-base chain: word of an element t with t(b_i) = y_i for the base points, and its inverse (the element that brings y_i back to b_i); null when there is none
  SmallChain.prototype.solveImages = function (ys) {
    const m = this.m; let g = new Int32Array(m), gi = new Int32Array(m); for (let x = 0; x < m; x++) { g[x] = x; gi[x] = x; }
    const parts = [];
    for (let i = 0; i < this.lv.length; i++) {
      const L = this.lv[i], z = gi[ys[i]], tr = L.orb.get(z); if (!tr) return null;
      // g := g o tr ; gi := tr^-1 o gi
      const ng = new Int32Array(m); for (let x = 0; x < m; x++) ng[x] = g[tr.p[x]]; g = ng;
      const tinv = new Int32Array(m); for (let x = 0; x < m; x++) tinv[tr.p[x]] = x;
      const ngi = new Int32Array(m); for (let x = 0; x < m; x++) ngi[x] = tinv[gi[x]]; gi = ngi;
      parts.push(tr.w);
    }
    let wt = []; for (let i = parts.length - 1; i >= 0; i--) wt = wt.concat(parts[i]);          // t = tr_1 o ... o tr_m : tr_m first
    return this.t.invWord(wt);
  };
  // special orbits (not alternating: the corner-like pieces of the odd cubes) together with one pair of points per other orbit whose sign a generator can flip: a small permutation group generated by the
  // raw generators.  Its stabilizer chain gives a SHORT word (no cleaning of the other orbits needed) that brings the special orbits home and makes every other orbit even.
  Tool.prototype.buildJoint = function (specOrbs) {
    const d = this.d, orbs = this.orbs, sp = [], loc = new Int32Array(d).fill(-1);
    for (const o of specOrbs) for (const p of orbs.list[o]) { loc[p] = sp.length; sp.push(p); }
    const ns = sp.length, spec = new Set(specOrbs), no = orbs.list.length;
    // sign coordinates: the lead orbits of the echelon basis of the sign vectors (a sign vector in the span is fixed by its values there)
    const signOrbs = []; for (const bv of this.basis) { let lead = -1; for (let i = 0; i < no; i++) if (bv.vec[i]) { lead = i; break; } if (lead >= 0 && !spec.has(lead)) signOrbs.push(lead); }
    const sidx = new Int32Array(no).fill(-1); signOrbs.forEach((o, j) => { sidx[o] = j; });
    const m = ns + 2 * signOrbs.length;
    // base: the home slots of the real special facelets, then the sign points
    let base = null; const realSp = [];
    if (this.real) { for (let i = 0; i < ns; i++) if (this.real[sp[i]]) realSp.push(i); base = realSp.concat(signOrbs.map((o, j) => ns + 2 * j)); }
    const C = new SmallChain(this, m, base);
    for (let g = 0; g < this.M; g++) {
      const p = new Int32Array(m); for (let i = 0; i < m; i++) p[i] = i;
      for (let i = 0; i < ns; i++) { const t = loc[this.mv[g][sp[i]]]; if (t < 0) return null; p[i] = t; }
      for (let j = 0; j < signOrbs.length; j++) { const bit = this.gsign[g][signOrbs[j]]; if (bit) { p[ns + 2 * j] = ns + 2 * j + 1; p[ns + 2 * j + 1] = ns + 2 * j; } }
      C.feed({ p: p, w: [g] });
    }
    C.complete(); C.sp = sp; C.loc = loc; C.ns = ns; C.signOrbs = signOrbs; C.realSp = realSp;
    return C;
  };
  Tool.prototype.solveJoint = function (pos, applyGen) {
    const C = this.joint, m = C.m, sg = this.sg(pos, true);
    let w;
    if (C.fixed) {
      const ys = []; for (const i of C.realSp) { const l = C.loc[pos[C.sp[i]]]; if (l < 0) { this.lastError = 'special orbit mixed'; return false; } ys.push(l); }
      for (let j = 0; j < C.signOrbs.length; j++) ys.push(C.ns + 2 * j + (sg[C.signOrbs[j]] ? 1 : 0));
      w = C.solveImages(ys);
    } else {
      const T = new Int32Array(m); for (let i = 0; i < m; i++) T[i] = i;
      for (const f of C.sp) { const l = C.loc[pos[f]]; if (l < 0) { this.lastError = 'special orbit mixed'; return false; } T[l] = C.loc[f]; }
      for (let j = 0; j < C.signOrbs.length; j++) if (sg[C.signOrbs[j]]) { T[C.ns + 2 * j] = C.ns + 2 * j + 1; T[C.ns + 2 * j + 1] = C.ns + 2 * j; }
      w = C.solveWord(T);
    }
    if (!w) { this.lastError = 'special orbits: state not in the chain'; return false; }
    this.lastJointLen = w.length;
    for (const g of w) applyGen(g);
    return true;
  };


  // ---- pure mode for special orbits made of blocks (fisher cube: the slots of one cell): elements meeting in exactly one block have a commutator on at most three blocks; a small fixed-base chain per orbit
  Tool.prototype.blockOverlap = function (A, B) {          // 1 when A and B have exactly one block in common (all of its slots), else 0
    const blk = this.block, st = ++this.stamp, mk = this.mark; let common = 0, b0 = -2;
    for (let i = 0; i < A.s.length; i++) mk[A.s[i]] = st;
    for (let i = 0; i < B.s.length; i++) if (mk[B.s[i]] === st) { const b = blk[B.s[i]]; if (b0 === -2) b0 = b; else if (b !== b0) return 0; common++; }
    return common > 0 && common === this.bsize[b0] ? 1 : 0;
  };
  Tool.prototype.findPure = function (o) {
    const pts = this.orbs.list[o], rnd = this.rnd, pool = new Map(), inO = (e) => { for (const x of e.s) if (this.orbs.of[x] !== o) return false; return true; };
    for (let trial = 0; trial < 12000 && pool.size < 60; trial++) {
      const x = pts[Math.floor(rnd() * pts.length)], A = this.randomAt(x, 1 + (trial >> 10)), B = this.randomAt(x, 1 + (trial >> 10)); if (!A || !B) continue;
      if (!this.blockOverlap(A, B)) continue;
      const e = this.comm(A, B, 3 * this.maxBlock); if (!e || !inO(e)) continue;
      const key = Array.from(e.s).sort((p, q) => p - q).join(','); const cur = pool.get(key); if (!cur || e.w.length < cur.w.length) pool.set(key, e);
    }
    return Array.from(pool.values()).sort((p, q) => p.w.length - q.w.length);
  };
  Tool.prototype.buildPure = function (o) {
    const pts = this.orbs.list[o], loc = new Int32Array(this.d).fill(-1); pts.forEach((p, i) => { loc[p] = i; });
    let pool = this.findPure(o);
    for (let lim = this.SUP * 3; !pool.length && lim <= 1500; lim *= 2.5) { this.indexBase(lim); pool = this.findPure(o); }
    if (!pool.length) return null;
    const blocks = [], idx = new Map(), first = []; for (const p of pts) { const b = this.block[p]; if (!idx.has(b)) { idx.set(b, blocks.length); blocks.push(b); first.push(p); } }
    const realHomes = this.real ? pts.filter((f) => this.real[f]) : pts.slice();
    const base = realHomes.map((f) => loc[f]);
    const C = new SmallChain(this, pts.length, base);
    for (const e of pool) { const p = new Int32Array(pts.length); for (let i = 0; i < p.length; i++) p[i] = i; for (let i = 0; i < e.s.length; i++) p[loc[e.s[i]]] = loc[e.im[i]]; C.feed({ p: p, w: e.w }); }
    C.complete(); C.pts = pts; C.loc = loc; C.realHomes = realHomes; C.poolSize = pool.length; C.levels = C.lv.length; C.orbSizes = C.lv.map((L) => L.orb.size);
    const idxObj = { get: (b) => idx.get(b) };
    this.pureInfo[o] = { blocks: blocks, idx: { }, first: first.map((x) => x), realHomes: realHomes, freeBlocks: false };
    blocks.forEach((b, i) => { this.pureInfo[o].idx[b] = i; });
    // blank blocks: blocks without a real home slot; two or more of them leave the parity open
    const withTok = new Set(realHomes.map((f) => this.block[f])); this.pureInfo[o].freeBlocks = blocks.length - withTok.size >= 2;
    return C;
  };
  Tool.prototype.rawChain = function (o, realHomes) {          // the chain of the plain generators on one orbit (fixed base: the real home slots)
    const pts = this.orbs.list[o], loc = new Int32Array(this.d).fill(-1); pts.forEach((p, i) => { loc[p] = i; });
    const C = new SmallChain(this, pts.length, realHomes.map((f) => loc[f]));
    for (let g = 0; g < this.M; g++) { const p = new Int32Array(pts.length); for (let i = 0; i < p.length; i++) p[i] = loc[this.mv[g][pts[i]]]; C.feed({ p: p, w: [g] }); }
    C.complete(); C.orbSizes = C.lv.map((L) => L.orb.size); return C;
  };
  Tool.prototype.solvePure = function (pos, applyGen) {
    for (const o of Object.keys(this.pure)) {
      const C = this.pure[o], ys = []; for (const f of C.realHomes) { const l = C.loc[pos[f]]; if (l < 0) { this.lastError = 'special orbit mixed'; return false; } ys.push(l); }
      const w = C.solveImages(ys); if (!w) { this.lastError = 'special orbit ' + o + ': state not in the chain of pure elements'; return false; }
      this.pureLens = (this.pureLens || []); this.pureLens.push(w.length);
      for (const g of w) applyGen(g);
    }
    return true;
  };

  // ---- signs and the GF(2) solve
  function signs(d, perm, orbs) {          // parity (0/1) of the permutation on every orbit
    const seen = new Uint8Array(d), out = new Uint8Array(orbs.list.length);
    for (let i = 0; i < d; i++) { if (seen[i]) continue; let len = 0, j = i; while (!seen[j]) { seen[j] = 1; j = perm[j]; len++; } if (len % 2 === 0) out[orbs.of[i]] ^= 1; }
    return out;
  }
  // sign vector: parity of the permutation on every orbit.  Special orbits made of blocks (the slots of one cell) count the parity of the permutation of the BLOCKS (pure mode); orbits that may end with
  // any parity (two or more blanks / blank blocks) count 0.  perm = a full permutation of the slots (a generator) or a state (pos, completed)
  Tool.prototype.sg = function (perm, isState) {
    const v = signs(this.d, perm, this.orbs), no = v.length;
    for (let o = 0; o < no; o++) {
      if (this.free && this.free[o]) { v[o] = 0; continue; }
      if (this.specials && this.specials[o]) { if (this.pure && this.pure[o]) v[o] = this.blockSign(perm, o, isState); else v[o] = 0; }
    }
    return v;
  };
  Tool.prototype.blockSign = function (perm, o, isState) {
    const bi = this.pureInfo[o]; if (bi.freeBlocks) return 0;
    const nb = bi.blocks.length, blk = this.block, img = new Int32Array(nb).fill(-1), used = new Uint8Array(nb);
    if (!isState) { for (let i = 0; i < nb; i++) { const b2 = bi.idx[blk[perm[bi.first[i]]]]; img[i] = b2; used[b2] = 1; } }
    else { for (const f of bi.realHomes) { const b1 = bi.idx[blk[f]], b2 = bi.idx[blk[perm[f]]]; img[b1] = b2; used[b2] = 1; } let k = 0; for (let i = 0; i < nb; i++) if (img[i] < 0) { while (used[k]) k++; img[i] = k; used[k] = 1; } }
    const seen = new Uint8Array(nb); let odd = 0;
    for (let i = 0; i < nb; i++) { if (seen[i]) continue; let len = 0, j = i; while (!seen[j]) { seen[j] = 1; j = img[j]; len++; } if (len % 2 === 0) odd ^= 1; }
    return odd;
  };
  Tool.prototype.signBasis = function () {
    const no = this.orbs.list.length, rows = [];          // elimination: rows[i] = {vec (Uint8Array), gens: Set of generator indices}
    this.gsign = []; for (let g = 0; g < this.M; g++) this.gsign.push(this.sg(this.mv[g], false));
    const basis = [];          // {vec, comb: Int32Array bitset over generators as plain array of indices}
    for (let g = 0; g < this.M; g++) {
      let vec = Uint8Array.from(this.gsign[g]), comb = [g];
      for (const b of basis) { let lead = -1; for (let i = 0; i < no; i++) if (b.vec[i]) { lead = i; break; } if (lead >= 0 && vec[lead]) { for (let i = 0; i < no; i++) vec[i] ^= b.vec[i]; comb = symdiff(comb, b.comb); } }
      let nz = false; for (let i = 0; i < no; i++) if (vec[i]) { nz = true; break; }
      if (nz) basis.push({ vec: vec, comb: comb });
    }
    this.basis = basis;
  };
  function symdiff(a, b) { const s = new Set(a); for (const x of b) { if (s.has(x)) s.delete(x); else s.add(x); } return Array.from(s); }
  // generators whose product has the given sign vector (null when it is not in the span)
  Tool.prototype.signWord = function (target) {
    const no = target.length; let vec = Uint8Array.from(target), comb = [];
    for (const b of this.basis) { let lead = -1; for (let i = 0; i < no; i++) if (b.vec[i]) { lead = i; break; } if (lead >= 0 && vec[lead]) { for (let i = 0; i < no; i++) vec[i] ^= b.vec[i]; comb = symdiff(comb, b.comb); } }
    for (let i = 0; i < no; i++) if (vec[i]) return null;
    return comb;
  };

  // ---- the solve: pos[f] = slot of facelet f; returns a word of generators that brings every facelet home, or null
  Tool.prototype.phaseA = function (pos0, afterSign) {          // signs and all orbits with a 3-cycle library; returns { word, pos } (special orbits are left as they are)
    const d = this.d, M = this.M, orbs = this.orbs, pos = Int32Array.from(pos0), word = [];
    const applyGen = (g) => { const p = this.mv[g]; for (let f = 0; f < d; f++) pos[f] = p[pos[f]]; word.push(g); };
    // parity: the sign of "pos" on every orbit (pos as a permutation f -> slot)
    const sg = this.sg(pos, true), comb = this.signWord(sg);
    if (!comb) { this.lastError = 'sign vector not in span'; return null; }
    for (const g of comb) applyGen(g);
    if (afterSign) afterSign(pos);          // (orbits with blanks: the parity is set after the sign word)
    // pos' = W o pos has even sign everywhere
    const order = []; for (let o = 0; o < orbs.list.length; o++) if (orbs.list[o].length >= 3 && !this.specials[o]) order.push(o);
    order.sort((p, q) => (this.libs[q] && this.libs[q].impure ? 1 : 0) - (this.libs[p] && this.libs[p].impure ? 1 : 0));          // orbits that only have multi-orbit seeds first
    for (const o of order) {
      const pts = orbs.list[o], m = pts.length;
      const L = this.libs[o]; if (!L) return null;
      const at = new Int32Array(d);          // at[slot] = facelet currently there (inverse of pos on the orbit)
      for (const f of pts) at[pos[f]] = f;
      const unsolved = new Set(); for (const f of pts) if (pos[f] !== f) unsolved.add(f);          // slots (= facelet numbers) not yet home
      const slotsLeft = () => Array.from(unsolved);
      const doCycle = (s, h, z) => {          // content of s -> h, h -> z, z -> s
        const k = L.key(L.loc[s], L.loc[h], L.loc[z]); if (L.cost[k] === 65535) return false;
        const w = this.tripleWord(L, k);
        // simulate the 3-cycle on the orbit only
        if (L.impure) { for (const g of w) applyGen(g); for (const f of pts) at[pos[f]] = f; return true; }          // the word acts on other orbits too: run it for real
        const fs = at[s], fh = at[h], fz = at[z];
        for (const g of w) { word.push(g); }
        pos[fs] = h; pos[fh] = z; pos[fz] = s; at[h] = fs; at[z] = fh; at[s] = fz;
        return true;
      };
      let guard = 0;
      while (unsolved.size && guard++ < 4 * m) {
        // choose a target slot h (unsolved): the facelet h sits at s = pos[h]
        let best = null;
        const left = slotsLeft();
        for (const h of left) {
          const s = pos[h]; if (s === h) continue;
          const gOnH = at[h];          // facelet now at h: its home is gOnH
          // option 1: z = home of the facelet at h (solves two) when it is neither s nor h
          const tryZ = (z, gain) => { if (z === s || z === h || !unsolved.has(z)) return; const k = L.key(L.loc[s], L.loc[h], L.loc[z]); if (L.cost[k] === 65535) return; const cost = L.cost[k] / gain; if (!best || cost < best.cost) best = { s: s, h: h, z: z, cost: cost }; };
          if (gOnH !== s) tryZ(gOnH, 2);
          let cnt = 0; for (const z of left) { tryZ(z, 1); if (++cnt > 12) break; }
          if (best && best.cost < 2 * 12 + 24) break;          // good enough
        }
        if (!best) { this.lastError = 'no op for orbit ' + o; return null; }
        doCycle(best.s, best.h, best.z);
        // refresh the unsolved set
        if (L.impure) { unsolved.clear(); for (const f of pts) if (pos[f] !== f) unsolved.add(f); }
        else for (const x of [best.s, best.h, best.z]) { if (pos[x] === x) unsolved.delete(x); else unsolved.add(x); }
      }
      if (unsolved.size) { this.lastError = 'orbit ' + o + ' left ' + unsolved.size; return null; }
    }
    return { word: word, pos: pos, applyGen: applyGen };
  };
  // blanks (facelets that are not real tokens, pos < 0) are put on the free slots of their orbit; an orbit with two or more blanks may end with any parity, so the blanks are swapped when the
  // permutation of such an orbit is odd.  Returns the list of free orbits whose parity still has to be looked at after the other steps.
  Tool.prototype.completeBlanks = function (pos) {
    const orbs = this.orbs;
    for (let o = 0; o < orbs.list.length; o++) {
      const pts = orbs.list[o], taken = new Uint8Array(this.d); let blanks = [];
      for (const f of pts) if (pos[f] >= 0) taken[pos[f]] = 1; else blanks.push(f);
      if (!blanks.length) continue;
      let k = 0; for (const sl of pts) if (!taken[sl]) pos[blanks[k++]] = sl;
    }
  };
  Tool.prototype.fixFreeParity = function (pos, pos0c) {
    if (!this.free) return;
    for (let o = 0; o < this.orbs.list.length; o++) {
      if (!this.free[o]) continue;
      const sg = signs(this.d, pos, this.orbs); if (!sg[o]) continue;
      const bl = this.blanksOf[o]; const a = bl[0], b = bl[1];          // swap two blank facelets (in the present state and in the start state alike)
      let t = pos[a]; pos[a] = pos[b]; pos[b] = t; t = pos0c[a]; pos0c[a] = pos0c[b]; pos0c[b] = t;
    }
  };
  Tool.prototype.solve = function (pos0) {
    const d = this.d, pos = Int32Array.from(pos0), word = [];
    const applyGen = (g) => { const p = this.mv[g]; for (let f = 0; f < d; f++) pos[f] = p[pos[f]]; word.push(g); };
    if (this.real) this.completeBlanks(pos);
    const start = Int32Array.from(pos);
    if (this.joint && !this.solveJoint(pos, applyGen)) return null;
    const A = this.phaseA(pos, this.free ? ((p) => this.fixFreeParity(p, start)) : null); if (!A) return null;
    let out = word.concat(A.word);
    if (this.pure) { const w2 = []; if (!this.solvePure(A.pos, (g) => { const p = this.mv[g]; for (let f = 0; f < d; f++) A.pos[f] = p[A.pos[f]]; w2.push(g); })) return null; out = out.concat(w2); }
    // verify by running the word on the (completed) start state; blanks of special orbits may end anywhere
    const fin = this.run(start, out);
    for (let f = 0; f < d; f++) if (fin[f] !== f && (!this.real || this.real[f] || this.libs[this.orbs.of[f]])) { this.lastError = 'facelet ' + f + ' not home'; return null; }
    return this.cancel(out);
  };
  Tool.prototype.cancel = function (word) {          // adjacent g g^-1 vanish
    const out = [];
    for (const g of word) { if (out.length && this.iv[out[out.length - 1]] === g) out.pop(); else out.push(g); }
    return out;
  };
  // run the word on pos0 (all generators) and return the final vector
  Tool.prototype.run = function (pos0, word) {
    const pos = Int32Array.from(pos0), d = this.d;
    for (const g of word) { const p = this.mv[g]; for (let f = 0; f < d; f++) pos[f] = p[pos[f]]; }
    return pos;
  };

  // build everything: returns the tool or { error }
  function build(model, opts) {
    opts = opts || {};
    const t0 = Date.now(), T = new Tool(model, opts), orbs = orbitsOf(model.d, T.mv);
    T.prepare(orbs);
    let missing = 0;
    const need = () => { const r = []; for (let o = 0; o < orbs.list.length; o++) if (orbs.list[o].length >= 3 && !T.seed[o]) r.push(o); return r; };
    let todo = need(); for (const o of todo) T.findSeed(o);
    for (let lim = T.SUP * 3; need().length && lim <= 1500; lim *= 2.5) { T.indexBase(lim); for (const o of need()) T.findSeed(o); }
    const spec = need(); T.stats = { orbits: orbs.list.length, missing: 0, seedMs: Date.now() - t0 };
    T.specials = {}; for (const o of spec) T.specials[o] = true;
    T.libs = orbs.list.map((l, o) => (l.length >= 3 && !T.specials[o] ? T.library(o) : null));
    for (let o = 0; o < orbs.list.length; o++) if (T.libs[o] && T.libs[o].count !== T.libs[o].full) { T.specials[o] = true; T.libs[o] = null; }
    if (T.real) {          // orbits with two or more blanks: any parity is fine
      T.free = new Uint8Array(orbs.list.length); T.blanksOf = {};
      for (let o = 0; o < orbs.list.length; o++) if (T.libs[o]) { const bl = orbs.list[o].filter((f) => !T.real[f]); if (bl.length >= 2) { T.free[o] = 1; T.blanksOf[o] = bl; } }
    }          // not alternating (corner-like pieces ...)
    T.joint = null; const so = Object.keys(T.specials).map(Number); T.pure = null;
    let jointOrbs = so.slice();
    if (so.length && T.block) {
      T.bsize = {}; let mb = 1; for (let f = 0; f < model.d; f++) { const b = T.block[f]; T.bsize[b] = (T.bsize[b] || 0) + 1; if (T.bsize[b] > mb) mb = T.bsize[b]; } T.maxBlock = mb; T.pureInfo = {};
      const P = {}; jointOrbs = [];
      for (const o of so) {
        const C = T.buildPure(o);
        // complete when the pure elements generate at least half of what the generators do on the orbit (the quotient is the sign)
        let ok = false;
        if (C) { const H = T.rawChain(o, C.realHomes); const ordP = C.orbSizes.reduce((a, b) => a * b, 1), ordH = H.orbSizes.reduce((a, b) => a * b, 1); ok = ordP * 2 >= ordH; T.stats['ord' + o] = ordP + '/' + ordH; }
        if (ok) P[o] = C; else delete T.pureInfo[o], jointOrbs.push(o);
      }
      if (Object.keys(P).length) { T.pure = P; T.pureMode = true; }
    }
    T.signBasis();
    if (jointOrbs.length) { T.joint = T.buildJoint(jointOrbs); if (!T.joint) return { error: 'special orbits cannot be modelled', tool: T }; }
    T.stats.buildMs = Date.now() - t0;
    return T;
  }
  root.HTC = { build: build, orbitsOf: orbitsOf, Tool: Tool, signs: signs };
})(typeof self !== 'undefined' ? self : globalThis);
