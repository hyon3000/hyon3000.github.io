// Shared helpers of the two Bubble Shooter versions (line font forked from the Atari / Polycube games, bubble drawing, colour rules).
(function () {
function drawLineChar(ctx, x, y, scale, char, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, scale * 0.09);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const w = scale * 0.7;
  const h = scale;
  // segments: arrays of [x0,y0,x1,y1] as fractions of w,h
  const segs = {
    '0': [[w,0,0,0],[0,0,0,h],[0,h,w,h],[w,h,w,0]],
    '1': [[w/2,0,w/2,h]],
    '2': [[0,0,w,0],[w,0,w,h/2],[w,h/2,0,h/2],[0,h/2,0,h],[0,h,w,h]],
    '3': [[0,0,w,0],[w,0,w,h/2],[w,h/2,0,h/2],[0,h/2,w,h/2],[w,h/2,w,h],[w,h,0,h]],
    '4': [[0,0,0,h/2],[0,h/2,w,h/2],[w,0,w,h]],
    '5': [[w,0,0,0],[0,0,0,h/2],[0,h/2,w,h/2],[w,h/2,w,h],[w,h,0,h]],
    '6': [[w,0,0,0],[0,0,0,h],[0,h,w,h],[w,h,w,h/2],[w,h/2,0,h/2]],
    '7': [[0,h/2,0,0],[0,0,w,0],[w,0,w,h]],
    '8': [[0,0,0,h],[0,h,w,h],[w,h,w,0],[w,0,0,0],[0,h/2,w,h/2]],
    '9': [[w,h/2,0,h/2],[0,h/2,0,0],[0,0,w,0],[w,0,w,h],[w,h,0,h]],
    'S': [[w,0,0,0],[0,0,0,h/2],[0,h/2,w,h/2],[w,h/2,w,h],[w,h,0,h]],
    'C': [[w,0,0,0],[0,0,0,h],[0,h,w,h]],
    'O': [[0,0,w,0],[w,0,w,h],[w,h,0,h],[0,h,0,0]],
    'R': [[0,0,0,h],[0,0,w,0],[w,0,w,h/2],[w,h/2,0,h/2],[0,h/2,w,h]],
    'E': [[w,0,0,0],[0,0,0,h],[0,h,w,h],[0,h/2,w*0.7,h/2]],
    'L': [[0,0,0,h],[0,h,w,h]],
    'I': [[w/2,0,w/2,h],[w*0.2,0,w*0.8,0],[w*0.2,h,w*0.8,h]],
    'N': [[0,h,0,0],[0,0,w,h],[w,h,w,0]],
    'V': [[0,0,w/2,h],[w/2,h,w,0]],
    'H': [[0,0,0,h],[w,0,w,h],[0,h/2,w,h/2]],
    'G': [[w,0,0,0],[0,0,0,h],[0,h,w,h],[w,h,w,h/2],[w,h/2,w/2,h/2]],
    'P': [[0,h,0,0],[0,0,w,0],[w,0,w,h/2],[w,h/2,0,h/2]],
    'T': [[0,0,w,0],[w/2,0,w/2,h]],
    'A': [[0,h,0,0],[0,0,w,0],[w,0,w,h],[0,h/2,w,h/2]],
    'M': [[0,h,0,0],[0,0,w/2,h/2],[w/2,h/2,w,0],[w,0,w,h]],
    'Y': [[0,0,w/2,h/2],[w,0,w/2,h/2],[w/2,h/2,w/2,h]],
    'U': [[0,0,0,h],[0,h,w,h],[w,h,w,0]],
    'B': [[0,0,0,h],[0,0,w*0.8,0],[w*0.8,0,w*0.8,h/2],[w*0.8,h/2,0,h/2],[0,h/2,w,h/2],[w,h/2,w,h],[w,h,0,h]],
    'X': [[0,0,w,h],[w,0,0,h]],
    'D': [[0,0,0,h],[0,0,w*0.7,0],[w*0.7,0,w,h*0.25],[w,h*0.25,w,h*0.75],[w,h*0.75,w*0.7,h],[w*0.7,h,0,h]],
    'F': [[w,0,0,0],[0,0,0,h],[0,h/2,w*0.7,h/2]],
    'W': [[0,0,0,h],[0,h,w/2,h/2],[w/2,h/2,w,h],[w,h,w,0]],
    'K': [[0,0,0,h],[w,0,0,h/2],[0,h/2,w,h]],
    'J': [[w,0,w,h],[w,h,0,h],[0,h,0,h*0.7]],
    'Q': [[0,0,w,0],[w,0,w,h],[w,h,0,h],[0,h,0,0],[w*0.5,h*0.5,w,h]],
    'Z': [[0,0,w,0],[w,0,0,h],[0,h,w,h]],
    ':': [],
    '+': [[w/2,h*0.2,w/2,h*0.8],[w*0.1,h/2,w*0.9,h/2]],
    '-': [[w*0.1,h/2,w*0.9,h/2]],
    ' ': [],
  };
  const s = segs[char];
  if (!s) return;
  // Special: colon draws two dots
  if (char === ':') {
    ctx.beginPath();
    ctx.arc(x + w/2, y + h*0.3, scale*0.08, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w/2, y + h*0.7, scale*0.08, 0, Math.PI*2);
    ctx.stroke();
    return;
  }
  for (const seg of s) {
    ctx.beginPath();
    ctx.moveTo(x + seg[0], y + seg[1]);
    ctx.lineTo(x + seg[2], y + seg[3]);
    ctx.stroke();
  }
}

function drawLineString(ctx, x, y, scale, str, color) {
  const spacing = scale * 0.85;
  for (let i = 0; i < str.length; i++) {
    drawLineChar(ctx, x + i * spacing, y, scale, str[i].toUpperCase(), color);
  }
}

function drawLineStringCentered(ctx, cx, y, scale, str, color) {
  const spacing = scale * 0.85;
  const totalW = str.length * spacing;
  drawLineString(ctx, cx - totalW / 2, y, scale, str, color);
}

  const COLORS = [[235, 40, 50], [40, 110, 255], [40, 200, 70], [255, 215, 30], [170, 70, 235], [0, 205, 215], [255, 135, 20], [255, 110, 190]];   // red blue green yellow purple cyan orange pink
  function numColors(level) { return Math.min(COLORS.length, Math.ceil(Math.sqrt(2 + level))); }
  function missLimit(level) { return Math.max(3, 5 - Math.floor((level - 1) / 4)); }
  function mix(c, t, k) { return 'rgb(' + c.map(function (v, i) { return Math.round(v + (t[i] - v) * k); }).join(',') + ')'; }
  // small mark on every colour so that colour-blind players can tell them apart
  function drawMark(ctx, ci, x, y, r) {
    const m = r * 0.36; ctx.save(); ctx.translate(x, y);
    const dark = ci === 3 || ci === 5 || ci === 7; ctx.fillStyle = dark ? 'rgba(40,25,0,0.8)' : 'rgba(255,255,255,0.9)'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, r * 0.13); ctx.lineCap = 'round';
    ctx.beginPath();
    if (ci === 0) { ctx.moveTo(0, -m * 1.2); ctx.lineTo(m, 0); ctx.lineTo(0, m * 1.2); ctx.lineTo(-m, 0); ctx.closePath(); ctx.fill(); }          // diamond
    else if (ci === 1) { ctx.arc(0, 0, m, 0, 7); ctx.stroke(); }                                                                                    // ring
    else if (ci === 2) { ctx.moveTo(0, -m * 1.1); ctx.lineTo(m * 1.05, m * 0.8); ctx.lineTo(-m * 1.05, m * 0.8); ctx.closePath(); ctx.fill(); }  // triangle
    else if (ci === 3) { ctx.rect(-m * 0.85, -m * 0.85, m * 1.7, m * 1.7); ctx.fill(); }                                                           // square
    else if (ci === 4) { ctx.moveTo(-m, -m); ctx.lineTo(m, m); ctx.moveTo(m, -m); ctx.lineTo(-m, m); ctx.stroke(); }                                // x
    else if (ci === 5) { ctx.moveTo(-m * 1.2, 0); ctx.lineTo(m * 1.2, 0); ctx.stroke(); }                                                           // bar
    else if (ci === 6) { ctx.moveTo(0, -m * 1.2); ctx.lineTo(0, m * 1.2); ctx.moveTo(-m * 1.2, 0); ctx.lineTo(m * 1.2, 0); ctx.stroke(); }          // plus
    else { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? m * 0.5 : m * 1.25; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); } ctx.closePath(); ctx.fill(); }   // star
    ctx.restore();
  }
  // a glossy bubble; dim in (0,1] darkens (depth cue in 3D), alpha fades
  function drawBubble(ctx, x, y, r, ci, dim, alpha) {
    const c = COLORS[ci] || [200, 200, 200]; dim = dim === undefined ? 1 : dim;
    ctx.save(); if (alpha !== undefined) ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.08, x, y, r);
    g.addColorStop(0, mix(c, [255, 255, 255], 0.7 * dim + 0.1)); g.addColorStop(0.45, mix(c, [0, 0, 0], 1 - dim)); g.addColorStop(1, mix(c, [0, 0, 0], 0.5 + (1 - dim) * 0.5));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(1, r * 0.07); ctx.stroke();
    if (r >= 4) { ctx.globalAlpha = (alpha === undefined ? 1 : alpha) * (0.45 + 0.55 * dim); drawMark(ctx, ci, x, y, r); }
    ctx.restore();
  }
  function loadTexture(i) { return new Promise(function (res) { const s = (window.TEXTURE_DATA_URLS || [])[i]; if (!s) { res(null); return; } const im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = s; }); }
  function loadStartBg() { return new Promise(function (res) { if (!window.ATARI_START_BG) { res(null); return; } const im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = window.ATARI_START_BG; }); }
  const KO = /^ko/i.test(navigator.language || 'ko');
  window.BO = { KO: KO, COLORS: COLORS, numColors: numColors, missLimit: missLimit, drawBubble: drawBubble, drawMark: drawMark, loadTexture: loadTexture, loadStartBg: loadStartBg, drawLineString: drawLineString, drawLineStringCentered: drawLineStringCentered };
})();
