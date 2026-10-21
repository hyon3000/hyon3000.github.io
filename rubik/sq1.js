// Square-n page: software 3D drawing of the layered puzzle (painter's algorithm), buttons / keys for the moves, scramble, auto solve (replays the history backwards) and hint.
(function () {
  'use strict';
  const KO = /^ko/i.test(navigator.language || 'ko'), SQ = window.SQ1;
  const NL = Math.max(1, Math.floor(+new URLSearchParams(location.search).get('n')) || 1);
  const cv = document.getElementById('app'), ctx = cv.getContext('2d');
  const TX = KO ? { name: '스퀘어-' + NL, moves: '이동', time: '시간', best: '최고', solved: '완성!', newRec: '신기록!', again: '새 게임 (F2)', slice: '슬라이스', top: '위', bottom: '아래', layer: '층', illegal: '조각이 걸려 있어 슬라이스를 할 수 없습니다', next: '다음 수', hintTxt: '조각 사이를 끌어 시점 회전 · ←→ 층 돌리기 · ↑↓ 층 선택 · Space 슬라이스', keys: 'F2 새 게임 · F3 자동 풀기 · F4 힌트', scr: '섞는 중...' }
    : { name: 'Square-' + NL, moves: 'Moves', time: 'Time', best: 'Best', solved: 'SOLVED!', newRec: 'New best!', again: 'New game (F2)', slice: 'Slice', top: 'Top', bottom: 'Bottom', layer: 'layer', illegal: 'A piece is in the way - the slice is not possible', next: 'Next move', hintTxt: 'Drag to rotate the view · arrows turn a layer · up/down pick a layer · Space = slice', keys: 'F2 new game · F3 auto-solve · F4 hint', scr: 'Scrambling...' };
  const FACE = ['#d91e18', '#0fa34a', '#ff7f0e', '#1f4fd8'], END = { W: '#f2f2f2', Y: '#ffd400' }, GRAY = '#697386';
  const D = 1, R1 = D / Math.cos(Math.PI / 12), R2 = D * Math.SQRT2, TM = 0.4, TH = 0.8 / NL, DEG = Math.PI / 180;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function fmtTime(s) { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
  let rngState = 0; function rnd() { return Math.random(); }

  const G = { S: SQ.create(NL), sel: 0, moves: 0, time: 0, started: false, mode: 'play', anim: null, queue: [], auto: false, hint: null, msg: '', msgT: 0, animScr: lsGet('rubik_anim') !== '0', best: null, newRec: false };
  const V = { yaw: 0.6, pitch: 0.75, drag: null, cw: 0, ch: 0, dpr: 1 };
  const BEST_KEY = 'sq1_best_' + NL;
  try { G.best = JSON.parse(lsGet(BEST_KEY) || 'null'); } catch (e) { G.best = null; }
  function say(t, s) { G.msg = t; G.msgT = (s || 2.2); }

  /* ---------- moves ---------- */
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  function startMove(mv, src, dur) {
    if (!SQ.apply(G.S, mv)) { if (src === 'user') say(TX.illegal); return false; }
    G.anim = { mv: mv, src: src, t: 0, dur: dur || (mv.t === 's' ? 0.45 : 0.16 + 0.03 * Math.abs(mv.s)) };
    if (src === 'user') { G.moves++; G.started = true; }
    return true;
  }
  function enqueue(mv, src, dur) { G.queue.push({ mv: mv, src: src, dur: dur }); }
  function userMove(mv) {
    if (G.mode === 'solved') return;
    if (G.auto) setAuto(false);
    G.hint = null;
    if (G.anim || G.queue.length) { if (G.queue.length < 3) enqueue(mv, 'user'); return; }
    startMove(mv, 'user');
  }
  function rot(s) { userMove({ t: 'r', l: G.sel, s: s }); }
  function doSlice() { userMove({ t: 's' }); }
  function undo() {
    if (G.mode === 'solved' || G.anim || G.queue.length || !G.S.hist.length) return;
    const e = G.S.hist[G.S.hist.length - 1]; startMove(SQ.inverse(e), 'undo');
  }
  function desc(mv) { return mv.t === 's' ? TX.slice : (mv.l < NL ? TX.top + ' ' + (mv.l + 1) : TX.bottom + ' ' + (2 * NL - mv.l)) + ' ' + (mv.s > 0 ? '◀' : '▶') + Math.abs(mv.s); }
  function nextSolveMove() { const h = G.S.hist; return h.length ? SQ.inverse(h[h.length - 1]) : null; }
  function setAuto(on) {
    G.auto = !!on;
    try { window.parent.postMessage({ rb: 'autoState', on: G.auto }, '*'); } catch (e) {}
  }
  function checkSolved() {
    if (G.mode !== 'play' || !SQ.isSolved(G.S)) return;
    G.S.hist = []; G.mode = 'solved'; setAuto(false);
    if (!G.cheated && G.moves > 0) {
      const b = G.best;
      if (!b || G.moves < b.moves || (G.moves === b.moves && G.time < b.time)) { G.best = { moves: G.moves, time: G.time }; G.newRec = true; lsSet(BEST_KEY, JSON.stringify(G.best)); }
    }
  }
  function update(dt) {
    if (G.mode === 'play' && G.started) G.time += dt;
    if (G.msgT > 0) G.msgT -= dt;
    if (G.anim) { G.anim.t += dt; if (G.anim.t >= G.anim.dur) { const a = G.anim; G.anim = null; if (a.src !== 'scr') checkSolved(); } }
    if (!G.anim && G.queue.length && G.mode !== 'solved') { const q = G.queue.shift(); startMove(q.mv, q.src, q.dur); }
    if (!G.anim && !G.queue.length) {
      if (G.mode === 'scramble') G.mode = 'play';
      else if (G.mode === 'play') {
        if (G.hint) {
          G.hint.t += dt;
          if (G.hint.t >= 0.7) { const h = G.hint; G.hint = null; G.cheated = true; if (G.S.hist.length) startMove(h.mv, 'hint', 0.3); }
        } else if (G.auto) {
          const nm = nextSolveMove();
          if (!nm) setAuto(false); else { G.cheated = true; G.sel = nm.t === 'r' ? nm.l : G.sel; startMove(nm, 'auto', nm.t === 's' ? 0.35 : 0.22); }
        }
      }
    }
  }
  function newGame(opt) {
    opt = opt || {};
    G.S = SQ.create(NL); G.sel = 0; G.moves = 0; G.time = 0; G.started = false; G.anim = null; G.queue = []; G.hint = null; G.cheated = false; G.newRec = false; setAuto(false);
    const cnt = 24 + 12 * (NL - 1);
    if (G.animScr && !opt.instant) {
      const tmp = SQ.create(NL), mvs = SQ.scramble(tmp, cnt, rnd);
      G.mode = 'scramble'; mvs.forEach((m) => enqueue(m, 'scr', m.t === 's' ? 0.2 : 0.07));
    } else { SQ.scramble(G.S, cnt, rnd); G.mode = SQ.isSolved(G.S) ? 'play' : 'play'; if (SQ.isSolved(G.S)) newGame(opt); }
  }

  /* ---------- geometry / projection ---------- */
  function pol(r, deg) { return [r * Math.cos(deg * DEG), r * Math.sin(deg * DEG)]; }
  function pieceOutline(type, alpha) {                      // top-view polygon of a piece centred on angle alpha (degrees); corners are kites, edges are triangles
    if (type === 'c') return [[0, 0], pol(R1, alpha - 30), pol(R2, alpha), pol(R1, alpha + 30)];
    return [[0, 0], pol(R1, alpha - 15), pol(R1, alpha + 15)];
  }
  function faceAt(theta) { theta = ((theta % 360) + 360) % 360; if (theta >= 30 && theta < 120) return 0; if (theta >= 120 && theta < 210) return 1; if (theta >= 210 && theta < 300) return 2; return 3; }
  function outR(theta) { let best = 1e9, nu = 75; for (let i = 0; i < 4; i++) { let d = Math.abs((((theta - (75 + 90 * i)) % 360) + 540) % 360 - 180); if (d < best) { best = d; nu = 75 + 90 * i; } } return D / Math.cos(best * DEG); }
  function layerY(l) {
    if (l < NL) { const yb = TM / 2 + (NL - 1 - l) * TH; return [yb, yb + TH]; }
    const i = l - NL, yt = -TM / 2 - i * TH; return [yt - TH, yt];
  }
  let cy = 1, sy = 0, cp = 1, sp = 0, scale = 100, ox = 0, oyy = 0;
  const DC = 6.5;
  function tr(p, extra) {                                   // world (x,y,z) -> camera space; extra = rotation about the z axis (slice animation)
    let x = p[0], y = p[1], z = p[2];
    if (extra) { const c = Math.cos(extra), s = Math.sin(extra), nx = x * c - y * s, ny = x * s + y * c; x = nx; y = ny; }
    const xr = x * cy - z * sy, zr = x * sy + z * cy, y2 = y * cp + zr * sp, z2 = -y * sp + zr * cp;
    return [xr, y2, z2];
  }
  function proj(c) { const f = DC / (DC + c[2]); return [ox + c[0] * f * scale, oyy - c[1] * f * scale]; }
  function shadeCol(hex, k) {
    const r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return 'rgb(' + Math.round(Math.min(255, r * k)) + ',' + Math.round(Math.min(255, g * k)) + ',' + Math.round(Math.min(255, b * k)) + ')';
  }
  const LIGHT = [-0.35, 0.8, -0.5];

  /* ---------- faces ---------- */
  function buildFaces() {
    const faces = [], S = G.S, a = G.anim;
    let layerOff = null, sliceAng = 0;
    if (a) { const e = ease(Math.min(1, a.t / a.dur)); if (a.mv.t === 'r') layerOff = { l: a.mv.l, deg: -a.mv.s * 30 * (1 - e) }; else sliceAng = Math.PI * (1 - e); }
    function addFace(pts3, color, outward, extra, sel, flat) {
      // order the vertices so that the normal points outward (checked in world space)
      const A = pts3[0], B = pts3[1], C = pts3[2];
      const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (nx * outward[0] + ny * outward[1] + nz * outward[2] < 0) pts3 = pts3.slice().reverse();
      faces.push({ w: pts3, color: color, extra: extra, sel: sel, outward: outward, flat: flat });
    }
    for (let l = 0; l < 2 * NL; l++) {
      const row = S.layers[l], yr = layerY(l), yb = yr[0], yt = yr[1], sel = l === G.sel;
      for (let j = 0; j < 12; j++) {
        const o = row[j], pc = SQ.PIECES[o.home];
        const first = pc.t === 'e' || row[(j + 11) % 12] !== o;
        if (!first) continue;
        const s0 = j, alpha0 = pc.t === 'c' ? 30 * s0 + 30 : 30 * s0 + 15;
        const alpha = alpha0 + (layerOff && layerOff.l === l ? layerOff.deg : 0), extra = (s0 < 6 ? sliceAng : 0);
        const poly = pieceOutline(pc.t, alpha), n = poly.length;
        const top = poly.map((p) => [p[0], yt, p[1]]), bot = poly.map((p) => [p[0], yb, p[1]]);
        // end colours of the outer layers
        let topCol = GRAY, botCol = GRAY;
        if (l === 0) { const c = o.flip ? o.down : o.up; if (c) topCol = END[c]; }
        if (l === 2 * NL - 1) { const c = o.flip ? o.up : o.down; if (c) botCol = END[c]; }
        addFace(top, topCol, [0, 1, 0], extra, sel); addFace(bot, botCol, [0, -1, 0], extra, sel);
        // walls
        const lo = pc.t === 'e' ? pc.s[0] : (o.flip ? pc.s[1] : pc.s[0]), hi = pc.t === 'e' ? pc.s[0] : (o.flip ? pc.s[0] : pc.s[1]);
        if (pc.t === 'e') { const p1 = poly[1], p2 = poly[2], mid = [(p1[0] + p2[0]) / 2, 0, (p1[1] + p2[1]) / 2]; addFace([[p1[0], yb, p1[1]], [p2[0], yb, p2[1]], [p2[0], yt, p2[1]], [p1[0], yt, p1[1]]], FACE[lo], mid, extra, sel); }
        else {
          [[1, 2, lo], [2, 3, hi]].forEach((e) => { const p1 = poly[e[0]], p2 = poly[e[1]], mid = [(p1[0] + p2[0]) / 2, 0, (p1[1] + p2[1]) / 2]; addFace([[p1[0], yb, p1[1]], [p2[0], yb, p2[1]], [p2[0], yt, p2[1]], [p1[0], yt, p1[1]]], FACE[e[2]], mid, extra, sel); });
        }
        // radial sides (against the neighbours)
        [[0, 1], [n - 1, 0]].forEach((e) => { const p1 = poly[e[0]], p2 = poly[e[1]], mid = [(p1[0] + p2[0]) / 2, 0, (p1[1] + p2[1]) / 2]; const nrm = [-(p2[1] - p1[1]), 0, (p2[0] - p1[0])]; addFace([[p1[0], yb, p1[1]], [p2[0], yb, p2[1]], [p2[0], yt, p2[1]], [p1[0], yt, p1[1]]], '#3a4152', nrm, extra, sel); });
      }
    }
    // middle layer: two halves following the outline of the cube
    const my = [-TM / 2, TM / 2];
    for (let half = 0; half < 2; half++) {
      const extra = half === 0 ? sliceAng : 0, th0 = half * 180, ring = [];
      for (let k = 0; k <= 30; k++) { const th = th0 + 6 * k, r = outR(th); ring.push([r * Math.cos(th * DEG), r * Math.sin(th * DEG), th]); }
      addFace([[0, my[1], 0]].concat(ring.map((p) => [p[0], my[1], p[1]])), '#4b5366', [0, 1, 0], extra, false);
      addFace([[0, my[0], 0]].concat(ring.map((p) => [p[0], my[0], p[1]])), '#4b5366', [0, -1, 0], extra, false);
      for (let k = 0; k < 30; k++) {
        const p1 = ring[k], p2 = ring[k + 1], thm = (p1[2] + p2[2]) / 2, src = half === 0 && S.rflip ? 180 - thm : thm;
        addFace([[p1[0], my[0], p1[1]], [p2[0], my[0], p2[1]], [p2[0], my[1], p2[1]], [p1[0], my[1], p1[1]]], FACE[faceAt(src)], [(p1[0] + p2[0]) / 2, 0, (p1[1] + p2[1]) / 2], extra, false, true);
      }
      // the cut faces of the halves (visible during the slice)
      const e1 = ring[0], e2 = ring[30];
      addFace([[0, my[0], 0], [e1[0], my[0], e1[1]], [e1[0], my[1], e1[1]], [0, my[1], 0]], '#303644', [0, 0, half === 0 ? -1 : 1], extra, false);
      addFace([[0, my[0], 0], [e2[0], my[0], e2[1]], [e2[0], my[1], e2[1]], [0, my[1], 0]], '#303644', [0, 0, half === 0 ? 1 : -1], extra, false);
    }
    return faces;
  }

  /* ---------- drawing ---------- */
  let btns = [];
  function layout() {
    V.dpr = window.devicePixelRatio || 1; V.cw = window.innerWidth; V.ch = window.innerHeight;
    cv.width = Math.floor(V.cw * V.dpr); cv.height = Math.floor(V.ch * V.dpr);
  }
  function txt(s, x, y, size, color, align, bold) { ctx.font = (bold ? 'bold ' : '') + size + 'px system-ui, "Malgun Gothic", sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(s, x, y); }
  function draw() {
    const cw = V.cw, ch = V.ch; if (cw < 80 || ch < 120) return;
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    ctx.fillStyle = '#141a2b'; ctx.fillRect(0, 0, cw, ch);
    const g = ctx.createRadialGradient(cw / 2, ch * 0.42, 10, cw / 2, ch * 0.42, Math.max(cw, ch) * 0.6); g.addColorStop(0, '#222c47'); g.addColorStop(1, '#141a2b'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    cy = Math.cos(V.yaw); sy = Math.sin(V.yaw); cp = Math.cos(V.pitch); sp = Math.sin(V.pitch);
    const areaH = ch - 130; scale = Math.min(cw * 0.34, areaH * 0.30 / (0.9 + 0.45 * NL * 0.2 + 0.2)) * 1; ox = cw / 2; oyy = 64 + areaH / 2;
    const faces = buildFaces(), out = [];
    faces.forEach((f) => {
      const c3 = f.w.map((p) => tr(p, f.extra)), n3 = tr([f.outward[0], f.outward[1], f.outward[2]].map((v, i) => v + f.w[0][i] - f.w[0][i]), f.extra);
      // outward normal in camera space (rotation only) = tr(outward) - tr(0)
      const o0 = tr([0, 0, 0], f.extra), nn = [n3[0] - o0[0], n3[1] - o0[1], n3[2] - o0[2]];
      let ctr = [0, 0, 0]; c3.forEach((p) => { ctr[0] += p[0]; ctr[1] += p[1]; ctr[2] += p[2]; }); ctr = ctr.map((v) => v / c3.length);
      // face normal from its own (outward ordered) vertices
      const A = c3[0], B = c3[1], C = c3[2], ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * nn[0] + ny * nn[1] + nz * nn[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (nx * ctr[0] + ny * ctr[1] + nz * (ctr[2] + DC) >= 0) return;          // back face (camera at z = -DC in camera space)
      const l = Math.hypot(nx, ny, nz) || 1, lit = 0.62 + 0.38 * Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / l);
      out.push({ pts: c3.map(proj), z: ctr[2], color: shadeCol(f.color, lit), sel: f.sel, flat: f.flat });
    });
    out.sort((a, b) => b.z - a.z);
    out.forEach((f) => {
      ctx.beginPath(); f.pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
      ctx.fillStyle = f.color; ctx.fill();
      ctx.lineWidth = f.sel ? 1.8 : 1; ctx.strokeStyle = f.flat ? f.color : (f.sel ? 'rgba(255,230,90,.95)' : 'rgba(10,12,20,.75)'); ctx.stroke();
    });
    // title and numbers
    txt(TX.name, cw / 2, 24, 22, '#e8eefc', 'center', true);
    txt(TX.moves + ' ' + G.moves + '   ' + TX.time + ' ' + fmtTime(G.time) + (G.best ? '   ' + TX.best + ' ' + G.best.moves + ' / ' + fmtTime(G.best.time) : ''), cw / 2, 48, 14, '#9aa8c8', 'center');
    if (G.mode === 'scramble') txt(TX.scr, cw / 2, 70, 14, '#ffd23c', 'center');
    else if (G.hint) txt(TX.next + ': ' + desc(G.hint.mv), cw / 2, 70, 14, '#3f6', 'center');
    else if (G.msgT > 0) txt(G.msg, cw / 2, 70, 13, '#ff9a8a', 'center');
    // layer list (left)
    btns = [];
    const lh = Math.min(26, (ch - 220) / (2 * NL)), lx = 10;
    for (let l = 0; l < 2 * NL; l++) {
      const y = 100 + l * lh, label = (l < NL ? TX.top + ' ' + (l + 1) : TX.bottom + ' ' + (2 * NL - l));
      ctx.fillStyle = l === G.sel ? 'rgba(255,230,90,.28)' : 'rgba(255,255,255,.07)'; ctx.fillRect(lx, y, 74, lh - 3);
      ctx.strokeStyle = l === G.sel ? 'rgba(255,230,90,.9)' : 'rgba(255,255,255,.2)'; ctx.strokeRect(lx + 0.5, y + 0.5, 73, lh - 4);
      txt(label, lx + 37, y + (lh - 3) / 2, Math.min(13, lh - 8), '#e8eefc', 'center');
      btns.push({ x: lx, y: y, w: 74, h: lh - 3, act: function (i) { return function () { G.sel = i; }; }(l) });
    }
    // move buttons (bottom)
    const bw = Math.min(64, (cw - 40) / 6), by = ch - 62, bx0 = cw / 2 - bw * 3;
    [['◀◀', function () { rot(3); }], ['◀', function () { rot(1); }], ['▶', function () { rot(-1); }], ['▶▶', function () { rot(-3); }]].forEach((b, i) => {
      const x = bx0 + i * bw; ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, by, bw - 4, 40); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.strokeRect(x + 0.5, by + 0.5, bw - 5, 39);
      txt(b[0], x + (bw - 4) / 2, by + 20, 18, '#fff', 'center'); btns.push({ x: x, y: by, w: bw - 4, h: 40, act: b[1] });
    });
    const sx = bx0 + 4 * bw, sw = bw * 2 - 4, legal = SQ.sliceLegal(G.S);
    ctx.fillStyle = legal ? 'rgba(80,200,120,.28)' : 'rgba(255,255,255,.07)'; ctx.fillRect(sx, by, sw, 40); ctx.strokeStyle = legal ? 'rgba(80,220,130,.9)' : 'rgba(255,255,255,.25)'; ctx.strokeRect(sx + 0.5, by + 0.5, sw - 1, 39);
    txt(TX.slice, sx + sw / 2, by + 20, 15, legal ? '#fff' : '#8b94a8', 'center', true); btns.push({ x: sx, y: by, w: sw, h: 40, act: doSlice });
    txt(TX.hintTxt, cw / 2, ch - 12, 11, '#6f7b99', 'center');
    if (G.mode === 'solved') {
      const pw = Math.min(360, cw - 40), px = cw / 2 - pw / 2, py = ch * 0.5 - 70;
      ctx.fillStyle = 'rgba(8,12,22,.92)'; ctx.fillRect(px, py, pw, 150); ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 2; ctx.strokeRect(px, py, pw, 150); ctx.lineWidth = 1;
      txt(TX.solved, cw / 2, py + 34, 34, '#ffd23c', 'center', true); txt(TX.moves + ' ' + G.moves + '   ' + TX.time + ' ' + fmtTime(G.time), cw / 2, py + 72, 16, '#fff', 'center');
      if (G.newRec) txt(TX.newRec, cw / 2, py + 96, 14, '#8ee08e', 'center');
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(cw / 2 - 90, py + 110, 180, 30); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.strokeRect(cw / 2 - 89.5, py + 110.5, 179, 29);
      txt(TX.again, cw / 2, py + 125, 14, '#fff', 'center'); btns.push({ x: cw / 2 - 90, y: py + 110, w: 180, h: 30, act: function () { newGame(); } });
    }
  }

  /* ---------- input ---------- */
  window.addEventListener('keydown', function (e) {
    if (e.code === 'ArrowLeft') { e.preventDefault(); rot(e.shiftKey ? 3 : 1); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); rot(e.shiftKey ? -3 : -1); }
    else if (e.code === 'ArrowUp') { e.preventDefault(); G.sel = Math.max(0, G.sel - 1); }
    else if (e.code === 'ArrowDown') { e.preventDefault(); G.sel = Math.min(2 * NL - 1, G.sel + 1); }
    else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (G.mode === 'solved') newGame(); else doSlice(); }
    else if (e.code === 'KeyU' || e.code === 'Backspace') { e.preventDefault(); undo(); }
  });
  cv.addEventListener('pointerdown', function (e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const b of btns) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    V.drag = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (z) {}
  });
  cv.addEventListener('pointermove', function (e) { if (!V.drag) return; V.yaw -= (e.clientX - V.drag.x) * 0.01; V.pitch = Math.max(0.15, Math.min(1.45, V.pitch + (e.clientY - V.drag.y) * 0.008)); V.drag.x = e.clientX; V.drag.y = e.clientY; });
  cv.addEventListener('pointerup', function () { V.drag = null; }); cv.addEventListener('pointercancel', function () { V.drag = null; });
  window.addEventListener('resize', layout);

  /* ---------- exports for the shell ---------- */
  window.newGame = function () { newGame(); };
  window.toggleAuto = function () { if (G.mode === 'solved') return false; setAuto(!G.auto); return G.auto; };
  window.giveHint = function () { if (G.mode !== 'play' || G.anim || G.queue.length || G.hint) return; const nm = nextSolveMove(); if (!nm) return; if (nm.t === 'r') G.sel = nm.l; G.hint = { t: 0, mv: nm }; };
  window.toggleScrambleAnim = function () { G.animScr = !G.animScr; lsSet('rubik_anim', G.animScr ? '1' : '0'); return G.animScr; };
  window.getScrambleAnim = function () { return G.animScr; };
  window.addEventListener('message', function (e) { const m = e.data; if (m && m.rbCmd && typeof window[m.rbCmd] === 'function') window[m.rbCmd](); });
  window.__sq = { G: G, SQ: SQ, step: function (dt) { update(dt); } };

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now; const dt = Math.min(0.1, (now - last) / 1000); last = now;
    update(dt); draw();
  }
  layout(); newGame(); requestAnimationFrame(frame);
})();
