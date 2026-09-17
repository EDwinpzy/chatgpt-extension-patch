/*
 * Live check against the real OpenCode endpoint, driven through the extension's
 * own 编辑模型 dialog - the same button the screenshot came from.
 *
 * It answers two questions a fake gateway cannot: does this model answer for
 * this key at all, and how long it takes. union-alpha measured 10-45s per
 * answer on 2026-09-17, which is why the test button is given the same 60s
 * budget a real translation gets.
 *
 * Diagnostic, not part of the regression set: it needs a real key and the
 * network. The key is read from the environment and never printed.
 *
 *   $env:OPENCODE_KEY = 'sk-...'
 *   $env:NODE_PATH    = "$env:APPDATA\npm\node_modules"
 *   node tests\probe-union-alpha.cjs [model-id] [chat|messages|responses]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';
const GO = 'https://opencode.ai/zen/go/v1';
const WAIT_MS = 120000;

const model = process.argv[2] || 'union-alpha';
const dialect = process.argv[3] || 'messages';
const apiKey = String(process.env.OPENCODE_KEY || '').trim();

if (!apiKey) {
  console.log('no key: set OPENCODE_KEY to the OpenCode key and try again');
  process.exit(2);
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-union-alpha-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 980, height: 620 },
    deviceScaleFactor: 2,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });

  const worker = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  if (worker) {
    await worker.evaluate(
      async (cfg) => {
        await chrome.storage.local.set({
          translateSettings: {
            models: [
              {
                id: 'live',
                name: cfg.model,
                kind: 'cloud',
                baseUrl: cfg.base,
                apiKey: cfg.key,
                model: cfg.model,
                dialect: cfg.dialect,
              },
            ],
            translateModelId: 'live',
          },
        });
      },
      { base: GO, key: apiKey, model, dialect }
    );
  }

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));

  await page.goto('chrome-extension://' + EXTENSION_ID + '/translate/options.html');
  await page.waitForTimeout(500);

  await page.click('#modelList .card:nth-child(1) button:text-is("编辑")');
  await page.waitForTimeout(300);

  const fieldOf = (id) => page.$eval('#' + id, (node) => node.value);
  console.log('service  : ' + (await fieldOf('fieldCloudService')));
  console.log('key      : ' + (apiKey ? '(set, ' + apiKey.length + ' chars)' : '(empty)'));
  console.log('model    : ' + (await fieldOf('fieldCloudModel') || (await fieldOf('fieldName'))));
  console.log('dialect  : ' + (await fieldOf('fieldDialect')));

  const started = Date.now();
  await page.click('#testModel');

  /* The answer is slow rather than early, so wait for the text to settle. */
  let result = '';
  while (Date.now() - started < WAIT_MS) {
    await page.waitForTimeout(500);
    const current = await page.$eval('#testResult', (node) => (node.hidden ? '' : node.textContent || ''));
    if (current && current.indexOf('正在请求模型') < 0) {
      result = current;
      break;
    }
  }

  const elapsed = Date.now() - started;
  const shot = path.join(shotDir, 'probe-union-alpha.png');
  await page.screenshot({ path: shot });

  console.log('');
  console.log('elapsed  : ' + elapsed + ' ms');
  console.log('result   : ' + (result || '(no answer before ' + WAIT_MS / 1000 + 's)').replace(/\s+/g, ' '));
  console.log('retried  : ' + /已重试/.test(result));
  console.log('page errors: ' + (errors.length ? errors.join(' | ') : '(none)'));
  console.log('screenshot : ' + shot);

  await context.close();
  process.exit(result.indexOf('连接正常') === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('probe failed: ' + (error && error.message));
  process.exit(1);
});
