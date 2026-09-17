/*
 * Diagnostic: where exactly does the cloud model-list request die?
 * Runs the same GET three ways - options page, service worker, and through the
 * extension message channel - and prints each outcome.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\diag-cloud.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const extensionDir = projectRoot;
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';
const BASE = 'https://api.commandcode.ai/provider/v1';

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-translate-diag-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    args: [
      '--disable-extensions-except=' + extensionDir,
      '--load-extension=' + extensionDir,
    ],
  });

  const worker = await context.waitForEvent('serviceworker', { timeout: 25000 }).catch(() => null);
  console.log('service worker: ' + (worker ? worker.url() : '(none)'));

  const page = await context.newPage();
  page.on('console', (msg) => console.log('[page console] ' + msg.type() + ': ' + msg.text()));
  await page.goto('chrome-extension://' + EXTENSION_ID + '/translate/options.html');
  await page.waitForTimeout(800);

  const fromPage = await page.evaluate(async (base) => {
    try {
      const response = await fetch(base + '/models', { headers: { Authorization: 'Bearer probe-key' } });
      const text = await response.text();
      return { status: response.status, body: text.slice(0, 160) };
    } catch (error) {
      return { error: String((error && error.message) || error) };
    }
  }, BASE);
  console.log('options page fetch: ' + JSON.stringify(fromPage));

  const fromWorker = worker
    ? await worker.evaluate(async (base) => {
        try {
          const response = await fetch(base + '/models', { headers: { Authorization: 'Bearer probe-key' } });
          const text = await response.text();
          return { status: response.status, body: text.slice(0, 160) };
        } catch (error) {
          return { error: String((error && error.message) || error) };
        }
      }, BASE)
    : { skipped: true };
  console.log('service worker fetch: ' + JSON.stringify(fromWorker));

  const postProbe = await page.evaluate(async (base) => {
    try {
      const response = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer probe-key' },
        body: JSON.stringify({ model: 'probe', messages: [{ role: 'user', content: 'hi' }] }),
      });
      const text = await response.text();
      return { status: response.status, body: text.slice(0, 160) };
    } catch (error) {
      return { error: String((error && error.message) || error) };
    }
  }, BASE);
  console.log('options page POST: ' + JSON.stringify(postProbe));

  const viaMessage = await page.evaluate(
    (base) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'translate:list-models', baseUrl: base, apiKey: 'probe-key' }, (reply) => {
          if (chrome.runtime.lastError) resolve({ lastError: chrome.runtime.lastError.message });
          else resolve(reply);
        });
      }),
    BASE
  );
  console.log('translate:list-models reply: ' + JSON.stringify(viaMessage).slice(0, 400));

  await context.close();
}

main().catch((error) => {
  console.error('diag failed: ' + (error && error.message));
  process.exit(1);
});
