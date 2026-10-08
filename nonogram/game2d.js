/* Nonogram 2D page: canvas board + pointer painting. */
(function () {
  'use strict';
  var t = NGC.t;
  var C = new NGC.Controller({ dim: 2, sizes: [5, 10, 15], def: 10, autoMs: 160 });
  var ui = NGC.buildChrome(C, {});
  var cv = ui.cv, ctx = cv.getContext('2d');
  var lay = null, hover = -1, raf = 0, drag = null;
  var INK = '#1f2a44', GRAY = '#b3bacb', RED = '#d63d3d', FILL = '#2b3a67';

  try { var sv = parseInt(NGC.store('nonogram_size_2d'), 10); if (C.sizes.indexOf(sv) >= 0) C.n = sv; } catch (e) {}
  var q = new URLSearchParams(location.search).get('n'); if (q && C.sizes.indexOf(parseInt(q, 10)) >= 0) C.n = parseInt(q, 10);

  function schedule() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }
  C.onRedraw = schedule;
  C.onNew = function () { NGC.store('nonogram_size_2d', String(C.n)); };

  function layout() {
    var v = C.view, n = C.n, maxL = 1, maxT = 1, i;
    for (i = 0; i < n; i++) { maxL = Math.max(maxL, C.clues[i].length); maxT = Math.max(maxT, C.clues[n + i].length); }
    var pad = 8, s = Math.min((v.w - 2 * pad) / (n + maxL), (v.h - 2 * pad) / (n + maxT)), fs, slot, lw, th;
    for (i = 0; i < 4; i++) {
      fs = Math.max(8, Math.min(20, s * 0.55)); slot = fs * (n > 9 ? 1.3 : 1.1);
      lw = maxL * slot + 8; th = maxT * fs * 1.25 + 8;
      s = Math.min((v.w - 2 * pad - lw) / n, (v.h - 2 * pad - th) / n);
    }
    var bw = lw + s * n, bh = th + s * n, ox = Math.floor((v.w - bw) / 2), oy = Math.max(pad, Math.floor((v.h - bh) / 2));
    lay = { s: s, fs: fs, slot: slot, lw: lw, th: th, bx: ox + lw, by: oy + th, ox: ox, oy: oy };
  }

  function cellAt(px, py, clamp) {
    var n = C.n, x = Math.floor((px - lay.bx) / lay.s), y = Math.floor((py - lay.by) / lay.s);
    if (clamp) { x = Math.max(0, Math.min(n - 1, x)); y = Math.max(0, Math.min(n - 1, y)); }
    else if (x < 0 || y < 0 || x >= n || y >= n) return -1;
    return y * n + x;
  }

  function hsl(h, s, l, a) { return 'hsla(' + h + ',' + s + '%,' + l + '%,' + (a === undefined ? 1 : a) + ')'; }

  function draw() {
    if (!C.view || !C.clues) return;
    layout();
    var v = C.view, n = C.n, s = lay.s, bx = lay.bx, by = lay.by, i, x, y;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, v.w, v.h);
    var now = performance.now(), wp = C.won ? Math.min(1, (now - C.winAt) / 1800) : -1, animating = C.won && wp < 1;
    var hx = hover >= 0 ? hover % n : -1, hy = hover >= 0 ? Math.floor(hover / n) : -1;

    // clue panels
    ctx.fillStyle = '#f1f4fb';
    ctx.fillRect(lay.ox, by, lay.lw, s * n); ctx.fillRect(bx, lay.oy, s * n, lay.th);
    // hovered row/col band
    if (hx >= 0 && !C.won) { ctx.fillStyle = 'rgba(59,91,219,.10)'; ctx.fillRect(lay.ox, by + hy * s, lay.lw + s * n, s); ctx.fillRect(bx + hx * s, lay.oy, s, lay.th + s * n); }
    // highlighted (hint) line
    var hl = C.hl, hlSet = null;
    if (hl) { hlSet = {}; hl.cells.forEach(function (c) { hlSet[c] = 1; }); }
    if (hl && hl.li >= 0) {
      var ln = C.L.lines[hl.li]; ctx.fillStyle = 'rgba(255,196,0,.35)';
      if (ln.axis === 0) ctx.fillRect(lay.ox, by + ln.pos[0] * s, lay.lw + s * n, s); else ctx.fillRect(bx + ln.pos[0] * s, lay.oy, s, lay.th + s * n);
    }
    // cells
    var fade = C.won ? Math.max(0, 1 - wp * 1.6) : 1;
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) {
      i = y * n + x; var m = C.marks[i], cx = bx + x * s, cy = by + y * s;
      if (hlSet && hlSet[i]) { ctx.fillStyle = 'rgba(255,196,0,.28)'; ctx.fillRect(cx, cy, s, s); }
      if (m === 1) {
        var g = 1.5, r = Math.min(4, s * 0.16), col = FILL, k = 1;
        if (C.won) {
          var delay = (x + y) / (2 * n) * 0.6, p = Math.max(0, Math.min(1, (wp - delay) / 0.4));
          k = 0.9 + 0.1 * Math.sin(p * Math.PI) + (p < 1 ? 0.0 : 0); col = hsl(Math.round(200 + 140 * (x + y) / (2 * n)), 62, 38 + 20 * p, 1);
          if (p <= 0) col = FILL;
        }
        var gg = g + s * (1 - k) / 2;
        rr(cx + gg, cy + gg, s - 2 * gg, s - 2 * gg, r); ctx.fillStyle = col; ctx.fill();
      } else if (m === 2 && fade > 0) {
        ctx.strokeStyle = 'rgba(122,134,166,' + (0.9 * fade) + ')'; ctx.lineWidth = Math.max(1.2, s * 0.07); ctx.lineCap = 'round';
        var a = s * 0.3; ctx.beginPath(); ctx.moveTo(cx + a, cy + a); ctx.lineTo(cx + s - a, cy + s - a); ctx.moveTo(cx + s - a, cy + a); ctx.lineTo(cx + a, cy + s - a); ctx.stroke();
      }
    }
    // grid lines
    var gridA = C.won ? Math.max(0.25, 1 - wp) : 1;
    ctx.lineCap = 'butt';
    for (i = 0; i <= n; i++) {
      var major = i % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(80,92,125,' + gridA + ')' : 'rgba(180,189,210,' + gridA + ')'; ctx.lineWidth = major ? 1.6 : 1;
      var px = Math.round(bx + i * s) + 0.5, py = Math.round(by + i * s) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, by); ctx.lineTo(px, by + n * s); ctx.moveTo(bx, py); ctx.lineTo(bx + n * s, py); ctx.stroke();
      // clue-area separators
      ctx.strokeStyle = 'rgba(200,207,225,' + gridA + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, lay.oy); ctx.lineTo(px, by); ctx.moveTo(lay.ox, py); ctx.lineTo(bx, py); ctx.stroke();
    }
    // target cell
    if (hl && hl.target >= 0) {
      var tx = hl.target % n, ty = Math.floor(hl.target / n);
      ctx.strokeStyle = '#ff8a00'; ctx.lineWidth = 3; ctx.strokeRect(bx + tx * s + 1.5, by + ty * s + 1.5, s - 3, s - 3);
    }
    // clues
    ctx.font = '700 ' + lay.fs + 'px "Segoe UI","Noto Sans KR",Arial,sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    var clueA = C.won ? Math.max(0.25, 1 - wp * 1.2) : 1;
    ctx.globalAlpha = clueA;
    for (i = 0; i < n * 2; i++) {
      var clue = C.clues[i], c = clue.length ? clue : [0], li = i, ln2 = C.L.lines[li];
      ctx.fillStyle = C.badLine[li] ? RED : C.satLine[li] ? GRAY : INK;
      for (var k2 = 0; k2 < c.length; k2++) {
        if (ln2.axis === 0) { // row clue: right aligned
          ctx.fillText(c[c.length - 1 - k2], bx - 4 - lay.slot * (k2 + 0.5), by + (ln2.pos[0] + 0.5) * s + 1);
        } else {
          ctx.fillText(c[c.length - 1 - k2], bx + (ln2.pos[0] + 0.5) * s, by - 4 - lay.fs * 1.25 * (k2 + 0.5) + 2);
        }
      }
    }
    ctx.globalAlpha = 1;
    if (C.won && wp >= 0.5) { // frame glow
      ctx.strokeStyle = 'rgba(59,91,219,' + (0.6 * Math.min(1, (wp - 0.5) * 2)) + ')'; ctx.lineWidth = 3; ctx.strokeRect(bx - 1, by - 1, n * s + 2, n * s + 2);
    }
    if (animating) schedule();
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /* ---------- pointer painting ---------- */
  function pt(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function startPaint(d, action) {
    var i = d.start, cur = C.marks[i];
    d.action = action;
    d.paint = cur === action ? 0 : action; d.eraseOf = action;
    C.begin(); d.changed = [];
    C.set(i, d.paint); C.refresh();
  }
  function applyCell(d, i) {
    var cur = C.marks[i];
    if (d.paint === 0) { if (cur === d.eraseOf) C.set(i, 0); } else if (cur === 0) C.set(i, d.paint);
  }
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('pointerdown', function (e) {
    if (C.won || !lay) return;
    var p = pt(e), i = cellAt(p.x, p.y, false);
    if (i < 0) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    var alt = e.button === 2;
    var d = drag = { id: e.pointerId, start: i, last: i, sx: p.x, sy: p.y, moved: false, axis: null, long: false, touch: e.pointerType !== 'mouse' };
    var action = alt ? (C.mode === 1 ? 2 : 1) : C.mode;
    startPaint(d, action);
    if (d.touch) d.timer = setTimeout(function () { // long press = the other action on the first cell
      if (drag !== d || d.moved) return;
      d.long = true;
      // revert what was done so far, then apply the alternate action
      var st = C.stroke || []; for (var k = st.length - 1; k >= 0; k--) C.marks[st[k].i] = st[k].o; C.stroke = null;
      startPaint(d, action === 1 ? 2 : 1);
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) {}
    }, 450);
  });
  cv.addEventListener('pointermove', function (e) {
    var p = pt(e);
    if (!drag || drag.id !== e.pointerId) {
      var h = lay ? cellAt(p.x, p.y, false) : -1; if (h !== hover) { hover = h; schedule(); } return;
    }
    var d = drag, n = C.n;
    if (!d.moved) { if (Math.hypot(p.x - d.sx, p.y - d.sy) < 5) return; d.moved = true; clearTimeout(d.timer); }
    var i = cellAt(p.x, p.y, true), x = i % n, y = Math.floor(i / n), sx = d.start % n, sy = Math.floor(d.start / n);
    if (!d.axis) { if (x === sx && y === sy) return; d.axis = Math.abs(x - sx) >= Math.abs(y - sy) ? 'h' : 'v'; }
    if (d.axis === 'h') y = sy; else x = sx;
    var ni = y * n + x; hover = ni;
    if (ni === d.last) { schedule(); return; }
    var lx = d.last % n, ly = Math.floor(d.last / n), stepx = Math.sign(x - lx), stepy = Math.sign(y - ly);
    while (lx !== x || ly !== y) { lx += stepx; ly += stepy; applyCell(d, ly * n + lx); }
    d.last = ni; C.refresh();
  });
  function endPaint(e) {
    if (!drag || (e && drag.id !== e.pointerId)) return;
    clearTimeout(drag.timer); drag = null; C.end();
  }
  cv.addEventListener('pointerup', endPaint);
  cv.addEventListener('pointercancel', endPaint);
  cv.addEventListener('pointerleave', function () { if (!drag) { hover = -1; schedule(); } });

  /* test / tooling hooks */
  window.__ng = {
    C: C, core: NG,
    cellPos: function (i) { layout(); var r = cv.getBoundingClientRect(); return { x: r.left + lay.bx + (i % C.n + 0.5) * lay.s, y: r.top + lay.by + (Math.floor(i / C.n) + 0.5) * lay.s }; },
    layout: function () { layout(); return lay; }
  };

  C.newGame();
  C.syncUI();
})();
