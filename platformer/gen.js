// Shape World - procedural level generator, world map, bonus rooms and the completability validator.
(function (root) {
'use strict';
var TS = PF.TS, ROWS = PF.ROWS, T = PF.T, IN = PF.IN, P = PF.P, E = PF.E, MV_PERIOD = PF.MV_PERIOD;
var step = PF.step, newState = PF.newState, clone = PF.clone, rng = PF.rng, hash = PF.hash;

// ------------------------------------------------------------------ macros (shared by the validator, the probe and the tests)
function runSeq(st, seq) { for (var i = 0; i < seq.length; i++) step(st, seq[i]); }
function jumpPhase(st, seq, hold, air) {
  for (var k = 0; k < 160; k++) { var inp = (k < hold ? IN.J : 0) | air; step(st, inp); seq.push(inp); if (st.p.dead || st.p.won) return; if (st.p.ground && k >= 1) return; }
}
function fallPhase(st, seq, air) { for (var k = 0; k < 140 && !st.p.ground; k++) { step(st, air); seq.push(air); if (st.p.dead || st.p.won) return; } }
function macroEdge(st, run, hold, air) {
  var seq = [], inp = IN.R | (run ? IN.RUN : 0);
  for (var i = 0; i < 240; i++) { step(st, inp); seq.push(inp); if (st.p.dead || st.p.won) return seq; if (!st.p.ground) break; if (i > 6 && st.p.vx === 0) return null; }
  if (st.p.ground) return null;
  jumpPhase(st, seq, hold, air); return seq;
}
function macroWalk(st, inp, n) {
  var seq = [];
  for (var i = 0; i < n; i++) { step(st, inp); seq.push(inp); if (st.p.dead || st.p.won) return seq; }
  fallPhase(st, seq, inp); return seq;
}
function macroJump(st, hold, air, pre, preInp) {
  var seq = [];
  for (var i = 0; i < pre; i++) { step(st, preInp); seq.push(preInp); if (st.p.dead || st.p.won) return seq; }
  jumpPhase(st, seq, hold, air); return seq;
}

function heapPush(h, it) { h.push(it); var i = h.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (h[p].h <= h[i].h) break; var t = h[p]; h[p] = h[i]; h[i] = t; i = p; } }
function heapPop(h) { var top = h[0], last = h.pop(); if (h.length) { h[0] = last; var i = 0, n = h.length; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < n && h[l].h < h[m].h) m = l; if (r < n && h[r].h < h[m].h) m = r; if (m === i) break; var t = h[m]; h[m] = h[i]; h[i] = t; i = m; } } return top; }
var AIRS = [0, IN.R, IN.R | IN.RUN, IN.L], HOLDS = [3, 10, 99];
// best-first macro search on the real simulation from state st0 until pred(state) holds; returns { st, seq } or null
function searchStage(st0, pred, tx, ty, maxNodes) {
  if (pred(st0)) return { st: st0, seq: [], nodes: 0 };
  var seen = new Set(), heap = [], nodes = 0;
  function key(st) { var p = st.p, a = Math.abs(p.vx), sc = (p.vx < -0.3 ? -1 : 1) * (a < 0.3 ? 0 : a < 1.8 ? 1 : 2) + 2, ph = (p.mv >= 0 || st.sw) ? Math.floor((st.f % MV_PERIOD) / 20) + 1 : 0; return ((((Math.round(p.x / 3) * 256 + Math.round(p.y)) * 5 + sc) * 80 + ph) * 64 + (st.kb & 7) * 8 + (st.sb & 7)) * 40 + Math.min(39, st.mod.size); }
  function hval(st) { var p = st.p; return Math.abs(p.x + 6 - tx) + (ty === null ? 0 : 1.5 * Math.abs(p.y + 7 - ty)); }
  var root = { st: st0, par: null, seq: [], h: hval(st0) }; seen.add(key(st0)); heapPush(heap, root);
  function path(nd, extra) { var parts = [extra]; while (nd) { parts.push(nd.seq); nd = nd.par; } var out = []; for (var i = parts.length - 1; i >= 0; i--) for (var j = 0; j < parts[i].length; j++) out.push(parts[i][j]); return out; }
  while (heap.length && nodes < maxNodes) {
    var nd = heapPop(heap); nodes++;
    var found = null, tryMacro = function (fn) {
      if (found) return; var s = clone(nd.st), seq = fn(s); if (!seq || s.p.dead) return;
      if (pred(s)) { found = { st: s, seq: path(nd, seq), nodes: nodes }; return; }
      if (!s.p.ground) return;
      var k = key(s); if (seen.has(k)) return; seen.add(k); heapPush(heap, { st: s, par: nd, seq: seq, h: hval(s) });
    };
    var mi, walks = [[IN.R, 8], [IN.R | IN.RUN, 8], [IN.L, 8], [IN.L | IN.RUN, 8], [0, 20], [IN.R | IN.RUN, 3]];
    for (mi = 0; mi < walks.length; mi++) tryMacro(function (s) { return macroWalk(s, walks[mi][0], walks[mi][1]); });
    for (var hi = 0; hi < 3; hi++) for (var ai = 0; ai < 4; ai++) {
      tryMacro(function (s) { return macroJump(s, HOLDS[hi], AIRS[ai], 0, 0); });
      if (ai === 1 || ai === 2) tryMacro(function (s) { return macroEdge(s, ai === 2, HOLDS[hi], AIRS[ai]); });
    }
    if (found) return found;
  }
  return null;
}
function validate(L, maxNodes) {
  var multi = L.route && L.route.length > 1; maxNodes = maxNodes || (multi ? 9000 : 4000);
  var st = newState(L, { noEn: true }), seq0 = [0, 0, 0]; runSeq(st, seq0);
  if (!st.p.ground) return { ok: false, why: 'start' };
  var route = L.route || [{ k: 'goal', x: L.goalX, y: null }], script = seq0.slice(), total = 0;
  for (var i = 0; i < route.length; i++) {
    var g = route[i], ty = g.y === undefined ? null : g.y, tx = g.x === undefined ? L.goalX : g.x;
    var res = searchStage(st, function (s) { return PF.stageDone(s, g); }, tx, ty, maxNodes);
    if (!res) return { ok: false, why: 'stage' + i + ':' + g.k, nodes: total };
    total += res.nodes; st = res.st; for (var j = 0; j < res.seq.length; j++) script.push(res.seq[j]);
  }
  return { ok: !!st.p.won, script: script, nodes: total, why: st.p.won ? '' : 'nowin' };
}

// ------------------------------------------------------------------ physics probe
var LIM = null;
function probe() {
  if (LIM) return LIM;
  function flatLevel(gapW, wallH) {
    var w = 44, tiles = new Uint8Array(w * ROWS), g = 10;
    for (var c = 0; c < w; c++) { var gt = g; if (gapW && c >= 10 && c < 10 + gapW) gt = ROWS; if (wallH && c >= 22 && c < 24) gt = g - wallH; for (var r = gt; r < ROWS; r++) tiles[c * ROWS + r] = 1; }
    return { w: w, tiles: tiles, coins: [], enemies: [], movers: [], goalX: 99999, poleY: 0, time: 999, start: { x: 40, y: g * TS - P.SH }, cp: { x: 99999, y: 0 }, g: g };
  }
  function ok(L, fn, gw) { var s = newState(L, { noEn: true }); runSeq(s, [0, 0, 0]); var seq = fn(s); return !!seq && !s.p.dead && s.p.ground && s.p.x > (10 + gw) * TS; }
  var gapRun = 0, gapWalk = 0, up = 0, gw, h;
  for (gw = 1; gw <= 9; gw++) { var L1 = flatLevel(gw, 0);
    if (ok(L1, function (s) { return macroEdge(s, true, 99, IN.R | IN.RUN); }, gw)) gapRun = gw;
    if (ok(L1, function (s) { return macroEdge(s, false, 99, IN.R); }, gw)) gapWalk = gw; }
  for (h = 1; h <= 7; h++) { var L2 = flatLevel(0, h), good = false;
    for (var pre = 0; pre < 260 && !good; pre += 2) for (var run = 0; run < 2 && !good; run++) {
      var s = newState(L2, { noEn: true }); runSeq(s, [0, 0, 0]);
      var inp = IN.R | (run ? IN.RUN : 0); macroJump(s, 99, inp, pre, inp);
      if (!s.p.dead && s.p.ground && s.p.x > 22 * TS && s.p.y < (L2.g - h) * TS) good = true; }
    if (good) up = h; }
  LIM = { gapRun: gapRun, gapWalk: gapWalk, up: up };
  return LIM;
}

// ------------------------------------------------------------------ worlds
var KIND_NAMES = { cannon: ['대포', 'Cannon'], plain: ['초원', 'Meadow'], hills: ['언덕', 'Hills'], flood: ['물가', 'Lagoon'], ghost: ['유령의 숲', 'Haunted Grove'], sky: ['하늘길', 'Sky Path'], cave: ['동굴', 'Cavern'], castle: ['성채', 'Fortress'], maze: ['미궁', 'Labyrinth'], room: ['비밀방', 'Bonus Room'], bonus: ['별길', 'Star Road'] };
function worldKinds(seed, w) {
  var r = rng(hash(seed, w, 4242)), pool = ['hills', 'flood', 'ghost', 'sky', 'cave'], out = [w === 0 ? 'plain' : (r() < 0.5 ? 'plain' : 'hills')];
  if (w === 0) pool = ['hills', 'flood', 'ghost', 'sky', 'cave'];
  else pool = pool.filter(function (k) { return k !== out[0]; }).concat(out[0] === 'plain' ? [] : ['plain']);
  for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  for (i = 0; i < 3; i++) out.push(pool[i]);
  var mp = w === 0 ? 3 : 1 + Math.floor(r() * 3); out[mp] = 'maze';
  out.push('castle'); return out;
}
function kindOf(seed, n) { if (n >= 1000) return 'bonus'; var w = Math.floor((n - 1) / 5); return worldKinds(seed, w)[(n - 1) % 5]; }
// the overworld map: five level nodes joined by a winding path (+ one hidden bonus node that a secret exit opens)
// world map of one world: 4 levels, then an ending node (a fortress with a boss, or a cannon). Some levels have a secret exit that opens a branch: an alternate chain ending in the OTHER ending, or a bonus level.
// the main ending is always reachable without any secret exit.
function worldMap(seed, wid, depth, mainEnd) {
  depth = depth || 0; mainEnd = mainEnd || 'castle';
  var r = rng(hash(seed, wid, 777)), kinds = worldKinds(seed, wid), nodes = [], edges = [], x = 36, y = 120 + (r() - 0.5) * 40, i;
  for (i = 0; i < 4; i++) { nodes.push({ i: i, n: depth * 5 + i + 1, kind: kinds[i], x: Math.round(x), y: Math.round(y), main: true }); x += 62 + r() * 12; y = Math.max(70, Math.min(160, y + (r() - 0.5) * 80)); }
  var mainId = mainEnd === 'castle' ? 4 : 9, altId = mainEnd === 'castle' ? 9 : 4, endY = Math.max(70, Math.min(160, y));
  var mk = function (id, yy, main) { return { i: id, n: id === 4 ? depth * 5 + 5 : depth * 5 + 4, kind: id === 4 ? 'castle' : 'cannon', x: Math.round(x), y: Math.round(yy), main: main, ending: id === 4 ? 'castle' : 'cannon' }; };
  nodes.push(mk(mainId, endY, true)); for (i = 0; i < 3; i++) edges.push({ a: i, b: i + 1, secret: false }); edges.push({ a: 3, b: mainId, secret: false });
  var cand = [1, 2, 3].filter(function (k) { return kinds[k] !== 'maze'; });
  for (i = cand.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
  var nb = Math.min(cand.length, 1 + (depth >= 1 && r() < 0.5 ? 1 : 0)), picked = cand.slice(0, nb).sort(), bn = 0;
  picked.forEach(function (s, k) {
    var m = nodes[s]; m.secret = true; var up = m.y > 115 ? -1 : 1, base = 10 + k * 3;
    if (k === 0) {   // alternate route: one or two bonus levels, then the other ending
      var a1 = { i: base, n: 1000 + wid * 10 + bn++, kind: 'bonus', x: m.x + 28, y: Math.round(m.y + up * 50), main: false }; nodes.push(a1); edges.push({ a: s, b: base, secret: true });
      var prev = base; if (r() < 0.5) { var a2 = { i: base + 1, n: 1000 + wid * 10 + bn++, kind: 'bonus', x: m.x + 66, y: Math.round(m.y + up * 56), main: false }; nodes.push(a2); edges.push({ a: base, b: base + 1, secret: false }); prev = base + 1; }
      var alt = mk(altId, Math.max(50, Math.min(180, endY + (endY > 115 ? -60 : 60))), false); alt.x = Math.round(x + 4); nodes.push(alt); edges.push({ a: prev, b: altId, secret: false });
    } else {          // a single bonus level (dead end, 1-up)
      var b1 = { i: base, n: 1000 + wid * 10 + bn++, kind: 'bonus', x: m.x + 22, y: Math.round(m.y + up * 50), main: false }; nodes.push(b1); edges.push({ a: s, b: base, secret: true });
    }
  });
  return { wid: wid, depth: depth, mainEnd: mainEnd, endMain: mainId, endAlt: nodes.some(function (q) { return q.i === altId; }) ? altId : -1, kinds: kinds, nodes: nodes, edges: edges };
}
// the super map: a DAG of worlds. every world has a castle exit and a cannon exit leading to (possibly different) worlds of the next depth; the last depth holds the end worlds
function superMap(seed) {
  var r = rng(hash(seed, 0, 909)), D = 4, layers = [[0]], worlds = [{ id: 0, depth: 0 }], id = 1, d, k;
  for (d = 1; d < D; d++) { var cnt = d === 1 ? 2 : (d === 2 ? (r() < 0.5 ? 2 : 3) : (r() < 0.5 ? 2 : 3)); layers.push([]); for (k = 0; k < cnt; k++) { worlds.push({ id: id, depth: d }); layers[d].push(id++); } }
  worlds.forEach(function (w) { w.mainEnd = r() < 0.72 ? 'castle' : 'cannon'; });
  for (d = 0; d < D - 1; d++) {
    var nxt = layers[d + 1], covered = {};
    layers[d].forEach(function (wid, idx) {
      var w = worlds[wid], mt = nxt[(idx + Math.floor(r() * nxt.length)) % nxt.length], at = nxt[Math.floor(r() * nxt.length)];
      if (nxt.length > 1 && at === mt) at = nxt[(nxt.indexOf(mt) + 1) % nxt.length];
      w.next = {}; w.next[w.mainEnd] = mt; w.next[w.mainEnd === 'castle' ? 'cannon' : 'castle'] = at; covered[mt] = covered[at] = 1;
    });
    nxt.forEach(function (nid, q) { if (!covered[nid]) { var w2 = worlds[layers[d][q % layers[d].length]]; var alt = w2.mainEnd === 'castle' ? 'cannon' : 'castle'; w2.next[alt] = nid; } });
  }
  worlds.forEach(function (w) { w.x = 48 + w.depth * 104; var L = layers[w.depth], k2 = L.indexOf(w.id); w.y = Math.round(112 + (k2 - (L.length - 1) / 2) * 62); w.end = w.depth === D - 1; });
  return { worlds: worlds, layers: layers, depth: D };
}
// graph checks used by the test page: every world map and the super map must be well formed
function validateWorldMap(m) {
  var ids = {}, out = { ok: true, why: '' }, i; m.nodes.forEach(function (q) { ids[q.i] = q; });
  var adj = {}; m.edges.forEach(function (e) { (adj[e.a] = adj[e.a] || []).push(e); });
  function reach(allowSecret) { var seen = { 0: 1 }, st = [0]; while (st.length) { var a = st.pop(); (adj[a] || []).forEach(function (e) { if (e.secret && !allowSecret) return; if (!seen[e.b]) { seen[e.b] = 1; st.push(e.b); } }); } return seen; }
  var all = reach(true), plain = reach(false);
  m.nodes.forEach(function (q) { if (!all[q.i]) { out.ok = false; out.why = 'unreachable ' + q.i; } });
  if (!plain[m.endMain]) { out.ok = false; out.why = 'main ending needs secrets'; }
  var branch = m.edges.filter(function (e) { return e.secret; }).length; if (branch < 1 || branch > 2) { out.ok = false; out.why = 'branch points ' + branch; }
  // no cycles: all edges go to nodes that are "later" (higher x) or ending nodes
  m.edges.forEach(function (e) { if (ids[e.b].x < ids[e.a].x - 1) { out.ok = false; out.why = 'backward edge'; } });
  // every node except the endings and bonus dead ends has an outgoing edge
  m.nodes.forEach(function (q) { if (!(adj[q.i] || []).length && !q.ending && q.kind !== 'bonus') { out.ok = false; out.why = 'dead end ' + q.i; } });
  out.branches = branch; out.hasAlt = m.endAlt >= 0; return out;
}
function validateSuper(sm) {
  var out = { ok: true, why: '' }, reach = { 0: 1 }, st = [0], mainReach = { 0: 1 }, ms = [0];
  while (st.length) { var a = st.pop(), w = sm.worlds[a]; if (w.next) Object.keys(w.next).forEach(function (k) { if (!reach[w.next[k]]) { reach[w.next[k]] = 1; st.push(w.next[k]); } }); }
  while (ms.length) { var a2 = ms.pop(), w2 = sm.worlds[a2]; if (w2.next) { var t = w2.next[w2.mainEnd]; if (!mainReach[t]) { mainReach[t] = 1; ms.push(t); } } }
  sm.worlds.forEach(function (w) { if (!reach[w.id]) { out.ok = false; out.why = 'world unreachable ' + w.id; } });
  var ends = sm.worlds.filter(function (w) { return w.end; }); if (!ends.some(function (w) { return mainReach[w.id]; })) { out.ok = false; out.why = 'no end via main routes'; }
  sm.worlds.forEach(function (w) { if (!w.end && (!w.next || w.next.castle === undefined || w.next.cannon === undefined)) { out.ok = false; out.why = 'missing exit ' + w.id; } if (w.next) Object.keys(w.next).forEach(function (k) { if (sm.worlds[w.next[k]].depth !== w.depth + 1) { out.ok = false; out.why = 'bad depth'; } }); });
  out.worlds = sm.worlds.length; out.ends = ends.length; out.forks = sm.worlds.filter(function (w) { return w.next && w.next.castle !== w.next.cannon; }).length; return out;
}

// ------------------------------------------------------------------ level builder
function build(seed, n, a, o) {
  o = o || {};
  if ((o.kind || kindOf(seed, n)) === 'maze' && !o.room) return buildMaze(seed, n, a);
  var wantSecret = !!o.secret, kindAsked = o.kind || kindOf(seed, n);
  var lim = probe(), r = rng(hash(seed, n, a * 7919 + 1)), kind = o.kind || kindOf(seed, n), room = !!o.room, isCannon = kind === 'cannon'; if (isCannon) kind = 'sky';
  var diff = Math.min(1, (n >= 1000 ? 8 : n - 1) / 18); if (kind === 'bonus') diff = Math.min(1, 0.4 + 0.5 * diff); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3; if (a >= 8) diff = 0;
  var castle = kind === 'castle';
  var W = room ? 46 : isCannon ? 96 : castle ? Math.min(220, 90 + 6 * Math.min(n, 30)) : Math.min(300, 110 + 5 * Math.min(n, 38));
  var gt = [], flats = [], tl = [], movers = [], arcs = [], coinsX = [], specials = [], cannons = [], rings = [], enemiesX = [], winds = [], pockets = [], keysL = [], doorsL = [], switchesL = [], routeL = [], gl = [], gcount = 0, g = castle ? 11 : 12, cpCol = -1, needPow = true, spots = [], ringCount = 0;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  function flat(len, gg) { var c0 = gt.length; for (var i = 0; i < len; i++) gt.push(gg); return c0; }
  function pit(len) { var c0 = gt.length; for (var i = 0; i < len; i++) { gt.push(ROWS); if (castle) { tl.push([c0 + i, ROWS - 2, T.LAVA]); tl.push([c0 + i, ROWS - 1, T.LAVA]); } } return c0; }
  function runway() { var k = 0, i = gt.length - 1; while (i >= 0 && gt[i] === gt[gt.length - 1] && gt[i] < ROWS) { k++; i--; } return k; }
  var gapMax = Math.max(2, Math.min(lim.gapRun - 1, Math.round(2 + diff * (lim.gapRun - 2.5))));
  var upMax = Math.max(1, Math.min(2, lim.up - 2));
  function ph1() { return r(); }
  // a basin is dug BELOW the ledge row gTop: solid floor, the neighbouring ledge columns are its side walls, exit steps rise to the far ledge; water fills exactly up to the ledge level
  function basin(gTop, D, inner) {
    var c0 = gt.length, f = gTop + D, i2, q, s;
    for (i2 = 0; i2 < inner; i2++) gt.push(f);
    for (s = 1; s <= D - 1; s++) { gt.push(f - s); gt.push(f - s); }
    var end = gt.length;
    for (var c = c0; c < end; c++) for (q = gTop; q < gt[c]; q++) tl.push([c, q, T.WATER]);
    return { c0: c0, inner: inner, f: f, end: end };
  }
  function waterLife(c0, inner, gg, D, pill) {
    var ns = 1 + Math.floor(diff * 2.5 + r()), i, lo = c0 + 3, span = Math.max(1, inner - 6);
    for (i = 0; i < ns; i++) { var big = r() < 0.35, cxs = (lo + r() * span) * TS, yy = (gg + 0.4 + r() * 0.5) * TS;
      enemiesX.push({ t: E.SWIM, sz: big ? 1 : 0, x: cxs, y: yy, w: big ? 22 : 12, h: big ? 12 : 8, ax: cxs, ay: yy, rg: 18 + r() * 22, sp: 1 / (170 + r() * 120), ph: r(), am: 3 + r() * 3, spd: 0 }); }
    if (diff > 0.25 && r() < 0.7) { var cx2 = (c0 + inner * (0.3 + 0.4 * r())) * TS, cy2 = (gg + 1.1) * TS; enemiesX.push({ t: E.CHASER, x: cx2, y: cy2, w: 12, h: 10, ax: cx2, ay: cy2, spd: 0, dir: 1 }); }
    if (diff > 0.2 && r() < 0.6) { var cx3 = (lo + 2 + r() * Math.max(1, span - 4)) * TS, cy3 = (gg + 0.9) * TS; enemiesX.push({ t: E.FMINE, x: cx3, y: cy3, w: 14, h: 14, ax: cx3, ay: cy3, am: 8, ph: r(), spd: 0 }); }
    if (diff > 0.3 && r() < 0.55) { var cx4 = (lo + 2 + r() * Math.max(1, span - 4)) * TS, cy4 = (gg + 0.2) * TS; enemiesX.push({ t: E.JELLY, x: cx4, y: cy4, w: 16, h: 18, ax: cx4, ay: cy4, ph: r(), spd: 0 }); }
    if (diff > 0.35 && r() < 0.45 && inner >= 16) { var cx5 = (c0 + inner / 2 - 1) * TS, cy5 = (gg + 0.6) * TS; enemiesX.push({ t: E.WHALE, x: cx5, y: cy5, w: 44, h: 20, ax: cx5, ay: cy5, rg: Math.min(60, (inner / 2 - 5) * TS), sp: 1 / 420, ph: r(), spd: 0, dir: 1 }); }
    if (r() < 0.6) { var cc = lo + Math.floor(r() * span); if (pill && pill[cc]) cc = -1; if (cc >= 0) enemiesX.push({ t: E.CLAM, x: cc * TS, y: (gg + D) * TS - 12, w: 16, h: 12, ax: cc * TS, pho: Math.floor(r() * 180), spd: 0, noPillar: cc }); }
  }
  function airFeature(cc, ln, gg, over) {
    var opts = [], mid = (cc + ln / 2) * TS;
    if (diff > 0.05 || kind === 'sky') opts.push('swoop'); opts.push('bird'); if (ln >= 8) opts.push('flock'); if (diff > 0.2 || kind === 'sky') opts.push('balloon'); if (diff > 0.25) opts.push('shooter'); if (diff > 0.3 && !over) opts.push('spark');
    var k = opts[Math.floor(r() * opts.length)];
    if (k === 'swoop') enemiesX.push({ t: E.SWOOP, x: mid, y: (gg - 6) * TS, w: 14, h: 10, ax: mid, ay: (gg - 6) * TS, ph: r(), spd: 0, dir: 1 });
    else if (k === 'bird') enemiesX.push({ t: E.BIRD, x: mid, y: (gg - 5) * TS, w: 14, h: 10, ax: mid, ay: (gg - 5) * TS, rg: 40 + r() * 20, sp: 1 / (240 + r() * 100), ph: r(), am: 10, carry: 1, spd: 0 });
    else if (k === 'flock') { var offs = [[0, 0], [-9, 6], [9, 6], [-18, 12], [18, 12]], rg2 = Math.max(30, ln * TS / 2 - 24), fph = r(); for (var m = 0; m < 5; m++) enemiesX.push({ t: E.FLOCK, x: mid + offs[m][0], y: (gg - 5) * TS + offs[m][1], w: 10, h: 8, ax: mid, by: (gg - 5) * TS, ox: offs[m][0], oy: offs[m][1], idx: m, rg: rg2, sp: 1 / 340, ph: fph, spd: 0, dir: 1 }); }
    else if (k === 'balloon') enemiesX.push({ t: E.BALLOON, x: mid, y: (gg - 5) * TS, w: 16, h: 18, ax: mid, ay: (gg - 5.5) * TS, ph: r(), spd: 0 });
    else if (k === 'shooter') enemiesX.push({ t: E.SHOOTER, x: mid, y: (gg - 6.5) * TS, w: 16, h: 14, ax: mid, ay: (gg - 6.5) * TS, ph: r(), pho: Math.floor(r() * 130), spd: 0, dir: -1 });
    else { var vert = r() < 0.4, x0 = (cc + 2) * TS, x1 = (cc + ln - 2) * TS; if (vert) { x0 = x1 = mid; } enemiesX.push({ t: E.SPARK, x: x0, y: (gg - 3) * TS, w: 10, h: 10, ax: x0, x0: x0, x1: x1, y0: vert ? (gg - 8) * TS : (gg - 3) * TS, y1: vert ? (gg - 1.5) * TS : (gg - 3) * TS, sp: 1 / 230, ph: r(), spd: 0 }); }
  }
  flat(10, g);
  // chunk weights per level kind
  function weights() {
    var d = diff, w = { flat: 3, gap: 1.5 + 2 * d, stairs: 1.2, hurdle: 1.5 + d, spikes: n >= 2 ? 0.5 + 1.5 * d : 0, islands: n >= 2 ? 0.5 + d : 0, mover: n >= 3 ? 0.4 + 1.2 * d : 0, vmover: 0, orbit: 0, falling: 0, hills: n >= 2 ? 1.4 : 0, flood: 0, conv: 0, cannon: n >= 4 ? 0.3 + 0.6 * d : 0, plant: n >= 3 ? 0.3 + 0.6 * d : 0, crush: 0, ghost: 0, spring: 0.25, vine: 0.25, psw: 0.3, ring: 0.3, wind: n >= 4 ? 0.25 : 0, updraft: n >= 4 ? 0.2 : 0, cloud: n >= 4 ? 0.25 : 0, keydoor: n >= 5 ? 0.2 : 0, sgate: n >= 5 ? 0.15 : 0 };
    if (n >= 3 && kind !== 'flood') w.flood = 0.3;
    if (kind === 'hills') { w.hills = 4; w.flat = 2; }
    if (kind === 'flood') { w.flood = 4; w.hills = 0.6; w.gap = 1; w.wind = 0; w.updraft = 0; w.cloud = 0; }
    if (kind === 'ghost') { w.ghost = 2.2; w.islands += 0.7; w.spikes += 0.6; w.cannon = 0; w.ring = 0.5; }
    if (kind === 'sky') { w.flat = 1; w.gap = 3; w.islands = 2.5; w.mover = 1.2; w.vmover = 1.2; w.orbit = 1.5; w.falling = 1.5; w.stairs = 0.5; w.hurdle = 0.3; w.spring = 0.6; w.cannon = 0.4; w.wind = 1.3; w.updraft = 1.0; w.cloud = 1.6; w.flood = 0; }
    if (kind === 'cave') { w.conv = 3; w.cannon = 0.8; w.plant = 0.5; w.hills = 0.8; }
    if (castle) { w.keydoor = 1.0; w.sgate = 0.8; w.cloud = 0.3; w.wind = 0; w.updraft = 0; w.flood = 0; w.gap = 2.5; w.crush = 2 + d; w.cannon = 1.2; w.conv = 1; w.orbit = 0.8; w.falling = 0.6; w.mover = 0.6; w.islands = 0.6; w.plant = 0.6; w.spring = 0; w.vine = 0; w.psw = 0; w.ring = 0; }
    if (kind === 'bonus') { w.spring = 0.8; w.ring = 0; }
    if (o.only) { for (var kk in w) w[kk] = (kk === 'flat' ? 2 : kk === o.only ? 4 : 0); }
    if (room) { for (var k in w) w[k] = 0; w.flat = 3; w.gap = 1; w.hurdle = 1; w.islands = 0.6; w.stairs = 0.5; }
    return w;
  }
  var names = ['flat', 'gap', 'stairs', 'hurdle', 'spikes', 'islands', 'mover', 'vmover', 'orbit', 'falling', 'hills', 'flood', 'conv', 'cannon', 'plant', 'crush', 'ghost', 'spring', 'vine', 'psw', 'ring', 'wind', 'updraft', 'cloud', 'keydoor', 'sgate'];
  var guard = 0, endReserve = castle ? 40 : 26;
  while (gt.length < W - endReserve && guard++ < 500) {
    if (cpCol < 0 && gt.length >= W / 2) { var cb = flat(7, g); cpCol = cb + 3; continue; }
    var wts = weights(), tot = 0, i; for (i = 0; i < names.length; i++) tot += wts[names[i]];
    var x = r() * tot, k = 0; while (k < names.length - 1 && x >= wts[names[k]]) { x -= wts[names[k]]; k++; }
    var ck = names[k];
    if (wantSecret && ringCount === 0 && gt.length >= W * 0.25 && !castle) ck = 'ring';
    if (runway() < 3) flat(3 - runway(), g);
    var c0, len, gw, dg, i2, q;
    if (ck === 'flat') { len = rnd(6, 13); c0 = flat(len, g); flats.push({ c: c0, len: len, g: g }); }
    else if (ck === 'gap') {
      gw = rnd(2, gapMax); dg = [0, 0, 0, 1, -1][rnd(0, 4)]; if (dg < 0 && g + 1 > 12) dg = 0; if (dg > 0 && g - dg < 8) dg = 0; if (dg < 0 && gw > gapMax - 1) dg = 0;
      c0 = pit(gw); arcs.push({ c: c0, w: gw, g: g, ng: g - dg });
      g -= dg; len = rnd(4, 8); var c1 = flat(len, g); flats.push({ c: c1, len: len, g: g });
    }
    else if (ck === 'stairs') {
      var up = r() < 0.55, steps = rnd(2, 3); if (up && g - steps < 8) up = false; if (!up && g + steps > 12) up = true; if (up && g - steps < 8) steps = 1;
      for (i2 = 0; i2 < steps; i2++) { g += up ? -1 : 1; flat(2, g); } flat(3, g);
    }
    else if (ck === 'hurdle') { var hh = rnd(1, Math.min(3, lim.up - 1)), ww = rnd(1, 2); if (g - hh < 6) continue; flat(ww, g - hh); }
    else if (ck === 'spikes') { var sw = rnd(1, diff > 0.5 ? 3 : 2); c0 = flat(sw, g); for (i2 = 0; i2 < sw; i2++) tl.push([c0 + i2, g - 1, T.SPIKE]); }
    else if (ck === 'islands') {
      var cnt = rnd(2, 4), ri = g;
      for (i2 = 0; i2 < cnt; i2++) {
        var gp = rnd(2, Math.max(2, gapMax - 1)), d = [0, 0, -1, 1][rnd(0, 3)]; if (ri - d < 8 || ri - d > 12) d = 0; if (d < 0) gp = Math.min(gp, Math.max(2, gapMax - 2));
        pit(gp); ri -= d; var iw = rnd(2, 3), ic = pit(iw);
        for (q = 0; q < iw; q++) { tl.push([ic + q, ri, T.SOLID]); spots.push({ x: (ic + q) * TS + 8, y: (ri - 1) * TS + 4 }); }
      }
      pit(rnd(2, Math.max(2, gapMax - 1))); g = ri; len = rnd(4, 7); var c3 = flat(len, g); flats.push({ c: c3, len: len, g: g });
    }
    else if (ck === 'mover' || ck === 'vmover') {
      var pw = ck === 'mover' ? rnd(Math.max(lim.gapRun + 1, 6), Math.max(lim.gapRun + 1, 6) + 3) : 7; c0 = pit(pw);
      if (ck === 'mover') movers.push({ kind: 0, cx: (c0 + pw / 2) * TS, y: g * TS, w: 48, amp: pw * TS / 2, per: [240, 360, 480][rnd(0, 2)], ph: 0 });
      else movers.push({ kind: 1, cx: (c0 + pw / 2) * TS, y: g * TS, w: 48, amp: 22, per: [240, 360][rnd(0, 1)], ph: 0 });
      len = rnd(4, 7); var c4 = flat(len, g); flats.push({ c: c4, len: len, g: g });
    }
    else if (ck === 'orbit') {
      var ow = 9; c0 = pit(ow); for (i2 = 0; i2 < 2; i2++) movers.push({ kind: 2, cx: (c0 + ow * (i2 + 1) / 3) * TS, y: g * TS - 6, w: 36, amp: 18 + r() * 8, per: 300, ph: i2 * Math.PI });
      len = rnd(4, 7); var c5 = flat(len, g); flats.push({ c: c5, len: len, g: g });
    }
    else if (ck === 'falling') {
      var fw = 8; c0 = pit(fw); for (i2 = 0; i2 < 3; i2++) movers.push({ kind: 3, cx: (c0 + fw * (i2 + 0.5) / 3) * TS, y: g * TS, w: 32, amp: 0, per: 300, ph: 0 });
      len = rnd(4, 7); var c6 = flat(len, g); flats.push({ c: c6, len: len, g: g });
    }
    else if (ck === 'hills') {
      var hk = rnd(2, 3); if (g - hk < 6) continue; flat(1, g);
      for (i2 = 0; i2 < hk; i2++) { var cc = flat(1, g - i2); tl.push([cc, g - i2 - 1, T.SLR]); }
      var pl = rnd(2, 4), pc = flat(pl, g - hk); for (q = 0; q < pl; q++) if (r() < 0.6) coinsX.push({ x: (pc + q) * TS + 8, y: (g - hk - 1) * TS + 4 });
      for (i2 = 0; i2 < hk; i2++) { var cd = flat(1, g - hk + i2 + 1); tl.push([cd, g - hk + i2, T.SLL]); }
      flat(3, g);
    }
    else if (ck === 'flood') {
      while (g > 9) { g--; flat(2, g); } flat(3, g);
      var D = Math.min(4, 13 - g), inner = rnd(12, 18), bs = basin(g, D, inner), f = bs.f, wdn = D;
      var px = bs.c0 + 3, pill = {}; while (px < bs.c0 + inner - 3) { var ph2 = rnd(1, Math.max(1, D - 2)); if (r() < 0.7) { for (q = 1; q <= ph2; q++) tl.push([px, f - q, T.SOLID]); pill[px] = 1; } else { tl.push([px, f - 1, T.SPIKE]); pill[px] = 1; } px += rnd(4, 6); }
      for (i2 = 0; i2 < 4; i2++) coinsX.push({ x: (bs.c0 + 3 + i2 * (inner - 6) / 3) * TS + 8, y: (g + 1.5) * TS });
      if (r() < 0.55 && inner >= 14) { var cs0 = bs.c0 + rnd(3, inner - 9), csl = rnd(4, 6), ct = r() < 0.5 ? T.CURL : T.CURR; for (i2 = 0; i2 < csl; i2++) for (q = g; q < f; q++) if (!pill[cs0 + i2]) tl.push([cs0 + i2, q, ct]); }
      if (r() < 0.35 && inner >= 12) { var cu0 = bs.c0 + rnd(4, inner - 6); for (i2 = 0; i2 < 2; i2++) for (q = g; q < f; q++) if (!pill[cu0 + i2]) tl.push([cu0 + i2, q, T.CURU]); }
      for (var pc = bs.c0 + 4; pc < bs.c0 + inner - 2; pc += 7) if (!pill[pc]) pockets.push({ x: pc * TS + 8, y: (g + 1.5) * TS });
      if (!room) waterLife(bs.c0, inner, g, D, pill);
      flat(3, g);
    }
    else if (ck === 'conv') {
      len = rnd(8, 12); c0 = flat(len, g); var cdir = r() < 0.5 ? T.CONVL : T.CONVR; for (i2 = 0; i2 < len; i2++) tl.push([c0 + i2, g, cdir]);
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    else if (ck === 'cannon') {
      len = rnd(9, 13); c0 = flat(len, g); var cc2 = c0 + len - 3, dirc = -1; tl.push([cc2, g - 1, T.CANL]);
      cannons.push({ x: cc2 * TS, y: (g - 1) * TS, dir: dirc, per: 170 + rnd(0, 50), ph: rnd(0, 120) }); flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    else if (ck === 'plant') {
      len = rnd(7, 10); c0 = flat(len, g); var pc2 = c0 + rnd(3, len - 4); tl.push([pc2, g - 1, T.STUMP]);
      enemiesX.push({ t: E.PLANT, x: pc2 * TS + 2, y: (g - 1) * TS, y0: (g - 1) * TS, w: 12, h: 18, ph: rnd(0, 200), spd: 0 }); flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    else if (ck === 'crush') {
      len = rnd(9, 12); c0 = flat(len, g); enemiesX.push({ t: E.CRUSH, x: (c0 + len / 2) * TS - 12, y: (g - 7) * TS, y0: (g - 7) * TS, w: 24, h: 24, spd: 0 });
      if (len > 11) enemiesX.push({ t: E.CRUSH, x: (c0 + len - 3) * TS - 12, y: (g - 7) * TS, y0: (g - 7) * TS, w: 24, h: 24, spd: 0 });
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    else if (ck === 'ghost') {
      len = rnd(10, 14); c0 = flat(len, g); var ng = diff > 0.5 ? 2 : 1;
      for (i2 = 0; i2 < ng; i2++) enemiesX.push({ t: E.GHOST, x: (c0 + len * (i2 + 1) / (ng + 1)) * TS, y: (g - 4) * TS, w: 14, h: 14, spd: 0 });
      flats.push({ c: c0, len: len, g: g });
    }
    else if (ck === 'spring') {
      len = rnd(8, 10); c0 = flat(len, g); tl.push([c0 + 2, g - 1, T.SPRING]);
      for (q = 0; q < 3; q++) tl.push([c0 + 5 + q, g - 8, T.SOLID]); for (q = 0; q < 3; q++) spots.push({ x: (c0 + 5 + q) * TS + 8, y: (g - 9) * TS + 6 });
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    else if (ck === 'vine') {
      len = rnd(8, 10); c0 = flat(len, g); for (q = 1; q <= 7; q++) tl.push([c0 + 3, g - q, T.VINE]);
      for (q = 0; q < 4; q++) tl.push([c0 + 4 + q, g - 8, T.SOLID]); for (q = 0; q < 3; q++) spots.push({ x: (c0 + 4 + q) * TS + 8, y: (g - 9) * TS + 6 });
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    else if (ck === 'psw') {
      len = 11; c0 = flat(len, g); tl.push([c0 + 2, g - 4, T.PSW]); for (q = 0; q < 6; q++) tl.push([c0 + 4 + q, g - 4, T.BRICK]);
      for (q = 0; q < 6; q++) tl.push([c0 + 4 + q, g - 8, T.BRICK]);
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    else if (ck === 'ring') {
      len = 7; c0 = flat(len, g); var rc = c0 + 3, secret = (wantSecret && ringCount === 0 && !castle && !room); ringCount++;
      tl.push([rc, g - 1, T.RING]); tl.push([rc, g - 2, T.RING]); rings.push({ c: rc, secret: secret, room: secret ? 1 : 0, y: g * TS });
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    else if (ck === 'keydoor' || ck === 'sgate') {
      len = 12; c0 = flat(len, g); var wcn = gt.length; for (q = 0; q < 3; q++) tl.push([c0 + 2 + q, g - 3, T.SOLID]); for (q = 3; q < 6; q++) tl.push([c0 + 2 + q, g - 6, T.SOLID]);
      var kx = (c0 + 6) * TS + 8, ky = (g - 7) * TS + 8; gt.push(0); gt.push(0);
      if (ck === 'keydoor') { var kc = gcount++ % 3, di2 = doorsL.length; keysL.push({ x: kx, y: ky, c: kc }); doorsL.push({ c: wcn, r0: g - 3, r1: g - 1, g: kc }); for (q = 1; q <= 3; q++) { tl.push([wcn, g - q, T.DOOR]); gl.push([wcn, g - q, kc]); tl.push([wcn + 1, g - q, 0]); }
        routeL.push({ k: 'key', g: kc, x: kx, y: ky }); routeL.push({ k: 'door', i: di2, x: wcn * TS + 8, y: g * TS - 7 }); }
      else { var sb2 = gcount++ % 8, sc3 = Math.floor((kx) / TS), sr3 = g - 7; switchesL.push({ c: sc3, r: sr3, g: sb2 }); tl.push([sc3, sr3, T.SWITCH]); gl.push([sc3, sr3, sb2]); for (q = 1; q <= 3; q++) { tl.push([wcn, g - q, T.GATE]); gl.push([wcn, g - q, sb2]); tl.push([wcn + 1, g - q, 0]); }
        routeL.push({ k: 'sw', g: sb2, x: kx, y: ky }); }
      routeL.push({ k: 'xge', x: (wcn + 2) * TS, y: g * TS - 7 });
    }
    else if (ck === 'wind') {
      gw = rnd(2, gapMax); c0 = pit(gw); var wdx = (r() < 0.5 ? 1 : -1) * (0.05 + 0.04 * diff); winds.push({ x0: (c0 - 3) * TS, x1: (c0 + gw + 3) * TS, y0: (g - 9) * TS, y1: (g + 1) * TS, dx: wdx, dy: 0 });
      arcs.push({ c: c0, w: gw, g: g, ng: g }); len = rnd(5, 8); var c7 = flat(len, g); flats.push({ c: c7, len: len, g: g });
    }
    else if (ck === 'updraft') {
      gw = rnd(3, gapMax); c0 = pit(gw); winds.push({ x0: (c0 + gw / 2 - 1) * TS, x1: (c0 + gw / 2 + 1.2) * TS, y0: (g - 11) * TS, y1: (g + 1) * TS, dx: 0, dy: -0.85, up: 1 });
      for (q = 0; q < 4; q++) coinsX.push({ x: (c0 + gw / 2 + 0.1) * TS, y: (g - 3 - q * 1.7) * TS + 8 });
      arcs.push({ c: c0, w: gw, g: g, ng: g }); len = rnd(5, 8); var c8 = flat(len, g); flats.push({ c: c8, len: len, g: g });
    }
    else if (ck === 'cloud') {
      var cw = 9; c0 = pit(cw); var nc = 4; for (i2 = 0; i2 < nc; i2++) movers.push({ kind: 4, cx: (c0 + cw * (i2 + 0.5) / nc) * TS, y: g * TS - (i2 % 2) * 8, w: 30, amp: 0, per: 300 + (i2 % 2) * 60, ph: i2 * 1.7 });
      len = rnd(4, 7); var c9 = flat(len, g); flats.push({ c: c9, len: len, g: g });
    }
  }
  if (cpCol < 0) { cpCol = flat(7, g) + 3; }
  flat(4, g);
  var goalCol, poleCol, bossDef = null, arenaC0 = 0;
  if (castle && !room) {
    var bv = (n + hash(seed, n, 5)) % 5, bx;
    if (bv === 3) {   // flooded arena: a deep basin whose walls are the ledges, exit steps lead to the gate
      while (g > 9) { g--; flat(2, g); } flat(6, g);
      var ba = basin(g, 4, 22); arenaC0 = ba.c0; flat(5, g); bx = (arenaC0 + 14) * TS;
      bossDef = { t: E.BOSS, v: 3, x: bx, y: (g + 1.3) * TS, w: 30, h: 18, spd: 0, mn: (arenaC0 + 1) * TS, mx: (arenaC0 + 22) * TS, ax: (arenaC0 + 12) * TS, ay: (g + 1.3) * TS, dir: -1 };
      pockets.push({ x: (arenaC0 + 6) * TS, y: (g + 1.5) * TS }); pockets.push({ x: (arenaC0 + 16) * TS, y: (g + 1.5) * TS });
      poleCol = gt.length - 3; goalCol = poleCol;
    } else {
      flat(6, g); arenaC0 = flat(26, g); flat(3, g); bx = (arenaC0 + 16) * TS;
      bossDef = { t: E.BOSS, v: bv, x: bx, y: g * TS - 26, w: 28, h: 26, spd: 0, mn: (arenaC0 + 1) * TS, mx: (arenaC0 + 25) * TS, ax: (arenaC0 + 14) * TS, ay: (g - 4) * TS - 6, dir: -1 };
      if (bv === 4) { bossDef.w = 28; bossDef.h = 22; bossDef.ay = (g - 5) * TS; bossDef.y = bossDef.ay; }
      poleCol = arenaC0 + 24; goalCol = poleCol;
    }
  } else {
    for (var s2 = 0; s2 < 4; s2++) { g -= 1; flat(2, g); }
    poleCol = flat(4, g) + 1; flat(8, g);
  }
  W = gt.length;
  // ---- tiles
  var tiles = new Uint8Array(W * ROWS), c, rr, grpA = new Uint8Array(W * ROWS);
  for (c = 0; c < W; c++) for (rr = gt[c]; rr < ROWS; rr++) tiles[c * ROWS + rr] = T.SOLID;
  gl.forEach(function (e2) { if (e2[0] < W) grpA[e2[0] * ROWS + e2[1]] = e2[2]; });
  var put = function (cc, r2, t) { if (cc >= 0 && cc < W && r2 >= 0 && r2 < ROWS) tiles[cc * ROWS + r2] = t; };
  tl.forEach(function (e) { put(e[0], e[1], e[2]); });
  var coins = [], enemies = enemiesX.slice(), pushCoin = function (x, y, b) { coins.push({ x: x, y: y, b: b ? 1 : 0 }); };
  coinsX.forEach(function (c2) { pushCoin(c2.x, c2.y); });
  // ---- features on flat chunks
  var hasBeetle = n >= 3;
  flats.forEach(function (f, fi) {
    var mid = f.c + f.len / 2;
    if (!room && f.len >= 8 && !f.noEn && r() < 0.5) {   // block cluster
      var m = rnd(3, Math.min(5, f.len - 4)), bc = f.c + 2 + rnd(0, f.len - 4 - m);
      for (var j = 0; j < m; j++) { var t = r() < 0.5 ? T.BRICK : T.QC; if (needPow && j === (m >> 1)) { t = T.QP; needPow = false; } else if (r() < 0.08) t = T.QP; else if (r() < 0.03) t = T.QS; else if (r() < 0.02 && n >= 3) t = T.QM; put(bc + j, f.g - 4, t); }
      if (r() < 0.5) for (j = 0; j < m; j++) pushCoin((bc + j) * TS + 8, (f.g - 6) * TS + 8);
    } else if (r() < 0.5) { var cn = rnd(3, 5); for (var j2 = 0; j2 < cn; j2++) { var berry = n >= 3 && r() < 0.25; pushCoin((mid - cn / 2 + j2 + 0.5) * TS, (f.g - 2) * TS + 8 - Math.sin(Math.PI * (j2 + 0.5) / cn) * 12, berry); } }
    if (f.noEn || room) return;
    var ne = f.len >= 6 ? ((r() < 0.3 + 0.55 * diff ? 1 : 0) + (f.len >= 10 && r() < 0.8 * diff ? 1 : 0)) : 0;
    if (n === 1 && ne > 1) ne = 1;
    if (kind === 'ghost') ne = Math.min(ne, 1);
    for (var e = 0; e < ne; e++) {
      var ex = (f.c + 4 + (f.len - 8) * (ne === 1 ? r() : (e + r() * 0.6) / ne)) * TS, tr = r(), ty = E.WALKER;
      if (diff > 0.12 && tr < 0.22 * diff + 0.05) ty = E.FLYER; else if (diff > 0.08 && tr < 0.22 * diff + 0.05 + 0.3 * diff) ty = E.SPIKY; else if (hasBeetle && tr > 0.6) ty = E.BEETLE;
      if (ty === E.FLYER) enemies.push({ t: E.FLYER, x: ex, y: (f.g - 3) * TS, w: 14, h: 10, ax: ex, ay: (f.g - 3) * TS, rg: 30 + r() * 30, sp: 1 / (200 + r() * 160), ph: r(), am: 8 + r() * 6, spd: 0 });
      else if (ty === E.SPIKY) enemies.push({ t: E.SPIKY, x: ex, y: f.g * TS - 14, w: 14, h: 14, spd: 0.4 + 0.2 * diff, dir: r() < 0.5 ? -1 : 1, mn: (f.c + 1) * TS, mx: (f.c + f.len - 1) * TS });
      else if (ty === E.BEETLE) enemies.push({ t: E.BEETLE, x: ex, y: f.g * TS - 13, w: 12, h: 13, spd: 0.55, dir: r() < 0.5 ? -1 : 1, mn: (f.c + 1) * TS, mx: (f.c + f.len - 1) * TS });
      else enemies.push({ t: E.WALKER, x: ex, y: f.g * TS - 12, w: 12, h: 12, spd: 0.45 + 0.35 * diff * r(), dir: r() < 0.6 ? -1 : 1, mn: (f.c + 1) * TS, mx: (f.c + f.len - 1) * TS });
    }
  });
  var ex0 = enemiesX.length;
  if (!room) {
    var pa = kind === 'sky' ? 0.5 : (castle ? 0.1 : 0.06 + 0.3 * diff);
    flats.forEach(function (f, fi) { if (f.len >= 8 && !f.noEn && fi > 0 && r() < pa) airFeature(f.c, f.len, f.g, false); });
    arcs.forEach(function (a2) { if (a2.w >= 3 && r() < pa * 0.8) airFeature(a2.c - 1, a2.w + 2, a2.g, true); });
  }
  enemies = enemies.concat(enemiesX.slice(ex0));
  arcs.forEach(function (a2) {
    if (r() < 0.8) for (var j = 0; j < 5; j++) { var t = (j + 0.5) / 5; pushCoin((a2.c - 0.5 + (a2.w + 1) * t) * TS + 8, (a2.g - 1.5) * TS - Math.sin(Math.PI * t) * 28 + 6); } });
  spots.forEach(function (s) { if (r() < 0.6) pushCoin(s.x, s.y); });
  if (bossDef) enemies.push(bossDef);
  // ---- five special collectibles: spread over the level on arcs / floating spots
  var cand = spots.slice(); arcs.forEach(function (a2) { cand.push({ x: (a2.c + a2.w / 2) * TS + 8, y: (a2.g - 3.2) * TS }); }); flats.forEach(function (f) { cand.push({ x: (f.c + f.len / 2) * TS, y: (f.g - 3) * TS }); });
  cand.sort(function (u, v) { return u.x - v.x; });
  if (!room) { for (var si = 0; si < 5 && cand.length; si++) { var pick = cand[Math.min(cand.length - 1, Math.floor((si + 0.5) * cand.length / 5))]; specials.push({ x: pick.x, y: pick.y }); } }
  var gy = function (col) { return gt[col] * TS; };
  var L = { seed: seed, n: n, kind: isCannon ? 'cannon' : kind, attempt: a, diff: diff, w: W, tiles: tiles, gt: gt, coins: coins, special: specials, enemies: enemies, movers: movers, cannons: cannons, rings: rings, winds: winds, pockets: pockets, keys: keysL, doors: doorsL, switches: switchesL, tele: [], launch: [], grp: grpA, route: routeL.concat([{ k: 'goal', x: poleCol * TS + 6, y: null }]), puzzle: routeL.length > 0, goalX: poleCol * TS + 6, poleCol: poleCol, poleY: gy(poleCol),
    start: { x: 3 * TS + 2, y: gy(3) - P.SH }, cp: { x: cpCol * TS + 2, y: gy(cpCol) - P.SH }, time: (castle ? 150 : 90) + Math.floor(W * 0.6), kindAsked: kindAsked, theme: castle ? 4 : { plain: 0, hills: 0, flood: 3, ghost: 2, sky: 1, cave: 5, bonus: 1 }[kind] | 0, room: room, hasBoss: !!bossDef };
  L.rings.forEach(function (rg) { rg.out = { x: rg.c * TS + 2, y: rg.y - P.SH }; });
  if (castle && bossDef) L.arena = { c0: arenaC0, c1: arenaC0 + 26 };
  return L;
}
// ------------------------------------------------------------------ maze / puzzle levels: rooms joined by locked doors, switch gates, teleport pads, launch barrels and water-rise walls
function buildMaze(seed, n, a) {
  var r = rng(hash(seed, n, a * 7919 + 3)), diff = Math.min(1, (n - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3; if (a >= 9) diff = 0;
  var g = 12, rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  var gt = [], tl = [], gl = [], coins = [], enemies = [], keys = [], doors = [], switches = [], tele = [], launch = [], movers = [], pockets = [], route = [], cannons = [];
  var nRooms = Math.min(6, 3 + Math.floor(diff * 2.4 + r() * 1.3)), nConn = nRooms - 1, types = [], i, bit = 0, teleN = 0, doorColor = 0;
  function flat(len, gg) { var c0 = gt.length; for (var k = 0; k < len; k++) gt.push(gg); return c0; }
  // ---- choose the connector types; a "fork" (hub with teleport pads into a key side-room and a dead end) forces a door next
  for (i = 0; i < nConn; i++) { var opts = ['door', 'gate']; if (n >= 2) opts.push('tele'); if (diff > 0.15 || n >= 3) opts.push('launch'); types.push(opts[Math.floor(r() * opts.length)]); }
  var fork = -1; if (nConn >= 3 && (diff > 0.25 || r() < 0.3)) { fork = rnd(0, nConn - 2); types[fork] = 'fork'; types[fork + 1] = 'door'; }
  // ---- side rooms to the LEFT of the start (their x is below the start, so the goal gate is never triggered inside them)
  var s1c0 = -1, s2c0 = -1, s1c1 = 0;
  if (fork >= 0) { flat(2, 0); s2c0 = flat(11, g); flat(2, 0); s1c0 = flat(13, g); s1c1 = gt.length; flat(2, 0); }
  var roomS = [], roomE = [], alc = [], wallC = [];
  function floorKey(j, c, kind, grp, color) {   // alcove: two stepping platforms, the pickup on the upper one
    var rs = roomS[j], re = roomE[j], k = alc[j] || 0, a0 = rs + 3 + k * 8;
    if (a0 + 7 > re - 3) { return { x: (rs + 4) * TS + 8, y: (g - 1) * TS + 8, c: rs + 4 }; }
    alc[j] = k + 1; for (var q = 0; q < 3; q++) tl.push([a0 + q, g - 3, T.SOLID]); for (q = 3; q < 6; q++) tl.push([a0 + q, g - 6, T.SOLID]);
    return { x: (a0 + 4) * TS + 8, y: (g - 7) * TS + 8, c: a0 + 4 };
  }
  var sideKeyColor = -1;
  for (i = 0; i < nRooms; i++) {
    var w = i === 0 ? 16 : rnd(15, 19); roomS[i] = flat(w, g); roomE[i] = gt.length;
    if (i >= nConn) break;
    var ty = types[i], rs = roomS[i], re = roomE[i], wc = gt.length;
    if (ty === 'door' || ty === 'gate' || ty === 'rise') {
      var needBack = i > 0 && r() < 0.35 + 0.4 * diff, j = needBack ? rnd(0, i - 1) : i, pos;
      var isSide = (ty === 'door' && i === fork + 1 && fork >= 0);
      if (ty === 'door') {
        var color = doorColor++ % 3;
        if (isSide) { pos = { x: (s1c0 + 7) * TS + 8, y: (g - 1) * TS + 8 }; }
        else pos = floorKey(j);
        keys.push({ x: pos.x, y: pos.y, c: color }); var prep = { k: 'key', g: color, x: pos.x, y: pos.y };
        if (!isSide) { route.push(prep); } else { /* fetched through the fork's side room: stages were added by the fork */ }
        gt.push(0); gt.push(0); var di = doors.length; doors.push({ c: wc, r0: g - 3, r1: g - 1, g: color });
        for (var q = 1; q <= 3; q++) { tl.push([wc, g - q, T.DOOR]); gl.push([wc, g - q, color]); tl.push([wc + 1, g - q, 0]); }
        route.push({ k: 'door', i: di, x: wc * TS + 8, y: g * TS - 7 }); route.push({ k: 'xge', x: (wc + 2) * TS, y: g * TS - 7 });
      } else if (ty === 'gate') {
        pos = floorKey(j); var sbit = bit++, sc2 = pos.c;
        // the switch is a floor-level pad placed under/next to the alcove: use the pickup spot but at floor level when the alcove is the fallback
        switches.push({ c: Math.floor(pos.x / TS), r: Math.floor((pos.y - 8) / TS), g: sbit }); tl.push([Math.floor(pos.x / TS), Math.floor((pos.y - 8) / TS), T.SWITCH]); gl.push([Math.floor(pos.x / TS), Math.floor((pos.y - 8) / TS), sbit]);
        route.push({ k: 'sw', g: sbit, x: pos.x, y: pos.y });
        gt.push(0); gt.push(0); for (var q2 = 1; q2 <= 3; q2++) { tl.push([wc, g - q2, T.GATE]); gl.push([wc, g - q2, sbit]); tl.push([wc + 1, g - q2, 0]); }
        route.push({ k: 'xge', x: (wc + 2) * TS, y: g * TS - 7 });
      } else {   // rise: a wall with an opening high above the floor; the water-level switch floods both basins so the hero can swim over it
        pos = floorKey(j); var rbit = bit++;
        switches.push({ c: Math.floor(pos.x / TS), r: Math.floor((pos.y - 8) / TS), g: rbit }); tl.push([Math.floor(pos.x / TS), Math.floor((pos.y - 8) / TS), T.SWITCH]); gl.push([Math.floor(pos.x / TS), Math.floor((pos.y - 8) / TS), rbit]);
        route.push({ k: 'sw', g: rbit, x: pos.x, y: pos.y });
        // the last 4 floor columns of this room, the wall and 4 columns of the next room form the basin
        gt.push(4); gt.push(4); var b0 = wc - 4, b1 = wc + 2 + 4;
        for (var cc = b0; cc < b1; cc++) for (var rq = 1; rq <= g - 1; rq++) { if ((cc === wc || cc === wc + 1) && rq >= 4) continue; tl.push([cc, rq, T.WLEVEL]); gl.push([cc, rq, rbit]); }
        route.push({ k: 'xge', x: (wc + 2 + 5) * TS, y: g * TS - 7 });
        var nx = flat(0, g);
      }
    } else if (ty === 'tele') {
      gt.push(0); gt.push(0);
      var pc = re - 4, tc = wc + 2 + 3; tl.push([pc, g - 1, T.TELE]); tl.push([tc, g - 1, T.TELE]);
      tele.push({ c: pc, r: g - 1, tx: tc * TS + 1, ty: g * TS - 14, col: teleN % 3 }); route.push({ k: 'tele', n: ++teleN, x: pc * TS + 8, y: g * TS - 7 }); route.push({ k: 'xge', x: (wc + 2 + 5) * TS, y: g * TS - 7 });
    } else if (ty === 'launch') {
      var pw = 6; tl.push([re - 2, g - 1, T.LAUNCH]); launch.push({ c: re - 2, r: g - 1, vx: 3.2, vy: -9 });
      for (var q3 = 0; q3 < pw; q3++) gt.push(ROWS); route.push({ k: 'xge', x: (wc + pw + 1) * TS, y: g * TS - 7 });
    } else if (ty === 'fork') {
      gt.push(0); gt.push(0);
      var pa = re - 12, pb = re - 8, pcc = re - 4, tcn = wc + 2 + 3;   // three pads: to the key room (S1), to a dead end (S2), onwards
      tl.push([pa, g - 1, T.TELE]); tl.push([pb, g - 1, T.TELE]); tl.push([pcc, g - 1, T.TELE]); tl.push([tcn, g - 1, T.TELE]);
      var s1Exit = s1c1 - 4, s2Exit = s2c0 + 9;
      tele.push({ c: pa, r: g - 1, tx: (s1c0 + 2) * TS, ty: g * TS - 14, col: 0 }); tele.push({ c: pb, r: g - 1, tx: (s2c0 + 2) * TS, ty: g * TS - 14, col: 1 }); tele.push({ c: pcc, r: g - 1, tx: tcn * TS + 1, ty: g * TS - 14, col: 2 });
      tl.push([s1c0 + 11, g - 1, T.TELE]); tele.push({ c: s1c0 + 11, r: g - 1, tx: (pa + 3) * TS, ty: g * TS - 14, col: 0 });   // return loop from the key room (lands a bit to the right of the pad)
      tl.push([s2c0 + 9, g - 1, T.TELE]); tele.push({ c: s2c0 + 9, r: g - 1, tx: (pb + 3) * TS, ty: g * TS - 14, col: 1 });
      route.push({ k: 'tele', n: ++teleN, x: pa * TS + 8, y: g * TS - 7 });    // into the key room
      // the key (for the next door) lies in the key room; its stages follow, then the return pad, then the onward pad
      var kcol = doorColor % 3, kx = (s1c0 + 7) * TS + 8, ky2 = (g - 1) * TS + 8; route.push({ k: 'key', g: kcol, x: kx, y: ky2 });
      route.push({ k: 'tele', n: ++teleN, x: (s1c0 + 11) * TS + 8, y: g * TS - 7 });
      route.push({ k: 'tele', n: ++teleN, x: pcc * TS + 8, y: g * TS - 7 }); route.push({ k: 'xge', x: (wc + 2 + 5) * TS, y: g * TS - 7 });
      for (var q4 = 0; q4 < 6; q4++) coins.push({ x: (s2c0 + 3 + q4) * TS + 8, y: (g - 2) * TS + 8, b: 0 });
    }
    // after a connector the next room starts after its columns
  }
  flat(4, g); var poleCol = flat(4, g) + 1; flat(6, g);
  var W = gt.length, tiles = new Uint8Array(W * ROWS), grp = new Uint8Array(W * ROWS), c, rr;
  for (c = 0; c < W; c++) for (rr = gt[c]; rr < ROWS; rr++) tiles[c * ROWS + rr] = T.SOLID;
  tl.forEach(function (e) { if (e[0] >= 0 && e[0] < W && e[1] >= 0 && e[1] < ROWS) tiles[e[0] * ROWS + e[1]] = e[2]; });
  gl.forEach(function (e) { grp[e[0] * ROWS + e[1]] = e[2]; });
  // ---- decor: coins on the floor, a few walkers and spikes inside rooms (away from connectors)
  var keep = []; tele.forEach(function (t) { keep.push(t.c, Math.floor(t.tx / TS)); }); keys.forEach(function (k) { keep.push(Math.floor(k.x / TS)); }); switches.forEach(function (s2) { keep.push(s2.c); }); launch.forEach(function (l2) { keep.push(l2.c); }); doors.forEach(function (d2) { keep.push(d2.c); });
  function nearKeep(col) { for (var q = 0; q < keep.length; q++) if (Math.abs(col - keep[q]) < 6) return true; return false; }
  for (i = 0; i < nRooms; i++) {
    var rs2 = roomS[i], re2 = roomE[i]; for (var q5 = 0; q5 < 4; q5++) if (r() < 0.6) coins.push({ x: (rs2 + 5 + q5 * 2) * TS + 8, y: (g - 2) * TS + 8, b: 0 });
    if (i > 0 && r() < 0.35 + 0.5 * diff) { var ex = (rs2 + 6 + r() * (re2 - rs2 - 14)) * TS; if (!nearKeep(Math.floor(ex / TS))) enemies.push({ t: E.WALKER, x: ex, y: g * TS - 12, w: 12, h: 12, spd: 0.4 + 0.3 * r(), dir: r() < 0.5 ? -1 : 1, mn: (rs2 + 5) * TS, mx: (re2 - 5) * TS }); }
    if (i > 0 && diff > 0.3 && r() < 0.5) { var sx = rs2 + rnd(7, Math.max(7, re2 - rs2 - 9)); if (!nearKeep(sx) && tiles[sx * ROWS + g - 1] === 0 && tiles[(sx + 1) * ROWS + g - 1] === 0) { tiles[sx * ROWS + g - 1] = T.SPIKE; } }
  }
  var specials = []; for (i = 0; i < 5; i++) { var rc = roomS[Math.min(nRooms - 1, Math.floor(i * nRooms / 5))]; specials.push({ x: (rc + 8 + (i % 3) * 2) * TS, y: (g - 3) * TS }); }
  route.push({ k: 'goal', x: poleCol * TS + 6, y: null });
  var sx0 = roomS[0] + 3, L = { seed: seed, n: n, kind: 'maze', attempt: a, diff: diff, w: W, tiles: tiles, grp: grp, gt: gt, coins: coins, special: specials, enemies: enemies, movers: movers, cannons: cannons, rings: [], winds: [], pockets: pockets,
    keys: keys, doors: doors, switches: switches, tele: tele, launch: launch, route: route, goalX: poleCol * TS + 6, poleCol: poleCol, poleY: g * TS, start: { x: sx0 * TS + 2, y: g * TS - 14 },
    cp: { x: (roomS[Math.floor(nRooms / 2)] + 2) * TS + 2, y: g * TS - 14 }, time: 260 + Math.floor(W * 0.9), theme: 5, room: false, hasBoss: false, puzzle: true };
  return L;
}

// ------------------------------------------------------------------ containment check: every water / lava cell needs a solid-or-liquid floor and solid-or-liquid neighbours left and right
function wetTile(t) { return t === T.WATER || (t >= 22 && t <= 24) || t === T.WLEVEL || t === T.LAVA; }
function checkContainment(L) {
  var bad = [], w = L.w, R = ROWS, tiles = L.tiles, solid = PF.SOL;
  function at(c, r) { if (c < 0 || c >= w) return 1; if (r < 0) return 0; if (r >= R) return 1; return tiles[c * R + r]; }
  function ok(t) { return solid[t] === 1 || wetTile(t) || t === T.SPIKE; }   // a spike stands on the floor inside the basin
  for (var c = 0; c < w; c++) for (var r = 0; r < R; r++) { var t = tiles[c * R + r]; if (!wetTile(t)) continue;
    if (!ok(at(c, r + 1))) bad.push(['floor', c, r]); else if (!ok(at(c - 1, r))) bad.push(['left', c, r]); else if (!ok(at(c + 1, r))) bad.push(['right', c, r]); }
  function wetAt(x, y) { return wetTile(at(Math.floor(x / TS), Math.floor(y / TS))); }
  (L.enemies || []).forEach(function (e) {
    var xs = [], ys = [];
    if (e.t === E.SWIM || e.t === E.WHALE) { xs = [e.ax - e.rg, e.ax + e.rg, e.ax]; ys = [e.ay - (e.am || 3), e.ay + (e.am || 3)]; if (e.t === E.WHALE) { xs = [e.ax - e.rg + 4, e.ax + e.rg + e.w - 4]; } }
    else if (e.t === E.CHASER) { xs = [e.ax]; ys = [e.ay]; } else if (e.t === E.FMINE) { xs = [e.ax]; ys = [e.ay - e.am, e.ay + e.am]; } else if (e.t === E.JELLY) { xs = [e.ax - 14, e.ax + 14]; ys = [e.ay - 8, e.ay + 8]; } else return;
    xs.forEach(function (x) { ys.forEach(function (y) { if (!wetAt(x + e.w / 2, y + e.h / 2)) bad.push(['creature', Math.floor(x / TS), Math.floor(y / TS)]); }); });
  });
  (L.pockets || []).forEach(function (p) { if (!wetAt(p.x, p.y)) bad.push(['pocket', Math.floor(p.x / TS), Math.floor(p.y / TS)]); });
  return { bad: bad.length, details: bad.slice(0, 6) };
}
function roomLevel(seed, n, secret) {
  var L = null;
  for (var a = 0; a < 10; a++) { L = build(seed, n + 500 + a, a, { room: true, kind: 'plain' }); L.theme = 1; L.enemies = []; L.rings = []; L.special = []; L.cannons = []; L.exitKind = secret ? 'secret' : 'ret'; var v = validate(L); if (v.ok) { L.valid = true; L.script = v.script; return L; } }
  L.valid = false; return L;
}
function generate(seed, n, o) {
  var L = null, v = null;
  for (var a = 0; a < 16; a++) {
    L = build(seed, n, a, o); v = validate(L);
    if (v.ok) { L.script = v.script; if (replay(L)) { L.valid = true; L.attempt = a; L.vnodes = v.nodes; L.crumbs = makeCrumbs(L); return L; } }
  }
  L.valid = false; L.attempt = 16; return L;
}
// replay the validator's input script on a fresh enemy-free state: proves the flag is reachable with the real physics
function makeCrumbs(L) { var st = newState(L, { noEn: true }), out = [], last = -99; for (var i = 0; i < L.script.length; i++) { var px0 = st.p.x + 6, py0 = st.p.y + 7, sg0 = st.stage, tc0 = st.tc, kb0 = st.kb, sb0 = st.sb; step(st, L.script[i]); if (st.stage !== sg0 || st.tc !== tc0 || st.kb !== kb0 || st.sb !== sb0) { out.push([Math.round(px0), Math.round(py0), sg0]); last = i; } if (st.p.dead || st.p.won) break; if (i - last >= 36 && st.p.ground) { out.push([Math.round(st.p.x + 6), Math.round(st.p.y + 7), st.stage]); last = i; } } out.push([Math.round(L.goalX), Math.round(L.poleY - 8), (L.route ? L.route.length - 1 : 0)]); return out; }
function replay(L) { var st = newState(L, { noEn: true }); if (!L.script) return false; for (var i = 0; i < L.script.length; i++) { step(st, L.script[i]); if (st.p.dead) return false; if (st.p.won) return true; } return st.p.won; }

root.PF.probe = probe; root.PF.build = build; root.PF.generate = generate; root.PF.validate = validate; root.PF.checkContainment = checkContainment; root.PF.replay = replay; root.PF.makeCrumbs = makeCrumbs; root.PF.searchStage = searchStage; root.PF.roomLevel = roomLevel; root.PF.worldMap = worldMap; root.PF.superMap = superMap; root.PF.validateWorldMap = validateWorldMap; root.PF.validateSuper = validateSuper; root.PF.kindOf = kindOf; root.PF.worldKinds = worldKinds; root.PF.KIND_NAMES = KIND_NAMES;
})(typeof window !== 'undefined' ? window : globalThis);
