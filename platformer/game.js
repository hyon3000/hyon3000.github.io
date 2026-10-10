// Shape World - game layer: input, loop, rendering (Canvas2D primitives only), synthesized sound, HUD.
(function () {
'use strict';
var TS = PF.TS, VW = PF.VW, VH = PF.VH, T = PF.T, IN = PF.IN;
var KO = /^ko/i.test(navigator.language || ''), TT = function (ko, en) { return KO ? ko : en; };
var cv = document.getElementById('cv'), ctx = cv.getContext('2d'), stage = document.getElementById('stage'), pad = document.getElementById('pad');
document.documentElement.lang = KO ? 'ko' : 'en';
var Q = new URLSearchParams(location.search);
var BEST_KEY = 'shapeworld.best', SND_KEY = 'shapeworld.sound';
var G = window.__pf = { mode: 'start', n: 1, seed: 1, lives: 3, base: 0, coinBase: 0, best: 0, L: null, st: null, auto: false, planner: PFPlanner.make(), hint: null, msg: null, msgT: 0, frame: 0,
  cam: 0, parts: [], pops: [], bumps: [], snd: true, dieT: 0, clearT: 0, dy: 0, dvy: 0, bonus: 0, nextLife: 50, autoWait: 0, loading: false,
  useRL: true, ai: (window.PFAI ? PFAI.make() : null), w: 0, map: null, sel: 0, prog: { done: {}, secret: {} }, main: null, curNode: null, secretExit: false, mapCool: 0 };
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

SFX.spin = function () { tone(300, 900, 0.16, 'square', 0.06); tone(900, 400, 0.1, 'square', 0.04, 0.12); };
SFX.kick = function () { tone(220, 520, 0.08, 'square', 0.08); }; SFX.grab = function () { tone(500, 500, 0.05, 'triangle', 0.08); };
SFX.fire = function () { tone(700, 200, 0.12, 'sawtooth', 0.05); }; SFX.star = function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, f, 0.08, 'square', 0.06, i * 0.05); }); };
SFX.mount = function () { [262, 392, 523].forEach(function (f, i) { tone(f, f * 1.5, 0.1, 'triangle', 0.1, i * 0.07); }); }; SFX.eat = function () { tone(180, 300, 0.1, 'triangle', 0.12); };
SFX.kill = function () { tone(400, 120, 0.1, 'square', 0.07); }; SFX.pswitch = function () { tone(200, 200, 0.1, 'square', 0.1); tone(400, 400, 0.1, 'square', 0.1, 0.1); tone(800, 800, 0.2, 'square', 0.08, 0.2); };
SFX.special = function () { tone(784, 784, 0.1, 'triangle', 0.1); tone(1046, 1318, 0.25, 'triangle', 0.1, 0.1); }; SFX.warp = function () { tone(200, 1200, 0.4, 'sine', 0.1); };
SFX.thud = function () { noise(0.12, 0.2); tone(90, 50, 0.15, 'triangle', 0.15); }; SFX.cannon = function () { noise(0.1, 0.1); tone(160, 70, 0.12, 'square', 0.07); };
SFX.spit = function () { tone(500, 250, 0.15, 'sawtooth', 0.05); }; SFX.bosshit = function () { tone(260, 80, 0.25, 'square', 0.12); noise(0.1, 0.1); };
SFX.bossdead = function () { [300, 250, 200, 150, 100].forEach(function (f, i) { tone(f, f * 0.5, 0.2, 'sawtooth', 0.09, i * 0.1); }); noise(0.5, 0.18); };
SFX.swim = function () { tone(300, 500, 0.08, 'sine', 0.06); }; SFX.spring = function () { tone(200, 900, 0.2, 'triangle', 0.12); }; SFX.fireburst = function () { tone(500, 100, 0.08, 'square', 0.05); };
SFX.pop = function () { tone(1200, 800, 0.05, 'sine', 0.05); };

// ---------------------------------------------------------------- input: every source goes through press(); the auto player uses the same function
var held = { human: {}, touch: {}, auto: {} };
var KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
  ' ': 'jump', z: 'jump', Z: 'jump', k: 'jump', Shift: 'run', x: 'run', X: 'run', j: 'run', J: 'run', c: 'spin', C: 'spin', v: 'spin', V: 'spin' };
function press(src, name, down) { held[src][name] = !!down; }
function mask() {
  var m = 0, k, s; for (s in held) { k = held[s]; if (k.left) m |= IN.L; if (k.right) m |= IN.R; if (k.jump) m |= IN.J; if (k.run) m |= IN.RUN; if (k.up) m |= IN.UP; if (k.down) m |= IN.DN; if (k.spin) m |= IN.SPIN; } return m;
}
function setAuto(m) { press('auto', 'left', m & IN.L); press('auto', 'right', m & IN.R); press('auto', 'jump', m & IN.J); press('auto', 'run', m & IN.RUN); press('auto', 'up', m & IN.UP); press('auto', 'down', m & IN.DN); press('auto', 'spin', m & IN.SPIN); }
function clearHeld(src) { held[src] = {}; }
var edge = { };
function onPress(k) {          // menu / map navigation on key press (human only)
  if (G.mode === 'start' || G.mode === 'over') { if (k === 'jump') startGame(); }
  else if (G.mode === 'map') { if (k === 'left') moveSel(-1); else if (k === 'right') moveSel(1); else if (k === 'jump') enterLevel(G.sel); }
}
window.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^F[2345]$/.test(e.key)) { if (embedded()) return; e.preventDefault(); if (e.key === 'F2') window.newGame(); else if (e.key === 'F3') window.toggleAuto(); else if (e.key === 'F4') window.giveHint(); return; }
  actx();
  var k = KEYMAP[e.key];
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (e.key === 'm' || e.key === 'M') { window.toggleSound(); return; }
  if (e.key === 'h' || e.key === 'H') { window.giveHint(); return; }
  if (e.key === 'Enter') { e.preventDefault(); onPress('jump'); return; }
  if (k) { e.preventDefault(); if (!e.repeat) onPress(k); press('human', k, true); }
});
window.addEventListener('keyup', function (e) { var k = KEYMAP[e.key]; if (k) { e.preventDefault(); press('human', k, false); } if (e.key === 'Shift') press('human', 'run', false); });
window.addEventListener('blur', function () { clearHeld('human'); clearHeld('touch'); });
cv.addEventListener('pointerdown', function (e) {
  actx(); try { cv.focus(); } catch (x) {}
  if (G.mode === 'start' || G.mode === 'over') startGame();
  else if (G.mode === 'map') { var r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * VW, py = (e.clientY - r.top) / r.height * VH, nodes = allNodes(), best = -1, bd = 22;
    for (var i = 0; i < nodes.length; i++) { var d = Math.hypot(nodes[i].x - px, nodes[i].y - py); if (d < bd && isOpen(nodes[i])) { bd = d; best = nodes[i].i; } }
    if (best >= 0) { if (G.sel === best) enterLevel(best); else G.sel = best; } else if (e.clientX > r.left + r.width / 2) enterLevel(G.sel); }
});
var touchSeen = false;
function showPad(on) { pad.classList.toggle('on', !!on); layout(); }
[].forEach.call(pad.querySelectorAll('button'), function (b) {
  var k = b.getAttribute('data-k');
  function dn(e) { e.preventDefault(); actx(); touchSeen = true; if (!held.touch[k]) onPress(k); press('touch', k, true); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) {} }
  function up(e) { e.preventDefault(); press('touch', k, false); b.classList.remove('on'); }
  b.addEventListener('pointerdown', dn); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up); b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
});
window.addEventListener('touchstart', function () { if (!touchSeen) { touchSeen = true; showPad(true); } }, { passive: true });

// ---------------------------------------------------------------- layout
var BS = 1;
function layout() {
  var w = stage.clientWidth, h = stage.clientHeight; if (w < 10 || h < 10) return;
  var s = Math.min(w / VW, h / VH), cw = Math.floor(VW * s), ch = Math.floor(VH * s), dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; cv.style.left = Math.floor((w - cw) / 2) + 'px'; cv.style.top = Math.floor((h - ch) / 2) + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); BS = cv.width / VW;
}
window.addEventListener('resize', layout);
if (Q.get('touch') === '1' || (window.matchMedia && matchMedia('(pointer:coarse)').matches) || window.innerWidth < 700) pad.classList.add('on');
layout(); setTimeout(layout, 50);

// ---------------------------------------------------------------- game flow: map -> level (-> bonus room) -> map
function aiReset() { G.planner.reset(); if (G.ai) G.ai.reset(); G.stallF = 0; G.fbUntil = 0; G.lastProg = 0; G.lastCr = 0; G.lastStage = 0; }
function autoMask(st) {
  // the shipped auto player is the reinforcement-learning policy (ai-model.js); the look-ahead planner is only the fallback when no model is loaded or the policy makes no progress for 8 seconds
  if (G.useRL && G.ai && G.ai.ready()) {
    if (st.cr > G.lastCr || st.stage > G.lastStage) { G.lastCr = st.cr; G.lastStage = st.stage; G.lastProg = st.f; }
    if (st.f - G.lastProg > 480 && !(G.fbUntil > st.f)) { G.fbUntil = st.f + 300; G.lastProg = st.f; G.planner.reset(); }
    if (G.fbUntil > st.f) { G.usingFallback = true; return G.planner.decide(st); }
    G.usingFallback = false; return G.ai.decide(st);
  }
  G.usingFallback = true; return G.planner.decide(st);
}
function say(t, frames) { G.msg = t; G.msgT = frames || 150; }
function allNodes() { var n = G.map.nodes.slice(); if (G.prog.secret[G.w]) n.push(G.map.bonus); return n; }
function isDone(i) { var d = G.prog.done[G.w]; return !!(d && d[i]); }
function isOpen(nd) { return nd.i === 0 || nd.i === 5 || isDone(nd.i - 1); }
function moveSel(d) {
  var nodes = allNodes().filter(isOpen), idx = -1, i; for (i = 0; i < nodes.length; i++) if (nodes[i].i === G.sel) idx = i;
  idx = Math.max(0, Math.min(nodes.length - 1, idx + d)); G.sel = nodes[idx].i; sfx('pop');
}
function setWorld(w) { G.w = w; G.map = PF.worldMap(G.seed, w); var nx = 0; for (var i = 0; i < 5; i++) if (isDone(i)) nx = Math.min(4, i + 1); G.sel = nx; }
function startGame() {
  if (Q.get('seed')) G.seed = parseInt(Q.get('seed'), 10) || 1; else G.seed = 1 + Math.floor(Math.random() * 999999);
  G.base = 0; G.coinBase = 0; G.lives = 3; G.nextLife = 50; G.prog = { done: {}, secret: {} }; G.main = null; G.st = null; G.L = null; G.hint = null; G.autoWait = 0; G.mapCool = 0;
  setWorld(0); G.mode = 'map'; setAuto(0); aiReset();
  say(TT('월드 1: 레벨을 골라 시작하세요', 'World 1: pick a level to start'), 150);
  var lv = parseInt(Q.get('level'), 10); if (lv) window.__pfGo(lv);
}
function levelInit(cp) {
  var node = G.curNode; G.st = PF.newState(G.L, { rec: true, cp: !!cp }); aiReset(); setAuto(0); G.parts = []; G.pops = []; G.bumps = []; G.hint = null; G.cam = Math.max(0, Math.min(G.L.w * TS - VW, G.st.p.x - VW * 0.4)); G.mode = 'play'; G.secretExit = false;
}
function enterLevel(i) {
  var nodes = allNodes(), node = null; for (var k = 0; k < nodes.length; k++) if (nodes[k].i === i) node = nodes[k];
  if (!node || !isOpen(node) || G.mode === 'loading') return;
  G.curNode = node; G.mode = 'loading'; G.st = null; G.hint = null;
  setTimeout(function () { G.n = node.n; G.L = PF.generate(G.seed, node.n); G.main = null; levelInit(false); var kn = PF.KIND_NAMES[G.L.kind]; say(PFR.levelLabel({ n: node.n }) + ' ' + (KO ? kn[0] : kn[1]), 150); G.msgIsLevel = true; }, 30);
}
function totalCoins() { return G.coinBase + (G.st ? G.st.coins : 0); }
function finishRun() { var s = G.base + (G.st ? G.st.score : 0); if (s > G.best) { G.best = s; saveBest(); } }
function togglePause() { if (G.mode === 'play') { G.mode = 'pause'; say(TT('일시정지 (P)', 'Paused (P)'), 9999); } else if (G.mode === 'pause') { G.mode = 'play'; G.msgT = 0; } }
window.newGame = function () { startGame(); return true; };
window.toggleAuto = function () {
  G.auto = !G.auto; setAuto(0); aiReset(); reportAuto();
  if (G.auto) { say(TT('자동 플레이 켜짐 (F3로 끄기)', 'Auto play on (F3 to stop)'), 120); if (G.mode === 'start' || G.mode === 'over') startGame(); } else say(TT('자동 플레이 꺼짐', 'Auto play off'), 90);
  return G.auto;
};
window.giveHint = function () {
  if (G.mode === 'map') { var nd = allNodes().filter(function (n) { return isOpen(n) && !isDone(n.i) && n.i !== 5; })[0]; say(nd ? TT('다음 레벨: ' + (G.w + 1) + '-' + (nd.i + 1) + ' (' + PF.KIND_NAMES[nd.kind][0] + ')', 'Next level: ' + (G.w + 1) + '-' + (nd.i + 1) + ' (' + PF.KIND_NAMES[nd.kind][1] + ')') : TT('이 월드를 모두 깼어요', 'World cleared'), 150); return; }
  if (G.mode !== 'play') { say(TT('게임 중에만 힌트를 볼 수 있어요', 'Hints are available while playing'), 90); return; }
  var h = PFPlanner.hint(G.st, G.planner); G.hint = h; G.hintT = 220; G.hintF = G.frame; say(TT(h.ko, h.en), 220); sfx('hint');
};
window.toggleSound = function () { G.snd = !G.snd; try { localStorage.setItem(SND_KEY, G.snd ? '1' : '0'); } catch (e) {} reportSound(); if (G.snd) sfx('coin'); return G.snd; };
window.isSound = function () { return G.snd; };
window.__pfGo = function (n) { startGame(); var w = Math.floor((n - 1) / 5), si = (n - 1) % 5; for (var ww = 0; ww < w; ww++) G.prog.done[ww] = [1, 1, 1, 1, 1, 0]; G.prog.done[w] = [0, 0, 0, 0, 0, 0]; for (var q = 0; q < si; q++) G.prog.done[w][q] = 1; setWorld(w); G.sel = si; enterLevel(G.sel); };
reportSound();

function pop(x, y, t, c) { G.pops.push({ x: x, y: y, t: t, c: c, life: 45 }); }
function spark(x, y, c, n) { for (var i = 0; i < n; i++) G.parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2.5, life: 24 + Math.random() * 12, col: c, s: 2, g: 0.12 }); }
function handleEvents(st) {
  var ev = st.ev; if (!ev) return;
  for (var i = 0; i < ev.length; i++) { var e = ev[i];
    switch (e.k) {
      case 'jump': case 'spin': case 'coin': case 'stomp': case 'item': case 'hurt': case 'die': case 'kick': case 'grab': case 'fire': case 'star': case 'mount': case 'eat': case 'kill': case 'pswitch': case 'thud': case 'cannon': case 'spit': case 'bosshit': case 'swim': case 'spring': case 'fireburst': sfx(e.k); break;
    }
    switch (e.k) {
      case 'coin': pop(e.x, e.y - 6, '+' + (e.a || 10), '#ffe14a'); spark(e.x, e.y, '#ffe14a', 4); break;
      case 'coinpop': sfx('coin'); pop(e.x, e.y - 6, '+10', '#ffe14a'); spark(e.x, e.y, '#ffe14a', 5); G.bumps.push({ c: Math.floor(e.x / TS), r: Math.floor((e.y + 4) / TS), t: 0 }); break;
      case 'stomp': pop(e.x, e.y - 4, '+100', '#fff'); spark(e.x, e.y + 6, '#ffffff', 8); break;
      case 'kill': pop(e.x, e.y - 4, '+' + e.a, '#fff'); spark(e.x, e.y + 6, '#fff', 6); break;
      case 'bump': sfx('bump'); G.bumps.push({ c: Math.floor(e.x / TS), r: Math.floor(e.y / TS), t: 0 }); break;
      case 'brick': sfx('brick'); for (var k = 0; k < 8; k++) G.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3 - 1, life: 50, col: '#d9783a', s: 3, g: 0.2 }); pop(e.x, e.y - 8, '+50', '#fff'); break;
      case 'item': G.bumps.push({ c: Math.floor(e.x / TS), r: Math.floor((e.y + 4) / TS), t: 0 }); break;
      case 'grow': sfx('grow'); pop(e.x, e.y - 6, TT('파워업!', 'POWER UP!'), '#7dff9a'); spark(e.x + 6, e.y + 10, '#7dff9a', 12); say(TT('파워업! 한 번 맞아도 괜찮아요', 'Power up! You can take a hit now'), 120); break;
      case 'pow2': sfx('item'); pop(e.x, e.y - 6, '+300', '#7dff9a'); break;
      case 'hurt': spark(e.x + 6, e.y + 8, '#ff8a8a', 10); say(G.st && G.st.p.air <= 0 ? TT('숨이 막혀요! 물 밖으로', 'Out of air! Leave the water') : TT('아야! 파워다운', 'Ouch! Power lost'), 90); break;
      case 'special': sfx('special'); pop(e.x, e.y - 8, '★' + e.a + '/5', '#d08aff'); spark(e.x, e.y, '#d08aff', 10); if (e.a >= 5) { G.lives++; sfx('life'); say(TT('특수 코인 5개! 목숨 +1', 'All 5 special coins! Extra life'), 150); } break;
      case 'warp': G.pendingWarp = e.a; break;
      case 'key': sfx('special'); pop(e.x, e.y - 8, TT('열쇠!', 'KEY!'), '#fff'); spark(e.x, e.y, '#ffffff', 8); say(TT('열쇠를 얻었어요: 같은 색 문을 여세요', 'Got a key: open the door of the same colour'), 130); break;
      case 'unlock': sfx('pswitch'); spark(e.x, e.y, '#ffffff', 12); break;
      case 'switch': sfx('pswitch'); spark(e.x, e.y, '#ffe08a', 12); say(TT('스위치 작동!', 'Switch pressed!'), 110); break;
      case 'tele': sfx('warp'); spark(e.x, e.y, '#bff', 12); break;
      case 'launch': sfx('spring'); spark(e.x, e.y, '#ff8a3a', 10); break;
      case 'splash': for (var q2 = 0; q2 < 7; q2++) G.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 2.6, vy: -1.2 - Math.random() * 2, life: 22 + Math.random() * 10, col: 'rgba(200,250,255,.9)', s: 2, g: 0.16 }); sfx('swim'); break;
      case 'pocket': sfx('spring'); pop(e.x, e.y - 8, TT('숨!', 'AIR!'), '#bffcff'); spark(e.x, e.y, '#bffcff', 10); break;
      case 'pearl': sfx('special'); pop(e.x, e.y - 8, '+300', '#fff'); spark(e.x, e.y, '#ffffff', 10); break;
      case 'treasure': sfx('special'); pop(e.x, e.y - 8, '+500', '#7affe0'); spark(e.x, e.y, '#7affe0', 10); break;
      case 'drop': sfx('coin'); break;
      case 'bossdead': sfx('bossdead'); spark(e.x, e.y, '#ffd23a', 24); say(TT('보스 격파! 깃발이 열렸어요', 'Boss defeated! The gate is open'), 150); break;
      case 'goal': sfx('goal'); break;
      case 'spinkill': pop(e.x, e.y - 8, TT('스핀!', 'SPIN!'), '#fff'); break;
    }
  }
  st.ev = [];
}
function enterRoom(ringIdx) {
  var ring = G.L.rings[ringIdx]; if (!ring || G.main) return;
  var room = PF.roomLevel(G.seed, G.L.n + ringIdx, !!ring.secret); if (!room.valid) return;
  G.main = { st: G.st, L: G.L, ring: ring }; sfx('warp');
  var p0 = G.st.p; G.L = room; G.st = PF.newState(room, { rec: true, pw: p0.pw, mount: p0.mount }); aiReset(); setAuto(0); G.cam = 0; G.parts = []; G.pops = []; G.bumps = []; G.hint = null;
  say(ring.secret ? TT('비밀방! 끝까지 가면 비밀 출구', 'Secret room! Reach the end for a secret exit') : TT('보너스 방', 'Bonus room'), 150);
}
function leaveRoom() {
  var m = G.main, room = G.st; G.main = null; var secret = G.L.exitKind === 'secret'; G.L = m.L; G.st = m.st;
  G.st.score += room.score; G.st.coins += room.coins; var p = G.st.p; setWorldPw(p, room.p.pw); p.mount = room.p.mount;
  if (secret) { G.secretExit = true; p.won = true; G.st.f++; return; }
  p.x = m.ring.out.x; p.y = m.ring.out.y - (p.h - 14); p.vx = 0; p.vy = 0; p.inv = 40; G.cam = Math.max(0, Math.min(G.L.w * TS - VW, p.x - VW * 0.4)); aiReset(); setAuto(0);
}
function setWorldPw(p, v) { PF.setPw(p, v); }
function fixedStep() {
  G.frame++;
  if (G.msgT > 0 && G.mode !== 'pause') G.msgT--;
  var st = G.st, i;
  for (i = G.parts.length - 1; i >= 0; i--) { var q = G.parts[i]; q.x += q.vx; q.y += q.vy; q.vy += q.g; if (--q.life <= 0) G.parts.splice(i, 1); }
  for (i = G.pops.length - 1; i >= 0; i--) { var pp = G.pops[i]; pp.y -= 0.5; if (--pp.life <= 0) G.pops.splice(i, 1); }
  for (i = G.bumps.length - 1; i >= 0; i--) if (++G.bumps[i].t > 10) G.bumps.splice(i, 1);
  if (G.mode === 'start' || G.mode === 'over') { if (G.auto && ++G.autoWait > 90) startGame(); return; }
  if (G.mode === 'map') {
    if (G.auto && ++G.mapCool > 70) { G.mapCool = 0; var nd = allNodes().filter(function (n) { return isOpen(n) && !isDone(n.i) && n.i !== 5; })[0]; if (nd) { G.sel = nd.i; enterLevel(nd.i); } }
    return; }
  if (G.mode === 'pause' || !st || G.mode === 'loading') return;
  if (G.mode === 'play') {
    if (G.auto) setAuto(autoMask(st));
    PF.step(st, mask());
    handleEvents(st);
    if (G.pendingWarp !== undefined) { var wi = G.pendingWarp; G.pendingWarp = undefined; if (!G.auto) enterRoom(wi); }
    if (G.hint && G.hintT > 0) { G.hintT--; if (G.hintT <= 0) G.hint = null; else if ((G.frame - G.hintF) % 20 === 0) { G.hint = PFPlanner.hint(G.st, G.planner); } }
    st = G.st; var tc = totalCoins(); if (tc >= G.nextLife) { G.nextLife += 50; G.lives++; sfx('life'); say(TT('코인 50개! 목숨 +1', '50 coins! Extra life'), 120); }
    var p = st.p;
    if (p.dead) { G.mode = 'dying'; G.dieT = 0; G.dy = p.y; G.dvy = -5.5; setAuto(0); finishRun(); if (p.why === 'time') say(TT('시간 초과!', 'Time is up!'), 120); }
    else if (p.won) {
      if (G.main) leaveRoom();
      else { st = G.st; G.mode = 'clear'; G.clearT = 0; G.bonus = 1000 + Math.floor(st.t / 60) * 5; st.score += G.bonus; setAuto(0); finishRun(); }
    }
  } else if (G.mode === 'dying') {
    G.dieT++; G.dvy += 0.32; G.dy += G.dvy;
    if (G.dieT > 100) {
      if (G.main) { G.L = G.main.L; G.st = G.main.st; G.main = null; st = G.st; }
      G.base += st.score; G.coinBase += st.coins; G.lives--;
      if (G.lives <= 0) { G.mode = 'over'; G.autoWait = 0; finishRun(); }
      else { levelInit(st.cp); say(TT('다시 도전! 남은 목숨 ' + G.lives, 'Try again! Lives left: ' + G.lives), 120); }
    }
  } else if (G.mode === 'clear') {
    G.clearT++; var pw = st.p; pw.y = Math.min(pw.y + 1.2, G.L.poleY - pw.h);
    if (G.clearT > 170) {
      G.base += st.score; G.coinBase += st.coins; var node = G.curNode, d = G.prog.done[G.w] = G.prog.done[G.w] || [0, 0, 0, 0, 0, 0];
      d[node.i] = 1; if (G.secretExit) { G.prog.secret[G.w] = true; G.lives++; sfx('life'); }
      if (node.i === 5) { G.lives++; sfx('life'); }
      G.mode = 'map'; G.st = null; G.L = null; G.mapCool = 0;
      if (node.i === 4) { setWorld(G.w + 1); say(TT('월드 클리어! 월드 ' + (G.w + 1) + '로', 'World cleared! On to world ' + (G.w + 1)), 200); }
      else { G.sel = node.i === 5 ? 2 : node.i + 1; G.map = PF.worldMap(G.seed, G.w); say(G.secretExit ? TT('비밀 출구! 별길이 열렸어요', 'Secret exit! The Star Road opened') : TT('레벨 클리어!', 'Level cleared!'), 150); }
    }
  }
  if (G.st) { var p2 = G.st.p, tx = Math.max(0, Math.min(G.L.w * TS - VW, p2.x + 6 - VW * 0.42 + p2.vx * 14)); G.cam += (tx - G.cam) * 0.12; }
}

var last = 0, acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.1, (t - last) / 1000 || 0); last = t; acc += dt; var n = 0;
  while (acc >= 1 / 60 && n < 6) { try { fixedStep(); } catch (e) { window.__errs.push('step ' + e.message + ' ' + (e.stack || '').split('\n')[0]); acc = 0; } acc -= 1 / 60; n++; }
  if (n === 6) acc = 0;
  try { if (G.mode === 'start') PFR.startScreen(G, ctx, BS); else PFR.render(G, ctx, BS); } catch (e) { window.__errs.push('render ' + e.message + ' ' + (e.stack || '').split('\n')[0]); }
}
G.seed = parseInt(Q.get('seed'), 10) || 1; setWorld(0);
if (Q.get('autostart') === '1') startGame();
if (Q.get('auto') === '1') window.toggleAuto();
requestAnimationFrame(frame);
window.__pfDebug = function () { var p = G.st ? G.st.p : null; return { mode: G.mode, n: G.n, node: G.curNode && G.curNode.n, x: p && Math.round(p.x), y: p && Math.round(p.y), lives: G.lives, score: G.base + (G.st ? G.st.score : 0), coins: totalCoins(), auto: G.auto, pw: p && p.pw, vx: p && p.vx, vy: p && p.vy, ground: p && p.ground, hint: !!G.hint, msg: G.msg, best: G.best, errs: window.__errs.length, w: G.w, sel: G.sel, kind: G.L && G.L.kind, room: !!G.main }; };
})();
