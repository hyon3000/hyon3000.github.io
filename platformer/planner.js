// Shape World - look-ahead planner used by Auto Play (F3) and Hint (F4).
// It clones the game's own deterministic simulation and tries input sequences made of the four keys a human has
// (left / right / run / jump). The best plan's first few frames are executed through the normal input path.
(function (root) {
'use strict';
var IN = PF.IN, N = 0, R = IN.R, RR = IN.R | IN.RUN, Lf = IN.L;
var H = 64, REPLAN = 8;
var CANDS = (function () {
  var c = [], dirs = [RR, R, N], s, a, b, h;
  [0, 8, 20, 40].forEach(function (s) { dirs.forEach(function (a) { dirs.forEach(function (b) { if (s === 0 && a !== b) return; c.push({ a: a, b: b, s: s, h: -1 }); }); }); });
  [0, 3, 6, 10, 15, 22, 30].forEach(function (s) { dirs.forEach(function (a) { dirs.forEach(function (b) { if (s === 0 && a !== RR && a !== R) return; [99, 12, 4].forEach(function (h) { c.push({ a: a, b: b, s: s, h: h }); }); }); }); });
  [8, 16].forEach(function (s) { [R, RR].forEach(function (b) { c.push({ a: Lf, b: b, s: s, h: -1 }); [99, 12].forEach(function (h) { c.push({ a: Lf, b: b, s: s, h: h }); }); }); });
  [0, 6, 12].forEach(function (s) { [R, RR].forEach(function (a) { [R, RR].forEach(function (b) { [18, 30].forEach(function (t) { [99, 12].forEach(function (h) { c.push({ a: a, b: b, s: s, h: h, t: t, c: N }); }); }); }); }); });
  [20, 40].forEach(function (l) { [12, 22, 32].forEach(function (s) { [99, 12].forEach(function (h) { c.push({ a: RR, b: RR, s: s, h: h, l: l }); }); }); c.push({ a: RR, b: RR, s: 30, h: -1, l: l }); });
  return c;
})();
var BOSS_EXTRA = (function () { var c = []; [RR, R, N, Lf].forEach(function (d) { [1, 2, 4, 5, 7, 8, 9, 11, 12, 13, 14, 16, 18, 20, 24, 26].forEach(function (s) { [99, 12].forEach(function (h) { c.push({ a: d, b: d, s: s, h: h }); }); }); }); return c; })();
var LEFT_EXTRA = (function () { var c = []; var LL = Lf | IN.RUN; [Lf, LL].forEach(function (a) { [a, N].forEach(function (b) { [0, 4, 8, 12, 16, 20, 26, 32].forEach(function (s) { c.push({ a: a, b: b, s: s, h: -1 }); [99, 12].forEach(function (h) { c.push({ a: a, b: b, s: s, h: h }); }); }); }); }); return c; })();
function bossNear(st) { if (st.boss <= 0) return false; for (var i = 0; i < st.en.length; i++) { var e = st.en[i]; if (e.t === 8 && e.alive && Math.abs(e.x - st.p.x) < 260) return true; } return false; }
function inputAt(c, k) { if (c.l) { if (k < c.l) return Lf; k -= c.l; } var m = k < c.s ? c.a : (c.t !== undefined && k >= c.s + c.t ? c.c : c.b); if (c.h > 0 && k >= c.s && k < c.s + c.h) m |= IN.J; return m; }

function groundBelow(st) {
  var p = st.p, c0 = Math.floor(p.x / PF.TS), c1 = Math.floor((p.x + p.w - 1e-4) / PF.TS), r0 = Math.floor((p.y + p.h) / PF.TS);
  for (var c = c0; c <= c1; c++) for (var r = r0; r < (st.L.rows || PF.ROWS); r++) { var t = PF.tileAt(st, c, r); if (PF.SOL[t] || t === 12 || t === 13 || t === 9 || t === 7) return true; }
  var L = st.L; for (var i = 0; i < L.movers.length; i++) { var m = L.movers[i], mq = PF.movPos(st, i, st.f); if (p.x + p.w > mq.x - 20 && p.x < mq.x + m.w + 20 && p.y + p.h <= mq.y + 30) return true; }
  return false;
}
function evaluate(st0, c, traj) {
  st0.share = true; var st = PF.clone(st0), p = st.p, big0 = st0.p.big, k, sc, lastGround = p.ground, land = -1, jumped = false;
  for (k = 0; k < H; k++) {
    PF.step(st, inputAt(c, k));
    if (traj && (k & 1) === 0) traj.push({ x: p.x + p.w / 2, y: p.y + p.h });
    if (traj && land < 0) { if (!p.ground) jumped = true; else if (jumped) land = traj.length - 1; }
    if (p.dead) return { sc: -1e5 + k * 30, dead: true, k: k };
    if (p.won) return { sc: 1e6 - k, won: true, k: k };
  }
  if (st0.L.puzzle && st0.L.crumbs) { var cbs = st.L.crumbs, tg = cbs[Math.min(cbs.length - 1, st.cr + 1)], tg2 = cbs[Math.min(cbs.length - 1, st.cr + 2)]; sc = st.cr * 500 + (st.stage - st0.stage) * 3000 - (Math.abs(p.x + 6 - tg[0]) + 1.5 * Math.abs(p.y + 7 - tg[1])) * 2.5 - (Math.abs(p.x + 6 - tg2[0]) + 1.5 * Math.abs(p.y + 7 - tg2[1])) * 0.5 + (st.score - st0.score) * 0.1; if (!p.ground) sc -= 15; return { sc: sc, dead: false, land: land, k: k }; }
  var bi = -1, bd = 1e9; if (st0.boss > 0) { for (var q = 0; q < st0.en.length; q++) { var be = st0.en[q]; if (be.t === 8 && be.alive) { var dd = Math.abs(p.x - be.x); if (dd < bd) { bd = dd; bi = q; } } } }
  if (bi >= 0) { var b1 = st.en[bi], b0 = st0.en[bi]; sc = -Math.abs(p.x + 6 - (b1.x + b1.w / 2)) * 3 + (b0.hp - b1.hp) * 900 + (st.score - st0.score) * 0.25; if (!b1.alive) sc += 3000; }
  else sc = p.x * 3 + (st.score - st0.score) * 0.25;
  if (big0 && !p.big) sc -= 400;
  if (!p.ground) { sc -= 25; if (!groundBelow(st)) sc -= 3000; }
  if (st0.p.air < 700) sc += (p.air - st0.p.air) * 0.3; if (p.air < 200) sc -= (200 - p.air) * 3;
  if (c.h > 0) sc -= 2 + c.s * 0.4;
  if (c.a === Lf || c.l) sc -= 30;
  return { sc: sc, dead: false, land: land, k: k };
}
function makePlanner() {
  var SL = 8;
  var pl = { script: null, i: 0, bestX: 0, bestF: 0, rnd: PF.rng(12345), explore: 0, last: null, stats: { plans: 0, ms: 0, sync: 0 }, pend: null, next: null };
  var now = function () { return typeof performance !== 'undefined' ? performance.now() : 0; };
  pl.reset = function () { pl.script = null; pl.i = 0; pl.bestX = 0; pl.bestF = 0; pl.explore = 0; pl.pend = null; pl.next = null; };
  function newSearch(st, noise) { return { st: st, i: 0, best: null, bi: -1, noise: noise, rising: st.p.jheld && !st.p.ground && st.p.vy < 0, list: (bossNear(st) ? CANDS.concat(BOSS_EXTRA) : CANDS).concat(st.L.puzzle ? LEFT_EXTRA : []) }; }
  function work(ps, n) {
    var end = Math.min(ps.list.length, ps.i + n);
    for (; ps.i < end; ps.i++) { var c = ps.list[ps.i], r = evaluate(ps.st, c, null); if (ps.rising && c.s === 0 && c.h > 0 && !c.l) r.sc += 8; var sc = r.sc + (ps.noise ? pl.rnd() * ps.noise : 0); if (ps.best === null || sc > ps.best.sc) { ps.best = r; ps.best.sc = sc; ps.bi = ps.i; } }
    if (ps.i >= ps.list.length) { ps.best.cand = ps.list[ps.bi]; return ps.best; } return null;
  }
  pl.search = function (st, noise) { var ps = newSearch(st, noise); return work(ps, ps.list.length); };
  function makeScript(best) { var len = best.cand.l ? 12 : SL, sc = []; for (var k = 0; k < len; k++) sc.push(inputAt(best.cand, k)); return sc; }
  function predict(st, script) { st.share = true; var q = PF.clone(st); for (var k = 0; k < script.length; k++) PF.step(q, script[k]); return q; }
  function same(a, b) { return Math.abs(a.p.x - b.p.x) < 0.01 && Math.abs(a.p.y - b.p.y) < 0.01 && a.p.dead === b.p.dead && Math.abs(a.p.vx - b.p.vx) < 0.01 && Math.abs(a.p.vy - b.p.vy) < 0.01; }
  pl.decide = function (st) {
    var p = st.p, t0 = now();
    if (p.x > pl.bestX + 4) { pl.bestX = p.x; pl.bestF = st.f; }
    if (!pl.script || pl.i >= pl.script.length) {
      var best = null;
      if (pl.next && pl.next.pred && same(pl.next.pred, st)) { var ps = pl.next.ps; best = ps.done || work(ps, ps.list.length); }
      else { if (st.f - pl.bestF > 300) { pl.explore = 40; pl.bestF = st.f - 100; } best = pl.search(st, pl.explore > 0 ? 25 : 0); if (pl.explore > 0) pl.explore -= SL; pl.stats.sync++; }
      pl.next = null; pl.stats.plans++;
      pl.last = best; pl.script = makeScript(best); pl.i = 0;
      var pred = predict(st, pl.script); pl.next = { pred: pred, ps: newSearch(pred, pl.explore > 0 ? 25 : 0) };
    }
    if (pl.next && !pl.next.ps.done) { var per = Math.ceil(pl.next.ps.list.length / (pl.script.length - 1)); var r = work(pl.next.ps, per); if (r) pl.next.ps.done = r; }
    pl.stats.ms += now() - t0;
    return pl.script[pl.i++];
  };
  return pl;
}

// ---- hint: a short text + the predicted path / landing spot / hazard
function nearestHazard(st) {
  var p = st.p, L = st.L, TS = PF.TS, best = null, px = p.x + p.w / 2, d;
  function cons(kind, x, y, dx) { if (dx >= -4 && (best === null || dx < best.dx)) best = { kind: kind, x: x, y: y, dx: dx }; }
  for (var i = 0; i < st.en.length; i++) { var e = st.en[i]; if (!e.alive) continue; d = e.x + e.w / 2 - px; if (d < 220 && Math.abs(e.y - p.y) < 60) if (e.t === PF.E.PLANT && e.hid) continue; cons({ 1: 'spiky', 2: 'flyer', 3: 'beetle', 4: 'bullet', 5: 'crush', 6: 'ghost', 7: 'plant', 8: 'boss', 9: 'fish', 10: 'fish', 11: 'mine', 12: 'whale', 13: 'jelly', 14: 'clam', 15: 'swoop', 16: 'flock', 17: 'balloon', 18: 'shooter', 19: 'bird', 20: 'spark' }[e.t] || 'blob', e.x + e.w / 2, e.y + e.h / 2, d); }
  var c0 = Math.floor(px / TS), r = Math.floor((p.y + p.h - 1) / TS);
  for (var c = c0; c < Math.min(L.w, c0 + 14); c++) {
    d = c * TS + 8 - px;
    var t = PF.tileAt(st, c, r);
    if (t === PF.T.SPIKE) { cons('spike', c * TS + 8, r * TS + 8, d); break; }
    var fl = false; for (var rr = r + 1; rr < (L.rows || PF.ROWS); rr++) { var tt = PF.tileAt(st, c, rr); if (PF.SOL[tt] || tt === 14) { fl = true; break; } }
    if (!fl) { var onm = false; for (var m = 0; m < L.movers.length; m++) { var mm = L.movers[m]; if (Math.abs(mm.cx - (c * TS + 8)) < mm.amp + 40 && Math.abs(mm.y - (p.y + p.h)) < 60) onm = true; } cons(onm ? 'mover' : 'pit', c * TS + 8, (r + 1) * TS, d); break; }
    var th = PF.tileAt(st, c, r); if (c > c0 && PF.SOL[th]) { cons('wall', c * TS + 8, r * TS + 8, d); break; }
  }
  return best;
}
var MSG = {
  stomp: ['앞의 적을 밟을 수 있어요: 위에서 점프로 내려찍으세요', 'Stomp the enemy ahead: land on top of it'],
  blob: ['앞의 삼각 크롤러를 점프로 밟거나 넘어가세요', 'Jump on (or over) the crawler ahead'],
  flyer: ['날아다니는 연이 있어요: 아래로 지나가거나 위에서 밟으세요', 'A kite ahead: pass under its path or stomp it from above'],
  spiky: ['별 지뢰는 밟으면 안 돼요! 점프로 넘어가세요', 'Do not stomp the star mine - jump over it'],
  spike: ['바닥 가시: 점프로 넘어가세요', 'Floor spikes: jump over them'],
  pit: ['구덩이: 달리기(Shift/X)를 누르고 점프를 길게 눌러 건너세요', 'Pit ahead: hold Run and keep Jump pressed to clear it'],
  mover: ['움직이는 발판: 가까이 올 때 올라타세요', 'Moving platform: hop on when it comes close'],
  wall: ['벽/턱: 점프를 길게 눌러 올라가세요', 'Ledge ahead: hold Jump to climb onto it'],
  beetle: ['큐브벌레를 밟으면 큐브가 돼요: 차거나 들어서 던질 수 있어요', 'Stomp the cube-bug: the cube can be kicked (or carried with Run)'],
  bullet: ['발사체가 날아와요: 점프로 넘거나 위에서 밟으세요', 'A dart is coming: jump over it or stomp it'],
  crush: ['모노리스: 달리기를 누르고 재빨리 아래를 지나가세요', 'Monolith: hold Run and dash under it before it drops'],
  ghost: ['위습은 바라보면 멈춰요: 계속 움직이세요', 'The wisp freezes when you face it: keep moving'],
  plant: ['포자 싹이 내려갔을 때 점프로 넘어가세요', 'Jump over the spore bud while it is down'],
  boss: ['보스! 위에서 세 번 밟으세요 (탄을 피하세요)', 'Boss! Stomp it from above three times (dodge its shots)'],
  fish: ['물고기를 위에서 밟거나 헤엄쳐 피하세요', 'Stomp the swimmer from above or swim around it'],
  mine: ['떠다니는 기뢰: 절대 닿지 말고 돌아가세요', 'Floating mine: never touch it, swim around'],
  whale: ['큰 고래는 입만 위험해요: 머리 앞을 피해 지나가세요', 'The big glider is only dangerous at its mouth: avoid its head'],
  jelly: ['해파리의 갓과 촉수를 피하세요', 'Keep away from the jelly bell and its tentacle'],
  clam: ['조개가 열렸을 때 진주를 먹고, 닫히면 피하세요', 'Grab the pearl while the clam is open, stay clear when it shuts'],
  swoop: ['급강하 새: 점프로 밟거나 계속 움직이세요', 'A swooper dives at you: stomp it or keep moving'],
  flock: ['작은 새 떼가 지나가요: 밟거나 사이로 피하세요', 'A flock passes: stomp a member or slip past'],
  balloon: ['가시 풍선: 닿지 않게 돌아가세요', 'Spiky balloon: steer around it'],
  shooter: ['떠 있는 포대: 탄을 피하거나 위에서 밟으세요', 'Floating turret: dodge its shots or stomp it'],
  bird: ['새를 밟으면 보물을 떨어뜨려요', 'Stomp the bird to drop its treasure'],
  spark: ['레일 위의 스파크: 타이밍을 맞춰 지나가세요', 'Spark orb on a rail: time your pass'],
  swim: ['물속: 점프를 누르면 위로, 떼면 가라앉아요', 'In water: hold Jump to swim up, release to sink'],
  air: ['숨이 부족해요! 공기 방울을 먹거나 물 밖으로 나가세요', 'Low on air! Grab an air bubble or leave the water'],
  wind: ['바람 구역: 점프 중 밀려요, 방향을 보정하세요', 'Wind zone: it pushes you in the air, steer against it'],
  rkey: ['열쇠를 가져오세요 (문과 같은 색)', 'Fetch the key (same colour as the door)'],
  rdoor: ['열쇠를 들고 같은 색 문으로 가세요', 'Take the key to the door of the same colour'],
  rsw: ['바닥 스위치를 밟으세요', 'Step on the switch pad'],
  rtele: ['빛나는 패드를 밟으면 순간이동해요', 'Step on the glowing pad to teleport'],
  rxge: ['열린 통로로 계속 가세요', 'Go on through the opening'],
  wait: ['잠깐 기다리세요', 'Wait a moment here'],
  go: ['오른쪽으로 계속 가세요', 'Keep going right'],
  jump: ['지금 점프하세요', 'Jump now']
};
function makeHint(st, pl) {
  var best = pl.search(st, 0), traj = [], c = best.cand;
  var r = evaluate(st, c, traj), hz = nearestHazard(st), key = 'go', jumpAt = c.h > 0 ? c.s : -1;
  if (jumpAt >= 0 && jumpAt <= 22) key = hz ? (hz.kind === 'blob' ? 'blob' : hz.kind) : 'jump';
  else if (jumpAt < 0 && (c.a === N || (c.s > 0 && c.b === N)) && st.p.ground) key = 'wait';
  else if (hz && hz.dx < 120 && (hz.kind === 'pit' || hz.kind === 'mover')) key = 'wait';
  if (key === 'go' && hz && hz.dx < 170 && ['crush', 'ghost', 'boss', 'plant', 'bullet', 'beetle', 'spiky', 'spike', 'fish', 'mine', 'whale', 'jelly', 'clam', 'swoop', 'flock', 'balloon', 'shooter', 'bird', 'spark'].indexOf(hz.kind) >= 0) key = hz.kind;
  var pp = st.p, pcx = pp.x + pp.w / 2, inWater = PF.isW(PF.tileAt(st, Math.floor(pcx / PF.TS), Math.floor((pp.y + pp.h / 2) / PF.TS)));
  if (key === 'go' || key === 'wait') { if (pp.air < 330 && inWater) key = 'air'; else if (inWater) key = 'swim'; else if (st.L.winds) for (var wi = 0; wi < st.L.winds.length; wi++) { var wz = st.L.winds[wi]; if (pcx > wz.x0 - 40 && pcx < wz.x1 + 40 && pp.y > wz.y0 - 40 && pp.y < wz.y1 + 40) { key = 'wind'; break; } } }
  var way = null;
  if (st.L.puzzle && st.L.route) { var rg = st.L.route[st.stage]; if (rg) { way = { x: rg.x, y: rg.y === null ? st.p.y : rg.y }; if (key === 'go' || key === 'jump' || key === 'wait') key = 'r' + rg.k; } }
  var land = null; if (r.land >= 0 && traj[r.land]) land = traj[r.land];
  
  var extra = (c.a & IN.RUN) || (c.b & IN.RUN) ? [' (달리기 유지)', ' (hold Run)'] : ['', ''];
  var m = MSG[key];
  return { key: key, ko: m[0] + (key === 'go' ? extra[0] : ''), en: m[1] + (key === 'go' ? extra[1] : ''), traj: traj, land: land, haz: hz, way: way, jumpIn: jumpAt, sc: best.sc };
}
root.PFPlanner = { make: makePlanner, hint: makeHint, CANDS: CANDS, LEFT_EXTRA: LEFT_EXTRA, H: H, evaluate: evaluate, inputAt: inputAt };
})(typeof window !== 'undefined' ? window : globalThis);
