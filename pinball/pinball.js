// Win98 shell around the SpaceCadetPinball web port (reverse-engineered "3D Pinball for Windows - Space Cadet", MIT; https://github.com/k4zmu2a/SpaceCadetPinball, web build by alula).
// The game itself (its JS / wasm / data) is fetched unchanged from the port's own site (CORS-enabled) and drawn on our canvas; the data file (Microsoft's) is not redistributed here.
(function () {
  var KO = /^ko/i.test(navigator.language || 'ko');
  var TXT = {
    ko: { title: '3D 핀볼', game: '게임', new: '　새 게임(N)', exit: '　끝내기(X)', help: '도움말', how: '　게임 방법(H)', cheat: '　치트...', auto: '　자동으로 풀기', other: '　다른 게임', mine: '　지뢰찾기', poly: '　폴리큐브', howT: '게임 방법', ok: '확인',
      bl: '◀ 왼쪽', br: '오른쪽 ▶', bs: '발사', bnl: '↖ 흔들기', bnr: '흔들기 ↗', bnu: '↑ 흔들기', bn: '새 게임',
      hint: '스페이스 = 발사 · Z / 왼쪽 Shift = 왼쪽 플리퍼 · / / 오른쪽 Shift = 오른쪽 플리퍼 · X / . / ↑ = 판 흔들기 · F2 = 새 게임',
      help1: '「3D Pinball for Windows - Space Cadet」을 역설계한 오픈소스 <b>SpaceCadetPinball</b>(MIT)의 웹 빌드를 그대로 실행합니다.<br>스페이스(누르고 있다가 놓기)로 공을 쏘고, Z / 오른쪽 Shift 쪽 키로 플리퍼를 칩니다. 화면 안의 게임 메뉴(F2 새 게임, F3 일시정지 등)도 그대로 쓸 수 있습니다.<br>게임 데이터는 이 저장소에 들어 있지 않고 원 게임을 호스팅하는 사이트에서 불러오므로 인터넷 연결이 필요합니다.' },
    en: { title: '3D Pinball', game: 'Game', new: '　New Game(N)', exit: '　Exit(X)', help: 'Help', how: '　How to Play(H)', cheat: '　Cheat...', auto: '　Solve Automatically', other: '　Other Games', mine: '　Minesweeper', poly: '　Polycube', howT: 'How to play', ok: 'OK',
      bl: '◀ Left', br: 'Right ▶', bs: 'Launch', bnl: '↖ Nudge', bnr: 'Nudge ↗', bnu: '↑ Nudge', bn: 'New',
      hint: 'Space = launch · Z / left Shift = left flipper · / / right Shift = right flipper · X / . / Up = nudge · F2 = new game',
      help1: 'Runs the web build of <b>SpaceCadetPinball</b> (MIT), the reverse-engineered "3D Pinball for Windows - Space Cadet", unchanged.<br>Pull and release Space to launch the ball, hit the flippers with Z / right Shift. The game\'s own menu (F2 new game, F3 pause ...) works too.<br>The game data is not part of this repository; it is loaded from the site hosting the web build, so you need an internet connection.' }
  };
  var T = KO ? TXT.ko : TXT.en;
  document.documentElement.lang = KO ? 'ko' : 'en';
  [].forEach.call(document.querySelectorAll('[data-t]'), function (e) { var k = e.getAttribute('data-t'); if (T[k]) e.textContent = T[k]; });
  document.getElementById('hint').textContent = T.hint;
  document.getElementById('helpTxt').innerHTML = T.help1;
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

  // ---- auto play (F3): a simple vision bot. The game is a compiled original (no state API), so the bot looks at the canvas: it watches for movement of bright pixels
  // (the steel ball) in the area in front of the flippers and flips the flipper on that side; it plugs the plunger when the ball is waiting. It cannot promise to never lose the ball.
  var autoOn = false, autoTimer = 0, prev = null, lastMotion = 0, lastLaunch = 0, held = {};
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
    if (n >= 8 && n <= 160) {
      cx = cx / n / rw; cy = cy / n / rh; lastMotion = now;
      if (cy > 0.35) press(cx < 0.45 ? '.pb.fl' : '.pb.fr', 140);       // ball in front of a flipper: hit it
    }
    if (now - lastLaunch > 6500) {                                        // every few seconds pull the plunger (it does nothing while a ball is in play, but starts the next ball)
      lastLaunch = now; var b = document.querySelector('.pb.ln'); key('keydown', b); b.classList.add('on'); setTimeout(function () { key('keyup', b); b.classList.remove('on'); }, 1000 + Math.random() * 400);
    }
  }
  window.toggleAuto = function () {
    autoOn = !autoOn; prev = null; lastMotion = performance.now(); lastLaunch = performance.now() - 5500;
    if (autoOn) autoTimer = setInterval(look, 45); else { clearInterval(autoTimer); autoTimer = 0; }
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
