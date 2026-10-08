// Win98 shell around the SpaceCadetPinball web port (reverse-engineered "3D Pinball for Windows - Space Cadet", MIT; https://github.com/k4zmu2a/SpaceCadetPinball, web build by alula).
// The game itself (its JS / wasm / data) is fetched unchanged from the port's own site (CORS-enabled) and drawn on our canvas; the data file (Microsoft's) is not redistributed here.
(function () {
  var KO = /^ko/i.test(navigator.language || 'ko');
  var TXT = {
    ko: { title: '3D 핀볼', game: '게임', new: '　새 게임(N)', exit: '　끝내기(X)', help: '도움말', how: '　게임 방법(H)', other: '　다른 게임', mine: '　지뢰찾기', poly: '　폴리큐브', howT: '게임 방법', ok: '확인',
      bl: '◀ 왼쪽', br: '오른쪽 ▶', bs: '발사', bnl: '↖ 흔들기', bnr: '흔들기 ↗', bnu: '↑ 흔들기', bn: '새 게임',
      hint: '스페이스 = 발사 · Z / 왼쪽 Shift = 왼쪽 플리퍼 · / / 오른쪽 Shift = 오른쪽 플리퍼 · X / . / ↑ = 판 흔들기 · F2 = 새 게임',
      help1: '「3D Pinball for Windows - Space Cadet」을 역설계한 오픈소스 <b>SpaceCadetPinball</b>(MIT)의 웹 빌드를 그대로 실행합니다.<br>스페이스(누르고 있다가 놓기)로 공을 쏘고, Z / 오른쪽 Shift 쪽 키로 플리퍼를 칩니다. 화면 안의 게임 메뉴(F2 새 게임, F3 일시정지 등)도 그대로 쓸 수 있습니다.<br>게임 데이터는 이 저장소에 들어 있지 않고 원 게임을 호스팅하는 사이트에서 불러오므로 인터넷 연결이 필요합니다.' },
    en: { title: '3D Pinball', game: 'Game', new: '　New Game(N)', exit: '　Exit(X)', help: 'Help', how: '　How to Play(H)', other: '　Other Games', mine: '　Minesweeper', poly: '　Polycube', howT: 'How to play', ok: 'OK',
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
  // the original game, loaded from the web build's host
  var HOST = 'https://pinball.alula.me/', st = document.getElementById('status'), cv = document.getElementById('canvas');
  window.Module = {
    canvas: cv, locateFile: function (p) { return HOST + p; }, print: function () {}, printErr: function () {},
    setStatus: function (s) { if (!s) { st.style.display = 'none'; cv.style.display = ''; cv.focus(); } else { st.style.display = ''; st.textContent = s; } },
    totalDependencies: 0, monitorRunDependencies: function (n) { this.totalDependencies = Math.max(this.totalDependencies, n); Module.setStatus(n ? 'Preparing... (' + (this.totalDependencies - n) + '/' + this.totalDependencies + ')' : ''); }
  };
  var sc = document.createElement('script'); sc.async = true; sc.src = HOST + 'SpaceCadetPinball.js'; sc.onerror = function () { st.textContent = KO ? '게임을 불러오지 못했습니다 (인터넷 연결 확인)' : 'Could not load the game (check your internet connection)'; }; document.body.appendChild(sc);
})();
