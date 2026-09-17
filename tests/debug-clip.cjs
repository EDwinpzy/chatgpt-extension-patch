/*
 * Probe: what does the fit check actually see?
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\debug-clip.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const FIXTURE = 'fixture-layout.html';

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

async function main() {
  const { server, port } = await startServer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-clip-probe-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 700 },
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.text().includes('codex-debug')) console.log(msg.text());
  });
  await page.goto('http://127.0.0.1:' + port + '/' + FIXTURE, { waitUntil: 'load' });
  await page.waitForTimeout(12000);

  const report = await page.evaluate(() => {
    const out = [];
    for (const element of document.querySelectorAll('[data-codex-translated]')) {
      const boxes = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => (node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      });
      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        const style = getComputedStyle(parent);
        boxes.push(
          parent.tagName + (parent.id ? '#' + parent.id : '') +
          ' cw=' + parent.clientWidth + ' sw=' + parent.scrollWidth +
          ' ovx=' + style.overflowX + ' ell=' + style.textOverflow
        );
      }
      out.push({
        unit: element.tagName + (element.id ? '#' + element.id : ''),
        text: (element.textContent || '').trim().slice(0, 30),
        boxes,
      });
    }
    return out;
  });
  console.log(JSON.stringify(report, null, 2));

  await context.close();
  server.close();
}

main().catch((error) => {
  console.error('probe failed: ' + (error && error.message));
  process.exit(1);
});
