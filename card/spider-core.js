/* Spider Solitaire rules + move heuristics (no DOM).
   card code = suit*16 + rank (rank 1..13).  A column is an array of codes (bottom -> top); down[c] = number of face-down cards at its bottom. */
(function (root) {
  'use strict';
  function rank(c) { return c & 15; }
  function suit(c) { return c >> 4; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function deck(suits) {
    var d = [], s, r, k, copies = 8 / suits;
    for (k = 0; k < copies; k++) for (s = 0; s < suits; s++) for (r = 1; r <= 13; r++) d.push(s * 16 + r);
    return d;
  }
  function newGame(suits, seed) {
    var d = deck(suits), R = rng(seed >>> 0), i, j, t;
    for (i = d.length - 1; i > 0; i--) { j = Math.floor(R() * (i + 1)); t = d[i]; d[i] = d[j]; d[j] = t; }
    var cols = [], down = [], p = 0, c;
    for (c = 0; c < 10; c++) { var n = c < 4 ? 6 : 5; cols.push(d.slice(p, p + n)); down.push(n - 1); p += n; }
    return { suits: suits, seed: seed >>> 0, cols: cols, down: down, stock: d.slice(p), found: 0, moves: 0, score: 500, foundSuits: [] };
  }
  function clone(s) { return { suits: s.suits, seed: s.seed, cols: s.cols.map(function (c) { return c.slice(); }), down: s.down.slice(), stock: s.stock.slice(), found: s.found, moves: s.moves, score: s.score, foundSuits: s.foundSuits.slice() }; }
  /* can the cards from idx to the top of column c be picked up (face up, same suit, descending by 1)? */
  function canTake(s, c, idx) {
    var col = s.cols[c], i;
    if (idx < s.down[c] || idx >= col.length) return false;
    for (i = idx; i < col.length - 1; i++) if (suit(col[i]) !== suit(col[i + 1]) || rank(col[i]) !== rank(col[i + 1]) + 1) return false;
    return true;
  }
  function canPut(s, idx, c, t) {
    if (t === c) return false;
    var col = s.cols[t], m = s.cols[c][idx];
    return col.length === 0 || rank(col[col.length - 1]) === rank(m) + 1;
  }
  function flipTop(s, c) { if (s.cols[c].length > 0 && s.down[c] >= s.cols[c].length) s.down[c] = s.cols[c].length - 1; }
  /* remove a finished K..A run at the top of column c; returns true if one was removed */
  function checkRun(s, c) {
    var col = s.cols[c], n = col.length;
    if (n - s.down[c] < 13) return false;
    var top = col[n - 1];
    if (rank(top) !== 1) return false;
    for (var i = 1; i < 13; i++) if (suit(col[n - 1 - i]) !== suit(top) || rank(col[n - 1 - i]) !== i + 1) return false;
    col.length = n - 13; s.found++; s.foundSuits.push(suit(top)); s.score += 100; flipTop(s, c);
    return true;
  }
  function move(s, c, idx, t) {
    if (!canTake(s, c, idx) || !canPut(s, idx, c, t)) return null;
    var cards = s.cols[c].splice(idx), r = { removed: false, flipped: false };
    Array.prototype.push.apply(s.cols[t], cards);
    var before = s.down[c]; flipTop(s, c); r.flipped = s.down[c] !== before;
    s.moves++; s.score--;
    r.removed = checkRun(s, t);
    return r;
  }
  function canDeal(s) { return s.stock.length >= 10 && s.cols.every(function (c) { return c.length > 0; }); }
  function deal(s) {
    if (!canDeal(s)) return null;
    var removed = 0;
    for (var c = 0; c < 10; c++) s.cols[c].push(s.stock.pop());
    for (c = 0; c < 10; c++) if (checkRun(s, c)) removed++;
    s.moves++; s.score--;
    return { removed: removed > 0 };
  }
  function won(s) { return s.found >= 8; }
  function runLen(s, c) {   /* length of the same-suit descending run on top of column c */
    var col = s.cols[c], n = col.length, i = n - 1;
    if (!n) return 0;
    while (i > s.down[c] && suit(col[i - 1]) === suit(col[i]) && rank(col[i - 1]) === rank(col[i]) + 1) i--;
    return n - i;
  }
  function key(s) { return s.cols.map(function (c, i) { return s.down[i] + ':' + c.join(','); }).join('|') + '#' + s.stock.length; }

  /* ---- heuristic move ranking (uses only what a player sees) */
  function candidates(s, noise, R) {
    var out = [], c, idx, t, emptyDone = false;
    for (c = 0; c < 10; c++) {
      var col = s.cols[c], n = col.length;
      if (!n) continue;
      for (idx = n - 1; idx >= s.down[c]; idx--) {
        if (!canTake(s, c, idx)) break;
        var m = col[idx], below = idx > 0 ? col[idx - 1] : 0, len = n - idx;
        var wholeFaceUp = idx === s.down[c], emptiesCol = idx === 0;
        emptyDone = false;
        for (t = 0; t < 10; t++) {
          if (t === c || !canPut(s, idx, c, t)) continue;
          var tc = s.cols[t], toEmpty = tc.length === 0;
          if (toEmpty) { if (emptyDone) continue; emptyDone = true; if (emptiesCol) continue; }
          var sc = 0;
          if (wholeFaceUp && idx > 0) sc += 60 + 4 * s.down[c];            /* turns a face-down card up */
          if (emptiesCol && !toEmpty) sc += 45;                            /* empties a column */
          var sameJoin = !toEmpty && suit(tc[tc.length - 1]) === suit(m);
          if (!toEmpty) {
            if (sameJoin) { sc += 28 + 2 * (runLen(s, t) + len); } else sc -= 12 + (s.suits > 1 ? 6 : 0);
          } else sc += -8 + (len >= 2 ? 3 * len : 0);
          /* leaving a chain: the card below is the same suit and one higher */
          var breaks = idx > s.down[c] && below && suit(below) === suit(m) && rank(below) === rank(m) + 1;
          if (breaks) sc -= 40;
          /* moving onto a card that is not in a chain while a same-suit alternative would exist is handled by the ranking itself */
          if (!wholeFaceUp && !breaks && !emptiesCol && sameJoin) sc += 3;
          /* a king gains nothing by moving to a non-empty column (cannot happen) ; kings like empty columns */
          if (toEmpty && rank(m) === 13 && idx > s.down[c]) sc += 6;
          if (noise) sc += R() * noise;
          out.push({ type: 'move', c: c, idx: idx, t: t, score: sc, len: len });
        }
      }
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }
  /* the best next action: the best move with positive worth that does not repeat a state, else deal, else null */
  function best(s, seen, noise, R) {
    var list = candidates(s, noise, R), i, k, c2, r;
    for (i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.score <= 0) break;
      if (seen) { c2 = clone(s); move(c2, m.c, m.idx, m.t); if (seen[key(c2)]) continue; }
      return m;
    }
    if (canDeal(s)) return { type: 'deal' };
    /* an empty column blocks the deal: fill it with the least harmful move */
    if (s.stock.length >= 10) {
      for (i = 0; i < list.length; i++) {
        if (s.cols[list[i].t].length === 0) {
          if (seen) { c2 = clone(s); move(c2, list[i].c, list[i].idx, list[i].t); if (seen[key(c2)]) continue; }
          return list[i];
        }
      }
    }
    for (i = 0; i < list.length; i++) {
      if (list[i].score > -30) { if (seen) { c2 = clone(s); move(c2, list[i].c, list[i].idx, list[i].t); if (seen[key(c2)]) continue; } return list[i]; }
    }
    return null;
  }
  /* ordered suggestions for the hint button: good moves first, then the deal */
  function hints(s) {
    var list = candidates(s).filter(function (m) { return m.score > 0; }), out = list.slice(0, 6);
    if (canDeal(s)) out.push({ type: 'deal' });
    else if (s.stock.length >= 10) { var e = candidates(s).filter(function (m) { return s.cols[m.t].length === 0 && out.indexOf(m) < 0; }); if (e.length) out.push(e[0]); }
    return out;
  }
  /* full automatic play (for the headless win-rate measure and the in-page solver) */
  function autoPlay(s, maxSteps, noise, R, acts) {
    var seen = {}, steps = 0;
    seen[key(s)] = 1;
    while (!won(s) && steps < (maxSteps || 3000)) {
      var m = best(s, seen, noise, R);
      if (!m) break;
      if (m.type === 'deal') deal(s); else move(s, m.c, m.idx, m.t);
      if (acts) acts.push(m.type === 'deal' ? { type: 'deal' } : { type: 'move', c: m.c, idx: m.idx, t: m.t });
      seen[key(s)] = 1; steps++;
    }
    return { won: won(s), steps: steps, found: s.found };
  }
  /* the solver behind "Solve Automatically": greedy play on a copy with random restarts (it looks at the face-down cards while simulating, i.e. it is a cheat).
     Returns the action list of the first winning run, else of the run that removed the most runs. */
  function plan(s, opts) {
    opts = opts || {};
    var maxRuns = opts.runs || 60, ms = opts.ms || 4000, t0 = Date.now(), bestRun = null, r, R = rng((opts.seed != null ? opts.seed : Math.floor(Math.random() * 4294967296)) >>> 0);
    for (r = 0; r < maxRuns; r++) {
      var c = clone(s), acts = [], res = autoPlay(c, opts.maxSteps || 900, r === 0 ? 0 : 6 + R() * 30, R, acts);
      var q = res.found * 1000 - c.down.reduce(function (a, b) { return a + b; }, 0) * 5 - acts.length * 0.01;
      if (!bestRun || q > bestRun.q) bestRun = { q: q, acts: acts, won: res.won, found: res.found };
      if (res.won || (Date.now() - t0 > ms)) break;
    }
    bestRun.runs = r + 1;
    return bestRun;
  }
  var SP = { rank: rank, suit: suit, newGame: newGame, clone: clone, canTake: canTake, canPut: canPut, move: move, deal: deal, canDeal: canDeal, won: won, runLen: runLen, key: key, candidates: candidates, best: best, hints: hints, autoPlay: autoPlay, plan: plan, checkRun: checkRun, deck: deck };
  root.SP = SP;
  if (typeof module !== 'undefined' && module.exports) module.exports = SP;
})(typeof window !== 'undefined' ? window : globalThis);
