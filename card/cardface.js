/* Hwatu card faces drawn as inline SVG (no images).  CardFace.svg(id) -> svg string, CardFace.label(id) -> short class label */
(function (root) {
  'use strict';
  var KO = /^ko/i.test((root.navigator && root.navigator.language) || 'ko');
  var G = root.GS;
  var COL = { G: '#d9a400', A: '#e8751a', h: '#d62f2f', c: '#2f6fd6', o: '#c4423a', p: '#9a7b5a', J: '#8d9b88', d: '#3f7d58' };
  function bl(cx, cy, r, col, cc) {
    var s = '', k, a;
    for (k = 0; k < 5; k++) { a = k * 72 * Math.PI / 180 - Math.PI / 2; s += '<circle cx="' + (cx + Math.cos(a) * r * 1.05).toFixed(1) + '" cy="' + (cy + Math.sin(a) * r * 1.05).toFixed(1) + '" r="' + r + '" fill="' + col + '"/>'; }
    return s + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.55).toFixed(1) + '" fill="' + cc + '"/>';
  }
  function P(d, f, s, w) { return '<path d="' + d + '" fill="' + (f || 'none') + '"' + (s ? ' stroke="' + s + '" stroke-width="' + (w || 1.5) + '" stroke-linecap="round" stroke-linejoin="round"' : '') + '/>'; }
  function C(x, y, r, f, s) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + f + '"' + (s ? ' stroke="' + s + '" stroke-width="1"' : '') + '/>'; }
  function E(x, y, rx, ry, f, rot) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"' + (rot ? ' transform="rotate(' + rot + ' ' + x + ' ' + y + ')"' : '') + '/>'; }
  function leaf(x, y, l, w, rot, f) { return '<path d="M0 0 Q' + (w) + ' ' + (-l / 2) + ' 0 ' + (-l) + ' Q' + (-w) + ' ' + (-l / 2) + ' 0 0Z" fill="' + f + '" transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')"/>'; }
  var BR = '#5a3a22', GR = '#2e7d3a', DG = '#1f5a2a';
  /* the plant of every month (the same on all four cards of the month) */
  var GLY = [
    function () { return P('M30 72 C28 62 34 56 28 48 C24 42 30 36 34 30', null, BR, 3.2) + P('M30 56 C38 54 44 50 50 46', null, BR, 2) + E(30, 34, 15, 5, GR, -4) + E(38, 44, 14, 5, DG, 6) + E(22, 52, 14, 5, GR, -6) + E(36, 60, 12, 4, DG, 4) + C(47, 28, 5, '#d8352a'); },
    function () { return P('M8 72 C16 64 22 66 28 56 C34 46 42 48 52 30', null, BR, 3) + bl(16, 63, 5, '#e8517a', '#ffe17a') + bl(30, 54, 5.5, '#e8517a', '#ffe17a') + bl(44, 44, 5, '#e8517a', '#ffe17a') + bl(50, 30, 4.5, '#f27b9c', '#ffe17a') + bl(22, 70, 3.5, '#f27b9c', '#ffe17a'); },
    function () { return P('M6 70 C18 64 30 66 38 52 C44 42 50 40 54 28', null, '#4a3020', 3) + bl(14, 64, 6, '#f7b6c6', '#fff') + bl(28, 62, 6.5, '#f7b6c6', '#fff') + bl(40, 50, 6.5, '#f7b6c6', '#fff') + bl(50, 36, 5.5, '#f7b6c6', '#fff') + bl(24, 48, 4.5, '#fbd0da', '#fff') + bl(46, 62, 4, '#fbd0da', '#fff'); },
    function () { var s = P('M8 26 Q30 20 52 26', null, DG, 2.5); [[14, 28], [30, 25], [46, 28]].forEach(function (p) { for (var j = 0; j < 7; j++) s += E(p[0] + (j % 2 ? 1.5 : -1.5), p[1] + 3 + j * 6, 4.3 - j * 0.45, 3.4, j % 2 ? '#3b1f52' : '#54307a'); s += P('M' + p[0] + ' ' + p[1] + ' V' + (p[1] + 3), null, DG, 2); }); return s + leaf(8, 70, 18, 4, 40, GR) + leaf(52, 70, 18, 4, -40, GR); },
    function () { return P('M12 72 L20 36 M28 72 L30 30 M46 72 L40 38', null, GR, 3.4) + leaf(16, 68, 26, 3, -8, DG) + leaf(36, 70, 30, 3, 6, GR) + E(20, 34, 5, 9, '#5b4fd0', -12) + E(30, 28, 5.5, 10, '#7b6cf0') + E(41, 36, 5, 9, '#5b4fd0', 12) + E(30, 34, 2, 4, '#f4d23c'); },
    function () { return leaf(12, 70, 22, 6, -50, DG) + leaf(48, 70, 22, 6, 50, DG) + leaf(30, 72, 20, 5, 0, GR) + C(30, 46, 17, '#c8203c') + C(30, 46, 13, '#e8466a') + C(30, 46, 9, '#f27a96') + C(30, 46, 4.5, '#ffd9e2') + P('M18 40 Q30 28 42 40 M16 50 Q30 62 44 50', null, '#a8132f', 1); },
    function () { var s = P('M10 72 Q22 44 50 28', null, DG, 3) + P('M24 62 Q36 56 44 56', null, DG, 2); [[16, 62], [22, 50], [32, 44], [28, 56], [40, 36], [36, 52], [48, 30], [20, 68], [44, 46]].forEach(function (p) { s += C(p[0], p[1], 4, '#d23a5e') + C(p[0] - 1, p[1] - 1, 1.5, '#f27a96'); }); return s + leaf(12, 52, 12, 3, -30, GR) + leaf(46, 62, 12, 3, 40, GR); },
    function () { return P('M4 72 Q16 52 30 62 Q44 50 56 72Z', '#3d3a34') + C(30, 40, 15, '#f2ecd0') + P('M12 72 V50 M18 72 V46 M42 72 V48 M48 72 V52', null, '#a89c78', 1.6) + P('M10 50 q2 -5 4 0 M16 46 q2 -5 4 0 M40 48 q2 -5 4 0 M46 52 q2 -5 4 0', null, '#a89c78', 1.4); },
    function () { var s = '', k; for (k = 0; k < 14; k++) s += '<ellipse cx="30" cy="38" rx="3.2" ry="10.5" fill="' + (k % 2 ? '#f6d548' : '#f1b72a') + '" transform="rotate(' + (k * 25.7).toFixed(1) + ' 30 48)"/>'; return s + C(30, 48, 6, '#c4620a') + leaf(10, 70, 18, 5, -40, GR) + leaf(50, 70, 18, 5, 40, GR); },
    function () { return P('M30 74 V56 M30 60 Q20 50 14 52 M30 60 Q40 50 48 52', null, BR, 2.6) + P('M30 30 L34 40 L46 36 L41 47 L52 52 L40 56 L41 64 L30 58 L19 64 L20 56 L8 52 L19 47 L14 36 L26 40Z', '#d8401e', '#8a2410', 1) + P('M30 36 V58', null, '#f08a3c', 1.2) + P('M12 34 l4 3 l-1 5 l-5 -2z M48 62 l4 3 l-2 5 l-5 -2z', '#e8742a'); },
    function () { return P('M30 74 V44', null, BR, 3) + E(18, 40, 8, 10, '#7a3fa0', -14) + E(30, 32, 8, 11, '#9a57c0') + E(42, 40, 8, 10, '#7a3fa0', 14) + E(14, 64, 12, 7, DG, -20) + E(46, 64, 12, 7, GR, 20) + P('M14 64 H26 M34 64 H46', null, '#14401e', 1); },
    function () { var s = P('M8 24 H52', null, BR, 2.5); [10, 20, 30, 40, 50].forEach(function (x, i) { s += P('M' + x + ' 24 Q' + (x + (i % 2 ? -5 : 5)) + ' 46 ' + (x + (i % 2 ? -2 : 2)) + ' 68', null, GR, 2.6); }); [[6, 36], [26, 44], [38, 56], [16, 60], [48, 40]].forEach(function (p) { s += P('M' + p[0] + ' ' + p[1] + ' l-2 7', null, '#3a8fd6', 1.6); }); return s; }
  ];
  function bird(col, x, y, sc) {
    return '<g transform="translate(' + (x || 33) + ' ' + (y || 57) + ') scale(' + (sc || 1) + ')">' + E(0, 0, 10, 6, col) + C(-9, -4, 4.6, col) + P('M-13 -4 L-20 -2 L-13 -1Z', '#f4a020') + P('M8 -1 L21 5 L8 4Z', col) + P('M-2 -4 Q4 -12 10 -5', col, '#fff', 0.8) + C(-10, -5, 1.2, '#fff') + P('M-2 6 v5 M3 6 v5', null, '#444', 1.2) + '</g>';
  }
  /* Bright (gwang) pictures */
  function bright(m, rain) {
    switch (m === 11 && rain ? 12 : m) {
      case 0: return C(46, 28, 8, '#d8352a') + '<g transform="translate(24 52)">' + P('M-6 6 Q-14 -2 -4 -10 Q4 -18 10 -12 L14 -22', null, '#f2f2f2', 3.2) + E(0, 2, 11, 6, '#f6f6f6', -10) + P('M10 -22 l6 1 l-5 3', '#f6f6f6') + C(14, -24, 2.6, '#d8352a') + P('M-10 4 L-22 8 L-12 8Z', '#222') + P('M-2 8 v8 M3 8 v8', null, '#a05a2c', 1.4) + '</g>';
      case 2: return '<g>' + [6, 14, 22, 30, 38, 46].map(function (x, i) { return '<rect x="' + x + '" y="24" width="8" height="18" fill="' + (i % 2 ? '#f7f2e4' : '#d8352a') + '"/>'; }).join('') + P('M6 42 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0 q4 5 8 0', '#eee', '#7a1a14', 1) + '</g>';
      case 7: return C(30, 44, 19, '#e24a34') + P('M4 72 Q16 52 30 62 Q44 50 56 72Z', '#2e2a26');
      case 10: return '<g transform="translate(30 50)">' + P('M-16 14 Q-6 -2 -4 -14 Q-2 -22 6 -20 Q10 -26 16 -22 Q12 -14 12 -6 Q22 -4 20 8 Q8 6 4 14 Q10 22 20 24 Q0 26 -10 18 Z', '#d6a62a', '#7a5a10', 1) + P('M6 -20 q8 -6 6 -12 q-8 2 -6 12 M10 -22 q10 -2 14 -10 q-12 -2 -14 10', '#e8541e') + C(8, -17, 1.2, '#222') + P('M-10 18 L-24 28 L-16 28 L-4 22Z', '#c0392b') + '</g>';
      case 12: return '<g transform="translate(30 54)">' + P('M-16 -8 Q0 -26 16 -8Z', '#c8302a', '#5a1410', 1) + P('M0 -17 V14 M-8 -12 L-6 -8 M8 -12 L6 -8', null, '#5a1410', 1.2) + C(-1, 0, 4, '#f2d2a8', '#333') + P('M-7 4 Q-1 2 5 4 L7 22 H-9Z', '#2a4a8a', '#14284a', 1) + P('M-6 22 v6 M4 22 v6', null, '#222', 2) + '</g>';
      case 11: return '<g transform="translate(30 50)">' + P('M-6 -22 Q0 -34 10 -28 Q4 -26 4 -20 Q14 -14 8 -4 L22 4 Q10 6 6 12 Q10 20 -2 22 Q-4 10 -10 4 Q-18 0 -22 -8', '#e8b020', '#7a4a10', 1) + C(-4, -22, 3, '#d8352a') + P('M-10 4 L-24 24 M-6 8 L-16 28 M0 10 L-6 30', null, '#c0392b', 2.2) + '</g>';
    }
    return '';
  }
  function animal(m) {
    switch (m) {
      case 1: return bird('#e0b020', 33, 58, 0.95);
      case 3: return bird('#5a5a70', 33, 58, 0.95);
      case 7: return '<g>' + [[14, 40], [28, 34], [42, 42]].map(function (p) { return '<g transform="translate(' + p[0] + ' ' + p[1] + ')">' + P('M-9 2 Q0 -8 9 2 Q0 -2 -9 2Z', '#26231f') + '</g>'; }).join('') + '</g>';
      case 11: return bird('#1f2a44', 33, 58, 0.95);
      case 4: return P('M4 70 Q30 40 56 70', null, '#7a4a2a', 6) + P('M12 62 V72 M22 55 V68 M30 52 V66 M38 55 V68 M48 62 V72', null, '#3a200e', 1.6);
      case 5: return '<g transform="translate(25 52) rotate(-15)">' + E(-6, 0, 8, 5, '#3c82e0', -20) + E(6, 0, 8, 5, '#3c82e0', 20) + E(-5, 7, 6, 4, '#8ac0ff') + E(5, 7, 6, 4, '#8ac0ff') + '<rect x="-1" y="-6" width="2" height="16" fill="#222"/></g><g transform="translate(42 62) scale(.7)">' + E(-6, 0, 8, 5, '#f0b020', -20) + E(6, 0, 8, 5, '#f0b020', 20) + '<rect x="-1" y="-6" width="2" height="14" fill="#222"/></g>';
      case 6: return '<g transform="translate(30 58)">' + E(0, 0, 14, 8, '#6b4a2b') + C(-14, -2, 6.5, '#5a3a22') + P('M-18 3 L-22 8 M-14 4 L-13 9', null, '#f5efe0', 2.2) + P('M-18 -8 l2 -5 l3 5', '#5a3a22') + '<rect x="-9" y="6" width="3" height="9" fill="#3a200e"/><rect x="7" y="6" width="3" height="9" fill="#3a200e"/>' + P('M12 -6 q6 -2 4 3', null, '#3a200e', 1.6) + '</g>';
      case 8: return P('M14 48 H46 L40 70 H20Z', '#c8302a', '#7a1a14', 1) + E(30, 48, 16, 4, '#f4d58a') + P('M16 56 H44', null, '#f4d58a', 1.2);
      case 9: return '<g transform="translate(30 56)">' + E(0, 4, 13, 7, '#8a5a32') + P('M-12 0 Q-12 -9 -8 -16 Q-5 -20 -4 -14 Q-2 -22 4 -22', null, '#7a4a22', 3) + C(-9, -5, 5, '#8a5a32') + P('M-10 -10 L-16 -20 M-8 -11 L-6 -22 M-13 -14 L-19 -15', null, '#4a2f1b', 1.8) + '<rect x="-8" y="8" width="3" height="10" fill="#4a2f1b"/><rect x="7" y="8" width="3" height="10" fill="#4a2f1b"/></g>';
    }
    return '';
  }
  function ribbon(sub) {
    var c = { h: '#d62f2f', c: '#2f6fd6', o: '#d8443a', p: '#c9a56c' }[sub] || '#d62f2f';
    var txt = { h: LB.h, c: LB.c, o: LB.o, p: '' }[sub];
    return '<path d="M5 50 H55 V64 H5 L8.5 57Z" fill="' + c + '" stroke="#1d1d1d" stroke-width="1"/>' + (sub === 'h' ? '<path d="M8 53 h4 M48 53 h4 M8 61 h4 M48 61 h4" stroke="#fff" stroke-width="1"/>' : '') +
      (txt ? '<text x="30" y="60.6" text-anchor="middle" font-family="\'Malgun Gothic\',\'Noto Sans KR\',Arial,sans-serif" font-size="' + (KO ? 11.5 : 9.5) + '" font-weight="800" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width=".4">' + txt + '</text>' : '');
  }
  var LB = KO ? { G: '광', r: '비광', A: '열끗', b: '고도리', R: '띠', h: '홍단', c: '청단', o: '초단', p: '띠', J: '피', d: '쌍피' }
              : { G: 'Bright', r: 'Rain', A: 'Animal', b: 'Bird', R: 'Ribbon', h: 'Poem', c: 'Blue', o: 'Plain', p: 'Ribbon', J: 'Junk', d: 'Junk x2' };
  function key(id) { var c = G.CLS[id], s = G.SUB[id]; if (c === 'G') return s === 'r' ? 'r' : 'G'; if (c === 'A') return s === 'b' ? 'b' : 'A'; if (c === 'R') return s; return s === 'd' ? 'd' : 'J'; }
  function bcol(id) { var c = G.CLS[id]; return c === 'R' ? COL[G.SUB[id]] : c === 'J' ? (G.SUB[id] === 'd' ? COL.d : COL.J) : COL[c]; }
  var cache = {};
  /* faces are the openly licensed Korean-style hwatu artwork in img/ (see CREDITS.md); a small class badge is drawn on top (switchable) */
  function svg(id) {
    if (cache[id]) return cache[id];
    var m = G.mon(id);
    return (cache[id] = '<img src="img/c' + id + '.webp" alt="" draggable="false"><span class="lb" style="background:' + bcol(id) + '">' + (m + 1) + ' ' + LB[key(id)] + '</span>');
  }
  root.CardFace = { svg: svg, label: function (id) { return LB[key(id)]; }, color: bcol, KO: KO };
})(window);
