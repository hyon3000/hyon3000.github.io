// Bullet Shot - the rules of a fixed-step (60 Hz) vertical shooter; no DOM, so the same code runs in the page (game.js) and in the auto-player's look-ahead (ai.js).
//   s = Shooter.newState(seed);  Shooter.step(s, { l, r, f, tx })   (move left / right, fire, optional target x for pointer control)
// 40 enemies fly in on curved paths in five groups, settle into a swaying formation, and from time to time single enemies (or a boss with two escorts) dive at the player.
// s.sim = true switches off everything random that starts new threats (new dives, new shots) and the effects: used for look-ahead only.
(function (root) {
  'use strict';
  var W = 224, H = 288, PY = 262, SLOT_X0 = 40, SLOT_DX = 16, SLOT_Y0 = 44, SLOT_DY = 14;
  var BEE = 0, FLY = 1, BOSS = 2;
  var HP = [1, 1, 2], PF = [50, 80, 150], PD = [100, 160, 400];
  var M_WAIT = 0, M_ENTER = 1, M_FORM = 2, M_DIVE = 3, M_RET = 4;

  function rnd(s) {
    s.seed = (s.seed + 0x6D2B79F5) | 0;
    var t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function bez(a, b, c, d, u) {
    var v = 1 - u, k0 = v * v * v, k1 = 3 * v * v * u, k2 = 3 * v * u * u, k3 = u * u * u;
    return [k0 * a[0] + k1 * b[0] + k2 * c[0] + k3 * d[0], k0 * a[1] + k1 * b[1] + k2 * c[1] + k3 * d[1]];
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // formation layout: [type, col, row] in entry order (groups of eight)
  var LAYOUT = (function () {
    var o = [], c;
    for (c = 3; c <= 6; c++) o.push([BOSS, c, 0]);
    for (c = 1; c <= 8; c++) o.push([FLY, c, 1]);
    for (c = 1; c <= 8; c++) o.push([FLY, c, 2]);
    for (c = 0; c <= 9; c++) o.push([BEE, c, 3]);
    for (c = 0; c <= 9; c++) o.push([BEE, c, 4]);
    return o;
  })();

  function newState(seed) {
    var s = { seed: seed | 0 || 12345, t: 0, phase: 'title', stage: 0, score: 0, lives: 3, nextLife: 20000, ph: 0, cool: 0, diveT: 0, shots: 0, hits: 0,
      p: { x: W / 2, alive: true, rt: 0, inv: 0 }, pb: [], eb: [], en: [], fx: [], sim: false, pad: 0 };
    return s;
  }
  function startGame(s) {
    var seed = s.seed;
    var n = newState(seed); n.phase = 'ready'; n.stage = 0;
    for (var k in n) s[k] = n[k];
    nextStage(s);
  }
  function nextStage(s) {
    s.stage++; s.phase = 'ready'; s.ph = 100; s.eb = []; s.pb = []; s.en = []; s.diveT = 0;
    var speed = 1 + 0.045 * Math.min(s.stage, 20);
    for (var i = 0; i < LAYOUT.length; i++) {
      var L = LAYOUT[i], g = (i / 8) | 0;
      s.en.push({ ty: L[0], hp: HP[L[0]], col: L[1], row: L[2], m: M_WAIT, d: g * 100 + (i % 8) * 7, u: 0, du: speed / 150, side: g & 1, x: -50, y: -50, ox: 0, oy: 0, tx: 0, dir: 1, fired: 0, hit: 0, v: 0, wasDive: false });
    }
  }
  function swayX(s) { return Math.sin(s.t / 70) * 14; }
  function slotXY(s, e) { return [SLOT_X0 + e.col * SLOT_DX + swayX(s), SLOT_Y0 + e.row * SLOT_DY + Math.sin(s.t / 45 + e.col) * 0.8]; }

  function addFx(s, x, y, big) { if (!s.sim) s.fx.push({ x: x, y: y, t: 0, big: !!big }); }
  function ebSpeed(s) { return 1.5 + 0.08 * Math.min(s.stage, 12); }
  function shootAt(s, e, ox, oy) {
    if (s.sim) return;
    var px = s.p.x, py = PY, dx = px - ox, dy = py - oy;
    if (dy < 24) return;
    var d = Math.sqrt(dx * dx + dy * dy), sp = ebSpeed(s);
    dx += (rnd(s) - 0.5) * 24;
    d = Math.sqrt(dx * dx + dy * dy);
    s.eb.push({ x: ox, y: oy, vx: dx / d * sp, vy: dy / d * sp });
  }
  function kill(s, e, byPlayer) {
    var pts = (e.m === M_DIVE || e.m === M_RET) ? PD[e.ty] : PF[e.ty];
    s.score += pts; addFx(s, e.x, e.y, false);
    s.en.splice(s.en.indexOf(e), 1);
    while (s.score >= s.nextLife) { s.lives++; s.nextLife += s.nextLife === 20000 ? 50000 : 70000; if (!s.sim) s.ev = 'life'; }
  }
  function startDive(s, e, delay) {
    e.m = M_DIVE; e.u = -(delay || 0) * e.du; e.tx = clamp(s.p.x, 24, W - 24); e.dir = e.col < 5 ? -1 : 1; e.fired = 0;
    e.du = (1 / 200) * (1 + 0.05 * Math.min(s.stage, 20));
  }

  function step(s, inp) {
    inp = inp || {};
    s.t++; s.ev = null;
    var p = s.p, i, e, b;
    // effects
    for (i = s.fx.length - 1; i >= 0; i--) { s.fx[i].t++; if (s.fx[i].t > (s.fx[i].big ? 40 : 18)) s.fx.splice(i, 1); }
    if (s.phase === 'title' || s.phase === 'over') { if (s.phase === 'over') s.ph++; return; }
    if (s.phase === 'ready') { s.ph--; if (s.ph <= 0) { s.phase = 'play'; } }
    // player
    if (p.alive) {
      var dx = 0;
      if (inp.l) dx -= 2.2; if (inp.r) dx += 2.2;
      if (inp.tx !== undefined && inp.tx !== null) dx += clamp(inp.tx - p.x, -3, 3);
      p.x = clamp(p.x + dx, 10, W - 10);
      if (s.cool > 0) s.cool--;
      if (inp.f && s.cool <= 0 && s.pb.length < 2) { s.pb.push({ x: p.x, y: PY - 10 }); s.cool = 7; s.shots++; if (!s.sim) s.ev = 'shot'; }
      if (p.inv > 0) p.inv--;
    } else {
      p.rt--;
      if (p.rt <= 0) {
        if (s.lives > 0) { p.alive = true; p.x = W / 2; p.inv = 120; }
        else if (s.phase !== 'over') { s.phase = 'over'; s.ph = 0; }
      }
    }
    for (i = s.pb.length - 1; i >= 0; i--) { s.pb[i].y -= 5; if (s.pb[i].y < -8) s.pb.splice(i, 1); }
    for (i = s.eb.length - 1; i >= 0; i--) { b = s.eb[i]; b.x += b.vx; b.y += b.vy; if (b.y > H + 6 || b.x < -6 || b.x > W + 6) s.eb.splice(i, 1); }

    // enemies
    var active = s.phase === 'play' || s.phase === 'clear', formDone = true;
    if (s.phase === 'play' || s.phase === 'clear') {
      for (i = 0; i < s.en.length; i++) {
        e = s.en[i];
        if (e.hit > 0) e.hit--;
        if (e.m === M_WAIT) {
          formDone = false;
          if (--e.d <= 0) { e.m = M_ENTER; e.u = 0; }
          continue;
        }
        var sl = slotXY(s, e), pt;
        if (e.m === M_ENTER) {
          formDone = false;
          e.u += e.du;
          if (e.u >= 1) { e.m = M_FORM; e.x = sl[0]; e.y = sl[1]; continue; }
          var sd = e.side ? -1 : 1, X = function (x) { return e.side ? W - x : x; };
          pt = bez([X(-14), 70], [X(190), 120], [X(20), 230], sl, e.u);
          e.x = pt[0]; e.y = pt[1];
          if (s.stage >= 2 && !s.sim && e.fired === 0 && e.u > 0.5) { e.fired = 1; if (rnd(s) < 0.35) shootAt(s, e, e.x, e.y); }
        } else if (e.m === M_FORM) { e.x = sl[0]; e.y = sl[1]; }
        else if (e.m === M_DIVE) {
          if (e.u < 0) { e.u += e.du; e.x = sl[0]; e.y = sl[1]; if (e.u >= 0) { e.u = 0; e.ox = e.x; e.oy = e.y; } continue; }
          e.u += e.du;
          if (e.u >= 1) { e.m = M_RET; e.v = 0; e.wasDive = true; e.x = sl[0]; e.y = -14; continue; }
          pt = bez([e.ox, e.oy], [e.ox + e.dir * 70, e.oy + 60], [e.tx - e.dir * 50, 190], [e.tx + e.dir * 20, H + 16], e.u);
          e.x = pt[0]; e.y = pt[1];
          var nsh = s.stage < 2 ? 1 : s.stage < 5 ? 2 : 3, th = [0.22, 0.5, 0.72];
          if (e.fired < nsh && e.u > th[e.fired]) { e.fired++; shootAt(s, e, e.x, e.y + 6); }
        } else if (e.m === M_RET) {
          e.v += 1 / 70;
          if (e.v >= 1) { e.m = M_FORM; e.x = sl[0]; e.y = sl[1]; continue; }
          e.x = sl[0]; e.y = -14 + (sl[1] + 14) * e.v;
        }
      }
      // dives
      if (!s.sim && s.phase === 'play') {
        if (formDone) {
          if (s.diveT <= 0) s.diveT = 90;
          if (--s.diveT <= 0) {
            var cands = [], n = s.en.length;
            for (i = 0; i < n; i++) if (s.en[i].m === M_FORM) cands.push(s.en[i]);
            var k = Math.min(cands.length, 1 + (s.stage >= 3 ? 1 : 0) + (s.stage >= 6 ? 1 : 0));
            for (var q = 0; q < k && cands.length; q++) {
              e = cands.splice((rnd(s) * cands.length) | 0, 1)[0];
              startDive(s, e, 0);
              if (e.ty === BOSS && s.stage >= 2 && rnd(s) < 0.6) {
                var esc = 0;
                for (i = 0; i < cands.length && esc < 2; i++) {
                  var c2 = cands[i];
                  if (c2.ty === FLY && c2.row === 1 && Math.abs(c2.col - e.col) <= 1) { startDive(s, c2, 10 + esc * 10); cands.splice(i, 1); i--; esc++; }
                }
              }
            }
            s.diveT = Math.max(35, Math.round((150 - s.stage * 10) * (0.3 + 0.7 * n / 40) * (0.7 + rnd(s) * 0.6)));
          }
        }
      }
    }
    // player bullets vs enemies
    for (i = s.pb.length - 1; i >= 0; i--) {
      b = s.pb[i];
      for (var j = 0; j < s.en.length; j++) {
        e = s.en[j];
        if (e.m === M_WAIT) continue;
        if (Math.abs(b.x - e.x) < 8 && Math.abs(b.y - e.y) < 8) {
          s.pb.splice(i, 1); s.hits++;
          if (--e.hp <= 0) { kill(s, e, true); if (!s.sim) s.ev = 'kill'; }
          else { e.hit = 8; if (!s.sim) s.ev = 'hit'; }
          break;
        }
      }
    }
    // player hit
    if (p.alive && p.inv <= 0) {
      var pad = s.pad, hitBy = null;
      for (i = 0; i < s.eb.length && !hitBy; i++) { b = s.eb[i]; if (Math.abs(b.x - p.x) < 4.5 + pad && Math.abs(b.y - PY) < 5 + pad) { hitBy = b; s.eb.splice(i, 1); } }
      for (i = 0; i < s.en.length && !hitBy; i++) {
        e = s.en[i];
        if (e.m === M_WAIT || e.m === M_FORM && false) continue;
        if (Math.abs(e.x - p.x) < 9 + pad && Math.abs(e.y - PY) < 8 + pad) { hitBy = e; kill(s, e, false); }
      }
      if (hitBy) {
        p.alive = false; p.rt = 80; s.lives--; s.eb = []; addFx(s, p.x, PY, true); if (!s.sim) s.ev = 'die';
      }
    }
    // stage clear
    if (s.phase === 'play' && !s.en.length) { s.phase = 'clear'; s.ph = 90; if (!s.sim) s.ev = 'clear'; }
    else if (s.phase === 'clear') { s.ph--; if (s.ph <= 0) nextStage(s); }
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }

  root.Shooter = { W: W, H: H, PY: PY, newState: newState, startGame: startGame, step: step, clone: clone, slotXY: slotXY, BEE: BEE, FLY: FLY, BOSS: BOSS, M_WAIT: M_WAIT, M_FORM: M_FORM };
})(typeof self !== 'undefined' ? self : this);
