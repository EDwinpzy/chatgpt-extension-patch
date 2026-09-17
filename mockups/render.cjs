/*
 * Renders translation-ui.html to a PNG so the design sheet can be reviewed
 * without opening the file. Run with the global npm modules on NODE_PATH:
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node mockups\render.cjs
 */

const path = require('path');
const { chromium } = require('playwright');

const here = __dirname;
const source = 'file:///' + path.join(here, 'translation-ui.html').replace(/\\/g, '/');
const outFull = path.join(here, 'preview-full.png');
const outTop = path.join(here, 'preview-top.png');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1240, height: 1200 },
    deviceScaleFactor: 2,
  });
  await page.goto(source, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const size = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
  }));
  console.log('content size: ' + size.w + ' x ' + size.h);

  await page.screenshot({ path: outFull, fullPage: true });
  console.log('wrote ' + outFull);

  await page.screenshot({ path: outTop });
  console.log('wrote ' + outTop);

  await browser.close();
})().catch((error) => {
  console.error('render failed: ' + (error && error.message));
  process.exit(1);
});
