// Win98 shell of the T-Rex runner: menus, dialogs, best score persistence, cheat toggle.
(function () {
  var KO = /^ko/i.test(navigator.language || 'ko');
  var TXT = {
    ko: { title: 'T-Rex', game: '게임', new: '　새 게임(N)', reset: '　최고 기록 지우기', exit: '　끝내기(X)', help: '도움말', how: '　게임 방법(H)', cheat: '　치트...', auto: '　자동으로 풀기',
      other: '　다른 게임', mine: '　지뢰찾기', poly: '　폴리큐브', howT: '게임 방법', ok: '확인',
      hint: '스페이스 / ↑ 점프 · ↓ 숙이기 · 터치: 누른 채 위로 끌면 점프, 아래로 끌면 숙이기 · F2 새 게임 · F3 자동 플레이',
      help1: '스페이스 또는 ↑ 로 점프(누르고 있으면 더 높이), ↓ 로 숙이기(공중에서는 빨리 떨어지기). 터치 기기에서는 화면을 탭해 시작하고, 누른 채 위로 끌면 점프, 아래로 끌면 숙이기입니다.<br>선인장과 익룡을 피해 최대한 멀리 달리세요. 속도는 점점 빨라지고 밤낮이 바뀝니다.<br>도움말 &gt; 치트 &gt; 자동으로 풀기(F3): 규칙 기반 봇이 대신 달립니다.<br><br><small>게임 코드와 스프라이트: Chromium의 offline 공룡 게임(BSD 3-Clause, 추출본 wayou/t-rex-runner). LICENSE 파일 참고.</small>' },
    en: { title: 'T-Rex', game: 'Game', new: '　New Game(N)', reset: '　Clear Best Score', exit: '　Exit(X)', help: 'Help', how: '　How to Play(H)', cheat: '　Cheat...', auto: '　Solve Automatically',
      other: '　Other Games', mine: '　Minesweeper', poly: '　Polycube', howT: 'How to play', ok: 'OK',
      hint: 'Space / Up / drag up: jump · Down / drag down: duck · F2 new game · F3 auto play',
      help1: 'Jump with Space or Up (hold for a higher jump), duck with Down (in the air: drop faster). On touch devices press and drag up to jump, down to duck (a tap starts the game).<br>Dodge the cacti and pterodactyls and run as far as you can. The speed keeps rising and day turns to night.<br>Help &gt; Cheat &gt; Solve Automatically (F3): a rule-based bot runs for you.<br><br><small>Game code and sprites: the Chromium offline dinosaur game (BSD 3-Clause, extracted copy wayou/t-rex-runner). See the LICENSE file.</small>' }
  };
  var T = KO ? TXT.ko : TXT.en;
  document.documentElement.lang = KO ? 'ko' : 'en';
  [].forEach.call(document.querySelectorAll('[data-t]'), function (e) { var k = e.getAttribute('data-t'); if (T[k]) e.textContent = T[k]; });
  document.getElementById('hint').textContent = T.hint;
  document.getElementById('helpTxt').innerHTML = T.help1;
  document.title = T.title;

  var KEY = 'dino_best';
  function runner() { return window.Runner.instance_; }
  function loadBest() { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { localStorage.setItem(KEY, String(v)); } catch (e) {} }

  var origOver = Runner.prototype.gameOver;
  Runner.prototype.gameOver = function () { origOver.apply(this, arguments); if (this.highestScore > loadBest()) saveBest(this.highestScore); };
  $(function () {
    var r = runner(), b = loadBest();
    if (r && b) { r.highestScore = b; r.distanceMeter.setHighScore(b); }
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
  window.newGame = function () {
    var r = runner(); if (!r) return;
    if (r.crashed || !r.playing) { if (r.crashed) r.restart(); else r.onKeyDown({ keyCode: 32, type: 'keydown', target: document.body, preventDefault: function () {} }); }
  };
  window.resetBest = function () { saveBest(0); var r = runner(); if (r) { r.highestScore = 0; r.distanceMeter.setHighScore(0); } };
  window.toggleAuto = function () {
    var on = !DinoBot.on;
    if (on) DinoBot.start(); else DinoBot.stop();
    var a = document.querySelector('.menu-autosolve .mi-label');
    if (a) a.textContent = (on ? '✓ ' : '　') + a.textContent.replace(/^[✓✓]\s*/, '').replace(/^　/, '');
  };
  // ---- mouse / touch: a tap starts / restarts the game; press and drag UP = jump (keep it held up for a higher jump), press and drag DOWN = duck (in the air: drop faster) ----
  // (a plain press no longer jumps, so ducking by touch is possible without jumping first)
  (function () {
    var frame = document.getElementById('frame'), down = null, jumping = false, ducking = false, TH = 14;
    function ev(code, type) { return { keyCode: code, type: type, target: document.body, preventDefault: function () {}, button: 0 }; }
    function swallow(e) { e.stopPropagation(); }
    ['touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(function (t) { frame.addEventListener(t, swallow, true); });     // (the original handlers would act a second time)
    function setJump(r, v) { if (jumping === v) return; jumping = v; r[v ? 'onKeyDown' : 'onKeyUp'](ev(38, v ? 'keydown' : 'keyup')); }
    function setDuck(r, v) { if (ducking === v) return; ducking = v; r[v ? 'onKeyDown' : 'onKeyUp'](ev(40, v ? 'keydown' : 'keyup')); }
    frame.addEventListener('pointerdown', function (e) {
      var r = runner(); if (!r || (window.DinoBot && DinoBot.on)) return;
      e.preventDefault(); try { frame.setPointerCapture(e.pointerId); } catch (x) {}
      down = { y: e.clientY }; jumping = ducking = false;
      if (r.crashed) { if (performance.now() - r.time >= r.config.GAMEOVER_CLEAR_TIME) r.restart(); down = null; return; }
      if (!r.playing) { r.onKeyDown(ev(32, 'keydown')); setTimeout(function () { r.onKeyUp(ev(32, 'keyup')); }, 60); down = null; }      // a tap on the stopped game starts it
    });
    frame.addEventListener('pointermove', function (e) {
      var r = runner(); if (!down || !r || r.crashed) return;
      var dy = e.clientY - down.y;
      if (dy < -TH) { setDuck(r, false); setJump(r, true); }
      else if (dy > TH) { setJump(r, false); setDuck(r, true); }
      else if (Math.abs(dy) < TH * 0.4) { setJump(r, false); setDuck(r, false); }
    });
    function up() { var r = runner(); if (!down || !r) { down = null; return; } down = null; setJump(r, false); setDuck(r, false); }
    frame.addEventListener('pointerup', up); frame.addEventListener('pointercancel', up);
  })();

  document.addEventListener('keydown', function (e) {
    if (e.key === 'F2') { e.preventDefault(); newGame(); }
    if (e.key === 'F3') { e.preventDefault(); toggleAuto(); }
  });
})();
