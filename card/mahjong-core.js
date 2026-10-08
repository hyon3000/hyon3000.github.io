/* Riichi Mahjong engine + AI (East-only game, you vs 3 computers).
 * Hand evaluation (agari / yaku / han / fu / points) is done by the vendored MIT library "riichi" (+ agari, syanten)
 * in mj/riichi-bundle.js (global MJLib).  Everything else (wall, turns, calls, riichi, furiten, draws, payments, AI)
 * is in this file.  Pure logic, no DOM.  Global: window.MJ
 *
 * Tiles: id 0..135, kind = id>>2 (0-8 man, 9-17 pin, 18-26 sou, 27-30 E S W N, 31 haku 32 hatsu 33 chun).
 * Red fives: ids 16 (5m) 52 (5p) 88 (5s), i.e. kind*4+0 for kinds 4/13/22.
 */
(function (global) {
'use strict';
var L = global.MJLib;
var MJ = {};
global.MJ = MJ;

/* ---------------------------------------------------------------- tiles */
var REDS = { 16: 1, 52: 1, 88: 1 };
function kindOf(id) { return id >> 2; }
function isRed(id) { return REDS[id] === 1; }
function isHonor(k) { return k >= 27; }
function isTerm(k) { return k >= 27 || k % 9 === 0 || k % 9 === 8; }
function isSimple(k) { return !isTerm(k); }
function suitOf(k) { return k < 27 ? (k / 9) | 0 : 3; }
function kstr(k) { return k < 27 ? ((k % 9) + 1) + 'mps'.charAt((k / 9) | 0) : (k - 26) + 'z'; }
function tstr(id) { var k = id >> 2; if (REDS[id]) return '0' + 'mps'.charAt((k / 9) | 0); return kstr(k); }
function doraOf(ind) { // indicator kind -> dora kind
  if (ind < 27) return (ind % 9 === 8) ? ind - 8 : ind + 1;
  if (ind < 31) return ind === 30 ? 27 : ind + 1;
  return ind === 33 ? 31 : ind + 1;
}
MJ.kindOf = kindOf; MJ.isRed = isRed; MJ.isTerm = isTerm; MJ.kstr = kstr; MJ.doraOf = doraOf; MJ.isHonor = isHonor;
var TERMS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function countsOf(ids, c) { c = c || new Array(34); for (var i = 0; i < 34; i++) c[i] = 0; for (i = 0; i < ids.length; i++) c[ids[i] >> 2]++; return c; }
function toHai(c) { // 34 counts -> riichi lib [4][9]
  return [c.slice(0, 9), c.slice(9, 18), c.slice(18, 27), c.slice(27, 34)];
}

/* ---------------------------------------------------------------- shanten (own fast implementation, cross-checked against the library in the tests) */
var shCache = {};
var shCacheN = 0;
var suitMemo = {};            // per-suit table: key (base-5 counts) -> [bestT with no head per m (0..4), bestT with head per m]
var suitMemoN = 0;
function suitTable(c, off, len, seq) {
  var key = (seq ? 1 : 2), i;
  for (i = len - 1; i >= 0; i--) key = key * 5 + c[off + i];
  var t = suitMemo[key];
  if (t) return t;
  var a = [-1, -1, -1, -1, -1], h = [-1, -1, -1, -1, -1], w = [];
  for (i = 0; i < len; i++) w.push(c[off + i]);
  var mm = 0, tt = 0, head = 0;
  (function dfs(i) {
    while (i < len && w[i] === 0) i++;
    if (i >= len) {
      var arr = head ? h : a, m = mm > 4 ? 4 : mm; if (tt > arr[m]) arr[m] = tt; return;
    }
    if (w[i] >= 3) { w[i] -= 3; mm++; dfs(i); mm--; w[i] += 3; }
    if (seq && i <= len - 3 && w[i + 1] > 0 && w[i + 2] > 0) { w[i]--; w[i + 1]--; w[i + 2]--; mm++; dfs(i); mm--; w[i]++; w[i + 1]++; w[i + 2]++; }
    if (w[i] >= 2) { w[i] -= 2; if (!head) { head = 1; dfs(i); head = 0; } tt++; dfs(i); tt--; w[i] += 2; }
    if (seq && i <= len - 2 && w[i + 1] > 0) { w[i]--; w[i + 1]--; tt++; dfs(i); tt--; w[i]++; w[i + 1]++; }
    if (seq && i <= len - 3 && w[i + 2] > 0) { w[i]--; w[i + 2]--; tt++; dfs(i); tt--; w[i]++; w[i + 2]++; }
    w[i]--; dfs(i); w[i]++;
  })(0);
  t = [a, h];
  if (suitMemoN > 300000) { suitMemo = {}; suitMemoN = 0; }
  suitMemo[key] = t; suitMemoN++;
  return t;
}
function shNormal(c, m) {
  // dp[head][mentsu] = max taatsu
  var d0 = [-1, -1, -1, -1, -1], d1 = [-1, -1, -1, -1, -1];
  d0[0] = 0;
  for (var s = 0; s < 4; s++) {
    var tb = s < 3 ? suitTable(c, s * 9, 9, true) : suitTable(c, 27, 7, false), a = tb[0], h = tb[1];
    var n0 = [-1, -1, -1, -1, -1], n1 = [-1, -1, -1, -1, -1], i, j, v;
    for (i = 0; i < 5; i++) {
      if (d0[i] >= 0) {
        for (j = 0; j < 5; j++) {
          if (a[j] >= 0) { var k = i + j > 4 ? 4 : i + j; v = d0[i] + a[j]; if (v > n0[k]) n0[k] = v; }
          if (h[j] >= 0) { k = i + j > 4 ? 4 : i + j; v = d0[i] + h[j]; if (v > n1[k]) n1[k] = v; }
        }
      }
      if (d1[i] >= 0) {
        for (j = 0; j < 5; j++) if (a[j] >= 0) { k = i + j > 4 ? 4 : i + j; v = d1[i] + a[j]; if (v > n1[k]) n1[k] = v; }
      }
    }
    d0 = n0; d1 = n1;
  }
  var best = 8 - 2 * m;
  for (var i2 = 0; i2 < 5; i2++) {
    for (var hd = 0; hd < 2; hd++) {
      var t = hd ? d1[i2] : d0[i2]; if (t < 0) continue;
      var mt = i2 + m; if (mt > 4) mt = 4;
      var tc = t; if (mt + tc > 4) tc = 4 - mt; if (tc < 0) tc = 0;
      var sh = 8 - 2 * mt - tc - hd; if (sh < best) best = sh;
    }
  }
  return best;
}
function shNormalSlow(c, m) {
  var best = 8 - 2 * m, mm = 0, tt = 0, head = 0;
  function dfs(i) {
    while (i < 34 && c[i] === 0) i++;
    if (i >= 34) {
      var mt = mm + m, t = tt; if (mt + t > 4) t = 4 - mt;
      var s = 8 - 2 * mt - t - head; if (s < best) best = s; return;
    }
    var suit = i < 27, r = i % 9;
    if (c[i] >= 3) { c[i] -= 3; mm++; dfs(i); mm--; c[i] += 3; }
    if (suit && r <= 6 && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; mm++; dfs(i); mm--; c[i]++; c[i + 1]++; c[i + 2]++; }
    if (c[i] >= 2) { c[i] -= 2; if (!head) { head = 1; dfs(i); head = 0; } tt++; dfs(i); tt--; c[i] += 2; }
    if (suit && r <= 7 && c[i + 1] > 0) { c[i]--; c[i + 1]--; tt++; dfs(i); tt--; c[i]++; c[i + 1]++; }
    if (suit && r <= 6 && c[i + 2] > 0) { c[i]--; c[i + 2]--; tt++; dfs(i); tt--; c[i]++; c[i + 2]++; }
    c[i]--; dfs(i); c[i]++;
  }
  dfs(0);
  return best;
}
MJ.shNormalSlow = shNormalSlow;
function shChiitoi(c) {
  var pairs = 0, kinds = 0;
  for (var i = 0; i < 34; i++) { if (c[i] > 0) kinds++; if (c[i] >= 2) pairs++; }
  return 6 - pairs + (kinds < 7 ? 7 - kinds : 0);
}
function shKokushi(c) {
  var n = 0, pair = 0;
  for (var i = 0; i < 13; i++) { var k = TERMS[i]; if (c[k] > 0) n++; if (c[k] >= 2) pair = 1; }
  return 13 - n - pair;
}
/* c: 34 counts of concealed tiles, m: number of melds.  Returns -1 when complete. */
function shanten(c, m) {
  var key = m + ':' + c.join('');
  var v = shCache[key];
  if (v !== undefined) return v;
  v = shNormal(c, m);
  if (m === 0) { var a = shChiitoi(c); if (a < v) v = a; a = shKokushi(c); if (a < v) v = a; }
  if (shCacheN > 400000) { shCache = {}; shCacheN = 0; }
  shCache[key] = v; shCacheN++;
  return v;
}
MJ.shanten = shanten; MJ.countsOf = countsOf;

function agariCheck(c) { return L.agari.checkAll(toHai(c)); }
function waitKinds(c, m) { // c: counts of 3n+1 tiles. returns list of kinds completing it
  var out = [];
  if (shanten(c, m) > 0) return out;
  for (var k = 0; k < 34; k++) {
    if (c[k] >= 4) continue;
    c[k]++;
    if (agariCheck(c)) out.push(k);
    c[k]--;
  }
  return out;
}
MJ.waitKinds = waitKinds;

/* ---------------------------------------------------------------- yaku names */
var YAKU = {
  '立直': ['riichi', 'Riichi', '리치'], 'ダブル立直': ['dblriichi', 'Double Riichi', '더블 리치'], '一発': ['ippatsu', 'Ippatsu', '일발'],
  '門前清自摸和': ['tsumo', 'Menzen Tsumo', '멘젠 쯔모'], '平和': ['pinfu', 'Pinfu', '핑후'], '断么九': ['tanyao', 'Tanyao', '탕야오'],
  '一盃口': ['iipeikou', 'Iipeikou', '이페코'], '二盃口': ['ryanpeikou', 'Ryanpeikou', '량페코'],
  '役牌白': ['haku', 'Yakuhai: Haku (white)', '역패: 백'], '役牌発': ['hatsu', 'Yakuhai: Hatsu (green)', '역패: 발'], '役牌中': ['chun', 'Yakuhai: Chun (red)', '역패: 중'],
  '場風東': ['rw1', 'Round wind: East', '장풍: 동'], '場風南': ['rw2', 'Round wind: South', '장풍: 남'], '場風西': ['rw3', 'Round wind: West', '장풍: 서'], '場風北': ['rw4', 'Round wind: North', '장풍: 북'],
  '自風東': ['sw1', 'Seat wind: East', '자풍: 동'], '自風南': ['sw2', 'Seat wind: South', '자풍: 남'], '自風西': ['sw3', 'Seat wind: West', '자풍: 서'], '自風北': ['sw4', 'Seat wind: North', '자풍: 북'],
  '七対子': ['chiitoi', 'Chiitoitsu', '치또이츠'], '対々和': ['toitoi', 'Toitoi', '또이또이'], '三暗刻': ['sanankou', 'Sanankou', '산안커'],
  '三色同順': ['sanshoku', 'Sanshoku Doujun', '삼색동순'], '三色同刻': ['sandoukou', 'Sanshoku Doukou', '삼색동각'], '一気通貫': ['ittsu', 'Ittsu', '일기통관'],
  '混全帯么九': ['chanta', 'Chanta', '찬타'], '純全帯么九': ['junchan', 'Junchan', '준찬타'], '混老頭': ['honroutou', 'Honroutou', '혼노두'],
  '小三元': ['shousangen', 'Shousangen', '소삼원'], '三槓子': ['sankantsu', 'Sankantsu', '산깡쯔'], '混一色': ['honitsu', 'Honitsu', '혼일색'], '清一色': ['chinitsu', 'Chinitsu', '청일색'],
  '嶺上開花': ['rinshan', 'Rinshan Kaihou', '영상개화'], '搶槓': ['chankan', 'Chankan', '창깡'], '海底摸月': ['haitei', 'Haitei Raoyue', '해저모월'], '河底撈魚': ['houtei', 'Houtei Raoyui', '하저로어'],
  'ドラ': ['dora', 'Dora', '도라'], '赤ドラ': ['aka', 'Red five (aka dora)', '적도라'], '裏ドラ': ['ura', 'Ura dora', '뒷도라'],
  '国士無双': ['kokushi', 'Kokushi Musou', '국사무쌍'], '国士無双十三面待ち': ['kokushi13', 'Kokushi 13-wait', '국사무쌍 13면대기'],
  '純正九蓮宝燈': ['junchuuren', 'Junsei Chuuren Poutou', '순정 구련보등'], '九蓮宝燈': ['chuuren', 'Chuuren Poutou', '구련보등'],
  '四暗刻単騎待ち': ['suuankoutanki', 'Suuankou Tanki', '쓰안커 단기'], '四暗刻': ['suuankou', 'Suuankou', '쓰안커'],
  '大四喜': ['daisuushii', 'Daisuushii', '대사희'], '小四喜': ['shousuushii', 'Shousuushii', '소사희'], '大三元': ['daisangen', 'Daisangen', '대삼원'],
  '字一色': ['tsuuiisou', 'Tsuuiisou', '자일색'], '緑一色': ['ryuuiisou', 'Ryuuiisou', '녹일색'], '清老頭': ['chinroutou', 'Chinroutou', '청노두'],
  '四槓子': ['suukantsu', 'Suukantsu', '쓰깡쯔'], '天和': ['tenhou', 'Tenhou', '천화'], '地和': ['chiihou', 'Chiihou', '지화']
};
var LIMIT = { '満貫': ['Mangan', '만관'], '跳満': ['Haneman', '하네만'], '倍満': ['Baiman', '배만'], '三倍満': ['Sanbaiman', '삼배만'], '数え役満': ['Kazoe Yakuman', '헤아림 역만'], '役満': ['Yakuman', '역만'] };
MJ.YAKU = YAKU;
function limitName(jp, ko) {
  if (!jp) return '';
  var m = /^(\d+)倍役満$/.exec(jp); if (m) return ko ? m[1] + '배 역만' : m[1] + 'x Yakuman';
  var t = LIMIT[jp]; return t ? t[ko ? 1 : 0] : jp;
}
MJ.limitName = limitName;
MJ.yakuName = function (jp, ko) { var y = YAKU[jp]; return y ? y[ko ? 2 : 1] : jp; };

/* Evaluate a complete hand described with the library string syntax. Returns the library result with parsed yaku list. */
function runLib(str) {
  var r = new L.Riichi(str);
  var res = r.calc();
  var list = [], han = 0;
  for (var k in res.yaku) {
    var v = res.yaku[k], h = /^\d+/.test(v) ? parseInt(v, 10) : 0;
    list.push({ jp: k, id: (YAKU[k] || [k])[0], han: h, yakuman: h === 0 ? (v.indexOf('ダブル') === 0 ? 2 : 1) : 0 });
  }
  return { isAgari: res.isAgari, yaku: list, han: res.han, fu: res.fu, ten: res.ten, yakuman: res.yakuman, name: res.name, oya: res.oya, ko: res.ko, error: res.error, raw: res };
}
MJ.evalString = runLib;

/* ---------------------------------------------------------------- the game */
function Game(o) {
  o = o || {};
  this.seed = o.seed != null ? o.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
  this.rand = mulberry32(this.seed);
  this.opts = o;
  this.players = [];
  for (var i = 0; i < 4; i++) this.players.push({ score: 25000 });
  this.roundNum = 0; this.honba = 0; this.sticks = 0;
  this.over = false; this.ranking = null; this.result = null;
  this.rounds = 0; this.stats = { tsumo: 0, ron: 0, draw: 0, abort: 0, wins: [0, 0, 0, 0], dealIn: [0, 0, 0, 0], rounds: 0 };
  this.callSeq = 0; this.flash = null;
  this.startRound();
}
MJ.Game = Game;
var GP = Game.prototype;

GP.dealerOf = function (rn) { return (3 + rn) % 4; };
GP.seatWind = function (p) { return (p - this.dealer + 4) % 4; };
GP.next = function (p) { return (p + 1) % 4; };
GP.wallLeft = function () { return this.liveEnd - this.pos; };

GP.startRound = function () {
  this.dealer = this.dealerOf(this.roundNum);
  var wall = []; for (var i = 0; i < 136; i++) wall.push(i);
  for (i = 135; i > 0; i--) { var j = Math.floor(this.rand() * (i + 1)); var t = wall[i]; wall[i] = wall[j]; wall[j] = t; }
  this.wall = wall; this.pos = 0; this.liveEnd = 122; this.dw = wall.slice(122, 136);
  this.rinIdx = 0; this.kanCount = 0; this.doraCount = 1; this.pendingKanDora = 0;
  this.anyCall = false; this.totalDiscards = 0; this.firstDiscards = [];
  this.result = null; this.lastDiscard = null; this.drawn = null; this.afterCall = false; this.forbid = null; this.rin = false;
  this.kanBy = [];
  this.events = [];
  this.startScores = this.players.map(function (q) { return q.score; });
  for (var p = 0; p < 4; p++) {
    var P = this.players[p];
    P.hand = []; P.melds = []; P.river = []; P.disc = []; P.riichi = false; P.riichiPending = false; P.doubleRiichi = false;
    P.ippatsu = false; P.furitenTemp = false; P.furitenRiichi = false; P.discCount = 0; P.riichiAt = -1; P.safe = {};
  }
  var order = this.dealer;
  for (i = 0; i < 4; i++) { var q = (order + i) % 4; this.players[q].hand = this.wall.slice(this.pos, this.pos + 13); this.pos += 13; this.sortHand(q); }
  this.phase = 'none';
  this.turn = this.dealer;
  this.draw(this.dealer);
};
GP.sortHand = function (p) { this.players[p].hand.sort(function (a, b) { return a - b; }); };
GP.doraInds = function () { var o = []; for (var i = 0; i < this.doraCount; i++) o.push(this.dw[4 + i]); return o; };
GP.uraInds = function () { var o = []; for (var i = 0; i < this.doraCount; i++) o.push(this.dw[9 + i]); return o; };
GP.menzen = function (p) { var m = this.players[p].melds; for (var i = 0; i < m.length; i++) if (m[i].type !== 'ankan') return false; return true; };
GP.log = function (e) { this.events.push(e); if (this.events.length > 400) this.events.shift(); };

GP.draw = function (p) {
  if (this.wallLeft() <= 0) return this.exhaustive();
  var id = this.wall[this.pos++];
  this.players[p].hand.push(id);
  this.drawn = id; this.rin = false; this.afterCall = false; this.forbid = null; this.turn = p;
  this.beginDiscard(p);
};
GP.drawRinshan = function (p) {
  var id = this.dw[this.rinIdx++];
  this.players[p].hand.push(id);
  this.drawn = id; this.rin = true; this.afterCall = false; this.forbid = null; this.turn = p;
  this.beginDiscard(p);
};
GP.beginDiscard = function (p) {
  this.phase = 'discard';
  this.dopts = this.computeDiscardOpts(p);
};

/* ---- evaluation of a winning hand for player p */
GP.evalWin = function (p, winId, how) {
  var P = this.players[p], conc = [], i;
  for (i = 0; i < P.hand.length; i++) if (!(how.tsumo && P.hand[i] === winId)) conc.push(P.hand[i]);
  conc.sort(function (a, b) { return a - b; });
  var s = '';
  for (i = 0; i < conc.length; i++) s += tstr(conc[i]);
  if (how.tsumo) s += tstr(winId);
  var ron = how.tsumo ? '' : '+' + tstr(winId);
  var f = '';
  for (i = 0; i < P.melds.length; i++) {
    var m = P.melds[i], ids = m.ids.slice().sort(function (a, b) { return a - b; });
    if (m.type === 'ankan') ids = [ids[0], ids[1]];
    var ms = '', suit = 'mpsz'.charAt(suitOf(ids[0] >> 2));
    for (var j = 0; j < ids.length; j++) { var k = ids[j] >> 2; ms += REDS[ids[j]] ? '0' : String(k < 27 ? k % 9 + 1 : k - 26); }
    f += '+' + ms + suit;
  }
  var dk = '', di = this.doraInds(), ura = this.uraInds(), nd = 0, nu = 0;
  var dor = [], myK = [];
  for (i = 0; i < di.length; i++) dor.push(doraOf(di[i] >> 2));
  if (P.riichi) for (i = 0; i < ura.length; i++) dor.push(doraOf(ura[i] >> 2));
  for (i = 0; i < dor.length; i++) dk += kstr(dor[i]);
  var extra = '';
  if (P.riichi) extra += P.doubleRiichi ? 'w' : 'r';
  if (P.riichi && P.ippatsu) extra += 'i';
  if (how.haitei) extra += 'h';
  if (how.rinshan || how.chankan) extra += 'k';
  if (how.tenchi) extra += 't';
  extra += String(1) + String(this.seatWind(p) + 1);
  var str = s + ron + f + (dk ? '+d' + dk : '') + '+' + extra;
  var res = runLib(str);
  res.str = str;
  if (res.ten > 0) {
    // separate dora / ura / aka for display
    var norm = 0, urac = 0, aka = 0, all = conc.slice(); all.push(winId);
    for (i = 0; i < P.melds.length; i++) all = all.concat(P.melds[i].ids);
    var dm = {}, um = {};
    for (i = 0; i < di.length; i++) { var dd = doraOf(di[i] >> 2); dm[dd] = (dm[dd] || 0) + 1; }
    if (P.riichi) for (i = 0; i < ura.length; i++) { var uu = doraOf(ura[i] >> 2); um[uu] = (um[uu] || 0) + 1; }
    for (i = 0; i < all.length; i++) { var kk = all[i] >> 2; norm += dm[kk] || 0; urac += um[kk] || 0; if (REDS[all[i]]) aka++; }
    var out = [];
    for (i = 0; i < res.yaku.length; i++) {
      var y = res.yaku[i];
      if (y.jp === 'ドラ') { if (norm) out.push({ jp: 'ドラ', id: 'dora', han: norm }); if (urac) out.push({ jp: '裏ドラ', id: 'ura', han: urac }); }
      else out.push(y);
    }
    res.yaku = out; res.nDora = norm; res.nUra = urac; res.nAka = aka;
  }
  return res;
};

GP.hasYakuWin = function (res) { return res && res.isAgari && res.ten > 0; };

GP.tsumoHow = function (p) {
  var P = this.players[p];
  return {
    tsumo: true, rinshan: this.rin, haitei: !this.rin && this.wallLeft() === 0,
    tenchi: !this.anyCall && P.melds.length === 0 && P.discCount === 0 && (this.dealer === p ? this.totalDiscards === 0 : true)
  };
};

/* ---- options for the player to move (after drawing / calling) */
GP.computeDiscardOpts = function (p) {
  var P = this.players[p], o = { tsumo: false, riichi: [], ankan: [], kakan: [], kyuushu: false, discard: [] }, i, k;
  var c = countsOf(P.hand), nm = P.melds.length;
  if (!this.afterCall) {
    if (agariCheck(c)) {
      var res = this.evalWin(p, this.drawn, this.tsumoHow(p));
      if (this.hasYakuWin(res)) { o.tsumo = true; o.eval = res; }
    }
  }
  // discards
  var forb = this.forbid;
  for (i = 0; i < P.hand.length; i++) {
    var id = P.hand[i];
    if (P.riichi && id !== this.drawn) continue;
    if (forb && forb[id >> 2]) continue;
    o.discard.push(id);
  }
  if (!o.discard.length) for (i = 0; i < P.hand.length; i++) o.discard.push(P.hand[i]);
  if (!this.afterCall) {
    // riichi
    if (!P.riichi && this.menzen(p) && P.score >= 1000 && this.wallLeft() >= 4 && shanten(c, nm) <= 0) {
      var seen = {};
      for (i = 0; i < P.hand.length; i++) {
        var id2 = P.hand[i], kd = id2 >> 2;
        c[kd]--;
        var ok = shanten(c, nm) === 0 && waitKinds(c, nm).length > 0;
        c[kd]++;
        if (ok) o.riichi.push(id2);
      }
    }
    // kans
    if (this.wallLeft() >= 1 && this.kanCount < 4) {
      for (k = 0; k < 34; k++) {
        if (c[k] === 4) {
          if (P.riichi) {
            if (k !== (this.drawn >> 2)) continue;
            c[k] -= 4; var wafter = waitKinds(c, nm + 1); c[k] += 4;
            c[k]--; var wbefore = waitKinds(c, nm); c[k]++;
            if (wafter.join() !== wbefore.join() || !wafter.length) continue;
          }
          o.ankan.push(k);
        }
      }
      for (i = 0; i < nm; i++) {
        var m = P.melds[i];
        if (m.type !== 'pon') continue;
        var kk = m.ids[0] >> 2;
        for (var j = 0; j < P.hand.length; j++) {
          if ((P.hand[j] >> 2) === kk && (!P.riichi || P.hand[j] === this.drawn)) { o.kakan.push(P.hand[j]); break; }
        }
      }
    }
    // kyuushu kyuuhai
    if (!this.anyCall && P.discCount === 0 && nm === 0) {
      var n = 0; for (i = 0; i < 13; i++) if (c[TERMS[i]] > 0) n++;
      if (n >= 9) o.kyuushu = true;
    }
  }
  return o;
};

/* ---- the human / AI submits an action in the discard phase */
GP.actDiscardPhase = function (p, a) {
  if (this.phase !== 'discard' || p !== this.turn) return 'not your turn';
  var o = this.dopts, P = this.players[p], i;
  switch (a.t) {
    case 'tsumo':
      if (!o.tsumo) return 'cannot tsumo';
      return this.winTsumo(p);
    case 'discard': {
      if (o.discard.indexOf(a.id) < 0) return 'illegal discard';
      if (a.riichi) { if (o.riichi.indexOf(a.id) < 0) return 'illegal riichi'; }
      return this.doDiscard(p, a.id, !!a.riichi);
    }
    case 'ankan': {
      if (o.ankan.indexOf(a.kind) < 0) return 'illegal ankan';
      var ids = P.hand.filter(function (x) { return (x >> 2) === a.kind; });
      P.hand = P.hand.filter(function (x) { return (x >> 2) !== a.kind; });
      P.melds.push({ type: 'ankan', ids: ids, from: -1, called: -1 });
      this.afterKan(p, 'ankan');
      return null;
    }
    case 'kakan': {
      if (o.kakan.indexOf(a.id) < 0) return 'illegal kakan';
      var kk = a.id >> 2, mi = -1;
      for (i = 0; i < P.melds.length; i++) if (P.melds[i].type === 'pon' && (P.melds[i].ids[0] >> 2) === kk) mi = i;
      P.hand.splice(P.hand.indexOf(a.id), 1);
      P.melds[mi].type = 'kakan'; P.melds[mi].ids.push(a.id); P.melds[mi].added = a.id;
      this.kakanP = p; this.kakanTile = a.id;
      this.anyCall = true; this.clearIppatsu();
      // chankan reaction
      var react = {}, any = false;
      for (var q = 0; q < 4; q++) {
        if (q === p) continue;
        var ro = this.reactOptions(q, a.id, true);
        if (ro) { react[q] = ro; any = true; }
      }
      this.log({ k: 'kakan', p: p, id: a.id }); this.flashCall(p, 'kan');
      if (!any) { this.finishKakan(p); return null; }
      this.phase = 'react'; this.react = { opts: react, ans: {}, from: p, tile: a.id, chankan: true };
      return null;
    }
    case 'kyuushu':
      if (!o.kyuushu) return 'cannot';
      this.abort('kyuushu', p);
      return null;
  }
  return 'bad action';
};
GP.finishKakan = function (p) {
  this.kanCount++; this.kanBy.push(p); this.pendingKanDora++; this.liveEnd--;
  this.drawRinshan(p);
};
GP.afterKan = function (p, type) {
  this.anyCall = true; this.clearIppatsu();
  this.kanCount++; this.kanBy.push(p); this.liveEnd--;
  if (type === 'ankan') this.doraCount++;
  else this.pendingKanDora++;
  this.log({ k: type, p: p }); this.flashCall(p, 'kan');
  this.sortHand(p);
  this.drawRinshan(p);
};
GP.clearIppatsu = function () { for (var i = 0; i < 4; i++) this.players[i].ippatsu = false; };
GP.flashCall = function (p, t) { this.callSeq++; this.flash = { p: p, t: t, n: this.callSeq }; };

GP.doDiscard = function (p, id, riichi) {
  var P = this.players[p];
  var tsumogiri = (id === this.drawn);
  P.hand.splice(P.hand.indexOf(id), 1);
  this.sortHand(p);
  if (P.riichi) P.ippatsu = false;
  P.furitenTemp = false;
  P.river.push({ id: id, riichi: riichi, taken: false, tsumogiri: tsumogiri });
  P.disc.push(id >> 2);
  for (var sq = 0; sq < 4; sq++) if (sq !== p && this.players[sq].riichi) this.players[sq].safe[id >> 2] = true;
  P.discCount++; this.totalDiscards++;
  if (this.totalDiscards <= 4) this.firstDiscards.push(id >> 2);
  if (riichi) { P.riichiPending = true; P.doubleRiichi = (P.discCount === 1 && !this.anyCall); this.log({ k: 'riichi', p: p }); this.flashCall(p, 'riichi'); }
  while (this.pendingKanDora > 0) { this.doraCount++; this.pendingKanDora--; }
  this.lastDiscard = { p: p, id: id, idx: P.river.length - 1 };
  this.drawn = null; this.afterCall = false; this.forbid = null; this.rin = false;
  this.log({ k: 'discard', p: p, id: id });
  // reactions
  var react = {}, any = false;
  for (var q = 0; q < 4; q++) {
    if (q === p) continue;
    var ro = this.reactOptions(q, id, false);
    if (ro) { react[q] = ro; any = true; }
  }
  if (!any) { this.afterPass(p); return null; }
  this.phase = 'react'; this.react = { opts: react, ans: {}, from: p, tile: id, chankan: false };
  return null;
};

/* ---- furiten */
GP.isFuriten = function (p) {
  var P = this.players[p];
  if (P.furitenTemp || P.furitenRiichi) return true;
  var c = countsOf(P.hand);
  if (c.reduce(function (a, b) { return a + b; }, 0) % 3 !== 1) return false;
  var w = waitKinds(c, P.melds.length);
  for (var i = 0; i < w.length; i++) if (P.disc.indexOf(w[i]) >= 0) return true;
  return false;
};
GP.waitsOf = function (p) { var P = this.players[p]; var c = countsOf(P.hand); if (c.reduce(function (a, b) { return a + b; }, 0) % 3 !== 1) return []; return waitKinds(c, P.melds.length); };

/* ---- options of player q when tile id was discarded by someone (or kakan'ed) */
GP.reactOptions = function (q, id, chankan) {
  var P = this.players[q], k = id >> 2, from = chankan ? this.kakanP : this.lastDiscardP();
  var o = { ron: false, pon: null, kan: null, chi: [] }, any = false, i;
  var c = countsOf(P.hand);
  // ron
  c[k]++;
  if (agariCheck(c)) {
    var furi = this.isFuritenFor(q, k);
    if (!furi) {
      var res = this.evalWin(q, id, { tsumo: false, chankan: chankan, haitei: false, houtei: !chankan && this.wallLeft() === 0 });
      if (this.hasYakuWin(res)) { o.ron = true; o.eval = res; any = true; }
    } else if (this.hasYakuLoose(q, id, chankan)) { o.furiten = true; this.furitenNotice = { p: q, n: (this.furitenNotice ? this.furitenNotice.n : 0) + 1 }; }
  }
  c[k]--;
  if (chankan) return any ? o : null;
  if (!P.riichi && this.wallLeft() > 0) {
    var same = P.hand.filter(function (x) { return (x >> 2) === k; });
    if (same.length >= 2) { o.pon = same.slice(0, 2); any = true; if (same.length >= 3 && this.kanCount < 4) { o.kan = same.slice(0, 3); } }
    if (same.length >= 3 && this.kanCount < 4) { o.kan = same.slice(0, 3); any = true; }
    if (q === this.next(from) && k < 27) {
      var r = k % 9, self = this;
      function find(kk) { // prefer non red? keep any
        var f = P.hand.filter(function (x) { return (x >> 2) === kk; });
        return f.length ? f[f.length - 1] : -1;
      }
      var combos = [[-2, -1], [-1, 1], [1, 2]];
      for (i = 0; i < 3; i++) {
        var a = r + combos[i][0], b = r + combos[i][1];
        if (a < 0 || b < 0 || a > 8 || b > 8) continue;
        var ia = find(k + combos[i][0]), ib = find(k + combos[i][1]);
        if (ia >= 0 && ib >= 0) o.chi.push([ia, ib]);
      }
      // keep alternate red/non-red choice for same kinds
      if (o.chi.length) any = true;
    }
  }
  return any ? o : null;
};
GP.lastDiscardP = function () { return this.lastDiscard ? this.lastDiscard.p : -1; };
GP.isFuritenFor = function (q, k) { var P = this.players[q]; if (P.furitenTemp || P.furitenRiichi) return true; return P.disc.indexOf(k) >= 0 ? true : this.isFuriten(q); };
GP.hasYakuLoose = function (q, id, chankan) { // for UI: a hand that would win but is furiten
  var res = this.evalWin(q, id, { tsumo: false, chankan: chankan, haitei: false, houtei: !chankan && this.wallLeft() === 0 });
  return this.hasYakuWin(res);
};

GP.pendingPlayers = function () {
  if (this.phase === 'discard') return [this.turn];
  if (this.phase === 'react') {
    var out = [];
    for (var q in this.react.opts) if (this.react.ans[q] === undefined) out.push(+q);
    return out;
  }
  return [];
};
GP.optionsFor = function (p) {
  if (this.phase === 'discard' && p === this.turn) return this.dopts;
  if (this.phase === 'react' && this.react.opts[p] && this.react.ans[p] === undefined) return this.react.opts[p];
  return null;
};

/* ---- a reaction answer: {t:'pass'|'ron'|'pon'|'kan'|'chi', ids} */
GP.actReact = function (p, a) {
  if (this.phase !== 'react') return 'no reaction phase';
  var o = this.react.opts[p];
  if (!o || this.react.ans[p] !== undefined) return 'not pending';
  switch (a.t) {
    case 'pass': break;
    case 'ron': if (!o.ron) return 'cannot ron'; break;
    case 'pon': if (!o.pon) return 'cannot pon'; a = { t: 'pon', ids: o.pon }; break;
    case 'kan': if (!o.kan) return 'cannot kan'; a = { t: 'kan', ids: o.kan }; break;
    case 'chi': {
      var ok = false;
      for (var i = 0; i < o.chi.length; i++) {
        var cc = o.chi[i];
        if ((cc[0] === a.ids[0] && cc[1] === a.ids[1]) || (cc[0] === a.ids[1] && cc[1] === a.ids[0])) ok = true;
        // same kinds, different copy (red/non-red) is accepted
        else if (((cc[0] >> 2) === (a.ids[0] >> 2) && (cc[1] >> 2) === (a.ids[1] >> 2)) || ((cc[0] >> 2) === (a.ids[1] >> 2) && (cc[1] >> 2) === (a.ids[0] >> 2))) {
          var P = this.players[p];
          if (P.hand.indexOf(a.ids[0]) >= 0 && P.hand.indexOf(a.ids[1]) >= 0) ok = true;
        }
      }
      if (!ok) return 'cannot chi'; break;
    }
    default: return 'bad action';
  }
  this.react.ans[p] = a;
  if (this.pendingPlayers().length === 0) this.resolveReact();
  return null;
};

GP.resolveReact = function () {
  var R = this.react, from = R.from, tile = R.tile, q, ans = R.ans;
  var rons = [];
  for (var i = 1; i <= 3; i++) { q = (from + i) % 4; if (ans[q] && ans[q].t === 'ron') rons.push(q); }
  // furiten bookkeeping for those who passed a winning tile
  var k = tile >> 2;
  for (q in R.opts) {
    var o = R.opts[q];
    if ((o.ron || o.furiten) && !(ans[q] && ans[q].t === 'ron')) {
      var P = this.players[q];
      if (P.riichi) P.furitenRiichi = true; else P.furitenTemp = true;
    }
  }
  if (rons.length) {
    if (rons.length === 3) { this.abort('sanchahou', -1); return; }
    return this.winRon(rons, from, tile, R.chankan);
  }
  if (R.chankan) { this.react = null; this.finishKakan(from); return; }
  // pon / kan beat chi
  var caller = -1;
  for (i = 1; i <= 3; i++) { q = (from + i) % 4; if (ans[q] && (ans[q].t === 'pon' || ans[q].t === 'kan')) { caller = q; break; } }
  if (caller < 0) for (i = 1; i <= 3; i++) { q = (from + i) % 4; if (ans[q] && ans[q].t === 'chi') { caller = q; break; } }
  if (caller < 0) { this.react = null; this.afterPass(from); return; }
  this.doCall(caller, ans[caller], from, tile);
};

GP.doCall = function (q, a, from, tile) {
  var P = this.players[q], D = this.players[from], k = tile >> 2, i;
  // the discarded tile leaves the river
  D.river[this.lastDiscard.idx].taken = true;
  // riichi stick of the discarder is established even when the tile is called
  this.establishRiichi(from, true);
  this.anyCall = true; this.clearIppatsu();
  var use = a.ids.slice();
  for (i = 0; i < use.length; i++) P.hand.splice(P.hand.indexOf(use[i]), 1);
  var type = a.t === 'chi' ? 'chi' : (a.t === 'pon' ? 'pon' : 'daiminkan');
  var ids = use.concat([tile]);
  P.melds.push({ type: type, ids: ids, from: from, called: tile });
  this.sortHand(q);
  this.react = null; this.turn = q; this.drawn = null; this.afterCall = true;
  this.log({ k: type, p: q, from: from, id: tile }); this.flashCall(q, a.t === 'kan' ? 'kan' : a.t);
  if (type === 'daiminkan') {
    this.kanCount++; this.kanBy.push(q); this.pendingKanDora++; this.liveEnd--;
    this.drawRinshan(q); return;
  }
  // kuikae
  var forb = {}; forb[k] = true;
  if (type === 'chi') {
    var ks = ids.map(function (x) { return x >> 2; }).sort(function (a, b) { return a - b; });
    if (k === ks[0] && ks[2] % 9 !== 0 && ks[2] < 27 && (ks[2] % 9) <= 8) { if (ks[2] + 1 <= (((ks[2] / 9) | 0) * 9 + 8)) forb[ks[2] + 1] = true; }
    if (k === ks[2] && (ks[0] % 9) >= 1) forb[ks[0] - 1] = true;
  }
  this.forbid = forb;
  this.phase = 'discard';
  this.dopts = this.computeDiscardOpts(q);
};

GP.establishRiichi = function (p, calledTile) {
  var P = this.players[p];
  if (P.riichiPending) {
    P.riichiPending = false; P.riichi = true; P.ippatsu = true; P.score -= 1000; this.sticks++; P.riichiAt = P.discCount;
    this.log({ k: 'riichiOK', p: p });
    return true;
  }
  return false;
};

/* after a discard nobody called / ronned */
GP.afterPass = function (p) {
  this.react = null;
  this.establishRiichi(p);
  // abortive draws
  var np = 0; for (var i = 0; i < 4; i++) if (this.players[i].riichi) np++;
  if (np === 4) { this.abort('suucha', -1); return; }
  if (!this.anyCall && this.totalDiscards === 4 && this.firstDiscards.length === 4) {
    var f = this.firstDiscards[0];
    if (f >= 27 && f <= 30 && this.firstDiscards.every(function (x) { return x === f; })) { this.abort('suufon', -1); return; }
  }
  if (this.kanCount === 4) {
    var d = this.kanBy.some(function (x) { return x !== this.kanBy[0]; }, this);
    if (d) { this.abort('suukan', -1); return; }
  }
  if (this.wallLeft() <= 0) { this.exhaustive(); return; }
  this.turn = this.next(p);
  this.draw(this.turn);
};

/* ---------------------------------------------------------------- results and payments */
GP.payOf = function (res, winner, tsumo) { // base payments of one win, without honba
  var dealer = winner === this.dealer;
  return { dealer: dealer, tsumo: tsumo, ko: res.ko, oya: res.oya, ten: res.ten };
};
GP.winTsumo = function (p) {
  var res = this.dopts.eval;
  var w = { p: p, from: -1, tile: this.drawn, eval: res, tsumo: true };
  var delta = [0, 0, 0, 0], honba = this.honba;
  if (p === this.dealer) { for (var q = 0; q < 4; q++) if (q !== p) { var x = res.oya[0] + 100 * honba; delta[q] -= x; delta[p] += x; } }
  else for (q = 0; q < 4; q++) if (q !== p) { var y = (q === this.dealer ? res.ko[0] : res.ko[1]) + 100 * honba; delta[q] -= y; delta[p] += y; }
  w.gain = delta[p];
  var stickGain = this.sticks * 1000; delta[p] += stickGain; w.sticks = stickGain;
  this.sticks = 0;
  this.endRound({ type: 'tsumo', wins: [w], delta: delta, renchan: p === this.dealer });
  this.stats.tsumo++; this.stats.wins[p]++;
};
GP.winRon = function (rons, from, tile, chankan) {
  var delta = [0, 0, 0, 0], wins = [], honba = this.honba, first = true;
  for (var i = 0; i < rons.length; i++) {
    var q = rons[i], o = this.react.opts[q];
    var res = o.eval, amt = res.ten;
    var w = { p: q, from: from, tile: tile, eval: res, tsumo: false, chankan: chankan };
    var extra = first ? 300 * honba : 0;
    delta[from] -= amt + extra; delta[q] += amt + extra;
    if (first) { var sg = this.sticks * 1000; delta[q] += sg; w.sticks = sg; this.sticks = 0; first = false; }
    w.gain = amt + extra;
    wins.push(w);
    this.stats.wins[q]++;
  }
  this.stats.ron++; this.stats.dealIn[from]++;
  this.react = null;
  if (chankan) { /* the kakan is not completed */ }
  // riichi stick of the discarder is not paid when ronned on the riichi tile
  var P = this.players[from]; if (P.riichiPending) { P.riichiPending = false; }
  var dealerWon = rons.indexOf(this.dealer) >= 0;
  this.endRound({ type: 'ron', wins: wins, delta: delta, renchan: dealerWon, from: from });
};

GP.isTenpai = function (p) {
  var P = this.players[p], c = countsOf(P.hand);
  var w = waitKinds(c, P.melds.length);
  for (var i = 0; i < w.length; i++) { var n = c[w[i]]; if (n < 4) return true; }
  return false;
};
GP.exhaustive = function () {
  this.phase = 'none';
  // establish a pending riichi (discard was last tile and nobody called)
  for (var i = 0; i < 4; i++) this.establishRiichi(i);
  var delta = [0, 0, 0, 0], tenpai = [false, false, false, false], nT = 0, q;
  // nagashi mangan
  var nagashi = [];
  for (q = 0; q < 4; q++) {
    var P = this.players[q];
    if (P.river.length && P.river.every(function (r) { return !r.taken && isTerm(r.id >> 2); })) nagashi.push(q);
  }
  for (q = 0; q < 4; q++) { tenpai[q] = this.isTenpai(q); if (tenpai[q]) nT++; }
  var type = 'exhaustive';
  if (nagashi.length) {
    type = 'nagashi';
    nagashi.forEach(function (p) {
      var dealer = p === this.dealer;
      for (var x = 0; x < 4; x++) if (x !== p) { var v = dealer ? 4000 : (x === this.dealer ? 4000 : 2000); delta[x] -= v; delta[p] += v; }
    }, this);
  } else if (nT > 0 && nT < 4) {
    for (q = 0; q < 4; q++) delta[q] += tenpai[q] ? 3000 / nT : -3000 / (4 - nT);
  }
  this.stats.draw++;
  this.endRound({ type: 'draw', reason: type, delta: delta, tenpai: tenpai, nagashi: nagashi, renchan: tenpai[this.dealer], drawHonba: true });
};
GP.abort = function (reason, p) {
  this.phase = 'none';
  for (var i = 0; i < 4; i++) this.players[i].riichiPending = false;
  this.stats.abort++;
  this.endRound({ type: 'abort', reason: reason, who: p, delta: [0, 0, 0, 0], renchan: true, drawHonba: true });
};

GP.endRound = function (r) {
  this.phase = 'roundEnd'; this.react = null;
  var i;
  for (i = 0; i < 4; i++) this.players[i].score += r.delta[i];
  r.before = this.roundNum; r.dealer = this.dealer; r.honba = this.honba; r.start = this.startScores.slice(); r.sticksBefore = this.sticks;
  r.scores = this.players.map(function (p) { return p.score; });
  r.doraInds = this.doraInds(); r.uraInds = this.uraInds();
  r.hands = this.players.map(function (p) { return p.hand.slice(); });
  r.melds = this.players.map(function (p) { return p.melds.map(function (m) { return { type: m.type, ids: m.ids.slice() }; }); });
  r.riichi = this.players.map(function (p) { return p.riichi; });
  // next round bookkeeping
  var nextRound = this.roundNum, nextHonba = this.honba;
  if (r.type === 'tsumo' || r.type === 'ron') {
    if (r.renchan) nextHonba++; else { nextHonba = 0; nextRound++; }
  } else {
    nextHonba++;
    if (!r.renchan) nextRound++;
  }
  var over = false, reason = '';
  for (i = 0; i < 4; i++) if (this.players[i].score < 0) { over = true; reason = 'bust'; }
  if (nextRound >= 4) { over = true; reason = reason || 'east-end'; }
  if (!over && r.renchan && this.roundNum === 3 && (r.type === 'tsumo' || r.type === 'ron' || r.tenpai)) {
    // dealer of the last round keeps going unless he is already the leader (agari-yame, needs 30000+)
    var d = this.dealer, top = true;
    for (i = 0; i < 4; i++) if (i !== d && this.players[i].score >= this.players[d].score) top = false;
    if (top && this.players[d].score >= 30000) { over = true; reason = 'agari-yame'; }
  }
  this.nextRoundNum = nextRound; this.nextHonba = nextHonba;
  r.over = over; r.overReason = reason;
  this.result = r;
  this.stats.rounds++;
  if (over) {
    this.over = true;
    this.finalize();
    r.final = this.ranking;
  }
};
GP.finalize = function () {
  var order = [3, 0, 1, 2], pl = this.players, self = this;
  var idx = [0, 1, 2, 3].sort(function (a, b) { return pl[b].score - pl[a].score || order.indexOf(a) - order.indexOf(b); });
  if (this.sticks) { pl[idx[0]].score += this.sticks * 1000; this.leftSticks = this.sticks; this.sticks = 0; }
  idx.sort(function (a, b) { return pl[b].score - pl[a].score || order.indexOf(a) - order.indexOf(b); });
  var rank = [0, 0, 0, 0]; idx.forEach(function (p, i) { rank[p] = i + 1; });
  this.ranking = { order: idx, rank: rank, scores: pl.map(function (p) { return p.score; }) };
};
GP.nextRound = function () {
  if (this.phase !== 'roundEnd' || this.over) return false;
  this.roundNum = this.nextRoundNum; this.honba = this.nextHonba;
  this.startRound();
  return true;
};

/* ---- legal action front door */
GP.act = function (p, a) {
  var e = (this.phase === 'discard') ? this.actDiscardPhase(p, a) : (this.phase === 'react' ? this.actReact(p, a) : 'no decision pending');
  return e;
};
GP.totalPoints = function () { var s = this.sticks * 1000; for (var i = 0; i < 4; i++) s += this.players[i].score; return s; };

/* ---------------------------------------------------------------- AI */
function knownCounts(G, p) {
  var c = new Array(34), i, j; for (i = 0; i < 34; i++) c[i] = 0;
  var P = G.players[p];
  for (i = 0; i < P.hand.length; i++) c[P.hand[i] >> 2]++;
  for (var q = 0; q < 4; q++) {
    var Q = G.players[q];
    for (j = 0; j < Q.river.length; j++) if (!Q.river[j].taken) c[Q.river[j].id >> 2]++;
    for (j = 0; j < Q.melds.length; j++) for (i = 0; i < Q.melds[j].ids.length; i++) c[Q.melds[j].ids[i] >> 2]++;
  }
  var di = G.doraInds(); for (i = 0; i < di.length; i++) c[di[i] >> 2]++;
  return c;
}
function doraKinds(G) { return G.doraInds().map(function (x) { return doraOf(x >> 2); }); }
function isYakuhai(G, p, k) { return k >= 31 || k === 27 || k === G.seatWind(p) + 27; }

function ukeire(c, m, s, known) { // sum of unseen tiles that reduce shanten
  var u = 0;
  for (var k = 0; k < 34; k++) {
    if (c[k] >= 4) continue;
    var left = 4 - known[k]; if (left <= 0) continue;
    c[k]++;
    var s2 = shanten(c, m);
    c[k]--;
    if (s2 < s) u += left;
  }
  return u;
}

function dangerOf(G, me, k, threats, known) {
  // returns max danger over riichi opponents (0 = totally safe)
  var worst = 0;
  for (var t = 0; t < threats.length; t++) {
    var q = threats[t], Q = G.players[q], d;
    // genbutsu
    if (Q.disc.indexOf(k) >= 0) continue;
    if (Q.safe && Q.safe[k]) continue;
    var left = 4 - known[k];
    if (k >= 27) {
      d = left >= 3 ? 7 : (left === 2 ? 5 : (left === 1 ? 2 : 0.5));
      if (k >= 31 || k === 27 + G.seatWind(q) || k === 27) d += 1;
    } else {
      var r = k % 9, base = [3.5, 5, 6.5, 7.5, 9, 7.5, 6.5, 5, 3.5][r], sb = (k / 9 | 0) * 9;
      var has = function (rr) { return Q.disc.indexOf(sb + rr) >= 0; };
      d = base;
      if (r === 0) { if (has(3)) d *= 0.35; }
      else if (r === 8) { if (has(5)) d *= 0.35; }
      else if (r === 1) { if (has(4)) d *= 0.4; }
      else if (r === 7) { if (has(4)) d *= 0.4; }
      else if (r === 2) { if (has(5)) d *= 0.4; }
      else if (r === 6) { if (has(3)) d *= 0.4; }
      else if (r === 3) { var a = has(0), b = has(6); if (a && b) d *= 0.3; else if (a || b) d *= 0.65; }
      else if (r === 5) { var a2 = has(2), b2 = has(8); if (a2 && b2) d *= 0.3; else if (a2 || b2) d *= 0.65; }
      else if (r === 4) { var a3 = has(1), b3 = has(7); if (a3 && b3) d *= 0.3; else if (a3 || b3) d *= 0.65; }
      if (left <= 1) d *= 0.7;
    }
    if (q === G.dealer) d *= 1.25;
    var dk = doraKinds(G); if (dk.indexOf(k) >= 0) d *= 1.3;
    if (d > worst) worst = d;
  }
  return worst;
}

function keepValue(G, p, k, c, plan) {
  // how much we want to keep a tile (higher = keep). Used only for tie-breaks / mild preference.
  var v = 0, dk = doraKinds(G);
  for (var i = 0; i < dk.length; i++) if (dk[i] === k) v += 3;
  if (k >= 27) {
    if (isYakuhai(G, p, k)) { v += c[k] >= 2 ? 6 : 1.5; if (k === 27 && G.seatWind(p) === 0 || k === G.seatWind(p) + 27) v += 0.5; }
    else v -= 1;
  } else {
    var r = k % 9;
    if (r === 0 || r === 8) v += 0.3; else if (r === 1 || r === 7) v += 0.8; else v += 1.2;
    if (plan === 'tanyao' && (r === 0 || r === 8)) v -= 4;
  }
  return v;
}

function planOf(G, p) { // yaku plan of an open hand
  var P = G.players[p];
  if (G.menzen(p)) return 'menzen';
  var i, j, suits = {}, ns = 0, allSimple = true, allTrip = true;
  for (i = 0; i < P.melds.length; i++) {
    var m = P.melds[i], k = m.ids[0] >> 2;
    if (m.type === 'pon' || m.type === 'kakan' || m.type === 'daiminkan' || m.type === 'ankan') { if (isYakuhai(G, p, k)) return 'yakuhai'; }
    for (j = 0; j < m.ids.length; j++) { var kk = m.ids[j] >> 2; if (isTerm(kk)) allSimple = false; if (kk < 27) { suits[suitOf(kk)] = 1; } }
    if (m.type === 'chi') allTrip = false;
  }
  for (var s in suits) ns++;
  // closed triplets of yakuhai in hand
  var c = countsOf(P.hand);
  for (var k2 = 27; k2 < 34; k2++) if (c[k2] >= 3 && isYakuhai(G, p, k2)) return 'yakuhai';
  if (allSimple) return 'tanyao';
  if (ns <= 1) return 'honitsu';
  if (allTrip) return 'toitoi';
  return 'none';
}

var AIx = {};
/* level: 'tsumogiri' (baseline), 'basic' (efficiency only), 'full' (efficiency + calls + riichi decision + defence) */
function makeAI(level, o) {
  o = o || {};
  var ai = { level: level, kanProb: o.kanProb || 0, callProb: o.callProb || 0, rnd: o.rnd || Math.random, noCalls: !!o.noCalls, noDefense: !!o.noDefense, noRiichiJudge: !!o.noRiichiJudge };

  ai.threats = function (G, p) {
    var t = [];
    for (var q = 0; q < 4; q++) if (q !== p && (G.players[q].riichi || G.players[q].riichiPending)) t.push(q);
    return t;
  };
  /* choose the discard (and riichi) for the player in the discard phase */
  ai.chooseDiscardAction = function (G, p) {
    var o = G.dopts, P = G.players[p], i;
    if (o.tsumo) return { t: 'tsumo' };
    if (level === 'tsumogiri') {
      if (G.afterCall) return { t: 'discard', id: o.discard[0] };
      return { t: 'discard', id: G.drawn != null && o.discard.indexOf(G.drawn) >= 0 ? G.drawn : o.discard[0] };
    }
    var c = countsOf(P.hand), nm = P.melds.length, known = knownCounts(G, p);
    var cur = shanten(c, nm);
    // kyuushu
    if (o.kyuushu && level === 'full') { var n = 0; for (i = 0; i < 13; i++) if (c[TERMS[i]] > 0) n++; if (n >= 10) return { t: 'kyuushu' }; }
    // kans
    if (level === 'full' || this.kanProb) {
      var threats0 = this.threats(G, p);
      for (i = 0; i < o.ankan.length; i++) {
        var kk = o.ankan[i], fire = false;
        if (this.kanProb && this.rnd() < this.kanProb) fire = true;
        else if (level === 'full' && !threats0.length) {
          c[kk] -= 4; var s2 = shanten(c, nm + 1); c[kk] += 4;
          c[kk]--; var s1 = shanten(c, nm); c[kk]++;
          if (s2 <= s1 && (s1 <= 1 || isYakuhai(G, p, kk))) fire = true;
        }
        if (fire) return { t: 'ankan', kind: kk };
      }
      for (i = 0; i < o.kakan.length; i++) {
        var id = o.kakan[i];
        if (this.kanProb && this.rnd() < this.kanProb) return { t: 'kakan', id: id };
        if (level === 'full' && !this.threats(G, p).length) {
          var k3 = id >> 2; c[k3]--; var sa = shanten(c, nm); c[k3]++;
          if (sa <= cur) return { t: 'kakan', id: id };
        }
      }
    }
    // candidate discards
    var threats = (level === 'full' && !this.noDefense) ? this.threats(G, p) : [];
    var plan = level === 'full' ? planOf(G, p) : 'menzen';
    var cand = {}, best = null, bestScore = -1e18, list = [];
    var seenK = {};
    for (i = 0; i < o.discard.length; i++) {
      var id2 = o.discard[i], k = id2 >> 2;
      var pr = (isRed(id2) ? 0 : 2) + (id2 === G.drawn ? 1 : 0);
      if (seenK[k] !== undefined) { var prev = list[seenK[k]]; if (pr > prev.pr) { prev.id = id2; prev.pr = pr; } continue; }
      seenK[k] = list.length; list.push({ id: id2, k: k, pr: pr });
    }
    var minSh = 99;
    for (i = 0; i < list.length; i++) {
      var it = list[i]; c[it.k]--;
      it.sh = shanten(c, nm);
      if (it.sh < minSh) minSh = it.sh;
      c[it.k]++;
    }
    var foldMode = false, danger = {};
    if (threats.length) {
      for (i = 0; i < list.length; i++) danger[list[i].k] = dangerOf(G, p, list[i].k, threats, known);
      // decide: push or fold
      var dm = doraKinds(G), valueGuess = 0;
      for (i = 0; i < P.hand.length; i++) { if (isRed(P.hand[i])) valueGuess++; if (dm.indexOf(P.hand[i] >> 2) >= 0) valueGuess++; }
      for (i = 0; i < nm; i++) for (var jj = 0; jj < P.melds[i].ids.length; jj++) { if (isRed(P.melds[i].ids[jj])) valueGuess++; if (dm.indexOf(P.melds[i].ids[jj] >> 2) >= 0) valueGuess++; }
      if (P.riichi) valueGuess += 2;
      var tenpaiNow = minSh <= 0;
      var turn = P.discCount;
      var push = false;
      if (tenpaiNow) push = true;
      else if (minSh === 1 && (valueGuess >= 3 || (G.dealer === p && valueGuess >= 2) || turn <= 6)) push = true;
      else if (minSh === 2 && valueGuess >= 5) push = true;
      if (!push) foldMode = true;
      ai.lastMode = foldMode ? 'fold' : 'push';
    }
    for (i = 0; i < list.length; i++) {
      it = list[i];
      c[it.k]--;
      var s = it.sh, sc;
      if (foldMode) {
        // safest tile first; efficiency as tie-break
        var u0 = it.sh <= minSh ? 1 : 0;
        sc = -danger[it.k] * 1000 + (-it.sh) * 20 + u0 * 5 + keepValue(G, p, it.k, c, plan) * -1;
        it.score = sc; c[it.k]++; continue;
      }
      var u = 0;
      if (s <= minSh + (minSh >= 2 ? 0 : 0)) u = ukeire(c, nm, s, known);
      var sc2 = -s * 100000 + u * 100;
      // tenpai with open hand: only count waits that give a yaku
      if (s === 0 && nm > 0 && !G.menzen(p)) {
        var ws = waitKinds(c, nm), good = 0;
        for (var w = 0; w < ws.length; w++) {
          var left = 4 - known[ws[w]] + 0; if (left <= 0) continue;
          // evaluate hypothetical ron
          var tid = this.fakeTile(G, p, ws[w]);
          if (tid >= 0 && this.hasYakuIfWin(G, p, it.id, ws[w])) good += left;
        }
        sc2 = -s * 100000 + good * 100 - (good === 0 ? 30000 : 0);
      }
      sc2 -= keepValue(G, p, it.k, c, plan) * 25;
      // do not break a pair of yakuhai or a dora needlessly: handled by keepValue
      if (threats.length) sc2 -= danger[it.k] * (minSh === 0 ? 20 : 60);
      if (nm > 0 && plan === 'none' && s > 0) sc2 -= 0;
      it.score = sc2; c[it.k]++;
    }
    for (i = 0; i < list.length; i++) if (list[i].score > bestScore) { bestScore = list[i].score; best = list[i]; }
    var act = { t: 'discard', id: best.id };
    // riichi?
    if (o.riichi.length && level === 'full') {
      var rid = -1;
      // riichi discard must be a legal riichi tile: take the best scoring legal one
      var bestR = -1e18;
      for (i = 0; i < list.length; i++) {
        var cand2 = list[i], legal = null;
        for (var rr = 0; rr < o.riichi.length; rr++) if ((o.riichi[rr] >> 2) === cand2.k) legal = o.riichi[rr];
        if (legal === null) continue;
        if (cand2.score > bestR) { bestR = cand2.score; rid = legal; }
      }
      if (rid >= 0 && (this.noRiichiJudge || this.wantRiichi(G, p, rid, known, threats))) act = { t: 'discard', id: rid, riichi: true };
    } else if (o.riichi.length && level === 'basic') {
      var rid2 = -1;
      for (i = 0; i < list.length; i++) { for (var r3 = 0; r3 < o.riichi.length; r3++) if ((o.riichi[r3] >> 2) === list[i].k && list[i] === best) rid2 = o.riichi[r3]; }
      if (rid2 >= 0) act = { t: 'discard', id: rid2, riichi: true };
    }
    return act;
  };
  ai.fakeTile = function (G, p, k) { return k * 4; };
  ai.hasYakuIfWin = function (G, p, discId, wk) {
    // temporarily evaluate p's hand as if winning on kind wk (ron) after discarding discId
    var P = G.players[p], save = P.hand.slice();
    P.hand = P.hand.filter(function (x) { return x !== discId; });
    var ok = false;
    try {
      // pick a concrete id for the winning tile that is not in the hand
      var cnt = countsOf(P.hand), wid = wk * 4 + cnt[wk];
      var res = G.evalWin(p, wid, { tsumo: false, haitei: false, houtei: false });
      ok = G.hasYakuWin(res);
    } catch (e) { ok = false; }
    P.hand = save;
    return ok;
  };
  ai.wantRiichi = function (G, p, rid, known, threats) {
    var P = G.players[p], nm = P.melds.length, c = countsOf(P.hand);
    c[rid >> 2]--;
    var ws = waitKinds(c, nm), left = 0, i;
    for (i = 0; i < ws.length; i++) left += Math.max(0, 4 - known[ws[i]] - (c[ws[i]]));
    // value if we stay silent
    var dealer = G.dealer === p;
    var hanDama = 0, hasYaku = false;
    if (ws.length) {
      var P2 = P, save = P.hand.slice();
      P.hand = P.hand.filter(function (x) { return x !== rid; });
      var cnt = countsOf(P.hand);
      var res = G.evalWin(p, ws[0] * 4 + cnt[ws[0]], { tsumo: false, haitei: false, houtei: false });
      P.hand = save;
      if (G.hasYakuWin(res)) { hasYaku = true; hanDama = res.han || (res.yakuman ? 13 : 0); }
    }
    if (left <= 0) return false;
    if (hasYaku && hanDama >= 5) return false;            // already a mangan: keep it hidden
    if (G.wallLeft() < 6 && left < 3) return false;
    if (threats.length) { if (left >= 4 || !hasYaku) return left >= 3; return left >= 6; }
    if (!hasYaku) return true;
    if (hanDama >= 3 && left >= 6 && !dealer) return false;
    if (left <= 1 && G.wallLeft() < 30) return false;
    return true;
  };

  /* reaction to a discard (or kakan) */
  ai.chooseReaction = function (G, p) {
    var o = G.react.opts[p];
    if (o.ron) return { t: 'ron' };
    if ((level !== 'full' || this.noCalls) && !this.callProb) return { t: 'pass' };
    if (this.callProb) {
      var r = this.rnd();
      if (r < this.callProb) {
        var opts = [];
        if (o.kan) opts.push({ t: 'kan' });
        if (o.pon) opts.push({ t: 'pon' });
        for (var i = 0; i < o.chi.length; i++) opts.push({ t: 'chi', ids: o.chi[i] });
        if (opts.length) return opts[Math.floor(this.rnd() * opts.length)];
      }
      if (level !== 'full') return { t: 'pass' };
    }
    if (G.react.chankan) return { t: 'pass' };
    var P = G.players[p], nm = P.melds.length, tile = G.react.tile, k = tile >> 2;
    var threats = this.threats(G, p);
    var c = countsOf(P.hand), sh0 = shanten(c, nm), known = knownCounts(G, p);
    var choices = [];
    if (o.pon) choices.push({ t: 'pon', ids: o.pon });
    for (var j = 0; j < o.chi.length; j++) choices.push({ t: 'chi', ids: o.chi[j] });
    var bestC = null, bestS = 99;
    for (j = 0; j < choices.length; j++) {
      var ch = choices[j];
      // shanten after the call (best discard)
      var c2 = c.slice(); c2[ch.ids[0] >> 2]--; c2[ch.ids[1] >> 2]--;
      var sAfter = 99, forb = {}; forb[k] = true;
      if (ch.t === 'chi') {
        var kk = [ch.ids[0] >> 2, ch.ids[1] >> 2, k].sort(function (a, b) { return a - b; });
        if (k === kk[0] && kk[2] % 9 !== 8) forb[kk[2] + 1] = true;
        if (k === kk[2] && kk[0] % 9 !== 0) forb[kk[0] - 1] = true;
      }
      for (var t = 0; t < 34; t++) { if (c2[t] > 0 && !forb[t]) { c2[t]--; var s = shanten(c2, nm + 1); c2[t]++; if (s < sAfter) sAfter = s; } }
      ch.sAfter = sAfter;
    }
    // evaluate each choice w.r.t. yaku plan
    var yakuhaiPon = false;
    for (j = 0; j < choices.length; j++) {
      ch = choices[j];
      var ok = false;
      var tmpMelds = P.melds.slice();
      var hasYaku = this.planAfterCall(G, p, ch, tile);
      if (threats.length && ch.sAfter > 0) continue;
      if (ch.t === 'pon' && isYakuhai(G, p, k)) ok = ch.sAfter <= sh0;
      else ok = hasYaku && ch.sAfter < sh0;
      if (ok && ch.t === 'chi' && G.menzen(p) && sh0 <= 1 && false) ok = false;
      if (ok && ch.sAfter < bestS) { bestS = ch.sAfter; bestC = ch; }
    }
    // daiminkan: only if it is a yakuhai triplet and nobody is in riichi
    if (!bestC && o.kan && !threats.length && isYakuhai(G, p, k) && sh0 <= 1 && this.kanProb === 0 && false) return { t: 'kan' };
    if (bestC) return bestC;
    return { t: 'pass' };
  };
  ai.planAfterCall = function (G, p, ch, tile) {
    var P = G.players[p];
    // build hypothetical melds list: existing + the new one
    var ms = P.melds.map(function (m) { return m; });
    var ids = ch.ids.concat([tile]);
    var newM = { type: ch.t === 'chi' ? 'chi' : 'pon', ids: ids };
    ms.push(newM);
    var k = tile >> 2, i, j;
    var allSimple = true, suits = {}, ns = 0, allTrip = true;
    for (i = 0; i < ms.length; i++) {
      var m = ms[i], mk = m.ids[0] >> 2;
      if (m.type !== 'chi' && isYakuhai(G, p, mk)) return true;
      for (j = 0; j < m.ids.length; j++) { var kk = m.ids[j] >> 2; if (isTerm(kk)) allSimple = false; if (kk < 27) suits[suitOf(kk)] = 1; }
      if (m.type === 'chi') allTrip = false;
    }
    var c = countsOf(P.hand); for (j = 0; j < ch.ids.length; j++) c[ch.ids[j] >> 2]--;
    for (var h = 27; h < 34; h++) if (c[h] >= 3 && isYakuhai(G, p, h)) return true;
    if (allSimple) {
      // the rest of the hand must be mostly simple
      var term = 0, tot = 0; for (h = 0; h < 34; h++) { tot += c[h]; if (isTerm(h)) term += c[h]; }
      return term <= 2;
    }
    for (var s in suits) ns++;
    if (ns <= 1) {
      // honitsu: tiles of other suits should be few
      var main = -1; for (s in suits) main = +s;
      var off = 0; for (h = 0; h < 27; h++) if (c[h] > 0 && suitOf(h) !== main) off += c[h];
      if (ns === 0) return false;
      return off <= 3;
    }
    if (allTrip) {
      var pairs = 0; for (h = 0; h < 34; h++) if (c[h] >= 2) pairs++;
      return pairs >= 2 && ms.length >= 2;
    }
    return false;
  };

  /* a full decision for player p in the current state (used by AI players and by the hint / auto features) */
  ai.decide = function (G, p) {
    if (G.phase === 'discard') return this.chooseDiscardAction(G, p);
    if (G.phase === 'react') return this.chooseReaction(G, p);
    return null;
  };
  return ai;
}
MJ.makeAI = makeAI;
MJ.knownCounts = knownCounts;

/* play: run the game until a human decision is needed (or the round ends).  agents: array of 4 {ai} / null (human) */
MJ.step = function (G, agents) {
  var pend = G.pendingPlayers();
  for (var i = 0; i < pend.length; i++) {
    var p = pend[i], ag = agents[p];
    if (!ag) return false;
    var a = ag.decide(G, p);
    var e = G.act(p, a);
    if (e) throw new Error('illegal action by ' + p + ' ' + JSON.stringify(a) + ': ' + e + ' phase=' + G.phase);
    return true;
  }
  return false;
};
MJ.runRound = function (G, agents, maxSteps) {
  var n = 0;
  while (G.phase !== 'roundEnd' && n < (maxSteps || 5000)) { if (!MJ.step(G, agents)) break; n++; }
  return G.phase === 'roundEnd';
};
MJ.playGame = function (G, agents) {
  var guard = 0;
  while (!G.over && guard++ < 60) {
    if (!MJ.runRound(G, agents)) throw new Error('stalled in phase ' + G.phase);
    if (!G.over) G.nextRound();
  }
  return G;
};

/* ---- conservation check (tests): every tile id exactly once somewhere */
MJ.conserve = function (G) {
  var seen = {}, n = 0, bad = null;
  function add(id, w) { if (seen[id] !== undefined) bad = 'dup ' + id + ' ' + w + ' & ' + seen[id]; seen[id] = w; n++; }
  G.players.forEach(function (P, p) {
    P.hand.forEach(function (x) { add(x, 'hand' + p); });
    P.melds.forEach(function (m) { m.ids.forEach(function (x) { add(x, 'meld' + p); }); });
    P.river.forEach(function (r) { if (!r.taken) add(r.id, 'river' + p); });
  });
  var i; for (i = G.pos; i < 122; i++) add(G.wall[i], 'wall');
  for (i = G.rinIdx; i < 14; i++) add(G.dw[i], 'dw');
  if (!bad && n !== 136) bad = 'count ' + n;
  return bad;
};

/* ---- headless simulation of N complete games.  cfg: {seed0, agents:[{level,kanProb,callProb}x4], check} */
MJ.simulate = function (N, cfg) {
  var st = { games: 0, rounds: 0, tsumo: 0, ron: 0, draw: 0, abort: {}, rankSum: [0, 0, 0, 0], riichi: 0, calls: 0, kans: 0, yakuman: 0, errors: [], sumBad: 0, hands: 0, maxHan: 0, dblron: 0, nagashi: 0, yaku: {}, firstPlace: [0, 0, 0, 0] };
  for (var g = 0; g < N; g++) {
    var G = new Game({ seed: cfg.seed0 + g });
    var agents = cfg.agents.map(function (a) { return a ? makeAI(a.level, a) : null; });
    try {
      var guard = 0;
      while (!G.over && guard++ < 80) {
        var steps = 0;
        while (G.phase !== 'roundEnd') {
          var pend = G.pendingPlayers(); if (!pend.length) throw new Error('no pending in ' + G.phase);
          var p = pend[0], a = agents[p].decide(G, p), e = G.act(p, a);
          if (e) throw new Error('illegal ' + JSON.stringify(a) + ' ' + e);
          if (a.riichi) st.riichi++;
          if (a.t === 'pon' || a.t === 'chi' || a.t === 'kan') st.calls++;
          if (a.t === 'ankan' || a.t === 'kakan' || a.t === 'kan') st.kans++;
          if (cfg.check) { var b = MJ.conserve(G); if (b) throw new Error('conservation: ' + b); }
          if (++steps > 3000) throw new Error('too many steps');
        }
        var r = G.result; st.rounds++;
        if (G.totalPoints() !== 100000) { st.sumBad++; st.errors.push('sum ' + G.totalPoints() + ' seed ' + (cfg.seed0 + g)); }
        if (r.type === 'tsumo' || r.type === 'ron') {
          st.hands++; if (r.wins.length > 1) st.dblron++;
          r.wins.forEach(function (w) { if (w.eval.yakuman) st.yakuman++; if ((w.eval.han || 0) > st.maxHan) st.maxHan = w.eval.han; w.eval.yaku.forEach(function (y) { st.yaku[y.id] = (st.yaku[y.id] || 0) + 1; }); });
        }
        if (r.type === 'tsumo') st.tsumo++;
        if (r.type === 'ron') st.ron++;
        if (r.type === 'draw') { st.draw++; if (r.reason === 'nagashi') st.nagashi++; }
        if (r.type === 'abort') st.abort[r.reason] = (st.abort[r.reason] || 0) + 1;
        if (!G.over) G.nextRound();
      }
      if (!G.over) throw new Error('game did not end');
      var tot = 0; G.players.forEach(function (P) { tot += P.score; });
      if (tot !== 100000) { st.sumBad++; st.errors.push('final sum ' + tot); }
      st.games++;
      for (var q = 0; q < 4; q++) { st.rankSum[q] += G.ranking.rank[q]; if (G.ranking.rank[q] === 1) st.firstPlace[q]++; }
    } catch (ex) { st.errors.push(String(ex.message) + ' seed ' + (cfg.seed0 + g)); }
  }
  return st;
};
})(typeof window !== 'undefined' ? window : this);
