// Plugs open-source engines into the board-game pages (chess.html / go.html call window.attachEngine(fn) - see below):
//   chess: Stockfish 10 (nmrugg/stockfish.js, GPL) as a web worker, engine/stockfish/
//   go:    GNU Go (GPL) compiled with emscripten by dna2ai/gnugo.js (MIT wrapper), engine/gnugo/
(function () {
  var base = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^\/]*$/, '') : ''; })();
  function onReady(fn) { if (window.attachEngine) fn(); else window.addEventListener('load', fn); }

  // ---- chess: fn(fen, level) -> Promise('e2e4') ----
  var LEVELS = [{ skill: 1, ms: 150 }, { skill: 8, ms: 500 }, { skill: 20, ms: 1500 }];
  function chessEngine() {
    var worker = null, ready = null, waiting = null;
    function boot() {
      if (ready) return ready;
      ready = new Promise(function (res, rej) {
        try { worker = new Worker(base + 'engine/stockfish/stockfish.js'); } catch (e) { rej(e); return; }
        worker.onerror = function (e) { rej(e); };
        worker.onmessage = function (e) {
          var l = typeof e.data === 'string' ? e.data : '';
          if (l === 'readyok') res();
          var m = /^bestmove (\S+)/.exec(l);
          if (m && waiting) { var w = waiting; waiting = null; w(m[1]); }
        };
        worker.postMessage('uci'); worker.postMessage('isready');
      });
      return ready;
    }
    return function (fen, level) {
      var lv = LEVELS[Math.max(0, Math.min(2, (level || 2) - 1))];
      return boot().then(function () {
        return new Promise(function (res) {
          waiting = res;
          worker.postMessage('setoption name Skill Level value ' + lv.skill);
          worker.postMessage('position fen ' + fen);
          worker.postMessage('go movetime ' + lv.ms);
        });
      });
    };
  }

  // ---- go: fn(state, level) -> Promise({x, y} | 'pass') ----
  // GNU Go's wrapper is stateful (moveTo / genNextStep) and cannot pass for the human side, so every request replays the game in a fresh engine instance;
  // after a human pass the engine's move is generated on a copy where "the passing side" has first played its own best move (only the reply of the other side is used).
  function goEngine() {
    var loading = null;
    function load() {
      if (loading) return loading;
      loading = new Promise(function (res, rej) {
        var s = document.createElement('script'); s.src = base + 'engine/gnugo/gnugo.js';
        s.onload = function () { var t = setInterval(function () { if (window.Module && Module._initializeGoGame) { clearInterval(t); res(window.Module); } }, 50); };
        s.onerror = rej; document.head.appendChild(s);
      });
      return loading;
    }
    function snap(M, n) { var b = []; for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) b.push(M._getBoard(i, j)); return b; }
    return function (st) {
      return load().then(function (M) {
        var n = st.size, mv = st.moves, k = 0;
        M._initializeGoGame(n, Math.round(st.komi || 6), st.handicap || 0, (Math.random() * 1e9) | 0);
        var toMove = st.handicap ? 'w' : 'b';
        mv.forEach(function (m) {
          if (m.pass) { if (toMove === m.c) { M._genNextStep(); } toMove = m.c === 'b' ? 'w' : 'b'; return; }
          M._moveTo(m.y, m.x); toMove = m.c === 'b' ? 'w' : 'b';
        });
        // the engine has to play for st.toPlay; GNU Go's own side to move may differ after passes, in which case it first plays a stone for the other side
        var before = snap(M, n), phantom = toMove !== st.toPlay;
        if (phantom) { M._genNextStep(); before = snap(M, n); }
        M._genNextStep();
        var after = snap(M, n), mine = st.toPlay === 'b' ? 2 : 1;
        for (var q = 0; q < before.length; q++) if (before[q] === 0 && after[q] === mine) { var r = { x: q % n, y: (q / n) | 0 }; M._finalizeGoGame(); return r; }
        M._finalizeGoGame();
        return 'pass';
      });
    };
  }

  window.BoardEngines = { chess: chessEngine, go: goEngine };
  onReady(function () {
    if (!window.attachEngine) return;
    if (/chess/i.test(location.pathname)) window.attachEngine(chessEngine());
    else if (/go/i.test(location.pathname)) window.attachEngine(goEngine());
    if (window.isVsAI && window.isVsAI()) window.toggleVsAI();          // the default is two humans on one screen; the computer is switched on from the menu (F3)
  });
})();
