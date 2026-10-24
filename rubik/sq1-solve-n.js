// Square-n solver for every size except the real Square-1 (that one is sq1-solve.js).  It knows nothing of the scramble: the state read from the engine is all it gets.
// Runs as a Web Worker (new Worker('sq1-solve-n.js')) and as a plain script of sq1.html.
//
// Layout (see sq1-core.js): two rings of S sectors, a slice swaps the sectors 0..h-1 (h = S/2) of the top ring with the bottom sectors h-1..0.  Three kinds of size:
//   'A'  S = P (n = 2, 3, 4, ...): every piece is one sector, every rotation and every slice is legal.
//   'B'  S = P + 2 (n = 1.5, 2.5, ...): like A, but each ring holds two pieces of two sectors ("dominos"), a slice is legal only if no domino straddles a cut.
//   'U'  P = 2, 4, 6 (n = -1, 0, 0.5): every piece is a whole number of sectors wide, so there are only P "slots" per ring; solved with a Schreier-Sims chain (solver-small-core.js).
// Method for A and B: every state is a permutation of the 2S cells (cell = sector).  A "window swap" W(sT, sB) exchanges T[sT + k] with B[sB + h-1-k] for k = 0..h-1 (it is a slice
// between rotated rings).  The product of four window swaps  W(s,y) W(s,y+1) W(s,y) W(s-1,y)  is a 3-cycle (one cell of one ring and two neighbouring cells of the other ring),
// and such a cycle conjugated by a few more window swaps moves any cell into any place.  So the cells are put in place one after the other, each with one 3-cycle ("commutator"
// macro) that only touches cells not yet placed.  B: first the four dominos are brought into two clusters of two (at most three slices, found by a search over the domino
// positions), arranged by a second search, and the other cells are sorted with the window swaps that keep clear of the clusters (they are always legal); a last slice
// turns the clustered shape back into the cube shape.
(function (root) {
  'use strict';
  const isWorker = typeof window === 'undefined' && typeof importScripts === 'function';
  if (isWorker) importScripts('sq1-core.js', 'solver-small-core.js');
  const SQ = root.SQ1;

  /* ---------- sizes ---------- */
  const MODELS = {};
  function getModel(P) {
    const Ly = SQ.layout(P), key = Ly.P;
    if (MODELS[key] !== undefined) return MODELS[key];
    const S = Ly.S, np = Ly.widths.length, W = Ly.widths;
    let M = null;
    const uniform = W.every((w) => w === W[0]);
    if (uniform && W[0] === 1 && S % 4 === 0 && S >= 12) M = { kind: 'A' };
    else if (uniform && np <= 6) M = { kind: 'U' };
    else if (!uniform && np >= 10 && np % 4 === 2 && W.every((w, i) => w === ((i === 0 || i === np / 2) ? 2 : 1)) && S === np + 2) M = { kind: 'B' };
    if (M) {
      M.Ly = Ly; M.S = S; M.h = S / 2; M.np = np; M.w = W[0];
      const homeOf = new Int16Array(S); W.forEach((w, p) => { for (let q = 0; q < w; q++) homeOf[Ly.starts[p] + q] = p; });
      M.homeOf = homeOf;
      M.face = new Int16Array(S); for (let th = 0; th < S; th++) M.face[th] = SQ.faceOfSector(Ly, th);
    }
    MODELS[key] = M; return M;
  }
  // piece id, class of a sector cell (cells of one class cannot be told apart), dominos are all different
  function pieceOf(M, id) { return (id >= M.S ? M.np : 0) + M.homeOf[id % M.S]; }
  function isDom(M, id) { return M.Ly.widths[M.homeOf[id % M.S]] === 2; }
  function clsOf(M, id) { return isDom(M, id) ? 100 + id : (id >= M.S ? 4 : 0) + M.face[id % M.S]; }

  /* ---------- the plain model of the engine on cell arrays (used to check and to run the shape searches) ---------- */
  function mod(a, n) { return ((a % n) + n) % n; }
  function rotArr(a, k) { const n = a.length; k = mod(k, n); if (!k) return; const o = Int16Array.from(a); for (let j = 0; j < n; j++) a[(j + k) % n] = o[j]; }
  function legalArr(M, T, B) {
    const S = M.S, h = M.h;
    for (const r of [T, B]) if (pieceOf(M, r[S - 1]) === pieceOf(M, r[0]) || pieceOf(M, r[h - 1]) === pieceOf(M, r[h])) return false;
    return true;
  }
  function sliceArr(M, T, B, side) {
    if (!legalArr(M, T, B)) return false;
    const h = M.h, o = side ? h : 0, t0 = T.slice(o, o + h), b0 = B.slice(o, o + h);
    for (let i = 0; i < h; i++) { T[o + i] = b0[h - 1 - i]; B[o + h - 1 - i] = t0[i]; }
    return true;
  }
  // run a plan on (ids, m0, m1): returns the final state or null if a slice is illegal
  function runPlan(M, ids, m0, m1, plan) {
    const S = M.S, T = ids.slice(0, S), B = ids.slice(S, 2 * S); let a = m0, b = m1;
    for (const mv of plan) {
      if (mv.t === 'r') rotArr(mv.l ? B : T, mv.s);
      else { if (!sliceArr(M, T, B, mv.h)) return null; if (mv.h) b ^= 1; else a ^= 1; }
    }
    const out = new Int16Array(2 * S); out.set(T, 0); out.set(B, S); return { ids: out, m0: a, m1: b };
  }
  function solvedIds(M) { const o = new Int16Array(2 * M.S); for (let i = 0; i < o.length; i++) o[i] = i; return o; }
  function isSolvedIds(M, st) {
    if (st.m0 !== 0 || st.m1 !== 0) return false;
    for (let i = 0; i < 2 * M.S; i++) { const c = st.ids[i]; if (isDom(M, i)) { if (c !== i) return false; } else if (clsOf(M, c) !== clsOf(M, i)) return false; }
    return true;
  }

  /* ---------- window swaps ---------- */
  // the logical frame: the cell positions of the model are fixed, the real rings are turned by (oT, oB) against it
  function Walker(M, ids) {
    const S = M.S, h = M.h, w = { M: M, lg: Int16Array.from(ids), plan: [], o: [0, 0], swaps: 0 };
    w.rot = (l, target) => { let d = mod(target - w.o[l], S); if (d > S / 2) d -= S; if (d) w.plan.push({ t: 'r', l: l, s: d }); w.o[l] = mod(target, S); };
    w.firstSide = 0;
    w.swap = (sT, sB) => {          // window swap + the moves for it (the first one may use the other half of the middle layer: that decides the flip of the right half)
      sT = mod(sT, S); sB = mod(sB, S);
      const side = w.swaps === 0 ? w.firstSide : 0, off = side ? h : 0;
      w.rot(0, off - sT); w.rot(1, off - sB); w.plan.push({ t: 's', h: side });
      const lg = w.lg;
      for (let k = 0; k < h; k++) { const x = (sT + k) % S, y = S + (sB + h - 1 - k) % S, t = lg[x]; lg[x] = lg[y]; lg[y] = t; }
      w.swaps++;
    };
    w.home = () => { w.rot(0, 0); w.rot(1, 0); };
    // the real rings are turned against the logical frame by w.o; make the logical frame the real one (no move)
    w.reframe = () => {
      for (let l = 0; l < 2; l++) { const base = l * S, o = w.o[l]; if (!o) continue; const old = w.lg.slice(base, base + S); for (let x = 0; x < S; x++) w.lg[base + (x + o) % S] = old[x]; w.o[l] = 0; }
    };
    return w;
  }
  // position of the content of pos after the window swap
  function imgPos(S, h, pos, sT, sB) {
    if (pos < S) { const k = mod(pos - sT, S); return k < h ? S + (sB + h - 1 - k) % S : pos; }
    const k2 = mod(pos - S - sB, S); return k2 < h ? (sT + h - 1 - k2) % S : pos;
  }

  /* ---------- the 3-cycle macros ---------- */
  // F1(s, y) = W(s,y) W(s,y+1) W(s,y) W(s-1,y): a 3-cycle on T[s-1], B[y+h-1], B[y+h];  F2 is the same with the rings exchanged: B[s-1], T[y+h-1], T[y+h].
  function f1(s, y) { return [[s, y], [s, y + 1], [s, y], [s - 1, y]]; }
  function f2(s, y) { return [[y, s], [y + 1, s], [y, s], [y, s - 1]]; }
  function Macros(M, valid) {
    const S = M.S, h = M.h, mc = { M: M };
    // orientation of F1 / F2: does the content of the lone cell go to the lower or to the upper cell of the pair?
    function dir(fn, loneRing) {
      const lg = new Int16Array(2 * S); for (let i = 0; i < 2 * S; i++) lg[i] = i;
      const s = 6 % S, y = 7 % S, word = fn(s, y), lone = loneRing * S + mod(s - 1, S), lo = (1 - loneRing) * S + mod(y + h - 1, S);
      for (const [a, b] of word) for (let k = 0; k < h; k++) { const x = (mod(a, S) + k) % S, yy = S + (mod(b, S) + h - 1 - k) % S, t = lg[x]; lg[x] = lg[yy]; lg[yy] = t; }
      return lg[lo] === lone;          // the content of the lone cell is now in the lower cell
    }
    const d1 = dir(f1, 0), d2 = dir(f2, 1);
    // word that moves the content of u to v, of v to w and of w to u (positions 0..2S-1), or null
    mc.word = (u, v, w) => {
      const c = [u, v, w], r = c.map((x) => (x >= S ? 1 : 0));
      let lone = -1;
      if (r[0] === r[1] && r[2] !== r[0]) lone = 2; else if (r[0] === r[2] && r[1] !== r[0]) lone = 1; else if (r[1] === r[2] && r[0] !== r[1]) lone = 0; else return null;
      const a = (lone + 1) % 3, b = (lone + 2) % 3, ia = c[a] % S, ib = c[b] % S;
      let lo, up;          // lower / upper cell of the adjacent pair (in the order of the cycle lone -> a -> b)
      if (mod(ib - ia, S) === 1) { lo = a; up = b; } else if (mod(ia - ib, S) === 1) { lo = b; up = a; } else return null;
      const L = r[lone], idx = c[lone] % S, lo0 = c[lo] % S, s = mod(idx + 1, S), y = mod(lo0 - h + 1, S);
      const word = (L === 0 ? f1 : f2)(s, y).map((q) => [mod(q[0], S), mod(q[1], S)]);
      if (!word.every((q) => valid(q[0], q[1]))) return null;
      // the cycle of the word runs lone -> lo -> up -> lone when its flag is true; we need the cycle lone -> a -> b
      const flag = L === 0 ? d1 : d2, want = (lo === a);          // lone -> a -> b is lone -> lo -> up when a is the lower cell
      return flag === want ? word : word.slice().reverse();
    };
    return mc;
  }

  /* ---------- sorting the cells with 3-cycles ---------- */
  // lg: positions -> cell ids (the walker's), tg: positions -> the cell ids the target holds, active[pos]: positions that take part, omega: [[sT, sB], ...] the usable window swaps
  function sortCells(M, wk, tg, active, valid, omega, opts) {
    const S = M.S, h = M.h, N2 = 2 * S, lg = wk.lg, mc = Macros(M, valid);
    // assignment: every cell gets a place of its own class; places already right stay
    const dest = new Int32Array(N2).fill(-1), cellAt = new Int32Array(N2), posOf = new Int32Array(N2).fill(-1);
    const byClass = new Map();
    for (let p = 0; p < N2; p++) if (active[p]) { const c = clsOf(M, tg[p]); if (!byClass.has(c)) byClass.set(c, { cur: [], want: [] }); byClass.get(c).want.push(p); }
    for (let p = 0; p < N2; p++) if (active[p]) { const c = clsOf(M, lg[p]), e = byClass.get(c); if (!e) return false; e.cur.push(p); }
    for (const e of byClass.values()) {
      if (e.cur.length !== e.want.length) return false;
      const wantSet = new Set(e.want), rest = [], left = [];
      for (const p of e.cur) { if (wantSet.has(p)) { dest[lg[p]] = p; wantSet.delete(p); } else rest.push(p); }
      for (const p of e.want) if (wantSet.has(p)) left.push(p);
      rest.forEach((p, i) => { dest[lg[p]] = left[i]; });
    }
    function parityOdd() {          // parity of the permutation cell position -> destination
      const seen = new Uint8Array(N2); let odd = 0;
      for (let p = 0; p < N2; p++) { if (!active[p] || seen[p]) continue; let q = p, len = 0; while (!seen[q]) { seen[q] = 1; q = dest[lg[q]]; len++; } if (len % 2 === 0) odd ^= 1; }
      return odd;
    }
    if (parityOdd()) {          // two cells of one class swap their places (needs a class of two cells that are not both right)
      let done = false;
      for (const e of byClass.values()) {
        if (done) break;
        const bad = e.cur.filter((p) => dest[lg[p]] !== p);
        if (bad.length >= 2) { const a = lg[bad[0]], b = lg[bad[1]], t = dest[a]; dest[a] = dest[b]; dest[b] = t; done = true; }
      }
      if (!done) for (const e of byClass.values()) { if (done) break; if (e.cur.length >= 2) { const a = lg[e.cur[0]], b = lg[e.cur[1]], t = dest[a]; dest[a] = dest[b]; dest[b] = t; done = true; } }
      if (!done || parityOdd()) return false;
    }
    for (let p = 0; p < N2; p++) if (active[p]) { posOf[lg[p]] = p; }
    const fixed = new Uint8Array(N2);
    for (let p = 0; p < N2; p++) if (active[p] && dest[lg[p]] === p) fixed[p] = 1;
    function doSwap(sT, sB) {
      wk.swap(sT, sB);
      for (let k = 0; k < h; k++) { const x = (sT + k) % S, y = S + (sB + h - 1 - k) % S; posOf[lg[x]] = x; posOf[lg[y]] = y; }
    }
    // the search: positions of the two cells (u, v) under the window swaps already chosen
    // omega: the window swaps used to bring the cells to the macros; opts.omegaFull: all of them, tried when the short list finds nothing
    let OT = omega.map((o) => o[0]), OB = omega.map((o) => o[1]), NO = omega.length;
    function useOmega(list) { OT = list.map((o) => o[0]); OB = list.map((o) => o[1]); NO = list.length; }
    const vis = new Int32Array(N2 * N2), par = [], viaW = [], qu = [], qv = [];
    let stamp = 0;
    function thirds(u, v, out) {
      out.length = 0;
      const ru = u >= S ? 1 : 0, rv = v >= S ? 1 : 0, iu = u % S, iv = v % S;
      if (ru === rv) {
        if (mod(iu - iv, S) === 1 || mod(iv - iu, S) === 1) { const base = (1 - ru) * S; for (let i = 0; i < S; i++) out.push(base + i); }
      } else {
        out.push(ru * S + mod(iu + 1, S), ru * S + mod(iu - 1, S), rv * S + mod(iv + 1, S), rv * S + mod(iv - 1, S));
      }
    }
    const th = [];
    function find(p, q) {          // returns { g: [window indices], mac: word, z } or null
      stamp++; qu.length = 0; qv.length = 0; par.length = 0; viaW.length = 0;
      qu.push(p); qv.push(q); par.push(-1); viaW.push(-1); vis[p * N2 + q] = stamp;
      for (let qi = 0; qi < qu.length; qi++) {
        const u = qu[qi], v = qv[qi];
        thirds(u, v, th);
        if (th.length) {
          let g = null;
          for (let ci = 0; ci < th.length; ci++) {
            const w = th[ci]; if (!active[w] || w === u || w === v) continue;
            // the cell that ends up at w after the conjugating swaps
            if (g === null) { g = []; for (let x = qi; par[x] >= 0; x = par[x]) g.push(viaW[x]); g.reverse(); }
            let z = w; for (let k = g.length - 1; k >= 0; k--) z = imgPos(S, h, z, OT[g[k]], OB[g[k]]);
            if (fixed[z] || z === p || z === q) continue;
            const mac = mc.word(u, v, w); if (!mac) continue;
            api.stat.finds++; api.stat.states += qu.length; api.stat.depth[g.length] = (api.stat.depth[g.length] || 0) + 1;
            return { g: g.map((o) => [OT[o], OB[o]]), mac: mac, z: z };
          }
        }
        if (opts && opts.maxDepth !== undefined) { let d = 0; for (let x = qi; par[x] >= 0; x = par[x]) d++; if (d >= opts.maxDepth) continue; }
        for (let o = 0; o < NO; o++) {
          const nu = imgPos(S, h, u, OT[o], OB[o]), nv = imgPos(S, h, v, OT[o], OB[o]), key = nu * N2 + nv;
          if (vis[key] === stamp) continue; vis[key] = stamp; qu.push(nu); qv.push(nv); par.push(qi); viaW.push(o);
        }
      }
      return null;
    }
    let vis3 = null, st3 = 0;
    function findTriple(p, q) {          // like find, but with the third cell chosen first (breadth first search over the three positions)
      if (N2 > 200) return null;
      api.stat.triple++;
      if (!vis3) vis3 = new Int32Array(N2 * N2 * N2);
      const cand = []; for (let z = 0; z < N2; z++) if (active[z] && !fixed[z] && z !== p && z !== q) cand.push(z);
      for (const z0 of cand) {
        st3++;
        const A = [p], Bq = [q], C = [z0], pr = [-1], vw = [-1];
        vis3[(p * N2 + q) * N2 + z0] = st3;
        for (let qi = 0; qi < A.length; qi++) {
          const mac = mc.word(A[qi], Bq[qi], C[qi]);
          if (mac) { const g = []; for (let x = qi; pr[x] >= 0; x = pr[x]) g.push(vw[x]); g.reverse(); return { g: g.map((o) => [OT[o], OB[o]]), mac: mac, z: z0 }; }
          for (let o = 0; o < NO; o++) {
            const a = imgPos(S, h, A[qi], OT[o], OB[o]), b = imgPos(S, h, Bq[qi], OT[o], OB[o]), c = imgPos(S, h, C[qi], OT[o], OB[o]), key = (a * N2 + b) * N2 + c;
            if (vis3[key] === st3) continue; vis3[key] = st3; A.push(a); Bq.push(b); C.push(c); pr.push(qi); vw.push(o);
          }
        }
      }
      return null;
    }
    // order of the places: the two rings alternately
    const order = []; for (let i = 0; i < S; i++) { if (active[i]) order.push(i); if (active[S + i]) order.push(S + i); }
    let queue = order.filter((p) => !fixed[p]), stuck = 0;
    while (queue.length) {
      const q = queue.shift();
      if (fixed[q]) continue;
      const c = lg[q]; if (dest[c] === q) { fixed[q] = 1; continue; }
      let src = -1; for (let p = 0; p < N2; p++) if (active[p] && !fixed[p] && dest[lg[p]] === q) { src = p; break; }
      if (src < 0) return false;
      let r = find(src, q);
      if (!r && opts && opts.omegaFull) { useOmega(opts.omegaFull); r = find(src, q); if (!r && (queue.length < 12 || N2 <= 64)) r = findTriple(src, q); useOmega(omega); }
      if (!r && (queue.length < 12 || N2 <= 64)) r = findTriple(src, q);          // near the end only a few cells are free: search for the exact third cell as well
      if (!r) { queue.push(q); if (++stuck > queue.length + 2) return false; continue; }
      stuck = 0;
      for (const o of r.g) doSwap(o[0], o[1]);
      for (const [a, b] of r.mac) doSwap(a, b);
      for (let k = r.g.length - 1; k >= 0; k--) doSwap(r.g[k][0], r.g[k][1]);
      if (dest[lg[q]] !== q) return false;
      fixed[q] = 1;
    }
    return true;
  }

  /* ---------- family A ---------- */
  function solveA(M, ids, m0, m1) {
    const S = M.S, wk = Walker(M, ids);
    wk.firstSide = m1;          // the first slice decides the flip of the right half, every later one flips the left half; the macros below use an even number of them
    if (m0 !== m1) wk.swap(0, 0);
    const tg = solvedIds(M), active = new Uint8Array(2 * S).fill(1), omega = [], h = M.h, full = [];
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) { if (a === 0 || a === h || b === 0 || b === h) omega.push([a, b]); full.push([a, b]); }          // (a window that starts at 0 or h in one ring: every cell is in one of those)
    if (!sortCells(M, wk, tg, active, () => true, omega, S <= 48 ? { omegaFull: full } : null)) return null;
    wk.home();
    return wk.plan;
  }


  /* ---------- family B: the dominos ---------- */
  function ringStarts(M, lg, base) {          // the dominos of a ring: start cell and the piece
    const S = M.S, out = [];
    for (let i = 0; i < S; i++) {
      const a = lg[base + i]; if (!isDom(M, a)) continue;
      const pa = pieceOf(M, a);
      if (pa === pieceOf(M, lg[base + (i + 1) % S]) && pa !== pieceOf(M, lg[base + (i - 1 + S) % S])) out.push({ d: i, l: pa });
    }
    return out;
  }
  function normRing(S, list) {          // the shape of a ring up to turning it
    if (!list.length) return '-';
    let best = null;
    for (const r of list) {
      const rel = list.map((e) => mod(e.d - r.d, S)).sort((x, y) => x - y);
      if (best === null) best = rel; else { for (let i = 0; i < rel.length; i++) { if (rel[i] < best[i]) { best = rel; break; } if (rel[i] > best[i]) break; } }
    }
    return best.join(',');
  }
  function shapeKey(S, Ts, Bs) { return normRing(S, Ts) + '|' + normRing(S, Bs); }
  // every legal window swap (sT, sB) on the dominos Ts, Bs (lists of { d: start cell, l: label }): cb(sT, sB, newTs, newBs)
  function expandShape(M, Ts, Bs, cb) {
    const S = M.S, h = M.h;
    function prep(list) {
      const res = [];
      for (let s = 0; s < S; s++) {
        let ok = true; const keep = [], move = [];
        for (const e of list) {
          if (mod(e.d + 1 - s, S) === 0 || mod(e.d + 1 - s - h, S) === 0) { ok = false; break; }
          const k = mod(e.d - s, S);
          if (k <= h - 2) move.push({ k: k, l: e.l }); else keep.push(e);
        }
        res.push(ok ? { keep: keep, move: move } : null);
      }
      return res;
    }
    const pT = prep(Ts), pB = prep(Bs);
    for (let sT = 0; sT < S; sT++) {
      const a = pT[sT]; if (!a) continue;
      for (let sB = 0; sB < S; sB++) {
        const b = pB[sB]; if (!b) continue;
        const nT = a.keep.slice(), nB = b.keep.slice();
        for (const e of b.move) nT.push({ d: mod(sT + h - 2 - e.k, S), l: e.l });
        for (const e of a.move) nB.push({ d: mod(sB + h - 2 - e.k, S), l: e.l });
        cb(sT, sB, nT, nB);
      }
    }
  }
  function parseShape(key) {
    const parts = key.split('|');
    return parts.map((p) => (p === '-' ? [] : p.split(',').map((x) => ({ d: +x, l: 0 }))));
  }
  function shapeTable(M) {          // shapes at most two slices from the clustered shape (every shape is at most three away)
    if (M.shapeTab) return M.shapeTab;
    const tab = new Map(), K = '0,2|0,2'; tab.set(K, { d: 0, par: null });
    let frontier = [K];
    for (let lvl = 1; lvl <= 2; lvl++) {
      const next = [];
      for (const key of frontier) {
        const sh = parseShape(key);
        expandShape(M, sh[0], sh[1], (sT, sB, nT, nB) => { const k2 = shapeKey(M.S, nT, nB); if (!tab.has(k2)) { tab.set(k2, { d: lvl, par: key }); next.push(k2); } });
      }
      frontier = next;
    }
    return (M.shapeTab = tab);
  }
  // the clustered shape: two dominos side by side in each ring.  Turn the rings so that the clusters start at 0 (and make that the logical frame).
  function clusterStart(S, list) {
    if (list.length !== 2) return -1;
    if (mod(list[1].d - list[0].d, S) === 2) return list[0].d;
    if (mod(list[0].d - list[1].d, S) === 2) return list[1].d;
    return -1;
  }
  function normalizeCluster(M, wk) {
    const S = M.S, cT = clusterStart(S, ringStarts(M, wk.lg, 0)), cB = clusterStart(S, ringStarts(M, wk.lg, S));
    if (cT < 0 || cB < 0) return false;
    wk.rot(0, -cT); wk.rot(1, -cB); wk.reframe(); return true;
  }
  function arrangementOf(M, lg) { return [pieceOf(M, lg[0]), pieceOf(M, lg[2]), pieceOf(M, lg[M.S]), pieceOf(M, lg[M.S + 2])]; }
  // labelled shape of the dominos up to turning the rings: for each ring the cyclic sequence of (label, gap to the next domino)
  function labeledKey(S, Ts, Bs) {
    function ring(list) {
      if (!list.length) return '-';
      const L = list.slice().sort((a, b) => a.d - b.d), n = L.length; let best = null;
      for (let r = 0; r < n; r++) {
        const parts = []; for (let i = 0; i < n; i++) { const a = L[(r + i) % n], b = L[(r + i + 1) % n]; parts.push(a.l + ':' + (mod(b.d - a.d, S) || S)); }
        const str = parts.join(','); if (best === null || str < best) best = str;
      }
      return best;
    }
    return ring(Ts) + '|' + ring(Bs);
  }
  // all labelled shapes at exactly 0, 1, .., depth slices from (Ts, Bs): levels[d] = Map key -> { rep: [Ts, Bs], prev: key one level nearer }
  function labeledLevels(M, Ts, Bs, depth) {
    const S = M.S, levels = [new Map([[labeledKey(S, Ts, Bs), { rep: [Ts, Bs], prev: null }]])];
    for (let d = 1; d <= depth; d++) {
      const nxt = new Map();
      for (const [k, e] of levels[d - 1]) expandShape(M, e.rep[0], e.rep[1], (sT, sB, nT, nB) => { const k2 = labeledKey(S, nT, nB); if (!nxt.has(k2)) nxt.set(k2, { rep: [nT, nB], prev: k }); });
      levels.push(nxt);
    }
    return levels;
  }
  function ksolState(M) {          // the clustered shape one slice from the solved state: { T, B } (cluster at 0..3 in both rings)
    const S = M.S, h = M.h, T = new Int16Array(S), B = new Int16Array(S);
    for (let i = 0; i < S; i++) { T[i] = i; B[i] = S + i; }
    sliceArr(M, T, B, 0);
    rotArr(T, -(h - 2)); rotArr(B, -(h - 2));
    return { T: T, B: B };
  }

  function fail(n) { api.lastFail = n; return null; }
  function solveB(M, ids, m0, m1) {
    const S = M.S, h = M.h, wk = Walker(M, ids), tab = shapeTable(M), K = '0,2|0,2';
    wk.firstSide = m1;
    // phase 1: the clustered shape
    for (let guard = 0; guard < 5; guard++) {
      const Ts = ringStarts(M, wk.lg, 0), Bs = ringStarts(M, wk.lg, S);
      if (Ts.length + Bs.length !== 4) return fail(1);
      const key = shapeKey(S, Ts, Bs); if (key === K) break;
      const ent = tab.get(key); let want = null, bestD = 99, pick = null;
      if (ent) want = ent.par;
      expandShape(M, Ts, Bs, (sT, sB, nT, nB) => {
        const k2 = shapeKey(S, nT, nB);
        if (want !== null) { if (k2 === want && !pick) pick = [sT, sB]; } else { const e2 = tab.get(k2); if (e2 && e2.d < bestD) { bestD = e2.d; pick = [sT, sB]; } }
      });
      if (!pick) return fail(2);
      wk.swap(pick[0], pick[1]);
    }
    if (!normalizeCluster(M, wk)) return fail(3);
    const nShape = wk.swaps;
    // phase 2: arrange the dominos like the clustered state next to the solved state.  The slices of the whole plan must have the parity of m0 + m1 (the last slice, below, is one more).
    const ks = ksolState(M), tgtArr = [pieceOf(M, ks.T[0]), pieceOf(M, ks.T[2]), pieceOf(M, ks.B[0]), pieceOf(M, ks.B[2])];
    const needPar = (m0 + m1 + 1 + wk.swaps) & 1;
    {
      const tT = [{ d: 0, l: tgtArr[0] }, { d: 2, l: tgtArr[1] }], tB = [{ d: 0, l: tgtArr[2] }, { d: 2, l: tgtArr[3] }];
      const back = M.tgtLevels || (M.tgtLevels = labeledLevels(M, tT, tB, 2));
      const T0 = ringStarts(M, wk.lg, 0), B0 = ringStarts(M, wk.lg, S);
      let fwd = labeledLevels(M, T0, B0, 1), best = null;
      const search = () => {
        for (let a = 0; a < fwd.length; a++) for (let b = 0; b < back.length; b++) {
          if (((a + b) & 1) !== needPar || (best && best.a + best.b <= a + b)) continue;
          for (const k of fwd[a].keys()) if (back[b].has(k)) { best = { a: a, b: b, k: k }; break; }
        }
      };
      search();
      if (!best) { fwd = labeledLevels(M, T0, B0, 2); search(); }          // (a path of one more slice is rarely needed: only for the parity)
      if (!best) return fail(4);
      const keys = []; let k = best.k;
      for (let a = best.a; a > 0; a--) { keys.push(k); k = fwd[a].get(k).prev; } keys.push(k); keys.reverse();          // start ... meeting state
      k = best.k; for (let b = best.b; b > 0; b--) { k = back[b].get(k).prev; keys.push(k); }          // ... target
      for (let i = 0; i + 1 < keys.length; i++) {
        const Ts = ringStarts(M, wk.lg, 0), Bs = ringStarts(M, wk.lg, S); let pick = null;
        expandShape(M, Ts, Bs, (sT, sB, nT, nB) => { if (!pick && labeledKey(S, nT, nB) === keys[i + 1]) pick = [sT, sB]; });
        if (!pick) return fail(5);
        wk.swap(pick[0], pick[1]);
      }
      if (!normalizeCluster(M, wk)) return fail(5);
      if (arrangementOf(M, wk.lg).join() !== tgtArr.join()) return fail(5);
    }
    // phase 3: the other cells.  Window swaps with both windows inside 4..h keep clear of the clusters (always legal).
    const N2 = 2 * S, tg = new Int16Array(N2), active = new Uint8Array(N2);
    for (let i = 0; i < S; i++) { tg[i] = ks.T[i]; tg[S + i] = ks.B[i]; if (i >= 4) { active[i] = 1; active[S + i] = 1; } }
    for (let i = 0; i < 4; i++) if (wk.lg[i] !== tg[i] || wk.lg[S + i] !== tg[S + i]) return fail(6);
    const omega = [], full = [];
    for (let a = 4; a <= h; a++) for (let b = 4; b <= h; b++) { if (a === 4 || a === h || b === 4 || b === h) omega.push([a, b]); full.push([a, b]); }
    if (!sortCells(M, wk, tg, active, (a, b) => a >= 4 && a <= h && b >= 4 && b <= h, omega, S <= 64 ? { omegaFull: full } : null)) return fail(7);
    // phase 4: the slice back to the cube shape
    wk.swap(mod(2 - h, S), mod(2 - h, S));          // (the rings now stand as they are: the logical frame is turned against them)
    return wk.plan;
  }


  /* ---------- family U: P = 2, 4, 6 slots per ring (widths 6, 3, 2 sectors), a Schreier-Sims chain over the cell permutations ---------- */
  // points: top slots 0..P-1, bottom slots P..2P-1, then the flip of the right half (2 points) and of the left half (2 points); a slice swaps the two points of its half
  function uPerms(M) {
    const np = M.np, h = np / 2, N = 2 * np + 4, gens = [];
    const id = () => { const p = new Array(N); for (let i = 0; i < N; i++) p[i] = i; return p; };
    for (let l = 0; l < 2; l++) for (const d of [1, -1]) { const p = id(); for (let s = 0; s < np; s++) p[l * np + s] = l * np + mod(s + d, np); gens.push(p); }
    for (let side = 0; side < 2; side++) {
      const p = id(), base = side * h;
      for (let i = 0; i < h; i++) { const a = base + i, b = np + base + h - 1 - i; p[a] = b; p[b] = a; }
      p[2 * np + 2 * side] = 2 * np + 2 * side + 1; p[2 * np + 2 * side + 1] = 2 * np + 2 * side;
      gens.push(p, p);          // (an involution is its own inverse: the pair index ^ 1)
    }
    return { N: N, perms: gens, solved: Uint8Array.from({ length: N }, (_, i) => i) };
  }
  function uChain(M) {
    if (M.chain) return M.chain;
    if (!root.RBSmall) return null;
    const spec = uPerms(M), r = root.RBSmall.makeChainChecked(spec, [null].concat([]).map(() => Array.from({ length: spec.N }, (_, i) => spec.N - 1 - i)), { totalMs: 60000, polishMs: 1500, tests: 12, steps: 120 });
    if (!r.ok) return null;
    return (M.chain = { chain: r.chain, spec: spec });
  }
  function solveU(M, ids, m0, m1) {
    const ch = uChain(M); if (!ch) return null;
    const np = M.np, w = M.w, N = ch.spec.N, col = new Uint8Array(N);
    for (let i = 0; i < 2 * np; i++) col[i] = ids[i];
    col[2 * np] = m0 ? 2 * np + 1 : 2 * np; col[2 * np + 1] = m0 ? 2 * np : 2 * np + 1;
    col[2 * np + 2] = m1 ? 2 * np + 3 : 2 * np + 2; col[2 * np + 3] = m1 ? 2 * np + 2 : 2 * np + 3;
    // (the slice of side 0 is the first half in the engine: its flip point pair is index 0, side 1 -> 1; m0 is the flip of side 0)
    const word = ch.chain.solve(col, ch.spec.solved, 400000);
    if (!word) return null;
    const plan = [];
    for (const m of word) {
      const b = m >> 1;
      if (b < 2) plan.push({ t: 'r', l: b, s: (m & 1 ? -1 : 1) * w }); else plan.push({ t: 's', h: b - 2 });
    }
    return plan;
  }
  function simU(M, ids, m0, m1, plan, hook) {          // state after each move of the plan
    const np = M.np, w = M.w, h = np / 2, T = Array.from(ids.slice(0, np)), B = Array.from(ids.slice(np, 2 * np)); let a = m0, b = m1;
    hook(T, B, a, b);
    for (const mv of plan) {
      if (mv.t === 'r') { const r = mv.l ? B : T, k = mod(mv.s / w, np), o = r.slice(); for (let j = 0; j < np; j++) r[(j + k) % np] = o[j]; }
      else { const side = mv.h ? 1 : 0, base = side * h, t0 = T.slice(), b0 = B.slice(); for (let i = 0; i < h; i++) { T[base + i] = b0[base + h - 1 - i]; B[base + h - 1 - i] = t0[base + i]; } if (side) b ^= 1; else a ^= 1; }
      hook(T, B, a, b);
    }
  }

  /* ---------- the answer ---------- */
  function mergePlan(plan, S) {
    const out = [];
    for (const m of plan) {
      const last = out[out.length - 1];
      if (m.t === 'r' && last && last.t === 'r' && last.l === m.l) last.s += m.s;
      else if (m.t === 's' && last && last.t === 's' && last.h === m.h) out.pop();          // two equal slices cancel
      else out.push({ t: m.t, l: m.l, s: m.s, h: m.h });
      const l2 = out[out.length - 1];
      if (l2 && l2.t === 'r') { l2.s = mod(l2.s, S); if (l2.s > S / 2) l2.s -= S; if (!l2.s) out.pop(); }
    }
    return out.map((m) => (m.t === 'r' ? { t: 'r', l: m.l, s: m.s } : { t: 's', h: m.h | 0 }));
  }
  function solveModel(P, ids, m0, m1) {
    const M = getModel(P); if (!M) return null;
    let plan = null;
    if (M.kind === 'A') plan = solveA(M, ids, m0, m1);
    else if (M.kind === 'B') plan = solveB(M, ids, m0, m1);
    else if (M.kind === 'U') plan = solveU(M, ids, m0, m1);
    if (!plan) return null;
    plan = mergePlan(plan, M.S);
    if (M.kind === 'U') {
      let fin = null; simU(M, ids, m0, m1, plan, (T, B, a, b) => { fin = [T.concat(B), a, b]; });
      if (!fin || fin[1] || fin[2] || fin[0].some((v, i) => v !== i)) return null;
    } else {
      const fin = runPlan(M, ids, m0, m1, plan);
      if (!fin || !isSolvedIds(M, fin)) return null;
    }
    return plan;
  }
  function hashState(ids, m0, m1) {
    let a = 0x811c9dc5 | 0, b = 0x9e3779b9 | 0;
    for (let i = 0; i < ids.length; i++) { const v = ids[i] + 1; a = Math.imul(a ^ v, 16777619); b = Math.imul(b + v * 31 + i, 0x85ebca6b); b ^= b >>> 13; }
    a = Math.imul(a ^ (m0 * 2 + m1 + 7), 16777619);
    return (a >>> 0) * 1048576 + ((b >>> 0) & 0xFFFFF);
  }
  // hashes of the states before every move of the plan and after the last (the page finds its place in the plan by them)
  function planKeys(P, ids, m0, m1, plan) {
    const M = getModel(P), keys = [];
    if (M.kind === 'U') { simU(M, ids, m0, m1, plan, (T, B, a, b) => { keys.push(hashState(T.concat(B), a, b)); }); return keys; }
    const S = M.S, T = ids.slice(0, S), B = ids.slice(S, 2 * S); let a = m0, b = m1;
    const cur = new Int16Array(2 * S);
    const push = () => { cur.set(T, 0); cur.set(B, S); keys.push(hashState(cur, a, b)); };
    push();
    for (const mv of plan) {
      if (mv.t === 'r') rotArr(mv.l ? B : T, mv.s); else { sliceArr(M, T, B, mv.h); if (mv.h) b ^= 1; else a ^= 1; }
      push();
    }
    return keys;
  }
  // the state of the engine as cell ids: [top ring, bottom ring] (id = origin * S + sector in the solved shape; the origin is 0 for the pieces that started in the top layer)
  function readIds(M, Sx) {
    if (M.kind === 'U') {          // whole pieces: slot s of a ring = the piece at the sectors s*w .. s*w+w-1 (null if a ring is not turned by whole pieces)
      const np = M.np, w = M.w, S = M.S, o2 = new Int16Array(2 * np);
      for (let l = 0; l < 2; l++) {
        const row = Sx.layers[l];
        for (let k = 0; k < np; k++) {
          const o = row[k * w]; if (row[k * w + w - 1] !== o || row[(k * w - 1 + S) % S] === o) return null;
          o2[l * np + k] = (o.up ? 0 : 1) * np + o.home;
        }
      }
      return o2;
    }
    const S = M.S, W = M.Ly.widths, out = new Int16Array(2 * S);
    for (let l = 0; l < 2; l++) {
      const row = Sx.layers[l];
      for (let j = 0; j < S; j++) {
        const o = row[j]; let t = 0; while (t < S && row[(j - t - 1 + 2 * S) % S] === o) t++;
        const wd = W[o.home], th = M.Ly.starts[o.home] + (o.flip ? wd - 1 - t : t);
        out[l * S + j] = (o.up ? 0 : 1) * S + th;
      }
    }
    return out;
  }
  const api = { stat: { finds: 0, states: 0, depth: {}, triple: 0 }, hashState: hashState, planKeys: planKeys, _expand: expandShape, _shapeKey: shapeKey, _normRing: normRing, _clusterStart: clusterStart, _ksol: ksolState, _pieceOf: pieceOf, _solveA: solveA, _solveB: solveB, _M: () => MODELS, _merge: mergePlan, getModel: getModel, readIds: readIds, solveModel: solveModel, runPlan: runPlan, isSolvedIds: isSolvedIds };
  root.SQ1N = api;

  /* ---------- worker side ---------- */
  if (isWorker) {
    root.onmessage = function (ev) {
      const m = ev.data;
      try {
        if (m.cmd === 'init') root.postMessage({ cmd: 'init' });
        else if (m.cmd === 'solve') {
          const t0 = Date.now(), ids = Int16Array.from(m.ids), plan = solveModel(m.P, ids, m.m0, m.m1);
          root.postMessage({ cmd: 'plan', id: m.id, plan: plan, keys: plan ? planKeys(m.P, ids, m.m0, m.m1, plan) : null, ms: Date.now() - t0 });
        }
      } catch (e) { root.postMessage({ cmd: 'plan', id: m.id, plan: null, error: String(e && e.message || e) }); }
    };
    return;
  }

  /* ---------- page side: registered with the hook of sq1.js ---------- */
  if (typeof window !== 'undefined') {
    const PS = { worker: null, failed: false, pending: false, id: 0, plan: null, keys: null, sync: false, pos: 0, P: 0 };
    function startWorker() {
      if (PS.worker || PS.failed || PS.sync) return;
      if (new URLSearchParams(location.search).get('noworker')) { PS.sync = true; return; }
      try {
        PS.worker = new Worker('sq1-solve-n.js');
        PS.worker.onmessage = (ev) => { const m = ev.data; if (m.cmd === 'plan' && m.id === PS.id) { PS.pending = false; if (m.plan) { PS.plan = m.plan; PS.keys = m.keys; PS.pos = 0; } else PS.failed = true; } };
        PS.worker.onerror = () => { PS.worker = null; PS.sync = true; PS.pending = false; };
        PS.worker.postMessage({ cmd: 'init' });
      } catch (e) { PS.worker = null; PS.sync = true; }
    }
    function request(P, ids, m0, m1) {
      if (PS.sync) {
        try { const plan = solveModel(P, ids, m0, m1); if (plan) { PS.plan = plan; PS.keys = planKeys(P, ids, m0, m1, plan); PS.pos = 0; } else PS.failed = true; } catch (e) { PS.failed = true; }
        return;
      }
      PS.pending = true; PS.id++; PS.worker.postMessage({ cmd: 'solve', id: PS.id, P: P, ids: Array.from(ids), m0: m0, m1: m1 });
    }
    function index(key) {
      if (!PS.plan) return -1;
      const k = PS.keys;
      if (k[PS.pos] === key) return PS.pos;
      if (k[PS.pos + 1] === key) return ++PS.pos;
      const i = k.indexOf(key); if (i >= 0) PS.pos = i; return i;
    }
    function look(S) {
      const M = getModel(S.Ly.P); if (!M) return null;
      const ids = readIds(M, S); if (!ids) return null;
      return { P: S.Ly.P, ids: ids, m0: S.mflip[0], m1: S.mflip[1], key: hashState(ids, S.mflip[0], S.mflip[1]) };
    }
    root.SQSOLVERS = root.SQSOLVERS || [];
    root.SQSOLVERS.push({
      match: (n) => { try { return !!getModel(SQ.pieceCount(n)); } catch (e) { return false; } },
      next: (S, G) => {
        if (SQ.isSolved(S)) return null;
        const st = look(S); if (!st) return undefined;
        startWorker();
        let i = index(st.key); if (i >= 0 && i < PS.plan.length) return PS.plan[i];
        if (PS.failed) return undefined;
        if (PS.pending) return 'wait';
        PS.plan = null; request(st.P, st.ids, st.m0, st.m1); if (PS.pending) return 'wait';
        i = index(st.key); return i >= 0 && i < PS.plan.length ? PS.plan[i] : undefined;
      },
      plan: (S) => {
        const st = look(S); if (!st) return null;
        const i = index(st.key); if (i < 0) return null;
        return PS.plan.slice(i);
      },
      state: PS,
    });
  }
})(typeof window !== 'undefined' ? window : self);
