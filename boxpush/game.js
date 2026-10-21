// Box Push page: canvas drawing, keyboard / swipe / tap-to-walk input, auto-solve and hint on top of core.js.
(function () {
  'use strict';
  var B = window.BoxPush, KO = /^ko/i.test(navigator.language || 'ko');
  var TX = KO ? { level: '레벨', moves: '이동', pushes: '밀기', clear: '클리어!', next: 'Enter / 클릭: 다음 레벨', best: '최소', solving: '푸는 중...', fail: '해답을 찾지 못했습니다', hint: '힌트' }
    : { level: 'Level', moves: 'Moves', pushes: 'Pushes', clear: 'Solved!', next: 'Enter / click: next level', best: 'Best', solving: 'Solving...', fail: 'No solution found', hint: 'Hint' };
  var cv = document.getElementById('cv'), ctx = cv.getContext('2d'), dpr = 1, CW = 0, CH = 0;
  var lv = 1, variant = 0, L = null, P = null, won = false, queue = [], qTimer = 0, autoOn = false, busy = false, msg = '', msgT = 0, hint = null, hintT = 0, face = 1;
  try { lv = Math.max(1, +localStorage.getItem('boxpush_lv') || 1); } catch (e) {}
  function save() { try { localStorage.setItem('boxpush_lv', String(lv)); } catch (e) {} }

  function load(newVariant) {
    if (newVariant !== undefined) variant = newVariant;
    L = B.level(lv, variant); P = B.newPlay(L); won = false; queue = []; hint = null; msg = ''; face = 1; save();
    draw();
    if (autoOn) setTimeout(function () { if (autoOn && !won) runAuto(); }, 700);
  }
  function setMsg(t, ms) { msg = t; msgT = Date.now() + (ms || 2500); }

  /* ---------- drawing ---------- */
  var HUD = 30, tile = 32, ox = 0, oy = 0;
  function layout() {
    var w = cv.clientWidth, h = cv.clientHeight; dpr = window.devicePixelRatio || 1;
    CW = w; CH = h; cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    draw();
  }
  function cellXY(c) { return [ox + (c % L.w) * tile, oy + ((c / L.w) | 0) * tile]; }
  function drawFloor(x, y, t, c) { ctx.fillStyle = ((c % L.w) + ((c / L.w) | 0)) & 1 ? '#e6d8b0' : '#ebdfbb'; ctx.fillRect(x, y, t, t); }
  function drawWall(x, y, t) {
    ctx.fillStyle = '#7a4a30'; ctx.fillRect(x, y, t, t);
    ctx.strokeStyle = '#4d2c1b'; ctx.lineWidth = Math.max(1, t / 16); ctx.beginPath();
    for (var r = 1; r < 3; r++) { ctx.moveTo(x, y + r * t / 3); ctx.lineTo(x + t, y + r * t / 3); }
    ctx.moveTo(x + t / 2, y); ctx.lineTo(x + t / 2, y + t / 3); ctx.moveTo(x + t / 4, y + t / 3); ctx.lineTo(x + t / 4, y + 2 * t / 3); ctx.moveTo(x + 3 * t / 4, y + t / 3); ctx.lineTo(x + 3 * t / 4, y + 2 * t / 3);
    ctx.moveTo(x + t / 2, y + 2 * t / 3); ctx.lineTo(x + t / 2, y + t); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, t, Math.max(1, t / 14));
  }
  function drawGoal(x, y, t) {
    ctx.fillStyle = '#d6453a'; ctx.beginPath(); ctx.arc(x + t / 2, y + t / 2, t * 0.17, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(214,69,58,.5)'; ctx.lineWidth = Math.max(1, t / 14); ctx.beginPath(); ctx.arc(x + t / 2, y + t / 2, t * 0.3, 0, 7); ctx.stroke();
  }
  function drawBox(x, y, t, on) {
    var m = t * 0.08, w = t - 2 * m;
    ctx.fillStyle = on ? '#6fb35a' : '#c8893a'; ctx.fillRect(x + m, y + m, w, w);
    ctx.strokeStyle = on ? '#3d7a30' : '#7a4c14'; ctx.lineWidth = Math.max(1.5, t / 11); ctx.strokeRect(x + m + 1, y + m + 1, w - 2, w - 2);
    ctx.lineWidth = Math.max(1, t / 14); ctx.beginPath(); ctx.moveTo(x + m + 3, y + m + 3); ctx.lineTo(x + m + w - 3, y + m + w - 3); ctx.moveTo(x + m + w - 3, y + m + 3); ctx.lineTo(x + m + 3, y + m + w - 3); ctx.stroke();
  }
  function drawPlayer(x, y, t) {
    var cx = x + t / 2, cy = y + t / 2, r = t * 0.36;
    ctx.fillStyle = '#2f6fd0'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#1b3f80'; ctx.lineWidth = Math.max(1.5, t / 12); ctx.stroke();
    ctx.fillStyle = '#fff'; var ex = face * r * 0.28;
    ctx.beginPath(); ctx.arc(cx + ex - r * 0.28, cy - r * 0.15, r * 0.2, 0, 7); ctx.arc(cx + ex + r * 0.28, cy - r * 0.15, r * 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#10264f'; ctx.beginPath(); ctx.arc(cx + ex - r * 0.28 + face * r * 0.07, cy - r * 0.15, r * 0.09, 0, 7); ctx.arc(cx + ex + r * 0.28 + face * r * 0.07, cy - r * 0.15, r * 0.09, 0, 7); ctx.fill();
  }
  function text(str, x, y, size, color, align) { ctx.font = 'bold ' + size + 'px system-ui, "Malgun Gothic", sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(str, x, y); }
  function draw() {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2b2118'; ctx.fillRect(0, 0, CW, CH);
    tile = Math.max(8, Math.floor(Math.min((CW - 8) / L.w, (CH - HUD - 8) / L.h)));
    ox = Math.floor((CW - tile * L.w) / 2); oy = HUD + Math.floor((CH - HUD - tile * L.h) / 2);
    var c, p;
    for (c = 0; c < L.w * L.h; c++) {
      p = cellXY(c);
      if (L.wall[c]) drawWall(p[0], p[1], tile); else { drawFloor(p[0], p[1], tile, c); }
    }
    for (c = 0; c < L.goals.length; c++) { p = cellXY(L.goals[c]); drawGoal(p[0], p[1], tile); }
    if (hint && hintT > Date.now()) {
      var hb = cellXY(hint.box), hd = cellXY(hint.dest);
      ctx.strokeStyle = '#3f6'; ctx.lineWidth = Math.max(2, tile / 8);
      ctx.strokeRect(hb[0] + 2, hb[1] + 2, tile - 4, tile - 4); ctx.strokeRect(hd[0] + 2, hd[1] + 2, tile - 4, tile - 4);
      ctx.beginPath(); ctx.moveTo(hb[0] + tile / 2, hb[1] + tile / 2); ctx.lineTo(hd[0] + tile / 2, hd[1] + tile / 2); ctx.stroke();
    }
    for (c = 0; c < P.boxes.length; c++) { p = cellXY(P.boxes[c]); drawBox(p[0], p[1], tile, L.goals.indexOf(P.boxes[c]) >= 0); }
    p = cellXY(P.player); drawPlayer(p[0], p[1], tile);
    // HUD
    ctx.fillStyle = '#3a2d20'; ctx.fillRect(0, 0, CW, HUD);
    text(TX.level + ' ' + lv, 10, HUD / 2, 14, '#ffd98a');
    text(TX.moves + ' ' + P.moves + '   ' + TX.pushes + ' ' + P.pushes + (L.minPushes ? '   (' + TX.best + ' ' + L.minPushes + ')' : ''), CW - 10, HUD / 2, 12, '#e8dcc0', 'right');
    if (autoOn) text('AUTO', CW / 2, HUD / 2, 12, '#3f6', 'center');
    if (msg && msgT > Date.now()) text(msg, CW / 2, HUD + 16, 13, '#ffe08a', 'center');
    if (won) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, HUD, CW, CH - HUD);
      text(TX.clear, CW / 2, CH / 2 - 10, Math.min(40, CW / 8), '#ffd23c', 'center'); text(TX.next, CW / 2, CH / 2 + 24, 14, '#fff', 'center');
    }
  }

  /* ---------- play ---------- */
  function step(d) {
    if (won || busy) return false;
    var r = B.move(P, d);
    if (r) { if (d === 2) face = -1; else if (d === 3) face = 1; }
    if (r && B.solved(P)) { won = true; queue = []; hint = null; setTimeout(function () { if (autoOn && won) nextLevel(); }, 1300); }
    draw();
    return !!r;
  }
  function stopQueue() { queue = []; clearInterval(qTimer); qTimer = 0; }
  function runQueue(ms) {
    clearInterval(qTimer);
    qTimer = setInterval(function () {
      if (!queue.length) { clearInterval(qTimer); qTimer = 0; return; }
      var d = queue.shift(); if (!step(d)) stopQueue();
    }, ms);
  }
  function undo() { stopQueue(); if (won) return; if (B.undo(P)) draw(); }
  function restart() { stopQueue(); P = B.newPlay(L); won = false; hint = null; draw(); }
  function nextLevel() { stopQueue(); lv++; load(0); }
  function prevLevel() { stopQueue(); if (lv > 1) { lv--; load(0); } }
  function newGame() { stopQueue(); variant++; load(variant); }
  function solveNow(cb) {
    busy = true; setMsg(TX.solving, 8000); draw();
    setTimeout(function () {
      var sol = B.solve(L, P.boxes, P.player, 4000);
      if (!sol && P.moves === 0 && L.solution) sol = L.solution;
      busy = false; msg = ''; draw();
      cb(sol);
    }, 30);
  }
  function runAuto() {
    if (!autoOn || won) return;
    solveNow(function (sol) {
      if (!autoOn) return;
      if (!sol) { setMsg(TX.fail); autoOn = false; if (window.parent && window.parent.setAutoMark) window.parent.setAutoMark(false); return; }
      queue = sol.split('').map(function (ch) { return B.DL.indexOf(ch); }); runQueue(110);
    });
  }
  function giveHint() {
    if (won) return;
    solveNow(function (sol) {
      if (!sol) { setMsg(TX.fail); return; }
      var T = B.newPlay(L); T.boxes = P.boxes.slice(); T.player = P.player;
      for (var i = 0; i < sol.length; i++) {
        var d = B.DL.indexOf(sol[i]), nb = B.nb(L, T.player, d), bi = T.boxes.indexOf(nb);
        if (bi >= 0) { hint = { box: nb, dest: B.nb(L, nb, d) }; hintT = Date.now() + 3500; draw(); break; }
        B.move(T, d);
      }
    });
  }
  function toggleAuto() { autoOn = !autoOn; if (autoOn) runAuto(); else stopQueue(); draw(); return autoOn; }

  /* ---------- input ---------- */
  var KEYS = { ArrowUp: 0, KeyW: 0, ArrowDown: 1, KeyS: 1, ArrowLeft: 2, KeyA: 2, ArrowRight: 3, KeyD: 3 };
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
    if (e.code in KEYS) { e.preventDefault(); if (autoOn) { autoOn = false; stopQueue(); if (window.parent && window.parent.setAutoMark) window.parent.setAutoMark(false); } stopQueue(); step(KEYS[e.code]); }
    else if (e.code === 'KeyU' || e.code === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.code === 'KeyR') restart();
    else if (e.code === 'Enter' || e.code === 'KeyN') { if (won) nextLevel(); }
    else if (e.code === 'BracketLeft' || e.code === 'PageUp') prevLevel();
    else if (e.code === 'BracketRight' || e.code === 'PageDown') nextLevel();
  });
  var down = null;
  cv.addEventListener('pointerdown', function (e) { e.preventDefault(); if (won) { nextLevel(); return; } down = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
  cv.addEventListener('pointermove', function (e) {
    if (!down) return;
    var dx = e.clientX - down.sx, dy = e.clientY - down.sy, th = Math.max(18, tile * 0.7);
    if (Math.abs(dx) > th || Math.abs(dy) > th) { down.moved = true; stopQueue(); step(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 0 : 1)); down.sx = e.clientX; down.sy = e.clientY; }
  });
  cv.addEventListener('pointerup', function (e) {
    var d = down; down = null; if (!d || d.moved || won) return;
    var r = cv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left - ox) / tile), y = Math.floor((e.clientY - r.top - oy) / tile);
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return;
    var c = y * L.w + x, px = P.player % L.w, py = (P.player / L.w) | 0;
    if (Math.abs(px - x) + Math.abs(py - y) === 1) { stopQueue(); step(y < py ? 0 : y > py ? 1 : x < px ? 2 : 3); return; }
    var w = L.wall[c] || P.boxes.indexOf(c) >= 0 ? null : B.walk(L, P.boxes, P.player, c);
    if (w) { stopQueue(); queue = w.split('').map(function (ch) { return B.DL.indexOf(ch); }); runQueue(55); }
  });
  cv.addEventListener('pointercancel', function () { down = null; });

  /* ---------- exports (called by the shell) ---------- */
  window.newGame = newGame; window.restartLevel = restart; window.undoMove = undo; window.nextLevel = nextLevel; window.prevLevel = prevLevel;
  window.toggleAuto = toggleAuto; window.giveHint = giveHint;
  window.addEventListener('message', function (e) { var d = e.data; if (d && d.ngCmd && typeof window[d.ngCmd] === 'function') window[d.ngCmd](d.v); });
  window.__bp = { state: function () { return { lv: lv, won: won, moves: P.moves, pushes: P.pushes, boxes: P.boxes.slice(), player: P.player, L: L, auto: autoOn, busy: busy }; }, move: step, load: function (n) { lv = n; load(0); } };
  window.addEventListener('resize', layout);
  load(); layout();
  setInterval(function () { if (msg && msgT < Date.now() + 100 || (hint && hintT < Date.now() + 100)) draw(); }, 400);
})();
