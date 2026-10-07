// Breakout 3D - forked from Polycube's look.  A vertical 6 x 12 x 6 shaft: the paddle (2 x 2) moves on the floor, the ball flies up to a wall of cubes under the ceiling.
// Black cube = 2 hits, white = 3 hits, gray = 5 hits, every other cube = 1 hit in a random fully saturated colour.  Damage is shown as cracks on the faces.  No AI mode.
// View: drag away from the paddle to rotate the view (yaw / pitch).  The floor map (like Polycube's first-floor table) rotates with the view and is the coordinate system of the paddle controls.
// Physics runs in "internal" coordinates (x, y = the floor, z = the height); the world used for drawing is (X, Y, Z) = (x, z, y).
(function () {
  'use strict';
  const BO = window.BO;
  const canvas = document.getElementById('app'), ctx = canvas.getContext('2d');
  const N = 6, H = 12, LAYERS = 5;               // five layers of cubes are always kept (see trySpawn)
  const S = { mode: 'start', level: 1, score: 0, started: false, clock: 0, best: 0, items: [], mul: 1, hideT: 0, ghostT: 0, powerT: 0, timeT: 0, timeMul: 1, fakes: [], cleared: 0, pending: 0, rowMsg: '', rowMsgT: 0, nextLayer: null, bricks: [], ball: null, px: N / 2, py: N / 2, speed: 8.5,
    yaw: -0.5, pitch: 0.52, about: 0, auto: false, autoT: 0, cw: 0, ch: 0, sc: 1, cx: 0, cy: 0, tex: null, bg: null, flash: 0, msg: '', msgT: 0, target: null, paused: false, drag: null };
  try { S.best = parseInt(localStorage.getItem('breakout3d_best'), 10) || 0; } catch (e) {}

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    S.cw = canvas.width = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
    S.ch = canvas.height = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
    S.sc = Math.min(S.cw * 0.95 / 9.6, S.ch * 0.585 / 13.6); S.cx = S.cw * 0.5; S.cy = S.ch * 0.385;
  }
  window.addEventListener('resize', resize);

  // ---- projection: world (X right, Y up, Z away) -> screen; the depth grows away from the camera ----
  function view(X, Y, Z) {
    const cY = Math.cos(S.yaw), sY = Math.sin(S.yaw), cP = Math.cos(S.pitch), sP = Math.sin(S.pitch);
    X -= N / 2; Y -= H / 2; Z -= N / 2;
    const x1 = X * cY + Z * sY, z1 = -X * sY + Z * cY;
    return [x1, Y * cP + z1 * sP, z1 * cP - Y * sP];
  }
  function projW(X, Y, Z) { const v = view(X, Y, Z); return [S.cx + v[0] * S.sc, S.cy - v[1] * S.sc, v[2]]; }
  function proj(x, y, z) { return projW(x, z, y); }                          // internal coordinates

  function newLayer(z, below) {                  // a random layer (at least 12 cubes); the multi-hit cubes (black / white / gray) come in clusters: a cube next to / above one is much more likely to be one too
    const under = {}; (below || []).forEach(function (k) { under[k.x + ',' + k.y] = k.b.max > 1; });
    for (;;) {
      const out = [], at = {};
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        if (Math.random() >= 0.9) continue;
        const near = (at[(i - 1) + ',' + j] ? 1 : 0) + (at[i + ',' + (j - 1)] ? 1 : 0) + (under[i + ',' + j] ? 1 : 0);
        const b = BO.makeBrick(S.level, Math.random() < BO.toughProb(S.level, near) * 0.85); at[i + ',' + j] = b.max > 1; out.push({ x: i, y: j, z: z, b: b });      // (0.85: with 3 neighbours instead of 2 a lower chance keeps about the same share as in 2D)
      }
      if (out.length >= 12) return out;
    }
  }
  function buildLevel() {
    S.bricks = []; let lay = null; for (let k = LAYERS - 1; k >= 0; k--) { lay = newLayer(H - 1 - k, lay); S.bricks = S.bricks.concat(lay); }
    S.cleared = 0; S.pending = 0; S.nextLayer = null; S.level = 1; S.speed = 8.5; S.items = []; S.mul = 1; S.hideT = 0; S.ghostT = 0; S.powerT = 0; S.timeT = 0; S.fakes = []; resetBall();
  }
  function hs() { return Math.max(0.5, Math.min(2.5, S.mul)); }                   // half size of the paddle (item factor: x0.5 / x2)
  function layerCount(z) { let n = 0; for (const k of S.bricks) if (k.z === z) n++; return n; }
  function setSpeed() { S.speed = Math.min(16, 8.5 * (1 + 0.07 * (S.level - 1))); const b = S.ball; if (b && !b.stuck) { const sp = Math.hypot(b.vx, b.vy, b.vz) || 1; b.vx *= S.speed / sp; b.vy *= S.speed / sp; b.vz *= S.speed / sp; } }
  // The lowest layer is gone: every cube moves down one layer and a new layer appears at the top.  A ball that is still inside the top band (it can fly through the holes of the top layer
  // and bounce there under the ceiling) must not get buried in the new layer: the shift waits until the ball is clear of the cubes (after 3 s it is pushed out downwards instead).
  function ballHitsCubes(list) {
    const b = S.ball, m = b.r + 0.35;
    for (const k of list) {
      if (b.z + m < k.z || b.z - m > k.z + 1) continue;
      const qx = Math.max(k.x, Math.min(k.x + 1, b.x)), qy = Math.max(k.y, Math.min(k.y + 1, b.y)), qz = Math.max(k.z, Math.min(k.z + 1, b.z));
      if ((b.x - qx) * (b.x - qx) + (b.y - qy) * (b.y - qy) + (b.z - qz) * (b.z - qz) < m * m) return true;
    }
    return false;
  }
  function trySpawn(dt) {
    let guard = 0;
    while (layerCount(H - LAYERS) === 0 && guard++ < LAYERS) {
      const moved = S.bricks.map(function (k) { return { x: k.x, y: k.y, z: k.z - 1, b: k.b }; }).concat(S.nextLayer || (S.nextLayer = newLayer(H - 1, S.bricks.filter(function (k) { return k.z === H - 1; }).map(function (k) { return { x: k.x, y: k.y, z: k.z - 1, b: k.b }; }))));
      if (!S.ball.stuck && ballHitsCubes(moved)) { S.pending += dt; if (S.pending < 3) return; }
      S.bricks = moved; S.nextLayer = null; S.pending = 0;
      if (!S.ball.stuck && ballHitsCubes(S.bricks)) { let n = 0; while (ballHitsCubes(S.bricks) && S.ball.z > 0.4 && n++ < 400) S.ball.z -= 0.25; if (S.ball.vz > 0) S.ball.vz = -S.ball.vz; }
    }
  }
  function resetBall() { S.ball = { x: S.px, y: S.py, z: 0.4, vx: 0, vy: 0, vz: 0, r: 0.28, stuck: true }; }
  function newGame() { S.score = 0; S.started = false; S.px = S.py = N / 2; S.mode = 'play'; buildLevel(); }
  function launch() {
    if (S.mode !== 'play' || !S.ball.stuck) return;
    if (!S.started) { S.started = true; S.score = 0; S.cleared = 0; S.clock = 0; }         // the score starts from 0 when the ball is shot for the first time
    const a = Math.random() * Math.PI * 2, t = 0.18 + Math.random() * 0.12, v = S.ball, d = [Math.cos(a) * t, Math.sin(a) * t, 1], m = Math.hypot(d[0], d[1], d[2]);
    v.stuck = false; v.vx = d[0] / m * S.speed; v.vy = d[1] / m * S.speed; v.vz = d[2] / m * S.speed;
  }

  function step(dt) {
    if (S.mode !== 'play' || S.paused) return;
    trySpawn(dt);
    if (S.auto) autoPlay(dt);
    if (S.target) { const k = Math.min(1, dt * 30); S.px += (S.target[0] - S.px) * k; S.py += (S.target[1] - S.py) * k; }
    S.px = Math.max(hs(), Math.min(N - hs(), S.px)); S.py = Math.max(hs(), Math.min(N - hs(), S.py));
    if (S.started && !S.ball.stuck) { S.clock += dt; while (S.clock >= 1) { S.clock -= 1; S.score -= 1; } }      // -1 point for every second that passes (the score can go negative)
    if (S.hideT > 0) S.hideT -= dt; if (S.ghostT > 0) S.ghostT -= dt; if (S.powerT > 0) S.powerT -= dt; if (S.timeT > 0) S.timeT -= dt;
    const gdt = dt * (S.timeT > 0 ? S.timeMul : 1);                          // game time: items / ball use it (time items make it 2x faster or 0.5x slower), the paddle control keeps real time
    stepItems(gdt); stepFakes(gdt, dt);
    const b = S.ball;
    if (b.stuck) { b.x = S.px; b.y = S.py; b.z = 0.4; return; }
    const n = Math.max(1, Math.ceil(gdt / (1 / 240)));
    for (let i = 0; i < n; i++) { sub(gdt / n); if (S.mode !== 'play' || b.stuck) break; }
    if (S.msgT > 0) S.msgT -= dt; if (S.rowMsgT > 0) S.rowMsgT -= dt;
  }
  // auto play (F3): the reinforcement-learning policy (ai.js) chooses the paddle target 20 times a second
  function autoPlay(dt) {
    if (!window.AtariAI || !AtariAI.ready('3d')) { S.auto = false; return; }
    if (S.ball.stuck) { launch(); return; }
    S.autoT += dt;
    if (S.autoT >= 0.05) { S.autoT = 0; S.target = AtariAI.act3d(S, hs()); }
  }
  window.toggleAuto = function () { if (S.mode !== 'play') return S.auto; S.auto = !S.auto && !!(window.AtariAI && AtariAI.ready('3d')); if (!S.auto) S.target = null; return S.auto; };
  function spawnFakes() {                        // the decoys pop out of the real ball: same position, random directions
    for (let k = 0; k < 2; k++) {
      const v = [Math.random() - 0.5, Math.random() - 0.5, (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5)], m = Math.hypot(v[0], v[1], v[2]);
      S.fakes.push({ x: S.ball.x, y: S.ball.y, z: S.ball.z, vx: v[0] / m * S.speed, vy: v[1] / m * S.speed, vz: v[2] / m * S.speed, r: 0.28, t: 10 });
    }
  }
  function stepFakes(dt, real) {                 // decoys: bounce off walls / ceiling / floor / cubes like the ball but never hurt anything; each one disappears 10 s after it appeared
    if (!S.fakes.length) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (const f of S.fakes) { f.t -= real; for (let i = 0; i < n; i++) {
      const d = dt / n, r = f.r; f.x += f.vx * d; f.y += f.vy * d; f.z += f.vz * d;
      if (f.x < r) { f.x = r; f.vx = Math.abs(f.vx); } else if (f.x > N - r) { f.x = N - r; f.vx = -Math.abs(f.vx); }
      if (f.y < r) { f.y = r; f.vy = Math.abs(f.vy); } else if (f.y > N - r) { f.y = N - r; f.vy = -Math.abs(f.vy); }
      if (f.z > H - r) { f.z = H - r; f.vz = -Math.abs(f.vz); }
      else if (f.vz < 0 && f.z - r <= 0.15 && Math.abs(f.x - S.px) <= hs() + r * 0.8 && Math.abs(f.y - S.py) <= hs() + r * 0.8) {      // the paddle reflects the decoys too (also while it is hidden, like it does for the ball)
        const dx = (f.x - S.px) / hs() * 0.7, dy = (f.y - S.py) / hs() * 0.7, m = Math.hypot(dx, dy, 1.5); f.z = r + 0.15; f.vx = dx / m * S.speed; f.vy = dy / m * S.speed; f.vz = 1.5 / m * S.speed;
      } else if (f.z < r) { f.z = r; f.vz = Math.abs(f.vz); }                                                                      // (beside the paddle the floor keeps them wandering)
      for (const k of S.bricks) {
        if (f.z + r < k.z || f.z - r > k.z + 1) continue;
        const qx = Math.max(k.x, Math.min(k.x + 1, f.x)), qy = Math.max(k.y, Math.min(k.y + 1, f.y)), qz = Math.max(k.z, Math.min(k.z + 1, f.z)), dx = f.x - qx, dy = f.y - qy, dz = f.z - qz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r * r && d2 > 1e-9) { const m = Math.sqrt(d2), nx = dx / m, ny = dy / m, nz = dz / m, vn = f.vx * nx + f.vy * ny + f.vz * nz; if (vn < 0) { f.vx -= 2 * vn * nx; f.vy -= 2 * vn * ny; f.vz -= 2 * vn * nz; } f.x = qx + nx * r * 1.001; f.y = qy + ny * r * 1.001; f.z = qz + nz * r * 1.001; break; }
      }
      const sp = Math.hypot(f.vx, f.vy, f.vz) || 1; f.vx *= S.speed / sp; f.vy *= S.speed / sp; f.vz *= S.speed / sp;
    } }
    S.fakes = S.fakes.filter(function (f) { return f.t > 0; });
  }
  function stepItems(dt) {                       // items fall from the cube they were hidden in; the paddle catching one applies it
    for (let i = S.items.length - 1; i >= 0; i--) {
      const it = S.items[i]; it.vz = Math.max(-9, it.vz - 8 * dt); it.z += it.vz * dt;
      if (it.z - it.r <= 0.15 && it.z > -0.5 && Math.abs(it.x - S.px) <= hs() + it.r && Math.abs(it.y - S.py) <= hs() + it.r) {
        if (it.type === 'fake') { spawnFakes(); S.msg = 'FAKE BALLS'; }                                     // two more decoys (each lives 10 s; picking more of them adds up: 4, 6, ...)
        else if (it.type === 'norm') { S.timeT = 0; S.timeMul = 1; S.mul = 1; S.px = Math.max(hs(), Math.min(N - hs(), S.px)); S.py = Math.max(hs(), Math.min(N - hs(), S.py)); S.msg = 'NORMAL'; }      // time scale and paddle length back to normal
        else if (it.type === 'fast' || it.type === 'slow') { S.timeT = 30; S.timeMul = it.type === 'fast' ? 2 : 0.5; S.msg = it.type === 'fast' ? 'TIME x2' : 'TIME x1/2'; }     // 30 seconds of faster / slower time (the latest one wins)
        else if (it.type === 'power') { S.powerT = 30; S.msg = 'POWER BALL'; }                          // 30 seconds: a black ball that breaks every cube with a single hit
        else if (it.type === 'ghost') { S.ghostT = 5; S.msg = 'BALL HIDDEN'; }                         // the ball (its shadow, guide line and map dot too) is invisible for 5 seconds, it still flies and bounces
        else if (it.type === 'hide') { S.hideT = 3; S.msg = 'PADDLE HIDDEN'; }                      // the paddle (and its mark on the floor map) disappears completely for 3 seconds
        else {
          S.mul = it.type === 'short' ? S.mul * 0.5 : S.mul * 2; S.mul = Math.max(0.5, Math.min(2.5, S.mul));
          S.px = Math.max(hs(), Math.min(N - hs(), S.px)); S.py = Math.max(hs(), Math.min(N - hs(), S.py));
          S.msg = it.type === 'short' ? 'SHORT PADDLE' : 'LONG PADDLE';
        }
        S.msgT = 1.0; S.items.splice(i, 1);
      } else if (it.z < -1.5) S.items.splice(i, 1);
    }
  }
  function sub(dt) {
    const b = S.ball, r = b.r; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx); } else if (b.x > N - r) { b.x = N - r; b.vx = -Math.abs(b.vx); }
    if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy); } else if (b.y > N - r) { b.y = N - r; b.vy = -Math.abs(b.vy); }
    if (b.z > H - r) { b.z = H - r; b.vz = -Math.abs(b.vz); }
    if (b.vz < 0 && b.z - r <= 0.15) {                                                   // paddle on the floor
      if (Math.abs(b.x - S.px) <= hs() + r * 0.8 && Math.abs(b.y - S.py) <= hs() + r * 0.8) {
        const dx = (b.x - S.px) / hs() * 0.7 + (Math.random() - 0.5) * 0.12, dy = (b.y - S.py) / hs() * 0.7 + (Math.random() - 0.5) * 0.12, m = Math.hypot(dx, dy, 1.5);
        b.z = r + 0.15; b.vx = dx / m * S.speed; b.vy = dy / m * S.speed; b.vz = 1.5 / m * S.speed;
      } else if (b.z < -1.2) {
        // one ball = one game: when it falls the game is over and the score is final
        S.flash = 0.4; S.items = []; S.mul = 1; S.hideT = 0; S.ghostT = 0; S.powerT = 0; S.timeT = 0; S.fakes = [];
        if (S.score > S.best) { S.best = S.score; try { localStorage.setItem('breakout3d_best', String(S.best)); } catch (e) {} }
        S.mode = 'over';
        return;
      }
    }
    let best = null, bd = 1e9;                                                            // sphere vs cube, the deepest contact is resolved
    for (let i = 0; i < S.bricks.length; i++) {
      const k = S.bricks[i];
      if (b.z + r < k.z || b.z - r > k.z + 1) continue;
      const qx = Math.max(k.x, Math.min(k.x + 1, b.x)), qy = Math.max(k.y, Math.min(k.y + 1, b.y)), qz = Math.max(k.z, Math.min(k.z + 1, b.z));
      const dx = b.x - qx, dy = b.y - qy, dz = b.z - qz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r * r && d2 < bd) { bd = d2; best = { i: i, dx: dx, dy: dy, dz: dz, qx: qx, qy: qy, qz: qz, k: k }; }
    }
    if (best) {
      let nx = best.dx, ny = best.dy, nz = best.dz, m = Math.hypot(nx, ny, nz);
      if (m < 1e-6) {
        const k = best.k, c = [b.x - k.x, k.x + 1 - b.x, b.y - k.y, k.y + 1 - b.y, b.z - k.z, k.z + 1 - b.z], ci = c.indexOf(Math.min.apply(null, c));
        nx = ny = nz = 0; if (ci < 2) nx = ci ? 1 : -1; else if (ci < 4) ny = ci === 3 ? 1 : -1; else nz = ci === 5 ? 1 : -1; m = 1;
      }
      nx /= m; ny /= m; nz /= m;
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; b.vz -= 2 * vn * nz; }
      b.x = best.qx + nx * r * 1.001; b.y = best.qy + ny * r * 1.001; b.z = best.qz + nz * r * 1.001;
      const br = best.k.b; br.hits = S.powerT > 0 ? 0 : br.hits - 1;
      S.score += 2;                                                       // every hit on a cube: +2
      if (br.hits <= 0) {
        const z = best.k.z; S.bricks.splice(best.i, 1);
        if (br.item) S.items.push({ x: best.k.x + 0.5, y: best.k.y + 0.5, z: best.k.z + 0.5, vz: 0, r: 0.3, type: br.item });
        if (layerCount(z) === 0) {                                         // points are given for every completely cleared layer
          const pts = 100; S.score += pts; S.rowMsg = 'LAYER +' + pts; S.rowMsgT = 1.1; S.cleared++;
          if (S.cleared % 3 === 0) { S.level++; S.msg = 'LEVEL ' + S.level; S.msgT = 1.4; setSpeed(); }
          if (S.score > S.best) { S.best = S.score; try { localStorage.setItem('breakout3d_best', String(S.best)); } catch (e) {} }
        }
      }
      const sp = Math.hypot(b.vx, b.vy, b.vz); b.vx *= S.speed / sp; b.vy *= S.speed / sp; b.vz *= S.speed / sp;
    }
    const sp = Math.hypot(b.vx, b.vy, b.vz), minz = sp * 0.3;                            // never let the ball hover sideways forever
    if (Math.abs(b.vz) < minz) { const sg = b.vz < 0 ? -1 : 1, k = Math.sqrt(Math.max(1e-6, sp * sp - minz * minz) / Math.max(1e-6, b.vx * b.vx + b.vy * b.vy)); b.vz = sg * minz; b.vx *= k; b.vy *= k; }
  }

  // ---------------- drawing ----------------
  const CUBE = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const FACES = [[[0, 1, 2, 3], [0, 0, -1]], [[4, 5, 6, 7], [0, 0, 1]], [[0, 1, 5, 4], [0, -1, 0]], [[3, 2, 6, 7], [0, 1, 0]], [[0, 3, 7, 4], [-1, 0, 0]], [[1, 2, 6, 5], [1, 0, 0]]];
  const LIGHT = (function () { const v = [-0.3, 0.7, -0.65], m = Math.hypot(v[0], v[1], v[2]); return [v[0] / m, v[1] / m, v[2] / m]; })();
  function baseRgb(b) {
    if (b.kind === 'black') return b.hits >= 2 ? [18, 18, 22] : [70, 70, 78];
    if (b.kind === 'white') return b.hits >= 3 ? [255, 255, 255] : (b.hits === 2 ? [215, 215, 220] : [175, 175, 182]);
    return b.rgb;
  }
  function rotN(n) { const cY = Math.cos(S.yaw), sY = Math.sin(S.yaw), cP = Math.cos(S.pitch), sP = Math.sin(S.pitch), x1 = n[0] * cY + n[2] * sY, z1 = -n[0] * sY + n[2] * cY; return [x1, n[1] * cP + z1 * sP, z1 * cP - n[1] * sP]; }
  function drawCube(X, Y, Z, br) {                                         // (X, Y, Z) = world position of the cube's minimum corner
    const rgb = baseRgb(br), edge = br.kind === 'black' ? '#ddd' : (br.kind === 'white' ? '#556' : (br.kind === 'gray' ? '#ccc' : 'rgba(0,0,0,0.55)')), dmg = br.max - br.hits;
    const P = CUBE.map(function (c) { return projW(X + c[0], Y + c[1], Z + c[2]); });
    const faces = FACES.map(function (f) { return { f: f[0], d: (P[f[0][0]][2] + P[f[0][2]][2]) / 2, nv: rotN(f[1]) }; }).filter(function (f) { return f.nv[2] < 0.001; }).sort(function (a, b) { return b.d - a.d; });
    const cracks = dmg > 0 ? BO.crackPaths(br.seed, dmg) : null;
    for (const f of faces) {
      const k = 0.4 + 0.6 * Math.max(0, f.nv[0] * LIGHT[0] + f.nv[1] * LIGHT[1] + f.nv[2] * LIGHT[2]);
      ctx.fillStyle = 'rgb(' + Math.min(255, Math.round(rgb[0] * k)) + ',' + Math.min(255, Math.round(rgb[1] * k)) + ',' + Math.min(255, Math.round(rgb[2] * k)) + ')';
      ctx.beginPath(); ctx.moveTo(P[f.f[0]][0], P[f.f[0]][1]); for (let i = 1; i < 4; i++) ctx.lineTo(P[f.f[i]][0], P[f.f[i]][1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, S.sc * 0.035); ctx.stroke();
      if (cracks) {                                                        // cracks on the surface: the crack paths are mapped onto the (projected) face
        const A = P[f.f[0]], Bp = P[f.f[1]], D = P[f.f[3]], ux = Bp[0] - A[0], uy = Bp[1] - A[1], vx = D[0] - A[0], vy = D[1] - A[1];
        ctx.strokeStyle = (br.kind === 'black') ? 'rgba(255,255,255,0.9)' : 'rgba(10,10,20,0.85)'; ctx.lineWidth = Math.max(1, S.sc * 0.05);
        for (const path of cracks) { ctx.beginPath(); path.forEach(function (q, i) { const sx = A[0] + q[0] * ux + q[1] * vx, sy = A[1] + q[0] * uy + q[1] * vy; if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }); ctx.stroke(); }
      }
    }
  }
  function lineW(a, b) { const p = projW(a[0], a[1], a[2]), q = projW(b[0], b[1], b[2]); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
  function quadW(a, b, c, d, fill) { const P = [a, b, c, d].map(function (v) { return projW(v[0], v[1], v[2]); }); ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); ctx.fill(); }
  function drawShaft() {
    quadW([0, 0, 0], [N, 0, 0], [N, 0, N], [0, 0, N], 'rgba(40,70,140,0.40)');            // floor
    const walls = [[[0, 0, 0], [N, 0, 0], [N, H, 0], [0, H, 0]], [[N, 0, 0], [N, 0, N], [N, H, N], [N, H, 0]], [[N, 0, N], [0, 0, N], [0, H, N], [N, H, N]], [[0, 0, N], [0, 0, 0], [0, H, 0], [0, H, N]]];
    walls.forEach(function (w) { quadW(w[0], w[1], w[2], w[3], 'rgba(30,50,110,0.16)'); });
    ctx.lineWidth = Math.max(1, S.sc * 0.025); ctx.strokeStyle = 'rgba(150,190,255,0.40)'; ctx.beginPath();
    for (let i = 0; i <= N; i++) { lineW([i, 0, 0], [i, 0, N]); lineW([0, 0, i], [N, 0, i]); }
    for (let y = 0; y <= H; y += 2) { lineW([0, y, 0], [N, y, 0]); lineW([N, y, 0], [N, y, N]); lineW([N, y, N], [0, y, N]); lineW([0, y, N], [0, y, 0]); }
    ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, S.sc * 0.05); ctx.beginPath();
    [[0, 0], [N, 0], [N, N], [0, N]].forEach(function (p, i, a) { const q = a[(i + 1) % 4]; lineW([p[0], 0, p[1]], [q[0], 0, q[1]]); lineW([p[0], H, p[1]], [q[0], H, q[1]]); lineW([p[0], 0, p[1]], [p[0], H, p[1]]); });
    ctx.stroke();
  }
  // floor map (top view of the floor, rotated like the view): the same coordinate system as the paddle controls
  function mapRect() { const m = Math.min(S.cw * 0.40, S.ch * 0.2); return { x: S.cw * 0.04, y: S.ch * 0.745, w: m, h: m }; }
  function mapXform() {
    const R = mapRect(), c = Math.cos(S.yaw), s = Math.sin(S.yaw), cell = R.w / (N * (Math.abs(c) + Math.abs(s)));
    return { R: R, cell: cell, cx: R.x + R.w / 2, cy: R.y + R.h / 2, c: c, s: s,
      to: function (x, y) { const X = x - N / 2, Z = y - N / 2; return [this.cx + (X * c + Z * s) * cell, this.cy - (-X * s + Z * c) * cell]; },
      from: function (px, py) { const a = (px - this.cx) / cell, b = -(py - this.cy) / cell; return [a * c - b * s + N / 2, a * s + b * c + N / 2]; } };
  }
  function drawMap() {
    const M = mapXform(), R = M.R;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(R.x, R.y, R.w, R.h); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, S.cw * 0.003); ctx.strokeRect(R.x, R.y, R.w, R.h);
    ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    const quad = function (x0, y0, x1, y1, fill, stroke) { const P = [M.to(x0, y0), M.to(x1, y0), M.to(x1, y1), M.to(x0, y1)]; ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } };
    quad(0, 0, N, N, 'rgba(40,70,140,0.35)', null);
    const low = {}; S.bricks.forEach(function (k) { const id = k.x + ',' + k.y; if (!low[id] || k.z < low[id].z) low[id] = k; });
    Object.keys(low).forEach(function (id) { const k = low[id], c = baseRgb(k.b); quad(k.x + 0.08, k.y + 0.08, k.x + 0.92, k.y + 0.92, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.75)', null); });
    ctx.lineWidth = 1; for (let i = 0; i <= N; i++) { quad(i, 0, i, N, null, 'rgba(150,190,255,0.4)'); quad(0, i, N, i, null, 'rgba(150,190,255,0.4)'); }
    if (S.hideT <= 0) quad(S.px - hs(), S.py - hs(), S.px + hs(), S.py + hs(), 'rgba(0,255,255,0.35)', '#0ff');
    if (S.ghostT <= 0) for (const b of [S.ball].concat(S.fakes)) { const p = M.to(b.x, b.y), rr = M.cell * (0.18 + 0.12 * (b.z / H)); ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(p[0], p[1], rr, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    BO.drawLineString(ctx, R.x + R.w * 0.34, R.y + 3, Math.max(7, R.w * 0.075), 'FAR', '#8cf');                // the top of the map is away from the camera
  }
  function draw() {
    const cw = S.cw, ch = S.ch;
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, cw, ch);
    if (S.mode === 'start') {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
      if (S.bg) { ctx.globalAlpha = 0.55; ctx.drawImage(S.bg, 0, 0, cw, ch); ctx.globalAlpha = 1; } else if (S.tex) { ctx.globalAlpha = 0.35; ctx.drawImage(S.tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
      const ts = Math.max(20, cw * 0.075); ctx.lineWidth = 1.5; BO.drawLineStringCentered(ctx, cw / 2, ch * 0.18, ts, 'BREAKOUT', '#fff');
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.18 + ts * 1.5, Math.max(10, ts * 0.5), '3D', '#8cf');
      const bw = cw * 0.35, bh = ch * 0.06; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(cw / 2 - bw / 2, ch * 0.52, bw, bh);
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.52 + bh * 0.25, Math.max(10, bh * 0.5), 'START', '#fff');
      ctx.strokeRect(cw / 2 - bw / 2, ch * 0.62, bw, bh); BO.drawLineStringCentered(ctx, cw / 2, ch * 0.62 + bh * 0.25, Math.max(10, bh * 0.5), 'ABOUT', '#fff');
      const fs = Math.max(9, Math.floor(cw * 0.028)); ctx.font = 'bold ' + fs + 'px monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('Also: Breakout 2D', cw / 2, ch * 0.82); ctx.fillText('Switch in Game > Theme', cw / 2, ch * 0.82 + fs * 1.3);
      if (S.best) BO.drawLineStringCentered(ctx, cw / 2, ch * 0.72, Math.max(9, cw * 0.035), 'BEST ' + S.best, '#8cf');
      return;
    }
    if (S.tex) { ctx.globalAlpha = 0.3; ctx.drawImage(S.tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
    drawShaft();
    const b = S.ball, items = S.bricks.map(function (k) { return { d: proj(k.x + 0.5, k.y + 0.5, k.z + 0.5)[2], k: k }; });
    if (S.ghostT <= 0) [b].concat(S.fakes).forEach(function (bb) { items.push({ d: proj(bb.x, bb.y, bb.z)[2], ball: bb }); });
    S.items.forEach(function (it) { items.push({ d: proj(it.x, it.y, it.z)[2], item: it }); }); items.sort(function (a, c) { return c.d - a.d; });
    if (S.ghostT <= 0) for (const bb of [b].concat(S.fakes)) {                          // shadow on the floor + a guide line down to it (the decoys have them too)
    const sh = projW(bb.x, 0, bb.y), g0 = proj(bb.x, bb.y, bb.z);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(sh[0], sh[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.ellipse(sh[0], sh[1], bb.r * S.sc * 1.1, bb.r * S.sc * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    }
    const h = hs();
    if (S.hideT <= 0) {
    quadW([S.px - h, 0, S.py - h], [S.px + h, 0, S.py - h], [S.px + h, 0, S.py + h], [S.px - h, 0, S.py + h], 'rgba(0,255,255,0.32)');   // the paddle lies on the floor
    ctx.strokeStyle = '#0ff'; ctx.lineWidth = Math.max(1.5, S.sc * 0.06); ctx.beginPath();
    lineW([S.px - h, 0, S.py - h], [S.px + h, 0, S.py - h]); lineW([S.px + h, 0, S.py - h], [S.px + h, 0, S.py + h]); lineW([S.px + h, 0, S.py + h], [S.px - h, 0, S.py + h]); lineW([S.px - h, 0, S.py + h], [S.px - h, 0, S.py - h]); ctx.stroke();
    }
    for (const it of items) {
      if (it.item) {                                                        // an item: a ball (blue = shorter paddle, orange = longer paddle) with a shadow on the floor
        const m = it.item, c = BO.ITEM_RGB[m.type], p = proj(m.x, m.y, m.z), r = m.r * S.sc * 1.15, sh2 = projW(m.x, 0, m.y), gr = ctx.createRadialGradient(p[0] - r * 0.3, p[1] - r * 0.3, r * 0.1, p[0], p[1], r);
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(sh2[0], sh2[1], r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgb(' + c.join(',') + ')'); gr.addColorStop(1, 'rgb(' + c.map(function (v) { return Math.round(v * 0.55); }).join(',') + ')');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      } else if (it.ball) {
        const bb = it.ball, p = proj(bb.x, bb.y, bb.z), r = bb.r * S.sc, gr = ctx.createRadialGradient(p[0] - r * 0.3, p[1] - r * 0.3, r * 0.1, p[0], p[1], r);
        gr.addColorStop(0, S.powerT > 0 ? '#555' : '#fff'); gr.addColorStop(1, S.powerT > 0 ? '#000' : '#9bd'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill();
        if (S.powerT > 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, S.sc * 0.04); ctx.stroke(); }
      } else drawCube(it.k.x, it.k.z, it.k.y, it.k.b);
    }
    const hud = Math.max(8, cw * 0.034), hy = ch * 0.03;
    BO.drawLineString(ctx, cw * 0.04, hy, hud, 'SCORE ' + S.score, '#fff'); BO.drawLineString(ctx, cw * 0.04, hy + hud * 1.3, hud * 0.75, 'BEST ' + S.best, '#888');
    BO.drawLineString(ctx, cw * 0.58, hy, hud, 'LV ' + S.level, '#0ff'); BO.drawLineString(ctx, cw * 0.58, hy + hud * 1.3, hud * 0.75, S.auto ? 'AUTO PLAY' : 'ONE BALL', S.auto ? '#6f6' : '#f9c');
    if (S.flash > 0) { ctx.fillStyle = 'rgba(255,0,0,' + (S.flash * 0.5) + ')'; ctx.fillRect(0, 0, cw, ch); }
    if (S.msgT > 0) BO.drawLineStringCentered(ctx, cw / 2, ch * 0.4, cw * 0.07, S.msg, '#ff0');
    if (S.rowMsgT > 0) BO.drawLineStringCentered(ctx, cw / 2, ch * 0.34, cw * 0.05, S.rowMsg, '#8f8');
    if (S.items.length) { let low = S.items[0]; for (const it of S.items) if (it.z < low.z) low = it; BO.drawItemInfo(ctx, cw, ch * 0.715, low.type); }         // what the falling item does
    else if (S.mode === 'play' && S.ball.stuck) { const fs = Math.max(9, Math.floor(cw * 0.028)); ctx.font = 'bold ' + fs + 'px monospace'; ctx.fillStyle = '#ff9'; ctx.textAlign = 'center'; ctx.fillText('Space / tap the paddle: launch', cw / 2, ch * 0.715); }
    drawMap();
    if (S.mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, ch * 0.2, cw, ch * 0.34);
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.28, cw * 0.075, 'GAME OVER', '#f55'); BO.drawLineStringCentered(ctx, cw / 2, ch * 0.38, cw * 0.045, 'SCORE ' + S.score, '#fff');
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.47, cw * 0.04, 'TAP TO RETRY', '#0ff');
    }
  }

  // ---------------- input ----------------
  function pos(e) { const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1; return { x: (e.clientX - r.left) * d, y: (e.clientY - r.top) * d }; }
  function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function toFloor(p) {                        // screen -> floor (Y = 0): the map is affine, invert it with two basis vectors
    const o = projW(0, 0, 0), a = projW(1, 0, 0), b = projW(0, 0, 1), ax = a[0] - o[0], ay = a[1] - o[1], bx = b[0] - o[0], by = b[1] - o[1], det = ax * by - ay * bx, dx = p.x - o[0], dy = p.y - o[1];
    return [(dx * by - dy * bx) / det, (ax * dy - ay * dx) / det];
  }
  function nearPaddle(p) { const c = projW(S.px, 0, S.py); return Math.hypot(p.x - c[0], p.y - c[1]) < S.sc * (1.1 + hs()); }
  // The paddle only moves while the mouse button (or a finger) is down and dragged - no hovering.  The first press decides what the drag does:
  //   on the floor map: the paddle goes to the touched spot;  near the paddle: slide to move it (it keeps its offset; a tap launches);  anywhere else: the drag rotates the view.
  // (the right mouse button always rotates the view)
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    const p = pos(e); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    if (S.mode === 'start') {                                             // START / ABOUT buttons; while the ABOUT pages are open a tap shows the next page
      if (S.about) { S.about = S.about >= window.ATARI_ABOUT_PAGES ? 0 : S.about + 1; return; }
      const bw = S.cw * 0.35, bh = S.ch * 0.06, x0 = S.cw / 2 - bw / 2;
      if (inRect(p, { x: x0, y: S.ch * 0.52, w: bw, h: bh })) newGame(); else if (inRect(p, { x: x0, y: S.ch * 0.62, w: bw, h: bh })) S.about = 1;
      return;
    }
    if (S.mode !== 'play') { newGame(); return; }
    S.auto = false;                                                       // (touching the field takes over from the auto play)
    if (e.pointerType === 'mouse' && e.button === 2) { S.drag = { kind: 'view', x: p.x, y: p.y, yaw: S.yaw, pitch: S.pitch }; return; }
    const M = mapXform();
    if (inRect(p, M.R)) { S.drag = { kind: 'map' }; S.target = M.from(p.x, p.y); return; }
    if (nearPaddle(p)) { const f = toFloor(p); S.drag = { kind: 'paddle', f: f, px: S.px, py: S.py, moved: false, x: p.x, y: p.y }; return; }
    S.drag = { kind: 'view', x: p.x, y: p.y, yaw: S.yaw, pitch: S.pitch };
  });
  canvas.addEventListener('pointermove', function (e) {
    if (S.mode !== 'play' || !S.drag) return; const p = pos(e), d = S.drag;
    if (d.kind === 'map') S.target = mapXform().from(p.x, p.y);
    else if (d.kind === 'paddle') { if (Math.hypot(p.x - d.x, p.y - d.y) > 6) d.moved = true; if (d.moved) { const f = toFloor(p); S.target = [d.px + f[0] - d.f[0], d.py + f[1] - d.f[1]]; } }
    else if (d.kind === 'view') { S.yaw = d.yaw + (p.x - d.x) / S.cw * 3.2; S.pitch = Math.max(0.12, Math.min(1.3, d.pitch + (p.y - d.y) / S.ch * 2.2)); }
  });
  window.addEventListener('pointerup', function () { if (S.drag && S.drag.kind === 'paddle' && !S.drag.moved && S.mode === 'play') launch(); if (S.drag && S.drag.kind !== 'view') S.target = null; S.drag = null; });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'F3') { e.preventDefault(); window.toggleAuto(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (S.mode === 'start' && S.about) S.about = S.about >= window.ATARI_ABOUT_PAGES ? 0 : S.about + 1; else if (S.mode !== 'play') newGame(); else launch(); }
    else if (e.key === 'q' || e.key === 'Q') S.yaw -= 0.12; else if (e.key === 'e' || e.key === 'E') S.yaw += 0.12;
    else if (e.key === 'p' || e.key === 'P') S.paused = !S.paused;
  });

  let last = 0;
  function frame(t) {
    window.__atariAbout = S.mode === 'start' ? S.about : 0; const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; if (S.flash > 0) S.flash -= dt; step(dt); draw(); requestAnimationFrame(frame); }
  window.__bo = { S: S, step: step, launch: launch, newGame: newGame, proj: projW, toFloor: toFloor, mapXform: mapXform, nearPaddle: nearPaddle };
  resize(); buildLevel();
  Promise.all([BO.loadTexture(1), BO.loadStartBg()]).then(function (r) { S.tex = r[0]; S.bg = r[1]; });
  requestAnimationFrame(frame);
})();
