// Square-1 solver (n = 1, 12 sectors, 16 pieces) that knows nothing of the scramble.  Runs as a Web Worker (new Worker('sq1-solve.js')) and as a plain script of sq1.html.
// Phase 1: a BFS over the shapes (the two rows of piece starts, and whether the middle layer is square) from the cube shape; Phase 2: IDA* in the group that keeps the cube shape
// (generators: turns of a layer by 3 sectors, and one slice with the turns that bring it back to the cube shape) with two pattern tables (corner places / edge places).
// The state is read from the engine: the piece in a sector is (origin layer) * 8 + home; origin layer 0 = pieces that started in the top layer (W), 1 = bottom (Y).
(function (root) {
  'use strict';
  const S12 = 12, H = 6, STARTS = [0, 2, 3, 5, 6, 8, 9, 11], WID = [2, 1, 2, 1, 2, 1, 2, 1];
  const CANON = STARTS.reduce((m, s) => m | (1 << s), 0);

  // ---- the model: two rows of sector -> piece id, the same operations as sq1-core.js
  function rot(row, s) { s = ((s % S12) + S12) % S12; if (!s) return; const o = row.slice(); for (let j = 0; j < S12; j++) row[(j + s) % S12] = o[j]; }
  function legal(top, bot) { return top[S12 - 1] !== top[0] && top[H - 1] !== top[H] && bot[S12 - 1] !== bot[0] && bot[H - 1] !== bot[H]; }
  function slice(top, bot, h) { const b = h * H, t0 = top.slice(), b0 = bot.slice(); for (let i = 0; i < H; i++) { top[b + i] = b0[b + H - 1 - i]; bot[b + H - 1 - i] = t0[b + i]; } }
  function maskOf(row) { let m = 0; for (let s = 0; s < S12; s++) if (row[s] !== row[(s + S12 - 1) % S12]) m |= 1 << s; return m; }
  function rotMask(m, s) { s = ((s % S12) + S12) % S12; return ((m << s) | (m >> (S12 - s))) & 4095; }
  function rowFromMask(m, base) { const row = new Array(S12); let s0 = 0; while (!((m >> s0) & 1)) s0++; let id = base - 1; for (let k = 0; k < S12; k++) { const s = (s0 + k) % S12; if ((m >> s) & 1) id++; row[s] = id; } return row; }
  function key(top, bot) { return top.join(',') + '/' + bot.join(','); }

  // ---- phase 1: shapes
  let SH = null;          // Map key -> distance to the cube shape (with the middle layer square)
  function shKey(mt, mb, m) { return mt | (mb << 12) | (m << 24); }
  function shapeNeighbours(mt, mb, m, out) {          // out: list of [key, op]
    out.length = 0;
    for (let s = 1; s < S12; s++) { out.push([shKey(rotMask(mt, s), mb, m), { t: 'r', l: 0, s: s }]); out.push([shKey(mt, rotMask(mb, s), m), { t: 'r', l: 1, s: s }]); }
    const top = rowFromMask(mt, 0), bot = rowFromMask(mb, 100);
    if (legal(top, bot)) for (let h = 0; h < 2; h++) { const t = top.slice(), b = bot.slice(); slice(t, b, h); out.push([shKey(maskOf(t), maskOf(b), m ^ 1), { t: 's', h: h }]); }
  }
  function buildShapes() {
    if (SH) return SH; SH = new Map(); const q = [shKey(CANON, CANON, 0)], nb = []; SH.set(q[0], 0);
    for (let i = 0; i < q.length; i++) {
      const k = q[i], d = SH.get(k); shapeNeighbours(k & 4095, (k >> 12) & 4095, k >> 24, nb);
      for (const [k2] of nb) if (!SH.has(k2)) { SH.set(k2, d + 1); q.push(k2); }
    }
    return SH;
  }

  // ---- phase 2: generators on the 8 corner places and 8 edge places (place = layer * 4 + index inside the layer)
  const GENS = [];
  function readSlots(top, bot) { const c = new Array(8), e = new Array(8); [top, bot].forEach((row, l) => STARTS.forEach((s, k) => { if (k % 2 === 0) c[l * 4 + k / 2] = row[s]; else e[l * 4 + (k - 1) / 2] = row[s]; })); return { c: c, e: e }; }
  function baseRows() { const top = new Array(S12), bot = new Array(S12); STARTS.forEach((s, k) => { for (let q = 0; q < WID[k]; q++) { top[s + q] = k; bot[s + q] = 8 + k; } }); return { top: top, bot: bot }; }
  function buildGens() {
    if (GENS.length) return GENS;
    const seen = new Set();
    function add(ops, df) {
      const r = baseRows(); let f = 0;
      for (const op of ops) { if (op.t === 'r') rot(op.l ? r.bot : r.top, op.s); else { slice(r.top, r.bot, op.h); f ^= 1 << op.h; } }
      if (maskOf(r.top) !== CANON || maskOf(r.bot) !== CANON) return;
      const sl = readSlots(r.top, r.bot), cp = new Array(8), ep = new Array(8);
      for (let p = 0; p < 8; p++) { cp[p] = ((sl.c[p] >> 3) * 4) + ((sl.c[p] & 7) >> 1); }          // the piece now in place p came from place cp[p] (pieces are numbered by their start place)
      for (let p = 0; p < 8; p++) { ep[p] = ((sl.e[p] >> 3) * 4) + (((sl.e[p] & 7) - 1) >> 1); }
      const k = cp.join('') + '|' + ep.join('') + '|' + f; if (seen.has(k)) return; seen.add(k);
      GENS.push({ ops: ops, cp: cp, ep: ep, f: f, rot: ops.length === 1 && ops[0].t === 'r' ? ops[0].l + 1 : 0 });
    }
    for (const l of [0, 1]) for (let j = 1; j <= 3; j++) add([{ t: 'r', l: l, s: 3 * j }], 0);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let h = 0; h < 2; h++) for (let c = 0; c < 3; c++) for (let d = 0; d < 3; d++) {
      const ops = []; if (a) ops.push({ t: 'r', l: 0, s: a }); if (b) ops.push({ t: 'r', l: 1, s: b }); ops.push({ t: 's', h: h }); if (c) ops.push({ t: 'r', l: 0, s: c }); if (d) ops.push({ t: 'r', l: 1, s: d });
      const r = baseRows(); if (a) rot(r.top, a); if (b) rot(r.bot, b); if (!legal(r.top, r.bot)) continue; add(ops, 0);
    }
    GENS.slice().forEach((g) => { const inv = g.ops.slice().reverse().map((op) => (op.t === 'r' ? { t: 'r', l: op.l, s: (S12 - op.s) % S12 } : op)); add(inv, 0); });          // closed under inverses: the tables are distances to the goal
    return GENS;
  }
  // The corner and edge places moved by the generators always have the same parity; a state of the other parity is first carried over by one fixed macro: a word through shapes
  // that are not the cube shape, found by a seeded random search (cheapest of many), that ends in the cube shape with the middle layer square and flips the relative parity.
  function parity(p) { let q = 0; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (p[j] < p[i]) q ^= 1; return q; }
  let MACRO = null;
  // sign of the permutation the move makes on the reading order (pieces by the sector they start in, top layer then bottom layer; corners and edges apart) -- this is what
  // decides the parity of the corner and edge places, and it depends on the shape only, so the search below can keep one parity bit next to the shape
  function readOrder(top, bot) { const cs = [], es = []; [top, bot].forEach((row) => { for (let s = 0; s < S12; s++) { if (row[s] === row[(s + S12 - 1) % S12]) continue; (row[(s + 1) % S12] === row[s] ? cs : es).push(row[s]); } }); return { cs: cs, es: es }; }
  function signOf(newer, older) { const idx = newer.map((id) => older.indexOf(id)); let q = 0; for (let i = 0; i < idx.length; i++) for (let j = i + 1; j < idx.length; j++) if (idx[j] < idx[i]) q ^= 1; return q; }
  function parityMacro() {
    if (MACRO !== null) return MACRO; buildShapes(); buildGens();
    const k0 = shKey(CANON, CANON, 0) | (0 << 25), par = new Map(), q = [k0], nb = []; par.set(k0, null);
    const goal = shKey(CANON, CANON, 0) | (1 << 25);
    for (let i = 0; i < q.length && !par.has(goal); i++) {
      const k = q[i], mt = k & 4095, mb = (k >> 12) & 4095, m = (k >> 24) & 1, pb = (k >> 25) & 1;
      const top = rowFromMask(mt, 0), bot = rowFromMask(mb, 100), o0 = readOrder(top, bot);
      for (let s = 1; s < S12; s++) for (let l = 0; l < 2; l++) {
        const t2 = top.slice(), b2 = bot.slice(); rot(l ? b2 : t2, s); const o1 = readOrder(t2, b2), pb2 = pb ^ signOf(o1.cs, o0.cs) ^ signOf(o1.es, o0.es), k2 = shKey(maskOf(t2), maskOf(b2), m) | (pb2 << 25);
        if (!par.has(k2)) { par.set(k2, { k: k, op: { t: 'r', l: l, s: s } }); q.push(k2); }
      }
      if (legal(top, bot)) for (let h = 0; h < 2; h++) {
        const t2 = top.slice(), b2 = bot.slice(); slice(t2, b2, h); const o1 = readOrder(t2, b2), pb2 = pb ^ signOf(o1.cs, o0.cs) ^ signOf(o1.es, o0.es), k2 = shKey(maskOf(t2), maskOf(b2), m ^ 1) | (pb2 << 25);
        if (!par.has(k2)) { par.set(k2, { k: k, op: { t: 's', h: h } }); q.push(k2); }
      }
    }
    if (!par.has(goal)) return (MACRO = null);
    const ops = []; for (let k = goal; par.get(k); k = par.get(k).k) ops.push(par.get(k).op); ops.reverse();
    return (MACRO = { ops: compress(ops), len: compress(ops).length });
  }

  // permutation ranks (8 elements)
  const FACT = [1, 1, 2, 6, 24, 120, 720, 5040];
  function rank(p) { let r = 0; for (let i = 0; i < 8; i++) { let c = 0; for (let j = i + 1; j < 8; j++) if (p[j] < p[i]) c++; r = r * (8 - i) + c; } return r; }
  function unrank(r) { const digs = new Array(8); for (let i = 7; i >= 0; i--) { const base = 8 - i; digs[i] = r % base; r = Math.floor(r / base); } const used = [], p = new Array(8); for (let i = 0; i < 8; i++) { let c = digs[i], v = 0; for (v = 0; v < 8; v++) { if (used[v]) continue; if (c === 0) break; c--; } used[v] = 1; p[i] = v; } return p; }
  let TAB = null;
  function buildTables() {
    if (TAB) return TAB; const gens = buildGens(), NG = gens.length, N = 40320;
    const ct = new Int32Array(NG * N), et = new Int32Array(NG * N);
    for (let r = 0; r < N; r++) {
      const p = unrank(r);
      for (let g = 0; g < NG; g++) {
        const qc = new Array(8), qe = new Array(8);
        for (let s = 0; s < 8; s++) { qc[s] = p[gens[g].cp[s]]; qe[s] = p[gens[g].ep[s]]; }          // new place s takes the piece that was in place gens[g].cp[s]
        ct[g * N + r] = rank(qc); et[g * N + r] = rank(qe);
      }
    }
    function bfs(tr) {
      const d = new Int8Array(N * 4).fill(-1), q = new Int32Array(N * 4); let h = 0, t = 0; d[0] = 0; q[t++] = 0;
      while (h < t) { const s = q[h++], r = s >> 2, f = s & 3, dd = d[s]; for (let g = 0; g < NG; g++) { const s2 = (tr[g * N + r] << 2) | (f ^ gens[g].f); if (d[s2] < 0) { d[s2] = dd + 1; q[t++] = s2; } } }
      return d;
    }
    TAB = { ct: ct, et: et, dc: bfs(ct), de: bfs(et), N: N, NG: NG }; return TAB;
  }
  // States within GD generators of the goal, kept for the last steps of the search: key -> depth * 32 + the generator that is the next step toward the goal
  const GD = 5; let GM = null, INV = null;
  function goalMap() {
    if (GM) return GM; const T = buildTables(), gens = GENS, N = T.N, NG = T.NG;
    INV = gens.map((g, gi) => { for (let h = 0; h < NG; h++) { let ok = true; for (let p = 0; p < 8 && ok; p++) if (gens[h].cp[g.cp[p]] !== p || gens[h].ep[g.ep[p]] !== p) ok = false; if (ok && gens[h].f === g.f) return h; } return -1; });
    GM = new Map(); GM.set(0, 0); let fr = [[0, 0, 0]];
    for (let d = 1; d <= GD; d++) {
      const nx = [];
      for (const [cr, er, f] of fr) for (let g = 0; g < NG; g++) {
        const c2 = T.ct[g * N + cr], e2 = T.et[g * N + er], f2 = f ^ gens[g].f, k = (c2 * N + e2) * 4 + f2;
        if (!GM.has(k)) { GM.set(k, d * 32 + INV[g]); nx.push([c2, e2, f2]); }
      }
      fr = nx;
    }
    return GM;
  }
  function solve2(cp, ep, f, maxDepth, nodeLimit) {
    const T = buildTables(), gens = GENS, N = T.N, NG = T.NG, path = [], gm = goalMap();
    let nodes = 0;
    function finish(cr, er, ff) { for (;;) { const v = gm.get((cr * N + er) * 4 + ff); if (v === 0) return; const g = v & 31; path.push(g); cr = T.ct[g * N + cr]; er = T.et[g * N + er]; ff ^= gens[g].f; } }
    function dfs(cr, er, ff, depth, limit, last) {
      const v = gm.get((cr * N + er) * 4 + ff);
      if (v !== undefined && depth + (v >> 5) <= limit) { finish(cr, er, ff); return true; }
      const h = Math.max(T.dc[(cr << 2) | ff], T.de[(er << 2) | ff]);
      if (depth + h > limit) return false;
      if (++nodes > nodeLimit) throw new Error('limit');
      for (let g = 0; g < NG; g++) {
        const gr = gens[g].rot;
        if (gr && last === gr) continue;          // two turns of one layer in a row are one turn
        if (gr === 1 && last === 2) continue;      // (bottom, top) = (top, bottom): keep one order
        path.push(g);
        if (dfs(T.ct[g * N + cr], T.et[g * N + er], ff ^ gens[g].f, depth + 1, limit, gr)) return true;
        path.pop();
      }
      return false;
    }
    const cr = rank(cp), er = rank(ep), ff = f;
    for (let limit = Math.max(T.dc[(cr << 2) | ff], T.de[(er << 2) | ff]); limit <= maxDepth; limit++) { path.length = 0; if (dfs(cr, er, ff, 0, limit, 0)) { api.last = { nodes: nodes, limit: limit, gens: path.length }; return path.slice(); } }
    api.last = { nodes: nodes, fail: true };
    return null;
  }

  // ---- the whole solution
  function compress(ops) {
    const out = [], pend = [0, 0];
    const flush = () => { for (let l = 0; l < 2; l++) { let s = ((pend[l] % S12) + S12) % S12; if (s > S12 / 2) s -= S12; if (s) out.push({ t: 'r', l: l, s: s }); pend[l] = 0; } };
    for (const op of ops) { if (op.t === 'r') pend[op.l] += op.s; else { flush(); out.push({ t: 's', h: op.h }); } }
    flush(); return out;
  }
  // top, bottom: arrays of 12 piece ids (origin layer * 8 + home), f0, f1: the flips of the two halves of the middle layer.  Returns the list of engine moves or null.
  function solve(top0, bot0, f0, f1, nodeLimit) {
    buildShapes(); buildGens();
    const top = top0.slice(), bot = bot0.slice(), ops = []; let f = f0 | (f1 << 1);
    const apply = (op) => { ops.push(op); if (op.t === 'r') rot(op.l ? bot : top, op.s); else { slice(top, bot, op.h); f ^= 1 << op.h; } };
    // phase 1
    const nb = [];
    for (let guard = 0; guard < 40; guard++) {
      const mt = maskOf(top), mb = maskOf(bot), m = (f & 1) ^ (f >> 1), k = shKey(mt, mb, m), d = SH.get(k);
      if (d === undefined) return null; if (d === 0) break;
      shapeNeighbours(mt, mb, m, nb); let best = null; for (const [k2, op] of nb) if (SH.get(k2) === d - 1) { best = op; break; }
      if (!best) return null; apply(best);
    }
    // phase 2: places
    const places = () => { const sl = readSlots(top, bot), cp = new Array(8), ep = new Array(8); for (let p = 0; p < 8; p++) { cp[p] = ((sl.c[p] >> 3) * 4) + ((sl.c[p] & 7) >> 1); ep[p] = ((sl.e[p] >> 3) * 4) + (((sl.e[p] & 7) - 1) >> 1); } return { cp: cp, ep: ep }; };
    let pl = places();
    if (parity(pl.cp) !== parity(pl.ep)) { const mac = parityMacro(); if (!mac) return null; mac.ops.forEach(apply); pl = places(); }
    const cp = pl.cp, ep = pl.ep;
    api.lastState = { cp: cp, ep: ep, f: f }; const g = solve2(cp, ep, f, 30, nodeLimit || 40000000); if (!g) return null;
    for (const gi of g) GENS[gi].ops.forEach(apply);
    const plan = compress(ops);
    return { plan: plan, phase1: ops.length - g.reduce((n, gi) => n + GENS[gi].ops.length, 0), gens: g.length };
  }
  function simulate(top0, bot0, f0, f1, plan) {          // the keys of the states before every move and after the last
    const top = top0.slice(), bot = bot0.slice(), keys = []; let f = f0 | (f1 << 1);
    for (const op of plan) { keys.push(key(top, bot) + '/' + f); if (op.t === 'r') rot(op.l ? bot : top, op.s); else { slice(top, bot, op.h); f ^= 1 << op.h; } }
    keys.push(key(top, bot) + '/' + f); return keys;
  }
  const api = { macro: parityMacro, solve: solve, simulate: simulate, build: function () { buildShapes(); buildTables(); goalMap(); }, shapes: buildShapes, gens: buildGens, tables: buildTables, key: key, maskOf: maskOf, rank: rank, unrank: unrank };
  root.SQ1SOLVE = api;

  // ---- worker side
  if (typeof window === 'undefined' && typeof importScripts === 'function') {
    root.onmessage = function (ev) {
      const m = ev.data;
      try {
        if (m.cmd === 'init') { api.build(); root.postMessage({ cmd: 'init' }); }
        else if (m.cmd === 'solve') { const t0 = Date.now(), r = solve(m.top, m.bot, m.f0, m.f1); root.postMessage({ cmd: 'plan', id: m.id, plan: r && r.plan, keys: r && simulate(m.top, m.bot, m.f0, m.f1, r.plan), ms: Date.now() - t0 }); }
      } catch (e) { root.postMessage({ cmd: 'plan', id: m.id, plan: null, error: String(e && e.message || e) }); }
    };
    return;
  }

  // ---- page side: registered with the hook of sq1.js
  if (typeof window !== 'undefined') {
    const PS = { worker: null, ready: false, failed: false, pending: false, id: 0, plan: null, keys: null, sync: false };
    function readState(S) { const top = [], bot = []; [S.layers[0], S.layers[1]].forEach((row, l) => row.forEach((o) => (l ? bot : top).push((o.up ? 0 : 1) * 8 + o.home))); return { top: top, bot: bot, f0: S.mflip[0], f1: S.mflip[1] }; }
    function curKey(st) { return key(st.top, st.bot) + '/' + (st.f0 | (st.f1 << 1)); }
    function startWorker() {
      if (PS.worker || PS.failed || PS.sync) return;
      if (new URLSearchParams(location.search).get('noworker')) { PS.sync = true; return; }
      try {
        PS.worker = new Worker('sq1-solve.js');
        PS.worker.onmessage = (ev) => { const m = ev.data; if (m.cmd === 'init') PS.ready = true; else if (m.cmd === 'plan' && m.id === PS.id) { PS.pending = false; if (m.plan) { PS.plan = m.plan; PS.keys = m.keys; } else PS.failed = true; } };
        PS.worker.onerror = () => { PS.worker = null; PS.sync = true; PS.pending = false; };
        PS.worker.postMessage({ cmd: 'init' });
      } catch (e) { PS.worker = null; PS.sync = true; }
    }
    function request(st) {
      if (PS.sync) { try { const r = solve(st.top, st.bot, st.f0, st.f1); if (r) { PS.plan = r.plan; PS.keys = simulate(st.top, st.bot, st.f0, st.f1, r.plan); } else PS.failed = true; } catch (e) { PS.failed = true; } return; }
      PS.pending = true; PS.id++; PS.worker.postMessage({ cmd: 'solve', id: PS.id, top: st.top, bot: st.bot, f0: st.f0, f1: st.f1 });
    }
    function index(st) { if (!PS.plan) return -1; return PS.keys.indexOf(curKey(st)); }
    root.SQSOLVERS = root.SQSOLVERS || [];
    root.SQSOLVERS.push({
      match: (n) => n === 1,
      next: (S, G) => {
        const SQ = root.SQ1; if (SQ.isSolved(S)) return null;
        const st = readState(S); startWorker();
        let i = index(st); if (i >= 0 && i < PS.plan.length) return PS.plan[i];
        if (PS.failed) return undefined;
        if (PS.pending) return 'wait';
        PS.plan = null; request(st); if (PS.pending) return 'wait';
        i = index(st); return i >= 0 && i < PS.plan.length ? PS.plan[i] : undefined;
      },
      plan: (S) => {
        const st = readState(S); let i = index(st);
        if (i < 0) return null;
        return PS.plan.slice(i);
      },
      state: PS,
    });
  }
})(typeof window !== 'undefined' ? window : self);
