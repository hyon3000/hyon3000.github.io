// Bullet Shot 3D page: perspective drawing of core3d.js (the ship is seen from behind, sprites are scaled billboards), keyboard / pointer input, 60 Hz loop, sound, auto-player hook.
(function () {
  'use strict';
  var SH = window.Shooter3D, AI = window.ShooterAI3D, SPR = window.ShooterSprites, W = 224, H = 288;
  var KO = /^ko/i.test(navigator.language || 'ko');
  var TX = KO ? { title: '총알쏘기 3D', start: '클릭 / 스페이스로 시작', keys: '방향키/WASD 이동 · 스페이스 발사 · P 일시정지', stage: '스테이지', over: '게임 오버', acc: '명중률', paused: '일시정지', score: '점수', hi: '최고', auto: '자동', clear: '스테이지 클리어!' }
    : { title: 'BULLET SHOT 3D', start: 'Click / Space to start', keys: 'Arrows/WASD move · Space fire · P pause', stage: 'STAGE', over: 'GAME OVER', acc: 'Accuracy', paused: 'PAUSED', score: 'SCORE', hi: 'HI', auto: 'AUTO', clear: 'Stage clear!' };
  var cv = document.getElementById('cv'), ctx = cv.getContext('2d'), S = 1, dpr = window.devicePixelRatio || 1;
  var s = SH.newState((Math.random() * 1e9) | 0), keys = {}, ptr = null, autoOn = false, paused = false, soundOn = true, hintT = 0;
  var hi = 0; try { hi = +localStorage.getItem('shooter3d_hi') || 0; } catch (e) {}
  var stars = []; for (var i = 0; i < 90; i++) stars.push({ x: (Math.random() - 0.5) * 700, y: (Math.random() - 0.5) * 500, z: Math.random() * 360, c: 120 + (Math.random() * 120 | 0) });

  /* ---------- sound ---------- */
  var ac = null;
  function beep(f0, f1, dur, type, vol) {
    if (!soundOn) return;
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function sfx(ev) {
    if (ev === 'shot') beep(900, 300, 0.07, 'square', 0.025); else if (ev === 'kill') beep(300, 60, 0.18, 'sawtooth', 0.05); else if (ev === 'hit') beep(500, 300, 0.06, 'triangle', 0.05);
    else if (ev === 'die') beep(200, 40, 0.6, 'sawtooth', 0.08); else if (ev === 'clear') beep(500, 900, 0.3, 'square', 0.05); else if (ev === 'life') beep(600, 1200, 0.4, 'triangle', 0.06);
  }

  /* ---------- projection: camera behind the ship (z = -60), it follows the ship a little ---------- */
  var D = 120, CAMZ = -60, CX = W / 2, CY = 150, cam = [0, 0], A = [0, 0, 0];
  function pr(x, y, z, o) { var f = D / (z - CAMZ + D); o[0] = CX + (x - cam[0]) * f; o[1] = CY - (y - cam[1]) * f; o[2] = f; return o; }
  function text(str, x, y, size, color, align) { ctx.font = 'bold ' + size + 'px "Courier New", monospace'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(str, x, y); }
  function billboard(img, x, y, z, k, alpha) {
    pr(x, y, z, A); var w = img.width * A[2] * k, h = img.height * A[2] * k; if (A[2] > 3) return;
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(img, A[0] - w / 2, A[1] - h / 2, w, h); ctx.globalAlpha = 1;
  }
  function draw() {
    ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, W, H);
    cam[0] = s.p.x * 0.45; cam[1] = s.p.y * 0.45;
    var i, e, b, t = s.t;
    // stars flying towards the camera
    for (i = 0; i < stars.length; i++) { var st = stars[i]; pr(st.x, st.y, st.z, A); if (A[2] > 0 && A[0] >= 0 && A[0] < W && A[1] >= 0 && A[1] < H) { var c = Math.min(255, st.c + A[2] * 60 | 0); ctx.fillStyle = 'rgb(' + c + ',' + c + ',' + Math.min(255, c + 40) + ')'; var sz = A[2] > 0.6 ? 2 : 1; ctx.fillRect(Math.round(A[0]), Math.round(A[1]), sz, sz); } }
    // tunnel frames (arena cross-sections) and corner rails
    var XR = SH.XR, YR = SH.YR, z0 = (t * 2) % 60, k, q;
    ctx.lineWidth = 1;
    for (k = 0; k < 6; k++) {
      var zz = k * 60 + 60 - z0 + 0; if (zz < 0) continue;
      pr(-XR, YR, zz, A); var x0 = A[0], y0 = A[1]; pr(XR, -YR, zz, A);
      ctx.strokeStyle = 'rgba(90,120,255,' + (0.5 - k * 0.07) + ')'; ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(A[0] - x0), Math.round(A[1] - y0));
    }
    ctx.strokeStyle = 'rgba(90,120,255,.35)'; ctx.beginPath();
    [[-XR, YR], [XR, YR], [XR, -YR], [-XR, -YR]].forEach(function (c4) { pr(c4[0], c4[1], 0, A); ctx.moveTo(A[0], A[1]); pr(c4[0], c4[1], SH.ZFAR, A); ctx.lineTo(A[0], A[1]); });
    ctx.stroke();
    // ship plane frame (z = 0)
    pr(-XR, YR, 0, A); var fx0 = A[0], fy0 = A[1]; pr(XR, -YR, 0, A); ctx.strokeStyle = 'rgba(120,220,255,.55)'; ctx.strokeRect(Math.round(fx0) + 0.5, Math.round(fy0) + 0.5, Math.round(A[0] - fx0), Math.round(A[1] - fy0));
    // aim line from the ship into the depth + shadow crosshair on the far end
    if (s.p.alive && s.phase !== 'title' && s.phase !== 'over') {
      pr(s.p.x, s.p.y, 0, A); var ax = A[0], ay = A[1]; pr(s.p.x, s.p.y, SH.ZFAR, A);
      ctx.strokeStyle = 'rgba(120,255,160,.25)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(A[0], A[1]); ctx.stroke(); ctx.setLineDash([]);
    }
    // sorted billboards (far to near): enemies, enemy bullets, player bullets, ship, explosions
    var list = [];
    for (i = 0; i < s.en.length; i++) { e = s.en[i]; if (e.m !== SH.M_WAIT) list.push({ z: e.z, k: 0, o: e }); }
    for (i = 0; i < s.eb.length; i++) list.push({ z: s.eb[i].z, k: 1, o: s.eb[i] });
    for (i = 0; i < s.pb.length; i++) list.push({ z: s.pb[i].z, k: 2, o: s.pb[i] });
    for (i = 0; i < s.fx.length; i++) list.push({ z: s.fx[i].z, k: 4, o: s.fx[i] });
    if (s.p.alive && s.phase !== 'title' && s.phase !== 'over' && !(s.p.inv > 0 && (t & 4))) list.push({ z: 0, k: 3, o: s.p });
    list.sort(function (a, b2) { return b2.z - a.z; });
    var frame = ((t / 20) | 0) & 1;
    for (i = 0; i < list.length; i++) {
      var it = list[i], o = it.o;
      if (it.k === 0) {
        var img = (o.ty === 2 && o.hp === 1) ? SPR.boss2[frame] : SPR.e[o.ty][frame];
        var fade = Math.max(0.35, Math.min(1, 1.15 - o.z / 420));
        // ground shadow-line: a thin vertical to the bottom of the arena helps reading the depth of divers
        billboard(img, o.x, o.y, o.z, (o.hit > 0 && (o.hit & 2)) ? 2.2 : 2.6, (o.hit > 0 && (o.hit & 2)) ? 0.5 : fade);
      } else if (it.k === 1) {
        pr(o.x, o.y, o.z, A); var r = Math.max(1.5, 7 * A[2]); var g = ctx.createRadialGradient(A[0], A[1], 0, A[0], A[1], r); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ff6a50'); g.addColorStop(1, 'rgba(255,60,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(A[0], A[1], r, 0, 7); ctx.fill();
      } else if (it.k === 2) {
        pr(o.x, o.y, o.z, A); var a1 = [A[0], A[1], A[2]]; pr(o.x, o.y, o.z - 12, A);
        ctx.strokeStyle = '#9ff'; ctx.lineWidth = Math.max(1, 2.4 * a1[2]); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke(); ctx.lineWidth = 1;
      } else if (it.k === 3) { billboard(SPR.ship, o.x, o.y, 0, 2.4); }
      else {
        pr(o.x, o.y, o.z, A); var kk = o.t / (o.big ? 40 : 18), rr = (o.big ? 4 + kk * 22 : 3 + kk * 10) * A[2] * 1.6;
        ctx.globalAlpha = 1 - kk; ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(A[0], A[1], rr, 0, 7); ctx.stroke(); ctx.strokeStyle = '#ff5030'; ctx.beginPath(); ctx.arc(A[0], A[1], rr * 0.6, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    if (hintT > 0) { var tg = AI.target(); if (tg && s.p.alive) { pr(tg[0], tg[1], 0, A); ctx.strokeStyle = '#3f6'; ctx.lineWidth = 1; ctx.strokeRect(A[0] - 10, A[1] - 8, 20, 16); } }
    // HUD
    text(TX.score, 6, 8, 8, '#ff5a5a'); text(String(s.score), 6, 18, 9, '#fff');
    text(TX.hi, W / 2, 8, 8, '#ff5a5a', 'center'); text(String(Math.max(hi, s.score)), W / 2, 18, 9, '#fff', 'center');
    if (autoOn) text(TX.auto, W - 6, 8, 8, '#3f6', 'right');
    if (s.phase !== 'title') for (i = 0; i < s.lives - 1 && i < 8; i++) ctx.drawImage(SPR.ship, 6 + i * 13, H - 14);
    if (s.phase !== 'title') text(TX.stage + ' ' + s.stage, W - 6, H - 8, 8, '#8cf', 'right');
    if (s.phase === 'title') {
      text(TX.title, W / 2, 96, KO ? 20 : 18, '#ffd23c', 'center'); text(TX.start, W / 2, 150, 9, '#fff', 'center'); text(TX.keys, W / 2, 168, 6.5, '#8cf', 'center');
      if (hi) text(TX.hi + ' ' + hi, W / 2, 200, 9, '#ff5a5a', 'center');
    } else if (s.phase === 'ready') text(TX.stage + ' ' + s.stage, W / 2, 150, 14, '#8cf', 'center');
    else if (s.phase === 'clear') text(TX.clear, W / 2, 150, 11, '#ffd23c', 'center');
    else if (s.phase === 'over') { text(TX.over, W / 2, 130, 18, '#ff5a5a', 'center'); text(TX.acc + ' ' + (s.shots ? Math.round(100 * s.hits / s.shots) : 0) + '%', W / 2, 156, 9, '#fff', 'center'); text(TX.start, W / 2, 180, 8, '#8cf', 'center'); }
    if (paused) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H); text(TX.paused, W / 2, H / 2, 16, '#fff', 'center'); }
  }

  /* ---------- loop ---------- */
  function tick() {
    var inp;
    if (autoOn && (s.phase === 'play' || s.phase === 'ready' || s.phase === 'clear')) inp = AI.decide(s);
    else {
      inp = { dx: (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0), dy: (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0), f: keys.Space || keys.KeyZ || (ptr !== null) };
      if (ptr) { inp.tx = ptr[0]; inp.ty = ptr[1]; }
    }
    var ph0 = s.phase;
    SH.step(s, inp);
    if (s.ev) sfx(s.ev);
    if (autoOn && s.phase === 'over' && s.ph > 150) newGame();
    if (hintT > 0) hintT--;
    for (var i = 0; i < stars.length; i++) { stars[i].z -= 3; if (stars[i].z < -50) { stars[i].z = 360; stars[i].x = (Math.random() - 0.5) * 700; stars[i].y = (Math.random() - 0.5) * 500; } }
    if (ph0 !== 'over' && s.phase === 'over') { if (s.score > hi) { hi = s.score; try { localStorage.setItem('shooter3d_hi', String(hi)); } catch (e) {} } }
  }
  var last = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame); if (!last) last = now;
    acc += Math.min(100, now - last); last = now;
    while (acc >= 1000 / 60) { acc -= 1000 / 60; if (!paused) tick(); }
    draw();
  }
  function layout() { var w = window.innerWidth, h = window.innerHeight; S = Math.max(0.5, Math.min(w / W, h / H)); dpr = window.devicePixelRatio || 1; cv.style.width = Math.floor(W * S) + 'px'; cv.style.height = Math.floor(H * S) + 'px'; cv.width = Math.floor(W * S * dpr); cv.height = Math.floor(H * S * dpr); }
  window.addEventListener('resize', layout); layout();

  /* ---------- input ---------- */
  function newGame() { SH.startGame(s); paused = false; hintT = 0; }
  function startIfIdle() { if (s.phase === 'title' || (s.phase === 'over' && s.ph > 60)) { newGame(); return true; } return false; }
  window.addEventListener('keydown', function (e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter') startIfIdle(); else if (e.code === 'KeyP') togglePause();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  function wpos(e) {      // screen -> world position on the ship plane (z = 0)
    var r = cv.getBoundingClientRect(), sx = (e.clientX - r.left) * (W / r.width), sy = (e.clientY - r.top) * (H / r.height), f = D / (0 - CAMZ + D);
    return [(sx - CX) / f + cam[0], -(sy - CY) / f + cam[1]];
  }
  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); if (startIfIdle()) return; ptr = wpos(e); try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
  cv.addEventListener('pointermove', function (e) { if (ptr !== null) ptr = wpos(e); });
  function endPtr() { ptr = null; } cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);

  function togglePause() { if (s.phase === 'title' || s.phase === 'over') return paused; paused = !paused; return paused; }
  window.newGame = newGame; window.togglePause = togglePause;
  window.toggleAuto = function () { autoOn = !autoOn; if (autoOn && (s.phase === 'title' || s.phase === 'over')) newGame(); return autoOn; };
  window.giveHint = function () { if (!autoOn) AI.decide(s); hintT = 120; };
  window.toggleSound = function () { soundOn = !soundOn; return soundOn; };
  window.addEventListener('message', function (e) { var d = e.data; if (d && d.ngCmd && typeof window[d.ngCmd] === 'function') window[d.ngCmd](d.v); });
  window.__sh = { state: function () { return s; }, step: function (n, inp) { for (var i = 0; i < n; i++) SH.step(s, inp || {}); }, auto: function () { return autoOn; } };
  requestAnimationFrame(frame);
})();
