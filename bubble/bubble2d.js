// Bubble Shooter 2D - hex grid (rows offset by half a bubble), 10 columns, danger line below row 11.
// Aim: press / move the pointer = aim, release = fire.  Auto play (F3) and Hint (F4) use the same rule-based shot search (simulates every angle with the real physics).
(function () {
  'use strict';
  const BO = window.BO, KO = BO.KO;
  const canvas = document.getElementById('app'), ctx = canvas.getContext('2d');
  const FW = 100, FH = 126, D = 10, R = 5, RH = D * Math.sqrt(3) / 2, MAXR = 18, DANGER = 12;   // a bubble in row >= DANGER = game over
  const SX = 50, SY = FH - 9, SPEED = 230, MINA = 8 * Math.PI / 180;
  const L = KO ? { start: '시작', over: '게임 오버', retry: '다시 하려면 터치', hintAim: '조준: 누르고 움직이기, 떼면 발사', level: '레벨', clear: '모두 제거! +100', next: '다음', row: '새 줄: %발 후', drop: '천장 하강', best: '최고' }
              : { start: 'TAP TO START', over: 'GAME OVER', retry: 'TAP TO RETRY', hintAim: 'Press and move to aim, release to fire', level: 'LEVEL', clear: 'CLEARED +100', next: 'NEXT', row: 'NEW ROW IN % SHOT(S)', drop: 'Ceiling drops', best: 'BEST' };
  const S = { mode: 'start', level: 1, score: 0, best: 0, grid: [], par: 0, since: 0, rows: 0, nc: 2, cur: 0, next: 0, shot: null, shotCount: 0, aim: Math.PI / 2, aiming: false, fx: [], plan: null, auto: false, autoT: 0,
    msg: '', msgT: 0, flash: 0, over0: 0, cw: 0, ch: 0, sc: 1, ox: 0, oy: 0, tex: null, bg: null, held: { l: 0, r: 0 }, ptr: null };
  try { S.best = parseInt(localStorage.getItem('bubble2d_best'), 10) || 0; } catch (e) {}

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    S.cw = canvas.width = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
    S.ch = canvas.height = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
    S.sc = Math.min(S.cw * 0.92 / FW, S.ch * 0.86 / FH); S.ox = (S.cw - FW * S.sc) / 2; S.oy = S.ch * 0.1;
  }
  window.addEventListener('resize', resize);

  // ---------------- grid ----------------
  function newGrid() { const g = []; for (let r = 0; r < MAXR; r++) g.push(new Array(10).fill(-1)); return g; }
  function odd(r) { return (r + S.par) & 1; }                               // odd rows have 9 bubbles, shifted right by half a bubble
  function cols(r) { return odd(r) ? 9 : 10; }
  function cx(r, c) { return odd(r) ? D + c * D : R + c * D; }
  function cy(r) { return R + r * RH; }
  function nbrs(r, c) {
    const out = [];
    if (c > 0) out.push([r, c - 1]); if (c < cols(r) - 1) out.push([r, c + 1]);
    const cand = odd(r) ? [c, c + 1] : [c - 1, c];
    for (const dr of [-1, 1]) { const r2 = r + dr; if (r2 < 0 || r2 >= MAXR) continue; for (const c2 of cand) if (c2 >= 0 && c2 < cols(r2)) out.push([r2, c2]); }
    return out;
  }
  function present(g) { const s = {}; for (const row of g) for (const v of row) if (v >= 0) s[v] = 1; return Object.keys(s).map(Number); }
  function count(g) { let n = 0; for (const row of g) for (const v of row) if (v >= 0) n++; return n; }
  function maxRow(g) { for (let r = MAXR - 1; r >= 0; r--) for (let c = 0; c < cols(r); c++) if (g[r][c] >= 0) return r; return -1; }
  function pickColor() { const p = present(S.grid); return p.length ? p[Math.floor(Math.random() * p.length)] : Math.floor(Math.random() * S.nc); }
  function fixSupply() { const p = present(S.grid); if (!p.length) return; if (p.indexOf(S.cur) < 0) S.cur = pickColor(); if (p.indexOf(S.next) < 0) S.next = pickColor(); }

  function randRow(g, r, nc) {                                                 // coherent random colours (clusters) for row r of g
    for (let c = 0; c < cols(r); c++) {
      let v = Math.floor(Math.random() * nc), q = Math.random();
      if (q < 0.45 && c > 0 && g[r][c - 1] >= 0) v = g[r][c - 1];
      else if (q < 0.75 && r + 1 < MAXR) { const n = nbrs(r, c).filter(function (p) { return p[0] === r + 1 && g[p[0]][p[1]] >= 0; }); if (n.length) v = g[n[0][0]][n[0][1]]; }
      g[r][c] = v;
    }
  }
  function buildLevel(level) {
    S.level = level; S.nc = BO.numColors(level); S.par = 0; S.since = 0; S.rows = 0; S.shot = null; S.fx = []; S.plan = null;
    const g = newGrid(), rows = 5;
    for (let r = rows - 1; r >= 0; r--) randRow(g, r, S.nc);
    for (let k = 0; k < S.nc; k++) if (present(g).indexOf(k) < 0) { const r = Math.floor(Math.random() * rows); g[r][Math.floor(Math.random() * cols(r))] = k; }
    S.grid = g; S.cur = pickColor(); S.next = pickColor();
  }
  function newGame() { S.score = 0; S.mode = 'play'; buildLevel(1); S.aim = Math.PI / 2; S.shotCount = 0; S.msg = ''; S.msgT = 0; }

  // ---------------- physics ----------------
  // One micro-step (1 unit) of a flying bubble s = {x, y, dx, dy}; returns true when it sticks (ceiling or touching a bubble).
  function stepOne(s, g) {
    s.x += s.dx; s.y += s.dy; s.bounced = false;
    if (s.x < R) { s.x = 2 * R - s.x; s.dx = -s.dx; s.bounced = true; } else if (s.x > FW - R) { s.x = 2 * (FW - R) - s.x; s.dx = -s.dx; s.bounced = true; }
    if (s.y <= R) return true;
    const r0 = Math.max(0, Math.floor((s.y - R - D) / RH)), r1 = Math.min(MAXR - 1, Math.ceil((s.y - R + D) / RH)), lim = (D * 0.9) * (D * 0.9);
    for (let r = r0; r <= r1; r++) for (let c = 0; c < cols(r); c++) if (g[r][c] >= 0) { const ex = cx(r, c) - s.x, ey = cy(r) - s.y; if (ex * ex + ey * ey < lim) return true; }
    return false;
  }
  function snapCell(g, x, y) {                                                // nearest empty cell that touches the ceiling or a bubble
    const r0 = Math.max(0, Math.round((y - R) / RH)); let best = null, bd = 1e9;
    for (let r = Math.max(0, r0 - 2); r <= Math.min(MAXR - 1, r0 + 2); r++) for (let c = 0; c < cols(r); c++) {
      if (g[r][c] >= 0) continue;
      let sup = r === 0; if (!sup) for (const p of nbrs(r, c)) if (g[p[0]][p[1]] >= 0) { sup = true; break; }
      if (!sup) continue;
      const d = (cx(r, c) - x) * (cx(r, c) - x) + (cy(r) - y) * (cy(r) - y); if (d < bd) { bd = d; best = [r, c]; }
    }
    return best;
  }
  // trace a shot of angle a (radians, from +x, up = pi/2) on g without changing anything: returns {pts (polyline), cell}
  function trace(g, a, maxBounce) {
    const s = { x: SX, y: SY, dx: Math.cos(a), dy: -Math.sin(a) }, pts = [[s.x, s.y]]; let bounces = 0, n = 0;
    while (n++ < 4000) {
      const st = stepOne(s, g);
      if (s.bounced) { pts.push([s.x, s.y]); bounces++; if (maxBounce !== undefined && bounces >= maxBounce) return { pts: pts, cell: null }; }
      if (st) { pts.push([s.x, s.y]); return { pts: pts, cell: snapCell(g, s.x, s.y), x: s.x, y: s.y, bounces: bounces }; }
    }
    return { pts: pts, cell: null };
  }
  // put colour col at (r,c) of g and resolve: >= 3 connected of the same colour pop, then everything not connected to the ceiling falls. Mutates g.
  function resolve(g, r, c, col) {
    g[r][c] = col; const seen = {}, grp = [[r, c]]; seen[r + ',' + c] = 1;
    for (let i = 0; i < grp.length; i++) for (const p of nbrs(grp[i][0], grp[i][1])) { const k = p[0] + ',' + p[1]; if (!seen[k] && g[p[0]][p[1]] === col) { seen[k] = 1; grp.push(p); } }
    const res = { pops: [], falls: [] };
    if (grp.length < 3) return res;
    for (const p of grp) { res.pops.push({ r: p[0], c: p[1], col: col }); g[p[0]][p[1]] = -1; }
    const ok = {}, q = [];
    for (let cc = 0; cc < cols(0); cc++) if (g[0][cc] >= 0) { ok['0,' + cc] = 1; q.push([0, cc]); }
    for (let i = 0; i < q.length; i++) for (const p of nbrs(q[i][0], q[i][1])) { const k = p[0] + ',' + p[1]; if (!ok[k] && g[p[0]][p[1]] >= 0) { ok[k] = 1; q.push(p); } }
    for (let rr = 0; rr < MAXR; rr++) for (let c2 = 0; c2 < cols(rr); c2++) if (g[rr][c2] >= 0 && !ok[rr + ',' + c2]) { res.falls.push({ r: rr, c: c2, col: g[rr][c2] }); g[rr][c2] = -1; }
    return res;
  }
  function pushRow() {                                                         // everything moves down one row, a new full row (attached to the ceiling) appears on top
    S.grid.pop(); const row = new Array(10).fill(-1); S.grid.unshift(row); S.par ^= 1; randRow(S.grid, 0, S.nc);
  }
  // Every 2nd shot (whatever it did) a new full row appears on top and the whole cluster moves down one row.  Every 10 added rows the level rises: that only changes the number of
  // colours used for bubbles created from then on (new rows, bubbles to shoot); bubbles that already exist are never touched.
  const SHOTS_PER_ROW = 2, ROWS_PER_LEVEL = 10;
  function addRow() {
    pushRow(); S.rows++; S.since = 0;
    if (S.rows % ROWS_PER_LEVEL === 0) { S.level++; S.nc = BO.numColors(S.level); S.msg = L.level + ' ' + S.level; S.msgT = 1.4; return true; }
    return false;
  }
  function endCheck() { if (maxRow(S.grid) >= DANGER) { gameOver(); return true; } return false; }
  function gameOver() { setAuto(false); S.mode = 'over'; S.over0 = performance.now(); S.flash = 0.4; S.shot = null; S.plan = null; saveBest(); }
  function saveBest() { if (S.score > S.best) { S.best = S.score; try { localStorage.setItem('bubble2d_best', String(S.best)); } catch (e) {} } }

  function land(s) { const i = landImpl(s); S._info = i; return i; }
  function landImpl(s) {                                                       // a flying bubble has stuck
    const cell = snapCell(S.grid, s.x, s.y); S.shot = null;
    if (!cell) return null;
    const res = resolve(S.grid, cell[0], cell[1], s.c), info = { r: cell[0], c: cell[1], pops: res.pops.length, falls: res.falls.length };
    for (const p of res.pops) S.fx.push({ k: 'pop', x: cx(p.r, p.c), y: cy(p.r), col: p.col, t: 0 });
    for (const p of res.falls) S.fx.push({ k: 'fall', x: cx(p.r, p.c), y: cy(p.r), vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 20, col: p.col, t: 0 });
    S.score += res.pops.length * 10 + res.falls.length * 20;
    S.since++;
    if (count(S.grid) === 0) { S.score += 100; S.msg = L.clear; S.msgT = 1.6; info.cleared = true; info.leveled = addRow(); }   // empty cluster: bonus, and a row at once so that there is always something to shoot at
    else if (S.since >= SHOTS_PER_ROW) { info.leveled = addRow(); info.rowAdded = true; }
    if (endCheck()) return info;
    fixSupply(); saveBest(); return info;
  }
  function fire(ang) {
    if (S.mode !== 'play' || S.shot) return false;
    if (ang !== undefined) S.aim = ang;
    S.shot = { x: SX, y: SY, dx: Math.cos(S.aim), dy: -Math.sin(S.aim), c: S.cur, acc: 0 };
    S.cur = S.next; S.next = pickColor(); S.shotCount++; S.plan = null; return true;
  }
  function swap() { if (S.mode === 'play' && !S.shot) { const t = S.cur; S.cur = S.next; S.next = t; } }
  function stepShot(dt) {
    const s = S.shot; s.acc += SPEED * dt;
    while (s.acc >= 1 && S.shot) { s.acc -= 1; if (stepOne(s, S.grid)) { land(s); return; } }
  }

  // ---------------- rule based shot search (auto play / hint) ----------------
  function evalShot(a, col) {
    const g = S.grid, t = trace(g, a); if (!t.cell) return null;
    const g2 = g.map(function (row) { return row.slice(); }), r = t.cell[0], c = t.cell[1], res = resolve(g2, r, c, col);
    const left = count(g2); let sc = res.pops.length * 10 + res.falls.length * 30;
    if (left === 0) return { score: sc + 1000, a: a, cell: t.cell };
    const mr = maxRow(g2);
    if (!res.pops.length) {
      let adj = 0; for (const p of nbrs(r, c)) if (g2[p[0]][p[1]] === col) adj++;
      sc += adj * 9 - r * 3;
    }
    const mr2 = mr + (S.since + 1 >= SHOTS_PER_ROW ? 1 : 0);            // the cluster is pushed down by the next row
    sc -= mr2 * 7; if (mr2 >= DANGER - 2) sc -= 80 * (mr2 - DANGER + 3); if (mr2 >= DANGER) sc -= 1e5;
    return { score: sc + (Math.random() - 0.5) * 0.01, a: a, cell: t.cell };
  }
  function bestShot() {
    let best = null;
    for (const swp of [false, true]) {
      const col = swp ? S.next : S.cur; if (swp && S.next === S.cur) continue;
      for (let d = 8; d <= 172.01; d += 0.5) { const e = evalShot(d * Math.PI / 180, col); if (e && (!best || e.score > best.score + (swp ? 4 : 0))) { best = e; best.swap = swp; } }
    }
    return best;
  }
  function ready() { return S.mode === 'play' && !S.shot && !S.plan && S.fx.every(function (f) { return f.k !== 'fall' || f.t > 0.4; }); }
  function makePlan(delay) { const b = bestShot(); if (!b) return false; if (b.swap) swap(); S.aim = b.a; S.plan = { t: delay }; return true; }

  // keep the shell's menu check mark in sync (direct call, or postMessage when the frames cannot touch each other, e.g. file:// in Chrome)
  function setAuto(v) { v = !!v; if (S.auto === v) return; S.auto = v; notifyAuto(); }
  function notifyAuto() { try { if (window.parent !== window) window.parent.postMessage({ bubble: 'autoState', on: S.auto }, '*'); } catch (e) {} }
  window.addEventListener('message', function (e) { const m = e.data; if (!m || !m.bubbleCmd) return; if (m.bubbleCmd === 'auto') window.toggleAuto(); else if (m.bubbleCmd === 'hint') window.giveHint(); });
  window.giveHint = function () { if (S.mode !== 'play' || S.shot || S.plan) return false; return makePlan(0.7); };
  window.toggleAuto = function () {
    if (S.mode !== 'play') { newGame(); setAuto(true); return true; }
    setAuto(!S.auto); S.plan = null; return S.auto;
  };

  // ---------------- step ----------------
  function step(dt) {
    for (const f of S.fx) { f.t += dt; if (f.k === 'fall') { f.vy += 260 * dt; f.x += f.vx * dt; f.y += f.vy * dt; } }
    S.fx = S.fx.filter(function (f) { return f.k === 'pop' ? f.t < 0.3 : f.y < FH + 10; });
    if (S.msgT > 0) S.msgT -= dt; if (S.flash > 0) S.flash -= dt;
    if (S.mode !== 'play') return;
    if (S.held.l || S.held.r) S.aim = Math.max(MINA, Math.min(Math.PI - MINA, S.aim + (S.held.l - S.held.r) * 1.2 * dt));
    if (S.shot) stepShot(dt);
    else if (S.plan) { S.plan.t -= dt; if (S.plan.t <= 0) fire(); }
    else if (S.auto && ready()) { S.autoT += dt; if (S.autoT > 0.25) { S.autoT = 0; makePlan(0.35); } }
  }

  // ---------------- drawing ----------------
  function X(x) { return S.ox + x * S.sc; } function Y(y) { return S.oy + y * S.sc; }
  function label(txt, x, y, size, color, align) { ctx.font = 'bold ' + Math.round(size) + 'px "Noto Sans KR","Malgun Gothic",sans-serif'; ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y); }
  function drawStart() {
    const cw = S.cw, ch = S.ch;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
    if (S.tex) { ctx.globalAlpha = 0.6; ctx.drawImage(S.tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
    const ts = Math.max(20, cw * 0.1); ctx.lineWidth = 1.5; BO.drawLineStringCentered(ctx, cw / 2, ch * 0.16, ts, 'BUBBLE', '#fff'); BO.drawLineStringCentered(ctx, cw / 2, ch * 0.16 + ts * 1.5, ts, 'SHOOTER', '#8cf');
    if (KO) label('버블 슈터', cw / 2, ch * 0.16 + ts * 3.2, cw * 0.06, '#ff0');
    const rr = cw * 0.045; for (let i = 0; i < 6; i++) BO.drawBubble(ctx, cw * (0.2 + i * 0.12), ch * 0.46, rr, i);
    const bw = cw * 0.5, bh = ch * 0.07; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(cw / 2 - bw / 2, ch * 0.56, bw, bh);
    BO.drawLineStringCentered(ctx, cw / 2, ch * 0.56 + bh * 0.22, Math.max(10, bh * 0.55), 'START', '#fff');
    if (KO) label('터치하여 시작', cw / 2, ch * 0.56 + bh * 1.6, cw * 0.04, '#ddd');
    if (S.best) BO.drawLineStringCentered(ctx, cw / 2, ch * 0.76, Math.max(9, cw * 0.045), 'BEST ' + S.best, '#8cf');
    label(L.hintAim, cw / 2, ch * 0.88, cw * 0.032, '#bbb');
  }
  function draw() {
    const cw = S.cw, ch = S.ch, sc = S.sc;
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, cw, ch);
    if (S.mode === 'start') { drawStart(); return; }
    if (S.tex) { ctx.globalAlpha = 0.3; ctx.drawImage(S.tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(X(0), Y(0), FW * sc, FH * sc);
    ctx.strokeStyle = S.flash > 0 ? '#f55' : '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(X(0), Y(0), FW * sc, FH * sc);
    ctx.fillStyle = '#9ab'; ctx.fillRect(X(0), Y(-1.2), FW * sc, 1.2 * sc);                           // ceiling
    const dl = Y(cy(DANGER - 1) + R + 1.5); ctx.strokeStyle = 'rgba(255,70,70,0.8)'; ctx.setLineDash([sc * 2, sc * 1.5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(0), dl); ctx.lineTo(X(FW), dl); ctx.stroke(); ctx.setLineDash([]);
    for (let r = 0; r < MAXR; r++) for (let c = 0; c < cols(r); c++) if (S.grid[r][c] >= 0) BO.drawBubble(ctx, X(cx(r, c)), Y(cy(r)), (R - 0.3) * sc, S.grid[r][c]);
    // aiming line (dotted, first wall bounce included) + the cell where the bubble would stick
    if (S.mode === 'play' && !S.shot) {
      const t = trace(S.grid, S.aim, 2); ctx.fillStyle = 'rgba(255,255,255,0.8)';
      let carry = 0;
      for (let i = 1; i < t.pts.length; i++) {
        const a = t.pts[i - 1], b = t.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = carry; d < len; d += 4.2) { const k = d / len; ctx.beginPath(); ctx.arc(X(a[0] + (b[0] - a[0]) * k), Y(a[1] + (b[1] - a[1]) * k), Math.max(1.2, sc * 0.45), 0, 7); ctx.fill(); carry = d + 4.2 - len; }
      }
      if (t.cell) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(X(cx(t.cell[0], t.cell[1])), Y(cy(t.cell[0])), (R - 0.3) * sc, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    }
    for (const f of S.fx) {
      if (f.k === 'pop') { const k = f.t / 0.3; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(f.x), Y(f.y), (R + 4 * k) * sc, 0, 7); ctx.stroke(); BO.drawBubble(ctx, X(f.x), Y(f.y), R * sc * (1 - k * 0.7), f.col, 1, 1 - k); }
      else BO.drawBubble(ctx, X(f.x), Y(f.y), (R - 0.3) * sc, f.col);
    }
    // shooter: barrel, current bubble, next bubble, miss counter
    const bx = X(SX), by = Y(SY);
    ctx.strokeStyle = '#789'; ctx.lineWidth = sc * 3.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(S.aim) * sc * 11, by - Math.sin(S.aim) * sc * 11); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = '#456'; ctx.beginPath(); ctx.arc(bx, by, sc * 6.4, 0, 7); ctx.fill(); ctx.strokeStyle = '#9bd'; ctx.lineWidth = 1.5; ctx.stroke();
    if (S.mode !== 'start') { if (!S.shot) BO.drawBubble(ctx, bx, by, (R - 0.3) * sc, S.cur); if (S.shot) BO.drawBubble(ctx, X(S.shot.x), Y(S.shot.y), (R - 0.3) * sc, S.shot.c); }
    label(L.next, X(18), Y(SY - 8), sc * 3.2, '#9cf');
    BO.drawBubble(ctx, X(18), Y(SY), R * 0.8 * sc, S.next);
    const left = SHOTS_PER_ROW - S.since; label(L.row.replace('%', left), X(80), Y(SY - 8), sc * 3.2, '#fc8');
    for (let i = 0; i < SHOTS_PER_ROW; i++) { const x = X(80 - (SHOTS_PER_ROW - 1) * 4 + i * 8), y = Y(SY); ctx.beginPath(); ctx.arc(x, y, sc * 2.6, 0, 7); ctx.fillStyle = i < S.since ? '#f84' : 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.strokeStyle = '#fc8'; ctx.lineWidth = 1; ctx.stroke(); }
    // HUD
    const hs = Math.max(8, cw * 0.04), hy = ch * 0.02;
    BO.drawLineString(ctx, cw * 0.04, hy, hs, 'SCORE ' + S.score, '#fff'); BO.drawLineString(ctx, cw * 0.04, hy + hs * 1.3, hs * 0.75, 'BEST ' + S.best, '#888');
    BO.drawLineString(ctx, cw * 0.62, hy, hs, 'LV ' + S.level, '#0ff'); BO.drawLineString(ctx, cw * 0.62, hy + hs * 1.3, hs * 0.75, S.auto ? 'AUTO PLAY' : S.nc + ' COLORS', S.auto ? '#6f6' : '#f9c');
    if (S.msgT > 0) label(S.msg, cw / 2, ch * 0.45, cw * 0.07, '#ff0');
    label(L.hintAim, cw / 2, Y(FH) + (ch - Y(FH)) / 2, cw * 0.03, '#999');
    if (S.mode === 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(X(0), Y(0), FW * sc, FH * sc);
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.28, cw * 0.075, 'GAME OVER', '#f55');
      BO.drawLineStringCentered(ctx, cw / 2, ch * 0.38, cw * 0.045, 'SCORE ' + S.score, '#fff');
      label(L.retry, cw / 2, ch * 0.5, cw * 0.05, '#0ff');
    }
  }

  // ---------------- input ----------------
  function fpos(e) { const r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1; return { px: (e.clientX - r.left) * d, py: (e.clientY - r.top) * d, x: ((e.clientX - r.left) * d - S.ox) / S.sc, y: ((e.clientY - r.top) * d - S.oy) / S.sc }; }
  function aimTo(p) { const a = Math.atan2(SY - p.y, p.x - SX); S.aim = Math.max(MINA, Math.min(Math.PI - MINA, a)); }
  canvas.addEventListener('pointerdown', function (e) {
    const p = fpos(e); try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (S.mode === 'start') { newGame(); return; }
    if (S.mode === 'over') { if (performance.now() - S.over0 > 500) newGame(); return; }
    setAuto(false); S.plan = null;
    if (Math.hypot(p.x - 18, p.y - SY) < R * 1.6) { swap(); S.aiming = false; return; }                  // tap the preview = swap
    S.aiming = true; aimTo(p); S.ptr = p;
  });
  canvas.addEventListener('pointermove', function (e) { if (S.mode !== 'play' || S.shot) return; const p = fpos(e); if (S.aiming || e.pointerType === 'mouse') { if (!S.auto && !S.plan) aimTo(p); S.ptr = p; } });
  window.addEventListener('pointerup', function (e) {
    if (!S.aiming) return; S.aiming = false; if (S.mode !== 'play') return;
    const p = fpos(e); if (p.y > SY + 12) return;                                                        // released below the shooter = cancel
    aimTo(p); fire();
  });
  window.addEventListener('keydown', function (e) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { S.held.l = 1; S.plan = null; e.preventDefault(); } else if (k === 'ArrowRight' || k === 'd' || k === 'D') { S.held.r = 1; S.plan = null; e.preventDefault(); }
    else if (k === ' ' || k === 'Enter' || k === 'ArrowUp') { e.preventDefault(); if (S.mode !== 'play') newGame(); else { setAuto(false); fire(); } }
    else if (k === 'x' || k === 'X' || k === 'ArrowDown') swap();
    else if (k === 'F3') { e.preventDefault(); window.toggleAuto(); } else if (k === 'F4') { e.preventDefault(); window.giveHint(); }
  });
  window.addEventListener('keyup', function (e) { const k = e.key; if (k === 'ArrowLeft' || k === 'a' || k === 'A') S.held.l = 0; if (k === 'ArrowRight' || k === 'd' || k === 'D') S.held.r = 0; });

  let last = 0;
  function frame(t) { const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; step(dt); draw(); requestAnimationFrame(frame); }

  // ---- test hook ----
  function loadGrid(rows, par, reserve) {                                              // rows: strings, '.' empty, digit = colour; even-type rows are 10 long, odd-type rows 9 long
    S.par = par || 0; S.grid = newGrid(); S.since = 0; S.shot = null; S.fx = []; S.plan = null;
    rows.forEach(function (s, r) { for (let c = 0; c < s.length && c < cols(r); c++) if (s[c] !== '.') S.grid[r][c] = +s[c]; });
    S.nc = Math.max(S.nc, 4); S.mode = 'play';
  }
  function shootSync(deg, col) {                                              // fire with the given colour and run until it has landed; returns {r, c, pops, falls, cleared}
    S._info = null; S.cur = col; S.next = col; S.shot = null; fire(deg * Math.PI / 180); S.cur = S.next = col; let info = null, n = 0, before = S.shotCount;
    const s = S.shot; if (!s) return null;
    while (S.shot && n++ < 20000) { s.acc = 1; stepShot(0); }
    return S._info || null;
  }
  function run(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { step(1 / 60); if (S.mode === 'over') break; } }
  window.__bb = { mode: "2d", addRow: addRow, maxRow: maxRow, S: S, step: step, run: run, newGame: newGame, buildLevel: buildLevel, loadGrid: loadGrid, shootSync: shootSync, trace: trace, fire: fire, swap: swap, resolve: resolve, count: count, present: present,
    numColors: BO.numColors, nbrs: nbrs, cols: cols, bestShot: bestShot, giveHint: function () { return window.giveHint(); } };
  resize(); buildLevel(1);
  Promise.all([BO.loadTexture(1), BO.loadStartBg()]).then(function (r) { S.tex = r[0]; S.bg = r[1]; });
  requestAnimationFrame(frame);
})();
