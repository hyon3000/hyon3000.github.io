// 2048 in the Minesweeper Win98 shell. Board sizes: beginner 4x4, intermediate 6x6, expert 8x8, custom R x C (2..24).
// Bigger boards spawn more tiles per move (round(sqrt(R*C)/4), at least 1) so that they do not take forever.
(function () {
  var KO = /^ko/i.test(navigator.language || 'ko');
  var TXT = {
    ko: { game: '게임', new: '　새 게임(N)', beg: '　초급(B) 4×4', int: '　중급(I) 6×6', exp: '　고급(E) 8×8', cus: '　사용자 지정(C)...', best: '　최고 기록(T)...', exit: '　끝내기(X)',
      help: '도움말', how: '　게임 방법(H)', other: '　다른 게임', cheat: '　치트...', auto: '　자동으로 풀기', hintm: '　힌트 제공', mine: '　지뢰찾기', poly: '　폴리큐브', cusT: '사용자 지정 게임', rows: '높이(H)', cols: '너비(W)', ok: '확인', cancel: '취소', newBtn: '새 게임',
      bestT: '최고 기록', reset: '초기화', howT: '2048 게임 방법', over: '게임 오버', won: '2048 달성! 계속할 수 있어요', retry: '새 게임 버튼 또는 F2',
      hint: '방향키 / WASD / 스와이프로 타일을 밀어 같은 숫자를 합치세요.', lv: ['초급', '중급', '고급', '사용자 지정'], none: '—',
      help1: '방향키(또는 W A S D, 화면 스와이프)로 모든 타일을 한 방향으로 밉니다.<br>같은 숫자 두 타일이 부딪치면 하나로 합쳐지고 합친 값만큼 점수가 오릅니다.<br>한 번 움직일 때마다 새 타일(2 또는 4)이 나타납니다. 큰 판은 한 번에 여러 개가 나타납니다.<br>더 움직일 수 없으면 게임 오버입니다. 2048 타일을 만든 뒤에도 계속할 수 있습니다.<br>F2: 새 게임.' },
    en: { game: 'Game', new: '　New(N)', beg: '　Beginner(B) 4×4', int: '　Intermediate(I) 6×6', exp: '　Expert(E) 8×8', cus: '　Custom(C)...', best: '　Best Scores(T)...', exit: '　Exit(X)',
      help: 'Help', how: '　How to Play(H)', other: '　Other Games', cheat: '　Cheat...', auto: '　Solve Automatically', hintm: '　Give a Hint', mine: '　Minesweeper', poly: '　Polycube', cusT: 'Custom Game', rows: 'Height(H)', cols: 'Width(W)', ok: 'OK', cancel: 'Cancel', newBtn: 'New Game',
      bestT: 'Best Scores', reset: 'Reset', howT: 'How to play 2048', over: 'Game Over', won: '2048! You can keep going', retry: 'New Game button or F2',
      hint: 'Arrow keys / WASD / swipe to slide the tiles and merge equal numbers.', lv: ['Beginner', 'Intermediate', 'Expert', 'Custom'], none: '—',
      help1: 'Slide all tiles in one direction with the arrow keys (or W A S D, or swipe).<br>Two tiles with the same number merge into one and add its value to your score.<br>After every move a new tile (2 or 4) appears; bigger boards add several at once.<br>When nothing can move any more the game is over. You may keep playing after reaching 2048.<br>F2: new game.' }
  };
  var T = KO ? TXT.ko : TXT.en;
  document.documentElement.lang = KO ? 'ko' : 'en';
  [].forEach.call(document.querySelectorAll('[data-t]'), function (e) { var k = e.getAttribute('data-t'); if (T[k]) e.textContent = T[k]; });
  document.getElementById('hint').textContent = T.hint;
  document.getElementById('helpTxt').innerHTML = T.help1;

  var COLORS = { 2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#f9f6f2'], 16: ['#f59563', '#f9f6f2'], 32: ['#f67c5f', '#f9f6f2'], 64: ['#f65e3b', '#f9f6f2'],
    128: ['#edcf72', '#f9f6f2'], 256: ['#edcc61', '#f9f6f2'], 512: ['#edc850', '#f9f6f2'], 1024: ['#edc53f', '#f9f6f2'], 2048: ['#edc22e', '#f9f6f2'] };
  var DIRS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

  var R = 4, C = 4, level = 1, cell = 72, gap = 6;
  var grid = [], score = 0, best = 0, over = false, won = false, nid = 1, spawnN = 1, lastMove = 0;
  var elBoard = document.getElementById('board'), elArea = document.getElementById('area');

  function key() { return R + 'x' + C; }
  function loadBest(k) { try { return parseInt(localStorage.getItem('g2048_best_' + k), 10) || 0; } catch (e) { return 0; } }
  function saveBest(k, v) { try { localStorage.setItem('g2048_best_' + k, String(v)); } catch (e) {} }

  function showScore() {
    document.getElementById('vScore').textContent = score; document.getElementById('vBest').textContent = best;
    document.getElementById('sub').textContent = R + '×' + C + ' · ' + T.lv[level - 1];
  }

  // ---- layout ----
  function layout() {
    var maxW = Math.max(240, Math.min(560, window.innerWidth - 60)), maxH = Math.max(240, window.innerHeight - 190);
    cell = Math.max(26, Math.min(80, Math.floor(maxW / C), Math.floor(maxH / R)));
    gap = Math.max(2, Math.round(cell * 0.09));
    var bw = C * cell, bh = R * cell, areaW = Math.max(bw, 300), headW = areaW + 2;
    elBoard.style.width = bw + 'px'; elBoard.style.height = bh + 'px';
    elArea.style.width = areaW + 'px'; elArea.style.height = bh + 'px';
    document.getElementById('head').style.width = headW + 'px';
    document.getElementById('mainwin').style.width = (areaW + 30) + 'px';
    elBoard.innerHTML = '';
    for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) {
      var e = document.createElement('div'); e.className = 'g-cell';
      e.style.left = (c * cell + gap / 2) + 'px'; e.style.top = (r * cell + gap / 2) + 'px'; e.style.width = (cell - gap) + 'px'; e.style.height = (cell - gap) + 'px';
      elBoard.appendChild(e);
    }
  }
  function paint(t) {
    var col = COLORS[t.v] || ['#3c3a32', '#f9f6f2'], digits = String(t.v).length;
    t.el.style.background = col[0]; t.el.style.color = col[1];
    t.el.firstChild.textContent = t.v;
    var f = digits <= 2 ? 0.46 : (digits === 3 ? 0.38 : (digits === 4 ? 0.31 : 0.25));
    t.el.style.fontSize = Math.max(8, Math.floor(cell * f)) + 'px';
  }
  function place(t, r, c) { t.r = r; t.c = c; t.el.style.transform = 'translate(' + (c * cell + gap / 2) + 'px,' + (r * cell + gap / 2) + 'px)'; }
  function makeTile(v, r, c, anim) {
    var el = document.createElement('div'); el.className = 'g-tile' + (anim ? ' new' : '');
    el.style.width = (cell - gap) + 'px'; el.style.height = (cell - gap) + 'px';
    var inn = document.createElement('div'); inn.className = 'g-in'; el.appendChild(inn);
    var t = { id: nid++, v: v, el: el, r: r, c: c };
    paint(t); place(t, r, c); elBoard.appendChild(el);
    return t;
  }

  // ---- game ----
  function empties() { var out = []; for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) if (!grid[r][c]) out.push([r, c]); return out; }
  function spawn(n) {
    for (var i = 0; i < n; i++) {
      var e = empties(); if (!e.length) return;
      var p = e[Math.floor(Math.random() * e.length)];
      grid[p[0]][p[1]] = makeTile(Math.random() < 0.9 ? 2 : 4, p[0], p[1], true);
    }
  }
  function canMove() {
    for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) {
      var t = grid[r][c]; if (!t) return true;
      if (c + 1 < C && grid[r][c + 1] && grid[r][c + 1].v === t.v) return true;
      if (r + 1 < R && grid[r + 1][c] && grid[r + 1][c].v === t.v) return true;
    }
    return false;
  }
  function newGame() {
    layout();
    grid = []; for (var r = 0; r < R; r++) { grid.push([]); for (var c = 0; c < C; c++) grid[r].push(null); }
    score = 0; over = false; won = false; best = loadBest(key());
    spawnN = Math.max(1, Math.round(Math.sqrt(R * C) / 4));
    document.getElementById('over').style.display = 'none';
    spawn(spawnN + 1);
    showScore(); markLevel();
  }
  function setSize(r, c, lv) { R = r; C = c; level = lv; newGame(); }
  window.newGame = newGame; window.setSize = setSize;

  function move(dir) {
    if (over) return;
    var d = DIRS[dir], moved = false, gained = 0, kill = [];
    var lines = [];
    if (d[0] === 0) for (var r = 0; r < R; r++) { var l = []; for (var c = 0; c < C; c++) l.push([r, d[1] > 0 ? C - 1 - c : c]); lines.push(l); }
    else for (var c2 = 0; c2 < C; c2++) { var l2 = []; for (var r2 = 0; r2 < R; r2++) l2.push([d[0] > 0 ? R - 1 - r2 : r2, c2]); lines.push(l2); }
    var ng = []; for (var i = 0; i < R; i++) { ng.push([]); for (var j = 0; j < C; j++) ng[i].push(null); }
    lines.forEach(function (line) {
      var tiles = []; line.forEach(function (p) { if (grid[p[0]][p[1]]) tiles.push(grid[p[0]][p[1]]); });
      var out = [];
      for (var a = 0; a < tiles.length; a++) {
        var t = tiles[a];
        if (a + 1 < tiles.length && tiles[a + 1].v === t.v) {          // merge t with the next tile
          var u = tiles[a + 1]; a++;
          t.v *= 2; gained += t.v; t.merged = true; kill.push([u, line[out.length]]);
        }
        out.push(t);
      }
      out.forEach(function (t, idx) { var p = line[idx]; ng[p[0]][p[1]] = t; if (t.r !== p[0] || t.c !== p[1]) moved = true; });
    });
    if (kill.length) moved = true;
    if (!moved) return;
    grid = ng;
    for (var r3 = 0; r3 < R; r3++) for (var c3 = 0; c3 < C; c3++) if (grid[r3][c3]) place(grid[r3][c3], r3, c3);
    kill.forEach(function (k) { place(k[0], k[1][0], k[1][1]); k[0].el.style.zIndex = 0; setTimeout(function () { if (k[0].el.parentNode) k[0].el.parentNode.removeChild(k[0].el); }, 130); });
    setTimeout(function () {                                                   // the merged tiles change their number once the others have arrived
      for (var r4 = 0; r4 < R; r4++) for (var c4 = 0; c4 < C; c4++) { var t = grid[r4][c4]; if (t && t.merged) { t.merged = false; paint(t); t.el.classList.remove('merge'); void t.el.offsetWidth; t.el.classList.add('merge'); } }
    }, 90);
    for (var r5 = 0; r5 < R; r5++) for (var c5 = 0; c5 < C; c5++) { var tt = grid[r5][c5]; if (tt) { tt.el.classList.remove('new'); tt.el.style.zIndex = 1; } }
    score += gained;
    if (score > best) { best = score; saveBest(key(), best); }
    spawn(spawnN);
    showScore();
    if (!won) for (var r6 = 0; r6 < R && !won; r6++) for (var c6 = 0; c6 < C; c6++) if (grid[r6][c6] && grid[r6][c6].v >= 2048) { won = true; toast(T.won); break; }
    if (!canMove()) {
      over = true;
      document.getElementById('overTxt').textContent = T.over; document.getElementById('overSub').textContent = T.retry;
      setTimeout(function () { document.getElementById('over').style.display = 'flex'; }, 350);
    }
  }
  function toast(s) { var e = document.getElementById('toast'); e.textContent = s; e.style.opacity = 1; setTimeout(function () { e.style.opacity = 0; }, 2200); }

  // ---- input ----
  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var m = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' }[e.key];
    if (m) { e.preventDefault(); move(m); return; }
    if (e.key === 'F2') { e.preventDefault(); newGame(); }
    if (e.key === 'F3') { e.preventDefault(); toggleAuto(); }
    if (e.key === 'F4') { e.preventDefault(); giveHint(); }
  });
  var sx = 0, sy = 0, sdown = false;
  elArea.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; sdown = true; });
  window.addEventListener('pointerup', function (e) {
    if (!sdown) return; sdown = false;
    var dx = e.clientX - sx, dy = e.clientY - sy, ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < 20) return;
    move(ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  elArea.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

  // ---- Cheat > solve automatically: the trained value network (ai.js) plays one slide every AUTO_MS ----
  var autoT = 0, AUTO_MS = 140;
  function autoStep() {
    if (over || !window.AI2048 || !AI2048.ready()) { stopAuto(); return; }
    var g = []; for (var r = 0; r < R; r++) { g.push([]); for (var c = 0; c < C; c++) g[r].push(grid[r][c] ? grid[r][c].v : 0); }
    var d = AI2048.choose(g);
    if (!d) { stopAuto(); return; }
    move(d);
  }
  function stopAuto() { if (autoT) { clearInterval(autoT); autoT = 0; } mark('auto', false); }
  // hint: the trained policy makes exactly ONE move for you (the best one it sees), then stops
  window.giveHint = function () {
    if (over || autoT || !window.AI2048 || !AI2048.ready()) return;
    var g = []; for (var r = 0; r < R; r++) { g.push([]); for (var c = 0; c < C; c++) g[r].push(grid[r][c] ? grid[r][c].v : 0); }
    var d = AI2048.choose(g); if (d) move(d);
  };
  window.toggleAuto = function () {
    if (autoT) { stopAuto(); return; }
    if (over) newGame();
    autoT = setInterval(autoStep, AUTO_MS); mark('auto', true);
  };
  function mark(cls, on) {
    var a = document.querySelector('.menu-' + (cls === 'auto' ? 'autosolve' : cls) + ' .mi-label'); if (!a) return;
    a.textContent = (on ? '✓ ' : '\u3000') + a.textContent.replace(/^[✓\u2713]\s*/, '').replace(/^\u3000/, '');
  }

  // ---- menus / dialogs ----
  function closeMenus() {
    var mb = $('.menu-bar');
    try { mb.menubar('collapseAll'); } catch (e) {}
    mb.find('.ui-state-open').removeClass('ui-state-open');
    mb.find('> li').removeClass('ui-state-active ui-state-hover ui-state-focus');
    mb.find('.menu').hide().attr('aria-hidden', 'true').attr('aria-expanded', 'false');
  }
  window.runMenu = function (fn) { closeMenus(); setTimeout(fn, 0); return false; };
  function markLevel() {
    for (var i = 1; i <= 4; i++) {
      var a = document.querySelector('.lv' + i + ' a'); if (!a) continue;
      var name = a.textContent.replace(/^[✓✓]\s*/, '').replace(/^　/, '');
      a.textContent = (i === level ? '✓ ' : '　') + name;
    }
  }
  window.closeDlg = function (id) { document.getElementById(id).style.display = 'none'; };
  function openDlg(id) { ['customWin', 'bestWin', 'helpWin'].forEach(closeDlg); document.getElementById(id).style.display = 'block'; }
  window.openCustom = function () { document.getElementById('cRows').value = R; document.getElementById('cCols').value = C; openDlg('customWin'); };
  window.submitCustom = function () {
    var r = Math.max(2, Math.min(24, parseInt(document.getElementById('cRows').value, 10) || 4)), c = Math.max(2, Math.min(24, parseInt(document.getElementById('cCols').value, 10) || 4));
    closeDlg('customWin'); setSize(r, c, 4);
  };
  window.openHelp = function () { openDlg('helpWin'); };
  window.openBest = function () {
    var rows = [[T.lv[0], '4x4'], [T.lv[1], '6x6'], [T.lv[2], '8x8']];
    var html = rows.map(function (x) { var b = loadBest(x[1]); return '<tr><td>' + x[0] + ' (' + x[1].replace('x', '×') + ')</td><td style="text-align:right">' + (b || T.none) + '</td></tr>'; }).join('');
    html += '<tr><td>' + T.lv[3] + ' (' + key().replace('x', '×') + ')</td><td style="text-align:right">' + (level === 4 ? (loadBest(key()) || T.none) : T.none) + '</td></tr>';
    document.getElementById('bestTable').innerHTML = html; openDlg('bestWin');
  };
  window.resetBest = function () {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('g2048_best_') === 0) localStorage.removeItem(k); }); } catch (e) {}
    best = 0; showScore(); openBest();
  };

  $(function () {
    if ($('.menu-bar').length) $('.menu-bar').menubar();
    $('.window').draggable({ handle: '.title' });
    $('#mainwin .title-button.minimize').on('click', function () { $('#mainwin').hide(); });
    $('#mainwin .title-button.close').on('click', function () { $('#mainwin').css('visibility', 'hidden'); });
  });
  window.addEventListener('resize', function () { if (grid.length) { var g = grid; layout(); for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) if (g[r][c]) { var t = g[r][c]; t.el.style.width = t.el.style.height = (cell - gap) + 'px'; paint(t); place(t, r, c); elBoard.appendChild(t.el); } } });
  newGame();
})();
