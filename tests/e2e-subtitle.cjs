/*
 * Subtitle translation: consecutive cues are gathered into one spoken passage,
 * that passage travels as a single request (with the lines before it as
 * context), and the bar shows the whole paragraph while the player's own
 * caption stays hidden underneath.
 *
 * A local gateway answers every request, so the run needs no real model.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-subtitle.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const FIXTURE = 'fixture-subtitle.html';

const seen = [];
let failures = 0;

function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
}

function startGateway() {
  const server = http.createServer((request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*',
      });
      response.end();
      return;
    }
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch (error) {
        body = {};
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const system = String((messages.find((item) => item.role === 'system') || {}).content || '');
      const user = String((messages.find((item) => item.role === 'user') || {}).content || '');
      seen.push({ system, user, at: Date.now() });
      // Answers after a short delay, the way a real model does, so the bar can
      // be observed arriving late rather than instantly.
      setTimeout(() => {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        response.end(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: '译文：' + user.replace(/^[\s\S]*Translate now:\s*/, '') } }],
          })
        );
      }, 250);
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

function readOverlay(page) {
  return page.evaluate(() => {
    const host = document.getElementById('codex-subtitle');
    const bar = host && host.shadowRoot ? host.shadowRoot.querySelector('.bar') : null;
    const line = document.getElementById('captionLine');
    const style = document.querySelector('style[data-codex-subtitle-style]');
    return {
      text: bar && !bar.hidden ? bar.textContent : '',
      hidden: !bar || bar.hidden,
      captionHidden: getComputedStyle(line).visibility === 'hidden',
      marked: line.hasAttribute('data-codex-subtitle-hidden'),
      cueRule: Boolean(style && style.textContent.indexOf('::cue') >= 0),
    };
  });
}

async function waitForOverlay(page, wanted) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const state = await readOverlay(page);
    if (state.text && (!wanted || state.text !== wanted)) return state;
    await page.waitForTimeout(100);
  }
  return readOverlay(page);
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const gateway = await startGateway();
  const pages = await startPages();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-subtitle-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 720 },
    deviceScaleFactor: 2,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  // The worker starts on its own schedule; poll instead of racing an event.
  let worker = null;
  for (let attempt = 0; attempt < 100 && !worker; attempt++) {
    worker = context.serviceWorkers()[0] || null;
    if (!worker) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!worker) {
    console.error('no service worker appeared');
    process.exit(1);
  }
  await worker.evaluate(async (base) => {
    await chrome.storage.local.set({
      translateSettings: {
        targetLang: 'zh-CN',
        displayMode: 'replace',
        autoTranslateAll: false,
        blockedSites: [],
        disableThinking: true,
        subtitleEnabled: true,
        subtitleFontSize: 20,
        subtitleMaxLines: 3,
        models: [{ id: 'fake', name: 'fake', kind: 'cloud', baseUrl: base, apiKey: 'k', model: 'fake-model' }],
        translateModelId: 'fake',
        subtitleModelId: 'fake',
      },
    });
  }, 'http://127.0.0.1:' + gateway.port + '/v1');

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  await page.goto('http://127.0.0.1:' + pages.port + '/' + FIXTURE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // 1. Two cues of one sentence, 300ms apart: the second completes the first
  //    before the idle timer fires, so they must travel as one request.
  await page.evaluate(() => window.setCaption('Machine learning models'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.setCaption('Machine learning models need data.'));
  const first = await waitForOverlay(page);
  console.log('passage       : ' + JSON.stringify(first.text));
  console.log('requests      : ' + seen.length);
  check('the passage is translated', /译文/.test(first.text), first.text);
  check('two cues cost one request', seen.length === 1, seen.length + ' request(s)');
  check('the whole sentence is in the request', seen[0] && /need data\./.test(seen[0].user), seen[0] && seen[0].user);

  // 2. The next sentence joins the paragraph, and the first one travels along
  //    as context so the translation does not start cold.
  await page.evaluate(() => window.setCaption('The API key is required to sign in.'));
  const second = await waitForOverlay(page, first.text);
  console.log('paragraph     : ' + JSON.stringify(second.text));
  console.log('requests      : ' + seen.length);
  check('the paragraph keeps the earlier sentence', /Machine learning/.test(second.text) && /API key/.test(second.text), second.text);
  check('one request per sentence', seen.length === 2, seen.length + ' request(s)');
  check(
    'the first sentence is sent as context',
    Boolean(seen[1] && /Earlier subtitle lines/.test(seen[1].user) && /Machine learning models need data\./.test(seen[1].user)),
    seen[1] && seen[1].user
  );
  check('subtitle prompt stays short', Boolean(seen[1] && seen[1].system.length < 600), seen[1] && String(seen[1].system.length));

  // 3. The player's own line is gone while ours is up.
  console.log('original line : hidden=' + second.captionHidden + '  marked=' + second.marked + '  cue rule=' + second.cueRule);
  check('the original caption is hidden', second.captionHidden && second.marked);
  check('native cues are hidden too', second.cueRule);
  await page.screenshot({ path: path.join(shotDir, 'subtitle-paragraph.png') });

  // 4. The captions stop: the bar goes away and the player's line comes back.
  await page.evaluate(() => window.setCaption(''));
  await page.waitForTimeout(2400);
  const cleared = await readOverlay(page);
  check('the bar clears on silence', cleared.hidden);
  check('the original caption is restored', cleared.captionHidden === false && cleared.marked === false);

  // 5. Native TextTrack cues, which never touch the DOM.
  await page.evaluate(() => window.setCue('Subtitle tracks are translated too.'));
  const cue = await waitForOverlay(page);
  console.log('track cue     : ' + JSON.stringify(cue.text));
  check('a native cue is translated', /译文/.test(cue.text), cue.text);
  await page.screenshot({ path: path.join(shotDir, 'subtitle-track.png') });

  // 6. Turning the switch off removes the overlay entirely.
  await worker.evaluate(async () => {
    const bag = await chrome.storage.local.get('translateSettings');
    const next = Object.assign({}, bag.translateSettings || {}, { subtitleEnabled: false });
    await chrome.storage.local.set({ translateSettings: next });
  });
  await page.waitForTimeout(900);
  const off = await page.evaluate(() => Boolean(document.getElementById('codex-subtitle')));
  check('switch off removes the overlay', !off);
  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log(failures ? 'RESULT: ' + failures + ' check(s) failed' : 'RESULT: all checks passed');
  await context.close();
  gateway.server.close();
  pages.server.close();
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error('subtitle e2e failed: ' + (error && error.message));
  process.exit(1);
});
