// Polycube (3D) / Polytesseract (4D) AI — afterstate value network evaluated in plain JS.
//
// Trained offline (ndrl/train_nd.py, recurrent afterstate Double-DQN on ndrl/sim_nd.cpp, an exact port of the game rules that is
// lock-step verified against the real app.js). The game script (app.js) calls PolyND.attach({...}) with its own functions, and this
// module then plays the real game: for every piece it enumerates plans [hold] + rotations + moves + hard drop by REALLY executing
// them on a saved copy of the game (the game's own move/rotate/stick/removeline code), turns each resulting state into the feature
// vector the net was trained on (must match fillFeatures() in sim_nd.cpp), picks argmax(r + gamma * V(afterstate | memory)) and presses
// the keys one input per 200 ms while gravity keeps running. Memory (GRU) and item handling are learned, not hand made.
// Human-visible information only: while the board is hidden (blind item) it plans on its own predicted board, and hidden next/hold
// pieces are not inputs.
(function (root) {
  'use strict';
  var GAP = 200, SD = 40, KIDS = 48, NTS = 44, NLAY = 10, NSCAL = 24, GAMMA = 0.997, DEATH_R = -10;
  var ITEM_CODES = [1, 2, 4, 5, 6, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 22, 30, 31, 32, 91, 102, 103, 104, 105, 106, 116, 117, 118, 119,
    120, 121, 122, 123, 124, 125, 126, 127, 200, 204];
  var slotOf = new Int16Array(512).fill(-1), groupOf = new Int16Array(512).fill(-1);
  ITEM_CODES.forEach(function (c, i) { slotOf[c] = i; });
  [[[120, 121, 122, 123, 127, 17], 0], [[117, 125], 1], [[11], 2], [[19, 200, 18], 3], [[8, 9, 10, 91, 16, 2, 6], 4], [[21, 22, 104], 5],
    [[116, 124], 6], [[118, 126, 105, 106, 102, 1], 7], [[119, 5], 8], [[20], 9], [[4, 204], 10], [[30, 31], 11]].forEach(function (g) {
    g[0].forEach(function (c) { groupOf[c] = g[1]; });
  });

  var A = null, S = null, DIM = 3, NW = 1, NP = 343, NB = 1274, NCOL = 49, NPOS = 3, NF = 0, NDEF = 2, PDESC = 5, ROT_DEPTH = 4, MAXNODES = 120, PRUNE_K = 0, CAP = 1536;
  var PX, PY, PZ, PW;
  var ID_NEXT = NTS * 26, ID_HOLD = NTS * 26 + NTS;

  function bidx(x, y, z, w) { return ((x * 7 + y) * 26 + z) * NW + w; }
  function pidx(x, y, z, w) { return ((x * 7 + y) * 7 + z) * NW + w; }

  // ------------------------------------------------------------------ flat <-> nested
  function flatB(blk, out) {
    out = out || new Int16Array(NB); var i = 0, x, y, z, w;
    if (DIM === 3) { for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) { var c = blk[x][y]; for (z = 0; z < 26; z++) out[i++] = c[z]; } }
    else { for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) for (z = 0; z < 26; z++) { var c4 = blk[x][y][z]; for (w = 0; w < 7; w++) out[i++] = c4[w]; } }
    return out;
  }
  function unflatB(flat, blk) {
    var i = 0, x, y, z, w;
    if (DIM === 3) { for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) { var c = blk[x][y]; for (z = 0; z < 26; z++) c[z] = flat[i++]; } }
    else { for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) for (z = 0; z < 26; z++) { var c4 = blk[x][y][z]; for (w = 0; w < 7; w++) c4[w] = flat[i++]; } }
  }
  function flatP(p, out) {
    out = out || new Int16Array(NP); var i = 0, x, y, z, w;
    if (DIM === 3) { for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) { var c = p[x][y]; for (z = 0; z < 7; z++) out[i++] = c[z]; } }
    else { for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) for (z = 0; z < 7; z++) { var c4 = p[x][y][z]; for (w = 0; w < 7; w++) out[i++] = c4[w]; } }
    return out;
  }
  function unflatP(flat, p) {
    var i = 0, x, y, z, w;
    if (DIM === 3) { for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) { var c = p[x][y]; for (z = 0; z < 7; z++) c[z] = flat[i++]; } }
    else { for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) for (z = 0; z < 7; z++) { var c4 = p[x][y][z]; for (w = 0; w < 7; w++) c4[w] = flat[i++]; } }
  }

  var SCALARS = ['nowhb', 'nexthb', 'holdhb', 'score', 'lines', 'level', 'asc', 'gt', 'ht', 'monoonly', 'spinlock', 'hideblock', 'hidenext', 'score2x',
    'speedup', 'speeddown', 'holdlock', 'blindboard', 'bombnext', 'compactPending', 'simplify2', 'pentaForce', 'reinforce', '_rfUpgrade', 'timestamp', 'vkspace2'];
  function slotIdx(arr) { return arr === S.b[0] ? 0 : (arr === S.b[1] ? 1 : 2); }
  var SLOTS = [0, 1, 3];
  function snap() {
    var sc = new Array(SCALARS.length);
    for (var i = 0; i < SCALARS.length; i++) sc[i] = S[SCALARS[i]];
    return { blk: flatB(S.blk), p: [flatP(S.b[0]), flatP(S.b[1]), flatP(S.b[3])], ni: slotIdx(S.nowblock), xi: slotIdx(S.nextblock), hi: slotIdx(S.holdblock),
      raw: flatP(S.rawblock[56]), bp: S.blockpos.slice(), sc: sc, seq: root.__pieceSeq,
      bs: A.battleSnap ? A.battleSnap() : null, slots: (root.PolyBattle && root.PolyBattle.on) ? root.PolyBattle.slots.slice() : null };    // battle mode: item queue + pending effects belong to the state
  }
  function restore(sn) {
    unflatB(sn.blk, S.blk);
    for (var k = 0; k < 3; k++) unflatP(sn.p[k], S.b[SLOTS[k]]);
    S.nowblock = S.b[SLOTS[sn.ni]]; S.nextblock = S.b[SLOTS[sn.xi]]; S.holdblock = S.b[SLOTS[sn.hi]];
    unflatP(sn.raw, S.rawblock[56]);
    for (var i = 0; i < 4 && i < sn.bp.length; i++) S.blockpos[i] = sn.bp[i];
    for (i = 0; i < SCALARS.length; i++) S[SCALARS[i]] = sn.sc[i];
    root.__pieceSeq = sn.seq; S._ovf = false;
    if (sn.bs && A.battleRestore) A.battleRestore(sn.bs);
    if (sn.slots) root.PolyBattle.slots = sn.slots.slice();
  }

  // ------------------------------------------------------------------ RNG
  function mulberry(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function trialSeed(seed0, dec) { return (((seed0 + Math.imul(dec, 0x9E3779B1)) >>> 0) ^ 0x9E3779B9) >>> 0; }

  // ------------------------------------------------------------------ event counters (app.js calls these while window.__ev is set)
  function newEv() { return { trig: new Array(12).fill(0), placed: new Array(12).fill(0), boom: 0, garb: 0, lines: 0, hold: 0 }; }
  root.__evTrig = function (code) { var g = groupOf[code]; if (g >= 0 && code !== 30 && code !== 31) root.__ev.trig[g]++; };
  root.__evPlaced = function (piece) {
    var f = flatP(piece);
    for (var i = 0; i < NP; i++) if (f[i]) { var g = groupOf[f[i] & 255]; if (g >= 0) root.__ev.placed[g]++; }
  };

  // ------------------------------------------------------------------ piece shapes
  function com(b) {
    var s0 = 0, s1 = 0, s2 = 0, s3 = 0, n = 0;
    for (var i = 0; i < NP; i++) if (b[i]) { s0 += PX[i]; s1 += PY[i]; s2 += PZ[i]; s3 += PW[i]; n++; }
    return n ? [Math.floor(s0 / n + 0.5), Math.floor(s1 / n + 0.5), Math.floor(s2 / n + 0.5), Math.floor(s3 / n + 0.5)] : [3, 3, 3, 3];
  }
  function rotmap(pos, d, x, y, z, w) {
    var tx = x, ty = y, tz = z, tw = w;
    switch (pos) {
      case 0: if (d === 1) { tx = 6 - y; ty = x; } else if (d === 2) { tx = 6 - y; ty = 6 - x; } else { tx = y; ty = 6 - x; } break;
      case 1: if (d === 1) { ty = 6 - z; tz = y; } else if (d === 2) { ty = 6 - z; tz = 6 - y; } else { ty = z; tz = 6 - y; } break;
      case 2: if (d === 1) { tx = 6 - z; tz = x; } else if (d === 2) { tx = 6 - z; tz = 6 - x; } else { tx = z; tz = 6 - x; } break;
      case 3: if (d === 1) { tx = 6 - w; tw = x; } else if (d === 2) { tx = 6 - w; tw = 6 - x; } else { tx = w; tw = 6 - x; } break;
      case 4: if (d === 1) { ty = 6 - w; tw = y; } else if (d === 2) { ty = 6 - w; tw = 6 - y; } else { ty = w; tw = 6 - y; } break;
      default: if (d === 1) { tz = 6 - w; tw = z; } else if (d === 2) { tz = 6 - w; tw = 6 - z; } else { tz = w; tw = 6 - z; }
    }
    return [tx, ty, tz, tw];
  }
  function rotShape(src, pos, deg) {
    var d = deg & 3, c0 = com(src), dst = new Int16Array(NP), i, m;
    for (i = 0; i < NP; i++) { var v = src[i]; if (!v) continue; m = rotmap(pos, d, PX[i], PY[i], PZ[i], PW[i]); dst[pidx(m[0], m[1], m[2], m[3])] = v; }
    var c1 = com(dst), dd = [c0[0] - c1[0], c0[1] - c1[1], c0[2] - c1[2], DIM === 3 ? 0 : c0[3] - c1[3]];
    if (dd[0] || dd[1] || dd[2] || dd[3]) {
      var can = true;
      for (i = 0; i < NP && can; i++) {
        if (!dst[i]) continue;
        var tx = PX[i] + dd[0], ty = PY[i] + dd[1], tz = PZ[i] + dd[2], tw = PW[i] + dd[3];
        if (tx < 0 || tx >= 7 || ty < 0 || ty >= 7 || tz < 0 || tz >= 7 || tw < 0 || tw >= NW) can = false;
      }
      if (can) {
        var sc = new Int16Array(NP);
        for (i = 0; i < NP; i++) if (dst[i]) sc[pidx(PX[i] + dd[0], PY[i] + dd[1], PZ[i] + dd[2], PW[i] + dd[3])] = dst[i];
        dst = sc;
      }
    }
    return dst;
  }
  function bbox(p) {
    var lo = [9, 9, 9, 9], hi = [-1, -1, -1, -1];
    for (var i = 0; i < NP; i++) if (p[i]) {
      var c = [PX[i], PY[i], PZ[i], PW[i]];
      for (var d = 0; d < 4; d++) { if (c[d] < lo[d]) lo[d] = c[d]; if (c[d] > hi[d]) hi[d] = c[d]; }
    }
    return { lo: lo, hi: hi };
  }
  function shapeKey(p, lo) {
    var parts = [];
    for (var i = 0; i < NP; i++) if (p[i]) parts.push(pidx(PX[i] - lo[0], PY[i] - lo[1], PZ[i] - lo[2], PW[i] - lo[3]) + ':' + p[i]);
    return parts.join(',');
  }
  // orientations reachable by single-axis 90-degree rotations at the piece's position (free space), in BFS order, canonical-shape deduplicated
  function enumNodes(start, spin, bp0) {
    var bb = bbox(start), out = [{ p: start, seq: [], depth: 0, lo: bb.lo, hi: bb.hi }], keys = {};
    keys[shapeKey(start, bb.lo)] = 1;
    if (spin) return out;
    for (var qi = 0; qi < out.length; qi++) {
      if (out[qi].depth >= ROT_DEPTH) continue;
      for (var pos = 0; pos < NPOS; pos++) for (var dg = 0; dg < 2; dg++) {
        var np = rotShape(out[qi].p, pos, dg === 0 ? -1 : 1), b2 = bbox(np), k = shapeKey(np, b2.lo);
        if (keys[k]) continue;
        // the rotation has to fit inside the walls at the current position (always true at the spawn position)
        if (b2.lo[0] + bp0[0] < 0 || b2.hi[0] + bp0[0] > 6 || b2.lo[1] + bp0[1] < 0 || b2.hi[1] + bp0[1] > 6 || (NW > 1 && (b2.lo[3] + bp0[3] < 0 || b2.hi[3] + bp0[3] > 6))) continue;
        keys[k] = 1;
        out.push({ p: np, seq: out[qi].seq.concat([pos * 2 + dg]), depth: out[qi].depth + 1, lo: b2.lo, hi: b2.hi });
        if (out.length >= MAXNODES) return out;
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ features (must equal fillFeatures in sim_nd.cpp)
  function pieceDesc(p, f, o, ids, st, idBase) {
    var n = 0, lo = [9, 9, 9, 9], hi = [-1, -1, -1, -1], i, d;
    for (i = 0; i < NP; i++) {
      if (!p[i]) continue;
      n++; var c = [PX[i], PY[i], PZ[i], PW[i]];
      for (d = 0; d < DIM; d++) { if (c[d] < lo[d]) lo[d] = c[d]; if (c[d] > hi[d]) hi[d] = c[d]; }
      var s = slotOf[p[i] & 255];
      if (s >= 0 && st.n < KIDS) ids[st.n++] = idBase + s;
    }
    f[o] = n / 20;
    var ex = []; for (d = 0; d < DIM; d++) ex.push(n ? (hi[d] - lo[d] + 1) / 7 : 0);
    ex.sort(function (a, b) { return a - b; });
    for (d = 0; d < DIM; d++) f[o + 1 + d] = ex[d];
    f[o + 1 + DIM] = n ? 1 : 0;
  }
  function boardStats(b) {
    var maxh = 0, holes = 0;
    for (var x = 0; x < 7; x++) for (var y = 0; y < 7; y++) for (var w = 0; w < NW; w++) {
      var top = -1, occ = 0;
      for (var z = 0; z < 26; z++) if (b[bidx(x, y, z, w)]) { top = z; occ++; }
      if (top + 1 > maxh) maxh = top + 1; holes += top + 1 - occ;
    }
    return { maxh: maxh, holes: holes };
  }
  function fillFeatures(b, nowP, holdP, blind) {
    var f = new Float32Array(NF), ids = new Int16Array(KIDS).fill(-1), st = { n: 0 };
    var hgt = new Int32Array(NCOL), holes = new Int32Array(NCOL), maxh = 0, totHoles = 0, ncell = 0, layCnt = new Int32Array(NLAY), x, y, z, w, i;
    for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) for (w = 0; w < NW; w++) {
      var col = (x * 7 + y) * NW + w, top = -1, occ = 0;
      for (z = 0; z < 26; z++) {
        var v = b[bidx(x, y, z, w)];
        if (v) { top = z; occ++; if (z < NLAY) layCnt[z]++; var s = slotOf[v & 255]; if (s >= 0 && st.n < KIDS - 8) ids[st.n++] = s * 26 + z; }
      }
      hgt[col] = top + 1; holes[col] = top + 1 - occ; if (top + 1 > maxh) maxh = top + 1; totHoles += holes[col]; ncell += occ;
    }
    for (i = 0; i < NCOL; i++) { f[i] = Math.min(hgt[i], 15) / 9; f[NCOL + i] = Math.min(holes[i], 15) / 9; }
    var o = 2 * NCOL;
    for (z = 0; z < NLAY; z++) f[o + z] = layCnt[z] / NCOL;
    o += NLAY;
    for (z = 0; z < NLAY; z++) {
      var k;
      if (DIM === 3) {
        var mx = 7, my = 7;
        for (x = 0; x < 7; x++) { k = 0; for (y = 0; y < 7; y++) if (b[bidx(x, y, z, 0)]) k++; mx = Math.min(mx, 7 - k); }
        for (y = 0; y < 7; y++) { k = 0; for (x = 0; x < 7; x++) if (b[bidx(x, y, z, 0)]) k++; my = Math.min(my, 7 - k); }
        f[o + z * 2] = mx / 7; f[o + z * 2 + 1] = my / 7;
      } else {
        var m1 = 7, m2 = 7, p1 = 49, p2 = 49;
        for (w = 0; w < 7; w++) {
          for (x = 0; x < 7; x++) { k = 0; for (y = 0; y < 7; y++) if (b[bidx(x, y, z, w)]) k++; m1 = Math.min(m1, 7 - k); }
          for (y = 0; y < 7; y++) { k = 0; for (x = 0; x < 7; x++) if (b[bidx(x, y, z, w)]) k++; m2 = Math.min(m2, 7 - k); }
        }
        for (y = 0; y < 7; y++) { k = 0; for (x = 0; x < 7; x++) for (w = 0; w < 7; w++) if (b[bidx(x, y, z, w)]) k++; p1 = Math.min(p1, 49 - k); }
        for (x = 0; x < 7; x++) { k = 0; for (y = 0; y < 7; y++) for (w = 0; w < 7; w++) if (b[bidx(x, y, z, w)]) k++; p2 = Math.min(p2, 49 - k); }
        f[o + z * 4] = m1 / 7; f[o + z * 4 + 1] = m2 / 7; f[o + z * 4 + 2] = p1 / 49; f[o + z * 4 + 3] = p2 / 49;
      }
    }
    o += NLAY * NDEF;
    var bump = 0;
    for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) for (w = 0; w < NW; w++) {
      var h0 = hgt[(x * 7 + y) * NW + w];
      if (x < 6) bump += Math.abs(h0 - hgt[((x + 1) * 7 + y) * NW + w]);
      if (y < 6) bump += Math.abs(h0 - hgt[(x * 7 + y + 1) * NW + w]);
      if (NW > 1 && w < 6) bump += Math.abs(h0 - hgt[(x * 7 + y) * NW + w + 1]);
    }
    f[o] = maxh / 10; f[o + 1] = totHoles / NCOL; f[o + 2] = bump / (NCOL * 2); f[o + 3] = ncell / (NCOL * 4); f[o + 4] = S.level / 16;
    f[o + 5] = S.speedup > 0 ? 1 : 0; f[o + 6] = S.speeddown > 0 ? 1 : 0; f[o + 8] = S.hideblock > 0 ? 1 : 0;
    f[o + 11] = S.spinlock > 0 ? 1 : 0; f[o + 13] = S.hidenext > 0 ? 1 : 0; f[o + 14] = blind ? 1 : 0;
    f[o + 22] = S.nowhb; f[o + 23] = S.holdhb;
    o += NSCAL;
    if (S.hidenext === 0) { pieceDesc(nowP, f, o, ids, st, ID_NEXT); pieceDesc(holdP, f, o + PDESC, ids, st, ID_HOLD); }
    return { f: f, ids: ids };
  }
  function summarize(ev, board, hide, maxh0, holes0, blindNow) {
    var s = new Float32Array(SD), g;
    s[0] = ev.lines / 4; s[1] = (ev.gain || 0) / 200; s[2] = ev.boom / 4; s[3] = ev.garb / 4; s[4] = ev.hold;
    for (g = 0; g < 12; g++) { s[5 + g] = ev.trig[g] / 3; s[17 + g] = ev.placed[g] / 3; }
    if (board) {
      var bs = boardStats(board);
      if (!hide) { s[29] = (bs.maxh - maxh0) / 3; s[30] = (bs.holes - holes0) / (Math.floor(NCOL / 2) + 5); }
      s[31] = blindNow ? 1 : 0; s[32] = S.hidenext > 0 ? 1 : 0; s[33] = S.speedup > 0 ? 1 : 0; s[34] = S.speeddown > 0 ? 1 : 0;
      s[35] = S.spinlock > 0 ? 1 : 0; s[36] = S.hideblock > 0 ? 1 : 0;
    }
    return s;
  }
  function fallInterval() {
    var fi = 6000 / (Math.min(S.level, 12) / 3 + 5);
    if (S.speedup > 0) fi *= S.reinforce > 0 ? 0.2 : 0.4;
    if (S.speeddown > 0) fi *= S.reinforce > 0 ? 5.0 : 2.5;
    return fi;
  }

  // hard drop of the Enter key without any game-over / restart handling; 0 placed, 1 dead, 2 the piece was destroyed in flight
  function hardDropTrial() {
    var hb = S.nowblock;
    while (!A.move(2, -1)) { if (S.nowblock !== hb) break; }
    if (S.nowblock !== hb) return 2;
    if (A.stickblock()) return 1;
    var l = A.removeline(); A.calculatescore(l);
    if (S._ovf) { S._ovf = false; return 1; }          // lines were added and the stack has no room: dead
    if (DIM === 4 && S.reinforce > 0 && l > 0) S.reinforce = Math.max(0, S.reinforce - l);
    return 0;
  }

  // what a player cannot see is removed from the state the agent plans on (see maskRoot in sim_nd.cpp)
  function maskRoot() {
    S.reinforce = 0; S.monoonly = 0; S.simplify2 = 0; S.pentaForce = 0; S.bombnext = 0; S.holdlock = 0; S.score2x = 0; S.compactPending = false;
    if (S.hideblock > 0) {
      var p = flatP(S.nowblock); for (var i = 0; i < NP; i++) if (p[i]) p[i] = 98;
      unflatP(p, S.nowblock); S.nowhb = 0;
    }
  }

  // ------------------------------------------------------------------ candidate enumeration (generator: yields between trials so the game keeps running)
  // ctx: {seed0, dec, bel (Int16Array | null: the board the agent believes in while the real one is hidden), now}
  function* enumerate(ctx) {
    var rootSnap = snap();
    if (ctx.bel) rootSnap.blk = ctx.bel;
    restore(rootSnap);
    var fi = fallInterval();            // the fall speed itself is visible to a player
    maskRoot();
    rootSnap = snap(); if (ctx.bel) rootSnap.blk = ctx.bel;
    var bs0 = boardStats(rootSnap.blk), maxh0 = bs0.maxh, holes0 = bs0.holes, bp0 = rootSnap.bp.slice();
    var spin = S.spinlock !== 0; bp0 = [bp0[0], bp0[1], bp0[2], bp0[3] || 0];
    var hmap = new Int32Array(NCOL), x, y, z, w;
    for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) for (w = 0; w < NW; w++) {
      var top = -1; for (z = 25; z >= 0; z--) if (rootSnap.blk[bidx(x, y, z, w)]) { top = z; break; }
      hmap[(x * 7 + y) * NW + w] = top + 1;
    }
    var bases = [rootSnap, null], nodes = [null, null], tups = [], order = 0;
    for (var hd = 0; hd < 2; hd++) {
      if (hd === 1) {
        if (ctx.holdBan) continue;
        restore(rootSnap); var nb = S.nowblock; A.tryHoldSwap();
        if (S.nowblock === nb) continue;
        bases[1] = snap();
      }
      nodes[hd] = enumNodes(bases[hd].p[bases[hd].ni], spin, bp0);
      for (var ni = 0; ni < nodes[hd].length; ni++) {
        var nd = nodes[hd][ni], cx = [], cy = [], cz = [], cw = [], nc = 0, i;
        for (i = 0; i < NP && nc < 64; i++) if (nd.p[i]) { cx.push(PX[i]); cy.push(PY[i]); cz.push(PZ[i]); cw.push(PW[i]); nc++; }
        for (var bw = -nd.lo[3]; bw <= (NW - 1) - nd.hi[3]; bw++) for (var bx = -nd.lo[0]; bx <= 6 - nd.hi[0]; bx++) for (var by = -nd.lo[1]; by <= 6 - nd.hi[1]; by++) {
          var nin = hd + nd.depth + Math.abs(bx - bp0[0]) + Math.abs(by - bp0[1]) + Math.abs(bw - bp0[3]) + 1;
          var fallen = Math.floor(GAP * (nin - 1) / fi);
          if (bp0[2] + nd.lo[2] - fallen < maxh0 + 1) continue;
          var t = { hd: hd, ni: ni, bx: bx, by: by, bw: bw, order: order++, H: 0 };
          if (PRUNE_K) {
            var zl = -100, c;
            for (c = 0; c < nc; c++) zl = Math.max(zl, hmap[((cx[c] + bx) * 7 + cy[c] + by) * NW + cw[c] + bw] - cz[c]);
            var zlow = {}, touched = [], sumz = 0, maxres = 0;
            for (c = 0; c < nc; c++) {
              var col = ((cx[c] + bx) * 7 + cy[c] + by) * NW + cw[c] + bw, zc = cz[c] + zl;
              sumz += zc; if (zc + 1 > maxres) maxres = zc + 1;
              if (zlow[col] === undefined) { touched.push(col); zlow[col] = zc; } else zlow[col] = Math.min(zlow[col], zc);
            }
            var hl = 0; for (c = 0; c < touched.length; c++) hl += zlow[touched[c]] - hmap[touched[c]];
            t.H = 40 * hl + 20 * maxres + Math.floor((10 * sumz) / Math.max(1, nc));
          }
          tups.push(t);
        }
      }
    }
    if (PRUNE_K && tups.length > PRUNE_K) {
      var idx = tups.map(function (_, q) { return q; });
      idx.sort(function (a, b) { return tups[a].H - tups[b].H || a - b; });
      idx = idx.slice(0, PRUNE_K).sort(function (a, b) { return a - b; });
      tups = idx.map(function (q) { return tups[q]; });
    }
    var cands = [], ts = trialSeed(ctx.seed0, ctx.dec), nowT = ctx.now;
    for (var q = 0; q < tups.length && cands.length < CAP; q++) {
      var tp = tups[q], nd2 = nodes[tp.hd][tp.ni];
      cands.push(trial(bases[tp.hd], nd2.p, [tp.bx, tp.by, bp0[2], tp.bw], { hd: tp.hd, seq: nd2.seq, dx: tp.bx - bp0[0], dy: tp.by - bp0[1], dw: tp.bw - bp0[3], bx: tp.bx, by: tp.by, bw: tp.bw },
        ts, nowT, maxh0, holes0, hd2n(tp, nd2, bp0)));
      if ((q & 7) === 7) yield;
    }
    if (!cands.length) {
      restore(rootSnap);
      cands.push(trial(rootSnap, rootSnap.p[rootSnap.ni], bp0, { hd: 0, seq: [], dx: 0, dy: 0, dw: 0, bx: bp0[0], by: bp0[1], bw: bp0[3] }, ts, nowT, maxh0, holes0, 1));
    }
    restore(rootSnap);
    return { cands: cands, bases: bases, rootSnap: rootSnap, maxh0: maxh0, holes0: holes0 };
  }
  function hd2n(tp, nd, bp0) { return tp.hd + nd.depth + Math.abs(tp.bx - bp0[0]) + Math.abs(tp.by - bp0[1]) + Math.abs(tp.bw - bp0[3]) + 1; }

  // run one candidate on a restored copy of `base`: the piece (orientation nodeP) at blockpos bp, hard drop, with the trial RNG stream
  function trial(base, nodeP, bp, plan, ts, nowT, maxh0, holes0, nin) {
    restore(base);
    unflatP(nodeP, S.nowblock);
    S.blockpos[0] = bp[0]; S.blockpos[1] = bp[1]; S.blockpos[2] = bp[2]; if (DIM === 4) S.blockpos[3] = bp[3];
    var prevRng = root.__rng, prevEv = root.__ev, ev = newEv();
    ev.hold = plan.hd; root.__rng = mulberry(ts); root.__ev = ev;
    var s0 = S.score, r = hardDropTrial();
    root.__rng = prevRng; root.__ev = prevEv;
    ev.gain = S.score - s0;
    var c = { plan: plan, nodeP: nodeP, dead: r === 1, lines: ev.lines, gain: ev.gain, feat: null, sum: null, board: null };
    if (c.dead) { c.feat = { f: new Float32Array(NF), ids: new Int16Array(KIDS).fill(-1) }; c.sum = new Float32Array(SD); }
    else {
      var b = flatB(S.blk), bl = S.blindboard > A.now() + GAP * nin;
      c.feat = fillFeatures(b, flatP(S.nowblock), flatP(S.holdblock), bl);
      c.sum = summarize(ev, b, false, maxh0, holes0, bl);
      c.board = b;
    }
    return c;
  }

  // ------------------------------------------------------------------ network (afterstate value with GRU memory)
  function b64Bytes(s) { var bin = root.atob(s), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u; }
  function b64ToF32(s) { return new Float32Array(b64Bytes(s).buffer); }
  function b64ToF16(s) {
    var u = b64Bytes(s), h = new Uint16Array(u.buffer), out = new Float32Array(h.length);
    for (var i = 0; i < h.length; i++) {
      var x = h[i], sgn = (x & 0x8000) ? -1 : 1, e = (x >> 10) & 31, m = x & 1023;
      out[i] = e === 0 ? sgn * m * 5.960464477539063e-8 : (e === 31 ? (m ? NaN : sgn * Infinity) : sgn * (1 + m / 1024) * Math.pow(2, e - 15));
    }
    return out;
  }
  var model = null;
  function loadModel(m) {
    var nin = m.dense.in, nout = m.dense.out, wd = b64ToF16(m.dense.w), wt = new Float32Array(nin * nout);
    for (var o = 0; o < nout; o++) for (var i = 0; i < nin; i++) wt[i * nout + o] = wd[o * nin + i];
    model = { vscale: m.vscale, rw: m.reward, vmax: m.reward.mode === 'survival' ? 400 : 1500, nin: nin, nout: nout, wt: wt, emb: b64ToF16(m.emb.w), b1: b64ToF32(m.b1),
      g: { in: m.gru.in, hid: m.gru.hid, w_ih: b64ToF32(m.gru.w_ih), w_hh: b64ToF32(m.gru.w_hh), b_ih: b64ToF32(m.gru.b_ih), b_hh: b64ToF32(m.gru.b_hh) },
      wm: b64ToF32(m.wm.w), wmIn: m.wm.in, ln: { w: b64ToF32(m.ln.w), b: b64ToF32(m.ln.b) },
      layers: m.layers.map(function (l) { return { nin: l.in, nout: l.out, w: b64ToF32(l.w), b: b64ToF32(l.b) }; }) };
    if (m.cdense) {          // the battle network: context (opponent window + my item queue) enters the plan values; item head = advantage of the item actions over waiting
      model.cd = { nin: m.cdense.in, w: b64ToF32(m.cdense.w), b: b64ToF32(m.cdense.b) };
      model.ih = m.ih.map(function (l) { return { nin: l.in, nout: l.out, w: b64ToF32(l.w), b: b64ToF32(l.b) }; });
    }
  }
  var ctxVec = null;      // cdense(context) of the current decision (added to every plan's encoding)
  function ctxDense(ctx) {
    var cd = model.cd, out = new Float32Array(model.nout), o, i;
    for (o = 0; o < model.nout; o++) { var s = cd.b[o], row = o * cd.nin; for (i = 0; i < cd.nin; i++) if (ctx[i] !== 0) s += cd.w[row + i] * ctx[i]; out[o] = s; }
    return out;
  }
  function lnRelu(h) {
    var nout = h.length, mean = 0, vr = 0, o;
    for (o = 0; o < nout; o++) mean += h[o];
    mean /= nout;
    for (o = 0; o < nout; o++) { var d = h[o] - mean; vr += d * d; }
    var inv = 1 / Math.sqrt(vr / nout + 1e-5);
    for (o = 0; o < nout; o++) { var y = (h[o] - mean) * inv * model.ln.w[o] + model.ln.b[o]; h[o] = y > 0 ? y : 0; }
    return h;
  }
  // item head: A(s, a) for the NA actions (0 = wait = 0): from the board features of the current state, the memory and the context
  function itemAdv(rootFeat, hc, cv) {
    var nout = model.nout, h = new Float32Array(nout), i, o;
    h.set(model.b1);
    for (i = 0; i < model.nin; i++) { var v = rootFeat[i]; if (v === 0) continue; var base = i * nout; for (o = 0; o < nout; o++) h[o] += v * model.wt[base + o]; }
    for (o = 0; o < nout; o++) { var s = h[o], row = o * model.wmIn; for (i = 0; i < model.wmIn; i++) s += model.wm[row + i] * hc[i]; h[o] = s + cv[o]; }
    h = lnRelu(h);
    var L = model.ih;
    for (var li = 0; li < L.length; li++) {
      var l = L[li], nh = new Float32Array(l.nout);
      for (o = 0; o < l.nout; o++) { var s3 = l.b[o], wo = o * l.nin; for (i = 0; i < l.nin; i++) s3 += h[i] * l.w[wo + i]; nh[o] = (li < L.length - 1 && s3 < 0) ? 0 : s3; }
      h = nh;
    }
    var out = new Float32Array(h.length); for (o = 0; o < h.length; o++) out[o] = (h[o] - h[0]) * model.vscale;
    return out;
  }
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
  function gruStep(h, x) {
    var g = model.g, hid = g.hid, nin = g.in, gi = new Float32Array(3 * hid), gh = new Float32Array(3 * hid), out = new Float32Array(hid), j, i;
    for (j = 0; j < 3 * hid; j++) {
      var s = g.b_ih[j], row = j * nin;
      for (i = 0; i < nin; i++) if (x[i] !== 0) s += g.w_ih[row + i] * (x[i] > 3 ? 3 : (x[i] < -3 ? -3 : x[i]));
      gi[j] = s;
      if (h) { var s2 = g.b_hh[j], row2 = j * hid; for (i = 0; i < hid; i++) s2 += g.w_hh[row2 + i] * h[i]; gh[j] = s2; } else gh[j] = g.b_hh[j];
    }
    for (j = 0; j < hid; j++) {
      var r = sigmoid(gi[j] + gh[j]), z = sigmoid(gi[hid + j] + gh[hid + j]), n = Math.tanh(gi[2 * hid + j] + r * gh[2 * hid + j]);
      out[j] = (1 - z) * n + (h ? z * h[j] : 0);
    }
    return out;
  }
  function forward(feat, hc) {
    var x = feat.f, ids = feat.ids, nout = model.nout, h = new Float32Array(nout), i, o;
    h.set(model.b1);
    for (i = 0; i < model.nin; i++) { var v = x[i]; if (v === 0) continue; var base = i * nout; for (o = 0; o < nout; o++) h[o] += v * model.wt[base + o]; }
    for (i = 0; i < ids.length; i++) { if (ids[i] < 0) break; var eb = ids[i] * nout; for (o = 0; o < nout; o++) h[o] += model.emb[eb + o]; }
    for (o = 0; o < nout; o++) { var s = h[o], row = o * model.wmIn; for (i = 0; i < model.wmIn; i++) s += model.wm[row + i] * hc[i]; h[o] = ctxVec ? s + ctxVec[o] : s; }
    var mean = 0, vr = 0;
    for (o = 0; o < nout; o++) mean += h[o];
    mean /= nout;
    for (o = 0; o < nout; o++) { var d = h[o] - mean; vr += d * d; }
    var inv = 1 / Math.sqrt(vr / nout + 1e-5);
    for (o = 0; o < nout; o++) { var y = (h[o] - mean) * inv * model.ln.w[o] + model.ln.b[o]; h[o] = y > 0 ? y : 0; }
    var L = model.layers;
    for (var li = 0; li < L.length; li++) {
      var l = L[li], nh = new Float32Array(l.nout);
      for (o = 0; o < l.nout; o++) { var s3 = l.b[o], wo = o * l.nin; for (i = 0; i < l.nin; i++) s3 += h[i] * l.w[wo + i]; nh[o] = (li < L.length - 1 && s3 < 0) ? 0 : s3; }
      h = nh;
    }
    var v2 = h[0] * model.vscale;
    return v2 < -20 ? -20 : (v2 > model.vmax ? model.vmax : v2);
  }
  function rewardOf(c) {
    if (c.dead) return model.rw.death === undefined ? DEATH_R : model.rw.death;
    var rw = model.rw;
    if (rw.mode === 'score') return (rw.base === undefined ? 1 : rw.base) + Math.min(Math.max(c.gain || 0, 0), rw.clip) / rw.div;
    return 1;
  }
  function* qValues(cands, hprev) {
    var anyAlive = cands.some(function (c) { return !c.dead; }), q = new Array(cands.length);
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      q[i] = c.dead ? (anyAlive ? -1e9 : DEATH_R) : rewardOf(c) + GAMMA * forward(c.feat, gruStep(hprev, c.sum));
      if ((i & 15) === 15) yield;
    }
    return q;
  }


  // ------------------------------------------------------------------ battle mode: when to use the front item, and on whom
  // State (must equal vec_bstate in sim_nd.cpp): [own board features][what I see of the opponent window][what I see of my own window][own item queue].
  var VIEWD = 32, QPOS = 4, QD = 1 + QPOS * NTS + NTS;
  function isSpecial(code) { return slotOf[code] >= 0 && code !== 32 && code !== 103 && code !== 98; }   // what a window shows as a special block
  // sanitised copy of the own game: cell classes 0 empty / 1 normal / 2 special (this is what the opponent sees of it)
  function classSnapshot(boardFlat) {
    var blk = new Uint8Array(NB), now = new Uint8Array(NP), i;
    for (i = 0; i < NB; i++) { var v = boardFlat[i]; blk[i] = v === 0 ? 0 : (isSpecial(v & 255) ? 2 : 1); }
    var p = flatP(S.nowblock); for (i = 0; i < NP; i++) { var u = p[i]; now[i] = u === 0 ? 0 : (isSpecial(u & 255) ? 2 : 1); }
    return { blk: blk, now: now, pos: [S.blockpos[0], S.blockpos[1], S.blockpos[2], S.blockpos[3] || 0] };
  }
  function viewFeat(sn, qn) {
    var out = new Float32Array(VIEWD), hgt = new Int32Array(NCOL), maxh = 0, holes = 0, nn = 0, ns = 0, layer = new Int32Array(NLAY), x, y, z, w, c;
    for (x = 0; x < 7; x++) for (y = 0; y < 7; y++) for (w = 0; w < NW; w++) {
      var col = (x * 7 + y) * NW + w, top = -1, occ = 0;
      for (z = 0; z < 26; z++) {
        var v = sn.blk[bidx(x, y, z, w)];
        if (v) { top = z; occ++; if (v === 2) ns++; else nn++; if (z < NLAY) layer[z]++; }
      }
      hgt[col] = top + 1; if (top + 1 > maxh) maxh = top + 1; holes += top + 1 - occ;
    }
    var sh = 0; for (c = 0; c < NCOL; c++) sh += hgt[c];
    out[0] = maxh / 10; out[1] = sh / NCOL / 10; out[2] = holes / (Math.floor(NCOL / 2) + 5); out[3] = nn / (NCOL * 4); out[4] = ns / 20; out[5] = qn / 10;
    for (c = 0; c < NCOL; c++) out[6 + Math.min(hgt[c], 9)] += 1 / NCOL;
    var s0 = 0, s1 = 0, s2 = 0, s3 = 0, np = 0;
    for (var k = 0; k < NP; k++) if (sn.now[k]) { s0 += PX[k] + sn.pos[0]; s1 += PY[k] + sn.pos[1]; s2 += PZ[k] + sn.pos[2]; s3 += PW[k] + sn.pos[3]; np++; }
    if (np) { out[17] = s0 / np / 6; out[18] = s1 / np / 6; out[19] = s2 / np / 25; out[20] = DIM === 4 ? s3 / np / 6 : 0; out[21] = np / 20; }
    for (z = 0; z < NLAY; z++) out[22 + z] = layer[z] / NCOL;
    return out;
  }
  function qFeat(slots) {
    var out = new Float32Array(QD); out[0] = slots.length / 10;
    for (var k = 0; k < slots.length && k < QPOS; k++) { var sk0 = slotOf[slots[k]]; if (sk0 >= 0) out[1 + k * NTS + sk0] = 1; }
    for (k = 0; k < slots.length; k++) { var sk = slotOf[slots[k]]; if (sk >= 0) out[1 + QPOS * NTS + sk] += 0.5; }
    return out;
  }
  // oppSnap: {blk, now, pos} as sent by the opponent, oppQn: how many items it holds
  function bstate(oppSnap, oppQn, slots, bel) {
    var live = snap(), f, mine;
    var blind = S.blindboard > A.now();
    try { maskRoot(); var b = (blind && bel) ? bel : flatB(S.blk); f = fillFeatures(b, flatP(S.nowblock), flatP(S.holdblock), blind).f; } finally { restore(live); }
    mine = classSnapshot((blind && bel) ? bel : flatB(S.blk));
    var x = new Float32Array(NF + 2 * VIEWD + QD);
    x.set(f, 0); x.set(viewFeat(oppSnap, oppQn), NF); x.set(viewFeat(mine, slots.length), NF + VIEWD); x.set(qFeat(slots), NF + 2 * VIEWD);
    return x;
  }
  var useModel = null;
  function loadUse(m) { useModel = m.layers.map(function (l) { return { nin: l.in, nout: l.out, w: b64ToF32(l.w), b: b64ToF32(l.b) }; }); }
  function useForward(x) {
    var h = x, L = useModel;
    for (var li = 0; li < L.length; li++) {
      var l = L[li], nh = new Float32Array(l.nout);
      for (var o = 0; o < l.nout; o++) { var s = l.b[o], wo = o * l.nin; for (var i = 0; i < l.nin; i++) s += h[i] * l.w[wo + i]; nh[o] = (li < L.length - 1 && s < 0) ? 0 : s; }
      h = nh;
    }
    return h;
  }
  // 0 wait / 1 front item on me / 2 front item on the opponent; null when there is no model or no state of the opponent yet
  // actions: 0 wait; 2k+1 / 2k+2 = take item k of the first QPOS (as a person would: touch the slots k times, then use the front item) and use it on me / throw it at the opponent
  function decideUse(oppSnap, oppQn, slots, bel) {
    if (!model || !model.ih || !slots.length || !oppSnap || !ai.h) return null;
    var x = bstate(oppSnap, oppQn, slots, bel), ctx = new Float32Array(VIEWD + QD);
    ctx.set(x.subarray(NF, NF + VIEWD), 0); ctx.set(x.subarray(NF + 2 * VIEWD), VIEWD);
    var q = itemAdv(x.subarray(0, NF), ai.h, ctxDense(ctx)), best = 0, PBh = root.PolyBattle;
    for (var a = 1; a < q.length; a++) {
      var k = (a - 1) >> 1, tg = 1 + ((a - 1) & 1);
      if (k >= slots.length || k >= QPOS) continue;
      if (PBh && PBh.forbidden && PBh.forbidden(slots[k]) === tg) continue;      // clearly helpful items are never given away, clearly harmful ones never used on myself
      if (q[a] > q[best]) best = a;
    }
    return best;
  }
  function battleUse() {                                 // called at the start of every decision, before the block is planned
    var PB = root.PolyBattle; if (!PB || !PB.on) return;
    var tn = root.performance.now();                      // like a person, it lets a new item sit in its slot for a moment before using anything
    if (PB.slots.length > (ai.nSeen || 0)) ai.frontT = tn;
    ai.nSeen = PB.slots.length;
    if (PB.slots.length && tn - ai.frontT < 1500) return;
    var os = PB.oppState && PB.oppState(), mode = os ? decideUse(os.snap, os.qn, PB.slots, ai.bel) : null;
    var us = ai.useStats || (ai.useStats = { net: 0, rule: 0, wait: 0, self: 0, opp: 0, picked: 0 });
    if (mode === null) { us.rule++; PB.aiUseSlots(); ai.nSeen = PB.slots.length; return; }       // no use-net: the old rule
    us.net++; if (mode === 0) us.wait++; else { if (mode > 2) us.picked++; if ((mode - 1) & 1) us.opp++; else us.self++; PB.useAt((mode - 1) >> 1, (mode - 1) & 1 ? 'opponent' : 'self'); ai.nSeen = PB.slots.length; }
  }

  // ------------------------------------------------------------------ the player
  var ai = { holdBan: false, aborted: false, on: false, loading: false, h: null, sa: null, dec: 0, seed0: 1, bel: null, plan: null, gen: null, lastAct: 0, root: null, hideNow: false, pre: null, stats: null, modelUrl: '', hud: null, msg: '' };
  var ROT_KEYS = ['KeyA', 'KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyF', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN'];
  function arrowFor(axis, sign) {
    var PI = 3.1415926535898, keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    for (var i = 0; i < 4; i++) {
      var ang = keys[i] === 'ArrowLeft' ? PI : keys[i] === 'ArrowRight' ? 0 : keys[i] === 'ArrowUp' ? PI / 2 : -PI / 2;
      var deg = ang - S.r1o; while (deg < -PI) deg += 2 * PI; while (deg > PI) deg -= 2 * PI;
      var a, sg;
      if (-3 * PI / 4 < deg && deg <= -PI / 4) { a = 1; sg = 1; } else if (-PI / 4 < deg && deg <= PI / 4) { a = 0; sg = 1; }
      else if (PI / 4 < deg && deg <= 3 * PI / 4) { a = 1; sg = -1; } else { a = 0; sg = -1; }
      if (a === axis && sg === sign) return keys[i];
    }
    return null;
  }
  function planKeys(p) {
    var ks = [], i, n;
    if (p.hd) ks.push('ShiftLeft');
    for (i = 0; i < p.seq.length; i++) ks.push(ROT_KEYS[p.seq[i]]);
    var spec = [[0, p.dx], [1, p.dy]];
    for (var s = 0; s < 2; s++) { n = Math.abs(spec[s][1]); for (i = 0; i < n; i++) ks.push({ axis: spec[s][0], sign: spec[s][1] > 0 ? 1 : -1 }); }
    n = Math.abs(p.dw); for (i = 0; i < n; i++) ks.push(p.dw > 0 ? 'Period' : 'Comma');
    ks.push('Enter');
    return ks;
  }
  function running() { return !!(S && S.ready && !S.startscreen && !S.goverflg); }

  // run a generator for up to `ms` (sync when ms = Infinity). The live game state is saved first and restored afterwards, because planning
  // trials overwrite it while the game itself keeps running between slices.
  function runSlice(gen, ms) {
    var live = snap(), t0 = root.performance.now(), r;
    var prevRng = root.__rng, prevEv = root.__ev, PB = root.PolyBattle;
    try {
      for (;;) { r = gen.next(); if (r.done) break; if (ms !== Infinity && root.performance.now() - t0 > ms) break; }
    } finally { restore(live); root.__rng = prevRng; root.__ev = prevEv; }
    return r;
  }

  function beginDecision() {
    if (model) ai.h = gruStep(ai.h, ai.sa || new Float32Array(SD));            // the memory absorbs what happened
    battleUse();                                         // battle mode: which stored item to use / throw now, if any?
    var live = null;
    ai.pre = { stats: boardStats(flatB(S.blk)), blind: S.blindboard > A.now(), now: A.now() };
    ctxVec = null;                                       // battle network: the plan values see the opponent window and my item queue (after the item decision)
    if (model && model.cd) {
      var PBc = root.PolyBattle, osc = PBc && PBc.on && PBc.oppState && PBc.oppState(), cx = new Float32Array(VIEWD + QD);
      if (osc && osc.snap) { cx.set(viewFeat(osc.snap, osc.qn), 0); cx.set(qFeat(PBc.slots), VIEWD); ctxVec = ctxDense(cx); }
    }
    ai.ctx = { seed0: ai.seed0, dec: ai.dec, bel: ai.pre.blind && ai.bel ? ai.bel : null, now: A.now(), holdBan: ai.holdBan };
    ai.seq0 = root.__pieceSeq;
    function* job() {
      var res = yield* enumerate(ai.ctx);
      if (ai.choose) return { res: res, q: res.cands.map(function () { return 0; }), bi: ai.choose(res.cands) };
      var q = yield* qValues(res.cands, ai.h);
      var bi = 0; for (var i = 1; i < q.length; i++) if (q[i] > q[bi]) bi = i;
      return { res: res, q: q, bi: bi };
    }
    ai.gen = job();
  }
  function finishDecision(out) {
    var c = out.res.cands[out.bi];
    ai.chosen = c; ai.lastQ = out.q[out.bi];
    ai.plan = { seq: ai.seq0, keys: planKeys(c.plan), i: 0, cand: c };
    ai.stats = out.res;
  }
  function pressNext() {
    var pl = ai.plan, k = pl.keys[pl.i++];
    if (pl.i === 1) { root.__ev = newEv(); root.__ev.hold = pl.cand.plan.hd; ai.s0 = S.score; ai.preTrue = boardStats(flatB(S.blk)); }
    var code = k;
    if (typeof k === 'object') code = arrowFor(k.axis, k.sign);
    var nbBefore = S.nowblock;
    if (code) A.execKey(code);
    if (k === 'ShiftLeft' && S.nowblock === nbBefore) {   // the hold is locked: nothing happened. The player notices and re-plans without hold.
      root.__ev = null; ai.holdBan = true; ai.sa = new Float32Array(SD); ai.dec++; ai.plan = null; ai.gen = null; ai.aborted = true; return;
    }
    if (k === 'Enter') afterPlan();
  }
  function afterPlan() {
    var ev = root.__ev; root.__ev = null;
    if (!ev) return;
    ev.gain = S.score - ai.s0;
    var after = flatB(S.blk), blindAfter = S.blindboard > A.now(), hide = ai.pre.blind || blindAfter;
    ai.sa = summarize(ev, after, hide, ai.preTrue.maxh, ai.preTrue.holes, blindAfter);
    ai.bel = (blindAfter && !S.goverflg && ai.plan && ai.plan.cand.board) ? ai.plan.cand.board : null;
    ai.dec++; ai.plan = null; ai.gen = null; ai.holdBan = false;
  }

  function tick() {
    root.requestAnimationFrame(tick);
    if (!ai.on) return;
    if (!running()) { if (S.goverflg) stop(); return; }
    if (S.pause) return;
    if (!ai.plan) {
      if (!ai.gen) beginDecision();
      var r = runSlice(ai.gen, 6);
      if (r.done) { finishDecision(r.value); ai.gen = null; }
      return;
    }
    if (root.__pieceSeq !== ai.plan.seq) { ai.plan = null; ai.gen = null; return; }   // the piece was replaced (gravity lock, ...): plan again
    var t = A.now();
    if (t - ai.lastAct < GAP) return;
    ai.lastAct = t;
    pressNext();
  }
  // test hook: decide and execute one plan synchronously (no gravity, no 200 ms gaps; root.__testClock(i) may advance a fake clock before key i)
  function decideSync() {
    beginDecision();
    var r = runSlice(ai.gen, Infinity); ai.gen = null; finishDecision(r.value);
    var n = ai.plan.keys.length;
    while (ai.plan) {
      if (root.__pieceSeq !== ai.plan.seq) break;
      if (root.__testClock) root.__testClock(ai.plan.i);
      pressNext();
    }
    var ab = ai.aborted; ai.aborted = false;
    return { out: r.value, n: n, aborted: ab };
  }
  function updateHud() {
    var h = ai.hud || (ai.hud = root.document.getElementById('hud'));
    if (h) h.textContent = ai.on ? 'AI  (1 input / 0.2s)  [F3] off' : (ai.loading ? 'AI model loading...' : (ai.msg || ''));
    if (root.PolyAutoSolve) root.PolyAutoSolve.notify();
  }
  function ensureModel(cb) {
    if (model) { cb(true); return; }
    var PB = root.PolyBattle, bat = !!(PB && PB.on && ai.battleUrl);               // battle mode: the battle network (placement + items in one); normal mode: the solo network
    var url = bat ? ai.battleUrl : ai.modelUrl, vr = bat ? ai.battleVar : ai.modelVar;
    var done = function () {
      try { loadModel(root[vr]); } catch (e) { ai.msg = 'AI model load failed: ' + e.message; cb(false); return; }
      cb(true);
    };
    if (root[vr]) { done(); return; }
    var sc = root.document.createElement('script');
    sc.src = url; sc.onload = done;
    sc.onerror = function () {
      if (bat) { url = ai.modelUrl; vr = ai.modelVar; if (root[vr]) { done(); return; } var s2 = root.document.createElement('script'); s2.src = url; s2.onload = done; s2.onerror = function () { ai.msg = 'AI model missing (' + url + ')'; cb(false); }; root.document.head.appendChild(s2); return; }   // (no battle network file: the solo one + the old item rule)
      ai.msg = 'AI model missing (' + url + ')'; cb(false);
    };
    root.document.head.appendChild(sc);
  }
  function start() {
    if (ai.on || ai.loading || !running()) return;
    ai.loading = true; updateHud();
    ensureModel(function (ok) {
      ai.loading = false;
      if (ok && running()) {
        ai.on = true; ai.holdBan = false; ai.h = null; ai.sa = null; ai.bel = null; ai.plan = null; ai.gen = null; ai.dec = 0; ai.lastAct = A.now();
        ai.seed0 = (Math.random() * 4294967296) >>> 0;
      }
      updateHud();
    });
  }
  function stop() { ai.on = false; ai.loading = false; ai.plan = null; ai.gen = null; ai.bel = null; root.__ev = null; root.__rng = null; updateHud(); }
  function toggle() { if (ai.on || ai.loading) stop(); else start(); }

  function attach(a) {
    A = a; S = a.state; DIM = a.dim; NW = DIM === 4 ? 7 : 1; NP = 343 * NW; NB = 49 * 26 * NW; NCOL = 49 * NW; NPOS = DIM === 4 ? 6 : 3; NDEF = DIM === 4 ? 4 : 2; PDESC = DIM + 2;
    NF = NCOL * 2 + NLAY + NLAY * NDEF + NSCAL + 2 * PDESC; ROT_DEPTH = DIM === 4 ? 6 : 4; MAXNODES = DIM === 4 ? 400 : 120; PRUNE_K = DIM === 4 ? 192 : 0; CAP = DIM === 4 ? 256 : 1536;
    PX = new Int8Array(NP); PY = new Int8Array(NP); PZ = new Int8Array(NP); PW = new Int8Array(NP);
    for (var x = 0; x < 7; x++) for (var y = 0; y < 7; y++) for (var z = 0; z < 7; z++) for (var w = 0; w < NW; w++) { var i = pidx(x, y, z, w); PX[i] = x; PY[i] = y; PZ[i] = z; PW[i] = w; }
    ai.modelUrl = a.modelUrl; ai.modelVar = a.modelVar; ai.battleUrl = a.battleUrl; ai.battleVar = a.battleVar;
    root.requestAnimationFrame(tick);
    root.addEventListener('keydown', function (e) { if (e.code === 'F3' && !e.repeat) { e.preventDefault(); toggle(); } });
    if (root.PolyAutoSolve) root.PolyAutoSolve.register({ dim: DIM, isRunning: running, isSolving: function () { return ai.on || ai.loading; }, start: start, stop: stop });
  }

  root.PolyND = { attach: attach, start: start, stop: stop, toggle: toggle, isOn: function () { return ai.on; },
    // test hooks
    _enumerate: function (ctx) { return runSlice(enumerate(ctx), Infinity).value; }, _ai: ai, _NF: function () { return NF; }, _loadModel: loadModel, _summarize: summarize,
    _fill: fillFeatures, _boardStats: boardStats, _flatB: flatB, _snap: snap, _restore: restore, _q: function (cands, h) { var g = qValues(cands, h), r; while (!(r = g.next()).done); return r.value; }, _gru: function (h, x) { return gruStep(h, x); },
    _loadUse: loadUse, _loadModel2: loadModel, _itemAdv: function (rf, hc, cx) { return itemAdv(rf, hc, ctxDense(cx)); }, _forwardCtx: function (feat, hc, cx) { ctxVec = cx ? ctxDense(cx) : null; var v = forward(feat, hc); ctxVec = null; return v; }, _model: function () { return model; }, _bstate: bstate, _classSnapshot: classSnapshot, _viewFeat: viewFeat, _isSpecial: isSpecial, _decideUse: decideUse, _begin: beginDecision, _tick: tick, _decideSync: decideSync };
})(typeof window !== 'undefined' ? window : globalThis);
