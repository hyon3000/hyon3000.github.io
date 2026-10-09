// Auto play (Help > Cheat > Solve Automatically, F3) for the pinball page: a policy trained with reinforcement learning (PPO, training/).
// What it sees is only the ball position (x, y; the velocity is the difference of consecutive positions) and the score, which are read from the
// game's memory (the wasm heap of the web build) - the compiled game has no state API.  The addresses below belong to ONE build of
// https://pinball.alula.me/ ; PinballAI.check() verifies invariants (ball height z in 0.2..4 (0.3 on the table, higher on ramps), two copies of the score agree, ball counter 1..3, ball inside the table)
// and the page falls back to the simple vision bot when they do not hold.
(function () {
  // The addresses move with the page (heap layout depends on canvas size etc.: the harness and the real page differ by 176 bytes), so the ball record is FOUND at run time:
  // three float32 x, y, z (z = 0.3 = ball radius on the table), then the direction (unit vector), the speed.  The score (int32, two copies) and the ball number (1..3) sit at fixed offsets from it.
  var STEP_MS = 4 * 1000 / 60;                                                       // one decision every 4 game frames (1/60 s each)
  var OFF = { SCORE: -560, SCORE2: 30940, CTR: 31356, TILT: -280 };       // TILT: int32 flag, 1 while the table is tilted (flippers dead) until the ball is lost
  function locate(M) {
    var f = M.HEAPF32, I = M.HEAP32, z = Math.fround(0.3), n = f.length - 8, hits = [];
    for (var i = 0; i < n; i++) {
      if (f[i + 2] !== z) continue;
      var x = f[i], y = f[i + 1]; if (!(Math.abs(x) < 9 && Math.abs(y) < 14)) continue;
      var d = f[i + 3] * f[i + 3] + f[i + 4] * f[i + 4] + f[i + 5] * f[i + 5], sp = f[i + 6]; if (!(Math.abs(d - 1) < 1e-2 && sp >= 0 && sp < 200)) continue;
      var b = i * 4, a = { BALL: b, SCORE: b + OFF.SCORE, SCORE2: b + OFF.SCORE2, CTR: b + OFF.CTR, TILT: b + OFF.TILT };
      if (a.SCORE < 0 || a.CTR + 4 > M.HEAPU8.length) continue;
      if (sane(read(M, a))) hits.push(a);
    }
    return hits.length === 1 ? hits[0] : null;
  }
  function read(M, A) {
    var f = M.HEAPF32, i = M.HEAP32, b = A.BALL >> 2;
    return { x: f[b], y: f[b + 1], z: f[b + 2], score: i[A.SCORE >> 2], score2: i[A.SCORE2 >> 2], ctr: i[A.CTR >> 2], tilt: i[A.TILT >> 2] };
  }
  function sane(s) {
    return isFinite(s.x) && isFinite(s.y) && Math.abs(s.x) < 9 && Math.abs(s.y) < 15 && s.z > 0.2 && s.z < 4 && s.score >= 0 && s.score < 1e9 && s.score === s.score2 && s.ctr >= 1 && s.ctr <= 3 && (s.tilt === 0 || s.tilt === 1);
  }
  function present(s) { return !(s.x === 0 && s.y === 0); }
  function inLane(s) { return s.x < -6.9 && s.y > 9.5; }                               // the plunger lane at the bottom right
  // ---- features: ball x, y, the last two velocity steps, previous action (one-hot of 4), score gained during the last decision ----
  var NOBS = 17, VS = 1 / 2.5;
  // ---- rule layer ("do not pump while the ball is cradled"): in the flipper zone with the ball nearly at rest the flippers are released and nudges are off until it rolls (or, after 2.5 s,
  // ONE kick flip knocks it loose); outside the hit range keys keep a minimum hold (press 3 decisions, release 2).  The same mask is applied in training and in the page. ----
  var ZONE_Y = 8, REST = 0.12, KICK_MS = 2500;
  function inZone(x, y) { return y > ZONE_Y && x > -6.5; }
  function atRest(hp) { if (hp.length < 4) return false; var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (var i = 0; i < 4; i++) { x0 = Math.min(x0, hp[i][0]); x1 = Math.max(x1, hp[i][0]); y0 = Math.min(y0, hp[i][1]); y1 = Math.max(y1, hp[i][1]); } return Math.max(x1 - x0, y1 - y0) < REST; }
  function Driver(M, keyfn, addr) {
    this.M = M; this.key = keyfn; this.A = addr; this.nTotal = 0; this.nTypes = [0, 0, 0, 0]; this.reset();
  }
  var P = Driver.prototype;
  P.reset = function () {
    this.holdEnd = 0; this.stillT = 0; this.pf = null; this.pt = 0; this.live = false; this.ld = 0; this.h = []; this.act = 0; this.dsc = 0; this.lastScore = 0; this.idleT = 0; this.k = { L: 0, R: 0, S: 0 }; this.nudgeUp = 0; this.nudgeKey = null; this.lastNudge = -1e9; this.nn = 0; this.now = 0; this.tilted = 0; this.hp = []; this.hl = 99; this.hr = 99; this.cradleT = 0; this.kickN = 0; this.kickEnd = 0; this.cradled = 0; this.mask = [1, 1, 1, 1, 1, 1, 1, 1];
  };
  P.setKey = function (name, down) {
    if (this.k[name] === (down ? 1 : 0)) return; this.k[name] = down ? 1 : 0;
    var t = down ? 'keydown' : 'keyup';
    if (name === 'L') this.key(t, 'KeyZ', 90, 'z'); else if (name === 'R') this.key(t, 'Slash', 191, '/'); else this.key(t, 'Space', 32, ' ');
  };
  P.apply = function (a) { this.act = a; if (((a & 1) ? 1 : 0) !== this.k.L) this.hl = 0; if (((a & 2) ? 1 : 0) !== this.k.R) this.hr = 0; this.setKey('L', a & 1); this.setKey('R', a & 2); };           // 0 none, 1 left, 2 right, 3 both
  // nudge n: 1 up (bottom bump, ArrowUp), 2 left (X), 3 right (.): a short key tap (down now, up 2 frames later)
  var NK = [null, ['ArrowUp', 38, 'ArrowUp'], ['KeyX', 88, 'x'], ['Period', 190, '.']];
  P.nudge = function (n) {
    if (!n || this.nudgeUp || this.cradled) return; var k = NK[n]; this.key('keydown', k[0], k[1], k[2]); this.nudgeKey = k; this.nudgeUp = this.now + 34;
    this.lastNudge = this.now; this.nn++; this.nTotal++; this.nTypes[n]++;
  };
  P.newGame = function () { this.setKey('L', 0); this.setKey('R', 0); this.setKey('S', 0); this.key('keydown', 'F2', 113, 'F2'); this.key('keyup', 'F2', 113, 'F2'); this.reset(); };
  // call once per game frame (before it runs) with the clock in ms.  Returns null, or a record {obs, score, done, over} when a decision is due (every STEP_MS: 4 frames at 60 fps;
  // done: the ball was just lost; over: the game is over), or {bad:1} when the memory does not look like the expected state
  P.tick = function (now) {
    var s = read(this.M, this.A), p = present(s), rec = null; this.now = now;
    if (this.nudgeUp && now >= this.nudgeUp) { this.nudgeUp = 0; this.key('keyup', this.nudgeKey[0], this.nudgeKey[1], this.nudgeKey[2]); }
    if (!sane(s)) return { bad: 1 };
    var sp = this.pf && p ? Math.hypot(s.x - this.pf[0], s.y - this.pf[1]) * 16.667 / Math.max(1, now - this.pt) : 9;     // displacement per 1/60 s
    this.pf = p ? [s.x, s.y] : null; this.pt = now;
    if (this.holdEnd) { if (now >= this.holdEnd) { this.holdEnd = 0; this.setKey('S', 0); } }
    else if (p && inLane(s) && sp < 0.02) { if (!this.stillT) this.stillT = now; else if (now - this.stillT >= 330) { this.stillT = 0; this.setKey('S', 1); this.holdEnd = now + 1200; } }    // the ball waits at the plunger: pull it back, release after 1.2 s (full strength)
    else this.stillT = 0;
    var inplay = p && !inLane(s) && !this.holdEnd;
    if (!p) {
      if (this.live) {                                         // the ball was lost
        this.live = false; this.setKey('L', 0); this.setKey('R', 0); this.act = 0;
        rec = { obs: null, score: s.score, done: 1, over: s.ctr >= 3 ? 1 : 0, nn: this.nn, tilt: this.tilted }; this.nn = 0; this.tilted = 0;
        this.h = []; this.hp = []; this.cradled = 0; this.hl = this.hr = 99;
      }
      return rec;
    }
    if (inplay) {
      if (s.tilt) this.tilted = 1;
      if (!this.live) { this.live = true; this.hp = []; this.cradled = 0; this.nn = 0; this.tilted = 0; this.lastNudge = -1e9; this.ld = 0; this.h = []; this.lastScore = s.score; this.idleT = now; }
      if (s.score !== this.lastScore) this.idleT = now; else if (now - this.idleT > 50000) { this.idleT = now; return { obs: this.obs(s), score: s.score, done: 1, over: 1, stuck: 1 }; }
      if (!this.ld || now - this.ld >= STEP_MS - 0.6) {
        this.ld = now;
        this.h.unshift([s.x, s.y]); if (this.h.length > 3) this.h.pop();
        this.dsc = s.score - this.lastScore; this.lastScore = s.score;
        this.guard(s, now);
        rec = { obs: this.obs(s), score: s.score, done: 0, over: 0, mask: this.mask, cradleMs: this.cradled ? now - this.cradleT : 0 };
      }
    }
    return rec;
  };
  // allowed actions for the next decision: mask[0..3] flipper combos (bit0 left, bit1 right), mask[4..7] nudge none/up/left/right
  P.guard = function (s, now) {
    this.hp.unshift([s.x, s.y]); if (this.hp.length > 6) this.hp.pop(); this.hl++; this.hr++;
    var zone = inZone(s.x, s.y), cr = zone && atRest(this.hp);
    if (cr && !this.cradled) { this.cradleT = now; this.kickN = 0; this.kickEnd = 0; }
    this.cradled = cr ? 1 : 0;
    var L = [1, 1], R = [1, 1], nud = 1, free = zone && !cr;                                        // free: the ball is in hit range, no hold limits
    var cL = this.k.L, cR = this.k.R;
    if (!free) { if (cL && this.hl < 3) L = [0, 1]; else if (!cL && this.hl < 2) L = [1, 0]; if (cR && this.hr < 3) R = [0, 1]; else if (!cR && this.hr < 2) R = [1, 0]; }
    if (cr) {
      L = [1, 0]; R = [1, 0]; nud = 0;                                                              // cradled: let the flippers down, no nudge
      if (this.kickN > 0 && this.kickN < 4) { var kl = s.x > 0; L = kl ? [0, 1] : [1, 0]; R = kl ? [1, 0] : [0, 1]; this.kickN++; }         // hold the kick flip for 3 decisions
      else if (this.kickN === 0 && now - this.cradleT > KICK_MS) { this.kickN = 1; var k2 = s.x > 0; L = k2 ? [0, 1] : [1, 0]; R = k2 ? [1, 0] : [0, 1]; this.kickEnd = now; }
      else if (this.kickN >= 4 && now - this.kickEnd > KICK_MS) { this.kickN = 0; this.cradleT = now - KICK_MS; }             // still balanced: another kick later
    }
    var m = [];
    for (var a = 0; a < 4; a++) m.push(L[a & 1] && R[(a >> 1) & 1] ? 1 : 0);
    this.mask = m.concat([1, nud, nud, nud]);
  };
  P.obs = function (s) {
    var h = this.h, a = h[0] || [s.x, s.y], b = h[1] || a, c = h[2] || b, o = new Float32Array(NOBS);
    o[0] = a[0] / 8; o[1] = a[1] / 12;
    o[2] = (a[0] - b[0]) * VS; o[3] = (a[1] - b[1]) * VS; o[4] = (b[0] - c[0]) * VS; o[5] = (b[1] - c[1]) * VS;
    o[6 + this.act] = 1; o[10] = Math.min(1, Math.max(0, this.dsc) / 2000); o[11] = Math.min(1, s.score / 300000);
    o[12] = Math.min(1, (this.now - this.lastNudge) / 10000); o[13] = Math.min(8, this.nn) / 8; o[14] = s.tilt ? 1 : 0; o[15] = this.cradled; o[16] = this.cradled ? Math.min(1, (this.now - this.cradleT) / 3000) : 0;
    return o;
  };
  // ---- the exported MLP: two tanh layers + policy head (same layout as atari/ai.js) ----
  function decode(m) {
    if (m.cache) return m.cache;
    var bin = atob(m.w), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var f = new Float32Array(u8.buffer), o = 0, take = function (k) { var a = f.subarray(o, o + k); o += k; return a; };
    var nh = m.heads[0], nn = m.heads[1], d = { obs: m.obs, hid: m.hid, nh: nh, nn: nn, w0: take(m.hid * m.obs), b0: take(m.hid), w1: take(m.hid * m.hid), b1: take(m.hid) };
    d.wp = take(nh * m.hid); d.bp = take(nh); d.wn = take(nn * m.hid); d.bn = take(nn); m.cache = d; return d;
  }
  function logits(d, x) {
    var h1 = new Float32Array(d.hid), h2 = new Float32Array(d.hid), out = new Float32Array(d.nh + d.nn), i, k, s, o;
    for (i = 0; i < d.hid; i++) { s = d.b0[i]; o = i * d.obs; for (k = 0; k < d.obs; k++) s += d.w0[o + k] * x[k]; h1[i] = Math.tanh(s); }
    for (i = 0; i < d.hid; i++) { s = d.b1[i]; o = i * d.hid; for (k = 0; k < d.hid; k++) s += d.w1[o + k] * h1[k]; h2[i] = Math.tanh(s); }
    for (i = 0; i < d.nh; i++) { s = d.bp[i]; o = i * d.hid; for (k = 0; k < d.hid; k++) s += d.wp[o + k] * h2[k]; out[i] = s; }
    for (i = 0; i < d.nn; i++) { s = d.bn[i]; o = i * d.hid; for (k = 0; k < d.hid; k++) s += d.wn[o + k] * h2[k]; out[d.nh + i] = s; }
    return out;
  }
  function sample(v) { var m = Math.max.apply(null, v), p = [], t = 0, i; for (i = 0; i < v.length; i++) { p[i] = Math.exp(v[i] - m); t += p[i]; } var r = Math.random() * t; for (i = 0; i < v.length; i++) { r -= p[i]; if (r <= 0) return i; } return v.length - 1; }
  function argmax(v) { var b = 0; for (var i = 1; i < v.length; i++) if (v[i] > v[b]) b = i; return b; }
  // the same rule for the vision bot: it only needs to know "is the ball cradled?"; update(now) returns 0 (free), 1 (cradled: no flipper / no nudge) or 2 (cradled for > 2.5 s: do ONE kick flip now)
  function Guard(M, addr) { this.M = M; this.A = addr; this.hp = []; this.t = 0; this.cT = 0; this.kT = 0; }
  Guard.prototype.update = function (now) {
    if (now - this.t < 60) return this.st || 0; this.t = now;
    var s = read(this.M, this.A); if (!sane(s) || !present(s)) { this.hp = []; this.cT = 0; return this.st = 0; }
    this.hp.unshift([s.x, s.y]); if (this.hp.length > 6) this.hp.pop();
    if (!(inZone(s.x, s.y) && atRest(this.hp))) { this.cT = 0; return this.st = 0; }
    if (!this.cT) { this.cT = now; this.kT = now; }
    this.side = s.x > 0 ? 'L' : 'R';
    if (now - this.kT > KICK_MS) { this.kT = now; return this.st = 2; }
    return this.st = 1;
  };
  window.PinballAI = {
    Guard: Guard,
    OFF: OFF, inZone: inZone, atRest: atRest, STEP_MS: STEP_MS, NOBS: NOBS, Driver: Driver, read: read, sane: sane, locate: locate,
    ready: function () { return !!window.PINBALL_AI; },
    // can the state be read from this build?  returns the addresses (or null) - only if exactly one record passes every invariant
    check: function (M) { try { return M && M.HEAPF32 && M.HEAP32 && M.HEAPU8.length > 1e6 ? locate(M) : null; } catch (e) { return null; } },
    // the policy was trained (and is evaluated) as a stochastic policy: both heads are SAMPLED (the nudge head puts ~90% on 'no nudge', so argmax would never nudge)
    policy: function (obs, mask) { var d = decode(window.PINBALL_AI), l = logits(d, obs); if (mask) for (var i = 0; i < l.length; i++) if (!mask[i]) l[i] = -1e9; return [sample(l.subarray(0, d.nh)), sample(l.subarray(d.nh))]; },      // [flipper combo 0..3, nudge 0..3]
    logits: function (obs) { return logits(decode(window.PINBALL_AI), obs); }
  };
})();
