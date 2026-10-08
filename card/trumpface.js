/* Standard 52-card poker faces + 2 jokers + a back, drawn as inline SVG (no image files).
   Card id: 0..51 = suit*13 + (rank-1)  with suit 0=spade 1=heart 2=diamond 3=club, rank 1(A)..13(K);  52 = black/white joker, 53 = colour joker.
   TrumpFace.svg(id) -> svg string (viewBox 100x140)   TrumpFace.back() -> svg string   TrumpFace.suit(s, px, color?) -> small suit svg
   TrumpFace.name(id) -> text such as "♠7"   The files uses no ids/patterns, so the svgs can be removed from the page in any order. */
(function (root) {
  'use strict';
  var BLK = '#1c2230', RED = '#d62839', SUITCH = ['♠', '♥', '♦', '♣'], RK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  function col(s) { return s === 1 || s === 2 ? RED : BLK; }
  /* suit symbols, each in a 100x100 box */
  function sym(s, c) {
    switch (s) {
      case 0: return '<path fill="' + c + '" d="M50 2 C88 30 98 50 98 64 C98 79 87 87 74 87 C63 87 54 82 50 73 C52 87 56 96 65 99 L35 99 C44 96 48 87 50 73 C46 82 37 87 26 87 C13 87 2 79 2 64 C2 50 12 30 50 2Z"/>';
      case 1: return '<path fill="' + c + '" d="M50 94 C12 66 2 44 2 30 C2 15 13 6 26 6 C38 6 46 13 50 22 C54 13 62 6 74 6 C87 6 98 15 98 30 C98 44 88 66 50 94Z"/>';
      case 2: return '<path fill="' + c + '" d="M50 2 L90 50 L50 98 L10 50Z"/>';
      default: return '<g fill="' + c + '"><circle cx="50" cy="28" r="24"/><circle cx="26" cy="62" r="24"/><circle cx="74" cy="62" r="24"/><circle cx="50" cy="56" r="14"/><path d="M50 50 Q50 82 35 98 L65 98 Q50 82 50 50Z"/></g>';
    }
  }
  function pip(s, cx, cy, size, flip) {
    return '<g transform="translate(' + cx + ' ' + cy + ')' + (flip ? ' rotate(180)' : '') + ' scale(' + (size / 100).toFixed(3) + ') translate(-50 -50)">' + sym(s, col(s)) + '</g>';
  }
  var L = 32, C = 50, R = 68;
  var LAYOUT = {
    2: [[C, 40], [C, 100]], 3: [[C, 40], [C, 70], [C, 100]],
    4: [[L, 40], [R, 40], [L, 100], [R, 100]], 5: [[L, 40], [R, 40], [C, 70], [L, 100], [R, 100]],
    6: [[L, 40], [R, 40], [L, 70], [R, 70], [L, 100], [R, 100]], 7: [[L, 40], [R, 40], [C, 55], [L, 70], [R, 70], [L, 100], [R, 100]],
    8: [[L, 40], [R, 40], [C, 55], [L, 70], [R, 70], [C, 85], [L, 100], [R, 100]],
    9: [[L, 40], [R, 40], [L, 60], [R, 60], [C, 70], [L, 80], [R, 80], [L, 100], [R, 100]],
    10: [[L, 40], [R, 40], [C, 50], [L, 60], [R, 60], [L, 80], [R, 80], [C, 90], [L, 100], [R, 100]]
  };
  function index(r, s) {
    var c = col(s), t = RK[r], fs = t.length > 1 ? 23 : 28;
    return '<text x="14" y="28" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="' + fs + '" fill="' + c + '"' + (t.length > 1 ? ' letter-spacing="-2"' : '') + '>' + t + '</text>' + pip(s, 14, 42, 16);
  }
  function wrap(inner, bg) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="138" rx="9" fill="' + (bg || '#fff') + '" stroke="#b9bfca" stroke-width="1.5"/>' + inner + '</svg>';
  }
  function star(cx, cy, R0, r0, fill, stroke) {
    var pts = [], k, a, rr;
    for (k = 0; k < 10; k++) { a = k * Math.PI / 5 - Math.PI / 2; rr = k % 2 ? r0 : R0; pts.push((cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1)); }
    return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="2" stroke-linejoin="round"' : '') + '/>';
  }
  function joker(color) {
    var cx = 56, cy = 68, R0 = 31, r0 = 14, s = '', k, a, a2, w = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];
    var txt = function (c) { return '<text transform="translate(17 12) rotate(90)" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="12.5" letter-spacing="1" fill="' + c + '">JOKER</text>'; };
    if (color) {
      for (k = 0; k < 5; k++) {      /* five coloured wedges of the star */
        a = (k * 2) * Math.PI / 5 - Math.PI / 2; a2 = (k * 2 + 2) * Math.PI / 5 - Math.PI / 2;
        var ai = a + Math.PI / 5;
        s += '<polygon points="' + cx + ',' + cy + ' ' + (cx + Math.cos(a) * R0).toFixed(1) + ',' + (cy + Math.sin(a) * R0).toFixed(1) + ' ' + (cx + Math.cos(ai) * r0).toFixed(1) + ',' + (cy + Math.sin(ai) * r0).toFixed(1) + '" fill="' + w[k] + '"/>' +
          '<polygon points="' + cx + ',' + cy + ' ' + (cx + Math.cos(ai) * r0).toFixed(1) + ',' + (cy + Math.sin(ai) * r0).toFixed(1) + ' ' + (cx + Math.cos(a2) * R0).toFixed(1) + ',' + (cy + Math.sin(a2) * R0).toFixed(1) + '" fill="' + w[(k + 2) % 6] + '"/>';
      }
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="#fff"/>';
      return wrap(s + '<g>' + txt('#d62839') + '</g><g transform="rotate(180 50 70)">' + txt('#d62839') + '</g>');
    }
    s = star(cx, cy, R0, r0, '#2b303c', '#2b303c') + star(cx, cy, 17, 8, '#fff') + '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="#2b303c"/>';
    return wrap(s + '<g>' + txt('#1c2230') + '</g><g transform="rotate(180 50 70)">' + txt('#1c2230') + '</g>', '#f3f4f6');
  }
  function svg(id) {
    if (id === 52) return joker(false);
    if (id === 53) return joker(true);
    var s = (id / 13) | 0, r = id % 13 + 1, c = col(s), out = '', i, p;
    out += index(r, s) + '<g transform="rotate(180 50 70)">' + index(r, s) + '</g>';
    if (r === 1) {
      out += pip(s, 50, 70, id === 0 ? 62 : 44) + (id === 0 ? '<circle cx="50" cy="70" r="40" fill="none" stroke="' + c + '" stroke-width="2.5"/>' : '');
    } else if (r >= 11) {
      out += '<rect x="26" y="30" width="48" height="80" rx="6" fill="' + (s === 1 || s === 2 ? '#fdecee' : '#eceef3') + '" stroke="' + c + '" stroke-width="2"/>' +
        '<text x="50" y="86" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif" font-weight="800" font-size="52" fill="' + c + '">' + RK[r] + '</text>' +
        pip(s, 50, 44, 16) + pip(s, 50, 98, 16, true);
      if (r === 13) out += '<path d="M33 36 L38 28 L44 34 L50 25 L56 34 L62 28 L67 36Z" fill="' + c + '" opacity=".0"/>';
    } else {
      var lay = LAYOUT[r];
      for (i = 0; i < lay.length; i++) { p = lay[i]; out += pip(s, p[0], p[1], 18, p[1] > 70); }
    }
    return wrap(out);
  }
  /* the back: dark blue with a white frame and a diagonal lattice (analytic line ends, no patterns/clip ids) */
  function back() {
    var x0 = 9, y0 = 9, x1 = 91, y1 = 131, d = '', c, a, b, pts;
    for (c = x0 + y0; c <= x1 + y1; c += 10) {          /* lines x + y = c */
      pts = []; if (c - y0 >= x0 && c - y0 <= x1) pts.push([c - y0, y0]); if (c - y1 >= x0 && c - y1 <= x1) pts.push([c - y1, y1]);
      if (c - x0 >= y0 && c - x0 <= y1) pts.push([x0, c - x0]); if (c - x1 >= y0 && c - x1 <= y1) pts.push([x1, c - x1]);
      if (pts.length >= 2) d += 'M' + pts[0][0] + ' ' + pts[0][1] + 'L' + pts[1][0] + ' ' + pts[1][1];
    }
    for (c = x0 - y1; c <= x1 - y0; c += 10) {          /* lines x - y = c */
      pts = []; if (c + y0 >= x0 && c + y0 <= x1) pts.push([c + y0, y0]); if (c + y1 >= x0 && c + y1 <= x1) pts.push([c + y1, y1]);
      if (x0 - c >= y0 && x0 - c <= y1) pts.push([x0, x0 - c]); if (x1 - c >= y0 && x1 - c <= y1) pts.push([x1, x1 - c]);
      if (pts.length >= 2) d += 'M' + pts[0][0] + ' ' + pts[0][1] + 'L' + pts[1][0] + ' ' + pts[1][1];
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="138" rx="9" fill="#fff" stroke="#b9bfca" stroke-width="1.5"/>' +
      '<rect x="6" y="6" width="88" height="128" rx="5" fill="#1d3a8a"/><path d="' + d + '" stroke="#6f8fe0" stroke-width="1.2" fill="none"/>' +
      '<rect x="6" y="6" width="88" height="128" rx="5" fill="none" stroke="#fff" stroke-width="1.5"/><ellipse cx="50" cy="70" rx="17" ry="22" fill="#e8ecf8" stroke="#1d3a8a" stroke-width="3"/>' +
      '<path d="M50 54 L56 70 L50 86 L44 70Z" fill="#c8283c"/></svg>';
  }
  function suitSvg(s, px, color) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + px + '" height="' + px + '">' + sym(s, color || col(s)) + '</svg>'; }
  function name(id) { return id >= 52 ? (id === 52 ? 'Joker' : 'Joker*') : SUITCH[(id / 13) | 0] + RK[id % 13 + 1]; }
  root.TrumpFace = { svg: svg, back: back, suit: suitSvg, name: name, SUITCH: SUITCH, RANKS: RK, color: col };
})(window);
