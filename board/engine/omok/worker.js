// Web Worker around Rapfi (WebAssembly, single thread). Speaks the Gomocup/Piskvork text protocol through Rapfi's stdin/stdout.
//   page -> worker: {id, size, rule (0 free-style | 1 standard), ms, maxDepth, maxNodes, moves:[[x,y],...]}   moves alternate Black, White, ... (the side to move is the engine)
//   worker -> page: {type:'ready', simd} | {id, type:'move', x, y, ms, depth, nodes, eval} | {id, type:'error', msg}
'use strict';
var base = self.location.href.replace(/[?#].*$/, '').replace(/[^\/]*$/, '');
var inst = null, loading = null, cur = null, lastInfo = {};
function hasSimd() {
  try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) { return false; }
}
function out(line) {
  if (self.DEBUG) self.postMessage({ type: "out", line: line });
  if (!line) return;
  var m = /^(\d+),(\d+)$/.exec(line);
  if (m) { if (cur) { var c = cur; cur = null; self.postMessage({ id: c.id, type: 'move', x: +m[1], y: +m[2], ms: Date.now() - c.t0, depth: lastInfo.depth, nodes: lastInfo.nodes, eval: lastInfo.eval }); } return; }
  var d = /^MESSAGE DEPTH (\d+)-(\d+) EV (-?\w+) N (\d+)/.exec(line);
  if (d) { lastInfo = { depth: +d[1], eval: d[3], nodes: +d[4] }; return; }
  if (/^ERROR/.test(line) && cur) { var c2 = cur; cur = null; self.postMessage({ id: c2.id, type: 'error', msg: line }); }
}
function boot() {
  if (loading) return loading;
  var simd = hasSimd();
  loading = new Promise(function (res, rej) {
    try {
      self.importScripts(base + (simd ? 'rapfi-single-simd128.js' : 'rapfi-single.js'));
      self.Rapfi({
        locateFile: function (u) { return base + (/\.data$/.test(u) ? 'rapfi.data' : u); },
        onReceiveStdout: out, onReceiveStderr: function () {}, onExit: function () {}, setStatus: function () {}
      }).then(function (i) { inst = i; self.postMessage({ type: 'ready', simd: simd }); res(i); }, rej);
    } catch (e) { rej(e); }
  });
  return loading;
}
function send(c) { try { inst.sendCommand(c); } catch (er) { if (self.DEBUG) self.postMessage({ type: 'out', line: 'THROW at ' + c + ': ' + er }); throw er; } }
self.onmessage = function (e) {
  var m = e.data;
  if (m.debug) self.DEBUG = true;
  if (m.type === 'init') { boot().catch(function (er) { self.postMessage({ type: 'fail', msg: String(er && er.message || er) }); }); return; }
  boot().then(function () {
    cur = { id: m.id, t0: Date.now() }; lastInfo = {};
    try {
      send('START ' + m.size);
      send('INFO rule ' + (m.rule | 0));
      send('INFO timeout_match 1000000000');
      send('INFO time_left 1000000000');
      send('INFO timeout_turn ' + (m.ms | 0));
      send('INFO max_node ' + (m.maxNodes | 0));
      send('INFO max_depth ' + (m.maxDepth || 99));
      send('INFO thread_num 1');
      send('INFO hash_size ' + (m.hashKB || 32768));
      var n = m.moves.length, lines = ['BOARD'];     // a multi-line command has to be handed over in one piece
      for (var i = 0; i < n; i++) lines.push(m.moves[i][0] + ',' + m.moves[i][1] + ',' + (((n - 1 - i) & 1) ? 1 : 2));
      lines.push('DONE');
      send(lines.join('\n'));
      if (cur) { var c = cur; cur = null; self.postMessage({ id: c.id, type: 'error', msg: 'no move' }); }
    } catch (er) { var c3 = cur; cur = null; self.postMessage({ id: m.id, type: 'error', msg: String(er && er.message || er) }); }
  }, function (er) { self.postMessage({ id: m.id, type: 'error', msg: 'load: ' + (er && er.message || er) }); });
};
