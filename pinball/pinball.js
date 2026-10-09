// Win98 shell around the SpaceCadetPinball web port (reverse-engineered "3D Pinball for Windows - Space Cadet", MIT; https://github.com/k4zmu2a/SpaceCadetPinball, web build by alula).
// The game itself (its JS / wasm / data) is fetched unchanged from the port's own site (CORS-enabled) and drawn on our canvas; the data file (Microsoft's) is not redistributed here.
(function () {
  var KO = /^ko/i.test(navigator.language || 'ko');
  var TXT = {
    ko: { title: '3D 핀볼', game: '게임', new: '　새 게임(N)', exit: '　끝내기(X)', help: '도움말', how: '　게임 방법(H)', cheat: '　치트...', auto: '　자동으로 풀기', other: '　다른 게임', mine: '　지뢰찾기', poly: '　폴리큐브', howT: '게임 방법', ok: '확인',
      autoon: '자동 풀이 중', bl: '◀ 왼쪽', br: '오른쪽 ▶', bs: '발사', bnl: '↖ 흔들기', bnr: '흔들기 ↗', bnu: '↑ 흔들기', bn: '새 게임',
      hint: '스페이스 = 발사 · Z / 왼쪽 Shift = 왼쪽 플리퍼 · / / 오른쪽 Shift = 오른쪽 플리퍼 · X / . / ↑ = 판 흔들기 · F2 = 새 게임',
      help1: '「3D Pinball for Windows - Space Cadet」을 역설계한 오픈소스 <b>SpaceCadetPinball</b>(MIT)의 웹 빌드를 그대로 실행합니다.<br>스페이스(누르고 있다가 놓기)로 공을 쏘고, Z / 오른쪽 Shift 쪽 키로 플리퍼를 칩니다. 화면 안의 게임 메뉴(F2 새 게임, F3 일시정지 등)도 그대로 쓸 수 있습니다.<br>게임 데이터는 이 저장소에 들어 있지 않고 원 게임을 호스팅하는 사이트에서 불러오므로 인터넷 연결이 필요합니다.',
      help2: '<br><br><b>치트 &gt; 자동으로 풀기(F3)</b>: 기본은 화면을 보고 치는 단순한 봇입니다. 주소에 <code>?bot=rl</code>을 붙이면 강화학습(PPO)으로 훈련한 플레이어가 공의 위치와 점수만 보고 플리퍼를 칩니다(플런저 발사와 새 게임은 규칙으로 처리). 공 위치·점수는 게임의 메모리에서 읽으며, 이 게임 빌드와 맞지 않으면 화면을 보고 치는 단순한 봇으로 대신합니다.' },
    en: { title: '3D Pinball', game: 'Game', new: '　New Game(N)', exit: '　Exit(X)', help: 'Help', how: '　How to Play(H)', cheat: '　Cheat...', auto: '　Solve Automatically', other: '　Other Games', mine: '　Minesweeper', poly: '　Polycube', howT: 'How to play', ok: 'OK',
      autoon: 'AUTO PLAY', bl: '◀ Left', br: 'Right ▶', bs: 'Launch', bnl: '↖ Nudge', bnr: 'Nudge ↗', bnu: '↑ Nudge', bn: 'New',
      hint: 'Space = launch · Z / left Shift = left flipper · / / right Shift = right flipper · X / . / Up = nudge · F2 = new game',
      help1: 'Runs the web build of <b>SpaceCadetPinball</b> (MIT), the reverse-engineered "3D Pinball for Windows - Space Cadet", unchanged.<br>Pull and release Space to launch the ball, hit the flippers with Z / right Shift. The game\'s own menu (F2 new game, F3 pause ...) works too.<br>The game data is not part of this repository; it is loaded from the site hosting the web build, so you need an internet connection.',
      help2: '<br><br><b>Cheat &gt; Solve Automatically (F3)</b>: by default a simple screen-watching bot plays. Add <code>?bot=rl</code> to the address to use a player trained with reinforcement learning (PPO) that works the flippers from the ball position and the score only (plunger launch and new game are handled by rules). The ball position and score are read from the game\'s memory; if this build of the game does not match, a simple screen-watching bot plays instead.' }
  };
  var T = KO ? TXT.ko : TXT.en;
  document.documentElement.lang = KO ? 'ko' : 'en';
  [].forEach.call(document.querySelectorAll('[data-t]'), function (e) { var k = e.getAttribute('data-t'); if (T[k]) e.textContent = T[k]; });
  document.getElementById('hint').textContent = T.hint;
  document.getElementById('helpTxt').innerHTML = T.help1 + T.help2;
  document.title = T.title;
  $(function () {
    if ($('.menu-bar').length) $('.menu-bar').menubar();
    $('.window').draggable({ handle: '.title' });
    $('#mainwin .title-button.minimize').on('click', function () { $('#mainwin').hide(); });
    $('#mainwin .title-button.close').on('click', function () { $('#mainwin').css('visibility', 'hidden'); });
  });
  function closeMenus() {
    var mb = $('.menu-bar');
    try { mb.menubar('collapseAll'); } catch (e) {}
    mb.find('.ui-state-open').removeClass('ui-state-open');
    mb.find('> li').removeClass('ui-state-active ui-state-hover ui-state-focus');
    mb.find('.menu').hide().attr('aria-hidden', 'true').attr('aria-expanded', 'false');
  }
  window.runMenu = function (fn) { closeMenus(); setTimeout(fn, 0); return false; };
  window.closeDlg = function (id) { document.getElementById(id).style.display = 'none'; };
  window.openHelp = function () { document.getElementById('helpWin').style.display = 'block'; };
  window.newGame = function () { var c = document.getElementById('canvas'); c.focus(); ['keydown', 'keyup'].forEach(function (t) { c.dispatchEvent(new KeyboardEvent(t, { key: 'F2', code: 'F2', keyCode: 113, which: 113, bubbles: true })); }); };      // F2 = the game's own "new game"
  // touch controls: on-screen buttons that press the keys the game listens to (hold = key held: plunger, flippers)
  function key(type, b) {
    var o = { key: b.getAttribute('data-k'), code: b.getAttribute('data-key'), keyCode: +b.getAttribute('data-kc'), which: +b.getAttribute('data-kc'), bubbles: true, cancelable: true };
    var e = new KeyboardEvent(type, o); try { Object.defineProperty(e, 'keyCode', { get: function () { return o.keyCode; } }); Object.defineProperty(e, 'which', { get: function () { return o.which; } }); } catch (x) {}
    (document.getElementById('canvas')).dispatchEvent(e);
  }
  [].forEach.call(document.querySelectorAll('#pad .pb[data-key]'), function (b) {
    var held = {};
    b.addEventListener('pointerdown', function (ev) { ev.preventDefault(); try { b.setPointerCapture(ev.pointerId); } catch (x) {} held[ev.pointerId] = 1; if (Object.keys(held).length === 1) { b.classList.add('on'); key('keydown', b); } });
    var up = function (ev) { if (!held[ev.pointerId]) return; delete held[ev.pointerId]; if (!Object.keys(held).length) { b.classList.remove('on'); key('keyup', b); } };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  });
  document.getElementById('padNew').addEventListener('click', function () { newGame(); });
  // show the buttons on phones / tablets / touch screens (any hint of touch, a coarse pointer, no hover, or a narrow screen) - they are only a convenience, the keyboard keeps working
  function wantPad() {
    var mq = function (q) { try { return window.matchMedia && matchMedia(q).matches; } catch (e) { return false; } };
    return /[?&]touch=1/.test(location.search) || mq('(pointer: coarse)') || mq('(any-pointer: coarse)') || mq('(hover: none)') || 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 760;
  }
  function placePad() { document.getElementById('pad').classList.toggle('on', wantPad()); }
  placePad(); window.addEventListener('resize', placePad); window.addEventListener('touchstart', function () { document.getElementById('pad').classList.add('on'); }, { once: true, passive: true });

  // ---- sound on/off (Game > Sound): the game's WebAudio output goes through one master gain per AudioContext, muted by this switch (remembered) ----
  var soundOn = true, masters = [];
  try { soundOn = localStorage.getItem('pinball_sound') !== '0'; } catch (e) {}
  (function () {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    var d = null, pr = AC.prototype; while (pr && !d) { d = Object.getOwnPropertyDescriptor(pr, 'destination'); pr = Object.getPrototypeOf(pr); }
    if (!d || !d.get) return;
    Object.defineProperty(AC.prototype, 'destination', { configurable: true, get: function () {
      if (!this.__master) { var real = d.get.call(this); try { var g = this.createGain(); g.gain.value = soundOn ? 1 : 0; g.connect(real); this.__master = g; masters.push(g); } catch (e) { return real; } }
      return this.__master;
    } });
  })();
  function soundLabel() { var s = document.getElementById('soundLabel'); if (s) s.textContent = (soundOn ? '✓ ' : '\u3000') + (KO ? '소리(S)' : 'Sound'); }
  window.toggleSound = function () {
    soundOn = !soundOn; try { localStorage.setItem('pinball_sound', soundOn ? '1' : '0'); } catch (e) {}
    masters.forEach(function (g) { try { g.gain.value = soundOn ? 1 : 0; } catch (e) {} }); soundLabel(); return soundOn;
  };
  soundLabel();
  // ---- table nudge for the auto player (X / . / Up): used sparingly (the game tilts when it is shaken too often) ----
  var nudgeLast = 0, nudgeSent = 0; window.pinballNudges = 0; window.pinballTilts = 0;
  function nudge(code, kc, k) {
    var now = performance.now(); if (now - nudgeLast < 3000) return; nudgeLast = now; nudgeSent++; window.pinballNudges = nudgeSent + (rl ? rl.nTotal : 0);
    var c = document.getElementById('canvas'), mk = function (t) { var o = { key: k, code: code, keyCode: kc, which: kc, bubbles: true, cancelable: true }, e = new KeyboardEvent(t, o); try { Object.defineProperty(e, 'keyCode', { get: function () { return kc; } }); Object.defineProperty(e, 'which', { get: function () { return kc; } }); } catch (x) {} c.dispatchEvent(e); };
    mk('keydown'); setTimeout(function () { mk('keyup'); }, 110);
  }
  // ---- auto play (F3): a simple vision bot. The game is a compiled original (no state API), so the bot looks at the canvas: it watches for movement of bright pixels
  // (the steel ball) in the area in front of the flippers and flips the flipper on that side; it plugs the plunger when the ball is waiting. It cannot promise to never lose the ball.
  var pcy = 0, autoOn = false, autoTimer = 0, prev = null, lastMotion = 0, lastLaunch = 0, held = {};
  var sc = document.createElement('canvas'), sx = sc.getContext('2d', { willReadFrequently: true });
  function press(sel, ms) { var b = document.querySelector(sel); if (!b || held[sel]) return; held[sel] = 1; key('keydown', b); b.classList.add('on'); setTimeout(function () { key('keyup', b); b.classList.remove('on'); held[sel] = 0; }, ms); }
  function look() {
    var c = document.getElementById('canvas'); if (!c.width) return;
    var W = c.width, H = c.height, rx = Math.round(W * 0.14), ry = Math.round(H * 0.70), rw = Math.round(W * 0.38), rh = Math.round(H * 0.28);
    sc.width = rw; sc.height = rh;
    try { sx.drawImage(c, rx, ry, rw, rh, 0, 0, rw, rh); var d = sx.getImageData(0, 0, rw, rh).data; } catch (e) { return; }
    var g = new Uint8Array(rw * rh), n = 0, cx = 0, cy = 0;
    for (var i = 0, p = 0; i < d.length; i += 4, p++) {
      g[p] = (d[i] + d[i + 1] + d[i + 2]) / 3;
      var mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      if (prev && g[p] > 150 && mx - mn < 28 && Math.abs(g[p] - prev[p]) > 60) { n++; cx += p % rw; cy += (p / rw) | 0; }      // a moving grey-white (steel) blob; the coloured lights are ignored
    }
    prev = g; var now = performance.now();
    var gs = vguard ? vguard.update(now) : 0;                              // rule layer (needs the memory readout): a cradled ball is not pumped; after 2.5 s one kick flip
    if (gs === 2) press(vguard.side === 'L' ? '.pb.fl' : '.pb.fr', 200);
    if (gs === 0 && n >= 8 && n <= 160) {
      cx = cx / n / rw; cy = cy / n / rh; lastMotion = now;
      if (cy > 0.35) press(cx < 0.45 ? '.pb.fl' : '.pb.fr', 140);       // ball in front of a flipper: hit it
      if (cy > 0.8 && cy - pcy > 0.01) { if (cx > 0.3 && cx < 0.7) nudge('ArrowUp', 38, 'ArrowUp'); else if (cx <= 0.3) nudge('KeyX', 88, 'x'); else nudge('Period', 190, '.'); }       // the ball sinks towards the drain: shake the table
      pcy = cy;
    }
    if (now - lastLaunch > 6500) {                                        // every few seconds pull the plunger (it does nothing while a ball is in play, but starts the next ball)
      lastLaunch = now; var b = document.querySelector('.pb.ln'); key('keydown', b); b.classList.add('on'); setTimeout(function () { key('keyup', b); b.classList.remove('on'); }, 1000 + Math.random() * 400);
    }
  }
  // RL player (ai.js + ai-model.js): reads the ball position and the score from the game's memory and picks the flipper combination every 4 frames (training/ has the code);
  // it runs inside the game's own main loop (Module.preMainLoop), so it keeps its pace whatever the screen refresh rate is.
  var rl = null, rlPrevHook = null, rlTimer = 0, rlBad = 0, rlOverAt = 0, rlNewAt = 0;
  function canvasKey(type, code, kc, k) {
    var o = { key: k, code: code, keyCode: kc, which: kc, bubbles: true, cancelable: true }, e = new KeyboardEvent(type, o);
    try { Object.defineProperty(e, 'keyCode', { get: function () { return kc; } }); Object.defineProperty(e, 'which', { get: function () { return kc; } }); } catch (x) {}
    document.getElementById('canvas').dispatchEvent(e);
  }
  function rlStop() {
    if (rl) { rl.setKey('L', 0); rl.setKey('R', 0); rl.setKey('S', 0); window.Module.preMainLoop = rlPrevHook; rl = null; }
    clearInterval(rlTimer); rlTimer = 0;
  }
  function rlHook() {
    if (rlPrevHook && rlPrevHook() === false) return false;
    if (!rl) return;
    var now = performance.now();
    if (rlOverAt) { if (now > rlOverAt) { rlOverAt = 0; rlNewAt = now; rl.newGame(); } return; }       // game over: look at the score for a few seconds, then start a new game
    var r = rl.tick(now);
    if (!r) return;
    if (r.bad) { if (!rlBad) rlBad = now; if (now - rlBad > (now - rlNewAt < 20000 ? 20000 : 4000)) { rlStop(); startVision(); window.pinballAuto = 'vision'; } return; }          // the memory does not look as expected any more (another build?): fall back to the vision bot
    rlBad = 0;
    if (r.done) { if (r.tilt) window.pinballTilts++; if (r.over) rlOverAt = now + 5000; }
    else { var act = window.PinballAI.policy(r.obs, r.mask); rl.apply(act[0]); rl.nudge(act[1]); window.pinballNudges = nudgeSent + rl.nTotal; }       // the model chooses the flippers AND the table nudge
  }
  function startRL() {
    var addr = null;
    try { if (/[?&]bot=rl/.test(location.search) && window.PinballAI && PinballAI.ready() && window.Module) addr = PinballAI.check(window.Module); } catch (e) { addr = null; }
    if (!addr) return false;
    rl = new PinballAI.Driver(window.Module, canvasKey, addr); rlBad = 0; rlOverAt = 0; rlNewAt = 0;
    rlPrevHook = window.Module.preMainLoop || null; window.Module.preMainLoop = rlHook; document.getElementById('canvas').focus();
    window.pinballAuto = 'rl'; return true;
  }
  var vguard = null;
  function startVision() { vguard = null; try { var ad = window.PinballAI && window.Module ? PinballAI.check(window.Module) : null; if (ad) vguard = new PinballAI.Guard(window.Module, ad); } catch (e) {} prev = null; lastMotion = performance.now(); lastLaunch = performance.now() - 5500; autoTimer = setInterval(look, 45); }
  window.toggleAuto = function () {
    autoOn = !autoOn;
    if (autoOn) {
      window.pinballAuto = 'wait'; var t0 = performance.now();
      var go = function () {
        if (!autoOn) return;
        if (!/[?&]bot=rl/.test(location.search)) { clearInterval(rlTimer); rlTimer = 0; window.pinballAuto = 'vision'; startVision(); return; }
        if (startRL()) { clearInterval(rlTimer); rlTimer = 0; return; }
        if (performance.now() - t0 > 12000) { clearInterval(rlTimer); rlTimer = 0; window.pinballAuto = 'vision'; startVision(); }      // state readout not possible (build changed / not loaded yet): vision bot
      };
      rlTimer = setInterval(go, 250); go();
    } else { clearInterval(autoTimer); autoTimer = 0; rlStop(); window.pinballAuto = ''; }
    var ab = document.getElementById('autoBadge'); if (ab) ab.style.display = autoOn ? '' : 'none';
    var a = document.querySelector('.menu-autosolve .mi-label'); if (a) a.textContent = (autoOn ? '✓ ' : '\u3000') + a.textContent.replace(/^[✓\u2713]\s*/, '').replace(/^\u3000/, '');
    return autoOn;
  };
  document.addEventListener('keydown', function (e) { if (e.key === 'F3') { e.preventDefault(); window.toggleAuto(); } });
  // the original game, loaded from the web build's host
  var HOST = 'https://pinball.alula.me/', st = document.getElementById('status'), cv = document.getElementById('canvas');
  try { cv.getContext('webgl', { preserveDrawingBuffer: true, alpha: false, antialias: false, depth: true, stencil: false }); } catch (e) {}      // (so the bot can read the frames)
  window.Module = {
    canvas: cv, locateFile: function (p) { return HOST + p; }, print: function () {}, printErr: function () {},
    setStatus: function (s) { if (!s) { st.style.display = 'none'; cv.style.display = ''; cv.focus(); } else { st.style.display = ''; st.textContent = s; } },
    totalDependencies: 0, monitorRunDependencies: function (n) { this.totalDependencies = Math.max(this.totalDependencies, n); Module.setStatus(n ? 'Preparing... (' + (this.totalDependencies - n) + '/' + this.totalDependencies + ')' : ''); }
  };
  var sc = document.createElement('script'); sc.async = true; sc.src = HOST + 'SpaceCadetPinball.js'; sc.onerror = function () { st.textContent = KO ? '게임을 불러오지 못했습니다 (인터넷 연결 확인)' : 'Could not load the game (check your internet connection)'; }; document.body.appendChild(sc);
})();
