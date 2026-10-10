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
  useRL: true, ai: (window.PFAI ? PFAI.makeShielded() : null), w: 0, map: null, sel: 0, prog: { done: {}, secret: {} }, main: null, curNode: null, secretExit: false, mapCool: 0 };
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
// two crosses: left = move (arrows / WASD), right = actions (I jump, J run, L spin, K act); Z/Space, X/Shift, C/V stay as aliases.  value = [input key, on-screen button id]
var KEYMAP = { ArrowLeft: ['left', 'L'], a: ['left', 'L'], A: ['left', 'L'], ArrowRight: ['right', 'R'], d: ['right', 'R'], D: ['right', 'R'], ArrowUp: ['up', 'U'], w: ['up', 'U'], W: ['up', 'U'], ArrowDown: ['down', 'D'], s: ['down', 'D'], S: ['down', 'D'],
  i: ['jump', 'J'], I: ['jump', 'J'], z: ['jump', 'J'], Z: ['jump', 'J'], ' ': ['jump', 'J'], j: ['run', 'RUN'], J: ['run', 'RUN'], x: ['run', 'RUN'], X: ['run', 'RUN'], Shift: ['run', 'RUN'], l: ['spin', 'SPIN'], L: ['spin', 'SPIN'], c: ['spin', 'SPIN'], C: ['spin', 'SPIN'], v: ['spin', 'SPIN'], V: ['spin', 'SPIN'], k: ['up', 'ACT'], K: ['up', 'ACT'] };
var PADBTN = {};   // button id -> element
var padCount = {}; // button id -> number of sources currently pressing it
function padLight(id, on) { var c = (padCount[id] || 0) + (on ? 1 : -1); if (c < 0) c = 0; padCount[id] = c; var el = PADBTN[id]; if (el) el.classList.toggle('on', c > 0); }
var keyDown = {};
function press(src, name, down) { held[src][name] = !!down; }
function mask() {
  var m = 0, k, s; for (s in held) { k = held[s]; if (k.left) m |= IN.L; if (k.right) m |= IN.R; if (k.jump) m |= IN.J; if (k.run) m |= IN.RUN; if (k.up) m |= IN.UP; if (k.down) m |= IN.DN; if (k.spin) m |= IN.SPIN; } return m;
}
function setAuto(m) { press('auto', 'left', m & IN.L); press('auto', 'right', m & IN.R); press('auto', 'jump', m & IN.J); press('auto', 'run', m & IN.RUN); press('auto', 'up', m & IN.UP); press('auto', 'down', m & IN.DN); press('auto', 'spin', m & IN.SPIN); }
function clearHeld(src) { held[src] = {}; }
var edge = { };
function onPress(k) {          // menu / map navigation on key press (human only)
  if (G.mode === 'select') { selectMove(k); return; }
  if (G.mode === 'sbrowse') { if (k === 'jump') sbPick(G.sbSel); else sbMove(k); return; }
  if (G.mode === 'super') { if (k === 'jump' && G.superT > 20) leaveSuper(); return; }
  if (G.mode === 'end') { if (k === 'jump' && G.superT > 30) startGame(true); return; }
  if (G.mode === 'start') { if (k === 'jump') startGame(false); }
  else if (G.mode === 'over') { if (k === 'jump') startGame(true); }
  else if (G.mode === 'map') { if (k === 'left' || k === 'right' || k === 'up' || k === 'down') moveSel(k); else if (k === 'jump') enterLevel(G.sel); }
}
window.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^F[2345]$/.test(e.key)) { if (embedded()) return; e.preventDefault(); if (e.key === 'F2') window.newGame(); else if (e.key === 'F3') window.toggleAuto(); else if (e.key === 'F4') window.giveHint(); return; }
  actx();
  var km = KEYMAP[e.key], k = km ? km[0] : null;
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); window.openSelect(); return; }
  if (e.key === 'Backspace') { e.preventDefault(); window.toMap(); return; }
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); window.openSuper(); return; }
  if (e.key === 'Escape' && G.mode === 'sbrowse') { e.preventDefault(); closeSuper(); return; }
  if (e.key === 'Escape' && G.mode === 'select') { e.preventDefault(); closeSelect(); return; }
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
  if (e.key === 'm' || e.key === 'M') { window.toggleSound(); return; }
  if (e.key === 'h' || e.key === 'H') { window.giveHint(); return; }
  if (e.key === 'Enter') { e.preventDefault(); onPress('jump'); return; }
  if (k) { e.preventDefault(); if (!e.repeat) onPress(k); press('human', k, true); if (!keyDown[e.key]) { keyDown[e.key] = 1; padLight(km[1], true); } }
});
window.addEventListener('keyup', function (e) { var km = KEYMAP[e.key]; if (km) { e.preventDefault(); if (keyDown[e.key]) { keyDown[e.key] = 0; padLight(km[1], false); } humanRefresh(); } });
function humanRefresh() { var d = {}; for (var key in keyDown) if (keyDown[key]) d[KEYMAP[key][0]] = true; held.human = d; }
window.addEventListener('blur', function () { clearHeld('human'); clearHeld('touch'); for (var kk in keyDown) if (keyDown[kk]) { keyDown[kk] = 0; padLight(KEYMAP[kk][1], false); } releaseAllTouch(); });
cv.addEventListener('pointerdown', function (e) {
  actx(); try { cv.focus(); } catch (x) {}
  var rr = cv.getBoundingClientRect(), qx = (e.clientX - rr.left) / rr.width * VW, qy = (e.clientY - rr.top) / rr.height * VH;
  if (G.mode === 'select') { var hit = null; (G.selRects || []).forEach(function (q) { if (qx >= q.x && qx <= q.x + q.w && qy >= q.y && qy <= q.y + q.h) hit = q; }); if (hit) { if (hit.kind === 'close') closeSelect(); else if (hit.kind === 'map') { closeSelect(); window.toMap(); } else if (hit.kind === 'super') { closeSelect(); window.openSuper(); } else if (hit.kind === 'world') { G.selWi = hit.idx; G.selCol = 1; G.selSiInit = -1; refreshSel(); } else if (hit.kind === 'stage') { G.selSi = hit.idx; selectPick(hit.idx); } } else closeSelect(); return; }
  if (G.mode === 'sbrowse') { var sh = null; (G.sRects || []).forEach(function (q) { if (qx >= q.x && qx <= q.x + q.w && qy >= q.y && qy <= q.y + q.h) sh = q; }); if (sh) sbPick(sh.id); else closeSuper(); return; }
  if (G.mode === 'super') { if (G.superT > 20) leaveSuper(); return; }
  if (G.mode === 'end') { if (G.superT > 30) startGame(true); return; }
  if (G.mode === 'start') startGame(false); else if (G.mode === 'over') startGame(true);
  else if (G.mode === 'map') { var r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * VW, py = (e.clientY - r.top) / r.height * VH, nodes = allNodes(), best = -1, bd = 22;
    for (var i = 0; i < nodes.length; i++) { var d = Math.hypot(nodes[i].x - px, nodes[i].y - py); if (d < bd && isOpen(nodes[i])) { bd = d; best = nodes[i].i; } }
    if (best >= 0) { if (G.sel === best) enterLevel(best); else G.sel = best; } else if (e.clientX > r.left + r.width / 2) enterLevel(G.sel); }
});
[['bMap', function () { window.toMap(); }], ['bSup', function () { window.openSuper(); }], ['bSel', function () { window.openSelect(); }]].forEach(function (b) { var el = document.getElementById(b[0]); if (el) { el.addEventListener('pointerdown', function (e) { e.preventDefault(); actx(); b[1](); }); } });
var touchSeen = false, touchPtr = {};      // pointerId -> { cross, ids:[button ids] }
function showPad(on) { pad.classList.toggle('on', !!on); layout(); }
[].forEach.call(pad.querySelectorAll('b[data-id]'), function (b) { PADBTN[b.getAttribute('data-id')] = b; });
var ACTKEY = { U: 'up', L: 'left', R: 'right', D: 'down', J: 'jump', RUN: 'run', SPIN: 'spin', ACT: 'up' };
function touchRefresh() { var d = {}; for (var id in touchPtr) { var t = touchPtr[id]; t.ids.forEach(function (b) { d[ACTKEY[b]] = true; }); } held.touch = d; }
function releaseAllTouch() { for (var id in touchPtr) { touchPtr[id].ids.forEach(function (b) { padLight(b, false); }); } touchPtr = {}; held.touch = {}; }
// each cross is one touch surface: the finger position picks up to two neighbouring buttons (8-way), so a thumb can hold e.g. right+jump
function crossIds(el, e) {
  var r = el.getBoundingClientRect(), dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2), ids = [], isMv = el.id === 'crossL', th = 0.32;
  if (Math.abs(dx) < 0.18 && Math.abs(dy) < 0.18) return ids;
  if (dy < -th) ids.push('U'); if (dy > th) ids.push('D'); if (dx < -th) ids.push('L'); if (dx > th) ids.push('R');
  if (!isMv) ids = ids.map(function (i2) { return { U: 'J', D: 'ACT', L: 'RUN', R: 'SPIN' }[i2]; });
  return ids;
}
function setPtr(el, e) { var old = touchPtr[e.pointerId], ids = crossIds(el, e); if (old) old.ids.forEach(function (b) { if (ids.indexOf(b) < 0) padLight(b, false); }); ids.forEach(function (b) { if (!old || old.ids.indexOf(b) < 0) { padLight(b, true); if (ACTKEY[b]) onPress(ACTKEY[b]); } }); touchPtr[e.pointerId] = { ids: ids }; touchRefresh(); }
['crossL', 'crossR'].forEach(function (cid) {
  var el = document.getElementById(cid);
  el.addEventListener('pointerdown', function (e) { e.preventDefault(); actx(); touchSeen = true; try { el.setPointerCapture(e.pointerId); } catch (x) {} setPtr(el, e); });
  el.addEventListener('pointermove', function (e) { if (touchPtr[e.pointerId]) { e.preventDefault(); setPtr(el, e); } });
  function up(e) { var o = touchPtr[e.pointerId]; if (o) { o.ids.forEach(function (b) { padLight(b, false); }); delete touchPtr[e.pointerId]; touchRefresh(); } }
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up); el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
});


// ---------------------------------------------------------------- layout
var BS = 1;
function layout() {
  var w = stage.clientWidth, h = stage.clientHeight; if (w < 10 || h < 10) return;
  var s = Math.min(w / VW, h / VH), cw = Math.floor(VW * s), ch = Math.floor(VH * s), dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px'; cv.style.left = Math.floor((w - cw) / 2) + 'px'; cv.style.top = Math.floor((h - ch) / 2) + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); BS = cv.width / VW;
  var cl = document.getElementById('crossL'); if (cl && cl.clientWidth) document.documentElement.style.setProperty('--cs', cl.clientWidth + 'px');
}
window.addEventListener('resize', layout);
var PAD_KEY = 'shapeworld.pad', padOn = true; try { if (localStorage.getItem(PAD_KEY) === '0') padOn = false; } catch (e) {}
if (padOn) pad.classList.add('on');
window.togglePad = function () { padOn = !padOn; try { localStorage.setItem(PAD_KEY, padOn ? '1' : '0'); } catch (e) {} showPad(padOn); try { if (window.parent !== window && window.parent.setPadMark) window.parent.setPadMark(padOn); } catch (e) {} return padOn; };
window.isPad = function () { return padOn; };
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
function nodeById(id) { for (var k = 0; k < G.map.nodes.length; k++) if (G.map.nodes[k].i === id) return G.map.nodes[k]; return null; }
// ---- progress (persisted per seed in localStorage, always inside try/catch)
function saveKey(seed) { return 'shapeworld.save.' + seed; }
function saveProg() {   // the whole resumable state: cleared stages / worlds, secret routes, current world, map position, lives, score, coins
  if (!G.sm || !G.prog) return;
  try {
    G.prog.lives = G.lives; G.prog.base = G.base; G.prog.coinBase = G.coinBase; G.prog.nextLife = G.nextLife; G.prog.sel = G.sel; G.prog.cur = G.wid;
    G.prog.inLevel = (G.curNode && (G.mode === 'play' || G.mode === 'pause' || G.mode === 'dying' || G.mode === 'loading' || G.mode === 'clear')) ? G.curNode.i : -1; G.prog.t = Date.now();
    var pk = {}; for (var kk in G.prog) pk[kk] = G.prog[kk]; pk.done = packMap(G.prog.done); pk.secret = packMap(G.prog.secret);   // compact: one bit mask per visited world
    localStorage.setItem(saveKey(G.seed), JSON.stringify(pk)); localStorage.setItem('shapeworld.last', String(G.seed));
  } catch (e) {}
}
function clearSave() { try { localStorage.removeItem(saveKey(G.seed)); localStorage.removeItem('shapeworld.last'); } catch (e) {} }
function hasProgress(p) { if (!p) return false; var any = false; for (var w in p.done) for (var k in p.done[w]) any = true; for (var w2 in p.wcl) any = true; return any || (p.base || 0) > 0 || (p.cur || 0) > 0; }
function packMap(m) { var o = {}; for (var w in m) { var mask = 0; for (var k in m[w]) if (m[w][k]) mask |= 1 << (+k); if (mask) o[w] = mask; } return o; }
function unpackMap(m) { var o = {}; for (var w in (m || {})) { o[w] = {}; for (var k = 0; k < 16; k++) if ((m[w] >> k) & 1) o[w][k] = 1; } return o; }
function loadProg(seed) { try { var s = localStorage.getItem(saveKey(seed)); if (s) { var o = JSON.parse(s); if (o && o.done && o.wcl) { o.done = unpackMap(o.done); o.secret = unpackMap(o.secret); return o; } } } catch (e) {} return null; }
function lastSeed() { try { var s = parseInt(localStorage.getItem('shapeworld.last'), 10); return s > 0 ? s : 0; } catch (e) { return 0; } }
function worldCleared(wid) { return !!G.prog.wcl[wid]; }
G.selStageState = function (wid, map, nd) { return stageState(wid, map, nd); };
G.worldName = function (wid) { return worldName(wid); };
function worldName(wid) { var w = PF.worldInfo(G.seed, wid); return (w.depth + 1) + 'ABC'.charAt(w.slot); }
// ---- map logic, written for any world so the stage-select dialog can reuse it
function isDoneW(wid, id) { var d = G.prog.done[wid]; return !!(d && d[id]); }
function edgeOpenW(wid, e) { if (!isDoneW(wid, e.a)) return false; if (e.secret) { var s = G.prog.secret[wid]; return !!(s && s[e.a]); } return true; }
function isOpenW(wid, map, nd) { if (worldCleared(wid)) return true; if (nd.i === 0) return true; for (var k = 0; k < map.edges.length; k++) if (map.edges[k].b === nd.i && edgeOpenW(wid, map.edges[k])) return true; return false; }
function isDone(id) { return isDoneW(G.wid, id); }
function edgeOpen(e) { return edgeOpenW(G.wid, e); }
function isOpen(nd) { return isOpenW(G.wid, G.map, nd); }
function isVisible(nd) { return nd.main || isOpen(nd); }
function allNodes() { return G.map.nodes.filter(isVisible); }
// the next level the auto player (and the hint) should take: any open, unfinished level, preferring the main route (it never needs a secret exit)
function nextTarget() { var c = G.map.nodes.filter(function (n) { return isOpenW(G.wid, G.map, n) && !isDone(n.i) && (!worldCleared(G.wid) || n.main); }); c.sort(function (a, b) { return (a.main ? 0 : 1) - (b.main ? 0 : 1) || a.i - b.i; }); return c[0] || null; }
function moveSel(dir) {
  var cur = nodeById(G.sel) || G.map.nodes[0], vx = dir === 'right' ? 1 : dir === 'left' ? -1 : 0, vy = dir === 'down' ? 1 : dir === 'up' ? -1 : 0, best = null, bs = 1e9;
  allNodes().forEach(function (n) { if (!isOpen(n) || n.i === G.sel) return; var dx = n.x - cur.x, dy = n.y - cur.y; if (dx * vx + dy * vy <= 2) return; var sc = Math.hypot(dx, dy) + Math.abs(dx * vy - dy * vx) * 0.6; if (sc < bs) { bs = sc; best = n; } });
  if (best) { G.sel = best.i; sfx('pop'); }
}
function setWorld(wid) { var w = PF.worldInfo(G.seed, wid); G.wid = wid; G.depth = w.depth; G.map = PF.worldMap(G.seed, wid, w.depth, w.mainEnd); G.prog.cur = wid; var t = nextTarget(); G.sel = t ? t.i : 0; G.fn = { isDone: isDone, isOpen: isOpen, isVisible: isVisible, edgeOpen: edgeOpen }; }
function startGame(fresh) {
  if (Q.get('seed')) G.seed = parseInt(Q.get('seed'), 10) || 1; else if (!fresh && lastSeed()) G.seed = lastSeed(); else G.seed = 1 + Math.floor(Math.random() * 999999);
  G.sm = {}; G.prog = (!fresh && loadProg(G.seed)) || { done: {}, secret: {}, wcl: {}, cur: 0, front: 0 };
  var p0 = G.prog, resumed = !fresh && hasProgress(p0);
  G.base = resumed ? (p0.base || 0) : 0; G.coinBase = resumed ? (p0.coinBase || 0) : 0; G.lives = resumed && p0.lives > 0 ? p0.lives : 3; G.nextLife = resumed && p0.nextLife ? p0.nextLife : 50; G.main = null; G.st = null; G.L = null; G.hint = null; G.autoWait = 0; G.mapCool = 0;
  setWorld(PF.worldExists(G.prog.cur) ? G.prog.cur : 0); if (resumed) { var rs = p0.inLevel >= 0 ? p0.inLevel : p0.sel, nd = nodeById(rs); if (nd && isOpen(nd)) G.sel = nd.i; }
  G.mode = 'map'; setAuto(0); aiReset(); saveProg();
  say(resumed ? TT('이어하기: 월드 ' + worldName(G.wid) + ' (목숨 ' + G.lives + ')', 'Resumed: world ' + worldName(G.wid) + ' (lives ' + G.lives + ')') : TT('월드 ' + worldName(G.wid) + ': 레벨을 골라 시작하세요', 'World ' + worldName(G.wid) + ': pick a level to start'), 150);
  var lv = parseInt(Q.get('level'), 10); if (lv && !G.lvDone) { G.lvDone = true; window.__pfGo(lv); }
}
// ---- world endings (castle / cannon) lead to different next worlds on the super map
function endWorld(ending) {
  G.prog.wcl[G.wid] = ending; var w = PF.worldInfo(G.seed, G.wid), next = w.next[ending]; G.endingTaken = ending; saveProg();   // the world graph is endless: every ending leads to a new world
  G.superFrom = G.wid; G.superTo = next; G.superT = 0; G.mode = 'super'; sfx('life');
}
function leaveSuper() { var nx = G.superTo; G.prog.front = Math.max(G.prog.front || 0, nx); setWorld(nx); saveProg(); G.mode = 'map'; G.mapCool = 0; say(TT('월드 ' + worldName(nx) + ' 도착!', 'Arrived in world ' + worldName(nx) + '!'), 150); }
// ---- stage select dialog (Game menu / T): cleared worlds + the current one, and inside a world its cleared stages + the frontier; a cleared world opens all its stages
// ---- navigation: back to the world map at any time, and from the map up to the super map
window.toMap = function () {
  if (G.mode === 'sbrowse') { closeSuper(); return true; } if (G.mode === 'select') { closeSelect(); }
  if (G.mode === 'play' || G.mode === 'pause' || G.mode === 'dying' || G.mode === 'loading' || G.mode === 'clear') { G.mode = 'map'; G.st = null; G.L = null; G.main = null; G.hint = null; setAuto(0); aiReset(); G.mapCool = 0; saveProg(); say(TT('월드 지도로 돌아왔어요 (스테이지는 다시 처음부터)', 'Back on the world map (the stage restarts when re-entered)'), 160); return true; }
  return false;
};
function closeSuper() { G.superBrowse = false; G.mode = 'map'; }
window.openSuper = function () {
  if (G.mode === 'sbrowse') { closeSuper(); return false; }
  if (G.mode === 'start') startGame(false);
  if (G.mode !== 'map') { if (!window.toMap()) return false; }
  G.mode = 'sbrowse'; G.superBrowse = true; G.sbSel = G.wid; G.sbT = 0; G.superFrom = undefined; return true;
};
function sbMove(dir) {
  var cur = null, lay = G.sLay || []; lay.forEach(function (w) { if (w.id === G.sbSel) cur = w; }); if (!cur) return;
  var vx = dir === 'right' ? 1 : dir === 'left' ? -1 : 0, vy = dir === 'down' ? 1 : dir === 'up' ? -1 : 0, best = null, bs = 1e9;
  lay.forEach(function (w) { if (w.id === cur.id) return; var dx = w.x - cur.x, dy = w.y - cur.y; if (dx * vx + dy * vy <= 2) return; var sc = Math.hypot(dx, dy) + Math.abs(dx * vy - dy * vx) * 0.7; if (sc < bs) { bs = sc; best = w; } });
  if (best) { G.sbSel = best.id; sfx('pop'); }
}
function sbPick(id) {
  var ok = worldCleared(id) || id === G.wid || id === (G.prog.front || 0); if (!ok) { sfx('bump'); return; }
  closeSuper(); if (id !== G.wid) { setWorld(id); saveProg(); say(TT('월드 ' + worldName(id), 'World ' + worldName(id)), 120); }
}
function selectableWorlds() { var ids = {}; Object.keys(G.prog.wcl).forEach(function (k) { ids[k] = 1; }); ids[G.wid] = 1; ids[G.prog.front || 0] = 1; return Object.keys(ids).map(Number).sort(function (a, b) { return a - b; }).map(function (id) { return PF.worldInfo(G.seed, id); }); }
function selMapOf(wid) { var w = PF.worldInfo(G.seed, wid); return wid === G.wid ? G.map : PF.worldMap(G.seed, wid, w.depth, w.mainEnd); }
function stageState(wid, map, nd) { if (isDoneW(wid, nd.i)) return 'done'; if (isOpenW(wid, map, nd)) return 'open'; return 'locked'; }
window.openSelect = function () {
  if (G.mode === 'select') { closeSelect(); return false; }
  if (G.mode === 'start') startGame(false);
  if (G.mode !== 'map' && G.mode !== 'play' && G.mode !== 'pause') return false;
  G.selPrev = G.mode; G.mode = 'select'; var ws = selectableWorlds(); G.selList = ws; G.selWi = Math.max(0, ws.map(function (w) { return w.id; }).indexOf(G.wid)); G.selCol = 1; G.selSi = 0; refreshSel(); return true;
};
function refreshSel() { var w = G.selList[G.selWi]; G.selMapObj = selMapOf(w.id); var first = 0; for (var k = 0; k < G.selMapObj.nodes.length; k++) { var s = stageState(w.id, G.selMapObj, G.selMapObj.nodes[k]); if (s === 'open') { first = k; break; } } G.selSi = Math.min(G.selSi, G.selMapObj.nodes.length - 1); if (G.selCol === 1 && G.selSiInit !== w.id) { G.selSi = first; G.selSiInit = w.id; } }
function closeSelect() { if (G.mode === 'select') G.mode = G.selPrev === 'play' ? 'play' : G.selPrev; }
function selectMove(k) {
  if (k === 'left') G.selCol = 0; else if (k === 'right') G.selCol = 1;
  else if (k === 'up' || k === 'down') { var d = k === 'up' ? -1 : 1; if (G.selCol === 0) { G.selWi = Math.max(0, Math.min(G.selList.length - 1, G.selWi + d)); G.selSiInit = -1; refreshSel(); } else G.selSi = Math.max(0, Math.min(G.selMapObj.nodes.length - 1, G.selSi + d)); sfx('pop'); }
  else if (k === 'jump') { if (G.selCol === 0) { G.selCol = 1; sfx('pop'); } else selectPick(G.selSi); }
}
function selectPick(si) {
  var w = G.selList[G.selWi], nd = G.selMapObj.nodes[si]; if (!nd) return; var s = stageState(w.id, G.selMapObj, nd); if (s === 'locked') { sfx('bump'); return; }
  closeSelect(); G.mode = 'map'; if (w.id !== G.wid) setWorld(w.id); G.sel = nd.i; G.main = null; enterLevel(nd.i, true);
}
function levelInit(cp) {
  var node = G.curNode; G.st = PF.newState(G.L, { rec: true, cp: !!cp }); aiReset(); setAuto(0); G.parts = []; G.pops = []; G.bumps = []; G.hint = null; G.cam = Math.max(0, Math.min(G.L.w * TS - VW, G.st.p.x - VW * 0.4)); G.camY = Math.max(0, Math.min((G.L.rows || PF.ROWS) * TS - VH, G.st.p.y - VH * 0.55)); G.mode = 'play'; G.secretExit = false;
}
function enterLevel(i, force) {
  var node = nodeById(i); if (!node || G.mode === 'loading') return; if (!force && !isOpen(node)) return;
  G.curNode = node; G.mode = 'loading'; G.st = null; G.hint = null; saveProg();
  setTimeout(function () { G.n = node.n; var sd = PF.hash(G.seed, G.wid, 31); G.L = PF.generate(sd, node.n, { kind: node.kind, secret: !!node.secret }); G.main = null; levelInit(false); var kn = PF.KIND_NAMES[G.L.kind]; say(PFR.levelLabel({ n: node.n }) + ' ' + (KO ? kn[0] : kn[1]), 150); G.msgIsLevel = true; }, 30);
}
function totalCoins() { return G.coinBase + (G.st ? G.st.coins : 0); }
function finishRun() { var s = G.base + (G.st ? G.st.score : 0); if (s > G.best) { G.best = s; saveBest(); } }
function togglePause() { if (G.mode === 'play') { G.mode = 'pause'; say(TT('일시정지 (P)', 'Paused (P)'), 9999); } else if (G.mode === 'pause') { G.mode = 'play'; G.msgT = 0; } }
window.newGame = function () { startGame(true); return true; };
window.toggleAuto = function () {
  G.auto = !G.auto; setAuto(0); aiReset(); reportAuto();
  if (G.auto) { say(TT('자동 플레이 켜짐 (F3로 끄기)', 'Auto play on (F3 to stop)'), 120); if (G.mode === 'start') startGame(false); else if (G.mode === 'over') startGame(true); } else say(TT('자동 플레이 꺼짐', 'Auto play off'), 90);
  return G.auto;
};
window.giveHint = function () {
  if (G.mode === 'map') { var nd = nextTarget(); say(nd ? TT('다음 레벨: ' + worldName(G.wid) + '·' + (nd.ending ? 5 : nd.i + 1) + ' (' + PF.KIND_NAMES[nd.kind][0] + ')', 'Next level: ' + worldName(G.wid) + '·' + (nd.ending ? 5 : nd.i + 1) + ' (' + PF.KIND_NAMES[nd.kind][1] + ')') : TT('이 월드를 모두 깼어요', 'World cleared'), 150); return; }
  if (G.mode !== 'play') { say(TT('게임 중에만 힌트를 볼 수 있어요', 'Hints are available while playing'), 90); return; }
  var h = PFPlanner.hint(G.st, G.planner); G.hint = h; G.hintT = 220; G.hintF = G.frame; say(TT(h.ko, h.en), 220); sfx('hint');
};
window.toggleSound = function () { G.snd = !G.snd; try { localStorage.setItem(SND_KEY, G.snd ? '1' : '0'); } catch (e) {} reportSound(); if (G.snd) sfx('coin'); return G.snd; };
window.isSound = function () { return G.snd; };
window.__pfGo = function (n) { startGame(true); var si = (n - 1) % 5; G.prog.done[G.wid] = {}; for (var q = 0; q < Math.min(si, 4); q++) G.prog.done[G.wid][q] = 1; setWorld(G.wid); G.sel = Math.min(si, 4); enterLevel(G.sel, true); };
window.addEventListener('pagehide', saveProg); window.addEventListener('beforeunload', saveProg); document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') saveProg(); });
reportSound(); try { if (window.parent !== window && window.parent.setPadMark) window.parent.setPadMark(padOn); } catch (e) {}

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
  if (G.mode === 'play' && G.L && G.frame % 150 === 0) { var pt = (PF.THEME_PITCH && PF.THEME_PITCH[G.L.theme]) || 1, nt = [0, 7, 3, 10][(G.frame / 150 | 0) % 4]; tone(110 * pt * Math.pow(2, nt / 12), 110 * pt * Math.pow(2, nt / 12), 2.2, 'sine', 0.018); }
  if (G.msgT > 0 && G.mode !== 'pause') G.msgT--;
  var st = G.st, i;
  for (i = G.parts.length - 1; i >= 0; i--) { var q = G.parts[i]; q.x += q.vx; q.y += q.vy; q.vy += q.g; if (--q.life <= 0) G.parts.splice(i, 1); }
  for (i = G.pops.length - 1; i >= 0; i--) { var pp = G.pops[i]; pp.y -= 0.5; if (--pp.life <= 0) G.pops.splice(i, 1); }
  for (i = G.bumps.length - 1; i >= 0; i--) if (++G.bumps[i].t > 10) G.bumps.splice(i, 1);
  if (G.mode === 'start' || G.mode === 'over') { if (G.auto && ++G.autoWait > 90) startGame(G.mode === 'over'); return; }
  if (G.mode === 'map') {
    if (G.auto && ++G.mapCool > 70) { G.mapCool = 0; var nd = nextTarget(); if (nd) { G.sel = nd.i; enterLevel(nd.i); } }
    return; }
  if (G.mode === 'super') { if (++G.superT > 100 && G.auto) leaveSuper(); return; }
  if (G.mode === 'end') { if (++G.superT > 240 && G.auto) startGame(true); return; }
  if (G.mode === 'select') return;
  if (G.mode === 'sbrowse') { if (G.auto && ++G.sbT > 120) closeSuper(); return; }
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
      if (G.lives <= 0) { G.mode = 'over'; G.autoWait = 0; finishRun(); clearSave(); }
      else { saveProg(); levelInit(st.cp); say(TT('다시 도전! 남은 목숨 ' + G.lives, 'Try again! Lives left: ' + G.lives), 120); }
    }
  } else if (G.mode === 'clear') {
    G.clearT++; var pw = st.p; pw.y = Math.min(pw.y + 1.2, G.L.poleY - pw.h);
    if (G.clearT > 170) {
      G.base += st.score; G.coinBase += st.coins; var node = G.curNode, d = G.prog.done[G.wid] = G.prog.done[G.wid] || {};
      d[node.i] = 1; if (G.secretExit) { var sc = G.prog.secret[G.wid] = G.prog.secret[G.wid] || {}; sc[node.i] = true; G.lives++; sfx('life'); }
      if (node.kind === 'bonus') { G.lives++; sfx('life'); }
      G.mode = 'map'; G.st = null; G.L = null; G.mapCool = 0;
      if (node.ending) { endWorld(node.ending); }
      else { var tg = nextTarget(); G.sel = tg ? tg.i : G.sel; if (G.secretExit) { var br = G.map.edges.filter(function (e) { return e.a === node.i && e.secret; })[0]; if (br) G.sel = br.b; } say(G.secretExit ? TT('비밀 출구! 지도에 새 길이 열렸어요', 'Secret exit! A new route opened on the map') : TT('레벨 클리어!', 'Level cleared!'), 150); }
      saveProg();
    }
  }
  if (G.st) { var p2 = G.st.p, tx = Math.max(0, Math.min(G.L.w * TS - VW, p2.x + 6 - VW * 0.42 + p2.vx * 14)); G.cam += (tx - G.cam) * 0.12; var RW = G.L.rows || PF.ROWS, ty = Math.max(0, Math.min(RW * TS - VH, p2.y + p2.h / 2 - VH * 0.55 + p2.vy * 6)); G.camY = (G.camY === undefined || RW === PF.ROWS) ? ty : G.camY + (ty - G.camY) * 0.14; }
}

var last = 0, acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.1, (t - last) / 1000 || 0); last = t; acc += dt; var n = 0;
  while (acc >= 1 / 60 && n < 6) { try { fixedStep(); } catch (e) { window.__errs.push('step ' + e.message + ' ' + (e.stack || '').split('\n')[0]); acc = 0; } acc -= 1 / 60; n++; }
  if (n === 6) acc = 0;
  try { if (G.mode === 'start') PFR.startScreen(G, ctx, BS); else PFR.render(G, ctx, BS); } catch (e) { window.__errs.push('render ' + e.message + ' ' + (e.stack || '').split('\n')[0]); }
}
G.seed = parseInt(Q.get('seed'), 10) || lastSeed() || 1; G.sm = {}; G.prog = loadProg(G.seed) || { done: {}, secret: {}, wcl: {}, cur: 0, front: 0 }; setWorld(PF.worldExists(G.prog.cur) ? G.prog.cur : 0); G.hasSave = hasProgress(G.prog);
if (Q.get('autostart') === '1') startGame();
if (Q.get('auto') === '1') window.toggleAuto();
requestAnimationFrame(frame);
// test hook: with auto play on, force-clear every level (the map / super-map flow is what is being tested)
window.__pfFastRun = function () { window.__ffIv = setInterval(function () { for (var k = 0; k < 6; k++) { if (G.mode === 'play' && G.st) { G.st.p.won = true; } else if (G.mode === 'map' || G.mode === 'super' || G.mode === 'clear' || G.mode === 'start' || G.mode === 'over' || G.mode === 'end' || G.mode === 'dying') fixedStep(); } }, 4); };
window.__pfDebug = function () { var p = G.st ? G.st.p : null; return { mode: G.mode, n: G.n, node: G.curNode && G.curNode.n, x: p && Math.round(p.x), y: p && Math.round(p.y), lives: G.lives, score: G.base + (G.st ? G.st.score : 0), coins: totalCoins(), auto: G.auto, pw: p && p.pw, vx: p && p.vx, vy: p && p.vy, ground: p && p.ground, hint: !!G.hint, msg: G.msg, best: G.best, errs: window.__errs.length, w: G.w, sel: G.sel, kind: G.L && G.L.kind, room: !!G.main }; };
})();
