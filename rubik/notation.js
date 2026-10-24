// Cube - move notation: parser for scripts like  y (R U R' U')x2 M' 2Rw  and the naming / resolving of layer turns of box shaped puzzles, plus the little panel under the puzzle.
(function () {
  'use strict';
  const KO = /^ko/i.test(navigator.language || 'ko');
  const FACES = { R: [0, 1], L: [0, -1], U: [1, 1], D: [1, -1], F: [2, 1], B: [2, -1] };       // letter -> [axis, side]
  const POS = ['R', 'U', 'F'], NEG = ['L', 'D', 'B'];
  const SLICE = { M: [0, 'L'], E: [1, 'D'], S: [2, 'F'] };                                        // slice -> [axis, face it follows]
  const ROT = { x: 'R', y: 'U', z: 'F' };

  // ---- text -> flat list of {kind:'face'|'slice'|'rot', ch, lo, hi, wide, q}   (q = quarter turns, clockwise seen from the face: 1, 2, -1)
  function parse(text, mode) {
    const s = String(text).replace(/[’‘`´]/g, "'").replace(/[×\*]/g, 'x');
    let i = 0;
    function ws() { while (i < s.length && /[\s,]/.test(s[i])) i++; }
    function fail(m) { throw new Error(m); }
    function suffix() {
      let q = 1;
      for (;;) {
        const c = s[i];
        if (c === "'") { q = -q; i++; } else if (c === '2') { q *= 2; i++; } else break;
      }
      return q;
    }
    function seq(close) {
      const out = [];
      for (;;) {
        ws();
        if (i >= s.length) { if (close) fail(KO ? '괄호가 닫히지 않았습니다' : 'unclosed bracket'); return out; }
        const c = s[i];
        if (c === ')') { if (!close) fail(KO ? '짝이 없는 ")"' : 'unmatched ")"'); i++; return out; }
        if (c === '(') {
          i++; const inner = seq(true); let rep = 1, inv = false;
          for (;;) {
            if (s[i] === "'") { inv = !inv; i++; } else if (s[i] === 'x' && /\d/.test(s[i + 1] || '')) { i++; let k = ''; while (/\d/.test(s[i] || '')) k += s[i++]; rep *= +k; } else if (/\d/.test(s[i] || '')) { let k = ''; while (/\d/.test(s[i] || '')) k += s[i++]; rep *= +k; } else break;
          }
          if (rep > 200) fail(KO ? '반복 횟수가 너무 큽니다' : 'repeat count too large');
          let one = inner; if (inv) one = inner.slice().reverse().map((t) => Object.assign({}, t, { q: -t.q }));
          for (let r = 0; r < rep; r++) one.forEach((t) => out.push(t));
          continue;
        }
        if (mode === 'geo') {
          const st = i, g = /^(\d*)([A-Za-z]+)(\+\+|--)?/.exec(s.slice(i));
          if (!g) fail((KO ? '알 수 없는 표기: ' : 'unknown move: ') + s.slice(st, st + 4).trim());
          i += g[0].length; let base = g[2], wide = false; if (base.length > 1 && base.slice(-1) === 'w') { base = base.slice(0, -1); wide = true; }
          const q = g[3] ? (g[3] === '++' ? 2 : -2) : suffix();
          if (/[A-Za-z]/.test(s[i] || '') && s[i] !== 'x') fail((KO ? '알 수 없는 표기: ' : 'unknown move: ') + s.slice(st, i + 1));
          out.push({ kind: 'geo', base: base, pre: g[1] ? +g[1] : 0, wide: wide, deep: !!g[3], q: q, txt: s.slice(st, i) });
          continue;
        }
        let cube = 0; while (s[i] === '~') { cube++; i++; }
        const st = i, m = /^(\d+)(?:-(\d+))?/.exec(s.slice(i));
        let lo = 0, hi = 0; if (m) { lo = +m[1]; hi = m[2] ? +m[2] : lo; i += m[0].length; }
        const ch = s[i++]; if (!ch) fail(KO ? '잘못된 표기' : 'bad token');
        let tok;
        if (/[RLUDFB]/.test(ch)) {
          const wide = s[i] === 'w'; if (wide) i++;
          tok = { kind: 'face', ch: ch, wide: wide, lo: lo, hi: hi, explicit: !!m };
        } else if (/[rludfb]/.test(ch)) {
          tok = { kind: 'face', ch: ch.toUpperCase(), wide: true, lo: lo, hi: hi, explicit: !!m };
        } else if (/[MES]/.test(ch)) tok = { kind: 'slice', ch: ch, lo: lo, hi: hi, explicit: !!m };
        else if (/[mes]/.test(ch)) tok = { kind: 'slice', ch: ch.toUpperCase(), fine: true, lo: 0, hi: 0, explicit: false };
        else if (/[xyz]/.test(ch)) tok = { kind: 'rot', ch: ch, lo: 0, hi: 0, explicit: false };
        else fail((KO ? '알 수 없는 표기: ' : 'unknown move: ') + s.slice(st, st + 4).trim());
        tok.q = suffix(); tok.cube = cube;
        if (/[A-Za-z]/.test(s[i] || '') && s[i] !== 'x') fail((KO ? '알 수 없는 표기: ' : 'unknown move: ') + s.slice(st, i + 1));
        out.push(tok);
      }
    }
    return seq(false);
  }

  // ---- a box shaped puzzle: lines = [{axis: 0|1|2, m: layers, moves: [{id, a, b}]}]  (a move turns the layers a..b counted from the positive end)
  // d of a move: +1 = a quarter turn counter-clockwise seen from the positive end of the axis
  function box(lines) {
    const byAxis = {}, where = {};
    lines.forEach((l) => {
      if (!l.moves) { l.m = l.ids.length; l.moves = l.ids.map((id, j) => ({ id: id, a: j + 1, b: j + 1 })); }
      byAxis[l.axis] = l; l.moves.forEach((mv) => { where[mv.id] = { l: l, a: mv.a, b: mv.b }; });
    });
    function cwSign(ch) { return -(FACES[ch][1]); }
    const sfx = (cw, q) => (q === 2 ? '2' : cw ? '' : "'");
    function name(id, d, q) {
      const w = where[id]; if (!w) return null;
      const ax = w.l.axis, m = w.l.m, a = w.a, b = w.b, pos = POS[ax], neg = NEG[ax], cwPos = d === -1, cwNeg = d === 1;
      if (m === 1) return pos + sfx(cwPos, q);
      if (a === 1 && b === m) return ROT_OF[ax] + sfx(cwPos, q);
      if (a === b) {
        if (a === 1) return pos + sfx(cwPos, q);
        if (a === m) return neg + sfx(cwNeg, q);
        if (m % 2 === 1 && m >= 3 && a === (m + 1) / 2) { const sl = ['M', 'E', 'S'][ax], f = SLICE[sl][1]; return sl + sfx(d === cwSign(f), q); }
        if (a - 1 < m - a) return a + pos + sfx(cwPos, q);
        return (m - a + 1) + neg + sfx(cwNeg, q);
      }
      if (a === 1) return (b === 2 ? '' : b) + pos + 'w' + sfx(cwPos, q);
      if (b === m) { const k = m - a + 1; return (k === 2 ? '' : k) + neg + 'w' + sfx(cwNeg, q); }
      return a + '-' + b + pos + sfx(cwPos, q);
    }
    // token -> [{id, d}] (a double turn gives two moves)
    function resolve(t) {
      let ax, A, B, dcw;
      if (t.kind === 'rot') { const f = ROT[t.ch]; ax = FACES[f][0]; if (!byAxis[ax]) throw new Error(KO ? '이 퍼즐에 없는 축: ' + t.ch : 'no such axis: ' + t.ch); A = 1; B = byAxis[ax].m; dcw = cwSign(f); }
      else if (t.kind === 'slice') {
        ax = SLICE[t.ch][0]; if (!byAxis[ax]) throw new Error(KO ? '이 퍼즐에 없는 층: ' + t.ch : 'no such slice: ' + t.ch);
        const m = byAxis[ax].m; if (m < 3 || m % 2 === 0) throw new Error(KO ? '가운데 층이 없습니다 (홀수 크기 큐브만 M E S): ' + (t.fine ? t.ch.toLowerCase() : t.ch) : 'no middle layer (M E S need an odd size): ' + (t.fine ? t.ch.toLowerCase() : t.ch));
        A = B = (m + 1) / 2; dcw = cwSign(SLICE[t.ch][1]);
      } else {
        ax = FACES[t.ch][0]; const side = FACES[t.ch][1], l = byAxis[ax]; if (!l) throw new Error(KO ? '이 퍼즐에 없는 면: ' + t.ch : 'no such face: ' + t.ch);
        let a = 1, b = 1; if (t.explicit) { a = t.wide ? 1 : t.lo; b = t.hi; } else if (t.wide) b = Math.min(2, l.m);
        if (a < 1 || b < a || b > l.m) throw new Error((KO ? '층 번호가 범위를 벗어났습니다: ' : 'layer out of range: ') + tokText(t));
        if (side > 0) { A = a; B = b; } else { A = l.m - b + 1; B = l.m - a + 1; }
        dcw = cwSign(t.ch);
      }
      const l = byAxis[ax];
      let ids = l.moves.filter((mv) => mv.a === A && mv.b === B).map((mv) => mv.id).slice(0, 1);
      if (!ids.length) {
        for (let k = A; k <= B; k++) { const mv = l.moves.find((x) => x.a === k && x.b === k); if (!mv) { ids = null; break; } ids.push(mv.id); }
      }
      if (!ids) throw new Error((KO ? '이 퍼즐에서는 할 수 없는 회전: ' : 'not a move of this puzzle: ') + tokText(t));
      const out = [], reps = Math.abs(t.q), d = t.q < 0 ? -dcw : dcw;
      for (let r = 0; r < reps; r++) ids.forEach((id, k) => out.push({ id: id, d: d, frac: t.fine ? 0.5 : 1, txt: r === reps - 1 && k === ids.length - 1 ? tokText(t) : '' }));
      return out;
    }
    function nameFine(id, d) {          // a 45 degree turn of the middle layer: m e s
      const w = where[id]; if (!w || w.a !== w.b || w.l.m % 2 === 0 || w.l.m < 3 || w.a !== (w.l.m + 1) / 2) return null;
      const sl = ['m', 'e', 's'][w.l.axis], f = SLICE[sl.toUpperCase()][1]; return sl + (d === cwSign(f) ? '' : "'");
    }
    return { example: "R U R' U'", name: name, nameFine: nameFine, resolve: resolve, order: () => 4, has: (id) => !!where[id] };
  }
  const ROT_OF = ['x', 'y', 'z'];
  function tokText(t) { return '~'.repeat(t.cube || 0) + (t.explicit ? t.lo + (t.hi !== t.lo ? '-' + t.hi : '') : '') + (t.kind === 'face' && t.wide ? t.ch + 'w' : t.fine ? t.ch.toLowerCase() : t.ch) + (Math.abs(t.q) === 2 ? '2' : t.q < 0 ? "'" : ''); }
  function resolveAll(bx, text, merge) { if (bx.resolveText) return bx.resolveText(text, !!merge); const out = []; parse(text).forEach((t) => bx.resolve(t).forEach((m) => out.push(m))); return out; }

  // ---- the box of a discrete (sticker permutation) puzzle, or null when it is not one built of axis parallel layers
  function discreteBox(P) {
    if (!P || !P.bands || !P.lines) return null;
    const lines = [], seen = {};
    for (let li = 0; li < P.lines.length; li++) {
      const ax = P.lines[li].axis, a = ax.findIndex((x) => Math.abs(Math.abs(x) - 1) < 1e-9);
      if (a < 0 || Math.abs(ax[a] - 1) > 1e-9 || ax.some((x, k) => k !== a && Math.abs(x) > 1e-9) || seen[a]) return null;
      const bs = P.bands.filter((b) => b.line === li); if (bs.some((b) => !isFinite(b.lo) && !isFinite(b.hi) && bs.length > 1)) return null;
      if (bs.some((b) => b.fn || b.name === 'rex' || b.name === 'cc' || b.name === 'redi')) return null;
      bs.sort((p, q) => (isFinite(q.lo) ? q.lo : -1e9) - (isFinite(p.lo) ? p.lo : -1e9) || q.hi - p.hi);
      seen[a] = 1; lines.push({ axis: a, ids: bs.map((b) => b.idx) });
    }
    return lines.length ? box(lines) : null;
  }

  // ---- the box of a piece engine (heli) puzzle: planes whose turn axes are the coordinate axes, each a cap or slab of layers along its axis; null when not so
  function heliBox(planes, frame) {          // frame: the directions of R, U, F when the puzzle's layers are not along the coordinate axes (windmill, fisher)
    if (!planes || !planes.length) return null;
    const FR = frame || [[1, 0, 0], [0, 1, 0], [0, 0, 1]], dot3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const INF = 1e9, per = [[], [], []];
    for (let p = 0; p < planes.length; p++) {
      const pl = planes[p]; if (pl.sph || !pl.axis || typeof pl.d !== 'number') return null;
      const a = FR.findIndex((f) => Math.abs(Math.abs(dot3(pl.axis, f)) - 1) < 1e-6); if (a < 0) return null;
      const sg = pl.axis[0] * pl.n[0] + pl.axis[1] * pl.n[1] + pl.axis[2] * pl.n[2] > 0 ? 1 : -1, fs = dot3(pl.axis, FR[a]) > 0 ? 1 : -1;          // sg: the cap lies on the + side of the plane normal; fs: the turn axis along the frame direction
      let lo, hi;
      if (sg > 0) { lo = pl.d; hi = pl.hi === undefined ? INF : pl.hi; } else { hi = pl.d; lo = pl.hi === undefined ? -INF : -pl.hi; }
      const nf = dot3(pl.n, FR[a]) > 0 ? 1 : -1; if (nf < 0) { const t = lo; lo = -hi; hi = -t; }          // coordinates along the frame direction
      per[a].push({ id: p, lo: lo, hi: hi, sg: fs });
    }
    const lines = [];
    for (let a = 0; a < 3; a++) {
      if (!per[a].length) continue;
      const cuts = [], top = Math.max.apply(null, per[a].map((q) => q.hi)), bot = Math.min.apply(null, per[a].map((q) => q.lo));          // the faces of a box are not cuts
      per[a].forEach((q) => [q.lo, q.hi].forEach((c) => { if (Math.abs(c) < INF / 2 && Math.abs(c - top) > 1e-6 && Math.abs(c - bot) > 1e-6 && !cuts.some((x) => Math.abs(x - c) < 1e-6)) cuts.push(c); }));
      const m = cuts.length + 1, ge = (t) => cuts.filter((c) => c >= t - 1e-6).length;
      lines.push({ axis: a, m: m, moves: per[a].map((q) => ({ id: q.id, a: q.hi > INF / 2 || Math.abs(q.hi - top) < 1e-6 ? 1 : ge(q.hi) + 1, b: q.lo < -INF / 2 || Math.abs(q.lo - bot) < 1e-6 ? m : ge(q.lo), sg: q.sg })) });
    }
    const bx = box(lines), sgOf = {}; lines.forEach((l) => l.moves.forEach((mv) => { sgOf[mv.id] = mv.sg; }));
    // heli angle (about the plane axis, which may point to the negative end) <-> d of the box (about the positive end)
    bx.dOf = (p, ang) => (ang > 0 ? 1 : -1) * sgOf[p];
    bx.angOf = (p, d) => d * sgOf[p] * Math.PI / 2;
    return bx;
  }

  // ---- geometric notation for the other solids (tetra / octa / dodeca / icosa and the cube turned at corners or edges): a move is named by what its axis goes through:
  // a face (U), an edge (UF: the two faces meeting there) or a corner (UFR: the three faces).  Plain = clockwise seen from outside, one basic step; ' = the other way; 2 = two steps.
  // Edge flips (half turns) need no 2 or prime.  Layers: 2R = the second layer alone (slabs), Rw / 3Rw = the layers together (wide), R++ / R-- = the deepest cap, two steps (megaminx).
  const vdot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const vcross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const vnorm = (u) => { const l = Math.hypot(u[0], u[1], u[2]) || 1; return [u[0] / l, u[1] / l, u[2] / l]; };
  function solidNames(fn) {          // face normals -> names (same order)
    const nF = fn.length, nm = new Array(nF).fill('');
    if (nF === 6) {
      fn.forEach((n, i) => { const a = [0, 1, 2].reduce((m, k) => (Math.abs(n[k]) > Math.abs(n[m]) ? k : m), 0); nm[i] = (n[a] > 0 ? ['R', 'U', 'F'] : ['L', 'D', 'B'])[a]; });
      return { names: nm, rank: ['U', 'D', 'F', 'B', 'R', 'L'] };
    }
    if (nF === 8) {          // FTO: U on top, D opposite; F, L, R around the front; B, BL, BR at the back
      const by = { '+++': 'U', '++-': 'BR', '+-+': 'BL', '+--': 'B', '-++': 'F', '-+-': 'R', '--+': 'L', '---': 'D' };
      fn.forEach((n, i) => { nm[i] = by[n.map((x) => (x > 0 ? '+' : '-')).join('')] || ('F' + i); });
      return { names: nm, rank: ['U', 'F', 'R', 'L', 'BR', 'BL', 'B', 'D'] };
    }
    if (nF === 12) {          // megaminx: U on top, F R BR BL L counter-clockwise round it, the lower ring DR DL DBL DBR B round D
      const ui = fn.reduce((m, n, i) => (n[1] > fn[m][1] + 1e-6 ? i : m), 0), u = fn[ui];
      const ring = fn.map((n, i) => i).filter((i) => i !== ui && Math.abs(vdot(fn[i], u) - 1 / Math.sqrt(5)) < 1e-3);
      let e1 = vnorm([0 - u[0] * u[2], 0 - u[1] * u[2], 1 - u[2] * u[2]]); if (Math.hypot(e1[0], e1[1], e1[2]) < 1e-6 || vdot(e1, e1) < 0.5) e1 = vnorm([1 - u[0] * u[0], -u[1] * u[0], -u[2] * u[0]]);
      const e2 = vcross(u, e1), ang = (i) => Math.atan2(vdot(fn[i], e2), vdot(fn[i], e1));
      ring.sort((p, q) => ang(p) - ang(q));
      const k0 = ring.reduce((m, i, k) => (Math.abs(ang(i)) < Math.abs(ang(ring[m])) - 1e-9 ? k : m), 0), r = ring.map((_, k) => ring[(k0 + k) % 5]);
      const anti = (i) => fn.findIndex((n) => vdot(n, fn[i]) < -1 + 1e-3);
      nm[ui] = 'U'; ['F', 'R', 'BR', 'BL', 'L'].forEach((x, k) => { nm[r[k]] = x; });
      nm[anti(ui)] = 'D'; nm[anti(r[0])] = 'B'; nm[anti(r[1])] = 'DBL'; nm[anti(r[4])] = 'DBR'; nm[anti(r[2])] = 'DL'; nm[anti(r[3])] = 'DR';
      return { names: nm, rank: ['U', 'F', 'R', 'L', 'BL', 'BR', 'DR', 'DL', 'DBL', 'DBR', 'B', 'D'] };
    }
    const ord = fn.map((n, i) => i).sort((p, q) => fn[q][1] - fn[p][1] || fn[q][2] - fn[p][2] || fn[q][0] - fn[p][0]), L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    ord.forEach((i, k) => { nm[i] = L[k] || ('F' + k); });
    return { names: nm, rank: ord.map((i) => nm[i]) };
  }
  // items: [{id, n: outward unit direction, depth (larger = nearer the surface), cap, B: basic step in radians, dn: +1 when the engine axis is n, -1 when it is -n}]
  function geo(items, faceN, o) {
    o = o || {};
    const so = solidNames(faceN), nF = faceN.length, rank = (nm) => so.rank.indexOf(nm);
    const elemOf = (n) => { let mx = -2; faceN.forEach((f) => { mx = Math.max(mx, vdot(f, n)); }); return faceN.map((f, i) => i).filter((i) => vdot(faceN[i], n) > mx - 1e-3); };
    const keyOf = (set) => set.slice().sort((a, b) => a - b).join(',');
    const labelOf = (set) => set.map((i) => so.names[i]).sort((a, b) => rank(a) - rank(b)).join('');
    const groups = {}, byId = {}, rev = {};
    items.forEach((it) => {
      const set = elemOf(it.n), key = keyOf(set); (groups[key] = groups[key] || { label: labelOf(set), set: set, list: [] }).list.push(it); byId[it.id] = it;
    });
    Object.keys(groups).forEach((k) => { groups[k].list.sort((a, b) => b.depth - a.depth); groups[k].list.forEach((it, j) => { it.layer = j; it.group = groups[k]; }); });
    const pyra = o.pyra && nF === 4 ? (function () {          // Pyraminx: U on top, B at the back, L and R in front (counter-clockwise from above: B L R); a tip is lowercase, the layer round it uppercase
      const gs = Object.keys(groups), top = gs.reduce((m, k) => (groups[k].list[0].n[1] > groups[m].list[0].n[1] ? k : m), gs[0]), u = groups[top].list[0].n, res = {}; res[top] = 'U';
      const e1 = vnorm([-u[0] * u[2], -u[1] * u[2], 1 - u[2] * u[2]]), e2 = vcross(u, e1), ang = (k) => Math.atan2(vdot(groups[k].list[0].n, e2), vdot(groups[k].list[0].n, e1));
      const rest = gs.filter((k) => k !== top).sort((a, b) => ang(a) - ang(b)), bk = rest.reduce((m, k, i) => (Math.abs(Math.abs(ang(k)) - Math.PI) < Math.abs(Math.abs(ang(rest[m])) - Math.PI) ? i : m), 0);
      ['B', 'L', 'R'].forEach((x, j) => { res[rest[(bk + j) % 3]] = x; }); return res;
    })() : null;
    if (pyra) Object.keys(pyra).forEach((k) => { groups[k].label = pyra[k]; });
    const orderOf = (it) => Math.max(2, Math.round(2 * Math.PI / it.B));
    Object.keys(groups).forEach((k) => { groups[k].key = k; });
    function norm(sc, ord) { if (ord === 2) return sc ? 1 : 0; let v = ((sc % ord) + ord) % ord; if (v > ord / 2) v -= ord; return v; }
    const suffix = (v, ord) => (ord === 2 ? '' : Math.abs(v) === 1 ? (v > 0 ? '' : "'") : (v > 0 ? '2' : "2'"));
    function nameSteps(id, sCCW) {          // sCCW: steps counter-clockwise seen from outside
      const it = byId[id]; if (!it) return null; const ord = orderOf(it), v = norm(-sCCW, ord); if (!v) return null;
      const g = it.group, k = it.layer, L = g.label, cw = suffix(v, ord);
      if (pyra) return (k === 0 ? L.toLowerCase() : k === 1 ? L : (k === 2 ? '' : k) + L + 'w') + cw;
      const base = k === 0 ? (rev[g.key] || L) : it.cap ? (k === 1 ? '' : k + 1) + L + 'w' : (k + 1) + L;
      return base + cw;
    }
    function segs(base) {          // base -> the set of faces it names, or null
      const names = so.names, res = [];
      (function go(pos, acc) {
        if (res.length) return; if (pos === base.length) { const key = keyOf(acc); if (groups[key]) res.push(key); return; }
        names.forEach((nm, i) => { if (nm && base.startsWith(nm, pos) && acc.indexOf(i) < 0) go(pos + nm.length, acc.concat(i)); });
      })(0, []);
      return res.length ? res[0] : null;
    }
    function resolveTok(t, merge) {
      if (pyra) {
        const up = t.base.toUpperCase(), key = Object.keys(pyra).find((k) => pyra[k] === up), tip = t.base !== up;
        if (!key || !/^[ULRB]$/.test(up) || (t.base.length !== 1)) throw new Error((KO ? '이 퍼즐에 없는 회전: ' : 'not a move of this puzzle: ') + t.txt);
        const list = groups[key].list, it = tip ? list[0] : t.wide ? list[t.pre ? t.pre : 2] : t.pre ? list[t.pre - 1] : list[1];
        if (!it) throw new Error((KO ? '이 퍼즐에서는 할 수 없는 회전: ' : 'not a move of this puzzle: ') + t.txt);
        const ord = orderOf(it), v = norm(t.q, ord); if (!v) return [];
        if (merge) return [{ id: it.id, s: -v, txt: t.txt }];
        const out = []; for (let r = 0; r < Math.abs(v); r++) out.push({ id: it.id, d: (-v > 0 ? 1 : -1) * it.dn, txt: r === Math.abs(v) - 1 ? t.txt : '' }); return out;
      }
      let key = null; if (o.aliases && o.aliases[t.base]) key = segs(o.aliases[t.base]); if (!key) key = segs(t.base);
      if (!key) throw new Error((KO ? '이 퍼즐에 없는 회전: ' : 'not a move of this puzzle: ') + t.txt);
      const g = groups[key], list = g.list; let ids;
      if (t.deep) ids = [list[list.length - 1]];
      else if (t.wide) { const w = t.pre || 2; ids = list[0].cap ? (list[w - 1] ? [list[w - 1]] : null) : list.slice(0, w).length === w ? list.slice(0, w) : null; }
      else if (t.pre) ids = list[t.pre - 1] && (t.pre === 1 || !list[t.pre - 1].cap) ? [list[t.pre - 1]] : null;
      else ids = [list[0]];
      if (!ids || !ids[0]) throw new Error((KO ? '이 퍼즐에서는 할 수 없는 회전: ' : 'not a move of this puzzle: ') + t.txt);
      const out = [];
      ids.forEach((it, k) => {
        const ord = orderOf(it), v = norm(t.q, ord); if (!v) return;
        const last = k === ids.length - 1, sCCW = -v;          // v steps clockwise
        if (merge) out.push({ id: it.id, s: sCCW, txt: last ? t.txt : '' });
        else for (let r = 0; r < Math.abs(v); r++) out.push({ id: it.id, d: (sCCW > 0 ? 1 : -1) * it.dn, txt: last && r === Math.abs(v) - 1 ? t.txt : '' });
      });
      return out;
    }
    if (o.aliases) Object.keys(o.aliases).forEach((ch) => { const k = segs(o.aliases[ch]); if (k && !rev[k]) rev[k] = ch; });
    return {
      example: items.slice(0, 40).filter((it, k) => k % Math.max(1, Math.floor(items.length / 4)) === 0).slice(0, 4).map((it) => nameSteps(it.id, -1)).filter((x) => x).join(' '),
      name: (id, d, q) => (byId[id] ? nameSteps(id, d * byId[id].dn * (q || 1)) : 'M' + id + ((d * (q || 1)) < 0 ? "'" : '')), nameSteps: nameSteps, has: (id) => !!byId[id], order: (id) => (byId[id] ? orderOf(byId[id]) : 4), stepOf: (id) => (byId[id] ? byId[id].B : Math.PI / 2),
      resolveText: (text, merge) => { const out = []; parse(text, 'geo').forEach((t) => resolveTok(t, merge).forEach((m) => out.push(m))); return out; },
    };
  }
  // the corners of the cube as the one-letter names of the Skewb (WCA): U = UBL, R = DBR, L = DFL, B = DBL (F = UFR, D = DFR); the Ivy cube: R = UFR, L = DFL, B = UBL, D = DBR
  const SKEWB_LETTERS = { U: 'UBL', R: 'DBR', L: 'DFL', B: 'DBL', F: 'UFR', D: 'DFR' }, IVY_LETTERS = { R: 'UFR', L: 'DFL', B: 'UBL', D: 'DBR' };

  // a discrete puzzle: every band turns about its axis, the band lies on the side of the axis where its stickers are
  function discreteGeo(P, kind) {
    if (!P || !P.bands || !P.facets || !P.stickers) return null;
    const items = [];
    for (const b of P.bands) {
      let c = 0; b.members.forEach((i) => { c += vdot(P.stickers[i].c, b.axis); }); c /= Math.max(1, b.members.length);
      if (Math.abs(c) < 1e-6 || !b.members.length) continue;          // (a layer through the middle has no outside)
      const dn = c > 0 ? 1 : -1;
      items.push({ id: b.idx, n: b.axis.map((x) => x * dn), depth: Math.abs(c), cap: !(isFinite(b.lo) && isFinite(b.hi)), B: 2 * Math.PI / (b.n || 4), dn: dn });
    }
    if (!items.length) return null;
    return geo(items, P.facets.map((f) => vnorm(f.normal)), { aliases: kind === 'skewb' ? SKEWB_LETTERS : kind === 'ivy' ? IVY_LETTERS : null, pyra: kind === 'tetra' });
  }
  // a piece engine puzzle: planes (caps / slabs about an axis pointing into the cap); B(plane) is the basic step in radians
  function heliGeo(planes, faceN, Bof, kind) {
    const items = [];
    for (let p = 0; p < planes.length; p++) {
      const pl = planes[p]; if (!pl.axis) return null;
      const n = vnorm(pl.sph ? pl.axis : pl.axis);
      items.push({ id: p, n: n, depth: pl.sph ? (pl.sph.r1 !== undefined ? -pl.sph.r1 : 0) : (pl.depth || 0), cap: pl.hi === undefined, B: Bof(p), dn: 1 });
    }
    return geo(items, faceN.map(vnorm), { aliases: kind === 'skewb' ? SKEWB_LETTERS : kind === 'ivy' ? IVY_LETTERS : null });
  }

  // the shared cube: two boxes (A plain, B with a ~ in front) whose layers are planes of the piece engine (a plane may serve a layer of both)
  function sharedBox(planes, n) {
    const per = [];
    planes.forEach((pl, id) => (pl.names || []).forEach((nm) => { per[nm.cube] = per[nm.cube] || {}; const l = (per[nm.cube][nm.ax] = per[nm.cube][nm.ax] || { axis: nm.ax, m: n, moves: [] }); l.moves.push({ id: id, a: n - nm.k, b: n - nm.k }); }));
    for (let c = 0; c < per.length; c++) per[c] = per[c] || {};
    const bx = per.map((o) => box(Object.keys(o).map((k) => o[k]))), first = {};
    planes.forEach((pl, id) => { first[id] = pl.names[0].cube; });
    const nb = {
      example: "L D B ~R ~U", order: () => 4, has: (id) => !!first.hasOwnProperty(id),
      name: (id, d, q) => { const nm = bx[first[id]].name(id, d, q); return nm ? '~'.repeat(first[id]) + nm : null; },
      nameFine: () => null,
      resolve: (t) => { if (!bx[t.cube || 0]) throw new Error((KO ? '이 퍼즐에 없는 큐브: ' : 'no such cube: ') + tokText(t)); return bx[t.cube || 0].resolve(t); },
      dOf: (p, ang) => (ang > 0 ? 1 : -1), angOf: (p, d) => d * Math.PI / 2,
    };
    return nb;
  }

  // ---- the panel under the puzzle: plan (what the solver will do), log (what was turned) and the script input
  function panel(onRun) {
    const el = document.createElement('div'); el.id = 'nt';
    el.innerHTML = '<div id="ntPlan"></div><div id="ntLog"></div><div id="ntRow"><input id="ntIn" type="text" spellcheck="false" autocomplete="off"><button id="ntGo" type="button"></button><span id="ntErr"></span></div>';
    const st = document.createElement('style');
    st.textContent = '#nt{position:fixed;left:0;right:0;bottom:0;padding:4px 10px 6px;font:13px/1.45 Consolas,"Courier New",monospace;color:#cfd8e6;background:#0a0f18;display:none;z-index:5;max-height:34%;overflow:hidden}' +
      '#nt div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#ntPlan{color:#ffd166;display:none}#ntPlan b,#ntLog b{color:#8fa3bf;font-weight:normal;margin-right:6px}#ntLog{direction:rtl;text-align:left}#ntLog span{direction:ltr;unicode-bidi:embed}' +
      '#ntRow{display:none;margin-top:3px;white-space:normal!important}#ntIn{width:min(420px,60%);background:#121a28;color:#e8eef8;border:1px solid #3a4a66;border-radius:3px;padding:2px 6px;font:inherit}#ntGo{margin-left:6px;font:inherit;padding:1px 10px;background:#24324a;color:#e8eef8;border:1px solid #3a4a66;border-radius:3px;cursor:pointer}#ntErr{color:#ff7a7a;margin-left:8px}';
    document.head.appendChild(st); document.body.appendChild(el);
    const $ = (id) => document.getElementById(id), inp = $('ntIn'), err = $('ntErr');
    $('ntGo').textContent = KO ? '실행' : 'Run'; inp.placeholder = KO ? "예: R U R' U' (R2 U)x3 Rw M" : "e.g. R U R' U' (R2 U)x3 Rw M";
    function run() { err.textContent = ''; const r = onRun(inp.value); if (r === true) inp.select(); else if (r) err.textContent = r; }
    $('ntGo').addEventListener('click', run);
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); run(); } });
    inp.addEventListener('keyup', (e) => e.stopPropagation()); inp.addEventListener('keypress', (e) => e.stopPropagation());
    const log = []; let planTxt = '', inputOn = false, enabled = false, rawTxt = null;
    function draw() {
      el.style.display = enabled && (log.length || rawTxt || planTxt || inputOn) ? 'block' : 'none';
      $('ntRow').style.display = inputOn ? 'block' : 'none';
      const p = $('ntPlan'); p.style.display = planTxt ? 'block' : 'none'; p.innerHTML = ''; if (planTxt) { const b = document.createElement('b'); b.textContent = KO ? '해법' : 'Solution'; p.appendChild(b); p.appendChild(document.createTextNode(planTxt)); }
      const l = $('ntLog'); l.innerHTML = ''; const sp = document.createElement('span'); sp.textContent = rawTxt !== null ? rawTxt : log.map((e) => e.n + sfxOf(e.v)).join(' ');
      l.appendChild(sp); l.style.display = log.length || rawTxt ? 'block' : 'none';
    }
    // consecutive turns of one layer merge (in steps, modulo the order of the axis): R R -> R2, R R R -> R', R R' vanishes
    const stepsOf = (sf) => (sf === "'" ? -1 : sf === '2' ? 2 : sf === "2'" ? -2 : 1), sfxOf = (v) => (v === 1 ? '' : v === -1 ? "'" : v === 2 ? '2' : v === -2 ? "2'" : '');
    function push(nm, ord) {
      ord = ord || 4; const m = /^(.*?)(2'|2|')?$/.exec(nm), base = m[1], v = stepsOf(m[2] || ''), last = log[log.length - 1];
      if (last && last.n === base && last.o === ord) { last.v = fold(last.v + v, ord); if (!last.v) log.pop(); } else log.push({ n: base, v: fold(v, ord), o: ord });
      while (log.length > 80) log.shift(); draw();
    }
    return {
      enable: (on, ex) => { enabled = !!on; if (ex) inp.placeholder = (KO ? '예: ' : 'e.g. ') + ex; draw(); }, clear: () => { log.length = 0; planTxt = ''; rawTxt = rawTxt === null ? null : ''; draw(); }, raw: (t) => { rawTxt = t; draw(); }, push: push, plan: (t) => { planTxt = t || ''; draw(); },
      toggleInput: () => { inputOn = !inputOn; draw(); if (inputOn) inp.focus(); return inputOn; }, inputOn: () => inputOn, error: (t) => { err.textContent = t || ''; },
    };
  }

  // Square-1: (x,y) turns the top / bottom layer by x / y sectors (30 degrees on the ordinary puzzle), clockwise seen from above when positive; / is the slice
  function parseSq1(text) {
    const out = [], re = /\s*(?:(\/)|\(?\s*(-?\d+)\s*,\s*(-?\d+)\s*\)?)\s*/y, s = String(text).trim();
    let i = 0; while (i < s.length) {
      re.lastIndex = i; const m = re.exec(s); if (!m || m[0].length === 0) throw new Error((KO ? '알 수 없는 표기: ' : 'unknown move: ') + s.slice(i, i + 6));
      out.push(m[1] ? { slice: true } : { x: +m[2], y: +m[3] }); i = re.lastIndex;
    }
    return out;
  }
  function fold(v, ord) { if (ord === 2) return ((v % 2) + 2) % 2 ? 1 : 0; v = ((v % ord) + ord) % ord; return v > ord / 2 ? v - ord : v; }
  function compact(a) {          // names (or [name, order]) -> one string with the turns of one layer merged
    const out = [];
    a.forEach((e) => {
      const nm = Array.isArray(e) ? e[0] : e, ord = Array.isArray(e) ? e[1] || 4 : 4, m = /^(.*?)(2'|2|')?$/.exec(nm), base = m[1], v = m[2] === "'" ? -1 : m[2] === '2' ? 2 : m[2] === "2'" ? -2 : 1, l = out[out.length - 1];
      if (l && l.n === base && l.o === ord) { l.v = fold(l.v + v, ord); if (!l.v) out.pop(); } else out.push({ n: base, v: fold(v, ord), o: ord });
    });
    return out.map((e) => e.n + (e.v === 1 ? '' : e.v === -1 ? "'" : e.v === 2 ? '2' : e.v === -2 ? "2'" : '')).join(' ');
  }
  // auto-solve pace: a plan of up to 100 moves plays at the normal speed `base` per move; a longer one is sped up so that the whole plan takes as long as 100 moves
  // -> { dur: seconds per move, burst: extra moves to apply at once in this frame when a move is shorter than a frame }
  function pace(total, dt, base) {
    const n = total > 100 ? total : 100, dur = Math.min(base, base * 100 / n), fr = Math.max(dt || 0, 1 / 60), instant = dur < 3 * fr;          // (a move shorter than ~3 frames cannot be animated: no animation, several moves per frame)
    return { dur: instant ? 0.001 : dur, instant: instant, burst: instant ? Math.max(0, Math.ceil(fr / dur) - 1) : 0 };
  }
  // the undo / redo buttons: two translucent rectangles at the top left (k = pixel scale); returns their rectangles [{x,y,w,h,id,on}]
  function undoBtns(ctx, k, canU, canR) {
    const w = 92 * k, h = 26 * k, y = 8 * k, out = [];
    [[KO ? '↶ 되돌리기' : '↶ Undo', canU, 'undo'], [KO ? '↷ 다시 하기' : '↷ Redo', canR, 'redo']].forEach((b, i) => {
      const x = 8 * k + i * (w + 6 * k);
      ctx.save(); ctx.globalAlpha = b[1] ? 1 : 0.4; ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#e8eefc'; ctx.font = 13 * k + 'px system-ui, "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b[0], x + w / 2, y + h / 2); ctx.restore();
      out.push({ x: x, y: y, w: w, h: h, id: b[2], on: !!b[1] });
    });
    return out;
  }
  window.RBNotation = { undoBtns: undoBtns, pace: pace, sharedBox: sharedBox, geo: geo, discreteGeo: discreteGeo, heliGeo: heliGeo, compact: compact, parseSq1: parseSq1, parse: parse, box: box, resolveAll: resolveAll, discreteBox: discreteBox, heliBox: heliBox, panel: panel, tokText: tokText };
})();
