// Maze Chomper simulation (2D rectangular maze and 3D cuboid maze share one graph based engine) + the auto-player planner.
// Positions: an actor is on the edge cell a -> nb[a][d] with progress p in [0,1). Directions: d>>1 = axis (0 x, 1 y, 2 z), d&1 ? negative : positive.
(function () {
'use strict';
const HALF_A = [
  '###########', '#..........', '#.##.###.#.', '#o##.###.#.', '#..........', '#.##.#.###.', '#....#.....', '####.#.###.',
  '####.#.###.', '####.......', '####.#####-', '    .###HHH', '####.######', '####.......', '####.#.###.', '#....#.....',
  '#o##.###.#.', '#.##.###.#.', '#..........', '#.##.#.###.', '#.##.#.###.', '#..........', '###########'];
const DV = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- mazes
function finishMaze(m) {
  const N = m.N, ND = m.ND;
  function bfs(src) { const dist = new Int32Array(N).fill(-1), q = [src]; dist[src] = 0; for (let h = 0; h < q.length; h++) { const u = q[h]; for (let d = 0; d < ND; d++) { const v = m.nb[u * ND + d]; if (v >= 0 && dist[v] < 0) { dist[v] = dist[u] + 1; q.push(v); } } } return dist; }
  function hops(target) { const dist = bfs(target), hop = new Int8Array(N).fill(-1); for (let u = 0; u < N; u++) { if (dist[u] <= 0) continue; for (let d = 0; d < ND; d++) { const v = m.nb[u * ND + d]; if (v >= 0 && dist[v] === dist[u] - 1) { hop[u] = d; break; } } } return hop; }
  m.hopHome = hops(m.home); m.hopExit = hops(m.exit);
  m.coordOf = function (i, out) { out = out || []; for (let k = 0; k < m.D; k++) out[k] = m.coord[i * m.D + k]; return out; };
  m.idx = function (x, y, z) { return m.D === 2 ? y * m.dims[0] + x : x + m.dims[0] * (y + m.dims[1] * z); };
  return m;
}
function maze2D(variant) {
  let half = HALF_A.slice();
  if (variant === 1) { const f = HALF_A; for (let y = 1; y <= 8; y++) half[y] = f[22 - y]; for (let y = 14; y <= 21; y++) half[y] = f[22 - y]; }
  const rows = half.map(function (r) { return r + r.slice(0, 10).split('').reverse().join(''); });
  const W = 21, H = 23, N = W * H, ND = 4;
  const m = { D: 2, dims: [W, H], N: N, ND: ND, rows: rows, nb: new Int32Array(N * ND).fill(-1), wrap: new Uint8Array(N * ND), pen: new Uint8Array(N), tun: new Uint8Array(N), open: new Uint8Array(N), dot0: new Uint8Array(N), coord: new Int16Array(N * 2), variant: variant };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, ch = rows[y][x]; m.coord[i * 2] = x; m.coord[i * 2 + 1] = y;
    if (ch === '#') continue;
    m.open[i] = 1; if (ch === 'H' || ch === '-') m.pen[i] = 1; if (ch === '.') m.dot0[i] = 1; if (ch === 'o') m.dot0[i] = 2; if (ch === ' ') m.tun[i] = 1;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!m.open[i]) continue;
    for (let d = 0; d < 4; d++) {
      let nx = x + DV[d][0], ny = y + DV[d][1], w = 0;
      if (nx < 0) { nx = W - 1; w = 1; } else if (nx >= W) { nx = 0; w = 1; }
      if (ny < 0 || ny >= H) continue;
      const j = ny * W + nx; if (!m.open[j]) continue;
      m.nb[i * 4 + d] = j; m.wrap[i * 4 + d] = w;
    }
  }
  m.exit = 9 * W + 10; m.home = 11 * W + 10; m.door = 10 * W + 10;
  let sy = 15; while (!m.open[sy * W + 9]) sy++;
  m.start = sy * W + 10; m.startDir = 1; m.fruit = 13 * W + 10;
  m.scatter = [[18, -3], [2, -3], [20, 25], [0, 25]];
  m.ghostCells = [m.exit, 11 * W + 9, 11 * W + 10, 11 * W + 11];
  m.nGhosts = 4; m.pellets = 4; m.name = variant ? 'B' : 'A';
  return finishMaze(m);
}
function maze3D(seed) {
  const rnd = mulberry32(seed * 7919 + 13), X = 7, Y = 5, Z = 7, N = X * Y * Z, ND = 6;
  const idx = function (x, y, z) { return x + X * (y + Y * z); };
  const m = { D: 3, dims: [X, Y, Z], N: N, ND: ND, nb: new Int32Array(N * ND).fill(-1), wrap: new Uint8Array(N * ND), pen: new Uint8Array(N), tun: new Uint8Array(N), open: new Uint8Array(N).fill(1), dot0: new Uint8Array(N).fill(1), coord: new Int16Array(N * 3), seed: seed };
  for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) { const i = idx(x, y, z); m.coord[i * 3] = x; m.coord[i * 3 + 1] = y; m.coord[i * 3 + 2] = z; }
  const home = idx(3, 2, 3), exit = idx(3, 3, 3), start = idx(3, 0, 5);
  function adj(i, d) { const x = m.coord[i * 3] + DV[d][0], y = m.coord[i * 3 + 1] + DV[d][1], z = m.coord[i * 3 + 2] + DV[d][2]; return x < 0 || y < 0 || z < 0 || x >= X || y >= Y || z >= Z ? -1 : idx(x, y, z); }
  function link(i, d) { const j = adj(i, d); m.nb[i * 6 + d] = j; m.nb[j * 6 + (d ^ 1)] = i; }
  const seen = new Uint8Array(N); seen[home] = 1; seen[start] = 1; const st = [start];
  while (st.length) {
    const u = st[st.length - 1], c = []; for (let d = 0; d < 6; d++) { const v = adj(u, d); if (v >= 0 && !seen[v]) c.push(d); }
    if (!c.length) { st.pop(); continue; }
    const d = c[Math.floor(rnd() * c.length)]; link(u, d); seen[adj(u, d)] = 1; st.push(adj(u, d));
  }
  link(exit, 3);       // exit -> home (down, -y)
  m.pen[home] = 1;
  const closed = []; for (let i = 0; i < N; i++) for (let d = 0; d < 6; d += 2) { const j = adj(i, d); if (j >= 0 && m.nb[i * 6 + d] < 0 && i !== home && j !== home) closed.push([i, d]); }
  for (let i = closed.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)), t = closed[i]; closed[i] = closed[k]; closed[k] = t; }
  const loops = Math.round(N * 0.2); for (let k = 0; k < loops && k < closed.length; k++) link(closed[k][0], closed[k][1]);
  function deg(i) { let n = 0; for (let d = 0; d < 6; d++) { const j = m.nb[i * 6 + d]; if (j >= 0 && j !== home) n++; } return n; }
  for (let i = 0; i < N; i++) {
    if (i === home) continue;
    let guard = 0;
    while (deg(i) < 2 && guard++ < 6) { const c = []; for (let d = 0; d < 6; d++) { const j = adj(i, d); if (j >= 0 && j !== home && m.nb[i * 6 + d] < 0) c.push(d); } if (!c.length) break; link(i, c[Math.floor(rnd() * c.length)]); }
  }
  m.dot0[home] = 0; m.dot0[start] = 0;
  [idx(0, 0, 0), idx(6, 0, 6), idx(0, 4, 6), idx(6, 4, 0)].forEach(function (i) { m.dot0[i] = 2; });
  m.home = home; m.exit = exit; m.start = start; m.startDir = 0; m.fruit = idx(3, 4, 3);
  m.scatter = [[-3, -3, -3], [10, -3, 10], [-3, 8, 10]];
  m.ghostCells = [exit, home, home]; m.nGhosts = 3; m.pellets = 4; m.name = '3D';
  return finishMaze(m);
}

// ---------------------------------------------------------------- level parameters
function levelParams(D, L) {
  const k = Math.min(L - 1, 14), u = D === 2 ? 8.0 : 4.2, sc = Math.max(0.35, 1 - 0.12 * (L - 1));
  return {
    u: u, vC: u * Math.min(1.0, 0.8 + 0.02 * k), vG: u * Math.min(0.97, 0.72 + 0.035 * k), vF: u * Math.max(0.32, 0.5 - 0.02 * k), vT: u * 0.42, vE: u * 2.0,
    frDur: D === 2 ? Math.max(1.5, 7 - 0.55 * k) : Math.max(3, 9 - 0.5 * k), flash: 2.0,
    sched: [7 * sc, 20, 7 * sc, 20, 5 * sc, 20, 5 * sc, Infinity], rel: [0, 3.5, 7, 10.5].map(function (v) { return v * Math.max(0.4, 1 - 0.1 * k); })
  };
}
const FRUIT_PTS = [100, 300, 500, 700, 1000, 2000, 3000, 5000];

// ---------------------------------------------------------------- simulation
function make(opts) {
  opts = opts || {};
  const D = opts.D || 2, ND = D * 2;
  const s = { D: D, ND: ND, rnd: mulberry32(opts.seed || 1), seedBase: opts.seed || 1, events: [], popups: [], best: 0 };
  const nbOf = function (a, d) { return s.maze.nb[a * ND + d]; };
  function pos(e, out) {
    const m = s.maze; out = out || [0, 0, 0]; const a = e.a, d = e.d, p = e.p;
    for (let k = 0; k < D; k++) out[k] = m.coord[a * D + k];
    if (d >= 0 && p > 0) { const ax = d >> 1; out[ax] += (d & 1 ? -p : p); if (D === 2 && ax === 0) { const W = m.dims[0]; out[0] = ((out[0] % W) + W) % W; } }
    return out;
  }
  function dist(A, B) {
    let q = 0; for (let k = 0; k < D; k++) { let dd = Math.abs(A[k] - B[k]); if (D === 2 && k === 0) dd = Math.min(dd, s.maze.dims[0] - dd); q += dd * dd; } return Math.sqrt(q);
  }
  s.pos = pos; s.dist = dist; s.nbOf = nbOf;

  s.newGame = function () { s.score = 0; s.lives = 3; s.level = 0; s.extraGiven = false; s.over = false; s.startLevel(1); };
  s.startLevel = function (L) {
    s.level = L; s.params = levelParams(D, L);
    s.maze = D === 2 ? maze2D((L - 1) & 1) : maze3D(s.seedBase * 131 + L);
    const m = s.maze; s.dots = Uint8Array.from(m.dot0); s.dotsLeft = 0; for (let i = 0; i < m.N; i++) if (s.dots[i]) s.dotsLeft++;
    s.dotsTotal = s.dotsLeft; s.dotsEaten = 0; s.fruit = null; s.fruitCount = 0; s.popups.length = 0;
    s.resetActors(); s.phase = 'ready'; s.phaseT = 2.2; s.events.push({ t: 'ready' });
  };
  s.resetActors = function () {
    const m = s.maze, P = s.params;
    s.chomper = { a: m.start, d: m.startDir, p: 0, q: -1, moving: false, dying: 0, trav: 0 };
    if (m.nb[m.start * ND + m.startDir] < 0) { for (let d = 0; d < ND; d++) if (m.nb[m.start * ND + d] >= 0) { s.chomper.d = d; break; } }
    s.chomper.moving = true;
    s.ghosts = [];
    for (let i = 0; i < m.nGhosts; i++) {
      const g = { id: i, kind: i, a: m.ghostCells[i], d: -1, p: 0, state: i === 0 ? 'norm' : 'pen', fr: false, rev: false, rel: P.rel[i], off: i };
      if (i === 0) { g.d = 1; if (m.nb[g.a * ND + g.d] < 0) g.d = -1; if (D === 3) g.d = -1; }
      s.ghosts.push(g);
    }
    s.mode = 'scatter'; s.modeIdx = 0; s.modeT = P.sched[0]; s.frT = 0; s.combo = 0; s.idle = 0; s.freeze = 0; s.fruit = null;
  };
  s.setQueue = function (d) { if (s.chomper) s.chomper.q = d; };

  // ---- chomper
  function open4(a, d) { const j = s.maze.nb[a * ND + d]; return j >= 0 && !s.maze.pen[j]; }
  function stepChomper(dt) {
    const c = s.chomper, m = s.maze; let adv = s.params.vC * dt, guard = 0;
    // an immediate reversal is allowed any time
    if (c.q >= 0 && c.q === (c.d ^ 1)) {
      if (c.p > 0) { const to = nbOf(c.a, c.d); if (to >= 0) { c.a = to; c.d ^= 1; c.p = 1 - c.p; c.q = -1; c.moving = true; } }
      else if (open4(c.a, c.q)) { c.d = c.q; c.q = -1; c.moving = true; }
    }
    while (adv > 1e-9 && guard++ < 6) {
      if (!c.moving) {
        let nd = -1; if (c.q >= 0 && open4(c.a, c.q)) nd = c.q; else if (open4(c.a, c.d)) nd = c.d;
        if (nd < 0) { c.p = 0; break; } c.d = nd; if (c.q === nd) c.q = -1; c.moving = true;
      }
      const to = nbOf(c.a, c.d); if (to < 0 || m.pen[to]) { c.moving = false; c.p = 0; continue; }
      const rem = 1 - c.p;
      if (adv < rem) { c.p += adv; c.trav += adv; adv = 0; break; }
      adv -= rem; c.trav += rem; c.a = to; c.p = 0;
      eatAt(c.a);
      if (c.q >= 0 && open4(c.a, c.q)) { c.d = c.q; c.q = -1; }
      else if (!open4(c.a, c.d)) c.moving = false;
      if (c.q === c.d) c.q = -1;
    }
    const nearest = c.p >= 0.5 ? nbOf(c.a, c.d) : c.a; if (nearest >= 0) eatAt(nearest);
  }
  function addScore(v) {
    s.score += v;
    if (!s.extraGiven && s.score >= 10000) { s.extraGiven = true; s.lives++; s.events.push({ t: 'extra' }); }
    if (s.score > s.best) s.best = s.score;
  }
  function eatAt(i) {
    const k = s.dots[i];
    if (k) {
      s.dots[i] = 0; s.dotsLeft--; s.dotsEaten++; s.idle = 0;
      if (k === 1) { addScore(10); s.events.push({ t: 'dot', i: i }); }
      else { addScore(50); s.events.push({ t: 'pellet', i: i }); powerUp(); }
      checkFruitSpawn();
    }
    if (s.fruit && s.fruit.cell === i) {
      const pts = FRUIT_PTS[Math.min(s.fruit.kind, 7)]; addScore(pts); s.popups.push({ i: i, txt: String(pts), t: 1.4 }); s.events.push({ t: 'fruit', pts: pts }); s.fruit = null;
    }
  }
  function powerUp() {
    const P = s.params; s.combo = 0; s.frT = P.frDur;
    for (const g of s.ghosts) { if (g.state === 'eyes') continue; g.fr = true; if (g.state === 'norm') flip(g); }
  }
  function checkFruitSpawn() {
    const th = s.D === 2 ? [70, 140] : [Math.round(s.dotsTotal / 3), Math.round(s.dotsTotal * 2 / 3)];
    if (s.fruitCount < 2 && s.dotsEaten >= th[s.fruitCount] && !s.fruit) { s.fruit = { cell: s.maze.fruit, t: 9.5, kind: (s.level - 1) % 8 }; s.fruitCount++; s.events.push({ t: 'fruitOn' }); }
  }
  function flip(g) {
    if (g.d < 0) return;
    if (g.p > 0) { const to = nbOf(g.a, g.d); if (to >= 0) { g.a = to; g.d ^= 1; g.p = 1 - g.p; } } else { if (open4(g.a, g.d ^ 1)) g.d ^= 1; }
  }

  // ---- ghosts
  const PRI2 = [3, 1, 2, 0], PRI3 = [3, 1, 5, 2, 0, 4];
  s.ghostTarget = function (g, out) {
    const m = s.maze, c = s.chomper; out = out || [0, 0, 0];
    if (s.mode === 'scatter') { const t = m.scatter[g.id]; for (let k = 0; k < D; k++) out[k] = t[k]; return out; }
    const cp = pos(c, [0, 0, 0]), dv = DV[c.d] || DV[0];
    switch (g.kind) {
      case 0: for (let k = 0; k < D; k++) out[k] = cp[k]; break;
      case 1: { const K = D === 2 ? 4 : 3; for (let k = 0; k < D; k++) out[k] = cp[k] + dv[k] * K; break; }
      case 2: { const r = pos(s.ghosts[0], [0, 0, 0]); for (let k = 0; k < D; k++) { const piv = cp[k] + dv[k] * 2; out[k] = piv + (piv - r[k]); } break; }
      default: {
        const gp = pos(g, [0, 0, 0]);
        if (dist(gp, cp) > 8) { for (let k = 0; k < D; k++) out[k] = cp[k]; } else { const t = m.scatter[g.id]; for (let k = 0; k < D; k++) out[k] = t[k]; }
      }
    }
    return out;
  };
  function pickDir(g) {
    const m = s.maze, a = g.a;
    if (g.state === 'eyes') return a === m.home ? -1 : m.hopHome[a];
    if (g.state === 'exit') return m.hopExit[a];
    if (g.rev) { g.rev = false; if (g.d >= 0 && open4(a, g.d ^ 1)) return g.d ^ 1; }
    const pri = D === 2 ? PRI2 : PRI3, back = g.d >= 0 ? g.d ^ 1 : -1, cand = [];
    for (let i = 0; i < pri.length; i++) { const d = pri[i]; if (d !== back && open4(a, d)) cand.push(d); }
    if (!cand.length) return back >= 0 && open4(a, back) ? back : -1;
    if (cand.length === 1) return cand[0];
    if (g.fr) return cand[Math.floor(s.rnd() * cand.length)];
    const t = s.ghostTarget(g, [0, 0, 0]); let best = cand[0], bd = Infinity;
    for (const d of cand) { const j = nbOf(a, d); let q = 0; for (let k = 0; k < D; k++) { let dd = m.coord[j * D + k] - t[k]; q += dd * dd; } if (q < bd - 1e-9) { bd = q; best = d; } }
    return best;
  }
  function gSpeed(g) {
    const P = s.params;
    if (g.state === 'eyes') return P.vE; if (g.state === 'exit') return P.vG * 0.7;
    if (g.fr) return P.vF; if (s.maze.tun[g.a]) return P.vT; return P.vG;
  }
  function stepGhost(g, dt) {
    const m = s.maze;
    if (g.state === 'pen') return;
    let adv = gSpeed(g) * dt, guard = 0;
    while (adv > 1e-9 && guard++ < 6) {
      if (g.d < 0) {
        if (g.state === 'eyes' && g.a === m.home) { g.state = 'exit'; g.fr = false; continue; }
        if (g.state === 'exit' && g.a === m.exit) { g.state = 'norm'; continue; }
        g.d = pickDir(g); if (g.d < 0) break;
      }
      const to = nbOf(g.a, g.d); if (to < 0) { g.d = -1; continue; }
      const rem = 1 - g.p;
      if (adv < rem) { g.p += adv; break; }
      adv -= rem; g.a = to; g.p = 0;
      if (g.state === 'eyes' && g.a === m.home) { g.state = 'exit'; g.fr = false; g.d = m.hopExit[g.a]; continue; }
      if (g.state === 'exit' && g.a === m.exit) g.state = 'norm';
      g.d = pickDir(g);
    }
  }
  function releaseGhost(g) { g.state = 'exit'; g.d = s.maze.hopExit[g.a]; g.p = 0; if (g.a === s.maze.exit) { g.state = 'norm'; g.d = pickDir(g); } }

  // ---- main step
  s.step = function (dt) {
    s.time = (s.time || 0) + dt;
    for (let i = s.popups.length - 1; i >= 0; i--) { s.popups[i].t -= dt; if (s.popups[i].t <= 0) s.popups.splice(i, 1); }
    if (s.phase === 'ready') { s.phaseT -= dt; if (s.phaseT <= 0) s.phase = 'play'; return; }
    if (s.phase === 'dying') {
      s.phaseT -= dt; s.chomper.dying = Math.min(1, 1 - s.phaseT / 1.6);
      if (s.phaseT <= 0) { s.lives--; if (s.lives <= 0) { s.phase = 'over'; s.over = true; s.events.push({ t: 'over' }); } else { s.resetActors(); s.phase = 'ready'; s.phaseT = 2.0; s.events.push({ t: 'ready' }); } }
      return;
    }
    if (s.phase === 'clear') { s.phaseT -= dt; if (s.phaseT <= 0) s.startLevel(s.level + 1); return; }
    if (s.phase !== 'play') return;
    if (s.freeze > 0) { s.freeze -= dt; return; }
    const P = s.params;
    // frightened timer / scatter-chase schedule (the schedule pauses while frightened)
    if (s.frT > 0) { s.frT -= dt; if (s.frT <= 0) { s.frT = 0; for (const g of s.ghosts) g.fr = false; } }
    else if (s.modeT !== Infinity) {
      s.modeT -= dt;
      if (s.modeT <= 0) { s.modeIdx++; s.mode = s.modeIdx % 2 ? 'chase' : 'scatter'; s.modeT = P.sched[Math.min(s.modeIdx, P.sched.length - 1)]; for (const g of s.ghosts) if (g.state === 'norm') g.rev = true; s.events.push({ t: 'mode', mode: s.mode }); }
    }
    s.idle += dt;
    for (const g of s.ghosts) if (g.state === 'pen') { g.rel -= dt; if (g.rel <= 0 || s.idle > 4) { releaseGhost(g); s.idle = 0; } }
    if (s.fruit) { s.fruit.t -= dt; if (s.fruit.t <= 0) s.fruit = null; }
    stepChomper(dt);
    for (const g of s.ghosts) stepGhost(g, dt);
    // collisions
    const cp = pos(s.chomper, [0, 0, 0]);
    for (const g of s.ghosts) {
      if (g.state === 'eyes' || g.state === 'pen') continue;
      const gp = pos(g, [0, 0, 0]);
      if (dist(cp, gp) < 0.62) {
        if (g.fr) {
          const pts = 200 * Math.pow(2, Math.min(s.combo, 3)); s.combo++; addScore(pts); g.state = 'eyes'; g.fr = false; g.rev = false;
          s.popups.push({ i: g.a, ox: gp, txt: String(pts), t: 1.0 }); s.events.push({ t: 'ghost', pts: pts }); s.freeze = 0.5;
          if (g.d >= 0) { const to = nbOf(g.a, g.d); }
          if (g.d < 0 || g.p > 0) { /* eyes continue from where they are; direction recomputed at the next node */ }
        } else { s.phase = 'dying'; s.phaseT = 1.6; s.events.push({ t: 'death' }); return; }
      }
    }
    if (s.dotsLeft <= 0) { s.phase = 'clear'; s.phaseT = 2.4; s.events.push({ t: 'clear' }); }
  };
  s.cellAt = function (x, y, z) { return s.maze.idx(x, y, z || 0); };
  s.placeChomper = function (cell, d) { const c = s.chomper; c.a = cell; c.d = d; c.p = 0; c.q = -1; c.moving = true; };
  s.placeGhost = function (i, cell, d, state, fr) { const g = s.ghosts[i]; g.a = cell; g.d = d; g.p = 0; g.state = state || 'norm'; g.fr = !!fr; g.rev = false; };
  s.fastForward = function (n, dt) { dt = dt || 1 / 60; for (let i = 0; i < n; i++) s.step(dt); };
  s.clone = function () {
    const c = make({ D: D, seed: 777, bare: true });
    c.maze = s.maze; c.params = s.params; c.level = s.level; c.dots = Uint8Array.from(s.dots); c.dotsLeft = s.dotsLeft; c.dotsEaten = s.dotsEaten; c.dotsTotal = s.dotsTotal;
    c.fruit = s.fruit ? Object.assign({}, s.fruit) : null; c.fruitCount = s.fruitCount; c.score = s.score; c.lives = s.lives; c.extraGiven = s.extraGiven; c.over = s.over;
    c.phase = s.phase; c.phaseT = s.phaseT; c.chomper = Object.assign({}, s.chomper); c.ghosts = s.ghosts.map(function (g) { return Object.assign({}, g); });
    c.mode = s.mode; c.modeIdx = s.modeIdx; c.modeT = s.modeT; c.frT = s.frT; c.combo = s.combo; c.idle = s.idle; c.freeze = s.freeze; c.time = s.time; c._lastRev = s._lastRev; c.best = s.best;
    return c;
  };
  if (!opts.bare) s.newGame();
  return s;
}

// ---------------------------------------------------------------- auto player / hint planner
// Plans over the maze graph: ghost arrival times (excluding their reverse move) define which cells are safe for the chomper at the time it
// gets there; among the safe cells the plan with the best (value / time) wins; it hunts frightened chasers and eats power pellets when threatened.
function plan(s, opt) {
  opt = opt || {};
  const m = s.maze, ND = s.ND, N = m.N, nb = m.nb, c = s.chomper, P = s.params, vc = P.vC, step = 1 / vc, D = s.D;
  // ---- ghost arrival times
  const dmin = new Float32Array(N).fill(1e9), tmp = new Float32Array(N);
  let nearThreat = 99, nearCount = 0;
  const cpos = s.pos(c, [0, 0, 0]);
  function ghostBFS(startNode, t0, banNode, vg) {
    tmp.fill(1e9); const q = [startNode]; tmp[startNode] = t0;
    for (let h = 0; h < q.length; h++) {
      const u = q[h]; const tu = tmp[u];
      for (let d = 0; d < ND; d++) { const v = nb[u * ND + d]; if (v < 0 || m.pen[v]) continue; if (u === startNode && v === banNode) continue; if (tmp[v] > tu + 1 / vg + 1e-6) { tmp[v] = tu + 1 / vg; q.push(v); } }
    }
    for (let i = 0; i < N; i++) if (tmp[i] < dmin[i]) dmin[i] = tmp[i];
  }
  const prey = [];
  for (const g of s.ghosts) {
    if (g.state === 'eyes') continue;
    const vg = g.fr ? P.vF : P.vG;
    if (g.fr) {
      if (g.state === 'norm' || g.state === 'exit') prey.push(g);
      const to2 = g.d >= 0 ? nb[g.a * ND + g.d] : -1;       // it becomes dangerous again when the effect ends
      if (to2 >= 0) ghostBFS(to2, Math.max(s.frT, (1 - g.p) / vg), -1, P.vG); else ghostBFS(g.a, s.frT, -1, P.vG);
      continue;
    }
    if (g.state === 'pen') { if (g.rel < 3) ghostBFS(m.exit, g.rel + 0.5, -1, vg); continue; }
    if (g.state === 'exit') { ghostBFS(m.exit, 0.4, -1, vg); continue; }
    if (g.d < 0) { ghostBFS(g.a, 0, -1, vg); continue; }
    const to = nb[g.a * ND + g.d]; if (to < 0) { ghostBFS(g.a, 0, -1, vg); continue; }
    ghostBFS(to, (1 - g.p) / vg, g.a, vg);
    const dd = s.dist(cpos, s.pos(g, [0, 0, 0])); if (dd < nearThreat) nearThreat = dd; if (dd < 7) nearCount++;
  }
  // ---- values
  const val = new Float32Array(N);
  const pelletWanted = s.frT <= 0 && ((nearCount >= 2 && nearThreat < 7) || nearThreat < 4);
  for (let i = 0; i < N; i++) { const k = s.dots[i]; if (k === 1) val[i] = 10; else if (k === 2) val[i] = pelletWanted ? 140 + 60 * Math.max(0, 6 - nearThreat) : 3; }
  if (s.fruit) val[s.fruit.cell] += 120 + 40 * s.fruit.kind;
  const hunt = new Float32Array(N);
  if (s.frT > 0.8) for (const g of prey) { const to = g.d >= 0 ? nb[g.a * ND + g.d] : g.a; const pts = 200 * Math.pow(2, Math.min(s.combo, 3)); hunt[g.a] += pts * 0.6; if (to >= 0) hunt[to] += pts; }
  // ---- seeds
  const seeds = []; let to = -1;
  if (c.moving && c.d >= 0) to = nb[c.a * ND + c.d];
  const canSteer = opt.canSteer;
  if (to >= 0 && !m.pen[to]) {
    seeds.push({ n: to, t: (1 - c.p) / vc, lab: -2 });
    if (!opt.noRev && s.time - (s._lastRev || -9) > 1.2 && (!canSteer || canSteer(c.d ^ 1))) seeds.push({ n: c.a, t: c.p / vc, lab: c.d ^ 1, rev: true });
  } else seeds.push({ n: c.a, t: 0, lab: -2 });
  let T, LAB, PAR, CUM, K, REV, PM, ORDER, done;
  function search(margin) {
    T = new Float32Array(N).fill(1e9); LAB = new Int16Array(N).fill(-9); PAR = new Int32Array(N).fill(-1); CUM = new Float32Array(N); K = new Int16Array(N); REV = new Uint8Array(N); PM = new Float32Array(N); ORDER = []; done = new Uint8Array(N);
  const heap = [];
  function push(n) { heap.push([T[n], n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const x = heap[p]; heap[p] = heap[i]; heap[i] = x; i = p; } }
  function pop() { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let b = i; if (l < heap.length && heap[l][0] < heap[b][0]) b = l; if (r < heap.length && heap[r][0] < heap[b][0]) b = r; if (b === i) break; const x = heap[b]; heap[b] = heap[i]; heap[i] = x; i = b; } } return top[1]; }
  for (const sd of seeds) { if (T[sd.n] > sd.t) { T[sd.n] = sd.t; LAB[sd.n] = sd.lab; PAR[sd.n] = -1; CUM[sd.n] = val[sd.n] + hunt[sd.n]; K[sd.n] = 0; PM[sd.n] = (dmin[sd.n] - sd.t) * vc; REV[sd.n] = sd.rev ? 1 : 0; push(sd.n); } }
  while (heap.length) {
    const u = pop(); if (done[u]) continue; done[u] = 1; ORDER.push(u);
    for (let d = 0; d < ND; d++) {
      const v = nb[u * ND + d]; if (v < 0 || m.pen[v] || done[v]) continue;
      const tv = T[u] + step;
      let lab = LAB[u];
      if (lab === -2) { lab = d; if (canSteer && d !== c.d && !canSteer(d)) continue; }
      if (dmin[v] <= tv + margin) continue;
      if (tv < T[v]) { T[v] = tv; LAB[v] = lab; PAR[v] = u; CUM[v] = CUM[u] + val[v] + (tv < s.frT - 0.3 ? hunt[v] : 0); K[v] = K[u] + 1; REV[v] = REV[u]; PM[v] = Math.min(PM[u], (dmin[v] - tv) * vc); push(v); }
    }
  }
  }
  const margin1 = (opt.margin !== undefined ? opt.margin : 1.1) / vc;
  search(margin1);
  // ---- choose: subtree haven (largest slack reachable through the safe tree), path slack, hysteresis
  const HV = new Float32Array(N);
  for (let i = ORDER.length - 1; i >= 0; i--) { const v = ORDER[i]; const sl = Math.min(30, (dmin[v] - T[v]) * vc); if (sl > HV[v]) HV[v] = sl; const p = PAR[v]; if (p >= 0 && HV[v] > HV[p]) HV[p] = HV[v]; }
  let bestV = -1, bs = 0;
  const cur = c.p > 0 ? nb[c.a * ND + c.d] : c.a;
  for (let v = 0; v < N; v++) {
    if (!done[v]) continue;
    let sc = CUM[v] / (T[v] * vc + 1.5);
    if (REV[v]) sc *= 0.8;
    if (v === cur && CUM[v] === 0) sc = 0;
    if (nearThreat < 12) { sc *= Math.max(0.25, Math.min(1, (PM[v] + 0.5) / 4)) * Math.max(0.3, Math.min(1, HV[v] / 5)); let dg = 0; for (let d = 0; d < ND; d++) { const w = nb[v * ND + d]; if (w >= 0 && !m.pen[w]) dg++; } if (dg <= 1) sc *= 0.3; }
    if (opt.lastQ !== undefined && opt.lastQ >= 0 && (LAB[v] === opt.lastQ || (LAB[v] === -2 && c.d === opt.lastQ))) sc *= 1.2;
    if (sc > bs) { bs = sc; bestV = v; }
  }
  const out = { q: -1, nodes: [], dirs: [], mode: 'dot', flee: false, score: bs };
  if (bestV >= 0) {
    let lab = LAB[bestV]; out.q = lab === -2 ? c.d : lab; if (REV[bestV] && opt.commit !== false) s._lastRev = s.time;
    const nodes = []; for (let v = bestV; v >= 0; v = PAR[v]) nodes.push(v); nodes.reverse(); out.nodes = nodes;
    if (hunt[bestV] > 0 && T[bestV] < s.frT - 0.3) out.mode = 'hunt'; else if (s.dots[bestV] === 2) out.mode = 'pellet';
    return out;
  }
  // ---- nothing safe: flee. Search again without the safety cut and take the path whose worst slack to the ghosts is best (pellets are welcome)
  out.flee = true; search(-1e8);
  let fb = -1e9, fv = -1; const lastQ = opt.lastQ === undefined ? -1 : opt.lastQ;
  for (let v = 0; v < N; v++) {
    if (!done[v]) continue;
    let sc = Math.min(PM[v], 6) + 0.04 * K[v];
    if (REV[v]) sc -= 1.2;
    if (s.dots[v] === 2 && s.frT <= 0) sc += 2.5;
    if (hunt[v] > 0) sc += 2;
    if (v === (c.p > 0 ? nb[c.a * ND + c.d] : c.a) && K[v] === 0) sc -= 0.5;
    if (lastQ >= 0 && (LAB[v] === lastQ || (LAB[v] === -2 && c.d === lastQ))) sc += 0.8;
    let dg = 0; for (let d = 0; d < ND; d++) { const w = nb[v * ND + d]; if (w >= 0 && !m.pen[w]) dg++; } if (dg <= 1) sc -= 1.5;
    if (sc > fb) { fb = sc; fv = v; }
  }
  if (fv >= 0) { const lab = LAB[fv]; out.q = lab === -2 ? c.d : lab; if (REV[fv] && opt.commit !== false) s._lastRev = s.time; const nodes = []; for (let v = fv; v >= 0; v = PAR[v]) nodes.push(v); nodes.reverse(); out.nodes = nodes; }
  if (out.q < 0) out.q = c.d;
  out.mode = 'flee'; return out;
}

function planSmart(s, opt) {
  opt = opt || {};
  const base = plan(s, opt);
  if (opt.rollout === false) return base;
  const c = s.chomper, m = s.maze, ND = s.ND, P = s.params, H = opt.horizon || (s.D === 2 ? 2.4 : 3.2), DT = 1 / 30;
  const to = c.moving && c.d >= 0 ? m.nb[c.a * ND + c.d] : -1;
  const cands = [base.q];
  const nodeD = to >= 0 ? to : c.a;
  for (let d = 0; d < ND; d++) { const v = m.nb[nodeD * ND + d]; if (v < 0 || m.pen[v]) continue; if (opt.canSteer && d !== c.d && !opt.canSteer(d)) continue; if (cands.indexOf(d) < 0) cands.push(d); }
  if (to >= 0 && c.p > 0 && s.time - (s._lastRev || -9) > 1.2 && (!opt.canSteer || opt.canSteer(c.d ^ 1)) && cands.indexOf(c.d ^ 1) < 0) cands.push(c.d ^ 1);
  if (cands.length < 2) return base;
  let best = base, bs = -1e9, bq = base.q;
  for (const q of cands) {
    const k = s.clone(); k.setQueue(q); let lastA = -1, died = -1, t = 0;
    const sc0 = k.score;
    for (; t < H; t += DT) {
      if (k.chomper.a !== lastA && k.phase === 'play') { lastA = k.chomper.a; if (t > 0) { const pp = plan(k, { rollout: false, commit: false }); k.setQueue(pp.q); } }
      k.step(DT);
      if (k.phase === 'dying') { died = t; break; }
      if (k.phase !== 'play') break;
    }
    let sc = k.score - sc0;
    if (died >= 0) sc -= 700 + 500 * (1 - died / H);
    else { /* survival margin: nearest threat distance at the end */ const cp = k.pos(k.chomper, [0, 0, 0]); let md = 9; for (const g of k.ghosts) if (g.state !== 'eyes' && g.state !== 'pen' && !g.fr) md = Math.min(md, k.dist(cp, k.pos(g, [0, 0, 0]))); sc += Math.min(md, 6) * 3; }
    if (q === base.q) sc += 25;
    if (sc > bs) { bs = sc; bq = q; }
  }
  if (bq !== base.q) { base.q = bq; base.mode = 'rollout'; }
  return base;
}

window.MC = { planSmart: planSmart, make: make, plan: plan, levelParams: levelParams, DV: DV, FRUIT_PTS: FRUIT_PTS, maze2D: maze2D, maze3D: maze3D, mulberry32: mulberry32 };
})();
