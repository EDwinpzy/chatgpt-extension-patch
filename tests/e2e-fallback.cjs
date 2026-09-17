/*
 * The model in the settings is not the only one that can translate.
 *
 * Two gateways are put behind one page: the first answers like the local model
 * on this machine does when Ollama cannot load it (500, "llama-server binary
 * not found"), the second answers properly. Page translation points at the
 * first, and has to come out translated anyway.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-fallback.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
}

/* Answers every numbered line the way a working translation model would. */
function answer(body) {
  const payload = String((body && body.messages && body.messages[1] && body.messages[1].content) || '');
  return payload
    .split('\n')
    .filter(Boolean)
    .map((line) => line.replace(/^\[(\d+)\]\s*/, (all, n) => '[' + n + '] 译文' + n + '：机器学习模型需要大量数据。'))
    .join('\n');
}

/* `broken` counts and refuses; `good` counts and answers. */
function startServers(seen) {
  const html = fs.readFileSync(path.join(projectRoot, 'tests', 'fixture.html'));
  const pages = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });

  const model = (name, broken) =>
    http.createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => {
        raw += chunk;
      });
      request.on('end', () => {
        const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
        if (broken) {
          seen[name].push(raw);
          response.writeHead(500, headers);
          response.end(JSON.stringify({ error: { message: 'error starting llama-server: llama-server binary not found' } }));
          return;
        }
        let body = {};
        try {
          body = JSON.parse(raw || '{}');
        } catch (error) {
          body = {};
        }
        if (request.method === 'GET') {
          response.writeHead(200, headers);
          response.end(JSON.stringify({ data: [{ id: 'good-model' }] }));
          return;
        }
        seen[name].push(raw);
        response.writeHead(200, headers);
        response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: answer(body) } }] }));
      });
    });

  const listen = (server) =>
    new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  return Promise.all([listen(pages), listen(model('broken', true)), listen(model('good', false))]).then(
    ([pagePort, brokenPort, goodPort]) => ({ pages, pagePort, brokenPort, goodPort })
  );
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const seen = { broken: [], good: [] };
  const { pages, pagePort, brokenPort, goodPort } = await startServers(seen);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-fallback-e2e-'));

  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 1,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  const worker = context.serviceWorkers()[0];

  /* The card in use is the broken one; the working model sits behind it. */
  await worker.evaluate(
    async (cfg) => {
      await chrome.storage.local.set({
        translateSettings: {
          displayMode: 'replace',
          autoTranslateAll: true,
          blockedSites: [],
          disableThinking: true,
          models: [
            { id: 'local-broken', name: 'broken-local', kind: 'local', baseUrl: cfg.broken, apiKey: '', model: 'translategemma:4b' },
            { id: 'spare', name: 'working-cloud', kind: 'cloud', baseUrl: cfg.good, apiKey: 'k', model: 'good-model' },
          ],
          translateModelId: 'local-broken',
        },
      });
    },
    { broken: 'http://127.0.0.1:' + brokenPort + '/v1', good: 'http://127.0.0.1:' + goodPort + '/v1' }
  );

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  await page.goto('http://127.0.0.1:' + pagePort + '/fixture.html', { waitUntil: 'load' });

  const translated = await page
    .waitForFunction(
      () => {
        const marks = document.querySelectorAll('[data-codex-translated]');
        if (!marks.length) return null;
        return Array.from(marks).map((el) => el.textContent.trim());
      },
      { timeout: 90000 }
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);

  const pill = await page.evaluate(() => {
    const host = document.getElementById('codex-translate-page');
    const box = host && host.shadowRoot ? host.shadowRoot.querySelector('.pill') : null;
    const label = box ? box.querySelector('.label') : null;
    return label ? label.textContent : '';
  });

  await page.screenshot({ path: path.join(shotDir, 'fallback-translated.png'), fullPage: true });

  check('the broken model was asked first', seen.broken.length > 0, seen.broken.length + ' request(s)');
  check('the working model took the page over', seen.good.length > 0, seen.good.length + ' request(s)');
  check('the page came out translated', Boolean(translated && translated.length), String(translated && translated.length) + ' block(s)');
  check(
    'and in Chinese, not in the source language',
    Boolean(translated) && translated.every((value) => /[\u4e00-\u9fff]/.test(value)),
    String(translated && translated[0]).slice(0, 90)
  );
  check('no error pill was left behind', pill.indexOf('翻译出错') < 0, pill || '(pill already gone)');
  check('no page errors', errors.length === 0, errors.join(' | ') || '(none)');

  console.log('');
  console.log('page text: ' + String(translated && translated[0]).replace(/\s+/g, ' ').slice(0, 140));
  console.log('screenshot: ' + path.join(shotDir, 'fallback-translated.png'));
  console.log(failures === 0 ? 'all checks passed' : failures + ' check(s) failed');

  await context.close();
  pages.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('fallback e2e failed: ' + (error && error.message));
  process.exit(1);
});
