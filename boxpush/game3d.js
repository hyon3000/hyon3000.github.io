// Box Push 3D page: the same rules in a 3D lattice (z = height, six push directions), software projection with Canvas2D (painter's algorithm), drag to rotate the view.
(function () {
  'use strict';
  var B = window.BoxPush, KO = /^ko/i.test(navigator.language || 'ko');
  var TX = KO ? { level: '레벨', moves: '이동', pushes: '밀기', layer: '층', clear: '클리어!', next: 'Enter / 클릭: 다음 레벨', best: '최소', solving: '푸는 중...', fail: '해답을 찾지 못했습니다', rot: '드래그: 시점 회전' }
    : { level: 'Level', moves: 'Moves', pushes: 'Pushes', layer: 'Layer', clear: 'Solved!', next: 'Enter / click: next level', best: 'Best', solving: 'Solving...', fail: 'No solution found', rot: 'Drag: rotate view' };
  var cv = document.getElementById('cv'), ctx = cv.getContext('2d'), dpr = 1, CW = 0, CH = 0, HUD = 30;
  var lv = 1, variant = 0, L = null, P = null, won = false, queue = [], qTimer = 0, autoOn = false, busy = false, msg = '', msgT = 0, hint = null, hintT = 0;
  var yaw = 0.62, pitch = 0.8;
  try { lv = Math.max(1, +localStorage.getItem('boxpush_lv3') || 1); } catch (e) {}
  function save() { try { localStorage.setItem('boxpush_lv3', String(lv)); } catch (e) {} }
  function load(nv) {
    if (nv !== undefined) variant = nv;
    L = B.level(lv, variant, true); P = B.newPlay(L); won = false; queue = []; hint = null; msg = ''; save(); draw();
    if (autoOn) setTimeout(function () { if (autoOn && !won) runAuto(); }, 700);
  }
  function setMsg(t, ms) { msg = t; msgT = Date.now() + (ms || 2500); }
  function xyz(c) { return [c % L.w, ((c / L.w) | 0) % L.h, (c / (L.w * L.h)) | 0]; }

  /* ---------- projection ---------- */
  var cY = 1, sY = 0, cP = 1, sP = 0, sc = 30, ox = 0, oy = 0, Dc = 20, c0 = [0, 0, 0];
  var A = [0, 0, 0, 0];
  function pr(x, y, z, o) {
    var X = x - c0[0], Y = y - c0[1], Z = z - c0[2], x1 = X * cY - Y * sY, y1 = X * sY + Y * cY;
    var depth = y1 * cP - Z * sP, up = y1 * sP + Z * cP, f = Dc / (Dc + depth);
    o[0] = ox + x1 * f * sc; o[1] = oy - up * f * sc; o[2] = depth; o[3] = f; return o;
  }
  var CORN = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  var FACES = [[[0, 3, 2, 1], 0, 0, -1], [[4, 5, 6, 7], 0, 0, 1], [[0, 1, 5, 4], 0, -1, 0], [[2, 3, 7, 6], 0, 1, 0], [[0, 4, 7, 3], -1, 0, 0], [[1, 2, 6, 5], 1, 0, 0]];
  function shade(base, n) { var k = n[2] > 0 ? 1.0 : n[2] < 0 ? 0.5 : (Math.abs(n[0]) > 0 ? 0.78 : 0.62); return 'rgb(' + Math.round(base[0] * k) + ',' + Math.round(base[1] * k) + ',' + Math.round(base[2] * k) + ')'; }
  function cube(x, y, z, half, base, alpha, edge) {
    var pts = [], i, g = [sY * cP, cY * cP, -sP];
    for (i = 0; i < 8; i++) pts.push(pr(x + CORN[i][0] * half, y + CORN[i][1] * half, z + CORN[i][2] * half, [0, 0, 0, 0]));
    ctx.globalAlpha = alpha;
    for (i = 0; i < 6; i++) {
      var F = FACES[i]; if (F[1] * g[0] + F[2] * g[1] + F[3] * g[2] >= 0) continue;
      ctx.beginPath(); for (var k = 0; k < 4; k++) { var p = pts[F[0][k]]; if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
      ctx.closePath(); ctx.fillStyle = shade(base, [F[1], F[2], F[3]]); ctx.fill();
      if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }
  function wire(x, y, z, half, col, w) {
    var pts = [], i; for (i = 0; i < 8; i++) pts.push(pr(x + CORN[i][0] * half, y + CORN[i][1] * half, z + CORN[i][2] * half, [0, 0, 0, 0]));
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
    for (i = 0; i < 8; i++) for (var b = 0; b < 3; b++) if (!(i & (1 << b)) && b < 3) { var j = i | (1 << b); } 
    var E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (i = 0; i < 12; i++) { ctx.moveTo(pts[E[i][0]][0], pts[E[i][0]][1]); ctx.lineTo(pts[E[i][1]][0], pts[E[i][1]][1]); }
    ctx.stroke();
  }
  function text(str, x, y, size, color, align) { ctx.font = 'bold ' + size + 'px system-ui, "Malgun Gothic", sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(str, x, y); }

  /* ---------- drawing ---------- */
  var btns = [];
  function layout() { var w = cv.clientWidth, h = cv.clientHeight; dpr = window.devicePixelRatio || 1; CW = w; CH = h; cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr); draw(); }
  function draw() {
    if (!L || CW < 60 || CH < 160) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1d1630'; ctx.fillRect(0, 0, CW, CH);
    var R = Math.max(L.w, L.h, L.d); cY = Math.cos(yaw); sY = Math.sin(yaw); cP = Math.cos(pitch); sP = Math.sin(pitch);
    c0 = [(L.w - 1) / 2, (L.h - 1) / 2, (L.d - 1) / 2]; Dc = R * 4; sc = Math.min(CW * 0.5, (CH - HUD - 90) * 0.5) / (R * 0.78); ox = CW / 2; oy = HUD + (CH - HUD - 70) / 2;
    var i, p, q, x, y, z, g = [sY * cP, cY * cP, -sP];
    var px = xyz(P.player);
    // floor grid (z = -0.5) and the layer plane of the player
    function gridAt(zz, col, fill) {
      ctx.beginPath();
      var corners = [[-0.5, -0.5], [L.w - 0.5, -0.5], [L.w - 0.5, L.h - 0.5], [-0.5, L.h - 0.5]];
      for (var k = 0; k < 4; k++) { pr(corners[k][0], corners[k][1], zz, A); if (k) ctx.lineTo(A[0], A[1]); else ctx.moveTo(A[0], A[1]); }
      ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      for (k = 0; k <= L.w; k++) { pr(k - 0.5, -0.5, zz, A); ctx.moveTo(A[0], A[1]); pr(k - 0.5, L.h - 0.5, zz, A); ctx.lineTo(A[0], A[1]); }
      for (k = 0; k <= L.h; k++) { pr(-0.5, k - 0.5, zz, A); ctx.moveTo(A[0], A[1]); pr(L.w - 0.5, k - 0.5, zz, A); ctx.lineTo(A[0], A[1]); }
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
    }
    gridAt(-0.5, 'rgba(160,140,220,.45)', 'rgba(70,50,120,.35)');
    // shadows + drop lines of goals, boxes, player
    function drop(c, col, r) {
      var t = xyz(c); pr(t[0], t[1], t[2], A); pr(t[0], t[1], -0.5, p = [0, 0, 0, 0]);
      ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(p[0], p[1], Math.abs(r * p[3] * sc * 0.5), Math.abs(r * p[3] * sc * 0.5) * Math.max(0.25, Math.abs(cP)), 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
    for (i = 0; i < L.goals.length; i++) drop(L.goals[i], '#ff5a4a', 0.5);
    for (i = 0; i < P.boxes.length; i++) drop(P.boxes[i], '#e0a040', 0.7);
    drop(P.player, '#5aa0ff', 0.6);
    gridAt(px[2], 'rgba(90,200,255,.35)', 'rgba(60,160,255,.10)');
    // objects, far to near
    var objs = [];
    for (i = 0; i < NCELL(); i++) if (L.wall[i]) { t = xyz(i); objs.push({ k: 0, t: t }); }
    var t;
    for (i = 0; i < L.goals.length; i++) { t = xyz(L.goals[i]); objs.push({ k: 1, t: t }); }
    for (i = 0; i < P.boxes.length; i++) { t = xyz(P.boxes[i]); objs.push({ k: 2, t: t, on: L.goals.indexOf(P.boxes[i]) >= 0 }); }
    t = px; objs.push({ k: 3, t: t });
    if (hint && hintT > Date.now()) { objs.push({ k: 4, t: xyz(hint.box) }); objs.push({ k: 4, t: xyz(hint.dest) }); }
    for (i = 0; i < objs.length; i++) { q = objs[i]; pr(q.t[0], q.t[1], q.t[2], A); q.d = A[2]; }
    objs.sort(function (a, b) { return b.d - a.d; });
    for (i = 0; i < objs.length; i++) {
      q = objs[i]; x = q.t[0]; y = q.t[1]; z = q.t[2];
      pr(x, y, z, A); var depthFade = Math.max(0.55, Math.min(1, 1 - (A[2] / (R * 2)) * 0.25));
      if (q.k === 0) cube(x, y, z, 0.5, [150, 120, 100], 0.42 * depthFade + 0.1, 'rgba(60,40,30,.8)');
      else if (q.k === 1) { wire(x, y, z, 0.38, '#ff5a4a', 2); ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(A[0], A[1], Math.max(2, 0.12 * A[3] * sc), 0, 7); ctx.fill(); }
      else if (q.k === 2) cube(x, y, z, 0.42, q.on ? [110, 190, 90] : [210, 140, 60], 1, q.on ? '#2c6a22' : '#6a3c10');
      else if (q.k === 3) { var r = 0.36 * A[3] * sc, gr = ctx.createRadialGradient(A[0] - r * 0.3, A[1] - r * 0.3, r * 0.1, A[0], A[1], r); gr.addColorStop(0, '#8fc0ff'); gr.addColorStop(1, '#1f55b8'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(A[0], A[1], r, 0, 7); ctx.fill(); ctx.strokeStyle = '#102a60'; ctx.lineWidth = 1.5; ctx.stroke(); }
      else if (q.k === 4) wire(x, y, z, 0.5, '#3f6', 3);
    }
    // controls
    btns = [];
    var bs = Math.max(34, Math.min(52, CW * 0.075)), gx = 12 + bs * 1.5, gy = CH - 12 - bs * 1.5;
    function btn(cx, cy, label, act) { btns.push({ x: cx - bs / 2, y: cy - bs / 2, w: bs, h: bs, act: act }); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(cx - bs / 2, cy - bs / 2, bs, bs); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.strokeRect(cx - bs / 2, cy - bs / 2, bs, bs); text(label, cx, cy, bs * 0.5, '#fff', 'center'); }
    btn(gx, gy - bs, '▲', 'fwd'); btn(gx, gy, '▼', 'back'); btn(gx - bs, gy, '◀', 'left'); btn(gx + bs, gy, '▶', 'right');
    btn(CW - 12 - bs * 0.5 - bs, CH - 12 - bs * 1.5, '↑', 'up'); btn(CW - 12 - bs * 0.5 - bs, CH - 12 - bs * 0.5, '↓', 'down');
    text(TX.layer, CW - 12 - bs * 0.5 - bs, CH - 12 - bs * 2.4, 11, '#9cf', 'center');
    // HUD
    ctx.fillStyle = '#3a2d4a'; ctx.fillRect(0, 0, CW, HUD);
    text(TX.level + ' ' + lv, 10, HUD / 2, 14, '#ffd98a');
    text(TX.layer + ' ' + (px[2] + 1) + '/' + L.d + '   ' + TX.moves + ' ' + P.moves + '   ' + TX.pushes + ' ' + P.pushes + (L.minPushes ? '   (' + TX.best + ' ' + L.minPushes + ')' : ''), CW - 10, HUD / 2, 12, '#e8dcc0', 'right');
    if (autoOn) text('AUTO', CW / 2, HUD / 2, 12, '#3f6', 'center');
    text(TX.rot, CW / 2, CH - 8, 10, 'rgba(255,255,255,.45)', 'center');
    if (msg && msgT > Date.now()) text(msg, CW / 2, HUD + 16, 13, '#ffe08a', 'center');
    if (won) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, HUD, CW, CH - HUD); text(TX.clear, CW / 2, CH / 2 - 10, Math.min(40, CW / 8), '#ffd23c', 'center'); text(TX.next, CW / 2, CH / 2 + 24, 14, '#fff', 'center'); }
  }
  function NCELL() { return L.w * L.h * L.d; }

  /* ---------- play ---------- */
  function step(d) {
    if (won || busy) return false;
    var r = B.move(P, d);
    if (r && B.solved(P)) { won = true; queue = []; hint = null; setTimeout(function () { if (autoOn && won) nextLevel(); }, 1300); }
    draw(); return !!r;
  }
  function stopQueue() { queue = []; clearInterval(qTimer); qTimer = 0; }
  function runQueue(ms) { clearInterval(qTimer); qTimer = setInterval(function () { if (!queue.length) { clearInterval(qTimer); qTimer = 0; return; } if (!step(queue.shift())) stopQueue(); }, ms); }
  function undo() { stopQueue(); if (won) return; if (B.undo(P)) draw(); }
  function restart() { stopQueue(); P = B.newPlay(L); won = false; hint = null; draw(); }
  function nextLevel() { stopQueue(); lv++; load(0); }
  function prevLevel() { stopQueue(); if (lv > 1) { lv--; load(0); } }
  function newGame() { stopQueue(); variant++; load(variant); }
  function solveNow(cb) {
    busy = true; setMsg(TX.solving, 8000); draw();
    setTimeout(function () { var sol = B.solve(L, P.boxes, P.player, 5000); if (!sol && P.moves === 0 && L.solution) sol = L.solution; busy = false; msg = ''; draw(); cb(sol); }, 30);
  }
  function runAuto() {
    if (!autoOn || won) return;
    solveNow(function (sol) {
      if (!autoOn) return;
      if (!sol) { setMsg(TX.fail); autoOn = false; if (window.parent && window.parent.setAutoMark) window.parent.setAutoMark(false); return; }
      queue = sol.split('').map(function (ch) { return B.DL.indexOf(ch); }); runQueue(140);
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

  /* ---------- input: arrows move relative to the view, PageUp / PageDown (or Q / E) change the layer ---------- */
  var AX = [[0, 3], [0, 2], [1, 1], [1, 0]];       // [axis, dirIndex] helper unused
  function snapDir(vx, vy) {                          // nearest horizontal axis direction -> letter index
    var best = 0, bd = -9, cand = [[0, -1, 0], [0, 1, 1], [-1, 0, 2], [1, 0, 3]];
    for (var i = 0; i < 4; i++) { var dd = cand[i][0] * vx + cand[i][1] * vy; if (dd > bd) { bd = dd; best = cand[i][2]; } }
    return best;
  }
  function act(a) {
    var fwd = [sY, cY], right = [cY, -sY];             // screen-forward and screen-right on the floor (x, y)
    if (autoOn && a) { autoOn = false; stopQueue(); if (window.parent && window.parent.setAutoMark) window.parent.setAutoMark(false); }
    stopQueue();
    if (a === 'fwd') step(snapDir(fwd[0], fwd[1])); else if (a === 'back') step(snapDir(-fwd[0], -fwd[1]));
    else if (a === 'left') step(snapDir(-right[0], -right[1])); else if (a === 'right') step(snapDir(right[0], right[1]));
    else if (a === 'up') step(4); else if (a === 'down') step(5);
  }
  var KEYMAP = { ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', PageUp: 'up', KeyE: 'up', PageDown: 'down', KeyQ: 'down', Space: 'up', ShiftLeft: 'down' };
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
    if (e.code in KEYMAP) { e.preventDefault(); act(KEYMAP[e.code]); }
    else if (e.code === 'KeyU' || e.code === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.code === 'KeyR') restart();
    else if (e.code === 'Enter' || e.code === 'KeyN') { if (won) nextLevel(); }
    else if (e.code === 'BracketLeft') prevLevel(); else if (e.code === 'BracketRight') nextLevel();
  });
  var down = null;
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (won) { nextLevel(); return; }
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (var i = 0; i < btns.length; i++) { var b = btns[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { act(b.act); return; } }
    down = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (z) {}
  });
  cv.addEventListener('pointermove', function (e) {
    if (!down) return;
    yaw -= (e.clientX - down.x) * 0.01; pitch = Math.max(0.15, Math.min(1.45, pitch + (e.clientY - down.y) * 0.008)); down.x = e.clientX; down.y = e.clientY; draw();
  });
  cv.addEventListener('pointerup', function () { down = null; }); cv.addEventListener('pointercancel', function () { down = null; });

  window.newGame = newGame; window.restartLevel = restart; window.undoMove = undo; window.nextLevel = nextLevel; window.prevLevel = prevLevel;
  window.toggleAuto = toggleAuto; window.giveHint = giveHint;
  window.addEventListener('message', function (e) { var d = e.data; if (d && d.ngCmd && typeof window[d.ngCmd] === 'function') window[d.ngCmd](d.v); });
  window.__bp = { state: function () { return { lv: lv, won: won, moves: P.moves, pushes: P.pushes, boxes: P.boxes.slice(), player: P.player, L: L, auto: autoOn, busy: busy }; }, move: step, load: function (n) { lv = n; load(0); } };
  window.addEventListener('resize', layout);
  load(); layout();
  setInterval(function () { draw(); }, 500);
})();
