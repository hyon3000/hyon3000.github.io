/* Nonogram 3D page: software Canvas2D projection of an n x n x n cube (painter's algorithm),
   clue numbers are billboard pills sitting on the visible end cell of every line (flip to the opposite face as you rotate). */
(function () {
  'use strict';
  var t = NGC.t, KO = NGC.KO;
  var C = new NGC.Controller({ dim: 3, sizes: [3, 4, 5], def: 4, autoMs: 320 });
  var ui = NGC.buildChrome(C, { slice: true });
  var cv = ui.cv, ctx = cv.getContext('2d');
  var yaw = -0.62, pitch = 0.52, raf = 0, drag = null, lastTap = null, items = [], frame = null;
  var cutAxis = 1, cutK = 0, lastWin = 0;

  var sv = parseInt(NGC.store('nonogram_size_3d'), 10); if (C.sizes.indexOf(sv) >= 0) C.n = sv;
  var q = new URLSearchParams(location.search).get('n'); if (q && C.sizes.indexOf(parseInt(q, 10)) >= 0) C.n = parseInt(q, 10);

  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }
  C.onRedraw = schedule;

  /* ---------- slice bar ---------- */
  var bar = document.getElementById('sliceBar');
  bar.innerHTML = '<span class="lab">' + t('cut') + '</span>' +
    ['X', 'Y', 'Z'].map(function (a, i) { return '<button type="button" class="btn ax" data-a="' + i + '">' + a + '</button>'; }).join('') +
    '<input type="range" id="cutR" min="0" max="3" value="0" step="1"><span class="lab" id="cutV" style="min-width:2.2em;text-align:right">0</span>';
  var cutR = document.getElementById('cutR'), cutV = document.getElementById('cutV');
  function syncCut() {
    cutR.max = C.n - 1; if (cutK > C.n - 1) cutK = C.n - 1; cutR.value = cutK; cutV.textContent = cutK ? '−' + cutK : t('none');
    [].forEach.call(bar.querySelectorAll('.ax'), function (b) { b.className = 'btn ax' + (parseInt(b.getAttribute('data-a'), 10) === cutAxis ? ' on' : ''); });
  }
  function setCut(k) { cutK = Math.max(0, Math.min(C.n - 1, k)); syncCut(); schedule(); }
  cutR.addEventListener('input', function () { setCut(parseInt(cutR.value, 10)); });
  [].forEach.call(bar.querySelectorAll('.ax'), function (b) { b.addEventListener('click', function () { cutAxis = parseInt(b.getAttribute('data-a'), 10); syncCut(); schedule(); }); });
  var baseSync = C.syncUI; C.syncUI = function () { baseSync(); syncCut(); };
  C.onNew = function () { NGC.store('nonogram_size_3d', String(C.n)); cutK = 0; lastWin = 0; syncCut(); };
  C.onWin = function () { cutK = 0; syncCut(); lastWin = performance.now(); };
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'q' || k === 'Q') setCut(cutK - 1); else if (k === 'e' || k === 'E') setCut(cutK + 1);
    else if (k === 'ArrowLeft') { yaw -= 0.12; schedule(); } else if (k === 'ArrowRight') { yaw += 0.12; schedule(); }
    else if (k === 'ArrowUp') { pitch = Math.max(-1.45, pitch - 0.12); schedule(); } else if (k === 'ArrowDown') { pitch = Math.min(1.45, pitch + 0.12); schedule(); }
  });

  /* ---------- projection ---------- */
  var DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  // 4 corners (lattice offsets from the cell origin) per face direction
  var FACE = [
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]
  ];
  var LIGHT = (function () { var l = [-0.35, 0.8, 0.5], m = Math.hypot(l[0], l[1], l[2]); return [l[0] / m, l[1] / m, l[2] / m]; })();

  function setup() {
    var v = C.view, n = C.n, R = n * 0.866, D = R * 3.6;
    var f = 0.47 * Math.min(v.w, v.h) * Math.sqrt(D * D - R * R) / R;
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    frame = { n: n, D: D, f: f, cx: v.w / 2, cy: v.h / 2, cyaw: cy, syaw: sy, cp: cp, sp: sp, unit: f / D };
    // rot: world offset -> view
    frame.rot = function (x, y, z) { var x1 = x * cy + z * sy, z1 = -x * sy + z * cy; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
    // eye in world coordinates = inverse rotation of (0,0,D)
    frame.eyeW = [-D * cp * sy, D * sp, D * cp * cy];
    // lattice points
    var m = n + 1, pts = new Array(m * m * m), i, x, y, z, h = n / 2;
    for (z = 0; z < m; z++) for (y = 0; y < m; y++) for (x = 0; x < m; x++) {
      var r = frame.rot(x - h, y - h, z - h), dep = D - r[2], k = f / dep;
      pts[(z * m + y) * m + x] = [frame.cx + r[0] * k, frame.cy - r[1] * k, dep];
    }
    frame.pts = pts; frame.m = m;
    frame.nviews = DIRS.map(function (d) { return frame.rot(d[0], d[1], d[2]); });
  }
  function proj(wx, wy, wz) { var h = frame.n / 2, r = frame.rot(wx - h, wy - h, wz - h), dep = frame.D - r[2], k = frame.f / dep; return { x: frame.cx + r[0] * k, y: frame.cy - r[1] * k, dep: dep, v: r }; }

  function hiddenFn() {
    var n = C.n, ax = cutAxis, sg = frame.eyeW[ax] >= 0 ? 1 : -1, k = cutK, W = C.won;
    return function (i) {
      if (!k) return false;
      var c = ax === 0 ? i % n : ax === 1 ? Math.floor(i / n) % n : Math.floor(i / (n * n));
      return sg > 0 ? c >= n - k : c < k;
    };
  }

  function inPoly(poly, px, py) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function pick(px, py) {
    for (var k = items.length - 1; k >= 0; k--) {
      var it = items[k];
      if (it.poly ? inPoly(it.poly, px, py) : Math.hypot(px - it.cx, py - it.cy) <= it.r) return it.cell;
    }
    return -1;
  }

  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function rgb(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a === undefined ? 1 : a) + ')'; }
  function hsl2rgb(h, s, l) { var a = s * Math.min(l, 1 - l), f = function (n) { var k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0) * 255, f(8) * 255, f(4) * 255]; }

  function draw() {
    if (!C.view || !C.clues) return;
    setup();
    var v = C.view, n = C.n, i, x, y, z, m = frame.m, pts = frame.pts;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, v.h); g.addColorStop(0, '#f7f9fe'); g.addColorStop(1, '#e6ebf6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, v.w, v.h);
    var now = performance.now(), wt = C.won ? (now - C.winAt) / 1000 : -1, animating = false;
    if (C.won && wt < 6) { yaw += 0.012 * Math.max(0, 1 - wt / 6); animating = true; }
    var hidden = hiddenFn(), hlSet = {};
    if (C.hl) C.hl.cells.forEach(function (c) { hlSet[c] = 1; });
    var tgt = C.hl ? C.hl.target : -1;
    items = [];
    // drawn?
    var drawn = new Uint8Array(C.L.total), cnt = 0;
    for (i = 0; i < C.L.total; i++) {
      var mk = C.marks[i];
      drawn[i] = (!hidden(i) && mk !== 2 && (!C.won || mk === 1)) ? 1 : 0;
    }
    // order cells far -> near
    var order = [], h = n / 2, ew = frame.eyeW;
    for (i = 0; i < C.L.total; i++) {
      if (hidden(i)) continue;
      x = i % n; y = Math.floor(i / n) % n; z = Math.floor(i / (n * n));
      var dx = x + 0.5 - h - ew[0], dy = y + 0.5 - h - ew[1], dz = z + 0.5 - h - ew[2];
      order.push([dx * dx + dy * dy + dz * dz, i]);
    }
    order.sort(function (a, b) { return b[0] - a[0]; });
    var unit = frame.unit, edgeW = Math.max(1, unit * 0.045);
    ctx.lineJoin = 'round';
    for (var oi = 0; oi < order.length; oi++) {
      i = order[oi][1]; x = i % n; y = Math.floor(i / n) % n; z = Math.floor(i / (n * n));
      var mk2 = C.marks[i];
      if (!drawn[i]) {
        if (mk2 === 2 && !C.won) { // ghost: small x at the cell centre
          var pc = proj(x + 0.5, y + 0.5, z + 0.5), gs = unit * 0.2 * (frame.D / pc.dep);
          ctx.strokeStyle = 'rgba(105,118,150,.75)'; ctx.lineWidth = Math.max(1.3, unit * 0.05); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(pc.x - gs, pc.y - gs); ctx.lineTo(pc.x + gs, pc.y + gs); ctx.moveTo(pc.x + gs, pc.y - gs); ctx.lineTo(pc.x - gs, pc.y + gs); ctx.stroke();
          if (hlSet[i]) { ctx.strokeStyle = 'rgba(255,170,0,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pc.x, pc.y, gs * 1.8, 0, 6.3); ctx.stroke(); }
          items.push({ cell: i, cx: pc.x, cy: pc.y, r: Math.max(10, unit * 0.4) });
        }
        continue;
      }
      var base = mk2 === 1 ? [52, 74, 160] : [236, 242, 255];
      if (C.won) { var dl = (x + y + z) / (3 * n); var wp = Math.max(0, Math.min(1, (wt - dl * 1.0) / 0.6)); base = mix([52, 74, 160], hsl2rgb(Math.round(190 + 160 * (x + y + z) / (3 * n - 3 || 1)), 0.7, 0.52), wp); }
      if (hlSet[i]) base = mix(base, [255, 205, 50], i === tgt ? 0.7 : 0.45);
      for (var d = 0; d < 6; d++) {
        var dd = DIRS[d], nx = x + dd[0], ny = y + dd[1], nz = z + dd[2];
        if (nx >= 0 && ny >= 0 && nz >= 0 && nx < n && ny < n && nz < n && drawn[(nz * n + ny) * n + nx]) continue;
        var nv = frame.nviews[d];
        var fc = proj(x + 0.5 + dd[0] * 0.5, y + 0.5 + dd[1] * 0.5, z + 0.5 + dd[2] * 0.5);
        // visible if the normal points to the eye: dot(nv, eye - fcView) > 0
        var ex = -fc.v[0], ey = -fc.v[1], ez = frame.D - fc.v[2];
        if (nv[0] * ex + nv[1] * ey + nv[2] * ez <= 0) continue;
        var poly = [], F = FACE[d];
        for (var c = 0; c < 4; c++) { var p = pts[((z + F[c][2]) * m + (y + F[c][1])) * m + (x + F[c][0])]; poly.push([p[0], p[1]]); }
        var b = 0.74 + 0.3 * (nv[0] * LIGHT[0] + nv[1] * LIGHT[1] + nv[2] * LIGHT[2]); b = Math.max(0.55, Math.min(1.04, b));
        var col = [base[0] * b, base[1] * b, base[2] * b];
        ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (c = 1; c < 4; c++) ctx.lineTo(poly[c][0], poly[c][1]); ctx.closePath();
        ctx.fillStyle = rgb(col); ctx.fill();
        ctx.strokeStyle = mk2 === 1 ? 'rgba(15,25,70,.85)' : 'rgba(70,88,140,.6)'; ctx.lineWidth = i === tgt ? edgeW * 2.4 : edgeW; if (i === tgt) ctx.strokeStyle = '#ff8a00'; ctx.stroke();
        items.push({ cell: i, poly: poly });
      }
    }
    // clue sprites (billboards on the visible end cell of every line)
    if (!(C.won && wt > 0.6)) {
      var sprites = [], eyeAx = [ew[0] >= 0 ? 1 : -1, ew[1] >= 0 ? 1 : -1, ew[2] >= 0 ? 1 : -1];
      for (var li = 0; li < C.L.lines.length; li++) {
        var ln = C.L.lines[li], sg = eyeAx[ln.axis], found = -1, cl = ln.cells;
        for (var s = 0; s < n; s++) { var cc = cl[sg > 0 ? n - 1 - s : s]; if (!hidden(cc)) { found = cc; break; } }
        if (found < 0) continue;
        var fx = found % n, fy = Math.floor(found / n) % n, fz = Math.floor(found / (n * n)), cen = [fx + 0.5, fy + 0.5, fz + 0.5];
        cen[ln.axis] += 0.5 * sg;
        var P = proj(cen[0], cen[1], cen[2]), dirv = frame.nviews[ln.axis * 2 + (sg > 0 ? 0 : 1)];
        var evx = -P.v[0], evy = -P.v[1], evz = frame.D - P.v[2], el = Math.hypot(evx, evy, evz);
        var facing = (dirv[0] * evx + dirv[1] * evy + dirv[2] * evz) / el;
        if (facing < 0.16) continue;
        sprites.push({ li: li, x: P.x, y: P.y, dep: P.dep, facing: facing });
      }
      sprites.sort(function (a, b) { return b.dep - a.dep; });
      var dmin = 1e9, dmax = 0; sprites.forEach(function (s) { dmin = Math.min(dmin, s.dep); dmax = Math.max(dmax, s.dep); });
      var fs = Math.max(9, Math.min(16, unit * 0.34)), fade = C.won ? Math.max(0, 1 - wt / 0.6) : 1;
      ctx.font = '700 ' + fs + 'px "Segoe UI","Noto Sans KR",Arial,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      sprites.forEach(function (s) {
        var clue = C.clues[s.li], txt = clue.length ? clue.join(' ') : '0', w = ctx.measureText(txt).width + 8, hh = fs + 5;
        var dim = dmax > dmin ? (s.dep - dmin) / (dmax - dmin) : 0, a = (0.62 + 0.38 * (1 - dim)) * Math.min(1, 0.45 + s.facing) * fade;
        ctx.globalAlpha = a;
        var onHl = C.hl && C.hl.li === s.li;
        ctx.fillStyle = onHl ? '#fff3c4' : '#ffffff'; ctx.strokeStyle = onHl ? '#ff8a00' : 'rgba(40,55,100,.35)'; ctx.lineWidth = onHl ? 2 : 1;
        rrect(s.x - w / 2, s.y - hh / 2, w, hh, hh / 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.badLine[s.li] ? '#d63d3d' : C.satLine[s.li] ? '#9aa3b8' : '#1f2a44';
        ctx.fillText(txt, s.x, s.y + 0.5);
      });
      ctx.globalAlpha = 1;
    }
    if (animating) schedule();
  }
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* ---------- pointer ---------- */
  function pt(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function tapAction(i, alt) {
    var act = alt ? (C.mode === 1 ? 2 : 1) : C.mode, cur = C.marks[i];
    C.begin(); C.set(i, cur === act ? 0 : act); C.end();
  }
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('pointerdown', function (e) {
    if (!frame) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    var p = pt(e), d = drag = { id: e.pointerId, sx: p.x, sy: p.y, lx: p.x, ly: p.y, cell: C.won ? -1 : pick(p.x, p.y), alt: e.button === 2, moved: false, long: false, touch: e.pointerType !== 'mouse' };
    if (d.touch && d.cell >= 0) d.timer = setTimeout(function () { if (drag === d && !d.moved) { d.long = true; tapAction(d.cell, true); if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) {} } }, 480);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag || drag.id !== e.pointerId) return;
    var p = pt(e), d = drag;
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 6) { d.moved = true; clearTimeout(d.timer); }
    if (d.moved) { yaw += (p.x - d.lx) * 0.011; pitch = Math.max(-1.45, Math.min(1.45, pitch + (p.y - d.ly) * 0.011)); schedule(); }
    d.lx = p.x; d.ly = p.y;
  });
  function up(e) {
    if (!drag || drag.id !== e.pointerId) return;
    var d = drag; drag = null; clearTimeout(d.timer);
    if (e.type === 'pointercancel' || d.moved || d.long || d.cell < 0) return;
    var now = performance.now();
    if (lastTap && lastTap.cell === d.cell && now - lastTap.t < 330 && !d.alt) { // double tap = the other mark
      C.undo(); // take back the first tap of the double tap
      C.begin(); C.set(d.cell, C.mode === 1 ? 2 : 1); C.end(); lastTap = null; return;
    }
    tapAction(d.cell, d.alt);
    lastTap = d.alt ? null : { cell: d.cell, t: now };
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  /* test / tooling hooks */
  window.__ng = {
    C: C, core: NG,
    setView: function (a, b) { yaw = a; pitch = b; draw(); },
    getView: function () { return [yaw, pitch]; },
    setCut: function (axis, k) { cutAxis = axis; setCut(k); draw(); },
    visibleCells: function () {
      draw(); var r = cv.getBoundingClientRect(), out = {}, res = [];
      items.forEach(function (it) {
        if (out[it.cell] !== undefined) return;
        var px, py; if (it.poly) { px = (it.poly[0][0] + it.poly[1][0] + it.poly[2][0] + it.poly[3][0]) / 4; py = (it.poly[0][1] + it.poly[1][1] + it.poly[2][1] + it.poly[3][1]) / 4; } else { px = it.cx; py = it.cy; }
        if (pick(px, py) === it.cell) { out[it.cell] = 1; res.push({ i: it.cell, x: r.left + px, y: r.top + py, ghost: !it.poly }); }
      });
      return res;
    },
    pickAt: function (px, py) { var r = cv.getBoundingClientRect(); return pick(px - r.left, py - r.top); }
  };

  C.newGame();
  C.syncUI();
})();
