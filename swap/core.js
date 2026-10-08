// Swap Puzzle - shared match-3 engine for the 2D (8x8x1) and 3D (5x5x5) versions.
// Board: cells indexed i = (y*D + z)*W + x, y = 0 is the BOTTOM (gravity pulls towards -y), -1 = empty.  2D uses D = 1.
// Rules: a swap of two adjacent gems is only accepted if it makes a match (a connected group of 3+ same-colour gems, any shape); otherwise the gems swap and swap back (shake).
// Then: matches vanish, gems fall, new random gems fill from the top, repeated until stable (chain 1, 2, 3 ...).
// Score of one step = (10 per gem + group bonus: size 4 +30, size 5+ +50 and +20 per gem beyond 5) * chain.  A chain of 4+ steps gives +1 move.
// 20 moves at the start, +10 moves per level (level n needs S * n^2 more points (S = 400 in 2D, 2400 in 3D)), game over when the moves run out before the target.
// Colours = max(minColors, min(8, ceil(sqrt(2 + level)))), minColors = 5 (2D) / 6 (3D) because with any-shape groups 4 colours chain endlessly.  No valid move after settling -> the board is reshuffled.
(function () {
  'use strict';
  const KO = /^ko/i.test(navigator.language || 'ko');
  const NCOL = 8, START_MOVES = 20, LEVEL_MOVES = 10, TARGET_STEP = 200;
  function numColors(level) { return Math.max(4, Math.min(NCOL, Math.ceil(Math.sqrt(2 + level)))); }
  function targetOf(level) { return 100 * level * (level + 1) * (2 * level + 1) / 3; }      // total score at which a level is done: level n needs 200 * n^2 more points 
  const AX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  function make(W, H, D, opts) {
    opts = opts || {};
    const N = W * H * D;
    const G = { W: W, H: H, D: D, N: N, g: new Array(N).fill(-1), pre: null, matched: null, off: new Float32Array(N), mode: 'start', phase: 'idle', t: 0, T: 0,
      level: 1, score: 0, best: 0, moves: START_MOVES, target: 200, nc: 4, chain: 0, maxChain: 0, a: -1, b: -1, plan: null, auto: false, autoT: 0, overT: 0, pops: [], msg: '', msgT: 0,
      sel: new Array(N).fill(true), key: opts.key || 'swap_best', stepInfo: null, swaps: 0, pendingHint: false, onPlan: null, onNew: null, rnd: Math.random };
    const X = function (i) { return i % W; }, Z = function (i) { return Math.floor(i / W) % D; }, Y = function (i) { return Math.floor(i / (W * D)); };
    const idx = function (x, y, z) { return (y * D + (z || 0)) * W + x; };
    G.X = X; G.Y = Y; G.Z = Z; G.idx = idx;
    if (D > 1) for (let i = 0; i < N; i++) { const x = X(i), y = Y(i), z = Z(i); G.sel[i] = x === 0 || x === W - 1 || z === 0 || z === D - 1 || y === H - 1; }   // 3D: the outer shell (4 sides + top)
    try { G.best = parseInt(localStorage.getItem(G.key), 10) || 0; } catch (e) {}
    G.saveBest = function () { if (G.score > G.best) { G.best = G.score; try { localStorage.setItem(G.key, String(G.best)); } catch (e) {} } };
    G.targetScale = opts.targetScale || 1;
    G.scoreDiv = opts.scoreDiv || 1; G.frac = 0;      // shown score = raw points / scoreDiv (3D: 20); the remainder is carried so small gains are not lost
    G.tgt = function (level) { return Math.round(targetOf(level) * G.targetScale); };
    G.rand = function () { return Math.floor(G.rnd() * G.nc); };
    // new gem for cell i: a random colour that does not complete a group of 3 with the gems already there (so refills do not run away into endless chains;
    // chains still happen when falling gems join up).  Only if every colour would make a group a random one is used.
    G.nextGem = function (i) {
      const st = G.rand();
      if (i === undefined) return st;
      for (let k = 0; k < G.nc; k++) { const c = (st + k) % G.nc; G.g[i] = c; if (!G.matchAt(G.g, i)) return c; }
      return st;
    };

    // ---------- matching ----------
    // A match is ANY connected group (flood fill, face neighbours: 4 in 2D, 6 in 3D) of 3+ gems of the same colour.
    // returns { mark: Uint8Array, count, bonus, comps: [sizes] } for board g.  Bonus per group: size 4 +30, size 5+ +50 and +20 per gem beyond 5.
    const stack = new Int32Array(N + 8);
    function nbrList(i, out) {
      const x = X(i), y = Y(i), z = Z(i); let n = 0;
      if (x > 0) out[n++] = i - 1; if (x < W - 1) out[n++] = i + 1;
      if (y > 0) out[n++] = i - W * D; if (y < H - 1) out[n++] = i + W * D;
      if (z > 0) out[n++] = i - W; if (z < D - 1) out[n++] = i + W;
      return n;
    }
    const nb6 = new Int32Array(6);
    function flood(g, i, seen, cells) {                 // component of i (same colour), returns its size; fills cells[] when given
      const c = g[i]; let sp = 0, size = 0; stack[sp++] = i; seen[i] = 1;
      while (sp) { const j = stack[--sp]; size++; if (cells) cells.push(j); const n = nbrList(j, nb6); for (let k = 0; k < n; k++) { const q = nb6[k]; if (!seen[q] && g[q] === c) { seen[q] = 1; stack[sp++] = q; } } }
      return size;
    }
    G.findMatches = function (g) {
      const mark = new Uint8Array(N), seen = new Uint8Array(N), comps = []; let count = 0, bonus = 0;
      for (let i = 0; i < N; i++) {
        if (seen[i] || g[i] < 0) continue;
        const cells = [], size = flood(g, i, seen, cells);
        if (size >= 3) { for (const j of cells) mark[j] = 1; count += size; comps.push(size); if (size === 4) bonus += 30; else if (size >= 5) bonus += 50 + 20 * (size - 5); }
      }
      return { mark: mark, count: count, bonus: bonus, comps: comps };
    };
    // does the gem at i belong to a connected same-colour group of 3+ ?
    G.matchAt = function (g, i) { if (g[i] < 0) return false; return flood(g, i, new Uint8Array(N), null) >= 3; };
    G.adjacent = function (a, b) {
      if (a < 0 || b < 0 || a >= N || b >= N || a === b) return false;
      return Math.abs(X(a) - X(b)) + Math.abs(Y(a) - Y(b)) + Math.abs(Z(a) - Z(b)) === 1;
    };
    G.swapMakesMatch = function (g, a, b) {
      if (g[a] < 0 || g[b] < 0 || g[a] === g[b]) return false;
      const t = g[a]; g[a] = g[b]; g[b] = t;
      const ok = G.matchAt(g, a) || G.matchAt(g, b);
      g[b] = g[a]; g[a] = t; return ok;
    };
    // all legal swaps [a, b] among the selectable gems (3D: the outer shell) that create a match
    G.validMoves = function (g) {
      g = g || G.g; const out = [];
      for (let i = 0; i < N; i++) {
        if (!G.sel[i] || g[i] < 0) continue;
        const x = X(i), y = Y(i), z = Z(i);
        const nb = [x + 1 < W ? idx(x + 1, y, z) : -1, y + 1 < H ? idx(x, y + 1, z) : -1, z + 1 < D ? idx(x, y, z + 1) : -1];
        for (const j of nb) if (j >= 0 && G.sel[j] && G.swapMakesMatch(g, i, j)) out.push([i, j]);
      }
      return out;
    };

    // ---------- gravity ----------
    // gems fall towards y = 0; empties are filled from the top with fill() (null = leave empty).  Returns the largest fall distance; off[i] = cells the gem at i has fallen.
    G.fall = function (g, off, fill) {
      let mx = 0;
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        let w = 0;
        for (let y = 0; y < H; y++) {
          const i = idx(x, y, z), c = g[i];
          if (c >= 0) { if (y !== w) { const j = idx(x, w, z); g[j] = c; g[i] = -1; if (off) off[j] = y - w; if (y - w > mx) mx = y - w; } w++; }
        }
        if (fill) { const k = H - w; for (let y = w; y < H; y++) if (off) { off[idx(x, y, z)] = k; if (k > mx) mx = k; } }
      }
      if (fill) for (let i = 0; i < N; i++) if (g[i] < 0) g[i] = fill(i);        // bottom layers first, so a refill can see the gems below / beside it
      return mx;
    };
    // score estimate of a swap without refilling (used by the hint / auto play)
    G.simulate = function (a, b) {
      const g = G.g.slice(); const t = g[a]; g[a] = g[b]; g[b] = t;
      let score = 0, chain = 0, cleared = 0;
      for (let n = 0; n < 30; n++) {
        const m = G.findMatches(g); if (!m.count) break;
        chain++; score += (m.count * 10 + m.bonus) * chain; cleared += m.count;
        for (let i = 0; i < N; i++) if (m.mark[i]) g[i] = -1;
        G.fall(g, null, null);
      }
      return { score: score, chain: chain, cleared: cleared };
    };
    G.bestMove = function () {
      const mv = G.validMoves(); if (!mv.length) return null;
      let best = null, bs = -1;
      for (const m of mv) { const s = G.simulate(m[0], m[1]); const v = s.score + s.chain * 5 + G.rnd() * 0.5; if (v > bs) { bs = v; best = { a: m[0], b: m[1], sim: s }; } }
      return best;
    };

    // ---------- board creation ----------
    G.randomBoard = function () {
      for (let tries = 0; tries < 400; tries++) {
        const g = new Array(N).fill(-1);
        for (let i = 0; i < N; i++) {                 // fill in order avoiding a 3-run along each axis
          let c, n = 0;
          do { c = G.rand(); n++; g[i] = c; } while (G.matchAt(g, i) && n < 40);
        }
        if (G.findMatches(g).count === 0 && G.validMoves(g).length > 0) return g;
      }
      return null;
    };
    G.reshuffle = function () {
      let g = G.randomBoard();
      if (!g) { g = new Array(N).fill(0).map(function (_, i) { return (X(i) + Y(i) * 2 + Z(i)) % G.nc; }); g[0] = 0; }   // practically unreachable fallback
      G.g = g; G.off.fill(0); G.phase = 'shuffle'; G.t = 0; G.T = 0.6; G.msg = KO ? '움직일 곳이 없어 섞습니다' : 'NO MOVES - SHUFFLE'; G.msgT = 1.6; G.shuffles = (G.shuffles || 0) + 1;
    };
    G.newGame = function () {
      G.score = 0; G.frac = 0; G.level = 1; G.moves = START_MOVES; G.target = G.tgt(1); G.nc = Math.max(G.minColors || 0, numColors(1)); G.mode = 'play'; G.phase = 'idle'; G.t = 0; G.chain = 0; G.maxChain = 0; G.plan = null;
      G.pops = []; G.msg = ''; G.msgT = 0; G.a = G.b = -1; G.autoT = 0; G.overT = 0; G.swaps = 0; G.pre = null; G.matched = null;
      G.g = G.randomBoard() || new Array(N).fill(0); G.off.fill(0); if (G.onNew) G.onNew();
    };
    // test helper: rows[y][z] strings are not needed in 2D: load(['abc..', ...]) top row first, '.' = empty; 3D: array of layers (top first) of row strings
    G.load = function (layers) {
      G.g = new Array(N).fill(-1);
      if (typeof layers[0] === 'string') layers = layers.map(function (r) { return [r]; });     // 2D: each string is a row (top first)
      layers.forEach(function (rows, ky) { const y = H - 1 - ky; rows.forEach(function (s, z) { for (let x = 0; x < s.length; x++) if (s[x] !== '.') G.g[idx(x, y, z)] = +s[x]; }); });
      G.mode = 'play'; G.phase = 'idle'; G.off.fill(0); G.chain = 0; G.plan = null; G.pops = [];
    };

    // ---------- play ----------
    G.trySwap = function (a, b) {
      if (G.mode !== 'play' || G.phase !== 'idle') return false;
      if (!G.adjacent(a, b) || !G.sel[a] || !G.sel[b] || G.g[a] < 0 || G.g[b] < 0) return false;
      G.a = a; G.b = b; G.t = 0; G.plan = null;
      if (G.swapMakesMatch(G.g, a, b)) { G.moves--; G.swaps++; G.chain = 0; G.maxChain = 0; G.phase = 'swap'; G.T = 0.16; return 'ok'; }
      G.bads = (G.bads || 0) + 1; G.phase = 'bad'; G.T = 0.36; return 'bad';
    };
    function beginStep() {
      const m = G.findMatches(G.g);
      if (!m.count || G.chain >= 60) return false;
      G.chain++; if (G.chain > G.maxChain) G.maxChain = G.chain;
      const raw = (m.count * 10 + m.bonus) * G.chain;
      G.frac += raw; const gain = Math.floor(G.frac / G.scoreDiv); G.frac -= gain * G.scoreDiv; G.score += gain; G.pre = G.g.slice(); G.matched = m.mark;
      let sx = 0, sy = 0, sz = 0; for (let i = 0; i < N; i++) if (m.mark[i]) { sx += X(i); sy += Y(i); sz += Z(i); }
      G.pops.push({ x: sx / m.count, y: sy / m.count, z: sz / m.count, text: '+' + gain + (G.chain > 1 ? ' x' + G.chain : ''), t: 0, chain: G.chain });
      G.stepInfo = { count: m.count, bonus: m.bonus, gain: gain, chain: G.chain };
      if (G.chain === 4) { G.moves++; G.msg = (KO ? '연쇄! 이동 +1' : 'CHAIN! +1 MOVE'); G.msgT = 1.2; }
      for (let i = 0; i < N; i++) if (m.mark[i]) G.g[i] = -1;
      G.off.fill(0); G.fall(G.g, G.off, G.nextGem);
      G.sp = G.chain >= 10 ? 0.1 : Math.max(0.5, 1 - 0.12 * (G.chain - 1)); G.phase = 'vanish'; G.t = 0; G.T = 0.22 * G.sp;      // later chain steps play faster
      return true;
    }
    function finish() {                       // the board is stable: level up / game over / reshuffle
      G.chain = 0; G.pre = null; G.matched = null;
      let up = false;
      while (G.score >= G.target) { G.level++; G.moves += LEVEL_MOVES; G.target = G.tgt(G.level); up = true; }
      G.nc = Math.max(G.minColors || 0, numColors(G.level));
      if (up) { G.msg = (KO ? '레벨 ' : 'LEVEL ') + G.level + (KO ? '  이동 +' : '  +') + LEVEL_MOVES + (KO ? '' : ' MOVES'); G.msgT = 1.8; }
      G.saveBest();
      if (G.moves <= 0) { G.mode = 'over'; G.phase = 'idle'; G.overT = 0; G.plan = null; G.pendingHint = false; return; }
      G.phase = 'idle'; G.t = 0;
      if (G.validMoves().length === 0) G.reshuffle();
    }
    G.finish = finish;
    // test helper: settle the whole chain synchronously (no animation)
    G.settleSync = function () { let n = 0; while (beginStep() && n++ < 200) {} finish(); G.phase = 'idle'; G.off.fill(0); return G.score; };
    G.applySwapSync = function (a, b) { const r = G.trySwap(a, b); if (r !== 'ok') { G.phase = 'idle'; return r; } const t = G.g[a]; G.g[a] = G.g[b]; G.g[b] = t; G.settleSync(); return r; };

    G.update = function (dt) {
      for (const p of G.pops) p.t += dt; G.pops = G.pops.filter(function (p) { return p.t < 1.1; });
      if (G.msgT > 0) G.msgT -= dt;
      G.t += dt;
      if (G.mode === 'over') {
        if (G.auto) { G.overT += dt; if (G.overT > 2.2) { G.newGame(); } }
        return;
      }
      if (G.mode !== 'play') return;
      if (G.phase === 'swap') { if (G.t >= G.T) { const t = G.g[G.a]; G.g[G.a] = G.g[G.b]; G.g[G.b] = t; G.a = G.b = -1; if (!beginStep()) finish(); } }
      else if (G.phase === 'bad') { if (G.t >= G.T) { G.phase = 'idle'; G.a = G.b = -1; G.t = 0; } }
      else if (G.phase === 'vanish') { if (G.t >= G.T) { G.phase = 'fall'; G.t = 0; let mx = 0; for (let i = 0; i < N; i++) if (G.off[i] > mx) mx = G.off[i]; G.grav = G.GRAV / (G.sp * G.sp); G.T = Math.sqrt(2 * mx / G.grav) + 0.06 * G.sp; G.pre = null; } }
      else if (G.phase === 'fall') { if (G.t >= G.T) { G.off.fill(0); if (!beginStep()) finish(); } }
      else if (G.phase === 'shuffle') { if (G.t >= G.T) { G.phase = 'idle'; G.t = 0; } }
      if (G.mode === 'play' && G.phase === 'idle') {
        if (G.plan) { G.plan.t -= dt; if (G.plan.t <= 0) { const p = G.plan; G.plan = null; G.trySwap(p.a, p.b); } }
        else if (G.pendingHint) { G.pendingHint = false; G.makePlan(0.7); }
        else if (G.auto) { G.autoT += dt; if (G.autoT > 0.3) { G.autoT = 0; G.makePlan(G.autoDelay || 0.4); } }
      }
    };
    G.GRAV = 55; G.sp = 1; G.grav = 55;           // cells / s^2
    G.makePlan = function (delay) {
      const b = G.bestMove(); if (!b) return false;
      G.plan = { a: b.a, b: b.b, t: delay, T: delay }; if (G.onPlan) G.onPlan(G.plan); return true;
    };

    // ---------- what to draw ----------
    // [{ i, x, y, z (float cell coords), c, s (scale), a (alpha), v (vanishing) }]
    G.items = function () {
      const out = [], ph = G.phase, src = (ph === 'vanish' && G.pre) ? G.pre : G.g, p = G.T > 0 ? Math.min(1, G.t / G.T) : 1;
      for (let i = 0; i < N; i++) {
        const c = src[i]; if (c < 0) continue;
        let x = X(i), y = Y(i), z = Z(i), s = 1, a = 1, v = 0;
        if (ph === 'vanish' && G.matched && G.matched[i]) { s = 1 - p * 0.9; a = 1 - p * 0.4; v = p; }
        else if (ph === 'fall') { const o = G.off[i]; if (o > 0) y += Math.max(0, o - 0.5 * (G.grav || G.GRAV) * G.t * G.t); }
        else if (ph === 'shuffle') s = Math.min(1, p * 1.6);
        else if ((ph === 'swap' || ph === 'bad') && (i === G.a || i === G.b)) {
          const o = i === G.a ? G.b : G.a, f = ph === 'swap' ? p : 1 - Math.abs(2 * p - 1);
          const e = f * f * (3 - 2 * f);
          x += (X(o) - x) * e; y += (Y(o) - y) * e; z += (Z(o) - z) * e;
          if (ph === 'bad') { const sh = Math.sin(p * 40) * 0.05 * (1 - p); x += sh; }
        }
        out.push({ i: i, x: x, y: y, z: z, c: c, s: s, a: a, v: v });
      }
      return out;
    };
    G.busy = function () { return G.phase !== 'idle'; };

    // ---------- shell / browser hooks: auto play (F3), hint (F4) ----------
    G.setAuto = function (v) { v = !!v; if (G.auto === v) return; G.auto = v; G.autoT = 0; G.notifyAuto(); };
    G.notifyAuto = function () { try { if (window.parent !== window) window.parent.postMessage({ swap: 'autoState', on: G.auto }, '*'); } catch (e) {} };
    G.install = function () {
      window.toggleAuto = function () {
        if (G.mode !== 'play') { G.newGame(); G.setAuto(true); return true; }
        G.plan = null; G.pendingHint = false; G.setAuto(!G.auto); return G.auto;
      };
      window.giveHint = function () {
        if (G.mode !== 'play') G.newGame();
        if (G.auto || G.plan || G.pendingHint) return false;
        if (G.phase !== 'idle') { G.pendingHint = true; return true; }      // wait until the board has settled, then do exactly one best swap
        return G.makePlan(0.8);
      };
      window.addEventListener('message', function (e) { const m = e.data; if (!m || !m.swapCmd) return; if (m.swapCmd === 'auto') window.toggleAuto(); else if (m.swapCmd === 'hint') window.giveHint(); });
      window.addEventListener('keydown', function (e) { if (e.key === 'F3') { e.preventDefault(); window.toggleAuto(); } else if (e.key === 'F4') { e.preventDefault(); window.giveHint(); } });
    };
    return G;
  }
  window.SW = { KO: KO, make: make, numColors: numColors, targetOf: targetOf, START_MOVES: START_MOVES, LEVEL_MOVES: LEVEL_MOVES };
})();
