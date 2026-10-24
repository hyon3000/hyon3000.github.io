// Square-n page: software 3D drawing of the three-layer puzzle (painter's algorithm), buttons / keys for the moves, scramble, auto solve (replays the history backwards) and hint.
(function () {
  'use strict';
  const KO = /^ko/i.test(navigator.language || 'ko'), SQ = window.SQ1;
  const N = +new URLSearchParams(location.search).get('n'), NV = isFinite(N) && new URLSearchParams(location.search).get('n') !== null ? N : 1;
  const PN = SQ.pieceCount(NV), LY = SQ.layout(PN), SEC = LY.S, DS = 360 / SEC, QUARTER = LY.quarter, GR = SQ.gran(PN), BIG = Math.max(GR, Math.round(SEC / 4 / GR) * GR);
  const cv = document.getElementById('app'), ctx = cv.getContext('2d');
  const TX = KO ? { name: '스퀘어-' + (NV < 0 ? '(' + NV + ')' : NV), moves: '이동', time: '시간', best: '최고', solved: '완성!', newRec: '신기록!', again: '새 게임 (F2)', slice: '슬라이스', top: '위층', bottom: '아래층', illegal: '조각이 걸려 있어 슬라이스를 할 수 없습니다', next: '다음 수', hintTxt: '빈 곳을 끌면 시점 회전 · 위/아래 조각을 옆으로 밀면 층 돌리기 · 가운데층을 위아래로 끌면 그쪽 절반 180도 회전', scr: '섞는 중...' }
    : { name: 'Square-' + (NV < 0 ? '(' + NV + ')' : NV), moves: 'Moves', time: 'Time', best: 'Best', solved: 'SOLVED!', newRec: 'New best!', again: 'New game (F2)', slice: 'Slice', top: 'Top', bottom: 'Bottom', illegal: 'A piece is in the way - the slice is not possible', next: 'Next move', hintTxt: 'Drag empty space to rotate the view · push a top / bottom piece sideways to turn its layer · drag the middle layer up / down to flip that half', scr: 'Scrambling...' };
  const FACE = ['#d91e18', '#0fa34a', '#ff7f0e', '#1f4fd8'], END = { W: '#f2f2f2', Y: '#ffd400' }, GRAY = '#697386';
  const D = 1, R2 = D * Math.SQRT2, TM = 0.4, TH = 0.8, DEG = Math.PI / 180;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function fmtTime(s) { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
  function rnd() { return Math.random(); }

  const G = { S: SQ.create(PN), sel: 0, moves: 0, time: 0, started: false, mode: 'play', anim: null, queue: [], auto: false, hint: null, msg: '', msgT: 0, animScr: lsGet('rubik_anim') !== '0', autoScr: lsGet('rubik_autoscr') !== '0', best: null, newRec: false, cheated: false };
  const V = { yaw: 0.6, pitch: 0.75, M: null, drag: null, cw: 0, ch: 0, dpr: 1 };
  const BEST_KEY = 'sq1_best_' + NV;
  try { G.best = JSON.parse(lsGet(BEST_KEY) || 'null'); } catch (e) { G.best = null; }
  function say(t, s) { G.msg = t; G.msgT = (s || 2.2); }

  /* ---------- outline of the cube shape and the rigid pieces ---------- */
  const VERT = []; for (let k = 0; k < 4; k++) VERT.push((LY.v0 + QUARTER * k) * DS);            // angles of the four corners of the square (degrees)
  function angDiff(a, b) { return Math.abs((((a - b) % 360) + 540) % 360 - 180); }
  function outR(theta) { let best = 180; for (let k = 0; k < 4; k++) best = Math.min(best, angDiff(theta, VERT[0] + 45 + 90 * k)); return D / Math.cos(best * DEG); }
  function faceAtAngle(theta) { const t = (((theta - VERT[0]) % 360) + 360) % 360; return Math.floor(t / 90) % 4; }
  const PP = LY.widths.map((w, p) => {                       // polygon of every piece in its own frame: points (r, local angle) from the first sector boundary
    const a0 = LY.starts[p] * DS, a1 = (LY.starts[p] + w) * DS, pts = [[0, 0], [outR(a0), 0]];
    for (let rep = -1; rep <= 1; rep++) VERT.forEach((va) => { const a = va + rep * 360; if (a > a0 + 1e-6 && a < a1 - 1e-6) pts.push([R2, a - a0]); });
    pts.sort((x, y) => (x[0] === 0 ? -1 : y[0] === 0 ? 1 : x[1] - y[1]));
    pts.push([outR(a1), a1 - a0]);
    const walls = []; for (let i = 1; i + 1 < pts.length; i++) walls.push({ i: i, j: i + 1, face: faceAtAngle(a0 + (pts[i][1] + pts[i + 1][1]) / 2) });
    return { pts: pts, delta: a1 - a0, walls: walls };
  });

  /* ---------- moves ---------- */
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  const NT = window.RBNotation.panel(function (text) { return runNotation(text); });
  const NS = { toks: [], x: 0, y: 0 };          // the notation so far: finished tokens and the turns waiting for the next slice
  function nsFlat(mv, st) {
    if (mv.t === 'r') { if (mv.l === 0) st.x += mv.s; else st.y -= mv.s; return; }          // (bottom: positive = clockwise seen from below, as in the WCA notation)
    const w = (v) => { v = ((v % SEC) + SEC) % SEC; return v > SEC / 2 ? v - SEC : v; };
    if (st.x || st.y) { if (w(st.x) || w(st.y)) st.toks.push('(' + w(st.x) + ',' + w(st.y) + ')'); st.x = st.y = 0; }
    st.toks.push('/');
  }
  function nsText(st) { const w = (v) => { v = ((v % SEC) + SEC) % SEC; return v > SEC / 2 ? v - SEC : v; }; return st.toks.concat(w(st.x) || w(st.y) ? ['(' + w(st.x) + ',' + w(st.y) + ')'] : []).join(' '); }
  function nsReset() { NS.toks = []; NS.x = NS.y = 0; NT.raw(''); }
  function runNotation(text) {
    if (G.mode === 'scramble' || G.anim || G.queue.length) return KO ? '움직이는 중입니다' : 'Busy';
    let seq; try { seq = window.RBNotation.parseSq1(text); } catch (e) { return e.message; }
    if (!seq.length) return true;
    if (G.mode === 'solved') { G.mode = 'play'; G.moves = 0; G.time = 0; G.started = false; G.cheated = false; G.newRec = false; }
    setAuto(false); G.hint = null; NT.plan('');
    seq.forEach((t) => { if (t.slice) enqueue({ t: 's', h: 0 }, 'nota'); else { if (t.x) enqueue({ t: 'r', l: 0, s: t.x }, 'nota'); if (t.y) enqueue({ t: 'r', l: 1, s: -t.y }, 'nota'); } });
    return true;
  }
  function showPlan() {
    const X = extSolver(), pl = X && X.plan ? X.plan(G.S) : null, st = { toks: [], x: 0, y: 0 };
    if (pl) pl.forEach((m) => nsFlat(m, st)); else { const h = G.S.hist; for (let i = h.length - 1; i >= 0; i--) nsFlat(SQ.inverse(h[i]), st); }
    NT.plan(nsText(st));
  }
  function startMove(mv, src, dur, from) {
    if (!SQ.apply(G.S, mv)) { if (src === 'user' || src === 'nota') { say(TX.illegal); if (src === 'nota') G.queue = []; } return false; }
    if (src !== 'scr') { nsFlat(mv, NS); NT.raw(nsText(NS)); }
    if (src !== 'scr' && src !== 'undo') { (G.done = G.done || []).push(mv); if (src !== 'redo') G.redo = []; }          // (undo / redo stacks)
    G.anim = { mv: mv, src: src, dir: mv.dir || 1, from: from, t: 0, dur: dur || (mv.t === 's' ? 0.45 : 0.16 + 0.015 * Math.abs(mv.s)) };
    if (src === 'user' || src === 'nota') { G.moves++; G.started = true; }
    return true;
  }
  function enqueue(mv, src, dur) { G.queue.push({ mv: mv, src: src, dur: dur }); }
  function userMove(mv, from, dur) {          // from: the visual offset a dragged layer / slice has when it is let go (see buildFaces)
    if (G.mode === 'solved') return;
    if (G.auto) setAuto(false);
    G.hint = null;
    if (G.anim || G.queue.length) { if (G.queue.length < 3) enqueue(mv, 'user'); return; }
    startMove(mv, 'user', dur, from);
  }
  function rot(s) { userMove({ t: 'r', l: G.sel, s: s }); }
  function doSlice(h, dir) { userMove({ t: 's', h: h | 0, dir: dir || 1 }); }
  function undo() {
    if (G.mode === 'solved' || G.anim || G.queue.length || V.live || G.hint || !(G.done || []).length) return; if (G.auto) setAuto(false);
    const e = G.done.pop(); (G.redo = G.redo || []).push(e); if (!startMove(SQ.inverse(e), 'undo')) G.done.push(G.redo.pop());
  }
  function redo() {
    if (G.mode === 'solved' || G.anim || G.queue.length || V.live || G.hint || !(G.redo || []).length) return; if (G.auto) setAuto(false);
    const e = G.redo.pop(); if (!startMove(e, 'redo')) G.redo.push(e);
  }
  function desc(mv) { return mv.t === 's' ? TX.slice : (mv.l === 0 ? TX.top : TX.bottom) + ' ' + (mv.s > 0 ? '◀' : '▶') + Math.abs(mv.s); }
  // Extra solvers that know nothing of the scramble: window.SQSOLVERS = [{ match(n) -> bool, next(S, G) -> {t,l,s} | {t:'s',h} | 'wait' | null (solved) | undefined (not handled), plan(S) -> [moves] | null }]
  function extSolver() { return (window.SQSOLVERS || []).find((s) => { try { return s.match(NV); } catch (e) { return false; } }); }
  function nextSolveMove() { const X = extSolver(); if (X) { const r = X.next(G.S, G); if (r !== undefined) return r; } const h = G.S.hist; return h.length ? SQ.inverse(h[h.length - 1]) : null; }
  function setAuto(on) { G.auto = !!on; G.autoTotal = 0; if (!on) NT.plan(''); try { window.parent.postMessage({ rb: 'autoState', on: G.auto }, '*'); } catch (e) {} }
  function checkSolved() {
    if (G.mode !== 'play' || !(G.started || G.cheated) || !SQ.isSolved(G.S)) return;
    G.S.hist = []; G.mode = 'solved'; setAuto(false);
    if (!G.cheated && G.moves > 0) {
      const b = G.best;
      if (!b || G.moves < b.moves || (G.moves === b.moves && G.time < b.time)) { G.best = { moves: G.moves, time: G.time }; G.newRec = true; lsSet(BEST_KEY, JSON.stringify(G.best)); }
    }
  }
  function update(dt) {
    if (G.mode === 'play' && G.started) G.time += dt;
    if (G.msgT > 0) G.msgT -= dt;
    if (V.live && V.live.settle) { const st = V.live.settle; st.t += dt; V.live.f = 1 - ease(Math.min(1, st.t / st.dur)); if (st.t >= st.dur) V.live = null; }
    if (G.anim) { G.anim.t += dt; if (G.anim.t >= G.anim.dur) { const a = G.anim; G.anim = null; if (a.src !== 'scr' && !(a.src === 'nota' && G.queue.length)) checkSolved(); } }
    if (!G.anim && G.queue.length && G.mode !== 'solved') { const q = G.queue.shift(); startMove(q.mv, q.src, q.dur); }
    if (!G.anim && !G.queue.length) {
      if (G.mode === 'scramble') G.mode = 'play';
      else if (G.mode === 'play') {
        if (G.hint) { G.hint.t += dt; if (G.hint.t >= 0.7) { const h = G.hint; G.hint = null; G.cheated = true; if (G.S.hist.length) startMove(h.mv, 'hint', 0.3); } }
        else if (G.auto) { const nm = nextSolveMove(); if (!nm) setAuto(false); else if (nm !== 'wait') { G.cheated = true; if (G.planWant) { G.planWant = false; showPlan(); } if (nm.t === 'r') G.sel = nm.l; if (!G.autoTotal) { let pl = null; try { const X = extSolver(); pl = X && X.plan ? X.plan(G.S) : null; } catch (e) {} G.autoTotal = pl ? pl.length : G.S.hist.length + 1; } const pc = window.RBNotation.pace(G.autoTotal, dt, nm.t === 's' ? 0.35 : 0.22); startMove(nm, 'auto', pc.dur); for (let b = 0; b < pc.burst; b++) { const n2 = nextSolveMove(); if (!n2) break; if (n2.t === 'r') G.sel = n2.l; startMove(n2, 'auto', 0.001); } } }
      }
    }
  }
  function newGame(opt) {
    opt = opt || {};
    G.S = SQ.create(PN); G.sel = 0; G.moves = 0; G.time = 0; G.started = false; G.anim = null; G.queue = []; G.hint = null; G.cheated = false; G.newRec = false; G.done = []; G.redo = []; setAuto(false); nsReset();
    const cnt = Math.min(200, 16 + Math.round(1.3 * SEC));
    if (!G.autoScr) { G.mode = 'play'; return; }          // no automatic scramble: the player scrambles it; a solved state does not count before the first move
    if (G.animScr && !opt.instant) {
      const tmp = SQ.create(PN), mvs = SQ.scramble(tmp, cnt, rnd);
      if (SQ.isSolved(tmp)) return newGame(opt);
      G.mode = 'scramble'; mvs.forEach((m) => enqueue(m, 'scr', m.t === 's' ? 0.2 : 0.07));
    } else { SQ.scramble(G.S, cnt, rnd); if (SQ.isSolved(G.S)) return newGame(opt); G.mode = 'play'; }
  }

  /* ---------- projection ---------- */
  let cy = 1, sy = 0, cp = 1, sp = 0, scale = 100, ox = 0, oyy = 0;
  const DC = 6.5;
  function mul3(A, B) { const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; }
  // the view is a rotation matrix (a trackball): a drag turns it about the screen axes, so the pole is no obstacle (no limit, no gimbal lock); V.M = null means "from V.yaw / V.pitch"
  function curM() { if (V.M) return V.M; const c1 = Math.cos(V.yaw), s1 = Math.sin(V.yaw), c2 = Math.cos(V.pitch), s2 = Math.sin(V.pitch); return (V.M = [c1, 0, -s1, s2 * s1, c2, s2 * c1, c2 * s1, -s2, c2 * c1]); }
  function turnView(da, db) { const c = Math.cos(da), s = Math.sin(da), c2 = Math.cos(db), s2 = Math.sin(db); V.M = mul3([1, 0, 0, 0, c2, s2, 0, -s2, c2], mul3([c, 0, -s, 0, 1, 0, s, 0, c], curM())); }
  function tr(p, extra) {
    let x = p[0], y = p[1], z = p[2];
    if (extra) { const c = Math.cos(extra), s = Math.sin(extra), nx = x * c - y * s, ny = x * s + y * c; x = nx; y = ny; }
    const M = curM();
    return [M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, M[6] * x + M[7] * y + M[8] * z];
  }
  function proj(c) { const f = DC / (DC + c[2]); return [ox + c[0] * f * scale, oyy - c[1] * f * scale]; }
  function shadeCol(hex, k) {
    const r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return 'rgb(' + Math.round(Math.min(255, r * k)) + ',' + Math.round(Math.min(255, g * k)) + ',' + Math.round(Math.min(255, b * k)) + ')';
  }

  /* ---------- faces ---------- */
  function buildFaces() {
    const faces = [], S = G.S, a = G.anim;
    let layerOff = null, sliceAng = 0;
    let sliceHalf = -1;
    if (a) { const e = ease(Math.min(1, a.t / a.dur)); if (a.mv.t === 'r') layerOff = { l: a.mv.l, deg: (a.from !== undefined ? a.from : -a.mv.s * DS) * (1 - e) }; else { sliceAng = (a.dir || 1) * Math.PI * (a.from !== undefined ? a.from : 1) * (1 - e); sliceHalf = a.mv.h | 0; } }
    else if (V.live) {          // a layer / slice being dragged: it follows the finger (the state changes only when it is let go)
      const lv = V.live, f = lv.f === undefined ? 1 : lv.f;
      if (lv.kind === 'r') layerOff = { l: lv.l, deg: lv.deg * f }; else { sliceAng = -lv.dir * Math.PI * lv.prog * f; sliceHalf = lv.half; }
    }
    let curGrp = 1;
    function addFace(pts3, color, outward, extra, sel, flat, pick) {
      const A = pts3[0], B = pts3[1], C = pts3[2];
      const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (nx * outward[0] + ny * outward[1] + nz * outward[2] < 0) pts3 = pts3.slice().reverse();
      faces.push({ w: pts3, color: color, extra: extra, sel: sel, outward: outward, flat: flat, pick: pick, grp: curGrp });
    }
    for (let l = 0; l < 2; l++) {
      const row = S.layers[l], yb = l === 0 ? TM / 2 : -TM / 2 - TH, yt = yb + TH, sel = l === G.sel;
      curGrp = l === 0 ? 2 : 0;
      for (let j = 0; j < SEC; j++) {
        const o = row[j]; if (row[(j + SEC - 1) % SEC] === o) continue;           // first sector of a piece
        const pp = PP[o.home], base = j * DS + (layerOff && layerOff.l === l ? layerOff.deg : 0), extra = ((j < SEC / 2 ? 0 : 1) === sliceHalf ? sliceAng : 0);
        const poly = pp.pts.map((p) => { const th = (o.flip ? pp.delta - p[1] : p[1]) + base; return [p[0] * Math.cos(th * DEG), p[0] * Math.sin(th * DEG)]; }), n = poly.length;
        const top = poly.map((p) => [p[0], yt, p[1]]), bot = poly.map((p) => [p[0], yb, p[1]]);
        let topCol = GRAY, botCol = GRAY;
        if (l === 0) { const c = o.flip ? o.down : o.up; if (c) topCol = END[c]; } else { const c = o.flip ? o.up : o.down; if (c) botCol = END[c]; }
        const pick = { l: l, j: j };
        addFace(top, topCol, [0, 1, 0], extra, sel, false, pick); addFace(bot, botCol, [0, -1, 0], extra, sel, false, pick);
        pp.walls.forEach((w) => {
          const p1 = poly[w.i], p2 = poly[w.j], mid = [(p1[0] + p2[0]) / 2, 0, (p1[1] + p2[1]) / 2];
          addFace([[p1[0], yb, p1[1]], [p2[0], yb, p2[1]], [p2[0], yt, p2[1]], [p1[0], yt, p1[1]]], FACE[w.face], mid, extra, sel, false, pick);
        });
        // the two radial sides of the piece (inside faces, grey)
        [[0, 1], [n - 1, 0]].forEach((e) => { const p1 = poly[e[0]], p2 = poly[e[1]], mid = [(p1[0] + p2[0]) / 2, 0, (p1[1] + p2[1]) / 2], nrm = [-(p2[1] - p1[1]), 0, (p2[0] - p1[0])]; addFace([[p1[0], yb, p1[1]], [p2[0], yb, p2[1]], [p2[0], yt, p2[1]], [p1[0], yt, p1[1]]], '#4a5266', nrm, extra, sel, false, pick); });
      }
    }
    // middle layer: two halves that follow the outline of the cube (angles 0..180 right half, 180..360 left half)
    curGrp = 1;
    const my = [-TM / 2, TM / 2];
    for (let half = 0; half < 2; half++) {
      // the right half is a rigid piece: after a slice it is the mirror image (across the 90 degree line) of its old self, outline and colours alike
      const extra = half === sliceHalf ? sliceAng : 0, th0 = half * 180, mir = S.mflip[half] === 1, angs = [0, 180];
      for (let t = 6; t < 180; t += 6) angs.push(t);
      VERT.forEach((va0) => { const va = mir ? 180 - va0 : va0; for (let rep = -2; rep <= 2; rep++) { const q = va + rep * 360 - th0; if (q > 1e-6 && q < 180 - 1e-6) angs.push(q); } });
      angs.sort((x, y) => x - y);
      const ring = angs.map((q) => { const th = th0 + q, r = mir ? outR(180 - th) : outR(th); return [r * Math.cos(th * DEG), r * Math.sin(th * DEG), th]; });
      const pickM = { m: half };
      addFace([[0, my[1], 0]].concat(ring.map((p) => [p[0], my[1], p[1]])), '#4b5366', [0, 1, 0], extra, false, false, pickM);
      addFace([[0, my[0], 0]].concat(ring.map((p) => [p[0], my[0], p[1]])), '#4b5366', [0, -1, 0], extra, false, false, pickM);
      for (let k = 0; k + 1 < ring.length; k++) {
        const p1 = ring[k], p2 = ring[k + 1], thm = (p1[2] + p2[2]) / 2, src = mir ? 180 - thm : thm;
        addFace([[p1[0], my[0], p1[1]], [p2[0], my[0], p2[1]], [p2[0], my[1], p2[1]], [p1[0], my[1], p1[1]]], FACE[faceAtAngle(src)], [(p1[0] + p2[0]) / 2, 0, (p1[1] + p2[1]) / 2], extra, false, true, pickM);
      }
      // vertical lines of the middle layer: the two seams between its two halves (strong) and the borders between the stickers of a half (thin)
      ring.forEach((p, k) => {
        const q = p[2] - th0, cut = k === 0 || k === ring.length - 1;
        let isVert = false; VERT.forEach((va0) => { const va = mir ? 180 - va0 : va0; for (let rep2 = -2; rep2 <= 2; rep2++) if (Math.abs(va + rep2 * 360 - th0 - q) < 1e-6) isVert = true; });
        if (!cut && !isVert) return;
        const nrm = [p[0], 0, p[1]];
        faces.push({ line: true, w: [[p[0], my[0], p[1]], [p[0], my[1], p[1]]], outward: nrm, extra: extra, grp: 1, strong: cut });
      });
      const e1 = ring[0], e2 = ring[ring.length - 1];
      addFace([[0, my[0], 0], [e1[0], my[0], e1[1]], [e1[0], my[1], e1[1]], [0, my[1], 0]], '#303644', [0, 0, half === 0 ? -1 : 1], extra, false, false, pickM);
      addFace([[0, my[0], 0], [e2[0], my[0], e2[1]], [e2[0], my[1], e2[1]], [0, my[1], 0]], '#303644', [0, 0, half === 0 ? 1 : -1], extra, false, false, pickM);
    }
    return faces;
  }

  /* ---------- drawing ---------- */
  let btns = [], lastOut = [];
  /* ---------- WebGL: a depth buffer instead of sorting ---------- */
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
    const n = DC - 3.2, f = DC + 3.2;
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
  function draw() {
    const cw = V.cw, ch = V.ch; if (cw < 80 || ch < 120) return;
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    const areaH = ch - 130; scale = Math.min(cw * 0.30, areaH * 0.31); ox = cw / 2; oyy = 64 + areaH / 2;
    const faces = buildFaces(), out = [], fv = [], lv = [];
    function hexRGB(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }
    function ribbon(P, Q, hw, bias, col) {                // a thin quad along the edge P-Q (camera space, facing the camera) - the seam lines of the depth-buffered view
      const dx = Q[0] - P[0], dy = Q[1] - P[1], len = Math.hypot(dx, dy); if (len < 1e-6) return;
      const nx = -dy / len * hw, ny = dx / len * hw, z0 = P[2] - bias, z1 = Q[2] - bias, a1 = [P[0] + nx, P[1] + ny, z0], a2 = [P[0] - nx, P[1] - ny, z0], b1 = [Q[0] + nx, Q[1] + ny, z1], b2 = [Q[0] - nx, Q[1] - ny, z1];
      [a1, a2, b1, a2, b2, b1].forEach((v) => { lv.push(v[0], v[1], v[2], col[0], col[1], col[2]); });
    }
    const SEAM = [0, 0, 0];                // every line is black and as thick as the gap between the tiles of the other puzzles
    faces.forEach((f) => {
      if (f.line) {
        const a3 = tr(f.w[0], f.extra), b3 = tr(f.w[1], f.extra);
        if (gl) ribbon(a3, b3, f.strong ? 0.024 : 0.016, 0.012, SEAM);
        return;
      }
      const c3 = f.w.map((p) => tr(p, f.extra)), o0 = tr([0, 0, 0], f.extra), n3 = tr(f.outward, f.extra), nn = [n3[0] - o0[0], n3[1] - o0[1], n3[2] - o0[2]];
      let ctr = [0, 0, 0]; c3.forEach((p) => { ctr[0] += p[0]; ctr[1] += p[1]; ctr[2] += p[2]; }); ctr = ctr.map((v) => v / c3.length);
      const A = c3[0], B = c3[1], C = c3[2], ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * nn[0] + ny * nn[1] + nz * nn[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1, lit = 0.8 + 0.22 * Math.max(0, (nx * -0.25 + ny * 0.5 - nz * 0.82) / l), back = nx * ctr[0] + ny * ctr[1] + nz * (ctr[2] + DC) >= 0;
      if (gl) {
        // every face of every piece goes to the depth buffer (fan triangles; all faces are convex)
        const rgb = hexRGB(f.color), r = Math.min(1, rgb[0] * lit), g = Math.min(1, rgb[1] * lit), b = Math.min(1, rgb[2] * lit);
        for (let i = 1; i + 1 < c3.length; i++) [c3[0], c3[i], c3[i + 1]].forEach((p) => { fv.push(p[0], p[1], p[2], r, g, b); });
        if (!f.flat) for (let i = 0; i < c3.length; i++) {
          const P = c3[i], Q = c3[(i + 1) % c3.length];
          ribbon(P, Q, 0.016, 0.01, SEAM);
        }
      }
      if (!back) out.push({ pts: c3.map(proj), z: ctr[2], color: shadeCol(f.color, lit), sel: f.sel, flat: f.flat, pick: f.pick, grp: f.grp, kind: f.outward[1] > 0.5 ? 2 : (f.outward[1] < -0.5 ? 0 : 1) });
    });
    lastOut = out;
    if (gl) { drawGL(fv, lv, cw, ch); ctx.clearRect(0, 0, cw, ch); }
    else {
      // fallback without WebGL: painter's algorithm - layers (bottom, middle, top), inside a layer undersides, walls far to near, top faces
      out.sort((a, b) => a.grp - b.grp || a.kind - b.kind || b.z - a.z);
      ctx.fillStyle = '#141a2b'; ctx.fillRect(0, 0, cw, ch);
      out.forEach((f) => {
        ctx.beginPath(); f.pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
        ctx.fillStyle = f.color; ctx.fill();
        if (f.flat) { ctx.lineWidth = 1; ctx.strokeStyle = f.color; ctx.stroke(); }
        else { ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = '#000'; ctx.stroke(); }
      });
    }
    txt(TX.name, cw / 2, 24, 22, '#e8eefc', 'center', true);
    txt(TX.moves + ' ' + G.moves + '   ' + TX.time + ' ' + fmtTime(G.time) + (G.best ? '   ' + TX.best + ' ' + G.best.moves + ' / ' + fmtTime(G.best.time) : ''), cw / 2, 48, 14, '#9aa8c8', 'center');
    if (G.mode === 'scramble') txt(TX.scr, cw / 2, 70, 14, '#ffd23c', 'center');
    else if (G.hint) txt(TX.next + ': ' + desc(G.hint.mv), cw / 2, 70, 14, '#3f6', 'center');
    else if (G.msgT > 0) txt(G.msg, cw / 2, 70, 13, '#ff9a8a', 'center');
    btns = [];
    { const can = G.mode === 'play' && !G.anim && !G.queue.length && !V.live && !G.hint, ub = window.RBNotation.undoBtns(ctx, 1, can && (G.done || []).length > 0, can && (G.redo || []).length > 0); ub.forEach((b) => btns.push({ x: b.x, y: b.y, w: b.w, h: b.h, act: function () { if (b.on) (b.id === 'undo' ? undo : redo)(); } })); }
    txt(TX.hintTxt, cw / 2, ch - 16, 12, '#7d89a8', 'center');
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
    if (e.code === 'ArrowLeft') { e.preventDefault(); rot(e.shiftKey ? BIG : GR); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); rot(e.shiftKey ? -BIG : -GR); }
    else if (e.code === 'ArrowUp') { e.preventDefault(); G.sel = 0; }
    else if (e.code === 'ArrowDown') { e.preventDefault(); G.sel = 1; }
    else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (G.mode === 'solved') newGame(); else doSlice(e.shiftKey ? 1 : 0); }
    else if (e.code === 'KeyU' || e.code === 'Backspace' || (e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey)) { e.preventDefault(); undo(); }
    else if (e.code === 'KeyY' && e.ctrlKey || e.code === 'KeyZ' && e.ctrlKey && e.shiftKey) { e.preventDefault(); redo(); }
  });
  // dragging a piece: along the layer (tangent) turns that layer, across the layers (up / down) flips the right half (the slice); a direction that is not possible is ignored
  function inPoly(pts, x, y) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { if (((pts[i][1] > y) !== (pts[j][1] > y)) && (x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0])) c = !c; } return c; }
  function hitTest(x, y) { let best = null, bz = 1e9; for (let i = 0; i < lastOut.length; i++) { const f = lastOut[i]; if (f.pick && f.z < bz && inPoly(f.pts, x, y)) { bz = f.z; best = f.pick; } } return best; }
  function worldOnMid(px, py) {                       // world (x, z) of the point of the middle plane (y = 0) under the screen point (px, py)
    const u = (px - ox) / scale, v = (oyy - py) / scale, den = sp - v * cp / DC;
    if (Math.abs(den) < 1e-6) return [0, 0];
    const z2 = v * cp / den, k = (DC + z2) / DC, xr = u * k, y2 = v * k, zr = z2 * cp + y2 * sp;
    return [xr * cy + zr * sy, -xr * sy + zr * cy];
  }
  function sp2(p) { return proj(tr(p)); }
  function pieceMetrics(pk) {
    const o = G.S.layers[pk.l][pk.j], w = LY.widths[o.home], al = (pk.j + w / 2) * DS * DEG, yy = pk.l === 0 ? TM / 2 + TH / 2 : -TM / 2 - TH / 2, r = 0.8;
    const P0 = [r * Math.cos(al), yy, r * Math.sin(al)], P1 = [r * Math.cos(al + DS * DEG), yy, r * Math.sin(al + DS * DEG)], PU = [P0[0], yy + 0.3, P0[2]];
    const a = sp2(P0), b = sp2(P1), u = sp2(PU), tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1, ux = u[0] - a[0], uy = u[1] - a[1], ul = Math.hypot(ux, uy) || 1;
    return { t: [tx / tl, ty / tl], per: tl, u: [ux / ul, uy / ul], right: pk.j < SEC / 2 && LY.widths[o.home] + pk.j <= SEC / 2 };
  }
  cv.addEventListener('pointerdown', function (e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const b of btns) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    try { cv.setPointerCapture(e.pointerId); } catch (z) {}
    const pk = G.mode === 'solved' ? null : hitTest(x, y);
    if (pk && pk.m !== undefined) { V.piece = null; V.mid = { half: pk.m, x0: x, y0: y, wx: worldOnMid(x, y)[0] }; V.drag = null; }       // the middle layer: a drag flips that half
    else if (pk) { G.sel = pk.l; V.mid = null; V.piece = { pk: pk, x0: x, y0: y, m: pieceMetrics(pk) }; V.drag = null; }
    else { V.piece = null; V.mid = null; V.drag = { x: e.clientX, y: e.clientY }; }
  });
  cv.addEventListener('pointermove', function (e) {
    const pc = V.piece, md = V.mid;
    if ((pc || md) && !(V.live && V.live.settle)) {
      const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      if (pc) {
        const dx = px - pc.x0, dy = py - pc.y0, dt = dx * pc.m.t[0] + dy * pc.m.t[1], dv = dx * pc.m.u[0] + dy * pc.m.u[1];
        if (!V.live && Math.hypot(dx, dy) >= 9 && Math.abs(dt) >= Math.abs(dv) && G.mode === 'play' && !G.anim && !G.queue.length) V.live = { kind: 'r', l: pc.pk.l, deg: 0 };
        if (V.live && V.live.kind === 'r') { const half = Math.floor(SEC / 2 / GR) * GR; V.live.deg = Math.max(-half, Math.min(half, dt / pc.m.per)) * DS; }
      } else {
        const dx = px - md.x0, dy = py - md.y0;
        if (!V.live && Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx) && SQ.sliceLegal(G.S) && G.mode === 'play' && !G.anim && !G.queue.length) V.live = { kind: 's', half: md.half, dir: -(dy < 0 ? 1 : -1) * (md.wx >= 0 ? 1 : -1), prog: 0 };
        if (V.live && V.live.kind === 's') V.live.prog = Math.min(1, Math.abs(dy) / 80);
      }
      return;
    }
    if (!V.drag) return; turnView(-(e.clientX - V.drag.x) * 0.01, (e.clientY - V.drag.y) * 0.008); V.drag.x = e.clientX; V.drag.y = e.clientY;
  });
  function endDrag(e) {
    V.drag = null;
    const lv = V.live; V.piece = null; V.mid = null;
    if (lv && !lv.settle) {          // let go: to the nearest detent (a turn) or back (nothing)
      if (lv.kind === 'r') {
        const half = Math.floor(SEC / 2 / GR) * GR, steps = Math.max(-half, Math.min(half, GR * Math.round(lv.deg / DS / GR)));
        if (steps && e) { V.live = null; userMove({ t: 'r', l: lv.l, s: steps }, lv.deg - steps * DS, 0.12); return; }
      } else if (lv.prog > 0.5 && e && SQ.sliceLegal(G.S)) { V.live = null; userMove({ t: 's', h: lv.half, dir: lv.dir }, 1 - lv.prog, 0.15); return; }
      lv.settle = { t: 0, dur: 0.12 }; return;
    }
  }
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', function () { endDrag(null); });
  window.addEventListener('resize', layout);

  /* ---------- exports for the shell ---------- */
  window.newGame = function () { newGame(); };
  window.toggleAuto = function () { if (G.mode === 'solved') return false; setAuto(!G.auto); if (G.auto) { showPlan(); G.planWant = true; } return G.auto; };
  window.toggleNotation = function () { return NT.toggleInput(); };
  window.runNotation = runNotation;
  window.giveHint = function () { if (G.mode !== 'play' || G.anim || G.queue.length || G.hint) return; const nm = nextSolveMove(); if (!nm || nm === 'wait') return; if (nm.t === 'r') G.sel = nm.l; G.hint = { t: 0, mv: nm }; };
  window.toggleScrambleAnim = function () { G.animScr = !G.animScr; lsSet('rubik_anim', G.animScr ? '1' : '0'); return G.animScr; };
  window.getScrambleAnim = function () { return G.animScr; };
  window.toggleAutoScramble = function () { G.autoScr = !G.autoScr; lsSet('rubik_autoscr', G.autoScr ? '1' : '0'); return G.autoScr; };
  window.getAutoScramble = function () { return G.autoScr; };
  window.addEventListener('message', function (e) { const m = e.data; if (m && m.rbCmd && typeof window[m.rbCmd] === 'function') window[m.rbCmd](); });
  NT.enable(true);
  window.__sq = { G: G, SQ: SQ, step: function (dt) { update(dt); }, LY: LY, V: V, out: function () { return lastOut; }, metrics: function (pk) { return pieceMetrics(pk); }, wom: function (x, y) { return worldOnMid(x, y); }, slice: function (h, dir) { doSlice(h, dir); }, tr: tr, proj: proj, hit: function (x, y) { return hitTest(x, y); } };

  let last = 0;
  function frame(now) { requestAnimationFrame(frame); if (!last) last = now; const dt = Math.min(0.1, (now - last) / 1000); last = now; update(dt); draw(); }
  layout(); newGame(); requestAnimationFrame(frame);
})();
