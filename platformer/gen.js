// Shape World - procedural level generator, world map, bonus rooms and the completability validator.
(function (root) {
// ======================================================================================================
// gen.js: the level generator of Shape World. It owns three things: the level builders (one build* per level
// kind), the world map graph (worlds -> level nodes -> endings/secret exits) and the completability proof.
// Pipeline of generate(seed, n): build() makes a candidate level (seeded, so it is reproducible) ->
// validate() searches a route on the REAL physics (sim.js step) with macro moves and enemy-aware stages ->
// replay() re-runs that input script on a fresh state to prove the flag is reached -> checkContainment()
// rejects water/lava/poison that would leak -> makeCrumbs() turns the script into a breadcrumb trail.
// Any failure redraws with the next attempt index (a), which simplifies things (e.g. no boss arena variant).
// ======================================================================================================
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
// vines: is a vine tile within 6 columns of the hero (cheap test before the climb macros are tried)
function vineNear(st) { var L = st.L, R = L.rows || PF.ROWS, c0 = Math.floor((st.p.x + 6) / TS), vc = L._vc; if (!vc) { vc = L._vc = {}; for (var i = 0; i < L.tiles.length; i++) if (L.tiles[i] === PF.T.VINE) vc[Math.floor(i / R)] = 1; } for (var k = -6; k <= 6; k++) if (vc[c0 + k]) return true; return false; }
// vine climb macro: walk toward the vine until its tile is under the hero, hold Up until the top (blocked), then jump off to the side (offDir) and land
function macroVine(st, appDir, offDir) {
  var seq = [], k, p = st.p, R = st.L.rows || PF.ROWS, onV = function () { return PF.tileAt(st, Math.floor((p.x + p.w / 2) / TS), Math.floor((p.y + p.h / 2) / TS)) === PF.T.VINE; };
  for (k = 0; k < 70 && !onV(); k++) { step(st, appDir); seq.push(appDir); if (st.p.dead || st.p.won || !p.ground) return null; }
  if (!onV()) return null;
  var y0 = p.y, still = 0;
  var vt = PF.T.VINE, cxv = function () { return Math.floor((p.x + p.w / 2) / TS); };
  for (k = 0; k < 220; k++) {
    if (PF.tileAt(st, cxv(), Math.floor((p.y + p.h / 2 - 1.4) / TS)) !== vt && PF.tileAt(st, cxv(), Math.floor((p.y + p.h - 2.4) / TS)) !== vt && k > 0) break;   // the next Up step would leave the vine's top: jump off now
    step(st, IN.UP); seq.push(IN.UP); if (p.dead || p.won) return seq; if (!p.climb && k > 0) break; if (Math.abs(p.y - y0) < 0.01) { if (++still > 2) break; } else still = 0; y0 = p.y; }
  if (!p.climb) return null;
  var jmp = offDir | IN.J; step(st, jmp); seq.push(jmp); fallPhase(st, seq, offDir); return seq;
}
// snowball macro: stop, tap Run once (a fresh press throws; the hero keeps facing the same way), then idle `wait` frames so the ball can fly, hit and freeze its target
function macroThrow(st, wait) {
  var seq = [], i;
  for (i = 0; i < 18 && (i === 0 || Math.abs(st.p.vx) > 0.05); i++) { step(st, 0); seq.push(0); if (st.p.dead || st.p.won) return seq; }
  step(st, IN.RUN); seq.push(IN.RUN);
  for (i = 0; i < wait; i++) { step(st, 0); seq.push(0); if (st.p.dead || st.p.won) return seq; }
  return st.p.ground ? seq : null;
}
function macroJump(st, hold, air, pre, preInp) {
  var seq = [];
  for (var i = 0; i < pre; i++) { step(st, preInp); seq.push(preInp); if (st.p.dead || st.p.won) return seq; }
  jumpPhase(st, seq, hold, air); return seq;
}

// swim stroke macro: n frames with a steer input and a vertical mode (0 = hold Jump and rise, 1 = hover by pulsing Jump, 2 = release and sink)
function macroSwim(st, dirInp, vmode, n) {
  var seq = [];
  for (var i = 0; i < n; i++) { var inp = dirInp | (vmode === 0 || (vmode === 1 && (i & 3) === 0) ? IN.J : 0); step(st, inp); seq.push(inp); if (st.p.dead || st.p.won) return seq; }
  return seq;
}
function inWaterNow(st) { var p = st.p; return PF.isW(PF.tileAt(st, Math.floor((p.x + p.w / 2) / TS), Math.floor((p.y + p.h / 2) / TS))); }
function nearEn(st) { var px = st.p.x, en = st.en; for (var i = 0; i < en.length; i++) { var e = en[i]; if (e.alive && Math.abs((e.ax !== undefined ? e.ax : e.x) - px) < 360) return true; } return false; }   // the enemies' phase only matters for the search while one is close
function heapPush(h, it) { h.push(it); var i = h.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (h[p].h <= h[i].h) break; var t = h[p]; h[p] = h[i]; h[i] = t; i = p; } }
function heapPop(h) { var top = h[0], last = h.pop(); if (h.length) { h[0] = last; var i = 0, n = h.length; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < n && h[l].h < h[m].h) m = l; if (r < n && h[r].h < h[m].h) m = r; if (m === i) break; var t = h[m]; h[m] = h[i]; h[i] = t; i = m; } } return top; }
var AIRS = [0, IN.R, IN.R | IN.RUN, IN.L], HOLDS = [3, 10, 99];
// best-first macro search on the real simulation from state st0 until pred(state) holds; returns { st, seq } or null
function searchStage(st0, pred, tx, ty, maxNodes) { var it = searchIter(st0, pred, tx, ty, maxNodes), r; while ((r = it.run(1e9)) === undefined); return r; }
// resumable form: run(n) expands up to n nodes and returns undefined (not finished), null (no route) or { st, seq }
function searchIter(st0, pred, tx, ty, maxNodes, hf) {
  if (pred(st0)) return { run: function () { return { st: st0, seq: [], nodes: 0 }; } };
  var seen = new Set(), heap = [], nodes = 0, swimLv = !!st0.L.swimNodes;
  function key(st) { var p = st.p, a = Math.abs(p.vx), sc = (p.vx < -0.3 ? -1 : 1) * (a < 0.3 ? 0 : a < 1.8 ? 1 : 2) + 2, ph = (p.mv >= 0 || st.sw || st.L.hasFire) ? Math.floor((st.f % MV_PERIOD) / 20) + 1 : (nearEn(st) ? 40 + Math.floor(st.f / 10) % 32 : 0); return ((((Math.round(p.x / 3) * 256 + Math.round(p.y)) * 5 + sc) * 80 + ph) * 64 + (st.kb & 7) * 8 + (st.sb & 7)) * 40 + Math.min(39, st.mod.size); }
  var snowLv = !!st0.L.snow;   // frost levels: whether an enemy is frozen and whether the hero holds the snow flower also tell search nodes apart
  function key2(st) { var k0 = key(st); if (!snowLv) return k0; var fz = 0; for (var q = 0; q < st.en.length; q++) if (st.en[q].frz > 0) fz |= 1 << Math.min(q, 10); return (k0 * 2048 + fz) * 8 + (st.p.pw & 7); }
  function hval(st) { if (hf) return hf(st); var p = st.p; return Math.abs(p.x + 6 - tx) + (ty === null ? 0 : 1.5 * Math.abs(p.y + 7 - ty)); }
  var root = { st: st0, par: null, seq: [], h: hval(st0) }; seen.add(key2(st0)); heapPush(heap, root);
  function path(nd, extra) { var parts = [extra]; while (nd) { parts.push(nd.seq); nd = nd.par; } var out = []; for (var i = parts.length - 1; i >= 0; i--) for (var j = 0; j < parts[i].length; j++) out.push(parts[i][j]); return out; }
  return { run: function (budget) {
  var lim = Math.min(maxNodes, nodes + budget);
  while (heap.length && nodes < lim) {
    var nd = heapPop(heap); nodes++;
    var found = null, tryMacro = function (fn) {
      if (found) return; var s = clone(nd.st), seq = fn(s); if (!seq || s.p.dead) return;
      if (pred(s)) { found = { st: s, seq: path(nd, seq), nodes: nodes }; return; }
      if (!s.p.ground && !(swimLv && inWaterNow(s))) return;   // swim levels keep afloat nodes too
      var k = key2(s); if (seen.has(k)) return; seen.add(k); heapPush(heap, { st: s, par: nd, seq: seq, h: hval(s) });
    };
    var mi, walks = [[IN.R, 8], [IN.R | IN.RUN, 8], [IN.L, 8], [IN.L | IN.RUN, 8], [0, 20], [IN.R | IN.RUN, 3]];
    for (mi = 0; mi < walks.length; mi++) tryMacro(function (s) { return macroWalk(s, walks[mi][0], walks[mi][1]); });
    if (nd.st.p.ground && vineNear(nd.st)) [IN.R, IN.L].forEach(function (ad) { [IN.R, IN.L].forEach(function (od) { tryMacro(function (s) { return macroVine(s, ad, od); }); }); });   // climb a vine (Up), then leave it sideways
    if (st0.L.duck && nd.st.p.big && nd.st.p.ground) [5, 8, 12, 17].forEach(function (rr2) { tryMacro(function (s) { var a = macroWalk(s, IN.R | IN.RUN, rr2); if (s.p.dead || s.p.won) return a; return a.concat(macroWalk(s, IN.DN, 40)); }); });   // run-up, then duck and slide on the momentum (one-tile holes)
    // underwater levels: short stroke macros (12 frames of swim up / hover / sink with a steer) so the search can pass through open water
    if (swimLv && inWaterNow(nd.st)) for (var sdI = 0; sdI < 3; sdI++) for (var svI = 0; svI < 3; svI++) tryMacro(function (s) { return macroSwim(s, sdI === 0 ? 0 : sdI === 1 ? IN.L : IN.R, svI, 12); });
    if (snowLv && nd.st.p.pw === 5 && nd.st.p.ground && nd.st.fb.length < 2) tryMacro(function (s) { return macroThrow(s, 34); });   // frost levels: throw a snowball
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
// chain castles end with the boss, which the enemy-free validator does not have: prove the route on a copy without the arena whose goal is the arena floor
function vcopy(L) { if (!(L.arena && L.vgoal)) return L; var C = {}; for (var k in L) C[k] = L[k]; C.arena = null; C.goalX = L.vgoal.x; C.poleY = L.vgoal.y + 10; C.goalRect = { x: L.vgoal.x - 8, y: L.vgoal.y - 4 * TS, w: 16, h: 4 * TS }; C.route = L.route.slice(0, -1).concat([{ k: 'goal', x: L.vgoal.x, y: L.vgoal.y }]); return C; }
function vState(L) { var st = newState(L, { noEn: !L.stepEn, noPM: !L.plan }); if (L.stepEn && L.reqEn && !L.plan) { st.en = st.en.filter(function (e) { return L.reqEn.indexOf(e.t) >= 0; }); st.boss = st.en.filter(function (e) { return e.t === E.BOSS; }).length; } return st; }
// completability proof: chains searchStage() calls over the level's waypoints (route stages) on the real physics; returns { ok, script, nodes }
function validate(L, maxNodes) {
  L = vcopy(L);
  var multi = L.route && L.route.length > 1; maxNodes = maxNodes || (multi ? 9000 : 4000);    // enemy-aware searches are expensive: fail fast and redraw
  var st = vState(L), seq0 = [0, 0, 0]; runSeq(st, seq0);
  if (!st.p.ground) return { ok: false, why: 'start' };
  var route = L.route || [{ k: 'goal', x: L.goalX, y: null }], script = seq0.slice(), total = 0;
  for (var i = 0; i < route.length; i++) {
    var g = route[i], ty = g.y === undefined ? null : g.y, tx = g.x === undefined ? L.goalX : g.x;
    var res = g.k === 'ropeDone' ? PF.ropeSolve(st, g, 220) : searchStage(st, function (s) { return (PF.stageDone(s, g) || (g.k === 'near' && s.stage > i)) && !(s.p.pois > 0) && !(s.p.won && g.k === 'pw'); }, tx, ty, maxNodes);   // (an item stage must not end by running into the flag: nothing could follow)   // a stage must not end inside poison (the grace timer is still running)
    if (!res) return { ok: false, why: 'stage' + i + ':' + g.k, nodes: total };
    total += res.nodes; st = res.st; for (var j = 0; j < res.seq.length; j++) script.push(res.seq[j]);
  }
  return { ok: !!st.p.won, script: script, nodes: total, why: st.p.won ? '' : 'nowin' };
}

// no creature in or just beyond a rope gap (the crossing needs a quiet flight and a safe landing)
function ropeClear(L) {
  L.route.forEach(function (g, gi) { if (g.k !== 'ropeDone' || gi < 1) return; var a = L.route[gi - 1].x2 + 12 - 40, b = g.x + 130;
    L.enemies = L.enemies.filter(function (e) { var lo = e.mn !== undefined ? Math.min(e.x, e.mn) : e.x, hi = e.mx !== undefined ? Math.max(e.x + (e.w || 0), e.mx) : e.x + (e.w || 0); return !(hi > a && lo < b); }); });
}
// Rope gap check on a flat test level with the real physics: gw-wide pit, ground row g, ropes of the given lengths (pivot 44 px + len above the ledge, evenly spread); cached.
var ROPE_CACHE = {};
function ropeProbe(gw, g, lens) {
  var key = gw + ',' + g + ',' + lens.join(','); if (ROPE_CACHE[key] !== undefined) return ROPE_CACHE[key];
  var pc = 12, w = pc + gw + 14, tiles = new Uint8Array(w * ROWS), n = lens.length, c, r, ok = true;
  for (c = 0; c < w; c++) { var top = (c >= pc && c < pc + gw) ? ROWS : g; for (r = top; r < ROWS; r++) tiles[c * ROWS + r] = 1; }
  var ropes = lens.map(function (len, i) { return { px: (pc + gw * (i + 1) / (n + 1)) * TS, py: g * TS - 44 - len, len: len, land: (pc + gw) * TS + 6 }; });
  [4, 1].forEach(function (back) {
    if (!ok) return;
    var L = { w: w, tiles: tiles, coins: [], enemies: [], movers: [], goalX: 99999, poleY: 0, time: 999, start: { x: (pc - back) * TS, y: g * TS - P.SH }, cp: { x: 99999, y: 0 }, ropes: ropes };
    var st = newState(L, { noEn: true, noPM: true }); runSeq(st, [0, 0, 0]);
    ok = !!PF.ropeSolve(st, { i0: 0, n: n, x: (pc + gw) * TS + 6 }, 150);
  });
  return (ROPE_CACHE[key] = ok);
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
var KIND_THEME = { plain: 0, hills: 0, flood: 3, deep: 3, toxic: 10, frost: 8, tiny: 0, ghost: 2, sky: 1, cave: 5, bonus: 1, castle: 4, autumn: 6, jungle: 7, snow: 8, desert: 9, swamp: 10, storm: 11, airship: 12, crystal: 13, volcano: 14, ruins: 15, factory: 16, neon: 17, glacier: 22, tower: 18, shaft: 19, chase: 20, skymaze: 1, aircourse: 1, flystep: 1, voidhop: 1, cloudway: 1, skyclimb: 1, spinway: 1, gates: 15, odyssey: 0, zigzag: 15, lavatower: 14, gauntlet: 21, bossrush: 4, maze: 5, house: 0 };
var KIND_NAMES = { autumn: ['가을 과수원', 'Autumn Orchard'], jungle: ['정글', 'Jungle'], snow: ['설원', 'Snowfield'], desert: ['사막', 'Desert'], swamp: ['늪', 'Swamp'], storm: ['폭풍 구름', 'Storm Clouds'], airship: ['비행선', 'Airship Fleet'], crystal: ['수정 동굴', 'Crystal Cavern'], volcano: ['화산', 'Volcano'], ruins: ['유적', 'Ruins'], factory: ['공장', 'Factory'], neon: ['네온 도시', 'Neon City'], skymaze: ['공중 미로', 'Sky Labyrinth'], aircourse: ['공중 코스', 'Sky Course'], gates: ['변신 관문', 'Power Gates'], odyssey: ['구불구불 여정', 'Winding Journey'], flystep: ['날것 징검다리', 'Flyer Hops'], voidhop: ['허공 건너기', 'Void Hop'], cloudway: ['구름 징검다리', 'Cloudway'], skyclimb: ['하늘 오르기', 'Sky Climb'], spinway: ['회전 하늘길', 'Spinway'], zigzag: ['굽이굽이 성', 'Switchback Keep'], lavatower: ['용암 탑', 'Rising Lava Tower'], glacier: ['얼음 지대', 'Ice Fields'], tower: ['탑 오르기', 'Tower Climb'], shaft: ['깊은 수직굴', 'Deep Shaft'], chase: ['추격전', 'Chase'], gauntlet: ['시간제 관문', 'Timed Gauntlet'], bossrush: ['보스 러시', 'Boss Rush'], cannon: ['대포', 'Cannon'], plain: ['초원', 'Meadow'], hills: ['언덕', 'Hills'], flood: ['물가', 'Lagoon'], deep: ['심해', 'Deep Sea'], toxic: ['독 늪', 'Toxic Marsh'], frost: ['빙결 관문', 'Frost Gates'], tiny: ['소인국', 'Tiny Realm'], ghost: ['유령의 숲', 'Haunted Grove'], sky: ['하늘길', 'Sky Path'], cave: ['동굴', 'Cavern'], castle: ['성채', 'Fortress'], maze: ['미궁', 'Labyrinth'], room: ['비밀방', 'Bonus Room'], bonus: ['별길', 'Star Road'], house: ['도박집', 'Gamble House'] };
function effN(n) { return n >= 1000 ? n : n + 5 - (n === 1 ? 2 : 0); }   // the difficulty curve starts one world later (stage 1 stays gentle)
// every world: a gentle starter, three stages from a seeded rotation of all the other kinds (so neighbouring stages and worlds feel different), one labyrinth, and the ending
// map types (layouts) x themes (looks): 20 x 23 = 460 combinations. Layout list (20): plain, hills + the rotation below (flood sky cave ice storm swamp crystal airship ruins factory volcano ghost-maze tower shaft chase gauntlet sky-labyrinth) + the labyrinth slot (key rooms / tunnel grid). Castles, cannons and bonus stages keep their own look.
var STARTERS = ['plain', 'hills'], ROTATION = ['odyssey', 'flood', 'deep', 'toxic', 'frost', 'tiny', 'sky', 'cloudway', 'voidhop', 'skyclimb', 'spinway', 'gates', 'cave', 'glacier', 'zigzag', 'lavatower', 'aircourse', 'crystal', 'flystep', 'airship', 'ruins', 'factory', 'volcano', 'ghost', 'tower', 'shaft', 'chase', 'gauntlet', 'skymaze'];
var THEME_COUNT = 34, THEME_NAMES = [['초원', 'Meadow'], ['하늘', 'Sky'], ['유령', 'Haunted'], ['물가', 'Lagoon'], ['성채', 'Fortress'], ['동굴', 'Cavern'], ['가을', 'Autumn'], ['정글', 'Jungle'], ['설원', 'Snow'], ['사막', 'Desert'], ['늪', 'Swamp'], ['폭풍', 'Storm'], ['비행선', 'Airship'], ['수정', 'Crystal'], ['화산', 'Volcano'], ['유적', 'Ruins'], ['공장', 'Factory'], ['네온', 'Neon'], ['탑', 'Tower'], ['수직굴', 'Shaft'], ['추격', 'Chase'], ['시간제', 'Timed'], ['빙하', 'Glacier'], ['땅속', 'Underground'], ['용암 땅속', 'Magma Tunnels'], ['얼음 땅속', 'Frozen Burrows'], ['땅속 동굴', 'Deep Cavern'], ['수정 광산', 'Crystal Mines'], ['푸른 초원', 'Lush Meadow'], ['대나무 숲', 'Bamboo Grove'], ['청록 산호초', 'Teal Reef'], ['민트 하늘', 'Mint Sky'], ['비취 사원', 'Jade Temple'], ['오로라', 'Aurora']];
// which looks go with which map type (no snow with lava, no meadow in a dark maze ...): 0 meadow 1 sky 2 haunted 3 lagoon 4 fortress 5 cavern 6 autumn 7 jungle 8 snow 9 desert 10 swamp 11 storm 12 airship 13 crystal 14 volcano 15 ruins 16 factory 17 neon 18 tower 19 shaft 20 chase 21 timed 22 glacier
var HOT = [2, 4, 5, 9, 14, 15, 16, 17, 19, 20, 21, 24], DARK = [2, 4, 5, 10, 13, 15, 16, 17, 19, 23, 26, 27], AIRY = [0, 1, 6, 11, 12, 13, 17, 18, 31], COLD = [1, 5, 8, 11, 13, 18, 22, 33], WET = [0, 3, 5, 6, 7, 10, 13, 30, 29];
var LAYOUT_THEMES = { plain: [0, 1, 3, 6, 7, 8, 9, 10, 11, 13, 22, 28, 29, 30, 31, 32, 33], hills: [0, 1, 6, 7, 8, 9, 10, 11, 22, 28, 29, 30, 31, 32, 33], autumn: [6, 6, 6, 28, 31], jungle: [7, 7, 28, 29, 32, 30], snow: [8, 22, 8, 22, 33, 31], desert: [9, 9, 9, 15, 32], flood: WET, deep: [3, 3, 3, 13, 26, 27, 25], toxic: [10, 10, 3, 7, 13, 5], frost: [8, 22, 25, 1, 13], tiny: [0, 6, 7, 23, 26, 28, 29, 31], sky: AIRY, cloudway: AIRY, skyclimb: AIRY, spinway: AIRY, cave: [5, 2, 9, 10, 13, 15, 16, 19, 22, 23, 24, 25, 26, 27, 23, 26], glacier: COLD, zigzag: [2, 4, 5, 9, 12, 13, 15, 16, 17, 19, 22, 8, 23, 24, 26], lavatower: HOT, crystal: [13, 5, 1, 17, 22, 8, 18], airship: [12, 1, 11, 18, 17, 0, 6, 31], ruins: [15, 2, 5, 7, 9, 10, 19, 4], factory: [16, 17, 12, 19, 5, 20, 21, 15], volcano: HOT, ghost: [2, 15, 19, 4, 10, 5], tower: [18, 1, 0, 6, 8, 11, 22, 13, 17, 12, 15], shaft: [19, 5, 14, 15, 16, 4, 17, 2, 10, 9, 23, 24, 25, 26, 27], chase: [20, 14, 9, 16, 17, 4, 19, 12, 11, 2, 15], gauntlet: [21, 17, 16, 12, 11, 1, 13, 18, 0, 6, 9], skymaze: AIRY.concat([12]), aircourse: AIRY.concat([12, 22]), gates: [0, 1, 6, 7, 9, 15, 16, 4, 5, 2, 22, 8, 28, 29, 32], odyssey: [0], flystep: AIRY.concat([12, 22]), voidhop: [1, 17, 13, 11, 12, 18], maze: DARK };
function pickTheme(seed, n, kind) { var list = LAYOUT_THEMES[kind]; if (!list) return hash(seed, n, 911) % THEME_COUNT; if (n === 1 && list.indexOf(0) >= 0) return 0; return list[hash(seed, n, 911) % list.length]; }
function unlocked(depth) { return Math.min(ROTATION.length, 6 + depth * 3); }   // new kinds are mixed in as the world index grows
// the 5 level kinds of world w: a starter, three from the shuffled rotation unlocked so far (a tower or shaft is mixed in by world parity), a maze in one slot, then the castle
// stages per world grow with depth: 5 at depth 0, ~8 at depth 5, tending to 10; level numbers n run continuously along the main chain (base = stages of all shallower depths)
function stageCount(d) { return Math.round(10 - 5 / (1 + d / 5)); }
var _sb = [0];
function stageBase(d) { while (_sb.length <= d) { var k = _sb.length - 1; _sb.push(_sb[k] + stageCount(k)); } return _sb[d]; }
function stageOf(n) { n = Math.max(1, n | 0); var d = 0; while (stageBase(d + 1) < n) d++; return { depth: d, index: n - 1 - stageBase(d), S: stageCount(d) }; }
// stages built by the special builders (mazes, towers, journeys, sea, marsh ...) have no ring, so only ordinary stages (the starter included) can carry a secret exit
var NO_RING = { maze: 1, ghost: 1, gates: 1, odyssey: 1, skymaze: 1, aircourse: 1, flystep: 1, voidhop: 1, cloudway: 1, skyclimb: 1, spinway: 1, zigzag: 1, lavatower: 1, tower: 1, shaft: 1, deep: 1, toxic: 1, frost: 1, tiny: 1, house: 1, castle: 1, bossrush: 1 };
// the S level kinds of world w (S = stageCount(depth)): a starter, a slot-1 journey/vertical stage, S-3 more from the shuffled rotation unlocked so far, one maze, then the castle
function worldKinds(seed, w, depth) {
  depth = depth || 0; var S = stageCount(depth), pool = ROTATION.slice(0, unlocked(depth)), r = rng(hash(seed, w, 1357)), i, j, t;
  for (i = pool.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  // trajectory complexity ramps up with the world index: complex kinds (winding journey, switchback, sky labyrinth / air course, flyer hops, gates, ghost house, deep sea) are drawn with a probability that grows from 10% to 90%; the rest are plain horizontal or vertical stages
  var CXK = { odyssey: 1, zigzag: 1, skymaze: 1, aircourse: 1, flystep: 1, voidhop: 1, skyclimb: 1, spinway: 1, gates: 1, ghost: 1, deep: 1 }, pc = Math.min(0.9, 0.1 + 0.1 * depth);
  var out = [STARTERS[Math.floor(r() * STARTERS.length)]]; var vk = (w % 2 === 0) ? 'tower' : 'shaft'; pool = pool.filter(function (k) { return k !== 'tower' && k !== 'shaft' && k !== 'odyssey'; });
  var cpool = pool.filter(function (k) { return CXK[k]; }), spool = pool.filter(function (k) { return !CXK[k]; });
  out.push(w === 0 ? 'flood' : r() < Math.min(0.97, 0.45 + 0.1 * depth) ? 'odyssey' : vk);   /* the winding journey is hard: it first appears from level 3 on (world 0's second stage is a lagoon) */
  for (i = 0; i < S - 3; i++) {
    var pk, prev = out[out.length - 1];
    if (!cpool.length && !spool.length) { var rf = pool.slice(); for (j = rf.length - 1; j > 0; j--) { var j2 = Math.floor(r() * (j + 1)); t = rf[j]; rf[j] = rf[j2]; rf[j2] = t; } cpool = rf.filter(function (k) { return CXK[k]; }); spool = rf.filter(function (k) { return !CXK[k]; }); }   // long worlds: reshuffle the pool once it runs dry
    if (depth > 0 && r() < pc && cpool.length) pk = cpool.shift(); else if (spool.length) pk = depth > 0 && r() < 0.25 ? (i % 2 ? 'tower' : 'shaft') : spool.shift(); else pk = cpool.length ? cpool.shift() : 'plain';
    for (var gd = 0; pk === prev && gd < 4; gd++) pk = pk === 'tower' ? 'shaft' : pk === 'shaft' ? 'tower' : spool.length ? spool.shift() : cpool.length ? cpool.shift() : 'hills';   // never the same kind twice in a row
    out.push(pk); }
  var mp = depth === 0 ? 3 : 1 + Math.floor(r() * (S - 2)); out[mp] = 'maze';
  if (hash(seed, w, 88) % 5 < 2) { var di = out[S - 2] === 'maze' ? S - 3 : S - 2; if (out[di] !== 'maze') out[di] = 'deep'; }   // a fully underwater stage in about two worlds out of five
  if (hash(seed, w, 89) % 4 === 0) { var ti = (out[2] !== 'maze' && out[2] !== 'deep') ? 2 : (out[S - 2] !== 'maze' && out[S - 2] !== 'deep') ? S - 2 : -1; if (ti >= 0) out[ti] = 'toxic'; }   // a poison marsh in about a quarter of the worlds
  // the cannon ending hides behind a secret exit in one of the last two levels (S-3, S-2): at least one of them must be able to carry a ring, else it becomes a generic stage
  if (NO_RING[out[S - 3]] && NO_RING[out[S - 2]]) { var fi = out[S - 2] !== 'maze' ? S - 2 : S - 3, gk = out[fi - 1] === 'hills' || out[fi + 1] === 'hills' ? 'plain' : 'hills'; out[fi] = gk; }
  out.push('castle'); return out;
}
// the super map is an endless DAG of worlds generated lazily from the seed: id = depth * 3 + slot; depth 0 has 1 world, depth 1 has 2, deeper depths have 3 (forks and merges everywhere)
var _wi = {};
function worldInfo(seed, wid) {
  var key = seed + ':' + wid; if (_wi[key]) return _wi[key];
  var d = Math.floor(wid / 3), s = wid % 3, h = function (k) { return hash(seed, wid, 6000 + k); }, mainEnd = 'castle'   /* the cannon ending exists only behind secret exits: walking the normal exits always ends in the castle */, cs, cn;
  if (d === 0) { cs = 0; cn = 1; } else if (d === 1) { cs = s; cn = s === 1 ? 2 : 1 + (h(2) % 2); } else { cs = s; cn = (s + 1 + (h(3) % 2)) % 3; }
  // next.castle / next.cannon are the worlds the two endings lead to (depth d+1), so the paths fork and merge across slots
  var info = { id: wid, depth: d, slot: s, mainEnd: mainEnd, next: { castle: (d + 1) * 3 + cs, cannon: (d + 1) * 3 + cn } };
  // world 7 and later: in some worlds one of the two endings sends the hero BACK to an earlier world (the other ending goes on)
  if (d >= 6 && h(5) % 100 < 40) { var be = h(6) % 2 ? 'castle' : 'cannon'; info.back = be; info.next[be] = (d - 1 - (h(7) % 2)) * 3 + (h(8) % 3); }
  if (Object.keys(_wi).length > 4000) _wi = {}; _wi[key] = info; return info;
}
function worldExists(wid) { var d = Math.floor(wid / 3), s = wid % 3; return wid >= 0 && (d === 0 ? s === 0 : d === 1 ? s < 2 : true); }
// older, simpler rotation without depth, superseded by worldKinds
function worldKindsOld(seed, w) {
  var r = rng(hash(seed, w, 4242)), pool = ['hills', 'flood', 'ghost', 'sky', 'cave'], out = [w === 0 ? 'plain' : (r() < 0.5 ? 'plain' : 'hills')];
  if (w === 0) pool = ['hills', 'flood', 'ghost', 'sky', 'cave'];
  else pool = pool.filter(function (k) { return k !== out[0]; }).concat(out[0] === 'plain' ? [] : ['plain']);
  for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  for (i = 0; i < 3; i++) out.push(pool[i]);
  var mp = w === 0 ? 3 : 1 + Math.floor(r() * 3); out[mp] = 'maze';
  out.push('castle'); return out;
}
function kindOf(seed, n) { if (n >= 2000) return 'house'; if (n >= 1000) return 'bonus'; var so = stageOf(n); return worldKinds(seed, so.depth, so.depth)[so.index]; }
// the overworld map of one world: S-1 level nodes joined by a winding path, then the castle (node S-1, the main ending, never behind a secret) and the cannon (node 30, the alternate ending, reachable ONLY through a secret exit).
// A secret exit in level k opens a forward skip edge to k+3: a later level, the castle if k+3 is the castle's index, or the cannon if it lies beyond. One Gamble House (id 20) hangs off the main route or behind a secret exit.
var CANNON_ID = 30;
function secretTarget(k, S) { return k + 3 <= S - 2 ? k + 3 : k + 3 === S - 1 ? S - 1 : CANNON_ID; }
function worldMap(seed, wid, depth, mainEnd) {
  depth = depth || 0;
  var S = stageCount(depth), base = stageBase(depth), E = S - 1, r = rng(hash(seed, wid, 777)), kinds = worldKinds(seed, wid, depth), nodes = [], edges = [], i;
  var sp = Math.min(74, 340 / (S - 1)), x0 = Math.round((400 - sp * (S - 1)) / 2), y = 120 + (r() - 0.5) * 40, ya = S > 7 ? 56 : 80;
  for (i = 0; i < S; i++) {
    var nd = { i: i, n: base + i + 1, num: i + 1, kind: kinds[i], x: Math.round(x0 + sp * i), y: Math.round(y), main: true };
    if (i === E) { nd.kind = (depth >= 3 && hash(seed, wid, 8) % 3 === 0) ? 'bossrush' : 'castle'; nd.ending = 'castle'; }
    nodes.push(nd); y = Math.max(70, Math.min(160, y + (r() - 0.5) * ya)); if (i > 0) edges.push({ a: i - 1, b: i, secret: false });
  }
  var endY = nodes[E].y, cn = { i: CANNON_ID, n: base + S, num: S, kind: 'cannon', x: nodes[E].x + 4, y: Math.round(Math.max(50, Math.min(180, endY + (endY > 115 ? -60 : 60)))), main: false, ending: 'cannon' }; nodes.push(cn);
  // 1-2 ring-capable levels carry a secret exit; at least one of the last two levels (S-3, S-2) does, because only they lead to the cannon
  var ringOK = function (k) { return !NO_RING[kinds[k]]; }, late = [S - 3, S - 2].filter(ringOK), picked = [];
  if (late.length) picked.push(late[Math.floor(r() * late.length)]);
  if (depth >= 1 && r() < 0.5) { var others = []; for (i = 0; i <= S - 2; i++) if (ringOK(i) && picked.indexOf(i) < 0) others.push(i); if (others.length) picked.push(others[Math.floor(r() * others.length)]); }
  picked.sort(function (a, b) { return a - b; }); var firstSec = picked.length ? picked[0] : 0;
  picked.forEach(function (k) { nodes[k].secret = true; edges.push({ a: k, b: secretTarget(k, S), secret: true }); });
  // exactly one Gamble House per world (a one-shot bonus stage; 'item' or 'life' type, hash-chosen): a dead-end side node off the second level, or behind the first secret exit
  var hType = hash(seed, wid, 5100) % 2 ? 'life' : 'item', hHid = hash(seed, wid, 5101) % 2 === 1 && picked.length > 0, hPar = hHid ? nodes[firstSec] : nodes[1], hn = { i: 20, n: 2000 + wid * 10, kind: 'house', house: hType, main: false, hidden: hHid };
  if (hHid) { hn.x = hPar.x + 8; hn.y = Math.max(30, Math.min(192, Math.round(hPar.y + (hPar.y > 115 ? 34 : -34)))); }
  else { hn.x = hPar.x + Math.round(sp * 0.4); hn.y = Math.round(hPar.y + (hPar.y > 115 ? 34 : -34)); }
  nodes.push(hn); edges.push({ a: hPar.i, b: 20, secret: hHid, house: true });
  var wmap = { wid: wid, depth: depth, S: S, base: base, mainEnd: 'castle', endMain: E, endAlt: CANNON_ID, kinds: kinds, nodes: nodes, edges: edges };
  // world 7 and later: in some worlds one level's normal exit leads BACK to an earlier level (8-3 -> 8-1); the way on is a hidden exit found in a level at or before the trap
  if (depth >= 6 && hash(seed, wid, 6100) % 100 < 60 && picked.length) {
    var cand = []; for (i = 1; i <= S - 3; i++) cand.push(i);
    for (i = cand.length - 1; i > 0; i--) { var jj = hash(seed, wid, 6101 + i) % (i + 1), tmp = cand[i]; cand[i] = cand[jj]; cand[jj] = tmp; }
    var keep = edges.slice();
    for (var ci = 0; ci < cand.length; ci++) {
      var tr = cand[ci], keys = picked.filter(function (k) { return k <= tr && secretTarget(k, S) > tr; });
      if (!keys.length) continue;
      var bk = hash(seed, wid, 6102 + ci) % tr;
      wmap.edges = keep.filter(function (e) { return !(e.a === tr && e.b === tr + 1); }).concat([{ a: tr, b: bk, secret: false, back: true }]);
      wmap.loop = { trap: tr, back: bk, keys: keys };
      if (validateWorldMap(wmap).ok) return wmap;
    }
    wmap.edges = keep; delete wmap.loop;
  }
  return wmap;
}
function validateWorldMap(m) {
  var ids = {}, out = { ok: true, why: '' }, i; m.nodes.forEach(function (q) { ids[q.i] = q; });
  var adj = {}; m.edges.forEach(function (e) { (adj[e.a] = adj[e.a] || []).push(e); });
  function reach(allowSecret) { var seen = { 0: 1 }, st = [0]; while (st.length) { var a = st.pop(); (adj[a] || []).forEach(function (e) { if (e.secret && !allowSecret) return; if (!seen[e.b]) { seen[e.b] = 1; st.push(e.b); } }); } return seen; }
  var all = reach(true), plain = reach(false);
  m.nodes.forEach(function (q) { if (!all[q.i]) { out.ok = false; out.why = 'unreachable ' + q.i; } });
  if (!(m.loop ? all[m.endMain] : plain[m.endMain])) { out.ok = false; out.why = 'castle needs secrets'; }
  if (m.loop && plain[m.endMain]) { out.ok = false; out.why = 'loop does not block the castle'; }
  if (m.endAlt >= 0 && plain[m.endAlt]) { out.ok = false; out.why = 'cannon reachable without secrets'; }
  if (!all[m.endAlt]) { out.ok = false; out.why = 'cannon unreachable'; }
  var sec = m.edges.filter(function (e) { return e.secret && !e.house; }), branch = sec.length; if (branch < 1 || branch > 2) { out.ok = false; out.why = 'secret edges ' + branch; }
  if (!sec.some(function (e) { return e.b === m.endAlt; })) { out.ok = false; out.why = 'no secret leads to the cannon'; }
  sec.forEach(function (e) { if (e.b !== secretTarget(e.a, m.S)) { out.ok = false; out.why = 'bad secret target ' + e.a + '>' + e.b; } if (NO_RING[m.kinds[e.a]]) { out.ok = false; out.why = 'secret in ringless kind ' + e.a; } });
  // level numbers are continuous and the ending number is the world's stage count
  m.nodes.forEach(function (q) { if (q.i < m.S && q.n !== m.base + q.i + 1) { out.ok = false; out.why = 'bad n ' + q.i; } });
  if (ids[m.endMain].n !== m.base + m.S || ids[m.endAlt].n !== m.base + m.S) { out.ok = false; out.why = 'bad ending n'; }
  // the map is one connected picture when edges are read as undirected
  var und = {}; m.edges.forEach(function (e) { (und[e.a] = und[e.a] || []).push(e.b); (und[e.b] = und[e.b] || []).push(e.a); }); var us = { 0: 1 }, ust = [0]; while (ust.length) { var ua = ust.pop(); (und[ua] || []).forEach(function (b) { if (!us[b]) { us[b] = 1; ust.push(b); } }); } m.nodes.forEach(function (q) { if (!us[q.i]) { out.ok = false; out.why = 'disconnected ' + q.i; } });
  // no cycles: all edges go to nodes that are "later" (higher x) or ending nodes
  m.edges.forEach(function (e) { if (!e.back && ids[e.b].x < ids[e.a].x - 1) { out.ok = false; out.why = 'backward edge'; } });
  // every node except the endings and the house has an outgoing edge
  m.nodes.forEach(function (q) { if (!(adj[q.i] || []).length && !q.ending && q.kind !== 'bonus' && q.kind !== 'house') { out.ok = false; out.why = 'dead end ' + q.i; } });
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
// ---- theme hazards: every look has its own weather / trouble. Each pack is a list of hazard descriptors for sim.hzStep; a stage gets one pack (two once it is hard) chosen from its look
var HZ_LAYOUTS = { plain: 1, hills: 1, flood: 1, sky: 1, cave: 1, glacier: 1, crystal: 1, airship: 1, ruins: 1, factory: 1, volcano: 1 };
var GUST = function (dx, per, on) { return { gust: { dx: dx, per: per, on: on } }; };
// keyed by theme id; a value is a list of packs, a pack is a list of hazard descriptors for sim.hzStep. k: 'roll' (object rolling along the floor), 'fall' (dropped from the sky, ceil:1 = from the ceiling), 'bolt' (lightning strike); mode: kill / hurt / freeze; warn = telegraph frames, per = period, spread / lead = scatter and aim-ahead, gust = a wind zone
var HZ_PACKS = {
  // skins follow the look: snowball / snowlump / icicle (cold), meteor / ember (fire), weed / rock / boulder (dry), coconut (jungle), glob (swamp), bolt / spark (storm, electric), stalactite / shard (caves, crystal), acorn (forest), bomb (airship), hail + gusts (sky)
  8: [[{ k: 'roll', skin: 'snowball', mode: 'freeze', per: 300, sz: 14, spd: 1.5 }], [{ k: 'fall', skin: 'snowlump', mode: 'freeze', warn: 40, per: 230, spread: 55, lead: 24 }], [GUST(0.075, 420, 150)], [{ k: 'fall', skin: 'icicle', mode: 'hurt', warn: 28, per: 190, ceil: 1, spread: 70 }, { k: 'roll', skin: 'snowball', mode: 'freeze', per: 420, sz: 12, spd: 1.2 }]],
  22: [[{ k: 'roll', skin: 'snowball', mode: 'freeze', per: 260, sz: 14, spd: 1.7 }, { k: 'fall', skin: 'icicle', mode: 'hurt', warn: 28, per: 240, ceil: 1, spread: 60 }], [GUST(-0.07, 380, 140), { k: 'fall', skin: 'snowlump', mode: 'freeze', warn: 45, per: 300, spread: 50, lead: 20 }], [{ k: 'fall', skin: 'hail', mode: 'hurt', warn: 18, per: 110, spread: 110, sz: 4 }]],
  14: [[{ k: 'shot', per: 150, spread: 40, dir: -1, spd: 2.0 }, { k: 'fall', skin: 'ember', mode: 'hurt', warn: 24, per: 190, spread: 90, sz: 4 }], [{ k: 'fall', skin: 'meteor', mode: 'kill', crater: 1, warn: 62, per: 210, spread: 55, lead: 26, sz: 7 }], [{ k: 'fall', skin: 'ember', mode: 'hurt', warn: 22, per: 100, spread: 110, sz: 4 }], [{ k: 'fall', skin: 'meteor', mode: 'kill', crater: 1, warn: 70, per: 280, spread: 40, lead: 40, sz: 7 }, { k: 'fall', skin: 'ember', mode: 'hurt', warn: 24, per: 150, spread: 90, sz: 4 }]],
  9: [[{ k: 'roll', skin: 'weed', mode: 'hurt', per: 280, sz: 12, spd: 2.0 }], [{ k: 'shot', per: 240, spread: 35, dir: 1, spd: 1.8 }, { k: 'bigball', per: 800 }], [GUST(0.1, 340, 170), { k: 'fall', skin: 'rock', mode: 'hurt', warn: 34, per: 260, spread: 60, sz: 5 }], [{ k: 'roll', skin: 'weed', mode: 'hurt', per: 360, sz: 12, spd: 1.6 }, GUST(-0.085, 480, 160)]],
  7: [[{ k: 'fall', skin: 'coconut', mode: 'hurt', warn: 32, per: 220, spread: 50, lead: 20, sz: 6 }], [{ k: 'fall', skin: 'coconut', mode: 'hurt', warn: 32, per: 200, spread: 80, sz: 6 }, { k: 'roll', skin: 'boulder', mode: 'hurt', per: 460, sz: 16, spd: 1.4 }]],
  10: [[{ k: 'fall', skin: 'glob', mode: 'hurt', warn: 30, per: 190, spread: 70, sz: 5 }], [{ k: 'fall', skin: 'glob', mode: 'hurt', warn: 26, per: 140, spread: 100, sz: 5 }]],
  11: [[{ k: 'bolt', skin: 'bolt', mode: 'hurt', warn: 52, per: 250, spread: 60, lead: 36 }], [GUST(0.09, 300, 140), { k: 'bolt', skin: 'bolt', mode: 'hurt', warn: 56, per: 330, spread: 50, lead: 30 }], [GUST(-0.09, 280, 120)]],
  5: [[{ k: 'fall', skin: 'stalactite', mode: 'hurt', warn: 30, per: 180, ceil: 1, spread: 80 }], [{ k: 'fall', skin: 'stalactite', mode: 'hurt', warn: 24, per: 140, ceil: 1, spread: 110 }, { k: 'roll', skin: 'boulder', mode: 'hurt', per: 520, sz: 16, spd: 1.3 }]],
  13: [[{ k: 'fall', skin: 'shard', mode: 'hurt', warn: 26, per: 170, ceil: 1, spread: 90 }], [{ k: 'fall', skin: 'shard', mode: 'hurt', warn: 22, per: 130, ceil: 1, spread: 120 }]],
  15: [[{ k: 'shot', per: 220, spread: 40, dir: -1, spd: 1.7 }], [{ k: 'roll', skin: 'boulder', mode: 'hurt', per: 380, sz: 18, spd: 1.6 }], [{ k: 'fall', skin: 'rock', mode: 'hurt', warn: 36, per: 210, spread: 60, lead: 18, sz: 6 }, { k: 'roll', skin: 'boulder', mode: 'hurt', per: 560, sz: 16, spd: 1.4 }]],
  6: [[{ k: 'fall', skin: 'acorn', mode: 'hurt', warn: 26, per: 200, spread: 80, sz: 4 }], [GUST(0.08, 360, 170), { k: 'fall', skin: 'acorn', mode: 'hurt', warn: 26, per: 260, spread: 70, sz: 4 }]],
  16: [[{ k: 'shot', per: 170, spread: 50, dir: -1, spd: 2.0 }, { k: 'bigball', per: 760 }], [{ k: 'bolt', skin: 'spark', mode: 'hurt', warn: 40, per: 200, spread: 90, lead: 30 }], [{ k: 'fall', skin: 'bolt', mode: 'hurt', warn: 26, per: 170, spread: 90, sz: 5 }]],
  17: [[{ k: 'bolt', skin: 'spark', mode: 'hurt', warn: 36, per: 180, spread: 100, lead: 24 }]],
  12: [[{ k: 'shot', per: 140, spread: 40, dir: -1, spd: 1.9 }], [{ k: 'bigball', per: 620 }, { k: 'shot', per: 200, spread: 30, dir: -1, spd: 1.7 }], [GUST(-0.1, 300, 150)], [{ k: 'fall', skin: 'bomb', mode: 'hurt', crater: 1, warn: 36, per: 220, spread: 70, lead: 20, sz: 6 }, GUST(0.09, 400, 130)]],
  1: [[GUST(0.09, 330, 150)], [{ k: 'fall', skin: 'hail', mode: 'hurt', warn: 18, per: 120, spread: 110, sz: 4 }]],
  23: [[{ k: 'fall', skin: 'rock', mode: 'hurt', warn: 34, per: 220, ceil: 1, spread: 70, sz: 5 }], [{ k: 'roll', skin: 'boulder', mode: 'hurt', per: 480, sz: 16, spd: 1.3 }]],
  24: [[{ k: 'shot', per: 170, spread: 40, dir: 1, spd: 1.9 }, { k: 'fall', skin: 'ember', mode: 'hurt', warn: 24, per: 190, ceil: 1, spread: 90, sz: 4 }], [{ k: 'fall', skin: 'ember', mode: 'hurt', warn: 24, per: 130, ceil: 1, spread: 90, sz: 4 }], [{ k: 'fall', skin: 'stalactite', mode: 'hurt', warn: 28, per: 200, ceil: 1, spread: 80 }]],
  25: [[{ k: 'fall', skin: 'icicle', mode: 'hurt', warn: 26, per: 170, ceil: 1, spread: 90 }], [{ k: 'fall', skin: 'icicle', mode: 'hurt', warn: 24, per: 200, ceil: 1, spread: 80 }, GUST(0.07, 420, 140)]],
  26: [[{ k: 'fall', skin: 'stalactite', mode: 'hurt', warn: 30, per: 190, ceil: 1, spread: 80 }]],
  27: [[{ k: 'fall', skin: 'shard', mode: 'hurt', warn: 26, per: 170, ceil: 1, spread: 90 }], [{ k: 'fall', skin: 'shard', mode: 'hurt', warn: 22, per: 140, ceil: 1, spread: 110 }, { k: 'fall', skin: 'rock', mode: 'hurt', warn: 34, per: 260, spread: 60, sz: 5 }]],
  0: [], 2: [], 3: [], 4: [], 18: [], 19: [], 20: [], 21: []
};
// picks one hazard pack from HZ_PACKS for the theme (weather / trouble of that look) and scales it by difficulty; skipped for rooms, vertical and special layouts
// ranged attackers per look: wrench bots, fire spitters and snowmen (ground walkers or hovering flyers) lob wrenches / flames (power down) and snowballs (ice block); and which themed power-ups the ? blocks may hold
var THROW_SKIN = { 24: 'fire', 25: 'snow', 27: 'fire', 23: 'wrench', 8: 'snow', 22: 'snow', 14: 'fire', 16: 'fire', 9: 'fire', 15: 'wrench', 12: 'wrench', 17: 'wrench', 1: 'wrench', 11: 'snow', 5: 'wrench', 13: 'fire' };
var THEME_QPK = { 8: [11, 1, 2], 22: [11, 1, 2], 14: [1, 1, 10], 15: [10, 1, 2], 12: [10, 1, 2], 9: [10, 1, 2], 16: [10, 1, 2], 17: [10, 1, 2], 11: [11, 1, 2], 5: [10, 1, 2] };
function addThrowers(L, seed, n) {
  var skin = THROW_SKIN[L.theme]; if (!skin || !HZ_LAYOUTS[L.layout] || L.vertical || L.room || L.arena || L.endCannon || L.zones || !(L.diff > 0.1)) return;
  var hard = Math.min(1, Math.max(0, (effN(n) - 19) / 50)), want = 1 + Math.floor(L.diff * 2.4 + hard * 2), placed = 0, tries = 0, gt = L.gt, TSz = PF.TS;
  var x0 = Math.floor((L.start.x + 220) / TSz), x1 = Math.floor((L.goalX - 160) / TSz); if (x1 - x0 < 10) return;
  while (placed < want && tries++ < 60) {
    var c = x0 + hash(seed, n, 940 + tries) % (x1 - x0), run = 0, cc;
    for (cc = c; cc < c + 7 && cc < gt.length; cc++) if (gt[cc] === gt[c] && gt[c] < PF.ROWS) run++; else break;
    var air = placed % 2 === 1 || skin === 'wrench' && L.theme === 1;
    if (run < 6 && !air) continue;
    var gy = gt[c] * TSz, per = Math.round((200 - 40 * L.diff - 30 * hard) + hash(seed, n, 960 + tries) % 30), ph = hash(seed, n, 970 + tries) % per;
    if (air) L.enemies.push({ t: E.THROWER, skin: skin, fly: 1, x: c * TSz, y: gy - 6 * TSz, w: 14, h: 14, ax: c * TSz, ax0: c * TSz, ay0: gy - 6 * TSz, ph: (hash(seed, n, 980 + tries) % 628) / 100, per: per + 40, pho: ph, spd: 0, dir: -1 });
    else L.enemies.push({ t: E.THROWER, skin: skin, fly: 0, x: (c + 2) * TSz, y: gy - 14, w: 14, h: 14, ax: (c + 2) * TSz, ph: 0, per: per, pho: ph, spd: 0.3, dir: -1, mn: c * TSz, mx: (c + 6) * TSz });
    placed++;
  }
}
// ground enemies may grow at most 2x over the lowest level (flying and swimming ones keep growing up to ~3x): an ordinary stage is trimmed to this cap
var GROUND_T = { 0: 1, 1: 1, 3: 1, 29: 1, 32: 1, 33: 1, 34: 1, 35: 1, 36: 1 };
function addEnemyCap(L, seed, n) {
  if (!HZ_LAYOUTS[L.layout] || L.vertical || L.room || L.arena || L.stepEn || L.reqEn) return;
  var cap = 1 + (hash(seed, n, 1299) % 100 < 55 * Math.min(1, (n - 1) / 40) ? 1 : 0), idx = [], i;   // at most 1 ground enemy per stage at the lowest levels; the chance of a second one grows with the level (about 2x as many ground enemies in all at the top)
  L.enemies.forEach(function (e, k) { if (GROUND_T[e.t] && !(e.t === 29 && e.fly)) idx.push(k); });
  var drop = idx.length - cap; if (drop <= 0) return;
  idx.sort(function (a, b) { return hash(seed, n, 1300 + a) - hash(seed, n, 1300 + b); });
  var gone = {}; for (i = 0; i < drop; i++) gone[idx[i]] = 1;
  L.enemies = L.enemies.filter(function (e, k) { return !gone[k]; });
}
// the newer land and air enemies replace part of the ordinary walkers / flyers (the counts stay the same): pillbug, hopper, mole, shield bearer, bomb bug on the ground; bat, storm cloud, hornet, bomber, rope spider in the air; each look has its own favourites. Some walkers do not look at ledges (they walk right off, like a green turtle), and buried mines are scattered over flat ground.
// which free-angle slopes a look may have: 30 degrees anywhere, 15 / 60 / 75 only underground, 60 also on ice
function RAMP_ANGLES(th) { var a = [30, 30]; if (th >= 23 && th <= 27) a.push(15, 60, 75); if (th === 8 || th === 22 || th === 25) a.push(60, 30); return a; }
// pick the rise (rows) and run (columns) of a slope of about the wanted angle that ends exactly on a tile column boundary; the actual angle differs by a degree or two
function rampSpec(deg, g) {
  var t = Math.tan(deg * Math.PI / 180), best = null, Hmax = Math.max(1, Math.min(deg >= 75 ? 4 : deg >= 60 ? 5 : 4, g - 3));
  for (var H = 1; H <= Hmax; H++) { var n = Math.max(1, Math.round(H / t)), err = Math.abs(Math.atan(H / n) * 180 / Math.PI - deg) + (H === 1 && deg <= 15 ? 0 : 0); if (!best || err < best.err - 0.01 || (err < best.err + 1.2 && H > best.H && deg > 15)) best = { H: H, n: n, err: err }; }
  return best;
}
function addNewEnemies(L, seed, n) {
  if (!HZ_LAYOUTS[L.layout] || L.vertical || L.room || L.arena || L.stepEn || L.reqEn) return;
  var th = L.theme, gnd = ['pillbug'], i, e, hv, soil = { 0: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 22: 1 }, out = [], TSz = PF.TS, R = L.rows || PF.ROWS;
  if (soil[th]) gnd.push('mole', 'hopper'); if ({ 0: 1, 6: 1, 7: 1, 10: 1, 11: 1, 1: 1 }[th]) gnd.push('hopper'); if ({ 16: 1, 17: 1, 14: 1, 9: 1, 15: 1, 5: 1, 13: 1 }[th]) gnd.push('bombbug'); if ({ 15: 1, 4: 1, 12: 1, 16: 1, 17: 1, 21: 1, 13: 1, 5: 1 }[th]) gnd.push('shielder');
  for (i = 0; i < L.enemies.length; i++) {
    e = L.enemies[i]; hv = hash(seed, n, 1700 + i);
    if ((e.t === 0 || e.t === 3) && hv % 100 < 65 && e.mn !== undefined && !e.sh) {
      var fl = e.y + e.h, kd = gnd[(hv >> 8) % gnd.length], b = { x: e.x, ax: e.x, dir: e.dir || -1, mn: e.mn, mx: e.mx, s: 0, tm: 0, id: 70000 + i };
      if (kd === 'pillbug') { b.t = E.PILLBUG; b.w = 14; b.h = 10; b.y = fl - 10; b.spd = 0.45; if (hv % 5 === 0) b.blind = 1; }
      else if (kd === 'hopper') { b.t = E.HOPPER; b.w = 14; b.h = 12; b.y = fl - 12; b.wait = 60; }
      else if (kd === 'mole') { b.t = E.MOLE; b.w = 12; b.h = 12; b.y0 = fl - 12; b.y = fl + 2; b.up = 0; b.hid = true; b.cd = 0; }
      else if (kd === 'shielder') { b.t = E.SHIELDER; b.w = 14; b.h = 14; b.y = fl - 14; b.spd = 0.35; if (hv % 4 === 0) b.blind = 1; }
      else { b.t = E.BOMBBUG; b.w = 12; b.h = 12; b.y = fl - 12; b.spd = 0.4; }
      out.push(b); continue;
    }
    if ((e.t === 2 || e.t === 15 || e.t === 19) && hv % 100 < 55) {
      var ax0 = e.ax !== undefined ? e.ax : e.x, ay0 = e.ay !== undefined ? e.ay : e.y, ccol = Math.floor(ax0 / TSz), ceil = -1, rr;
      for (rr = Math.floor(ay0 / TSz); rr >= Math.max(0, Math.floor(ay0 / TSz) - 10); rr--) if (PF.SOL[L.tiles[ccol * R + rr]]) { ceil = rr; break; }
      var air = []; if (ceil >= 0) { air.push('bat', 'bat'); if ({ 5: 1, 15: 1, 10: 1, 7: 1, 2: 1, 13: 1, 4: 1 }[th]) air.push('spider', 'spider'); }
      if ({ 11: 1, 1: 1, 12: 1, 8: 1, 22: 1, 13: 1 }[th]) air.push('cloud'); if ({ 0: 1, 6: 1, 7: 1, 9: 1, 10: 1, 14: 1, 15: 1, 5: 1 }[th]) air.push('hornet'); if ({ 12: 1, 16: 1, 17: 1, 21: 1, 1: 1, 18: 1 }[th]) air.push('bomber'); if (!air.length) air.push('hornet');
      var ak = air[(hv >> 8) % air.length], ph = (hv % 628) / 100, per = 120 + hv % 60, f2 = { x: ax0, ax: ax0, ph: ph, s: 0, cd: 0, tm: 0, pho: hv % 100, id: 71000 + i };
      if (ak === 'bat') { f2.t = E.BAT; f2.w = 12; f2.h = 10; f2.ax0 = ax0; f2.ay0 = (ceil + 1) * TSz + 1; f2.y = f2.ay0; }
      else if (ak === 'spider') { f2.t = E.SPIDER; f2.w = 12; f2.h = 10; f2.ax0 = ax0; f2.ay0 = (ceil + 1) * TSz + 2; f2.y = f2.ay0 + 6; f2.len = 110; }
      else if (ak === 'cloud') { f2.t = E.STORMCLOUD; f2.w = 28; f2.h = 16; f2.ay0 = Math.min(ay0, L.start.y - 40); f2.y = f2.ay0; f2.per = 150 + hv % 40; }
      else if (ak === 'bomber') { f2.t = E.BOMBER; f2.w = 20; f2.h = 14; f2.ax0 = ax0; f2.ay0 = ay0 - 10; f2.y = f2.ay0; f2.rg = 50; f2.sp = 1 / (260 + hv % 60); f2.per = per; }
      else { f2.t = E.HORNET; f2.w = 14; f2.h = 10; f2.ax0 = ax0; f2.ay0 = ay0; f2.y = ay0; }
      out.push(f2); continue;
    }
    if ((e.t === 0 || e.t === 3) && hv % 100 < 35) e.blind = 1;   // does not notice ledges: walks straight off
    out.push(e);
  }
  // buried mines on flat ground: visible, avoidable; walking (or being walked) over one throws the walker five tiles up without hurting
  var gt = L.gt, mines = L.diff > 0.1 && n >= 3 ? Math.min(3, 1 + Math.floor(L.diff * 1.6 + (n > 25 ? 0.5 : 0))) : 0, x0 = Math.floor((L.start.x + 200) / TSz), x1 = Math.floor((L.goalX - 140) / TSz), tries = 0;
  while (mines > 0 && tries++ < 80 && x1 - x0 > 10) {
    var c = x0 + hash(seed, n, 1800 + tries) % (x1 - x0), run = 0, cc;
    for (cc = c - 2; cc <= c + 2; cc++) if (gt[cc] === gt[c] && gt[c] < R) run++;
    if (run < 5) continue;
    var near = false; out.forEach(function (q) { if (Math.abs(q.x - c * TSz) < 40) near = true; }); if (near) continue;
    out.push({ t: E.LANDMINE, x: c * TSz + 1, y: gt[c] * TSz - 6, w: 14, h: 6, ax: c * TSz, s: 0, tm: 0 }); mines--;
  }
  L.enemies = out;
}
// poison dwellers: the same kinds of creatures as in the water (several swimming habits, lurkers, squid, puffers) live inside poison runs too; about 30% as many as there are water creatures. They are real enemies, tinted purple.
function addPoisonDeco(L, seed, n) {
  if (!L.tiles || L.vertical || L.room) return;
  var R = L.rows || ROWS, w = L.w, nw = 0, runs = [];
  L.enemies.forEach(function (e) { if ((e.t >= 9 && e.t <= 14) || (e.t >= 24 && e.t <= 27)) nw++; });
  var want = Math.round(0.3 * nw); if (want < 1) return;
  for (var r0 = 0; r0 < R; r0++) { var c = 0; while (c < w) { if (L.tiles[c * R + r0] === T.POISON) { var c1 = c; while (c1 < w && L.tiles[c1 * R + r0] === T.POISON) c1++; var mid = Math.floor((c + c1) / 2); if (c1 - c >= 4 && !(r0 > 0 && L.tiles[mid * R + r0 - 1] === T.POISON)) { var dp = 0; while (r0 + dp < R && L.tiles[mid * R + r0 + dp] === T.POISON) dp++; runs.push({ c: c, len: c1 - c, r: r0, d: dp }); } c = c1; } else c++; } }
  if (!runs.length) return;
  runs.sort(function (a, b) { return hash(seed, n, 1400 + a.c * 7 + a.r) - hash(seed, n, 1400 + b.c * 7 + b.r); });
  for (var k = 0; k < want; k++) {
    var q = runs[k % runs.length], half = (q.len * TS) / 2, rg = Math.max(8, Math.min(30, half - 14)), cxp = (q.c + q.len / 2) * TS - 6, ycen = (q.r + q.d / 2) * TS, hv = hash(seed, n, 1500 + k), kinds = q.d >= 2 ? ['sweep', 'dash', 'wander', 'lurk', 'squid', 'puffer'] : ['sweep', 'dash', 'wander', 'lurk'], kd = kinds[hv % kinds.length], idv = 90000 + k;
    if (kd === 'lurk') L.enemies.push({ t: E.CHASER, lurk: 1, pzn: 1, pz: 1, x: cxp, y: ycen - 5, w: 12, h: 10, ax: cxp, ay: ycen - 5, spd: 0, dir: 1 });
    else if (kd === 'squid') L.enemies.push({ t: E.SQUID, pzn: 1, pz: 1, id: idv, x: cxp, y: ycen - 8, w: 12, h: 16, ax: cxp, ax0: cxp, ay0: ycen - 8, rx: Math.max(10, rg), ry: Math.max(4, q.d * TS / 2 - 12), s: 0, wait: 30, cnt: 0, dvx: 0, dvy: 0, spd: 0, dir: 1 });
    else if (kd === 'puffer') L.enemies.push({ t: E.PUFFER, pzn: 1, pz: 1, id: idv, x: cxp, y: ycen - 5, w: 12, h: 10, ax: cxp, ax0: cxp, ay0: ycen - 5, rg: Math.max(8, rg - 6), sp: 1 / (200 + hv % 100), ph: (hv % 100) / 100, spd: 0, dir: 1 });
    else {
      var fy = ycen - 4, e2 = { t: E.SWIM, pzn: 1, pz: 1, sz: 0, x: cxp, y: fy, w: 12, h: 8, ax: cxp, ay: fy, rg: rg, sp: 1 / (200 + hv % 120), ph: (hv % 100) / 100, am: 1, spd: 0 };
      if (kd === 'dash') { e2.mode = 'dash'; e2.id = idv; e2.dd = hv % 2 ? 1 : -1; e2.dsp = 0.5 + (hv % 60) / 100; e2.rg = Math.max(8, Math.min(e2.rg, half - 12)); }
      else if (kd === 'wander') { e2.mode = 'wander'; e2.id = idv; e2.am = q.d >= 2 ? 8 : 2; }
      L.enemies.push(e2);
    }
  }
}
function addHazards(L, seed, n) {
  var packs = HZ_PACKS[L.theme]; if (!packs || !packs.length || !HZ_LAYOUTS[L.layout] || L.vertical || L.room || L.arena || L.endCannon || L.zones || !(L.diff > 0.12)) return;
  var hard = Math.min(1, Math.max(0, (effN(n) - 19) / 50));   // keeps getting harder after the difficulty ramp (n ~ 19) is full
  // harder stages combine two or three packs (distinct ones, picked from a seeded rotation)
  var cnt = (L.diff > 0.45 || hard > 0) && packs.length > 1 ? (hard > 0.5 && packs.length > 2 ? 3 : 2) : 1, first = hash(seed, n, 731) % packs.length, id = 0; L.hz = []; L.hzPacks = [];
  // hazard zone: from just after the start to just before the goal; sc shortens the periods as difficulty rises
  var x0 = L.start.x + 130, x1 = L.goalX - 70, sc = 1.45 - 0.5 * L.diff - 0.3 * hard;
  // gust descriptors become wind zones, every other descriptor becomes a hazard with a scaled period and a random time offset
  for (var q = 0; q < cnt; q++) {
    var pi = (first + q * (1 + hash(seed, n, 733) % Math.max(1, packs.length - 1))) % packs.length; if (L.hzPacks.indexOf(pi) >= 0) continue; L.hzPacks.push(pi);
    packs[pi].forEach(function (d) {
      if (d.gust) { L.winds = L.winds || []; L.winds.push({ x0: x0, x1: x1, y0: -2000, y1: 9000, dx: d.gust.dx, dy: 0, per: d.gust.per, on: d.gust.on, ph: hash(seed, n, 735 + id) % d.gust.per, gust: 1 }); id++; return; }
      var h = {}; for (var k in d) h[k] = d[k]; h.id = ++id; h.per = Math.round(d.per * sc); h.off = hash(seed, n, 737 + id) % h.per; h.x0 = x0; h.x1 = x1; L.hz.push(h);
    });
  }
}
// build one candidate: buildRaw() picks the generator by kind, then the theme is chosen, hazards are added and the ending is attached
var CANN_FAC = { 4: 2.2, 14: 2.2, 24: 2.2, 20: 1.6, 12: 1.5, 16: 1.5, 15: 1.4, 17: 1.2, 19: 1.2, 21: 1.2, 0: 0.3, 3: 0 };   // cannon factor per look; looks not listed use 1
var PLAT_FAC = { 1: 3, 12: 3, 11: 2.2, 18: 2, 0: 0.3, 3: 0, 4: 0.6, 5: 0.6, 15: 0.7, 19: 0.6, 23: 0.6, 24: 0.6, 25: 0.6, 26: 0.6, 27: 0.6 };   // platform factor per look; looks not listed use 1
// ending style by look: machines and fleets end on an exit button (and every descending stage does); the rest end at a finish flag
var BTN_THEMES = { 16: 1, 17: 1, 12: 1, 21: 1, 20: 1, 19: 1, 18: 1 };
function build(seed, n, a, o) {
  var L = buildRaw(seed, n, a, o), o2 = o || {};
  if (o2.theme !== undefined) L.theme = o2.theme;
  else if (L.themeList) L.theme = L.themeList[hash(seed, n, 911) % L.themeList.length];
  else if (!L.room && L.kind !== 'castle' && L.kind !== 'bossrush' && L.kind !== 'cannon' && L.kind !== 'bonus') L.theme = pickTheme(seed, n, L.kind);
  L.layout = L.kind; addHazards(L, seed, n); addThrowers(L, seed, n); addEnemyCap(L, seed, n); addNewEnemies(L, seed, n); addPoisonDeco(L, seed, n); if (L.ropes) ropeClear(L); if (THEME_QPK[L.theme] && !L.room) L.qpk = THEME_QPK[L.theme];
  // the ending: a big exit button instead of the beacon gate on every descending stage and on about half of the others (castles and cannons have their own endings)
  if (!L.arena && !L.endCannon && !L.room && L.kind !== 'bonus' && L.kind !== 'bossrush' && L.kind !== 'castle' && L.goalX < 1e5 && L.poleY !== undefined && L.start) {
    var desc = L.goalRect && L.goalRect.y + L.goalRect.h > L.start.y + 3 * TS;
    if (desc || BTN_THEMES[L.theme]) { L.exitBtn = 1; L.goalRect = { x: L.goalX - 12, w: 24, y: L.poleY - 30, h: 30 }; }
  }
  return L;
}
// dispatcher + the main side-scrolling builder: special kinds (maze, ghost, deep, odyssey ...) return early, the rest is composed from ground chunks below
function buildRaw(seed, n, a, o) {
  o = o || {}; var nn = effN(n);
  // labyrinths: half the 'maze' stages are the key-and-door puzzle rooms, half the tunnel grid
  var kk1 = o.kind || kindOf(seed, n);
  if (!o.room) {
    if (kk1 === 'maze') return (hash(seed, n, 5) % 2 === 0) ? buildMaze(seed, n, a) : buildGrid(seed, n, a, 'cave');
    if (kk1 === 'deep') return buildDeep(seed, n, a, o);
    if (kk1 === 'house') return buildHouse(seed, n, a, o);
    if (kk1 === 'ghost') return buildGhostHouse(seed, n, a);
    if (kk1 === 'gates') return buildGates(seed, n, a);
    if (kk1 === 'toxic') { var Lt = buildGates(seed, n, a, 'toxic'); Lt.kind = 'toxic'; Lt.kindAsked = 'toxic'; Lt.themeList = [10, 10, 3, 7, 13, 5]; return Lt; }
    if (kk1 === 'frost') { var Lf = buildGates(seed, n, a, 'frost'); Lf.kind = 'frost'; Lf.kindAsked = 'frost'; Lf.themeList = [8, 22, 25, 1, 13]; return Lf; }
    if (kk1 === 'tiny') { var Ly = buildGates(seed, n, a, 'tiny'); Ly.kind = 'tiny'; Ly.kindAsked = 'tiny'; Ly.themeList = [0, 6, 7, 23, 26]; return Ly; }
    if (kk1 === 'odyssey') return buildOdyssey(seed, n, a);
    if (kk1 === 'skymaze') return buildSkyMaze(seed, n, a);
    if (kk1 === 'aircourse') return buildSkyMaze(seed, n, a, true);
    if (kk1 === 'flystep') return buildTrajChain(seed, n, a);
    if (kk1 === 'voidhop') return buildSkyMaze(seed, n, a, 'void');
    if (kk1 === 'cloudway') return buildSkyMaze(seed, n, a, 'cloud');
    if (kk1 === 'skyclimb') return buildSkyMaze(seed, n, a, 'climb');
    if (kk1 === 'spinway') return buildSkyMaze(seed, n, a, 'spin');
    if (kk1 === 'zigzag') return buildSwitchback(seed, n, a);
    if (kk1 === 'lavatower') return buildLavaTower(seed, n, a);
    if (kk1 === 'tower' || kk1 === 'shaft') return buildVertical(seed, n, a, kk1);
  }
  if (!o.room && (o.kind || kindOf(seed, n)) === 'castle') { var csh = castleShape(seed, n, o); if (csh !== 'horiz') return buildCastleChain(seed, n, a, o, csh); }   // castles come in several scroll directions
  var kk0 = o.kind || kindOf(seed, n); if ((kk0 === 'tower' || kk0 === 'shaft') && !o.room) return buildVertical(seed, n, a, kk0);
  var wantSecret = !!o.secret, kindAsked = o.kind || kindOf(seed, n);
  // per-attempt rng: the attempt index a is hashed into the seed, so each redraw differs but stays reproducible; lim = jump limits measured on the real physics
  var lim = probe(), r = rng(hash(seed, n, a * 7919 + 1)), kind = o.kind || kindOf(seed, n), room = !!o.room, isCannon = kind === 'cannon'; if (isCannon) kind = 'sky';
  // difficulty 0..1 from the effective stage number; later attempts get easier (a >= 3, a >= 6) so a valid level is eventually found
  var diff = Math.min(1, (nn >= 1000 ? 8 : nn - 1) / 18); if (kind === 'bonus') diff = Math.min(1, 0.4 + 0.5 * diff); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3; if (a >= 8) diff = 0;
  var castle = kind === 'castle' || kind === 'bossrush', isRush = kind === 'bossrush';
  // level width in columns: grows with the stage number, castles and cannon stages are shorter, bonus rooms are tiny
  var W = room ? (o.roomW || 46) : isCannon ? 96 : castle ? Math.min(220, 90 + 6 * Math.min(nn, 30)) : Math.min(300, 110 + 5 * Math.min(nn, 38));
  // per-kind template weights: a kind listed here REPLACES the default weight table in weights() (only the named templates are drawn)
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
  // mandatory sky / underground excursion (about a quarter of the ordinary horizontal stages from level 3): excurKind 0 = vine up to cloud islands over a pit too wide to cross on the ground, 1 = a hatch down into a cavern inside a solid mountain and out again beyond it
  var EXCUR_KINDS = { plain: 1, hills: 1, autumn: 1, jungle: 1, snow: 1, desert: 1, cave: 1, swamp: 1, tiny: 1 }, teleL = [], teleN = 0, excurDone = false;
  var excurWant = nn >= 3 && !room && !castle && EXCUR_KINDS[kind] === 1 && a < 6 && hash(seed, n, 6001) % 100 < 26, excurKind = hash(seed, n, 6002) % 2;
  var usedPoisonLayer = false, waterIds = 0, whirlsX = [], geysersX = [], slpX = {}, secretZone = null, gt = [], flats = [], tl = [], movers = [], arcs = [], coinsX = [], specials = [], cannons = [], rings = [], enemiesX = [], winds = [], pockets = [], keysL = [], doorsL = [], switchesL = [], routeL = [], gl = [], gcount = 0, g = castle ? 11 : 12, cpCol = -1, needPow = true, spots = [], ringCount = 0;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  // ground profile: gt[c] is the top solid row of column c; flat() appends len columns at height gg and returns the first column
  function flat(len, gg) { var c0 = gt.length; for (var i = 0; i < len; i++) gt.push(gg); return c0; }
  // a pit is a run of columns with no floor (row ROWS); in lava kinds it is filled with lava so falling in is deadly
  function pit(len) { var c0 = gt.length; for (var i = 0; i < len; i++) { gt.push(ROWS); if (lavaPits) { tl.push([c0 + i, ROWS - 2, T.LAVA]); tl.push([c0 + i, ROWS - 1, T.LAVA]); } } return c0; }
  // hazards on the ground (spikes, obstacles) are remembered so a gap or any jump section never starts right behind them: a safe flat run-up is always kept
  var hz = {}, tlSeen = 0;
  function markHaz() { for (; tlSeen < tl.length; tlSeen++) { var e = tl[tlSeen], cc = e[0]; if (cc >= 0 && cc < gt.length && gt[cc] < ROWS && e[1] === gt[cc] - 1 && (e[2] === T.SPIKE || e[2] === T.SOLID || e[2] === T.LAVA || e[2] === T.CANL || e[2] === T.CANR || e[2] === T.STUMP || e[2] === T.SPRING || e[2] === T.FIRE)) hz[cc] = true; } }
  function safeRunway() { var i = gt.length - 1; if (i < 0 || gt[i] >= ROWS) return 0; var gv = gt[i], k = 0; while (i >= 0 && gt[i] === gv && !hz[i]) { k++; i--; } return k; }
  function runway() { var k = 0, i = gt.length - 1; while (i >= 0 && gt[i] === gt[gt.length - 1] && gt[i] < ROWS) { k++; i--; } return k; }
  // jump limits from probe() bound the widest gap and the highest step, so every generated jump is doable
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
  // fills a water basin with creatures; pill = pillars standing in it, so swimmers are placed where they have room
  function waterLife(c0, inner, gg, D, pill) {
    // plain swimmers first (1-3, scaled by difficulty): a sine sweep around their anchor (ax, ay)
    var dn = kind === 'flood' ? 1 : 0.525, ns = kind === 'flood' ? 1 + Math.floor(diff * 2.5 + r()) : (r() < 0.825 ? 1 : 0), i, lo = c0 + 3, span = Math.max(1, inner - 6);
    for (i = 0; i < ns; i++) { var big = r() < 0.35, cxs = (lo + r() * span) * TS, yy = (gg + 0.4 + r() * 0.5) * TS;
      enemiesX.push(fishHabit({ t: E.SWIM, sz: big ? 1 : 0, x: cxs, y: yy, w: big ? 22 : 12, h: big ? 12 : 8, ax: cxs, ay: yy, rg: 18 + r() * 22, sp: 1 / (170 + r() * 120), ph: r(), am: 3 + r() * 3, spd: 0 }, r, ++waterIds)); }
    // further creatures are gated by difficulty and pool size: chaser, floating mine, jellyfish, and a whale only in big pools
    if (diff > 0.25 && r() < dn * 0.7) { var cx2 = (c0 + inner * (0.3 + 0.4 * r())) * TS, cy2 = (gg + 1.1) * TS; enemiesX.push({ t: E.CHASER, lurk: r() < 0.5 ? 1 : 0, x: cx2, y: cy2, w: 12, h: 10, ax: cx2, ay: cy2, spd: 0, dir: 1 }); }
    if (diff > 0.2 && r() < dn * 0.6) { var cx3 = (lo + 2 + r() * Math.max(1, span - 4)) * TS, cy3 = (gg + 0.9) * TS; enemiesX.push({ t: E.FMINE, x: cx3, y: cy3, w: 14, h: 14, ax: cx3, ay: cy3, am: 8, ph: r(), spd: 0 }); }
    if (diff > 0.3 && r() < dn * 0.55) { var cx4 = (lo + 2 + r() * Math.max(1, span - 4)) * TS, cy4 = (gg + 0.2) * TS; enemiesX.push({ t: E.JELLY, x: cx4, y: cy4, w: 16, h: 18, ax: cx4, ay: cy4, ph: r(), spd: 0 }); }
    if (diff > 0.35 && r() < dn * 0.45 && inner >= 16) { var cx5 = (c0 + inner / 2 - 1) * TS, cy5 = (gg + 0.6) * TS; enemiesX.push({ t: E.WHALE, x: cx5, y: cy5, w: 44, h: 20, ax: cx5, ay: cy5, rg: Math.min(60, (inner / 2 - 5) * TS), sp: 1 / 420, ph: r(), spd: 0, dir: 1 }); }
    // more kinds of water life: an erratic squid, a strider on the surface, a pufferfish that swells, an electric eel, a whirlpool, bubble jets blowing out of the wall
    if (diff > 0.2 && r() < dn * 0.6) { var sqx = (lo + 2 + r() * Math.max(1, span - 4)) * TS, sqy = (gg + D * 0.5) * TS - 8; enemiesX.push({ t: E.SQUID, id: ++waterIds, x: sqx, y: sqy, w: 12, h: 16, ax: sqx, ax0: sqx, ay0: sqy, rx: 34 + r() * 24, ry: Math.max(14, D * TS * 0.5 - 22), s: 0, wait: 30, cnt: 0, dvx: 0, dvy: 0, spd: 0, dir: 1 }); }
    if (diff > 0.12 && r() < dn * 0.55 && inner >= 10) { var stx = (c0 + inner / 2) * TS; enemiesX.push({ t: E.STRIDER, id: ++waterIds, x: stx, y: gg * TS - 6, w: 12, h: 8, ax: stx, ax0: stx, sy: gg * TS, mn: (c0 + 0.5) * TS, mx: (c0 + inner - 0.5) * TS, s: 0, tm: 0, spd: 0, dir: 1 }); }
    if (diff > 0.3 && r() < dn * 0.5) { var pfx = (lo + 3 + r() * Math.max(1, span - 6)) * TS, pfy = (gg + D * 0.55) * TS; enemiesX.push({ t: E.PUFFER, id: ++waterIds, x: pfx, y: pfy, w: 12, h: 10, ax: pfx, ax0: pfx, ay0: pfy, rg: 20 + r() * 20, sp: 1 / (200 + r() * 100), ph: r(), spd: 0, dir: 1 }); }
    if (diff > 0.4 && r() < dn * 0.4 && inner >= 14) { var elw = Math.min(88, (inner - 7) * TS), elx = (c0 + 3.5) * TS; enemiesX.push({ t: E.EEL, id: ++waterIds, x: elx, y: (gg + D * 0.5) * TS - 4, w: elw, h: 8, ax: elx, pho: Math.floor(r() * 200), s: 0, spd: 0, dir: 1 }); }
    if (diff > 0.25 && r() < dn * 0.4 && inner >= 14 && D >= 3) { var dr0 = r() < 0.35; whirlsX.push({ x: (c0 + inner * (0.35 + 0.3 * r())) * TS, y: (gg + (dr0 ? D - 1.3 : D * 0.5)) * TS, r: dr0 ? 40 : 36, dir: r() < 0.5 ? 1 : -1, drain: dr0 ? 1 : 0 }); }
    if (diff > 0.1 && r() < dn * 0.5 && inner >= 10) { var vcx = c0 + 3 + Math.floor(r() * Math.max(1, inner - 8)); winds.push({ x0: vcx * TS - 6, x1: vcx * TS + 22, y0: gg * TS, y1: (gg + D) * TS, dx: 0, dy: -0.12, per: 230, on: 120, ph: Math.floor(r() * 230), bub: 1, vx: vcx * TS + 8, vy: (gg + D) * TS });   // a bubble vent in the pool floor pushes the swimmer up
    }
    if (diff > 0.15 && r() < dn * 0.4 && inner >= 12) { var jdir = r() < 0.5 ? 1 : -1, jx0 = jdir > 0 ? c0 * TS : (c0 + inner) * TS - 96; winds.push({ x0: jx0, x1: jx0 + 96, y0: (gg + 1) * TS, y1: (gg + Math.min(D, 3)) * TS, dx: jdir * 0.11, dy: 0, per: 260, on: 130, ph: Math.floor(r() * 260), bub: 1, vx: jdir > 0 ? c0 * TS : (c0 + inner) * TS }); }
    // a clam on the floor, never on a pillar column
    if (r() < dn * 0.5 && inner >= 10) { var fl0 = lo + 1 + Math.floor(r() * Math.max(1, span - 6)), flx = fl0 * TS, fly = (gg + D) * TS - 7; enemiesX.push({ t: E.FLOUNDER, x: flx, y: fly, w: 20, h: 7, ax: flx, rg: 22 + r() * 10, sp: 1 / (240 + r() * 100), ph: r(), fy: fly, spd: 0, dir: 1 }); }   // a flounder creeping along the pool floor
    if (r() < dn * 0.6) { var cc = lo + Math.floor(r() * span); if (pill && pill[cc]) cc = -1; if (cc >= 0) enemiesX.push({ t: E.CLAM, x: cc * TS, y: (gg + D) * TS - 12, w: 16, h: 12, ax: cc * TS, pho: Math.floor(r() * 180), spd: 0, noPillar: cc }); }
  }
  function airFeature(cc, ln, gg, over) {
    // pick one airborne kind allowed by difficulty and by the length of the stretch
    var opts = [], mid = (cc + ln / 2) * TS;
    if (diff > 0.05 || kind === 'sky') opts.push('swoop'); opts.push('bird'); if (diff > 0.1 || kind === 'sky') opts.push('gull', 'gull'); if (ln >= 8) opts.push('flock'); if (diff > 0.2 || kind === 'sky') opts.push('balloon'); if (diff > 0.25) opts.push('shooter'); if (diff > 0.3 && !over) opts.push('spark');
    var k = opts[Math.floor(r() * opts.length)];
    if (k === 'swoop') enemiesX.push({ t: E.SWOOP, x: mid, y: (gg - 6) * TS, w: 14, h: 10, ax: mid, ay: (gg - 6) * TS, ph: r(), spd: 0, dir: 1 });
    else if (k === 'bird') enemiesX.push({ t: E.BIRD, x: mid, y: (gg - 5) * TS, w: 14, h: 10, ax: mid, ay: (gg - 5) * TS, rg: 40 + r() * 20, sp: 1 / (240 + r() * 100), ph: r(), am: 10, carry: 1, spd: 0 });
    else if (k === 'flock') { var offs = [[0, 0], [-9, 6], [9, 6], [-18, 12], [18, 12]], rg2 = Math.max(30, ln * TS / 2 - 24), fph = r(); for (var m = 0; m < 5; m++) enemiesX.push({ t: E.FLOCK, x: mid + offs[m][0], y: (gg - 5) * TS + offs[m][1], w: 10, h: 8, ax: mid, by: (gg - 5) * TS, ox: offs[m][0], oy: offs[m][1], idx: m, rg: rg2, sp: 1 / 340, ph: fph, spd: 0, dir: 1 }); }
    else if (k === 'gull') enemiesX.push({ t: E.GULL, x: mid, y: (gg - 6) * TS, w: 14, h: 10, ax: mid, ax0: mid, ay0: (gg - 6) * TS, ph: r(), s: 0, cd: 0, tm: 0, spd: 0, dir: 1 });
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
    // a KIND_TABLE entry wipes the defaults; spikes come back at low weight from stage 2 on
    if (KT) { for (var k0 in w) w[k0] = 0; w.flat = 1; for (var k1 in KT) w[k1] = KT[k1]; if (KT.spikes === undefined && nn >= 2) w.spikes = 0.4; if (kind === 'chase') { w.islands = 0; } }
    if (kind === 'hills') { w.hills = 4; w.flat = 2; }
    if (kind === 'flood') { w.flood = 4; w.hills = 0.6; w.gap = 1; w.wind = 0; w.updraft = 0; w.cloud = 0; }
    if (kind === 'ghost') { w.ghost = 2.2; w.islands += 0.7; w.spikes += 0.6; w.cannon = 0; w.ring = 0.5; }
    if (kind === 'sky') { w.flat = 1; w.gap = 3; w.islands = 2.5; w.mover = 1.2; w.vmover = 1.2; w.orbit = 1.5; w.falling = 1.5; w.stairs = 0.5; w.hurdle = 0.3; w.spring = 0.6; w.cannon = 0.4; w.wind = 1.3; w.updraft = 1.0; w.cloud = 1.6; w.flood = 0; }
    if (kind === 'cave') { w.conv = 3; w.cannon = 0.8; w.plant = 0.5; w.hills = 0.8; }
    if (castle) { w.keydoor = 1.0; w.sgate = 0.8; w.cloud = 0.3; w.wind = 0; w.updraft = 0; w.flood = 0; w.gap = 2.5; w.crush = 2 + d; w.cannon = 1.2; w.conv = 1; w.orbit = 0.8; w.falling = 0.6; w.mover = 0.6; w.islands = 0.6; w.plant = 0.6; w.spring = 0; w.vine = 0; w.psw = 0; w.ring = 0; }
    if (kind === 'bonus') { w.spring = 0.8; w.ring = 0; }
    if (kind === 'volcano') w.lava = 2.4; if (kind === 'factory' || kind === 'neon') w.lava = 0.8; if (castle) w.lava = 0.7; if (kind === 'swamp') w.poison = 2.2; if (kind === 'flood') w.poison = 1.5; if (nn >= 3 && !(w.poison >= 1.8) && kind !== 'volcano' && kind !== 'lavatower' && !castle) w.poison = (kind === 'plain' || kind === 'hills' || kind === 'jungle' || kind === 'swamp' || kind === 'cave') ? 1.3 : 0.8;
    // platform variety (a rotating cross, gliding stones, pendulum planks, rail-loop pads, drifting rafts): modest everywhere from level 3, more where they fit the look
    if (nn >= 3 && !room && kind !== 'flood' && kind !== 'bonus') { w.cross = 0.45; w.stone = 0.45; w.pend = 0.4; w.rail = 0.35; w.drift = 0.4;
      if (kind === 'sky' || kind === 'airship' || kind === 'storm') { w.cross = 1.1; w.drift = 1.0; w.pend = 0.8; } if (kind === 'ruins' || kind === 'volcano' || kind === 'cave' || kind === 'crystal' || castle) { w.stone = 1.2; w.pend = 0.7; } if (kind === 'factory' || kind === 'neon' || kind === 'glacier') { w.rail = 1.0; w.cross = 0.8; } }
    // how many moving platforms a look gets (by the look the stage will have): lots under a sky, a few in castles / underground, rare on meadows, none in water; platform-centric kinds keep their own tables
    var thp = o.theme !== undefined ? o.theme : castle ? 4 : pickTheme(seed, n, kind);
    if (nn >= 2 && !room && kind !== 'flood' && kind !== 'bonus' && kind !== 'sky') w.ramp = (thp >= 23 && thp <= 27) ? 1.6 : (thp === 8 || thp === 22) ? 1.2 : 0.5;   // slopes of other angles: common underground and on ice, occasional elsewhere
    var pfac = kind === 'flood' ? 0 : (kind === 'sky' || kind === 'airship' || kind === 'storm') ? 1.2 : (PLAT_FAC[thp] !== undefined ? PLAT_FAC[thp] : 1);
    var cfac = kind === 'flood' ? 0 : (CANN_FAC[thp] !== undefined ? CANN_FAC[thp] : 1);   // cannons: plenty in castles and lava, a few in machine looks, rare on meadows, none in water
    if (!room && kind !== 'bonus') w.cannon = Math.max(w.cannon || 0, nn >= 4 ? 0.3 : 0) * cfac * (cfac >= 1.5 ? 2 : 1);
    if (!room && kind !== 'bonus') {
      if (nn >= 3) { w.vmover = Math.max(w.vmover || 0, 0.3); w.orbit = Math.max(w.orbit || 0, 0.25); w.falling = Math.max(w.falling || 0, 0.25); w.cloud = Math.max(w.cloud || 0, nn >= 4 ? 0.25 : 0); }
      ['mover', 'vmover', 'orbit', 'falling', 'cloud', 'cross', 'stone', 'pend', 'rail', 'drift'].forEach(function (nm) { w[nm] = (w[nm] || 0) * pfac; });
    }
    if (nn >= 3 && !room && g >= 8 && kind !== 'flood' && kind !== 'bonus' && kind !== 'sky' && kind !== 'chase' && kind !== 'airship' && kind !== 'storm' && !castle) w.rope = thp === 7 ? 1.2 : (thp === 6 || thp === 10) ? 0.3 : 0;   // rope swings: the jungle look (a little in autumn and swamp)
    if (o.only) { for (var kk in w) w[kk] = (kk === 'flat' ? 2 : kk === o.only ? 4 : 0); }
    if (castle) w.split = 0.3;
    if (room) { for (var k in w) w[k] = 0; w.flat = 3; w.gap = 1; w.hurdle = 1; w.islands = 0.6; w.stairs = 0.5; }
    ['ice', 'mud', 'fire', 'lava', 'poison', 'split', 'keydoor', 'sgate', 'cloud', 'updraft', 'wind', 'ring', 'psw', 'vine', 'spring', 'ghost', 'crush', 'plant', 'cannon', 'conv', 'flood', 'hills', 'falling', 'orbit', 'vmover', 'mover', 'cross', 'stone', 'pend', 'rail', 'drift', 'ramp', 'rope'].forEach(function (nm) { if (!(w[nm] >= 0)) w[nm] = 0; });   // a missing weight used to make the whole sum NaN: every stage then picked only plain floor (and the water pools / fish vanished)
    return w;
  }
  // every template name the loop can draw (weight 0 disables one)
  var names = ['flat', 'gap', 'stairs', 'hurdle', 'spikes', 'islands', 'mover', 'vmover', 'orbit', 'falling', 'hills', 'flood', 'conv', 'cannon', 'plant', 'crush', 'ghost', 'spring', 'vine', 'psw', 'ring', 'wind', 'updraft', 'cloud', 'keydoor', 'sgate', 'split', 'ice', 'mud', 'fire', 'lava', 'poison', 'cross', 'stone', 'pend', 'rail', 'drift', 'ramp', 'rope'];
  // main generate loop: draw a chunk template 'ck' by weight until only the ending area (endReserve columns) is left; each branch below builds one template
  var ropesL = [], guard = 0, endReserve = castle ? 40 : 26, prevCk = '';
  while (gt.length < W - endReserve && guard++ < 500) {
    // the checkpoint: a flat patch once the middle of the level is reached
    if (cpCol < 0 && gt.length >= W / 2) { var cb = flat(7, g); cpCol = cb + 3; continue; }
    var wts = weights(), tot = 0, i; for (i = 0; i < names.length; i++) tot += wts[names[i]];
    // weighted random draw of the next template ck
    var x = r() * tot, k = 0; while (k < names.length - 1 && x >= wts[names[k]]) { x -= wts[names[k]]; k++; }
    var ck = names[k];
    // a stage with a secret exit must contain the ring (the entrance to the bonus room) once a quarter of the width is built
    if (wantSecret && ringCount === 0 && gt.length >= W * 0.25 && !castle) ck = 'ring';
    else if (excurWant && !excurDone && gt.length >= W * 0.4) ck = 'excur';
    // never start a jump section right behind a hazard: guarantee a flat run-up of 4 columns first
    markHaz(); var sr = safeRunway(); if (sr < 4) { if (gt[gt.length - 1] === g) flat(4 - sr, g); else flat(4, g); }
    var wallBefore = (ck === 'poison' && prevCk === 'flood') || (ck === 'flood' && prevCk === 'poison'); prevCk = ck;
    if (wallBefore) { var wgh = g - 2 < 7 ? g - 1 : g - 2; flat(2, g); flat(2, wgh); flat(2, g); }   // water and poison never touch: a wall always stands between them
    var c0, len, gw, dg, i2, q;
    // templates: each branch appends columns to gt[] and adds tiles (tl), enemies, movers ...; flats[] records plain stretches where blocks and enemies are added later, noEn marks stretches that already hold their own trouble
    if (ck === 'flat') { len = rnd(6, 13); c0 = flat(len, g); flats.push({ c: c0, len: len, g: g }); }
    // pit of width gw with a height change dg across it; arcs[] makes a coin arc over the gap
    else if (ck === 'gap') {
      gw = rnd(2, gapMax); dg = [0, 0, 0, 1, -1][rnd(0, 4)]; if (dg < 0 && g + 1 > 12) dg = 0; if (dg > 0 && g - dg < 8) dg = 0; if (dg < 0 && gw > gapMax - 1) dg = 0;
      c0 = pit(gw); arcs.push({ c: c0, w: gw, g: g, ng: g - dg });
      g -= dg; len = rnd(4, 8); var c1 = flat(len, g); flats.push({ c: c1, len: len, g: g });
    }
    // 2-3 steps of 2 columns up or down, clamped to the allowed row band
    else if (ck === 'stairs') {
      var up = r() < 0.55, steps = rnd(2, 3); if (up && g - steps < 8) up = false; if (!up && g + steps > 12) up = true; if (up && g - steps < 8) steps = 1;
      for (i2 = 0; i2 < steps; i2++) { g += up ? -1 : 1; flat(2, g); } flat(3, g);
    }
    // a single raised block, 1-3 tiles high (never above what the probe says can be jumped)
    else if (ck === 'hurdle') { var hh = rnd(1, Math.min(3, lim.up - 1)), ww = rnd(1, 2); if (g - hh < 6) continue; flat(ww, g - hh); }
    else if (ck === 'spikes') { var sw = rnd(1, diff > 0.5 ? 3 : 2); c0 = flat(sw, g); for (i2 = 0; i2 < sw; i2++) tl.push([c0 + i2, g - 1, T.SPIKE]); }
    // a chain of stone islands over pits; spots[] marks where coins may float above them
    else if (ck === 'islands') {
      var cnt = rnd(2, 4), ri = g;
      for (i2 = 0; i2 < cnt; i2++) {
        var gp = rnd(2, Math.max(2, gapMax - 1)), d = [0, 0, -1, 1][rnd(0, 3)]; if (ri - d < 8 || ri - d > 12) d = 0; if (d < 0) gp = Math.min(gp, Math.max(2, gapMax - 2));
        pit(gp); ri -= d; var iw = rnd(2, 3), ic = pit(iw);
        for (q = 0; q < iw; q++) { tl.push([ic + q, ri, T.SOLID]); spots.push({ x: (ic + q) * TS + 8, y: (ri - 1) * TS + 4 }); }
      }
      pit(rnd(2, Math.max(2, gapMax - 1))); g = ri; len = rnd(4, 7); var c3 = flat(len, g); flats.push({ c: c3, len: len, g: g });
    }
    // a pit wider than any plain jump, so the moving platform is required (kind 0 horizontal sweep, 1 vertical)
    else if (ck === 'mover' || ck === 'vmover') {
      var pw = ck === 'mover' ? rnd(Math.max(lim.gapRun + 1, 6), Math.max(lim.gapRun + 1, 6) + 3) : 7; c0 = pit(pw);
      if (ck === 'mover') movers.push({ kind: 0, cx: (c0 + pw / 2) * TS, y: g * TS, w: 48, amp: pw * TS / 2, per: [240, 360, 480][rnd(0, 2)], ph: 0 });
      else movers.push({ kind: 1, cx: (c0 + pw / 2) * TS, y: g * TS, w: 48, amp: 22, per: [240, 360][rnd(0, 1)], ph: 0 });
      len = rnd(4, 7); var c4 = flat(len, g); flats.push({ c: c4, len: len, g: g });
    }
    // two platforms orbiting over a pit (kind 2)
    else if (ck === 'orbit') {
      var ow = 9; c0 = pit(ow); for (i2 = 0; i2 < 2; i2++) movers.push({ kind: 2, cx: (c0 + ow * (i2 + 1) / 3) * TS, y: g * TS - 6, w: 36, amp: 18 + r() * 8, per: 300, ph: i2 * Math.PI });
      len = rnd(4, 7); var c5 = flat(len, g); flats.push({ c: c5, len: len, g: g });
    }
    // rope swing: a 9-14 tile pit with NO platforms, ropes hang from pivots above it (1 up to 11 tiles, else 2 of different length); only ropeProbe-verified layouts are used
    else if (ck === 'rope') {
      var rgw = rnd(9, 14), rn = rgw <= 11 ? 1 : 2, rmax = Math.min(128, g * TS - 64), rlens = null, rtry, rcand = [48, 56, 64, 72, 80, 90, 100, 112, 128].filter(function (v) { return v <= rmax; });
      for (rtry = 0; rtry < 7 && !rlens && rcand.length; rtry++) {
        var rl = [rcand[rnd(0, rcand.length - 1)]]; if (rn === 2) { var rl2 = rcand[rnd(0, rcand.length - 1)]; if (Math.abs(rl2 - rl[0]) < 24) continue; rl.push(rl2); }
        if (ropeProbe(rgw, g, rl)) rlens = rl;
      }
      if (!rlens) continue;
      var rEdge = gt.length; c0 = pit(rgw); var ri0 = ropesL.length;
      rlens.forEach(function (rlen, ri) { var rpx = (c0 + rgw * (ri + 1) / (rn + 1)) * TS; ropesL.push({ px: rpx, py: g * TS - 44 - rlen, len: rlen, land: (c0 + rgw) * TS + 6 });
        for (var rq = -2; rq <= 2; rq++) coinsX.push({ x: rpx + rlen * Math.sin(rq * 0.3), y: g * TS - 44 - rlen + rlen * Math.cos(rq * 0.3) + 6 }); });
      routeL.push({ k: 'xge', x: (rEdge - 4) * TS, x2: rEdge * TS - 12 }); routeL.push({ k: 'ropeDone', i0: ri0, n: rn, x: (c0 + rgw) * TS + 6, y: g * TS - 7 });
      len = rnd(5, 8); var cRo = flat(len, g); flats.push({ c: cRo, len: len, g: g });
    }
    // a rotating cross: four pads at the ends of spokes turn at a constant speed round a hub above a wide pit
    else if (ck === 'cross') {
      var xw = rnd(9, 11); c0 = pit(xw); var xR = xw * TS / 2 - 20; for (i2 = 0; i2 < 4; i2++) movers.push({ kind: 2, cross: 1, cx: (c0 + xw / 2) * TS, y: g * TS, w: 32, amp: xR, per: 480, ph: i2 * Math.PI / 2 });
      len = rnd(4, 7); var cX = flat(len, g); flats.push({ c: cX, len: len, g: g });
    }
    // a heavy stone block gliding across a pit, resting a moment at each end
    else if (ck === 'stone') {
      var sw = rnd(8, 10); c0 = pit(sw); movers.push({ kind: 15, cx: (c0 + sw / 2) * TS, y: g * TS, w: 44, amp: sw * TS / 2 - 26, per: [300, 420][rnd(0, 1)], ph: 0 });
      len = rnd(4, 7); var cS = flat(len, g); flats.push({ c: cS, len: len, g: g });
    }
    // two swinging planks on chains (opposite phases) over a pit
    else if (ck === 'pend') {
      var pw2 = rnd(8, 10); c0 = pit(pw2); var pl0 = pw2 * TS / 2 - 14; for (i2 = 0; i2 < 2; i2++) movers.push({ kind: 17, cx: (c0 + pw2 / 2) * TS, y: g * TS, w: 34, len: pl0, swing: 1.0, per: 330, ph: i2 * Math.PI });
      len = rnd(4, 7); var cP = flat(len, g); flats.push({ c: cP, len: len, g: g });
    }
    // a pad circling a rectangular rail loop over a pit
    else if (ck === 'rail') {
      var rw2 = rnd(9, 10); c0 = pit(rw2); movers.push({ kind: 18, cx: (c0 + rw2 / 2) * TS, y: g * TS - 16, w: 32, wd: rw2 * TS - 44, ht: 36, per: 560, ph: 0 });
      len = rnd(4, 7); var cR = flat(len, g); flats.push({ c: cR, len: len, g: g });
    }
    // drifting rafts that always travel one way across a pit and wrap round at the ends
    else if (ck === 'drift') {
      var dw = rnd(9, 11); c0 = pit(dw); var dspan = dw * TS + 40; for (i2 = 0; i2 < 2; i2++) movers.push({ kind: 19, x0: c0 * TS - 20, span: dspan, sp: 0.55, ph: i2 * dspan / 2, y: g * TS, w: 36, cx: (c0 + dw / 2) * TS });
      len = rnd(4, 7); var cD = flat(len, g); flats.push({ c: cD, len: len, g: g });
    }
    // three crumbling platforms over a pit (kind 3)
    else if (ck === 'falling') {
      var fw = 8; c0 = pit(fw); for (i2 = 0; i2 < 3; i2++) movers.push({ kind: 3, cx: (c0 + fw * (i2 + 0.5) / 3) * TS, y: g * TS, w: 32, amp: 0, per: 300, ph: 0 });
      len = rnd(4, 7); var c6 = flat(len, g); flats.push({ c: c6, len: len, g: g });
    }
    // free-angle ramp: up a slope of the chosen angle, a flat top, and down again. 45 degrees are the old SLR/SLL tiles (the 'hills' template); this one builds exact 30 (any look), 15 / 60 / 75 (underground looks) and 60 (ice looks) degrees out of slope cells whose surface segment is stored in slpX
    else if (ck === 'ramp') {
      var angs = RAMP_ANGLES(o.theme !== undefined ? o.theme : castle ? 4 : pickTheme(seed, n, kind)), ang = angs[Math.floor(r() * angs.length)], rs = rampSpec(ang, g), rh = rs.H, rn = rs.n, rdir, ri, rc, ycol0, ycol1, rowFull, rowTop, rr2;
      flat(2, g);
      for (rdir = 1; rdir >= -1; rdir -= 2) {
        if (rdir === -1) flat(rnd(3, 6), g - rh);
        for (ri = 0; ri < rn; ri++) {
          var ia = rdir > 0 ? ri : rn - 1 - ri;   // distance along the slope of this column from the low end
          ycol0 = g * TS - rh * TS * ia / rn;   // surface height at the column's low edge (larger y)
          ycol1 = g * TS - rh * TS * (ia + 1) / rn;   // ... at its high edge
          rowFull = Math.ceil(ycol0 / TS - 1e-6); rowTop = Math.floor(ycol1 / TS + 1e-6); rc = gt.length; gt.push(rowFull);
          for (rr2 = rowTop; rr2 < rowFull; rr2++) {
            var top = rr2 * TS, m0 = rdir > 0 ? (ycol1 - ycol0) / TS : (ycol0 - ycol1) / TS, yAtLeft = rdir > 0 ? ycol0 - top : ycol1 - top, xa0, xb0, qa, qb;   // local line: y = yAtLeft + m0 * x (rising to the right when rdir > 0)
            qa = (0 - yAtLeft) / m0; qb = (TS - yAtLeft) / m0; xa0 = Math.max(0, Math.min(TS, Math.min(qa, qb))); xb0 = Math.max(0, Math.min(TS, Math.max(qa, qb)));
            slpX[rc * ROWS + rr2] = [+xa0.toFixed(3), +Math.max(0, Math.min(TS, yAtLeft + m0 * xa0)).toFixed(3), +xb0.toFixed(3), +Math.max(0, Math.min(TS, yAtLeft + m0 * xb0)).toFixed(3)];
            tl.push([rc, rr2, T.SLP]);
          }
        }
      }
      flat(2, g);
    }
    // a plateau reached by slope tiles (SLR up, SLL down), with coins on top
    else if (ck === 'hills') {
      var hk = rnd(2, 3); if (g - hk < 6) continue; flat(1, g);
      for (i2 = 0; i2 < hk; i2++) { var cc = flat(1, g - i2); tl.push([cc, g - i2 - 1, T.SLR]); }
      var pl = rnd(2, 4), pc = flat(pl, g - hk); for (q = 0; q < pl; q++) if (r() < 0.6) coinsX.push({ x: (pc + q) * TS + 8, y: (g - hk - 1) * TS + 4 });
      for (i2 = 0; i2 < hk; i2++) { var cd = flat(1, g - hk + i2 + 1); tl.push([cd, g - hk + i2, T.SLL]); }
      flat(3, g);
    }
    // a liquid river: stone steps of 2 columns between liquid gaps of gsz columns; ks steps in total
    else if (ck === 'lava' || ck === 'poison') {   // a liquid river crossed on stone steps; embers leap out of the lava (fire-proof), fish out of the poison (killable)
      var isL = ck === 'lava', ks = rnd(2, 3), gsz = rnd(2, 3), cur2 = gt.length, jl = [];
      flat(3, g); cur2 = gt.length;
      for (var sI = 0; sI <= ks; sI++) {
        var gs0 = gt.length;
        for (i2 = 0; i2 < gsz; i2++) { var cl = gt.length; gt.push(isL ? ROWS : ROWS - 1); for (q = g; q < (isL ? ROWS : ROWS - 1); q++) tl.push([cl, q, isL ? T.LAVA : T.POISON]); if (i2 === (gsz >> 1)) jl.push(cl); }
        if (isL) geysersX.push({ x: gs0 * TS, w: gsz * TS, y: g * TS, h: 5 * TS, per: rnd(170, 240), on: 55, ph: rnd(0, 239) });   // a periodic pillar of fire over each lava gap
        if (sI < ks) { var st0c = flat(2, g); coinsX.push({ x: (st0c + 1) * TS, y: (g - 1.6) * TS }); }
      }
      jl.forEach(function (cl2) { var per = rnd(110, 170), hg = rnd(34, 58); enemiesX.push(isL ? { t: E.EMBER, x: cl2 * TS + 2, y: g * TS, w: 12, h: 12, ax: cl2 * TS + 2, by: g * TS, per: per, pho: rnd(0, per), hgt: hg, up: 1, hid: true, spd: 0 } : { t: E.LEAPFISH, poison: 1, x: cl2 * TS + 2, y: g * TS, w: 14, h: 9, ax: cl2 * TS + 2, by: g * TS, per: per, pho: rnd(0, per), hgt: hg, up: 1, hid: true, spd: 0 }); });
      flat(4, g);
    }
    // water basin template: dug below the ledge row so the neighbouring ledges are its walls; pillars, optional poison layers and life are added inside
    else if (ck === 'flood') {
      while (g > 9) { g--; flat(2, g); } flat(3, g);
      var D = Math.min(4, 13 - g), inner = rnd(12, 18), bs = basin(g, D, inner), f = bs.f, wdn = D;
      var px = bs.c0 + 3, pill = {}; while (px < bs.c0 + inner - 3) { var ph2 = rnd(1, Math.max(1, D - 2)); if (r() < 0.7) { for (q = 1; q <= ph2; q++) tl.push([px, f - q, T.SOLID]); pill[px] = 1; } else { tl.push([px, f - 1, T.SPIKE]); pill[px] = 1; } px += rnd(4, 6); }
      // heavy poison sinks: a layer of it lies on the basin floor under the clean water, or it pools in pits dug into the floor (swim above it, touching it is deadly)
      // poison variant: below 0.35 a poison layer on the basin floor, below 0.7 puddles dug into the floor, else clean water (the first stage stays clean)
      var pvar = nn >= 2 ? r() : 1;
      var layerHere = pvar < 0.35 && D >= 3;
      if (layerHere) { for (var ti = 0; ti < tl.length; ti++) { var te = tl[ti]; if (te[2] === T.WATER && te[1] === f - 1 && te[0] >= bs.c0 && te[0] < bs.c0 + inner) te[2] = T.POISON; } usedPoisonLayer = true; }
      // puddles: 1-2 pits in the basin floor filled with poison, to be swum over
      else if (pvar < 0.7 && inner >= 12) { var pcn = rnd(1, 2); for (i2 = 0; i2 < pcn; i2++) { var pc1 = bs.c0 + 2 + Math.floor((i2 + 0.3 + r() * 0.4) * (inner - 6) / pcn); if (pill[pc1] || pill[pc1 + 1] || pill[pc1 - 1] || pill[pc1 + 2]) continue; gt[pc1] = f + 1; gt[pc1 + 1] = f + 1; tl.push([pc1, f, T.POISON]); tl.push([pc1 + 1, f, T.POISON]); } }
      // coins along the basin, then optional side currents (CURL / CURR), then air pockets every 7 columns so the swimmer can breathe
      for (i2 = 0; i2 < 4; i2++) coinsX.push({ x: (bs.c0 + 3 + i2 * (inner - 6) / 3) * TS + 8, y: (g + 1.5) * TS });
      if (r() < 0.55 && inner >= 14) { var cs0 = bs.c0 + rnd(3, inner - 9), csl = rnd(4, 6), ct = r() < 0.5 ? T.CURL : T.CURR; for (i2 = 0; i2 < csl; i2++) for (q = g; q < (layerHere ? f - 1 : f); q++) if (!pill[cs0 + i2]) tl.push([cs0 + i2, q, ct]); }
      if (r() < 0.35 && inner >= 12) { var cu0 = bs.c0 + rnd(4, inner - 6); for (i2 = 0; i2 < 2; i2++) for (q = g; q < (layerHere ? f - 1 : f); q++) if (!pill[cu0 + i2]) tl.push([cu0 + i2, q, T.CURU]); }
      for (var pc = bs.c0 + 4; pc < bs.c0 + inner - 2; pc += 7) if (!pill[pc]) pockets.push({ x: pc * TS + 8, y: (g + 1.5) * TS });
      // creatures only in real stages, not in bonus rooms
      if (!room) { waterLife(bs.c0, inner, g, D, pill); if (diff > 0.15 && r() < (kind === 'flood' ? 0.6 : 0.375)) { var lc = bs.c0 + rnd(4, Math.max(4, inner - 5)), lper = rnd(120, 180); var ride0 = r() < 0.5; enemiesX.push({ t: E.LEAPFISH, ride: ride0 ? 1 : 0, x: lc * TS + 1, y: g * TS, w: ride0 ? 24 : 14, h: ride0 ? 13 : 9, ax: lc * TS + 1, by: g * TS, per: lper, pho: rnd(0, lper), hgt: rnd(30, 50), up: 1, hid: true, spd: 0 }); } }
      flat(3, g);
    }
    // a conveyor floor (CONVL / CONVR) that carries the hero; no enemies on it
    else if (ck === 'conv') {
      len = rnd(8, 12); c0 = flat(len, g); var cdir = r() < 0.5 ? T.CONVL : T.CONVR; for (i2 = 0; i2 < len; i2++) tl.push([c0 + i2, g, cdir]);
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    // a wall cannon near the right end of the floor firing left at the hero
    else if (ck === 'cannon') {
      len = rnd(9, 13); c0 = flat(len, g); var cc2 = c0 + len - 3, dirc = -1; tl.push([cc2, g - 1, T.CANL]);
      cannons.push({ x: cc2 * TS, y: (g - 1) * TS, dir: dirc, per: 170 + rnd(0, 50), ph: rnd(0, 120) }); flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    // a plant that rises out of a stump in the middle of the floor
    else if (ck === 'plant') {
      len = rnd(7, 10); c0 = flat(len, g); var pc2 = c0 + rnd(3, len - 4); tl.push([pc2, g - 1, T.STUMP]);
      enemiesX.push({ t: E.PLANT, x: pc2 * TS + 2, y: (g - 1) * TS, y0: (g - 1) * TS, w: 12, h: 18, ph: rnd(0, 200), spd: 0 }); flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    // crushers hanging from the ceiling above the stretch (a second one on long floors)
    else if (ck === 'crush') {
      len = rnd(9, 12); c0 = flat(len, g); enemiesX.push({ t: E.CRUSH, x: (c0 + len / 2) * TS - 12, y: (g - 7) * TS, y0: (g - 7) * TS, w: 24, h: 24, spd: 0 });
      if (len > 11) enemiesX.push({ t: E.CRUSH, x: (c0 + len - 3) * TS - 12, y: (g - 7) * TS, y0: (g - 7) * TS, w: 24, h: 24, spd: 0 });
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    // one or two ghosts floating above the floor (more at higher difficulty)
    else if (ck === 'ghost') {
      len = rnd(10, 14); c0 = flat(len, g); var ng = diff > 0.5 ? 2 : 1;
      for (i2 = 0; i2 < ng; i2++) enemiesX.push({ t: E.GHOST, x: (c0 + len * (i2 + 1) / (ng + 1)) * TS, y: (g - 4) * TS, w: 14, h: 14, spd: 0 });
      flats.push({ c: c0, len: len, g: g });
    }
    // a spring throws the hero up to a high ledge of coin spots
    else if (ck === 'spring') {
      len = rnd(8, 10); c0 = flat(len, g); tl.push([c0 + 2, g - 1, T.SPRING]);
      for (q = 0; q < 3; q++) tl.push([c0 + 5 + q, g - 8, T.SOLID]); for (q = 0; q < 3; q++) spots.push({ x: (c0 + 5 + q) * TS + 8, y: (g - 9) * TS + 6 });
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    // a climbable vine up to a high ledge (coin boxes up there; from level 3 the route climbs it: Up on the vine, then jump off sideways)
    else if (ck === 'vine') {
      len = rnd(8, 10); c0 = flat(len, g); for (q = 1; q <= 7; q++) tl.push([c0 + 3, g - q, T.VINE]);
      for (q = 0; q < 4; q++) tl.push([c0 + 4 + q, g - 8, T.SOLID]); for (q = 0; q < 3; q++) spots.push({ x: (c0 + 4 + q) * TS + 8, y: (g - 9) * TS + 6 });
      if (g - 12 >= 1) { tl.push([c0 + 5, g - 12, T.QC]); tl.push([c0 + 6, g - 12, T.QC]); }
      if (nn >= 3 && !room && g - 8 >= 2) routeL.push({ k: 'at', x: (c0 + 5.5) * TS, y: (g - 8) * TS - 7 });
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    // the mandatory excursion: a sky route over a wide pit (vine up, cloud islands, drop to the ground) or a hatch down into a cavern inside a solid mountain (the hatch inside leads out beyond it)
    else if (ck === 'excur') {
      excurDone = true;
      if (excurKind === 0 && g >= 10) {
        len = 9; c0 = flat(len, g); var vcx = c0 + 3, lrow = g - 8, ex = c0 + 7, isl = [], pitStart = c0 + 9;
        for (q = 1; q <= 7; q++) tl.push([vcx, g - q, T.VINE]);
        for (q = 0; q < 4; q++) tl.push([c0 + 4 + q, lrow, T.SOLID]);
        routeL.push({ k: 'at', x: (c0 + 5.5) * TS, y: lrow * TS - 7 });
        var cr = lrow, nIsl = 4, gpMax = Math.max(2, Math.min(4, gapMax));
        for (i2 = 0; i2 < nIsl; i2++) {
          var gp2 = rnd(2, gpMax), s0 = ex + 1 + gp2, w2 = rnd(3, 4), dr = [-1, 0, 0, 1][rnd(0, 3)]; cr = Math.max(3, Math.min(g - 6, cr + dr)); if (i2 === 0) cr = Math.max(3, Math.min(lrow + 1, cr)); if (cr < lrow - 1) cr = lrow - 1;
          isl.push({ s: s0, w: w2, row: cr }); ex = s0 + w2 - 1;
        }
        pit(ex - pitStart + 1);
        isl.forEach(function (is, ii) {
          for (q = 0; q < is.w; q++) { tl.push([is.s + q, is.row, T.SOLID]); tl.push([is.s + q, is.row + 1, T.SOLID]); }
          coinsX.push({ x: (is.s + is.w / 2) * TS, y: (is.row - 1.6) * TS }, { x: (is.s + is.w / 2) * TS + 12, y: (is.row - 1.6) * TS });
          if (ii >= 1 && is.row - 4 >= 1) { tl.push([is.s + 1, is.row - 4, T.QC]); tl.push([is.s + 2, is.row - 4, ii === 2 ? T.QS : T.BRICK]); }
          routeL.push({ k: 'at', x: (is.s + is.w / 2) * TS, y: is.row * TS - 7 });
        });
        var gEnd = flat(8, g); routeL.push({ k: 'xge', x: (gEnd + 3) * TS, y: g * TS - 7 });
        flats.push({ c: gEnd, len: 8, g: g, noEn: true });
      } else {
        var m0, MW = 24, pc2 = 0, c1;
        c0 = flat(6, g); pc2 = c0 + 3; tl.push([pc2, g - 1, T.TELE]); flats.push({ c: c0, len: 3, g: g, noEn: true });
        m0 = gt.length; for (q = 0; q < MW; q++) gt.push(0);
        for (q = m0 + 2; q <= m0 + MW - 3; q++) for (i2 = 2; i2 <= 10; i2++) tl.push([q, i2, 0]);
        for (q = m0 + 9; q <= m0 + 11; q++) for (i2 = 11; i2 <= 13; i2++) tl.push([q, i2, 0]);   // a pit in the cavern floor
        tl.push([m0 + 14, 10, T.SOLID]); tl.push([m0 + 15, 10, T.SOLID]);
        tl.push([m0 + 5, 7, T.QC]); tl.push([m0 + 6, 7, T.BRICK]); tl.push([m0 + 7, 7, T.QS]);
        for (q = 0; q < 5; q++) coinsX.push({ x: (m0 + 12 + q * 2) * TS + 4, y: (q % 2 ? 6.2 : 8) * TS });
        for (q = 0; q < 4; q++) coinsX.push({ x: (m0 + 3 + q) * TS + 8, y: 9.4 * TS });
        tl.push([m0 + 19, 10, T.TELE]);
        c1 = flat(8, g); flats.push({ c: c1, len: 8, g: g, noEn: true });
        tl.push([c1 + 1, g - 1, T.TELE]);
        teleL.push({ c: pc2, r: g - 1, tx: (m0 + 3) * TS + 1, ty: 11 * TS - 14, col: 0, door: true });
        teleL.push({ c: m0 + 19, r: 10, tx: (c1 + 1) * TS + 1, ty: g * TS - 14, col: 1, door: true });
        routeL.push({ k: 'tele', n: ++teleN, x: pc2 * TS + 8, y: g * TS - 7 });
        routeL.push({ k: 'tele', n: ++teleN, x: (m0 + 19) * TS + 8, y: 11 * TS - 7 });
        routeL.push({ k: 'xge', x: (c1 + 4) * TS, y: g * TS - 7 });
      }
    }
    // a P-switch block under two rows of bricks (its effect changes the bricks)
    else if (ck === 'psw') {
      len = 11; c0 = flat(len, g); tl.push([c0 + 2, g - 4, T.PSW]); for (q = 0; q < 6; q++) tl.push([c0 + 4 + q, g - 4, T.BRICK]);
      for (q = 0; q < 6; q++) tl.push([c0 + 4 + q, g - 8, T.BRICK]);
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
    // a ring portal; with a secret exit the first ring leads to the bonus room (rings[] records its return point)
    else if (ck === 'ring') {
      var secret = (wantSecret && ringCount === 0 && !castle && !room);
      if (!secret) {   // an ordinary bonus ring (Up on it warps into a bonus room)
        // bonus rings are gone (their rooms looped back to the ring): only hidden secret exits remain, so this chunk is just a calm stretch of floor
        len = 7; c0 = flat(len, g); ringCount++;
        flats.push({ c: c0, len: len, g: g, noEn: true });
      } else {
        // a secret exit is no ring any more: it hides in the terrain. Reaching its invisible zone (the top of a ledge ladder, the end of a 1-tile tunnel in a mound, the bottom of a pit that has a floor and a coin trail) warps into the secret room. The route stages below make the validator (and the auto player) walk there.
        ringCount++;
        var sty = hash(seed, n, 3100) % 4, zoneX, zoneY, zoneW, zoneH, retC;
        if (sty === 3 && g < 10) sty = 1;
        if (sty === 2 && (g > 10 || ROWS - 1 - g < 3)) sty = hash(seed, n, 3101) % 2;
        if (sty === 0) {   // a ladder of ledges up to the very top of the screen
          len = 14; c0 = flat(len, g); var lrows = [g - 2, g - 4, g - 6, g - 8].filter(function (rw) { return rw >= 3; });
          if (lrows.length < 2) sty = 1;
          else {
            lrows.forEach(function (rw, k) { var col = c0 + 2 + (k % 2) * 6; for (q = 0; q < 3; q++) tl.push([col + q, rw, T.SOLID]); coinsX.push({ x: (col + 1) * TS + 8, y: (rw - 1.5) * TS }); routeL.push({ sec: 1, k: 'at', x: (col + 1.5) * TS, y: rw * TS - 7 }); });
            var trow = lrows[lrows.length - 1], tcol = c0 + 2 + ((lrows.length - 1) % 2) * 6;
            zoneX = tcol * TS; zoneW = 3 * TS; zoneY = (trow - 2) * TS; zoneH = 2 * TS; retC = tcol + 1;
            routeL.push({ sec: 1, k: 'near', x: zoneX + zoneW / 2, y: zoneY + zoneH - 8, r: 16 }); routeL.push({ sec: 1, k: 'at', x: (c0 + len - 1) * TS, y: g * TS - 7 });
            flats.push({ c: c0, len: len, g: g, noEn: true });
          }
        }
        if (sty === 1) {   // a mound with a 1-tile tunnel in its right foot
          flat(2, g); var m0 = gt.length; for (q = 0; q < 8; q++) gt.push(q === 0 ? g - 1 : q === 1 ? g - 2 : g - 3);
          for (q = 3; q <= 7; q++) tl.push([m0 + q, g - 1, 0]);
          coinsX.push({ x: (m0 + 5) * TS + 8, y: (g - 0.6) * TS });
          var m1 = flat(5, g); zoneX = (m0 + 3) * TS; zoneW = 4 * TS; zoneY = (g - 1) * TS; zoneH = TS; retC = m1 + 1;
          routeL.push({ sec: 1, k: 'xge', x: (m0 + 9) * TS, y: g * TS - 7 }); routeL.push({ sec: 1, k: 'near', x: zoneX + zoneW / 2, y: zoneY + 8, r: 14 }); routeL.push({ sec: 1, k: 'xge', x: (m1 + 3) * TS, y: g * TS - 7 });
          flats.push({ c: m1, len: 5, g: g, noEn: true });
        } else if (sty === 2) {   // a pit with a floor and a coin trail leading down: not a death pit; steps lead out again
          var pd = Math.min(4, ROWS - 1 - g); flat(3, g); var p0 = gt.length; [g + 1, g + pd, g + pd, g + pd, g + 2, g + 1].forEach(function (hh) { gt.push(hh); });
          coinsX.push({ x: p0 * TS + 8, y: (g - 0.6) * TS }, { x: (p0 + 1) * TS + 8, y: (g + 1.2) * TS }, { x: (p0 + 2) * TS + 8, y: (g + pd - 1.6) * TS });
          var p1 = flat(4, g); zoneX = (p0 + 1) * TS; zoneW = 3 * TS; zoneY = (g + pd - 1) * TS; zoneH = TS; retC = p1 + 1;
          routeL.push({ sec: 1, k: 'near', x: zoneX + zoneW / 2, y: zoneY + 8, r: 14 }); routeL.push({ sec: 1, k: 'xge', x: (p1 + 2) * TS, y: g * TS - 7 });
          flats.push({ c: p1, len: 4, g: g, noEn: true });
        } else if (sty === 3) {   // an ordinary-looking vine up to a high ledge; the zone hides above the ledge (found by climbing)
          len = 12; c0 = flat(len, g); for (q = 1; q <= 7; q++) tl.push([c0 + 3, g - q, T.VINE]); for (q = 0; q < 4; q++) tl.push([c0 + 4 + q, g - 8, T.SOLID]);
          coinsX.push({ x: (c0 + 5) * TS + 8, y: (g - 9.5) * TS }, { x: (c0 + 6) * TS + 8, y: (g - 9.5) * TS });
          zoneX = (c0 + 4) * TS; zoneW = 4 * TS; zoneY = (g - 10) * TS; zoneH = 2 * TS; retC = c0 + 9;
          routeL.push({ sec: 1, k: 'at', x: (c0 + 5.5) * TS, y: (g - 8) * TS - 7 }); routeL.push({ sec: 1, k: 'near', x: zoneX + zoneW / 2, y: zoneY + zoneH - 8, r: 16 }); routeL.push({ sec: 1, k: 'at', x: (c0 + len - 1) * TS, y: g * TS - 7 });
          flats.push({ c: c0, len: len, g: g, noEn: true });
        }
        rings.push({ c: retC, secret: true, room: 1, y: g * TS });
        secretZone = { x: zoneX, y: zoneY, w: zoneW, h: zoneH, ring: rings.length - 1 };
      }
    }
    // key and door, or switch and gate: a wall of the floor with a locked opening, the key / switch on a high ledge; routeL lists the stages the validator must follow (fetch, open, cross)
    else if (ck === 'keydoor' || ck === 'sgate') {
      len = 12; c0 = flat(len, g); var wcn = gt.length; for (q = 0; q < 3; q++) tl.push([c0 + 2 + q, g - 3, T.SOLID]); for (q = 3; q < 6; q++) tl.push([c0 + 2 + q, g - 6, T.SOLID]);
      var kx = (c0 + 6) * TS + 8, ky = (g - 7) * TS + 8; gt.push(0); gt.push(0);
      if (ck === 'keydoor') { var kc = gcount++ % 3, di2 = doorsL.length; keysL.push({ x: kx, y: ky, c: kc }); doorsL.push({ c: wcn, r0: g - 3, r1: g - 1, g: kc }); for (q = 1; q <= 3; q++) { tl.push([wcn, g - q, T.DOOR]); gl.push([wcn, g - q, kc]); tl.push([wcn + 1, g - q, 0]); }
        routeL.push({ k: 'key', g: kc, x: kx, y: ky }); routeL.push({ k: 'door', i: di2, x: wcn * TS + 8, y: g * TS - 7 }); }
      else { var sb2 = gcount++ % 8, sc3 = Math.floor((kx) / TS), sr3 = g - 7; switchesL.push({ c: sc3, r: sr3, g: sb2 }); tl.push([sc3, sr3, T.SWITCH]); gl.push([sc3, sr3, sb2]); for (q = 1; q <= 3; q++) { tl.push([wcn, g - q, T.GATE]); gl.push([wcn, g - q, sb2]); tl.push([wcn + 1, g - q, 0]); }
        routeL.push({ k: 'sw', g: sb2, x: kx, y: ky }); }
      routeL.push({ k: 'xge', x: (wcn + 2) * TS, y: g * TS - 7 });
    }
    // ICE tiles on the floor are slippery; usedIce makes the level cold-themed
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
    // a gap with a sideways wind zone around it (pushes with or against the jump)
    else if (ck === 'wind') {
      gw = rnd(2, gapMax); c0 = pit(gw); var wdx = (r() < 0.5 ? 1 : -1) * (0.05 + 0.04 * diff); winds.push({ x0: (c0 - 3) * TS, x1: (c0 + gw + 3) * TS, y0: (g - 9) * TS, y1: (g + 1) * TS, dx: wdx, dy: 0 });
      arcs.push({ c: c0, w: gw, g: g, ng: g }); len = rnd(5, 8); var c7 = flat(len, g); flats.push({ c: c7, len: len, g: g });
    }
    // a gap with an updraft column in the middle, coins stacked along it
    else if (ck === 'updraft') {
      gw = rnd(3, gapMax); c0 = pit(gw); winds.push({ x0: (c0 + gw / 2 - 1) * TS, x1: (c0 + gw / 2 + 1.2) * TS, y0: (g - 11) * TS, y1: (g + 1) * TS, dx: 0, dy: -0.85, up: 1 });
      for (q = 0; q < 4; q++) coinsX.push({ x: (c0 + gw / 2 + 0.1) * TS, y: (g - 3 - q * 1.7) * TS + 8 });
      arcs.push({ c: c0, w: gw, g: g, ng: g }); len = rnd(5, 8); var c8 = flat(len, g); flats.push({ c: c8, len: len, g: g });
    }
    // cloud platforms (kind 4) over a pit, alternately bobbing
    else if (ck === 'cloud') {
      var cw = 9; c0 = pit(cw); var nc = 4; for (i2 = 0; i2 < nc; i2++) movers.push({ kind: 4, cx: (c0 + cw * (i2 + 0.5) / nc) * TS, y: g * TS - (i2 % 2) * 8, w: 30, amp: 0, per: 300 + (i2 % 2) * 60, ph: i2 * 1.7 });
      len = rnd(4, 7); var c9 = flat(len, g); flats.push({ c: c9, len: len, g: g });
    }
  }
  if (cpCol < 0) { cpCol = flat(7, g) + 3; }
  flat(4, g);
  var goalCol, poleCol, bossDef = null, bossDef2 = null, arenaC0 = 0; var bossItems = [], shellPassF = false;
  // castle / boss rush ending: a flat arena (or a flooded one) with the boss, helper items before it, and the gate at the far end; non-castles just get stairs and a pole
  if (castle && !room) {
    // boss variant bv 0..4 (forced by o.boss or hashed from seed and stage); 3 is the flooded arena, the others share the dry arena below and differ only in the boss's behaviour (v)
    var bv = o.boss !== undefined ? o.boss : (n + hash(seed, n, 5)) % 5, bx;
    if (bv === 3 && !isRush) {   // flooded arena: a deep basin whose walls are the ledges, exit steps lead to the gate
      while (g > 9) { g--; flat(2, g); } flat(6, g);
      var ba = basin(g, 4, 22); arenaC0 = ba.c0; flat(5, g); bx = (arenaC0 + 14) * TS;
      // stepping islands on the water surface: the hero stands on one, drops onto the swimmer passing right under it, bounces and lands back on ground
      [[2, 3], [8, 3], [14, 3], [20, 2]].forEach(function (pl) { for (var pc2 = arenaC0 + pl[0]; pc2 < arenaC0 + pl[0] + pl[1]; pc2++) { for (var ti = tl.length - 1; ti >= 0; ti--) if (tl[ti][0] === pc2 && tl[ti][1] === g) tl.splice(ti, 1); tl.push([pc2, g, T.SOLID]); } });
      // tidal swimmer boss: sweeps through the water between mn and mx; the islands above let the hero stomp it from the side-line
      bossDef = { t: E.BOSS, v: 3, x: bx, y: (g + 1.8) * TS, w: 30, h: 18, spd: 0, mn: (arenaC0 + 1) * TS, mx: (arenaC0 + 22) * TS, ax: (arenaC0 + 12) * TS, ay: (g + 1.8) * TS, dir: -1 };
      // air pockets so the hero can breathe during the flooded fight
      pockets.push({ x: (arenaC0 + 6) * TS, y: (g + 1.5) * TS }); pockets.push({ x: (arenaC0 + 16) * TS, y: (g + 1.5) * TS });
      bossItems.push({ k: 0, x: (arenaC0 - 3) * TS + 2, y: g * TS - 12 });   // a shrunken hero floats on the water and cannot reach the boss: a mushroom at the basin's edge makes him normal again
      poleCol = gt.length - 3; goalCol = poleCol;
    } else {
      // dry arena: 26 flat columns (44 for boss rush), a run-up before it and the gate column at its end
      flat(6, g); var AL = isRush ? 44 : 26; arenaC0 = flat(AL, g); flat(3, g); bx = (arenaC0 + 16) * TS;
      function mkBoss(v2, bxx) { var b2 = { t: E.BOSS, v: v2, x: bxx, y: g * TS - 26, w: 28, h: 26, spd: 0, mn: (arenaC0 + 1) * TS, mx: (arenaC0 + AL - 1) * TS, ax: bxx - 2 * TS, ay: (g - 4) * TS - 6, dir: -1 }; if (v2 === 4) { b2.w = 28; b2.h = 22; b2.ay = (g - 5) * TS; b2.y = b2.ay; } return b2; }
      // a dry arena cannot host the tidal boss (bv 3 falls back to boss 0); boss rush adds a second, different boss
      bossDef = mkBoss(bv === 3 ? 0 : bv, bx); if (isRush) bossDef2 = mkBoss([0, 1, 2, 4][(bv + 2) % 4] === bossDef.v ? [0, 1, 2, 4][(bv + 3) % 4] : [0, 1, 2, 4][(bv + 2) % 4], (arenaC0 + 30) * TS);
      // armoured boss: stomping only bounces, it has to be hit by a kicked shell (beetles waiting at the arena entrance) or by fireballs (flowers waiting before it)
      if (!isRush) bossItems.push({ k: 0, x: (arenaC0 - 3) * TS + 2, y: g * TS - 12 });   // a shrunken hero grows back here before the fight
      // armoured boss (every third castle or o.bossimm): stomps only bounce, so it takes a kicked shell or fireballs
      var imm = o.bossimm !== undefined ? o.bossimm : (!isRush && (n + hash(seed, n, 9)) % 3 === 0 ? (hash(seed, n, 10) % 2 ? 'shell' : 'fire') : '');
      // only boss 0 can be hit by a shell in this arena; the others get fireballs instead
      if (imm === 'shell' && bossDef.v !== 0) imm = 'fire';
      if (imm && !isRush) {
        bossDef.imm = 1; bossDef.immKind = imm;
        // shell: beetles wait at the arena entrance to be kicked (shellPass lets the validator use them); fire: fire flowers lie before and inside the arena
        if (imm === 'shell') { shellPassF = true; for (var bq = 0; bq < 4; bq++) enemiesX.push({ t: E.BEETLE, x: (arenaC0 + 1 + bq * 2) * TS, y: g * TS - 13, w: 12, h: 13, spd: 0.4, dir: bq % 2 ? -1 : 1, mn: arenaC0 * TS, mx: (arenaC0 + 9) * TS }); }
        else { bossItems.push({ k: 1, x: (arenaC0 - 4) * TS + 2, y: g * TS - 12 }); bossItems.push({ k: 1, x: (arenaC0 + 1) * TS + 2, y: g * TS - 12 }); bossItems.push({ k: 1, x: (arenaC0 + 9) * TS + 2, y: g * TS - 12 }); bossItems.push({ k: 1, x: (arenaC0 + 17) * TS + 2, y: g * TS - 12 }); bossItems.push({ k: 1, x: (arenaC0 + 5) * TS + 2, y: g * TS - 12 }); bossItems.push({ k: 1, x: (arenaC0 + 13) * TS + 2, y: g * TS - 12 }); bossItems.push({ k: 1, x: (arenaC0 + 21) * TS + 2, y: g * TS - 12 }); }   // spare flowers inside the arena: a hit that costs the power must not lock the fight
      }
      poleCol = arenaC0 + AL - 2; goalCol = poleCol;
    }
  } else {
    // ordinary ending: four steps up to the flag pole
    for (var s2 = 0; s2 < 4; s2++) { g -= 1; flat(2, g); }
    poleCol = flat(4, g) + 1; flat(8, g);
  }
  W = gt.length;
  // ---- tiles
  // rasterise: solid ground from gt[] downward, then the tile list tl on top (put() clips to the map); grpA holds the door / switch group ids
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
    // per flat stretch: either a block cluster (bricks and ? blocks, one holds the needed power-up) or coins, then ground enemies scaled by difficulty
    if (!room && f.len >= 8 && !f.noEn && r() < 0.5) {   // block cluster
      var m = rnd(3, Math.min(5, f.len - 4)), bc = f.c + 2 + rnd(0, f.len - 4 - m);
      for (var j = 0; j < m; j++) { var t = r() < 0.5 ? T.BRICK : T.QC; if (needPow && j === (m >> 1)) { t = T.QP; needPow = false; } else if (r() < 0.08) t = T.QP; else if (r() < 0.03) t = T.QS; else if (r() < 0.04 && nn >= 3) t = T.QM; put(bc + j, f.g - 4, t); }
      if (r() < 0.5) for (j = 0; j < m; j++) pushCoin((bc + j) * TS + 8, (f.g - 6) * TS + 8);
    } else if (r() < 0.5) { var cn = rnd(3, 5); for (var j2 = 0; j2 < cn; j2++) { var berry = nn >= 3 && r() < 0.25; pushCoin((mid - cn / 2 + j2 + 0.5) * TS, (f.g - 2) * TS + 8 - Math.sin(Math.PI * (j2 + 0.5) / cn) * 12, berry); } }
    if (f.noEn || room) return;
    // enemy count for this stretch (never more than one on stage 1 or in ghost houses)
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
    // airborne enemies: chance pa per eligible flat stretch and per gap
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
  // a hidden egg pickup on a suitable column in the middle part of the level
  var eggC = -1; if (!room && nn >= 2 && hash(seed, n, 977) % 60 === 0 && !teleL.length) { for (var ec = Math.floor(W * 0.3); ec < W - 12 && eggC < 0; ec++) if (gt[ec] < 14 && gt[ec] === gt[ec - 1] && gt[ec] === gt[ec + 1] && gt[ec] === gt[ec + 2]) eggC = ec; }
  // assemble the level object; these are the fields sim.js, the validator and the renderer read
  var L = { items: bossItems, shellPass: shellPassF, egg: eggC >= 0 ? { x: eggC * TS + 2, y: gt[eggC] * TS - 14 } : null, seed: seed, n: n, kind: isCannon ? 'cannon' : kind, attempt: a, diff: diff, w: W, tiles: tiles, gt: gt, coins: coins, special: specials, enemies: enemies, movers: movers, cannons: cannons, rings: rings, winds: winds, pockets: pockets, keys: keysL, doors: doorsL, switches: switchesL, tele: teleL, excur: excurDone ? (teleL.length ? 2 : 1) : 0, launch: [], grp: grpA, route: routeL.concat([{ k: 'goal', x: poleCol * TS + 6, y: null }]), puzzle: routeL.length > 0, goalX: poleCol * TS + 6, poleCol: poleCol, poleY: gy(poleCol),
    start: { x: 3 * TS + 2, y: gy(3) - P.SH }, cp: { x: cpCol * TS + 2, y: gy(cpCol) - P.SH }, time: (castle ? 150 : 90) + Math.floor(W * 0.6), kindAsked: kindAsked, theme: KIND_THEME[isCannon ? 'sky' : kind] | 0, hasIce: usedIce, hasMud: usedMud, hasFire: usedFire, room: room, hasBoss: !!bossDef };
  L.rings.forEach(function (rg) { rg.out = { x: rg.c * TS + 2, y: rg.y - P.SH }; });
  // arena columns (used by the gate and the arena logic of the simulation)
  if (castle && bossDef) L.arena = { c0: arenaC0, c1: arenaC0 + 26 };
  if (whirlsX.length) L.whirls = whirlsX;
  if (geysersX.length) L.geysers = geysersX;
  if (Object.keys(slpX).length) L.slp = slpX;
  if (secretZone) L.secretZone = secretZone;
  if (isCannon) { L.endCannon = 1; L.goalRect = { x: L.goalX - 12, y: L.poleY - 34, w: 30, h: 34 }; }   // the stage ends by climbing into the big cannon at the far end: it fires the hero away, no flag
  // 'chase' stages scroll a death wall in from the left
  if (ropesL.length) L.ropes = ropesL;
  if (kind === 'chase') L.chase = { x0: L.start.x - 130, v: 0.5 + 0.35 * diff, delay: 150 };
  return L;
}
// ------------------------------------------------------------------ maze / puzzle levels: rooms joined by locked doors, switch gates, teleport pads, launch barrels and water-rise walls
function buildMaze(seed, n, a) {
  var nn = effN(n);
  var r = rng(hash(seed, n, a * 7919 + 3)), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3; if (a >= 9) diff = 0;
  var g = 12, rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  var gt = [], tl = [], gl = [], coins = [], enemies = [], keys = [], doors = [], switches = [], tele = [], launch = [], movers = [], pockets = [], route = [], cannons = [];
  // rooms are separated by one connector each: types[] mixes door / gate / rise / tele / launch (and one fork)
  var nRooms = Math.min(6, 3 + Math.floor(diff * 2.4 + r() * 1.3)), nConn = nRooms - 1, types = [], i, bit = 0, teleN = 0, doorColor = 0;
  function flat(len, gg) { var c0 = gt.length; for (var k = 0; k < len; k++) gt.push(gg); return c0; }
  // ---- choose the connector types; a "fork" (hub with teleport pads into a key side-room and a dead end) forces a door next
  // connector kinds unlock with the stage number and difficulty (tele from stage 2, the rest later)
  for (i = 0; i < nConn; i++) { var opts = ['door', 'gate']; if (nn >= 2) opts.push('tele'); if (diff > 0.15 || nn >= 3) opts.push('launch'); types.push(opts[Math.floor(r() * opts.length)]); }
  // a fork needs two more connectors after it: the fork itself plus the door that its key opens
  var fork = -1; if (nConn >= 3 && (diff > 0.25 || r() < 0.3)) { fork = rnd(0, nConn - 2); types[fork] = 'fork'; types[fork + 1] = 'door'; }
  // ---- side rooms to the LEFT of the start (their x is below the start, so the goal gate is never triggered inside them)
  var s1c0 = -1, s2c0 = -1, s1c1 = 0;
  if (fork >= 0) { flat(2, 0); s2c0 = flat(11, g); flat(2, 0); s1c0 = flat(13, g); s1c1 = gt.length; flat(2, 0); }
  // room start / end columns; alc[] counts the key alcoves already built per room
  var roomS = [], roomE = [], alc = [], wallC = [];
  function floorKey(j, c, kind, grp, color) {   // alcove: two stepping platforms, the pickup on the upper one
    var rs = roomS[j], re = roomE[j], k = alc[j] || 0, a0 = rs + 3 + k * 8;
    if (a0 + 7 > re - 3) { return { x: (rs + 4) * TS + 8, y: (g - 1) * TS + 8, c: rs + 4 }; }
    alc[j] = k + 1; for (var q = 0; q < 3; q++) tl.push([a0 + q, g - 3, T.SOLID]); for (q = 3; q < 6; q++) tl.push([a0 + q, g - 6, T.SOLID]);
    return { x: (a0 + 4) * TS + 8, y: (g - 7) * TS + 8, c: a0 + 4 };
  }
  var sideKeyColor = -1;
  for (i = 0; i < nRooms; i++) {
    // main loop: lay out room i, then build the connector to room i+1 on the columns after it
    var w = i === 0 ? 16 : rnd(15, 19); roomS[i] = flat(w, g); roomE[i] = gt.length;
    if (i >= nConn) break;
    var ty = types[i], rs = roomS[i], re = roomE[i], wc = gt.length;
    // key or switch lies in this room, or (needBack) in an earlier one so the hero must backtrack; route[] gets its stages in order
    if (ty === 'door' || ty === 'gate' || ty === 'rise') {
      var needBack = i > 0 && r() < 0.35 + 0.4 * diff, j = needBack ? rnd(0, i - 1) : i, pos;
      var isSide = (ty === 'door' && i === fork + 1 && fork >= 0);
      // door: a coloured key opens a 3-tile DOOR; route stages are 'key', then 'door', then 'xge' (cross the connector)
      if (ty === 'door') {
        var color = doorColor++ % 3;
        if (isSide) { pos = { x: (s1c0 + 7) * TS + 8, y: (g - 1) * TS + 8 }; }
        else pos = floorKey(j);
        keys.push({ x: pos.x, y: pos.y, c: color }); var prep = { k: 'key', g: color, x: pos.x, y: pos.y };
        if (!isSide) { route.push(prep); } else { /* fetched through the fork's side room: stages were added by the fork */ }
        gt.push(0); gt.push(0); var di = doors.length; doors.push({ c: wc, r0: g - 3, r1: g - 1, g: color });
        for (var q = 1; q <= 3; q++) { tl.push([wc, g - q, T.DOOR]); gl.push([wc, g - q, color]); tl.push([wc + 1, g - q, 0]); }
        route.push({ k: 'door', i: di, x: wc * TS + 8, y: g * TS - 7 }); route.push({ k: 'xge', x: (wc + 2) * TS, y: g * TS - 7 });
      // gate: a floor switch (bit sbit) opens the GATE wall of the same bit; the switch stands where the key would be
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
    // tele: a full-height wall; the pad before it teleports the hero to a pad behind it
    } else if (ty === 'tele') {
      gt.push(0); gt.push(0);
      var pc = re - 4, tc = wc + 2 + 3; tl.push([pc, g - 1, T.TELE]); tl.push([tc, g - 1, T.TELE]);
      tele.push({ c: pc, r: g - 1, tx: tc * TS + 1, ty: g * TS - 14, col: teleN % 3 }); route.push({ k: 'tele', n: ++teleN, x: pc * TS + 8, y: g * TS - 7 }); route.push({ k: 'xge', x: (wc + 2 + 5) * TS, y: g * TS - 7 });
    // launch: a launch pad throws the hero (vx 3.2, vy -9) over a 6-column pit
    } else if (ty === 'launch') {
      var pw = 6; tl.push([re - 2, g - 1, T.LAUNCH]); launch.push({ c: re - 2, r: g - 1, vx: 3.2, vy: -9 });
      for (var q3 = 0; q3 < pw; q3++) gt.push(ROWS); route.push({ k: 'xge', x: (wc + pw + 1) * TS, y: g * TS - 7 });
    // fork: a wall plus three pads in the room, to the key side-room S1, to a dead end S2 and onward; S1 / S2 lie left of the start so the goal is never triggered in them
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
// fails the level when any liquid cell lacks a solid-or-liquid floor or side wall (checked after replay, so a leak means a redraw)
function checkContainment(L) {
  var bad = [], w = L.w, R = L.rows || ROWS, tiles = L.tiles, solid = PF.SOL;
  function at(c, r) { if (c < 0 || c >= w) return 1; if (r < 0) return 0; if (r >= R) return 1; return tiles[c * R + r]; }
  function ok(t) { return solid[t] === 1 || wetTile(t) || t === T.SPIKE || t === T.SLP || t === T.SLR || t === T.SLL; }   // (a sea-floor slope cell holds the water like the floor does)   // a spike stands on the floor inside the basin
  // every liquid cell needs a floor below and a wall (solid or liquid) on both sides; a failure here means the level is redrawn
  for (var c = 0; c < w; c++) for (var r = 0; r < R; r++) { var t = tiles[c * R + r]; if (!wetTile(t)) continue;
    if (!ok(at(c, r + 1))) bad.push(['floor', c, r]); else if (!ok(at(c - 1, r))) bad.push(['left', c, r]); else if (!ok(at(c + 1, r))) bad.push(['right', c, r]); }
  // heavy poison sinks: it never touches water sideways (a wall must stand between) and never lies above water
  function waterish(t) { return t === T.WATER || t === T.CURL || t === T.CURR || t === T.CURU || t === T.WLEVEL; }
  for (var c3 = 0; c3 < w; c3++) for (var r3 = 0; r3 < R; r3++) if (tiles[c3 * R + r3] === T.POISON) { if (waterish(at(c3 - 1, r3)) || waterish(at(c3 + 1, r3))) bad.push(['mix', c3, r3]); else if (waterish(at(c3, r3 + 1))) bad.push(['mixv', c3, r3]); }
  function wetAt(x, y) { return wetTile(at(Math.floor(x / TS), Math.floor(y / TS))); }
  // swimmers must stay inside liquid over their whole sweep (extremes of ax / ay)
  (L.enemies || []).forEach(function (e) {
    var xs = [], ys = [];
    if (e.t === E.SWIM || e.t === E.WHALE) { xs = [e.ax - e.rg, e.ax + e.rg, e.ax]; ys = [e.ay - (e.am || 3), e.ay + (e.am || 3)]; if (e.t === E.WHALE) { xs = [e.ax - e.rg + 4, e.ax + e.rg + e.w - 4]; } }
    else if (e.t === E.CHASER) { xs = [e.ax]; ys = [e.ay]; } else if (e.t === E.FMINE) { xs = [e.ax]; ys = [e.ay - e.am, e.ay + e.am]; } else if (e.t === E.JELLY) { xs = [e.ax - 14, e.ax + 14]; ys = [e.ay - 8, e.ay + 8]; } else return;
    xs.forEach(function (x) { ys.forEach(function (y) { if (!wetAt(x + e.w / 2, y + e.h / 2)) bad.push(['creature', Math.floor(x / TS), Math.floor(y / TS)]); }); });
  });
  // air pockets must sit inside water
  (L.pockets || []).forEach(function (p) { if (!wetAt(p.x, p.y)) bad.push(['pocket', Math.floor(p.x / TS), Math.floor(p.y / TS)]); });
  return { bad: bad.length, details: bad.slice(0, 6) };
}
// fish habits: the plain sweeper (to and fro on a sine) stays; 30% always swim one way and loop round ('dash'), 30% drift about at random ('wander')
function fishHabit(e, r, id) {
  var m = r(); if (m < 0.4) return e; e.id = id;
  if (m < 0.7) { e.mode = 'dash'; e.dd = r() < 0.5 ? 1 : -1; e.dsp = 0.5 + r() * 0.6; e.rg = Math.max(e.rg, 28); }
  else { e.mode = 'wander'; e.am = 10; e.rg = Math.max(e.rg, 26); e.ay += 8; e.y = e.ay; }
  return e;
}
// drop swimmers / pockets whose sweep leaves the liquid (same test as checkContainment, but it trims instead of failing the stage)
function pruneWet(L) {
  var w = L.w, R = L.rows || ROWS, tiles = L.tiles;
  function wetAt(x, y) { var c = Math.floor(x / TS), r = Math.floor(y / TS); if (c < 0 || c >= w || r < 0 || r >= R) return false; return wetTile(tiles[c * R + r]); }
  L.enemies = L.enemies.filter(function (e) {
    var xs = [], ys = [];
    if (e.t === E.SWIM || e.t === E.WHALE) { xs = [e.ax - e.rg, e.ax + e.rg, e.ax]; ys = [e.ay - (e.am || 3), e.ay + (e.am || 3)]; if (e.t === E.WHALE) xs = [e.ax - e.rg + 4, e.ax + e.rg + e.w - 4]; }
    else if (e.t === E.CHASER) { xs = [e.ax]; ys = [e.ay]; } else if (e.t === E.FMINE) { xs = [e.ax]; ys = [e.ay - e.am, e.ay + e.am]; } else if (e.t === E.JELLY) { xs = [e.ax - 14, e.ax + 14]; ys = [e.ay - 8, e.ay + 8]; } else return true;
    for (var i = 0; i < xs.length; i++) for (var j = 0; j < ys.length; j++) if (!wetAt(xs[i] + e.w / 2, ys[j] + e.h / 2)) return false;
    return true;
  });
  L.pockets = (L.pockets || []).filter(function (p) { return wetAt(p.x, p.y); });
}
// ------------------------------------------------------------------ labyrinths: a real grid maze of cells (tunnels with stair-shafts between floors), and an auto-scrolling maze of sky platforms
function buildGrid(seed, n, a, variant) {
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 21)), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, CW = 12, CH = 8;
  // grid of GW x GH cells of CW x CH tiles each, separated by 1-tile walls; X0 / FR give a cell's left column and floor row
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
  // draw 12 spanning trees and keep the one with the longest path, so start and goal are far apart
  for (var tt = 0; tt < 12; tt++) { tree(); var dm = diam(); if (!bestT || dm > bestT.dm) bestT = { dm: dm, adj: adj, edges: edges }; }   // the tree with the longest route
  adj = bestT.adj; edges = bestT.edges;
  // an extra loop or two (more than one route) on bigger mazes
  var extra = Math.round(GW * GH * (0.1 + 0.12 * diff));
  for (var xt = 0; extra > 0 && xt < 200; xt++) { var ei = rnd(0, GW - 2), ej = rnd(0, GH - 1), k1 = key(ei, ej), k2 = key(ei + 1, ej); if (adj[k1].indexOf(k2) < 0) { adj[k1].push(k2); adj[k2].push(k1); edges.push([ei, ej, ei + 1, ej]); extra--; } }
  var hasUp = {}, hasDown = {}, einfo = {};
  // carve every tree edge; hasUp / hasDown mark cells with a shaft, einfo remembers the ledge geometry for the route
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
  // decorate each cell: coins everywhere, hazards only in 'safe' cells (no shaft, not start or goal), ghosts in the ghost variant
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
  // route waypoints along the start-goal path: a shaft up adds one waypoint per stair ledge, a drop needs none
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
  var fly = air === 'fly', vd = air === 'void', sub = (air === 'cloud' || air === 'climb' || air === 'spin') ? air : ''; air = !!air;   // sub: the three new sky courses - 'cloud' (cloudway: timed stepping clouds, flat), 'climb' (skyclimb: zig-zag tower of lifts, rising wall), 'spin' (spinway: diagonal course of orbiting rings / pendulums / maces)
     // vd: the 'voidhop' variant - no fixed ground except the first and last platform; the hubs between the devices are small drifting blocks
  // fly: the 'flystep' variant - the gaps are crossed by stomping hovering flyers (each can be used once), validated with the enemies switched on
   // air: the 'aircourse' variant - no ordinary platforms at all, every gap is crossed on a moving block / ring / lift

  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 31)), lim = probe(), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, rows = 26, W = 96 + Math.round(diff * 30), tiles;
  // aircourse scroll variants: vr 0 = horizontal (chasing wall from the left), 1 = diagonal (up-right), 2 = vertical zig-zag tower; the last two have a rising death wall below
  var h6 = hash(seed, n, 6151), vr = (air && !fly && n > 4) ? ((h6 % 100) < Math.max(10, 50 - n) ? 0 : 1 + ((h6 >> 8) % 2)) : 0, dxs = 1;   // the horizontal air course becomes rarer with the level
  if (sub === 'climb') vr = 2; else if (sub === 'spin') vr = 1; else if (sub === 'cloud') vr = 0;
  if (vr === 1) { rows = 46 + rnd(0, 6); W = 104 + Math.round(diff * 24); } else if (vr === 2) { rows = 60 + rnd(0, 12); W = 52; }
  tiles = new Uint8Array(W * rows);
  var put = function (c, rr, t) { if (c >= 0 && c < W && rr >= 0 && rr < rows) tiles[c * rows + rr] = t; };
  var maxUp = Math.max(1, Math.min(3, lim.up - 1)), maxGap = Math.max(2, Math.min(5, lim.gapRun - 2)), coins = [], enemies = [], plats = [], specials = [];
  function plat(c, len, rw) { for (var q = 0; q < len; q++) { put(c + q, rw, T.SOLID); if (q === 0 || q === len - 1) put(c + q, rw + 1, T.SOLID); } var p = { c: c, len: len, row: rw }; plats.push(p); for (var q2 = 0; q2 < Math.min(3, len - 1); q2++) coins.push({ x: (c + 1 + q2) * TS + 8, y: (rw - 1.5) * TS, b: 0 }); return p; }
  // void hop: a hub is a small block that sways a few pixels (no tiles at all), so the hero never stands on fixed ground between the start and the goal platform
  var hubN = 0, hasFly = false;
  function hub(c, len, rw) { var p = { c: c, len: len, row: rw, hub: true }; plats.push(p); movers.push({ kind: 0, cx: (c + len / 2) * TS, y: rw * TS, w: len * TS, amp: 8, per: 300 + 60 * (hubN++ % 3), ph: r() * 6 }); for (var q2 = 0; q2 < Math.min(3, len - 1); q2++) coins.push({ x: (c + 1 + q2) * TS + 8, y: (rw - 1.5) * TS, b: 0 }); return p; }
  // main chain of platforms; forks branch off it as dead ends or decoys
  var main =plat(vr === 2 ? Math.floor(W / 2) - 4 : 2, 8, vr ? rows - 7 : 15), cur = main, forkN = 0, chain = [];
  function nextFrom(p, dir) {   // a platform reachable from p
    var len = rnd(4, 7), dy = dir === 'up' ? -rnd(1, maxUp) : dir === 'down' ? rnd(2, 6) : rnd(-maxUp, 2), rw = Math.max(6, Math.min(21, p.row + dy));
    var gap = rnd(1, maxGap - (dy < -1 ? 1 : 0)); return { c: p.c + p.len + gap, len: len, row: rw };
  }
  var movers = [], maces = [], fancy = a >= 3 ? 0 : (a >= 2 ? 0.12 : 0.3 + 0.3 * diff), sinceSp = 9;
  function addMover(m) { movers.push(m); return movers.length - 1; }
  // a connector between platform cu and the next one: returns the next platform's placement, or null for an ordinary gap
  function connector(cu, kindSel) {
    var cE = (cu.c + cu.len) * TS, y0 = cu.row * TS, G, nx2, ids, eX = dxs > 0 ? cE : cu.c * TS, ncl = function (len, g) { return dxs > 0 ? cu.c + cu.len + g : cu.c - g - len; };   // dxs: -1 builds the next platform to the left (vertical variant)
    // each case builds one gap-crossing device (moving or switch-driven blocks, rings, bouncers, sinking blocks, seesaw, ice, belts) and returns the next platform
    switch (kindSel) {
      case 'fly': { hasFly = true; var kf =rnd(1, 2 + (diff > 0.5 ? 1 : 0)); G = 4 * kf + 3 + (kf > 1 ? 0 : 1); nx2 = { c: cu.c + cu.len + G, len: rnd(3, 5), row: Math.max(7, Math.min(vr ? rows - 6 : 20, cu.row + rnd(-1, 1))) }; for (var qf = 1; qf <= kf; qf++) { var fx = cE + G * TS * qf / (kf + 1), fy = (cu.row + (nx2.row - cu.row) * qf / (kf + 1)) * TS + 2 + rnd(0, 1) * TS; enemies.push({ t: E.FLYER, x: fx, y: fy, w: 14, h: 10, ax: fx, ay: fy, rg: rnd(14, 26), sp: 1 / 320, ph: r(), am: 0, spd: 0 }); } break; }
      case 'h': { G = rnd(8, 11); nx2 = { c: cu.c + cu.len + G, len: rnd(3, 5), row: cu.row + rnd(-1, 1) }; var amH = G * TS / 2 - 22; addMover({ kind: 0, cx: cE + G * TS / 2, y: y0, w: 40, amp: amH, per: [360, 480, 720][rnd(0, 2)], ph: 0 }); break; }
      case 'v': { var dhv = rnd(4, 6), up = r() < 0.65 || vr > 0, lnv = rnd(3, 5); G = 3; nx2 = { c: ncl(lnv, G), len: lnv, row: cu.row + (up ? -dhv : dhv) }; addMover({ kind: 1, cx: eX + dxs * 1.5 * TS, y: y0 + (up ? -dhv : dhv) * TS / 2, w: 40, amp: dhv * TS / 2, per: [480, 720][rnd(0, 1)], ph: 0 }); break; }
      case 'ctrl': G = rnd(7, 10); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row + rnd(-1, 0) }; var nS = nx2.c * TS, am = (nS - cE) / 2 - 22; addMover({ kind: 5, cx: (cE + nS) / 2, y: y0, w: 40, amp: am, ox0: -am, per: 1, ph: 0 }); break;
      case 'ctrlv': { var dh = rnd(5, 8), lnc = rnd(4, 6); G = 3; nx2 = { c: ncl(lnc, G), len: lnc, row: cu.row - dh }; addMover({ kind: 6, cx: eX + dxs * 1.5 * TS, y: y0 - dh * TS / 2, w: 40, amp: dh * TS / 2, per: 1, ph: 0, off0: dh * TS / 2 }); break; }
      case 'ring': G = rnd(9, 11); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; var R = G * TS / 2 - 18; for (var q = 0; q < 4; q++) addMover({ kind: 2, cx: cE + G * TS / 2, y: y0, w: 32, amp: R, per: 480, ph: q * Math.PI / 2 }); break;
      case 'bounce': G = rnd(10, 13); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; for (var q2 = 1; q2 <= 2; q2++) addMover({ kind: 8, cx: cE + G * TS * q2 / 3, y: y0 + 2 * TS, w: 30, amp: 0, per: 1, ph: 0 }); break;
      case 'sink': G = rnd(9, 11); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; var ns = 3; for (var q3 = 1; q3 <= ns; q3++) addMover({ kind: 9, cx: cE + G * TS * q3 / (ns + 1), y: y0, w: 28, amp: 46, per: 1, ph: 0 }); break;
      case 'rise': { var dh2 = rnd(5, 7), lnr = rnd(4, 6); G = 3; nx2 = { c: ncl(lnr, G), len: lnr, row: cu.row - dh2 }; addMover({ kind: 10, cx: eX + dxs * 1.2 * TS, y: y0, w: 34, amp: dh2 * TS, per: 1, ph: 0 }); break; }
      case 'seesaw': G = 8; nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; var iA = addMover({ kind: 12, cx: cE + 1 + 18, y: y0, w: 36, amp: 28, per: 1, ph: 0 }), iB = addMover({ kind: 12, cx: (cu.c + cu.len + G) * TS - 1 - 18, y: y0, w: 36, amp: 28, per: 1, ph: 0 }); movers[iA].pair = iB; movers[iB].pair = iA; break;
      case 'ice': G = rnd(9, 11); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; for (var q5 = 1; q5 <= 2; q5++) addMover({ kind: 14, cx: cE + G * TS * q5 / 3, y: y0, w: 48, amp: 0, per: 1, ph: 0 }); break;
      case 'belt': { var up2 = r() < 0.7, dh3 = rnd(6, 9), lnb = rnd(4, 6); if (vr) up2 = true; G = 4; nx2 = { c: ncl(lnb, G), len: lnb, row: Math.max(5, Math.min(rows - 5, cu.row + (up2 ? -dh3 : dh3))) }; var span = rows * TS + 64; for (var q4 = 0; q4 < 2; q4++) addMover({ kind: 13, cx: eX + dxs * 2 * TS, y: y0 + 32 + q4 * span / 2, y0: -32, w: 32, amp: 0, per: 1, ph: 0, sp: 0.7, dir: up2 ? -1 : 1, span: span }); break; }
      case 'blink': { G = rnd(9, 11); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; var nbk = 3, bper = 240; for (var qb = 1; qb <= nbk; qb++) addMover({ kind: 4, cx: cE + G * TS * qb / (nbk + 1), y: y0, w: 32, amp: 0, per: bper, ph: (qb - 1) * 6.283185 * 0.22 }); break; }   // blinking stepping stones, each solid for 62% of a cycle and offset so they overlap in a row
      case 'slide': { G = rnd(9, 12); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row + rnd(-1, 0) }; var amS = G * TS / 2 - 20; addMover({ kind: 15, cx: cE + G * TS / 2, y: y0, w: 40, amp: amS, per: [420, 540][rnd(0, 1)], ph: 0 }); break; }   // stone slider: rests a moment at both ends
      case 'pend': { G = rnd(8, 10); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; var lenP = Math.round(G * TS / 2 / Math.sin(1.0)) - 8; addMover({ kind: 17, cx: cE + G * TS / 2, y: y0, w: 36, amp: 0, per: 420, ph: 0, len: lenP, swing: 1.0 }); break; }   // pendulum plank swinging from a pivot high above
      case 'orbit2': { G = rnd(9, 11); nx2 = { c: cu.c + cu.len + G, len: rnd(4, 6), row: cu.row }; var R2 = G * TS / 2 - 18; for (var q6 = 0; q6 < 3; q6++) addMover({ kind: 2, cx: cE + G * TS / 2, y: y0, w: 32, amp: R2, per: 420, ph: q6 * 2 * Math.PI / 3 }); break; }   // ring of three orbiting blocks
      case 'plain': { var lnp = rnd(4, 6), dyp = -rnd(1, maxUp), gp = rnd(1, maxGap - (dyp < -1 ? 1 : 0)); nx2 = { c: ncl(lnp, gp), len: lnp, row: cu.row + dyp }; break; }   // short ordinary hop (vertical variants)
    }
    return nx2;
  }
  // pool of special connector kinds for this variant (the air course uses only these)
  var SPV = ['v', 'rise', 'plain', 'v', 'rise', 'v'], SPD = ['h', 'ring', 'ctrl', 'sink', 'seesaw', 'plain', 'h', 'ice'];   // vr 1/2 pools: vertical-capable connectors (no ctrlv / belt: the validator cannot solve the UP-steered lift or the conveyor timing) / flat ones
  var SP = vd ? ['h', 'ring', 'orbit2', 'sink', 'seesaw', 'ctrl', 'bounce', 'fly', 'blink', 'slide', 'pend', 'rise', 'v', 'fly', 'plain', 'orbit2'] : (air && root.PF.AIR_SP && !vr) ? root.PF.AIR_SP : fly ? ['fly'] : air ? ['h', 'h', 'h', 'v', 'ring', 'sink', 'seesaw', 'ctrl', 'rise', 'ice', 'bounce', 'sink'] : ['ctrl', 'ring', 'bounce', 'sink', 'seesaw', 'rise', 'ctrlv', 'belt', 'ice'];
  if (sub === 'cloud') SP = ['blink', 'slide', 'pend', 'seesaw', 'blink', 'slide', 'sink', 'ice', 'blink', 'h'];
  else if (sub === 'climb') { SPV = ['rise', 'v', 'rise', 'v', 'plain', 'rise', 'v']; }
  else if (sub === 'spin') { SPD = ['ring', 'orbit2', 'pend', 'orbit2', 'ring', 'slide', 'pend', 'h']; SPV = ['rise', 'v', 'v', 'rise']; }
  if (vd) SPD = SPD.concat(['fly', 'fly', 'orbit2', 'orbit2', 'blink', 'slide', 'pend']);   // flat devices of the diagonal void course: flyer stomps and more orbiting rings
  // grow the chain: a special connector if allowed, else a plain platform at an up / down / flat offset, sometimes with a side fork
  while (vr === 2 ? cur.row > 13 : cur.c + cur.len < W - 14 && (!vr || cur.row > 13)) {
    var np, sp0 = null;
    if (air || (sinceSp >= 2 && r() < fancy)) {
      if (vr === 2) { var ctr = cur.c + cur.len / 2; dxs = r() < (W - ctr) / W ? 1 : -1; if (cur.c + cur.len + 12 > W) dxs = -1; else if (cur.c - 12 < 0) dxs = 1; }   // zig-zag: drift back towards the middle
      if (vr) { var fy = (main.row - cur.row) / (main.row - 10), fxx = cur.c / (W - 26); sp0 = (vr === 2 || fy < fxx - 0.05) ? SPV[rnd(0, SPV.length - 1)] : SPD.concat(SPV)[rnd(0, SPD.length + SPV.length - 1)]; } else sp0 = SP[rnd(0, SP.length - 1)];
      var nx3 = connector(cur, sp0); nx3.row = Math.max(5, Math.min(rows - 5, nx3.row)); if (nx3.c + nx3.len > W - 12 + (vr === 2 ? 9 : 0) || nx3.c < (vr === 2 ? 2 : -99)) { movers = movers.slice(0, mvKeep(movers)); break; } np = vd ? hub(nx3.c, nx3.len, nx3.row) : plat(nx3.c, nx3.len, nx3.row); sinceSp = 0; }
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
  // goal platform after the chain
  var goalP;
  if (vr === 2) { dxs = cur.c + cur.len + 3 + 8 > W - 2 ? -1 : cur.c - 11 < 2 ? 1 : (r() < 0.5 ? 1 : -1); goalP = plat(dxs > 0 ? cur.c + cur.len + 3 : cur.c - 11, 8, Math.max(5, cur.row)); }
  else goalP = plat(cur.c + cur.len + 3, 12, vr ? Math.max(5, cur.row) : Math.max(8, Math.min(18, cur.row)));
  // rotating maces / fire bars over some platforms and in some gaps
  if (!fly) plats.forEach(function (p, k) { if (k > 1 && !p.pad && (!vd || r() < 0.5) && p.len >= 6 && r() < 0.15 + 0.35 * diff) { var kk = r(); if (kk < 0.5) maces.push({ cx: (p.c + p.len / 2) * TS, cy: p.row * TS - 62, len: 54, n: 1, swing: 1.0, per: 220 + rnd(0, 80), ph: r() * 6, w: 0 }); else if (kk < 0.8) maces.push({ cx: (p.c + p.len / 2) * TS, cy: p.row * TS - 30, len: 46, n: 5, per: 300 + rnd(0, 120), ph: r() * 6, dir: r() < 0.5 ? 1 : -1 }); else maces.push({ cx: (p.c + p.len / 2) * TS, cy: p.row * TS - 40, len: 36, n: 1, per: 200, ph: r() * 6, dir: r() < 0.5 ? 1 : -1 }); } });
  // bridge from the last platform if the final step is too far
  var bridgeRow = Math.max(goalP.row, cur.row);
  if (!fly && !vd) plats.forEach(function (p, k) { if (k > 2 && p.len >= 5 && r() < 0.15 + 0.4 * diff) enemies.push({ t: E.FLYER, x: (p.c + p.len / 2) * TS, y: (p.row - 4) * TS, w: 14, h: 10, ax: (p.c + p.len / 2) * TS, ay: (p.row - 4) * TS, rg: 28, sp: 1 / (220 + r() * 100), ph: r(), am: 8, spd: 0 }); else if (k > 2 && p.len >= 6 && r() < 0.3 + 0.3 * diff) enemies.push({ t: E.WALKER, x: (p.c + 1) * TS, y: p.row * TS - 12, w: 12, h: 12, spd: 0.4, dir: 1, mn: (p.c + 0.5) * TS, mx: (p.c + p.len - 0.5) * TS }); });
  while (specials.length < 5) { var pp = plats[Math.floor(r() * plats.length)]; specials.push({ x: (pp.c + 2) * TS, y: (pp.row - 3) * TS }); }
  var gx = (goalP.c + 6) * TS, gy = goalP.row * TS, start = { x: (main.c + 2) * TS + 2, y: main.row * TS - P.SH }, mp = plats[Math.floor(plats.length / 2)];
  var KN = sub ? { cloud: 'cloudway', climb: 'skyclimb', spin: 'spinway' }[sub] : fly ? 'flystep' : vd ? 'voidhop' : air ? 'aircourse' : 'skymaze';
  var gtv = []; for (var c = 0; c < W; c++) gtv.push(rows - 1);
  var L = { seed: seed, n: n, kind: KN, attempt: a, stepEn: fly || (vd && hasFly), diff: diff, w: W, rows: rows, tiles: tiles, gt: gtv, coins: coins, special: specials, enemies: enemies, movers: movers, maces: maces, cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * rows),
    route: (air ? chain : []).map(function (p) { return { k: 'at', x: (p.c + p.len / 2) * TS, y: p.row * TS - 7 }; }).concat([{ k: 'goal', x: gx, y: gy - 10 }]), puzzle: true, vertical: true, goalRect: { x: gx - 8, y: gy - 4 * TS, w: 16, h: 4 * TS }, goalX: gx, poleCol: Math.floor(gx / TS), poleY: gy,
    start: start, cp: { x: (mp.c + 1) * TS, y: mp.row * TS - P.SH }, time: 220 + Math.floor(W * 0.8), theme: 1, room: false, hasBoss: false, kindAsked: KN, hasFire: false, hasIce: false, hasMud: false };
  // the death wall chases from the left; slower on easy stages
  if (vr) { L.rise = { y0: rows * TS + 40, v: 0.2, delay: 240 }; L.time = 400 + rows * 4; } else   // vertical / diagonal courses: the death wall rises from below (generate() retunes its speed)
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
  // a wide poison lake crossed by moving platforms over 2-3 sections between stone islands; poison fish leap out of some sections
  poisonlake: function (sg, r, rnd, g, put, coins3) {
    var secs = rnd(2, 3), c = 4, k;
    sg.movers = sg.movers || [];
    for (k = 0; k < secs; k++) {
      var sw = rnd(7, 9), q, rr;
      for (q = 0; q < sw; q++) for (rr = g; rr < ROWS - 1; rr++) put(c + q, rr, T.POISON);
      sg.movers.push({ kind: 0, cx: (c + sw / 2) * TS, y: g * TS, w: 40, amp: sw * TS / 2 - 22, per: [360, 480, 600][rnd(0, 2)], ph: k * 1.7 });
      if (r() < 0.65) { var fx = (c + sw / 2 + rnd(-1, 1)) * TS + 1, per = rnd(120, 170); sg.enemies.push({ t: E.LEAPFISH, poison: 1, x: fx, y: g * TS, w: 14, h: 9, ax: fx, by: g * TS, per: per, pho: rnd(0, per), hgt: rnd(34, 56), up: 1, hid: true, spd: 0 }); }
      c += sw + 2;
    }
    sg.w = c + 4; coins3(3, 2);
  },
  // a tank of clean water lying on a layer of poison: climb onto the wall, drop in, swim across near the surface (sinking means poison), climb out on the far wall
  wetpoison: function (sg, r, rnd, g, put, coins3) {
    var bw = rnd(10, 13), c0 = 6, q, rr; sg.w = c0 + bw + 8;
    for (q = 0; q < bw; q++) { put(c0 + q, g - 1, T.WATER); put(c0 + q, g, T.WATER); put(c0 + q, g + 1, T.POISON); }
    for (rr = g - 2; rr <= g - 1; rr++) { put(c0 - 1, rr, T.SOLID); put(c0 + bw, rr, T.SOLID); }
    var fx = (c0 + bw / 2) * TS; sg.enemies.push({ t: E.SWIM, sz: 0, dip: 1, x: fx, y: (g + 0.2) * TS, w: 12, h: 8, ax: fx, ay: (g + 0.2) * TS, rg: bw * TS / 2 - 22, sp: 1 / 220, ph: r(), am: 14, spd: 0 });   // a fish that dips between the water and the poison
    if (r() < 0.6) { var jx0 = (c0 + 2 + rnd(0, bw - 7)) * TS; sg.winds = sg.winds || []; sg.winds.push({ x0: jx0, x1: jx0 + 3 * TS, y0: (g - 1) * TS, y1: (g + 1) * TS, dx: 0, dy: 0.13, per: 240, on: 120, ph: rnd(0, 239), bub: 1, vx: jx0 + 1.5 * TS, vy: (g - 1) * TS }); }   // bubbles pushing the swimmer down toward the poison
    sg.items = sg.items || []; sg.items.push({ k: 0, x: (c0 - 4) * TS + 2, y: g * TS - 12 });   // (a spare mushroom in front of the tank: a block over dry floor can hold it)
    sg.coins.push({ x: (c0 + 3) * TS + 8, y: (g - 0.4) * TS, b: 0 }, { x: (c0 + bw - 4) * TS + 8, y: (g - 0.4) * TS, b: 0 });
  },
  // a pool of water one tile deep lying flush with the floor on a layer of poison: a normal hero sinks into the poison; a shrunk one walks on the surface. The shrink item lies in front of it.
  miniwater: function (sg, r, rnd, g, put, coins3) {
    var pw = rnd(14, 17), c0 = 7, q; sg.w = c0 + pw + 8;
    for (q = 0; q < pw; q++) { put(c0 + q, g, T.WATER); put(c0 + q, g + 1, T.POISON); }
    sg.items.push({ k: 6, x: 3 * TS + 2, y: g * TS - 12 }); sg.route.push({ k: 'pw', v: 'mini', x: 3 * TS + 8, y: g * TS - 7 });
    sg.coins.push({ x: (c0 + 3) * TS + 8, y: (g - 0.9) * TS, b: 0 }, { x: (c0 + pw - 3) * TS + 8, y: (g - 0.9) * TS, b: 0 });
  },
  bricks: function (sg, r, rnd, g, put, coins3) { sg.w = rnd(14, 18); for (var c = 5; c < sg.w - 5; c++) put(c, g - 4, c % 3 === 0 ? T.QC : T.BRICK); coins3(4, 3); }
};
var TRANSIT_NAMES = Object.keys(TRANSIT).filter(function (k) { return k !== 'miniwater'; });   // miniwater is a gate of the 'tiny' kind, never a random stretch
// plausibility: every template has a climate; one climate per stage (lava only in a hot stage, ice only in a cold one, no poison / water next to a volcano), the theme is then picked from the matching looks
var SEG_TAG = { lavahop: 'hot', ice: 'cold', poisonhop: 'wet', poison: 'wet', poisonlake: 'wet', wetpoison: 'wet', miniwater: 'wet', freeze: 'cold', icelift: 'cold' };
var CLIMATE_THEMES = { hot: [2, 4, 5, 9, 14, 15, 16, 17, 19, 24], cold: [1, 5, 8, 11, 13, 18, 22, 25], mild: [0, 1, 3, 6, 7, 10, 11, 12, 13, 23, 26] };
function climateOK(tag, climate) { if (tag === 'hot') return climate === 'hot'; if (tag === 'cold') return climate === 'cold'; if (tag === 'wet') return climate !== 'hot'; return true; }
// one gated segment: builds its obstacle plus everything needed to pass it (pickup, switch, key) in a local frame so it can be validated alone
function gateSeg(type, r, rnd, g) {
  var sg = { type: type, w: 0, tiles: [], enemies: [], items: [], coins: [], route: [] }, put = function (c, rr, t) { sg.tiles.push([c, rr, t]); };
  var IY = g * TS - 12, bx = 0, c, rr;
  function coins3(c0, k) { for (var q = 0; q < k; q++) sg.coins.push({ x: (c0 + q * 2) * TS + 8, y: (g - 1.6) * TS, b: 0 }); }
  // ordinary stretches come from the TRANSIT library; the branches below build the gated segments
  if (TRANSIT[type]) {
    TRANSIT[type](sg, r, rnd, g, put, coins3);
    sg.route.push({ k: 'xge', x: (sg.w - 2) * TS });
  } else if (type === 'big') {   // a lid of bricks over the corridor leads up to the only way on; the wall blocks the floor. Only a big hero breaks the lid.
    sg.w = 27; var lid = rnd(11, 13), wall = lid + rnd(3, 4);
    for (c = 3; c <= wall + 3; c++) { put(c, g - 4, T.SOLID); for (rr = 0; rr <= g - 9; rr++) put(c, rr, T.SOLID); }
    put(lid, g - 4, T.BRICK); put(lid + 1, g - 4, T.BRICK);
    for (rr = g - 3; rr <= g - 1; rr++) put(wall, rr, T.SOLID);
    sg.items.push({ k: 0, x: 1 * TS + 2, y: IY }); coins3(7, 2);   // (the mushroom stands in front of the lid corridor: the ceiling there leaves no room for a block, and one that rolled onto the roof would be lost)
    sg.route.push({ k: 'pw', v: 'big', x: 1 * TS + 8, y: g * TS - 7 }, { k: 'xge', x: (wall + 6) * TS });
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
  if (type === 'freeze') {   // a pit too wide to jump with two spiked flyers hovering over it: eat the snow flower, freeze the first flyer, step on the ice, freeze the second from there, cross
    var fc0 = 10, fgw = rnd(11, 13), fyy = g * TS - 12, f1 = fc0 * TS + 44, f2 = f1 + 46 + (fgw - 11) * 3;
    sg.w = fc0 + fgw + 8;
    for (c = fc0; c < fc0 + fgw; c++) for (rr = g; rr < ROWS; rr++) put(c, rr, 0);
    [f1, f2].forEach(function (fc) { sg.enemies.push({ t: E.FLYER, spk: 1, x: fc - 7, y: fyy, w: 14, h: 10, ax: fc - 7, ay: fyy, rg: 0, sp: 1 / 320, ph: 0, am: 0, spd: 0 }); sg.coins.push({ x: fc, y: fyy - 30, b: 0 }); });
    sg.items.push({ k: 11, x: 2 * TS + 2, y: IY }, { k: 11, x: 4 * TS + 2, y: IY });   // a spare flower in case the first one is lost
    sg.route.push({ k: 'pw', v: 'snow', x: 2 * TS + 8, y: g * TS - 7 }, { k: 'perch', x: f1, y: fyy - 17 }, { k: 'perch', x: f2, y: fyy - 17 }   /* perch: standing at rest on the frozen flyer */, { k: 'xge', x: (fc0 + fgw + 2) * TS });
  }
  if (type === 'icelift') {   // a tank of water with strong DOWNWARD bubble jets between two high ledges, too wide to jump: nobody can swim up out of it. Eat the snow flower on the bottom, freeze the fish
    // that swims over the floor, step onto the ice block (it floats up, carrying the hero through the jets) and step out on the far ledge.
    var lc0 = 8, lW = 11, lTop = g - 4, lfx = (lc0 + lW - 5) * TS;
    sg.w = lc0 + lW + 3 + 4;
    for (c = 3; c <= lc0 - 1; c++) for (rr = (c < 5 ? g - 2 : lTop); rr < g; rr++) put(c, rr, T.SOLID);   // stairs up to the left ledge
    for (c = lc0; c < lc0 + lW; c++) for (rr = lTop; rr < g; rr++) put(c, rr, T.WATER);
    for (c = lc0 + lW; c < lc0 + lW + 3; c++) for (rr = lTop; rr < g; rr++) put(c, rr, T.SOLID);   // the far ledge
    sg.winds = [{ x0: lc0 * TS, x1: (lc0 + lW) * TS, y0: lTop * TS, y1: g * TS, dx: 0, dy: 0.7, bub: 1, vx: (lc0 + lW / 2) * TS, vy: g * TS }];
    sg.enemies.push({ t: E.SWIM, sz: 0, x: lfx, y: g * TS - 9, w: 14, h: 9, ax: lfx, ay: g * TS - 9, rg: 20, sp: 1 / 300, ph: 0.1, am: 0, spd: 0 });
    sg.items.push({ k: 11, x: (lc0 - 2) * TS + 2, y: lTop * TS - 12 });   // (the flower lies on the left ledge: a block over dry floor can hold it; the hero swims down with it)
    sg.coins.push({ x: (lc0 + 3) * TS, y: (g - 2) * TS, b: 0 });
    sg.route.push({ k: 'pw', v: 'snow', x: (lc0 - 2) * TS + 8, y: lTop * TS - 7 }, { k: 'frozen', x: lfx + 7, y: g * TS - 17 }, { k: 'band', x: lfx - 24, x2: lfx + 40, y: lTop * TS - 17 }, { k: 'xge', x: (lc0 + lW + 1) * TS });
  }
  if (type === 'forge') {   // STRATEGY: a brick lid leads up into a vault holding a fire flower and a shrink item (only ONE power can be carried). Then come a cracked wall (needs fire) and a mouse hole (needs mini).
    // The flower has to be taken FIRST (shoot the wall), then back up the stairs for the shrink item - the other order is a dead end.
    sg.w = 44; var U = g - 4, lidC = 8;
    for (c = 3; c <= 24; c++) for (rr = 0; rr <= g - 11; rr++) put(c, rr, T.SOLID);   // (a tall vault: the flower / shrink blocks inside need room above and a big hero must be able to stand on top of one)
    for (c = 3; c <= 20; c++) put(c, U, T.SOLID);
    put(lidC, U, T.BRICK); put(lidC + 1, U, T.BRICK);
    for (c = 14; c <= 20; c++) for (rr = g - 3; rr <= g - 1; rr++) put(c, rr, T.SOLID);
    for (c = 21; c <= 23; c++) for (rr = g - (24 - c); rr <= g - 1; rr++) put(c, rr, T.SOLID);
    for (rr = 0; rr <= g - 1; rr++) put(30, rr, T.CRACK);
    for (rr = 0; rr <= g - 2; rr++) put(37, rr, T.SOLID); put(37, g - 1, T.NARROW);
    sg.items.push({ k: 0, x: 1 * TS + 2, y: IY }, { k: 1, x: 12 * TS + 2, y: U * TS - 12 }, { k: 6, x: 17 * TS + 2, y: U * TS - 12 }); coins3(26, 2);
    sg.route.push({ k: 'pw', v: 'big', x: 1 * TS + 8, y: g * TS - 7 }, { k: 'tile', c: lidC, r: U, x: lidC * TS + 8 }, { k: 'pw', v: 'fire', x: 12 * TS + 8, y: U * TS - 7 }, { k: 'tile', c: 30, r: g - 1, x: 28 * TS, x2: 30 * TS }, { k: 'pw', v: 'mini', x: 17 * TS + 8, y: U * TS - 7 }, { k: 'xge', x: 41 * TS });
  }
  if (type === 'swap') {   // STRATEGY: only a big hero breaks the lid, the shrink item lies in the vault above it, and the mouse hole is the way on - the big power has to be traded in for the small one
    sg.w = 34; var U2 = g - 4, lid2 = rnd(8, 9);
    for (c = 3; c <= 20; c++) for (rr = 0; rr <= g - 9; rr++) put(c, rr, T.SOLID);
    for (c = 3; c <= 18; c++) put(c, U2, T.SOLID);
    put(lid2, U2, T.BRICK); put(lid2 + 1, U2, T.BRICK);
    for (c = 13; c <= 18; c++) for (rr = g - 3; rr <= g - 1; rr++) put(c, rr, T.SOLID);
    for (c = 19; c <= 21; c++) for (rr = g - (22 - c); rr <= g - 1; rr++) put(c, rr, T.SOLID);
    for (rr = 0; rr <= g - 2; rr++) put(27, rr, T.SOLID); put(27, g - 1, T.NARROW);
    sg.items.push({ k: 0, x: 1 * TS + 2, y: IY }, { k: 6, x: 15 * TS + 2, y: U2 * TS - 12 }); coins3(23, 2);
    sg.route.push({ k: 'pw', v: 'big', x: 1 * TS + 8, y: g * TS - 7 }, { k: 'tile', c: lid2, r: U2, x: lid2 * TS + 8 }, { k: 'pw', v: 'mini', x: 15 * TS + 8, y: U2 * TS - 7 }, { k: 'xge', x: 31 * TS });
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
  // the last crossing stage must cover the segment up to its right end (x2)
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
  return { seed: 1, n: 1, kind: 'gates', diff: 0, w: W, tiles: tiles, gt: gt, coins: [], special: [], enemies: en, movers: (sg.movers || []).map(function (m) { var o2 = {}; for (var k in m) o2[k] = m[k]; o2.cx += PADL * TS; return o2; }), cannons: [], rings: [], winds: sg.type === 'icelift' ? sg.winds.map(function (w) { var o2 = {}; for (var k in w) o2[k] = w[k]; o2.x0 += PADL * TS; o2.x1 += PADL * TS; o2.vx += PADL * TS; return o2; }) : [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * ROWS),
    items: sg.items.map(function (i) { return { k: i.k, x: i.x + PADL * TS, y: i.y }; }), stepEn: en.some(function (e) { return e.t === E.BEETLE || e.t === E.FLYER || sg.type === 'icelift'; }), entry: entry || '', pound: sg.type === 'pound', snow: sg.type === 'freeze' || sg.type === 'icelift', duck: true, reqEn: sg.type === 'icelift' ? [E.BEETLE, E.FLYER, E.SWIM] : [E.BEETLE, E.FLYER],
    route: route, puzzle: true, goalX: pole * TS + 6, poleCol: pole, poleY: g * TS, start: { x: 2 * TS + 2, y: g * TS - 14 }, cp: { x: 99999, y: 0 }, time: 300, theme: 0, room: false, hasBoss: false, kindAsked: 'gates', hasFire: false, hasIce: false, hasMud: false };
}
var SEG_OK = {};   // memo of validated stand-alone segments (the wet / frost ones are slow to prove)
function buildGates(seed, n, a, variant) {
  var toxic = variant === 'toxic', frost = variant === 'frost', tiny = variant === 'tiny';   // the poison marsh: wide poison, leaping fish, moving platforms, power-ups to wade through short stretches, and tanks of water lying on poison
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 71)), diff = Math.min(1, (nn - 1) / 18), g = 11;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  // G gated segments, kinds drawn from a shuffled pool without repeats
  var G = 2 + Math.floor(diff * 2.4), pool = ['big', 'mini', 'shell', 'fire', 'pound', 'poison', 'forge', 'swap'], i, kinds = [];
  for (i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  for (i = 0; i < G; i++) kinds.push(pool[i % pool.length]);
  // one climate per stage (mild / hot / cold) filters which segment kinds and themes fit together
  var climate = (toxic || tiny) ? 'mild' : frost ? 'cold' : (function () { var x = r(); return x < 0.5 ? 'mild' : x < 0.75 ? 'hot' : 'cold'; })(), segs = [], tries = 0;
  if (toxic) { G += 1; pool = ['poison', 'poison', 'big', 'poison', 'fire']; }
  if (frost) { G += 1; pool = ['freeze', 'icelift', 'freeze', 'big', 'icelift', 'freeze', 'fire']; }   // the frost gates: mostly frozen-flyer crossings
  if (tiny) { G += 1; pool = ['mini', 'miniwater', 'mini', 'miniwater', 'miniwater']; }   // the tiny realm: mouse holes and pools that only a shrunk hero passes
  if (climate === 'cold' && !frost) pool.unshift('freeze');   // ordinary cold gates stages may include a frozen-flyer crossing
  pool = pool.filter(function (k) { return climateOK(SEG_TAG[k], climate); }); kinds = []; for (i = 0; i < G; i++) kinds.push(pool[i % pool.length]);
  function seg(type, idx) {   // generate + validate one segment alone; a few redraws, then the always-valid plain run
    for (var t2 = 0; t2 < 8; t2++) {
      var rr2 = rng(hash(seed, n, a * 131 + idx * 17 + t2 * 3 + 5)), sg = gateSeg(type, rr2, function (lo, hi) { return lo + Math.floor(rr2() * (hi - lo + 1)); }, g);
      tries++; var allOk = true, memoKey = (type === 'icelift' || type === 'freeze' || type === 'miniwater') ? type + JSON.stringify([sg.w, sg.tiles.length, sg.enemies, sg.items, sg.route]) : null;
      if (memoKey && SEG_OK[memoKey] !== undefined) { if (SEG_OK[memoKey]) return sg; continue; }   // the same segment was already proven (or refuted) alone   // the segment has to work whatever the hero brings in: small, mini, big or with fire
      (type === 'shell' ? ['', 'big', 'fire'] : type === 'icelift' ? ['', 'snow'] : type === 'freeze' ? ['', 'mini', 'big', 'fire', 'snow'] : ['', 'mini', 'big', 'fire']).forEach(function (en0) { if (allOk && !validate(segLevel(sg, g, en0), 5000).ok) allOk = false; });   // (a mini hero gets the mushroom at the shell segment's entrance: slow to prove, so not checked)
      if (memoKey) SEG_OK[memoKey] = allOk;
      if (allOk) return sg;
    }
    return gateSeg('run', r, rnd, g);
  }
  segs.push(gateSeg('run', r, rnd, g)); segs[0].w = 10; segs[0].tiles = []; segs[0].coins = []; segs[0].route = [];
  var lastT = 'run', sidx = 100;
  var TOXIC_T = ['poisonhop', 'poisonlake', 'wetpoison', 'poisonlake', 'mover', 'flybridge', 'poisonhop', 'hop', 'wetpoison', 'run'];
  var FROST_T = ['ice', 'run', 'hurdle', 'ice', 'hump', 'pit', 'spikes', 'run'], TINY_T = ['run', 'pit', 'hurdle', 'spikes', 'hump', 'run', 'walkers'], VT = toxic ? TOXIC_T : frost ? FROST_T : tiny ? TINY_T : null;
  function transit(k) { var nm, guard2 = 0; do { nm = VT ? VT[rnd(0, VT.length - 1)] : TRANSIT_NAMES[rnd(0, TRANSIT_NAMES.length - 1)]; } while ((nm === lastT || (nm === 'run' && r() < 0.6) || !climateOK(SEG_TAG[nm], climate)) && ++guard2 < 60); lastT = nm; segs.push(seg(nm, sidx++)); }
  // 1-2 transit stretches before every gated segment and 1-2 after the last one
  kinds.forEach(function (k, idx) { var pre = rnd(1, 2); for (var q = 0; q < pre; q++) transit(); segs.push(seg(k, idx + 1)); });
  for (var q3 = 0, post = rnd(1, 2); q3 < post; q3++) transit();
  // lay the segments side by side
  var W = 0; segs.forEach(function (s0) { s0.x0 = W; W += s0.w; }); var poleCol = W + 5; W += 10;
  var tiles = new Uint8Array(W * ROWS), gt = [], c, rr, coins = [], enemies = [], items = [], route = [], specials = [], movers = [], winds = [];
  for (c = 0; c < W; c++) { gt.push(g); for (rr = g; rr < ROWS; rr++) tiles[c * ROWS + rr] = T.SOLID; }
  // merge each segment into the full level, shifting x by the segment's offset x0
  segs.forEach(function (s0, si) {
    s0.tiles.forEach(function (e) { tiles[(e[0] + s0.x0) * ROWS + e[1]] = e[2]; });
    s0.coins.forEach(function (q) { coins.push({ x: q.x + s0.x0 * TS, y: q.y, b: 0 }); });
    s0.enemies.forEach(function (e) { var o2 = {}; for (var k in e) o2[k] = e[k]; o2.x += s0.x0 * TS; if (o2.ax !== undefined) o2.ax += s0.x0 * TS; if (o2.mn !== undefined) { o2.mn += s0.x0 * TS; o2.mx += s0.x0 * TS; } enemies.push(o2); });
    (s0.movers || []).forEach(function (m) { var o2 = {}; for (var k in m) o2[k] = m[k]; o2.cx += s0.x0 * TS; movers.push(o2); });
    if (s0.type === 'icelift') s0.winds.forEach(function (w) { var o2 = {}; for (var k in w) o2[k] = w[k]; o2.x0 += s0.x0 * TS; o2.x1 += s0.x0 * TS; o2.vx += s0.x0 * TS; winds.push(o2); });   // the bubble jets of the ice lift
    s0.items.forEach(function (i2) { items.push({ k: i2.k, x: i2.x + s0.x0 * TS, y: i2.y }); });
    s0.route.forEach(function (e) { var o2 = {}; for (var k in e) o2[k] = e[k]; if (o2.x !== undefined) o2.x += s0.x0 * TS; if (o2.x2 !== undefined) o2.x2 += s0.x0 * TS; if (o2.c !== undefined) o2.c += s0.x0; route.push(o2); });
    if (s0.type === 'run' && si > 0) specials.push({ x: (s0.x0 + 6) * TS, y: (g - 3) * TS });
  });
  while (specials.length < 5) specials.push({ x: (4 + specials.length * 7) * TS, y: (g - 3) * TS });
  specials = specials.slice(0, 5);
  route.push({ k: 'goal', x: poleCol * TS + 6, y: null });
  var mid = segs[Math.floor(segs.length / 2)];
  return { seed: seed, n: n, kind: 'gates', attempt: a, diff: diff, w: W, tiles: tiles, gt: gt, coins: coins, special: specials, enemies: enemies, movers: movers, cannons: [], rings: [], winds: winds, pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * ROWS),
    items: items, duck: true, reqEn: kinds.indexOf('icelift') >= 0 ? [E.BEETLE, E.FLYER, E.SWIM] : [E.BEETLE, E.FLYER], pound: kinds.indexOf('pound') >= 0, snow: kinds.indexOf('freeze') >= 0 || kinds.indexOf('icelift') >= 0, stepEn: enemies.some(function (e) { return e.t === E.BEETLE || e.t === E.FLYER; }) || kinds.indexOf('icelift') >= 0, route: route, puzzle: true, goalX: poleCol * TS + 6, poleCol: poleCol, poleY: g * TS, start: { x: 2 * TS + 2, y: g * TS - 14 }, cp: { x: (mid.x0 + 2) * TS, y: g * TS - 14 },
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
  // st is advanced with the real physics while script records the inputs; islands[] are the landing platforms made so far
  var islands = [{ c0: 2, len: 8, rl: 15 }], script = [], st = newState(L, { noPM: false }), k, chains = 0, xEnd = (W - 24) * TS, fail = false;
  function idle(m) { for (var i = 0; i < m; i++) { step(st, 0); script.push(0); } }
  idle(6);
  function replayAll(sc) { var v2 = newState(L, { noPM: false }); for (var i = 0; i < sc.length; i++) { step(v2, sc[i]); if (v2.p.dead) return null; } return v2; }
  var bad = 0;
  // one chain = a planned series of stomps and a landing; any failed step rolls back to the snapshot taken here
  while (st.p.x < xEnd && chains < 30 && !fail) {
    var snapE = L.enemies.length, snapT = L.tiles.slice(), snapI = islands.length, snapS = script.length;
    idle(rnd(2, 8));
    if (chains > 0 && r() < 0.3 + 0.4 * diff) {   // a decoy branch: another direction / height, planned the same way, ends in a dead end
      var ds = clone(st), kd = rnd(1, 2), okd = true;
      for (k = 0; k < kd && okd; k++) { var rd = trajStomp(L, ds, rnd, r, [IN.L, 0, IN.L | IN.RUN, IN.R]); if (rd) ds = rd.st; else okd = false; }
      if (okd && r() < 0.6) { var ld = trajLand(L, ds, rnd, r, [IN.L, 0, IN.R], rnd(3, 5)); if (ld) islands.push({ c0: ld.c0, len: ld.len, rl: ld.rl, decoy: true }); }
    }
    // main trajectory: kk stomps in a row (each bounce starts the next flight), then a landing island
    var kk = rnd(1, 2 + Math.min(2, Math.floor(diff * 3))), seg = [], sm = st;
    for (k = 0; k < kk; k++) { var rs = trajStomp(L, sm, rnd, r, [IN.R, IN.R | IN.RUN, IN.R]); if (!rs) { fail = 'stomp' + k + '@' + Math.round(sm.p.x) + ',' + Math.round(sm.p.y) + ' g' + sm.p.ground; break; } sm = rs.st; seg = seg.concat(rs.seg); }
    if (fail) break;
    var fin = st.p.x + 400 > xEnd + 250 || sm.p.x > xEnd - 30 * TS, lnd = trajLand(L, sm, rnd, r, [IN.R, IN.R | IN.RUN, IN.R], fin ? 12 : rnd(5, 8));
    if (!lnd) { fail = 'land@' + Math.round(sm.p.x) + ',' + Math.round(sm.p.y) + ' vy' + sm.p.vy.toFixed(1); break; }
    // replay the whole script from scratch; if it does not reproduce the landing exactly, undo this chain
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
  // finally run right into the flag
  for (k = 0; k < 160 && !st.p.won && !st.p.dead; k++) { step(st, IN.R | IN.RUN); script.push(IN.R | IN.RUN); }
  // verify on a fresh state with the real physics, recording the expected positions for the auto player
  var v = newState(L, { noPM: false }), pos = [], ok = false;
  for (k = 0; k < script.length; k++) { pos.push([v.p.x, v.p.y]); step(v, script[k]); if (v.p.dead) break; if (v.p.won) { ok = true; break; } }
  islands.forEach(function (i) { if (i.len < 4) return; for (var q = 0; q < Math.min(3, i.len - 1); q++) L.coins.push({ x: (i.c0 + 1 + q * 1.5) * TS + 8, y: (i.rl - 1.6) * TS, b: 0 }); });
  var pool = islands.filter(function (i) { return !i.decoy; }); for (k = 0; k < 5; k++) { var ip = pool[Math.min(pool.length - 1, Math.floor((k + 0.5) * pool.length / 5))]; L.special.push({ x: (ip.c0 + 2) * TS, y: (ip.rl - 3) * TS }); }
  // a trajectory level carries its script as L.plan, so generate() trusts planOk instead of running validate()
  L.plan = script; L.planPos = pos; L.planOk = ok; L.route = [{ k: 'goal', x: gx, y: gy - 10 }];
  return L;
}


// ------------------------------------------------------------------ 'odyssey': a winding 2-D journey. The world is a grid of cells (24 x 14 tiles); the planner first draws a self-avoiding PATH through the grid that turns right, up, left and down,
// then every cell on it is filled by the generator that fits how the hero passes through it: running cells use the template library (mirrored when the path goes left), climbing cells get a zig-zag ledge staircase up to a hole in the
// ceiling, descending cells a hole in the floor. Each cell has its own biome (looks + hazards + templates); the biome mix is the 'atmosphere' of the stage. bias: 'wide' (mostly horizontal), 'tall' (mostly vertical) or 'mixed'.
var OD_CW = 30, OD_CH = 14;
var BIOMES = {
  meadow: { theme: 0, pool: ['run', 'hurdle', 'pit', 'hump', 'hop', 'walkers', 'bricks', 'spikes'], tag: '' },
  sky: { theme: 1, pool: ['hop', 'pits2', 'pit', 'mover', 'hurdle'], tag: '' },
  snow: { theme: 8, pool: ['ice', 'hop', 'hurdle', 'pit', 'spikes', 'hump'], tag: 'cold', ice: true },
  volcano: { theme: 14, pool: ['lavahop', 'pit', 'spikes', 'hurdle', 'belt', 'hump'], tag: 'hot' },
  swamp: { theme: 10, pool: ['poisonhop', 'pit', 'walkers', 'hurdle', 'bricks'], tag: 'wet' },
  ruins: { theme: 15, pool: ['hurdle', 'spikes', 'tunnel', 'walkers', 'bricks', 'pits2', 'hump'], tag: '' },
  factory: { theme: 16, pool: ['belt', 'mover', 'bricks', 'tunnel', 'spikes', 'pit', 'hurdle'], tag: '' },
  cave: { theme: 5, pool: ['tunnel', 'hurdle', 'pit', 'spikes', 'hump', 'walkers'], tag: '' }
};
// underground looks (the lower cells of a winding journey; also the cave layout): soil, magma, ice, cavern and crystal tunnels with slightly different templates
BIOMES.ug = { theme: 23, pool: ['run', 'hurdle', 'pit', 'hump', 'walkers', 'tunnel', 'bricks', 'spikes'], tag: '' };
BIOMES.uglava = { theme: 24, pool: ['lavahop', 'pit', 'spikes', 'hurdle', 'belt', 'tunnel'], tag: 'hot' };
BIOMES.ugice = { theme: 25, pool: ['ice', 'hop', 'hurdle', 'pit', 'spikes', 'tunnel'], tag: 'cold', ice: true };
BIOMES.ugcave = { theme: 26, pool: ['tunnel', 'hurdle', 'pit', 'spikes', 'hump', 'walkers', 'bricks'], tag: '' };
BIOMES.ugcrystal = { theme: 27, pool: ['hop', 'pits2', 'bricks', 'tunnel', 'spikes', 'hurdle'], tag: '' };
var UG_KEYS = ['ug', 'ugcave', 'ugcrystal', 'uglava', 'ugice'];
var BIOME_MIXES = [['meadow', 'sky', 'ruins'], ['snow', 'meadow', 'cave'], ['volcano', 'ruins', 'factory'], ['swamp', 'meadow', 'cave'], ['meadow', 'factory', 'sky'], ['snow', 'sky', 'meadow'], ['volcano', 'cave', 'ruins'], ['swamp', 'ruins', 'cave']];
function odMirror(sg) {   // flip a template left <-> right (the hero walks the other way through it)
  var w = sg.w, W = w * TS, M = {}; M[T.CONVL] = T.CONVR; M[T.CONVR] = T.CONVL; M[T.SLR] = T.SLL; M[T.SLL] = T.SLR; M[T.CANL] = T.CANR; M[T.CANR] = T.CANL; M[T.CURL] = T.CURR; M[T.CURR] = T.CURL;
  var o = { type: sg.type, w: w, tiles: sg.tiles.map(function (e) { return [w - 1 - e[0], e[1], M[e[2]] !== undefined ? M[e[2]] : e[2]]; }), coins: sg.coins.map(function (c) { return { x: W - c.x, y: c.y, b: c.b }; }), items: [], route: [], movers: (sg.movers || []).map(function (m) { var q = {}; for (var k in m) q[k] = m[k]; q.cx = W - m.cx; return q; }) };
  o.enemies = sg.enemies.map(function (e) { var q = {}; for (var k in e) q[k] = e[k]; q.x = W - e.x - e.w; if (e.ax !== undefined) q.ax = W - e.ax - e.w; if (e.mn !== undefined) { q.mn = W - e.mx; q.mx = W - e.mn; } if (e.dir !== undefined) q.dir = -e.dir; return q; });
  return o;
}
// random self-avoiding walk over the cell grid; its cells are the main route of the odyssey
function odPath(GX, GY, r, minLen, bias) {
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  for (var tr = 0; tr < 400; tr++) {
    var cur = { i: 0, j: rnd(0, GY - 1) }, path = [cur], used = {}; used[cur.i + ',' + cur.j] = 1;
    var target = minLen + rnd(0, 3);
    while (path.length < target) {
      var opts = [], wR = bias === 'wide' ? 3.2 : bias === 'tall' ? 1 : 2, wV = bias === 'tall' ? 3 : bias === 'wide' ? 0.9 : 1.6;
      [[1, 0, wR], [-1, 0, 0.9], [0, -1, wV], [0, 1, wV]].forEach(function (d) { var ni = cur.i + d[0], nj = cur.j + d[1]; if (ni < 0 || nj < 0 || ni >= GX || nj >= GY || used[ni + ',' + nj]) return; opts.push({ i: ni, j: nj, w: d[2] }); });
      if (!opts.length) break; var tot = 0; opts.forEach(function (o) { tot += o.w; }); var x = r() * tot, pick = opts[0]; for (var q = 0; q < opts.length; q++) { if (x < opts[q].w) { pick = opts[q]; break; } x -= opts[q].w; }
      cur = { i: pick.i, j: pick.j }; path.push(cur); used[cur.i + ',' + cur.j] = 1;
    }
    if (path.length < minLen) continue;
    var L_ = 0, U_ = 0, D_ = 0; for (var k = 1; k < path.length; k++) { var di = path[k].i - path[k - 1].i, dj = path[k].j - path[k - 1].j; if (di < 0) L_++; if (dj < 0) U_++; if (dj > 0) D_++; }
    if (minLen < 7) return path;   // short (first-levels) journeys cannot be asked to turn left / go both up and down
    if (bias === 'wide' ? (L_ >= 1) : bias === 'tall' ? (U_ >= 1 && D_ >= 1) : (L_ >= 1 && U_ >= 1 && D_ >= 1)) return path;
  }
  return null;
}
// odyssey builder: route cells, biomes, templates per cell, dead-end branch rooms, then locked doors/hatches and the key chain (see header above)
function buildOdyssey(seed, n, a) {
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 131)), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, CW = OD_CW, CH = OD_CH, g = 11;
  // layout bias: wide (horizontal journey), tall or mixed; it sets the grid size
  var bx = r(), wideP = Math.max(0.05, 0.28 - n * 0.006), bias = bx < wideP ? 'wide' : bx < wideP + 0.22 ? 'tall' : 'mixed';   // fewer straight 'wide' journeys and more winding ones as the levels go on
  var GX = bias === 'wide' ? rnd(5, 6) : bias === 'tall' ? rnd(2, 3) : rnd(3, 4), GY = bias === 'wide' ? rnd(2, 3) : bias === 'tall' ? rnd(4, 5) : rnd(3, 4);
  var fancy = a < 6, small = n < 5, minL = 8 + Math.floor(diff * 5);   // the first levels (n < 5) get a short winding journey: from level 5 on it is the full size
  if (small) { GX = bias === 'wide' ? 4 : bias === 'tall' ? 2 : 3; GY = bias === 'wide' ? 2 : bias === 'tall' ? 3 : 2; minL = 4 + Math.round(Math.max(0, (n - 1) / 4) * 3); }
  else if (fancy) { GX += 1; if (bias === 'wide') GY += 1; }   // a bigger grid: room for dead-end branches beside the route
  // the main route; with no path the kind fails and generate() redraws
  var path = odPath(GX, GY, r, Math.min(GX * GY - 1, minL), bias);
  if (!path) return { kindFail: true, valid: false, route: [{ k: 'goal', x: 1e6, y: null }], w: 10, tiles: new Uint8Array(140), rows: 14, movers: [], enemies: [], coins: [], special: [], keys: [], doors: [], switches: [], tele: [], launch: [], cannons: [], rings: [], winds: [], pockets: [], grp: new Uint8Array(140), gt: [], start: { x: 0, y: 0 }, cp: { x: 0, y: 0 }, goalX: 1e6, time: 100, kind: 'odyssey' };
  // the world starts as solid rock; cells are carved out of it below
  var W = GX * CW, rows = GY * CH, tiles = new Uint8Array(W * rows), put = function (c, rr, t) { if (c >= 0 && c < W && rr >= 0 && rr < rows) tiles[c * rows + rr] = t; }, get = function (c, rr) { return (c >= 0 && c < W && rr >= 0 && rr < rows) ? tiles[c * rows + rr] : 1; };
  for (var q0 = 0; q0 < tiles.length; q0++) tiles[q0] = T.SOLID;
  // biome mix: which looks, in which proportions (the stage's atmosphere)
  var mix = BIOME_MIXES[rnd(0, BIOME_MIXES.length - 1)].slice(), wts = [0.5 + r(), 0.3 + r() * 0.6, 0.15 + r() * 0.5];
  function compat(t1, t2) { if (!t1 || !t2 || t1 === t2) return true; return false; }
  // cell k: grid position and pixel origin; entry / exit sides follow from its neighbours on the path, biome from the stage's mix with no hot cell next to a cold one
  var cells = path.map(function (p, k) { return { k: k, i: p.i, j: p.j, x0: p.i * CW, y0: p.j * CH }; });
  cells.forEach(function (c, k) {
    var prev = k > 0 ? cells[k - 1] : null, next = k + 1 < cells.length ? cells[k + 1] : null;
    c.entry = !prev ? 'S' : prev.i < c.i ? 'L' : prev.i > c.i ? 'R' : prev.j < c.j ? 'T' : 'B';
    c.exit = !next ? 'END' : next.i > c.i ? 'R' : next.i < c.i ? 'L' : next.j > c.j ? 'D' : 'U';
    var tot = 0, bi = 0, x = r() * (wts[0] + wts[1] + wts[2]); for (bi = 0; bi < 3; bi++) { if (x < wts[bi]) break; x -= wts[bi]; } if (bi > 2) bi = 2;
    var cand = BIOMES[mix[bi]], pv = k > 0 ? cells[k - 1].biome : null;
    if (pv && !compat(pv.tag, cand.tag) && pv.tag && cand.tag) cand = BIOMES.meadow;    // never hot next to wet / cold: a neutral cell in between
    if (pv && pv.tag && cand.tag && pv.tag !== cand.tag) cand = BIOMES.meadow;
    if (GY >= 3 && c.j >= Math.ceil(GY * 0.5) && !compat) { }
    if (GY >= 3 && c.j >= Math.ceil(GY * 0.5)) {   // the lower half of a tall journey is under the ground: no sky, no meadow down there
      var ugc = BIOMES[UG_KEYS[hash(seed, n, 2200 + k) % UG_KEYS.length]];
      if (pv && pv.tag && ugc.tag && pv.tag !== ugc.tag) ugc = BIOMES.ug;
      cand = ugc;
    }
    c.biome = cand;
  });
  // holes between vertically linked cells live in the UPPER cell's floor
  var holeOf = {};   // 'upperk' -> x
  function pickHole(upper, lower) {
    var avoid = []; [upper, lower].forEach(function (cc) { if (cc.floorHole !== undefined) avoid.push(cc.floorHole); if (cc.ceilHole !== undefined) avoid.push(cc.ceilHole); });
    for (var t2 = 0; t2 < 40; t2++) { var hx = rnd(4, CW - 9), ok = true; avoid.forEach(function (ax) { if (Math.abs(ax - hx) < 10) ok = false; }); if (ok) return hx; }
    return -1;
  }
  // stacked cells share a hole x (floor hole above, ceiling hole below, far from the other holes); no fit -> retry with the next attempt
  var okHoles = true;
  for (var k2 = 0; k2 + 1 < cells.length && okHoles; k2++) {
    var A = cells[k2], B = cells[k2 + 1]; if (A.i !== B.i) continue;
    var up = A.j < B.j ? A : B, lo = A.j < B.j ? B : A, hx = pickHole(up, lo); if (hx < 0) { okHoles = false; break; }
    up.floorHole = hx; lo.ceilHole = hx;
  }
  if (!okHoles) return buildOdyssey(seed, n, a + 1 > 15 ? 15 : a + 1);
  // forks: dead-end rooms beside the route (a room next to a cell, or a cellar below it); wrong turns have to be walked back. Some carry the key of a locked door further on.
  var branches = [], occ = {}; cells.forEach(function (c) { occ[c.i + ',' + c.j] = 1; });
  function freeCell(i, j) { return i >= 0 && j >= 0 && i < GX && j < GY && !occ[i + ',' + j]; }
  // branches: for some cells add a dead-end room, either 'side' (a room next to it) or 'down' (a cellar below its floor), each holding a prize
  if (fancy) {
    var wantB = small ? 1 : Math.min(5, 2 + Math.floor(diff * 3 + r() * 1.6)), idxs = [], bi0, sh;
    for (bi0 = 1; bi0 < cells.length - 1; bi0++) idxs.push(bi0);
    for (sh = idxs.length - 1; sh > 0; sh--) { var sj = Math.floor(r() * (sh + 1)), tm = idxs[sh]; idxs[sh] = idxs[sj]; idxs[sj] = tm; }
    for (var bq = 0; bq < idxs.length && branches.length < wantB; bq++) {
      var pc = cells[idxs[bq]], opts2 = [];
      [-1, 1].forEach(function (d) { var side = d < 0 ? 'L' : 'R'; if (pc.entry !== side && pc.exit !== side && freeCell(pc.i + d, pc.j)) opts2.push({ kind: 'side', d: d }); });
      if (pc.floorHole === undefined && pc.exit !== 'D' && freeCell(pc.i, pc.j + 1)) opts2.push({ kind: 'down' });
      if (!opts2.length) continue;
      var ch = opts2[Math.floor(r() * opts2.length)], bc = { k: -1, branch: true, parent: pc, kind: ch.kind, i: pc.i + (ch.kind === 'side' ? ch.d : 0), j: pc.j + (ch.kind === 'down' ? 1 : 0), biome: pc.biome };
      bc.x0 = bc.i * CW; bc.y0 = bc.j * CH; occ[bc.i + ',' + bc.j] = 1; branches.push(bc); (pc.br = pc.br || []).push(bc);
    }
  }
  // main cells plus branch rooms are carved and linked together
  var all = cells.concat(branches);
  function isLinked(c1, c2) { if (!c1.branch && !c2.branch) return Math.abs(c1.k - c2.k) === 1; return (c1.branch && c1.parent === c2) || (c2.branch && c2.parent === c1); }
  // carve the cells
  all.forEach(function (c) { for (var cc = c.x0; cc < c.x0 + CW; cc++) for (var rr = c.y0 + (c.j === 0 ? 1 : 0); rr < c.y0 + g; rr++) put(cc, rr, T.AIR); });
  for (var rr0 = 0; rr0 < rows; rr0++) { put(0, rr0, T.SOLID); put(W - 1, rr0, T.SOLID); }
  // consecutive cells are open to each other; cells that merely touch are walled off
  all.forEach(function (c1, k1) { all.forEach(function (c2, k3) { if (k3 <= k1 || c1.j !== c2.j || Math.abs(c1.i - c2.i) !== 1 || isLinked(c1, c2)) return; var left = c1.i < c2.i ? c1 : c2; for (var rr = left.y0; rr < left.y0 + g; rr++) { put(left.x0 + CW - 1, rr, T.SOLID); put(left.x0 + CW, rr, T.SOLID); } }); });
  var coins = [], enemies = [], movers = [], route = [], specials = [], FT = function (c) { return (c.y0 + g) * TS; };
  var hasIce = false;
  cells.forEach(function (c) { c.rt = []; });
  cells.forEach(function (c) {
    // per-cell fill: entryX is where the hero arrives, target is where he must be to leave (side wall, floor hole or the foot of the staircase)
    var bio = c.biome, entryX, target, side;
    entryX = c.entry === 'S' ? 3 : c.entry === 'L' ? 1 : c.entry === 'R' ? CW - 2 : c.entry === 'T' ? cells[c.k - 1].floorHole + 2 : c.floorHole + 2;
    var exitSideX = c.exit === 'R' ? CW - 2 : c.exit === 'L' ? 1 : -1;
    if (c.exit === 'END') exitSideX = entryX < CW / 2 ? CW - 2 : 1;
    if (exitSideX >= 0) target = exitSideX;
    else if (c.exit === 'D') target = (c.floorHole - 1 > entryX || entryX < c.floorHole) ? c.floorHole - 1 : c.floorHole + 4;
    else target = c.ceilHole - 5 < 2 ? c.ceilHole + 8 : c.ceilHole - 5;     // 'U': the foot of the staircase
    if (c.exit === 'U') { var hc = c.ceilHole; target = hc + 1; }
    // 1. a template between entry and target
    var lo = Math.min(entryX, target) + 2, hi = Math.max(entryX, target) - 2, avail = hi - lo;
    if (c.exit === 'U') { lo = Math.min(entryX, target) + 2; hi = Math.max(entryX, target) - 4; avail = hi - lo; }
    var tpl = null;
    // stamp a random template of the biome into the free span (mirrored when walking left)
    if (avail >= 11) {
      for (var tr = 0; tr < 24 && !tpl; tr++) { var nm = bio.pool[rnd(0, bio.pool.length - 1)], rr2 = rng(hash(seed, n, c.k * 97 + tr * 13 + a)), sg = gateSeg(nm, rr2, function (l2, h2) { return l2 + Math.floor(rr2() * (h2 - l2 + 1)); }, g); if (sg.w <= avail) tpl = sg; }
    }
    if (tpl) {
      var dirLeft = target < entryX, sgm = dirLeft ? odMirror(tpl) : tpl, ox = c.x0 + lo + rnd(0, Math.max(0, avail - tpl.w));
      sgm.tiles.forEach(function (e) { put(ox + e[0], c.y0 + e[1], e[2]); });
      sgm.coins.forEach(function (q) { coins.push({ x: q.x + ox * TS, y: q.y + c.y0 * TS, b: 0 }); });
      sgm.enemies.forEach(function (e) { var q = {}; for (var kk in e) q[kk] = e[kk]; q.x += ox * TS; q.y += c.y0 * TS; if (q.ax !== undefined) q.ax += ox * TS; if (q.by !== undefined) q.by += c.y0 * TS; if (q.mn !== undefined) { q.mn += ox * TS; q.mx += ox * TS; } enemies.push(q); });
      (sgm.movers || []).forEach(function (m) { var q = {}; for (var kk in m) q[kk] = m[kk]; q.cx += ox * TS; q.y += c.y0 * TS; movers.push(q); });
    }
    // pits of the templates: a bed of spikes (the cells below must not be reachable by falling through a pit)
    for (var cc2 = c.x0 + 2; cc2 < c.x0 + CW - 2; cc2++) if (get(cc2, c.y0 + g) === T.AIR && get(cc2, c.y0 + g + 1) === T.AIR) { put(cc2, c.y0 + g + 1, T.SPIKE); put(cc2, c.y0 + g + 2, T.SOLID); }
    if (bio.ice) for (var cc3 = c.x0 + 2; cc3 < c.x0 + CW - 2; cc3++) if (get(cc3, c.y0 + g) === T.SOLID && get(cc3, c.y0 + g - 1) === T.AIR && r() < 0.8) { put(cc3, c.y0 + g, T.ICE); hasIce = true; }
    // 2. the way out: a hole in the floor to descend, or a ledge staircase up to the hole in the ceiling
    if (c.floorHole !== undefined) for (var hh = 0; hh < 4; hh++) for (var hr = 0; hr < 3; hr++) put(c.x0 + c.floorHole + hh, c.y0 + g + hr, T.AIR);
    if (c.exit === 'U') {
      var hx2 = c.x0 + c.ceilHole;
      for (var li = 0; li < 5; li++) { var lrow = c.y0 + 9 - li * 2, lcol = li % 2 === 0 ? hx2 + 2 : hx2 - 3; for (var lq = 0; lq < 3; lq++) { put(lcol + lq, lrow, T.SOLID); } }
      put(hx2, c.y0 - 1, T.SOLID); put(hx2 + 1, c.y0 - 1, T.SOLID);   // a notch in the hole: the last step up onto the floor above
    }
    // 3. stages of the route (waypoints the validator and the auto player follow)
    var ft = FT(c);
    if (c.exit === 'R' || c.exit === 'L' || c.exit === 'END') { if (c.exit !== 'END') c.rt.push({ k: 'at', x: (c.x0 + exitSideX) * TS + 8, y: ft - 7 }); }
    else if (c.exit === 'D') c.rt.push({ k: 'at', x: (c.x0 + target) * TS + 8, y: ft - 7 });
    else if (c.exit === 'U') {
      var hx3 = c.x0 + c.ceilHole;
      for (var li2 = 0; li2 < 5; li2++) { var lc2 = li2 % 2 === 0 ? hx3 + 2 : hx3 - 3; c.rt.push({ k: 'at', x: (lc2 + 1.5) * TS, y: (c.y0 + 9 - li2 * 2) * TS - 7 }); }
      c.rt.push({ k: 'band', x: (hx3 - 2) * TS, x2: (hx3 + 6) * TS, y: (c.y0 - CH + g) * TS - 7 });
    }
    c.entryX = entryX; c.target = target;
  });

  // ---- dead-end rooms: a room beside the cell, or a cellar below it (a hole in the floor, a staircase back up)
  function placeTpl(c, entryX, target, lo, hi) {
    var avail = hi - lo, tpl = null, bio = c.biome;
    if (avail >= 11) for (var tr = 0; tr < 24 && !tpl; tr++) { var nm = bio.pool[rnd(0, bio.pool.length - 1)], rr2 = rng(hash(seed, n, c.x0 * 7 + c.y0 * 3 + tr * 13 + a)), sg = gateSeg(nm, rr2, function (l2, h2) { return l2 + Math.floor(rr2() * (h2 - l2 + 1)); }, g); if (sg.w <= avail) tpl = sg; }
    if (!tpl) return;
    var dirLeft = target < entryX, sgm = dirLeft ? odMirror(tpl) : tpl, ox = c.x0 + lo + rnd(0, Math.max(0, avail - tpl.w));
    sgm.tiles.forEach(function (e) { put(ox + e[0], c.y0 + e[1], e[2]); });
    sgm.coins.forEach(function (q) { coins.push({ x: q.x + ox * TS, y: q.y + c.y0 * TS, b: 0 }); });
    sgm.enemies.forEach(function (e) { var q = {}; for (var kk in e) q[kk] = e[kk]; q.x += ox * TS; q.y += c.y0 * TS; if (q.ax !== undefined) q.ax += ox * TS; if (q.by !== undefined) q.by += c.y0 * TS; if (q.mn !== undefined) { q.mn += ox * TS; q.mx += ox * TS; } enemies.push(q); });
    (sgm.movers || []).forEach(function (m) { var q = {}; for (var kk in m) q[kk] = m[kk]; q.cx += ox * TS; q.y += c.y0 * TS; movers.push(q); });
  }
  function finishCell(c) {
    for (var cc2 = c.x0 + 2; cc2 < c.x0 + CW - 2; cc2++) if (get(cc2, c.y0 + g) === T.AIR && get(cc2, c.y0 + g + 1) === T.AIR) { put(cc2, c.y0 + g + 1, T.SPIKE); put(cc2, c.y0 + g + 2, T.SOLID); }
    if (c.biome.ice) for (var cc3 = c.x0 + 2; cc3 < c.x0 + CW - 2; cc3++) if (get(cc3, c.y0 + g) === T.SOLID && get(cc3, c.y0 + g - 1) === T.AIR && r() < 0.8) { put(cc3, c.y0 + g, T.ICE); hasIce = true; }
  }
  // branch rooms: a 'side' room has its prize at the far end; a cellar is entered through a hole in the parent's floor and left by a staircase; dead = no hole spot fitted
  var doors2 = [], keys2 = [], glc = [];
  branches.forEach(function (b) {
    var P0 = b.parent, ft = FT(b), li, lq;
    // side room: entered from the wall side of the parent cell; go / back are the waypoint lists to the prize and back
    if (b.kind === 'side') {
      var fromRight = b.i < P0.i, entryX = fromRight ? CW - 2 : 1, target = fromRight ? 3 : CW - 4;
      placeTpl(b, entryX, target, Math.min(entryX, target) + 2, Math.max(entryX, target) - 2); finishCell(b);
      b.prize = { x: (b.x0 + target) * TS + 8, y: (b.y0 + g - 1) * TS + 8 };
      var wpx = (b.x0 + (fromRight ? CW - 4 : 3)) * TS + 8;
      b.go = [{ k: 'at', x: wpx, y: ft - 7 }, { k: 'at', x: b.prize.x, y: ft - 7 }]; b.back = [{ k: 'at', x: wpx, y: ft - 7 }];
    } else {
      // cellar: find floor columns clear of the parent's entry and exit, dig a 4-wide hole there and build the staircase back up
      var pf = P0.y0 + g, runs = [], cx0, qq;
      for (cx0 = 4; cx0 <= CW - 9; cx0++) { var okr = Math.abs(cx0 + 2 - P0.entryX) > 5 && Math.abs(cx0 + 2 - P0.target) > 5; for (qq = 0; qq < 4 && okr; qq++) { var xx = P0.x0 + cx0 + qq; if (get(xx, pf) !== T.SOLID || get(xx, pf - 1) !== T.AIR || get(xx, pf - 2) !== T.AIR) okr = false; } if (okr) runs.push(cx0); }
      if (!runs.length) { b.dead = true; for (var dcx = b.x0; dcx < b.x0 + CW; dcx++) for (var dry = b.y0; dry < b.y0 + g; dry++) put(dcx, dry, T.SOLID); return; }
      var hx = runs[Math.floor(r() * runs.length)], hx2 = b.x0 + hx;
      for (var hh = 0; hh < 4; hh++) for (var hr = 0; hr < 3; hr++) put(P0.x0 + hx + hh, pf + hr, T.AIR);
      for (li = 0; li < 5; li++) { var lrow = b.y0 + 9 - li * 2, lcol = li % 2 === 0 ? hx2 + 2 : hx2 - 3; for (lq = 0; lq < 3; lq++) put(lcol + lq, lrow, T.SOLID); }
      put(hx2, b.y0 - 1, T.SOLID); put(hx2 + 1, b.y0 - 1, T.SOLID);
      var right = hx < CW / 2, target2 = right ? CW - 4 : 3, lo2 = right ? hx + 6 : target2 + 2, hi2 = right ? target2 - 2 : hx - 5;
      placeTpl(b, right ? hx + 2 : hx, target2, lo2, hi2); finishCell(b);
      b.prize = { x: (b.x0 + target2) * TS + 8, y: (b.y0 + g - 1) * TS + 8 };
      b.go = [{ k: 'at', x: (hx2 + 1.5) * TS, y: ft - 7 }, { k: 'at', x: b.prize.x, y: ft - 7 }]; b.back = [];
      for (li = 0; li < 5; li++) { var lc2 = li % 2 === 0 ? hx2 + 2 : hx2 - 3; b.back.push({ k: 'at', x: (lc2 + 1.5) * TS, y: (b.y0 + 9 - li * 2) * TS - 7 }); }
      b.back.push({ k: 'band', x: (hx2 - 2) * TS, x2: (hx2 + 6) * TS, y: pf * TS - 7 });
    }
  });
  // locked doors on the main route, crossed AFTER the cell whose dead end holds the key: a wall door (walking right or left) or a hatch in the floor / ceiling hole (going down or up)
  var colorN = 0, linkUsed = {};
  branches.forEach(function (b) {
    if (b.dead || doors2.length >= 2 || r() < 0.25) return;
    var m = Math.min(cells.length - 2, b.parent.k + rnd(0, 2)); if (linkUsed[m] || m < b.parent.k) return;
    var A = cells[m], B2 = cells[m + 1], col = colorN++ % 3, di = doors2.length, rr3;
    // same row: a wall door (3 DOOR tiles); different rows: a hatch of DOOR tiles in the upper cell's floor hole
    if (A.j === B2.j) {
      var bcx = A.i < B2.i ? B2.x0 : A.x0, top = A.y0 + (A.j === 0 ? 1 : 0);
      for (rr3 = top; rr3 < A.y0 + g - 3; rr3++) put(bcx, rr3, T.SOLID);
      for (rr3 = A.y0 + g - 3; rr3 < A.y0 + g; rr3++) { put(bcx, rr3, T.DOOR); glc.push([bcx, rr3, col]); }
      doors2.push({ c: bcx, r0: A.y0 + g - 3, r1: A.y0 + g - 1, g: col }); A.doorSt = { k: 'door', i: di, x: bcx * TS + 8, y: FT(A) - 7 };
    } else {
      var up = A.j < B2.j ? A : B2, hx0 = up.floorHole; if (hx0 === undefined) { colorN--; return; }
      for (var hq = 0; hq < 4; hq++) { put(up.x0 + hx0 + hq, up.y0 + g, T.DOOR); glc.push([up.x0 + hx0 + hq, up.y0 + g, col]); }
      doors2.push({ h: 1, c0: up.x0 + hx0, c1: up.x0 + hx0 + 3, r: up.y0 + g, g: col }); A.doorSt = { k: 'door', i: di, x: (up.x0 + hx0 + 2) * TS, y: (up.y0 + g) * TS - 7 }; A.doorBeforeLast = A.exit === 'U';
    }
    // the branch's prize becomes the key; its go / back stages are spliced into the route before the door
    linkUsed[m] = 1; keys2.push({ x: b.prize.x, y: b.prize.y, c: col }); b.keyStage = { k: 'key', g: col, x: b.prize.x, y: b.prize.y };
  });
  var route = [];
  cells.forEach(function (c) {
    (c.br || []).forEach(function (b) { if (b.dead || !b.keyStage) return; b.go.forEach(function (q) { route.push(q); }); route.push(b.keyStage); b.back.forEach(function (q) { route.push(q); }); });
    var rt = c.rt.slice(); if (c.doorSt) { if (c.doorBeforeLast) rt.splice(rt.length - 1, 0, c.doorSt); else rt.push(c.doorSt); }
    rt.forEach(function (q) { route.push(q); });
  });
  // the goal: the far end of the last cell
  var last = cells[cells.length - 1], gc = last.x0 + (last.target || CW - 2), gx = gc * TS + 8, gy = FT(last);
  route.push({ k: 'goal', x: gx, y: gy - 10 });
  for (var sp = 0; sp < 5; sp++) { var pc = cells[Math.min(cells.length - 1, Math.floor((sp + 0.5) * cells.length / 5))]; specials.push({ x: (pc.x0 + 6 + sp * 2) * TS, y: (pc.y0 + g - 3) * TS }); }
  // zone id per grid cell (-1 = rock) so consumers can tell which cell the hero is in
  var zones = []; for (var zi = 0; zi < GX * GY; zi++) zones.push(-1); all.forEach(function (c) { zones[c.j * GX + c.i] = c.biome.theme; });
  function odGrp() { var gp = new Uint8Array(W * rows); glc.forEach(function (e) { gp[e[0] * rows + e[1]] = e[2]; }); return gp; }
  branches.forEach(function (b, bi) { if (!b.dead && b.prize && bi < 3 && specials[bi]) specials[bi] = { x: b.prize.x, y: (b.y0 + g - 3) * TS }; });
  var first = cells[0], gtv = []; for (var c9 = 0; c9 < W; c9++) gtv.push(rows - 1);
  var start = { x: (first.x0 + 3) * TS + 2, y: FT(first) - P.SH }, mid = cells[Math.floor(cells.length / 2)];
  var L = { seed: seed, n: n, kind: 'odyssey', attempt: a, diff: diff, w: W, rows: rows, tiles: tiles, gt: gtv, coins: coins, special: specials, enemies: enemies, movers: movers, cannons: [], rings: [], winds: [], pockets: [], keys: keys2, doors: doors2, switches: [], tele: [], launch: [], grp: odGrp(),
    route: route, puzzle: true, vertical: true, goalRect: { x: gx - 8, y: gy - 4 * TS, w: 16, h: 4 * TS }, goalX: gx, poleCol: gc, poleY: gy, start: start, cp: { x: (mid.x0 + 3) * TS, y: FT(mid) - P.SH }, time: 240 + cells.length * 40 + branches.length * 40, theme: first.biome.theme, room: false, hasBoss: false, kindAsked: 'odyssey',
    hasFire: false, hasIce: hasIce, hasMud: false, zoneCW: CW, zoneCH: CH, zoneGX: GX, zones: zones, bias: bias, mixNames: mix, cellCount: cells.length, branchCount: branches.filter(function (b) { return !b.dead; }).length };
  return L;
}

// ------------------------------------------------------------------ deep sea: the whole stage is under water (open air above the surface so the hero can always breathe); the seabed rises and falls, reefs and floating rocks, currents, whirlpools, bubble jets and a whole zoo
// underwater feature placement for one stretch of columns cs..ce (shared by the horizontal stage and every chamber of the tall ones): pillars, rocks, currents, vents, poison, whirlpools, bubble jets
// X = shared context (rng, tile lists, occupancy, column limits loB..hiB); wl = water line row of the stretch; gt = floor row per column (pillars edit it)
function deepFeatures(X, cs, ce, wl, gt) {
  var r = X.r, rnd = X.rnd, nn = X.nn, diff = X.diff, tl = X.tl, whirls = X.whirls, winds = X.winds, occ = X.occ, q;
  function free(c0, c2) { if (c0 < X.loB || c2 > X.hiB) return false; for (var k = c0 - 2; k <= c2 + 2; k++) if (occ[k]) return false; return true; } function take(c0, c2) { for (var k = c0; k <= c2; k++) occ[k] = 1; }
  var cx = cs + 2;
  while (cx < ce - 6) {
    var pick = r(), len, f;
    if (pick < 0.22) { len = rnd(1, 2); if (free(cx, cx + len)) { var hp = rnd(3, 5), top = Math.max(wl + 3, gt[cx] - hp); for (q = 0; q < len; q++) gt[cx + q] = Math.min(gt[cx + q], top); take(cx, cx + len); } cx += rnd(5, 8); }
    else if (pick < 0.40) { len = rnd(3, 5); var rr0 = rnd(wl + 3, wl + 4); if (free(cx, cx + len)) { var okf = true; for (q = 0; q < len; q++) if (gt[cx + q] < rr0 + 3) okf = false; if (okf) { for (q = 0; q < len; q++) tl.push([cx + q, rr0, T.SOLID]); take(cx, cx + len); } } cx += rnd(5, 8); }
    else if (pick < 0.52 && diff >= 0) { len = rnd(5, 8); if (free(cx, cx + len)) { var ct = r() < 0.5 ? T.CURL : T.CURR, cr0 = rnd(wl + 2, wl + 4); for (q = 0; q < len; q++) for (var cq = 0; cq < 2; cq++) tl.push([cx + q, cr0 + cq, ct]); take(cx, cx + len); } cx += len + rnd(2, 4); }
    else if (pick < 0.60) { if (free(cx, cx + 2)) { for (q = 0; q < 2; q++) for (var uq = wl + 1; uq < gt[cx + q]; uq++) tl.push([cx + q, uq, T.CURU]); take(cx, cx + 2); } cx += rnd(5, 8); }
    // water never touches poison sideways: a poison pit's neighbours are raised to wall height
    else if (pick < 0.72 && nn >= 2) { if (free(cx - 1, cx + 3) && gt[cx] === gt[cx + 1]) { var fo = gt[cx]; gt[cx] = fo + 1; gt[cx + 1] = fo + 1; gt[cx - 1] = Math.min(gt[cx - 1], fo); gt[cx + 2] = Math.min(gt[cx + 2], fo); tl.push([cx, fo, T.POISON]); tl.push([cx + 1, fo, T.POISON]); take(cx - 1, cx + 3); } cx += rnd(5, 8); }
    // a poison layer lies on a flat seabed, closed at both ends by a raised wall tile
    else if (pick < 0.82 && nn >= 2) { len = rnd(5, 9); var flatL = free(cx - 1, cx + len + 1); for (q = -1; q <= len && flatL; q++) if (gt[cx + q] !== gt[cx]) flatL = false; if (flatL) { var f0 = gt[cx]; for (q = 0; q < len; q++) tl.push([cx + q, f0 - 1, T.POISON]); gt[cx - 1] = f0 - 1; gt[cx + len] = f0 - 1; take(cx - 1, cx + len + 1); } cx += len + rnd(2, 4); }
    else if (pick < 0.88 && diff > 0.2) { if (free(cx, cx + 6)) { var dr1 = r() < 0.35; whirls.push({ x: (cx + 3) * TS, y: dr1 ? (gt[cx + 3] - 1.5) * TS : (wl + 4) * TS, r: dr1 ? 42 : 38, dir: r() < 0.5 ? 1 : -1, drain: dr1 ? 1 : 0 }); take(cx, cx + 6); } cx += rnd(8, 11); }
    else if (pick < 0.95 && diff > 0.1) { len = 6; if (free(cx, cx + len)) { var jd = r() < 0.5 ? 1 : -1, jx0 = jd > 0 ? cx * TS : (cx + len) * TS - 96, jy = rnd(wl + 2, wl + 4) * TS; winds.push({ x0: jx0, x1: jx0 + 96, y0: jy, y1: jy + 2 * TS, dx: jd * 0.11, dy: 0, per: 260, on: 130, ph: rnd(0, 259), bub: 1, vx: jd > 0 ? cx * TS : (cx + len) * TS }); take(cx, cx + len); } cx += rnd(7, 10); }
    // a bubble vent in the seabed: a column of bubbles pushes the swimmer upward
    else if (pick < 0.985 && diff > 0.05) { if (free(cx, cx + 3)) { var vy1 = gt[cx + 1] * TS; winds.push({ x0: cx * TS - 4, x1: cx * TS + 28, y0: vy1 - 80, y1: vy1, dx: 0, dy: -0.12, per: 230, on: 120, ph: rnd(0, 229), bub: 1, vx: cx * TS + 12, vy: vy1 }); take(cx, cx + 3); } cx += rnd(6, 9); }
    else cx += rnd(3, 5);
  }
}
// creatures for one stretch of columns (see deepFeatures); surf = the stretch has an open water surface (striders live there)
function deepCreatures(X, cs, ce, wl, gt, surf) {
  var r = X.r, rnd = X.rnd, nn = X.nn, diff = X.diff, enemies = X.enemies;
  // creatures: a few of the same kinds the pools have, plus the new ones, spread along the stage in groups
  var cx, gap = Math.max(5, 15 - Math.floor(diff * 7) - Math.floor(Math.min(1, Math.max(0, (nn - 19) / 50)) * 3));
  for (cx = cs + 6; cx < ce - 4; cx += Math.max(2, Math.round((gap + rnd(0, 4)) / 3))) {   // three times as many creature groups as before
    var kinds = ['swim', 'swim', 'swim', 'squid', 'strider', 'jelly', 'puffer', 'flounder', 'clam']; if (surf) kinds.push('leap', 'leap'); if (diff > 0.2) kinds.push('chaser', 'mine', 'eel'); if (diff > 0.35) kinds.push('whale', 'clam'); if (diff > 0.1) kinds.push('clam'); if (!surf) kinds = kinds.filter(function (k) { return k !== 'strider'; });   // striders walk on the water surface only
    var kd = kinds[rnd(0, kinds.length - 1)]; if (kd === 'whale' && cx + 8 > X.hiB) kd = 'puffer'; var x = cx * TS, wy = (wl + 2 + rnd(0, 3)) * TS, fl = gt[Math.min(X.W - 1, cx)];
    if (kd === 'swim') { var big = r() < 0.35, yy = (wl + 1.5 + r() * 4) * TS; enemies.push(fishHabit({ t: E.SWIM, sz: big ? 1 : 0, x: x, y: yy, w: big ? 22 : 12, h: big ? 12 : 8, ax: x, ay: yy, rg: 24 + r() * 26, sp: 1 / (170 + r() * 120), ph: r(), am: 3 + r() * 3, spd: 0 }, r, ++X.ids)); if (r() < 0.5) enemies.push({ t: E.SWIM, sz: 0, x: x + 30, y: yy + 14, w: 12, h: 8, ax: x + 30, ay: yy + 14, rg: 24, sp: 1 / 200, ph: r(), am: 3, spd: 0 }); }
    else if (kd === 'leap') { var lper2 = rnd(120, 180), ridef = r() < 0.5; enemies.push({ t: E.LEAPFISH, ride: ridef ? 1 : 0, x: x, y: wl * TS, w: ridef ? 24 : 14, h: ridef ? 13 : 9, ax: x, by: wl * TS, per: lper2, pho: rnd(0, lper2), hgt: ridef ? rnd(34, 46) : rnd(30, 50), up: 1, hid: true, spd: 0 }); }   // a fish leaping out of the water (the big gold ones can be stood on)
    else if (kd === 'squid') enemies.push({ t: E.SQUID, id: ++X.ids, x: x, y: wy, w: 12, h: 16, ax: x, ax0: x, ay0: wy, rx: 40 + r() * 30, ry: 38, s: 0, wait: 30, cnt: 0, dvx: 0, dvy: 0, spd: 0, dir: 1 });
    else if (kd === 'strider') enemies.push({ t: E.STRIDER, id: ++X.ids, x: x, y: wl * TS - 6, w: 12, h: 8, ax: x, ax0: x, sy: wl * TS, mn: Math.max(X.loB, cx - 9) * TS, mx: Math.min(X.hiB, cx + 9) * TS, s: 0, tm: 0, spd: 0, dir: 1 });
    else if (kd === 'jelly') enemies.push({ t: E.JELLY, x: x, y: wy, w: 16, h: 18, ax: x, ay: wy, ph: r(), spd: 0 });
    else if (kd === 'puffer') enemies.push({ t: E.PUFFER, id: ++X.ids, x: x, y: wy, w: 12, h: 10, ax: x, ax0: x, ay0: wy, rg: 24 + r() * 20, sp: 1 / (200 + r() * 100), ph: r(), spd: 0, dir: 1 });
    else if (kd === 'chaser') enemies.push({ t: E.CHASER, lurk: r() < 0.5 ? 1 : 0, x: x, y: wy, w: 12, h: 10, ax: x, ay: wy, spd: 0, dir: 1 });
    else if (kd === 'mine') enemies.push({ t: E.FMINE, x: x, y: wy, w: 14, h: 14, ax: x, ay: wy, am: 8, ph: r(), spd: 0 });
    else if (kd === 'eel') enemies.push({ t: E.EEL, id: ++X.ids, x: x, y: wy, w: 88, h: 8, ax: x, pho: rnd(0, 199), s: 0, spd: 0, dir: 1 });
    else if (kd === 'whale') enemies.push({ t: E.WHALE, x: x, y: (wl + 2.5) * TS, w: 44, h: 20, ax: x, ay: (wl + 2.5) * TS, rg: 60, sp: 1 / 420, ph: r(), spd: 0, dir: 1 });
    else if (kd === 'flounder') { var okf2 = true, c3; for (c3 = cx - 3; c3 <= cx + 3; c3++) if (gt[Math.max(0, Math.min(X.W - 1, c3))] !== fl) okf2 = false; if (okf2) { var fly2 = fl * TS - 7; enemies.push({ t: E.FLOUNDER, x: x, y: fly2, w: 20, h: 7, ax: x, rg: 18 + r() * 10, sp: 1 / (240 + r() * 100), ph: r(), fy: fly2, spd: 0, dir: 1 }); } }   // a flounder crawling on a flat stretch of seabed
    else enemies.push({ t: E.CLAM, x: x, y: fl * TS - 12, w: 16, h: 12, ax: x, pho: rnd(0, 179), spd: 0, noPillar: cx });
  }
}
// shape of an underwater stage: forced by option o.shape (horiz | vert | diag | wind), else drawn from the seed (about 40% / 20% / 20% / 20%); the first stages and late redraws stay horizontal
function deepShape(seed, n, a, o) {
  if (o && o.shape) return o.shape;
  if (n <= 3 || a >= 10) return 'horiz';
  var h = hash(seed, n, 617) % 10, cut = Math.max(1, 5 - Math.floor(n / 10)); if (h < cut) return 'horiz'; var q = (h - cut) % 3; return q === 0 ? 'vert' : q === 1 ? 'diag' : 'wind';   // the plain horizontal share falls with the level
}
// natural cave shaping of a tall underwater stage: the chamber grid is only a plan. Water far from the swim route is filled back with rock, the rest is a winding passage of varying width
// (a noise-wobbled copy of the route polyline) with side bulges, then cellular smoothing rounds the corners and stalactites / stalagmites / pillars are grown. A tube around the real route,
// the creatures' sweeps, start / goal / checkpoint spots and every placed feature is never touched, and a flood fill proves start -> goal -> every route point stays open (else the plan is kept).
function deepNatural(L, pts, rects, tl, X) {
  var W = L.w, R = L.rows, tiles = L.tiles, r = X.r, c, rr, i, k, j, orig = new Uint8Array(tiles), tab = [];
  for (i = 0; i < 4096; i++) tab.push(r());
  function vn(x, y, o) { var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    function g(a, b) { return tab[((a & 63) * 64 + (b & 63) + o * 977) & 4095]; }
    var a0 = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * fx, a1 = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * fx; return a0 + (a1 - a0) * fy; }
  var P = pts.map(function (p) { return [p.x / TS, p.y / TS]; }), Wp = [P[0]];
  for (i = 1; i < P.length; i++) {   // the wobbly copy: extra vertices every ~5 tiles pushed sideways by noise
    var ax = P[i - 1][0], ay = P[i - 1][1], bx = P[i][0], by = P[i][1], dl = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) || 1, m = Math.max(1, Math.round(dl / 5)), nx = -(by - ay) / dl, ny = (bx - ax) / dl;
    for (j = 1; j < m; j++) { var t = j / m, px = ax + (bx - ax) * t, py = ay + (by - ay) * t, o = (vn(px * 0.23, py * 0.23, 1) - 0.5) * 2 * 3.4; Wp.push([px + nx * o, py + ny * o]); }
    Wp.push(P[i]);
  }
  function dpoly(poly, x, y) { var best = 1e9; for (var s = 1; s < poly.length; s++) { var ax2 = poly[s - 1][0], ay2 = poly[s - 1][1], dx = poly[s][0] - ax2, dy = poly[s][1] - ay2, q = dx * dx + dy * dy, u = q > 0 ? Math.max(0, Math.min(1, ((x - ax2) * dx + (y - ay2) * dy) / q)) : 0, ex = x - ax2 - dx * u, ey = y - ay2 - dy * u, d = ex * ex + ey * ey; if (d < best) best = d; } return Math.sqrt(best); }
  var disks = [], blobs = [];   // never-touched ellipses of creature sweeps / pockets / features, and extra chamber bulges
  X.enemies.forEach(function (e) { var ew = e.w || 12, eh = e.h || 12, cx2 = ((e.ax0 !== undefined ? e.ax0 : e.ax !== undefined ? e.ax : e.x) + ew / 2) / TS, cy2 = ((e.ay0 !== undefined ? e.ay0 : e.ay !== undefined ? e.ay : e.y) + eh / 2) / TS;
    disks.push([cx2, cy2, Math.max(e.rg || 0, e.rx || 0, 12) / TS + ew / TS / 2 + 1.3, Math.max(e.am || 0, e.ry || 0, 10) / TS + 1.5]); });
  (L.pockets || []).forEach(function (p) { disks.push([p.x / TS, p.y / TS, 2.8, 2.8]); });
  (L.winds || []).concat(L.whirls || []).forEach(function (w) { disks.push([(w.x + (w.w || 0) / 2) / TS, (w.y + (w.h || 0) / 2) / TS, 5, 5]); });
  tl.forEach(function (e) { disks.push([e[0] + 0.5, e[1] + 0.5, 2.6, 2.6]); });
  for (i = 1; i < P.length; i++) {
    var sl = Math.sqrt(Math.pow(P[i][0] - P[i - 1][0], 2) + Math.pow(P[i][1] - P[i - 1][1], 2)), nb = Math.floor(sl / 11) + (r() < 0.4 ? 1 : 0);
    for (j = 0; j < nb; j++) { var tt = r(), sd = r() < 0.5 ? -1 : 1, off = 3.5 + r() * 3, ux = (P[i][0] - P[i - 1][0]) / (sl || 1), uy = (P[i][1] - P[i - 1][1]) / (sl || 1);
      blobs.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * tt - uy * sd * off, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * tt + ux * sd * off, 2.8 + r() * 2.8, 2.4 + r() * 2.2]); }
  }
  var Fm = new Uint8Array(W * R), Km = new Uint8Array(W * R), Pm = new Uint8Array(W * R), openO = function (a, b) { var t2 = orig[a * R + b]; return t2 === T.WATER || t2 === T.AIR || (t2 >= 22 && t2 <= 24); };
  for (i = 1; i < pts.length; i++) {   // the real way through the planned chambers between two route points (the straight polyline can cut a rock corner): shortest open path, kept 5 tiles wide
    var sa = [Math.floor(pts[i - 1].x / TS), Math.floor(pts[i - 1].y / TS)], sb = [Math.floor(pts[i].x / TS), Math.floor(pts[i].y / TS)], prv = new Int32Array(W * R).fill(-2), qu = [sa[0] * R + sa[1]], qh = 0;
    prv[qu[0]] = -1;
    while (qh < qu.length && prv[sb[0] * R + sb[1]] === -2) { var cq = qu[qh++], ca = Math.floor(cq / R), cb = cq % R; for (k = 0; k < 4; k++) { var na = ca + (k === 0) - (k === 1), nb2 = cb + (k === 2) - (k === 3); if (na > 0 && na < W - 1 && nb2 > 0 && nb2 < R - 1 && prv[na * R + nb2] === -2 && openO(na, nb2)) { prv[na * R + nb2] = cq; qu.push(na * R + nb2); } } }
    if (prv[sb[0] * R + sb[1]] !== -2) for (var wq = sb[0] * R + sb[1]; wq >= 0; wq = prv[wq]) { var wa = Math.floor(wq / R), wb = wq % R; for (var da = -2; da <= 2; da++) for (var db = -2; db <= 2; db++) if (wa + da > 0 && wa + da < W - 1 && wb + db > 0 && wb + db < R - 1) Pm[(wa + da) * R + wb + db] = 1; }
  }
  function inEl(list, x, y) { for (var q = 0; q < list.length; q++) { var dx = (x - list[q][0]) / list[q][2], dy = (y - list[q][1]) / list[q][3]; if (dx * dx + dy * dy <= 1) return true; } return false; }
  for (c = 1; c < W - 1; c++) for (rr = 1; rr < R - 1; rr++) {
    var t0 = orig[c * R + rr]; if (t0 === T.SOLID) continue;
    var x = c + 0.5, y = rr + 0.5, ix = c * R + rr, forced = Pm[ix] === 1 || dpoly(P, x, y) <= 2.5 || inEl(disks, x, y);
    for (k = 0; k < rects.length && !forced; k++) if (c >= rects[k].c0 && c <= rects[k].c1 && rr >= rects[k].r0 && rr <= rects[k].r1) forced = true;
    Fm[ix] = forced ? 1 : 0;
    Km[ix] = (forced || dpoly(Wp, x, y) - 1.8 * (vn(c * 0.37, rr * 0.37, 2) - 0.5) <= 3.0 + 3.4 * vn(c * 0.12, rr * 0.12, 3) || inEl(blobs, x + (vn(c * 0.3, rr * 0.3, 4) - 0.5) * 1.6, y + (vn(c * 0.3 + 9, rr * 0.3, 4) - 0.5) * 1.6)) ? 1 : 0;
  }
  var wetT = function (t2) { return t2 === T.WATER; };
  for (c = 1; c < W - 1; c++) for (rr = 1; rr < R - 1; rr++) if (orig[c * R + rr] === T.WATER && !Km[c * R + rr]) tiles[c * R + rr] = T.SOLID;
  // air above the surface: only where its water survived, with a slightly uneven ceiling
  for (c = 1; c < W - 1; c++) for (rr = 1; rr < R - 1; rr++) if (orig[c * R + rr] === T.AIR && orig[c * R + rr - 1] !== T.AIR) {
    var re = rr; while (re < R - 1 && orig[c * R + re] === T.AIR) re++;
    var keepAir = tiles[c * R + re] === T.WATER; for (k = rr; k < re; k++) if (!keepAir) tiles[c * R + k] = T.SOLID; else if (k === rr && !Fm[c * R + k] && vn(c * 0.45, 0, 5) > 0.68 && re - rr > 1) tiles[c * R + k] = T.SOLID;
  }
  // lumpy walls, floors and ceilings: rock swells 0..3 tiles out from every rock face where a slow noise is high (so no long flat run survives outside the protected region)
  var base = new Uint8Array(tiles);
  for (c = 2; c < W - 2; c++) for (rr = 2; rr < R - 2; rr++) { if (Fm[c * R + rr] || base[c * R + rr] !== T.WATER) continue;
    var thr = 4.2 * vn(c * 0.16 + 2, rr * 0.2, 6) - 1.1 + 0.5 * (vn(c * 0.6, rr * 0.6, 7) - 0.5), dm = 9, di2, dj2;
    if (thr < 1) continue;
    for (di2 = -3; di2 <= 3; di2++) for (dj2 = -3; dj2 <= 3; dj2++) { var a4 = c + di2, b4 = rr + dj2; if (a4 < 0 || a4 >= W || b4 < 0 || b4 >= R) continue; var t4 = base[a4 * R + b4]; if (t4 !== T.WATER && t4 !== T.AIR && !(t4 >= 22 && t4 <= 24)) dm = Math.min(dm, Math.sqrt(di2 * di2 + dj2 * dj2)); }
    if (dm <= thr) tiles[c * R + rr] = T.SOLID;
  }
  // smoothing: rock fills pits (>= 5 of 8 neighbours rock), thin bits of added rock melt away; the protected region never changes
  var rock = function (a, b) { if (a < 0 || a >= W || b < 0 || b >= R) return 1; var t2 = tiles[a * R + b]; return t2 === T.WATER || t2 === T.AIR || (t2 >= 22 && t2 <= 24) ? 0 : 1; };
  for (var pass = 0; pass < 3; pass++) {
    var nt = new Uint8Array(tiles);
    for (c = 1; c < W - 1; c++) for (rr = 1; rr < R - 1; rr++) { var ix2 = c * R + rr; if (Fm[ix2]) continue; var cnt = 0, di, dj; for (di = -1; di <= 1; di++) for (dj = -1; dj <= 1; dj++) if (di || dj) cnt += rock(c + di, rr + dj);
      if (tiles[ix2] === T.WATER && cnt >= 5) nt[ix2] = T.SOLID; else if (tiles[ix2] === T.SOLID && orig[ix2] === T.WATER && cnt <= 2) nt[ix2] = T.WATER; }
    tiles.set(nt);
  }
  // stalactites, stalagmites and pillars grown from ceilings and floors outside the protected region
  var free = function (a, b) { return a > 0 && a < W - 1 && b > 0 && b < R - 1 && tiles[a * R + b] === T.WATER && !Fm[a * R + b]; };
  for (c = 2; c < W - 2; c++) for (rr = 2; rr < R - 2; rr++) {
    if (!free(c, rr)) continue;
    var down = tiles[c * R + rr - 1] === T.SOLID && r() < 0.17, up = !down && tiles[c * R + rr + 1] === T.SOLID && r() < 0.15;
    if (!down && !up) continue;
    var len = 1 + Math.floor(r() * r() * (up ? 6 : 5)) + (up && r() < 0.06 ? 3 : 0), dir = down ? 1 : -1, sd2 = r() < 0.5 ? -1 : 1;
    for (k = 0; k < len; k++) { var rk = rr + dir * k; if (!free(c, rk)) break; tiles[c * R + rk] = T.SOLID; if (len >= 3 && k < len - 2 && (up || k < 2) && free(c + sd2, rk) && (k < len - 3 || r() < 0.5)) tiles[(c + sd2) * R + rk] = T.SOLID; }
  }
  // the proof: start, goal and every route point stay inside one open body of water / air
  var open = function (a, b) { var t2 = tiles[a * R + b]; return t2 === T.WATER || t2 === T.AIR || (t2 >= 22 && t2 <= 24); }, seen = new Uint8Array(W * R), stack = [], s0 = [Math.floor(pts[0].x / TS), Math.floor(pts[0].y / TS)], okF = true;
  if (open(s0[0], s0[1])) { stack.push(s0); seen[s0[0] * R + s0[1]] = 1; }
  while (stack.length) { var cu = stack.pop(), nbs = [[1, 0], [-1, 0], [0, 1], [0, -1]]; for (k = 0; k < 4; k++) { var a2 = cu[0] + nbs[k][0], b2 = cu[1] + nbs[k][1]; if (a2 > 0 && a2 < W - 1 && b2 > 0 && b2 < R - 1 && !seen[a2 * R + b2] && open(a2, b2)) { seen[a2 * R + b2] = 1; stack.push([a2, b2]); } } }
  pts.forEach(function (p) { var a3 = Math.floor(p.x / TS), b3 = Math.floor(p.y / TS); if (!seen[a3 * R + b3]) okF = false; });
  if (!okF) tiles.set(orig);
  return okF;
}
// tall underwater stages: a path of water chambers (14 rows x CW columns each) carved out of solid rock. vert = a column of chambers (swim up or down), diag = a staircase of chambers,
// wind = a winding path (up, sideways, down, back ...). Neighbouring chambers on the path are joined by wide openings; chambers in the top grid row have an air gap above the water line.
// The route is a chain of 'near' swim waypoints (chamber links and air pockets); the validator / planner search them with swim stroke macros (L.swimNodes).
function buildDeepTall(seed, n, a, shape) {
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 233)), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, CW = shape === 'vert' ? 24 : 22, CH = 14, i, j, c, rr, k, q, GX, GY, path = [];
  if (shape === 'vert') { GX = 1; GY = 4 + Math.floor(diff * 3) + rnd(0, 1); for (j = 0; j < GY; j++) path.push({ i: 0, j: j }); }
  else if (shape === 'diag') { var stp = 3 + Math.floor(diff * 2) + rnd(0, 1); GX = stp + 1; GY = stp + 1; var cu = { i: 0, j: 0 }; path.push({ i: 0, j: 0 }); for (k = 0; k < stp; k++) { cu = { i: cu.i + 1, j: cu.j }; path.push(cu); cu = { i: cu.i, j: cu.j + 1 }; path.push(cu); } }
  else { GX = rnd(3, 4); GY = rnd(3, 4); path = odPath(GX, GY, r, Math.min(GX * GY - 1, 8 + Math.floor(diff * 3)), 'mixed'); }
  if (!path) return { kindFail: true, valid: false, route: [{ k: 'goal', x: 1e6, y: null }], w: 10, tiles: new Uint8Array(140), rows: 14, movers: [], enemies: [], coins: [], special: [], keys: [], doors: [], switches: [], tele: [], launch: [], cannons: [], rings: [], winds: [], pockets: [], grp: new Uint8Array(140), gt: [], start: { x: 0, y: 0 }, cp: { x: 0, y: 0 }, goalX: 1e6, time: 100, kind: 'deep' };
  // random mirroring: the stage can run up or down, left or right
  var fx = shape !== 'vert' && r() < 0.5, fy = r() < 0.5;
  path.forEach(function (p) { if (fx) p.i = GX - 1 - p.i; if (fy) p.j = GY - 1 - p.j; });
  var W = GX * CW, rows = GY * CH, tiles = new Uint8Array(W * rows), tl = [], enemies = [], coins = [], winds = [], whirls = [], pockets = [], specials = [], route = [], ncell = path.length;
  tiles.fill(T.SOLID);
  var cells = path.map(function (p) { return { x0: p.i * CW, y0: p.j * CH, surf: p.j === 0, holes: [], wl: 0, f0: 0 }; });
  cells.forEach(function (cl) { cl.wl = cl.surf ? cl.y0 + 4 : cl.y0 + 1; cl.f0 = cl.y0 + 13; });
  // links[k] = the opening between chamber k-1 and k (pixel centre); sideways openings are 7 rows tall, vertical ones 8 columns wide (cut through floor and ceiling)
  var links = [null], wet = function (c2, r2) { tiles[c2 * rows + r2] = T.WATER; };
  for (k = 1; k < ncell; k++) {
    var A = cells[k - 1], B = cells[k];
    if (A.y0 === B.y0) {
      var lf = A.x0 < B.x0 ? A : B, ro = lf.y0 + rnd(5, 6), xr = lf.x0 + CW - 1;
      for (rr = ro; rr < ro + 7; rr++) { wet(xr, rr); wet(xr + 1, rr); }
      links.push({ x: (xr + 1) * TS, y: (ro + 3.5) * TS });
    } else {
      var up = A.y0 < B.y0 ? A : B, hc = A.x0 + rnd(4, CW - 12);
      for (c = hc; c < hc + 8; c++) { wet(c, up.y0 + 13); wet(c, up.y0 + 14); }
      A.holes.push(hc); B.holes.push(hc);
      links.push({ x: (hc + 4) * TS, y: (up.y0 + 14) * TS });
    }
  }
  var inHole = function (cl, c2, m) { return cl.holes.some(function (h) { return c2 >= h - m && c2 <= h + 7 + m; }); };
  // per chamber: floor bumps, then the shared feature / creature placement, then the water body
  var X = { r: r, rnd: rnd, nn: nn, diff: diff * 0.55, tl: tl, enemies: enemies, winds: winds, whirls: whirls, ids: 0, W: W, occ: {}, loB: 0, hiB: 0 };   // chambers are small and swum through slowly: gentler creature / hazard mix than the long horizontal stage
  cells.forEach(function (cl, ci) {
    var cgt = [], bh = 0; for (c = 0; c < W; c++) cgt.push(cl.f0);
    for (c = cl.x0 + 4; c < cl.x0 + CW - 4 && ci !== 0 && ci !== ncell - 1 && ci !== (ncell >> 1); c++) { if (r() < 0.3) bh = Math.max(0, Math.min(2, bh + (r() < 0.5 ? -1 : 1))); if (!inHole(cl, c, 1)) cgt[c] = cl.f0 - bh; }
    X.loB = cl.x0 + 3; X.hiB = cl.x0 + CW - 4; X.occ = {};
    cl.holes.forEach(function (h) { for (c = h; c < h + 8; c++) X.occ[c] = 1; });
    var first = ci === 0, last = ci === ncell - 1;
    if (!first && !last) deepFeatures(X, cl.x0 + 1, cl.x0 + CW - 1, cl.wl, cgt);   // start and goal chambers stay plain (flat floor to stand on)
    if (!first) deepCreatures(X, cl.x0 + 1, cl.x0 + CW - 1, cl.wl, cgt, cl.surf);
    for (c = cl.x0 + 1; c <= cl.x0 + CW - 2; c++) { for (rr = cl.y0 + 1; rr < cl.wl; rr++) tiles[c * rows + rr] = T.AIR; for (rr = cl.wl; rr < cgt[c]; rr++) wet(c, rr); }
  });
  tl.forEach(function (e) { if (e[0] >= 0 && e[0] < W && e[1] >= 0 && e[1] < rows) tiles[e[0] * rows + e[1]] = e[2]; });
  var tAt = function (c2, r2) { return c2 < 0 || c2 >= W || r2 < 0 || r2 >= rows ? T.SOLID : tiles[c2 * rows + r2]; };
  // creatures whose sweep leaves the water (rocks, pits) are dropped
  enemies = enemies.filter(function (e) {
    var xs, ys;
    if (e.t === E.SWIM || e.t === E.WHALE) { xs = [e.ax - e.rg, e.ax + e.rg, e.ax]; ys = [e.ay - (e.am || 3), e.ay + (e.am || 3)]; if (e.t === E.WHALE) xs = [e.ax - e.rg + 4, e.ax + e.rg + e.w - 4]; }
    else if (e.t === E.CHASER) { xs = [e.ax]; ys = [e.ay]; } else if (e.t === E.FMINE) { xs = [e.ax]; ys = [e.ay - e.am, e.ay + e.am]; } else if (e.t === E.JELLY) { xs = [e.ax - 14, e.ax + 14]; ys = [e.ay - 8, e.ay + 8]; } else return true;
    return xs.every(function (x) { return ys.every(function (y) { return wetTile(tAt(Math.floor((x + e.w / 2) / TS), Math.floor((y + e.h / 2) / TS))); }); });
  });
  // a flat, dry-of-features standing spot on a chamber floor, searched outward from the chamber centre
  var stand = function (cl) {
    for (var hm = 1; hm >= 0; hm--) for (var d = 0; d < CW; d++) for (var sg = -1; sg <= 1; sg += 2) { var c2 = cl.x0 + (CW >> 1) + sg * d; if (c2 < cl.x0 + 3 || c2 > cl.x0 + CW - 4 || inHole(cl, c2, hm)) continue;
      var okc = true; for (var dc = -1; dc <= 1; dc++) if (tAt(c2 + dc, cl.f0) !== T.SOLID || tAt(c2 + dc, cl.f0 - 1) !== T.WATER) okc = false; if (okc) return c2; }
    return cl.x0 + (CW >> 1);
  };
  var sc = stand(cells[0]), gc = stand(cells[ncell - 1]), mc = stand(cells[ncell >> 1]);
  // air pockets: one in the middle of every chamber between start and goal, on the swim route, on open water
  var pts = [{ x: sc * TS + 8, y: cells[0].f0 * TS - 20 }];
  for (k = 1; k < ncell; k++) {
    // approach point 5 tiles before the opening in the previous chamber (guides the search around floors / ceilings), then the opening itself
    var lk = links[k], vert = cells[k - 1].y0 !== cells[k].y0, ap = vert ? { x: lk.x, y: lk.y + (cells[k].y0 < cells[k - 1].y0 ? 5 : -5) * TS } : { x: lk.x - (cells[k].x0 > cells[k - 1].x0 ? 5 : -5) * TS, y: lk.y };
    var apOk = tAt(Math.floor(ap.x / TS), Math.floor(ap.y / TS)) === T.WATER && tAt(Math.floor(ap.x / TS) + 1, Math.floor(ap.y / TS)) === T.WATER && tAt(Math.floor(ap.x / TS), Math.floor(ap.y / TS) + 1) === T.WATER;   // open water: an extra air pocket sits here (second one of the chamber)
    route.push({ k: 'near', x: ap.x, y: ap.y, r: apOk ? 9 : 16, door: 1 }); pts.push(ap); if (apOk) pockets.push({ x: ap.x, y: ap.y });
    route.push({ k: 'near', x: links[k].x, y: links[k].y, r: 16, door: 1 }); pts.push(links[k]);
    if (k < ncell - 1) {
      var mx = (links[k].x + links[k + 1].x) / 2, my = (links[k].y + links[k + 1].y) / 2, best = null;
      for (var ring = 0; ring < 8 && !best; ring++) for (var dy = -ring; dy <= ring && !best; dy++) for (var dx = -ring; dx <= ring && !best; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue; var pc = Math.floor(mx / TS) + dx, pr = Math.floor(my / TS) + dy, ok3 = true;
        for (var ex = -1; ex <= 1; ex++) for (var ey = -1; ey <= 1; ey++) if (tAt(pc + ex, pr + ey) !== T.WATER) ok3 = false;
        if (ok3) best = { x: pc * TS + 8, y: pr * TS + 8 };
      }
      if (!best) best = { x: mx, y: my };
      pockets.push({ x: best.x, y: best.y }); route.push({ k: 'near', x: best.x, y: best.y, r: 9, door: 1 }); pts.push(best);
    }
  }
  var gx = gc * TS + 8, gy = cells[ncell - 1].f0 * TS; pts.push({ x: gx, y: gy - 20 });
  route.push({ k: 'goal', x: gx, y: gy - 10 });
  // natural cave shaping (see deepNatural): keeps the start / checkpoint / goal standing spots and everything on the route open
  var spots = [[sc, cells[0].f0], [mc, cells[ncell >> 1].f0], [gc, cells[ncell - 1].f0]].map(function (s) { return { c0: s[0] - 4, c1: s[0] + 4, r0: s[1] - 6, r1: s[1] - 1 }; });
  var natCave = deepNatural({ w: W, rows: rows, tiles: tiles, pockets: pockets, winds: winds, whirls: whirls }, pts, spots, tl, { r: r, enemies: enemies });
  // coins along the route, five specials spread over the chambers
  for (k = 1; k < pts.length; k++) { var p0 = pts[k - 1], p1 = pts[k], dl = Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)), nc = Math.floor(dl / 48);
    for (q = 1; q < nc; q++) { var cxp = p0.x + (p1.x - p0.x) * q / nc, cyp = p0.y + (p1.y - p0.y) * q / nc; if (tAt(Math.floor(cxp / TS), Math.floor(cyp / TS)) === T.WATER) coins.push({ x: cxp, y: cyp, b: 0 }); } }

  for (i = 0; i < 5; i++) { var sp = links[1 + Math.floor((i + 0.5) * (ncell - 1) / 5)]; specials.push({ x: sp.x, y: sp.y - 28 }); }
  var L = { seed: seed, n: n, kind: 'deep', attempt: a, diff: diff, w: W, rows: rows, tiles: tiles, grp: new Uint8Array(W * rows), gt: new Array(W).fill(rows - 2), coins: coins, special: specials, enemies: enemies, movers: [], cannons: [], rings: [], winds: winds, pockets: pockets,
    keys: [], doors: [], switches: [], tele: [], launch: [], route: route, puzzle: true, vertical: true, swimNodes: true, shape: shape, natural: natCave, goalRect: { x: gx - 8, y: gy - 4 * TS, w: 16, h: 4 * TS }, goalX: gx, poleCol: gc, poleY: gy,
    start: { x: sc * TS + 2, y: cells[0].f0 * TS - P.SH }, cp: { x: mc * TS + 2, y: cells[ncell >> 1].f0 * TS - P.SH }, time: 300 + ncell * 50, theme: 3, themeList: [3, 3, 3, 13, 5, 7, 10, 22], room: false, hasBoss: false, kindAsked: 'deep', hasFire: false, hasIce: false, hasMud: false };
  if (whirls.length) L.whirls = whirls;
  pruneWet(L);   // creatures and air pockets that ended up outside the water (the sea is crowded now) are dropped
  return L;
}
function buildDeep(seed, n, a, o) {
  var shp = deepShape(seed, n, a, o); if (shp !== 'horiz') return buildDeepTall(seed, n, a, shp);
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 211)), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, wl = 4, FL = 12, W = 150 + Math.round(diff * 70) + rnd(0, 20), c, i, q;
  var gt = [], tl = [], enemies = [], coins = [], winds = [], whirls = [], pockets = [], specials = [], route = [], ids = 0;
  // layout: a dry ledge at each end, steps down into the water (wl = water line row) and a seabed in between
  var LEDGE = 10; for (c = 0; c < LEDGE; c++) gt.push(wl);
  var fb = 11; for (var sd = wl + 1; sd <= fb; sd++) { gt.push(sd); gt.push(sd); }
  var c1 = W - LEDGE - 2 * (fb - wl);
  // seabed: slow random walk of the floor height, every column within [9, 12]
  var tgt = fb, cur = fb; while (gt.length < c1) { if (r() < 0.22) tgt = rnd(9, 12); var run = rnd(2, 4); for (q = 0; q < run && gt.length < c1; q++) { if (cur < tgt) cur++; else if (cur > tgt) cur--; gt.push(cur); } }
  for (var su = fb; su >= wl + 1; su--) { gt.push(su); gt.push(su); }
  for (c = 0; c < LEDGE; c++) gt.push(wl);
  W = gt.length; var base = gt.slice(), cs = LEDGE + 2 * (fb - wl) + 4, ce = W - LEDGE - 2 * (fb - wl) - 4;
  var X = { r: r, rnd: rnd, nn: nn, diff: diff, tl: tl, enemies: enemies, winds: winds, whirls: whirls, ids: 0, W: W, occ: {}, loB: -1e9, hiB: 1e9 };
  var cx; deepFeatures(X, cs, ce, wl, gt);
  deepCreatures(X, cs, ce, wl, gt, true);
  // a trail of coins through the water, air bubbles now and then, the five specials
  for (cx = cs; cx < ce; cx += 3) coins.push({ x: cx * TS + 8, y: (wl + 3 + 1.5 * Math.sin(cx * 0.3)) * TS, b: 0 });
  for (cx = cs + 10; cx < ce; cx += 24) pockets.push({ x: cx * TS + 8, y: (wl + 4) * TS });
  for (i = 0; i < 5; i++) specials.push({ x: (cs + Math.floor((i + 0.5) * (ce - cs) / 5)) * TS, y: (wl + 4) * TS });
  // a crossing stage every 24 columns gives the validator intermediate targets
  for (cx = cs + 20; cx < ce; cx += 24) route.push({ k: 'xge', x: cx * TS, y: (wl + 3) * TS });
  var poleCol = W - 6; route.push({ k: 'goal', x: poleCol * TS + 6, y: null });
  var tiles = new Uint8Array(W * ROWS), grp = new Uint8Array(W * ROWS);
  for (c = 0; c < W; c++) for (var rr = gt[c]; rr < ROWS; rr++) tiles[c * ROWS + rr] = T.SOLID;
  // fill water from the water line down to the seabed between the ledges
  for (c = LEDGE; c < W - LEDGE; c++) for (rr = wl; rr < gt[c]; rr++) tiles[c * ROWS + rr] = T.WATER;
  tl.forEach(function (e) { if (e[0] >= 0 && e[0] < W && e[1] >= 0 && e[1] < ROWS) tiles[e[0] * ROWS + e[1]] = e[2]; });
  var mid = Math.floor(W / 2), L = { seed: seed, n: n, kind: 'deep', attempt: a, diff: diff, w: W, tiles: tiles, grp: grp, gt: gt, coins: coins, special: specials, enemies: enemies, movers: [], cannons: [], rings: [], winds: winds, pockets: pockets,
    keys: [], doors: [], switches: [], tele: [], launch: [], route: route, goalX: poleCol * TS + 6, poleCol: poleCol, poleY: wl * TS, start: { x: 3 * TS + 2, y: wl * TS - P.SH }, cp: { x: mid * TS + 2, y: gt[mid] * TS - P.SH },
    time: 300 + Math.floor(W * 0.8), theme: 3, themeList: [3, 3, 3, 13, 5, 7, 10, 22], room: false, hasBoss: false, kindAsked: 'deep', hasFire: false, hasIce: false, hasMud: false };
  if (whirls.length) L.whirls = whirls;
  pruneWet(L);   // creatures and air pockets that ended up outside the water (the sea is crowded now) are dropped
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
  // draw 14 room graphs and keep the one with the longest path
  for (var gtry = 0; gtry < 14; gtry++) { mkGraph(); var dm = dia(); if (!best || dm > best.dm) best = { dm: dm, deg: deg, adj: adj, edges: edges }; }   // the door graph with the longest route
  deg = best.deg; adj = best.adj; edges = best.edges;
  function bfs(s0) { var ds = {}, q = [s0], fr = s0, pv = {}; ds[s0] = 0; while (q.length) { var x = q.shift(); if (ds[x] > ds[fr]) fr = x; adj[x].forEach(function (y) { if (ds[y] === undefined) { ds[y] = ds[x] + 1; pv[y] = x; q.push(y); } }); } return { far: fr, prev: pv }; }
  // start and goal rooms are the two far ends of the tree; path is the solution corridor, rooms off it are decoys
  var s = bfs(0).far, bb = bfs(s), goalRoom = bb.far, path = [goalRoom]; while (path[0] !== s) path.unshift(bb.prev[path[0]]);
  // doors: slot offsets inside a room (ledge centres)
  var SL = [1, 4, 7], used = []; for (i = 0; i < R; i++) used.push(0);
  var tele = [], coins = [], enemies = [], specials = [], door = {};
  // each edge becomes a pair of linked teleport doors on ledges (two-way); sa / sb choose one of three slots in each room
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
  // route: one door crossing per step along the path (and back-steps where a wrong door is needed)
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
  // F floors stacked bottom to top; RF(f) is the row of floor f, stairs alternate between the right and left end
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
      // sprinkle spikes, walkers and flyers on the floor away from the stair ends
      var rv = r(); if (rv < 0.05 + 0.08 * diff) put(c, rf - 1, T.SPIKE); else if (rv < 0.09 + 0.05 * diff && c % 3 === 0) enemies.push({ t: E.WALKER, x: c * TS, y: rf * TS - 12, w: 12, h: 12, spd: 0.4 + 0.3 * r(), dir: r() < 0.5 ? -1 : 1, mn: (c - 3) * TS, mx: (c + 4) * TS });
      else if (rv < 0.12 + 0.05 * diff && c % 7 === 0 && f > 0) enemies.push({ t: E.FLYER, x: c * TS, y: (rf - 4) * TS, w: 14, h: 10, ax: c * TS, ay: (rf - 4) * TS, rg: 30, sp: 1 / 240, ph: r(), am: 8, spd: 0 }); }
    for (c = 4; c < W - 4; c += 5) if (!inGap(c) && tiles[c * rows + rf - 1] === 0 && r() < 0.6) { coins.push({ x: c * TS + 8, y: (rf - 1.5) * TS, b: 0 }); coins.push({ x: (c + 1) * TS + 8, y: (rf - 1.5) * TS, b: 0 }); }
    if (specials.length < 5 && f > 0 && r() < 0.7) specials.push({ x: Math.floor(W / 2 + rnd(-8, 8)) * TS, y: (rf - 3) * TS });
    // stairs up to the next floor, at the right end after even floors, at the left end after odd floors
    if (f < F - 1) {
      // stair shaft: a hole in the next floor plus ledges rising to it at the wall side
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
    // waypoints every 12 columns in the walking direction, nudged onto solid ground
    var seq = []; if (goingRight) for (c = lo; c <= hi; c += step) seq.push(c); else for (c = hi; c >= lo; c -= step) seq.push(c);
    seq.forEach(function (cw) { var cx = cw; for (var tries = 0; tries < 6; tries++) { var okc = tiles[cx * rows + rfw] === T.SOLID && tiles[(cx - 1) * rows + rfw] === T.SOLID && tiles[(cx + 1) * rows + rfw] === T.SOLID && tiles[cx * rows + rfw - 1] === 0; if (okc) break; cx += goingRight ? 1 : -1; } if (f === F - 1 && ((goingRight && cw >= hi - 1) || (!goingRight && cw <= lo + 1))) return; wps.push({ k: 'at', x: cx * TS + 8, y: rfw * TS - 7 }); });
    if (f < F - 1) {
      var rt = f % 2 === 0, mcc = function (cc) { return rt ? W - 2 - cc : 1 + cc; }, rf3 = RF(f);
      for (var s2 = 2; s2 >= 0; s2--) { var rowS2 = rf3 - 6 + s2 * 2, a0 = s2 === 0 ? 1 : 2 * s2 + 4, a1 = s2 === 0 ? 2 : 2 * s2 + 5; wps.push({ k: 'at', x: (mcc(a0) + mcc(a1) + 1) / 2 * TS, y: rowS2 * TS - 7 }); }
      wps.push({ k: 'at', x: (mcc(6)) * TS + 8, y: RF(f + 1) * TS - 7 });
    }
  }
  // the goal on the top floor, at the end the last stair does not use
  var topF = F - 1, gRight = topF % 2 === 0, gxc = gRight ? W - 8 : 8, gx = gxc * TS, gy = RF(topF) * TS;
  var cpf = Math.floor(F / 2), cp = { x: Math.floor(W / 2) * TS + 2, y: RF(cpf) * TS - P.SH };
  while (specials.length < 5) specials.push({ x: rnd(10, W - 10) * TS, y: (RF(rnd(0, F - 1)) - 3) * TS });
  return { seed: seed, n: n, kind: 'zigzag', attempt: a, diff: diff, w: W, rows: rows, tiles: tiles, gt: new Array(W).fill(rows - 2), coins: coins, special: specials, enemies: enemies, movers: [], cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * rows),
    route: wps.concat([{ k: 'goal', x: gx, y: gy - 10 }]), puzzle: true, vertical: true, goalRect: { x: gx - 8, y: gy - 4 * TS, w: 16, h: 4 * TS }, goalX: gx, poleCol: Math.floor(gx / TS), poleY: gy,
    start: start, cp: cp, time: 260 + F * 60, theme: 15, room: false, hasBoss: false, kindAsked: 'zigzag', hasFire: false, hasIce: false, hasMud: false };
}
// rising-lava tower: the vertical climb with lava flooding up from below (auto-scroll upward; the pace is tuned to the solver in generate())
function buildLavaTower(seed, n, a) {
  // the same tower as buildVertical plus a rising lava level; generate() tunes its speed to the solver's frame count
  var L = buildVertical(seed, n, a, 'tower'); L.kind = 'lavatower'; L.kindAsked = 'lavatower'; L.rise = { y0: L.rows * TS + 40, v: 0.01, delay: 200 };
  L.time = 400; return L;
}
// ------------------------------------------------------------------ vertical levels: a tower to climb (goal at the top) and a deep shaft to descend (goal pad at the bottom, lava below)
function buildVertical(seed, n, a, kind) {
  var nn = effN(n), r = rng(hash(seed, n, a * 7919 + 11)), lim = probe(), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }, W = 26, up = kind === 'tower';
  // number of platforms and their row steps seq[]: a tower rises by up to the probe's jump height, a shaft drops 3-6 rows per floor
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
      // place each platform on alternating sides of the previous one, retrying until it fits between the walls
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
  // goal on the last platform (the landing pad in a shaft)
  var last = prev, gx = (last.c + Math.floor(last.len / 2)) * TS, gy = last.row * TS, specials = [];
  for (i = 0; i < 5; i++) { var pp = plats[Math.min(plats.length - 1, Math.floor((i + 0.5) * plats.length / 5))]; specials.push({ x: (pp.c + 2) * TS, y: (pp.row - 3) * TS }); }
  var start = up ? { x: 4 * TS + 2, y: fb * TS - P.SH } : { x: (plats[0].c + 2) * TS, y: plats[0].row * TS - P.SH };
  var mp = plats[Math.floor(plats.length / 2)], gtv = []; for (c = 0; c < W; c++) gtv.push(up ? fb : fb + 1);
  var L = { seed: seed, n: n, kind: kind, attempt: a, diff: diff, w: W, rows: rows, tiles: tiles, gt: gtv, coins: coins, special: specials, enemies: enemies, movers: movers, cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * rows),
    route: (up ? plats.slice(0, -1).filter(function (p) { return !p.pad; }).map(function (p) { return { k: 'at', x: (p.c + 1.5) * TS, y: p.row * TS - 7 }; }) : wps).concat([{ k: 'goal', x: gx, y: gy - 10 }]), puzzle: true, vertical: true, goalRect: { x: gx - 8, y: gy - 4 * TS, w: 16, h: 4 * TS }, goalX: gx, poleCol: Math.floor(gx / TS), poleY: gy,
    start: start, cp: { x: (mp.c + 1) * TS, y: mp.row * TS - P.SH }, time: 150 + Math.floor(rows * 2.5), theme: KIND_THEME[kind], room: false, hasBoss: false, kindAsked: kind, hasFire: false, hasIce: false, hasMud: false };
  return L;
}

// ------------------------------------------------------------------ chain castles: the castle as a chain of ledges and moving platforms that runs left, up, down, diagonally or in a winding path, ending in the boss arena (no flag: the stage ends with the boss)
// shape: 'horiz' = the classic side-scroller (buildRaw), 'left' = flat chain scrolling left, 'up' / 'down' = a tower to climb / a keep to descend, 'diag' = a staircase of ledges (either handedness), 'wind' = up, sideways, down ...
function castleShape(seed, n, o) {
  if (o.shape) return o.shape; if (o.vert === true) return 'up'; if (o.vert === false) return 'horiz';
  var v = hash(seed, n, 7001) % 100;
  return v < 25 ? 'horiz' : v < 40 ? 'left' : v < 55 ? 'up' : v < 70 ? 'down' : v < 85 ? 'diag' : 'wind';
}
function buildCastleChain(seed, n, a, o, shape) {
  var nn = effN(n), lim = probe(), diff = Math.min(1, (nn - 1) / 18); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3;
  var sc = Math.min(1, (nn - 1) / 30), r, rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  var hx = shape === 'left' ? -1 : (hash(seed, n, 7002) % 2 ? 1 : -1), upFirst = hash(seed, n, 7003) % 2 === 0;
  var maxRise = Math.max(2, Math.min(3, lim.up - 1)), AL = 26, i, c, rr, G0 = null;
  var occ, ledges, movers, bandX0, bandX1, bd, lastSpec, BAND = 44;   // BAND: width of the zig-zag corridor of the tower shapes (wide enough for an orbit ring plus the ledge after it)
  function isFree(c0, c1, r0, r1, solidOnly) { for (var cc = c0; cc <= c1; cc++) for (var r2 = r0; r2 <= r1; r2++) { var ov = occ[cc + ',' + r2]; if (ov === 1 || (ov && !solidOnly)) return false; } return true; }   // occ: 1 = ledge cell, 2 = reserved for a moving platform
  function mark(c0, c1, r0, r1, v) { for (var cc = c0; cc <= c1; cc++) for (var r2 = r0; r2 <= r1; r2++) occ[cc + ',' + r2] = v || 1; }
  // a ledge fits if no other ledge touches it or its head room (4 rows above) and no moving-platform zone overlaps it
  function fits(cc, len, row) { return isFree(cc - 1, cc + len, row - 4, row + 5, true) && isFree(cc, cc + len - 1, row, row + 1); }
  function addLedge(cc, len, row, dd) { mark(cc, cc + len - 1, row, row + 1); var lg = { c: cc, len: len, row: row, dd: dd || 1 }; ledges.push(lg); return lg; }
  function gapFor(dy) { return dy < 0 ? (dy <= -3 ? 1 : dy === -2 ? 2 : 3) : 4; }   // widest edge gap a plain hop covers for that height change
  // next plain ledge: dy rows up (negative) / down, to the side the chain runs (bounce: inside the band, flipping at its edges)
  function stepLedge(P, dy, bounce) {
    for (var t = 0; t < 14; t++) {
      var len = rnd(4, 7), g = rnd(1, gapFor(dy)), dd = bounce ? bd : hx, cc = dd > 0 ? P.c + P.len + g : P.c - g - len;
      if (bounce && (cc < bandX0 || cc + len > bandX1)) { bd = -bd; dd = bd; cc = dd > 0 ? P.c + P.len + g : P.c - g - len; if (cc < bandX0 || cc + len > bandX1) continue; }
      var row = P.row + dy; if (fits(cc, len, row)) return addLedge(cc, len, row, dd);
      if (t % 3 === 2) dy = dy < 0 ? -rnd(2, maxRise) : dy > 0 ? rnd(2, 4) : dy;
    }
    return null;
  }
  // a special link: a lift, a moving bridge over a gap too wide to jump, or stepping stones that crumble / blink
  function special(P, bounce, upLeg) {
    var dd = bounce ? bd : hx, opts = ['h0', 'h15', 'crumble', 'blink', 'h19', 'orb', 'ring', 'ring', 'ring', 'ring', 'ring', 'ring', 'ring', 'ring2', 'ring2', 'ring2', 'ring2']; if (upLeg) opts.push('lift', 'lift');    var typ = opts[Math.floor(r() * opts.length)], lenB = rnd(4, 5), xa, bc, G, y0 = P.row * TS, gx, gw;
    // orbit ring: 3 blocks circling the middle of the gap (ring2: two smaller rings side by side over a wider gap), the hero rides one round and steps off on the far ledge
    if (typ === 'ring' || typ === 'ring2') {
      var nr = typ === 'ring2' ? 2 : 1, Rr, rh;
      G = nr === 2 ? rnd(12, 14) : rnd(7, 10); Rr = G * TS / (2 * nr) - 18; rh = Math.ceil(Rr / TS) + 1; xa = dd > 0 ? P.c + P.len : P.c - G; bc = dd > 0 ? xa + G : xa - lenB;
      if (bounce && (bc < bandX0 || bc + lenB > bandX1)) return null;
      if (!isFree(xa, xa + G - 1, P.row - rh, P.row + rh) || !fits(bc, lenB, P.row)) return null;
      mark(xa, xa + G - 1, P.row - rh, P.row + rh, 2); gx = xa * TS; gw = G * TS;
      for (var kr = 0; kr < nr; kr++) for (var qr = 0; qr < 3; qr++) movers.push({ kind: 2, cx: gx + gw * (2 * kr + 1) / (2 * nr), y: y0, w: 32, amp: Rr, per: 480, ph: qr * 2 * Math.PI / 3 + kr * Math.PI / 3 });
      return addLedge(bc, lenB, P.row, dd);
    }
    if (typ === 'lift') {
      var h = lim.up + rnd(2, 3), sw = 4, s0 = dd > 0 ? P.c + P.len : P.c - sw, brow = P.row - h; bc = dd > 0 ? s0 + sw : s0 - lenB;
      if (bounce && (bc < bandX0 || bc + lenB > bandX1)) return null;
      if (!isFree(s0, s0 + sw - 1, brow - 2, P.row + 1) || !fits(bc, lenB, brow)) return null;
      mark(s0, s0 + sw - 1, brow - 1, P.row + 1, 2);
      movers.push({ kind: 1, cx: (s0 + sw / 2) * TS, y: (P.row + brow) / 2 * TS, w: 40, amp: h * TS / 2, per: [360, 480][rnd(0, 1)], ph: 0 });
      return addLedge(bc, lenB, brow, dd);
    }
    G = (typ === 'crumble' || typ === 'blink') ? 8 : 9; xa = dd > 0 ? P.c + P.len : P.c - G; bc = dd > 0 ? xa + G : xa - lenB;
    if (bounce && (bc < bandX0 || bc + lenB > bandX1)) return null;
    if (!isFree(xa, xa + G - 1, P.row - 2, P.row + 1) || !fits(bc, lenB, P.row)) return null;
    mark(xa, xa + G - 1, P.row - 1, P.row + 1, 2); gx = xa * TS; gw = G * TS;
    if (typ === 'h0') movers.push({ kind: 0, cx: gx + gw / 2, y: y0, w: 48, amp: gw / 2 - 12, per: [240, 360, 480][rnd(0, 2)], ph: 0 });
    else if (typ === 'h15') movers.push({ kind: 15, cx: gx + gw / 2, y: y0, w: 44, amp: gw / 2 - 26, per: [300, 420][rnd(0, 1)], ph: 0 });
    else if (typ === 'h19') for (i = 0; i < 2; i++) movers.push({ kind: 19, x0: gx - 20, span: gw + 40, sp: 0.55, ph: i * (gw + 40) / 2, y: y0, w: 36, cx: gx + gw / 2 });
    else if (typ === 'orb') for (i = 0; i < 2; i++) movers.push({ kind: 2, cx: gx + gw * (i + 1) / 3, y: y0 - 6, w: 36, amp: 18 + r() * 8, per: 300, ph: i * Math.PI });
    else for (i = 0; i < 2; i++) { var scx = gx + (2.5 + 3 * i) * TS; movers.push(typ === 'crumble' ? { kind: 3, cx: scx, y: y0, w: 32, amp: 0, per: 300, ph: 0 } : { kind: 4, cx: scx, y: y0, w: 30, amp: 0, per: 300 + 60 * i, ph: i * 1.7 }); }
    return addLedge(bc, lenB, P.row, dd);
  }
  // one whole layout attempt: returns { E, ... } or null
  function layout(att) {
    r = rng(hash(seed, n, a * 7919 + 71 + att * 131)); occ = {}; ledges = []; movers = []; bd = hx; lastSpec = 0; bandX0 = 0; bandX1 = BAND;
    var S, cur, first = upFirst ? -1 : 1, legs, N = Math.round(11 + 9 * sc + r() * 2), step = 0;
    if (shape === 'up' || (shape === 'wind' && upFirst)) { S = { c: 0, len: 34, row: 0, dd: 1, floor: true }; ledges.push(S); cur = { c: 6, len: 3, row: 0 }; }
    else { S = addLedge(13, 8, 0, 1); cur = S; }
    if (shape === 'up') legs = [['b', -1, N + 2]]; else if (shape === 'down') legs = [['b', 1, N]];
    else if (shape === 'left') legs = [['r', 0, N + 8]]; else if (shape === 'diag') legs = [['r', first, N + 3]];
    else { var m = 6 + Math.round(4 * sc); legs = [['b', first, m], ['r', 0, 6], ['b', -first, m], ['r', 0, 6], ['b', first, m]]; }
    var lastDy = legs[legs.length - 1][1]; legs.push(['r', lastDy, 2]);
    for (var li = 0; li < legs.length; li++) {
      var lg0 = legs[li], bounce = lg0[0] === 'b', dir = lg0[1];
      if (bounce && li > 0) { if (hx > 0) { bandX0 = cur.c - 2; bandX1 = bandX0 + BAND; } else { bandX1 = cur.c + cur.len + 2; bandX0 = bandX1 - BAND; } bd = hx; }
      for (var k = 0; k < lg0[2]; k++) {
        var B = null, pSpec = 0.55 + 0.2 * diff + 0.1 * sc, last = (li === legs.length - 1);
        if (!last && step >= 2 && k < lg0[2] - 1 && (r() < pSpec || step - lastSpec >= 3)) { for (var sp5 = 0; sp5 < 5 && !B; sp5++) B = special(cur, bounce, dir < 0); if (B) lastSpec = step; }   // (a link that does not fit is redrawn: orbit rings are the main link)
        if (!B) { var dy = dir < 0 ? -rnd(2, maxRise) : dir > 0 ? rnd(2, 4) : [0, 0, 0, -1, 1][rnd(0, 4)]; if (shape === 'left' && dy !== 0) dy = r() < 0.5 ? 0 : dy; B = stepLedge(cur, dy, bounce); }
        if (!B) return null; cur = B; step++;
      }
    }
    // the arena: a flat floor continuing from the last ledge in the running direction, with a run-up before it
    var E = cur, fl0, fl1, ac0;
    if (hx > 0) { fl0 = E.c + E.len; ac0 = fl0 + 6; fl1 = ac0 + AL + 1; } else { fl1 = E.c - 1; ac0 = fl1 - 6 - AL; fl0 = ac0 - 2; }
    if (!isFree(fl0, fl1, E.row - 13, E.row + 4)) return null;
    return { S: S, E: E, fl0: fl0, fl1: fl1, ac0: ac0, steps: step };
  }
  var lay = null; for (var att = 0; att < 150 && !lay; att++) lay = layout(att);
  if (!lay) return buildRaw(seed, n, a, (function () { var o2 = {}; for (var k2 in o) o2[k2] = o[k2]; o2.shape = 'horiz'; return o2; })());
  // ---- bounds and shift into level coordinates (a wall column on both sides, two free rows on top, a pit margin below)
  var minC = 1e9, maxC = -1e9, minR = 1e9, maxR = -1e9, EL = lay.E, S = lay.S;
  ledges.forEach(function (lg) { minC = Math.min(minC, lg.c); maxC = Math.max(maxC, lg.c + lg.len - 1); minR = Math.min(minR, lg.row - 4); maxR = Math.max(maxR, lg.row + 1); });
  minC = Math.min(minC, lay.fl0); maxC = Math.max(maxC, lay.fl1); minR = Math.min(minR, EL.row - 13); maxR = Math.max(maxR, EL.row + 2);
  movers.forEach(function (m) { var x0 = m.kind === 19 ? m.x0 : m.cx - (m.amp || 0) - m.w, x1 = m.kind === 19 ? m.x0 + m.span : m.cx + (m.amp || 0) + m.w; minC = Math.min(minC, Math.floor(x0 / TS)); maxC = Math.max(maxC, Math.ceil(x1 / TS)); });
  var dX = 3 - minC, dY = 2 - minR, W = maxC - minC + 1 + 6, rows = maxR - minR + 1 + 2 + 6, tiles = new Uint8Array(W * rows);
  function put(cc, r2, t) { if (cc >= 0 && cc < W && r2 >= 0 && r2 < rows) tiles[cc * rows + r2] = t; }
  function at(cc, r2) { return (cc < 0 || cc >= W || r2 < 0 || r2 >= rows) ? 1 : tiles[cc * rows + r2]; }
  ledges.forEach(function (lg) { lg.c += dX; lg.row += dY; });
  movers.forEach(function (m) { if (m.kind === 19) m.x0 += dX * TS; m.cx += dX * TS; m.y += dY * TS; });
  var fl0 = lay.fl0 + dX, fl1 = lay.fl1 + dX, ac0 = lay.ac0 + dX, rE = EL.row;
  for (rr = 0; rr < rows; rr++) { put(0, rr, T.SOLID); put(W - 1, rr, T.SOLID); }
  ledges.forEach(function (lg) { var th = lg.floor ? rows - lg.row : 2; for (c = lg.c; c < lg.c + lg.len; c++) for (rr = lg.row; rr < Math.min(rows, lg.row + th); rr++) put(c, rr, T.SOLID); });
  for (rr = 0; rr < rows; rr++) put(hx > 0 ? fl1 + 1 : fl0 - 1, rr, T.SOLID);   // the far end of the arena is closed by a wall
  var underLedge = ledges.some(function (lg) { return lg !== EL && lg.row > rE && lg.c <= fl1 && lg.c + lg.len > fl0; }), arD = underLedge ? 3 : rows;   // a deep block under the arena unless the tower climbs past below it
  for (c = fl0; c <= fl1; c++) for (rr = rE; rr < Math.min(rows, rE + arD); rr++) put(c, rr, T.SOLID);
  // ---- the boss, its arena items (same rules as the side-scrolling castle) and the entrance
  var bv = o.boss !== undefined ? o.boss : (n + hash(seed, n, 5)) % 5; if (bv === 3) bv = 0;
  var arCol = function (off) { return hx > 0 ? ac0 + off : ac0 + AL - off; }, bx = arCol(16) * TS, bmn = (ac0 + 1) * TS, bmx = (ac0 + AL - 1) * TS;
  var boss = { t: E.BOSS, v: bv, x: bx, y: rE * TS - 26, w: 28, h: 26, spd: 0, mn: bmn, mx: bmx, ax: bx - 2 * hx * TS, ay: (rE - 4) * TS - 6, dir: -hx };
  boss.t = 8; if (bv === 4) { boss.w = 28; boss.h = 22; boss.ay = (rE - 5) * TS; boss.y = boss.ay; }
  var bossItems = [{ k: 0, x: arCol(-3) * TS + 2, y: rE * TS - 12 }], enemies = [], shellPassF = false;
  var imm = o.bossimm !== undefined ? o.bossimm : ((n + hash(seed, n, 9)) % 3 === 0 ? (hash(seed, n, 10) % 2 ? 'shell' : 'fire') : '');
  if (imm === 'shell' && bv !== 0) imm = 'fire';
  if (imm) {
    boss.imm = 1; boss.immKind = imm;
    if (imm === 'shell') { shellPassF = true; for (var bq = 0; bq < 4; bq++) enemies.push({ t: 3, x: arCol(1 + bq * 2) * TS, y: rE * TS - 13, w: 12, h: 13, spd: 0.4, dir: bq % 2 ? -1 : 1, mn: Math.min(arCol(0), arCol(9)) * TS, mx: Math.max(arCol(0), arCol(9)) * TS }); }
    else [-4, -1, 1, 5, 9, 13, 17, 21].forEach(function (off) { bossItems.push({ k: 1, x: arCol(off) * TS + 2, y: rE * TS - 12 }); });
  }
  // ---- hazards and ground life on the ledges; the waypoints of the route (one per ledge, on the arrival side)
  var route = [], coins = [], cannons = [], wanted = ledges.length;
  ledges.forEach(function (lg, k) {
    var wx = lg.dd > 0 ? lg.c + 1.5 : lg.c + lg.len - 1.5;
    if (k > 0) route.push({ k: 'at', x: wx * TS, y: lg.row * TS - 7, li: k });
    if (k < 2 || lg.floor || k >= ledges.length - 2) return;   // no hazards on the first ledges and none next to the arena
    var wantCan = lg.len >= 6 && r() < 0.18 + 0.25 * diff + 0.1 * sc;
    if (wantCan) { var cc2 = lg.dd > 0 ? lg.c + lg.len - 3 : lg.c + 2, cdir = lg.dd > 0 ? -1 : 1; put(cc2, lg.row - 1, cdir < 0 ? T.CANL : T.CANR); cannons.push({ x: cc2 * TS, y: (lg.row - 1) * TS, dir: cdir, per: 170 + rnd(0, 50), ph: rnd(0, 120) }); }
    else if (lg.len >= 6 && r() < 0.25 + 0.4 * diff) put(lg.c + Math.floor(lg.len / 2), lg.row - 1, T.SPIKE);
    else if (lg.len >= 5 && r() < 0.3 + 0.3 * diff) enemies.push({ t: E.WALKER, x: (lg.c + 1) * TS, y: lg.row * TS - 12, w: 12, h: 12, spd: 0.4 + 0.3 * r(), dir: r() < 0.5 ? -1 : 1, mn: (lg.c + 0.5) * TS, mx: (lg.c + lg.len - 0.5) * TS });
    if (r() < 0.5) for (var q = 0; q < 3; q++) coins.push({ x: (lg.c + lg.len / 2 - 1 + q) * TS + 8, y: (lg.row - 1.5) * TS, b: 0 });
  });
  route.push({ k: hx > 0 ? 'xge' : 'xle', x: (hx > 0 ? ac0 * TS - 24 : (ac0 + AL) * TS + 24), y: rE * TS - 7, door: 1 });   // the arena door: just run in
  // ---- air enemies: roughly 8 at stage 10 up to 24 from stage 60 on, spread evenly over the chain; only a few kinds at first, all of them later
  var nAir = Math.round(8 + 16 * Math.max(0, Math.min(1, (nn - 10) / 50))), pool = ['flyer', 'swoop', 'bird', 'bat'];
  if (nn >= 4) pool.push('gull', 'balloon'); if (nn >= 6) pool.push('hornet'); if (nn >= 8) pool.push('shooter', 'spider'); if (nn >= 12) pool.push('bomber', 'cloud'); if (nn >= 15) pool.push('spark');
  var cand = ledges.slice(1, ledges.length - 2), placed = 0, startPx = { x: (S.c + 3) * TS, y: S.row * TS }, airN = 0;
  function freeBox(cx, ry, hw, hh) { for (var u = cx - hw; u <= cx + hw; u++) for (var v = ry - hh; v <= ry + hh; v++) if (at(u, v)) return false; return true; }
  for (var k3 = 0; k3 < nAir * 3 && placed < nAir; k3++) {
    var lgA = cand[Math.min(cand.length - 1, Math.floor(((k3 % nAir) + r()) / nAir * cand.length))], typ = pool[Math.floor(r() * pool.length)], id = 72000 + k3, ph = r() * 6.28, cx = lgA.c + rnd(0, lgA.len - 1), ry, ax, ay, e = null;
    if (Math.abs(cx * TS - startPx.x) < 90 && Math.abs(lgA.row * TS - startPx.y) < 90) continue;
    if (typ === 'bat' || typ === 'spider') {   // hangs under a ledge
      if (!freeBox(cx, lgA.row + 3, 0, 1) || (typ === 'spider' && !freeBox(cx, lgA.row + 6, 2, 4))) continue; ax = cx * TS + 2;   // a spider's thread must not reach a ledge below
      ay = (lgA.row + 2) * TS + (typ === 'bat' ? 1 : 2);
      e = typ === 'bat' ? { t: E.BAT, w: 12, h: 10, ax0: ax, ay0: ay, y: ay } : { t: E.SPIDER, w: 12, h: 10, ax0: ax, ay0: ay, y: ay + 6, len: 70 };
      e.x = ax; e.ax = ax; e.ph = ph; e.s = 0; e.cd = 0; e.tm = 0; e.pho = k3 * 17 % 100; e.id = id;
    } else {
      ry = lgA.row - rnd(3, 5); if (!freeBox(cx, ry, 2, 1)) { ry = lgA.row - rnd(4, 7); if (!freeBox(cx, ry, 2, 1)) continue; }
      ax = cx * TS; ay = ry * TS;
      if (typ === 'flyer') e = { t: E.FLYER, x: ax, y: ay, w: 14, h: 10, ax: ax, ay: ay, rg: 30 + r() * 24, sp: 1 / (220 + r() * 120), ph: r(), am: 8, spd: 0 };
      else if (typ === 'swoop') e = { t: E.SWOOP, x: ax, y: ay, w: 14, h: 10, ax: ax, ay: ay, ph: r(), spd: 0, dir: 1 };
      else if (typ === 'bird') e = { t: E.BIRD, x: ax, y: ay, w: 14, h: 10, ax: ax, ay: ay, rg: 40 + r() * 20, sp: 1 / (240 + r() * 100), ph: r(), am: 10, carry: 1, spd: 0 };
      else if (typ === 'gull') e = { t: E.GULL, x: ax, y: ay, w: 14, h: 10, ax: ax, ax0: ax, ay0: ay, ph: r(), s: 0, cd: 0, tm: 0, spd: 0, dir: 1 };
      else if (typ === 'balloon') e = { t: E.BALLOON, x: ax, y: ay, w: 16, h: 18, ax: ax, ay: ay, ph: r(), spd: 0 };
      else if (typ === 'shooter') e = { t: E.SHOOTER, x: ax, y: ay, w: 16, h: 14, ax: ax, ay: ay, ph: r(), pho: Math.floor(r() * 130), spd: 0, dir: -1 };
      else if (typ === 'spark') e = { t: E.SPARK, x: ax, y: ay, w: 10, h: 10, ax: ax, x0: ax - 2 * TS, x1: ax + 2 * TS, y0: ay, y1: ay, sp: 1 / 230, ph: r(), spd: 0 };
      else { var hv = k3 * 37 + hash(seed, n, 80 + k3); e = { x: ax, ax: ax, ph: ph, s: 0, cd: 0, tm: 0, pho: hv % 100, id: id, ax0: ax, ay0: ay, y: ay };
        if (typ === 'hornet') { e.t = E.HORNET; e.w = 14; e.h = 10; } else if (typ === 'bomber') { e.t = E.BOMBER; e.w = 20; e.h = 14; e.rg = 50; e.sp = 1 / (260 + hv % 60); e.per = 120 + hv % 60; } else { e.t = E.STORMCLOUD; e.w = 28; e.h = 16; e.per = 150 + hv % 40; } }
    }
    enemies.push(e); placed++;
  }
  enemies.push(boss);
  // ---- collectibles, checkpoint (a ledge at about 55% of the route) and the level record
  var specials = [], goalPx = (hx > 0 ? ac0 + AL - 2 : ac0 + 2) * TS + 6, ci = Math.max(1, Math.round(ledges.length * 0.55)), cl = ledges[Math.min(ledges.length - 2, ci)], cpIdx = route.findIndex(function (w) { return w.li === ledges.indexOf(cl); });
  for (i = 0; i < 5; i++) { var pl = ledges[Math.min(ledges.length - 1, 1 + Math.floor((i + 0.5) * (ledges.length - 1) / 5))]; specials.push({ x: (pl.c + pl.len / 2) * TS, y: (pl.row - 3) * TS }); }
  var vdoor = hx > 0 ? ac0 * TS + 3 * TS : (ac0 + AL) * TS - 3 * TS;
  var L = { items: bossItems, shellPass: shellPassF, egg: null, seed: seed, n: n, kind: 'castle', attempt: a, diff: diff, w: W, rows: rows, tiles: tiles, gt: new Array(W).fill(rows - 2), coins: coins, special: specials, enemies: enemies, movers: movers, cannons: cannons, rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * rows),
    route: route.concat([{ k: 'goal', x: goalPx, y: rE * TS - 10 }]), puzzle: true, vertical: true, chain: shape, goalX: goalPx, poleCol: Math.floor(goalPx / TS), poleY: rE * TS, goalRect: { x: goalPx - 8, y: rE * TS - 4 * TS, w: 16, h: 4 * TS },
    vgoal: { x: vdoor, y: rE * TS - 10 },   // the validator proves the climb up to the arena floor (the boss fight is not part of the enemy-free proof)
    start: { x: (S.c + 3) * TS + 2, y: S.row * TS - P.SH }, cp: { x: (cl.c + cl.len / 2) * TS - 6, y: cl.row * TS - P.SH, stage: cpIdx + 1 }, time: 300, theme: 4, room: false, hasBoss: true, kindAsked: 'castle', hasFire: false, hasIce: false, hasMud: false };
  L.arena = { c0: ac0, c1: ac0 + AL, dir: hx, y0: (rE - 14) * TS, y1: (rE + 3) * TS };
  return L;
}
// Gamble House: a one-shot bonus room. 'item' = one hidden box per power-up kind, 'life' = four boxes holding 1/2/5/10 extra lives; the hero opens exactly one (from below), the rest lock and the exit unlocks
var HOUSE_ITEMS = [0, 1, 2, 4, 6, 7, 8, 10, 11];   // only items whose effect survives the end of the stage (power, shrink, mount, fin, wing): no star, clock or chest
function buildHouse(seed, n, a, o) {
  var r = rng(hash(seed, n, 4401 + a)), type = (o && o.house) || (hash(seed, n, 4400) % 2 ? 'life' : 'item'), rows = ROWS, g = 11, br = g - 4, vals = [], step = type === 'item' ? 3 : 6, i, c;
  if (type === 'item') vals = HOUSE_ITEMS.slice(); else vals = [-1, -2, -5, -10];
  for (i = vals.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = vals[i]; vals[i] = vals[j]; vals[j] = t; }
  var c0 = type === 'item' ? 6 : 8, W = c0 + (vals.length - 1) * step + 12, tiles = new Uint8Array(W * rows), boxItems = {}, cols = [];
  for (c = 0; c < W; c++) for (var q = g; q < rows; q++) tiles[c * rows + q] = T.SOLID;
  for (q = 0; q < rows; q++) { tiles[q] = T.SOLID; tiles[(W - 1) * rows + q] = T.SOLID; }
  for (i = 0; i < vals.length; i++) { c = c0 + i * step; tiles[c * rows + br] = T.QP; boxItems[c + ',' + br] = vals[i]; cols.push(c); }
  var pick = Math.floor(r() * vals.length), gc = W - 5, gx = gc * TS + 8, gy = g * TS;
  var L = { seed: seed, n: n, kind: 'house', house: type, attempt: a, diff: 0, w: W, rows: rows, tiles: tiles, gt: (function () { var o2 = []; for (var k = 0; k < W; k++) o2.push(g); return o2; })(), coins: [], special: [], enemies: [], movers: [], cannons: [], rings: [], winds: [], pockets: [], keys: [], doors: [], switches: [], tele: [], launch: [], grp: new Uint8Array(W * rows),
    items: type === 'item' ? [{ k: 0, x: 5 * TS + 2, y: g * TS - 12 }] : [], boxItems: boxItems, route: [{ k: 'used', c: cols[pick], r: br, x: cols[pick] * TS + 8, y: gy - 7 }].concat(type === 'item' ? [{ k: 'got', x: cols[pick] * TS + 8 + 36, y: gy - 7 }] : []).concat([{ k: 'goal', x: gx, y: gy - 10 }]), puzzle: true, exitBtn: 1, goalRect: { x: gx - 12, w: 24, y: gy - 30, h: 30 }, goalX: gx, poleCol: gc, poleY: gy,
    start: { x: 3 * TS + 2, y: gy - P.SH }, cp: { x: (W - 1) * TS, y: gy - P.SH }, time: 90, theme: [0, 1, 6][hash(seed, n, 4402) % 3], themeList: [0, 1, 6], room: false, hasBoss: false, kindAsked: 'house', hasFire: false, hasIce: false, hasMud: false };
  return L;
}
function roomLevel(seed, n, secret) {
  var L = null;
  // the secret exit's sub-map is a longer sky or underground course (underground: a ceiling of rock and a cave look), ending in the secret exit
  var ugRoom = secret && hash(seed, n, 6100) % 2 === 1, ugTheme = [23, 26, 27][hash(seed, n, 6101) % 3];
  for (var a = 0; a < 10; a++) { L = build(seed, n + 500 + a, a, { room: true, kind: 'plain', roomW: secret ? 92 : 46 }); L.theme = secret ? (ugRoom ? ugTheme : 31) : 1; if (ugRoom) { var RR = L.rows || ROWS; for (var uc = 0; uc < L.w; uc++) for (var ur = 0; ur < 2; ur++) L.tiles[uc * RR + ur] = T.SOLID; } L.enemies = []; L.rings = []; L.special = []; L.cannons = []; L.exitKind = secret ? 'secret' : 'ret'; var v = validate(L); if (v.ok) { L.valid = true; L.script = v.script; return L; } }
  L.valid = false; return L;
}
// entry point: up to 16 build attempts, each must pass validate -> replay -> checkContainment; the time budget and the boss-less fallback keep it from stalling
// time limit (seconds): the fastest known clear (the validated script) + 30%, times a multiplier that is 2x at level 1 and falls toward 1x as the levels go on (1 + 1/(1 + (n-1)/8)), rounded UP to a multiple of 50 s; a boss fight is not in the enemy-free script, so castles get +30 s per arena
function levelTime(L, n) {
  var minSec = L.script ? L.script.length / 60 : 20, trav = (Math.abs(L.goalX - L.start.x) + Math.abs((L.poleY || 0) - L.start.y)) / 150; if (trav > minSec && L.goalX < 1e5) minSec = trav;   // a castle's script stops at the arena: never below the walking time (about 150 px per second)
  if (L.vgoal) minSec = minSec * 1.5 + 20;   // chain castles: the auto player loses time to enemies and waits for moving platforms
  if (L.arena) minSec += L.kind === 'bossrush' ? 120 : 60;   // the boss fight is not in the enemy-free script
  var mult = 1 + 1 / (1 + (Math.max(1, n >= 1000 ? 1000 : n) - 1) / 8);
  return Math.max(50, Math.ceil(minSec * 1.3 * mult / 50) * 50);
}
// Loose pickups are the exception: every item that lies on the floor (puzzle segments) is moved into a question block four tiles above its spot,
// (three tiles up under a low ceiling) unless the column is too cramped, puzzle gear and boss-arena items included: the validator / planner bump the block (a small hero keeps a boxed flower as a flower, see sim.js bump); the mount egg becomes a T.QM block
// Castles get rotating maces and swinging flails: flat stretches of floor with five free rows above (away from the start, the goal and the boss arena) get a spiked ball on a chain, a five-ball fire bar or a swinging flail; more of them as the level number grows. They are real hazards only with enemies on, so the validator ignores them
function addCastleMaces(L, seed, n) {
  if (L.kind !== 'castle' || PF.noMace || L.maces && L.maces.length) return;
  var rows = L.rows || ROWS, W = L.w, spots = [], c = 1, r = rng(hash(seed, n, 7301)), want = Math.min(10, 2 + Math.floor(n / 6) + (hash(seed, n, 7302) % 3));
  var ar = L.arena, aLo = ar ? ar.c0 - 4 : W, aHi = ar ? ar.c1 + 4 : W, sx = Math.floor(L.start.x / TS) + 8;
  function top(col) { for (var q = 2; q < rows; q++) if (PF.SOL[L.tiles[col * rows + q]]) return q; return -1; }
  while (c < W - 8) {
    var t0 = top(c), len = 0; if (t0 < (L.vertical ? 5 : 7)) { c++; continue; }
    while (c + len < W && top(c + len) === t0) len++;
    var ok = len >= (L.vertical ? 4 : 6) && c > sx && (c + len < aLo || c > aHi) && !(L.vgoal && Math.abs(c * TS - L.vgoal.x) < 120);
    for (var q = c; ok && q < c + len; q++) for (var rr = t0 - (L.vertical ? 4 : 6); rr < t0; rr++) if (L.tiles[q * rows + rr] !== T.AIR) ok = false;
    if (ok && ar && ar.y0 !== undefined && (t0 * TS < ar.y0 - 40 || t0 * TS > ar.y1 + 40) === false) ok = false;
    if (ok) spots.push({ c: c, len: len, row: t0 });
    c += Math.max(1, len);
  }
  for (var i = spots.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), tmp = spots[i]; spots[i] = spots[j]; spots[j] = tmp; }
  L.maces = []; var used = [];
  for (i = 0; i < spots.length && L.maces.length < want; i++) {
    var sp = spots[i], cx = (sp.c + sp.len / 2) * TS, near = used.some(function (u) { return Math.abs(u - cx) < 7 * TS; }); if (near) continue; used.push(cx);
    var kk = r();
    if (kk < 0.4) L.maces.push({ cx: cx, cy: sp.row * TS - (L.vertical ? 40 : 62), len: L.vertical ? 34 : 54, n: 1, swing: 1.0, per: 200 + Math.floor(r() * 80), ph: r() * 6, w: 0 });   // swinging flail
    else if (kk < 0.75) L.maces.push({ cx: cx, cy: sp.row * TS - (L.vertical ? 26 : 34), len: L.vertical ? 32 : 44, n: 5, per: 340 + Math.floor(r() * 120), ph: r() * 6, dir: r() < 0.5 ? 1 : -1 });   // fire bar
    else L.maces.push({ cx: cx, cy: sp.row * TS - (L.vertical ? 30 : 40), len: L.vertical ? 28 : 34, n: 1, per: 270, ph: r() * 6, dir: r() < 0.5 ? 1 : -1 });   // spiked ball circling on a chain
  }
}
function boxify(L) {
  if (PF.noBox) return;
  if (L.egg && L.kind !== 'house' && L.tiles) {   // the rare mount egg comes out of a mount block (T.QM) four tiles above its spot instead of lying on the floor
    var erows = L.rows || ROWS, ec = Math.floor((L.egg.x + 6) / TS), egr = -1, er;
    for (er = Math.floor((L.egg.y + 6) / TS); er < erows && egr < 0; er++) if (PF.SOL[L.tiles[ec * erows + er]]) egr = er;
    var eok = egr >= 5; for (er = egr - 5; eok && er < egr; er++) if (L.tiles[ec * erows + er] !== T.AIR) eok = false;
    if (eok) { L.tiles[ec * erows + egr - 4] = T.QM; L.egg = null; }
  }
  if (!L.items || !L.items.length || L.kind === 'cannon' || L.kind === 'house') return;
  var rows = L.rows || ROWS, keep = [], fb = L.fixedBox || {};
  for (var i = 0; i < L.items.length; i++) {
    var it = L.items[i], req = false, c = Math.floor((it.x + 6) / TS), r0 = Math.floor((it.y + 6) / TS), gr = -1, rr, ok = true;
    for (rr = r0; rr < rows && gr < 0; rr++) if (PF.SOL[L.tiles[c * rows + rr]]) gr = rr;
    for (var q0 = 0; q0 < (L.route || []).length; q0++) { var rs = L.route[q0]; if (rs.k === 'pw' && Math.abs(rs.x - (it.x + 6)) < 24 && Math.abs(rs.y - (it.y + 6)) < 40) req = true; }   // the route stands on this pickup: puzzle gear stays on the floor
    var br = gr - 4;
    if (gr < 0 || br < 1) ok = false;
    for (rr = br - 1; ok && rr < gr; rr++) if (L.tiles[c * rows + rr] !== T.AIR) ok = false;
    if (!ok && gr >= 4 && fb[c + ',' + (gr - 4)] === undefined) { ok = true; br = gr - 3; for (rr = br - 1; ok && rr < gr; rr++) if (L.tiles[c * rows + rr] !== T.AIR) ok = false; }   // a low ceiling: the block hangs three tiles up (a big hero still walks under it)
    for (var q = -1; ok && q <= 1; q += 2) if (c + q < 0 || c + q >= L.w) ok = false;
    if (ok && fb[c + ',' + br] === undefined) { L.tiles[c * rows + br] = T.QP; fb[c + ',' + br] = it.k; } else keep.push(it);
  }
  L.items = keep; L.fixedBox = fb;
}
// Sea floors are not flat: swells / dunes of free-angle slope cells (15 / 30 / 45 degrees, one or two rows high) are raised on wide flat stretches of the floor of a water body, and the inner corner between floor and wall gets a 45-degree fillet.
// Only clean water over plain solid floor is touched, and never near a creature, coin, pocket, current, vent or route waypoint; the validator then proves the changed level (the swimmer slides along the slopes: see sim.js)
function swellWater(L, seed, n) {
  if (PF.noSwell || L.plan || L.kindFail || L.arena || !L.tiles) return;
  var rows = L.rows || ROWS, w = L.w, tl = L.tiles, c, r, i, anyW = false, nsl = 0;
  for (i = 0; i < tl.length && !anyW; i++) if (tl[i] === T.WATER) anyW = true;
  if (!anyW) return;
  L.slp = L.slp || {};
  var pts = [], en = L.enemies || [], wz = L.winds || [], wh = L.whirls || [];
  function addPts(a, rad) { if (a) for (var q = 0; q < a.length; q++) if (typeof a[q].x === 'number' && typeof a[q].y === 'number') pts.push([a[q].x, a[q].y, rad + (a[q].r || 0)]); }
  addPts(L.coins, 10); addPts(L.pockets, 16); addPts(L.items, 12); addPts(L.route, 18); addPts(L.keys, 12); addPts(L.switches, 12); addPts(L.doors, 12); addPts(L.springs, 12); addPts(L.special, 16); addPts(L.cannons, 16);
  // true if anything lives in the columns [ca, cb] (inclusive) above the surface height topY (px)
  function busy(ca, cb, topY) {
    var x0 = ca * TS - 10, x1 = (cb + 1) * TS + 10, q;
    for (q = 0; q < pts.length; q++) if (pts[q][0] > x0 - pts[q][2] && pts[q][0] < x1 + pts[q][2] && pts[q][1] > topY - 8) return true;
    for (q = 0; q < en.length; q++) { var e = en[q], pad = (e.rg || 0) + (e.rx || 0) + 6, ex0 = Math.min(e.x, e.ax === undefined ? e.x : e.ax, e.mn === undefined ? e.x : e.mn) - pad, ex1 = Math.max(e.x + (e.w || 12), e.ax === undefined ? e.x : e.ax + (e.w || 12), e.mx === undefined ? e.x : e.mx + (e.w || 12)) + pad;
      if (ex1 > x0 && ex0 < x1 && e.y + (e.h || 12) + (e.ry || 0) + (e.am || 0) + 2 > topY) return true; }
    for (q = 0; q < wz.length; q++) if (wz[q].x1 > x0 - 6 && wz[q].x0 < x1 + 6 && wz[q].y1 > topY - 6) return true;
    for (q = 0; q < wh.length; q++) if (wh[q].x + wh[q].r > x0 && wh[q].x - wh[q].r < x1 && wh[q].y + wh[q].r > topY) return true;
    return false;
  }
  function wet(cc, rr, k) { for (var q = 1; q <= k; q++) if (cc < 0 || cc >= w || rr - q < 0 || tl[cc * rows + rr - q] !== T.WATER) return false; return true; }
  var used = {};
  // pass 1: wide flat stretches of floor -> swell (up ramp, short plateau, down ramp)
  for (r = 4; r < rows; r++) {
    c = 0;
    while (c < w) {
      if (tl[c * rows + r] !== T.SOLID || !wet(c, r, 3)) { c++; continue; }
      var a = c; while (c < w && tl[c * rows + r] === T.SOLID && wet(c, r, 3) && !used[c]) c++;
      var b = c - 1; if (c === a) { c++; continue; }
      var len = b - a + 1, hs = hash(seed, n, a * 31 + r * 7 + 5), wr = 99;
      for (i = a; i <= b; i++) { var k = 0; while (r - 1 - k >= 0 && tl[i * rows + r - 1 - k] === T.WATER) k++; wr = Math.min(wr, k); }
      var H = wr >= 5 && (hs >> 4) % 3 === 0 ? 2 : 1, ang = [30, 30, 15, 45, 30][(hs >> 8) % 5], nn = Math.max(1, Math.round(H / Math.tan(ang * Math.PI / 180))), pl = (hs >> 12) % 3, tot = 2 * nn + pl;
      if (len < tot + 2 && len >= 4 && H === 1) { nn = 1; pl = 0; tot = 2; }   // a short stretch: a steep little mound
      if (len < tot + 2 || hs % 100 >= 75 || wr < H + 2) continue;
      var s0 = a + 1 + (hs >> 16) % (len - tot - 1);
      if (busy(s0 - 1, s0 + tot, (r - H) * TS)) continue;
      for (i = 0; i < tot; i++) {
        var cc = s0 + i, ia = i < nn ? i : i < nn + pl ? nn : tot - 1 - i, yl, yr, rr;
        if (i >= nn && i < nn + pl) { for (rr = r - H; rr < r; rr++) tl[cc * rows + rr] = T.SOLID; continue; }
        yl = r * TS - H * TS * ia / nn; yr = r * TS - H * TS * (ia + 1) / nn;   // low edge / high edge height of this column (ia counts from the foot)
        var yA = i < nn ? yl : yr, yB = i < nn ? yr : yl, yLow = Math.max(yA, yB), yHigh = Math.min(yA, yB), rowFull = Math.ceil(yLow / TS - 1e-6), rowTop = Math.floor(yHigh / TS + 1e-6);
        for (rr = rowTop; rr < r; rr++) {
          if (rr >= rowFull) { tl[cc * rows + rr] = T.SOLID; continue; }
          var top = rr * TS, y0 = yA - top, y1 = yB - top, m = (y1 - y0) / TS, xa, xb, q1 = (0 - y0) / m, q2 = (TS - y0) / m;
          xa = Math.max(0, Math.min(TS, Math.min(q1, q2))); xb = Math.max(0, Math.min(TS, Math.max(q1, q2)));
          L.slp[cc * rows + rr] = [+xa.toFixed(3), +Math.max(0, Math.min(TS, y0 + m * xa)).toFixed(3), +xb.toFixed(3), +Math.max(0, Math.min(TS, y0 + m * xb)).toFixed(3)];
          tl[cc * rows + rr] = T.SLP; nsl++;
        }
        used[cc] = 1;
      }
    }
  }
  // pass 2: inner corners between floor and wall get a 45-degree fillet
  var lastF = -9;
  for (c = 1; c < w - 1; c++) for (r = 4; r < rows; r++) {
    if (tl[c * rows + r] !== T.SOLID || used[c] || c - lastF < 3) continue;
    var hf = hash(seed, n, c * 17 + r * 3 + 11);
    if (hf % 100 >= 75 || !wet(c, r, 3)) continue;
    for (var sd = -1; sd <= 1; sd += 2) {
      var wc = c + sd;
      if (tl[wc * rows + r - 1] === T.SOLID && tl[(c - sd) * rows + r] === T.SOLID && tl[(c - sd) * rows + r - 1] === T.WATER && wet(c - sd, r, 3) && !used[c - sd]
        && !busy(c - 1, c + 1, (r - 1) * TS)) { tl[c * rows + r - 1] = sd > 0 ? T.SLR : T.SLL; used[c] = 1; lastF = c; nsl++; break; }
    }
  }
  if (nsl) L.swell = nsl;
}
root.PF.swellWater = swellWater; root.PF.boxify = boxify;
function generate(seed, n, o) {
  var L = null, v = null, t0 = Date.now();
  for (var a = 0; a < 16; a++) {
    var oo = o; if (a >= 6 || Date.now() - t0 > 2500) { oo = {}; for (var k in (o || {})) oo[k] = o[k]; oo.boss = 0; }   // fallback: simpler boss arena
    // flystep levels carry their own verified script (L.plan) and failed kinds skip validation; everything else goes through validate()
    L = build(seed, n, a, oo); boxify(L); addCastleMaces(L, seed, n); swellWater(L, seed, n); v = L.plan ? { ok: !!L.planOk, script: L.plan, nodes: 0 } : (L.kindFail ? { ok: false } : validate(L));
    // rising-lava speed derives from the solver's frame count: the climb is possible but tight
    if (v.ok && L.rise) { var climb = L.rows * TS - 100, frames = v.script.length; L.rise.v = Math.max(0.06, Math.min(0.5, climb / (frames * 1.9))); L.rise.delay = 240; }
    // success path: replay, then containment, then crumbs (not for planned levels); gauntlet levels get a time cap from the script length
    if (v.ok) { L.script = v.script; if (replay(L)) { var cc = checkContainment(L); if (!cc.bad) { L.valid = true; L.attempt = a; L.vnodes = v.nodes; L.crumbs = L.plan ? null : makeCrumbs(L); if (L.crumbs && L.cp && L.cp.stage !== undefined) { L.cp.cr = 0; for (var cri = 0; cri < L.crumbs.length; cri++) if (L.crumbs[cri][2] >= L.cp.stage) { L.cp.cr = cri; break; } } L.time = levelTime(L, n); if (L.kindAsked === 'gauntlet') L.time = Math.min(L.time, Math.ceil(L.script.length / 60 * 1.6) + 14); return L; } } }
    if (Date.now() - t0 > (L.kindAsked === 'castle' ? 24000 : L.kindAsked === 'gates' || L.kindAsked === 'toxic' || L.kindAsked === 'frost' || L.kindAsked === 'tiny' ? 14000 : 10000)) break;   /* a failed attempt of a tall stage costs about a second: give an unlucky draw enough tries (the first successful attempt is usually the 2nd-6th) */   // the segment-composed stages are built piece by piece and may need a second attempt
  }
  // every attempt failed (an unlucky draw of a heavy kind): never hand the game an unplayable stage, fall back to an ordinary stage of the same level number
  if (!(o && o.noFallback) && L.kindAsked !== 'castle' && L.kindAsked !== 'bossrush' && L.kindAsked !== 'cannon' && L.kindAsked !== 'house') { var FB = generate(seed, n, { kind: 'hills', noFallback: true, secret: o && o.secret }); if (FB.valid) { FB.fellBackFrom = L.kindAsked; return FB; } }
  L.valid = false; L.attempt = 16; return L;
}
// replay the validator's input script on a fresh enemy-free state: proves the flag is reachable with the real physics
function makeCrumbs(L) { L = vcopy(L); var st = vState(L), out = [], last = -99; for (var i = 0; i < L.script.length; i++) { var px0 = st.p.x + 6, py0 = st.p.y + 7, sg0 = st.stage, tc0 = st.tc, kb0 = st.kb, sb0 = st.sb; step(st, L.script[i]); if (st.stage !== sg0 || st.tc !== tc0 || st.kb !== kb0 || st.sb !== sb0) { out.push([Math.round(px0), Math.round(py0), sg0]); last = i; } if (st.p.dead || st.p.won) break; if (i - last >= 36 && st.p.ground) { out.push([Math.round(st.p.x + 6), Math.round(st.p.y + 7), st.stage]); last = i; } } out.push([Math.round(L.goalX), Math.round(L.poleY - 8), (L.route ? L.route.length - 1 : 0)]); return out; }
// cheap boolean check of the stored script (same as makeCrumbs' replay but without recording)
function replay(L) { L = vcopy(L); var st = vState(L); if (!L.script) return false; for (var i = 0; i < L.script.length; i++) { step(st, L.script[i]); if (st.p.dead) return false; if (st.p.won) return true; } return st.p.won; }

root.PF.gateSeg = gateSeg; root.PF.segLevel = segLevel; root.PF.probe = probe; root.PF.build = build; root.PF.generate = generate; root.PF.validate = validate; root.PF.checkContainment = checkContainment; root.PF.replay = replay; root.PF.makeCrumbs = makeCrumbs; root.PF.searchStage = searchStage; root.PF.searchIter = searchIter; root.PF.gateSeg = gateSeg; root.PF.buildOdyssey = buildOdyssey; root.PF.TRANSIT = TRANSIT; root.PF.segLevel = segLevel; root.PF.roomLevel = roomLevel; root.PF.worldMap = worldMap; root.PF.worldInfo = worldInfo; root.PF.worldExists = worldExists; root.PF.validateWorldMap = validateWorldMap; root.PF.validateInfinite = validateInfinite; root.PF.unlocked = unlocked; root.PF.kindOf = kindOf; root.PF.stageOf = stageOf; root.PF.stageCount = stageCount; root.PF.stageBase = stageBase; root.PF.secretTarget = secretTarget; root.PF.worldKinds = worldKinds; root.PF.KIND_NAMES = KIND_NAMES; root.PF.THEME_NAMES = THEME_NAMES; root.PF.pickTheme = pickTheme; root.PF.LAYOUT_THEMES = LAYOUT_THEMES;
})(typeof window !== 'undefined' ? window : globalThis);
