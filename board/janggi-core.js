// Janggi (Korean chess) rules, shared by janggi.html, janggi-engine.js (fallback player) and engine/janggi/worker.js (search).
//   board: 9 files x 10 ranks, square = y * 9 + x, y = 0 is Han's back rank (top), y = 9 is Cho's back rank (bottom). Cho (green) moves first.
//   piece = color << 3 | type   (color 1 = Cho, 2 = Han; type 1 general, 2 guard, 3 elephant, 4 horse, 5 chariot, 6 cannon, 7 soldier)
//   move  = from | to << 7      PASS = 16383 (the pass of a side that is not in check)
// Rule choices: a move that leaves the own general in check or facing the enemy general is illegal (so "bikjang" can never arise);
// draw by threefold repetition; after CLOCK_LIMIT plies without a capture the game is decided by the point count (Han gets 1.5 points of komi).
(function (root) {
  'use strict';
  var CHO = 1, HAN = 2, PASS = 16383, CLOCK_LIMIT = 200;
  var BASE = [0, 0, 300, 300, 500, 1300, 700, 200];            // search values (guard, elephant, horse, chariot, cannon, soldier)
  var POINTS = [0, 0, 3, 3, 5, 13, 7, 2];                       // point count values
  var LETTERS = ' KAEHRCP';

  function inB(x, y) { return x >= 0 && x < 9 && y >= 0 && y < 10; }
  function inPal(x, y) { return x >= 3 && x <= 5 && ((y >= 0 && y <= 2) || (y >= 7 && y <= 9)); }
  function onDiag(x, y) { if (!inPal(x, y)) return false; var py = y <= 2 ? y : y - 7; return ((x - 3 + py) & 1) === 0; }
  var ORTH = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  /* ---------- tables ---------- */
  var RAYS = [], RAYV = [], PADJ = [], HORSE = [], ELE = [], SOLD = [[], [], []], HATT = [], EATT = [], PATT = [[], [], []];
  var sq, x, y, i, k, d;
  for (sq = 0; sq < 90; sq++) {
    x = sq % 9; y = (sq / 9) | 0;
    var rays = [], vert = [], ray, cx, cy;
    for (d = 0; d < 4; d++) {
      ray = []; cx = x + ORTH[d][0]; cy = y + ORTH[d][1];
      while (inB(cx, cy)) { ray.push(cy * 9 + cx); cx += ORTH[d][0]; cy += ORTH[d][1]; }
      if (ray.length) { rays.push(Int8Array.from(ray)); vert.push(d < 2); }
    }
    if (onDiag(x, y)) {
      for (var sx = -1; sx <= 1; sx += 2) for (var sy = -1; sy <= 1; sy += 2) {
        ray = []; cx = x + sx; cy = y + sy;
        while (inPal(cx, cy) && (cy <= 2) === (y <= 2) && onDiag(cx, cy)) { ray.push(cy * 9 + cx); cx += sx; cy += sy; }
        if (ray.length) { rays.push(Int8Array.from(ray)); vert.push(false); }
      }
    }
    RAYS[sq] = rays; RAYV[sq] = vert;
    // palace steps (general and guard)
    var pa = [];
    if (inPal(x, y)) {
      for (d = 0; d < 4; d++) { cx = x + ORTH[d][0]; cy = y + ORTH[d][1]; if (inPal(cx, cy) && (cy <= 2) === (y <= 2)) pa.push(cy * 9 + cx); }
      if (onDiag(x, y)) for (sx = -1; sx <= 1; sx += 2) for (sy = -1; sy <= 1; sy += 2) { cx = x + sx; cy = y + sy; if (inPal(cx, cy) && (cy <= 2) === (y <= 2) && onDiag(cx, cy)) pa.push(cy * 9 + cx); }
    }
    PADJ[sq] = Int8Array.from(pa);
    // horse: [leg, dest ...]   elephant: [leg1, leg2, dest ...]
    var hs = [], es = [];
    for (d = 0; d < 4; d++) {
      var dx = ORTH[d][0], dy = ORTH[d][1], lx = x + dx, ly = y + dy;
      if (!inB(lx, ly)) continue;
      for (var sd = -1; sd <= 1; sd += 2) {
        var ax = dx === 0 ? sd : dx, ay = dx === 0 ? dy : sd;          // the diagonal direction that follows the orthogonal step
        var hx = lx + ax, hy = ly + ay;
        if (inB(hx, hy)) hs.push(ly * 9 + lx, hy * 9 + hx);
        var ex = hx + ax, ey = hy + ay;
        if (inB(hx, hy) && inB(ex, ey)) es.push(ly * 9 + lx, hy * 9 + hx, ey * 9 + ex);
      }
    }
    HORSE[sq] = Int8Array.from(hs); ELE[sq] = Int8Array.from(es);
    // soldier: forward and sideways; forward diagonals on the palace lines of the enemy palace
    for (var col = 1; col <= 2; col++) {
      var fw = col === CHO ? -1 : 1, so = [];
      if (inB(x, y + fw)) so.push((y + fw) * 9 + x);
      if (inB(x - 1, y)) so.push(y * 9 + x - 1);
      if (inB(x + 1, y)) so.push(y * 9 + x + 1);
      if (onDiag(x, y) && (col === CHO ? y <= 2 : y >= 7)) for (sx = -1; sx <= 1; sx += 2) { cx = x + sx; cy = y + fw; if (inPal(cx, cy) && onDiag(cx, cy)) so.push(cy * 9 + cx); }
      SOLD[col][sq] = Int8Array.from(so);
    }
  }
  // reverse tables for the attack test (squares that attack `dest`)
  for (sq = 0; sq < 90; sq++) { HATT[sq] = []; EATT[sq] = []; PATT[1][sq] = []; PATT[2][sq] = []; }
  for (sq = 0; sq < 90; sq++) {
    for (k = 0; k < HORSE[sq].length; k += 2) HATT[HORSE[sq][k + 1]].push(sq, HORSE[sq][k]);
    for (k = 0; k < ELE[sq].length; k += 3) EATT[ELE[sq][k + 2]].push(sq, ELE[sq][k], ELE[sq][k + 1]);
    for (var c2 = 1; c2 <= 2; c2++) for (k = 0; k < SOLD[c2][sq].length; k++) PATT[c2][SOLD[c2][sq][k]].push(sq);
  }

  /* ---------- evaluation tables (score from Cho's point of view) and Zobrist keys ---------- */
  var VALS = new Int16Array(24 * 90), ZH1 = new Int32Array(24 * 90), ZH2 = new Int32Array(24 * 90), ZT1, ZT2;
  (function () {
    var s = 123456789;
    function rnd() { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s | 0; }
    for (var p = 0; p < 24 * 90; p++) { ZH1[p] = rnd(); ZH2[p] = rnd(); }
    ZT1 = rnd(); ZT2 = rnd();
    for (var col = 1; col <= 2; col++) for (var t = 1; t <= 7; t++) for (var q = 0; q < 90; q++) {
      var qx = q % 9, qy = (q / 9) | 0, ry = col === CHO ? 9 - qy : qy, cen = 4 - Math.abs(qx - 4), v = BASE[t];
      if (t === 7) { v += Math.max(0, ry - 3) * 14 + (ry >= 5 ? 30 : 0) + (ry >= 7 ? 30 : 0) + cen * 3; }
      else if (t === 5) { v += cen * 2 + (ry >= 7 ? 25 : 0); }
      else if (t === 6) { v += cen * 2; }
      else if (t === 4) { v += cen * 5 + Math.min(ry, 6) * 4; }
      else if (t === 3) { v += cen * 3; }
      VALS[(col << 3 | t) * 90 + q] = col === CHO ? v : -v;
    }
  })();

  /* ---------- attack test: is `sq` attacked by colour `by`? (used for the general's square) ---------- */
  function attacked(b, sq, by) {
    var rays = RAYS[sq], vert = RAYV[sq], pR = by << 3 | 5, pC = by << 3 | 6, pK = by << 3 | 1, r, n, i, p, q;
    for (r = 0; r < rays.length; r++) {
      var ray = rays[r]; n = ray.length; i = 0; p = 0;
      while (i < n && !(p = b[ray[i]])) i++;
      if (i >= n) continue;
      if (p === pR) return true;
      if (p === pK && vert[r]) return true;                              // generals facing each other
      if ((p & 7) !== 6) {                                               // p is the screen of a cannon (never another cannon)
        i++; q = 0;
        while (i < n && !(q = b[ray[i]])) i++;
        if (i < n && q === pC) return true;
      }
    }
    var a = HATT[sq], pH = by << 3 | 4;
    for (i = 0; i < a.length; i += 2) if (b[a[i]] === pH && !b[a[i + 1]]) return true;
    a = EATT[sq]; var pE = by << 3 | 3;
    for (i = 0; i < a.length; i += 3) if (b[a[i]] === pE && !b[a[i + 1]] && !b[a[i + 2]]) return true;
    a = PATT[by][sq]; var pP = by << 3 | 7;
    for (i = 0; i < a.length; i++) if (b[a[i]] === pP) return true;
    return false;
  }

  /* ---------- position ---------- */
  function Position() {
    this.b = new Int8Array(90); this.turn = CHO; this.king = [0, 0, 0]; this.h1 = 0; this.h2 = 0; this.score = 0; this.clock = 0; this.n = 0;
    this.stM = new Int32Array(2048); this.stCap = new Int8Array(2048); this.stClock = new Int16Array(2048);
    this.stH1 = new Int32Array(2048); this.stH2 = new Int32Array(2048); this.stScore = new Int32Array(2048);
  }
  var PP = Position.prototype;
  PP.clear = function () { this.b.fill(0); this.n = 0; this.clock = 0; this.king = [0, 0, 0]; };
  PP.finish = function (turn) {
    this.turn = turn; this.h1 = turn === CHO ? 0 : ZT1; this.h2 = turn === CHO ? 0 : ZT2; this.score = 0;
    for (var q = 0; q < 90; q++) { var p = this.b[q]; if (!p) continue; this.h1 ^= ZH1[p * 90 + q]; this.h2 ^= ZH2[p * 90 + q]; this.score += VALS[p * 90 + q]; if ((p & 7) === 1) this.king[p >> 3] = q; }
  };
  // formations (the squares b, c, g, h of the back rank as seen from the own side): 0 HEEH, 1 EHHE, 2 EHEH, 3 HEHE
  var FORMS = ['HEEH', 'EHHE', 'EHEH', 'HEHE'];
  PP.setup = function (choForm, hanForm) {
    this.clear();
    var b = this.b;
    [CHO, HAN].forEach(function (col) {
      var form = FORMS[col === CHO ? choForm : hanForm], back = col === CHO ? 9 : 0, kingY = col === CHO ? 8 : 1, sol = col === CHO ? 6 : 3, can = col === CHO ? 7 : 2;
      function put(xx, yy, t) { var rx = col === CHO ? xx : 8 - xx; b[yy * 9 + rx] = col << 3 | t; }
      put(0, back, 5); put(8, back, 5); put(3, back, 2); put(5, back, 2); put(4, kingY, 1);
      [1, 2, 6, 7].forEach(function (xx, j) { put(xx, back, form[j] === 'H' ? 4 : 3); });
      put(1, can, 6); put(7, can, 6);
      for (var j = 0; j < 5; j++) put(j * 2, sol, 7);
    });
    this.finish(CHO);
  };
  // rows: 10 strings of 9 chars, upper case = Cho, lower case = Han, '.' empty (K A E H R C P)
  PP.loadRows = function (rows, turn) {
    this.clear();
    for (var yy = 0; yy < 10; yy++) for (var xx = 0; xx < 9; xx++) {
      var ch = rows[yy][xx], t = LETTERS.indexOf(ch.toUpperCase());
      if (ch !== '.' && ch !== ' ' && t > 0) this.b[yy * 9 + xx] = (ch === ch.toUpperCase() ? CHO : HAN) << 3 | t;
    }
    this.finish(turn || CHO);
  };
  PP.toRows = function () {
    var o = [];
    for (var yy = 0; yy < 10; yy++) { var s = ''; for (var xx = 0; xx < 9; xx++) { var p = this.b[yy * 9 + xx]; s += p ? (p >> 3 === CHO ? LETTERS[p & 7] : LETTERS[p & 7].toLowerCase()) : '.'; } o.push(s); }
    return o;
  };
  PP.make = function (m) {
    var n = this.n;
    this.stM[n] = m; this.stClock[n] = this.clock; this.stH1[n] = this.h1; this.stH2[n] = this.h2; this.stScore[n] = this.score;
    if (m === PASS) { this.stCap[n] = 0; this.clock++; }
    else {
      var b = this.b, f = m & 127, to = m >> 7, p = b[f], cap = b[to];
      this.stCap[n] = cap; b[to] = p; b[f] = 0;
      this.h1 ^= ZH1[p * 90 + f] ^ ZH1[p * 90 + to]; this.h2 ^= ZH2[p * 90 + f] ^ ZH2[p * 90 + to];
      this.score += VALS[p * 90 + to] - VALS[p * 90 + f];
      if (cap) { this.h1 ^= ZH1[cap * 90 + to]; this.h2 ^= ZH2[cap * 90 + to]; this.score -= VALS[cap * 90 + to]; this.clock = 0; } else this.clock++;
      if ((p & 7) === 1) this.king[p >> 3] = to;
    }
    this.turn = 3 - this.turn; this.h1 ^= ZT1; this.h2 ^= ZT2; this.n = n + 1;
  };
  PP.unmake = function () {
    var n = --this.n, m = this.stM[n];
    this.turn = 3 - this.turn; this.clock = this.stClock[n]; this.h1 = this.stH1[n]; this.h2 = this.stH2[n]; this.score = this.stScore[n];
    if (m !== PASS) {
      var b = this.b, f = m & 127, to = m >> 7, p = b[to];
      b[f] = p; b[to] = this.stCap[n];
      if ((p & 7) === 1) this.king[p >> 3] = f;
    }
  };
  PP.inCheck = function (col) { return attacked(this.b, this.king[col], 3 - col); };
  // pseudo-legal moves of the side to move into buf; returns the count (caps: captures only)
  PP.gen = function (buf, caps) {
    var b = this.b, me = this.turn, n = 0, f, p, t, to, q, a, i, r, ray, j, m;
    for (f = 0; f < 90; f++) {
      p = b[f]; if (!p || (p >> 3) !== me) continue;
      t = p & 7; m = f;
      switch (t) {
        case 1: case 2:
          a = PADJ[f];
          for (i = 0; i < a.length; i++) { to = a[i]; q = b[to]; if (q ? (q >> 3) === me : caps) continue; buf[n++] = m | to << 7; }
          break;
        case 3:
          a = ELE[f];
          for (i = 0; i < a.length; i += 3) { if (b[a[i]] || b[a[i + 1]]) continue; to = a[i + 2]; q = b[to]; if (q ? (q >> 3) === me : caps) continue; buf[n++] = m | to << 7; }
          break;
        case 4:
          a = HORSE[f];
          for (i = 0; i < a.length; i += 2) { if (b[a[i]]) continue; to = a[i + 1]; q = b[to]; if (q ? (q >> 3) === me : caps) continue; buf[n++] = m | to << 7; }
          break;
        case 5:
          a = RAYS[f];
          for (r = 0; r < a.length; r++) {
            ray = a[r];
            for (j = 0; j < ray.length; j++) {
              to = ray[j]; q = b[to];
              if (!q) { if (!caps) buf[n++] = m | to << 7; }
              else { if ((q >> 3) !== me) buf[n++] = m | to << 7; break; }
            }
          }
          break;
        case 6:
          a = RAYS[f];
          for (r = 0; r < a.length; r++) {
            ray = a[r]; j = 0;
            while (j < ray.length && !b[ray[j]]) j++;
            if (j >= ray.length || (b[ray[j]] & 7) === 6) continue;          // no screen, or the screen is a cannon
            for (j++; j < ray.length; j++) {
              to = ray[j]; q = b[to];
              if (!q) { if (!caps) buf[n++] = m | to << 7; }
              else { if ((q >> 3) !== me && (q & 7) !== 6) buf[n++] = m | to << 7; break; }
            }
          }
          break;
        case 7:
          a = SOLD[me][f];
          for (i = 0; i < a.length; i++) { to = a[i]; q = b[to]; if (q ? (q >> 3) === me : caps) continue; buf[n++] = m | to << 7; }
          break;
      }
    }
    return n;
  };
  var tmp = new Int32Array(256);
  // legal moves of the side to move (array of ints); the pass is included only when asked for and the side is not in check
  PP.legalMoves = function (withPass) {
    var me = this.turn, n = this.gen(tmp, false), out = [], i, m;
    for (i = 0; i < n; i++) {
      m = tmp[i]; this.make(m);
      var bad = attacked(this.b, this.king[me], 3 - me);
      this.unmake();
      if (!bad) out.push(m);
    }
    if (withPass && !attacked(this.b, this.king[me], 3 - me)) out.push(PASS);
    return out;
  };
  // how often the current position has occurred (this one included); only positions since the last capture can repeat
  PP.repCount = function () {
    var c = 1, n = this.n, lo = Math.max(0, n - this.clock);
    for (var i = n - 2; i >= lo; i -= 2) if (this.stH1[i] === this.h1 && this.stH2[i] === this.h2) c++;
    return c;
  };
  PP.points = function (col) {
    var s = col === HAN ? 1.5 : 0;
    for (var q = 0; q < 90; q++) { var p = this.b[q]; if (p && (p >> 3) === col) s += POINTS[p & 7]; }
    return s;
  };
  PP.evalStm = function () { return this.turn === CHO ? this.score : -this.score; };

  root.Janggi = { CHO: CHO, HAN: HAN, PASS: PASS, CLOCK_LIMIT: CLOCK_LIMIT, FORMS: FORMS, BASE: BASE, Position: Position, attacked: attacked,
    from: function (m) { return m & 127; }, to: function (m) { return m >> 7; }, mk: function (f, t) { return f | t << 7; } };
})(typeof self !== 'undefined' ? self : this);
