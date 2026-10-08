/* Nonogram shared game controller + page chrome (used by the 2D and the 3D page). */
(function (g) {
  'use strict';
  var KO = /^ko/i.test(navigator.language || 'ko');
  var S = {
    time: ['시간', 'Time'], best: ['최고', 'Best'], size: ['크기', 'Size'],
    fill: ['채우기', 'Fill'], cross: ['X 표시', 'Cross'], undo: ['되돌리기 (Ctrl+Z)', 'Undo (Ctrl+Z)'], redo: ['다시 (Ctrl+Y)', 'Redo (Ctrl+Y)'],
    check: ['오류 표시', 'Check'], checkT: ['규칙에 어긋난 줄을 빨갛게 표시', 'Mark lines that break their clue in red'], newg: ['새 게임', 'New game'],
    hint2: ['클릭 = 채우기, 오른쪽 클릭 / 길게 누르기 = X, 끌어서 한 번에 칠하기.', 'Click = fill, right-click / long-press = X, drag to paint a run.'],
    hint3: ['탭 = 채우기, 더블탭 / 오른쪽 클릭 = X, 끌면 회전, 층 슬라이더로 안쪽 칸까지.', 'Tap = fill, double-tap / right-click = X, drag to rotate, layer slider reaches inner cells.'],
    win: ['완성! 기록', 'Solved! Time'], newbest: ['새 최고 기록!', 'New best!'], cheated: ['(치트 사용: 기록 안 됨)', '(cheat used: not recorded)'],
    fixed: ['잘못 표시한 칸 하나를 고쳤습니다.', 'Fixed one wrong mark.'], removed: ['잘못 표시한 칸을 지웠습니다.', 'Removed the wrong marks.'],
    line: ['줄', 'line'], row: ['행', 'Row'], col: ['열', 'Column'], gen: ['퍼즐을 만드는 중...', 'Generating...'],
    cut: ['층 자르기', 'Layer cut'], axis: ['축', 'Axis'], none: ['없음', 'off'],
    zero: ['단서 0 => 모두 빈칸', 'clue 0 => every cell is empty'],
    full: ['단서가 줄을 꽉 채움 (%S + 빈칸 %G = %N) => 위치 확정', 'the clue fills the line exactly (%S + %G gaps = %N) => the pattern is fixed'],
    done: ['단서를 이미 다 채움 => 나머지는 빈칸', 'all runs are already placed => the rest is empty'],
    ovl1: ['가장 앞/뒤 배치가 겹치는 칸 => 반드시 채움', 'the leftmost and rightmost placements overlap here => filled'],
    ovl0: ['어떤 배치로도 닿지 않는 칸 => 빈칸', 'no placement of the runs reaches this cell => empty'],
    log1: ['알려진 칸과 단서를 맞추면 이 칸은 항상 채워짐', 'with the known cells every valid placement covers it => filled'],
    log0: ['알려진 칸과 단서를 맞추면 이 칸은 항상 빈칸', 'with the known cells no valid placement covers it => empty'],
    custom: ['사용자 지정...', 'Custom...'], cdT: ['사용자 지정 크기', 'Custom size'], wid: ['가로', 'Width'], hei: ['세로', 'Height'], dep: ['높이', 'Depth'], ok: ['확인', 'OK'], cancel: ['취소', 'Cancel'],
    range: ['허용 범위는 %A~%B 입니다. 값을 조정했으니 다시 확인을 누르세요.', 'Allowed range is %A to %B. The values were adjusted: press OK again.'], making: ['퍼즐을 만드는 중...', 'Making puzzle...'],
    batch: ['칸 %K개 확정', '%K cells settled'], done2: ['모두 풀었습니다.', 'All solved.']
  };
  function t(k) { var e = S[k]; return e ? e[KO ? 0 : 1] : k; }

  function fmtTime(ms) { var s = Math.floor(ms / 1000), m = Math.floor(s / 60); s %= 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

  var lineName;
  lineName = function (L, li) {
    var ln = L.lines[li], p = ln.pos;
    if (L.dim === 2) return (ln.axis === 0 ? t('row') : t('col')) + ' ' + (p[0] + 1);
    var an = ['X', 'Y', 'Z'], other = [0, 1, 2].filter(function (a) { return a !== ln.axis; });
    return an[ln.axis] + (KO ? '축 줄 ' : '-line ') + '(' + an[other[0]] + '=' + (p[0] + 1) + ', ' + an[other[1]] + '=' + (p[1] + 1) + ')';
  };

  function explain(L, step, val) {
    var clue = step.clue, n = L.lines[step.li].cells.length, sum = 0, i; for (i = 0; i < clue.length; i++) sum += clue[i];
    var head = lineName(L, step.li) + ' [' + (clue.length ? clue.join(' ') : '0') + ']: ';
    var body;
    switch (step.type) {
      case 'zero': body = t('zero'); break;
      case 'full': body = t('full').replace('%S', sum).replace('%G', clue.length - 1).replace('%N', n); break;
      case 'done': body = t('done'); break;
      case 'overlap': body = val === 1 ? t('ovl1') : t('ovl0'); break;
      default: body = val === 1 ? t('log1') : t('log0');
    }
    return head + body;
  }

  /* ---------- controller ---------- */
  function Controller(cfg) {
    var C = this;
    C.dim = cfg.dim; C.sizes = cfg.sizes; C.dims = NG.normDims(cfg.dim, cfg.def); C.custom = false; C.maxDim = cfg.dim === 3 ? 8 : 30; C.defCustom = cfg.dim === 3 ? [4, 4, 4] : [12, 12]; C.autoMs = cfg.autoMs || 200;
    C.marks = null; C.sol = null; C.clues = null; C.L = null;
    C.mode = 1;               // 1 = fill, 2 = cross
    C.check = false; C.won = false; C.cheated = false; C.auto = false;
    C.satLine = []; C.badLine = []; C.hl = null;
    C.undoS = []; C.redoS = []; C.stroke = null;
    C.t0 = 0; C.elapsed = 0; C.running = false; C.winAt = 0; C.genMs = 0; C.hints = 0;
    C.onRedraw = function () {}; C.onNew = function () {}; C.onWin = function () {};
    var timerEl = null, bestEl = null, statusEl = null, autoTimer = 0, hlTimer = 0;
    C.setEls = function (e) { timerEl = e.timer; bestEl = e.best; statusEl = e.status; };

    C.sizeKey = function () { return C.dims.join('x'); };
    C.bestKey = function () { return 'nonogram_best_' + C.dim + 'd_' + C.sizeKey(); };
    C.getBest = function () { var v = parseInt(store(C.bestKey()), 10); return v > 0 ? v : 0; };
    C.updateBest = function () { if (bestEl) { var b = C.getBest(); bestEl.textContent = t('best') + ' ' + (b ? fmtTime(b) : '--:--'); } };
    C.status = function (txt, cls) { if (!statusEl) return; statusEl.textContent = txt || t(C.dim === 3 ? 'hint3' : 'hint2'); statusEl.className = 'status' + (cls ? ' ' + cls : ''); };
    C.curTime = function () { return C.running ? C.elapsed + (performance.now() - C.t0) : C.elapsed; };
    setInterval(function () { if (timerEl) timerEl.textContent = fmtTime(C.curTime()); }, 200);

    C.newGame = function (spec, seed) {
      if (typeof spec === 'number' && spec) { C.dims = NG.normDims(C.dim, spec); C.custom = false; }
      else if (spec && spec.length) { C.dims = spec.slice(0, C.dim); C.custom = true; NGC.store('nonogram_custom_' + C.dim + 'd', JSON.stringify(C.dims)); }
      C.stopAuto();
      var rng = seed !== undefined ? NG.mulberry(seed) : undefined;
      var r = NG.generate(C.dim, C.dims, { rng: rng });
      C.L = NG.mkLines(C.dim, C.dims); C.sol = r.sol; C.clues = r.clues; C.genMs = r.ms; C.genTries = r.tries;
      C.marks = new Int8Array(C.L.total);
      C.won = false; C.cheated = false; C.hints = 0; C.undoS = []; C.redoS = []; C.stroke = null; C.hl = null;
      C.elapsed = 0; C.running = false; C.t0 = 0; C.winAt = 0;
      C.recompute(); C.updateBest(); C.status('');
      if (timerEl) timerEl.textContent = '00:00';
      C.onNew(); C.onRedraw(); C.syncUI && C.syncUI();
    };

    C.recompute = function () {
      var L = C.L, vals = new Int8Array(L.total), i;
      for (i = 0; i < L.total; i++) vals[i] = C.marks[i] === 1 ? 1 : 0;
      var all = true;
      for (var li = 0; li < L.lines.length; li++) {
        var s = NG.sameClue(NG.runsOf(vals, L.lines[li].cells), C.clues[li]);
        C.satLine[li] = s; if (!s) all = false;
        C.badLine[li] = C.check ? NG.lineBad(L, li, C.clues[li], C.marks) : false;
      }
      return all;
    };

    C.begin = function () { if (!C.stroke) C.stroke = []; };
    C.set = function (i, v) {
      if (C.won || C.marks[i] === v) return false;
      if (!C.running) { C.running = true; C.t0 = performance.now(); }
      if (!C.stroke) C.stroke = [];
      C.stroke.push({ i: i, o: C.marks[i], n: v }); C.marks[i] = v; return true;
    };
    C.end = function () {
      var s = C.stroke; C.stroke = null;
      if (s && s.length) { C.undoS.push(s); C.redoS = []; }
      C.refresh(); return !!(s && s.length);
    };
    C.refresh = function () {
      C.hl = null;
      var all = C.recompute();
      if (all && !C.won) C.win();
      C.syncUI && C.syncUI(); C.onRedraw();
    };
    C.win = function () {
      C.won = true; C.elapsed = C.curTime(); C.running = false; C.winAt = performance.now(); C.stopAuto(); C.hl = null;
      var msg = t('win') + ' ' + fmtTime(C.elapsed), best = C.getBest();
      if (C.cheated) msg += '  ' + t('cheated');
      else if (!best || C.elapsed < best) { store(C.bestKey(), String(Math.round(C.elapsed))); msg += '  ' + t('newbest'); }
      C.updateBest(); C.status(msg, 'win'); C.onWin();
    };
    function apply(list, key) {
      var s = list.pop(); if (!s) return false;
      var inv = [];
      for (var k = s.length - 1; k >= 0; k--) { var c = s[k]; C.marks[c.i] = key === 'o' ? c.o : c.n; inv.push(c); }
      (key === 'o' ? C.redoS : C.undoS).push(s);
      C.refresh(); return true;
    }
    C.undo = function () { if (C.won) return false; return apply(C.undoS, 'o'); };
    C.redo = function () { if (C.won) return false; return apply(C.redoS, 'n'); };
    C.setMode = function (m) { C.mode = m; C.syncUI && C.syncUI(); };
    C.setCheck = function (on) { C.check = !!on; C.recompute(); C.syncUI && C.syncUI(); C.onRedraw(); };

    C.wrongCells = function () {
      var w = [];
      for (var i = 0; i < C.L.total; i++) if ((C.marks[i] === 1 && !C.sol[i]) || (C.marks[i] === 2 && C.sol[i])) w.push(i);
      return w;
    };
    C.stateFromMarks = function () {
      var st = new Int8Array(C.L.total);
      for (var i = 0; i < st.length; i++) st[i] = C.marks[i] === 1 ? 1 : C.marks[i] === 2 ? 0 : -1;
      return st;
    };
    C.setHl = function (li, cells, target, ms) {
      C.hl = { li: li, cells: cells, target: target, keep: true };
      clearTimeout(hlTimer); hlTimer = setTimeout(function () { C.hl = null; C.onRedraw(); }, ms || 4500);
    };
    /* one logical step. mode 'hint' = exactly one cell; 'auto' = one line batch (wrong marks are cleared first).
       returns {kind, cells:[...], msg} or null when nothing to do */
    C.step = function (mode) {
      if (C.won) return null;
      var wrong = C.wrongCells();
      C.begin();
      if (wrong.length) {
        var res;
        if (mode === 'hint') {
          var w = wrong[0]; C.set(w, C.sol[w] ? 1 : 2);
          res = { kind: 'fix', cells: [w], msg: t('fixed') };
        } else {
          wrong.forEach(function (w) { C.set(w, 0); });
          res = { kind: 'clear', cells: wrong, msg: t('removed') };
        }
        C.cheated = true; C.end();
        C.setHl(-1, res.cells, res.cells[0]); C.status(res.msg, 'hint');
        return res;
      }
      var st = C.stateFromMarks(), step = NG.findStep(C.L, C.clues, st);
      if (!step || step.contradiction) { C.stroke = null; return null; }
      C.cheated = true;
      var chs = mode === 'hint' ? [step.changes[0]] : step.changes;
      chs.forEach(function (c) { C.set(c[0], c[1] === 1 ? 1 : 2); });
      var first = chs[0], msg = explain(C.L, step, first[1]);
      if (mode !== 'hint' && chs.length > 1) msg += '  (' + t('batch').replace('%K', chs.length) + ')';
      C.hints++;
      C.end();
      if (!C.won) { C.setHl(step.li, C.L.lines[step.li].cells.slice(), first[0]); C.status(msg, 'hint'); }
      return { kind: 'step', cells: chs.map(function (c) { return c[0]; }), li: step.li, type: step.type, msg: msg };
    };
    C.giveHint = function () {
      if (C.won) return;
      C.step('hint');
    };
    C.stopAuto = function () { clearTimeout(autoTimer); autoTimer = 0; if (C.auto) { C.auto = false; C.reportAuto(); } };
    C.reportAuto = function () {
      try { if (window.parent !== window && window.parent.markAuto) window.parent.markAuto(C.auto); } catch (e) { try { window.parent.postMessage({ ng: 'autoState', on: C.auto }, '*'); } catch (e2) {} }
    };
    C.toggleAuto = function () {
      if (C.auto) { C.stopAuto(); return false; }
      if (C.won || !C.marks) C.newGame();
      C.auto = true; C.reportAuto();
      var tick = function () {
        autoTimer = 0;
        if (!C.auto) return;
        if (C.won) { C.stopAuto(); return; }
        var r = C.step('auto');
        if (!r) { C.stopAuto(); return; }
        if (C.won) { C.stopAuto(); return; }
        autoTimer = setTimeout(tick, C.autoMs);
      };
      autoTimer = setTimeout(tick, 60);
      return true;
    };
  }

  /* ---------- page chrome ---------- */
  function buildChrome(C, opts) {
    var root = document.createElement('div'); root.id = 'ng';
    root.innerHTML =
      '<div class="top">' +
      '<span class="chip timer" id="timer">00:00</span><span class="chip" id="best"></span>' +
      '<select id="size" class="ctl" title="' + t('size') + '"></select><span class="sp"></span>' +
      '<button type="button" id="bMode" class="btn mode"><i class="sw"></i><span></span></button>' +
      '<span style="white-space:nowrap"><button type="button" id="bUndo" class="btn" title="' + t('undo') + '">&#8630;</button> ' +
      '<button type="button" id="bRedo" class="btn" title="' + t('redo') + '">&#8631;</button></span>' +
      '<label class="chk" title="' + t('checkT') + '"><input type="checkbox" id="chkCheck"><span>' + t('check') + '</span></label>' +
      '<button type="button" id="bNew" class="btn primary">' + t('newg') + '</button></div>' +
      '<div class="stage" id="stage"><canvas id="cv"></canvas></div>' +
      (opts.slice ? '<div class="slice" id="sliceBar"></div>' : '') +
      '<div class="status" id="status"></div>';
    document.body.appendChild(root);
    var $ = function (id) { return document.getElementById(id); };
    var sel = $('size');
    C.sizes.forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = sizeLabel(NG.normDims(C.dim, n)); sel.appendChild(o); });
    var oc = document.createElement('option'); oc.value = 'c'; oc.textContent = t('custom'); sel.appendChild(oc);
    sel.value = C.custom ? 'c' : C.dims[0];
    sel.onchange = function () { var v = sel.value; sel.blur(); if (v === 'c') C.openCustom(); else C.newGame(parseInt(v, 10)); };
    // custom size dialog (Win98 look)
    var names = C.dim === 3 ? ['wid', 'hei', 'dep'] : ['wid', 'hei'];
    var dlg = document.createElement('div'); dlg.className = 'dlgwrap'; dlg.style.display = 'none';
    dlg.innerHTML = '<div class="w98"><div class="tb"><span>' + t('cdT') + '</span></div><div class="bd">' +
      names.map(function (k, i) { return '<label class="row"><span>' + t(k) + '</span><input type="number" inputmode="numeric" id="cd' + i + '" min="2" max="' + C.maxDim + '"></label>'; }).join('') +
      '<div class="msg" id="cdMsg"></div><div class="bt"><button type="button" id="cdOk">' + t('ok') + '</button><button type="button" id="cdCancel">' + t('cancel') + '</button></div></div></div>';
    document.body.appendChild(dlg);
    C.openCustom = function () {
      var d = C.custom ? C.dims : readCustom();
      names.forEach(function (k, i) { $('cd' + i).value = d[i]; }); $('cdMsg').textContent = '';
      dlg.style.display = 'flex'; $('cd0').focus(); $('cd0').select();
    };
    function readCustom() { try { var v = JSON.parse(NGC.store('nonogram_custom_' + C.dim + 'd')); if (v && v.length === C.dim) return v; } catch (e) {} return C.defCustom; }
    function closeDlg() { dlg.style.display = 'none'; C.syncUI(); }
    $('cdCancel').onclick = closeDlg;
    $('cdOk').onclick = function () {
      var vals = [], bad = false;
      names.forEach(function (k, i) { var v = parseInt($('cd' + i).value, 10); if (isNaN(v)) { v = C.defCustom[i]; bad = true; } if (v < 2) { v = 2; bad = true; } if (v > C.maxDim) { v = C.maxDim; bad = true; } vals.push(v); $('cd' + i).value = v; });
      if (bad) { $('cdMsg').textContent = t('range').replace('%A', 2).replace('%B', C.maxDim); return; }
      dlg.style.display = 'none'; C.newGame(vals);
    };
    dlg.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('cdOk').click(); } else if (e.key === 'Escape') { e.preventDefault(); closeDlg(); } });
    window.openCustom = function () { C.openCustom(); };
    function sizeLabel(d) { return d.join('\u00d7'); }
    $('bNew').onclick = function () { C.newGame(); };
    $('bMode').onclick = function () { C.setMode(C.mode === 1 ? 2 : 1); };
    $('bUndo').onclick = function () { C.undo(); };
    $('bRedo').onclick = function () { C.redo(); };
    $('chkCheck').onchange = function () { C.setCheck(this.checked); };
    C.setEls({ timer: $('timer'), best: $('best'), status: $('status') });
    C.syncUI = function () {
      var m = $('bMode'); m.className = 'btn mode' + (C.mode === 2 ? ' cross' : ''); m.lastChild.textContent = t(C.mode === 2 ? 'cross' : 'fill');
      $('bUndo').disabled = !C.undoS.length || C.won; $('bRedo').disabled = !C.redoS.length || C.won;
      sel.value = C.custom ? 'c' : String(C.dims[0]); oc.textContent = C.custom ? t('custom').replace('...', '') + ' ' + sizeLabel(C.dims) : t('custom'); $('chkCheck').checked = C.check;
    };
    document.addEventListener('keydown', function (e) {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      var k = e.key;
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) C.redo(); else C.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); C.redo(); return; }
      if (k === 'x' || k === 'X') { C.setMode(C.mode === 1 ? 2 : 1); return; }
      // the shell forwards F2..F4 itself (handling them here too would toggle twice)
      var embedded = false; try { embedded = window.parent !== window && !!window.parent.markAuto; } catch (er) {}
      if (embedded) return;
      if (k === 'F2') { e.preventDefault(); C.newGame(); } else if (k === 'F3') { e.preventDefault(); C.toggleAuto(); } else if (k === 'F4') { e.preventDefault(); C.giveHint(); }
    });
    // fallback commands from a cross-origin shell
    window.addEventListener('message', function (e) {
      var m = e.data; if (!m || !m.ngCmd) return;
      if (m.ngCmd === 'newGame') C.newGame(); else if (m.ngCmd === 'giveHint') C.giveHint(); else if (m.ngCmd === 'toggleAuto') C.toggleAuto(); else if (m.ngCmd === 'setSize') C.newGame(m.v); else if (m.ngCmd === 'openCustomSize') C.openCustom();
    });
    // functions the shell calls
    window.newGame = function () { C.newGame(); };
    window.giveHint = function () { C.giveHint(); };
    window.toggleAuto = function () { return C.toggleAuto(); };
    window.getSize = function () { return C.custom ? 'custom' : String(C.dims[0]); };
    window.getDims = function () { return C.dims.slice(); };
    window.setSize = function (n) { C.newGame(n); };
    window.openCustomSize = function () { C.openCustom(); };
    window.getAuto = function () { return C.auto; };
    // canvas sizing
    var stage = $('stage'), cv = $('cv');
    function fit() {
      var r = stage.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      var w = Math.max(50, Math.round(r.width)), h = Math.max(50, Math.round(r.height));
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      C.view = { w: w, h: h, dpr: dpr }; C.onRedraw();
    }
    if (window.ResizeObserver) new ResizeObserver(fit).observe(stage); window.addEventListener('resize', fit);
    return { cv: cv, stage: stage, fit: fit, $: $ };
  }

  function parseSize(C, str) { // '5', '12x8', '4x5x6' -> {dims, custom} or null
    if (!str) return null;
    var p = String(str).split(/x/i).map(function (v) { return parseInt(v, 10); });
    if (!p.length || p.some(function (v) { return isNaN(v); })) return null;
    if (p.length === 1 && C.sizes.indexOf(p[0]) >= 0) return { dims: NG.normDims(C.dim, p[0]), custom: false };
    if (p.length === 1) p = NG.normDims(C.dim, p[0]);
    if (p.length !== C.dim) return null;
    return { dims: p.map(function (v) { return Math.max(2, Math.min(C.maxDim, v)); }), custom: true };
  }
  function initSize(C, key) {
    var st = null; try { st = JSON.parse(store('nonogram_size_' + key)); } catch (e) {}
    if (st && st.d && st.d.length === C.dim) { var r = parseSize(C, st.d.join('x')); if (r) { C.dims = r.dims; C.custom = !!st.c && r.custom; if (!st.c && C.sizes.indexOf(r.dims[0]) >= 0) C.custom = false; } }
    var q = parseSize(C, new URLSearchParams(location.search).get('n')); if (q) { C.dims = q.dims; C.custom = q.custom; }
  }
  function saveSize(C, key) { store('nonogram_size_' + key, JSON.stringify({ d: C.dims, c: C.custom })); }
  g.NGC = { initSize: initSize, saveSize: saveSize, KO: KO, t: t, S: S, fmtTime: fmtTime, store: store, lineName: lineName, explain: explain, Controller: Controller, buildChrome: buildChrome };
})(window);
