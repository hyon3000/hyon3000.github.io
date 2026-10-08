// 2D renderer: rectangular maze, pre-rendered walls, sprites, tunnel wrap clipping.
(function () {
'use strict';
const S = window.MCSprites, R = {};
let cache = null, L = { ts: 10, ox: 0, oy: 0 };
function layout(G) {
  const U = G.U, topH = 36 * U, botH = 30 * U, W = 21, H = 23, avail = G.h - topH - botH;
  const ts = Math.max(4, Math.min(G.w / W, avail / H)); L.ts = ts; L.ox = (G.w - W * ts) / 2; L.oy = topH + (avail - H * ts) / 2;
  return L;
}
function buildMaze(G, ts, pal) {
  const m = G.sim.maze, W = m.dims[0], H = m.dims[1], c = document.createElement('canvas'); c.width = Math.ceil(W * ts); c.height = Math.ceil(H * ts);
  const x = c.getContext('2d'); x.fillStyle = pal.bg; x.fillRect(0, 0, c.width, c.height);
  const wall = function (cx, cy) { return cx >= 0 && cy >= 0 && cx < W && cy < H && !m.open[cy * W + cx]; };
  x.fillStyle = pal.wall;
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) if (wall(cx, cy)) x.fillRect(cx * ts - 0.5, cy * ts - 0.5, ts + 1, ts + 1);
  x.lineCap = 'round'; x.strokeStyle = pal.edge; x.lineWidth = Math.max(1.5, ts * 0.13); x.shadowColor = pal.glow; x.shadowBlur = ts * 0.5;
  x.beginPath();
  for (let cy = 0; cy < H; cy++) for (let cx = 0; cx < W; cx++) {
    if (!wall(cx, cy)) continue;
    const X = cx * ts, Y = cy * ts, o = ts * 0.07;
    // boundary towards an open cell (pen interior counts as open); the map border itself is not outlined where it is open (tunnel)
    if (cy + 1 < H && !wall(cx, cy + 1)) { x.moveTo(X + o, Y + ts - o); x.lineTo(X + ts - o, Y + ts - o); }
    if (cy > 0 && !wall(cx, cy - 1)) { x.moveTo(X + o, Y + o); x.lineTo(X + ts - o, Y + o); }
    if (cx + 1 < W && !wall(cx + 1, cy)) { x.moveTo(X + ts - o, Y + o); x.lineTo(X + ts - o, Y + ts - o); }
    if (cx > 0 && !wall(cx - 1, cy)) { x.moveTo(X + o, Y + o); x.lineTo(X + o, Y + ts - o); }
  }
  x.stroke(); x.shadowBlur = 0;
  // outer border of the maze (not at the tunnel openings)
  x.strokeStyle = pal.edge; x.lineWidth = Math.max(2, ts * 0.16);
  x.beginPath();
  for (let cx = 0; cx < W; cx++) { x.moveTo(cx * ts, 0.5); x.lineTo((cx + 1) * ts, 0.5); x.moveTo(cx * ts, H * ts - 0.5); x.lineTo((cx + 1) * ts, H * ts - 0.5); }
  for (let cy = 0; cy < H; cy++) if (wall(0, cy)) { x.moveTo(0.5, cy * ts); x.lineTo(0.5, (cy + 1) * ts); x.moveTo(W * ts - 0.5, cy * ts); x.lineTo(W * ts - 0.5, (cy + 1) * ts); }
  x.stroke();
  // the pen door
  const dc = m.door, dx = (dc % W) * ts, dy = Math.floor(dc / W) * ts;
  x.fillStyle = '#ffb6e6'; x.fillRect(dx - 1, dy + ts * 0.38, ts + 2, ts * 0.24);
  return c;
}
R.init = function (G) {}; R.resize = function (G) { cache = null; };
R.chomperScreen = function (G) { const l = layout(G), p = G.sim.pos(G.sim.chomper, [0, 0, 0]); return { x: l.ox + (p[0] + 0.5) * l.ts, y: l.oy + (p[1] + 0.5) * l.ts, r: l.ts * 0.45 }; };
const ANG = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
R.draw = function (G, dt) {
  const ctx = G.ctx, sim = G.sim, m = sim.maze, U = G.U, t = performance.now() / 1000, l = layout(G), ts = l.ts, W = m.dims[0], H = m.dims[1];
  const pal = S.PALETTES[((sim.level - 1) % 4 + 4) % 4], key = sim.level + ':' + ts.toFixed(2);
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, G.w, G.h);
  if (!cache || cache.key !== key) cache = { key: key, c: buildMaze(G, ts, pal), flash: null };
  let img = cache.c;
  if (sim.phase === 'clear' && Math.floor(sim.phaseT * 5) % 2 === 0) { if (!cache.flash) { cache.flash = buildMaze(G, ts, { bg: '#ffffff', wall: '#e8f6ff', edge: '#6aa8ff', glow: 'rgba(255,255,255,0.8)' }); } img = cache.flash; }
  ctx.drawImage(img, l.ox, l.oy);
  const px = function (x) { return l.ox + (x + 0.5) * ts; }, py = function (y) { return l.oy + (y + 0.5) * ts; };
  // dots
  const hideDots = sim.phase === 'clear';
  if (!hideDots) for (let i = 0; i < m.N; i++) {
    const k = sim.dots[i]; if (!k) continue; const x = px(m.coord[i * 2]), y = py(m.coord[i * 2 + 1]);
    if (k === 1) S.drawDot(ctx, x, y, ts * 0.11); else S.drawPellet(ctx, x, y, ts * 0.38, t);
  }
  // sprites are clipped to the maze rectangle (tunnel wrap)
  ctx.save(); ctx.beginPath(); ctx.rect(l.ox, l.oy, W * ts, H * ts); ctx.clip();
  if (sim.fruit && (sim.fruit.t > 2 || Math.floor(t * 6) % 2)) { const c = sim.fruit.cell; S.drawFruit(ctx, sim.fruit.kind, px(m.coord[c * 2]), py(m.coord[c * 2 + 1]), ts * 0.42); }
  const showGhosts = sim.phase !== 'dying' && sim.phase !== 'clear' && G.mode !== 'start';
  const P = [0, 0, 0];
  if (showGhosts || G.mode === 'start') for (const g of sim.ghosts) {
    sim.pos(g, P); let x = px(P[0]), y = py(P[1]); const d = g.d >= 0 ? g.d : 1, lx = d === 0 ? 1 : d === 1 ? -1 : 0, ly = d === 2 ? 1 : d === 3 ? -1 : 0;
    if (g.state === 'pen') y += Math.sin(t * 7 + g.id * 2) * ts * 0.1;
    const flash = g.fr && sim.frT < 2.0 && Math.floor(t * 5) % 2 === 0;
    for (let k = -1; k <= 1; k++) {
      const xx = x + k * W * ts; if (xx < l.ox - ts || xx > l.ox + W * ts + ts) continue;
      if (g.state === 'eyes') S.drawEyes(ctx, xx, y, ts * 0.42, lx, ly); else S.drawGhost(ctx, xx, y, ts * 0.42, g.kind, lx, ly, g.fr, flash, t);
    }
  }
  const c = sim.chomper; sim.pos(c, P); const x = px(P[0]), y = py(P[1]);
  const mouth = c.dying > 0 ? 0 : (c.moving || sim.phase !== 'play' ? 0.08 + 0.38 * Math.abs(Math.sin(c.trav * 5.5)) : 0.3);
  for (let k = -1; k <= 1; k++) { const xx = x + k * W * ts; if (xx < l.ox - ts || xx > l.ox + W * ts + ts) continue; S.drawChomper(ctx, xx, y, ts * 0.45, ANG[c.d] || 0, sim.phase === 'ready' || G.mode === 'start' ? 0.35 : mouth, c.dying); }
  ctx.restore();
  // queued direction marker
  if (G.mode === 'play' && c.q >= 0 && c.q !== c.d && sim.phase === 'play') { const a = ANG[c.q]; ctx.fillStyle = 'rgba(255,225,74,0.85)'; ctx.beginPath(); const rr = ts * 0.7; ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); ctx.lineTo(x + Math.cos(a + 2.5) * ts * 0.28 + Math.cos(a) * ts * 0.4, y + Math.sin(a + 2.5) * ts * 0.28 + Math.sin(a) * ts * 0.4); ctx.lineTo(x + Math.cos(a - 2.5) * ts * 0.28 + Math.cos(a) * ts * 0.4, y + Math.sin(a - 2.5) * ts * 0.28 + Math.sin(a) * ts * 0.4); ctx.closePath(); ctx.fill(); }
  // hint arrow
  if (G.hint && G.mode === 'play') {
    const a = ANG[G.hint.dir]; ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = '#ffe14a'; ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 4 * U; ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 10 * U;
    const r0 = ts * 0.7, r1 = ts * 2.1; ctx.beginPath(); ctx.moveTo(r0, 0); ctx.lineTo(r1 - ts * 0.3, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r1 + ts * 0.3, 0); ctx.lineTo(r1 - ts * 0.35, -ts * 0.4); ctx.lineTo(r1 - ts * 0.35, ts * 0.4); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // popups
  for (const p of sim.popups) {
    let X, Y; if (p.ox) { X = px(p.ox[0]); Y = py(p.ox[1]); } else { X = px(m.coord[p.i * 2]); Y = py(m.coord[p.i * 2 + 1]); }
    ctx.globalAlpha = Math.min(1, p.t * 2); G.neon(p.txt, X, Y - (1.4 - Math.min(1.4, p.t * 1.4)) * ts * 0.8, 11, '#7ff0e0', 'center'); ctx.globalAlpha = 1;
  }
};
window.MCRender = R;
})();
