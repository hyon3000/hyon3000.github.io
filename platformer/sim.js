// Shape World - deterministic simulation (physics, entities, power-ups, bosses). No DOM: the same code runs in the game,
// in the auto-play planner, in the level validator and in the headless tests.
(function (root) {
'use strict';
var TS = 16, ROWS = 14, VW = 400, VH = 224;
var T = { AIR: 0, SOLID: 1, BRICK: 2, QC: 3, QP: 4, USED: 5, SPIKE: 6, VINE: 7, SPRING: 8, WATER: 9, CONVL: 10, CONVR: 11, SLR: 12, SLL: 13, LAVA: 14, CANL: 15, CANR: 16, STUMP: 17, PSW: 18, RING: 19, QS: 20, QM: 21, CURL: 22, CURR: 23, CURU: 24, GATE: 25, BRIDGE: 26, SWITCH: 27, SWUSED: 28, WLEVEL: 29, DOOR: 30, TELE: 31, LAUNCH: 32, ICE: 33, MUD: 34, FIRE: 35 };
var SOL = [0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
function isW(t) { return t === 9 || (t >= 22 && t <= 24); }
function fireOn(f, c) { return ((f + c * 17) % 130) < 55; }   // timed fire jet / laser at column c
var IN = { L: 1, R: 2, J: 4, RUN: 8, DN: 16, UP: 32, SPIN: 64 };
var P = { WALK: 1.4, RUN: 2.2, PRUN: 2.75, PMAX: 64, ACCG: 0.12, ACCA: 0.07, FRIC: 0.14, JUMP: -6.3, JRUN: 0.5, GUP: 0.28, GCUT: 0.7, GDN: 0.55, MAXFALL: 7.5,
          COY: 5, JBUF: 6, PW: 12, SH: 14, BH: 24, INV: 100, ACTIVE: 340, STAR: 600 };
var E = { WALKER: 0, SPIKY: 1, FLYER: 2, BEETLE: 3, BULLET: 4, CRUSH: 5, GHOST: 6, PLANT: 7, BOSS: 8, SWIM: 9, CHASER: 10, FMINE: 11, WHALE: 12, JELLY: 13, CLAM: 14, SWOOP: 15, FLOCK: 16, BALLOON: 17, SHOOTER: 18, BIRD: 19, SPARK: 20 };
var AIRMAX = 900;
var MV_PERIOD = 1440;

function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(a, b, c) { var h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
function tri(u) { var q = u - Math.floor(u); return q < 0.5 ? 4 * q - 1 : 3 - 4 * q; }

// ------------------------------------------------------------------ platforms (kind 0 horizontal, 1 vertical, 2 orbit, 3 falling)
function movOn(st, i, f) { var m = st.L.movers[i]; if (m.kind !== 4) return true; return ((f + Math.round(m.ph / 6.283185 * m.per)) % m.per) < m.per * 0.62; }
function movPos(st, i, f) {
  var m = st.L.movers[i], k = m.kind | 0, a = 6.283185307 * f / m.per + m.ph;
  if (k === 0) return { x: m.cx + m.amp * Math.sin(a) - m.w / 2, y: m.y };
  if (k === 1) return { x: m.cx - m.w / 2, y: m.y + m.amp * Math.sin(a) };
  if (k === 2) return { x: m.cx + m.amp * Math.cos(a) - m.w / 2, y: m.y + m.amp * Math.sin(a) };
  if (k === 4) return { x: m.cx - m.w / 2, y: m.y };
  return { x: m.cx - m.w / 2, y: m.y + st.mo[i].off };
}

// ------------------------------------------------------------------ state
var EMPTY = new Map();
function newState(L, o) {
  o = o || {};
  var s = o.cp ? L.cp : L.start;
  var st = { L: L, f: 0, mod: EMPTY, score: 0, coins: 0, t: Math.round(L.time * 60), cp: o.cp ? 1 : 0, ev: o.rec ? [] : null, noEn: !!o.noEn, noPM: !!o.noPM, sw: 0, sc: 0, boss: 0, tape: 0,
    p: { x: s.x, y: s.y, vx: 0, vy: 0, w: P.PW, h: P.SH, big: false, pw: 0, ground: true, coy: 0, jbuf: 0, jheld: false, sprev: false, rprev: true, face: 1, inv: 0, dead: false, won: false, mv: -1, anim: 0, why: '',
      pm: 0, spin: 0, star: 0, mount: 0, climb: false, carry: -1, swim: false, fbc: 0, air: AIRMAX, wasW: false, dtick: 0, tcd: 0 },
    en: [], it: [], fb: [], ep: [], cg: new Uint8Array(L.coins.length), sg: new Uint8Array((L.special || []).length), pk: new Uint8Array((L.pockets || []).length), mo: [], sb: 0, kb: 0, kg: new Uint8Array((L.keys || []).length), dg: new Uint8Array((L.doors || []).length), sg2: new Uint8Array((L.switches || []).length), tc: 0, stage: 0, cr: 0 };
  if (o.pw) { setPw(st.p, o.pw); } if (o.mount) st.p.mount = 1;
  for (var i = 0; i < L.movers.length; i++) st.mo.push({ off: 0, vy: 0, s: 0, t: 0 });
  if (!o.noEn) for (i = 0; i < L.enemies.length; i++) { var d = L.enemies[i];
    if (o.cp && d.t !== E.BOSS && d.x < L.cp.x + 120 && d.x > L.cp.x - 120) continue;
    var e = {}; for (var k in d) e[k] = d[k];
    e.vx = 0; e.vy = 0; e.alive = true; e.dt = 0; e.ground = false; e.sh = 0; e.kg = 0; e.s = 0; e.tm = 0; e.inv = 0; if (e.dir === undefined) e.dir = -1;
    if (e.t === E.BOSS) { e.hp = 3; st.boss++; }
    st.en.push(e); }
  return st;
}
function clone(st) {
  var c = {}, k; for (k in st) c[k] = st[k];
  c.p = {}; for (k in st.p) c.p[k] = st.p[k];
  var en = new Array(st.en.length), i, px = st.p.x; for (i = 0; i < en.length; i++) { var s = st.en[i]; if (st.share && Math.abs(s.x - px) > 600) { en[i] = s; continue; } var e = {}; for (k in s) e[k] = s[k]; en[i] = e; } c.en = en;
  c.it = st.it.length ? st.it.map(function (s) { var e = {}; for (var k in s) e[k] = s[k]; return e; }) : [];
  c.fb = st.fb.length ? st.fb.map(function (s) { return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, life: s.life }; }) : [];
  c.ep = st.ep.length ? st.ep.map(function (s) { return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, life: s.life }; }) : [];
  c.mo = st.mo.map(function (s) { return { off: s.off, vy: s.vy, s: s.s, t: s.t }; });
  c.cg = st.cg.slice(); c.sg = st.sg.slice(); c.pk = st.pk.slice(); c.kg = st.kg.slice(); c.dg = st.dg.slice(); c.sg2 = st.sg2.slice(); c.ev = null; return c;
}
function ev(st, k, x, y, a) { if (st.ev) st.ev.push({ k: k, x: x, y: y, a: a }); }
function setPw(p, v) { var nh = v > 0 ? P.BH : P.SH; p.y += p.h - nh; p.h = nh; p.pw = v; p.big = v > 0; }

function tileRaw(st, c, r) {
  var L = st.L;
  if (c < 0 || c >= L.w) return T.SOLID;
  var R = L.rows || ROWS; if (r < 0 || r >= R) return T.AIR;
  var i = c * R + r;
  if (st.mod.size) { var m = st.mod.get(i); if (m !== undefined) return m; }
  return L.tiles[i];
}
function tileAt(st, c, r) {
  var t = tileRaw(st, c, r); if (t === T.BRICK && st.sw > 0) return T.AIR;
  if (t >= 25 && t <= 29) { var g = st.L.grp ? st.L.grp[c * (st.L.rows || ROWS) + r] : 0, on = (st.sb >> g) & 1; if (t === T.GATE) return on ? 0 : T.GATE; if (t === T.BRIDGE) return on ? T.BRIDGE : 0; if (t === T.WLEVEL) return on ? T.WATER : 0; }
  return t;
}
function boxHit(st, x, y, w, h) {
  var c0 = Math.floor(x / TS), c1 = Math.floor((x + w - 1e-4) / TS), r0 = Math.floor(y / TS), r1 = Math.floor((y + h - 1e-4) / TS);
  for (var c = c0; c <= c1; c++) for (var r = r0; r <= r1; r++) if (SOL[tileAt(st, c, r)]) return true;
  return false;
}
function setTile(st, c, r, t) { if (st.mod === EMPTY) st.mod = new Map(); st.mod.set(c * (st.L.rows || ROWS) + r, t); }
function isSolidTile(t) { return SOL[t] === 1; }
function slopeY(t, c, r, x) { return t === T.SLR ? (r + 1) * TS - (x - c * TS) : r * TS + (x - c * TS); }

// ------------------------------------------------------------------ bumping blocks from below
function bump(st, r) {
  var p = st.p, c0 = Math.floor(p.x / TS), c1 = Math.floor((p.x + p.w - 1e-4) / TS), best = -1, bd = 1e9, cx = p.x + p.w / 2;
  for (var c = c0; c <= c1; c++) { var t = tileAt(st, c, r); if (SOL[t]) { var d = Math.abs(c * TS + 8 - cx); if (d < bd) { bd = d; best = c; } } }
  if (best < 0) return;
  var t2 = tileAt(st, best, r), x = best * TS + 8, y = r * TS;
  if (t2 === T.BRICK) { if (p.big) { setTile(st, best, r, T.AIR); st.score += 50; ev(st, 'brick', x, y + 8); } else ev(st, 'bump', x, y + 8); }
  else if (t2 === T.QC) { setTile(st, best, r, T.USED); st.coins++; st.score += 10; ev(st, 'coinpop', x, y - 4); }
  else if (t2 === T.QP || t2 === T.QS || t2 === T.QM) {
    setTile(st, best, r, T.USED);
    var k = t2 === T.QS ? 3 : t2 === T.QM ? (p.mount ? 0 : 4) : (p.pw === 0 ? 0 : p.pw === 1 ? ((best + r) & 1 ? 1 : 2) : ((best + r) & 1 ? 3 : 1));
    st.it.push({ k: k, x: best * TS + 2, y: y, w: 12, h: 12, vx: k === 1 || k === 2 ? 0 : 0.7, vy: 0, em: 14, alive: true, ground: false });
    ev(st, 'item', x, y - 4);
  }
  else if (t2 === T.PSW) { setTile(st, best, r, T.USED); st.sw = 480; ev(st, 'pswitch', x, y); }
  else ev(st, 'bump', x, y + 8);
  // enemies standing on the bumped block get flipped over
  for (var i = 0; i < st.en.length; i++) { var e = st.en[i]; if (e.alive && e.t <= E.BEETLE && e.t !== E.SPIKY && Math.abs(e.x + e.w / 2 - x) < 12 && Math.abs(e.y + e.h - y) < 4) { killEnemy(st, e, 100); } }
}
function dropLoot(st, e) { if (e.t === E.BIRD && e.carry) { st.it.push({ k: 5, x: e.x, y: e.y, w: 12, h: 12, vx: 0, vy: 0, em: 0, alive: true, ground: false }); ev(st, 'drop', e.x, e.y); } }
function killEnemy(st, e, pts) {
  if (e.t === E.BOSS || e.t === E.CRUSH || e.t === E.WHALE) return;
  dropLoot(st, e);
  e.alive = false; e.dt = 24; st.score += pts || 100; ev(st, 'kill', e.x + e.w / 2, e.y, pts || 100);
}

// ------------------------------------------------------------------ entity movement
function moveEnt(st, o, g) {
  var hw = false;
  o.vy = Math.min(P.MAXFALL, o.vy + (g === undefined ? P.GDN * 0.8 : g));
  var nx = o.x + o.vx;
  if (boxHit(st, nx, o.y, o.w, o.h)) { if (o.vx > 0) o.x = Math.floor((nx + o.w - 1e-4) / TS) * TS - o.w; else if (o.vx < 0) o.x = (Math.floor(nx / TS) + 1) * TS; hw = true; } else o.x = nx;
  var ny = o.y + o.vy; o.ground = false;
  if (boxHit(st, o.x, ny, o.w, o.h)) { if (o.vy > 0) { o.y = Math.floor((ny + o.h - 1e-4) / TS) * TS - o.h; o.ground = true; } else o.y = (Math.floor(ny / TS) + 1) * TS; o.vy = 0; } else o.y = ny;
  return hw;
}
function hurt(st, why) {
  var p = st.p;
  if (p.inv > 0 || p.dead || p.star > 0) return;
  if (p.carry >= 0) { var ce = st.en[p.carry]; if (ce) { ce.sh = 1; ce.carried = false; } p.carry = -1; }
  if (p.mount) { p.mount = 0; p.inv = P.INV; ev(st, 'hurt', p.x, p.y); return; }
  if (p.pw > 0) { setPw(p, 0); p.inv = P.INV; ev(st, 'hurt', p.x, p.y); }
  else { p.dead = true; p.why = why; ev(st, 'die', p.x, p.y); }
}
function dieNow(st, why) { var p = st.p; if (p.dead) return; p.dead = true; p.why = why; ev(st, 'die', p.x, p.y); }
function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function updEnemy(st, e, f) {
  var p = st.p, i, hw;
  if (e.t >= 9) { var anc = e.ax !== undefined ? e.ax : e.x; if (Math.abs(anc - p.x) > P.ACTIVE + 100) return; }
  switch (e.t) {
    case 9: e.x = e.ax + e.rg * tri(f * e.sp + e.ph); e.y = e.ay + Math.sin(f * 0.07 + e.ph * 6.283) * e.am; e.dir = tri((f + 1) * e.sp + e.ph) > tri(f * e.sp + e.ph) ? 1 : -1; return;
    case 10: { var cdx = p.x + p.w / 2 - e.x - e.w / 2, cdy = p.y + p.h / 2 - e.y - e.h / 2, cd = Math.max(1, Math.sqrt(cdx * cdx + cdy * cdy)), vx, vy;
      if (cd < 115 && isW(tileAt(st, Math.floor((p.x + 6) / TS), Math.floor((p.y + 7) / TS)))) { vx = cdx / cd * 0.95; vy = cdy / cd * 0.95; e.s = 1; }
      else { var hx = e.ax - e.x, hy = e.ay - e.y, hd = Math.max(1, Math.sqrt(hx * hx + hy * hy)); vx = hd < 2 ? 0 : hx / hd * 0.45; vy = hd < 2 ? 0 : hy / hd * 0.45; e.s = 0; }
      if (isW(tileAt(st, Math.floor((e.x + e.w / 2 + vx * 6) / TS), Math.floor((e.y + e.h / 2 + vy * 6) / TS)))) { e.x += vx; e.y += vy; } if (vx) e.dir = vx > 0 ? 1 : -1; return; }
    case 11: e.x = e.ax; e.y = e.ay + Math.sin(f * 0.05 + e.ph * 6.283) * e.am; return;
    case 12: e.x = e.ax + e.rg * tri(f * e.sp + e.ph); e.y = e.ay + Math.sin(f * 0.03 + e.ph * 6.283) * 3; e.dir = tri((f + 1) * e.sp + e.ph) > tri(f * e.sp + e.ph) ? 1 : -1; return;
    case 13: e.x = e.ax + Math.sin(f * 0.02 + e.ph * 6.283) * 14; e.y = e.ay + Math.sin(f * 0.04 + e.ph * 6.283) * 8; e.pul = 0.5 + 0.5 * Math.sin(f * 0.1 + e.ph * 6.283); return;
    case 14: { var cph = (f + e.pho) % 180, open = cph < 90; if (!open) e.pg = 0; e.s = open ? 1 : 0;
      if (open && !e.pg && p.x < e.x + e.w && p.x + p.w > e.x && p.y + p.h > e.y - 8 && p.y < e.y + e.h) { e.pg = 1; st.score += 300; st.coins += 3; ev(st, 'pearl', e.x + e.w / 2, e.y); } return; }
    case 15:
      if (e.s === 0) { e.x = e.ax + Math.sin(f * 0.03 + e.ph * 6.283) * 18; e.y = e.ay + Math.sin(f * 0.07 + e.ph * 6.283) * 5; if (Math.abs(p.x - e.x) < 120 && p.y > e.y + 20) { e.s = 1; e.tx = p.x + p.w / 2; e.ty = p.y + p.h / 2; e.tm = 0; } }
      else if (e.s === 1) { e.tm++; var sdx = e.tx - e.x - e.w / 2, sdy = e.ty - e.y - e.h / 2, sd = Math.max(1, Math.sqrt(sdx * sdx + sdy * sdy)); e.x += sdx / sd * 2.3; e.y += sdy / sd * 2.3; e.dir = sdx > 0 ? 1 : -1; if (sd < 5 || e.tm > 70) { e.s = 2; e.tm = 0; } }
      else { var rx = e.ax - e.x, ry = e.ay - e.y, rd = Math.max(1, Math.sqrt(rx * rx + ry * ry)); e.x += rx / rd * 1.3; e.y += ry / rd * 1.3; if (rd < 3) e.s = 0; }
      return;
    case 16: e.x = e.ax + e.rg * tri(f * e.sp + e.ph) + e.ox; e.y = e.by + e.oy + Math.sin(f * 0.12 + e.idx) * 2; e.dir = tri((f + 1) * e.sp + e.ph) > tri(f * e.sp + e.ph) ? 1 : -1; return;
    case 17: e.x = e.ax + 22 * Math.sin(f * 0.012 + e.ph * 6.283); e.y = e.ay + 12 * Math.sin(f * 0.02 + e.ph * 9); return;
    case 18: { e.y = e.ay + Math.sin(f * 0.05 + e.ph * 6.283) * 4; var shx = p.x + p.w / 2 - e.x - e.w / 2, shy = p.y + p.h / 2 - e.y - e.h / 2; e.dir = shx > 0 ? 1 : -1;
      if (Math.abs(shx) < 230 && Math.abs(shy) < 160 && (f + e.pho) % 130 === 0) { var sdd = Math.max(1, Math.sqrt(shx * shx + shy * shy)); st.ep.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, vx: shx / sdd * 1.6, vy: shy / sdd * 1.6, life: 230 }); ev(st, 'spit', e.x, e.y); } return; }
    case 20: { var rt = (tri(f * e.sp + e.ph) + 1) / 2; e.x = e.x0 + (e.x1 - e.x0) * rt - e.w / 2; e.y = e.y0 + (e.y1 - e.y0) * rt - e.h / 2; return; }
    case 19:
    case 2:   // flyer / bird
      if (Math.abs(e.ax - p.x) > P.ACTIVE + 60) return;
      e.x = e.ax + e.rg * tri(f * e.sp + e.ph); e.y = e.ay + Math.sin(f * 0.08 + e.ph * 6.283) * e.am; e.dir = tri((f + 1) * e.sp + e.ph) > tri(f * e.sp + e.ph) ? 1 : -1; return;
    case 0: case 1: case 3:
      if (Math.abs(e.x - p.x) > P.ACTIVE) return;
      if (e.t === 3 && e.sh === 1) { moveEnt(st, e); return; }
      if (e.t === 3 && e.carried) return;
      if (e.t === 3 && e.sh === 2) {
        e.vx = e.dir * 3.4; if (e.kg > 0) e.kg--;
        hw = moveEnt(st, e); if (hw) e.dir = -e.dir;
        for (i = 0; i < st.en.length; i++) { var o = st.en[i]; if (o !== e && o.alive && o.t !== E.BOSS && o.t !== E.CRUSH && overlap(e, o) && !(o.t === 3 && o.sh === 1 && false)) { killEnemy(st, o, 200); } }
        if (e.y > (st.L.rows || ROWS) * TS + 40) e.alive = false; return;
      }
      e.vx = e.dir * e.spd; hw = moveEnt(st, e);
      if (hw) e.dir = -e.dir;
      else if (e.ground) { var ax = e.vx > 0 ? e.x + e.w + 1 : e.x - 1, c = Math.floor(ax / TS), rr = Math.floor((e.y + e.h + 2) / TS), tt = tileAt(st, c, rr); if (!SOL[tt] && tt !== T.SLR && tt !== T.SLL) e.dir = -e.dir; }
      if (e.x < e.mn) { e.x = e.mn; e.dir = 1; } else if (e.x + e.w > e.mx) { e.x = e.mx - e.w; e.dir = -1; }
      if (e.y > (st.L.rows || ROWS) * TS + 40) e.alive = false; return;
    case 4:   // bullet
      e.x += e.vx; if (++e.tm > 420 || boxHit(st, e.x, e.y, e.w, e.h)) { e.alive = false; e.dt = 8; } return;
    case 5: { // crusher
      if (Math.abs(e.x - p.x) > P.ACTIVE) return;
      if (e.s === 0) { if (Math.abs(p.x + p.w / 2 - e.x - e.w / 2) < 10 && p.y > e.y) { e.s = 1; e.vy = 1.5; } }
      else if (e.s === 1) { e.vy = Math.min(9.5, e.vy + 0.8); var ny = e.y + e.vy; if (boxHit(st, e.x, ny, e.w, e.h)) { e.y = Math.floor((ny + e.h - 1e-4) / TS) * TS - e.h; e.s = 2; e.tm = 34; ev(st, 'thud', e.x + e.w / 2, e.y + e.h); } else e.y = ny; }
      else if (e.s === 2) { if (--e.tm <= 0) e.s = 3; }
      else { e.y -= 1.1; if (e.y <= e.y0) { e.y = e.y0; e.s = 0; } }
      return; }
    case 6: { // shy wisp: drifts toward the hero, freezes while the hero looks at it
      var dx = p.x + p.w / 2 - e.x - e.w / 2, dy = p.y + p.h / 2 - e.y - e.h / 2, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 230 || d < 1) return; e.dir = dx > 0 ? 1 : -1;
      if ((p.face > 0 && dx > 0) || (p.face < 0 && dx < 0)) { if (d < 130) return; }
      e.x += dx / d * 0.55; e.y += dy / d * 0.55; return; }
    case 7: { // plant on a stump: rises, waits, sinks; stays down while the hero is right next to it
      var ph = (f + e.ph) % 220, up;
      if (ph < 40) up = ph / 40; else if (ph < 120) up = 1; else if (ph < 160) up = 1 - (ph - 120) / 40; else up = 0;
      if (Math.abs(p.x + p.w / 2 - e.x - e.w / 2) < 18) up = Math.min(up, e.up || 0);
      e.up = up; e.y = e.y0 - up * 18; e.hid = up < 0.25; return; }
    case 8: updBoss(st, e, f); return;
  }
}
function updBoss(st, e, f) {
  var p = st.p; if (e.inv > 0) e.inv--;
  var dx = p.x + p.w / 2 - e.x - e.w / 2;
  if (!e.awake) { if (Math.abs(dx) < 190) e.awake = true; else return; }
  if (e.v === 0) {         // leaper
    e.tm++;
    if (e.ground) { e.vx = 0.0; if (e.tm > 80) { e.vy = -7.2; e.vx = (dx > 0 ? 1 : -1) * 1.5; e.tm = 0; } else e.vx = (dx > 0 ? 0.35 : -0.35); }
    moveEnt(st, e, 0.5); if (e.x < e.mn) e.x = e.mn; if (e.x + e.w > e.mx) e.x = e.mx - e.w;
  } else if (e.v === 1) {  // hovering spitter
    e.tm++; e.x = e.ax + 70 * Math.sin(f * 0.02); e.y = e.ay + 18 * Math.sin(f * 0.05);
    if (e.tm % 100 === 60) { var sx = e.x + e.w / 2, sy = e.y + e.h / 2, d = Math.max(1, Math.sqrt(dx * dx + 400)); st.ep.push({ x: sx, y: sy, vx: dx / d * 1.7, vy: 0.9, life: 260 }); ev(st, 'spit', sx, sy); }
  } else if (e.v === 3) {  // tidal swimmer (water arena)
    e.tm++; var by3 = e.ay + Math.sin(f * 0.06) * 10; e.y = by3;
    if (e.s === 0) { e.dir = dx > 0 ? 1 : -1; e.x += e.dir * 0.9; if (e.tm > 110) { e.s = 1; e.tm = 0; } } else { e.x += e.dir * 2.7; if (e.tm > 34) { e.s = 0; e.tm = 0; } }
    if (e.x < e.mn) e.x = e.mn; if (e.x + e.w > e.mx) e.x = e.mx - e.w;
  } else if (e.v === 4) {  // storm bird: hovers, drops sparks, dives
    e.tm++;
    if (e.s === 0) { e.x += (dx > 0 ? 0.8 : -0.8); e.y = e.ay + Math.sin(f * 0.07) * 8; if (e.x < e.mn) e.x = e.mn; if (e.x + e.w > e.mx) e.x = e.mx - e.w; if (e.tm % 55 === 30) st.ep.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: 0, vy: 1.3, life: 160 }); if (e.tm > 150) { e.s = 1; e.tm = 0; e.tx = p.x + p.w / 2; e.ty = p.y + p.h / 2; } }
    else if (e.s === 1) { var qx = e.tx - e.x - e.w / 2, qy = e.ty - e.y - e.h / 2, qd = Math.max(1, Math.sqrt(qx * qx + qy * qy)); e.x += qx / qd * 3.2; e.y += qy / qd * 3.2; e.dir = qx > 0 ? 1 : -1; if (qd < 6 || e.tm > 55) { e.s = 2; e.tm = 0; } }
    else { var ux = e.ax - e.x, uy = e.ay - e.y, ud = Math.max(1, Math.sqrt(ux * ux + uy * uy)); e.x += ux / ud * 1.7; e.y += uy / ud * 1.7; if (ud < 4) { e.s = 0; e.tm = 0; } }
  } else {                 // charger
    e.tm++;
    if (e.s === 0) { e.vx = 0; if (e.tm > 45) { e.s = 1; e.dir = dx > 0 ? 1 : -1; e.tm = 0; } }
    else if (e.s === 1) { e.vx = e.dir * 2.5; if (moveEnt(st, e, 0.5)) { e.s = 2; e.tm = 0; ev(st, 'thud', e.x + e.w / 2, e.y + e.h); } }
    else { e.vx = 0; moveEnt(st, e, 0.5); if (e.tm > 60) { e.s = 0; e.tm = 0; } }
    if (e.s !== 1) moveEnt(st, e, 0.5);
  }
}
function hitBoss(st, e, dmg) {
  if (e.inv > 0) return false;
  e.hp -= dmg; e.inv = 55; ev(st, 'bosshit', e.x + e.w / 2, e.y);
  if (e.hp <= 0) { e.alive = false; e.dt = 70; st.score += 3000; st.boss--; ev(st, 'bossdead', e.x + e.w / 2, e.y); }
  return true;
}

function stageDone(st, g) {
  switch (g.k) {
    case 'key': return ((st.kb >> g.g) & 1) === 1;
    case 'sw': return ((st.sb >> g.g) & 1) === 1;
    case 'door': return st.dg[g.i] === 1;
    case 'tele': return st.tc >= g.n;
    case 'xge': return st.p.x >= g.x;
    case 'goal': return st.p.won;
  }
  return true;
}
// ------------------------------------------------------------------ the step
function step(st, inp) {
  var L = st.L, p = st.p, f = st.f, i, e;
  if (p.dead || p.won) { st.f++; return; }
  var left = inp & 1, right = inp & 2, spinIn = inp & 64, jump = (inp & 4) || spinIn, run = inp & 8, up = inp & 32, down = inp & 16, dir = (right ? 1 : 0) - (left ? 1 : 0);
  // --- switch timer (bricks are coins while active): never leave the hero stuck inside a brick when it ends
  if (st.sw > 0) { st.sw--; if (st.sw === 0) { var guard = 0; while (boxHit(st, p.x, p.y, p.w, p.h) && guard++ < 40) p.y -= 1; } }
  // --- platforms
  for (i = 0; i < st.mo.length; i++) { var m = L.movers[i];
    if (m.kind === 3) { var ms = st.mo[i];
      if (ms.s === 0) { if (p.mv === i) { ms.s = 1; ms.t = 20; } } else if (ms.s === 1) { if (--ms.t <= 0) { ms.s = 2; ms.vy = 0; } }
      else if (ms.s === 2) { ms.vy = Math.min(6, ms.vy + 0.3); ms.off += ms.vy; if (ms.off > 260) { ms.s = 3; ms.t = 260; } }
      else { if (--ms.t <= 0) { ms.s = 0; ms.off = 0; ms.vy = 0; } } } }
  var mp0 = null, mp1 = null;
  if (st.mo.length) { mp0 = []; mp1 = []; for (i = 0; i < st.mo.length; i++) { mp0.push(movPos(st, i, f)); mp1.push(movPos(st, i, f + 1)); } }
  if (p.mv >= 0 && p.ground && movOn(st, p.mv, f + 1)) { p.x += mp1[p.mv].x - mp0[p.mv].x; p.y += mp1[p.mv].y - mp0[p.mv].y; }
  var cx0 = p.x + p.w / 2, cell = tileAt(st, Math.floor(cx0 / TS), Math.floor((p.y + p.h * 0.5) / TS));
  var inW = isW(cell), feetW = isW(tileAt(st, Math.floor(cx0 / TS), Math.floor((p.y + p.h - 1) / TS)));
  var curPush = cell === T.CURL ? -0.05 : cell === T.CURR ? 0.05 : 0, curUp = cell === T.CURU ? -0.4 : 0;
  if (inW !== p.wasW) { ev(st, 'splash', cx0, p.y + p.h / 2, inW ? 1 : 0); p.wasW = inW; }
  if (inW) { if (!st.noEn) p.air--; if (p.air <= 0) { p.air = 0; if (p.dtick++ % 55 === 0) hurt(st, 'drown'); } } else { p.air = Math.min(AIRMAX, p.air + 8); p.dtick = 0; }
  var jEdge = jump && !p.jheld;
  // --- vines
  if (!p.climb && up && cell === T.VINE) { p.climb = true; p.vx = 0; p.vy = 0; p.ground = false; p.mv = -1; }
  if (p.climb) {
    if (cell !== T.VINE && !(tileAt(st, Math.floor(cx0 / TS), Math.floor((p.y + p.h - 1) / TS)) === T.VINE)) p.climb = false;
    else if (jEdge) { p.climb = false; p.vy = P.JUMP * 0.85; p.vx = dir * 1.6; }
    else {
      var cvx = dir * 1.1, cvy = up ? -1.2 : down ? 1.2 : 0;
      if (cvx && !boxHit(st, p.x + cvx, p.y, p.w, p.h)) p.x += cvx; if (cvy && !boxHit(st, p.x, p.y + cvy, p.w, p.h)) p.y += cvy;
      p.vx = 0; p.vy = 0; p.jheld = !!jump; p.anim += 0.1; if (p.y + p.h < 0) p.climb = false;
    }
  }
  var carried = 0;
  if (!p.climb) {
    // --- run / P-meter
    var maxv = run ? P.RUN : P.WALK, onIce = false, inMud = false;
    if (L.hasIce && p.ground) { onIce = tileAt(st, Math.floor(cx0 / TS), Math.floor((p.y + p.h + 0.5) / TS)) === T.ICE; }
    if (L.hasMud) { inMud = tileAt(st, Math.floor(cx0 / TS), Math.floor((p.y + p.h * 0.6) / TS)) === T.MUD; if (inMud) maxv *= 0.5; }
    if (p.ground && run && dir && dir * p.vx > 0 && Math.abs(p.vx) >= P.RUN - 0.06) { if (p.pm < P.PMAX) p.pm++; } else if (p.ground) p.pm = Math.max(0, p.pm - 2); else if (!run) p.pm = Math.max(0, p.pm - 0.5);
    var pfull = p.pm >= P.PMAX && run && !st.noPM; if (pfull) maxv = P.PRUN;
    if (inW) maxv *= 0.65;
    if (dir) {
      var tv = dir * maxv, acc = p.ground ? (onIce ? P.ACCG * 0.3 : P.ACCG) : P.ACCA; if (p.ground && dir * p.vx < 0) acc *= (onIce ? 1 : 2);
      if (p.vx < tv) p.vx = Math.min(tv, p.vx + acc); else if (p.vx > tv) p.vx = Math.max(tv, p.vx - (p.ground ? P.FRIC : 0.015));
      p.face = dir;
    } else if (p.ground) { var fr2 = onIce ? P.FRIC * 0.12 : P.FRIC; if (p.vx > 0) p.vx = Math.max(0, p.vx - fr2); else p.vx = Math.min(0, p.vx + fr2); }
    // --- jump / swim
    if (p.ground) p.coy = P.COY; else if (p.coy > 0) p.coy--;
    if (jEdge) p.jbuf = P.JBUF; else if (p.jbuf > 0) p.jbuf--;
    if (inW) {
      if (jump) p.vy = Math.max(p.vy - 0.30, -1.9); else p.vy = Math.min(p.vy + 0.10, 1.3);
      if (jEdge && !p.ground) ev(st, 'swim', p.x, p.y);
    } else {
      if (feetW && !p.ground && (jEdge || (jump && p.vy < -1.0 && p.vy > -2.2))) { p.vy = -4.6; p.jbuf = 0; ev(st, 'jump', p.x, p.y + p.h); }   // breaching the surface: a hop out of the water
      else if (p.jbuf > 0 && p.coy > 0) {
        p.vy = P.JUMP - P.JRUN * Math.abs(p.vx) / P.RUN - (pfull ? 0.7 : 0); if (p.mount) p.vy *= 1.08;
        if (spinIn) { p.vy *= 0.92; p.spin = 26; }
        p.jbuf = 0; p.coy = 0; p.ground = false; p.mv = -1; ev(st, spinIn ? 'spin' : 'jump', p.x, p.y + p.h);
      }
      var g = p.vy < 0 ? ((jump || p.tcd > 18) ? P.GUP : P.GCUT) : P.GDN;
      p.vy = Math.min(inMud ? 1.6 : P.MAXFALL, p.vy + g);
      if (p.pw === 3 && !p.ground && p.vy > 1.0 && jump) { p.vy = 1.0; p.glide = true; } else p.glide = false;
    }
    if (p.spin > 0) p.spin--;
    p.jheld = !!jump;
    if (inW) { p.vx += curPush; p.vy += curUp; if (curUp) p.vy = Math.max(p.vy, -2.6); }
    if (L.winds) for (i = 0; i < L.winds.length; i++) { var wz = L.winds[i]; if (cx0 > wz.x0 && cx0 < wz.x1 && p.y + p.h / 2 > wz.y0 && p.y + p.h / 2 < wz.y1) { p.vx += wz.dx * (p.ground ? 0.35 : 1); if (wz.dx) p.vx = Math.max(-3.4, Math.min(3.4, p.vx)); if (wz.dy) { p.vy += wz.dy; if (wz.dy < 0) p.vy = Math.max(p.vy, -2.7); } } }
    // --- conveyor under the feet
    if (p.ground) { var tb = tileAt(st, Math.floor(cx0 / TS), Math.floor((p.y + p.h + 0.5) / TS)); if (tb === T.CONVL) carried = -0.7; else if (tb === T.CONVR) carried = 0.7; }
    // --- move x
    var nx = p.x + p.vx + carried;
    var stepY = null;
    var onSl = false;
    if (p.ground) { var bb0 = p.y + p.h; for (var xo = 0; xo < 2 && !onSl; xo++) { var co = Math.floor((xo ? p.x + p.w - 1 : p.x + 1) / TS), ro = Math.floor((bb0 - 0.01) / TS); for (var dro = 0; dro < 2; dro++) { var to = tileAt(st, co, ro + dro); if (to === T.SLR || to === T.SLL) onSl = true; } } }
    if (p.ground && boxHit(st, nx, p.y, p.w, p.h)) {         // walking into the foot of a slope: lift the hero onto it instead of treating its fill as a wall
      for (var lift = 1; lift <= TS && stepY === null; lift++) {
        var ny0 = p.y - lift; if (boxHit(st, nx, ny0, p.w, p.h)) continue;
        var bot0 = ny0 + p.h, sup = false, xs0 = [nx + 1, nx + p.w - 1];
        for (var xq = 0; xq < 2 && !sup; xq++) { var cq = Math.floor(xs0[xq] / TS), rq = Math.floor((bot0 - 0.01) / TS);
          for (var dq = 0; dq < 2 && !sup; dq++) { var tq = tileAt(st, cq, rq + dq); if (tq === T.SLR || tq === T.SLL) { var sq = slopeY(tq, cq, rq + dq, xs0[xq]); if (sq >= bot0 - 1.5 && sq <= bot0 + TS) sup = true; } } }
        if (!sup && onSl && boxHit(st, nx, ny0 + 1, p.w, p.h)) sup = true;      // the top of a ramp: step onto the flat that continues it
        if (sup) stepY = ny0; else break;                     // free above but nothing slanted to stand on: it is a real wall
      }
    }
    if (stepY !== null) { p.x = nx; p.y = stepY; }
    else if (boxHit(st, nx, p.y, p.w, p.h)) { if (p.vx + carried > 0) p.x = Math.floor((nx + p.w - 1e-4) / TS) * TS - p.w; else p.x = (Math.floor(nx / TS) + 1) * TS; if (carried === 0 || (p.vx + carried) * p.vx <= 0) p.vx = 0; else p.vx = 0; }
    else { p.x = nx; if (p.x < 0) { p.x = 0; p.vx = 0; } }
    // --- move y
    var ny = p.y + p.vy, wasGround = p.ground, prevB = p.y + p.h; p.ground = false; p.mv = -1;
    if (p.vy >= 0) {
      if (boxHit(st, p.x, ny, p.w, p.h)) {
        var rr0 = Math.floor((ny + p.h - 1e-4) / TS); p.y = rr0 * TS - p.h; p.ground = true;
        if (tileAt(st, Math.floor((p.x + p.w / 2) / TS), rr0) === T.SPRING && p.vy > 1) { p.vy = jump ? -11.8 : -8.8; p.ground = false; ev(st, 'spring', p.x, p.y + p.h); } else p.vy = 0;
      } else {
        var landed = false;
        for (var mi = 0; mi < st.mo.length; mi++) { var q1 = mp1[mi], mw = L.movers[mi].w;
          if (movOn(st, mi, f + 1) && p.x + p.w > q1.x + 1 && p.x < q1.x + mw - 1 && prevB <= q1.y + 2 + Math.max(0, q1.y - mp0[mi].y) && ny + p.h >= q1.y) { p.y = q1.y - p.h; p.vy = 0; p.ground = true; p.mv = mi; landed = true; break; } }
        if (!landed) p.y = ny;
      }
    } else {
      if (boxHit(st, p.x, ny, p.w, p.h)) { var r = Math.floor(ny / TS); p.y = (r + 1) * TS; p.vy = 0; bump(st, r); } else p.y = ny;
    }
    // --- slopes: stand on the highest of the two feet
    if (p.vy >= 0 || p.ground) {
      var bot = p.y + p.h, best = 1e9, xs = [p.x + 1, p.x + p.w - 1];
      for (var xi = 0; xi < 2; xi++) { var cc = Math.floor(xs[xi] / TS), r0 = Math.floor((bot - 0.01) / TS);
        for (var dr = 0; dr < 2; dr++) { var tt = tileAt(st, cc, r0 + dr); if (tt === T.SLR || tt === T.SLL) { var sy = slopeY(tt, cc, r0 + dr, xs[xi]); if (bot >= sy - (wasGround ? 5 : 0) && bot <= sy + TS && sy < best) best = sy; } } }
      if (best < 1e8 && !(p.vy < 0)) { p.y = best - p.h; p.vy = 0; p.ground = true; }
    }
    if (p.ground && !wasGround) ev(st, 'land', p.x, p.y + p.h);
  }
  if (p.inv > 0) p.inv--;
  if (p.star > 0) p.star--;
  p.anim += Math.abs(p.vx) * 0.12;
  // --- warp ring / secret door
  if (up && !p.climb && tileAt(st, Math.floor((p.x + p.w / 2) / TS), Math.floor((p.y + p.h / 2) / TS)) === T.RING && L.rings) {
    var rc = Math.floor((p.x + p.w / 2) / TS); for (i = 0; i < L.rings.length; i++) if (L.rings[i].c === rc) { ev(st, 'warp', rc * TS, p.y, i); break; }
  }
  // --- fireballs (run key press while fire-powered)
  if (p.pw === 2 && run && !p.rprev && st.fb.length < 2 && !p.climb) { st.fb.push({ x: p.x + p.w / 2 + p.face * 6, y: p.y + 9, vx: p.face * 3.4, vy: 0, life: 150 }); ev(st, 'fire', p.x, p.y); }
  p.rprev = !!run;
  for (i = st.fb.length - 1; i >= 0; i--) { var b = st.fb[i]; b.vy += 0.32; b.x += b.vx;
    if (boxHit(st, b.x - 3, b.y - 3, 6, 6)) { st.fb.splice(i, 1); continue; }
    b.y += b.vy; if (boxHit(st, b.x - 3, b.y - 3, 6, 6)) { b.y -= b.vy; b.vy = -3.2; }
    if (--b.life <= 0 || Math.abs(b.x - p.x) > 300 || b.y > (L.rows || ROWS) * TS + 10) { st.fb.splice(i, 1); continue; }
    for (var j = 0; j < st.en.length; j++) { var o = st.en[j]; if (!o.alive || (o.t === 7 && o.hid)) continue;
      if (b.x > o.x - 3 && b.x < o.x + o.w + 3 && b.y > o.y - 3 && b.y < o.y + o.h + 3) { if (o.t === 8) hitBoss(st, o, 1); else if (o.t !== 5) killEnemy(st, o, 100); st.fb.splice(i, 1); ev(st, 'fireburst', b.x, b.y); break; } } }
  // --- cannons
  if (L.cannons) for (i = 0; i < L.cannons.length; i++) { var cn = L.cannons[i];
    if (Math.abs(cn.x - p.x) < 250 && (f + cn.ph) % cn.per === 0) { var nb = 0; for (j = 0; j < st.en.length; j++) if (st.en[j].t === 4 && st.en[j].alive) nb++;
      if (nb < 3 && !st.noEn) { st.en.push({ t: 4, x: cn.x + (cn.dir > 0 ? 14 : -10), y: cn.y + 3, w: 12, h: 10, vx: cn.dir * 1.8, vy: 0, dir: cn.dir, alive: true, dt: 0, tm: 0, ground: false, sh: 0, kg: 0, s: 0, inv: 0 }); ev(st, 'cannon', cn.x, cn.y); } } }
  // --- enemies / items / projectiles
  for (i = 0; i < st.en.length; i++) { e = st.en[i]; if (!e.alive) { if (e.dt > 0) e.dt--; continue; } var oex = e.x, oey = e.y; updEnemy(st, e, f); e.dvx = e.x - oex; e.dvy = e.y - oey; }
  for (i = st.ep.length - 1; i >= 0; i--) { var pr = st.ep[i]; pr.x += pr.vx; pr.y += pr.vy; pr.vy += 0.01; if (--pr.life <= 0 || boxHit(st, pr.x - 3, pr.y - 3, 6, 6)) { st.ep.splice(i, 1); continue; }
    if (pr.x > p.x - 3 && pr.x < p.x + p.w + 3 && pr.y > p.y - 3 && pr.y < p.y + p.h + 3) { st.ep.splice(i, 1); hurt(st, 'shot'); } }
  for (i = 0; i < st.it.length; i++) { e = st.it[i]; if (!e.alive) continue;
    if (e.em > 0) { e.em--; e.y -= 1.2; continue; }
    if (e.k === 0 || e.k === 4 || e.k === 5) { if (moveEnt(st, e)) e.vx = -e.vx; }
    else if (e.k === 3) { if (moveEnt(st, e)) e.vx = -e.vx; if (e.ground) e.vy = -4.6; }
    else { e.vy = Math.min(1, (e.vy || 0) + 0.05); if (!boxHit(st, e.x, e.y + e.vy, e.w, e.h)) e.y += e.vy; }
    if (e.y > (L.rows || ROWS) * TS + 40) { e.alive = false; continue; }
    if (overlap(p, e)) {
      e.alive = false;
      if (e.k === 0) { if (p.pw === 0 && !boxHit(st, p.x, p.y - (P.BH - P.SH), p.w, P.BH)) { setPw(p, 1); st.score += 200; ev(st, 'grow', p.x, p.y); } else { st.score += 300; ev(st, 'pow2', p.x, p.y); } }
      else if (e.k === 1) { if (p.pw !== 2) { if (p.pw === 0 && boxHit(st, p.x, p.y - (P.BH - P.SH), p.w, P.BH)) st.score += 200; else setPw(p, 2); } st.score += 500; ev(st, 'grow', p.x, p.y); }
      else if (e.k === 2) { if (p.pw !== 3) { if (p.pw === 0 && boxHit(st, p.x, p.y - (P.BH - P.SH), p.w, P.BH)) st.score += 200; else setPw(p, 3); } st.score += 500; ev(st, 'grow', p.x, p.y); }
      else if (e.k === 3) { p.star = P.STAR; st.score += 1000; ev(st, 'star', p.x, p.y); }
      else if (e.k === 5) { st.coins += 5; st.score += 500; ev(st, 'treasure', p.x, p.y); }
      else { if (!p.mount) { p.mount = 1; ev(st, 'mount', p.x, p.y); } st.score += 500; }
    } }
  // --- carried shell follows the hero
  if (p.carry >= 0) { e = st.en[p.carry]; if (!e || !e.alive) p.carry = -1; else if (!run) { e.carried = false; e.sh = 2; e.dir = p.face; e.kg = 14; e.x = p.x + p.face * 12 + (p.face < 0 ? -2 : 0); e.y = p.y + p.h - e.h; p.carry = -1; ev(st, 'kick', e.x, e.y); } else { e.x = p.x + (p.face > 0 ? p.w - 1 : -e.w + 1); e.y = p.y + p.h - e.h - 3; e.vx = 0; e.vy = 0; } }
  // --- coins & collectibles
  var cs = L.coins; for (i = 0; i < cs.length; i++) if (!st.cg[i]) { var cc2 = cs[i];
    if (p.x < cc2.x + 6 && p.x + p.w > cc2.x - 6 && p.y < cc2.y + 7 && p.y + p.h > cc2.y - 7) { st.cg[i] = 1; var v = cc2.b ? (p.mount ? 100 : 50) : 10; st.coins += cc2.b ? 0 : 1; st.score += v; ev(st, 'coin', cc2.x, cc2.y, v); } }
  var sp = L.special; if (sp) for (i = 0; i < sp.length; i++) if (!st.sg[i]) { var q = sp[i];
    if (p.x < q.x + 8 && p.x + p.w > q.x - 8 && p.y < q.y + 10 && p.y + p.h > q.y - 10) { st.sg[i] = 1; st.sc++; st.score += 200; ev(st, 'special', q.x, q.y, st.sc); } }
  var pks = L.pockets; if (pks) for (i = 0; i < pks.length; i++) if (!st.pk[i]) { var pq = pks[i]; var ddx = pq.x - (p.x + p.w / 2), ddy = pq.y - (p.y + p.h / 2); if (ddx * ddx + ddy * ddy < 15 * 15) { st.pk[i] = 1; p.air = AIRMAX; p.vy = Math.min(p.vy, -2.4); st.score += 50; ev(st, 'pocket', pq.x, pq.y); } }
  if (st.sw > 0) { var c0s = Math.floor(p.x / TS), c1s = Math.floor((p.x + p.w - 1e-4) / TS), r0s = Math.floor(p.y / TS), r1s = Math.floor((p.y + p.h - 1e-4) / TS);
    for (var cs2 = c0s; cs2 <= c1s; cs2++) for (var rs2 = r0s; rs2 <= r1s; rs2++) if (tileRaw(st, cs2, rs2) === T.BRICK) { setTile(st, cs2, rs2, T.AIR); st.coins++; st.score += 10; ev(st, 'coin', cs2 * TS + 8, rs2 * TS + 8, 10); } }
  // --- keys, locked doors, one-shot switches, teleport pads, launch barrels, route tracking
  var pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  if (p.tcd > 0) p.tcd--;
  if (L.crumbs) { var cb = L.crumbs; for (var kk = 1; kk <= 4 && st.cr + kk < cb.length; kk++) { var cq = cb[st.cr + kk]; if (cq[2] <= st.stage && Math.abs(pcx - cq[0]) < 22 && Math.abs(pcy - cq[1]) < 26) { st.cr += kk; break; } } }
  if (L.keys) for (i = 0; i < L.keys.length; i++) if (!st.kg[i]) { var ky = L.keys[i]; if (Math.abs(pcx - ky.x) < 11 && Math.abs(pcy - ky.y) < 13) { st.kg[i] = 1; st.kb |= 1 << ky.c; ev(st, 'key', ky.x, ky.y, ky.c); } }
  if (L.doors) for (i = 0; i < L.doors.length; i++) if (!st.dg[i]) { var dr = L.doors[i]; if (((st.kb >> dr.g) & 1) && Math.abs(pcx - (dr.c * TS + 8)) < 16 && p.y + p.h > dr.r0 * TS - 2 && p.y < (dr.r1 + 1) * TS) { st.dg[i] = 1; for (var rr2 = dr.r0; rr2 <= dr.r1; rr2++) setTile(st, dr.c, rr2, T.AIR); ev(st, 'unlock', dr.c * TS + 8, p.y, dr.g); } }
  if (L.switches) for (i = 0; i < L.switches.length; i++) if (!st.sg2[i]) { var sw = L.switches[i]; if (pcx > sw.c * TS - 2 && pcx < sw.c * TS + TS + 2 && pcy > sw.r * TS - 4 && pcy < sw.r * TS + TS + 4) { st.sg2[i] = 1; st.sb |= 1 << sw.g; setTile(st, sw.c, sw.r, T.SWUSED); ev(st, 'switch', sw.c * TS + 8, sw.r * TS, sw.g); } }
  if (L.tele && p.tcd === 0) for (i = 0; i < L.tele.length; i++) { var tp = L.tele[i]; if (pcx > tp.c * TS && pcx < tp.c * TS + TS && pcy > tp.r * TS - 2 && pcy < tp.r * TS + TS + 2) { p.x = tp.tx; p.y = tp.ty; p.vx = 0; p.vy = 0; p.tcd = 50; p.climb = false; st.tc++; ev(st, 'tele', tp.tx, tp.ty, i); break; } }
  if (L.launch && p.tcd === 0) for (i = 0; i < L.launch.length; i++) { var lb = L.launch[i]; if (pcx > lb.c * TS && pcx < lb.c * TS + TS && pcy > lb.r * TS - 2 && pcy < lb.r * TS + TS + 2) { p.vx = lb.vx; p.vy = lb.vy; p.ground = false; p.mv = -1; p.tcd = 30; ev(st, 'launch', lb.c * TS, lb.r * TS); break; } }
  if (L.route) { while (st.stage < L.route.length - 1 && stageDone(st, L.route[st.stage])) st.stage++; }
  // --- enemy contact
  for (i = 0; i < st.en.length; i++) { e = st.en[i]; if (!e.alive || (e.t === 7 && e.hid) || e.carried) continue;
    var ov;
    if (e.t === 12) ov = overlap(p, { x: e.dir > 0 ? e.x + e.w - 12 : e.x, y: e.y, w: 12, h: e.h });
    else if (e.t === 13) { var jw = e.w * (0.7 + 0.3 * (e.pul || 0)); ov = overlap(p, { x: e.x + (e.w - jw) / 2, y: e.y, w: jw, h: e.h * 0.7 }) || overlap(p, { x: e.x + e.w / 2 - 2, y: e.y + e.h * 0.7, w: 4, h: 18 }); }
    else if (e.t === 14) ov = !e.s && overlap(p, e);
    else ov = overlap(p, e);
    if (!ov) continue;
    var stompable = e.t === 0 || e.t === 2 || e.t === 3 || e.t === 4 || e.t === 8 || e.t === 9 || e.t === 10 || e.t === 15 || e.t === 16 || e.t === 18 || e.t === 19 || (e.t === 1 && p.spin > 0);
    var stomping = stompable && p.vy > 0 && (p.y + p.h) - e.y <= 9 + p.vy;
    if (p.star > 0 && e.t !== 8) { killEnemy(st, e, 200); continue; }
    if (e.t === 3 && e.sh === 1) {            // idle shell: stomp or touch kicks it, holding Run carries it
      if (stomping) { e.sh = 2; e.dir = (p.x + p.w / 2 > e.x + e.w / 2) ? -1 : 1; e.kg = 14; p.vy = jump ? -6 : -3.8; st.score += 100; ev(st, 'kick', e.x, e.y); }
      else if (run && p.carry < 0) { p.carry = i; e.carried = true; ev(st, 'grab', e.x, e.y); }
      else { e.sh = 2; e.dir = (p.x + p.w / 2 > e.x + e.w / 2) ? -1 : 1; e.kg = 14; ev(st, 'kick', e.x, e.y); }
      continue; }
    if (e.t === 3 && e.sh === 2 && e.kg > 0) continue;
    if (stomping) {
      if (e.t === 8) { if (hitBoss(st, e, 1)) { p.vy = -6.2; } continue; }
      if (e.t === 3) { if (e.sh === 2) { e.sh = 1; e.vx = 0; } else { e.sh = 1; e.y += 4; e.h = 9; e.vx = 0; } p.vy = jump ? -6.8 : -4.2; st.score += 100; ev(st, 'stomp', e.x + e.w / 2, e.y); p.coy = 0; continue; }
      e.alive = false; e.dt = 30; dropLoot(st, e); p.vy = jump ? -7.2 : -4.2; p.coy = 0; st.score += 100; ev(st, 'stomp', e.x + e.w / 2, e.y); if (e.t === 1) ev(st, 'spinkill', e.x, e.y); continue;
    }
    if (p.mount && e.t !== 8 && e.t !== 5 && e.t !== 7 && e.t !== 11 && e.t !== 12 && e.t !== 13 && e.t !== 14 && e.t !== 17 && e.t !== 20 && !(e.t === 3 && e.sh === 2) && !(e.t === 1)) { killEnemy(st, e, 100); ev(st, 'eat', e.x, e.y); continue; }
    hurt(st, e.t === 5 ? 'crush' : e.t === 13 ? 'jelly' : e.t === 14 ? 'clam' : 'enemy');
  }
  // --- spikes / lava
  if (!p.dead) { var c0 = Math.floor((p.x + 3) / TS), c1 = Math.floor((p.x + p.w - 3) / TS), r0b = Math.floor((p.y + p.h - 7) / TS), r1b = Math.floor((p.y + p.h - 1e-4) / TS);
    for (var c2 = c0; c2 <= c1; c2++) for (var r2 = r0b; r2 <= r1b; r2++) { var t3 = tileAt(st, c2, r2);
      if (t3 === T.SPIKE && p.y + p.h > r2 * TS + 8) { hurt(st, 'spike'); if (!p.dead) p.vy = -5; }
      else if (t3 === T.LAVA && p.y + p.h > r2 * TS + 5) dieNow(st, 'lava'); } }
  // --- fire jets / lasers: timed hazards standing on the floor
  if (!p.dead && L.hasFire) { var fc0 = Math.floor((p.x + 2) / TS), fc1 = Math.floor((p.x + p.w - 2) / TS), fr0 = Math.floor((p.y + 2) / TS), fr1 = Math.floor((p.y + p.h - 2) / TS);
    for (var fc = fc0; fc <= fc1; fc++) for (var fr = fr0; fr <= fr1; fr++) if (tileRaw(st, fc, fr) === T.FIRE && fireOn(f, fc)) { hurt(st, 'fire'); if (!p.dead) p.vy = -4.5; } }
  // --- auto-scroller: a wall of lava / fog pushes the hero from the left
  if (L.chase) { if (st.cw === undefined) st.cw = L.chase.x0; if (f > L.chase.delay) st.cw += L.chase.v; if (!p.dead && p.x + p.w < st.cw) { p.dead = true; p.why = 'chased'; ev(st, 'die', p.x, p.y); } }
  // --- pit / timer / goal / checkpoint
  var RW = L.rows || ROWS; if (p.y > RW * TS + 6) { p.dead = true; p.why = 'pit'; ev(st, 'die', p.x, RW * TS); }
  if (--st.t <= 0 && !p.dead) { p.dead = true; p.why = 'time'; ev(st, 'die', p.x, p.y); }
  var inGoal = L.goalRect ? (p.x < L.goalRect.x + L.goalRect.w && p.x + p.w > L.goalRect.x && p.y < L.goalRect.y + L.goalRect.h && p.y + p.h > L.goalRect.y) : p.x + p.w >= L.goalX;
  if (!p.dead && st.boss <= 0 && inGoal) {
    p.won = true; var ty = L.poleY - 18 - (0.5 + 0.5 * Math.sin(f * 0.045)) * 90, hit = Math.abs(ty - (p.y + p.h / 2)) < 13; if (hit) { st.score += 3000; st.tape = 1; }
    ev(st, 'goal', L.goalX, p.y, hit ? 1 : 0); }
  if (!st.cp && p.x >= L.cp.x) st.cp = 1;
  st.f = f + 1;
}

root.PF = { fireOn: fireOn, stageDone: stageDone, movOn: movOn, isW: isW, AIRMAX: AIRMAX, TS: TS, ROWS: ROWS, VW: VW, VH: VH, T: T, SOL: SOL, IN: IN, P: P, E: E, MV_PERIOD: MV_PERIOD, rng: rng, hash: hash, tri: tri, newState: newState, clone: clone, step: step, tileAt: tileAt, boxHit: boxHit, movPos: movPos,
  setPw: setPw, slopeY: slopeY, hurt: hurt };
})(typeof window !== 'undefined' ? window : globalThis);
