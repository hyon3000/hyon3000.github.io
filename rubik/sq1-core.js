// Square-n rules (no DOM). Always three layers: a top layer, a thin middle layer and a bottom layer. Every outer layer is a ring of S sectors (S = 12 for up to 12 pieces, else the
// next multiple of 4) cut into P = 4 (n + 1) pieces (at least 2): n = 1 gives the 8 pieces of Square-1 (corners of 2 sectors, edges of 1), n = 2 twelve single sectors,
// n = 0.5 six pieces of 2 sectors, n = 0 four pieces of 3 sectors, n <= -0.5 two halves.
// A layer turns by any number of sectors; the slice flips the right half (sectors 0 .. S/2-1 of both layers and the right half of the middle layer) by 180 degrees about the
// horizontal axis: top sector i <-> bottom sector S/2-1-i, every piece turns upside down. It is possible only when no piece straddles the two cuts.
(function (root) {
  'use strict';
  const cache = {};
  function pieceCount(n) { return n === -1 ? 2 : Math.max(2, Math.round(4 * (n + 1))); }
  // layout of the pieces: widths in sectors and the sector each piece starts at in the solved shape (the pattern of one half repeats for the other half)
  function layout(P) {
    if (cache[P]) return cache[P];
    let S = Math.max(12, Math.ceil(P / 4) * 4);
    if (P % 2) P += 1;
    const half = P / 2, S2 = S / 2, b = Math.floor(S2 / half), r = S2 % half, widths = [];
    for (let rep = 0; rep < 2; rep++) for (let i = 0; i < half; i++) widths.push(b + (Math.ceil((i + 1) * r / half) - Math.ceil(i * r / half)));
    const starts = []; let s = 0; widths.forEach((w) => { starts.push(s); s += w; });
    const v0 = Math.max(1, Math.round(S / 12));                       // sector boundary of the first vertex of the square outline (Square-1: 30 degrees)
    return (cache[P] = { P: P, S: S, widths: widths, starts: starts, v0: v0, quarter: S / 4 });
  }
  // the smallest turn of a layer: the gcd of the piece widths (Square-1: one sector = 30 degrees; two halves: 180 degrees; four pieces of 3 sectors: 90 degrees)
  function gran(P) { const w = layout(P).widths; let g = w[0]; const gc = (a, b) => (b ? gc(b, a % b) : a); w.forEach((x) => { g = gc(g, x); }); return g; }
  // face (0..3) the outline shows at sector index th of the solved shape
  function faceOfSector(Ly, th) { return Math.floor((((th - Ly.v0) % Ly.S) + Ly.S) % Ly.S / Ly.quarter); }
  function create(P) {
    const Ly = layout(P), S = { Ly: Ly, layers: [], mflip: [0, 0], hist: [] };
    for (let l = 0; l < 2; l++) {
      const row = new Array(Ly.S);
      Ly.widths.forEach((w, p) => {
        const o = { home: p, flip: 0, up: l === 0 ? 'W' : null, down: l === 1 ? 'Y' : null };
        for (let q = 0; q < w; q++) row[Ly.starts[p] + q] = o;
      });
      S.layers.push(row);
    }
    return S;
  }
  function firstSector(S, l, j) { const n = S.Ly.S, row = S.layers[l]; let k = 0; while (k < n && row[(j - k - 1 + n * 2) % n] === row[j]) k++; return k; }      // local index of sector j within its piece
  function sector(S, l, j) {
    const Ly = S.Ly, o = S.layers[l][j], w = Ly.widths[o.home], t = firstSector(S, l, j);
    const th = Ly.starts[o.home] + (o.flip ? w - 1 - t : t);
    let end = '';
    if (l === 0) end = (o.flip ? o.down : o.up) || ''; else end = (o.flip ? o.up : o.down) || '';
    return w + ':' + t + ':' + faceOfSector(Ly, th) + end;
  }
  function signature(S) {
    const out = [];
    for (let l = 0; l < 2; l++) for (let j = 0; j < S.Ly.S; j++) out.push(sector(S, l, j));
    out.push(S.mflip[0], S.mflip[1]);
    return out.join('|');
  }
  const SOLVED = {};
  // solved = the solved shape, or the same shape after both halves were flipped (that is the whole puzzle turned over, nothing is out of place)
  function isSolved(S) {
    const k = S.Ly.P;
    if (!SOLVED[k]) { const a = create(k), b = create(k); slice(b, 0); slice(b, 1); SOLVED[k] = [signature(a), signature(b)]; }
    const sg = signature(S); return sg === SOLVED[k][0] || sg === SOLVED[k][1];
  }
  function turn(S, l, s) {
    const n = S.Ly.S; s = ((s % n) + n) % n; if (!s) return;
    const old = S.layers[l], nw = new Array(n);
    for (let j = 0; j < n; j++) nw[(j + s) % n] = old[j];
    S.layers[l] = nw;
  }
  function sliceLegal(S) {
    const n = S.Ly.S, h = n / 2;
    for (let l = 0; l < 2; l++) { const row = S.layers[l]; if (row[n - 1] === row[0] || row[h - 1] === row[h]) return false; }
    return true;
  }
  // flip one half (side 0: sectors 0 .. S/2-1, side 1: sectors S/2 .. S-1) by 180 degrees: top sector j <-> bottom sector (mirrored inside the half)
  function slice(S, side) {
    if (!sliceLegal(S)) return false;
    side = side ? 1 : 0;
    const n = S.Ly.S, h = n / 2, base = side * h, top = S.layers[0], bot = S.layers[1], t0 = top.slice(), b0 = bot.slice(), moved = new Set();
    for (let i = 0; i < h; i++) { top[base + i] = b0[base + h - 1 - i]; bot[base + h - 1 - i] = t0[base + i]; moved.add(t0[base + i]); moved.add(b0[base + i]); }
    moved.forEach((o) => { o.flip ^= 1; });
    S.mflip[side] ^= 1;
    return true;
  }
  function record(S, mv) {
    const h = S.hist, n = S.Ly.S;
    if (mv.t === 'r') {
      for (let i = h.length - 1; i >= 0; i--) {
        const e = h[i];
        if (e.t === 's') break;
        if (e.l === mv.l) { let s = (((e.s + mv.s) % n) + n) % n; if (s === 0) h.splice(i, 1); else e.s = s > n / 2 ? s - n : s; return; }
      }
      h.push({ t: 'r', l: mv.l, s: mv.s });
    } else if (h.length && h[h.length - 1].t === 's' && (h[h.length - 1].h | 0) === (mv.h | 0)) h.pop(); else h.push({ t: 's', h: mv.h | 0 });
  }
  function apply(S, mv, rec) {
    if (mv.t === 'r') turn(S, mv.l, mv.s); else if (!slice(S, mv.h)) return false;
    if (rec !== false) record(S, mv);
    return true;
  }
  function inverse(mv) { return mv.t === 'r' ? { t: 'r', l: mv.l, s: -mv.s } : { t: 's', h: mv.h | 0 }; }
  function scramble(S, count, rnd) {
    const out = [], n = S.Ly.S;
    for (let i = 0; i < count; i++) {
      let mv;
      if (i % 2 === 1 && sliceLegal(S)) mv = { t: 's', h: rnd() < 0.5 ? 0 : 1 };
      else { const g = gran(S.Ly.P); mv = { t: 'r', l: Math.floor(rnd() * 2), s: g * (1 + Math.floor(rnd() * (n / g - 1))) }; if (mv.s > n / 2) mv.s -= n; }
      apply(S, mv); out.push(mv);
    }
    return out;
  }
  root.SQ1 = { gran: gran, pieceCount: pieceCount, layout: layout, faceOfSector: faceOfSector, create: create, turn: turn, slice: slice, sliceLegal: sliceLegal, apply: apply, inverse: inverse, record: record, scramble: scramble, isSolved: isSolved, signature: signature, sector: sector };
})(typeof window !== 'undefined' ? window : globalThis);
