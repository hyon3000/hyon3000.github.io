/* 2D Physics - auto-solver planner (used by Help > Cheat > Solve Automatically / Give a Hint).
   It searches over candidate drawings in COPIES of the physics world (DP.Sim restored from a snapshot, same planck.js code, no rendering)
   and returns a plan: a list of strokes to draw plus an optional rope-cut time. The page then executes the plan like a player (draw / cut only).
   The search is a generator so that the page can run it in time slices (never freezing the UI for long). */
(function () {
'use strict';
var DP = window.DP, ctl = { deadline: Infinity };
function now() { return (window.performance || Date).now(); }

function line(x0, y0, x1, y1) {
  var n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 5)), pts = [];
  for (var i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
  return pts;
}
function box(cx, by, s) {                // closed square standing on y=by
  var h = s / 2, c = [[cx - h, by - s], [cx + h, by - s], [cx + h, by], [cx - h, by], [cx - h, by - s]], pts = [];
  for (var i = 0; i < 4; i++) { var a = c[i], b = c[i + 1], n = Math.max(1, Math.round(s / 5)); for (var k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  pts.push(c[4].slice());
  return pts;
}
function dur(raw) { return Math.max(30, Math.min(80, Math.round(DP.pathLen(raw) / 5))); }

function variants(f, lv) {
  var Y = lv.Y1, V = [];
  var bridge = function (e, dy) { return [line(f.x0 - e, Y - dy, f.x1 + e, Y - dy)]; };
  if (f.type === 'pit') {
    if (f.variant === 'plain' || f.variant === 'bounce') V = [bridge(36, 9), bridge(56, 7), bridge(24, 10), bridge(70, 12), []];
    else if (f.variant === 'jet') V = [[], bridge(36, 9)];
    else {                                    // seesaw: leave alone, bridge over it, or add a counterweight on the right half
      var cx = (f.x0 + f.x1) / 2, w = f.x1 - f.x0;
      V = [[], bridge(36, 9)];
      [44, 64, 84].forEach(function (s) { V.push([box(cx + w / 4, Y - 7, s)]); });
      [64, 90].forEach(function (s) { V.push([box(cx + w / 3, Y - 7, s)]); });
    }
  } else if (f.type === 'wall') {
    var ups = [36, 44, 28, 52].map(function (a) { var run = f.h / Math.tan(a * Math.PI / 180); return line(f.x0 - run - 6, Y - 5, f.x0 + 8, f.top - 5); });
    ups.forEach(function (u) { V.push([u]); });
    [36, 44, 28].forEach(function (a) {          // one bent stroke: up the ramp, along the top, (down the far side)
      var run = f.h / Math.tan(a * Math.PI / 180), pts = line(f.x0 - run - 6, Y - 5, f.x0 + 4, f.top - 5);
      if (f.end) { V.push([pts.concat(line(f.x0 + 4, f.top - 5, 1150, f.top - 5))]); return; }
      var run2 = Math.min(f.h / Math.tan(25 * Math.PI / 180), 60);
      V.push([pts.concat(line(f.x0 + 4, f.top - 5, f.x1 - 4, f.top - 5), line(f.x1 - 4, f.top - 5, f.x1 + run2, Y - 5))]);
      V.push([pts.concat(line(f.x0 + 4, f.top - 5, f.x1 + 6, f.top - 5))]);
    });
    if (!f.end) { var run2 = Math.min(f.h / Math.tan(25 * Math.PI / 180), 60), dn = line(f.x1 - 8, f.top - 5, f.x1 + run2, Y - 5); ups.forEach(function (u) { V.push([u, dn]); }); }
  } else if (f.type === 'spikes') {              // a hump over the spikes: ramp up, deck above the spikes, ramp down
    [[55, 30], [80, 30], [45, 34], [100, 32]].forEach(function (q) { V.push([line(f.x0 - q[0], Y - 4, f.x0 - 6, Y - q[1]).concat(line(f.x0 - 6, Y - q[1], f.x1 + 6, Y - q[1]), line(f.x1 + 6, Y - q[1], f.x1 + q[0], Y - 4))]); });
    V.push([]);
  } else V = [[]];                            // crates / dominoes / boost / rotor: try without help first, random strokes otherwise
  return V;
}

function buildEvents(cons, running) {
  var strokes = [];
  cons.picks.forEach(function (vi, fi) { cons.vars[fi][vi].forEach(function (r) { strokes.push(r); }); });
  cons.extras.forEach(function (r) { strokes.push(r); });
  var ev = [], t = 0;
  strokes.forEach(function (raw) { if (running) t += dur(raw); ev.push({ t: t, type: 'stroke', raw: raw }); });
  if (cons.cut != null) ev.push({ t: cons.cut, type: 'cut' });
  ev.sort(function (a, b) { return a.t - b.t; });
  return ev;
}

function* rollout(lv, snap, events, maxSteps) {
  var sim = new DP.Sim(lv, snap), ei = 0, maxX = sim.bx, still = 0, s, lastProg = 0, anchor = sim.bx;
  for (s = 0; s < maxSteps; s++) {
    while (ei < events.length && events[ei].t <= s) { var e = events[ei++]; if (e.type === 'stroke') sim.addStroke(e.raw); else sim.cutRope(); }
    sim.step();
    if (sim.bx > maxX) maxX = sim.bx;
    if (sim.bx > anchor + 4) { anchor = sim.bx; lastProg = s; }
    if (s - lastProg > 210 && !sim.rope && ei >= events.length) return { ok: false, why: 'stalled', steps: s, maxX: maxX, got: sim.next };
    if (sim.wrong) return { ok: false, why: 'wrong', steps: s, maxX: maxX, got: sim.next };
    if (sim.won) return { ok: true, steps: s + 1, maxX: maxX, got: sim.stars.length };
    if (sim.dead()) return { ok: false, why: 'fall', steps: s, maxX: maxX, got: sim.next };
    var v = sim.ball.getLinearVelocity();
    if (!sim.rope && Math.abs(v.x) + Math.abs(v.y) < 0.2) { if (++still > 90) return { ok: false, why: 'stuck', steps: s, maxX: maxX, got: sim.next }; } else still = 0;
    if ((s & 31) === 31 && now() > ctl.deadline) yield;
  }
  return { ok: false, why: 'timeout', steps: s, maxX: maxX, got: sim.next };
}
function score(r) { return r.got * 3000 + r.maxX; }
function clone(c) { return { picks: c.picks.slice(), vars: c.vars, extras: c.extras.slice(), cut: c.cut }; }

function* plan(lv, snap, running, opts) {
  opts = opts || {};
  var t0 = now(), n = 0, maxRollouts = opts.maxRollouts || 160, maxMs = opts.maxMs || 20000, feats = lv.features;
  var vars = feats.map(function (f) { return variants(f, lv); });
  var cons = { picks: feats.map(function () { return 0; }), vars: vars, extras: [], cut: snap.rope ? 0 : null };
  var rng = DP.mulberry32(DP.hash2(lv.seed, lv.L * 31 + snap.simT + snap.strokes.length));
  function* ev(c) { n++; var r = yield* rollout(lv, snap, buildEvents(c, running), 1800); r.score = score(r); return r; }
  function done(c, r) { return { ok: true, cons: c, result: r, rollouts: n, ms: now() - t0, events: buildEvents(c, running) }; }
  var cur, i, r, c2;
  if (snap.rope) {                           // choose the cut time first
    var bestT = 0, bestR = null;
    for (var t = 0; t <= 150 && now() - t0 <= maxMs; t += 6) {
      c2 = clone(cons); c2.cut = t; r = yield* ev(c2);
      if (r.ok) return done(c2, r);
      if (!bestR || r.score > bestR.score) { bestR = r; bestT = t; }
    }
    cons.cut = bestT;
  }
  cur = yield* ev(cons);
  for (var iter = 0; iter < 12; iter++) {
    if (cur.ok) return done(cons, cur);
    if (n > maxRollouts || now() - t0 > maxMs) break;
    var idx = -1;
    for (i = 0; i < feats.length; i++) if (feats[i].x1 > cur.maxX - 20) { idx = i; break; }
    if (idx < 0) idx = feats.length - 1;
    var best = null, order = [idx, idx - 1, idx + 1].filter(function (q) { return q >= 0 && q < feats.length; });
    for (var oi = 0; oi < order.length; oi++) {
      var fi = order[oi];
      for (var vi = 0; vi < vars[fi].length; vi++) {
        if (vi === cons.picks[fi]) continue;
        c2 = clone(cons); c2.picks[fi] = vi; r = yield* ev(c2);
        if (r.ok) return done(c2, r);
        if (r.score > cur.score + 5 && (!best || r.score > best.r.score)) best = { c: c2, r: r };
        if (n > maxRollouts || now() - t0 > maxMs) break;
      }
      if (best) break;
    }
    if (!best && cons.cut != null) {         // re-time the rope cut for the changed course
      for (var t2 = 0; t2 <= 150 && now() - t0 <= maxMs; t2 += 6) { if (t2 === cons.cut) continue; c2 = clone(cons); c2.cut = t2; r = yield* ev(c2); if (r.ok) return done(c2, r); if (r.score > cur.score + 5 && (!best || r.score > best.r.score)) best = { c: c2, r: r }; }
    }
    if (!best) {                              // random shooting near where the ball gave up
      for (var k = 0; k < 40 && n <= maxRollouts && now() - t0 <= maxMs; k++) {
        var cx = cur.maxX - 140 + rng() * 360, gy = lv.gy(Math.max(0, Math.min(1200, cx))), raw;
        if (rng() < 0.6) { var len = 70 + rng() * 170, ang = (rng() - 0.5) * 2, cy = gy - 10 - rng() * 110; raw = line(cx - Math.cos(ang) * len / 2, cy - Math.sin(ang) * len / 2, cx + Math.cos(ang) * len / 2, cy + Math.sin(ang) * len / 2); }
        else raw = box(cx, gy - 6 - rng() * 120, 30 + rng() * 60);
        c2 = clone(cons); c2.extras.push(raw); r = yield* ev(c2);
        if (r.ok) return done(c2, r);
        if (r.score > cur.score + 5 && (!best || r.score > best.r.score)) best = { c: c2, r: r };
      }
    }
    if (!best) break;
    cons = best.c; cur = best.r;
  }
  return { ok: false, cons: cons, result: cur, rollouts: n, ms: now() - t0 };
}

function planSync(lv, snap, running, opts) {
  ctl.deadline = Infinity;
  var g = plan(lv, snap, running, opts), r;
  do { r = g.next(); } while (!r.done);
  return r.value;
}
DP.variants = variants; DP.plan = plan; DP.planSync = planSync; DP.planCtl = ctl; DP.buildEvents = buildEvents; DP.planDur = dur; DP.line = line; DP.box = box;
})();
