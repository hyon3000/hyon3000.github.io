// 2D renderer: top-down view following the player's head, world grid, danger zone at the border, minimap.
(function () {
'use strict';
const SP = window.SnakeSprites;
const R = { hueCss: SP.css };
let hs = { x: 0, y: 0, r: 10 };
R.init = function (G) {};
R.resize = function (G) {};
R.headScreen = function (G) { return hs; };
function target(G) {
  const sim = G.sim, P = sim.player, c = G.cam;
  if (G.mode !== 'start' && P) return { x: P.p[0], y: P.p[1], m: P.mass };
  let b = null; for (const s of sim.snakes) if (s.alive && (!b || s.mass > b.mass)) b = s; return b ? { x: b.p[0], y: b.p[1], m: b.mass } : { x: sim.W / 2, y: sim.W / 2, m: 10 };
}
R.draw = function (G, dt) {
  const ctx = G.ctx, w = G.w, h = G.h, sim = G.sim, W = sim.W, c = G.cam, U = G.U, t = performance.now() / 1000;
  const tg = target(G), k = Math.min(1, dt * 8);
  c.x += (tg.x - c.x) * k; c.y += (tg.y - c.y) * k;
  const vr = 400 + 12 * Math.sqrt(tg.m), sc0 = Math.min(w, h) / 2 / vr; c.scale += (sc0 - c.scale) * Math.min(1, dt * 3);
  const sc = c.scale, ox = w / 2 - c.x * sc, oy = h / 2 - c.y * sc;
  // outside of the arena = danger red
  ctx.fillStyle = '#2b0614'; ctx.fillRect(0, 0, w, h);
  const x0 = ox, y0 = oy, x1 = ox + W * sc, y1 = oy + W * sc;
  ctx.fillStyle = '#0a0524'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  // grid
  ctx.strokeStyle = 'rgba(140,90,255,0.13)'; ctx.lineWidth = 1; ctx.beginPath();
  const gs = 100, gx0 = Math.max(0, Math.floor((-ox / sc) / gs)), gx1 = Math.min(W / gs, Math.ceil(((w - ox) / sc) / gs)), gy0 = Math.max(0, Math.floor((-oy / sc) / gs)), gy1 = Math.min(W / gs, Math.ceil(((h - oy) / sc) / gs));
  for (let i = gx0; i <= gx1; i++) { const x = ox + i * gs * sc; ctx.moveTo(x, Math.max(0, y0)); ctx.lineTo(x, Math.min(h, y1)); }
  for (let j = gy0; j <= gy1; j++) { const y = oy + j * gs * sc; ctx.moveTo(Math.max(0, x0), y); ctx.lineTo(Math.min(w, x1), y); }
  ctx.stroke();
  // danger band
  const bw = 150 * sc, red0 = 'rgba(255,30,70,0.42)', red1 = 'rgba(255,30,70,0)';
  let g = ctx.createLinearGradient(x0, 0, x0 + bw, 0); g.addColorStop(0, red0); g.addColorStop(1, red1); ctx.fillStyle = g; ctx.fillRect(x0, y0, bw, y1 - y0);
  g = ctx.createLinearGradient(x1, 0, x1 - bw, 0); g.addColorStop(0, red0); g.addColorStop(1, red1); ctx.fillStyle = g; ctx.fillRect(x1 - bw, y0, bw, y1 - y0);
  g = ctx.createLinearGradient(0, y0, 0, y0 + bw); g.addColorStop(0, red0); g.addColorStop(1, red1); ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, bw);
  g = ctx.createLinearGradient(0, y1, 0, y1 - bw); g.addColorStop(0, red0); g.addColorStop(1, red1); ctx.fillStyle = g; ctx.fillRect(x0, y1 - bw, x1 - x0, bw);
  ctx.restore();
  ctx.strokeStyle = '#ff2a5a'; ctx.lineWidth = 3 * U; ctx.shadowColor = '#ff2a5a'; ctx.shadowBlur = 10 * U; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.shadowBlur = 0;
  // orbs
  const orbs = sim.orbs;
  for (let i = 0; i < orbs.length; i++) {
    const o = orbs[i], x = ox + o.p[0] * sc, y = oy + o.p[1] * sc;
    const rr = (5 + 3 * Math.sqrt(o.v)) * sc * (1 + 0.12 * Math.sin(t * 4 + o.id)) * 2.2;
    if (x < -rr || y < -rr || x > w + rr || y > h + rr) continue;
    ctx.drawImage(SP.orb[o.hue % 12], x - rr, y - rr, rr * 2, rr * 2);
  }
  // snakes: smaller first, the player last
  const list = sim.snakes.filter(function (s) { return s.alive; }).sort(function (a, b) { return (a === sim.player) - (b === sim.player) || a.mass - b.mass; });
  for (const s of list) {
    const sg = s.seg, rr = s.r * sc, d = rr * 2.1, hue = s.hue % 12;
    for (let i = sg.length - 1; i >= 0; i--) {
      const q = sg[i], x = ox + q[0] * sc, y = oy + q[1] * sc;
      if (x < -d || y < -d || x > w + d || y > h + d) continue;
      ctx.drawImage(SP.body[hue][(i >> 1) & 1], x - d / 2, y - d / 2, d, d);
    }
    const hx = ox + s.p[0] * sc, hy = oy + s.p[1] * sc;
    if (s === sim.player) { hs.x = hx; hs.y = hy; hs.r = rr; }
    if (s.boost && s.mass > 12) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2 * U; ctx.beginPath(); ctx.arc(hx, hy, rr * 1.5, 0, 6.2832); ctx.stroke(); }
    // eyes
    const hxv = s.h[0], hyv = s.h[1], px = -hyv, py = hxv, er = rr * 0.34;
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      const ex = hx + (hxv * 0.35 + px * 0.5 * sgn) * rr, ey = hy + (hyv * 0.35 + py * 0.5 * sgn) * rr;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + hxv * er * 0.4, ey + hyv * er * 0.4, er * 0.55, 0, 6.2832); ctx.fill();
    }
    if (s !== sim.player || true) { ctx.font = 'bold ' + Math.round(10 * U) + 'px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = s === sim.player ? '#00f0ff' : 'rgba(255,255,255,0.8)'; ctx.fillText(s === sim.player ? G.T('나', 'YOU') : s.name, hx, hy - rr * 1.7 - 3 * U); }
  }
  if (G.mode === 'play' && sim.player.alive) { const rr = Math.max(26 * U, hs.r * 2) + 2 * U * Math.sin(t * 5); ctx.strokeStyle = 'rgba(0,240,255,0.85)'; ctx.lineWidth = 2 * U; ctx.setLineDash([6 * U, 5 * U]); ctx.lineDashOffset = -t * 20; ctx.beginPath(); ctx.arc(hs.x, hs.y, rr, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); if (G.steerPtr) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(hs.x, hs.y); ctx.lineTo(G.steerPtr.x, G.steerPtr.y); ctx.stroke(); } }
  // hint arrow
  if (G.hint && G.mode === 'play' && sim.player.alive) {
    const H = G.hint, L = 90 * U, ax = hs.x + H.tw[0] * L, ay = hs.y + H.tw[1] * L;
    ctx.strokeStyle = '#ffe14a'; ctx.fillStyle = '#ffe14a'; ctx.lineWidth = 4 * U; ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 10 * U;
    ctx.beginPath(); ctx.arc(hs.x, hs.y, hs.r * 2.2, 0, 6.2832); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hs.x + H.tw[0] * hs.r * 2.4, hs.y + H.tw[1] * hs.r * 2.4); ctx.lineTo(ax, ay); ctx.stroke();
    const an = Math.atan2(H.tw[1], H.tw[0]); ctx.beginPath(); ctx.moveTo(ax + Math.cos(an) * 12 * U, ay + Math.sin(an) * 12 * U); ctx.lineTo(ax + Math.cos(an + 2.5) * 12 * U, ay + Math.sin(an + 2.5) * 12 * U); ctx.lineTo(ax + Math.cos(an - 2.5) * 12 * U, ay + Math.sin(an - 2.5) * 12 * U); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    if (H.boost) { ctx.font = 'bold ' + Math.round(12 * U) + 'px monospace'; ctx.textAlign = 'center'; ctx.fillText(G.T('부스트!', 'BOOST!'), hs.x, hs.y + hs.r * 3.6 + 10 * U); }
  }
  // minimap
  const ms = Math.min(100 * U, Math.min(w, h) * 0.24), mx = 10 * U, my = h - ms - 10 * U;
  ctx.fillStyle = 'rgba(8,2,28,0.65)'; ctx.fillRect(mx, my, ms, ms); ctx.strokeStyle = '#ff2a5a'; ctx.lineWidth = 1.5 * U; ctx.strokeRect(mx, my, ms, ms);
  for (const s of sim.snakes) { if (!s.alive) continue; ctx.fillStyle = s === sim.player ? '#fff' : SP.css(s.hue); const rr = (s === sim.player ? 3.2 : 2) * U; ctx.fillRect(mx + s.p[0] / W * ms - rr / 2, my + s.p[1] / W * ms - rr / 2, rr, rr); }
  const vw = w / sc / W * ms, vh = h / sc / W * ms; ctx.strokeStyle = 'rgba(0,240,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(mx + (c.x / W) * ms - vw / 2, my + (c.y / W) * ms - vh / 2, vw, vh);
};
window.SnakeRender = R;
})();
