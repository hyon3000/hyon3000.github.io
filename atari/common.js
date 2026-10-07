// Shared helpers of the two Breakout versions (2D: game.html, 3D: game3d.html) - forked from Polynomino / Polycube:
// the same line-drawn font, background texture and start-screen look, plus the brick rules:
//   black brick = 2 hits, white brick = 3 hits, every other brick = 1 hit in a random fully saturated colour (HSV s = 100%, v = 100%).
(function () {
  const EMBEDDED_TEXTURES = window.TEXTURE_DATA_URLS || [];
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

  function hsv(h, s, v) {                       // h in [0,1)
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const c = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
  }
  // a new brick: {hits (hits left), max, kind: 'black' | 'white' | 'gray' | 'color', rgb, seed}
  //   black 2 hits, white 3 hits, gray 5 hits, every other brick 1 hit in a random fully saturated colour
  // chance that a brick is a multi-hit one (black / white / gray), given how many of its neighbours already are: they come in clusters
  function toughProb(level, n) { const base = [0.07 + 0.005 * level, 0.5, 0.66, 0.8][Math.min(3, n)]; return Math.min(0.92, base * (1 + 0.06 * (level - 1))); }
  function makeBrick(level, tough) {
    const ir = Math.random(), item = ir < 0.02 ? 'short' : (ir < 0.03 ? 'long' : (ir < 0.04 ? 'hide' : (ir < 0.05 ? 'ghost' : (ir < 0.06 ? 'power' : (ir < 0.08 ? 'fast' : (ir < 0.09 ? 'slow' : (ir < 0.11 ? 'norm' : (ir < 0.12 ? 'fake' : null))))))));     // an item hidden inside the brick: 'short' (blue) 2%, 'fast' (pink: time x2) 2%, the others 1% each ('slow' = cyan: time x0.5), 'norm' (purple, 2%) = time scale and paddle length back to normal, 'fake' (white, 1%) = two decoy balls for 10 s: 'long' (orange), 'hide' = paddle hidden (red), 'ghost' = ball invisible (green), 'power' = black ball that breaks every brick in one hit
    const r = Math.random(), pb = Math.min(0.28, 0.12 + 0.02 * level), pw = Math.min(0.18, 0.06 + 0.015 * level), pg = Math.min(0.12, 0.03 + 0.01 * level), seed = Math.floor(Math.random() * 1e9);
    if (tough === true) { const q = Math.random() * (0.5 + 0.3 + 0.2); const k = q < 0.5 ? 'black' : (q < 0.8 ? 'white' : 'gray'); return k === 'black' ? { kind: 'black', hits: 2, max: 2, rgb: [0, 0, 0], seed: seed, item: item } : (k === 'white' ? { kind: 'white', hits: 3, max: 3, rgb: [255, 255, 255], seed: seed, item: item } : { kind: 'gray', hits: 5, max: 5, rgb: [128, 128, 128], seed: seed, item: item }); }
    if (tough === false) return { kind: 'color', hits: 1, max: 1, rgb: hsv(Math.random(), 1, 1), seed: seed, item: item };
    if (r < pb) return { kind: 'black', hits: 2, max: 2, rgb: [0, 0, 0], seed: seed, item: item };
    if (r < pb + pw) return { kind: 'white', hits: 3, max: 3, rgb: [255, 255, 255], seed: seed, item: item };
    if (r < pb + pw + pg) return { kind: 'gray', hits: 5, max: 5, rgb: [128, 128, 128], seed: seed, item: item };
    return { kind: 'color', hits: 1, max: 1, rgb: hsv(Math.random(), 1, 1), seed: seed, item: item };
  }
  // cracks of a damaged brick: n zig-zag paths in the unit square (the first ones appear first), the same for a given seed
  function crackPaths(seed, n) {
    let t = seed >>> 0; const rnd = function () { t = (t + 0x6D2B79F5) >>> 0; let x = t; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const out = [];
    for (let i = 0; i < n; i++) {
      const edge = i % 4, k = 0.15 + 0.7 * rnd(); let x, y, dx, dy;
      if (edge === 0) { x = k; y = 0; dx = 0; dy = 1; } else if (edge === 1) { x = 1; y = k; dx = -1; dy = 0; } else if (edge === 2) { x = k; y = 1; dx = 0; dy = -1; } else { x = 0; y = k; dx = 1; dy = 0; }
      const pts = [[x, y]], len = 3 + Math.floor(rnd() * 2);
      for (let j = 0; j < len; j++) { x += dx * (0.18 + 0.12 * rnd()) + (rnd() - 0.5) * 0.35 * (dy !== 0 ? 1 : 0); y += dy * (0.18 + 0.12 * rnd()) + (rnd() - 0.5) * 0.35 * (dx !== 0 ? 1 : 0); pts.push([Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))]); }
      out.push(pts);
    }
    return out;
  }
  function loadTexture(i) {
    return new Promise(function (res) {
      const src = EMBEDDED_TEXTURES[i]; if (!src) { res(null); return; }
      const im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src;
    });
  }
  function loadStartBg() {
    return new Promise(function (res) {
      if (!window.ATARI_START_BG) { res(null); return; }
      const im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = window.ATARI_START_BG;
    });
  }
  // description line shown while an item falls (like the special-block line of the Tetris games: "Name: effect", cyan = good, orange = bad)
  const KO = /^ko/i.test(navigator.language || 'ko');
  const ITEM_DESC = KO ? { short: '짧아짐: 판 길이가 절반이 됨', long: '길어짐: 판 길이가 두 배가 됨', hide: '판 숨김: 3초 동안 판이 사라짐', ghost: '공 숨김: 5초 동안 공이 안 보임', power: '공 강화: 30초 동안 모든 블록을 한 번에 깸', fast: '시간 가속: 30초 동안 시간이 두 배 빠르게 흐름', slow: '시간 감속: 30초 동안 시간이 절반 속도로 흐름', norm: '정상화: 시간 속도와 판 길이가 원래대로 돌아옴', fake: '가짜 공: 10초 동안 똑같이 생긴 가짜 공 두 개가 돌아다님' }
                        : { short: 'Short: paddle length x1/2', long: 'Long: paddle length x2', hide: 'Paddle hide: no paddle for 3 s', ghost: 'Ball hide: invisible ball for 5 s', power: 'Power ball: breaks everything in one hit for 30 s', fast: 'Time x2: time flows twice as fast for 30 s', slow: 'Time x1/2: time flows at half speed for 30 s', norm: 'Normalize: time speed and paddle length back to normal', fake: 'Fake balls: two identical decoy balls roam for 10 s' };
  const ITEM_GOOD = { long: 1, power: 1, slow: 1, norm: 1 };
  function drawItemInfo(ctx, cw, y, type) {
    const c = window.BO.ITEM_RGB[type], fs = Math.max(9, Math.floor(cw * 0.03)), r = fs * 0.62;
    ctx.save(); ctx.font = 'bold ' + fs + 'px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(ITEM_DESC[type]).width, x0 = Math.max(r + 4, (cw - (tw + r * 2.6)) / 2) + r;
    const g = ctx.createRadialGradient(x0 - r * 0.3, y - r * 0.3, r * 0.1, x0, y, r); g.addColorStop(0, '#fff'); g.addColorStop(0.4, 'rgb(' + c.join(',') + ')'); g.addColorStop(1, 'rgb(' + c.map(function (v) { return Math.round(v * 0.55); }).join(',') + ')');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x0, y, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = ITEM_GOOD[type] ? '#0ff' : '#f90'; ctx.fillText(ITEM_DESC[type], x0 + r * 1.6, y); ctx.restore();
  }
  window.BO = { toughProb: toughProb, drawItemInfo: drawItemInfo, drawLineString: drawLineString, drawLineStringCentered: drawLineStringCentered, hsv: hsv, makeBrick: makeBrick, loadTexture: loadTexture, loadStartBg: loadStartBg,
    crackPaths: crackPaths, ITEM_RGB: { short: [40, 110, 255], long: [255, 150, 20], hide: [235, 30, 30], ghost: [40, 205, 70], power: [0, 0, 0], fast: [255, 105, 190], slow: [0, 210, 200], norm: [160, 70, 235], fake: [255, 255, 255] }, SCORE: { color: 10, black: 25, white: 40, gray: 70 } };
})();
