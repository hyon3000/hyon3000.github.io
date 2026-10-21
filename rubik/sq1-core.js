// Square-n puzzle rules (no DOM): n layers on top and n on the bottom around a thin middle layer; every layer is a ring of 12 sectors of 30 degrees filled with
// corner pieces (2 sectors) and edge pieces (1 sector). A layer turns by any number of sectors; the slice turns the right half (sectors 0..5 of every layer, plus the
// right half of the middle layer) by 180 degrees about the horizontal axis, which swaps layer k with layer 2n-1-k (mirrored) - allowed only if no piece straddles the cut.
//   layers 0 .. n-1 = top (0 = outermost), n .. 2n-1 = bottom (2n-1 = outermost)
(function (root) {
  'use strict';
  // the 8 pieces of a layer in angular order starting at sector 0: corner (2 sectors), edge (1), corner, edge ... ; side colours index the 4 faces (0..3)
  const PIECES = [
    { t: 'c', s: [3, 0], w: 2 }, { t: 'e', s: [0], w: 1 }, { t: 'c', s: [0, 1], w: 2 }, { t: 'e', s: [1], w: 1 },
    { t: 'c', s: [1, 2], w: 2 }, { t: 'e', s: [2], w: 1 }, { t: 'c', s: [2, 3], w: 2 }, { t: 'e', s: [3], w: 1 },
  ];
  function create(n) {
    const S = { n: n, layers: [], rflip: 0, hist: [] };
    for (let l = 0; l < 2 * n; l++) {
      const row = new Array(12); let j = 0;
      PIECES.forEach((pc, p) => {
        const o = { home: p, flip: 0, up: l === 0 ? 'W' : null, down: l === 2 * n - 1 ? 'Y' : null };
        for (let q = 0; q < pc.w; q++) row[j++] = o;
      });
      S.layers.push(row);
    }
    return S;
  }
  // appearance of sector j of layer l: kind, wall colour (face index) and the colour of the outer end if this layer is an outer one
  function sector(S, l, j) {
    const o = S.layers[l][j], pc = PIECES[o.home];
    let wall, first = false;
    if (pc.t === 'e') wall = pc.s[0];
    else { first = S.layers[l][(j + 11) % 12] !== o; const lo = o.flip ? pc.s[1] : pc.s[0], hi = o.flip ? pc.s[0] : pc.s[1]; wall = first ? lo : hi; }
    let end = '';
    if (l === 0) end = (o.flip ? o.down : o.up) || '';
    else if (l === 2 * S.n - 1) end = (o.flip ? o.up : o.down) || '';
    return pc.t + wall + end;
  }
  function signature(S) {
    const out = [];
    for (let l = 0; l < 2 * S.n; l++) for (let j = 0; j < 12; j++) out.push(sector(S, l, j));
    out.push(S.rflip);
    return out.join('|');
  }
  const SOLVED = {};
  function isSolved(S) { if (!SOLVED[S.n]) SOLVED[S.n] = signature(create(S.n)); return signature(S) === SOLVED[S.n]; }
  function turn(S, l, s) {                                  // rotate layer l by s sectors (positive = towards higher angles)
    s = ((s % 12) + 12) % 12; if (!s) return;
    const old = S.layers[l], nw = new Array(12);
    for (let j = 0; j < 12; j++) nw[(j + s) % 12] = old[j];
    S.layers[l] = nw;
  }
  function straddles(S, l, b) { return S.layers[l][(b + 11) % 12] === S.layers[l][b % 12]; }
  function sliceLegal(S) { for (let l = 0; l < 2 * S.n; l++) if (straddles(S, l, 0) || straddles(S, l, 6)) return false; return true; }
  function slice(S) {
    if (!sliceLegal(S)) return false;
    const n = S.n, moved = new Set();
    for (let k = 0; k < n; k++) {
      const top = S.layers[k].slice(), bot = S.layers[2 * n - 1 - k].slice(), nt = S.layers[k], nb = S.layers[2 * n - 1 - k];
      for (let i = 0; i < 6; i++) { nt[i] = bot[5 - i]; nb[5 - i] = top[i]; moved.add(top[i]); moved.add(bot[i]); }
    }
    moved.forEach((o) => { o.flip ^= 1; });
    S.rflip ^= 1;
    return true;
  }
  // history with cancellation of consecutive turns of the same layer
  function record(S, mv) {
    const h = S.hist;
    if (mv.t === 'r') {
      for (let i = h.length - 1; i >= 0; i--) {
        const e = h[i];
        if (e.t === 's') break;
        if (e.l === mv.l) { const s = (((e.s + mv.s) % 12) + 12) % 12; if (s === 0) h.splice(i, 1); else e.s = s > 6 ? s - 12 : s; return; }
      }
      h.push({ t: 'r', l: mv.l, s: mv.s });
    } else {
      if (h.length && h[h.length - 1].t === 's') h.pop(); else h.push({ t: 's' });
    }
  }
  function apply(S, mv, rec) {
    if (mv.t === 'r') turn(S, mv.l, mv.s); else if (!slice(S)) return false;
    if (rec !== false) record(S, mv);
    return true;
  }
  function inverse(mv) { return mv.t === 'r' ? { t: 'r', l: mv.l, s: -mv.s } : { t: 's' }; }
  function scramble(S, count, rnd) {
    const out = [];
    for (let i = 0; i < count; i++) {
      let mv;
      if (i % 2 === 1 && sliceLegal(S)) mv = { t: 's' };
      else { mv = { t: 'r', l: Math.floor(rnd() * 2 * S.n), s: 1 + Math.floor(rnd() * 11) }; if (mv.s > 6) mv.s -= 12; }
      apply(S, mv); out.push(mv);
    }
    return out;
  }
  root.SQ1 = { PIECES: PIECES, create: create, turn: turn, slice: slice, sliceLegal: sliceLegal, apply: apply, inverse: inverse, record: record, scramble: scramble, isSolved: isSolved, signature: signature, sector: sector };
})(typeof window !== 'undefined' ? window : globalThis);
