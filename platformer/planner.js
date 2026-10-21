// Shape World - look-ahead planner used by Auto Play (F3) and Hint (F4).
// It clones the game's own deterministic simulation and tries input sequences made of the four keys a human has
// (left / right / run / jump). The best plan's first few frames are executed through the normal input path.
// Two planners live here, both built on the game's own deterministic sim (PF.clone / PF.step):
//   makePlanner   = reactive look-ahead: scores a fixed set of scripted key sequences (CANDS) by simulating them H frames ahead.
//   makeNavigator = route-aware wrapper: follows a generator plan or a PF.searchIter stage search, and falls back to the reactive planner
//                   while airborne, in boss arenas, or when no plan is found. PFPlanner.make = navigator, PFPlanner.plain = reactive only.
(function (root) {
'use strict';
var IN = PF.IN, N = 0, R = IN.R, RR = IN.R | IN.RUN, Lf = IN.L;
var IN_R = PF.IN.R, IN_L = PF.IN.L, H = 64, REPLAN = 8;
// Candidate input scripts. Fields: a = key mask for the first s frames, b = mask afterwards, s = switch frame,
// // h = frames of Jump held starting at s + w (h = -1: never jump, 99 = hold to the end), t / c = after frame t (counted from s) switch to mask c,
// // l = frames of walking Left before the script starts, w = extra wait after s before the jump begins. Keys: RR = right+run, R, N = none, Lf = left.
var CANDS = (function () {
  var c = [], dirs = [RR, R, N], s, a, b, h;
  [0, 8, 20, 40].forEach(function (s) { dirs.forEach(function (a) { dirs.forEach(function (b) { if (s === 0 && a !== b) return; c.push({ a: a, b: b, s: s, h: -1 }); }); }); });
  [0, 3, 6, 10, 15, 22, 30].forEach(function (s) { dirs.forEach(function (a) { dirs.forEach(function (b) { if (s === 0 && a !== RR && a !== R) return; [99, 12, 4].forEach(function (h) { c.push({ a: a, b: b, s: s, h: h }); }); }); }); });
  [8, 16].forEach(function (s) { [R, RR].forEach(function (b) { c.push({ a: Lf, b: b, s: s, h: -1 }); [99, 12].forEach(function (h) { c.push({ a: Lf, b: b, s: s, h: h }); }); }); });
  [0, 6, 12].forEach(function (s) { [R, RR].forEach(function (a) { [R, RR].forEach(function (b) { [18, 30].forEach(function (t) { [99, 12].forEach(function (h) { c.push({ a: a, b: b, s: s, h: h, t: t, c: N }); }); }); }); }); });
  [20, 40].forEach(function (l) { [12, 22, 32].forEach(function (s) { [99, 12].forEach(function (h) { c.push({ a: RR, b: RR, s: s, h: h, l: l }); }); }); c.push({ a: RR, b: RR, s: 30, h: -1, l: l }); });
  return c;
})();
// Extra candidates only used when a boss is near: every jump timing 1..40 for each direction, plus a run-up then stand still (b = N) with a delayed jump (w).
var BOSS_EXTRA = (function () { var c = []; [RR, R, N, Lf].forEach(function (d) { for (var s = 1; s <= 40; s++) [99, 12].forEach(function (h) { c.push({ a: d, b: d, s: s, h: h }); }); });
  [RR, Lf | IN.RUN].forEach(function (a) { [4, 8, 14, 20].forEach(function (s) { [6, 12, 18, 24, 30, 38].forEach(function (w) { [99, 12].forEach(function (h) { c.push({ a: a, b: N, s: s, w: w, h: h }); }); }); }); });
  return c; })();
// Extra candidates that start by going left; only added on puzzle levels where the route may need backtracking.
var LEFT_EXTRA = (function () { var c = []; var LL = Lf | IN.RUN; [Lf, LL].forEach(function (a) { [a, N].forEach(function (b) { [0, 4, 8, 12, 16, 20, 26, 32].forEach(function (s) { c.push({ a: a, b: b, s: s, h: -1 }); [99, 12].forEach(function (h) { c.push({ a: a, b: b, s: s, h: h }); }); }); }); }); return c; })();
// True when a living boss (enemy type 8) is within 260 px of the hero: switches to the longer horizon and the boss-fight scoring.
function bossNear(st) { if (st.boss <= 0) return false; for (var i = 0; i < st.en.length; i++) { var e = st.en[i]; if (e.t === 8 && e.alive && Math.abs(e.x - st.p.x) < 260 && (!st.L.vgoal || Math.abs(e.y - st.p.y) < 200)) return true; } return false; }
// Key mask of candidate c at frame k: optional left lead-in (l), then a until s, then b (or c after t), with Jump OR-ed in during the hold window.
function inputAt(c, k) { if (c.l) { if (k < c.l) return Lf; k -= c.l; } var m = k < c.s ? c.a : (c.t !== undefined && k >= c.s + c.t ? c.c : c.b); var s0 = c.s + (c.w || 0); if (c.h > 0 && k >= s0 && k < s0 + c.h) m |= IN.J; return m; }

// True if a landing spot (solid, platform, liquid/safe tile or a mover) exists below the hero; false means a free fall into a pit.
function groundBelow(st) {
  var p = st.p, c0 = Math.floor(p.x / PF.TS), c1 = Math.floor((p.x + p.w - 1e-4) / PF.TS), r0 = Math.floor((p.y + p.h) / PF.TS);
  for (var c = c0; c <= c1; c++) for (var r = r0; r < (st.L.rows || PF.ROWS); r++) { var t = PF.tileAt(st, c, r); if (PF.SOL[t] || t === 12 || t === 13 || t === 40 || t === 9 || t === 7) return true; }
  var L = st.L; for (var i = 0; i < L.movers.length; i++) { var m = L.movers[i], mq = PF.movPos(st, i, st.f); if (p.x + p.w > mq.x - 20 && p.x < mq.x + m.w + 20 && p.y + p.h <= mq.y + 30) return true; }
  return false;
}
// Score candidate c: clone the state, replay the script for H frames (90 near a boss) and rate the end state; higher is better.
// // Death returns a large negative that prefers dying later; reaching the flag returns a large positive that prefers winning sooner.
// // traj (optional) collects the predicted path and the first landing index for the hint overlay.
function evaluate(st0, c, traj) {
  var HH = st0.boss > 0 && bossNear(st0) ? 90 : H;
  st0.share = true; var st = PF.clone(st0); st0.share = false; var p = st.p, big0 = st0.p.big, k, sc, lastGround = p.ground, land = -1, jumped = false;
  // Simulate frame by frame; an early death or win ends the rollout immediately.
  for (k = 0; k < HH; k++) {
    PF.step(st, inputAt(c, k));
    if (traj && (k & 1) === 0) traj.push({ x: p.x + p.w / 2, y: p.y + p.h });
    if (traj && land < 0) { if (!p.ground) jumped = true; else if (jumped) land = traj.length - 1; }
    if (p.dead) return { sc: -1e5 + k * 30, dead: true, k: k };
    if (p.won) return { sc: 1e6 - k, won: true, k: k };
  }
  return endScore(st0, st, c, k, land, big0);
}
// Rate the state st reached after the rollout of candidate c (k frames); shared by evaluate() and the prefix-sharing search (evalTrie).
function endScore(st0, st, c, k, land, big0) {
  var p = st.p, sc;
  // Puzzle levels outside boss fights: reward crumbs (waypoints) collected and stages finished, and pull toward the next two crumbs (weights 2.5 and 0.5, y counted 1.5x); small penalty for being airborne.
  if (st0.L.puzzle && st0.L.crumbs && !(st0.boss > 0 && (bossNear(st0) || (st0.L.vgoal && PF.inArena(st0))))) { var cbs = st.L.crumbs, tg = cbs[Math.min(cbs.length - 1, st.cr + 1)], tg2 = cbs[Math.min(cbs.length - 1, st.cr + 2)]; sc = st.cr * 500 + (st.stage - st0.stage) * 3000 - (Math.abs(p.x + 6 - tg[0]) + 1.5 * Math.abs(p.y + 7 - tg[1])) * 2.5 - (Math.abs(p.x + 6 - tg2[0]) + 1.5 * Math.abs(p.y + 7 - tg2[1])) * 0.5 + (st.score - st0.score) * 0.1; if (!p.ground) sc -= 15; return { sc: sc, dead: false, land: land, k: k }; }
  // Find the nearest living boss (index bi); only the boss branches below use it.
  var bi = -1, bd = 1e9; if (st0.boss > 0) { for (var q = 0; q < st0.en.length; q++) { var be = st0.en[q]; if (be.t === 8 && be.alive) { var dd = Math.abs(p.x - be.x); if (dd < bd) { bd = dd; bi = q; } } } }
  // Armoured boss: only kicked/thrown shells hurt it, so score boss HP lost (and a kill bonus) plus guidance toward getting a shell to the boss.
  if (bi >= 0 && st0.en[bi].imm && st0.en[bi].immKind === 'shell') {   // armoured boss: pick up a shell, carry it at the boss and throw it while the boss stands on the ground
    var b1 = st.en[bi], b0 = st0.en[bi], bx = b1.x + b1.w / 2, hx1 = p.x + 6, nd = 1e9, rd = 1e9, wd = 1e9, q2;
    sc = (b0.hp - b1.hp) * 4000 + (st.score - st0.score) * 0.25; if (!b1.alive) sc += 6000;
    // Distances to the nearest rolling shell (rd, to the boss), idle uncarried shell (nd, to the hero) and walking cube-bug (wd, to the hero).
    for (q2 = 0; q2 < st.en.length; q2++) { var se = st.en[q2]; if (!se.alive || se.t !== 3 || se.x < b1.mn - 40 || (se.carried && p.carry < 0)) continue; if (se.sh === 2 && Math.abs(se.vx || 0) > 1) rd = Math.min(rd, Math.abs(se.x + se.w / 2 - bx)); else if (se.sh === 1 && !se.carried) nd = Math.min(nd, Math.abs(se.x + se.w / 2 - hx1)); else if (se.sh === 0) wd = Math.min(wd, Math.abs(se.x + se.w / 2 - hx1)); }
    // Guidance priority: carrying a shell (bonus, closer to and facing the boss) > walk to an idle shell > stomp a bug to make one > approach the boss; rolling shells are drawn toward the boss.
    if (p.carry >= 0) sc += 300 - Math.abs(bx - hx1) * 0.8 + (p.face === (bx > hx1 ? 1 : -1) ? 40 : 0);
    else if (nd < 1e9) sc -= nd * 1.2 + (rd < 1e9 ? 0 : 60);
    else if (wd < 1e9) sc -= wd * 1.0 + 30;   // no shell yet: stomp a walking cube-bug to make one
    else sc -= Math.abs(bx - hx1) * 0.6;
    if (rd < 1e9) sc -= rd * 0.6;
  }
  // Normal boss: stay near it (x distance * 3), big reward per HP removed by stomping, and a bonus for the kill.
  else if (bi >= 0) { var b1 = st.en[bi], b0 = st0.en[bi]; sc = -Math.abs(p.x + 6 - (b1.x + b1.w / 2)) * 3 + (b0.hp - b1.hp) * 900 + (st.score - st0.score) * 0.25; if (!b1.alive) sc += 3000; }
  // No boss: plain progress, i.e. get as far right as possible, plus a little for score gained (coins, stomps).
  else sc = p.x * 3 + (st.score - st0.score) * 0.25;
  // Penalty for losing the power-up (shrinking) during the rollout.
  if (big0 && !p.big) sc -= 400;
  // Ice-block freeze: the longer it lasts the worse.
  if (p.frz > 0) sc -= 250 + p.frz * 3;   // frozen in an ice block: a helpless stretch
  // Hazard penalty for ending under a telegraphed strike zone (smaller while it is still warming up).
  if (st.hz.length) for (var hq = 0; hq < st.hz.length; hq++) { var ho = st.hz[hq]; if (Math.abs(p.x + p.w / 2 - ho.x) < 26 && p.y < ho.gy + 4) sc -= (ho.wt > 0 ? 90 : 160); }   // standing under a marked strike zone
  // Airborne at the end is slightly bad; airborne with nothing below (see groundBelow) is a near-death.
  if (!p.ground) { sc -= (p.wing > 0 ? 2 : 25); if (!(p.wing > 0) && !groundBelow(st)) sc -= 3000; }   // winged: flying over a pit is fine
  // Drowning: reward gaining air when it is low to begin with, and punish ending with less than 200 air.
  if (st0.p.air < 700) sc += (p.air - st0.p.air) * 0.3; if (p.air < 200) sc -= (200 - p.air) * 3;
  // Tie-breakers: prefer scripts that jump late and short, and avoid walking left unless it is needed.
  if (c.h > 0) sc -= 2 + c.s * 0.4;
  if (c.a === Lf || c.l) sc -= 30;
  return { sc: sc, dead: false, land: land, k: k };
}
// Prefix-sharing rollouts: candidates whose key sequences are equal for the first frames are simulated together (one PF.step per shared frame,
// the state is cloned only where the sequences diverge). Results are identical to evaluate() candidate by candidate, but ~3x fewer steps.
var TRIES = {};
function buildTrie(list, HH) {
  var seqs = list.map(function (c) { var a = new Uint8Array(HH); for (var k = 0; k < HH; k++) a[k] = inputAt(c, k); return a; });
  function mk(idxs, k0) {
    var k = k0; while (k < HH) { var v = seqs[idxs[0]][k], same = true; for (var j = 1; j < idxs.length; j++) if (seqs[idxs[j]][k] !== v) { same = false; break; } if (!same) break; k++; }
    var nd = { run: Array.prototype.slice.call(seqs[idxs[0]], k0, k), all: idxs, kids: null };
    if (k < HH) { var by = {}, order = []; idxs.forEach(function (i) { var v = seqs[i][k]; if (!by[v]) { by[v] = []; order.push(v); } by[v].push(i); }); nd.kids = order.map(function (v) { return mk(by[v], k); }); }
    return nd;
  }
  var all = list.map(function (c, i) { return i; }), root = mk(all, 0);
  return { root: root, units: root.run.length === 0 && root.kids ? root.kids : [root] };
}
// Simulate trie node nd (its run, then its children) from state st (consumed); frame k0 = depth where the run starts. Fills res[idx].
function runTrie(nd, st, k0, ps, res) {
  var p = st.p, run = nd.run, k = k0, i, j;
  for (i = 0; i < run.length; i++, k++) {
    PF.step(st, run[i]);
    if (p.dead) { for (j = 0; j < nd.all.length; j++) res[nd.all[j]] = { sc: -1e5 + k * 30, dead: true, k: k }; return; }
    if (p.won) { for (j = 0; j < nd.all.length; j++) res[nd.all[j]] = { sc: 1e6 - k, won: true, k: k }; return; }
  }
  if (!nd.kids) { for (j = 0; j < nd.all.length; j++) res[nd.all[j]] = endScore(ps.st, st, ps.list[nd.all[j]], k, -1, ps.big0); return; }
  for (j = 0; j < nd.kids.length; j++) {
    if (j === nd.kids.length - 1) runTrie(nd.kids[j], st, k, ps, res);
    else runTrie(nd.kids[j], PF.clone(st), k, ps, res);
  }
}
// Reactive planner. decide(st) returns one key mask per frame from a short script (SL frames) re-planned when the script ends.
function makePlanner() {
  var SL = 8;
  var pl = { script: null, i: 0, bestX: 0, bestF: 0, rnd: PF.rng(12345), explore: 0, last: null, stats: { plans: 0, ms: 0, sync: 0 }, pend: null, next: null };
  var now = function () { return typeof performance !== 'undefined' ? performance.now() : 0; };
  // Forget the current script, the pre-computed next search and the stall / explore timers (new level or restart).
  pl.reset = function () { pl.script = null; pl.i = 0; pl.bestX = 0; pl.bestF = 0; pl.explore = 0; pl.pend = null; pl.next = null; };
  // A resumable search over the candidate list; noise adds random jitter to scores, rising marks a jump already in flight.
  // The list and its prefix trie are cached per variant (boss near / puzzle level); ps.res collects the rollout results by candidate index.
  function newSearch(st, noise) {
    var bn = bossNear(st), key = (bn ? 1 : 0) + (st.L.puzzle ? 2 : 0), tr = TRIES[key];
    if (!tr) { var list = (bn ? CANDS.concat(BOSS_EXTRA) : CANDS).concat(st.L.puzzle ? LEFT_EXTRA : []); tr = TRIES[key] = buildTrie(list, bn && st.boss > 0 ? 90 : H); tr.list = list; }
    return { st: st, i: 0, ui: 0, best: null, bi: -1, noise: noise, rising: st.p.jheld && !st.p.ground && st.p.vy < 0, list: tr.list, tr: tr, res: new Array(tr.list.length), big0: st.p.big };
  }
  // Evaluate trie units until at least n more candidates are done; once the whole list is done pick the best in list order (keeps the old tie / noise order). A rising jump keeps its small bonus for jump-now candidates. Returns the result when finished, else null.
  function work(ps, n) {
    var units = ps.tr.units, goal = ps.i + n;
    while (ps.ui < units.length && ps.i < goal) { var u = units[ps.ui++]; ps.st.share = true; var q = PF.clone(ps.st); ps.st.share = false; q.share = false; runTrie(u, q, 0, ps, ps.res); ps.i += u.all.length; }   // far enemies are shared with the real state only for this first clone
    if (ps.ui < units.length) return null;
    for (var i = 0; i < ps.list.length; i++) { var c = ps.list[i], r = ps.res[i]; if (ps.rising && c.s === 0 && c.h > 0 && !c.l) r.sc += 8; var sc = r.sc + (ps.noise ? pl.rnd() * ps.noise : 0); if (ps.best === null || sc > ps.best.sc) { ps.best = r; ps.best.sc = sc; ps.bi = i; } }
    ps.best.cand = ps.list[ps.bi]; return ps.best;
  }
  // Synchronous full search (also used by the hint).
  pl.search = function (st, noise) { var ps = newSearch(st, noise); return work(ps, ps.list.length); };
  // Turn the winning candidate into the next SL concrete key masks (12 for a left lead-in).
  function makeScript(best) { var len = best.cand.l ? 12 : SL, sc = []; for (var k = 0; k < len; k++) sc.push(inputAt(best.cand, k)); return sc; }
  // Simulate the script to get the state expected when it ends; the next search is prepared on it.
  function predict(st, script) { st.share = true; var q = PF.clone(st); st.share = false; for (var k = 0; k < script.length; k++) PF.step(q, script[k]); return q; }
  // Is the real state equal to the predicted one (position, speed, death ...)? Then the pre-computed search can be reused.
  function same(a, b) { return Math.abs(a.p.x - b.p.x) < 0.01 && Math.abs(a.p.y - b.p.y) < 0.01 && a.p.dead === b.p.dead && Math.abs(a.p.vx - b.p.vx) < 0.01 && Math.abs(a.p.vy - b.p.vy) < 0.01; }
  // Per-frame entry. Execute the script; when it is used up, plan the next one.
  pl.decide = function (st) {
    var p = st.p, t0 = now();
    // Track the furthest x reached and when, to detect stalls.
    if (p.x > pl.bestX + 4) { pl.bestX = p.x; pl.bestF = st.f; }
    if (!pl.script || pl.i >= pl.script.length) {
      var best = null;
      // Boss stalemate breaker: remember total boss HP; if it has not changed for 240 frames while fighting, run noisy searches (bossNoise) for a while.
      var hps = 0; if (st.boss > 0) for (var hi = 0; hi < st.en.length; hi++) if (st.en[hi].t === 8 && st.en[hi].alive) hps += st.en[hi].hp;
      if (hps !== pl.hps) { pl.hps = hps; pl.hpF = st.f; }
      if (st.boss > 0 && bossNear(st) && st.f - (pl.hpF || 0) > 240) { pl.bossNoise = 40; pl.hpF = st.f - 120; }   // fight stalemate (standing still while the boss circles): try something random for a while
      if (pl.bossNoise > 0) pl.next = null;
      // Fast path: the state matches the prediction, so the search done during the previous script is reused.
      if (pl.next && pl.next.pred && same(pl.next.pred, st)) { var ps = pl.next.ps; best = ps.done || work(ps, ps.list.length); }
      else {
        // Stuck for 300 frames without progress: explore mode (small random score noise) for 40 frames. Otherwise search now (sync).
        if (st.f - pl.bestF > 300) { pl.explore = 40; pl.bestF = st.f - 100; }
        best = pl.search(st, pl.bossNoise > 0 ? 400 : (pl.explore > 0 ? 25 : 0)); if (pl.bossNoise > 0) pl.bossNoise -= SL; if (pl.explore > 0) pl.explore -= SL; pl.stats.sync++; }
      pl.next = null; pl.stats.plans++;
      pl.last = best; pl.script = makeScript(best); pl.i = 0;
      // Predicted next search: start preparing the plan for where this script will end.
      var pred = predict(st, pl.script); pl.next = { pred: pred, ps: newSearch(pred, pl.explore > 0 ? 25 : 0) };
    }
    // Spread the next search over the frames of the current script so each frame only pays a slice of the cost.
    if (pl.next && !pl.next.ps.done) { var per = Math.ceil(pl.next.ps.list.length / (pl.script.length - 1)); var r = work(pl.next.ps, per); if (r) pl.next.ps.done = r; }
    pl.stats.ms += now() - t0;
    return pl.script[pl.i++];
  };
  return pl;
}

// ---- hint: a short text + the predicted path / landing spot / hazard
// Nearest hazard ahead of the hero (enemy, spike, pit, wall/ledge) as {kind, x, y, dx}; picks the hint text.
function nearestHazard(st) {
  var p = st.p, L = st.L, TS = PF.TS, best = null, px = p.x + p.w / 2, d;
  function cons(kind, x, y, dx) { if (dx >= -4 && (best === null || dx < best.dx)) best = { kind: kind, x: x, y: y, dx: dx }; }
  for (var i = 0; i < st.en.length; i++) { var e = st.en[i]; if (!e.alive) continue; d = e.x + e.w / 2 - px; if (d < 220 && Math.abs(e.y - p.y) < 60) if (e.t === PF.E.PLANT && e.hid) continue; cons({ 1: 'spiky', 2: 'flyer', 3: 'beetle', 4: 'bullet', 5: 'crush', 6: 'ghost', 7: 'plant', 8: 'boss', 9: 'fish', 10: 'fish', 11: 'mine', 12: 'whale', 13: 'jelly', 14: 'clam', 15: 'swoop', 16: 'flock', 17: 'balloon', 18: 'shooter', 19: 'bird', 20: 'spark' }[e.t] || 'blob', e.x + e.w / 2, e.y + e.h / 2, d); }
  var c0 = Math.floor(px / TS), r = Math.floor((p.y + p.h - 1) / TS);
  for (var c = c0; c < Math.min(L.w, c0 + 14); c++) {
    d = c * TS + 8 - px;
    var t = PF.tileAt(st, c, r);
    if (t === PF.T.SPIKE) { cons('spike', c * TS + 8, r * TS + 8, d); break; }
    var fl = false; for (var rr = r + 1; rr < (L.rows || PF.ROWS); rr++) { var tt = PF.tileAt(st, c, rr); if (PF.SOL[tt] || tt === 14) { fl = true; break; } }
    if (!fl) { var onm = false; for (var m = 0; m < L.movers.length; m++) { var mm = L.movers[m]; if (Math.abs(mm.cx - (c * TS + 8)) < mm.amp + 40 && Math.abs(mm.y - (p.y + p.h)) < 60) onm = true; } cons(onm ? 'mover' : 'pit', c * TS + 8, (r + 1) * TS, d); break; }
    var th = PF.tileAt(st, c, r); if (c > c0 && PF.SOL[th]) { cons('wall', c * TS + 8, r * TS + 8, d); break; }
  }
  return best;
}
// Hint texts per key: [Korean, English].
var MSG = {
  stomp: ['앞의 적을 밟을 수 있어요: 위에서 점프로 내려찍으세요', 'Stomp the enemy ahead: land on top of it'],
  blob: ['앞의 삼각 크롤러를 점프로 밟거나 넘어가세요', 'Jump on (or over) the crawler ahead'],
  flyer: ['날아다니는 연이 있어요: 아래로 지나가거나 위에서 밟으세요', 'A kite ahead: pass under its path or stomp it from above'],
  spiky: ['별 지뢰는 밟으면 안 돼요! 점프로 넘어가세요', 'Do not stomp the star mine - jump over it'],
  spike: ['바닥 가시: 점프로 넘어가세요', 'Floor spikes: jump over them'],
  pit: ['구덩이: 달리기(Shift/X)를 누르고 점프를 길게 눌러 건너세요', 'Pit ahead: hold Run and keep Jump pressed to clear it'],
  mover: ['움직이는 발판: 가까이 올 때 올라타세요', 'Moving platform: hop on when it comes close'],
  wall: ['벽/턱: 점프를 길게 눌러 올라가세요', 'Ledge ahead: hold Jump to climb onto it'],
  beetle: ['큐브벌레를 밟으면 큐브가 돼요: 차거나 들어서 던질 수 있어요', 'Stomp the cube-bug: the cube can be kicked (or carried with Run)'],
  bullet: ['발사체가 날아와요: 점프로 넘거나 위에서 밟으세요', 'A dart is coming: jump over it or stomp it'],
  crush: ['모노리스: 달리기를 누르고 재빨리 아래를 지나가세요', 'Monolith: hold Run and dash under it before it drops'],
  ghost: ['위습은 바라보면 멈춰요: 계속 움직이세요', 'The wisp freezes when you face it: keep moving'],
  plant: ['포자 싹이 내려갔을 때 점프로 넘어가세요', 'Jump over the spore bud while it is down'],
  boss: ['보스! 위에서 세 번 밟으세요 (탄을 피하세요)', 'Boss! Stomp it from above three times (dodge its shots)'],
  fish: ['물고기를 위에서 밟거나 헤엄쳐 피하세요', 'Stomp the swimmer from above or swim around it'],
  mine: ['떠다니는 기뢰: 절대 닿지 말고 돌아가세요', 'Floating mine: never touch it, swim around'],
  whale: ['큰 고래는 입만 위험해요: 머리 앞을 피해 지나가세요', 'The big glider is only dangerous at its mouth: avoid its head'],
  jelly: ['해파리의 갓과 촉수를 피하세요', 'Keep away from the jelly bell and its tentacle'],
  clam: ['조개가 열렸을 때 진주를 먹고, 닫히면 피하세요', 'Grab the pearl while the clam is open, stay clear when it shuts'],
  swoop: ['급강하 새: 점프로 밟거나 계속 움직이세요', 'A swooper dives at you: stomp it or keep moving'],
  flock: ['작은 새 떼가 지나가요: 밟거나 사이로 피하세요', 'A flock passes: stomp a member or slip past'],
  balloon: ['가시 풍선: 닿지 않게 돌아가세요', 'Spiky balloon: steer around it'],
  shooter: ['떠 있는 포대: 탄을 피하거나 위에서 밟으세요', 'Floating turret: dodge its shots or stomp it'],
  bird: ['새를 밟으면 보물을 떨어뜨려요', 'Stomp the bird to drop its treasure'],
  spark: ['레일 위의 스파크: 타이밍을 맞춰 지나가세요', 'Spark orb on a rail: time your pass'],
  swim: ['물속: 점프를 누르면 위로, 떼면 가라앉아요', 'In water: hold Jump to swim up, release to sink'],
  air: ['숨이 부족해요! 공기 방울을 먹거나 물 밖으로 나가세요', 'Low on air! Grab an air bubble or leave the water'],
  wind: ['바람 구역: 점프 중 밀려요, 방향을 보정하세요', 'Wind zone: it pushes you in the air, steer against it'],
  rkey: ['열쇠를 가져오세요 (문과 같은 색)', 'Fetch the key (same colour as the door)'],
  rdoor: ['열쇠를 들고 같은 색 문으로 가세요', 'Take the key to the door of the same colour'],
  rsw: ['바닥 스위치를 밟으세요', 'Step on the switch pad'],
  rtele: ['빛나는 패드를 밟으면 순간이동해요', 'Step on the glowing pad to teleport'],
  rxge: ['열린 통로로 계속 가세요', 'Go on through the opening'],
  rropeDone: ['점프하며 위 키를 눌러 밧줄을 잡고, 좌우를 리듬에 맞춰 눌러 흔든 뒤 점프로 놓으세요', 'Jump and hold Up to grab the rope, push Left/Right in rhythm with the swing, then release with Jump'],
  rnear: ['물길을 따라 계속 헤엄치세요', 'Keep swimming along the water passage'],
  wait: ['잠깐 기다리세요', 'Wait a moment here'],
  go: ['오른쪽으로 계속 가세요', 'Keep going right'],
  jump: ['지금 점프하세요', 'Jump now']
};
// Hint: run the planner, re-evaluate its choice to get the path, and choose a message from the plan and the nearest hazard.
function makeHint(st, pl) {
  var best = pl.search(st, 0), traj = [], c = best.cand;
  var r = evaluate(st, c, traj), hz = nearestHazard(st), key = 'go', jumpAt = c.h > 0 ? c.s : -1;
  if (jumpAt >= 0 && jumpAt <= 22) key = hz ? (hz.kind === 'blob' ? 'blob' : hz.kind) : 'jump';
  else if (jumpAt < 0 && (c.a === N || (c.s > 0 && c.b === N)) && st.p.ground) key = 'wait';
  else if (hz && hz.dx < 120 && (hz.kind === 'pit' || hz.kind === 'mover')) key = 'wait';
  if (key === 'go' && hz && hz.dx < 170 && ['crush', 'ghost', 'boss', 'plant', 'bullet', 'beetle', 'spiky', 'spike', 'fish', 'mine', 'whale', 'jelly', 'clam', 'swoop', 'flock', 'balloon', 'shooter', 'bird', 'spark'].indexOf(hz.kind) >= 0) key = hz.kind;
  // Water and wind override the generic go / wait messages (low air, swimming, wind zone within 40 px).
  var pp = st.p, pcx = pp.x + pp.w / 2, inWater = PF.isW(PF.tileAt(st, Math.floor(pcx / PF.TS), Math.floor((pp.y + pp.h / 2) / PF.TS)));
  if (key === 'go' || key === 'wait') { if (pp.air < 330 && inWater) key = 'air'; else if (inWater) key = 'swim'; else if (st.L.winds) for (var wi = 0; wi < st.L.winds.length; wi++) { var wz = st.L.winds[wi]; if (pcx > wz.x0 - 40 && pcx < wz.x1 + 40 && pp.y > wz.y0 - 40 && pp.y < wz.y1 + 40) { key = 'wind'; break; } } }
  // Puzzle levels: point at the current route waypoint and use its stage-specific message (key, door, switch, teleport ...).
  var way = null;
  if (st.L.puzzle && st.L.route) { var rg = st.L.route[st.stage]; if (rg) { way = { x: rg.x, y: rg.y === null ? st.p.y : rg.y }; if (key === 'go' || key === 'jump' || key === 'wait') key = 'r' + rg.k; } }
  // The predicted landing spot (first touchdown of the best plan), for the overlay.
  var land = null; if (r.land >= 0 && traj[r.land]) land = traj[r.land];
  
  var extra = (c.a & IN.RUN) || (c.b & IN.RUN) ? [' (달리기 유지)', ' (hold Run)'] : ['', ''];
  var m = MSG[key];
  return { key: key, ko: m[0] + (key === 'go' ? extra[0] : ''), en: m[1] + (key === 'go' ? extra[1] : ''), traj: traj, land: land, haz: hz, way: way, jumpIn: jumpAt, sc: best.sc };
}

// ---- navigator: the generator's own route search (PF.searchStage, a best-first search over jump/walk macros on the real simulation, enemies included)
// plans each route stage (key, door, teleport, switch, exit ...) from the live state; the look-ahead planner only drives while airborne or when no plan is found
// the plan may only end where the hero can stand still afterwards (an 'at' waypoint reached while sliding into a spike is a dead end)
// True if the hero can stand still for 24 frames without dying and ends on the ground.
// swim stages end with a margin to every live creature (a plan that stops beside a fish has no way out)
function clearOfEn(s) { var p = s.p, px = p.x + p.w / 2, py = p.y + p.h / 2; for (var i = 0; i < s.en.length; i++) { var e = s.en[i]; if (e.alive && Math.abs(e.x + e.w / 2 - px) < e.w / 2 + 34 && Math.abs(e.y + e.h / 2 - py) < e.h / 2 + 34) return false; } return true; }
function settles(s) { var q = PF.clone(s); for (var k = 0; k < 24; k++) { PF.step(q, 0); if (q.p.dead) return false; } return q.p.ground; }

// armoured boss (only kicked shells hurt it): stomp a beetle, stand LEFT of the shell and walk into it so it rolls at the boss; the look-ahead planner dodges when the boss is close
function best0(st, boss) { for (var i = 0; i < st.en.length; i++) { var e = st.en[i]; if (e.alive && e.t === 3 && e.x >= boss.x - 520 && e.x <= boss.x + 200) return e; } return null; }
// Shell-boss controller. Currently it hands the whole fight to the look-ahead planner (shell-aware score in evaluate); the code below the first return is the older scripted approach and is unreachable.
function shellBossMask(st, boss, fb) {   // + hop over ledges / cannons in the way
  return fb.decide(st);   // in the arena the look-ahead planner (shell-aware score) does the fight
  var m = shellBossMask0(st, boss, fb), p = st.p;
  if (p.ground && (m & (IN_R | IN_L))) { var dir = (m & IN_R) ? 1 : -1, c = Math.floor((dir > 0 ? p.x + p.w + 3 : p.x - 3) / PF.TS), r = Math.floor((p.y + p.h - 5) / PF.TS), t = PF.tileAt(st, c, r); if (PF.SOL[t] || t === 15 || t === 16) m |= PF.IN.J; }
  function react(q) { if (!q.p.ground) return 0; var hx = q.p.x + q.p.w / 2; for (var i = 0; i < q.en.length; i++) { var e = q.en[i]; if (e.alive && e.t === 3 && e.sh === 2 && Math.abs(e.vx || 0) > 1) { var rx = e.x + e.w / 2 - hx; if (Math.abs(rx) < 52 && (rx > 0) === (e.dir < 0)) return PF.IN.J; } } return 0; }
  function lives(mm) { st.share = true; var q = PF.clone(st); st.share = false; for (var k = 0; k < 70; k++) { PF.step(q, k < 10 ? mm : (k < 16 ? (mm & ~PF.IN.J) : react(q))); if (q.p.dead) return false; } return true; }
  if (!lives(m)) {   // the scripted approach would run into a beetle / the boss: take the first safe variant, else let the look-ahead planner dodge
    var alts = [m | PF.IN.J, m & ~(IN_R | IN_L), (m & ~(IN_R | IN_L)) | PF.IN.J, PF.IN.L | PF.IN.RUN, PF.IN.R | PF.IN.RUN, PF.IN.L | PF.IN.J, PF.IN.R | PF.IN.J], i;
    for (i = 0; i < alts.length; i++) if (lives(alts[i])) return alts[i];
    return fb.decide(st);
  }
  return m;
}
// Scripted shell-boss tactic: carry a shell at the boss, dodge rolling shells, pick up idle shells, stomp walking bugs to make shells.
function shellBossMask0(st, boss, fb) {
  var IN = PF.IN, p = st.p, hx = p.x + p.w / 2, bd = boss.x + boss.w / 2 - hx, best = null, bs = 1e9, i, e, rolling = null;
  for (i = 0; i < st.en.length; i++) { e = st.en[i]; if (!e.alive || e.t !== 3 || e.x < boss.x - 520 || e.x > boss.x + 200) continue; if (e.sh === 2 && Math.abs(e.x - hx) < 240 && Math.abs(e.vx || 0) > 1) rolling = e; var d = Math.abs(e.x + e.w / 2 - hx) + (e.sh === 1 ? 0 : 30); if (d < bs) { bs = d; best = e; } }
  if (p.carry >= 0) {                                                                          // carrying a shell: walk at the boss, let go (Run released) once it stands within throwing range and we face it
    var cs = bd > 0 ? 1 : -1, CT = cs > 0 ? IN.R : IN.L;
    if (p.face === cs && Math.abs(bd) < 200 && Math.abs(bd) > 40 && boss.ground) return CT;
    return CT | IN.RUN;
  }
  if (Math.abs(bd) < 96 && p.ground) return fb.decide(st);                                  // boss next to us: dodge / jump over like the normal arena
  if (!best0(st, boss)) return fb.decide(st);
  if (rolling) {                                                                              // a shell is rolling: keep away from it, it can hurt us on the way back
    var rx = rolling.x + rolling.w / 2 - hx;
    if (Math.abs(rx) < 90 && (rx > 0) === (rolling.dir < 0)) return p.ground ? IN.J : 0;   // it is faster than us: hop straight up and let it run under
    return 0;
  }
  if (!best) return fb.decide(st);
  var sx = best.x + best.w / 2, dx = sx - hx;
  if (best.sh === 1) return (dx > 0 ? IN.R : IN.L) | IN.RUN;                                // an idle shell: walk into it holding Run = pick it up
  if (Math.abs(dx) > 26) return (dx > 0 ? IN.R : IN.L) | IN.RUN;                              // a walking beetle: close in and stomp
  if (p.ground && Math.abs(dx) < 22) return IN.J | (dx > 0 ? IN.R : IN.L);
  return dx > 0 ? IN.R : IN.L;
}
// Script hint: the generator's validated script (L.script, enemy-free) is the same stage route the search would find. Its trajectory is recorded once per level
// (position and speed before each frame) so a stage can be answered by replaying the script from the matching frame on a clone with the real enemies: no search needed.
var TRAJ = new WeakMap();
function scriptTraj(L) {
  if (TRAJ.has(L)) return TRAJ.get(L);
  var tr = null;
  if (L.script && L.script.length && L.route && !L.plan) {
    var V = L; if (L.arena && L.vgoal) { V = {}; for (var vk in L) V[vk] = L[vk]; V.arena = null; V.goalX = L.vgoal.x; V.poleY = L.vgoal.y + 10; V.goalRect = { x: L.vgoal.x - 8, y: L.vgoal.y - 4 * PF.TS, w: 16, h: 4 * PF.TS }; V.route = L.route.slice(0, -1).concat([{ k: 'goal', x: L.vgoal.x, y: L.vgoal.y }]); }   // chain castle: the script proves the route to the arena floor (like the generator's vcopy)
    var st = PF.newState(V, { noEn: !L.stepEn, noPM: true });
    if (L.stepEn && L.reqEn) { st.en = st.en.filter(function (e) { return L.reqEn.indexOf(e.t) >= 0; }); st.boss = st.en.filter(function (e) { return e.t === 8; }).length; }
    var n = L.script.length, X = new Float32Array(n), Y = new Float32Array(n), VX = new Float32Array(n), VY = new Float32Array(n), G = new Uint8Array(n), ST = new Int32Array(n), by = new Map(), len = 0;
    for (var i = 0; i < n; i++) {
      var p = st.p; X[i] = p.x; Y[i] = p.y; VX[i] = p.vx; VY[i] = p.vy; G[i] = p.ground ? 1 : 0; ST[i] = st.stage; len = i + 1;
      var key = Math.round(p.x) + ',' + Math.round(p.y), a = by.get(key); if (a) a.push(i); else by.set(key, [i]);
      PF.step(st, L.script[i]); if (st.p.dead || st.p.won) break;
    }
    tr = { X: X, Y: Y, VX: VX, VY: VY, G: G, ST: ST, by: by, len: len };
  }
  TRAJ.set(L, tr);
  return tr;
}
// Script frames whose recorded state equals the hero's now (frame f first, then position lookup).
function scriptStarts(L, st) {
  var tr = scriptTraj(L), out = [], p = st.p; if (!tr) return out;
  function ok(i) { return i < tr.len && Math.abs(tr.X[i] - p.x) < 0.6 && Math.abs(tr.Y[i] - p.y) < 0.6 && Math.abs(tr.VX[i] - p.vx) < 0.05 && Math.abs(tr.VY[i] - p.vy) < 0.05 && tr.G[i] === (p.ground ? 1 : 0); }
  if (ok(st.f)) out.push(st.f);
  var xs = [Math.floor(p.x), Math.ceil(p.x)], ys = [Math.floor(p.y), Math.ceil(p.y)];
  for (var a = 0; a < 2 && out.length < 4; a++) for (var b = 0; b < 2; b++) { var l = tr.by.get(xs[a] + ',' + ys[b]); if (l) for (var j = 0; j < l.length && out.length < 4; j++) if (l[j] !== st.f && ok(l[j]) && out.indexOf(l[j]) < 0) out.push(l[j]); }
  return out;
}
// Script-guided search heuristic: how far along the script (the frames of the current stage) a standing node is; smaller = closer to done.
// Off-path nodes get a large value plus the plain distance, so the search stays complete but follows the validated route first.
function scriptGuide(L, stage, tx, ty) {
  var tr = scriptTraj(L), endJ = tr.len - 1, cells = new Map(), i, i0 = -1;
  for (i = 0; i < tr.len; i++) if (tr.ST[i] >= stage) { i0 = i; break; }
  if (i0 < 0) return null;
  for (i = i0 + 1; i < tr.len; i++) if (tr.ST[i] > stage) { endJ = i; break; }
  for (i = i0; i <= endJ; i++) if (tr.G[i]) { var key = Math.floor(tr.X[i] / 16) * 4096 + Math.floor(tr.Y[i] / 16), a = cells.get(key); if (a) a.push(i); else cells.set(key, [i]); }
  return function (st) {
    var p = st.p, cx = Math.floor(p.x / 16), cy = Math.floor(p.y / 16), bj = -1, bd = 1e9;
    for (var a = -2; a <= 2; a++) for (var b = -1; b <= 1; b++) { var l = cells.get((cx + a) * 4096 + cy + b); if (l) for (var j = 0; j < l.length; j++) { var q = l[j], dx = Math.abs(tr.X[q] - p.x), dy = Math.abs(tr.Y[q] - p.y); if (dx < 32 && dy < 12) { var d = dx + 3 * dy; if (d < bd || (d === bd && q > bj)) { bd = d; bj = q; } } } }
    if (bj >= 0) return (endJ - bj) + 0.5 * bd + 0.001 * (Math.abs(p.x + 6 - tx) + (ty === null ? 0 : 1.5 * Math.abs(p.y + 7 - ty)));
    return 1e5 + Math.abs(p.x + 6 - tx) + (ty === null ? 0 : 1.5 * Math.abs(p.y + 7 - ty));
  };
}
// Replay the script from frame i0 on a clone (real enemies) until the stage is done by pred and the hero stands (then ext more frames must be survived); returns the key sequence or null (death, or never done).
function scriptStage(L, st, i0, pred, needGround, ext) {
  var q = PF.clone(st), sc = L.script, end = Math.min(sc.length, i0 + 1500);
  for (var k = i0; k < end; k++) {
    PF.step(q, sc[k]); if (q.p.dead || (st.p.pw > 0 && q.p.pw === 0) || (st.p.big && !q.p.big)) return null;   // (a hit that costs the power-up is as bad as dying)
    if ((q.p.won || q.p.ground || !needGround) && pred(q)) { for (var e = k + 1; e <= k + (ext || 0) && e < sc.length && !q.p.won; e++) { PF.step(q, sc[e]); if (q.p.dead || (st.p.pw > 0 && q.p.pw === 0) || (st.p.big && !q.p.big)) return null; } return sc.slice(i0, k + 1); }
    if (q.p.won) return null;
  }
  return null;
}
// Navigator: nv.decide(st, budgetMs) returns a key mask for this frame, or null while a budgeted search is still thinking.
function makeNavigator() {
  var fb = makePlanner(), now = function () { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }, nv = { fb: fb, seq: null, i: 0, stage: -1, wait: 0, st: { plans: 0, fails: 0, ms: 0 } };
  // True when the hero can plan from here: standing, or afloat on swim levels.
  function onBase(st) { var L = st.L; return st.p.ground || (L.swimNodes && PF.isW(PF.tileAt(st, Math.floor((st.p.x + st.p.w / 2) / PF.TS), Math.floor((st.p.y + st.p.h / 2) / PF.TS)))); }
  // Is the real state the one predicted for the end of the sequence (same frame, stage, position, speed)?
  function samePred(a, b) { return a.f === b.f && a.stage === b.stage && Math.abs(a.p.x - b.p.x) < 0.01 && Math.abs(a.p.y - b.p.y) < 0.01 && Math.abs(a.p.vx - b.p.vx) < 0.01 && Math.abs(a.p.vy - b.p.vy) < 0.01 && a.p.dead === b.p.dead; }
  // Build the stage search for state st: { hint: key sequence } when the validated script already solves the stage, else { job } with its search tiers.
  function makeJob(st) {
    var L = st.L;
    // Current goal waypoint g (the last one repeats); target x and y (y may be null = any height).
    var g = L.route[Math.min(st.stage, L.route.length - 1)]; if (g.k === 'goal' && L.arena && st.boss > 0 && !PF.inArena(st)) g = L.vgoal ? L.route[L.route.length - 2] : { k: 'xge', x: L.arena.c0 * PF.TS - 24, y: g.y, door: 1 };   // long castle: first reach the arena door, the fight itself is the reactive planner's job
    var tx = g.x === undefined ? L.goalX : g.x, ty = g.y === undefined ? null : g.y;
    // Stage-done tests: strict also requires no poison and a safe stop (settles) unless it is the goal or a door; loose drops the safe-stop rule.
    var nearDone = function (s) { return g.k === 'near' && s.stage > st.stage; }, strict = function (s) { return (PF.stageDone(s, g) || nearDone(s)) && !(s.p.pois > 0) && (g.k === 'goal' || g.door || settles(s)) && (!L.swimNodes || g.k === 'goal' || clearOfEn(s)); }, loose = function (s) { return (PF.stageDone(s, g) || nearDone(s)) && !(s.p.pois > 0); };
    var scripted = L.route.length > 2 || L.kind === 'skymaze';
    // Script hint: the validated script usually already solves this stage (also with the real enemies); verify it by replay, search only when it fails.
    if (scripted && !st.p.pois && st.p.ground) { var ssx = scriptStarts(L, st); for (var si = 0; si < ssx.length; si++) { var hs = scriptStage(L, st, ssx[si], strict, g.k !== 'goal'); if (hs && hs.length) return { hint: hs }; } }
    var c2 = PF.clone(st); c2.en = []; c2.noEn = true;
    // Search tiers, tried in order until one finds a plan: [state, done-test, node budget (, heuristic)]. With enemies and a safe stop (one 8000-node tier: a 3000-node tier first would only repeat its first nodes),
    // without the safe stop, a long last try, and as a last resort as if the enemies were not there (a hit beats standing still).
    var tiers = [[PF.clone(st), strict, 8000], [PF.clone(st), loose, 3000], [PF.clone(st), strict, 16000], [c2, strict, 4000]];
    if (L.route.length <= 2) tiers = [[PF.clone(st), strict, 1500]];   // plain run-to-the-flag stage: if the search is not quick, the reactive planner drives for a while
    var gd = scripted && !L.swimNodes && scriptTraj(L) ? scriptGuide(L, st.stage, tx, ty) : null; if (gd && gd(st) < 1e5) tiers.unshift([PF.clone(st), strict, 60], [PF.clone(st), strict, 1200, gd]);   // on the validated route: a quick plain try (most stages are easy), then a script-guided search
    return { job: { stage: st.stage, ti: 0, it: null, tiers: tiers, tx: tx, ty: ty, plain: L.route.length <= 2, fin: false, res: null } };
  }
  // Run job jb for up to n search nodes of its current tier; sets jb.fin / jb.res when a tier found a plan or the last tier failed.
  function advance(jb, n) {
    if (!jb.it) { var tr = jb.tiers[jb.ti]; jb.it = PF.searchIter(tr[0], tr[1], jb.tx, jb.ty, tr[2], tr[3]); }
    var r = jb.it.run(n); if (r === undefined) return;
    if (r || ++jb.ti >= jb.tiers.length) { jb.fin = true; jb.res = r; return; }
    jb.it = null;
  }
  // Pipelining: while a sequence plays, the search for the stage that follows it (from the state the sequence ends in) is prepared in small slices (about 5 ms per frame),
  // so the game rarely has to stop and think when the sequence is used up.
  function pipe(st) {
    var L = st.L;
    if (nv.preSeq !== nv.seq) {
      nv.preSeq = nv.seq; nv.pre = null;
      if (st.boss > 0 || st.p.wing > 0 || st.p.pois > 0) return;
      var q = PF.clone(st);   // (no share: the clone is stepped for many frames and must not move the real enemies)
      for (var k = nv.i; k < nv.seq.length; k++) { PF.step(q, nv.seq[k]); if (q.p.dead || q.p.won || q.stage !== st.stage) break; }
      if (q.p.dead || q.p.won || q.stage === st.stage || !onBase(q) || q.boss > 0 || q.p.wing > 0) return;
      var rg = L.route[Math.min(q.stage, L.route.length - 1)]; if (rg.k === 'ropeDone') return;
      var mj = makeJob(q); nv.pre = mj.hint ? { pred: q, hint: mj.hint } : { pred: q, job: mj.job };
    }
    var pr = nv.pre; if (!pr || !pr.job || pr.job.fin) return;
    var t = now(); do { advance(pr.job, 1); } while (!pr.job.fin && now() - t < 5);
  }
  // Reset the reactive planner and every cached plan / search job.
  nv.reset = function () { fb.reset(); nv.planBad = false; nv.job = null; nv.pre = null; nv.preSeq = null; nv.busy = false; nv.seq = null; nv.i = 0; nv.stage = -1; nv.wait = 0; };
  // decide(st, budgetMs): with a budget the search is spread over several calls and null is returned while it is still thinking (the game does not step then)
  nv.job = null; nv.busy = false;
  // Priority order: generator plan replay, mushroom pickup, shell boss, boss arena (reactive), cached macro sequence, then a new stage search.
  nv.decide = function (st, budgetMs) {
    var L = st.L;
    // the generator's own plan (trajectory-first stages): follow the recorded inputs while the hero is exactly where the plan expects him; otherwise the normal search takes over
    // Follow the recorded inputs while the hero is exactly on the recorded path; one deviation abandons the plan for good (planBad).
    if (L.plan && !nv.planBad && st.f < L.plan.length) {
      var ex = L.planPos[st.f];
      if (ex && Math.abs(ex[0] - st.p.x) < 0.6 && Math.abs(ex[1] - st.p.y) < 0.6) return L.plan[st.f];
      nv.planBad = true;
    }
    // Chain castles: after a fall to a lower ledge the route resumes from that ledge (the stage counter would otherwise point at a waypoint far above)
    if (L.vgoal && st.p.ground && st.stage > 0) { var rgs = L.route[Math.min(st.stage, L.route.length - 1)], hxs = st.p.x + 6, hys = st.p.y + 7;
      if (Math.abs(rgs.x - hxs) + Math.abs(rgs.y - hys) > 260) for (var rj = st.stage - 1; rj >= 0; rj--) { var rw = L.route[rj]; if (Math.abs(rw.y - hys) < 10 && Math.abs(rw.x - hxs) < 70) { if (rj < st.stage - 1) { st.stage = rj; nv.seq = null; nv.job = null; } break; } } }
    // Mushroom attraction: a shrunken hero walks to a nearby mushroom pickup (hopping obstacles, running when far) before a boss fight.
    // (and a hero who lost his flame walks back to a spare flower when a fire-armoured boss is near: only fireballs hurt it)
    var wantK = st.p.mini ? 0 : -1;
    if (wantK < 0 && st.boss > 0 && st.p.pw !== 2) for (var fbi = 0; fbi < st.en.length; fbi++) { var fbe = st.en[fbi]; if (fbe.t === 8 && fbe.alive && fbe.imm && fbe.immKind === 'fire' && Math.abs(fbe.x - st.p.x) < 420) wantK = 1; }
    if (st.boss > 0 && wantK >= 0) for (var mi = 0; mi < st.it.length; mi++) { var mu = st.it[mi]; if (mu.alive && mu.k === wantK && mu.x > st.p.x - (wantK === 1 ? 260 : 90) && mu.x < st.p.x + (wantK === 1 ? 260 : 110) && Math.abs(mu.y - st.p.y) < (wantK === 1 ? 44 : 24) && st.p.ground) { nv.seq = null; nv.job = null; var mdx = mu.x + 6 - (st.p.x + st.p.w / 2); if (Math.abs(mdx) < 2) return 0; var mdir = mdx > 0 ? PF.IN.R : PF.IN.L, mc = Math.floor((mdx > 0 ? st.p.x + st.p.w + 2 : st.p.x - 2) / PF.TS), mr = Math.floor((st.p.y + st.p.h - 4) / PF.TS), mt = PF.tileAt(st, mc, mr); return mdir | (PF.SOL[mt] || PF.tileAt(st, mc, mr - 1) === 0 && PF.SOL[PF.tileAt(st, mc, mr + 1)] && false ? PF.IN.J : 0) | (Math.abs(mdx) > 24 ? PF.IN.RUN : 0); } }   // a shrunken hero must grow back before an arena fight: the mushroom at the entrance
    // The same wish when the pickup lies inside a '?' block (items are moved into blocks): walk under the unopened block and jump to hit it
    if (st.boss > 0 && (wantK >= 0 || st.p.pw === 0) && L.fixedBox && st.p.ground) { var bbx = -1, bbd = 1e9, bkey, wk = wantK >= 0 ? wantK : 0; for (bkey in L.fixedBox) { var bkk = L.fixedBox[bkey]; if (wk === 0 ? !(bkk === 0 || bkk === 1 || bkk === 2) : !(bkk === 1 || bkk === 2)) continue; var bpp = bkey.split(','), bcc = +bpp[0], brr = +bpp[1]; if (PF.tileAt(st, bcc, brr) !== PF.T.QP) continue; var bxx = bcc * PF.TS + 8, bdd = Math.abs(bxx - st.p.x - st.p.w / 2); if (bdd < bbd && bdd < (wk === 1 ? 260 : 130) && Math.abs(brr * PF.TS + 8 - st.p.y) < 90) { bbd = bdd; bbx = bxx; } }
      if (bbx >= 0) { nv.seq = null; nv.job = null; var bdx = bbx - (st.p.x + st.p.w / 2); if (Math.abs(bdx) < 3) return PF.IN.J; var bmc = Math.floor((bdx > 0 ? st.p.x + st.p.w + 2 : st.p.x - 2) / PF.TS), bmr = Math.floor((st.p.y + st.p.h - 4) / PF.TS); return (bdx > 0 ? PF.IN.R : PF.IN.L) | (PF.SOL[PF.tileAt(st, bmc, bmr)] && (st.f & 7) < 5 ? PF.IN.J : 0) | (Math.abs(bdx) > 24 ? PF.IN.RUN : 0); } }   // hop the steps on the way to the block
    // Winged hero: the macro stage search explodes (a flight can last for hundreds of frames), so the reactive look-ahead planner drives alone.
    if (st.p.wing > 0) { nv.seq = null; nv.job = null; return fb.decide(st); }
    // No route data: only the reactive planner can drive.
    if (!L.route || !PF.searchIter) return fb.decide(st);
    // Find an armoured boss that is close enough (or inside the arena) to switch to the shell-boss controller.
    var shellBoss = null;
    if (st.boss > 0) for (var bi = 0; bi < st.en.length; bi++) { var be = st.en[bi]; if (be.t === 8 && be.alive && be.imm && be.immKind === 'shell' && (L.arena ? PF.inArena(st) : be.x - st.p.x < 340) && (L.vgoal ? Math.abs(be.x - st.p.x) < 300 : st.p.x - be.x < 300)) shellBoss = be; }
    nv.sb = !!shellBoss;   // armoured boss: from the arena entrance on
    if (shellBoss) return shellBossMask(st, shellBoss, fb);   // armoured boss: only kicked shells hurt it
    // Boss arenas (and boss-rush levels): drop any macro plan, the reactive planner handles the fight.
    if (st.boss > 0 && ((bossNear(st) && (!L.arena || L.vgoal || st.p.x > L.arena.c0 * PF.TS - 90)) || (L.vgoal && PF.inArena(st)) || nv.job === null && L.kind === 'bossrush')) { nv.seq = null; nv.job = null; return fb.decide(st); }   // boss arenas: the reactive look-ahead planner dodges and stomps   // boss arenas: the reactive look-ahead planner dodges and stomps
    // Keep playing the macro sequence found for the current stage.
    if (nv.seq && nv.i < nv.seq.length && (nv.stage === st.stage || (L.snow && !st.p.ground))) { pipe(st); return nv.seq[nv.i++]; }   // frost levels: a stage that completes in mid-air (the ice forms during the jump) does not cut the jump short
    nv.seq = null;
    // Rope gap: the pumping controller (PF.ropeSolve: jump, grab with Up, pump with the swing, release when a look-ahead lands on the far ledge) plans the whole crossing on a clone of the live state.
    var rg0 = L.route[Math.min(st.stage, L.route.length - 1)];
    if (rg0.k === 'ropeDone' && PF.ropeSolve && (st.p.ground || st.p.rope)) {
      nv.job = null; var rsl = PF.ropeSolve(st, rg0, 220, 5);
      if (!rsl && st.p.ground && (nv.rw = (nv.rw | 0) + 1) < 10) { nv.seq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; nv.i = 0; nv.stage = st.stage; return 0; }   // falling coconuts / creatures spoil every crossing right now: wait for a quieter moment
      if (!rsl) { var rcq = PF.clone(st); rcq.en = []; rcq.noEn = true; rsl = PF.ropeSolve(rcq, rg0, 220); }   // creatures in the way: still try the crossing as if they were not there
      if (rsl && rsl.seq.length) { nv.rw = 0; nv.st.plans++; nv.seq = rsl.seq; nv.i = 0; nv.stage = st.stage; return nv.seq[nv.i++]; }
      nv.st.fails++; nv.seq = []; for (var rk = 0; rk < 14; rk++) nv.seq.push(rk < 10 ? PF.IN.L : 0); nv.i = 0; nv.stage = st.stage; return nv.seq[nv.i++];   // no crossing from here: step back a little and try again
    }
    // A search prepared while the previous sequence was playing (see pipe): adopt it when the hero is exactly where it was predicted to be.
    if (nv.pre) { var pre = nv.pre; nv.pre = null; if (!nv.job && samePred(pre.pred, st) && !(nv.wait > 0)) { if (pre.hint) { nv.st.plans++; nv.st.hints = (nv.st.hints | 0) + 1; nv.seq = pre.hint; nv.i = 0; nv.stage = st.stage; return nv.seq[nv.i++]; } nv.job = pre.job; } }
    // Start a new stage search; while waiting (nv.wait) or airborne the reactive planner drives instead.
    if (!nv.job) {
      if (nv.wait > 0 || !onBase(st)) { if (nv.wait > 0) nv.wait--; return fb.decide(st); }
      var mj = makeJob(st);
      if (mj.hint) { nv.st.plans++; nv.st.hints = (nv.st.hints | 0) + 1; nv.seq = mj.hint; nv.i = 0; nv.stage = st.stage; return nv.seq[nv.i++]; }
      nv.job = mj.job;
    }
    // Run the current tier in slices; with a time budget return null (busy) when it is used up, so the game waits; on failure move to the next tier.
    var jb = nv.job, t0 = Date.now(), res;
    while (!jb.fin) { advance(jb, budgetMs ? 4 : 1e9); if (!jb.fin && budgetMs && Date.now() - t0 >= budgetMs) { nv.busy = true; nv.st.ms += Date.now() - t0; return null; } }
    res = jb.res;
    nv.st.ms += Date.now() - t0; nv.busy = false; nv.job = null;
    // Plan found: store the macro sequence and play its first key.
    if (res && res.seq.length) { nv.st.plans++; nv.seq = res.seq; nv.i = 0; nv.stage = st.stage; return nv.seq[nv.i++]; }
    // Plain stage failed: let the reactive planner drive for 60 frames, then retry.
    if (jb.plain) { nv.st.fails++; nv.wait = 60; return fb.decide(st); }
    nv.st.fails++; nv.fl = (nv.fl || 0) + 1; if (nv.fl % 3 !== 0) { nv.seq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; nv.i = 0; nv.stage = st.stage; return 0; }   // brake and search again from a standing start; every third failure lets the look-ahead planner move
    // Fallback after failure: reactive planner for 30 frames, then try again.
    nv.wait = 30; return fb.decide(st);
  };
  return nv;
}
// Public API.
root.PFPlanner = { make: makeNavigator, plain: makePlanner, hint: makeHint, CANDS: CANDS, LEFT_EXTRA: LEFT_EXTRA, H: H, evaluate: evaluate, inputAt: inputAt };
})(typeof window !== 'undefined' ? window : globalThis);
