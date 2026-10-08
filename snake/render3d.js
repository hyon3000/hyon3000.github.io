// 3D renderer: software projection (Canvas2D sprites), painter's algorithm, cube arena, drop lines / shadows, axis gizmo.
(function () {
'use strict';
const SP = window.SnakeSprites;
const R = { hueCss: SP.css };
let hs = { x: 0, y: 0, r: 10 };
R.init = function (G) {}; R.resize = function (G) {};
R.headScreen = function (G) { return hs; };
let cY, sY, cP, sP, sc, cx, cy, Dc, W2, Wd;
const tmp = [0, 0, 0, 0];
function pr(x, y, z, o) {
  const X = x - W2, Y = y - W2, Z = z - W2, x1 = X * cY + Z * sY, z1 = -X * sY + Z * cY, y2 = Y * cP + z1 * sP, z2 = -Y * sP + z1 * cP, f = Dc / (Dc + z2);
  o[0] = cx + x1 * f * sc; o[1] = cy - y2 * f * sc; o[2] = z2; o[3] = f; return o;
}
const AXC = ['#ff6a6a', '#6aff9a', '#6ab8ff'], AXN = ['X', 'Y', 'Z'];
let cap = 4096, zs = new Float32Array(cap), kind = new Uint8Array(cap), ref = new Int32Array(cap), ref2 = new Int32Array(cap), sxs = new Float32Array(cap), sys = new Float32Array(cap), rs = new Float32Array(cap), fs = new Float32Array(cap);
const order = [];
const A = [0, 0, 0, 0], B = [0, 0, 0, 0];
R.draw = function (G, dt) {
  const ctx = G.ctx, w = G.w, h = G.h, sim = G.sim, Wd_ = sim.W, U = G.U, t = performance.now() / 1000, cam = G.cam;
  Wd = Wd_; W2 = Wd / 2;
  if (G.mode === 'start') cam.yaw += dt * 0.12;
  cY = Math.cos(cam.yaw); sY = Math.sin(cam.yaw); cP = Math.cos(cam.pitch); sP = Math.sin(cam.pitch);
  sc = Math.min(w * 0.5, h * 0.46) / (Wd * 0.86); cx = w / 2; cy = h * 0.52; Dc = Wd * 4;
  const fwd = [-sY * cP, -sP, cY * cP], right = [cY, 0, sY], up = [-sY * sP, cP, cY * sP];
  ctx.fillStyle = '#080320'; ctx.fillRect(0, 0, w, h);
  const bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.7); bg.addColorStop(0, 'rgba(70,20,120,0.35)'); bg.addColorStop(1, 'rgba(8,3,32,0)'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  // far walls (grid), floor (cyan grid)
  const farC = [fwd[0] > 0 ? Wd : 0, fwd[1] > 0 ? Wd : 0, fwd[2] > 0 ? Wd : 0];
  function wall(a, v, col, fill) {
    const b1 = (a + 1) % 3, b2 = (a + 2) % 3, q = [0, 0, 0];
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const u = Wd * i / 6;
      q[a] = v; q[b1] = u; q[b2] = 0; pr(q[0], q[1], q[2], A); q[b2] = Wd; pr(q[0], q[1], q[2], B); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
      q[b2] = u; q[b1] = 0; pr(q[0], q[1], q[2], A); q[b1] = Wd; pr(q[0], q[1], q[2], B); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
    }
    if (fill) { const c = [[0, 0], [Wd, 0], [Wd, Wd], [0, Wd]]; ctx.save(); ctx.beginPath(); for (let i = 0; i < 4; i++) { q[a] = v; q[b1] = c[i][0]; q[b2] = c[i][1]; pr(q[0], q[1], q[2], A); if (i) ctx.lineTo(A[0], A[1]); else ctx.moveTo(A[0], A[1]); } ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.restore(); ctx.beginPath();
      for (let i = 0; i <= 6; i++) { const u = Wd * i / 6; q[a] = v; q[b1] = u; q[b2] = 0; pr(q[0], q[1], q[2], A); q[b2] = Wd; pr(q[0], q[1], q[2], B); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); q[b2] = u; q[b1] = 0; pr(q[0], q[1], q[2], A); q[b1] = Wd; pr(q[0], q[1], q[2], B); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } }
    ctx.strokeStyle = col; ctx.lineWidth = 1 * U; ctx.stroke();
  }
  for (let a = 0; a < 3; a++) { if (a === 1 && farC[1] === 0) continue; wall(a, farC[a], 'rgba(150,110,255,0.28)', 'rgba(60,20,120,0.18)'); }
  if (farC[1] !== 0) wall(1, 0, 'rgba(0,240,255,0.35)', 'rgba(0,200,255,0.06)');
  else { /* floor is a far wall already: tint it */ }
  const P = sim.player, showP = P && P.alive && G.mode === 'play';
  // drop lines + shadows (heads and orbs) on the floor
  const sq = Math.max(0.18, Math.abs(sP));
  ctx.lineWidth = 1 * U;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath();
  const orbs = sim.orbs;
  for (let i = 0; i < orbs.length; i++) { const o = orbs[i]; pr(o.p[0], o.p[1], o.p[2], A); pr(o.p[0], 0, o.p[2], B); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (let i = 0; i < orbs.length; i++) { const o = orbs[i]; pr(o.p[0], 0, o.p[2], B); const rr = Math.max(1.2 * U, (4 + 2 * Math.sqrt(o.v)) * B[3] * sc * 0.5); ctx.fillRect(B[0] - rr, B[1] - rr * sq, rr * 2, rr * 2 * sq); }
  for (const s of sim.snakes) {
    if (!s.alive) continue;
    pr(s.p[0], s.p[1], s.p[2], A); pr(s.p[0], 0, s.p[2], B);
    const col = s === P ? '#00f0ff' : SP.css(s.hue);
    ctx.strokeStyle = col; ctx.globalAlpha = s === P ? 0.8 : 0.45; ctx.lineWidth = (s === P ? 1.8 : 1.2) * U; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    ctx.fillStyle = col; ctx.globalAlpha = 0.35; const rr = s.r * 1.4 * B[3] * sc; ctx.beginPath(); ctx.ellipse(B[0], B[1], rr, rr * sq, 0, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
  }
  // guide lines from the player's head to the three far walls (cross-hair)
  if (showP) {
    pr(P.p[0], P.p[1], P.p[2], A);
    ctx.strokeStyle = 'rgba(0,240,255,0.55)'; ctx.setLineDash([5 * U, 4 * U]); ctx.lineWidth = 1.2 * U;
    for (let a = 0; a < 3; a++) {
      const q = P.p.slice(); q[a] = farC[a]; pr(q[0], q[1], q[2], B);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = AXC[a]; ctx.beginPath(); ctx.arc(B[0], B[1], 3.5 * U, 0, 6.2832); ctx.stroke(); ctx.setLineDash([5 * U, 4 * U]); ctx.strokeStyle = 'rgba(0,240,255,0.55)';
    }
    ctx.setLineDash([]);
  }
  // sorted items: orbs + snake segments
  let n = 0, need = orbs.length + 8; for (const s of sim.snakes) need += s.seg.length;
  if (need > cap) { cap = need * 2; zs = new Float32Array(cap); kind = new Uint8Array(cap); ref = new Int32Array(cap); ref2 = new Int32Array(cap); sxs = new Float32Array(cap); sys = new Float32Array(cap); rs = new Float32Array(cap); fs = new Float32Array(cap); }
  for (let i = 0; i < orbs.length; i++) { const o = orbs[i]; pr(o.p[0], o.p[1], o.p[2], A); zs[n] = A[2]; kind[n] = 0; ref[n] = i; sxs[n] = A[0]; sys[n] = A[1]; fs[n] = A[3]; rs[n] = (6 + 3 * Math.sqrt(o.v)) * A[3] * sc * (1 + 0.1 * Math.sin(t * 4 + o.id)); n++; }
  const snakes = sim.snakes;
  for (let si = 0; si < snakes.length; si++) {
    const s = snakes[si]; if (!s.alive) continue; const sg = s.seg;
    for (let i = 0; i < sg.length; i++) { const q = sg[i]; pr(q[0], q[1], q[2], A); zs[n] = A[2] - (i === 0 ? s.r * 0.6 : 0); kind[n] = i === 0 ? 2 : 1; ref[n] = si; ref2[n] = i; sxs[n] = A[0]; sys[n] = A[1]; fs[n] = A[3]; rs[n] = s.r * A[3] * sc * (i === 0 ? 1.15 : 1); n++; }
  }
  order.length = n; for (let i = 0; i < n; i++) order[i] = i;
  order.sort(function (a, b) { return zs[b] - zs[a]; });
  const zr = Wd * 0.87;
  for (let k = 0; k < n; k++) {
    const i = order[k], tt = Math.min(1, Math.max(0, (zs[i] + zr) / (2 * zr))), al = 1 - 0.55 * Math.round(tt * 6) / 6, r = rs[i], x = sxs[i], y = sys[i];
    if (ctx.globalAlpha !== al) ctx.globalAlpha = al;
    if (kind[i] === 0) { const o = orbs[ref[i]], d = r * 2.4; ctx.drawImage(SP.orb[o.hue % 12], x - d, y - d, d * 2, d * 2); }
    else {
      const s = snakes[ref[i]], d = r * 1.04;
      ctx.drawImage(SP.body[s.hue % 12][(ref2[i] >> 1) & 1], x - d, y - d, d * 2, d * 2);
      if (kind[i] === 2) {
        ctx.globalAlpha = Math.min(1, al + 0.2); ctx.strokeStyle = s === P ? '#ffffff' : 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.6 * U; ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, 6.2832); ctx.stroke();
        // eyes: two dots on the side facing the camera, looking along the heading
        const hx = s.h, ex = (hx[0] * right[0] + hx[1] * right[1] + hx[2] * right[2]), ey = (hx[0] * up[0] + hx[1] * up[1] + hx[2] * up[2]), ed = hx[0] * fwd[0] + hx[1] * fwd[1] + hx[2] * fwd[2];
        ctx.fillStyle = '#fff'; const er = r * 0.26; for (let sg2 = -1; sg2 <= 1; sg2 += 2) { ctx.beginPath(); ctx.arc(x + (ex * 0.5 + (-ey) * 0.45 * sg2) * r, y - (ey * 0.5 + ex * 0.45 * sg2) * r, er, 0, 6.2832); ctx.fill(); }
        if (ed > 0.5) { /* heading away from the camera: tiny tail-light look */ }
        if (s.boost && s.mass > 12) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, 6.2832); ctx.stroke(); }
      }
    }
  }
  ctx.globalAlpha = 1;
  // cube wireframe
  const C = [];
  for (let i = 0; i < 8; i++) C.push(pr((i & 1) * Wd, ((i >> 1) & 1) * Wd, ((i >> 2) & 1) * Wd, [0, 0, 0, 0]));
  ctx.strokeStyle = '#ff2fd0'; ctx.lineWidth = 2 * U; ctx.shadowColor = '#ff2fd0'; ctx.shadowBlur = 8 * U; ctx.beginPath();
  for (let i = 0; i < 8; i++) for (let b = 0; b < 3; b++) { if (!(i & (1 << b))) { const j = i | (1 << b); ctx.moveTo(C[i][0], C[i][1]); ctx.lineTo(C[j][0], C[j][1]); } }
  ctx.stroke(); ctx.shadowBlur = 0;
  // head screen position + ring
  if (P) { pr(P.p[0], P.p[1], P.p[2], A); hs.x = A[0]; hs.y = A[1]; hs.r = P.r * A[3] * sc; }
  if (showP) {
    const rr = Math.max(26 * U, hs.r * 2) + 2 * U * Math.sin(t * 5);
    ctx.strokeStyle = 'rgba(0,240,255,0.9)'; ctx.lineWidth = 2 * U; ctx.setLineDash([6 * U, 5 * U]); ctx.lineDashOffset = -t * 20; ctx.beginPath(); ctx.arc(hs.x, hs.y, rr, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    if (G.steerPtr) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(hs.x, hs.y); ctx.lineTo(G.steerPtr.x, G.steerPtr.y); ctx.stroke(); }
    if (G.hint) {
      const H = G.hint, sx = H.tw[0] * right[0] + H.tw[1] * right[1] + H.tw[2] * right[2], sy = H.tw[0] * up[0] + H.tw[1] * up[1] + H.tw[2] * up[2];
      let l = Math.hypot(sx, sy); const ux = l > 0.05 ? sx / l : 0, uy = l > 0.05 ? sy / l : 0, L = 80 * U * Math.max(0.4, l);
      ctx.strokeStyle = ctx.fillStyle = '#ffe14a'; ctx.lineWidth = 4 * U; ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 10 * U;
      if (l > 0.05) { const ax = hs.x + ux * (rr + L), ay = hs.y - uy * (rr + L); ctx.beginPath(); ctx.moveTo(hs.x + ux * rr, hs.y - uy * rr); ctx.lineTo(ax, ay); ctx.stroke(); const an = Math.atan2(-uy, ux); ctx.beginPath(); ctx.moveTo(ax + Math.cos(an) * 12 * U, ay + Math.sin(an) * 12 * U); ctx.lineTo(ax + Math.cos(an + 2.5) * 12 * U, ay + Math.sin(an + 2.5) * 12 * U); ctx.lineTo(ax + Math.cos(an - 2.5) * 12 * U, ay + Math.sin(an - 2.5) * 12 * U); ctx.closePath(); ctx.fill(); }
      ctx.shadowBlur = 0;
      if (!H.armed) { ctx.font = 'bold ' + Math.round(13 * U) + 'px monospace'; ctx.textAlign = 'center'; ctx.fillText(G.T('시점을 돌려야 해요', 'rotate the view first'), hs.x, hs.y + rr + 18 * U); }
    }
  }
  // axis gizmo (bottom-left): which axes can be steered right now
  const gx = 62 * U, gy = h - 92 * U, L = 40 * U;
  ctx.fillStyle = 'rgba(8,2,28,0.55)'; ctx.fillRect(gx - 52 * U, gy - 58 * U, 104 * U, 130 * U);
  let dp = 0; for (let a = 1; a < 3; a++) if (Math.abs(fwd[a]) > Math.abs(fwd[dp])) dp = a;
  for (let a = 0; a < 3; a++) {
    const e = [0, 0, 0]; e[a] = 1; const sx = e[0] * right[0] + e[1] * right[1] + e[2] * right[2], sy = e[0] * up[0] + e[1] * up[1] + e[2] * up[2];
    const tx = gx + sx * L, ty = gy - sy * L;
    ctx.strokeStyle = a === dp ? 'rgba(160,160,170,0.55)' : AXC[a]; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = (a === dp ? 1.5 : 3) * U; ctx.setLineDash(a === dp ? [3 * U, 3 * U] : []);
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = 'bold ' + Math.round(11 * U) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(AXN[a] + (a === dp ? '*' : ''), gx + sx * (L + 9 * U), gy - sy * (L + 9 * U));
  }
  ctx.font = Math.round(9.5 * U) + 'px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#c9b8ff';
  const ax2 = [0, 1, 2].filter(function (a) { return a !== dp; });
  ctx.fillText(G.T('조종 평면 ', 'steer ') + AXN[ax2[0]] + '-' + AXN[ax2[1]], gx, gy + 56 * U);
  ctx.fillStyle = '#9a9aa8'; ctx.fillText(G.T('깊이(*) ' , 'depth(*) ') + AXN[dp], gx, gy + 67 * U);
};
window.SnakeRender = R;
})();
