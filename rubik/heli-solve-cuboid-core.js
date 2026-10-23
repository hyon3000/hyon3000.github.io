// Lattice model of a fully functional cuboid (a x b x c cells) used by the cuboid solver (heli-solve-cuboid.js).  It runs in a worker (and in plain JS shells).
// A piece is a cell: its slot (a cell of the box) and its rotation (one of the 24 rotations).  A move turns every cell of a layer about the axis through the middle of the puzzle
// (doubled coordinates, so the axis of a layer lies on the lattice only when the section is symmetric): it is a move of the model when every cell stays inside the box.
// The table (breadth-first from all solved states, which are the whole-box rotations) maps a state to the move that leads towards a solved state.
(function (root) {
  'use strict';
  function mulM(A, B) { const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; }
  function rotAbout(ax, q) {          // q quarter turns counter-clockwise about +axis (right handed): (u, w) -> (-w, u)
    const u = (ax + 1) % 3, w = (ax + 2) % 3, M = [1, 0, 0, 0, 1, 0, 0, 0, 1], R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    R[u * 3 + u] = 0; R[u * 3 + w] = -1; R[w * 3 + u] = 1; R[w * 3 + w] = 0;
    let out = M; for (let i = 0; i < ((q % 4) + 4) % 4; i++) out = mulM(R, out); return out;
  }
  const RK = (M) => M.join(',');
  const ROTS = [], ROTIDX = {};
  (function () {          // all 24 rotations: the closure of the three quarter turns
    const id = [1, 0, 0, 0, 1, 0, 0, 0, 1]; ROTS.push(id); ROTIDX[RK(id)] = 0;
    for (let i = 0; i < ROTS.length; i++) for (let ax = 0; ax < 3; ax++) { const M = mulM(rotAbout(ax, 1), ROTS[i]); if (ROTIDX[RK(M)] === undefined) { ROTIDX[RK(M)] = ROTS.length; ROTS.push(M); } }
  })();
  const MUL = ROTS.map((A) => ROTS.map((B) => ROTIDX[RK(mulM(A, B))]));          // MUL[a][b] = a * b

  const CACHE = {};
  function build(dims, cap) {
    const ck = dims.join('x'); if (CACHE[ck]) return CACHE[ck];
    const D = dims, dc = (i, a) => 2 * i - (D[a] - 1), slots = [], idx = {};
    for (let x = 0; x < D[0]; x++) for (let y = 0; y < D[1]; y++) for (let z = 0; z < D[2]; z++) { idx[dc(x, 0) + ',' + dc(y, 1) + ',' + dc(z, 2)] = slots.length; slots.push([dc(x, 0), dc(y, 1), dc(z, 2)]); }
    const n = slots.length, ap = (M, p) => [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]];
    const moves = [];
    for (let ax = 0; ax < 3; ax++) for (let k = 0; k < D[ax]; k++) for (let q = 1; q <= 3; q++) {
      const M = rotAbout(ax, q), map = new Array(n), aff = []; let ok = true;
      for (let i = 0; i < n; i++) {
        map[i] = i; if (slots[i][ax] !== dc(k, ax)) continue;
        const r = idx[ap(M, slots[i]).join(',')]; if (r === undefined) { ok = false; break; } map[i] = r; aff.push(i);
      }
      if (ok) moves.push({ ax: ax, k: k, q: q, map: map, aff: aff, rot: ROTIDX[RK(M)] });
    }
    moves.forEach((m, i) => { m.inv = moves.findIndex((o) => o.ax === m.ax && o.k === m.k && o.q === 4 - m.q); });
    const apply = (st, m) => {          // st: Uint8Array of 2n (slot, rot per piece)
      const out = new Uint8Array(st); for (let i = 0; i < n; i++) { const s = st[2 * i]; if (slots[s][m.ax] === dc(m.k, m.ax)) { out[2 * i] = m.map[s]; out[2 * i + 1] = MUL[m.rot][st[2 * i + 1]]; } } return out;
    };
    const key = (st) => String.fromCharCode.apply(null, st);
    const sources = [];
    const start = new Uint8Array(2 * n); for (let i = 0; i < n; i++) start[2 * i] = i;
    sources.push(start);
    for (let ax = 0; ax < 3; ax++) for (let q = 1; q <= 3; q++) {          // the whole box turned: only the turns that map the box onto itself
      const M = rotAbout(ax, q), st = new Uint8Array(2 * n); let ok = true;
      for (let i = 0; i < n; i++) { const r = idx[ap(M, slots[i]).join(',')]; if (r === undefined) { ok = false; break; } st[2 * i] = r; st[2 * i + 1] = ROTIDX[RK(M)]; }
      if (ok) sources.push(st);
    }
    const table = new Map(), uniq = [];
    sources.forEach((s) => { const k = key(s); if (!table.has(k)) { table.set(k, 0); uniq.push(s); } });
    // closure of the sources under the whole box rotations (axis-wise composition)
    for (let i = 0; i < uniq.length; i++) for (let ax = 0; ax < 3; ax++) for (let q = 1; q <= 3; q++) {
      const M = rotAbout(ax, q), st = new Uint8Array(2 * n); let ok = true;
      for (let j = 0; j < n; j++) { const r = idx[ap(M, slots[uniq[i][2 * j]]).join(',')]; if (r === undefined) { ok = false; break; } st[2 * j] = r; st[2 * j + 1] = MUL[ROTIDX[RK(M)]][uniq[i][2 * j + 1]]; }
      if (!ok) continue; const k = key(st); if (!table.has(k)) { table.set(k, 0); uniq.push(st); }
    }
    let frontier = uniq.slice(), depth = 0, complete = true;
    while (frontier.length) {
      const next = [];
      for (const s of frontier) for (let mi = 0; complete && mi < moves.length; mi++) {
        const t = apply(s, moves[mi]), k = key(t); if (table.has(k)) continue;
        table.set(k, (depth + 1) * 64 + moves[mi].inv); next.push(t);
        if (table.size >= cap) { complete = false; break; }
      }
      if (!complete) break; frontier = next; depth++;
    }
    return (CACHE[ck] = { slots: slots, idx: idx, moves: moves, table: table, apply: apply, key: key, size: table.size, depth: depth, complete: complete, n: n });
  }
  // ---- general piece model (fused and shared cubes): pieces are rigid boxes with a centre and half extents in doubled integer units (a unit cell has half extent 1) and one of 24 rotations;
  // a move is a box (lo, hi per axis, +-INF allowed) turned about a centre by q quarter turns: the pieces inside the box turn, a piece that straddles its border blocks the move.
  // desc: {pieces: [{c: [3], e: [3]}], moves: [{box: [[lo,hi] x 3], ctr: [3], rot: [9 ints] (quarter turn about the axis), qs: [1,2,3]}]}
  const INF = 1e9, absM = (M) => M.map(Math.abs);
  function buildGen(desc, cap) {
    const P = desc.pieces, n = P.length;
    const ap = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
    const moves = [];
    desc.moves.forEach((m) => {
      for (const q of m.qs) {
        let R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; for (let i = 0; i < q; i++) R = mulM(m.rot, R);
        moves.push({ box: m.box, ctr: m.ctr, R: R, ri: ROTIDX[RK(R)], q: q, src: m });
      }
    });
    moves.forEach((m) => { m.inv = moves.findIndex((o) => o.src === m.src && o.q === (4 - m.q) % 4); });
    // state: Int16 per piece: cx, cy, cz, rot (stored as a Int16Array of 4n)
    const E0 = P.map((p) => p.e);
    const ext = (i, ri) => ap(absM(ROTS[ri]), E0[i]);
    const apply = (st, m) => {
      const out = new Int16Array(st);
      for (let i = 0; i < n; i++) {
        const c = [st[4 * i], st[4 * i + 1], st[4 * i + 2]], e = ext(i, st[4 * i + 3]);
        let inside = true;
        for (let a = 0; a < 3; a++) if (c[a] - e[a] < m.box[a][0] || c[a] + e[a] > m.box[a][1]) inside = false;
        const ov = [0, 1, 2].every((a) => c[a] - e[a] < m.box[a][1] && c[a] + e[a] > m.box[a][0]);
        if (inside) {
          const q = ap(m.R, [c[0] - m.ctr[0], c[1] - m.ctr[1], c[2] - m.ctr[2]]);
          out[4 * i] = q[0] + m.ctr[0]; out[4 * i + 1] = q[1] + m.ctr[1]; out[4 * i + 2] = q[2] + m.ctr[2]; out[4 * i + 3] = MUL[m.ri][st[4 * i + 3]];
        } else if (ov) return null;          // straddles the border of the turning layer
      }
      return out;
    };
    const key = (st) => String.fromCharCode.apply(null, st);
    const start = new Int16Array(4 * n); P.forEach((p, i) => { start[4 * i] = p.c[0]; start[4 * i + 1] = p.c[1]; start[4 * i + 2] = p.c[2]; start[4 * i + 3] = 0; });
    const hkey = {}; P.forEach((p, i) => { hkey[p.c.join(',') + '|' + p.e.join(',')] = i; });
    const sources = [start];
    ROTS.forEach((M, ri) => {          // symmetries of the whole structure: the pieces map onto the homes of pieces of the same shape
      if (ri === 0) return; const st = new Int16Array(4 * n); let ok = true;
      for (let i = 0; i < n && ok; i++) {
        const c = ap(M, P[i].c), e = ap(absM(M), P[i].e), j = hkey[c.join(',') + '|' + e.join(',')]; if (j === undefined) { ok = false; break; }
        st[4 * i] = c[0]; st[4 * i + 1] = c[1]; st[4 * i + 2] = c[2]; st[4 * i + 3] = ri;
      }
      if (ok) sources.push(st);
    });
    const table = new Map(), uniq = [];
    sources.forEach((s) => { const k = key(s); if (!table.has(k)) { table.set(k, 0); uniq.push(s); } });
    let frontier = uniq.slice(), depth = 0, complete = true;
    while (frontier.length && complete) {
      const next = [];
      for (const s of frontier) { for (let mi = 0; complete && mi < moves.length; mi++) {
        const t = apply(s, moves[mi]); if (!t) continue; const k = key(t); if (table.has(k)) continue;
        table.set(k, (depth + 1) * 64 + moves[mi].inv); next.push(t);
        if (table.size >= cap) complete = false;
      } if (!complete) break; }
      frontier = next; depth++;
    }
    return { moves: moves, table: table, apply: apply, key: key, size: table.size, depth: depth, complete: complete, n: n, gen: true };
  }
  const GCACHE = {};
  function buildG(id, desc, cap) { return GCACHE[id] || (GCACHE[id] = buildGen(desc, cap)); }
  function solveG(id, desc, state, cap, forb, extra) { const M = buildG(id, desc, cap); CACHE['g:' + id] = M; return solveWith(M, state, forb, extra); }
  // The table holds depth * 64 + (the move towards a solved state): the depth is the length of the shortest way ignoring the bonds of the real puzzle.  The real puzzle refuses some turns (the body
  // would fall apart); the main page tells which (state, move) pairs are refused and the search below (IDA* with the table as an exact lower bound) goes around them.
  // state: Uint8Array(2n); returns the list of move indices or null when the state is not in the table / no way within the bound
  function solve(dims, state, cap, forb, extra) { return solveWith(build(dims, cap || 4000000), state, forb, extra); }
  function solveWith(M, state, forb, extra) {
    const F = new Set(forb || []), maxX = extra === undefined ? 8 : extra, st0 = M.gen ? new Int16Array(state) : new Uint8Array(state);
    const v0 = M.table.get(M.key(st0)); if (v0 === undefined) return null;
    let nodes = 0;
    function dfs(st, g, bound, last) {
      const k = M.key(st), v = M.table.get(k); if (v === undefined) return null;
      const h = v >> 6; if (h === 0) return [];
      if (g + h > bound || ++nodes > 3000000) return null;
      for (let mi = 0; mi < M.moves.length; mi++) {
        if (last >= 0 && mi === M.moves[last].inv) continue;
        if (F.has(k + '|' + mi)) continue;
        const r = dfs(M.apply(st, M.moves[mi]), g + 1, bound, mi); if (r) { r.unshift(mi); return r; }
      }
      return null;
    }
    for (let bound = v0 >> 6; bound <= (v0 >> 6) + maxX; bound++) { const r = dfs(st0, 0, bound, -1); if (r) return r; if (nodes > 3000000) return null; }
    return null;
  }
  root.CUBOID = { buildG: buildG, solveG: solveG, solveWith: solveWith, build: build, solve: solve, ROTS: ROTS, ROTIDX: ROTIDX, RK: RK, rotAbout: rotAbout };
})(typeof self !== 'undefined' ? self : globalThis);
