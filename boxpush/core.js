// Box Push - rules, level generator and solver (no DOM: used by game.js and tested headless).
//   level = { w, h, wall: [0/1 per cell], goals: [cell], boxes: [cell], player: cell, solution: 'UDLR...' }     cell = y * w + x
//   Levels are made backwards: boxes start on the goals and are pulled around by random legal pulls, so every generated level can be solved
//   (level.solution is the reverse of those pulls; the A* solver below usually finds a much shorter one).
(function (root) {
  'use strict';
  var DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0], DL = 'UDLR';

  function rng(seed) {
    var a = seed | 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function nb(L, c, d) {                     // neighbour cell in direction d, -1 outside
    var x = c % L.w + DX[d], y = ((c / L.w) | 0) + DY[d];
    return (x < 0 || y < 0 || x >= L.w || y >= L.h) ? -1 : y * L.w + x;
  }
  function isFloor(L, c) { return c >= 0 && !L.wall[c]; }

  // cells the player can reach (boxes block); returns Uint8Array
  function reach(L, boxes, player) {
    var seen = new Uint8Array(L.w * L.h), bx = new Uint8Array(L.w * L.h), q = [player], i, d, n;
    for (i = 0; i < boxes.length; i++) bx[boxes[i]] = 1;
    seen[player] = 1;
    for (i = 0; i < q.length; i++) for (d = 0; d < 4; d++) { n = nb(L, q[i], d); if (n >= 0 && !L.wall[n] && !bx[n] && !seen[n]) { seen[n] = 1; q.push(n); } }
    return seen;
  }
  // shortest walk (letters) from a to b without pushing; null if none
  function walk(L, boxes, a, b) {
    if (a === b) return '';
    var prev = new Int32Array(L.w * L.h).fill(-2), bx = new Uint8Array(L.w * L.h), q = [a], i, d, n;
    for (i = 0; i < boxes.length; i++) bx[boxes[i]] = 1;
    prev[a] = -1;
    for (i = 0; i < q.length; i++) {
      for (d = 0; d < 4; d++) {
        n = nb(L, q[i], d);
        if (n < 0 || L.wall[n] || bx[n] || prev[n] !== -2) continue;
        prev[n] = q[i] * 4 + d; q.push(n);
        if (n === b) { var s = ''; while (prev[n] >= 0) { s = DL[prev[n] & 3] + s; n = prev[n] >> 2; } return s; }
      }
    }
    return null;
  }

  /* ---------- play state ---------- */
  function newPlay(L) { return { L: L, boxes: L.boxes.slice(), player: L.player, moves: 0, pushes: 0, hist: [] }; }
  function boxAt(P, c) { return P.boxes.indexOf(c); }
  function move(P, d) {                       // returns 0 (blocked), 1 (walked), 2 (pushed)
    var L = P.L, np = nb(L, P.player, d);
    if (!isFloor(L, np)) return 0;
    var bi = boxAt(P, np);
    if (bi >= 0) {
      var nn = nb(L, np, d);
      if (!isFloor(L, nn) || boxAt(P, nn) >= 0) return 0;
      P.boxes[bi] = nn; P.pushes++;
      P.hist.push({ d: d, box: bi });
    } else P.hist.push({ d: d, box: -1 });
    P.player = np; P.moves++;
    return bi >= 0 ? 2 : 1;
  }
  function undo(P) {
    var h = P.hist.pop(); if (!h) return false;
    var L = P.L, back = nb(L, P.player, h.d ^ 1);
    if (h.box >= 0) { P.boxes[h.box] = nb(L, P.player, h.d); P.pushes--; }
    P.player = back; P.moves--;
    return true;
  }
  function solved(P) { for (var i = 0; i < P.boxes.length; i++) if (P.L.goals.indexOf(P.boxes[i]) < 0) return false; return true; }

  /* ---------- generator ---------- */
  function gen(seed, w, h, nBoxes, density) {
    var R = rng(seed), tries = 0;
    for (;;) {
      var L = tryGen(R, w, h, nBoxes, density);
      if (L && (L.pushes >= nBoxes * 4 || tries > 40)) return L;
      if (++tries > 80) { w++; h++; tries = 0; }          // (a board too small for that many boxes: grow it)
    }
  }
  function tryGen(R, w, h, nBoxes, density) {
    var L = { w: w, h: h, wall: new Array(w * h).fill(0), goals: [], boxes: [], player: 0, solution: '' }, i, c;
    for (i = 0; i < w * h; i++) { var x = i % w, y = (i / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || R() < density) L.wall[i] = 1; }
    // keep one connected floor region (the biggest); fill the rest
    var seen = new Int32Array(w * h).fill(-1), best = -1, bestN = 0, reg = 0, cnt = [];
    for (i = 0; i < w * h; i++) {
      if (L.wall[i] || seen[i] >= 0) continue;
      var q = [i], k; seen[i] = reg;
      for (k = 0; k < q.length; k++) for (var d = 0; d < 4; d++) { var n = nb(L, q[k], d); if (n >= 0 && !L.wall[n] && seen[n] < 0) { seen[n] = reg; q.push(n); } }
      cnt[reg] = q.length; if (q.length > bestN) { bestN = q.length; best = reg; } reg++;
    }
    var floor = [];
    for (i = 0; i < w * h; i++) { if (!L.wall[i] && seen[i] !== best) L.wall[i] = 1; if (!L.wall[i]) floor.push(i); }
    if (floor.length < nBoxes * 5 + 6) return null;
    // goals / boxes
    var pool = floor.slice(), goals = [];
    for (i = 0; i < nBoxes; i++) goals.push(pool.splice((R() * pool.length) | 0, 1)[0]);
    L.goals = goals.slice(); L.boxes = goals.slice();
    var player = pool[(R() * pool.length) | 0], pulls = [], P = { L: L, boxes: L.boxes, player: player };
    var want = nBoxes * 24 + w * 3, att = 0, lastBox = -1;
    while (pulls.length < want && att++ < want * 6) {
      var rc = reach(L, P.boxes, P.player), cand = [];
      for (var bi = 0; bi < P.boxes.length; bi++) for (d = 0; d < 4; d++) {
        var cb = P.boxes[bi], qq = nb(L, cb, d ^ 1), q2 = qq >= 0 ? nb(L, qq, d ^ 1) : -1;     // player stands at qq (behind the box), steps back to q2 dragging the box to qq
        if (qq >= 0 && q2 >= 0 && rc[qq] && isFloor(L, q2) && P.boxes.indexOf(q2) < 0) cand.push([bi, d, qq, q2]);
      }
      if (!cand.length) break;
      var pick = cand[(R() * cand.length) | 0];
      if (lastBox >= 0 && R() < 0.5) { var same = cand.filter(function (z) { return z[0] === lastBox; }); if (same.length) pick = same[(R() * same.length) | 0]; }
      P.boxes[pick[0]] = pick[2]; P.player = pick[3]; lastBox = pick[0];
      pulls.push([pick[3], pick[1]]);           // forward: stand at q2, push in direction d
    }
    var off = 0; for (i = 0; i < P.boxes.length; i++) if (L.goals.indexOf(P.boxes[i]) < 0) off++;
    if (off < Math.max(1, Math.ceil(nBoxes * 0.6))) return null;
    L.boxes = P.boxes.slice(); L.player = P.player; L.pushes = pulls.length;
    // forward solution: undo the pulls from the last one
    var F = newPlay(L), sol = '';
    for (i = pulls.length - 1; i >= 0; i--) {
      var wk = walk(L, F.boxes, F.player, pulls[i][0]);
      if (wk === null) return null;
      sol += wk; for (var z = 0; z < wk.length; z++) move(F, DL.indexOf(wk[z]));
      sol += DL[pulls[i][1]]; move(F, pulls[i][1]);
    }
    if (!solved(F)) return null;
    L.solution = sol;
    return L;
  }

  /* ---------- solver (A* over pushes) ---------- */
  function deadTable(L) {                     // push distance of a box on each cell to the nearest goal (-1: cannot reach any goal)
    var dist = new Int32Array(L.w * L.h).fill(-1), q = [], i, d;
    for (i = 0; i < L.goals.length; i++) { dist[L.goals[i]] = 0; q.push(L.goals[i]); }
    for (i = 0; i < q.length; i++) for (d = 0; d < 4; d++) {
      var prev = nb(L, q[i], d ^ 1), stand = prev >= 0 ? nb(L, prev, d ^ 1) : -1;      // a box at prev pushed in direction d lands on q[i]
      if (prev >= 0 && stand >= 0 && !L.wall[prev] && !L.wall[stand] && dist[prev] < 0) { dist[prev] = dist[q[i]] + 1; q.push(prev); }
    }
    return dist;
  }
  function frozen(L, bx, c) {                 // a 2x2 block of walls / boxes around c that is not all goals
    var x = c % L.w, y = (c / L.w) | 0, sx, sy;
    function blocked(xx, yy) { if (xx < 0 || yy < 0 || xx >= L.w || yy >= L.h) return true; var k = yy * L.w + xx; return L.wall[k] || bx[k]; }
    for (sx = -1; sx <= 1; sx += 2) for (sy = -1; sy <= 1; sy += 2) {
      if (blocked(x + sx, y) && blocked(x, y + sy) && blocked(x + sx, y + sy)) {
        var cells = [c, y * L.w + x + sx, (y + sy) * L.w + x, (y + sy) * L.w + x + sx], allGoal = true;
        for (var i = 0; i < 4; i++) { var k = cells[i]; if (k >= 0 && k < L.w * L.h && !L.wall[k] && L.goals.indexOf(k) < 0) allGoal = false; }
        if (!allGoal) return true;
      }
    }
    return false;
  }
  function solve(L, boxes0, player0, limitMs) {
    var dist = deadTable(L), t0 = Date.now(), n = L.w * L.h;
    function hOf(boxes) { var s = 0; for (var i = 0; i < boxes.length; i++) { var d = dist[boxes[i]]; if (d < 0) return -1; s += d; } return s; }
    var h0 = hOf(boxes0); if (h0 < 0) return null;
    var nodes = [], heap = [], seen = Object.create(null);
    function key(boxes, rc) { var m = 0; while (!rc[m]) m++; return boxes.slice().sort(function (a, b) { return a - b; }).join(',') + '|' + m; }
    function push(i) { heap.push(i); var k = heap.length - 1; while (k > 0) { var p = (k - 1) >> 1; if (nodes[heap[p]].f <= nodes[heap[k]].f) break; var t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } }
    function pop() { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var k = 0; for (;;) { var l = 2 * k + 1, r = l + 1, m = k; if (l < heap.length && nodes[heap[l]].f < nodes[heap[m]].f) m = l; if (r < heap.length && nodes[heap[r]].f < nodes[heap[m]].f) m = r; if (m === k) break; var t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } } return top; }
    var rc0 = reach(L, boxes0, player0);
    nodes.push({ boxes: boxes0.slice(), player: player0, g: 0, f: 1.6 * h0, parent: -1, stand: -1, dir: 0 }); seen[key(boxes0, rc0)] = 1; push(0);
    var exp = 0, goalNode = -1;
    while (heap.length) {
      if ((++exp & 255) === 0 && Date.now() - t0 > limitMs) return null;
      var ci = pop(), nd = nodes[ci], h = hOf(nd.boxes);
      if (h === 0) { goalNode = ci; break; }
      var rc = reach(L, nd.boxes, nd.player), bxset = new Uint8Array(n), i, d;
      for (i = 0; i < nd.boxes.length; i++) bxset[nd.boxes[i]] = 1;
      for (i = 0; i < nd.boxes.length; i++) for (d = 0; d < 4; d++) {
        var b = nd.boxes[i], stand = nb(L, b, d ^ 1), dest = nb(L, b, d);
        if (stand < 0 || dest < 0 || !rc[stand] || L.wall[dest] || bxset[dest] || dist[dest] < 0) continue;
        bxset[b] = 0; bxset[dest] = 1;
        var bad = frozen(L, bxset, dest);
        bxset[b] = 1; bxset[dest] = 0;
        if (bad) continue;
        var nbx = nd.boxes.slice(); nbx[i] = dest;
        var nrc = reach(L, nbx, b), kk = key(nbx, nrc);
        if (seen[kk]) continue; seen[kk] = 1;
        var hh = hOf(nbx);
        nodes.push({ boxes: nbx, player: b, g: nd.g + 1, f: nd.g + 1 + 1.6 * hh, parent: ci, stand: stand, dir: d });
        push(nodes.length - 1);
      }
    }
    if (goalNode < 0) return null;
    var chain = []; for (var k = goalNode; nodes[k].parent >= 0; k = nodes[k].parent) chain.push(k);
    chain.reverse();
    var cur = { L: L, boxes: boxes0.slice(), player: player0, hist: [], moves: 0, pushes: 0 }, out = '';
    for (var j = 0; j < chain.length; j++) {
      var nn = nodes[chain[j]], wk = walk(L, cur.boxes, cur.player, nn.stand);
      if (wk === null) return null;
      out += wk + DL[nn.dir];
      for (var z = 0; z < wk.length; z++) move(cur, DL.indexOf(wk[z]));
      move(cur, nn.dir);
    }
    return out;
  }

  root.BoxPush = { DL: DL, nb: nb, newPlay: newPlay, move: move, undo: undo, solved: solved, gen: gen, solve: solve, walk: walk, reach: reach,
    params: function (lv) { var size = Math.min(12, 7 + Math.floor((lv - 1) / 3)), boxes = Math.min(9, 1 + Math.floor((lv - 1) / 2)); return { w: size, h: size, boxes: boxes, density: Math.min(0.2, 0.08 + lv * 0.005) }; },
    // a level of the given difficulty; candidates are generated until the solver shows that the best solution needs enough pushes
    level: function (lv, variant) {
      var p = root.BoxPush.params(lv), want = 4 + 3 * p.boxes, best = null, bestPush = -1, base = (lv * 7919 + 13 + (variant || 0) * 104729) | 0;
      for (var a = 0; a < 40; a++) {
        var L = gen((base + a * 977) | 0, p.w, p.h, p.boxes, p.density), sol = solve(L, L.boxes, L.player, 250);
        if (!sol) continue;
        var P = newPlay(L); for (var i = 0; i < sol.length; i++) move(P, DL.indexOf(sol[i]));
        if (P.pushes > bestPush) { bestPush = P.pushes; best = L; L.solution = sol; L.minPushes = P.pushes; }
        if (bestPush >= want) break;
      }
      return best || gen(base, p.w, p.h, p.boxes, p.density);
    } };
})(typeof self !== 'undefined' ? self : this);
