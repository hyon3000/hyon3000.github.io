/* Doodle / 두들 - core: procedural level generator, physics simulation wrapper (planck.js = Box2D port), stroke geometry.
   Used by the page (game.js) and by the auto-solver planner (planner.js) that simulates copies of the world. */
(function () {
'use strict';
var W = 1200, H = 800, S = 30;           // world size (px), px per metre
var BALL_R = 14, STAR_R = 16, MAXBODIES = 60, STROKE_MAX = Infinity;
var planck = window.planck;
var Vec2 = planck.Vec2;
function V(x, y) { return Vec2(x / S, y / S); }

/* ---------- random / hash ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(a, b) { var h = 2166136261 ^ (a | 0); h = Math.imul(h ^ (b | 0), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 16; return h >>> 0; }
function r12(x) { return Math.round(x / 12) * 12; }

/* ================= geometry helpers ================= */
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  var keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  var stack = [[0, pts.length - 1]];
  while (stack.length) {
    var ab = stack.pop(), a = ab[0], b = ab[1], md = 0, mi = -1;
    var ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, l2 = dx * dx + dy * dy;
    for (var i = a + 1; i < b; i++) {
      var d;
      if (l2 < 1e-9) d = Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
      else { var t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / l2)); d = Math.hypot(pts[i][0] - ax - t * dx, pts[i][1] - ay - t * dy); }
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps && mi > 0) { keep[mi] = true; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter(function (_, i) { return keep[i]; });
}
function area2(p) { var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; }
function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
function segInt(a, b, c, d) {
  var d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function isSimple(p) {
  var n = p.length;
  for (var i = 0; i < n; i++) for (var j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segInt(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return false; }
  return true;
}
function hull(pts) {
  var p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), lo = [], up = [], i;
  for (i = 0; i < p.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
  for (i = p.length - 1; i >= 0; i--) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop(); up.push(p[i]); }
  lo.pop(); up.pop(); return lo.concat(up);
}
function earClip(pts) {            // pts: simple polygon -> triangles (index triples), orientation normalised
  var idx = pts.map(function (_, i) { return i; });
  if (area2(pts) < 0) idx.reverse();
  var tris = [], guard = 0;
  var inTri = function (p, a, b, c) { return cross(a, b, p) > 1e-9 && cross(b, c, p) > 1e-9 && cross(c, a, p) > 1e-9; };
  while (idx.length > 3 && guard++ < 5000) {
    var n = idx.length, found = -1, best = -1, bi = 0;
    for (var i = 0; i < n; i++) {
      var a = pts[idx[(i + n - 1) % n]], b = pts[idx[i]], c = pts[idx[(i + 1) % n]];
      var cr = cross(a, b, c);
      if (cr > best) { best = cr; bi = i; }
      if (cr <= 1e-9) continue;
      var ok = true;
      for (var j = 0; j < n; j++) { if (j === i || j === (i + n - 1) % n || j === (i + 1) % n) continue; if (inTri(pts[idx[j]], a, b, c)) { ok = false; break; } }
      if (ok) { found = i; break; }
    }
    if (found < 0) found = bi;
    tris.push([idx[(found + n - 1) % n], idx[found], idx[(found + 1) % n]]);
    idx.splice(found, 1);
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}
function isConvex(poly, pts) {
  var n = poly.length;
  for (var i = 0; i < n; i++) if (cross(pts[poly[i]], pts[poly[(i + 1) % n]], pts[poly[(i + 2) % n]]) < -1e-6) return false;
  return true;
}
function mergeConvex(tris, pts, maxV) {          // Hertel-Mehlhorn style greedy merge
  var polys = tris.map(function (t) { return t.slice(); }), changed = true;
  while (changed) {
    changed = false;
    outer: for (var i = 0; i < polys.length; i++) for (var j = i + 1; j < polys.length; j++) {
      var A = polys[i], B = polys[j], na = A.length, nb = B.length;
      for (var a = 0; a < na; a++) {
        var u = A[a], v = A[(a + 1) % na];
        for (var b = 0; b < nb; b++) {
          if (B[b] === v && B[(b + 1) % nb] === u) {
            if (na + nb - 2 > maxV) continue;
            var m = [], k;
            for (k = 0; k < na; k++) m.push(A[(a + 1 + k) % na]);       // starts at v ... ends at u
            for (k = 2; k < nb; k++) m.push(B[(b + k) % nb]);           // after u in B up to before v
            // m: v, ..., u, then B vertices between u and v
            if (isConvex(m, pts)) { polys[i] = m; polys.splice(j, 1); changed = true; break outer; }
          }
        }
      }
    }
  }
  return polys;
}
function decompose(pts) {          // -> array of convex polygons (arrays of [x,y]), each <= 8 vertices
  var tris;
  if (isSimple(pts)) tris = earClip(pts);
  else { var h = hull(pts); if (h.length < 3) return []; pts = h; tris = []; for (var i = 1; i < h.length - 1; i++) tris.push([0, i, i + 1]); if (area2(h) < 0) tris = tris.map(function (t) { return [t[0], t[2], t[1]]; }); }
  tris = tris.filter(function (t) { return Math.abs(cross(pts[t[0]], pts[t[1]], pts[t[2]])) > 2; });
  return mergeConvex(tris, pts, 8).map(function (pl) { return pl.map(function (i) { return pts[i]; }); });
}
function pathLen(p) { var s = 0; for (var i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; }
function distSeg(px, py, a, b) {
  var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
function inPoly(px, py, p) {
  var c = false;
  for (var i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > py) !== (p[j][1] > py) && px < (p[j][0] - p[i][0]) * (py - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  return c;
}

/* ================= PROCEDURAL LEVEL ================= */
// difficulty ramps ~3.9x faster than the level number after level 3: level 10 plays like the old level 30 and it keeps rising from there
var EFF = [0, 1, 2, 3, 4, 6, 9, 13, 18, 24, 30];       // gentle start: levels 1-5 climb slowly, level 10 plays like the old level 30
function effLevel(n) {            // n may be fractional
  if (n <= 10) { var i = Math.floor(n), f = n - i; return Math.max(1, Math.round(EFF[i] + (EFF[Math.min(10, i + 1)] - EFF[i]) * f)); }
  return Math.round(30 + (n - 10) * 3.86);
}
var PACE = 0.35;                   // the whole curve is stretched: the difficulty that used to arrive at level 7 now arrives at level 20
function genLevel(seed, Lraw, opts) {
  var Lreal = Lraw * PACE;
  var L = effLevel(Lreal);
  var Ls = Math.round(Lreal * 0.75), Lst = effLevel(Ls);       // the number of stars (and plateaus that carry one) grows at 0.75x the pace of the rest
  var noRepair = !!(opts && opts.norepair), repairs = 0, invalidBefore = 0;
  var rnd = mulberry32(hash2(seed, Lraw * 7919 + 13));
  var rr = function (a, b) { return a + (b - a) * rnd(); };
  var hmax = Math.min(L > 30 ? 190 : 150, 40 + L * 7.5);
  var wmax = Math.min(L >= 8 ? 230 : 380, 130 + L * 16), HI = L >= 8;
  var nf = Math.min(1 + Math.floor((L - 1) / 3), 4);
  var D = Math.min(HI ? 380 : 410, Math.round(3.0 * hmax + 110));
  var Y1 = r12(rr(600, 640));
  var Ys = Y1 - D;
  var dl = HI ? r12(100 + 0.2 * D) : r12(180 + 0.4 * D);
  var xD = 216 + dl;                       // end of the descent
  var xF = HI ? 1100 : 1032;                           // final platform starts here
  var finalStep = L >= 3 && rnd() < 0.4;
  var wantRope = L >= 2 && rnd() < (L >= 16 ? 0.97 : L >= 10 ? 0.85 : Math.min(0.5, 0.2 + 0.03 * L));
  var pickType = function () {
    var wts = [['pit', 3], ['wall', 3]]; if (L >= 3) wts.push(['crates', HI ? 0.4 : 1.2], ['dominoes', HI ? 0.4 : 1.2]);
    var t = 0; wts.forEach(function (w) { t += w[1]; });
    var r = rnd() * t; for (var q = 0; q < wts.length; q++) { r -= wts[q][1]; if (r < 0) return wts[q][0]; }
    return 'pit';
  };
  var order = [], i;
  for (i = 0; i < nf; i++) order.push(pickType());
  if (HI) for (i = 0; i < Math.min(2, order.length); i++) if (order[i] === 'crates' || order[i] === 'dominoes') order[i] = rnd() < 0.5 ? 'pit' : 'wall';     // levels 8+: at least two real obstacles
  if (L <= 2) order = [rnd() < 0.5 ? 'pit' : 'wall'];
  var heavy = wantRope || order.indexOf('dominoes') >= 0 || order.indexOf('crates') >= 0, hscale = heavy ? 0.7 : 1;
  var mk = function (t) {
    if (t === 'pit') {
      var vr = rnd(), variant = 'plain';
      if (L >= 2) { if (vr < (HI ? 0.14 : 0.18)) variant = 'jet'; else if (vr < (HI ? 0.38 : 0.36)) variant = 'bounce'; else if (L >= 3 && vr < (HI ? 0.5 : 0.62)) variant = 'seesaw'; }
      var w;
      if (variant === 'seesaw') w = r12(rr(HI ? 190 : 150, Math.min(264, wmax + 40)));
      else if (variant === 'jet') w = r12(rr(HI ? 190 : 150, HI ? 260 : 372));
      else if (HI) w = r12(rr(190, 250));
      else w = r12(rr(Math.max(110, 0.7 * wmax), wmax));
      return { type: 'pit', variant: variant, w: w, lead: 36, need: 36 + w + 48 };
    }
    if (t === 'crates') return { type: 'crates', rows: L >= 8 ? Math.min(6, Math.max(3, 2 + Math.floor(L / 12))) : 2, lead: 48, w: 56, need: 48 + 56 + 72 };
    if (t === 'dominoes') { var n = 4 + Math.min(9, Math.floor(L / 4)); return { type: 'dominoes', n: n, lead: 48, w: n * 36, need: 48 + n * 36 + 72 }; }
    var mesa = Lst >= 12 && rnd() < Math.min(0.6, 0.15 + (Lst - 12) * 0.015);       // a raised plateau: the ball has to go UP onto it (the star is on top) and come down on the far side
    var h = Math.max(mesa ? 80 : 40, Math.round(rr(mesa ? 0.6 : 0.55, 1) * hmax * (mesa ? 1 : hscale)));
    var lead = r12(1.25 * h + 36), ww = mesa ? r12(rr(150, 260)) : 48;
    return { type: 'wall', h: h, ww: ww, lead: lead, need: lead + ww + 60, mesa: mesa };
  };
  var list = order.map(mk), pre = { patrols: [] };
  if (Lreal >= 6 && rnd() < Math.min(0.9, 0.55 + (Lreal - 6) * 0.03)) list.splice(1 + Math.floor(rnd() * Math.max(1, list.length - 1)), 0, { type: 'scale', need: 250, w: 210, lead: 20 });
  if (Lreal >= 7 && rnd() < Math.min(0.9, 0.6 + (Lreal - 7) * 0.03)) list.splice(1 + Math.floor(rnd() * Math.max(1, list.length - 1)), 0, { type: 'patrol', need: 215, w: 170, lead: 20 });
  if (L >= 10) list.splice(1, 0, { type: 'slot', need: 170, w: 170 });       // room reserved for a hazard (spikes / rotor) between the obstacles
  var step = null;
  if (finalStep) { var hs = Math.max(40, Math.round(rr(0.4, 0.75) * hmax * hscale)); step = { type: 'wall', h: hs, ww: 0, lead: r12(1.25 * hs + 36), need: r12(1.25 * hs + 36), end: true }; }
  var avail = xF - xD;
  var total = function () { var s = step ? step.need : 0; list.forEach(function (f) { s += f.need; }); return s; };
  while (list.length > 1 && total() > avail) list.pop();
  if (total() > avail) { if (step) step = null; }
  if (total() > avail) { list = [mk('pit')]; list[0].variant = 'plain'; list[0].w = 110; list[0].need = 36 + 110 + 48; }
  var seq = list.slice(); if (step) seq.push(step);
  var spare = Math.max(0, avail - total());
  var cursor = xD;
  var features = [], boxes = [], dyn = [], seesaws = [], jets = [];
  seq.forEach(function (f, idx) {
    var sp = r12(spare * rr(0.0, 0.6)); if (sp > spare) sp = r12(spare); spare -= sp;
    var base = cursor + sp;
    if (f.type === 'slot') { cursor = base + f.need; return; }
    if (f.type === 'scale') { var sx0 = r12(base + f.lead); seesaws.push({ cx: sx0 + 105, cy: Y1 - 18, hw: 90, hh: 5, scale: true }); features.push({ type: 'scale', x0: sx0, x1: sx0 + 210, y: Y1 }); cursor = sx0 + 250; return; }
    if (f.type === 'patrol') { var px0 = r12(base + f.lead); pre.patrols.push({ cx: px0 + 85, amp: 70 }); features.push({ type: 'patrol', x0: px0, x1: px0 + 170, y: Y1 }); cursor = px0 + 195; return; }
    if (f.type === 'pit') {
      var x0 = r12(base + f.lead), x1 = x0 + f.w;
      features.push({ type: 'pit', variant: f.variant, x0: x0, x1: x1, y: Y1 });
      if (f.variant === 'bounce') boxes.push({ cx: (x0 + x1) / 2, cy: Y1 + 119, hw: (x1 - x0) / 2, hh: 7, a: 0, kind: 'bounce', rest: 1.0, fric: 0.3 });
      if (f.variant === 'jet') jets.push({ x0: x0, x1: x1, y0: Y1 - 60, y1: Y1 + 130 });
      if (f.variant === 'seesaw') seesaws.push({ cx: (x0 + x1) / 2, cy: Y1 + 5, hw: (x1 - x0) / 2 - 2, hh: 5 });
      cursor = x1 + 48;
    } else if (f.type === 'crates') {
      var cx0 = r12(base + f.lead);
      for (var cc = 0; cc < 2; cc++) for (var rw = 0; rw < f.rows; rw++) dyn.push({ kind: 'crate', cx: cx0 + 14 + cc * 28, cy: Y1 - 14 - rw * 28 - 0.5, hw: 13.5, hh: 13.5, density: L >= 12 ? 0.12 : 0.06 });
      features.push({ type: 'crates', x0: cx0, x1: cx0 + 56, y: Y1 });
      cursor = cx0 + 56 + 72;
    } else if (f.type === 'dominoes') {
      var dx0 = r12(base + f.lead);
      for (var di = 0; di < f.n; di++) dyn.push({ kind: 'domino', cx: dx0 + 6 + di * 36, cy: Y1 - 28 - 0.5, hw: 6, hh: 28, density: 0.08 });
      features.push({ type: 'dominoes', x0: dx0, x1: dx0 + f.w, y: Y1 });
      cursor = dx0 + f.w + 72;
    } else if (f.end) {
      features.push({ type: 'wall', x0: xF, x1: W, top: Y1 - f.h, y: Y1, h: f.h, end: true });
      boxes.push({ cx: (xF + W) / 2, cy: Y1 - f.h + (f.h + 10) / 2, hw: (W - xF) / 2, hh: (f.h + 10) / 2, a: 0, kind: 'wall' });
      cursor = W;
    } else {
      var xw2 = r12(base + f.lead);
      features.push({ type: 'wall', x0: xw2, x1: xw2 + f.ww, top: Y1 - f.h, y: Y1, h: f.h, mesa: !!f.mesa });
      boxes.push({ cx: xw2 + f.ww / 2, cy: Y1 - f.h + (f.h + 10) / 2, hw: f.ww / 2, hh: (f.h + 10) / 2, a: 0, kind: 'wall' });
      cursor = xw2 + f.ww + 60;
    }
  });
  // ----- ground height profile
  var smooth = function (t) { return t * t * (3 - 2 * t); };
  var gy = function (x) {
    if (x <= 210) return Ys + 30 * x / 210;
    if (x >= 216 + dl) return Y1;
    var t = (x - 210) / (6 + dl); if (t < 0) t = 0;
    return Ys + 30 + (Y1 - Ys - 30) * smooth(t);
  };
  var iceOn = L >= 2 && rnd() < 0.35, iceX0 = 240, iceX1 = 216 + dl - 24;
  var raw = [], cur = [], x;
  var pits = features.filter(function (f) { return f.type === 'pit'; });
  for (x = 0; x <= W; x += 12) {
    var p = null; for (var k = 0; k < pits.length; k++) if (x >= pits[k].x0 && x <= pits[k].x1) p = pits[k];
    if (p) {
      if (x === p.x0) { cur.push([x, gy(x)]); cur.push([x, gy(x) + 130]); raw.push(cur); cur = []; }
      else if (x === p.x1) cur = [[x, gy(x) + 130], [x, gy(x)]];
      continue;
    }
    cur.push([x, gy(x)]);
  }
  raw.push(cur);
  var chains = [];
  raw.forEach(function (pts) {
    var run = [pts[0]], mat = null;
    for (var q = 0; q + 1 < pts.length; q++) {
      var mx = (pts[q][0] + pts[q + 1][0]) / 2, m = (iceOn && mx > iceX0 && mx < iceX1 && pts[q][0] !== pts[q + 1][0]) ? 'ice' : 'ground';
      if (mat === null) mat = m;
      if (m !== mat) { chains.push({ pts: run, mat: mat }); run = [pts[q]]; mat = m; }
      run.push(pts[q + 1]);
    }
    if (run.length > 1) chains.push({ pts: run, mat: mat || 'ground' });
  });
  // ceilings (low clearance above a pit / wall top)
  if (L >= 3) features.forEach(function (f) {
    if (f.type === 'pit' && (f.variant === 'plain' || f.variant === 'bounce') && rnd() < 0.5) boxes.push({ cx: (f.x0 + f.x1) / 2, cy: Y1 - 78 - 11, hw: (f.x1 - f.x0) / 2 + 24, hh: 11, a: 0, kind: 'ceil' });
    else if (f.type === 'wall' && !f.end && L >= 5 && rnd() < 0.4) boxes.push({ cx: (f.x0 + f.x1 + 80) / 2, cy: f.top - 64 - 11, hw: (f.x1 - f.x0 + 80) / 2, hh: 11, a: 0, kind: 'ceil' });
  });
  // ----- special elements (levels 6+): boost zones, rotating bars, spike patches (all seeded)
  var boosts = [], rotors = [], spikes = [];
  if (L >= 6) {
    var ne = L >= 10 ? Math.min(10, 2 + Math.floor((L - 10) / 4) + (rnd() < 0.5 ? 1 : 0)) : Math.min(3, 1 + Math.floor((L - 6) / 4) + (rnd() < 0.4 ? 1 : 0)), occ = [];
    features.forEach(function (f) {
      if (f.type === 'wall') occ.push([f.x0 - (1.25 * (f.h || 0) + 44), f.x1 + 70]);
      else if (f.type === 'pit') occ.push([f.x0 - 50, f.x1 + 50]);
      else occ.push([f.x0 - 60, f.x1 + 80]);
    });
    occ.push([0, xD + 10]); occ.push([W - 150, W + 50]);
    var freeSpans = function () {
      var o = occ.slice().sort(function (a, b) { return a[0] - b[0]; }), res = [], cur0 = 0;
      o.forEach(function (iv) { if (iv[0] > cur0) res.push([cur0, iv[0]]); cur0 = Math.max(cur0, iv[1]); });
      if (cur0 < W) res.push([cur0, W]);
      return res;
    };
    var need = 0;
    for (var qe = 0; qe < ne; qe++) {
      var tt = rnd(), typs = (L >= 10 && qe === 0) ? ['spikes', 'rotor', 'boost'] : (L >= 16 && qe === 1) ? ['rotor', 'spikes', 'boost'] : tt < 0.35 ? ['boost', 'spikes', 'rotor'] : tt < 0.65 ? ['rotor', 'spikes', 'boost'] : ['spikes', 'boost', 'rotor'], typ = null, ew = 0, spans = null;
      for (var ti = 0; ti < 3 && !typ; ti++) {
        var tp = typs[ti], w2 = tp === 'boost' ? 96 : tp === 'rotor' ? 120 : r12(rr(60, 100)), nd2 = tp === 'spikes' ? w2 + 70 : w2 + 30;
        var sp2 = freeSpans().filter(function (s) { return s[1] - s[0] >= nd2; });
        if (sp2.length) { typ = tp; ew = w2; spans = sp2; need = nd2; }
      }
      if (!typ) continue;
      var spn = spans[Math.floor(rnd() * spans.length)], ex0 = r12(spn[0] + 15 + (spn[1] - spn[0] - need) * rnd() + (typ === 'spikes' ? 45 : 0)), ex1 = ex0 + ew;
      occ.push([ex0 - (typ === 'spikes' ? 50 : 30), ex1 + (typ === 'spikes' ? 50 : 30)]);
      if (typ === 'boost') { var diag = rnd() < 0.4; boosts.push({ x0: ex0, x1: ex1, y0: Y1 - 70, y1: Y1, ax: diag ? 6 : 8, ay: diag ? -8 : 0 }); features.push({ type: 'boost', x0: ex0, x1: ex1, y: Y1 }); }
      else if (typ === 'rotor') { rotors.push({ cx: ex0 + 60, cy: Y1 - 100, r: 60, omega: (rnd() < 0.5 ? -1 : 1) * rr(1.6, 2.6) }); features.push({ type: 'rotor', x0: ex0, x1: ex1, y: Y1 }); }
      else { spikes.push({ x0: ex0, x1: ex1, top: Y1 - 18, y: Y1 }); features.push({ type: 'spikes', x0: ex0, x1: ex1, y: Y1 }); }
    }
    features.sort(function (a, b) { return a.x0 - b.x0; });
  }
  // ----- portal pairs (levels 8+): the ball entering one doorway re-appears at the other, moving along its normal
  var portals = [];
  if (L >= 8 && typeof occ !== 'undefined') {
    var np = (rnd() < 0.8 ? 1 : 0) + (L >= 12 && rnd() < 0.5 ? 1 : 0) + (L >= 24 && rnd() < 0.4 ? 1 : 0);
    var pcand = features.filter(function (f) { return (f.type === 'pit' || (f.type === 'wall' && !f.end)); });
    for (var pq = 0; pq < np && pcand.length; pq++) {          // a doorway pair that hops an obstacle: in just before a pit / wall, out just behind it
      var pf = pcand.splice(Math.floor(rnd() * pcand.length), 1)[0];
      var pa = r12(pf.x0 - (pf.type === 'wall' ? 70 : 52)), pb = r12(pf.x1 + 52), clash = pa < xD + 40 || pb > W - 180;
      features.forEach(function (g) { if ((g.type === 'boost' || g.type === 'rotor' || g.type === 'spikes' || g.type === 'portal') && ((pa > g.x0 - 50 && pa < g.x1 + 50) || (pb > g.x0 - 50 && pb < g.x1 + 50))) clash = true; });
      if (clash) { pq--; continue; }
      portals.push({ a: { x: pa, y: Y1 - 24, nx: 1, ny: 0 }, b: { x: pb, y: Y1 - 24, nx: 1, ny: 0 }, ci: pq });
      occ.push([pa - 40, pa + 40]); occ.push([pb - 40, pb + 40]);
      features.push({ type: 'portal', x0: pa - 24, x1: pb + 24, y: Y1 });
    }
    features.sort(function (a, b) { return a.x0 - b.x0; });
  }
  // ----- stars
  var stars = [];
  var last = features.filter(function (f) { return f.end; })[0] || null;
  if (last && last.end) stars.push({ x: W - 70, y: last.top - 24 }); else stars.push({ x: W - 70, y: Y1 - 24 });
  var extra = 0;
  var nMesa = 0; features.forEach(function (f) { if (f.mesa) nMesa++; });
  if (L >= 8) { extra = 1 + (rnd() < 0.6 ? 1 : 0) + (Lst >= 12 && rnd() < 0.5 ? 1 : 0) + (Lst >= 30 && rnd() < 0.5 ? 1 : 0) + (Lst >= 50 && rnd() < 0.5 ? 1 : 0); }   // ordered levels: 2-4 stars
  var cands = [];
  features.forEach(function (f) {
    if (f.type === 'wall' && !f.end) cands.push({ x: (f.x0 + f.x1) / 2, y: f.top - 24 });
    else if (f.type === 'pit') { cands.push({ x: f.x1 + 40, y: Y1 - 24 }); if (f.variant === 'plain' || f.variant === 'bounce') cands.push({ x: (f.x0 + f.x1) / 2, y: Y1 - 34 }); }
  });
  var inSpecial = function (xx) { return features.some(function (f) { return (f.type === 'boost' || f.type === 'rotor' || f.type === 'spikes' || f.type === 'patrol' || f.type === 'scale') && xx > f.x0 - 40 && xx < f.x1 + 40; }) || portals.some(function (pr) { return Math.abs(xx - pr.a.x) < 40 || Math.abs(xx - pr.b.x) < 40; }); };
  cands = cands.filter(function (q) { return !inSpecial(q.x); });
  var tries2 = 0; while (cands.length < extra && tries2++ < 40) { var cxr = r12(rr(xD + 24, xF - 60)); if (!inSpecial(cxr)) cands.push({ x: cxr, y: Y1 - 24 }); }
  if (L >= 8) extra = Math.max(extra, Math.min(nMesa + 1, 5));
  cands.forEach(function (q) { features.forEach(function (f) { if (f.mesa && Math.abs((f.x0 + f.x1) / 2 - q.x) < 1) q.mesa = true; }); });
  for (i = cands.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var tmp = cands[i]; cands[i] = cands[j]; cands[j] = tmp; }
  cands.sort(function (a, b) { return (b.mesa ? 1 : 0) - (a.mesa ? 1 : 0); });
  for (i = 0, j = 0; j < extra && i < cands.length; i++) { var okc = true; stars.forEach(function (st0) { if (Math.hypot(st0.x - cands[i].x, st0.y - cands[i].y) < 80) okc = false; }); if (okc && cands[i].x > xD + 20) { stars.push({ x: cands[i].x, y: cands[i].y }); j++; } }
  // ----- high stars: floating well above the start height. Nothing rolls up there on its own - the player has to lift the ball (balance scale / lever / catapult, bounce, boost ...)
  var nHigh = L >= 8 ? Math.min(3, 1 + Math.floor((Ls - 5) / 5)) : 0;
  for (var hi2 = 0, htry = 0; hi2 < nHigh && htry++ < 80;) {
    var hx = r12(rr(xD + 80, xF - 40)), hy = Math.max(80, Y1 - rr(250, 470)), okH = !inSpecial(hx);
    stars.forEach(function (st1) { if (Math.hypot(st1.x - hx, st1.y - hy) < 110) okH = false; });
    if (okH) { stars.push({ x: hx, y: hy }); hi2++; }
  }
  // ----- validation: every object must lie in free space (clearance = radius + 6 px) with respect to the static terrain, static props and killer zones
  var pointFree = function (x, y, rad, extra) {
    var m = rad + (extra == null ? 6 : extra), i, f;
    if (x < m || x > W - m || y < m) return false;
    var pit = null; features.forEach(function (g) { if (g.type === 'pit' && x > g.x0 && x < g.x1) pit = g; });
    if (!pit) { if (y > gy(x) - m) return false; }
    else if (Math.min(x - pit.x0, pit.x1 - x) < m && y > gy(pit.x0) - m) return false;
    for (i = 0; i < boxes.length; i++) { var b = boxes[i], dx = x - b.cx, dy = y - b.cy, ca = Math.cos(-b.a), sa = Math.sin(-b.a), lx = dx * ca - dy * sa, ly = dx * sa + dy * ca; if (Math.hypot(Math.max(Math.abs(lx) - b.hw, 0), Math.max(Math.abs(ly) - b.hh, 0)) < m) return false; }
    for (i = 0; i < dyn.length; i++) { var d = dyn[i]; if (Math.hypot(Math.max(Math.abs(x - d.cx) - d.hw, 0), Math.max(Math.abs(y - d.cy) - d.hh, 0)) < m) return false; }
    for (i = 0; i < seesaws.length; i++) { var s = seesaws[i]; if (Math.hypot(Math.max(Math.abs(x - s.cx) - s.hw, 0), Math.max(Math.abs(y - s.cy) - (s.hh + s.hw * 0.32), 0)) < m) return false; }
    for (i = 0; i < spikes.length; i++) { var k = spikes[i]; if (Math.hypot(Math.max(k.x0 - x, 0, x - k.x1), Math.max(k.top - 6 - y, 0, y - k.y)) < m) return false; }
    for (i = 0; i < rotors.length; i++) { var r = rotors[i]; if (Math.hypot(x - r.cx, y - r.cy) < r.r + 5 + m) return false; }     // the whole rotation sweep
    return true;
  };
  var pitAt = function (xx) { return features.some(function (g) { return g.type === 'pit' && xx > g.x0 && xx < g.x1; }); };
  var topAt = function (xx) { var t = gy(xx); features.forEach(function (g) { if (g.type === 'wall' && xx >= g.x0 && xx <= g.x1) t = Math.min(t, g.top); }); return t; };
  portals = portals.filter(function (pr) { var ok = pointFree(pr.a.x, pr.a.y, 12) && pointFree(pr.b.x, pr.b.y, 12); if (!ok) { invalidBefore++; if (noRepair) return true; features = features.filter(function (g) { return !(g.type === 'portal' && g.x0 === pr.a.x - 24); }); repairs++; } return ok || noRepair; });
  boosts = boosts.filter(function (z) { var ok = true; for (var gx = z.x0 + 6; gx < z.x1; gx += 20) for (var gy2 = z.y0 + 6; gy2 < z.y1 - 4; gy2 += 20) if (!pointFree(gx, gy2, 0, 0)) ok = false; if (!ok) { invalidBefore++; if (!noRepair) { features = features.filter(function (g) { return !(g.type === 'boost' && g.x0 === z.x0); }); repairs++; return false; } } return true; });
  var fixStar = function (s, idx) {
    if (pointFree(s.x, s.y, STAR_R)) return true;
    invalidBefore++;
    if (noRepair) return false;
    for (var dd = 12; dd <= 480; dd += 12) for (var sg = -1; sg <= 1; sg += 2) {
      var x = s.x + sg * dd, y = pitAt(x) ? Y1 - 34 : topAt(x) - 24;
      if (!pointFree(x, y, STAR_R) || inSpecial(x)) continue;
      var okk2 = true; stars.forEach(function (o, kk) { if (kk !== idx && Math.hypot(o.x - x, o.y - y) < 80) okk2 = false; });
      if (okk2) { s.x = x; s.y = y; repairs++; return true; }
    }
    return false;
  };
  for (i = stars.length - 1; i >= 0; i--) { if (!fixStar(stars[i], i) && i > 0 && !noRepair) stars.splice(i, 1); }
  if (L >= 8 && stars.length < 2) {        // make sure ordered levels have 2+ stars: relax by dropping the portals, then place on any free flat
    portals.length = 0; features = features.filter(function (f) { return f.type !== 'portal'; });
    var t4 = 0; while (stars.length < 2 && t4++ < 120) { var cx4 = r12(rr(xD + 24, xF - 60)), cy4 = pitAt(cx4) ? Y1 - 34 : topAt(cx4) - 24; if (inSpecial(cx4) || !pointFree(cx4, cy4, STAR_R)) continue; var okk = true; stars.forEach(function (s4) { if (Math.hypot(s4.x - cx4, s4.y - cy4) < 80) okk = false; }); if (okk) stars.push({ x: cx4, y: cy4 }); }
  }
  // required collection order (indices into stars): along the route, left to right; the goal star is the right-most so it is last
  var order = stars.map(function (s, k) { return k; }).sort(function (a, b) { return stars[a].x - stars[b].x; });
  order.forEach(function (k, rank) { stars[k].n = rank + 1; });
  // ----- rope: the ball hangs from a rope above the start slope and must be cut loose (swipe across it)
  var rope = null, start = { x: 70, y: gy(70) - BALL_R - 1 };
  if (wantRope && Ys >= 190) {
    var len = Math.min(rr(100, 150), Ys - 100), ang = rr(0.45, 0.7);
    var ax = 60 + len * Math.sin(ang), ay = gy(60) - len - 40;
    rope = { ax: ax, ay: ay, len: len, ang: ang };
    start = { x: ax - len * Math.sin(ang), y: ay + len * Math.cos(ang) };
  }
  if (rope && !pointFree(rope.ax, rope.ay, 7)) { invalidBefore++; if (!noRepair) { rope = null; start = { x: 70, y: gy(70) - BALL_R - 1 }; repairs++; } }
  if (!pointFree(start.x, start.y, BALL_R, 0)) invalidBefore++;
  // ----- floating decorative slabs (kept clear of every corridor)
  var topY = function (xx) { var t = gy(xx); features.forEach(function (f) { if (f.type === 'wall' && xx >= f.x0 && xx <= f.x1) t = Math.min(t, f.top); }); return t; };
  // floating things only go where the ball plays: over the obstacles (pits, walls, ...) or beside the descent, never in far-away corners of the sky
  var poiX = function () {
    var fs = features.filter(function (f) { return f.type === 'pit' || f.type === 'wall' || f.type === 'crates' || f.type === 'dominoes' || f.type === 'spikes'; });
    if (!fs.length || rnd() < 0.2) return rr(216, xD + 60);
    var f = fs[Math.floor(rnd() * fs.length)];
    return (f.x0 + f.x1) / 2 + rr(-80, 80);
  };
  var nd = L >= 2 ? Math.min(10, 1 + Math.floor(L / 4)) : 0, tries = 0, slabs = 0;
  while (slabs < nd && tries++ < 60) {
    var len2 = rr(90, 200), ang2 = rr(-0.45, 0.45), cx = Math.max(160, Math.min(W - 160, poiX())), cy = rr(Y1 - 270, Y1 - 180);
    if (cx < xD + 40) cy = Math.min(cy, gy(cx) - rr(130, 200));
    var hw = len2 / 2, hh = 9, ok = true, c = Math.cos(ang2), s = Math.sin(ang2);
    var ext = Math.abs(hw * s) + hh * Math.abs(c), exx = Math.abs(hw * c) + hh * Math.abs(s);
    if (cy + ext > Y1 - 150) ok = false;
    for (var q2 = -exx; ok && q2 <= exx; q2 += 12) if (cy + ext > topY(Math.max(0, Math.min(W, cx + q2))) - 170) ok = false;
    if (Math.hypot(cx - start.x, cy - start.y) < 170 + len2 / 2) ok = false;
    if (rope && Math.hypot(cx - rope.ax, cy - rope.ay) < 230 + len2 / 2) ok = false;
    stars.forEach(function (st) { if (Math.hypot(cx - st.x, cy - st.y) < 120 + len2 / 2) ok = false; });
    boxes.forEach(function (b) { if (Math.abs(cx - b.cx) < hw + b.hw + 30 && Math.abs(cy - b.cy) < ext + b.hh + 50) ok = false; });
    rotors.forEach(function (ro) { if (Math.abs(cx - ro.cx) < ro.r + len2 / 2 + 60 && cy + ext > ro.cy - ro.r - 60) ok = false; });
    jets.forEach(function (jt) { if (cx + exx > jt.x0 - 20 && cx - exx < jt.x1 + 20 && cy + ext > Y1 - 260) ok = false; });
    if (ok) { boxes.push({ cx: cx, cy: cy, hw: hw, hh: hh, a: ang2, kind: 'slab' }); slabs++; }
  }
  // ----- balance scale map: a ready-made scale (beam on a fulcrum) stands on the ground and a star hangs high above it - the player uses the scale (drop a weight on one end) to fling the ball up
  features.forEach(function (f) {
    if (f.type !== 'scale') return;
    for (var dy3 = 0; dy3 <= 200; dy3 += 20) for (var dx3 = 0; dx3 <= 90; dx3 += 15) for (var sg3 = -1; sg3 <= 1; sg3 += 2) {
      var sx3 = f.x0 + 35 + sg3 * dx3, sy3 = Math.max(90, Y1 - 330) + dy3, ok3 = pointFree(sx3, sy3, STAR_R + 4) && sy3 < Y1 - 120;
      stars.forEach(function (o3) { if (Math.hypot(o3.x - sx3, o3.y - sy3) < 90) ok3 = false; });
      if (ok3) { stars.push({ x: sx3, y: sy3 }); return; }
    }
  });
  order = stars.map(function (s, k) { return k; }).sort(function (a, b) { return stars[a].x - stars[b].x; }); order.forEach(function (k, rank) { stars[k].n = rank + 1; });
  // ----- airborne spinners: their number keeps growing with the level number (more things to build around)
  var nAir = Math.min(8, Math.floor((Lreal - 5) / 2.5));
  for (var ai = 0, atry = 0; ai < nAir && atry++ < 80;) {
    var ar = rr(38, 62), ax = Math.max(xD + 40, Math.min(W - 200, poiX())), ay = rr(Y1 - 250, Y1 - 190 - ar * 0.3), okA = true;
    stars.forEach(function (s0) { if (Math.hypot(s0.x - ax, s0.y - ay) < ar + 46) okA = false; });
    rotors.forEach(function (r0) { if (Math.hypot(r0.cx - ax, r0.cy - ay) < r0.r + ar + 40) okA = false; });
    portals.forEach(function (p0) { if (Math.hypot(p0.a.x - ax, p0.a.y - ay) < ar + 60 || Math.hypot(p0.b.x - ax, p0.b.y - ay) < ar + 60) okA = false; });
    if (!okA) continue;
    rotors.push({ cx: ax, cy: ay, r: ar, omega: (rnd() < 0.5 ? -1 : 1) * rr(1.4, 2.8), air: true, deadly: rnd() < Math.min(0.55, Math.max(0, (Lreal - 6) * 0.05)) }); ai++;
  }
  // ----- movers: platforms gliding sideways / up and down on a timer (carry the ball and collide with drawings), and spiked blocks patrolling the ground (deadly on touch)
  var movers = [], nMov = Lreal >= 4 ? Math.min(4, 1 + Math.floor((Lreal - 4) / 3)) : 0;
  var mClear = function (cx, cy, ex, ey, pad) {
    var ok = true;
    stars.forEach(function (s0) { if (Math.abs(s0.x - cx) < ex + pad && Math.abs(s0.y - cy) < ey + pad) ok = false; });
    rotors.forEach(function (r0) { if (Math.abs(r0.cx - cx) < r0.r + ex + 20 && Math.abs(r0.cy - cy) < r0.r + ey + 20) ok = false; });
    boxes.forEach(function (b0) { if (Math.abs(b0.cx - cx) < b0.hw + ex + 20 && Math.abs(b0.cy - cy) < b0.hh + ey + 20) ok = false; });
    (typeof springs !== 'undefined' ? springs : []).forEach(function (q0) { if (Math.abs(q0.cx - cx) < q0.hw + ex + 20 && Math.abs(q0.cy - cy) < q0.hh + ey + 20) ok = false; });
    movers.forEach(function (m0) { if (Math.abs(m0.cx - cx) < m0.hw + m0.ax + ex + 20 && Math.abs(m0.cy - cy) < m0.hh + m0.ay + ey + 20) ok = false; });
    return ok;
  };
  for (var mi = 0, mtry = 0; mi < nMov && mtry++ < 80;) {
    var horiz = rnd() < 0.55, mhw = rr(42, 68), mhh = 7, amx = horiz ? rr(50, 110) : 0, amy = horiz ? 0 : rr(35, 70);
    var mcx = Math.max(xD + 60 + amx, Math.min(W - 200 - amx, poiX())), mcy = rr(Y1 - 250, Y1 - 170 - amy);
    if (!mClear(mcx, mcy, mhw + amx, mhh + amy, 40)) continue;
    movers.push({ cx: r12(mcx), cy: r12(mcy), hw: r12(mhw), hh: mhh, ax: r12(amx), ay: r12(amy), w: r12(rr(0.9, 1.7) * 100) / 100, ph: r12(rr(0, 6.28) * 100) / 100, deadly: false }); mi++;
  }
  // ----- spring blocks: touching the top launches the ball upward (on the ground and floating above the obstacles)
  var springs = [], nSpr = Lreal >= 3 ? Math.min(4, 1 + Math.floor((Lreal - 3) / 4)) : 0;
  for (var gi = 0, gtry = 0; gi < nSpr && gtry++ < 80;) {
    var air = rnd() < 0.5, shw = air ? 34 : 30, shh = 8, sx, sy;
    if (air) { sx = Math.max(xD + 60, Math.min(W - 200, poiX())); sy = rr(Y1 - 250, Y1 - 175); }
    else {
      var gs = (typeof freeSpans === 'function' ? freeSpans() : []).filter(function (s) { return s[1] - s[0] >= 130 && s[1] > xD + 80; });
      if (!gs.length) continue; var g0 = gs[Math.floor(rnd() * gs.length)]; sx = rr(Math.max(g0[0], xD + 60) + 40, g0[1] - 40); sy = Y1 - shh;
    }
    if (!mClear(sx, sy, shw, shh + (air ? 0 : 6), 40)) continue;
    var tooNear = false; springs.forEach(function (q) { if (Math.abs(q.cx - sx) < 120 && Math.abs(q.cy - sy) < 120) tooNear = true; }); if (tooNear) continue;
    springs.push({ cx: r12(sx), cy: r12(sy), hw: shw, hh: shh, v: 13 }); gi++;
  }
  pre.patrols.forEach(function (q) { movers.push({ cx: q.cx, cy: Y1 - 18, hw: 24, hh: 18, ax: q.amp, ay: 0, w: r12(rr(1.0, 1.9) * 100) / 100, ph: r12(rr(0, 6.28) * 100) / 100, deadly: true }); });
  var lv = { seed: seed, L: L, Ys: Ys, Y1: Y1, D: D, xD: xD, chains: chains, boxes: boxes, dyn: dyn, seesaws: seesaws, jets: jets, boosts: boosts, rotors: rotors, movers: movers, springs: springs, spikes: spikes, portals: portals, rope: rope, stars: stars, order: order, features: features,
    start: start, gy: gy, ice: iceOn ? [iceX0, iceX1] : null };
  var hh2 = 0; var acc = function (v) { hh2 = hash2(hh2, Math.round(v * 10)); };
  chains.forEach(function (ch) { ch.pts.forEach(function (p2) { acc(p2[0]); acc(p2[1]); }); acc(ch.mat === 'ice' ? 1 : 0); });
  boxes.forEach(function (b) { acc(b.cx); acc(b.cy); acc(b.hw); acc(b.hh); acc(b.a * 100); });
  dyn.forEach(function (b) { acc(b.cx); acc(b.cy); });
  seesaws.forEach(function (b) { acc(b.cx); acc(b.hw); });
  jets.forEach(function (b) { acc(b.x0); acc(b.x1); });
  boosts.forEach(function (b) { acc(b.x0); acc(b.ax); acc(b.ay); }); rotors.forEach(function (b) { acc(b.cx); acc(b.omega * 100); }); movers.forEach(function (m) { acc(m.cx); acc(m.cy); acc(m.w * 100); }); spikes.forEach(function (b) { acc(b.x0); acc(b.x1); });
  portals.forEach(function (b) { acc(b.a.x); acc(b.b.x); });
  if (rope) { acc(rope.ax); acc(rope.ay); acc(rope.len); }
  stars.forEach(function (s2) { acc(s2.x); acc(s2.y); });
  lv.checksum = hh2; lv.repairs = repairs; lv.invalidBefore = invalidBefore;
  lv.modules = [];
  features.forEach(function (f) { if (f.type === 'boost' || f.type === 'rotor' || f.type === 'spikes' || f.type === 'portal') return; var m = f.type === 'pit' ? 'pit-' + f.variant : f.type; if (lv.modules.indexOf(m) < 0) lv.modules.push(m); });
  if (boosts.length) lv.modules.push('boost'); if (rotors.length) lv.modules.push('rotor'); if (spikes.length) lv.modules.push('spikes'); if (portals.length) lv.modules.push('portal'); if (L >= 8 && stars.length > 1) lv.modules.push('ordered');
  if (rope) lv.modules.push('rope'); if (iceOn) lv.modules.push('ice'); 
  return lv;
}

/* ================= simulation wrapper ================= */
function makeGeom(raw) {
  // raw: [[x,y],...] world px. returns {kind, loc, polys, ox, oy} or null
  if (raw.length < 2) return null;
  var plen = pathLen(raw);
  if (plen < 22 || plen > 3500) return null;
  var first = raw[0], lastp = raw[raw.length - 1];
  var gap = Math.hypot(first[0] - lastp[0], first[1] - lastp[1]);
  var closed = gap < Math.max(26, 0.18 * plen) && raw.length >= 4;
  var pts = rdp(raw, closed ? 3.5 : 2.5), eps = 3.5;
  if (closed) { if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 6) pts.pop(); }
  while (pts.length > (closed ? 40 : 70) && eps < 40) { eps *= 1.5; pts = rdp(raw, eps); if (closed && pts.length > 1) pts.pop(); }
  var bb = [1e9, 1e9, -1e9, -1e9];
  pts.forEach(function (p) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); });
  var ox = (bb[0] + bb[2]) / 2, oy = (bb[1] + bb[3]) / 2;
  var loc = pts.map(function (p) { return [p[0] - ox, p[1] - oy]; });
  var kind = 'line', polys = null;
  if (closed && loc.length >= 3 && Math.abs(area2(loc)) / 2 >= 300) {
    polys = decompose(loc);
    if (polys.length) kind = 'poly';
  }
  if (kind === 'line' && closed) loc.push(loc[0].slice());
  return { kind: kind, loc: loc, polys: kind === 'poly' ? polys : null, ox: ox, oy: oy };
}

function Sim(lv, snap) {
  var self = this;
  this.lv = lv;
  var world = this.world = new planck.World({ gravity: Vec2(0, 10) });
  var g = world.createBody({ type: 'static', position: Vec2(0, 0) }); this.groundBody = g;
  lv.chains.forEach(function (c) {
    if (c.pts.length < 2) return;
    g.createFixture({ shape: new planck.Chain(c.pts.map(function (p) { return V(p[0], p[1]); }), false), friction: c.mat === 'ice' ? 0.03 : 0.8, restitution: 0 });
  });
  lv.boxes.forEach(function (b) {
    var bb = world.createBody({ type: 'static', position: V(b.cx, b.cy), angle: b.a });
    bb.createFixture({ shape: new planck.Box(b.hw / S, b.hh / S), friction: b.fric == null ? 0.8 : b.fric, restitution: b.rest || 0 });
  });
  var wl = world.createBody({ type: 'static', position: V(-20, H / 2) });
  wl.createFixture({ shape: new planck.Box(20 / S, 3000 / S), friction: 0.3 });
  var wr = world.createBody({ type: 'static', position: V(W + 20, H / 2) });
  wr.createFixture({ shape: new planck.Box(20 / S, 3000 / S), friction: 0.3 });
  this.props = [];
  lv.dyn.forEach(function (d) {
    var b = world.createBody({ type: 'dynamic', position: V(d.cx, d.cy) });
    b.createFixture({ shape: new planck.Box(d.hw / S, d.hh / S), density: d.density, friction: 0.25, restitution: 0 });
    self.props.push({ body: b, kind: d.kind, hw: d.hw, hh: d.hh });
  });
  lv.seesaws.forEach(function (s) {
    var hinge = world.createBody({ type: 'static', position: V(s.cx, s.cy) });
    var plank = world.createBody({ type: 'dynamic', position: V(s.cx, s.cy), angularDamping: 1.5 });
    plank.createFixture({ shape: new planck.Box(s.hw / S, s.hh / S), density: 0.7, friction: 0.7, restitution: 0 });
    world.createJoint(new planck.RevoluteJoint({ lowerAngle: -0.3, upperAngle: 0.3, enableLimit: true }, hinge, plank, V(s.cx, s.cy)));
    self.props.push({ body: plank, kind: 'seesaw', hw: s.hw, hh: s.hh });
  });
  this.rotors = lv.rotors.map(function (r) {
    var b = world.createBody({ type: 'kinematic', position: V(r.cx, r.cy) });
    b.createFixture({ shape: new planck.Box(r.r / S, 5 / S), friction: 0.6, restitution: 0.1 });
    b.setAngularVelocity(r.omega); return { body: b, r: r };
  });
  this.movers = (lv.movers || []).map(function (m) {
    var b = world.createBody({ type: 'kinematic', position: V(m.cx, m.cy) });
    b.createFixture({ shape: new planck.Box(m.hw / S, m.hh / S), friction: 0.9, restitution: 0 });
    return { body: b, m: m };
  });
  this.springs = (lv.springs || []).map(function (s) {
    var b = world.createBody({ type: 'static', position: V(s.cx, s.cy) });
    b.createFixture({ shape: new planck.Box(s.hw / S, s.hh / S), friction: 0.3, restitution: 0.2 });
    return { body: b, s: s, cd: 0 };
  });
  this.killed = false;
  this.ball = world.createBody({ type: 'dynamic', position: V(lv.start.x, lv.start.y), bullet: true, angularDamping: 0.02 });
  this.ball.createFixture({ shape: new planck.Circle(BALL_R / S), density: 1.5, friction: 0.6, restitution: 0.05 });
  this.stars = lv.stars.map(function (s) { return { x: s.x, y: s.y, got: false, n: s.n || 1 }; }); this.next = 0; this.wrong = false;
  this.strokes = []; this.pins = []; this.nextId = 1; this.simT = 0; this.won = false; this.rope = null; this.ropes = []; this.ropeGid = 1; this.portCd = 0; this.bx = lv.start.x; this.by = lv.start.y; this.onStroke = null; this.events = [];
  if (lv.rope) this.makeRope();
  if (snap) this.restore(snap);
}
/* ---- ropes: chains of small boxes joined by revolute joints (own negative filter group, so a rope does not collide with itself) ---- */
var ROPE_SEG = 12, ROPE_CAP = 120, RSUB = 3, RVEL = 16, RPOS = 6;
Sim.prototype.buildChain = function (P, level) {
  var world = this.world, links = [], joints = [], gid = this.ropeGid++;
  for (var i = 0; i + 1 < P.length; i++) {
    var a = P[i], b = P[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    var body = world.createBody({ type: 'dynamic', position: V((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), angle: Math.atan2(b[1] - a[1], b[0] - a[0]), linearDamping: 0.12, angularDamping: 0.3, bullet: !level });
    body.createFixture({ shape: new planck.Box((len / 2 + 0.8) / S, 3.2 / S), density: level ? 0.6 : 5, friction: 0.4, restitution: 0,
      filterGroupIndex: level ? 0 : -gid, filterCategoryBits: level ? 2 : 1, filterMaskBits: level ? 0 : 0xFFFF });
    body.__hl = len / 2;
    links.push(body);
    if (i > 0) joints.push(world.createJoint(new planck.RevoluteJoint({}, links[i - 1], body, V(a[0], a[1]))));
  }
  return { links: links, joints: joints, gid: gid };
};
Sim.prototype.makeRope = function () {
  var r = this.lv.rope, N = Math.max(3, Math.ceil(r.len / ROPE_SEG)), P = [], bp = this.ball.getPosition(), bx = bp.x * S, by = bp.y * S;
  for (var i = 0; i <= N; i++) P.push([r.ax + (bx - r.ax) * i / N, r.ay + (by - r.ay) * i / N]);
  var ch = this.buildChain(P, true);
  this.world.createJoint(new planck.RevoluteJoint({}, this.groundBody, ch.links[0], V(r.ax, r.ay)));
  this.world.createJoint(new planck.RevoluteJoint({}, ch.links[N - 1], this.ball, V(bx, by)));
  var rec = { level: true, links: ch.links, ax: r.ax, ay: r.ay, spec: { P: P, level: true }, cut: false };
  this.rope = rec; this.ropes.push(rec);
};
Sim.prototype.destroyRope = function (rec) {
  var i = this.ropes.indexOf(rec); if (i >= 0) this.ropes.splice(i, 1);
  rec.links.forEach(function (b) { if (b) try { this.world.destroyBody(b); } catch (e) {} }, this);
  rec.links = [];
  if (this.rope === rec) this.rope = null;
  this.pinsPrune();
};
Sim.prototype.ropeSegCount = function () { var n = 0; this.ropes.forEach(function (r) { if (!r.level) r.links.forEach(function (b) { if (b) n++; }); }); return n; };
Sim.prototype.attachBody = function (att) {            // {kind:'static'} | {kind:'stroke', st, lx, ly} | null -> body
  if (!att) return null;
  if (att.kind === 'static') return this.groundBody;
  if (att.kind === 'peg') return this.pins.indexOf(att.pin) >= 0 ? att.pin.anchor : null;
  if (att.kind === 'stroke' && this.strokes.indexOf(att.st) >= 0) return att.st.body;
  return null;
};
Sim.prototype.attachWorld = function (att, fallback) {
  if (att && att.kind === 'stroke' && this.strokes.indexOf(att.st) >= 0) { var p = att.st.body.getPosition(), a = att.st.body.getAngle(), co = Math.cos(a), si = Math.sin(a); return [p.x * S + att.lx * co - att.ly * si, p.y * S + att.lx * si + att.ly * co]; }
  return fallback;
};
Sim.prototype.addRope = function (A, B, attA, attB, P0) {
  var P = P0;
  if (!P) {
    var d = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (d < 14) return null;
    var Lr = d * 1.15, N = Math.max(2, Math.round(Lr / ROPE_SEG));
    var pt = function (t, sg) { return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t + 4 * sg * t * (1 - t)]; };
    var arc = function (sg) { var s = 0, q = pt(0, sg); for (var k = 1; k <= 40; k++) { var r = pt(k / 40, sg); s += Math.hypot(r[0] - q[0], r[1] - q[1]); q = r; } return s; };
    var lo = 0, hi = Lr; for (var it = 0; it < 30; it++) { var mid = (lo + hi) / 2; if (arc(mid) < Lr) lo = mid; else hi = mid; }
    P = []; for (var i = 0; i <= N; i++) P.push(pt(i / N, lo));
  }
  var N2 = P.length - 1;
  while (this.ropeSegCount() + N2 > ROPE_CAP) { var old = this.ropes.filter(function (r) { return !r.level; })[0]; if (!old) return null; this.destroyRope(old); this.events.push('toomanyropes'); }
  var ch = this.buildChain(P, false), rec = { level: false, links: ch.links, spec: { P: P, attA: attA || null, attB: attB || null }, attA: attA || null, attB: attB || null, cut: false };
  var ba = this.attachBody(attA), bb = this.attachBody(attB);
  rec.endA = ba ? { b: ba, p: [P[0][0], P[0][1]], lp: ba.getLocalPoint(V(P[0][0], P[0][1])) } : null; rec.endB = bb ? { b: bb, p: [P[P.length - 1][0], P[P.length - 1][1]], lp: bb.getLocalPoint(V(P[P.length - 1][0], P[P.length - 1][1])) } : null;
  [attA, attB].forEach(function (att) {                    // bodies a rope end is hung on (and the bodies pinned together with it) do not collide with that rope
    if (!att || att.kind !== 'stroke') return;
    [att.st].concat(att.also || []).forEach(function (st) { if (!st || this.strokes.indexOf(st) < 0) return; for (var f = st.body.getFixtureList(); f; f = f.getNext()) f.setFilterData({ groupIndex: -ch.gid, categoryBits: 1, maskBits: 0xFFFF }); }, this);
  }, this);
  if (ba) this.world.createJoint(new planck.RevoluteJoint({}, ba, ch.links[0], V(P[0][0], P[0][1])));
  if (bb) this.world.createJoint(new planck.RevoluteJoint({}, bb, ch.links[N2 - 1], V(P[N2][0], P[N2][1])));
  this.capLoad(ba, rec); this.capLoad(bb, rec);
  if (ba && bb && ba !== bb) {                             // both ends hung: the rope can never be longer than its drawn length, however heavy the load (a plain chain of joints stretches)
    var tl = 0; for (var ri = 0; ri < N2; ri++) tl += Math.hypot(P[ri + 1][0] - P[ri][0], P[ri + 1][1] - P[ri][1]);
    this.world.createJoint(new planck.RopeJoint({ maxLength: tl / S, collideConnected: true, localAnchorA: ba.getLocalPoint(V(P[0][0], P[0][1])), localAnchorB: bb.getLocalPoint(V(P[N2][0], P[N2][1])) }, ba, bb));
  }
  this.ropes.push(rec);
  this.pins.forEach(function (p) {                         // pins on an object / rope hinge it with a new rope segment lying on the pin
    if (p.type !== 'hinge' || !p.b0) return;
    var pp = this.pinPos(p), best = -1, bd = 6;
    ch.links.forEach(function (b, k) { var e = this.linkEnds(b), d = distSeg(pp[0], pp[1], e[0], e[1]); if (d < bd) { bd = d; best = k; } }, this);
    if (best < 0) return;
    if ((attA && attA.kind === 'stroke' && p.sts.indexOf(attA.st) >= 0 && best === 0) || (attB && attB.kind === 'stroke' && p.sts.indexOf(attB.st) >= 0 && best === N2 - 1)) return;
    p.joints.push(this.world.createJoint(new planck.RevoluteJoint({}, p.b0, ch.links[best], V(pp[0], pp[1])))); p.lk.push({ rec: rec, k: best });
    this.limitRope(rec, best, p.b0, pp, p);
  }, this);
  this.pins.forEach(function (p) {                         // fixed pegs also catch rope segments lying on them
    if (p.type !== 'peg') return;
    var best = -1, bd = 6;
    ch.links.forEach(function (b, k) { var e = this.linkEnds(b), d = distSeg(p.x, p.y, e[0], e[1]); if (d < bd) { bd = d; best = k; } }, this);
    if (best < 0) return;
    if ((attA && attA.kind === 'peg' && attA.pin === p && best === 0) || (attB && attB.kind === 'peg' && attB.pin === p && best === N2 - 1)) return;
    p.joints.push(this.world.createJoint(new planck.RevoluteJoint({}, p.anchor, ch.links[best], V(p.x, p.y)))); p.lk.push({ rec: rec, k: best });
  }, this);
  return rec;
};
Sim.prototype.addRopePath = function (path, attA, attB) {   // the rope is as long as the drawn path and starts exactly along it
  var pts = [path[0]], cum = [0], total = 0, i;
  for (i = 1; i < path.length; i++) { var d = Math.hypot(path[i][0] - pts[pts.length - 1][0], path[i][1] - pts[pts.length - 1][1]); if (d < 0.5) continue; total += d; pts.push(path[i]); cum.push(total); }
  if (total < 14) return null;
  var sp = rdp(pts, 2), P = [sp[0].slice()];                      // keep the corners of the drawn line, split every edge into pieces <= ROPE_SEG
  for (i = 1; i < sp.length; i++) { var el = Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]), m = Math.max(1, Math.ceil(el / ROPE_SEG)); for (var q = 1; q <= m; q++) P.push([sp[i - 1][0] + (sp[i][0] - sp[i - 1][0]) * q / m, sp[i - 1][1] + (sp[i][1] - sp[i - 1][1]) * q / m]); }
  if (P.length < 3) { var mid = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2]; P.splice(1, 0, mid); }
  return this.addRope(P[0], P[P.length - 1], attA, attB, P);
};
Sim.prototype.cutLink = function (rec, k) {
  if (!rec.links[k]) return false;
  try { this.world.destroyBody(rec.links[k]); } catch (e) {}
  rec.links[k] = null; rec.cut = true; if (rec.level && this.rope === rec) this.rope = null;
  this.pinsPrune();
  return true;
};
Sim.prototype.cutRope = function () {                 // cut the level rope in the middle
  if (!this.rope) return false;
  var rec = this.rope; this.cutLink(rec, Math.floor(rec.links.length / 2)); this.ball.setAwake(true); return true;
};
function segDist2(p, q, a, b) {
  var cr = function (o, u, v) { return (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]); };
  var d1 = cr(a, b, p), d2 = cr(a, b, q), d3 = cr(p, q, a), d4 = cr(p, q, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(distSeg(p[0], p[1], a, b), distSeg(q[0], q[1], a, b), distSeg(a[0], a[1], p, q), distSeg(b[0], b[1], p, q));
}
Sim.prototype.linkEnds = function (b) { var p = b.getPosition(), a = b.getAngle(), hl = b.__hl, c = Math.cos(a) * hl, s = Math.sin(a) * hl; return [[p.x * S - c, p.y * S - s], [p.x * S + c, p.y * S + s]]; };
Sim.prototype.cutAt = function (p, q) {                // swipe p->q: removes the first segment of every rope it crosses; returns the cut ropes
  var hit = [], self = this;
  this.ropes.slice().forEach(function (rec) {
    for (var k = 0; k < rec.links.length; k++) { var b = rec.links[k]; if (!b) continue; var e = self.linkEnds(b); if (segDist2(p, q, e[0], e[1]) <= 5) { self.cutLink(rec, k); hit.push(rec); break; } }
  });
  if (hit.length) this.ball.setAwake(true);
  return hit;
};
Sim.prototype.ropeAt = function (x, y, r) {
  for (var i = this.ropes.length - 1; i >= 0; i--) { var rec = this.ropes[i]; if (rec.level) continue; for (var k = 0; k < rec.links.length; k++) { var b = rec.links[k]; if (!b) continue; var e = this.linkEnds(b); if (distSeg(x, y, e[0], e[1]) <= r) return rec; } }
  return null;
};
Sim.prototype.respawn = function () {
  var b = this.ball, lv = this.lv;
  if (lv.rope) { var lr = this.ropes.filter(function (r) { return r.level; })[0]; if (lr) this.destroyRope(lr); }
  b.setActive(true); this.killed = false; this.portCd = 0;
  this.stars.forEach(function (s) { s.got = false; }); this.next = 0; this.wrong = false; this.events.push('reset');     // a lost ball: every star has to be collected again
  b.setPosition(V(lv.start.x, lv.start.y)); b.setLinearVelocity(Vec2(0, 0)); b.setAngularVelocity(0); b.setAngle(0); b.setAwake(true);
  if (lv.rope) this.makeRope();
};
Sim.prototype.addGeom = function (geom, meta, st0) {
  var world = this.world, x = st0 ? st0.x : geom.ox, y = st0 ? st0.y : geom.oy;
  var body = world.createBody({ type: 'dynamic', position: V(x, y), angle: st0 ? st0.a : 0, angularDamping: 0.05, linearDamping: 0.01 });
  var nfx = 0;
  function add(shape) { try { body.createFixture({ shape: shape, density: 1, friction: 0.7, restitution: 0.05 }); nfx++; } catch (e) {} }
  var loc = geom.loc;
  if (geom.kind === 'poly') {
    geom.polys.forEach(function (pl) { try { add(new planck.Polygon(pl.map(function (p) { return V(p[0], p[1]); }))); } catch (e) {} });
  } else {
    var TH = 3;
    for (var i = 0; i < loc.length; i++) {
      var a = loc[i];
      add(new planck.Circle(V(a[0], a[1]), TH / S));
      if (i + 1 < loc.length) {
        var b = loc[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.5) continue;
        add(new planck.Box(len / 2 / S, TH / S, V((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), Math.atan2(b[1] - a[1], b[0] - a[0])));
      }
    }
    var nl = loc.length;                       // feathered ends: a thin wedge flush with the lower side, so a ball can roll onto a drawn plank
    if (nl >= 2 && Math.hypot(loc[0][0] - loc[nl - 1][0], loc[0][1] - loc[nl - 1][1]) > 1) {
      [[loc[1], loc[0]], [loc[nl - 2], loc[nl - 1]]].forEach(function (pr) {
        var e = pr[1], dx = e[0] - pr[0][0], dy = e[1] - pr[0][1], l = Math.hypot(dx, dy); if (l < 1) return;
        dx /= l; dy /= l; var nx = -dy, ny = dx; if (ny < 0) { nx = -nx; ny = -ny; }
        var wl = Math.min(20, l);
        add(new planck.Polygon([V(e[0] - nx * TH, e[1] - ny * TH), V(e[0] + nx * TH, e[1] + ny * TH), V(e[0] + dx * wl + nx * TH, e[1] + dy * wl + ny * TH)]));
      });
    }
  }
  if (!nfx) { world.destroyBody(body); return null; }
  if (st0) { body.setLinearVelocity(Vec2(st0.vx / S, st0.vy / S)); body.setAngularVelocity(st0.w); }
  var st = { id: meta && meta.id ? meta.id : this.nextId++, body: body, kind: geom.kind, loc: loc, polys: geom.polys, geom: geom, color: meta ? meta.color : null, seed: meta ? meta.seed : 0 };
  if (st.id >= this.nextId) this.nextId = st.id + 1;
  this.strokes.push(st);
  if (this.onStroke) this.onStroke(st);
  this.pins.forEach(function (p) { if (p.type === 'peg' && p.sts.indexOf(st) < 0 && this.hitStroke(st, p.x, p.y, 6)) { p.joints.push(this.world.createJoint(new planck.RevoluteJoint({}, p.anchor, st.body, V(p.x, p.y)))); p.sts.push(st); } }, this);
  this.pins.forEach(function (p) {                         // a pin set on an object / rope waits for the next thing drawn over it and hinges the two
    if (p.type !== 'hinge' || !p.b0 || p.sts.indexOf(st) >= 0) return;
    var pp = this.pinPos(p); if (!this.hitStroke(st, pp[0], pp[1], 6)) return;
    p.joints.push(this.world.createJoint(new planck.RevoluteJoint({}, p.b0, st.body, V(pp[0], pp[1])))); p.sts.push(st);
    p.lk.forEach(function (l) { this.limitRope(l.rec, l.k, st.body, pp, p); }, this);
  }, this);
  if (this.strokes.length > MAXBODIES) { var victim = this.strokes.filter(function (q) { return q !== st && !this.pinned(q); }, this)[0] || this.strokes[0]; this.removeStroke(victim); this.events.push('toomany'); }
  return st;
};
Sim.prototype.addStroke = function (raw, meta) {
  var geom = makeGeom(raw); if (!geom) return null;
  return this.addGeom(geom, meta);
};
/* ---- pins: on a drawn body / rope segment = a free hinge between it and whatever is drawn over that point afterwards (NOT fixed to the world); background = fixed peg
   (hinges every body / rope segment that contains it, now or created later). Rope ends can be attached to pegs / pins (see addRope). ---- */
Sim.prototype.localOf = function (st, x, y) { var p = st.body.getPosition(), a = st.body.getAngle(), c = Math.cos(-a), s = Math.sin(-a), dx = x - p.x * S, dy = y - p.y * S; return [dx * c - dy * s, dy * c + dx * s]; };
Sim.prototype.worldOf = function (st, lx, ly) { var p = st.body.getPosition(), a = st.body.getAngle(), c = Math.cos(a), s = Math.sin(a); return [p.x * S + lx * c - ly * s, p.y * S + lx * s + ly * c]; };
Sim.prototype.hitStroke = function (st, x, y, tol) {
  var l = this.localOf(st, x, y), loc = st.loc, k; if (st.kind !== 'poly') tol = tol || 11;
  if (st.kind === 'poly') { if (inPoly(l[0], l[1], loc)) return true; for (k = 0; k < loc.length; k++) if (distSeg(l[0], l[1], loc[k], loc[(k + 1) % loc.length]) < (tol || 10)) return true; return false; }
  for (k = 0; k + 1 < loc.length; k++) if (distSeg(l[0], l[1], loc[k], loc[k + 1]) < (tol || 10)) return true;
  return false;
};
Sim.prototype.strokesAt = function (x, y, tol) { var r = []; for (var i = 0; i < this.strokes.length; i++) if (this.hitStroke(this.strokes[i], x, y, tol)) r.push(this.strokes[i]); return r; };
Sim.prototype.ropeLinksAt = function (x, y, tol) {      // the nearest segment of every rope within tol
  var res = [], self = this;
  this.ropes.forEach(function (rec) {
    var bk = -1, bd = tol;
    rec.links.forEach(function (b, k) { if (!b) return; var e = self.linkEnds(b), d = distSeg(x, y, e[0], e[1]); if (d <= bd) { bd = d; bk = k; } });
    if (bk >= 0) res.push({ rec: rec, k: bk });
  });
  return res;
};
Sim.prototype.projectRopes = function () {     // rope length is invariant: after each step every joint touching a rope link is pulled shut again (mass-weighted position projection)
  var js = [], j, it, i, MCAP = 1e9;
  for (var l0 = this.ropes.length - 1; l0 >= 0 && MCAP === 1e9; l0--) { var lb = this.ropes[l0].links.filter(Boolean)[0]; if (lb) MCAP = lb.getMass() * 30; }       // heavy loads count as at most 30 rope links so the projection can actually pull them
  for (j = this.world.getJointList(); j; j = j.getNext()) {
    if (j.getType() !== 'revolute-joint') continue;
    var ba = j.getBodyA(), bb = j.getBodyB();
    if (ba.__hl === undefined && bb.__hl === undefined) continue;
    js.push(j);
  }
  for (it = 0; it < 12; it++) for (var ii = 0; ii < js.length; ii++) {
    i = (it & 1) ? js.length - 1 - ii : ii;
    var jt = js[i], A = jt.getBodyA(), B = jt.getBodyB(), pa = jt.getAnchorA(), pb = jt.getAnchorB();
    var dx = pb.x - pa.x, dy = pb.y - pa.y; if (dx * dx + dy * dy < 1e-10) continue;
    var wa = A.isDynamic() ? 1 / Math.min(A.getMass(), MCAP) : 0, wb = B.isDynamic() ? 1 / Math.min(B.getMass(), MCAP) : 0, ws = wa + wb; if (ws === 0) continue;
    if (wa) { var qa = A.getPosition(); A.setPosition(Vec2(qa.x + dx * wa / ws, qa.y + dy * wa / ws)); }
    if (wb) { var qb = B.getPosition(); B.setPosition(Vec2(qb.x - dx * wb / ws, qb.y - dy * wb / ws)); }
  }
  var linkOf = function (body) { for (var q = 0; q < this.ropes.length; q++) { var k = this.ropes[q].links.indexOf(body); if (k >= 0) return { rec: this.ropes[q], k: k }; } return null; }.bind(this);
  var snapChain = function (rec, k0, dx, dy) {       // move link k0 by (dx, dy), then re-attach every link on both sides of it, one after the other
    var b = rec.links[k0], q = b.getPosition(), e, d, n = rec.links.length, j;
    b.setPosition(Vec2(q.x + dx / S, q.y + dy / S));
    for (j = k0 + 1; j < n; j++) { var bj = rec.links[j], bp = rec.links[j - 1]; if (!bj || !bp) break; e = this.linkEnds(bp); var e2 = this.linkEnds(bj); d = [e[1][0] - e2[0][0], e[1][1] - e2[0][1]]; var pj = bj.getPosition(); bj.setPosition(Vec2(pj.x + d[0] / S, pj.y + d[1] / S)); }
    for (j = k0 - 1; j >= 0; j--) { var bk = rec.links[j], bn = rec.links[j + 1]; if (!bk || !bn) break; e = this.linkEnds(bn); var e3 = this.linkEnds(bk); d = [e[0][0] - e3[1][0], e[0][1] - e3[1][1]]; var pk = bk.getPosition(); bk.setPosition(Vec2(pk.x + d[0] / S, pk.y + d[1] / S)); }
  }.bind(this);
  // exact pass: walk each rope from an anchored end and snap every link to the end of the previous one (the chain can then never be longer than the drawn rope);
  // a rope held at both ends is swept back and forth (FABRIK style) until both ends sit on their anchors
  var grp = function (b) { var f = b.getFixtureList(); return f ? f.getFilterGroupIndex() : 0; };
  var pushOut = function (x, y, g, margin, skip, cn) {          // how far (px) a rope sample at (x, y) has to move to get out of solid drawn objects, or null
    var res = null, self = this, wp = Vec2(x / S, y / S), r = (margin + 2) / S;
    this.world.queryAABB(new planck.AABB(Vec2(wp.x - r, wp.y - r), Vec2(wp.x + r, wp.y + r)), function (fx) {
      var B = fx.getBody(); if (fx.isSensor() || B.__hl !== undefined || B === self.ball || (g < 0 && grp(B) === g) || (skip && skip.indexOf(B) >= 0)) return true;
      var sh = fx.getShape(), ty = sh.getType(), lp = B.getLocalPoint(wp), nx = 0, ny = 0, dep = 0;
      if (ty === 'polygon') {
        var best = -1e9, bi = -1; for (var i = 0; i < sh.m_count; i++) { var vv = sh.m_vertices[i], nn = sh.m_normals[i], sd = nn.x * (lp.x - vv.x) + nn.y * (lp.y - vv.y); if (sd > best) { best = sd; bi = i; } }
        if (best < margin / S) {
          nx = sh.m_normals[bi].x; ny = sh.m_normals[bi].y; dep = margin / S - best;
          var side = cn && cn.filter(function (q) { return q.b === B; })[0];       // the side the link really touched this step (the nearest face can be the wrong, far one when it is buried)
          if (side) {
            var dl2 = B.getLocalVector(Vec2(side.x, side.y)), tt = 1e9;
            for (var i2 = 0; i2 < sh.m_count; i2++) { var dn = sh.m_normals[i2].x * dl2.x + sh.m_normals[i2].y * dl2.y; if (dn > 1e-6) { var vv2 = sh.m_vertices[i2], s2 = sh.m_normals[i2].x * (lp.x - vv2.x) + sh.m_normals[i2].y * (lp.y - vv2.y); tt = Math.min(tt, (margin / S - s2) / dn); } }
            if (tt < 1e8 && tt > 0) { var wres = { x: side.x, y: side.y, d: Math.min(tt * S, 40) }; if (!res || wres.d > res.d) res = wres; return true; }
          }
        } else return true;
      } else if (ty === 'circle') {
        var dx = lp.x - sh.m_p.x, dy = lp.y - sh.m_p.y, dl = Math.hypot(dx, dy), rr = sh.m_radius + margin / S;
        if (dl < rr) { if (dl < 1e-9) { nx = 0; ny = -1; } else { nx = dx / dl; ny = dy / dl; } dep = rr - dl; } else return true;
      } else return true;
      var wn = B.getWorldVector(Vec2(nx, ny)); if (!res || dep * S > res.d) res = { x: wn.x, y: wn.y, d: Math.min(dep * S, 40) };
      return true;
    });
    return res;
  }.bind(this);
  var contactsOf = function (b) {                     // touching contacts of a rope link, as directions pointing out of the other body
    var r = null;
    for (var ce = b.getContactList(); ce; ce = ce.next) {
      var c = ce.contact; if (!c.isTouching() || ce.other.__hl !== undefined || ce.other === this.ball) continue;
      var wm = c.getWorldManifold(null); if (!wm) continue; var sg = c.getFixtureA().getBody() === b ? -1 : 1;
      (r = r || []).push({ b: ce.other, x: wm.normal.x * sg, y: wm.normal.y * sg });
    }
    return r;
  }.bind(this);
  var sweep = function (rec, lead) {                // FABRIK step: every link keeps its length, is pulled onto the previous joint and turns towards where its other end used to be
    var n = rec.links.length, end = lead === 0 ? rec.endA : rec.endB, w = end.b.getWorldPoint(end.lp), tx = w.x * S, ty = w.y * S, k, b, e;
    for (var s = 0; s < n; s++) {
      k = lead === 0 ? s : n - 1 - s; b = rec.links[k]; if (!b) break;
      e = this.linkEnds(b); var old = lead === 0 ? e[1] : e[0], len = b.__hl * 2, dx = old[0] - tx, dy = old[1] - ty, dl = Math.hypot(dx, dy);
      if (dl < 1e-6) { var ag = b.getAngle(); dx = Math.cos(ag) * (lead === 0 ? 1 : -1); dy = Math.sin(ag) * (lead === 0 ? 1 : -1); dl = 1; }
      var ux = dx / dl, uy = dy / dl, fx = tx + ux * len, fy = ty + uy * len;       // far end of this link
      var gp = grp(b), cn = contactsOf(b), po = pushOut(fx, fy, gp, 3, rec.hung, cn), pm = pushOut((tx + fx) / 2, (ty + fy) / 2, gp, 3, rec.hung, cn);       // the link must not end up inside an object: bend it around instead
      if (po || pm) {
        var px2 = fx + (po ? po.x * po.d : 0) + (pm ? pm.x * pm.d * 2 : 0), py2 = fy + (po ? po.y * po.d : 0) + (pm ? pm.y * pm.d * 2 : 0), pl = Math.hypot(px2 - tx, py2 - ty) || 1;
        ux = (px2 - tx) / pl; uy = (py2 - ty) / pl; fx = tx + ux * len; fy = ty + uy * len;
      }
      if (b.isDynamic()) {
        var a0 = lead === 0 ? [tx, ty] : [fx, fy], a1 = lead === 0 ? [fx, fy] : [tx, ty];
        b.setTransform(Vec2((a0[0] + a1[0]) / 2 / S, (a0[1] + a1[1]) / 2 / S), Math.atan2(a1[1] - a0[1], a1[0] - a0[0]));
      }
      tx = fx; ty = fy;
    }
  }.bind(this);
  this.ropes.forEach(function (rec) {
    if (rec.level) return;
    rec.hung = [];                                    // bodies jointed to this rope (hung on it, pinned to it) are not obstacles for it
    rec.links.forEach(function (lb) { if (!lb) return; for (var je = lb.getJointList(); je; je = je.next) if (je.other.__hl === undefined && rec.hung.indexOf(je.other) < 0) rec.hung.push(je.other); });
    if (rec.endA && rec.endB) { for (var fi = 0; fi < 14; fi++) { sweep(rec, 1); sweep(rec, 0); } }
    else if (rec.endA) sweep(rec, 0);
    else if (rec.endB) sweep(rec, 1);
  }, this);
  this.pins.forEach(function (p) {                  // pegs (fixed to the world) that hold a rope link, e.g. a rope laid over a peg: the pegged link stays put and the chain follows
    if (p.type !== 'peg' || !p.anchor) return;
    p.joints.forEach(function (jt) {
      var B = jt.getBodyB(); if (B.__hl === undefined) return; var lo = linkOf(B); if (!lo) return;
      var pa = jt.getAnchorA(), pb = jt.getAnchorB(), dx = (pa.x - pb.x) * S, dy = (pa.y - pb.y) * S;
      if (dx * dx + dy * dy > 1e-8) snapChain(lo.rec, lo.k, dx, dy);
    });
  }, this);
  this.pins.forEach(function (p) {                  // a pin fixed to the world (a pulley's axle) must not give way under the rope's pull
    if (p.type !== 'peg' || !p.anchor) return;
    p.joints.forEach(function (jt) {
      var B = jt.getBodyB(); if (B.__hl !== undefined || !B.isDynamic()) return;
      var pa = jt.getAnchorA(), pb = jt.getAnchorB(), dx = pa.x - pb.x, dy = pa.y - pb.y;
      if (dx * dx + dy * dy > 1e-10) { var q = B.getPosition(); B.setPosition(Vec2(q.x + dx, q.y + dy)); }
    });
  }, this);
  for (var jx = this.world.getJointList(); jx; jx = jx.getNext()) {       // last: whatever is hinged to a rope link (a heavy crate on the rope) follows the rope
    if (jx.getType() !== 'revolute-joint') continue;
    var JA = jx.getBodyA(), JB = jx.getBodyB(), la = JA.__hl !== undefined, lb = JB.__hl !== undefined; if (la === lb) continue;
    var ob = la ? JB : JA; if (!ob.isDynamic()) continue;
    var ja = jx.getAnchorA(), jb = jx.getAnchorB(), sx = la ? ja.x - jb.x : jb.x - ja.x, sy = la ? ja.y - jb.y : jb.y - ja.y;
    if (sx * sx + sy * sy > 1e-10) { var op = ob.getPosition(); ob.setPosition(Vec2(op.x + sx, op.y + sy)); }
  }
};
Sim.prototype.capLoad = function (body, rec) {      // a body hung on a rope counts as at most 40 rope links: huge mass ratios make a chain of joints stretch
  return;      // (disabled: capping the mass of hung bodies destroys mass ratios, which pulley / scale puzzles depend on)
  if (!body || !body.isDynamic() || body.__hl !== undefined || body.__capped) return;
  var lb = rec && rec.links.filter(Boolean)[0]; if (!lb) return;
  var cap = lb.getMass() * 40, m = body.getMass(); if (m <= cap) return;
  var md = { mass: cap, center: body.getLocalCenter(), I: body.getInertia() * cap / m }; body.setMassData(md); body.__capped = true;
};
Sim.prototype.limitRope = function (rec, k, body, pt, pin) {
  this.capLoad(body, rec);   // a body hinged to link k of a rope that is hung at an end: it can never be farther from that end than the rope up to link k is long
  if (!rec || !rec.links || !body || rec.links.indexOf(body) >= 0) return;
  [['endA', 0], ['endB', 1]].forEach(function (e) {
    var end = rec[e[0]]; if (!end || !end.b || end.b === body) return;
    var len = 0, ok = true, i, n = rec.links.length;
    if (e[1] === 0) { for (i = 0; i <= k; i++) { if (!rec.links[i]) { ok = false; break; } len += rec.links[i].__hl * 2; } }
    else { for (i = k; i < n; i++) { if (!rec.links[i]) { ok = false; break; } len += rec.links[i].__hl * 2; } }
    if (!ok) return;
    var j = this.world.createJoint(new planck.RopeJoint({ maxLength: len / S, collideConnected: true, localAnchorA: end.b.getLocalPoint(V(end.p[0], end.p[1])), localAnchorB: body.getLocalPoint(V(pt[0], pt[1])) }, end.b, body));
    if (pin) pin.joints.push(j);
  }, this);
};
Sim.prototype.pinBodies = function (p) { var r = []; p.sts.forEach(function (st) { r.push(st.body); }); p.lk.forEach(function (l) { var b = l.rec.links[l.k]; if (b) r.push(b); }); return r; };
Sim.prototype.pinPos = function (p) {
  if (p.type === 'hinge' && p.b0) { var b = p.b0, q = b.getPosition(), a = b.getAngle(), c = Math.cos(a), s = Math.sin(a); return [q.x * S + p.lx * c - p.ly * s, q.y * S + p.lx * s + p.ly * c]; }
  return [p.x, p.y];
};
Sim.prototype._mkPin = function (type, x, y, sts, lks) {
  var world = this.world, pin = { type: type, x: x, y: y, sts: sts.slice(), lk: (lks || []).slice(), anchor: null, joints: [], lx: 0, ly: 0, b0: null }, bodies = this.pinBodies(pin), i;
  if (type === 'hinge') {
    var b0 = bodies[0], q = b0.getPosition(), a = b0.getAngle(), c = Math.cos(-a), s = Math.sin(-a), dx = x - q.x * S, dy = y - q.y * S;
    pin.b0 = b0; pin.lx = dx * c - dy * s; pin.ly = dy * c + dx * s;
    for (i = 1; i < bodies.length; i++) pin.joints.push(world.createJoint(new planck.RevoluteJoint({}, b0, bodies[i], V(x, y))));
  } else {
    pin.anchor = world.createBody({ type: 'static', position: V(x, y) });
    bodies.forEach(function (b) { pin.joints.push(world.createJoint(new planck.RevoluteJoint({}, pin.anchor, b, V(x, y)))); });
  }
  if (pin.lk.length) { var self = this; pin.lk.forEach(function (l) { pin.sts.forEach(function (st) { self.limitRope(l.rec, l.k, st.body, [x, y], pin); }); }); }
  bodies.forEach(function (b) { b.setAwake(true); });
  this.pins.push(pin); return pin;
};
Sim.prototype.addPinAt = function (x, y) {
  if (this.pins.length >= 40) return null;
  var hits = this.strokesAt(x, y), lks = this.ropeLinksAt(x, y, 10), n = hits.length + lks.length, px = x, py = y;
  if (!hits.length && lks.length === 1) { var e = this.linkEnds(lks[0].rec.links[lks[0].k]), dx = e[1][0] - e[0][0], dy = e[1][1] - e[0][1], l2 = dx * dx + dy * dy, t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - e[0][0]) * dx + (y - e[0][1]) * dy) / l2)); px = e[0][0] + dx * t; py = e[0][1] + dy * t; }
  if (n >= 1) return this._mkPin('hinge', px, py, hits, lks);        // on an object / rope: hinges it with what is drawn over it next (not fixed to the background)
  return this._mkPin('peg', x, y, [], []);
};
Sim.prototype.removePin = function (pin) {
  var i = this.pins.indexOf(pin); if (i < 0) return false;
  this.pins.splice(i, 1);
  pin.joints.forEach(function (j) { try { this.world.destroyJoint(j); } catch (e) {} }, this);
  if (pin.anchor) try { this.world.destroyBody(pin.anchor); } catch (e) {}
  this.pinBodies(pin).forEach(function (b) { b.setAwake(true); });
  return true;
};
Sim.prototype.pinsPrune = function () {               // drop references to dead bodies; remove pins that cannot hold anything any more
  var self = this;
  this.pins.slice().forEach(function (p) {
    p.sts = p.sts.filter(function (st) { return self.strokes.indexOf(st) >= 0; });
    p.lk = p.lk.filter(function (l) { return self.ropes.indexOf(l.rec) >= 0 && l.rec.links[l.k]; });
    var nb = self.pinBodies(p);
    if (p.type === 'fix' && nb.length < 1) self.removePin(p);
    else if (p.type === 'hinge' && (nb.length < 1 || nb.indexOf(p.b0) < 0)) self.removePin(p);
  });
};
Sim.prototype.pinned = function (st) { return this.pins.some(function (p) { return p.sts.indexOf(st) >= 0; }) || this.ropes.some(function (r) { return (r.attA && r.attA.st === st) || (r.attB && r.attB.st === st); }); };
Sim.prototype.removeStroke = function (st) {
  var i = this.strokes.indexOf(st); if (i < 0) return false;
  this.strokes.splice(i, 1);
  this.pinsPrune();
  try { this.world.destroyBody(st.body); } catch (e) {} return true;
};
Sim.prototype.applyJets = function () {
  var jets = this.lv.jets, self = this;
  function push(body, k) {
    var p = body.getPosition(), x = p.x * S, y = p.y * S;
    for (var i = 0; i < jets.length; i++) { var j = jets[i]; if (x > j.x0 && x < j.x1 && y > j.y0 && y < j.y1) { body.applyForceToCenter(Vec2(0, -body.getMass() * 10 * k), true); return; } }
  }
  push(this.ball, 1.1);
  for (var i = 0; i < this.strokes.length; i++) push(this.strokes[i].body, 1.5);
};
Sim.prototype.placeMovers = function () {         // movers follow a closed-form path of the sim clock, so snapshots / replays stay exact
  var t = this.simT / 60;
  this.movers.forEach(function (o) {
    var m = o.m, s = Math.sin(m.w * t + m.ph), c = Math.cos(m.w * t + m.ph);
    o.body.setPosition(V(m.cx + m.ax * s, m.cy + m.ay * s)); o.body.setLinearVelocity(Vec2(m.ax * m.w * c / S, m.ay * m.w * c / S));
  });
};
Sim.prototype.kill = function () { if (this.killed) return; this.killed = true; this.events.push('ouch'); this.ball.setLinearVelocity(Vec2(0, 0)); this.ball.setActive(false); };
Sim.prototype.step = function () {
  if (this.movers.length) this.placeMovers();
  if (this.lv.jets.length) this.applyJets();
  if (this.lv.boosts.length && !this.killed) {
    var bp0 = this.ball.getPosition(), m0 = this.ball.getMass();
    for (var bi = 0; bi < this.lv.boosts.length; bi++) { var bz = this.lv.boosts[bi], px = bp0.x * S, py = bp0.y * S; if (px > bz.x0 && px < bz.x1 && py > bz.y0 && py < bz.y1) this.ball.applyForceToCenter(Vec2(m0 * bz.ax, m0 * bz.ay), true); }
  }
  if (this.ropeSegCount() > 0) { var nsub = RSUB; for (var si = 0; si < nsub; si++) this.world.step(1 / 60 / nsub, RVEL, RPOS); }       // drawn ropes: sub-steps + more solver iterations keep the chain from stretching under a heavy load
  else this.world.step(1 / 60, 8, 3);
  if (this.ropeSegCount() > 0) this.projectRopes();
  this.simT++;
  var p = this.ball.getPosition(); this.bx = p.x * S; this.by = p.y * S;
  var bv = this.ball.getLinearVelocity(), bsp = Math.hypot(bv.x, bv.y);
  if (bsp > 14) this.ball.setLinearVelocity(Vec2(bv.x * 14 / bsp, bv.y * 14 / bsp));
  if (!this.killed) for (var si = 0; si < this.lv.spikes.length; si++) { var sk = this.lv.spikes[si]; if (this.bx > sk.x0 - 4 && this.bx < sk.x1 + 4 && this.by + BALL_R > sk.top + 2) { this.killed = true; this.events.push('ouch'); this.ball.setLinearVelocity(Vec2(0, 0)); this.ball.setActive(false); } }
  if (!this.killed) {                                    // deadly: spinning blades and patrolling spike blocks
    for (var ri = 0; ri < this.rotors.length; ri++) {
      var ro = this.rotors[ri]; if (!ro.r.deadly) continue;
      var ra = ro.body.getAngle(), rx = Math.cos(ra) * ro.r.r, ry = Math.sin(ra) * ro.r.r;
      if (distSeg(this.bx, this.by, [ro.r.cx - rx, ro.r.cy - ry], [ro.r.cx + rx, ro.r.cy + ry]) < BALL_R + 5) { this.kill(); break; }
    }
    for (var mi2 = 0; mi2 < this.movers.length && !this.killed; mi2++) {
      var mo = this.movers[mi2]; if (!mo.m.deadly) continue;
      var mp = mo.body.getPosition(), ddx = Math.max(Math.abs(this.bx - mp.x * S) - mo.m.hw, 0), ddy = Math.max(Math.abs(this.by - mp.y * S) - mo.m.hh, 0);
      if (Math.hypot(ddx, ddy) < BALL_R + 1) this.kill();
    }
  }
  for (var ji = 0; ji < this.springs.length; ji++) {            // spring blocks throw the ball up
    var sp = this.springs[ji], ss = sp.s; if (sp.cd > 0) { sp.cd--; continue; }
    if (!this.killed && Math.abs(this.bx - ss.cx) < ss.hw + BALL_R * 0.5 && this.by + BALL_R > ss.cy - ss.hh - 4 && this.by < ss.cy - ss.hh + 6) {
      var sv = this.ball.getLinearVelocity(); if (sv.y > -2) { this.ball.setLinearVelocity(Vec2(sv.x, -ss.v)); sp.cd = 12; this.events.push('boing'); }
    }
  }
  if (this.portCd > 0) this.portCd--;
  else if (this.lv.portals.length && !this.killed) {
    for (var pi = 0; pi < this.lv.portals.length && !this.portCd; pi++) {
      var pr = this.lv.portals[pi];
      for (var kk = 0; kk < 2; kk++) {
        var e = kk ? pr.b : pr.a, o = kk ? pr.a : pr.b;
        if (Math.hypot(this.bx - e.x, this.by - e.y) < 22) {
          var vv = this.ball.getLinearVelocity(), spd = Math.hypot(vv.x, vv.y), dyy = this.by - e.y;
          this.ball.setPosition(V(o.x + o.nx * 30, o.y + dyy)); this.ball.setLinearVelocity(Vec2(o.nx * spd, o.ny * spd)); this.ball.setAwake(true);
          this.portCd = 18; this.events.push('port'); this.lastPort = { from: e, to: o, t: this.simT, ci: pr.ci };
          var np2 = this.ball.getPosition(); this.bx = np2.x * S; this.by = np2.y * S; break;
        }
      }
    }
  }
  var order = this.lv.order;
  for (var i = 0; i < this.stars.length; i++) {
    var s = this.stars[i];
    if (!s.got && Math.hypot(this.bx - s.x, this.by - s.y) < BALL_R + STAR_R) {
      if (order[this.next] === i) { s.got = true; this.next++; this.events.push('star'); }
      else if (!this.wrong) { this.wrong = true; this.events.push('wrong'); }
    }
  }
  if (this.next >= order.length) this.won = true;
  for (var k = this.strokes.length - 1; k >= 0; k--) { var sp = this.strokes[k].body.getPosition(); if (sp.y * S > H + 500 || sp.x * S < -400 || sp.x * S > W + 400) this.removeStroke(this.strokes[k]); }
};
Sim.prototype.dead = function () { return this.killed || this.by > H + 60 || this.by < -1500; };
function bstate(b) { var p = b.getPosition(), v = b.getLinearVelocity(); return { x: p.x * S, y: p.y * S, a: b.getAngle(), vx: v.x * S, vy: v.y * S, w: b.getAngularVelocity() }; }
function bset(b, s) { b.setPosition(V(s.x, s.y)); b.setAngle(s.a); b.setLinearVelocity(Vec2(s.vx / S, s.vy / S)); b.setAngularVelocity(s.w); b.setAwake(true); }
Sim.prototype.snapshot = function () {
  var self = this;
  var sa = function (a) { if (!a) return null; return { kind: a.kind, also: (a.also || []).map(function (q) { return q.id; }), sid: a.st ? a.st.id : 0, lx: a.lx, ly: a.ly, px: a.pin ? a.pin.x : 0, py: a.pin ? a.pin.y : 0 }; };
  return { next: this.next, simT: this.simT, ball: bstate(this.ball), rope: !!this.rope, won: this.won, portCd: this.portCd,
    ropes: this.ropes.map(function (r) { return { level: r.level, cut: r.cut, spec: r.level ? null : { P: r.spec.P, attA: sa(r.attA), attB: sa(r.attB) }, links: r.links.map(function (b) { return b ? bstate(b) : null; }) }; }),
    got: this.stars.map(function (s) { return s.got; }),
    props: this.props.map(function (p) { return bstate(p.body); }),
    rot: this.rotors.map(function (r) { return r.body.getAngle(); }), killed: this.killed,
    pins: this.pins.map(function (p) { return { type: p.type, x: p.x, y: p.y, sids: p.sts.map(function (q) { return q.id; }), lks: p.lk.map(function (l) { return { ri: self.ropes.indexOf(l.rec), k: l.k }; }) }; }),
    strokes: this.strokes.map(function (st) { var o = bstate(st.body); o.geom = st.geom; o.id = st.id; o.color = st.color; o.seed = st.seed; return o; }) };
};
Sim.prototype.restore = function (snap) {
  var self = this;
  bset(this.ball, snap.ball);
  this.props.forEach(function (p, i) { if (snap.props[i]) bset(p.body, snap.props[i]); });
  (snap.pins || []).forEach(function (pp) { if (pp.type === 'peg') self._mkPin('peg', pp.x, pp.y, [], []); });
  snap.strokes.forEach(function (s) { self.addGeom(s.geom, { id: s.id, color: s.color, seed: s.seed }, s); });
  this.portCd = snap.portCd || 0;
  (snap.ropes || []).forEach(function (rs) {
    var rec;
    if (rs.level) { rec = self.ropes.filter(function (r) { return r.level; })[0]; if (!rec) return; if (rs.cut) { rec.cut = true; self.rope = null; } }
    else {
      var mk = function (a) {
        if (!a) return null; if (a.kind === 'static') return { kind: 'static' };
        if (a.kind === 'peg') { var pg = self.pins.filter(function (p) { return p.type !== 'hinge' && Math.hypot(p.x - a.px, p.y - a.py) < 1.5; })[0]; return pg ? { kind: 'peg', pin: pg } : null; }
        var st = self.strokes.filter(function (q) { return q.id === a.sid; })[0]; var also = (a.also || []).map(function (id) { return self.strokes.filter(function (q) { return q.id === id; })[0]; }).filter(Boolean); return st ? { kind: 'stroke', st: st, lx: a.lx, ly: a.ly, also: also } : null;
      };
      rec = self.addRope(null, null, mk(rs.spec.attA), mk(rs.spec.attB), rs.spec.P); if (!rec) return;
    }
    rs.links.forEach(function (ls, k) { if (!rec.links[k]) return; if (ls) bset(rec.links[k], ls); else { try { self.world.destroyBody(rec.links[k]); } catch (e) {} rec.links[k] = null; rec.cut = true; } });
  });
  (snap.pins || []).forEach(function (pp) {
    if (pp.type === 'peg') return;
    var sts = pp.sids.map(function (id) { return self.strokes.filter(function (q) { return q.id === id; })[0]; }).filter(Boolean);
    var lks = (pp.lks || []).map(function (l) { var rec = self.ropes[l.ri]; return rec && rec.links[l.k] ? { rec: rec, k: l.k } : null; }).filter(Boolean);
    var n = sts.length + lks.length;
    if (pp.type === 'hinge' ? n >= 1 : n === 1) self._mkPin(pp.type, pp.x, pp.y, sts, lks);
  });
  if (!snap.rope && this.rope) this.rope = null;
  this.stars.forEach(function (s, i) { s.got = !!snap.got[i]; });
  (snap.rot || []).forEach(function (a, i) { if (self.rotors[i]) self.rotors[i].body.setAngle(a); });
  this.next = snap.next || 0; this.simT = snap.simT; if (this.movers.length) this.placeMovers(); var p = this.ball.getPosition(); this.bx = p.x * S; this.by = p.y * S;
  this.events = [];
};

window.DP = { STROKE_MAX: STROKE_MAX, W: W, H: H, S: S, BALL_R: BALL_R, STAR_R: STAR_R, MAXBODIES: MAXBODIES, genLevel: genLevel, Sim: Sim, makeGeom: makeGeom, pathLen: pathLen, mulberry32: mulberry32, hash2: hash2, V: V,
  distSeg: distSeg, inPoly: inPoly, decompose: decompose, area2: area2, rdp: rdp };
})();
