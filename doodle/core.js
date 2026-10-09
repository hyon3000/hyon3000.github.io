/* 2D Physics / 2D 피직스 - core: procedural level generator, physics simulation wrapper (planck.js = Box2D port), stroke geometry.
   Used by the page (game.js) and by the auto-solver planner (planner.js) that simulates copies of the world. */
(function () {
'use strict';
var W = 1200, H = 800, S = 30;           // world size (px), px per metre
var BALL_R = 14, STAR_R = 16, MAXBODIES = 60;
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
function genLevel(seed, L) {
  var rnd = mulberry32(hash2(seed, L * 7919 + 13));
  var rr = function (a, b) { return a + (b - a) * rnd(); };
  var hmax = Math.min(150, 40 + L * 7.5);
  var wmax = Math.min(340, 130 + L * 14);
  var nf = Math.min(1 + Math.floor((L - 1) / 3), 4);
  var D = Math.min(460, Math.round(3.0 * hmax + 110));
  var Y1 = r12(rr(600, 640));
  var Ys = Y1 - D;
  var dl = r12(180 + 0.4 * D);
  var xD = 216 + dl;                       // end of the descent
  var xF = 1032;                           // final platform starts here
  var finalStep = L >= 3 && rnd() < 0.4;
  var wantRope = L >= 2 && rnd() < Math.min(0.5, 0.2 + 0.03 * L);
  var pickType = function () {
    var wts = [['pit', 3], ['wall', 3]]; if (L >= 3) wts.push(['crates', 1.2], ['dominoes', 1.2]);
    var t = 0; wts.forEach(function (w) { t += w[1]; });
    var r = rnd() * t; for (var q = 0; q < wts.length; q++) { r -= wts[q][1]; if (r < 0) return wts[q][0]; }
    return 'pit';
  };
  var order = [], i;
  for (i = 0; i < nf; i++) order.push(pickType());
  if (L <= 2) order = [rnd() < 0.5 ? 'pit' : 'wall'];
  var heavy = wantRope || order.indexOf('dominoes') >= 0 || order.indexOf('crates') >= 0, hscale = heavy ? 0.7 : 1;
  var mk = function (t) {
    if (t === 'pit') {
      var vr = rnd(), variant = 'plain';
      if (L >= 2) { if (vr < 0.18) variant = 'jet'; else if (vr < 0.36) variant = 'bounce'; else if (L >= 3 && vr < 0.62) variant = 'seesaw'; }
      var w;
      if (variant === 'seesaw') w = r12(rr(150, Math.min(264, wmax + 40)));
      else if (variant === 'jet') w = r12(rr(150, 372));
      else w = r12(rr(Math.max(110, 0.7 * wmax), wmax));
      return { type: 'pit', variant: variant, w: w, lead: 36, need: 36 + w + 48 };
    }
    if (t === 'crates') return { type: 'crates', rows: L >= 8 ? 3 : 2, lead: 48, w: 56, need: 48 + 56 + 72 };
    if (t === 'dominoes') { var n = 4 + Math.min(3, Math.floor(L / 5)); return { type: 'dominoes', n: n, lead: 48, w: n * 36, need: 48 + n * 36 + 72 }; }
    var h = Math.max(40, Math.round(rr(0.55, 1) * hmax * hscale));
    var lead = r12(1.25 * h + 36), ww = 48;
    return { type: 'wall', h: h, ww: ww, lead: lead, need: lead + ww + 60 };
  };
  var list = order.map(mk);
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
    if (f.type === 'pit') {
      var x0 = r12(base + f.lead), x1 = x0 + f.w;
      features.push({ type: 'pit', variant: f.variant, x0: x0, x1: x1, y: Y1 });
      if (f.variant === 'bounce') boxes.push({ cx: (x0 + x1) / 2, cy: Y1 + 119, hw: (x1 - x0) / 2, hh: 7, a: 0, kind: 'bounce', rest: 1.0, fric: 0.3 });
      if (f.variant === 'jet') jets.push({ x0: x0, x1: x1, y0: Y1 - 60, y1: Y1 + 130 });
      if (f.variant === 'seesaw') seesaws.push({ cx: (x0 + x1) / 2, cy: Y1 + 5, hw: (x1 - x0) / 2 - 2, hh: 5 });
      cursor = x1 + 48;
    } else if (f.type === 'crates') {
      var cx0 = r12(base + f.lead);
      for (var cc = 0; cc < 2; cc++) for (var rw = 0; rw < f.rows; rw++) dyn.push({ kind: 'crate', cx: cx0 + 14 + cc * 28, cy: Y1 - 14 - rw * 28 - 0.5, hw: 13.5, hh: 13.5, density: 0.06 });
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
      features.push({ type: 'wall', x0: xw2, x1: xw2 + f.ww, top: Y1 - f.h, y: Y1, h: f.h });
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
  // ----- stars
  var stars = [];
  var last = features.length ? features[features.length - 1] : null;
  if (last && last.end) stars.push({ x: W - 70, y: last.top - 18 }); else stars.push({ x: W - 70, y: Y1 - 18 });
  var extra = 0;
  if (L >= 8) { extra = 1 + (rnd() < 0.6 ? 1 : 0) + (L >= 12 && rnd() < 0.5 ? 1 : 0); }   // ordered levels: 2-4 stars
  var cands = [];
  features.forEach(function (f) {
    if (f.type === 'wall' && !f.end) cands.push({ x: (f.x0 + f.x1) / 2, y: f.top - 18 });
    else if (f.type === 'pit') { cands.push({ x: f.x1 + 40, y: Y1 - 18 }); if (f.variant === 'plain' || f.variant === 'bounce') cands.push({ x: (f.x0 + f.x1) / 2, y: Y1 - 34 }); }
  });
  while (cands.length < extra) cands.push({ x: r12(rr(xD + 24, xF - 60)), y: Y1 - 18 });
  for (i = cands.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var tmp = cands[i]; cands[i] = cands[j]; cands[j] = tmp; }
  for (i = 0, j = 0; j < extra && i < cands.length; i++) { var okc = true; stars.forEach(function (st0) { if (Math.hypot(st0.x - cands[i].x, st0.y - cands[i].y) < 80) okc = false; }); if (okc && cands[i].x > xD + 20) { stars.push({ x: cands[i].x, y: cands[i].y }); j++; } }
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
  // ----- floating decorative slabs (kept clear of every corridor)
  var topY = function (xx) { var t = gy(xx); features.forEach(function (f) { if (f.type === 'wall' && xx >= f.x0 && xx <= f.x1) t = Math.min(t, f.top); }); return t; };
  var nd = L >= 2 ? Math.min(4, 1 + Math.floor(L / 3)) : 0, tries = 0, slabs = 0;
  while (slabs < nd && tries++ < 60) {
    var len2 = rr(90, 200), ang2 = rr(-0.45, 0.45), cx = rr(160, W - 160), cy = rr(70, 420);
    var hw = len2 / 2, hh = 9, ok = true, c = Math.cos(ang2), s = Math.sin(ang2);
    var ext = Math.abs(hw * s) + hh * Math.abs(c), exx = Math.abs(hw * c) + hh * Math.abs(s);
    if (cy + ext > Y1 - 150) ok = false;
    for (var q2 = -exx; ok && q2 <= exx; q2 += 12) if (cy + ext > topY(Math.max(0, Math.min(W, cx + q2))) - 170) ok = false;
    if (Math.hypot(cx - start.x, cy - start.y) < 170 + len2 / 2) ok = false;
    if (rope && Math.hypot(cx - rope.ax, cy - rope.ay) < 230 + len2 / 2) ok = false;
    stars.forEach(function (st) { if (Math.hypot(cx - st.x, cy - st.y) < 120 + len2 / 2) ok = false; });
    boxes.forEach(function (b) { if (Math.abs(cx - b.cx) < hw + b.hw + 30 && Math.abs(cy - b.cy) < ext + b.hh + 50) ok = false; });
    jets.forEach(function (jt) { if (cx + exx > jt.x0 - 20 && cx - exx < jt.x1 + 20 && cy + ext > Y1 - 260) ok = false; });
    if (ok) { boxes.push({ cx: cx, cy: cy, hw: hw, hh: hh, a: ang2, kind: 'slab' }); slabs++; }
  }
  var lv = { seed: seed, L: L, Ys: Ys, Y1: Y1, D: D, xD: xD, chains: chains, boxes: boxes, dyn: dyn, seesaws: seesaws, jets: jets, rope: rope, stars: stars, order: order, features: features,
    start: start, gy: gy, ice: iceOn ? [iceX0, iceX1] : null };
  var hh2 = 0; var acc = function (v) { hh2 = hash2(hh2, Math.round(v * 10)); };
  chains.forEach(function (ch) { ch.pts.forEach(function (p2) { acc(p2[0]); acc(p2[1]); }); acc(ch.mat === 'ice' ? 1 : 0); });
  boxes.forEach(function (b) { acc(b.cx); acc(b.cy); acc(b.hw); acc(b.hh); acc(b.a * 100); });
  dyn.forEach(function (b) { acc(b.cx); acc(b.cy); });
  seesaws.forEach(function (b) { acc(b.cx); acc(b.hw); });
  jets.forEach(function (b) { acc(b.x0); acc(b.x1); });
  if (rope) { acc(rope.ax); acc(rope.ay); acc(rope.len); }
  stars.forEach(function (s2) { acc(s2.x); acc(s2.y); });
  lv.checksum = hh2;
  lv.modules = [];
  features.forEach(function (f) { var m = f.type === 'pit' ? 'pit-' + f.variant : f.type; if (lv.modules.indexOf(m) < 0) lv.modules.push(m); });
  if (rope) lv.modules.push('rope'); if (iceOn) lv.modules.push('ice'); if (stars.length > 1) lv.modules.push('multistar');
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
  var g = world.createBody({ type: 'static', position: Vec2(0, 0) });
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
  this.ball = world.createBody({ type: 'dynamic', position: V(lv.start.x, lv.start.y), bullet: true, angularDamping: 0.02 });
  this.ball.createFixture({ shape: new planck.Circle(BALL_R / S), density: 1.5, friction: 0.6, restitution: 0.05 });
  this.stars = lv.stars.map(function (s) { return { x: s.x, y: s.y, got: false, n: s.n || 1 }; }); this.next = 0; this.wrong = false;
  this.strokes = []; this.pins = []; this.nextId = 1; this.simT = 0; this.won = false; this.rope = null; this.bx = lv.start.x; this.by = lv.start.y; this.onStroke = null; this.events = [];
  if (lv.rope) this.makeRope();
  if (snap) this.restore(snap);
}
Sim.prototype.makeRope = function () {
  var r = this.lv.rope, anchor = this.world.createBody({ type: 'static', position: V(r.ax, r.ay) });
  var joint = this.world.createJoint(new planck.DistanceJoint({ frequencyHz: 0, dampingRatio: 0, length: r.len / S }, anchor, V(r.ax, r.ay), this.ball, this.ball.getPosition()));
  this.rope = { joint: joint, anchor: anchor, ax: r.ax, ay: r.ay };
};
Sim.prototype.cutRope = function () {
  if (!this.rope) return false;
  try { this.world.destroyJoint(this.rope.joint); } catch (e) {}
  this.rope = null; this.ball.setAwake(true); return true;
};
Sim.prototype.respawn = function () {
  var b = this.ball, lv = this.lv;
  if (this.rope) this.cutRope();
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
  if (this.strokes.length > MAXBODIES) { this.removeStroke(this.strokes[0]); this.events.push('toomany'); }
  return st;
};
Sim.prototype.addStroke = function (raw, meta) {
  var geom = makeGeom(raw); if (!geom) return null;
  return this.addGeom(geom, meta);
};
Sim.prototype.addPin = function (st, wx, wy) {
  if (this.strokes.indexOf(st) < 0 || this.pins.length >= 40) return null;
  var anchor = this.world.createBody({ type: 'static', position: V(wx, wy) });
  var joint = this.world.createJoint(new planck.RevoluteJoint({}, anchor, st.body, V(wx, wy)));
  st.body.setAwake(true);
  var pin = { st: st, x: wx, y: wy, anchor: anchor, joint: joint };
  this.pins.push(pin); return pin;
};
Sim.prototype.removePin = function (pin) {
  var i = this.pins.indexOf(pin); if (i < 0) return false;
  this.pins.splice(i, 1); try { this.world.destroyBody(pin.anchor); } catch (e) {}
  pin.st.body.setAwake(true); return true;
};
Sim.prototype.removeStroke = function (st) {
  var i = this.strokes.indexOf(st); if (i < 0) return false;
  this.pins.filter(function (p) { return p.st === st; }).forEach(this.removePin, this);
  this.strokes.splice(i, 1); try { this.world.destroyBody(st.body); } catch (e) {} return true;
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
Sim.prototype.step = function () {
  if (this.lv.jets.length) this.applyJets();
  this.world.step(1 / 60, 8, 3);
  this.simT++;
  var p = this.ball.getPosition(); this.bx = p.x * S; this.by = p.y * S;
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
Sim.prototype.dead = function () { return this.by > H + 60 || this.by < -1500; };
function bstate(b) { var p = b.getPosition(), v = b.getLinearVelocity(); return { x: p.x * S, y: p.y * S, a: b.getAngle(), vx: v.x * S, vy: v.y * S, w: b.getAngularVelocity() }; }
function bset(b, s) { b.setPosition(V(s.x, s.y)); b.setAngle(s.a); b.setLinearVelocity(Vec2(s.vx / S, s.vy / S)); b.setAngularVelocity(s.w); b.setAwake(true); }
Sim.prototype.snapshot = function () {
  return { next: this.next, simT: this.simT, ball: bstate(this.ball), rope: !!this.rope, won: this.won,
    got: this.stars.map(function (s) { return s.got; }),
    props: this.props.map(function (p) { return bstate(p.body); }),
    pins: this.pins.map(function (p) { return { sid: p.st.id, x: p.x, y: p.y }; }),
    strokes: this.strokes.map(function (st) { var o = bstate(st.body); o.geom = st.geom; o.id = st.id; o.color = st.color; o.seed = st.seed; return o; }) };
};
Sim.prototype.restore = function (snap) {
  var self = this;
  bset(this.ball, snap.ball);
  if (!snap.rope && this.rope) this.cutRope();
  this.props.forEach(function (p, i) { if (snap.props[i]) bset(p.body, snap.props[i]); });
  snap.strokes.forEach(function (s) { self.addGeom(s.geom, { id: s.id, color: s.color, seed: s.seed }, s); });
  (snap.pins || []).forEach(function (pp) { var st = self.strokes.filter(function (q) { return q.id === pp.sid; })[0]; if (st) self.addPin(st, pp.x, pp.y); });
  this.stars.forEach(function (s, i) { s.got = !!snap.got[i]; });
  this.next = snap.next || 0; this.simT = snap.simT; var p = this.ball.getPosition(); this.bx = p.x * S; this.by = p.y * S;
  this.events = [];
};

window.DP = { W: W, H: H, S: S, BALL_R: BALL_R, STAR_R: STAR_R, MAXBODIES: MAXBODIES, genLevel: genLevel, Sim: Sim, makeGeom: makeGeom, pathLen: pathLen, mulberry32: mulberry32, hash2: hash2, V: V,
  distSeg: distSeg, inPoly: inPoly, decompose: decompose, area2: area2, rdp: rdp };
})();
