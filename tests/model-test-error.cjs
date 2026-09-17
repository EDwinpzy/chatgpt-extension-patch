/*
 * What the 测试 button says when a model refuses.
 *
 * The picture that prompted this: clicking 测试 on union-alpha while its
 * upstream endpoint was down answered with a dialog full of raw JSON
 * ("模型返回 503：{"type":"error","error":{"type":"api_error",..."). The reason
 * is worth reading; the braces are not.
 *
 * Two gateways are put up: one answers the exact 503 opencode.ai answered with
 * on 2026-09-17, the other answers properly.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\model-test-error.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
}

const DOWN_BODY = JSON.stringify({
  type: 'error',
  error: { type: 'api_error', message: 'Upstream request failed: Endpoint is unavailable.' },
});
const DOWN_REASON = '模型返回 503：Upstream request failed: Endpoint is unavailable.';
const HINT = '这一档正是翻译在用的那一个';

function startServers() {
  const gateway = (broken) =>
    http.createServer((request, response) => {
      let raw = '';
      request.on('data', (chunk) => {
        raw += chunk;
      });
      request.on('end', () => {
        const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
        if (request.method === 'GET') {
          response.writeHead(200, headers);
          response.end(JSON.stringify({ data: [{ id: 'union-alpha' }] }));
          return;
        }
        if (broken) {
          response.writeHead(503, headers);
          response.end(DOWN_BODY);
          return;
        }
        let body = {};
        try {
          body = JSON.parse(raw || '{}');
        } catch (error) {
          body = {};
        }
        const payload = String((body.messages && body.messages[1] && body.messages[1].content) || '');
        response.writeHead(200, headers);
        response.end(
          JSON.stringify({ choices: [{ message: { role: 'assistant', content: payload.replace(/^\[\d+\]\s*/, '') + '（译文）' } }] })
        );
      });
    });

  const listen = (server) =>
    new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  const down = gateway(true);
  const good = gateway(false);
  return Promise.all([listen(down), listen(good)]).then(([downPort, goodPort]) => ({
    down,
    good,
    downPort,
    goodPort,
  }));
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const { down, good, downPort, goodPort } = await startServers();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-test-error-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 980, height: 560 },
    deviceScaleFactor: 2,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  const worker = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  if (worker) {
    await worker.evaluate(async (cfg) => {
      await chrome.storage.local.set({
        translateSettings: {
          models: [
            { id: 'union', name: 'union-alpha', kind: 'cloud', baseUrl: cfg.down, apiKey: 'k', model: 'union-alpha', dialect: 'messages' },
            { id: 'spare', name: 'spare-model', kind: 'cloud', baseUrl: cfg.good, apiKey: 'k', model: 'spare', dialect: 'chat' },
          ],
          translateModelId: 'union',
        },
      });
    }, { down: 'http://127.0.0.1:' + downPort + '/v1', good: 'http://127.0.0.1:' + goodPort + '/v1' });
  }

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  const seen = [];
  page.on('dialog', async (dialog) => {
    seen.push(dialog.message());
    await dialog.dismiss();
  });

  await page.goto('chrome-extension://' + EXTENSION_ID + '/translate/options.html');
  await page.waitForTimeout(600);

  const testButton = (position) => page.locator('#modelList .card:nth-child(' + position + ') button:text-is("测试")');
  const buttonLabel = (position) =>
    page.evaluate((n) => {
      const card = document.querySelector('#modelList .card:nth-child(' + n + ')');
      const buttons = Array.from(card.querySelectorAll('button'));
      const button = buttons.find((item) => /测试|连接正常|失败/.test(item.textContent));
      return button ? button.textContent : '(none)';
    }, position);

  // 1. the model in use, and its upstream is down
  await testButton(1).click();
  /* The engine sends the same request twice more before it gives up. */
  await page.waitForTimeout(3400);
  const refused = seen[0] || '';
  check('the failure is reported as one reason', refused.indexOf(DOWN_REASON) >= 0, refused.split('\n')[0]);
  check('no JSON in the dialog', refused.indexOf('{') < 0, refused.split('\n')[0]);
  check('the dialog says the retries happened', refused.indexOf('已重试 2 次') >= 0, refused.split('\n').slice(1).join(' '));
  check('it says this is the model translation runs on', refused.indexOf(HINT) >= 0, refused.split('\n').slice(1).join(' '));

  // 2. a model that answers says so and says nothing else
  await testButton(2).click();
  await page.waitForTimeout(1500);
  check('a working model reports back without a dialog', seen.length === 1 && (await buttonLabel(2)) === '连接正常', seen.length + ' dialog(s) / ' + (await buttonLabel(2)));

  // 3. the same failure, on a card that is not in use: reason only, no hint
  await page.click('#modelList .card:nth-child(2) .tag.action');
  await page.waitForTimeout(300);
  await testButton(1).click();
  await page.waitForTimeout(3400);
  const second = seen[1] || '';
  check('the reason still comes through', second.indexOf(DOWN_REASON) >= 0, second);
  check('the fallback hint is gone once it is not the model in use', second.indexOf(HINT) < 0, second);

  await page.screenshot({ path: path.join(shotDir, 'models-test-error.png') });
  check('no page errors', errors.length === 0, errors.join(' | ') || '(none)');

  console.log('');
  console.log('dialog 1 : ' + JSON.stringify(seen[0]));
  console.log('dialog 2 : ' + JSON.stringify(seen[1]));
  console.log('screenshot: ' + path.join(shotDir, 'models-test-error.png'));
  console.log(failures === 0 ? 'all checks passed' : failures + ' check(s) failed');

  await context.close();
  down.close();
  good.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('model test error e2e failed: ' + (error && error.message));
  process.exit(1);
});
