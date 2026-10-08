// Sudoku in a Win98 frame.  Region type 0: classic 3x3 boxes.  Type 1: random-shaped (jigsaw) regions of 9 connected cells.
// Number buttons sit under the board; the 4-squares button opens the candidate popup (max 4 candidates per cell, shown small in the cell).
(function () {
  var KO = /^ko/i.test(navigator.language || 'ko');
  var TXT = {
    ko: { title: '스도쿠', game: '게임', new: '　새 게임(N)', t0: '　정사각형(S)', t1: '　랜덤형(R)', t2: '　X 스도쿠(X)', d0: '　쉬움(E)', d1: '　보통(M)', d2: '　어려움(H)', exit: '　끝내기(X)', help: '도움말', how: '　게임 방법(H)',
      other: '　다른 게임', cheat: '　치트...', auto: '　자동으로 풀기', hint: '　힌트 제공', stuck: '더 이상 풀 수 없습니다 (현재 입력이 퍼즐과 맞지 않아요)', solving: '풀이 중... (F3: 멈춤)', rmWrong: '틀린 입력을 지웁니다: ', byNaked: '이 칸에는 같은 줄·칸·영역에 이미 있는 숫자를 빼면 {d}만 남습니다', byHidden: '{u}에서 {d}가 들어갈 수 있는 칸이 여기뿐입니다', byUnique: '더 줄일 수 없어 이 퍼즐의 유일한 해에 따라 {d}를 넣습니다 (낸 순서의 역순)', unRow: '{n}행', unCol: '{n}열', unBox: '같은 영역', unD1: '왼쪽 위-오른쪽 아래 대각선', unD2: '오른쪽 위-왼쪽 아래 대각선', cellAt: '{r}행 {c}열: ', stopped: '자동 풀기를 멈췄습니다', wrong: '틀린 칸이 있어요 (표시된 칸)', fixed: '힌트: 틀린 칸을 정답으로 고쳤어요 → ', hintMsg: '힌트: 이 칸은 ', full: '빈 칸이 없습니다', mine: '　지뢰찾기', poly: '　폴리큐브', newBtn: '새 게임', hintBtn: '힌트', memo: '후보', erase: '지우기', noteT: '후보 숫자 (최대 4개)', clear: '모두 지우기', close: '닫기', ok: '확인', howT: '스도쿠 방법',
      types: ['정사각형', '랜덤형', 'X 스도쿠'], diffs: ['쉬움', '보통', '어려움'], making: '퍼즐을 만드는 중...', win: '클리어! ', pick: '먼저 칸을 선택하세요', locked: '이미 정해진 칸입니다', hasVal: '숫자가 있는 칸에는 후보를 쓸 수 없습니다',
      help1: '각 가로줄, 세로줄, 굵은 선으로 둘러싸인 영역마다 1~9가 한 번씩만 들어가야 합니다.<br><b>정사각형</b>: 3×3 영역. <b>랜덤형</b>: 영역이 제각각 모양인 스도쿠(영역마다 9칸).<br>칸을 선택하고 아래 숫자 버튼(또는 키보드 1~9)으로 채웁니다. 같은 숫자를 다시 누르면 지워집니다. 화살표 키로 칸을 옮깁니다.<br><b>후보</b> 버튼(네모 네 개)을 누르면 선택한 칸에 후보 숫자를 최대 4개까지 적는 창이 열립니다. 창을 닫아도 칸 안에 작은 글씨로 남습니다.<br>겹치는 숫자는 빨간색으로 표시됩니다.<br><b>X 스도쿠</b>: 가로·세로·3×3 박스에 더해 두 대각선(칠해진 칸)에도 1~9가 한 번씩만 들어갑니다.' },
    en: { title: 'Sudoku', game: 'Game', new: '　New(N)', t0: '　Square(S)', t1: '　Random(R)', t2: '　X-Sudoku(X)', d0: '　Easy(E)', d1: '　Normal(M)', d2: '　Hard(H)', exit: '　Exit(X)', help: 'Help', how: '　How to Play(H)',
      other: '　Other Games', cheat: '　Cheat...', auto: '　Solve Automatically', hint: '　Give a Hint', stuck: 'Cannot be solved any further (the current entries do not fit the puzzle)', solving: 'Solving... (F3: stop)', rmWrong: 'Removing a wrong entry: ', byNaked: 'every other digit is already in its row, column or region, only {d} is left', byHidden: 'in {u} only this cell can take {d}', byUnique: 'logic cannot narrow it further, so {d} goes in by the puzzle\'s unique solution (reverse of the order the clues were removed)', unRow: 'row {n}', unCol: 'column {n}', unBox: 'this region', unD1: 'the main diagonal', unD2: 'the anti-diagonal', cellAt: 'R{r}C{c}: ', stopped: 'Auto-solve stopped', wrong: 'Some cell is wrong (marked)', fixed: 'Hint: a wrong cell was corrected → ', hintMsg: 'Hint: this cell is ', full: 'No empty cell', mine: '　Minesweeper', poly: '　Polycube', newBtn: 'New Game', hintBtn: 'Hint', memo: 'Notes', erase: 'Erase', noteT: 'Candidates (max 4)', clear: 'Clear all', close: 'Close', ok: 'OK', howT: 'How to play',
      types: ['Square', 'Random', 'X (diagonals)'], diffs: ['Easy', 'Normal', 'Hard'], making: 'Making a puzzle...', win: 'Solved! ', pick: 'Select a cell first', locked: 'This cell is fixed', hasVal: 'Cannot add notes to a filled cell',
      help1: 'Every row, column and bold-outlined region must contain 1-9 exactly once.<br><b>Square</b>: 3×3 boxes. <b>Random</b>: regions of random shape (9 cells each).<br>Select a cell and fill it with the number buttons below (or keys 1-9). Press the same number again to clear. Arrow keys move the selection.<br>The <b>Notes</b> button (four squares) opens a window for up to 4 candidate numbers of the selected cell; they stay in the cell as small digits after closing.<br>Duplicates are shown in red.<br><b>X-Sudoku</b>: besides rows, columns and 3x3 boxes, the two diagonals (shaded cells) must also hold 1-9 exactly once.' }
  };
  var T = KO ? TXT.ko : TXT.en;
  document.documentElement.lang = KO ? 'ko' : 'en'; document.title = T.title;
  [].forEach.call(document.querySelectorAll('[data-t]'), function (e) { var k = e.getAttribute('data-t'); if (T[k] !== undefined) e.textContent = T[k]; });
  (function () { var b = document.getElementById("memoBtn"); if (b && T.noteT) b.title = T.noteT.replace(/\s*[(（].*$/, ""); })();
  document.getElementById('helpTxt').innerHTML = T.help1;

  var type = 0, diff = 1, CLUES = [40, 32, 26];
  try { type = Math.min(2, Math.max(0, parseInt(localStorage.getItem('sudoku_type'), 10) || 0)); diff = Math.min(2, Math.max(0, parseInt(localStorage.getItem('sudoku_diff'), 10) || 1)); } catch (e) {}
  var reg = new Int8Array(81), sol = new Int8Array(81), given = new Uint8Array(81), vals = new Int8Array(81), notes = [], sel = -1, secs = 0, tm = 0, solved = false, cells = [];
  var boardEl = document.getElementById('board');
  var TINT = ['#ffcdd2', '#c8e6c9', '#bbdefb', '#fff59d', '#e1bee7', '#b2ebf2', '#ffe0b2', '#dcedc8', '#d1c4e9'];   // one colour per region

  // type 2 = X-Sudoku: the two main diagonals must also hold 1-9 once each
  function onD1(i) { return i % 10 === 0; }
  function onD2(i) { return i > 0 && i < 80 && i % 8 === 0; }
  function peer(i, j) { return Math.floor(i / 9) === Math.floor(j / 9) || i % 9 === j % 9 || reg[i] === reg[j] || (type === 2 && ((onD1(i) && onD1(j)) || (onD2(i) && onD2(j)))); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ---------- region generation ----------
  function standardRegions() { var r = new Int8Array(81); for (var i = 0; i < 81; i++) r[i] = Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3); return r; }
  function connected(r, id) {
    var list = [], i; for (i = 0; i < 81; i++) if (r[i] === id) list.push(i);
    var seen = {}, st = [list[0]]; seen[list[0]] = 1; var n = 1;
    while (st.length) { var c = st.pop(), y = Math.floor(c / 9), x = c % 9, nb = [x > 0 ? c - 1 : -1, x < 8 ? c + 1 : -1, y > 0 ? c - 9 : -1, y < 8 ? c + 9 : -1]; for (var k = 0; k < 4; k++) { var q = nb[k]; if (q >= 0 && r[q] === id && !seen[q]) { seen[q] = 1; n++; st.push(q); } } }
    return n === list.length;
  }
  // random-shaped regions: start from the 3x3 boxes and keep reshaping them: move a boundary cell into the neighbouring region and move another cell back
  // (so every region keeps 9 cells), accepting the move only if both regions stay connected
  function randomRegions() {
    var r = standardRegions(), nbOf = function (c) { var y = Math.floor(c / 9), x = c % 9, o = []; if (x > 0) o.push(c - 1); if (x < 8) o.push(c + 1); if (y > 0) o.push(c - 9); if (y < 8) o.push(c + 9); return o; };
    for (var it = 0; it < 6000; it++) {
      var a = rnd(81), A = r[a], other = nbOf(a).filter(function (n) { return r[n] !== A; }).map(function (n) { return r[n]; });
      if (!other.length) continue;
      var Bk = other[rnd(other.length)]; r[a] = Bk;
      var cands = []; for (var c = 0; c < 81; c++) if (c !== a && r[c] === Bk && nbOf(c).some(function (n) { return r[n] === A; })) cands.push(c);
      if (!cands.length) { r[a] = A; continue; }
      var m = cands[rnd(cands.length)]; r[m] = A;
      if (!(connected(r, A) && connected(r, Bk))) { r[m] = Bk; r[a] = A; }
    }
    return r;
  }

  // ---------- solver ----------
  var NODE_LIMIT = 60000;
  function pop(m) { m = m - ((m >> 1) & 0x5555); m = (m & 0x3333) + ((m >> 2) & 0x3333); m = (m + (m >> 4)) & 0x0f0f; return (m + (m >> 8)) & 0x1f; }
  // count solutions (up to `limit`) of grid g under regions rg; returns {n, first}; throws 'limit' when the node limit is hit
  function search(g, rg, limit, random) {
    var row = new Int16Array(9), col = new Int16Array(9), bx = new Int16Array(9), i, X = type === 2, d1 = 0, d2 = 0;
    for (i = 0; i < 81; i++) if (g[i]) { var b = 1 << (g[i] - 1); row[Math.floor(i / 9)] |= b; col[i % 9] |= b; bx[rg[i]] |= b; if (X && onD1(i)) d1 |= b; if (X && onD2(i)) d2 |= b; }
    var n = 0, first = null, nodes = 0;
    function rec() {
      if (++nodes > NODE_LIMIT) throw 'limit';
      var best = -1, bm = 0, bc = 10, c, m, k;
      for (c = 0; c < 81; c++) if (!g[c]) {
        m = ~(row[Math.floor(c / 9)] | col[c % 9] | bx[rg[c]] | (X && onD1(c) ? d1 : 0) | (X && onD2(c) ? d2 : 0)) & 511; k = pop(m);
        if (k < bc) { bc = k; best = c; bm = m; if (k <= 1) break; }
      }
      if (best < 0) { n++; if (!first) first = new Int8Array(g); return n >= limit; }
      if (bc === 0) return false;
      var ds = []; for (k = 0; k < 9; k++) if (bm & (1 << k)) ds.push(k + 1);
      if (random) shuffle(ds);
      var r = Math.floor(best / 9), cc = best % 9, q = rg[best];
      for (k = 0; k < ds.length; k++) {
        var bit = 1 << (ds[k] - 1);
        g[best] = ds[k]; row[r] |= bit; col[cc] |= bit; bx[q] |= bit; if (X && onD1(best)) d1 |= bit; if (X && onD2(best)) d2 |= bit;
        var stop = rec();
        g[best] = 0; row[r] &= ~bit; col[cc] &= ~bit; bx[q] &= ~bit; if (X && onD1(best)) d1 &= ~bit; if (X && onD2(best)) d2 &= ~bit;
        if (stop) return true;
      }
      return false;
    }
    rec();
    return { n: n, first: first };
  }

  var remOrder = [];                                              // the cells in the order they were taken out when the puzzle was made
  function generate(forceStd) {
    for (var tries = 0; tries < 40; tries++) {
      var r = (type !== 1 || forceStd) ? standardRegions() : randomRegions(), g = new Int8Array(81), res;
      try { res = search(g, r, 1, true); } catch (e) { continue; }
      if (!res.first) continue;
      reg = r; sol = res.first;
      var rem = [], puz = new Int8Array(sol), order = shuffle(Array.apply(null, Array(81)).map(function (_, i) { return i; })), clues = 81;
      for (var k = 0; k < 81 && clues > CLUES[diff]; k++) {
        var c = order[k], v = puz[c]; puz[c] = 0;
        var ok = false; try { ok = search(new Int8Array(puz), r, 2, false).n === 1; } catch (e) { ok = false; }
        if (ok) { clues--; rem.push(c); } else puz[c] = v;
      }
      remOrder = rem;
      return puz;
    }
    return generate(true);                                          // (practically never reached) fall back to the classic regions
  }

  // ---------- board ----------
  function layoutSize() {
    var cs = Math.max(30, Math.min(46, Math.floor((window.innerWidth - 50) / 9)));
    document.getElementById('mainwin').style.setProperty('--cs', cs + 'px');
  }
  function buildBoard() {
    boardEl.innerHTML = ''; cells = [];
    for (var i = 0; i < 81; i++) {
      var d = document.createElement('div'), x = i % 9, y = Math.floor(i / 9);
      d.className = 'sc';
      d.className += (x < 8 && reg[i + 1] !== reg[i]) ? ' rt' : ' rn'; d.className += (y < 8 && reg[i + 9] !== reg[i]) ? ' bt' : ' bn';
      if (type === 1) d.style.backgroundColor = TINT[reg[i]];
      if (type === 2 && (onD1(i) || onD2(i))) d.className += ' dg';
      (function (k) { d.addEventListener('pointerdown', function (e) { e.preventDefault(); select(k); }); })(i);
      boardEl.appendChild(d); cells.push(d);
    }
  }
  function conflicts() {
    var bad = new Uint8Array(81), i, j;
    for (i = 0; i < 81; i++) if (vals[i]) for (j = i + 1; j < 81; j++) if (vals[j] === vals[i] && peer(i, j)) { bad[i] = bad[j] = 1; }
    return bad;
  }
  function render() {
    var bad = conflicts(), sv = sel >= 0 ? vals[sel] : 0, full = true;
    for (var i = 0; i < 81; i++) {
      var d = cells[i], cls = d.className.replace(/ ?(hl|same|sel|bad|gv|try|auto|hint)\b/g, '');
      if (sel >= 0) {
        if (i === sel) cls += ' sel';
        else if (peer(i, sel)) cls += ' hl';
        if (sv && vals[i] === sv && i !== sel) cls += ' same';
      }
      if (bad[i]) cls += ' bad'; if (given[i]) cls += ' gv';
      if (autoCell[i] && vals[i]) cls += auto ? ' try' : ' auto'; if (i === hintCell && vals[i] && !given[i]) cls += ' hint';
      d.className = cls;
      if (vals[i]) { if (d.firstChild === null || d.firstChild.nodeType !== 3 || d.firstChild.nodeValue !== String(vals[i])) d.textContent = vals[i]; }
      else if (notes[i].length) { var h = '<div class="nt">'; for (var k = 0; k < 4; k++) h += '<i>' + (notes[i][k] || '') + '</i>'; d.innerHTML = h + '</div>'; }
      else d.textContent = '';
      if (!vals[i]) full = false;
    }
    var left = new Array(10).fill(9); for (var j = 0; j < 81; j++) if (vals[j]) left[vals[j]]--;
    for (var n = 1; n <= 9; n++) { padBtns[n].classList.toggle('done', left[n] <= 0); padBtns[n].lastChild.textContent = left[n] > 0 ? left[n] : ''; }
    if (full && !solved) { var anyBad = false; for (var q = 0; q < 81; q++) if (bad[q]) anyBad = true; if (!anyBad) win(); }
  }
  function win() { solved = true; clearInterval(tm); document.getElementById('msg').textContent = T.win + fmt(secs); }
  function fmt(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function tick() { secs++; document.getElementById('timer').textContent = clock(secs); }
  function clock(s) { return ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2); }

  function select(i) { sel = i; msg(''); render(); }
  function msg(s) { document.getElementById('msg').textContent = s; }
  function fill(d) {
    if (solved || auto) return;
    if (document.getElementById('noteWin').style.display === 'block') { toggleNote(d); return; }
    if (sel < 0) { msg(T.pick); return; }
    if (given[sel]) { msg(T.locked); return; }
    vals[sel] = vals[sel] === d ? 0 : d; notes[sel] = []; msg(''); render();
  }
  window.eraseCell = function () { if (sel < 0 || given[sel] || solved) return; vals[sel] = 0; notes[sel] = []; render(); };

  // ---------- candidate popup ----------
  function noteRender() {
    var sl = document.getElementById('slots'); sl.innerHTML = '';
    for (var k = 0; k < 4; k++) { var s = document.createElement('span'); s.textContent = notes[sel][k] || ''; sl.appendChild(s); }
    [].forEach.call(document.querySelectorAll('#notePad button'), function (b) { b.className = notes[sel].indexOf(+b.getAttribute('data-n')) >= 0 ? 'on' : ''; });
  }
  function toggleNote(d) {
    if (sel < 0) return; var a = notes[sel], p = a.indexOf(d);
    if (p >= 0) a.splice(p, 1); else if (a.length < 4) a.push(d); else return;
    a.sort(function (x, y) { return x - y; }); noteRender(); render();
  }
  window.openNote = function () {
    if (solved) return;
    if (sel < 0) { msg(T.pick); return; } if (given[sel]) { msg(T.locked); return; } if (vals[sel]) { msg(T.hasVal); return; }
    msg(''); noteRender(); document.getElementById('noteWin').style.display = 'block';
  };
  window.closeNote = function () { document.getElementById('noteWin').style.display = 'none'; };
  window.clearNote = function () { if (sel < 0) return; notes[sel] = []; noteRender(); render(); };
  window.closeDlg = function (id) { document.getElementById(id).style.display = 'none'; };
  window.openDlg = function (id) { document.getElementById(id).style.display = 'block'; };

  // ---------- pad ----------
  var padBtns = [];
  (function () {
    var pad = document.getElementById('pad'), np = document.getElementById('notePad');
    for (var n = 1; n <= 9; n++) {
      var b = document.createElement('button'); b.className = 'nb'; b.innerHTML = '<span>' + n + '</span><em></em>';
      (function (k) { b.addEventListener('click', function () { fill(k); }); })(n); pad.appendChild(b); padBtns[n] = b;
      var nb = document.createElement('button'); nb.textContent = n; nb.setAttribute('data-n', n);
      (function (k) { nb.addEventListener('click', function () { toggleNote(k); }); })(n); np.appendChild(nb);
    }
  })();

  // ---------- cheat: brute-force solver (tries every possibility with backtracking, shown step by step) and hints ----------
  var auto = null, autoCell = [], hintCell = -1;
  function* bruteForce(g) {
    var row = new Int16Array(9), col = new Int16Array(9), bx = new Int16Array(9), i, X = type === 2, d1 = 0, d2 = 0;
    for (i = 0; i < 81; i++) if (g[i]) {
      var b = 1 << (g[i] - 1), r0 = Math.floor(i / 9);
      if ((row[r0] | col[i % 9] | bx[reg[i]] | (X && onD1(i) ? d1 : 0) | (X && onD2(i) ? d2 : 0)) & b) return 'fail';                  // the current entries already contradict each other
      row[r0] |= b; col[i % 9] |= b; bx[reg[i]] |= b; if (X && onD1(i)) d1 |= b; if (X && onD2(i)) d2 |= b;
    }
    var stack = [];
    function put(c, d) { var b = 1 << (d - 1); g[c] = d; row[Math.floor(c / 9)] |= b; col[c % 9] |= b; bx[reg[c]] |= b; if (X && onD1(c)) d1 |= b; if (X && onD2(c)) d2 |= b; }
    function del(c) { var b = 1 << (g[c] - 1); row[Math.floor(c / 9)] &= ~b; col[c % 9] &= ~b; bx[reg[c]] &= ~b; if (X && onD1(c)) d1 &= ~b; if (X && onD2(c)) d2 &= ~b; g[c] = 0; }
    for (;;) {
      var best = -1, bm = 0, bc = 10, c, k;
      for (c = 0; c < 81; c++) if (!g[c]) { var m = ~(row[Math.floor(c / 9)] | col[c % 9] | bx[reg[c]] | (X && onD1(c) ? d1 : 0) | (X && onD2(c) ? d2 : 0)) & 511, n = pop(m); if (n < bc) { bc = n; best = c; bm = m; if (n <= 1) break; } }
      if (best < 0) return 'solved';
      if (bc > 0) {                                                                 // try the first possibility of this cell
        var ds = []; for (k = 0; k < 9; k++) if (bm & (1 << k)) ds.push(k + 1);
        stack.push({ c: best, ds: ds, i: 0 }); put(best, ds[0]); yield [best, ds[0]]; continue;
      }
      var moved = false;                                                            // dead end: undo and try the next possibility of the latest cell
      while (stack.length) {
        var f = stack[stack.length - 1]; del(f.c); yield [f.c, 0];
        if (++f.i < f.ds.length) { put(f.c, f.ds[f.i]); yield [f.c, f.ds[f.i]]; moved = true; break; }
        stack.pop();
      }
      if (!moved) return 'fail';                                                    // every possibility has been tried: nothing more can be solved
    }
  }
  function stopAuto(m) {
    if (auto) { clearInterval(auto.t); auto = null; }
    for (var i = 0; i < 81; i++) if (!vals[i]) autoCell[i] = 0;
    var a = document.querySelector('.menu-autosolve .mi-label'); if (a) a.textContent = '\u3000' + a.textContent.replace(/^[✓\u2713]\s*/, '').replace(/^\u3000/, '');
    if (m !== undefined) msg(m); render();
  }
  // Auto solve = human-style reasoning, one deduction per tick, with the reason shown: wrong entries are removed first, then naked singles (a cell with one candidate left),
  // then hidden singles (a digit that fits only one cell of a row / column / region / diagonal); when plain logic is stuck the cell taken out LAST when the puzzle was made
  // is filled first (the unique solution, in reverse order of the removal).
  function peerMaskOf(i) { var m = 0; for (var j = 0; j < 81; j++) if (vals[j] && j !== i && peer(i, j)) m |= 1 << (vals[j] - 1); return m; }
  function logicUnits() {
    var u = [], k, c;
    for (k = 0; k < 9; k++) { var rw = [], cl = [], rg2 = []; for (c = 0; c < 9; c++) { rw.push(k * 9 + c); cl.push(c * 9 + k); } for (c = 0; c < 81; c++) if (reg[c] === k) rg2.push(c); u.push({ cells: rw, name: T.unRow.replace('{n}', k + 1) }, { cells: cl, name: T.unCol.replace('{n}', k + 1) }, { cells: rg2, name: T.unBox }); }
    if (type === 2) { var a = [], b = []; for (c = 0; c < 9; c++) { a.push(c * 10); b.push((c + 1) * 8); } u.push({ cells: a, name: T.unD1 }, { cells: b, name: T.unD2 }); }
    return u;
  }
  function logicStep() {
    var i, d;
    for (i = 0; i < 81; i++) if (vals[i] && !given[i] && vals[i] !== sol[i]) return { c: i, d: 0, why: T.rmWrong + T.cellAt.replace('{r}', Math.floor(i / 9) + 1).replace('{c}', i % 9 + 1).replace(/: $/, '') };
    var at = function (c) { return T.cellAt.replace('{r}', Math.floor(c / 9) + 1).replace('{c}', c % 9 + 1); };
    var cand = []; for (i = 0; i < 81; i++) cand[i] = vals[i] ? 0 : (~peerMaskOf(i) & 511);
    for (i = 0; i < 81; i++) if (!vals[i] && pop(cand[i]) === 1) { for (d = 1; d <= 9; d++) if (cand[i] & (1 << (d - 1))) return { c: i, d: d, why: at(i) + T.byNaked.replace('{d}', d) }; }
    var units = logicUnits();
    for (var u = 0; u < units.length; u++) {
      var cs = units[u].cells, present = 0, k;
      for (k = 0; k < cs.length; k++) if (vals[cs[k]]) present |= 1 << (vals[cs[k]] - 1);
      for (d = 1; d <= 9; d++) { if (present & (1 << (d - 1))) continue; var only = -1, n = 0; for (k = 0; k < cs.length; k++) if (!vals[cs[k]] && (cand[cs[k]] & (1 << (d - 1)))) { n++; only = cs[k]; } if (n === 1) return { c: only, d: d, why: at(only) + T.byHidden.replace('{u}', units[u].name).replace('{d}', d) }; }
    }
    for (var q = remOrder.length - 1; q >= 0; q--) { var c = remOrder[q]; if (!vals[c]) return { c: c, d: sol[c], why: at(c) + T.byUnique.replace('{d}', sol[c]) }; }
    for (i = 0; i < 81; i++) if (!vals[i]) return { c: i, d: sol[i], why: at(i) + T.byUnique.replace('{d}', sol[i]) };
    return null;
  }
  window.toggleAuto = function () {
    if (auto) { stopAuto(T.stopped); return; }
    if (solved) return;
    closeNote();
    var a = document.querySelector('.menu-autosolve .mi-label'); if (a) a.textContent = '✓ ' + a.textContent.replace(/^[✓\u2713]\s*/, '').replace(/^\u3000/, '');
    msg(T.solving);
    auto = { t: setInterval(function () {
      var s = logicStep();
      if (!s) { stopAuto(solved ? '' : T.stuck); return; }
      vals[s.c] = s.d; notes[s.c] = []; autoCell[s.c] = s.d ? 1 : 0; sel = s.c; msg(s.why); render();
      if (solved) stopAuto('');
    }, 700) };
  };
  window.giveHint = function () {
    if (solved || auto) return;
    var i, wrong = -1;
    for (i = 0; i < 81; i++) if (vals[i] && vals[i] !== sol[i]) { wrong = i; break; }
    if (sel >= 0 && vals[sel] && vals[sel] !== sol[sel] && !given[sel]) wrong = sel;                   // the selected cell first if it is wrong
    if (wrong >= 0) { sel = wrong; hintCell = wrong; vals[wrong] = sol[wrong]; notes[wrong] = []; msg(T.fixed + sol[wrong]); render(); return; }       // wrong entries are corrected first, one per hint
    var bestC = -1, bestN = 10;                                                     // the empty cell with the fewest candidates = the easiest deduction
    for (i = 0; i < 81; i++) if (!vals[i]) {
      var m = 0; for (var j = 0; j < 81; j++) if (vals[j] && j !== i && peer(i, j)) m |= 1 << (vals[j] - 1);
      var n = 9 - pop(m); if (n < bestN) { bestN = n; bestC = i; }
    }
    if (bestC < 0) { msg(T.full); return; }
    sel = bestC; hintCell = bestC; vals[bestC] = sol[bestC]; notes[bestC] = []; msg(T.hintMsg + sol[bestC]); render();
  };

  // ---------- game flow ----------
  function markMenu() {
    ['ty0', 'ty1', 'ty2', 'df0', 'df1', 'df2'].forEach(function (c) {
      var a = document.querySelector('.' + c + ' a'); if (!a) return;
      var on = c === 'ty' + type || c === 'df' + diff;
      a.textContent = (on ? '✓ ' : '　') + a.textContent.replace(/^[✓✓]\s*/, '').replace(/^　/, '');
    });
    document.getElementById('info').textContent = T.types[type] + ' · ' + T.diffs[diff];
  }
  window.newGame = function () {
    clearInterval(tm); solved = false; closeNote(); msg(T.making); if (auto) { clearInterval(auto.t); auto = null; } autoCell = []; hintCell = -1;
    setTimeout(function () {
      var puz = generate();
      vals = new Int8Array(puz); given = new Uint8Array(81); notes = [];
      for (var i = 0; i < 81; i++) { given[i] = puz[i] ? 1 : 0; notes.push([]); }
      sel = -1; secs = 0; document.getElementById('timer').textContent = '00:00'; layoutSize(); buildBoard(); markMenu(); msg(''); render();
      tm = setInterval(tick, 1000);
    }, 20);
  };
  window.setType = function (t) { type = t; try { localStorage.setItem('sudoku_type', t); } catch (e) {} newGame(); };
  window.setDiff = function (d) { diff = d; try { localStorage.setItem('sudoku_diff', d); } catch (e) {} newGame(); };

  document.addEventListener('keydown', function (e) {
    if (/^[1-9]$/.test(e.key)) { fill(+e.key); return; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); eraseCell(); return; }
    if (e.key === 'F2') { e.preventDefault(); newGame(); return; }
    if (e.key === 'F3') { e.preventDefault(); toggleAuto(); return; }
    if (e.key === 'F4') { e.preventDefault(); giveHint(); return; }
    var dm = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key];
    if (dm) { e.preventDefault(); var n = sel < 0 ? 40 : sel + dm; if (n >= 0 && n < 81 && !(dm === -1 && sel % 9 === 0) && !(dm === 1 && sel % 9 === 8)) select(n); }
    if (e.key === 'Escape') closeNote();
  });
  window.addEventListener('resize', layoutSize);

  function closeMenus() {
    var mb = $('.menu-bar'); try { mb.menubar('collapseAll'); } catch (e) {}
    mb.find('.ui-state-open').removeClass('ui-state-open'); mb.find('> li').removeClass('ui-state-active ui-state-hover ui-state-focus');
    mb.find('.menu').hide().attr('aria-hidden', 'true').attr('aria-expanded', 'false');
  }
  window.runMenu = function (fn) { closeMenus(); setTimeout(fn, 0); return false; };
  $(function () {
    if ($('.menu-bar').length) $('.menu-bar').menubar();
    $('.window').draggable({ handle: '.title' });
    $('#mainwin .title-button.minimize').on('click', function () { $('#mainwin').hide(); });
    $('#mainwin .title-button.close').on('click', function () { $('#mainwin').css('visibility', 'hidden'); });
  });
  newGame();
})();
