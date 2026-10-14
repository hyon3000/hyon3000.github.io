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

function nearEn(st) { var px = st.p.x, en = st.en; for (var i = 0; i < en.length; i++) { var e = en[i]; if (e.alive && Math.abs((e.ax !== undefined ? e.ax : e.x) - px) < 360) return true; } return false; }   // the enemies' phase only matters for the search while one is close
function heapPush(h, it) { h.push(it); var i = h.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (h[p].h <= h[i].h) break; var t = h[p]; h[p] = h[i]; h[i] = t; i = p; } }
function heapPop(h) { var top = h[0], last = h.pop(); if (h.length) { h[0] = last; var i = 0, n = h.length; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < n && h[l].h < h[m].h) m = l; if (r < n && h[r].h < h[m].h) m = r; if (m === i) break; var t = h[m]; h[m] = h[i]; h[i] = t; i = m; } } return top; }
var AIRS = [0, IN.R, IN.R | IN.RUN, IN.L], HOLDS = [3, 10, 99];
// best-first macro search on the real simulation from state st0 until pred(state) holds; returns { st, seq } or null
function searchStage(st0, pred, tx, ty, maxNodes) { var it = searchIter(st0, pred, tx, ty, maxNodes), r; while ((r = it.run(1e9)) === undefined); return r; }
// resumable form: run(n) expands up to n nodes and returns undefined (not finished), null (no route) or { st, seq }
function searchIter(st0, pred, tx, ty, maxNodes) {
  if (pred(st0)) return { run: function () { return { st: st0, seq: [], nodes: 0 }; } };
  var seen = new Set(), heap = [], nodes = 0;
  function key(st) { var p = st.p, a = Math.abs(p.vx), sc = (p.vx < -0.3 ? -1 : 1) * (a < 0.3 ? 0 : a < 1.8 ? 1 : 2) + 2, ph = (p.mv >= 0 || st.sw || st.L.hasFire) ? Math.floor((st.f % MV_PERIOD) / 20) + 1 : (nearEn(st) ? 40 + Math.floor(st.f / 10) % 32 : 0); return ((((Math.round(p.x / 3) * 256 + Math.round(p.y)) * 5 + sc) * 80 + ph) * 64 + (st.kb & 7) * 8 + (st.sb & 7)) * 40 + Math.min(39, st.mod.size); }
  function hval(st) { var p = st.p; return Math.abs(p.x + 6 - tx) + (ty === null ? 0 : 1.5 * Math.abs(p.y + 7 - ty)); }
  var root = { st: st0, par: null, seq: [], h: hval(st0) }; seen.add(key(st0)); heapPush(heap, root);
  function path(nd, extra) { var parts = [extra]; while (nd) { parts.push(nd.seq); nd = nd.par; } var out = []; for (var i = parts.length - 1; i >= 0; i--) for (var j = 0; j < parts[i].length; j++) out.push(parts[i][j]); return out; }
  return { run: function (budget) {
  var lim = Math.min(maxNodes, nodes + budget);
  while (heap.length && nodes < lim) {
    var nd = heapPop(heap); nodes++;
    var found = null, tryMacro = function (fn) {
      if (found) return; var s = clone(nd.st), seq = fn(s); if (!seq || s.p.dead) return;
      if (pred(s)) { found = { st: s, seq: path(nd, seq), nodes: nodes }; return; }
      if (!s.p.ground) return;
      var k = key(s); if (seen.has(k)) return; seen.add(k); heapPush(heap, { st: s, par: nd, seq: seq, h: hval(s) });
    };
    var mi, walks = [[IN.R, 8], [IN.R | IN.RUN, 8], [IN.L, 8], [IN.L | IN.RUN, 8], [0, 20], [IN.R | IN.RUN, 3]];
    for (mi = 0; mi < walks.length; mi++) tryMacro(function (s) { return macroWalk(s, walks[mi][0], walks[mi][1]); });
    if (st0.L.duck && nd.st.p.big && nd.st.p.ground) [5, 8, 12, 17].forEach(function (rr2) { tryMacro(function (s) { var a = macroWalk(s, IN.R | IN.RUN, rr2); if (s.p.dead || s.p.won) return a; return a.concat(macroWalk(s, IN.DN, 40)); }); });   // run-up, then duck and slide on the momentum (one-tile holes)
    var airs = st0.L.pound ? AIRS.concat([IN.DN]) : AIRS;
    for (var hi = 0; hi < 3; hi++) for (var ai = 0; ai < airs.length; ai++) {
      tryMacro(function (s) { return macroJump(s, HOLDS[hi], airs[ai], 0, 0); });
      if (ai === 1 || ai === 2) tryMacro(function (s) { return macroEdge(s, ai === 2, HOLDS[hi], airs[ai]); });
    }
    if (found) return found;
  }
  return (heap.length && nodes < maxNodes) ? undefined : null;
  } };
}
// validation state: enemies that are only hazards (embers, leaping fish, walkers ...) are left out like in every other stage; only the ones the solution NEEDS (shell beetles, flyers used as steps) stay (L.reqEn)
function vState(L) { var st = newState(L, { noEn: !L.stepEn, noPM: !L.plan }); if (L.stepEn && L.reqEn && !L.plan) { st.en = st.en.filter(function (e) { return L.reqEn.indexOf(e.t) >= 0; }); st.boss = st.en.filter(function (e) { return e.t === E.BOSS; }).length; } return st; }
function validate(L, maxNodes) {
  var multi = L.route && L.route.length > 1; maxNodes = maxNodes || (multi ? 9000 : 4000);    // enemy-aware searches are expensive: fail fast and redraw
  var st = vState(L), seq0 = [0, 0, 0]; runSeq(st, seq0);
  if (!st.p.ground) return { ok: false, why: 'start' };
  var route = L.route || [{ k: 'goal', x: L.goalX, y: null }], script = seq0.slice(), total = 0;
  for (var i = 0; i < route.length; i++) {
    var g = route[i], ty = g.y === undefined ? null : g.y, tx = g.x === undefined ? L.goalX : g.x;
    var res = searchStage(st, function (s) { return PF.stageDone(s, g) && !(s.p.pois > 0); }, tx, ty, maxNodes);   // a stage must not end inside poison (the grace timer is still running)
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
  function ok(L, fn, gw) { var s = newState(L, { noEn: true, noPM: true }); runSeq(s, [0, 0, 0]); var seq = fn(s); return !!seq && !s.p.dead && s.p.ground && s.p.x > (10 + gw) * TS; }
  var gapRun = 0, gapWalk = 0, up = 0, gw, h;
  for (gw = 1; gw <= 9; gw++) { var L1 = flatLevel(gw, 0);
    if (ok(L1, function (s) { return macroEdge(s, true, 99, IN.R | IN.RUN); }, gw)) gapRun = gw;
    if (ok(L1, function (s) { return macroEdge(s, false, 99, IN.R); }, gw)) gapWalk = gw; }
  for (h = 1; h <= 7; h++) { var L2 = flatLevel(0, h), good = false;
    for (var pre = 0; pre < 260 && !good; pre += 2) for (var run = 0; run < 2 && !good; run++) {
      var s = newState(L2, { noEn: true, noPM: true }); runSeq(s, [0, 0, 0]);
      var inp = IN.R | (run ? IN.RUN : 0); macroJump(s, 99, inp, pre, inp);
      if (!s.p.dead && s.p.ground && s.p.x > 22 * TS && s.p.y < (L2.g - h) * TS) good = true; }
    if (good) up = h; }
  LIM = { gapRun: gapRun, gapWalk: gapWalk, up: up };
  return LIM;
}

// ------------------------------------------------------------------ worlds
var KIND_THEME = { plain: 0, hills: 0, flood: 3, ghost: 2, sky: 1, cave: 5, bonus: 1, castle: 4, autumn: 6, jungle: 7, snow: 8, desert: 9, swamp: 10, storm: 11, airship: 12, crystal: 13, volcano: 14, ruins: 15, factory: 16, neon: 17, glacier: 22, tower: 18, shaft: 19, chase: 20, skymaze: 1, aircourse: 1, flystep: 1, gates: 15, zigzag: 15, lavatower: 14, gauntlet: 21, bossrush: 4, maze: 5 };
var KIND_NAMES = { autumn: ['가을 과수원', 'Autumn Orchard'], jungle: ['정글', 'Jungle'], snow: ['설원', 'Snowfield'], desert: ['사막', 'Desert'], swamp: ['늪', 'Swamp'], storm: ['폭풍 구름', 'Storm Clouds'], airship: ['비행선', 'Airship Fleet'], crystal: ['수정 동굴', 'Crystal Cavern'], volcano: ['화산', 'Volcano'], ruins: ['유적', 'Ruins'], factory: ['공장', 'Factory'], neon: ['네온 도시', 'Neon City'], skymaze: ['공중 미로', 'Sky Labyrinth'], aircourse: ['공중 코스', 'Sky Course'], gates: ['변신 관문', 'Power Gates'], flystep: ['날것 징검다리', 'Flyer Hops'], zigzag: ['굽이굽이 성', 'Switchback Keep'], lavatower: ['용암 탑', 'Rising Lava Tower'], glacier: ['얼음 지대', 'Ice Fields'], tower: ['탑 오르기', 'Tower Climb'], shaft: ['깊은 수직굴', 'Deep Shaft'], chase: ['추격전', 'Chase'], gauntlet: ['시간제 관문', 'Timed Gauntlet'], bossrush: ['보스 러시', 'Boss Rush'], cannon: ['대포', 'Cannon'], plain: ['초원', 'Meadow'], hills: ['언덕', 'Hills'], flood: ['물가', 'Lagoon'], ghost: ['유령의 숲', 'Haunted Grove'], sky: ['하늘길', 'Sky Path'], cave: ['동굴', 'Cavern'], castle: ['성채', 'Fortress'], maze: ['미궁', 'Labyrinth'], room: ['비밀방', 'Bonus Room'], bonus: ['별길', 'Star Road'] };
function effN(n) { return n >= 1000 ? n : n + 5 - (n === 1 ? 2 : 0); }   // the difficulty curve starts one world later (stage 1 stays gentle)
// every world: a gentle starter, three stages from a seeded rotation of all the other kinds (so neighbouring stages and worlds feel different), one labyrinth, and the ending
// map types (layouts) x themes (looks): 20 x 23 = 460 combinations. Layout list (20): plain, hills + the rotation below (flood sky cave ice storm swamp crystal airship ruins factory volcano ghost-maze tower shaft chase gauntlet sky-labyrinth) + the labyrinth slot (key rooms / tunnel grid). Castles, cannons and bonus stages keep their own look.
var STARTERS = ['plain', 'hills'], ROTATION = ['flood', 'sky', 'gates', 'cave', 'glacier', 'zigzag', 'lavatower', 'aircourse', 'crystal', 'flystep', 'airship', 'ruins', 'factory', 'volcano', 'ghost', 'tower', 'shaft', 'chase', 'gauntlet', 'skymaze'];
var THEME_COUNT = 23, THEME_NAMES = [['초원', 'Meadow'], ['하늘', 'Sky'], ['유령', 'Haunted'], ['물가', 'Lagoon'], ['성채', 'Fortress'], ['동굴', 'Cavern'], ['가을', 'Autumn'], ['정글', 'Jungle'], ['설원', 'Snow'], ['사막', 'Desert'], ['늪', 'Swamp'], ['폭풍', 'Storm'], ['비행선', 'Airship'], ['수정', 'Crystal'], ['화산', 'Volcano'], ['유적', 'Ruins'], ['공장', 'Factory'], ['네온', 'Neon'], ['탑', 'Tower'], ['수직굴', 'Shaft'], ['추격', 'Chase'], ['시간제', 'Timed'], ['빙하', 'Glacier']];
// which looks go with which map type (no snow with lava, no meadow in a dark maze ...): 0 meadow 1 sky 2 haunted 3 lagoon 4 fortress 5 cavern 6 autumn 7 jungle 8 snow 9 desert 10 swamp 11 storm 12 airship 13 crystal 14 volcano 15 ruins 16 factory 17 neon 18 tower 19 shaft 20 chase 21 timed 22 glacier
var HOT = [2, 4, 5, 9, 14, 15, 16, 17, 19, 20, 21], DARK = [2, 4, 5, 10, 13, 15, 16, 17, 19], AIRY = [0, 1, 6, 11, 12, 13, 17, 18], COLD = [1, 5, 8, 11, 13, 18, 22], WET = [0, 3, 5, 6, 7, 10, 13];
var LAYOUT_THEMES = { plain: [0, 1, 3, 6, 7, 8, 9, 10, 11, 13, 22], hills: [0, 1, 6, 7, 8, 9, 10, 11, 22], flood: WET, sky: AIRY, cave: [5, 2, 9, 10, 13, 15, 16, 19, 22], glacier: COLD, zigzag: [2, 4, 5, 9, 12, 13, 15, 16, 17, 19, 22, 8], lavatower: HOT, crystal: [13, 5, 1, 17, 22, 8, 18], airship: [12, 1, 11, 18, 17, 0, 6], ruins: [15, 2, 5, 7, 9, 10, 19, 4], factory: [16, 17, 12, 19, 5, 20, 21, 15], volcano: HOT, ghost: [2, 15, 19, 4, 10, 5], tower: [18, 1, 0, 6, 8, 11, 22, 13, 17, 12, 15], shaft: [19, 5, 14, 15, 16, 4, 17, 2, 10, 9], chase: [20, 14, 9, 16, 17, 4, 19, 12, 11, 2, 15], gauntlet: [21, 17, 16, 12, 11, 1, 13, 18, 0, 6, 9], skymaze: AIRY.concat([12]), aircourse: AIRY.concat([12, 22]), gates: [0, 1, 6, 7, 9, 15, 16, 4, 5, 2, 22, 8], flystep: AIRY.concat([12, 22]), maze: DARK };
function pickTheme(seed, n, kind) { var list = LAYOUT_THEMES[kind]; if (!list) return hash(seed, n, 911) % THEME_COUNT; if (n === 1 && list.indexOf(0) >= 0) return 0; return list[hash(seed, n, 911) % list.length]; }
function unlocked(depth) { return Math.min(ROTATION.length, 6 + depth * 3); }   // new kinds are mixed in as the world index grows
function worldKinds(seed, w, depth) {
  depth = depth || 0; var pool = ROTATION.slice(0, unlocked(depth)), r = rng(hash(seed, w, 1357)), i, j, t;
  for (i = pool.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  var out = [STARTERS[Math.floor(r() * STARTERS.length)]]; var vk = (w % 2 === 0) ? 'tower' : 'shaft'; pool = pool.filter(function (k) { return k !== 'tower' && k !== 'shaft'; }); out.push(vk); for (i = 0; i < 2; i++) out.push(pool[i]); if (w % 2 === 0 && depth > 0 && out[2] !== 'maze') out[2] = ['skymaze', 'aircourse', 'flystep'][Math.floor(r() * 3)]; if (w % 2 === 1 && depth > 0) out[2] = vk === 'tower' ? 'shaft' : 'tower';
  var mp = depth === 0 ? 3 : 1 + Math.floor(r() * 3); out[mp] = 'maze'; out.push('castle'); return out;
}
// the super map is an endless DAG of worlds generated lazily from the seed: id = depth * 3 + slot; depth 0 has 1 world, depth 1 has 2, deeper depths have 3 (forks and merges everywhere)
var _wi = {};
function worldInfo(seed, wid) {
  var key = seed + ':' + wid; if (_wi[key]) return _wi[key];
  var d = Math.floor(wid / 3), s = wid % 3, h = function (k) { return hash(seed, wid, 6000 + k); }, mainEnd = (h(1) % 100) < 72 ? 'castle' : 'cannon', cs, cn;
  if (d === 0) { cs = 0; cn = 1; } else if (d === 1) { cs = s; cn = s === 1 ? 2 : 1 + (h(2) % 2); } else { cs = s; cn = (s + 1 + (h(3) % 2)) % 3; }
  var info = { id: wid, depth: d, slot: s, mainEnd: mainEnd, next: { castle: (d + 1) * 3 + cs, cannon: (d + 1) * 3 + cn } };
  if (Object.keys(_wi).length > 4000) _wi = {}; _wi[key] = info; return info;
}
function worldExists(wid) { var d = Math.floor(wid / 3), s = wid % 3; return wid >= 0 && (d === 0 ? s === 0 : d === 1 ? s < 2 : true); }
function worldKindsOld(seed, w) {
  var r = rng(hash(seed, w, 4242)), pool = ['hills', 'flood', 'ghost', 'sky', 'cave'], out = [w === 0 ? 'plain' : (r() < 0.5 ? 'plain' : 'hills')];
  if (w === 0) pool = ['hills', 'flood', 'ghost', 'sky', 'cave'];
  else pool = pool.filter(function (k) { return k !== out[0]; }).concat(out[0] === 'plain' ? [] : ['plain']);
  for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  for (i = 0; i < 3; i++) out.push(pool[i]);
  var mp = w === 0 ? 3 : 1 + Math.floor(r() * 3); out[mp] = 'maze';
  out.push('castle'); return out;
}
function kindOf(seed, n) { if (n >= 1000) return 'bonus'; var w = Math.floor((n - 1) / 5); return worldKinds(seed, w, w)[(n - 1) % 5]; }
// the overworld map: five level nodes joined by a winding path (+ one hidden bonus node that a secret exit opens)
// world map of one world: 4 levels, then an ending node (a fortress with a boss, or a cannon). Some levels have a secret exit that opens a branch: an alternate chain ending in the OTHER ending, or a bonus level.
// the main ending is always reachable without any secret exit.
function worldMap(seed, wid, depth, mainEnd) {
  depth = depth || 0; mainEnd = mainEnd || 'castle';
  var r = rng(hash(seed, wid, 777)), kinds = worldKinds(seed, wid, depth), nodes = [], edges = [], x = 36, y = 120 + (r() - 0.5) * 40, i;
  for (i = 0; i < 4; i++) { nodes.push({ i: i, n: depth * 5 + i + 1, kind: kinds[i], x: Math.round(x), y: Math.round(y), main: true }); x += 62 + r() * 12; y = Math.max(70, Math.min(160, y + (r() - 0.5) * 80)); }
  var mainId = mainEnd === 'castle' ? 4 : 9, altId = mainEnd === 'castle' ? 9 : 4, endY = Math.max(70, Math.min(160, y));
  var mk = function (id, yy, main) { return { i: id, n: id === 4 ? depth * 5 + 5 : depth * 5 + 4, kind: id === 4 ? ((depth >= 3 && hash(seed, wid, 8) % 3 === 0) ? 'bossrush' : 'castle') : 'cannon', x: Math.round(x), y: Math.round(yy), main: main, ending: id === 4 ? 'castle' : 'cannon' }; };
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
function validateInfinite(seed, maxDepth) {   // every world up to maxDepth exists, is reachable from world 0, has two exits one level deeper, and the main-route chain never ends
  var out = { ok: true, why: '', worlds: 0, forks: 0, merges: 0 }, reach = { 0: 1 }, incoming = {}, cur = [0], d;
  for (d = 0; d < maxDepth; d++) { var nxt = {}; cur.forEach(function (id) { var w = worldInfo(seed, id); out.worlds++; if (!worldExists(id)) { out.ok = false; out.why = 'bad id ' + id; }
      ['castle', 'cannon'].forEach(function (k) { var t = w.next[k]; if (!worldExists(t) || Math.floor(t / 3) !== w.depth + 1) { out.ok = false; out.why = 'bad edge ' + id + '>' + t; } nxt[t] = 1; incoming[t] = (incoming[t] || 0) + 1; });
      if (w.next.castle !== w.next.cannon) out.forks++; }); cur = Object.keys(nxt).map(Number); cur.forEach(function (t) { reach[t] = 1; if (incoming[t] > 1) out.merges++; });
    var expect = d + 1 === 1 ? 2 : 3; if (cur.length !== expect) { out.ok = false; out.why = 'depth ' + (d + 1) + ' reaches ' + cur.length + ' of ' + expect; } }
  var id2 = 0, steps = 0; while (steps++ < maxDepth) { var w2 = worldInfo(seed, id2); id2 = w2.next[w2.mainEnd]; } out.mainDepth = Math.floor(id2 / 3); if (out.mainDepth !== maxDepth) { out.ok = false; out.why = 'main chain broken'; }
  return out;
}

// ------------------------------------------------------------------ level builder
function build(seed, n, a, o) {
  var L = buildRaw(seed, n, a, o), o2 = o || {};
  if (o2.theme !== undefined) L.theme = o2.theme;
  else if (L.themeList) L.theme = L.themeList[hash(seed, n, 911) % L.themeList.length];
  else if (!L.room && L.kind !== 'castle' && L.kind !== 'bossrush' && L.kind !== 'cannon' && L.kind !== 'bonus') L.theme = pickTheme(seed, n, L.kind);
  L.layout = L.kind; return L;
}
function buildRaw(seed, n, a, o) {
  o = o || {}; var nn = effN(n);
  // labyrinths: half the 'maze' stages are the key-and-door puzzle rooms, half the tunnel grid
  var kk1 = o.kind || kindOf(seed, n);
  if (!o.room) {
    if (kk1 === 'maze') return (hash(seed, n, 5) % 2 === 0) ? buildMaze(seed, n, a) : buildGrid(seed, n, a, 'cave');
    if (kk1 === 'ghost') return buildGhostHouse(seed, n, a);
    if (kk1 === 'gates') return buildGates(seed, n, a);
    if (kk1 === 'skymaze') return buildSkyMaze(seed, n, a);
    if (kk1 === 'aircourse') return buildSkyMaze(seed, n, a, true);
    if (kk1 === 'flystep') return buildTrajChain(seed, n, a);
    if (kk1 === 'zigzag') return buildSwitchback(seed, n, a);
    if (kk1 === 'lavatower') return buildLavaTower(seed, n, a);
    if (kk1 === 'tower' || kk1 === 'shaft') return buildVertical(seed, n, a, kk1);
  }
  var kk0 = o.kind || kindOf(seed, n); if ((kk0 === 'tower' || kk0 === 'shaft') && !o.room) return buildVertical(seed, n, a, kk0);
  var wantSecret = !!o.secret, kindAsked = o.kind || kindOf(seed, n);
  var lim = probe(), r = rng(hash(seed, n, a * 7919 + 1)), kind = o.kind || kindOf(seed, n), room = !!o.room, isCannon = kind === 'cannon'; if (isCannon) kind = 'sky';
  var diff = Math.min(1, (nn >= 1000 ? 8 : nn - 1) / 18); if (kind === 'bonus') diff = Math.min(1, 0.4 + 0.5 * diff); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3; if (a >= 8) diff = 0;
  var castle = kind === 'castle' || kind === 'bossrush', isRush = kind === 'bossrush';
  var W = room ? 46 : isCannon ? 96 : castle ? Math.min(220, 90 + 6 * Math.min(nn, 30)) : Math.min(300, 110 + 5 * Math.min(nn, 38));
  var KIND_TABLE = {
    autumn: { flat: 3, hills: 2, stairs: 1.5, hurdle: 2, spikes: 1, gap: 1.5, plant: 0.8, spring: 0.5, split: 0.8 }, jungle: { vine: 2, spring: 2.2, plant: 1.6, islands: 1.2, split: 1.2, hills: 1, gap: 1.5, hurdle: 1 },
    glacier: { ice: 6, wind: 0.6, hills: 1, spikes: 1.4, gap: 2.2, hurdle: 1.2, flat: 0.8, spring: 0.4 },
    snow: { ice: 3.5, wind: 1, hills: 1.2, spikes: 1.2, gap: 1.5, hurdle: 1.5, flat: 1.2 }, desert: { hills: 3.5, mud: 2, wind: 1.2, spikes: 1.8, gap: 1.2, plant: 0.6, flat: 1.5 },
    swamp: { mud: 3.2, ghost: 1.4, plant: 1.2, islands: 1.2, hurdle: 1.2, spikes: 0.8, gap: 1 }, storm: { cloud: 2.5, wind: 2.2, updraft: 1.2, islands: 2, gap: 3, mover: 1, orbit: 1, flat: 0.8 },
    airship: { mover: 2, vmover: 2, orbit: 1.5, falling: 1.5, cannon: 2.2, wind: 1.2, gap: 3, flat: 0.8, islands: 1.2 }, crystal: { spring: 2.8, hills: 2, islands: 1.3, ring: 1.2, split: 1.2, flat: 1.5 },
    volcano: { fire: 3, gap: 3, falling: 1.5, orbit: 1, crush: 0.8, hills: 1.2, islands: 1.2, flat: 1.2 }, ruins: { crush: 2.2, spikes: 2.2, keydoor: 1, sgate: 0.9, plant: 1.2, hurdle: 2.2, cannon: 1.2, ring: 0.6, flat: 1.5 },
    factory: { conv: 3.2, cannon: 1.6, vmover: 1.6, orbit: 1.2, crush: 1.2, fire: 1.2, gap: 2, flat: 1.2 }, neon: { fire: 3, cannon: 1.2, mover: 1.4, vmover: 1.2, islands: 1.4, gap: 2.5, flat: 1 },
    chase: { flat: 3, gap: 1.6, hurdle: 1.4, stairs: 0.8, spikes: 0.5, hills: 0.8 }, gauntlet: { flat: 2.4, gap: 2, hurdle: 2, spikes: 1.4, islands: 1, hills: 1, mover: 0.8 } };
  var lavaPits = castle || kind === 'volcano', usedIce = false, usedMud = false, usedFire = false;
  var gt = [], flats = [], tl = [], movers = [], arcs = [], coinsX = [], specials = [], cannons = [], rings = [], enemiesX = [], winds = [], pockets = [], keysL = [], doorsL = [], switchesL = [], routeL = [], gl = [], gcount = 0, g = castle ? 11 : 12, cpCol = -1, needPow = true, spots = [], ringCount = 0;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  function flat(len, gg) { var c0 = gt.length; for (var i = 0; i < len; i++) gt.push(gg); return c0; }
  function pit(len) { var c0 = gt.length; for (var i = 0; i < len; i++) { gt.push(ROWS); if (lavaPits) { tl.push([c0 + i, ROWS - 2, T.LAVA]); tl.push([c0 + i, ROWS - 1, T.LAVA]); } } return c0; }
  // hazards on the ground (spikes, obstacles) are remembered so a gap or any jump section never starts right behind them: a safe flat run-up is always kept
  var hz = {}, tlSeen = 0;
  function markHaz() { for (; tlSeen < tl.length; tlSeen++) { var e = tl[tlSeen], cc = e[0]; if (cc >= 0 && cc < gt.length && gt[cc] < ROWS && e[1] === gt[cc] - 1 && (e[2] === T.SPIKE || e[2] === T.SOLID || e[2] === T.LAVA || e[2] === T.CANL || e[2] === T.CANR || e[2] === T.STUMP || e[2] === T.SPRING || e[2] === T.FIRE)) hz[cc] = true; } }
  function safeRunway() { var i = gt.length - 1; if (i < 0 || gt[i] >= ROWS) return 0; var gv = gt[i], k = 0; while (i >= 0 && gt[i] === gv && !hz[i]) { k++; i--; } return k; }
  function runway() { var k = 0, i = gt.length - 1; while (i >= 0 && gt[i] === gt[gt.length - 1] && gt[i] < ROWS) { k++; i--; } return k; }
  var gapMax = Math.max(2, Math.min(lim.gapRun - 1, Math.round(2 + diff * (lim.gapRun - 2.5))));
  var upMax = Math.max(1, Math.min(2, lim.up - 2));
  function ph1() { return r(); }
  // a basin is dug BELOW the ledge row gTop: solid floor, the neighbouring ledge columns are its side walls, exit steps rise to the far ledge; water fills exactly up to the ledge level
  function basin(gTop, D, inner, tileT) {
    var c0 = gt.length, f = gTop + D, i2, q, s;
    for (i2 = 0; i2 < inner; i2++) gt.push(f);
    for (s = 1; s <= D - 1; s++) { gt.push(f - s); gt.push(f - s); }
    var end = gt.length;
    for (var c = c0; c < end; c++) for (q = gTop; q < gt[c]; q++) tl.push([c, q, tileT || T.WATER]);
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
    var d = diff, w = { flat: 3, gap: 1.5 + 2 * d, stairs: 1.2, hurdle: 1.5 + d, spikes: nn >= 2 ? 0.5 + 1.5 * d : 0, islands: nn >= 2 ? 0.5 + d : 0, mover: nn >= 3 ? 0.4 + 1.2 * d : 0, vmover: 0, orbit: 0, falling: 0, hills: nn >= 2 ? 1.4 : 0, flood: 0, conv: 0, cannon: nn >= 4 ? 0.3 + 0.6 * d : 0, plant: nn >= 3 ? 0.3 + 0.6 * d : 0, crush: 0, ghost: 0, spring: 0.25, vine: 0.25, psw: 0.3, ring: 0.3, wind: nn >= 4 ? 0.25 : 0, updraft: nn >= 4 ? 0.2 : 0, cloud: nn >= 4 ? 0.25 : 0, keydoor: nn >= 5 ? 0.2 : 0, sgate: nn >= 5 ? 0.15 : 0, split: nn >= 2 ? 0.9 : 0 };
    if (nn >= 3 && kind !== 'flood') w.flood = 0.6;
    var KT = KIND_TABLE[kind];
    if (KT) { for (var k0 in w) w[k0] = 0; w.flat = 1; for (var k1 in KT) w[k1] = KT[k1]; if (KT.spikes === undefined && nn >= 2) w.spikes = 0.4; if (kind === 'chase') { w.islands = 0; } }
    if (kind === 'hills') { w.hills = 4; w.flat = 2; }
    if (kind === 'flood') { w.flood = 4; w.hills = 0.6; w.gap = 1; w.wind = 0; w.updraft = 0; w.cloud = 0; }
    if (kind === 'ghost') { w.ghost = 2.2; w.islands += 0.7; w.spikes += 0.6; w.cannon = 0; w.ring = 0.5; }
    if (kind === 'sky') { w.flat = 1; w.gap = 3; w.islands = 2.5; w.mover = 1.2; w.vmover = 1.2; w.orbit = 1.5; w.falling = 1.5; w.stairs = 0.5; w.hurdle = 0.3; w.spring = 0.6; w.cannon = 0.4; w.wind = 1.3; w.updraft = 1.0; w.cloud = 1.6; w.flood = 0; }
    if (kind === 'cave') { w.conv = 3; w.cannon = 0.8; w.plant = 0.5; w.hills = 0.8; }
    if (castle) { w.keydoor = 1.0; w.sgate = 0.8; w.cloud = 0.3; w.wind = 0; w.updraft = 0; w.flood = 0; w.gap = 2.5; w.crush = 2 + d; w.cannon = 1.2; w.conv = 1; w.orbit = 0.8; w.falling = 0.6; w.mover = 0.6; w.islands = 0.6; w.plant = 0.6; w.spring = 0; w.vine = 0; w.psw = 0; w.ring = 0; }
    if (kind === 'bonus') { w.spring = 0.8; w.ring = 0; }
    if (kind === 'volcano') w.lava = 2.4; if (kind === 'factory' || kind === 'neon') w.lava = 0.8; if (castle) w.lava = 0.7; if (kind === 'swamp') w.poison = 2.2; if (kind === 'flood') w.poison = 0.6; if (nn >= 5 && (kind === 'plain' || kind === 'hills' || kind === 'jungle')) w.poison = 0.45;
    if (o.only) { for (var kk in w) w[kk] = (kk === 'flat' ? 2 : kk === o.only ? 4 : 0); }
    if (castle) w.split = 0.3;
    if (room) { for (var k in w) w[k] = 0; w.flat = 3; w.gap = 1; w.hurdle = 1; w.islands = 0.6; w.stairs = 0.5; }
    ['ice', 'mud', 'fire', 'lava', 'poison', 'split', 'keydoor', 'sgate', 'cloud', 'updraft', 'wind', 'ring', 'psw', 'vine', 'spring', 'ghost', 'crush', 'plant', 'cannon', 'conv', 'flood', 'hills', 'falling', 'orbit', 'vmover', 'mover'].forEach(function (nm) { if (!(w[nm] >= 0)) w[nm] = 0; });   // a missing weight used to make the whole sum NaN: every stage then picked only plain floor (and the water pools / fish vanished)
    return w;
  }
  var names = ['flat', 'gap', 'stairs', 'hurdle', 'spikes', 'islands', 'mover', 'vmover', 'orbit', 'falling', 'hills', 'flood', 'conv', 'cannon', 'plant', 'crush', 'ghost', 'spring', 'vine', 'psw', 'ring', 'wind', 'updraft', 'cloud', 'keydoor', 'sgate', 'split', 'ice', 'mud', 'fire', 'lava', 'poison'];
  var guard = 0, endReserve = castle ? 40 : 26, prevCk = '';
  while (gt.length < W - endReserve && guard++ < 500) {
    if (cpCol < 0 && gt.length >= W / 2) { var cb = flat(7, g); cpCol = cb + 3; continue; }
    var wts = weights(), tot = 0, i; for (i = 0; i < names.length; i++) tot += wts[names[i]];
    var x = r() * tot, k = 0; while (k < names.length - 1 && x >= wts[names[k]]) { x -= wts[names[k]]; k++; }
    var ck = names[k];
    if (wantSecret && ringCount === 0 && gt.length >= W * 0.25 && !castle) ck = 'ring';
    markHaz(); var sr = safeRunway(); if (sr < 4) { if (gt[gt.length - 1] === g) flat(4 - sr, g); else flat(4, g); }
    var wallBefore = (ck === 'poison' && prevCk === 'flood') || (ck === 'flood' && prevCk === 'poison'); prevCk = ck;
    if (wallBefore) { var wgh = g - 2 < 7 ? g - 1 : g - 2; flat(2, g); flat(2, wgh); flat(2, g); }   // water and poison never touch: a wall always stands between them
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
    else if (ck === 'lava' || ck === 'poison') {   // a liquid river crossed on stone steps; embers leap out of the lava (fire-proof), fish out of the poison (killable)
      var isL = ck === 'lava', ks = rnd(2, 3), gsz = rnd(2, 3), cur2 = gt.length, jl = [];
      flat(3, g); cur2 = gt.length;
      for (var sI = 0; sI <= ks; sI++) {
        for (i2 = 0; i2 < gsz; i2++) { var cl = gt.length; gt.push(isL ? ROWS : ROWS - 1); for (q = g; q < (isL ? ROWS : ROWS - 1); q++) tl.push([cl, q, isL ? T.LAVA : T.POISON]); if (i2 === (gsz >> 1)) jl.push(cl); }
        if (sI < ks) { var st0c = flat(2, g); coinsX.push({ x: (st0c + 1) * TS, y: (g - 1.6) * TS }); }
      }
      jl.forEach(function (cl2) { var per = rnd(110, 170), hg = rnd(34, 58); enemiesX.push(isL ? { t: E.EMBER, x: cl2 * TS + 2, y: g * TS, w: 12, h: 12, ax: cl2 * TS + 2, by: g * TS, per: per, pho: rnd(0, per), hgt: hg, up: 1, hid: true, spd: 0 } : { t: E.LEAPFISH, poison: 1, x: cl2 * TS + 2, y: g * TS, w: 14, h: 9, ax: cl2 * TS + 2, by: g * TS, per: per, pho: rnd(0, per), hgt: hg, up: 1, hid: true, spd: 0 }); });
      flat(4, g);
    }
    else if (ck === 'flood') {
      while (g > 9) { g--; flat(2, g); } flat(3, g);
      var D = Math.min(4, 13 - g), inner = rnd(12, 18), bs = basin(g, D, inner), f = bs.f, wdn = D;
      var px = bs.c0 + 3, pill = {}; while (px < bs.c0 + inner - 3) { var ph2 = rnd(1, Math.max(1, D - 2)); if (r() < 0.7) { for (q = 1; q <= ph2; q++) tl.push([px, f - q, T.SOLID]); pill[px] = 1; } else { tl.push([px, f - 1, T.SPIKE]); pill[px] = 1; } px += rnd(4, 6); }
      for (i2 = 0; i2 < 4; i2++) coinsX.push({ x: (bs.c0 + 3 + i2 * (inner - 6) / 3) * TS + 8, y: (g + 1.5) * TS });
      if (r() < 0.55 && inner >= 14) { var cs0 = bs.c0 + rnd(3, inner - 9), csl = rnd(4, 6), ct = r() < 0.5 ? T.CURL : T.CURR; for (i2 = 0; i2 < csl; i2++) for (q = g; q < f; q++) if (!pill[cs0 + i2]) tl.push([cs0 + i2, q, ct]); }
      if (r() < 0.35 && inner >= 12) { var cu0 = bs.c0 + rnd(4, inner - 6); for (i2 = 0; i2 < 2; i2++) for (q = g; q < f; q++) if (!pill[cu0 + i2]) tl.push([cu0 + i2, q, T.CURU]); }
      for (var pc = bs.c0 + 4; pc < bs.c0 + inner - 2; pc += 7) if (!pill[pc]) pockets.push({ x: pc * TS + 8, y: (g + 1.5) * TS });
      if (!room) { waterLife(bs.c0, inner, g, D, pill); if (diff > 0.15 && r() < 0.6) { var lc = bs.c0 + rnd(4, Math.max(4, inner - 5)), lper = rnd(120, 180); enemiesX.push({ t: E.LEAPFISH, x: lc * TS + 1, y: g * TS, w: 14, h: 9, ax: lc * TS + 1, by: g * TS, per: lper, pho: rnd(0, lper), hgt: rnd(30, 50), up: 1, hid: true, spd: 0 }); } }
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
    else if (ck === 'ice') {   // slippery floor with icicle spikes
      len = rnd(9, 13); c0 = flat(len, g); for (i2 = 0; i2 < len; i2++) tl.push([c0 + i2, g, T.ICE]); usedIce = true;
      for (q = 0; q < rnd(1, 2); q++) tl.push([c0 + rnd(4, len - 5), g - 1, T.SPIKE]); flats.push({ c: c0, len: len, g: g, noEn: len < 10 });
    }
    else if (ck === 'mud') {   // a bog: slow mud inside a basin (solid floor, the ledges are its walls)
      while (g > 11) { g--; flat(2, g); } flat(3, g); var mi = rnd(4, 7), bm = basin(g, 2, mi, T.MUD); usedMud = true;
      for (q = 0; q < mi; q++) if (r() < 0.5) coinsX.push({ x: (bm.c0 + q) * TS + 8, y: (g - 2) * TS + 8 }); flat(3, g);
    }
    else if (ck === 'fire') {  // timed fire jets / lasers on the floor: cross while they are off
      len = 13; c0 = flat(len, g); for (q = 0; q < rnd(2, 3); q++) tl.push([c0 + 3 + q * 3, g - 1, T.FIRE]); usedFire = true; flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    else if (ck === 'split') {   // a fork inside the stage: a low route along the floor (spikes, a hurdle) and a high route over floating slabs; both merge on the far side
      len = 15; c0 = flat(len, g); for (q = 4; q < 6; q++) tl.push([c0 + q, g - 1, T.SPIKE]); tl.push([c0 + 10, g - 1, T.SOLID]);
      for (q = 2; q < 6; q++) tl.push([c0 + q, g - 5, T.SOLID]); for (q = 8; q < 12; q++) tl.push([c0 + q, g - 5, T.SOLID]); tl.push([c0 + 6, g - 5, T.QC]); tl.push([c0 + 7, g - 5, T.QC]);
      for (q = 0; q < 4; q++) { coinsX.push({ x: (c0 + 2.5 + q) * TS, y: (g - 6) * TS + 8 }); coinsX.push({ x: (c0 + 8.5 + q) * TS, y: (g - 6) * TS + 8 }); }
      flats.push({ c: c0, len: len, g: g, noEn: true });
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
  var goalCol, poleCol, bossDef = null, bossDef2 = null, arenaC0 = 0; var bossItems = [], shellPassF = false;
  if (castle && !room) {
    var bv = o.boss !== undefined ? o.boss : (n + hash(seed, n, 5)) % 5, bx;
    if (bv === 3 && !isRush) {   // flooded arena: a deep basin whose walls are the ledges, exit steps lead to the gate
      while (g > 9) { g--; flat(2, g); } flat(6, g);
      var ba = basin(g, 4, 22); arenaC0 = ba.c0; flat(5, g); bx = (arenaC0 + 14) * TS;
      bossDef = { t: E.BOSS, v: 3, x: bx, y: (g + 1.3) * TS, w: 30, h: 18, spd: 0, mn: (arenaC0 + 1) * TS, mx: (arenaC0 + 22) * TS, ax: (arenaC0 + 12) * TS, ay: (g + 1.3) * TS, dir: -1 };
      pockets.push({ x: (arenaC0 + 6) * TS, y: (g + 1.5) * TS }); pockets.push({ x: (arenaC0 + 16) * TS, y: (g + 1.5) * TS });
      poleCol = gt.length - 3; goalCol = poleCol;
    } else {
      flat(6, g); var AL = isRush ? 44 : 26; arenaC0 = flat(AL, g); flat(3, g); bx = (arenaC0 + 16) * TS;
      function mkBoss(v2, bxx) { var b2 = { t: E.BOSS, v: v2, x: bxx, y: g * TS - 26, w: 28, h: 26, spd: 0, mn: (arenaC0 + 1) * TS, mx: (arenaC0 + AL - 1) * TS, ax: bxx - 2 * TS, ay: (g - 4) * TS - 6, dir: -1 }; if (v2 === 4) { b2.w = 28; b2.h = 22; b2.ay = (g - 5) * TS; b2.y = b2.ay; } return b2; }
      bossDef = mkBoss(bv === 3 ? 0 : bv, bx); if (isRush) bossDef2 = mkBoss([0, 1, 2, 4][(bv + 2) % 4] === bossDef.v ? [0, 1, 2, 4][(bv + 3) % 4] : [0, 1, 2, 4][(bv + 2) % 4], (arenaC0 + 30) * TS);
      // armoured boss: stomping only bounces, it has to be hit by a kicked shell (beetles waiting at the arena entrance) or by fireballs (flowers waiting before it)
      var imm = o.bossimm !== undefined ? o.bossimm : (!isRush && (n + hash(seed, n, 9)) % 3 === 0 ? (hash(seed, n, 10) % 2 ? 'shell' : 'fire') : '');
      if (imm === 'shell' && bossDef.v !== 0) imm = 'fire';
      if (imm && !isRush) {
        bossDef.imm = 1; bossDef.immKind = imm;
        if (imm === 'shell') { shellPassF = true; for (var bq = 0; bq < 4; bq++) enemiesX.push({ t: E.BEETLE, x: (arenaC0 + 1 + bq * 2) * TS, y: g * TS - 13, w: 12, h: 13, spd: 0.4, dir: bq % 2 ? -1 : 1, mn: arenaC0 * TS, mx: (arenaC0 + 9) * TS }); }
        else { bossItems.push({ k: 1, x: (arenaC0 - 4) * TS + 2, y: g * TS - 12 }); bossItems.push({ k: 1, x: (arenaC0 + 1) * TS + 2, y: g * TS - 12 }); }
      }
      poleCol = arenaC0 + AL - 2; goalCol = poleCol;
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
  var hasBeetle = nn >= 3;
  flats.forEach(function (f, fi) {
    var mid = f.c + f.len / 2;
    if (!room && f.len >= 8 && !f.noEn && r() < 0.5) {   // block cluster
      var m = rnd(3, Math.min(5, f.len - 4)), bc = f.c + 2 + rnd(0, f.len - 4 - m);
      for (var j = 0; j < m; j++) { var t = r() < 0.5 ? T.BRICK : T.QC; if (needPow && j === (m >> 1)) { t = T.QP; needPow = false; } else if (r() < 0.08) t = T.QP; else if (r() < 0.03) t = T.QS; else if (r() < 0.02 && nn >= 3) t = T.QM; put(bc + j, f.g - 4, t); }
      if (r() < 0.5) for (j = 0; j < m; j++) pushCoin((bc + j) * TS + 8, (f.g - 6) * TS + 8);
    } else if (r() < 0.5) { var cn = rnd(3, 5); for (var j2 = 0; j2 < cn; j2++) { var berry = nn >= 3 && r() < 0.25; pushCoin((mid - cn / 2 + j2 + 0.5) * TS, (f.g - 2) * TS + 8 - Math.sin(Math.PI * (j2 + 0.5) / cn) * 12, berry); } }
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
  if (bossDef) enemies.push(bossDef); if (bossDef2) enemies.push(bossDef2);
  // ---- five special collectibles: spread over the level on arcs / floating spots
  var cand = spots.slice(); arcs.forEach(function (a2) { cand.push({ x: (a2.c + a2.w / 2) * TS + 8, y: (a2.g - 3.2) * TS }); }); flats.forEach(function (f) { cand.push({ x: (f.c + f.len / 2) * TS, y: (f.g - 3) * TS }); });
  cand.sort(function (u, v) { return u.x - v.x; });
  if (!room) { for (var si = 0; si < 5 && cand.length; si++) { var pick = cand[Math.min(cand.length - 1, Math.floor((si + 0.5) * cand.length / 5))]; specials.push({ x: pick.x, y: pick.y }); } }
  var gy = function (col) { return gt[col] * TS; };
  var eggC = -1; if (!room && nn >= 2) { for (var ec = Math.floor(W * 0.3); ec < W - 12 && eggC < 0; ec++) if (gt[ec] < 14 && gt[ec] === gt[ec - 1] && gt[ec] === gt[ec + 1] && gt[ec] === gt[ec + 2]) eggC = ec; }
  var L = { items: bossItems, shellPass: shellPassF, egg: eggC >= 0 ? { x: eggC * TS + 2, y: gt[eggC] * TS - 14 } : null, seed: seed, n: n, kind: isCannon ? 'cannon' : kind, attempt: a, diff: diff, w: W, tiles: tiles, gt: gt, coins: coins, special: specials, enemies: enemies, movers: movers, cannons: cannons, rings: rings, winds: winds, pockets: pockets, keys: keysL, doors: doorsL, switches: switchesL, tele: [], launch: [], grp: grpA, route: routeL.concat([{ k: 'goal', x: poleCol * TS + 6, y: null }]), puzzle: routeL.length > 0, goalX: poleCol * TS + 6, poleCol: poleCol, poleY: gy(poleCol),
    start: { x: 3 * TS + 2, y: gy(3) - P.SH }, cp: { x: cpCol * TS + 2, y: gy(cpCol) - P.SH }, time: (castle ? 150 : 90) + Math.floor(W * 0.6), kindAsked: kindAsked, theme: KIND_THEME[isCannon ? 'sky' : kind] | 0, hasIce: usedIce, hasMud: usedMud, hasFire: usedFire, room: room, hasBoss: !!bossDef };
  L.rings.forEach(function (rg) { rg.out = { x: rg.c * TS + 2, y: rg.y - P.SH }; });
  if (castle && bossDef) L.arena = { c0: arenaC0, c1: arenaC0 + 26 };
  if (kind === 'chase') L.chase = { x0: L.start.x - 130, v: 0.5 + 0.35 * diff, delay: 150 };
  return L;
}
// ------------------------------------------------------------------ maze / puzzle levels: rooms joined by locked doors, switch gates, teleport pads, launch barrels and water-rise walls
function buildMaze(seed, n, a) {
  var nn = effN(n);
  var r = rng(hash(seed, n, a * 7919 + 3)), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3; if (a >= 9) diff = 0;
  var g = 12, rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  var gt = [], tl = [], gl = [], coins = [], enemies = [], keys = [], doors = [], switches = [], tele = [], launch = [], movers = [], pockets = [], route = [], cannons = [];
  var nRooms = Math.min(6, 3 + Math.floor(diff * 2.4 + r() * 1.3)), nConn = nRooms - 1, types = [], i, bit = 0, teleN = 0, doorColor = 0;
  function flat(len, gg) { var c0 = gt.length; for (var k = 0; k < len; k++) gt.push(gg); return c0; }
  // ---- choose the connector types; a "fork" (hub with teleport pads into a key side-room and a dead end) forces a door next
  for (i = 0; i < nConn; i++) { var opts = ['door', 'gate']; if (nn >= 2) opts.push('tele'); if (diff > 0.15 || nn >= 3) opts.push('launch'); types.push(opts[Math.floor(r() * opts.length)]); }
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
function wetTile(t) { return t === T.POISON || t === T.WATER || (t >= 22 && t <= 24) || t === T.WLEVEL || t === T.LAVA || t === T.MUD; }
function checkContainment(L) {
  var bad = [], w = L.w, R = L.rows || ROWS, tiles = L.tiles, solid = PF.SOL;
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
// ------------------------------------------------------------------ labyrinths: a real grid maze of cells (tunnels with stair-shafts between floors), and an auto-scrolling maze of sky platforms
function buildGrid(seed, n, a, variant) {
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 21)), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, CW = 12, CH = 8;
  var GW = 5 + Math.floor(diff * 3.2) + (variant === 'ghost' ? 1 : 0), GH = 3 + Math.floor(diff * 2.6);
  var W = GW * (CW + 1) + 1, rows = GH * (CH + 1) + 3, tiles = new Uint8Array(W * rows), i, j;
  var put = function (c, rr, t) { if (c >= 0 && c < W && rr >= 0 && rr < rows) tiles[c * rows + rr] = t; };
  for (i = 0; i < tiles.length; i++) tiles[i] = T.SOLID;
  var X0 = function (ci) { return 1 + ci * (CW + 1); }, FR = function (cj) { return cj * (CH + 1) + CH + 1; };
  for (j = 0; j < GH; j++) for (i = 0; i < GW; i++) for (var c = 0; c < CW; c++) for (var q = 0; q < CH; q++) put(X0(i) + c, FR(j) - CH + q, 0);
  // ---- random spanning tree (depth-first) over the cell grid; each edge is a door (side by side) or a stair-shaft (stacked)
  var key = function (ci, cj) { return ci + ',' + cj; }, adj, edges, seen, bestT = null;
  function tree() {
    seen = {}; adj = {}; edges = []; var st = [[0, GH - 1]]; seen[key(0, GH - 1)] = 1; adj[key(0, GH - 1)] = [];
    while (st.length) {
      var cur = st[st.length - 1], nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function (d) { var x = cur[0] + d[0], y = cur[1] + d[1]; return x >= 0 && y >= 0 && x < GW && y < GH && !seen[key(x, y)]; });
      if (!nb.length) { st.pop(); continue; }
      var d = nb[Math.floor(r() * nb.length)], nx = cur[0] + d[0], ny = cur[1] + d[1];
      seen[key(nx, ny)] = 1; adj[key(nx, ny)] = [key(cur[0], cur[1])]; adj[key(cur[0], cur[1])].push(key(nx, ny)); edges.push([cur[0], cur[1], nx, ny]); st.push([nx, ny]);
    }
  }
  function diam() { function f(s0) { var ds = {}, q0 = [s0], l = s0; ds[s0] = 0; while (q0.length) { var u0 = q0.shift(); if (ds[u0] > ds[l]) l = u0; adj[u0].forEach(function (v) { if (ds[v] === undefined) { ds[v] = ds[u0] + 1; q0.push(v); } }); } return [l, ds[l]]; } return f(f(key(0, GH - 1))[0])[1]; }
  for (var tt = 0; tt < 12; tt++) { tree(); var dm = diam(); if (!bestT || dm > bestT.dm) bestT = { dm: dm, adj: adj, edges: edges }; }   // the tree with the longest route
  adj = bestT.adj; edges = bestT.edges;
  // an extra loop or two (more than one route) on bigger mazes
  var extra = Math.round(GW * GH * (0.1 + 0.12 * diff));
  for (var xt = 0; extra > 0 && xt < 200; xt++) { var ei = rnd(0, GW - 2), ej = rnd(0, GH - 1), k1 = key(ei, ej), k2 = key(ei + 1, ej); if (adj[k1].indexOf(k2) < 0) { adj[k1].push(k2); adj[k2].push(k1); edges.push([ei, ej, ei + 1, ej]); extra--; } }
  var hasUp = {}, hasDown = {}, einfo = {};
  edges.forEach(function (e) {
    if (e[1] === e[3]) {   // door through the wall, three tiles high at the floor
      var wx = X0(Math.min(e[0], e[2])) + CW, fr = FR(e[1]); for (var q2 = 1; q2 <= 3; q2++) put(wx, fr - q2, 0);
    } else {               // shaft: a hole in the upper cell's floor, stair ledges rising to it in the lower cell
      var up = Math.min(e[1], e[3]), lo = Math.max(e[1], e[3]), ci = e[0], x0 = X0(ci), frL = FR(lo), m = r() < 0.5;
      var mc = function (cc) { return m ? x0 + cc : x0 + CW - 1 - cc; };
      put(mc(1), FR(up), 0); put(mc(2), FR(up), 0);
      for (var s = 0; s < 3; s++) { var rowS = frL - 6 + s * 2, c0s = s === 0 ? 1 : 2 * s + 4, c1s = s === 0 ? 5 : 2 * s + 5; for (var cc = c0s; cc <= c1s; cc++) put(mc(cc), rowS, T.SOLID); }
      hasUp[key(ci, lo)] = 1; hasDown[key(ci, up)] = 1;
      einfo[key(ci, up) + '>' + key(ci, lo)] = einfo[key(ci, lo) + '>' + key(ci, up)] = { mc: mc, frL: frL };
    }
  });
  // ---- a net of routes: upper windows through the walls (ledge on both sides) and bricks scattered in the air, so the walkable graph is a mesh, not only the tree
  for (j = 0; j < GH; j++) for (i = 0; i < GW; i++) {
    var kc = key(i, j), x0c = X0(i), frc = FR(j);
    if (hasUp[kc] || hasDown[kc]) continue;
    if (i < GW - 1 && !hasUp[key(i + 1, j)] && !hasDown[key(i + 1, j)] && r() < 0.5 + 0.2 * diff) {   // window in the right wall at rows fr-5..fr-4, ledges (rows fr-3) on both sides
      var wc = x0c + CW; put(wc, frc - 4, 0); put(wc, frc - 5, 0);
      for (var q6 = 1; q6 <= 3; q6++) { put(wc - q6, frc - 3, T.SOLID); put(wc + q6, frc - 3, T.SOLID); }
    }
    var nb2 = rnd(1, 3); for (var bq = 0; bq < nb2; bq++) { var bl2 = rnd(2, 4), bc2 = x0c + rnd(3, CW - 3 - bl2), br2 = frc - rnd(4, 7); for (var q7 = 0; q7 < bl2; q7++) put(bc2 + q7, br2, T.SOLID); }
  }
  // ---- far end by breadth-first distance from the start cell
  function bfs(s0) { var ds = {}, q0 = [s0], fr0 = s0, pv = {}; ds[s0] = 0; while (q0.length) { var u0 = q0.shift(); if (ds[u0] > ds[fr0]) fr0 = u0; adj[u0].forEach(function (v) { if (ds[v] === undefined) { ds[v] = ds[u0] + 1; pv[v] = u0; q0.push(v); } }); } return { far: fr0, prev: pv, dist: ds }; }
  var sk = bfs(key(0, GH - 1)).far, b1 = bfs(sk), far = b1.far, prev = b1.prev, dist = b1.dist;   // start and goal are the two ends of the longest route
  var path = [far]; while (path[0] !== sk) path.unshift(prev[path[0]]);
  var coins = [], enemies = [], specials = [], used = {};
  path.forEach(function (k) { used[k] = 1; });
  Object.keys(adj).forEach(function (k) {
    var p2 = k.split(','), ci = +p2[0], cj = +p2[1], x0 = X0(ci), fr = FR(cj), onPath = !!used[k], isStart = k === sk, isGoal = k === far, special = !onPath && adj[k].length === 1;
    var safe = !hasUp[k] && !hasDown[k] && !isStart && !isGoal;
    for (var q3 = 0; q3 < 3; q3++) coins.push({ x: (x0 + 4 + q3) * TS + 8, y: (fr - 2) * TS, b: 0 });
    if (special && specials.length < 5) specials.push({ x: (x0 + 6) * TS, y: (fr - 3) * TS });
    if (safe && r() < 0.25 + 0.5 * diff) put(x0 + 6, fr - 1, T.SPIKE);
    if (safe && r() < 0.3 + 0.4 * diff) enemies.push({ t: E.WALKER, x: (x0 + 8) * TS, y: fr * TS - 12, w: 12, h: 12, spd: 0.4 + 0.3 * r(), dir: r() < 0.5 ? -1 : 1, mn: (x0 + 7) * TS, mx: (x0 + CW - 1) * TS });
    if (!isStart && !isGoal && r() < (variant === 'ghost' ? 0.55 : 0.2) + 0.2 * diff) enemies.push({ t: variant === 'ghost' ? E.GHOST : E.FLYER, x: (x0 + 6) * TS, y: (fr - 5) * TS, w: 14, h: 12, ax: (x0 + 6) * TS, ay: (fr - 5) * TS, rg: 28, sp: 1 / (200 + r() * 100), ph: r(), am: 8, spd: 0 });
  });
  var sp = k2c(sk), gl = k2c(far), cpk = path[Math.floor(path.length / 2)], cpc = k2c(cpk);
  function k2c(k) { var p3 = k.split(','); return { ci: +p3[0], cj: +p3[1] }; }
  var gx = (X0(gl.ci) + 6) * TS, gy = FR(gl.cj) * TS, wps = [];
  for (var pi = 1; pi < path.length; pi++) {
    var ca = k2c(path[pi - 1]), cb = k2c(path[pi]);
    if (cb.cj > ca.cj) { /* falling down the hole: just land in the lower cell */ }
    else if (cb.cj < ca.cj) { var ei2 = einfo[path[pi - 1] + '>' + path[pi]]; for (var s2 = 2; s2 >= 0; s2--) { var rowS2 = ei2.frL - 6 + s2 * 2, c0q = s2 === 0 ? 1 : 2 * s2 + 4, c1q = s2 === 0 ? 2 : 2 * s2 + 5; wps.push({ k: 'at', x: (ei2.mc(c0q) + ei2.mc(c1q) + 1) / 2 * TS, y: rowS2 * TS - 7 }); } }
    if (pi < path.length - 1 || true) wps.push({ k: 'at', x: (X0(cb.ci) + 6) * TS, y: FR(cb.cj) * TS - 7 });
  }
  wps.pop();
  var kind = variant === 'ghost' ? 'ghost' : 'maze';
  return { seed: seed, n: n, kind: kind, attempt: a, diff: diff, w: W, rows: rows, tiles: tiles, gt: new Array(W).fill(rows - 2), coins: coins, special: specials, enemies: enemies, movers: [], cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * rows),
    route: wps.concat([{ k: 'goal', x: gx, y: gy - 10 }]), puzzle: true, vertical: true, goalRect: { x: gx - 8, y: gy - 4 * TS, w: 16, h: 4 * TS }, goalX: gx, poleCol: Math.floor(gx / TS), poleY: gy,
    start: { x: (X0(sp.ci) + 3) * TS + 2, y: FR(sp.cj) * TS - P.SH }, cp: { x: (X0(cpc.ci) + 3) * TS + 2, y: FR(cpc.cj) * TS - P.SH }, time: 200 + GW * GH * 25, theme: variant === 'ghost' ? 2 : 5, room: false, hasBoss: false, kindAsked: kind, hasFire: false, hasIce: false, hasMud: false, maze: 'grid' };
}
// sky labyrinth: platforms floating over a void, forks with dead ends and loops, the screen's death wall chases from the left (auto-scroll)
function buildSkyMaze(seed, n, a, air) {
  var fly = air === 'fly'; air = !!air;   // fly: the 'flystep' variant - the gaps are crossed by stomping hovering flyers (each can be used once), validated with the enemies switched on
   // air: the 'aircourse' variant - no ordinary platforms at all, every gap is crossed on a moving block / ring / lift

  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 31)), lim = probe(), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, rows = 26, W = 96 + Math.round(diff * 30), tiles = new Uint8Array(W * rows);
  var put = function (c, rr, t) { if (c >= 0 && c < W && rr >= 0 && rr < rows) tiles[c * rows + rr] = t; };
  var maxUp = Math.max(1, Math.min(3, lim.up - 1)), maxGap = Math.max(2, Math.min(5, lim.gapRun - 2)), coins = [], enemies = [], plats = [], specials = [];
  function plat(c, len, rw) { for (var q = 0; q < len; q++) { put(c + q, rw, T.SOLID); if (q === 0 || q === len - 1) put(c + q, rw + 1, T.SOLID); } var p = { c: c, len: len, row: rw }; plats.push(p); for (var q2 = 0; q2 < Math.min(3, len - 1); q2++) coins.push({ x: (c + 1 + q2) * TS + 8, y: (rw - 1.5) * TS, b: 0 }); return p; }
  var main = plat(2, 8, 15), cur = main, forkN = 0, chain = [];
  function nextFrom(p, dir) {   // a platform reachable from p
    var len = rnd(4, 7), dy = dir === 'up' ? -rnd(1, maxUp) : dir === 'down' ? rnd(2, 6) : rnd(-maxUp, 2), rw = Math.max(6, Math.min(21, p.row + dy));
    var gap = rnd(1, maxGap - (dy < -1 ? 1 : 0)); return { c: p.c + p.len + gap, len: len, row: rw };
  }
  var movers = [], maces = [], fancy = a >= 3 ? 0 : (a >= 2 ? 0.12 : 0.3 + 0.3 * diff), sinceSp = 9;
  function addMover(m) { movers.push(m); return movers.length - 1; }
  // a connector between platform cu and the next one: returns the next platform's placement, or null for an ordinary gap
  function connector(cu, kindSel) {
    var cE = (cu.c + cu.len) * TS, y0 = cu.row * TS, G, nx2, ids;
    switch (kindSel) {
      case 'fly': { var kf = rnd(1, 2 + (diff > 0.5 ? 1 : 0)); G = 4 * kf + 3 + (kf > 1 ? 0 : 1); nx2 = { c: cu.c + cu.len + G, len: rnd(3, 5), row: Math.max(7, Math.min(20, cu.row + rnd(-1, 1))) }; for (var qf = 1; qf <= kf; qf++) { var fx = cE + G * TS * qf / (kf + 1), fy = (cu.row + (nx2.row - cu.row) * qf / (kf + 1)) * TS + 2 + rnd(0, 1) * TS; enemies.push({ t: E.FLYER, x: fx, y: fy, w: 14, h: 10, ax: fx, ay: fy, rg: rnd(14, 26), sp: 1 / 320, ph: r(), am: 0, spd: 0 }); } break; }
      case 'h': { G = rnd(8, 11); nx2 = { c: cu.c + cu.len + G, len: rnd(3, 5), row: cu.row + rnd(-1, 1) }; var amH = G * TS / 2 - 22; addMover({ kind: 0, cx: cE + G * TS / 2, y: y0, w: 40, amp: amH, per: [360, 480, 720][rnd(0, 2)], ph: 0 }); break; }
      case 'v': { var dhv = rnd(4, 6), up = r() < 0.65; G = 3; nx2 = { c: cu.c + cu.len + G, len: rnd(3, 5), row: cu.row + (up ? -dhv : dhv) }; addMover({ kind: 1, cx: cE + 1.5 * TS, y: y0 + (up ? -dhv : dhv) * TS / 2, w: 40, amp: dhv * TS / 2, per: [480, 720][rnd(0, 1)], ph: 0 }); break; }
      case 'ctrl': G = rnd(7, 10); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row + rnd(-1, 0) }; var nS = nx2.c * TS, am = (nS - cE) / 2 - 22; addMover({ kind: 5, cx: (cE + nS) / 2, y: y0, w: 40, amp: am, ox0: -am, per: 1, ph: 0 }); break;
      case 'ctrlv': { var dh = rnd(5, 8); G = 3; nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row - dh }; addMover({ kind: 6, cx: cE + 1.5 * TS, y: y0 - dh * TS / 2, w: 40, amp: dh * TS / 2, per: 1, ph: 0, off0: dh * TS / 2 }); break; }
      case 'ring': G = rnd(9, 11); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; var R = G * TS / 2 - 18; for (var q = 0; q < 4; q++) addMover({ kind: 2, cx: cE + G * TS / 2, y: y0, w: 32, amp: R, per: 480, ph: q * Math.PI / 2 }); break;
      case 'bounce': G = rnd(10, 13); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; for (var q2 = 1; q2 <= 2; q2++) addMover({ kind: 8, cx: cE + G * TS * q2 / 3, y: y0 + 2 * TS, w: 30, amp: 0, per: 1, ph: 0 }); break;
      case 'sink': G = rnd(9, 11); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; var ns = 3; for (var q3 = 1; q3 <= ns; q3++) addMover({ kind: 9, cx: cE + G * TS * q3 / (ns + 1), y: y0, w: 28, amp: 46, per: 1, ph: 0 }); break;
      case 'rise': { var dh2 = rnd(5, 7); G = 3; nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row - dh2 }; addMover({ kind: 10, cx: cE + 1.2 * TS, y: y0, w: 34, amp: dh2 * TS, per: 1, ph: 0 }); break; }
      case 'seesaw': G = 8; nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; var iA = addMover({ kind: 12, cx: cE + 1 + 18, y: y0, w: 36, amp: 28, per: 1, ph: 0 }), iB = addMover({ kind: 12, cx: (cu.c + cu.len + G) * TS - 1 - 18, y: y0, w: 36, amp: 28, per: 1, ph: 0 }); movers[iA].pair = iB; movers[iB].pair = iA; break;
      case 'ice': G = rnd(9, 11); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; for (var q5 = 1; q5 <= 2; q5++) addMover({ kind: 14, cx: cE + G * TS * q5 / 3, y: y0, w: 48, amp: 0, per: 1, ph: 0 }); break;
      case 'belt': { var up2 = r() < 0.7, dh3 = rnd(6, 9); G = 4; nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: Math.max(5, Math.min(21, cu.row + (up2 ? -dh3 : dh3))) }; var span = rows * TS + 64; for (var q4 = 0; q4 < 2; q4++) addMover({ kind: 13, cx: cE + 2 * TS, y: y0 + 32 + q4 * span / 2, y0: -32, w: 32, amp: 0, per: 1, ph: 0, sp: 0.7, dir: up2 ? -1 : 1, span: span }); break; }
    }
    return nx2;
  }
  var SP = (air && root.PF.AIR_SP) ? root.PF.AIR_SP : fly ? ['fly'] : air ? ['h', 'h', 'h', 'v', 'ring', 'sink', 'seesaw', 'ctrl', 'rise', 'ice', 'bounce', 'sink'] : ['ctrl', 'ring', 'bounce', 'sink', 'seesaw', 'rise', 'ctrlv', 'belt', 'ice'];
  while (cur.c + cur.len < W - 14) {
    var np, sp0 = null;
    if (air || (sinceSp >= 2 && r() < fancy)) { sp0 = SP[rnd(0, SP.length - 1)]; var nx3 = connector(cur, sp0); nx3.row = Math.max(5, Math.min(21, nx3.row)); if (nx3.c + nx3.len > W - 12) { movers = movers.slice(0, mvKeep(movers)); break; } np = plat(nx3.c, nx3.len, nx3.row); sinceSp = 0; }
    else {
      var dir = r() < 0.3 ? 'up' : r() < 0.35 ? 'down' : 'flat', nx = nextFrom(cur, dir);
      if (nx.c + nx.len > W - 12) break;
      np = plat(nx.c, nx.len, nx.row); sinceSp++;
      if (!air && r() < 0.4 + 0.3 * diff) {   // fork: a side branch from this platform on another height; it either dead-ends (coins / a bonus) or loops back
        var bdir = np.row > 14 ? 'up' : 'down', bp = np, bl = rnd(2, 4), bk;
        for (bk = 0; bk < bl; bk++) { var bn = nextFrom(bp, bk === 0 ? bdir : 'flat'); bn.c = Math.max(bn.c, bp.c + 2); if (bn.c + bn.len > cur.c + cur.len + 40 || bn.c + bn.len > W - 12) break; if (Math.abs(bn.row - np.row) < 2 && bn.c < np.c + np.len + 2) bn.row = np.row + (bdir === 'up' ? -5 : 5); bp = plat(bn.c, bn.len, Math.max(5, Math.min(21, bn.row))); }
        if (bk > 1 && specials.length < 5 && r() < 0.6) specials.push({ x: (bp.c + 2) * TS, y: (bp.row - 3) * TS });
        forkN++;
      }
    }
    cur = np; chain.push(np);
  }
  function mvKeep(m) { return m.length; }
  var goalP = plat(cur.c + cur.len + 3, 12, Math.max(8, Math.min(18, cur.row)));
  // rotating maces / fire bars over some platforms and in some gaps
  if (!fly) plats.forEach(function (p, k) { if (k > 1 && !p.pad && p.len >= 6 && r() < 0.15 + 0.35 * diff) { var kk = r(); if (kk < 0.5) maces.push({ cx: (p.c + p.len / 2) * TS, cy: p.row * TS - 62, len: 54, n: 1, swing: 1.0, per: 220 + rnd(0, 80), ph: r() * 6, w: 0 }); else if (kk < 0.8) maces.push({ cx: (p.c + p.len / 2) * TS, cy: p.row * TS - 30, len: 46, n: 5, per: 300 + rnd(0, 120), ph: r() * 6, dir: r() < 0.5 ? 1 : -1 }); else maces.push({ cx: (p.c + p.len / 2) * TS, cy: p.row * TS - 40, len: 36, n: 1, per: 200, ph: r() * 6, dir: r() < 0.5 ? 1 : -1 }); } });
  // bridge from the last platform if the final step is too far
  var bridgeRow = Math.max(goalP.row, cur.row);
  if (!fly) plats.forEach(function (p, k) { if (k > 2 && p.len >= 5 && r() < 0.15 + 0.4 * diff) enemies.push({ t: E.FLYER, x: (p.c + p.len / 2) * TS, y: (p.row - 4) * TS, w: 14, h: 10, ax: (p.c + p.len / 2) * TS, ay: (p.row - 4) * TS, rg: 28, sp: 1 / (220 + r() * 100), ph: r(), am: 8, spd: 0 }); else if (k > 2 && p.len >= 6 && r() < 0.3 + 0.3 * diff) enemies.push({ t: E.WALKER, x: (p.c + 1) * TS, y: p.row * TS - 12, w: 12, h: 12, spd: 0.4, dir: 1, mn: (p.c + 0.5) * TS, mx: (p.c + p.len - 0.5) * TS }); });
  while (specials.length < 5) { var pp = plats[Math.floor(r() * plats.length)]; specials.push({ x: (pp.c + 2) * TS, y: (pp.row - 3) * TS }); }
  var gx = (goalP.c + 6) * TS, gy = goalP.row * TS, start = { x: 4 * TS + 2, y: main.row * TS - P.SH }, mp = plats[Math.floor(plats.length / 2)];
  var gtv = []; for (var c = 0; c < W; c++) gtv.push(rows - 1);
  var L = { seed: seed, n: n, kind: fly ? 'flystep' : air ? 'aircourse' : 'skymaze', attempt: a, stepEn: fly, diff: diff, w: W, rows: rows, tiles: tiles, gt: gtv, coins: coins, special: specials, enemies: enemies, movers: movers, maces: maces, cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * rows),
    route: (air ? chain : []).map(function (p) { return { k: 'at', x: (p.c + p.len / 2) * TS, y: p.row * TS - 7 }; }).concat([{ k: 'goal', x: gx, y: gy - 10 }]), puzzle: true, vertical: true, goalRect: { x: gx - 8, y: gy - 4 * TS, w: 16, h: 4 * TS }, goalX: gx, poleCol: Math.floor(gx / TS), poleY: gy,
    start: start, cp: { x: (mp.c + 1) * TS, y: mp.row * TS - P.SH }, time: 220 + Math.floor(W * 0.8), theme: 1, room: false, hasBoss: false, kindAsked: fly ? 'flystep' : air ? 'aircourse' : 'skymaze', hasFire: false, hasIce: false, hasMud: false };
  L.chase = { x0: start.x - 140, v: 0.35 + 0.25 * diff, delay: 240 };
  return L;
}


// ------------------------------------------------------------------ 'gates': divide and conquer.
// The stage is a chain of self-contained segments. A gated segment carries everything it needs inside itself (the power-up pickup for the big / mini gates, the beetle for the shell wall, the flower for the fire wall), so each one is generated and validated ALONE on a tiny level
// (a bad segment is redrawn without touching the rest), and the whole stage is just the segments laid side by side with the same floor height and a flat pad at every seam.

// ---- the template library: ordinary stretches between the gates. Each one starts and ends on the common floor (flat for 2 columns at both seams) and is validated alone like a gate.
var TRANSIT = {
  run: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(12, 18); coins3(4, 3); if (r() < 0.6) put(rnd(6, sg.w - 6), g - 1, T.SPIKE); },
  hurdle: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(16, 22); for (var c = 5; c < sg.w - 4; c += rnd(4, 5)) { var h = rnd(1, 2), wd = rnd(1, 2); for (var q = 0; q < wd; q++) for (var rr = g - h; rr < g; rr++) put(c + q, rr, T.SOLID); } coins3(3, 2); },
  pit: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(14, 18); var c0 = rnd(5, 7), pw = rnd(2, 4); for (var c = c0; c < c0 + pw; c++) for (var rr = g; rr < ROWS; rr++) put(c, rr, 0); coins3(c0, 2); },
  pits2: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(20, 24); var a = rnd(5, 6), b = a + rnd(6, 8); [a, b].forEach(function (c0) { var pw = rnd(2, 3); for (var c = c0; c < c0 + pw; c++) for (var rr = g; rr < ROWS; rr++) put(c, rr, 0); }); coins3(a + 3, 2); },
  hump: function (sg, r, rnd, g, put, coins3) { var st = rnd(2, 3); sg.w = 6 + st * 4 + 4; var c = 3, h, rr, q; for (h = 1; h <= st; h++) { for (q = 0; q < 2; q++) { for (rr = g - h; rr < g; rr++) put(c + q, rr, T.SOLID); } c += 2; } for (q = 0; q < 3; q++) for (rr = g - st; rr < g; rr++) put(c + q, rr, T.SOLID); c += 3; for (h = st - 1; h >= 1; h--) { for (q = 0; q < 2; q++) for (rr = g - h; rr < g; rr++) put(c + q, rr, T.SOLID); c += 2; } sg.coins.push({ x: (3 + st * 2 + 1) * TS, y: (g - st - 1.6) * TS, b: 0 }); },
  spikes: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(16, 20); for (var c = 5; c < sg.w - 4; c += rnd(3, 4)) put(c, g - 1, T.SPIKE); coins3(4, 3); },
  tunnel: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(14, 18); for (var c = 4; c < sg.w - 4; c++) for (var rr = 0; rr <= g - 3; rr++) put(c, rr, T.SOLID); coins3(6, 2); },
  hop: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(18, 22); var c0 = 4, c1 = sg.w - 4, c, rr; for (c = c0; c < c1; c++) for (rr = g; rr < ROWS; rr++) put(c, rr, 0); c = c0 + 1; var hh = 2; while (c < c1 - 2) { var wd = rnd(2, 3); for (var q = 0; q < wd; q++) put(c + q, g - hh, T.SOLID); sg.coins.push({ x: (c + 1) * TS, y: (g - hh - 1.6) * TS, b: 0 }); c += wd + rnd(2, 3); hh = Math.max(1, Math.min(4, hh + rnd(-1, 1))); } },
  walkers: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(18, 22); var n = rnd(2, 3); for (var k = 0; k < n; k++) { var c = 6 + k * 4; sg.enemies.push({ t: E.WALKER, x: c * TS, y: g * TS - 12, w: 12, h: 12, spd: 0.5, dir: k % 2 ? 1 : -1, mn: (c - 2) * TS, mx: (c + 3) * TS }); } coins3(5, 3); },
  belt: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(16, 20); var dirL = r() < 0.5; for (var c = 5; c < sg.w - 5; c++) put(c, g, dirL ? T.CONVL : T.CONVR); coins3(6, 2); },
  ice: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(16, 20); for (var c = 4; c < sg.w - 4; c++) put(c, g, T.ICE); if (r() < 0.5) put(rnd(7, sg.w - 8), g - 1, T.SPIKE); coins3(5, 2); },
  mover: function (sg, r, rnd, g, put, coins3) { var pw = rnd(7, 9); sg.w = 8 + pw + 2; var c0 = 4; for (var c = c0; c < c0 + pw; c++) for (var rr = g; rr < ROWS; rr++) put(c, rr, 0); sg.movers = sg.movers || []; sg.movers.push({ kind: 0, cx: (c0 + pw / 2) * TS, y: g * TS, w: 40, amp: pw * TS / 2 - 22, per: [360, 480, 720][rnd(0, 2)], ph: 0 }); },
  flybridge: function (sg, r, rnd, g, put, coins3) { var kf = rnd(1, 2), pw = 4 * kf + 4; sg.w = 8 + pw + 2; var c0 = 4, c, rr; for (c = c0; c < c0 + pw; c++) for (rr = g; rr < ROWS; rr++) put(c, rr, 0); for (var q = 1; q <= kf; q++) { var fx = (c0 + pw * q / (kf + 1)) * TS, fy = g * TS + 2 + rnd(0, 1) * TS; sg.enemies.push({ t: E.FLYER, x: fx, y: fy, w: 14, h: 10, ax: fx, ay: fy, rg: rnd(14, 24), sp: 1 / 320, ph: r(), am: 0, spd: 0 }); } },
  lavahop: function (sg, r, rnd, g, put, coins3) { var ks = rnd(2, 3), gs = rnd(2, 3), c = 4; sg.w = 4 + ks * 2 + (ks + 1) * gs + 4; for (var s = 0; s <= ks; s++) { for (var i = 0; i < gs; i++) for (var rr = g; rr < ROWS; rr++) put(c + i, rr, T.LAVA); var ex = (c + (gs >> 1)) * TS + 2, per = rnd(110, 170); sg.enemies.push({ t: E.EMBER, x: ex, y: g * TS, w: 12, h: 12, ax: ex, by: g * TS, per: per, pho: rnd(0, per), hgt: rnd(34, 58), up: 1, hid: true, spd: 0 }); c += gs + (s < ks ? 2 : 0); } },
  poisonhop: function (sg, r, rnd, g, put, coins3) { var ks = rnd(2, 3), gs = rnd(2, 3), c = 4; sg.w = 4 + ks * 2 + (ks + 1) * gs + 4; for (var s = 0; s <= ks; s++) { for (var i = 0; i < gs; i++) for (var rr = g; rr < ROWS - 1; rr++) put(c + i, rr, T.POISON); var ex = (c + (gs >> 1)) * TS + 2, per = rnd(110, 170); sg.enemies.push({ t: E.LEAPFISH, poison: 1, x: ex, y: g * TS, w: 14, h: 9, ax: ex, by: g * TS, per: per, pho: rnd(0, per), hgt: rnd(34, 58), up: 1, hid: true, spd: 0 }); c += gs + (s < ks ? 2 : 0); } },
  bricks: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(14, 18); for (var c = 5; c < sg.w - 5; c++) put(c, g - 4, c % 3 === 0 ? T.QC : T.BRICK); coins3(4, 3); }
};
var TRANSIT_NAMES = Object.keys(TRANSIT);
// plausibility: every template has a climate; one climate per stage (lava only in a hot stage, ice only in a cold one, no poison / water next to a volcano), the theme is then picked from the matching looks
var SEG_TAG = { lavahop: 'hot', ice: 'cold', poisonhop: 'wet', poison: 'wet' };
var CLIMATE_THEMES = { hot: [2, 4, 5, 9, 14, 15, 16, 17, 19], cold: [1, 5, 8, 11, 13, 18, 22], mild: [0, 1, 3, 6, 7, 10, 11, 12, 13] };
function climateOK(tag, climate) { if (tag === 'hot') return climate === 'hot'; if (tag === 'cold') return climate === 'cold'; if (tag === 'wet') return climate !== 'hot'; return true; }
function gateSeg(type, r, rnd, g) {
  var sg = { type: type, w: 0, tiles: [], enemies: [], items: [], coins: [], route: [] }, put = function (c, rr, t) { sg.tiles.push([c, rr, t]); };
  var IY = g * TS - 12, bx = 0, c, rr;
  function coins3(c0, k) { for (var q = 0; q < k; q++) sg.coins.push({ x: (c0 + q * 2) * TS + 8, y: (g - 1.6) * TS, b: 0 }); }
  if (TRANSIT[type]) {
    TRANSIT[type](sg, r, rnd, g, put, coins3);
    sg.route.push({ k: 'xge', x: (sg.w - 2) * TS });
  } else if (type === 'big') {   // a lid of bricks over the corridor leads up to the only way on; the wall blocks the floor. Only a big hero breaks the lid.
    sg.w = 27; var lid = rnd(11, 13), wall = lid + rnd(3, 4);
    for (c = 3; c <= wall + 3; c++) { put(c, g - 4, T.SOLID); for (rr = 0; rr <= g - 9; rr++) put(c, rr, T.SOLID); }
    put(lid, g - 4, T.BRICK); put(lid + 1, g - 4, T.BRICK);
    for (rr = g - 3; rr <= g - 1; rr++) put(wall, rr, T.SOLID);
    sg.items.push({ k: 0, x: 5 * TS + 2, y: IY }, { k: 0, x: (lid - 3) * TS + 2, y: IY }); coins3(7, 2);
    sg.route.push({ k: 'pw', v: 'big', x: 5 * TS + 8, y: g * TS - 7 }, { k: 'xge', x: (wall + 6) * TS });
  } else if (type === 'mini') {   // a wall with a mouse hole at the bottom: only a mini hero fits
    sg.w = 22; var wc = rnd(11, 13);
    for (rr = 0; rr <= g - 2; rr++) put(wc, rr, T.SOLID); put(wc, g - 1, T.NARROW);
    sg.items.push({ k: 6, x: 5 * TS + 2, y: IY }, { k: 6, x: (wc - 3) * TS + 2, y: IY }); coins3(6, 2);
    sg.route.push({ k: 'pw', v: 'mini', x: 5 * TS + 8, y: g * TS - 7 }, { k: 'xge', x: (wc + 4) * TS });
  } else if (type === 'shell' || type === 'fire') {   // a cracked wall: a kicked shell (or a fireball) breaks it
    sg.w = 27; var cw = rnd(19, 21);
    for (rr = 0; rr <= g - 1; rr++) put(cw, rr, T.CRACK);
    if (type === 'shell') { var b0 = rnd(7, 9); sg.enemies.push({ t: E.BEETLE, x: b0 * TS, y: g * TS - 13, w: 12, h: 13, spd: 0.4, dir: 1, mn: (b0 - 3) * TS, mx: (b0 + 4) * TS }); sg.items.push({ k: 0, x: 3 * TS + 2, y: IY }); sg.route.push({ k: 'pw', v: 'notmini', x: 3 * TS + 8 }, { k: 'kick', x: (b0 + 1) * TS }, { k: 'tile', c: cw, r: g - 1, x: (cw - 2) * TS, x2: cw * TS }); }
    else { sg.items.push({ k: 1, x: 5 * TS + 2, y: IY }, { k: 1, x: 10 * TS + 2, y: IY }); sg.route.push({ k: 'pw', v: 'fire', x: 5 * TS + 8, y: g * TS - 7 }, { k: 'tile', c: cw, r: g - 1, x: (cw - 2) * TS, x2: cw * TS }); }
    sg.route.push({ k: 'xge', x: (cw + 3) * TS });
  }
  if (type === 'forge') {   // STRATEGY: a brick lid leads up into a vault holding a fire flower and a shrink item (only ONE power can be carried). Then come a cracked wall (needs fire) and a mouse hole (needs mini).
    // The flower has to be taken FIRST (shoot the wall), then back up the stairs for the shrink item - the other order is a dead end.
    sg.w = 44; var U = g - 4, lidC = 8;
    for (c = 3; c <= 24; c++) for (rr = 0; rr <= g - 9; rr++) put(c, rr, T.SOLID);
    for (c = 3; c <= 20; c++) put(c, U, T.SOLID);
    put(lidC, U, T.BRICK); put(lidC + 1, U, T.BRICK);
    for (c = 14; c <= 20; c++) for (rr = g - 3; rr <= g - 1; rr++) put(c, rr, T.SOLID);
    for (c = 21; c <= 23; c++) for (rr = g - (24 - c); rr <= g - 1; rr++) put(c, rr, T.SOLID);
    for (rr = 0; rr <= g - 1; rr++) put(30, rr, T.CRACK);
    for (rr = 0; rr <= g - 2; rr++) put(37, rr, T.SOLID); put(37, g - 1, T.NARROW);
    sg.items.push({ k: 0, x: 3 * TS + 2, y: IY }, { k: 0, x: 6 * TS + 2, y: IY }, { k: 1, x: 12 * TS + 2, y: U * TS - 12 }, { k: 6, x: 17 * TS + 2, y: U * TS - 12 }); coins3(26, 2);
    sg.route.push({ k: 'pw', v: 'big', x: 3 * TS + 8, y: g * TS - 7 }, { k: 'tile', c: lidC, r: U, x: lidC * TS + 8 }, { k: 'pw', v: 'fire', x: 12 * TS + 8, y: U * TS - 7 }, { k: 'tile', c: 30, r: g - 1, x: 28 * TS, x2: 30 * TS }, { k: 'pw', v: 'mini', x: 17 * TS + 8, y: U * TS - 7 }, { k: 'xge', x: 41 * TS });
  }
  if (type === 'swap') {   // STRATEGY: only a big hero breaks the lid, the shrink item lies in the vault above it, and the mouse hole is the way on - the big power has to be traded in for the small one
    sg.w = 34; var U2 = g - 4, lid2 = rnd(8, 9);
    for (c = 3; c <= 20; c++) for (rr = 0; rr <= g - 9; rr++) put(c, rr, T.SOLID);
    for (c = 3; c <= 18; c++) put(c, U2, T.SOLID);
    put(lid2, U2, T.BRICK); put(lid2 + 1, U2, T.BRICK);
    for (c = 13; c <= 18; c++) for (rr = g - 3; rr <= g - 1; rr++) put(c, rr, T.SOLID);
    for (c = 19; c <= 21; c++) for (rr = g - (22 - c); rr <= g - 1; rr++) put(c, rr, T.SOLID);
    for (rr = 0; rr <= g - 2; rr++) put(27, rr, T.SOLID); put(27, g - 1, T.NARROW);
    sg.items.push({ k: 0, x: 3 * TS + 2, y: IY }, { k: 0, x: 6 * TS + 2, y: IY }, { k: 6, x: 15 * TS + 2, y: U2 * TS - 12 }); coins3(23, 2);
    sg.route.push({ k: 'pw', v: 'big', x: 3 * TS + 8, y: g * TS - 7 }, { k: 'tile', c: lid2, r: U2, x: lid2 * TS + 8 }, { k: 'pw', v: 'mini', x: 15 * TS + 8, y: U2 * TS - 7 }, { k: 'xge', x: 31 * TS });
  }
  if (type === 'poison') {   // a poison river under a low ceiling (it cannot be jumped): only a powered hero can wade through - the power is lost on entering and 3 seconds are granted
    sg.w = 24; var rw = rnd(5, 6), rc = rnd(10, 12);
    for (c = rc - 1; c <= rc + rw; c++) for (rr = 0; rr <= g - 3; rr++) put(c, rr, T.SOLID);
    for (c = rc; c < rc + rw; c++) for (rr = g; rr < ROWS - 1; rr++) put(c, rr, T.POISON);
    var fx = (rc + (rw >> 1)) * TS + 1; sg.enemies.push({ t: E.LEAPFISH, poison: 1, x: fx, y: g * TS, w: 14, h: 9, ax: fx, by: g * TS, per: 150, pho: rnd(0, 150), hgt: 30, up: 1, hid: true, spd: 0 });
    sg.items.push({ k: 0, x: 3 * TS + 2, y: IY }, { k: 0, x: (rc - 3) * TS + 2, y: IY }); coins3(5, 1);
    sg.route.push({ k: 'pw', v: 'big', x: 3 * TS + 8, y: g * TS - 7 }, { k: 'xge', x: (rc + rw + 3) * TS });
  }
  if (type === 'pound') {   // a plateau reached by steps; a wall closes it, but its floor has a heavy slab: pound through it and walk on under the wall in the cavity below
    sg.w = 25; var ps = rnd(11, 12), wl = ps + rnd(3, 4);
    for (c = 3; c <= 7; c++) for (rr = g - (c - 2); rr <= g - 1; rr++) put(c, rr, T.SOLID);
    for (c = 7; c <= 20; c++) put(c, g - 5, T.SOLID);
    for (rr = 0; rr <= g - 6; rr++) put(wl, rr, T.SOLID);
    put(ps, g - 5, T.POUND); put(ps + 1, g - 5, T.POUND);
    sg.items.push({ k: 0, x: 1 * TS + 2, y: IY }, { k: 0, x: 9 * TS + 2, y: (g - 5) * TS - 12 }); coins3(2, 1);
    sg.route.push({ k: 'pw', v: 'big', x: 1 * TS + 8, y: g * TS - 7 }, { k: 'tile', c: ps, r: g - 5, x: ps * TS + 8 }, { k: 'xge', x: 22 * TS });
  }
  var lr = sg.route[sg.route.length - 1]; if (lr && lr.k === 'xge') lr.x2 = Math.max(lr.x + 4 * TS, (sg.w + 1) * TS);
  return sg;
}
// a tiny stand-alone level around one segment: flat floor, 4 pad columns in front, 6 behind, the flag at the very end
function segLevel(sg, g, entry) {
  var PADL = 4, W = PADL + sg.w + 6, tiles = new Uint8Array(W * ROWS), gt = [], c, rr;
  for (c = 0; c < W; c++) { gt.push(g); for (rr = g; rr < ROWS; rr++) tiles[c * ROWS + rr] = T.SOLID; }
  sg.tiles.forEach(function (e) { if (e[0] + PADL < W) tiles[(e[0] + PADL) * ROWS + e[1]] = e[2]; });
  var en = sg.enemies.map(function (e) { var o2 = {}; for (var k in e) o2[k] = e[k]; o2.x += PADL * TS; if (o2.ax !== undefined) o2.ax += PADL * TS; if (o2.mn !== undefined) { o2.mn += PADL * TS; o2.mx += PADL * TS; } return o2; });
  var route = sg.route.filter(function (e) { return !(entry === 'fire' && e.k === 'kick'); }).map(function (e) { var o2 = {}; for (var k in e) o2[k] = e[k]; if (o2.x !== undefined) o2.x += PADL * TS; if (o2.x2 !== undefined) o2.x2 += PADL * TS; if (o2.c !== undefined) o2.c += PADL; return o2; });
  var pole = W - 3; route.push({ k: 'goal', x: pole * TS + 6, y: null });
  return { seed: 1, n: 1, kind: 'gates', diff: 0, w: W, tiles: tiles, gt: gt, coins: [], special: [], enemies: en, movers: (sg.movers || []).map(function (m) { var o2 = {}; for (var k in m) o2[k] = m[k]; o2.cx += PADL * TS; return o2; }), cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * ROWS),
    items: sg.items.map(function (i) { return { k: i.k, x: i.x + PADL * TS, y: i.y }; }), stepEn: en.some(function (e) { return e.t === E.BEETLE || e.t === E.FLYER; }), entry: entry || '', pound: sg.type === 'pound', duck: true, reqEn: [E.BEETLE, E.FLYER],
    route: route, puzzle: true, goalX: pole * TS + 6, poleCol: pole, poleY: g * TS, start: { x: 2 * TS + 2, y: g * TS - 14 }, cp: { x: 99999, y: 0 }, time: 300, theme: 0, room: false, hasBoss: false, kindAsked: 'gates', hasFire: false, hasIce: false, hasMud: false };
}
function buildGates(seed, n, a) {
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 71)), diff = Math.min(1, (nn - 1) / 18), g = 11;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  var G = 2 + Math.floor(diff * 2.4), pool = ['big', 'mini', 'shell', 'fire', 'pound', 'poison', 'forge', 'swap'], i, kinds = [];
  for (i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  for (i = 0; i < G; i++) kinds.push(pool[i % pool.length]);
  var climate = (function () { var x = r(); return x < 0.5 ? 'mild' : x < 0.75 ? 'hot' : 'cold'; })(), segs = [], tries = 0;
  pool = pool.filter(function (k) { return climateOK(SEG_TAG[k], climate); }); kinds = []; for (i = 0; i < G; i++) kinds.push(pool[i % pool.length]);
  function seg(type, idx) {   // generate + validate one segment alone; a few redraws, then the always-valid plain run
    for (var t2 = 0; t2 < 8; t2++) {
      var rr2 = rng(hash(seed, n, a * 131 + idx * 17 + t2 * 3 + 5)), sg = gateSeg(type, rr2, function (lo, hi) { return lo + Math.floor(rr2() * (hi - lo + 1)); }, g);
      tries++; var allOk = true;   // the segment has to work whatever the hero brings in: small, mini, big or with fire
      (type === 'shell' ? ['', 'big', 'fire'] : ['', 'mini', 'big', 'fire']).forEach(function (en0) { if (allOk && !validate(segLevel(sg, g, en0), 5000).ok) allOk = false; });   // (a mini hero gets the mushroom at the shell segment's entrance: slow to prove, so not checked)
      if (allOk) return sg;
    }
    return gateSeg('run', r, rnd, g);
  }
  segs.push(gateSeg('run', r, rnd, g)); segs[0].w = 10; segs[0].tiles = []; segs[0].coins = []; segs[0].route = [];
  var lastT = 'run', sidx = 100;
  function transit(k) { var nm, guard2 = 0; do { nm = TRANSIT_NAMES[rnd(0, TRANSIT_NAMES.length - 1)]; } while ((nm === lastT || (nm === 'run' && r() < 0.6) || !climateOK(SEG_TAG[nm], climate)) && ++guard2 < 60); lastT = nm; segs.push(seg(nm, sidx++)); }
  kinds.forEach(function (k, idx) { var pre = rnd(1, 2); for (var q = 0; q < pre; q++) transit(); segs.push(seg(k, idx + 1)); });
  for (var q3 = 0, post = rnd(1, 2); q3 < post; q3++) transit();
  // lay the segments side by side
  var W = 0; segs.forEach(function (s0) { s0.x0 = W; W += s0.w; }); var poleCol = W + 5; W += 10;
  var tiles = new Uint8Array(W * ROWS), gt = [], c, rr, coins = [], enemies = [], items = [], route = [], specials = [], movers = [];
  for (c = 0; c < W; c++) { gt.push(g); for (rr = g; rr < ROWS; rr++) tiles[c * ROWS + rr] = T.SOLID; }
  segs.forEach(function (s0, si) {
    s0.tiles.forEach(function (e) { tiles[(e[0] + s0.x0) * ROWS + e[1]] = e[2]; });
    s0.coins.forEach(function (q) { coins.push({ x: q.x + s0.x0 * TS, y: q.y, b: 0 }); });
    s0.enemies.forEach(function (e) { var o2 = {}; for (var k in e) o2[k] = e[k]; o2.x += s0.x0 * TS; if (o2.ax !== undefined) o2.ax += s0.x0 * TS; if (o2.mn !== undefined) { o2.mn += s0.x0 * TS; o2.mx += s0.x0 * TS; } enemies.push(o2); });
    (s0.movers || []).forEach(function (m) { var o2 = {}; for (var k in m) o2[k] = m[k]; o2.cx += s0.x0 * TS; movers.push(o2); });
    s0.items.forEach(function (i2) { items.push({ k: i2.k, x: i2.x + s0.x0 * TS, y: i2.y }); });
    s0.route.forEach(function (e) { var o2 = {}; for (var k in e) o2[k] = e[k]; if (o2.x !== undefined) o2.x += s0.x0 * TS; if (o2.x2 !== undefined) o2.x2 += s0.x0 * TS; if (o2.c !== undefined) o2.c += s0.x0; route.push(o2); });
    if (s0.type === 'run' && si > 0) specials.push({ x: (s0.x0 + 6) * TS, y: (g - 3) * TS });
  });
  while (specials.length < 5) specials.push({ x: (4 + specials.length * 7) * TS, y: (g - 3) * TS });
  specials = specials.slice(0, 5);
  route.push({ k: 'goal', x: poleCol * TS + 6, y: null });
  var mid = segs[Math.floor(segs.length / 2)];
  return { seed: seed, n: n, kind: 'gates', attempt: a, diff: diff, w: W, tiles: tiles, gt: gt, coins: coins, special: specials, enemies: enemies, movers: movers, cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * ROWS),
    items: items, duck: true, reqEn: [E.BEETLE, E.FLYER], pound: kinds.indexOf('pound') >= 0, stepEn: enemies.some(function (e) { return e.t === E.BEETLE || e.t === E.FLYER; }), route: route, puzzle: true, goalX: poleCol * TS + 6, poleCol: poleCol, poleY: g * TS, start: { x: 2 * TS + 2, y: g * TS - 14 }, cp: { x: (mid.x0 + 2) * TS, y: g * TS - 14 },
    time: 150 + Math.floor(W * 0.7), theme: 0, themeList: CLIMATE_THEMES[climate], climate: climate, segNames: segs.map(function (s0) { return s0.type; }), segX: segs.map(function (s0) { return s0.x0; }), room: false, hasBoss: false, kindAsked: 'gates', hasFire: false, hasIce: false, hasMud: false, segKinds: kinds };
}


// ------------------------------------------------------------------ trajectory first ('flystep'): the planner decides what the hero DOES, then builds the world that makes it possible.
// 1. a hero jump is simulated with the real physics, and the moment of a stomp is picked on it; 2. a flyer has to be at that exact spot at that exact frame;
// 3. the flyer's sweep (centre, range, phase) is solved to put it there. The hero then bounces and the next stomp is planned from the new state, so 1-4 flyers in a row can be sacrificed.
// Branches: at an island a decoy trajectory is planned the same way (other direction / height) and left as a dead end. The recorded input script is the stage's solution (L.plan).
function flyDef(r, rnd, xc, ytop, f) { var rg = rnd(14, 28), sp = 1 / 320, ph = r(), ax = (xc - 7) - rg * PF.tri(f * sp + ph); return { t: E.FLYER, x: ax, y: ytop, w: 14, h: 10, ax: ax, ay: ytop, rg: rg, sp: sp, ph: ph, am: 0, spd: 0 }; }
function flyLive(d) { var e = {}; for (var k in d) e[k] = d[k]; e.vx = 0; e.vy = 0; e.alive = true; e.dt = 0; e.ground = false; e.sh = 0; e.kg = 0; e.s = 0; e.tm = 0; e.inv = 0; if (e.dir === undefined) e.dir = -1; return e; }
// free flight under the chosen input until `after` frames past the apex; returns the state just before the stomp frame (or null)
function trajFlight(st0, air, hold, after, rows) {
  var q = clone(st0), prog = [], apex = -1, k, inp;
  for (k = 0; k < 220; k++) {
    if (apex >= 0 && k - apex >= after) break;
    inp = (q.p.ground && k < hold ? IN.J : (!q.p.ground && st0.p.ground && k < hold ? IN.J : 0)) | air; step(q, inp); prog.push(inp);
    if (q.p.dead || q.p.won) return null; if (q.p.ground && k > 3) return null; if (q.p.vy > 0 && apex < 0) apex = k;
  }
  if (apex < 0 || q.p.ground || q.p.y < TS || q.p.y > (rows - 5) * TS) return null;
  return { q: q, prog: prog };
}
function trajStomp(L, st0, rnd, r, airs) {
  for (var tr = 0; tr < 40; tr++) {
    var air = airs[rnd(0, airs.length - 1)], fl0 = trajFlight(st0, air, rnd(7, 16), rnd(2, 7), L.rows); if (!fl0) continue;
    var pre = fl0.q, stIn = air | ((pre.p.y > 10 * TS ? r() < 0.9 : r() < 0.15) ? IN.J : 0), offs = [[0, 0], [-1, 0], [1, 0], [3, 0], [-3, 0], [5, 0], [-5, 0], [0, 3], [0, -3]];
    for (var oi = 0; oi < offs.length; oi++) {
      var def = flyDef(r, rnd, pre.p.x + pre.p.w / 2 + offs[oi][1], pre.p.y + pre.p.h + offs[oi][0], pre.f), t = clone(pre), e = flyLive(def), used = 0; t.en.push(e);
      for (; used < 4; used++) { step(t, stIn); if (!e.alive || t.p.dead) { used++; break; } }
      if (!e.alive && !t.p.dead && t.p.inv === 0 && t.p.vy < 0) {
        var seg = fl0.prog.slice(); for (var u = 0; u < used; u++) seg.push(stIn);
        var chk = clone(st0), e2 = flyLive(def); chk.en.push(e2); for (var w = 0; w < seg.length; w++) { step(chk, seg[w]); if (chk.p.dead) break; }   // the flyer also exists (and moves) during the flight: it must not be touched earlier
        if (chk.p.dead || e2.alive || chk.p.inv > 0 || chk.p.vy >= 0) continue;
        L.enemies.push(def); return { st: chk, seg: seg };
      }
    }
  }
  return null;
}
// land on a fresh island below the current flight; len = its width
function trajLand(L, st0, rnd, r, airs, len, put) {
  for (var tr = 0; tr < 40; tr++) {
    var air = airs[rnd(0, airs.length - 1)], fl0 = trajFlight(st0, air, 0, rnd(3, 9), L.rows); if (!fl0) continue;
    var pre = fl0.q, q = clone(pre), k, x0 = 0, rl = Math.floor((pre.p.y + pre.p.h + rnd(14, 150)) / TS) + 1;
    if (rl < 5 || rl > 19) continue;
    for (k = 0; k < 90; k++) { step(q, air); if (q.p.y + q.p.h >= rl * TS - 1) break; }
    var cx = Math.floor((q.p.x + q.p.w / 2) / TS), c0 = Math.max(2, Math.min(L.w - len - 2, cx - rnd(1, len - 2))), cc, rr, ok = true;
    for (cc = c0; cc < c0 + len; cc++) for (rr = rl - 4; rr <= rl + 1; rr++) if (L.tiles[cc * L.rows + rr]) ok = false;
    if (!ok) continue;
    for (cc = c0; cc < c0 + len; cc++) { L.tiles[cc * L.rows + rl] = T.SOLID; L.tiles[cc * L.rows + rl + 1] = T.SOLID; }
    var t = clone(pre), seg = fl0.prog.slice(), landed = false;
    for (k = 0; k < 110; k++) { step(t, air); seg.push(air); if (t.p.dead) break; if (t.p.ground) { landed = true; break; } }
    if (landed && !t.p.dead) { return { st: t, seg: seg, c0: c0, len: len, rl: rl }; }
    for (cc = c0; cc < c0 + len; cc++) { L.tiles[cc * L.rows + rl] = 0; L.tiles[cc * L.rows + rl + 1] = 0; }
  }
  return null;
}
function buildTrajChain(seed, n, a) {
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 91)), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, rows = 26, W = 96 + Math.round(diff * 30), tiles = new Uint8Array(W * rows), c, rr;
  var L = { seed: seed, n: n, kind: 'flystep', attempt: a, diff: diff, w: W, rows: rows, tiles: tiles, gt: [], coins: [], special: [], enemies: [], movers: [], cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * rows),
    puzzle: true, vertical: true, goalX: 1e6, poleCol: 0, poleY: 0, start: { x: 4 * TS, y: 15 * TS - P.SH }, cp: { x: 4 * TS, y: 15 * TS - P.SH }, time: 400, theme: 1, room: false, hasBoss: false, kindAsked: 'flystep', hasFire: false, hasIce: false, hasMud: false, stepEn: true };
  for (c = 0; c < W; c++) L.gt.push(rows - 1);
  for (c = 2; c < 10; c++) { tiles[c * rows + 15] = T.SOLID; tiles[c * rows + 16] = T.SOLID; }
  var islands = [{ c0: 2, len: 8, rl: 15 }], script = [], st = newState(L, { noPM: false }), k, chains = 0, xEnd = (W - 24) * TS, fail = false;
  function idle(m) { for (var i = 0; i < m; i++) { step(st, 0); script.push(0); } }
  idle(6);
  function replayAll(sc) { var v2 = newState(L, { noPM: false }); for (var i = 0; i < sc.length; i++) { step(v2, sc[i]); if (v2.p.dead) return null; } return v2; }
  var bad = 0;
  while (st.p.x < xEnd && chains < 30 && !fail) {
    var snapE = L.enemies.length, snapT = L.tiles.slice(), snapI = islands.length, snapS = script.length;
    idle(rnd(2, 8));
    if (chains > 0 && r() < 0.3 + 0.4 * diff) {   // a decoy branch: another direction / height, planned the same way, ends in a dead end
      var ds = clone(st), kd = rnd(1, 2), okd = true;
      for (k = 0; k < kd && okd; k++) { var rd = trajStomp(L, ds, rnd, r, [IN.L, 0, IN.L | IN.RUN, IN.R]); if (rd) ds = rd.st; else okd = false; }
      if (okd && r() < 0.6) { var ld = trajLand(L, ds, rnd, r, [IN.L, 0, IN.R], rnd(3, 5)); if (ld) islands.push({ c0: ld.c0, len: ld.len, rl: ld.rl, decoy: true }); }
    }
    var kk = rnd(1, 2 + Math.min(2, Math.floor(diff * 3))), seg = [], sm = st;
    for (k = 0; k < kk; k++) { var rs = trajStomp(L, sm, rnd, r, [IN.R, IN.R | IN.RUN, IN.R]); if (!rs) { fail = 'stomp' + k + '@' + Math.round(sm.p.x) + ',' + Math.round(sm.p.y) + ' g' + sm.p.ground; break; } sm = rs.st; seg = seg.concat(rs.seg); }
    if (fail) break;
    var fin = st.p.x + 400 > xEnd + 250 || sm.p.x > xEnd - 30 * TS, lnd = trajLand(L, sm, rnd, r, [IN.R, IN.R | IN.RUN, IN.R], fin ? 12 : rnd(5, 8));
    if (!lnd) { fail = 'land@' + Math.round(sm.p.x) + ',' + Math.round(sm.p.y) + ' vy' + sm.p.vy.toFixed(1); break; }
    var cand = script.concat(seg, lnd.seg), chk2 = replayAll(cand);
    if (!chk2 || !chk2.p.ground || Math.abs(chk2.p.x - lnd.st.p.x) > 0.01 || Math.abs(chk2.p.y - lnd.st.p.y) > 0.01) {   // an old decoy (or tile) is in the way: undo this step and plan it again
      L.enemies.length = snapE; L.tiles.set(snapT); islands.length = snapI; script.length = snapS; st = replayAll(script); if (!st || ++bad > 12) { fail = 'verify'; break; } continue;
    }
    st = chk2; script = cand; islands.push({ c0: lnd.c0, len: lnd.len, rl: lnd.rl, last: fin }); chains++;
    if (fin && st.p.x >= xEnd - 40 * TS && lnd.len >= 12) break;
  }
  var last = islands.filter(function (i) { return !i.decoy; }).pop();
  if (fail || !last || last.len < 12) { L.dbg = { chains: chains, fail: fail, x: Math.round(st.p.x), last: !!last, lastLen: last && last.len, islands: islands.length, enemies: L.enemies.length }; L.valid = false; L.kindFail = true; L.route = [{ k: 'goal', x: 1e6, y: null }]; return L; }
  var gx = (last.c0 + 9) * TS + 8, gy = last.rl * TS; L.goalX = gx; L.poleCol = last.c0 + 9; L.poleY = gy; L.goalRect = { x: gx - 8, y: gy - 4 * TS, w: 16, h: 4 * TS };
  for (k = 0; k < 160 && !st.p.won && !st.p.dead; k++) { step(st, IN.R | IN.RUN); script.push(IN.R | IN.RUN); }
  // verify on a fresh state with the real physics, recording the expected positions for the auto player
  var v = newState(L, { noPM: false }), pos = [], ok = false;
  for (k = 0; k < script.length; k++) { pos.push([v.p.x, v.p.y]); step(v, script[k]); if (v.p.dead) break; if (v.p.won) { ok = true; break; } }
  islands.forEach(function (i) { if (i.len < 4) return; for (var q = 0; q < Math.min(3, i.len - 1); q++) L.coins.push({ x: (i.c0 + 1 + q * 1.5) * TS + 8, y: (i.rl - 1.6) * TS, b: 0 }); });
  var pool = islands.filter(function (i) { return !i.decoy; }); for (k = 0; k < 5; k++) { var ip = pool[Math.min(pool.length - 1, Math.floor((k + 0.5) * pool.length / 5))]; L.special.push({ x: (ip.c0 + 2) * TS, y: (ip.rl - 3) * TS }); }
  L.plan = script; L.planPos = pos; L.planOk = ok; L.route = [{ k: 'goal', x: gx, y: gy - 10 }];
  return L;
}

// ------------------------------------------------------------------ ghost house: sealed rooms joined only by doors (two-way pairs); wrong doors lead into dead ends and loops. Each door sits on a ledge (jump onto it to enter) and lands beside the partner door.
function buildGhostHouse(seed, n, a) {
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 51)), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, R = 9 + Math.floor(diff * 7), RW = 10, g = 12, W = R * RW + 1;   // many narrow rooms: every room is walled off (vertical walls) and only doors lead on
  var gt = [], tiles = new Uint8Array(W * ROWS), put = function (c, rr, t) { if (c >= 0 && c < W && rr >= 0 && rr < ROWS) tiles[c * ROWS + rr] = t; };
  for (var c = 0; c < W; c++) { gt.push(g); for (var rr = g; rr < ROWS; rr++) put(c, rr, T.SOLID); put(c, 0, T.SOLID); put(c, 1, T.SOLID); if (c % RW === 0) for (rr = 0; rr < ROWS; rr++) put(c, rr, T.SOLID); }
  // room graph: random tree with at most 3 doors per room, plus a few extra loops
  var deg, adj, i, edges, tries, best = null;
  function mkGraph() {
    deg = []; adj = []; edges = [];
    for (i = 0; i < R; i++) { deg.push(0); adj.push([]); }
    for (i = 1; i < R; i++) { var p; tries = 0; do { p = rnd(Math.max(0, i - 2), i - 1); } while (deg[p] >= 3 && ++tries < 30); if (deg[p] >= 3) { for (p = 0; p < i && deg[p] >= 3; p++); } edges.push([p, i]); deg[p]++; deg[i]++; adj[p].push(i); adj[i].push(p); }
    var extra = Math.round(R * (0.15 + 0.15 * diff)); for (tries = 0; extra > 0 && tries < 80; tries++) { var u = rnd(0, R - 1), v = rnd(0, R - 1); if (u !== v && deg[u] < 3 && deg[v] < 3 && adj[u].indexOf(v) < 0) { edges.push([u, v]); deg[u]++; deg[v]++; adj[u].push(v); adj[v].push(u); extra--; } }
  }
  function dia() { var f = function (s0) { var ds = {}, q = [s0], l = s0; ds[s0] = 0; while (q.length) { var x = q.shift(); if (ds[x] > ds[l]) l = x; adj[x].forEach(function (y) { if (ds[y] === undefined) { ds[y] = ds[x] + 1; q.push(y); } }); } return [l, ds[l]]; }; return f(f(0)[0])[1]; }
  for (var gtry = 0; gtry < 14; gtry++) { mkGraph(); var dm = dia(); if (!best || dm > best.dm) best = { dm: dm, deg: deg, adj: adj, edges: edges }; }   // the door graph with the longest route
  deg = best.deg; adj = best.adj; edges = best.edges;
  function bfs(s0) { var ds = {}, q = [s0], fr = s0, pv = {}; ds[s0] = 0; while (q.length) { var x = q.shift(); if (ds[x] > ds[fr]) fr = x; adj[x].forEach(function (y) { if (ds[y] === undefined) { ds[y] = ds[x] + 1; pv[y] = x; q.push(y); } }); } return { far: fr, prev: pv }; }
  var s = bfs(0).far, bb = bfs(s), goalRoom = bb.far, path = [goalRoom]; while (path[0] !== s) path.unshift(bb.prev[path[0]]);
  // doors: slot offsets inside a room (ledge centres)
  var SL = [1, 4, 7], used = []; for (i = 0; i < R; i++) used.push(0);
  var tele = [], coins = [], enemies = [], specials = [], door = {};
  edges.forEach(function (e, ei) {
    var sa = used[e[0]]++, sb = used[e[1]]++, xa = e[0] * RW + 1 + SL[sa], xb = e[1] * RW + 1 + SL[sb], col = ei % 3;
    function ledge(xc) { put(xc, g - 3, T.SOLID); put(xc + 1, g - 3, T.SOLID); put(xc, g - 4, T.TELE); }
    ledge(xa); ledge(xb);
    function land(xc) { return (xc + 2) * TS + 1; }
    tele.push({ c: xa, r: g - 4, tx: land(xb), ty: g * TS - 14, col: col, door: 1 }); tele.push({ c: xb, r: g - 4, tx: land(xa), ty: g * TS - 14, col: col, door: 1 });
    door[e[0] + '>' + e[1]] = { c: xa }; door[e[1] + '>' + e[0]] = { c: xb };
  });
  // decoration: coins on floors, ghosts, spikes, bonus items in dead-end rooms
  for (i = 0; i < R; i++) {
    var x0 = i * RW + 1;
    for (var q2 = 0; q2 < 3; q2++) coins.push({ x: (x0 + 3 + q2 * 3) * TS + 8, y: (g - 1.5) * TS, b: 0 });
    if (i !== 0 && i !== goalRoom && r() < 0.35 + 0.4 * diff) put(x0 + [2, 5, 8][rnd(0, 2)], g - 1, T.SPIKE);
    var ng = path.indexOf(i) >= 0 ? 0 : rnd(1, 2); for (var k = 0; k < ng; k++) enemies.push({ t: E.GHOST, x: (x0 + rnd(2, 8)) * TS, y: (g - 7) * TS, w: 14, h: 14, ax: (x0 + 5) * TS, ay: (g - 7) * TS, rg: 30, sp: 1 / (220 + r() * 120), ph: r(), am: 6, spd: 0 });
    if (deg[i] === 1 && i !== 0 && i !== goalRoom && specials.length < 5) specials.push({ x: (x0 + 4) * TS, y: (g - 2) * TS });
  }
  while (specials.length < 5) specials.push({ x: (rnd(1, R) * RW - 3) * TS, y: (g - 7) * TS });
  var route = [], cnt = 0;
  for (i = 0; i + 1 < path.length; i++) { var dd = door[path[i] + '>' + path[i + 1]]; var back = door[path[i + 1] + '>' + path[i]]; route.push({ k: 'at', x: (back.c + 2) * TS + 7, y: g * TS - 7 }); }   // done on landing at that very door (a tele count could be farmed by hopping one door back and forth)
  var gxr = goalRoom * RW + 1 + 9, poleCol = gxr;
  route.push({ k: 'goal', x: poleCol * TS + 6, y: null });
  var mid = path[Math.floor(path.length / 2)];
  return { seed: seed, n: n, kind: 'ghost', attempt: a, diff: diff, w: W, tiles: tiles, gt: gt, coins: coins, special: specials, enemies: enemies, movers: [], cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: tele, launch: [], grp: new Uint8Array(W * ROWS),
    route: route, puzzle: true, vertical: true, roomPx: RW * TS, goalRect: { x: poleCol * TS - 2, y: g * TS - 4 * TS, w: 16, h: 4 * TS }, goalX: poleCol * TS + 6, poleCol: poleCol, poleY: g * TS, start: { x: (s * RW + 4) * TS + 2, y: g * TS - 14 }, cp: { x: (mid * RW + 4) * TS + 2, y: g * TS - 14 },
    time: 200 + R * 40, theme: 2, room: false, hasBoss: false, kindAsked: 'ghost', hasFire: false, hasIce: false, hasMud: false };
}
// ------------------------------------------------------------------ switchback castle: long floors joined by stair shafts at alternating ends, so the route runs right, climbs, runs left, climbs ... (scrolls both ways)
function buildSwitchback(seed, n, a) {
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 41)), lim = probe(), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, F = 3 + (diff > 0.35 ? 1 : 0) + (diff > 0.75 ? 1 : 0), W = 64 + Math.round(diff * 18), H = 9, rows = F * H + 4;
  var tiles = new Uint8Array(W * rows), put = function (c, rr, t) { if (c >= 0 && c < W && rr >= 0 && rr < rows) tiles[c * rows + rr] = t; };
  var RF = function (f) { return rows - 3 - f * H; }, coins = [], enemies = [], specials = [], wps = [], maxGap = Math.max(2, Math.min(4, lim.gapWalk));
  for (var rr = 0; rr < rows; rr++) { put(0, rr, T.SOLID); put(W - 1, rr, T.SOLID); }
  for (var c = 0; c < W; c++) put(c, 0, T.SOLID);
  var dirs = [], f, c0, holes = [];
  for (f = 0; f < F; f++) {
    var rf = RF(f), endL = 12, endR = W - 13, gaps = [];
    for (c = 1; c < W - 1; c++) put(c, rf, T.SOLID);
    if (f === 0) for (c = 1; c < W - 1; c++) for (rr = rf + 1; rr < rows; rr++) put(c, rr, T.SOLID);
    // gaps along the floor (pits on the bottom floor, drops onto the floor below elsewhere)
    var x = endL + rnd(2, 5);
    while (x < endR - 8) { if (r() < 0.55 + 0.3 * diff) { var gw = rnd(2, maxGap); for (var q = 0; q < gw; q++) { put(x + q, rf, 0); if (f === 0) for (rr = rf + 1; rr < rows; rr++) put(x + q, rr, 0); } gaps.push([x, gw]); x += gw; } x += rnd(7, 13); }
    var inGap = function (cc) { return gaps.some(function (g2) { return cc >= g2[0] - 1 && cc <= g2[0] + g2[1]; }); };
    for (c = endL + 3; c < endR - 2; c++) { if (inGap(c)) continue;
      var rv = r(); if (rv < 0.05 + 0.08 * diff) put(c, rf - 1, T.SPIKE); else if (rv < 0.09 + 0.05 * diff && c % 3 === 0) enemies.push({ t: E.WALKER, x: c * TS, y: rf * TS - 12, w: 12, h: 12, spd: 0.4 + 0.3 * r(), dir: r() < 0.5 ? -1 : 1, mn: (c - 3) * TS, mx: (c + 4) * TS });
      else if (rv < 0.12 + 0.05 * diff && c % 7 === 0 && f > 0) enemies.push({ t: E.FLYER, x: c * TS, y: (rf - 4) * TS, w: 14, h: 10, ax: c * TS, ay: (rf - 4) * TS, rg: 30, sp: 1 / 240, ph: r(), am: 8, spd: 0 }); }
    for (c = 4; c < W - 4; c += 5) if (!inGap(c) && tiles[c * rows + rf - 1] === 0 && r() < 0.6) { coins.push({ x: c * TS + 8, y: (rf - 1.5) * TS, b: 0 }); coins.push({ x: (c + 1) * TS + 8, y: (rf - 1.5) * TS, b: 0 }); }
    if (specials.length < 5 && f > 0 && r() < 0.7) specials.push({ x: Math.floor(W / 2 + rnd(-8, 8)) * TS, y: (rf - 3) * TS });
    // stairs up to the next floor, at the right end after even floors, at the left end after odd floors
    if (f < F - 1) {
      var right = f % 2 === 0, m = right; dirs.push(right);
      var mc = function (cc) { return right ? W - 2 - cc : 1 + cc; };   // cc counts from the wall
      var ru = rf - H; holes.push([mc(1), ru], [mc(2), ru]);
      for (var s = 0; s < 3; s++) { var rowS = rf - 6 + s * 2, c0s = s === 0 ? 1 : 2 * s + 4, c1s = s === 0 ? 5 : 2 * s + 5; for (var cc = c0s; cc <= c1s; cc++) { put(mc(cc), rowS, T.SOLID); } }
    }
  }
  holes.forEach(function (h) { put(h[0], h[1], 0); });
  // the hole above stair f leaves the floor f+1 gap at the wall side; make sure the wall-side cells stay clean of spikes/enemies
  enemies = enemies.filter(function (e) { var cc = Math.floor(e.x / TS); return cc > 12 && cc < W - 13; });
  for (c = 0; c < W; c++) for (f = 0; f < F; f++) { var rf2 = RF(f); if ((c < 12 || c > W - 13) && tiles[c * rows + rf2 - 1] === T.SPIKE) put(c, rf2 - 1, 0); }
  // waypoints along the route
  var start = { x: 3 * TS + 2, y: RF(0) * TS - P.SH };
  for (f = 0; f < F; f++) {
    var rfw = RF(f), goingRight = f % 2 === 0, lo = 14, hi = W - 15, step = 12;
    var seq = []; if (goingRight) for (c = lo; c <= hi; c += step) seq.push(c); else for (c = hi; c >= lo; c -= step) seq.push(c);
    seq.forEach(function (cw) { var cx = cw; for (var tries = 0; tries < 6; tries++) { var okc = tiles[cx * rows + rfw] === T.SOLID && tiles[(cx - 1) * rows + rfw] === T.SOLID && tiles[(cx + 1) * rows + rfw] === T.SOLID && tiles[cx * rows + rfw - 1] === 0; if (okc) break; cx += goingRight ? 1 : -1; } if (f === F - 1 && ((goingRight && cw >= hi - 1) || (!goingRight && cw <= lo + 1))) return; wps.push({ k: 'at', x: cx * TS + 8, y: rfw * TS - 7 }); });
    if (f < F - 1) {
      var rt = f % 2 === 0, mcc = function (cc) { return rt ? W - 2 - cc : 1 + cc; }, rf3 = RF(f);
      for (var s2 = 2; s2 >= 0; s2--) { var rowS2 = rf3 - 6 + s2 * 2, a0 = s2 === 0 ? 1 : 2 * s2 + 4, a1 = s2 === 0 ? 2 : 2 * s2 + 5; wps.push({ k: 'at', x: (mcc(a0) + mcc(a1) + 1) / 2 * TS, y: rowS2 * TS - 7 }); }
      wps.push({ k: 'at', x: (mcc(6)) * TS + 8, y: RF(f + 1) * TS - 7 });
    }
  }
  var topF = F - 1, gRight = topF % 2 === 0, gxc = gRight ? W - 8 : 8, gx = gxc * TS, gy = RF(topF) * TS;
  var cpf = Math.floor(F / 2), cp = { x: Math.floor(W / 2) * TS + 2, y: RF(cpf) * TS - P.SH };
  while (specials.length < 5) specials.push({ x: rnd(10, W - 10) * TS, y: (RF(rnd(0, F - 1)) - 3) * TS });
  return { seed: seed, n: n, kind: 'zigzag', attempt: a, diff: diff, w: W, rows: rows, tiles: tiles, gt: new Array(W).fill(rows - 2), coins: coins, special: specials, enemies: enemies, movers: [], cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * rows),
    route: wps.concat([{ k: 'goal', x: gx, y: gy - 10 }]), puzzle: true, vertical: true, goalRect: { x: gx - 8, y: gy - 4 * TS, w: 16, h: 4 * TS }, goalX: gx, poleCol: Math.floor(gx / TS), poleY: gy,
    start: start, cp: cp, time: 260 + F * 60, theme: 15, room: false, hasBoss: false, kindAsked: 'zigzag', hasFire: false, hasIce: false, hasMud: false };
}
// rising-lava tower: the vertical climb with lava flooding up from below (auto-scroll upward; the pace is tuned to the solver in generate())
function buildLavaTower(seed, n, a) {
  var L = buildVertical(seed, n, a, 'tower'); L.kind = 'lavatower'; L.kindAsked = 'lavatower'; L.rise = { y0: L.rows * TS + 40, v: 0.01, delay: 200 };
  L.time = 400; return L;
}
// ------------------------------------------------------------------ vertical levels: a tower to climb (goal at the top) and a deep shaft to descend (goal pad at the bottom, lava below)
function buildVertical(seed, n, a, kind) {
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 11)), lim = probe(), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, W = 26, up = kind === 'tower';
  var steps = up ? Math.round(11 + diff * 11 + r() * 3) : Math.round(7 + diff * 6 + r() * 2), maxRise = Math.max(2, Math.min(3, lim.up - 1)), seq = [], i, tot = 0;
  for (i = 0; i < steps; i++) { var d = up ? rnd(2, maxRise) : rnd(3, 6); seq.push(d); tot += d; }
  var rows = up ? tot + 12 : tot + 12, fb = rows - 3, tiles = new Uint8Array(W * rows), put = function (c, rr, t) { if (c >= 0 && c < W && rr >= 0 && rr < rows) tiles[c * rows + rr] = t; };
  var coins = [], enemies = [], movers = [], plats = [], c0, len, row, prev = null, wps = [];
  for (var rr = 0; rr < rows; rr++) { put(0, rr, T.SOLID); put(W - 1, rr, T.SOLID); }
  function platform(cA, ln, rw) { for (var q = 0; q < ln; q++) { put(cA + q, rw, T.SOLID); } plats.push({ c: cA, len: ln, row: rw }); }
  var cx = 13;
  if (up) {   // floor, then platforms climbing upwards
    for (var c = 1; c < W - 1; c++) { put(c, fb, T.SOLID); put(c, fb + 1, T.SOLID); put(c, fb + 2, T.SOLID); }
    prev = { c: 1, len: W - 2, row: fb }; row = fb;
    for (i = 0; i < steps; i++) {
      row -= seq[i]; len = rnd(4, 7); var pe = prev.c + prev.len, side = r() < 0.5 ? 1 : -1, tries = 0;
      for (;;) { c0 = side > 0 ? pe + rnd(-2, 2) : prev.c + rnd(-2, 2) - len; if (c0 >= 2 && c0 + len <= W - 2) break; side = -side; if (++tries > 3) { c0 = Math.max(2, Math.min(W - 2 - len, c0)); break; } }
      platform(c0, len, row); prev = { c: c0, len: len, row: row };
    }
  } else {    // descending: a start ledge at the top, platforms below, lava at the bottom around a landing pad
    row = 5; len = 8; c0 = Math.floor((W - len) / 2); platform(c0, len, row); prev = { c: c0, len: len, row: row };
    // full-width floors, each with ONE hole; consecutive holes are far apart, so the hero cannot drop straight through the shaft: it lands on every floor and has to walk across to the next hole
    var holeMid = c0 + len / 2, hcur = null;
    for (i = 0; i < steps; i++) {
      row += Math.max(4, seq[i]); var hw = rnd(4, 5), hc = 0, tr2 = 0;
      do { hc = rnd(3, W - 3 - hw); tr2++; } while (Math.abs(hc + hw / 2 - holeMid) < 9 && tr2 < 30);
      for (c = 1; c < W - 1; c++) if (c < hc || c >= hc + hw) put(c, row, T.SOLID);
      if (hc - 1 >= 2) plats.push({ c: 1, len: hc - 1, row: row }); if (W - 2 - (hc + hw) >= 2) plats.push({ c: hc + hw, len: W - 2 - (hc + hw), row: row });
      var edgeC = holeMid < hc + hw / 2 ? hc - 1 : hc + hw; wps.push({ k: 'at', x: (edgeC + 0.5) * TS, y: row * TS - 7 });
      holeMid = hc + hw / 2; prev = { c: hc, len: hw, row: row };
    }
    // pad: raised to the lava surface level, lava on both sides above a solid floor
    var padLen = 8, padC = Math.max(2, Math.min(W - 2 - padLen, prev.c + Math.floor(prev.len / 2) - 4)), top = fb - 1;
    for (c = 1; c < W - 1; c++) { put(c, fb + 1, T.SOLID); put(c, fb + 2, T.SOLID); put(c, fb, (c >= padC && c < padC + padLen) ? T.SOLID : T.LAVA); put(c, top, (c >= padC && c < padC + padLen) ? T.SOLID : T.LAVA); }
    for (c = padC; c < padC + padLen; c++) put(c, top - 0, T.SOLID);
    // the lava surface is row top: pad tiles at rows top..fb are solid (hero stands on row top)
    plats.push({ c: padC, len: padLen, row: top, pad: true }); prev = { c: padC, len: padLen, row: top };
  }
  // ---- decoration: spikes mid-platform, walkers, coins; a few special collectibles
  plats.forEach(function (p, k) {
    var mid = p.c + Math.floor(p.len / 2);
    if (!p.pad && p.len >= 6 && k > 0 && r() < 0.3 + 0.4 * diff) put(mid, p.row - 1, T.SPIKE);
    if (!p.pad && p.len >= 6 && k > 1 && r() < 0.25 + 0.5 * diff) enemies.push({ t: E.WALKER, x: (p.c + 1) * TS, y: p.row * TS - 12, w: 12, h: 12, spd: 0.4 + 0.3 * r(), dir: r() < 0.5 ? -1 : 1, mn: (p.c + 0.5) * TS, mx: (p.c + p.len - 0.5) * TS });
    if (r() < 0.6) for (var q = 0; q < 3; q++) coins.push({ x: (p.c + 1.5 + q) * TS, y: (p.row - 1.5) * TS, b: 0 });
    if (k > 2 && r() < 0.35 * (0.4 + diff)) enemies.push({ t: E.FLYER, x: (p.c + p.len / 2) * TS, y: (p.row - 4) * TS, w: 14, h: 10, ax: (p.c + p.len / 2) * TS, ay: (p.row - 4) * TS, rg: 30 + r() * 24, sp: 1 / (220 + r() * 120), ph: r(), am: 8, spd: 0 });
  });
  var last = prev, gx = (last.c + Math.floor(last.len / 2)) * TS, gy = last.row * TS, specials = [];
  for (i = 0; i < 5; i++) { var pp = plats[Math.min(plats.length - 1, Math.floor((i + 0.5) * plats.length / 5))]; specials.push({ x: (pp.c + 2) * TS, y: (pp.row - 3) * TS }); }
  var start = up ? { x: 4 * TS + 2, y: fb * TS - P.SH } : { x: (plats[0].c + 2) * TS, y: plats[0].row * TS - P.SH };
  var mp = plats[Math.floor(plats.length / 2)], gtv = []; for (c = 0; c < W; c++) gtv.push(up ? fb : fb + 1);
  var L = { seed: seed, n: n, kind: kind, attempt: a, diff: diff, w: W, rows: rows, tiles: tiles, gt: gtv, coins: coins, special: specials, enemies: enemies, movers: movers, cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * rows),
    route: (up ? plats.slice(0, -1).filter(function (p) { return !p.pad; }).map(function (p) { return { k: 'at', x: (p.c + 1.5) * TS, y: p.row * TS - 7 }; }) : wps).concat([{ k: 'goal', x: gx, y: gy - 10 }]), puzzle: true, vertical: true, goalRect: { x: gx - 8, y: gy - 4 * TS, w: 16, h: 4 * TS }, goalX: gx, poleCol: Math.floor(gx / TS), poleY: gy,
    start: start, cp: { x: (mp.c + 1) * TS, y: mp.row * TS - P.SH }, time: 150 + Math.floor(rows * 2.5), theme: KIND_THEME[kind], room: false, hasBoss: false, kindAsked: kind, hasFire: false, hasIce: false, hasMud: false };
  return L;
}

function roomLevel(seed, n, secret) {
  var L = null;
  for (var a = 0; a < 10; a++) { L = build(seed, n + 500 + a, a, { room: true, kind: 'plain' }); L.theme = 1; L.enemies = []; L.rings = []; L.special = []; L.cannons = []; L.exitKind = secret ? 'secret' : 'ret'; var v = validate(L); if (v.ok) { L.valid = true; L.script = v.script; return L; } }
  L.valid = false; return L;
}
function generate(seed, n, o) {
  var L = null, v = null, t0 = Date.now();
  for (var a = 0; a < 16; a++) {
    var oo = o; if (a >= 6 || Date.now() - t0 > 2500) { oo = {}; for (var k in (o || {})) oo[k] = o[k]; oo.boss = 0; }   // fallback: simpler boss arena
    L = build(seed, n, a, oo); v = L.plan ? { ok: !!L.planOk, script: L.plan, nodes: 0 } : (L.kindFail ? { ok: false } : validate(L));
    if (v.ok && L.rise) { var climb = L.rows * TS - 100, frames = v.script.length; L.rise.v = Math.max(0.06, Math.min(0.5, climb / (frames * 1.9))); L.rise.delay = 240; }
    if (v.ok) { L.script = v.script; if (replay(L)) { var cc = checkContainment(L); if (!cc.bad) { L.valid = true; L.attempt = a; L.vnodes = v.nodes; L.crumbs = L.plan ? null : makeCrumbs(L); if (L.kindAsked === 'gauntlet') L.time = Math.min(L.time, Math.ceil(L.script.length / 60 * 1.6) + 14); return L; } } }
    if (Date.now() - t0 > (L.kindAsked === 'gates' ? 9500 : 4200)) break;   // the segment-composed stages are built piece by piece and may need a second attempt
  }
  L.valid = false; L.attempt = 16; return L;
}
// replay the validator's input script on a fresh enemy-free state: proves the flag is reachable with the real physics
function makeCrumbs(L) { var st = vState(L), out = [], last = -99; for (var i = 0; i < L.script.length; i++) { var px0 = st.p.x + 6, py0 = st.p.y + 7, sg0 = st.stage, tc0 = st.tc, kb0 = st.kb, sb0 = st.sb; step(st, L.script[i]); if (st.stage !== sg0 || st.tc !== tc0 || st.kb !== kb0 || st.sb !== sb0) { out.push([Math.round(px0), Math.round(py0), sg0]); last = i; } if (st.p.dead || st.p.won) break; if (i - last >= 36 && st.p.ground) { out.push([Math.round(st.p.x + 6), Math.round(st.p.y + 7), st.stage]); last = i; } } out.push([Math.round(L.goalX), Math.round(L.poleY - 8), (L.route ? L.route.length - 1 : 0)]); return out; }
function replay(L) { var st = vState(L); if (!L.script) return false; for (var i = 0; i < L.script.length; i++) { step(st, L.script[i]); if (st.p.dead) return false; if (st.p.won) return true; } return st.p.won; }

root.PF.probe = probe; root.PF.build = build; root.PF.generate = generate; root.PF.validate = validate; root.PF.checkContainment = checkContainment; root.PF.replay = replay; root.PF.makeCrumbs = makeCrumbs; root.PF.searchStage = searchStage; root.PF.searchIter = searchIter; root.PF.gateSeg = gateSeg; root.PF.TRANSIT = TRANSIT; root.PF.segLevel = segLevel; root.PF.roomLevel = roomLevel; root.PF.worldMap = worldMap; root.PF.worldInfo = worldInfo; root.PF.worldExists = worldExists; root.PF.validateWorldMap = validateWorldMap; root.PF.validateInfinite = validateInfinite; root.PF.unlocked = unlocked; root.PF.kindOf = kindOf; root.PF.worldKinds = worldKinds; root.PF.KIND_NAMES = KIND_NAMES; root.PF.THEME_NAMES = THEME_NAMES; root.PF.pickTheme = pickTheme; root.PF.LAYOUT_THEMES = LAYOUT_THEMES;
})(typeof window !== 'undefined' ? window : globalThis);
