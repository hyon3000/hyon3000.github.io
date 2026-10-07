// Battle mode layer shared by the 2D / 3D / 4D games (enabled with ?battle=1, set by the shell's Game > Battle Mode).
//
// Main screen / game over:  the game simply uses the whole window.
// While a game is running:  the window keeps the normal 1:2 shape and the control buttons stay exactly where they are in normal mode; everything above them
//   (the game's own board / panels, drawn by the game at 2/3 size, and the opponent window) is shrunk 1.5x: [ opponent column (1/3 width) ] [ own game, 2/3 scale (2/3 width) ]
//   - the opponent is a second instance of the same game page (?battle=1&role=opp) that plays itself with the AI, running off-screen. Nothing of
//     it is copied or cropped: it sends a sanitised state (every cell is just 'empty' / 'normal block' / 'special block', plus the codes of the items
//     in its slots) and THIS page renders the opponent window itself: all normal blocks the same grey, special blocks a slightly lighter grey (their
//     type cannot be told), and the items already stored in its slots in their real colours. Flying items are rendered the same way.
//   - a small item-slot row sits inside the own window, directly above the special-block description line.
//
// Items: in battle mode an item cell that is eaten by a line clear is NOT used at once: it goes into a slot (PolyBattle.store). Items that do
// not trigger on a line clear (pierce, cancel, self-destruct, time bombs) never use a slot. The stored items (max 10) are drawn tightly packed from the left
// (the 1x10 area of square cells has a box around its edge only). DOUBLE-click the own game board (not the control buttons) to use the oldest item on yourself, the opponent window to use it on the opponent; a hint says so
// while at least one item is held. The score-boost block (code 4) is the 'Steal' item in battle mode (same picture): on yourself nothing happens, on the opponent
// it takes every item out of the opponent's slots into yours (the ones that do not fit are lost; 1/16 as common as in normal mode). The used item flies from its slot to the window it hits. The opponent's score / lines are never shown.
//
// Session protocol (window.postMessage between the page and the opponent instance; the same messages are meant for a network transport later):
//   opponent -> page : { type:'bt-opp', slots:[codes], snap:{cells as 0/1/2, falling piece}, info, over, diedMs }   (1) block positions  (2) slot list
//   page -> opponent : { type:'bt-peer', slots, info, score, lines, level, over }                           (1) + (2) in the other direction
//   page -> opponent : { type:'bt-use', code }        (3) feed an item to the opponent: it takes effect on the opponent's board
//   opponent -> page : { type:'bt-use-on-me', code }  the opponent's AI uses one of its items on the player
//
// Game over: as soon as ONE side dies the game ends for both at once (no waiting screen). Whoever died first gets LOSE above GAME OVER, the other
// WIN. RETRY then waits until the opponent has restarted too. The high score is always the player's own: the opponent
// instance (role=opp) never writes it.
//
// Pairing: before a game starts a pairing window offers 'create room' / 'join' / 'Play vs AI'. Two players on the same network connect browser to
// browser (WebRTC data channel, no server): the host gets a code and sends it to the guest, the guest pastes it and sends the
// answer code back, the host pastes that, and both games start. Over that channel the same information flows as to the AI instance:
//   p-state {slots, snap, info, over, diedMs ...}  every 100 ms   (1) block positions (2) slot list      p-use {code}  an item used on the other side
//   p-stolen {codes}  the items taken by a steal item               p-replay  RETRY pressed (the next game starts when both have pressed it)
// If the connection drops the opponent counts as dead (the remaining player wins) and the opponent becomes the AI.
(function (root) {
  'use strict';
  var qs = new URLSearchParams(root.location.search);
  var battle = qs.get('battle') === '1', role = qs.get('role') || '';
  root.__battle = battle;
  root.__btOpp = role === 'opp';        // the opponent instance must never touch the player's high score
  var B = {
    on: battle, role: role, slots: [], SLOTS: 10, STEP: 1, paired: false, mode: '', opponentKey: '', myKey: '', port: 1200,
    api: null, ko: /^ko/i.test(root.navigator.language || ''), onUseOnOpponent: null, opp: { items: [], slots: [], info: null, score: 0, lines: 0, level: 1, over: 0 }, peer: null
  };
  root.PolyBattle = B;
  // Cumulative score (replaces the high score in battle mode): after every game the winner is credited the sum of both scores, the loser 0.
  var gid = /polynomino/i.test(root.location.pathname) ? 'polynomino' : (/polytesseract/i.test(root.location.pathname) ? 'polytesseract' : 'polycube'), totalKey = gid + '_battle_total';
  B.total = 0;
  try { var tv = parseInt(root.localStorage.getItem(totalKey), 10); if (tv > 0) B.total = Math.min(tv, 999999999); } catch (_) {}
  function saveTotal() { try { root.localStorage.setItem(totalKey, String(B.total)); } catch (_) {} }
  if (!battle) { B.store = function () { return false; }; B.begin = function (cb) { cb(); }; B.attach = function () {}; B.clear = function () {}; B.aiUseSlots = function () {}; return; }

  var NOT_STORED = { 1: 1, 30: 1, 31: 1, 120: 1, 121: 1, 122: 1, 123: 1, 98: 1, 103: 1 };   // do not trigger on a line clear
  var SELF = { 9: 1, 20: 1, 21: 1, 102: 1, 104: 1, 116: 1, 118: 1, 119: 1, 124: 1, 126: 1, 105: 1, 106: 1, 204: 1 };   // AI: helpful items go to itself
  var parentWin = root.parent !== root ? root.parent : null;

  // ---------------------------------------------------------------- common: slots
  B.itemName = function (code) {
    var d = B.api && B.api.itemDesc && B.api.itemDesc(code);
    return d ? String(d).split(':')[0] : ('#' + code);
  };
  B.store = function (code) {
    if (NOT_STORED[code] || !B.api || !B.api.itemDesc || !B.api.itemDesc(code)) return false;   // only real item cells go to a slot
    if (B.slots.length < B.SLOTS) B.slots.push(code);
    return true;                        // all slots full: the new item is thrown away (it does not take effect)
  };
  B.clear = function () { B.slots = []; };
  // items whose direction is beyond doubt: line/area removal and slow-down are only ever good for the one who uses them on itself, extra lines /
  // speed-up / locks / blindness / obstacles / bombs only ever hurt. The rest (mirror, zigzag, hole, item clear, mono, enforcement ...) is the net's call.
  var SURE_SELF = { 9: 1, 20: 1, 21: 1, 102: 1, 105: 1, 116: 1, 118: 1, 119: 1, 124: 1, 126: 1 };
  var SURE_OPP = { 2: 1, 4: 1, 6: 1, 8: 1, 10: 1, 11: 1, 16: 1, 17: 1, 22: 1, 91: 1, 117: 1, 125: 1, 127: 1 };
  B.forbidden = function (code) { return SURE_SELF[code] ? 2 : SURE_OPP[code] ? 1 : -1; };   // the action (1 = on myself, 2 = on the opponent) that makes no sense for this item
  B.useSeq = 0;   // known from the item names: helpful ones are never given to the opponent, harmful ones never used on myself
  // AI player: stored items are used by a simple rule (the net is not trained on slots): helpful items on itself, harmful ones on the opponent
  B.aiUseSlots = function () {          // (through useFrontNow: the flights / the note to the other side happen as for every other use)
    var n = B.slots.length;
    for (var i = 0; i < n && B.slots.length; i++) B.useFrontNow(SELF[B.slots[0]] ? 'self' : 'opponent');
  };
  // what this side sees of the other player: its sanitised window and how many items it holds (null until the first message has arrived)
  var lastSeen = null;               // while the opponent is blind its window is hidden: what I know of it is what I saw before
  function seen(sn) { if (!sn) return sn; if (!sn.blind) { lastSeen = sn; return sn; } return lastSeen || sn; }
  B.oppState = function () {
    if (role === 'opp') return B.peer && B.peer.snap ? { snap: seen(B.peer.snap), qn: (B.peer.slots || []).length } : null;
    return B.opp.snap ? { snap: seen(B.opp.snap), qn: (B.opp.slots || []).length } : null;
  };
  // the AI's item decision is carried out at once (before the block is planned): the front item on myself, or sent to the opponent
  B.useFrontNow = function (target) {
    if (!B.slots.length) return;
    var code = B.slots.shift(); B.useSeq++;
    if (target === 'self') { noteSelf(code); if (code !== 4 && B.api && B.api.applyStored) B.api.applyStored(code); return; }
    sendUse(code);
  };
  function noteSelf(code) {                // the other side is told that this player used an item on itself (it shows the item flying in its copy of this window)
    if (role === 'opp' && parentWin) parentWin.postMessage({ type: 'bt-opp-self', code: code }, '*');
    else if (B.mode === 'peer') peerSend({ type: 'p-self', code: code });
  }
  // touching the slots sends the front item to the back; taking item k = touching k times, then using the front one
  B.rotateSlots = function (n) { for (var i = 0; i < n; i++) if (B.slots.length > 1) B.slots.push(B.slots.shift()); };
  B.useAt = function (k, target) { if (k >= B.slots.length) return; B.rotateSlots(k); B.useFrontNow(target); };
  function sendUse(code) {                 // (3) feed an item to the opponent
    if (B.onUseOnOpponent) B.onUseOnOpponent(code);
    else if (B.mode === 'peer') peerSend({ type: 'p-use', code: code });
    else if (role === 'opp' && parentWin) parentWin.postMessage({ type: 'bt-use-on-me', code: code }, '*');
    else if (B.oppFrame && B.oppFrame.contentWindow) B.oppFrame.contentWindow.postMessage({ type: 'bt-use', code: code }, '*');
    else B.opp.items.push(code);
  }
  // survival time of the current game (ms): the longer one wins
  B.startT = 0; B.diedMs = null; var wasPlaying = false;
  B.forcedSelf = false; B.tieDone = false; B.isHost = false;     // a draw is impossible: if both players die by themselves at the same moment, the higher final score wins; equal scores: the one who made the room
  function track() {
    var a = B.api; if (!a || !a.isPlaying) return;
    var playing = a.isPlaying(), over = !!(a.stats && a.stats().over), t = root.performance.now();
    if (playing && !wasPlaying) { B.startT = t; B.diedMs = null; }
    if (!playing && over && B.diedMs === null && B.startT) B.diedMs = t - B.startT;
    wasPlaying = playing;
  }
  function stateMsg(type) {
    var a = B.api, S = a && a.stats ? a.stats() : {};
    return { type: type, slots: B.slots.slice(), info: a && a.pieceInfo ? a.pieceInfo() : null, score: S.score || 0, lines: S.lines || 0, level: S.level || 1, over: S.over ? 1 : 0, forced: B.forcedSelf ? 1 : 0, diedMs: B.diedMs, snap: a && a.snapshot ? a.snapshot() : null };
  }
  // ---------------------------------------------------------------- peer transport (WebRTC data channel, set up by the pairing window)
  var chan = null, pcon = null, lastRx = 0;
  function peerSend(m) { try { if (chan && chan.readyState === 'open') chan.send(JSON.stringify(m)); } catch (e) {} }
  function setOppState(d) { B.opp.slots = d.slots || []; B.opp.snap = d.snap; B.opp.info = d.info; B.opp.score = d.score; B.opp.lines = d.lines; B.opp.level = d.level; var stale = root.performance.now() < (B.opp.mute || 0); B.opp.over = stale ? 0 : d.over; B.opp.diedMs = stale ? null : d.diedMs; B.opp.rxOver = stale ? 0 : d.over; B.opp.rxForced = stale ? 0 : (d.forced || 0); }
  // An item that reaches a game takes effect only while that game is running. If the game has not started yet (the two players start a moment apart,
  // the page is still loading) the item waits for it (5 s at most); if the game is over, the item is dropped (and counted in B.dropped).
  B.dropped = 0;
  function deliverItem(code, tries) {
    var a = B.api; if (!a || !a.applyStored) return;
    var over = !!(a.stats && a.stats().over), playing = !!(a.isPlaying && a.isPlaying());
    if (playing) { a.applyStored(code); return; }
    if (over || (tries || 0) >= 25) { B.dropped++; return; }
    root.setTimeout(function () { deliverItem(code, (tries || 0) + 1); }, 200);
  }
  function itemOnMe(code) {                 // an item the opponent used on me (it flies in from its slot strip first)
    var go = function () {
      if (code === 4) { var mine = B.slots.splice(0); if (B.mode === 'peer') peerSend({ type: 'p-stolen', codes: mine }); else if (B.oppFrame && B.oppFrame.contentWindow) B.oppFrame.contentWindow.postMessage({ type: 'bt-give', codes: mine }, '*'); }
      else deliverItem(code);
    };
    if (B.flyFromOpp) B.flyFromOpp(code, go); else go();
  }
  function peerGot(d) {
    lastRx = root.performance.now();
    if (!d || typeof d.type !== 'string') return;
    if (d.type === 'p-state') setOppState(d);
    else if (d.type === 'p-use' && typeof d.code === 'number') itemOnMe(d.code);
    else if (d.type === 'p-stolen') { if (B.flyStolen) B.flyStolen(d.codes || []); }
    else if (d.type === 'p-replay') B.opp.replayed = true;
    else if (d.type === 'p-self') { if (B.flyOppSelf) B.flyOppSelf(d.code); }
    else if (d.type === 'p-leave') peerLost('leave');
  }
  function toast(text) {
    var t = root.document.createElement('div');
    t.style.cssText = 'position:absolute;left:0;width:100%;top:40%;text-align:center;z-index:70;pointer-events:none;color:#fc6;font:bold 14px "Noto Sans KR","Malgun Gothic",sans-serif;text-shadow:0 0 4px #000,0 0 4px #000';
    t.textContent = text; vp.appendChild(t); root.setTimeout(function () { t.remove(); }, 4000);
  }
  function peerLost(why) {                   // the connection is gone: the opponent counts as dead and is replaced by the AI
    if (B.mode !== 'peer') return;
    B.lostWhy = why || '?';
    B.mode = 'ai'; chan = null; bcLink = null; bcPeer = ''; stopAuto(false);
    try { pcon && pcon.close(); } catch (e) {} pcon = null;
    oppGone = true; B.opp.over = 1; B.opp.diedMs = B.diedMs == null ? root.performance.now() - B.startT : B.diedMs + 1; B.opp.replayed = true;
    startOpponent();
    toast(B.ko ? '상대와 연결이 끊겼습니다. 다음 게임은 AI와 합니다.' : 'The opponent disconnected. The next game is against the AI.');
  }
  root.setInterval(function () {             // my state goes to the other player (timers, not animation frames: they keep running in a background tab)
    if (B.mode !== 'peer' || !chan) return;
    if (chan.readyState !== 'open') { peerLost('state'); return; }
    if (lastRx && root.performance.now() - lastRx > 9000) { peerLost('silence'); return; }
    if (B.api) peerSend(stateMsg('p-state'));
  }, 100);
  root.addEventListener('message', function (e) {
    var d = e.data; if (!d || typeof d.type !== 'string') return;
    if (d.type === 'bt-use' && role === 'opp') {                                                            // an item fed to this (opponent) instance
      if (d.code === 4) { var taken = B.slots.splice(0); if (parentWin) parentWin.postMessage({ type: 'bt-stolen', codes: taken }, '*'); }   // steal: everything in its slots goes to the player
      else deliverItem(d.code);
    }
    else if (d.type === 'bt-give' && role === 'opp') { (d.codes || []).forEach(function (c) { if (B.slots.length < B.SLOTS) B.slots.push(c); }); }
    else if (d.type === 'bt-opp-self' && !role && B.oppFrame && e.source === B.oppFrame.contentWindow) { if (B.flyOppSelf) B.flyOppSelf(d.code); }
    else if (d.type === 'bt-stolen' && !role && B.oppFrame && e.source === B.oppFrame.contentWindow) { if (B.flyStolen) B.flyStolen(d.codes || []); }
    else if (d.type === 'bt-use-on-me' && !role && B.oppFrame && e.source === B.oppFrame.contentWindow) { var useOnMe = function () { if (d.code === 4) { var mine = B.slots.splice(0); if (B.oppFrame && B.oppFrame.contentWindow) B.oppFrame.contentWindow.postMessage({ type: 'bt-give', codes: mine }, '*'); } else if (B.api && B.api.applyStored) B.api.applyStored(d.code); }; if (B.flyFromOpp) B.flyFromOpp(d.code, useOnMe); else useOnMe(); }
    else if (d.type === 'bt-opp' && !role) { B.opp.slots = d.slots || []; B.opp.snap = d.snap; B.opp.info = d.info; B.opp.score = d.score; B.opp.lines = d.lines; B.opp.level = d.level; var stale = root.performance.now() < (B.opp.mute || 0); B.opp.over = stale ? 0 : d.over; B.opp.diedMs = stale ? null : d.diedMs; }
    else if (d.type === 'bt-peer' && role === 'opp') { B.peer = d; }
    else if (d.type === 'bt-force-over' && role === 'opp') { if (B.api && B.api.forceOver) B.api.forceOver(); }
    else if (d.type === 'bt-restart' && role === 'opp') { if (B.api && B.api.restart) B.api.restart(); try { (root.PolyND || root.PolyAIControl).start(); } catch (err) {} }
  });

  // ---------------------------------------------------------------- opponent instance (role=opp): a plain game that plays itself with the AI
  if (role === 'opp') {
    B.begin = function (cb) { B.paired = true; B.mode = 'ai'; cb(); };
    B.attach = function (api) {
      B.api = api;
      var started = false, n = 0;
      root.setInterval(function () {
        if (!api.isReady()) return;
        track();
        if (!started) { started = true; api.autostart(); }
        if (api.isPlaying() && n++ % 25 === 0) { try { (root.PolyND || root.PolyAIControl).start(); } catch (e) {} }   // (re)start the AI once the game runs
        if (parentWin) parentWin.postMessage(stateMsg('bt-opp'), '*');
      }, 100);
    };
    return;
  }

  // ---------------------------------------------------------------- About pages: the score-boost block works differently in battle mode
  function patchAbout() {
    var ALT = { item_210: 1, item_242: 1, item_145: 1, item_178: 1, sp_scoreboost: 1 };
    var T = {          // (kept as short as the other entries: name / one line / hint)
      ko: { n: '강탈', d: '상대 아이템을 전부 뺏음', h: '확률 ~0.06%', c: ' · 대전: 다음 노란 1칸 블록 위치' },
      en: { n: 'Steal', d: 'On opponent: take all its items', h: 'Prob. ~0.06%', c: ' · battle: next yellow single block' }
    };
    var CENTRE = ['범위삭제', '횡렬삭제', '종렬삭제', '상단삭제', 'W열삭제', 'Range Del', 'Row Del', 'Col Del', 'Top Clear', 'W Del'];
    root.document.querySelectorAll('.it').forEach(function (it) {
      var im = it.querySelector('img'), sp = im && im.nextElementSibling; if (!sp) return;
      var en = !!it.closest('.lang-en'), ko = !!it.closest('.lang-ko');
      function part(l) { return '<b style="color:#fa0">' + T[l].n + '</b><br>' + T[l].d + '<br><span class="hint">' + T[l].h + '</span>'; }
      if (ALT[im.getAttribute('alt')]) {                                  // score boost = steal item
        if (ko || en) sp.innerHTML = part(en ? 'en' : 'ko');
        else sp.innerHTML = '<span class="lang-ko">' + part('ko') + '</span><span class="lang-en" style="display:none">' + part('en') + '</span>';   // 4D page: both languages inline
        return;
      }
      var nb = it.querySelector('b'), name = nb ? nb.textContent : '';
      if (!CENTRE.some(function (n) { return name.indexOf(n) >= 0; })) return;    // items that need a centre: where they act in battle mode
      var hint = it.querySelector('.hint'); if (!hint) return;
      var kl = hint.querySelector('.lang-ko'), el = hint.querySelector('.lang-en');
      if (kl || el) { if (kl) kl.textContent += T.ko.c; if (el) el.textContent += T.en.c; }
      else hint.textContent += (en ? T.en.c : T.ko.c);
    });
    // key legends: Shift is no longer the hold key in battle mode
    root.document.querySelectorAll('.key').forEach(function (k) {
      if (k.textContent.trim() !== 'Shift') return;
      var n = k.nextSibling, hops = 0;
      while (n && hops++ < 4) {
        if (n.nodeType === 3) { var t = n.textContent; if (/홀드|Hold/.test(t)) { n.textContent = t.replace(/홀드/, '슬롯 순서').replace(/Hold/, 'Slot order'); break; } }
        else if (n.nodeType === 1 && /홀드|Hold/.test(n.textContent)) { n.textContent = n.textContent.replace(/홀드/, '슬롯 순서').replace(/Hold/, 'Slot order'); }
        n = n.nextSibling;
      }
    });
    // the first About page: how battle mode works
    var A = {
      ko: '<h2>대전 모드</h2><ul><li>줄 삭제로 먹은 아이템은 슬롯(최대 10개)에 저장됩니다</li><li>더블클릭(내 판=나, 상대 창=상대) / 키 0(나)·1(상대): 맨 앞 아이템 사용</li><li>슬롯 터치 / Shift(홀드 대신): 맨 앞 → 맨 뒤, 키 2~9: n번째 → 맨 앞</li><li>범위·횡렬·종렬·상단삭제: 사용하면 다음 블록이 노란 1칸 블록이 되고 고정될 때 그 위치에서 발동</li><li>한쪽이 죽으면 양쪽이 바로 종료됩니다 (먼저 죽은 쪽 LOSE)</li></ul>',
      en: '<h2>Battle mode</h2><ul><li>Items eaten by line clears are stored in slots (max 10)</li><li>Double-click (my board = me, opponent = them) / key 0 (me) · 1 (them): use the front item</li><li>Touch slots / Shift (replaces hold): front → back; keys 2-9: nth → front</li><li>Range / row / column / top delete: the next block becomes a yellow single block and the item acts where it locks</li><li>When one side dies both games end at once (the first to die loses)</li></ul>'
    };
    // (3D / 4D: this replaces the 'why play' filler to make room; 2D has no such section and gets the note at the bottom)
    function addNote(box, l) {
      if (!box || box.querySelector('.btnote')) return;
      var d = root.document.createElement('div'); d.className = 'btnote'; d.innerHTML = A[l];
      var hint = box.querySelector('p.hint'), why = null;
      box.querySelectorAll('h2').forEach(function (h) { if (/왜 해야 하나|Why Play/.test(h.textContent)) why = h; });
      if (why) { var ul = why.nextElementSibling; why.style.display = 'none'; if (ul && ul.tagName === 'UL') ul.style.display = 'none'; }
      if (hint) hint.parentNode.insertBefore(d, hint); else box.appendChild(d);
    }
    var boxes = root.document.querySelectorAll('#about1 .ai > div.lang-ko, #about1 .ai > div.lang-en');
    if (boxes.length) boxes.forEach(function (bx) { addNote(bx, bx.classList.contains('lang-en') ? 'en' : 'ko'); });
    else addNote(root.document.querySelector('#about1 .ai'), B.ko ? 'ko' : 'en');           // 4D page: both languages inline, only the player's one is added
  }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', patchAbout); else patchAbout();

  // ---------------------------------------------------------------- layout (main page)
  var vp = root.document.getElementById('viewport');
  var oppBox = root.document.createElement('div'), own = root.document.createElement('div'), oppWrap = root.document.createElement('div'), hintEl = root.document.createElement('div'), oppSlots = root.document.createElement('div');
  var css = root.document.createElement('style');
  css.textContent = [
    '#own{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}',   // main screen / game over: the game uses the whole (wide) window
    '#own>canvas{display:block;position:absolute;left:0;top:0;width:100%;height:100%}',
    '#oppbg{display:none}',   // (unused: the game's own canvas covers the whole window, background included)
    '#oppw,#oppslots{display:none}',
    '#viewport.split #oppw{display:block}#viewport.split #oppslots{display:block}',
    '#oppw{position:absolute;left:0;top:0;width:33.3333%;height:66%;overflow:hidden;background:#000;cursor:pointer}',
    '#oppframe{position:absolute;left:0;top:0;border:0;pointer-events:none;opacity:0;z-index:-1}',      // the opponent instance runs off-screen; nothing of it is shown
    '#oppslots{position:absolute;left:0;top:66%;width:33.3333%;display:none;box-sizing:border-box;border:1.5px solid #9ab}',   // the box around the 1x10 item area (edge only)
    '#oppw canvas,#oppslots canvas{display:block;width:100%;height:100%}',
    '#oppbox{position:absolute;display:none;box-sizing:border-box;border:1.5px solid #9ab;pointer-events:none;text-align:center;color:#dde;font:bold 11px "Noto Sans KR","Malgun Gothic",sans-serif;text-shadow:0 0 3px #000,0 0 3px #000;overflow:hidden;white-space:nowrap}',
    '#viewport.split #oppbox{display:block}',
    '#bthint{position:absolute;left:0;width:100%;text-align:center;color:#ff9;font:bold 11px "Noto Sans KR","Malgun Gothic",sans-serif;white-space:nowrap;pointer-events:none;display:none;z-index:30;text-shadow:0 0 3px #000,0 0 3px #000}',
    '.btfly{position:absolute;z-index:60;pointer-events:none;image-rendering:auto;filter:drop-shadow(0 0 6px #ff0)}',
    '#btres,#btmsg,#btmask{position:absolute;left:0;width:100%;display:none;text-align:center;z-index:40;pointer-events:none}',
    '#btres{font:bold 2.4em/1 monospace;letter-spacing:.15em}',
    '#btmsg{color:#fc6;font:bold 1em/1.3 "Noto Sans KR","Malgun Gothic",sans-serif}',
    '#btmask{background:#000;pointer-events:auto}',
    '#bt-pair{position:absolute;left:0;top:0;width:100%;height:100%;z-index:50;background:rgba(0,0,0,.94);color:#ddd;display:none;flex-direction:column;align-items:center;justify-content:center;font-family:"Noto Sans KR","Malgun Gothic",sans-serif;box-sizing:border-box;padding:4%}',
    '#bt-pair h2{color:#0ff;margin:0 0 .5em;font-size:1.3em}',
    '#bt-pair p{margin:.25em 0;font-size:.9em;line-height:1.5;text-align:center;max-width:34em}',
    '#bt-pair .key{font:bold 2em monospace;color:#ff0;letter-spacing:.12em;margin:.3em 0;user-select:all}',
    '#bt-pair textarea{width:min(34em,92%);font:12px monospace;background:#111;color:#cfe;border:1px solid #6ac;padding:.4em;resize:none;word-break:break-all}',
    '#bt-pair input{font:bold 1.3em monospace;text-transform:uppercase;width:9em;text-align:center;background:#111;color:#fff;border:1px solid #6ac;padding:.25em;letter-spacing:.1em}',
    '#bt-pair button{margin:.35em;padding:.45em 1.1em;background:#123;border:1px solid #0ff8;color:#0ff;font:inherit;cursor:pointer;border-radius:3px}',
    '#bt-pair button:hover{background:#245}',
    '#bt-pair .err{color:#f66;min-height:1.2em;font-size:.85em}'
  ].join('\n');
  root.document.head.appendChild(css);
  own.id = 'own';
  while (vp.firstChild) own.appendChild(vp.firstChild);       // canvas, hud, about panels ... all keep working relative to #own
  vp.appendChild(own);
  var bgEl = root.document.createElement('div'); bgEl.id = 'oppbg'; vp.insertBefore(bgEl, vp.firstChild);
  oppBox.id = 'oppbox'; oppBox.textContent = B.ko ? '상대방 창' : 'Opponent'; vp.appendChild(oppBox);
  oppWrap.id = 'oppw'; vp.appendChild(oppWrap);
  oppSlots.id = 'oppslots'; vp.appendChild(oppSlots);
  hintEl.id = 'bthint'; own.appendChild(hintEl);
  var resEl = root.document.createElement('div'), msgEl = root.document.createElement('div'), maskEl = root.document.createElement('div');
  resEl.id = 'btres'; msgEl.id = 'btmsg'; maskEl.id = 'btmask'; own.appendChild(maskEl); own.appendChild(resEl); own.appendChild(msgEl);

  // the item icons sit right above the special-block description line of the own window (the game draws them, tightly packed, from api.slotRect)
  var HINT = B.ko ? '더블클릭(또는 키 0 / 1): 내 판=나에게 · 상대 창=상대에게<br>슬롯 터치 / Shift: 맨 앞 → 맨 뒤 · 키 2~9: n번째 → 맨 앞' : 'Double-click (or keys 0 / 1): my board = me · opponent = them<br>Touch slots / Shift: front → back · keys 2-9: nth → front';
  function placeHint() {
    var cv = own.getElementsByTagName('canvas')[0];
    if (!cv || !B.api || !B.api.slotRect || !cv.width) return;
    var r = B.api.slotRect(cv.width, cv.height), k = own.clientWidth / cv.width;
    hintEl.style.top = '6px';                                    // top of the window: nothing else is drawn there (the slots / description / controls below stay clear) hintEl.style.fontSize = Math.max(9, Math.floor(r[3] * k * 0.5)) + 'px';
    hintEl.innerHTML = HINT;
    hintEl.style.display = B.slots.length >= 1 ? 'block' : 'none';
  }
  // the opponent window and its item strip are drawn here by the game's own renderer from the sanitised state (nothing is copied from the other page)
  B.renderOpp = function () {
    if (!B.oppR && B.api && B.api.makeOppRenderer) B.oppR = B.api.makeOppRenderer(oppWrap, oppSlots);
    if (B.oppR && B.opp.snap) B.oppR.draw(B.opp.snap, B.opp.slots);
  };
  function itemSprite(code) {                 // an item block image rendered by us (null when the picture came out empty: the flight then shows a plain marker instead of nothing)
    var sp = root.document.createElement('canvas'); sp.width = sp.height = 64;
    try {
      if (B.oppR) B.oppR.icon(code, sp);
      var px = sp.getContext('2d').getImageData(0, 0, 64, 64).data, n = 0;
      for (var i = 3; i < px.length; i += 16) if (px[i] > 0) n++;
      if (n === 0) return null;
    } catch (e) { return null; }
    return sp;
  }

  // ---------------------------------------------------------------- using items: double-click, and the flying item
  var pendUse = null, lastDown = { own: 0, opp: 0 };
  function relRect(el) { var a = el.getBoundingClientRect(), v = vp.getBoundingClientRect(); return { x: a.left - v.left, y: a.top - v.top, w: a.width, h: a.height }; }
  var nextFlightAt = 0;
  function fly(src, from, to, size, cb) {              // items used at the same moment fly one after the other (otherwise they would lie exactly on top of each other)
    var t = root.performance.now(), wait = Math.max(0, nextFlightAt - t);
    nextFlightAt = t + wait + 230;
    if (wait > 0) root.setTimeout(function () { flyNow(src, from, to, size, cb); }, wait); else flyNow(src, from, to, size, cb);
  }
  function flyNow(src, from, to, size, cb) {           // (whatever goes wrong with the picture, the item still takes effect)
    try { flyShow(src, from, to, size, cb); } catch (e) { if (cb) cb(); }
  }
  function flyShow(src, from, to, size, cb) {          // src: canvas element (or image) to show; from/to: centres relative to the viewport
    var el = src, ok = !!src;
    if (!ok) { el = root.document.createElement('canvas'); el.width = el.height = 24; var g = el.getContext('2d'); g.fillStyle = '#fc6'; g.fillRect(2, 2, 20, 20); }
    el.className = 'btfly'; el.style.left = (from.x - size / 2) + 'px'; el.style.top = (from.y - size / 2) + 'px'; el.style.width = size + 'px'; el.style.height = size + 'px';
    vp.appendChild(el);
    var dx = to.x - from.x, dy = to.y - from.y;
    var an = el.animate([{ transform: 'translate(0px,0px) scale(1)', opacity: 1 },
      { transform: 'translate(' + (dx * 0.45) + 'px,' + (dy * 0.45 - 50) + 'px) scale(2.4)', opacity: 1, offset: 0.45 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1.3)', opacity: 0.15 }], { duration: 750, easing: 'ease-in-out' });
    var fin = false, end = function () { if (fin) return; fin = true; el.remove(); if (cb) cb(); };    // the item must take effect even if the animation is cancelled / throttled
    an.onfinish = end; an.oncancel = end; root.setTimeout(end, 1100);
  }
  function centerOf(el) { var r = relRect(el); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
  // double-click on a window: use the oldest stored item (on the window's owner). The first click keeps its normal job.
  function dbl(which, e, target) {
    var t = root.performance.now(), prev = lastDown[which]; lastDown[which] = t;
    if (!(prev && t - prev < 350 && B.slots.length && !pendUse && B.phase === 'play')) return false;
    lastDown[which] = 0; e.stopPropagation(); e.preventDefault();
    pendUse = { target: target };                       // done right after the next frame is drawn (the icon is still on the canvas then)
    return true;
  }
  // only a double-click on the game board (the block area) uses an item: quick presses of the on-screen control buttons must not
  function onBoard(e) {
    var cv = own.getElementsByTagName('canvas')[0]; if (!cv || !B.api || !B.api.boardRect || !cv.width) return false;
    var rc = cv.getBoundingClientRect(), k = cv.width / rc.width, x = (e.clientX - rc.left) * k, y = (e.clientY - rc.top) * k, r = B.api.boardRect(cv.width, cv.height);
    return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
  }
  function onSlots(e) {                       // the strip of item slots (the game draws it from api.slotRect)
    var cv = own.getElementsByTagName('canvas')[0]; if (!cv || !B.api || !B.api.slotRect || !cv.width) return false;
    var rc = cv.getBoundingClientRect(), k = cv.width / rc.width, x = (e.clientX - rc.left) * k, y = (e.clientY - rc.top) * k, r = B.api.slotRect(cv.width, cv.height), m = r[3] * 0.15;
    return x >= r[0] - m && x <= r[0] + r[2] + m && y >= r[1] - m && y <= r[1] + r[3] + m;
  }
  own.addEventListener('pointerdown', function (e) {
    if (B.phase === 'play' && B.slots.length > 1 && onSlots(e)) { e.stopPropagation(); e.preventDefault(); lastDown.own = 0; B.rotateSlots(1); return; }   // touching the slots: the front item goes to the back
    if (onBoard(e)) dbl('own', e, 'self'); else lastDown.own = 0;
  }, true);
  oppWrap.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); dbl('opp', e, 'opponent'); });
  // the Shift key does the same as touching the slots (in battle mode it replaces the keyboard hold: the on-screen hold button still works)
  root.addEventListener('keydown', function (e) {
    if (e.code !== 'ShiftLeft' && e.code !== 'ShiftRight' && e.key !== 'Shift') return;
    if (B.phase !== 'play') return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (!e.repeat && B.slots.length > 1) B.rotateSlots(1);
  }, true);
  // number keys: 0 = use the front item on myself, 1 = on the opponent (same as the double-click on my board / the opponent window);
  // 2..9 = move the 2nd..9th item to the front of the slots (the others keep their order)
  B.moveToFront = function (i) { if (i > 0 && i < B.slots.length) B.slots.unshift(B.slots.splice(i, 1)[0]); };
  root.addEventListener('keydown', function (e) {
    var m = /^(?:Digit|Numpad)(\d)$/.exec(e.code || ''); if (!m || B.phase !== 'play' || e.ctrlKey || e.altKey || e.metaKey) return;
    var n = +m[1];
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.repeat) return;
    if (n === 1 || n === 0) { if (B.slots.length && !pendUse) B.useFrontNow(n === 0 ? 'self' : 'opponent'); }
    else B.moveToFront(n - 1);
  }, true);
  function ownIconCenter(i) {
    var cv = own.getElementsByTagName('canvas')[0], r = B.api.slotRect(cv.width, cv.height), k = own.clientWidth / cv.width, ar = relRect(own);
    var p = (r[2] - 3) / B.SLOTS;                         // the box holds exactly SLOTS square cells of side p inside its 1.5 px border
    return { x: ar.x + (r[0] + 1.5 + (i + 0.5) * p) * k, y: ar.y + (r[1] + r[3] / 2) * k, size: p * k };
  }
  function runPendingUse() {                            // called right after a frame was drawn
    if (!pendUse) return;
    var p = pendUse; pendUse = null;
    if (!B.slots.length) return;
    var from = ownIconCenter(0), code = B.slots.shift(); B.useSeq++;
    if (p.target === 'self') { noteSelf(code); fly(itemSprite(code), from, centerOf(own), from.size, null); if (code !== 4 && B.api.applyStored) B.api.applyStored(code); return; }       // on myself: the item flies into my window (the effect is at once)
    fly(itemSprite(code), from, centerOf(oppWrap), from.size, function () { sendUse(code); });
  }
  var plainUseFront = B.useFrontNow;
  B.useFrontNow = function (target) {                 // main page: the same, plus the item flying to the opponent window
    if (target !== 'self' && B.slots.length && B.api && B.api.slotRect) {
      var code = B.slots[0], from = ownIconCenter(0);
      plainUseFront(target); fly(itemSprite(code), from, centerOf(oppWrap), from.size, null);
    } else if (target === 'self' && B.slots.length && B.api && B.api.slotRect) {          // on myself: the item flies from its slot into my window (the effect is at once: the AI plans with it)
      var code2 = B.slots[0], from2 = ownIconCenter(0);
      plainUseFront(target); fly(itemSprite(code2), from2, centerOf(own), from2.size, null);
    } else plainUseFront(target);
  };
  // the opponent used an item on ITSELF: it flies from its item strip into its window (nothing happens to me)
  B.flyOppSelf = function (code) {
    var idx = B.opp.slots.indexOf(code), sr = relRect(oppSlots), cell = (sr.w - 3) / B.SLOTS;
    if (idx < 0) idx = 0;
    fly(itemSprite(code), { x: sr.x + 1.5 + (idx + 0.5) * cell, y: sr.y + sr.h / 2 }, centerOf(oppWrap), Math.max(14, cell), null);
  };
  // the items stolen from the opponent fly from its item strip to my slot area and become mine
  B.flyStolen = function (codes) {
    var sr = relRect(oppSlots), cell = (sr.w - 3) / B.SLOTS;
    codes.forEach(function (code, n) {
      var idx = B.opp.slots.indexOf(code); if (idx < 0) idx = n;
      var from = { x: sr.x + 1.5 + (idx + 0.5) * cell, y: sr.y + sr.h / 2 };
      var to = ownIconCenter(Math.min(B.slots.length + n, B.SLOTS - 1));
      root.setTimeout(function () { fly(itemSprite(code), from, to, Math.max(14, cell), function () { if (B.slots.length < B.SLOTS) B.slots.push(code); }); }, n * 90);
    });
  };
  // an item of the opponent flies from its item strip to my window, then takes effect
  B.flyFromOpp = function (code, cb) {
    var idx = B.opp.slots.indexOf(code), sr = relRect(oppSlots), cell = (sr.w - 3) / B.SLOTS, from;
    if (idx < 0) idx = 0;
    from = { x: sr.x + 1.5 + (idx + 0.5) * cell, y: sr.y + sr.h / 2 };
    fly(itemSprite(code), from, centerOf(own), Math.max(14, cell), cb);
  };

  // ---------------------------------------------------------------- opponent window: a real second game instance, cropped to its block area
  function startOpponent() {
    if (B.oppFrame) return;
    var f = root.document.createElement('iframe');
    var u = new URLSearchParams(root.location.search); u.set('battle', '1'); u.set('role', 'opp');
    f.src = root.location.pathname + '?' + u.toString();
    f.id = 'oppframe'; vp.appendChild(f); B.oppFrame = f;
  }
  // the left third of the widened window shows the same background image as the game window (not black)
  var bgKey = '';
  function applyBackground() {
    return;                                                                       // (the game draws its background over the whole window itself)
    var bg = B.api && B.api.background && B.api.background(); if (!bg) return;
    var W = vp.clientWidth, H = vp.clientHeight, ow = own.clientWidth, key = [W, H, ow].join(',');
    if (key === bgKey) return; bgKey = key;
    var dim = 'linear-gradient(rgba(' + bg.dim + '), rgba(' + bg.dim + '))';
    if (bg.tiles) {          // tiled background (4D): continue the same tile grid to the left of the game window
      var tw = ow / bg.tiles, th = own.clientHeight / bg.tiles;
      bgEl.style.background = dim + ', url("' + bg.url + '") ' + (W / 3) + 'px 0 / ' + tw + 'px ' + th + 'px repeat';
      bgEl.style.backgroundSize = 'auto, ' + tw + 'px ' + th + 'px'; bgEl.style.backgroundPosition = '0 0, ' + (W / 3) + 'px 0';
    } else {                 // stretched over the column (2D / 3D)
      bgEl.style.background = dim + ', url("' + bg.url + '") 0 0 / 100% 100% no-repeat';
    }
  }
  function fitOpponent() {             // the opponent window is exactly as big as the block area of the own window; the strip below has square cells
    var f = B.oppFrame, cv = own.getElementsByTagName('canvas')[0];
    if (!cv || !B.api || !B.api.boardRect || !cv.width) return;                     // (a human opponent has no hidden page: the layout is the same)
    var W = own.clientWidth, H = own.clientHeight;                                  // the (off-screen) opponent page gets the size of the own window
    if (f && (!W || f.style.width !== W + 'px')) { f.style.width = W + 'px'; f.style.height = H + 'px'; }
    var k = W / cv.width, r = (B.api.boardRectN || B.api.boardRect)(cv.width, cv.height).map(function (v) { return v * k; });   // (the block area at the normal, unshrunk size)
    var sc = B.api.oppScale, w, h, M = Math.max(5, Math.round(vp.clientWidth * 0.008)), PAD = 4, LH = 16, colW = vp.clientWidth / 3, OPPK = 0.8, GAP = M;
    var areaH = B.api.btnTop ? B.api.btnTop(cv.width, cv.height) * k : vp.clientHeight * 0.72;       // the opponent column spans the part above the (unchanged) control buttons
    if (sc) { w = Math.round(r[2] * sc * (2 / 3) * OPPK); h = Math.round(r[3] * sc * (2 / 3) * OPPK); }   // 3D / 4D: 0.8 x (half the size of my block area as it used to be drawn at 2/3)
    else {                                                                          // 2D: 0.8 x (as wide as the column allows), as tall as the screen allows
      var a = r[3] / r[2];
      w = Math.floor((colW - 2 * M - 2 * PAD) * OPPK);
      w = Math.min(w, Math.floor((areaH - 8 - LH - 2 * PAD - 3 + 0.3) / (a + 0.1)));
      h = Math.round(a * w);
    }
    var ch = Math.round((w - 3) / B.SLOTS) + 3;                                     // 1 x 10 square cells (3 = the border)
    var bw0 = w + 2 * PAD, ex = B.api.extent ? B.api.extent(cv.width, cv.height) : null;
    if (ex) {                               // my own window (everything above the buttons) takes all the width the opponent box leaves, as big as that allows (at most its normal size)
      var left = M + bw0 + GAP, sN = Math.min(1, (W - M - left) / ((ex[1] - ex[0]) * k));
      B.xf = { s: sN, ox: (left - sN * ex[0] * k) / k };
    }
    var bw = w + 2 * PAD, bh = LH + PAD + h + ch + PAD, bt = Math.max(0, Math.round((areaH - bh) / 2)), bl = M;
    // one rectangle around the opponent window + its item strip, vertically centred in the left area, with a small margin on the left; the title sits on top
    oppBox.style.cssText = 'left:' + bl + 'px;top:' + bt + 'px;width:' + bw + 'px;height:' + bh + 'px;line-height:' + LH + 'px';
    oppWrap.style.left = oppSlots.style.left = (bl + PAD) + 'px'; oppWrap.style.width = oppSlots.style.width = w + 'px';
    oppWrap.style.top = (bt + LH) + 'px'; oppWrap.style.height = h + 'px'; oppSlots.style.top = (bt + LH + h) + 'px'; oppSlots.style.height = ch + 'px';
  }
  var origRaf = root.requestAnimationFrame.bind(root), split = false, lastPeerMsg = 0;
  function setSplit(p) {
    if (p === split) return;
    split = p; B.split = p; vp.classList.toggle('split', p);
    root.setTimeout(function () { root.dispatchEvent(new root.Event('resize')); }, 0);   // the game re-measures its canvas

  }
  var creditT = 0, lastPh = '', oppGone = false, replayMe = false, replayCb = null, lastOppSlots = '', lastPhase = '';
  var T = B.ko ? { wait: '상대방 플레이중', replay: '상대방 재시작을 기다리는 중', win: 'WIN', lose: 'LOSE', draw: 'DRAW' }
               : { wait: 'Opponent is still playing', replay: 'Waiting for the opponent to restart', win: 'WIN', lose: 'LOSE', draw: 'DRAW' };
  function phaseNow(playing) {
    if (!B.paired || !B.api) return 'idle';
    var over = !!(B.api.stats && B.api.stats().over);
    if (playing) return 'play';
    if (!over) return 'idle';
    if (!B.opp.over && !oppGone) return 'waitOpp';                         // (only for the few frames until the opponent instance has been ended too)
    return replayMe ? 'waitReplay' : 'result';
  }
  B.result = function () {                    // 'win' / 'lose' / 'draw' once the duel is decided, else ''
    var my = B.diedMs, op = B.opp.diedMs;
    return B.loser === 'me' ? 'lose' : (B.loser === 'opp' ? 'win' : ((my == null || op == null) ? '' : (my > op ? 'win' : 'lose')));      // (there is no draw: whoever dies first loses)
  };
  B.canLeave = function () { return B.phase === 'result' || B.phase === 'waitOpp'; };   // both games are over
  // RETRY pressed (the game calls this): restart as soon as the opponent has pressed replay too. The AI counts as having pressed it at once.
  B.replay = function (cb) {
    if (B.phase !== 'result') return;
    replayMe = true; replayCb = cb;
    if (B.mode === 'peer') peerSend({ type: 'p-replay' });
  };
  function showOverlays(ph) {
    var L = B.api && B.api.overLayout ? B.api.overLayout() : { resY: 0.1, msgY: 0.6, mask: [0.58, 0.8] };
    var H = own.clientHeight, fs = Math.max(11, Math.floor(H * 0.026));
    var show = ph === 'waitReplay' || ph === 'result';
    msgEl.style.display = ph === 'waitReplay' ? 'block' : 'none';
    maskEl.style.display = ph === 'waitReplay' ? 'block' : 'none';
    resEl.style.display = 'none';                          // WIN / LOSE / DRAW are drawn by the game itself, in its own line font, where GAME OVER used to be
    if (!show) return;
    maskEl.style.top = (L.mask[0] * 100) + '%'; maskEl.style.height = ((L.mask[1] - L.mask[0]) * 100) + '%';
    msgEl.style.top = (L.msgY * 100) + '%'; msgEl.style.fontSize = fs + 'px';
    msgEl.textContent = T.replay;
    var my = B.diedMs, op = B.opp.diedMs, w = B.loser === 'me' ? 'lose' : (B.loser === 'opp' ? 'win' : ((my == null || op == null) ? '' : (my > op ? 'win' : (my < op ? 'lose' : 'draw'))));
    resEl.style.top = (L.resY * 100) + '%'; resEl.style.fontSize = Math.floor(H * 0.06) + 'px';
    resEl.textContent = w ? T[w] : '';
    resEl.style.color = w === 'win' ? '#5f5' : (w === 'lose' ? '#f66' : '#ccc');
  }
  function battleLogic(playing) {
    track();
    var over = !!(B.api && B.api.stats && B.api.stats().over);
    if (B.paired && B.api) {
      if (!playing && over && !B.opp.over && !B.loser) {            // I died first: the opponent's game ends at once too
        B.loser = 'me'; B.opp.over = 1; B.opp.diedMs = B.opp.diedMs == null ? root.performance.now() - B.startT : B.opp.diedMs;
        if (B.oppFrame && B.oppFrame.contentWindow) B.oppFrame.contentWindow.postMessage({ type: 'bt-force-over' }, '*');
      } else if (playing && B.opp.over && !B.loser) {                // the opponent died first: my game ends at once too
        B.loser = 'opp'; B.forcedSelf = true; if (B.api.forceOver) B.api.forceOver();
        playing = false;
      }
    }
    if (B.mode === 'peer' && over && !playing && !B.tieDone && !B.forcedSelf && B.opp.rxOver && !B.opp.rxForced) {
      var ms = (B.api.stats && B.api.stats().score) || 0, os = B.opp.score || 0;
      B.tieDone = true; B.loser = ms > os ? 'opp' : (ms < os ? 'me' : (B.isHost ? 'opp' : 'me'));          // both died by themselves: one winner, the same on both sides
    }
    var ph = phaseNow(playing);
    if (ph === 'play' && lastPh !== 'play') { B.forcedSelf = false; B.tieDone = false; B.opp.rxOver = 0; B.opp.rxForced = 0; }
    lastPh = ph;
    if (B.mode === 'peer' && replayMe && B.opp.replayed && !playing && over) ph = 'waitReplay';   // (the other side may already show its new game: its state no longer says 'over')
    if (ph === 'play') { replayMe = false; replayCb = null; B.loser = ''; }
    if (ph === 'waitReplay' && (B.mode === 'ai' || B.opp.replayed)) {           // both pressed replay: new game
      var cb = replayCb; replayMe = false; replayCb = null; oppGone = false; B.opp.over = 0; B.opp.diedMs = null; B.opp.replayed = false; B.opp.mute = root.performance.now() + 700;   // (messages still on their way from the old game are ignored)
      if (B.oppFrame && B.oppFrame.contentWindow) B.oppFrame.contentWindow.postMessage({ type: 'bt-restart' }, '*');
      if (cb) cb();
      ph = 'play';
    }
    if (ph === 'play') { B.credited = false; creditT = 0; }
    if (ph === 'result' && !B.credited && !role) {          // credit the finished game once (a moment after it ended, so the last score messages of the opponent have arrived)
      var now = root.performance.now(); if (!creditT) creditT = now;
      var res = B.result();
      if (res && now - creditT > 400) {
        B.credited = true;
        if (res === 'win') { B.total = Math.min(999999999, B.total + Math.max(0, (B.api.stats && B.api.stats().score) || 0) + Math.max(0, B.opp.score || 0)); saveTotal(); }
      }
    }
    B.phase = ph;
    showOverlays(ph);
    return ph;
  }
  function frameHook() {
    var playing = !!(B.api && B.api.isPlaying && B.api.isPlaying());
    var ph = battleLogic(playing);
    var watching = playing;
    setSplit(watching);
    if (!watching) { hintEl.style.display = 'none'; return; }
    placeHint(); fitOpponent(); applyBackground(); B.renderOpp(); runPendingUse();
    var t = root.performance.now();
    if (playing && t - lastPeerMsg > 200 && B.oppFrame && B.oppFrame.contentWindow) {     // (1)+(2) towards the opponent instance
      lastPeerMsg = t; B.oppFrame.contentWindow.postMessage(stateMsg('bt-peer'), '*');
    }
  }
  root.requestAnimationFrame = function (cb) { return origRaf(function (t) { cb(t); frameHook(); }); };

  // ---------------------------------------------------------------- pairing window
  var pair = root.document.createElement('div'); pair.id = 'bt-pair';
  own.appendChild(pair);
  // codes: the session description (SDP) of the WebRTC connection, trimmed (IPv4 / mDNS host candidates only), deflated and written as URL-safe base64
  function b64e(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64d(t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var s = root.atob(t), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function pipe(u8, stream) {
    var w = stream.writable.getWriter(); w.write(u8); w.close();
    return new root.Response(stream.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  // The browser may hide its address behind a random name (xxxx.local, mDNS) that the other browser cannot always resolve (not at all on many setups).
  // The real socket listens on all interfaces, so for every such candidate the same port is also offered on 127.0.0.1 (two browsers on one PC) and on the
  // address this page was opened from when that is an IPv4 address of this machine.
  var NOMDNS = qs.get('bt_nomdns') === '1';          // (test: forget the mDNS names)
  function trimSdp(sdp) {
    var out = [], extra = [], fid = 90, hn = root.location.hostname;
    sdp.split(/\r?\n/).forEach(function (l) {
      if (!l) return;
      if (l.indexOf('a=candidate:') === 0) {
        var f = l.split(' ');
        if (!(f[2].toLowerCase() === 'udp' && (f[4].indexOf(':') < 0 || /\.local$/.test(f[4])) && /typ host/.test(l))) return;
        if (/\.local$/.test(f[4])) {
          ['127.0.0.1', /^\d+\.\d+\.\d+\.\d+$/.test(hn) && hn !== '127.0.0.1' ? hn : ''].forEach(function (ip) {
            if (!ip) return; var g = f.slice(); g[0] = 'a=candidate:' + (fid++); g[3] = String(Math.max(1, +f[3] - 1)); g[4] = ip; extra.push(g.join(' '));
          });
          if (NOMDNS) return;
        }
      }
      out.push(l);
    });
    var k = out.length; while (k > 0 && out[k - 1].indexOf('a=end-of-candidates') === 0) k--;
    return out.slice(0, k).concat(extra, out.slice(k)).join('\r\n') + '\r\n';
  }
  function packCode(desc) {                  // -> Promise<string>
    var raw = new root.TextEncoder().encode(trimSdp(desc.sdp)), tag = desc.type === 'offer' ? 'O' : 'A';
    if (root.CompressionStream) return pipe(raw, new root.CompressionStream('deflate-raw')).then(function (z) { return tag + 'z' + b64e(z); });
    return Promise.resolve(tag + 'p' + b64e(raw));
  }
  function unpackCode(code) {                // -> Promise<{type, sdp}>
    code = String(code).replace(/\s+/g, '');
    if (!/^[OA][zp][A-Za-z0-9_-]+$/.test(code)) return Promise.reject(new Error('format'));
    var type = code[0] === 'O' ? 'offer' : 'answer', body = b64d(code.slice(2));
    var done = function (u8) { return { type: type, sdp: new root.TextDecoder().decode(u8) }; };
    if (code[1] === 'z') { if (!root.CompressionStream) return Promise.reject(new Error('nodeflate')); return pipe(body, new root.DecompressionStream('deflate-raw')).then(done); }
    return Promise.resolve(done(body));
  }
  function gathered(pc) {
    return new Promise(function (res) {
      if (pc.iceGatheringState === 'complete') { res(); return; }
      var t = root.setTimeout(res, 3000);
      pc.addEventListener('icegatheringstatechange', function () { if (pc.iceGatheringState === 'complete') { root.clearTimeout(t); res(); } });
    });
  }
  function newPc() {
    var pc = new root.RTCPeerConnection({ iceServers: [] });        // same network: no STUN / relay server needed
    pc.oniceconnectionstatechange = function () {
      var st = pc.iceConnectionState;
      if (st === 'failed' && B.mode === 'peer') { peerLost('ice'); return; }
      var er = pair.style.display !== 'none' && pair.querySelector('#bt-err');          // while the pairing window is open: show how far the connection got
      if (er && (st === 'checking' || st === 'failed' || st === 'disconnected')) { er.style.color = st === 'failed' ? '' : '#9cf'; er.textContent = st === 'failed' ? TX.failed : TX.wait + ' (' + st + ')'; }
    };
    return pc;
  }
  function setupChannel(ch) {
    chan = ch;
    ch.onmessage = function (e) { if (ch !== chan) return; var d; try { d = JSON.parse(e.data); } catch (x) { return; } peerGot(d); };
    ch.onopen = function () { if (ch !== chan) return; lastRx = root.performance.now(); B.isHost = pairHost; finishPair('peer'); };
    ch.onclose = function () { if (B.mode === 'peer' && ch === chan) peerLost('close'); };      // (a channel that was replaced meanwhile must not end the new connection)
  }
  var TX = B.ko ? {
    title: '대전 페어링', ai: 'AI와 플레이', back: '뒤로', copy: '복사', copied: '복사됨!', connect: '연결',
    intro: '같은 와이파이(공유기)에 연결된 두 사람이 대전합니다. 같은 브라우저의 다른 창에서 이 화면을 열면 자동으로 연결됩니다.',
    s1: '① 아래 내 코드를 복사해서 상대에게 보내세요', s2: '② 상대가 보낸 코드를 아래 칸에 붙여넣고 "연결"을 누르세요',
    reply: '상대 코드를 받았습니다. 위의 새 코드(답장)를 상대에게 보내세요. 상대가 입력하면 자동으로 시작됩니다.', wait: '연결 중…',
    making: '코드를 만드는 중…', bad: '코드가 올바르지 않습니다. 처음부터 다시 복사해 주세요.', failed: '연결하지 못했습니다. 두 사람이 같은 와이파이에 있는지 확인하세요.', paste: '여기에 붙여넣기'
  } : {
    title: 'Battle pairing', ai: 'Play vs AI', back: 'Back', copy: 'Copy', copied: 'Copied!', connect: 'Connect',
    intro: 'Two players on the same Wi-Fi / router play each other. Two windows of this browser connect by themselves when both show this screen.',
    s1: '1. Copy your code below and send it to the other player', s2: '2. Paste the code they sent into the box below and press "Connect"',
    reply: 'Code received. Send the new code above (the reply) back. The game starts by itself when they enter it.', wait: 'Connecting...',
    making: 'Making the code...', bad: 'That code is not valid. Copy it again from the start.', failed: 'Could not connect. Make sure both players are on the same Wi-Fi.', paste: 'Paste here'
  };
  function codeBox(id, ro) { return '<textarea id="' + id + '" rows="4" ' + (ro ? 'readonly' : 'placeholder="' + TX.paste + '"') + ' spellcheck="false" autocomplete="off"></textarea>'; }
  function copyFrom(btn, ta) {
    ta.focus(); ta.select();
    var ok = false; try { ok = root.document.execCommand('copy'); } catch (e) {}
    if (!ok && root.navigator.clipboard) try { root.navigator.clipboard.writeText(ta.value); ok = true; } catch (e) {}
    btn.textContent = TX.copied; root.setTimeout(function () { btn.textContent = TX.copy; }, 1500);
  }
  // Two windows of the same browser (same page address): they find each other through a BroadcastChannel and connect without any code.
  var bc = null, bcPeer = '', bcTimer = 0, myId = Math.random().toString(16).slice(2) + Date.now().toString(16), bcName = 'polybattle:' + root.location.pathname;
  function stopAuto(keepChannel) { if (bcTimer) { root.clearInterval(bcTimer); bcTimer = 0; } if (!keepChannel && bc) { try { bc.close(); } catch (e) {} bc = null; bcPeer = ''; } }
  function connectBC(peer) {
    if (bcPeer || B.mode === 'peer' || !bc) return;
    bcPeer = peer; stopAuto(true); try { pcon && pcon.close(); } catch (e) {} pcon = null;
    var ch = { readyState: 'open', onmessage: null, onopen: null, onclose: null,
      send: function (str) { try { bc.postMessage({ t: 'd', to: peer, from: myId, d: str }); } catch (e) {} },
      close: function () { if (this.readyState === 'closed') return; this.readyState = 'closed'; try { bc.postMessage({ t: 'bye', to: peer, from: myId }); } catch (e) {} stopAuto(false); } };
    ch.rx = function (str) { if (ch.onmessage) ch.onmessage({ data: str }); };
    ch.lost = function () { if (ch.readyState === 'closed') return; ch.readyState = 'closed'; if (ch.onclose) ch.onclose(); };
    bcLink = ch; setupChannel(ch); ch.onopen();
  }
  var bcLink = null;
  function startAuto() {
    if (!root.BroadcastChannel || bc) return;
    try { bc = new root.BroadcastChannel(bcName); } catch (e) { bc = null; return; }
    bc.onmessage = function (e) {
      var m = e.data; if (!m || (m.to && m.to !== myId) || m.from === myId || m.id === myId) return;
      if (m.t === 'hello') { if (!bcPeer && B.mode !== 'peer' && myId > m.id) { pairHost = true; bc.postMessage({ t: 'link', from: myId, to: m.id }); } }   // the one with the larger id proposes
      else if (m.t === 'link') { if (!bcPeer && B.mode !== 'peer') { pairHost = false; bc.postMessage({ t: 'ok', from: myId, to: m.from }); connectBC(m.from); } }
      else if (m.t === 'ok') connectBC(m.from);
      else if (m.t === 'd' && bcLink && bcPeer === m.from) bcLink.rx(m.d);
      else if (m.t === 'bye' && bcLink && bcPeer === m.from) bcLink.lost();
    };
    var hello = function () { try { bc.postMessage({ t: 'hello', id: myId }); } catch (e) {} };
    hello(); bcTimer = root.setInterval(hello, 700);
  }
  // running away: closing the page / leaving the game tells the other side at once, which then wins
  root.addEventListener('pagehide', function () {
    if (B.mode === 'peer') peerSend({ type: 'p-leave' });
    if (bcLink && bcLink.readyState === 'open') bcLink.close();
  });
  var pairHost = true;       // I made the room (my code was answered) / I started the link between two windows
  var pendingStart = null;
  function closePeer() { try { chan && (chan.onclose = null, chan.close()); } catch (e) {} try { pcon && pcon.close(); } catch (e) {} chan = null; pcon = null; bcLink = null; bcPeer = ''; }
  // ONE window, one room: it shows my code at once (I am the host until I paste somebody else's room code). The pasted code decides the rest:
  // a room code (O...) makes me the guest - my code becomes the reply to send back; a reply code (A...) completes my own room.
  function showPair() {
    pair.style.display = 'flex';
    var q = function (id) { return pair.querySelector(id); };
    pair.innerHTML = '<h2>' + TX.title + '</h2><div><button id="bt-ai">' + TX.ai + '</button></div><p>' + TX.intro + '</p><p>' + TX.s1 + '</p>' + codeBox('bt-mycode', true) +
      '<div><button id="bt-copy">' + TX.copy + '</button></div><p>' + TX.s2 + '</p>' + codeBox('bt-in', false) + '<div class="err" id="bt-err"></div><div><button id="bt-go">' + TX.connect + '</button><button id="bt-back">' + TX.back + '</button></div>';
    var mine = q('#bt-mycode'), err = q('#bt-err'), role2 = 'host', hostPc = null;
    q('#bt-ai').onclick = function () { finishPair('ai'); };
    q('#bt-back').onclick = function () {                        // back to the main screen: nothing is started, nothing stays connected
      closePeer(); stopAuto(false); pendingStart = null; pair.style.display = 'none'; pair.innerHTML = '';
    };
    q('#bt-copy').onclick = function () { copyFrom(this, mine); };
    function say(t, ok) { err.style.color = ok ? '#9cf' : ''; err.textContent = t; }
    pairHost = true; closePeer(); stopAuto(false); startAuto(); mine.value = TX.making;
    hostPc = pcon = newPc(); setupChannel(pcon.createDataChannel('bt'));
    hostPc.createOffer().then(function (o) { return hostPc.setLocalDescription(o); }).then(function () { return gathered(hostPc); }).then(function () { return packCode(hostPc.localDescription); })
      .then(function (c) { if (role2 === 'host') mine.value = c; }).catch(function () { say(TX.failed); });
    q('#bt-go').onclick = function () {
      say('');
      unpackCode(q('#bt-in').value).then(function (d) {
        if (d.type === 'answer') {                                   // somebody answered my room
          if (role2 !== 'host') throw new Error('role');
          return hostPc.setRemoteDescription(d).then(function () { say(TX.wait, true); });
        }
        role2 = 'guest'; pairHost = false; try { hostPc.close(); } catch (e) {}                // somebody else's room: I join it
        chan = null; var pc = pcon = newPc(); pc.ondatachannel = function (e) { setupChannel(e.channel); };
        mine.value = TX.making;
        return pc.setRemoteDescription(d).then(function () { return pc.createAnswer(); }).then(function (a) { return pc.setLocalDescription(a); }).then(function () { return gathered(pc); })
          .then(function () { return packCode(pc.localDescription); }).then(function (c) { mine.value = c; say(TX.reply, true); });
      }).catch(function () { say(TX.bad); });
    };
  }
  function finishPair(mode) {
    B.mode = mode; B.paired = true; pair.style.display = 'none'; B.clear();
    B.opp.over = 0; B.opp.diedMs = null; B.opp.replayed = false; B.opp.snap = null; B.opp.slots = [];
    if (mode === 'ai') { closePeer(); stopAuto(false); startOpponent(); } else if (!bcLink) stopAuto(false);
    B.renderOpp();
    var cb = pendingStart; pendingStart = null; if (cb) cb();
  }
  // the game calls this when START is pressed: the pairing window comes first, the game starts when it is closed
  B.begin = function (cb) {
    if (B.paired) { B.opp.over = 0; B.opp.diedMs = null; B.opp.mute = root.performance.now() + 700; if (B.oppFrame && B.oppFrame.contentWindow) B.oppFrame.contentWindow.postMessage({ type: 'bt-restart' }, '*'); cb(); return; }
    pendingStart = cb; showPair();
  };
  B.unpair = function () { B.paired = false; if (B.mode === 'peer') { B.mode = ''; closePeer(); stopAuto(false); } };
  B.attach = function (api) { B.api = api; };
})(window);
