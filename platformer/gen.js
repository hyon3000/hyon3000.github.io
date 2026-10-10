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

function validate(L, maxNodes) {
  maxNodes = maxNodes || 4000;
  var st0 = newState(L, { noEn: true }), seq0 = [0, 0, 0]; runSeq(st0, seq0);
  if (!st0.p.ground) return { ok: false, why: 'start' };
  var seen = new Set(), stack = [{ st: st0, par: null, seq: seq0 }], nodes = 0;
  function key(st) { var p = st.p, a = Math.abs(p.vx), sc = (p.vx < -0.3 ? -1 : 1) * (a < 0.3 ? 0 : a < 1.8 ? 1 : 2) + 2, ph = (p.mv >= 0 || st.sw) ? Math.floor((st.f % MV_PERIOD) / 20) + 1 : 0; return ((Math.round(p.x / 3) * 256 + Math.round(p.y)) * 5 + sc) * 80 + ph; }
  seen.add(key(st0));
  function script(nd, extra) { var parts = [extra]; while (nd) { parts.push(nd.seq); nd = nd.par; } var out = []; for (var i = parts.length - 1; i >= 0; i--) for (var j = 0; j < parts[i].length; j++) out.push(parts[i][j]); return out; }
  var AIRS = [0, IN.R, IN.R | IN.RUN, IN.L], HOLDS = [3, 10, 99];
  while (stack.length && nodes < maxNodes) {
    var nd = stack.pop(), kids = []; nodes++;
    var tryMacro = function (fn) {
      var s = clone(nd.st), seq = fn(s); if (!seq) return null;
      if (s.p.won) return { win: true, seq: seq };
      if (s.p.dead || !s.p.ground) return null;
      var k = key(s); if (seen.has(k)) return null; seen.add(k); kids.push({ st: s, par: nd, seq: seq }); return null;
    };
    var res, mi;
    var walks = [[IN.R, 8], [IN.R | IN.RUN, 8], [IN.L, 8], [0, 20], [IN.R | IN.RUN, 3]];
    for (mi = 0; mi < walks.length; mi++) { res = tryMacro(function (s) { return macroWalk(s, walks[mi][0], walks[mi][1]); }); if (res) return { ok: true, script: script(nd, res.seq), nodes: nodes }; }
    for (var hi = 0; hi < 3; hi++) for (var ai = 0; ai < 4; ai++) {
      res = tryMacro(function (s) { return macroJump(s, HOLDS[hi], AIRS[ai], 0, 0); }); if (res) return { ok: true, script: script(nd, res.seq), nodes: nodes };
      if (ai === 1 || ai === 2) { res = tryMacro(function (s) { return macroEdge(s, ai === 2, HOLDS[hi], AIRS[ai]); }); if (res) return { ok: true, script: script(nd, res.seq), nodes: nodes }; }
    }
    kids.sort(function (a, b) { return a.st.p.x - b.st.p.x; });
    for (var q = 0; q < kids.length; q++) stack.push(kids[q]);
  }
  return { ok: false, why: stack.length ? 'budget' : 'unreachable', nodes: nodes };
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
var KIND_NAMES = { plain: ['초원', 'Meadow'], hills: ['언덕', 'Hills'], flood: ['물가', 'Lagoon'], ghost: ['유령의 숲', 'Haunted Grove'], sky: ['하늘길', 'Sky Path'], cave: ['동굴', 'Cavern'], castle: ['성채', 'Fortress'], room: ['비밀방', 'Bonus Room'], bonus: ['별길', 'Star Road'] };
function worldKinds(seed, w) {
  var r = rng(hash(seed, w, 4242)), pool = ['hills', 'flood', 'ghost', 'sky', 'cave'], out = [w === 0 ? 'plain' : (r() < 0.5 ? 'plain' : 'hills')];
  if (w === 0) pool = ['hills', 'flood', 'ghost', 'sky', 'cave'];
  else pool = pool.filter(function (k) { return k !== out[0]; }).concat(out[0] === 'plain' ? [] : ['plain']);
  for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  for (i = 0; i < 3; i++) out.push(pool[i]);
  out.push('castle'); return out;
}
function kindOf(seed, n) { if (n >= 1000) return 'bonus'; var w = Math.floor((n - 1) / 5); return worldKinds(seed, w)[(n - 1) % 5]; }
// the overworld map: five level nodes joined by a winding path (+ one hidden bonus node that a secret exit opens)
function worldMap(seed, w) {
  var r = rng(hash(seed, w, 777)), kinds = worldKinds(seed, w), nodes = [], x = 38, y = 120 + (r() - 0.5) * 40;
  for (var i = 0; i < 5; i++) { nodes.push({ i: i, n: w * 5 + i + 1, kind: kinds[i], x: Math.round(x), y: Math.round(y) }); x += 62 + r() * 12; y = Math.max(60, Math.min(170, y + (r() - 0.5) * 90)); }
  var bn = { i: 5, n: 1000 + w, kind: 'bonus', x: Math.round(nodes[2].x + 14), y: Math.round(nodes[2].y < 115 ? nodes[2].y + 48 : nodes[2].y - 48), bonus: true };
  return { w: w, kinds: kinds, nodes: nodes, bonus: bn };
}

// ------------------------------------------------------------------ level builder
function build(seed, n, a, o) {
  o = o || {};
  var lim = probe(), r = rng(hash(seed, n, a * 7919 + 1)), kind = o.kind || kindOf(seed, n), room = !!o.room;
  var diff = Math.min(1, (n >= 1000 ? 8 : n - 1) / 18); if (kind === 'bonus') diff = Math.min(1, 0.4 + 0.5 * diff); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3; if (a >= 8) diff = 0;
  var castle = kind === 'castle';
  var W = room ? 46 : castle ? Math.min(220, 90 + 6 * Math.min(n, 30)) : Math.min(300, 110 + 5 * Math.min(n, 38));
  var gt = [], flats = [], tl = [], movers = [], arcs = [], coinsX = [], specials = [], cannons = [], rings = [], enemiesX = [], g = castle ? 11 : 12, cpCol = -1, needPow = true, spots = [], ringCount = 0;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  function flat(len, gg) { var c0 = gt.length; for (var i = 0; i < len; i++) gt.push(gg); return c0; }
  function pit(len) { var c0 = gt.length; for (var i = 0; i < len; i++) { gt.push(ROWS); if (castle) { tl.push([c0 + i, ROWS - 2, T.LAVA]); tl.push([c0 + i, ROWS - 1, T.LAVA]); } } return c0; }
  function runway() { var k = 0, i = gt.length - 1; while (i >= 0 && gt[i] === gt[gt.length - 1] && gt[i] < ROWS) { k++; i--; } return k; }
  var gapMax = Math.max(2, Math.min(lim.gapRun - 1, Math.round(2 + diff * (lim.gapRun - 2.5))));
  var upMax = Math.max(1, Math.min(2, lim.up - 2));
  flat(10, g);
  // chunk weights per level kind
  function weights() {
    var d = diff, w = { flat: 3, gap: 1.5 + 2 * d, stairs: 1.2, hurdle: 1.5 + d, spikes: n >= 2 ? 0.5 + 1.5 * d : 0, islands: n >= 2 ? 0.5 + d : 0, mover: n >= 3 ? 0.4 + 1.2 * d : 0, vmover: 0, orbit: 0, falling: 0, hills: n >= 2 ? 1.4 : 0, flood: 0, conv: 0, cannon: n >= 4 ? 0.3 + 0.6 * d : 0, plant: n >= 3 ? 0.3 + 0.6 * d : 0, crush: 0, ghost: 0, spring: 0.25, vine: 0.25, psw: 0.3, ring: 0.3 };
    if (kind === 'hills') { w.hills = 4; w.flat = 2; }
    if (kind === 'flood') { w.flood = 4; w.hills = 0.6; w.gap = 1; }
    if (kind === 'ghost') { w.ghost = 2.2; w.islands += 0.7; w.spikes += 0.6; w.cannon = 0; w.ring = 0.5; }
    if (kind === 'sky') { w.flat = 1; w.gap = 3; w.islands = 2.5; w.mover = 1.2; w.vmover = 1.2; w.orbit = 1.5; w.falling = 1.5; w.stairs = 0.5; w.hurdle = 0.3; w.spring = 0.6; w.cannon = 0.4; }
    if (kind === 'cave') { w.conv = 3; w.cannon = 0.8; w.plant = 0.5; w.hills = 0.8; }
    if (castle) { w.gap = 2.5; w.crush = 2 + d; w.cannon = 1.2; w.conv = 1; w.orbit = 0.8; w.falling = 0.6; w.mover = 0.6; w.islands = 0.6; w.plant = 0.6; w.spring = 0; w.vine = 0; w.psw = 0; w.ring = 0; }
    if (kind === 'bonus') { w.spring = 0.8; w.ring = 0; }
    if (room) { for (var k in w) w[k] = 0; w.flat = 3; w.gap = 1; w.hurdle = 1; w.islands = 0.6; w.stairs = 0.5; }
    return w;
  }
  var names = ['flat', 'gap', 'stairs', 'hurdle', 'spikes', 'islands', 'mover', 'vmover', 'orbit', 'falling', 'hills', 'flood', 'conv', 'cannon', 'plant', 'crush', 'ghost', 'spring', 'vine', 'psw', 'ring'];
  var guard = 0, endReserve = castle ? 40 : 26;
  while (gt.length < W - endReserve && guard++ < 500) {
    if (cpCol < 0 && gt.length >= W / 2) { var cb = flat(7, g); cpCol = cb + 3; continue; }
    var wts = weights(), tot = 0, i; for (i = 0; i < names.length; i++) tot += wts[names[i]];
    var x = r() * tot, k = 0; while (k < names.length - 1 && x >= wts[names[k]]) { x -= wts[names[k]]; k++; }
    var ck = names[k];
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
      len = rnd(14, 22); c0 = flat(len, g); var wd = Math.min(5, g - 3);
      for (i2 = 0; i2 < len; i2++) for (q = 1; q <= wd; q++) tl.push([c0 + i2, g - q, T.WATER]);
      var px = c0 + 3; while (px < c0 + len - 3) { var ph2 = rnd(2, 3); if (r() < 0.7) { for (q = 1; q <= ph2; q++) tl.push([px, g - q, T.SOLID]); } else { tl.push([px, g - 1, T.SPIKE]); } px += rnd(4, 6); }
      for (i2 = 0; i2 < 4; i2++) coinsX.push({ x: (c0 + 3 + i2 * (len - 6) / 3) * TS + 8, y: (g - 3) * TS + 8 });
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
      len = 7; c0 = flat(len, g); var rc = c0 + 3, secret = (ringCount === 0 && n % 2 === 0 && !castle && !room && n < 1000); ringCount++;
      tl.push([rc, g - 1, T.RING]); tl.push([rc, g - 2, T.RING]); rings.push({ c: rc, secret: secret, room: secret ? 1 : 0, y: g * TS });
      flats.push({ c: c0, len: len, g: g, noEn: true });
    }
  }
  if (cpCol < 0) { cpCol = flat(7, g) + 3; }
  flat(4, g);
  var goalCol, poleCol, bossDef = null, arenaC0 = 0;
  if (castle && !room) {
    flat(6, g); arenaC0 = flat(26, g); flat(3, g);
    var bv = (n + hash(seed, n, 5)) % 3, bx = (arenaC0 + 16) * TS;
    bossDef = { t: E.BOSS, v: bv, x: bx, y: g * TS - 26, w: 28, h: 26, spd: 0, mn: (arenaC0 + 1) * TS, mx: (arenaC0 + 25) * TS, ax: (arenaC0 + 14) * TS, ay: (g - 4) * TS - 6, dir: -1 };
    poleCol = arenaC0 + 24; goalCol = poleCol;
  } else {
    for (var s2 = 0; s2 < 4; s2++) { g -= 1; flat(2, g); }
    poleCol = flat(4, g) + 1; flat(8, g);
  }
  W = gt.length;
  // ---- tiles
  var tiles = new Uint8Array(W * ROWS), c, rr;
  for (c = 0; c < W; c++) for (rr = gt[c]; rr < ROWS; rr++) tiles[c * ROWS + rr] = T.SOLID;
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
  arcs.forEach(function (a2) {
    if (r() < 0.8) for (var j = 0; j < 5; j++) { var t = (j + 0.5) / 5; pushCoin((a2.c - 0.5 + (a2.w + 1) * t) * TS + 8, (a2.g - 1.5) * TS - Math.sin(Math.PI * t) * 28 + 6); } });
  spots.forEach(function (s) { if (r() < 0.6) pushCoin(s.x, s.y); });
  if (bossDef) enemies.push(bossDef);
  // ---- five special collectibles: spread over the level on arcs / floating spots
  var cand = spots.slice(); arcs.forEach(function (a2) { cand.push({ x: (a2.c + a2.w / 2) * TS + 8, y: (a2.g - 3.2) * TS }); }); flats.forEach(function (f) { cand.push({ x: (f.c + f.len / 2) * TS, y: (f.g - 3) * TS }); });
  cand.sort(function (u, v) { return u.x - v.x; });
  if (!room) { for (var si = 0; si < 5 && cand.length; si++) { var pick = cand[Math.min(cand.length - 1, Math.floor((si + 0.5) * cand.length / 5))]; specials.push({ x: pick.x, y: pick.y }); } }
  var gy = function (col) { return gt[col] * TS; };
  var L = { seed: seed, n: n, kind: kind, attempt: a, diff: diff, w: W, tiles: tiles, gt: gt, coins: coins, special: specials, enemies: enemies, movers: movers, cannons: cannons, rings: rings, goalX: poleCol * TS + 6, poleCol: poleCol, poleY: gy(poleCol),
    start: { x: 3 * TS + 2, y: gy(3) - P.SH }, cp: { x: cpCol * TS + 2, y: gy(cpCol) - P.SH }, time: (castle ? 150 : 90) + Math.floor(W * 0.6), theme: castle ? 4 : { plain: 0, hills: 0, flood: 3, ghost: 2, sky: 1, cave: 5, bonus: 1 }[kind] | 0, room: room, hasBoss: !!bossDef };
  L.rings.forEach(function (rg) { rg.out = { x: rg.c * TS + 2, y: rg.y - P.SH }; });
  if (castle && bossDef) L.arena = { c0: arenaC0, c1: arenaC0 + 26 };
  return L;
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
    if (v.ok) { L.script = v.script; if (replay(L)) { L.valid = true; L.attempt = a; L.vnodes = v.nodes; return L; } }
  }
  L.valid = false; L.attempt = 16; return L;
}
// replay the validator's input script on a fresh enemy-free state: proves the flag is reachable with the real physics
function replay(L) { var st = newState(L, { noEn: true }); if (!L.script) return false; for (var i = 0; i < L.script.length; i++) { step(st, L.script[i]); if (st.p.dead) return false; if (st.p.won) return true; } return st.p.won; }

root.PF.probe = probe; root.PF.build = build; root.PF.generate = generate; root.PF.validate = validate; root.PF.replay = replay; root.PF.roomLevel = roomLevel; root.PF.worldMap = worldMap; root.PF.kindOf = kindOf; root.PF.worldKinds = worldKinds; root.PF.KIND_NAMES = KIND_NAMES;
})(typeof window !== 'undefined' ? window : globalThis);
