// Plugs the open-source Gomoku engine Rapfi (GPL-3, WebAssembly, see engine/omok/README.md) into omok.html (window.attachEngine(fn)).
//   fn(state, level) -> Promise({x, y})
//   state = { size: 15, rule: 'free' | 'std', moves: [{x, y}, ...] }      moves alternate Black, White, Black ... ; the side to move is the engine
//   level 1 = Easy (depth-4 search, 15% random nearby moves), 2 = Normal (0.6 s), 3 = Hard (3 s, depth ~20 on a PC)
// The engine runs in engine/omok/worker.js (Web Worker). If it cannot be started (old browser, file:// ...), a small built-in pattern scorer answers instead,
// so the game stays playable (omokEngine.mode tells which one is used: 'rapfi' | 'fallback' | 'loading').
(function () {
  'use strict';
  var base = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^\/]*$/, '') : ''; })();
  var N = 15;
  var LV = {
    1: { ms: 100, depth: 4, nodes: 0, rnd: 0.15 },
    2: { ms: 600, depth: 99, nodes: 0, rnd: 0 },
    3: { ms: 3000, depth: 99, nodes: 0, rnd: 0 }
  };
  var worker = null, ready = false, failed = false, seq = 0, pend = {}, status = '';

  function setStatus(s) { status = s; try { if (window.onEngineStatus) window.onEngineStatus(s); } catch (e) {} }
  function start() {
    if (worker || failed) return;
    try { worker = new Worker(base + 'engine/omok/worker.js'); } catch (e) { fail(); return; }
    ready = false; setStatus('loading');
    worker.onmessage = function (e) {
      var m = e.data;
      if (m.type === 'ready') { ready = true; fn.mode = 'rapfi'; setStatus(''); }
      else if (m.type === 'fail') fail();
      else if (m.id && pend[m.id]) { var p = pend[m.id]; delete pend[m.id]; p(m); }
    };
    worker.onerror = function () { fail(); };
    worker.postMessage({ type: 'init' });
  }
  function fail() {
    failed = true; fn.mode = 'fallback'; setStatus('');
    try { worker && worker.terminate(); } catch (e) {}
    worker = null;
    var ids = Object.keys(pend); ids.forEach(function (k) { var p = pend[k]; delete pend[k]; p({ type: 'error', msg: 'worker' }); });
  }
  // drops the running search (the worker is blocked until its search ends, so it is replaced)
  function cancel() {
    if (!worker || !Object.keys(pend).length) return;
    pend = {}; try { worker.terminate(); } catch (e) {}
    worker = null; ready = false; start();
  }

  /* ---------- helpers on a plain board ---------- */
  function mkBoard(moves) { var b = new Uint8Array(N * N); moves.forEach(function (m, i) { b[m.y * N + m.x] = (i & 1) ? 2 : 1; }); return b; }
  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  function runLen(b, x, y, c, dx, dy) {          // length of the run of colour c through (x,y) (the point itself counts)
    var n = 1, i, px, py;
    for (i = 1; ; i++) { px = x + dx * i; py = y + dy * i; if (px < 0 || py < 0 || px >= N || py >= N || b[py * N + px] !== c) break; n++; }
    for (i = 1; ; i++) { px = x - dx * i; py = y - dy * i; if (px < 0 || py < 0 || px >= N || py >= N || b[py * N + px] !== c) break; n++; }
    return n;
  }
  function wins(b, x, y, c, rule) {
    for (var d = 0; d < 4; d++) { var n = runLen(b, x, y, c, DIRS[d][0], DIRS[d][1]); if (rule === 'std' ? n === 5 : n >= 5) return true; }
    return false;
  }
  function empties(b) { var o = []; for (var p = 0; p < N * N; p++) if (!b[p]) o.push(p); return o; }
  function near(b, x, y, r) {
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) { var px = x + dx, py = y + dy; if (px >= 0 && py >= 0 && px < N && py < N && b[py * N + px]) return true; }
    return false;
  }
  // a winning move for `me`, else a move that stops a winning move of the opponent (both are forced); null if none
  function forced(b, me, rule) {
    var e = empties(b), i, p, x, y, opp = 3 - me;
    for (i = 0; i < e.length; i++) { p = e[i]; x = p % N; y = (p / N) | 0; b[p] = me; var w = wins(b, x, y, me, rule); b[p] = 0; if (w) return p; }
    for (i = 0; i < e.length; i++) { p = e[i]; x = p % N; y = (p / N) | 0; b[p] = opp; var w2 = wins(b, x, y, opp, rule); b[p] = 0; if (w2) return p; }
    return null;
  }
  // built-in fallback: sum of line-pattern scores for attack and defence
  var PAT = [0, 1, 10, 100, 1500, 100000];
  function scoreAt(b, x, y, c) {
    var s = 0;
    for (var d = 0; d < 4; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1], n = 1, open = 0, i, px, py;
      for (i = 1; i < 5; i++) { px = x + dx * i; py = y + dy * i; if (px < 0 || py < 0 || px >= N || py >= N) break; if (b[py * N + px] === c) n++; else { if (!b[py * N + px]) open++; break; } }
      for (i = 1; i < 5; i++) { px = x - dx * i; py = y - dy * i; if (px < 0 || py < 0 || px >= N || py >= N) break; if (b[py * N + px] === c) n++; else { if (!b[py * N + px]) open++; break; } }
      if (n >= 5) s += PAT[5]; else if (open) s += PAT[n] * (open === 2 ? 3 : 1);
    }
    return s;
  }
  function fallbackMove(b, me, moves) {
    var e = empties(b), best = -1, bs = -1, i;
    if (!moves.length) return (N >> 1) * N + (N >> 1);
    for (i = 0; i < e.length; i++) {
      var p = e[i], x = p % N, y = (p / N) | 0;
      if (!near(b, x, y, 2)) continue;
      var s = scoreAt(b, x, y, me) * 1.1 + scoreAt(b, x, y, 3 - me) + Math.random();
      if (s > bs) { bs = s; best = p; }
    }
    return best >= 0 ? best : e[0];
  }

  function fn(state, level) {
    var lv = LV[level] || LV[2], moves = state.moves || [], rule = state.rule === 'std' ? 'std' : 'free';
    var b = mkBoard(moves), me = (moves.length & 1) ? 2 : 1;
    var all = empties(b);
    if (!all.length) return Promise.reject(new Error('full'));
    function pt(p) { return { x: p % N, y: (p / N) | 0 }; }
    function safe(r) { return r && r.x >= 0 && r.x < N && r.y >= 0 && r.y < N && !b[r.y * N + r.x]; }
    if (!moves.length) return Promise.resolve(pt((N >> 1) * N + (N >> 1)));
    var f = forced(b, me, rule);
    if (f !== null && level === 1) return Promise.resolve(pt(f));       // easy: obvious wins / blocks only come from this check or the shallow search
    if (level === 1 && Math.random() < lv.rnd) {
      var cand = all.filter(function (p) { return near(b, p % N, (p / N) | 0, 2); });
      if (cand.length) return Promise.resolve(pt(cand[(Math.random() * cand.length) | 0]));
    }
    if (failed) return Promise.resolve(pt(fallbackMove(b, me, moves)));
    start();
    return new Promise(function (resolve) {
      var id = ++seq;
      pend[id] = function (m) {
        if (m.type === 'move' && safe(m)) { fn.last = { ms: m.ms, depth: m.depth, nodes: m.nodes, eval: m.eval }; resolve({ x: m.x, y: m.y }); }
        else resolve(pt(f !== null ? f : fallbackMove(b, me, moves)));     // engine error / illegal answer: never play an occupied point
      };
      worker.postMessage({ id: id, size: N, rule: rule === 'std' ? 1 : 0, ms: lv.ms, maxDepth: lv.depth, maxNodes: lv.nodes, moves: moves.map(function (m) { return [m.x, m.y]; }) });
    });
  }
  fn.mode = 'loading';
  fn.cancel = cancel;
  fn.warm = start;
  fn.last = null;
  fn._internal = { wins: wins, forced: forced, fallbackMove: fallbackMove, mkBoard: mkBoard };
  window.omokEngine = fn;

  function attach() { if (window.attachEngine) window.attachEngine(fn); }
  if (window.attachEngine) attach(); else window.addEventListener('load', attach);
  window.addEventListener('load', function () { setTimeout(start, 300); });     // warm up while the pairing window is open
})();
