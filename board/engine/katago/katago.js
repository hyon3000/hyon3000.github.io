/* KataGo for go.html: window.KataGoGo.move(state, level) -> Promise({x,y} | 'pass')
 * state = {size, komi, handicap, moves:[{c:'b'|'w', x, y} | {c, pass:true}], toPlay:'b'|'w'}  (same as engines.js goEngine)
 * The neural net runs in a module Web Worker (js/katago-engine/worker.js = web-katrain's TensorFlow.js KataGo port, MIT); backends: WebGPU -> WASM(SIMD).
 * Everything here is tunable through the constants below. */
(function () {
  var base = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^\/]*$/, '') : ''; })();

  // ------------------------------------------------------------------ configuration
  var NETS = {
    small: { label: 'KataGo b6c96', file: 'models/web-katrain-small.bin.gz', mb: 3.8 },           // g170-b6c96-s175395328 (about 3.8 MB)
    big:   { label: 'KataGo b18c384nbt', parts: ['models/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz.part0', 'models/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz.part1'], mb: 98 }
  };
  // Per level: which net, wall-clock budget per move (ms) and visit cap.  maxVisits is a cap, maxMs the real limit.
  var LEVELS = {
    2: { net: 'small', backend: 'wasm', maxMs: 4000, maxVisits: 1200 },
    // Hard: the big net when WebGPU really works (probed at first use), otherwise the small net with a longer budget
    3: { net: 'big', backend: 'webgpu', maxMs: 12000, maxVisits: 4000,
         cpuFallback: { net: 'small', backend: 'wasm', maxMs: 10000, maxVisits: 6000 } }
  };
  var OPT = { ALLOW_BIG_ON_WASM: false };   // (also settable at runtime: KataGoGo.opt.ALLOW_BIG_ON_WASM = true)
  // true: Hard uses the big net even without WebGPU (about 2-6 visits/s in WASM, 98 MB download)
  var PASS_MIN_MOVES_FACTOR = 1.0;     // never pass before size*factor moves have been played, unless the opponent just passed
  var UNSETTLED_FRACTION = 0.04;       // pass is replaced by a real move while more than this share of the board is still unclear (|ownership| < 0.6)

  // ------------------------------------------------------------------ status
  function status(t) { try { if (typeof window.onEngineStatus === 'function') window.onEngineStatus(t || ''); } catch (e) {} }

  // ------------------------------------------------------------------ rules (same as go.html: no suicide, positional superko, area scoring)
  function Game(n) {
    var nb = [], x, y;
    for (y = 0; y < n; y++) for (x = 0; x < n; x++) { var a = []; if (x > 0) a.push(y * n + x - 1); if (x < n - 1) a.push(y * n + x + 1); if (y > 0) a.push((y - 1) * n + x); if (y < n - 1) a.push((y + 1) * n + x); nb.push(a); }
    this.n = n; this.nb = nb; this.b = new Uint8Array(n * n); this.seen = {}; this.seen[this.key(this.b)] = 1;
  }
  Game.prototype.key = function (b) { return String.fromCharCode.apply(null, b); };
  Game.prototype.group = function (b, p) {
    var c = b[p], st = [p], seen = {}, g = [], libs = {}, nl = 0; seen[p] = 1;
    while (st.length) { var q = st.pop(); g.push(q); var a = this.nb[q]; for (var i = 0; i < a.length; i++) { var r = a[i], v = b[r]; if (v === 0) { if (!libs[r]) { libs[r] = 1; nl++; } } else if (v === c && !seen[r]) { seen[r] = 1; st.push(r); } } }
    return { g: g, libs: nl };
  };
  // returns the new board or null when illegal
  Game.prototype.tryPlay = function (p, c) {
    if (p < 0 || p >= this.n * this.n || this.b[p] !== 0) return null;
    var b = this.b.slice(), o = 3 - c, a = this.nb[p], i;
    b[p] = c;
    for (i = 0; i < a.length; i++) if (b[a[i]] === o) { var gr = this.group(b, a[i]); if (gr.libs === 0) gr.g.forEach(function (q) { b[q] = 0; }); }
    if (this.group(b, p).libs === 0) return null;
    if (this.seen[this.key(b)]) return null;
    return b;
  };
  Game.prototype.play = function (p, c) { var b = this.tryPlay(p, c); if (!b) return false; this.b = b; this.seen[this.key(b)] = 1; return true; };

  function handicapStones(n, h) {                 // identical to go.html's handicapPoints()
    var lo = n === 9 ? 2 : 3, hi = n - 1 - lo, mid = (n - 1) >> 1, P = [];
    var TR = [hi, lo], BL = [lo, hi], BR = [hi, hi], TL = [lo, lo], C = [mid, mid], L = [lo, mid], R = [hi, mid], T = [mid, lo], B = [mid, hi];
    var tbl = { 2: [TR, BL], 3: [TR, BL, BR], 4: [TR, BL, BR, TL], 5: [TR, BL, BR, TL, C], 6: [TR, BL, BR, TL, L, R], 7: [TR, BL, BR, TL, L, R, C], 8: [TR, BL, BR, TL, L, R, T, B], 9: [TR, BL, BR, TL, L, R, T, B, C] };
    (tbl[h] || []).forEach(function (q) { P.push(q[1] * n + q[0]); });
    return P;
  }

  // replays the position; returns {game, boards: [board after each move...], hist: moves for the net}
  function replay(st) {
    var n = st.size, g = new Game(n), ha = st.handicap || 0;
    if (ha >= 2) { handicapStones(n, ha).forEach(function (p) { g.b[p] = 1; }); g.seen = {}; g.seen[g.key(g.b)] = 1; }
    var snaps = [g.b.slice()], hist = [];
    st.moves.forEach(function (m) {
      var c = m.c === 'b' ? 1 : 2;
      if (m.pass) hist.push({ x: -1, y: -1, player: m.c === 'b' ? 'black' : 'white' });
      else { if (!g.play(m.y * n + m.x, c)) { g.b[m.y * n + m.x] = c; } hist.push({ x: m.x, y: m.y, player: m.c === 'b' ? 'black' : 'white' }); }
      snaps.push(g.b.slice());
    });
    return { game: g, snaps: snaps, hist: hist };
  }
  function grid(b, n) { var o = []; for (var y = 0; y < n; y++) { var r = []; for (var x = 0; x < n; x++) { var v = b[y * n + x]; r.push(v === 1 ? 'black' : v === 2 ? 'white' : null); } o.push(r); } return o; }

  // ------------------------------------------------------------------ workers (one per net; the other one is terminated to free memory)
  var cur = null;            // {key, worker, backend, pending:{}, seq}
  var gpuState = null;       // null unknown, true/false after the probe
  var seq = 0;

  function probeGPU() {
    if (gpuState !== null) return Promise.resolve(gpuState);
    var p;
    try { p = (navigator.gpu && navigator.gpu.requestAdapter) ? navigator.gpu.requestAdapter().then(function (a) { return !!a; }) : Promise.resolve(false); } catch (e) { p = Promise.resolve(false); }
    return p.catch(function () { return false; }).then(function (v) { gpuState = v; return v; });
  }

  function fetchNet(net) {
    if (net.file) return Promise.resolve(base + net.file);
    // the big net is stored in <90 MB parts (GitHub file limit); download them, show progress, hand the worker a blob: URL
    var got = 0, lastMb = -1, bufs = [];
    function one(i) {
      if (i >= net.parts.length) return Promise.resolve(URL.createObjectURL(new Blob(bufs, { type: 'application/gzip' })));
      return fetch(base + net.parts[i]).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        if (!r.body || !r.body.getReader) return r.arrayBuffer().then(function (ab) { got += ab.byteLength; bufs.push(ab); return one(i + 1); });
        var rd = r.body.getReader(), chunks = [];
        function pump() { return rd.read().then(function (d) { if (d.done) { bufs.push(new Blob(chunks)); return one(i + 1); } chunks.push(d.value); got += d.value.length; if (Math.floor(got / 2e6) !== lastMb) { lastMb = Math.floor(got / 2e6); status('loading engine ' + net.label + ' (' + (got / 1e6).toFixed(0) + ' / ' + net.mb + ' MB)'); } return pump(); }); }
        return pump();
      });
    }
    return one(0);
  }

  function request(w, msg, timeout) {
    return new Promise(function (res, rej) {
      var id = ++seq; msg.id = id; w.pending[id] = { res: res, rej: rej };
      if (timeout) setTimeout(function () { if (w.pending[id]) { delete w.pending[id]; rej(new Error('timeout')); } }, timeout);
      w.worker.postMessage(msg);
    });
  }

  function killWorker(w) { if (!w) return; try { w.worker.terminate(); } catch (e) {} Object.keys(w.pending).forEach(function (k) { w.pending[k].rej(new Error('worker closed')); }); w.pending = {}; if (w.url && w.url.indexOf('blob:') === 0) try { URL.revokeObjectURL(w.url); } catch (e) {} if (cur === w) cur = null; }

  function getWorker(key, backend) {
    if (cur && cur.key === key && cur.ready) return cur.ready;
    if (cur) killWorker(cur);
    var net = NETS[key], w = { key: key, backend: backend, pending: {}, url: null, worker: null, ready: null };
    cur = w;
    w.ready = (function () {
      status('loading engine ' + net.label + ' (' + net.mb + ' MB)...');
      return fetchNet(net).then(function (url) {
        w.url = url;
        w.worker = new Worker(base + 'js/katago-engine/worker.js', { type: 'module' });
        w.worker.onmessage = function (e) {
          var d = e.data; if (!d || d.id === undefined) return;
          var p = w.pending[d.id]; if (!p) return;
          if (d.type === 'katago:analyze_update') return;
          delete w.pending[d.id];
          if (d.ok) p.res(d); else { var er = new Error(d.error || 'engine error'); er.canceled = !!d.canceled; p.rej(er); }
        };
        w.worker.onerror = function (e) { var m = (e && e.message) || 'worker error'; Object.keys(w.pending).forEach(function (k) { w.pending[k].rej(new Error(m)); }); w.pending = {}; };
        status('initialising ' + net.label + ' (' + backend + ')...');
        return request(w, { type: 'katago:init', modelUrl: url, backend: backend }, 300000);
      }).then(function (r) { w.backend = r.backend; w.model = r.modelName; return w; });
    })();
    w.ready.catch(function () { if (cur === w) { killWorker(w); } });
    return w.ready;
  }

  // ------------------------------------------------------------------ move choice
  function choose(a, rep, st, cfg) {
    var n = st.size, g = rep.game, c = st.toPlay === 'b' ? 1 : 2, mv = a.analysis.moves || [];
    var last = st.moves.length ? st.moves[st.moves.length - 1] : null, oppPassed = !!(last && last.pass);
    function uncertain() {
      var o = a.analysis.ownership; if (!o || !o.length) return 0;
      var k = 0; for (var i = 0; i < o.length; i++) if (Math.abs(o[i]) < 0.6) k++;
      return k / o.length;
    }
    var legalFound = null;
    for (var i = 0; i < mv.length; i++) {
      var m = mv[i];
      if (m.x < 0 || m.y < 0) {
        var early = st.moves.length < n * PASS_MIN_MOVES_FACTOR && !oppPassed;
        var unsettled = !oppPassed && uncertain() > UNSETTLED_FRACTION;
        if (!early && !unsettled) return 'pass';
        continue;                                     // pass not wanted yet: next best
      }
      if (g.tryPlay(m.y * n + m.x, c)) return { x: m.x, y: m.y };
    }
    // nothing legal among the candidates: any legal point by policy order, finally the first empty legal point
    var pol = a.analysis.policy;
    if (pol && pol.length >= n * n) {
      var idx = []; for (var q = 0; q < n * n; q++) idx.push(q);
      idx.sort(function (p1, p2) { return pol[p2] - pol[p1]; });
      for (var j = 0; j < idx.length; j++) if (g.tryPlay(idx[j], c)) return { x: idx[j] % n, y: (idx[j] / n) | 0 };
    }
    for (var p = 0; p < n * n; p++) if (g.tryPlay(p, c)) return { x: p % n, y: (p / n) | 0 };
    return 'pass';                                    // no legal move at all
  }

  function resolveCfg(level) {
    var L = LEVELS[level] || LEVELS[2];
    if (level !== 3) return Promise.resolve({ cfg: L, note: '' });
    if (L.net === 'big' && OPT.ALLOW_BIG_ON_WASM) return probeGPU().then(function (gpu) { return { cfg: { net: 'big', backend: gpu ? 'webgpu' : 'wasm', maxMs: gpu ? L.maxMs : 15000, maxVisits: L.maxVisits }, note: '' }; });
    return probeGPU().then(function (gpu) {
      if (gpu) return { cfg: L, note: '' };
      return { cfg: L.cpuFallback, note: ' (no WebGPU: small net, more search)' };
    });
  }

  function move(st, level) {
    var rep = replay(st), n = st.size;
    return resolveCfg(level).then(function (r) {
      var cfg = r.cfg, net = NETS[cfg.net];
      return getWorker(cfg.net, cfg.backend).then(function (w) {
        if (cfg.net === 'big' && cfg.backend === 'webgpu' && w.backend !== 'webgpu') {            // WebGPU did not really start: go to the small net
          gpuState = false; killWorker(w); return move(st, level);
        }
        status(net.label + ' (' + w.backend + ') thinking...');
        var t0 = performance.now(), hist = rep.hist, k = hist.length;
        var req = {
          type: 'katago:analyze', modelUrl: w.url, backend: cfg.backend === 'webgpu' ? 'webgpu' : 'wasm',
          board: grid(rep.snaps[k], n),
          previousBoard: k >= 1 ? grid(rep.snaps[k - 1], n) : undefined,
          previousPreviousBoard: k >= 2 ? grid(rep.snaps[k - 2], n) : undefined,
          currentPlayer: st.toPlay === 'b' ? 'black' : 'white', moveHistory: hist,
          komi: st.komi, rules: 'chinese',
          visits: cfg.maxVisits, maxTimeMs: cfg.maxMs, topK: 12, analysisPvLen: 0, wideRootNoise: 0.02, reuseTree: false
        };
        return request(w, req, cfg.maxMs + 120000).then(function (a) {
          var res = choose(a, rep, st, cfg), dt = (performance.now() - t0) / 1000;
          window.__katagoLast = { net: cfg.net, backend: a.backend, visits: a.analysis.rootVisits, secs: dt, winrate: a.analysis.rootWinRate, score: a.analysis.rootScoreLead, move: res };
          status(net.label + ' (' + a.backend + '): ' + a.analysis.rootVisits + ' visits, ' + dt.toFixed(1) + ' s' + r.note);
          return res;
        });
      });
    });
  }

  window.KataGoGo = { move: move, config: { NETS: NETS, LEVELS: LEVELS }, opt: OPT, reset: function () { killWorker(cur); }, _replay: replay };
})();
