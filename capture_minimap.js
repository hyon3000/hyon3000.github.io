const puppeteer = require('puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-webgl', '--ignore-gpu-blocklist']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 800 });
  await page.goto('http://localhost:8080/polycube/polytesseract/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);

  // Start the game
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const W = box.width, H = box.height;
  const px = (0 * 2.095 + 1.5) / 3 * W;
  const rhs = 0.38 * 2.095 * W / H;
  const py = (1.5 + rhs) / 3 * H - H / 40;
  await page.evaluate((cx, cy) => {
    const c = document.querySelector('canvas');
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, pointerType: 'mouse' }));
    setTimeout(() => c.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, pointerType: 'mouse' })), 50);
  }, box.x + px, box.y + py);
  await sleep(3000);

  // Place some blocks so the minimap shows something
  await page.evaluate(() => {
    const s = window.__ptState;
    if (!s) return;
    s.startscreen = 0;
    s.goverflg = 0;
    s.pause = false;
    s.ready = true;

    const blockVals = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75];
    for (let z = 0; z < 5; z++) {
      for (let x = 0; x < 7; x++) {
        for (let y = 0; y < 7; y++) {
          if ((x + y + z) % 3 === 0) continue;
          // w=3 so it shows in minimap
          s.blk[x][y][z][3] = blockVals[(x + y * 3 + z * 7) % blockVals.length];
          // some at other w values too
          if ((x + y) % 2 === 0) s.blk[x][y][z][2] = blockVals[(x * 2 + y) % blockVals.length];
        }
      }
    }
    s.floorz = 0;
  });
  await sleep(1000);

  // Take full game screenshot showing the minimap
  await page.screenshot({ path: '/tmp/game_with_minimap.png' });
  console.log('Saved full game screenshot');

  await browser.close();
})();
