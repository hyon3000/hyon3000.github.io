// Helicopter cube page: depth-buffered WebGL drawing of the 45 rigid pieces, free-angle dragging of a prism (a drag snaps to a half turn or to the 70.53 degree jumbling turn),
// scramble with half turns, auto solve (replays the history backwards) and hint.
(function () {
  'use strict';
  const KO = /^ko/i.test(navigator.language || 'ko'), HC = window.HELI, DEG = Math.PI / 180, DC = 6.5, NP = 12;
  const cv = document.getElementById('app'), ctx = cv.getContext('2d');
  const TX = KO ? { name: '헬리콥터큐브', moves: '이동', time: '시간', best: '최고', solved: '완성!', newRec: '신기록!', again: '새 게임 (F2)', locked: '조각이 걸려 있어 이 면은 돌릴 수 없습니다', none: '이 조각은 돌릴 수 있는 면이 없습니다', next: '다음 수', hintTxt: '빈 곳을 끌면 시점 회전 · 삼각기둥(모서리 쪽 조각)을 끌어 돌리기 · 기본은 180도, 70.53도로 돌리면 모양이 변형됨', scr: '섞는 중...', free: '돌릴 수 있는 면' }
    : { name: 'Helicopter Cube', moves: 'Moves', time: 'Time', best: 'Best', solved: 'SOLVED!', newRec: 'New best!', again: 'New game (F2)', locked: 'A piece is in the way - this prism is locked', none: 'This piece has no free prism to turn', next: 'Next move', hintTxt: 'Drag empty space to rotate the view · drag a prism (an edge piece) to turn it · 180 degrees normally, a 70.53 degree turn deforms the cube', scr: 'Scrambling...', free: 'Free prisms' };
  const COL = ['#f2f2f2', '#d91e18', '#0fa34a', '#ffd400', '#ff7f0e', '#1f4fd8'], INNER = '#5a6478';     // tag 0..5 = U R F D L B
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function fmtTime(s) { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
  function rnd() { return Math.random(); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  const G = { S: HC.create(), moves: 0, time: 0, started: false, mode: 'play', vis: null, queue: [], auto: false, hint: null, msg: '', msgT: 0, animScr: lsGet('rubik_anim') !== '0', best: null, newRec: false, cheated: false };
  const V = { yaw: 0.6, pitch: 0.5, drag: null, cw: 0, ch: 0, dpr: 1, piece: null };
  const BEST_KEY = 'heli_best';
  try { G.best = JSON.parse(lsGet(BEST_KEY) || 'null'); } catch (e) { G.best = null; }
  function say(t, s) { G.msg = t; G.msgT = (s || 2.4); }
  function setAuto(on) { G.auto = !!on; try { window.parent.postMessage({ rb: 'autoState', on: G.auto }, '*'); } catch (e) {} }

  /* ---------- moves ---------- */
  // G.vis = the visual extra rotation x (about the axis of plane p) of the pieces in set, on top of the state; it relaxes to 0
  function startMove(mv, src, dur) {
    const set = HC.members(G.S, mv.p); if (!set) { if (src === 'user') say(TX.locked); return false; }
    const x0 = (G.vis && G.vis.live && G.vis.p === mv.p ? G.vis.x : 0) - mv.a;
    HC.apply(G.S, mv);
    G.vis = { p: mv.p, set: set, x: x0, x0: x0, t: 0, dur: dur || 0.2 + 0.1 * Math.min(1, Math.abs(mv.a) / Math.PI), src: src };
    if (src === 'user') { G.moves++; G.started = true; }
    return true;
  }
  function enqueue(mv, src, dur) { G.queue.push({ mv: mv, src: src, dur: dur }); }
  function busy() { return (G.vis && !G.vis.live) || G.queue.length; }
  function userMove(mv) {
    if (G.mode === 'solved') return false;
    if (G.auto) setAuto(false);
    G.hint = null;
    if (busy()) { if (G.queue.length < 3) enqueue(mv, 'user'); return true; }
    return startMove(mv, 'user');
  }
  function undo() { if (G.mode === 'solved' || busy() || !G.S.hist.length) return; startMove(HC.inverse(G.S.hist[G.S.hist.length - 1]), 'undo'); G.S.hist.pop(); G.S.hist.pop(); }
  function nextSolveMove() { const h = G.S.hist; return h.length ? HC.inverse(h[h.length - 1]) : null; }
  function desc(mv) { return '#' + (mv.p + 1) + ' ' + (Math.abs(Math.abs(mv.a) - Math.PI) < 1e-6 ? '180°' : (mv.a > 0 ? '+' : '-') + Math.abs(Math.round(mv.a / DEG * 100) / 100) + '°'); }
  function checkSolved() {
    if (G.mode !== 'play' || !HC.isSolved(G.S)) return;
    G.S.hist = []; G.mode = 'solved'; setAuto(false);
    if (!G.cheated && G.moves > 0) {
      const b = G.best;
      if (!b || G.moves < b.moves || (G.moves === b.moves && G.time < b.time)) { G.best = { moves: G.moves, time: G.time }; G.newRec = true; lsSet(BEST_KEY, JSON.stringify(G.best)); }
    }
  }
  function update(dt) {
    if (G.mode === 'play' && G.started) G.time += dt;
    if (G.msgT > 0) G.msgT -= dt;
    const v = G.vis;
    if (v && !v.live) {
      v.t += dt; const e = 1 - ease(Math.min(1, v.t / v.dur)); v.x = v.x0 * e;
      if (v.t >= v.dur) { G.vis = null; if (v.src !== 'scr') checkSolved(); }
    }
    if (!G.vis && G.queue.length && G.mode !== 'solved') { const q = G.queue.shift(); startMove(q.mv, q.src, q.dur); }
    if (!G.vis && !G.queue.length) {
      if (G.mode === 'scramble') G.mode = 'play';
      else if (G.mode === 'play') {
        if (G.hint) { G.hint.t += dt; if (G.hint.t >= 0.7) { const h = G.hint; G.hint = null; G.cheated = true; if (G.S.hist.length) { startMove(h.mv, 'hint', 0.35); G.S.hist.pop(); G.S.hist.pop(); } } }
        else if (G.auto) { const nm = nextSolveMove(); if (!nm) setAuto(false); else { G.cheated = true; startMove(nm, 'auto', 0.25); G.S.hist.pop(); G.S.hist.pop(); } }
      }
    }
  }
  function newGame(opt) {
    opt = opt || {};
    G.S = HC.create(); G.moves = 0; G.time = 0; G.started = false; G.vis = null; V.piece = null; G.queue = []; G.hint = null; G.cheated = false; G.newRec = false; setAuto(false);
    const cnt = 22 + Math.floor(rnd() * 6);
    if (G.animScr && !opt.instant) {
      const tmp = HC.create(), mvs = HC.scramble(tmp, cnt, rnd);
      if (HC.isSolved(tmp)) return newGame(opt);
      G.mode = 'scramble'; mvs.forEach((m) => enqueue(m, 'scr', 0.14));
    } else { HC.scramble(G.S, cnt, rnd); if (HC.isSolved(G.S)) return newGame(opt); G.mode = 'play'; }
  }

  /* ---------- projection ---------- */
  let cy = 1, sy = 0, cp = 1, sp = 0, scale = 100, ox = 0, oyy = 0;
  function tr(p) { const xr = p[0] * cy - p[2] * sy, zr = p[0] * sy + p[2] * cy; return [xr, p[1] * cp + zr * sp, -p[1] * sp + zr * cp]; }
  function untr(c) { const y = c[1] * cp - c[2] * sp, z1 = c[1] * sp + c[2] * cp; return [c[0] * cy + z1 * sy, y, -c[0] * sy + z1 * cy]; }
  function proj(c) { const f = DC / (DC + c[2]); return [ox + c[0] * f * scale, oyy - c[1] * f * scale]; }
  function sp2(p) { return proj(tr(p)); }
  function hexRGB(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }
  const LIGHT = [-0.35, 0.8, -0.5];

  /* ---------- WebGL ---------- */
  const glc = document.getElementById('gl');
  let gl = null, GLP = null, GLB = null;
  (function initGL() {
    if (!glc) return;
    try { gl = glc.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false }) || glc.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return;
    const vs = 'attribute vec3 aPos; attribute vec3 aCol; uniform vec4 uK; uniform vec2 uZ; varying vec3 vCol; void main(){ float w = aPos.z + ' + DC.toFixed(3) + '; gl_Position = vec4(aPos.x * uK.x + uK.z * w, aPos.y * uK.y + uK.w * w, uZ.x * w + uZ.y, w); vCol = aCol; }';
    const fs = 'precision mediump float; varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 1.0); }';
    function sh(type, src) { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
    try {
      GLP = gl.createProgram(); gl.attachShader(GLP, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(GLP, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(GLP);
      if (!gl.getProgramParameter(GLP, gl.LINK_STATUS)) throw new Error('link');
      GLB = gl.createBuffer();
    } catch (e) { gl = null; GLP = null; }
    if (!gl) { glc.style.display = 'none'; document.body.style.background = '#141a2b'; }
  })();
  function drawGL(fv, lv, cw, ch) {
    const W = Math.floor(cw * V.dpr), H = Math.floor(ch * V.dpr);
    if (glc.width !== W || glc.height !== H) { glc.width = W; glc.height = H; }
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(GLP); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    const n = DC - 2.2, f = DC + 2.2;
    gl.uniform4f(gl.getUniformLocation(GLP, 'uK'), 2 * DC * scale / cw, 2 * DC * scale / ch, 2 * ox / cw - 1, 1 - 2 * oyy / ch);
    gl.uniform2f(gl.getUniformLocation(GLP, 'uZ'), (f + n) / (f - n), -2 * f * n / (f - n));
    gl.bindBuffer(gl.ARRAY_BUFFER, GLB);
    const aP = gl.getAttribLocation(GLP, 'aPos'), aC = gl.getAttribLocation(GLP, 'aCol');
    gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aC);
    function pass(arr) {
      if (!arr.length) return;
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STREAM_DRAW);
      gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, arr.length / 6);
    }
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1); pass(fv); gl.disable(gl.POLYGON_OFFSET_FILL);
    pass(lv);
  }
  function layout() { V.dpr = window.devicePixelRatio || 1; V.cw = window.innerWidth; V.ch = window.innerHeight; cv.width = Math.floor(V.cw * V.dpr); cv.height = Math.floor(V.ch * V.dpr); }
  function txt(s, x, y, size, color, align, bold) { ctx.font = (bold ? 'bold ' : '') + size + 'px system-ui, "Malgun Gothic", sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(s, x, y); }

  /* ---------- drawing ---------- */
  let btns = [], lastOut = [], freeSet = [];
  function pieceFaces(i) {                         // world polygons of piece i including the visual turn
    const pc = G.S.pieces[i], v = G.vis;
    if (v && v.set.indexOf(i) >= 0 && v.x) { const M = HC.rotMat(HC.NORMALS[v.p], v.x); return pc.W.map((f) => f.map((p) => HC.app(M, p))); }
    return pc.W;
  }
  function draw() {
    const cw = V.cw, ch = V.ch; if (cw < 80 || ch < 120) return;
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    cy = Math.cos(V.yaw); sy = Math.sin(V.yaw); cp = Math.cos(V.pitch); sp = Math.sin(V.pitch);
    const areaH = ch - 130; scale = Math.min(cw * 0.235, areaH * 0.245); ox = cw / 2; oyy = 64 + areaH / 2;
    const out = [], fv = [], lv = [];
    function ribbon(P, Q, hw, bias, col) {
      const dx = Q[0] - P[0], dy = Q[1] - P[1], len = Math.hypot(dx, dy); if (len < 1e-6) return;
      const nx = -dy / len * hw, ny = dx / len * hw, z0 = P[2] - bias, z1 = Q[2] - bias, a1 = [P[0] + nx, P[1] + ny, z0], a2 = [P[0] - nx, P[1] - ny, z0], b1 = [Q[0] + nx, Q[1] + ny, z1], b2 = [Q[0] - nx, Q[1] - ny, z1];
      [a1, a2, b1, a2, b2, b1].forEach((v) => { lv.push(v[0], v[1], v[2], col[0], col[1], col[2]); });
    }
    const SEAM = [0.016, 0.022, 0.05], CORE = [0.8, 0.82, 0.9];
    const dragP = V.piece && V.piece.p !== undefined ? V.piece.p : -1;
    G.S.pieces.forEach((pc, i) => {
      const W = pieceFaces(i);
      pc.home.forEach((hf, k) => {
        const c3 = W[k].map(tr); let ctr = [0, 0, 0]; c3.forEach((p) => { ctr[0] += p[0]; ctr[1] += p[1]; ctr[2] += p[2]; }); ctr = ctr.map((x) => x / c3.length);
        const A = c3[0], B = c3[1], C = c3[2], ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const w0 = pieceFaces(i)[k], cen = [0, 0, 0]; w0.forEach((p) => { cen[0] += p[0] / w0.length; cen[1] += p[1] / w0.length; cen[2] += p[2] / w0.length; });
        const pcen = [0, 0, 0]; let tot = 0; pieceFaces(i).forEach((f) => f.forEach((p) => { pcen[0] += p[0]; pcen[1] += p[1]; pcen[2] += p[2]; tot++; }));
        const pc3 = tr([pcen[0] / tot, pcen[1] / tot, pcen[2] / tot]);
        if (nx * (ctr[0] - pc3[0]) + ny * (ctr[1] - pc3[1]) + nz * (ctr[2] - pc3[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }          // outward from the piece
        const l = Math.hypot(nx, ny, nz) || 1, lit = 0.6 + 0.4 * Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / l), back = nx * ctr[0] + ny * ctr[1] + nz * (ctr[2] + DC) >= 0;
        const outer = hf.tag >= 0, rgb = hexRGB(outer ? COL[hf.tag] : INNER), kk = outer ? lit : lit * 0.8;
        const r = Math.min(1, rgb[0] * kk), g = Math.min(1, rgb[1] * kk), b = Math.min(1, rgb[2] * kk);
        if (gl) {
          for (let q = 1; q + 1 < c3.length; q++) [c3[0], c3[q], c3[q + 1]].forEach((p) => { fv.push(p[0], p[1], p[2], r, g, b); });
          if (outer) for (let q = 0; q < c3.length; q++) { const P = c3[q], Q = c3[(q + 1) % c3.length]; ribbon(P, Q, 0.011, 0.01, SEAM); ribbon(P, Q, 0.0035, 0.018, CORE); }
        }
        if (outer && !back) out.push({ pts: c3.map(proj), z: ctr[2], piece: i, world: W[k], n: [nx / l, ny / l, nz / l], col: lit, tag: hf.tag, c3: c3 });
        else if (!gl) out.push({ pts: c3.map(proj), z: ctr[2], piece: -1, color: outer ? COL[hf.tag] : INNER, lit: kk, back: back, c3: c3 });
      });
    });
    lastOut = out.filter((f) => f.piece >= 0);
    if (gl) { drawGL(fv, lv, cw, ch); ctx.clearRect(0, 0, cw, ch); }
    else {
      out.sort((a, b) => b.z - a.z);
      ctx.fillStyle = '#141a2b'; ctx.fillRect(0, 0, cw, ch);
      out.forEach((f) => {
        if (f.back && f.piece < 0) return;
        const rgb = hexRGB(f.color || COL[f.tag]), k = f.lit || f.col || 1;
        ctx.beginPath(); f.pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
        ctx.fillStyle = 'rgb(' + Math.round(Math.min(255, rgb[0] * 255 * k)) + ',' + Math.round(Math.min(255, rgb[1] * 255 * k)) + ',' + Math.round(Math.min(255, rgb[2] * 255 * k)) + ')'; ctx.fill();
        ctx.lineJoin = 'round'; ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(4,6,12,.95)'; ctx.stroke(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.stroke();
      });
    }
    txt(TX.name, cw / 2, 24, 22, '#e8eefc', 'center', true);
    txt(TX.moves + ' ' + G.moves + '   ' + TX.time + ' ' + fmtTime(G.time) + (G.best ? '   ' + TX.best + ' ' + G.best.moves + ' / ' + fmtTime(G.best.time) : ''), cw / 2, 48, 14, '#9aa8c8', 'center');
    if (G.mode === 'scramble') txt(TX.scr, cw / 2, 70, 14, '#ffd23c', 'center');
    else if (G.hint) txt(TX.next + ': ' + desc(G.hint.mv), cw / 2, 70, 14, '#3f6', 'center');
    else if (G.msgT > 0) txt(G.msg, cw / 2, 70, 13, '#ff9a8a', 'center');
    else if (G.vis && G.vis.live) txt('#' + (G.vis.p + 1) + '   ' + (HC.normAng(G.S.ang[G.vis.p]) / DEG).toFixed(2) + '° → ' + (HC.normAng(targetOf(G.vis.p, G.vis.x)) / DEG).toFixed(2) + '°', cw / 2, 70, 14, '#9ad0ff', 'center');
    else if (!G.vis) { let n = 0; for (let p = 0; p < NP; p++) if (HC.isFree(G.S, p)) n++; if (n < NP) txt(TX.free + ': ' + n + ' / ' + NP, cw / 2, 70, 13, '#ffb86b', 'center'); }
    btns = [];
    { const parts = TX.hintTxt.split(' · '), h = Math.ceil(parts.length / 2); txt(parts.slice(0, h).join(' · '), cw / 2, ch - 30, 12, '#7d89a8', 'center'); txt(parts.slice(h).join(' · '), cw / 2, ch - 14, 12, '#7d89a8', 'center'); }
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
  function inPoly(pts, x, y) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { if (((pts[i][1] > y) !== (pts[j][1] > y)) && (x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0])) c = !c; } return c; }
  function hitTest(x, y) {                                       // frontmost outer sticker under the pointer: {piece, point (world)}
    let best = null;
    for (const f of lastOut) if (inPoly(f.pts, x, y) && (!best || f.z < best.z)) best = f;
    if (!best) return null;
    const N = best.n, P0 = best.c3[0], d = N[0] * P0[0] + N[1] * P0[1] + N[2] * P0[2], u = (x - ox) / scale, v = (oyy - y) / scale, a = (N[0] * u + N[1] * v) / DC, t = (d - a * DC) / (a + N[2]);
    return { piece: best.piece, point: untr([u * (DC + t) / DC, v * (DC + t) / DC, t]) };
  }
  function targetOf(p, x) {                                      // the resting position (angle from home) nearest to where the drag has taken the prism
    const cur = G.S.ang[p], want = cur + x; let best = 0, bd = 1e9;
    HC.STOPS.forEach((st) => { for (let k = -1; k <= 1; k++) { const t = st + k * 2 * Math.PI, d = Math.abs(t - want); if (d < bd) { bd = d; best = t; } } });
    return best;
  }
  function allowedAngle(p, x) { const d = targetOf(p, x) - G.S.ang[p]; return Math.abs(d) < 1e-7 ? 0 : d; }   // the turn to make (0 = cancel)
  function planeChoice(pk, dx, dy) {                              // the free prism that holds the piece and turns most along the drag
    const m = [];
    const S = G.S; let bestP = -1, bs = 0.35, bt = null;
    for (let p = 0; p < NP; p++) {
      if (S.pieces[pk.piece].lim[p][0] < HC.H - 1e-6) continue;
      m.push(p);
      const ax = HC.NORMALS[p], r = pk.point, T = [ax[1] * r[2] - ax[2] * r[1], ax[2] * r[0] - ax[0] * r[2], ax[0] * r[1] - ax[1] * r[0]], tl = Math.hypot(T[0], T[1], T[2]);
      if (tl < 0.25) continue;
      const e = 0.02, a = sp2(r), b = sp2([r[0] + T[0] * e, r[1] + T[1] * e, r[2] + T[2] * e]), tx = (b[0] - a[0]) / e, ty = (b[1] - a[1]) / e, ml = Math.hypot(tx, ty) || 1;
      const cs = Math.abs(dx * tx + dy * ty) / (Math.hypot(dx, dy) * ml) * Math.min(1, ml / 60);
      if (cs > bs || bestP < 0 && cs > 0.2) { bs = Math.max(bs, cs); bestP = p; bt = { tx: tx, ty: ty, ml: ml }; }
    }
    return { p: bestP, cand: m, t: bt };
  }
  cv.addEventListener('pointerdown', function (e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const b of btns) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    try { cv.setPointerCapture(e.pointerId); } catch (z) {}
    const pk = G.mode === 'solved' || busy() || (G.vis && G.vis.live) ? null : hitTest(x, y);
    if (pk) { V.piece = { pk: pk, x0: x, y0: y, p: undefined }; V.drag = null; }
    else { V.piece = null; V.drag = { x: e.clientX, y: e.clientY }; }
  });
  cv.addEventListener('pointermove', function (e) {
    if (V.drag) { V.yaw -= (e.clientX - V.drag.x) * 0.01; V.pitch = Math.max(0.15, Math.min(1.45, V.pitch + (e.clientY - V.drag.y) * 0.008)); V.drag.x = e.clientX; V.drag.y = e.clientY; return; }
    const pc = V.piece; if (!pc) return;
    const r = cv.getBoundingClientRect(), dx = e.clientX - r.left - pc.x0, dy = e.clientY - r.top - pc.y0;
    if (pc.p === undefined) {
      if (Math.hypot(dx, dy) < 9) return;
      const ch = planeChoice(pc.pk, dx, dy);
      if (ch.p < 0) { say(ch.cand.length ? TX.locked : TX.none); V.piece = null; return; }
      const set = HC.members(G.S, ch.p);
      if (!set) { say(TX.locked); V.piece = null; return; }
      pc.p = ch.p; pc.t = ch.t; pc.set = set;
    }
    const t = pc.t, x = 1.6 * (dx * t.tx + dy * t.ty) / (t.ml * t.ml);                    // radians of turn along the drag
    G.vis = { p: pc.p, set: pc.set, x: Math.max(-2 * Math.PI, Math.min(2 * Math.PI, x)), x0: 0, t: 0, dur: 0.2, live: true, src: 'user' };
  });
  function endDrag(e) {
    V.drag = null;
    const pc = V.piece; V.piece = null;
    if (!pc || pc.p === undefined || !G.vis || !G.vis.live) return;
    const a = allowedAngle(pc.p, G.vis.x);
    if (Math.abs(a) < 1e-9) { const v = G.vis; v.live = false; v.x0 = v.x; v.t = 0; v.src = 'cancel'; return; }
    if (!startMove({ p: pc.p, a: a }, 'user')) G.vis = null;
  }
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', function () { endDrag(null); });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyU' || e.code === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.code === 'Space' || e.code === 'Enter') { if (G.mode === 'solved') { e.preventDefault(); newGame(); } }
  });
  window.addEventListener('resize', layout);

  /* ---------- exports for the shell ---------- */
  window.newGame = function () { newGame(); };
  window.toggleAuto = function () { if (G.mode === 'solved') return false; setAuto(!G.auto); return G.auto; };
  window.giveHint = function () { if (G.mode !== 'play' || busy() || G.vis || G.hint) return; const nm = nextSolveMove(); if (!nm) return; G.hint = { t: 0, mv: nm }; };
  window.toggleScrambleAnim = function () { G.animScr = !G.animScr; lsSet('rubik_anim', G.animScr ? '1' : '0'); return G.animScr; };
  window.getScrambleAnim = function () { return G.animScr; };
  window.addEventListener('message', function (e) { const m = e.data; if (m && m.rbCmd && typeof window[m.rbCmd] === 'function') window[m.rbCmd](); });
  window.__hc = { G: G, HC: HC, V: V, step: function (dt) { update(dt); }, out: function () { return lastOut; }, hit: hitTest, move: function (p, a) { return userMove({ p: p, a: a }); }, sp2: sp2 };

  let last = 0;
  function frame(now) { requestAnimationFrame(frame); if (!last) last = now; const dt = Math.min(0.1, (now - last) / 1000); last = now; update(dt); draw(); }
  layout(); newGame(); requestAnimationFrame(frame);
})();
