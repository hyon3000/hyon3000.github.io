// training-side environment inside the harness page: E.next() / E.step(a) run game frames (virtual clock) until the driver asks for the next decision.
(function () {
  var D = null;
  window.E = {
    init: function () { var a = PinballAI.locate(Module); if (!a) return 0; E.A = a; D = new PinballAI.Driver(Module, PB.key, a); E.D = D; return 1; },
    // run frames until a record is due; returns [obs..., score, done, over, frames, bad]
    run: function (maxf) {
      var n = 0, bad = 0;
      while (n < maxf) {
        var r = D.tick(performance.now()); if (r && r.bad) { bad++; if (bad > 400) break; } else if (r) return { obs: r.obs ? Array.from(r.obs) : null, score: r.score, done: r.done, over: r.over, nn: r.nn || 0, tilt: r.tilt || 0, stuck: r.stuck || 0, frames: n };
        PB.step(1); n++;
      }
      return { timeout: 1, frames: n, bad: bad };
    },
    ready: function () { var s = PinballAI.read(Module, E.A); return PinballAI.sane(s) ? 1 : 0; },
    first: function () { D.reset(); return E.run(4000); },                // after the page loaded: wait until the first ball is live
    step: function (a, n) { D.apply(a); D.nudge(n); return E.run(600); },
    next: function (newgame) { if (newgame) D.newGame(); return E.run(5000); }
  };
})();
