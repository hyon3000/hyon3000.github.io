// Shape World - observation encoder and tiny MLP policy runner for the reinforcement-learning auto player.
// The policy outputs the same four human keys (left / right / run / jump). Weights come from ai-model.js (window.SHAPE_AI).
(function (root) {
'use strict';
var TS = PF.TS, ROWS = PF.ROWS, SOL = PF.SOL, IN = PF.IN;
var NC = 13, NR = 9, C0 = -3, R0 = -5, NE = 6, NP = 3, NI = 2, NK = 3;
var D = 16 + NC * NR * 4 + NE * 15 + NP * 4 + NI * 3 + NK * 2 + 14 + 4 + 12;
var GROUP = { 0: 0, 3: 0, 1: 1, 11: 1, 13: 1, 17: 1, 20: 1, 12: 1, 2: 2, 9: 2, 10: 2, 15: 2, 16: 2, 19: 2, 4: 3, 18: 3, 5: 4, 6: 5, 7: 6, 14: 6, 8: 7 };
var STAGEK = { key: 0, door: 1, sw: 2, tele: 3, xge: 4, goal: 5 };
function cl(v, m) { return v > m ? m : v < -m ? -m : v; }
function build(st, out) {
  var p = st.p, L = st.L, RR = L.rows || ROWS, i, j, k, o = 0, pcx = p.x + p.w / 2, pcy = p.y + p.h / 2, w = st.L.w;
  var cell = PF.tileAt(st, Math.floor(pcx / TS), Math.floor(pcy / TS));
  out[o++] = cl(p.vx / 3, 1.2); out[o++] = cl(p.vy / 8, 1.2); out[o++] = p.ground ? 1 : 0; out[o++] = p.coy > 0 ? 1 : 0; out[o++] = p.jheld ? 1 : 0; out[o++] = p.pw / 3;
  out[o++] = PF.isW(cell) ? 1 : 0; out[o++] = p.air / PF.AIRMAX; out[o++] = p.star > 0 ? 1 : 0; out[o++] = p.mount ? 1 : 0; out[o++] = p.climb ? 1 : 0; out[o++] = p.face; out[o++] = p.pm / PF.P.PMAX; out[o++] = p.inv > 0 ? 1 : 0; out[o++] = p.tcd > 0 ? 1 : 0; out[o++] = p.y / 224;
  var hc = Math.floor(pcx / TS), hr = Math.floor(pcy / TS), base = o;
  for (i = 0; i < NC; i++) for (j = 0; j < NR; j++) {
    var c = hc + C0 + i, r = hr + R0 + j, eff = PF.tileAt(st, c, r), raw = (c >= 0 && c < w && r >= 0 && r < RR) ? L.tiles[c * RR + r] : (c < 0 || c >= w ? 1 : 0);
    var solid = (c < 0 || c >= w) ? 1 : (SOL[eff] ? 1 : 0), haz = (eff === 6 || eff === 14) ? 1 : 0, fl = 0, ms = 0;
    if (eff === 9) fl = 0.5; else if (eff === 22) fl = -1; else if (eff === 23) fl = 1; else if (eff === 24) fl = 0.8; else if (raw === 29 && eff === 0) fl = 0.15;
    switch (eff) { case 12: ms = 0.5; break; case 13: ms = -0.5; break; case 7: ms = 0.9; break; case 8: ms = 0.8; break; case 10: ms = -0.35; break; case 11: ms = 0.35; break; case 27: ms = 0.7; break; case 28: ms = 0.2; break; case 31: ms = 0.6; break; case 32: ms = 0.65; break; case 19: ms = 0.55; break; case 30: ms = 0.4; break; case 25: ms = 0.45; break; case 26: ms = 0.3; break; case 3: case 4: case 20: case 21: ms = 0.25; break; case 2: ms = 0.15; break; case 18: ms = 0.3; break; }
    var q = base + (i * NR + j) * 4; out[q] = solid; out[q + 1] = haz; out[q + 2] = fl; out[q + 3] = ms;
  }
  for (k = 0; k < L.movers.length; k++) { if (!PF.movOn(st, k, st.f)) continue; var mq = PF.movPos(st, k, st.f), mw = L.movers[k].w, mr = Math.floor(mq.y / TS) - hr - R0; if (mr < 0 || mr >= NR) continue;
    for (var cx = Math.floor(mq.x / TS); cx <= Math.floor((mq.x + mw) / TS); cx++) { var ci = cx - hc - C0; if (ci >= 0 && ci < NC) { var qq = base + (ci * NR + mr) * 4; if (out[qq] < 0.7) out[qq] = 0.7; } } }
  o = base + NC * NR * 4;
  // nearest enemies
  var cand = [];
  for (k = 0; k < st.en.length; k++) { var e = st.en[k]; if (!e.alive || (e.t === 7 && e.hid)) continue; var dx = e.x + e.w / 2 - pcx, dy = e.y + e.h / 2 - pcy; if (Math.abs(dx) > 200 || Math.abs(dy) > 130) continue; cand.push([dx * dx + dy * dy, k]); }
  cand.sort(function (a, b) { return a[0] - b[0]; });
  for (i = 0; i < NE; i++) {
    if (i >= cand.length) { for (j = 0; j < 15; j++) out[o++] = 0; continue; }
    var en = st.en[cand[i][1]], g = GROUP[en.t] || 0;
    out[o++] = cl((en.x + en.w / 2 - pcx) / 150, 1.2); out[o++] = cl((en.y + en.h / 2 - pcy) / 100, 1.2); out[o++] = en.w / 48; out[o++] = en.h / 48;
    for (j = 0; j < 8; j++) out[o++] = j === g ? 1 : 0; out[o++] = en.t === 3 && en.sh ? (en.sh === 2 ? -1 : 0.5) : (en.dir || 0); out[o++] = cl((en.dvx || 0) / 2, 1.2); out[o++] = cl((en.dvy || 0) / 2, 1.2);
  }
  for (i = 0; i < NP; i++) { if (i < st.ep.length) { var pr = st.ep[i]; out[o++] = cl((pr.x - pcx) / 100, 1.2); out[o++] = cl((pr.y - pcy) / 100, 1.2); out[o++] = cl(pr.vx / 3, 1.2); out[o++] = cl(pr.vy / 3, 1.2); } else { out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; } }
  var items = []; for (k = 0; k < st.it.length; k++) if (st.it[k].alive) items.push(k);
  for (i = 0; i < NI; i++) { if (i < items.length) { var it = st.it[items[i]]; out[o++] = cl((it.x + 6 - pcx) / 100, 1.2); out[o++] = cl((it.y + 6 - pcy) / 100, 1.2); out[o++] = (it.k + 1) / 6; } else { out[o++] = 0; out[o++] = 0; out[o++] = 0; } }
  var cs = []; for (k = 0; k < L.coins.length; k++) if (!st.cg[k]) { var cc = L.coins[k], ddx = cc.x - pcx, ddy = cc.y - pcy; if (Math.abs(ddx) < 160 && Math.abs(ddy) < 100) cs.push([ddx * ddx + ddy * ddy, k]); }
  cs.sort(function (a, b) { return a[0] - b[0]; });
  for (i = 0; i < NK; i++) { if (i < cs.length) { var cn = L.coins[cs[i][1]]; out[o++] = cl((cn.x - pcx) / 100, 1.2); out[o++] = cl((cn.y - pcy) / 100, 1.2); } else { out[o++] = 0; out[o++] = 0; } }
  // route guidance: next waypoint crumbs from the level solver (or the goal when none)
  var cb = L.crumbs, t1x, t1y, t2x, t2y;
  if (cb && cb.length) { var a1 = cb[Math.min(cb.length - 1, st.cr + 1)], a2 = cb[Math.min(cb.length - 1, st.cr + 3)]; t1x = a1[0]; t1y = a1[1]; t2x = a2[0]; t2y = a2[1]; } else { t1x = t2x = L.goalX; t1y = t2y = L.poleY - 8; }
  out[o++] = cl((t1x - pcx) / 150, 1.2); out[o++] = cl((t1y - pcy) / 100, 1.2); out[o++] = cl((t2x - pcx) / 150, 1.2); out[o++] = cl((t2y - pcy) / 100, 1.2);
  var rg = L.route ? L.route[st.stage] : null, sk = rg ? STAGEK[rg.k] : 5; for (j = 0; j < 6; j++) out[o++] = j === sk ? 1 : 0;
  out[o++] = st.boss > 0 ? 1 : 0; out[o++] = cb && cb.length ? 1 : 0; out[o++] = cl((L.goalX - pcx) / 800, 1.2); out[o++] = L.puzzle ? 1 : 0; 
  // ray features: how far to the next wall / pit / hazard / enemy ahead and behind (in tiles), obstacle height, pit width, ceiling clearance, drop depth
  var dirf = p.face >= 0 ? 1 : -1, fr = Math.floor((p.y + p.h - 1) / TS), cx0 = Math.floor(pcx / TS);
  function rays(dr) {
    var wallD = 12, wallH = 0, pitD = 12, pitW = 0, hazD = 12, k2, q2;
    for (k2 = 1; k2 <= 12; k2++) { var cc2 = cx0 + dr * k2, tf = PF.tileAt(st, cc2, fr), tg = PF.tileAt(st, cc2, fr - 1);
      if (wallD === 12 && (SOL[tf] || SOL[tg])) { wallD = k2; var h = 0; for (q2 = fr; q2 > fr - 6 && SOL[PF.tileAt(st, cc2, q2)]; q2--) h++; wallH = h; }
      if (hazD === 12 && (tf === 6 || tf === 14 || PF.tileAt(st, cc2, fr + 1) === 14)) hazD = k2;
      if (pitD === 12) { var gr = false; for (q2 = fr + 1; q2 <= fr + 5; q2++) { var tt2 = PF.tileAt(st, cc2, q2); if (SOL[tt2] || tt2 === 9 || tt2 === 12 || tt2 === 13) { gr = true; break; } } if (!gr) { pitD = k2; var w2 = 0; for (var kk2 = k2; kk2 <= 12; kk2++) { var g2 = false; for (q2 = fr + 1; q2 <= fr + 5; q2++) { var t3 = PF.tileAt(st, cx0 + dr * kk2, q2); if (SOL[t3] || t3 === 9) { g2 = true; break; } } if (g2) break; w2++; } pitW = w2; } }
      if (wallD < 12 && hazD < 12 && pitD < 12) break; }
    var ed = 12; for (var e2 = 0; e2 < st.en.length; e2++) { var en2 = st.en[e2]; if (!en2.alive) continue; var ddx = (en2.x + en2.w / 2 - pcx) * dr / TS; if (ddx > 0 && ddx < ed && Math.abs(en2.y + en2.h / 2 - pcy) < 26) ed = ddx; }
    return [wallD / 12, wallH / 5, pitD / 12, pitW / 6, hazD / 12, ed / 12];
  }
  var rf = rays(dirf), rb = rays(-dirf), ce = 0; for (j = 1; j <= 6; j++) { if (SOL[PF.tileAt(st, cx0, Math.floor((p.y - 1) / TS) - j + 1)]) break; ce++; }
  var gd = 0; for (j = 1; j <= 6; j++) { if (SOL[PF.tileAt(st, cx0, fr + j)]) break; gd++; }
  out[o++] = rf[0]; out[o++] = rf[1]; out[o++] = rf[2]; out[o++] = rf[3]; out[o++] = rf[4]; out[o++] = rf[5]; out[o++] = rb[0]; out[o++] = rb[2]; out[o++] = rb[4]; out[o++] = rb[5]; out[o++] = ce / 6; out[o++] = gd / 6;
  // wind / current at the hero
  var wx = 0, wy = 0; if (L.winds) for (k = 0; k < L.winds.length; k++) { var wz = L.winds[k]; if (pcx > wz.x0 && pcx < wz.x1 && pcy > wz.y0 && pcy < wz.y1) { wx += wz.dx; wy += wz.dy; } }
  out[o++] = cl(wx * 8, 1.2); out[o++] = cl(wy * 2, 1.2); out[o++] = cell === 22 ? -1 : cell === 23 ? 1 : 0; out[o++] = cell === 24 ? 1 : 0;
  for (i = 0; i < o; i++) out[i] = Math.round(cl(out[i], 1.27) * 100) / 100;
  return o;
}
// ---- MLP policy: D -> h1 -> h2 -> 4 key logits + value
var NET = null;
function b64f32(s) { var bin = atob(s), n = bin.length, u8 = new Uint8Array(n); for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i); return new Float32Array(u8.buffer); }
function setWeights(m) {   // m = { obs, h1, h2, out, w: base64 float32 }
  var f = typeof m.w === 'string' ? b64f32(m.w) : m.w, o = 0, take = function (n) { var a = f.subarray(o, o + n); o += n; return a; };
  NET = { d: m.obs, h1: m.h1, h2: m.h2, out: m.out, W1: take(m.obs * m.h1), b1: take(m.h1), W2: take(m.h1 * m.h2), b2: take(m.h2), W3: take(m.h2 * m.out), b3: take(m.out), a1: new Float32Array(m.h1), a2: new Float32Array(m.h2), res: new Float32Array(m.out) };
}
function forward(obs) {
  var n = NET, d = n.d, h1 = n.h1, h2 = n.h2, i, j, s;
  for (j = 0; j < h1; j++) n.a1[j] = n.b1[j];
  for (i = 0; i < d; i++) { var v = obs[i]; if (v === 0) continue; var row = i * h1; for (j = 0; j < h1; j++) n.a1[j] += v * n.W1[row + j]; }
  for (j = 0; j < h1; j++) if (n.a1[j] < 0) n.a1[j] = 0;
  for (j = 0; j < h2; j++) n.a2[j] = n.b2[j];
  for (i = 0; i < h1; i++) { var v1 = n.a1[i]; if (v1 === 0) continue; var row2 = i * h2; for (j = 0; j < h2; j++) n.a2[j] += v1 * n.W2[row2 + j]; }
  for (j = 0; j < h2; j++) if (n.a2[j] < 0) n.a2[j] = 0;
  for (j = 0; j < n.out; j++) { s = n.b3[j]; for (i = 0; i < h2; i++) s += n.a2[i] * n.W3[i * n.out + j]; n.res[j] = s; }
  return n.res;
}
var KEYBITS = [IN.L, IN.R, IN.RUN, IN.J];
function maskOf(res) { var m = 0; for (var k = 0; k < 4; k++) if (res[k] > 0) m |= KEYBITS[k]; if ((m & IN.L) && (m & IN.R)) m &= (res[0] > res[1]) ? ~IN.R : ~IN.L; return m; }
function make() {
  var buf = new Float32Array(D), st = { skip: 2, k: 0, mask: 0, bestF: 0, bestCr: -1, noise: 0 };
  return {
    ready: function () { return !!NET; },
    reset: function () { st.k = 0; st.mask = 0; st.bestCr = -1; },
    decide: function (s) {        // returns the key mask for this frame; the policy is evaluated every 2nd frame
      if (st.k++ % st.skip === 0) { build(s, buf); var res = forward(buf); st.mask = maskOf(res); }
      return st.mask;
    }
  };
}
// RL policy + simulation shield: before a key mask is used, the game's own simulation looks 28 frames ahead with the policy driving; if the hero would die, the look-ahead planner takes the wheel for 14 frames.
function makeShielded() {
  var pol = make(), sim = make(), pl = PFPlanner.make(), S = { until: 0, hits: 0, f: 0 };
  function dies(st, m0) { var c = PF.clone(st); c.share = true; sim.reset(); var m = m0; for (var k = 0; k < 28; k++) { PF.step(c, m); if (c.p.dead) return true; if (c.p.won) return false; m = sim.decide(c); } return false; }
  return {
    ready: function () { return !!NET; }, stats: S,
    reset: function () { pol.reset(); pl.reset(); S.until = 0; },
    decide: function (st) {
      if (S.until > st.f) return pl.decide(st);
      var m = pol.decide(st);
      if ((st.f & 1) === 0 && dies(st, m)) { S.until = st.f + 14; S.hits++; pl.reset(); return pl.decide(st); }
      return m;
    }
  };
}
root.PFAI = { D: D, build: build, setWeights: setWeights, forward: forward, maskOf: maskOf, make: make, makeShielded: makeShielded, KEYBITS: KEYBITS };
if (root.SHAPE_AI) { try { setWeights(root.SHAPE_AI); } catch (e) { root.PFAI.err = String(e); } }
})(typeof window !== 'undefined' ? window : globalThis);
