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
  var GLY = [
    function () { return '<rect x="28" y="54" width="5" height="16" fill="#6b4a2b"/><path d="M30 28 L18 44 H42Z M30 38 L14 56 H46Z M30 48 L10 68 H50Z" fill="#2f7d3a"/><circle cx="46" cy="30" r="5" fill="#d83a2a"/>'; },
    function () { return '<path d="M8 68 Q26 56 52 32" stroke="#6b4a2b" stroke-width="3.5" fill="none"/>' + bl(18, 58, 5, '#f2688a', '#ffd84a') + bl(33, 47, 5.5, '#f2688a', '#ffd84a') + bl(47, 36, 5, '#f2688a', '#ffd84a'); },
    function () { return '<path d="M8 66 Q30 60 52 30" stroke="#7a5237" stroke-width="3" fill="none"/>' + bl(20, 57, 6, '#ffb6c8', '#fff') + bl(35, 47, 6.5, '#ffb6c8', '#fff') + bl(46, 34, 5.5, '#ffb6c8', '#fff'); },
    function () { var s = '<path d="M8 30 Q30 26 52 30" stroke="#4b6b3a" stroke-width="3" fill="none"/>'; [14, 24, 34, 44].forEach(function (x) { for (var j = 0; j < 5; j++) s += '<circle cx="' + x + '" cy="' + (36 + j * 6) + '" r="' + (4.2 - j * 0.4).toFixed(1) + '" fill="#3b2457"/>'; }); return s; },
    function () { return '<path d="M12 70 L22 36 M30 70 L30 32 M48 70 L40 38" stroke="#2f7d3a" stroke-width="3.5" fill="none"/><ellipse cx="22" cy="36" rx="6" ry="9" fill="#5a4fcf"/><ellipse cx="30" cy="32" rx="6" ry="10" fill="#7b6cf0"/><ellipse cx="40" cy="38" rx="6" ry="9" fill="#5a4fcf"/>'; },
    function () { return '<ellipse cx="16" cy="62" rx="9" ry="5" fill="#2f7d3a"/><ellipse cx="44" cy="62" rx="9" ry="5" fill="#2f7d3a"/><circle cx="30" cy="46" r="15" fill="#d6246e"/><circle cx="30" cy="46" r="10" fill="#ee5c93"/><circle cx="30" cy="46" r="5" fill="#ffd1e0"/>'; },
    function () { var s = '<path d="M10 68 Q22 40 46 30" stroke="#2f7d3a" stroke-width="3" fill="none"/>'; [[16, 56], [22, 46], [30, 42], [26, 54], [38, 36], [34, 48], [44, 32], [20, 62]].forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.5" fill="#c23a5a"/>'; }); return s; },
    function () { return '<circle cx="30" cy="42" r="16" fill="#f6e27a"/><path d="M4 70 Q18 54 30 62 Q44 52 56 70Z" fill="#4a4636"/>'; },
    function () { var s = '', k; for (k = 0; k < 10; k++) s += '<ellipse cx="30" cy="38" rx="3.6" ry="11" fill="#f4c430" transform="rotate(' + k * 36 + ' 30 49)"/>'; return s + '<circle cx="30" cy="49" r="5" fill="#d98a00"/>'; },
    function () { return '<path d="M30 30 L35 40 L46 36 L41 47 L52 52 L40 56 L42 66 L30 60 L18 66 L20 56 L8 52 L19 47 L14 36 L25 40Z" fill="#d6401e"/><path d="M30 60 V72" stroke="#6b4a2b" stroke-width="3"/>'; },
    function () { return '<path d="M30 70 V46" stroke="#6b4a2b" stroke-width="3"/><circle cx="20" cy="46" r="8" fill="#8a4aa5"/><circle cx="30" cy="38" r="9" fill="#a35cc0"/><circle cx="40" cy="46" r="8" fill="#8a4aa5"/><ellipse cx="16" cy="62" rx="9" ry="6" fill="#3a8a3a"/><ellipse cx="44" cy="62" rx="9" ry="6" fill="#3a8a3a"/>'; },
    function () {
      var s = '<path d="M12 28 Q10 52 16 70 M24 28 Q22 50 26 70 M36 28 Q38 52 34 70 M48 28 Q52 50 46 70" stroke="#3f9a4a" stroke-width="3" fill="none"/>';
      [[8, 40], [30, 36], [42, 56], [20, 60], [50, 38]].forEach(function (p) { s += '<ellipse cx="' + p[0] + '" cy="' + p[1] + '" rx="1.8" ry="3" fill="#4aa0e0"/>'; });
      return s;
    }
  ];
  function bird(col) {
    return '<g transform="translate(33,57)"><ellipse cx="0" cy="0" rx="10" ry="6" fill="' + col + '"/><circle cx="-9" cy="-4" r="4.5" fill="' + col + '"/><path d="M-13 -4 L-20 -2 L-13 -1Z" fill="#f4a020"/><path d="M8 -1 L20 5 L8 4Z" fill="' + col + '"/><circle cx="-10" cy="-5" r="1.2" fill="#fff"/></g>';
  }
  function animal(m) {
    switch (m) {
      case 1: return bird('#e0b020');
      case 3: return bird('#56566a');
      case 7: return bird('#7a6450');
      case 11: return bird('#1f2a44');
      case 4: return '<path d="M6 68 Q30 44 54 68" stroke="#7a4a2a" stroke-width="5" fill="none"/><path d="M14 60 V70 M30 52 V62 M46 60 V70" stroke="#4a2a14" stroke-width="2"/>';
      case 5: return '<g transform="translate(34,56)"><ellipse cx="-7" cy="-3" rx="8" ry="5" fill="#3c82e0" transform="rotate(-25 -7 -3)"/><ellipse cx="7" cy="-3" rx="8" ry="5" fill="#3c82e0" transform="rotate(25 7 -3)"/><ellipse cx="-5" cy="5" rx="6" ry="4" fill="#7ab4ff"/><ellipse cx="5" cy="5" rx="6" ry="4" fill="#7ab4ff"/><rect x="-1" y="-6" width="2" height="16" fill="#222"/></g>';
      case 6: return '<g transform="translate(32,58)"><ellipse cx="0" cy="0" rx="14" ry="8" fill="#6b4a2b"/><circle cx="-13" cy="-2" r="6" fill="#6b4a2b"/><path d="M-16 3 L-19 9 M-13 3 L-12 9" stroke="#f5efe0" stroke-width="2.4"/><rect x="-9" y="6" width="3" height="8" fill="#4a2f1b"/><rect x="7" y="6" width="3" height="8" fill="#4a2f1b"/></g>';
      case 8: return '<path d="M16 52 H46 L41 70 H21Z" fill="#c0392b"/><ellipse cx="31" cy="52" rx="15" ry="3" fill="#f4d58a"/>';
      case 9: return '<g transform="translate(32,56)"><ellipse cx="0" cy="3" rx="12" ry="6" fill="#8a5a32"/><circle cx="-11" cy="-4" r="5" fill="#8a5a32"/><path d="M-13 -9 L-18 -17 M-13 -9 L-9 -17 M-16 -13 L-20 -14" stroke="#4a2f1b" stroke-width="2" fill="none"/><rect x="-8" y="8" width="3" height="9" fill="#5c3a1e"/><rect x="6" y="8" width="3" height="9" fill="#5c3a1e"/></g>';
    }
    return '';
  }
  function ribbon(sub) {
    var c = { h: '#d62f2f', c: '#2f6fd6', o: '#d8544a', p: '#c9a56c' }[sub] || '#d62f2f', s = '<path d="M3 51 H57 V65 H3 L7 58Z" fill="' + c + '" stroke="rgba(0,0,0,.25)" stroke-width="1"/>';
    if (sub === 'h') s += '<rect x="12" y="56" width="8" height="2.6" fill="#fff"/><rect x="26" y="56" width="8" height="2.6" fill="#fff"/><rect x="40" y="56" width="8" height="2.6" fill="#fff"/>';
    if (sub === 'c') s += '<circle cx="14" cy="58" r="2.2" fill="#fff"/><circle cx="30" cy="58" r="2.2" fill="#fff"/><circle cx="46" cy="58" r="2.2" fill="#fff"/>';
    return s;
  }
  var LB = KO ? { G: '광', r: '비광', A: '열끗', b: '고도리', h: '홍단', c: '청단', o: '초단', p: '띠', J: '피', d: '쌍피' }
              : { G: 'Bright', r: 'Rain', A: 'Animal', b: 'Bird', h: 'Poem', c: 'Blue', o: 'Plain', p: 'Ribbon', J: 'Junk', d: 'Junk x2' };
  function key(id) { var c = G.CLS[id], s = G.SUB[id]; if (c === 'G') return s === 'r' ? 'r' : 'G'; if (c === 'A') return s === 'b' ? 'b' : 'A'; if (c === 'R') return s; return s === 'd' ? 'd' : 'J'; }
  function bcol(id) { var c = G.CLS[id]; return c === 'R' ? COL[G.SUB[id]] : c === 'J' ? (G.SUB[id] === 'd' ? COL.d : COL.J) : COL[c]; }
  var cache = {};
  function svg(id) {
    if (cache[id]) return cache[id];
    var m = G.mon(id), c = G.CLS[id], s = G.SUB[id], col = bcol(id), out;
    out = '<svg viewBox="0 0 60 93" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><rect x="1.5" y="1.5" width="57" height="90" rx="6" fill="#fbf6e6" stroke="' + col + '" stroke-width="' + (c === 'G' ? 4 : c === 'J' ? 2 : 3) + '"/>';
    if (c === 'G') out += '<circle cx="30" cy="50" r="25" fill="#ffd54a" opacity=".38"/>';
    out += GLY[m]();
    if (c === 'A') out += animal(m);
    if (c === 'R') out += ribbon(s);
    out += '<circle cx="13" cy="15" r="10.5" fill="' + col + '"/><text x="13" y="20.5" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#fff">' + (m + 1) + '</text>';
    if (c === 'G') out += '<text x="47" y="22" text-anchor="middle" font-family="serif" font-size="17" font-weight="700" fill="#c08a00">光</text>';
    if (c === 'J' && s === 'd') out += '<text x="47" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#2f6a45">×2</text>';
    out += '<rect x="3.5" y="74" width="53" height="15.5" rx="4" fill="' + col + '"/><text x="30" y="85.5" text-anchor="middle" font-family="\'Malgun Gothic\',\'Noto Sans KR\',Arial,sans-serif" font-size="' + (KO ? 13 : 12) + '" font-weight="700" fill="#fff">' + LB[key(id)] + '</text></svg>';
    return (cache[id] = out);
  }
  root.CardFace = { svg: svg, label: function (id) { return LB[key(id)]; }, color: bcol, KO: KO };
})(window);
