/*
 * The failure banner must stay on screen.
 *
 * A gateway that never returns content used to have its raw JSON body pasted
 * into the progress pill, which pushed the pill past both edges of the window.
 * This points page translation at such a gateway, then measures the pill.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-error-pill.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');

function startServers() {
  const html = fs.readFileSync(path.join(projectRoot, 'tests', 'fixture.html'));
  const pages = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  // Answers 200 with no content and finish_reason "length", forever.
  const gateway = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      if (request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: [{ id: 'never-answers' }] }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      response.end(
        JSON.stringify({
          id: 'gen_01M2MG8Q1VKNZ3ATEdeadbeef',
          choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'length' }],
        })
      );
    });
  });
  const listen = (server) =>
    new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  return Promise.all([listen(pages), listen(gateway)]).then(([pagePort, gatewayPort]) => ({
    pages,
    gateway,
    pagePort,
    gatewayPort,
  }));
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const { pages, gateway, pagePort, gatewayPort } = await startServers();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-pill-e2e-'));

  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 1,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  const worker = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  // Point page translation at the gateway that never answers.
  if (worker) {
    await worker.evaluate(async (base) => {
      await chrome.storage.local.set({
        translateSettings: {
          displayMode: 'replace',
          autoTranslateAll: true,
          blockedSites: [],
          disableThinking: true,
          models: [{ id: 'bad', name: 'never-answers', kind: 'cloud', baseUrl: base, apiKey: 'k', model: 'never-answers' }],
          translateModelId: 'bad',
        },
      });
    }, 'http://127.0.0.1:' + gatewayPort + '/v1');
  }

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:' + pagePort + '/fixture.html', { waitUntil: 'load' });

  const pill = await page
    .waitForFunction(
      () => {
        const host = document.getElementById('codex-translate-page');
        if (!host || !host.shadowRoot) return null;
        const box = host.shadowRoot.querySelector('.pill');
        if (!box) return null;
        const label = box.querySelector('.label');
        if (!label || label.textContent.indexOf('翻译出错') !== 0) return null;
        const rect = box.getBoundingClientRect();
        return {
          text: label.textContent,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          viewport: window.innerWidth,
          labelClipped: label.scrollWidth > label.clientWidth + 1,
          rawJsonShown: label.textContent.indexOf('{"') >= 0,
        };
      },
      { timeout: 120000 }
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);

  await page.screenshot({ path: path.join(shotDir, 'error-pill.png') });

  if (!pill) {
    console.log('RESULT: no error pill appeared');
  } else {
    console.log('RESULT: pill text    = ' + pill.text);
    console.log('pill box             = left ' + pill.left + ' / right ' + pill.right + ' / width ' + pill.width + ' of ' + pill.viewport);
    console.log('inside the viewport  : ' + (pill.left >= 0 && pill.right <= pill.viewport));
    console.log('label ellipsised     : ' + pill.labelClipped);
    console.log('raw json in the pill : ' + pill.rawJsonShown);
  }

  // A narrow window is where an unconstrained pill used to run off the edge.
  const measure = () =>
    page.evaluate(() => {
      const host = document.getElementById('codex-translate-page');
      const box = host && host.shadowRoot ? host.shadowRoot.querySelector('.pill') : null;
      if (!box) return null;
      const rect = box.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        viewport: window.innerWidth,
      };
    });
  await page.setViewportSize({ width: 420, height: 760 });
  await page.waitForTimeout(250);
  const narrow = await measure();
  if (narrow) {
    console.log(
      'narrow window        : left ' + narrow.left + ' / right ' + narrow.right +
        ' / width ' + narrow.width + ' of ' + narrow.viewport +
        ' -> inside ' + (narrow.left >= 0 && narrow.right <= narrow.viewport)
    );
    await page.screenshot({ path: path.join(shotDir, 'error-pill-narrow.png') });
  } else {
    console.log('narrow window        : (pill had already faded)');
  }

  await context.close();
  pages.close();
  gateway.close();
}

main().catch((error) => {
  console.error('error pill e2e failed: ' + (error && error.message));
  process.exit(1);
});
