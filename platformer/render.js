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
  ctx.font = 'bold ' + size + 'px "Trebuchet MS", "Segoe UI", system-ui, sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  if (sh !== false) { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(t, x + 1, y + 1); } ctx.fillStyle = c || '#fff'; ctx.fillText(t, x, y);
}
function diamond(cx, cy, rx, ry, c, stroke) { poly([cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy], c, stroke); }
function spark4(cx, cy, r, c) { poly([cx, cy - r, cx + r * 0.28, cy - r * 0.28, cx + r, cy, cx + r * 0.28, cy + r * 0.28, cx, cy + r, cx - r * 0.28, cy + r * 0.28, cx - r, cy, cx - r * 0.28, cy - r * 0.28], c); }
function spark8(cx, cy, r, c, rot) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.fillStyle = c; ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4); ctx.rotate(Math.PI / 4); ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4); ctx.restore(); }
function hex(cx, cy, r, c, rot) { var pts = []; for (var i = 0; i < 6; i++) { var a = (rot || 0) + i * Math.PI / 3; pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } poly(pts, c); }
// ---- art direction: "crystal dusk" - flat geometric shapes, strata ground, glowing crystal blocks, low-poly mountains
var THEMES = [
  { s1: '#2b1a5e', s2: '#ff9a7a', m1: '#4a2a86', m2: '#352070', str: ['#3b2f66', '#33295a', '#2b2250'], edge: '#7cf3d2', slab: '#8a78b8', mode: 'dusk', sun: '#ffd6a8' },
  { s1: '#5a2a7a', s2: '#ffc9a0', m1: '#8a4a9a', m2: '#6a3a8a', str: ['#6a4a86', '#5c3f78', '#4e346a'], edge: '#ffe08a', slab: '#a890c8', mode: 'sky', sun: '#fff0c8' },
  { s1: '#070a24', s2: '#1f2c6a', m1: '#1a2456', m2: '#121a42', str: ['#2a2a5a', '#242450', '#1e1e46'], edge: '#9a8aff', slab: '#5a5a9a', mode: 'night', sun: '#d8d4ff' },
  { s1: '#0a3a4a', s2: '#38c8c0', m1: '#14707a', m2: '#0e5662', str: ['#1c5a6a', '#18505e', '#144652'], edge: '#b8fff0', slab: '#5ab0b8', mode: 'lagoon', sun: '#d8fff6' },
  { s1: '#14061c', s2: '#4a1040', m1: '#2a0c34', m2: '#1c0826', str: ['#3a2a46', '#32243e', '#2a1c36'], edge: '#ff4ab0', slab: '#6a5a82', mode: 'castle', sun: '#ff6ac0' },
  { s1: '#1a1008', s2: '#5a3414', m1: '#3a2410', m2: '#2a1a0a', str: ['#4a3420', '#402c1a', '#362416'], edge: '#ffb04a', slab: '#8a6a4a', mode: 'cave', sun: '#ffb04a' }];
var MTN = (function () { var r = PF.rng(77), a = []; for (var i = 0; i < 9; i++) a.push({ x: i * 56 + r() * 20, w: 50 + r() * 50, h: 40 + r() * 55 }); return a; })();
var BARS = (function () { var r = PF.rng(99), a = []; for (var i = 0; i < 6; i++) a.push({ x: i * 90 + r() * 50, y: 16 + r() * 70, w: 24 + r() * 34 }); return a; })();
var SPARK = (function () { var r = PF.rng(5), a = []; for (var i = 0; i < 36; i++) a.push({ x: r() * VW, y: r() * 130, s: 0.8 + r() * 2 }); return a; })();

function drawBackground(th, cam) {
  var g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, th.s1); g.addColorStop(1, th.s2); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  var k, i2;
  if (th.mode === 'castle') {
    ctx.strokeStyle = 'rgba(255,74,176,.12)'; ctx.lineWidth = 1; var off = -((cam * 0.4) % 40);
    for (k = -1; k < VW / 40 + 2; k++) { line(off + k * 40, 0, off + k * 40, VH, 'rgba(255,74,176,.10)'); } for (k = 0; k < 8; k++) line(0, k * 30, VW, k * 30, 'rgba(255,74,176,.07)');
    for (k = 0; k < 5; k++) { var bx = ((k * 110 - cam * 0.6) % 560 + 560) % 560 - 60, bh = 70 + (k % 3) * 25; ctx.globalAlpha = 0.5; poly([bx, VH, bx + 10, VH - bh, bx + 20, VH], '#ff4ab0'); ctx.globalAlpha = 1; }
    return;
  }
  if (th.mode === 'cave') {
    for (k = 0; k < 9; k++) { var sx = ((k * 66 - cam * 0.55) % 600 + 600) % 600 - 40, hh = 20 + (k * 17) % 34; poly([sx, 0, sx + 20, 0, sx + 10, hh], '#2a1a0a'); }
    for (k = 0; k < 7; k++) { var gx = ((k * 83 - cam * 0.35) % 560 + 560) % 560 - 30; diamond(gx, 120 + (k * 29) % 70, 5, 9, 'rgba(255,176,74,.35)'); }
    return;
  }
  if (th.mode === 'night') for (var i = 0; i < SPARK.length; i++) { var sp = SPARK[i]; spark4(sp.x, sp.y, sp.s + 0.6 * Math.sin(F * 0.07 + i), 'rgba(220,220,255,.85)'); }
  ctx.strokeStyle = th.sun; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(330, 44, 16, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 0.25; circ(330, 44, 12, th.sun); ctx.globalAlpha = 1;
  if (th.mode === 'sky') for (k = 0; k < 7; k++) { var dx = ((k * 70 - cam * 0.3) % 520 + 520) % 520 - 20; diamond(dx, 60 + (k * 37) % 80, 6, 11, 'rgba(255,255,255,.22)'); }
  for (k = 0; k < 2; k++) { var o1 = -((cam * 0.15) % 504) + k * 504; for (i2 = 0; i2 < MTN.length; i2++) { var m = MTN[i2]; poly([o1 + m.x, VH - 14, o1 + m.x + m.w / 2, VH - 14 - m.h * 1.1, o1 + m.x + m.w, VH - 14], th.m1); } }
  for (k = 0; k < 2; k++) { var o2 = -((cam * 0.32) % 504) + k * 504; for (i2 = 0; i2 < MTN.length; i2++) { var m2 = MTN[(i2 + 3) % MTN.length]; poly([o2 + m2.x + 20, VH - 8, o2 + m2.x + 20 + m2.w * 0.45, VH - 8 - m2.h * 0.7, o2 + m2.x + 20 + m2.w * 0.9, VH - 8], th.m2); } }
  for (k = 0; k < 2; k++) { var o3 = -((cam * 0.45) % 540) + k * 540; for (i2 = 0; i2 < BARS.length; i2++) { var b = BARS[i2]; ctx.globalAlpha = 0.18; rrect(o3 + b.x, b.y, b.w, 4, 2, '#fff'); rrect(o3 + b.x + 8, b.y + 8, b.w * 0.6, 3, 1.5, '#fff'); ctx.globalAlpha = 1; } }
}
function crystal(x, y, base, light, dark, glow) {
  ctx.globalAlpha = 0.25 * glow; rect(x - 1, y - 1, TS + 2, TS + 2, light); ctx.globalAlpha = 1;
  rect(x, y, TS, TS, dark); poly([x + 1, y + 1, x + 15, y + 1, x + 8, y + 8], light); poly([x + 1, y + 1, x + 8, y + 8, x + 1, y + 15], base); poly([x + 15, y + 1, x + 15, y + 15, x + 8, y + 8], dark); poly([x + 1, y + 15, x + 8, y + 8, x + 15, y + 15], base);
  ctx.strokeStyle = light; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1);
}
function drawTile(t, x, y, th, above, bumpDy, c, r, st) {
  y += bumpDy || 0;
  switch (t) {
    case T.SOLID: {
      var air = (above === 0 || above === 6 || above === 7 || above === 9 || (above >= 12 && above <= 14) || above === 19 || above === 17);
      rect(x, y, TS, TS, th.str[(r || 0) % 3]); line(x, y + 0.5, x + TS, y + 0.5, 'rgba(255,255,255,.07)');
      ctx.globalAlpha = 0.12; line(x, y + TS, x + TS, y, '#fff'); line(x + 8, y + TS, x + TS, y + 8, '#fff'); ctx.globalAlpha = 1;
      if (air) { rect(x, y, TS, 2, th.edge); ctx.globalAlpha = 0.3; rect(x, y + 2, TS, 3, th.edge); ctx.globalAlpha = 1; }
      break; }
    case T.BRICK:
      if (st && st.sw > 0) { diamond(x + 8, y + 8, 4.5, 6.5, '#2ee6d6', '#0a6a70'); break; }
      rect(x, y, TS, TS, th.slab); rect(x + 1, y + 1, TS - 2, TS - 2, 'rgba(255,255,255,.12)'); ctx.strokeStyle = 'rgba(20,10,40,.55)'; ctx.lineWidth = 1; ctx.strokeRect(x + 2.5, y + 2.5, TS - 5, TS - 5); diamond(x + 8, y + 8, 3, 4, 'rgba(20,10,40,.55)'); line(x, y + 8, x + 3, y + 8, 'rgba(20,10,40,.55)'); line(x + 13, y + 8, x + 16, y + 8, 'rgba(20,10,40,.55)'); break;
    case T.QC: crystal(x, y, '#18b4c6', '#7af4ff', '#0c6a78', 0.7 + 0.3 * Math.sin(F * 0.1)); ctx.strokeStyle = '#04343c'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x + 8, y + 8, 3.2, 0, 6.2832); ctx.stroke(); break;
    case T.QP: crystal(x, y, '#c036e8', '#f08aff', '#6a1488', 0.7 + 0.3 * Math.sin(F * 0.1)); poly([x + 8, y + 4, x + 12.5, y + 12, x + 3.5, y + 12], '#2a0638'); break;
    case T.QS: crystal(x, y, '#9ab8e8', '#f4fbff', '#4a6a9a', 0.7 + 0.3 * Math.sin(F * 0.1)); spark4(x + 8, y + 8, 5, '#243a5a'); break;
    case T.QM: crystal(x, y, '#34c88a', '#9affc8', '#146a48', 0.7 + 0.3 * Math.sin(F * 0.1)); ctx.strokeStyle = '#06301e'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x + 8, y + 8, 4.2, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 8, y + 8, 1.6, 0, 6.2832); ctx.stroke(); break;
    case T.USED: rect(x, y, TS, TS, '#1c1630'); ctx.strokeStyle = '#50467a'; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, TS - 3, TS - 3); diamond(x + 8, y + 8, 2, 3, '#50467a'); break;
    case T.SPIKE: for (var i = 0; i < 3; i++) { poly([x + i * 5.5, y + 16, x + i * 5.5 + 2.7, y + 4 + (i % 2) * 2, x + i * 5.5 + 5.4, y + 16], '#ff3a8a', '#ffd0e4'); } break;
    case T.VINE: ctx.strokeStyle = '#3affb0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.lineTo(x + 5, y + 5); ctx.lineTo(x + 11, y + 11); ctx.lineTo(x + 8, y + 16); ctx.stroke(); diamond(x + 12.5, y + 5, 2.4, 3.5, '#b8ffe0'); diamond(x + 3.5, y + 12, 2.4, 3.5, '#b8ffe0'); break;
    case T.SPRING: rect(x + 1, y + 13, 14, 3, '#3a2f66'); ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 3, y + 13); ctx.lineTo(x + 13, y + 10); ctx.lineTo(x + 3, y + 7); ctx.lineTo(x + 13, y + 4); ctx.stroke(); rrect(x + 1, y + 1, 14, 3, 1.5, '#2ee6d6'); break;
    case T.CONVL: case T.CONVR: { rect(x, y, TS, TS, '#2a2450'); rect(x, y, TS, 5, '#16122e'); var dd = t === T.CONVR ? 1 : -1, ph = ((F * 0.6 * dd) % 8 + 8) % 8; ctx.save(); ctx.beginPath(); ctx.rect(x, y, TS, 5); ctx.clip(); for (var k = -1; k < 3; k++) poly(dd > 0 ? [x + k * 8 + ph, y + 0.5, x + k * 8 + ph + 4, y + 2.5, x + k * 8 + ph, y + 4.5] : [x + k * 8 + ph + 4, y + 0.5, x + k * 8 + ph, y + 2.5, x + k * 8 + ph + 4, y + 4.5], '#2ee6d6'); ctx.restore(); rect(x + 2, y + 9, 12, 2, '#3a3270'); break; }
    case T.SLR: poly([x, y + 16, x + 16, y + 16, x + 16, y], th.str[1]); line(x, y + 16, x + 16, y, th.edge, 2); break;
    case T.SLL: poly([x, y + 16, x + 16, y + 16, x, y], th.str[1]); line(x + 16, y + 16, x, y, th.edge, 2); break;
    case T.LAVA: { rect(x, y + 3, TS, TS - 3, '#ff3a6a'); for (var q = 0; q < 3; q++) poly([x + q * 5.5, y + 3, x + q * 5.5 + 2.7, y - 1 + Math.sin(F * 0.15 + q * 2 + c) * 1.5, x + q * 5.5 + 5.4, y + 3], '#ff9a4a'); rect(x + 4, y + 9, 3, 3, '#ffe0a0'); break; }
    case T.CANL: case T.CANR: { var dr = t === T.CANR ? 1 : -1; poly([x + 1, y + 16, x + 15, y + 16, x + 12, y + 9, x + 4, y + 9], '#2a2450'); hex(x + 8, y + 7, 7, '#4a3f86', 0.5); hex(x + 8, y + 7, 5, '#2a2450', 0.5); poly([x + 8 + dr * 6, y + 7, x + 8 + dr * 1, y + 3, x + 8 + dr * 1, y + 11], '#ff8a3a'); break; }
    case T.STUMP: poly([x + 2, y + 16, x + 14, y + 16, x + 12, y + 10, x + 4, y + 10], '#4a3f86'); poly([x + 4, y + 10, x + 12, y + 10, x + 11, y + 5, x + 5, y + 5], '#5a4ea0'); poly([x + 5, y + 5, x + 11, y + 5, x + 8, y + 1], '#6a5cc0'); line(x + 8, y + 3, x + 8, y + 15, '#2ee6d6', 1); break;
    case T.PSW: hex(x + 8, y + 8, 8.2, '#3a2a8a', Math.PI / 6); hex(x + 8, y + 8, 6.4, '#6a52e0', Math.PI / 6); poly([x + 9, y + 3, x + 5, y + 9, x + 8, y + 9, x + 7, y + 13, x + 11, y + 7, x + 8, y + 7], '#ffe8a0'); break;
    case T.GATE: { var gg = 0.6 + 0.4 * Math.sin(F * 0.2 + y); rect(x + 1, y, 3, TS, '#7a6ae0'); rect(x + 12, y, 3, TS, '#7a6ae0'); ctx.globalAlpha = 0.5 * gg; rect(x + 4, y, 8, TS, '#c8b8ff'); ctx.globalAlpha = 1; for (var q = 0; q < 4; q++) line(x + 4, y + 2 + q * 4 + (F * 0.3) % 4, x + 12, y + 2 + q * 4 + (F * 0.3) % 4, 'rgba(255,255,255,.7)'); break; }
    case T.BRIDGE: rect(x, y, TS, 5, '#2ee6d6'); rect(x, y, TS, 1.5, '#e8fffa'); for (var q2 = 0; q2 < 2; q2++) line(x + 4 + q2 * 8, y + 1.5, x + 4 + q2 * 8, y + 5, 'rgba(10,106,112,.7)'); break;
    case T.SWITCH: { var pu = 0.7 + 0.3 * Math.sin(F * 0.15); ctx.globalAlpha = 0.3 * pu; hex(x + 8, y + 12, 9, '#ffe08a', 0); ctx.globalAlpha = 1; poly([x + 1, y + 16, x + 15, y + 16, x + 13, y + 11, x + 3, y + 11], '#4a3f86'); poly([x + 3, y + 11, x + 13, y + 11, x + 11, y + 8, x + 5, y + 8], '#ffb02a'); rect(x + 5, y + 8, 6, 1.5, '#fff0b0'); break; }
    case T.SWUSED: poly([x + 1, y + 16, x + 15, y + 16, x + 13, y + 13, x + 3, y + 13], '#3a2f66'); rect(x + 4, y + 12, 8, 1.5, '#7a6ab0'); break;
    case T.DOOR: { var dc = st && st.L.grp ? st.L.grp[c * ROWS + r] : 0, kc = KEYCOL[dc % 3]; rect(x, y, TS, TS, '#2a2450'); rect(x + 2, y + 1, TS - 4, TS - 2, kc); rect(x + 3, y + 2, TS - 6, TS - 4, 'rgba(0,0,0,.25)'); if (st && st.L.grp && st.L.tiles[c * ROWS + r - 1] !== T.DOOR) { circ(x + 8, y + 9, 2.4, '#1a1a40'); rect(x + 7.2, y + 9, 1.6, 4, '#1a1a40'); } break; }
    case T.TELE: drawTele(x, y, teleColor(st.L, c), true); break;
    case T.LAUNCH: { ctx.save(); ctx.translate(x + 8, y + 9); ctx.rotate(-0.9); rrect(-9, -6, 18, 12, 4, '#4a3f86'); rect(-9, -6, 5, 12, '#2a2450'); rect(5, -5, 4, 10, '#ff8a3a'); ctx.restore(); circ(x + 8, y + 12, 3, '#ffe08a'); poly([x + 12, y + 4, x + 16, y + 1, x + 14, y + 7], '#ff8a3a'); break; }
    case T.RING: { if (r !== undefined && st && st.L.tiles[c * ROWS + r - 1] === T.RING) break; var gl = 0.6 + 0.4 * Math.sin(F * 0.12); ctx.globalAlpha = 0.28 * gl; ell(x + 8, y + 16, 11, 17, '#7affe0'); ctx.globalAlpha = 1; ctx.strokeStyle = '#d8fff6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + 8, y + 16, 7.5, 14, 0, 0, 6.2832); ctx.stroke(); ctx.strokeStyle = '#2ee6d6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + 8, y + 16, 4.5 + gl, 10 + gl, 0, 0, 6.2832); ctx.stroke(); spark4(x + 8, y + 16, 3.5, '#fff'); break; }
  }
}
function hh(a, b) { return PF.hash(a, b, 7) % 1000; }
function drawSeabed(c, r) {
  var x = c * TS, y = r * TS, h = hh(c, r);
  if (h % 5 < 2) { for (var k = 0; k < 2; k++) { ctx.strokeStyle = k ? '#2ee6a8' : '#58ffc8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 5 + k * 6, y); for (var j = 1; j <= 4; j++) ctx.lineTo(x + 5 + k * 6 + Math.sin(F * 0.06 + j * 0.9 + k + c) * 2.2, y - j * 4); ctx.stroke(); } }
  else if (h % 5 === 2) { poly([x + 3, y, x + 6, y - 9, x + 9, y], '#ff7ab0'); poly([x + 8, y, x + 11, y - 12, x + 14, y], '#ff4a8a'); poly([x + 1, y, x + 3, y - 5, x + 5, y], '#ffb0d0'); }
  else if (h % 5 === 3) { hex(x + 8, y - 2.5, 3.5, '#9a8aff', 0); }
}
function drawPocket(p) { var pr = 8 + Math.sin(F * 0.1 + p.x) * 1; ctx.fillStyle = 'rgba(200,255,255,.22)'; ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, 6.2832); ctx.fill(); ctx.strokeStyle = 'rgba(230,255,255,.95)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, 6.2832); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, pr - 3, 3.6, 4.6); ctx.stroke(); text('O\u2082', p.x, p.y + 0.5, 6, '#bff', 'center', false); }
function drawWind(w) {
  var up = w.dy < 0, n = up ? 4 : 6, i; ctx.strokeStyle = up ? 'rgba(180,255,240,.55)' : 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.4;
  for (i = 0; i < n; i++) {
    if (up) { var xx = w.x0 + (i + 0.5) * (w.x1 - w.x0) / n, yy = w.y1 - ((F * 1.6 + i * 37) % (w.y1 - w.y0)); line(xx, yy, xx, yy - 10, ctx.strokeStyle, 1.4); poly([xx - 3, yy - 8, xx, yy - 13, xx + 3, yy - 8], ctx.strokeStyle); }
    else { var yy2 = w.y0 + (i + 0.5) * (w.y1 - w.y0) / n, dd = w.dx > 0 ? 1 : -1, xx2 = w.x0 + ((F * 1.4 * dd + i * 53) % (w.x1 - w.x0) + (w.x1 - w.x0)) % (w.x1 - w.x0); line(xx2, yy2, xx2 + dd * 14, yy2, ctx.strokeStyle, 1.4); ctx.beginPath(); ctx.moveTo(xx2 + dd * 14, yy2); ctx.lineTo(xx2 + dd * 10, yy2 - 2.5); ctx.moveTo(xx2 + dd * 14, yy2); ctx.lineTo(xx2 + dd * 10, yy2 + 2.5); ctx.stroke(); }
  }
}
var KEYCOL = ['#2ee6d6', '#ff6ad5', '#b8ff3a'];
function drawKey(x, y, c, got) { var col = KEYCOL[c % 3], bob = Math.sin(F * 0.1 + x) * 1.5; if (got) ctx.globalAlpha = 0.25; ctx.save(); ctx.translate(x, y + bob); ctx.rotate(Math.sin(F * 0.05) * 0.2); diamond(0, -4, 4.5, 5.5, col, '#1a1a40'); circ(0, -4, 1.6, '#1a1a40'); rect(-1, 0, 2, 8, col); rect(1, 4, 3, 1.6, col); rect(1, 7, 2.4, 1.6, col); ctx.restore(); ctx.globalAlpha = 1; }
function teleColor(L, c) { if (!L._tc) { L._tc = {}; (L.tele || []).forEach(function (t) { L._tc[t.c] = t.col; L._tc[Math.floor((t.tx + 8) / TS)] = t.col; }); } return L._tc[c] === undefined ? 0 : L._tc[c]; }
function drawTele(x, y, col, active) { var cc = KEYCOL[col % 3], gl = 0.6 + 0.4 * Math.sin(F * 0.15 + x); ctx.globalAlpha = 0.3 * gl; ell(x + 8, y + 12, 9, 6, cc); ctx.globalAlpha = 1; ctx.strokeStyle = cc; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + 8, y + 12, 7, 3.5, 0, 0, 6.2832); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + 8, y + 12, 3.5 + gl, 1.7 + gl * 0.4, 0, 0, 6.2832); ctx.stroke(); for (var k = 0; k < 3; k++) { var yy = y + 10 - ((F * 0.6 + k * 5) % 14); ctx.globalAlpha = 0.6; spark4(x + 5 + (k * 3) % 7, yy, 1.6, cc); ctx.globalAlpha = 1; } }
function drawWaterOverlay(x, y, above, wt, c, r) {
  ctx.fillStyle = 'rgba(40,200,220,.30)'; ctx.fillRect(x, y, TS, TS);
  if (wt === T.CURL || wt === T.CURR) { var dd = wt === T.CURR ? 1 : -1, ph = ((F * 0.5 * dd) % 8 + 8) % 8; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2; for (var k = -1; k < 3; k++) { var cx = x + k * 8 + ph; ctx.beginPath(); ctx.moveTo(cx - dd * 2, y + 5); ctx.lineTo(cx + dd * 2, y + 8); ctx.lineTo(cx - dd * 2, y + 11); ctx.stroke(); } }
  else if (wt === T.CURU) { var pu = (F * 0.6) % 8; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.2; for (var k2 = 0; k2 < 3; k2++) { var cy = y + 16 - ((k2 * 8 + pu) % 16); ctx.beginPath(); ctx.moveTo(x + 4, cy + 2); ctx.lineTo(x + 8, cy - 2); ctx.lineTo(x + 12, cy + 2); ctx.stroke(); } }
  var bh = hh(c, r); if (bh % 9 === 0) { var by = y + 16 - ((F * 0.35 + bh) % 40) % 16, bx = x + 8 + Math.sin(F * 0.08 + bh) * 3; ctx.strokeStyle = 'rgba(230,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 1.6 + (bh % 3) * 0.6, 0, 6.2832); ctx.stroke(); } if (!PF.isW(above)) { ctx.strokeStyle = 'rgba(220,255,250,.95)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (var i = 0; i <= 4; i++) { var xx = x + i * 4, yy = y + 1 + Math.sin(F * 0.12 + x * 0.3 + i) * 1.2; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); } }

// hero: a rounded diamond with one big eye (original)
function drawHero(p, dead, spinA, mounted) {
  var h = p.h, w = p.w, x = p.x, y = p.y, face = p.face >= 0 ? 1 : -1, cx = x + w / 2, pw = p.pw | 0, cy = y + h / 2, rx = w / 2 + 3.5;
  if (p.inv > 0 && !dead && (Math.floor(p.inv / 4) % 2)) ctx.globalAlpha = 0.45;
  var body = ['#ff8a3d', '#ff8a3d', '#ff3d8a', '#3dd6c0'][pw], light = ['#ffc08a', '#ffc08a', '#ff9ac0', '#9af0e0'][pw], dark = ['#c24a14', '#c24a14', '#a01450', '#16806e'][pw];
  if (p.star > 0) { var hue = (F * 14) % 360; body = 'hsl(' + hue + ',90%,58%)'; light = 'hsl(' + hue + ',95%,80%)'; dark = 'hsl(' + ((hue + 60) % 360) + ',80%,35%)'; }
  ctx.save(); ctx.translate(cx, cy); if (spinA) ctx.rotate(spinA); if (p.spin > 0) ctx.scale(Math.cos(p.spin * 0.7), 1); ctx.translate(-cx, -cy);
  if (mounted) { // rideable creature (original): a violet dome scarab
    var bob = Math.abs(Math.sin(p.anim * 1.5)) * (p.ground && Math.abs(p.vx) > 0.2 ? 1.5 : 0);
    ctx.fillStyle = '#7a4ae0'; ctx.beginPath(); ctx.arc(cx, y + h + 2 - bob, 12, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#a07aff'; ctx.beginPath(); ctx.arc(cx, y + h + 2 - bob, 12, Math.PI * 1.1, Math.PI * 1.55); ctx.lineTo(cx, y + h + 2 - bob); ctx.fill();
    line(cx + face * 9, y + h - 6 - bob, cx + face * 14, y + h - 12 - bob, '#d8c8ff', 1.5); circ(cx + face * 14, y + h - 12 - bob, 1.6, '#2ee6d6'); line(cx - 7, y + h + 2 - bob, cx - 9, y + h + 6, '#4a2a9a', 2); line(cx + 7, y + h + 2 - bob, cx + 9, y + h + 6, '#4a2a9a', 2); line(cx, y + h + 2 - bob, cx, y + h + 6, '#4a2a9a', 2);
  }
  if (pw === 3) { var gl = p.glide ? 1 : 0; poly([cx - face * 3, cy - 2, cx - face * (11 + gl * 7), cy - 8 - gl * 4, cx - face * (8 + gl * 4), cy + 2], '#d8ff6a', '#6a9a14'); poly([cx - face * 3, cy + 1, cx - face * (12 + gl * 6), cy + 4 + gl * 2, cx - face * 6, cy + 8], '#b8f03a', '#6a9a14'); }
  var by = y + (mounted ? -2 : 0);
  if (!mounted) { var st2 = Math.sin(p.anim * 2.2), mv = Math.abs(p.vx) > 0.2 && p.ground; if (p.ground) { circ(cx - 3 + (mv ? st2 * 2.5 : 0), y + h - 1, 2, dark); circ(cx + 3 - (mv ? st2 * 2.5 : 0), y + h - 1, 2, dark); } else { circ(cx - 3, y + h - 3, 2, dark); circ(cx + 3, y + h - 4, 2, dark); } }
  var top = by + 1, bot = by + h - 1;
  poly([cx, top, cx + rx, cy, cx, bot, cx - rx, cy], dark); poly([cx, top + 1.5, cx + rx - 2, cy, cx, bot - 1.5, cx - rx + 2, cy], body); poly([cx, top + 1.5, cx - rx + 2, cy, cx, cy], light);
  if (pw === 2) { poly([cx - 3, top + 3, cx - 1, top - 5, cx + 0.5, top + 2], '#ffb02a'); poly([cx - 0.5, top + 2, cx + 2, top - 7, cx + 4, top + 3], '#ff7a1a'); }
  else if (p.big) { poly([cx - 3, top + 3, cx, top - 3, cx + 3, top + 3], '#fff0c0'); }
  poly([cx - 3, top + 3, cx - 7, top - 1, cx - 5.5, top + 6], '#8a5aff'); poly([cx + 3, top + 3, cx + 7, top - 1, cx + 5.5, top + 6], '#8a5aff');
  var ey = cy - (p.big ? 3 : 1); ell(cx, ey, 5.2, 5.6, '#fff'); circ(cx + face * 1.8, ey + 0.4, 2.8, '#2a1456'); circ(cx + face * 2.6, ey - 0.8, 0.9, '#fff');
  ctx.restore(); ctx.globalAlpha = 1;
}
function drawEnemy(e) {
  var cx = e.x + e.w / 2, by = e.y + e.h, dir = e.dir || 1, f = F, cy = e.y + e.h / 2;
  if (!e.alive) { if (e.dt > 0) { ctx.globalAlpha = Math.min(1, e.dt / 24); if (e.t === E.BOSS) { for (var q = 0; q < 8; q++) spark4(cx + Math.cos(q * 0.8 + e.dt * 0.2) * (34 - e.dt * 0.45), cy + Math.sin(q * 1.3 + e.dt * 0.2) * (34 - e.dt * 0.45), 5, '#ffe08a'); } else { rect(cx - 8, by - 2, 16, 2, '#c9b8ff'); spark4(cx, by - 4, 5, '#fff'); } ctx.globalAlpha = 1; } return; }
  switch (e.t) {
    case E.WALKER: { var s1 = Math.sin(f * 0.25 + e.x);   // wedge crawler: violet triangle, one eye, two foot nubs
      poly([cx, by - 12, cx + 7.5, by - 2, cx - 7.5, by - 2], '#8a5cff', '#2a1070'); poly([cx, by - 12, cx - 7.5, by - 2, cx, by - 2], '#b090ff');
      rect(cx - 6 + s1 * 1.5, by - 2, 4, 2, '#2a1070'); rect(cx + 2 - s1 * 1.5, by - 2, 4, 2, '#2a1070');
      circ(cx + dir * 0.8, by - 6, 3, '#fff'); circ(cx + dir * 1.8, by - 5.8, 1.5, '#1a0a40'); break; }
    case E.SPIKY: { ctx.save(); ctx.translate(cx, cy); ctx.rotate(f * 0.06 * dir); for (var i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); poly([-2.6, -5.5, 0, -11.5, 2.6, -5.5], '#ff3a8a', '#ffd0e4'); } ctx.restore();
      circ(cx, cy, 6.4, '#1c1030'); circ(cx, cy, 6.4, 'rgba(255,58,138,.25)'); circ(cx + dir * 0.6, cy, 2.8, '#ff3a8a'); circ(cx + dir * 0.9, cy - 0.4, 1.1, '#fff'); break; }
    case E.FLYER: { var fl = Math.sin(f * 0.4) * 4;   // kite: coral diamond with a ribbon tail and flapping fins
      line(cx - dir * 6, cy, cx - dir * 11, cy + 4 + Math.sin(f * 0.3) * 2, '#ff9ab0', 1.5); line(cx - dir * 11, cy + 4 + Math.sin(f * 0.3) * 2, cx - dir * 15, cy + 1, '#ff9ab0', 1.5);
      poly([cx, cy - 2, cx - 11, cy - 7 - fl, cx - 6, cy + 1], '#ffd0dc', '#a02a50'); poly([cx, cy - 2, cx + 11, cy - 7 - fl, cx + 6, cy + 1], '#ffd0dc', '#a02a50');
      diamond(cx, cy, 6.5, 7, '#ff5a7a', '#6a0a2a'); circ(cx + dir * 0.8, cy - 0.5, 2.6, '#fff'); circ(cx + dir * 1.6, cy - 0.3, 1.2, '#2a0a1a'); break; }
    case E.BEETLE: {   // cube-bug: a boxy bug; when stomped it leaves a glowing cube that can be kicked or carried
      if (e.sh) { var ec = e.sh === 2 ? 'hsl(' + (F * 20 % 360) + ',80%,60%)' : '#ffb04a'; crystalBox(cx, by - 5, 8, ec); if (e.sh === 2) { ctx.globalAlpha = 0.45; poly([cx - e.dir * 8, by - 8, cx - e.dir * 17, by - 5, cx - e.dir * 8, by - 2], '#ffe0a0'); ctx.globalAlpha = 1; } break; }
      var s3 = Math.sin(f * 0.22 + e.x); rrect(cx - 6.5, by - 12, 13, 10, 3, '#3ac07a'); rect(cx - 6.5, by - 12, 13, 3, '#8affc0'); line(cx - 6.5, by - 7, cx + 6.5, by - 7, '#14663e', 1);
      line(cx + dir * 3, by - 12, cx + dir * 5, by - 16, '#8affc0', 1.5); circ(cx + dir * 5, by - 16, 1.5, '#ffe08a'); circ(cx + dir * 2.5, by - 8.5, 2.3, '#fff'); circ(cx + dir * 3.2, by - 8.4, 1.1, '#0a3020'); rect(cx - 5 + s3 * 1.5, by - 2, 3.5, 2, '#14663e'); rect(cx + 1.5 - s3 * 1.5, by - 2, 3.5, 2, '#14663e'); break; }
    case E.BULLET: { poly([cx - e.dir * 3, e.y + 5, cx - e.dir * 12, e.y + 1 + Math.sin(f) * 1.5, cx - e.dir * 10, e.y + 5, cx - e.dir * 12, e.y + 9 - Math.sin(f) * 1.5], '#a0ff4a'); circ(cx + e.dir * 1, e.y + 5, 5, '#e8ffb0'); circ(cx + e.dir * 1, e.y + 5, 3, '#6ad020'); circ(cx + e.dir * 1.6, e.y + 4.4, 1.1, '#fff'); break; }
    case E.CRUSH: { var ang = e.s === 1; poly([e.x + 3, e.y, e.x + e.w - 3, e.y, e.x + e.w, e.y + 5, e.x + e.w, e.y + e.h - 4, e.x + e.w - 4, e.y + e.h, e.x + 4, e.y + e.h, e.x, e.y + e.h - 4, e.x, e.y + 5], '#3a3452', '#9a8ac8');
      line(e.x + 5, e.y + 4, e.x + 9, e.y + 11, 'rgba(154,138,200,.7)'); line(e.x + e.w - 5, e.y + 4, e.x + e.w - 9, e.y + 12, 'rgba(154,138,200,.7)');
      rect(e.x + 4, e.y + 9, e.w - 8, 3.5, ang ? '#ff4a3a' : '#ff9a4a'); for (var k = 0; k < 4; k++) poly([e.x + 2 + k * 5.5, e.y + e.h, e.x + 4.7 + k * 5.5, e.y + e.h + (ang ? 6 : 4), e.x + 7.4 + k * 5.5, e.y + e.h], ang ? '#ff4a3a' : '#ff9a4a'); break; }
    case E.GHOST: { var wob = Math.sin(f * 0.15 + e.x) * 1.5, tx = -e.dir * 1; ctx.globalAlpha = 0.9;   // wisp: teardrop of pale light with a ring eye
      poly([cx + tx * 9, cy + 8 + wob, cx - 6, cy - 1 + wob, cx + 6, cy - 1 + wob], '#9afff0'); ctx.fillStyle = '#d8fffa'; ctx.beginPath(); ctx.arc(cx, cy - 2 + wob, 7, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#146a70'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx + dir * 1.2, cy - 2.5 + wob, 3.2, 0, 6.2832); ctx.stroke(); circ(cx + dir * 1.8, cy - 2.5 + wob, 1.2, '#146a70'); break; }
    case E.PLANT: { if (e.y > e.y0 - 1 && e.hid) break; var top = e.y;   // spore bud on a pylon
      line(cx, top + 8, cx, e.y0 + 6, '#3affb0', 2); spark8(cx, top + 6, 6.5, '#ff3a8a', f * 0.03); circ(cx, top + 6, 3.2, '#ffd0e4'); circ(cx, top + 6, 1.4, '#6a0a2a'); break; }
    case E.SWIM: { var big = e.sz === 1, wag = Math.sin(f * 0.3 + e.x * 0.1) * 2.5, bw = big ? 11 : 6, bh = big ? 6 : 4;
      poly([cx - dir * bw * 0.8, cy, cx - dir * (bw + 6), cy - 4 - wag, cx - dir * (bw + 6), cy + 4 - wag], big ? '#2a3ac0' : '#4a6aff'); ell(cx, cy, bw, bh, big ? '#3a4ae0' : '#5a7aff'); ell(cx, cy + bh * 0.3, bw * 0.8, bh * 0.5, 'rgba(255,255,255,.25)');
      if (big) { poly([cx - 3, cy - bh, cx + 1, cy - bh - 4, cx + 4, cy - bh], '#9ab0ff'); line(cx - dir * 2, cy - bh + 1, cx - dir * 2, cy + bh - 1, 'rgba(255,255,255,.35)'); }
      circ(cx + dir * bw * 0.5, cy - 0.5, big ? 2.6 : 2, '#fff'); circ(cx + dir * bw * 0.6, cy - 0.5, big ? 1.2 : 1, '#0a1040'); break; }
    case E.CHASER: { var ag = e.s === 1; poly([cx + dir * 8, cy, cx - dir * 5, cy - 5, cx - dir * 5, cy + 5], ag ? '#ff4a2a' : '#ff8a5a', '#6a1004'); poly([cx - dir * 5, cy, cx - dir * 11, cy - 4, cx - dir * 11, cy + 4], ag ? '#ff9a6a' : '#ffb090'); line(cx + dir * 1, cy - 3.5, cx + dir * 6, cy - 1.5, '#200', 1.5); circ(cx + dir * 3, cy, ag ? 2.2 : 1.8, '#fff'); circ(cx + dir * 3.6, cy, 1, ag ? '#c00' : '#200'); break; }
    case E.FMINE: { ctx.save(); ctx.translate(cx, cy); ctx.rotate(f * 0.02); for (var m1 = 0; m1 < 6; m1++) { ctx.rotate(Math.PI / 3); poly([-2.6, -6, 0, -11.5, 2.6, -6], '#ff3a8a', '#ffd0e4'); } ctx.restore(); hex(cx, cy, 6.6, '#1c1030', 0.5); hex(cx, cy, 6.6, 'rgba(255,58,138,.2)', 0.5); circ(cx, cy, 2.4 + (Math.sin(f * 0.15) > 0.5 ? 0.8 : 0), Math.sin(f * 0.15) > 0.5 ? '#fff' : '#ff3a8a'); break; }
    case E.WHALE: { var wg = Math.sin(f * 0.08) * 2; poly([cx - dir * 20, cy, cx - dir * 32, cy - 9 + wg, cx - dir * 32, cy + 9 - wg], '#4a3ac0'); ell(cx, cy, 22, 10, '#6a5ae0'); ell(cx, cy + 3, 18, 5, '#b8a8ff'); poly([cx - 4, cy - 9, cx + 2, cy - 15, cx + 8, cy - 9], '#4a3ac0');
      circ(cx + dir * 12, cy - 3, 3.2, '#fff'); circ(cx + dir * 12.8, cy - 3, 1.5, '#1a1050'); ctx.fillStyle = '#1a0a30'; ctx.beginPath(); ctx.arc(cx + dir * 20, cy + 2, 6, dir > 0 ? -1.2 : Math.PI - 1.9 + 0.7, dir > 0 ? 1.2 : Math.PI + 1.2); ctx.fill();
      for (var tt = 0; tt < 3; tt++) poly([cx + dir * (16 + tt * 2), cy - 2 + tt * 3, cx + dir * (19 + tt * 2), cy + 0 + tt * 3, cx + dir * (16 + tt * 2), cy + 2 + tt * 3], '#ff3a8a'); break; }
    case E.JELLY: { var pu = e.pul || 0, jw = e.w * (0.7 + 0.3 * pu) / 2, jh = e.h * 0.55; ctx.fillStyle = 'rgba(255,90,200,.8)'; ctx.beginPath(); ctx.ellipse(cx, e.y + jh, jw, jh, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#ffd0f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, e.y + jh, jw, jh, 0, Math.PI, 0); ctx.stroke(); line(cx - jw * 0.5, e.y + jh, cx - jw * 0.3, e.y + 3, 'rgba(255,255,255,.5)'); line(cx + jw * 0.4, e.y + jh, cx + jw * 0.2, e.y + 3, 'rgba(255,255,255,.5)');
      ctx.strokeStyle = '#ff6ac8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, e.y + jh); for (var z = 1; z <= 5; z++) ctx.lineTo(cx + Math.sin(f * 0.15 + z) * 3, e.y + jh + z * 3.6); ctx.stroke(); circ(cx, e.y + jh + 18, 1.6, '#fff'); break; }
    case E.CLAM: { var op = e.s === 1, gape = op ? 6 : 0; poly([e.x, by, e.x + e.w, by, e.x + e.w - 2, by - 5, e.x + 2, by - 5], '#8a5ae0', '#2a1070'); ctx.save(); ctx.translate(e.x + 2, by - 5); ctx.rotate(op ? -0.7 : 0); poly([0, 0, e.w - 4, 0, e.w - 6, -6, 2, -6], '#a88aff', '#2a1070'); ctx.restore(); if (op) { circ(cx, by - 6, 3, '#fff'); circ(cx - 0.8, by - 6.8, 1, '#bff'); } else rect(e.x + 3, by - 6, e.w - 6, 1.2, '#ff3a8a'); break; }
    case E.SWOOP: { var sw = e.s === 1 ? 0 : Math.sin(f * 0.35) * 4; poly([cx - 3, cy, cx - 12, cy - 5 - sw, cx - 7, cy + 2], '#e8fbff', '#2a7aa0'); poly([cx + 3, cy, cx + 12, cy - 5 - sw, cx + 7, cy + 2], '#e8fbff', '#2a7aa0'); poly([cx - 5, cy - 4, cx + 5, cy - 4, cx, cy + 6], '#4ac8ff', '#0a4a70'); circ(cx, cy - 1.5, 2.4, '#fff'); circ(cx + (e.dir || 1) * 0.6, cy - 1.3, 1.1, '#021a2a'); if (e.s === 1) line(cx, cy - 4, cx - (e.dir || 1) * 6, cy - 14, 'rgba(255,255,255,.5)', 1.5); break; }
    case E.FLOCK: { var fw = Math.sin(f * 0.4 + e.idx) * 2.5; poly([cx, cy + 2, cx - 6, cy - 3 - fw, cx - 4, cy + 1], '#b8ff6a', '#4a7a08'); poly([cx, cy + 2, cx + 6, cy - 3 - fw, cx + 4, cy + 1], '#b8ff6a', '#4a7a08'); circ(cx, cy + 1, 2.2, '#7aff3a'); circ(cx + dir * 0.6, cy + 0.8, 0.9, '#10300a'); break; }
    case E.BALLOON: { for (var b1 = 0; b1 < 8; b1++) { var ba = b1 * Math.PI / 4 + f * 0.02; poly([cx + Math.cos(ba - 0.2) * 8, cy - 2 + Math.sin(ba - 0.2) * 8, cx + Math.cos(ba) * 12.5, cy - 2 + Math.sin(ba) * 12.5, cx + Math.cos(ba + 0.2) * 8, cy - 2 + Math.sin(ba + 0.2) * 8], '#ff3a8a'); } ell(cx, cy - 2, 8, 9, '#ffb0e0'); ell(cx - 2.5, cy - 5, 2.2, 3, 'rgba(255,255,255,.6)'); poly([cx - 2, cy + 7, cx + 2, cy + 7, cx, cy + 10], '#c02a80'); line(cx, cy + 10, cx + Math.sin(f * 0.1) * 2, cy + 17, '#ffd0e4', 1); break; }
    case E.SHOOTER: { var ds = e.dir || 1; hex(cx, cy, 8.5, '#2a2450', Math.PI / 6); hex(cx, cy, 6.6, '#4a3f86', Math.PI / 6); poly([cx + ds * 11, cy, cx + ds * 3, cy - 4, cx + ds * 3, cy + 4], '#ff8a3a'); circ(cx - ds * 1, cy, 2.2, ((f + e.pho) % 130 > 105) ? '#fff' : '#ff8a3a'); poly([cx - 7, cy + 7, cx + 7, cy + 7, cx, cy + 12 + Math.sin(f * 0.3) * 2], 'rgba(122,255,224,.6)'); break; }
    case E.BIRD: { var bw2 = Math.sin(f * 0.3) * 3.5; line(cx, cy + 4, cx, cy + 11, 'rgba(255,255,255,.6)', 1); diamond(cx, cy + 14, 3.5, 4.5, '#2ee6d6', '#0a6a70'); poly([cx - 2, cy, cx - 12, cy - 5 - bw2, cx - 7, cy + 3], '#ffd8b8', '#a04a1a'); poly([cx + 2, cy, cx + 12, cy - 5 - bw2, cx + 7, cy + 3], '#ffd8b8', '#a04a1a'); ell(cx, cy, 6, 4.5, '#ff9a5a'); poly([cx + dir * 5, cy - 1, cx + dir * 9, cy + 0.5, cx + dir * 5, cy + 2], '#ffe08a'); circ(cx + dir * 2, cy - 1.5, 1.6, '#fff'); circ(cx + dir * 2.4, cy - 1.5, 0.8, '#200'); break; }
    case E.SPARK: { ctx.globalAlpha = 0.5; var sx0 = e.x0, sy0 = e.y0; line(e.x0, e.y0, e.x1, e.y1, '#8a7aff', 1); ctx.globalAlpha = 1; circ(cx, cy, 6, 'rgba(120,255,240,.25)'); circ(cx, cy, 3.6, '#e8fffa'); ctx.strokeStyle = '#7affe8'; ctx.lineWidth = 1.2; for (var k3 = 0; k3 < 4; k3++) { var ak = k3 * Math.PI / 2 + f * 0.25; ctx.beginPath(); ctx.moveTo(cx + Math.cos(ak) * 3, cy + Math.sin(ak) * 3); ctx.lineTo(cx + Math.cos(ak + 0.4) * 6, cy + Math.sin(ak + 0.4) * 6); ctx.lineTo(cx + Math.cos(ak - 0.1) * 9, cy + Math.sin(ak - 0.1) * 9); ctx.stroke(); } break; }
    case E.BOSS: {
      var fl2 = e.inv > 0 && (Math.floor(e.inv / 4) % 2); ctx.globalAlpha = fl2 ? 0.4 : 1; var v = e.v, ed = e.dir || 1;
      if (v === 0) { var ox = e.x, oy = e.y; poly([ox + 8, oy, ox + 20, oy, ox + 28, oy + 8, ox + 28, oy + 20, ox + 22, oy + 26, ox + 6, oy + 26, ox, oy + 20, ox, oy + 8], '#d8304a', '#4a0a1a'); poly([ox + 8, oy, ox + 20, oy, ox + 14, oy + 11], '#ff7a8a'); poly([ox, oy + 8, ox + 8, oy, ox + 14, oy + 11, ox, oy + 20], '#a01a34'); for (var sp = 0; sp < 3; sp++) poly([ox + 5 + sp * 8, oy, ox + 9 + sp * 8, oy - 8, ox + 13 + sp * 8, oy], '#ffe08a'); }
      else if (v === 3) { var tx = e.x, ty = e.y; poly([cx - 18, cy, cx - 6, cy - 12, cx + 6, cy - 12, cx + 18, cy, cx + 6, cy + 9, cx - 6, cy + 9], '#1a9aa8', '#04343c'); poly([cx - 18, cy, cx - 6, cy - 12, cx, cy], '#6af0e8'); poly([cx - 16, cy, cx - 26, cy + 8 + Math.sin(f * 0.2) * 3, cx - 12, cy + 6], '#0e6a78'); poly([cx + 16, cy, cx + 26, cy + 8 + Math.sin(f * 0.2) * 3, cx + 12, cy + 6], '#0e6a78'); line(cx, cy + 9, cx - (e.dir || 1) * 10, cy + 18 + Math.sin(f * 0.2) * 2, '#1a9aa8', 2); if (e.s === 1) { ctx.globalAlpha = 0.4; poly([cx - (e.dir || 1) * 20, cy - 6, cx - (e.dir || 1) * 34, cy, cx - (e.dir || 1) * 20, cy + 6], '#fff'); ctx.globalAlpha = 1; } }
      else if (v === 4) { var wf = Math.sin(f * 0.25) * 6 * (e.s === 1 ? 0.2 : 1); poly([cx - 3, cy, cx - 22, cy - 8 - wf, cx - 14, cy + 2], '#c8a8ff', '#3a1a80'); poly([cx + 3, cy, cx + 22, cy - 8 - wf, cx + 14, cy + 2], '#c8a8ff', '#3a1a80'); poly([cx - 9, cy - 8, cx + 9, cy - 8, cx + 5, cy + 9, cx - 5, cy + 9], '#6a3ae0', '#220a60'); poly([cx - 9, cy - 8, cx, cy - 8, cx - 2, cy + 2], '#a07aff'); poly([cx + (e.dir || 1) * 8, cy - 1, cx + (e.dir || 1) * 15, cy + 2, cx + (e.dir || 1) * 8, cy + 4], '#ffe08a'); }
      else if (v === 1) { var vy = cy; ctx.save(); ctx.translate(cx, vy); ctx.rotate(f * 0.03); for (var o = 0; o < 4; o++) { ctx.rotate(Math.PI / 2); diamond(0, -20, 3.5, 6, '#ff9ad8'); } ctx.restore(); diamond(cx, vy, 16, 15, '#8a3ae8', '#2a0a60'); poly([cx, vy - 15, cx + 16, vy, cx, vy], '#b88aff'); }
      else { var rx2 = e.x, ry = e.y; poly([rx2 + 4, ry + 2, rx2 + e.w - 2, ry + 2, rx2 + e.w + 1, ry + e.h, rx2 - 1, ry + e.h], '#ff8a1a', '#5a2a04'); poly([rx2 + 4, ry + 2, rx2 + e.w - 2, ry + 2, rx2 + 12, ry + 12], '#ffc46a'); poly([rx2 + 6, ry + 3, rx2 + 10, ry - 9, rx2 + 14, ry + 3], '#f4f0ff'); poly([rx2 + e.w - 14, ry + 3, rx2 + e.w - 10, ry - 9, rx2 + e.w - 6, ry + 3], '#f4f0ff'); if (e.s === 0) circ(cx, ry - 12, 3, '#ff4a2a'); if (e.s === 2) spark4(cx, ry - 10, 5, '#ffe08a'); }
      ell(cx, cy - 2, 7, 5.5, '#fff'); circ(cx + ed * 2, cy - 1.5, 3, '#1a0a30'); circ(cx + ed * 3, cy - 2.8, 1, '#fff'); line(cx - 9, cy - 9, cx + 9, cy - 6.5, 'rgba(20,0,30,.8)', 2);
      ctx.globalAlpha = 1; for (var hp = 0; hp < 3; hp++) diamond(cx - 8 + hp * 8, e.y - 15, 3.4, 4.4, hp < e.hp ? '#ff4a7a' : '#4a4060'); break; }
  }
}
function crystalBox(cx, cy, r, col) { poly([cx - r, cy - r * 0.5, cx, cy - r, cx + r, cy - r * 0.5, cx + r, cy + r * 0.6, cx, cy + r, cx - r, cy + r * 0.6], col, '#5a3a10'); poly([cx - r, cy - r * 0.5, cx, cy - r, cx, cy, cx - r * 0.0, cy], 'rgba(255,255,255,.5)'); line(cx, cy, cx, cy + r, 'rgba(90,58,16,.6)'); line(cx, cy, cx + r, cy - r * 0.5, 'rgba(90,58,16,.6)'); }
function drawItem(e) {
  var cx = e.x + 6, cy = e.y + 6 + Math.sin(F * 0.15) * 0.7;
  if (e.k === 0) { circ(cx, cy, 6.5, '#1aa860'); circ(cx, cy, 5.2, '#4aff9a'); circ(cx - 1.6, cy - 1.8, 1.8, '#d8ffe8'); ctx.strokeStyle = '#0a5a30'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy, 6.5, 2.4, 0.4, 0, 6.2832); ctx.stroke(); }
  else if (e.k === 1) { poly([cx - 6, cy + 6, cx - 5, cy - 2, cx - 2.5, cy + 0.5, cx, cy - 8, cx + 2.5, cy + 0.5, cx + 5, cy - 3, cx + 6, cy + 6], '#ff7a1a', '#7a2a04'); poly([cx - 3, cy + 6, cx, cy - 1, cx + 3, cy + 6], '#ffe08a'); }
  else if (e.k === 2) { poly([cx - 6, cy + 5, cx - 1, cy - 7, cx + 6, cy - 5, cx + 1, cy + 7], '#d8ff6a', '#4a7a08'); line(cx - 3, cy + 4, cx + 3, cy - 4, '#4a7a08'); }
  else if (e.k === 3) spark8(cx, cy, 7, 'hsl(' + (F * 12 % 360) + ',95%,62%)', F * 0.08);
  else { ctx.fillStyle = '#7a4ae0'; ctx.beginPath(); ctx.arc(cx, cy + 3, 7, Math.PI, 0); ctx.fill(); line(cx + 4, cy - 1, cx + 8, cy - 6, '#d8c8ff', 1.5); circ(cx + 8, cy - 6, 1.4, '#2ee6d6'); rect(cx - 6, cy + 3, 12, 2, '#4a2a9a'); }
}
function drawCoin(c, i) {
  if (c.b) { hex(c.x, c.y, 4.2, '#ff7a3a', 0.5); hex(c.x, c.y, 2.4, '#ffd0a0', 0.5); return; }
  var w = Math.abs(Math.cos(F * 0.09 + i * 0.7)) * 4.5 + 1; poly([c.x, c.y - 6.5, c.x + w, c.y, c.x, c.y + 6.5, c.x - w, c.y], '#2ee6d6', '#0a6a70'); poly([c.x, c.y - 6.5, c.x - w, c.y, c.x, c.y], '#b8fff6'); line(c.x, c.y - 6, c.x, c.y + 6, 'rgba(10,106,112,.6)');
}
function drawSpecial(q, got) { if (got) ctx.globalAlpha = 0.25; var w = 7.5 + Math.sin(F * 0.08 + q.x) * 1.2; ctx.strokeStyle = '#ff6ad5'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x, q.y, w, 0, 6.2832); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, w - 2, 0, 6.2832); ctx.stroke(); ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(F * 0.04); poly([0, -4, 3.5, 2.5, -3.5, 2.5], '#fff'); ctx.restore(); ctx.globalAlpha = 1; }
function drawMover(m, pos, st, i) {
  var k = m.kind | 0, w = m.w, x = pos.x, y = pos.y;
  if (k === 3) { var s = st.mo[i].s; ctx.globalAlpha = s === 3 ? 0.15 : 1; var sh = s === 1 ? Math.sin(F * 1.2) : 0; poly([x + sh, y, x + w + sh, y, x + w - 4 + sh, y + 7, x + 4 + sh, y + 7], '#ff9a6a'); rect(x + 2 + sh, y, w - 4, 2, '#ffd0b0'); line(x + 10 + sh, y + 1, x + 13 + sh, y + 6, '#6a2a14'); line(x + w - 12 + sh, y + 1, x + w - 14 + sh, y + 6, '#6a2a14'); ctx.globalAlpha = 1; return; }
  if (k === 2) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(m.cx, m.y, m.amp, 0, 6.2832); ctx.stroke(); }
  if (k === 4) { var on = PF.movOn(st, i, st.f), nxt = PF.movOn(st, i, st.f + 40); if (!on) { ctx.globalAlpha = 0.12; } else if (!nxt) { ctx.globalAlpha = (Math.floor(st.f / 4) % 2) ? 0.35 : 1; } ell(x + w / 2, y + 3, w / 2, 4, '#e8f4ff'); ell(x + w / 2, y + 2, w / 2 - 3, 2.4, '#fff'); for (var cl = 0; cl < 3; cl++) line(x + 6 + cl * 8, y + 5, x + 10 + cl * 8, y + 5, 'rgba(120,150,220,.6)', 1); ctx.globalAlpha = 1; return; }
  var col = k === 1 ? '#6ac8ff' : k === 2 ? '#ff8ad8' : '#9a8aff'; poly([x, y, x + w, y, x + w - 4, y + 7, x + 4, y + 7], col); rect(x + 2, y, w - 4, 2, 'rgba(255,255,255,.55)'); diamond(x + w / 2, y + 4, 3, 2.5, 'rgba(20,10,60,.5)');
}
function drawGoal(L, st, locked) {   // beacon gate: two tapered obelisks and an energy beam
  var gx = L.goalX, base = L.poleY, top = base - 9 * TS, tx = gx + 14, col = locked ? '#7a3a4a' : '#7a6ae0';
  poly([gx - 3, base, gx + 6, base, gx + 4.5, top + 8, gx + 1.5, top], col); poly([tx - 3, base, tx + 6, base, tx + 4.5, top + 8, tx + 1.5, top], col);
  diamond(gx + 3, top - 4, 3.5, 6, locked ? '#d04a4a' : '#2ee6d6'); diamond(tx + 3, top - 4, 3.5, 6, locked ? '#d04a4a' : '#2ee6d6');
  if (locked) { for (var k = 0; k < 3; k++) { ctx.globalAlpha = 0.5; line(gx + 6, base - 20 - k * 22, tx - 2, base - 20 - k * 22, '#ff4a6a', 2); } ctx.globalAlpha = 1; return; }
  var ty = base - 18 - (0.5 + 0.5 * Math.sin(st.f * 0.045)) * 90; ctx.globalAlpha = 0.35; rect(gx + 6, ty - 4, tx - gx - 8, 8, '#7affe0'); ctx.globalAlpha = 1; rect(gx + 6, ty - 1, tx - gx - 8, 2, '#e8fffa');
}
function drawLevel(st, th) {
  var L = st.L, cam = G.cam, c0 = Math.max(0, Math.floor(cam / TS)), c1 = Math.min(L.w - 1, Math.floor((cam + VW) / TS) + 1), c, r, i;
  ctx.save(); ctx.translate(-Math.round(cam), 0);
  for (c = c0; c <= c1; c++) for (r = 0; r < ROWS; r++) {
    var t = PF.tileAt(st, c, r), raw = st.mod.size ? (st.mod.get(c * ROWS + r) !== undefined ? st.mod.get(c * ROWS + r) : L.tiles[c * ROWS + r]) : L.tiles[c * ROWS + r];
    if (!t && raw === T.BRICK) t = T.BRICK;
    if (!t && (raw === T.GATE || raw === T.BRIDGE || raw === T.WLEVEL)) { ctx.globalAlpha = 0.28; ctx.strokeStyle = raw === T.WLEVEL ? '#7ad0ff' : '#c8b8ff'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.strokeRect(c * TS + 1.5, r * TS + 1.5, TS - 3, TS - 3); ctx.setLineDash([]); ctx.globalAlpha = 1; continue; }
    if (!t || PF.isW(t)) continue; var bd = 0;
    for (i = 0; i < G.bumps.length; i++) if (G.bumps[i].c === c && G.bumps[i].r === r) bd = -Math.sin(G.bumps[i].t / 10 * Math.PI) * 5;
    drawTile(t, c * TS, r * TS, th, r > 0 ? PF.tileAt(st, c, r - 1) : 0, bd, c, r, st);
    if (t === T.SOLID && r > 0 && PF.isW(PF.tileAt(st, c, r - 1))) drawSeabed(c, r);
  }
  if (L.keys) for (i = 0; i < L.keys.length; i++) if (!st.kg[i]) drawKey(L.keys[i].x, L.keys[i].y, L.keys[i].c, false);
  if (L.winds) for (i = 0; i < L.winds.length; i++) drawWind(L.winds[i]);
  if (L.pockets) for (i = 0; i < L.pockets.length; i++) if (!st.pk[i]) drawPocket(L.pockets[i]);
  drawGoal(L, st, st.boss > 0);
  for (i = 0; i < L.movers.length; i++) drawMover(L.movers[i], PF.movPos(st, i, st.f), st, i);
  for (i = 0; i < L.coins.length; i++) if (!st.cg[i] && L.coins[i].x > cam - 10 && L.coins[i].x < cam + VW + 10) drawCoin(L.coins[i], i);
  if (L.special) for (i = 0; i < L.special.length; i++) drawSpecial(L.special[i], st.sg[i]);
  for (i = 0; i < st.it.length; i++) if (st.it[i].alive) drawItem(st.it[i]);
  for (i = 0; i < st.en.length; i++) { var e = st.en[i]; if (e.x > cam - 40 && e.x < cam + VW + 40) drawEnemy(e); }
  for (i = 0; i < st.ep.length; i++) { diamond(st.ep[i].x, st.ep[i].y, 4, 5.5, '#ff4ad8'); circ(st.ep[i].x, st.ep[i].y, 1.5, '#fff'); }
  for (i = 0; i < st.fb.length; i++) { circ(st.fb[i].x, st.fb[i].y, 3.6, '#ff5a1a'); circ(st.fb[i].x, st.fb[i].y, 1.8, '#ffe8a0'); }
  if (L.cp) { var kx = L.cp.x + 6, ky = L.cp.y + 14; poly([kx - 2, ky, kx + 3, ky, kx + 2, ky - 14, kx - 1, ky - 14], '#6a5ab0'); diamond(kx + 0.5, ky - 19, 4, 6, st.cp ? '#3affb0' : '#7a6ab0'); }
  if (G.hint) {
    var h = G.hint, k; for (k = 0; k < h.traj.length; k++) circ(h.traj[k].x, h.traj[k].y - 2, 1.3, 'rgba(255,240,90,.9)');
    if (h.land) { var pr = 4 + Math.sin(F * 0.2) * 1.5; ctx.strokeStyle = '#3aff7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.land.x, h.land.y, 6 + pr, 0, 6.3); ctx.stroke(); poly([h.land.x - 4, h.land.y - 16 - pr, h.land.x + 4, h.land.y - 16 - pr, h.land.x, h.land.y - 9 - pr], '#3aff7a'); }
    if (h.way) { var wy = h.way.y - 18 - Math.abs(Math.sin(F * 0.15)) * 4; poly([h.way.x - 6, wy - 8, h.way.x + 6, wy - 8, h.way.x, wy + 2], '#ffe08a', '#6a4a00'); }
    if (h.haz) { var hz = h.haz; ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hz.x, hz.y, 11 + Math.sin(F * 0.25) * 1.5, 0, 6.3); ctx.stroke(); }
  }
  var p = st.p;
  if (G.mode === 'dying') drawHero({ x: p.x, y: G.dy, w: p.w, h: p.h, big: false, pw: 0, face: p.face, ground: false, anim: 0, vx: 0, inv: 0, star: 0, spin: 0 }, true, G.dieT * 0.25, false);
  else drawHero(p, false, 0, !!p.mount);
  for (c = c0; c <= c1; c++) for (r = 0; r < ROWS; r++) { var wt = PF.tileAt(st, c, r); if (wt === T.SPIKE && (PF.isW(PF.tileAt(st, c - 1, r)) || PF.isW(PF.tileAt(st, c + 1, r)) || PF.isW(PF.tileAt(st, c, r - 1)))) wt = T.WATER; if (PF.isW(wt)) drawWaterOverlay(c * TS, r * TS, r > 0 ? PF.tileAt(st, c, r - 1) : 0, wt, c, r); }
  for (i = 0; i < G.parts.length; i++) { var q = G.parts[i]; rect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s, q.col); }
  for (i = 0; i < G.pops.length; i++) { var pp = G.pops[i]; text(pp.t, pp.x, pp.y, 8, pp.c, 'center'); }
  ctx.restore();
}
function panel(x, y, w, h) { ctx.fillStyle = 'rgba(10,8,34,.88)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#2ee6d6'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); poly([x, y, x + 8, y, x, y + 8], '#2ee6d6'); poly([x + w, y + h, x + w - 8, y + h, x + w, y + h - 8], '#2ee6d6'); }
function pad6(n) { var s = String(Math.max(0, n | 0)); while (s.length < 6) s = '0' + s; return s; }
function levelLabel(G) { var n = G.n; if (n >= 1000) return TT('별길', 'STAR ROAD'); var w = Math.floor((n - 1) / 5) + 1, i = (n - 1) % 5 + 1; return w + '·' + i; }
function heroIcon(x, y, s) { poly([x, y - 5 * s, x + 5 * s, y, x, y + 5 * s, x - 5 * s, y], '#ff8a3d'); poly([x, y - 5 * s, x - 5 * s, y, x, y], '#ffc08a'); circ(x, y, 2 * s, '#fff'); circ(x + 0.6 * s, y, 1 * s, '#2a1456'); }
function drawHUD(st) {
  // slim translucent plate on the left (score, gems), level pill in the centre, hero icons on the right; the clock is a bar along the top edge
  rrect(3, 3, 112, 14, 7, 'rgba(10,8,34,.62)'); diamond(12, 10, 4, 5, '#2ee6d6'); text(pad6(G.base + st.score), 20, 10.5, 8.5, '#fff'); diamond(77, 10, 3, 4.5, '#2ee6d6'); text('×' + (G.coinBase + st.coins), 83, 10.5, 8.5, '#bff');
  var lab = levelLabel(G); rrect(VW / 2 - 28, 3, 56, 14, 7, 'rgba(10,8,34,.62)'); text(lab, VW / 2, 10.5, 9, '#ffd0a0', 'center');
  var secs = Math.max(0, Math.ceil(st.t / 60)), frac = Math.max(0, Math.min(1, st.t / (st.L.time * 60))); rect(0, 0, VW, 2, 'rgba(0,0,0,.4)'); rect(0, 0, VW * frac, 2, secs < 20 ? '#ff4a6a' : '#2ee6d6'); text(String(secs), VW / 2 + 38, 10.5, 8, secs < 20 ? '#ff8a9a' : '#cfe');
  rrect(VW - 92, 3, 89, 14, 7, 'rgba(10,8,34,.62)'); for (var i = 0; i < Math.min(G.lives, 5); i++) heroIcon(VW - 80 + i * 11, 10, 0.9); if (G.lives > 5) text('+' + (G.lives - 5), VW - 8, 10.5, 7, '#fff', 'right');
  for (i = 0; i < 5; i++) { ctx.strokeStyle = i < st.sc ? '#ff6ad5' : 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(125 + i * 9, 10, 3.2, 0, 6.2832); ctx.stroke(); }
  text(TT('최고 ', 'BEST ') + pad6(Math.max(G.best, G.base + st.score)), VW - 5, 25, 7, '#ffd0a0', 'right');
  if (st.p.air < PF.AIRMAX - 5) { var af = st.p.air / PF.AIRMAX; rrect(4, 20, 72, 9, 4, 'rgba(10,8,34,.62)'); for (var ab = 0; ab < 6; ab++) { ctx.strokeStyle = af >= (ab + 1) / 6 - 0.001 ? '#bffcff' : 'rgba(255,255,255,.2)'; ctx.fillStyle = af < 0.25 && Math.floor(F / 8) % 2 ? 'rgba(255,80,100,.5)' : 'rgba(255,255,255,0)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(11 + ab * 11, 24.5, 3.2, 0, 6.2832); ctx.fill(); ctx.stroke(); } }
  for (var kc = 0; kc < 3; kc++) if ((st.kb >> kc) & 1) { drawKey(86 + kc * 14, 31, kc, false); }
  var pm = st.p.pm / PF.P.PMAX; if (pm > 0.04) { for (var k = 0; k < 6; k++) { var on = pm >= (k + 1) / 6 - 0.001; poly([6 + k * 8, VH - 10, 12 + k * 8, VH - 13, 12 + k * 8, VH - 7], on ? (pm >= 0.999 ? '#ff8a3d' : '#2ee6d6') : 'rgba(255,255,255,.2)'); } if (pm >= 0.999) text('P', 56, VH - 10, 8, '#ff8a3d'); }
  if (st.p.star > 0) text('◆ ' + Math.ceil(st.p.star / 60), 6, VH - 24, 8, '#ffe08a');
  if (st.sw > 0) text(TT('스위치 ', 'SWITCH ') + Math.ceil(st.sw / 60), 6, VH - 34, 8, '#9ac8ff');
  if (G.auto) { var w = 150; rrect(VW / 2 - w / 2, 20, w, 14, 4, 'rgba(255,138,61,.95)'); text(G.useRL && !G.usingFallback ? TT('자동 플레이 · RL (F3 끄기)', 'AUTO PLAY \u00b7 RL (F3 to stop)') : TT('자동 플레이 (F3 끄기)', 'AUTO PLAY (F3 to stop)'), VW / 2, 27, 8, '#2a1000', 'center', false); }
  if (G.msgT > 0 && G.msg) { var tw = Math.min(VW - 16, 8 + G.msg.length * (KO ? 7.4 : 4.9)); rrect(VW / 2 - tw / 2, VH - 22, tw, 15, 4, 'rgba(10,8,34,.78)'); text(G.msg, VW / 2, VH - 14.5, 8, '#fff', 'center', false); }
  if (st.boss > 0 && st.L.arena && st.p.x > st.L.arena.c0 * TS - 100) text(TT('보스를 쓰러뜨려야 관문이 열려요!', 'Defeat the boss to open the gate!'), VW / 2, 42, 8, '#ff8aa8', 'center');
}
function overlay(title, lines) {
  panel(44, 36, VW - 88, 138); text(title, VW / 2, 58, 18, '#ff8a3d', 'center');
  for (var i = 0; i < lines.length; i++) text(lines[i], VW / 2, 84 + i * 14, 8.5, i === lines.length - 1 ? '#7affe0' : '#fff', 'center');
}
// ---------------------------------------------------------------- overworld map: low-poly islands, glowing route, hex / diamond nodes
var NODE_COL = { maze: '#ffb04a', plain: '#7a6ae0', hills: '#4ac8a0', flood: '#38b8f0', ghost: '#a07aff', sky: '#ff9ac0', cave: '#d09050', castle: '#ff4a6a', bonus: '#ffe08a' };
function drawMap() {
  var wm = G.map, pal = [['#14103a', '#3a2a7a'], ['#0a2a3a', '#1a6a7a'], ['#2a1030', '#7a2a6a'], ['#102a20', '#2a7a5a']][wm.w % 4];
  var g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  var r = PF.rng(wm.w * 31 + 7), i; for (i = 0; i < 40; i++) spark4(r() * VW, r() * VH, 0.8 + r() * 1.6, 'rgba(255,255,255,.35)');
  for (i = 0; i < 9; i++) { var ix = 20 + r() * 360, iy = 40 + r() * 150, rr = 14 + r() * 30; hex(ix, iy, rr, 'rgba(255,255,255,.07)', r() * 1.5); hex(ix, iy, rr * 0.7, 'rgba(255,255,255,.07)', r() * 1.5); }
  var nodes = wm.nodes, fn = G.fn; ctx.lineCap = 'round';
  function nd2(id) { for (var q = 0; q < nodes.length; q++) if (nodes[q].i === id) return nodes[q]; return null; }
  wm.edges.forEach(function (e) { var A = nd2(e.a), B = nd2(e.b); if (!fn.isVisible(A) || !fn.isVisible(B)) return; var ok = fn.edgeOpen(e); if (e.secret) { ctx.setLineDash([1, 4]); line(A.x, A.y, B.x, B.y, ok ? '#ffe08a' : 'rgba(255,255,255,.0)', 2.5); } else { ctx.setLineDash([2, 5]); line(A.x, A.y, B.x, B.y, fn.isDone(e.a) ? '#7affe0' : 'rgba(255,255,255,.35)', 3); } ctx.setLineDash([]); });
  var all = nodes.filter(fn.isVisible);
  for (i = 0; i < all.length; i++) { var nd = all[i], done = fn.isDone(nd.i), open = fn.isOpen(nd), sel = G.sel === nd.i;
    var col = open ? NODE_COL[nd.kind] : '#5a5a7a';
    if (nd.kind === 'castle') { poly([nd.x - 9, nd.y + 8, nd.x - 9, nd.y - 3, nd.x - 4, nd.y - 9, nd.x, nd.y - 3, nd.x + 4, nd.y - 9, nd.x + 9, nd.y - 3, nd.x + 9, nd.y + 8], col, '#1a0a20'); }
    else if (nd.kind === 'bonus') spark8(nd.x, nd.y, 9, col, F * 0.03);
    else { hex(nd.x, nd.y, 9, '#10082a', Math.PI / 6); hex(nd.x, nd.y, 7.3, col, Math.PI / 6); }
    if (done) { diamond(nd.x + 8, nd.y - 8, 4, 5, '#fff'); ctx.strokeStyle = '#18a070'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(nd.x + 6, nd.y - 8); ctx.lineTo(nd.x + 7.8, nd.y - 6); ctx.lineTo(nd.x + 10.5, nd.y - 10); ctx.stroke(); }
    if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(nd.x, nd.y, 13 + Math.sin(F * 0.2) * 1.5, 0, 6.3); ctx.stroke(); }
    text(nd.kind === 'bonus' ? '★' : String(nd.i + 1), nd.x, nd.y + 0.5, 8, '#fff', 'center'); }
  var cur = all.filter(function (n) { return n.i === G.sel; })[0] || nodes[0];
  drawHero({ x: cur.x - 6, y: cur.y - 30 + Math.sin(F * 0.1) * 2, w: 12, h: 14, pw: 0, big: false, face: 1, ground: false, anim: 0, vx: 0, inv: 0, star: 0, spin: 0 }, false, 0, false);
  rrect(3, 3, 90, 14, 7, 'rgba(10,8,34,.62)'); text(TT('월드 ', 'WORLD ') + (wm.w + 1), 10, 10.5, 9, '#ffd0a0');
  rrect(100, 3, 110, 14, 7, 'rgba(10,8,34,.62)'); diamond(110, 10, 4, 5, '#2ee6d6'); text(pad6(G.base), 118, 10.5, 8.5, '#fff');
  rrect(VW - 76, 3, 73, 14, 7, 'rgba(10,8,34,.62)'); for (i = 0; i < Math.min(G.lives, 5); i++) heroIcon(VW - 66 + i * 11, 10, 0.9);
  var sn = all.filter(function (n) { return n.i === G.sel; })[0]; if (sn) { var kn = PF.KIND_NAMES[sn.kind]; rrect(70, VH - 26, 260, 18, 9, 'rgba(10,8,34,.72)'); text((sn.i === 5 ? '★ ' : (wm.w + 1) + '·' + (sn.i + 1) + '  ') + (KO ? kn[0] : kn[1]), VW / 2, VH - 17, 9, '#fff', 'center', false); }
  if (G.auto) { var w2 = 128; rrect(VW / 2 - w2 / 2, 20, w2, 14, 4, 'rgba(255,138,61,.95)'); text(TT('자동 플레이 (F3 끄기)', 'AUTO PLAY (F3 to stop)'), VW / 2, 27, 8, '#2a1000', 'center', false); }
  if (G.msgT > 0 && G.msg) { var tw = Math.min(VW - 16, 8 + G.msg.length * (KO ? 7.4 : 4.9)); rrect(VW / 2 - tw / 2, 40, tw, 15, 4, 'rgba(10,8,34,.78)'); text(G.msg, VW / 2, 47.5, 8, '#fff', 'center', false); }
  text(TT('← → ↑ ↓ 선택   점프/Enter 시작', 'Arrows select   Jump/Enter start'), VW / 2, VH - 38, 7.5, '#cfe', 'center');
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
  else if (G.mode === 'clear') { text(TT('레벨 클리어!', 'LEVEL CLEAR!'), VW / 2, 66, 20, '#ff8a3d', 'center'); text('+' + G.bonus + (st.tape ? TT('  (빔 보너스!)', '  (beam bonus!)') : ''), VW / 2, 90, 11, '#7affe0', 'center'); if (G.secretExit) text(TT('비밀 출구 발견!', 'Secret exit found!'), VW / 2, 110, 11, '#ff9ae8', 'center'); }
  else if (G.mode === 'pause') text(TT('일시정지', 'PAUSED'), VW / 2, 90, 20, '#fff', 'center');
}
function startScreen(g, c2d, bs) {
  G = g; ctx = c2d; F = g.frame; ctx.setTransform(bs, 0, 0, bs, 0, 0); drawMap();
  overlay(TT('도형 월드', 'SHAPE WORLD'), [TT('다이아몬드 영웅의 모험: 월드를 돌며 관문과 요새를 정복하세요', 'A diamond hero\'s adventure: clear every gate and fortress'), TT('←→ 이동  Z/스페이스 점프  X/Shift 달리기  C 스핀점프', 'Arrows move  Z/Space jump  X/Shift run  C spin jump'), TT('↑ 덩굴/문   P-게이지가 차면 더 빠르고 높이!', 'Up: vines/doors   fill the P meter for speed and height'), TT('최고 점수: ', 'Best score: ') + g.best, TT('스페이스 또는 화면 터치로 시작', 'Press Space or tap to start')]);
}
root.PFR = { render: render, startScreen: startScreen, levelLabel: function (g) { return levelLabel(g); } };
})(window);
