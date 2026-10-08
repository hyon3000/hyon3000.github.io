// Cube Puzzles - game page: software Canvas2D 3D renderer (painter's algorithm), input, game flow, solvers glue.
(function () {
  'use strict';
  const KO = /^ko/i.test(navigator.language || 'ko');
  const E = window.RBEngine, V = E.V, PZ = window.RBPuzzles;
  const canvas = document.getElementById('app'), ctx = canvas.getContext('2d');
  const D = 4.4;                                         // camera distance (puzzle radius = 1)
  const T = KO ? {
    names: { cube5: '큐브 5×5 (5x5x5)', icosa: '정이십면체', cube: '큐브 (3x3x3)', tetra: '정사면체', octa: '정팔면체', dodeca: '정십이면체' },
    moves: '이동', time: '시간', best: '최고', solved: '완성!', solvedAuto: '완성 (치트 사용: 기록 없음)', newRec: '신기록!', again: '새 게임 (F2)',
    wait: '해법 계산 중...', prep: '해법 계산기 준비 중...', hint: '빈 곳을 끌어 돌려 보기 · 조각을 밀어 층 돌리기', keys: 'F2 새 게임 · F3 자동 풀기 · F4 힌트', scr: '섞는 중...',
  } : {
    names: { cube5: '5x5x5 Cube', icosa: 'Icosahedron', cube: 'Cube (3x3x3)', tetra: 'Tetrahedron', octa: 'Octahedron', dodeca: 'Dodecahedron' },
    moves: 'Moves', time: 'Time', best: 'Best', solved: 'SOLVED!', solvedAuto: 'SOLVED (cheat used: no record)', newRec: 'New best!', again: 'New game (F2)',
    wait: 'Computing solution...', prep: 'Preparing the solver...', hint: 'Drag empty space to rotate the view · swipe a piece to turn its layer', keys: 'F2 new game · F3 auto-solve · F4 hint', scr: 'Scrambling...',
  };

  // ------------------------------------------------------------------ small helpers
  let rngState = 0;
  function rand() { if (!rngState) return Math.random(); rngState = (rngState + 0x6D2B79F5) | 0; let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function hex2rgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function fmtTime(s) { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
  function loadBest() { try { return JSON.parse(lsGet('rubik_best_v1') || '{}') || {}; } catch (e) { return {}; } }

  // ------------------------------------------------------------------ state
  const G = {
    key: 'cube', P: null, col: null, hist: [], queue: [], anim: null, mode: 'play', moves: 0, time: 0, started: false, cheated: false, auto: false,
    hint: null, applied: 0, newRec: false, animScramble: lsGet('rubik_anim') !== '0', lastSolveMs: 0,
  };
  const S = { cw: 0, ch: 0, dpr: 1, yaw: 0.5, pitch: 0.4, f: 1, cx: 0, cy: 0, down: null, drag: null, held: { l: 0, r: 0, u: 0, d: 0 }, rgb: [], btn: null, ptr: null };
  let sigCache = '';

  function setTheme(key) {
    if (!PZ.META[key]) key = 'cube';
    G.key = key; G.P = PZ.get(key); S.yaw = G.P.meta.view.yaw; S.pitch = G.P.meta.view.pitch;
    S.rgb = G.P.meta.colours.map(hex2rgb);
    lsSet('rubik_theme', key);
    document.title = T.names[key];
    if (key === 'cube') cubeInit();
    if (key === 'tetra') setTimeout(function () { try { G.P.initSolver(); } catch (e) {} }, 30);
    newGame();
  }

  // ------------------------------------------------------------------ moves
  function sigOf(col) { return String.fromCharCode.apply(null, col); }
  function enqueue(b, d, src, dur) { G.queue.push({ b: b, d: d, src: src, dur: dur }); }
  function userDur() { return 0.22; }
  function applyNow(b, d, src) {
    const P = G.P;
    G.col = P.apply(G.col, P.moveOf(b, d));
    P.histPush(G.hist, b, d);
    G.applied++;
    if (src === 'user') { G.moves++; G.started = true; }
    if (src !== 'scr') checkSolved();
  }
  function checkSolved() {
    if (G.mode !== 'play' || !G.P.isSolved(G.col)) return;
    G.hist = [];
    if (!(G.started || G.cheated)) return;
    G.mode = 'solved'; setAuto(false); G.hint = null; G.queue = [];
    if (!G.cheated) {
      const all = loadBest(), cur = all[G.key] || {}; G.newRec = false;
      if (cur.time === undefined || G.time < cur.time) { cur.time = G.time; G.newRec = true; }
      if (cur.moves === undefined || G.moves < cur.moves) { cur.moves = G.moves; G.newRec = true; }
      all[G.key] = cur; lsSet('rubik_best_v1', JSON.stringify(all));
    }
  }
  function genScramble(n) {
    const P = G.P, out = []; let lastLine = -1;
    while (out.length < n) {
      const b = P.scrambleBands[Math.floor(rand() * P.scrambleBands.length)], line = P.bands[b].line;
      if (line === lastLine) continue;
      lastLine = line; out.push({ b: b, d: rand() < 0.5 ? 1 : -1 });
    }
    return out;
  }
  function newGame(o) {
    o = o || {};
    const P = G.P;
    setAuto(false); G.queue = []; G.anim = null; G.hint = null; CS.plan = null;
    G.col = P.solvedCol.slice(); G.hist = []; G.moves = 0; G.time = 0; G.started = false; G.cheated = false; G.newRec = false; G.applied = 0;
    const seq = genScramble(o.n || P.meta.scramble);
    G.mode = 'scramble';
    if (o.instant || !G.animScramble) {
      seq.forEach((m) => applyNow(m.b, m.d, 'scr'));
      if (P.isSolved(G.col)) { return newGame(o); }
      G.mode = 'play';
    } else {
      const dur = Math.min(0.14, 1.5 / seq.length);
      seq.forEach((m) => enqueue(m.b, m.d, 'scr', dur));
    }
    return true;
  }
  function setAuto(on) {
    if (G.auto === !!on) return;
    G.auto = !!on;
    try { if (window.parent !== window) window.parent.postMessage({ rb: 'autoState', on: G.auto }, '*'); } catch (e) {}
  }
  window.toggleAuto = function () {
    if (G.mode !== 'play') return false;
    if (G.auto) { setAuto(false); return false; }
    if (G.P.isSolved(G.col)) return false;
    G.hint = null; G.cheated = true; setAuto(true); return true;
  };
  window.giveHint = function () {
    if (G.mode !== 'play' || G.hint || G.anim || G.queue.length || G.P.isSolved(G.col)) return false;
    setAuto(false); G.cheated = true; G.hint = { phase: 'wait', t: 0 }; return true;
  };
  window.newGame = function () { newGame(); return true; };
  window.toggleScrambleAnim = function () { G.animScramble = !G.animScramble; lsSet('rubik_anim', G.animScramble ? '1' : '0'); return G.animScramble; };
  window.getScrambleAnim = function () { return G.animScramble; };
  window.setTheme = setTheme;

  // ------------------------------------------------------------------ solvers
  // cube: Kociemba two-phase (vendor/cubejs) in a Web Worker; tables are built lazily in the worker, the page never freezes
  const CS = { worker: null, ready: false, failed: false, pending: false, plan: null, sigs: null, initMs: 0, t0: 0, main: false, id: 0, reqCol: null };
  function cubeInit() {
    if (CS.worker || CS.failed || CS.main) return;
    CS.t0 = performance.now();
    if (new URLSearchParams(location.search).get('noworker')) { cubeMainThread(); return; }
    try {
      CS.worker = new Worker('vendor/cubejs/worker.js');
      CS.worker.onmessage = function (ev) {
        const m = ev.data;
        if (m.cmd === 'init') { CS.ready = true; CS.initMs = Math.round(performance.now() - CS.t0); }
        else if (m.cmd === 'solve' && m.id === CS.id) { CS.pending = false; if (m.error || typeof m.algorithm !== 'string') { CS.failed = true; return; } planFrom(m.algorithm, m.ms); }
      };
      CS.worker.onerror = function () { CS.worker = null; cubeMainThread(); };
      CS.worker.postMessage({ cmd: 'init' });
    } catch (e) { CS.worker = null; cubeMainThread(); }
  }
  function cubeMainThread() {            // fallback when workers are unavailable (e.g. file:// in some browsers): builds the tables on the main thread
    if (CS.main) return; CS.main = true; CS.ready = false;
    let n = 0;
    ['vendor/cubejs/cube.js', 'vendor/cubejs/solve.js'].forEach(function (src) {
      const s = document.createElement('script'); s.src = src;
      s.onload = function () { if (++n === 2) setTimeout(function () { try { window.Cube.initSolver(); CS.ready = true; CS.initMs = Math.round(performance.now() - CS.t0); } catch (e) { CS.failed = true; } }, 80); };
      s.onerror = function () { CS.failed = true; };
      document.head.appendChild(s);
    });
  }
  function planFrom(alg, ms) {
    const P = G.P; CS.lastMs = ms;
    const moves = P.parseAlg(alg), sigs = []; let c = CS.reqCol;
    moves.forEach((m) => { sigs.push(sigOf(c)); c = P.apply(c, P.moveOf(m.b, m.d)); });
    CS.plan = moves; CS.sigs = sigs; CS.planAlg = alg;
  }
  function cubeNext() {
    const P = G.P, sig = sigOf(G.col);
    if (CS.plan) { const i = CS.sigs.indexOf(sig); if (i >= 0) return CS.plan[i]; }
    if (CS.failed) return undefined;
    if (!CS.ready) return 'wait';
    if (!CS.pending) {
      const fl = P.faceletString(G.col); if (!fl) { CS.failed = true; return undefined; }
      CS.pending = true; CS.reqCol = G.col.slice(); CS.id++;
      if (CS.main) {
        setTimeout(function () { try { const t = performance.now(); const alg = window.Cube.fromString(fl).solve(); CS.pending = false; planFrom(alg, Math.round(performance.now() - t)); } catch (e) { CS.pending = false; CS.failed = true; } }, 20);
      } else CS.worker.postMessage({ cmd: 'solve', id: CS.id, facelets: fl });
    }
    return 'wait';
  }
  // next move toward the solution: {b,d} | 'wait' | null (solved)
  function nextSolveMove() {
    const P = G.P;
    if (P.isSolved(G.col)) { G.hist = []; return null; }
    const kind = P.meta.solver;
    if (kind === 'table') { const r = P.initSolver().next(G.col); if (r) return r; if (r === null) return null; }
    else if (kind === 'kociemba') { const r = cubeNext(); if (r !== undefined) return r; }
    if (G.hist.length) { const e = G.hist[G.hist.length - 1]; return { b: e.b, d: e.k > 0 ? -1 : 1 }; }    // replay the moves backwards
    return null;
  }

  // ------------------------------------------------------------------ simulation step
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  function update(dt) {
    if (G.mode === 'play' && G.started) G.time += dt;
    stepView(dt);
    if (G.anim) {
      G.anim.t += dt;
      if (G.anim.t >= G.anim.dur) { const a = G.anim; G.anim = null; applyNow(a.b, a.d, a.src); }
    }
    if (!G.anim && G.queue.length && G.mode !== 'solved') { const m = G.queue.shift(); G.anim = { b: m.b, d: m.d, src: m.src, t: 0, dur: m.dur || userDur() }; }
    if (!G.anim && !G.queue.length) {
      if (G.mode === 'scramble') {
        if (G.P.isSolved(G.col)) newGame({ instant: !G.animScramble }); else { G.mode = 'play'; }
      } else if (G.mode === 'play') {
        if (G.hint) {
          if (G.hint.phase === 'wait') {
            const nm = nextSolveMove();
            if (nm === null) G.hint = null; else if (nm !== 'wait') G.hint = { phase: 'hl', t: 0, b: nm.b, d: nm.d };
          } else { G.hint.t += dt; if (G.hint.t >= 0.6) { const h = G.hint; G.hint = null; enqueue(h.b, h.d, 'hint', 0.3); } }
        } else if (G.auto) {
          const nm = nextSolveMove();
          if (nm === null) setAuto(false); else if (nm !== 'wait') enqueue(nm.b, nm.d, 'auto', 0.25);
        }
      }
    }
  }
  function busy() { return !!(G.anim || G.queue.length || G.mode === 'scramble'); }

  // ------------------------------------------------------------------ view
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    S.dpr = dpr; S.cw = canvas.width = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr)); S.ch = canvas.height = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
    const R = Math.min(S.cw * 0.38, S.ch * 0.29);
    S.f = R * D; S.cx = S.cw / 2; S.cy = S.ch * 0.5;
  }
  window.addEventListener('resize', resize);
  function tv(p) {
    const cY = Math.cos(S.yaw), sY = Math.sin(S.yaw), cP = Math.cos(S.pitch), sP = Math.sin(S.pitch);
    const x1 = p[0] * cY + p[2] * sY, z1 = -p[0] * sY + p[2] * cY;
    return [x1, p[1] * cP - z1 * sP, p[1] * sP + z1 * cP];
  }
  function pj(v) { const k = S.f / (D - v[2]); return [S.cx + v[0] * k, S.cy - v[1] * k]; }
  function stepView(dt) {
    S.yaw += (S.held.r - S.held.l) * 1.8 * dt; S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch + (S.held.d - S.held.u) * 1.2 * dt));
  }

  // ------------------------------------------------------------------ drawing
  function shade(rgb, nv, hl) {
    const l = Math.max(0, nv[0] * -0.25 + nv[1] * 0.5 + nv[2] * 0.82), k = 0.8 + 0.22 * l;
    const r = Math.min(255, rgb[0] * k + hl), g = Math.min(255, rgb[1] * k + hl), b = Math.min(255, rgb[2] * k + hl);
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function lum(rgb) { return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255; }
  function drawMark(id, x, y, r, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.2, r * 0.28); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    if (id >= 12) { ctx.save(); ctx.lineWidth = Math.max(1, r * 0.2); ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, 7); ctx.stroke(); ctx.restore(); r *= 0.7; ctx.beginPath(); }
    switch (id % 12) {
      case 0: ctx.arc(x, y, r * 0.5, 0, 7); ctx.fill(); break;
      case 1: ctx.arc(x, y, r * 0.7, 0, 7); ctx.stroke(); break;
      case 2: ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke(); break;
      case 3: ctx.moveTo(x - r * .75, y - r * .75); ctx.lineTo(x + r * .75, y + r * .75); ctx.moveTo(x + r * .75, y - r * .75); ctx.lineTo(x - r * .75, y + r * .75); ctx.stroke(); break;
      case 4: ctx.moveTo(x, y - r); ctx.lineTo(x + r * .9, y + r * .7); ctx.lineTo(x - r * .9, y + r * .7); ctx.closePath(); ctx.fill(); break;
      case 5: ctx.rect(x - r * .7, y - r * .7, r * 1.4, r * 1.4); ctx.fill(); break;
      case 6: ctx.moveTo(x, y - r); ctx.lineTo(x + r * .8, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * .8, y); ctx.closePath(); ctx.fill(); break;
      case 7: ctx.moveTo(x - r, y - r * .45); ctx.lineTo(x + r, y - r * .45); ctx.moveTo(x - r, y + r * .45); ctx.lineTo(x + r, y + r * .45); ctx.stroke(); break;
      case 8: for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.42 : r; if (i) ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else ctx.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath(); ctx.fill(); break;
      case 9: ctx.moveTo(x - r, y - r * .5); ctx.lineTo(x, y + r * .6); ctx.lineTo(x + r, y - r * .5); ctx.stroke(); break;
      case 10: ctx.arc(x - r * .55, y, r * .32, 0, 7); ctx.moveTo(x + r * .87, y); ctx.arc(x + r * .55, y, r * .32, 0, 7); ctx.fill(); break;
      default: ctx.rect(x - r * .65, y - r * .65, r * 1.3, r * 1.3); ctx.stroke();
    }
    ctx.restore();
  }
  function poly(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }

  function drawPuzzle(now) {
    const P = G.P, anim = G.anim, cam = [0, 0, D];
    let band = null, rc = 1, rs = 0;
    if (anim) { band = P.bands[anim.b]; const ang = anim.d * 2 * Math.PI / band.n * ease(Math.min(1, anim.t / anim.dur)); rc = Math.cos(ang); rs = Math.sin(ang); }
    const hlBand = G.hint && G.hint.phase === 'hl' ? P.bands[G.hint.b] : null, pulse = 0.5 + 0.5 * Math.sin(now / 90);
    const rot = (p) => V.rot(p, band.axis, rc, rs);
    // dark hull facets (the plastic body)
    P.facets.forEach((f) => {
      if (band) { const p = V.dot(f.centre, band.axis); if (p > band.lo && p <= band.hi) return; }
      const nv = tv(f.normal), cv = tv(f.centre);
      if (V.dot(nv, V.sub(cam, cv)) <= 0) return;
      const pts = f.verts.map((v) => pj(tv(V.add(f.centre, V.mul(V.sub(v, f.centre), 1.002)))));
      poly(pts); ctx.fillStyle = shade([22, 24, 28], nv, 0); ctx.fill();
    });
    const items = [];
    if (band) {
      [['secLo', 1], ['secHi', -1]].forEach((pr) => {
        const sec = band[pr[0]]; if (!sec) return;
        const cen = V.avg(sec);
        // fixed part (normal +s*axis) and the turning part (normal -s*axis)
        [[false, pr[1]], [true, -pr[1]]].forEach((q) => {
          const pts = q[0] ? sec.map(rot) : sec, nrm = V.mul(band.axis, q[1]), n3 = q[0] ? rot(nrm) : nrm, c3 = q[0] ? rot(cen) : cen;
          const nv = tv(n3), cv = tv(c3);
          if (V.dot(nv, V.sub(cam, cv)) <= 0) return;
          items.push({ z: cv[2], sec: pts.map((v) => pj(tv(v))), nv: nv });
        });
      });
    }
    for (let i = 0; i < P.N; i++) {
      const s = P.stickers[i], mv = band && band.inb[i];
      const nW = mv ? rot(s.n) : s.n, cW = mv ? rot(s.c) : s.c;
      const nv = tv(nW), cv = tv(cW);
      if (V.dot(nv, V.sub(cam, cv)) <= 0) continue;
      const pts = s.ins.map((v) => pj(tv(mv ? rot(v) : v)));
      const hl = (hlBand && hlBand.inb[i]) ? 1 : 0;
      items.push({ z: cv[2], pts: pts, nv: nv, col: G.col[i], rad: s.rad, cv: cv, hl: hl });
    }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) {
      if (it.sec) { poly(it.sec); ctx.fillStyle = shade([14, 15, 18], it.nv, 0); ctx.fill(); continue; }
      const rgb = S.rgb[it.col];
      poly(it.pts); ctx.fillStyle = shade(rgb, it.nv, it.hl ? 55 + 40 * pulse : 0); ctx.fill();
      ctx.lineWidth = it.hl ? Math.max(2, S.cw * 0.006) : Math.max(1, S.cw * 0.0018); ctx.strokeStyle = it.hl ? 'rgba(255,255,255,' + (0.6 + 0.4 * pulse) + ')' : 'rgba(0,0,0,0.55)'; ctx.stroke();
      const k = S.f / (D - it.cv[2]), r = it.rad * k * 0.5 * Math.sqrt(Math.max(0.3, it.nv[2]));
      if (r > 3.2) { const c = pj(it.cv); drawMark(it.col, c[0], c[1], Math.min(r, S.cw * 0.03), lum(rgb) > 0.5 ? 'rgba(15,15,15,0.85)' : 'rgba(255,255,255,0.92)'); }
    }
  }

  function txt(s, x, y, size, color, align, bold) {
    ctx.font = (bold ? 'bold ' : '') + Math.round(size) + 'px "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif';
    const wmax = S.cw * 0.96, w = ctx.measureText(s).width;
    if (w > wmax) ctx.font = (bold ? 'bold ' : '') + Math.max(8, Math.floor(size * wmax / w)) + 'px "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function draw(now) {
    const cw = S.cw, ch = S.ch, fs = Math.max(11 * S.dpr, Math.min(cw * 0.04, 22 * S.dpr));
    const g = ctx.createRadialGradient(cw / 2, ch * 0.5, cw * 0.05, cw / 2, ch * 0.5, Math.max(cw, ch) * 0.8);
    g.addColorStop(0, '#2b3a55'); g.addColorStop(1, '#0c1018'); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    drawPuzzle(now);
    const best = loadBest()[G.key] || {};
    txt(T.names[G.key], cw / 2, ch * 0.04, fs * 1.15, '#e8eefc', 'center', true);
    const line = T.moves + ' ' + G.moves + '   ' + T.time + ' ' + fmtTime(G.time) + (best.time !== undefined ? '   ' + T.best + ' ' + best.moves + ' / ' + fmtTime(best.time) : '');
    txt(line, cw / 2, ch * 0.04 + fs * 1.6, fs * 0.95, '#aab6d0');
    let msg = '';
    if (G.mode === 'scramble') msg = T.scr;
    else if (G.hint && G.hint.phase === 'wait' || G.auto && G.P.meta.solver === 'kociemba' && !CS.plan) msg = (G.P.meta.solver === 'kociemba' && !CS.ready && !CS.failed) ? T.prep : T.wait;
    if (msg) txt(msg, cw / 2, ch * 0.88, fs, '#ffd866');
    if (G.mode !== 'solved') { txt(T.hint, cw / 2, ch * 0.935, fs * 0.8, '#7f8aa3'); txt(T.keys, cw / 2, ch * 0.935 + fs * 1.15, fs * 0.8, '#68738b'); }
    if (G.mode === 'solved') {
      const bw = cw * 0.92, bh = fs * 6.4, bx = (cw - bw) / 2, by = ch - bh - fs * 0.4;
      ctx.fillStyle = 'rgba(8,12,22,0.82)'; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = '#ffd866'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
      txt(G.cheated ? T.solvedAuto : T.solved, cw / 2, by + fs * 1.2, G.cheated ? fs * 0.95 : fs * 1.6, '#ffd866', 'center', true);
      txt(T.moves + ' ' + G.moves + '   ' + T.time + ' ' + fmtTime(G.time), cw / 2, by + fs * 2.9, fs, '#fff');
      txt((G.newRec ? T.newRec + '  ' : '') + (best.time !== undefined ? T.best + ' ' + best.moves + ' / ' + fmtTime(best.time) : ''), cw / 2, by + fs * 4.0, fs * 0.9, '#9fe3a0');
      const w = fs * 9, h = fs * 1.5, x = cw / 2 - w / 2, y = by + fs * 4.6;
      ctx.fillStyle = '#c0c0c0'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#fff'; ctx.strokeRect(x, y, w, h);
      txt(T.again, cw / 2, y + h / 2, fs * 0.9, '#000'); S.btn = { x: x, y: y, w: w, h: h };
    } else S.btn = null;
  }

  // ------------------------------------------------------------------ input
  function pos(e) { const r = canvas.getBoundingClientRect(), d = S.dpr; return { x: (e.clientX - r.left) * d, y: (e.clientY - r.top) * d }; }
  function pointIn(pts, x, y) {
    let sgn = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (c !== 0) { const sg = c > 0 ? 1 : -1; if (sgn && sg !== sgn) return false; sgn = sg; }
    }
    return true;
  }
  function pick(x, y) {            // visible sticker under the point (rest geometry)
    const P = G.P; let best = -1, bz = -1e9;
    for (let i = 0; i < P.N; i++) {
      const s = P.stickers[i], nv = tv(s.n), cv = tv(s.c);
      if (V.dot(nv, V.sub([0, 0, D], cv)) <= 0) continue;
      if (cv[2] > bz && pointIn(s.verts.map((v) => pj(tv(v))), x, y)) { bz = cv[2]; best = i; }
    }
    return best;
  }
  // which move does a swipe on sticker `slot` with screen drag (dx,dy) mean?  The sticker must move the way the finger moves.
  function moveForSwipe(slot, dx, dy) {
    const P = G.P, s = P.stickers[slot], L = Math.hypot(dx, dy); if (L < 1e-6) return null;
    const cl = V.len(s.c), eps = 0.04, p0 = pj(tv(s.c));
    let best = null;
    P.slotBands[slot].forEach((b) => {
      const band = P.bands[b], vel = V.cross(band.axis, s.c), vl = V.len(vel);
      if (vl / cl < 0.12) return;
      const q = pj(tv(V.add(s.c, V.mul(vel, eps / vl)))), mx = q[0] - p0[0], my = q[1] - p0[1], ml = Math.hypot(mx, my);
      if (ml < 0.25 * eps * S.f / D) return;
      const cs = (mx * dx + my * dy) / (ml * L);
      [[1, cs], [-1, -cs]].forEach((c) => {
        const cand = { b: b, d: c[0], cos: c[1], size: band.members.length };
        if (!best || cand.cos > best.cos + 1e-6 || (Math.abs(cand.cos - best.cos) <= 1e-6 && cand.size < best.size)) best = cand;
      });
    });
    return best && best.cos > 0.5 ? best : null;
  }
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const p = pos(e);
    if (G.mode === 'solved' && S.btn && p.x >= S.btn.x && p.x <= S.btn.x + S.btn.w && p.y >= S.btn.y && p.y <= S.btn.y + S.btn.h) { newGame(); return; }
    if (G.auto) setAuto(false);
    const view = () => { S.drag = { x: p.x, y: p.y, yaw: S.yaw, pitch: S.pitch }; S.down = null; };
    if ((e.pointerType === 'mouse' && e.button === 2) || busy() || G.mode !== 'play' || G.hint) { view(); return; }
    const c = pick(p.x, p.y);
    if (c >= 0) { S.down = { c: c, x: p.x, y: p.y, done: false }; S.drag = null; } else view();
  });
  canvas.addEventListener('pointermove', function (e) {
    const p = pos(e), d = S.down;
    if (d && !d.done) {
      const dx = p.x - d.x, dy = p.y - d.y;
      if (Math.hypot(dx, dy) < Math.max(10 * S.dpr, Math.min(S.cw, S.ch) * 0.03)) return;
      d.done = true;
      const mv = moveForSwipe(d.c, dx, dy);
      if (mv && G.mode === 'play' && !busy()) { enqueue(mv.b, mv.d, 'user', userDur()); S.down = null; S.swiped = true; }
      else { S.down = null; S.drag = { x: d.x, y: d.y, yaw: S.yaw, pitch: S.pitch }; }
    }
    const g = S.drag;
    if (g) { S.yaw = g.yaw + (p.x - g.x) / S.cw * 3.4; S.pitch = Math.max(-1.45, Math.min(1.45, g.pitch + (p.y - g.y) / S.ch * 2.6)); }
  });
  window.addEventListener('message', function (e) { const m = e.data; if (m && m.rbCmd && typeof window[m.rbCmd] === 'function') window[m.rbCmd](); });
  window.addEventListener('pointerup', function () { S.down = null; S.drag = null; });
  window.addEventListener('pointercancel', function () { S.down = null; S.drag = null; });
  window.addEventListener('keydown', function (e) {
    const k = e.key;
    if (k === 'ArrowLeft') { S.held.l = 1; e.preventDefault(); } else if (k === 'ArrowRight') { S.held.r = 1; e.preventDefault(); }
    else if (k === 'ArrowUp') { S.held.u = 1; e.preventDefault(); } else if (k === 'ArrowDown') { S.held.d = 1; e.preventDefault(); }
    if (window.parent === window) {      // standalone page: handle the cheat keys here (inside the shell they are forwarded to it)
      if (k === 'F2') { e.preventDefault(); newGame(); } else if (k === 'F3') { e.preventDefault(); window.toggleAuto(); } else if (k === 'F4') { e.preventDefault(); window.giveHint(); }
    }
  });
  window.addEventListener('keyup', function (e) { const k = e.key; if (k === 'ArrowLeft') S.held.l = 0; if (k === 'ArrowRight') S.held.r = 0; if (k === 'ArrowUp') S.held.u = 0; if (k === 'ArrowDown') S.held.d = 0; });

  // ------------------------------------------------------------------ main loop
  let last = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    update(dt); draw(t); requestAnimationFrame(frame);
  }
  function run(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) update(1 / 60); }
  window.__rb = {
    G: G, S: S, CS: CS, update: update, run: run, draw: function () { draw(performance.now()); }, newGame: newGame, setTheme: setTheme, nextSolveMove: nextSolveMove, applyNow: applyNow, enqueue: enqueue,
    busy: busy, pick: pick, moveForSwipe: moveForSwipe, tv: tv, pj: pj, seed: function (s) { rngState = s | 0; }, genScramble: genScramble, sigOf: sigOf, resize: resize, fmtTime: fmtTime,
    V: V, PZ: PZ,
  };
  resize();
  const q = new URLSearchParams(location.search);
  setTheme(q.get('t') || lsGet('rubik_theme') || 'cube');
  requestAnimationFrame(frame);
})();
