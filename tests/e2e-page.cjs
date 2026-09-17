/*
 * Verifies whole-page translation, including the "on for every site by
 * default" behaviour and restoring the original text.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-page.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');

function startServer() {
  const html = fs.readFileSync(path.join(projectRoot, 'tests', 'fixture.html'));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const { server, port } = await startServer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-page-e2e-'));

  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 1,
    args: [
      '--disable-extensions-except=' + projectRoot,
      '--load-extension=' + projectRoot,
    ],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));

  const fixture = 'http://127.0.0.1:' + port + '/fixture.html';
  await page.goto(fixture, { waitUntil: 'load' });

  // Auto translation is on by default, so nothing is clicked here.
  const translated = await page
    .waitForFunction(
      () => {
        const marks = document.querySelectorAll('[data-codex-translated]');
        if (!marks.length) return null;
        // Translations are written into the existing text nodes, so the block
        // itself carries both the original and the译文.
        return Array.from(marks).map((el) => el.textContent.trim());
      },
      { timeout: 90000 }
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);

  if (!translated) {
    console.log('RESULT: nothing was translated');
  } else {
    console.log('RESULT: ' + translated.length + ' block(s) translated');
    console.log('FIRST : ' + String(translated[0]).slice(0, 200));
  }
  await page.screenshot({ path: path.join(shotDir, 'page-translated.png'), fullPage: true });

  const beforeRestore = await page.evaluate(
    () => document.querySelectorAll('[data-codex-translated]').length
  );

  // Restore through exactly the message the context menu sends.
  const worker = context.serviceWorkers()[0];
  if (worker) {
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((item) => item.url && item.url.includes('fixture.html'));
      if (tab) await chrome.tabs.sendMessage(tab.id, { type: 'translate:restore-page' });
    });
  }
  await page.waitForTimeout(900);

  const afterRestore = await page.evaluate(
    () => document.querySelectorAll('[data-codex-translated]').length
  );
  console.log('marks before restore: ' + beforeRestore);
  console.log('marks after restore : ' + afterRestore);
  console.log('page errors         : ' + (errors.length ? errors.join(' | ') : '(none)'));

  await page.screenshot({ path: path.join(shotDir, 'page-restored.png'), fullPage: true });
  await context.close();
  server.close();
}

main().catch((error) => {
  console.error('page e2e failed: ' + (error && error.message));
  process.exit(1);
});
