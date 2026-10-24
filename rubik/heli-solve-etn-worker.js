// Web Worker of the edge-turning cube solver: little chop family (cube ET), clover and curvy copter, fisher and windmill cube (and the clover of size 8, the curvy of size 9).  Three ways, none uses the scramble history:
//  * size-generic (heli-solve-tc-core.js): the half turns of the planes are permutations of the sticker slots; 3-cycles from commutators of small-support elements, per orbit, no table - cube ET n >= 5 of any size;
//  * facelet model + offline table (heli-solve-star-core.js, heli-solve-etn-data*.js, made by a C++ Minkwitz-style chain builder) - clover / curvy of the sizes that have legal moves, cube n = 4;
//  * pose model (heli-solve-edge.js, heli-solve-fisher-data.js / heli-solve-pose-*.js) - fisher, windmill, clover 8, curvy 9.
// The model is built with the bond rule switched off (every turn is an allowed lattice turn); jumbled states (70.53 degree turns) are undone first on the real engine.
self.window = self;
importScripts('engine.js', 'puzzles.js', 'heli-core.js', 'heli-solve-star-core.js', 'heli-solve-etn-data.js', 'heli-solve-edge.js', 'heli-solve-fisher-data.js', 'heli-solve-tc-core.js', 'heli-solve-fi.js');
(function () {
  'use strict';
  const H = self.HELI, X = self.HSTAR;
  const q3 = (x) => { const v = Math.round(x * 1913.7); return v === 0 ? 0 : v; };
  const keyOfPoly = (poly) => { const a = poly.map((p) => q3(p[0]) + ',' + q3(p[1]) + ',' + q3(p[2])); a.sort(); return a.join('|'); };
  const invPerm = (p) => { const r = new Int16Array(p.length); for (let i = 0; i < p.length; i++) r[p[i]] = i; return r; };
  function hashPos(pos) {
    let a = 0x811c9dc5 | 0, b = 0x9747b28c | 0;
    for (let i = 0; i < pos.length; i++) { a = Math.imul(a ^ pos[i], 16777619); b = Math.imul(b + pos[i] + 1, 40503) ^ (b >>> 15); }
    return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36);
  }
  function poseSig(S) {
    let s = ''; for (const pc of S.pieces) { for (let i = 0; i < 9; i++) s += Math.round(pc.R[i] * 97.3) + ','; for (let i = 0; i < 3; i++) s += Math.round(pc.T[i] * 97.3) + ','; s += ';'; }
    let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return 'E' + h + ':' + s.length;
  }
  function posOf(S, model) { const pos = new Int16Array(model.d); for (let f = 0; f < model.d; f++) { const fi = model.fl[f], q = model.slotOf.get(keyOfPoly(S.pieces[fi.i].W[fi.k])); if (q === undefined) return null; pos[f] = q; } return pos; }
  const MODELS = {};
  function getModel(shape, n) {
    const mk = shape + ':' + n; if (MODELS[mk]) return MODELS[mk];
    const cf = H.config(n, shape), b0 = cf.bond; cf.bond = false;
    try {
      const model = X.buildModel(shape, n);
      // every half turn must keep the pieces on the lattice (clover n = 8: some shells are not symmetric under a half turn, so even those turns deform the puzzle: no lattice model)
      model.latBad = 0; for (let p = 0; p < cf.planes.length; p++) { const V = H.create(n, shape); if (H.apply(V, { p: p, a: Math.PI }) && !X.onLatticeFast(V, model)) model.latBad++; }
      return (MODELS[mk] = model);
    } finally { cf.bond = b0; }
  }
  self.onmessage = function (e) {
    const m = e.data; if (m.cmd !== 'solve') return;
    try { self.postMessage({ id: m.id, result: solve(m.shape, m.n, m.state) }); } catch (err) { self.postMessage({ id: m.id, error: String(err && err.message || err) }); }
  };
  // fisher / windmill: the point model of heli-solve-edge.js (a piece in one of the 24 poses of the tilted cube frame) with the tables of heli-solve-fisher-data.js
  function solvePoints(shape, n, st) {
    const t0 = Date.now(), S = X.loadState(shape, n, st);
    if (H.isSolved(S)) return { plan: [], sigs: [], ms: 0 };
    const cf = H.config(n, shape), b0 = cf.bond; let pl, ok = true;
    try { cf.bond = false; pl = self.HEDGE.plan(S, shape, n); } finally { cf.bond = b0; }
    if (!pl) return { error: 'no table for ' + shape + ' ' + n };
    const V = X.loadState(shape, n, st);
    let bad = -1;
    try { cf.bond = false; for (let i = 0; i < pl.moves.length; i++) { const mv = pl.moves[i]; if (!H.apply(V, { p: mv.p, a: mv.a })) { ok = false; bad = i; break; } } if (ok) ok = H.isSolved(V); } finally { cf.bond = b0; }
    if (!ok) return { error: 'replay not solved' + (bad >= 0 ? ' (turn ' + bad + ' of ' + pl.moves.length + ' refused)' : ' (end state not solved, ' + pl.moves.length + ' turns)') };
    return { plan: pl.moves.map((m) => ({ p: m.p, a: m.a, trust: true })), sigs: pl.sigs, ms: Date.now() - t0, pre: 0, base: pl.model.sp.length, d: pl.model.pts.length };
  }
  // the big tables are separate files, loaded the first time their puzzle is asked for
  function loadData(shape, n) {
    const key = shape + ':' + n;
    if ((self.HSTAR_DATA && self.HSTAR_DATA[key]) || (self.HEDGE_DATA && self.HEDGE_DATA[key])) return;
    for (const f of ['heli-solve-etn-data-' + shape + '-' + n + '.js', 'heli-solve-pose-' + shape + '-' + n + '.js']) { try { self.importScripts(f); } catch (e) { /* no such file */ } }
  }

  // ---- size-generic path (heli-solve-tc-core.js): the half turns of all planes are the generators; 3-cycles by commutators, no table
  const cenKeyOf = (W) => { let x = 0, y = 0, z = 0, c = 0; for (const f of W) for (const v of f) { x += v[0]; y += v[1]; z += v[2]; c++; } return q3(x / c) + ',' + q3(y / c) + ',' + q3(z / c); };
  const TCM = {};
  function getTC(shape, n) {
    const mk = shape + ':' + n; if (TCM[mk]) return TCM[mk];
    const cf = H.config(n, shape), b0 = cf.bond; cf.bond = false;
    try {
      const S = H.create(n, shape), fl = [], slotOf = new Map();
      S.pieces.forEach((pc, i) => pc.home.forEach((f, k) => { if (f.tag >= 0) { slotOf.set(keyOfPoly(pc.W[k]), fl.length); fl.push({ i: i, k: k }); } }));
      const d = fl.length, perms = [], inv = [], planeOf = [], seen = new Map(); let latBad = 0, refused = 0;
      const sigOf = (pm) => { let h = 0; for (let i = 0; i < pm.length; i += 7) h = (Math.imul(h, 31) + pm[i]) | 0; return h + ':' + pm[1] + ':' + pm[pm.length - 1]; };
      const byPiece = new Map(); fl.forEach((q, f) => { let l = byPiece.get(q.i); if (!l) byPiece.set(q.i, (l = [])); l.push(f); });
      for (let p = 0; p < cf.planes.length; p++) {
        const mem = H.members(S, p); if (!mem || !H.apply(S, { p: p, a: Math.PI })) { refused++; continue; }
        const pm = new Uint16Array(d); for (let f = 0; f < d; f++) pm[f] = f; let ok = true, id = true;
        for (const i of mem) { const l = byPiece.get(i); if (!l) continue; for (const f of l) { const q = slotOf.get(keyOfPoly(S.pieces[i].W[fl[f].k])); if (q === undefined) { ok = false; break; } pm[f] = q; if (q !== f) id = false; } if (!ok) break; }
        if (!H.apply(S, { p: p, a: Math.PI })) throw new Error('half turn cannot be undone');
        if (!ok) { latBad++; continue; }
        if (id) continue;
        const sg = sigOf(pm), prev = seen.get(sg); if (prev) { let same = true; const q = perms[prev - 1]; for (let f = 0; f < d; f++) if (q[f] !== pm[f]) { same = false; break; } if (same) continue; }
        perms.push(pm); planeOf.push(p); seen.set(sg, perms.length);
      }
      // inverse generators where a turn is not an involution
      const M0 = perms.length; inv.length = M0;
      for (let k = 0; k < M0; k++) { const pm = perms[k]; let invol = true; for (let f = 0; f < d; f++) if (pm[pm[f]] !== f) { invol = false; break; } if (invol) inv[k] = k; }
      for (let k = 0; k < M0; k++) if (inv[k] === undefined) { const q = new Uint16Array(d); for (let f = 0; f < d; f++) q[perms[k][f]] = f; perms.push(q); planeOf.push(planeOf[k]); inv[k] = perms.length - 1; inv.push(k); }
      const model = { d: d, perms: perms, inv: inv, planeOf: planeOf, fl: fl, slotOf: slotOf, latBad: latBad, refused: refused, nplanes: cf.planes.length, latStops: cf.planes.map(() => [0, Math.PI]) };
      const cen = new Set(); S.pieces.forEach((pc) => cen.add(cenKeyOf(pc.W))); model.cenKeys = cen;
      Object.defineProperty(model, 'allKeys', { configurable: true, get: function () { const a = new Set(); S.pieces.forEach((pc) => pc.W.forEach((w) => a.add(keyOfPoly(w)))); Object.defineProperty(model, 'allKeys', { value: a }); return a; } });
      return (TCM[mk] = model);
    } finally { cf.bond = b0; }
  }

  // way back from a jumbled state to the lattice (the jumbling turns of the scramble are undone one by one).  Like HSTAR.unjumble but with a cheap lattice test (all plane angles at 0 or 180 degrees, then the
  // sticker slots) because on a big puzzle the piece-by-piece test of the other one costs more than the turn itself
  function unjumbleTC(S, model, ms, accept) {
    const np = model.nplanes, path = [], t0 = Date.now(), PI = Math.PI, norm = X.normA;
    const latOK = (p) => Math.abs(norm(S.ang[p])) < 1e-6 || Math.abs(norm(S.ang[p] - PI)) < 1e-6;
    const allLat = () => { for (let p = 0; p < np; p++) if (!latOK(p)) return false; return true; };
    if (allLat() && accept([])) return [];
    let over = false;
    const timeUp = () => { if (Date.now() - t0 > ms) over = true; return over; };
    function dfs(depth, limit, prev, restrict, latOnly) {
      if (depth > 0 && allLat() && accept(path.slice())) return true;
      if (depth >= limit || timeUp()) return false;
      const cand = [];
      for (let p = 0; p < np; p++) {
        if (restrict && latOK(p)) continue;
        const stops = S.cfg.planes[p].stops, tried = new Set();
        for (const t of stops) {
          if (latOnly && !(Math.abs(norm(t)) < 1e-6 || Math.abs(norm(t - PI)) < 1e-6)) continue;
          const a = norm(t - S.ang[p]); if (Math.abs(a) < 1e-7) continue; const k = Math.round(a * 1e6); if (tried.has(k)) continue; tried.add(k);
          if (prev && prev.p === p && Math.abs(norm(a + prev.a)) < 1e-6) continue;
          cand.push({ p: p, a: a });
        }
      }
      for (const c of cand) {
        if (!H.apply(S, { p: c.p, a: c.a })) continue;
        path.push({ p: c.p, a: c.a });
        if (dfs(depth + 1, limit, c, restrict, latOnly)) return true;
        path.pop(); H.apply(S, { p: c.p, a: -c.a }); S.hist.length = Math.max(0, S.hist.length - 2); S.ang[c.p] = norm(S.ang[c.p]);
        if (over) return false;
      }
      return false;
    }
    let nfail = 0; for (let p = 0; p < np; p++) if (!latOK(p)) nfail++;
    for (let d = Math.max(1, nfail); d <= nfail + 1 && !over; d++) if (dfs(0, d, null, true, true)) return path.slice();
    for (let d = 1; d <= nfail + 2 && !over; d++) if (dfs(0, d, null, true, false)) return path.slice();
    for (let d = 1; d <= 6 && !over; d++) if (dfs(0, d, null, false, false)) return path.slice();
    return null;
  }

  // ---- fisher cube of any size (heli-solve-fi.js: abstract model of the cells, heli-solve-tc-core.js: the solver); the offline pose tables serve the sizes up to 11
  const FIM = {}, FIT = {};
  function solveFi(shape, n, st) {
    const t0 = Date.now(); let M = FIM[n]; if (!M) M = FIM[n] = self.HFI.build(n);
    let T = FIT[n]; if (!T) T = FIT[n] = self.HTC.build({ d: M.d, perms: M.perms, inv: M.inv }, { real: M.real, block: M.block, nseed: 30 });
    if (T.error) return { error: 'generic solver: ' + T.error };
    const S = X.loadState(shape, n, st); if (H.isSolved(S)) return { plan: [], sigs: [], ms: 0 };
    const pos = M.posOf(S); if (!pos) return { error: 'state is not on the cell grid' };
    const word = T.solve(pos); if (!word) return { error: 'generic solver: ' + (T.lastError || 'no word') };
    const lat = new Int16Array(word.length), lang = new Int8Array(word.length);
    for (let i = 0; i < word.length; i++) { lat[i] = M.planeOf[word[i]]; lang[i] = M.codeOf[word[i]]; }
    return { pre: [], lat: lat, lang: lang, sigs: [[0, M.hashR(S)]], sigKind: 'R', ms: Date.now() - t0, total: word.length, tc: true, d: M.d, buildMs: T.stats.buildMs };
  }
  const TOOLS = {};
  function getTool(shape, n, model) {
    const mk = shape + ':' + n; if (TOOLS[mk]) return TOOLS[mk];
    return (TOOLS[mk] = self.HTC.build({ d: model.d, perms: model.perms, inv: model.inv }, { nseed: 40 }));
  }
  function posOfTC(S, model) { const pos = new Int32Array(model.d); for (let f = 0; f < model.d; f++) { const q = model.slotOf.get(keyOfPoly(S.pieces[model.fl[f].i].W[model.fl[f].k])); if (q === undefined) return null; pos[f] = q; } return pos; }
  function solveTC(shape, n, st) {
    const t0 = Date.now(), model = getTC(shape, n);
    if (model.latBad) return { error: model.latBad + ' planes turn the puzzle off the lattice by a half turn: not supported' };
    if (!model.perms.length) return { error: 'no moves' };
    const tool = getTool(shape, n, model); if (tool.error) return { error: 'generic solver: ' + tool.error };
    const S = X.loadState(shape, n, st);
    if (H.isSolved(S)) return { plan: [], sigs: [], ms: 0 };
    let word = null, pos = null; const cf0 = H.config(n, shape), bond0 = cf0.bond; let pre; cf0.bond = false;
    try { pre = unjumbleTC(S, model, 120000, () => { pos = posOfTC(S, model); if (!pos) return false; word = tool.solve(pos); return !!word; }); } finally { cf0.bond = bond0; }
    if (pre === null) return { error: 'cannot undo the jumbling' };
    if (!word) return { error: 'generic solver: ' + (tool.lastError || 'no word') };
    const R = X.loadState(shape, n, st), pre2 = X.mergeMoves(pre), plan = [], sigs = [];
    cf0.bond = false;
    try { for (const mv of pre2) { sigs.push([plan.length, poseSig(R)]); if (!H.apply(R, mv)) return { error: 'engine refused ' + JSON.stringify(mv) }; plan.push({ p: mv.p, a: mv.a, trust: true }); } } finally { cf0.bond = bond0; }
    let cur = posOfTC(R, model); if (!cur) return { error: 'not on the lattice after the jumble' };
    // the lattice part as a compact list of planes, checkpoints every 256 turns, final check
    const lat = new Int16Array(word.length), nl = new Int32Array(cur);
    const base = plan.length;
    for (let i = 0; i < word.length; i++) {
      if ((i & 255) === 0) sigs.push([base + i, 'L' + hashPos(cur)]);
      const g = word[i], pm = model.perms[g]; lat[i] = model.planeOf[g];
      for (let f = 0; f < cur.length; f++) cur[f] = pm[cur[f]];
    }
    for (let f = 0; f < cur.length; f++) if (cur[f] !== f) return { error: 'generic word does not solve the facelets' };
    return { pre: plan, lat: lat, sigs: sigs, ms: Date.now() - t0, total: plan.length + word.length, tc: true, d: model.d, buildMs: tool.stats.buildMs };
  }
  function solve(shape, n, st) {
    loadData(shape, n);
    if (shape === 'cubefisher' && (n >= 12 || !(self.HEDGE_DATA && self.HEDGE_DATA[shape + ':' + n]))) { const r = solveFi(shape, n, st); if (!r.error || n >= 12) return r; }
    if (shape === 'cube' && n >= 5) { const r = solveTC(shape, n, st); if (!r.error) return r; }
    if (shape !== 'cubefisher' && shape !== 'cubewindmill' && !(self.HSTAR_DATA && self.HSTAR_DATA[shape + ':' + n]) && !(self.HEDGE_DATA && self.HEDGE_DATA[shape + ':' + n])) return solveTC(shape, n, st);
    if (shape === 'cubefisher' || shape === 'cubewindmill' || (self.HEDGE_DATA && self.HEDGE_DATA[shape + ':' + n])) return solvePoints(shape, n, st);
    const t0 = Date.now(), model = getModel(shape, n);
    if (!model.moves.length) return { error: 'no moves' };
    if (model.latBad) return { error: model.latBad + ' planes turn the puzzle off the lattice by a half turn: not supported' };
    const dat = self.HSTAR_DATA && self.HSTAR_DATA[shape + ':' + n];
    if (!dat && model.d > 200) return { error: 'no table for ' + shape + ' ' + n + ' (' + model.d + ' facelets)' };
    const S = X.loadState(shape, n, st);
    if (H.isSolved(S)) return { plan: [], sigs: [], ms: 0 };
    const T = X.getTable(model, Math.random, { ms: 150000 });
    let word = null, pos = null;
    // (the search for the way back to the lattice runs without the bond rule too: with it every turn costs 0.1 s and more at the bigger sizes; the turns of the plan carry trust, the page skips the rule for them)
    const cf0 = H.config(n, shape), bond0 = cf0.bond; let pre; cf0.bond = false;
    try { pre = X.unjumble(S, model, { ms: 30000 }, () => { pos = posOf(S, model); if (!pos) return false; word = T.sift(invPerm(pos)); return !!word; }); } finally { cf0.bond = bond0; }
    if (pre === null) return { error: 'cannot undo the jumbling' };
    if (!word) return { error: 'state not in the table' };
    // cancel turns that undo each other (a half turn followed by the same half turn)
    const stack = []; for (const k of word) { const top = stack[stack.length - 1]; if (top !== undefined && model.moves[top].inv === k) stack.pop(); else stack.push(k); }
    const plan = [], sigs = [];
    // the jumble-undoing turns run on the real engine (bond rule on): their states are named by the pose of the pieces
    const R = X.loadState(shape, n, st);
    const pre2 = X.mergeMoves(pre);
    cf0.bond = false;
    try { for (const mv of pre2) { sigs.push(poseSig(R)); if (!H.apply(R, mv)) return { error: 'engine refused ' + JSON.stringify(mv) }; plan.push({ p: mv.p, a: mv.a, trust: true }); } } finally { cf0.bond = bond0; }
    // the lattice part: the state is the position vector of the facelets; every turn is a permutation of the slots
    let cur = posOf(R, model); if (!cur) return { error: 'not on the lattice after the jumble' };
    for (const k of stack) {
      sigs.push('L' + hashPos(cur)); const mv = model.moves[k]; plan.push({ p: mv.p, a: mv.a, trust: true });
      const nx = new Int16Array(cur.length); for (let f = 0; f < cur.length; f++) nx[f] = mv.perm[cur[f]]; cur = nx;
    }
    // verification on a fresh engine copy (bond rule off for the lattice turns: only the geometry is checked)
    // (a plan of thousands of turns on a big puzzle takes a minute to replay: then only the abstract run above, whose final slot vector must be the identity, is checked; the page re-plans if the engine disagrees)
    if (!cur.every((q, f) => q === f)) return { error: 'table word does not solve the facelets' };
    const V = X.loadState(shape, n, st), cf = H.config(n, shape), b0 = cf.bond; let ok = true; const tv = Date.now();
    try { cf.bond = false; for (let i = 0; i < plan.length && ok; i++) { if (!H.apply(V, { p: plan[i].p, a: plan[i].a })) ok = false; if (i === 40 && (Date.now() - tv) / 40 * plan.length > 8000) { ok = null; break; } } if (ok) ok = H.isSolved(V); } finally { cf.bond = b0; }
    if (ok === false) return { error: 'replay not solved' };
    return { plan: plan, sigs: sigs, ms: Date.now() - t0, pre: pre2.length, base: T.base.length, d: model.d };
  }
})();
