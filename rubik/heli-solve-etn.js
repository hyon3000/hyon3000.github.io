// Page side of the edge-turning cube solver for the sizes heli-solve-edge.js has no table for (little chop family n >= 4, clover / curvy n >= 3; see heli-solve-etn-worker.js).
// The plan comes from a Web Worker.  A state on the lattice is named by the hash of the slot of every sticker facelet, a state in the middle of a jumble-undoing by the pose of the pieces,
// so the plan survives the animation; a state that is not in the plan (the player turned something) is solved again from the present state.
(function () {
  'use strict';
  const HC = window.HELI; if (!HC) return;
  window.HSOLVERS = window.HSOLVERS || [];
  const SHAPES = { cube: 1, ccclover: 1, cccurvy: 1, cubefisher: 1, cubewindmill: 1 }, POINTS = { cubefisher: 1, cubewindmill: 1 }, PT_KEYS = { 'ccclover:8': 1, 'cccurvy:9': 1 };          // (POINTS / PT_KEYS: the pose model of heli-solve-edge.js, the others the facelet model; the clover of size 8 has half turns that deform the lattice, so only the pose model fits)
  const isPoints = (shape, n) => !!POINTS[shape] || !!PT_KEYS[shape + ':' + n];
  const mkey3 = (R) => R.map((x) => { const v = Math.round(x * 1000); return v === 0 ? 0 : v; }).join(',');
  const edgeSig = (S) => S.pieces.map((pc) => mkey3(pc.R) + '/' + pc.T.map((x) => Math.round(x * 100)).join(',')).join('|');
  const q3 = (x) => { const v = Math.round(x * 1913.7); return v === 0 ? 0 : v; };
  const keyOfPoly = (poly) => { const a = poly.map((p) => q3(p[0]) + ',' + q3(p[1]) + ',' + q3(p[2])); a.sort(); return a.join('|'); };
  function hashPos(pos) {
    let a = 0x811c9dc5 | 0, b = 0x9747b28c | 0;
    for (let i = 0; i < pos.length; i++) { a = Math.imul(a ^ pos[i], 16777619); b = Math.imul(b + pos[i] + 1, 40503) ^ (b >>> 15); }
    return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36);
  }
  function poseSig(S) {
    let s = ''; for (const pc of S.pieces) { for (let i = 0; i < 9; i++) s += Math.round(pc.R[i] * 97.3) + ','; for (let i = 0; i < 3; i++) s += Math.round(pc.T[i] * 97.3) + ','; s += ';'; }
    let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return 'E' + h + ':' + s.length;
  }
  // slots of the sticker facelets in the solved state (cheap: no turn is made), cached per puzzle
  const SLOTS = {};
  function slotsOf(shape, n) {
    const k = shape + ':' + n; if (SLOTS[k]) return SLOTS[k];
    const S = HC.create(n, shape), fl = [], slotOf = new Map();
    S.pieces.forEach((pc, i) => pc.home.forEach((f, j) => { if (f.tag >= 0) { slotOf.set(keyOfPoly(pc.W[j]), fl.length); fl.push([i, j]); } }));
    return (SLOTS[k] = { fl: fl, slotOf: slotOf });
  }
  function sigNow(S) {
    if (isPoints(S.cfg.shape, S.cfg.n) && window.HEDGE) { const P = window.HEDGE.readPoints(window.HEDGE.buildModel(S.cfg.shape, S.cfg.n), S); return P ? 'L' + P.join(',') : edgeSig(S); }
    const sl = slotsOf(S.cfg.shape, S.cfg.n), pos = new Int16Array(sl.fl.length);
    for (let f = 0; f < pos.length; f++) { const q = sl.slotOf.get(keyOfPoly(S.pieces[sl.fl[f][0]].W[sl.fl[f][1]])); if (q === undefined) return poseSig(S); pos[f] = q; }
    return 'L' + hashPos(pos);
  }
  const ST = { key: '', plan: null, index: null, pending: false, failed: false, id: 0, worker: null, dur: 0.06, lastSig: '', repeat: 0, replans: 0 };
  function worker() {
    if (ST.worker) return ST.worker;
    try {
      ST.worker = new Worker('heli-solve-etn-worker.js');
      ST.worker.onmessage = (e) => {
        const m = e.data; if (m.id !== ST.id) return; ST.pending = false;
        if (m.error || !m.result || m.result.error) { ST.failed = true; ST.err = m.error || (m.result && m.result.error); return; }
        ST.plan = m.result.plan; ST.info = m.result; ST.index = new Map(); m.result.sigs.forEach((s, i) => ST.index.set(s, i));          // (a state met twice: the later index wins, the loop is skipped)
        ST.dur = Math.max(0.02, Math.min(0.25, 12 / Math.max(1, ST.plan.length)));
      };
      ST.worker.onerror = () => { ST.failed = true; ST.pending = false; ST.worker = null; };
    } catch (err) { ST.failed = true; }
    return ST.worker;
  }
  function state(S) { return { R: S.pieces.map((p) => p.R), T: S.pieces.map((p) => p.T), ang: S.ang.slice() }; }
  function reset(key) { ST.key = key; ST.plan = null; ST.index = null; ST.pending = false; ST.failed = false; ST.lastSig = ''; ST.repeat = 0; ST.replans = 0; }
  const find = (S) => { if (!ST.plan) return -1; const i = ST.index.get(sigNow(S)); return i === undefined ? -1 : i; };
  window.HSOLVERS.push({
    match: (shape, cfg) => !!SHAPES[shape] && cfg.planes.length > 0 && !((window.HEDGE_DATA || {})[shape + ':' + cfg.n]),
    next: (S, G) => {
      if (HC.isSolved(S)) return null;
      const key = S.cfg.shape + ':' + S.cfg.n; if (ST.key !== key) reset(key);
      const sig = ST.plan ? sigNow(S) : '', i = ST.plan ? (ST.index.get(sig) === undefined ? -1 : ST.index.get(sig)) : -1;
      if (i >= 0 && i < ST.plan.length) {
        if (sig === ST.lastSig) { if (++ST.repeat > 3) { ST.failed = true; return undefined; } } else { ST.lastSig = sig; ST.repeat = 0; }          // the same state asked again and again: the page refuses the move
        return Object.assign({ dur: ST.dur, left: ST.plan.length - i }, ST.plan[i]);
      }
      if (ST.plan) { ST.plan = null; ST.index = null; if (++ST.replans > 4) ST.failed = true; }          // the state left the plan (or the plan ran out): plan again
      if (ST.failed) return undefined;
      if (!ST.pending) {
        const w = worker(); if (!w) return undefined;
        ST.pending = true; ST.id++; w.postMessage({ cmd: 'solve', id: ST.id, shape: S.cfg.shape, n: S.cfg.n, state: state(S) });
      }
      return 'wait';
    },
    plan: (S) => { const i = find(S); return i >= 0 ? ST.plan.slice(i) : null; },
  });
  window.__hetn = { ST: ST, sigNow: sigNow };
})();
