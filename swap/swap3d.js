// Swap Puzzle 3D - a 5x5x5 cube of gems, software Canvas2D projection with painter's algorithm (like the other 3D games).
// Logic (core.js): gravity pulls along -y, matches are lines of 3+ along any of the 3 axes, the WHOLE cube takes part in matching / falling / refilling.
// Touch: only the gems on the outer shell (4 side faces + top) can be swapped, and only on the faces that face the viewer right now; inner gems are drawn small and faint.
// Rotate the view by dragging on empty space (or right mouse drag / arrow keys / Q E) to reach the other faces.  Hint / auto play only use shell swaps and turn the cube to show them.
(function () {
  'use strict';
  const UI = window.SWUI, KO = UI.KO, N = 5;
  const canvas = document.getElementById('app'), ctx = canvas.getContext('2d');
  const G = SW.make(N, N, N, { key: 'swap3d_best_v2', targetScale: 0.6, scoreDiv: 20 });
  G.autoDelay = 0.9;
  const S = { cw: 0, ch: 0, sc: 1, cx: 0, cy: 0, yaw: 0.6, pitch: 0.55, tYaw: null, tPitch: null, sel: -1, down: null, drag: null, tex: null, vis: [0, 0, 0, 0, 0], touch: null, held: { l: 0, r: 0, u: 0, d: 0 } };
  const HINT = KO ? ['젬을 끌거나 두 개를 차례로 눌러 바꾸기', '빈 곳을 끌면 큐브 회전 (겉면만 바꿀 수 있어요)'] : ['Drag a gem or tap two neighbours to swap', 'Drag empty space to rotate (only outer faces swap)'];
  G.minColors = 6;
  G.install();

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    S.cw = canvas.width = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
    S.ch = canvas.height = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
    S.sc = Math.min(S.cw * 0.8 / 7.4, S.ch * 0.52 / 7.0); S.cx = S.cw / 2; S.cy = S.ch * 0.56;
  }
  window.addEventListener('resize', resize);
  // world (X, Y, Z) with Y up, cube centred on the origin: x - N/2 ...
  function view(X, Y, Z) { const cY = Math.cos(S.yaw), sY = Math.sin(S.yaw), cP = Math.cos(S.pitch), sP = Math.sin(S.pitch); const x1 = X * cY + Z * sY, z1 = -X * sY + Z * cY; return [x1, Y * cP + z1 * sP, z1 * cP - Y * sP]; }
  function proj(x, y, z) { const v = view(x - N / 2, y - N / 2, z - N / 2); return [S.cx + v[0] * S.sc, S.cy - v[1] * S.sc, v[2]]; }
  // which faces face the viewer: [+x, -x, +z, -z, +y]
  function faceVis(yaw, pitch) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    return [-sy * cp < -1e-6, sy * cp < -1e-6, cy * cp < -1e-6, -cy * cp < -1e-6, sp > 1e-6];     // depth change along the outward normal < 0
  }
  function touchableWith(vis) {
    const t = new Array(G.N).fill(false);
    for (let i = 0; i < G.N; i++) { const x = G.X(i), y = G.Y(i), z = G.Z(i); t[i] = (x === N - 1 && vis[0]) || (x === 0 && vis[1]) || (z === N - 1 && vis[2]) || (z === 0 && vis[3]) || (y === N - 1 && vis[4]); }
    return t;
  }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  // rotate the cube so that both gems of a planned swap are on faces facing the viewer
  G.onPlan = function (plan) {
    let best = null, bd = 9;
    for (let k = 0; k < 24; k++) {
      const yaw = S.yaw + wrap(k * Math.PI / 12 + 0.3 - S.yaw), pitch = 0.6, t = touchableWith(faceVis(yaw, pitch));
      if (t[plan.a] && t[plan.b]) { const d = Math.abs(wrap(yaw - S.yaw)); if (d < bd) { bd = d; best = yaw; } }
    }
    if (best !== null) { S.tYaw = best; S.tPitch = Math.max(S.pitch, 0.45); }
  };

  function draw() {
    const cw = S.cw, ch = S.ch, sc = S.sc;
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, cw, ch);
    if (G.mode === 'start') { UI.drawStart(ctx, G, cw, ch, S.tex, '3D', HINT); return; }
    if (S.tex) { ctx.globalAlpha = 0.3; ctx.drawImage(S.tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
    UI.drawHud(ctx, G, cw, ch);
    S.vis = faceVis(S.yaw, S.pitch); S.touch = touchableWith(S.vis);
    // cube: back faces (faint fill) and edges
    const C = function (a, b, c) { return proj(a * N, b * N, c * N); };
    const faces = [[[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], 0], [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], 2], [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], 3], [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1], 4], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], 5]];
    faces.forEach(function (f) {
      const back = f[4] === 5 || !S.vis[f[4]]; if (!back) return;
      const P = f.slice(0, 4).map(function (q) { return C(q[0], q[1], q[2]); });
      ctx.fillStyle = 'rgba(40,60,140,0.22)'; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); ctx.fill();
    });
    const items = [], now = performance.now();
    for (const it of G.items()) { const p = proj(it.x + 0.5, it.y + 0.5, it.z + 0.5); items.push({ it: it, p: p, d: p[2] }); }
    for (const q of G.pops) { const p = proj(q.x + 0.5, q.y + 0.5, q.z + 0.5); items.push({ pop: q, p: p, d: p[2] - 5 }); }
    items.sort(function (a, b) { return b.d - a.d; });
    const pulse = 0.6 + 0.4 * Math.sin(now / 120), selOK = S.sel >= 0 && S.touch[S.sel] && G.mode === 'play' && !G.busy();
    for (const o of items) {
      const p = o.p;
      if (o.pop) { UI.drawPop(ctx, o.pop, p[0], p[1], cw); continue; }
      const it = o.it, tch = S.touch[it.i] || it.y >= N;
      const r = sc * (tch ? 0.44 : 0.3) * it.s;
      if (it.v > 0) { ctx.strokeStyle = 'rgba(255,255,255,' + (1 - it.v) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r * (1 + it.v * 0.6), 0, 7); ctx.stroke(); }
      UI.drawGem(ctx, p[0], p[1], r, it.c, tch ? 1 : 0.6, tch ? it.a : it.a * 0.42);
      const hl = (selOK && it.i === S.sel) ? '#fff' : (G.plan && (it.i === G.plan.a || it.i === G.plan.b)) ? '#ff0' : null;
      if (hl) { ctx.save(); ctx.globalAlpha = pulse; ctx.strokeStyle = hl; ctx.lineWidth = Math.max(2, sc * 0.08); ctx.beginPath(); ctx.arc(p[0], p[1], sc * 0.56, 0, 7); ctx.stroke(); ctx.restore(); }
    }
    // edges on top
    ctx.strokeStyle = 'rgba(160,190,255,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      let p = C(a, b, 0), q = C(a, b, 1); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
      p = C(a, 0, b); q = C(a, 1, b); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
      p = C(0, a, b); q = C(1, a, b); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
    UI.drawMsg(ctx, G, cw, ch * 0.27);
    UI.label(ctx, KO ? HINT[1] : HINT[1], cw / 2, ch * 0.935, cw * 0.03, '#999');
    UI.label(ctx, KO ? '드래그/두 번 눌러 바꾸기 · F3 자동 · F4 힌트' : 'Drag / tap two gems to swap · F3 auto · F4 hint', cw / 2, ch * 0.97, cw * 0.027, '#777');
    if (G.mode === 'over') UI.drawOver(ctx, G, cw, ch, 0, ch * 0.3, cw, ch * 0.34);
  }

  // ---------------- input ----------------
  function pos(e) { const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1; return { x: (e.clientX - r.left) * d, y: (e.clientY - r.top) * d }; }
  function gemAt(p) {
    let best = -1, bd = 1e9; const rr = S.sc * 0.5;
    for (let i = 0; i < G.N; i++) {
      if (!S.touch[i] || G.g[i] < 0) continue;
      const q = proj(G.X(i) + 0.5, G.Y(i) + 0.5, G.Z(i) + 0.5);
      if (Math.hypot(q[0] - p.x, q[1] - p.y) < rr && q[2] < bd) { bd = q[2]; best = i; }
    }
    return best;
  }
  function screenOf(i) { return proj(G.X(i) + 0.5, G.Y(i) + 0.5, G.Z(i) + 0.5); }
  function neighbourToward(c, dx, dy) {
    const o = screenOf(c), len = Math.hypot(dx, dy); let best = -1, bc = 0.82;
    const x = G.X(c), y = G.Y(c), z = G.Z(c);
    const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const d of nb) {
      const a = x + d[0], b = y + d[1], e = z + d[2]; if (a < 0 || b < 0 || e < 0 || a >= N || b >= N || e >= N) continue;
      const j = G.idx(a, b, e); if (!S.touch[j]) continue;
      const q = screenOf(j), vx = q[0] - o[0], vy = q[1] - o[1], vl = Math.hypot(vx, vy); if (vl < 1e-3) continue;
      const cs = (vx * dx + vy * dy) / (vl * len); if (cs > bc) { bc = cs; best = j; }
    }
    return best;
  }
  function doSwap(a, b) { S.sel = -1; G.setAuto(false); return G.trySwap(a, b); }
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (G.mode === 'start') { G.newGame(); S.tYaw = null; return; }
    if (G.mode === 'over') { if (performance.now() - (S.overAt || 0) > 500) G.newGame(); return; }
    if (G.auto) G.setAuto(false);
    G.plan = null; G.pendingHint = false; S.tYaw = null;
    const p = pos(e);
    S.touch = touchableWith(faceVis(S.yaw, S.pitch));
    if (e.pointerType === 'mouse' && e.button === 2) { S.drag = { x: p.x, y: p.y, yaw: S.yaw, pitch: S.pitch }; return; }
    const c = gemAt(p);
    if (c >= 0) S.down = { c: c, x: p.x, y: p.y, done: false };
    else { S.down = null; S.drag = { x: p.x, y: p.y, yaw: S.yaw, pitch: S.pitch }; }
  });
  canvas.addEventListener('pointermove', function (e) {
    const p = pos(e), d = S.down;
    if (d && !d.done && G.mode === 'play') {
      const dx = p.x - d.x, dy = p.y - d.y;
      if (Math.hypot(dx, dy) < S.sc * 0.35) return;
      d.done = true;
      const j = neighbourToward(d.c, dx, dy);
      if (j >= 0) doSwap(d.c, j); else { S.down = null; S.drag = { x: d.x, y: d.y, yaw: S.yaw, pitch: S.pitch }; }
    }
    const g = S.drag;
    if (g && G.mode === 'play') { S.yaw = g.yaw - (p.x - g.x) / S.cw * 3.4; S.pitch = Math.max(0.25, Math.min(1.35, g.pitch + (p.y - g.y) / S.ch * 2.4)); }
  });
  window.addEventListener('pointerup', function () {
    const d = S.down; S.down = null; S.drag = null; if (!d || d.done || G.mode !== 'play' || G.busy()) return;
    const c = d.c;
    if (S.sel < 0) S.sel = c; else if (S.sel === c) S.sel = -1; else if (G.adjacent(S.sel, c) && S.touch[S.sel]) doSwap(S.sel, c); else S.sel = c;
  });
  window.addEventListener('keydown', function (e) {
    const k = e.key;
    if (k === 'ArrowLeft') { S.held.l = 1; e.preventDefault(); } else if (k === 'ArrowRight') { S.held.r = 1; e.preventDefault(); } else if (k === 'ArrowUp') { S.held.u = 1; e.preventDefault(); } else if (k === 'ArrowDown') { S.held.d = 1; e.preventDefault(); }
    else if (k === 'q' || k === 'Q') S.yaw += 0.15; else if (k === 'e' || k === 'E') S.yaw -= 0.15;
    else if ((k === ' ' || k === 'Enter') && G.mode !== 'play') { e.preventDefault(); G.newGame(); }
  });
  window.addEventListener('keyup', function (e) { const k = e.key; if (k === 'ArrowLeft') S.held.l = 0; if (k === 'ArrowRight') S.held.r = 0; if (k === 'ArrowUp') S.held.u = 0; if (k === 'ArrowDown') S.held.d = 0; });

  function stepView(dt) {
    S.yaw += (S.held.l - S.held.r) * 1.8 * dt; S.pitch = Math.max(0.25, Math.min(1.35, S.pitch + (S.held.d - S.held.u) * 1.2 * dt));
    if (S.tYaw !== null) {
      const d = S.tYaw - S.yaw, m = 5 * dt; S.yaw += Math.abs(d) <= m ? d : Math.sign(d) * m;
      const dp = S.tPitch - S.pitch; S.pitch += Math.abs(dp) <= m ? dp : Math.sign(dp) * m;
      if (Math.abs(S.tYaw - S.yaw) < 1e-4 && Math.abs(S.tPitch - S.pitch) < 1e-4) S.tYaw = null;
    }
  }
  let last = 0, wasOver = false;
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; stepView(dt); G.update(dt);
    if (G.mode === 'over' && !wasOver) S.overAt = performance.now(); wasOver = G.mode === 'over';
    draw(); requestAnimationFrame(frame);
  }
  function run(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { stepView(1 / 60); G.update(1 / 60); } }
  window.__sw = { mode: '3d', G: G, S: S, SW: SW, run: run, faceVis: faceVis, touchableWith: touchableWith, proj: proj };
  resize();
  UI.loadTexture(1).then(function (t) { S.tex = t; });
  requestAnimationFrame(frame);
})();
