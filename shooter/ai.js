// Shooter auto-player: every few frames it simulates nine short plans (hold left / stay / right, then again) with the real rules (core.js, new shots and dives
// switched off, a safety margin around the ship) and takes the plan that kills the most and survives; a plan that ends in a hit costs a lot.
(function (root) {
  'use strict';
  var SH = root.Shooter, PLANS = [], a, b;
  for (a = -1; a <= 1; a++) for (b = -1; b <= 1; b++) PLANS.push([a, b]);
  var cache = { t: -99, dir: 0, tx: null };
  function evalPlan(s, pl) {
    var c = SH.clone(s), s0 = c.score, died = -1, i;
    c.sim = true; c.pad = 4;
    for (i = 0; i < 38; i++) {
      var d = i < 14 ? pl[0] : pl[1];
      SH.step(c, { l: d < 0, r: d > 0, f: true });
      if (!c.p.alive) { died = i; break; }
    }
    var v = c.score - s0;
    if (died >= 0) v -= 6000 - died * 30;
    else {
      var best = 1e9;
      for (i = 0; i < c.en.length; i++) { var e = c.en[i]; if (e.m !== SH.M_WAIT) best = Math.min(best, Math.abs(e.x - c.p.x)); }
      if (best < 1e9) v -= Math.min(best, 80) * 0.3;
      if (c.p.x < 22 || c.p.x > SH.W - 22) v -= 4;
    }
    if (pl[0] === 0 && pl[1] === 0) v += 0.6;
    return { v: v, x: c.p.x };
  }
  function decide(s) {
    if (s.phase !== 'play' && s.phase !== 'ready' && s.phase !== 'clear') return { l: false, r: false, f: true };
    if (!s.p.alive) return { l: false, r: false, f: false };
    if (s.t - cache.t >= 3 || s.t < cache.t) {
      var best = null, i;
      for (i = 0; i < PLANS.length; i++) { var r = evalPlan(s, PLANS[i]); if (!best || r.v > best.v) { best = r; best.dir = PLANS[i][0]; } }
      cache = { t: s.t, dir: best.dir, tx: best.x };
    }
    return { l: cache.dir < 0, r: cache.dir > 0, f: true };
  }
  root.ShooterAI = { decide: decide, target: function () { return cache.tx; } };
})(typeof self !== 'undefined' ? self : this);
