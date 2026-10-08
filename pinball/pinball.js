// Win98 shell around the SpaceCadetPinball web port (reverse-engineered "3D Pinball for Windows - Space Cadet", MIT; https://github.com/k4zmu2a/SpaceCadetPinball, web build by alula).
// The game itself runs unchanged inside the iframe from the port's own site; its data file (Microsoft's) is not redistributed here.
(function () {
  var KO = /^ko/i.test(navigator.language || 'ko');
  var TXT = {
    ko: { title: '3D 핀볼', game: '게임', new: '　새 게임(N)', exit: '　끝내기(X)', help: '도움말', how: '　게임 방법(H)', other: '　다른 게임', mine: '　지뢰찾기', poly: '　폴리큐브', howT: '게임 방법', ok: '확인',
      hint: '스페이스 = 발사 · Z / 왼쪽 Shift = 왼쪽 플리퍼 · / / 오른쪽 Shift = 오른쪽 플리퍼 · X / 방향키 = 판 흔들기 · F2 = 새 게임',
      help1: '「3D Pinball for Windows - Space Cadet」을 역설계한 오픈소스 <b>SpaceCadetPinball</b>(MIT)의 웹 빌드를 그대로 실행합니다.<br>스페이스(누르고 있다가 놓기)로 공을 쏘고, Z / 오른쪽 Shift 쪽 키로 플리퍼를 칩니다. 화면 안의 게임 메뉴(F2 새 게임, F3 일시정지 등)도 그대로 쓸 수 있습니다.<br>게임 데이터는 이 저장소에 들어 있지 않고 원 게임을 호스팅하는 사이트에서 불러오므로 인터넷 연결이 필요합니다.' },
    en: { title: '3D Pinball', game: 'Game', new: '　New Game(N)', exit: '　Exit(X)', help: 'Help', how: '　How to Play(H)', other: '　Other Games', mine: '　Minesweeper', poly: '　Polycube', howT: 'How to play', ok: 'OK',
      hint: 'Space = launch · Z / left Shift = left flipper · / / right Shift = right flipper · X / arrows = nudge · F2 = new game',
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
  window.newGame = function () { var f = document.getElementById('game'); f.src = f.src; };           // reloads the game
  document.addEventListener('keydown', function (e) { if (e.key === 'F2') { e.preventDefault(); newGame(); } });
})();
