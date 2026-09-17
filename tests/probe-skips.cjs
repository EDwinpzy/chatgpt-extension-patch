/*
 * Diagnostic: which shapes does page translation leave in English?
 *
 * Loads one fixture that repeats the shapes a dashboard uses - a link alone in
 * a div, a row of links, a container that mixes block and inline children, a
 * badge span, a button, and a block whose text the page replaces afterwards -
 * then reports, per case, what came back.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\probe-skips.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const FIXTURE = 'fixture-skips.html';

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

const CASES = {
  case1: 'one link alone in a div',
  case2: 'a row of links in one div',
  case3: 'div with a block child and an inline link',
  case4: 'badge span next to block children',
  case5: 'inline elements mixed with text',
  case6: 'a button',
  case7: 'link as the heading',
  case8: 'text replaced by the page afterwards',
  case9: 'a block added after the first pass',
};

const read = (page) =>
  page.evaluate((ids) => {
    const out = {};
    for (const id of ids) {
      const node = document.getElementById(id);
      out[id] = {
        text: node ? node.innerText.replace(/\s+/g, ' ').trim() : '(missing)',
        marked: node ? node.hasAttribute('data-codex-translated') : false,
      };
    }
    return out;
  }, Object.keys(CASES));

async function main() {
  const { server, port } = await startServer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-skips-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 900 },
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push('console: ' + message.text().slice(0, 160));
  });
  await page.goto('http://127.0.0.1:' + port + '/' + FIXTURE, { waitUntil: 'load' });

  await page.waitForFunction(
    () => document.querySelectorAll('[data-codex-translated]').length >= 4,
    { timeout: 90000 }
  ).catch(() => null);
  await page.waitForTimeout(1500);

  const first = await read(page);

  // The page re-renders one of them, the way a data update would.
  await page.evaluate(() => {
    document.getElementById('rerender').textContent = 'Your plan renews every month now.';
    const block = document.createElement('p');
    block.textContent = 'Credits are shared across the whole workspace.';
    document.getElementById('case9').appendChild(block);
  });
  await page.waitForTimeout(9000);
  const second = await read(page);

  const cjk = (value) => /[\u4e00-\u9fff]/.test(value);
  console.log('--- first pass ---');
  for (const [id, label] of Object.entries(CASES)) {
    console.log((cjk(first[id].text) ? 'translated ' : 'LEFT       ') + id + '  ' + label + '  :: ' + first[id].text.slice(0, 70));
  }
  console.log('--- after the page replaced one block ---');
  console.log('case8 text: ' + second.case8.text);
  console.log('case8 retranslated: ' + cjk(second.case8.text));
  console.log('case9 added text : ' + second.case9.text);
  console.log('case9 translated : ' + cjk(second.case9.text));
  const trace = await page.evaluate(() => ({
    state: document.documentElement.getAttribute('data-codex-translate-state'),
    marks: document.querySelectorAll('[data-codex-translated]').length,
    rerednerMark: (() => {
      const node = document.getElementById('rerender');
      return {
        marked: node.hasAttribute('data-codex-translated'),
        hashAttr: node.getAttribute('data-codex-translated-hash'),
      };
    })(),
  }));
  console.log('catch-up state  : ' + JSON.stringify(trace));
  console.log('errors: ' + (errors.length ? errors.join(' | ') : '(none)'));

  await page.screenshot({ path: path.join(projectRoot, 'tests', 'out', 'skips.png'), fullPage: true });
  await context.close();
  server.close();
}

main().catch((error) => {
  console.error('probe failed: ' + (error && error.message));
  process.exit(1);
});
