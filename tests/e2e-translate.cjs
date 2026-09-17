/*
 * End-to-end check for the translation patch.
 *
 * Launches Edge with a throwaway profile, loads the patched extension, opens a
 * local fixture, selects a paragraph, and reports what the bubble shows.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-translate.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
// The project folder itself is the loadable extension.
const extensionDir = projectRoot;
const shotDir = path.join(projectRoot, 'tests', 'out');

/* Serves the fixture over http, because the content script only matches
 * http/https pages (never file://). */
function startServer() {
  const html = fs.readFileSync(path.join(projectRoot, 'tests', 'fixture.html'));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

async function main() {
  if (!fs.existsSync(path.join(extensionDir, 'manifest.json'))) {
    throw new Error('patched extension not built: run apply-patches.ps1 first');
  }
  fs.mkdirSync(shotDir, { recursive: true });
  const { server, port } = await startServer();

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-translate-e2e-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 760 },
    args: [
      '--disable-extensions-except=' + extensionDir,
      '--load-extension=' + extensionDir,
    ],
  });

  // Confirm the extension actually loaded before blaming the page code.
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  const workers = context.serviceWorkers().map((worker) => worker.url());
  console.log('service workers: ' + (workers.length ? workers.join(', ') : '(none)'));

  // This test is about the selection bubble, so turn whole-page auto
  // translation off first; otherwise the page rewrites itself underneath it.
  const worker = context.serviceWorkers()[0];
  if (worker) {
    await worker.evaluate(async () => {
      await chrome.storage.local.set({ translateSettings: { autoTranslateAll: false } });
    });
  }

  const fixture = 'http://127.0.0.1:' + port + '/fixture.html';
  const page = await context.newPage();
  await page.goto(fixture, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const injected = await page.evaluate(
    () => document.documentElement.getAttribute('data-codex-translate') || '(absent)'
  );
  console.log('content script injected: ' + injected);

  // Drag-select the first paragraph with a real mouse gesture.
  const box = await page.locator('#target').boundingBox();
  await page.mouse.move(box.x + 4, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 6, box.y + box.height - 8, { steps: 12 });
  await page.mouse.up();

  const bubble = await page
    .waitForFunction(
      () => {
        const host = document.getElementById('codex-translate-bubble');
        if (!host || !host.shadowRoot) return null;
        const body = host.shadowRoot.querySelector('.bd');
        if (!body) return null;
        const text = body.textContent.trim();
        if (!text) return null;
        return { className: body.className, text: text };
      },
      { timeout: 90000 }
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);

  await page.screenshot({ path: path.join(shotDir, 'bubble.png') });

  if (!bubble) {
    console.log('RESULT: no bubble appeared');
    await context.close();
    server.close();
    return;
  }
  console.log('RESULT: bubble class = ' + bubble.className);
  console.log('TEXT  : ' + String(bubble.text).slice(0, 400));

  /* ---- regression: the replace / undo button and bubble lifetime ---- */

  const readBubble = () =>
    page.evaluate(() => {
      const host = document.getElementById('codex-translate-bubble');
      if (!host || !host.shadowRoot) return null;
      const buttons = Array.from(host.shadowRoot.querySelectorAll('.ft .btn')).map((b) =>
        b.textContent.trim()
      );
      return { buttons, body: (host.shadowRoot.querySelector('.bd') || {}).textContent || '' };
    });

  const paragraphText = () => page.locator('#target').innerText();
  const before = await paragraphText();

  const buttons = await page.evaluate(() => {
    const host = document.getElementById('codex-translate-bubble');
    return Array.from(host.shadowRoot.querySelectorAll('.ft .btn')).map((b) => b.textContent.trim());
  });
  console.log('buttons before: ' + JSON.stringify(buttons));

  // Click "replace original".
  await page.evaluate(() => {
    const host = document.getElementById('codex-translate-bubble');
    host.shadowRoot.querySelectorAll('.ft .btn')[1].click();
  });
  await page.waitForTimeout(500);

  const afterReplace = await readBubble();
  const replacedText = await paragraphText();
  console.log('bubble after replace: ' + (afterReplace ? JSON.stringify(afterReplace.buttons) : 'GONE'));
  console.log('paragraph changed   : ' + (replacedText !== before));
  await page.screenshot({ path: path.join(shotDir, 'bubble-replaced.png') });

  // Click "undo replacement".
  const undoTarget = await page.evaluate(() => {
    const host = document.getElementById('codex-translate-bubble');
    if (!host || !host.shadowRoot) return false;
    const btn = host.shadowRoot.querySelectorAll('.ft .btn')[1];
    if (!btn) return false;
    btn.click();
    return true;
  });
  await page.waitForTimeout(400);

  const restoredText = await paragraphText();
  console.log('undo clicked        : ' + undoTarget);
  console.log('paragraph restored  : ' + (restoredText === before));
  const afterUndo = await readBubble();
  console.log('bubble after undo   : ' + (afterUndo ? JSON.stringify(afterUndo.buttons) : 'GONE'));

  // Copy must not dismiss the bubble either.
  await page.evaluate(() => {
    const host = document.getElementById('codex-translate-bubble');
    host.shadowRoot.querySelectorAll('.ft .btn')[0].click();
  });
  await page.waitForTimeout(500);
  const afterCopy = await readBubble();
  console.log('bubble after copy   : ' + (afterCopy ? 'still visible' : 'GONE'));

  await page.screenshot({ path: path.join(shotDir, 'bubble-after-clicks.png') });

  await context.close();
  server.close();
  return;
}

main().catch((error) => {
  console.error('e2e failed: ' + (error && error.message));
  process.exit(1);
});
