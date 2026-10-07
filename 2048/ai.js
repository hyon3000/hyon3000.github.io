// Auto-solve for 2048: the size-independent afterstate value network trained in training/ (net2048.py, train_2048.py).
// Plays like a human could: one slide per step.  choose(grid) -> 'left' | 'right' | 'up' | 'down' | null
// grid: R x C array of tile values (0 = empty, else 2^k)
(function () {
  var NE = 17, NP = 4, RS = 0.1, GAMMA = 0.99;
  var M = null;                                   // decoded model

  function decode() {
    var m = window.AI2048_MODEL; if (!m) return null;
    if (M && M.src === m) return M;
    var bin = atob(m.w), n = bin.length / 4, buf = new ArrayBuffer(bin.length), u8 = new Uint8Array(buf);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var f = new Float32Array(buf), o = 0;
    function take(k) { var a = f.subarray(o, o + k); o += k; return a; }
    var ch = m.ch, L = m.layers, hid = m.hid, cin = NE + NP;
    var d = { src: m, ch: ch, L: L, hid: hid, cin: cin, inW: take(ch * cin * 9), inB: take(ch), conv: [], glob: [] };
    for (var l = 0; l < L; l++) { d.conv.push({ w: take(ch * ch * 9), b: take(ch) }); d.glob.push({ w: take(ch * 2 * ch), b: take(ch) }); }
    d.h1w = take(hid * 2 * ch); d.h1b = take(hid); d.h2w = take(hid); d.h2b = take(1);
    M = d; return d;
  }

  // slide + merge one move on exponent boards.  returns { b, reward (sum of new exponents), gain (score), moved }
  function sim(e, R, C, dir) {
    var out = new Int8Array(R * C), reward = 0, gain = 0, moved = false;
    var nl = dir < 2 ? R : C, len = dir < 2 ? C : R, line = new Int8Array(len);
    for (var k = 0; k < nl; k++) {
      var cnt = 0, i, j;
      for (i = 0; i < len; i++) {                 // read the line in the direction of the move
        var p = pos(dir, k, i, R, C); var v = e[p]; if (v) line[cnt++] = v;
      }
      var res = [], w = 0;
      for (i = 0; i < cnt; i++) {
        if (i + 1 < cnt && line[i] === line[i + 1]) { var nv = line[i] + 1; res.push(nv); reward += nv; gain += Math.pow(2, nv); i++; } else res.push(line[i]);
      }
      for (i = 0; i < len; i++) { var q = pos(dir, k, i, R, C), nv2 = i < res.length ? res[i] : 0; out[q] = nv2; if (nv2 !== e[q]) moved = true; }
    }
    return { b: out, reward: reward, gain: gain, moved: moved };
  }
  function pos(dir, k, i, R, C) {                 // i-th cell (counted from the side the tiles move to) of line k
    if (dir === 0) return k * C + i;              // left
    if (dir === 1) return k * C + (C - 1 - i);    // right
    if (dir === 2) return i * C + k;              // up
    return (R - 1 - i) * C + k;                   // down
  }

  function value(e, R, C) {
    var d = decode(), ch = d.ch, n = R * C, i, c, k;
    var x = new Float32Array(d.cin * n);
    for (i = 0; i < n; i++) x[Math.min(e[i], NE - 1) * n + i] = 1;
    for (var y = 0; y < R; y++) for (var xx = 0; xx < C; xx++) {
      var ex = Math.min(xx, C - 1 - xx), ey = Math.min(y, R - 1 - y), ed = Math.min(ex, ey), cd = ex + ey, p = y * C + xx;
      x[NE * n + p] = Math.exp(-ed); x[(NE + 1) * n + p] = Math.exp(-cd * 0.5); x[(NE + 2) * n + p] = ed === 0 ? 1 : 0; x[(NE + 3) * n + p] = 1;
    }
    var cur = conv(x, d.cin, d.inW, d.inB, R, C, ch); for (i = 0; i < cur.length; i++) if (cur[i] < 0) cur[i] = 0;
    for (var l = 0; l < d.L; l++) {
      var yv = conv(cur, ch, d.conv[l].w, d.conv[l].b, R, C, ch), p2 = new Float32Array(2 * ch);
      for (c = 0; c < ch; c++) { var s = 0, mx = -1e30; for (i = 0; i < n; i++) { var t = yv[c * n + i]; s += t; if (t > mx) mx = t; } p2[c] = s / n; p2[ch + c] = mx; }
      var g = d.glob[l];
      for (c = 0; c < ch; c++) {
        var gs = g.b[c]; for (k = 0; k < 2 * ch; k++) gs += g.w[c * 2 * ch + k] * p2[k];
        for (i = 0; i < n; i++) { var z = cur[c * n + i] + yv[c * n + i] + gs; cur[c * n + i] = z > 0 ? z : 0; }
      }
    }
    var p3 = new Float32Array(2 * ch);
    for (c = 0; c < ch; c++) { var s3 = 0, m3 = -1e30; for (i = 0; i < n; i++) { var t3 = cur[c * n + i]; s3 += t3; if (t3 > m3) m3 = t3; } p3[c] = s3 / n; p3[ch + c] = m3; }
    var out = d.h2b[0];
    for (var h = 0; h < d.hid; h++) { var a = d.h1b[h]; for (k = 0; k < 2 * ch; k++) a += d.h1w[h * 2 * ch + k] * p3[k]; if (a > 0) out += d.h2w[h] * a; }
    return out;
  }
  function conv(x, cin, w, b, R, C, cout) {       // 3x3, padding 1
    var n = R * C, out = new Float32Array(cout * n);
    for (var oc = 0; oc < cout; oc++) {
      var ob = oc * n, bb = b[oc], i;
      for (i = 0; i < n; i++) out[ob + i] = bb;
      for (var ic = 0; ic < cin; ic++) {
        var xb = ic * n, wb = (oc * cin + ic) * 9, any = false;
        for (i = 0; i < n; i++) if (x[xb + i] !== 0) { any = true; break; }
        if (!any) continue;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var wv = w[wb + (dy + 1) * 3 + (dx + 1)]; if (wv === 0) continue;
          for (var yy = Math.max(0, -dy); yy < Math.min(R, R - dy); yy++) {
            var ro = ob + yy * C, ri = xb + (yy + dy) * C + dx;
            for (var xx = Math.max(0, -dx); xx < Math.min(C, C - dx); xx++) out[ro + xx] += wv * x[ri + xx];
          }
        }
      }
    }
    return out;
  }

  var NAMES = ['left', 'right', 'up', 'down'];
  window.AI2048 = {
    ready: function () { return !!window.AI2048_MODEL; },
    choose: function (grid) {
      if (!decode()) return null;
      var R = grid.length, C = grid[0].length, e = new Int8Array(R * C);
      for (var r = 0; r < R; r++) for (var c = 0; c < C; c++) e[r * C + c] = grid[r][c] ? Math.round(Math.log2(grid[r][c])) : 0;
      var best = -1e30, bd = -1;
      for (var d = 0; d < 4; d++) {
        var s = sim(e, R, C, d); if (!s.moved) continue;
        var q = s.reward * RS + GAMMA * value(s.b, R, C);
        if (q > best) { best = q; bd = d; }
      }
      return bd < 0 ? null : NAMES[bd];
    },
    sim: sim, value: value
  };
})();
