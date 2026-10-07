// Auto play (Help > Cheat > Solve Automatically, F3) for the Atari Breakout games: a policy trained with reinforcement learning (PPO, training/ ) that sees what a player sees
// (ball position / velocity, paddle, the brick grid) and every 1/20 s picks a target place for the paddle.
(function () {
  function decode(m) {
    if (m.cache) return m.cache;
    const bin = atob(m.w), n = bin.length / 4, u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const f = new Float32Array(u8.buffer); let o = 0;
    const take = function (k) { const a = f.subarray(o, o + k); o += k; return a; };
    const d = { obs: m.obs, hid: m.hid, heads: m.heads, w0: take(m.hid * m.obs), b0: take(m.hid), w1: take(m.hid * m.hid), b1: take(m.hid), wp: take(m.heads.reduce(function (a, b) { return a + b; }, 0) * m.hid) };
    d.bp = take(m.heads.reduce(function (a, b) { return a + b; }, 0));
    m.cache = d; return d;
  }
  function logits(d, x) {                                     // two tanh layers, then the policy head
    const h1 = new Float32Array(d.hid), h2 = new Float32Array(d.hid), nh = d.bp.length, out = new Float32Array(nh);
    for (let i = 0; i < d.hid; i++) { let s = d.b0[i]; const o = i * d.obs; for (let k = 0; k < d.obs; k++) s += d.w0[o + k] * x[k]; h1[i] = Math.tanh(s); }
    for (let i = 0; i < d.hid; i++) { let s = d.b1[i]; const o = i * d.hid; for (let k = 0; k < d.hid; k++) s += d.w1[o + k] * h1[k]; h2[i] = Math.tanh(s); }
    for (let i = 0; i < nh; i++) { let s = d.bp[i]; const o = i * d.hid; for (let k = 0; k < d.hid; k++) s += d.wp[o + k] * h2[k]; out[i] = s; }
    return out;
  }
  function argmaxHeads(d, out) { const r = []; let o = 0; d.heads.forEach(function (n) { let b = 0; for (let i = 1; i < n; i++) if (out[o + i] > out[o + b]) b = i; r.push(b); o += n; }); return r; }
  function reflect(p, lo, hi) { const span = hi - lo, m = ((p - lo) % (2 * span) + 2 * span) % (2 * span); return (m > span ? 2 * span - m : m) + lo; }

  // ---- 2D: S.bricks[row][col] (row 0 = top), ball {x, y, vx, vy}, paddle S.px / S.pw; field 100 x 130 ----
  function obs2d(S) {
    const b = S.ball, FW = 100, FH = 130, PY = FH - 9, R = 1.6, sp = S.speed;
    let xl = b.x, tt = 0;
    if (b.vy > 0.5) { tt = (PY - R - b.y) / b.vy; xl = reflect(b.x + b.vx * tt - R, 0, FW - 2 * R) + R; }
    const x = [b.x / FW, b.y / FH, b.vx / sp, b.vy / sp, S.px / FW, S.pw / 40, xl / FW, Math.min(1, tt / 3)];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) x.push((S.bricks[r][c] ? S.bricks[r][c].hits : 0) / 5);
    return x;
  }
  // ---- 3D: S.bricks = [{x, y, z, b: {hits}}] (z = 7 .. 11), ball {x, y, z, vx, vy, vz}, paddle S.px / S.py with half size hs ----
  function obs3d(S, hs) {
    const b = S.ball, N = 6, H = 12, R = 0.28, sp = S.speed;
    let lx = b.x, ly = b.y, tt = 0;
    if (b.vz < -0.1) { tt = (b.z - R) / -b.vz; lx = reflect(b.x + b.vx * tt - R, 0, N - 2 * R) + R; ly = reflect(b.y + b.vy * tt - R, 0, N - 2 * R) + R; }
    const x = [b.x / N, b.y / N, b.z / H, b.vx / sp, b.vy / sp, b.vz / sp, S.px / N, S.py / N, hs / 2.5, lx / N, ly / N, Math.min(1, tt / 3)];
    const g = new Float32Array(5 * 36);
    for (const k of S.bricks) { const l = k.z - 7; if (l >= 0 && l < 5) g[l * 36 + k.x * 6 + k.y] = k.b.hits / 5; }
    for (let i = 0; i < g.length; i++) x.push(g[i]);
    return x;
  }
  window.AtariAI = {
    obs2d: obs2d, obs3d: obs3d, _argmax: function (x) { const d = decode(window.ATARI_AI_2D && x.length === window.ATARI_AI_2D.obs ? window.ATARI_AI_2D : window.ATARI_AI_3D); return argmaxHeads(d, logits(d, x)); },
    ready: function (mode) { return !!window['ATARI_AI_' + mode.toUpperCase()]; },
    // returns the target for the paddle (2D: x, 3D: [x, y]).  The policy's action is the offset t (-1 .. 1) on the paddle where the ball should land: it sets the angle the ball leaves with,
    // so the paddle goes to (landing place - t * half size)
    act2d: function (S) {
      const d = decode(window.ATARI_AI_2D), x = obs2d(S), a = argmaxHeads(d, logits(d, x))[0], t = -1 + 2 * a / (d.heads[0] - 1), xl = x[6] * 100;
      return Math.min(100 - S.pw / 2, Math.max(S.pw / 2, xl - t * S.pw / 2));
    },
    act3d: function (S, hs) {
      const d = decode(window.ATARI_AI_3D), x = obs3d(S, hs), a = argmaxHeads(d, logits(d, x)), lx = x[9] * 6, ly = x[10] * 6, n = d.heads[0] - 1;
      const cl = function (v) { return Math.min(6 - hs, Math.max(hs, v)); };
      return [cl(lx - (-1 + 2 * a[0] / n) * hs), cl(ly - (-1 + 2 * a[1] / n) * hs)];
    }
  };
})();
