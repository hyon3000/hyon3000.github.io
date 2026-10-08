/* Nonogram core: lines, clues, line solver (DP), propagation to fixpoint, generator, hint step finder.
   Works for dim 2 (n x n) and dim 3 (n x n x n). Cell index: 2D y*n+x, 3D (z*n+y)*n+x. */
(function (g) {
  'use strict';

  /* ---------- lines ---------- */
  var lineCache = {};
  function normDims(dim, d) { if (typeof d === 'number') { var r = []; for (var a = 0; a < dim; a++) r.push(d); return r; } return d.slice(0, dim); }
  function mkLines(dim, dims) {
    dims = normDims(dim, dims);
    var key = dim + ':' + dims.join('x'); if (lineCache[key]) return lineCache[key];
    var total = 1, a, stride = []; for (a = 0; a < dim; a++) { stride.push(total); total *= dims[a]; }
    var lines = [], byCell = [], i;
    for (i = 0; i < total; i++) byCell.push([]);
    function coords(i) { var c = []; for (var a = 0; a < dim; a++) { c.push(i % dims[a]); i = (i - c[a]) / dims[a]; } return c; }
    function index(c) { var i = 0; for (var a = 0; a < dim; a++) i += c[a] * stride[a]; return i; }
    // axis 0 = along x (a row in 2D), axis 1 = along y (a column in 2D), axis 2 = along z
    for (var axis = 0; axis < dim; axis++) {
      var others = [], cnt = 1; for (a = 0; a < dim; a++) if (a !== axis) { others.push(a); cnt *= dims[a]; }
      for (var o = 0; o < cnt; o++) {
        var rest = [], t = o; for (var k = 0; k < others.length; k++) { rest.push(t % dims[others[k]]); t = (t - rest[k]) / dims[others[k]]; }
        var cells = [], base = 0; for (k = 0; k < others.length; k++) base += rest[k] * stride[others[k]];
        for (var p = 0; p < dims[axis]; p++) cells.push(base + p * stride[axis]);
        var li = lines.length;
        lines.push({ axis: axis, pos: rest, cells: cells });
        for (var q = 0; q < cells.length; q++) byCell[cells[q]].push(li);
      }
    }
    return (lineCache[key] = { dim: dim, dims: dims, n: Math.max.apply(null, dims), total: total, stride: stride, lines: lines, byCell: byCell, coords: coords, index: index });
  }

  function runsOf(vals, cells) { // vals: array/typed array indexed by cell, 1 = filled
    var out = [], run = 0;
    for (var i = 0; i < cells.length; i++) {
      if (vals[cells[i]] === 1) run++; else if (run) { out.push(run); run = 0; }
    }
    if (run) out.push(run);
    return out;
  }
  function computeClues(L, sol) { return L.lines.map(function (ln) { return runsOf(sol, ln.cells); }); }
  function sameClue(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

  /* ---------- line solver ----------
     line: Int8Array(n) with -1 unknown, 0 empty, 1 filled. Returns Int8Array result (same convention, only more known) or null if contradictory. */
  function solveLine(clue, line) {
    var n = line.length, k = clue.length, W = k + 1, i, j, s;
    if (k === 0) { // nothing filled
      var r0 = new Int8Array(n); for (i = 0; i < n; i++) { if (line[i] === 1) return null; r0[i] = 0; } return r0;
    }
    // zc[i] = number of empty (0) cells in [0,i)
    var zc = new Int16Array(n + 1); for (i = 0; i < n; i++) zc[i + 1] = zc[i] + (line[i] === 0 ? 1 : 0);
    var pre = new Uint8Array((n + 1) * W), suf = new Uint8Array((n + 2) * W);
    pre[0] = 1;
    for (i = 1; i <= n; i++) {
      for (j = 0; j <= k; j++) {
        var v = 0;
        if (line[i - 1] !== 1 && pre[(i - 1) * W + j]) v = 1;
        if (!v && j > 0) {
          var L = clue[j - 1]; s = i - L;
          if (s >= 0 && zc[i] - zc[s] === 0) {
            if (s === 0) { if (j === 1) v = 1; } else if (line[s - 1] !== 1 && pre[(s - 1) * W + j - 1]) v = 1;
          }
        }
        pre[i * W + j] = v;
      }
    }
    if (!pre[n * W + k]) return null;
    suf[n * W + k] = 1;
    for (i = n - 1; i >= 0; i--) {
      for (j = k; j >= 0; j--) {
        var w = 0;
        if (line[i] !== 1 && suf[(i + 1) * W + j]) w = 1;
        if (!w && j < k) {
          var L2 = clue[j], e = i + L2;
          if (e <= n && zc[e] - zc[i] === 0) {
            if (e === n) { if (j === k - 1) w = 1; } else if (line[e] !== 1 && suf[(e + 1) * W + j + 1]) w = 1;
          }
        }
        suf[i * W + j] = w;
      }
    }
    var canFill = new Int16Array(n + 1), canEmpty = new Uint8Array(n);
    for (j = 0; j < k; j++) {
      var Lj = clue[j];
      for (s = 0; s + Lj <= n; s++) {
        if (zc[s + Lj] - zc[s] !== 0) continue;
        var e2 = s + Lj;
        var leftOk = s === 0 ? j === 0 : (line[s - 1] !== 1 && pre[(s - 1) * W + j]);
        if (!leftOk) continue;
        var rightOk = e2 === n ? j === k - 1 : (line[e2] !== 1 && suf[(e2 + 1) * W + j + 1]);
        if (!rightOk) continue;
        canFill[s]++; canFill[e2]--;
      }
    }
    var res = new Int8Array(n), run = 0;
    for (i = 0; i < n; i++) {
      run += canFill[i];
      var ce = 0;
      if (line[i] !== 1) for (j = 0; j <= k; j++) if (pre[i * W + j] && suf[(i + 1) * W + j]) { ce = 1; break; }
      var cf = run > 0;
      if (cf && ce) res[i] = -1; else if (cf) res[i] = 1; else if (ce) res[i] = 0; else return null;
      if (line[i] !== -1) res[i] = line[i];
    }
    return res;
  }

  /* propagate all lines to a fixpoint. state: Int8Array(total) -1/0/1 (modified in place).
     returns { ok, complete, unknown } */
  function propagate(L, clues, state) {
    var nl = L.lines.length, queue = [], inq = new Uint8Array(nl), qi = 0, i, li;
    for (li = 0; li < nl; li++) { queue.push(li); inq[li] = 1; }
    var bufs = {};
    while (qi < queue.length) {
      li = queue[qi++]; inq[li] = 0;
      var ln = L.lines[li], cells = ln.cells, len = cells.length, buf = bufs[len] || (bufs[len] = new Int8Array(len));
      for (i = 0; i < len; i++) buf[i] = state[cells[i]];
      var r = solveLine(clues[li], buf);
      if (!r) return { ok: false, complete: false, unknown: -1 };
      for (i = 0; i < len; i++) {
        if (r[i] !== buf[i]) {
          state[cells[i]] = r[i];
          var bc = L.byCell[cells[i]];
          for (var b = 0; b < bc.length; b++) { var l2 = bc[b]; if (l2 !== li && !inq[l2]) { inq[l2] = 1; queue.push(l2); } }
        }
      }
    }
    var unk = 0; for (i = 0; i < L.total; i++) if (state[i] < 0) unk++;
    return { ok: true, complete: unk === 0, unknown: unk };
  }

  /* ---------- generator ---------- */
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function densityRange(dim, n, total) {
    if (dim === 3) return [0.45, 0.55];
    if (total <= 30) return [0.5, 0.62];
    return [0.5, 0.6];
  }

  function generate(dim, dimsIn, opts) {
    opts = opts || {};
    var rnd = opts.rng || Math.random, L = mkLines(dim, dimsIn), total = L.total, dr = opts.density || densityRange(dim, L.n, total);
    var t0 = Date.now(), tries = 0, flips = 0, i;
    var maxTries = opts.maxTries || 2000, maxIter = Math.max(dim === 3 ? 80 : 60, Math.round(total / 8));
    while (tries < maxTries) {
      tries++;
      var p = dr[0] + rnd() * (dr[1] - dr[0]);
      var sol = new Int8Array(total), cnt = Math.round(p * total), perm = [];
      for (i = 0; i < total; i++) perm.push(i);
      for (i = total - 1; i > 0; i--) { var jj = Math.floor(rnd() * (i + 1)), tmp = perm[i]; perm[i] = perm[jj]; perm[jj] = tmp; }
      for (i = 0; i < cnt; i++) sol[perm[i]] = 1;
      for (var it = 0; it < maxIter; it++) {
        var clues = computeClues(L, sol), st = new Int8Array(total).fill(-1);
        var r = propagate(L, clues, st);
        if (r.complete) {
          var d = cnt / total;
          if (d >= dr[0] - 0.02 && d <= dr[1] + 0.02 && cnt > 0) return { sol: sol, clues: clues, tries: tries, flips: flips, ms: Date.now() - t0 };
          break;
        }
        // repair: flip one undetermined cell (this changes its lines' clues, usually breaking the ambiguity)
        var unk = []; for (i = 0; i < total; i++) if (st[i] < 0) unk.push(i);
        var u = unk[Math.floor(rnd() * unk.length)];
        // keep density in range: prefer flipping towards the middle of the range
        var d2 = cnt / total, want = (dr[0] + dr[1]) / 2;
        if (sol[u] === 1 && d2 < dr[0] + 0.01 || sol[u] === 0 && d2 > dr[1] - 0.01) {
          // flipping would leave the range: pick another unknown cell with the opposite value if there is one
          var alt = unk.filter(function (x) { return sol[x] !== sol[u]; });
          if (alt.length) u = alt[Math.floor(rnd() * alt.length)];
        }
        cnt += sol[u] ? -1 : 1; sol[u] = sol[u] ? 0 : 1; flips++;
        void want;
      }
    }
    return null;
  }

  /* ---------- deduction step finding (hint / auto) ---------- */
  var TYPE_RANK = { zero: 0, full: 1, done: 2, overlap: 3, logic: 4 };

  function classify(clue, line) {
    var n = line.length, k = clue.length;
    if (k === 0) return 'zero';
    var sum = 0; for (var i = 0; i < k; i++) sum += clue[i];
    if (sum + k - 1 === n) return 'full';
    var filled = 0, known = 0; for (i = 0; i < n; i++) { if (line[i] === 1) filled++; if (line[i] >= 0) known++; }
    if (filled === sum) return 'done';
    if (known === 0) return 'overlap';
    return 'logic';
  }

  /* state: Int8Array (-1/0/1). Returns the easiest line with a new deduction:
     { li, type, clue, changes: [[cell,val],...], unknown } | null if none ; {contradiction:true} if inconsistent */
  function findStep(L, clues, state) {
    var best = null, nl = L.lines.length;
    for (var li = 0; li < nl; li++) {
      var cells = L.lines[li].cells, unk = 0, i, len = cells.length, buf = new Int8Array(len);
      for (i = 0; i < len; i++) { buf[i] = state[cells[i]]; if (buf[i] < 0) unk++; }
      if (!unk) continue;
      var r = solveLine(clues[li], buf);
      if (!r) return { contradiction: true, li: li };
      var ch = [];
      for (i = 0; i < len; i++) if (r[i] !== buf[i]) ch.push([cells[i], r[i]]);
      if (!ch.length) continue;
      var type = classify(clues[li], buf), rank = TYPE_RANK[type];
      if (!best || rank < best.rank || (rank === best.rank && unk < best.unknown)) best = { li: li, type: type, rank: rank, clue: clues[li], changes: ch, unknown: unk };
    }
    return best;
  }

  /* is a line "wrong" given marks (1 filled, 2 crossed, 0 blank)? contradiction with the clue */
  function lineBad(L, li, clue, marks) {
    var cells = L.lines[li].cells, len = cells.length, buf = new Int8Array(len);
    for (var i = 0; i < len; i++) buf[i] = marks[cells[i]] === 1 ? 1 : marks[cells[i]] === 2 ? 0 : -1;
    return solveLine(clue, buf) === null;
  }

  g.NG = { mkLines: mkLines, normDims: normDims, runsOf: runsOf, computeClues: computeClues, sameClue: sameClue, solveLine: solveLine, propagate: propagate,
    generate: generate, mulberry: mulberry, findStep: findStep, lineBad: lineBad, densityRange: densityRange };
})(typeof window !== 'undefined' ? window : globalThis);
