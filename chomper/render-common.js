// Sprite drawing shared by the 2D and 3D renderers (all characters are drawn with canvas paths, no image files).
(function () {
'use strict';
const TAU = Math.PI * 2;
// original cast: a round green chomper ("Munchy") and four bug-like chasers with ONE big eye, antennae and two stubby feet
const GHOSTS = [
  { name: 'Grumble', ko: '그럼블', col: '#a46bff', dark: '#5a2bb0' },
  { name: 'Lurk', ko: '러크', col: '#35b6ff', dark: '#1569a8' },
  { name: 'Zig', ko: '지그', col: '#ffb62e', dark: '#b36b00' },
  { name: 'Dozy', ko: '도지', col: '#d3dbea', dark: '#7d8aa6' }];
const PALETTES = [
  { bg: '#0b0820', wall: '#2a0f4d', edge: '#ff5fb0', glow: 'rgba(255,95,176,0.55)' },
  { bg: '#04121c', wall: '#0d2f55', edge: '#46d9ff', glow: 'rgba(70,217,255,0.55)' },
  { bg: '#140a04', wall: '#4a2208', edge: '#ffb347', glow: 'rgba(255,179,71,0.55)' },
  { bg: '#04140a', wall: '#0e4026', edge: '#9dff6a', glow: 'rgba(157,255,106,0.5)' }];

function drawChomper(ctx, x, y, r, ang, mouth, dying) {
  ctx.save(); ctx.translate(x, y);
  if (dying > 0) {              // spin and shrink away
    const k = Math.min(1, dying); ctx.rotate(k * 9); r *= (1 - k * 0.95); ctx.globalAlpha *= 1 - k * 0.5;
    mouth = 0.2 + k * 1.2;
  }
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#d6ff9e'); g.addColorStop(0.55, '#7cf05a'); g.addColorStop(1, '#2f9e34');
  ctx.fillStyle = g; ctx.beginPath();
  const m = Math.max(0.02, mouth);
  ctx.moveTo(0, 0); ctx.arc(0, 0, r, ang + m, ang + TAU - m); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1f6f27'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke();
  if (dying <= 0) {
    // a little sprout on top and an eye
    ctx.strokeStyle = '#2f9e34'; ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); ctx.moveTo(0, -r * 0.92); ctx.lineTo(r * 0.06, -r * 1.2); ctx.stroke();
    ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.ellipse(r * 0.22, -r * 1.2, r * 0.22, r * 0.11, -0.5, 0, TAU); ctx.fill();
    const ex = Math.cos(ang - 1.1) * r * 0.45, ey = Math.sin(ang - 1.1) * r * 0.45 - r * 0.05;
    ctx.fillStyle = '#10300f'; ctx.beginPath(); ctx.arc(ex, ey, r * 0.13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - r * 0.04, ey - r * 0.04, r * 0.05, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
// kind 0..3 colour index; fr: frightened; flash: show the "about to end" colour; lx, ly: look direction (-1..1); t: time (leg animation)
function drawGhost(ctx, x, y, r, kind, lx, ly, fr, flash, t) {
  const G = GHOSTS[kind % 4];
  let col = G.col, dark = G.dark;
  if (fr) { col = flash ? '#f4fff8' : '#1aa6a0'; dark = flash ? '#9fd8c8' : '#0b5f66'; }
  const leg = Math.sin(t * 14 + kind) * r * 0.1;
  ctx.save(); ctx.translate(x, y);
  // antennae
  ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.09); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.35, -r * 0.8); ctx.lineTo(-r * 0.55, -r * 1.12); ctx.moveTo(r * 0.35, -r * 0.8); ctx.lineTo(r * 0.55, -r * 1.12); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-r * 0.55, -r * 1.14, r * 0.1, 0, TAU); ctx.arc(r * 0.55, -r * 1.14, r * 0.1, 0, TAU); ctx.fill();
  // body: dome + straight sides + flat bottom with two feet
  const g = ctx.createLinearGradient(0, -r, 0, r); g.addColorStop(0, col); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(-r * 0.92, r * 0.62); ctx.lineTo(-r * 0.92, -r * 0.1); ctx.arc(0, -r * 0.1, r * 0.92, Math.PI, 0); ctx.lineTo(r * 0.92, r * 0.62); ctx.lineTo(r * 0.5, r * 0.62); ctx.lineTo(r * 0.5, r * 0.42); ctx.lineTo(-r * 0.5, r * 0.42); ctx.lineTo(-r * 0.5, r * 0.62); ctx.closePath(); ctx.fill();
  ctx.fillStyle = dark; ctx.fillRect(-r * 0.92, r * 0.6 + leg, r * 0.42, r * 0.34); ctx.fillRect(r * 0.5, r * 0.6 - leg, r * 0.42, r * 0.34);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
  if (fr) {
    // dizzy: two crossed strokes eye and a wobbly mouth
    ctx.strokeStyle = flash ? '#c0392b' : '#fff'; ctx.lineWidth = Math.max(1.2, r * 0.1);
    ctx.beginPath(); ctx.moveTo(-r * 0.22, -r * 0.4); ctx.lineTo(r * 0.22, -r * 0.02); ctx.moveTo(r * 0.22, -r * 0.4); ctx.lineTo(-r * 0.22, -r * 0.02); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.28); for (let i = 1; i <= 4; i++) ctx.lineTo(-r * 0.5 + i * r * 0.25, r * (i & 1 ? 0.12 : 0.28)); ctx.stroke();
  } else {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -r * 0.1, r * 0.5, r * 0.46, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#16123a'; ctx.beginPath(); ctx.arc(lx * r * 0.2, -r * 0.1 + ly * r * 0.18, r * 0.24, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx * r * 0.2 - r * 0.07, -r * 0.1 + ly * r * 0.18 - r * 0.08, r * 0.07, 0, TAU); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.07); ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.62); ctx.lineTo(r * 0.3, -r * 0.62 + (kind & 1 ? r * 0.1 : -r * 0.1)); ctx.stroke();
  }
  ctx.restore();
}
function drawEyes(ctx, x, y, r, lx, ly) {
  ctx.save(); ctx.translate(x, y);
  for (let s = -1; s <= 1; s += 2) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(s * r * 0.36, 0, r * 0.3, r * 0.38, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a4bd8'; ctx.beginPath(); ctx.arc(s * r * 0.36 + lx * r * 0.1, ly * r * 0.14, r * 0.15, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
// six own "fruit" icons: plum, lemon, pear, melon slice, star-fruit, gem-apple
function drawFruit(ctx, kind, x, y, r) {
  ctx.save(); ctx.translate(x, y); const k = kind % 8;
  function leaf(col) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(r * 0.2, -r * 0.85, r * 0.32, r * 0.14, -0.5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); ctx.moveTo(0, -r * 0.5); ctx.lineTo(0, -r * 0.9); ctx.stroke(); }
  function ball(c1, c2, rx, ry, cy) { const g = ctx.createRadialGradient(-rx * 0.3, cy - ry * 0.3, 1, 0, cy, Math.max(rx, ry)); g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, TAU); ctx.fill(); }
  if (k === 0) { ball('#d68bff', '#6a1fb0', r * 0.72, r * 0.72, r * 0.1); leaf('#4cc15a'); }
  else if (k === 1) { ctx.rotate(-0.4); ball('#fff48a', '#e0b800', r * 0.9, r * 0.6, 0); ctx.fillStyle = '#e0b800'; ctx.beginPath(); ctx.arc(r * 0.88, 0, r * 0.12, 0, TAU); ctx.arc(-r * 0.88, 0, r * 0.12, 0, TAU); ctx.fill(); }
  else if (k === 2) { ball('#d8f56a', '#72a81d', r * 0.4, r * 0.4, -r * 0.35); ball('#d8f56a', '#72a81d', r * 0.68, r * 0.62, r * 0.25); leaf('#3fa34d'); }
  else if (k === 3) { ctx.fillStyle = '#35b86a'; ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.9, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff5f7a'; ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.72, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#2a1230'; for (let i = -1; i <= 1; i++) ctx.fillRect(i * r * 0.32 - r * 0.05, r * 0.05, r * 0.1, r * 0.2); }
  else if (k === 4) { ctx.fillStyle = '#ffe14a'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i & 1 ? r * 0.4 : r * 0.95; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#c99a00'; ctx.lineWidth = Math.max(1, r * 0.07); ctx.stroke(); }
  else if (k === 5) { ball('#ff6a6a', '#a80f2a', r * 0.78, r * 0.72, r * 0.1); leaf('#4cc15a'); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.1, r * 0.14, r * 0.22, 0.5, 0, TAU); ctx.fill(); }
  else if (k === 6) { ctx.fillStyle = '#6ae6ff'; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.85, -r * 0.2); ctx.lineTo(0, r); ctx.lineTo(-r * 0.85, -r * 0.2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-r * 0.85, -r * 0.2); ctx.lineTo(r * 0.85, -r * 0.2); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke(); }
  else { ball('#ffd9a0', '#d98a3a', r * 0.75, r * 0.75, r * 0.1); ctx.fillStyle = '#3a2210'; ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.18, 0, TAU); ctx.fill(); leaf('#4cc15a'); }
  ctx.restore();
}
function drawPellet(ctx, x, y, r, t) {
  const k = 0.75 + 0.25 * Math.sin(t * 8);
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.5);
  ctx.shadowColor = '#ff9bd2'; ctx.shadowBlur = r * 1.2;
  ctx.fillStyle = '#fff1f8'; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = (i & 1 ? r * 0.45 : r) * k; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawDot(ctx, x, y, r) {
  ctx.fillStyle = '#ffe9c9'; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
}
window.MCSprites = { GHOSTS: GHOSTS, PALETTES: PALETTES, drawChomper: drawChomper, drawGhost: drawGhost, drawEyes: drawEyes, drawFruit: drawFruit, drawPellet: drawPellet, drawDot: drawDot };
})();
