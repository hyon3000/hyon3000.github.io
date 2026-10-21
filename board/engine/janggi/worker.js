// Janggi search worker: iterative-deepening alpha-beta (transposition table, killer / history ordering, quiescence on captures, check extension).
//   in : { id, rows, turn, moves: [int], ms, maxDepth, noise }      rows/turn = the start position (see janggi-core.js), moves = moves played since
//   out: { id, type: 'move', m, depth, nodes, eval, ms }
importScripts('../../janggi-core.js');
var J = self.Janggi, PASS = J.PASS, MATE = 30000, MAXPLY = 64;
var P = new J.Position();
var TTN = 1 << 20, ttK = new Int32Array(TTN), ttM = new Int16Array(TTN), ttS = new Int16Array(TTN), ttD = new Int8Array(TTN), ttF = new Int8Array(TTN);
var bufs = [], scs = [], killer = [], hist = new Int32Array(8192);
for (var i = 0; i < MAXPLY + 8; i++) { bufs.push(new Int32Array(256)); scs.push(new Int32Array(256)); killer.push([0, 0]); }
var nodes = 0, stopAt = 0, stopped = false;
var VAL = J.BASE;

function order(buf, sc, n, ttMove, ply) {
  var b = P.b;
  for (var i = 0; i < n; i++) {
    var m = buf[i], s;
    if (m === ttMove) s = 1e7;
    else {
      var v = b[m >> 7];
      if (v) s = 1e6 + VAL[v & 7] * 16 - VAL[b[m & 127] & 7] / 8 + ((v & 7) === 1 ? 1e5 : 0);
      else if (m === killer[ply][0]) s = 9e5;
      else if (m === killer[ply][1]) s = 8e5;
      else s = hist[(b[m & 127] << 7 | (m >> 7)) & 8191];
    }
    sc[i] = s;
  }
}
function pick(buf, sc, n, i) {
  var bi = i, bs = sc[i];
  for (var j = i + 1; j < n; j++) if (sc[j] > bs) { bs = sc[j]; bi = j; }
  if (bi !== i) { var t = buf[i]; buf[i] = buf[bi]; buf[bi] = t; t = sc[i]; sc[i] = sc[bi]; sc[bi] = t; }
  return buf[i];
}
function tick() { if ((++nodes & 2047) === 0 && Date.now() > stopAt) stopped = true; return stopped; }

function qsearch(alpha, beta, ply, qd) {
  if (tick()) return 0;
  var me = P.turn, chk = P.inCheck(me), best;
  if (chk && qd < 4) best = -MATE + ply;
  else {
    best = P.evalStm();
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
    chk = false;
  }
  if (ply >= MAXPLY) return P.evalStm();
  var buf = bufs[ply], sc = scs[ply], n = P.gen(buf, !chk), k;
  order(buf, sc, n, 0, ply);
  for (var i = 0; i < n; i++) {
    var m = pick(buf, sc, n, i);
    P.make(m);
    if (J.attacked(P.b, P.king[me], 3 - me)) { P.unmake(); continue; }
    var s = -qsearch(-beta, -alpha, ply + 1, qd + 1);
    P.unmake();
    if (stopped) return 0;
    if (s > best) { best = s; if (s > alpha) { alpha = s; if (s >= beta) break; } }
  }
  return best;
}

function search(depth, alpha, beta, ply, root) {
  if (tick()) return 0;
  if (ply > 0) {
    if (P.clock >= J.CLOCK_LIMIT) return 0;
    if (P.clock >= 4 && P.repCount() >= 2) return 0;
  }
  var me = P.turn, chk = P.inCheck(me);
  if (chk && ply < MAXPLY - 8) depth++;
  if (depth <= 0 || ply >= MAXPLY) return qsearch(alpha, beta, ply, 0);
  var a0 = alpha, idx = P.h1 & (TTN - 1), ttMove = 0;
  if (ttK[idx] === P.h2) {
    ttMove = ttM[idx];
    if (ttD[idx] >= depth && ply > 0) {
      var ts = ttS[idx], f = ttF[idx];
      if (ts > MATE - 200) ts -= ply; else if (ts < -MATE + 200) ts += ply;
      if (f === 0 || (f === 1 && ts >= beta) || (f === 2 && ts <= alpha)) return ts;
    }
  }
  var buf = bufs[ply], sc = scs[ply], n = P.gen(buf, false), legal = 0, best = -MATE - 1, bestM = 0, i;
  order(buf, sc, n, ttMove, ply);
  for (i = 0; i < n; i++) {
    var m = pick(buf, sc, n, i);
    P.make(m);
    if (J.attacked(P.b, P.king[me], 3 - me)) { P.unmake(); continue; }
    legal++;
    var s;
    if (legal === 1) s = -search(depth - 1, -beta, -alpha, ply + 1, false);
    else {
      s = -search(depth - 1, -alpha - 1, -alpha, ply + 1, false);
      if (s > alpha && s < beta && !stopped) s = -search(depth - 1, -beta, -alpha, ply + 1, false);
    }
    P.unmake();
    if (stopped) return 0;
    if (s > best) {
      best = s; bestM = m;
      if (s > alpha) {
        alpha = s;
        if (root) rootBest = m, rootScore = s;
        if (s >= beta) {
          if (!P.b[m >> 7]) { if (killer[ply][0] !== m) { killer[ply][1] = killer[ply][0]; killer[ply][0] = m; } hist[(P.b[m & 127] << 7 | (m >> 7)) & 8191] += depth * depth; }
          break;
        }
      }
    }
  }
  if (!legal) {
    if (chk) best = -MATE + ply;
    else if (P.n > 0 && P.stM[P.n - 1] === PASS) best = 0;                // two passes in a row
    else { P.make(PASS); best = -search(depth - 1, -beta, -alpha, ply + 1, false); P.unmake(); if (stopped) return 0; }
  }
  var fl = best >= beta ? 1 : (best > a0 ? 0 : 2), st = best;
  if (st > MATE - 200) st += ply; else if (st < -MATE + 200) st -= ply;
  ttK[idx] = P.h2; ttM[idx] = bestM; ttS[idx] = st; ttD[idx] = Math.min(depth, 100); ttF[idx] = fl;
  return best;
}
var rootBest = 0, rootScore = 0;

function think(req) {
  var t0 = Date.now();
  P.loadRows(req.rows, req.turn);
  for (var i = 0; i < req.moves.length; i++) P.make(req.moves[i]);
  ttK.fill(0); ttD.fill(0); hist.fill(0);
  for (i = 0; i < killer.length; i++) killer[i] = [0, 0];
  nodes = 0; stopped = false; stopAt = t0 + (req.ms || 1000);
  var legal = P.legalMoves(false);
  if (!legal.length) return { m: PASS, depth: 0, nodes: 0, eval: 0, ms: 0 };
  if (legal.length === 1) return { m: legal[0], depth: 0, nodes: 0, eval: 0, ms: 0 };
  var maxD = req.maxDepth || 99, noise = req.noise || 0, me = P.turn, bestM = legal[0], bestS = 0, depth = 0;
  if (noise > 0) {                                                       // easy level: fixed shallow depth, every root move scored, random noise added
    var d = Math.max(1, maxD), top = -1e9;
    stopAt = t0 + 1e9;
    for (i = 0; i < legal.length; i++) {
      P.make(legal[i]);
      var s = -search(d - 1, -MATE, MATE, 1, false) + (Math.random() * 2 - 1) * noise;
      P.unmake();
      if (s > top) { top = s; bestM = legal[i]; }
    }
    return { m: bestM, depth: d, nodes: nodes, eval: top, ms: Date.now() - t0 };
  }
  for (depth = 1; depth <= maxD; depth++) {
    rootBest = 0;
    var sc = search(depth, -MATE - 1, MATE + 1, 0, true);
    if (stopped) break;
    if (rootBest) { bestM = rootBest; bestS = sc; }
    if (Math.abs(bestS) > MATE - 100) break;                              // forced mate found
    if (Date.now() - t0 > (req.ms || 1000) * 0.55) break;                 // the next iteration would not finish
  }
  return { m: bestM, depth: depth - (stopped ? 1 : 0), nodes: nodes, eval: bestS, ms: Date.now() - t0 };
}

self.onmessage = function (e) {
  var q = e.data;
  if (q.type === 'init') { self.postMessage({ type: 'ready' }); return; }
  var r;
  try { r = think(q); } catch (err) { self.postMessage({ id: q.id, type: 'error', msg: String(err && err.message) }); return; }
  r.id = q.id; r.type = 'move';
  self.postMessage(r);
};
