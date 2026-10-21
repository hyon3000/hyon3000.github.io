// Shooter page: canvas drawing (pixel sprites drawn from small bitmaps), keyboard / pointer input, fixed 60 Hz loop, sound, auto-player hook.
(function () {
  'use strict';
  var SH = window.Shooter, AI = window.ShooterAI, W = SH.W, H = SH.H, PY = SH.PY;
  var KO = /^ko/i.test(navigator.language || 'ko');
  var TX = KO ? { title: '슈터', start: '클릭 / 스페이스로 시작', keys: '← → 이동 · 스페이스 발사 · P 일시정지', stage: '스테이지', over: '게임 오버', acc: '명중률', paused: '일시정지', score: '점수', hi: '최고', auto: '자동', clear: '스테이지 클리어!' }
    : { title: 'SHOOTER', start: 'Click / Space to start', keys: 'Arrows move · Space fire · P pause', stage: 'STAGE', over: 'GAME OVER', acc: 'Accuracy', paused: 'PAUSED', score: 'SCORE', hi: 'HI', auto: 'AUTO', clear: 'Stage clear!' };
  var cv = document.getElementById('cv'), ctx = cv.getContext('2d'), S = 1, dpr = window.devicePixelRatio || 1;
  var s = SH.newState((Math.random() * 1e9) | 0), keys = {}, ptr = null, autoOn = false, paused = false, soundOn = true, hintT = 0;
  var hi = 0; try { hi = +localStorage.getItem('shooter_hi') || 0; } catch (e) {}

  /* ---------- sprites: '.' empty, other characters index into the palette ---------- */
  function mk(rows, pal) {
    var c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
    var g = c.getContext('2d');
    for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) { var ch = rows[y][x]; if (ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }
    return c;
  }
  var SHIP = mk(['.....w.....', '.....w.....', '....www....', '....wbw....', '.r.wwbww.r.', '.r.wwwww.r.', 'wwwwwwwwwww', 'ww.wwrww.ww', 'w...rrr...w'], { w: '#e8eef8', b: '#46a0ff', r: '#ff4a3a' });
  function beeF(wing, p) {
    return wing ? mk(['.y.....y.', '.yy...yy.', '.yyyyyyy.', 'yy.yyy.yy', 'yyyyyyyyy', '.bybybyb.', '..b...b..', '.b.....b.'], p)
                : mk(['.........', 'y.y...y.y', 'yyyyyyyyy', 'yy.yyy.yy', 'yyyyyyyyy', '.bybybyb.', '..b...b..', '..b...b..'], p);
  }
  function flyF(wing, p) {
    return wing ? mk(['r.r.....r.r', 'rrr.....rrr', 'rrrrrrrrrrr', '.rrwrrrwrr.', '.rrrrrrrrr.', '..rrw.wrr..', '...r...r...', '..r.....r..'], p)
                : mk(['...........', 'r.r.....r.r', 'rrrrrrrrrrr', 'rrrwrrrwrrr', '.rrrrrrrrr.', '..rrw.wrr..', '..r.....r..', '...........'], p);
  }
  function bossF(wing, p) {
    return wing ? mk(['g.g.....g.g', 'ggg.ggg.ggg', 'ggggggggggg', 'gwwgggggwwg', 'ggwgggggwgg', '.ggggpgggg.', '..gg.p.gg..', '.gg..p..gg.', '.g.......g.'], p)
                : mk(['...g...g...', 'g.ggg.ggg.g', 'ggggggggggg', 'gwwgggggwwg', 'ggwgggggwgg', '.ggggpgggg.', '..gg.p.gg..', '..g..p..g..', '...........'], p);
  }
  var PB = { bee: { y: '#ffd23c', b: '#3c8cff', w: '#fff' }, fly: { r: '#ff3c3c', w: '#fff' }, boss: { g: '#38d05a', w: '#fff', p: '#c050ff' }, bossHit: { g: '#8a6cff', w: '#fff', p: '#ffd23c' } };
  var SPR = {
    ship: SHIP,
    e: [[beeF(0, PB.bee), beeF(1, PB.bee)], [flyF(0, PB.fly), flyF(1, PB.fly)], [bossF(0, PB.boss), bossF(1, PB.boss)]],
    boss2: [bossF(0, PB.bossHit), bossF(1, PB.bossHit)]
  };
  var stars = []; for (var i = 0; i < 70; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, v: 0.2 + Math.random() * 0.9, c: 120 + (Math.random() * 120 | 0) });

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
    if (ev === 'shot') beep(900, 300, 0.07, 'square', 0.025);
    else if (ev === 'kill') beep(300, 60, 0.18, 'sawtooth', 0.05);
    else if (ev === 'hit') beep(500, 300, 0.06, 'triangle', 0.05);
    else if (ev === 'die') beep(200, 40, 0.6, 'sawtooth', 0.08);
    else if (ev === 'clear') { beep(500, 900, 0.3, 'square', 0.05); }
    else if (ev === 'life') beep(600, 1200, 0.4, 'triangle', 0.06);
  }

  /* ---------- drawing ---------- */
  function sprite(img, x, y) { ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2)); }
  function text(str, x, y, size, color, align) {
    ctx.font = 'bold ' + size + 'px "Courier New", monospace'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(str, x, y);
  }
  function draw() {
    ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, W, H);
    var i, e;
    for (i = 0; i < stars.length; i++) { var st = stars[i]; ctx.fillStyle = 'rgb(' + st.c + ',' + st.c + ',' + Math.min(255, st.c + 40) + ')'; ctx.fillRect(Math.round(st.x), Math.round(st.y), st.v > 0.7 ? 2 : 1, st.v > 0.7 ? 2 : 1); }
    var frame = ((s.t / 20) | 0) & 1;
    for (i = 0; i < s.en.length; i++) {
      e = s.en[i]; if (e.m === SH.M_WAIT) continue;
      var img = (e.ty === 2 && e.hp === 1) ? SPR.boss2[frame] : SPR.e[e.ty][frame];
      if (e.hit > 0 && (e.hit & 2)) { ctx.globalAlpha = 0.45; sprite(img, e.x, e.y); ctx.globalAlpha = 1; } else sprite(img, e.x, e.y);
    }
    ctx.fillStyle = '#9ff';
    for (i = 0; i < s.pb.length; i++) ctx.fillRect(Math.round(s.pb[i].x) - 1, Math.round(s.pb[i].y) - 4, 2, 8);
    for (i = 0; i < s.eb.length; i++) { var b = s.eb[i]; ctx.fillStyle = '#ff5a5a'; ctx.fillRect(Math.round(b.x) - 1.5, Math.round(b.y) - 3, 3, 6); ctx.fillStyle = '#ffe0a0'; ctx.fillRect(Math.round(b.x) - 0.5, Math.round(b.y) - 2, 1, 3); }
    if (s.p.alive && s.phase !== 'title' && s.phase !== 'over') {
      if (!(s.p.inv > 0 && (s.t & 4))) sprite(SPR.ship, s.p.x, PY);
    }
    for (i = 0; i < s.fx.length; i++) {
      var f = s.fx[i], k = f.t / (f.big ? 40 : 18), r = (f.big ? 4 + k * 22 : 3 + k * 10);
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#ff5030'; ctx.beginPath(); ctx.arc(f.x, f.y, r * 0.6, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (hintT > 0 && AI.target() !== null && s.p.alive) { ctx.strokeStyle = '#3f6'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(AI.target()) - 8, PY - 8, 16, 16); }
    // HUD
    text(TX.score, 6, 8, 8, '#ff5a5a'); text(String(s.score), 6, 18, 9, '#fff');
    text(TX.hi, W / 2, 8, 8, '#ff5a5a', 'center'); text(String(Math.max(hi, s.score)), W / 2, 18, 9, '#fff', 'center');
    if (autoOn) text(TX.auto, W - 6, 8, 8, '#3f6', 'right');
    if (s.phase !== 'title') for (i = 0; i < s.lives - 1 && i < 8; i++) ctx.drawImage(SPR.ship, 6 + i * 13, H - 14);
    if (s.phase !== 'title') text(TX.stage + ' ' + s.stage, W - 6, H - 8, 8, '#8cf', 'right');
    // banners
    if (s.phase === 'title') {
      text(TX.title, W / 2, 96, KO ? 22 : 20, '#ffd23c', 'center'); text(TX.start, W / 2, 150, 9, '#fff', ((s.t >> 5) & 1) ? 'center' : 'center');
      text(TX.keys, W / 2, 168, 7, '#8cf', 'center');
      if (hi) text(TX.hi + ' ' + hi, W / 2, 200, 9, '#ff5a5a', 'center');
      sprite(SPR.ship, W / 2, 236);
    } else if (s.phase === 'ready') text(TX.stage + ' ' + s.stage, W / 2, 150, 14, '#8cf', 'center');
    else if (s.phase === 'clear') text(TX.clear, W / 2, 150, 11, '#ffd23c', 'center');
    else if (s.phase === 'over') {
      text(TX.over, W / 2, 130, 18, '#ff5a5a', 'center');
      text(TX.acc + ' ' + (s.shots ? Math.round(100 * s.hits / s.shots) : 0) + '%', W / 2, 156, 9, '#fff', 'center');
      text(TX.start, W / 2, 180, 8, '#8cf', 'center');
    }
    if (paused) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H); text(TX.paused, W / 2, H / 2, 16, '#fff', 'center'); }
  }

  /* ---------- loop ---------- */
  function tick() {
    var inp;
    if (autoOn && (s.phase === 'play' || s.phase === 'ready' || s.phase === 'clear')) inp = AI.decide(s);
    else inp = { l: keys.ArrowLeft || keys.KeyA, r: keys.ArrowRight || keys.KeyD, f: keys.Space || keys.KeyZ || keys.ArrowUp || (ptr !== null), tx: ptr };
    var ph0 = s.phase;
    SH.step(s, inp);
    if (s.ev) sfx(s.ev);
    if (autoOn && s.phase === 'over' && s.ph > 150) newGame();      // the auto-player starts the next game by itself
    if (hintT > 0) hintT--;
    for (var i = 0; i < stars.length; i++) { stars[i].y += stars[i].v; if (stars[i].y > H) { stars[i].y = 0; stars[i].x = Math.random() * W; } }
    if (ph0 !== 'over' && s.phase === 'over') { if (s.score > hi) { hi = s.score; try { localStorage.setItem('shooter_hi', String(hi)); } catch (e) {} } }
  }
  var last = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    acc += Math.min(100, now - last); last = now;
    while (acc >= 1000 / 60) { acc -= 1000 / 60; if (!paused) tick(); }
    draw();
  }
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    S = Math.max(0.5, Math.min(w / W, h / H)); dpr = window.devicePixelRatio || 1;
    cv.style.width = Math.floor(W * S) + 'px'; cv.style.height = Math.floor(H * S) + 'px';
    cv.width = Math.floor(W * S * dpr); cv.height = Math.floor(H * S * dpr);
  }
  window.addEventListener('resize', layout); layout();

  /* ---------- input ---------- */
  function newGame() { SH.startGame(s); paused = false; hintT = 0; }
  function startIfIdle() { if (s.phase === 'title' || (s.phase === 'over' && s.ph > 60)) { newGame(); return true; } return false; }
  window.addEventListener('keydown', function (e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    if (e.repeat && e.code !== 'Space') { keys[e.code] = true; return; }
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'Enter') startIfIdle();
    else if (e.code === 'KeyP') togglePause();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  function px(e) { var r = cv.getBoundingClientRect(); return (e.clientX - r.left) * (W / r.width); }
  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); if (startIfIdle()) return; ptr = px(e); try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
  cv.addEventListener('pointermove', function (e) { if (ptr !== null) ptr = px(e); });
  function endPtr() { ptr = null; }
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);

  /* ---------- exports (called by the shell) ---------- */
  function togglePause() { if (s.phase === 'title' || s.phase === 'over') return paused; paused = !paused; return paused; }
  window.newGame = newGame;
  window.togglePause = togglePause;
  window.toggleAuto = function () { autoOn = !autoOn; if (autoOn && (s.phase === 'title' || s.phase === 'over')) newGame(); return autoOn; };
  window.giveHint = function () { if (!autoOn) AI.decide(s); hintT = 120; };
  window.toggleSound = function () { soundOn = !soundOn; return soundOn; };
  window.addEventListener('message', function (e) { var d = e.data; if (d && d.ngCmd && typeof window[d.ngCmd] === 'function') window[d.ngCmd](d.v); });
  window.__sh = { state: function () { return s; }, step: function (n, inp) { for (var i = 0; i < n; i++) SH.step(s, inp || {}); }, auto: function () { return autoOn; } };
  requestAnimationFrame(frame);
})();
