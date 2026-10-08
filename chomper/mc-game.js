// Maze Chomper page logic shared by the 2D and 3D versions: input, fixed step loop, game states, auto player / hint, HUD, overlays, sound.
(function () {
'use strict';
const D = window.MC_D, KO = /^ko/i.test(navigator.language || ''), T = function (ko, en) { return KO ? ko : en; };
const canvas = document.getElementById('app'), ctx = canvas.getContext('2d');
const qs = new URLSearchParams(location.search), seedQ = parseInt(qs.get('seed'), 10);
const sim = MC.make({ D: D, seed: seedQ > 0 ? seedQ : (Date.now() % 100000) + 1 });
const G = window.G = { D: D, KO: KO, T: T, sim: sim, canvas: canvas, ctx: ctx, mode: 'start', auto: false, hint: null, w: 1, h: 1, U: 1, dpr: 1, best: 0, touchSeen: false, ptrs: {}, steerPtr: null, keys: {}, btn: null,
  cam: { yaw: 0.65, pitch: 0.55, tYaw: null, tPitch: null }, fps: 60, autoRestartAt: 0, lastPlanQ: -1, autoT: 0, autoNode: -1, noAutoRestart: false, muted: false, flashT: 0, camRot: false, stopped: false, stats: { games: 0 } };
const KEY_BEST = 'chomper' + D + 'd_best', KEY_MUTE = 'chomper_muted';
try { G.best = parseInt(localStorage.getItem(KEY_BEST), 10) || 0; G.muted = localStorage.getItem(KEY_MUTE) === '1'; } catch (e) {}
function saveBest() { try { localStorage.setItem(KEY_BEST, String(G.best)); } catch (e) {} }
const embedded = function () { try { return window.parent !== window && !!window.parent.setAutoMark; } catch (e) { return false; } };
function reportAuto() { try { if (window.parent !== window && window.parent.setAutoMark) window.parent.setAutoMark(G.auto); } catch (e) {} }

// ---------------------------------------------------------------- sound (own synthesized blips)
let AC = null, master = null, dotAlt = 0;
function audioInit() { if (AC) { if (AC.state === 'suspended') AC.resume(); return; } try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = new C(); master = AC.createGain(); master.gain.value = 0.22; master.connect(AC.destination); } catch (e) { AC = null; } }
function tone(f0, f1, dur, type, vol, delay) {
  if (!AC || G.muted) return;
  try {
    const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol === undefined ? 0.5 : vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) {}
}
const SND = {
  dot: function () { dotAlt ^= 1; tone(dotAlt ? 392 : 523, 0, 0.05, 'square', 0.3); },
  pellet: function () { tone(300, 900, 0.18, 'sawtooth', 0.4); tone(600, 1200, 0.12, 'square', 0.25, 0.1); },
  ghost: function () { tone(180, 1500, 0.28, 'sawtooth', 0.45); tone(1500, 600, 0.1, 'square', 0.2, 0.28); },
  fruit: function () { [659, 784, 988, 1319].forEach(function (f, i) { tone(f, 0, 0.09, 'triangle', 0.5, i * 0.07); }); },
  death: function () { for (let i = 0; i < 6; i++) tone(700 - i * 90, 420 - i * 55, 0.2, 'triangle', 0.5, i * 0.17); tone(120, 60, 0.4, 'sawtooth', 0.4, 1.05); },
  ready: function () { [392, 494, 587, 784, 587, 784].forEach(function (f, i) { tone(f, 0, 0.13, 'square', 0.28, i * 0.15); }); },
  clear: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0, 0.12, 'triangle', 0.5, i * 0.1); }); },
  extra: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0, 0.1, 'square', 0.3, i * 0.08); }); },
  over: function () { [330, 262, 196, 131].forEach(function (f, i) { tone(f, f * 0.9, 0.3, 'sawtooth', 0.4, i * 0.28); }); }
};
G.snd = SND;
function handleEvents() {
  const ev = sim.events; if (!ev.length) return;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i]; if (SND[e.t]) SND[e.t]();
    if (e.t === 'mode' || e.t === 'ready') { /* nothing visual */ }
  }
  ev.length = 0;
}

// ---------------------------------------------------------------- camera / steering (3D)
function basis() {
  const c = G.cam, cY = Math.cos(c.yaw), sY = Math.sin(c.yaw), cP = Math.cos(c.pitch), sP = Math.sin(c.pitch);
  return { right: [cY, 0, sY], up: [-sY * sP, cP, cY * sP], fwd: [-sY * cP, -sP, cY * cP] };
}
function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
const CAM_RATE = 5.5;
function depthAxis(b) { b = b || basis(); let dp = 0; for (let a = 1; a < 3; a++) if (Math.abs(b.fwd[a]) > Math.abs(b.fwd[dp])) dp = a; return dp; }
// the screen direction (up = +y) of grid direction d under the current camera
function dirScreen(d, b) { b = b || basis(); const a = d >> 1, s = d & 1 ? -1 : 1; return [b.right[a] * s, b.up[a] * s]; }
// grid direction chosen by a screen vector: only the two axes that are not the depth axis are selectable
function resolveDir(sx, sy) {
  if (D === 2) { if (Math.abs(sx) >= Math.abs(sy)) return sx >= 0 ? 0 : 1; return sy >= 0 ? 2 : 3; }
  const l = Math.hypot(sx, sy); if (l < 1e-9) return -1; sx /= l; sy /= l;
  const b = basis(), dp = depthAxis(b); let best = -1, bd = 0.05;
  for (let a = 0; a < 3; a++) { if (a === dp) continue; for (let s = 0; s < 2; s++) { const d = a * 2 + s, v = dirScreen(d, b), dot = v[0] * sx + v[1] * sy; if (dot > bd) { bd = dot; best = d; } } }
  return best;
}
function canSteerDir(d) { if (D === 2) return true; const v = dirScreen(d); return resolveDir(v[0], v[1]) === d; }
function axisSteerable(a) { return depthAxis() !== a; }
G.basis = basis; G.depthAxis = depthAxis; G.resolveDir = resolveDir; G.canSteerDir = canSteerDir; G.dirScreen = dirScreen;
function camStep(dt) {
  const c = G.cam; G.camRot = false;
  if (c.tYaw !== null) { const d = wrapPi(c.tYaw - c.yaw), m = CAM_RATE * dt; G.camRot = true; if (Math.abs(d) <= m) { c.yaw = c.tYaw; c.tYaw = null; } else c.yaw = wrapPi(c.yaw + Math.sign(d) * m); }
  if (c.tPitch !== null) { const d = c.tPitch - c.pitch, m = CAM_RATE * dt; G.camRot = true; if (Math.abs(d) <= m) { c.pitch = c.tPitch; c.tPitch = null; } else c.pitch += Math.sign(d) * m; }
  let ry = 0, rp = 0; const k = G.keys;
  if (k.q) ry -= 1; if (k.e) ry += 1; if (k.shiftLeft) ry -= 1; if (k.shiftRight) ry += 1; if (k.shiftUp) rp += 1; if (k.shiftDown) rp -= 1;
  if (ry || rp) { c.tYaw = c.tPitch = null; c.yaw = wrapPi(c.yaw + ry * 1.8 * dt); c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch + rp * 1.4 * dt)); }
  if (G.mode === 'start') c.yaw = wrapPi(c.yaw + dt * 0.15);
}
// view target in which grid axis a is the depth axis (as little rotation as possible)
function aimDepth(a) {
  const f = basis().fwd.slice(), sg = f[a] >= 0 ? 1 : -1, g = [f[0], f[1], f[2]]; g[a] = 0;
  let l = Math.hypot(g[0], g[1], g[2]); if (l < 1e-6) { g[(a + 1) % 3] = 1; l = 1; }
  const t = [g[0] / l * 0.5, g[1] / l * 0.5, g[2] / l * 0.5]; t[a] = sg * 0.86;
  const n = Math.hypot(t[0], t[1], t[2]); for (let i = 0; i < 3; i++) t[i] /= n;
  G.cam.tYaw = Math.atan2(-t[0], t[2]); G.cam.tPitch = Math.max(-1.4, Math.min(1.4, Math.asin(Math.max(-1, Math.min(1, -t[1])))));
  G.camAim = a;
}
G.aimDepth = aimDepth;

// ---------------------------------------------------------------- auto player / hint
function pathDirs(pl) {
  const m = sim.maze, ND = sim.ND, out = [];
  for (let i = 0; i + 1 < pl.nodes.length; i++) { const u = pl.nodes[i]; for (let d = 0; d < ND; d++) if (m.nb[u * ND + d] === pl.nodes[i + 1]) { out.push(d); break; } }
  return out;
}
function neededAxes(pl) {   // axes of the next steering actions along the guide plan
  const c = sim.chomper, dirs = pathDirs(pl), S = []; let prev = c.d;
  for (let i = 0; i < dirs.length && i < 6; i++) { if (dirs[i] !== prev) { const a = dirs[i] >> 1; if (S.indexOf(a) < 0) S.push(a); if (S.length >= 2) break; prev = dirs[i]; } }
  return S;
}
function steerCameraFor(S) {
  if (!S.length) return;
  const dp = depthAxis(), blocked = S.indexOf(dp) >= 0;
  if (!blocked) return;
  if (G.cam.tYaw !== null && G.camAim !== undefined && S.indexOf(G.camAim) < 0) return;      // already on its way to a good pose
  let a;
  if (S.length >= 2) a = 3 - S[0] - S[1];
  else { const f = basis().fwd; a = -1; for (let k = 0; k < 3; k++) if (S.indexOf(k) < 0 && (a < 0 || Math.abs(f[k]) > Math.abs(f[a]))) a = k; }
  aimDepth(a);
}
function planOpts(extra) { const o = { lastQ: G.lastPlanQ }; if (D === 3) o.canSteer = canSteerDir; if (extra) for (const k in extra) o[k] = extra[k]; return o; }
function autoControl(dt) {
  if (sim.phase !== 'play') return;
  const c = sim.chomper; G.autoT -= dt;
  if (c.a === G.autoNode && G.autoT > 0) return;
  G.autoNode = c.a; G.autoT = 0.1;
  if (D === 3) { const U = MC.plan(sim, { lastQ: G.lastPlanQ, rollout: false, commit: false }); steerCameraFor(neededAxes(U)); }
  const p = MC.planSmart(sim, planOpts());
  G.lastPlanQ = p.q; G.planMode = p.mode;
  if (D === 3 && p.q !== c.d && !canSteerDir(p.q)) return;
  sim.setQueue(p.q);
}
window.giveHint = function () {
  if (G.mode !== 'play' || sim.phase === 'over') return false;
  const p = MC.planSmart(sim, { lastQ: G.lastPlanQ, commit: false });
  G.hint = { dir: p.q, t0: sim.time, until: sim.time + 1.0, armed: false, rotUntil: sim.time + 0.9 };
  if (D === 3 && p.q !== sim.chomper.d && !canSteerDir(p.q)) { const a = p.q >> 1, f = basis().fwd; let k = -1; for (let i = 0; i < 3; i++) if (i !== a && (k < 0 || Math.abs(f[i]) > Math.abs(f[k]))) k = i; aimDepth(k); G.hint.until = sim.time + 1.6; }
  else { sim.setQueue(p.q); G.hint.armed = true; }
  return true;
};
function hintStep() {
  const H = G.hint; if (!H) return;
  if (!H.armed && (canSteerDir(H.dir) || sim.time > H.rotUntil + 0.8)) { if (canSteerDir(H.dir)) { sim.setQueue(H.dir); H.armed = true; H.until = sim.time + 1.0; } else H.armed = true; }
  if (sim.time > H.until) G.hint = null;
}

// ---------------------------------------------------------------- game flow
function newGame() {
  sim.newGame(); G.mode = 'play'; G.hint = null; G.lastPlanQ = -1; G.autoNode = -1; G.final = null; G.cam.tYaw = G.cam.tPitch = null; G.autoRestartAt = 0; G.stats.games++;
  SND.ready();
}
function endGame() {
  G.mode = 'over'; G.final = { score: sim.score, level: sim.level }; if (sim.score > G.best) { G.best = sim.score; saveBest(); } G.hint = null; G.autoRestartAt = sim.time + 2.0;
}
function tick(dt) {
  if (D === 3) camStep(dt);
  G.flashT += dt;
  if (G.mode === 'play') {
    if (G.auto) autoControl(dt); else hintStep();
    sim.step(dt); handleEvents();
    if (sim.score > G.best) { G.best = sim.score; if (sim.time - (G.lastSave || 0) > 5) { G.lastSave = sim.time; saveBest(); } }
    if (sim.phase === 'over' && G.mode === 'play') endGame();
  } else if (G.mode === 'over') {
    sim.time += dt;
    if (G.auto && !G.noAutoRestart && sim.time >= G.autoRestartAt) newGame();
  } else sim.time += dt;
}
G.tick = tick;
window.newGame = function () { newGame(); };
window.toggleAuto = function () {
  G.auto = !G.auto; G.autoNode = -1; G.hint = null;
  if (G.auto && G.mode !== 'play') newGame();
  reportAuto(); return G.auto;
};

// ---------------------------------------------------------------- layout
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  G.dpr = dpr; G.w = canvas.width = Math.max(2, Math.floor((canvas.clientWidth || window.innerWidth) * dpr)); G.h = canvas.height = Math.max(2, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
  G.U = Math.max(0.6 * dpr, Math.min(2 * dpr, Math.min(G.w, G.h) / 520));
  R.resize && R.resize(G);
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- pointer
function hitBtn(x, y) { const b = G.btn; return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
function pos(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * G.w / r.width, y: (e.clientY - r.top) * G.h / r.height }; }
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
canvas.addEventListener('pointerdown', function (e) {
  audioInit();
  const p = pos(e); if (e.pointerType === 'touch') G.touchSeen = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
  if (G.mode !== 'play') { if (hitBtn(p.x, p.y)) newGame(); e.preventDefault(); return; }
  let role;
  if (D === 2) role = 'swipe';
  else if (e.pointerType === 'mouse' && e.button === 2) role = 'rotate';
  else { const hs = R.chomperScreen(G); role = Math.hypot(p.x - hs.x, p.y - hs.y) <= Math.max(46 * G.U, hs.r * 2.4) ? 'steer' : 'rotate'; }
  G.ptrs[e.pointerId] = { role: role, x: p.x, y: p.y, ax: p.x, ay: p.y, type: e.pointerType };
  if (role === 'steer') G.steerPtr = { x: p.x, y: p.y, id: e.pointerId };
  if (D === 3 && role === 'rotate') G.cam.tYaw = G.cam.tPitch = null;
  e.preventDefault();
});
function steerFromPtr() {
  if (!G.steerPtr) return; const hs = R.chomperScreen(G), sx = G.steerPtr.x - hs.x, sy = -(G.steerPtr.y - hs.y);
  if (sx * sx + sy * sy < 14 * 14 * G.U * G.U) return;
  const d = resolveDir(sx, sy); if (d >= 0) { sim.setQueue(d); G.lastInput = d; }
}
canvas.addEventListener('pointermove', function (e) {
  const p = pos(e), q = G.ptrs[e.pointerId]; if (!q) return;       // no hover control: only a pressed pointer does anything
  if (q.role === 'swipe') {
    const dx = (p.x - q.ax) / G.dpr, dy = (p.y - q.ay) / G.dpr;
    if (Math.hypot(dx, dy) > 20) { const d = resolveDir(dx, dy); sim.setQueue(d); G.lastInput = d; q.ax = p.x; q.ay = p.y; }
  } else if (q.role === 'rotate') { const c = G.cam; c.yaw = wrapPi(c.yaw - (p.x - q.x) * 0.008 / G.dpr); c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch + (p.y - q.y) * 0.008 / G.dpr)); }
  else if (q.role === 'steer' && G.steerPtr) { G.steerPtr.x = p.x; G.steerPtr.y = p.y; steerFromPtr(); }
  q.x = p.x; q.y = p.y;
});
function up(e) { const q = G.ptrs[e.pointerId]; if (!q) return; if (q.role === 'steer') G.steerPtr = null; delete G.ptrs[e.pointerId]; }
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

// ---------------------------------------------------------------- keyboard
const KMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' };
window.addEventListener('keydown', function (e) {
  if (embedded() && /^F[2345]$/.test(e.key)) return;               // the shell forwards F2..F5 itself (handling them here too would toggle twice)
  if (e.key === 'F2') { e.preventDefault(); newGame(); return; } if (e.key === 'F3') { e.preventDefault(); window.toggleAuto(); return; } if (e.key === 'F4') { e.preventDefault(); window.giveHint(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  audioInit();
  if (G.mode !== 'play' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); newGame(); return; }
  if (e.key === 'm' || e.key === 'M') { G.muted = !G.muted; try { localStorage.setItem(KEY_MUTE, G.muted ? '1' : '0'); } catch (x) {} return; }
  const m = KMAP[e.key];
  if (m) {
    e.preventDefault(); if (G.mode !== 'play') return;
    if (D === 3 && e.shiftKey) { G.keys['shift' + m[0].toUpperCase() + m.slice(1)] = true; return; }
    const v = m === 'left' ? [-1, 0] : m === 'right' ? [1, 0] : m === 'up' ? [0, 1] : [0, -1];
    const d = D === 2 ? resolveDir(v[0], -v[1]) : resolveDir(v[0], v[1]);
    if (d >= 0) { sim.setQueue(d); G.lastInput = d; }
    return;
  }
  const k = e.key.toLowerCase();
  if (D === 3 && (k === 'q' || k === 'e')) { G.keys[k] = true; G.cam.tYaw = G.cam.tPitch = null; e.preventDefault(); }
});
window.addEventListener('keyup', function (e) {
  const m = KMAP[e.key];
  if (m) { const c = m[0].toUpperCase() + m.slice(1); G.keys['shift' + c] = false; return; }
  G.keys[e.key.toLowerCase()] = false;
});
window.addEventListener('blur', function () { G.keys = {}; G.ptrs = {}; G.steerPtr = null; });

// ---------------------------------------------------------------- HUD + overlays
function font(px, bold) { return (bold === false ? '' : 'bold ') + Math.round(px * G.U) + 'px ui-monospace, Menlo, Consolas, "Courier New", monospace'; }
function neon(txt, x, y, px, col, align) { ctx.font = font(px); ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.shadowColor = col; ctx.shadowBlur = 7 * G.U; ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.shadowBlur = 0; }
G.neon = neon; G.font = font;
function drawHud() {
  const U = G.U, w = G.w, h = G.h, S = window.MCSprites;
  if (G.mode === 'start') return;
  neon(T('점수', 'SCORE') + ' ' + sim.score, 10 * U, 14 * U, 13, '#fff1f8');
  neon(T('최고', 'BEST') + ' ' + Math.max(G.best, sim.score), w - 10 * U, 14 * U, 11, '#ffe14a', 'right');
  neon(T('레벨', 'LV') + ' ' + sim.level, w / 2, 14 * U, 12, '#7ff0e0', 'center');
  // lives (bottom left) and fruit history (bottom right)
  const by = h - 14 * U;
  for (let i = 0; i < Math.min(sim.lives, 7); i++) S.drawChomper(ctx, 18 * U + i * 24 * U, by, 8 * U, 0.0, 0.5, 0);
  if (sim.lives > 7) neon('x' + sim.lives, 18 * U + 7 * 24 * U, by, 11, '#c9ffb8');
  for (let i = 0; i < Math.min(sim.level, 5); i++) S.drawFruit(ctx, ((sim.level - 1 - i) % 8 + 8) % 8, w - 18 * U - i * 24 * U, by, 8 * U);
  if (G.auto) neon(T('자동 플레이 (F3 끄기)', 'AUTO PLAY (F3 to stop)'), w / 2, 30 * U, 10, '#ffe14a', 'center');
  if (G.hint) neon(T('힌트: 추천 방향', 'HINT: suggested move') + (D === 3 && !G.hint.armed ? '  (' + T('시점 회전 중', 'rotating view') + ')' : ''), w / 2, 44 * U, 10, '#ffe14a', 'center');
  if (G.mode === 'play' && sim.phase === 'ready') neon(T('준비!', 'READY!'), w / 2, h * (D === 2 ? 0.56 : 0.2), 22, '#ffe14a', 'center');
  if (G.mode === 'play' && sim.phase === 'clear') neon(T('레벨 클리어!', 'LEVEL CLEAR!'), w / 2, h * 0.5, 24, '#7ff0e0', 'center');
}
function button(txt, cx, cy, col) {
  const U = G.U, bw = 150 * U, bh = 40 * U, x = cx - bw / 2, y = cy - bh / 2;
  const g = ctx.createLinearGradient(x, y, x + bw, y); g.addColorStop(0, 'rgba(255,95,176,0.4)'); g.addColorStop(1, 'rgba(124,240,90,0.4)');
  ctx.fillStyle = g; ctx.strokeStyle = col; ctx.lineWidth = 2.5 * U; ctx.shadowColor = col; ctx.shadowBlur = 12 * U;
  ctx.beginPath(); ctx.rect(x, y, bw, bh); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.font = font(18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(txt, cx, cy + 1);
  G.btn = { x: x, y: y, w: bw, h: bh };
}
function wrapText(txt, maxW, x, y, lh) {
  const words = KO ? txt.split('') : txt.split(' '); let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + (KO ? '' : ' ');
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = words[i] + (KO ? '' : ' '); } else line = test;
  }
  ctx.fillText(line, x, y); return y + lh;
}
function drawOverlay() {
  G.btn = null; if (G.mode === 'play') return;
  const U = G.U, w = G.w, h = G.h, cx = w / 2, S = window.MCSprites;
  ctx.fillStyle = 'rgba(6,2,22,0.68)'; ctx.fillRect(0, 0, w, h);
  const t = performance.now() / 1000;
  let y = h * 0.2;
  ctx.font = font(Math.min(46, w / U / (KO ? 8 : 11))); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const title = G.mode === 'start' ? T('미로 먹보', 'MAZE CHOMPER') : T('게임 오버', 'GAME OVER');
  ctx.shadowColor = '#ff5fb0'; ctx.shadowBlur = 20 * U; ctx.fillStyle = G.mode === 'start' ? '#c9ffb8' : '#ff6a8a'; ctx.fillText(title, cx, y); ctx.shadowBlur = 0;
  y += 40 * U;
  // little parade: chomper chasing a frightened chaser
  if (G.mode === 'start') {
    const px = cx + Math.sin(t * 1.3) * w * 0.25, dir = Math.cos(t * 1.3) > 0 ? 0 : Math.PI;
    S.drawChomper(ctx, px, y, 15 * U, dir, 0.1 + 0.35 * Math.abs(Math.sin(t * 9)), 0);
    S.drawGhost(ctx, px + (dir === 0 ? 38 : -38) * U, y, 13 * U, 0, Math.cos(dir), 0, false, false, t);
    y += 34 * U;
  }
  neon(D === 3 ? '3D' : '2D', cx, y, 20, '#7ff0e0', 'center'); y += 34 * U;
  if (G.mode === 'over' && G.final) {
    neon(T('점수', 'SCORE') + ' ' + G.final.score + '    ' + T('레벨', 'LEVEL') + ' ' + G.final.level, cx, y, 17, '#ffffff', 'center'); y += 28 * U;
    neon(T('최고 기록', 'BEST') + ' ' + G.best, cx, y, 15, '#ffe14a', 'center'); y += 36 * U;
  } else {
    ctx.font = font(12, false); ctx.fillStyle = '#d6c8ff'; ctx.textAlign = 'left'; const mw = Math.min(w - 40 * U, 460 * U);
    const hint = D === 2 ? T('점을 모두 먹으세요! 방향키/WASD 또는 화면을 밀어서(스와이프) 조종, 큰 별을 먹으면 추격자를 잡을 수 있어요.', 'Eat every dot! Steer with arrows/WASD or swipe; a big star lets you chase the chasers.')
      : T('점을 모두 먹으세요! 먹보를 누른 채 끌면 조종, 다른 곳을 끌면 시점 회전 (조종은 화면과 수직인 평면 안에서만).', 'Eat every dot! Press and drag ON the chomper to steer; drag elsewhere to rotate the view (steering works in the screen plane only).');
    y = wrapText(hint, mw, cx - mw / 2, y, 16 * U) + 8 * U;
    if (G.best) { neon(T('최고 기록', 'BEST') + ' ' + G.best, cx, y, 14, '#ffe14a', 'center'); y += 28 * U; }
  }
  button(G.mode === 'start' ? T('시작', 'START') : T('다시 하기', 'RETRY'), cx, Math.min(h - 40 * U, y + 20 * U), G.mode === 'start' ? '#7cf05a' : '#ff5fb0');
  neon(T('도움말 > 치트: 자동 플레이 F3 / 힌트 F4', 'Help > Cheat: Auto play F3 / Hint F4'), cx, h - 12 * U, 9, '#9a8ad0', 'center');
}

// ---------------------------------------------------------------- main loop
let last = 0, acc = 0, fpsT = 0, fpsN = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
  fpsT += dt; fpsN++; if (fpsT > 1) { G.fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
  if (!G.stopped) { acc += dt; let n = 0; while (acc >= 1 / 60 && n < 6) { tick(1 / 60); acc -= 1 / 60; n++; } if (n === 6) acc = 0; }
  R.draw(G, dt);
  drawHud(); drawOverlay();
}
const R = window.MCRender;
resize(); R.init && R.init(G);
requestAnimationFrame(frame);

window.__mc = {
  G: G, sim: sim, basis: basis,
  step: function (n) { for (let i = 0; i < (n || 1); i++) tick(1 / 60); },
  start: function () { newGame(); return sim; },
  setView: function (yaw, pitch) { G.cam.yaw = yaw; G.cam.pitch = pitch; G.cam.tYaw = G.cam.tPitch = null; },
  steerable: function () { const r = []; for (let d = 0; d < 6; d++) if (canSteerDir(d)) r.push(d); return r; },
  resolve: resolveDir, depthAxis: depthAxis,
  chomper: function () { const h = R.chomperScreen(G); return { x: h.x / G.dpr, y: h.y / G.dpr, r: h.r / G.dpr }; },
  btn: function () { const b = G.btn; return b && { x: (b.x + b.w / 2) / G.dpr, y: (b.y + b.h / 2) / G.dpr }; },
  stop: function (v) { G.stopped = v !== false; }
};
})();
