// Swap Puzzle 2D - 8x8 board.  Swap by dragging a gem towards a neighbour or by tapping two adjacent gems.  Rules and animation timing: core.js.
(function () {
  'use strict';
  const UI = window.SWUI, KO = UI.KO, W = 8, H = 8;
  const canvas = document.getElementById('app'), ctx = canvas.getContext('2d');
  const G = SW.make(W, H, 1, { key: 'swap2d_best', targetScale: 2 });
  const S = { cw: 0, ch: 0, bx: 0, by: 0, cs: 1, sel: -1, down: null, tex: null, hl: 0, hudBottom: 0 };
  const HINT = KO ? ['젬을 끌거나 두 칸을 차례로 눌러 서로 바꿉니다', '같은 색 3개 이상이 이어지면 사라집니다'] : ['Drag a gem or tap two neighbours to swap them', 'Connect 3 or more of the same colour'];
  G.minColors = 5;
  G.install();

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    S.cw = canvas.width = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
    S.ch = canvas.height = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
    S.cs = Math.min(S.cw * 0.96 / W, S.ch * 0.74 / H); S.bx = (S.cw - S.cs * W) / 2; S.by = S.ch * 0.225;
  }
  window.addEventListener('resize', resize);
  const px = function (x) { return S.bx + (x + 0.5) * S.cs; }, py = function (y) { return S.by + (H - y - 0.5) * S.cs; };

  function draw() {
    const cw = S.cw, ch = S.ch, cs = S.cs;
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, cw, ch);
    if (G.mode === 'start') { UI.drawStart(ctx, G, cw, ch, S.tex, '2D', HINT); return; }
    if (S.tex) { ctx.globalAlpha = 0.3; ctx.drawImage(S.tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
    S.hudBottom = UI.drawHud(ctx, G, cw, ch);
    // board
    ctx.fillStyle = 'rgba(8,10,30,0.88)'; ctx.fillRect(S.bx, S.by, cs * W, cs * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) & 1) { ctx.fillStyle = 'rgba(120,150,255,0.07)'; ctx.fillRect(S.bx + x * cs, S.by + (H - 1 - y) * cs, cs, cs); }
    ctx.save(); ctx.beginPath(); ctx.rect(S.bx, S.by, cs * W, cs * H); ctx.clip();
    const r = cs * 0.43, now = performance.now();
    for (const it of G.items()) {
      const x = px(it.x), y = py(it.y);
      if (it.v > 0) { ctx.strokeStyle = 'rgba(255,255,255,' + (1 - it.v) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * (1 + it.v * 0.6), 0, 7); ctx.stroke(); }
      UI.drawGem(ctx, x, y, r * it.s, it.c, 1, it.a);
    }
    // selection / hint highlight
    const pulse = 0.6 + 0.4 * Math.sin(now / 120);
    if (S.sel >= 0 && G.mode === 'play' && !G.busy()) { ring(S.sel, '#fff', pulse); }
    if (G.plan) { ring(G.plan.a, '#ff0', pulse); ring(G.plan.b, '#ff0', pulse); }
    for (const p of G.pops) UI.drawPop(ctx, p, px(p.x), py(p.y), cw);
    ctx.restore();
    ctx.strokeStyle = '#9ab'; ctx.lineWidth = 2; ctx.strokeRect(S.bx, S.by, cs * W, cs * H);
    UI.drawMsg(ctx, G, cw, S.by + cs * H * 0.5);
    UI.label(ctx, KO ? '드래그 또는 두 번 눌러 바꾸기  /  F3 자동  F4 힌트' : 'Drag or tap two gems to swap  /  F3 auto  F4 hint', cw / 2, S.by + cs * H + (ch - S.by - cs * H) / 2, cw * 0.03, '#999');
    if (G.mode === 'over') UI.drawOver(ctx, G, cw, ch, S.bx, S.by + cs * H * 0.18, cs * W, cs * H * 0.6);
  }
  function ring(i, col, a) { const x = px(G.X(i)), y = py(G.Y(i)); ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, S.cs * 0.07); ctx.strokeRect(x - S.cs * 0.48, y - S.cs * 0.48, S.cs * 0.96, S.cs * 0.96); ctx.restore(); }

  // ---------------- input ----------------
  function pos(e) { const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1; return { x: (e.clientX - r.left) * d, y: (e.clientY - r.top) * d }; }
  function cellAt(p) { const x = Math.floor((p.x - S.bx) / S.cs), y = H - 1 - Math.floor((p.y - S.by) / S.cs); return (x < 0 || y < 0 || x >= W || y >= H) ? -1 : G.idx(x, y, 0); }
  function doSwap(a, b) { S.sel = -1; G.setAuto(false); return G.trySwap(a, b); }
  canvas.addEventListener('pointerdown', function (e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (G.mode === 'start') { G.newGame(); return; }
    if (G.mode === 'over') { if (performance.now() - (S.overAt || 0) > 500) G.newGame(); return; }
    if (G.auto) G.setAuto(false);
    G.plan = null; G.pendingHint = false;
    const p = pos(e), c = cellAt(p);
    S.down = c >= 0 ? { c: c, x: p.x, y: p.y, done: false } : null;
  });
  canvas.addEventListener('pointermove', function (e) {
    const d = S.down; if (!d || d.done || G.mode !== 'play') return;
    const p = pos(e), dx = p.x - d.x, dy = p.y - d.y;
    if (Math.hypot(dx, dy) < S.cs * 0.4) return;
    d.done = true;
    const x = G.X(d.c), y = G.Y(d.c); let nx = x, ny = y;
    if (Math.abs(dx) > Math.abs(dy)) nx += dx > 0 ? 1 : -1; else ny += dy > 0 ? -1 : 1;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) { S.sel = -1; return; }
    doSwap(d.c, G.idx(nx, ny, 0));
  });
  window.addEventListener('pointerup', function (e) {
    const d = S.down; S.down = null; if (!d || d.done || G.mode !== 'play') return;
    if (G.busy()) return;
    const c = d.c;
    if (S.sel < 0) S.sel = c;
    else if (S.sel === c) S.sel = -1;
    else if (G.adjacent(S.sel, c)) doSwap(S.sel, c);
    else S.sel = c;
  });
  window.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && G.mode !== 'play') { e.preventDefault(); G.newGame(); } });

  let last = 0, wasOver = false;
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; G.update(dt);
    if (G.mode === 'over' && !wasOver) S.overAt = performance.now(); wasOver = G.mode === 'over';
    draw(); requestAnimationFrame(frame);
  }
  function run(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) G.update(1 / 60); }
  window.__sw = { mode: '2d', G: G, S: S, SW: SW, run: run };
  resize();
  UI.loadTexture(1).then(function (t) { S.tex = t; });
  requestAnimationFrame(frame);
})();
