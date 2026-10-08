/* Go-Stop (2-player Matgo) rules engine + rule-based AI. No DOM: usable from the page, from a headless test or from quickjs.
   State is plain JSON (JSON.parse(JSON.stringify(s)) clones it).  Players are 0 and 1; in an online game the host is 0.            */
(function (root) {
  'use strict';
  /* ---- the deck: id = month*4 + k (month 0..11).  class G=bright A=animal R=ribbon J=junk
        sub: G 'r' rain (Bi-gwang) | A 'b' bird (Godori) | R 'h' red poems, 'c' blue, 'o' plain red, 'p' no set | J 'd' double junk */
  var DEF = [
    [['G', ''], ['R', 'h'], ['J', ''], ['J', '']],
    [['A', 'b'], ['R', 'h'], ['J', ''], ['J', '']],
    [['G', ''], ['R', 'h'], ['J', ''], ['J', '']],
    [['A', 'b'], ['R', 'o'], ['J', ''], ['J', '']],
    [['A', ''], ['R', 'o'], ['J', ''], ['J', '']],
    [['A', ''], ['R', 'c'], ['J', ''], ['J', '']],
    [['A', ''], ['R', 'o'], ['J', ''], ['J', '']],
    [['G', ''], ['A', 'b'], ['J', ''], ['J', '']],
    [['A', ''], ['R', 'c'], ['J', ''], ['J', '']],
    [['A', ''], ['R', 'c'], ['J', ''], ['J', '']],
    [['G', ''], ['J', 'd'], ['J', ''], ['J', '']],
    [['G', 'r'], ['A', ''], ['R', 'p'], ['J', 'd']]
  ];
  var CLS = [], SUB = [], i, k;
  for (i = 0; i < 12; i++) for (k = 0; k < 4; k++) { CLS[i * 4 + k] = DEF[i][k][0]; SUB[i * 4 + k] = DEF[i][k][1]; }
  function mon(id) { return id >> 2; }
  function piVal(id) { return CLS[id] === 'J' ? (SUB[id] === 'd' ? 2 : 1) : 0; }
  function kindKey(id) { return CLS[id] + SUB[id]; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffled(seed) {
    var d = [], r = rng(seed), j, t; for (i = 0; i < 48; i++) d.push(i);
    for (i = 47; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = d[i]; d[i] = d[j]; d[j] = t; }
    return d;
  }
  function cnt4(arr) { var c = {}, m; arr.forEach(function (id) { m = mon(id); c[m] = (c[m] || 0) + 1; }); return c; }
  function has4(arr) { var c = cnt4(arr); return Object.keys(c).some(function (m) { return c[m] >= 4; }); }

  /* ---- scoring of a captured pile */
  var CUP = 32;     /* 9월 열끗 (sake cup): counts as an animal or as a double junk, the owner's choice */
  function score1(cap, cupPi) {
    var g = 0, rain = 0, a = 0, bird = 0, r = 0, h = 0, c = 0, o = 0, pi = 0, cj = 0;
    cap.forEach(function (id) {
      var s = SUB[id];
      if (id === CUP && cupPi) { pi += 2; cj++; return; }
      switch (CLS[id]) {
        case 'G': g++; if (s === 'r') rain = 1; break;
        case 'A': a++; if (s === 'b') bird++; break;
        case 'R': r++; if (s === 'h') h++; else if (s === 'c') c++; else if (s === 'o') o++; break;
        default: pi += s === 'd' ? 2 : 1; cj++;
      }
    });
    var P = { gw: g === 3 ? (rain ? 2 : 3) : g === 4 ? 4 : g === 5 ? 15 : 0, an: a >= 5 ? a - 4 : 0, bird: bird === 3 ? 5 : 0,
      rb: r >= 5 ? r - 4 : 0, hong: h === 3 ? 3 : 0, cheong: c === 3 ? 3 : 0, cho: o === 3 ? 3 : 0, jk: pi >= 10 ? pi - 9 : 0 };
    P.total = P.gw + P.an + P.bird + P.rb + P.hong + P.cheong + P.cho + P.jk;
    P.n = { g: g, a: a, r: r, pi: pi, cards: cap.length, rain: rain };
    P.cupPi = !!(cupPi && cap.indexOf(CUP) >= 0);
    return P;
  }
  /* mode: true = cup counts as double junk, false = as animal, null/undefined = whichever scores more (ties: animal) */
  function score(cap, mode) {
    if (cap.indexOf(CUP) < 0) return score1(cap, false);
    if (mode === true || mode === false) return score1(cap, mode);
    var a = score1(cap, false), b = score1(cap, true);
    return b.total > a.total ? b : a;
  }
  function scoreOf(s, p) { return score(s.cap[p], s.cup[p]); }

  /* ---- state */
  function newState(seed, first, carry) {
    var k0 = 0, deck, h0, h1, f;
    for (;;) {
      deck = shuffled((seed + k0 * 7919) >>> 0);
      h0 = deck.slice(0, 10); h1 = deck.slice(10, 20); f = deck.slice(20, 28);
      if (!has4(f)) break;      /* 4 cards of one month on the table: redeal */
      k0++;
    }
    var srt = function (a) { return a.sort(function (x, y) { return x - y; }); };
    var s = { carry: carry || 1, cup: [null, null], ppeokStreak: [0, 0], seed: seed >>> 0, first: first, hands: [srt(h0), srt(h1)], field: f, stock: deck.slice(28).reverse(), cap: [[], []],
      turn: first, phase: 'play', goCount: [0, 0], goScore: [0, 0], shakes: [0, 0], shaken: [{}, {}], skips: [0, 0],
      ppeok: {}, ppeokCnt: [0, 0], cur: null, ev: [], cands: null, result: null, n: 0 };
    /* chongtong: 4 cards of one month in a hand wins at once with 10 points */
    var ct = [0, 1].filter(function (q) { return has4(s.hands[q]); });
    if (ct.length) { var w = ct.indexOf(first) >= 0 ? first : ct[0]; s.phase = 'over'; s.result = { winner: w, draw: false, base: 10, goBonus: 0, goMul: 1, shakeMul: 1, bak: [], special: 'chongtong', carry: s.carry, pts: 10 * s.carry, sc: [0, 0] }; }
    return s;
  }
  function remaining(s, p) { return s.hands[p].length + s.skips[p]; }
  function fieldOf(s, m) { return s.field.filter(function (id) { return mon(id) === m; }); }
  function rm(arr, v) { var j = arr.indexOf(v); if (j >= 0) arr.splice(j, 1); }
  function capture(s, p, cards) {
    cards.forEach(function (id) { rm(s.field, id); s.cap[p].push(id); s.cur.got.push(id); });
  }
  function steal(s, p, n) {
    var o = 1 - p, got = 0, j, pile = s.cap[o];
    while (n-- > 0) {
      j = -1;
      for (i = 0; i < pile.length; i++) if (CLS[pile[i]] === 'J' && SUB[pile[i]] !== 'd') { j = i; break; }
      if (j < 0) for (i = 0; i < pile.length; i++) if (CLS[pile[i]] === 'J') { j = i; break; }
      if (j < 0) break;
      var id = pile.splice(j, 1)[0]; s.cap[p].push(id); s.cur.got.push(id); s.cur.stolen.push(id); got++;
    }
    return got;
  }
  function ev(s, k, p, x) { s.ev.push({ k: k, p: p, x: x }); }

  /* ---- actions.  Each returns true when applied. */
  function begin(s, hc) {
    s.ev = []; s.n++;
    s.cur = { p: s.turn, hc: hc, hm: hc == null ? -1 : mon(hc), got: [], stolen: [], mode: 'none', pair: null, rem: null, x: null };
  }
  function takeQuad(s, p, m, first) {   /* capture the 3 on the field + the matching card */
    var fm = fieldOf(s, m);
    capture(s, p, [first].concat(fm));
    if (s.ppeok[m] != null) { var o = s.ppeok[m]; delete s.ppeok[m]; steal(s, p, o === p ? 2 : 1); ev(s, o === p ? 'selfeat' : 'eat', p); }
  }
  function play(s, cid) {
    if (s.phase !== 'play' || s.hands[s.turn].indexOf(cid) < 0) return false;
    var p = s.turn, m = mon(cid), fm = fieldOf(s, m);
    begin(s, cid); rm(s.hands[p], cid);
    if (fm.length === 0) { s.cur.mode = 'none'; s.field.push(cid); }
    else if (fm.length === 1) { s.cur.mode = 'pair'; s.cur.pair = [cid, fm[0]]; }
    else if (fm.length === 2) {
      if (kindKey(fm[0]) === kindKey(fm[1])) { s.cur.mode = 'pick2'; s.cur.pair = [cid, fm[0]]; s.cur.rem = fm[1]; }
      else { s.phase = 'pickHand'; s.cands = fm.slice(); return true; }
    } else { s.cur.mode = 'quad'; takeQuad(s, p, m, cid); }
    flip(s); return true;
  }
  function skip(s) {
    if (s.phase !== 'play' || s.skips[s.turn] < 1) return false;
    s.skips[s.turn]--; begin(s, null); s.cur.mode = 'skip'; flip(s); return true;
  }
  function bombable(s, p) {
    var c = cnt4(s.hands[p]), r = [];
    Object.keys(c).forEach(function (m) { if (c[m] === 3 && fieldOf(s, +m).length === 1) r.push(+m); });
    return r;
  }
  function shakable(s, p) {
    var c = cnt4(s.hands[p]), r = [];
    Object.keys(c).forEach(function (m) { if (c[m] === 3 && fieldOf(s, +m).length === 0 && !s.shaken[p][m]) r.push(+m); });
    return r;
  }
  function bomb(s, m) {
    var p = s.turn;
    if (s.phase !== 'play' || bombable(s, p).indexOf(m) < 0) return false;
    var three = s.hands[p].filter(function (id) { return mon(id) === m; });
    begin(s, null); s.cur.mode = 'bomb'; s.cur.hm = m;
    three.forEach(function (id) { rm(s.hands[p], id); });
    capture(s, p, three.concat(fieldOf(s, m)));    /* capture() removes the field card; hand cards are not on the field */
    steal(s, p, 1); s.skips[p] += 2; s.shakes[p]++; ev(s, 'bomb', p);
    flip(s); return true;
  }
  function shake(s, m) {
    var p = s.turn;
    if (s.phase !== 'play' || shakable(s, p).indexOf(m) < 0) return false;
    s.shaken[p][m] = true; s.shakes[p]++; s.ev = [{ k: 'shake', p: p, x: m }]; s.n++; return true;
  }
  function pick(s, fid) {
    if ((s.phase !== 'pickHand' && s.phase !== 'pickStock') || !s.cands || s.cands.indexOf(fid) < 0) return false;
    var c = s.cur, p = c.p, other = s.cands.filter(function (x) { return x !== fid; })[0];
    var hand = s.phase === 'pickHand';
    s.phase = 'play'; s.cands = null; s.n++;
    if (hand) { c.mode = 'pick2'; c.pair = [c.hc, fid]; c.rem = other; flip(s); }
    else { capture(s, p, [c.x, fid]); finish(s); }
    return true;
  }
  function flip(s) {
    var c = s.cur, p = c.p;
    if (!s.stock.length) {      /* cannot happen with the normal deal; settle the hand part and go on */
      if (c.mode === 'pair' || c.mode === 'pick2') capture(s, p, c.pair);
      finish(s); return;
    }
    var x = s.stock.pop(), mx = mon(x); c.x = x;
    switch (c.mode) {
      case 'none':
        if (mx === c.hm) { capture(s, p, [c.hc]); c.got.push(x); s.cap[p].push(x); steal(s, p, 1); ev(s, 'jjok', p); }
        else stockNormal(s, x);
        break;
      case 'pair':
        if (mx === c.hm) {            /* ppeok: the three cards stay on the table */
          s.field.push(c.hc, x); s.ppeok[c.hm] = p; s.ppeokCnt[p]++; s.ppeokStreak[p]++; ev(s, 'ppeok', p);
          if (s.ppeokStreak[p] >= 3) { endGame(s, p, '3ppeok'); return; }
        } else { capture(s, p, c.pair); stockNormal(s, x); }
        break;
      case 'pick2':
        if (mx === c.hm) { capture(s, p, [c.pair[0], c.pair[1], c.rem]); c.got.push(x); s.cap[p].push(x); steal(s, p, 1); ev(s, 'ttadak', p); }
        else { capture(s, p, c.pair); stockNormal(s, x); }
        break;
      default: stockNormal(s, x);
    }
    if (s.phase === 'play') finish(s);
  }
  function stockNormal(s, x) {
    var p = s.cur.p, mx = mon(x), fm = fieldOf(s, mx);
    if (fm.length === 0) s.field.push(x);
    else if (fm.length === 1) { capture(s, p, [fm[0]]); s.cap[p].push(x); s.cur.got.push(x); }
    else if (fm.length === 2) {
      if (kindKey(fm[0]) === kindKey(fm[1])) { capture(s, p, [fm[0]]); s.cap[p].push(x); s.cur.got.push(x); }
      else { s.phase = 'pickStock'; s.cands = fm.slice(); }
    } else { takeQuad(s, p, mx, x); }
  }
  function finish(s) {
    if (s.phase === 'over') return;
    var c = s.cur, p = c.p;
    if (!s.ev.some(function (e) { return e.k === 'ppeok'; })) s.ppeokStreak[p] = 0;
    var rem = remaining(s, 0) + remaining(s, 1);
    if (s.field.length === 0 && c.got.length > 0 && rem > 0) { steal(s, p, 1); ev(s, 'sweep', p); }
    var sc = scoreOf(s, p).total;
    if (rem === 0) { if (sc >= 7 && sc > s.goScore[p]) endGame(s, p); else endGame(s, null); return; }
    if (sc >= 7 && sc > s.goScore[p]) { s.phase = 'go'; return; }
    nextTurn(s);
  }
  function nextTurn(s) {
    s.turn = 1 - s.cur.p; s.phase = 'play';
    if (remaining(s, s.turn) === 0 && remaining(s, 1 - s.turn) > 0) s.turn = 1 - s.turn;   /* safety */
  }
  function go(s, yes) {
    if (s.phase !== 'go') return false;
    var p = s.turn; s.n++;
    if (yes) { s.goCount[p]++; s.goScore[p] = scoreOf(s, p).total; s.ev = [{ k: 'go', p: p, x: s.goCount[p] }]; nextTurn(s); }
    else endGame(s, p);
    return true;
  }
  function settle(s, w, special) {
    var l = 1 - w, sw = scoreOf(s, w), sl = scoreOf(s, l), goN = s.goCount[w];
    var base = special ? 10 : sw.total, gb = Math.min(goN, 2), gm = goN > 2 ? Math.pow(2, goN - 2) : 1;
    var shake = Math.pow(2, s.shakes[0] + s.shakes[1]), bak = [];
    if (!special) {
      if (sw.gw > 0 && sl.n.g === 0) bak.push('gwang');
      if (sw.jk > 0 && sl.n.pi <= 5) bak.push('pi');
      if (sw.n.a >= 7) bak.push('meong');
      if (s.goCount[l] > 0) bak.push('go');
    }
    var carry = s.carry || 1;
    return { winner: w, draw: false, base: base, goBonus: special ? 0 : gb, goMul: special ? 1 : gm, shakeMul: special ? 1 : shake, bak: bak, special: special || '', carry: carry,
      pts: special ? 10 * carry : (base + gb) * gm * shake * Math.pow(2, bak.length) * carry, sc: [scoreOf(s, 0).total, scoreOf(s, 1).total] };
  }
  function endGame(s, stopper, special) {
    var w = stopper;
    if (w == null) {
      var goers = [0, 1].filter(function (q) { return s.goCount[q] > 0; });
      if (goers.length === 1) w = goers[0];
      else if (goers.length === 2) { var a = scoreOf(s, 0).total, b = scoreOf(s, 1).total; w = a > b ? 0 : b > a ? 1 : null; }
    }
    s.phase = 'over'; s.cands = null;
    s.result = w == null ? { winner: -1, draw: true, pts: 0, base: 0, bak: [], special: '', carry: s.carry || 1, sc: [scoreOf(s, 0).total, scoreOf(s, 1).total] } : settle(s, w, special);
  }
  function cup(s, pi) {
    var p = s.turn;
    if ((s.phase !== 'play' && s.phase !== 'go') || s.cap[p].indexOf(CUP) < 0) return false;
    s.cup[p] = !!pi; s.n++; s.ev = []; return true;
  }
  function apply(s, a) {
    if (!a) return false;
    switch (a.type) {
      case 'play': return play(s, a.card);
      case 'pick': return pick(s, a.card);
      case 'go': return go(s, !!a.yes);
      case 'shake': return shake(s, a.month);
      case 'bomb': return bomb(s, a.month);
      case 'skip': return skip(s);
      case 'cup': return cup(s, a.pi);
    }
    return false;
  }

  /* ===================== AI ===================== */
  function unseen(s, p) {      /* cards of each month the player cannot see (opponent hand or stock) */
    var u = []; for (i = 0; i < 12; i++) u[i] = 4;
    [s.hands[p], s.field, s.cap[0], s.cap[1]].forEach(function (arr) { arr.forEach(function (id) { u[mon(id)]--; }); });
    return u;
  }
  function owned(s, p, f) { return s.cap[p].filter(f).length; }
  var GROUP = { h: [0, 1, 2], c: [5, 8, 9], o: [3, 4, 6] };
  function cv(s, p, id) {      /* how much player p wants to own card id */
    var cls = CLS[id], sub = SUB[id], v, mine = s.cap[p], opp = s.cap[1 - p], n;
    if (cls === 'G') {
      n = owned(s, p, function (x) { return CLS[x] === 'G'; });
      v = (sub === 'r' ? 7 : 12) + 3 * n;
      if (owned(s, 1 - p, function (x) { return CLS[x] === 'G'; }) >= 2) v += 3;
    } else if (cls === 'A') {
      v = sub === 'b' ? 9 : 6.5;
      if (sub === 'b') v += 3 * owned(s, p, function (x) { return CLS[x] === 'A' && SUB[x] === 'b'; });
      if (owned(s, p, function (x) { return CLS[x] === 'A'; }) >= 4) v += 3;
    } else if (cls === 'R') {
      v = 5;
      var g = GROUP[sub];
      if (g) {
        var mi = owned(s, p, function (x) { return g.indexOf(mon(x)) >= 0 && CLS[x] === 'R'; }), oi = owned(s, 1 - p, function (x) { return g.indexOf(mon(x)) >= 0 && CLS[x] === 'R'; });
        v += 3.5 * mi; if (oi > 0) v -= 2; if (oi >= 2) v += 4;
      }
      if (owned(s, p, function (x) { return CLS[x] === 'R'; }) >= 4) v += 2;
    } else {
      v = sub === 'd' ? 4.5 : 2.2;
      if (score(mine, s.cup[p]).n.pi >= 7) v += 1;
    }
    return v;
  }
  function pOpp(s, p, m, u) {   /* chance that the opponent can take a card put on the table in month m */
    var oh = s.hands[1 - p].length, U = oh + s.stock.length;
    if (U <= 0 || u[m] <= 0) return 0;
    return Math.min(0.95, u[m] * (oh + 1) / U);
  }
  function evalPlay(s, p, cid) {
    var m = mon(cid), fm = fieldOf(s, m), u = unseen(s, p), U = s.hands[1 - p].length + s.stock.length || 1, pf = u[m] / U, sc, target = null;
    if (fm.length === 0) {
      sc = -cv(s, p, cid) * pOpp(s, p, m, u) * 0.9 + pf * (cv(s, p, cid) + 5);
    } else if (fm.length === 1) {
      var g = cv(s, p, cid) + cv(s, p, fm[0]); target = fm[0];
      sc = g + 1 - pf * (g * 0.9 + 6);                            /* ppeok risk */
    } else if (fm.length === 2) {
      var a0 = cv(s, p, fm[0]), a1 = cv(s, p, fm[1]);
      target = a0 >= a1 ? fm[0] : fm[1];
      sc = cv(s, p, cid) + Math.max(a0, a1) + 1 + pf * (Math.min(a0, a1) + 5);
    } else {
      sc = cv(s, p, cid) + fm.reduce(function (t, x) { return t + cv(s, p, x); }, 0) + (s.ppeok[m] != null ? (s.ppeok[m] === p ? 9 : 5) : 0);
      target = fm[0];
    }
    if (fm.length >= 1 && s.field.length === fm.length) sc += 3;   /* sweep chance */
    /* mild preference: keep cards that still have partners in the hand for later */
    var same = s.hands[p].filter(function (x) { return mon(x) === m && x !== cid; }).length;
    if (fm.length === 0) sc -= same * 0.8;
    return { score: sc, target: target };
  }
  function bestPlay(s, p) {
    var best = null;
    s.hands[p].forEach(function (cid) {
      var e = evalPlay(s, p, cid), sc = e.score + (CLS[cid] === 'J' && fieldOf(s, mon(cid)).length === 0 ? 0.3 : 0);
      if (!best || sc > best.score + 1e-9) best = { card: cid, score: sc, target: e.target };
    });
    return best;
  }
  function danger(s, p) {
    var o = 1 - p, sc = scoreOf(s, o), d = sc.total, n = sc.n;
    var part = 0;
    if (n.g === 2) part += 1.5;
    ['h', 'c', 'o'].forEach(function (k) { var c = owned(s, o, function (x) { return SUB[x] === k && CLS[x] === 'R'; }); if (c === 2) part += 1.5; });
    if (owned(s, o, function (x) { return SUB[x] === 'b' && CLS[x] === 'A'; }) === 2) part += 2;
    if (n.pi >= 7) part += 1; if (n.a >= 4) part += 1; if (n.r >= 4) part += 1;
    return d + part;
  }
  function decideGo(s, p) {
    var sc = scoreOf(s, p).total, left = remaining(s, p), d = danger(s, p), g = s.goCount[p];
    if (left <= 2) return false;
    if (d >= 4.5) return false;
    if (g >= 2 && sc < 12) return false;
    if (g >= 3) return false;
    if (sc >= 12) return left >= 5 && d < 3 && g < 3;
    return true;
  }
  function choose(s, p) {       /* the AI / auto decision for player p in the current phase (p must be the one to act) */
    var best, c;
    if (s.phase === 'play') {
      var b = bombable(s, p); if (b.length) return { type: 'bomb', month: b[0] };
      var sh = shakable(s, p); if (sh.length) return { type: 'shake', month: sh[0] };
      if (s.hands[p].length === 0) return { type: 'skip' };
      best = bestPlay(s, p);
      if (s.skips[p] > 0 && best.score < -4) return { type: 'skip' };
      return { type: 'play', card: best.card };
    }
    if (s.phase === 'pickHand' || s.phase === 'pickStock') {
      var bv = -1e9, bc = s.cands[0];
      s.cands.forEach(function (x) { var v = cv(s, p, x); if (v > bv) { bv = v; bc = x; } });
      return { type: 'pick', card: bc };
    }
    if (s.phase === 'go') return { type: 'go', yes: decideGo(s, p) };
    return null;
  }
  function hint(s, p) {         /* what to show a human: play/shake/bomb/skip: { type, card, target, month }; pick phases: { type:'pick', card }; go: { type:'go', yes } */
    var a = choose(s, p);
    if (!a) return null;
    if (a.type === 'play' || a.type === 'shake' || a.type === 'bomb' || a.type === 'skip') {
      var h = { type: a.type, month: a.month, card: a.card, target: null };
      if (a.type === 'bomb') h.target = fieldOf(s, a.month)[0];
      else if (s.hands[p].length) { var b = bestPlay(s, p); if (a.type !== 'play') h.card = b.card; h.target = b.target; }
      return h;
    }
    return a;
  }

  var GS = { DEF: DEF, CLS: CLS, SUB: SUB, mon: mon, piVal: piVal, kindKey: kindKey, score: score, scoreOf: scoreOf, CUP: CUP, newState: newState, apply: apply, play: play, pick: pick, go: go, bomb: bomb, skip: skip, shake: shake,
    bombable: bombable, shakable: shakable, remaining: remaining, fieldOf: fieldOf, settle: settle, shuffled: shuffled, cv: cv, choose: choose, hint: hint, danger: danger, decideGo: decideGo, clone: function (s) { return JSON.parse(JSON.stringify(s)); } };
  root.GS = GS;
  if (typeof module !== 'undefined' && module.exports) module.exports = GS;
})(typeof window !== 'undefined' ? window : globalThis);
