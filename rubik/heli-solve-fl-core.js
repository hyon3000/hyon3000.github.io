// Facelet-chain solver for the piece-engine puzzles of heli.html whose turns, from the solved state, are permutations of the sticker faces ("facelets", see heli-solve-star-core.js buildModel):
// tetrahedron / octahedron / dodecahedron / icosahedron edge turners, face-turning dodecahedra, starminx, skewb ultimate, QJ ... of every size.  It needs no table made in advance (the star tables of
// heli-solve-star-data.js cover only the small sizes): the group the turns generate gets a Schreier-Sims chain with short words (RBSmall.makeChainChecked of solver-small-core.js, the colour-aware
// solve of that file) over the facelet colours, the base running piece by piece.  A state the jumbling turns left off the lattice is first brought back with HSTAR.unjumble; the lattice states it finds
// are offered one after the other to the chain until one solves.  The result is replayed on the real engine before it is returned.  Runs in heli-solve-fl-worker.js (any JS shell for tests).
(function (root) {
  'use strict';
  const H = root.HELI, X = root.HSTAR, R = root.RBSmall;
  const CH = {};
  function pieceGroups(S, model) {
    const by = {}; model.fl.forEach((f, s) => { (by[f.i] = by[f.i] || []).push(s); });
    return Object.keys(by).map((k) => by[k]);
  }
  function centre(S, model, g) {
    const W = S.pieces[model.fl[g[0]].i].W; let c = [0, 0, 0], m = 0;
    W.forEach((f) => f.forEach((p) => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; m++; }));
    return [c[0] / m, c[1] / m, c[2] / m];
  }
  // base orders: piece after piece (the facelets of a piece are consecutive base points); the order of the pieces is the knob
  function bases(S, model, modes) {
    const groups = pieceGroups(S, model), rad = new Map(); groups.forEach((g) => { const c = centre(S, model, g); rad.set(g, Math.hypot(c[0], c[1], c[2])); });
    const CMP = {
      A: (a, b) => a.length - b.length || a[0] - b[0],
      O: (a, b) => rad.get(b) - rad.get(a) || a[0] - b[0],
      S: (a, b) => b.length - a.length || rad.get(b) - rad.get(a) || a[0] - b[0],
      F: (a, b) => a[0] - b[0],
    };
    return modes.map((m) => [].concat.apply([], groups.slice().sort(CMP[m])));
  }
  function getChain(shape, n, model, opts) {
    const ck = shape + ':' + n; if (CH[ck] && CH[ck].ok) return CH[ck];
    opts = opts || {}; const t0 = Date.now(), S = H.create(n, shape), d = model.d;
    const col0 = new Uint8Array(d); model.fl.forEach((f, s) => { col0[s] = S.pieces[f.i].home[f.k].tag; });
    // letters: 2m = model move m, 2m+1 = its inverse (a self-inverse turn is listed twice)
    const perms = [], letter = [], seen = new Set();
    model.moves.forEach((m, k) => { if (seen.has(k)) return; seen.add(k); seen.add(m.inv); perms.push(m.perm); letter.push(k); perms.push(model.moves[m.inv].perm); letter.push(m.inv); });
    const spec = { N: d, perms: perms.map((p) => Int16Array.from(p)), solved: col0, nColours: 0 };
    const bs = bases(S, model, opts.modes || ['S', 'A', 'O']);
    let r = null, total = opts.totalMs || 120000;
    for (let attempt = 0; attempt < 2; attempt++) {          // (a chain that fails its own check, e.g. because the machine was busy, is made again with more time)
      r = R.makeChainChecked(spec, bs, { totalMs: total, polishMs: opts.polishMs === undefined ? 2000 : opts.polishMs, tests: 6, steps: 300 });
      if (r.ok) break; total = Math.round(total * 1.5);
    }
    return (CH[ck] = { ok: !!r.ok, chain: r.chain, spec: spec, letter: letter, col0: col0, ms: Date.now() - t0, stats: r.chain.stats(), base: r.base });
  }
  function solve(shape, n, st, opts) {
    opts = opts || {}; const t0 = Date.now();
    const model = X.buildModel(shape, n); if (!model.moves.length) return { error: 'no moves' };
    const S = X.loadState(shape, n, st);
    if (H.isSolved(S)) return { plan: [], sigs: [], ms: 0 };
    if (model.d > (opts.maxFacelets || 1500)) return { error: 'too large (' + model.d + ' facelets)' };          // (a chain over more facelets did not finish in 15 minutes)
    const C = getChain(shape, n, model, opts.chain); if (!C.ok) return { error: 'chain incomplete' };
    const d = model.d; let word = null;
    // The search for the way back to the lattice runs without the bond check of the engine (it costs 10-100 ms per turn on big puzzles); a way that is found is replayed with the real rules before
    // the chain is asked, a way the engine would refuse is rejected and the search goes on.
    const real = H.apply; H.apply = (St, mv) => real(St, Object.assign({}, mv, { trust: true }));
    let pre;
    try {
      pre = X.unjumble(S, model, opts.budget || { ms: 90000 }, (path) => {
        if (path.length) { const Rv = X.loadState(shape, n, st); for (const m of path) if (!real(Rv, { p: m.p, a: m.a })) return false; }
        const pos = X.posOf(S, model); if (!pos) return false;
        const col = new Uint8Array(d); for (let s = 0; s < d; s++) col[pos[s]] = C.col0[s];
        word = C.chain.solve(col, C.col0, 400000); return !!word;
      });
    } finally { H.apply = real; }
    if (pre === null) return { error: 'cannot undo the jumbling' };
    if (!word) return { error: 'state not solved by the chain' };
    word = R.simplify(word, new Array(C.spec.perms.length / 2).fill(0).map(() => 1 << 20));          // (cancels inverse neighbours only)
    const mv = word.map((L) => model.moves[C.letter[L]]);
    const plan = X.mergeMoves(pre.concat(mv.map((m) => ({ p: m.p, a: m.a }))));
    // replay on the engine; the page finds its place in the plan by the pose signature of the pieces, so a plan must not meet the same state twice (the loop is cut out)
    const Rp = X.loadState(shape, n, st), out = [], sigs = [], seenAt = new Map();
    for (let i = 0; i < plan.length; i++) {
      const m = plan[i], sg = X.poseSig(Rp);
      if (seenAt.has(sg)) { const k = seenAt.get(sg); for (let q = k; q < out.length; q++) seenAt.delete(sigs[q]); out.length = k; sigs.length = k; }
      seenAt.set(sg, out.length); out.push(m); sigs.push(sg);
      if (!H.apply(Rp, i < pre.length ? m : { p: m.p, a: m.a, trust: true })) return { error: 'engine refused ' + JSON.stringify(m) };          // (lattice turns that were legal from the solved state are legal in every lattice state; skipping the bond check makes the replay of thousands of turns cheap)
    }
    if (!H.isSolved(Rp)) return { error: 'replay not solved' };
    plan.length = 0; out.forEach((m) => plan.push(m));
    return { plan: plan, sigs: sigs, ms: Date.now() - t0, chainMs: C.ms, pre: pre.length, stats: C.stats };
  }
  root.HFL = { solve: solve, getChain: getChain, chains: CH };
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : globalThis);
