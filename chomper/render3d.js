// 3D renderer: software perspective projection on Canvas2D, painter's algorithm, translucent wall faces, floor shadows / drop lines, axis gizmo.
(function () {
'use strict';
const S = window.MCSprites, R = {};
let cY = 1, sY = 0, cP = 1, sP = 0, sc = 50, cx = 0, cy = 0, Dc = 22, cur = [0, 0, 0];
const AXC = ['#ff6a6a', '#6aff9a', '#6ab8ff'], AXN = ['X', 'Y', 'Z'];
let facesFor = null, faces = [];
function setup(G) {
  const cam = G.cam, m = G.sim.maze, U = G.U;
  cY = Math.cos(cam.yaw); sY = Math.sin(cam.yaw); cP = Math.cos(cam.pitch); sP = Math.sin(cam.pitch);
  cur = [(m.dims[0] - 1) / 2, (m.dims[1] - 1) / 2, (m.dims[2] - 1) / 2];
  const top = 40 * U, bot = 30 * U; sc = Math.min(G.w * 0.5, (G.h - top - bot) * 0.5) / 5.3; cx = G.w / 2; cy = top + (G.h - top - bot) / 2; Dc = 22;
}
// world point in grid units (cell centre = integer coordinates) -> out [sx, sy, depth, scale]
function pr(x, y, z, o) {
  const X = x - cur[0], Y = y - cur[1], Z = z - cur[2], x1 = X * cY + Z * sY, z1 = -X * sY + Z * cY, y2 = Y * cP + z1 * sP, z2 = -Y * sP + z1 * cP, f = Dc / (Dc + z2);
  o[0] = cx + x1 * f * sc; o[1] = cy - y2 * f * sc; o[2] = z2; o[3] = f; return o;
}
R.init = function (G) {}; R.resize = function (G) {};
R.chomperScreen = function (G) { setup(G); const p = G.sim.pos(G.sim.chomper, [0, 0, 0]), o = [0, 0, 0, 0]; pr(p[0], p[1], p[2], o); return { x: o[0], y: o[1], r: 0.32 * o[3] * sc }; };
function buildFaces(m) {
  faces = []; const X = m.dims[0], Y = m.dims[1], Z = m.dims[2];
  for (let i = 0; i < m.N; i++) {
    const x = m.coord[i * 3], y = m.coord[i * 3 + 1], z = m.coord[i * 3 + 2];
    for (let a = 0; a < 3; a++) {
      const lim = a === 0 ? X : a === 1 ? Y : Z, c = a === 0 ? x : a === 1 ? y : z; if (c + 1 >= lim) continue;
      if (m.nb[i * 6 + a * 2] < 0) faces.push({ x: x + (a === 0 ? 0.5 : 0), y: y + (a === 1 ? 0.5 : 0), z: z + (a === 2 ? 0.5 : 0), a: a });
    }
  }
  facesFor = m;
}
const A = [0, 0, 0, 0], B = [0, 0, 0, 0], C2 = [0, 0, 0, 0], D2 = [0, 0, 0, 0], T4 = [0, 0, 0, 0];
const FC = ['106,150,255', '186,106,255', '255,106,196'];     // wall tints by face orientation (x, y, z)
let it = { z: [], k: [], r: [] };
R.draw = function (G, dt) {
  const ctx = G.ctx, sim = G.sim, m = sim.maze, U = G.U, t = performance.now() / 1000, w = G.w, h = G.h;
  setup(G); if (facesFor !== m) buildFaces(m);
  const pal = S.PALETTES[((sim.level - 1) % 4 + 4) % 4], X = m.dims[0], Y = m.dims[1], Z = m.dims[2];
  ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, w, h);
  const bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.7); bg.addColorStop(0, 'rgba(90,40,150,0.30)'); bg.addColorStop(1, 'rgba(8,3,32,0)'); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const fwd = [-sY * cP, -sP, cY * cP], right = [cY, 0, sY], up = [-sY * sP, cP, cY * sP];
  const lo = [-0.5, -0.5, -0.5], hi = [X - 0.5, Y - 0.5, Z - 0.5];
  // far faces of the outer box with a faint grid
  function boxFace(a, v, col, fill, grid) {
    const b1 = (a + 1) % 3, b2 = (a + 2) % 3, q = [0, 0, 0];
    ctx.beginPath();
    const c = [[lo[b1], lo[b2]], [hi[b1], lo[b2]], [hi[b1], hi[b2]], [lo[b1], hi[b2]]];
    for (let i = 0; i < 4; i++) { q[a] = v; q[b1] = c[i][0]; q[b2] = c[i][1]; pr(q[0], q[1], q[2], A); if (i) ctx.lineTo(A[0], A[1]); else ctx.moveTo(A[0], A[1]); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (grid) {
      ctx.beginPath();
      for (let u = lo[b1]; u <= hi[b1] + 0.01; u += 1) { q[a] = v; q[b1] = u; q[b2] = lo[b2]; pr(q[0], q[1], q[2], A); q[b2] = hi[b2]; pr(q[0], q[1], q[2], B); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      for (let u = lo[b2]; u <= hi[b2] + 0.01; u += 1) { q[a] = v; q[b2] = u; q[b1] = lo[b1]; pr(q[0], q[1], q[2], A); q[b1] = hi[b1]; pr(q[0], q[1], q[2], B); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
      ctx.strokeStyle = col; ctx.lineWidth = 1 * U; ctx.stroke();
    }
  }
  const farV = [fwd[0] > 0 ? hi[0] : lo[0], fwd[1] > 0 ? hi[1] : lo[1], fwd[2] > 0 ? hi[2] : lo[2]];
  for (let a = 0; a < 3; a++) boxFace(a, farV[a], 'rgba(150,120,255,0.20)', 'rgba(60,30,120,0.16)', true);
  // the floor (bottom, y = lo) is always shown: a cyan grid when it is not a far face
  if (fwd[1] <= 0) boxFace(1, lo[1], 'rgba(70,217,255,0.32)', 'rgba(0,160,255,0.06)', true);
  // chosen layer (the chomper's y): outline of the horizontal slab
  const P0 = sim.pos(sim.chomper, [0, 0, 0]);
  ctx.strokeStyle = 'rgba(127,240,224,0.35)'; ctx.lineWidth = 1.2 * U; ctx.setLineDash([4 * U, 4 * U]); ctx.beginPath();
  const ly = P0[1]; pr(lo[0], ly, lo[2], A); ctx.moveTo(A[0], A[1]); pr(hi[0], ly, lo[2], A); ctx.lineTo(A[0], A[1]); pr(hi[0], ly, hi[2], A); ctx.lineTo(A[0], A[1]); pr(lo[0], ly, hi[2], A); ctx.lineTo(A[0], A[1]); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  // gather sortable items: wall faces, dots, pellets, fruit, actors
  let n = 0;
  const need = faces.length + m.N + 16; if (it.z.length < need) { it.z = new Float32Array(need * 2); it.k = new Int32Array(need * 2); it.r = new Int32Array(need * 2); }
  const Z_ = it.z, K_ = it.k, R_ = it.r;
  for (let i = 0; i < faces.length; i++) { const f = faces[i]; pr(f.x, f.y, f.z, A); Z_[n] = A[2]; K_[n] = 0; R_[n] = i; n++; }
  const dots = sim.dots;
  for (let i = 0; i < m.N; i++) { if (!dots[i]) continue; pr(m.coord[i * 3], m.coord[i * 3 + 1], m.coord[i * 3 + 2], A); Z_[n] = A[2]; K_[n] = dots[i] === 1 ? 1 : 2; R_[n] = i; n++; }
  const showAct = sim.phase !== 'clear' && !(sim.phase === 'dying' && false);
  if (sim.fruit) { const c = sim.fruit.cell; pr(m.coord[c * 3], m.coord[c * 3 + 1], m.coord[c * 3 + 2], A); Z_[n] = A[2]; K_[n] = 3; R_[n] = 0; n++; }
  const gp = [];
  for (let gi = 0; gi < sim.ghosts.length; gi++) { const g = sim.ghosts[gi], p = sim.pos(g, [0, 0, 0]); if (g.state === 'pen') { p[0] += (gi - 1) * 0.16; p[1] += Math.sin(t * 6 + gi) * 0.06; } gp.push(p); pr(p[0], p[1], p[2], A); Z_[n] = A[2] - 0.2; K_[n] = 4; R_[n] = gi; n++; }
  const order = new Array(n); for (let i = 0; i < n; i++) order[i] = i; order.sort(function (a, b) { return Z_[b] - Z_[a]; });
  // floor shadows + drop lines for the actors and pellets
  const fy = lo[1], sq = Math.max(0.2, Math.abs(sP));
  function drop(p, col, rad, al) {
    pr(p[0], p[1], p[2], A); pr(p[0], fy, p[2], B);
    ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.lineWidth = 1 * U; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    ctx.fillStyle = col; ctx.globalAlpha = al * 0.55; const rr = rad * B[3] * sc; ctx.beginPath(); ctx.ellipse(B[0], B[1], rr, rr * sq, 0, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
  }
  for (let gi = 0; gi < sim.ghosts.length; gi++) { const g = sim.ghosts[gi]; if (g.state === 'pen' || sim.phase === 'clear') continue; drop(gp[gi], g.fr ? '#1aa6a0' : S.GHOSTS[g.kind % 4].col, 0.3, 0.45); }
  drop(P0, '#7cf05a', 0.32, 0.8);
  if (sim.fruit) { const c = sim.fruit.cell; drop([m.coord[c * 3], m.coord[c * 3 + 1], m.coord[c * 3 + 2]], '#ffe14a', 0.2, 0.4); }
  for (let i = 0; i < m.N; i++) if (dots[i] === 2) drop([m.coord[i * 3], m.coord[i * 3 + 1], m.coord[i * 3 + 2]], '#ffd0ea', 0.2, 0.3);
  // painter's loop
  const lyr = Math.round(P0[1]), zr = 5.6; let lastAl = -1; const dir0 = sim.chomper.d;
  for (let q = 0; q < n; q++) {
    const i = order[q], k = K_[i], r = R_[i];
    if (k === 0) {
      const f = faces[r], a = f.a, b1 = (a + 1) % 3, b2 = (a + 2) % 3, e = [f.x, f.y, f.z], tt = Math.min(1, Math.max(0, (Z_[i] + zr) / (2 * zr))), al = 1 - 0.6 * tt;
      ctx.beginPath();
      for (let c = 0; c < 4; c++) { const o = [e[0], e[1], e[2]]; o[b1] += (c === 1 || c === 2) ? 0.5 : -0.5; o[b2] += (c >= 2) ? 0.5 : -0.5; pr(o[0], o[1], o[2], A); if (c) ctx.lineTo(A[0], A[1]); else ctx.moveTo(A[0], A[1]); }
      const foc = a === 1 ? (Math.abs(f.y - ly) <= 0.51 ? 1 : 0.22) : (Math.abs(f.y - ly) < 0.6 ? 1 : 0.22), aa = al * foc;
      ctx.closePath(); ctx.fillStyle = 'rgba(' + FC[a] + ',' + (0.2 * aa).toFixed(3) + ')'; ctx.fill(); ctx.strokeStyle = 'rgba(' + FC[a] + ',' + (0.55 * aa).toFixed(3) + ')'; ctx.lineWidth = (foc === 1 ? 1.3 : 0.8) * U; ctx.stroke();
      continue;
    }
    let p, rad;
    if (k === 1 || k === 2) { const c = r; p = [m.coord[c * 3], m.coord[c * 3 + 1], m.coord[c * 3 + 2]]; }
    else if (k === 3) { const c = sim.fruit.cell; p = [m.coord[c * 3], m.coord[c * 3 + 1], m.coord[c * 3 + 2]]; }
    else p = gp[r];
    pr(p[0], p[1], p[2], A); const x = A[0], y = A[1], f = A[3], tt = Math.min(1, Math.max(0, (A[2] + zr) / (2 * zr))), al = 1 - 0.55 * Math.round(tt * 6) / 6;
    if (al !== lastAl) { ctx.globalAlpha = al; lastAl = al; }
    if (k === 1) { const rr = Math.max(1.3 * U, 0.075 * f * sc); ctx.fillStyle = '#ffe9c9'; ctx.beginPath(); ctx.arc(x, y, rr, 0, 6.2832); ctx.fill(); }
    else if (k === 2) S.drawPellet(ctx, x, y, 0.24 * f * sc, t);
    else if (k === 3) { if (sim.fruit && (sim.fruit.t > 2 || Math.floor(t * 6) % 2)) S.drawFruit(ctx, sim.fruit.kind, x, y, 0.3 * f * sc); }
    else {
      const g = sim.ghosts[r]; if (sim.phase === 'dying' || sim.phase === 'clear') continue;
      const d = g.d >= 0 ? g.d : 0, v = G.dirScreen(d), lx = v[0], ly = -v[1], rr = 0.3 * f * sc, flash = g.fr && sim.frT < 2.0 && Math.floor(t * 5) % 2 === 0;
      if (g.state === 'eyes') S.drawEyes(ctx, x, y, rr * 1.1, lx, ly); else S.drawGhost(ctx, x, y, rr, g.kind, lx, ly, g.fr, flash, t);
    }
  }
  ctx.globalAlpha = 1;
  { // the chomper is always drawn on top (full strength) so it never gets lost in the maze
    pr(P0[0], P0[1], P0[2], A); const c = sim.chomper, v = G.dirScreen(c.d), l = Math.hypot(v[0], v[1]), ang = l > 0.2 ? Math.atan2(-v[1], v[0]) : Math.PI / 2, rr = 0.36 * A[3] * sc;
    const mouth = c.dying > 0 ? 0 : (c.moving || sim.phase !== 'play' ? 0.08 + 0.38 * Math.abs(Math.sin(c.trav * 5.5)) : 0.3);
    ctx.shadowColor = '#b8ff8a'; ctx.shadowBlur = 10 * U; S.drawChomper(ctx, A[0], A[1], rr, ang, sim.phase === 'ready' || G.mode === 'start' ? 0.35 : mouth, c.dying); ctx.shadowBlur = 0;
  }
  // outer box frame
  const Cn = []; for (let i = 0; i < 8; i++) Cn.push(pr((i & 1) ? hi[0] : lo[0], (i & 2) ? hi[1] : lo[1], (i & 4) ? hi[2] : lo[2], [0, 0, 0, 0]));
  ctx.strokeStyle = pal.edge; ctx.lineWidth = 2 * U; ctx.shadowColor = pal.glow; ctx.shadowBlur = 8 * U; ctx.beginPath();
  for (let i = 0; i < 8; i++) for (let b = 0; b < 3; b++) if (!(i & (1 << b))) { const j = i | (1 << b); ctx.moveTo(Cn[i][0], Cn[i][1]); ctx.lineTo(Cn[j][0], Cn[j][1]); }
  ctx.stroke(); ctx.shadowBlur = 0;
  // ring around the chomper, steering line, queued / hint arrows
  const hs = R.chomperScreen(G);
  if (G.mode === 'play') {
    const rr = Math.max(26 * U, hs.r * 2) + 2 * U * Math.sin(t * 5);
    ctx.strokeStyle = 'rgba(127,240,224,0.9)'; ctx.lineWidth = 2 * U; ctx.setLineDash([6 * U, 5 * U]); ctx.lineDashOffset = -t * 20; ctx.beginPath(); ctx.arc(hs.x, hs.y, rr, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    if (G.steerPtr) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(hs.x, hs.y); ctx.lineTo(G.steerPtr.x, G.steerPtr.y); ctx.stroke(); }
    function arrow(d, col, len, lw) {
      const v = G.dirScreen(d), l = Math.hypot(v[0], v[1]); if (l < 0.06) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(hs.x, hs.y, rr * 0.5, 0, 6.2832); ctx.stroke(); return; }
      const ux = v[0] / l, uy = -v[1] / l, L = len * U * Math.max(0.45, l);
      ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = lw * U; ctx.shadowColor = col; ctx.shadowBlur = 8 * U;
      const ax = hs.x + ux * (rr + L), ay = hs.y + uy * (rr + L); ctx.beginPath(); ctx.moveTo(hs.x + ux * rr, hs.y + uy * rr); ctx.lineTo(ax, ay); ctx.stroke();
      const an = Math.atan2(uy, ux); ctx.beginPath(); ctx.moveTo(ax + Math.cos(an) * 11 * U, ay + Math.sin(an) * 11 * U); ctx.lineTo(ax + Math.cos(an + 2.5) * 10 * U, ay + Math.sin(an + 2.5) * 10 * U); ctx.lineTo(ax + Math.cos(an - 2.5) * 10 * U, ay + Math.sin(an - 2.5) * 10 * U); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    }
    const c = sim.chomper; if (c.q >= 0 && c.q !== c.d) arrow(c.q, 'rgba(127,240,224,0.9)', 26, 3);
    if (G.hint) arrow(G.hint.dir, '#ffe14a', 56, 4);
  }
  // axis gizmo (bottom-left): the two steerable axes bright, the depth axis dashed
  const gx = 62 * U, gy = h - 104 * U, L = 38 * U;
  ctx.fillStyle = 'rgba(8,2,28,0.55)'; ctx.fillRect(gx - 52 * U, gy - 52 * U, 104 * U, 118 * U);
  const dp = G.depthAxis();
  for (let a = 0; a < 3; a++) {
    const sx = right[a], sy = up[a], tx = gx + sx * L, ty = gy - sy * L;
    ctx.strokeStyle = a === dp ? 'rgba(160,160,170,0.55)' : AXC[a]; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = (a === dp ? 1.5 : 3) * U; ctx.setLineDash(a === dp ? [3 * U, 3 * U] : []);
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = 'bold ' + Math.round(11 * U) + 'px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(AXN[a] + (a === dp ? '*' : ''), gx + sx * (L + 9 * U), gy - sy * (L + 9 * U));
  }
  const ax2 = [0, 1, 2].filter(function (a) { return a !== dp; });
  ctx.font = Math.round(9.5 * U) + 'px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#c9b8ff';
  ctx.fillText(G.T('조종 평면 ', 'steer ') + AXN[ax2[0]] + '-' + AXN[ax2[1]], gx, gy + 50 * U);
  ctx.fillStyle = '#9a9aa8'; ctx.fillText(G.T('깊이(*) ', 'depth(*) ') + AXN[dp], gx, gy + 61 * U);
  // score popups
  for (const p of sim.popups) {
    let q; if (p.ox) q = p.ox; else q = [m.coord[p.i * 3], m.coord[p.i * 3 + 1], m.coord[p.i * 3 + 2]]; pr(q[0], q[1], q[2], A);
    ctx.globalAlpha = Math.min(1, p.t * 2); G.neon(p.txt, A[0], A[1] - (1.4 - Math.min(1.4, p.t * 1.4)) * 20 * U, 11, '#7ff0e0', 'center'); ctx.globalAlpha = 1;
  }
};
window.MCRender = R;
})();
