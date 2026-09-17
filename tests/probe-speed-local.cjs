/*
 * Diagnostic: does the parallelism hold up on the real local model?
 *
 * e2e-speed.cjs uses a fake gateway with a fixed delay, which shows the
 * scheduling but says nothing about an actual model. This one first times a
 * single 40-line call straight to the local Ollama, then translates the same
 * 201-block page through the extension and prints how the two line up - six
 * calls in a row would be six times the first number, all in flight is closer
 * to one and a half.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\probe-speed-local.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const FIXTURE = 'fixture-speed.html';
const LOCAL_BASE = 'http://127.0.0.1:11434/v1';
/* Which pulled model to measure, e.g.
 *   $env:SPEED_MODEL = 'translategemma:4b'; node tests\probe-speed-local.cjs */
const MODEL = process.env.SPEED_MODEL || 'hunyuan-mt-7b:latest';

function post(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const target = new URL(url);
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (response) => {
        let raw = '';
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode, raw }));
      }
    );
    request.on('error', reject);
    request.write(payload);
    request.end();
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

/* The same numbered-line protocol the engine sends, so the timing is honest. */
function oneBatch(lines) {
  return post(LOCAL_BASE + '/chat/completions', {
    model: MODEL,
    temperature: 0.1,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: 'Translate each numbered line into Chinese. Keep the [n] prefix. One line in, one line out.' },
      { role: 'user', content: lines.map((text, index) => '[' + (index + 1) + '] ' + text).join('\n') },
    ],
  });
}

async function main() {
  const lines = [];
  for (let index = 1; index <= 40; index++) {
    lines.push('Block number ' + index + ' explains the credits and the billing rules for this workspace.');
  }

  let baseline = 0;
  try {
    /* Load the model first, untimed, so the numbers below are generation and
     * not disk. Switching models evicts the previous one, so this matters. */
    await oneBatch(lines.slice(0, 4));
    const started = Date.now();
    const reply = await oneBatch(lines);
    baseline = Date.now() - started;
    if (reply.status !== 200) {
      console.log('local model answered HTTP ' + reply.status + ' - is the right model pulled?');
      process.exit(0);
    }
  } catch (error) {
    console.log('local model not reachable at ' + LOCAL_BASE + ' (' + error.message + ') - nothing to measure');
    process.exit(0);
  }
  console.log('one 40-line call : ' + baseline + ' ms');

  /*
   * How many requests the local server really runs at once. One short call,
   * then four of them together: the same wall time means four slots, four
   * times the wall time means the server is queuing them.
   */
  const short = lines.slice(0, 8);
  const singleStart = Date.now();
  await oneBatch(short);
  const single = Date.now() - singleStart;
  const groupStart = Date.now();
  await Promise.all([oneBatch(short), oneBatch(short), oneBatch(short), oneBatch(short)]);
  const group = Date.now() - groupStart;
  console.log('one 8-line call  : ' + single + ' ms');
  console.log('four at once     : ' + group + ' ms  -> about ' + (single * 4 / group).toFixed(1) + ' of them run at once');

  const { server, port } = await startPages();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-speed-local-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1000, height: 800 },
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  /* Point the extension at the model being measured, so the page part and the
   * timings above describe the same thing. */
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null));
  if (!worker) {
    console.error('no service worker appeared: refusing to measure without pointing the page at ' + MODEL);
    process.exit(1);
  }
  await worker.evaluate(
    async (args) => {
      await chrome.storage.local.set({
        translateSettings: {
          displayMode: 'replace',
          autoTranslateAll: true,
          blockedSites: [],
          disableThinking: true,
          models: [{ id: 'probe', name: args.model, kind: 'local', baseUrl: args.base, apiKey: '', model: args.model }],
          translateModelId: 'probe',
        },
      });
    },
    { model: MODEL, base: LOCAL_BASE }
  );

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  const started = Date.now();
  await page.goto('http://127.0.0.1:' + port + '/' + FIXTURE, { waitUntil: 'load' });

  const count = await page.evaluate(() => window.__blocks);
  const marks = () => page.evaluate(() => document.querySelectorAll('[data-codex-translated]').length);

  let firstAt = 0;
  let lastAt = 0;
  for (let attempt = 0; attempt < 2400; attempt++) {
    const done = await marks();
    if (done && !firstAt) firstAt = Date.now() - started;
    if (done >= count) {
      lastAt = Date.now() - started;
      break;
    }
    await page.waitForTimeout(50);
  }

  console.log('model            : ' + MODEL);
  console.log('blocks           : ' + count);
  console.log('first译文 at      : ' + (firstAt || '(never)') + ' ms');
  console.log('all译文 at        : ' + (lastAt || '(never)') + ' ms');
  console.log('the same 201 blocks one batch at a time would be about ' + baseline * 5 + ' ms; this was ' + (lastAt || 0) + ' ms');
  /*
   * Speed on its own says nothing: a model that answers fast with the source
   * text still hits every deadline. So report what actually landed.
   */
  const quality = await page.evaluate(() => {
    const CJK = /[\u4e00-\u9fff]/;
    const blocks = Array.from(document.querySelectorAll('[data-codex-translated]'));
    const english = blocks.filter((block) => !CJK.test(block.innerText || '')).length;
    return {
      marked: blocks.length,
      english,
      sample: blocks.length ? blocks[0].innerText.trim().slice(0, 90) : '(nothing)',
    };
  });
  console.log('translated blocks: ' + quality.marked + '  (still English: ' + quality.english + ')');
  console.log('first译文 sample  : ' + quality.sample);
  console.log('page errors      : ' + (errors.length ? errors.join(' | ') : '(none)'));

  await context.close();
  server.close();
}

main().catch((error) => {
  console.error('local speed probe failed: ' + (error && error.message));
  process.exit(1);
});
