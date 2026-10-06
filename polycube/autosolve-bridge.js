// Auto-solve bridge — lets the Win98 shell (index.html) drive "Cheat > Solve Automatically" in whichever game
// is loaded in the iframe, without knowing anything about the game.
//
// Include this file in every game page (2D polynomino/game.html today; 3D polycube and 4D polytesseract next):
//
//   <script src="../autosolve-bridge.js"></script>      (path relative to the game page)
//   ...
//   PolyAutoSolve.register({
//     dim: 2,                          // 2 | 3 | 4
//     isRunning: () => boolean,        // a game is in progress (not start screen / game over)
//     isSolving: () => boolean,        // auto-solve currently active
//     start: () => void,               // begin auto-solve (only called while isRunning())
//     stop:  () => void,               // end auto-solve
//   });
//   PolyAutoSolve.notify();            // optional: push a status update right now (also polled every 300 ms)
//
// Protocol (window.postMessage, works for file:// and http(s)://):
//   shell -> game : { type: 'polycube-autosolve', cmd: 'status' | 'toggle' | 'start' | 'stop' }
//   game -> shell : { type: 'polycube-autosolve-status', supported, dim, running, solving }
// A game that never calls register() (or does not include this file) simply never answers; the shell then shows the
// menu entry disabled.
(function () {
  'use strict';
  if (window.PolyAutoSolve) return;
  var impl = null, last = '';

  function status() {
    if (!impl) return { type: 'polycube-autosolve-status', supported: false, dim: 0, running: false, solving: false };
    var running = false, solving = false;
    try { running = !!impl.isRunning(); solving = !!impl.isSolving(); } catch (e) {}
    return { type: 'polycube-autosolve-status', supported: true, dim: impl.dim || 0, running: running, solving: solving };
  }
  function send(force) {
    if (window.parent === window) return;
    var s = status(), key = JSON.stringify(s);
    if (!force && key === last) return;
    last = key;
    try { window.parent.postMessage(s, '*'); } catch (e) {}
  }
  function command(cmd) {
    if (!impl) return;
    var running = false, solving = false;
    try { running = !!impl.isRunning(); solving = !!impl.isSolving(); } catch (e) {}
    if (cmd === 'toggle') cmd = solving ? 'stop' : 'start';
    if (cmd === 'start' && running && !solving) impl.start();   // never while no game is running
    else if (cmd === 'stop' && solving) impl.stop();
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.type !== 'polycube-autosolve' || ev.source !== window.parent) return;
    if (d.cmd !== 'status') command(d.cmd);
    send(true);
  });
  setInterval(function () { send(false); }, 300);

  window.PolyAutoSolve = {
    register: function (o) { impl = o; send(true); },
    notify: function () { send(false); },
    status: status
  };
})();
