// Shape World - rendering. Canvas2D primitives only (rects, circles, arcs, polygons): no images, no sprites.
(function (root) {
'use strict';
var TS = PF.TS, VW = PF.VW, VH = PF.VH, T = PF.T, E = PF.E, ROWS = PF.ROWS;
var KO = /^ko/i.test(navigator.language || ''), TT = function (ko, en) { return KO ? ko : en; };
var ctx = null, G = null, F = 0;
function circ(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
function ell(x, y, rx, ry, c, rot) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832); ctx.fill(); }
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function poly(pts, c, stroke) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); if (c) { ctx.fillStyle = c; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
function rrect(x, y, w, h, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); }
function line(x1, y1, x2, y2, c, w) { ctx.strokeStyle = c; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function star(cx, cy, r, c, rot) { var pts = []; for (var i = 0; i < 10; i++) { var a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } poly(pts, c); }
function text(t, x, y, size, c, align, sh) {
  ctx.font = 'bold ' + size + 'px ui-monospace, Menlo, Consolas, "Courier New", monospace'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  if (sh !== false) { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(t, x + 1, y + 1); } ctx.fillStyle = c || '#fff'; ctx.fillText(t, x, y);
}
var THEMES = [
  { s1: '#5db8ff', s2: '#d6f3ff', h1: '#7fd36b', h2: '#5fb85a', gr: '#4caf50', dirt: '#9a6a3b', dirt2: '#7d5330', cloud: '#ffffff', mode: 'day' },
  { s1: '#ff8a5c', s2: '#ffe0a3', h1: '#c46a8a', h2: '#9a4f8a', gr: '#8fae3c', dirt: '#8a4f3a', dirt2: '#6d3b2c', cloud: '#fff0e0', mode: 'dusk' },
  { s1: '#0b1030', s2: '#2d3f86', h1: '#24456a', h2: '#1b3254', gr: '#2f9f78', dirt: '#4f3f66', dirt2: '#3c2f4f', cloud: '#7f8fd0', mode: 'night' },
  { s1: '#6fd0e8', s2: '#e6fbff', h1: '#58b6c8', h2: '#3e98b0', gr: '#b8e8a0', dirt: '#6a8fa8', dirt2: '#527388', cloud: '#ffffff', mode: 'day' },
  { s1: '#2a1018', s2: '#5a2a30', h1: '#3a1c24', h2: '#2a1018', gr: '#8a8a98', dirt: '#5a5a6a', dirt2: '#444452', cloud: '#7a4a50', mode: 'castle' },
  { s1: '#1c1410', s2: '#4a3828', h1: '#3a2c20', h2: '#2a2018', gr: '#8a7050', dirt: '#6a5038', dirt2: '#523c28', cloud: '#6a5a48', mode: 'cave' }];
var HILLS = (function () { var r = PF.rng(77), a = []; for (var i = 0; i < 8; i++) a.push({ x: i * 62 + r() * 30, r: 40 + r() * 40 }); return a; })();
var CLOUDS = (function () { var r = PF.rng(99), a = []; for (var i = 0; i < 5; i++) a.push({ x: i * 100 + r() * 50, y: 20 + r() * 50, s: 0.7 + r() * 0.8 }); return a; })();
var STARS = (function () { var r = PF.rng(5), a = []; for (var i = 0; i < 40; i++) a.push({ x: r() * VW, y: r() * 120, s: 0.5 + r() * 1.1 }); return a; })();

function drawBackground(th, cam) {
  var g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, th.s1); g.addColorStop(1, th.s2); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  var k, i2;
  if (th.mode === 'castle' || th.mode === 'cave') {
    var off = -((cam * 0.5) % 32);
    for (k = -1; k < VW / 32 + 2; k++) for (i2 = 0; i2 < 8; i2++) { var bx = off + k * 32 + (i2 % 2) * 16, by = i2 * 28; rect(bx, by, 30, 12, th.mode === 'castle' ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.12)'); }
    if (th.mode === 'castle') for (k = 0; k < 4; k++) { var tx = ((k * 130 - cam * 0.6) % 520 + 520) % 520 - 60; rect(tx, 70, 4, 24, '#3a2a2a'); circ(tx + 2, 66, 5 + Math.sin(F * 0.3 + k) * 1.2, '#ffb030'); circ(tx + 2, 65, 3, '#fff2a0'); }
    else for (k = 0; k < 7; k++) { var sx = ((k * 77 - cam * 0.55) % 540 + 540) % 540 - 30; poly([sx, 0, sx + 18, 0, sx + 9, 22 + (k % 3) * 9], '#2a2018'); }
    return;
  }
  if (th.mode === 'night') { for (var i = 0; i < STARS.length; i++) { var s = STARS[i]; circ(s.x, s.y, s.s, 'rgba(255,255,255,.8)'); } circ(330, 36, 14, '#f4f0d8'); circ(325, 33, 12, '#0f1840'); }
  else circ(340, 38, 16, th.mode === 'dusk' ? '#fff3b0' : '#fff7c0');
  for (k = 0; k < 2; k++) { var o1 = -((cam * 0.2) % 496) + k * 496; for (i2 = 0; i2 < HILLS.length; i2++) { var h = HILLS[i2]; ctx.fillStyle = th.h2; ctx.beginPath(); ctx.arc(o1 + h.x, VH - 20 + h.r * 0.45, h.r, Math.PI, 0); ctx.fill(); } }
  for (k = 0; k < 2; k++) { var o2 = -((cam * 0.4) % 496) + k * 496; for (i2 = 0; i2 < HILLS.length; i2++) { var h2 = HILLS[i2]; ctx.fillStyle = th.h1; ctx.beginPath(); ctx.ellipse(o2 + h2.x + 31, VH - 12 + h2.r * 0.3, h2.r * 0.8, h2.r * 0.7, 0, Math.PI, 0); ctx.fill(); } }
  for (k = 0; k < 2; k++) { var o3 = -((cam * 0.5) % 500) + k * 500; for (i2 = 0; i2 < CLOUDS.length; i2++) { var c = CLOUDS[i2], x = o3 + c.x; ctx.globalAlpha = th.mode === 'night' ? 0.35 : 0.9; circ(x, c.y, 9 * c.s, th.cloud); circ(x + 11 * c.s, c.y + 2, 11 * c.s, th.cloud); circ(x + 24 * c.s, c.y + 3, 8 * c.s, th.cloud); rect(x - 5 * c.s, c.y + 3, 33 * c.s, 8 * c.s, th.cloud); ctx.globalAlpha = 1; } }
}
function drawTile(t, x, y, th, above, bumpDy, c, r, st) {
  y += bumpDy || 0;
  switch (t) {
    case T.SOLID:
      rect(x, y, TS, TS, th.dirt); rect(x + 2, y + 6, 3, 3, th.dirt2); rect(x + 9, y + 11, 4, 3, th.dirt2); rect(x + 10, y + 3, 2, 2, th.dirt2);
      if (above === 0 || above === 6 || above === 7 || above === 9 || above >= 12 && above <= 14 || above === 19 || above === 17) { rect(x, y, TS, 4, th.gr); if (th.mode !== 'castle' && th.mode !== 'cave') { circ(x + 4, y + 4, 2, th.gr); circ(x + 11, y + 4, 2.5, th.gr); } else rect(x, y + 3, TS, 1, 'rgba(0,0,0,.3)'); }
      break;
    case T.BRICK:
      if (st && st.sw > 0) { circ(x + 8, y + 8, 5, '#c99a00'); circ(x + 8, y + 8, 4, '#ffe14a'); break; }
      rect(x, y, TS, TS, '#d9783a'); ctx.fillStyle = '#7a3a18'; ctx.fillRect(x, y + 7, TS, 1); ctx.fillRect(x, y + 15, TS, 1); ctx.fillRect(x + 7, y, 1, 7); ctx.fillRect(x + 3, y + 8, 1, 7); ctx.fillRect(x + 11, y + 8, 1, 7); rect(x, y, TS, 1, '#f0a070'); break;
    case T.QC: case T.QP: case T.QS: case T.QM: {
      var pulse = 0.85 + 0.15 * Math.sin(F * 0.12);
      rect(x, y, TS, TS, '#8a5a00'); rect(x + 1, y + 1, TS - 2, TS - 2, 'rgb(255,' + Math.round(200 * pulse) + ',40)');
      circ(x + 3, y + 3, 1, '#8a5a00'); circ(x + 13, y + 3, 1, '#8a5a00'); circ(x + 3, y + 13, 1, '#8a5a00'); circ(x + 13, y + 13, 1, '#8a5a00');
      if (t === T.QS) star(x + 8, y + 8.5, 5, '#8a5a00', 0);
      else if (t === T.QM) { ell(x + 8, y + 9, 3.6, 4.6, '#8a5a00'); circ(x + 7, y + 8, 1, '#ffd23a'); }
      else { ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 8, y + 6, 2.8, Math.PI, 2.2 * Math.PI); ctx.lineTo(x + 8, y + 10); ctx.stroke(); circ(x + 8, y + 12.5, 1.1, '#7a4a00'); }
      break; }
    case T.USED: rect(x, y, TS, TS, '#6a5a4a'); rect(x + 2, y + 2, TS - 4, TS - 4, '#8a7a68'); circ(x + 3, y + 3, 1, '#4a3a2a'); circ(x + 13, y + 13, 1, '#4a3a2a'); break;
    case T.SPIKE: for (var i = 0; i < 2; i++) poly([x + i * 8, y + 16, x + i * 8 + 4, y + 5, x + i * 8 + 8, y + 16], '#c9d1da', '#4a5260'); break;
    case T.VINE: rect(x + 7, y, 2, TS, '#2f8a3a'); poly([x + 9, y + 3, x + 15, y + 1, x + 10, y + 7], '#4ac05a'); poly([x + 7, y + 11, x + 1, y + 9, x + 6, y + 15], '#4ac05a'); break;
    case T.SPRING: { var comp = 0; rect(x + 1, y + 13, 14, 3, '#555a6a'); ctx.strokeStyle = '#d04a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 3, y + 13); ctx.lineTo(x + 13, y + 10); ctx.lineTo(x + 3, y + 7); ctx.lineTo(x + 13, y + 4); ctx.stroke(); rrect(x + 1, y + 1, 14, 3, 1.5, '#ffd23a'); break; }
    case T.CONVL: case T.CONVR: { rect(x, y, TS, TS, '#4a4f60'); rect(x, y, TS, 4, '#2a2e3a'); var dd = t === T.CONVR ? 1 : -1, ph = ((F * 0.6 * dd) % 8 + 8) % 8; ctx.save(); ctx.beginPath(); ctx.rect(x, y, TS, 4); ctx.clip(); for (var k = -1; k < 3; k++) poly(dd > 0 ? [x + k * 8 + ph, y, x + k * 8 + ph + 4, y + 2, x + k * 8 + ph, y + 4] : [x + k * 8 + ph + 4, y, x + k * 8 + ph, y + 2, x + k * 8 + ph + 4, y + 4], '#ffd23a'); ctx.restore(); circ(x + 4, y + 11, 2, '#2a2e3a'); circ(x + 12, y + 11, 2, '#2a2e3a'); break; }
    case T.SLR: poly([x, y + 16, x + 16, y + 16, x + 16, y], th.dirt); poly([x, y + 16, x + 16, y, x + 16, y + 4, x + 4, y + 16], th.gr); break;
    case T.SLL: poly([x, y + 16, x + 16, y + 16, x, y], th.dirt); poly([x + 16, y + 16, x, y, x, y + 4, x + 12, y + 16], th.gr); break;
    case T.LAVA: { rect(x, y + 3, TS, TS - 3, '#e8501a'); for (var q = 0; q < 4; q++) circ(x + q * 5 + 2 + Math.sin(F * 0.1 + q + c) * 1.5, y + 3 + Math.sin(F * 0.15 + q * 2 + c) * 1.2, 3, '#ff9a2a'); rect(x + 4, y + 9, 3, 3, '#ffd23a'); break; }
    case T.CANL: case T.CANR: { rect(x, y + 6, TS, 10, '#3a3e4a'); var dr = t === T.CANR ? 1 : -1; circ(x + 8, y + 9, 7, '#4a4e5a'); rect(dr > 0 ? x + 8 : x - 2, y + 5, 10, 8, '#2a2e3a'); circ(dr > 0 ? x + 18 : x - 2, y + 9, 4, '#14161c'); circ(x + 6, y + 6, 1.5, '#9aa0b0'); break; }
    case T.STUMP: rect(x + 1, y + 2, 14, 14, '#8a5a30'); ell(x + 8, y + 2, 7, 2.5, '#c8904a'); ctx.fillStyle = '#6a4220'; ctx.fillRect(x + 1, y + 6, 14, 1); ctx.fillRect(x + 1, y + 11, 14, 1); break;
    case T.PSW: { var on = st && st.sw > 0; rect(x, y, TS, TS, '#1f3f9a'); rect(x + 1, y + 1, TS - 2, TS - 2, '#3a6ae0'); poly([x + 8, y + 3, x + 13, y + 8, x + 8, y + 13, x + 3, y + 8], '#bfe0ff'); circ(x + 8, y + 8, 2, '#3a6ae0'); break; }
    case T.RING: { if (r !== undefined && st && st.L.tiles[c * ROWS + r - 1] === T.RING) break; var gl = 0.6 + 0.4 * Math.sin(F * 0.12); ctx.globalAlpha = 0.28 * gl; ell(x + 8, y + 16, 11, 17, '#9a6aff'); ctx.globalAlpha = 1; ctx.strokeStyle = '#d8c0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + 8, y + 16, 7.5, 14, 0, 0, 6.2832); ctx.stroke(); ctx.strokeStyle = '#8a5af0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + 8, y + 16, 4.5 + gl, 10 + gl, 0, 0, 6.2832); ctx.stroke(); star(x + 8, y + 16, 3, '#fff', F * 0.05); break; }
  }
}
function drawWaterOverlay(x, y, above) { ctx.fillStyle = 'rgba(40,120,220,.38)'; ctx.fillRect(x, y, TS, TS); if (above !== T.WATER) { ctx.strokeStyle = 'rgba(200,240,255,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (var i = 0; i <= 4; i++) { var xx = x + i * 4, yy = y + 1 + Math.sin(F * 0.12 + x * 0.3 + i) * 1.2; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); } }

function drawHero(p, dead, spinA, mounted) {
  var h = p.h, w = p.w, x = p.x, y = p.y, face = p.face >= 0 ? 1 : -1, cx = x + w / 2, pw = p.pw | 0;
  if (p.inv > 0 && !dead && (Math.floor(p.inv / 4) % 2)) ctx.globalAlpha = 0.45;
  var body = ['#2f8fe8', '#2f8fe8', '#f2f2f2', '#9a5ae8'][pw], cap = ['#e8403a', '#e8403a', '#ff8a1a', '#ffd23a'][pw];
  if (p.star > 0) { var hue = (F * 14) % 360; body = 'hsl(' + hue + ',90%,60%)'; cap = 'hsl(' + ((hue + 120) % 360) + ',90%,55%)'; }
  ctx.save(); ctx.translate(cx, y + h / 2); if (spinA) ctx.rotate(spinA); if (p.spin > 0) ctx.scale(Math.cos(p.spin * 0.7), 1); ctx.translate(-cx, -(y + h / 2));
  if (mounted) { // the rideable creature (original design): a round hopper with a saddle
    var bob = Math.abs(Math.sin(p.anim * 1.5)) * (p.ground && Math.abs(p.vx) > 0.2 ? 1.5 : 0);
    ell(cx, y + h - 1 - bob, 11, 7, '#3ac07a'); ell(cx + face * 9, y + h - 6 - bob, 5.5, 5, '#3ac07a'); circ(cx + face * 11, y + h - 8 - bob, 1.4, '#fff'); circ(cx + face * 11.5, y + h - 8 - bob, 0.7, '#111'); rect(cx - 6, y + h + 3 - bob, 3, 3, '#1f8a52'); rect(cx + 3, y + h + 3 - bob, 3, 3, '#1f8a52'); rrect(cx - 5, y + h - 6 - bob, 10, 3, 1, '#d04a4a');
  }
  if (pw === 3) { var gl = p.glide ? 1 : 0; poly([cx - face * 4, y + h * 0.35, cx - face * (9 + gl * 6), y + h * 0.1 - gl * 3, cx - face * (11 + gl * 5), y + h * 0.7, cx - face * 4, y + h * 0.65], '#d8b0ff', '#6a3ab0'); }
  var step = Math.sin(p.anim * 2.2), moving = Math.abs(p.vx) > 0.2 && p.ground, fy = y + h - 2 - (mounted ? 4 : 0);
  if (!mounted) { if (!p.ground) { rect(cx - 5, fy, 4, 2, '#5a2a10'); rect(cx + 1, fy - 1, 4, 2, '#5a2a10'); } else if (moving) { rect(cx - 5 + step * 2.5, fy, 4, 2, '#5a2a10'); rect(cx + 1 - step * 2.5, fy, 4, 2, '#5a2a10'); } else { rect(cx - 5, fy, 4, 2, '#5a2a10'); rect(cx + 1, fy, 4, 2, '#5a2a10'); } }
  var bt = y + (p.big ? 8 : 4), bh = h - (p.big ? 9 : 5) - (mounted ? 2 : 0);
  rrect(x, bt, w, bh, 4, body);
  if (p.big) { rect(x, bt + bh * 0.55, w, 2, '#ffd23a'); circ(cx, bt + bh * 0.55 + 1, 1.6, '#fff'); }
  var hy = y + (p.big ? 6 : 4);
  circ(cx, hy, 6.4, '#ffd9b0'); ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(cx, hy - 0.5, 6.8, Math.PI, 0); ctx.fill(); poly([cx + face * 2, hy - 1, cx + face * 9, hy - 1, cx + face * 2, hy + 1.5], cap);
  circ(cx, hy - 5.5, 1.4, '#fff'); circ(cx + face * 2.4, hy + 1.6, 1.7, '#fff'); circ(cx + face * 3, hy + 1.6, 0.9, '#111');
  if (pw === 2) circ(cx, hy - 6, 1.8, '#ffd23a');
  ctx.restore(); ctx.globalAlpha = 1;
}
function drawEnemy(e) {
  var cx = e.x + e.w / 2, by = e.y + e.h, dir = e.dir || 1, f = F;
  if (!e.alive) { if (e.dt > 0) { ctx.globalAlpha = Math.min(1, e.dt / 24); if (e.t === E.BOSS) { for (var q = 0; q < 6; q++) circ(cx + Math.cos(q + e.dt) * (30 - e.dt * 0.4), e.y + 12 + Math.sin(q * 2 + e.dt) * (30 - e.dt * 0.4), 4, '#ffd23a'); } else ell(cx, by - 1.5, 8, 2.5, e.t === E.FLYER ? '#a24ad8' : '#4aa84a'); ctx.globalAlpha = 1; } return; }
  switch (e.t) {
    case E.WALKER: { var st = Math.sin(f * 0.25 + e.x);
      ctx.fillStyle = '#4aa84a'; ctx.beginPath(); ctx.arc(cx, by - 4, 7, Math.PI, 0); ctx.lineTo(cx + 7, by - 3); ctx.lineTo(cx - 7, by - 3); ctx.fill();
      rect(cx - 7, by - 4, 14, 2, '#3a883a'); rect(cx - 6 + st * 2, by - 2, 5, 2, '#2a5a2a'); rect(cx + 1 - st * 2, by - 2, 5, 2, '#2a5a2a');
      circ(cx - 2.6, by - 7, 2.2, '#fff'); circ(cx + 2.6, by - 7, 2.2, '#fff'); circ(cx - 2.6 + dir * 0.8, by - 6.8, 1, '#111'); circ(cx + 2.6 + dir * 0.8, by - 6.8, 1, '#111');
      line(cx - 5, by - 10.5, cx - 1, by - 8.8, '#1a3a1a'); line(cx + 5, by - 10.5, cx + 1, by - 8.8, '#1a3a1a'); break; }
    case E.SPIKY: { var ccy = e.y + e.h / 2; ctx.save(); ctx.translate(cx, ccy); ctx.rotate(f * 0.05 * dir); for (var i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); poly([-3, -6, 0, -11, 3, -6], '#d8d8e8', '#444'); } ctx.restore();
      circ(cx, ccy, 6.5, '#d8483a'); circ(cx - 2.2, ccy - 1.5, 1.9, '#fff'); circ(cx + 2.2, ccy - 1.5, 1.9, '#fff'); circ(cx - 2.2 + dir * 0.7, ccy - 1.3, 0.9, '#111'); circ(cx + 2.2 + dir * 0.7, ccy - 1.3, 0.9, '#111'); rect(cx - 2.5, ccy + 2, 5, 1, '#400'); break; }
    case E.FLYER: { var fl = Math.sin(f * 0.4) * 5, cy2 = e.y + e.h / 2;
      poly([cx - 3, cy2, cx - 14, cy2 - 6 - fl, cx - 8, cy2 + 3], '#d9a8f5', '#6a2a98'); poly([cx + 3, cy2, cx + 14, cy2 - 6 - fl, cx + 8, cy2 + 3], '#d9a8f5', '#6a2a98');
      poly([cx, cy2 - 7, cx + 6, cy2, cx, cy2 + 7, cx - 6, cy2], '#a24ad8', '#4a1a70'); circ(cx - 2, cy2 - 1, 1.6, '#fff'); circ(cx + 2, cy2 - 1, 1.6, '#fff'); circ(cx - 2 + dir * 0.6, cy2 - 0.8, 0.8, '#111'); circ(cx + 2 + dir * 0.6, cy2 - 0.8, 0.8, '#111'); break; }
    case E.BEETLE: {
      if (e.sh) { var ec = e.sh === 2 ? 'hsl(' + (F * 20 % 360) + ',60%,50%)' : '#2a8a9a'; ctx.fillStyle = e.sh === 2 ? '#e0a020' : '#e0a020'; ctx.beginPath(); ctx.arc(cx, by - 1, 7, Math.PI, 0); ctx.fill(); rect(cx - 7, by - 2, 14, 2, '#8a5a10'); line(cx - 3, by - 7, cx - 3, by - 2, '#8a5a10'); line(cx + 3, by - 7, cx + 3, by - 2, '#8a5a10'); if (e.sh === 2) { ctx.globalAlpha = 0.4; circ(cx - e.dir * 8, by - 4, 4, '#fff'); ctx.globalAlpha = 1; } break; }
      var s3 = Math.sin(f * 0.22 + e.x);
      ctx.fillStyle = '#e0a020'; ctx.beginPath(); ctx.arc(cx, by - 4, 6.5, Math.PI, 0); ctx.lineTo(cx + 6.5, by - 3); ctx.lineTo(cx - 6.5, by - 3); ctx.fill(); line(cx, by - 10.5, cx, by - 4, '#8a5a10'); line(cx - 3.5, by - 9, cx - 3.5, by - 4, '#8a5a10'); line(cx + 3.5, by - 9, cx + 3.5, by - 4, '#8a5a10');
      circ(cx + dir * 4.5, by - 5, 3.4, '#6ac07a'); circ(cx + dir * 5.2, by - 5.5, 1.1, '#fff'); circ(cx + dir * 5.6, by - 5.5, 0.5, '#111'); rect(cx - 5 + s3 * 1.5, by - 2, 4, 2, '#3a5a3a'); rect(cx + 1 - s3 * 1.5, by - 2, 4, 2, '#3a5a3a'); break; }
    case E.BULLET: { ell(cx, e.y + 5, 7, 4.5, '#2a2e3a'); poly([cx - e.dir * 6, e.y + 1, cx - e.dir * 11, e.y - 1, cx - e.dir * 8, e.y + 5, cx - e.dir * 11, e.y + 11, cx - e.dir * 6, e.y + 9], '#ff8a2a'); circ(cx + e.dir * 2, e.y + 4, 1.7, '#fff'); circ(cx + e.dir * 2.5, e.y + 4, 0.8, '#d02020'); break; }
    case E.CRUSH: { var ang = e.s === 1; rect(e.x, e.y, e.w, e.h, '#7a7e8c'); rect(e.x + 1, e.y + 1, e.w - 2, e.h - 2, '#9aa0b0'); for (var k = 0; k < 4; k++) poly([e.x + 1 + k * 6, e.y + e.h, e.x + 4 + k * 6, e.y + e.h + 4, e.x + 7 + k * 6, e.y + e.h], '#c9d1da', '#4a5260');
      circ(e.x + 7, e.y + 10, 3, '#fff'); circ(e.x + 17, e.y + 10, 3, '#fff'); circ(e.x + 7, e.y + (ang ? 12 : 10), 1.3, '#111'); circ(e.x + 17, e.y + (ang ? 12 : 10), 1.3, '#111'); line(e.x + 3, e.y + 5, e.x + 10, e.y + 7.5, '#222', 1.5); line(e.x + 21, e.y + 5, e.x + 14, e.y + 7.5, '#222', 1.5); rect(e.x + 8, e.y + 17, 8, ang ? 4 : 1.5, '#222'); break; }
    case E.GHOST: { var cy3 = e.y + e.h / 2, wob = Math.sin(f * 0.15 + e.x) * 1.5; ctx.globalAlpha = 0.85; ctx.fillStyle = '#eef0ff'; ctx.beginPath(); ctx.arc(cx, cy3 - 1 + wob, 7.5, Math.PI, 0); ctx.lineTo(cx + 7.5, cy3 + 7 + wob); ctx.lineTo(cx + 3.7, cy3 + 4 + wob); ctx.lineTo(cx, cy3 + 7 + wob); ctx.lineTo(cx - 3.7, cy3 + 4 + wob); ctx.lineTo(cx - 7.5, cy3 + 7 + wob); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      circ(cx - 3, cy3 - 2 + wob, 1.8, '#223'); circ(cx + 3, cy3 - 2 + wob, 1.8, '#223'); ell(cx, cy3 + 2.5 + wob, 2, 1.4, '#223'); break; }
    case E.PLANT: { if (e.y > e.y0 - 1 && e.hid) break; var top = e.y; rect(e.x + 5, top + 8, 2, e.y0 + 6 - top - 8 + 4, '#2f8a3a'); circ(cx, top + 6, 6.5, '#d8304a'); poly([cx - 6, top + 6, cx - 9, top + 1, cx - 3, top + 3], '#f0c040'); poly([cx + 6, top + 6, cx + 9, top + 1, cx + 3, top + 3], '#f0c040'); ell(cx, top + 8, 5, 2.2, '#2a0a10'); for (var t3 = 0; t3 < 3; t3++) poly([cx - 4 + t3 * 3, top + 6.5, cx - 2.5 + t3 * 3, top + 9, cx - 1 + t3 * 3, top + 6.5], '#fff'); break; }
    case E.BOSS: {
      var fl2 = e.inv > 0 && (Math.floor(e.inv / 4) % 2); ctx.globalAlpha = fl2 ? 0.4 : 1; var cy4 = e.y + e.h / 2, v = e.v;
      if (v === 0) { ctx.fillStyle = '#7a3ab0'; ctx.beginPath(); ctx.arc(cx, e.y + e.h - 6, 14, Math.PI, 0); ctx.lineTo(cx + 14, e.y + e.h - 2); ctx.lineTo(cx - 14, e.y + e.h - 2); ctx.fill(); for (var sp = -2; sp <= 2; sp++) poly([cx + sp * 5 - 2.5, e.y + 8 - Math.abs(sp), cx + sp * 5, e.y + 1 - Math.abs(sp) * 1.5, cx + sp * 5 + 2.5, e.y + 8 - Math.abs(sp)], '#f0d040'); rect(cx - 12, e.y + e.h - 5, 8, 5, '#4a2070'); rect(cx + 4, e.y + e.h - 5, 8, 5, '#4a2070'); }
      else if (v === 1) { ell(cx, cy4, 15, 11, '#2a8aa8'); poly([cx - 12, cy4 - 4, cx - 24, cy4 - 14 - Math.sin(F * 0.3) * 4, cx - 8, cy4 + 4], '#7ad0e8'); poly([cx + 12, cy4 - 4, cx + 24, cy4 - 14 - Math.sin(F * 0.3) * 4, cx + 8, cy4 + 4], '#7ad0e8'); circ(cx, cy4 + 8, 4, '#1a5a70'); }
      else { rrect(e.x, e.y + 2, e.w, e.h - 2, 7, '#c0501a'); poly([e.x + 4, e.y + 4, e.x + 9, e.y - 6, e.x + 13, e.y + 4], '#f0e0c0'); poly([e.x + e.w - 13, e.y + 4, e.x + e.w - 9, e.y - 6, e.x + e.w - 4, e.y + 4], '#f0e0c0'); rect(e.x + 3, e.y + e.h - 4, 8, 4, '#6a2a0a'); rect(e.x + e.w - 11, e.y + e.h - 4, 8, 4, '#6a2a0a'); if (e.s === 0) { circ(cx, e.y - 10, 3, '#ff4a2a'); } if (e.s === 2) { star(cx, e.y - 8, 4, '#ffd23a', F * 0.2); } }
      var ed = e.dir || 1; circ(cx - 5, cy4 - 3, 3.6, '#fff'); circ(cx + 5, cy4 - 3, 3.6, '#fff'); circ(cx - 5 + ed * 1.2, cy4 - 2.6, 1.6, '#c01010'); circ(cx + 5 + ed * 1.2, cy4 - 2.6, 1.6, '#c01010'); line(cx - 9, cy4 - 8, cx - 2, cy4 - 5.5, '#200', 2); line(cx + 9, cy4 - 8, cx + 2, cy4 - 5.5, '#200', 2);
      ctx.globalAlpha = 1; for (var hp = 0; hp < 3; hp++) circ(cx - 8 + hp * 8, e.y - 14, 3, hp < e.hp ? '#ff4a5a' : '#444'); break; }
  }
}
function drawItem(e) {
  var cx = e.x + 6, cy = e.y + 6 + Math.sin(F * 0.15) * 0.7;
  if (e.k === 0) { poly([cx, cy - 7, cx + 6, cy - 1, cx, cy + 7, cx - 6, cy - 1], '#2fd07a', '#0a6a3a'); poly([cx, cy - 7, cx + 6, cy - 1, cx, cy - 1], '#8affc0'); poly([cx - 6, cy - 1, cx, cy - 1, cx, cy + 7], '#1a9a58'); }
  else if (e.k === 1) { for (var i = 0; i < 5; i++) circ(cx + Math.cos(i * 1.2566) * 4.5, cy + Math.sin(i * 1.2566) * 4.5, 3, '#ff7a1a'); circ(cx, cy, 3.2, '#ffe14a'); }
  else if (e.k === 2) { poly([cx - 6, cy + 5, cx - 2, cy - 7, cx + 6, cy - 4, cx + 2, cy + 4], '#d8b0ff', '#6a3ab0'); line(cx - 6, cy + 5, cx + 3, cy - 5, '#6a3ab0'); }
  else if (e.k === 3) star(cx, cy, 7.5, 'hsl(' + (F * 12 % 360) + ',95%,60%)', F * 0.1);
  else { ell(cx, cy + 1, 7, 6, '#3ac07a'); circ(cx + 4, cy - 3, 3.5, '#3ac07a'); circ(cx + 5, cy - 3.4, 1, '#fff'); rect(cx - 5, cy + 5, 3, 2, '#1f8a52'); rect(cx + 2, cy + 5, 3, 2, '#1f8a52'); }
}
function drawCoin(c, i) {
  if (c.b) { circ(c.x, c.y, 4, '#d02a60'); circ(c.x - 1.2, c.y - 1.2, 1.2, '#ff90b0'); rect(c.x - 0.5, c.y - 6, 1, 3, '#2f8a3a'); return; }
  var w = Math.abs(Math.cos(F * 0.09 + i * 0.7)) * 5 + 1; ell(c.x, c.y, w + 0.8, 6.8, '#c99a00'); ell(c.x, c.y, w, 6, '#ffe14a'); rect(c.x - 0.5, c.y - 3, 1, 6, '#c99a00');
}
function drawSpecial(q, got) { if (got) { ctx.globalAlpha = 0.25; } var w = 7 + Math.sin(F * 0.08 + q.x) * 1.5; ell(q.x, q.y, w, 9.5, '#7a3ab0'); ell(q.x, q.y, w - 1.5, 8, '#d08aff'); ell(q.x, q.y, w - 3.2, 6, '#7a3ab0'); star(q.x, q.y, 4, '#ffe14a', F * 0.04); ctx.globalAlpha = 1; }
function drawMover(m, pos, st, i) {
  var k = m.kind | 0, w = m.w, x = pos.x, y = pos.y;
  if (k === 3) { var s = st.mo[i].s; ctx.globalAlpha = s === 3 ? 0.15 : 1; var sh = s === 1 ? Math.sin(F * 1.2) : 0; rrect(x + sh, y, w, 7, 3, '#c8a050'); rect(x + 3 + sh, y, w - 6, 2, '#e8c880'); line(x + 8 + sh, y + 1, x + 11 + sh, y + 6, '#7a5a20'); line(x + w - 10 + sh, y + 1, x + w - 12 + sh, y + 6, '#7a5a20'); ctx.globalAlpha = 1; return; }
  if (k === 2) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(m.cx, m.y, m.amp, 0, 6.2832); ctx.stroke(); }
  rrect(x, y, w, 7, 3, k === 1 ? '#7a9ab0' : k === 2 ? '#b08ab0' : '#8a8fb0'); rect(x + 2, y, w - 4, 2, k === 1 ? '#bcd8e8' : k === 2 ? '#e8c8e8' : '#c9cee8'); circ(x + 6, y + 4.5, 1.3, '#4a4f70'); circ(x + w - 6, y + 4.5, 1.3, '#4a4f70');
}
function drawGoal(L, st, locked) {
  var gx = L.goalX, base = L.poleY, top = base - 9 * TS, tx = gx + 14;
  rect(gx, top, 3, base - top, locked ? '#8a4a4a' : '#e8e8f0'); rect(tx, top, 3, base - top, locked ? '#8a4a4a' : '#e8e8f0'); circ(gx + 1.5, top - 2, 3.5, locked ? '#d04a4a' : '#ffd23a'); circ(tx + 1.5, top - 2, 3.5, locked ? '#d04a4a' : '#ffd23a');
  if (locked) { line(gx + 3, base - 40, tx, base - 40, '#d04a4a', 3); line(gx + 3, base - 30, tx, base - 30, '#d04a4a', 3); return; }
  var ty = base - 18 - (0.5 + 0.5 * Math.sin(st.f * 0.045)) * 90; rect(gx + 3, ty - 1.5, 11, 3, '#e8403a'); rect(gx + 3, ty - 0.5, 11, 1, '#ffb0a0');
}
function drawLevel(st, th) {
  var L = st.L, cam = G.cam, c0 = Math.max(0, Math.floor(cam / TS)), c1 = Math.min(L.w - 1, Math.floor((cam + VW) / TS) + 1), c, r, i;
  ctx.save(); ctx.translate(-Math.round(cam), 0);
  for (c = c0; c <= c1; c++) for (r = 0; r < ROWS; r++) {
    var t = PF.tileAt(st, c, r), raw = st.mod.size ? (st.mod.get(c * ROWS + r) !== undefined ? st.mod.get(c * ROWS + r) : L.tiles[c * ROWS + r]) : L.tiles[c * ROWS + r];
    if (!t && raw === T.BRICK) t = T.BRICK;
    if (t === T.WATER) continue;
    if (!t) continue; var bd = 0;
    for (i = 0; i < G.bumps.length; i++) if (G.bumps[i].c === c && G.bumps[i].r === r) bd = -Math.sin(G.bumps[i].t / 10 * Math.PI) * 5;
    drawTile(t, c * TS, r * TS, th, r > 0 ? PF.tileAt(st, c, r - 1) : 0, bd, c, r, st);
  }
  // plants sit behind their stump top: draw enemies of type plant before the stumps would hide them is not needed (stump is below)
  drawGoal(L, st, st.boss > 0);
  for (i = 0; i < L.movers.length; i++) drawMover(L.movers[i], PF.movPos(st, i, st.f), st, i);
  if (L.cannons) for (i = 0; i < L.cannons.length; i++) { }
  for (i = 0; i < L.coins.length; i++) if (!st.cg[i] && L.coins[i].x > cam - 10 && L.coins[i].x < cam + VW + 10) drawCoin(L.coins[i], i);
  if (L.special) for (i = 0; i < L.special.length; i++) drawSpecial(L.special[i], st.sg[i]);
  for (i = 0; i < st.it.length; i++) if (st.it[i].alive) drawItem(st.it[i]);
  for (i = 0; i < st.en.length; i++) { var e = st.en[i]; if (e.x > cam - 40 && e.x < cam + VW + 40) drawEnemy(e); }
  for (i = 0; i < st.ep.length; i++) { circ(st.ep[i].x, st.ep[i].y, 4.5, '#b040ff'); circ(st.ep[i].x - 1, st.ep[i].y - 1, 1.6, '#f0d0ff'); }
  for (i = 0; i < st.fb.length; i++) { circ(st.fb[i].x, st.fb[i].y, 3.5, '#ff6a1a'); circ(st.fb[i].x, st.fb[i].y, 1.8, '#ffe14a'); }
  if (L.cp) { var kx = L.cp.x + 6, ky = L.cp.y + 14; rect(kx, ky - 22, 2, 22, '#c9cee8'); poly([kx + 2, ky - 22, kx + 12, ky - 18, kx + 2, ky - 14], st.cp ? '#3ad06a' : '#8a8fb0'); }
  if (G.hint) {
    var h = G.hint, k; for (k = 0; k < h.traj.length; k++) circ(h.traj[k].x, h.traj[k].y - 2, 1.3, 'rgba(255,240,90,.9)');
    if (h.land) { var pr = 4 + Math.sin(F * 0.2) * 1.5; ctx.strokeStyle = '#3aff7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.land.x, h.land.y, 6 + pr, 0, 6.3); ctx.stroke(); poly([h.land.x - 4, h.land.y - 16 - pr, h.land.x + 4, h.land.y - 16 - pr, h.land.x, h.land.y - 9 - pr], '#3aff7a'); }
    if (h.haz) { var hz = h.haz; ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hz.x, hz.y, 11 + Math.sin(F * 0.25) * 1.5, 0, 6.3); ctx.stroke(); }
  }
  var p = st.p;
  if (p.carry >= 0) { }
  if (G.mode === 'dying') drawHero({ x: p.x, y: G.dy, w: p.w, h: p.h, big: false, pw: 0, face: p.face, ground: false, anim: 0, vx: 0, inv: 0, star: 0, spin: 0 }, true, G.dieT * 0.25, false);
  else drawHero(p, false, 0, !!p.mount);
  // water overlay on top of everything
  for (c = c0; c <= c1; c++) for (r = 0; r < ROWS; r++) if (PF.tileAt(st, c, r) === T.WATER) drawWaterOverlay(c * TS, r * TS, r > 0 ? PF.tileAt(st, c, r - 1) : 0);
  for (i = 0; i < G.parts.length; i++) { var q = G.parts[i]; rect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s, q.col); }
  for (i = 0; i < G.pops.length; i++) { var pp = G.pops[i]; text(pp.t, pp.x, pp.y, 8, pp.c, 'center'); }
  ctx.restore();
}
function panel(x, y, w, h) { ctx.fillStyle = 'rgba(8,10,34,.84)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
function pad6(n) { var s = String(Math.max(0, n | 0)); while (s.length < 6) s = '0' + s; return s; }
function levelLabel(G) { var n = G.n; if (n >= 1000) return TT('별길', 'STAR ROAD'); var w = Math.floor((n - 1) / 5) + 1, i = (n - 1) % 5 + 1; return TT('월드 ', 'W') + w + '-' + i; }
function drawHUD(st) {
  rect(0, 0, VW, 15, 'rgba(0,0,0,.4)');
  text(TT('점수 ', 'SCORE ') + pad6(G.base + st.score), 5, 8, 8.5, '#fff');
  circ(104, 8, 4, '#ffe14a'); text('x' + (G.coinBase + st.coins), 110, 8, 8.5, '#fff');
  text(levelLabel(G), 150, 8, 8.5, '#fff');
  var secs = Math.max(0, Math.ceil(st.t / 60)); text(TT('시간 ', 'TIME ') + secs, 215, 8, 8.5, secs < 20 ? '#ff8a6a' : '#fff');
  for (var i = 0; i < 5; i++) star(279 + i * 9, 8, 3.6, i < st.sc ? '#d08aff' : '#555', 0);
  for (i = 0; i < Math.min(G.lives, 4); i++) { circ(336 + i * 9, 8, 3.6, '#2f8fe8'); ctx.fillStyle = '#e8403a'; ctx.beginPath(); ctx.arc(336 + i * 9, 7.5, 3.8, Math.PI, 0); ctx.fill(); }
  if (G.lives > 4) text('+' + (G.lives - 4), 396, 8, 8, '#fff', 'right');
  text(TT('최고 ', 'BEST ') + pad6(Math.max(G.best, G.base + st.score)), VW - 5, 24, 7, '#ffe9a0', 'right');
  // P meter
  var pm = st.p.pm / PF.P.PMAX; if (pm > 0.04) { for (var k = 0; k < 6; k++) { var on = pm >= (k + 1) / 6 - 0.001; poly([6 + k * 8, VH - 10, 12 + k * 8, VH - 13, 12 + k * 8, VH - 7], on ? (pm >= 0.999 ? '#ffd23a' : '#7dff9a') : 'rgba(255,255,255,.2)'); } if (pm >= 0.999) text('P', 56, VH - 10, 8, '#ffd23a'); }
  if (st.p.star > 0) text('★ ' + Math.ceil(st.p.star / 60), 6, VH - 24, 8, '#ffe14a');
  if (st.sw > 0) text(TT('스위치 ', 'SWITCH ') + Math.ceil(st.sw / 60), 6, VH - 34, 8, '#9ac8ff');
  if (G.auto) { var w = 128; rrect(VW / 2 - w / 2, 19, w, 14, 4, 'rgba(255,200,40,.92)'); text(TT('자동 플레이 (F3 끄기)', 'AUTO PLAY (F3 to stop)'), VW / 2, 26, 8, '#3a2000', 'center', false); }
  if (G.msgT > 0 && G.msg) { var tw = Math.min(VW - 16, 8 + G.msg.length * (KO ? 7.4 : 4.9)); rrect(VW / 2 - tw / 2, VH - 22, tw, 15, 4, 'rgba(0,0,0,.6)'); text(G.msg, VW / 2, VH - 14.5, 8, '#fff', 'center', false); }
  if (st.boss > 0 && st.L.arena && st.p.x > st.L.arena.c0 * TS - 100) text(TT('보스를 쓰러뜨려야 깃발이 열려요!', 'Defeat the boss to open the gate!'), VW / 2, 42, 8, '#ff8a8a', 'center');
}
function overlay(title, lines) {
  panel(44, 36, VW - 88, 138); text(title, VW / 2, 58, 18, '#ffd23a', 'center');
  for (var i = 0; i < lines.length; i++) text(lines[i], VW / 2, 84 + i * 14, 8.5, i === lines.length - 1 ? '#7dff9a' : '#fff', 'center');
}
// ---------------------------------------------------------------- overworld map
var NODE_COL = { plain: '#4cc060', hills: '#8ac040', flood: '#3a9ae0', ghost: '#8a6ad0', sky: '#e8a0c0', cave: '#a07850', castle: '#c04a4a', bonus: '#ffd23a' };
function drawMap() {
  var wm = G.map, th = THEMES[wm.w % 4 === 2 ? 3 : wm.w % 2 ? 1 : 0];
  var g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#2a7ac8'); g.addColorStop(1, '#6ac0e8'); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  var r = PF.rng(wm.w * 31 + 7); ctx.fillStyle = '#5fc060'; ctx.beginPath(); ctx.moveTo(10, 60); ctx.bezierCurveTo(60, 20, 340, 20, 390, 60); ctx.lineTo(392, 180); ctx.bezierCurveTo(300, 215, 100, 215, 8, 180); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7ad070'; for (var i = 0; i < 14; i++) circ(20 + r() * 360, 50 + r() * 140, 8 + r() * 22, 'rgba(120,220,110,.5)');
  for (i = 0; i < 18; i++) { var tx = 16 + r() * 368, ty = 48 + r() * 150; circ(tx, ty, 5, '#2f8a3a'); rect(tx - 1, ty + 4, 2, 4, '#6a4220'); }
  var nodes = wm.nodes; ctx.lineCap = 'round';
  for (i = 0; i < nodes.length - 1; i++) { var a = nodes[i], b = nodes[i + 1], ok = G.prog.done[wm.w] && G.prog.done[wm.w][i]; ctx.setLineDash([4, 4]); line(a.x, a.y, b.x, b.y, ok ? '#fff3b0' : 'rgba(255,255,255,.35)', 3); ctx.setLineDash([]); }
  if (G.prog.secret[wm.w]) { var s = nodes[2], bn = wm.bonus; ctx.setLineDash([2, 4]); line(s.x, s.y, bn.x, bn.y, '#ffd23a', 2); ctx.setLineDash([]); }
  var all = nodes.slice(); if (G.prog.secret[wm.w]) all.push(wm.bonus);
  for (i = 0; i < all.length; i++) { var nd = all[i], done = G.prog.done[wm.w] && G.prog.done[wm.w][nd.i], open = nd.i === 5 || nd.i === 0 || (G.prog.done[wm.w] && G.prog.done[wm.w][nd.i - 1]), sel = G.sel === nd.i;
    var col = open ? NODE_COL[nd.kind] : '#7a7a8a';
    if (nd.kind === 'castle') { rect(nd.x - 8, nd.y - 6, 16, 12, col); for (var q = 0; q < 3; q++) rect(nd.x - 8 + q * 6, nd.y - 9, 4, 4, col); rect(nd.x - 2, nd.y - 1, 4, 7, '#2a1018'); }
    else if (nd.kind === 'bonus') star(nd.x, nd.y, 9, col, F * 0.03);
    else { circ(nd.x, nd.y, 8, '#222'); circ(nd.x, nd.y, 6.5, col); }
    if (done) { circ(nd.x + 7, nd.y - 7, 4, '#fff'); poly([nd.x + 5, nd.y - 7, nd.x + 7, nd.y - 5, nd.x + 10, nd.y - 9], null, '#2a8a3a'); ctx.strokeStyle = '#2a8a3a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(nd.x + 5, nd.y - 7); ctx.lineTo(nd.x + 7, nd.y - 5); ctx.lineTo(nd.x + 10, nd.y - 9); ctx.stroke(); }
    if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(nd.x, nd.y, 12 + Math.sin(F * 0.2) * 1.5, 0, 6.3); ctx.stroke(); }
    text(String(nd.i === 5 ? '★' : nd.i + 1), nd.x, nd.y + 0.5, 8, '#fff', 'center'); }
  var cur = all.filter(function (n) { return n.i === G.sel; })[0] || nodes[0];
  drawHero({ x: cur.x - 6, y: cur.y - 30 + Math.sin(F * 0.1) * 2, w: 12, h: 14, pw: 0, big: false, face: 1, ground: false, anim: 0, vx: 0, inv: 0, star: 0, spin: 0 }, false, 0, false);
  rect(0, 0, VW, 16, 'rgba(0,0,0,.45)'); text(TT('월드 ', 'WORLD ') + (wm.w + 1), 6, 8.5, 10, '#ffd23a'); text(TT('점수 ', 'SCORE ') + pad6(G.base), 100, 8.5, 8.5, '#fff');
  for (i = 0; i < Math.min(G.lives, 5); i++) { circ(300 + i * 9, 8, 3.6, '#2f8fe8'); ctx.fillStyle = '#e8403a'; ctx.beginPath(); ctx.arc(300 + i * 9, 7.5, 3.8, Math.PI, 0); ctx.fill(); }
  var sn = all.filter(function (n) { return n.i === G.sel; })[0]; if (sn) { var kn = PF.KIND_NAMES[sn.kind]; rrect(70, VH - 26, 260, 18, 5, 'rgba(0,0,0,.6)'); text((sn.i === 5 ? '★ ' : (wm.w + 1) + '-' + (sn.i + 1) + '  ') + (KO ? kn[0] : kn[1]), VW / 2, VH - 17, 9, '#fff', 'center', false); }
  if (G.auto) { var w2 = 128; rrect(VW / 2 - w2 / 2, 20, w2, 14, 4, 'rgba(255,200,40,.92)'); text(TT('자동 플레이 (F3 끄기)', 'AUTO PLAY (F3 to stop)'), VW / 2, 27, 8, '#3a2000', 'center', false); }
  if (G.msgT > 0 && G.msg) { var tw = Math.min(VW - 16, 8 + G.msg.length * (KO ? 7.4 : 4.9)); rrect(VW / 2 - tw / 2, 40, tw, 15, 4, 'rgba(0,0,0,.6)'); text(G.msg, VW / 2, 47.5, 8, '#fff', 'center', false); }
  text(TT('← → 선택   점프/Enter 시작', 'Left/Right select   Jump/Enter start'), VW / 2, VH - 38, 7.5, '#fff', 'center');
}
function render(g, c2d, bs) {
  G = g; ctx = c2d; F = g.frame;
  ctx.setTransform(bs, 0, 0, bs, 0, 0); ctx.clearRect(0, 0, VW, VH);
  if (G.mode === 'map' || (G.mode === 'start' && !G.st)) { drawMap(); return; }
  var st = G.st; if (!st) return;
  var th = THEMES[G.L.theme] || THEMES[0];
  drawBackground(th, G.cam); drawLevel(st, th); drawHUD(st);
  if (G.mode === 'loading') { panel(120, 90, 160, 40); text(TT('레벨 만드는 중...', 'Building level...'), VW / 2, 110, 10, '#fff', 'center'); }
  else if (G.mode === 'over') overlay(TT('게임 오버', 'GAME OVER'), [TT('점수: ', 'Score: ') + G.base, TT('도달: ', 'Reached: ') + levelLabel(G), TT('최고 점수: ', 'Best score: ') + G.best, TT('스페이스 또는 터치로 다시 시작 (F2)', 'Space or tap to play again (F2)')]);
  else if (G.mode === 'clear') { text(TT('레벨 클리어!', 'LEVEL CLEAR!'), VW / 2, 66, 20, '#ffd23a', 'center'); text('+' + G.bonus + (st.tape ? TT('  (테이프 보너스!)', '  (tape bonus!)') : ''), VW / 2, 90, 11, '#7dff9a', 'center'); if (G.secretExit) text(TT('비밀 출구 발견!', 'Secret exit found!'), VW / 2, 110, 11, '#d08aff', 'center'); }
  else if (G.mode === 'pause') text(TT('일시정지', 'PAUSED'), VW / 2, 90, 20, '#fff', 'center');
}
function startScreen(g, c2d, bs) {
  G = g; ctx = c2d; F = g.frame; ctx.setTransform(bs, 0, 0, bs, 0, 0); drawMap();
  overlay(TT('도형 월드', 'SHAPE WORLD'), [TT('도형 영웅의 모험: 월드를 돌며 깃발과 성을 정복하세요', 'A shape hero\'s adventure: clear every level and fortress'), TT('←→ 이동  Z/스페이스 점프  X/Shift 달리기  C 스핀점프', 'Arrows move  Z/Space jump  X/Shift run  C spin jump'), TT('↑ 덩굴/문   P-게이지가 차면 더 빠르고 높이!', 'Up: vines/doors   fill the P meter for speed and height'), TT('최고 점수: ', 'Best score: ') + g.best, TT('스페이스 또는 화면 터치로 시작', 'Press Space or tap to start')]);
}
root.PFR = { render: render, startScreen: startScreen, levelLabel: function (g) { return levelLabel(g); } };
})(window);
