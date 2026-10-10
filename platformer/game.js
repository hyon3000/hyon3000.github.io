// Shape Runner - game layer: input, loop, rendering (Canvas2D primitives only), synthesized sound, HUD.
(function () {
'use strict';
var TS = PF.TS, VW = PF.VW, VH = PF.VH, T = PF.T, IN = PF.IN;
var KO = /^ko/i.test(navigator.language || ''), TT = function (ko, en) { return KO ? ko : en; };
var cv = document.getElementById('cv'), ctx = cv.getContext('2d'), stage = document.getElementById('stage'), pad = document.getElementById('pad');
document.documentElement.lang = KO ? 'ko' : 'en';
var Q = new URLSearchParams(location.search);
var BEST_KEY = 'shaperunner.best', SND_KEY = 'shaperunner.sound';
var G = window.__pf = { mode: 'start', n: 1, seed: 1, lives: 3, base: 0, coinBase: 0, best: 0, L: null, st: null, auto: false, planner: PFPlanner.make(), hint: null, msg: null, msgT: 0, frame: 0,
  cam: 0, parts: [], pops: [], bumps: [], snd: true, dieT: 0, clearT: 0, dy: 0, dvy: 0, bonus: 0, nextLife: 50, autoWait: 0, loading: false };
try { G.best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (e) {}
try { var sv = localStorage.getItem(SND_KEY); if (sv === '0') G.snd = false; } catch (e) {}
var embedded = function () { try { return window.parent !== window && !!window.parent.setAutoMark; } catch (e) { return false; } };
function reportAuto() { try { if (window.parent !== window && window.parent.setAutoMark) window.parent.setAutoMark(G.auto); } catch (e) {} }
function reportSound() { try { if (window.parent !== window && window.parent.setSoundMark) window.parent.setSoundMark(G.snd); } catch (e) {} }
function saveBest() { try { localStorage.setItem(BEST_KEY, String(G.best)); } catch (e) {} }

// ---------------------------------------------------------------- sound (WebAudio synthesis only)
var AC = null;
function actx() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = false; } } if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (e) {} } return AC; }
function tone(f0, f1, dur, type, vol, delay) {
  if (!G.snd) return; var a = actx(); if (!a) return;
  var t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, vol) {
  if (!G.snd) return; var a = actx(); if (!a) return; var n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  var s = a.createBufferSource(), g = a.createGain(); s.buffer = b; g.gain.value = vol || 0.12; s.connect(g); g.connect(a.destination); s.start();
}
var SFX = {
  jump: function () { tone(280, 640, 0.14, 'square', 0.06); }, coin: function () { tone(988, 988, 0.07, 'square', 0.06); tone(1319, 1319, 0.16, 'square', 0.06, 0.07); },
  stomp: function () { tone(300, 90, 0.12, 'square', 0.09); }, bump: function () { tone(150, 100, 0.08, 'triangle', 0.12); }, brick: function () { noise(0.2, 0.14); tone(200, 60, 0.12, 'triangle', 0.1); },
  item: function () { [330, 415, 494, 659].forEach(function (f, i) { tone(f, f, 0.09, 'triangle', 0.09, i * 0.06); }); }, grow: function () { [262, 330, 392, 523, 659].forEach(function (f, i) { tone(f, f, 0.08, 'square', 0.06, i * 0.05); }); },
  hurt: function () { tone(420, 110, 0.35, 'sawtooth', 0.09); }, die: function () { tone(520, 70, 0.7, 'square', 0.09); },
  goal: function () { [523, 659, 784, 1046, 784, 1046].forEach(function (f, i) { tone(f, f, 0.14, 'square', 0.07, i * 0.11); }); }, hint: function () { tone(660, 880, 0.1, 'sine', 0.08); }, life: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, f, 0.1, 'triangle', 0.1, i * 0.08); }); }
};
function sfx(k) { try { if (SFX[k]) SFX[k](); } catch (e) {} }

// ---------------------------------------------------------------- input: every source goes through press(); the auto player uses the same function
var held = { human: {}, touch: {}, auto: {} };
var KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'jump', w: 'jump', W: 'jump', ' ': 'jump', z: 'jump', Z: 'jump', k: 'jump', Shift: 'run', x: 'run', X: 'run', j: 'run', J: 'run' };
function press(src, name, down) { held[src][name] = !!down; }
function mask() {
  var m = 0, k, s; for (s in held) { k = held[s]; if (k.left) m |= IN.L; if (k.right) m |= IN.R; if (k.jump) m |= IN.J; if (k.run) m |= IN.RUN; } return m;
}
function setAuto(m) { press('auto', 'left', m & IN.L); press('auto', 'right', m & IN.R); press('auto', 'jump', m & IN.J); press('auto', 'run', m & IN.RUN); }
function clearHeld(src) { held[src] = {}; }
window.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^F[2345]$/.test(e.key)) { if (embedded()) return; e.preventDefault(); if (e.key === 'F2') window.newGame(); else if (e.key === 'F3') window.toggleAuto(); else if (e.key === 'F4') window.giveHint(); return; }
  actx();
  var k = KEYMAP[e.key];
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (e.key === 'm' || e.key === 'M') { window.toggleSound(); return; }
  if (e.key === 'h' || e.key === 'H') { window.giveHint(); return; }
  if (k) { e.preventDefault(); if (!e.repeat || true) press('human', k, true); if ((k === 'jump' || e.key === 'Enter') && (G.mode === 'start' || G.mode === 'over') && !e.repeat) startGame(); }
  else if (e.key === 'Enter' && (G.mode === 'start' || G.mode === 'over')) { e.preventDefault(); startGame(); }
});
window.addEventListener('keyup', function (e) { var k = KEYMAP[e.key]; if (k) { e.preventDefault(); press('human', k, false); } if (e.key === 'Shift') press('human', 'run', false); });
window.addEventListener('blur', function () { clearHeld('human'); clearHeld('touch'); });
cv.addEventListener('pointerdown', function () { actx(); try { cv.focus(); } catch (e) {} if (G.mode === 'start' || G.mode === 'over') startGame(); });
// touch buttons (below the canvas)
var touchSeen = false;
function showPad(on) { pad.classList.toggle('on', !!on); layout(); }
[].forEach.call(pad.querySelectorAll('button'), function (b) {
  var k = b.getAttribute('data-k');
  function dn(e) { e.preventDefault(); actx(); touchSeen = true; press('touch', k, true); b.classList.add('on'); if (k === 'jump' && (G.mode === 'start' || G.mode === 'over')) startGame(); try { b.setPointerCapture(e.pointerId); } catch (x) {} }
  function up(e) { e.preventDefault(); press('touch', k, false); b.classList.remove('on'); }
  b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up); b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
});
window.addEventListener('touchstart', function () { if (!touchSeen) { touchSeen = true; showPad(true); } }, { passive: true });

// ---------------------------------------------------------------- layout
var SC = 1, BS = 1;
function layout() {
  var w = stage.clientWidth, h = stage.clientHeight; if (w < 10 || h < 10) return;
  var s = Math.min(w / VW, h / VH), cw = Math.floor(VW * s), ch = Math.floor(VH * s), dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; cv.style.left = Math.floor((w - cw) / 2) + 'px'; cv.style.top = Math.floor((h - ch) / 2) + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); BS = cv.width / VW;
}
window.addEventListener('resize', layout);
if (Q.get('touch') === '1' || (window.matchMedia && matchMedia('(pointer:coarse)').matches) || window.innerWidth < 700) pad.classList.add('on');
layout(); setTimeout(layout, 50);

// ---------------------------------------------------------------- game flow
function levelInit(n, cp) {
  G.n = n; G.loading = true;
  if (!G.L || G.L.n !== n || G.L.seed !== G.seed) G.L = PF.generate(G.seed, n);
  G.st = PF.newState(G.L, { rec: true, cp: !!cp }); G.planner.reset(); setAuto(0); G.parts = []; G.pops = []; G.bumps = []; G.hint = null; G.cam = Math.max(0, Math.min(G.L.w * TS - VW, G.st.p.x - VW * 0.4)); G.loading = false;
}
function startGame() {
  if (Q.get('seed')) G.seed = parseInt(Q.get('seed'), 10) || 1; else G.seed = 1 + Math.floor(Math.random() * 999999);
  G.base = 0; G.coinBase = 0; G.lives = 3; G.nextLife = 50; levelInit(parseInt(Q.get('level'), 10) || 1, false); G.mode = 'play'; G.autoWait = 0;
  say(TT('레벨 ' + G.n + ' 시작! 깃발까지 달리세요', 'Level ' + G.n + ' - reach the flag!'), 150);
}
function say(t, frames) { G.msg = t; G.msgT = frames || 150; }
function totalScore() { return G.base + (G.st ? G.st.score : 0); }
function totalCoins() { return G.coinBase + (G.st ? G.st.coins : 0); }
function finishRun() { var s = totalScore(); if (s > G.best) { G.best = s; saveBest(); } }
function togglePause() { if (G.mode === 'play') { G.mode = 'pause'; say(TT('일시정지 (P)', 'Paused (P)'), 9999); } else if (G.mode === 'pause') { G.mode = 'play'; G.msgT = 0; } }
window.newGame = function () { G.mode = 'start'; startGame(); return true; };
window.toggleAuto = function () {
  G.auto = !G.auto; setAuto(0); G.planner.reset(); reportAuto();
  if (G.auto) { say(TT('자동 플레이 켜짐 (F3로 끄기)', 'Auto play on (F3 to stop)'), 120); if (G.mode === 'start' || G.mode === 'over') startGame(); } else say(TT('자동 플레이 꺼짐', 'Auto play off'), 90);
  return G.auto;
};
window.giveHint = function () {
  if (G.mode !== 'play') { say(TT('게임 중에만 힌트를 볼 수 있어요', 'Hints are available while playing'), 90); return; }
  var h = PFPlanner.hint(G.st, G.planner); G.hint = h; G.hintT = 220; G.hintF = G.frame; say(TT(h.ko, h.en), 220); sfx('hint');
};
window.toggleSound = function () { G.snd = !G.snd; try { localStorage.setItem(SND_KEY, G.snd ? '1' : '0'); } catch (e) {} reportSound(); if (G.snd) sfx('coin'); return G.snd; };
window.isSound = function () { return G.snd; };
reportSound();

function handleEvents(st) {
  var ev = st.ev; if (!ev) return;
  for (var i = 0; i < ev.length; i++) { var e = ev[i];
    switch (e.k) {
      case 'jump': sfx('jump'); break;
      case 'coin': sfx('coin'); pop(e.x, e.y - 6, '+10', '#ffe14a'); spark(e.x, e.y, '#ffe14a', 5); break;
      case 'coinpop': sfx('coin'); pop(e.x, e.y - 6, '+10', '#ffe14a'); spark(e.x, e.y, '#ffe14a', 5); G.bumps.push({ c: Math.floor(e.x / TS), r: Math.floor((e.y + 4) / TS), t: 0 }); break;
      case 'stomp': sfx('stomp'); pop(e.x, e.y - 4, '+100', '#fff'); spark(e.x, e.y + 6, '#ffffff', 8); break;
      case 'bump': sfx('bump'); G.bumps.push({ c: Math.floor(e.x / TS), r: Math.floor(e.y / TS), t: 0 }); break;
      case 'brick': sfx('brick'); for (var k = 0; k < 8; k++) G.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3 - 1, life: 50, col: '#d9783a', s: 3, g: 0.2 }); pop(e.x, e.y - 8, '+50', '#fff'); break;
      case 'item': sfx('item'); G.bumps.push({ c: Math.floor(e.x / TS), r: Math.floor((e.y + 4) / TS), t: 0 }); break;
      case 'grow': sfx('grow'); pop(e.x, e.y - 6, '+200', '#7dff9a'); spark(e.x + 6, e.y + 10, '#7dff9a', 12); say(TT('커졌어요! 한 번 맞아도 괜찮아요', 'Grown! You can take one hit now'), 120); break;
      case 'pow2': sfx('item'); pop(e.x, e.y - 6, '+300', '#7dff9a'); break;
      case 'hurt': sfx('hurt'); spark(e.x + 6, e.y + 8, '#ff8a8a', 10); say(TT('아야! 작아졌어요', 'Ouch! You shrank'), 90); break;
      case 'die': sfx('die'); break;
      case 'goal': sfx('goal'); break;
    }
  }
  st.ev = [];
}
function pop(x, y, t, c) { G.pops.push({ x: x, y: y, t: t, c: c, life: 45 }); }
function spark(x, y, c, n) { for (var i = 0; i < n; i++) G.parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2.5, life: 24 + Math.random() * 12, col: c, s: 2, g: 0.12 }); }

function fixedStep() {
  G.frame++;
  if (G.msgT > 0 && G.mode !== 'pause') G.msgT--;
  var st = G.st, i;
  for (i = G.parts.length - 1; i >= 0; i--) { var q = G.parts[i]; q.x += q.vx; q.y += q.vy; q.vy += q.g; if (--q.life <= 0) G.parts.splice(i, 1); }
  for (i = G.pops.length - 1; i >= 0; i--) { var pp = G.pops[i]; pp.y -= 0.5; if (--pp.life <= 0) G.pops.splice(i, 1); }
  for (i = G.bumps.length - 1; i >= 0; i--) if (++G.bumps[i].t > 10) G.bumps.splice(i, 1);
  if (G.mode === 'start' || G.mode === 'over') { if (G.auto && ++G.autoWait > 90) startGame(); return; }
  if (G.mode === 'pause' || !st) return;
  if (G.mode === 'play') {
    if (G.auto) setAuto(G.planner.decide(st));
    PF.step(st, mask());
    handleEvents(st);
    if (G.hint && G.hintT > 0) { G.hintT--; if (G.hintT <= 0) G.hint = null; else if ((G.frame - G.hintF) % 20 === 0) { var h = PFPlanner.hint(st, G.planner); G.hint = h; } }
    var tc = totalCoins(); if (tc >= G.nextLife) { G.nextLife += 50; G.lives++; sfx('life'); say(TT('코인 50개! 목숨 +1', '50 coins! Extra life'), 120); }
    var p = st.p;
    if (p.dead) { G.mode = 'dying'; G.dieT = 0; G.dy = p.y; G.dvy = -5.5; setAuto(0); finishRun(); if (p.why === 'time') say(TT('시간 초과!', 'Time is up!'), 120); }
    else if (p.won) { G.mode = 'clear'; G.clearT = 0; G.bonus = 1000 + Math.floor(st.t / 60) * 5; st.score += G.bonus; setAuto(0); say(TT('레벨 클리어! 보너스 +' + G.bonus, 'Level clear! Bonus +' + G.bonus), 150); finishRun(); }
  } else if (G.mode === 'dying') {
    G.dieT++; G.dvy += 0.32; G.dy += G.dvy;
    if (G.dieT > 100) {
      G.base += st.score; G.coinBase += st.coins; G.lives--;
      if (G.lives <= 0) { G.mode = 'over'; G.autoWait = 0; finishRun(); }
      else { var cp = st.cp; levelInit(G.n, cp); G.mode = 'play'; say(TT('다시 도전! 남은 목숨 ' + G.lives, 'Try again! Lives left: ' + G.lives), 120); }
    }
  } else if (G.mode === 'clear') {
    G.clearT++; var pw = st.p; pw.y = Math.min(pw.y + 1.2, G.L.poleY - pw.h); pw.x = Math.min(pw.x, G.L.goalX - 2);
    if (G.clearT > 150) { G.base += st.score; G.coinBase += st.coins; levelInit(G.n + 1, false); G.mode = 'play'; say(TT('레벨 ' + G.n + '!', 'Level ' + G.n + '!'), 120); }
  }
  // camera
  var p2 = G.st.p, tx = Math.max(0, Math.min(G.L.w * TS - VW, p2.x + 6 - VW * 0.42 + p2.vx * 14)); G.cam += (tx - G.cam) * 0.12;
}

// ---------------------------------------------------------------- rendering
var THEMES = [
  { s1: '#5db8ff', s2: '#d6f3ff', h1: '#7fd36b', h2: '#5fb85a', gr: '#4caf50', dirt: '#9a6a3b', dirt2: '#7d5330', cloud: '#ffffff', star: false },
  { s1: '#ff8a5c', s2: '#ffe0a3', h1: '#c46a8a', h2: '#9a4f8a', gr: '#8fae3c', dirt: '#8a4f3a', dirt2: '#6d3b2c', cloud: '#fff0e0', star: false },
  { s1: '#0b1030', s2: '#2d3f86', h1: '#24456a', h2: '#1b3254', gr: '#2f9f78', dirt: '#4f3f66', dirt2: '#3c2f4f', cloud: '#7f8fd0', star: true },
  { s1: '#a8dcf5', s2: '#f2fbff', h1: '#9fd0e8', h2: '#7fb6d6', gr: '#f4fbff', dirt: '#5e86b0', dirt2: '#4a6c92', cloud: '#ffffff', star: false }];
var HILLS = (function () { var r = PF.rng(77), a = []; for (var i = 0; i < 8; i++) a.push({ x: i * 62 + r() * 30, r: 40 + r() * 40 }); return a; })();
var CLOUDS = (function () { var r = PF.rng(99), a = []; for (var i = 0; i < 5; i++) a.push({ x: i * 100 + r() * 50, y: 20 + r() * 50, s: 0.7 + r() * 0.8 }); return a; })();
var STARS = (function () { var r = PF.rng(5), a = []; for (var i = 0; i < 40; i++) a.push({ x: r() * VW, y: r() * 120, s: 0.5 + r() * 1.1 }); return a; })();
function circ(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function poly(pts, c, stroke) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); if (c) { ctx.fillStyle = c; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
function rrect(x, y, w, h, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); }
function text(t, x, y, size, c, align, sh) {
  ctx.font = 'bold ' + size + 'px ui-monospace, Menlo, Consolas, "Courier New", monospace'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  if (sh !== false) { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(t, x + 1, y + 1); } ctx.fillStyle = c || '#fff'; ctx.fillText(t, x, y);
}

function drawBackground(th, cam) {
  var g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, th.s1); g.addColorStop(1, th.s2); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (th.star) { for (var i = 0; i < STARS.length; i++) { var s = STARS[i]; circ(s.x, s.y, s.s, 'rgba(255,255,255,.8)'); } circ(330, 36, 14, '#f4f0d8'); circ(325, 33, 12, '#0f1840'); circ(330, 36, 14, '#f4f0d8'); ctx.globalCompositeOperation = 'source-over'; }
  else circ(340, 38, 16, th === THEMES[1] ? '#fff3b0' : '#fff7c0');
  var k, i2;
  for (k = 0; k < 2; k++) { var off = -((cam * 0.2) % 496) + k * 496; for (i2 = 0; i2 < HILLS.length; i2++) { var h = HILLS[i2]; ctx.fillStyle = th.h2; ctx.beginPath(); ctx.arc(off + h.x * 1.0, VH - 20 + h.r * 0.45, h.r, Math.PI, 0); ctx.fill(); } }
  for (k = 0; k < 2; k++) { var off2 = -((cam * 0.4) % 496) + k * 496; for (i2 = 0; i2 < HILLS.length; i2++) { var h2 = HILLS[i2]; ctx.fillStyle = th.h1; ctx.beginPath(); ctx.ellipse(off2 + h2.x + 31, VH - 12 + h2.r * 0.3, h2.r * 0.8, h2.r * 0.7, 0, Math.PI, 0); ctx.fill(); } }
  for (k = 0; k < 2; k++) { var off3 = -((cam * 0.5) % 500) + k * 500; for (i2 = 0; i2 < CLOUDS.length; i2++) { var c = CLOUDS[i2], x = off3 + c.x; ctx.globalAlpha = th.star ? 0.35 : 0.9; circ(x, c.y, 9 * c.s, th.cloud); circ(x + 11 * c.s, c.y + 2, 11 * c.s, th.cloud); circ(x + 24 * c.s, c.y + 3, 8 * c.s, th.cloud); rect(x - 5 * c.s, c.y + 3, 33 * c.s, 8 * c.s, th.cloud); ctx.globalAlpha = 1; } }
}
function drawTile(t, x, y, th, above, bumpDy) {
  y += bumpDy || 0;
  if (t === T.SOLID) {
    rect(x, y, TS, TS, th.dirt); rect(x + 2, y + 6, 3, 3, th.dirt2); rect(x + 9, y + 11, 4, 3, th.dirt2); rect(x + 10, y + 3, 2, 2, th.dirt2);
    if (above === 0 || above === 6) { rect(x, y, TS, 4, th.gr); circ(x + 4, y + 4, 2, th.gr); circ(x + 11, y + 4, 2.5, th.gr); }
  } else if (t === T.BRICK) {
    rect(x, y, TS, TS, '#d9783a'); ctx.fillStyle = '#7a3a18'; ctx.fillRect(x, y + 7, TS, 1); ctx.fillRect(x, y + 15, TS, 1); ctx.fillRect(x + 7, y, 1, 7); ctx.fillRect(x + 3, y + 8, 1, 7); ctx.fillRect(x + 11, y + 8, 1, 7); rect(x, y, TS, 1, '#f0a070');
  } else if (t === T.QC || t === T.QP) {
    var pulse = 0.85 + 0.15 * Math.sin(G.frame * 0.12);
    rect(x, y, TS, TS, '#8a5a00'); rect(x + 1, y + 1, TS - 2, TS - 2, t === T.QP ? 'rgb(' + Math.round(255 * pulse) + ',190,60)' : 'rgb(255,' + Math.round(210 * pulse) + ',40)'); circ(x + 3, y + 3, 1, '#8a5a00'); circ(x + 13, y + 3, 1, '#8a5a00'); circ(x + 3, y + 13, 1, '#8a5a00'); circ(x + 13, y + 13, 1, '#8a5a00');
    ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 8, y + 6, 2.8, Math.PI, 2.2 * Math.PI); ctx.lineTo(x + 8, y + 10); ctx.stroke(); circ(x + 8, y + 12.5, 1.1, '#7a4a00');
  } else if (t === T.USED) { rect(x, y, TS, TS, '#6a5a4a'); rect(x + 2, y + 2, TS - 4, TS - 4, '#8a7a68'); circ(x + 3, y + 3, 1, '#4a3a2a'); circ(x + 13, y + 13, 1, '#4a3a2a'); }
  else if (t === T.SPIKE) { for (var i = 0; i < 2; i++) poly([x + i * 8, y + 16, x + i * 8 + 4, y + 5, x + i * 8 + 8, y + 16], '#c9d1da', '#4a5260'); }
}
function drawHero(p, f, dead, spin) {
  var big = p.big, w = p.w, h = p.h, x = p.x, y = p.y, face = p.face >= 0 ? 1 : -1, cx = x + w / 2;
  if (p.inv > 0 && !dead && (Math.floor(p.inv / 4) % 2)) ctx.globalAlpha = 0.45;
  ctx.save(); ctx.translate(cx, y + h / 2); if (spin) ctx.rotate(spin); ctx.translate(-cx, -(y + h / 2));
  var step = Math.sin(p.anim * 2.2), moving = Math.abs(p.vx) > 0.2 && p.ground;
  // feet
  var fy = y + h - 2;
  if (!p.ground) { rect(cx - 5, fy, 4, 2, '#5a2a10'); rect(cx + 1, fy - 1, 4, 2, '#5a2a10'); }
  else if (moving) { rect(cx - 5 + step * 2.5, fy, 4, 2, '#5a2a10'); rect(cx + 1 - step * 2.5, fy, 4, 2, '#5a2a10'); } else { rect(cx - 5, fy, 4, 2, '#5a2a10'); rect(cx + 1, fy, 4, 2, '#5a2a10'); }
  // body
  var bt = y + (big ? 8 : 4), bh = h - (big ? 9 : 5);
  rrect(x, bt, w, bh, 4, '#2f8fe8');
  if (big) { rect(x, bt + bh * 0.55, w, 2, '#ffd23a'); circ(cx, bt + bh * 0.55 + 1, 1.6, '#fff'); rect(x - 1, bt + 2, 2, 7, '#2f8fe8'); }
  // head / cap
  var hy = y + (big ? 6 : 4);
  circ(cx, hy, 6.4, '#ffd9b0'); ctx.fillStyle = '#e8403a'; ctx.beginPath(); ctx.arc(cx, hy - 0.5, 6.8, Math.PI, 0); ctx.fill(); poly([cx + face * 2, hy - 1, cx + face * 9, hy - 1, cx + face * 2, hy + 1.5], '#b82a28');
  circ(cx, hy - 5.5, 1.4, '#fff');
  // eye
  circ(cx + face * 2.4, hy + 1.6, 1.7, '#fff'); circ(cx + face * 3, hy + 1.6, 0.9, '#111');
  ctx.restore(); ctx.globalAlpha = 1;
}
function drawEnemy(e, f) {
  var cx = e.x + e.w / 2, by = e.y + e.h;
  if (!e.alive) { if (e.dt > 0) { ctx.globalAlpha = e.dt / 30; ctx.fillStyle = e.t === PF.FLYER ? '#a24ad8' : '#4aa84a'; ctx.beginPath(); ctx.ellipse(cx, by - 1.5, 8, 2.5, 0, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; } return; }
  var dir = e.dir || 1;
  if (e.t === PF.WALKER) {
    var st = Math.sin(f * 0.25 + e.x);
    ctx.fillStyle = '#4aa84a'; ctx.beginPath(); ctx.arc(cx, by - 4, 7, Math.PI, 0); ctx.lineTo(cx + 7, by - 3); ctx.lineTo(cx - 7, by - 3); ctx.fill();
    rect(cx - 7, by - 4, 14, 2, '#3a883a'); rect(cx - 6 + st * 2, by - 2, 5, 2, '#2a5a2a'); rect(cx + 1 - st * 2, by - 2, 5, 2, '#2a5a2a');
    circ(cx - 2.6, by - 7, 2.2, '#fff'); circ(cx + 2.6, by - 7, 2.2, '#fff'); circ(cx - 2.6 + dir * 0.8, by - 6.8, 1, '#111'); circ(cx + 2.6 + dir * 0.8, by - 6.8, 1, '#111');
    ctx.strokeStyle = '#1a3a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 5, by - 10.5); ctx.lineTo(cx - 1, by - 8.8); ctx.moveTo(cx + 5, by - 10.5); ctx.lineTo(cx + 1, by - 8.8); ctx.stroke();
  } else if (e.t === PF.SPIKY) {
    var ccy = e.y + e.h / 2; ctx.save(); ctx.translate(cx, ccy); ctx.rotate(f * 0.05 * dir);
    for (var i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); poly([-3, -6, 0, -11, 3, -6], '#d8d8e8', '#444'); }
    ctx.restore(); circ(cx, ccy, 6.5, '#d8483a'); circ(cx - 2.2, ccy - 1.5, 1.9, '#fff'); circ(cx + 2.2, ccy - 1.5, 1.9, '#fff'); circ(cx - 2.2 + dir * 0.7, ccy - 1.3, 0.9, '#111'); circ(cx + 2.2 + dir * 0.7, ccy - 1.3, 0.9, '#111'); rect(cx - 2.5, ccy + 2, 5, 1, '#400');
  } else {
    var fl = Math.sin(f * 0.4) * 5, cy2 = e.y + e.h / 2;
    poly([cx - 3, cy2, cx - 14, cy2 - 6 - fl, cx - 8, cy2 + 3], '#d9a8f5', '#6a2a98'); poly([cx + 3, cy2, cx + 14, cy2 - 6 - fl, cx + 8, cy2 + 3], '#d9a8f5', '#6a2a98');
    poly([cx, cy2 - 7, cx + 6, cy2, cx, cy2 + 7, cx - 6, cy2], '#a24ad8', '#4a1a70'); circ(cx - 2, cy2 - 1, 1.6, '#fff'); circ(cx + 2, cy2 - 1, 1.6, '#fff'); circ(cx - 2 + dir * 0.6, cy2 - 0.8, 0.8, '#111'); circ(cx + 2 + dir * 0.6, cy2 - 0.8, 0.8, '#111');
  }
}
function drawCoin(c, i, f) {
  var w = Math.abs(Math.cos(f * 0.09 + i * 0.7)) * 5 + 1; ctx.fillStyle = '#c99a00'; ctx.beginPath(); ctx.ellipse(c.x, c.y, w + 0.8, 6.8, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.ellipse(c.x, c.y, w, 6, 0, 0, 6.3); ctx.fill(); rect(c.x - 0.5, c.y - 3, 1, 6, '#c99a00');
}
function drawGem(e, f) { var cx = e.x + 6, cy = e.y + 6 + Math.sin(f * 0.15) * 0.7; poly([cx, cy - 7, cx + 6, cy - 1, cx, cy + 7, cx - 6, cy - 1], '#2fd07a', '#0a6a3a'); poly([cx, cy - 7, cx + 6, cy - 1, cx, cy - 1], '#8affc0'); poly([cx - 6, cy - 1, cx, cy - 1, cx, cy + 7], '#1a9a58'); }

function drawWorld(st, th) {
  var L = st.L, cam = G.cam, f = G.frame, c0 = Math.max(0, Math.floor(cam / TS)), c1 = Math.min(L.w - 1, Math.floor((cam + VW) / TS) + 1), c, r, i;
  ctx.save(); ctx.translate(-Math.round(cam), 0);
  for (c = c0; c <= c1; c++) for (r = 0; r < PF.ROWS; r++) {
    var t = PF.tileAt(st, c, r); if (!t) continue; var bd = 0;
    for (i = 0; i < G.bumps.length; i++) if (G.bumps[i].c === c && G.bumps[i].r === r) bd = -Math.sin(G.bumps[i].t / 10 * Math.PI) * 5;
    drawTile(t, c * TS, r * TS, th, r > 0 ? PF.tileAt(st, c, r - 1) : 0, bd);
  }
  // goal pole + flag
  var gx = L.goalX, top = L.poleY - 9 * TS; rect(gx, top, 3, L.poleY - top, '#e8e8f0'); rect(gx + 2, top, 1, L.poleY - top, '#9aa0b0'); circ(gx + 1.5, top - 2, 3.5, '#ffd23a');
  var wv = Math.sin(f * 0.1) * 2; poly([gx + 3, top + 3, gx + 20, top + 8 + wv, gx + 3, top + 14], '#e8403a', '#7a1a18'); circ(gx + 10, top + 8.5 + wv / 2, 2, '#fff');
  for (i = 0; i < L.movers.length; i++) { var m = L.movers[i], mx = PF.moverX(m, st.f); rrect(mx, m.y, m.w, 7, 3, '#8a8fb0'); rect(mx + 2, m.y, m.w - 4, 2, '#c9cee8'); circ(mx + 6, m.y + 4.5, 1.3, '#4a4f70'); circ(mx + m.w - 6, m.y + 4.5, 1.3, '#4a4f70'); }
  for (i = 0; i < L.coins.length; i++) if (!st.cg[i] && L.coins[i].x > cam - 10 && L.coins[i].x < cam + VW + 10) drawCoin(L.coins[i], i, f);
  for (i = 0; i < st.it.length; i++) if (st.it[i].alive) drawGem(st.it[i], f);
  for (i = 0; i < st.en.length; i++) { var e = st.en[i]; if (e.x > cam - 30 && e.x < cam + VW + 30) drawEnemy(e, f); }
  // checkpoint flag
  if (L.cp) { var kx = L.cp.x + 6, ky = L.cp.y + 14; rect(kx, ky - 22, 2, 22, '#c9cee8'); poly([kx + 2, ky - 22, kx + 12, ky - 18, kx + 2, ky - 14], st.cp ? '#3ad06a' : '#8a8fb0'); }
  // hint
  if (G.hint) {
    var h = G.hint, k; ctx.fillStyle = 'rgba(255,240,90,.95)'; for (k = 0; k < h.traj.length; k++) { circ(h.traj[k].x, h.traj[k].y - 2, 1.3, 'rgba(255,240,90,.9)'); }
    if (h.land) { var pr = 4 + Math.sin(f * 0.2) * 1.5; ctx.strokeStyle = '#3aff7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.land.x, h.land.y, 6 + pr, 0, 6.3); ctx.stroke(); poly([h.land.x - 4, h.land.y - 16 - pr, h.land.x + 4, h.land.y - 16 - pr, h.land.x, h.land.y - 9 - pr], '#3aff7a'); }
    if (h.haz) { var hz = h.haz; ctx.strokeStyle = '#ff4a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hz.x, hz.y, 11 + Math.sin(f * 0.25) * 1.5, 0, 6.3); ctx.stroke(); }
  }
  // player
  var p = st.p;
  if (G.mode === 'dying') { drawHero({ x: p.x, y: G.dy, w: p.w, h: p.h, big: false, face: p.face, ground: false, anim: 0, vx: 0, inv: 0 }, f, true, G.dieT * 0.25); }
  else drawHero(p, f, false, 0);
  for (i = 0; i < G.parts.length; i++) { var q = G.parts[i]; rect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s, q.col); }
  for (i = 0; i < G.pops.length; i++) { var pp = G.pops[i]; text(pp.t, pp.x, pp.y, 8, pp.c, 'center'); }
  ctx.restore();
}
function panel(x, y, w, h) { ctx.fillStyle = 'rgba(8,10,34,.82)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
function pad6(n) { var s = String(Math.max(0, n | 0)); while (s.length < 6) s = '0' + s; return s; }
function drawHUD(st) {
  rect(0, 0, VW, 15, 'rgba(0,0,0,.35)');
  text(TT('점수 ', 'SCORE ') + pad6(totalScore()), 6, 8, 9, '#fff');
  circ(122, 8, 4, '#ffe14a'); text('x' + totalCoins(), 129, 8, 9, '#fff');
  text(TT('레벨 ', 'LEVEL ') + G.n, 176, 8, 9, '#fff');
  var secs = Math.max(0, Math.ceil(st.t / 60)); text(TT('시간 ', 'TIME ') + secs, 238, 8, 9, secs < 20 ? '#ff8a6a' : '#fff');
  for (var i = 0; i < Math.min(G.lives, 6); i++) { circ(334 + i * 9, 8, 3.6, '#2f8fe8'); ctx.fillStyle = '#e8403a'; ctx.beginPath(); ctx.arc(334 + i * 9, 7.5, 3.8, Math.PI, 0); ctx.fill(); }
  if (G.lives > 6) text('+' + (G.lives - 6), 392, 8, 8, '#fff', 'right');
  text(TT('최고 ', 'BEST ') + pad6(Math.max(G.best, totalScore())), VW - 6, 24, 7, '#ffe9a0', 'right');
  if (G.auto) { var w = 128; rrect(VW / 2 - w / 2, 19, w, 14, 4, 'rgba(255,200,40,.92)'); text(TT('자동 플레이 (F3 끄기)', 'AUTO PLAY (F3 to stop)'), VW / 2, 26, 8, '#3a2000', 'center', false); }
  if (G.msgT > 0 && G.msg) { var tw = Math.min(VW - 16, 8 + G.msg.length * (KO ? 7.4 : 4.9)); rrect(VW / 2 - tw / 2, VH - 22, tw, 15, 4, 'rgba(0,0,0,.6)'); text(G.msg, VW / 2, VH - 14.5, 8, '#fff', 'center', false); }
}
function overlay(title, lines) {
  panel(50, 40, VW - 100, 128); text(title, VW / 2, 62, 18, '#ffd23a', 'center');
  for (var i = 0; i < lines.length; i++) text(lines[i], VW / 2, 90 + i * 15, 8.5, i === lines.length - 1 ? '#7dff9a' : '#fff', 'center');
}
function render() {
  var st = G.st; if (!st) return;
  ctx.setTransform(BS, 0, 0, BS, 0, 0); ctx.clearRect(0, 0, VW, VH);
  var th = THEMES[G.L.theme];
  drawBackground(th, G.cam); drawWorld(st, th); drawHUD(st);
  if (G.mode === 'start') overlay(TT('모험 달리기', 'SHAPE RUNNER'), [TT('도형 영웅을 깃발까지 달리게 하세요!', 'Run the shape hero to the flag!'), TT('←→ / A D 이동   Z / 스페이스 / ↑ 점프   X / Shift 달리기', 'Arrows / A D move   Z / Space / Up jump   X / Shift run'), TT('적은 위에서 밟고, 가시 적은 피하세요', 'Stomp the blobs, avoid the spiky ones'), TT('최고 점수: ', 'Best score: ') + G.best, TT('스페이스 또는 화면 터치로 시작', 'Press Space or tap to start')]);
  else if (G.mode === 'over') overlay(TT('게임 오버', 'GAME OVER'), [TT('점수: ', 'Score: ') + totalScore(), TT('도달 레벨: ', 'Reached level: ') + G.n, TT('최고 점수: ', 'Best score: ') + G.best, TT('스페이스 또는 터치로 다시 시작 (F2)', 'Space or tap to play again (F2)')]);
  else if (G.mode === 'clear') { text(TT('레벨 클리어!', 'LEVEL CLEAR!'), VW / 2, 70, 20, '#ffd23a', 'center'); text('+' + G.bonus, VW / 2, 92, 12, '#7dff9a', 'center'); }
  else if (G.mode === 'pause') text(TT('일시정지', 'PAUSED'), VW / 2, 90, 20, '#fff', 'center');
}
var last = 0, acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.1, (t - last) / 1000 || 0); last = t; acc += dt; var n = 0;
  while (acc >= 1 / 60 && n < 6) { try { fixedStep(); } catch (e) { window.__errs.push('step ' + e.message + ' ' + (e.stack || '').split('\n')[0]); acc = 0; } acc -= 1 / 60; n++; }
  if (n === 6) acc = 0;
  try { render(); } catch (e) { window.__errs.push('render ' + e.message + ' ' + (e.stack || '').split('\n')[0]); }
}
// start screen backdrop: level 1 of a fixed seed
G.seed = parseInt(Q.get('seed'), 10) || 1; levelInit(1, false);
if (Q.get('autostart') === '1') startGame();
if (Q.get('auto') === '1') window.toggleAuto();
requestAnimationFrame(frame);
window.__pfDebug = function () { var p = G.st.p; return { mode: G.mode, n: G.n, x: Math.round(p.x), y: Math.round(p.y), lives: G.lives, score: totalScore(), coins: totalCoins(), auto: G.auto, big: p.big, vx: p.vx, vy: p.vy, ground: p.ground, hint: !!G.hint, msg: G.msg, best: G.best, errs: window.__errs.length }; };
})();
