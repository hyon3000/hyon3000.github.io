const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8765/polycube';

const GAMES = {
  '2d': {
    file: '/workspace/stuff/polycube/polynomino/web/app.js',
    url: `${BASE}/polynomino/game.html`,
    debug: '/tmp/debug_2d_block.png',
    out: '/workspace/stuff/polycube/polynomino/assets/blocks/sp_reinforce.png',
    size: [120, 120],
    patches: [
      {
        insertAfter: 'state.board = create2d(BOARD_W, BOARD_H);',
        injection: '\n  state.board[10][5] = 204; state.startscreen = 0; state.pause = true; state._blockCapture = true;',
      },
      {
        insertAfter: 'else if (state.pause) drawPauseScreen();\n  else drawScene();',
        injection: '\n  if (state.pause) drawScene();',
      },
      {
        insertAfter: 'function drawScene() {',
        injection: '\n  if (state._blockCapture) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, state.canvasW, state.canvasH); const cs = Math.floor(Math.min(state.canvasW / BOARD_W, state.canvasH / BOARD_H)); for (let r = 0; r < BOARD_H; r++) for (let c = 0; c < BOARD_W; c++) { const v = state.board[r][c]; if (v && v < 256) drawCell(c * cs, (BOARD_H - 1 - r) * cs, cs, cs, v); } return; }',
      },
    ],
  },
  '3d': {
    file: '/workspace/stuff/polycube/web/app.js',
    url: `${BASE}/game.html`,
    debug: '/tmp/debug_3d_block.png',
    out: '/workspace/stuff/polycube/assets/blocks/sp_reinforce.png',
    size: [512, 512],
    patches: [
      {
        insertAfter: 'clear3d(state.blk, 0);',
        injection: '\n  state.blk[3][3][5] = 204; state.startscreen = 0; state.pause = true; state.wAngleX = 25; state.wAngleY = 35; state._blockCapture = true;',
      },
      {
        insertAfter: 'else if (state.pause) { ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); drawPauseScreen(); }\n  else drawScene3d();',
        injection: '\n  if (state.pause) drawScene3d();',
      },
      {
        // Skip board outline in drawBoardAndBlocks - early return after blocks
        insertAfter: 'if (state.blindboard > now()) return;',
        injection: '\n  if (state._blockCapture) { const t2 = state.t2; for (let x=0;x<7;x++) for (let y=0;y<7;y++) for (let z=0;z<26;z++) { if (state.blk[x][y][z]) drawBlockVisual(x,y,z,state.blk[x][y][z],t2); } return; }',
      },
      {
        insertAfter: 'function drawControlOverlay() {',
        injection: '\n  if (state._blockCapture) return;',
      },
      {
        insertAfter: 'function drawGraphOverlay() {',
        injection: '\n  if (state._blockCapture) return;',
      },
      {
        // Skip background texture
        insertAfter: 'function drawScene3d() {',
        injection: '\n  if (state._blockCapture) { renderer.lineWidth(1.4); renderer.matrixMode("MODELVIEW"); renderer.loadIdentity(); renderer.clearColor(0,0,0,1); renderer.clear(renderer.gl.COLOR_BUFFER_BIT|renderer.gl.DEPTH_BUFFER_BIT); renderer.viewport(0,state.activitysizey/40,state.activitysizex,(state.activitysizey*41)/40); renderer.translatef(state.centerx-0.6,state.centery,-4); renderer.rotatef(state.wAngleX,1,0,0); renderer.rotatef(state.wAngleY,0,1,0); renderer.rotatef(state.wAngleZ,0,0,1); drawBoardAndBlocks(); return; }',
      },
    ],
  },
  '4d': {
    file: '/workspace/stuff/polycube/polytesseract/web/app.js',
    url: `${BASE}/polytesseract/game.html`,
    debug: '/tmp/debug_4d_block.png',
    out: '/workspace/stuff/polycube/polytesseract/assets/blocks/sp_reinforce.png',
    size: [28, 26],
    patches: [
      {
        insertAfter: 'clear4d(state.blk, 0);',
        injection: '\n  state.blk[3][3][5][3] = 204; state.startscreen = 0; state.pause = true; state.captureMode = true;',
      },
      {
        insertAfter: 'else if (state.pause) { ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); drawPauseScreen(); }\n  else { if (state.captureMode) ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); drawScene3d(); }',
        injection: '\n  if (state.pause) drawScene3d();',
      },
      {
        insertAfter: 'function drawControlOverlay() {',
        injection: '\n  if (state.captureMode) return;',
      },
    ],
  },
};

function patchFile(filepath, patches) {
  let content = fs.readFileSync(filepath, 'utf8');
  const original = content;
  for (const { insertAfter, injection } of patches) {
    const idx = content.indexOf(insertAfter);
    if (idx === -1) throw new Error(`Patch not found in ${filepath}: "${insertAfter.substring(0,60)}"`);
    content = content.slice(0, idx + insertAfter.length) + injection + content.slice(idx + insertAfter.length);
  }
  fs.writeFileSync(filepath, content, 'utf8');
  return original;
}

(async () => {
  const originals = {};
  for (const [key, g] of Object.entries(GAMES)) {
    console.log(`Patching ${key}...`);
    originals[key] = patchFile(g.file, g.patches);
  }
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [key, g] of Object.entries(GAMES)) {
      console.log(`=== ${key} ===`);
      const dpr = key === '3d' ? 4 : key === '4d' ? 1 : 2;
      const vw = key === '3d' ? 720 : 360;
      const vh = key === '3d' ? 1440 : 720;
      const ctx = await browser.newContext({ viewport:{width:vw,height:vh}, deviceScaleFactor:dpr, hasTouch:true, isMobile:true });
      const page = await ctx.newPage();
      await page.goto(g.url, { waitUntil:'load' });
      await page.waitForSelector('canvas#app');
      await page.waitForTimeout(4000);
      await page.screenshot({ path: g.debug });
      await page.close(); await ctx.close();
    }
  } finally {
    await browser.close();
    for (const [key, g] of Object.entries(GAMES)) {
      fs.writeFileSync(g.file, originals[key], 'utf8');
      console.log(`Restored ${key}`);
    }
  }

  // Crop
  const { execSync } = require('child_process');
  execSync(`python3 << 'PYEOF'
import sys
sys.path.insert(0,'.')
from PIL import Image

for name, debug, out, sz in [
    ('2D', '/tmp/debug_2d_block.png', '/workspace/stuff/polycube/polynomino/assets/blocks/sp_reinforce.png', (120,120)),
    ('3D', '/tmp/debug_3d_block.png', '/workspace/stuff/polycube/assets/blocks/sp_reinforce.png', (512,512)),
    ('4D', '/tmp/debug_4d_block.png', '/workspace/stuff/polycube/polytesseract/assets/blocks/sp_reinforce.png', (28,26)),
]:
    img = Image.open(debug).convert('RGB')
    # Find non-black bounding box (threshold > 15 to skip dark noise)
    px = [(x,y) for y in range(img.size[1]) for x in range(img.size[0]) if sum(img.getpixel((x,y))) > 30]
    if not px:
        print(f'{name}: NO CONTENT'); continue
    xs,ys = [p[0] for p in px],[p[1] for p in px]
    bx1,by1,bx2,by2 = min(xs),min(ys),max(xs),max(ys)
    bw,bh = bx2-bx1+1, by2-by1+1
    print(f'{name}: block ({bx1},{by1})-({bx2},{by2}) = {bw}x{bh}')
    crop = img.crop((bx1-1, by1-1, bx2+2, by2+2))
    # Black out very dark pixels
    for y in range(crop.size[1]):
        for x in range(crop.size[0]):
            r,g,b = crop.getpixel((x,y))
            if r < 10 and g < 10 and b < 10: crop.putpixel((x,y),(0,0,0))
    tw,th = sz
    scale = min(tw*0.67/crop.size[0], th*0.67/crop.size[1])
    nw,nh = int(crop.size[0]*scale), int(crop.size[1]*scale)
    resized = crop.resize((nw,nh), Image.LANCZOS)
    result = Image.new('RGB', sz, (0,0,0))
    result.paste(resized, ((tw-nw)//2, (th-nh)//2))
    result.save(out)
    print(f'  -> {out}')
PYEOF`, { stdio: 'inherit' });
})();
