const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8765/polycube';

// Each game needs two patches:
//   1. In initBlockState: place the 204 block + skip start screen + set pause
//   2. In drawFrame: also call drawScene when paused, so the board is visible

const GAMES = {
  '2d': {
    file: '/workspace/stuff/polycube/polynomino/web/app.js',
    url: `${BASE}/polynomino/game.html`,
    debug: '/tmp/debug_2d_block.png',
    patches: [
      {
        // After board is created in initBlockState, place block + skip start + pause
        insertAfter: 'state.board = create2d(BOARD_W, BOARD_H);',
        injection: '\n  state.board[0][5] = 204; state.startscreen = 0; state.pause = true;',
      },
      {
        // In drawFrame: when paused, also draw the scene (after pause overlay)
        insertAfter: 'else if (state.pause) drawPauseScreen();\n  else drawScene();',
        injection: '\n  if (state.pause) drawScene();',
      },
    ],
  },
  '3d': {
    file: '/workspace/stuff/polycube/web/app.js',
    url: `${BASE}/game.html`,
    debug: '/tmp/debug_3d_block.png',
    patches: [
      {
        insertAfter: 'clear3d(state.blk, 0);',
        injection: '\n  state.blk[3][3][5] = 204; state.startscreen = 0; state.pause = true; state.wAngleX = 25; state.wAngleY = 35;',
      },
      {
        // In drawFrame: when paused, also draw the 3D scene
        insertAfter: 'else if (state.pause) { ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); drawPauseScreen(); }\n  else drawScene3d();',
        injection: '\n  if (state.pause) drawScene3d();',
      },
    ],
  },
  '4d': {
    file: '/workspace/stuff/polycube/polytesseract/web/app.js',
    url: `${BASE}/polytesseract/game.html`,
    debug: '/tmp/debug_4d_block.png',
    patches: [
      {
        insertAfter: 'clear4d(state.blk, 0);',
        injection: '\n  state.blk[3][3][0][3] = 204; state.startscreen = 0; state.pause = true;',
      },
      {
        // In drawFrame: when paused, also draw the 3D scene
        insertAfter: 'else if (state.pause) { ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); drawPauseScreen(); }\n  else { if (state.captureMode) ctx2d.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); drawScene3d(); }',
        injection: '\n  if (state.pause) drawScene3d();',
      },
    ],
  },
};

function patchFile(filepath, patches) {
  let content = fs.readFileSync(filepath, 'utf8');
  const original = content;
  for (const { insertAfter, injection } of patches) {
    const idx = content.indexOf(insertAfter);
    if (idx === -1) {
      throw new Error(`Patch target not found in ${filepath}:\n  "${insertAfter}"`);
    }
    const insertAt = idx + insertAfter.length;
    content = content.slice(0, insertAt) + injection + content.slice(insertAt);
    console.log(`  Patched at offset ${insertAt}: ${injection.trim().slice(0, 60)}`);
  }
  fs.writeFileSync(filepath, content, 'utf8');
  return original;
}

(async () => {
  const originals = {};

  // Patch all files first
  for (const [key, g] of Object.entries(GAMES)) {
    console.log(`Patching ${key} (${g.file})...`);
    originals[key] = patchFile(g.file, g.patches);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    for (const [key, g] of Object.entries(GAMES)) {
      console.log(`\n=== Capturing ${key} ===`);
      const dpr = key === '4d' ? 1 : key === '3d' ? 4 : 2;
      const vw = key === '3d' ? 720 : 360;
      const vh = key === '3d' ? 1440 : 720;
      const ctx = await browser.newContext({
        viewport: { width: vw, height: vh },
        deviceScaleFactor: dpr,
        hasTouch: true,
        isMobile: true,
      });
      const page = await ctx.newPage();

      // Log any console errors from the page
      page.on('console', msg => {
        if (msg.type() === 'error') console.log(`  [page error] ${msg.text()}`);
      });
      page.on('pageerror', err => console.log(`  [page js error] ${err.message}`));

      await page.goto(g.url, { waitUntil: 'load' });
      await page.waitForSelector('canvas#app');

      // Wait for WebGL to render (game starts paused, scene draws immediately)
      await page.waitForTimeout(3500);

      // Check game state
      const gameState = await page.evaluate(() => {
        // Try to access state via any globals
        return {
          title: document.title,
          canvases: Array.from(document.querySelectorAll('canvas')).map(c => ({
            id: c.id, w: c.width, h: c.height
          })),
        };
      });
      console.log(`  Page: ${JSON.stringify(gameState)}`);

      await page.screenshot({ path: g.debug });
      console.log(`  Screenshot saved to ${g.debug}`);

      await page.close();
      await ctx.close();
    }
  } finally {
    await browser.close();
    // Restore all files
    for (const [key, g] of Object.entries(GAMES)) {
      if (originals[key] !== undefined) {
        fs.writeFileSync(g.file, originals[key], 'utf8');
        console.log(`Restored ${g.file}`);
      }
    }
  }

  console.log('\nDone.');
})();
