// Shape Runner - deterministic simulation, procedural level generator and level validator.
// No DOM here: the same code runs in the game, in the auto-play planner and in the headless seed test.
(function (root) {
'use strict';
var TS = 16, ROWS = 14, VW = 400, VH = 224;
var T = { AIR: 0, SOLID: 1, BRICK: 2, QC: 3, QP: 4, USED: 5, SPIKE: 6 };
var IN = { L: 1, R: 2, J: 4, RUN: 8 };
// physics constants (px, frames at 60 Hz)
var P = { WALK: 1.4, RUN: 2.2, ACCG: 0.12, ACCA: 0.07, FRIC: 0.14, JUMP: -6.3, JRUN: 0.5, GUP: 0.28, GCUT: 0.7, GDN: 0.55, MAXFALL: 7.5,
          COY: 5, JBUF: 6, PW: 12, SH: 14, BH: 24, INV: 100, ACTIVE: 340 };
var WALKER = 0, SPIKY = 1, FLYER = 2;
var MV_PERIOD = 1440;                       // common multiple of all mover periods (240, 360, 480)

function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(a, b, c) { var h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
function tri(u) { var q = u - Math.floor(u); return q < 0.5 ? 4 * q - 1 : 3 - 4 * q; }

// ------------------------------------------------------------------ state
var EMPTY = new Map();
function moverX(m, f) { return m.cx + m.amp * Math.sin(6.283185307 * f / m.per + m.ph) - m.w / 2; }
function newState(L, o) {
  o = o || {};
  var s = o.cp ? L.cp : L.start;
  var st = { L: L, f: 0, mod: EMPTY, score: 0, coins: 0, t: Math.round(L.time * 60), cp: o.cp ? 1 : 0, ev: o.rec ? [] : null, noEn: !!o.noEn,
    p: { x: s.x, y: s.y, vx: 0, vy: 0, w: P.PW, h: P.SH, big: false, ground: true, coy: 0, jbuf: 0, jheld: false, face: 1, inv: 0, dead: false, won: false, mv: -1, anim: 0, why: '' },
    en: [], it: [], cg: new Uint8Array(L.coins.length) };
  if (!o.noEn) for (var i = 0; i < L.enemies.length; i++) { var d = L.enemies[i];
    if (o.cp && d.x < L.cp.x + 120 && d.x > L.cp.x - 120) continue;
    st.en.push({ t: d.t, x: d.x, y: d.y, w: d.w, h: d.h, vx: 0, vy: 0, dir: d.dir || -1, alive: true, dt: 0, ground: false, spd: d.spd, mn: d.mn, mx: d.mx, ax: d.ax, ay: d.ay, rg: d.rg, sp: d.sp, ph: d.ph, am: d.am }); }
  return st;
}
function clone(st) {
  var c = {}; for (var k in st) c[k] = st[k];
  c.p = {}; for (k in st.p) c.p[k] = st.p[k];
  var en = new Array(st.en.length); for (var i = 0; i < en.length; i++) { var s = st.en[i], e = {}; for (k in s) e[k] = s[k]; en[i] = e; } c.en = en;
  c.it = st.it.length ? st.it.map(function (s) { var e = {}; for (var k in s) e[k] = s[k]; return e; }) : [];
  c.cg = st.cg.slice(); c.ev = null; return c;
}
function ev(st, k, x, y, a) { if (st.ev) st.ev.push({ k: k, x: x, y: y, a: a }); }

function tileAt(st, c, r) {
  var L = st.L;
  if (c < 0 || c >= L.w) return T.SOLID;
  if (r < 0 || r >= ROWS) return T.AIR;
  var i = c * ROWS + r;
  if (st.mod.size) { var m = st.mod.get(i); if (m !== undefined) return m; }
  return L.tiles[i];
}
function boxHit(st, x, y, w, h) {
  var c0 = Math.floor(x / TS), c1 = Math.floor((x + w - 1e-4) / TS), r0 = Math.floor(y / TS), r1 = Math.floor((y + h - 1e-4) / TS);
  for (var c = c0; c <= c1; c++) for (var r = r0; r <= r1; r++) { var t = tileAt(st, c, r); if (t !== 0 && t !== 6) return true; }
  return false;
}
function setTile(st, c, r, t) { if (st.mod === EMPTY) st.mod = new Map(); st.mod.set(c * ROWS + r, t); }

// ------------------------------------------------------------------ step
function bump(st, r) {
  var p = st.p, c0 = Math.floor(p.x / TS), c1 = Math.floor((p.x + p.w - 1e-4) / TS), best = -1, bd = 1e9, cx = p.x + p.w / 2;
  for (var c = c0; c <= c1; c++) { var t = tileAt(st, c, r); if (t !== 0 && t !== 6) { var d = Math.abs(c * TS + 8 - cx); if (d < bd) { bd = d; best = c; } } }
  if (best < 0) return;
  var t2 = tileAt(st, best, r), x = best * TS + 8, y = r * TS;
  if (t2 === T.BRICK) { if (p.big) { setTile(st, best, r, T.AIR); st.score += 50; ev(st, 'brick', x, y + 8); } else ev(st, 'bump', x, y + 8, best * 64 + r); }
  else if (t2 === T.QC) { setTile(st, best, r, T.USED); st.coins++; st.score += 10; ev(st, 'coinpop', x, y - 4); }
  else if (t2 === T.QP) { setTile(st, best, r, T.USED); st.it.push({ x: best * TS + 2, y: y - 0, w: 12, h: 12, vx: 0.7, vy: 0, em: 12, alive: true, ground: false, dir: 1 }); ev(st, 'item', x, y - 4); }
  else ev(st, 'bump', x, y + 8);
}
function moveEnt(st, o) {
  var hw = false;
  o.vy = Math.min(P.MAXFALL, o.vy + P.GDN * 0.8);
  var nx = o.x + o.vx;
  if (boxHit(st, nx, o.y, o.w, o.h)) { if (o.vx > 0) o.x = Math.floor((nx + o.w - 1e-4) / TS) * TS - o.w; else if (o.vx < 0) o.x = (Math.floor(nx / TS) + 1) * TS; hw = true; } else o.x = nx;
  var ny = o.y + o.vy; o.ground = false;
  if (boxHit(st, o.x, ny, o.w, o.h)) { if (o.vy > 0) { o.y = Math.floor((ny + o.h - 1e-4) / TS) * TS - o.h; o.ground = true; } else o.y = (Math.floor(ny / TS) + 1) * TS; o.vy = 0; } else o.y = ny;
  return hw;
}
function hurt(st, why) {
  var p = st.p;
  if (p.inv > 0 || p.dead) return;
  if (p.big) { p.big = false; p.y += P.BH - P.SH; p.h = P.SH; p.inv = P.INV; ev(st, 'hurt', p.x, p.y); }
  else { p.dead = true; p.why = why; ev(st, 'die', p.x, p.y); }
}

function step(st, inp) {
  var L = st.L, p = st.p, f = st.f;
  if (p.dead || p.won) { st.f++; return; }
  var left = inp & 1, right = inp & 2, jump = inp & 4, run = inp & 8, dir = (right ? 1 : 0) - (left ? 1 : 0);
  var maxv = run ? P.RUN : P.WALK;
  // --- carried by a mover
  if (p.mv >= 0) { var mm = L.movers[p.mv]; p.x += moverX(mm, f + 1) - moverX(mm, f); }
  // --- horizontal
  if (dir) {
    var tv = dir * maxv, acc = p.ground ? P.ACCG : P.ACCA; if (p.ground && dir * p.vx < 0) acc *= 2;
    if (p.vx < tv) p.vx = Math.min(tv, p.vx + acc); else if (p.vx > tv) p.vx = Math.max(tv, p.vx - (p.ground ? P.FRIC : 0.015));
    p.face = dir;
  } else if (p.ground) { if (p.vx > 0) p.vx = Math.max(0, p.vx - P.FRIC); else p.vx = Math.min(0, p.vx + P.FRIC); }
  // --- jump (buffer + coyote time)
  if (p.ground) p.coy = P.COY; else if (p.coy > 0) p.coy--;
  if (jump && !p.jheld) p.jbuf = P.JBUF; else if (p.jbuf > 0) p.jbuf--;
  p.jheld = !!jump;
  if (p.jbuf > 0 && p.coy > 0) { p.vy = P.JUMP - P.JRUN * Math.abs(p.vx) / P.RUN; p.jbuf = 0; p.coy = 0; p.ground = false; p.mv = -1; ev(st, 'jump', p.x, p.y + p.h); }
  var g = p.vy < 0 ? (jump ? P.GUP : P.GCUT) : P.GDN;
  p.vy = Math.min(P.MAXFALL, p.vy + g);
  // --- move x
  var nx = p.x + p.vx;
  if (boxHit(st, nx, p.y, p.w, p.h)) { if (p.vx > 0) p.x = Math.floor((nx + p.w - 1e-4) / TS) * TS - p.w; else if (p.vx < 0) p.x = (Math.floor(nx / TS) + 1) * TS; p.vx = 0; }
  else { p.x = nx; if (p.x < 0) { p.x = 0; p.vx = 0; } }
  // --- move y
  var ny = p.y + p.vy, wasGround = p.ground; p.ground = false; var oldmv = p.mv; p.mv = -1;
  if (p.vy >= 0) {
    if (boxHit(st, p.x, ny, p.w, p.h)) { p.y = Math.floor((ny + p.h - 1e-4) / TS) * TS - p.h; p.vy = 0; p.ground = true; }
    else {
      var landed = false, pb = p.y + p.h;
      for (var mi = 0; mi < L.movers.length; mi++) { var m = L.movers[mi], mx = moverX(m, f + 1);
        if (p.x + p.w > mx + 1 && p.x < mx + m.w - 1 && pb <= m.y + 0.5 && ny + p.h >= m.y) { p.y = m.y - p.h; p.vy = 0; p.ground = true; p.mv = mi; landed = true; break; } }
      if (!landed) p.y = ny;
    }
  } else {
    if (boxHit(st, p.x, ny, p.w, p.h)) { var r = Math.floor(ny / TS); p.y = (r + 1) * TS; p.vy = 0; bump(st, r); } else p.y = ny;
  }
  if (p.ground && !wasGround) ev(st, 'land', p.x, p.y + p.h);
  if (p.inv > 0) p.inv--;
  p.anim += Math.abs(p.vx) * 0.12;
  // --- enemies
  var i, e;
  for (i = 0; i < st.en.length; i++) { e = st.en[i];
    if (!e.alive) { if (e.dt > 0) e.dt--; continue; }
    if (e.t === FLYER) { e.x = e.ax + e.rg * tri(f * e.sp + e.ph); e.y = e.ay + Math.sin(f * 0.08 + e.ph * 6.283) * e.am; e.dir = tri((f + 1) * e.sp + e.ph) > tri(f * e.sp + e.ph) ? 1 : -1; continue; }
    if (Math.abs(e.x - p.x) > P.ACTIVE) continue;
    e.vx = e.dir * e.spd;
    var hw = moveEnt(st, e);
    if (hw) e.dir = -e.dir;
    else if (e.ground) { var ax = e.vx > 0 ? e.x + e.w + 1 : e.x - 1, c = Math.floor(ax / TS), rr = Math.floor((e.y + e.h + 2) / TS), tt = tileAt(st, c, rr); if (tt === 0 || tt === 6) e.dir = -e.dir; }
    if (e.x < e.mn) { e.x = e.mn; e.dir = 1; } else if (e.x + e.w > e.mx) { e.x = e.mx - e.w; e.dir = -1; }
    if (e.y > ROWS * TS + 40) e.alive = false;
  }
  // --- items
  for (i = 0; i < st.it.length; i++) { e = st.it[i]; if (!e.alive) continue;
    if (e.em > 0) { e.em--; e.y -= 1.2; continue; }
    if (moveEnt(st, e)) e.vx = -e.vx;
    if (e.y > ROWS * TS + 40) { e.alive = false; continue; }
    if (p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y) {
      e.alive = false;
      if (!p.big) { if (!boxHit(st, p.x, p.y - (P.BH - P.SH), p.w, P.BH)) { p.big = true; p.y -= P.BH - P.SH; p.h = P.BH; st.score += 200; ev(st, 'grow', p.x, p.y); } else { st.score += 200; ev(st, 'pow2', p.x, p.y); } }
      else { st.score += 300; ev(st, 'pow2', p.x, p.y); }
    }
  }
  // --- coins
  var cs = L.coins; for (i = 0; i < cs.length; i++) if (!st.cg[i]) { var cc = cs[i];
    if (p.x < cc.x + 6 && p.x + p.w > cc.x - 6 && p.y < cc.y + 7 && p.y + p.h > cc.y - 7) { st.cg[i] = 1; st.coins++; st.score += 10; ev(st, 'coin', cc.x, cc.y); } }
  // --- enemy contact
  for (i = 0; i < st.en.length; i++) { e = st.en[i]; if (!e.alive) continue;
    if (p.x < e.x + e.w && p.x + p.w > e.x && p.y < e.y + e.h && p.y + p.h > e.y) {
      if (e.t !== SPIKY && p.vy > 0 && (p.y + p.h) - e.y <= 9 + p.vy) { e.alive = false; e.dt = 30; p.vy = jump ? -7.2 : -4.2; p.coy = 0; st.score += 100; ev(st, 'stomp', e.x + e.w / 2, e.y); }
      else hurt(st, 'enemy');
    }
  }
  // --- spikes
  if (!p.dead) { var c0 = Math.floor((p.x + 3) / TS), c1 = Math.floor((p.x + p.w - 3) / TS), r0 = Math.floor((p.y + p.h - 7) / TS), r1 = Math.floor((p.y + p.h - 1e-4) / TS);
    for (var c2 = c0; c2 <= c1; c2++) for (var r2 = r0; r2 <= r1; r2++) if (tileAt(st, c2, r2) === T.SPIKE && p.y + p.h > r2 * TS + 8) { hurt(st, 'spike'); if (!p.dead) { p.vy = -5; } } }
  // --- pit / timer / goal / checkpoint
  if (p.y > ROWS * TS + 6) { p.dead = true; p.why = 'pit'; ev(st, 'die', p.x, ROWS * TS); }
  if (--st.t <= 0 && !p.dead) { p.dead = true; p.why = 'time'; ev(st, 'die', p.x, p.y); }
  if (!p.dead && p.x + p.w >= L.goalX) { p.won = true; ev(st, 'goal', L.goalX, p.y); }
  if (!st.cp && p.x >= L.cp.x) st.cp = 1;
  st.f = f + 1;
}

// ------------------------------------------------------------------ macros (shared by the validator, the probe and the tests)
function runSeq(st, seq) { for (var i = 0; i < seq.length; i++) step(st, seq[i]); }
function jumpPhase(st, seq, hold, air) {
  for (var k = 0; k < 150; k++) { var inp = (k < hold ? IN.J : 0) | air; step(st, inp); seq.push(inp); if (st.p.dead || st.p.won) return; if (st.p.ground && k >= 1) return; }
}
function fallPhase(st, seq, air) { for (var k = 0; k < 120 && !st.p.ground; k++) { step(st, air); seq.push(air); if (st.p.dead || st.p.won) return; } }
function macroEdge(st, run, hold, air) {
  var seq = [], inp = IN.R | (run ? IN.RUN : 0), n = 0;
  for (var i = 0; i < 220; i++) { step(st, inp); seq.push(inp); if (st.p.dead || st.p.won) return seq; if (!st.p.ground) break; if (i > 6 && st.p.vx === 0) return null; }
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
  maxNodes = maxNodes || 2500;
  var st0 = newState(L, { noEn: true }), seq0 = [0, 0, 0]; runSeq(st0, seq0);
  if (!st0.p.ground) return { ok: false, why: 'start' };
  var seen = new Set(), stack = [{ st: st0, par: null, seq: seq0 }], nodes = 0;
  function key(st) { var p = st.p, a = Math.abs(p.vx), sc = (p.vx < -0.3 ? -1 : 1) * (a < 0.3 ? 0 : a < 1.8 ? 1 : 2) + 2, ph = p.mv >= 0 ? Math.floor((st.f % MV_PERIOD) / 20) + 1 : 0; return ((Math.round(p.x / 3) * 256 + Math.round(p.y)) * 5 + sc) * 80 + ph; }
  seen.add(key(st0));
  function script(nd, extra) { var parts = [extra]; while (nd) { parts.push(nd.seq); nd = nd.par; } var out = []; for (var i = parts.length - 1; i >= 0; i--) for (var j = 0; j < parts[i].length; j++) out.push(parts[i][j]); return out; }
  var AIRS = [0, IN.R, IN.R | IN.RUN, IN.L], HOLDS = [3, 10, 99];
  while (stack.length && nodes < maxNodes) {
    var nd = stack.pop(), kids = []; nodes++;
    function tryMacro(fn) {
      var s = clone(nd.st), seq = fn(s); if (!seq) return null;
      if (s.p.won) { return { win: true, seq: seq }; }
      if (s.p.dead || !s.p.ground) return null;
      var k = key(s); if (seen.has(k)) return null; seen.add(k); kids.push({ st: s, par: nd, seq: seq }); return null;
    }
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

// ------------------------------------------------------------------ physics probe: how far / high can the hero really jump?
var LIM = null;
function probe() {
  if (LIM) return LIM;
  function flatLevel(gapW, wallH) {
    var w = 40, tiles = new Uint8Array(w * ROWS), g = 10;
    for (var c = 0; c < w; c++) { var gt = g; if (gapW && c >= 14 && c < 14 + gapW) gt = ROWS; if (wallH && c >= 22 && c < 24) gt = g - wallH; for (var r = gt; r < ROWS; r++) tiles[c * ROWS + r] = 1; }
    return { w: w, tiles: tiles, coins: [], enemies: [], movers: [], goalX: 99999, time: 999, start: { x: 40, y: g * TS - P.SH }, cp: { x: 99999, y: 0 }, g: g };
  }
  function ok(L, fn, gw) { var s = newState(L, { noEn: true }); runSeq(s, [0, 0, 0]); var seq = fn(s); return !!seq && !s.p.dead && s.p.ground && s.p.x > (14 + gw) * TS; }
  var gapRun = 0, gapWalk = 0, up = 0, gw, h;
  for (gw = 1; gw <= 9; gw++) { var L1 = flatLevel(gw, 0);
    if (ok(L1, function (s) { return macroEdge(s, true, 99, IN.R | IN.RUN); }, gw)) gapRun = gw;
    if (ok(L1, function (s) { return macroEdge(s, false, 99, IN.R); }, gw)) gapWalk = gw; }
  for (h = 1; h <= 7; h++) { var L2 = flatLevel(0, h), good = false;
    for (var pre = 0; pre < 260 && !good; pre += 2) for (var run = 0; run < 2 && !good; run++) {
      var s = newState(L2, { noEn: true }); runSeq(s, [0, 0, 0]);
      // walk/run toward the wall, jump at a given distance, steer right in the air
      var inp = IN.R | (run ? IN.RUN : 0); macroJump(s, 99, inp, pre, inp);
      if (!s.p.dead && s.p.ground && s.p.x > 22 * TS && s.p.y < (L2.g - h) * TS) good = true; }
    if (good) up = h; }
  LIM = { gapRun: gapRun, gapWalk: gapWalk, up: up };
  return LIM;
}

// ------------------------------------------------------------------ level generator
function build(seed, n, a) {
  var lim = probe(), r = rng(hash(seed, n, a * 7919 + 1));
  var diff = Math.min(1, (n - 1) / 14); if (a >= 3) diff *= 0.6; if (a >= 6) diff *= 0.3; if (a >= 8) diff = 0;
  var W = Math.min(320, 110 + 10 * (n - 1));
  var gt = [], flats = [], spikes = [], floats = [], movers = [], arcs = [], g = 12, cpCol = -1, needPow = true;
  var rnd = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
  function flat(len, gg) { var c0 = gt.length; for (var i = 0; i < len; i++) gt.push(gg); return c0; }
  function runway() { var k = 0, i = gt.length - 1; while (i >= 0 && gt[i] === gt[gt.length - 1] && gt[i] < ROWS) { k++; i--; } return k; }
  var gapMax = Math.max(2, Math.min(lim.gapRun - 1, Math.round(2 + diff * (lim.gapRun - 2.5))));
  var upMax = Math.max(1, Math.min(2, lim.up - 2));
  flat(10, g);
  var kinds = ['flat', 'gap', 'stairs', 'hurdle', 'spikes', 'islands', 'mover'];
  var guard = 0;
  while (gt.length < W - 26 && guard++ < 400) {
    if (cpCol < 0 && gt.length >= W / 2) { var cb = flat(7, g); cpCol = cb + 3; continue; }
    var wts = [3, n >= 1 ? 1.5 + 2 * diff : 0, 1.2, 1.5 + diff, n >= 2 ? 0.5 + 1.8 * diff : 0, n >= 2 ? 0.5 + 1.2 * diff : 0, n >= 3 ? 0.4 + 1.3 * diff : 0], tot = 0, i;
    for (i = 0; i < wts.length; i++) tot += wts[i];
    var x = r() * tot, k = 0; while (k < wts.length - 1 && x >= wts[k]) { x -= wts[k]; k++; }
    var kind = kinds[k];
    if (runway() < 3) flat(3 - runway(), g);
    var c0, len, gw, dg, i2;
    if (kind === 'flat') { len = rnd(6, 13); c0 = flat(len, g); flats.push({ c: c0, len: len, g: g }); }
    else if (kind === 'gap') {
      gw = rnd(2, gapMax); dg = [0, 0, 0, 1, -1][rnd(0, 4)]; if (dg < 0 && g + 1 > 12) dg = 0; if (dg > 0 && g - dg < 8) dg = 0; if (dg < 0 && gw > gapMax - 1) dg = 0;
      c0 = gt.length; for (i2 = 0; i2 < gw; i2++) gt.push(ROWS); arcs.push({ c: c0, w: gw, g: g, ng: g - dg });
      g -= dg; len = rnd(4, 8); var c1 = flat(len, g); flats.push({ c: c1, len: len, g: g });
    }
    else if (kind === 'stairs') {
      var up = r() < 0.55, steps = rnd(2, 3); if (up && g - steps < 8) up = false; if (!up && g + steps > 12) up = true; if (up && g - steps < 8) steps = 1;
      for (i2 = 0; i2 < steps; i2++) { g += up ? -1 : 1; flat(2, g); } flat(3, g);
    }
    else if (kind === 'hurdle') { var hh = rnd(1, Math.min(3, lim.up - 1)), ww = rnd(1, 2); if (g - hh < 6) continue; flat(ww, g - hh); }
    else if (kind === 'spikes') { var sw = rnd(1, diff > 0.5 ? 3 : 2); c0 = flat(sw, g); spikes.push({ c: c0, w: sw, g: g }); }
    else if (kind === 'islands') {
      var cnt = rnd(2, 4), ri = g, pitStart = gt.length;
      for (i2 = 0; i2 < cnt; i2++) {
        var gp = rnd(2, Math.max(2, gapMax - 1)), d = [0, 0, -1, 1][rnd(0, 3)]; if (ri - d < 8 || ri - d > 12) d = 0; if (d < 0) gp = Math.min(gp, Math.max(2, gapMax - 2));
        for (var q = 0; q < gp; q++) gt.push(ROWS); ri -= d; var iw = rnd(2, 3), ic = gt.length;
        for (q = 0; q < iw; q++) { gt.push(ROWS); floats.push({ c: ic + q, r: ri }); }
      }
      var gp2 = rnd(2, Math.max(2, gapMax - 1)); for (i2 = 0; i2 < gp2; i2++) gt.push(ROWS);
      g = ri; len = rnd(4, 7); var c3 = flat(len, g); flats.push({ c: c3, len: len, g: g });
    }
    else if (kind === 'mover') {
      var pw = rnd(Math.max(lim.gapRun + 1, 6), Math.max(lim.gapRun + 1, 6) + 3); c0 = gt.length; for (i2 = 0; i2 < pw; i2++) gt.push(ROWS);
      movers.push({ cx: (c0 + pw / 2) * TS, y: g * TS, w: 48, amp: pw * TS / 2, per: [240, 360, 480][rnd(0, 2)], ph: 0 });
      len = rnd(4, 7); var c4 = flat(len, g); flats.push({ c: c4, len: len, g: g });
    }
  }
  if (cpCol < 0) { cpCol = flat(7, g) + 3; }
  flat(4, g);
  var steps2 = 4; for (var s2 = 0; s2 < steps2; s2++) { g -= 1; flat(2, g); }
  var poleCol = flat(4, g) + 1; flat(8, g);
  W = gt.length;
  // ---- tiles
  var tiles = new Uint8Array(W * ROWS), c, rr;
  for (c = 0; c < W; c++) for (rr = gt[c]; rr < ROWS; rr++) tiles[c * ROWS + rr] = T.SOLID;
  var put = function (cc, r2, t) { if (cc >= 0 && cc < W && r2 >= 0 && r2 < ROWS) tiles[cc * ROWS + r2] = t; };
  floats.forEach(function (f) { put(f.c, f.r, T.SOLID); });
  spikes.forEach(function (s) { for (var i3 = 0; i3 < s.w; i3++) put(s.c + i3, s.g - 1, T.SPIKE); });
  var coins = [], enemies = [], pushCoin = function (x, y) { coins.push({ x: x, y: y }); };
  // ---- features on flat chunks
  flats.forEach(function (f) {
    var mid = f.c + f.len / 2;
    if (f.len >= 8 && r() < 0.5) {   // block cluster
      var m = rnd(3, Math.min(5, f.len - 4)), bc = f.c + 2 + rnd(0, f.len - 4 - m);
      for (var j = 0; j < m; j++) { var t = r() < 0.5 ? T.BRICK : T.QC; if (needPow && j === (m >> 1)) { t = T.QP; needPow = false; } else if (r() < 0.07) t = T.QP; put(bc + j, f.g - 4, t); }
      if (r() < 0.5) for (j = 0; j < m; j++) pushCoin((bc + j) * TS + 8, (f.g - 6) * TS + 8);
    } else if (r() < 0.5) { var cn = rnd(3, 5); for (var j2 = 0; j2 < cn; j2++) pushCoin((mid - cn / 2 + j2 + 0.5) * TS, (f.g - 2) * TS + 8 - Math.sin(Math.PI * (j2 + 0.5) / cn) * 12); }
    // enemies
    var ne = f.len >= 6 ? ((r() < 0.3 + 0.55 * diff ? 1 : 0) + (f.len >= 10 && r() < 0.8 * diff ? 1 : 0)) : 0;
    if (n === 1 && ne > 1) ne = 1;
    for (var e = 0; e < ne; e++) {
      var ex = (f.c + 4 + (f.len - 8) * (ne === 1 ? r() : (e + r() * 0.6) / ne)) * TS, tr = r(), ty = WALKER;
      if (diff > 0.12 && tr < 0.28 * diff + 0.05) ty = FLYER; else if (diff > 0.08 && tr < 0.28 * diff + 0.05 + 0.4 * diff) ty = SPIKY;
      if (ty === FLYER) enemies.push({ t: FLYER, x: ex, y: (f.g - 3) * TS, w: 14, h: 10, ax: ex, ay: (f.g - 3) * TS, rg: 30 + r() * 30, sp: 1 / (200 + r() * 160), ph: r(), am: 8 + r() * 6, spd: 0 });
      else if (ty === SPIKY) enemies.push({ t: SPIKY, x: ex, y: f.g * TS - 14, w: 14, h: 14, spd: 0.4 + 0.2 * diff, dir: r() < 0.5 ? -1 : 1, mn: (f.c + 1) * TS, mx: (f.c + f.len - 1) * TS });
      else enemies.push({ t: WALKER, x: ex, y: f.g * TS - 12, w: 12, h: 12, spd: 0.45 + 0.35 * diff * r(), dir: r() < 0.6 ? -1 : 1, mn: (f.c + 1) * TS, mx: (f.c + f.len - 1) * TS });
    }
  });
  arcs.forEach(function (a2) {
    if (r() < 0.8) for (var j = 0; j < 5; j++) { var t = (j + 0.5) / 5; pushCoin((a2.c - 0.5 + (a2.w + 1) * t) * TS + 8, (a2.g - 1.5) * TS - Math.sin(Math.PI * t) * 28 + 6); } });
  floats.forEach(function (f) { if (r() < 0.5) pushCoin(f.c * TS + 8, (f.r - 1) * TS + 4); });
  var gy = function (col) { return gt[col] * TS; };
  var L = { seed: seed, n: n, attempt: a, diff: diff, w: W, tiles: tiles, gt: gt, coins: coins, enemies: enemies, movers: movers, goalX: poleCol * TS + 6, poleCol: poleCol, poleY: gy(poleCol),
    start: { x: 3 * TS + 2, y: gy(3) - P.SH }, cp: { x: cpCol * TS + 2, y: gy(cpCol) - P.SH }, time: 90 + Math.floor(W * 0.6), theme: (n - 1) % 4 };
  return L;
}
function generate(seed, n) {
  var L = null, v = null;
  for (var a = 0; a < 14; a++) {
    L = build(seed, n, a); v = validate(L);
    if (v.ok) { L.valid = true; L.attempt = a; L.script = v.script; L.vnodes = v.nodes; return L; }
  }
  L.valid = false; L.attempt = 14; return L;
}
// replay the validator's input script on a fresh enemy-free state: proves the flag is reachable with the real physics
function replay(L) { var st = newState(L, { noEn: true }); if (!L.script) return false; for (var i = 0; i < L.script.length; i++) { step(st, L.script[i]); if (st.p.dead) return false; if (st.p.won) return true; } return st.p.won; }

root.PF = { TS: TS, ROWS: ROWS, VW: VW, VH: VH, T: T, IN: IN, P: P, WALKER: WALKER, SPIKY: SPIKY, FLYER: FLYER, MV_PERIOD: MV_PERIOD, rng: rng, hash: hash, newState: newState, clone: clone, step: step, tileAt: tileAt, boxHit: boxHit,
  moverX: moverX, probe: probe, build: build, generate: generate, validate: validate, replay: replay };
})(typeof window !== 'undefined' ? window : globalThis);
