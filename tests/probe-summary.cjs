/*
 * Diagnostic: what does the real local model make of a real page?
 *
 * e2e-summary.cjs uses a fake gateway, which proves the plumbing but says
 * nothing about the summary itself. This one leaves the settings alone (so the
 * shipped default model is used), triggers 总结全文 on the same fixture article
 * and prints what comes back, with the timings.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\probe-summary.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';
const FIXTURE = process.env.SUMMARY_FIXTURE || 'fixture-summary.html';

function startPages() {
  const server = http.createServer((request, response) => {
    const name = String(request.url || '').replace(/^\//, '').split('?')[0];
    const file = path.join(projectRoot, 'tests', name);
    if (!name || !fs.existsSync(file)) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('missing');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const { server, port } = await startPages();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-summary-probe-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 820 },
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  /* The extension's own page, standing in for the menu click. */
  const driver = await context.newPage();
  await driver.goto('chrome-extension://' + EXTENSION_ID + '/translate/options.html');
  await driver.waitForTimeout(400);
  const model = await driver.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'translate:get-settings' }, (reply) => {
          const settings = reply && reply.settings;
          const current =
            settings && settings.models
              ? settings.models.find((item) => item.id === settings.translateModelId)
              : null;
          resolve(current ? current.model : '(none)');
        });
      })
  );
  console.log('model            : ' + model);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  await page.goto('http://127.0.0.1:' + port + '/' + FIXTURE, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-codex-summary') === 'ready',
    { timeout: 15000 }
  );

  const started = Date.now();
  await driver.evaluate(
    (needle) =>
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => {
          const tab = (tabs || []).find((item) => String(item.url || '').includes(needle));
          if (!tab) {
            resolve(false);
            return;
          }
          chrome.tabs.sendMessage(tab.id, { type: 'translate:summarize-page' }, () => resolve(true));
        });
      }),
    FIXTURE
  );

  const done = await page
    .waitForFunction(
      () => {
        const host = document.getElementById('codex-summary-page');
        const body = host && host.shadowRoot ? host.shadowRoot.querySelector('.panel .bd') : null;
        return body && !body.querySelector('.sk') ? body.innerText.trim() : null;
      },
      { timeout: 180000 }
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);

  console.log('elapsed          : ' + (Date.now() - started) + ' ms');
  console.log('page errors      : ' + (errors.length ? errors.join(' | ') : '(none)'));
  console.log('');
  console.log(done || '(no summary came back)');

  await context.close();
  server.close();
}

main().catch((error) => {
  console.error('summary probe failed: ' + (error && error.message));
  process.exit(1);
});
