// Plugs the Janggi search (engine/janggi/worker.js, a Web Worker built on janggi-core.js) into janggi.html (window.attachEngine(fn)).
//   fn(state, level) -> Promise({ m })      m = move as defined in janggi-core.js (Janggi.PASS = pass)
//   state = { rows, turn, moves }           rows/turn = start position, moves = the moves played since (the side to move is the engine)
//   level 1 = Easy (depth 2, random noise on every root move), 2 = Normal (0.8 s), 3 = Hard (4 s)
// If the worker cannot be started (old browser, file:// ...), a small built-in player (best capture, else random) answers instead,
// so the game stays playable (janggiEngine.mode tells which one is used: 'search' | 'fallback' | 'loading').
(function () {
  'use strict';
  var base = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^\/]*$/, '') : ''; })();
  var J = window.Janggi;
  var LV = { 1: { ms: 200, depth: 2, noise: 70 }, 2: { ms: 800, depth: 99, noise: 0 }, 3: { ms: 4000, depth: 99, noise: 0 } };
  var worker = null, failed = false, seq = 0, pend = {};

  function setStatus(s) { try { if (window.onEngineStatus) window.onEngineStatus(s); } catch (e) {} }
  function start() {
    if (worker || failed) return;
    try { worker = new Worker(base + 'engine/janggi/worker.js'); } catch (e) { fail(); return; }
    setStatus('loading');
    worker.onmessage = function (e) {
      var m = e.data;
      if (m.type === 'ready') { fn.mode = 'search'; setStatus(''); }
      else if (m.id && pend[m.id]) { var p = pend[m.id]; delete pend[m.id]; p(m); }
    };
    worker.onerror = function () { fail(); };
    worker.postMessage({ type: 'init' });
  }
  function fail() {
    failed = true; fn.mode = 'fallback'; setStatus('');
    try { worker && worker.terminate(); } catch (e) {}
    worker = null;
    Object.keys(pend).forEach(function (k) { var p = pend[k]; delete pend[k]; p({ type: 'error', msg: 'worker' }); });
  }
  // drops the running search (the worker is blocked until its search ends, so it is replaced)
  function cancel() {
    if (!worker || !Object.keys(pend).length) return;
    pend = {}; try { worker.terminate(); } catch (e) {}
    worker = null; start();
  }
  function position(state) {
    var P = new J.Position();
    P.loadRows(state.rows, state.turn);
    state.moves.forEach(function (m) { P.make(m); });
    return P;
  }
  var VAL = [0, 0, 3, 3, 5, 13, 7, 2];
  function fallbackMove(state) {
    var P = position(state), mv = P.legalMoves(true), best = [], bs = -1;
    mv.forEach(function (m) {
      if (m === J.PASS && mv.length > 1) return;
      var v = (m === J.PASS ? 0 : VAL[P.b[m >> 7] & 7]) + Math.random();
      if (v > bs + 0.999) { bs = v; best = [m]; } else if (v > bs - 0.999) best.push(m);
    });
    return best.length ? best[(Math.random() * best.length) | 0] : J.PASS;
  }

  function fn(state, level) {
    var lv = LV[level] || LV[2];
    if (failed) return Promise.resolve({ m: fallbackMove(state) });
    start();
    return new Promise(function (resolve) {
      var id = ++seq;
      pend[id] = function (m) {
        if (m.type === 'move') { fn.last = { ms: m.ms, depth: m.depth, nodes: m.nodes, eval: m.eval }; resolve({ m: m.m }); }
        else resolve({ m: fallbackMove(state) });
      };
      worker.postMessage({ id: id, rows: state.rows, turn: state.turn, moves: state.moves, ms: lv.ms, maxDepth: lv.depth, noise: lv.noise });
    });
  }
  fn.mode = 'loading'; fn.cancel = cancel; fn.warm = start; fn.last = null;
  window.janggiEngine = fn;

  function attach() { if (window.attachEngine) window.attachEngine(fn); }
  if (window.attachEngine) attach(); else window.addEventListener('load', attach);
  window.addEventListener('load', function () { setTimeout(start, 300); });
})();
