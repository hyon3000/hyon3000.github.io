// Snake.io-style simulation, shared by the 2D (D=2) and 3D (D=3) versions: continuous movement, limited turn rate,
// segments follow the head, head-vs-other-body kills, orbs, computer snakes (bots) and the policy used by bots / auto / hint.
(function () {
'use strict';
const NAMES = ['Nova', 'Rex', 'Mochi', 'Viper', 'Luna', 'Pixel', 'Zed', 'Bolt', 'Kiwi', 'Ember', 'Orbit', 'Sunny', 'Mamba', 'Echo', 'Jinx', 'Tofu'];
const CONF = {
  2: { size: 2400, speed: 150, boostMul: 2, omega: 3.4, orbTarget: 420, maxOrbs: 800, bots: 8, rb: 7, rk: 1.2, spaceK: 0.6, near: 1.0 },
  3: { size: 1200, speed: 150, boostMul: 2, omega: 3.4, orbTarget: 200, maxOrbs: 420, bots: 7, rb: 11, rk: 1.8, spaceK: 0.7, near: 1.0 }
};
const AUTO_P = { near: 520, look: 230, margin: 14, soft: 170, softW: 130, orbW: 40, centerW: 45, turnPen: 4, noise: 0, perc: 700, boostMass: 40 };
const BOT_P = { near: 400, look: 150, margin: 4, soft: 90, softW: 80, orbW: 40, centerW: 45, turnPen: 3, noise: 8, perc: 450, boostMass: 30, period: 0.22 };

function make(opts) {
  const D = opts.D, K = Object.assign({}, CONF[D], opts.conf || {}), W = K.size, rng = opts.rng || Math.random;
  const sim = { D, W, K, snakes: [], orbs: [], time: 0, ticks: 0, player: null, events: [], rng, nextId: 1, stats: { maxDepthChange: 0, deaths: 0 }, AUTO_P, BOT_P };

  const dot = function (a, b) { let s = 0; for (let i = 0; i < D; i++) s += a[i] * b[i]; return s; };
  const norm = function (a) { let l = Math.sqrt(dot(a, a)); if (l < 1e-12) { a[0] = 1; for (let i = 1; i < D; i++) a[i] = 0; return a; } for (let i = 0; i < D; i++) a[i] /= l; return a; };
  const dist2 = function (a, b) { let s = 0; for (let i = 0; i < D; i++) { const d = a[i] - b[i]; s += d * d; } return s; };
  const cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
  sim.dot = dot; sim.norm = norm; sim.cross = cross;

  sim.radius = function (m) { return K.rb + K.rk * Math.sqrt(m); };
  sim.nseg = function (m) { return Math.floor(6 + 5.5 * Math.sqrt(m)); };
  sim.omegaOf = function (m) { return K.omega / (1 + m / 600); };
  function randDir() { const v = []; for (let i = 0; i < D; i++) v.push(rng() * 2 - 1); if (D === 3) { /* rejection for uniformity */ let l = dot(v, v); while (l > 1 || l < 0.01) { for (let i = 0; i < D; i++) v[i] = rng() * 2 - 1; l = dot(v, v); } } return norm(v); }
  sim.randDir = randDir;

  function freeSpot(minD) {
    let best = null, bd = -1;
    for (let t = 0; t < 40; t++) {
      const p = []; for (let i = 0; i < D; i++) p.push(W * (0.12 + 0.76 * rng()));
      let md = 1e9;
      for (const o of sim.snakes) { if (!o.alive) continue; for (let j = 0; j < o.seg.length; j += 2) { const d = dist2(p, o.seg[j]); if (d < md) md = d; } }
      md = Math.sqrt(md);
      if (md > minD) return p;
      if (md > bd) { bd = md; best = p; }
    }
    return best;
  }
  sim.freeSpot = freeSpot;

  function addOrb(p, v, hue) {
    if (sim.orbs.length >= K.maxOrbs) { /* drop the oldest small orb */ for (let i = 0; i < sim.orbs.length; i++) if (sim.orbs[i].v < 2.5) { sim.orbs.splice(i, 1); break; } if (sim.orbs.length >= K.maxOrbs) sim.orbs.shift(); }
    sim.orbs.push({ p: p, v: v, hue: hue, id: sim.nextId++ });
  }
  sim.addOrb = addOrb;
  function ambientOrb() { const p = []; for (let i = 0; i < D; i++) p.push(40 + (W - 80) * rng()); addOrb(p, 1, Math.floor(rng() * 12)); }

  function spawnSnake(s, mass) {
    const p = freeSpot(D === 2 ? 320 : 220), h = randDir();
    // keep away from the walls: aim to the centre
    const c = []; for (let i = 0; i < D; i++) c.push(W / 2 - p[i]); const cn = norm(c.slice()); for (let i = 0; i < D; i++) h[i] = h[i] * 0.4 + cn[i] * 0.6; norm(h);
    s.p = p; s.h = h; s.mass = mass; s.r = sim.radius(mass); s.alive = true; s.boost = false; s.boostAcc = 0; s.tw = null; s.fwd = null; s.respawnAt = 0; s.ai = { next: 0, atk: 0 };
    s.seg = []; const sp = s.r * K.spaceK, n = sim.nseg(mass);
    for (let i = 0; i < n; i++) { const q = []; for (let a = 0; a < D; a++) q.push(p[a] - h[a] * sp * i); s.seg.push(q); }
    s.born = sim.time;
    return s;
  }
  function newSnake(bot, hue, name) {
    const s = { id: sim.nextId++, bot: bot, hue: hue, name: name, kills: 0, score: 0, alive: false, seg: [], p: null, h: null, mass: 10, r: 8 };
    sim.snakes.push(s); return s;
  }
  sim.spawnPlayer = function () {
    let s = sim.player;
    if (!s) { s = sim.player = newSnake(false, 0, 'YOU'); }
    s.kills = 0; spawnSnake(s, 10); sim.stats.maxDepthChange = 0; return s;
  };
  sim.reset = function () {
    sim.snakes = []; sim.orbs = []; sim.player = null; sim.time = 0; sim.ticks = 0; sim.events = [];
    for (let i = 0; i < K.orbTarget; i++) ambientOrb();
    for (let i = 0; i < K.bots; i++) { const s = newSnake(true, 1 + (i % 11), NAMES[i % NAMES.length]); spawnSnake(s, 10 + rng() * 30); s.ai.next = rng() * 0.3; }
  };

  function turnToward(s, t, dt) {
    const h = s.h, om = sim.omegaOf(s.mass) * dt;
    if (D === 2) {
      const cr = h[0] * t[1] - h[1] * t[0], dt_ = h[0] * t[0] + h[1] * t[1];
      let a = Math.atan2(cr, dt_); if (a > om) a = om; else if (a < -om) a = -om;
      const c = Math.cos(a), sn = Math.sin(a), x = h[0] * c - h[1] * sn, y = h[0] * sn + h[1] * c; h[0] = x; h[1] = y; norm(h); return;
    }
    const f = s.fwd;
    if (!f) {            // free 3D turn (bots)
      const ax = cross(h, t), l = Math.sqrt(dot(ax, ax)), d = dot(h, t);
      if (l < 1e-9) { if (d > 0) return; /* opposite: pick any perpendicular */ const u = Math.abs(h[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const a2 = norm(cross(h, u)); rot(h, a2, Math.min(om, Math.PI)); return; }
      let a = Math.atan2(l, d); if (a > om) a = om; for (let i = 0; i < 3; i++) ax[i] /= l; rot(h, ax, a); return;
    }
    // steering restricted to the plane perpendicular to the camera depth direction f: rotate about f, so h.f never changes
    const hf = dot(h, f), tf = dot(t, f), hp = [h[0] - hf * f[0], h[1] - hf * f[1], h[2] - hf * f[2]], tp = [t[0] - tf * f[0], t[1] - tf * f[1], t[2] - tf * f[2]];
    const lh = Math.sqrt(dot(hp, hp)), lt = Math.sqrt(dot(tp, tp));
    if (lh < 1e-4 || lt < 1e-4) return;
    const cr = cross(hp, tp); let a = Math.atan2(dot(f, cr), dot(hp, tp)); if (a > om) a = om; else if (a < -om) a = -om;
    rot(h, f, a);
    if (s === sim.player) { const ch = Math.abs(dot(h, f) - hf); if (ch > sim.stats.maxDepthChange) sim.stats.maxDepthChange = ch; }
  }
  function rot(h, ax, a) {   // Rodrigues, in place
    const c = Math.cos(a), sn = Math.sin(a), k = cross(ax, h), kd = dot(ax, h);
    for (let i = 0; i < 3; i++) h[i] = h[i] * c + k[i] * sn + ax[i] * kd * (1 - c);
    norm(h);
  }

  function kill(s, killer, why) {
    s.alive = false; sim.stats.deaths++;
    const n = s.seg.length, v = Math.max(1.2, s.mass * 0.8 / Math.max(1, n / 2));
    for (let i = 0; i < n; i += 2) { const q = s.seg[i].slice(); for (let a = 0; a < D; a++) q[a] = Math.min(W - 5, Math.max(5, q[a] + (rng() - 0.5) * s.r)); addOrb(q, v, s.hue); }
    if (killer) { killer.kills++; }
    s.respawnAt = sim.time + 2.5 + rng() * 2.5;
    sim.events.push({ type: 'death', id: s.id, snake: s, killer: killer, why: why });
  }

  sim.step = function (dt) {
    sim.time += dt; sim.ticks++;
    const snakes = sim.snakes;
    for (let si = 0; si < snakes.length; si++) {
      const s = snakes[si];
      if (!s.alive) { if (s.bot && sim.time >= s.respawnAt) { spawnSnake(s, 10 + rng() * 15); } continue; }
      if (s.bot && sim.time >= s.ai.next) {
        const d = aiDecide(sim, s, BOT_P); s.tw = d.tw; s.boost = d.boost; s.ai.next = sim.time + BOT_P.period * (0.7 + 0.6 * rng());
      }
      if (s.tw) turnToward(s, s.tw, dt);
      let sp = K.speed;
      if (s.boost && s.mass > 12) {
        sp *= K.boostMul; s.mass -= 3 * dt; s.boostAcc += dt;
        if (s.boostAcc > 0.17) { s.boostAcc = 0; const t = s.seg[s.seg.length - 1].slice(); addOrb(t, 0.5, s.hue); }
      } else s.boostAcc = 0;
      s.r = sim.radius(s.mass);
      for (let a = 0; a < D; a++) s.p[a] += s.h[a] * sp * dt;
      // head -> seg[0]
      const sg = s.seg, spc = s.r * K.spaceK;
      for (let a = 0; a < D; a++) sg[0][a] = s.p[a];
      const n = sim.nseg(s.mass);
      while (sg.length < n) sg.push(sg[sg.length - 1].slice());
      while (sg.length > n) sg.pop();
      for (let i = 1; i < sg.length; i++) {
        const q = sg[i], pr = sg[i - 1]; let l2 = 0; for (let a = 0; a < D; a++) { const d = pr[a] - q[a]; l2 += d * d; }
        if (l2 > spc * spc) { const l = Math.sqrt(l2), f = (l - spc) / l; for (let a = 0; a < D; a++) q[a] += (pr[a] - q[a]) * f; }
      }
      // walls
      let dead = false; for (let a = 0; a < D; a++) if (s.p[a] < s.r * 0.5 || s.p[a] > W - s.r * 0.5) dead = true;
      if (dead) { kill(s, null, 'wall'); continue; }
      // eat
      const er = s.r * 1.5 + 4, pr2 = (s.r * 3 + 30) * (s.r * 3 + 30);
      const orbs = sim.orbs;
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i], d2 = dist2(o.p, s.p);
        if (d2 < pr2) {
          const orr = er + 2 * Math.sqrt(o.v);
          if (d2 < orr * orr) { s.mass += o.v; orbs[i] = orbs[orbs.length - 1]; orbs.pop(); continue; }
          const d = Math.sqrt(d2), pull = 160 * dt / d; for (let a = 0; a < D; a++) o.p[a] += (s.p[a] - o.p[a]) * pull;
        }
      }
    }
    // head vs other snakes' bodies (segment 0 = their head is passable)
    for (let si = 0; si < snakes.length; si++) {
      const s = snakes[si]; if (!s.alive) continue;
      let hit = null;
      for (let oi = 0; oi < snakes.length && !hit; oi++) {
        const o = snakes[oi]; if (o === s || !o.alive) continue;
        const lim = (s.r + o.r) * 0.8, l2 = lim * lim, sg = o.seg;
        for (let j = 1; j < sg.length; j++) { if (dist2(s.p, sg[j]) < l2) { hit = o; break; } }
      }
      if (hit) kill(s, hit, 'body');
    }
    // keep the ambient orb population up
    let amb = sim.orbs.length, add = 0; while (amb < K.orbTarget && add < 4) { ambientOrb(); amb++; add++; }
  };

  sim.leaders = function (n) { return snakes_alive().sort(function (a, b) { return b.mass - a.mass; }).slice(0, n); };
  function snakes_alive() { return sim.snakes.filter(function (s) { return s.alive; }); }

  sim.reset();
  return sim;
}

// ---- policy (bots, auto, hint) ----
function aiDecide(sim, s, P) {
  const D = sim.D, W = sim.W, p = s.p, h = s.h, r = s.r, rng = sim.rng, dot = sim.dot, norm = sim.norm;
  const nq = [], nr = [], R2 = P.near * P.near;
  let threat = false;
  for (const o of sim.snakes) {
    if (o === s || !o.alive) continue;
    const hd = Math.sqrt((function () { let t = 0; for (let a = 0; a < D; a++) { const d = o.p[a] - p[a]; t += d * d; } return t; })());
    if (hd < 200) threat = true;
    for (let j = 0; j < o.seg.length; j++) {
      const q = o.seg[j]; let d2 = 0; for (let a = 0; a < D; a++) { const d = q[a] - p[a]; d2 += d * d; }
      if (d2 < R2) { nq.push(q); nr.push(o.r); }
    }
    if (hd < P.near) for (let t = 1; t <= 3; t++) { const q = []; for (let a = 0; a < D; a++) q.push(o.p[a] + o.h[a] * sim.K.speed * 0.3 * t); nq.push(q); nr.push(o.r); }
  }
  // candidate directions
  const cands = [];
  if (D === 2) { for (let k = -15; k <= 15; k++) { const a = k * 0.2, c = Math.cos(a), sn = Math.sin(a); cands.push([h[0] * c - h[1] * sn, h[0] * sn + h[1] * c]); } }
  else {
    const u0 = Math.abs(h[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], u = norm(sim.cross(h, u0)), v = sim.cross(h, u);
    cands.push(h.slice());
    const rings = [[0.25, 5], [0.55, 8], [0.9, 10], [1.3, 12], [1.8, 12]];
    for (const rg of rings) for (let k = 0; k < rg[1]; k++) { const ph = k * 2 * Math.PI / rg[1] + rg[0], ct = Math.cos(rg[0]), st = Math.sin(rg[0]), cp = Math.cos(ph), sp = Math.sin(ph); cands.push([h[0] * ct + (u[0] * cp + v[0] * sp) * st, h[1] * ct + (u[1] * cp + v[1] * sp) * st, h[2] * ct + (u[2] * cp + v[2] * sp) * st]); }
  }
  // attraction: orbs (sum of unit vectors weighted), or an intercept point for attacking bots
  const att = new Array(D).fill(0); let natt = 0, bigNear = false;
  const per2 = P.perc * P.perc;
  for (const o of sim.orbs) {
    let d2 = 0; for (let a = 0; a < D; a++) { const d = o.p[a] - p[a]; d2 += d * d; }
    if (d2 > per2) continue;
    { let nearWall = false; for (let a = 0; a < D; a++) if (o.p[a] < W / 14 || o.p[a] > W - W / 14) nearWall = true; if (nearWall) continue; }
    const d = Math.sqrt(d2) + 1e-6, w = (o.v + 0.3) / ((d + 40) * (d + 40));
    for (let a = 0; a < D; a++) att[a] += (o.p[a] - p[a]) / d * w;
    natt++;
    if (o.v >= 2.5 && d < 320 && dot(h, att) > -1) bigNear = true;
  }
  if (s.bot && sim.player && sim.player.alive && P.period) {
    const pl = sim.player; let d2 = 0; for (let a = 0; a < D; a++) { const d = pl.p[a] - p[a]; d2 += d * d; }
    const d = Math.sqrt(d2);
    if (s.ai.atk <= sim.time && d < 650 && s.mass > pl.mass * 0.8 && rng() < 0.012) s.ai.atk = sim.time + 2.2;
    if (s.ai.atk > sim.time) { natt = 1; const lead = d * 0.5 + 90; let l = 0; for (let a = 0; a < D; a++) { att[a] = pl.p[a] + pl.h[a] * lead - p[a]; l += att[a] * att[a]; } l = Math.sqrt(l) + 1e-6; for (let a = 0; a < D; a++) att[a] /= l; bigNear = d > 220 && s.mass > 25; }
  }
  let attN = null; if (natt) { const l = Math.sqrt(dot(att, att)); if (l > 0) attN = att.map(function (x) { return x / l; }); }
  const uc = []; let dc = 0; for (let a = 0; a < D; a++) { const d = W / 2 - p[a]; uc.push(d); dc += d * d; } dc = Math.sqrt(dc); for (let a = 0; a < D; a++) uc[a] /= (dc + 1e-6);
  const cfrac = Math.max(0, dc / (W / 2) - 0.3) * 1.5;
  const om = sim.omegaOf(s.mass), spd = sim.K.speed * (s.boost && s.mass > 12 ? sim.K.boostMul : 1);
  const WALL = Math.max(W / 12, 3 * sim.K.speed / om), KS = 14, Tn = Math.min(3, 1.0 + 1.6 / om), ds = Tn / KS;
  let best = cands[0], bc = 1e18;
  const pos = new Array(D), hh = new Array(D), ax = new Array(D);
  for (const d of cands) {
    let c = 0;
    // total turn angle (+ rotation axis in 3D)
    const cs = Math.min(1, Math.max(-1, dot(d, h))); let ang = Math.acos(cs), sg = 1;
    if (D === 2) { sg = (h[0] * d[1] - h[1] * d[0]) < 0 ? -1 : 1; }
    else { const cr = sim.cross(h, d); let l = Math.sqrt(dot(cr, cr)); if (l < 1e-9) { const u0 = Math.abs(h[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const cc = sim.cross(h, u0); l = Math.sqrt(dot(cc, cc)); for (let i = 0; i < 3; i++) ax[i] = cc[i] / l; } else for (let i = 0; i < 3; i++) ax[i] = cr[i] / l; }
    for (let a = 0; a < D; a++) pos[a] = p[a];
    for (let k = 1; k <= KS; k++) {
      const turned = Math.min(ang, om * ds * k), ct = Math.cos(turned), st = Math.sin(turned) * sg;
      if (D === 2) { hh[0] = h[0] * ct - h[1] * st; hh[1] = h[0] * st + h[1] * ct; }
      else { const kx = sim.cross(ax, h); for (let a = 0; a < 3; a++) hh[a] = h[a] * ct + kx[a] * Math.sin(turned); }
      for (let a = 0; a < D; a++) pos[a] += hh[a] * spd * ds;
      const wgt = 1 / (1 + k * 0.12);
      for (let a = 0; a < D; a++) {
        const m = Math.min(pos[a] - r * 0.5, W - r * 0.5 - pos[a]);
        if (m < 0) c += 900 * wgt; else if (m < WALL) { const q = 1 - m / WALL; c += 260 * wgt * q * q; }
      }
      for (let i = 0; i < nq.length; i++) {
        const sq = nq[i]; let d2 = 0; for (let a = 0; a < D; a++) { const e = sq[a] - pos[a]; d2 += e * e; }
        const lim = (r + nr[i]) * 0.8 + P.margin;
        if (d2 < (lim + P.soft) * (lim + P.soft)) { const dd = Math.sqrt(d2); if (dd < lim) c += 700 * wgt; else { const q = 1 - (dd - lim) / P.soft; c += P.softW * wgt * q * q; } }
      }
    }
    c += ang * P.turnPen;
    if (attN) c -= P.orbW * dot(d, attN);
    if (cfrac > 0) c -= P.centerW * cfrac * dot(d, uc);
    if (P.noise) c += rng() * P.noise;
    if (c < bc) { bc = c; best = d; }
  }
  const boost = (s.mass > P.boostMass) && ((bc < 30 && threat && rng() < 0.4) || (bigNear && bc < 20 && (s.bot ? rng() < 0.5 : true)));
  return { tw: best, boost: !!boost, cost: bc };
}
window.SnakeSim = { make, aiDecide, NAMES, AUTO_P, BOT_P };
})();
