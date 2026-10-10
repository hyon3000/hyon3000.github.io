// In-page rollout driver for training the Shape World auto player (called from train_rl.py through selenium).
// Rollouts run on the real JS simulation: the policy is evaluated here, the PPO / behaviour-cloning updates happen in PyTorch.
(function (root) {
'use strict';
var IN = PF.IN, D = PFAI.D, SKIP = 2;
var RL = { pool: [], rnd: PF.rng(1) };
function u8b64(a) { var s = '', CH = 0x8000; for (var i = 0; i < a.length; i += CH) s += String.fromCharCode.apply(null, a.subarray(i, i + CH)); return btoa(s); }
function f32b64(a) { return u8b64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); }
function fromB64(s) { var bin = atob(s), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u; }
// level pool: specs [{seed, n, kind?}]
RL.init = function (specs) { RL.pool = []; specs.forEach(function (sp) { var L = PF.generate(sp.seed, sp.n, sp.kind ? { kind: sp.kind } : undefined); if (L.valid) RL.pool.push({ L: L, seed: sp.seed, n: sp.n }); }); RL.rnd = PF.rng(specs.length * 7 + 3); return RL.pool.length; };
RL.setWeights = function (b64, h1, h2) { var u = fromB64(b64); PFAI.setWeights({ obs: D, h1: h1, h2: h2, out: 5, w: new Float32Array(u.buffer) }); };
function potential(st, tgt) { var p = st.p; return Math.abs(p.x + 6 - tgt[0]) + 1.5 * Math.abs(p.y + 7 - tgt[1]); }
function target(st) { var cb = st.L.crumbs; return cb && cb.length ? cb[Math.min(cb.length - 1, st.cr + 1)] : [st.L.goalX, st.L.poleY - 8]; }
function newEpisode() { var e = RL.pool[Math.floor(RL.rnd() * RL.pool.length)]; return { L: e.L, st: PF.newState(e.L), last: 0, frames: 0, bestF: 0, lastCr: 0, lastStage: 0 }; }
// one decision = SKIP frames with a constant key mask; returns reward and done flag
function envStep(ep, mask) {
  var st = ep.st, tg = target(st), d0 = potential(st, tg), cr0 = st.cr, sg0 = st.stage, co0 = st.coins, r = 0, done = 0, k;
  for (k = 0; k < SKIP; k++) { PF.step(st, mask); ep.frames++; if (st.p.dead || st.p.won) break; }
  var d1 = potential(st, tg); r += 0.02 * (d0 - d1) + 1.0 * (st.cr - cr0) + 4 * (st.stage - sg0) + 0.03 * (st.coins - co0) - 0.004;
  if (st.cr > ep.lastCr || st.stage > ep.lastStage) { ep.bestF = ep.frames; ep.lastCr = st.cr; ep.lastStage = st.stage; }
  if (st.p.won) { r += 20; done = 1; } else if (st.p.dead) { r -= 8; done = 1; } else if (ep.frames - ep.bestF > 700 || ep.frames > 60 * ep.L.time) { r -= 2; done = 1; }
  return [r, done];
}
function sampleAct(res, buf, explore) {   // Bernoulli keys; returns mask, key bits (L,R,RUN,J order) and log-prob
  var m = 0, bits = 0, lp = 0, KB = PFAI.KEYBITS;
  for (var i = 0; i < 4; i++) { var p = 1 / (1 + Math.exp(-res[i])); var on = RL.rnd() < p; if (on) { m |= KB[i]; bits |= 1 << i; } lp += Math.log(on ? p + 1e-8 : 1 - p + 1e-8); }
  if ((m & IN.L) && (m & IN.R)) { m &= ~IN.L; }
  return [m, bits, lp];
}
RL.rollout = function (steps) {
  var obsA = new Int8Array(steps * D), actA = new Uint8Array(steps), lpA = new Float32Array(steps), valA = new Float32Array(steps), rewA = new Float32Array(steps), doneA = new Uint8Array(steps), buf = new Float32Array(D), ep = newEpisode(), n = 0, wins = 0, deaths = 0, eps = 0, tr = 0;
  var lastVal = 0;
  while (n < steps) {
    PFAI.build(ep.st, buf); for (var i = 0; i < D; i++) obsA[n * D + i] = Math.round(buf[i] * 100);
    var res = PFAI.forward(buf), sa = sampleAct(res); actA[n] = sa[1]; lpA[n] = sa[2]; valA[n] = res[4];
    var rd = envStep(ep, sa[0]); rewA[n] = rd[0]; doneA[n] = rd[1]; n++; tr += rd[0];
    if (rd[1]) { eps++; if (ep.st.p.won) wins++; else if (ep.st.p.dead) deaths++; ep = newEpisode(); }
  }
  PFAI.build(ep.st, buf); lastVal = PFAI.forward(buf)[4];
  return { n: n, obs: u8b64(new Uint8Array(obsA.buffer)), act: u8b64(actA), lp: f32b64(lpA), val: f32b64(valA), rew: f32b64(rewA), done: u8b64(doneA), lastVal: lastVal, wins: wins, deaths: deaths, eps: eps, ret: tr };
};
// behaviour cloning data: the look-ahead planner plays (teacher); every decision is recorded
function episodeEnd(ep) { var st = ep.st; if (st.cr > ep.lastCr || st.stage > ep.lastStage) { ep.bestF = ep.frames; ep.lastCr = st.cr; ep.lastStage = st.stage; } return st.p.won || st.p.dead || ep.frames - ep.bestF > 700 || ep.frames > 60 * ep.L.time; }
RL.collectBC = function (steps, mixPolicy, beta) {
  var obsA = new Int8Array(steps * D), actA = new Uint8Array(steps), buf = new Float32Array(D), ep = newEpisode(), pl = PFPlanner.make(), n = 0, wins = 0, eps = 0, k = 0, KB = PFAI.KEYBITS;
  function bitsOf(m) { var b = 0; for (var i = 0; i < 4; i++) if (m & KB[i]) b |= 1 << i; return b; }
  function rec(bits) { for (var q = 0; q < D; q++) obsA[n * D + q] = Math.round(buf[q] * 100); actA[n] = bits; n++; }
  while (n < steps) {
    var st = ep.st, done = false;
    if (mixPolicy) {   // DAgger: the (partly) learned policy drives, the planner labels every 3rd state
      PFAI.build(st, buf); var res = PFAI.forward(buf), mp = PFAI.maskOf(res), mask = mp;
      if (RL.rnd() < 0.12) mp ^= KB[Math.floor(RL.rnd() * 4)]; mask = mp;
      if (k++ % 3 === 0) { var best = pl.search(st, 0), tm = PFPlanner.inputAt(best.cand, 0); rec(bitsOf(tm)); if (RL.rnd() < beta) mask = tm; }
      for (var f = 0; f < SKIP && !done; f++) { PF.step(st, mask); ep.frames++; if (st.p.dead || st.p.won) done = true; }
      done = episodeEnd(ep) || done;
    } else {           // plain behaviour cloning: the planner plays, every second frame is recorded
      var tmask = pl.decide(st); if (ep.frames % SKIP === 0) { PFAI.build(st, buf); rec(bitsOf(tmask)); }
      PF.step(st, tmask); ep.frames++; done = episodeEnd(ep);
    }
    if (done) { eps++; if (ep.st.p.won) wins++; ep = newEpisode(); pl.reset(); }
  }
  return { n: n, obs: u8b64(new Uint8Array(obsA.buffer)), act: u8b64(actA), wins: wins, eps: eps };
};
// evaluation on explicit (seed, n, kind) levels, one life: policy or planner
RL.eval = function (specs, who, maxFrames) {
  var out = [], buf = new Float32Array(D);
  specs.forEach(function (sp) {
    var L = PF.generate(sp.seed, sp.n, sp.kind ? { kind: sp.kind } : undefined), st = PF.newState(L), f = 0, won = false, pl = who === 'planner' ? PFPlanner.make() : PFAI.make(), t0 = performance.now(), bestF = 0, lastCr = 0, lastSt = 0;
    while (f < (maxFrames || 60 * L.time)) { PF.step(st, pl.decide(st)); f++; if (st.p.won) { won = true; break; } if (st.p.dead) break; if (st.cr > lastCr || st.stage > lastSt) { bestF = f; lastCr = st.cr; lastSt = st.stage; } if (f - bestF > 900) break; }
    out.push({ seed: sp.seed, n: sp.n, kind: L.kind, won: won, dead: st.p.dead ? st.p.why : '', frames: f, stage: st.stage, x: Math.round(st.p.x), ms: Math.round(performance.now() - t0) });
  });
  return out;
};
RL.pick = function (kind, seed0, count, lo, hi) { var out = []; for (var s = seed0; s < seed0 + count; s++) for (var n = lo; n <= hi; n++) if (PF.kindOf(s, n) === kind) { out.push({ seed: s, n: n }); break; } return out; };
root.RL = RL;
})(window);
