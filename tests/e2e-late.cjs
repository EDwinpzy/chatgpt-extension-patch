/*
 * Late content: a single-page app renders its screens after load and swaps them
 * without navigating, so one pass at document_idle never sees them. This checks
 * that a paragraph and a button added after the first pass get translated too,
 * that already-translated text is left alone, and that no progress pill is
 * flashed over a page the user is already reading.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-late.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const CJK = /[\u4e00-\u9fff]/;

function startServer() {
  const html = fs.readFileSync(path.join(projectRoot, 'tests', 'fixture-late.html'));
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-late-e2e-'));

  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 1,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));

  await page.goto('http://127.0.0.1:' + port + '/fixture-late.html', { waitUntil: 'load' });
  const injected = await page.evaluate(
    () => document.documentElement.getAttribute('data-codex-translate') || '(absent)'
  );
  console.log('content script injected: ' + injected);

  const read = (selector) =>
    page.evaluate((value) => {
      const node = document.querySelector(value);
      return node ? node.innerText.trim() : null;
    }, selector);

  const waitForTranslation = (id) =>
    page
      .waitForFunction(
        (args) => {
          const node = document.getElementById(args.id);
          if (!node || !node.hasAttribute('data-codex-translated')) return null;
          return new RegExp(args.pattern).test(node.innerText) ? node.innerText.trim() : null;
        },
        { id, pattern: CJK.source },
        { timeout: 90000 }
      )
      .then((handle) => handle.jsonValue())
      .catch(() => null);

  // First pass: auto translation is on by default, so nothing is clicked.
  const firstPass = await waitForTranslation('first');
  console.log('first pass     : ' + (firstPass || 'NEVER TRANSLATED'));

  const buttonFirstPass = await read('#plan');
  console.log('button         : ' + (buttonFirstPass || '(missing)'));

  await page.screenshot({ path: path.join(shotDir, 'late-before.png'), fullPage: true });

  // The in-app tab switch: new markup appears, the document never reloads.
  await page.evaluate(() => {
    const host = document.getElementById('late');
    const block = document.createElement('p');
    block.id = 'late-paragraph';
    block.textContent = 'Usage and billing details are shown here.';
    host.appendChild(block);
  });

  const latePass = await waitForTranslation('late-paragraph');
  console.log('late paragraph : ' + (latePass || 'STILL ENGLISH'));
  console.log('late translated: ' + Boolean(latePass));

  await page.waitForTimeout(1500);
  const firstAfter = await read('#first');
  const buttonLate = await read('#plan');
  console.log('first unchanged: ' + (firstAfter === firstPass));
  if (firstAfter !== firstPass) console.log('  now: ' + firstAfter);
  console.log('button after   : ' + (buttonLate || '(missing)'));
  console.log('button chinese : ' + CJK.test(buttonLate || ''));

  const pill = await page.evaluate(() => {
    const host = document.getElementById('codex-translate-page');
    if (!host || !host.shadowRoot) return false;
    return Boolean(host.shadowRoot.querySelector('.pill'));
  });
  const marks = await page.evaluate(
    () => document.querySelectorAll('[data-codex-translated]').length
  );
  console.log('pill shown     : ' + pill);
  console.log('marked blocks  : ' + marks);
  console.log('page errors    : ' + (errors.length ? errors.join(' | ') : '(none)'));

  await page.screenshot({ path: path.join(shotDir, 'late-after.png'), fullPage: true });
  await context.close();
  server.close();
}

main().catch((error) => {
  console.error('late e2e failed: ' + (error && error.message));
  process.exit(1);
});
