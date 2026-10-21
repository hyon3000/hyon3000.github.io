// Bullet Shot 3D auto-player: like ai.js, but the ship moves in two axes: every few frames it simulates 18 short plans (one of nine directions, held then kept or released)
// with the real rules (new shots / dives switched off, safety margin) and takes the plan that kills most and survives.
(function (root) {
  'use strict';
  var SH = root.Shooter3D, PLANS = [], a, b, c;
  for (a = -1; a <= 1; a++) for (b = -1; b <= 1; b++) for (c = 0; c < 2; c++) if (!(a === 0 && b === 0 && c === 1)) PLANS.push([a, b, c]);
  var cache = { t: -99, dx: 0, dy: 0, tx: null, ty: null };
  function evalPlan(s, pl) {
    var cl = SH.clone(s), s0 = cl.score, died = -1, i;
    cl.sim = true; cl.pad = 6;
    for (i = 0; i < 36; i++) {
      var on = i < 14 || pl[2] === 0;
      SH.step(cl, { dx: on ? pl[0] : 0, dy: on ? pl[1] : 0, f: true });
      if (!cl.p.alive) { died = i; break; }
    }
    var v = cl.score - s0;
    if (died >= 0) v -= 6000 - died * 30;
    else {
      var best = 1e9, k;
      for (k = 0; k < cl.en.length; k++) { var e = cl.en[k]; if (e.m !== SH.M_WAIT) best = Math.min(best, Math.hypot(e.x - cl.p.x, (e.y - cl.p.y) * 1.3)); }
      if (best < 1e9) v -= Math.min(best, 150) * 0.2;
      if (Math.abs(cl.p.x) > SH.SX - 8 || Math.abs(cl.p.y) > SH.SY - 8) v -= 4;
    }
    if (pl[0] === 0 && pl[1] === 0) v += 0.6;
    return { v: v, x: cl.p.x, y: cl.p.y };
  }
  function decide(s) {
    if (s.phase !== 'play' && s.phase !== 'ready' && s.phase !== 'clear') return { dx: 0, dy: 0, f: true };
    if (!s.p.alive) return { dx: 0, dy: 0, f: false };
    if (s.t - cache.t >= 3 || s.t < cache.t) {
      var best = null, i;
      for (i = 0; i < PLANS.length; i++) { var r = evalPlan(s, PLANS[i]); if (!best || r.v > best.v) { best = r; best.dx = PLANS[i][0]; best.dy = PLANS[i][1]; } }
      cache = { t: s.t, dx: best.dx, dy: best.dy, tx: best.x, ty: best.y };
    }
    return { dx: cache.dx, dy: cache.dy, f: true };
  }
  root.ShooterAI3D = { decide: decide, target: function () { return cache.tx === null ? null : [cache.tx, cache.ty]; } };
})(typeof self !== 'undefined' ? self : this);
