/*
 * Opens the extension's own side panel page and dumps what it renders, so the
 * Chinese localisation map can be written against the real DOM.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\panel-dump.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const extensionDir = projectRoot;
const shotDir = path.join(projectRoot, 'tests', 'out');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-panel-dump-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 520, height: 900 },
    deviceScaleFactor: 2,
    args: [
      '--disable-extensions-except=' + extensionDir,
      '--load-extension=' + extensionDir,
    ],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('pageerror: ' + error.message));
  await page.goto('chrome-extension://' + EXTENSION_ID + '/codex-sidepanel/index.html');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(shotDir, 'panel-raw.png') });

  const text = await page.evaluate(() => document.body.innerText);
  console.log('--- visible text ---');
  console.log(text.slice(0, 2500));

  const buttons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, [role="button"]')).map((el) => ({
      label: (el.getAttribute('aria-label') || '').trim(),
      title: (el.getAttribute('title') || '').trim(),
      text: (el.innerText || '').trim().slice(0, 40),
      testid: el.getAttribute('data-testid') || '',
    })).slice(0, 40)
  );
  console.log('--- buttons ---');
  console.log(JSON.stringify(buttons, null, 1));

  /* The composer: what a script has to write into for "put this in the chat". */
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('textarea, input, [contenteditable="true"], [role="textbox"]')).map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      testid: el.getAttribute('data-testid') || '',
      placeholder: el.getAttribute('placeholder') || '',
      aria: (el.getAttribute('aria-label') || '').slice(0, 60),
      cls: String(el.className || '').slice(0, 60),
      editable: el.getAttribute('contenteditable') || '',
    }))
  );
  console.log('--- composer candidates ---');
  console.log(JSON.stringify(inputs, null, 1));

  await context.close();
}

main().catch((error) => {
  console.error('panel dump failed: ' + (error && error.message));
  process.exit(1);
});
