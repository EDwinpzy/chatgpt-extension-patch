/*
 * Diagnostic: does the extension's own favicon endpoint work in this profile?
 *
 * The bookmark pane wants to show a site icon next to each bookmark. That uses
 * the "favicon" permission this extension already declares, through
 * chrome-extension://<id>/_favicon/?pageUrl=...&size=16. If the endpoint is not
 * available, the icons have to be dropped rather than shown broken.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\probe-favicon.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-favicon-probe-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  const worker = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  if (!worker) throw new Error('service worker never started');
  const id = new URL(worker.url()).host;

  const page = await context.newPage();
  await page.goto('chrome-extension://' + id + '/translate/options.html');

  const result = await page.evaluate(async (extensionId) => {
    const url = 'chrome-extension://' + extensionId + '/_favicon/?pageUrl=' +
      encodeURIComponent('https://example.com/') + '&size=16';
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return { ok: response.ok, status: response.status, type: blob.type, bytes: blob.size, url };
    } catch (error) {
      return { ok: false, error: String(error && error.message), url };
    }
  }, id);

  console.log(JSON.stringify(result, null, 2));
  await context.close();
  process.exit(result.ok && result.bytes > 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('probe failed: ' + (error && error.message));
  process.exit(1);
});
