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
  const COLORS = [[235, 40, 50], [40, 110, 255], [40, 200, 70], [255, 215, 30], [170, 70, 235], [0, 205, 215], [255, 135, 20], [255, 110, 190]];   // red blue green yellow purple cyan orange pink
  const KO = /^ko/i.test(navigator.language || 'ko');
  function label(ctx, txt, x, y, size, color, align) { ctx.font = 'bold ' + Math.round(size) + 'px "Noto Sans KR","Malgun Gothic",sans-serif'; ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y); }
  function octo(ctx, x, y, r) { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
  // a faceted gem (octagon) with a mark per colour; dim in (0,1] darkens (depth cue in 3D), alpha fades
  function drawGem(ctx, x, y, r, ci, dim, alpha) {
    const c = COLORS[ci] || [200, 200, 200]; dim = dim === undefined ? 1 : dim;
    ctx.save(); if (alpha !== undefined) ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, mix(c, [255, 255, 255], 0.55 * dim)); g.addColorStop(0.5, mix(c, [0, 0, 0], (1 - dim) * 0.8)); g.addColorStop(1, mix(c, [0, 0, 0], 0.45 + (1 - dim) * 0.5));
    ctx.fillStyle = g; octo(ctx, x, y, r); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke();
    if (r >= 5) {
      octo(ctx, x, y, r * 0.72); ctx.fillStyle = mix(c, [0, 0, 0], (1 - dim) * 0.7 + 0.12); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 * dim) + ')'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * dim) + ')'; ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.5, r * 0.2, r * 0.1, -0.6, 0, 7); ctx.fill();
      ctx.globalAlpha = (alpha === undefined ? 1 : alpha) * (0.5 + 0.5 * dim); drawMark(ctx, ci, x, y + r * 0.04, r * 1.05);
    }
    ctx.restore();
  }
  function loadTexture(i) { return new Promise(function (res) { const s = (window.TEXTURE_DATA_URLS || [])[i]; if (!s) { res(null); return; } const im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = s; }); }
  const L = KO ? { over: '게임 오버', retry: '다시 하려면 터치', start: '터치하여 시작', title: '스왑 퍼즐', moves: '이동', target: '목표', level: '레벨', best: '최고', colors: '색' }
              : { over: 'GAME OVER', retry: 'TAP TO RETRY', start: 'TAP TO START', title: 'SWAP PUZZLE', moves: 'MOVES', target: 'TARGET', level: 'LEVEL', best: 'BEST', colors: 'COLORS' };
  // HUD: score / best on the left, level / moves on the right, a target progress bar below.  Returns the y below the HUD.
  function drawHud(ctx, G, cw, ch) {
    const hs = Math.max(8, cw * 0.045), hy = ch * 0.018, lo = G.tgt(G.level - 1);
    drawLineString(ctx, cw * 0.04, hy, hs, 'SCORE ' + G.score, '#fff');
    drawLineString(ctx, cw * 0.04, hy + hs * 1.35, hs * 0.7, 'BEST ' + G.best, '#888');
    drawLineString(ctx, cw * 0.64, hy, hs, 'LV ' + G.level, '#0ff');
    drawLineString(ctx, cw * 0.64, hy + hs * 1.35, hs * 0.7, G.auto ? 'AUTO PLAY' : G.nc + ' ' + L.colors, G.auto ? '#6f6' : '#f9c');
    const by = hy + hs * 2.7, bh = Math.max(6, ch * 0.022), bx = cw * 0.04, bw = cw * 0.92, prog = Math.max(0, Math.min(1, (G.score - lo) / (G.target - lo)));
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = '#4c8'; ctx.fillRect(bx, by, bw * prog, bh); ctx.strokeStyle = '#9ab'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
    const ty = by + bh + hs * 0.55;
    drawLineString(ctx, bx, ty - hs * 0.3, hs * 0.6, 'TARGET ' + G.target, '#cde');
    const low = G.moves <= 3;
    drawLineString(ctx, cw * 0.64, ty - hs * 0.3, hs * 0.75, 'MOVES ' + G.moves, low ? '#f66' : '#fd4');
    return ty + hs * 0.7;
  }
  function drawMsg(ctx, G, cw, y) {
    if (G.msgT > 0 && G.msg) { ctx.save(); ctx.globalAlpha = Math.min(1, G.msgT * 2); const sz = cw * (G.msg.length > 16 ? 0.05 : 0.065); ctx.fillStyle = 'rgba(0,0,0,0.6)'; const w = Math.min(cw, G.msg.length * sz * 0.8 + sz * 2); ctx.fillRect(cw / 2 - w / 2, y - sz * 0.9, w, sz * 1.8); label(ctx, G.msg, cw / 2, y, sz, '#ff0'); ctx.restore(); }
  }
  function drawPop(ctx, p, x, y, cw) { const k = p.t / 1.1; ctx.save(); ctx.globalAlpha = 1 - k * k; const sz = cw * (0.05 + Math.min(p.chain, 5) * 0.006); ctx.lineWidth = Math.max(2, sz * 0.12); ctx.strokeStyle = '#000'; ctx.font = 'bold ' + Math.round(sz) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(p.text, x, y - k * sz * 1.6); ctx.fillStyle = p.chain > 1 ? '#ff6' : '#fff'; ctx.fillText(p.text, x, y - k * sz * 1.6); ctx.restore(); }
  function drawStart(ctx, G, cw, ch, tex, sub, hint) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch); if (tex) { ctx.globalAlpha = 0.6; ctx.drawImage(tex, 0, 0, cw, ch); ctx.globalAlpha = 1; }
    const ts = Math.max(20, cw * 0.11); ctx.lineWidth = 1.5; drawLineStringCentered(ctx, cw / 2, ch * 0.14, ts, 'SWAP', '#fff'); drawLineStringCentered(ctx, cw / 2, ch * 0.14 + ts * 1.5, ts * 0.9, 'PUZZLE', '#8cf');
    drawLineStringCentered(ctx, cw / 2, ch * 0.14 + ts * 3.05, ts * 0.6, sub, '#ff0'); if (KO) label(ctx, L.title, cw / 2, ch * 0.14 + ts * 4.4, cw * 0.06, '#ff0');
    const rr = cw * 0.052; for (let i = 0; i < 6; i++) drawGem(ctx, cw * (0.18 + i * 0.128), ch * 0.5, rr, i);
    const bw = cw * 0.5, bh = ch * 0.07; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(cw / 2 - bw / 2, ch * 0.6, bw, bh);
    drawLineStringCentered(ctx, cw / 2, ch * 0.6 + bh * 0.22, Math.max(10, bh * 0.55), 'START', '#fff'); if (KO) label(ctx, L.start, cw / 2, ch * 0.6 + bh * 1.6, cw * 0.04, '#ddd');
    if (G.best) drawLineStringCentered(ctx, cw / 2, ch * 0.78, Math.max(9, cw * 0.045), 'BEST ' + G.best, '#8cf');
    hint.forEach(function (t, i) { label(ctx, t, cw / 2, ch * (0.87 + i * 0.04), cw * 0.03, '#bbb'); });
  }
  function drawOver(ctx, G, cw, ch, x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x, y, w, h);
    drawLineStringCentered(ctx, cw / 2, y + h * 0.2, cw * 0.075, 'GAME OVER', '#f55'); drawLineStringCentered(ctx, cw / 2, y + h * 0.4, cw * 0.045, 'SCORE ' + G.score, '#fff');
    drawLineStringCentered(ctx, cw / 2, y + h * 0.52, cw * 0.035, 'LV ' + G.level + '  BEST ' + G.best, '#8cf'); label(ctx, L.retry, cw / 2, y + h * 0.75, cw * 0.05, '#0ff');
  }
  window.SWUI = { KO: KO, L: L, COLORS: COLORS, drawGem: drawGem, drawMark: drawMark, label: label, loadTexture: loadTexture, drawLineString: drawLineString, drawLineStringCentered: drawLineStringCentered, drawHud: drawHud, drawMsg: drawMsg, drawPop: drawPop, drawStart: drawStart, drawOver: drawOver };
})();
