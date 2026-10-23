/* Doodle - auto-solver planner (used by Help > Cheat > Solve Automatically / Give a Hint).
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
    var nx = f.end ? null : lv.features.filter(function (g) { return g.x0 > f.x1 && g.x0 - f.x1 < 300 && (g.type === 'spikes' || g.type === 'pit' || g.type === 'rotor'); })[0];
    if (nx) [36, 28].forEach(function (a) {      // one long stroke: ramp up, deck over the next hazard at wall-top height, ramp down behind it
      var run = f.h / Math.tan(a * Math.PI / 180), run3 = Math.min(f.h / Math.tan(25 * Math.PI / 180), 90), pts = line(f.x0 - run - 6, Y - 5, f.x0 + 4, f.top - 5).concat(line(f.x0 + 4, f.top - 5, nx.x1 + 12, f.top - 5), line(nx.x1 + 12, f.top - 5, nx.x1 + 12 + run3, Y - 5));
      if (DP.pathLen(pts) <= DP.STROKE_MAX - 10) V.push([pts]);
    });
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
    while (ei < events.length && events[ei].t <= s) { var e = events[ei++]; if (e.type === 'stroke') sim.addStroke(e.raw); else if (e.type === 'pin') sim.addPinAt(e.x, e.y); else if (e.type === 'erase') e.ns.map(function (k) { return sim.strokes[k]; }).forEach(function (q) { if (q) sim.removeStroke(q); }); else sim.cutRope(); }
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


/* ---- "highway": one smooth drawn track from the ball through every remaining star in order. Segments are quadratic curves with a sag (a valley between two stars lets
   the ball pick up speed to climb to a higher one). Strokes pass through spikes / portals, so a track above the course skips most of the hazards. ---- */
var SAGS = [40, 110, 0, 190, 280, 70];
function clearY(lv, x) {                       // lowest y a drawn track may have at x so that it keeps ~13px (measured perpendicular to the ground) off the terrain
  var xc = Math.max(4, Math.min(1196, x)), sl = (lv.gy(xc + 4) - lv.gy(xc - 4)) / 8, c = 13 * Math.sqrt(1 + sl * sl);
  return lv.gy(xc) - Math.min(c, 45);
}
function trackPoints(lv, wps, sags) {          // smooth (Catmull-Rom) curve through the waypoints with a bowed control point between each pair; a sharp valley would kill the ball's speed
  var C = [], i, k, pts = [];
  for (i = 0; i < wps.length; i++) {
    C.push([wps[i].x, wps[i].y]);
    if (i + 1 < wps.length) C.push([(wps[i].x + wps[i + 1].x) / 2, (wps[i].y + wps[i + 1].y) / 2 + sags[i]]);
  }
  for (i = 0; i + 1 < C.length; i++) {
    var p0 = C[Math.max(0, i - 1)], p1 = C[i], p2 = C[i + 1], p3 = C[Math.min(C.length - 1, i + 2)], n = Math.max(3, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 6));
    for (k = (i ? 1 : 0); k <= n; k++) {
      var t = k / n, t2 = t * t, t3 = t2 * t, x, y;
      x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      x = Math.max(2, Math.min(1198, x)); y = Math.min(y, clearY(lv, x));
      for (var fi = 0; fi < lv.features.length; fi++) { var hf = lv.features[fi]; if ((hf.type === 'spikes' || hf.type === 'portal' || hf.type === 'patrol') && x > hf.x0 - 24 && x < hf.x1 + 24) y = Math.min(y, hf.y - 62); }
      pts.push([x, y]);
    }
  }
  return pts;
}
function pegs(raw) {                       // a drawn track is a free body: nail it to the background with two pegs placed BEFORE the stroke is drawn (exactly two: more over-constrain the solver)
  var n = raw.length;
  return [{ t: 0, type: 'pin', x: raw[0][0], y: raw[0][1] }, { t: 0, type: 'pin', x: raw[n - 1][0], y: raw[n - 1][1] }];
}
function trackEvents(raw) {                  // the track in pieces of ~170px, every piece pegged at both ends (a long single rod sags off its two pegs; short pegged rods stay put)
  var cuts = [0], acc = 0, i, ev = [], n = raw.length;
  for (i = 1; i < n; i++) { acc += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]); if (acc >= 170 && i < n - 4) { cuts.push(i); acc = 0; } }
  cuts.push(n - 1);
  cuts.forEach(function (c) { ev.push({ t: 0, type: 'pin', x: raw[c][0], y: raw[c][1] }); });
  for (i = 0; i + 1 < cuts.length; i++) ev.push({ t: 0, type: 'stroke', raw: raw.slice(cuts[i], cuts[i + 1] + 1) });
  return ev;
}
function* highway(lv, snap, opts, t0, st) {
  var maxMs = opts.maxMs || 20000, maxRollouts = st.maxRollouts, R = DP.BALL_R, sim0 = new DP.Sim(lv, snap), bx = sim0.bx, by = sim0.by;
  var order = lv.stars.map(function (s, i) { return { s: s, i: i }; }).filter(function (q) { return !snap.got[q.i]; });
  order.sort(function (a, b) { return ((a.s.n || 1) - (b.s.n || 1)) || (a.s.x - b.s.x); });
  if (!order.length) return null;
  var tail = [];
  order.forEach(function (q) {
    var g = lv.gy(Math.max(0, Math.min(1200, q.s.x)));
    tail.push({ x: q.s.x, y: g - q.s.y < 40 ? g - 5 : q.s.y + R + 3 });
  });
  var m = tail.length, sags = [], i, starts = [];
  for (i = 0; i < m; i++) sags.push(SAGS[0]);
  if (!snap.rope) starts.push({ p: { x: bx + 3, y: Math.min(by + R + 4, lv.gy(bx + 3) - 5) }, cut: null });
  else {                                       // swinging ball: for each cut time, where does the falling ball cross? put the start of the track under it
    for (var tc = 0; tc <= 90; tc += 10) {
      var sm = new DP.Sim(lv, snap), peak = null, tr = [], s;
      for (s = 0; s < tc; s++) sm.step();
      sm.cutRope();
      for (s = 0; s < 60 && !sm.dead(); s++) { sm.step(); tr.push([sm.bx, sm.by]); if (sm.by > lv.gy(Math.max(0, Math.min(1200, sm.bx))) - R) break; }
      if (tr.length < 3) continue;
      var pk = 0; for (s = 1; s < tr.length; s++) if (tr[s][1] < tr[pk][1]) pk = s;
      var j = Math.min(tr.length - 1, pk + 14), pt = tr[j];
      starts.push({ p: { x: pt[0], y: Math.min(pt[1] + R + 4, lv.gy(Math.max(0, Math.min(1200, pt[0]))) - 5) }, cut: tc });
      if ((s & 7) === 7 && now() > ctl.deadline) yield;
    }
  }
  var rng = DP.mulberry32(DP.hash2(lv.seed, lv.L * 17 + 5)), wps = null, cutAt = null, cur = null;
  function* ev(sg, wp, cut) {
    st.n++;
    var raw = trackPoints(lv, [wp].concat(tail), sg), events = pegs(raw);
    events.push({ t: 0, type: 'stroke', raw: raw });
    if (cut != null) events.push({ t: cut, type: 'cut' });
    var r = yield* rollout(lv, snap, events, 1800); r.score = score(r); r.events = events; if (DP.hwLog) DP.hwLog.push([cut, Math.round(wp.x), Math.round(wp.y), sg.join('/'), r.why, r.got, Math.round(r.maxX), r.steps].join(' ')); return r;
  }
  function fin(r) { return { ok: true, cons: null, result: r, rollouts: st.n, ms: now() - t0, events: r.events }; }
  var wp0 = null, c0 = null;
  for (i = 0; i < starts.length; i++) {
    if (st.n > maxRollouts || now() - t0 > maxMs) return null;
    var r0 = yield* ev(sags, starts[i].p, starts[i].cut);
    if (r0.ok) return fin(r0);
    if (!cur || r0.score > cur.score) { cur = r0; wp0 = starts[i].p; c0 = starts[i].cut; }
  }
  if (!cur) return null;
  for (var pass = 0; pass < 3; pass++) {
    var improved = false;
    for (var seg = 0; seg < m; seg++) {
      for (var vi = 0; vi < SAGS.length; vi++) {
        if (SAGS[vi] === sags[seg]) continue;
        if (st.n > maxRollouts || now() - t0 > maxMs) return null;
        var s2 = sags.slice(); s2[seg] = SAGS[vi];
        var r = yield* ev(s2, wp0, c0);
        if (r.ok) return fin(r);
        if (r.score > cur.score + 5) { cur = r; sags = s2; improved = true; }
      }
    }
    if (!improved) break;
  }
  for (var k = 0; k < 60 && st.n <= maxRollouts && now() - t0 <= maxMs; k++) {          // random sags
    var s3 = sags.map(function (v) { return rng() < 0.5 ? v : Math.round(rng() * 300); });
    var r3 = yield* ev(s3, wp0, c0);
    if (r3.ok) return fin(r3);
    if (r3.score > cur.score) { cur = r3; sags = s3; }
  }
  return null;
}

/* ---- lift: the known trick for moving the ball to any height. One stroke = a basket around the ball joined to a lever pinned (peg) at its middle; a heavy box dropped on the far
   end of the lever swings the basket up. At a well-chosen moment the lever and weight are erased and a pegged track is drawn under the ball (see highway). ---- */
var LIFTS = [[100, 200, 100, 100], [60, 160, 90, 100], [120, 240, 120, 120], [80, 120, 80, 60]];
function applyEv(sim, e) {
  if (e.type === 'stroke') sim.addStroke(e.raw); else if (e.type === 'pin') sim.addPinAt(e.x, e.y);
  else if (e.type === 'erase') e.ns.map(function (k) { return sim.strokes[k]; }).forEach(function (q) { if (q) sim.removeStroke(q); });
}
function liftEvents(lv, bx, by, v, n0) {
  var R = DP.BALL_R, g = lv.gy(bx - 22) - 1, La = v[0], Lr = v[1], wb = v[2], hh = v[3], yp = g - 42, px = bx + 22 + La, bot = g - 3;
  if (px + Lr > 1150 || bx - 22 < 4) return null;
  var path = [[px + Lr, yp], [bx + 22, yp], [bx + 22, bot], [bx - 22, bot], [bx - 22, g - 38]], raw = [], i;
  for (i = 0; i + 1 < path.length; i++) { var l = DP.line(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]); raw = raw.concat(i ? l.slice(1) : l); }
  return [{ t: 0, type: 'pin', x: px, y: yp }, { t: 0, type: 'stroke', raw: raw }, { t: 0, type: 'stroke', raw: DP.box(px + Lr - wb / 2 - 2, yp - hh - 4, wb) }];
}
function obstacles(lv) {                       // axis-aligned rectangles (inflated by the ball radius + margin) of everything static / moving in the air that a track must not cross
  var out = [], M = DP.BALL_R + 12;
  lv.boxes.forEach(function (b) {
    if (b.kind === 'bounce' || b.cy - b.hh > lv.Y1 + 4) return;
    var c = Math.abs(Math.cos(b.a)), sn = Math.abs(Math.sin(b.a)), hx = b.hw * c + b.hh * sn, hy = b.hw * sn + b.hh * c;
    if (b.cy + hy > lv.gy(b.cx) - 6 && b.kind !== 'slab' && b.kind !== 'ceil') return;
    out.push([b.cx - hx - M, b.cy - hy - M, b.cx + hx + M, b.cy + hy + M]);
  });
  (lv.springs || []).forEach(function (q) { out.push([q.cx - q.hw - M, q.cy - q.hh - M, q.cx + q.hw + M, q.cy + q.hh + M]); });
  (lv.movers || []).forEach(function (q) { out.push([q.cx - q.ax - q.hw - M, q.cy - q.ay - q.hh - M, q.cx + q.ax + q.hw + M, q.cy + q.ay + q.hh + M]); });
  return out;
}
function segHits(a, b, r) {
  var t0 = 0, t1 = 1, d = [b.x - a.x, b.y - a.y], lo = [r[0], r[1]], hi = [r[2], r[3]], p = [a.x, a.y];
  for (var i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (p[i] < lo[i] || p[i] > hi[i]) return false; }
    else { var u = (lo[i] - p[i]) / d[i], v = (hi[i] - p[i]) / d[i]; if (u > v) { var w = u; u = v; v = w; } t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false; }
  }
  return true;
}
function detourTails(lv, from, tail) {         // the tail as is, plus variants that route around the obstacles its straight chords cross (via one corner of each blocking rectangle)
  var obs = obstacles(lv), res = [tail], pts = [from].concat(tail), i, j, hits = [];
  for (i = 0; i + 1 < pts.length; i++) for (j = 0; j < obs.length; j++) if (segHits(pts[i], pts[i + 1], obs[j])) hits.push({ seg: i, r: obs[j] });
  if (!hits.length) return res;
  hits = hits.slice(0, 2);
  var opts = hits.map(function (h) { var r = h.r; return [{ x: r[0], y: r[1] }, { x: r[2], y: r[1] }, { x: r[0], y: r[3] }, { x: r[2], y: r[3] }].map(function (c) { c.x = Math.max(8, Math.min(1190, c.x)); c.y = Math.max(40, Math.min(clearY(lv, c.x), c.y)); return c; }); });
  var combos = [[]];
  opts.forEach(function (o) { var nx = []; combos.forEach(function (c) { o.forEach(function (v) { nx.push(c.concat([v])); }); }); combos = nx; });
  combos.forEach(function (cmb) {
    var nt = [], k;
    for (i = 0; i < tail.length; i++) {
      hits.forEach(function (h, hi) { if (h.seg === i) nt.push(cmb[hi]); });
      nt.push(tail[i]);
    }
    res.push(nt);
  });
  return res;
}
function* liftPlan(lv, snap, opts, t0, st) {
  var maxMs = opts.maxMs || 20000, R = DP.BALL_R, sim0 = new DP.Sim(lv, snap), T0 = 0, hadRope = !!snap.rope;
  var order = lv.stars.map(function (s, i) { return { s: s, i: i }; }).filter(function (q) { return !snap.got[q.i]; });
  order.sort(function (a, b) { return ((a.s.n || 1) - (b.s.n || 1)) || (a.s.x - b.s.x); });
  if (!order.length || sim0.strokes.length) return null;
  if (hadRope) {                                // hanging ball: cut at once and let it land; the lever is built around the (slowly rolling) ball later, while running
    sim0.cutRope();
    for (var z = 0; z < 260; z++) {
      sim0.step(); if (sim0.dead() || sim0.wrong) return null;
      var vv = sim0.ball.getLinearVelocity(), landed = sim0.by > lv.gy(Math.max(0, Math.min(1200, sim0.bx))) - R - 3;
      if (landed && Math.abs(vv.x) + Math.abs(vv.y) < 0.8 && z > 30) break;
    }
    if (z >= 260) return null;
    T0 = z + 1; snap = sim0.snapshot();
  }
  var bx = sim0.bx, by0 = sim0.by;
  var tail = order.map(function (q) { var g = lv.gy(Math.max(0, Math.min(1200, q.s.x))); return { x: q.s.x, y: g - q.s.y < 40 ? clearY(lv, q.s.x) : q.s.y + R + 3 }; });
  var tails = detourTails(lv, { x: bx, y: by0 - 120 }, tail), m = tail.length, nBase = sim0.strokes.length, vi, k, a;
  function done(events, r, tc) { r.steps += tc + T0; if (hadRope) events.unshift({ t: 0, type: 'cut' }); return { ok: true, cons: null, result: r, rollouts: st.n, ms: now() - t0, events: events }; }
  for (vi = 0; vi < LIFTS.length; vi++) {
    var fe = liftEvents(lv, bx, by0, LIFTS[vi]); if (!fe) continue;
    fe.forEach(function (e) { e.t = T0; if (T0) e.timed = true; });
    var sim = new DP.Sim(lv, snap), snaps = {}, ys = [], s;
    fe.forEach(function (e) { applyEv(sim, e); });
    for (s = 0; s < 200; s++) { sim.step(); ys.push(sim.by); if ((s & 31) === 31 && now() > ctl.deadline) yield; }
    var pk = 0; for (s = 1; s < ys.length; s++) if (ys[s] < ys[pk]) pk = s;
    if (DP.hwLog) DP.hwLog.push('variant ' + vi + ' rise ' + Math.round(by0 - ys[pk]) + ' pk ' + pk);
    if (by0 - ys[pk] < 50) continue;
    sim = new DP.Sim(lv, snap); fe.forEach(function (e) { applyEv(sim, e); });
    for (s = 0; s < pk + 14; s++) { sim.step(); if (s >= pk - 12 && s % 3 === 2) snaps[s + 1] = sim.snapshot(); if ((s & 31) === 31 && now() > ctl.deadline) yield; }
    var cands = [];
    [-6, 0, 6].forEach(function (d) { var tc = Math.round((pk + 1 + d) / 3) * 3; if (snaps[tc] && ys[tc - 1] < by0 - 40 && cands.indexOf(tc) < 0) cands.push(tc); });
    var bestC = null;
    function* tryC(c) {
      var raw = trackPoints(lv, [c.wp].concat(c.tail), c.sg), ce = [{ t: 0, type: 'erase', ns: [nBase, nBase + 1] }].concat(trackEvents(raw));
      st.n++;
      var r = yield* rollout(lv, c.S, ce, 1600); r.score = score(r);
      if (DP.hwLog) DP.hwLog.push(['tc', c.tc, 'wp', Math.round(c.wp.x), Math.round(c.wp.y), 'sg', c.sg.join('/'), r.why, r.got, Math.round(r.maxX), r.steps].join(' '));
      if (DP.hwTry) DP.hwTry.push({ S: c.S, ce: ce, mx: r.maxX });
      if (r.ok) { var ev = fe.concat(ce.map(function (e) { var q = {}; for (var kk in e) q[kk] = e[kk]; q.t = T0 + c.tc; q.timed = true; return q; })); return done(ev, r, c.tc); }
      if (!bestC || r.score > bestC.score) bestC = { c: c, score: r.score };
      return null;
    }
    function sgFor(tl) { var q = []; for (var z2 = 0; z2 < tl.length; z2++) q.push(SAGS[0]); return q; }
    if (tails.length > 1) {                    // choose how to get around the obstacles with the first catch candidate
      var tcM = cands[Math.min(1, cands.length - 1)], SM = snaps[tcM], smm = new DP.Sim(lv, SM), bestT = 0, bestS = -1;
      for (var ti = 0; ti < tails.length; ti++) {
        if (now() - t0 > maxMs) return null;
        bestC = null;
        var res0 = yield* tryC({ S: SM, tc: tcM, tail: tails[ti], wp: { x: smm.bx - 30, y: smm.by + R + 8 }, sg: sgFor(tails[ti]) });
        if (res0) return res0;
        if (bestC.score > bestS) { bestS = bestC.score; bestT = ti; }
      }
      tail = tails[bestT]; bestC = null;
    }
    for (k = 0; k < cands.length; k++) {
      var tc = cands[k], S = snaps[tc], sm = new DP.Sim(lv, S), bpx = sm.bx, bpy = sm.by;
      for (var xo = 0; xo < 2; xo++) for (var yo = 0; yo < 2; yo++) {
        if (now() - t0 > maxMs) return null;
        var res = yield* tryC({ S: S, tc: tc, tail: tail, wp: { x: bpx - 30 - xo * 30, y: bpy + R + 8 + yo * 30 }, sg: sgFor(tail) });
        if (res) return res;
      }
    }
    for (var pass = 0; pass < 3 && bestC; pass++) {
      var before = bestC.score, bc = bestC.c;
      for (var seg = 0; seg < bestC.c.sg.length; seg++) for (var si = 0; si < SAGS.length; si++) {
        if (SAGS[si] === bestC.c.sg[seg]) continue;
        if (now() - t0 > maxMs) return null;
        var sg2 = bestC.c.sg.slice(); sg2[seg] = SAGS[si];
        var res2 = yield* tryC({ S: bestC.c.S, tc: bestC.c.tc, tail: bestC.c.tail, wp: bestC.c.wp, sg: sg2 });
        if (res2) return res2;
      }
      if (bestC.score <= before) break;
    }
  }
  return null;
}

function* plan(lv, snap, running, opts) {
  opts = opts || {};
  var t0 = now(), n = 0, maxRollouts = opts.maxRollouts || 160, maxMs = opts.maxMs || 20000, fMs = running ? maxMs : maxMs * 0.4, feats = lv.features;
  var vars = feats.map(function (f) { return variants(f, lv); });
  var cons = { picks: feats.map(function () { return 0; }), vars: vars, extras: [], cut: snap.rope ? 0 : null };
  var rng = DP.mulberry32(DP.hash2(lv.seed, lv.L * 31 + snap.simT + snap.strokes.length));
  function* ev(c) { n++; var r = yield* rollout(lv, snap, buildEvents(c, running), 1800); r.score = score(r); return r; }
  function done(c, r) { return { ok: true, cons: c, result: r, rollouts: n, ms: now() - t0, events: buildEvents(c, running) }; }
  var cur, i, r, c2;
  if (snap.rope) {                           // choose the cut time first
    var bestT = 0, bestR = null;
    for (var t = 0; t <= 150 && now() - t0 <= fMs; t += 6) {
      c2 = clone(cons); c2.cut = t; r = yield* ev(c2);
      if (r.ok) return done(c2, r);
      if (!bestR || r.score > bestR.score) { bestR = r; bestT = t; }
    }
    cons.cut = bestT;
  }
  cur = yield* ev(cons);
  for (var iter = 0; iter < 12; iter++) {
    if (cur.ok) return done(cons, cur);
    if (n > maxRollouts || now() - t0 > fMs) break;
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
        if (n > maxRollouts || now() - t0 > fMs) break;
      }
      if (best) break;
    }
    if (!best && cons.cut != null) {         // re-time the rope cut for the changed course
      for (var t2 = 0; t2 <= 150 && now() - t0 <= fMs; t2 += 6) { if (t2 === cons.cut) continue; c2 = clone(cons); c2.cut = t2; r = yield* ev(c2); if (r.ok) return done(c2, r); if (r.score > cur.score + 5 && (!best || r.score > best.r.score)) best = { c: c2, r: r }; }
    }
    if (!best) {                              // random shooting near where the ball gave up
      for (var k = 0; k < 40 && n <= maxRollouts && now() - t0 <= fMs; k++) {
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
  if (!running && opts.lift !== false) {
    var lres = yield* liftPlan(lv, snap, opts, t0, { n: n });
    if (lres) return lres;
  }
  if (!running && opts.highway === true) {
    var hres = yield* highway(lv, snap, opts, t0, { n: n, maxRollouts: n + 320 });
    if (hres) return hres;
  }
  return { ok: false, cons: cons, result: cur, rollouts: n, ms: now() - t0 };
}

function planSync(lv, snap, running, opts) {
  ctl.deadline = Infinity;
  var g = plan(lv, snap, running, opts), r;
  do { r = g.next(); } while (!r.done);
  return r.value;
}
DP.dbg = { obstacles: obstacles, trackEvents: trackEvents, liftEvents: liftEvents, trackPoints: trackPoints, applyEv: applyEv, LIFTS: LIFTS, clearY: clearY };
DP.variants = variants; DP.plan = plan; DP.planSync = planSync; DP.planCtl = ctl; DP.buildEvents = buildEvents; DP.planDur = dur; DP.line = line; DP.box = box;
})();
