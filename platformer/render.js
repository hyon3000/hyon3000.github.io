// Shape World - rendering. Canvas2D primitives only (rects, circles, arcs, polygons): no images, no sprites.
// File overview: pure drawing code. render(g) is called every frame by game.js with the shared state G
// (mode, camera, level state st) and paints one frame; nothing here changes game state.
// Layout: drawing helpers -> themes/background -> tiles -> hazards/enemies/items -> drawLevel -> HUD -> maps/menus -> render().
(function (root) {
'use strict';
// Shared constants from the simulation (tile size, view size, tile and enemy id tables).
var TS = PF.TS, VW = PF.VW, VH = PF.VH, T = PF.T, E = PF.E, ROWS = PF.ROWS;
var KO = /^ko/i.test(navigator.language || ''), TT = function (ko, en) { return KO ? ko : en; };
// ctx / G / F are set at the start of every render(): canvas context, game state, and the frame counter used by all animations.
var ctx = null, G = null, F = 0;
// ---- drawing helpers: thin wrappers over Canvas2D (fill colour first, then geometry)
function circ(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
function ell(x, y, rx, ry, c, rot) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832); ctx.fill(); }
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function poly(pts, c, stroke) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); if (c) { ctx.fillStyle = c; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
function rrect(x, y, w, h, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); }
function line(x1, y1, x2, y2, c, w) { ctx.strokeStyle = c; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function star(cx, cy, r, c, rot) { var pts = []; for (var i = 0; i < 10; i++) { var a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } poly(pts, c); }
// Pixel-font text with optional alignment and drop shadow.
function text(t, x, y, size, c, align, sh) {
  ctx.font = 'bold ' + size + 'px "Trebuchet MS", "Segoe UI", system-ui, sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  if (sh !== false) { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(t, x + 1, y + 1); } ctx.fillStyle = c || '#fff'; ctx.fillText(t, x, y);
}
// Sparkle / gem shapes built from poly().
function diamond(cx, cy, rx, ry, c, stroke) { poly([cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy], c, stroke); }
function spark4(cx, cy, r, c) { poly([cx, cy - r, cx + r * 0.28, cy - r * 0.28, cx + r, cy, cx + r * 0.28, cy + r * 0.28, cx, cy + r, cx - r * 0.28, cy + r * 0.28, cx - r, cy, cx - r * 0.28, cy - r * 0.28], c); }
function spark8(cx, cy, r, c, rot) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.fillStyle = c; ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4); ctx.rotate(Math.PI / 4); ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4); ctx.restore(); }
function hex(cx, cy, r, c, rot) { var pts = []; for (var i = 0; i < 6; i++) { var a = (rot || 0) + i * Math.PI / 3; pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } poly(pts, c); }
// ---- art direction: "crystal dusk" - flat geometric shapes, strata ground, glowing crystal blocks, low-poly mountains
// THEMES: one entry per level look (index = level theme). Fields: s1/s2 sky gradient, m1/m2 mountain layers,
// str ground strata, edge/slab ground highlight colours, mode = background style, sun, part = particle type, pitch = music pitch.
var THEMES = [
  { s1: '#2b1a5e', s2: '#ff9a7a', m1: '#4a2a86', m2: '#352070', str: ['#3b2f66', '#33295a', '#2b2250'], edge: '#7cf3d2', slab: '#8a78b8', mode: 'dusk', sun: '#ffd6a8' },
  { s1: '#5a2a7a', s2: '#ffc9a0', m1: '#8a4a9a', m2: '#6a3a8a', str: ['#6a4a86', '#5c3f78', '#4e346a'], edge: '#ffe08a', slab: '#a890c8', mode: 'sky', sun: '#fff0c8' },
  { s1: '#070a24', s2: '#1f2c6a', m1: '#1a2456', m2: '#121a42', str: ['#2a2a5a', '#242450', '#1e1e46'], edge: '#9a8aff', slab: '#5a5a9a', mode: 'night', sun: '#d8d4ff' },
  { s1: '#0a3a4a', s2: '#38c8c0', m1: '#14707a', m2: '#0e5662', str: ['#1c5a6a', '#18505e', '#144652'], edge: '#b8fff0', slab: '#5ab0b8', mode: 'lagoon', sun: '#d8fff6' },
  { s1: '#14061c', s2: '#4a1040', m1: '#2a0c34', m2: '#1c0826', str: ['#3a2a46', '#32243e', '#2a1c36'], edge: '#ff4ab0', slab: '#6a5a82', mode: 'castle', sun: '#ff6ac0' },
  { s1: '#1a1008', s2: '#5a3414', m1: '#3a2410', m2: '#2a1a0a', str: ['#4a3420', '#402c1a', '#362416'], edge: '#ffb04a', slab: '#8a6a4a', mode: 'cave', sun: '#ffb04a' }];
// ---------------------------------------------------------------- atmosphere: one palette, background style, particle effect and ambient pitch per level kind
// Builds a theme object from positional arguments (used for the themes added after the base ones).
function mkTheme(s1, s2, m1, m2, str, edge, slab, mode, sun, part, pitch) { return { s1: s1, s2: s2, m1: m1, m2: m2, str: str, edge: edge, slab: slab, mode: mode, sun: sun, part: part || 'none', pitch: pitch || 1, gr: edge, dirt: str[0], dirt2: str[2], cloud: '#fff' }; }
THEMES[0].part = 'none'; THEMES[1].part = 'sparks'; THEMES[2].part = 'fireflies'; THEMES[3].part = 'bubbles'; THEMES[4].part = 'embers'; THEMES[5].part = 'dust'; THEMES[3].pitch = 0.85; THEMES[4].pitch = 0.8; THEMES[5].pitch = 0.9; THEMES[2].pitch = 0.95; THEMES[1].pitch = 1.1;
// Extra themes (6 and up): autumn, jungle, snow, desert, swamp, storm, airship, crystal, volcano, ruins, factory, neon, tower, shaft, chase, gauntlet.
THEMES[6] = mkTheme('#ff8a4a', '#ffe0a8', '#b8582a', '#8a3a1a', ['#6a3a22', '#5a301c', '#4a2616'], '#ffb04a', '#a8754a', 'autumn', '#fff0c0', 'leaves', 1.03);
THEMES[7] = mkTheme('#123a2a', '#6ac88a', '#1a6a3a', '#0e4a28', ['#2a4a2a', '#244024', '#1c341c'], '#7affb0', '#6a8a5a', 'jungle', '#d8ffc8', 'fireflies', 0.97);
// underground looks: plain soil tunnels, magma tunnels, frozen burrows, a deep glowing cavern, crystal mines
THEMES[23] = mkTheme('#1a120c', '#3a2a1c', '#2a1c12', '#1e140c', ['#4a3426', '#3e2c20', '#32241a'], '#8a6a46', '#6a5238', 'ug', '#ffd08a', 'dust', 0.9);
THEMES[24] = mkTheme('#1a0606', '#5a1408', '#3a0e08', '#240804', ['#3a2420', '#30201c', '#281814'], '#ff7a2a', '#6a4038', 'uglava', '#ff9a4a', 'embers', 0.82);
THEMES[25] = mkTheme('#06182a', '#1a4a6a', '#1a4a6a', '#0e3454', ['#6ab8e0', '#58a4d0', '#4890c0'], '#e8fbff', '#3a78a8', 'ugice', '#c8f4ff', 'snow', 0.9);
THEMES[26] = mkTheme('#06060e', '#16162a', '#1a1a2e', '#0e0e1c', ['#2a2a3c', '#242434', '#1e1e2c'], '#7affb0', '#4a4a5e', 'ugcave', '#9affc8', 'fireflies', 0.85);
THEMES[27] = mkTheme('#0a0a1e', '#2a1050', '#2a1a5a', '#1a0e40', ['#3a2a60', '#30244e', '#281c42'], '#4af0e0', '#6a5aa0', 'ugcrystal', '#aaffff', 'sparks', 1.05);
THEMES[22] = mkTheme('#0c2a4a', '#6ad0ff', '#2a6a9a', '#1a4a7a', ['#8ad8ff', '#6ac4f4', '#4aa8e0'], '#e8fbff', '#3a8ac0', 'snow', '#c8f4ff', 'snow', 0.95);
THEMES[8] = mkTheme('#8aa8e0', '#f4fbff', '#c8d8f0', '#9ab4de', ['#c4d6f2', '#aec4e6', '#98b0d8'], '#ffffff', '#a8c0e0', 'snow', '#ffffff', 'snow', 1.22);
THEMES[9] = mkTheme('#f0a050', '#ffe4a8', '#d89a5a', '#b87a3a', ['#d8a860', '#c89850', '#b88840'], '#ffe0a0', '#b89060', 'desert', '#fff4c0', 'dust', 0.92);
THEMES[10] = mkTheme('#1c2a22', '#6a7a54', '#2a3a2a', '#1a2a1a', ['#3a3a2a', '#323224', '#2a2a1e'], '#8aff7a', '#5a5a3a', 'swamp', '#c8d8a8', 'fireflies', 0.88);
THEMES[11] = mkTheme('#1c1c3a', '#6a6a9a', '#2a2a4a', '#1a1a34', ['#3a3a58', '#323250', '#2a2a46'], '#cfe0ff', '#6a6a8a', 'storm', '#aab8ff', 'rain', 1.05);
THEMES[12] = mkTheme('#5ac0ff', '#f0fbff', '#9ad8ff', '#78c0f0', ['#8a6a4a', '#7a5c3e', '#6a4e34'], '#e8c880', '#a8885a', 'airship', '#fff8d0', 'sparks', 1.12);
THEMES[13] = mkTheme('#140a3a', '#5a2a9a', '#3a1a7a', '#2a1060', ['#3a2a6a', '#32245e', '#2a1c52'], '#ff9aff', '#7a5ab0', 'crystal', '#ffc8ff', 'sparks', 1.18);
THEMES[14] = mkTheme('#2a0808', '#ff5a1a', '#4a1408', '#2a0a04', ['#3a2a28', '#322220', '#2a1a18'], '#ff7a2a', '#6a4a40', 'volcano', '#ffb04a', 'embers', 0.78);
THEMES[15] = mkTheme('#d4c49a', '#fff0d0', '#b8a47a', '#9a8660', ['#9a8a6a', '#8a7a5c', '#7a6a50'], '#e8d8a8', '#b8a880', 'ruins', '#fff8d8', 'dust', 0.94);
THEMES[16] = mkTheme('#2a2a3a', '#6a6a7a', '#3a3a4a', '#24242e', ['#5a5a6a', '#50505e', '#46465200'.slice(0, 7)], '#ffb02a', '#7a7a8a', 'factory', '#ffd08a', 'sparks', 0.9);
THEMES[17] = mkTheme('#080824', '#4a0a6a', '#1a0a3a', '#10062a', ['#26204a', '#201a42', '#1a143a'], '#ff3aff', '#5a4a9a', 'neon', '#ff8aff', 'sparks', 1.1);
THEMES[18] = mkTheme('#3a62a8', '#d0e8ff', '#7aa0d8', '#5a82c0', ['#6a82b0', '#5c74a2', '#4e6694'], '#e8f4ff', '#8aa4cc', 'tower', '#ffffff', 'snow', 1.08);
THEMES[19] = mkTheme('#0a0a14', '#2a2a3a', '#16161e', '#101018', ['#3a3a48', '#32323e', '#2a2a34'], '#ffb04a', '#5a5a6a', 'shaft', '#ffb04a', 'embers', 0.86);
THEMES[20] = mkTheme('#3a0816', '#ff6a3a', '#5a1a1a', '#3a0c0c', ['#4a2a2a', '#402222', '#361a1a'], '#ff6a3a', '#7a4a4a', 'chase', '#ffb04a', 'embers', 1.0);
THEMES[21] = mkTheme('#14224a', '#4a6aaa', '#2a3a7a', '#1c2a5a', ['#2a3a6a', '#243260', '#1e2a54'], '#ffe08a', '#5a6aaa', 'gauntlet', '#ffe08a', 'sparks', 1.15);
// Bright green / teal looks (28..33): lush meadow, bamboo forest, teal reef, mint sky, jade temple, aurora.
THEMES[28] = mkTheme('#2e9cf0', '#d6fbe0', '#58c46a', '#3aa656', ['#7a5a36', '#6a4c2e', '#5a4026'], '#6ee05a', '#9ad88a', 'hillsg', '#fff6b0', 'none', 1.08);
THEMES[29] = mkTheme('#3cc89a', '#f0ffd0', '#2a9a5a', '#1c7a46', ['#4a8a4a', '#3e7a40', '#326a36'], '#b8ff7a', '#7ac88a', 'bamboo', '#ffffd0', 'leaves', 1.04);
THEMES[30] = mkTheme('#14b8d0', '#c4fff0', '#1ea0b0', '#168a9a', ['#2a8a8e', '#247a80', '#1c6a70'], '#9afff0', '#6ad0d0', 'reef', '#f0ffff', 'bubbles', 0.98);
THEMES[31] = mkTheme('#5ce0d0', '#f4fff4', '#8ae8c0', '#62d0a8', ['#3aa88a', '#309878', '#288868'], '#c8ffe0', '#9af0d0', 'mintsky', '#ffffff', 'sparks', 1.14);
THEMES[32] = mkTheme('#1c9a78', '#b8f4c0', '#2a8a62', '#1c6e4e', ['#3a8a6a', '#307a5c', '#286c50'], '#ffe07a', '#6ac8a0', 'jade', '#fff0a0', 'fireflies', 0.96);
THEMES[33] = mkTheme('#06304e', '#28e0c0', '#0e5a6a', '#0a4458', ['#1a6a7a', '#165c6c', '#12505e'], '#7affd8', '#4ab0c0', 'aurora', '#d8fff4', 'sparks', 1.1);
// brighter skies for the older dull looks
THEMES[0].s1 = '#3b5cc8'; THEMES[0].s2 = '#ffb890'; THEMES[1].s1 = '#4a6ad8'; THEMES[1].s2 = '#ffe0c0'; THEMES[7].s1 = '#1e6a46'; THEMES[7].s2 = '#8adc9a'; THEMES[6].s1 = '#ff9a5a'; THEMES[3].s1 = '#0e5a70';
// Export each theme's music pitch multiplier so game.js can shift the ambient tone.
PF.THEME_PITCH = THEMES.map(function (t) { return t.pitch || 1; });
// Draws one parallax layer twice side by side so it tiles seamlessly: fn(xOffset) paints a single period.
function bgLayer(period, speed, cam, fn) { for (var k = 0; k < 2; k++) fn(-((cam * speed) % period) + k * period); }
// BGX: per-mode backgrounds (th, cam) for the themed modes; drawBackground() dispatches here first.
// underground backgrounds: rock strata, stalactites above and stalagmites below, plus each look's own details
function ugBack(th, cam, kind) {
  var k, cy = (G.camY || 0);
  for (k = 0; k < 7; k++) { var y = ((k * 36 - cy * 0.3) % 252 + 252) % 252 - 16; ctx.globalAlpha = 0.5; rect(0, y, VW, 10 + (k * 7) % 12, k % 2 ? th.m1 : th.m2); ctx.globalAlpha = 1; }
  bgLayer(360, 0.25, cam, function (o) { for (var i = 0; i < 7; i++) { var x = o + i * 52 + (i * 13) % 20, h = 14 + (i * 29) % 34; poly([x, 0, x + 14, 0, x + 7, h], th.m1); } });
  bgLayer(420, 0.4, cam, function (o) { for (var i = 0; i < 6; i++) { var x = o + i * 70 + (i * 17) % 24, h = 10 + (i * 31) % 28; poly([x, VH, x + 18, VH, x + 9, VH - h], th.m2); } });
  bgLayer(300, 0.5, cam, function (o) {
    for (var i = 0; i < 5; i++) { var x = o + i * 60 + (i * 11) % 18;
      if (kind === 'ug') { line(x, 0, x, 18 + (i * 9) % 30, '#6a4a2a', 1.5); circ(x, 20 + (i * 9) % 30, 2.4, '#ffd08a'); if (i % 2) { rect(x + 20, 60 + (i * 7) % 40, 3, 24, '#5a4028'); rect(x + 14, 60 + (i * 7) % 40, 15, 3, '#5a4028'); } }
      else if (kind === 'uglava') { ctx.globalAlpha = 0.5 + 0.25 * Math.sin(F * 0.08 + i); line(x - 8, 30 + (i * 23) % 120, x + 22, 52 + (i * 19) % 110, '#ff6a2a', 2); ctx.globalAlpha = 1; }
      else if (kind === 'ugice') { poly([x, 0, x + 6, 0, x + 3, 26 + (i * 13) % 20], '#bfefff'); poly([x + 20, VH, x + 30, VH, x + 25, VH - 22 - (i * 11) % 18], '#8ad8ff'); }
      else if (kind === 'ugcave') { var my = VH - 6; rect(x - 1, my - 8 - (i % 3) * 3, 2, 8 + (i % 3) * 3, '#8a8aa0'); ctx.globalAlpha = 0.55 + 0.3 * Math.sin(F * 0.1 + i); circ(x, my - 9 - (i % 3) * 3, 5, '#7affb0'); circ(x, my - 9 - (i % 3) * 3, 2.4, '#e8fff0'); ctx.globalAlpha = 1; }
      else { ctx.globalAlpha = 0.8; diamond(x, VH - 10 - (i * 7) % 14, 4, 9 + (i % 3) * 3, i % 2 ? '#4af0e0' : '#c86aff'); diamond(x + 9, VH - 6, 3, 6, '#7a6aff'); ctx.globalAlpha = 1; if (i % 2) { rect(x + 24, 40, 3, 60, '#4a3a2a'); rect(x + 18, 40, 15, 3, '#4a3a2a'); } }
    } });
  if (kind === 'uglava') { var gl = ctx.createLinearGradient(0, VH - 70, 0, VH); gl.addColorStop(0, 'rgba(255,90,20,0)'); gl.addColorStop(1, 'rgba(255,90,20,.35)'); ctx.fillStyle = gl; ctx.fillRect(0, VH - 70, VW, 70); }
  if (kind === 'ugcrystal') { ctx.globalAlpha = 0.06; rect(0, 0, VW, VH, '#4af0e0'); ctx.globalAlpha = 1; }
}
var BGX = {
  ug: function (th, cam) { ugBack(th, cam, 'ug'); }, uglava: function (th, cam) { ugBack(th, cam, 'uglava'); }, ugice: function (th, cam) { ugBack(th, cam, 'ugice'); }, ugcave: function (th, cam) { ugBack(th, cam, 'ugcave'); }, ugcrystal: function (th, cam) { ugBack(th, cam, 'ugcrystal'); },
  autumn: function (th, cam) { bgLayer(480, 0.18, cam, function (o) { for (var i = 0; i < 6; i++) { ctx.fillStyle = th.m1; ctx.beginPath(); ctx.ellipse(o + i * 80 + 20, VH - 8, 62, 30 + (i * 7) % 24, 0, Math.PI, 0); ctx.fill(); } }); bgLayer(420, 0.4, cam, function (o) { for (var i = 0; i < 5; i++) { var x = o + i * 84 + 30; rect(x - 2, VH - 62, 4, 52, '#4a2a18'); circ(x, VH - 70, 16, '#e8741a'); circ(x - 9, VH - 62, 11, '#ffa030'); circ(x + 10, VH - 64, 12, '#d4541a'); } }); },
  jungle: function (th, cam) { bgLayer(480, 0.2, cam, function (o) { for (var i = 0; i < 7; i++) { var x = o + i * 70 + 10; rect(x - 3, 30, 6, VH, th.m1); circ(x, 36 + (i % 3) * 8, 26, th.m1); } }); bgLayer(440, 0.45, cam, function (o) { for (var i = 0; i < 6; i++) { var x = o + i * 76 + 36; rect(x - 4, 60, 8, VH, th.m2); circ(x, 66, 30, th.m2); circ(x + 20, 80, 18, th.m2); line(x + 6, 40, x + 18, 120, '#2a8a4a', 2); } }); },
  snow: function (th, cam) { bgLayer(500, 0.15, cam, function (o) { for (var i = 0; i < 5; i++) { var x = o + i * 100, h = 70 + (i * 23) % 50; poly([x, VH - 12, x + 50, VH - 12 - h, x + 100, VH - 12], th.m1); poly([x + 50 - h * 0.22, VH - 12 - h * 0.78, x + 50, VH - 12 - h, x + 50 + h * 0.22, VH - 12 - h * 0.78], '#fff'); } }); bgLayer(420, 0.35, cam, function (o) { for (var i = 0; i < 6; i++) { var x = o + i * 70 + 20; poly([x, VH - 8, x + 22, VH - 48, x + 44, VH - 8], th.m2); } }); },
  desert: function (th, cam) { circ(330, 52, 22, th.sun); ctx.globalAlpha = 0.35; circ(330, 52, 30, th.sun); ctx.globalAlpha = 1; bgLayer(520, 0.12, cam, function (o) { for (var i = 0; i < 4; i++) { ctx.fillStyle = th.m1; ctx.beginPath(); ctx.ellipse(o + i * 130 + 40, VH - 6, 110, 38 + (i * 13) % 20, 0, Math.PI, 0); ctx.fill(); } }); bgLayer(400, 0.3, cam, function (o) { for (var i = 0; i < 3; i++) { ctx.fillStyle = th.m2; ctx.beginPath(); ctx.ellipse(o + i * 140 + 60, VH - 4, 90, 26, 0, Math.PI, 0); ctx.fill(); var x = o + i * 140 + 120; rect(x, VH - 40, 5, 34, '#6a8a3a'); rect(x - 7, VH - 30, 5, 12, '#6a8a3a'); rect(x + 7, VH - 34, 5, 14, '#6a8a3a'); } }); },
  swamp: function (th, cam) { bgLayer(460, 0.2, cam, function (o) { for (var i = 0; i < 5; i++) { var x = o + i * 92 + 30; line(x, VH - 8, x - 4, VH - 90, th.m1, 4); line(x - 2, VH - 60, x - 22, VH - 84, th.m1, 2.5); line(x - 3, VH - 76, x + 16, VH - 96, th.m1, 2.5); } }); for (var k = 0; k < 4; k++) { ctx.globalAlpha = 0.12; rect(0, 90 + k * 28 + Math.sin(F * 0.01 + k) * 5, VW, 22, '#b8d8a0'); ctx.globalAlpha = 1; } },
  storm: function (th, cam) { bgLayer(480, 0.2, cam, function (o) { for (var i = 0; i < 5; i++) { var x = o + i * 100 + 20; ctx.fillStyle = th.m1; circ(x, 50 + (i % 2) * 14, 28, th.m1); circ(x + 26, 58, 22, th.m1); circ(x - 24, 60, 20, th.m1); rect(x - 44, 58, 90, 20, th.m1); } }); bgLayer(520, 0.4, cam, function (o) { for (var i = 0; i < 4; i++) { var x = o + i * 130 + 50; circ(x, 100, 30, th.m2); circ(x + 30, 108, 24, th.m2); rect(x - 30, 106, 80, 22, th.m2); } });
    var ph = F % 420; if (ph < 8 || (ph > 14 && ph < 18)) { ctx.globalAlpha = 0.35; rect(0, 0, VW, VH, '#dfe8ff'); ctx.globalAlpha = 1; var bx = 80 + ((Math.floor(F / 420) * 97) % 240); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx - 10, 40); ctx.lineTo(bx + 6, 70); ctx.lineTo(bx - 8, 120); ctx.stroke(); } },
  airship: function (th, cam) { bgLayer(520, 0.1, cam, function (o) { for (var i = 0; i < 3; i++) { var x = o + i * 170 + 40; ctx.globalAlpha = 0.5; ell(x, 60 + i * 12, 40, 12, '#c8a878'); ell(x, 44 + i * 12, 34, 22, '#e86a4a'); poly([x - 38, 62 + i * 12, x - 56, 52 + i * 12, x - 40, 70 + i * 12], '#a88858'); ctx.globalAlpha = 1; } }); bgLayer(400, 0.3, cam, function (o) { for (var i = 0; i < 4; i++) { var x = o + i * 100 + 30; ctx.globalAlpha = 0.5; circ(x, 150 + (i % 2) * 14, 14, '#fff'); circ(x + 14, 154, 11, '#fff'); rect(x - 10, 152, 30, 10, '#fff'); ctx.globalAlpha = 1; } }); },
  crystal: function (th, cam) { bgLayer(500, 0.2, cam, function (o) { for (var i = 0; i < 6; i++) { var x = o + i * 84 + 14, h = 60 + (i * 31) % 70; poly([x, VH - 8, x + 10, VH - 8 - h, x + 22, VH - 8 - h * 0.55, x + 34, VH - 8], th.m1); poly([x + 10, VH - 8 - h, x + 22, VH - 8 - h * 0.55, x + 17, VH - 8], 'rgba(255,170,255,.35)'); } }); bgLayer(420, 0.45, cam, function (o) { for (var i = 0; i < 5; i++) { var x = o + i * 90 + 40; poly([x, 0, x + 12, 0, x + 6, 30 + (i * 17) % 30], th.m2); } }); },
  volcano: function (th, cam) { var g2 = ctx.createRadialGradient(240, VH - 20, 10, 240, VH - 20, 220); g2.addColorStop(0, 'rgba(255,120,30,.55)'); g2.addColorStop(1, 'rgba(255,60,0,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, VW, VH); bgLayer(600, 0.12, cam, function (o) { poly([o + 120, VH - 8, o + 240, 60, o + 360, VH - 8], th.m1); poly([o + 216, 66, o + 240, 60, o + 264, 66, o + 252, 78, o + 228, 78], '#ff6a1a'); ctx.globalAlpha = 0.4; poly([o + 232, 58, o + 240, 20 + Math.sin(F * 0.05) * 4, o + 248, 58], '#ffb04a'); ctx.globalAlpha = 1; }); bgLayer(420, 0.35, cam, function (o) { for (var i = 0; i < 4; i++) { var x = o + i * 105 + 20; poly([x, VH - 8, x + 28, VH - 8 - 40 - (i * 19) % 30, x + 56, VH - 8], th.m2); } }); },
  ruins: function (th, cam) { bgLayer(480, 0.2, cam, function (o) { for (var i = 0; i < 5; i++) { var x = o + i * 96 + 30, h = 70 + (i * 29) % 60; rect(x, VH - 8 - h, 14, h, th.m1); rect(x - 3, VH - 12 - h, 20, 6, th.m1); if (i % 2) { ctx.strokeStyle = th.m1; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x + 60, VH - 8 - h + 6, 46, Math.PI, 0); ctx.stroke(); } } }); bgLayer(420, 0.4, cam, function (o) { for (var i = 0; i < 4; i++) { var x = o + i * 110 + 40; rect(x, VH - 70, 10, 62, th.m2); rect(x - 2, VH - 74, 14, 5, th.m2); } }); },
  factory: function (th, cam) { bgLayer(480, 0.2, cam, function (o) { for (var i = 0; i < 4; i++) { var x = o + i * 120 + 40; rect(x, 40, 22, VH, th.m1); rect(x - 4, 36, 30, 8, th.m1); ctx.globalAlpha = 0.3; circ(x + 11 + Math.sin(F * 0.02 + i) * 6, 28 - (F * 0.2 + i * 17) % 24, 9, '#aaa'); ctx.globalAlpha = 1; } }); bgLayer(440, 0.4, cam, function (o) { for (var i = 0; i < 3; i++) { var x = o + i * 150 + 60, y = 110 + (i % 2) * 40; ctx.save(); ctx.translate(x, y); ctx.rotate(F * 0.01 * (i % 2 ? 1 : -1)); ctx.fillStyle = th.m2; ctx.beginPath(); ctx.arc(0, 0, 24, 0, 6.2832); ctx.fill(); for (var t = 0; t < 8; t++) { ctx.rotate(Math.PI / 4); rect(-4, -32, 8, 10, th.m2); } ctx.restore(); circ(x, y, 7, th.s1); } }); },
  neon: function (th, cam) { bgLayer(500, 0.16, cam, function (o) { for (var i = 0; i < 8; i++) { var x = o + i * 62 + 6, h = 60 + (i * 41) % 90; rect(x, VH - 8 - h, 48, h, th.m1); for (var wy = 0; wy < h - 10; wy += 10) for (var wx = 0; wx < 40; wx += 10) if (((wx * 7 + wy * 3 + i * 11) % 5) < 2) rect(x + 5 + wx, VH - 8 - h + 6 + wy, 5, 5, (i + wy) % 3 ? 'rgba(255,90,255,.8)' : 'rgba(80,255,240,.8)'); } }); bgLayer(420, 0.4, cam, function (o) { for (var i = 0; i < 4; i++) { var x = o + i * 108 + 30, pulse = 0.5 + 0.5 * Math.sin(F * 0.08 + i); ctx.strokeStyle = 'rgba(255,60,255,' + (0.4 + 0.5 * pulse) + ')'; ctx.lineWidth = 3; ctx.strokeRect(x, 70 + (i % 2) * 20, 46, 18); } }); },
  tower: function (th, cam) { bgLayer(500, 0.1, cam, function (o) { for (var i = 0; i < 4; i++) { var x = o + i * 130 + 20; rect(x, 70, 14, VH, th.m1); poly([x - 4, 70, x + 7, 52, x + 18, 70], th.m1); } }); bgLayer(420, 0.3, cam, function (o) { for (var i = 0; i < 5; i++) { var x = o + i * 90 + 20; ctx.globalAlpha = 0.7; rrect(x, 90 + (i % 3) * 30, 56, 7, 3.5, '#fff'); rrect(x + 14, 100 + (i % 3) * 30, 40, 6, 3, '#fff'); ctx.globalAlpha = 1; } }); },
  shaft: function (th, cam) { for (var k = 0; k < 9; k++) { var y = ((k * 28 - (G.camY || 0) * 0.5) % 252 + 252) % 252 - 20; rect(0, y, VW, 2, 'rgba(255,255,255,.04)'); } for (var k2 = 0; k2 < 3; k2++) { var ty = ((k2 * 90 - (G.camY || 0) * 0.8) % 270 + 270) % 270 - 10; rect(20, ty, 4, 16, '#3a2a1a'); circ(22, ty - 3, 5 + Math.sin(F * 0.3 + k2) * 1, '#ffb04a'); rect(VW - 24, ty + 30, 4, 16, '#3a2a1a'); circ(VW - 22, ty + 27, 5 + Math.sin(F * 0.3 + k2 + 2) * 1, '#ffb04a'); } },
  chase: function (th, cam) { var g3 = ctx.createLinearGradient(0, VH - 90, 0, VH); g3.addColorStop(0, 'rgba(255,90,30,0)'); g3.addColorStop(1, 'rgba(255,90,30,.5)'); ctx.fillStyle = g3; ctx.fillRect(0, VH - 90, VW, 90); bgLayer(480, 0.2, cam, function (o) { for (var i = 0; i < 6; i++) { var x = o + i * 80 + 10, h = 40 + (i * 23) % 60; poly([x, VH, x + 18, VH - h, x + 36, VH], th.m1); } }); },
  gauntlet: function (th, cam) { ctx.globalAlpha = 0.12; for (var i = -2; i < 14; i++) { var x = i * 44 - ((cam * 0.3) % 44); poly([x, 0, x + 22, 0, x + 22 - 90, VH, x - 90, VH], '#fff'); } ctx.globalAlpha = 1; bgLayer(400, 0.2, cam, function (o) { for (var i = 0; i < 4; i++) { var x = o + i * 100 + 30; ctx.strokeStyle = 'rgba(255,224,138,.35)'; ctx.lineWidth = 2; ctx.strokeRect(x, 40 + (i % 2) * 40, 60, 40); } }); }
};
// backgrounds of the green / teal looks
function cloudPuff(x, y, sc, a) { ctx.globalAlpha = a; circ(x, y, 10 * sc, '#fff'); circ(x + 11 * sc, y + 3 * sc, 8 * sc, '#fff'); circ(x - 11 * sc, y + 3 * sc, 8 * sc, '#fff'); rect(x - 18 * sc, y + 3 * sc, 36 * sc, 8 * sc, '#fff'); ctx.globalAlpha = 1; }
BGX.hillsg = function (th, cam) { circ(330, 44, 18, th.sun); bgLayer(520, 0.06, cam, function (o) { for (var i = 0; i < 4; i++) cloudPuff(o + i * 130 + 30, 36 + (i * 23) % 40, 1 + (i % 2) * 0.4, 0.85); }); bgLayer(480, 0.15, cam, function (o) { for (var i = 0; i < 4; i++) { ctx.fillStyle = th.m1; ctx.beginPath(); ctx.ellipse(o + i * 130 + 50, VH - 8, 100, 50 + (i * 17) % 30, 0, Math.PI, 0); ctx.fill(); } }); bgLayer(420, 0.35, cam, function (o) { for (var i = 0; i < 4; i++) { ctx.fillStyle = th.m2; ctx.beginPath(); ctx.ellipse(o + i * 110 + 20, VH - 4, 70, 30 + (i * 11) % 20, 0, Math.PI, 0); ctx.fill(); } }); bgLayer(300, 0.5, cam, function (o) { for (var i = 0; i < 6; i++) { var x = o + i * 50 + 10; rect(x, VH - 20, 2, 8, '#2a7a3a'); circ(x + 1, VH - 22, 3, i % 2 ? '#ffd24a' : '#ff7aa8'); } }); };
BGX.bamboo = function (th, cam) { circ(60, 40, 16, th.sun); ctx.globalAlpha = 0.3; for (var i = -2; i < 10; i++) { var x = i * 52 - ((cam * 0.2) % 52); poly([x, 0, x + 14, 0, x - 40, VH, x - 54, VH], '#fff'); } ctx.globalAlpha = 1; bgLayer(480, 0.18, cam, function (o) { for (var i = 0; i < 9; i++) { var x = o + i * 54 + (i * 13) % 14; rect(x, 0, 7, VH, th.m1); for (var y = 14 + (i * 7) % 20; y < VH; y += 34) rect(x - 1, y, 9, 3, th.m2); } }); bgLayer(420, 0.4, cam, function (o) { for (var i = 0; i < 7; i++) { var x = o + i * 64 + 20; rect(x, 20, 9, VH, th.m2); for (var y = 30 + (i * 11) % 24; y < VH; y += 40) rect(x - 1, y, 11, 3, th.m1); poly([x + 9, 50 + (i * 17) % 40, x + 40, 44 + (i * 17) % 40, x + 9, 56 + (i * 17) % 40], '#58c46a'); } }); };
BGX.reef = function (th, cam) { for (var i = 0; i < 5; i++) { var x = ((i * 90 - cam * 0.05) % 450 + 450) % 450 - 20; poly([x, 0, x + 18, 0, x + 70, VH, x + 30, VH], 'rgba(255,255,255,.10)'); } bgLayer(500, 0.15, cam, function (o) { for (var i = 0; i < 6; i++) { var x = o + i * 84 + 10, h = 40 + (i * 29) % 50; poly([x, VH - 8, x + 12, VH - 8 - h, x + 26, VH - 8 - h * 0.6, x + 38, VH - 8], th.m1); } }); bgLayer(420, 0.35, cam, function (o) { for (var i = 0; i < 6; i++) { var x = o + i * 70 + 20, h = 24 + (i * 19) % 30; line(x, VH - 4, x + 3, VH - 4 - h, i % 2 ? '#ff8ab0' : '#ffd070', 4); line(x + 3, VH - 4 - h * 0.6, x + 12, VH - 4 - h * 0.9, i % 2 ? '#ff8ab0' : '#ffd070', 3); circ(x + 3, VH - 4 - h, 3, '#fff'); } }); };
BGX.mintsky = function (th, cam) { circ(340, 46, 18, th.sun); ctx.globalAlpha = 0.3; circ(340, 46, 28, th.sun); ctx.globalAlpha = 1; bgLayer(520, 0.08, cam, function (o) { for (var i = 0; i < 4; i++) cloudPuff(o + i * 130 + 20, 30 + (i * 31) % 60, 1.3, 0.9); }); bgLayer(480, 0.2, cam, function (o) { for (var i = 0; i < 5; i++) { var x = o + i * 96 + 20, y = 90 + (i * 37) % 60; ctx.fillStyle = th.m1; ctx.beginPath(); ctx.ellipse(x, y, 36, 9, 0, 0, Math.PI * 2); ctx.fill(); poly([x - 28, y + 3, x + 28, y + 3, x, y + 26 + (i * 7) % 14], th.m2); } }); bgLayer(420, 0.4, cam, function (o) { for (var i = 0; i < 4; i++) cloudPuff(o + i * 110 + 60, 130 + (i * 29) % 50, 1.1, 0.7); }); };
BGX.jade = function (th, cam) { circ(330, 48, 20, th.sun); ctx.globalAlpha = 0.3; circ(330, 48, 30, th.sun); ctx.globalAlpha = 1; bgLayer(520, 0.1, cam, function (o) { for (var i = 0; i < 4; i++) { var x = o + i * 130 + 40; ctx.fillStyle = th.m1; ctx.beginPath(); ctx.ellipse(x + 20, VH - 8, 90, 70 + (i * 13) % 20, 0, Math.PI, 0); ctx.fill(); } }); bgLayer(480, 0.22, cam, function (o) { for (var i = 0; i < 3; i++) { var x = o + i * 160 + 30, y = VH - 8 - 70; rect(x, y + 30, 60, 40, th.m2); rect(x + 8, y + 12, 44, 18, th.m2); poly([x - 8, y + 30, x + 30, y + 6, x + 68, y + 30], '#e8c64a'); poly([x + 2, y + 12, x + 30, y - 12, x + 58, y + 12], '#e8c64a'); rect(x + 24, y + 44, 12, 26, '#0e4a36'); } }); bgLayer(300, 0.45, cam, function (o) { for (var i = 0; i < 4; i++) { var x = o + i * 75 + 20; line(x, 0, x, 20 + (i * 13) % 14, '#e8c64a', 1.5); circ(x, 28 + (i * 13) % 14, 6, '#e0402a'); } }); };
BGX.aurora = function (th, cam) { for (var i = 0; i < SPARK.length; i++) { var sp = SPARK[i]; spark4(sp.x, sp.y * 0.8, sp.s * 0.7 + 0.4 * Math.sin(F * 0.07 + i), 'rgba(220,255,255,.85)'); } for (var k = 0; k < 3; k++) { ctx.globalAlpha = 0.22; var by = 30 + k * 26; ctx.fillStyle = k === 1 ? '#7affd8' : k === 2 ? '#5ab8ff' : '#9aff9a'; ctx.beginPath(); ctx.moveTo(0, by); for (var x = 0; x <= VW; x += 20) ctx.lineTo(x, by + Math.sin(x * 0.02 + F * 0.015 + k * 2 - cam * 0.002) * 14); for (var x2 = VW; x2 >= 0; x2 -= 20) ctx.lineTo(x2, by + 34 + Math.sin(x2 * 0.025 + F * 0.012 + k) * 10); ctx.closePath(); ctx.fill(); } ctx.globalAlpha = 1; bgLayer(500, 0.12, cam, function (o) { for (var i = 0; i < 5; i++) { var x = o + i * 100, h = 50 + (i * 23) % 40; poly([x, VH - 8, x + 50, VH - 8 - h, x + 100, VH - 8], th.m1); poly([x + 50 - h * 0.2, VH - 8 - h * 0.8, x + 50, VH - 8 - h, x + 50 + h * 0.2, VH - 8 - h * 0.8], '#d8fff4'); } }); };
// particles: screen-space, deterministic per index; parallax with the camera
function drawParticles(th, cam) {
  var kind = th.part; if (!kind || kind === 'none') return; var n = kind === 'rain' ? 70 : 36, i;
  for (i = 0; i < n; i++) {
    var h = PF.hash(i, 17, 3) % 1000, bx = h % 400, by = (h * 7) % 224, sp = 0.4 + (h % 7) * 0.12;
    if (kind === 'snow') { var x = ((bx + F * 0.3 * sp + Math.sin(F * 0.02 + i) * 6 - cam * 0.2) % 420 + 420) % 420 - 10, y = (by + F * sp * 0.8) % 234 - 5; circ(x, y, 1 + (h % 3) * 0.5, 'rgba(255,255,255,.85)'); }
    else if (kind === 'leaves') { var x2 = ((bx - F * 0.4 * sp - cam * 0.25) % 420 + 420) % 420 - 10, y2 = (by + F * sp * 0.6) % 234 - 5; ctx.save(); ctx.translate(x2, y2); ctx.rotate(F * 0.05 + i); poly([0, -3, 3, 0, 0, 3, -3, 0], i % 2 ? '#ff8a2a' : '#d4441a'); ctx.restore(); }
    else if (kind === 'dust') { var x3 = ((bx - F * 0.9 * sp - cam * 0.35) % 420 + 420) % 420 - 10; ctx.globalAlpha = 0.35; rect(x3, (by + Math.sin(F * 0.03 + i) * 4 + 224) % 224, 3 + (h % 4), 1, '#fff6d0'); ctx.globalAlpha = 1; }
    else if (kind === 'rain') { var x4 = ((bx - F * 1.4 - cam * 0.1) % 420 + 420) % 420 - 10, y4 = (by + F * 7 * sp) % 234 - 5; ctx.globalAlpha = 0.5; line(x4, y4, x4 - 3, y4 + 9, '#cfe0ff', 1); ctx.globalAlpha = 1; }
    else if (kind === 'embers') { var x5 = ((bx + Math.sin(F * 0.03 + i) * 10 - cam * 0.3) % 420 + 420) % 420 - 10, y5 = ((by - F * 0.7 * sp) % 234 + 234) % 234 - 5; ctx.globalAlpha = 0.8; circ(x5, y5, 1 + (h % 3) * 0.4, i % 3 ? '#ff8a2a' : '#ffd070'); ctx.globalAlpha = 1; }
    else if (kind === 'fireflies') { var x6 = ((bx + Math.sin(F * 0.02 + i * 2) * 14 - cam * 0.3) % 420 + 420) % 420 - 10, y6 = 60 + (by % 150) + Math.sin(F * 0.03 + i) * 8, gl = 0.4 + 0.6 * Math.abs(Math.sin(F * 0.05 + i)); ctx.globalAlpha = gl; circ(x6, y6, 1.6, '#e8ff7a'); ctx.globalAlpha = 0.25 * gl; circ(x6, y6, 4, '#e8ff7a'); ctx.globalAlpha = 1; }
    else if (kind === 'bubbles') { var x7 = ((bx + Math.sin(F * 0.03 + i) * 6 - cam * 0.2) % 420 + 420) % 420 - 10, y7 = ((by - F * 0.5 * sp) % 234 + 234) % 234 - 5; ctx.strokeStyle = 'rgba(230,255,255,.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x7, y7, 1.5 + (h % 3), 0, 6.2832); ctx.stroke(); }
    else if (kind === 'sparks') { var x8 = ((bx - cam * 0.3 + Math.sin(F * 0.04 + i) * 8) % 420 + 420) % 420 - 10, y8 = (by + Math.sin(F * 0.05 + i * 3) * 10 + 224) % 224, tw = 0.3 + 0.7 * Math.abs(Math.sin(F * 0.09 + i)); ctx.globalAlpha = tw; spark4(x8, y8, 1.4 + (h % 3) * 0.6, th.edge); ctx.globalAlpha = 1; }
  }
}

var MTN = (function () { var r = PF.rng(77), a = []; for (var i = 0; i < 9; i++) a.push({ x: i * 56 + r() * 20, w: 50 + r() * 50, h: 40 + r() * 55 }); return a; })();
var BARS = (function () { var r = PF.rng(99), a = []; for (var i = 0; i < 6; i++) a.push({ x: i * 90 + r() * 50, y: 16 + r() * 70, w: 24 + r() * 34 }); return a; })();
var SPARK = (function () { var r = PF.rng(5), a = []; for (var i = 0; i < 36; i++) a.push({ x: r() * VW, y: r() * 130, s: 0.8 + r() * 2 }); return a; })();

// Sky gradient, then either a BGX or the built-in castle / cave / night / sky modes plus the default parallax mountains and bars.
function drawBackground(th, cam) {
  var g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, th.s1); g.addColorStop(1, th.s2); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  var k, i2;
  if (BGX[th.mode]) { BGX[th.mode](th, cam); return; }
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
// Glowing faceted block used for all question blocks (QC/QP/QS/QM differ only in colour).
function crystal(x, y, base, light, dark, glow) {
  ctx.globalAlpha = 0.25 * glow; rect(x - 1, y - 1, TS + 2, TS + 2, light); ctx.globalAlpha = 1;
  rect(x, y, TS, TS, dark); poly([x + 1, y + 1, x + 15, y + 1, x + 8, y + 8], light); poly([x + 1, y + 1, x + 8, y + 8, x + 1, y + 15], base); poly([x + 15, y + 1, x + 15, y + 15, x + 8, y + 8], dark); poly([x + 1, y + 15, x + 8, y + 8, x + 15, y + 15], base);
  ctx.strokeStyle = light; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1);
}
// Draws one tile of type t at pixel (x, y); c/r are its column/row, above is the tile type above it (for edge highlights), bumpDy the bump offset.
function drawTile(t, x, y, th, above, bumpDy, c, r, st) {
  y += bumpDy || 0;
  switch (t) {
    // Ground: strata fill, diagonal sheen and a glowing top edge when open to the air.
    case T.SOLID: {
      var air = (above === 0 || above === 6 || above === 7 || above === 9 || (above >= 12 && above <= 14) || above === 19 || above === 17 || above === 40);
      if (st && st.L && st.L.natural) {   // a carved cave: rock in blotchy patches (no row stripes / tile diagonals), a soft rim only on the faces that border open water or air
        var hn = hh(c, r), hb = hh(c >> 1, (r >> 1) + 977), op = function (tt) { return tt === 0 || tt === 9 || (tt >= 22 && tt <= 24); };
        rect(x, y, TS, TS, th.str[(hb % 5 === 0 ? 1 : hb % 3 === 0 ? 2 : 0)]); if (hn % 5 === 0) { ctx.globalAlpha = 0.18; rect(x + (hn >> 3) % 9, y + (hn >> 5) % 10, 5, 4, '#000'); ctx.globalAlpha = 1; } else if (hn % 7 === 0) { ctx.globalAlpha = 0.1; rect(x + (hn >> 3) % 9, y + (hn >> 5) % 10, 6, 3, '#fff'); ctx.globalAlpha = 1; }
        ctx.globalAlpha = 0.42; if (op(above)) rect(x, y, TS, 2, th.edge); if (op(PF.tileAt(st, c, r + 1))) rect(x, y + TS - 2, TS, 2, '#000'); if (op(PF.tileAt(st, c - 1, r))) rect(x, y, 2, TS, th.edge); if (op(PF.tileAt(st, c + 1, r))) rect(x + TS - 2, y, 2, TS, th.edge); ctx.globalAlpha = 1;
        break; }
      rect(x, y, TS, TS, th.str[(r || 0) % 3]); line(x, y + 0.5, x + TS, y + 0.5, 'rgba(255,255,255,.07)');
      ctx.globalAlpha = 0.12; line(x, y + TS, x + TS, y, '#fff'); line(x + 8, y + TS, x + TS, y + 8, '#fff'); ctx.globalAlpha = 1;
      if (air) { rect(x, y, TS, 2, th.edge); ctx.globalAlpha = 0.3; rect(x, y + 2, TS, 3, th.edge); ctx.globalAlpha = 1; }
      break; }
    // Breakable brick.
    case T.BRICK:
      if (st && st.sw > 0) { diamond(x + 8, y + 8, 4.5, 6.5, '#2ee6d6', '#0a6a70'); break; }
      rect(x, y, TS, TS, th.slab); rect(x + 1, y + 1, TS - 2, TS - 2, 'rgba(255,255,255,.12)'); ctx.strokeStyle = 'rgba(20,10,40,.55)'; ctx.lineWidth = 1; ctx.strokeRect(x + 2.5, y + 2.5, TS - 5, TS - 5); diamond(x + 8, y + 8, 3, 4, 'rgba(20,10,40,.55)'); line(x, y + 8, x + 3, y + 8, 'rgba(20,10,40,.55)'); line(x + 13, y + 8, x + 16, y + 8, 'rgba(20,10,40,.55)'); break;
    // Question blocks as glowing crystals: coin, power-up, star and mushroom variants.
    case T.QC: crystal(x, y, '#18b4c6', '#7af4ff', '#0c6a78', 0.7 + 0.3 * Math.sin(F * 0.1)); ctx.strokeStyle = '#04343c'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x + 8, y + 8, 3.2, 0, 6.2832); ctx.stroke(); break;
    case T.QP: crystal(x, y, '#c036e8', '#f08aff', '#6a1488', 0.7 + 0.3 * Math.sin(F * 0.1)); poly([x + 8, y + 4, x + 12.5, y + 12, x + 3.5, y + 12], '#2a0638'); break;
    case T.QS: crystal(x, y, '#9ab8e8', '#f4fbff', '#4a6a9a', 0.7 + 0.3 * Math.sin(F * 0.1)); spark4(x + 8, y + 8, 5, '#243a5a'); break;
    case T.QM: crystal(x, y, '#34c88a', '#9affc8', '#146a48', 0.7 + 0.3 * Math.sin(F * 0.1)); ctx.strokeStyle = '#06301e'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x + 8, y + 8, 4.2, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 8, y + 8, 1.6, 0, 6.2832); ctx.stroke(); break;
    // Spent block.
    case T.USED: rect(x, y, TS, TS, '#1c1630'); ctx.strokeStyle = '#50467a'; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, TS - 3, TS - 3); diamond(x + 8, y + 8, 2, 3, '#50467a'); break;
    // Floor spikes.
    case T.SPIKE: for (var i = 0; i < 3; i++) { poly([x + i * 5.5, y + 16, x + i * 5.5 + 2.7, y + 4 + (i % 2) * 2, x + i * 5.5 + 5.4, y + 16], '#ff3a8a', '#ffd0e4'); } break;
    // Climbable vine.
    case T.VINE: ctx.strokeStyle = '#3affb0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.lineTo(x + 5, y + 5); ctx.lineTo(x + 11, y + 11); ctx.lineTo(x + 8, y + 16); ctx.stroke(); diamond(x + 12.5, y + 5, 2.4, 3.5, '#b8ffe0'); diamond(x + 3.5, y + 12, 2.4, 3.5, '#b8ffe0'); break;
    // Spring pad.
    case T.SPRING: rect(x + 1, y + 13, 14, 3, '#3a2f66'); ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 3, y + 13); ctx.lineTo(x + 13, y + 10); ctx.lineTo(x + 3, y + 7); ctx.lineTo(x + 13, y + 4); ctx.stroke(); rrect(x + 1, y + 1, 14, 3, 1.5, '#2ee6d6'); break;
    // Conveyor belts (left / right) with moving chevrons.
    case T.CONVL: case T.CONVR: { rect(x, y, TS, TS, '#2a2450'); rect(x, y, TS, 5, '#16122e'); var dd = t === T.CONVR ? 1 : -1, ph = ((F * 0.6 * dd) % 8 + 8) % 8; ctx.save(); ctx.beginPath(); ctx.rect(x, y, TS, 5); ctx.clip(); for (var k = -1; k < 3; k++) poly(dd > 0 ? [x + k * 8 + ph, y + 0.5, x + k * 8 + ph + 4, y + 2.5, x + k * 8 + ph, y + 4.5] : [x + k * 8 + ph + 4, y + 0.5, x + k * 8 + ph, y + 2.5, x + k * 8 + ph + 4, y + 4.5], '#2ee6d6'); ctx.restore(); rect(x + 2, y + 9, 12, 2, '#3a3270'); break; }
    // Slopes (rising right / rising left).
    case T.SLP: { var sgm = st && st.L.slp && st.L.slp[c * (st.L.rows || ROWS) + r]; if (!sgm) break;   // a free-angle slope cell: fill under the surface segment, edge line along it
      var yl = sgm[0] > 0 ? sgm[1] : sgm[1], yr = sgm[3];
      poly([x, y + 16, x, y + yl, x + sgm[0], y + sgm[1], x + sgm[2], y + sgm[3], x + 16, y + yr, x + 16, y + 16], PF.isW(above) ? th.str[((r || 0) + 1) % 3] : th.str[1]);   // under water the slope takes the colour of the sea floor row below it
      line(x + sgm[0], y + sgm[1], x + sgm[2], y + sgm[3], th.edge, 2); break; }
    case T.SLR: poly([x, y + 16, x + 16, y + 16, x + 16, y], PF.isW(above) ? th.str[((r || 0) + 1) % 3] : th.str[1]); line(x, y + 16, x + 16, y, th.edge, 2); break;
    case T.SLL: poly([x, y + 16, x + 16, y + 16, x, y], PF.isW(above) ? th.str[((r || 0) + 1) % 3] : th.str[1]); line(x + 16, y + 16, x, y, th.edge, 2); break;
    // Lava with an animated surface.
    case T.LAVA: {
      if (above === T.LAVA) {   // deep lava: dark molten body with slow embers, no surface waves
        rect(x, y, TS, TS, '#e02a58'); rect(x, y, TS, TS, 'rgba(120,10,40,0.35)');
        for (var q2 = 0; q2 < 2; q2++) { var ex = x + ((c * 7 + q2 * 9) % 13) + 1, ey = y + ((r * 5 + q2 * 6 + Math.floor(F * 0.03 + c)) % 12) + 1; rect(ex, ey, 3, 2, q2 ? '#ff7a3a' : '#ffb060'); }
        break;
      }
      rect(x, y + 3, TS, TS - 3, '#ff3a6a'); for (var q = 0; q < 3; q++) poly([x + q * 5.5, y + 3, x + q * 5.5 + 2.7, y - 1 + Math.sin(F * 0.15 + q * 2 + c) * 1.5, x + q * 5.5 + 5.4, y + 3], '#ff9a4a'); rect(x + 4, y + 9, 3, 3, '#ffe0a0'); break; }
    // Wall cannons facing left / right.
    case T.CANL: case T.CANR: { var dr = t === T.CANR ? 1 : -1; poly([x + 1, y + 16, x + 15, y + 16, x + 12, y + 9, x + 4, y + 9], '#2a2450'); hex(x + 8, y + 7, 7, '#4a3f86', 0.5); hex(x + 8, y + 7, 5, '#2a2450', 0.5); poly([x + 8 + dr * 6, y + 7, x + 8 + dr * 1, y + 3, x + 8 + dr * 1, y + 11], '#ff8a3a'); break; }
    // Tree stump.
    case T.STUMP: poly([x + 2, y + 16, x + 14, y + 16, x + 12, y + 10, x + 4, y + 10], '#4a3f86'); poly([x + 4, y + 10, x + 12, y + 10, x + 11, y + 5, x + 5, y + 5], '#5a4ea0'); poly([x + 5, y + 5, x + 11, y + 5, x + 8, y + 1], '#6a5cc0'); line(x + 8, y + 3, x + 8, y + 15, '#2ee6d6', 1); break;
    // P-switch hexagon.
    case T.PSW: hex(x + 8, y + 8, 8.2, '#3a2a8a', Math.PI / 6); hex(x + 8, y + 8, 6.4, '#6a52e0', Math.PI / 6); poly([x + 9, y + 3, x + 5, y + 9, x + 8, y + 9, x + 7, y + 13, x + 11, y + 7, x + 8, y + 7], '#ffe8a0'); break;
    // Switch-controlled gate and bridge.
    case T.GATE: { var gg = 0.6 + 0.4 * Math.sin(F * 0.2 + y); rect(x + 1, y, 3, TS, '#7a6ae0'); rect(x + 12, y, 3, TS, '#7a6ae0'); ctx.globalAlpha = 0.5 * gg; rect(x + 4, y, 8, TS, '#c8b8ff'); ctx.globalAlpha = 1; for (var q = 0; q < 4; q++) line(x + 4, y + 2 + q * 4 + (F * 0.3) % 4, x + 12, y + 2 + q * 4 + (F * 0.3) % 4, 'rgba(255,255,255,.7)'); break; }
    case T.BRIDGE: rect(x, y, TS, 5, '#2ee6d6'); rect(x, y, TS, 1.5, '#e8fffa'); for (var q2 = 0; q2 < 2; q2++) line(x + 4 + q2 * 8, y + 1.5, x + 4 + q2 * 8, y + 5, 'rgba(10,106,112,.7)'); break;
    // Floor switch (pulsing) and its pressed state.
    case T.SWITCH: { var pu = 0.7 + 0.3 * Math.sin(F * 0.15); ctx.globalAlpha = 0.3 * pu; hex(x + 8, y + 12, 9, '#ffe08a', 0); ctx.globalAlpha = 1; poly([x + 1, y + 16, x + 15, y + 16, x + 13, y + 11, x + 3, y + 11], '#4a3f86'); poly([x + 3, y + 11, x + 13, y + 11, x + 11, y + 8, x + 5, y + 8], '#ffb02a'); rect(x + 5, y + 8, 6, 1.5, '#fff0b0'); break; }
    case T.SWUSED: poly([x + 1, y + 16, x + 15, y + 16, x + 13, y + 13, x + 3, y + 13], '#3a2f66'); rect(x + 4, y + 12, 8, 1.5, '#7a6ab0'); break;
    // Ghost-house door, coloured by its key group.
    case T.DOOR: { var dc = st && st.L.grp ? st.L.grp[c * (st.L.rows || ROWS) + r] : 0, kc = KEYCOL[dc % 3]; rect(x, y, TS, TS, '#2a2450'); rect(x + 2, y + 1, TS - 4, TS - 2, kc); rect(x + 3, y + 2, TS - 6, TS - 4, 'rgba(0,0,0,.25)'); if (st && st.L.grp && st.L.tiles[c * (st.L.rows || ROWS) + r - 1] !== T.DOOR && st.L.tiles[(c - 1) * (st.L.rows || ROWS) + r] !== T.DOOR) { circ(x + 8, y + 9, 2.4, '#1a1a40'); rect(x + 7.2, y + 9, 1.6, 4, '#1a1a40'); } break; }
    // Teleporter pad.
    case T.TELE: if (st.L.tele && st.L.tele.some(function (t) { return t.door && t.c === c; })) drawDoor(x, y, teleColor(st.L, c)); else drawTele(x, y, teleColor(st.L, c), true); break;
    // Launcher tile (rotated to its direction).
    case T.LAUNCH: { ctx.save(); ctx.translate(x + 8, y + 9); ctx.rotate(-0.9); rrect(-9, -6, 18, 12, 4, '#4a3f86'); rect(-9, -6, 5, 12, '#2a2450'); rect(5, -5, 4, 10, '#ff8a3a'); ctx.restore(); circ(x + 8, y + 12, 3, '#ffe08a'); poly([x + 12, y + 4, x + 16, y + 1, x + 14, y + 7], '#ff8a3a'); break; }
    // Slippery ice.
    case T.ICE: { rect(x, y, TS, TS, '#7ad4f0'); rect(x + 1, y + 1, TS - 2, TS - 2, '#a8e8ff'); rect(x, y, TS, 3, '#e8fbff'); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 3, y + 12); ctx.lineTo(x + 8, y + 6); ctx.moveTo(x + 9, y + 13); ctx.lineTo(x + 13, y + 9); ctx.stroke(); ctx.strokeStyle = 'rgba(40,110,150,.55)'; ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1); break; }
    // Sticky mud.
    case T.MUD: { ctx.fillStyle = 'rgba(96,66,38,.9)'; ctx.fillRect(x, y + 3, TS, TS - 3); ctx.fillStyle = 'rgba(138,98,58,.9)'; ctx.fillRect(x, y + 3, TS, 3); for (var mq = 0; mq < 2; mq++) { var mb = (F * 0.4 + mq * 9 + c * 5) % 18; ctx.strokeStyle = 'rgba(190,150,100,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 4 + mq * 7, y + 12 - mb * 0.5, 1.5 + (mq ? 0.5 : 0), 0, 6.2832); ctx.stroke(); } break; }
    // Fire jet that cycles on/off via PF.fireOn.
    case T.FIRE: { var on = st && PF.fireOn(st.f, c); poly([x + 2, y + 16, x + 14, y + 16, x + 12, y + 11, x + 4, y + 11], '#5a3a4a'); rect(x + 5, y + 10, 6, 2, '#2a1a24'); if (on) { var fh = 11 + Math.sin(F * 0.6 + c) * 2.5; poly([x + 3, y + 11, x + 6, y + 11 - fh, x + 8, y + 5, x + 10, y + 11 - fh * 0.9, x + 13, y + 11], '#ff7a1a'); poly([x + 5.5, y + 11, x + 8, y + 11 - fh * 0.7, x + 10.5, y + 11], '#ffd24a'); } else { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(F * 0.3); circ(x + 8, y + 9, 1.6, '#ff8a3a'); ctx.globalAlpha = 1; } break; }
    // Narrow passage (mouse hole) only a small hero fits through.
    case T.NARROW: { rect(x, y, TS, TS, th.str[1]); rect(x, y, TS, 2, th.edge); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1); ctx.fillStyle = '#05030c'; ctx.beginPath(); ctx.arc(x + 8, y + 11.5, 4.6, Math.PI, 0); ctx.lineTo(x + 12.6, y + TS); ctx.lineTo(x + 3.4, y + TS); ctx.fill(); ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 8, y + 11.5, 5.6, Math.PI, 0); ctx.stroke(); break; }
    // Ground-pound block.
    case T.POUND: { rect(x, y, TS, TS, '#6a6280'); rect(x + 1, y + 1, TS - 2, TS - 2, '#8a82a8'); rect(x, y, TS, 2, '#c8c0e0'); ctx.fillStyle = '#2a2040'; ctx.beginPath(); ctx.moveTo(x + 4, y + 5); ctx.lineTo(x + 12, y + 5); ctx.lineTo(x + 8, y + 12); ctx.fill(); ctx.strokeStyle = '#2a2040'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1); break; }
    // Cracked block.
    case T.CRACK: { rect(x, y, TS, TS, '#8a7a9a'); rect(x + 1, y + 1, TS - 2, TS - 2, '#a898b8'); ctx.strokeStyle = '#2a2038'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x + 10, y + 9); ctx.lineTo(x + 7, y + 16); ctx.moveTo(x + 6, y + 5); ctx.lineTo(x + 1, y + 7); ctx.moveTo(x + 10, y + 9); ctx.lineTo(x + 15, y + 11); ctx.stroke(); break; }
    // Warp ring; only the top tile of a vertical stack draws the full ring.
    case T.RING: { if (r !== undefined && st && st.L.tiles[c * (st.L.rows || ROWS) + r - 1] === T.RING) break; var gl = 0.6 + 0.4 * Math.sin(F * 0.12); ctx.globalAlpha = 0.28 * gl; ell(x + 8, y + 16, 11, 17, '#7affe0'); ctx.globalAlpha = 1; ctx.strokeStyle = '#d8fff6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + 8, y + 16, 7.5, 14, 0, 0, 6.2832); ctx.stroke(); ctx.strokeStyle = '#2ee6d6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + 8, y + 16, 4.5 + gl, 10 + gl, 0, 0, 6.2832); ctx.stroke(); spark4(x + 8, y + 16, 3.5, '#fff'); break; }
  }
}
// Deterministic per-tile noise (0..999) so seabed decoration does not flicker.
function hh(a, b) { return PF.hash(a, b, 7) % 1000; }
// Sea-floor decoration (weed, shells) under tiles that touch water.
function drawSeabed(c, r) {
  var x = c * TS, y = r * TS, h = hh(c, r);
  if (h % 5 < 2) { for (var k = 0; k < 2; k++) { ctx.strokeStyle = k ? '#2ee6a8' : '#58ffc8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 5 + k * 6, y); for (var j = 1; j <= 4; j++) ctx.lineTo(x + 5 + k * 6 + Math.sin(F * 0.06 + j * 0.9 + k + c) * 2.2, y - j * 4); ctx.stroke(); } }
  else if (h % 5 === 2) { poly([x + 3, y, x + 6, y - 9, x + 9, y], '#ff7ab0'); poly([x + 8, y, x + 11, y - 12, x + 14, y], '#ff4a8a'); poly([x + 1, y, x + 3, y - 5, x + 5, y], '#ffb0d0'); }
  else if (h % 5 === 3) { hex(x + 8, y - 2.5, 3.5, '#9a8aff', 0); }
}
// Air pocket bubble underwater.
function drawPocket(p) { var pr = 8 + Math.sin(F * 0.1 + p.x) * 1; ctx.fillStyle = 'rgba(200,255,255,.22)'; ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, 6.2832); ctx.fill(); ctx.strokeStyle = 'rgba(230,255,255,.95)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, 6.2832); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, pr - 3, 3.6, 4.6); ctx.stroke(); text('O\u2082', p.x, p.y + 0.5, 6, '#bff', 'center', false); }
// Wind zone arrows.
function drawWind(w) {
  var up = w.dy < 0, n = up ? 4 : 6, i; ctx.strokeStyle = up ? 'rgba(180,255,240,.55)' : 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.4;
  for (i = 0; i < n; i++) {
    if (up) { var xx = w.x0 + (i + 0.5) * (w.x1 - w.x0) / n, yy = w.y1 - ((F * 1.6 + i * 37) % (w.y1 - w.y0)); line(xx, yy, xx, yy - 10, ctx.strokeStyle, 1.4); poly([xx - 3, yy - 8, xx, yy - 13, xx + 3, yy - 8], ctx.strokeStyle); }
    else { var yy2 = w.y0 + (i + 0.5) * (w.y1 - w.y0) / n, dd = w.dx > 0 ? 1 : -1, xx2 = w.x0 + ((F * 1.4 * dd + i * 53) % (w.x1 - w.x0) + (w.x1 - w.x0)) % (w.x1 - w.x0); line(xx2, yy2, xx2 + dd * 14, yy2, ctx.strokeStyle, 1.4); ctx.beginPath(); ctx.moveTo(xx2 + dd * 14, yy2); ctx.lineTo(xx2 + dd * 10, yy2 - 2.5); ctx.moveTo(xx2 + dd * 14, yy2); ctx.lineTo(xx2 + dd * 10, yy2 + 2.5); ctx.stroke(); }
  }
}
var KEYCOL = ['#2ee6d6', '#ff6ad5', '#b8ff3a'];
// Collectible key (colour from KEYCOL); faded when already collected.
function drawKey(x, y, c, got) { var col = KEYCOL[c % 3], bob = Math.sin(F * 0.1 + x) * 1.5; if (got) ctx.globalAlpha = 0.25; ctx.save(); ctx.translate(x, y + bob); ctx.rotate(Math.sin(F * 0.05) * 0.2); diamond(0, -4, 4.5, 5.5, col, '#1a1a40'); circ(0, -4, 1.6, '#1a1a40'); rect(-1, 0, 2, 8, col); rect(1, 4, 3, 1.6, col); rect(1, 7, 2.4, 1.6, col); ctx.restore(); ctx.globalAlpha = 1; }
function drawDoor(x, y, col) {   // a ghost-house door standing on its ledge (the tile is the lower half)
  var cc = KEYCOL[col % 3], gl = 0.5 + 0.5 * Math.sin(F * 0.08 + x);
  rect(x + 1, y - 18, 14, 34, '#1a1030'); rect(x + 2, y - 17, 12, 33, cc); poly([x + 2, y - 16, x + 8, y - 22, x + 14, y - 16], cc); rect(x + 4, y - 14, 8, 28, 'rgba(10,6,30,.55)'); circ(x + 11, y + 2, 1.3, '#ffe08a'); ctx.globalAlpha = 0.25 * gl; rect(x + 4, y - 14, 8, 28, '#fff'); ctx.globalAlpha = 1;
}
function teleColor(L, c) { if (!L._tc) { L._tc = {}; (L.tele || []).forEach(function (t) { L._tc[t.c] = t.col; L._tc[Math.floor((t.tx + 8) / TS)] = t.col; }); } return L._tc[c] === undefined ? 0 : L._tc[c]; }
// Teleporter portal marker with a pulsing glow.
function drawTele(x, y, col, active) { var cc = KEYCOL[col % 3], gl = 0.6 + 0.4 * Math.sin(F * 0.15 + x); ctx.globalAlpha = 0.3 * gl; ell(x + 8, y + 12, 9, 6, cc); ctx.globalAlpha = 1; ctx.strokeStyle = cc; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x + 8, y + 12, 7, 3.5, 0, 0, 6.2832); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x + 8, y + 12, 3.5 + gl, 1.7 + gl * 0.4, 0, 0, 6.2832); ctx.stroke(); for (var k = 0; k < 3; k++) { var yy = y + 10 - ((F * 0.6 + k * 5) % 14); ctx.globalAlpha = 0.6; spark4(x + 5 + (k * 3) % 7, yy, 1.6, cc); ctx.globalAlpha = 1; } }
// Translucent water surface and body drawn over the tiles in flooded areas.
function drawWaterOverlay(x, y, above, wt, c, r) {
  var po = wt === T.POISON; ctx.fillStyle = po ? 'rgba(150,50,220,.46)' : 'rgba(40,200,220,.30)'; ctx.fillRect(x, y, TS, TS);
  if (po) { ctx.fillStyle = 'rgba(210,120,255,.16)'; ctx.fillRect(x, y + 3 + Math.sin(F * 0.07 + c) * 2, TS, 3); }
  if (wt === T.CURL || wt === T.CURR) { var dd = wt === T.CURR ? 1 : -1, ph = ((F * 0.5 * dd) % 8 + 8) % 8; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2; for (var k = -1; k < 3; k++) { var cx = x + k * 8 + ph; ctx.beginPath(); ctx.moveTo(cx - dd * 2, y + 5); ctx.lineTo(cx + dd * 2, y + 8); ctx.lineTo(cx - dd * 2, y + 11); ctx.stroke(); } }
  else if (wt === T.CURU) { var pu = (F * 0.6) % 8; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.2; for (var k2 = 0; k2 < 3; k2++) { var cy = y + 16 - ((k2 * 8 + pu) % 16); ctx.beginPath(); ctx.moveTo(x + 4, cy + 2); ctx.lineTo(x + 8, cy - 2); ctx.lineTo(x + 12, cy + 2); ctx.stroke(); } }
  var bh = hh(c, r); if (bh % 9 === 0) { var by = y + 16 - ((F * 0.35 + bh) % 40) % 16, bx = x + 8 + Math.sin(F * 0.08 + bh) * 3; ctx.strokeStyle = po ? 'rgba(235,190,255,.8)' : 'rgba(230,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 1.6 + (bh % 3) * 0.6, 0, 6.2832); ctx.stroke(); } if (!PF.isW(above) && above !== T.SOLID) { ctx.strokeStyle = po ? 'rgba(235,170,255,.95)' : 'rgba(220,255,250,.95)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (var i = 0; i <= 4; i++) { var xx = x + i * 4, yy = y + 1 + Math.sin(F * 0.12 + x * 0.3 + i) * 1.2; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); } }

// hero: a rounded diamond with one big eye (original)
// Hero renderer: dead / spinning / mounted variants.
function drawHero(p, dead, spinA, mounted) {
  var h = p.h, w = p.w, x = p.x, y = p.y, face = p.face >= 0 ? 1 : -1, cx = x + w / 2, pw = p.pw | 0, cy = y + h / 2, rx = w / 2 + 3.5;
  if (p.inv > 0 && !dead && (Math.floor(p.inv / 4) % 2)) ctx.globalAlpha = 0.45;
  var body = ['#ff8a3d', '#ff8a3d', '#ff3d8a', '#3dd6c0', '#8a94a8', '#7ac8ff'][pw], light = ['#ffc08a', '#ffc08a', '#ff9ac0', '#9af0e0', '#c8d0e0', '#d8f0ff'][pw], dark = ['#c24a14', '#c24a14', '#a01450', '#16806e', '#4a5262', '#2a6a9a'][pw];
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
  if (pw === 4) { rect(cx - 5, top - 1, 10, 3, '#ffd24a'); rect(cx - 5, top - 1, 10, 1.2, '#fff0a0'); line(cx + face * 6, cy + 4, cx + face * 6, cy - 4, '#8a94a8', 2); circ(cx + face * 6, cy - 5, 2.8, '#aab4c8'); }
  if (pw === 5) { poly([cx - 3, top + 3, cx - 1, top - 6, cx + 1, top + 3], '#e8f8ff', '#5aa0c8'); poly([cx + 1, top + 3, cx + 4, top - 4, cx + 5, top + 3], '#bfe8ff', '#5aa0c8'); }
  if (pw === 2) { poly([cx - 3, top + 3, cx - 1, top - 5, cx + 0.5, top + 2], '#ffb02a'); poly([cx - 0.5, top + 2, cx + 2, top - 7, cx + 4, top + 3], '#ff7a1a'); }
  else if (p.big) { poly([cx - 3, top + 3, cx, top - 3, cx + 3, top + 3], '#fff0c0'); }
  poly([cx - 3, top + 3, cx - 7, top - 1, cx - 5.5, top + 6], '#8a5aff'); poly([cx + 3, top + 3, cx + 7, top - 1, cx + 5.5, top + 6], '#8a5aff');
  var ey = cy - (p.big ? 3 : 1); ell(cx, ey, 5.2, 5.6, '#fff'); circ(cx + face * 1.8, ey + 0.4, 2.8, '#2a1456'); circ(cx + face * 2.6, ey - 0.8, 0.9, '#fff');
  ctx.restore(); ctx.globalAlpha = 1;
}

// Wall vent that blows bubbles while its jet is on.
function drawBubbleJet(w, f) {
  if (w.dy < 0) {   // a vent in the seabed blowing bubbles upward: they push the swimmer up
    var onU = !w.per || ((f + (w.ph | 0)) % w.per) < w.on; rect(w.vx - 6, w.vy - 2, 12, 4, onU ? '#7ad0ff' : '#3a3460'); if (!onU) return;
    for (var ju = 0; ju < 12; ju++) { var tu = ((f * 1.8 + ju * 17) % (w.y1 - w.y0)) / (w.y1 - w.y0), bxu = w.x0 + 3 + ((ju * 31) % Math.max(4, w.x1 - w.x0 - 6)) + Math.sin(f * 0.2 + ju) * 2; ctx.strokeStyle = 'rgba(230,255,255,' + (0.9 - tu * 0.5).toFixed(2) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bxu, w.y1 - tu * (w.y1 - w.y0), 1.5 + (ju % 3) * 0.8, 0, 6.2832); ctx.stroke(); }
    return;
  }
  if (w.dy > 0) {   // a jet blowing down from a vent in the ceiling: bubbles stream downwards (toward the poison below)
    var on0 = !w.per || ((f + (w.ph | 0)) % w.per) < w.on; rect(w.vx - 6, w.vy - 3, 12, 4, on0 ? '#7ad0ff' : '#3a3460'); if (!on0) return;
    for (var jb = 0; jb < 12; jb++) { var t2 = ((f * 1.6 + jb * 19) % (w.y1 - w.y0)) / (w.y1 - w.y0), bx2 = w.x0 + 4 + ((jb * 37) % Math.max(4, w.x1 - w.x0 - 8)) + Math.sin(f * 0.2 + jb) * 2; ctx.strokeStyle = 'rgba(230,255,255,' + (0.9 - t2 * 0.5).toFixed(2) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx2, w.y0 + t2 * (w.y1 - w.y0), 1.5 + (jb % 3) * 0.8, 0, 6.2832); ctx.stroke(); }
    return;
  }   // bubbles blown out of a wall vent, only while the jet is on
  if (w.per && ((f + (w.ph | 0)) % w.per) >= w.on) { var dd0 = w.dx > 0 ? 1 : -1; rect(w.vx - (dd0 > 0 ? 2 : -2) - 3, w.y0 + 2, 6, w.y1 - w.y0 - 4, '#3a3460'); return; }
  var dd = w.dx > 0 ? 1 : -1, len = w.x1 - w.x0, i; rect(w.vx - (dd > 0 ? 3 : -3) - 3, w.y0 + 2, 6, w.y1 - w.y0 - 4, '#7ad0ff');
  for (i = 0; i < 14; i++) { var t = ((f * 1.7 + i * 23) % len) / len, xx = (dd > 0 ? w.x0 : w.x1) + dd * t * len, yy = w.y0 + 4 + ((i * 37) % Math.max(4, w.y1 - w.y0 - 8)) + Math.sin(f * 0.2 + i) * 2; ctx.strokeStyle = 'rgba(230,255,255,' + (0.9 - t * 0.6).toFixed(2) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(xx, yy, 1.5 + (i % 3) * 0.8, 0, 6.2832); ctx.stroke(); }
}
// Whirlpool in water: spinning arcs.
function drawGeyser(g, f) {   // a lava fire pillar: a glow and sparks warn, then a tall column of flame
  var ph = (f + g.ph) % g.per, cx = g.x + g.w / 2;
  if (ph < g.on) { var k = 1 - ph / g.on * 0.25, hh = g.h * Math.min(1, ph / 8 + 0.2) * k; ctx.globalAlpha = 0.55; poly([g.x - 2, g.y, g.x + g.w + 2, g.y, g.x + g.w * 0.8, g.y - hh, g.x + g.w * 0.2, g.y - hh], '#ff7a2a'); ctx.globalAlpha = 0.95; poly([g.x + 3, g.y, g.x + g.w - 3, g.y, g.x + g.w * 0.7, g.y - hh * 0.8, g.x + g.w * 0.3, g.y - hh * 0.8], '#ffb04a'); poly([g.x + g.w * 0.3, g.y, g.x + g.w * 0.7, g.y, cx, g.y - hh * 0.6], '#fff0a0'); ctx.globalAlpha = 1; for (var q = 0; q < 4; q++) circ(cx + Math.sin(f * 0.3 + q * 2) * g.w * 0.4, g.y - ((f * 3 + q * 23) % hh), 1.6, '#ffe08a'); }
  else if (ph > g.per - 45) { var wu = (ph - (g.per - 45)) / 45; ctx.globalAlpha = 0.25 + 0.5 * wu * (0.5 + 0.5 * Math.sin(f * 0.6)); ell(cx, g.y - 1, g.w * 0.6, 3 + wu * 3, '#ffd24a'); ctx.globalAlpha = 1; for (var q2 = 0; q2 < 3; q2++) circ(cx + Math.sin(f * 0.5 + q2 * 2) * g.w * 0.3, g.y - 3 - ((f * 1.5 + q2 * 9) % (8 + wu * 14)), 1.4, '#ff8a3a'); }
}
function drawWhirl(w, f) {
  if (w.drain) { ctx.globalAlpha = 0.5; circ(w.x, w.y, w.r * 0.55, '#1a0a30'); ctx.globalAlpha = 0.9; circ(w.x, w.y, 7, '#05020c'); ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,90,120,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(w.x, w.y, 9 + Math.sin(f * 0.2) * 1.5, 0, 6.2832); ctx.stroke(); }
  for (var k = 0; k < 4; k++) { ctx.strokeStyle = 'rgba(220,250,255,' + (0.5 - k * 0.08).toFixed(2) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); var a0 = f * 0.12 * w.dir + k * 1.57; for (var q = 0; q <= 14; q++) { var rr = w.r * (0.15 + q / 14 * 0.85) * (1 - k * 0.1), an = a0 + q * 0.42 * w.dir; var px = w.x + Math.cos(an) * rr, py = w.y + Math.sin(an) * rr * 0.9; if (q) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); }
  ctx.globalAlpha = 0.25; circ(w.x, w.y, 4, '#ffffff'); ctx.globalAlpha = 1;
}
// Weather gust (blizzard / sandstorm / rain) streaks.
function drawGust(w, f, cam) {   // blizzard / sandstorm / rain gust: streaks flying through the view only while the gust blows
  if (w.per && ((f + (w.ph | 0)) % w.per) >= w.on) return;
  var dd = w.dx > 0 ? 1 : -1, top = (G.camY || 0), n = 16, i;
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.3;
  for (i = 0; i < n; i++) { var yy = top + ((i * 37 + 11) % 200), xx = cam + (((i * 59) + f * 4.2 * dd) % VW + VW) % VW; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + dd * 16, yy + 1.5); ctx.stroke(); }
}
// Hazard objects of a level (o = hazard, f = frame): dispatches on the hazard kind and draws its animated shape.
function drawHz(o, f) {
  var x = o.x, y = o.y, s = o.skin;
  if (o.wt > 0) {   // warning: a pulsing mark where it will strike
    var pu = 0.5 + 0.5 * Math.sin(f * 0.5), gy = o.gy, col = (s === 'bolt' || s === 'spark') ? '#fff27a' : s === 'meteor' || s === 'ember' ? '#ff5a3a' : s === 'snowlump' || s === 'icicle' || s === 'hail' ? '#bfefff' : '#ffd24a';
    ctx.globalAlpha = 0.35 + 0.4 * pu; ell(x, gy - 1, 10 + pu * 4, 3, col); ctx.globalAlpha = 0.5 * pu; line(x, gy - 150, x, gy - 2, col, 1); ctx.globalAlpha = 1;
    if (o.k === 'fall' && o.skin !== 'meteor') { ctx.globalAlpha = 0.5; poly([x - 4, y - 2, x + 4, y - 2, x, y + 5], col); ctx.globalAlpha = 1; }
    if (o.wt < 30 && s === 'meteor') { ctx.globalAlpha = 0.5; circ(x, o.gy - 130, 8 + (30 - o.wt) * 0.3, '#ffb04a'); ctx.globalAlpha = 1; }
    return;
  }
  if (o.k === 'bolt') { var a0 = Math.max(0, o.sk) / 9; if (s === 'bolt' && o.sk > 4) { ctx.globalAlpha = 0.28 * a0; ctx.fillStyle = '#eef0ff'; ctx.fillRect(G.cam - 10, (G.camY || 0) - 10, VW + 20, VH + 20); ctx.globalAlpha = 1; } ctx.globalAlpha = 0.25 + 0.75 * a0; var yy = o.gy, xx = x; ctx.strokeStyle = s === 'bolt' ? '#fffbb0' : '#8affff'; ctx.lineWidth = 3 * a0 + 1; ctx.beginPath(); ctx.moveTo(xx, yy - 260); for (var k = 1; k <= 13; k++) { ctx.lineTo(xx + ((k * 53 + o.sk * 17) % 15) - 7, yy - 260 + k * (260 / 13)); } ctx.lineTo(x, yy); ctx.stroke(); circ(x, yy, 7 * a0 + 2, '#ffffff'); ctx.globalAlpha = 1; return; }
  switch (s) {
    case 'meteor': ctx.globalAlpha = 0.5; poly([x - 6, y - 26, x + 6, y - 26, x + 3, y - 4, x - 3, y - 4], '#ff7a2a'); ctx.globalAlpha = 1; circ(x, y, 8, '#5a1a0a'); circ(x, y, 6, '#ff4a1a'); circ(x - 1, y - 1, 3, '#ffd24a'); break;
    case 'ember': circ(x, y, 4, '#ff7a2a'); circ(x, y, 2, '#ffe08a'); ctx.globalAlpha = 0.5; line(x, y - 4, x, y - 12, '#ff9a4a', 2); ctx.globalAlpha = 1; break;
    case 'snowlump': circ(x, y, 7, '#e8f6ff'); circ(x - 2, y - 2, 4, '#ffffff'); circ(x + 3, y + 3, 3, '#bfe0f4'); break;
    case 'icicle': poly([x - 4, y - 8, x + 4, y - 8, x, y + 9], '#bfefff', '#5aa0c8'); poly([x - 2, y - 8, x, y - 8, x - 1, y + 3], '#ffffff'); break;
    case 'hail': circ(x, y, 3.5, '#e8f6ff'); circ(x - 1, y - 1, 1.5, '#ffffff'); break;
    case 'coconut': circ(x, y, 6, '#6a4a2a'); circ(x - 2, y - 1, 1, '#2a1a0a'); circ(x + 1, y - 2, 1, '#2a1a0a'); circ(x - 1, y + 1.5, 1, '#2a1a0a'); break;
    case 'glob': ctx.globalAlpha = 0.9; ell(x, y, 4.5, 6, '#b04aff'); ell(x - 1, y - 2, 1.6, 2.4, '#e8b8ff'); ctx.globalAlpha = 1; break;
    case 'stalactite': poly([x - 5, y - 6, x + 5, y - 6, x, y + 10], '#8a7a9a', '#3a2a4a'); poly([x - 2, y - 6, x, y - 6, x - 1, y + 4], '#c8b8d8'); break;
    case 'shard': poly([x, y - 9, x + 4, y, x, y + 9, x - 4, y], '#7affea', '#1a8a7a'); poly([x, y - 9, x - 4, y, x, y], '#c8fff6'); break;
    case 'rock': circ(x, y, 6, '#7a6a5a'); circ(x - 2, y - 2, 2.5, '#a89a8a'); circ(x + 2, y + 2, 2, '#4a3a2a'); break;
    case 'acorn': ell(x, y + 1, 3.6, 4.4, '#b0702a'); rect(x - 4, y - 4, 8, 3, '#6a4a1a'); break;
    case 'bomb': circ(x, y, 6.5, '#2a2a3a'); circ(x - 2, y - 2, 2, '#6a6a8a'); line(x + 2, y - 6, x + 5, y - 10, '#ffb04a', 1.5); circ(x + 5, y - 10, 1.6, '#ffe08a'); break;
    case 'bolt': spark4(x, y, 7, '#fffbb0'); circ(x, y, 2.5, '#ffffff'); break;
    case 'web': ctx.globalAlpha = 0.85; ctx.strokeStyle = '#f4f4ff'; ctx.lineWidth = 1; for (var wb = 0; wb < 4; wb++) { var wa2 = wb * 0.785 + (o.rot || 0); ctx.beginPath(); ctx.moveTo(x - Math.cos(wa2) * 6, y - Math.sin(wa2) * 6); ctx.lineTo(x + Math.cos(wa2) * 6, y + Math.sin(wa2) * 6); ctx.stroke(); } ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1; break;
    case 'bomb2': circ(x, y, 5.5, '#2a2a3a'); circ(x - 1.5, y - 1.5, 1.6, 'rgba(255,255,255,.3)'); line(x + 1, y - 5, x + 3, y - 8, '#8a6a3a', 1.5); circ(x + 3, y - 8.5, 1.5 + Math.sin(F), '#ffd24a'); break;
    case 'wrench': ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); rect(-1.5, -2, 3, 10, '#8a94a8'); circ(0, -5, 4.5, '#aab4c8'); rect(-1.5, -10, 3, 5, '#2a2f3a'); circ(0, 8, 2.2, '#aab4c8'); ctx.restore(); break;
    case 'fire': circ(x, y, 5, 'rgba(255,90,20,.45)'); circ(x, y, 3.6, '#ff6a1a'); circ(x, y, 1.8, '#ffe8a0'); break;
    case 'snow': circ(x, y, 5, '#e8f6ff'); circ(x - 1.5, y - 1.5, 2.4, '#ffffff'); circ(x + 2, y + 2, 1.6, '#bfe0f4'); break;
    default: circ(x, y, 5, '#ffd24a');
  }
}
// Rolling enemy / boulder.
function drawRoller(e) {
  var cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2, a = e.rot || 0, s = e.skin;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
  if (s === 'snowball') { circ(0, 0, r, '#e8f6ff'); circ(-r * 0.3, -r * 0.3, r * 0.5, '#ffffff'); circ(r * 0.35, r * 0.3, r * 0.25, '#bfe0f4'); circ(r * 0.5, -r * 0.35, 1.8, '#3a4a6a'); circ(r * 0.1, -r * 0.5, 1.8, '#3a4a6a'); }
  else if (s === 'boulder') { circ(0, 0, r, '#7a6a5a'); circ(-r * 0.3, -r * 0.3, r * 0.4, '#a89a8a'); circ(r * 0.4, r * 0.2, r * 0.25, '#4a3a2a'); line(-r * 0.7, r * 0.1, -r * 0.1, r * 0.5, '#3a2a1a', 1.5); }
  else { for (var k = 0; k < 8; k++) { ctx.rotate(0.7854); line(0, 0, r, 0, '#b08a4a', 1.4); } circ(0, 0, r * 0.55, 'rgba(176,138,74,.5)'); }
  ctx.restore();
}
// Draws one enemy by type e.t. Dead enemies play a short fade / burst via e.dt first; each case below is one species' shape and animation.
function drawEnemy(e) {
  var cx = e.x + e.w / 2, by = e.y + e.h, dir = e.dir || 1, f = F, cy = e.y + e.h / 2;
  if (!e.alive) { if (e.dt > 0) { ctx.globalAlpha = Math.min(1, e.dt / 24); if (e.t === E.BOSS) { for (var q = 0; q < 8; q++) spark4(cx + Math.cos(q * 0.8 + e.dt * 0.2) * (34 - e.dt * 0.45), cy + Math.sin(q * 1.3 + e.dt * 0.2) * (34 - e.dt * 0.45), 5, '#ffe08a'); } else { rect(cx - 8, by - 2, 16, 2, '#c9b8ff'); spark4(cx, by - 4, 5, '#fff'); } ctx.globalAlpha = 1; } return; }
  switch (e.t) {
    // Ground walkers and spiky enemies.
    case E.WALKER: { var s1 = Math.sin(f * 0.25 + e.x);   // wedge crawler: violet triangle, one eye, two foot nubs
      poly([cx, by - 12, cx + 7.5, by - 2, cx - 7.5, by - 2], '#8a5cff', '#2a1070'); poly([cx, by - 12, cx - 7.5, by - 2, cx, by - 2], '#b090ff');
      rect(cx - 6 + s1 * 1.5, by - 2, 4, 2, '#2a1070'); rect(cx + 2 - s1 * 1.5, by - 2, 4, 2, '#2a1070');
      circ(cx + dir * 0.8, by - 6, 3, '#fff'); circ(cx + dir * 1.8, by - 5.8, 1.5, '#1a0a40'); break; }
    case E.SPIKY: { ctx.save(); ctx.translate(cx, cy); ctx.rotate(f * 0.06 * dir); for (var i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); poly([-2.6, -5.5, 0, -11.5, 2.6, -5.5], '#ff3a8a', '#ffd0e4'); } ctx.restore();
      circ(cx, cy, 6.4, '#1c1030'); circ(cx, cy, 6.4, 'rgba(255,58,138,.25)'); circ(cx + dir * 0.6, cy, 2.8, '#ff3a8a'); circ(cx + dir * 0.9, cy - 0.4, 1.1, '#fff'); break; }
    // Flyers: kite, cube-bug beetle, bullet.
    case E.FLYER: { var fl = Math.sin(f * 0.4) * 4;   // kite: coral diamond with a ribbon tail and flapping fins
      line(cx - dir * 6, cy, cx - dir * 11, cy + 4 + Math.sin(f * 0.3) * 2, '#ff9ab0', 1.5); line(cx - dir * 11, cy + 4 + Math.sin(f * 0.3) * 2, cx - dir * 15, cy + 1, '#ff9ab0', 1.5);
      poly([cx, cy - 2, cx - 11, cy - 7 - fl, cx - 6, cy + 1], '#ffd0dc', '#a02a50'); poly([cx, cy - 2, cx + 11, cy - 7 - fl, cx + 6, cy + 1], '#ffd0dc', '#a02a50');
      diamond(cx, cy, 6.5, 7, '#ff5a7a', '#6a0a2a'); circ(cx + dir * 0.8, cy - 0.5, 2.6, '#fff'); circ(cx + dir * 1.6, cy - 0.3, 1.2, '#2a0a1a');
      if (e.spk) { poly([cx - 4, cy - 5, cx - 2, cy - 11, cx, cy - 6], '#c8d0e0', '#2a3048'); poly([cx, cy - 6, cx + 2, cy - 12, cx + 4, cy - 5], '#c8d0e0', '#2a3048'); }   // spiked flyer: cannot be stomped, only frozen
      break; }
    case E.BEETLE: {   // cube-bug: a boxy bug; when stomped it leaves a glowing cube that can be kicked or carried
      if (e.sh && e.bomb) { circ(cx, by - 5, 6, e.sh === 2 ? '#ff7a4a' : '#2a2a3a'); circ(cx - 1.5, by - 6.5, 1.8, 'rgba(255,255,255,.3)'); line(cx, by - 10, cx + 2, by - 14, '#8a6a3a', 1.5); circ(cx + 2, by - 14.5, 1.6 + Math.sin(f * 0.8), '#ffd24a'); break; }
      if (e.sh) { var ec = e.sh === 2 ? 'hsl(' + (F * 20 % 360) + ',80%,60%)' : '#ffb04a'; crystalBox(cx, by - 5, 8, ec); if (e.sh === 2) { ctx.globalAlpha = 0.45; poly([cx - e.dir * 8, by - 8, cx - e.dir * 17, by - 5, cx - e.dir * 8, by - 2], '#ffe0a0'); ctx.globalAlpha = 1; } break; }
      var s3 = Math.sin(f * 0.22 + e.x); rrect(cx - 6.5, by - 12, 13, 10, 3, '#3ac07a'); rect(cx - 6.5, by - 12, 13, 3, '#8affc0'); line(cx - 6.5, by - 7, cx + 6.5, by - 7, '#14663e', 1);
      line(cx + dir * 3, by - 12, cx + dir * 5, by - 16, '#8affc0', 1.5); circ(cx + dir * 5, by - 16, 1.5, '#ffe08a'); circ(cx + dir * 2.5, by - 8.5, 2.3, '#fff'); circ(cx + dir * 3.2, by - 8.4, 1.1, '#0a3020'); rect(cx - 5 + s3 * 1.5, by - 2, 3.5, 2, '#14663e'); rect(cx + 1.5 - s3 * 1.5, by - 2, 3.5, 2, '#14663e'); break; }
    case E.BULLET: { poly([cx - e.dir * 3, e.y + 5, cx - e.dir * 12, e.y + 1 + Math.sin(f) * 1.5, cx - e.dir * 10, e.y + 5, cx - e.dir * 12, e.y + 9 - Math.sin(f) * 1.5], '#a0ff4a'); circ(cx + e.dir * 1, e.y + 5, 5, '#e8ffb0'); circ(cx + e.dir * 1, e.y + 5, 3, '#6ad020'); circ(cx + e.dir * 1.6, e.y + 4.4, 1.1, '#fff'); break; }
    // Crusher block.
    case E.CRUSH: { var ang = e.s === 1; poly([e.x + 3, e.y, e.x + e.w - 3, e.y, e.x + e.w, e.y + 5, e.x + e.w, e.y + e.h - 4, e.x + e.w - 4, e.y + e.h, e.x + 4, e.y + e.h, e.x, e.y + e.h - 4, e.x, e.y + 5], '#3a3452', '#9a8ac8');
      line(e.x + 5, e.y + 4, e.x + 9, e.y + 11, 'rgba(154,138,200,.7)'); line(e.x + e.w - 5, e.y + 4, e.x + e.w - 9, e.y + 12, 'rgba(154,138,200,.7)');
      rect(e.x + 4, e.y + 9, e.w - 8, 3.5, ang ? '#ff4a3a' : '#ff9a4a'); for (var k = 0; k < 4; k++) poly([e.x + 2 + k * 5.5, e.y + e.h, e.x + 4.7 + k * 5.5, e.y + e.h + (ang ? 6 : 4), e.x + 7.4 + k * 5.5, e.y + e.h], ang ? '#ff4a3a' : '#ff9a4a'); break; }
    // Ghost (fades / wobbles).
    case E.GHOST: { var wob = Math.sin(f * 0.15 + e.x) * 1.5, tx = -e.dir * 1; ctx.globalAlpha = 0.9;   // wisp: teardrop of pale light with a ring eye
      poly([cx + tx * 9, cy + 8 + wob, cx - 6, cy - 1 + wob, cx + 6, cy - 1 + wob], '#9afff0'); ctx.fillStyle = '#d8fffa'; ctx.beginPath(); ctx.arc(cx, cy - 2 + wob, 7, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#146a70'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx + dir * 1.2, cy - 2.5 + wob, 3.2, 0, 6.2832); ctx.stroke(); circ(cx + dir * 1.8, cy - 2.5 + wob, 1.2, '#146a70'); break; }
    // Spore-bud plant that rises and hides.
    case E.PLANT: { if (e.y > e.y0 - 1 && e.hid) break; var top = e.y;   // spore bud on a pylon
      line(cx, top + 8, cx, e.y0 + 6, '#3affb0', 2); spark8(cx, top + 6, 6.5, '#ff3a8a', f * 0.03); circ(cx, top + 6, 3.2, '#ffd0e4'); circ(cx, top + 6, 1.4, '#6a0a2a'); break; }
    case E.ROLL: drawRoller(e); break;
    case E.LANDMINE: { if (e.s === 1) { ctx.globalAlpha = Math.max(0, e.tm / 10); circ(cx, cy, 10 + (10 - e.tm) * 1.4, '#ffd24a'); circ(cx, cy, 5 + (10 - e.tm), '#fff'); ctx.globalAlpha = 1; break; }   // buried mine: a half-sunk disc with a blinking light, easy to see and step around
      ell(cx, by - 1, 8, 3.6, '#5a5a6a'); ell(cx, by - 2, 6.5, 2.6, '#7a7a8a'); circ(cx, by - 3.6, 1.7, (Math.floor(f / 12) % 2) ? '#ff4a4a' : '#7a1a1a'); rect(cx - 5, by - 2, 2, 1.4, '#3a3a48'); rect(cx + 3, by - 2, 2, 1.4, '#3a3a48'); break; }
    case E.PILLBUG: { var pdr = e.dir >= 0 ? 1 : -1;   // pillbug: an armoured oval with legs; curls (flashes) before it rolls as a ball
      if (e.s === 0) { var lg = Math.sin(f * 0.4 + e.x) * 1.4; for (var pl = 0; pl < 3; pl++) line(cx - 5 + pl * 5, by - 2, cx - 6 + pl * 5 + lg * (pl % 2 ? 1 : -1), by + 1, '#3a3050', 1.2); ell(cx, by - 5, 8, 5, '#6a6a90'); for (var ps = 0; ps < 3; ps++) line(cx - 4 + ps * 4, by - 9, cx - 4 + ps * 4, by - 1, 'rgba(20,10,50,.5)', 1); circ(cx + pdr * 6, by - 5, 2.6, '#8a8ab0'); circ(cx + pdr * 7, by - 5.4, 1, '#fff'); }
      else { var fl2 = e.s === 1 && (Math.floor(f / 3) % 2); ctx.save(); ctx.translate(cx, by - 5); ctx.rotate(e.rot || 0); circ(0, 0, 6.5, fl2 ? '#ffb0b0' : '#6a6a90'); for (var pr = 0; pr < 3; pr++) { ctx.rotate(1.0472); line(0, -6, 0, 6, 'rgba(20,10,50,.55)', 1); } ctx.restore(); }
      break; }
    case E.HOPPER: { var hdr = e.dir >= 0 ? 1 : -1, air2 = !e.ground;   // hopper: a green grasshopper; stretched while airborne
      var hy = air2 ? by - 9 : by - 6; ell(cx, hy, air2 ? 8 : 6.5, air2 ? 4 : 4.6, '#6ac84a'); line(cx - hdr * 3, hy + 1, cx - hdr * (air2 ? 11 : 7), hy + (air2 ? 4 : 2), '#3a7a22', 2); line(cx - hdr * (air2 ? 11 : 7), hy + (air2 ? 4 : 2), cx - hdr * (air2 ? 14 : 4), by, '#3a7a22', 2); circ(cx + hdr * 5, hy - 1.5, 2.4, '#fff'); circ(cx + hdr * 5.8, hy - 1.5, 1, '#102010'); line(cx + hdr * 4, hy - 3, cx + hdr * 8, hy - 7, '#3a7a22', 1); break; }
    case E.MOLE: { var gy2 = e.y0 + e.h; ctx.save(); ctx.beginPath(); ctx.rect(e.x - 10, gy2 - 40, e.w + 20, 40); ctx.clip();   // mole: a dirt mound (it shakes before the mole pops up) and a velvety head with a pink nose
      if (e.s === 1) { var sh3 = Math.sin(f * 1.4) * 1.5; ell(cx + sh3, gy2, 9, 4, '#8a5a30'); for (var mr = 0; mr < 3; mr++) circ(cx + sh3 - 4 + mr * 4, gy2 - 3 - (f + mr * 5) % 6, 1.2, '#b07a4a'); }
      else if (e.s === 0) { ell(cx, gy2, 7, 2.5, '#8a5a30'); }
      else if (!e.hid || e.up > 0) { ell(cx, gy2, 10, 3, '#8a5a30'); rrect(e.x, e.y, e.w, e.h + 3, 5, '#5a4a60'); circ(cx, e.y + 5, 2.6, '#ff9ab0'); circ(cx - 3.4, e.y + 2.6, 1.1, '#fff'); circ(cx + 3.4, e.y + 2.6, 1.1, '#fff'); line(cx - 7, e.y + 9, cx - 11, e.y + 5, '#c8b8d0', 1.5); line(cx + 7, e.y + 9, cx + 11, e.y + 5, '#c8b8d0', 1.5); }
      ctx.restore(); break; }
    case E.SHIELDER: { var sdr = e.dir >= 0 ? 1 : -1, s35 = Math.sin(f * 0.25 + e.x);   // shield bearer: a round bug carrying a big metal shield in front
      circ(cx - sdr * 1, by - 6, 6.5, '#9a5a7a'); circ(cx - sdr * 1 + sdr * 1.5, by - 8, 2.2, '#fff'); circ(cx - sdr * 1 + sdr * 2.2, by - 8, 1, '#201020'); rect(cx - 5 + s35, by - 2, 3, 2, '#4a2a3a'); rect(cx + 2 - s35, by - 2, 3, 2, '#4a2a3a');
      rrect(cx + sdr * 6 - 3, by - 14, 6, 14, 2, '#aab4c8'); rect(cx + sdr * 6 - 1, by - 13, 2, 12, '#e8f0ff'); break; }
    case E.BOMBBUG: { var fz = e.s === 1, fl3 = fz && (Math.floor(f / 3) % 2), grow = fz ? 1 + e.tm / 48 * 0.35 : 1;   // bomb bug: a black round bug with a lit fuse; it flashes red as the fuse runs down
      ctx.save(); ctx.translate(cx, by - 6); ctx.scale(grow, grow); circ(0, 0, 6.5, fl3 ? '#ff5a4a' : '#2a2a3a'); circ(-2, -2, 2, 'rgba(255,255,255,.25)'); circ(2.5, -0.5, 2, '#fff'); circ(3, -0.3, 0.9, '#201010'); ctx.restore();
      line(cx, by - 12 * grow, cx + 2, by - 16 * grow, '#8a6a3a', 1.5); circ(cx + 2, by - 16.5 * grow, 1.6 + Math.sin(f * 0.8), '#ffd24a'); break; }
    case E.BAT: { var hanging = e.s === 0, wb = Math.sin(f * 0.6) * 5;   // bat: hangs upside down (wings folded), flaps when it swoops
      if (hanging) { line(cx, e.y - 3, cx, e.y + 2, '#3a2a4a', 1); ell(cx, cy + 2, 4, 6, '#4a3a60'); poly([cx - 3, cy + 6, cx, cy + 12, cx + 3, cy + 6], '#6a5a88'); circ(cx - 1.4, cy + 8, 0.8, '#ff6a6a'); circ(cx + 1.4, cy + 8, 0.8, '#ff6a6a'); }
      else { ell(cx, cy, 4, 3.6, '#4a3a60'); poly([cx - 2, cy - 1, cx - 12, cy - 4 - wb, cx - 7, cy + 4], '#6a5a88'); poly([cx + 2, cy - 1, cx + 12, cy - 4 - wb, cx + 7, cy + 4], '#6a5a88'); circ(cx - 1.4, cy - 0.5, 0.9, '#ff6a6a'); circ(cx + 1.4, cy - 0.5, 0.9, '#ff6a6a'); }
      break; }
    case E.STORMCLOUD: { var fl4 = (Math.floor(f / 5) % 7 === 0);   // storm cloud: a dark cloud with a crackling flash and rain streaks
      ctx.globalAlpha = 0.95; circ(cx - 8, cy + 1, 7, '#4a5068'); circ(cx + 2, cy - 2, 9, '#5a6078'); circ(cx + 11, cy + 1, 7, '#4a5068'); rect(cx - 14, cy + 1, 28, 6, '#4a5068'); ctx.globalAlpha = 1;
      for (var rn = 0; rn < 4; rn++) line(cx - 8 + rn * 6, cy + 8 + (f * 3 + rn * 7) % 8, cx - 9 + rn * 6, cy + 11 + (f * 3 + rn * 7) % 8, 'rgba(180,200,255,.7)', 1);
      if (fl4) { poly([cx, cy + 6, cx - 3, cy + 12, cx, cy + 12, cx - 2, cy + 18], '#fff27a'); } break; }
    case E.HORNET: { var hs = e.s, hw2 = Math.sin(f * (hs === 2 ? 1.2 : 0.8)) * 4, hd3 = e.dir >= 0 ? 1 : -1, hf = hs === 1 && (Math.floor(f / 3) % 2);   // hornet: yellow and black stripes, buzzing wings; flashes white while it charges
      ctx.globalAlpha = 0.6; poly([cx - 1, cy - 2, cx - 9, cy - 8 - hw2, cx - 4, cy - 1], '#e8f8ff'); poly([cx + 2, cy - 2, cx + 8, cy - 8 - hw2, cx + 4, cy - 1], '#e8f8ff'); ctx.globalAlpha = 1;
      ell(cx, cy, 7, 4.4, hf ? '#ffffff' : '#ffd24a'); for (var hb = 0; hb < 3; hb++) rect(cx - 4 + hb * 3, cy - 3.6, 1.6, 7.2, '#2a2010'); poly([cx - hd3 * 6, cy, cx - hd3 * 10, cy + 1, cx - hd3 * 6, cy + 2], '#2a2010'); circ(cx + hd3 * 5, cy - 1, 2, '#fff'); circ(cx + hd3 * 5.6, cy - 1, 0.9, '#201010'); break; }
    case E.BOMBER: { var bwv = Math.sin(f * 0.1 + e.x) * 1;   // bomber: a little balloon with a basket full of bombs
      ell(cx, cy - 4 + bwv, 10, 8, '#d8584a'); for (var bs = -1; bs <= 1; bs++) line(cx + bs * 4, cy - 11 + bwv, cx + bs * 3, cy + 3 + bwv, 'rgba(120,20,10,.5)', 1); line(cx - 6, cy + 3 + bwv, cx - 4, cy + 7, '#6a4a2a', 1); line(cx + 6, cy + 3 + bwv, cx + 4, cy + 7, '#6a4a2a', 1); rect(cx - 5, cy + 7, 10, 5, '#9a6a3a'); circ(cx - 2, cy + 7, 2, '#2a2a3a'); circ(cx + 2, cy + 7, 2, '#2a2a3a'); break; }
    case E.SPIDER: { var anc = e.ay0 - 8; line(cx, anc, cx, e.y + 3, 'rgba(240,240,255,.6)', 1);   // rope spider: hangs on a silk thread from the ceiling
      circ(cx, cy + 1, 5, '#3a2a48'); circ(cx, cy - 2, 3.4, '#4a3a5a'); for (var sl = -1; sl <= 1; sl += 2) for (var sj = 0; sj < 3; sj++) line(cx + sl * 3, cy + sj * 2 - 1, cx + sl * (8 + sj), cy + sj * 3 + Math.sin(f * 0.4 + sj) * 1.5, '#3a2a48', 1.2); circ(cx - 1.5, cy - 2.6, 0.9, '#ff6a6a'); circ(cx + 1.5, cy - 2.6, 0.9, '#ff6a6a'); break; }
    case E.FLOUNDER: { var fdx = e.dir >= 0 ? 1 : -1, wob = Math.sin(f * 0.25 + e.ph * 6) * 1;   // flounder: a flat, mottled fish creeping along the seabed with both eyes on top
      ell(cx, cy + 1, 11, 3.6, '#9a8a5a'); ell(cx, cy, 10, 3.2, '#c0b078'); for (var fs = 0; fs < 4; fs++) circ(cx - 6 + fs * 4, cy + (fs % 2 ? 0.8 : -0.6), 1, '#7a6a3a'); poly([cx - fdx * 10, cy, cx - fdx * 15, cy - 3 + wob, cx - fdx * 15, cy + 3 + wob], '#9a8a5a');
      circ(cx + fdx * 6, cy - 3.2, 1.6, '#fff'); circ(cx + fdx * 3.5, cy - 3.4, 1.6, '#fff'); circ(cx + fdx * 6.4, cy - 3.2, 0.7, '#102030'); circ(cx + fdx * 3.9, cy - 3.4, 0.7, '#102030'); break; }
    case E.GULL: { var gdx2 = e.dir >= 0 ? 1 : -1, wf = Math.sin(f * (e.s === 2 ? 0.7 : 0.4)) * 5;   // gull: a white seabird; flaps harder when it bolts
      poly([cx - 2, cy, cx - 11, cy - 5 - wf, cx - 6, cy + 2], '#f4f4fa', '#8a90a8'); poly([cx + 2, cy, cx + 11, cy - 5 - wf, cx + 6, cy + 2], '#f4f4fa', '#8a90a8'); ell(cx, cy + 1, 6, 3.6, '#fff'); circ(cx + gdx2 * 5, cy - 1, 2.6, '#fff'); circ(cx + gdx2 * 6, cy - 1.4, 0.8, '#102030'); poly([cx + gdx2 * 7, cy - 1, cx + gdx2 * 11, cy, cx + gdx2 * 7, cy + 0.8], '#ff9a2a'); break; }
    case E.THROWER: { var sk2 = e.skin, bobT = e.fly ? Math.sin(f * 0.2 + e.ph) * 1.5 : 0, bdy = by - 14 + bobT, tcol = sk2 === 'wrench' ? '#5aa0b0' : sk2 === 'fire' ? '#e0502a' : '#e8f4ff', tdk = sk2 === 'wrench' ? '#1a4a58' : sk2 === 'fire' ? '#6a1a04' : '#5a8ab0';   // a thrower: wrench bot (teal robot), fire spitter (red), snowman (white)
      if (e.fly) { poly([cx - 4, bdy + 6, cx - 14, bdy - 2 + Math.sin(f * 0.5) * 4, cx - 7, bdy + 10], '#f4f0ff', '#8a7ac0'); poly([cx + 4, bdy + 6, cx + 14, bdy - 2 + Math.sin(f * 0.5) * 4, cx + 7, bdy + 10], '#f4f0ff', '#8a7ac0'); }
      if (sk2 === 'snow') { circ(cx, bdy + 9, 6.5, tcol); circ(cx, bdy + 2, 4.6, tcol); circ(cx + dir * 1.6, bdy + 1.2, 1, '#102030'); circ(cx - dir * 0.8, bdy + 1.2, 1, '#102030'); poly([cx + dir * 2, bdy + 3, cx + dir * 7, bdy + 4, cx + dir * 2, bdy + 4.6], '#ff8a2a'); rect(cx - 4, bdy - 3, 8, 2.4, '#3a4a8a'); }
      else { rrect(cx - 6, bdy + 3, 12, 11, 3, tcol); rect(cx - 6, bdy + 3, 12, 3, tdk); circ(cx + dir * 2.4, bdy + 6, 2.4, '#fff'); circ(cx + dir * 3.2, bdy + 6.2, 1.1, '#101010'); if (sk2 === 'wrench') { line(cx, bdy + 3, cx, bdy - 3, '#2a3a40', 1.5); circ(cx, bdy - 4, 2, '#ffd24a'); rect(cx - 5, bdy + 5, 10, 3, '#0a2a30'); circ(cx + dir * 2.5, bdy + 6.5, 1.2, '#7affea'); line(cx + dir * 6, bdy + 12, cx + dir * 6, bdy + 3, '#8a94a8', 2); circ(cx + dir * 6, bdy + 2, 3, '#aab4c8'); } else { poly([cx - 3, bdy + 3, cx, bdy - 6, cx + 3, bdy + 3], '#ffb02a'); circ(cx + dir * 7, bdy + 8, 2.4 + Math.sin(f * 0.4), '#ffd24a'); } }
      break; }
    case E.BIGBALL: { var bw = e.w, bh = e.h, bdx = e.dir >= 0 ? 1 : -1, bx0 = e.x, by0 = e.y, bcx = bx0 + bw / 2, bcy = by0 + bh / 2 + 2;   // giant cannonball: a riveted iron sphere with a jet flame behind it; the flat steel cap on top is the riding surface
      ctx.globalAlpha = 0.55; poly([bcx - bdx * 14, bcy - 6, bcx - bdx * 34 - Math.sin(F * 0.7) * 4, bcy, bcx - bdx * 14, bcy + 6], '#ff9a3a'); ctx.globalAlpha = 0.9; poly([bcx - bdx * 14, bcy - 3, bcx - bdx * 24 - Math.sin(F * 0.9) * 3, bcy, bcx - bdx * 14, bcy + 3], '#ffe08a'); ctx.globalAlpha = 1;
      circ(bcx, bcy, 15, '#2a2e3a'); circ(bcx - 3, bcy - 3, 11, '#4a5062'); circ(bcx - 6, bcy - 6, 4, '#8a94a8');
      for (var rv = 0; rv < 8; rv++) { var ra = rv * 0.7854 + 0.3; circ(bcx + Math.cos(ra) * 11, bcy + Math.sin(ra) * 11, 1.3, '#aab4c8'); }
      ctx.strokeStyle = '#1a1e28'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bcx, bcy, 8, 0.4, 2.6); ctx.stroke();
      rect(bcx - 11, by0 - 1, 22, 4, '#c8ccd8'); rect(bcx - 11, by0 - 1, 22, 1.5, '#ffffff'); break; }
    // Underwater enemies: squid, strider, puffer, eel, swimmers.
    case E.SQUID: { var sq = e.s === 1, pu2 = sq ? 3 : 0, tw = Math.sin(f * 0.3 + e.id) * 1.5; ctx.fillStyle = sq ? '#ff7ab0' : '#e0509a'; ctx.beginPath(); ctx.ellipse(cx, cy - 2, 6 - pu2 * 0.4, 8 + pu2 * 0.6, 0, 0, 6.2832); ctx.fill(); poly([cx - 6, cy - 5, cx, cy - 15, cx + 6, cy - 5], '#c03a80');
      for (var tq = -2; tq <= 2; tq++) { ctx.strokeStyle = '#ff9ac8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx + tq * 2.2, cy + 5); ctx.lineTo(cx + tq * 2.6 + tw * (tq % 2 ? 1 : -1), cy + 10 + (sq ? 3 : 0)); ctx.stroke(); }
      circ(cx - 2.5, cy - 3, 2.2, '#fff'); circ(cx + 2.5, cy - 3, 2.2, '#fff'); circ(cx - 2.3, cy - 2.8, 1, '#1a0a30'); circ(cx + 2.7, cy - 2.8, 1, '#1a0a30'); break; }
    case E.STRIDER: { var lg = Math.sin(f * 0.4 + e.id) * 2; ctx.strokeStyle = '#2a4a3a'; ctx.lineWidth = 1.3; for (var lq = -1; lq <= 1; lq += 2) { line(cx + lq * 3, cy + 1, cx + lq * 9 + lg * lq, cy + 6, '#2a4a3a', 1.3); line(cx + lq * 2, cy + 2, cx + lq * 7 - lg * lq, cy + 7, '#2a4a3a', 1.3); }
      ell(cx, cy, 5.5, 3.6, e.s === 1 ? '#ff6a4a' : '#7ad040'); ell(cx - 1, cy - 1, 3, 1.4, 'rgba(255,255,255,.3)'); circ(cx + dir * 3.2, cy - 1, 1.7, '#fff'); circ(cx + dir * 3.6, cy - 1, 0.8, '#102010'); line(cx + dir * 4, cy - 3, cx + dir * 7, cy - 6, '#2a4a3a', 1); break; }
    case E.PUFFER: { var iF = e.inf || 0, rr2 = e.w / 2; ctx.fillStyle = iF > 0.4 ? '#ffb04a' : '#e0c050'; ctx.beginPath(); ctx.ellipse(cx, cy, rr2, e.h / 2, 0, 0, 6.2832); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + e.h * 0.2, rr2 * 0.7, e.h * 0.2, 0, 0, 6.2832); ctx.fill();
      if (iF > 0.35) for (var sp2 = 0; sp2 < 10; sp2++) { var an2 = sp2 * 0.6283; poly([cx + Math.cos(an2 - 0.15) * rr2, cy + Math.sin(an2 - 0.15) * e.h / 2, cx + Math.cos(an2) * (rr2 + 5), cy + Math.sin(an2) * (e.h / 2 + 5), cx + Math.cos(an2 + 0.15) * rr2, cy + Math.sin(an2 + 0.15) * e.h / 2], '#7a4a0a'); }
      poly([cx - dir * rr2 * 0.8, cy, cx - dir * (rr2 + 5), cy - 3, cx - dir * (rr2 + 5), cy + 3], '#c09a30'); circ(cx + dir * rr2 * 0.45, cy - 1.5, 2.2, '#fff'); circ(cx + dir * rr2 * 0.55, cy - 1.5, 1, '#201000'); break; }
    case E.EEL: { var zap = e.s === 2, chg = e.s === 1, bl = e.w; ctx.strokeStyle = '#2a3a2a'; ctx.lineWidth = 5; ctx.beginPath(); for (var ek = 0; ek <= 12; ek++) { var ex = e.x + ek * bl / 12, ey = cy + Math.sin(f * 0.15 + ek * 0.7) * 2.5; if (ek) ctx.lineTo(ex, ey); else ctx.moveTo(ex, ey); } ctx.stroke();
      ctx.strokeStyle = zap ? '#fff27a' : chg ? '#c8f0a0' : '#5a7a4a'; ctx.lineWidth = 2.2; ctx.beginPath(); for (var ek2 = 0; ek2 <= 12; ek2++) { var ex2 = e.x + ek2 * bl / 12, ey2 = cy + Math.sin(f * 0.15 + ek2 * 0.7) * 2.5; if (ek2) ctx.lineTo(ex2, ey2); else ctx.moveTo(ex2, ey2); } ctx.stroke();
      circ(e.x + 2, cy, 4.2, '#3a4a3a'); circ(e.x + 1, cy - 1, 1.6, '#fff'); circ(e.x + 1, cy - 1, 0.7, '#102010');
      if (zap || chg) for (var zk = 0; zk < (zap ? 9 : 3); zk++) { var zx = e.x + ((zk * 41 + f * 5) % bl); spark4(zx, cy + ((zk * 7 + f) % 9) - 4, zap ? 5 : 3, zap ? '#fff27a' : '#c8f0a0'); } break; }
    case E.SWIM: { if (e.pz) { ctx.globalAlpha = 0.9; circ(cx, cy, 9, 'rgba(176,74,255,.35)'); ctx.globalAlpha = 1; } var big = e.sz === 1, wag = Math.sin(f * 0.3 + e.x * 0.1) * 2.5, bw = big ? 11 : 6, bh = big ? 6 : 4;
      poly([cx - dir * bw * 0.8, cy, cx - dir * (bw + 6), cy - 4 - wag, cx - dir * (bw + 6), cy + 4 - wag], big ? (e.pzn ? '#6a2aa0' : '#2a3ac0') : (e.pzn ? '#9a4ae0' : '#4a6aff')); ell(cx, cy, bw, bh, big ? (e.pzn ? '#8a3ad0' : '#3a4ae0') : (e.pzn ? '#b06aff' : '#5a7aff')); ell(cx, cy + bh * 0.3, bw * 0.8, bh * 0.5, 'rgba(255,255,255,.25)');
      if (big) { poly([cx - 3, cy - bh, cx + 1, cy - bh - 4, cx + 4, cy - bh], '#9ab0ff'); line(cx - dir * 2, cy - bh + 1, cx - dir * 2, cy + bh - 1, 'rgba(255,255,255,.35)'); }
      circ(cx + dir * bw * 0.5, cy - 0.5, big ? 2.6 : 2, '#fff'); circ(cx + dir * bw * 0.6, cy - 0.5, big ? 1.2 : 1, '#0a1040'); break; }
    // Chaser, floating mine, whale.
    case E.CHASER: { var ag = e.s === 1; poly([cx + dir * 8, cy, cx - dir * 5, cy - 5, cx - dir * 5, cy + 5], ag ? '#ff4a2a' : '#ff8a5a', '#6a1004'); poly([cx - dir * 5, cy, cx - dir * 11, cy - 4, cx - dir * 11, cy + 4], ag ? '#ff9a6a' : '#ffb090'); line(cx + dir * 1, cy - 3.5, cx + dir * 6, cy - 1.5, '#200', 1.5); circ(cx + dir * 3, cy, ag ? 2.2 : 1.8, '#fff'); circ(cx + dir * 3.6, cy, 1, ag ? '#c00' : '#200'); break; }
    case E.FMINE: { ctx.save(); ctx.translate(cx, cy); ctx.rotate(f * 0.02); for (var m1 = 0; m1 < 6; m1++) { ctx.rotate(Math.PI / 3); poly([-2.6, -6, 0, -11.5, 2.6, -6], '#ff3a8a', '#ffd0e4'); } ctx.restore(); hex(cx, cy, 6.6, '#1c1030', 0.5); hex(cx, cy, 6.6, 'rgba(255,58,138,.2)', 0.5); circ(cx, cy, 2.4 + (Math.sin(f * 0.15) > 0.5 ? 0.8 : 0), Math.sin(f * 0.15) > 0.5 ? '#fff' : '#ff3a8a'); break; }
    case E.WHALE: { var wg = Math.sin(f * 0.08) * 2; poly([cx - dir * 20, cy, cx - dir * 32, cy - 9 + wg, cx - dir * 32, cy + 9 - wg], '#4a3ac0'); ell(cx, cy, 22, 10, '#6a5ae0'); ell(cx, cy + 3, 18, 5, '#b8a8ff'); poly([cx - 4, cy - 9, cx + 2, cy - 15, cx + 8, cy - 9], '#4a3ac0');
      circ(cx + dir * 12, cy - 3, 3.2, '#fff'); circ(cx + dir * 12.8, cy - 3, 1.5, '#1a1050'); ctx.fillStyle = '#1a0a30'; ctx.beginPath(); ctx.arc(cx + dir * 20, cy + 2, 6, dir > 0 ? -1.2 : Math.PI - 1.9 + 0.7, dir > 0 ? 1.2 : Math.PI + 1.2); ctx.fill();
      for (var tt = 0; tt < 3; tt++) poly([cx + dir * (16 + tt * 2), cy - 2 + tt * 3, cx + dir * (19 + tt * 2), cy + 0 + tt * 3, cx + dir * (16 + tt * 2), cy + 2 + tt * 3], '#ff3a8a'); break; }
    // Jellyfish and clam.
    case E.JELLY: { var pu = e.pul || 0, jw = e.w * (0.7 + 0.3 * pu) / 2, jh = e.h * 0.55; ctx.fillStyle = 'rgba(255,90,200,.8)'; ctx.beginPath(); ctx.ellipse(cx, e.y + jh, jw, jh, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#ffd0f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, e.y + jh, jw, jh, 0, Math.PI, 0); ctx.stroke(); line(cx - jw * 0.5, e.y + jh, cx - jw * 0.3, e.y + 3, 'rgba(255,255,255,.5)'); line(cx + jw * 0.4, e.y + jh, cx + jw * 0.2, e.y + 3, 'rgba(255,255,255,.5)');
      ctx.strokeStyle = '#ff6ac8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, e.y + jh); for (var z = 1; z <= 5; z++) ctx.lineTo(cx + Math.sin(f * 0.15 + z) * 3, e.y + jh + z * 3.6); ctx.stroke(); circ(cx, e.y + jh + 18, 1.6, '#fff'); break; }
    case E.CLAM: { var op = e.s === 1, gape = op ? 6 : 0; poly([e.x, by, e.x + e.w, by, e.x + e.w - 2, by - 5, e.x + 2, by - 5], '#8a5ae0', '#2a1070'); ctx.save(); ctx.translate(e.x + 2, by - 5); ctx.rotate(op ? -0.7 : 0); poly([0, 0, e.w - 4, 0, e.w - 6, -6, 2, -6], '#a88aff', '#2a1070'); ctx.restore(); if (op && !e.pg) { circ(cx, by - 6, 3.4, '#fff'); circ(cx - 0.8, by - 6.8, 1.2, '#bff'); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(F * 0.2); circ(cx, by - 6, 6, '#ffffff'); ctx.globalAlpha = 1; } else rect(e.x + 3, by - 6, e.w - 6, 1.2, '#ff3a8a'); break; }
    // Air enemies: swooping birds, flock, balloon.
    case E.SWOOP: { var sw = e.s === 1 ? 0 : Math.sin(f * 0.35) * 4; poly([cx - 3, cy, cx - 12, cy - 5 - sw, cx - 7, cy + 2], '#e8fbff', '#2a7aa0'); poly([cx + 3, cy, cx + 12, cy - 5 - sw, cx + 7, cy + 2], '#e8fbff', '#2a7aa0'); poly([cx - 5, cy - 4, cx + 5, cy - 4, cx, cy + 6], '#4ac8ff', '#0a4a70'); circ(cx, cy - 1.5, 2.4, '#fff'); circ(cx + (e.dir || 1) * 0.6, cy - 1.3, 1.1, '#021a2a'); if (e.s === 1) line(cx, cy - 4, cx - (e.dir || 1) * 6, cy - 14, 'rgba(255,255,255,.5)', 1.5); break; }
    case E.FLOCK: { var fw = Math.sin(f * 0.4 + e.idx) * 2.5; poly([cx, cy + 2, cx - 6, cy - 3 - fw, cx - 4, cy + 1], '#b8ff6a', '#4a7a08'); poly([cx, cy + 2, cx + 6, cy - 3 - fw, cx + 4, cy + 1], '#b8ff6a', '#4a7a08'); circ(cx, cy + 1, 2.2, '#7aff3a'); circ(cx + dir * 0.6, cy + 0.8, 0.9, '#10300a'); break; }
    case E.BALLOON: { for (var b1 = 0; b1 < 8; b1++) { var ba = b1 * Math.PI / 4 + f * 0.02; poly([cx + Math.cos(ba - 0.2) * 8, cy - 2 + Math.sin(ba - 0.2) * 8, cx + Math.cos(ba) * 12.5, cy - 2 + Math.sin(ba) * 12.5, cx + Math.cos(ba + 0.2) * 8, cy - 2 + Math.sin(ba + 0.2) * 8], '#ff3a8a'); } ell(cx, cy - 2, 8, 9, '#ffb0e0'); ell(cx - 2.5, cy - 5, 2.2, 3, 'rgba(255,255,255,.6)'); poly([cx - 2, cy + 7, cx + 2, cy + 7, cx, cy + 10], '#c02a80'); line(cx, cy + 10, cx + Math.sin(f * 0.1) * 2, cy + 17, '#ffd0e4', 1); break; }
    // Turret that fires shots.
    case E.SHOOTER: { var ds = e.dir || 1; hex(cx, cy, 8.5, '#2a2450', Math.PI / 6); hex(cx, cy, 6.6, '#4a3f86', Math.PI / 6); poly([cx + ds * 11, cy, cx + ds * 3, cy - 4, cx + ds * 3, cy + 4], '#ff8a3a'); circ(cx - ds * 1, cy, 2.2, ((f + e.pho) % 130 > 105) ? '#fff' : '#ff8a3a'); poly([cx - 7, cy + 7, cx + 7, cy + 7, cx, cy + 12 + Math.sin(f * 0.3) * 2], 'rgba(122,255,224,.6)'); break; }
    case E.BIRD: { var bw2 = Math.sin(f * 0.3) * 3.5; line(cx, cy + 4, cx, cy + 11, 'rgba(255,255,255,.6)', 1); diamond(cx, cy + 14, 3.5, 4.5, '#2ee6d6', '#0a6a70'); poly([cx - 2, cy, cx - 12, cy - 5 - bw2, cx - 7, cy + 3], '#ffd8b8', '#a04a1a'); poly([cx + 2, cy, cx + 12, cy - 5 - bw2, cx + 7, cy + 3], '#ffd8b8', '#a04a1a'); ell(cx, cy, 6, 4.5, '#ff9a5a'); poly([cx + dir * 5, cy - 1, cx + dir * 9, cy + 0.5, cx + dir * 5, cy + 2], '#ffe08a'); circ(cx + dir * 2, cy - 1.5, 1.6, '#fff'); circ(cx + dir * 2.4, cy - 1.5, 0.8, '#200'); break; }
    // Leaping fish, ember and spark.
    case E.LEAPFISH: { if (e.ride) { var rtl = e.up > 0 ? -0.25 : 0.25; ctx.save(); ctx.translate(cx, cy); ctx.rotate(rtl); ell(0, 0, 13, 7.5, '#d8a22a'); poly([-11, 0, -19, -6, -19, 6], '#d8a22a'); rect(-9, -8, 18, 3, '#ffe9a0'); rect(-9, -8, 18, 1, '#fff6d0'); ell(0, 2, 10, 3.5, 'rgba(255,255,255,.3)'); circ(8, -1.5, 2, '#fff'); circ(8.8, -1.5, 0.9, '#102030'); ctx.restore(); break; }
      var lf = e.poison ? ['#a63ad8', '#e9a6ff', '#4a0e6a'] : ['#1fa6c8', '#9af0ff', '#0c4a68'], tl = e.up > 0 ? -0.5 : 0.5; ctx.save(); ctx.translate(cx, cy); ctx.rotate(tl); ell(0, 0, 8, 4.4, lf[0]); poly([-7, 0, -13, -4.5, -13, 4.5], lf[0]); poly([-1, -4, 3, -8, 4, -3], lf[1]); circ(4, -1, 1.6, '#fff'); circ(4.6, -1, 0.7, '#102030'); ctx.restore(); break; }
    case E.EMBER: { var fl = 0.8 + 0.2 * Math.sin(f * 0.5 + e.x); ctx.globalAlpha = 0.35; circ(cx, cy + (e.up > 0 ? 6 : -6), 9 * fl, '#ff7a1a'); ctx.globalAlpha = 1; poly([cx - 6, cy + 2, cx - 3, cy - 10 * fl, cx, cy - 2, cx + 3, cy - 12 * fl, cx + 6, cy + 2], '#ffb02a'); circ(cx, cy, 6.4, '#ff4a1a'); circ(cx, cy, 4, '#ffd24a'); circ(cx - 1.5, cy - 1.5, 1.4, '#fff4c0'); break; }
    case E.SPARK: { ctx.globalAlpha = 0.5; var sx0 = e.x0, sy0 = e.y0; line(e.x0, e.y0, e.x1, e.y1, '#8a7aff', 1); ctx.globalAlpha = 1; circ(cx, cy, 6, 'rgba(120,255,240,.25)'); circ(cx, cy, 3.6, '#e8fffa'); ctx.strokeStyle = '#7affe8'; ctx.lineWidth = 1.2; for (var k3 = 0; k3 < 4; k3++) { var ak = k3 * Math.PI / 2 + f * 0.25; ctx.beginPath(); ctx.moveTo(cx + Math.cos(ak) * 3, cy + Math.sin(ak) * 3); ctx.lineTo(cx + Math.cos(ak + 0.4) * 6, cy + Math.sin(ak + 0.4) * 6); ctx.lineTo(cx + Math.cos(ak - 0.1) * 9, cy + Math.sin(ak - 0.1) * 9); ctx.stroke(); } break; }
    // Boss.
    case E.BOSS: {
      var fl2 = e.inv > 0 && (Math.floor(e.inv / 4) % 2); ctx.globalAlpha = fl2 ? 0.4 : 1; var v = e.v, ed = e.dir || 1;
      if (v === 0) { var ox = e.x, oy = e.y; poly([ox + 8, oy, ox + 20, oy, ox + 28, oy + 8, ox + 28, oy + 20, ox + 22, oy + 26, ox + 6, oy + 26, ox, oy + 20, ox, oy + 8], '#d8304a', '#4a0a1a'); poly([ox + 8, oy, ox + 20, oy, ox + 14, oy + 11], '#ff7a8a'); poly([ox, oy + 8, ox + 8, oy, ox + 14, oy + 11, ox, oy + 20], '#a01a34'); for (var sp = 0; sp < 3; sp++) poly([ox + 5 + sp * 8, oy, ox + 9 + sp * 8, oy - 8, ox + 13 + sp * 8, oy], '#ffe08a'); }
      else if (v === 3) { var tx = e.x, ty = e.y; poly([cx - 18, cy, cx - 6, cy - 12, cx + 6, cy - 12, cx + 18, cy, cx + 6, cy + 9, cx - 6, cy + 9], '#1a9aa8', '#04343c'); poly([cx - 18, cy, cx - 6, cy - 12, cx, cy], '#6af0e8'); poly([cx - 16, cy, cx - 26, cy + 8 + Math.sin(f * 0.2) * 3, cx - 12, cy + 6], '#0e6a78'); poly([cx + 16, cy, cx + 26, cy + 8 + Math.sin(f * 0.2) * 3, cx + 12, cy + 6], '#0e6a78'); line(cx, cy + 9, cx - (e.dir || 1) * 10, cy + 18 + Math.sin(f * 0.2) * 2, '#1a9aa8', 2); if (e.s === 1) { ctx.globalAlpha = 0.4; poly([cx - (e.dir || 1) * 20, cy - 6, cx - (e.dir || 1) * 34, cy, cx - (e.dir || 1) * 20, cy + 6], '#fff'); ctx.globalAlpha = 1; } }
      else if (v === 4) { var wf = Math.sin(f * 0.25) * 6 * (e.s === 1 ? 0.2 : 1); poly([cx - 3, cy, cx - 22, cy - 8 - wf, cx - 14, cy + 2], '#c8a8ff', '#3a1a80'); poly([cx + 3, cy, cx + 22, cy - 8 - wf, cx + 14, cy + 2], '#c8a8ff', '#3a1a80'); poly([cx - 9, cy - 8, cx + 9, cy - 8, cx + 5, cy + 9, cx - 5, cy + 9], '#6a3ae0', '#220a60'); poly([cx - 9, cy - 8, cx, cy - 8, cx - 2, cy + 2], '#a07aff'); poly([cx + (e.dir || 1) * 8, cy - 1, cx + (e.dir || 1) * 15, cy + 2, cx + (e.dir || 1) * 8, cy + 4], '#ffe08a'); }
      else if (v === 1) { var vy = cy; ctx.save(); ctx.translate(cx, vy); ctx.rotate(f * 0.03); for (var o = 0; o < 4; o++) { ctx.rotate(Math.PI / 2); diamond(0, -20, 3.5, 6, '#ff9ad8'); } ctx.restore(); diamond(cx, vy, 16, 15, '#8a3ae8', '#2a0a60'); poly([cx, vy - 15, cx + 16, vy, cx, vy], '#b88aff'); }
      else { var rx2 = e.x, ry = e.y; poly([rx2 + 4, ry + 2, rx2 + e.w - 2, ry + 2, rx2 + e.w + 1, ry + e.h, rx2 - 1, ry + e.h], '#ff8a1a', '#5a2a04'); poly([rx2 + 4, ry + 2, rx2 + e.w - 2, ry + 2, rx2 + 12, ry + 12], '#ffc46a'); poly([rx2 + 6, ry + 3, rx2 + 10, ry - 9, rx2 + 14, ry + 3], '#f4f0ff'); poly([rx2 + e.w - 14, ry + 3, rx2 + e.w - 10, ry - 9, rx2 + e.w - 6, ry + 3], '#f4f0ff'); if (e.s === 0) circ(cx, ry - 12, 3, '#ff4a2a'); if (e.s === 2) spark4(cx, ry - 10, 5, '#ffe08a'); }
      ell(cx, cy - 2, 7, 5.5, '#fff'); circ(cx + ed * 2, cy - 1.5, 3, '#1a0a30'); circ(cx + ed * 3, cy - 2.8, 1, '#fff'); line(cx - 9, cy - 9, cx + 9, cy - 6.5, 'rgba(20,0,30,.8)', 2);
      if (e.imm) { ctx.globalAlpha = 1; for (var sp = 0; sp < 4; sp++) poly([e.x + 2 + sp * (e.w - 4) / 4, e.y + 1, e.x + 2 + sp * (e.w - 4) / 4 + (e.w - 4) / 8, e.y - 7, e.x + 2 + (sp + 1) * (e.w - 4) / 4, e.y + 1], '#c8d0e0', '#2a3048'); }   // spiked armour: stomping bounces off
      ctx.globalAlpha = 1; for (var hp = 0; hp < 3; hp++) diamond(cx - 8 + hp * 8, e.y - 15, 3.4, 4.4, hp < e.hp ? '#ff4a7a' : '#4a4060'); break; }
  }
  if (e.frz > 0 && e.alive) { var thaw2 = e.frz < 70 && (Math.floor(e.frz / (e.frz < 35 ? 3 : 6)) % 2); ctx.globalAlpha = thaw2 ? 0.4 : 0.75; rrect(e.x - 2, e.y - 2, e.w + 4, e.h + 4, 3, '#bfefff'); ctx.globalAlpha = 0.9; rect(e.x, e.y, 3, e.h - 3, '#ffffff'); ctx.globalAlpha = 1; }   // frozen by a snowball: an ice block
}
// Crystal-shaped box (used for items inside blocks / cube remains).
function crystalBox(cx, cy, r, col) { poly([cx - r, cy - r * 0.5, cx, cy - r, cx + r, cy - r * 0.5, cx + r, cy + r * 0.6, cx, cy + r, cx - r, cy + r * 0.6], col, '#5a3a10'); poly([cx - r, cy - r * 0.5, cx, cy - r, cx, cy, cx - r * 0.0, cy], 'rgba(255,255,255,.5)'); line(cx, cy, cx, cy + r, 'rgba(90,58,16,.6)'); line(cx, cy, cx + r, cy - r * 0.5, 'rgba(90,58,16,.6)'); }
// Power-ups and pickups, by e.k (mushroom, flower, star, ...), with a gentle bob.
function drawItem(e) {
  var cx = e.x + 6, cy = e.y + 6 + Math.sin(F * 0.15) * 0.7;
  if (e.k === 0) { circ(cx, cy, 6.5, '#1aa860'); circ(cx, cy, 5.2, '#4aff9a'); circ(cx - 1.6, cy - 1.8, 1.8, '#d8ffe8'); ctx.strokeStyle = '#0a5a30'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy, 6.5, 2.4, 0.4, 0, 6.2832); ctx.stroke(); }
  else if (e.k === 1) { poly([cx - 6, cy + 6, cx - 5, cy - 2, cx - 2.5, cy + 0.5, cx, cy - 8, cx + 2.5, cy + 0.5, cx + 5, cy - 3, cx + 6, cy + 6], '#ff7a1a', '#7a2a04'); poly([cx - 3, cy + 6, cx, cy - 1, cx + 3, cy + 6], '#ffe08a'); }
  else if (e.k === 10) { rect(cx - 1.5, cy - 1, 3, 9, '#8a94a8'); circ(cx, cy - 4, 5, '#aab4c8'); rect(cx - 1.5, cy - 10, 3, 6, '#3a1a4a'); circ(cx, cy + 8, 2.4, '#aab4c8'); }
  else if (e.k === 11) { for (var ar = 0; ar < 6; ar++) { var aa = ar * 1.0472 + F * 0.03; line(cx, cy, cx + Math.cos(aa) * 7, cy + Math.sin(aa) * 7, '#bfe8ff', 1.6); } circ(cx, cy, 2.4, '#ffffff'); }
  else if (e.k === 2) { poly([cx - 6, cy + 5, cx - 1, cy - 7, cx + 6, cy - 5, cx + 1, cy + 7], '#d8ff6a', '#4a7a08'); line(cx - 3, cy + 4, cx + 3, cy - 4, '#4a7a08'); }
  else if (e.k === 3) spark8(cx, cy, 7, 'hsl(' + (F * 12 % 360) + ',95%,62%)', F * 0.08);
  else if (e.k === 5) { rect(cx - 6, cy - 3, 12, 9, '#c8902a'); rect(cx - 6, cy - 3, 12, 3, '#f0c04a'); rect(cx - 1.5, cy - 1, 3, 4, '#5a3a0a'); }
  else if (e.k === 6) { poly([cx - 7, cy + 5, cx - 5, cy - 3, cx, cy - 6, cx + 5, cy - 3, cx + 7, cy + 5], '#46a8ff'); circ(cx - 2, cy - 1, 1.5, '#e0f0ff'); circ(cx + 2.5, cy, 1.2, '#e0f0ff'); rect(cx - 2.5, cy + 3, 5, 3, '#e8e0d0'); poly([cx + 6, cy - 7, cx + 9, cy - 4, cx + 3, cy - 4], '#ff6a6a'); }
  else if (e.k === 7) { poly([cx - 7, cy + 5, cx - 1, cy - 6, cx + 1, cy - 4, cx - 3, cy + 5], '#2ee6d6', '#0a6a60'); poly([cx + 7, cy + 5, cx + 1, cy - 6, cx - 1, cy - 4, cx + 3, cy + 5], '#2ee6d6', '#0a6a60'); line(cx - 5, cy + 2, cx - 3, cy - 2, '#d8fffa', 1); line(cx + 5, cy + 2, cx + 3, cy - 2, '#d8fffa', 1); }
  else if (e.k === 8) { poly([cx, cy + 3, cx - 9, cy - 5, cx - 3, cy - 1], '#f4f0ff', '#8a7ac0'); poly([cx, cy + 3, cx + 9, cy - 5, cx + 3, cy - 1], '#f4f0ff', '#8a7ac0'); circ(cx, cy + 1, 3, '#ffd24a'); }
  else if (e.k === 9) { circ(cx, cy, 6.5, '#f4f4f8'); circ(cx, cy, 5, '#2a3a6a'); line(cx, cy, cx, cy - 4, '#fff', 1.5); line(cx, cy, cx + 3, cy + 1, '#fff', 1.5); }
  else { ctx.fillStyle = '#7a4ae0'; ctx.beginPath(); ctx.arc(cx, cy + 3, 7, Math.PI, 0); ctx.fill(); line(cx + 4, cy - 1, cx + 8, cy - 6, '#d8c8ff', 1.5); circ(cx + 8, cy - 6, 1.4, '#2ee6d6'); rect(cx - 6, cy + 3, 12, 2, '#4a2a9a'); }
}
// Spinning coin.
function drawCoin(c, i) {
  if (c.b) { hex(c.x, c.y, 4.2, '#ff7a3a', 0.5); hex(c.x, c.y, 2.4, '#ffd0a0', 0.5); return; }
  var w = Math.abs(Math.cos(F * 0.09 + i * 0.7)) * 4.5 + 1; poly([c.x, c.y - 6.5, c.x + w, c.y, c.x, c.y + 6.5, c.x - w, c.y], '#2ee6d6', '#0a6a70'); poly([c.x, c.y - 6.5, c.x - w, c.y, c.x, c.y], '#b8fff6'); line(c.x, c.y - 6, c.x, c.y + 6, 'rgba(10,106,112,.6)');
}
// Special (big) collectible coin, 5 per level; faded once collected.
function drawSpecial(q, got) { if (got) ctx.globalAlpha = 0.25; var w = 7.5 + Math.sin(F * 0.08 + q.x) * 1.2; ctx.strokeStyle = '#ff6ad5'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x, q.y, w, 0, 6.2832); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, w - 2, 0, 6.2832); ctx.stroke(); ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(F * 0.04); poly([0, -4, 3.5, 2.5, -3.5, 2.5], '#fff'); ctx.restore(); ctx.globalAlpha = 1; }
// Moving / falling platform.
function drawMover(m, pos, st, i) {
  var k = m.kind | 0, w = m.w, x = pos.x, y = pos.y;
  if (k === 2 && m.cross) { var pcx = x + w / 2; line(m.cx, m.y, pcx, y + 3, '#7a6a9a', 3); line(m.cx, m.y, pcx, y + 3, '#c8b8e8', 1); circ(m.cx, m.y, 5, '#4a3a6a'); circ(m.cx, m.y, 2.5, '#d8c8f8'); }   // a rotating cross: spokes from the hub to each pad
  if (k === 15 || k === 16) { ctx.fillStyle = '#7a7468'; ctx.beginPath(); ctx.moveTo(x + 1, y + 11); ctx.lineTo(x, y + 4); ctx.lineTo(x + 5, y); ctx.lineTo(x + w - 5, y); ctx.lineTo(x + w, y + 4); ctx.lineTo(x + w - 1, y + 11); ctx.closePath(); ctx.fill(); rect(x + 4, y, w - 8, 2, '#b8b2a4'); line(x + 8, y + 3, x + 12, y + 9, '#4a463e', 1); line(x + w - 10, y + 2, x + w - 14, y + 7, '#4a463e', 1); circ(x + 7, y + 6, 1.4, '#9a9488'); circ(x + w - 8, y + 7, 1.2, '#5a564e'); return; }   // a heavy stone block
  if (k === 17) { var hx = m.cx, hy = m.y - m.len; line(hx, hy, x + w / 2, y + 1, '#8a7a6a', 1.5); circ(hx, hy, 3, '#5a4a3a'); rrect(x, y, w, 6, 2, '#b07a3a'); rect(x + 2, y, w - 4, 1.6, '#e0b070'); line(x + 4, y + 3, x + w - 4, y + 3, 'rgba(60,30,0,.4)', 1); return; }   // a swinging plank on chains
  if (k === 18) { ctx.strokeStyle = 'rgba(200,220,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(m.cx - m.wd / 2, m.y + 3, m.wd, m.ht); rrect(x, y, w, 7, 2, '#8aa0c0'); rect(x + 2, y, w - 4, 2, '#d8e8ff'); circ(x + 5, y + 4, 1.2, '#2a3a5a'); circ(x + w - 5, y + 4, 1.2, '#2a3a5a'); return; }   // a pad running round a rail loop
  if (k === 19) { ctx.strokeStyle = 'rgba(120,80,40,.25)'; ctx.lineWidth = 1; line(m.x0, y + 8, m.x0 + m.span, y + 8, 'rgba(120,80,40,.25)', 1); for (var pl = 0; pl < 3; pl++) rect(x + pl * (w / 3), y, w / 3 - 1, 6, pl % 2 ? '#a06a2a' : '#b87a34'); rect(x, y + 5, w, 2, '#6a4218'); return; }   // a drifting raft of planks
  if (k === 3) { var s = st.mo[i].s; ctx.globalAlpha = s === 3 ? 0.15 : 1; var sh = s === 1 ? Math.sin(F * 1.2) : 0; poly([x + sh, y, x + w + sh, y, x + w - 4 + sh, y + 7, x + 4 + sh, y + 7], '#ff9a6a'); rect(x + 2 + sh, y, w - 4, 2, '#ffd0b0'); line(x + 10 + sh, y + 1, x + 13 + sh, y + 6, '#6a2a14'); line(x + w - 12 + sh, y + 1, x + w - 14 + sh, y + 6, '#6a2a14'); ctx.globalAlpha = 1; return; }
  if (k === 2) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(m.cx, m.y, m.amp, 0, 6.2832); ctx.stroke(); }
  if (k === 4) { var on = PF.movOn(st, i, st.f), nxt = PF.movOn(st, i, st.f + 40); if (!on) { ctx.globalAlpha = 0.12; } else if (!nxt) { ctx.globalAlpha = (Math.floor(st.f / 4) % 2) ? 0.35 : 1; } ell(x + w / 2, y + 3, w / 2, 4, '#e8f4ff'); ell(x + w / 2, y + 2, w / 2 - 3, 2.4, '#fff'); for (var cl = 0; cl < 3; cl++) line(x + 6 + cl * 8, y + 5, x + 10 + cl * 8, y + 5, 'rgba(120,150,220,.6)', 1); ctx.globalAlpha = 1; return; }
  if (k === 5 || k === 6) { var gc = k === 5 ? '#46d36a' : '#46c8d3'; rrect(x, y, w, 9, 3, gc); rect(x + 2, y + 1, w - 4, 2, 'rgba(255,255,255,.55)'); line(x + 4, y + 5, x + w - 4, y + 5, 'rgba(0,60,20,.45)', 1); var ar = k === 5 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]]; ar.forEach(function (d) { diamond(x + w / 2 + d[0] * 7, y + 4.5 + d[1] * 1.5, 2.2, 2.2, 'rgba(255,255,255,.85)'); }); ctx.globalAlpha = 0.22; if (k === 5) rect(m.cx - m.amp - w / 2, y + 3, m.amp * 2 + w, 3, '#46d36a'); else rect(m.cx - 2, m.y - m.amp, 4, m.amp * 2 + 9, '#46c8d3'); ctx.globalAlpha = 1; return; }
  if (k === 14) { poly([x, y, x + w, y, x + w - 3, y + 7, x + 3, y + 7], '#8ae0ff'); rect(x + 2, y, w - 4, 2, '#e8fbff'); line(x + 6, y + 2, x + 12, y + 6, 'rgba(255,255,255,.6)', 1); line(x + w - 12, y + 1, x + w - 7, y + 5, 'rgba(255,255,255,.6)', 1); return; }
  if (k === 8 || k === 9 || k === 10 || k === 12 || k === 13) {   // mushroom caps (original: faceted caps on a stem)
    var cc = k === 8 ? ['#ff6ab0', '#ffc0e0'] : k === 9 ? ['#ffb04a', '#ffe0a0'] : k === 10 ? ['#6ad8ff', '#c0f0ff'] : k === 12 ? ['#b08aff', '#e0d0ff'] : ['#7aff9a', '#d0ffe0'];
    var sq = k === 8 ? 1 + 0.12 * Math.sin(F * 0.25) : 1; poly([x, y + 6 * sq, x + 4, y, x + w - 4, y, x + w, y + 6 * sq], cc[0]); rect(x + 4, y, w - 8, 2, cc[1]); circ(x + w * 0.3, y + 3, 1.6, cc[1]); circ(x + w * 0.7, y + 3, 1.6, cc[1]);
    if (k !== 13) rect(x + w / 2 - 3, y + 6, 6, 5, '#e8e0d0');
    if (k === 8) { diamond(x + w / 2, y - 4 - Math.abs(Math.sin(F * 0.2)) * 3, 2.5, 3, cc[1]); }
    if (k === 9) { diamond(x + w / 2, y + 3, 2, 2.4, 'rgba(60,20,0,.55)'); } if (k === 10) { diamond(x + w / 2, y + 3, 2, 2.4, 'rgba(0,40,80,.55)'); }
    return; }
  var col = k === 1 ? '#6ac8ff' : k === 2 ? '#ff8ad8' : '#9a8aff'; poly([x, y, x + w, y, x + w - 4, y + 7, x + 4, y + 7], col); rect(x + 2, y, w - 4, 2, 'rgba(255,255,255,.55)'); diamond(x + w / 2, y + 4, 3, 2.5, 'rgba(20,10,60,.5)');
}
// Swinging mace on a chain.
function drawMace(m, f) {
  var balls = PF.maceBalls(m, f), n = m.n || 1;
  circ(m.cx, m.cy, 5, '#5a4a6a'); circ(m.cx, m.cy, 2.2, '#c8b8e0');
  for (var k = 0; k < balls.length; k++) { var b = balls[k];
    if (n === 1) { var segs = 5; for (var q = 1; q < segs; q++) circ(m.cx + (b.x - m.cx) * q / segs, m.cy + (b.y - m.cy) * q / segs, 1.6, '#8a7aa0'); var rot = f * 0.08; poly([b.x, b.y - 11, b.x + 4, b.y - 4, b.x - 4, b.y - 4], '#6a5a80'); for (var s2 = 0; s2 < 8; s2++) { var aa = s2 * 0.7854 + rot; poly([b.x + Math.cos(aa - 0.3) * 6, b.y + Math.sin(aa - 0.3) * 6, b.x + Math.cos(aa) * 11, b.y + Math.sin(aa) * 11, b.x + Math.cos(aa + 0.3) * 6, b.y + Math.sin(aa + 0.3) * 6], '#c04a5a'); } circ(b.x, b.y, 7.5, '#3a2a4a'); circ(b.x - 2, b.y - 2, 2.5, '#8a7aa0'); }
    else { ctx.globalAlpha = 0.3; circ(b.x, b.y, b.r + 3, '#ff9a3a'); ctx.globalAlpha = 1; circ(b.x, b.y, b.r, '#ff7a2a'); circ(b.x, b.y, b.r * 0.5, '#ffe08a'); } }
}
// End-of-stage cannon the hero is fired out of.
function drawEndCannon(L, st) {   // the big end-of-stage cannon: the hero climbs in and is shot away
  var x = L.goalX + 2, y = L.poleY, f = st.f, won = st.p.won, rec = won ? Math.max(0, 6 - (f - st.shot) * 0.5) : 0;
  circ(x - 8, y - 8, 9, '#1a1030'); circ(x - 8, y - 8, 6, '#6a5a9a'); rect(x - 20, y - 6, 24, 6, '#2a2450');
  ctx.save(); ctx.translate(x - 4, y - 16); ctx.rotate(-0.8); rrect(-6 - rec, -11, 38, 22, 6, '#1a1030'); rrect(-4 - rec, -9, 34, 18, 5, '#4a3f86'); rrect(-4 - rec, -9, 34, 6, 3, '#6a5cc0'); rrect(26 - rec, -13, 8, 26, 3, '#2a2450'); rrect(27 - rec, -11, 4, 22, 2, '#ff8a3a'); ctx.restore();
  if (!won) { var bob = Math.sin(f * 0.15) * 2; poly([x - 22, y - 34 + bob, x - 14, y - 34 + bob, x - 18, y - 28 + bob], '#ffe08a'); text(TT('들어가기', 'ENTER'), x - 18, y - 46, 6, '#ffe08a', 'center', false); }
  else if (f - st.shot < 14) { var ff = f - st.shot; ctx.globalAlpha = 1 - ff / 14; circ(x + 14, y - 34, 6 + ff * 2, '#ffd24a'); circ(x + 14, y - 34, 3 + ff, '#fff'); ctx.globalAlpha = 1; }
}
// Big exit button on a pedestal.
function drawExitButton(L, st, locked) {   // a big round button on a pedestal: pressing it (touching it) ends the stage
  var x = L.goalRect.x + L.goalRect.w / 2, y = L.poleY, down = st.p.won ? 4 : 0, pulse = 0.5 + 0.5 * Math.sin(st.f * 0.12), sec = L.exitKind === 'secret', col = locked ? '#7a3a4a' : (st.p.won ? '#5affb0' : sec ? '#b04aff' : '#ff4a5a'), lt = locked ? '#a05a6a' : (st.p.won ? '#c8ffe0' : sec ? '#e0b0ff' : '#ff9a9a');   // the secret exit's button is violet, the normal one red
  rect(x - 15, y - 5, 30, 5, '#2a2450'); rect(x - 13, y - 9, 26, 5, '#4a3f86'); rect(x - 13, y - 9, 26, 1.5, '#6a5cc0');
  ctx.fillStyle = '#1a1030'; ctx.beginPath(); ctx.ellipse(x, y - 9, 12, 4, 0, 0, 6.2832); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y - 11 + down, 10, 4.5, 0, 0, 6.2832); ctx.fill(); rect(x - 10, y - 15 + down, 20, 4, col); ctx.fillStyle = lt; ctx.beginPath(); ctx.ellipse(x, y - 15 + down, 10, 4, 0, 0, 6.2832); ctx.fill();
  if (!locked && !st.p.won) { ctx.globalAlpha = 0.25 + 0.25 * pulse; circ(x, y - 14, 15 + pulse * 4, '#ff6a7a'); ctx.globalAlpha = 1; var bob = Math.sin(st.f * 0.15) * 2; poly([x - 4, y - 37 + bob, x + 4, y - 37 + bob, x, y - 31 + bob], '#ffe08a'); text(TT('종료', 'EXIT'), x, y - 48, 7, '#ffe08a', 'center', false); }
}
// Goal gate / flagpole; locked variant stays closed until the boss or key condition is met.
function drawGoal(L, st, locked) {
  if (L.arena) return;
  if (L.exitBtn) { drawExitButton(L, st, locked); return; }   // castles have no flag: the fight is the ending
  if (L.endCannon) { drawEndCannon(L, st); return; }   // beacon gate: two tapered obelisks and an energy beam
  // finish flag: two poles with waving pennants and a tape that sweeps up and down between them (touching the tape is the bonus)
  var gx = L.goalX, base = L.poleY, top = base - 9 * TS, tx = gx + 14, pole = locked ? '#8a6a72' : '#e8e4f0', fc = locked ? '#7a3a4a' : L.exitKind === 'secret' ? '#b04aff' : '#ff4a5a', fc2 = locked ? '#7a3a4a' : L.exitKind === 'secret' ? '#4af0e0' : '#ffd24a',   /* violet and teal pennants mark the secret exit */  wv = Math.sin(st.f * 0.12) * 2;
  rect(gx + 2, top, 2, base - top, pole); circ(gx + 3, top - 2, 3, locked ? '#d04a4a' : '#ffd24a');
  poly([gx + 4, top + 1, gx + 17 + wv, top + 5, gx + 4, top + 11], fc, '#7a0a1a'); poly([gx + 4, top + 1, gx + 11 + wv * 0.5, top + 3, gx + 4, top + 6], 'rgba(255,255,255,.35)');
  rect(tx + 2, top + 2 * TS, 2, base - top - 2 * TS, pole); circ(tx + 3, top + 2 * TS - 2, 2.4, locked ? '#d04a4a' : '#ffd24a');
  poly([tx + 4, top + 2 * TS + 1, tx + 14 - wv, top + 2 * TS + 4, tx + 4, top + 2 * TS + 9], fc2, '#7a5a0a');
  if (locked) { for (var k = 0; k < 3; k++) { ctx.globalAlpha = 0.5; line(gx + 4, base - 20 - k * 22, tx + 2, base - 20 - k * 22, '#ff4a6a', 2); } ctx.globalAlpha = 1; return; }
  var ty = base - 18 - (0.5 + 0.5 * Math.sin(st.f * 0.045)) * 90; ctx.globalAlpha = 0.35; rect(gx + 4, ty - 4, tx - gx - 2, 8, '#7affe0'); ctx.globalAlpha = 1; rect(gx + 4, ty - 1, tx - gx - 2, 2, '#e8fffa');
}
// stages made of zones (odyssey) have a look per zone (cell); the others one look
function zoneTheme(L, c, r, def) { if (!L.zones) return def; var zi = Math.floor(r / L.zoneCH) * L.zoneGX + Math.floor(c / L.zoneCW), z = L.zones[zi]; return z >= 0 && THEMES[z] ? THEMES[z] : def; }
// Draws a whole level for state st with theme th: scrolls by camera, then tiles in view, then level objects, enemies, hero, effects and the hint overlay.
// Rope swings (jungle): a branch stub at the pivot, a thick vine with leaf tufts, a knot at the end; the held rope follows the swing angle, idle ones sway; a faint pulsing arrow shows where to grab.
function drawRopes(st) {
  var L = st.L, cam = G.cam, p = st.p, i, k;
  for (i = 0; i < L.ropes.length; i++) {
    var r = L.ropes[i]; if (r.px < cam - r.len - 40 || r.px > cam + VW + r.len + 40) continue;
    var held = p.rope && p.rope.i === i, a = held ? p.rope.th : PF.ropeAng0(r, st.f), sx = Math.sin(a), cy = Math.cos(a), ex = r.px + r.len * sx, ey = r.py + r.len * cy;
    ctx.save(); ctx.lineCap = 'round';
    line(r.px, r.py - 70, r.px, r.py - 3, 'rgba(46,92,30,.55)', 2);   // liana up into the canopy
    rect(r.px - 14, r.py - 5, 28, 5, '#5a3d20'); rect(r.px - 14, r.py - 5, 28, 2, '#7a5a30'); circ(r.px - 14, r.py - 2.5, 2.6, '#4b3219'); circ(r.px + 14, r.py - 2.5, 2.6, '#4b3219');
    ell(r.px - 9, r.py - 6, 5, 2.4, '#3f8a2a', -0.4); ell(r.px + 8, r.py - 6, 5, 2.4, '#4aa032', 0.4); ell(r.px, r.py - 7, 4, 2, '#2f7a22', 0);
    line(r.px, r.py, ex, ey, '#1f4a14', 4.4); line(r.px, r.py, ex, ey, '#3f8a2a', 3); line(r.px - 0.6, r.py, ex - 0.6, ey, '#6cc04a', 1);
    for (k = 1; k <= 5; k++) { var t = k / 5.4, lx = r.px + r.len * t * sx, ly = r.py + r.len * t * cy, sd = k % 2 ? 1 : -1; ell(lx + sd * 4, ly + 1, 4.2, 1.9, k % 2 ? '#4aa032' : '#2f7a22', sd * 0.7 + a); }
    circ(ex, ey, 2.8, '#6b4a24'); circ(ex - 0.8, ey - 0.8, 1, '#9a7240');
    if (!held && !p.rope && Math.abs(p.x - r.px) < 200) { var pu = 0.3 + 0.2 * Math.sin(st.f * 0.12 + i); ctx.globalAlpha = pu; circ(ex, ey, 7 + 1.5 * Math.sin(st.f * 0.12), 'rgba(255,255,160,.35)'); poly([ex, ey - 16, ex - 5, ey - 9, ex + 5, ey - 9], '#fffbb0'); ctx.globalAlpha = 1; }
    ctx.restore();
  }
}
function drawLevel(st, th) {
  var L = st.L, cam = G.cam, c0 = Math.max(0, Math.floor(cam / TS)), c1 = Math.min(L.w - 1, Math.floor((cam + VW) / TS) + 1), c, r, i;
  ctx.save(); ctx.translate(-Math.round(cam), -Math.round(G.camY || 0));
  var RW = L.rows || ROWS, r0 = Math.max(0, Math.floor((G.camY || 0) / TS)), r1 = Math.min(RW - 1, r0 + 16);
  for (c = c0; c <= c1; c++) for (r = r0; r <= r1; r++) {
    var t = PF.tileAt(st, c, r), raw = st.mod.size ? (st.mod.get(c * RW + r) !== undefined ? st.mod.get(c * RW + r) : L.tiles[c * RW + r]) : L.tiles[c * RW + r];
    if (!t && raw === T.BRICK) t = T.BRICK;
    if (!t && raw === T.NARROW) t = T.NARROW;   // the mouse hole stays drawn while the hero is small enough to pass
    if (!t && (raw === T.GATE || raw === T.BRIDGE || raw === T.WLEVEL)) { ctx.globalAlpha = 0.28; ctx.strokeStyle = raw === T.WLEVEL ? '#7ad0ff' : '#c8b8ff'; ctx.setLineDash([2, 3]); ctx.lineWidth = 1; ctx.strokeRect(c * TS + 1.5, r * TS + 1.5, TS - 3, TS - 3); ctx.setLineDash([]); ctx.globalAlpha = 1; continue; }
    if (!t || PF.isW(t)) continue; var bd = 0;
    for (i = 0; i < G.bumps.length; i++) if (G.bumps[i].c === c && G.bumps[i].r === r) bd = -Math.sin(G.bumps[i].t / 10 * Math.PI) * 5;
    drawTile(t, c * TS, r * TS, L.zones ? zoneTheme(L, c, r, th) : th, r > 0 ? PF.tileAt(st, c, r - 1) : 0, bd, c, r, st);
    if (t === T.SOLID && r > 0 && PF.isW(PF.tileAt(st, c, r - 1))) drawSeabed(c, r);
  }
  if (L.secretZone && !G.main) { var zz = L.secretZone, gl4 = 0.1 + 0.1 * Math.sin(F * 0.06 + zz.x); ctx.globalAlpha = gl4; spark4(zz.x + zz.w / 2 + Math.sin(F * 0.03) * zz.w * 0.25, zz.y + zz.h * 0.55, 2.6, '#fff8c0'); ctx.globalAlpha = 1; }   // the faintest glimmer over a secret entrance
  if (L.keys) for (i = 0; i < L.keys.length; i++) if (!st.kg[i]) drawKey(L.keys[i].x, L.keys[i].y, L.keys[i].c, false);
  if (L.winds) for (i = 0; i < L.winds.length; i++) { var wzd = L.winds[i]; if (wzd.gust) drawGust(wzd, st.f, cam); else if (wzd.bub) drawBubbleJet(wzd, st.f); else drawWind(wzd); }
  if (L.whirls) for (i = 0; i < L.whirls.length; i++) drawWhirl(L.whirls[i], st.f);
  if (L.geysers) for (i = 0; i < L.geysers.length; i++) drawGeyser(L.geysers[i], st.f);
  if (L.pockets) for (i = 0; i < L.pockets.length; i++) if (!st.pk[i]) drawPocket(L.pockets[i]);
  drawGoal(L, st, st.boss > 0);
  for (i = 0; i < L.movers.length; i++) drawMover(L.movers[i], PF.movPos(st, i, st.f), st, i);
  if (L.ropes) drawRopes(st);
  if (L.maces) for (i = 0; i < L.maces.length; i++) drawMace(L.maces[i], st.f);
  if (L.chase && st.cw !== undefined) { var cwx = st.cw, gw = ctx.createLinearGradient(cwx - 60, 0, cwx, 0); gw.addColorStop(0, 'rgba(255,60,20,0)'); gw.addColorStop(1, 'rgba(255,90,30,.85)'); ctx.fillStyle = gw; ctx.fillRect(cwx - 60, -2000, 60, 6000); rect(cwx - 6, -2000, 6, 6000, '#ffd24a'); }
  if (st.lv !== undefined) { var ly = st.lv, gl2 = ctx.createLinearGradient(0, ly - 14, 0, ly + 40); gl2.addColorStop(0, 'rgba(255,200,60,.95)'); gl2.addColorStop(0.2, '#ff6a1a'); gl2.addColorStop(1, '#8a1a08'); ctx.fillStyle = gl2; ctx.fillRect(-50, ly, L.w * TS + 100, 4000); for (var lx = 0; lx < L.w * TS; lx += 18) circ(lx + (st.f * 0.4 % 18), ly + Math.sin((lx + st.f * 2) * 0.05) * 2, 5, '#ffb04a'); }
  for (i = 0; i < L.coins.length; i++) if (!st.cg[i] && L.coins[i].x > cam - 10 && L.coins[i].x < cam + VW + 10) drawCoin(L.coins[i], i);
  if (L.special) for (i = 0; i < L.special.length; i++) drawSpecial(L.special[i], st.sg[i]);
  for (i = 0; i < st.it.length; i++) if (st.it[i].alive) drawItem(st.it[i]);
  for (i = 0; i < st.en.length; i++) { var e = st.en[i]; if (e.x > cam - 40 && e.x < cam + VW + 40) drawEnemy(e); }
  for (i = 0; i < st.hz.length; i++) drawHz(st.hz[i], st.f);
  for (i = 0; i < st.ep.length; i++) { diamond(st.ep[i].x, st.ep[i].y, 4, 5.5, '#ff4ad8'); circ(st.ep[i].x, st.ep[i].y, 1.5, '#fff'); }
  for (i = 0; i < st.fb.length; i++) { var fbi = st.fb[i];
    if (fbi.k === 4) { ctx.save(); ctx.translate(fbi.x, fbi.y); ctx.rotate(F * 0.5 * (fbi.vx > 0 ? 1 : -1)); rect(-1, -2, 2, 8, '#8a5a2a'); rect(-5, -6, 10, 5, '#9a9aaa'); ctx.restore(); }
    else if (fbi.k === 5) { circ(fbi.x, fbi.y, 3.8, '#e8f6ff'); circ(fbi.x - 1, fbi.y - 1, 1.6, '#ffffff'); }
    else { circ(fbi.x, fbi.y, 3.6, '#ff5a1a'); circ(fbi.x, fbi.y, 1.8, '#ffe8a0'); } }
  if (L.cp) { var kx = L.cp.x + 6, ky = L.cp.y + 14; poly([kx - 2, ky, kx + 3, ky, kx + 2, ky - 14, kx - 1, ky - 14], '#6a5ab0'); diamond(kx + 0.5, ky - 19, 4, 6, st.cp ? '#3affb0' : '#7a6ab0'); }
  if (G.hint) {
    var h = G.hint, k; if (h.path && h.path.length > 1) { ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(h.path[0].x, h.path[0].y); for (k = 1; k < h.path.length; k++) ctx.lineTo(h.path[k].x, h.path[k].y); ctx.stroke(); }
    if (h.land) { var pr = 4 + Math.sin(F * 0.2) * 1.5; ctx.strokeStyle = '#3aff7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.land.x, h.land.y, 6 + pr, 0, 6.3); ctx.stroke(); poly([h.land.x - 4, h.land.y - 16 - pr, h.land.x + 4, h.land.y - 16 - pr, h.land.x, h.land.y - 9 - pr], '#3aff7a'); }
    if (h.way) { var wy = h.way.y - 18 - Math.abs(Math.sin(F * 0.15)) * 4; poly([h.way.x - 6, wy - 8, h.way.x + 6, wy - 8, h.way.x, wy + 2], '#ffe08a', '#6a4a00'); }
    if (h.haz) { var hz = h.haz; ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hz.x, hz.y, 11 + Math.sin(F * 0.25) * 1.5, 0, 6.3); ctx.stroke(); }
  }
  var p = st.p;
  if (G.mode === 'dying') drawHero({ x: p.x, y: G.dy, w: p.w, h: p.h, big: false, pw: 0, face: p.face, ground: false, anim: 0, vx: 0, inv: 0, star: 0, spin: 0 }, true, G.dieT * 0.25, false);
  else {
    if (p.mini) { var mcx = p.x + p.w / 2, mby = p.y + p.h; ctx.save(); ctx.translate(mcx, mby); ctx.scale(0.85, 0.85); ctx.translate(-mcx, -mby); }
    if (p.wing > 0) { var wf = Math.sin(F * 0.5) * 4, wx = p.x + p.w / 2, wy = p.y + p.h * 0.45; poly([wx - 3, wy, wx - 14, wy - 8 + wf, wx - 9, wy + 1], '#f4f0ff', '#8a7ac0'); poly([wx + 3, wy, wx + 14, wy - 8 + wf, wx + 9, wy + 1], '#f4f0ff', '#8a7ac0'); }
    drawHero(p, false, 0, !!p.mount);
    if (p.slow > 0) { ctx.globalAlpha = 0.75; ctx.strokeStyle = '#f4f4ff'; ctx.lineWidth = 1; var hx5 = p.x + p.w / 2, hy5 = p.y + p.h / 2; for (var wq = 0; wq < 4; wq++) { var wq2 = wq * 0.785; ctx.beginPath(); ctx.moveTo(hx5 - Math.cos(wq2) * 10, hy5 - Math.sin(wq2) * 12); ctx.lineTo(hx5 + Math.cos(wq2) * 10, hy5 + Math.sin(wq2) * 12); ctx.stroke(); } ctx.beginPath(); ctx.arc(hx5, hy5, 7, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 1; }
    if (p.frz > 0) { var ix = p.x - 3, iy = p.y - 2, iw = p.w + 6, ih = p.h + 4, thaw = p.frz < 24 && (Math.floor(p.frz / 3) % 2); ctx.globalAlpha = thaw ? 0.45 : 0.78; rrect(ix, iy, iw, ih, 3, '#bfefff'); ctx.globalAlpha = 0.9; rect(ix + 2, iy + 2, 3, ih - 6, '#ffffff'); line(ix + iw - 4, iy + 3, ix + iw - 8, iy + 9, '#7ac0e0', 1); line(ix + 3, iy + ih - 3, ix + 8, iy + ih - 8, '#7ac0e0', 1); ctx.globalAlpha = 1; }
    if (p.fin > 0) { var fx = p.x + p.w / 2; poly([fx - 7, p.y + p.h, fx - 1, p.y + p.h, fx - 6, p.y + p.h + 3], '#2ee6d6'); poly([fx + 1, p.y + p.h, fx + 7, p.y + p.h, fx + 6, p.y + p.h + 3], '#2ee6d6'); }
    if (p.mini) ctx.restore();
  }
  for (c = c0; c <= c1; c++) for (r = r0; r <= r1; r++) { var wt = PF.tileAt(st, c, r); if (wt === T.SPIKE && (PF.isW(PF.tileAt(st, c - 1, r)) || PF.isW(PF.tileAt(st, c + 1, r)) || PF.isW(PF.tileAt(st, c, r - 1)))) wt = T.WATER; if (wt === T.SLP && r > 0 && PF.isW(PF.tileAt(st, c, r - 1))) wt = T.WATER; if (PF.isW(wt)) drawWaterOverlay(c * TS, r * TS, r > 0 ? PF.tileAt(st, c, r - 1) : 0, wt, c, r); }
  for (i = 0; i < G.parts.length; i++) { var q = G.parts[i]; rect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s, q.col); }
  for (i = 0; i < G.pops.length; i++) { var pp = G.pops[i]; text(pp.t, pp.x, pp.y, 8, pp.c, 'center'); }
  ctx.restore();
}
// ---- HUD and overlays
// Translucent dark panel with a border.
function panel(x, y, w, h) { ctx.fillStyle = 'rgba(10,8,34,.88)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#2ee6d6'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); poly([x, y, x + 8, y, x, y + 8], '#2ee6d6'); poly([x + w, y + h, x + w - 8, y + h, x + w, y + h - 8], '#2ee6d6'); }
// Zero-pads a score to 6 digits.
function pad6(n) { var s = String(Math.max(0, n | 0)); while (s.length < 6) s = '0' + s; return s; }
// Text for the level pill, e.g. world-stage, or STAR ROAD for bonus levels (n >= 1000).
function levelLabel(G) { var n = G.n; if (n >= 2000) return TT('도박집', 'GAMBLE HOUSE'); if (n >= 1000) return TT('별길', 'STAR ROAD'); var so = PF.stageOf(n); return (so.depth + 1) + '·' + (so.index + 1); }
// Small hero diamond used for lives.
function heroIcon(x, y, s) { poly([x, y - 5 * s, x + 5 * s, y, x, y + 5 * s, x - 5 * s, y], '#ff8a3d'); poly([x, y - 5 * s, x - 5 * s, y, x, y], '#ffc08a'); circ(x, y, 2 * s, '#fff'); circ(x + 0.6 * s, y, 1 * s, '#2a1456'); }
// In-level HUD: score, gems, level label, lives, power-up and timer bar.
function drawHUD(st) {
  if (st.p.pois > 0) { var phx = st.p.x - G.cam - 4, phy = st.p.y - (G.camY || 0) - 9; rect(phx - 1, phy - 1, 22, 5, 'rgba(10,0,24,.7)'); rect(phx, phy, 20 * st.p.pois / PF.P.POIS, 3, '#e0a0ff'); }   // poison grace timer
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
  if (st.boss > 0 && st.L.arena && (st.L.arena.dir !== undefined ? PF.inArena(st) : st.p.x > st.L.arena.c0 * TS - 100)) text(TT('보스를 쓰러뜨려야 관문이 열려요!', 'Defeat the boss to open the gate!'), VW / 2, 42, 8, '#ff8aa8', 'center');
}
// Centered message box with a title and lines (last line highlighted).
function overlay(title, lines) {
  panel(44, 36, VW - 88, 138); text(title, VW / 2, 58, 18, '#ff8a3d', 'center');
  for (var i = 0; i < lines.length; i++) text(lines[i], VW / 2, 84 + i * 14, 8.5, i === lines.length - 1 ? '#7affe0' : '#fff', 'center');
}
// ---------------------------------------------------------------- overworld map: low-poly islands, glowing route, hex / diamond nodes
// Node colour per level kind on the overworld map.
var NODE_COL = { cannon: '#ff8a3a', maze: '#ffb04a', plain: '#7a6ae0', hills: '#4ac8a0', flood: '#38b8f0', ghost: '#a07aff', sky: '#ff9ac0', cave: '#d09050', castle: '#ff4a6a', bonus: '#ffe08a', house: '#e0a040' };
// Overworld map of the current world: gradient sky, floating islands, routes (dashed when secret) and level nodes (hex / diamond).
function drawMap() {
  var wm = G.map, pal = [['#14103a', '#3a2a7a'], ['#0a2a3a', '#1a6a7a'], ['#2a1030', '#7a2a6a'], ['#102a20', '#2a7a5a']][wm.wid % 4];
  var g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  var r = PF.rng(wm.w * 31 + 7), i; for (i = 0; i < 40; i++) spark4(r() * VW, r() * VH, 0.8 + r() * 1.6, 'rgba(255,255,255,.35)');
  for (i = 0; i < 9; i++) { var ix = 20 + r() * 360, iy = 40 + r() * 150, rr = 14 + r() * 30; hex(ix, iy, rr, 'rgba(255,255,255,.07)', r() * 1.5); hex(ix, iy, rr * 0.7, 'rgba(255,255,255,.07)', r() * 1.5); }
  var nodes = wm.nodes, fn = G.fn; ctx.lineCap = 'round';
  function nd2(id) { for (var q = 0; q < nodes.length; q++) if (nodes[q].i === id) return nodes[q]; return null; }
  wm.edges.forEach(function (e) { var A = nd2(e.a), B = nd2(e.b); if (!fn.isVisible(A) || !fn.isVisible(B)) return; var ok = fn.edgeOpen(e), clr = !!G.prog.wcl[wm.wid], shw = ok || clr; if (e.secret && !e.house) { if (shw) { var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, bl = (22 + Math.abs(B.x - A.x) * 0.5) * (my > 115 ? -1 : 1); ctx.setLineDash([3, 4]); ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(mx, my + bl, B.x, B.y); ctx.stroke(); } }
    else if (e.back) { if (!fn.isDone(e.a)) return; var bx2 = (A.x + B.x) / 2, by2 = Math.min(A.y, B.y) - 34 - Math.abs(A.x - B.x) * 0.15; ctx.setLineDash([2, 4]); ctx.strokeStyle = fn.isDone(e.a) ? '#ff8a8a' : 'rgba(255,255,255,.2)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(bx2, by2, B.x, B.y); ctx.stroke(); ctx.setLineDash([]); if (fn.isDone(e.a)) { var ax2 = B.x + (bx2 - B.x) * 0.1, ay2 = B.y + (by2 - B.y) * 0.1; ctx.fillStyle = '#ff8a8a'; ctx.beginPath(); ctx.moveTo(B.x, B.y - 4); ctx.lineTo(B.x + 6, B.y - 12); ctx.lineTo(B.x - 6, B.y - 12); ctx.fill(); } }
    else if (e.secret) { ctx.setLineDash([4, 4]); line(A.x, A.y, B.x, B.y, shw ? '#ffe08a' : 'rgba(255,255,255,.0)', 2.5); } else { ctx.setLineDash([]); line(A.x, A.y, B.x, B.y, fn.isDone(e.a) ? '#7affe0' : 'rgba(255,255,255,.35)', 3); } ctx.setLineDash([]); });
  if (G.mapHint && G.frame - G.mapHint.f0 < 180) { var hb = nd2(G.mapHint.to), he = null; wm.edges.forEach(function (e) { if (e.b === G.mapHint.to && fn.edgeOpen(e) && !he) he = e; }); var ha = he ? nd2(he.a) : null; if (hb) { ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3; ctx.setLineDash([]); ctx.beginPath(); if (ha) { ctx.moveTo(ha.x, ha.y); ctx.lineTo(hb.x, hb.y); } else { ctx.arc(hb.x, hb.y, 14, 0, 6.3); } ctx.stroke(); } }   // map hint: the way to the next level as a white line for 3 s
  var all = nodes.filter(fn.isVisible);
  for (i = 0; i < all.length; i++) { var nd = all[i], done = fn.isDone(nd.i), open = fn.isOpen(nd), sel = G.sel === nd.i;
    var col = open ? (NODE_COL[nd.kind] || '#8a7ae0') : '#5a5a7a';
    if (nd.kind === 'castle') { poly([nd.x - 9, nd.y + 8, nd.x - 9, nd.y - 3, nd.x - 4, nd.y - 9, nd.x, nd.y - 3, nd.x + 4, nd.y - 9, nd.x + 9, nd.y - 3, nd.x + 9, nd.y + 8], col, '#1a0a20'); }
    else if (nd.kind === 'cannon') { circ(nd.x - 3, nd.y + 5, 5, '#1a1030'); circ(nd.x - 3, nd.y + 5, 3.4, col); ctx.save(); ctx.translate(nd.x, nd.y); ctx.rotate(-0.6); rrect(-4, -5, 16, 9, 3, '#1a1030'); rrect(-3, -4, 14, 7, 2.5, col); ctx.restore(); }
    else if (nd.kind === 'bonus') spark8(nd.x, nd.y, 9, col, F * 0.03);
    else if (nd.kind === 'house') { var hc = done ? '#6a6a80' : col; poly([nd.x - 10, nd.y + 8, nd.x - 10, nd.y - 2, nd.x, nd.y - 9, nd.x + 10, nd.y - 2, nd.x + 10, nd.y + 8], '#10082a'); poly([nd.x - 8.5, nd.y + 7, nd.x - 8.5, nd.y - 1.5, nd.x, nd.y - 7, nd.x + 8.5, nd.y - 1.5, nd.x + 8.5, nd.y + 7], hc); rrect(nd.x - 7, nd.y + 1, 14, 6, 1.5, done ? '#4a4a5a' : '#7a4a1a'); rrect(nd.x - 2, nd.y + 2.5, 4, 2.5, 0.8, done ? '#8a8a9a' : '#ffe08a'); }
    else { hex(nd.x, nd.y, 9, '#10082a', Math.PI / 6); hex(nd.x, nd.y, 7.3, col, Math.PI / 6); }
    if (done) { diamond(nd.x + 8, nd.y - 8, 4, 5, '#fff'); ctx.strokeStyle = '#18a070'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(nd.x + 6, nd.y - 8); ctx.lineTo(nd.x + 7.8, nd.y - 6); ctx.lineTo(nd.x + 10.5, nd.y - 10); ctx.stroke(); }
    if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(nd.x, nd.y, 13 + Math.sin(F * 0.2) * 1.5, 0, 6.3); ctx.stroke(); }
    if (nd.kind !== 'house') text(nd.kind === 'bonus' ? '★' : String(nd.num || nd.i + 1), nd.x, nd.y + 0.5, 8, '#fff', 'center'); }
  var cur = all.filter(function (n) { return n.i === G.sel; })[0] || nodes[0];
  drawHero({ x: cur.x - 6, y: cur.y - 30 + Math.sin(F * 0.1) * 2, w: 12, h: 14, pw: 0, big: false, face: 1, ground: false, anim: 0, vx: 0, inv: 0, star: 0, spin: 0 }, false, 0, false);
  rrect(3, 3, 90, 14, 7, 'rgba(10,8,34,.62)'); text(TT('월드 ', 'WORLD ') + G.worldName(wm.wid), 10, 10.5, 9, '#ffd0a0');
  rrect(100, 3, 110, 14, 7, 'rgba(10,8,34,.62)'); diamond(110, 10, 4, 5, '#2ee6d6'); text(pad6(G.base), 118, 10.5, 8.5, '#fff');
  rrect(VW - 76, 3, 73, 14, 7, 'rgba(10,8,34,.62)'); for (i = 0; i < Math.min(G.lives, 5); i++) heroIcon(VW - 66 + i * 11, 10, 0.9);
  var sn = all.filter(function (n) { return n.i === G.sel; })[0]; if (sn) { var kn = PF.KIND_NAMES[sn.kind]; rrect(70, VH - 26, 260, 18, 9, 'rgba(10,8,34,.72)'); text((sn.kind === 'bonus' || sn.kind === 'house' ? '★ ' : G.worldName(wm.wid) + '·' + (sn.num || sn.i + 1) + '  ') + (KO ? kn[0] : kn[1]), VW / 2, VH - 17, 9, '#fff', 'center', false); }
  if (G.auto) { var w2 = 128; rrect(VW / 2 - w2 / 2, 20, w2, 14, 4, 'rgba(255,138,61,.95)'); text(TT('자동 플레이 (F3 끄기)', 'AUTO PLAY (F3 to stop)'), VW / 2, 27, 8, '#2a1000', 'center', false); }
  if (G.msgT > 0 && G.msg) { var tw = Math.min(VW - 16, 8 + G.msg.length * (KO ? 7.4 : 4.9)); rrect(VW / 2 - tw / 2, 40, tw, 15, 4, 'rgba(10,8,34,.78)'); text(G.msg, VW / 2, 47.5, 8, '#fff', 'center', false); }
  text(TT('← → ↑ ↓ 선택   점프/Enter 시작', 'Arrows select   Jump/Enter start'), VW / 2, VH - 38, 7.5, '#cfe', 'center');
}

// ---------------------------------------------------------------- super map: the graph of worlds (castle exit solid, cannon exit dashed)
// Lays out the super map: the worlds of four consecutive depths as a graph with positions.
function superLayout(base) {   // four depth columns starting at base
  var out = [], d, s, wd;
  for (d = base; d < base + 4; d++) { wd = d === 0 ? 1 : d === 1 ? 2 : 3; for (s = 0; s < wd; s++) { var id = d * 3 + s, info = PF.worldInfo(G.seed, id); out.push({ id: id, depth: d, slot: s, info: info, x: 46 + (d - base) * 104, y: Math.round(112 + (s - (wd - 1) / 2) * 62) }); } }
  return out;
}
window.__superLayout = superLayout;
// Super map: graph of worlds with their cleared / current / reachable states; also used while browsing and for the end screen.
function drawSuper() {
  var g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#0a0624'); g.addColorStop(1, '#26125a'); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  var rs = PF.rng(21), i; for (i = 0; i < 50; i++) spark4(rs() * VW, rs() * VH, 0.8 + rs() * 1.4, 'rgba(255,255,255,.3)');
  var curD = PF.worldInfo(G.seed, G.superBrowse && G.sbSel !== undefined ? G.sbSel : (G.mode === 'super' && G.superFrom !== undefined ? G.superFrom : G.wid)).depth, base = Math.max(0, curD - 1), lay = superLayout(base), byId = {}; lay.forEach(function (w) { byId[w.id] = w; });
  G.sLay = lay; ctx.lineCap = 'round';
  lay.forEach(function (w) { ['castle', 'cannon'].forEach(function (k) { var t = byId[w.info.next[k]]; if (!t) { var ex = w.x + 62, ey = w.y + (k === 'castle' ? -10 : 10); ctx.setLineDash([2, 4]); line(w.x, w.y, ex, ey, 'rgba(255,255,255,.18)', 1.2); ctx.setLineDash([]); return; }
    var taken = G.prog.wcl[w.id] === (k === 'castle' ? 'castle' : 'cannon'), seen = G.prog.wcl[w.id] !== undefined || w.id === G.wid; ctx.setLineDash(k === 'castle' ? [] : [4, 4]); var bk2 = w.info.back === k; if (bk2) { ctx.setLineDash([2, 3]); var my2 = Math.min(w.y, t.y) - 26; ctx.strokeStyle = (G.prog.loopEnd && G.prog.loopEnd[w.id] === k) || taken ? '#ff5ad0' : 'rgba(255,90,208,.35)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.quadraticCurveTo((w.x + t.x) / 2, my2, t.x, t.y); ctx.stroke(); ctx.setLineDash([]); poly([t.x + 4, t.y - 14, t.x + 12, t.y - 20, t.x + 12, t.y - 8], ctx.strokeStyle); return; }
    line(w.x, w.y, t.x, t.y, taken ? (k === 'castle' ? '#ff8a9a' : '#ffc060') : (seen ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.12)'), taken ? 3 : 1.6); ctx.setLineDash([]); }); });
  G.sRects = [];
  lay.forEach(function (w) { var cl = G.prog.wcl[w.id] !== undefined, cur = w.id === G.wid, tgt = G.mode === 'super' && w.id === G.superTo, pick = G.superBrowse && G.sbSel === w.id, ok = cl || cur || w.id === (G.prog.front || 0) || (G.worldOpen && G.worldOpen(w.id)), col = cl ? '#7affe0' : (cur ? '#ffd0a0' : (ok ? '#a898ff' : '#5a5a7a'));
    hex(w.x, w.y, 14, '#0c0820', Math.PI / 6); hex(w.x, w.y, 11.6, col, Math.PI / 6);
    text(G.worldName(w.id), w.x, w.y + 0.5, 9, '#10082a', 'center', false);
    if (cur || tgt || pick) { ctx.strokeStyle = pick ? '#ffe08a' : '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w.x, w.y, 19 + Math.sin(F * 0.2) * 1.5, 0, 6.3); ctx.stroke(); }
    if (cl) { circ(w.x + 11, w.y - 11, 4.5, '#fff'); text(G.prog.wcl[w.id] === 'castle' ? 'C' : 'K', w.x + 11, w.y - 10.5, 6, '#2a1060', 'center', false); }
    G.sRects.push({ x: w.x - 16, y: w.y - 16, w: 32, h: 32, id: w.id, ok: ok }); });
  rect(0, 0, VW, 16, 'rgba(10,8,34,.7)'); text(TT('슈퍼맵 (끝없는 월드)', 'SUPER MAP (endless worlds)'), 8, 8.5, 9, '#ffd0a0');
  rect(262, 7, 14, 2, '#ff8a9a'); text(TT('성채', 'castle'), 280, 8, 7, '#fff', 'left', false); ctx.setLineDash([3, 3]); line(318, 8, 332, 8, '#ffc060', 2); ctx.setLineDash([]); text(TT('대포', 'cannon'), 336, 8, 7, '#fff', 'left', false);
  if (G.mode === 'super' && G.superFrom !== undefined && byId[G.superFrom] && byId[G.superTo]) {
    var w0 = byId[G.superFrom], w1 = byId[G.superTo], t = Math.max(0, Math.min(1, (G.superT - 20) / 80)), hx = w0.x + (w1.x - w0.x) * t, hy = w0.y + (w1.y - w0.y) * t - 14 - Math.abs(Math.sin(F * 0.2)) * 4;
    drawHero({ x: hx - 6, y: hy, w: 12, h: 14, pw: 0, big: false, face: 1, ground: false, anim: 0, vx: 0, inv: 0, star: 0, spin: 0 }, false, 0, false);
    var via = G.endingTaken === 'castle' ? TT('성채', 'the castle') : TT('대포', 'the cannon');
    rrect(40, VH - 30, 320, 20, 8, 'rgba(10,8,34,.8)'); text(TT('월드 ' + G.worldName(G.superFrom) + ' 클리어 (' + via + ') → 월드 ' + G.worldName(G.superTo), 'World ' + G.worldName(G.superFrom) + ' cleared via ' + via + ' → world ' + G.worldName(G.superTo)), VW / 2, VH - 20, 8.5, '#fff', 'center', false);
  } else if (G.superBrowse) { rrect(30, VH - 30, 340, 20, 8, 'rgba(10,8,34,.8)'); text(TT('방향키 이동 · 점프/Enter: 클리어한 월드로 가기 · N/Esc 닫기', 'Arrows move · Jump/Enter: go to a cleared world · N/Esc close'), VW / 2, VH - 20, 8, '#fff', 'center', false); }
}
// Ending screen drawn over the super map.
function drawEnd() {
  drawSuper(); panel(70, 60, VW - 140, 100); text(TT('끝!', 'THE END'), VW / 2, 84, 20, '#ff8a3d', 'center');
  text(G.endingTaken === 'castle' ? TT('성채 엔딩 · 월드 ' + G.worldName(G.wid), 'Castle ending · world ' + G.worldName(G.wid)) : TT('대포 엔딩 · 월드 ' + G.worldName(G.wid), 'Cannon ending · world ' + G.worldName(G.wid)), VW / 2, 108, 9, '#fff', 'center');
  text(TT('점수: ', 'Score: ') + G.base, VW / 2, 124, 9, '#7affe0', 'center'); text(TT('스페이스 또는 터치: 새 모험', 'Space or tap: new adventure'), VW / 2, 144, 8.5, '#7affe0', 'center');
}
// Stage-select dialog: list of cleared worlds and the stages of the chosen one.
function drawSelect() {
  G.selRects = []; rect(0, 0, VW, VH, 'rgba(6,4,24,.92)'); ctx.strokeStyle = '#2ee6d6'; ctx.lineWidth = 1; ctx.strokeRect(6.5, 6.5, VW - 13, VH - 13);
  text(TT('월드 / 스테이지 선택', 'SELECT WORLD / STAGE'), 16, 18, 10, '#ffd0a0'); text(TT('방향키 이동 · 점프/Enter 시작 · Esc/T 닫기', 'Arrows move · Jump/Enter start · Esc/T close'), VW - 34, 18, 7, '#cfe', 'right', false);
  text('X', VW - 20, 18, 10, '#ff8aa8', 'center', false); G.selRects.push({ x: VW - 30, y: 8, w: 22, h: 14, kind: 'close' });
  rrect(16, VH - 24, 74, 14, 4, '#1c3a5a'); text(TT('월드 지도', 'WORLD MAP'), 53, VH - 17, 7, '#bfe', 'center', false); G.selRects.push({ x: 16, y: VH - 24, w: 74, h: 14, kind: 'map' });
  rrect(96, VH - 24, 74, 14, 4, '#3a1c5a'); text(TT('슈퍼맵', 'SUPER MAP'), 133, VH - 17, 7, '#fcf', 'center', false); G.selRects.push({ x: 96, y: VH - 24, w: 74, h: 14, kind: 'super' });
  var ws = G.selList, i, y;
  text(TT('월드', 'WORLDS'), 16, 34, 8, '#9ab', 'left', false);
  var rowsMax = 9, off = Math.max(0, Math.min(ws.length - rowsMax, G.selWi - 4)); if (off > 0) text('\u25b2', 74, 34, 7, '#9ab', 'center', false); if (off + rowsMax < ws.length) text('\u25bc', 74, 40 + rowsMax * 16 + 2, 7, '#9ab', 'center', false);
  for (i = off; i < Math.min(ws.length, off + rowsMax); i++) { var w = ws[i], sel = i === G.selWi; y = 40 + (i - off) * 16; G.selRects.push({ x: 14, y: y - 1, w: 120, h: 15, kind: 'world', idx: i });
    rrect(14, y - 1, 120, 15, 5, sel ? (G.selCol === 0 ? 'rgba(46,230,214,.35)' : 'rgba(255,255,255,.14)') : 'rgba(255,255,255,.06)'); var cl = G.prog.wcl[w.id];
    text(TT('월드 ', 'World ') + G.worldName(w.id), 20, y + 6.5, 8.5, w.id === G.wid ? '#ffd0a0' : '#fff', 'left', false); if (cl) text((cl === 'castle' ? 'C' : 'K') + ' ✓', 128, y + 6.5, 8, '#7affe0', 'right', false); else if (w.id === G.wid) text(TT('현재', 'now'), 128, y + 6.5, 7, '#ffd0a0', 'right', false); }
  var w2 = ws[G.selWi], m = G.selMapObj; text(TT('스테이지 · 월드 ', 'STAGES · world ') + G.worldName(w2.id), 150, 34, 8, '#9ab', 'left', false);
  var nodes = m.nodes.slice().sort(function (a, b) { return (a.main ? 0 : 1) - (b.main ? 0 : 1) || a.i - b.i; }), rh = Math.min(16, Math.floor((VH - 56) / (nodes.length + 1)));   // up to 10 levels + castle + cannon + house: shrink the rows to fit
  nodes.forEach(function (nd, k) {
    var gi = m.nodes.indexOf(nd), st = G.selStageState(w2.id, m, nd), sel = G.selCol === 1 && G.selSi === gi, kn = PF.KIND_NAMES[nd.kind]; y = 40 + k * rh; G.selRects.push({ x: 148, y: y - 1, w: 240, h: rh - 1, kind: 'stage', idx: gi });
    rrect(148, y - 1, 240, rh - 1, 5, sel ? 'rgba(46,230,214,.35)' : 'rgba(255,255,255,.06)'); var dim = st === 'locked';
    text((nd.kind === 'bonus' || nd.kind === 'house' ? '★' : G.worldName(w2.id) + '·' + (nd.num || nd.i + 1)) + '  ' + (KO ? kn[0] : kn[1]) + (nd.ending ? (nd.ending === 'castle' ? TT('  (성채 끝)', '  (castle ending)') : TT('  (대포 끝)', '  (cannon ending)')) : '') + (nd.main ? '' : nd.kind === 'house' ? TT('  [1회]', '  [once]') : TT('  [비밀 길]', '  [secret route]')), 154, y + rh / 2 - 1, 8.5, dim ? '#6a6a88' : '#fff', 'left', false);
    if (st === 'done') text('✓', 382, y + rh / 2 - 1, 9, '#7affe0', 'right', false); else if (st === 'locked') text(TT('잠김', 'locked'), 382, y + rh / 2 - 1, 7, '#6a6a88', 'right', false); else text('▶', 382, y + rh / 2 - 1, 8, '#ffd0a0', 'right', false);
  });
  if (G.prog.wcl[w2.id]) text(TT('월드 클리어: 모든 스테이지를 고를 수 있어요', 'World cleared: every stage is selectable'), 150, 40 + nodes.length * rh + 8, 7.5, '#7affe0', 'left', false);
}

// Entry point called from game.js each frame: sets context and frame counter, then draws by G.mode (super / end / select / map / play ...).
function render(g, c2d, bs) {
  G = g; ctx = c2d; F = g.frame;
  ctx.setTransform(bs, 0, 0, bs, 0, 0); ctx.clearRect(0, 0, VW, VH);
  if (G.mode === 'super' || G.mode === 'sbrowse') { drawSuper(); return; }
  if (G.mode === 'end') { drawEnd(); return; }
  if (G.mode === 'select') { if (G.selPrev === 'map' || !G.st) drawMap(); else { var th0 = THEMES[G.L.theme] || THEMES[0]; drawBackground(th0, G.cam); drawLevel(G.st, th0); } drawSelect(); return; }
  if (G.mode === 'map' || (G.mode === 'start' && !G.st)) { drawMap(); return; }
  var st = G.st; if (!st) return;
  var th = THEMES[G.L.theme] || THEMES[0];
  if (st.L.zones) th = zoneTheme(st.L, Math.floor((G.cam + VW / 2) / TS), Math.floor(((G.camY || 0) + VH / 2) / TS), th);
  drawBackground(th, G.cam); drawParticles(th, G.cam); drawLevel(st, th);
  if (st.L.roomPx) { var rx0 = Math.floor((st.p.x + 6) / st.L.roomPx) * st.L.roomPx - Math.round(G.cam), rx1 = rx0 + st.L.roomPx + TS; ctx.fillStyle = '#000'; if (rx0 > 0) ctx.fillRect(0, 0, rx0, VH); if (rx1 < VW) ctx.fillRect(rx1, 0, VW - rx1, VH); }
  drawHUD(st);
  if (G.auto && G.thinking && G.mode === 'play') { var tw = 190; rrect(VW / 2 - tw / 2, 44, tw, 16, 5, 'rgba(30,20,60,.92)'); text(TT('자동풀이 계산 중... 잠시 기다리세요', 'Auto-play is thinking... please wait') + '.'.repeat(1 + (F >> 4) % 3), VW / 2, 52, 8, '#ffe08a', 'center', false); }
  if (G.mode === 'loading' && G.auto) { text(TT('자동풀이 · 월드 계산 중, 잠시 기다리세요', 'Auto-play: building the world, please wait'), VW / 2, 140, 8, '#ffe08a', 'center'); }
  if (G.mode === 'loading') { panel(120, 90, 160, 40); text(TT('레벨 만드는 중...', 'Building level...'), VW / 2, 110, 10, '#fff', 'center'); }
  else if (G.mode === 'over') overlay(TT('게임 오버', 'GAME OVER'), [TT('점수: ', 'Score: ') + G.base, TT('도달: ', 'Reached: ') + levelLabel(G), TT('최고 점수: ', 'Best score: ') + G.best, TT('스페이스 또는 터치로 다시 시작 (F2)', 'Space or tap to play again (F2)')]);
  else if (G.mode === 'clear') { text(TT('레벨 클리어!', 'LEVEL CLEAR!'), VW / 2, 66, 20, '#ff8a3d', 'center'); text('+' + G.bonus + (st.tape ? TT('  (빔 보너스!)', '  (beam bonus!)') : ''), VW / 2, 90, 11, '#7affe0', 'center'); if (G.secretExit) text(TT('비밀 출구 발견!', 'Secret exit found!'), VW / 2, 110, 11, '#ff9ae8', 'center'); }
  else if (G.mode === 'pause') text(TT('일시정지', 'PAUSED'), VW / 2, 90, 20, '#fff', 'center');
}
// Title screen: the map with a title overlay.
function startScreen(g, c2d, bs) {
  G = g; ctx = c2d; F = g.frame; ctx.setTransform(bs, 0, 0, bs, 0, 0); drawMap();
  overlay(TT('도형 월드', 'SHAPE WORLD'), [TT('다이아몬드 영웅의 모험: 월드를 돌며 관문과 요새를 정복하세요', 'A diamond hero\'s adventure: clear every gate and fortress'), TT('←→ 이동  Z/스페이스 점프  X/Shift 달리기  C 스핀점프', 'Arrows move  Z/Space jump  X/Shift run  C spin jump'), TT('↑ 덩굴/문   P-게이지가 차면 더 빠르고 높이!', 'Up: vines/doors   fill the P meter for speed and height'), TT('최고 점수: ', 'Best score: ') + g.best, g.hasSave ? TT('스페이스/터치: 이어하기 (월드 ' + g.worldName(g.wid) + ') · F2: 새 게임', 'Space/tap: continue (world ' + g.worldName(g.wid) + ') \u00b7 F2: new game') : TT('스페이스 또는 화면 터치로 시작', 'Press Space or tap to start')]);
}
root.PFR = { render: render, startScreen: startScreen, levelLabel: function (g) { return levelLabel(g); } };
})(window);
