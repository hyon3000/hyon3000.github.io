// Shape World - look-ahead planner used by Auto Play (F3) and Hint (F4).
// It clones the game's own deterministic simulation and tries input sequences made of the four keys a human has
// (left / right / run / jump). The best plan's first few frames are executed through the normal input path.
(function (root) {
'use strict';
var IN = PF.IN, N = 0, R = IN.R, RR = IN.R | IN.RUN, Lf = IN.L;
var IN_R = PF.IN.R, IN_L = PF.IN.L, H = 64, REPLAN = 8;
var CANDS = (function () {
  var c = [], dirs = [RR, R, N], s, a, b, h;
  [0, 8, 20, 40].forEach(function (s) { dirs.forEach(function (a) { dirs.forEach(function (b) { if (s === 0 && a !== b) return; c.push({ a: a, b: b, s: s, h: -1 }); }); }); });
  [0, 3, 6, 10, 15, 22, 30].forEach(function (s) { dirs.forEach(function (a) { dirs.forEach(function (b) { if (s === 0 && a !== RR && a !== R) return; [99, 12, 4].forEach(function (h) { c.push({ a: a, b: b, s: s, h: h }); }); }); }); });
  [8, 16].forEach(function (s) { [R, RR].forEach(function (b) { c.push({ a: Lf, b: b, s: s, h: -1 }); [99, 12].forEach(function (h) { c.push({ a: Lf, b: b, s: s, h: h }); }); }); });
  [0, 6, 12].forEach(function (s) { [R, RR].forEach(function (a) { [R, RR].forEach(function (b) { [18, 30].forEach(function (t) { [99, 12].forEach(function (h) { c.push({ a: a, b: b, s: s, h: h, t: t, c: N }); }); }); }); }); });
  [20, 40].forEach(function (l) { [12, 22, 32].forEach(function (s) { [99, 12].forEach(function (h) { c.push({ a: RR, b: RR, s: s, h: h, l: l }); }); }); c.push({ a: RR, b: RR, s: 30, h: -1, l: l }); });
  return c;
})();
var BOSS_EXTRA = (function () { var c = []; [RR, R, N, Lf].forEach(function (d) { for (var s = 1; s <= 40; s++) [99, 12].forEach(function (h) { c.push({ a: d, b: d, s: s, h: h }); }); });
  [RR, Lf | IN.RUN].forEach(function (a) { [4, 8, 14, 20].forEach(function (s) { [6, 12, 18, 24, 30, 38].forEach(function (w) { [99, 12].forEach(function (h) { c.push({ a: a, b: N, s: s, w: w, h: h }); }); }); }); });
  return c; })();
var LEFT_EXTRA = (function () { var c = []; var LL = Lf | IN.RUN; [Lf, LL].forEach(function (a) { [a, N].forEach(function (b) { [0, 4, 8, 12, 16, 20, 26, 32].forEach(function (s) { c.push({ a: a, b: b, s: s, h: -1 }); [99, 12].forEach(function (h) { c.push({ a: a, b: b, s: s, h: h }); }); }); }); }); return c; })();
function bossNear(st) { if (st.boss <= 0) return false; for (var i = 0; i < st.en.length; i++) { var e = st.en[i]; if (e.t === 8 && e.alive && Math.abs(e.x - st.p.x) < 260) return true; } return false; }
function inputAt(c, k) { if (c.l) { if (k < c.l) return Lf; k -= c.l; } var m = k < c.s ? c.a : (c.t !== undefined && k >= c.s + c.t ? c.c : c.b); var s0 = c.s + (c.w || 0); if (c.h > 0 && k >= s0 && k < s0 + c.h) m |= IN.J; return m; }

function groundBelow(st) {
  var p = st.p, c0 = Math.floor(p.x / PF.TS), c1 = Math.floor((p.x + p.w - 1e-4) / PF.TS), r0 = Math.floor((p.y + p.h) / PF.TS);
  for (var c = c0; c <= c1; c++) for (var r = r0; r < (st.L.rows || PF.ROWS); r++) { var t = PF.tileAt(st, c, r); if (PF.SOL[t] || t === 12 || t === 13 || t === 9 || t === 7) return true; }
  var L = st.L; for (var i = 0; i < L.movers.length; i++) { var m = L.movers[i], mq = PF.movPos(st, i, st.f); if (p.x + p.w > mq.x - 20 && p.x < mq.x + m.w + 20 && p.y + p.h <= mq.y + 30) return true; }
  return false;
}
function evaluate(st0, c, traj) {
  var HH = st0.boss > 0 && bossNear(st0) ? 90 : H;
  st0.share = true; var st = PF.clone(st0); st0.share = false; var p = st.p, big0 = st0.p.big, k, sc, lastGround = p.ground, land = -1, jumped = false;
  for (k = 0; k < HH; k++) {
    PF.step(st, inputAt(c, k));
    if (traj && (k & 1) === 0) traj.push({ x: p.x + p.w / 2, y: p.y + p.h });
    if (traj && land < 0) { if (!p.ground) jumped = true; else if (jumped) land = traj.length - 1; }
    if (p.dead) return { sc: -1e5 + k * 30, dead: true, k: k };
    if (p.won) return { sc: 1e6 - k, won: true, k: k };
  }
  if (st0.L.puzzle && st0.L.crumbs && !(st0.boss > 0 && bossNear(st0))) { var cbs = st.L.crumbs, tg = cbs[Math.min(cbs.length - 1, st.cr + 1)], tg2 = cbs[Math.min(cbs.length - 1, st.cr + 2)]; sc = st.cr * 500 + (st.stage - st0.stage) * 3000 - (Math.abs(p.x + 6 - tg[0]) + 1.5 * Math.abs(p.y + 7 - tg[1])) * 2.5 - (Math.abs(p.x + 6 - tg2[0]) + 1.5 * Math.abs(p.y + 7 - tg2[1])) * 0.5 + (st.score - st0.score) * 0.1; if (!p.ground) sc -= 15; return { sc: sc, dead: false, land: land, k: k }; }
  var bi = -1, bd = 1e9; if (st0.boss > 0) { for (var q = 0; q < st0.en.length; q++) { var be = st0.en[q]; if (be.t === 8 && be.alive) { var dd = Math.abs(p.x - be.x); if (dd < bd) { bd = dd; bi = q; } } } }
  if (bi >= 0 && st0.en[bi].imm && st0.en[bi].immKind === 'shell') {   // armoured boss: pick up a shell, carry it at the boss and throw it while the boss stands on the ground
    var b1 = st.en[bi], b0 = st0.en[bi], bx = b1.x + b1.w / 2, hx1 = p.x + 6, nd = 1e9, rd = 1e9, wd = 1e9, q2;
    sc = (b0.hp - b1.hp) * 4000 + (st.score - st0.score) * 0.25; if (!b1.alive) sc += 6000;
    for (q2 = 0; q2 < st.en.length; q2++) { var se = st.en[q2]; if (!se.alive || se.t !== 3 || se.x < b1.mn - 40 || (se.carried && p.carry < 0)) continue; if (se.sh === 2 && Math.abs(se.vx || 0) > 1) rd = Math.min(rd, Math.abs(se.x + se.w / 2 - bx)); else if (se.sh === 1 && !se.carried) nd = Math.min(nd, Math.abs(se.x + se.w / 2 - hx1)); else if (se.sh === 0) wd = Math.min(wd, Math.abs(se.x + se.w / 2 - hx1)); }
    if (p.carry >= 0) sc += 300 - Math.abs(bx - hx1) * 0.8 + (p.face === (bx > hx1 ? 1 : -1) ? 40 : 0);
    else if (nd < 1e9) sc -= nd * 1.2 + (rd < 1e9 ? 0 : 60);
    else if (wd < 1e9) sc -= wd * 1.0 + 30;   // no shell yet: stomp a walking cube-bug to make one
    else sc -= Math.abs(bx - hx1) * 0.6;
    if (rd < 1e9) sc -= rd * 0.6;
  }
  else if (bi >= 0) { var b1 = st.en[bi], b0 = st0.en[bi]; sc = -Math.abs(p.x + 6 - (b1.x + b1.w / 2)) * 3 + (b0.hp - b1.hp) * 900 + (st.score - st0.score) * 0.25; if (!b1.alive) sc += 3000; }
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
  function predict(st, script) { st.share = true; var q = PF.clone(st); st.share = false; for (var k = 0; k < script.length; k++) PF.step(q, script[k]); return q; }
  function same(a, b) { return Math.abs(a.p.x - b.p.x) < 0.01 && Math.abs(a.p.y - b.p.y) < 0.01 && a.p.dead === b.p.dead && Math.abs(a.p.vx - b.p.vx) < 0.01 && Math.abs(a.p.vy - b.p.vy) < 0.01; }
  pl.decide = function (st) {
    var p = st.p, t0 = now();
    if (p.x > pl.bestX + 4) { pl.bestX = p.x; pl.bestF = st.f; }
    if (!pl.script || pl.i >= pl.script.length) {
      var best = null;
      var hps = 0; if (st.boss > 0) for (var hi = 0; hi < st.en.length; hi++) if (st.en[hi].t === 8 && st.en[hi].alive) hps += st.en[hi].hp;
      if (hps !== pl.hps) { pl.hps = hps; pl.hpF = st.f; }
      if (st.boss > 0 && bossNear(st) && st.f - (pl.hpF || 0) > 240) { pl.bossNoise = 40; pl.hpF = st.f - 120; }   // fight stalemate (standing still while the boss circles): try something random for a while
      if (pl.bossNoise > 0) pl.next = null;
      if (pl.next && pl.next.pred && same(pl.next.pred, st)) { var ps = pl.next.ps; best = ps.done || work(ps, ps.list.length); }
      else {
        if (st.f - pl.bestF > 300) { pl.explore = 40; pl.bestF = st.f - 100; }
        best = pl.search(st, pl.bossNoise > 0 ? 400 : (pl.explore > 0 ? 25 : 0)); if (pl.bossNoise > 0) pl.bossNoise -= SL; if (pl.explore > 0) pl.explore -= SL; pl.stats.sync++; }
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

// ---- navigator: the generator's own route search (PF.searchStage, a best-first search over jump/walk macros on the real simulation, enemies included)
// plans each route stage (key, door, teleport, switch, exit ...) from the live state; the look-ahead planner only drives while airborne or when no plan is found
// the plan may only end where the hero can stand still afterwards (an 'at' waypoint reached while sliding into a spike is a dead end)
function settles(s) { var q = PF.clone(s); for (var k = 0; k < 24; k++) { PF.step(q, 0); if (q.p.dead) return false; } return q.p.ground; }

// armoured boss (only kicked shells hurt it): stomp a beetle, stand LEFT of the shell and walk into it so it rolls at the boss; the look-ahead planner dodges when the boss is close
function best0(st, boss) { for (var i = 0; i < st.en.length; i++) { var e = st.en[i]; if (e.alive && e.t === 3 && e.x >= boss.x - 520 && e.x <= boss.x + 200) return e; } return null; }
function shellBossMask(st, boss, fb) {   // + hop over ledges / cannons in the way
  return fb.decide(st);   // in the arena the look-ahead planner (shell-aware score) does the fight
  var m = shellBossMask0(st, boss, fb), p = st.p;
  if (p.ground && (m & (IN_R | IN_L))) { var dir = (m & IN_R) ? 1 : -1, c = Math.floor((dir > 0 ? p.x + p.w + 3 : p.x - 3) / PF.TS), r = Math.floor((p.y + p.h - 5) / PF.TS), t = PF.tileAt(st, c, r); if (PF.SOL[t] || t === 15 || t === 16) m |= PF.IN.J; }
  function react(q) { if (!q.p.ground) return 0; var hx = q.p.x + q.p.w / 2; for (var i = 0; i < q.en.length; i++) { var e = q.en[i]; if (e.alive && e.t === 3 && e.sh === 2 && Math.abs(e.vx || 0) > 1) { var rx = e.x + e.w / 2 - hx; if (Math.abs(rx) < 52 && (rx > 0) === (e.dir < 0)) return PF.IN.J; } } return 0; }
  function lives(mm) { st.share = true; var q = PF.clone(st); st.share = false; for (var k = 0; k < 70; k++) { PF.step(q, k < 10 ? mm : (k < 16 ? (mm & ~PF.IN.J) : react(q))); if (q.p.dead) return false; } return true; }
  if (!lives(m)) {   // the scripted approach would run into a beetle / the boss: take the first safe variant, else let the look-ahead planner dodge
    var alts = [m | PF.IN.J, m & ~(IN_R | IN_L), (m & ~(IN_R | IN_L)) | PF.IN.J, PF.IN.L | PF.IN.RUN, PF.IN.R | PF.IN.RUN, PF.IN.L | PF.IN.J, PF.IN.R | PF.IN.J], i;
    for (i = 0; i < alts.length; i++) if (lives(alts[i])) return alts[i];
    return fb.decide(st);
  }
  return m;
}
function shellBossMask0(st, boss, fb) {
  var IN = PF.IN, p = st.p, hx = p.x + p.w / 2, bd = boss.x + boss.w / 2 - hx, best = null, bs = 1e9, i, e, rolling = null;
  for (i = 0; i < st.en.length; i++) { e = st.en[i]; if (!e.alive || e.t !== 3 || e.x < boss.x - 520 || e.x > boss.x + 200) continue; if (e.sh === 2 && Math.abs(e.x - hx) < 240 && Math.abs(e.vx || 0) > 1) rolling = e; var d = Math.abs(e.x + e.w / 2 - hx) + (e.sh === 1 ? 0 : 30); if (d < bs) { bs = d; best = e; } }
  if (p.carry >= 0) {                                                                          // carrying a shell: walk at the boss, let go (Run released) once it stands within throwing range and we face it
    var cs = bd > 0 ? 1 : -1, CT = cs > 0 ? IN.R : IN.L;
    if (p.face === cs && Math.abs(bd) < 200 && Math.abs(bd) > 40 && boss.ground) return CT;
    return CT | IN.RUN;
  }
  if (Math.abs(bd) < 96 && p.ground) return fb.decide(st);                                  // boss next to us: dodge / jump over like the normal arena
  if (!best0(st, boss)) return fb.decide(st);
  if (rolling) {                                                                              // a shell is rolling: keep away from it, it can hurt us on the way back
    var rx = rolling.x + rolling.w / 2 - hx;
    if (Math.abs(rx) < 90 && (rx > 0) === (rolling.dir < 0)) return p.ground ? IN.J : 0;   // it is faster than us: hop straight up and let it run under
    return 0;
  }
  if (!best) return fb.decide(st);
  var sx = best.x + best.w / 2, dx = sx - hx;
  if (best.sh === 1) return (dx > 0 ? IN.R : IN.L) | IN.RUN;                                // an idle shell: walk into it holding Run = pick it up
  if (Math.abs(dx) > 26) return (dx > 0 ? IN.R : IN.L) | IN.RUN;                              // a walking beetle: close in and stomp
  if (p.ground && Math.abs(dx) < 22) return IN.J | (dx > 0 ? IN.R : IN.L);
  return dx > 0 ? IN.R : IN.L;
}
function makeNavigator() {
  var fb = makePlanner(), nv = { fb: fb, seq: null, i: 0, stage: -1, wait: 0, st: { plans: 0, fails: 0, ms: 0 } };
  nv.reset = function () { fb.reset(); nv.planBad = false; nv.job = null; nv.busy = false; nv.seq = null; nv.i = 0; nv.stage = -1; nv.wait = 0; };
  // decide(st, budgetMs): with a budget the search is spread over several calls and null is returned while it is still thinking (the game does not step then)
  nv.job = null; nv.busy = false;
  nv.decide = function (st, budgetMs) {
    var L = st.L;
    // the generator's own plan (trajectory-first stages): follow the recorded inputs while the hero is exactly where the plan expects him; otherwise the normal search takes over
    if (L.plan && !nv.planBad && st.f < L.plan.length) {
      var ex = L.planPos[st.f];
      if (ex && Math.abs(ex[0] - st.p.x) < 0.6 && Math.abs(ex[1] - st.p.y) < 0.6) return L.plan[st.f];
      nv.planBad = true;
    }
    if (st.boss > 0 && st.p.mini) for (var mi = 0; mi < st.it.length; mi++) { var mu = st.it[mi]; if (mu.alive && mu.k === 0 && mu.x > st.p.x - 90 && mu.x < st.p.x + 110 && Math.abs(mu.y - st.p.y) < 24 && st.p.ground) { nv.seq = null; nv.job = null; var mdx = mu.x + 6 - (st.p.x + st.p.w / 2); if (Math.abs(mdx) < 2) return 0; var mdir = mdx > 0 ? PF.IN.R : PF.IN.L, mc = Math.floor((mdx > 0 ? st.p.x + st.p.w + 2 : st.p.x - 2) / PF.TS), mr = Math.floor((st.p.y + st.p.h - 4) / PF.TS), mt = PF.tileAt(st, mc, mr); return mdir | (PF.SOL[mt] || PF.tileAt(st, mc, mr - 1) === 0 && PF.SOL[PF.tileAt(st, mc, mr + 1)] && false ? PF.IN.J : 0) | (Math.abs(mdx) > 24 ? PF.IN.RUN : 0); } }   // a shrunken hero must grow back before an arena fight: the mushroom at the entrance
    if (!L.route || !PF.searchIter) return fb.decide(st);
    var shellBoss = null;
    if (st.boss > 0) for (var bi = 0; bi < st.en.length; bi++) { var be = st.en[bi]; if (be.t === 8 && be.alive && be.imm && be.immKind === 'shell' && (L.arena ? st.p.x >= L.arena.c0 * PF.TS - 30 : be.x - st.p.x < 340) && st.p.x - be.x < 300) shellBoss = be; }
    nv.sb = !!shellBoss;   // armoured boss: from the arena entrance on
    if (shellBoss) return shellBossMask(st, shellBoss, fb);   // armoured boss: only kicked shells hurt it
    if (st.boss > 0 && (bossNear(st) || nv.job === null && L.kind === 'bossrush')) { nv.seq = null; nv.job = null; return fb.decide(st); }   // boss arenas: the reactive look-ahead planner dodges and stomps   // boss arenas: the reactive look-ahead planner dodges and stomps
    if (nv.seq && nv.i < nv.seq.length && nv.stage === st.stage) return nv.seq[nv.i++];
    nv.seq = null;
    if (!nv.job) {
      if (nv.wait > 0 || !st.p.ground) { if (nv.wait > 0) nv.wait--; return fb.decide(st); }
      var g = L.route[Math.min(st.stage, L.route.length - 1)]; if (g.k === 'goal' && L.arena && st.boss > 0 && st.p.x < L.arena.c0 * PF.TS - 40) g = { k: 'xge', x: L.arena.c0 * PF.TS - 24, y: g.y, door: 1 };   // long castle: first reach the arena door, the fight itself is the reactive planner's job
      var tx = g.x === undefined ? L.goalX : g.x, ty = g.y === undefined ? null : g.y;
      var strict = function (s) { return PF.stageDone(s, g) && !(s.p.pois > 0) && (g.k === 'goal' || g.door || settles(s)); }, loose = function (s) { return PF.stageDone(s, g) && !(s.p.pois > 0); };
      var c2 = PF.clone(st); c2.en = []; c2.noEn = true;
      // tiers: with enemies and a safe stop, with a smaller budget, without the safe stop; last resort: as if the enemies were not there (a hit beats standing still)
      var tiers = [[PF.clone(st), strict, 3000], [PF.clone(st), strict, 8000], [PF.clone(st), loose, 3000], [c2, strict, 4000]];
      if (L.route.length <= 2) tiers = [[PF.clone(st), strict, 1500]];   // plain run-to-the-flag stage: if the search is not quick, the reactive planner drives for a while
      nv.job = { stage: st.stage, ti: 0, it: null, tiers: tiers, tx: tx, ty: ty, plain: L.route.length <= 2 };
    }
    var jb = nv.job, t0 = Date.now(), res;
    for (;;) {
      if (!jb.it) { var tr = jb.tiers[jb.ti]; jb.it = PF.searchIter(tr[0], tr[1], jb.tx, jb.ty, tr[2]); }
      res = jb.it.run(budgetMs ? 60 : 1e9);
      if (res === undefined) { if (budgetMs && Date.now() - t0 >= budgetMs) { nv.busy = true; nv.st.ms += Date.now() - t0; return null; } continue; }
      if (res || ++jb.ti >= jb.tiers.length) break;
      jb.it = null;
    }
    nv.st.ms += Date.now() - t0; nv.busy = false; nv.job = null;
    if (res && res.seq.length) { nv.st.plans++; nv.seq = res.seq; nv.i = 0; nv.stage = st.stage; return nv.seq[nv.i++]; }
    if (jb.plain) { nv.st.fails++; nv.wait = 60; return fb.decide(st); }
    nv.st.fails++; nv.fl = (nv.fl || 0) + 1; if (nv.fl % 3 !== 0) { nv.seq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; nv.i = 0; nv.stage = st.stage; return 0; }   // brake and search again from a standing start; every third failure lets the look-ahead planner move
    nv.wait = 30; return fb.decide(st);
  };
  return nv;
}
root.PFPlanner = { make: makeNavigator, plain: makePlanner, hint: makeHint, CANDS: CANDS, LEFT_EXTRA: LEFT_EXTRA, H: H, evaluate: evaluate, inputAt: inputAt };
})(typeof window !== 'undefined' ? window : globalThis);
