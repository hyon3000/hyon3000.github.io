// Browser-to-browser link for the board games (same idea as the Polycube battle mode, no server):
//  - two windows of the same browser that both show the pairing window connect by themselves (BroadcastChannel)
//  - two browsers on the same network: the host copies its code to the guest, the guest pastes it and sends the reply code back (WebRTC data channel)
// API:  BoardLink.pair({ onOpen(link), onMessage(obj), onClose(), onCancel() })      shows the pairing window
//       (opts.onAI: adds a 'Play vs Computer' button to the window)
//       link = { isHost, send(obj), close() }          BoardLink.active() -> the open link or null       BoardLink.cancel()
(function (root) {
  'use strict';
  var KO = /^ko/i.test(root.navigator.language || 'ko');
  var TX = KO ? {
    title: '대전 상대', ai: '컴퓨터와 플레이', back: '닫기', copy: '복사', copied: '복사됨!', connect: '연결',
    intro: '같은 와이파이(공유기)에 연결된 두 사람이 대전합니다. 같은 브라우저의 다른 창에서 이 화면을 열면 자동으로 연결됩니다.',
    s1: '① 아래 내 코드를 복사해서 상대에게 보내세요', s2: '② 상대가 보낸 코드를 아래 칸에 붙여넣고 "연결"을 누르세요',
    reply: '상대 코드를 받았습니다. 위의 새 코드(답장)를 상대에게 보내세요. 상대가 입력하면 자동으로 시작됩니다.', wait: '연결 중…',
    making: '코드를 만드는 중…', bad: '코드가 올바르지 않습니다. 처음부터 다시 복사해 주세요.', failed: '연결하지 못했습니다. 두 사람이 같은 와이파이에 있는지 확인하세요.', paste: '여기에 붙여넣기'
  } : {
    title: 'Opponent', ai: 'Play vs Computer', back: 'Close', copy: 'Copy', copied: 'Copied!', connect: 'Connect',
    intro: 'Two players on the same Wi-Fi / router play each other. Two windows of this browser connect by themselves when both show this screen.',
    s1: '1. Copy your code below and send it to the other player', s2: '2. Paste the code they sent into the box below and press "Connect"',
    reply: 'Code received. Send the new code above (the reply) back. The game starts by itself when they enter it.', wait: 'Connecting...',
    making: 'Making the code...', bad: 'That code is not valid. Copy it again from the start.', failed: 'Could not connect. Make sure both players are on the same Wi-Fi.', paste: 'Paste here'
  };
  var cur = null, link = null, cbs = null, pc = null, chan = null, bc = null, bcPeer = '', bcTimer = 0, isHost = true, box = null;
  var myId = Math.random().toString(16).slice(2) + Date.now().toString(16), bcName = 'boardlink:' + root.location.pathname;

  function b64e(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64d(t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var s = root.atob(t), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function pipe(u8, stream) { var w = stream.writable.getWriter(); w.write(u8); w.close(); return new root.Response(stream.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  // browsers may hide their address behind a random xxxx.local name; for each such candidate the same port is also offered on 127.0.0.1 and on the address this page was opened from
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
        }
      }
      out.push(l);
    });
    var k = out.length; while (k > 0 && out[k - 1].indexOf('a=end-of-candidates') === 0) k--;
    return out.slice(0, k).concat(extra, out.slice(k)).join('\r\n') + '\r\n';
  }
  function packCode(desc) {
    var raw = new root.TextEncoder().encode(trimSdp(desc.sdp)), tag = desc.type === 'offer' ? 'O' : 'A';
    if (root.CompressionStream) return pipe(raw, new root.CompressionStream('deflate-raw')).then(function (z) { return tag + 'z' + b64e(z); });
    return Promise.resolve(tag + 'p' + b64e(raw));
  }
  function unpackCode(code) {
    code = String(code).replace(/\s+/g, '');
    if (!/^[OA][zp][A-Za-z0-9_-]+$/.test(code)) return Promise.reject(new Error('format'));
    var type = code[0] === 'O' ? 'offer' : 'answer', body = b64d(code.slice(2));
    var done = function (u8) { return { type: type, sdp: new root.TextDecoder().decode(u8) }; };
    if (code[1] === 'z') { if (!root.CompressionStream) return Promise.reject(new Error('nodeflate')); return pipe(body, new root.DecompressionStream('deflate-raw')).then(done); }
    return Promise.resolve(done(body));
  }
  function gathered(p) {
    return new Promise(function (res) {
      if (p.iceGatheringState === 'complete') { res(); return; }
      var t = root.setTimeout(res, 3000);
      p.addEventListener('icegatheringstatechange', function () { if (p.iceGatheringState === 'complete') { root.clearTimeout(t); res(); } });
    });
  }
  function say(t, ok) { var e = box && box.querySelector('.bl-err'); if (e) { e.style.color = ok ? '#9cf' : '#f88'; e.textContent = t; } }
  function newPc() {
    var p = new root.RTCPeerConnection({ iceServers: [] });
    p.oniceconnectionstatechange = function () {
      var st = p.iceConnectionState;
      if (link && st === 'failed') lost();
      else if (!link && (st === 'checking' || st === 'failed' || st === 'disconnected')) say(st === 'failed' ? TX.failed : TX.wait + ' (' + st + ')', st !== 'failed');
    };
    return p;
  }
  function opened(ch, host) {
    if (link) return;
    chan = ch;
    link = { isHost: host, send: function (o) { try { if (ch.readyState === 'open') ch.send(JSON.stringify(o)); } catch (e) {} }, close: function () { teardown(true); } };
    ch.onmessage = function (e) { var d; try { d = JSON.parse(e.data); } catch (x) { return; } if (cbs && cbs.onMessage) cbs.onMessage(d); };
    ch.onclose = function () { lost(); };
    hide(); stopAuto(true);
    if (cbs && cbs.onOpen) cbs.onOpen(link);
  }
  function lost() { if (!link) return; link = null; var c = cbs; teardown(false); if (c && c.onClose) c.onClose(); }
  function teardown(notify) {
    if (notify && bcPeer && bc) { try { bc.postMessage({ t: 'bye', to: bcPeer, from: myId }); } catch (e) {} }
    stopAuto(false);
    try { chan && (chan.onclose = null, chan.close && chan.close()); } catch (e) {}
    try { pc && pc.close(); } catch (e) {}
    chan = null; pc = null; bcPeer = ''; link = null;
  }
  // ---- two windows of one browser
  function stopAuto(keep) { if (bcTimer) { root.clearInterval(bcTimer); bcTimer = 0; } if (!keep && bc) { try { bc.close(); } catch (e) {} bc = null; } }
  function connectBC(peer) {
    if (bcPeer || link || !bc) return;
    bcPeer = peer; stopAuto(true); try { pc && pc.close(); } catch (e) {} pc = null;
    var ch = { readyState: 'open', onmessage: null, onclose: null,
      send: function (str) { try { bc.postMessage({ t: 'd', to: peer, from: myId, d: str }); } catch (e) {} },
      close: function () { this.readyState = 'closed'; } };
    ch.rx = function (str) { if (ch.onmessage) ch.onmessage({ data: str }); };
    ch.lost = function () { if (ch.readyState === 'closed') return; ch.readyState = 'closed'; if (ch.onclose) ch.onclose(); };
    cur = ch; opened(ch, isHost);
  }
  function startAuto() {
    if (!root.BroadcastChannel || bc) return;
    try { bc = new root.BroadcastChannel(bcName); } catch (e) { bc = null; return; }
    bc.onmessage = function (e) {
      var m = e.data; if (!m || (m.to && m.to !== myId) || m.from === myId || m.id === myId) return;
      if (m.t === 'hello') { if (!bcPeer && !link && myId > m.id) { isHost = true; bc.postMessage({ t: 'link', from: myId, to: m.id }); } }     // the larger id proposes and is the host
      else if (m.t === 'link') { if (!bcPeer && !link) { isHost = false; bc.postMessage({ t: 'ok', from: myId, to: m.from }); connectBC(m.from); } }
      else if (m.t === 'ok') connectBC(m.from);
      else if (m.t === 'd' && cur && bcPeer === m.from) cur.rx(m.d);
      else if (m.t === 'bye' && cur && bcPeer === m.from) cur.lost();
    };
    var hello = function () { try { bc.postMessage({ t: 'hello', id: myId }); } catch (e) {} };
    hello(); bcTimer = root.setInterval(hello, 700);
  }
  root.addEventListener('pagehide', function () { if (link) teardown(true); });
  // ---- window
  function hide() { if (box) { box.remove(); box = null; } }
  function show() {
    hide();
    box = root.document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;font:13px/1.45 system-ui,sans-serif;color:#eee';
    box.innerHTML = '<div style="width:min(440px,94vw);max-height:94vh;overflow:auto;background:#262626;border:1px solid #555;border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:8px">' +
      '<h2 style="margin:0 0 4px;font-size:17px">' + TX.title + '</h2>' + (cbs && cbs.onAI ? '<div><button class="bl-ai">' + TX.ai + '</button></div>' : '') + '<p style="margin:0;opacity:.85">' + TX.intro + '</p><p style="margin:4px 0 0">' + TX.s1 + '</p>' +
      '<textarea class="bl-my" rows="4" readonly spellcheck="false" style="width:100%;box-sizing:border-box;background:#111;color:#ddd;border:1px solid #555;border-radius:6px;font:11px monospace"></textarea>' +
      '<div><button class="bl-copy">' + TX.copy + '</button></div><p style="margin:4px 0 0">' + TX.s2 + '</p>' +
      '<textarea class="bl-in" rows="4" placeholder="' + TX.paste + '" spellcheck="false" autocomplete="off" style="width:100%;box-sizing:border-box;background:#111;color:#ddd;border:1px solid #555;border-radius:6px;font:11px monospace"></textarea>' +
      '<div class="bl-err" style="min-height:1.3em"></div><div style="display:flex;gap:8px"><button class="bl-go">' + TX.connect + '</button><button class="bl-back">' + TX.back + '</button></div></div>';
    [].forEach.call(box.querySelectorAll('button'), function (b) { b.style.cssText = 'padding:6px 14px;border-radius:6px;border:1px solid #666;background:#444;color:#eee;cursor:pointer'; });
    root.document.body.appendChild(box);
    var mine = box.querySelector('.bl-my'), role = 'host', hostPc = null;
    var aib = box.querySelector('.bl-ai'); if (aib) aib.onclick = function () { var c = cbs; teardown(false); hide(); if (c && c.onAI) c.onAI(); };
    box.querySelector('.bl-back').onclick = function () { var c = cbs; teardown(false); hide(); if (c && c.onCancel) c.onCancel(); };
    box.querySelector('.bl-copy').onclick = function () {
      var b = this; mine.focus(); mine.select(); var ok = false; try { ok = root.document.execCommand('copy'); } catch (e) {}
      if (!ok && root.navigator.clipboard) try { root.navigator.clipboard.writeText(mine.value); } catch (e) {}
      b.textContent = TX.copied; root.setTimeout(function () { b.textContent = TX.copy; }, 1500);
    };
    isHost = true; startAuto(); mine.value = TX.making;
    hostPc = pc = newPc(); var ch = pc.createDataChannel('bl'); ch.onopen = function () { opened(ch, true); };
    hostPc.createOffer().then(function (o) { return hostPc.setLocalDescription(o); }).then(function () { return gathered(hostPc); }).then(function () { return packCode(hostPc.localDescription); })
      .then(function (c) { if (role === 'host') mine.value = c; }).catch(function () { say(TX.failed); });
    box.querySelector('.bl-go').onclick = function () {
      say('');
      unpackCode(box.querySelector('.bl-in').value).then(function (d) {
        if (d.type === 'answer') { if (role !== 'host') throw new Error('role'); return hostPc.setRemoteDescription(d).then(function () { say(TX.wait, true); }); }
        role = 'guest'; isHost = false; try { hostPc.close(); } catch (e) {}
        var p = pc = newPc(); p.ondatachannel = function (e) { e.channel.onopen = function () { opened(e.channel, false); }; if (e.channel.readyState === 'open') opened(e.channel, false); };
        mine.value = TX.making;
        return p.setRemoteDescription(d).then(function () { return p.createAnswer(); }).then(function (a) { return p.setLocalDescription(a); }).then(function () { return gathered(p); })
          .then(function () { return packCode(p.localDescription); }).then(function (c) { mine.value = c; say(TX.reply, true); });
      }).catch(function () { say(TX.bad); });
    };
  }
  root.BoardLink = {
    pair: function (o) { teardown(false); cbs = o; show(); },
    cancel: function () { teardown(false); hide(); },
    active: function () { return link; }
  };
})(window);
