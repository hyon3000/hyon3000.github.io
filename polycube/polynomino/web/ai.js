// Polynomino AI — afterstate value network, evaluated in plain JS (no dependencies).
//
// The network (trained offline by training/train_rnn.py, recurrent afterstate Double-DQN on training/sim.cpp)
// predicts V(afterstate | memory). app.js enumerates plans by really executing hold/rotate/move/hard-drop inputs on a
// saved copy of the game; this module turns each resulting game state into the feature vector the network was trained
// on (must match fillFeatures() in training/sim.cpp — verified by training/test_lockstep.py) and picks
// argmax(r + gamma * V).
//
// Memory: a GRU state is carried through the whole game. After every decision it absorbs a summary of what happened
// (item types triggered / placed, lines, explosions, garbage, hold, holes / height change); a candidate plan is scored
// with the memory as it would be after that plan's own events. What to remember is learned, not hand-made.
//
// Input = dense features (371) + a sparse list of item ids: every item cell on the board is given as
// (item type, cell), and the item cells of the upcoming / held piece as (piece, item type), so the network can
// tell every individual item type apart and knows where it is.
(function (root) {
  'use strict';
  var W = 10, H = 20, SD = 80, NF = 371, KIDS = 64, NT = 37;
  var GAMMA = 0.997, DEATH_R = -10;
  var TYPES = [1, 2, 4, 5, 6, 8, 9, 10, 11, 16, 17, 18, 19, 20, 21, 22, 30, 31, 91, 102, 104, 116, 117, 118, 119,
    120, 121, 122, 123, 124, 125, 126, 127, 200, 204, 98, 103];
  var TYPE_INDEX = {};
  TYPES.forEach(function (v, i) { TYPE_INDEX[v] = i; });

  function lessMask(a, b) {
    for (var i = 48; i >= 0; i--) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  }
  // canonical (rotation-invariant) 7x7 mask of a piece as a 49-length 0/1 array
  function canonMask(cells) {
    var cur = cells.map(function (p) { return [p[0], p[1]]; }), best = null;
    for (var rot = 0; rot < 4; rot++) {
      var mr = 1e9, mc = 1e9, i;
      for (i = 0; i < cur.length; i++) { mr = Math.min(mr, cur[i][0]); mc = Math.min(mc, cur[i][1]); }
      var m = new Array(49).fill(0);
      for (i = 0; i < cur.length; i++) {
        var a = cur[i][0] - mr, b = cur[i][1] - mc;
        if (a < 7 && b < 7) m[a * 7 + b] = 1;
      }
      if (best === null || lessMask(m, best)) best = m;
      cur = cur.map(function (p) { return [p[1], -p[0]]; });
    }
    return best;
  }
  var _maskCache = {};
  function maskOf(cells) {
    var key = cells.map(function (p) { return p[0] + ',' + p[1]; }).join(';');
    return _maskCache[key] || (_maskCache[key] = canonMask(cells));
  }
  function clampf(x, m) { return Math.min(x, m) / m; }

  // P: {board[20][10] values (the board the AI believes in), now:{cells,vals} (upcoming piece), hold:{cells,vals},
  //     counters..., level, lines, placedN, blind, blindRemain, hideNext, boom, garb}
  // returns {f: Float32Array(NF), ids: Int16Array(KIDS) (-1 padded)}
  function features(P) {
    var f = new Float32Array(NF), ids = new Int16Array(KIDS).fill(-1), nid = 0, r, c, i;
    var occ = new Array(H).fill(0);
    for (r = 0; r < H; r++) {
      var urg = 0, cnt = 0;
      for (c = 0; c < W; c++) {
        var v = P.board[r][c];
        if (v === 0) continue;
        var vv = v & 255;
        occ[r] |= 1 << c; cnt++;
        f[r * W + c] = 1;
        if (vv >= 120 && vv <= 123) urg = Math.max(urg, (vv - 119) / 4);
        var t = TYPE_INDEX[vv];
        if (t !== undefined && nid < 40) ids[nid++] = t * 200 + r * W + c;
      }
      f[298 + r] = (W - cnt) / W;
      f[318 + r] = urg;
    }
    if (!P.hideNext) { // hide-next item: the upcoming piece and the hold are not visible
      var mn = maskOf(P.now.cells), mh = maskOf(P.hold.cells);
      for (i = 0; i < 49; i++) { f[200 + i] = mn[i]; f[249 + i] = mh[i]; }
      for (var w = 0; w < 2; w++) {
        var pc = w === 0 ? P.now : P.hold;
        for (i = 0; i < pc.vals.length && nid < KIDS; i++) {
          var tt = TYPE_INDEX[pc.vals[i] & 255];
          if (tt !== undefined) ids[nid++] = NT * 200 + w * NT + tt;
        }
      }
    }
    var hts = [], holes = 0, maxh = 0, bump = 0;
    for (c = 0; c < W; c++) {
      var h = 0;
      for (r = H - 1; r >= 0; r--) if ((occ[r] >> c) & 1) { h = r + 1; break; }
      hts.push(h); maxh = Math.max(maxh, h);
      for (r = 0; r < h; r++) if (!((occ[r] >> c) & 1)) holes++;
    }
    for (c = 0; c + 1 < W; c++) bump += Math.abs(hts[c] - hts[c + 1]);
    for (c = 0; c < W; c++) f[338 + c] = hts[c] / 20;
    f[348] = holes / 20; f[349] = bump / 40; f[350] = maxh / 20; f[351] = P.level / 16;
    f[352] = P.lines / 4; f[353] = P.placedN / 8;
    // Human-visible observations only: the board is hidden (blind) / NEXT is hidden are visible. Remaining effect counters, the pending
    // gap-clear, the remaining blind time and speed counters are not shown by the game, so they are not inputs (f[355..357], f[359..368] = 0).
    f[354] = P.blind; f[358] = P.hideNext;
    f[369] = Math.min(P.boom, 2) / 2; f[370] = Math.min(P.garb, 4) / 4;
    return { f: f, ids: ids };
  }

  // ---- event memory ----
  // counters: {trig:{code:n}, placed:{code:n}, boom, garb, hold, lines, holes, maxh} (cumulative)
  function summarize(before, after, hideBoard) {
    var out = new Float32Array(SD), t;
    for (t = 0; t < NT; t++) {
      out[t] = (after.trig[TYPES[t]] || 0) - (before.trig[TYPES[t]] || 0);
      out[NT + t] = (after.placed[TYPES[t]] || 0) - (before.placed[TYPES[t]] || 0);
    }
    out[74] = (after.lines - before.lines) / 4; out[75] = (after.boom - before.boom) / 2; out[76] = (after.garb - before.garb) / 4;
    out[77] = after.hold - before.hold;
    out[78] = hideBoard ? 0 : (after.holes - before.holes) / 10; out[79] = hideBoard ? 0 : (after.maxh - before.maxh) / 10;
    return out;
  }

  // ---- model ----
  function b64Bytes(s) {
    var bin = root.atob(s), n = bin.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function b64ToF32(s) { return new Float32Array(b64Bytes(s).buffer); }
  function b64ToF16(s) { // half-precision -> Float32Array
    var u = b64Bytes(s), h = new Uint16Array(u.buffer), out = new Float32Array(h.length);
    for (var i = 0; i < h.length; i++) {
      var x = h[i], sgn = (x & 0x8000) ? -1 : 1, e = (x >> 10) & 31, m = x & 1023;
      out[i] = e === 0 ? sgn * m * 5.960464477539063e-8 : (e === 31 ? (m ? NaN : sgn * Infinity) : sgn * (1 + m / 1024) * Math.pow(2, e - 15));
    }
    return out;
  }

  var model = null;
  // m: {vscale, dense:{in,out,w(f16,[out][in])}, emb:{n,out,w(f16,[n][out])}, b1, gru:{in,hid,w_ih,w_hh,b_ih,b_hh (f32)},
  //     wm:{in,out,w (f32,[out][in])}, layers:[{in,out,w,b}]}
  function load(m) {
    var nin = m.dense.in, nout = m.dense.out, wd = b64ToF16(m.dense.w), wt = new Float32Array(nin * nout);
    for (var o = 0; o < nout; o++) for (var i = 0; i < nin; i++) wt[i * nout + o] = wd[o * nin + i];
    model = {
      vscale: m.vscale, rw: m.reward, vmax: m.reward.mode === 'survival' ? 400 : 1500, nin: nin, nout: nout, wt: wt, emb: b64ToF16(m.emb.w), b1: b64ToF32(m.b1),
      g: { in: m.gru.in, hid: m.gru.hid, w_ih: b64ToF32(m.gru.w_ih), w_hh: b64ToF32(m.gru.w_hh), b_ih: b64ToF32(m.gru.b_ih), b_hh: b64ToF32(m.gru.b_hh) },
      wm: b64ToF32(m.wm.w), wmIn: m.wm.in, ln: { w: b64ToF32(m.ln.w), b: b64ToF32(m.ln.b) },
      layers: m.layers.map(function (l) { return { nin: l.in, nout: l.out, w: b64ToF32(l.w), b: b64ToF32(l.b) }; })
    };
    ctxVec = null;
    if (m.cdense) {          // the battle network: the context (opponent window + my item queue) enters the plan values; the item head = advantage of the item actions over waiting
      model.cd = { nin: m.cdense.in, w: b64ToF32(m.cdense.w), b: b64ToF32(m.cdense.b) };
      model.ih = m.ih.map(function (l) { return { nin: l.in, nout: l.out, w: b64ToF32(l.w), b: b64ToF32(l.b) }; });
    }
  }
  var ctxVec = null;
  function ctxDense(ctx) {
    var cd = model.cd, out = new Float32Array(model.nout), o, i;
    for (o = 0; o < model.nout; o++) { var s = cd.b[o], row = o * cd.nin; for (i = 0; i < cd.nin; i++) if (ctx[i] !== 0) s += cd.w[row + i] * ctx[i]; out[o] = s; }
    return out;
  }
  function setCtx(ctx) { ctxVec = ctx && model && model.cd ? ctxDense(ctx) : null; }
  function itemAdv(rootFeat, hc, ctx) {          // A(s, a) (x vscale) for the item actions; column 0 (wait) is 0
    var nout = model.nout, h = new Float32Array(nout), cv = ctxDense(ctx), i, o;
    h.set(model.b1);
    for (i = 0; i < model.nin; i++) { var v = rootFeat[i]; if (v === 0) continue; var base = i * nout; for (o = 0; o < nout; o++) h[o] += v * model.wt[base + o]; }
    for (o = 0; o < nout; o++) { var s = h[o], row = o * model.wmIn; for (i = 0; i < model.wmIn; i++) s += model.wm[row + i] * hc[i]; h[o] = s + cv[o]; }
    var mean = 0, vr = 0;
    for (o = 0; o < nout; o++) mean += h[o];
    mean /= nout;
    for (o = 0; o < nout; o++) { var d = h[o] - mean; vr += d * d; }
    var inv = 1 / Math.sqrt(vr / nout + 1e-5);
    for (o = 0; o < nout; o++) { var y = (h[o] - mean) * inv * model.ln.w[o] + model.ln.b[o]; h[o] = y > 0 ? y : 0; }
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
  // one GRU step (PyTorch gate order r,z,n): x Float32Array(SD) -> new hidden state; h may be null (zeros)
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
  // value of one candidate given the memory after this candidate's events (hc)
  function forward(feat, hc) {
    var x = feat.f, ids = feat.ids, nout = model.nout, h = new Float32Array(nout), i, o;
    h.set(model.b1);
    for (i = 0; i < model.nin; i++) {
      var v = x[i];
      if (v === 0) continue;
      var base = i * nout;
      for (o = 0; o < nout; o++) h[o] += v * model.wt[base + o];
    }
    for (i = 0; i < ids.length; i++) {
      if (ids[i] < 0) break;
      var eb = ids[i] * nout;
      for (o = 0; o < nout; o++) h[o] += model.emb[eb + o];
    }
    for (o = 0; o < nout; o++) { var s = h[o], row = o * model.wmIn; for (i = 0; i < model.wmIn; i++) s += model.wm[row + i] * hc[i]; h[o] = ctxVec ? s + ctxVec[o] : s; }
    var mean = 0, vr = 0;                                   // LayerNorm over the first hidden layer, then ReLU
    for (o = 0; o < nout; o++) mean += h[o];
    mean /= nout;
    for (o = 0; o < nout; o++) { var d = h[o] - mean; vr += d * d; }
    var inv = 1 / Math.sqrt(vr / nout + 1e-5);
    for (o = 0; o < nout; o++) { var y = (h[o] - mean) * inv * model.ln.w[o] + model.ln.b[o]; h[o] = y > 0 ? y : 0; }
    var L = model.layers;
    for (var li = 0; li < L.length; li++) {
      var l = L[li], nh = new Float32Array(l.nout);
      for (o = 0; o < l.nout; o++) {
        var s3 = l.b[o], wo = o * l.nin;
        for (i = 0; i < l.nin; i++) s3 += h[i] * l.w[wo + i];
        nh[o] = (li < L.length - 1 && s3 < 0) ? 0 : s3;
      }
      h = nh;
    }
    var v = h[0] * model.vscale;
    return v < -20 ? -20 : (v > model.vmax ? model.vmax : v);   // beyond the largest possible discounted return it is extrapolation error
  }

  // Q of every candidate = r + gamma*V(afterstate | memory); hprev = memory after absorbing what happened so far.
  // Dead candidates only when nothing else survives.
  function qValues(cands, hprev) {
    var anyAlive = cands.some(function (c) { return !c.dead; });
    return cands.map(function (c) {
      if (c.dead) return anyAlive ? -1e9 : DEATH_R;
      var r = rewardOf(c);
      return r + GAMMA * forward(c.feat, gruStep(hprev, c.sum));
    });
  }
  // reward = 1 per decision (survival) + the game's own score gained, clipped (tidy tight-fit placements and clears score)
  function rewardOf(c) {
    if (c.dead) return DEATH_R;
    var rw = model.rw;
    if (rw.mode === 'score') return (rw.base === undefined ? 1 : rw.base) + Math.min(Math.max(c.gain || 0, 0), rw.clip) / rw.div;
    if (rw.mode === 'lines') return 1 + 2 * c.lines * c.lines;
    return 1;
  }
  function pick(cands, hprev) {
    if (!cands.length) return null;
    var q = qValues(cands, hprev), bi = 0;
    for (var i = 1; i < q.length; i++) if (q[i] > q[bi]) bi = i;
    return cands[bi];
  }

  // ---- battle mode: the item-use net (3-layer MLP; what to do with the front item: 0 wait / 1 on me / 2 on the opponent) ----
  var useModel = null;
  function loadUse(m) { useModel = m.layers.map(function (l) { return { nin: l.in, nout: l.out, w: b64ToF32(l.w), b: b64ToF32(l.b) }; }); }
  function useForward(x) {
    var h = x, L = useModel;
    for (var li = 0; li < L.length; li++) {
      var l = L[li], nh = new Float32Array(l.nout);
      for (var o = 0; o < l.nout; o++) { var sum = l.b[o], wo = o * l.nin; for (var i = 0; i < l.nin; i++) sum += h[i] * l.w[wo + i]; nh[o] = (li < L.length - 1 && sum < 0) ? 0 : sum; }
      h = nh;
    }
    return h;
  }
  root.PolyAI = {
    setCtx: setCtx, itemAdv: itemAdv, hasBattle: function () { return !!(model && model.ih); }, loadUse: loadUse, useForward: useForward, hasUse: function () { return !!useModel; }, typeIndex: function (c) { return TYPE_INDEX[c]; }, NT: NT,
    NF: NF, KIDS: KIDS, SD: SD, load: load, features: features, summarize: summarize, hiddenStep: gruStep, qValues: qValues, pick: pick, rewardOf: rewardOf, GAMMA: GAMMA, DEATH_R: DEATH_R,
    isLoaded: function () { return !!model; }, _forward: function (feat) { return forward(feat); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
