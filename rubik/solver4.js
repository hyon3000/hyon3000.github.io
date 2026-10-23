// Cube4 (4x4x4) solver without any knowledge of the scramble: reduction method on the sticker model of the engine.
//   1 centres:  every centre block gets one colour, by pure 3-cycles of centre stickers (commutators, found by a search, see solver4-data.js) and their conjugates
//   2 edges:    the two wings of every edge get the same colours, by pure 3-cycles of wings
//   3 parity:   when the reduced cube is not a valid 3x3x3 (odd flip / odd permutation), a parity sequence is applied and 1, 2 are repeated
//   4 3x3x3:    the reduced cube goes to the Kociemba solver of vendor/cubejs (global Cube) as a facelet string
// solve(col) returns the whole plan as band moves [{b, d}], or null.  The target colour scheme is the one of the corners / centres as they are.
(function (root) {
  'use strict';
  const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  const FACE = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
  const FR = { U: [1, 0, 0], R: [0, 0, -1], F: [1, 0, 0], D: [1, 0, 0], L: [0, 0, 1], B: [-1, 0, 0] };
  const FD = { U: [0, 0, 1], R: [0, -1, 0], F: [0, -1, 0], D: [0, 0, -1], L: [0, -1, 0], B: [0, -1, 0] };

  function decode(str) { return str.split(' ').map((w) => Array.from(w).map((ch) => ch.charCodeAt(0) - 97)); }

  function create(P, Cube) {
    const N = P.N, perms = P.perms, K = 4 * Math.sqrt(3);
    const pos = [], typ = [], byPos = new Map();
    for (let i = 0; i < N; i++) {
      const c = P.stickers[i].c, q = [0, 1, 2].map((a) => Math.round(c[a] * K));
      pos.push(q); byPos.set(q.join(','), i);
      const n3 = q.filter((v) => Math.abs(v) === 3).length; typ.push(n3 === 2 ? 2 : n3 === 1 ? 1 : 0);          // 0 centre, 1 wing, 2 corner
    }
    const facetOf = P.stickers.map((s) => s.facet);
    // wings: pairs of stickers; locations: the 12 edges, two wings each
    const partner = new Array(N).fill(-1), locs = {}, locList = [], locOf = new Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      if (typ[i] !== 1) continue;
      const q = pos[i], na = q.findIndex((v) => Math.abs(v) === 4), ma = q.findIndex((v) => Math.abs(v) === 3), r = q.slice();
      r[na] = 3 * Math.sign(q[na]); r[ma] = 4 * Math.sign(q[ma]);
      partner[i] = byPos.get(r.join(','));
    }
    for (let i = 0; i < N; i++) {
      if (typ[i] !== 1 || facetOf[i] > facetOf[partner[i]]) continue;
      const key = facetOf[i] * 6 + facetOf[partner[i]];
      if (!(key in locs)) { locs[key] = locList.length; locList.push([]); }
      locList[locs[key]].push([i, partner[i]]);
      locOf[i] = locOf[partner[i]] = locs[key];
    }
    const centres = []; for (let i = 0; i < N; i++) if (typ[i] === 0) centres.push(i);

    // ---- libraries of 3-cycles
    function seqPerm(seq) { const q = new Int16Array(N); for (let i = 0; i < N; i++) q[i] = i; seq.forEach((m) => { const p = perms[m]; for (let i = 0; i < N; i++) q[i] = p[q[i]]; }); return q; }
    function invSeq(seq) { const r = []; for (let i = seq.length - 1; i >= 0; i--) r.push(seq[i] ^ 1); return r; }
    const setups1 = [[]]; for (let a = 0; a < 24; a++) setups1.push([a]);
    const setups2 = []; for (let a = 0; a < 24; a++) for (let b = 0; b < 24; b++) if ((a >> 1) !== (b >> 1) || (a ^ b) !== 1) setups2.push([a, b]);
    function buildLib(bases, setups) {
      const seen = new Map(), out = [];
      bases.forEach((bs) => setups.forEach((su) => {
        const seq = su.concat(bs, invSeq(su)), q = seqPerm(seq), mv = [], to = [];
        for (let i = 0; i < N; i++) if (q[i] !== i) { mv.push(i); to.push(q[i]); }
        const key = mv.join(',') + '>' + to.join(','), old = seen.get(key);
        if (old === undefined) { seen.set(key, out.length); out.push({ seq: seq, mv: mv, to: to }); } else if (out[old].seq.length > seq.length) out[old] = { seq: seq, mv: mv, to: to };
      }));
      return out;
    }
    const D = root.RB4DATA, libs = {};
    function lib(kind, level) {
      const k = kind + level;
      if (!libs[k]) {
        const bases = decode(D[kind]);
        libs[k] = level === 1 ? buildLib(bases, setups1) : buildLib(bases.filter((_, i) => i % 12 === 0), setups2);
      }
      return libs[k];
    }

    // ---- target colour scheme: the rotation of the identity scheme that matches the centres best
    const rots = (function () {
      const res = [], seen = new Set(), id = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
      const gens = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]];
      const todo = [id];
      while (todo.length) {
        const g = todo.pop(), k = g.join('|'); if (seen.has(k)) continue; seen.add(k); res.push(g);
        gens.forEach((h) => todo.push(mul(h, g)));
      }
      return res.map((g) => FACE_ORDER.map((nm) => { const v = FACE[nm], w = [0, 1, 2].map((i) => g[i][0] * v[0] + g[i][1] * v[1] + g[i][2] * v[2]); return FACE_ORDER.findIndex((n2) => FACE[n2].every((x, i) => x === w[i])); }));
    })();

    // ---- facelets of the reduced cube
    const faceletSticker = [];
    FACE_ORDER.forEach((nm) => {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const p3 = [0, 1, 2].map((a) => FACE[nm][a] * 3 + FR[nm][a] * 2 * (c - 1) + FD[nm][a] * 2 * (r - 1));
        const p4 = p3.map((v) => (Math.abs(v) === 2 ? Math.sign(v) * 3 : Math.abs(v) === 3 ? Math.sign(v) * 4 : 1));
        const na = FACE[nm].findIndex((x) => x !== 0);
        p4[na] = FACE[nm][na] * 4;
        faceletSticker.push(byPos.get(p4.join(',')));
      }
    });
    function parityOf(a) { let s = 0; const seen = new Array(a.length).fill(false); for (let i = 0; i < a.length; i++) { if (seen[i]) continue; let j = i, l = 0; while (!seen[j]) { seen[j] = true; j = a[j]; l++; } s += l - 1; } return s & 1; }
    function isPerm(a, n) { const s = new Set(a); return s.size === n && a.every((v) => v >= 0 && v < n); }
    // describes the cube as a 3x3x3 (centre scheme T): { fl, ok, flip, twist, perm, bad }
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

    function centreScore(col, T) { let s = 0; centres.forEach((i) => { if (col[i] === T[facetOf[i]]) s++; }); return s; }
    function pairedLoc(l, get) { const a = locList[l][0], b = locList[l][1]; return get(a[0]) === get(b[0]) && get(a[1]) === get(b[1]); }
    function pairedCount(col) { let n = 0; for (let l = 0; l < locList.length; l++) if (pairedLoc(l, (s) => col[s])) n++; return n; }

    function run(col, plan, seq) { seq.forEach((m) => { col = P.apply(col, m); plan.push({ b: m >> 1, d: (m & 1) ? -1 : 1 }); }); return col; }

    // greedy: the macro of the largest gain per move, falling back to the longer library
    function greedy(col, plan, kind, target, score, gainOf) {
      for (let guard = 0; guard < 400; guard++) {
        if (score(col) >= target) return col;
        let best = null, bg = 0;
        for (let level = 1; level <= 2 && !best; level++) {
          const L = lib(kind, level);
          for (let e = 0; e < L.length; e++) {
            const g = gainOf(col, L[e]); if (g <= 0) continue;
            const r = g / L[e].seq.length; if (r > bg + 1e-9) { bg = r; best = L[e]; }
          }
        }
        if (!best) { greedy.lastStuck = { kind: kind, score: score(col), target: target }; greedy.stuckCol = col; return null; }
        col = run(col, plan, best.seq);
      }
      return null;
    }
    function centreGain(T) {
      return (col, e) => {
        let g = 0; const mv = e.mv, to = e.to;
        for (let j = 0; j < mv.length; j++) { if (col[mv[j]] === T[facetOf[to[j]]]) g++; if (col[mv[j]] === T[facetOf[mv[j]]]) g--; }
        return g;
      };
    }
    const ov = new Int16Array(N).fill(-1);
    function wingGain(col, e) {
      const mv = e.mv, to = e.to, ls = [];
      for (let j = 0; j < mv.length; j++) { ov[to[j]] = col[mv[j]]; const l = locOf[mv[j]]; if (ls.indexOf(l) < 0) ls.push(l); }
      const get = (s) => (ov[s] >= 0 ? ov[s] : col[s]), old = (s) => col[s]; let g = 0;
      ls.forEach((l) => { if (pairedLoc(l, get)) g++; if (pairedLoc(l, old)) g--; });
      for (let j = 0; j < mv.length; j++) ov[to[j]] = -1;
      return g;
    }

    function reduce(col, plan, T) {
      col = greedy(col, plan, 'M', centres.length, (c) => centreScore(c, T), centreGain(T)); if (!col) return null;
      col = greedy(col, plan, 'W', locList.length, pairedCount, wingGain); return col;
    }

    // ---- parity: a perturbation (a known parity-like sequence or a single move) followed by a new reduction; the cheapest one that makes a valid 3x3x3 wins
    function algSeq(str, g) {
      const out = [];
      str.trim().split(/\s+/).forEach((t) => {
        const wide = t[0] === t[0].toLowerCase(), f = g ? FACE_ORDER[g[FACE_ORDER.indexOf(t[0].toUpperCase())]] : t[0].toUpperCase(), v = FACE[f];
        const li = v[0] ? 0 : v[1] ? 1 : 2, sg = v[0] + v[1] + v[2], ks = sg > 0 ? [0] : [3]; if (wide) ks.push(sg > 0 ? 1 : 2);
        const d0 = -sg, rep = t[1] === '2' ? 2 : 1, d = t[1] === "'" ? -d0 : d0;
        for (let r = 0; r < rep; r++) ks.forEach((k) => out.push((li * 4 + k) * 2 + (d > 0 ? 0 : 1)));
      });
      return out;
    }
    const BASE_ALGS = ["r2 U2 r2 u2 r2 u2", "r2 B2 U2 l U2 r' U2 r U2 F2 r F2 l' B2 r2", "r U2 r U2 r' U2 r U2 l U2 r' U2 r U2 r' U2 r'"];
    let cands = null;
    function candidates() {
      if (cands) return cands;
      cands = []; const seen = new Set();
      const add = (seq) => { const k = Array.from(seqPerm(seq)).join(','); if (!seen.has(k)) { seen.add(k); cands.push(seq); } };
      for (let m = 0; m < 24; m++) add([m]);
      BASE_ALGS.forEach((a) => rots.forEach((g) => { const q = algSeq(a, g); add(q); add(invSeq(q)); }));
      return cands;
    }
    // The effect of every perturbation on (G, F, P) is measured once on a solved cube: G = the wings cannot be paired any more (crossing parity), F = odd edge flip, P = edge / corner permutation parity;
    // the cheapest combination of at most two perturbations that cancels what the cube has is then applied.
    let effects = null;
    function effectTable() {
      if (effects) return effects;
      effects = []; const T = rots[0], solved = Uint8Array.from(P.solvedCol);
      candidates().forEach((z) => {
        const p2 = [], c1 = run(solved, p2, z), c2 = reduce(c1, p2, T);
        if (!c2) { effects.push({ z: z, g: true, f: 0, p: 0, cost: z.length + 40 }); return; }
        const r = reduced(c2, T); if (r.bad || r.twist) return;
        effects.push({ z: z, g: false, f: r.flip ? 1 : 0, p: r.perm ? 1 : 0, cost: p2.length });
      });
      return effects;
    }
    function applyCand(col, plan, T, z) { const c1 = run(col, plan, z); return reduce(c1, plan, T); }
    function fixParity(col, plan, T) {
      const E = effectTable();
      for (let round = 0; round < 5; round++) {
        let r = null; const c0 = reduce(col, plan, T);
        if (c0) { col = c0; r = reduced(col, T); if (r.bad || r.twist) return null; if (r.ok) return { col: col, r: r }; }
        else col = greedy.stuckCol;
        let seq = null;
        if (!r) { const g = E.filter((e) => e.g).sort((a, b) => a.cost - b.cost)[0]; if (!g) return null; seq = [g]; }
        else {
          const need = (r.flip ? 1 : 0) * 2 + (r.perm ? 1 : 0), ng = E.filter((e) => !e.g && (e.f || e.p));
          let bestCost = 1e9;
          ng.forEach((a) => { const ea = a.f * 2 + a.p; if (ea === need && a.cost < bestCost) { bestCost = a.cost; seq = [a]; } });
          ng.forEach((a) => ng.forEach((b) => { const ea = (a.f * 2 + a.p) ^ (b.f * 2 + b.p); if (ea === need && a.cost + b.cost < bestCost) { bestCost = a.cost + b.cost; seq = [a, b]; } }));
          if (!seq) return null;
        }
        for (let k = 0; k < seq.length; k++) { const c = applyCand(col, plan, T, seq[k].z); if (!c) { col = greedy.stuckCol; break; } col = c; }
      }
      return null;
    }

    function solve(col0, opt) {
      opt = opt || {};
      let col = Uint8Array.from(col0); const plan = [];
      let bestT = null, bs = -1; rots.forEach((T) => { const s = centreScore(col, T); if (s > bs) { bs = s; bestT = T; } });
      const T = bestT, info = { parity: 0 };
      let c1 = reduce(col, plan, T), r = null;
      if (c1) { r = reduced(c1, T); if (r.bad || r.twist) return { plan: null, info: info, error: 'invalid ' + JSON.stringify(r) }; col = c1; }
      else col = greedy.stuckCol;
      if (!r || !r.ok) {
        info.parity++;
        const f = fixParity(col, plan, T); if (!f) return { plan: null, info: info, error: 'parity' };
        col = f.col; r = f.r;
      }
      let alg; try { alg = Cube.fromString(r.fl).solve(); } catch (e) { return { plan: null, info: info, error: 'kociemba ' + e }; }
      alg.split(' ').forEach((t) => {
        if (!t) return; const v = FACE[t[0]], li = v[0] ? 0 : v[1] ? 1 : 2, sg = v[0] + v[1] + v[2], b = li * 4 + (sg > 0 ? 0 : 3), d = -sg, rep = t[1] === '2' ? 2 : 1, dd = t[1] === "'" ? -d : d;
        for (let k = 0; k < rep; k++) { col = P.apply(col, b * 2 + (dd > 0 ? 0 : 1)); plan.push({ b: b, d: dd }); }
      });
      return { plan: dedupe(col0, plan), info: info, col: col };
    }
    // a state that is visited twice cuts out the moves in between (a parity sequence may be partly undone by the next reduction)
    function dedupe(col0, plan) {
      const seen = new Map(), out = []; let c = Uint8Array.from(col0); seen.set(c.join(','), 0);
      plan.forEach((m) => {
        c = P.apply(c, P.moveOf(m.b, m.d)); out.push(m); const k = c.join(',');
        if (seen.has(k)) { const n = seen.get(k); out.length = n; seen.forEach((v, kk) => { if (v > n) seen.delete(kk); }); } else seen.set(k, out.length);
      });
      return out;
    }
    function dbgCands(col, T) { const res = {}; candidates().forEach((z, i) => { const p2 = [], c1 = run(col, p2, z), c2 = reduce(c1, p2, T); let key; if (!c2) key = 'stuck'; else { const r = reduced(c2, T); key = r.bad ? 'bad' : (r.flip ? 'F' : '-') + (r.perm ? 'P' : '-') + (r.twist ? 'T' : '-'); } (res[key] = res[key] || []).push(i); }); return res; }
    function warm() { effectTable(); lib('M', 1); lib('W', 1); }
    return { warm: warm, dbgCands: dbgCands, candidates: candidates, greedy: greedy, solve: solve, reduced: reduced, reduce: reduce, rots: rots, lib: lib, centreScore: centreScore, pairedCount: pairedCount, locList: locList, typ: typ, pos: pos, run: run, seqPerm: seqPerm, N: N };
  }
  root.Solver4 = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
