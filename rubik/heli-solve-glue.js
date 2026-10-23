// Cube - scramble-independent solvers by the group method (heli-solve-glue-core.js / heli-solve-grp-core.js, run in heli-solve-glue-worker.js) for puzzles the other solvers leave out:
//  * fully functional cuboids whose lattice table does not fit (2x2x4 ...): the turns are a permutation group on the cell poses; a Schreier-Sims chain brings the cells home one after the other,
//  * the fused cube (any n, any number of blocks of any shape, sides of 1 too) and, through grpNext() called by heli-solve-shared.js, the shared cube (any n, any chain of offsets): the general
//    group solver of heli-solve-grp-core.js (unit stickers as points, table of short words, colour-aware sift, way back to the home configuration of the blocks).
// The state is read from the pieces alone (never from S.hist).  Jumbling turns of the game's scramble are undone first.  Whatever cannot be handled makes the hook return undefined
// (the old behaviour, replaying the history, remains).
(function () {
  'use strict';
  const H = window.HELI, B = window.__hbox, C = window.__hcub; if (!H || !B || !C) return;
  window.HSOLVERS = window.HSOLVERS || [];
  const HALF = Math.PI / 2, PI = Math.PI, INFV = 1e9;
  const sigOf = (S) => { let s = ''; for (const pc of S.pieces) { for (const x of pc.R) s += Math.round(x * 8) + ','; for (const x of pc.T) s += Math.round(x * 64) + ','; s += ';'; } return s; };
  const dimsOf = (cfg) => (Array.isArray(cfg.n) && cfg.shape === 'cuboidff' ? cfg.n : null);
  const hasSticker = (pc) => pc.home.some((f) => f.tag >= 0);

  // ---- the worker, one per page
  const W = { worker: null, failed: false, id: 0, cb: {} };
  function wInit() {
    if (W.worker || W.failed) return;
    try {
      W.worker = new Worker('heli-solve-glue-worker.js');
      W.worker.onmessage = (ev) => { const m = ev.data; if (W.cb[m.id]) { const f = W.cb[m.id]; delete W.cb[m.id]; f(m); } };
      W.worker.onerror = () => { W.failed = true; Object.keys(W.cb).forEach((k) => { const f = W.cb[k]; delete W.cb[k]; f({ ok: false, error: 'worker' }); }); };
    } catch (e) { W.failed = true; }
  }
  const wAsk = (msg, cb) => { W.id++; msg.id = W.id; W.cb[W.id] = cb; W.worker.postMessage(msg); };

  // ---- the plan (the page asks for the next move at every state; the state must be one the plan passes through)
  const PL = { plan: null, sigs: null, pending: false, failed: false, failSig: '', key: '', why: '' };
  function planner(S, moves, nobond) {          // replays the moves on a copy (the engine may refuse some); run(ms) works for about ms milliseconds: 'more', true (PL.plan is set) or false
    const X = B.cloneS(S), plan = [], sigs = [], seenAt = new Map();
    if (nobond) X.cfg = Object.assign({}, S.cfg, { bond: false });          // (the contact check of the engine is slow on a big cube: the plan is checked without it and a turn the engine refuses later is repaired when it happens, see grpNext)
    // a state met twice: the moves in between are a loop and are cut (else the page, which looks the state up, would turn round in it)
    let idx = 0;
    return {
      run: (ms) => {
        const t0 = Date.now();
        while (idx < moves.length) {
          if (ms && Date.now() - t0 > ms) return 'more';
          const m = moves[idx++], sg0 = sigOf(X), j0 = seenAt.get(sg0);
          if (j0 !== undefined) { for (let t = j0; t < sigs.length; t++) seenAt.delete(sigs[t]); plan.length = j0; sigs.length = j0; }
          seenAt.set(sg0, sigs.length); sigs.push(sg0);
          if (H.apply(X, { p: m.p, a: m.a })) { plan.push({ p: m.p, a: m.a }); continue; }
          if (Math.abs(Math.abs(m.a) - PI) < 1e-6) {          // a half turn the engine refuses (the body would come apart half way): two quarter turns may be accepted
            const Y = B.cloneS(X); if (H.apply(Y, { p: m.p, a: HALF }) && H.apply(Y, { p: m.p, a: HALF })) { H.apply(X, { p: m.p, a: HALF }); { const sg1 = sigOf(X); seenAt.set(sg1, sigs.length); sigs.push(sg1); } H.apply(X, { p: m.p, a: HALF }); plan.push({ p: m.p, a: HALF }, { p: m.p, a: HALF }); continue; }
          }
          PL.badAt = plan.length; PL.badMove = m; return false;
        }
        if (!H.isSolved(X) || plan.length > 20000) return false;
        const dur = Math.max(0.03, Math.min(0.25, 25 / Math.max(1, plan.length)));
        plan.forEach((m) => { m.dur = dur; });
        PL.plan = plan; PL.sigs = sigs; PL.end = sigOf(X); return true;
      },
    };
  }
  function setPlan(S, moves) { return planner(S, moves).run(0); }
  function setPlanAsync(S, moves, cb) {          // the same in slices of 20 ms (a long plan on a big cube would freeze the page)
    const pl = planner(S, moves, true), tick = () => { const r = pl.run(20); if (r === 'more') setTimeout(tick, 0); else cb(r); };
    tick();
  }
  const planIdx = (S) => (PL.plan ? PL.sigs.indexOf(sigOf(S)) : -1);
  const angOf = (q) => { q = ((q % 4) + 4) % 4; return q === 1 ? HALF : q === 2 ? PI : -HALF; };

  // ---- the desc of the lattice model, from the pieces and the planes of the engine
  function descOf(S, kind) {
    const gd = C.genDesc(S); if (!gd) return null;
    const d = { pieces: gd.desc.pieces, moves: gd.desc.moves.map((m, k) => Object.assign({}, m)) };
    if (kind === 'ff') d.moves.forEach((m, k) => { m.qs = S.cfg.planes[k].square ? [1, 2, 3] : [2]; });
    return { gd: gd, desc: d };
  }

  // ---- cuboidff: the cells of the box, physical frame
  function requestCuboid(S) {
    const dims = dimsOf(S.cfg), dj = C.dejumble(S, dims); if (!dj) return null;
    const X = B.cloneS(S); dj.forEach((m) => H.apply(X, m));
    const dd = descOf(S, 'ff'); if (!dd) return null;
    const st = C.genState(X, dd.gd); if (!st) return null;
    const base = []; S.pieces.forEach((pc, i) => { if (hasSticker(pc)) base.push(i); });
    return { key: 'ff:' + dd.gd.key, desc: dd.desc, base: base, st: Array.from(st), pre: dj, finish: (mv) => mv.map((m) => ({ p: dd.desc.moves[m.mi].p, a: angOf(m.q) })) };
  }

  // ---- the general group solver (heli-solve-grp-core.js) for the fused cube (any blocks) and the shared cube (any chain): the unit stickers of the pieces are the points, see there
  const FDIR = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  function stickersOf(S, gd) {          // per piece: the unit stickers {h: home cell centre, d: direction index, col} of its outer faces (doubled integer units)
    const u = gd.u, FN = H.FACES, out = [];
    for (const pc of S.pieces) {
      const arr = [];
      for (const f of pc.home) {
        if (f.tag < 0) continue;
        const vs = f.v.map((q) => q.map((x) => Math.round(x / u))); let a = -1;
        for (let k = 0; k < 3; k++) if (vs.every((v) => v[k] === vs[0][k])) a = k;
        if (a < 0) return null;
        const sg = FN[f.tag][a] > 0 ? 1 : -1, bb = [(a + 1) % 3, (a + 2) % 3], lo = bb.map((k) => Math.min.apply(null, vs.map((v) => v[k]))), hi = bb.map((k) => Math.max.apply(null, vs.map((v) => v[k])));
        const d = FDIR.findIndex((v) => v[a] === sg);
        for (let x = lo[0] + 1; x < hi[0]; x += 2) for (let y = lo[1] + 1; y < hi[1]; y += 2) { const h = [0, 0, 0]; h[a] = vs[0][a] - sg; h[bb[0]] = x; h[bb[1]] = y; arr.push({ h: h, d: d, col: f.tag }); }
      }
      out.push(arr);
    }
    return out;
  }
  function requestGrp(S) {
    const gd = C.genDesc(S); if (!gd) return null;
    const st = C.genState(S, gd), stk = stickersOf(S, gd); if (!st || !stk) return null;
    const pieces = gd.desc.pieces.map((p, i) => ({ c: p.c, e: p.e, stk: stk[i] }));
    return { cmd: 'grp', key: 'grp:' + S.cfg.shape + ':' + S.cfg.n + ':' + (S.cfg.fz || []).join(','), desc: { pieces: pieces, moves: gd.desc.moves }, st: Array.from(st), pre: [], finish: (mv) => mv.map((m) => ({ p: gd.desc.moves[m.mi].p, a: angOf(m.q) })) };
  }
  const GP = { pending: false, failed: false, failSig: '', why: '', last: null };
  function repair(S, i) {          // the engine did not take plan move i (asked again in the same state): if it is a half turn, two quarter turns may be accepted.  false = cannot be repaired
    const m = PL.plan[i], Y = B.cloneS(S);
    if (H.apply(Y, { p: m.p, a: m.a })) { GP.last.n = 0; return true; }          // (it works after all: not refused)
    if (Math.abs(Math.abs(m.a) - PI) > 1e-6) return false;
    const Z = B.cloneS(S); if (!H.apply(Z, { p: m.p, a: HALF }) || !H.apply(Z, { p: m.p, a: HALF })) return false;
    const W2 = B.cloneS(S); H.apply(W2, { p: m.p, a: HALF });
    PL.plan.splice(i, 1, { p: m.p, a: HALF, dur: m.dur }, { p: m.p, a: HALF, dur: m.dur }); PL.sigs.splice(i + 1, 0, sigOf(W2)); GP.last = null; return true;
  }
  function grpNext(S) {          // the hook of the general solver: the next move of the plan, 'wait', null (solved) or undefined (cannot)
    const i = planIdx(S);
    if (i >= 0 && i < PL.plan.length) {
      const sg = sigOf(S);
      if (GP.last && GP.last.sig === sg && GP.last.i === i) { if (++GP.last.n >= 2 && !repair(S, i)) { GP.failed = true; GP.failSig = sg; GP.why = 'refused'; PL.plan = null; return undefined; } }
      else GP.last = { sig: sg, i: i, n: 0 };
      return PL.plan[i];
    }
    if (H.isSolved(S)) return null;
    if (GP.pending) return 'wait';
    if (GP.failed && GP.failSig === sigOf(S)) return undefined;
    const fail = (why) => { GP.failed = true; GP.failSig = sigOf(S); GP.why = why; return undefined; };
    const req = requestGrp(S); if (!req) return fail('request');
    wInit(); if (W.failed) return fail('worker');
    GP.pending = true; GP.failed = false; GP.why = ''; const sig0 = sigOf(S);
    wAsk({ cmd: 'grp', key: req.key, desc: req.desc, st: req.st }, (m) => {
      GP.pending = false;
      if (!m.ok) { GP.failed = true; GP.failSig = sig0; GP.why = 'worker ' + m.error; return; }
      if (sigOf(S) !== sig0) return;
      GP.pending = true;
      setPlanAsync(S, req.finish(m.moves), (ok) => {
        GP.pending = false;
        if (sigOf(S) !== sig0) return;
        if (!ok) { PL.plan = null; GP.failed = true; GP.failSig = sig0; GP.why = 'plan'; }
      });
    });
    return 'wait';
  }

  // ---- asking the worker and following the plan
  function start(S, req) {
    wInit(); if (W.failed) return undefined;
    PL.pending = true; PL.failed = false; PL.failSig = sigOf(S); PL.why = '';
    const sig0 = PL.failSig;
    wAsk({ cmd: 'solve', key: req.key, desc: req.desc, base: req.base, st: req.st }, (m) => {
      PL.pending = false;
      if (!m.ok) { PL.failed = true; PL.why = 'worker ' + m.error; return; }
      if (sigOf(S) !== sig0) return;
      const em = req.finish(m.moves); if (!em) { PL.failed = true; PL.why = 'finish'; return; }
      if (!setPlan(S, req.pre.concat(em))) { PL.plan = null; PL.failed = true; PL.why = 'plan'; }
    });
    return 'wait';
  }
  const kindOf = (cfg) => (cfg.shape === 'cuboidff' ? 'ff' : '');
  function matchCfg(shape, cfg) {
    if (shape === 'cuboidff') { const d = dimsOf(cfg); if (!d) return false; const cells = d[0] * d[1] * d[2]; return !(d[0] === 3 && d[1] === 3 && d[2] === 3) && !(cells <= 12 && cells > 9) && cells > 12 && cells <= 40; }
    if (shape === 'cubefused') return Array.isArray(cfg.fz) && cfg.fz.length >= 6;
    return false;
  }
  window.HSOLVERS.push({
    match: matchCfg,
    next: (S) => {
      if (S.cfg.shape === 'cubefused') return grpNext(S);
      const i = planIdx(S); if (i >= 0 && i < PL.plan.length) return PL.plan[i];
      if (H.isSolved(S)) return null;
      if (PL.pending) return 'wait';
      if (PL.failed && PL.failSig === sigOf(S)) return undefined;
      const req = kindOf(S.cfg) === 'ff' ? requestCuboid(S) : null;
      if (!req) { PL.failed = true; PL.failSig = sigOf(S); PL.why = 'request'; return undefined; }
      return start(S, req);
    },
    plan: (S) => { const i = planIdx(S); return i >= 0 && PL.plan ? PL.plan.slice(i) : null; },
  });
  window.__hglue = { grpNext: grpNext, GP: GP, requestGrp: requestGrp, PL: PL, W: W, descOf: descOf, requestCuboid: requestCuboid, setPlan: setPlan, planIdx: planIdx, sigOf: sigOf, angOf: angOf, wInit: wInit, ask: wAsk };
})();
