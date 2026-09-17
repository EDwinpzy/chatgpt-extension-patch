/*
 * Does every translation land on the block it came from?
 *
 * The gateway here is not a model: it wraps each line it is asked about in
 * « ... », so after a pass the page itself says what went where. A block that
 * shows nothing, shows someone else's text, or shows two wrappers is misplaced,
 * and this test names it.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-align.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const FIXTURE = 'fixture-align.html';

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
}

/* Wraps every requested line, so the answer says which text it came from. */
function startGateway(seen) {
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'wrap-model' }] }));
      return;
    }
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      seen.push(raw);
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch (error) {
        body = {};
      }
      const input = String(((body.messages || [])[1] || {}).content || '');
      const lines = input.split('\n').filter((line) => /^\s*\[\d+\]/.test(line));
      const wrapped = lines
        .map((line) => {
          const match = /^\s*\[(\d+)\]\s*([\s\S]*)$/.exec(line);
          return match ? '[' + match[1] + '] « ' + match[2] + ' »' : line;
        })
        .join('\n');
      response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      response.end(
        JSON.stringify({
          id: 'gen_align',
          choices: [{ index: 0, message: { role: 'assistant', content: wrapped }, finish_reason: 'stop' }],
        })
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function startPages() {
  const html = fs.readFileSync(path.join(projectRoot, 'tests', FIXTURE));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const IDS = ['a1x', 'a1y', 'a2x', 'a2y', 'a2z', 'a3x', 'a3y', 'a3z', 'a4x', 'a4y',
  'a5x', 'a6x', 'a6y', 'a6z', 'a6w', 'a7x', 'a7y', 'a7z', 'a7w', 'a8x', 'a9x', 'a9y', 'a9z'];

const read = (page, ids) =>
  page.evaluate((list) => {
    const out = {};
    for (const id of list) {
      const node = document.getElementById(id);
      out[id] = node ? node.innerText.replace(/\s+/g, ' ').trim() : '(missing)';
    }
    return out;
  }, ids);

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const seen = [];
  const { server: gateway, port: gatewayPort } = await startGateway(seen);
  const { server: pages, port: pagePort } = await startPages();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-align-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 1000 },
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  const worker = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  if (worker) {
    await worker.evaluate(async (base) => {
      await chrome.storage.local.set({
        translateSettings: {
          displayMode: 'replace',
          autoTranslateAll: true,
          blockedSites: [],
          disableThinking: true,
          models: [{ id: 'wrap', name: 'wrap', kind: 'cloud', baseUrl: base, apiKey: 'k', model: 'wrap-model' }],
          translateModelId: 'wrap',
        },
      });
    }, 'http://127.0.0.1:' + gatewayPort + '/v1');
  }

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  await page.goto('http://127.0.0.1:' + pagePort + '/' + FIXTURE, { waitUntil: 'load' });

  const before = await read(page, IDS);
  for (let attempt = 0; attempt < 60; attempt++) {
    const marks = await page.evaluate(() => document.querySelectorAll('[data-codex-translated]').length);
    if (marks) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);
  const after = await read(page, IDS);

  for (const id of IDS) {
    const wanted = '« ' + before[id] + ' »';
    const got = after[id];
    const wrappers = (got.match(/«/g) || []).length;
    const ok = got === wanted;
    let note = got;
    if (wrappers === 0) note = 'not translated :: ' + got;
    else if (wrappers > 1) note = 'doubled :: ' + got;
    else if (!ok) note = 'wrong text :: ' + got + '  (expected ' + wanted + ')';
    check(id + ' ' + before[id].slice(0, 34), ok, note.slice(0, 120));
  }

  check('the gateway was actually asked', seen.length > 0, seen.length + ' call(s)');
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: path.join(shotDir, 'align.png'), fullPage: true });

  /* The same page in 双语对照: the original stays and the translation is added
   * next to it, still inside the block it came from. */
  if (worker) {
    await worker.evaluate(async () => {
      const bag = await chrome.storage.local.get('translateSettings');
      const next = Object.assign({}, bag.translateSettings || {}, { displayMode: 'bilingual' });
      await chrome.storage.local.set({ translateSettings: next });
    });
  }
  await page.goto('http://127.0.0.1:' + pagePort + '/' + FIXTURE, { waitUntil: 'load' });
  const bilingualBefore = await read(page, IDS);
  for (let attempt = 0; attempt < 60; attempt++) {
    const marks = await page.evaluate(() => document.querySelectorAll('[data-codex-translated]').length);
    if (marks) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);
  const bilingualAfter = await read(page, IDS);

  for (const id of IDS) {
    const original = bilingualBefore[id];
    const wanted = original + ' « ' + original + ' »';
    const got = bilingualAfter[id];
    const wrappers = (got.match(/«/g) || []).length;
    let note = got;
    if (wrappers === 0) note = 'translation missing :: ' + got;
    else if (wrappers > 1) note = 'doubled :: ' + got;
    else if (got.indexOf(original) !== 0) note = 'original lost :: ' + got;
    check('bilingual ' + id + ' ' + original.slice(0, 26), got === wanted, note.slice(0, 120));
  }

  console.log(failures ? 'RESULT: ' + failures + ' check(s) failed' : 'RESULT: all checks passed');

  await context.close();
  gateway.close();
  pages.close();
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error('align e2e failed: ' + (error && error.message));
  process.exit(1);
});
