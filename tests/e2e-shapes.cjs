/*
 * The shapes a dashboard actually uses, end to end.
 *
 * Every case below was left in English at some point. Each one is checked after
 * a real translation pass, plus the two things that only go wrong later: a page
 * that re-renders a block we already translated, and a block that arrives after
 * the first pass.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-shapes.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const FIXTURE = 'fixture-skips.html';

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
}

const CASES = {
  case1: 'a link alone in a div',
  case2: 'a row of links',
  case3: 'a container with a block child and an inline link',
  case4: 'a badge span next to block children',
  case5: 'inline elements mixed with text',
  case6: 'a button',
  case7: 'a link as the heading',
  case8: 'a block the page replaces afterwards',
  case10: 'text inside a shadow root',
};

function startServer() {
  const html = fs.readFileSync(path.join(projectRoot, 'tests', FIXTURE));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const readText = (page, id) =>
  page.evaluate((value) => {
    const node = document.getElementById(value);
    if (!node) return '';
    // innerText cannot see into a shadow root, so read the composed text.
    const collect = (root) => {
      let text = root.textContent || '';
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) text += ' ' + collect(element.shadowRoot);
      }
      return text;
    };
    return collect(node).replace(/\s+/g, ' ').trim();
  }, id);

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const { server, port } = await startServer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-shapes-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 1000 },
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  await page.goto('http://127.0.0.1:' + port + '/' + FIXTURE, { waitUntil: 'load' });

  const cjk = (value) => /[\u4e00-\u9fff]/.test(value);
  const wanted = Object.keys(CASES).length;
  for (let attempt = 0; attempt < 60; attempt++) {
    const marks = await page.evaluate(() => document.querySelectorAll('[data-codex-translated]').length);
    if (marks >= wanted) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1200);

  for (const [id, label] of Object.entries(CASES)) {
    const text = await readText(page, id);
    check(label, cjk(text), text.slice(0, 60));
  }

  // The page re-renders a block we already did: it has to come back translated.
  await page.evaluate(() => {
    document.getElementById('rerender').textContent = 'Your plan renews every month now.';
  });
  let redone = '';
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(500);
    redone = await readText(page, 'rerender');
    if (cjk(redone)) break;
  }
  check('a re-rendered block is translated again', cjk(redone), redone);

  // A block that only shows up later has to be picked up too.
  await page.evaluate(() => {
    const block = document.createElement('p');
    block.textContent = 'Credits are shared across the whole workspace.';
    document.getElementById('case9').appendChild(block);
  });
  let late = '';
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(500);
    late = await readText(page, 'case9');
    if (cjk(late)) break;
  }
  check('a block added later is translated', cjk(late), late);

  // And every original must still come back on demand.
  const worker = context.serviceWorkers()[0];
  if (worker) {
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((item) => item.url && item.url.indexOf('fixture-skips') >= 0);
      if (tab) await chrome.tabs.sendMessage(tab.id, { type: 'translate:restore-page' });
    });
  }
  await page.waitForTimeout(900);
  const restored = await readText(page, 'case2');
  const marks = await page.evaluate(() => document.querySelectorAll('[data-codex-translated]').length);
  check('restore brings the originals back', /Cancel/.test(restored) && marks === 0, restored + ' / marks=' + marks);

  await page.screenshot({ path: path.join(shotDir, 'shapes.png'), fullPage: true });
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(failures ? 'RESULT: ' + failures + ' check(s) failed' : 'RESULT: all checks passed');

  await context.close();
  server.close();
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error('shapes e2e failed: ' + (error && error.message));
  process.exit(1);
});
