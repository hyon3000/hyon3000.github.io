const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:8765/polycube';
const WIDTH = 360;
const HEIGHT = 720;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });

  // ===== Polynomino (2D) =====
  {
    console.log('=== Polynomino ===');
    const page = await context.newPage();
    await page.goto(`${BASE}/polynomino/game.html`, { waitUntil: 'load' });
    await page.waitForSelector('canvas#app');
    await page.waitForTimeout(2000);

    // Debug: check canvas size and dispatch pointer event directly
    const info = await page.evaluate(() => {
      const c = document.getElementById('app');
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, x: r.x, y: r.y, cw: c.width, ch: c.height };
    });
    console.log('Canvas info:', info);

    // Dispatch pointerdown+pointerup directly on canvas at START button location
    await page.evaluate(({cx, cy}) => {
      const c = document.getElementById('app');
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: cx, clientY: cy,
        pointerId: 1, pointerType: 'touch', isPrimary: true,
        bubbles: true
      }));
      setTimeout(() => {
        c.dispatchEvent(new PointerEvent('pointerup', {
          clientX: cx, clientY: cy,
          pointerId: 1, pointerType: 'touch', isPrimary: true,
          bubbles: true
        }));
      }, 100);
    }, { cx: info.x + info.w * 0.5, cy: info.y + info.h * 0.56 });
    await page.waitForTimeout(1000);

    let started = await page.evaluate(() => window.__polynominoAbout).catch(() => null);
    console.log('After dispatch: about=', started);

    if (started !== -1) {
      // Try more positions
      for (const yPct of [0.50, 0.45, 0.40, 0.35, 0.60, 0.65]) {
        await page.evaluate(({cx, cy}) => {
          const c = document.getElementById('app');
          c.dispatchEvent(new PointerEvent('pointerdown', {
            clientX: cx, clientY: cy, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true
          }));
          setTimeout(() => {
            c.dispatchEvent(new PointerEvent('pointerup', {
              clientX: cx, clientY: cy, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true
            }));
          }, 100);
        }, { cx: info.x + info.w * 0.5, cy: info.y + info.h * yPct });
        await page.waitForTimeout(500);
        started = await page.evaluate(() => window.__polynominoAbout).catch(() => null);
        console.log(`  y=${yPct}: about=${started}`);
        if (started === -1) break;
      }
    }

    await page.waitForTimeout(2000);
    // Take full-page screenshot for debugging
    await page.screenshot({ path: '/tmp/debug_poly2d.png' });

    await page.screenshot({
      path: '/workspace/stuff/polycube/polynomino/assets/images/img_000.png',
      clip: { x: info.x, y: info.y + info.h * 0.73, width: info.w, height: info.h * 0.27 }
    });
    console.log('Saved img_000.png');
    fs.copyFileSync(
      '/workspace/stuff/polycube/polynomino/assets/images/img_000.png',
      '/workspace/stuff/polycube/polynomino/assets/images/img_001.png'
    );
    await page.close();
  }

  // ===== Polycube (3D) =====
  {
    console.log('=== Polycube ===');
    const page = await context.newPage();
    await page.goto(`${BASE}/game.html`, { waitUntil: 'load' });
    await page.waitForSelector('canvas#app');
    await page.waitForTimeout(3000);

    const info = await page.evaluate(() => {
      const c = document.getElementById('app');
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, x: r.x, y: r.y };
    });
    console.log('Canvas info:', info);

    for (const yPct of [0.40, 0.42, 0.44, 0.46, 0.48, 0.50, 0.52, 0.54, 0.56, 0.58, 0.60]) {
      await page.evaluate(({cx, cy}) => {
        const c = document.getElementById('app');
        c.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: cx, clientY: cy, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true
        }));
        setTimeout(() => {
          c.dispatchEvent(new PointerEvent('pointerup', {
            clientX: cx, clientY: cy, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true
          }));
        }, 100);
      }, { cx: info.x + info.w * 0.5, cy: info.y + info.h * yPct });
      await page.waitForTimeout(400);
      const about = await page.evaluate(() => window.__polycubeAbout).catch(() => null);
      console.log(`  y=${yPct}: about=${about}`);
      if (about === -1) break;
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/debug_poly3d.png' });

    await page.screenshot({
      path: '/workspace/stuff/polycube/assets/images/img_002.png',
      clip: { x: info.x, y: info.y + info.h * 0.55, width: info.w, height: info.h * 0.45 }
    });
    console.log('Saved img_002.png');
    fs.copyFileSync(
      '/workspace/stuff/polycube/assets/images/img_002.png',
      '/workspace/stuff/polycube/assets/images/img_005.png'
    );
    await page.close();
  }

  // ===== Polytesseract (4D) =====
  {
    console.log('=== Polytesseract ===');
    const page = await context.newPage();
    await page.goto(`${BASE}/polytesseract/game.html`, { waitUntil: 'load' });
    await page.waitForSelector('canvas#app');
    await page.waitForTimeout(3000);

    const info = await page.evaluate(() => {
      const c = document.getElementById('app');
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, x: r.x, y: r.y };
    });
    console.log('Canvas info:', info);

    for (const yPct of [0.40, 0.42, 0.44, 0.46, 0.48, 0.50, 0.52, 0.54, 0.56, 0.58, 0.60]) {
      await page.evaluate(({cx, cy}) => {
        const c = document.getElementById('app');
        c.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: cx, clientY: cy, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true
        }));
        setTimeout(() => {
          c.dispatchEvent(new PointerEvent('pointerup', {
            clientX: cx, clientY: cy, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true
          }));
        }, 100);
      }, { cx: info.x + info.w * 0.5, cy: info.y + info.h * yPct });
      await page.waitForTimeout(400);
      const about = await page.evaluate(() => window.__polytesseractAbout).catch(() => null);
      console.log(`  y=${yPct}: about=${about}`);
      if (about === -1) break;
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/debug_poly4d.png' });

    await page.screenshot({
      path: '/workspace/stuff/polycube/polytesseract/assets/buttons.png',
      clip: { x: info.x, y: info.y + info.h * 0.45, width: info.w, height: info.h * 0.55 }
    });
    console.log('Saved buttons.png');
    await page.close();
  }

  await browser.close();
  console.log('All captures done!');
})();
