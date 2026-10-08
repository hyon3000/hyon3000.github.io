// Plugs open-source engines into the board-game pages (chess.html / go.html call window.attachEngine(fn) - see below):
//   chess: Stockfish 10 (nmrugg/stockfish.js, GPL) as a web worker, engine/stockfish/
//   go:    level 1 = GNU Go (GPL) compiled with emscripten by dna2ai/gnugo.js (MIT wrapper), engine/gnugo/; levels 2/3 = KataGo (TensorFlow.js port, engine/katago/)
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
    // GNU Go lives in a hidden iframe: its wasm module aborts now and then (rarely, in some positions) and a module that has aborted stays dead, so the iframe is simply replaced
    var loading = null, frame = null;
    function load() {
      if (loading) return loading;
      loading = new Promise(function (res, rej) {
        frame = document.createElement('iframe'); frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden'; frame.src = base + 'engine/gnugo/host.html';
        frame.onload = function () { var t = setInterval(function () { var M = frame.contentWindow && frame.contentWindow.Module; if (M && M._initializeGoGame) { clearInterval(t); res(M); } }, 50); };
        frame.onerror = rej; document.body.appendChild(frame);
      });
      return loading;
    }
    function reset() { loading = null; inst = null; try { frame && frame.remove(); } catch (e) {} frame = null; }
    function snap(M, n) { var b = []; for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) b.push(M._getBoard(i, j)); return b; }
    // Every initializeGoGame() leaks engine memory (a long computer-vs-computer session would abort the wasm module), so one engine game is kept and only the new moves are
    // played into it; the game is re-created only when the requested game is not a continuation of it (new game, undo, a hint that was not played, a human pass).
    var inst = null;
    function same(a, b) { return a.c === b.c && !!a.pass === !!b.pass && a.x === b.x && a.y === b.y; }
    function isPrefix(a, b) { if (a.length > b.length) return false; for (var i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false; return true; }
    function play(M, m) {                       // returns false when the engine had to fake a move (a pass of the side GNU Go expects to move)
      var ok = true;
      if (m.pass) { if (inst.toMove === m.c) { M._genNextStep(); ok = false; } }
      else { var rc = M._moveTo(m.y, m.x); if (rc !== 0) { (window.__goBad = window.__goBad || []).push({ c: m.c, x: m.x, y: m.y, rc: rc }); ok = false; } }
      inst.toMove = m.c === 'b' ? 'w' : 'b';
      return ok;
    }
    function ask(st) {
      return load().then(function (M) {
        var n = st.size, komi = Math.round(st.komi || 6), ha = st.handicap || 0;
        if (!(inst && !inst.dirty && inst.size === n && inst.komi === komi && inst.ha === ha && isPrefix(inst.moves, st.moves))) {
          if (inst) M._finalizeGoGame();
          M._initializeGoGame(n, komi, ha, (Math.random() * 1e9) | 0);
          inst = { size: n, komi: komi, ha: ha, moves: [], toMove: ha ? 'w' : 'b', dirty: false };
        }
        for (var q = inst.moves.length; q < st.moves.length; q++) { var m = st.moves[q]; if (play(M, m)) inst.moves.push(m); else inst.dirty = true; }
        // the engine has to play for st.toPlay; GNU Go's own side to move may differ after passes, in which case it first plays a stone for the other side
        var phantom = inst.toMove !== st.toPlay;
        if (phantom) { M._genNextStep(); inst.toMove = st.toPlay; inst.dirty = true; }
        var before = snap(M, n);
        M._genNextStep(); inst.toMove = st.toPlay === 'b' ? 'w' : 'b';
        var after = snap(M, n), mine = st.toPlay === 'b' ? 2 : 1, res = 'pass';
        for (var z = 0; z < before.length; z++) if (before[z] === 0 && after[z] === mine) { res = { x: z % n, y: (z / n) | 0 }; break; }
        if (!inst.dirty) inst.moves.push(res === 'pass' ? { c: st.toPlay, pass: true } : { c: st.toPlay, x: res.x, y: res.y });
        return res;
      });
    }
    return function (st) { return ask(st).catch(function () { reset(); return ask(st); }); };      // (a module that aborted is replaced and the request repeated once)
  }

  // ---- go, levels: 1 = GNU Go (default options), 2/3 = KataGo in a web worker (engine/katago/, see README there); falls back to GNU Go when KataGo cannot run ----
  function status(t) { try { if (typeof window.onEngineStatus === 'function') window.onEngineStatus(t || ''); } catch (e) {} }
  function loadKata() {
    if (window.KataGoGo) return Promise.resolve();
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = base + 'engine/katago/katago.js'; s.onload = res; s.onerror = function () { rej(new Error('katago.js')); }; document.head.appendChild(s); });
  }
  function goEngineAll() {
    var gnu = goEngine(), kataBroken = false;
    return function (st, level) {
      level = +level || 2;
      if (level < 2 || kataBroken || typeof Worker === 'undefined') { status(level < 2 ? 'GNU Go' : ''); return gnu(st, level); }
      return loadKata().then(function () { return window.KataGoGo.move(st, level); }).catch(function (e) {
        if (e && e.canceled) return new Promise(function () {});          // superseded by a newer request: the page ignores this one anyway
        if (window.console) console.warn('KataGo failed, using GNU Go:', e && e.message);
        kataBroken = true; status('KataGo unavailable (' + ((e && e.message) || 'error') + '), using GNU Go');
        return gnu(st, 1);
      });
    };
  }

  window.BoardEngines = { chess: chessEngine, go: goEngineAll, gnugo: goEngine };
  onReady(function () {
    if (!window.attachEngine) return;
    if (/chess/i.test(location.pathname)) window.attachEngine(chessEngine());
    else if (/go/i.test(location.pathname)) window.attachEngine(goEngineAll());
    if (window.isVsAI && window.isVsAI()) window.toggleVsAI();          // the default is two humans on one screen; the computer is switched on from the menu (F3)
  });
})();
