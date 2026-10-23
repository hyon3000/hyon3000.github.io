// NxN cube (n >= 4) solver without any knowledge of the scramble: reduction on the sticker model of the engine (any size; also used for the penrose / pandora cubes, whose moves are those of the cube).
//   The stickers split into small orbits under the moves (24 stickers of a centre orbit, 24 wings = 48 stickers of a wing orbit); all work is done orbit by orbit:
//   1 centres:  every centre orbit gets the colours of the faces, by pure 3-cycles [setup, commutator, setup^-1]: the commutators come from a search on the orbit alone, the shortest setup for any wanted
//               cycle from a breadth first search over the (tiny) space of cycles of that orbit
//   2 edges:    the wings of every edge get one colour pair (the target pair of an edge is chosen once from what the edge holds; on an even cube a legal 3x3x3 reading is picked), orbit by orbit
//               the same way; an orbit that cannot be finished (wing parity) gets one slice turn, the centres are put right again and the orbit is solved again
//   3 3x3x3:    the reduced cube goes to the Kociemba solver of vendor/cubejs (global Cube) as a facelet string
//   if the reduction fails anyway the cube is shaken by a few inner-layer turns and reduced again (up to 8 times).
// RBNX.create(P, Cube).solve(col) -> { plan: [{b, d}, ...] | null, info, error }; moves are band moves of the engine, move id = b * 2 + (d > 0 ? 0 : 1).
(function (root) {
  'use strict';
  const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  const FACE = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
  const FR = { U: [1, 0, 0], R: [0, 0, -1], F: [1, 0, 0], D: [1, 0, 0], L: [0, 0, 1], B: [-1, 0, 0] };
  const FD = { U: [0, 0, 1], R: [0, -1, 0], F: [0, -1, 0], D: [0, 0, -1], L: [0, -1, 0], B: [0, -1, 0] };

  function create(P, Cube) {
    const N = P.N, perms = P.perms, M = perms.length, n = P.bands.length / 3, K = n * Math.sqrt(3);
    const pos = [], typ = new Int8Array(N), byPos = new Map(), face = new Int8Array(N);
    for (let i = 0; i < N; i++) {
      const c = P.stickers[i].c, q = [0, 1, 2].map((a) => Math.round(c[a] * K)); pos.push(q); byPos.set(q.join(','), i); face[i] = P.stickers[i].facet;
      const na = q.findIndex((v) => Math.abs(v) === n); let ext = 0; for (let a = 0; a < 3; a++) if (a !== na && Math.abs(q[a]) === n - 1) ext++;
      typ[i] = ext === 2 ? 2 : ext === 1 ? 1 : 0;          // 0 centre, 1 wing, 2 corner
    }
    // ---- wings: slots (sticker pairs), locations (the 12 edges)
    const partner = new Int16Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      if (typ[i] !== 1) continue;
      const q = pos[i], na = q.findIndex((v) => Math.abs(v) === n), ea = [0, 1, 2].find((a) => a !== na && Math.abs(q[a]) === n - 1), ma = [0, 1, 2].find((a) => a !== na && a !== ea), r = q.slice();
      r[ea] = n * Math.sign(q[ea]); r[na] = (n - 1) * Math.sign(q[na]); r[ma] = q[ma];
      partner[i] = byPos.get(r.join(','));
    }
    const wslots = [], wslotOf = new Int16Array(N).fill(-1), locIds = {}, locCount = []; let nLoc = 0;
    for (let i = 0; i < N; i++) {
      if (typ[i] !== 1 || face[i] > face[partner[i]]) continue;
      const key = face[i] * 6 + face[partner[i]]; if (!(key in locIds)) { locIds[key] = nLoc++; locCount.push(0); }
      const l = locIds[key]; wslotOf[i] = wslotOf[partner[i]] = wslots.length; wslots.push({ a: i, b: partner[i], loc: l }); locCount[l]++;
    }
    const centreSlots = []; for (let i = 0; i < N; i++) if (typ[i] === 0) centreSlots.push(i);

    function seqPerm(seq) { const q = new Int16Array(N); for (let i = 0; i < N; i++) q[i] = i; for (let s = 0; s < seq.length; s++) { const p = perms[seq[s]]; for (let i = 0; i < N; i++) q[i] = p[q[i]]; } return q; }
    function invSeq(seq) { const r = []; for (let i = seq.length - 1; i >= 0; i--) r.push(seq[i] ^ 1); return r; }
    // ---- target colour scheme: the rotation of the identity scheme that matches the centres best
    const rots = (function () {
      const res = [], seen = new Set(), id = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
      const gens = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]];
      const todo = [id];
      while (todo.length) { const g = todo.pop(), k = g.join('|'); if (seen.has(k)) continue; seen.add(k); res.push(g); gens.forEach((h) => todo.push(mul(h, g))); }
      return res.map((g) => FACE_ORDER.map((nm) => { const v = FACE[nm], w = [0, 1, 2].map((i) => g[i][0] * v[0] + g[i][1] * v[1] + g[i][2] * v[2]); return FACE_ORDER.findIndex((n2) => FACE[n2].every((x, i) => x === w[i])); }));
    })();

    // ---- facelets of the reduced cube: corners as they are, an edge by its first wing, a centre by its first centre sticker
    const faceletSticker = [];
    FACE_ORDER.forEach((nm) => {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const p3 = [0, 1, 2].map((a) => FACE[nm][a] * 3 + FR[nm][a] * 2 * (c - 1) + FD[nm][a] * 2 * (r - 1)), na = FACE[nm].findIndex((x) => x !== 0);
        const pn = p3.map((v) => (Math.abs(v) === 2 ? Math.sign(v) * (n - 1) : Math.abs(v) === 3 ? Math.sign(v) * n : 3 - n));
        pn[na] = FACE[nm][na] * n;
        faceletSticker.push(byPos.get(pn.join(',')));
      }
    });
    // facelet (face d, row r, column c) -> sticker index, in the net of vendor/cubejs (faces U R F D L B), for any n: used by the pages that read a cube from pieces (heli-solve-box.js)
    const faceletGrid = [];
    FACE_ORDER.forEach((nm) => { for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const pn = [0, 1, 2].map((a) => FACE[nm][a] * n + FR[nm][a] * (2 * c - (n - 1)) + FD[nm][a] * (2 * r - (n - 1)));
      faceletGrid.push(byPos.get(pn.join(',')));
    } });
    function parityOf(a) { let s = 0; const seen = new Array(a.length).fill(false); for (let i = 0; i < a.length; i++) { if (seen[i]) continue; let j = i, l = 0; while (!seen[j]) { seen[j] = true; j = a[j]; l++; } s += l - 1; } return s & 1; }
    function isPerm(a, m) { const s = new Set(a); return s.size === m && a.every((v) => v >= 0 && v < m); }
    function reduced(col, T) {
      const letterOf = []; T.forEach((c, f) => { letterOf[c] = FACE_ORDER[f]; });
      let fl = ''; for (let i = 0; i < 54; i++) fl += letterOf[col[faceletSticker[i]]];
      const cu = Cube.fromString(fl), cp = Array.from(cu.cp), co = Array.from(cu.co), ep = Array.from(cu.ep), eo = Array.from(cu.eo);
      const out = { fl: fl, ok: false, flip: false, twist: false, perm: false, bad: true };
      if (!isPerm(cp, 8) || !isPerm(ep, 12)) return out;
      out.bad = false;
      out.flip = eo.reduce((a, b) => a + b, 0) % 2 !== 0; out.twist = co.reduce((a, b) => a + b, 0) % 3 !== 0; out.perm = parityOf(cp) !== parityOf(ep);
      out.ok = !out.flip && !out.twist && !out.perm;
      return out;
    }

    // The colour scheme: an odd cube has a core (the middle stickers of the faces) that fixes it; an even cube is free, the rotation that agrees with most centres is the cheapest to reach.
    const middleOf = []; if (n & 1) for (let i = 0; i < N; i++) if (typ[i] === 0 && pos[i].filter((v) => v === 0).length === 2) middleOf[face[i]] = i;
    function chooseT(col) {
      if (n & 1) { const T = []; for (let f = 0; f < 6; f++) T[f] = col[middleOf[f]]; return T; }
      let best = null, bs = -1; rots.forEach((T) => { const s = centreScore(col, T); if (s > bs) { bs = s; best = T; } }); return best;
    }
    function run(col, plan, seq) { seq.forEach((m) => { col = P.apply(col, m); plan.push({ b: m >> 1, d: (m & 1) ? -1 : 1 }); }); return col; }

    function centreScore(col, T) { let s = 0; for (let k = 0; k < centreSlots.length; k++) { const i = centreSlots[k]; if (col[i] === T[face[i]]) s++; } return s; }
    const classList = []; for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) if (b - a !== 3) classList.push([a, b]);
    function assign(w) {          // maximum weight assignment of the 12 classes to the 12 locations (Hungarian method, w[l][c])
      const m = w.length, INF = 1e9, u = new Array(m + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
      for (let i = 1; i <= m; i++) {
        p[0] = i; let j0 = 0; const minv = new Array(m + 1).fill(INF), used = new Array(m + 1).fill(false);
        do {
          used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
          for (let j = 1; j <= m; j++) if (!used[j]) { const cur = -w[i0 - 1][j - 1] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < delta) { delta = minv[j]; j1 = j; } }
          for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
          j0 = j1;
        } while (p[j0] !== 0);
        do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
      }
      const res = new Array(m); for (let j = 1; j <= m; j++) res[p[j] - 1] = j - 1; return res;
    }
    // an odd cube has a middle piece on every edge (never moved by pure wing cycles): the wings of that edge must show its two colours, in the order (facet A, facet B)
    const midOf = []; if (n & 1) for (let i = 0; i < N; i++) { if (typ[i] !== 0 && pos[i].filter((v) => v === 0).length === 1 && Math.abs(pos[i][0]) + Math.abs(pos[i][1]) + Math.abs(pos[i][2]) === n + n - 1 + 0 || false) {} }
    const midSlots = {}; if (n & 1) for (let i = 0; i < N; i++) { const q = pos[i], z = q.filter((v) => v === 0).length, mx = q.filter((v) => Math.abs(v) === n).length; if (z === 1 && mx === 1 && q.some((v) => Math.abs(v) === n - 1)) { const o = byPos.get(q.map((v, a) => (v === 0 ? 0 : Math.abs(v) === n ? (n - 1) * Math.sign(v) : n * Math.sign(v))).join(',')); if (o !== undefined) { const f = Math.min(face[i], face[o]), key = Math.min(face[i], face[o]) * 6 + Math.max(face[i], face[o]); midSlots[key] = face[i] === f ? [i, o] : [o, i]; } } }
    function wingTargets(col) {
      if (n & 1) { const tg = new Array(nLoc); Object.keys(locIds).forEach((key) => { const m = midSlots[key]; tg[locIds[key]] = m ? [col[m[0]], col[m[1]]] : [0, 2]; }); return tg; }
      const cnt = [], ori = []; for (let l = 0; l < nLoc; l++) { cnt.push(new Array(12).fill(0)); ori.push(new Array(12).fill(0)); }
      wslots.forEach((w) => {
        const x = col[w.a], y = col[w.b], c = classList.findIndex((q) => q[0] === Math.min(x, y) && q[1] === Math.max(x, y)); if (c < 0) return;
        cnt[w.loc][c]++; ori[w.loc][c] += x < y ? 1 : -1;          // + : the wing reads (low, high) on (A, B)
      });
      const asg = assign(cnt), tgt = new Array(nLoc);
      for (let l = 0; l < nLoc; l++) { const c = asg[l], q = classList[c]; tgt[l] = ori[l][c] >= 0 ? [q[0], q[1]] : [q[1], q[0]]; }
      // A pure 3-cycle of wings never changes the parity of the wings that show their colours in the order (higher, lower) on (lower, higher facet); the wanted state has (n - 2) such wings per
      // reversed edge target.  On an odd cube the parity is put right by reversing the target of the edge that costs least; on an even cube it cannot be (that is edge parity, handled apart).
      let cur = 0; wslots.forEach((w) => { if (col[w.a] > col[w.b]) cur++; });
      let want = 0; tgt.forEach((t) => { if (t[0] > t[1]) want += n - 2; });
      if (((cur - want) & 1) && (n & 1)) {
        let bl = -1, bc = -1; for (let l = 0; l < nLoc; l++) { let c = 0; wslots.forEach((w) => { if (w.loc === l && col[w.a] === tgt[l][1] && col[w.b] === tgt[l][0]) c++; }); if (c > bc) { bc = c; bl = l; } }
        tgt[bl] = [tgt[bl][1], tgt[bl][0]];
      }
      return tgt;
    }
    function wingsPaired(col, tgt) { let ok = 0; wslots.forEach((w) => { if (col[w.a] === tgt[w.loc][0] && col[w.b] === tgt[w.loc][1]) ok++; }); return ok; }
    // ======== orbits: the pure wing / centre cycles act on small independent sets of stickers ========
    // The group generated by the moves splits the centre stickers and the wings into orbits (24 stickers of a centre orbit, 48 of a wing orbit).  Inside one orbit
    // only the moves that touch it matter (the 12 outer turns and a few slices); for every orbit a few pure 3-cycles are found by a search over commutators on the
    // orbit alone, and a breadth first search over the (small) space of 3-cycles "triples of stickers" gives, for every wanted cycle, the shortest setup that
    // carries it onto one of those base cycles.  A wanted cycle is then [setup, base, setup^-1].  No size dependent search, no reliance on the scramble.
    const uf = new Int32Array(N); for (let i = 0; i < N; i++) uf[i] = i;
    const ufFind = (x) => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
    for (let m = 0; m < M; m += 2) { const p = perms[m]; for (let i = 0; i < N; i++) if (p[i] !== i && typ[i] !== 2 && typ[p[i]] !== 2) { const a = ufFind(i), b = ufFind(p[i]); if (a !== b) uf[a] = b; } }
    for (let i = 0; i < N; i++) if (typ[i] === 1) { const a = ufFind(i), b = ufFind(partner[i]); if (a !== b) uf[a] = b; }          // the two stickers of a wing are one piece
    const orbitOfRoot = new Map(); const centreOrbits = [], wingOrbits = [];
    for (let i = 0; i < N; i++) {
      if (typ[i] === 2) continue; const r = ufFind(i); let o = orbitOfRoot.get(r);
      if (!o) { o = { typ: typ[i], st: [] }; orbitOfRoot.set(r, o); (typ[i] === 0 ? centreOrbits : wingOrbits).push(o); }
      o.st.push(i);
    }
    const axisOfMove = (m) => Math.floor((m >> 1) / n), bandOfMove = (m) => (m >> 1) % n;
    const midLayer = (n & 1) ? (n - 1) / 2 : -1;
    wingOrbits.forEach((o) => {          // the wings of the orbit, in a canonical order (edge, side along the edge)
      const ws = []; const seen = new Set(); o.st.forEach((s) => { const w = wslotOf[s]; if (!seen.has(w)) { seen.add(w); ws.push(w); } });
      const sideOf = (wi) => { const q = pos[wslots[wi].a]; for (let a = 0; a < 3; a++) if (Math.abs(q[a]) !== n && Math.abs(q[a]) !== n - 1) return q[a]; return 0; };
      ws.sort((x, y) => wslots[x].loc - wslots[y].loc || sideOf(x) - sideOf(y));
      o.wings = ws; o.st = []; ws.forEach((w) => { o.st.push(wslots[w].a, wslots[w].b); });
      o.coord = Math.abs(sideOf(ws[0])); o.mid = o.coord === 0;          // |coordinate along the edge|, 0 for the middle pieces of an odd cube
    });
    centreOrbits.forEach((o) => { o.skip = o.st.length <= 6; });
    const sliceMovesOf = (o) => { const out = []; for (let m = 0; m < M; m++) { const b = bandOfMove(m); if (b === 0 || b === n - 1) continue; const p = perms[m]; let hit = false; for (let k = 0; k < o.st.length; k++) if (p[o.st[k]] !== o.st[k]) { hit = true; break; } if (hit) out.push(m); } return out; };

    function sameBandOrAxisKey(m) { return axisOfMove(m) * 100000 + ((bandOfMove(m) === 0 || bandOfMove(m) === n - 1) ? 0 : 1) * 50000 + (bandOfMove(m) < n / 2 ? 0 : 1) * 10000 + (m & 1); }
    function orbitSetup(o, canonical) {
      const loc = new Int16Array(N).fill(-1); o.st.forEach((s, i) => { loc[s] = i; });
      const m = o.st.length; let gens = [];
      for (let g = 0; g < M; g++) { const p = perms[g]; let hit = false; for (let k = 0; k < m; k++) if (p[o.st[k]] !== o.st[k]) { hit = true; break; } if (hit) gens.push(g); }
      if (canonical) gens.sort((x, y) => sameBandOrAxisKey(x) - sameBandOrAxisKey(y) || x - y);
      const lp = gens.map((g) => { const p = perms[g], r = new Uint8Array(m); for (let k = 0; k < m; k++) r[k] = loc[p[o.st[k]]]; return r; });
      const lpi = lp.map((r) => { const q = new Uint8Array(m); for (let k = 0; k < m; k++) q[r[k]] = k; return q; });
      const inv = gens.map((g) => gens.indexOf(g ^ 1));
      return { o: o, m: m, gens: gens, lp: lp, lpi: lpi, inv: inv };
    }
    // base cycles: [A x A' y A x' A' y'] with local net permutation a pure 3-cycle (centres) / a pure cycle of three wings, verified on the whole cube
    function findBases(S, kind, cap, budget) {
      const m = S.m, G = S.gens.length, bases = [], seenKey = new Set(), o = S.o;
      const want = kind === 'M' ? 3 : 6, st = o.st; let tests = 0;
      const q = new Uint8Array(m), tmp = new Uint8Array(m);
      const seqs = [];
      for (let A = 0; A < G; A++) for (let x = 0; x < G; x++) {
        if ((S.gens[x] >> 1) === (S.gens[A] >> 1)) continue;
        for (let y = 0; y < G; y++) {
          const seq = [A, x, S.inv[A], y, A, S.inv[x], S.inv[A], S.inv[y]];
          for (let i = 0; i < m; i++) q[i] = i;
          for (let k = 0; k < 8; k++) { const l = S.lp[seq[k]]; for (let i = 0; i < m; i++) q[i] = l[q[i]]; }
          let moved = 0; for (let i = 0; i < m; i++) if (q[i] !== i) { moved++; if (moved > want) break; }
          if (moved !== want) continue;
          if (kind === 'W') {          // three wings forming a 3-cycle (no wing stays in place, even flipped)
            let ok = true; for (let i = 0; i < m && ok; i += 2) { const wa = q[i] >> 1, wb = q[i + 1] >> 1; if (wa !== wb) ok = false; else if (wa === (i >> 1)) { if (q[i] !== i) ok = false; } }
            if (!ok) continue; let mv = 0; for (let i = 0; i < m; i += 2) if ((q[i] >> 1) !== (i >> 1)) mv++; if (mv !== 3) continue;
          }
          const key = Array.from(q).join(','); if (seenKey.has(key)) continue;
          // verify on the whole cube: nothing else moves
          const full = new Int32Array(N); for (let i = 0; i < N; i++) full[i] = i;
          for (let k = 0; k < 8; k++) { const p = perms[S.gens[seq[k]]]; for (let i = 0; i < N; i++) full[i] = p[full[i]]; }
          let bad = false; for (let i = 0; i < N; i++) if (full[i] !== i && loc_of(S, i) < 0) { bad = true; break; }
          tests++; if (bad) { if (tests > budget) return bases; continue; }
          seenKey.add(key); const b1 = { seq: seq, q: Uint8Array.from(q) }; bases.push(b1);
          const qi = new Uint8Array(m); for (let i = 0; i < m; i++) qi[q[i]] = i;          // the inverse cycle
          const si = []; for (let k = seq.length - 1; k >= 0; k--) si.push(S.inv[seq[k]]);
          const k2 = Array.from(qi).join(','); if (!seenKey.has(k2)) { seenKey.add(k2); bases.push({ seq: si, q: qi }); }
          if (bases.length >= cap) return bases;
        }
      }
      return bases;
    }
    function loc_of(S, i) { return S.locMap[i]; }

    // ---- centre orbit tables: state = (a, b, c) = the contents a -> b -> c -> a
    function centreTable(o) {
      if (o.tab) return o.tab;
      const S = orbitSetup(o, false); S.locMap = new Int16Array(N).fill(-1); o.st.forEach((s, i) => { S.locMap[s] = i; });
      const m = S.m, G = S.gens.length, bases = findBases(S, 'M', 8, 4000);
      if (!bases.length) { o.tab = { fail: true }; return o.tab; }
      const SZ = m * m * m, dist = new Uint8Array(SZ).fill(255), nxt = new Uint8Array(SZ), root = new Map(), queue = new Int32Array(SZ); let qh = 0, qt = 0;
      bases.forEach((b, bi) => {
        for (let a = 0; a < m; a++) if (b.q[a] !== a) { const bb = b.q[a], c = b.q[bb], key = (a * m + bb) * m + c; if (dist[key] === 255) { dist[key] = 0; root.set(key, bi); queue[qt++] = key; } }
      });
      while (qh < qt) {
        const key = queue[qh++], d = dist[key], c = key % m, b = ((key - c) / m) % m, a = (key - c - b * m) / (m * m);
        for (let g = 0; g < G; g++) {
          const pi = S.lpi[g], k2 = (pi[a] * m + pi[b]) * m + pi[c];
          if (dist[k2] === 255) { dist[k2] = d + 1; nxt[k2] = g; queue[qt++] = k2; }
        }
      }
      o.tab = { S: S, bases: bases, dist: dist, nxt: nxt, root: root, m: m };
      return o.tab;
    }
    function centreCycleSeq(tab, a, b, c) {          // the move sequence (real moves) of the cycle contents a -> b -> c -> a
      const S = tab.S, m = tab.m, g = []; let x = a, y = b, z = c;
      while (tab.dist[(x * m + y) * m + z] > 0) { const gi = tab.nxt[(x * m + y) * m + z]; g.push(gi); const l = S.lp[gi]; x = l[x]; y = l[y]; z = l[z]; }
      const base = tab.bases[tab.root.get((x * m + y) * m + z)], out = [];
      g.forEach((gi) => out.push(S.gens[gi])); base.seq.forEach((gi) => out.push(S.gens[gi])); for (let i = g.length - 1; i >= 0; i--) out.push(S.gens[g[i]] ^ 1);
      return out;
    }
    function solveCentreOrbit(col, plan, T, o) {
      const tab = centreTable(o); if (tab.fail) return null;
      const m = tab.m, st = o.st, tc = st.map((s) => T[face[s]]); const cc = st.map((s) => col[s]);
      for (let guard = 0; guard < 200; guard++) {
        let best = null, bs = 0;
        const wrong = []; for (let i = 0; i < m; i++) if (cc[i] !== tc[i]) wrong.push(i);
        if (!wrong.length) break;
        for (let wi = 0; wi < wrong.length; wi++) {
          const p = wrong[wi];
          for (let q = 0; q < m; q++) {
            if (q === p || cc[q] !== tc[p]) continue;
            const qOk = cc[q] === tc[q] ? 1 : 0;
            for (let r = 0; r < m; r++) {
              if (r === p || r === q) continue;
              const dd = tab.dist[(q * m + p) * m + r]; if (dd === 255) continue;
              const g = 1 + (cc[p] === tc[r] ? 1 : 0) + (cc[r] === tc[q] ? 1 : 0) - qOk - (cc[r] === tc[r] ? 1 : 0) - (cc[p] === tc[p] ? 0 : 0);
              if (g <= 0) continue; const sc = g / (2 * dd + 8) + g * 1e-6;
              if (sc > bs) { bs = sc; best = [q, p, r]; }
            }
          }
        }
        if (!best) return null;
        const sq = centreCycleSeq(tab, best[0], best[1], best[2]);
        col = run(col, plan, sq); for (let i = 0; i < m; i++) cc[i] = col[st[i]];
      }
      return col;
    }
    function solveCentres(col, plan, T) {
      for (let k = 0; k < centreOrbits.length; k++) { const o = centreOrbits[k]; if (o.skip) continue; col = solveCentreOrbit(col, plan, T, o); if (!col) return null; }
      return col;
    }

    // ---- wing orbit tables.  A cycle of three wings A -> B -> C -> A with the sticker maps x1->y1, x2->y2, x3->y3 (x2 in the wing of y1, x3 in the wing of y2, y3 in the wing of x1)
    // key = ((((x1 * m + y1) * 2 + e2) * m + y2) * 2 + e3) * 2 + e4 with x2 = y1 with parity e2, x3 = y2 with parity e3, y3 = x1 with parity e4
    const wingTabs = new Map();
    function wingTable(o) {
      if (o.tab) return o.tab;
      const S = orbitSetup(o, true); S.locMap = new Int16Array(N).fill(-1); o.st.forEach((s, i) => { S.locMap[s] = i; });
      const sig = S.lp.map((r) => Array.from(r).join('.')).join('|') + '#' + S.gens.map((g) => sameBandOrAxisKey(g)).join(',');
      if (wingTabs.has(sig)) { const t0 = wingTabs.get(sig); o.tab = t0.fail ? t0 : Object.assign({}, t0, { S: S }); return o.tab; }
      const m = S.m, G = S.gens.length, bases = findBases(S, 'W', 24, 6000);
      if (!bases.length) { o.tab = { fail: true }; wingTabs.set(sig, o.tab); return o.tab; }
      const SZ = m * m * 2 * m * 2 * 2, dist = new Uint8Array(SZ).fill(255), nxt = new Uint8Array(SZ), root = new Map(), queue = new Int32Array(SZ); let qh = 0, qt = 0;
      const enc = (x1, y1, x2, y2, x3, y3) => ((((x1 * m + y1) * 2 + (x2 & 1)) * m + y2) * 2 + (x3 & 1)) * 2 + (y3 & 1);
      bases.forEach((b, bi) => {
        const q = b.q;
        for (let x1 = 0; x1 < m; x1++) {
          if (q[x1] === x1 || (q[x1] >> 1) === (x1 >> 1)) continue; const y1 = q[x1];
          for (let e2 = 0; e2 < 2; e2++) { const x2 = (y1 & ~1) | e2, y2 = q[x2]; if (y2 === x2 || (y2 >> 1) === (x2 >> 1)) continue;
            for (let e3 = 0; e3 < 2; e3++) { const x3 = (y2 & ~1) | e3, y3 = q[x3]; if ((y3 >> 1) !== (x1 >> 1)) continue;
              const key = enc(x1, y1, x2, y2, x3, y3); if (dist[key] === 255) { dist[key] = 0; root.set(key, bi); queue[qt++] = key; } } }
        }
      });
      const mm2 = m * 2;
      while (qh < qt) {
        let key = queue[qh++]; const d = dist[key];
        const e4 = key & 1; key >>= 1; const e3 = key & 1; key >>= 1; const y2 = key % m; key = (key - y2) / m; const e2 = key & 1; key >>= 1; const y1 = key % m, x1 = (key - y1) / m;
        const x2 = (y1 & ~1) | e2, x3 = (y2 & ~1) | e3, y3 = (x1 & ~1) | e4;
        for (let g = 0; g < G; g++) {
          const pi = S.lpi[g], k2 = enc(pi[x1], pi[y1], pi[x2], pi[y2], pi[x3], pi[y3]);
          if (dist[k2] === 255) { dist[k2] = d + 1; nxt[k2] = g; queue[qt++] = k2; }
        }
      }
      o.tab = { S: S, bases: bases, dist: dist, nxt: nxt, root: root, m: m, enc: enc }; wingTabs.set(sig, o.tab);
      return o.tab;
    }
    function wingCycleSeq(tab, x1, y1, x2, y2, x3, y3) {
      const S = tab.S, m = tab.m, enc = tab.enc, g = []; let a = x1, b = y1, c = x2, d = y2, e = x3, f = y3;
      let key = enc(a, b, c, d, e, f);
      while (tab.dist[key] > 0) { const gi = tab.nxt[key]; g.push(gi); const l = S.lp[gi]; a = l[a]; b = l[b]; c = l[c]; d = l[d]; e = l[e]; f = l[f]; key = enc(a, b, c, d, e, f); }
      const base = tab.bases[tab.root.get(key)], out = [];
      g.forEach((gi) => out.push(S.gens[gi])); base.seq.forEach((gi) => out.push(S.gens[gi])); for (let i = g.length - 1; i >= 0; i--) out.push(S.gens[g[i]] ^ 1);
      return out;
    }
    let wRand = 987654321; const wrnd = () => { wRand = (wRand * 1103515245 + 12345) & 0x7fffffff; return wRand / 0x7fffffff; };
    function solveWingOrbit(col, plan, tgt, o) {
      const tab = wingTable(o); if (tab.fail) { solveWingOrbit.ok = false; return col; }
      const m = tab.m, W = m >> 1, ws = o.wings.map((w) => wslots[w]);
      const cA = new Array(W), cB = new Array(W), tA = new Array(W), tB = new Array(W);
      const load = () => { for (let w = 0; w < W; w++) { cA[w] = col[ws[w].a]; cB[w] = col[ws[w].b]; } };
      for (let w = 0; w < W; w++) { tA[w] = tgt[ws[w].loc][0]; tB[w] = tgt[ws[w].loc][1]; }
      const keep = plan.length, col0 = col; let noGain = 0;
      for (let guard = 0; guard < 400; guard++) {
        load(); const wrong = []; for (let w = 0; w < W; w++) if (cA[w] !== tA[w] || cB[w] !== tB[w]) wrong.push(w);
        if (!wrong.length) { solveWingOrbit.ok = true; return col; }
        let best = null, bs = -1e9, anyPos = false;
        for (let wi = 0; wi < wrong.length; wi++) {
          const p = wrong[wi];
          for (let q = 0; q < W; q++) {
            if (q === p) continue;
            for (let o1 = 0; o1 < 2; o1++) {
              if (o1 ? !(cA[q] === tB[p] && cB[q] === tA[p]) : !(cA[q] === tA[p] && cB[q] === tB[p])) continue;
              const qOk = (cA[q] === tA[q] && cB[q] === tB[q]) ? 1 : 0, x1 = 2 * q, y1 = 2 * p + o1;
              for (let r = 0; r < W; r++) {
                if (r === p || r === q) continue;
                const rOk = (cA[r] === tA[r] && cB[r] === tB[r]) ? 1 : 0;
                for (let o2 = 0; o2 < 2; o2++) {
                  // contents of p go to r with orientation o2 (x2 = 2p -> y2 = 2r + o2)
                  const nA = o2 ? cB[p] : cA[p], nB = o2 ? cA[p] : cB[p], g2 = (nA === tA[r] && nB === tB[r]) ? 1 : 0;
                  for (let o3 = 0; o3 < 2; o3++) {
                    const key = tab.enc(x1, y1, 2 * p, 2 * r + o2, 2 * r, 2 * q + o3); const dd = tab.dist[key]; if (dd === 255) continue;
                    const mA = o3 ? cB[r] : cA[r], mB = o3 ? cA[r] : cB[r], g3 = (mA === tA[q] && mB === tB[q]) ? 1 : 0;
                    const g = 1 + g2 + g3 - qOk - rOk; const sc = (g > 0 ? 1 : 0) * (g / (2 * dd + 8)) + (g > 0 ? 0 : g - dd * 1e-3 - 100);
                    if (g > 0) anyPos = true;
                    if (sc > bs) { bs = sc; best = [x1, y1, 2 * p, 2 * r + o2, 2 * r, 2 * q + o3, g]; }
                  }
                }
              }
            }
          }
        }
        if (!best || (best[6] <= 0 && ++noGain > 40)) { solveWingOrbit.ok = false; return col; }
        const sq = wingCycleSeq(tab, best[0], best[1], best[2], best[3], best[4], best[5]);
        col = run(col, plan, sq);
      }
      solveWingOrbit.ok = false; return col;
    }

    // ---- the reduction
    function chooseTargets(c, T) {
      let tgt0 = wingTargets(c);
      if (!(n & 1)) {
        // even cube: the 3x3x3 made of the corners and of the edge readings must be a legal cube; the reading of an edge can be chosen freely, because the wings of an edge are identical
        const virtual = (tg) => { const v = Uint8Array.from(c); wslots.forEach((ws) => { v[ws.a] = tg[ws.loc][0]; v[ws.b] = tg[ws.loc][1]; }); return reduced(v, T); };
        const q0 = virtual(tgt0);
        if (q0.bad || q0.twist) return null;
        if (!q0.ok) {
          let found = null; const rev = (tg, l) => { tg[l] = [tg[l][1], tg[l][0]]; };
          for (let k = 0; k < nLoc && !found; k++) { const tg = tgt0.map((q) => q.slice()); rev(tg, k); const q = virtual(tg); if (!q.bad && !q.twist && q.ok) found = tg; }
          for (let k = 0; k < nLoc && !found; k++) for (let l = k + 1; l < nLoc && !found; l++) {
            for (let o = 0; o < 4 && !found; o++) { const tg = tgt0.map((q) => q.slice()), a = tg[k], b = tg[l]; tg[k] = b; tg[l] = a; if (o & 1) rev(tg, k); if (o & 2) rev(tg, l); const q = virtual(tg); if (!q.bad && !q.twist && q.ok) found = tg; }
          }
          if (!found) return null;
          tgt0 = found;
        }
      }
      return tgt0;
    }
    function sliceChoices(o) { const mv = sliceMovesOf(o); mv.sort((a, b) => ((a & 1) - (b & 1)) || (a - b)); return mv; }
    function reduce(col, plan, T, tries) {
      let c = solveCentres(col, plan, T); if (!c) return null;
      let tgt = chooseTargets(c, T); if (!tgt) return null;
      const wo = wingOrbits.filter((o) => !o.mid), attempt = new Map();
      for (let round = 0; round < 12; round++) {
        const failed = [];
        for (let k = 0; k < wo.length; k++) { c = solveWingOrbit(c, plan, tgt, wo[k]); if (!solveWingOrbit.ok) failed.push(wo[k]); }
        if (!failed.length) return c;
        failed.forEach((o) => { const ch = sliceChoices(o), a = attempt.get(o) || 0; attempt.set(o, a + 1); c = run(c, plan, [ch[(a * 5 + 1) % ch.length]]); });
        c = solveCentres(c, plan, T); if (!c) return null;
        if (n & 1) { tgt = wingTargets(c); }
      }
      return null;
    }


    function solve(col0) {
      let col = Uint8Array.from(col0); const plan = [], info = { retries: 0 };
      const T = chooseT(col);
      let c1 = null, base = 0;
      for (let attempt = 0; attempt < 8 && !c1; attempt++) {
        plan.length = base;
        if (attempt > 0) {          // fall back: shake the cube with a few inner-layer turns and reduce again
          const sh = []; for (let q = 0; q < 1 + (attempt % 3); q++) sh.push(perturb[Math.floor(krnd() * perturb.length)]);
          col = run(col, plan, sh); base = plan.length; info.retries++;
        }
        c1 = reduce(col, plan, T);
        if (c1 && !reduced(c1, T).ok) c1 = null;
      }
      if (!c1) return { plan: null, info: info, error: 'reduce' };
      const r = reduced(c1, T);
      col = c1;
      let alg; try { alg = Cube.fromString(r.fl).solve(); } catch (e) { return { plan: null, info: info, error: 'kociemba ' + e }; }
      alg.split(' ').forEach((t) => {
        if (!t) return; const v = FACE[t[0]], li = v[0] ? 0 : v[1] ? 1 : 2, sg = v[0] + v[1] + v[2], b = li * n + (sg > 0 ? 0 : n - 1), d = -sg, rep = t[1] === '2' ? 2 : 1, dd = t[1] === "'" ? -d : d;
        for (let k = 0; k < rep; k++) { col = P.apply(col, b * 2 + (dd > 0 ? 0 : 1)); plan.push({ b: b, d: dd }); }
      });
      return { plan: dedupe(col0, plan), info: info, col: col };
    }
    let kickSeed = 12345; const krnd = () => { kickSeed = (kickSeed * 1103515245 + 12345) & 0x7fffffff; return kickSeed / 0x7fffffff; };
    const perturb = []; for (let li = 0; li < 3; li++) for (let k = 1; k < n - 1; k++) for (let d = 0; d < 2; d++) perturb.push((li * n + k) * 2 + d);
    // a state that is visited twice cuts out the moves in between (states are compared by a double hash)
    function dedupe(col0, plan) {
      const hsh = (c) => { let h1 = 2166136261, h2 = 5381; for (let i = 0; i < c.length; i++) { h1 = Math.imul(h1 ^ c[i], 16777619); h2 = (Math.imul(h2, 33) + c[i]) | 0; } return (h1 >>> 0) * 4294967296 + (h2 >>> 0); };
      const seen = new Map(), out = []; let c = Uint8Array.from(col0); seen.set(hsh(c), 0);
      plan.forEach((m) => {
        c = P.apply(c, P.moveOf(m.b, m.d)); out.push(m); const k = hsh(c);
        if (seen.has(k)) { const q = seen.get(k); out.length = q; seen.forEach((v, kk) => { if (v > q) seen.delete(kk); }); } else seen.set(k, out.length);
      });
      return out;
    }
    function warm() { centreOrbits.forEach((o) => { if (!o.skip) centreTable(o); }); wingOrbits.forEach((o) => { if (!o.mid) wingTable(o); }); }
    return { n: n, faceletGrid: faceletGrid, warm: warm, solve: solve, reduce: reduce, reduced: reduced, rots: rots, chooseT: chooseT, centreScore: centreScore, wingTargets: wingTargets, wingsPaired: wingsPaired, wslots: wslots, typ: typ, centreOrbits: centreOrbits, wingOrbits: wingOrbits, solveCentres: solveCentres, solveWingOrbit: solveWingOrbit, chooseTargets: chooseTargets, centreTable: centreTable, wingTable: wingTable };
  }
  root.RBNX = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
