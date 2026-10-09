/* 2D Physics / 2D 피직스 - draw shapes, cut ropes, guide the ball to the star(s). Physics: planck.js (Box2D port). Levels are procedural (seeded).
   Inspired by Crayon Physics and other Box2D puzzle games; own art, no levels copied. See core.js (generator + simulation) and planner.js (auto-solver). */
(function () {
'use strict';
var KO = /^ko/i.test(navigator.language || 'ko');
var TX = KO ? {
  title: '2D 피직스', level: '레벨', seed: '시드', best: '최고', eraser: '지우개', cut: '자르기', undo: '되돌리기', restart: '다시', start: '시작', wrong: '순서가 틀렸어요',  pin: '핀', hintBoost: '공을 누르면 속도가 붙습니다.', hintPin: '핀: 그린 물체를 눌러 그 점에 고정합니다(그 점을 중심으로 회전). 핀을 다시 누르거나 지우개로 지우면 빠집니다.', pin: '핀', hintPin: '핀: 그린 물체를 눌러 그 점에 고정합니다(그 점을 중심으로 회전). 핀을 다시 누르거나 지우개로 지우면 빠집니다.',
  hint0: '끌어서 그리면 물체가 됩니다. 공을 모든 별에 닿게 하세요. 다 그렸으면 Space(시작).',
  hintRope: ' 밧줄은 자르기 모드(또는 오른쪽 버튼 드래그)로 가로질러 쓸어서 끊습니다.',
  hintRun: '막히면 다시(R)로 같은 레벨을 처음부터. 공이 떨어지면 1초 뒤 제자리로 돌아옵니다.',
  hintErase: '지우개: 선을 누르거나 끌어서 지웁니다.', hintCut: '자르기: 밧줄을 가로질러 끌어서 끊습니다.', win: '클리어!', copied: '이 레벨의 주소를 복사했어요', nolink: '주소: ',
  tooMany: '선이 너무 많아 가장 오래된 선을 지웠어요', thinking: '풀이를 찾는 중...', nosol: '해답을 찾지 못했습니다.', autoOn: '자동으로 푸는 중...',
  hintShown: '힌트: 선 하나를 그렸어요. 다시 누르면 다음 단계입니다.', hintRunMsg: '힌트: 시작했어요.', hintCutMsg: '힌트: 밧줄을 잘랐어요.'
} : {
  title: '2D Physics', level: 'Level', seed: 'Seed', best: 'Best', eraser: 'Eraser', cut: 'Cut', undo: 'Undo', restart: 'Restart', start: 'Start', wrong: 'Wrong order',  pin: 'Pin', hintBoost: 'Press on the ball to give it a push.', hintPin: 'Pin: click a drawn object to pin it at that point (it rotates around the pin). Click a pin again, or use the eraser, to remove it.', pin: 'Pin', hintPin: 'Pin: click a drawn object to pin it at that point (it rotates around the pin). Click a pin again, or use the eraser, to remove it.',
  hint0: 'Drag to draw - drawings become solid objects. Make the ball touch every star. When ready press Space (start).',
  hintRope: ' Cut the rope in Cut mode (or right-button drag) by swiping across it.',
  hintRun: 'Stuck? Restart (R) replays the same level. A fallen ball returns to its start after 1 s.',
  hintErase: 'Eraser: click or drag over a stroke to remove it.', hintCut: 'Cut: swipe across a rope to cut it.', win: 'Cleared!', copied: 'Level link copied', nolink: 'Link: ',
  tooMany: 'Too many strokes - the oldest one was removed', thinking: 'Looking for a solution...', nosol: 'No solution found.', autoOn: 'Solving automatically...',
  hintShown: 'Hint: one stroke drawn. Press again for the next step.', hintRunMsg: 'Hint: started.', hintCutMsg: 'Hint: rope cut.'
};

var DP = window.DP, W = DP.W, H = DP.H, S = DP.S, BALL_R = DP.BALL_R, STAR_R = DP.STAR_R;
var INK = '#27324b';
var COLORS = ['#e4572e', '#f3a712', '#17a398', '#7768ae', '#ef476f', '#6aa84f', '#2e86ab'];
var sim, level, running, won, winT, fallT, colorIdx = 0;
var seed0, levelNo = 1, best = 0, particles = [], mode = 'draw', preview = null, swipeFx = null, manual = false;
try { best = parseInt(localStorage.getItem('doodle_best') || '0', 10) || 0; } catch (e) {}
function mulberry32(a) { return DP.mulberry32(a); }

/* ---------- auto-solver / hint executor ---------- */
var auto = { on: false, hint: false, phase: 'idle', gen: null, steps: null, i: 0, cur: null, cutT: null, failures: 0, restarts: 0, exec: false, valid: false, watch0: 0, fell: false, predicted: 0, startSimT: 0, cursor: null, info: null, cutEv: null, hintCut: false, runningAtPlan: false };
function autoActive() { return auto.on || auto.hint; }
function resetAutoPlan() { auto.phase = 'idle'; auto.gen = null; auto.steps = null; auto.i = 0; auto.cur = null; auto.cutT = null; auto.valid = false; auto.cursor = null; auto.fell = false; auto.cutEv = null; auto.hintCut = false; if (preview && preview.__auto) preview = null; }
function markAuto(on) { try { window.parent !== window && window.parent.setAutoMark && window.parent.setAutoMark(on); } catch (e) {} }
function userChanged() {
  if (auto.exec) return;
  auto.valid = false;
  if (auto.phase === 'exec' || auto.phase === 'hold' || auto.phase === 'watch' || auto.phase === 'planning') { var f = auto.failures, r = auto.restarts; resetAutoPlan(); auto.failures = f; auto.restarts = r; }
}
function beginPlan() {
  var snap = sim.snapshot();
  auto.runningAtPlan = running; auto.startSimT = sim.simT; auto.cur = null;
  auto.gen = DP.plan(level, snap, running);
  auto.phase = 'planning'; setStatus(TX.thinking);
}
function pumpPlan(budget) {
  if (auto.phase !== 'planning' || !auto.gen) return;
  DP.planCtl.deadline = (window.performance || Date).now() + budget;
  var r = auto.gen.next();
  if (r.done) planDone(r.value);
}
function planDone(res) {
  auto.info = res; auto.gen = null;
  if (!res.ok) { noSolution(); return; }
  var steps = [], cutEv = null;
  res.events.forEach(function (e) { if (e.type === 'stroke') steps.push({ type: 'stroke', raw: e.raw }); else cutEv = e; });
  auto.cutEv = cutEv;
  if (!auto.runningAtPlan) steps.push({ type: 'run' });
  else if (cutEv) auto.cutT = auto.startSimT + cutEv.t;
  auto.steps = steps; auto.i = 0; auto.phase = 'exec'; auto.valid = true; auto.predicted = res.result.steps;
  setStatus(auto.on ? TX.autoOn : TX.thinking);
}
function noSolution() {
  setStatus(TX.nosol); var was = auto.on; auto.on = false; auto.hint = false; resetAutoPlan(); if (was) markAuto(false);
}
function doCut() {
  if (!sim.rope) return;
  var ax = sim.rope.ax, ay = sim.rope.ay, mx = (ax + sim.bx) / 2, my = (ay + sim.by) / 2, dx = sim.bx - ax, dy = sim.by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  auto.exec = true; cutSwipe([mx - nx * 26, my - ny * 26], [mx + nx * 26, my + ny * 26]); auto.exec = false;
}
function stepDone() {
  if (auto.hint && !auto.on) {
    if (auto.steps[auto.i - 1] && auto.steps[auto.i - 1].type === 'run') {
      if (auto.cutEv && auto.cutEv.t > 0) { auto.hintCut = true; auto.phase = 'watch'; return; }
      auto.hint = false; auto.phase = 'hold'; setStatus(auto.cutEv ? TX.hintCutMsg : TX.hintRunMsg); return;
    }
    auto.hint = false; auto.phase = 'hold'; setStatus(TX.hintShown);
  }
}
function execStep() {
  var st = auto.steps && auto.steps[auto.i];
  if (!st) { auto.phase = 'watch'; auto.watch0 = sim.simT; return; }
  if (st.type === 'stroke') {
    if (!auto.cur) auto.cur = { raw: st.raw, n: 0, N: DP.planDur(st.raw) };
    var c = auto.cur; c.n++;
    var k = Math.max(2, Math.ceil(c.raw.length * c.n / c.N)); preview = c.raw.slice(0, k); preview.__auto = true; auto.cursor = c.raw[Math.min(k, c.raw.length) - 1];
    if (c.n >= c.N) { preview = null; auto.cur = null; auto.cursor = null; auto.exec = true; addStroke(c.raw); auto.exec = false; auto.i++; stepDone(); }
  } else if (st.type === 'run') {
    auto.exec = true; startSim(); auto.exec = false; auto.i++; auto.watch0 = sim.simT;
    if (auto.cutEv) { if (auto.cutEv.t === 0) { doCut(); } else auto.cutT = sim.simT + auto.cutEv.t; }
    stepDone();
    if (auto.phase === 'exec') auto.phase = 'watch';
  }
}
function onFail() {
  auto.failures++;
  var f = auto.failures, r = auto.restarts;
  if (f >= 5) { noSolution(); return; }
  if (f % 2 === 0 && r < 1) { restartLevel(true); auto.restarts = r + 1; auto.failures = f; return; }
  resetAutoPlan(); auto.failures = f; auto.restarts = r;
}
function autoTick() {
  if (!autoActive() || won) return;
  if (auto.cutT != null && running && sim.simT >= auto.cutT) {
    auto.cutT = null; doCut();
    if (auto.hintCut) { auto.hintCut = false; auto.hint = false; auto.phase = 'hold'; setStatus(TX.hintCutMsg); return; }
  }
  switch (auto.phase) {
    case 'idle': beginPlan(); break;
    case 'exec': execStep(); break;
    case 'hold': if (auto.on) auto.phase = auto.steps && auto.i < auto.steps.length ? 'exec' : 'watch'; else if (auto.hint) auto.phase = 'exec'; break;
    case 'watch':
      if (auto.hintCut && !auto.on && !auto.hint) break;
      if (fallT > 0) auto.fell = true;
      if (auto.fell && fallT === 0) { auto.fell = false; onFail(); return; }
      if (running && sim.simT - auto.watch0 > auto.predicted + 240) onFail();
      break;
  }
}
function toggleAuto() {
  auto.on = !auto.on;
  if (auto.on) { auto.hint = false; if (auto.phase === 'hold') auto.phase = 'exec'; auto.failures = 0; auto.restarts = 0; setStatus(TX.thinking); }
  else { if (auto.phase !== 'planning') { auto.cur = null; if (preview && preview.__auto) preview = null; auto.cursor = null; } if (auto.phase === 'exec') auto.phase = 'hold'; setStatus(running ? TX.hintRun : TX.hint0); }
  markAuto(auto.on);
  return auto.on;
}
function giveHint() {
  if (auto.on || won) return false;
  auto.hint = true;
  if (auto.phase === 'hold' && auto.valid) auto.phase = 'exec';
  else if (auto.phase === 'idle' || auto.phase === 'watch') { resetAutoPlan(); auto.hint = true; }
  return true;
}

/* ---------- level / game flow ---------- */
function prepStroke(st) { if (!st.passes) prepRender(st); }
function loadLevel(sd, L, keepAuto) {
  seed0 = sd >>> 0; levelNo = L;
  level = DP.genLevel(seed0, L);
  sim = new DP.Sim(level); sim.onStroke = prepStroke; history = [];
  running = false; won = false; winT = 0; fallT = 0; failing = false; failT = 0; particles = []; preview = null; swipeFx = null;
  var f = auto.failures, r = auto.restarts; resetAutoPlan(); if (keepAuto) { auto.failures = f; auto.restarts = r; } else { auto.failures = 0; auto.restarts = 0; }
  staticDirty = true; updateHud(); setStatus(TX.hint0 + (level.rope ? TX.hintRope : ''));
  try { var u = new URL(location.href); u.searchParams.set('seed', seed0); u.searchParams.set('level', L); history.replaceState(null, '', u.toString()); } catch (e) {}
}
function restartLevel(fromAuto) { loadLevel(seed0, levelNo, fromAuto === true); return true; }
function newGame() { loadLevel(1 + Math.floor(Math.random() * 99999), 1); return true; }
function startSim() { if (!running && !won) { running = true; updateHud(); setStatus(TX.hintRun); } }
function addStroke(raw) {
  var st = sim.addStroke(raw, { color: COLORS[colorIdx++ % COLORS.length], seed: (Math.random() * 1e9) | 0 });
  if (!st) return null;
  if (sim.events.indexOf('toomany') >= 0) { sim.events = []; setStatus(TX.tooMany); }
  history.push({ t: 'stroke', st: st }); userChanged();
  return st;
}
var history = [];
function undoStroke() {
  while (history.length) {
    var a = history.pop();
    if (a.t === 'stroke' && sim.strokes.indexOf(a.st) >= 0) { sim.removeStroke(a.st); userChanged(); return true; }
    if (a.t === 'pin' && sim.pins.indexOf(a.pin) >= 0) { sim.removePin(a.pin); userChanged(); return true; }
  }
  return false;
}
function toWorldPt(st, lx, ly) { var p = st.body.getPosition(), a = st.body.getAngle(), c = Math.cos(a), s = Math.sin(a); return [p.x * S + lx * c - ly * s, p.y * S + lx * s + ly * c]; }
function nearestPin(x, y, r) { var b = null, bd = r; sim.pins.forEach(function (p) { var d = Math.hypot(p.x - x, p.y - y); if (d <= bd) { bd = d; b = p; } }); return b; }
function pinAt(x, y) {
  var near = nearestPin(x, y, 13);
  if (near) { sim.removePin(near); userChanged(); return 'removed'; }
  var st = strokeAt(x, y); if (!st) return null;
  var pt = [x, y];
  if (st.kind === 'line') {                       // snap to the nearest point of the rod
    var bd = 1e9;
    for (var i = 0; i + 1 < st.loc.length; i++) {
      var a = st.loc[i], b = st.loc[i + 1], w0 = toWorldPt(st, a[0], a[1]), w1 = toWorldPt(st, b[0], b[1]);
      var dx = w1[0] - w0[0], dy = w1[1] - w0[1], l2 = dx * dx + dy * dy, t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - w0[0]) * dx + (y - w0[1]) * dy) / l2));
      var q = [w0[0] + dx * t, w0[1] + dy * t], d = Math.hypot(q[0] - x, q[1] - y);
      if (d < bd) { bd = d; pt = q; }
    }
  }
  var pin = sim.addPin(st, pt[0], pt[1]); if (!pin) return null;
  history.push({ t: 'pin', pin: pin }); userChanged(); return pin;
}
function strokeAt(x, y) {
  for (var i = sim.strokes.length - 1; i >= 0; i--) {
    var st = sim.strokes[i], b = st.body, p = b.getPosition(), a = b.getAngle(), c = Math.cos(-a), s = Math.sin(-a);
    var dx = x - p.x * S, dy = y - p.y * S, lx = dx * c - dy * s, ly = dx * s + dy * c;
    if (st.kind === 'poly') {
      if (DP.inPoly(lx, ly, st.loc)) return st;
      for (var k = 0; k < st.loc.length; k++) if (DP.distSeg(lx, ly, st.loc[k], st.loc[(k + 1) % st.loc.length]) < 10) return st;
    } else {
      for (var k2 = 0; k2 + 1 < st.loc.length; k2++) if (DP.distSeg(lx, ly, st.loc[k2], st.loc[k2 + 1]) < 11) return st;
    }
  }
  return null;
}
function eraseAt(x, y) { var np = nearestPin(x, y, 13); if (np) { sim.removePin(np); userChanged(); return true; } var st = strokeAt(x, y); if (st) { sim.removeStroke(st); userChanged(); return true; } return false; }
function segSegDist(p, q, a, b) {
  var cr = function (o, u, v) { return (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]); };
  var d1 = cr(a, b, p), d2 = cr(a, b, q), d3 = cr(p, q, a), d4 = cr(p, q, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(DP.distSeg(p[0], p[1], a, b), DP.distSeg(q[0], q[1], a, b), DP.distSeg(a[0], a[1], p, q), DP.distSeg(b[0], b[1], p, q));
}
function cutSwipe(p, q) {
  if (!sim.rope) return false;
  if (segSegDist(p, q, [sim.rope.ax, sim.rope.ay], [sim.bx, sim.by]) > 7) return false;
  sim.cutRope(); swipeFx = { p: p, q: q, life: 1 };
  burst((sim.rope ? 0 : (p[0] + q[0]) / 2), (p[1] + q[1]) / 2, 8);
  startSim(); userChanged();
  return true;
}
var boostT = -999, boostFx = null, failing = false, failT = 0;
function ballHit(x, y) { return Math.hypot(x - sim.bx, y - sim.by) <= BALL_R + 6; }
function boostBall() {                       // press on the ball: +3 m/s along its velocity (toward a star / up-right when almost at rest)
  if (!running || won) return false;
  if (sim.simT - boostT < 15) return true;     // cooldown (~0.25 s); the press is still swallowed
  boostT = sim.simT;
  var b = sim.ball, v = b.getLinearVelocity(), sp = Math.hypot(v.x, v.y), dx, dy;
  if (sp > 0.5) { dx = v.x / sp; dy = v.y / sp; }
  else {
    var tgt = null, bd = 1e9; sim.stars.forEach(function (s) { if (!s.got && Math.abs(s.x - sim.bx) < bd) { bd = Math.abs(s.x - sim.bx); tgt = s; } });
    var sx = tgt ? (tgt.x >= sim.bx ? 1 : -1) : 1; dx = sx * 0.86; dy = -0.5;
  }
  var nvx = v.x + dx * 3, nvy = v.y + dy * 3, ns = Math.hypot(nvx, nvy);
  if (ns > 14) { nvx *= 14 / ns; nvy *= 14 / ns; }
  b.setLinearVelocity(planck.Vec2(nvx, nvy)); b.setAwake(true);
  boostFx = { life: 1, dx: dx, dy: dy };
  for (var i = 0; i < 8; i++) { var a = Math.atan2(dy, dx) + Math.PI + (Math.random() - 0.5) * 1.6, sv = 80 + Math.random() * 120; particles.push({ x: sim.bx, y: sim.by, vx: Math.cos(a) * sv, vy: Math.sin(a) * sv, life: 0.6, rot: Math.random() * 6, c: i % 2 ? '#ffd166' : '#ef476f' }); }
  return true;
}
function stepOnce() {
  if (failing) { if (--failT <= 0) { failing = false; if (auto.on) auto.failures++; restartLevel(autoActive()); } return; }
  if (!running || auto.phase === 'planning') return;
  sim.step();
  if (sim.wrong && !won) { failing = true; failT = 60; setStatus(TX.wrong); sim.events = []; return; }
  if (sim.events.length) { sim.events.forEach(function (e) { if (e === 'star') { burst(sim.bx, sim.by, 16); updateHud(); } }); sim.events = []; }
  if (!won) {
    if (sim.won) { won = true; winT = 90; burst(sim.bx, sim.by, 40); if (levelNo > best) { best = levelNo; try { localStorage.setItem('doodle_best', String(best)); } catch (e) {} } updateHud(); }
    else {
      if (sim.dead() && !fallT) fallT = 60;
      if (fallT && --fallT === 0) sim.respawn();
    }
  } else if (--winT <= 0) { loadLevel(seed0, levelNo + 1, false); }
}
function burst(x, y, n) {
  for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, v = 60 + Math.random() * 260; particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 1, rot: Math.random() * 6, c: i % 3 ? '#ffd166' : COLORS[i % COLORS.length] }); }
}

/* ================= rendering ================= */
var canvas, ctx, cw = 0, ch = 0, dpr = 1, sc = 1, offx = 0, offy = 0, staticCv = null, staticDirty = true;
function wob(pts, rnd, amp, step, closed) {
  var out = [], n = pts.length, ox = 0, oy = 0, segs = closed ? n : n - 1;
  for (var i = 0; i < segs; i++) {
    var a = pts[i], b = pts[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.round(len / step));
    for (var k = 0; k < m; k++) {
      var t = k / m; ox += (rnd() - 0.5) * amp * 1.3; oy += (rnd() - 0.5) * amp * 1.3;
      ox = Math.max(-amp, Math.min(amp, ox * 0.9)); oy = Math.max(-amp, Math.min(amp, oy * 0.9));
      out.push([a[0] + (b[0] - a[0]) * t + ox, a[1] + (b[1] - a[1]) * t + oy]);
    }
  }
  if (!closed) out.push([pts[n - 1][0] + ox, pts[n - 1][1] + oy]); else out.push(out[0].slice());
  return out;
}
function prepRender(st) {
  var rnd = mulberry32(st.seed | 0), closed = st.kind === 'poly', base = st.loc;
  st.passes = [wob(base, rnd, 1.3, 9, closed), wob(base, rnd, 1.9, 11, closed)];
  if (closed) {
    var bb = [1e9, 1e9, -1e9, -1e9]; base.forEach(function (p) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); });
    st.hatch = [];
    for (var o = -(bb[3] - bb[1]); o < bb[2] - bb[0]; o += 9 + rnd() * 2) { var x0 = bb[0] + o; st.hatch.push([x0, bb[1], x0 + (bb[3] - bb[1]), bb[3]]); }
  }
}
function pathOf(c, pts, closed) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); if (closed) c.closePath(); }
function inkLine(c, pts, color, w, alpha, closed) { c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = color; c.lineWidth = w; c.globalAlpha = alpha; pathOf(c, pts, closed); c.stroke(); }
function hatchFill(c, hatch, color, alpha) { c.strokeStyle = color; c.globalAlpha = alpha; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath(); hatch.forEach(function (h) { c.moveTo(h[0], h[1]); c.lineTo(h[2], h[3]); }); c.stroke(); }
function drawStroke(c, st) {
  var b = st.body, p = b.getPosition(), a = b.getAngle();
  c.save(); c.translate(p.x * S, p.y * S); c.rotate(a);
  var closed = st.kind === 'poly';
  if (closed) { c.save(); pathOf(c, st.passes[0], true); c.globalAlpha = 0.28; c.fillStyle = st.color; c.fill(); c.clip(); hatchFill(c, st.hatch, st.color, 0.45); c.restore(); }
  var w = closed ? 4.5 : 6.5;
  inkLine(c, st.passes[0], st.color, w, 0.92, closed);
  inkLine(c, st.passes[1], INK, 1.3, 0.55, closed);
  inkLine(c, st.passes[1], '#ffffff', w * 0.25, 0.4, closed);
  c.restore(); c.globalAlpha = 1;
}
function rrect(c, hw, hh, r) { c.beginPath(); c.moveTo(-hw + r, -hh); c.lineTo(hw - r, -hh); c.quadraticCurveTo(hw, -hh, hw, -hh + r); c.lineTo(hw, hh - r); c.quadraticCurveTo(hw, hh, hw - r, hh); c.lineTo(-hw + r, hh); c.quadraticCurveTo(-hw, hh, -hw, hh - r); c.lineTo(-hw, -hh + r); c.quadraticCurveTo(-hw, -hh, -hw + r, -hh); c.closePath(); }
function drawProp(c, pr) {
  var p = pr.body.getPosition(), a = pr.body.getAngle();
  c.save(); c.translate(p.x * S, p.y * S); c.rotate(a);
  var hw = pr.hw, hh = pr.hh;
  if (pr.kind === 'seesaw') {
    c.rotate(-a);                                   // support triangle stays upright
    c.beginPath(); c.moveTo(0, 2); c.lineTo(-17, 40); c.lineTo(17, 40); c.closePath(); c.fillStyle = '#ffd166'; c.globalAlpha = 0.95; c.fill(); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
    c.rotate(a);
    rrect(c, hw, hh, 3); c.fillStyle = '#ff8f6b'; c.globalAlpha = 0.95; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.arc(0, 0, 5, 0, 6.3); c.fillStyle = '#f7f1e1'; c.fill(); c.lineWidth = 2; c.stroke();
  } else if (pr.kind === 'crate') {
    rrect(c, hw + 0.5, hh + 0.5, 2); c.fillStyle = '#f2c78a'; c.globalAlpha = 0.95; c.fill(); c.lineWidth = 2.6; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.moveTo(-hw + 3, -hh + 3); c.lineTo(hw - 3, hh - 3); c.moveTo(hw - 3, -hh + 3); c.lineTo(-hw + 3, hh - 3); c.lineWidth = 1.6; c.globalAlpha = 0.6; c.stroke();
  } else {
    rrect(c, hw, hh, 2.5); c.fillStyle = '#fff4c2'; c.globalAlpha = 0.95; c.fill(); c.lineWidth = 2.4; c.strokeStyle = INK; c.stroke();
    c.fillStyle = INK; c.globalAlpha = 0.7; for (var d = -1; d <= 1; d++) { c.beginPath(); c.arc(0, d * 14, 1.8, 0, 6.3); c.fill(); }
  }
  c.restore(); c.globalAlpha = 1;
}
function sparklePath(c, x, y, r, rot) {
  c.beginPath();
  for (var i = 0; i < 8; i++) {
    var an = rot + i * Math.PI / 4, rad = i % 2 ? r * 0.5 : r, an2 = rot + (i + 0.5) * Math.PI / 4;
    var px = x + Math.cos(an) * rad, py = y + Math.sin(an) * rad;
    if (!i) c.moveTo(px, py); else c.quadraticCurveTo(x + Math.cos(an - Math.PI / 8) * r * 0.28, y + Math.sin(an - Math.PI / 8) * r * 0.28, px, py);
  }
  c.quadraticCurveTo(x + Math.cos(rot - Math.PI / 8) * r * 0.28, y + Math.sin(rot - Math.PI / 8) * r * 0.28, x + Math.cos(rot) * r, y + Math.sin(rot) * r);
  c.closePath();
}
function drawStar(c, s, t, isNext, multi) {
  var x = s.x, y = s.y + Math.sin(t * 2.2 + s.x) * 2.5, rot = Math.sin(t * 1.1 + s.y) * 0.25 - Math.PI / 2;
  c.save();
  var pulse = 0.5 + 0.5 * Math.sin(t * 3 + s.x);
  c.strokeStyle = '#ef476f'; c.lineWidth = 2; c.lineCap = 'round'; c.globalAlpha = 0.35 + 0.35 * pulse;
  for (var i = 0; i < 8; i++) { var an = i * Math.PI / 4 + t * 0.4; c.beginPath(); c.moveTo(x + Math.cos(an) * (STAR_R + 6), y + Math.sin(an) * (STAR_R + 6)); c.lineTo(x + Math.cos(an) * (STAR_R + 10 + 3 * pulse), y + Math.sin(an) * (STAR_R + 10 + 3 * pulse)); c.stroke(); }
  sparklePath(c, x, y, STAR_R + 6, rot); c.fillStyle = '#ffd166'; c.globalAlpha = 0.97; c.fill(); c.lineWidth = 2.6; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
  if (multi) {
    var col = COLORS[(s.n - 1) % COLORS.length];
    if (isNext) { c.beginPath(); c.arc(x, y, STAR_R + 12 + 3 * pulse, 0, 6.3); c.strokeStyle = col; c.lineWidth = 3; c.globalAlpha = 0.5 + 0.4 * pulse; c.stroke(); }
    c.globalAlpha = 1; c.beginPath(); c.arc(x, y, 9, 0, 6.3); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 12px "Comic Sans MS","Noto Sans KR",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(s.n), x, y + 0.5);
  } else { c.beginPath(); c.arc(x, y, 3.2, 0, 6.3); c.fillStyle = '#ef476f'; c.fill(); }
  c.restore(); c.globalAlpha = 1;
}
function drawBall(c, t) {
  var p = sim.ball.getPosition(), a = sim.ball.getAngle(), x = p.x * S, y = p.y * S, v = sim.ball.getLinearVelocity();
  c.save(); c.translate(x, y);
  if (boostFx) { boostFx.life -= 0.07; if (boostFx.life <= 0) boostFx = null; else { var k = Math.sin(boostFx.life * Math.PI) * 0.3, an = Math.atan2(boostFx.dy, boostFx.dx); c.rotate(an); c.scale(1 + k, 1 - k * 0.8); c.rotate(-an); } }
  c.beginPath(); c.arc(0, 0, BALL_R, 0, 6.3); c.fillStyle = '#8ecae6'; c.globalAlpha = 0.97; c.fill();
  c.save(); c.clip(); c.rotate(a); c.strokeStyle = '#ffffff'; c.globalAlpha = 0.8; c.lineWidth = 3.5; c.beginPath(); c.arc(-BALL_R * 0.5, -BALL_R * 0.45, BALL_R * 0.9, 0.2, 1.7); c.stroke();
  c.strokeStyle = '#2e86ab'; c.globalAlpha = 0.55; c.lineWidth = 2; c.beginPath(); c.moveTo(-BALL_R, 0); c.quadraticCurveTo(0, -5, BALL_R, 0); c.stroke(); c.restore();
  c.globalAlpha = 1; c.beginPath(); c.arc(0, 0, BALL_R, 0, 6.3); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
  var lx = Math.max(-2.5, Math.min(2.5, v.x * 0.3)), ly = Math.max(-1.5, Math.min(1.5, v.y * 0.2));
  c.fillStyle = INK; c.beginPath(); c.arc(-4.2 + lx, -2.5 + ly, 1.9, 0, 6.3); c.arc(4.2 + lx, -2.5 + ly, 1.9, 0, 6.3); c.fill();
  c.lineWidth = 1.8; c.beginPath(); c.arc(lx * 0.6, 2.5, 4, 0.25, Math.PI - 0.25); c.stroke();
  c.restore(); c.globalAlpha = 1;
}
function drawRope(c) {
  if (!level.rope) return;
  var r = level.rope;
  if (sim.rope) {
    var pts = [[r.ax, r.ay], [sim.bx, sim.by]], rnd = mulberry32(5), w = wob(pts, rnd, 0.8, 8, false);
    inkLine(c, w, '#8a6a43', 4.2, 1, false); c.setLineDash([5, 4]); inkLine(c, w, '#e9d3a7', 2, 0.9, false); c.setLineDash([]);
  }
  c.beginPath(); c.arc(r.ax, r.ay, 7, 0, 6.3); c.fillStyle = '#c9ced8'; c.globalAlpha = 1; c.fill(); c.lineWidth = 2.6; c.strokeStyle = INK; c.stroke();
  c.beginPath(); c.arc(r.ax - 2, r.ay - 2, 2, 0, 6.3); c.fillStyle = '#fff'; c.fill();
}
function drawPin(c, p) {
  c.save(); c.translate(p.x, p.y); c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(-3, -9); c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke();
  c.beginPath(); c.arc(-4.5, -13, 7, 0, 6.3); c.fillStyle = '#ef476f'; c.globalAlpha = 1; c.fill(); c.lineWidth = 2.4; c.strokeStyle = INK; c.stroke();
  c.beginPath(); c.arc(-6.5, -15, 2, 0, 6.3); c.fillStyle = '#fff'; c.fill();
  c.beginPath(); c.arc(0, 0, 2.2, 0, 6.3); c.fillStyle = INK; c.fill();
  c.restore();
}
function drawJets(c, t) {
  level.jets.forEach(function (j) {
    c.save(); c.beginPath(); c.rect(j.x0, j.y0, j.x1 - j.x0, j.y1 - j.y0); c.clip();
    c.fillStyle = 'rgba(142,202,230,0.16)'; c.fillRect(j.x0, j.y0, j.x1 - j.x0, j.y1 - j.y0);
    c.strokeStyle = '#2e86ab'; c.lineWidth = 2; c.lineCap = 'round'; c.globalAlpha = 0.5;
    for (var x = j.x0 + 16; x < j.x1 - 8; x += 26) {
      var off = ((t * 90 + x * 3) % 60);
      for (var y = j.y1 + 60 - off; y > j.y0 - 30; y -= 60) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 7, y - 10, x, y - 20); c.quadraticCurveTo(x - 7, y - 30, x, y - 40); c.stroke(); c.beginPath(); c.moveTo(x - 4, y - 36); c.lineTo(x, y - 41); c.lineTo(x + 4, y - 36); c.stroke(); }
    }
    c.restore();
    c.save(); c.setLineDash([7, 6]); c.strokeStyle = '#2e86ab'; c.globalAlpha = 0.5; c.lineWidth = 1.6; c.strokeRect(j.x0, j.y0, j.x1 - j.x0, j.y1 - j.y0); c.restore();
  });
  c.globalAlpha = 1;
}
function ensureStatic() {
  if (staticCv && !staticDirty && staticCv.width === Math.round(cw * dpr) && staticCv.height === Math.round(ch * dpr)) return;
  staticDirty = false;
  staticCv = document.createElement('canvas'); staticCv.width = Math.max(1, Math.round(cw * dpr)); staticCv.height = Math.max(1, Math.round(ch * dpr));
  var c = staticCv.getContext('2d'), rnd = mulberry32(DP.hash2(seed0, levelNo));
  c.fillStyle = '#f9f5ea'; c.fillRect(0, 0, staticCv.width, staticCv.height);
  c.setTransform(sc * dpr, 0, 0, sc * dpr, offx * dpr, offy * dpr);
  c.strokeStyle = 'rgba(46,134,171,0.15)'; c.lineWidth = 1 / sc; c.beginPath();
  var gx0 = -offx / sc, gx1 = (cw - offx) / sc, gy0 = -offy / sc, gy1 = (ch - offy) / sc;
  for (var gx = Math.floor(gx0 / 30) * 30; gx < gx1; gx += 30) { c.moveTo(gx, gy0); c.lineTo(gx, gy1); }
  for (var gy = Math.floor(gy0 / 30) * 30; gy < gy1; gy += 30) { c.moveTo(gx0, gy); c.lineTo(gx1, gy); }
  c.stroke();
  c.strokeStyle = 'rgba(239,71,111,0.25)'; c.lineWidth = 1.5; c.setLineDash([8, 6]); c.strokeRect(0, 0, W, H); c.setLineDash([]);
  var FILL = '#bfe3cc', HATCH = '#5fa57b';
  level.chains.forEach(function (cn) {
    var chn = cn.pts; if (chn.length < 2) return;
    var poly = chn.concat([[chn[chn.length - 1][0], H + 400], [chn[0][0], H + 400]]);
    c.save(); pathOf(c, poly, true); c.globalAlpha = 0.5; c.fillStyle = cn.mat === 'ice' ? '#d4eefb' : FILL; c.fill(); c.clip();
    c.strokeStyle = HATCH; c.globalAlpha = 0.45; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath();
    var minx = chn[0][0], maxx = chn[chn.length - 1][0];
    for (var o = minx - 900; o < maxx; o += 12) { c.moveTo(o, 330); c.lineTo(o + 900, H + 400); }
    c.stroke(); c.restore();
    var surf = wob(chn, rnd, 1.2, 9, false), surf2 = wob(chn, rnd, 1.8, 10, false);
    inkLine(c, surf, INK, 5, 0.95, false); inkLine(c, surf2, INK, 1.5, 0.5, false);
    if (cn.mat === 'ice') { inkLine(c, surf, '#aee3f7', 2.4, 0.9, false); c.setLineDash([2, 12]); inkLine(c, surf, '#fff', 2, 1, false); c.setLineDash([]); }
  });
  level.boxes.forEach(function (b) {
    var ca = Math.cos(b.a), sa = Math.sin(b.a);
    var cor = [[-b.hw, -b.hh], [b.hw, -b.hh], [b.hw, b.hh], [-b.hw, b.hh]].map(function (q) { return [b.cx + q[0] * ca - q[1] * sa, b.cy + q[0] * sa + q[1] * ca]; });
    var fill = b.kind === 'slab' ? '#cdd7e3' : b.kind === 'ceil' ? '#d7cdea' : b.kind === 'bounce' ? '#ffc2d1' : '#f4cfae';
    var hat = b.kind === 'slab' ? '#7d8fa8' : b.kind === 'ceil' ? '#8e7cc3' : b.kind === 'bounce' ? '#ef476f' : '#d49a6a';
    c.save(); pathOf(c, cor, true); c.globalAlpha = 0.7; c.fillStyle = fill; c.fill(); c.clip();
    c.strokeStyle = hat; c.globalAlpha = 0.6; c.lineWidth = 1.8; c.beginPath();
    var R = b.hw + b.hh + 4;
    for (var o2 = -R * 2; o2 < R * 2; o2 += 9) { c.moveTo(b.cx + o2, b.cy - R); c.lineTo(b.cx + o2 + R * 2, b.cy + R); }
    c.stroke(); c.restore();
    var wl = wob(cor, rnd, 1.1, 9, true), wl2 = wob(cor, rnd, 1.7, 10, true);
    inkLine(c, wl, INK, 4.5, 0.95, true); inkLine(c, wl2, INK, 1.4, 0.5, true);
    if (b.kind === 'bounce') {                                  // springs under the trampoline floor
      c.strokeStyle = INK; c.lineWidth = 2; c.globalAlpha = 0.8; c.beginPath();
      for (var sx = b.cx - b.hw + 20; sx < b.cx + b.hw - 10; sx += 40) { c.moveTo(sx, b.cy + b.hh); for (var z = 0; z < 5; z++) c.lineTo(sx + (z % 2 ? -7 : 7), b.cy + b.hh + 4 + z * 4); }
      c.stroke();
    }
  });
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#f9f5ea';
  var n = Math.round(staticCv.width * staticCv.height / 320);
  c.globalAlpha = 0.5;
  for (var i = 0; i < n; i++) c.fillRect(Math.floor(rnd() * staticCv.width), Math.floor(rnd() * staticCv.height), 1 + (rnd() < 0.25 ? 1 : 0), 1);
  c.globalAlpha = 1;
}
var TCOL = ['#ef476f', '#f3a712', '#17a398', '#2e86ab', '#7768ae', '#6aa84f', '#e4572e', '#ef476f', '#f3a712', '#17a398'];
function drawTitle(c) {
  var s = TX.title, x = W / 2 - s.length * 22, y = 100;
  c.save(); c.font = 'bold 64px "Comic Sans MS","Segoe Print","Noto Sans KR","Malgun Gothic",cursive'; c.textAlign = 'center'; c.lineJoin = 'round';
  var rnd = mulberry32(3);
  for (var i = 0; i < s.length; i++) {
    var ch2 = s.charAt(i); if (ch2 === ' ') continue;
    c.save(); c.translate(x + i * 44 + 22, y + Math.sin(i * 1.7) * 6); c.rotate((rnd() - 0.5) * 0.28);
    c.lineWidth = 11; c.strokeStyle = '#f9f5ea'; c.globalAlpha = 0.95; c.strokeText(ch2, 0, 0);
    c.lineWidth = 4; c.strokeStyle = INK; c.globalAlpha = 0.9; c.strokeText(ch2, 0, 0);
    c.fillStyle = TCOL[i % TCOL.length]; c.globalAlpha = 0.95; c.fillText(ch2, 0, 0); c.restore();
  }
  c.restore();
}
var vt = 0;
function render(ts) {
  if (!cw || !sim) return;
  vt = ts / 1000;
  ensureStatic();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(staticCv, 0, 0);
  ctx.setTransform(sc * dpr, 0, 0, sc * dpr, offx * dpr, offy * dpr);
  if (!running && !won && !sim.strokes.length && !autoActive()) drawTitle(ctx);
  drawJets(ctx, vt);
  sim.props.forEach(function (p) { drawProp(ctx, p); });
  sim.strokes.forEach(function (st) { drawStroke(ctx, st); });
  drawRope(ctx);
  sim.pins.forEach(function (p) { drawPin(ctx, p); });
  sim.stars.forEach(function (s, k) { if (!s.got) drawStar(ctx, s, vt, level.order[sim.next] === k, sim.stars.length > 1); });
  drawBall(ctx, vt);
  if (preview && preview.length > 1) {
    var cutting = mode === 'cut' && !preview.__auto;
    var closeHint = !cutting && preview.length > 6 && Math.hypot(preview[0][0] - preview[preview.length - 1][0], preview[0][1] - preview[preview.length - 1][1]) < Math.max(26, 0.18 * DP.pathLen(preview));
    if (cutting) { ctx.setLineDash([6, 6]); inkLine(ctx, preview, '#ef476f', 3, 0.9, false); ctx.setLineDash([]); }
    else inkLine(ctx, preview, COLORS[colorIdx % COLORS.length], 5.5, 0.85, false);
    if (closeHint) { ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(preview[preview.length - 1][0], preview[preview.length - 1][1]); ctx.lineTo(preview[0][0], preview[0][1]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
    ctx.globalAlpha = 1;
  }
  if (auto.cursor) {                              // the auto-solver's marker
    var cu = auto.cursor; ctx.save(); ctx.translate(cu[0], cu[1]); ctx.rotate(0.6); ctx.fillStyle = '#ef476f'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-5, -10); ctx.lineTo(-5, -34); ctx.lineTo(5, -34); ctx.lineTo(5, -10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  if (swipeFx) {
    swipeFx.life -= 0.04; if (swipeFx.life <= 0) swipeFx = null;
    else { ctx.globalAlpha = swipeFx.life; ctx.beginPath(); ctx.moveTo(swipeFx.p[0], swipeFx.p[1]); ctx.lineTo(swipeFx.q[0], swipeFx.q[1]); ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke(); ctx.globalAlpha = 1; }
  }
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i]; p.x += p.vx / 60; p.y += p.vy / 60; p.vy += 6; p.life -= 0.014; p.rot += 0.1;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, p.life * 1.5); sparklePath(ctx, p.x, p.y, 6 + 6 * p.life, p.rot); ctx.fillStyle = p.c; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (failing) {
    ctx.save(); ctx.globalAlpha = 0.18 + 0.12 * Math.sin(vt * 25); ctx.fillStyle = '#e63946'; ctx.fillRect(-offx / sc, -offy / sc, cw / sc, ch / sc); ctx.globalAlpha = 1;
    ctx.translate(W / 2, 170); ctx.rotate(0.03); ctx.font = 'bold 64px "Comic Sans MS","Segoe Print","Noto Sans KR",cursive'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.lineWidth = 12; ctx.strokeStyle = '#f9f5ea'; ctx.strokeText(TX.wrong, 0, 0); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.strokeText(TX.wrong, 0, 0); ctx.fillStyle = '#e63946'; ctx.fillText(TX.wrong, 0, 0); ctx.restore();
  }
  if (won) {
    ctx.save(); ctx.translate(W / 2, 170); ctx.rotate(-0.04); ctx.font = 'bold 76px "Comic Sans MS","Segoe Print","Noto Sans KR",cursive'; ctx.textAlign = 'center';
    ctx.lineWidth = 12; ctx.strokeStyle = '#f9f5ea'; ctx.lineJoin = 'round'; ctx.strokeText(TX.win, 0, 0); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.strokeText(TX.win, 0, 0); ctx.fillStyle = '#ef476f'; ctx.fillText(TX.win, 0, 0); ctx.restore();
  }
}
var lastTs = 0, acc = 0;
function advance() { stepOnce(); if (running) autoTick(); }
function frame(ts) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000)); lastTs = ts;
  if (!manual) {
    acc += dt; var n = 0;
    while (acc >= 1 / 60 && n < 4) { advance(); acc -= 1 / 60; n++; }
    if (n === 4) acc = 0;
    if (!running) autoTick();
    pumpPlan(12);
  }
  render(ts);
}
function resize() {
  var wrap = $('stage'), r = wrap.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = Math.max(50, Math.round(r.width)); ch = Math.max(50, Math.round(r.height));
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  sc = Math.min(cw / W, ch / H); offx = (cw - W * sc) / 2; offy = (ch - H * sc) / 2;
  staticDirty = true;
}

/* ================= HUD / input ================= */
function $(id) { return document.getElementById(id); }
function setStatus(t) { var s = $('status'); if (s) s.textContent = t; }
function updateHud() {
  var got = sim.stars.filter(function (s) { return s.got; }).length;
  $('chLevel').textContent = TX.level + ' ' + levelNo;
  $('chSeed').textContent = TX.seed + ' ' + seed0;
  if (sim.stars.length === 1) $('chStars').textContent = '★ ' + got + '/1';
  else $('chStars').innerHTML = level.order.map(function (k, r) { var cls = r < sim.next ? 'ns done' : r === sim.next ? 'ns next' : 'ns'; return '<i class="' + cls + '" style="--c:' + COLORS[r % COLORS.length] + '">' + (r + 1) + '</i>'; }).join('');
  $('chBest').textContent = TX.best + ' ' + best;
  $('btnStart').style.display = running || won ? 'none' : '';
  $('btnErase').classList.toggle('on', mode === 'erase'); $('btnPin').classList.toggle('on', mode === 'pin'); $('btnCut').classList.toggle('on', mode === 'cut');
}
function setMode(m) { mode = m; updateHud(); setStatus(m === 'pin' ? TX.hintPin : m === 'erase' ? TX.hintErase : m === 'cut' ? TX.hintCut : (running ? TX.hintRun : TX.hint0)); }
function toggleEraser() { setMode(mode === 'erase' ? 'draw' : 'erase'); return mode === 'erase'; }
function togglePin() { setMode(mode === 'pin' ? 'draw' : 'pin'); return mode === 'pin'; }
function toggleCut() { setMode(mode === 'cut' ? 'draw' : 'cut'); return mode === 'cut'; }
function toWorld(e) { var r = canvas.getBoundingClientRect(); return [(e.clientX - r.left - offx) / sc, (e.clientY - r.top - offy) / sc]; }
var drawing = null, touches = {};
function initInput() {
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault(); touches[e.pointerId] = 1;
    var w = toWorld(e);
    if (e.button !== 2 && Object.keys(touches).length === 1 && running && !won && ballHit(w[0], w[1])) { boostBall(); drawing = null; preview = null; return; }
    if (mode === 'pin' && e.button !== 2 && Object.keys(touches).length === 1) { pinAt(w[0], w[1]); return; }
    if (e.button === 2 || Object.keys(touches).length > 1) { drawing = { erase: true, last: w, id: e.pointerId }; preview = null; eraseAt(w[0], w[1]); return; }
    if (mode === 'erase') { drawing = { erase: true, last: w, id: e.pointerId, only: true }; eraseAt(w[0], w[1]); return; }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (mode === 'cut') { drawing = { cut: true, pts: [w], id: e.pointerId }; preview = drawing.pts; return; }
    drawing = { pts: [w], id: e.pointerId }; preview = drawing.pts;
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var w = toWorld(e);
    if (drawing.erase) { eraseAt(w[0], w[1]); if (!drawing.only) cutSwipe(drawing.last, w); drawing.last = w; return; }
    if (e.pointerId !== drawing.id) return;
    var l = drawing.pts[drawing.pts.length - 1];
    if (Math.hypot(w[0] - l[0], w[1] - l[1]) >= 3 && drawing.pts.length < 900) { drawing.pts.push(w); if (drawing.cut) cutSwipe(l, w); }
  });
  function up(e) {
    delete touches[e.pointerId];
    if (!drawing) return;
    if (drawing.erase) { drawing = null; return; }
    if (e.pointerId !== drawing.id) return;
    var d = drawing; drawing = null; preview = null;
    if (d.cut) return;
    addStroke(d.pts);
  }
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', function (e) { delete touches[e.pointerId]; if (drawing && e.pointerId === drawing.id) { drawing = null; preview = null; } });
  var embedded = false;
  try { embedded = window.parent !== window && !!window.parent.runMenu; } catch (e) {}
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (/^F[234]$/.test(k)) { if (embedded) return; e.preventDefault(); if (k === 'F2') newGame(); else if (k === 'F3') toggleAuto(); else giveHint(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); undoStroke(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'r' || k === 'R') { restartLevel(); } else if (k === ' ') { e.preventDefault(); startSim(); userChanged(); } else if (k === 'e' || k === 'E') { toggleEraser(); } else if (k === 'c' || k === 'C') { toggleCut(); } else if (k === 'p' || k === 'P') { togglePin(); }
  });
  $('btnStart').onclick = function () { startSim(); userChanged(); };
  $('btnErase').onclick = function () { toggleEraser(); };
  $('btnCut').onclick = function () { toggleCut(); };
  $('btnPin').onclick = function () { togglePin(); };
  $('btnUndo').onclick = function () { undoStroke(); };
  $('btnRestart').onclick = function () { restartLevel(); };
  $('chSeed').onclick = function () {
    var u = location.href; try { if (window.parent !== window) { var pu = new URL(window.parent.location.href); pu.searchParams.set('seed', seed0); pu.searchParams.set('level', levelNo); u = pu.toString(); } } catch (e0) {} try { navigator.clipboard.writeText(u).then(function () { setStatus(TX.copied); }, function () { setStatus(TX.nolink + u); }); } catch (e) { setStatus(TX.nolink + u); }
  };
  window.addEventListener('message', function (e) { var m = e.data; if (m && m.ngCmd && typeof window[m.ngCmd] === 'function') { var r = window[m.ngCmd](m.v); if (m.ngCmd === 'toggleAuto') markAuto(!!r); } });
}

function init() {
  document.documentElement.lang = KO ? 'ko' : 'en';
  document.title = TX.title;
  $('btnStart').textContent = '▶ ' + TX.start; $('btnErase').textContent = '✐ ' + TX.eraser; $('btnCut').textContent = '✂ ' + TX.cut; $('btnPin').textContent = '◉ ' + TX.pin; $('btnUndo').textContent = '↶ ' + TX.undo; $('btnRestart').textContent = '⟲ ' + TX.restart;
  canvas = $('cv'); ctx = canvas.getContext('2d');
  var q = new URLSearchParams(location.search), sd = parseInt(q.get('seed'), 10), lv = parseInt(q.get('level'), 10);
  loadLevel(isFinite(sd) ? sd : 1 + Math.floor(Math.random() * 99999), isFinite(lv) && lv >= 1 ? lv : 1);
  resize(); window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe($('stage'));
  initInput();
  requestAnimationFrame(frame);
}

/* ---- API for the shell + tests ---- */
window.newGame = newGame; window.restartLevel = restartLevel; window.undoStroke = undoStroke; window.toggleEraser = toggleEraser; window.toggleCut = toggleCut; window.togglePin = togglePin;
window.toggleAuto = toggleAuto; window.giveHint = giveHint;
window.getLevelInfo = function () { return { level: levelNo, seed: seed0 }; };
window.__dp = {
  DP: DP,
  get sim() { return sim; }, get level() { return level; }, get strokes() { return sim.strokes; }, get ball() { return sim.ball; }, get stars() { return sim.stars; }, get auto() { return auto; },
  set manual(v) { manual = !!v; }, get manual() { return manual; },
  load: loadLevel, restart: restartLevel, newGame: newGame, addStroke: addStroke, undo: undoStroke, erase: eraseAt, strokeAt: strokeAt, start: startSim, cut: cutSwipe, pinAt: pinAt, boost: boostBall, get pins() { return sim.pins; },
  step: function (n) { for (var i = 0; i < (n || 1); i++) { stepOnce(); if (running) autoTick(); else autoTick(); } },
  pump: function (budget) { pumpPlan(budget == null ? 1e9 : budget); },
  state: function () { return { running: running, won: won, level: levelNo, seed: seed0, got: sim.stars.filter(function (s) { return s.got; }).length, nstars: sim.stars.length, bx: sim.bx, by: sim.by, fall: fallT, bodies: sim.world.getBodyCount(), next: sim.next, failing: failing, strokes: sim.strokes.length, pins: sim.pins.length, mode: mode, simT: sim.simT, rope: !!sim.rope, auto: auto.on, hint: auto.hint, phase: auto.phase, step: auto.i, nsteps: auto.steps ? auto.steps.length : 0, failures: auto.failures, restarts: auto.restarts }; },
  checksum: function () { return level.checksum; },
  W: W, H: H
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
