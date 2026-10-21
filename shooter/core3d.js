// Bullet Shot 3D - the same game in a 3D arena: the ship moves in the x / y plane at z = 0 and shoots into the depth (+z);
// the enemies fly in along curved 3D paths, hang in a swaying formation at z ~ 110 and dive towards the ship. Fixed 60 Hz step, no DOM (see core.js).
//   s = Shooter3D.newState(seed);  Shooter3D.step(s, { dx, dy, f, tx, ty })     dx, dy in -1..1 (x right, y up); tx, ty optional target position (pointer control)
(function (root) {
  'use strict';
  var XR = 150, YR = 140, SX = 136, SY = 120, ZF = 110, ZFAR = 340, ZMIN = -52;
  var BEE = 0, FLY = 1, BOSS = 2, HP = [1, 1, 2], PF = [50, 80, 150], PD = [100, 160, 400];
  var M_WAIT = 0, M_ENTER = 1, M_FORM = 2, M_DIVE = 3, M_RET = 4;
  function rnd(s) { s.seed = (s.seed + 0x6D2B79F5) | 0; var t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function bez(a, b, c, d, u) { var v = 1 - u, k0 = v * v * v, k1 = 3 * v * v * u, k2 = 3 * v * u * u, k3 = u * u * u; return [k0 * a[0] + k1 * b[0] + k2 * c[0] + k3 * d[0], k0 * a[1] + k1 * b[1] + k2 * c[1] + k3 * d[1], k0 * a[2] + k1 * b[2] + k2 * c[2] + k3 * d[2]]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // formation layout in entry order: 4 bosses, 8 butterflies, 8 + 8 bees (28 enemies, groups of seven)
  var LAYOUT = (function () { var o = [], c; for (c = 2; c <= 5; c++) o.push([BOSS, c, 0]); for (c = 0; c < 8; c++) o.push([FLY, c, 1]); for (c = 0; c < 8; c++) o.push([BEE, c, 2]); for (c = 0; c < 8; c++) o.push([BEE, c, 3]); return o; })();

  function newState(seed) { return { seed: seed | 0 || 4321, t: 0, phase: 'title', stage: 0, score: 0, lives: 3, nextLife: 20000, ph: 0, cool: 0, diveT: 0, shots: 0, hits: 0, p: { x: 0, y: -60, alive: true, rt: 0, inv: 0 }, pb: [], eb: [], en: [], fx: [], sim: false, pad: 0 }; }
  function startGame(s) { var n = newState(s.seed); for (var k in n) s[k] = n[k]; nextStage(s); }
  function nextStage(s) {
    s.stage++; s.phase = 'ready'; s.ph = 100; s.eb = []; s.pb = []; s.en = []; s.diveT = 0;
    var speed = 1 + 0.045 * Math.min(s.stage, 20);
    for (var i = 0; i < LAYOUT.length; i++) {
      var L = LAYOUT[i], g = (i / 7) | 0;
      s.en.push({ ty: L[0], hp: HP[L[0]], col: L[1], row: L[2], m: M_WAIT, d: g * 95 + (i % 7) * 8, u: 0, du: speed / 170, side: g & 1, x: 0, y: 0, z: 999, ox: 0, oy: 0, oz: 0, tx: 0, tyy: 0, dir: 1, fired: 0, hit: 0, v: 0 });
    }
  }
  function slotXYZ(s, e) { return [(e.col - 3.5) * 34 + Math.sin(s.t / 70) * 22, 62 - e.row * 38 + Math.sin(s.t / 50 + e.col) * 3, ZF + e.row * 10 + Math.sin(s.t / 60 + e.row) * 4]; }
  function addFx(s, x, y, z, big) { if (!s.sim) s.fx.push({ x: x, y: y, z: z, t: 0, big: !!big }); }
  function ebSpeed(s) { return 2.3 + 0.1 * Math.min(s.stage, 12); }
  function shootAt(s, e) {
    if (s.sim || e.z < 40) return;
    var dx = s.p.x - e.x + (rnd(s) - 0.5) * 50, dy = s.p.y - e.y + (rnd(s) - 0.5) * 36, dz = -e.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz), sp = ebSpeed(s);
    s.eb.push({ x: e.x, y: e.y, z: e.z, vx: dx / d * sp, vy: dy / d * sp, vz: dz / d * sp });
  }
  function kill(s, e) {
    var pts = (e.m === M_DIVE || e.m === M_RET) ? PD[e.ty] : PF[e.ty];
    s.score += pts; addFx(s, e.x, e.y, e.z, false); s.en.splice(s.en.indexOf(e), 1);
    while (s.score >= s.nextLife) { s.lives++; s.nextLife += s.nextLife === 20000 ? 50000 : 70000; if (!s.sim) s.ev = 'life'; }
  }
  function startDive(s, e, delay) { e.m = M_DIVE; e.u = -(delay || 0) * e.du; e.tx = clamp(s.p.x, -SX, SX); e.tyy = clamp(s.p.y, -SY, SY); e.dir = e.col < 4 ? -1 : 1; e.fired = 0; e.du = (1 / 210) * (1 + 0.05 * Math.min(s.stage, 20)); }

  function step(s, inp) {
    inp = inp || {}; s.t++; s.ev = null;
    var p = s.p, i, e, b;
    for (i = s.fx.length - 1; i >= 0; i--) { s.fx[i].t++; if (s.fx[i].t > (s.fx[i].big ? 40 : 18)) s.fx.splice(i, 1); }
    if (s.phase === 'title' || s.phase === 'over') { if (s.phase === 'over') s.ph++; return; }
    if (s.phase === 'ready') { s.ph--; if (s.ph <= 0) s.phase = 'play'; }
    if (p.alive) {
      var dx = (inp.dx || 0) * 3.2, dy = (inp.dy || 0) * 3.2;
      if (inp.tx !== undefined && inp.tx !== null) dx += clamp(inp.tx - p.x, -4.5, 4.5);
      if (inp.ty !== undefined && inp.ty !== null) dy += clamp(inp.ty - p.y, -4.5, 4.5);
      p.x = clamp(p.x + dx, -SX, SX); p.y = clamp(p.y + dy, -SY, SY);
      if (s.cool > 0) s.cool--;
      if (inp.f && s.cool <= 0 && s.pb.length < 3) { s.pb.push({ x: p.x, y: p.y, z: 6 }); s.cool = 7; s.shots++; if (!s.sim) s.ev = 'shot'; }
      if (p.inv > 0) p.inv--;
    } else {
      p.rt--;
      if (p.rt <= 0) { if (s.lives > 0) { p.alive = true; p.x = 0; p.y = -60; p.inv = 120; } else if (s.phase !== 'over') { s.phase = 'over'; s.ph = 0; } }
    }
    for (i = s.pb.length - 1; i >= 0; i--) { s.pb[i].z += 10; if (s.pb[i].z > ZFAR + 20) s.pb.splice(i, 1); }
    for (i = s.eb.length - 1; i >= 0; i--) { b = s.eb[i]; b.x += b.vx; b.y += b.vy; b.z += b.vz; if (b.z < ZMIN || Math.abs(b.x) > XR + 60 || Math.abs(b.y) > YR + 60) s.eb.splice(i, 1); }

    var formDone = true;
    if (s.phase === 'play' || s.phase === 'clear') {
      for (i = 0; i < s.en.length; i++) {
        e = s.en[i];
        if (e.hit > 0) e.hit--;
        if (e.m === M_WAIT) { formDone = false; if (--e.d <= 0) { e.m = M_ENTER; e.u = 0; } continue; }
        var sl = slotXYZ(s, e), pt;
        if (e.m === M_ENTER) {
          formDone = false; e.u += e.du;
          if (e.u >= 1) { e.m = M_FORM; e.x = sl[0]; e.y = sl[1]; e.z = sl[2]; continue; }
          var sg = e.side ? -1 : 1;
          pt = bez([sg * 230, 170, ZFAR], [-sg * 150, -120, 290], [sg * 130, 120, 210], sl, e.u);
          e.x = pt[0]; e.y = pt[1]; e.z = pt[2];
          if (s.stage >= 2 && !s.sim && e.fired === 0 && e.u > 0.6) { e.fired = 1; if (rnd(s) < 0.3) shootAt(s, e); }
        } else if (e.m === M_FORM) { e.x = sl[0]; e.y = sl[1]; e.z = sl[2]; }
        else if (e.m === M_DIVE) {
          if (e.u < 0) { e.u += e.du; e.x = sl[0]; e.y = sl[1]; e.z = sl[2]; if (e.u >= 0) { e.u = 0; e.ox = e.x; e.oy = e.y; e.oz = e.z; } continue; }
          e.u += e.du;
          if (e.u >= 1) { e.m = M_RET; e.v = 0; e.x = sl[0]; e.y = sl[1]; e.z = ZFAR; continue; }
          pt = bez([e.ox, e.oy, e.oz], [e.ox + e.dir * 70, e.oy + 50, e.oz - 70], [e.tx - e.dir * 40, e.tyy + 40, 55], [e.tx, e.tyy, ZMIN + 2], e.u);
          e.x = pt[0]; e.y = pt[1]; e.z = pt[2];
          var nsh = s.stage < 2 ? 1 : s.stage < 5 ? 2 : 3, th = [0.18, 0.4, 0.6];
          if (e.fired < nsh && e.u > th[e.fired]) { e.fired++; shootAt(s, e); }
        } else if (e.m === M_RET) {
          e.v += 1 / 80;
          if (e.v >= 1) { e.m = M_FORM; e.x = sl[0]; e.y = sl[1]; e.z = sl[2]; continue; }
          e.x = sl[0]; e.y = sl[1]; e.z = ZFAR + (sl[2] - ZFAR) * e.v;
        }
      }
      if (!s.sim && s.phase === 'play' && formDone) {
        if (s.diveT <= 0) s.diveT = 90;
        if (--s.diveT <= 0) {
          var cands = [], n = s.en.length;
          for (i = 0; i < n; i++) if (s.en[i].m === M_FORM) cands.push(s.en[i]);
          var k = Math.min(cands.length, 1 + (s.stage >= 3 ? 1 : 0) + (s.stage >= 6 ? 1 : 0));
          for (var q = 0; q < k && cands.length; q++) {
            e = cands.splice((rnd(s) * cands.length) | 0, 1)[0]; startDive(s, e, 0);
            if (e.ty === BOSS && s.stage >= 2 && rnd(s) < 0.6) {
              var esc = 0;
              for (i = 0; i < cands.length && esc < 2; i++) { var c2 = cands[i]; if (c2.ty === FLY && c2.row === 1 && Math.abs(c2.col - e.col) <= 1) { startDive(s, c2, 10 + esc * 10); cands.splice(i, 1); i--; esc++; } }
            }
          }
          s.diveT = Math.max(35, Math.round((150 - s.stage * 10) * (0.3 + 0.7 * n / 28) * (0.7 + rnd(s) * 0.6)));
        }
      }
    }
    // player bullets vs enemies (the bullet flew from z - 10 to z)
    for (i = s.pb.length - 1; i >= 0; i--) {
      b = s.pb[i];
      for (var j = 0; j < s.en.length; j++) {
        e = s.en[j]; if (e.m === M_WAIT) continue;
        if (Math.abs(b.x - e.x) < 15 && Math.abs(b.y - e.y) < 14 && b.z >= e.z - 11 && b.z - 10 <= e.z + 11) {
          s.pb.splice(i, 1); s.hits++;
          if (--e.hp <= 0) { kill(s, e); if (!s.sim) s.ev = 'kill'; } else { e.hit = 8; if (!s.sim) s.ev = 'hit'; }
          break;
        }
      }
    }
    // player hit
    if (p.alive && p.inv <= 0) {
      var pad = s.pad, hitBy = null;
      for (i = 0; i < s.eb.length && !hitBy; i++) { b = s.eb[i]; if (Math.abs(b.x - p.x) < 9 + pad && Math.abs(b.y - p.y) < 8 + pad && Math.abs(b.z) < 9 + pad) { hitBy = b; s.eb.splice(i, 1); } }
      for (i = 0; i < s.en.length && !hitBy; i++) { e = s.en[i]; if (e.m === M_WAIT) continue; if (Math.abs(e.x - p.x) < 16 + pad && Math.abs(e.y - p.y) < 14 + pad && Math.abs(e.z) < 12 + pad) { hitBy = e; kill(s, e); } }
      if (hitBy) { p.alive = false; p.rt = 80; s.lives--; s.eb = []; addFx(s, p.x, p.y, 0, true); if (!s.sim) s.ev = 'die'; }
    }
    if (s.phase === 'play' && !s.en.length) { s.phase = 'clear'; s.ph = 90; if (!s.sim) s.ev = 'clear'; }
    else if (s.phase === 'clear') { s.ph--; if (s.ph <= 0) nextStage(s); }
  }
  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  root.Shooter3D = { XR: XR, YR: YR, SX: SX, SY: SY, ZF: ZF, ZFAR: ZFAR, newState: newState, startGame: startGame, step: step, clone: clone, M_WAIT: M_WAIT };
})(typeof self !== 'undefined' ? self : this);
