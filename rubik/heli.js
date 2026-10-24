// Helicopter cube page: depth-buffered WebGL drawing of the 45 rigid pieces, free-angle dragging of a prism (a drag snaps to a half turn or to the 70.53 degree jumbling turn),
// scramble with half turns, auto solve (replays the history backwards) and hint.
(function () {
  'use strict';
  const KO = /^ko/i.test(navigator.language || 'ko'), HC = window.HELI, DEG = Math.PI / 180, HALFPI = Math.PI / 2, DC = 6.5;
  const QN = new URLSearchParams(location.search).get('n'), NN = QN !== null && isFinite(+QN) ? Math.max(1, Math.floor(+QN)) : 3;     // size n of the edge-turning cube (2 = Little Chop, 3 = Helicopter Cube)
  const SH = (function () { const q = new URLSearchParams(location.search).get('s'); return q === 'tetra' || q === 'octa' || q === 'dodeca' || q === 'dodecaet' || q === 'icosaet' || q === 'octact' || q === 'icosact' || q === 'dodecaft' || q === 'cuboidff' || q === 'cuboidx' || q === 'starft' || q === 'starct' || q === 'skewbult' || q === 'qjdodeca' || q === 'cubemix' || q === 'cubefisher' || q === 'ccclover' || q === 'cccurvy' || q === 'cubewindmill' || q === 'cubemirror' || q === 'cubeaxis' || q === 'cubefused' || q === 'cubeshared' ? q : 'cube'; })();           // the solid: the cube (ET: edge turning) or the tetrahedron (ET)
  const ABC = (new URLSearchParams(location.search).get('abc') || '1,1,2').split(',').map((x) => Math.max(1, Math.floor(+x) || 1)), ISCUB = SH === 'cuboidff' || SH === 'cuboidx', ISFZ = SH === 'cubefused', ISSH = SH === 'cubeshared', FZ = new URLSearchParams(location.search).get('fz') || (ISSH ? '2.2.2' : '1.1.1.2.2.2'), FZN = ISSH ? FZ.split('_').reduce((a, g) => a.concat(g.split('.').map((x) => Math.round(+x) || 0)), []) : FZ.split('_').reduce((a, g) => { const v = g.split('.').map((x) => parseFloat(x.replace(/p/g, '.'))); return a.concat([(v[0] - 1 + v[3]) / 2, (v[1] - 1 + v[4]) / 2, (v[2] - 1 + v[5]) / 2, v[3] - v[0] + 1, v[4] - v[1] + 1, v[5] - v[2] + 1]); }, []), NX = ISFZ || ISSH ? [NN].concat(FZN) : ISCUB ? ABC : NN;          // the fused cube: n and the fused blocks (cx.cy.cz.lx.ly.lz joined by _, a decimal point is written p)          // the extended cuboid: sizes a,b,c
  const NP = ISCUB || NN >= 2 ? HC.config(NX, SH).planes.length : 0;
  const JANG = SH === 'tetra' || ISCUB ? '90' : SH === 'dodeca' || SH === 'dodecaft' ? '72' : (SH === 'dodecaet' || SH === 'icosaet') ? '' : (SH === 'octact' || SH === 'icosact') ? '180' : '70.53';
  const cv = document.getElementById('app'), ctx = cv.getContext('2d');
  const TX = KO ? { name: SH === 'cuboidx' ? ABC.join('×') + ' 익스텐디드 큐보이드' : SH === 'cuboidff' ? ({ '1,1,2': '얼간이큐브', '1,3,3': '플로피큐브', '2,2,3': '슬림타워(2*2*3)', '2,2,4': '슬림타워(2*2*4)' }[ABC.join(',')] || ABC.join('×') + ' 풀리펑셔널 큐보이드') : SH === 'dodecaft' ? '정십이면체FT (n=' + NN + ')' : SH === 'octact' ? '정팔면체CT (n=' + NN + ')' : SH === 'icosact' ? '정이십면체CT (n=' + NN + ')' : SH === 'dodecaet' ? (NN === 2 ? '빅촙' : '정십이면체ET (n=' + NN + ')') : SH === 'icosaet' ? '정이십면체ET (n=' + NN + ')' : SH === 'dodeca' ? '정십이면체FT-Deepcut (n=' + NN + ')' : SH === 'octa' ? '정팔면체ET (n=' + NN + ')' : SH === 'tetra' ? (NN === 2 ? '피라몰픽스' : '정사면체ET (n=' + NN + ')') : NN === 2 ? '리틀촙' : NN === 3 ? '헬리콥터큐브' : '정육면체ET (n=' + NN + ')', moves: '이동', time: '시간', best: '최고', solved: '완성!', newRec: '신기록!', again: '새 게임 (F2)', locked: '조각이 걸려 있어 이 면은 돌릴 수 없습니다', detach: '내부면 결합이 끊겨 본체가 갈라지므로 돌릴 수 없습니다', cover: '스티커 면이 다른 셀의 내부(검은) 면에 닿게 되어 돌릴 수 없습니다', stuck: '이 층은 90도로 돌리면 걸립니다 (180도만 가능)', none: '이 조각은 돌릴 수 있는 면이 없습니다', next: '다음 수', hintTxt: '빈 곳을 끌면 시점 회전 · 조각을 끌어 층 돌리기 · ' + (SH === 'cuboidff' ? '회전축은 층의 가운데를 지남. 모든 층이 90도로 돌지만 직사각형 층은 모양을 변형하고, 칸이 어긋나면 다른 층이 걸림(점블링). 내부면끼리의 결합으로 본체가 둘로 갈라지면 불가' : SH === 'dodeca' || SH === 'dodecaft' ? '72도씩 돌림' : '기본은 180도, ' + (JANG ? JANG + '도로' : '선이 맞는 각도로') + ' 돌리면 모양이 변형됨'), scr: '섞는 중...', free: '돌릴 수 있는 면' }
    : { name: SH === 'cuboidx' ? ABC.join('×') + ' Extended Cuboid' : SH === 'cuboidff' ? ({ '1,1,2': 'Boobcube', '1,3,3': 'Floppy Cube', '2,2,3': 'Slim Tower (2*2*3)', '2,2,4': 'Slim Tower (2*2*4)' }[ABC.join(',')] || ABC.join('×') + ' Fully Functional Cuboid') : SH === 'dodecaft' ? 'Dodecahedron FT (n=' + NN + ')' : SH === 'octact' ? 'Octahedron CT (n=' + NN + ')' : SH === 'icosact' ? 'Icosahedron CT (n=' + NN + ')' : SH === 'dodecaet' ? (NN === 2 ? 'Big Chop' : 'Dodecahedron ET (n=' + NN + ')') : SH === 'icosaet' ? 'Icosahedron ET (n=' + NN + ')' : SH === 'dodeca' ? 'Dodecahedron FT-Deepcut (n=' + NN + ')' : SH === 'octa' ? 'Octahedron ET (n=' + NN + ')' : SH === 'tetra' ? (NN === 2 ? 'Pyramorphix' : 'Tetrahedron ET (n=' + NN + ')') : NN === 2 ? 'Little Chop' : NN === 3 ? 'Helicopter Cube' : 'Cube ET (n=' + NN + ')', moves: 'Moves', time: 'Time', best: 'Best', solved: 'SOLVED!', newRec: 'New best!', again: 'New game (F2)', locked: 'A piece is in the way - this prism is locked', detach: 'The turn would split the body (inner-face bonds break) - not possible', cover: 'A sticker face would touch an inner face - not possible', stuck: 'This layer jams at 90 degrees (only 180 degrees)', none: 'This piece has no free prism to turn', next: 'Next move', hintTxt: 'Drag empty space to rotate the view · drag a piece to turn its layer · ' + (SH === 'cuboidff' ? 'every axis goes through the middle of the layer; every layer turns by 90 degrees, a rectangular one deforms the shape and if the cells end up off the lattice the other layers jam (jumbling); a turn that splits the body in two (only inner-against-inner faces hold it together) is not possible' : SH === 'dodeca' || SH === 'dodecaft' ? 'turns of 72 degrees' : '180 degrees normally, ' + (JANG ? 'a ' + JANG + ' degree turn' : 'a turn that lines the cuts up') + ' deforms the shape'), scr: 'Scrambling...', free: 'Free prisms' };
  const SPN = { starft: ['정십이면체FT-starminx', 'Dodecahedron FT-starminx', '스타밍크스FT', 'Starminx FT'], starct: ['정십이면체CT-starminx', 'Dodecahedron CT-starminx', '스타밍크스CT', 'Starminx CT'], skewbult: ['정십이면체FT-skewb ultimate', 'Dodecahedron FT-skewb ultimate', '스큐브얼티밋', 'Skewb Ultimate'], qjdodeca: ['정십이면체FT-QJ', 'Dodecahedron FT-QJ', '큐제이', 'QJ Dodecahedron'], cubemix: ['정육면체FT-mixup', 'Cube FT-mixup', '믹스업큐브', 'Mixup Cube'], cubefisher: ['정육면체FT-fisher', 'Cube FT-fisher', '피셔큐브', 'Fisher Cube'], cubewindmill: ['정육면체FT-windmill', 'Cube FT-windmill', '윈드밀큐브', 'Windmill Cube'], cubemirror: ['정육면체FT-mirror', 'Cube FT-mirror', '미러큐브', 'Mirror Cube'], cubeaxis: ['정육면체CT-axis', 'Cube CT-axis', '액시스큐브', 'Axis Cube'], cubefused: ['정육면체CT-fused', 'Cube CT-fused', '퓨즈드큐브', 'Fused Cube'], cubeshared: ['정육면체CT-shared', 'Cube CT-shared', '쉐어드큐브', 'Shared Cube'] }[SH];          // the special solids; n = 2 (mixup / fisher cube: n = 3) is the named original
  const SPN0 = { starft: 2, starct: 2, skewbult: 2, qjdodeca: 2, cubemix: 3, cubefisher: 3, cubewindmill: 3, cubemirror: 3, cubeaxis: 3, cubefused: 3, cubeshared: 3 }[SH];
  if (SPN) {
    TX.name = (SH === 'cubefused' ? NN === 3 && FZ === '1.1.1.2.2.2' : SH === 'cubeshared' ? NN === 3 && FZ === '2.2.2' : NN === SPN0) ? SPN[KO ? 2 : 3] : SPN[KO ? 0 : 1] + ' (n=' + NN + (SH === 'cubefused' ? ', ' + FZ.split('_').map((g) => '(' + g.split('.').map((x) => x.replace(/p/g, '.')).join(',') + ')').join('') : SH === 'cubeshared' ? ', ' + FZ.split('_').map((g) => '(' + g.split('.').join(',') + ')').join('') : '') + ')';
    const hn = { starft: ['면을 끌어 72도씩 돌립니다', 'drag a face to turn it by 72 degrees'], starct: ['꼭짓점 쪽 조각을 끌어 120도씩 돌립니다', 'drag a corner to turn it by 120 degrees'], skewbult: ['조각을 끌어 퍼즐의 절반을 120도씩 돌립니다', 'drag a piece to turn half of the puzzle by 120 degrees'],
      qjdodeca: ['층을 90도 단위로 돌릴 수 있고 모양이 변형됩니다 (점블링: 선이 어긋나면 다른 층이 걸림)', 'layers turn in steps of 90 degrees and deform the solid (jumbling: layers jam when the cuts do not line up)'], cubemix: ['안쪽 층이 √2배 두꺼워 45도 단위로 돌릴 수 있고 선이 어긋나면 다른 층이 걸립니다 (점블링)', 'the inner layers are sqrt2 thicker, so layers turn in steps of 45 degrees; layers jam when the cuts do not line up (jumbling)'],
      cubeshared: ['두 큐브가 겹친 칸의 조각을 함께 씁니다 · 겹친 칸이 겹친 칸으로 가는 돌림만 가능', 'two cubes share the pieces of their overlap · only turns that keep the shared cells shared'],
      cubefused: ['몇 칸이 한 덩어리로 붙어 있어서, 그 덩어리를 가르는 층은 돌릴 수 없고 덩어리 전체를 감싸는 여러 층을 한꺼번에 돌릴 수 있습니다', 'some cells are fused into one piece: a layer that would cut the piece cannot turn, but the layers that hold it as a whole turn together'],
      cubeaxis: ['보통 3x3 기구에 바깥 큐브가 몸대각선을 축으로 60도 돌아가 있어 층을 돌릴 때마다 모양이 변합니다. 45도 단위로도 돌 수 있고(점블링) 90도가 아니면 조각이 다른 층을 가로질러 그 층들이 걸립니다', 'an ordinary cube mechanism inside an outer cube turned by 60 degrees about the body diagonal: the shape changes with every layer turn; a layer also turns in 45 degree steps (jumbling) and when it is not at a multiple of 90 degrees its pieces cut the other layers, which jam'],
      cubemirror: ['층 두께가 1 : 2 : … : 2 : 3으로 달라 돌릴 때마다 모양이 변합니다. 모든 면이 회색이므로 다시 정육면체가 되면 완성입니다', 'the layers have the thicknesses 1 : 2 : ... : 2 : 3, so the shape changes with every turn; every face is grey, the cube is solved when it is a cube again'],
      cubewindmill: ['세로 절단면이 풍차 모양(약 33.7도 기울기)으로 놓여 옆면은 한쪽 칸 폭이 0이고 반대쪽이 두 배이며 모양이 변형됩니다 (점블링)', 'the vertical cuts form a pinwheel (tilted by about 33.7 degrees): on a side face one cell has no width and the opposite one is twice as wide; the cube deforms (jumbling)'],
      cubefisher: ['세로 절단면이 45도 돌려져 있어 세로 층은 면 대각선 축으로 돌며 모양이 변형됩니다 (점블링)', 'the vertical cuts are turned by 45 degrees: the vertical layers turn about the face diagonals and deform the cube (jumbling)'] }[SH];
    TX.hintTxt = (KO ? '빈 곳을 끌면 시점 회전 · 조각을 끌어 층 돌리기 · ' : 'Drag empty space to rotate the view · drag a piece to turn its layer · ') + hn[KO ? 0 : 1];
  }
  if (SH === 'ccclover' || SH === 'cccurvy') TX.name = NN === 2 ? (SH === 'ccclover' ? (KO ? '클로바큐브' : 'Clover Cube') : (KO ? '커비큐브' : 'Curvy Cube')) : (KO ? '정육면체ET-' : 'Cube ET-') + (SH === 'ccclover' ? 'clover' : 'curvy') + ' (n=' + NN + ')';
  const COL = HC.config(ISCUB || ISFZ || ISSH ? NX : Math.max(2, NN), SH).colours, INNER = '#0a0d14';     // tag = face of the solid
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function fmtTime(s) { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }
  function rnd() { return Math.random(); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  const G = { S: HC.create(NX, SH), moves: 0, time: 0, started: false, mode: 'play', vis: null, queue: [], auto: false, hint: null, msg: '', msgT: 0, animScr: lsGet('rubik_anim') !== '0', autoScr: lsGet('rubik_autoscr') !== '0', best: null, newRec: false, cheated: false };
  const V = { yaw: 0.6, pitch: 0.5, M: null, drag: null, cw: 0, ch: 0, dpr: 1, piece: null };
  const BEST_KEY = (SH === 'cubefused' ? 'cubefused_best_' + FZ + '_' : SH === 'cubeshared' ? 'cubeshared_best_' + NN + '_' + FZ + '_' : SH === 'ccclover' || SH === 'cccurvy' || SPN ? SH + '_best_' : SH === 'tetra' ? 'tetraet_best_' : SH === 'octa' ? 'octaet_best_' : SH === 'dodeca' ? 'dodecadc_best_' : SH === 'dodecaet' ? 'dodecaet_best_' : SH === 'icosaet' ? 'icosaet_best_' : SH === 'dodecaft' ? 'dodecaft_best_' : ISCUB ? SH + '_best_' + ABC.join('x') + '_' : SH === 'octact' ? 'octact_best_' : SH === 'icosact' ? 'icosact_best_' : 'heli_best_') + NN;
  try { G.best = JSON.parse(lsGet(BEST_KEY) || 'null'); } catch (e) { G.best = null; }
  function say(t, s) { G.msg = t; G.msgT = (s || 2.4); }
  function setAuto(on) { G.auto = !!on; G.planShown = false; G.autoTotal = 0; if (!on) NT.plan(''); try { window.parent.postMessage({ rb: 'autoState', on: G.auto }, '*'); } catch (e) {} }

  /* ---------- moves ---------- */
  // G.vis = the visual extra rotation x (about the axis of plane p) of the pieces in set, on top of the state; it relaxes to 0
  let NB = null;
  const NT = window.RBNotation.panel(function (text) { return runNotation(text); });
  function makeNB(S) {          // the notation of the puzzle: layers of a box (R U F ...), or what the axes go through (face, edge, corner)
    const R = window.RBNotation, pl = S.cfg.planes, R2 = Math.SQRT1_2, ST = SH === 'dodeca' || SH === 'dodecaft' || SH === 'starft' ? 2 * Math.PI / 5 : SH === 'starct' || SH === 'skewbult' ? 2 * Math.PI / 3 : SH === 'cube' || SH === 'octa' || SH === 'dodecaet' || SH === 'icosaet' || SH === 'octact' || SH === 'icosact' || SH === 'ccclover' || SH === 'cccurvy' ? Math.PI : HALFPI;
    let nb = null;
    if (SH === 'cubeshared') nb = R.sharedBox(pl, S.cfg.n);
    else if (SH === 'cubewindmill') nb = R.heliBox(pl, [[3, 0, -2], [0, 1, 0], [2, 0, 3]].map((v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }));
    else if (SH === 'cubefisher') nb = R.heliBox(pl, [[R2, 0, R2], [0, 1, 0], [-R2, 0, R2]]);
    else if (SH === 'ccclover' || SH === 'cccurvy' || SH === 'cube' || SH === 'octa' || SH === 'dodeca' || SH === 'dodecaft' || SH === 'dodecaet' || SH === 'icosaet' || SH === 'octact' || SH === 'icosact' || SH === 'starft' || SH === 'starct' || SH === 'skewbult') nb = null;
    else nb = R.heliBox(pl);
    if (!nb) nb = R.heliGeo(pl, S.cfg.faceN, () => ST, SH === 'skewbult' ? 'skewb' : '');
    return nb;
  }
  function ordOf(p) { return NB && NB.order ? NB.order(p) : 4; }
  function moveText(mv) {
    if (NB && NB.nameSteps) { const B = NB.stepOf(mv.p), k = Math.round(mv.a / B); if (NB.has(mv.p) && k && Math.abs(mv.a - k * B) < 1e-4) { const nm = NB.nameSteps(mv.p, k); if (nm) return nm; } return desc(mv); }
    const k = Math.round(mv.a / (HALFPI / 2));
    if (NB && NB.has(mv.p) && Math.abs(mv.a - k * HALFPI / 2) < 1e-4) {
      if (k % 2) return NB.nameFine(mv.p, NB.dOf(mv.p, k > 0 ? 1 : -1)) || desc(mv);
      const r = ((k / 2 % 4) + 4) % 4; if (r) return NB.name(mv.p, NB.dOf(mv.p, r === 3 ? -1 : 1), r === 2 ? 2 : 1);
    }
    return desc(mv);
  }
  function startMove(mv, src, dur, txt) {
    const set = HC.members(G.S, mv.p); if (!set) { if (src === 'user' || src === 'nota') say(TX.locked); return false; }
    const x0 = (G.vis && G.vis.live && G.vis.p === mv.p ? G.vis.x : 0) - mv.a;
    if (!HC.apply(G.S, mv)) { if (src === 'user') say(G.S.fail === 'detach' ? TX.detach : TX.locked); return false; }          // (a fully functional cuboid: the turn would cut a cell off)
    G.vis = { p: mv.p, set: set, x: x0, x0: x0, t: 0, dur: dur || 0.2 + 0.1 * Math.min(1, Math.abs(mv.a) / Math.PI), src: src };
    if (src === 'user' || src === 'nota') { G.moves++; G.started = true; }
    if (src !== 'scr' && txt !== '') NT.push(txt || moveText(mv), ordOf(mv.p));
    return true;
  }
  function enqueue(mv, src, dur, txt) { G.queue.push({ mv: mv, src: src, dur: dur, txt: txt }); }
  function busy() { return (G.vis && !G.vis.live) || G.queue.length; }
  function userMove(mv) {
    if (G.mode === 'solved') return false;
    if (G.auto) setAuto(false);
    G.hint = null;
    if (busy()) { if (G.queue.length < 3) enqueue(mv, 'user'); return true; }
    return startMove(mv, 'user');
  }
  function undo() { if (G.mode === 'solved' || busy() || !G.S.hist.length) return; startMove(HC.inverse(G.S.hist[G.S.hist.length - 1]), 'undo'); G.S.hist.pop(); G.S.hist.pop(); }
  // Extra solvers that know nothing of the scramble: window.HSOLVERS = [{ match(shape, cfg) -> bool, next(S, G) -> {p, a} | 'wait' | null (solved) | undefined (not handled), plan(S) -> [{p, a}...] | null }]; a move they return is applied as it is (the history is not unwound)
  function extSolver() { return (window.HSOLVERS || []).find((s) => { try { return s.match(SH, G.S.cfg); } catch (e) { return false; } }); }
  function nextSolveMove() { const X = extSolver(); if (X) { const r = X.next(G.S, G); if (r === 'wait') return r; if (r) { if (G.planWant) { G.planWant = false; showPlan(); } return Object.assign({ ext: true }, r); } if (r === null) return null; } const h = G.S.hist; return h.length ? HC.inverse(h[h.length - 1]) : null; }
  function desc(mv) { return '#' + (mv.p + 1) + ' ' + (Math.abs(Math.abs(mv.a) - Math.PI) < 1e-6 ? '180°' : (mv.a > 0 ? '+' : '-') + Math.abs(Math.round(mv.a / DEG * 100) / 100) + '°'); }
  function checkSolved() {
    if (G.mode !== 'play' || !(G.started || G.cheated) || !HC.isSolved(G.S)) return;
    G.S.hist = []; G.mode = 'solved'; setAuto(false);
    if (!G.cheated && G.moves > 0) {
      const b = G.best;
      if (!b || G.moves < b.moves || (G.moves === b.moves && G.time < b.time)) { G.best = { moves: G.moves, time: G.time }; G.newRec = true; lsSet(BEST_KEY, JSON.stringify(G.best)); }
    }
  }
  function update(dt) {
    if (G.mode === 'play' && G.started) G.time += dt;
    if (G.msgT > 0) G.msgT -= dt;
    const v = G.vis;
    if (v && !v.live) {
      v.t += dt; const e = 1 - ease(Math.min(1, v.t / v.dur)); v.x = v.x0 * e;
      if (v.t >= v.dur) { G.vis = null; if (v.src !== 'scr' && !(v.src === 'nota' && G.queue.length)) checkSolved(); }
    }
    if (!G.vis && G.queue.length && G.mode !== 'solved') { const q = G.queue.shift(); startMove(q.mv, q.src, q.dur, q.txt); }
    if (!G.vis && !G.queue.length) {
      if (G.mode === 'scramble') G.mode = 'play';
      else if (G.mode === 'play') {
        if (G.hint) { G.hint.t += dt; if (G.hint.t >= 0.7) { const h = G.hint; G.hint = null; G.cheated = true; if (h.mv.ext) startMove(h.mv, 'hint', 0.35); else if (G.S.hist.length) { startMove(h.mv, 'hint', 0.35); G.S.hist.pop(); G.S.hist.pop(); } } }
        else if (G.auto) { const nm = nextSolveMove(); if (!nm) setAuto(false); else if (nm !== 'wait') { G.cheated = true; if (!G.planShown) { G.planShown = true; showPlan(); } if (!G.autoTotal) { let pl = null; try { const X = extSolver(); pl = X && X.plan ? X.plan(G.S) : null; } catch (e) {} G.autoTotal = pl ? pl.length : G.S.hist.length + 1; } const pc = window.RBNotation.pace(G.autoTotal, dt, nm.dur || 0.25); startMove(nm, 'auto', pc.dur); if (!nm.ext) { G.S.hist.pop(); G.S.hist.pop(); for (let b = 0; b < pc.burst; b++) { const n2 = nextSolveMove(); if (!n2 || n2 === 'wait') break; startMove(n2, 'auto', 0.001, ''); if (!n2.ext) { G.S.hist.pop(); G.S.hist.pop(); } } } else for (let b = 0; b < Math.max(nm.burst || 0, pc.burst); b++) { const n2 = nextSolveMove(); if (!n2 || n2 === 'wait') break; startMove(n2, 'auto', 0.001, ''); } } }
      }
    }
  }
  function newGame(opt) {
    opt = opt || {};
    G.S = HC.create(NX, SH); NB = makeNB(G.S); NT.enable(!!NB, NB && NB.example); NT.clear(); G.moves = 0; G.time = 0; G.started = false; G.vis = null; V.piece = null; G.queue = []; G.hint = null; G.cheated = false; G.newRec = false; setAuto(false);
    if (ISCUB ? !G.S.cfg.planes.length : NN < 2) { G.mode = 'solved'; return; }                    // n = 1: nothing is cut, the cube is solved at once
    const cnt = SPN && { starft: 1, starct: 1, skewbult: 1, qjdodeca: 1 }[SH] ? Math.min(140, { starft: 50, starct: 45, skewbult: 30, qjdodeca: 40 }[SH] + 15 * (NN - 2) + Math.floor(rnd() * 6)) : ISCUB ? Math.min(90, 12 + 3 * (ABC[0] + ABC[1] + ABC[2]) + Math.floor(rnd() * 6)) : Math.min(90, 22 + 7 * (NN - 3 < 0 ? 0 : NN - 3) + Math.floor(rnd() * 6));
    if (!G.autoScr) { G.mode = 'play'; return; }          // no automatic scramble: the player scrambles it; a solved state does not count before the first move
    if (G.animScr && !opt.instant) {
      const tmp = HC.create(NX, SH), mvs = HC.scramble(tmp, cnt, rnd);
      if (HC.isSolved(tmp)) { opt.tries = (opt.tries || 0) + 1; if (opt.tries < 40) return newGame(opt); G.mode = 'play'; return; }          // (a size whose turns are all refused by the bond rule can never be scrambled: stop trying)
      G.mode = 'scramble'; mvs.forEach((m) => enqueue(m, 'scr', 0.14));
    } else { HC.scramble(G.S, cnt, rnd); if (HC.isSolved(G.S)) { opt.tries = (opt.tries || 0) + 1; if (opt.tries < 40) return newGame(opt); } G.mode = 'play'; }
  }

  /* ---------- projection ---------- */
  let cy = 1, sy = 0, cp = 1, sp = 0, scale = 100, ox = 0, oyy = 0, VIEWR = 1.8;
  function mul3(A, B) { const R = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return R; }
  // the view is a rotation matrix (a trackball): a drag turns it about the screen axes, so the pole is no obstacle (no limit, no gimbal lock); V.M = null means "from V.yaw / V.pitch"
  function curM() { if (V.M) return V.M; const c1 = Math.cos(V.yaw), s1 = Math.sin(V.yaw), c2 = Math.cos(V.pitch), s2 = Math.sin(V.pitch); return (V.M = [c1, 0, -s1, s2 * s1, c2, s2 * c1, c2 * s1, -s2, c2 * c1]); }
  function turnView(da, db) { const c = Math.cos(da), s = Math.sin(da), c2 = Math.cos(db), s2 = Math.sin(db); V.M = mul3([1, 0, 0, 0, c2, s2, 0, -s2, c2], mul3([c, 0, -s, 0, 1, 0, s, 0, c], curM())); }
  function tr(p) { const M = curM(); return [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]]; }
  function untr(c) { const M = curM(); return [M[0] * c[0] + M[3] * c[1] + M[6] * c[2], M[1] * c[0] + M[4] * c[1] + M[7] * c[2], M[2] * c[0] + M[5] * c[1] + M[8] * c[2]]; }
  function proj(c) { const f = DC / (DC + c[2]); return [ox + c[0] * f * scale, oyy - c[1] * f * scale]; }
  function sp2(p) { return proj(tr(p)); }
  function hexRGB(h) { return [parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255]; }

  /* ---------- WebGL ---------- */
  const glc = document.getElementById('gl');
  let gl = null, GLP = null, GLB = null;
  (function initGL() {
    if (!glc) return;
    try { gl = glc.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false }) || glc.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return;
    const vs = 'attribute vec3 aPos; attribute vec3 aCol; uniform vec4 uK; uniform vec2 uZ; varying vec3 vCol; void main(){ float w = aPos.z + ' + DC.toFixed(3) + '; gl_Position = vec4(aPos.x * uK.x + uK.z * w, aPos.y * uK.y + uK.w * w, uZ.x * w + uZ.y, w); vCol = aCol; }';
    const fs = 'precision mediump float; varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 1.0); }';
    function sh(type, src) { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
    try {
      GLP = gl.createProgram(); gl.attachShader(GLP, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(GLP, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(GLP);
      if (!gl.getProgramParameter(GLP, gl.LINK_STATUS)) throw new Error('link');
      GLB = gl.createBuffer();
    } catch (e) { gl = null; GLP = null; }
    if (!gl) { glc.style.display = 'none'; document.body.style.background = '#141a2b'; }
  })();
  function drawGL(fv, lv, cw, ch) {
    const W = Math.floor(cw * V.dpr), H = Math.floor(ch * V.dpr);
    if (glc.width !== W || glc.height !== H) { glc.width = W; glc.height = H; }
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(GLP); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
    const zr = Math.max(2.2, VIEWR + 0.4), n = DC - zr, f = DC + zr;
    gl.uniform4f(gl.getUniformLocation(GLP, 'uK'), 2 * DC * scale / cw, 2 * DC * scale / ch, 2 * ox / cw - 1, 1 - 2 * oyy / ch);
    gl.uniform2f(gl.getUniformLocation(GLP, 'uZ'), (f + n) / (f - n), -2 * f * n / (f - n));
    gl.bindBuffer(gl.ARRAY_BUFFER, GLB);
    const aP = gl.getAttribLocation(GLP, 'aPos'), aC = gl.getAttribLocation(GLP, 'aCol');
    gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aC);
    function pass(arr) {
      if (!arr.length) return;
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STREAM_DRAW);
      gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, arr.length / 6);
    }
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1); pass(fv); gl.disable(gl.POLYGON_OFFSET_FILL);
    pass(lv);
  }
  function layout() { V.dpr = window.devicePixelRatio || 1; V.cw = window.innerWidth; V.ch = window.innerHeight; cv.width = Math.floor(V.cw * V.dpr); cv.height = Math.floor(V.ch * V.dpr); }
  function txt(s, x, y, size, color, align, bold) { ctx.font = (bold ? 'bold ' : '') + size + 'px system-ui, "Malgun Gothic", sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(s, x, y); }

  /* ---------- drawing ---------- */
  let btns = [], lastOut = [], freeSet = [];
  function pieceFaces(i) {                         // world polygons of piece i including the visual turn
    const pc = G.S.pieces[i], v = G.vis;
    if (v && v.set.indexOf(i) >= 0 && v.x) { const pl = G.S.cfg.planes[v.p], M = HC.rotMat(pl.axis, v.x), C = pl.center || [0, 0, 0]; return pc.W.map((f) => f.map((p) => { const q = HC.app(M, [p[0] - C[0], p[1] - C[1], p[2] - C[2]]); return [q[0] + C[0], q[1] + C[1], q[2] + C[2]]; })); }
    return pc.W;
  }
  function draw() {
    const cw = V.cw, ch = V.ch; if (cw < 80 || ch < 120) return;
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    let rm = 1.8; G.S.pieces.forEach((pc) => pc.W.forEach((f) => f.forEach((q) => { const l = Math.hypot(q[0], q[1], q[2]); if (l > rm) rm = l; })));           // pieces may stick out: keep everything in view
    VIEWR = Math.max(1.8, rm + 0.1);
    const areaH = ch - 130; scale = Math.min(cw * 0.235, areaH * 0.245) * 1.8 / VIEWR; ox = cw / 2; oyy = 64 + areaH / 2;
    const out = [], fv = [], lv = [];
    function ribbon(P, Q, hw, bias, col) {
      const dx = Q[0] - P[0], dy = Q[1] - P[1], len = Math.hypot(dx, dy); if (len < 1e-6) return;
      const nx = -dy / len * hw, ny = dx / len * hw, z0 = P[2] - bias, z1 = Q[2] - bias, a1 = [P[0] + nx, P[1] + ny, z0], a2 = [P[0] - nx, P[1] - ny, z0], b1 = [Q[0] + nx, Q[1] + ny, z1], b2 = [Q[0] - nx, Q[1] - ny, z1];
      [a1, a2, b1, a2, b2, b1].forEach((v) => { lv.push(v[0], v[1], v[2], col[0], col[1], col[2]); });
    }
    const GAP = 0.024;               // every sticker is inset by this much (like the discrete engine): the dark body shows between the stickers
    function insetPoly(P, N) {
      const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nz = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
      let nw = [0, 0, 0]; for (let i = 0; i < P.length; i++) { const c = cr(P[i], P[(i + 1) % P.length]); nw = [nw[0] + c[0], nw[1] + c[1], nw[2] + c[2]]; }
      const Q = (nw[0] * N[0] + nw[1] * N[1] + nw[2] * N[2]) < 0 ? P.slice().reverse() : P;
      let cen = [0, 0, 0]; Q.forEach((p) => { cen = [cen[0] + p[0] / Q.length, cen[1] + p[1] / Q.length, cen[2] + p[2] / Q.length]; });
      let rad = 1e9; for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length], e = nz(sub3(b, a)), w = sub3(cen, a), k = w[0] * e[0] + w[1] * e[1] + w[2] * e[2]; rad = Math.min(rad, Math.hypot(w[0] - e[0] * k, w[1] - e[1] * k, w[2] - e[2] * k)); }
      const g = Math.min(GAP, 0.35 * rad), out = [];
      for (let i = 0; i < Q.length; i++) {
        const p = Q[(i + Q.length - 1) % Q.length], vv = Q[i], q = Q[(i + 1) % Q.length], m1 = cr(N, nz(sub3(vv, p))), m2 = cr(N, nz(sub3(q, vv))), f = g / Math.max(0.25, 1 + m1[0] * m2[0] + m1[1] * m2[1] + m1[2] * m2[2]);
        out.push([vv[0] + (m1[0] + m2[0]) * f, vv[1] + (m1[1] + m2[1]) * f, vv[2] + (m1[2] + m2[2]) * f]);
      }
      return Q === P ? out : out.reverse();          // the same corner order as P (the triangulation of a patch is made once)
    }
    function triOf(hf) {          // ear clipping of a non-convex patch (once per face); null = a fan is fine
      if (hf.tri !== undefined) return hf.tri;
      const P = hf.v, n = P.length; hf.tri = null; if (!G.S.cfg.shell || n <= 4) return null;
      let nw = [0, 0, 0]; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; nw = [nw[0] + (a[1] - b[1]) * (a[2] + b[2]), nw[1] + (a[2] - b[2]) * (a[0] + b[0]), nw[2] + (a[0] - b[0]) * (a[1] + b[1])]; }
      const k = Math.abs(nw[0]) > Math.abs(nw[1]) && Math.abs(nw[0]) > Math.abs(nw[2]) ? 0 : Math.abs(nw[1]) > Math.abs(nw[2]) ? 1 : 2, i1 = (k + 1) % 3, i2 = (k + 2) % 3, sg = nw[k] >= 0 ? 1 : -1;
      const X = P.map((p) => [p[i1], p[i2] * sg]), idx = X.map((_, i) => i), tri = [], cr = (a, b, c) => (X[b][0] - X[a][0]) * (X[c][1] - X[a][1]) - (X[b][1] - X[a][1]) * (X[c][0] - X[a][0]);
      let area = 0; for (let i = 0; i < n; i++) { const a = X[i], b = X[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; } const o = area >= 0 ? 1 : -1;
      let guard = 0;
      while (idx.length > 3 && guard++ < 4 * n * n) {
        let found = -1; const m = idx.length;
        for (let t = 0; t < m && found < 0; t++) {
          const a = idx[(t + m - 1) % m], b = idx[t], c = idx[(t + 1) % m]; if (o * cr(a, b, c) <= 1e-12) continue;
          let ok = true; for (let u = 0; u < m && ok; u++) { const d = idx[u]; if (d === a || d === b || d === c) continue; if (o * cr(a, b, d) >= -1e-12 && o * cr(b, c, d) >= -1e-12 && o * cr(c, a, d) >= -1e-12) ok = false; }
          if (ok) found = t;
        }
        if (found < 0) found = 0;          // a degenerate corner: clip it anyway
        const m2 = idx.length; tri.push([idx[(found + m2 - 1) % m2], idx[found], idx[(found + 1) % m2]]); idx.splice(found, 1);
      }
      if (idx.length === 3) tri.push([idx[0], idx[1], idx[2]]);
      return (hf.tri = tri);
    }
    const dragP = V.piece && V.piece.p !== undefined ? V.piece.p : -1;
    G.S.pieces.forEach((pc, i) => {
      const W = pieceFaces(i);
      pc.home.forEach((hf, k) => {
        const c3 = W[k].map(tr); let ctr = [0, 0, 0]; c3.forEach((p) => { ctr[0] += p[0]; ctr[1] += p[1]; ctr[2] += p[2]; }); ctr = ctr.map((x) => x / c3.length);
        const A = c3[0], B = c3[1], C = c3[2], ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const w0 = pieceFaces(i)[k], cen = [0, 0, 0]; w0.forEach((p) => { cen[0] += p[0] / w0.length; cen[1] += p[1] / w0.length; cen[2] += p[2] / w0.length; });
        const pcen = [0, 0, 0]; let tot = 0; (G.S.cfg.shell ? [W[k], W[k ^ 1]] : pieceFaces(i)).forEach((f) => f.forEach((p) => { pcen[0] += p[0]; pcen[1] += p[1]; pcen[2] += p[2]; tot++; }));          // a shell patch: outwards from its own pair of polygons
        const pc3 = tr([pcen[0] / tot, pcen[1] / tot, pcen[2] / tot]);
        if (nx * (ctr[0] - pc3[0]) + ny * (ctr[1] - pc3[1]) + nz * (ctr[2] - pc3[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }          // outward from the piece
        const l = Math.hypot(nx, ny, nz) || 1, lit = 0.8 + 0.22 * Math.max(0, (nx * -0.25 + ny * 0.5 - nz * 0.82) / l), back = nx * ctr[0] + ny * ctr[1] + nz * (ctr[2] + DC) >= 0;
        const outer = hf.tag >= 0, rgb = hexRGB(outer ? COL[hf.tag] : INNER), kk = outer ? lit : lit * 0.8;
        const r = Math.min(1, rgb[0] * kk), g = Math.min(1, rgb[1] * kk), b = Math.min(1, rgb[2] * kk);
        const ci = outer ? insetPoly(c3, [nx / l, ny / l, nz / l]) : c3;
        if (gl) {
          const tl = triOf(hf);
          if (tl) tl.forEach((t3) => t3.forEach((q) => { const p = ci[q]; fv.push(p[0], p[1], p[2], r, g, b); }));
          else for (let q = 1; q + 1 < ci.length; q++) [ci[0], ci[q], ci[q + 1]].forEach((p) => { fv.push(p[0], p[1], p[2], r, g, b); });
          if (outer) for (let q = 0; q < c3.length; q++) ribbon(c3[q], c3[(q + 1) % c3.length], GAP * 0.9, 0.01, [0, 0, 0]);          // every edge is drawn black, also along the outline
        }
        if (outer && !back) out.push({ pts: ci.map(proj), z: ctr[2], piece: i, world: W[k], n: [nx / l, ny / l, nz / l], col: lit, tag: hf.tag, c3: ci });
        else if (!gl) out.push({ pts: ci.map(proj), z: ctr[2], piece: -1, color: outer ? COL[hf.tag] : INNER, lit: kk, back: back, c3: ci });
      });
    });
    lastOut = out.filter((f) => f.piece >= 0);
    if (gl) { drawGL(fv, lv, cw, ch); ctx.clearRect(0, 0, cw, ch); }
    else {
      out.sort((a, b) => b.z - a.z);
      ctx.fillStyle = '#141a2b'; ctx.fillRect(0, 0, cw, ch);
      out.forEach((f) => {
        if (f.back && f.piece < 0) return;
        const rgb = hexRGB(f.color || COL[f.tag]), k = f.lit || f.col || 1;
        ctx.beginPath(); f.pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
        ctx.fillStyle = 'rgb(' + Math.round(Math.min(255, rgb[0] * 255 * k)) + ',' + Math.round(Math.min(255, rgb[1] * 255 * k)) + ',' + Math.round(Math.min(255, rgb[2] * 255 * k)) + ')'; ctx.fill();
        ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.stroke();
      });
    }
    txt(TX.name, cw / 2, 24, 22, '#e8eefc', 'center', true);
    txt(TX.moves + ' ' + G.moves + '   ' + TX.time + ' ' + fmtTime(G.time) + (G.best ? '   ' + TX.best + ' ' + G.best.moves + ' / ' + fmtTime(G.best.time) : ''), cw / 2, 48, 14, '#9aa8c8', 'center');
    if (G.mode === 'scramble') txt(TX.scr, cw / 2, 70, 14, '#ffd23c', 'center');
    else if (G.hint) txt(TX.next + ': ' + desc(G.hint.mv), cw / 2, 70, 14, '#3f6', 'center');
    else if (G.msgT > 0) txt(G.msg, cw / 2, 70, 13, '#ff9a8a', 'center');
    else if (G.vis && G.vis.live) txt('#' + (G.vis.p + 1) + '   ' + (HC.normAng(G.S.ang[G.vis.p]) / DEG).toFixed(2) + '° → ' + (HC.normAng(targetOf(G.vis.p, G.vis.x)) / DEG).toFixed(2) + '°', cw / 2, 70, 14, '#9ad0ff', 'center');
    else if (!G.vis) { let n = 0; for (let p = 0; p < NP; p++) if (HC.isFree(G.S, p)) n++; if (n < NP) txt(TX.free + ': ' + n + ' / ' + NP, cw / 2, 70, 13, '#ffb86b', 'center'); }
    btns = [];
    { const parts = TX.hintTxt.split(' · '), h = Math.ceil(parts.length / 2); txt(parts.slice(0, h).join(' · '), cw / 2, ch - 30, 12, '#7d89a8', 'center'); txt(parts.slice(h).join(' · '), cw / 2, ch - 14, 12, '#7d89a8', 'center'); }
    if (G.mode === 'solved') {
      const pw = Math.min(360, cw - 40), px = cw / 2 - pw / 2, py = ch * 0.5 - 70;
      ctx.fillStyle = 'rgba(8,12,22,.92)'; ctx.fillRect(px, py, pw, 150); ctx.strokeStyle = '#ffd23c'; ctx.lineWidth = 2; ctx.strokeRect(px, py, pw, 150); ctx.lineWidth = 1;
      txt(TX.solved, cw / 2, py + 34, 34, '#ffd23c', 'center', true); txt(TX.moves + ' ' + G.moves + '   ' + TX.time + ' ' + fmtTime(G.time), cw / 2, py + 72, 16, '#fff', 'center');
      if (G.newRec) txt(TX.newRec, cw / 2, py + 96, 14, '#8ee08e', 'center');
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(cw / 2 - 90, py + 110, 180, 30); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.strokeRect(cw / 2 - 89.5, py + 110.5, 179, 29);
      txt(TX.again, cw / 2, py + 125, 14, '#fff', 'center'); btns.push({ x: cw / 2 - 90, y: py + 110, w: 180, h: 30, act: function () { newGame(); } });
    }
  }

  /* ---------- input ---------- */
  function inPoly(pts, x, y) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { if (((pts[i][1] > y) !== (pts[j][1] > y)) && (x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0])) c = !c; } return c; }
  function hitTest(x, y) {                                       // frontmost outer sticker under the pointer: {piece, point (world)}
    let best = null;
    for (const f of lastOut) if (inPoly(f.pts, x, y) && (!best || f.z < best.z)) best = f;
    if (!best) return null;
    const N = best.n, P0 = best.c3[0], d = N[0] * P0[0] + N[1] * P0[1] + N[2] * P0[2], u = (x - ox) / scale, v = (oyy - y) / scale, a = (N[0] * u + N[1] * v) / DC, t = (d - a * DC) / (a + N[2]);
    return { piece: best.piece, point: untr([u * (DC + t) / DC, v * (DC + t) / DC, t]) };
  }
  function targetOf(p, x) {                                      // the resting position (angle from home) nearest to where the drag has taken the prism
    const cur = G.S.ang[p], want = cur + x; let best = 0, bd = 1e9;
    G.S.cfg.planes[p].stops.forEach((st) => { for (let k = -1; k <= 1; k++) { const t = st + k * 2 * Math.PI, d = Math.abs(t - want); if (d < bd) { bd = d; best = t; } } });
    return best;
  }
  function allowedAngle(p, x) { const d = targetOf(p, x) - G.S.ang[p]; return Math.abs(d) < 1e-7 ? 0 : d; }   // the turn to make (0 = cancel)
  function planeChoice(pk, dx, dy) {                              // the free prism that holds the piece and turns most along the drag
    const m = [];
    const S = G.S; let bestP = -1, bs = 0.35, bt = null;
    for (let p = 0; p < NP; p++) {
      if (!HC.inCap(S, pk.piece, p)) continue;
      m.push(p);
      const ax = S.cfg.planes[p].axis, cc = S.cfg.planes[p].center || [0, 0, 0], r = pk.point, T = [ax[1] * (r[2] - cc[2]) - ax[2] * (r[1] - cc[1]), ax[2] * (r[0] - cc[0]) - ax[0] * (r[2] - cc[2]), ax[0] * (r[1] - cc[1]) - ax[1] * (r[0] - cc[0])], tl = Math.hypot(T[0], T[1], T[2]);
      if (tl < 0.25) continue;
      const e = 0.02, a = sp2(r), b = sp2([r[0] + T[0] * e, r[1] + T[1] * e, r[2] + T[2] * e]), tx = (b[0] - a[0]) / e, ty = (b[1] - a[1]) / e, ml = Math.hypot(tx, ty) || 1;
      const cs = Math.abs(dx * tx + dy * ty) / (Math.hypot(dx, dy) * ml) * Math.min(1, ml / 60);
      if (cs > bs + 1e-9 || bestP < 0 && cs > 0.2 || (bestP >= 0 && Math.abs(cs - bs) <= 1e-9 && HC.isFree(S, p) && !HC.isFree(S, bestP))) { bs = Math.max(bs, cs); bestP = p; bt = { tx: tx, ty: ty, ml: ml }; }          // equally good planes (a single layer and a wide slab): the one that can turn
    }
    return { p: bestP, cand: m, t: bt };
  }
  cv.addEventListener('pointerdown', function (e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const b of btns) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    try { cv.setPointerCapture(e.pointerId); } catch (z) {}
    const pk = G.mode === 'solved' || busy() || (G.vis && G.vis.live) ? null : hitTest(x, y);
    if (pk) { V.piece = { pk: pk, x0: x, y0: y, p: undefined }; V.drag = null; }
    else { V.piece = null; V.drag = { x: e.clientX, y: e.clientY }; }
  });
  cv.addEventListener('pointermove', function (e) {
    if (V.drag) { turnView((e.clientX - V.drag.x) * 0.006, (e.clientY - V.drag.y) * 0.005); V.drag.x = e.clientX; V.drag.y = e.clientY; return; }
    const pc = V.piece; if (!pc) return;
    const r = cv.getBoundingClientRect(), dx = e.clientX - r.left - pc.x0, dy = e.clientY - r.top - pc.y0;
    if (pc.p === undefined) {
      if (Math.hypot(dx, dy) < 9) return;
      const ch = planeChoice(pc.pk, dx, dy);
      if (ch.p < 0) { say(ch.cand.length ? TX.locked : TX.none); V.piece = null; return; }
      const set = HC.members(G.S, ch.p);
      if (!set) { say(TX.locked); V.piece = null; return; }
      pc.p = ch.p; pc.t = ch.t; pc.set = set;
    }
    const t = pc.t, x = 1.6 * (dx * t.tx + dy * t.ty) / (t.ml * t.ml);                    // radians of turn along the drag
    let xx = Math.max(-2 * Math.PI, Math.min(2 * Math.PI, x));
    if (G.S.cfg.bond && xx !== 0) {          // a turn that way would split the body (at the end or on the way): the layer does not move (it stays at the last turn that works, no temporary turn beyond it)
      pc.blk = pc.blk || {};
      const sg = xx > 0 ? 1 : -1, k1 = 'q' + sg; if (pc.blk[k1] === undefined) pc.blk[k1] = HC.splits(G.S, pc.p, sg * Math.PI / 2);
      if (pc.blk[k1]) { xx = 0; say(TX.detach); }          // the first quarter turn that way is not possible: no temporary turn either
      const tg = xx === 0 ? 0 : targetOf(pc.p, xx) - G.S.ang[pc.p];
      if (Math.abs(tg) > 1e-7) {
        const key = Math.round(tg * 1000); if (pc.blk[key] === undefined) pc.blk[key] = HC.splits(G.S, pc.p, tg);
        if (pc.blk[key]) { xx = Math.sign(xx) * Math.max(0, Math.abs(tg) - Math.PI / 2); say(TX.detach); }
      }
    }
    G.vis = { p: pc.p, set: pc.set, x: xx, x0: 0, t: 0, dur: 0.2, live: true, src: 'user' };
  });
  function endDrag(e) {
    V.drag = null;
    const pc = V.piece; V.piece = null;
    if (!pc || pc.p === undefined || !G.vis || !G.vis.live) return;
    const a = allowedAngle(pc.p, G.vis.x), stp = G.S.cfg.planes[pc.p].stops, ux = Math.abs(G.vis.x) % (2 * Math.PI);
    if (SH === 'cuboidff' && ux > Math.PI / 3 && ux < 2 * Math.PI / 3 && !stp.some((t) => Math.abs(t - Math.PI / 2) < 1e-6)) say(TX.stuck);          // a 90 degree turn of this layer is jammed
    if (Math.abs(a) < 1e-9) { const v = G.vis; v.live = false; v.x0 = v.x; v.t = 0; v.src = 'cancel'; return; }
    if (!startMove({ p: pc.p, a: a }, 'user')) G.vis = null;
  }
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', function () { endDrag(null); });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyU' || e.code === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.code === 'Space' || e.code === 'Enter') { if (G.mode === 'solved') { e.preventDefault(); newGame(); } }
  });
  window.addEventListener('resize', layout);

  /* ---------- exports for the shell ---------- */
  window.newGame = function () { newGame(); };
  window.toggleAuto = function () { if (G.mode === 'solved') return false; setAuto(!G.auto); if (G.auto) { showPlan(); G.planWant = true; } return G.auto; };
  function showPlan() {
    if (!NB) return; const X = extSolver(), pl = X && X.plan ? X.plan(G.S) : null; if (pl) { NT.plan(window.RBNotation.compact(pl.map((m) => [moveText(m), ordOf(m.p)]))); return; } if (X && X.plan) return;          // (an extra solver without its plan yet: nothing to show, the plan is shown when it arrives)
    const h = G.S.hist, nm = [];
    for (let i = h.length - 1; i >= 0; i--) { const iv = HC.inverse(h[i]); nm.push([moveText(iv), ordOf(iv.p)]); }
    NT.plan(window.RBNotation.compact(nm));
  }
  function runNotation(text) {
    if (!NB) return KO ? '이 퍼즐은 표기법을 지원하지 않습니다' : 'This puzzle has no notation';
    if (G.mode === 'scramble' || G.vis || G.queue.length) return KO ? '움직이는 중입니다' : 'Busy';
    let mv; try { mv = window.RBNotation.resolveAll(NB, text, true); } catch (e) { return e.message; }
    if (!mv.length) return true;
    if (G.mode === 'solved') { G.mode = 'play'; G.moves = 0; G.time = 0; G.started = false; G.cheated = false; G.newRec = false; }
    setAuto(false); G.hint = null; NT.plan('');
    mv.forEach((m) => enqueue({ p: m.id, a: m.s !== undefined ? m.s * NB.stepOf(m.id) : NB.angOf(m.id, m.d) * (m.frac || 1) }, 'nota', mv.length > 12 ? 0.12 : 0.22, m.txt));
    return true;
  }
  window.toggleNotation = function () { return NB ? NT.toggleInput() : false; };
  window.runNotation = runNotation;
  window.__nb = function () { return NB; };
  window.giveHint = function () { if (G.mode !== 'play' || busy() || G.vis || G.hint) return; const nm = nextSolveMove(); if (!nm || nm === 'wait') return; G.hint = { t: 0, mv: nm }; };
  window.toggleScrambleAnim = function () { G.animScr = !G.animScr; lsSet('rubik_anim', G.animScr ? '1' : '0'); return G.animScr; };
  window.getScrambleAnim = function () { return G.animScr; };
  window.toggleAutoScramble = function () { G.autoScr = !G.autoScr; lsSet('rubik_autoscr', G.autoScr ? '1' : '0'); return G.autoScr; };
  window.getAutoScramble = function () { return G.autoScr; };
  window.addEventListener('message', function (e) { const m = e.data; if (m && m.rbCmd && typeof window[m.rbCmd] === 'function') window[m.rbCmd](); });
  window.__hc = { G: G, HC: HC, V: V, step: function (dt) { update(dt); }, out: function () { return lastOut; }, hit: hitTest, move: function (p, a) { return userMove({ p: p, a: a }); }, sp2: sp2 };

  let last = 0;
  function frame(now) { requestAnimationFrame(frame); if (!last) last = now; const dt = Math.min(0.1, (now - last) / 1000); last = now; update(dt); draw(); }
  layout(); newGame(); requestAnimationFrame(frame);
})();
