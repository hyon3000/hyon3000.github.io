// Bubble Shooter 3D - a vertical shaft (6 x 6 cross-section, 14 high) with a cluster of bubbles hanging from the ceiling.
// GRID: simple cubic grid, one bubble per 1x1x1 cell (cell (k, i, j): k = layer counted from the ceiling, i / j = column on the floor).  Every bubble touches its 6 face neighbours
// (up / down / left / right / front / back); that is what "connected" means for popping (>= 3 of the same colour) and for hanging from the ceiling (layer 0 = ceiling).
// A bubble that flies (radius 0.5) bounces off the 4 walls, sticks when its centre is closer than 0.92 to a bubble centre or when it reaches the ceiling layer, and
// is put into the nearest empty cell that touches the ceiling or a bubble.  Software Canvas2D projection with painter's algorithm (like the Atari 3D game).
// Physics runs in (x, y) = floor, z = height; world used for drawing is (X, Y, Z) = (x, z, y).
(function () {
  'use strict';
  const BO = window.BO, KO = BO.KO;
  const canvas = document.getElementById('app'), ctx = canvas.getContext('2d');
  const N = 6, H = 14, MAXK = 14, DK = 11, SPEED = 18, STEP = 0.12, HIT = 0.92, SH = [3, 3, 0.5];      // layer >= DK = game over
  const L = KO ? { over: '게임 오버', retry: '다시 하려면 터치', aim: '바닥 지도 / 발사대: 누르고 움직여 조준, 떼면 발사', rot: ['다른 곳을 끌면', '시점 회전'], level: '레벨', clear: '모두 제거! +100', next: '다음', row: '새 층: %발 후' }
              : { over: 'GAME OVER', retry: 'TAP TO RETRY', aim: 'Map / shooter: press, move to aim, release to fire', rot: ['Drag elsewhere to', 'rotate the view'], level: 'LEVEL', clear: 'CLEARED +100', next: 'NEXT', row: 'NEW LAYER IN % SHOT(S)' };
  const S = { mode: 'start', level: 1, score: 0, best: 0, grid: [], since: 0, rows: 0, nc: 2, cur: 0, next: 0, shot: null, shotCount: 0, az: 0.8, el: 1.2, fx: [], plan: null, auto: false, autoT: 0,
    yaw: -0.5, pitch: 0.5, msg: '', msgT: 0, flash: 0, over0: 0, cw: 0, ch: 0, sc: 1, cx: 0, cy: 0, tex: null, bg: null, drag: null, held: { l: 0, r: 0, u: 0, d: 0 } };
  try { S.best = parseInt(localStorage.getItem('bubble3d_best'), 10) || 0; } catch (e) {}
  const nextRect = function () { return { x: S.cw * 0.62, y: S.ch * 0.77, w: S.cw * 0.34, h: S.ch * 0.2 }; };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    S.cw = canvas.width = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
    S.ch = canvas.height = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
    S.sc = Math.min(S.cw * 0.95 / 9.6, S.ch * 0.62 / 13.6); S.cx = S.cw * 0.5; S.cy = S.ch * 0.42;
  }
  window.addEventListener('resize', resize);
  function view(X, Y, Z) { const cY = Math.cos(S.yaw), sY = Math.sin(S.yaw), cP = Math.cos(S.pitch), sP = Math.sin(S.pitch); X -= N / 2; Y -= H / 2; Z -= N / 2; const x1 = X * cY + Z * sY, z1 = -X * sY + Z * cY; return [x1, Y * cP + z1 * sP, z1 * cP - Y * sP]; }
  function projW(X, Y, Z) { const v = view(X, Y, Z); return [S.cx + v[0] * S.sc, S.cy - v[1] * S.sc, v[2]]; }
  function proj(x, y, z) { return projW(x, z, y); }

  // ---------------- grid ----------------
  function newGrid() { const g = []; for (let k = 0; k < MAXK; k++) g.push(new Array(N * N).fill(-1)); return g; }
  function cellPos(k, i, j) { return [i + 0.5, j + 0.5, H - 0.5 - k]; }
  function cloneG(g) { return g.map(function (l) { return l.slice(); }); }
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  function nbrs(k, i, j) { const o = []; for (const d of DIRS) { const a = k + d[2], b = i + d[0], c = j + d[1]; if (a >= 0 && a < MAXK && b >= 0 && b < N && c >= 0 && c < N) o.push([a, b, c]); } return o; }
  function count(g) { let n = 0; for (const l of g) for (const v of l) if (v >= 0) n++; return n; }
  function present(g) { const s = {}; for (const l of g) for (const v of l) if (v >= 0) s[v] = 1; return Object.keys(s).map(Number); }
  function maxLayer(g) { for (let k = MAXK - 1; k >= 0; k--) for (let q = 0; q < N * N; q++) if (g[k][q] >= 0) return k; return -1; }
  function pickColor() { const p = present(S.grid); return p.length ? p[Math.floor(Math.random() * p.length)] : Math.floor(Math.random() * S.nc); }
  function fixSupply() { const p = present(S.grid); if (!p.length) return; if (p.indexOf(S.cur) < 0) S.cur = pickColor(); if (p.indexOf(S.next) < 0) S.next = pickColor(); }
  function randLayer(g, k, nc, dens) {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (Math.random() > dens) { g[k][i * N + j] = -1; continue; }
      let v = Math.floor(Math.random() * nc), q = Math.random();
      if (q < 0.35 && i > 0 && g[k][(i - 1) * N + j] >= 0) v = g[k][(i - 1) * N + j];
      else if (q < 0.6 && j > 0 && g[k][i * N + j - 1] >= 0) v = g[k][i * N + j - 1];
      else if (q < 0.85 && k + 1 < MAXK && g[k + 1][i * N + j] >= 0) v = g[k + 1][i * N + j];
      g[k][i * N + j] = v;
    }
  }
  function dropFloating(g) { const res = [], ok = {}, q = []; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (g[0][i * N + j] >= 0) { ok['0,' + i + ',' + j] = 1; q.push([0, i, j]); }
    for (let a = 0; a < q.length; a++) for (const p of nbrs(q[a][0], q[a][1], q[a][2])) { const key = p.join(','); if (!ok[key] && g[p[0]][p[1] * N + p[2]] >= 0) { ok[key] = 1; q.push(p); } }
    for (let k = 0; k < MAXK; k++) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (g[k][i * N + j] >= 0 && !ok[k + ',' + i + ',' + j]) { res.push({ k: k, i: i, j: j, col: g[k][i * N + j] }); g[k][i * N + j] = -1; }
    return res; }
  function buildLevel(level) {
    S.level = level; S.nc = BO.numColors(level); S.since = 0; S.rows = 0; S.shot = null; S.fx = []; S.plan = null;
    const g = newGrid(), layers = 3;
    for (let k = layers - 1; k >= 0; k--) randLayer(g, k, S.nc, k === 0 ? 0.9 : 0.7);
    dropFloating(g);
    for (let c = 0; c < S.nc; c++) if (present(g).indexOf(c) < 0) { for (let t = 0; t < 99; t++) { const q = Math.floor(Math.random() * N * N); if (g[0][q] >= 0 || g[1][q] >= 0) { g[g[0][q] >= 0 ? 0 : 1][q] = c; break; } } }
    S.grid = g; S.cur = pickColor(); S.next = pickColor();
  }
  function newGame() { S.score = 0; S.mode = 'play'; buildLevel(1); S.shotCount = 0; S.msg = ''; S.msgT = 0; aimFromFloor(3.8, 3.9); S.yaw = -0.5; S.pitch = 0.5; }

  // ---------------- physics ----------------
  function dirOf(az, el) { return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]; }
  function stepOne(s, g) {                                                   // one micro step; true = stuck
    s.x += s.dx * STEP; s.y += s.dy * STEP; s.z += s.dz * STEP; s.bounced = false;
    if (s.x < 0.5) { s.x = 1 - s.x; s.dx = -s.dx; s.bounced = true; } else if (s.x > N - 0.5) { s.x = 2 * N - 1 - s.x; s.dx = -s.dx; s.bounced = true; }
    if (s.y < 0.5) { s.y = 1 - s.y; s.dy = -s.dy; s.bounced = true; } else if (s.y > N - 0.5) { s.y = 2 * N - 1 - s.y; s.dy = -s.dy; s.bounced = true; }
    if (s.z >= H - 0.5) return true;
    const ci = Math.floor(s.x), cj = Math.floor(s.y), ck = Math.floor(H - s.z), lim = HIT * HIT;
    for (let k = Math.max(0, ck - 1); k <= Math.min(MAXK - 1, ck + 1); k++) for (let i = Math.max(0, ci - 1); i <= Math.min(N - 1, ci + 1); i++) for (let j = Math.max(0, cj - 1); j <= Math.min(N - 1, cj + 1); j++) if (g[k][i * N + j] >= 0) {
      const dx = i + 0.5 - s.x, dy = j + 0.5 - s.y, dz = H - 0.5 - k - s.z; if (dx * dx + dy * dy + dz * dz < lim) return true;
    }
    return false;
  }
  function snapCell(g, x, y, z) {
    const ci = Math.floor(x), cj = Math.floor(y), ck = Math.floor(H - z); let best = null, bd = 1e9;
    for (let k = Math.max(0, ck - 1); k <= Math.min(MAXK - 1, ck + 1); k++) for (let i = Math.max(0, ci - 1); i <= Math.min(N - 1, ci + 1); i++) for (let j = Math.max(0, cj - 1); j <= Math.min(N - 1, cj + 1); j++) {
      if (g[k][i * N + j] >= 0) continue;
      let sup = k === 0; if (!sup) for (const p of nbrs(k, i, j)) if (g[p[0]][p[1] * N + p[2]] >= 0) { sup = true; break; }
      if (!sup) continue;
      const c = cellPos(k, i, j), d = (c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y) + (c[2] - z) * (c[2] - z); if (d < bd) { bd = d; best = [k, i, j]; }
    }
    return best;
  }
  function trace(g, az, el, maxBounce) {
    const d = dirOf(az, el), s = { x: SH[0], y: SH[1], z: SH[2], dx: d[0], dy: d[1], dz: d[2] }, pts = [[s.x, s.y, s.z]]; let b = 0, n = 0;
    while (n++ < 3000) {
      const st = stepOne(s, g);
      if (s.bounced) { pts.push([s.x, s.y, s.z]); b++; if (maxBounce !== undefined && b >= maxBounce) return { pts: pts, cell: null }; }
      if (st) { pts.push([s.x, s.y, s.z]); return { pts: pts, cell: snapCell(g, s.x, s.y, s.z), bounces: b }; }
    }
    return { pts: pts, cell: null };
  }
  function resolve(g, k, i, j, col) {
    g[k][i * N + j] = col; const seen = {}, grp = [[k, i, j]]; seen[k + ',' + i + ',' + j] = 1;
    for (let a = 0; a < grp.length; a++) for (const p of nbrs(grp[a][0], grp[a][1], grp[a][2])) { const key = p.join(','); if (!seen[key] && g[p[0]][p[1] * N + p[2]] === col) { seen[key] = 1; grp.push(p); } }
    const res = { pops: [], falls: [] }; if (grp.length < 3) return res;
    for (const p of grp) { res.pops.push({ k: p[0], i: p[1], j: p[2], col: col }); g[p[0]][p[1] * N + p[2]] = -1; }
    res.falls = dropFloating(g); return res;
  }
  // New layer: a column continues upwards (a bubble above one of the layer below) with probability 0.7, otherwise a bubble appears with probability 0.2 (about 40 % filled in the long run);
  // what is then not connected to the ceiling falls.
  function pushLayer() {
    const below = S.grid[0]; S.grid.pop(); S.grid.unshift(new Array(N * N).fill(-1));
    randLayer(S.grid, 0, S.nc, 1); for (let q = 0; q < N * N; q++) if (Math.random() >= (below[q] >= 0 ? 0.7 : 0.2)) S.grid[0][q] = -1;
    return dropFloating(S.grid);
  }
  // Every 2nd shot (whatever it did) a new layer appears on top and the cluster moves down one layer.  Every 6 added layers the level rises: that only changes the number of
  // colours used for bubbles created from then on; bubbles that already exist are never touched.
  const SHOTS_PER_ROW = 2, ROWS_PER_LEVEL = 6;
  function addRow() {
    const fl = pushLayer(); S.rows++; S.since = 0;
    for (const p of fl) S.fx.push({ k: 'fall', p: cellPos(p.k, p.i, p.j), v: [(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.5], col: p.col, t: 0 });
    S.score += fl.length * 20;
    if (S.rows % ROWS_PER_LEVEL === 0) { S.level++; S.nc = BO.numColors(S.level); S.msg = L.level + ' ' + S.level; S.msgT = 1.4; return true; }
    return false;
  }
  function saveBest() { if (S.score > S.best) { S.best = S.score; try { localStorage.setItem('bubble3d_best', String(S.best)); } catch (e) {} } }
  function gameOver() { setAuto(false); S.mode = 'over'; S.over0 = performance.now(); S.flash = 0.4; S.shot = null; S.plan = null; saveBest(); }
  function land(s) { const i = landImpl(s); S._info = i; return i; }
  function landImpl(s) {
    const cell = snapCell(S.grid, s.x, s.y, s.z); S.shot = null;
    if (!cell) return null;
    const res = resolve(S.grid, cell[0], cell[1], cell[2], s.c), info = { k: cell[0], i: cell[1], j: cell[2], pops: res.pops.length, falls: res.falls.length };
    for (const p of res.pops) S.fx.push({ k: 'pop', p: cellPos(p.k, p.i, p.j), col: p.col, t: 0 });
    for (const p of res.falls) S.fx.push({ k: 'fall', p: cellPos(p.k, p.i, p.j), v: [(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1 + Math.random() * 2], col: p.col, t: 0 });
    S.score += res.pops.length * 10 + res.falls.length * 20;
    S.since++;
    if (count(S.grid) === 0) { S.score += 100; S.msg = L.clear; S.msgT = 1.6; info.cleared = true; info.leveled = addRow(); while (count(S.grid) === 0) addRow(); }   // empty cluster: bonus, and a layer at once
    else if (S.since >= SHOTS_PER_ROW) { info.leveled = addRow(); info.rowAdded = true; while (count(S.grid) === 0) addRow(); }
    if (maxLayer(S.grid) >= DK) { gameOver(); return info; }
    fixSupply(); saveBest(); return info;
  }
  function fire(az, el) {
    if (S.mode !== 'play' || S.shot) return false;
    if (az !== undefined) { S.az = az; S.el = el; }
    const d = dirOf(S.az, S.el); S.shot = { x: SH[0], y: SH[1], z: SH[2], dx: d[0], dy: d[1], dz: d[2], c: S.cur, acc: 0 };
    S.cur = S.next; S.next = pickColor(); S.shotCount++; S.plan = null; return true;
  }
  function swap() { if (S.mode === 'play' && !S.shot) { const t = S.cur; S.cur = S.next; S.next = t; } }
  function stepShot(dt) { const s = S.shot; s.acc += SPEED * dt / STEP; while (s.acc >= 1 && S.shot) { s.acc -= 1; if (stepOne(s, S.grid)) { land(s); return; } } }

  // ---------------- rule based shot search ----------------
  function evalCell(cell, col) {
    const g2 = cloneG(S.grid), res = resolve(g2, cell[0], cell[1], cell[2], col), left = count(g2); let sc = res.pops.length * 10 + res.falls.length * 30;
    if (left === 0) return sc + 1000;
    const mr = maxLayer(g2);
    if (!res.pops.length) { let adj = 0; for (const p of nbrs(cell[0], cell[1], cell[2])) if (g2[p[0]][p[1] * N + p[2]] === col) adj++; sc += adj * 7 - cell[0] * 3; }
    const mr2 = mr + (S.since + 1 >= SHOTS_PER_ROW ? 1 : 0);
    sc -= mr2 * 7; if (mr2 >= DK - 2) sc -= 80 * (mr2 - DK + 3); if (mr2 >= DK) sc -= 1e5;
    return sc;
  }
  function bestShot() {
    let best = null; const cache = {};
    for (const swp of [false, true]) {
      const col = swp ? S.next : S.cur; if (swp && S.next === S.cur) continue;
      for (let a = 0; a < 360; a += 3) for (let e = 20; e <= 88; e += 5.7) {
        const az = a * Math.PI / 180, el = e * Math.PI / 180, t = trace(S.grid, az, el); if (!t.cell) continue;
        const key = t.cell.join(',') + '/' + col; let sc = cache[key]; if (sc === undefined) sc = cache[key] = evalCell(t.cell, col);
        if (!best || sc > best.score + (swp ? 4 : 0)) best = { score: sc, az: az, el: el, cell: t.cell, swap: swp };
      }
    }
    return best;
  }
  function ready() { return S.mode === 'play' && !S.shot && !S.plan && S.fx.every(function (f) { return f.k !== 'fall' || f.t > 0.6; }); }
  function makePlan(delay) { const b = bestShot(); if (!b) return false; if (b.swap) swap(); S.az = b.az; S.el = b.el; S.plan = { t: delay }; return true; }

  // keep the shell's menu check mark in sync (direct call, or postMessage when the frames cannot touch each other, e.g. file:// in Chrome)
  function setAuto(v) { v = !!v; if (S.auto === v) return; S.auto = v; notifyAuto(); }
  function notifyAuto() { try { if (window.parent !== window) window.parent.postMessage({ bubble: 'autoState', on: S.auto }, '*'); } catch (e) {} }
  window.addEventListener('message', function (e) { const m = e.data; if (!m || !m.bubbleCmd) return; if (m.bubbleCmd === 'auto') window.toggleAuto(); else if (m.bubbleCmd === 'hint') window.giveHint(); });
  window.giveHint = function () { if (S.mode !== 'play' || S.shot || S.plan) return false; return makePlan(0.8); };
  window.toggleAuto = function () { if (S.mode !== 'play') { newGame(); setAuto(true); return true; } setAuto(!S.auto); S.plan = null; return S.auto; };

  function step(dt) {
    for (const f of S.fx) { f.t += dt; if (f.k === 'fall') { f.v[2] -= 22 * dt; f.p = [f.p[0] + f.v[0] * dt, f.p[1] + f.v[1] * dt, f.p[2] + f.v[2] * dt]; } }
    S.fx = S.fx.filter(function (f) { return f.k === 'pop' ? f.t < 0.3 : f.p[2] > -1; });
    if (S.msgT > 0) S.msgT -= dt; if (S.flash > 0) S.flash -= dt;
    if (S.mode !== 'play') return;
    if (S.held.l || S.held.r || S.held.u || S.held.d) { S.az += (S.held.r - S.held.l) * 1.2 * dt; S.el = Math.max(0.35, Math.min(1.53, S.el + (S.held.u - S.held.d) * 0.8 * dt)); S.plan = null; }
    if (S.shot) stepShot(dt);
    else if (S.plan) { S.plan.t -= dt; if (S.plan.t <= 0) fire(); }
    else if (S.auto && ready()) { S.autoT += dt; if (S.autoT > 0.25) { S.autoT = 0; makePlan(0.4); } }
  }

  // aim from a point on the floor: direction = from the shooter to that point; the farther away, the flatter the shot
  function aimFromFloor(fx, fy) {
    const dx = fx - SH[0], dy = fy - SH[1], r = Math.hypot(dx, dy);
    if (r > 0.05) S.az = Math.atan2(dy, dx);
    S.el = (88 - Math.min(1, r / 4.2) * 68) * Math.PI / 180;
  }

  // ---------------- drawing ----------------
  const CUBE_EDGES = null;
  function lineW(a, b) { const p = projW(a[0], a[1], a[2]), q = projW(b[0], b[1], b[2]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
  function quadW(a, b, c, d, fill) { const P = [a, b, c, d].map(function (v) { return projW(v[0], v[1], v[2]); }); ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); ctx.fill(); }
  function drawShaft() {
    quadW([0, 0, 0], [N, 0, 0], [N, 0, N], [0, 0, N], 'rgba(40,70,140,0.40)');
    const walls = [[[0, 0, 0], [N, 0, 0], [N, H, 0], [0, H, 0]], [[N, 0, 0], [N, 0, N], [N, H, N], [N, H, 0]], [[N, 0, N], [0, 0, N], [0, H, N], [N, H, N]], [[0, 0, N], [0, 0, 0], [0, H, 0], [0, H, N]]];
    walls.forEach(function (w) { quadW(w[0], w[1], w[2], w[3], 'rgba(30,50,110,0.16)'); });
    quadW([0, H, 0], [N, H, 0], [N, H, N], [0, H, N], 'rgba(150,170,200,0.22)');                               // ceiling
    ctx.lineWidth = Math.max(1, S.sc * 0.025); ctx.strokeStyle = 'rgba(150,190,255,0.40)'; ctx.beginPath();
    for (let i = 0; i <= N; i++) { lineW([i, 0, 0], [i, 0, N]); lineW([0, 0, i], [N, 0, i]); }
    for (let y = 0; y <= H; y += 2) { lineW([0, y, 0], [N, y, 0]); lineW([N, y, 0], [N, y, N]); lineW([N, y, N], [0, y, N]); lineW([0, y, N], [0, y, 0]); }
    ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, S.sc * 0.05); ctx.beginPath();
    [[0, 0], [N, 0], [N, N], [0, N]].forEach(function (p, i, a) { const q = a[(i + 1) % 4]; lineW([p[0], 0, p[1]], [q[0], 0, q[1]]); lineW([p[0], H, p[1]], [q[0], H, q[1]]); lineW([p[0], 0, p[1]], [p[0], H, p[1]]); });
    ctx.stroke();
    const dz = H - DK + 0.0; ctx.strokeStyle = 'rgba(255,70,70,0.85)'; ctx.lineWidth = Math.max(1.5, S.sc * 0.05); ctx.setLineDash([6, 5]); ctx.beginPath();
    [[0, 0], [N, 0], [N, N], [0, N]].forEach(function (p, i, a) { const q = a[(i + 1) % 4]; lineW([p[0], dz, p[1]], [q[0], dz, q[1]]); }); ctx.stroke(); ctx.setLineDash([]);   // danger plane
  }
  function mapRect() { const m = Math.min(S.cw * 0.36, S.ch * 0.21); return { x: S.cw * 0.04, y: S.ch * 0.77, w: m, h: m }; }
  function mapXform() {
    const R = mapRect(), c = Math.cos(S.yaw), s = Math.sin(S.yaw), cell = R.w / (N * (Math.abs(c) + Math.abs(s)));
    return { R: R, cell: cell, cx: R.x + R.w / 2, cy: R.y + R.h / 2, c: c, s: s,
      to: function (x, y) { const X = x - N / 2, Z = y - N / 2; return [this.cx + (X * c + Z * s) * cell, this.cy - (-X * s + Z * c) * cell]; },
      from: function (px, py) { const a = (px - this.cx) / cell, b = -(py - this.cy) / cell; return [a * c - b * s + N / 2, a * s + b * c + N / 2]; } };
  }
  function aimTrace() { return trace(S.grid, S.az, S.el, 2); }
  function drawMap() {
    const M = mapXform(), R = M.R;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(R.x, R.y, R.w, R.h); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, S.cw * 0.003); ctx.strokeRect(R.x, R.y, R.w, R.h);
    ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    const quad = function (x0, y0, x1, y1, fill, stroke) { const P = [M.to(x0, y0), M.to(x1, y0), M.to(x1, y1), M.to(x0, y1)]; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } };
    quad(0, 0, N, N, 'rgba(40,70,140,0.35)', null);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { for (let k = MAXK - 1; k >= 0; k--) if (S.grid[k][i * N + j] >= 0) { const p = M.to(i + 0.5, j + 0.5); BO.drawBubble(ctx, p[0], p[1], M.cell * 0.42, S.grid[k][i * N + j], 1 - k * 0.04); break; } }
    ctx.lineWidth = 1; for (let i = 0; i <= N; i++) { quad(i, 0, i, N, null, 'rgba(150,190,255,0.4)'); quad(0, i, N, i, null, 'rgba(150,190,255,0.4)'); }
    if (S.mode === 'play') {
      const t = aimTrace(), c0 = M.to(SH[0], SH[1]); ctx.strokeStyle = '#ff0'; ctx.lineWidth = Math.max(1, M.cell * 0.08); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(c0[0], c0[1]);
      for (let i = 1; i < t.pts.length; i++) { const p = M.to(t.pts[i][0], t.pts[i][1]); ctx.lineTo(p[0], p[1]); } ctx.stroke(); ctx.setLineDash([]);
      if (t.cell) { const p = M.to(t.cell[1] + 0.5, t.cell[2] + 0.5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], M.cell * 0.5, 0, 7); ctx.stroke(); }
      quad(SH[0] - 0.4, SH[1] - 0.4, SH[0] + 0.4, SH[1] + 0.4, 'rgba(0,255,255,0.5)', '#0ff');
    }
    ctx.restore();
    BO.drawLineString(ctx, R.x + R.w * 0.34, R.y + 3, Math.max(7, R.w * 0.075), 'FAR', '#8cf');
  }
  function label(txt, x, y, size, color, align) { ctx.font = 'bold ' + Math.round(size) + 'px "Noto Sans KR","Malgun Gothic",sans-serif'; ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y); }
  function drawStart() {
    const cw = S.cw, ch = S.ch;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch); if (S.tex) { ctx.globalAlpha = 0.6; ctx.drawImage(S.tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
    const ts = Math.max(20, cw * 0.1); ctx.lineWidth = 1.5; BO.drawLineStringCentered(ctx, cw / 2, ch * 0.16, ts, 'BUBBLE', '#fff'); BO.drawLineStringCentered(ctx, cw / 2, ch * 0.16 + ts * 1.5, ts, 'SHOOTER', '#8cf');
    BO.drawLineStringCentered(ctx, cw / 2, ch * 0.16 + ts * 3, ts * 0.6, '3D', '#ff0'); if (KO) label('버블 슈터', cw / 2, ch * 0.16 + ts * 4.1, cw * 0.06, '#ff0');
    const rr = cw * 0.045; for (let i = 0; i < 6; i++) BO.drawBubble(ctx, cw * (0.2 + i * 0.12), ch * 0.46, rr, i);
    const bw = cw * 0.5, bh = ch * 0.07; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(cw / 2 - bw / 2, ch * 0.56, bw, bh);
    BO.drawLineStringCentered(ctx, cw / 2, ch * 0.56 + bh * 0.22, Math.max(10, bh * 0.55), 'START', '#fff'); if (KO) label('터치하여 시작', cw / 2, ch * 0.56 + bh * 1.6, cw * 0.04, '#ddd');
    if (S.best) BO.drawLineStringCentered(ctx, cw / 2, ch * 0.76, Math.max(9, cw * 0.045), 'BEST ' + S.best, '#8cf');
    label(L.aim, cw / 2, ch * 0.86, cw * 0.028, '#bbb'); label(L.rot.join(' '), cw / 2, ch * 0.9, cw * 0.028, '#bbb');
  }
  function draw() {
    const cw = S.cw, ch = S.ch;
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, cw, ch);
    if (S.mode === 'start') { drawStart(); return; }
    if (S.tex) { ctx.globalAlpha = 0.3; ctx.drawImage(S.tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
    drawShaft();
    const items = [], r = 0.47 * S.sc, dimOf = function (d) { return Math.max(0.55, Math.min(1, 0.78 - d * 0.045)); };
    for (let k = 0; k < MAXK; k++) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const c = S.grid[k][i * N + j]; if (c >= 0) { const q = cellPos(k, i, j), p = proj(q[0], q[1], q[2]); items.push({ d: p[2], p: p, c: c }); } }
    for (const f of S.fx) { const p = proj(f.p[0], f.p[1], f.p[2]); items.push({ d: p[2], p: p, c: f.col, fx: f }); }
    const sp = proj(SH[0], SH[1], SH[2]), sd = dirOf(S.az, S.el);
    if (S.mode === 'play') {
      if (S.shot) { const p = proj(S.shot.x, S.shot.y, S.shot.z); items.push({ d: p[2], p: p, c: S.shot.c, big: 1 }); }
      else {
        items.push({ d: sp[2] + 0.001, p: sp, c: S.cur, big: 1, barrel: sd });
        const t = aimTrace(); let carry = 0;
        for (let i = 1; i < t.pts.length; i++) {
          const a = t.pts[i - 1], b = t.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          for (let d = carry + 0.5; d < len; d += 0.5) { const k = d / len, p = proj(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k); items.push({ d: p[2] - 0.2, p: p, dot: 1 }); carry = d + 0.5 - len - 0.5; }
        }
        if (t.cell) { const q = cellPos(t.cell[0], t.cell[1], t.cell[2]), p = proj(q[0], q[1], q[2]); items.push({ d: p[2] - 0.3, p: p, ghost: 1 }); }
      }
    }
    // the shooter pad on the floor
    quadW([2, 0.02, 2], [4, 0.02, 2], [4, 0.02, 4], [2, 0.02, 4], 'rgba(0,255,255,0.18)'); ctx.strokeStyle = '#0ff'; ctx.lineWidth = Math.max(1, S.sc * 0.04); ctx.beginPath(); lineW([2, 0.02, 2], [4, 0.02, 2]); lineW([4, 0.02, 2], [4, 0.02, 4]); lineW([4, 0.02, 4], [2, 0.02, 4]); lineW([2, 0.02, 4], [2, 0.02, 2]); ctx.stroke();
    items.sort(function (a, b) { return b.d - a.d; });
    for (const it of items) {
      const p = it.p;
      if (it.dot) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1.5, S.sc * 0.06), 0, 7); ctx.fill(); }
      else if (it.ghost) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      else if (it.fx && it.fx.k === 'pop') { const k = it.fx.t / 0.3; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r * (1 + k), 0, 7); ctx.stroke(); BO.drawBubble(ctx, p[0], p[1], r * (1 - k * 0.6), it.c, 1, 1 - k); }
      else {
        if (it.barrel) { const e = proj(SH[0] + it.barrel[0] * 1.3, SH[1] + it.barrel[1] * 1.3, SH[2] + it.barrel[2] * 1.3); ctx.strokeStyle = '#9bd'; ctx.lineWidth = S.sc * 0.3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); ctx.lineCap = 'butt'; }
        BO.drawBubble(ctx, p[0], p[1], r, it.c, it.big ? 1 : dimOf(it.d));
      }
    }
    // HUD
    const hs = Math.max(8, cw * 0.04), hy = ch * 0.02;
    BO.drawLineString(ctx, cw * 0.04, hy, hs, 'SCORE ' + S.score, '#fff'); BO.drawLineString(ctx, cw * 0.04, hy + hs * 1.3, hs * 0.75, 'BEST ' + S.best, '#888');
    BO.drawLineString(ctx, cw * 0.62, hy, hs, 'LV ' + S.level, '#0ff'); BO.drawLineString(ctx, cw * 0.62, hy + hs * 1.3, hs * 0.75, S.auto ? 'AUTO PLAY' : S.nc + ' COLORS', S.auto ? '#6f6' : '#f9c');
    if (S.flash > 0) { ctx.fillStyle = 'rgba(255,0,0,' + (S.flash * 0.5) + ')'; ctx.fillRect(0, 0, cw, ch); }
    if (S.msgT > 0) label(S.msg, cw / 2, ch * 0.42, cw * 0.07, '#ff0');
    drawMap();
    const nr = nextRect(), left = SHOTS_PER_ROW - S.since;
    label(L.next, nr.x + nr.w * 0.25, nr.y + nr.h * 0.12, cw * 0.034, '#9cf'); BO.drawBubble(ctx, nr.x + nr.w * 0.25, nr.y + nr.h * 0.45, cw * 0.05, S.next);
    label(L.row.replace('%', left), nr.x + nr.w * 0.7, nr.y + nr.h * 0.12, cw * 0.028, '#fc8');
    for (let i = 0; i < SHOTS_PER_ROW; i++) { const x = nr.x + nr.w * 0.7 - (SHOTS_PER_ROW - 1) * cw * 0.03 + i * cw * 0.06, y = nr.y + nr.h * 0.45; ctx.beginPath(); ctx.arc(x, y, cw * 0.022, 0, 7); ctx.fillStyle = i < S.since ? '#f84' : 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.strokeStyle = '#fc8'; ctx.lineWidth = 1; ctx.stroke(); }
    label(L.rot[0], nr.x + nr.w * 0.5, nr.y + nr.h * 0.78, cw * 0.026, '#888'); label(L.rot[1], nr.x + nr.w * 0.5, nr.y + nr.h * 0.78 + cw * 0.034, cw * 0.026, '#888');
    if (S.mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, ch * 0.2, cw, ch * 0.34);
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.28, cw * 0.075, 'GAME OVER', '#f55'); BO.drawLineStringCentered(ctx, cw / 2, ch * 0.38, cw * 0.045, 'SCORE ' + S.score, '#fff'); label(L.retry, cw / 2, ch * 0.5, cw * 0.05, '#0ff');
    }
  }

  // ---------------- input ----------------
  function pos(e) { const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1; return { x: (e.clientX - r.left) * d, y: (e.clientY - r.top) * d }; }
  function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function toFloor(p) { const o = projW(0, 0, 0), a = projW(1, 0, 0), b = projW(0, 0, 1), ax = a[0] - o[0], ay = a[1] - o[1], bx = b[0] - o[0], by = b[1] - o[1], det = ax * by - ay * bx, dx = p.x - o[0], dy = p.y - o[1]; return [(dx * by - dy * bx) / det, (ax * dy - ay * dx) / det]; }
  function nearShooter(p) { const c = projW(SH[0], 0, SH[1]), c2 = proj(SH[0], SH[1], SH[2]); return Math.hypot(p.x - c[0], p.y - c[1]) < S.sc * 1.5 || Math.hypot(p.x - c2[0], p.y - c2[1]) < S.sc * 1.2; }
  // map / shooter: aim (release fires); anywhere else: rotate the view (the right button always rotates)
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    const p = pos(e); try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (S.mode === 'start') { newGame(); return; }
    if (S.mode === 'over') { if (performance.now() - S.over0 > 500) newGame(); return; }
    setAuto(false); S.plan = null;
    if (e.pointerType === 'mouse' && e.button === 2) { S.drag = { kind: 'view', x: p.x, y: p.y, yaw: S.yaw, pitch: S.pitch }; return; }
    if (inRect(p, nextRect())) { swap(); S.drag = null; return; }
    const M = mapXform();
    if (inRect(p, M.R)) { const f = M.from(p.x, p.y); aimFromFloor(f[0], f[1]); S.drag = { kind: 'aim', map: true }; return; }
    if (nearShooter(p)) { const f = toFloor(p); aimFromFloor(f[0], f[1]); S.drag = { kind: 'aim' }; return; }
    S.drag = { kind: 'view', x: p.x, y: p.y, yaw: S.yaw, pitch: S.pitch };
  });
  canvas.addEventListener('pointermove', function (e) {
    if (S.mode !== 'play' || !S.drag) return; const p = pos(e), d = S.drag;
    if (d.kind === 'aim') { const f = d.map ? mapXform().from(p.x, p.y) : toFloor(p); aimFromFloor(f[0], f[1]); }
    else if (d.kind === 'view') { S.yaw = d.yaw - (p.x - d.x) / S.cw * 3.2; S.pitch = Math.max(0.12, Math.min(1.3, d.pitch + (p.y - d.y) / S.ch * 2.2)); }
  });
  window.addEventListener('pointerup', function () { const d = S.drag; S.drag = null; if (d && d.kind === 'aim' && S.mode === 'play') fire(); });
  window.addEventListener('keydown', function (e) {
    const k = e.key;
    if (k === 'F3') { e.preventDefault(); window.toggleAuto(); } else if (k === 'F4') { e.preventDefault(); window.giveHint(); }
    else if (k === ' ' || k === 'Enter') { e.preventDefault(); if (S.mode !== 'play') newGame(); else { setAuto(false); fire(); } }
    else if (k === 'ArrowLeft') { S.held.l = 1; e.preventDefault(); } else if (k === 'ArrowRight') { S.held.r = 1; e.preventDefault(); } else if (k === 'ArrowUp') { S.held.u = 1; e.preventDefault(); } else if (k === 'ArrowDown') { S.held.d = 1; e.preventDefault(); }
    else if (k === 'q' || k === 'Q') S.yaw += 0.12; else if (k === 'e' || k === 'E') S.yaw -= 0.12; else if (k === 'x' || k === 'X') swap();
  });
  window.addEventListener('keyup', function (e) { const k = e.key; if (k === 'ArrowLeft') S.held.l = 0; if (k === 'ArrowRight') S.held.r = 0; if (k === 'ArrowUp') S.held.u = 0; if (k === 'ArrowDown') S.held.d = 0; });

  let last = 0;
  function frame(t) { const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; step(dt); draw(); requestAnimationFrame(frame); }

  // ---- test hook ----
  function loadGrid(layers, reserve) {                                                // layers: array of layers, each an array of 6 strings (row = i, char = j); '.' empty, digit = colour
    S.grid = newGrid(); S.since = 0; S.shot = null; S.fx = []; S.plan = null; S.nc = Math.max(S.nc, 4); S.mode = 'play';
    layers.forEach(function (ly, k) { ly.forEach(function (row, i) { for (let j = 0; j < row.length; j++) if (row[j] !== '.') S.grid[k][i * N + j] = +row[j]; }); });
  }
  function shootSync(azDeg, elDeg, col) {
    S._info = null; S.cur = col; S.next = col; fire(azDeg * Math.PI / 180, elDeg * Math.PI / 180); S.cur = S.next = col; const s = S.shot; if (!s) return null;
    let n = 0; while (S.shot && n++ < 100000) { s.acc = 1; stepShot(0); } return S._info || null;
  }
  function run(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { step(1 / 60); if (S.mode === 'over') break; } }
  window.__bb = { mode: '3d', addRow: addRow, maxLayer: maxLayer, S: S, step: step, run: run, newGame: newGame, buildLevel: buildLevel, loadGrid: loadGrid, shootSync: shootSync, trace: trace, fire: fire, swap: swap, count: count, present: present, resolve: resolve,
    numColors: BO.numColors, bestShot: bestShot, giveHint: function () { return window.giveHint(); }, mapXform: mapXform, toFloor: toFloor, proj: projW, aimFromFloor: aimFromFloor };
  resize(); buildLevel(1);
  Promise.all([BO.loadTexture(1), BO.loadStartBg()]).then(function (r) { S.tex = r[0]; S.bg = r[1]; });
  requestAnimationFrame(frame);
})();
