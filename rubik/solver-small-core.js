// Scramble-independent solving of small discrete puzzles (skewb, ivy, pyramorphix, rex, redi ...): pure functions, no DOM, loadable in a Web Worker (importScripts) or in a page.
// Two methods:
//   exact   (tiny state spaces) - breadth-first table of colourings (renamed by first appearance so that the whole-body rotations of the puzzle collapse) from the solved state, and a
//           search from the given state until it meets the table: the shortest solutions.
//   chain   (huge groups: rex 5e27, redi 1.6e12) - a Schreier-Sims chain with SHORT words (Minkwitz): for every base slot the shortest known element that carries a given slot to it
//           while fixing the earlier base slots.  A state is solved slot after slot (taking the nearest content of the right colour, with back-tracking over identical colours).
// A move is an index m into perms: content of slot i goes to slot perms[m][i]; m ^ 1 is the inverse of m (engine convention: m = band * 2 + (dir > 0 ? 0 : 1)).
(function (root) {
  'use strict';

  function rng(seed) { let s = seed | 0 || 1234567; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000003) / 1000003; }; }

  // ------------------------------------------------------------------ exact: breadth-first table + search
  function renamed(col, C, out) {          // colours renamed in order of first appearance
    const map = new Int8Array(C).fill(-1); let k = 0;
    for (let i = 0; i < col.length; i++) { const c = col[i]; if (map[c] < 0) map[c] = k++; out[i] = map[c]; }
    return out;
  }
  function hash2(a, N) {          // two 32-bit FNV hashes folded into one 53-bit number
    let h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0;
    for (let i = 0; i < N; i++) { h1 = Math.imul(h1 ^ a[i], 0x01000193); h2 = Math.imul(h2 + a[i] + 1, 0x85ebca6b) ^ (h2 >>> 13); }
    return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff);
  }
  // spec: { N, perms: [Int16Array...], solved: colouring, nColours, facets: [[slots]...] }.  Returns { solve(col) -> [moves] | null, size }
  function makeExact(spec, maxDepth, maxStates) {
    const N = spec.N, M = spec.perms.length, C = spec.nColours, perms = spec.perms;
    const inv = perms.map((p) => { const q = new Int16Array(N); for (let i = 0; i < N; i++) q[p[i]] = i; return q; });
    const table = new Map(), tmp = new Uint8Array(N), cur = new Uint8Array(N);
    const start = renamed(spec.solved, C, new Uint8Array(N));
    table.set(hash2(start, N), 0);
    let frontier = [start], depth = 0;
    const apply = (col, m, out) => { const q = inv[m]; for (let i = 0; i < N; i++) tmp[i] = col[q[i]]; return renamed(tmp, C, out || new Uint8Array(N)); };
    while (frontier.length && depth < maxDepth && table.size < maxStates) {
      depth++; const next = [];
      for (const s of frontier) for (let m = 0; m < M; m++) {
        const t = apply(s, m), h = hash2(t, N);
        if (!table.has(h)) { table.set(h, depth); next.push(t); }
      }
      frontier = next;
    }
    const full = frontier.length === 0, reach = depth;          // full: the whole space is in the table
    function solve(col, searchDepth) {
      const s0 = renamed(col, C, new Uint8Array(N)), h0 = hash2(s0, N);
      if (table.has(h0)) return descend(s0);
      // search from the state until a state of the table appears (iterative deepening over the 2 * bands moves, never the same band twice in a row)
      const path = [];
      function dfs(s, left, lastBand) {
        for (let m = 0; m < M; m++) {
          if ((m >> 1) === lastBand) continue;
          const t = apply(s, m), d = table.get(hash2(t, N));
          path.push(m);
          if (d !== undefined) { if (d + 0 <= reach) return true; }
          if (left > 1 && dfs(t, left - 1, m >> 1)) return true;
          path.pop();
        }
        return false;
      }
      for (let k = 1; k <= (searchDepth || 12); k++) { path.length = 0; if (dfs(s0, k, -1)) { const end = replay(col, path); return path.concat(descend(renamed(end, C, new Uint8Array(N)))); } }
      return null;
    }
    function replay(col, path) { let c = Uint8Array.from(col); for (const m of path) { const o = new Uint8Array(N); const p = perms[m]; for (let i = 0; i < N; i++) o[p[i]] = c[i]; c = o; } return c; }
    function descend(s) {          // from a state in the table: always step to a neighbour that is one nearer
      const out = []; let d = table.get(hash2(s, N)), cur2 = s;
      while (d > 0) {
        let found = false;
        for (let m = 0; m < M; m++) { const t = apply(cur2, m), dd = table.get(hash2(t, N)); if (dd !== undefined && dd < d) { out.push(m); cur2 = t; d = dd; found = true; break; } }
        if (!found) return null;
      }
      return out;
    }
    return { solve: solve, size: table.size, depth: reach, full: full };
  }

  // ------------------------------------------------------------------ chain with short words
  function compose(a, b) { const N = a.length, r = new Int16Array(N); for (let i = 0; i < N; i++) r[i] = b[a[i]]; return r; }          // first a, then b
  function invert(a) { const N = a.length, r = new Int16Array(N); for (let i = 0; i < N; i++) r[a[i]] = i; return r; }
  function invWord(w) { const r = new Array(w.length); for (let i = 0; i < w.length; i++) r[i] = w[w.length - 1 - i] ^ 1; return r; }
  function isId(a) { for (let i = 0; i < a.length; i++) if (a[i] !== i) return false; return true; }

  // spec: { N, perms, base: [slots] (optional; default 0..N-1 in the given order), order: group order as a number if known (stop when the orbit sizes multiply to it) }
  function makeChain(spec, opt) {
    opt = opt || {};
    const N = spec.N, M = spec.perms.length, perms = spec.perms, rnd = rng(opt.seed || 99), t0 = Date.now();
    const base = spec.base || Array.from({ length: N }, (_, i) => N - 1 - i), K = base.length;          // (the last slots first: shorter solutions than the natural order)
    const tab = base.map(() => new Map());          // tab[i]: slot s -> { p, w, pi } with p[s] = base[i], p fixing base[0..i-1]
    let limit = opt.startLimit || 8, entries = 0, queue = [], qi = 0;
    function insert(i, s, e) { if (!tab[i].has(s)) entries++; tab[i].set(s, e); queue.push(e); }
    function sift(e0) {          // words are kept as pieces until an entry is really inserted (no array copying per level)
      let p = Int16Array.from(e0.p), q = invert(p), p2 = new Int16Array(N), q2 = new Int16Array(N), len = e0.w.length, pre = [], cur = e0;
      const word = () => { const out = []; for (let k = pre.length - 1; k >= 0; k--) { const iw = pre[k].iw || (pre[k].iw = invWord(pre[k].w)); for (let j = 0; j < iw.length; j++) out.push(iw[j]); } for (let j = 0; j < cur.w.length; j++) out.push(cur.w[j]); return out; };
      for (let i = 0; i < K; i++) {
        const b = base[i], s = q[b];
        if (s === b) continue;
        let t = tab[i].get(s);
        if (!t) { if (len <= limit) { insert(i, s, { p: p, w: word() }); return true; } return false; }
        if (len < t.w.length) {          // the new element is shorter: it takes the place, the old one is sifted on
          const ne = { p: p, w: word() }; insert(i, s, ne); cur = t; pre = []; len = t.w.length; p = Int16Array.from(t.p); q = invert(p); t = ne;
        }
        if (!t.pi) t.pi = invert(t.p);
        const nl = t.w.length + len; if (nl > limit) return false;
        const tp = t.p, tpi = t.pi;
        for (let x = 0; x < N; x++) { q2[x] = tp[q[x]]; p2[x] = p[tpi[x]]; }          // first t^-1 (b -> s), then the element (s -> b): fixes b
        let sw = p; p = p2; p2 = sw; sw = q; q = q2; q2 = sw;
        pre.push(t); len = nl;
      }
      return false;
    }
    const gens = perms.map((p, m) => ({ p: p, w: [m] }));
    function product(a, b) { const w = a.w.concat(b.w); if (w.length > limit) return null; return { p: compose(a.p, b.p), w: w }; }
    function allEntries() { const out = []; for (let i = 0; i < K; i++) tab[i].forEach((e) => out.push(e)); return out; }
    function expected() { let prod = 1; for (let i = 0; i < K; i++) prod *= Math.max(1, tab[i].size + (tab[i].has(base[i]) ? 0 : 1)); return prod; }
    // the orbit of base[i] under the stabiliser is complete when no random product adds an entry for a long while
    let stable = 0, rounds = 0;
    gens.forEach((g) => sift(g));
    const maxMs = opt.maxMs || 20000, target = spec.order;
    while (Date.now() - t0 < maxMs) {
      rounds++; let progress = false;
      while (qi < queue.length) {
        const t = queue[qi++]; if (qi > 4096) { queue.splice(0, qi); qi = 0; } const before = entries;
        for (let m = 0; m < M; m++) { const a = product(t, gens[m]), b = product(gens[m], t); if (a) sift(a); if (b) sift(b); }
        if (entries !== before) progress = true;
      }
      queue.length = 0; qi = 0;
      const all = allEntries();
      for (let k = 0; k < (opt.randomPerRound || 400); k++) {
        const a = all[Math.floor(rnd() * all.length)], b = all[Math.floor(rnd() * all.length)], p = product(a, b);
        if (p) { const before = entries; sift(p); if (entries !== before) progress = true; }
      }
      // random walks over the generators: genuinely random group elements (their sifting fills the entries that products of table entries never reach)
      for (let k = 0; k < (opt.walks === undefined ? 12 : opt.walks); k++) {
        let p = null, w = []; const len = 40 + Math.floor(rnd() * 80);
        for (let j = 0; j < len; j++) { const m = Math.floor(rnd() * M); p = p ? compose(p, perms[m]) : perms[m]; w.push(m); }
        const before = entries; sift({ p: p, w: w }); if (entries !== before) progress = true;
      }
      if (target && expected() >= target) break;
      if (!progress) { stable++; if (limit < (opt.maxLimit || 2000)) { limit = Math.ceil(limit * 2); stable = 0; } else if (stable > 3) break; } else stable = 0;
    }
    // improve: shorter entries from products of the shortest ones
    const polishMs = opt.polishMs === undefined ? 4000 : opt.polishMs, tp = Date.now();
    while (Date.now() - tp < polishMs) {
      const all = allEntries().sort((a, b) => a.w.length - b.w.length), n = Math.min(all.length, 600); let changed = 0;
      for (let k = 0; k < (opt.polishPerRound || 3000); k++) {
        const a = all[Math.floor(rnd() * n)], b = rnd() < 0.5 ? gens[Math.floor(rnd() * M)] : all[Math.floor(rnd() * n)], p = rnd() < 0.5 ? product(a, b) : product(b, a);
        if (p) { const before = entries; sift(p); if (queue.length > qi) changed++; if (entries !== before) changed++; }
      }
      queue.length = 0; qi = 0; if (!changed) break;
    }
    function stats() { let sum = 0, mx = 0, cnt = 0; for (let i = 0; i < K; i++) tab[i].forEach((e) => { sum += e.w.length; mx = Math.max(mx, e.w.length); cnt++; }); return { entries: cnt, avg: sum / Math.max(1, cnt), max: mx, order: expected(), ms: Date.now() - t0, limit: limit }; }

    // ---- solving a colouring: slot after slot, the nearest content of the right colour; back-tracks over equally coloured contents
    function solve(col, solved, maxNodes) {
      let nodes = 0; const budget = maxNodes || 20000;
      function dfs(i, cur, word) {
        if (++nodes > budget) return null;
        if (i === K) { for (let j = 0; j < N; j++) if (cur[j] !== solved[j]) return null; return word; }
        const b = base[i], want = solved[b], cands = [];
        if (cur[b] === want) cands.push(null);          // already right (no move), tried first
        tab[i].forEach((e, s) => { if (s !== b && cur[s] === want) cands.push(e); });
        cands.sort((x, y) => (x ? x.w.length : -1) - (y ? y.w.length : -1));
        for (const e of cands) {
          if (!e) { const r = dfs(i + 1, cur, word); if (r) return r; continue; }
          const next = new Uint8Array(N); for (let j = 0; j < N; j++) next[e.p[j]] = cur[j];
          const r = dfs(i + 1, next, word.concat(e.w)); if (r) return r;
        }
        return null;
      }
      return dfs(0, Uint8Array.from(col), []);
    }
    return { solve: solve, stats: stats, tab: tab, base: base };
  }

  // merge neighbouring turns of one band and cancel inverses: moves are m = band * 2 + inverse, bands have n steps (order per band)
  function simplify(word, orders) {
    const out = [];
    for (const m of word) {
      const band = m >> 1, d = (m & 1) ? -1 : 1, last = out[out.length - 1];
      if (last && last.band === band) { last.k += d; const n = orders[band]; last.k = ((last.k % n) + n) % n; if (last.k > n / 2) last.k -= n; if (last.k === 0) out.pop(); }
      else out.push({ band: band, k: d });
    }
    const res = []; out.forEach((e) => { const n = orders[e.band]; for (let r = 0; r < Math.abs(e.k); r++) res.push(e.band * 2 + (e.k > 0 ? 0 : 1)); });
    return res;
  }

  // chain with a check: the bases (orders of the base points, best first) are tried in turn; a chain is accepted when it solves random scrambles of the puzzle (the random construction
  // can stop with a few table entries missing; which base order that happens for varies), the last one is returned if none passes.  opt: { totalMs, polishMs, tests, steps }
  function makeChainChecked(spec, bases, opt) {
    opt = opt || {}; const t0 = Date.now(), total = opt.totalMs || 150000, M = spec.perms.length, rnd = rng(opt.seed || 4242);
    let ch = null, which = -1;
    for (let b = 0; b < bases.length; b++) {
      const left = total - (Date.now() - t0); if (b > 0 && left < 3000) break;
      ch = makeChain(Object.assign({}, spec, { base: bases[b] }), { maxMs: Math.max(3000, b === bases.length - 1 ? left : left * 0.6), polishMs: opt.polishMs === undefined ? 2000 : opt.polishMs });
      which = b; let ok = true;
      for (let k = 0; k < (opt.tests || 6) && ok; k++) {
        let col = Uint8Array.from(spec.solved); const N = col.length;
        for (let i = 0; i < (opt.steps || 250); i++) { const p = spec.perms[Math.floor(rnd() * M)], nx = new Uint8Array(N); for (let j = 0; j < N; j++) nx[p[j]] = col[j]; col = nx; }
        const w = ch.solve(col, spec.solved, 300000); if (!w) { ok = false; break; }
        for (const m of w) { const p = spec.perms[m], nx = new Uint8Array(N); for (let j = 0; j < N; j++) nx[p[j]] = col[j]; col = nx; }
        for (let j = 0; j < N; j++) if (col[j] !== spec.solved[j]) ok = false;
      }
      if (ok) return { chain: ch, base: b, ok: true };
    }
    return { chain: ch, base: which, ok: false };
  }

  root.RBSmall = { makeExact: makeExact, makeChain: makeChain, makeChainChecked: makeChainChecked, simplify: simplify, renamed: renamed };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
