/*
 * How long a whole page takes, measured rather than guessed.
 *
 * The gateway here answers every request after a fixed delay, so the elapsed
 * time says exactly how many requests were in flight: 200 blocks at 40 per
 * request is five requests, which is five delays in a row when the page sends
 * them one at a time, and two when it keeps several in flight.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-speed.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const FIXTURE = 'fixture-speed.html';
const DELAY_MS = 500;

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
}

function startGateway(metrics) {
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'slow-model' }] }));
      return;
    }
    let raw = '';
    metrics.active++;
    metrics.peak = Math.max(metrics.peak, metrics.active);
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      metrics.seen.push(Date.now());
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch (error) {
        body = {};
      }
      const input = String(((body.messages || [])[1] || {}).content || '');
      const lines = input.split('\n').filter((line) => /^\s*\[\d+\]/.test(line));
      const out = lines
        .map((line) => {
          const match = /^\s*\[(\d+)\]\s*([\s\S]*)$/.exec(line);
          return match ? '[' + match[1] + '] 段' + match[1] + '：' + match[2].slice(0, 12) : line;
        })
        .join('\n');
      setTimeout(() => {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        response.end(JSON.stringify({ id: 'x', choices: [{ index: 0, message: { role: 'assistant', content: out }, finish_reason: 'stop' }] }));
        metrics.active--;
      }, DELAY_MS);
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

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const metrics = { seen: [], active: 0, peak: 0 };
  const seen = metrics.seen;
  const { server: gateway, port: gatewayPort } = await startGateway(metrics);
  const { server: pages, port: pagePort } = await startPages();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-speed-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1000, height: 800 },
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  /*
   * The worker has to be there before anything is measured: without those
   * settings the page falls back to the shipped local model and the numbers
   * would describe a different machine entirely.
   */
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null));
  if (!worker) {
    console.error('no service worker appeared: refusing to measure without the gateway settings');
    process.exit(1);
  }
  await worker.evaluate(async (base) => {
    await chrome.storage.local.set({
      translateSettings: {
        displayMode: 'replace',
        autoTranslateAll: true,
        blockedSites: [],
        disableThinking: true,
        models: [{ id: 'slow', name: 'slow', kind: 'cloud', baseUrl: base, apiKey: 'k', model: 'slow-model' }],
        translateModelId: 'slow',
      },
    });
  }, 'http://127.0.0.1:' + gatewayPort + '/v1');
  const armed = await worker.evaluate(async () => {
    const bag = await chrome.storage.local.get('translateSettings');
    return bag && bag.translateSettings ? bag.translateSettings.translateModelId : null;
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  const started = Date.now();
  await page.goto('http://127.0.0.1:' + pagePort + '/' + FIXTURE, { waitUntil: 'load' });

  const count = await page.evaluate(() => window.__blocks);
  const progress = () => page.evaluate(() => document.querySelectorAll('[data-codex-translated]').length);

  let firstAt = 0;
  let lastAt = 0;
  for (let attempt = 0; attempt < 400; attempt++) {
    const marks = await progress();
    if (marks && !firstAt) firstAt = Date.now() - started;
    if (marks >= count) {
      lastAt = Date.now() - started;
      break;
    }
    await page.waitForTimeout(50);
  }
  const total = lastAt || Date.now() - started;
  const window = firstAt ? lastAt - firstAt : total;

  await page.screenshot({ path: path.join(shotDir, 'speed.png') });

  console.log('blocks            : ' + count);
  console.log('translate model   : ' + armed);
  console.log('gateway requests  : ' + seen.length);
  console.log('peak concurrent   : ' + metrics.peak);
  console.log('first译文 at       : ' + firstAt + ' ms');
  console.log('all译文 at         : ' + total + ' ms');
  console.log('batch window      : ' + window + ' ms  (one delay = ' + DELAY_MS + ' ms)');
  check('every block was translated', lastAt > 0, lastAt + ' ms');
  check('the fake gateway was the model in use', armed === 'slow', String(armed));
  check('the gateway was actually called', seen.length > 0, seen.length + ' request(s)');
  check('no more than eight calls in flight', metrics.peak <= 8, metrics.peak + ' at once');
  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(failures ? 'RESULT: ' + failures + ' check(s) failed' : 'RESULT: all checks passed');

  await context.close();
  gateway.close();
  pages.close();
}

main().catch((error) => {
  console.error('speed e2e failed: ' + (error && error.message));
  process.exit(1);
});
