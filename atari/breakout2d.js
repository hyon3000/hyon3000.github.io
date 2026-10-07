// Breakout 2D - forked from Polynomino's page / canvas / line-font / start-screen style.
// Bricks: black = 2 hits, white = 3 hits, every other brick = 1 hit in a random fully saturated colour.  No AI mode.
(function () {
  'use strict';
  const BO = window.BO;
  const canvas = document.getElementById('app'), ctx = canvas.getContext('2d');
  const FW = 100, FH = 130;                     // logical field size
  const COLS = 10, BW = FW / COLS, BH = 4.4, TOP = 12;
  const ROWS = 5;                                // five rows are always kept (see shiftRows)
  const S = { mode: 'start', level: 1, score: 0, started: false, clock: 0, best: 0, bricks: [], rows: ROWS, items: [], mul: 1, hideT: 0, ghostT: 0, powerT: 0, timeT: 0, timeMul: 1, fakes: [], cleared: 0, pending: 0, rowMsg: '', rowMsgT: 0, ball: null, px: FW / 2, pw: 18, ph: 2.4, py: FH - 9, held: { l: 0, r: 0 }, speed: 70,
    about: 0, auto: false, autoT: 0, cw: 0, ch: 0, sc: 1, fx: 0, fy: 0, tex: null, bg: null, flash: 0, msg: '', msgT: 0, pointerX: null, paused: false };
  try { S.best = parseInt(localStorage.getItem('breakout2d_best'), 10) || 0; } catch (e) {}

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    S.cw = canvas.width = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
    S.ch = canvas.height = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
    S.sc = S.cw * 0.92 / FW; S.fx = S.cw * 0.04; S.fy = S.ch * 0.105;
  }
  window.addEventListener('resize', resize);

  function newRow(below) {                       // a random row (at least 6 bricks); the multi-hit bricks (black / white / gray) come in clusters: a brick next to / above one is much more likely to be one too
    for (;;) {
      const row = []; let n = 0;
      for (let c = 0; c < COLS; c++) {
        if (Math.random() >= 0.92) { row.push(null); continue; }
        const near = (c > 0 && row[c - 1] && row[c - 1].max > 1 ? 1 : 0) + (below && below[c] && below[c].max > 1 ? 1 : 0);
        row.push(BO.makeBrick(S.level, Math.random() < BO.toughProb(S.level, near))); n++;
      }
      if (n >= 6) return row;
    }
  }
  function buildLevel() {
    S.bricks = new Array(ROWS); let below = null; for (let r = ROWS - 1; r >= 0; r--) { S.bricks[r] = newRow(below); below = S.bricks[r]; }
    S.cleared = 0; S.pending = 0; S.level = 1; S.speed = 70; S.items = []; S.mul = 1; S.hideT = 0; S.ghostT = 0; S.powerT = 0; S.timeT = 0; S.fakes = []; applyPw();
    resetBall();
  }
  function rowEmpty(r) { return S.bricks[r].every(function (b) { return !b; }); }
  function applyPw() { S.pw = Math.max(5, Math.min(44, Math.max(12, 19 - (S.level - 1) * 0.8) * S.mul)); }      // paddle length = (level based length) x (item factor)
  function setSpeed() { applyPw(); S.speed = Math.min(135, 70 * (1 + 0.07 * (S.level - 1))); const b = S.ball; if (b && !b.stuck) { const sp = Math.hypot(b.vx, b.vy) || 1; b.vx *= S.speed / sp; b.vy *= S.speed / sp; } }
  // The bottom row is gone: every brick moves down one row and a new row appears at the top.  A ball that is still up there (e.g. bouncing between the ceiling and the top row
  // and eating that row) must not get buried in the new row: the shift waits until the ball is clear of every brick it would overlap (after 3 s it is pushed out downwards instead).
  function ballHits(grid) {
    const b = S.ball, m = b.r + 0.4;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c]) {
      const x0 = c * BW, y0 = TOP + r * BH, qx = Math.max(x0, Math.min(x0 + BW, b.x)), qy = Math.max(y0, Math.min(y0 + BH, b.y));
      if ((b.x - qx) * (b.x - qx) + (b.y - qy) * (b.y - qy) < m * m) return true;
    }
    return false;
  }
  function trySpawn(dt) {
    let guard = 0;
    while (rowEmpty(ROWS - 1) && guard++ < ROWS) {
      const next = S.bricks.slice(0, ROWS - 1); next.unshift(S.nextRow || (S.nextRow = newRow(S.bricks[0])));
      if (!S.ball.stuck && ballHits(next)) { S.pending += dt; if (S.pending < 3) return; }
      S.bricks = next; S.nextRow = null; S.pending = 0;
      if (ballHits(S.bricks) && !S.ball.stuck) { let n = 0; while (ballHits(S.bricks) && S.ball.y < FH && n++ < 400) S.ball.y += 0.25; if (S.ball.vy < 0) S.ball.vy = -S.ball.vy; }
    }
  }
  function resetBall() { S.ball = { x: S.px, y: S.py - 1.6, vx: 0, vy: 0, r: 1.6, stuck: true }; }
  function newGame() { S.score = 0; S.started = false; S.px = FW / 2; S.mode = 'play'; S.nextRow = null; buildLevel(); }
  function launch() {
    if (S.mode !== 'play' || !S.ball.stuck) return;
    if (!S.started) { S.started = true; S.score = 0; S.cleared = 0; S.clock = 0; }         // the score starts from 0 when the ball is shot for the first time
    const a = (Math.random() * 40 - 20) * Math.PI / 180;
    S.ball.stuck = false; S.ball.vx = S.speed * Math.sin(a); S.ball.vy = -S.speed * Math.cos(a);
  }
  
  function step(dt) {
    if (S.mode !== 'play' || S.paused) return;
    trySpawn(dt);
    if (S.auto) autoPlay(dt);
    const mv = (S.held.r - S.held.l) * 115 * dt;
    if (mv) { S.px += mv; S.pointerX = null; }
    if (S.pointerX !== null) S.px += (S.pointerX - S.px) * Math.min(1, dt * 40);
    S.px = Math.max(S.pw / 2, Math.min(FW - S.pw / 2, S.px));
    if (S.started && !b0Stuck()) { S.clock += dt; while (S.clock >= 1) { S.clock -= 1; S.score -= 1; } }      // -1 point for every second that passes (the score can go negative)
    if (S.hideT > 0) S.hideT -= dt; if (S.ghostT > 0) S.ghostT -= dt; if (S.powerT > 0) S.powerT -= dt; if (S.timeT > 0) S.timeT -= dt;
    const gdt = dt * (S.timeT > 0 ? S.timeMul : 1);                          // game time: items / ball use it (time items make it 2x faster or 0.5x slower), the paddle control keeps real time
    stepItems(gdt); stepFakes(gdt, dt);
    const b = S.ball;
    if (b.stuck) { b.x = S.px; b.y = S.py - b.r; return; }
    const n = Math.max(1, Math.ceil(gdt / (1 / 240)));
    for (let i = 0; i < n; i++) { sub(gdt / n); if (S.mode !== 'play' || b.stuck) break; }
    if (S.msgT > 0) S.msgT -= dt; if (S.rowMsgT > 0) S.rowMsgT -= dt;
  }
  // auto play (F3): the reinforcement-learning policy (ai.js) chooses the paddle target 20 times a second
  function autoPlay(dt) {
    if (!window.AtariAI || !AtariAI.ready('2d')) { S.auto = false; return; }
    if (S.ball.stuck) { launch(); return; }
    S.autoT += dt;
    if (S.autoT >= 0.05) { S.autoT = 0; S.pointerX = AtariAI.act2d(S); }
  }
  window.toggleAuto = function () { if (S.mode !== 'play') return S.auto; S.auto = !S.auto && !!(window.AtariAI && AtariAI.ready('2d')); if (!S.auto) S.pointerX = null; return S.auto; };
  function spawnFakes() {                        // the decoys pop out of the real ball: same position, random directions
    for (let k = 0; k < 2; k++) {
      const a = (Math.random() * 0.5 + 0.25) * Math.PI * (Math.random() < 0.5 ? -1 : 1) + (Math.random() < 0.5 ? 0 : Math.PI);
      S.fakes.push({ x: S.ball.x, y: S.ball.y, vx: Math.cos(a) * S.speed, vy: Math.sin(a) * S.speed, r: 1.6, t: 10 });          // they start where the real ball is at that moment
    }
  }
  function stepFakes(dt, real) {                 // decoys: bounce off walls / bricks / paddle / floor like the ball but never hurt anything; each one disappears 10 s after it appeared
    if (!S.fakes.length) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (const f of S.fakes) { f.t -= real; for (let i = 0; i < n; i++) {
      const d = dt / n; f.x += f.vx * d; f.y += f.vy * d;
      if (f.x < f.r) { f.x = f.r; f.vx = Math.abs(f.vx); } else if (f.x > FW - f.r) { f.x = FW - f.r; f.vx = -Math.abs(f.vx); }
      if (f.y < f.r) { f.y = f.r; f.vy = Math.abs(f.vy); } else if (f.y > FH - f.r) { f.y = FH - f.r; f.vy = -Math.abs(f.vy); }
      if (f.vy > 0 && f.y + f.r >= S.py && f.y - f.r <= S.py + S.ph && Math.abs(f.x - S.px) <= S.pw / 2 + f.r) { f.y = S.py - f.r; f.vy = -Math.abs(f.vy); }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (S.bricks[r][c]) {
        const dx = f.x - (c + 0.5) * BW, dy = f.y - (TOP + (r + 0.5) * BH), px = BW / 2 + f.r - Math.abs(dx), py = BH / 2 + f.r - Math.abs(dy);
        if (px > 0 && py > 0) { if (px < py) { f.vx = dx > 0 ? Math.abs(f.vx) : -Math.abs(f.vx); f.x += dx > 0 ? px : -px; } else { f.vy = dy > 0 ? Math.abs(f.vy) : -Math.abs(f.vy); f.y += dy > 0 ? py : -py; } }
      }
      const sp = Math.hypot(f.vx, f.vy) || 1; f.vx *= S.speed / sp; f.vy *= S.speed / sp;
    } }
    S.fakes = S.fakes.filter(function (f) { return f.t > 0; });
  }
  function b0Stuck() { return !!(S.ball && S.ball.stuck); }
  function stepItems(dt) {                       // falling items: caught by the paddle = applied (short: half the length, long: double)
    for (let i = S.items.length - 1; i >= 0; i--) {
      const it = S.items[i]; it.vy = Math.min(46, it.vy + 40 * dt); it.y += it.vy * dt;
      if (it.y + it.r >= S.py && it.y - it.r <= S.py + S.ph && Math.abs(it.x - S.px) <= S.pw / 2 + it.r) {
        if (it.type === 'fake') { spawnFakes(); S.msg = 'FAKE BALLS'; }                                     // two more decoys (each lives 10 s; picking more of them adds up: 4, 6, ...)
        else if (it.type === 'norm') { S.timeT = 0; S.timeMul = 1; S.mul = 1; applyPw(); S.px = Math.max(S.pw / 2, Math.min(FW - S.pw / 2, S.px)); S.msg = 'NORMAL'; }      // time scale and paddle length back to normal
        else if (it.type === 'fast' || it.type === 'slow') { S.timeT = 30; S.timeMul = it.type === 'fast' ? 2 : 0.5; S.msg = it.type === 'fast' ? 'TIME x2' : 'TIME x1/2'; }     // 30 seconds of faster / slower time (the latest one wins)
        else if (it.type === 'power') { S.powerT = 30; S.msg = 'POWER BALL'; }                          // 30 seconds: a black ball that breaks every brick with a single hit
        else if (it.type === 'ghost') { S.ghostT = 5; S.msg = 'BALL HIDDEN'; }                         // the ball is only invisible for 5 seconds, it still flies and bounces
        else if (it.type === 'hide') { S.hideT = 3; S.msg = 'PADDLE HIDDEN'; }                      // the paddle disappears completely for 3 seconds
        else { S.mul = it.type === 'short' ? S.mul * 0.5 : S.mul * 2; applyPw(); S.px = Math.max(S.pw / 2, Math.min(FW - S.pw / 2, S.px)); S.msg = it.type === 'short' ? 'SHORT PADDLE' : 'LONG PADDLE'; }
        S.msgT = 1.0; S.items.splice(i, 1);
      } else if (it.y - it.r > FH) S.items.splice(i, 1);
    }
  }
  function sub(dt) {
    const b = S.ball; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); } else if (b.x > FW - b.r) { b.x = FW - b.r; b.vx = -Math.abs(b.vx); }
    if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
    // paddle
    if (b.vy > 0 && b.y + b.r >= S.py && b.y - b.r <= S.py + S.ph && Math.abs(b.x - S.px) <= S.pw / 2 + b.r * 0.8) {
      const t = Math.max(-1, Math.min(1, (b.x - S.px) / (S.pw / 2))), ang = t * 62 * Math.PI / 180 + (Math.random() - 0.5) * 0.14;   // (a little noise: no endless vertical loops)
      b.y = S.py - b.r; b.vx = S.speed * Math.sin(ang); b.vy = -S.speed * Math.cos(ang);
    }
    // bricks: the one overlapped most is hit
    let best = null, bp = 0;
    const c0 = Math.max(0, Math.floor((b.x - b.r) / BW)), c1 = Math.min(COLS - 1, Math.floor((b.x + b.r) / BW));
    const r0 = Math.max(0, Math.floor((b.y - b.r - TOP) / BH)), r1 = Math.min(ROWS - 1, Math.floor((b.y + b.r - TOP) / BH));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const br = S.bricks[r][c]; if (!br) continue;
      const cx = (c + 0.5) * BW, cy = TOP + (r + 0.5) * BH, dx = b.x - cx, dy = b.y - cy;
      const px = BW / 2 + b.r - Math.abs(dx), py = BH / 2 + b.r - Math.abs(dy);
      if (px > 0 && py > 0) { const p = Math.min(px, py); if (p > bp) { bp = p; best = { r: r, c: c, dx: dx, dy: dy, px: px, py: py }; } }
    }
    if (best) {
      if (best.px < best.py) { b.vx = best.dx > 0 ? Math.abs(b.vx) : -Math.abs(b.vx); b.x += best.dx > 0 ? best.px : -best.px; }
      else { b.vy = best.dy > 0 ? Math.abs(b.vy) : -Math.abs(b.vy); b.y += best.dy > 0 ? best.py : -best.py; }
      const br = S.bricks[best.r][best.c]; br.hits = S.powerT > 0 ? 0 : br.hits - 1;
      S.score += 2;                                                       // every hit on a brick: +2
      if (br.hits <= 0) {
        S.bricks[best.r][best.c] = null;
        if (br.item) S.items.push({ x: (best.c + 0.5) * BW, y: TOP + (best.r + 0.5) * BH, vy: 8, r: 1.8, type: br.item });       // the item hidden in the brick starts to fall
        if (rowEmpty(best.r)) {                                           // points are given for every completely cleared row
          const pts = 100; S.score += pts; S.rowMsg = 'ROW +' + pts; S.rowMsgT = 1.1; S.cleared++;
          if (S.cleared % 3 === 0) { S.level++; S.msg = 'LEVEL ' + S.level; S.msgT = 1.4; setSpeed(); }
          if (S.score > S.best) { S.best = S.score; try { localStorage.setItem('breakout2d_best', String(S.best)); } catch (e) {} }
        }
      }
    }
    // keep the ball from running (nearly) horizontally
    const sp = Math.hypot(b.vx, b.vy), minv = sp * 0.22;
    if (Math.abs(b.vy) < minv) { b.vy = (b.vy < 0 ? -1 : 1) * minv; const k = Math.sqrt(sp * sp - b.vy * b.vy); b.vx = (b.vx < 0 ? -1 : 1) * k; }
    if (b.y - b.r > FH) {
      // one ball = one game: when it falls the game is over and the score is final
      S.flash = 0.4; S.items = []; S.mul = 1; S.hideT = 0; S.ghostT = 0; S.powerT = 0; S.timeT = 0; S.fakes = []; applyPw();
      if (S.score > S.best) { S.best = S.score; try { localStorage.setItem('breakout2d_best', String(S.best)); } catch (e) {} }
      S.mode = 'over';
    }
  }

  // ---------------- drawing ----------------
  function drawBrick(br, x, y, w, h) {
    const m = Math.max(1, S.sc * 0.25), X = x + m, Y = y + m, W = w - 2 * m, H = h - 2 * m, dmg = br.max - br.hits;
    ctx.fillStyle = 'rgb(' + br.rgb.join(',') + ')'; ctx.fillRect(X, Y, W, H);
    if (br.kind === 'color') { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(X, Y, W, H * 0.3); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(X, Y + H * 0.8, W, H * 0.2); }
    ctx.lineWidth = Math.max(1, S.sc * 0.3);
    ctx.strokeStyle = br.kind === 'black' ? '#fff' : (br.kind === 'white' ? '#888' : (br.kind === 'gray' ? '#ddd' : 'rgba(255,255,255,0.7)')); ctx.strokeRect(X, Y, W, H);
    if (dmg > 0) {                                                     // cracks: one more per hit taken
      ctx.strokeStyle = br.kind === 'black' ? '#fff' : '#222'; ctx.lineWidth = Math.max(1, S.sc * 0.3);
      const cr = BO.crackPaths(br.seed, dmg);
      for (const path of cr) { ctx.beginPath(); path.forEach(function (q, k) { const px = X + q[0] * W, py = Y + q[1] * H; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke(); }
    }
  }
  function draw() {
    const cw = S.cw, ch = S.ch;
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, cw, ch);
    if (S.mode === 'start') {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
      if (S.bg) { ctx.globalAlpha = 0.5; ctx.drawImage(S.bg, 0, 0, cw, ch); ctx.globalAlpha = 1; } else if (S.tex) { ctx.globalAlpha = 0.3; ctx.drawImage(S.tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
      const ts = Math.max(20, cw * 0.075); ctx.lineWidth = 1.5; BO.drawLineStringCentered(ctx, cw / 2, ch * 0.18, ts, 'BREAKOUT', '#fff');
      const bw = cw * 0.35, bh = ch * 0.06; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(cw / 2 - bw / 2, ch * 0.52, bw, bh);
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.52 + bh * 0.25, Math.max(10, bh * 0.5), 'START', '#fff');
      ctx.strokeRect(cw / 2 - bw / 2, ch * 0.62, bw, bh); BO.drawLineStringCentered(ctx, cw / 2, ch * 0.62 + bh * 0.25, Math.max(10, bh * 0.5), 'ABOUT', '#fff');
      const fs = Math.max(9, Math.floor(cw * 0.028)); ctx.font = 'bold ' + fs + 'px monospace'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText('Also: Breakout 3D', cw / 2, ch * 0.82); ctx.fillText('Switch in Game > Theme', cw / 2, ch * 0.82 + fs * 1.3);
      if (S.best) BO.drawLineStringCentered(ctx, cw / 2, ch * 0.72, Math.max(9, cw * 0.035), 'BEST ' + S.best, '#8cf');
      return;
    }
    if (S.tex) { ctx.globalAlpha = 0.3; ctx.drawImage(S.tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
    const sc = S.sc, fx = S.fx, fy = S.fy;
    // field
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(fx, fy, FW * sc, FH * sc);
    ctx.strokeStyle = S.flash > 0 ? '#f55' : '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(fx, fy, FW * sc, FH * sc);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const br = S.bricks[r][c]; if (br) drawBrick(br, fx + c * BW * sc, fy + (TOP + r * BH) * sc, BW * sc, BH * sc); }
    // paddle
    if (S.hideT <= 0) {
      ctx.fillStyle = '#cfe'; ctx.fillRect(fx + (S.px - S.pw / 2) * sc, fy + S.py * sc, S.pw * sc, S.ph * sc);
      ctx.strokeStyle = '#0ff'; ctx.lineWidth = 1; ctx.strokeRect(fx + (S.px - S.pw / 2) * sc, fy + S.py * sc, S.pw * sc, S.ph * sc);
    }
    for (const it of S.items) {                  // items: balls, blue = shorter paddle, orange = longer paddle, red = hidden paddle
      const c = BO.ITEM_RGB[it.type], x = fx + it.x * sc, y = fy + it.y * sc, r = it.r * sc, g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.35, 'rgb(' + c.join(',') + ')'); g.addColorStop(1, 'rgb(' + c.map(function (v) { return Math.round(v * 0.55); }).join(',') + ')');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // ball
    if (S.ghostT <= 0) for (const b of [S.ball].concat(S.fakes)) { ctx.fillStyle = S.powerT > 0 ? '#000' : '#fff'; ctx.beginPath(); ctx.arc(fx + b.x * sc, fy + b.y * sc, b.r * sc, 0, Math.PI * 2); ctx.fill(); if (S.powerT > 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, sc * 0.25); ctx.stroke(); } }
    // HUD (line font)
    const hs = Math.max(8, cw * 0.034), hy = ch * 0.03;
    BO.drawLineString(ctx, cw * 0.04, hy, hs, 'SCORE ' + S.score, '#fff');
    BO.drawLineString(ctx, cw * 0.04, hy + hs * 1.3, hs * 0.75, 'BEST ' + S.best, '#888');
    BO.drawLineString(ctx, cw * 0.58, hy, hs, 'LV ' + S.level, '#0ff');
    BO.drawLineString(ctx, cw * 0.58, hy + hs * 1.3, hs * 0.75, S.auto ? 'AUTO PLAY' : 'ONE BALL', S.auto ? '#6f6' : '#f9c');
    if (S.msgT > 0) BO.drawLineStringCentered(ctx, cw / 2, ch * 0.4, cw * 0.07, S.msg, '#ff0');
    if (S.items.length) { let low = S.items[0]; for (const it of S.items) if (it.y > low.y) low = it; BO.drawItemInfo(ctx, cw, ch * 0.738, low.type); }         // what the falling item does
    if (S.rowMsgT > 0) BO.drawLineStringCentered(ctx, cw / 2, ch * 0.33, cw * 0.05, S.rowMsg, '#8f8');
    if (S.mode === 'play' && S.ball.stuck) { const fs = Math.max(9, Math.floor(cw * 0.03)); ctx.font = 'bold ' + fs + 'px monospace'; ctx.fillStyle = '#ff9'; ctx.textAlign = 'center'; ctx.fillText('Tap / Space: launch', cw / 2, fy + (FH - 22) * sc); }
    // buttons
    if (S.mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(fx, fy, FW * sc, FH * sc);
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.28, cw * 0.075, 'GAME OVER', '#f55');
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.38, cw * 0.045, 'SCORE ' + S.score, '#fff');
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.47, cw * 0.04, 'TAP TO RETRY', '#0ff');
    }
  }

  // ---------------- input ----------------
  function pos(e) { const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1; return { x: (e.clientX - r.left) * d, y: (e.clientY - r.top) * d }; }
  function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  // The paddle only moves while the mouse button (or a finger) is down on the field and dragged: it keeps its offset to the pointer (no jump); a tap / click without dragging launches.
  canvas.addEventListener('pointerdown', function (e) {
    const p = pos(e); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    if (S.mode === 'start') {                                             // START / ABOUT buttons; while the ABOUT pages are open a tap shows the next page
      if (S.about) { S.about = S.about >= window.ATARI_ABOUT_PAGES ? 0 : S.about + 1; return; }
      const bw = S.cw * 0.35, bh = S.ch * 0.06, x0 = S.cw / 2 - bw / 2;
      if (inRect(p, { x: x0, y: S.ch * 0.52, w: bw, h: bh })) newGame(); else if (inRect(p, { x: x0, y: S.ch * 0.62, w: bw, h: bh })) S.about = 1;
      return;
    }
    if (S.mode === 'over') { newGame(); return; }
    S.auto = false; S.drag = { x: p.x, px: S.px, moved: false }; S.pointerX = null;           // (touching the field takes over from the auto play)
  });
  canvas.addEventListener('pointermove', function (e) {
    if (S.mode !== 'play' || !S.drag) return; const p = pos(e);
    if (Math.abs(p.x - S.drag.x) > 6) S.drag.moved = true;
    if (S.drag.moved) S.pointerX = S.drag.px + (p.x - S.drag.x) / S.sc;
  });
  window.addEventListener('pointerup', function () { S.held.l = S.held.r = 0; if (S.drag && !S.drag.moved && S.mode === 'play') launch(); S.drag = null; S.pointerX = null; });
  window.addEventListener('keydown', function (e) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { S.held.l = 1; e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { S.held.r = 1; e.preventDefault(); }
    else if (k === ' ' || k === 'Enter' || k === 'ArrowUp') { e.preventDefault(); if (S.mode === 'start' && S.about) S.about = S.about >= window.ATARI_ABOUT_PAGES ? 0 : S.about + 1; else if (S.mode !== 'play') newGame(); else launch(); }
    else if (k === 'p' || k === 'P') S.paused = !S.paused;
    else if (k === 'F3') { e.preventDefault(); window.toggleAuto(); }
  });
  window.addEventListener('keyup', function (e) { const k = e.key; if (k === 'ArrowLeft' || k === 'a' || k === 'A') S.held.l = 0; if (k === 'ArrowRight' || k === 'd' || k === 'D') S.held.r = 0; });

  let last = 0;
  function frame(t) {
    window.__atariAbout = S.mode === 'start' ? S.about : 0;
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    if (S.flash > 0) S.flash -= dt;
    for (const row of S.bricks) for (const b of row) if (b && b.flash > 0) b.flash -= dt;
    step(dt); draw(); requestAnimationFrame(frame);
  }
  window.__bo = { S: S, step: step, launch: launch, newGame: newGame, FW: FW, FH: FH };
  resize(); buildLevel();
  Promise.all([BO.loadTexture(1), BO.loadStartBg()]).then(function (r) { S.tex = r[0]; S.bg = r[1]; });
  requestAnimationFrame(frame);
})();
