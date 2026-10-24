// Scramble-independent solver core for the piece-engine puzzles that are not covered by the cube-lattice solvers: starminx FT/CT, skewb ultimate, QJ, dodecahedron / octahedron / icosahedron / tetrahedron
// versions (heli.html).  It needs HELI (heli-core.js) and runs in a Web Worker (heli-solve-star-worker.js) or in any JS engine for tests.  The state is read from the pieces alone (never from S.hist).
// Model: the sticker faces of the pieces are the "facelets"; a turn the engine allows from the solved state is a permutation of the facelet slots (a slot = the world polygon of the face).
// Solving = a stabilizer chain (random Schreier-Sims, short breadth-first coset words) of the group the turns generate: facelet by facelet the word is looked up that brings it home without disturbing
// the earlier ones; the chain is completed on the fly if a state does not sift through.  A state the turns left off the lattice (jumbling turns) is first brought back by turning the jumbled planes back
// (searched on a copy of the state: S.ang, the angle every plane has been turned by, tells which planes are jumbled).  The result is replayed on the real engine before it is returned.
(function (root) {
  'use strict';
  const H = root.HELI, TAU = 2 * Math.PI, PI = Math.PI;
  const normA = (a) => { a = ((a % TAU) + TAU) % TAU; return a > PI + 1e-9 ? a - TAU : a; };          // (-pi, pi]
  const q3 = (x) => { const v = Math.round(x * 1913.7); return v === 0 ? 0 : v; };          // (a grid that does not put the usual dyadic coordinates such as 0.46875 on a rounding boundary)
  function keyOfPoly(poly) { const a = poly.map((p) => q3(p[0]) + ',' + q3(p[1]) + ',' + q3(p[2])); a.sort(); return a.join('|'); }

  // ------------------------------------------------------------------ model
  const MODELS = {};
  function buildModel(shape, n) {
    const mk = shape + ':' + n; if (MODELS[mk]) return MODELS[mk];
    const S = H.create(n, shape), cfg = S.cfg, fl = [], slotOf = new Map(), allKeys = new Set();
    S.pieces.forEach((pc, i) => pc.home.forEach((f, k) => { const key = keyOfPoly(pc.W[k]); allKeys.add(key); if (f.tag >= 0) { slotOf.set(key, fl.length); fl.push({ i: i, k: k }); } }));
    const d = fl.length, moves = [], seen = new Map();
    cfg.planes.forEach((pl, p) => {
      pl.stops.forEach((t) => {
        if (Math.abs(normA(t)) < 1e-7) return;
        const a = normA(t); if (!H.apply(S, { p: p, a: a, trust: true })) return;          // (trust: no bond check - from the solved state every turn the planes allow is bonded; the check costs seconds on big octahedra)
        const perm = new Int16Array(d); let ok = true;
        for (let s = 0; s < d && ok; s++) { const f = fl[s], q = slotOf.get(keyOfPoly(S.pieces[f.i].W[f.k])); if (q === undefined) ok = false; else perm[s] = q; }
        H.apply(S, { p: p, a: -a, trust: true }); S.hist.length = 0; S.ang[p] = 0;
        if (!ok) return;
        const id = perm.join(','); if (seen.has(id)) return; seen.set(id, moves.length);
        moves.push({ p: p, a: a, perm: perm });
      });
    });
    // inverses (a move whose perm is the inverse; added with the opposite angle when the engine has no such stop)
    const ident = Array.from({ length: d }, (_, i) => i);
    moves.slice().forEach((m, mi) => {
      const iv = invPerm(m.perm), id = iv.join(',');
      if (!seen.has(id)) { seen.set(id, moves.length); moves.push({ p: m.p, a: normA(-m.a), perm: iv }); }
      m.inv = seen.get(id);
    });
    moves.forEach((m, mi) => { if (m.inv === undefined) m.inv = seen.get(invPerm(m.perm).join(',')); });
    const cenKeys = new Set(); S.pieces.forEach((pc) => cenKeys.add(cenKey(pc.W)));
    const latStops = cfg.planes.map(() => [0]); moves.forEach((m) => latStops[m.p].push(m.a));
    return (MODELS[mk] = { cenKeys: cenKeys, shape: shape, n: n, fl: fl, slotOf: slotOf, allKeys: allKeys, moves: moves, d: d, latStops: latStops, ident: ident, nplanes: cfg.planes.length });
  }
  function cenKey(W) { let x = 0, y = 0, z = 0, c = 0; for (const f of W) for (const v of f) { x += v[0]; y += v[1]; z += v[2]; c++; } return q3(x / c) + ',' + q3(y / c) + ',' + q3(z / c); }
  function invPerm(p) { const r = new Int16Array(p.length); for (let i = 0; i < p.length; i++) r[p[i]] = i; return r; }
  function comp(f, g) { const r = new Int16Array(g.length); for (let i = 0; i < g.length; i++) r[i] = f[g[i]]; return r; }          // f after g
  function isId(p) { for (let i = 0; i < p.length; i++) if (p[i] !== i) return false; return true; }

  // ------------------------------------------------------------------ stabilizer chain
  function Chain(model) {
    this.m = model; this.base = []; this.lv = []; this.nsift = 0;
  }
  Chain.prototype.invWord = function (w) { const mv = this.m.moves; const r = new Array(w.length); for (let i = 0; i < w.length; i++) r[i] = mv[w[w.length - 1 - i]].inv; return r; };
  Chain.prototype.mkGen = function (perm, word) { return { perm: perm, inv: invPerm(perm), w: word, wi: this.invWord(word) }; };
  Chain.prototype.orbit = function (i) {
    const L = this.lv[i], d = this.m.d, b = this.base[i];
    L.par = new Int32Array(d).fill(-1); L.pg = new Int32Array(d).fill(-1); L.inorb = new Uint8Array(d); L.cache = new Map();
    L.inorb[b] = 1; const q = [b];
    for (let h = 0; h < q.length; h++) {
      const x = q[h];
      for (let gi = 0; gi < L.gens.length; gi++) for (let sgn = 0; sgn < 2; sgn++) {
        const g = L.gens[gi], y = sgn ? g.inv[x] : g.perm[x];
        if (!L.inorb[y]) { L.inorb[y] = 1; L.par[y] = x; L.pg[y] = gi * 2 + sgn; q.push(y); }
      }
    }
    L.size = q.length;
  };
  Chain.prototype.trans = function (i, beta) {          // {perm, word} of the transversal element carrying base[i] to beta
    const L = this.lv[i]; let c = L.cache.get(beta); if (c) return c;
    if (beta === this.base[i]) c = { perm: Int16Array.from(this.m.ident), word: [], inv: null };
    else {
      const par = this.trans(i, L.par[beta]), g = L.gens[L.pg[beta] >> 1], sg = L.pg[beta] & 1;
      c = { perm: comp(sg ? g.inv : g.perm, par.perm), word: par.word.concat(sg ? g.wi : g.w), inv: null };
    }
    L.cache.set(beta, c); return c;
  };
  Chain.prototype.sift = function (h, w) {          // h: perm, w: its word.  Returns {fail: level, res, rw} or {ok: true, word}
    let cur = h; const parts = [];
    for (let i = 0; i < this.lv.length; i++) {
      const beta = cur[this.base[i]], L = this.lv[i];
      if (!L.inorb[beta]) return { fail: i, res: cur, rw: this.residueWord(w, parts), cur: cur };
      const u = this.trans(i, beta);
      if (!u.inv) u.inv = invPerm(u.perm);
      parts.push(u); cur = comp(u.inv, cur);
    }
    if (!isId(cur)) return { fail: this.lv.length, res: cur, rw: this.residueWord(w, parts), cur: cur };
    // h = u_0 o u_1 o ... ; the application order is the last transversal first
    let word = []; for (let i = parts.length - 1; i >= 0; i--) word = word.concat(parts[i].word);
    return { ok: true, word: word };
  };
  Chain.prototype.residueWord = function (w, parts) { let r = w ? w.slice() : []; for (let i = 0; i < parts.length; i++) r = r.concat(this.invWord(parts[i].word)); return r; };
  Chain.prototype.addGen = function (level, res, rw) {
    if (level === this.lv.length) {
      let x = 0; while (res[x] === x) x++;
      this.base.push(x); this.lv.push({ gens: [] });
    }
    const g = this.mkGen(res, rw);
    for (let j = 0; j <= level; j++) { this.lv[j].gens.push(g); this.orbit(j); }
  };
  Chain.prototype.randomElement = function (rnd, len) {
    const mv = this.m.moves; let w = [], p = Int16Array.from(this.m.ident), last = -1;
    for (let i = 0; i < len; i++) {
      let k; do { k = Math.floor(rnd() * mv.length); } while (mv[k].p === last && this.m.nplanes > 1);
      last = mv[k].p; w.push(k); p = comp(mv[k].perm, p);
    }
    return { perm: p, word: w };
  };
  Chain.prototype.build = function (rnd, opts) {
    opts = opts || {}; const K = opts.K || 40, maxIter = opts.maxIter || 200000, wl = opts.len || 24; let good = 0, it = 0;
    // seed: the turns themselves are in the chain from the start (short words at the top levels)
    for (const m of this.m.moves) { const r = this.sift(m.perm, [this.m.moves.indexOf(m)]); if (!r.ok) this.addGen(r.fail, r.res, r.rw); }
    while (good < K && it < maxIter) {
      it++; const e = this.randomElement(rnd, wl + Math.floor(rnd() * 8)), r = this.sift(e.perm, e.word);
      if (r.ok) { good++; continue; }
      good = 0; this.addGen(r.fail, r.res, r.rw);
    }
    this.iters = it;
  };

  // ------------------------------------------------------------------ transversal table (words shortened Minkwitz style)
  // A transversal element of level i only has to lie in G_i (fix the base points before i) and carry base[i] to beta, so any short element that does can replace the one the chain found.
  function Table(chain) {
    const m = chain.m; this.m = m; this.base = chain.base.slice(); this.T = [];
    for (let i = 0; i < chain.lv.length; i++) {
      const L = chain.lv[i], t = new Map();
      for (let b = 0; b < m.d; b++) if (L.inorb[b]) { const u = chain.trans(i, b); t.set(b, { perm: u.perm, w: u.word }); }
      this.T.push(t);
    }
  }
  Table.prototype.invWord = Chain.prototype.invWord;
  Table.prototype.level = function (x) { for (let i = 0; i < this.base.length; i++) if (x[this.base[i]] !== this.base[i]) return i; return -1; };
  Table.prototype.offer = function (x, w) {          // x in G_level with word w: replace the entry when shorter
    const i = this.level(x); if (i < 0) return false; const beta = x[this.base[i]], e = this.T[i].get(beta);
    if (!e) return false;
    if (w.length < e.w.length) { this.T[i].set(beta, { perm: x, w: w }); return true; }
    return false;
  };
  Table.prototype.sift = function (h) {
    let cur = h; const parts = [];
    for (let i = 0; i < this.base.length; i++) {
      const beta = cur[this.base[i]], e = this.T[i].get(beta); if (!e) return null;
      if (!e.inv || e.invFor !== e.perm) { e.inv = invPerm(e.perm); e.invFor = e.perm; }
      parts.push(e); cur = comp(e.inv, cur);
    }
    if (!isId(cur)) return null;
    let word = []; for (let i = parts.length - 1; i >= 0; i--) word = word.concat(parts[i].w); return word;
  };
  Table.prototype.total = function () { let s = 0, c = 0; this.T.forEach((t) => t.forEach((e) => { s += e.w.length; c++; })); return { sum: s, cnt: c, avg: s / c }; };
  // Schreier sweep: for every entry t_beta of level i and every turn g the element t_g(beta)^-1 g t_beta fixes the base point of level i (it lies deeper); offered with its word it may shorten an entry there
  Table.prototype.sweep = function (ms) {
    const t0 = Date.now(), m = this.m; let nrep = 0, n = 0;
    for (let i = 0; i < this.base.length; i++) {
      const tab = this.T[i];
      for (const [beta, e] of tab) {
        if (Date.now() - t0 > ms) return { rep: nrep, n: n, cut: true };
        for (let k = 0; k < m.moves.length; k++) {
          const g = m.moves[k], gb = g.perm[beta], f = tab.get(gb); if (!f) continue;
          n++;
          if (!f.inv || f.invFor !== f.perm) { f.inv = invPerm(f.perm); f.invFor = f.perm; }
          const x = comp(f.inv, comp(g.perm, e.perm)), len = f.w.length + 1 + e.w.length;
          const lv = this.level(x); if (lv < 0) continue;
          const ent = this.T[lv].get(x[this.base[lv]]); if (!ent || len >= ent.w.length) continue;
          this.T[lv].set(x[this.base[lv]], { perm: x, w: this.invWord(f.w).concat([k], e.w) }); nrep++;
        }
      }
    }
    return { rep: nrep, n: n, cut: false };
  };
  // Build a table from nothing (Minkwitz): the entries are only ever products of shorter entries (Schreier elements), shortest first; sweeps are repeated until nothing changes.
  function emptyTable(model) { const t = Object.create(Table.prototype); t.m = model; t.base = []; t.T = []; return t; }
  Table.prototype.insert = function (x, w, maxLen) {          // sift x (word w) into the table: the shorter of two elements with the same image of the base point stays, the quotient goes on deeper
    let changed = false, guard = 0;
    for (;;) {
      if (guard++ > 400 || (maxLen && w.length > maxLen)) return changed;
      let i = this.level(x);
      if (i < 0) { if (isId(x)) return changed; this.addLevel(x); changed = true; continue; }
      const beta = x[this.base[i]], e = this.T[i].get(beta);
      if (!e) { this.T[i].set(beta, { perm: x, w: w }); return true; }
      if (e.perm === x) return changed;
      let keep = e, other = { perm: x, w: w };
      if (w.length < e.w.length) { keep = { perm: x, w: w }; other = e; this.T[i].set(beta, keep); changed = true; }
      if (!keep.inv || keep.invFor !== keep.perm) { keep.inv = invPerm(keep.perm); keep.invFor = keep.perm; }
      const r = comp(keep.inv, other.perm);
      if (isId(r)) return changed;
      x = r; w = other.w.concat(this.invWord(keep.w)); changed = true;
    }
  };
  Table.prototype.addLevel = function (x) {          // first element of a new deepest level
    let b = 0; while (b < x.length && x[b] === b) b++; if (b === x.length) return;
    this.base.push(b); const t = new Map(); t.set(b, { perm: Int16Array.from(this.m.ident), w: [] }); this.T.push(t);
  };
  Table.prototype.fromMoves = function () { const m = this.m; m.moves.forEach((mv, k) => this.insert(Int16Array.from(mv.perm), [k])); };
  Table.prototype.level = function (x) { for (let i = 0; i < this.base.length; i++) if (x[this.base[i]] !== this.base[i]) return i; return -1; };
  Table.prototype.schreier = function (ms, cap, rnd) {
    const t0 = Date.now(), m = this.m; let changed = 0, n = 0;
    for (let i = 0; i < this.base.length; i++) {
      if (Date.now() - t0 > ms) return { changed: changed, n: n, cut: true };
      const gens = [];
      for (let j = i; j < this.base.length; j++) this.T[j].forEach((e) => { if (e.w.length) gens.push(e); });
      if (i === 0) m.moves.forEach((mv, k) => gens.push({ perm: mv.perm, w: [k] }));
      gens.sort((p, q) => p.w.length - q.w.length);
      let use = gens; if (gens.length > cap) { use = gens.slice(0, Math.floor(cap * 0.7)); for (let r = use.length; r < cap; r++) use.push(gens[Math.floor(rnd() * gens.length)]); }
      const ents = Array.from(this.T[i].entries());
      for (const [beta, e] of ents) {
        for (const sg of use) {
          const gb = sg.perm[beta], f = this.T[i].get(gb);
          if (this.insert(comp(sg.perm, e.perm), e.w.concat(sg.w), 600)) changed++;          // orbit closure: s o t_beta carries the base point to s(beta)
          if (!f) continue;
          n++;
          if (!f.inv || f.invFor !== f.perm) { f.inv = invPerm(f.perm); f.invFor = f.perm; }
          const w = e.w.concat(sg.w, this.invWord(f.w)), x = comp(f.inv, comp(sg.perm, e.perm));
          if (this.insert(x, w, 600)) changed++;
        }
        if (Date.now() - t0 > ms) return { changed: changed, n: n, cut: true };
      }
    }
    return { changed: changed, n: n, cut: false };
  };
  Table.prototype.stamp = function () { let c = 0, sm = 0; this.T.forEach((t) => t.forEach((e) => { c++; sm += e.w.length; })); return c + ':' + sm + ':' + this.base.length; };
  Table.prototype.build = function (rnd, opts) {          // the whole table: sweeps until stable, then random elements until 400 in a row sift through without a change
    opts = opts || {}; const t0 = Date.now(), ms = opts.ms || 30000, cap = opts.cap || 60, m = this.m; let sweeps = 0, passes = 0, rounds = 0;
    this.fromMoves();
    for (;;) {
      let last = '';
      while (sweeps < 200) {
        const r = this.schreier(Math.max(1000, ms - (Date.now() - t0)), cap, rnd); sweeps++;
        const st = this.stamp(); if (st === last || r.cut) break; last = st;
      }
      if (Date.now() - t0 > ms) break;
      let ok = 0; const before = this.stamp();
      for (let k = 0; k < 400; k++) {
        const e = this.randomElement(rnd, 30 + (k % 20)), pre = this.stamp();
        this.insert(e.perm, e.word, 600); if (this.stamp() === pre) ok++;
        if (Date.now() - t0 > ms) break;
      }
      rounds++; if (ok === 400 && this.stamp() === before) break;
      if (rounds > 30) break;
    }
    this.sweeps = sweeps; this.buildMs = Date.now() - t0; return this;
  };
  Table.prototype.randomElement = Chain.prototype.randomElement;
  Table.prototype.improve = function (rnd, ms, opts) {
    opts = opts || {}; const t0 = Date.now(), m = this.m, entries = [];
    let nrep = 0, iters = 0;
    const refresh = () => { entries.length = 0; this.T.forEach((t, i) => t.forEach((e, b) => { if (e.w.length) entries.push(e); })); };
    refresh();
    const mvs = m.moves.map((mv, k) => ({ perm: mv.perm, w: [k] }));
    while (Date.now() - t0 < ms) {
      for (let r = 0; r < 200; r++) {
        iters++;
        const k = 2 + Math.floor(rnd() * 3); let x = Int16Array.from(m.ident), w = [];
        for (let j = 0; j < k; j++) {
          const pick = rnd() < 0.3 ? mvs[Math.floor(rnd() * mvs.length)] : entries[Math.floor(rnd() * entries.length)];
          let pp = pick.perm, ww = pick.w;
          if (rnd() < 0.5) { pp = invPerm(pp); ww = this.invWord(ww); }
          x = comp(pp, x); w = w.concat(ww);
        }
        if (this.offer(x, w)) nrep++;
        else { const iv = invPerm(x); if (this.offer(iv, this.invWord(w))) nrep++; }
      }
      if (iters % 4000 === 0) refresh();
    }
    return { iters: iters, replaced: nrep, ms: Date.now() - t0 };
  };

  // ------------------------------------------------------------------ plan helpers
  function mergeMoves(list) {          // consecutive turns of one plane are added up, a full turn vanishes, an angle stays as it is
    const out = [];
    list.forEach((m) => {
      const top = out[out.length - 1];
      if (top && top.p === m.p) { const a = normA(top.a + m.a); if (Math.abs(a) < 1e-7) out.pop(); else top.a = a; }
      else out.push({ p: m.p, a: normA(m.a) });
    });
    return out;
  }
  // (poseSig rounds at a scale that keeps dyadic values such as 0.375 away from the rounding boundary)
  function poseSig(S) {
    let s = ''; for (const pc of S.pieces) { for (let i = 0; i < 9; i++) s += Math.round(pc.R[i] * 97.3) + ','; for (let i = 0; i < 3; i++) s += Math.round(pc.T[i] * 97.3) + ','; s += ';'; }
    let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h + ':' + s.length;
  }
  function loadState(shape, n, st) {
    const S = H.create(n, shape);
    S.pieces.forEach((pc, i) => { pc.R = st.R[i].slice(); pc.T = st.T[i].slice(); H._refresh(S, i); });
    S.ang = st.ang.slice(); S.hist = []; return S;
  }
  function onLatticeFast(S, model) { for (const pc of S.pieces) if (!model.cenKeys.has(cenKey(pc.W))) return false; return true; }
  function onLattice(S, model) { for (const pc of S.pieces) for (const w of pc.W) if (!model.allKeys.has(keyOfPoly(w))) return false; return true; }
  function posOf(S, model) { const pos = new Int16Array(model.d); for (let f = 0; f < model.d; f++) { const fi = model.fl[f], q = model.slotOf.get(keyOfPoly(S.pieces[fi.i].W[fi.k])); if (q === undefined) return null; pos[f] = q; } return pos; }

  // bring a jumbled state back onto the lattice: turn the planes whose angle is not a lattice stop back to one.  Several routes lead to lattice states (not all of them inside the group the
  // lattice turns generate), so every lattice state found is offered to accept(path) and the search goes on until one is accepted.
  const STAT = { apply: 0, legal: 0, lat: 0 };
  function unjumble(S, model, budget, accept) {
    accept = accept || (() => true);
    if (onLattice(S, model) && accept([])) return [];
    const np = model.nplanes, path = [], t0 = Date.now(), maxMs = budget.ms || 8000, maxD = budget.depth || 7;
    let over = false, seen = new Map();
    const timeUp = () => { if (Date.now() - t0 > maxMs) over = true; return over; };
    const latOK = (p) => model.latStops[p].some((t) => Math.abs(normA(S.ang[p] - t)) < 1e-6);
    function dfs(depth, limit, prev, restrict, latOnly) {
      if (depth > 0 && onLatticeFast(S, model)) { STAT.lat++; if (onLattice(S, model) && accept(path.slice())) return true; }
      if (depth >= limit || timeUp()) return false;
      const sig = poseSig(S), sd = seen.get(sig); if (sd !== undefined && sd <= depth) return false; seen.set(sig, depth);
      const cand = [];
      for (let p = 0; p < np; p++) {
        if (restrict && latOK(p)) continue;
        const lat = model.latStops[p], all = S.cfg.planes[p].stops, tried = new Set();
        (latOnly ? lat : lat.concat(all)).forEach((t) => {
          const a = normA(t - S.ang[p]); if (Math.abs(a) < 1e-7) return; const k = Math.round(a * 1e6); if (tried.has(k)) return; tried.add(k);
          if (prev && prev.p === p && Math.abs(normA(a + prev.a)) < 1e-6) return;          // not straight back
          cand.push({ p: p, a: a });
        });
      }
      for (const c of cand) {
        STAT.apply++; if (!H.apply(S, { p: c.p, a: c.a })) continue; STAT.legal++;
        path.push({ p: c.p, a: c.a });
        if (dfs(depth + 1, limit, c, restrict, latOnly)) return true;
        path.pop(); H.apply(S, { p: c.p, a: -c.a }); S.hist.length = Math.max(0, S.hist.length - 2); S.ang[c.p] = normA(S.ang[c.p]);
        if (over) return false;
      }
      return false;
    }
    let nfail = 0; for (let p = 0; p < np; p++) if (!latOK(p)) nfail++;
    // 1: every jumbled plane goes straight back to a lattice stop (the usual case: each plane was jumbled once), 2: any stop, jumbled planes only, 3: any plane
    for (let d = Math.max(1, nfail); d <= nfail + 1 && !over; d++) { seen = new Map(); if (dfs(0, d, null, true, true)) return path.slice(); }
    for (let d = 1; d <= nfail + 2 && !over; d++) { seen = new Map(); if (dfs(0, d, null, true, false)) return path.slice(); }
    for (let d = 1; d <= maxD && !over; d++) { seen = new Map(); if (dfs(0, d, null, false, false)) return path.slice(); }
    return null;
  }

  // ------------------------------------------------------------------ the solver
  // offline tables (heli-solve-star-data.js): the words of the table entries; the perms are rebuilt by composing the turns
  function fingerprint(model) { let h = 0; for (const m of model.moves) { h = (Math.imul(h, 31) + m.p * 7 + Math.round(m.a * 1000)) | 0; for (let i = 0; i < m.perm.length; i += 3) h = (Math.imul(h, 131) + m.perm[i]) | 0; } return h + ':' + model.moves.length + ':' + model.d; }
  Table.prototype.exportData = function () { return { fp: fingerprint(this.m), base: this.base.slice(), T: this.T.map((t) => Array.from(t.entries()).map((en) => [en[0], en[1].w])) }; };
  function importTable(model, data) {
    if (!data || data.fp !== fingerprint(model)) return null;
    const T = emptyTable(model); T.base = data.base.slice();
    data.T.forEach((lv) => { const t = new Map(); lv.forEach((en) => { let p = Int16Array.from(model.ident); for (const k of en[1]) p = comp(model.moves[k].perm, p); t.set(en[0], { perm: p, w: en[1] }); }); T.T.push(t); });
    return T;
  }
  const CHAINS = {};

  function getTable(model, rnd, opts) {
    const ck = model.shape + ':' + model.n; if (CHAINS[ck]) return CHAINS[ck];
    const dat = root.HSTAR_DATA && root.HSTAR_DATA[ck], imp = dat ? importTable(model, dat) : null; if (imp) { imp.buildMs = 0; imp.fromData = true; return (CHAINS[ck] = imp); }
    const T = emptyTable(model); T.build(rnd, opts); return (CHAINS[ck] = T);
  }
  function solve(shape, n, st, opts) {
    opts = opts || {}; const rnd = opts.rnd || Math.random, t0 = Date.now();
    const model = buildModel(shape, n); if (!model.moves.length) return { error: 'no moves' };
    const S = loadState(shape, n, st);
    if (H.isSolved(S)) return { plan: [], sigs: [], ms: 0 };
    const T = getTable(model, rnd, opts.table); let word = null, pos = null;
    const pre = unjumble(S, model, opts.budget || {}, () => { pos = posOf(S, model); if (!pos) return false; word = T.sift(invPerm(pos)); return !!word; });
    if (pre === null) return { error: 'cannot undo the jumbling' };
    if (!word) return { error: 'state not in the table' };
    const plan0 = mergeMoves(pre.concat(word.map((k) => ({ p: model.moves[k].p, a: model.moves[k].a }))));
    // (the page finds its place in the plan by the pose signature, first occurrence: a plan that meets a state twice would run in a circle for ever, so the loop is cut out)
    const R = loadState(shape, n, st), sigs = [], plan = [], seenAt = new Map();
    for (const m of plan0) {
      const sg = poseSig(R);
      if (seenAt.has(sg)) { const k = seenAt.get(sg); for (let q = k; q < plan.length; q++) seenAt.delete(sigs[q]); plan.length = k; sigs.length = k; }
      seenAt.set(sg, plan.length); plan.push(m); sigs.push(sg);
      if (!H.apply(R, m)) return { error: 'engine refused ' + JSON.stringify(m) };
    }
    if (!H.isSolved(R)) return { error: 'replay not solved' };
    return { plan: plan, sigs: sigs, ms: Date.now() - t0, tableMs: T.buildMs, base: T.base.length, pre: pre.length, entries: T.total().cnt };
  }
  root.HSTAR = { onLatticeFast: onLatticeFast, STAT: STAT, tables: CHAINS, importTable: importTable, fingerprint: fingerprint, emptyTable: emptyTable, getTable: getTable, Table: Table, buildModel: buildModel, solve: solve, poseSig: poseSig, posOf: posOf, keyOfPoly: keyOfPoly, loadState: loadState, unjumble: unjumble, onLattice: onLattice, Chain: Chain, mergeMoves: mergeMoves, normA: normA };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
