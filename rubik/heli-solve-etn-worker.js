// Web Worker of the edge-turning cube solver for the sizes the old tables (heli-solve-edge.js) do not cover: little chop family (cube ET), clover and curvy copter of every size that has a table.
// Model = the facelet permutation group of heli-solve-star-core.js (a turn the engine allows from the solved state is a permutation of the sticker slots); the table of a puzzle (heli-solve-etn-data.js,
// made offline by a C++ Minkwitz-style chain builder) gives, level after level, a short word that brings the next facelet home without disturbing the earlier ones.
// The model is built with the bond rule switched off (about 100 times faster, the rule never refuses a lattice half turn); jumbled states (70.53 degree turns) are undone first on the real engine.
self.window = self;
importScripts('engine.js', 'puzzles.js', 'heli-core.js', 'heli-solve-star-core.js', 'heli-solve-etn-data.js', 'heli-solve-edge.js', 'heli-solve-fisher-data.js');
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
  function solve(shape, n, st) {
    loadData(shape, n);
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
