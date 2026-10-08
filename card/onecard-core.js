/* One Card (원카드) rules engine + rule-based AI for 2 players. No DOM: usable from the page, a headless test or quickjs.
   Cards: 0..51 = suit*13 + (rank-1), suit 0=spade 1=heart 2=diamond 3=club, rank 1(A)..13(K); 52 = black/white joker, 53 = colour joker.
   State is plain JSON.  Players 0 and 1 (online: the host is 0).  Actions (S.turn acts):
     {type:'play', card, suit?, call?}  suit = chosen suit after a 7 ; call:true = "One Card!" said while playing the second-to-last card
     {type:'draw'}   {type:'pass'} (only after a drawn card that could be played)
   Out-of-turn helpers: call(S,p) ; catchOk(S,p) / penalty(S,p).                                                                  */
(function (root) {
  'use strict';
  var BJ = 52, CJ = 53, BURST = 20;
  function suit(id) { return id < 52 ? (id / 13) | 0 : -1; }
  function rank(id) { return id < 52 ? id % 13 + 1 : 0; }
  function isJoker(id) { return id >= 52; }
  function atkVal(id) { if (id === CJ) return 7; if (id === BJ || id === 0) return 5; var r = rank(id); return r === 1 ? 3 : r === 2 ? 2 : 0; }
  function again(id) { var r = rank(id); return r >= 11; }                    /* J, Q, K: the opponent is skipped = you play again (2 players) */
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, seed) { var r = rng(seed), i, j, t; for (i = arr.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  function rm(a, v) { var j = a.indexOf(v); if (j >= 0) a.splice(j, 1); return j >= 0; }
  function num(a, b) { return a - b; }

  /* can attack card t be answered by card c? (c is a card of the defender) */
  function defends(t, c) {
    if (!atkVal(c)) return false;
    if (c === 0 || c >= 52) return true;                      /* spade A and both jokers answer any attack */
    if (t === 0 || t >= 52) return false;                     /* spade A / jokers can only be answered by those */
    if (rank(t) === 1) return rank(c) === 1;                  /* A: any A */
    return rank(c) === 2 || (rank(c) === 1 && suit(c) === suit(t));   /* 2: any 2 or an A of the same suit */
  }
  function plain(id) { var r = rank(id); return !isJoker(id) && r !== 1 && r !== 2 && r !== 7 && r < 11; }

  function newState(seed, first) {
    var deck = [], i;
    for (i = 0; i < 54; i++) deck.push(i);
    shuffle(deck, seed >>> 0);
    var h0 = deck.slice(0, 7).sort(num), h1 = deck.slice(7, 14).sort(num), rest = deck.slice(14);   /* draw pile: pop() takes from the end */
    var j = rest.length - 1;
    while (j >= 0 && !plain(rest[j])) j--;                    /* starting card: first plain card (no attack / special) from the top */
    var top = rest.splice(j, 1)[0];
    return { seed: seed >>> 0, first: first, hands: [h0, h1], draw: rest, disc: [top], suit: suit(top), rank: rank(top), turn: first, atk: 0, atkCard: -1,
      phase: 'play', drawn: -1, pend1: -1, n: 0, reshuf: 0, ev: [], last: null, result: null };
  }
  /* the card c in hand of p may be played now? */
  function legal(S, p, c) {
    if (S.phase === 'over' || S.turn !== p || S.hands[p].indexOf(c) < 0) return false;
    if (S.phase === 'drawn' && c !== S.drawn) return false;
    if (S.atk > 0) return S.phase === 'play' && defends(S.atkCard, c);
    return isJoker(c) || suit(c) === S.suit || rank(c) === S.rank;
  }
  function legalCards(S, p) { return S.hands[p].filter(function (c) { return legal(S, p, c); }); }

  /* take k cards from the pile (reshuffling the discard pile under the top card when empty); returns the last card drawn (-1 if none) */
  function take(S, p, k) {
    var got = -1, rest;
    while (k-- > 0) {
      if (!S.draw.length) {
        if (S.disc.length < 2) break;
        rest = S.disc.splice(0, S.disc.length - 1); S.reshuf++;
        S.draw = shuffle(rest, (S.seed * 31 + S.reshuf * 7919) >>> 0); S.ev.push({ k: 'reshuffle' });
      }
      got = S.draw.pop(); S.hands[p].push(got);
    }
    S.hands[p].sort(num);
    return got;
  }
  function finish(S, winner, reason) {
    var l = S.hands[1 - winner].length;
    S.phase = 'over'; S.result = { winner: winner, reason: reason, pts: Math.max(1, l) }; S.pend1 = -1;
  }
  function burstCheck(S, p) { if (S.phase !== 'over' && S.hands[p].length >= BURST) { finish(S, 1 - p, 'burst'); return true; } return false; }

  function apply(S, a) {
    if (!a || S.phase === 'over') return false;
    var p = S.turn, c, v, k, ch;
    if (a.type === 'play') {
      c = a.card;
      if (!legal(S, p, c)) return false;
      S.ev = []; if (S.pend1 === 1 - p) S.pend1 = -1;
      rm(S.hands[p], c); S.disc.push(c); S.phase = 'play'; S.drawn = -1;
      ch = null;
      if (isJoker(c)) S.rank = 0;
      else { S.suit = suit(c); S.rank = rank(c); if (S.rank === 7) { ch = a.suit; if (!(ch >= 0 && ch <= 3)) ch = S.suit; S.suit = ch; } }
      v = atkVal(c);
      if (v) { S.atk += v; S.atkCard = c; S.ev.push({ k: 'atk', x: S.atk }); }
      S.last = { p: p, k: 'play', card: c, suit: ch };
      S.n++;
      if (!S.hands[p].length) { finish(S, p, 'out'); return true; }
      S.pend1 = S.hands[p].length === 1 && !a.call ? p : -1;
      if (!isJoker(c) && again(c)) S.ev.push({ k: 'again', x: rank(c) }); else S.turn = 1 - p;
      return true;
    }
    if (a.type === 'draw') {
      if (S.phase !== 'play') return false;
      S.ev = []; if (S.pend1 !== -1) S.pend1 = -1;
      if (S.atk > 0) {
        k = take(S, p, S.atk); S.ev.push({ k: 'pen', x: S.atk }); S.last = { p: p, k: 'draw', x: S.atk };
        S.atk = 0; S.atkCard = -1; S.n++;
        if (!burstCheck(S, p)) S.turn = 1 - p;
        return true;
      }
      k = take(S, p, 1); S.last = { p: p, k: 'draw', x: 1 }; S.n++;
      if (burstCheck(S, p)) return true;
      if (k >= 0) { S.drawn = k; S.phase = 'drawn'; if (!legal(S, p, k)) { S.phase = 'play'; S.drawn = -1; S.turn = 1 - p; } }
      else S.turn = 1 - p;
      return true;
    }
    if (a.type === 'pass') {
      if (S.phase !== 'drawn') return false;
      S.ev = []; S.phase = 'play'; S.drawn = -1; S.turn = 1 - p; S.last = { p: p, k: 'pass' }; S.n++;
      return true;
    }
    return false;
  }
  /* "One Card!" said by p after the play (no turn, no sequence number) */
  function call(S, p) { if (S.pend1 === p) { S.pend1 = -1; return true; } return false; }
  /* the player to move may catch the opponent who has one card and did not call: the opponent draws 2 */
  function catchable(S, p) { return S.phase !== 'over' && S.turn === p && S.pend1 === 1 - p && S.hands[1 - p].length === 1; }
  function penalty(S, victim) {
    if (S.pend1 !== victim) return false;
    S.ev = []; S.pend1 = -1; take(S, victim, 2); S.ev.push({ k: 'caught', x: 2 }); S.last = { p: victim, k: 'caught', x: 2 }; S.n++;
    burstCheck(S, victim); return true;
  }

  /* ---------------- AI ---------------- */
  function count(h, f) { var n = 0; h.forEach(function (x) { if (f(x)) n++; }); return n; }
  function bestSuit(h) {
    var cs = [0, 0, 0, 0]; h.forEach(function (x) { if (!isJoker(x)) cs[suit(x)]++; });
    var b = 0, i; for (i = 1; i < 4; i++) if (cs[i] > cs[b]) b = i;
    return b;
  }
  /* value of playing c (hand h of player p) ; returns {score, suit} */
  function evalPlay(S, p, c) {
    var h = S.hands[p].filter(function (x) { return x !== c; }), opp = S.hands[1 - p].length, r = rank(c), sc = 0, ns = S.suit, nr = S.rank, v = atkVal(c), prem = c === 0 || isJoker(c);
    if (isJoker(c)) nr = 0; else { ns = suit(c); nr = r; }
    if (r === 7 && !isJoker(c)) { ns = h.length ? bestSuit(h) : ns; if (h.length && count(h, function (x) { return suit(x) === ns; }) === 0) ns = suit(c); }
    if (!h.length) return { score: 1000, suit: ns };
    var follow = count(h, function (x) { return isJoker(x) || suit(x) === ns || (nr > 0 && rank(x) === nr); });
    sc += follow * 0.9;
    if (r === 7 && !isJoker(c)) sc += count(h, function (x) { return !isJoker(x) && suit(x) === ns; }) * 0.4 - 0.8;
    if (v) {
      if (prem) {
        if (S.atk > 0) sc += (S.atk >= 4 || h.length <= 3 || h.length + S.atk >= 13) ? 4 : -1.5;
        else sc += (opp <= 2 || h.length <= 2) ? 5 : -4;
      } else if (r === 1) sc += S.atk > 0 ? 3 : (opp <= 3 ? 4 : 1);
      else sc += S.atk > 0 ? 3.5 : 2.5;
    }
    if (!isJoker(c) && again(c)) sc += follow > 0 ? 3.2 : -1.5;
    if (h.length === 1) sc += follow > 0 ? 3 : 0;
    sc += 0.12 * count(h, function (x) { return suit(x) === suit(c); });       /* shed from the long suit, keep suit variety */
    if (!isJoker(c) && !v && r !== 7 && !again(c)) sc += 0.3;
    return { score: sc + Math.random() * 0.15, suit: ns };
  }
  function choose(S, p) {
    if (S.phase === 'over' || S.turn !== p) return null;
    var h = S.hands[p], best = null, bs = -1e9, e;
    legalCards(S, p).forEach(function (c) { e = evalPlay(S, p, c); if (e.score > bs) { bs = e.score; best = { type: 'play', card: c, suit: e.suit, call: true }; } });
    if (S.phase === 'drawn') return best && bs > -3 ? best : { type: 'pass' };
    if (!best) return { type: 'draw' };
    if (S.atk > 0) {
      var cost = -S.atk * 0.8 - (h.length + S.atk >= 15 ? 6 : 0) - (h.length + S.atk >= BURST ? 1000 : 0);
      if (cost > bs) return { type: 'draw' };
    }
    return best;
  }
  function hint(S, p) {
    if (S.phase === 'over') return null;
    if (S.turn !== p) return null;
    if (catchable(S, p)) return { type: 'catch' };
    return choose(S, p);
  }

  root.OC = { BJ: BJ, CJ: CJ, BURST: BURST, suit: suit, rank: rank, isJoker: isJoker, atkVal: atkVal, defends: defends, plain: plain, newState: newState, legal: legal, legalCards: legalCards,
    apply: apply, call: call, catchable: catchable, penalty: penalty, choose: choose, hint: hint, evalPlay: evalPlay, rng: rng, shuffle: shuffle };
})(typeof window !== 'undefined' ? window : this);
