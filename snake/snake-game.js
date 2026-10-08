// Snake (slither.io style) page logic shared by the 2D and 3D versions: input, fixed-step loop, game states, auto player / hint, HUD and overlays.
// The renderer (render2d.js / render3d.js) draws the world and tells us where the player's head is on the screen.
(function () {
'use strict';
const D = window.SNAKE_D, KO = /^ko/i.test(navigator.language || ''), T = function (ko, en) { return KO ? ko : en; };
const canvas = document.getElementById('app'), ctx = canvas.getContext('2d');
const botsQ = parseInt(new URLSearchParams(location.search).get('bots'), 10);
const sim = SnakeSim.make({ D: D, rng: window.SNAKE_RNG, conf: botsQ >= 0 ? { bots: botsQ } : undefined });
const G = window.G = { D, KO, T, sim, canvas, ctx, mode: 'start', auto: false, hint: null, w: 1, h: 1, U: 1, dpr: 1, best: 0, touchSeen: false, ptrs: {}, ptr: { x: 0, y: 0, has: false }, steerPtr: null, keys: {}, btn: null, paused: false,
  cam: { yaw: 0.6, pitch: 0.5, tYaw: null, tPitch: null, x: sim.W / 2, y: sim.W / 2, scale: 0.3 }, fps: 60, autoRestartAt: 0, final: null, lastSave: 0, hintMsg: '', hintMsgT: 0 };
const KEY_BEST = 'snake' + D + 'd_best';
try { G.best = parseInt(localStorage.getItem(KEY_BEST), 10) || 0; } catch (e) {}
function saveBest() { try { localStorage.setItem(KEY_BEST, String(G.best)); } catch (e) {} }
const embedded = function () { try { return window.parent !== window && !!window.parent.setAutoMark; } catch (e) { return false; } };
function reportAuto() { try { if (window.parent !== window && window.parent.setAutoMark) window.parent.setAutoMark(G.auto); } catch (e) {} }

// ---- camera helpers (3D) ----
function basis() {
  const c = G.cam, cY = Math.cos(c.yaw), sY = Math.sin(c.yaw), cP = Math.cos(c.pitch), sP = Math.sin(c.pitch);
  return { right: [cY, 0, sY], up: [-sY * sP, cP, cY * sP], fwd: [-sY * cP, -sP, cY * cP] };
}
function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
const CAM_RATE = 6.5;      // rad/s: a typical view change of ~1 rad takes ~150-250 ms
function camStep(dt) {
  const c = G.cam;
  if (c.tYaw !== null) { const d = wrapPi(c.tYaw - c.yaw), m = CAM_RATE * dt; if (Math.abs(d) <= m) { c.yaw = c.tYaw; c.tYaw = null; } else c.yaw = wrapPi(c.yaw + Math.sign(d) * m); }
  if (c.tPitch !== null) { const d = c.tPitch - c.pitch, m = CAM_RATE * dt; if (Math.abs(d) <= m) { c.pitch = c.tPitch; c.tPitch = null; } else c.pitch += Math.sign(d) * m; }
  let ry = 0, rp = 0; const k = G.keys;
  if (k.q) ry -= 1; if (k.e) ry += 1; if (k.shiftLeft) ry -= 1; if (k.shiftRight) ry += 1; if (k.shiftUp) rp += 1; if (k.shiftDown) rp -= 1; if (k.r) rp += 1; if (k.f) rp -= 1;
  if (ry || rp) { c.tYaw = c.tPitch = null; c.yaw = wrapPi(c.yaw + ry * 1.8 * dt); c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch + rp * 1.4 * dt)); }
}
// aim the camera depth axis perpendicular to the plane in which the heading has to turn (the same view change a user would make)
function planCamera(h, d) {
  const n = sim.cross(h, d), l = Math.sqrt(sim.dot(n, n)); if (l < 0.12) return;
  for (let i = 0; i < 3; i++) n[i] /= l;
  const f = basis().fwd;
  const cand = [n, [-n[0], -n[1], -n[2]]];
  let best = null, bs = 1e9;
  for (const q of cand) { const ang = Math.acos(Math.max(-1, Math.min(1, sim.dot(q, f)))); const pit = Math.asin(Math.max(-1, Math.min(1, -q[1]))); const s = ang + (pit < -0.2 ? 0.7 : 0); if (s < bs) { bs = s; best = q; } }
  // already (nearly) aligned with a target we are moving to? keep it (hysteresis)
  const cur = G.cam.tYaw !== null || G.cam.tPitch !== null ? tfwd() : f;
  if (Math.acos(Math.max(-1, Math.min(1, sim.dot(best, cur)))) < 0.3) return;
  G.cam.tYaw = Math.atan2(-best[0], best[2]); G.cam.tPitch = Math.max(-1.45, Math.min(1.45, Math.asin(Math.max(-1, Math.min(1, -best[1])))));
}
function tfwd() { const yaw = G.cam.tYaw === null ? G.cam.yaw : G.cam.tYaw, pit = G.cam.tPitch === null ? G.cam.pitch : G.cam.tPitch; return [-Math.sin(yaw) * Math.cos(pit), -Math.sin(pit), Math.cos(yaw) * Math.cos(pit)]; }
// how well the camera is aligned for a turn from h to d (angle between depth axis and the turn plane normal), small = good
function camError(h, d) { const n = sim.cross(h, d), l = Math.sqrt(sim.dot(n, n)); if (l < 0.12) return 0; const c = Math.abs(sim.dot(n, basis().fwd)) / l; return Math.acos(Math.min(1, c)); }

// ---- input -> steering ----
function keyVec() { const k = G.keys; return [(k.right ? 1 : 0) - (k.left ? 1 : 0), (k.up ? 1 : 0) - (k.down ? 1 : 0)]; }
function inputTw(P) {
  const kv = keyVec(), hs = R.headScreen(G);
  if (D === 2) {
    if (kv[0] || kv[1]) return [kv[0], -kv[1]];                       // screen y points down = world y
    if (G.steerPtr) { const dx = G.steerPtr.x - hs.x, dy = G.steerPtr.y - hs.y; if (dx * dx + dy * dy > 10 * 10 * G.U * G.U) return [dx, dy]; }
    return null;
  }
  let sx = 0, sy = 0;
  if (kv[0] || kv[1]) { sx = kv[0]; sy = kv[1]; }
  else if (G.steerPtr) { sx = G.steerPtr.x - hs.x; sy = -(G.steerPtr.y - hs.y); if (sx * sx + sy * sy < 14 * 14 * G.U * G.U) { sx = sy = 0; } }
  if (!sx && !sy) return null;
  const b = basis(); return [b.right[0] * sx + b.up[0] * sy, b.right[1] * sx + b.up[1] * sy, b.right[2] * sx + b.up[2] * sy];
}
function wantBoost() {
  if (G.keys.space) return true;
  for (const id in G.ptrs) if (G.ptrs[id].role === 'boost' || G.ptrs[id].mouseBoost) return true;
  return false;
}

// ---- game flow ----
let autoNext = 0, autoDec = null;
function startGame() { autoNext = 0; autoDec = null; G.mode = 'play'; G.hint = null; G.final = null; const P = sim.spawnPlayer(); if (D === 3) { G.cam.tYaw = G.cam.tPitch = null; } return P; }
function newGame() { sim.reset(); G.hint = null; G.cam.tYaw = G.cam.tPitch = null; startGame(); G.autoRestartAt = 0; }
function endGame() {
  const P = sim.player; G.mode = 'over'; G.final = { len: Math.round(P.mass), kills: P.kills, why: sim.events.length ? sim.events[sim.events.length - 1].why : '' };
  if (G.final.len > G.best) { G.best = G.final.len; saveBest(); }
  G.autoRestartAt = sim.time + 1.8; G.hint = null;
}
function tick(dt) {
  const P = sim.player;
  if (D === 3) camStep(dt);
  if (G.mode === 'play' && P && P.alive) {
    let tw = null, boost = false;
    if (G.auto) {
      if (sim.ticks >= autoNext) {
        autoDec = SnakeSim.aiDecide(sim, P, SnakeSim.AUTO_P); autoNext = sim.ticks + 3;
        if (D === 3) planCamera(P.h, autoDec.tw);
      }
      if (autoDec) { tw = autoDec.tw; boost = autoDec.boost; }
      if (D === 3) { const e = camError(P.h, tw); G.autoCamErr = e; }
    } else if (G.hint && sim.time < G.hint.until) {
      const H = G.hint;
      if (!H.armed && (D === 2 || camError(P.h, H.tw) < 0.45 || sim.time > H.t0 + 0.6)) { H.armed = true; H.steerUntil = sim.time + 1.0; }
      if (H.armed && sim.time < H.steerUntil) tw = H.tw;
      boost = wantBoost();
      if (!tw) tw = inputTw(P);
    } else { tw = inputTw(P); boost = wantBoost(); G.hint = null; }
    if (D === 2) { if (tw) { const l = Math.hypot(tw[0], tw[1]); if (l > 1e-9) P.tw = [tw[0] / l, tw[1] / l]; } }
    else { P.tw = tw ? sim.norm(tw.slice()) : null; P.fwd = basis().fwd; }
    P.boost = boost;
    if (D === 3 && tw && P.tw) { const dd = sim.dot(P.tw, P.h); if (dd > -2) { /* record for tests */ } }
  }
  sim.step(dt);
  if (G.mode === 'play' && P && !P.alive) endGame();
  if (G.mode === 'play' && P && P.alive) { const m = Math.round(P.mass); if (m > G.best) { G.best = m; if (sim.time - G.lastSave > 5) { G.lastSave = sim.time; saveBest(); } } }
  if (G.mode === 'over' && G.auto && sim.time >= G.autoRestartAt) { startGame(); }
  if (sim.events.length > 50) sim.events.length = 0;
}
G.tick = tick;

// ---- public hooks (shell menu / F-keys) ----
window.newGame = function () { newGame(); };
window.toggleAuto = function () {
  G.auto = !G.auto; autoNext = 0; autoDec = null; G.hint = null;
  if (G.auto && G.mode !== 'play') { if (G.mode === 'start') newGame(); else startGame(); }
  if (G.auto) { G.autoMsgT = 3; }
  reportAuto(); return G.auto;
};
window.giveHint = function () {
  if (G.mode !== 'play' || !sim.player || !sim.player.alive) return false;
  const P = sim.player, dec = SnakeSim.aiDecide(sim, P, SnakeSim.AUTO_P);
  G.hint = { tw: dec.tw.slice(), t0: sim.time, until: sim.time + 1.4, armed: D === 2, steerUntil: sim.time + 1.0, boost: dec.boost };
  if (D === 3) planCamera(P.h, dec.tw);
  return true;
};

// ---- layout ----
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  G.dpr = dpr; G.w = canvas.width = Math.max(2, Math.floor((canvas.clientWidth || window.innerWidth) * dpr)); G.h = canvas.height = Math.max(2, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
  G.U = Math.max(0.7 * dpr, Math.min(2 * dpr, Math.min(G.w, G.h) / 520));
  R.resize && R.resize(G);
}
window.addEventListener('resize', resize);

// ---- pointer ----
function hitBtn(x, y) { const b = G.btn; return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
function pos(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * G.w / r.width, y: (e.clientY - r.top) * G.h / r.height }; }
function boostZone(x, y) { const cx = G.w - 62 * G.U, cy = G.h - 62 * G.U; return G.touchSeen && Math.hypot(x - cx, y - cy) < 48 * G.U; }
G.boostZone = function () { return { x: G.w - 62 * G.U, y: G.h - 62 * G.U, r: 40 * G.U }; };
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
canvas.addEventListener('pointerdown', function (e) {
  const p = pos(e); if (e.pointerType === 'touch') G.touchSeen = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
  if (G.mode !== 'play') { if (hitBtn(p.x, p.y)) { if (G.mode === 'start') newGame(); else startGame(); } return; }
  const n = Object.keys(G.ptrs).length; let role;
  if (e.pointerType === 'touch' && boostZone(p.x, p.y)) role = 'boost';
  else if (e.pointerType === 'mouse' && e.button === 2) role = D === 3 ? 'rotate' : 'boost';
  else if (n > 0) role = 'boost';
  else { const hs = R.headScreen(G); const onHead = Math.hypot(p.x - hs.x, p.y - hs.y) <= Math.max(46 * G.U, hs.r * 2.4); role = onHead ? 'steer' : (D === 3 ? 'rotate' : 'none'); }
  G.ptrs[e.pointerId] = { role: role, x: p.x, y: p.y, type: e.pointerType };
  if (role === 'steer') { G.steerPtr = { x: p.x, y: p.y, id: e.pointerId }; }
  if (D === 3 && role === 'rotate') G.cam.tYaw = G.cam.tPitch = null;
  e.preventDefault();
});
canvas.addEventListener('pointermove', function (e) {
  const p = pos(e); if (e.pointerType === 'touch') G.touchSeen = true;
  const q = G.ptrs[e.pointerId];
  if (!q) return;
  if (q.role === 'rotate') { const c = G.cam; c.yaw = wrapPi(c.yaw - (p.x - q.x) * 0.008 / G.dpr); c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch + (p.y - q.y) * 0.008 / G.dpr)); }
  if (q.role === 'steer' && G.steerPtr) { G.steerPtr.x = p.x; G.steerPtr.y = p.y; }
  q.x = p.x; q.y = p.y;
});
function up(e) { const q = G.ptrs[e.pointerId]; if (!q) return; if (q.role === 'steer') { G.steerPtr = null; } delete G.ptrs[e.pointerId]; }
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

// ---- keyboard ----
const KMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' };
window.addEventListener('keydown', function (e) {
  if (embedded() && /^F[2345]$/.test(e.key)) return;               // the shell forwards F2..F5 itself (handling them here too would toggle twice)
  if (e.key === 'F2') { e.preventDefault(); newGame(); return; } if (e.key === 'F3') { e.preventDefault(); window.toggleAuto(); return; } if (e.key === 'F4') { e.preventDefault(); window.giveHint(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (G.mode !== 'play' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (G.mode === 'start') newGame(); else startGame(); return; }
  const m = KMAP[e.key];
  if (m) {
    e.preventDefault();
    if (D === 3 && e.shiftKey) { G.keys['shift' + m[0].toUpperCase() + m.slice(1)] = true; if (m === 'left') G.keys.shiftLeft = true; }
    else G.keys[m] = true;
    return;
  }
  if (e.key === ' ') { e.preventDefault(); G.keys.space = true; return; }
  const k = e.key.toLowerCase();
  if (D === 3 && (k === 'q' || k === 'e' || k === 'r' || k === 'f')) { G.keys[k] = true; G.cam.tYaw = G.cam.tPitch = null; e.preventDefault(); }
});
window.addEventListener('keyup', function (e) {
  const m = KMAP[e.key];
  if (m) { G.keys[m] = false; const c = m[0].toUpperCase() + m.slice(1); G.keys['shift' + c] = false; return; }
  if (e.key === ' ') { G.keys.space = false; return; }
  G.keys[e.key.toLowerCase()] = false;
});
window.addEventListener('blur', function () { G.keys = {}; G.ptrs = {}; G.steerPtr = null; });

// ---- HUD + overlays ----
function font(px, bold) { return (bold === false ? '' : 'bold ') + Math.round(px * G.U) + 'px ui-monospace, Menlo, Consolas, "Courier New", monospace'; }
function neon(txt, x, y, px, col, align) { ctx.font = font(px); ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.shadowColor = col; ctx.shadowBlur = 8 * G.U; ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.shadowBlur = 0; }
function hudHue(idx) { return R.hueCss ? R.hueCss(idx) : '#fff'; }
function drawHud() {
  const P = sim.player, U = G.U, w = G.w;
  if (G.mode === 'play' && P) {
    neon(T('길이', 'LENGTH') + ' ' + Math.round(P.mass), 12 * U, 18 * U, 15, '#00f0ff');
    neon(T('처치', 'KILLS') + ' ' + P.kills + '   ' + T('최고', 'BEST') + ' ' + Math.max(G.best, Math.round(P.mass)), 12 * U, 38 * U, 11, '#ff5be6');
    if (G.auto) neon(T('자동 플레이 (F3 끄기)', 'AUTO PLAY (F3 to stop)'), 12 * U, 58 * U, 11, '#ffe14a');
    if (D === 3) { const b = basis(), ax = ['X', 'Y', 'Z']; let dp = 0; for (let a = 1; a < 3; a++) if (Math.abs(b.fwd[a]) > Math.abs(b.fwd[dp])) dp = a; G.depthAxis = dp; }
  }
  // leaderboard
  const L = sim.leaders(5), x1 = w - 10 * U; let y = 16 * U;
  ctx.fillStyle = 'rgba(8,2,28,0.55)'; ctx.fillRect(w - 150 * U, 4 * U, 146 * U, (L.length * 15 + 20) * U);
  neon(T('순위', 'LEADERS'), x1, y, 10, '#b69cff', 'right'); y += 15 * U;
  let inTop = false;
  for (let i = 0; i < L.length; i++) {
    const s = L[i]; if (s === P) inTop = true;
    ctx.font = font(10); ctx.textAlign = 'left'; ctx.fillStyle = s === P ? '#00f0ff' : hudHue(s.hue); ctx.fillText((i + 1) + ' ' + (s === P ? T('나', 'YOU') : s.name), w - 145 * U, y);
    ctx.textAlign = 'right'; ctx.fillText(Math.round(s.mass) + (s.kills ? ' (' + s.kills + ')' : ''), x1, y); y += 15 * U;
  }
  if (G.mode === 'play' && P && P.alive && !inTop) { ctx.font = font(10); ctx.textAlign = 'left'; ctx.fillStyle = '#00f0ff'; ctx.fillText(T('나', 'YOU'), w - 145 * U, y + 2 * U); ctx.textAlign = 'right'; ctx.fillText(String(Math.round(P.mass)), x1, y + 2 * U); }
  // touch boost zone
  if (G.mode === 'play' && G.touchSeen) {
    const z = G.boostZone(); let on = wantBoost();
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 6.2832); ctx.fillStyle = on ? 'rgba(255,225,74,0.35)' : 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,225,74,0.7)'; ctx.lineWidth = 2 * U; ctx.stroke();
    ctx.font = font(11); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffe14a'; ctx.fillText(T('부스트', 'BOOST'), z.x, z.y);
  }
  if (G.hint && G.mode === 'play') neon(T('힌트: 추천 방향', 'HINT: suggested heading') + (D === 3 && !G.hint.armed ? '  (' + T('시점 회전 중', 'rotating view') + ')' : ''), w / 2, 20 * U, 12, '#ffe14a', 'center');
}
function button(txt, cx, cy, col) {
  const U = G.U, bw = 150 * U, bh = 40 * U, x = cx - bw / 2, y = cy - bh / 2;
  const g = ctx.createLinearGradient(x, y, x + bw, y); g.addColorStop(0, 'rgba(255,0,200,0.35)'); g.addColorStop(1, 'rgba(0,240,255,0.35)');
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
  const U = G.U, w = G.w, h = G.h, cx = w / 2;
  ctx.fillStyle = 'rgba(6,0,24,0.62)'; ctx.fillRect(0, 0, w, h);
  const t = performance.now() / 1000;
  let y = h * 0.2;
  ctx.font = font(Math.min(54, w / U / 6.5)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const title = G.mode === 'start' ? T('스네이크', 'SNAKE') : T('게임 오버', 'GAME OVER');
  ctx.shadowColor = '#ff00c8'; ctx.shadowBlur = 22 * U; ctx.fillStyle = G.mode === 'start' ? '#ffffff' : '#ff4a7a'; ctx.fillText(title, cx, y); ctx.shadowBlur = 0;
  y += 40 * U;
  neon(D === 3 ? '3D' : '2D', cx, y, 22, '#00f0ff', 'center'); y += 40 * U;
  if (G.mode === 'over' && G.final) {
    neon(T('길이', 'LENGTH') + ' ' + G.final.len + '    ' + T('처치', 'KILLS') + ' ' + G.final.kills, cx, y, 18, '#ffffff', 'center'); y += 26 * U;
    neon(T('최고 기록', 'BEST') + ' ' + G.best, cx, y, 16, '#ffe14a', 'center'); y += 26 * U;
    neon(G.final.why === 'wall' ? T('벽에 부딪혔어요', 'You hit the wall') : T('다른 뱀의 몸에 부딪혔어요', 'You hit another snake'), cx, y, 12, '#ff9ab0', 'center'); y += 34 * U;
  } else {
    ctx.font = font(12, false); ctx.fillStyle = '#c9b8ff'; ctx.textAlign = 'center';
    const lines = D === 2
      ? [T('머리를 누르고 끌어서 조종 (또는 방향키/WASD). 구슬을 먹고 길어지세요.', 'Press the head and drag to steer (or arrows/WASD). Eat orbs to grow.'), T('다른 뱀의 몸에 머리가 닿거나 벽에 닿으면 끝! (상대가 내 몸에 닿는 건 상대가 죽어요)', 'Touch another snake\'s body or the wall with your head and you die. Others that hit YOUR body die.'), T('스페이스 / 오른쪽 버튼 / 두 번째 손가락 / BOOST 영역 = 부스트 (길이를 소모)', 'Space / right button / a second finger / BOOST zone = boost (costs length)')]
      : [T('머리를 누른 채 끌면 조종, 빈 곳을 끌면 시점 회전.', 'Press and drag ON YOUR HEAD to steer; drag anywhere else to rotate the view.'), T('조종은 화면과 수직인 평면 안에서만! 깊이 방향 성분은 시점을 돌려야 바뀌어요.', 'Steering only works in the screen plane; to change the depth part of your heading rotate the view first.'), T('방향키/WASD 조종, Q/E 또는 Shift+방향키 시점 회전, 스페이스 부스트', 'Arrows/WASD steer, Q/E or Shift+arrows rotate the view, Space boosts')];
    ctx.textAlign = 'left'; const mw = Math.min(w - 40 * U, 460 * U);
    for (const ln of lines) { y = wrapText('• ' + ln, mw, cx - mw / 2, y, 16 * U) + 4 * U; }
    y += 6 * U;
    if (G.best) { neon(T('최고 기록', 'BEST') + ' ' + G.best, cx, y, 14, '#ffe14a', 'center'); y += 30 * U; }
  }
  button(G.mode === 'start' ? T('시작', 'START') : T('다시 하기', 'RETRY'), cx, Math.min(h - 40 * U, y + 20 * U), G.mode === 'start' ? '#00f0ff' : '#ff5be6');
  neon(T('도움말 > 치트: 자동 플레이 F3 / 힌트 F4', 'Help > Cheat: Auto play F3 / Hint F4'), cx, h - 14 * U, 10, '#8a78c8', 'center');
}

// ---- main loop ----
let last = 0, acc = 0, fpsT = 0, fpsN = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
  fpsT += dt; fpsN++; if (fpsT > 1) { G.fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
  if (!G.stopped) { acc += dt; let n = 0; while (acc >= 1 / 60 && n < 6) { tick(1 / 60); acc -= 1 / 60; n++; } if (n === 6) acc = 0; }
  R.draw(G, dt);
  drawHud(); drawOverlay();
}
const R = window.SnakeRender;
resize(); sim.reset(); R.init && R.init(G);
requestAnimationFrame(frame);

window.__sn = {
  G: G, sim: sim, basis: basis,
  step: function (n) { for (let i = 0; i < (n || 1); i++) tick(1 / 60); },
  screenDirsOK: function () { return true; },
  setView: function (yaw, pitch) { G.cam.yaw = yaw; G.cam.pitch = pitch; G.cam.tYaw = G.cam.tPitch = null; },
  start: function () { newGame(); return sim.player; },
  head: function () { const h = R.headScreen(G); return { x: h.x / G.dpr, y: h.y / G.dpr, r: h.r / G.dpr }; },
  btn: function () { const b = G.btn; return b && { x: (b.x + b.w / 2) / G.dpr, y: (b.y + b.h / 2) / G.dpr }; },
  stop: function (v) { G.stopped = v !== false; }
};
})();
