/*
 * Cloud-model response handling, checked against a local stand-in gateway:
 * one that only answers when the "thinking off" fields are absent, one that
 * answers with a parts array, and one that never returns content.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\fake-gateway.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';

const seen = [];

function startGateway() {
  const server = http.createServer((request, response) => {
    const url = request.url || '';
    if (request.method === 'GET' && url.endsWith('/models')) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      response.end(JSON.stringify({ object: 'list', data: [{ id: 'fake-model' }] }));
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
      const flags = Boolean(body.enable_thinking === false || body.thinking || body.reasoning || body.reasoning_effort);
      const system = String(((body.messages || [])[0] || {}).content || '');
      seen.push({ model: body.model, flags, system });

      // Used by the partial-failure check: whatever batch carries this marker
      // fails outright, the way one unlucky batch does in the wild.
      if (raw.includes('POISON')) {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'fake gateway refused this batch' } }));
        return;
      }

      // Echoes the numbered lines so the reply looks like a real translation.
      const input = String((body.messages || []).map((item) => item.content).join('\n') || '');
      const lines = input.split('\n').filter((line) => /^\s*\[\d+\]/.test(line));
      const translated = lines.map((line) => line.replace(/^(\s*\[\d+\])\s*/, '$1 译文 ')).join('\n') || '[1] 译文';

      const send = (payload) => {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        response.end(JSON.stringify(payload));
      };

      if (body.model === 'fake-flags' && flags) {
        // The failure the user hit: 200 OK, but the choice carries no content.
        send({ id: 'x', choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }] });
        return;
      }
      if (body.model === 'fake-empty') {
        send({ id: 'x', choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'length' }] });
        return;
      }
      if (body.model === 'fake-parts') {
        send({ choices: [{ message: { role: 'assistant', content: [{ type: 'text', text: translated }] }, finish_reason: 'stop' }] });
        return;
      }
      if (body.model === 'fake-truncate') {
        // A reasoning model that spends the whole output budget thinking and
        // leaves nothing for the answer. A larger budget gets a real reply.
        if (Number(body.max_tokens) < 4000) {
          send({ id: 'x', choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'length' }] });
        } else {
          send({ choices: [{ index: 0, message: { role: 'assistant', content: translated }, finish_reason: 'stop' }] });
        }
        return;
      }
      send({ choices: [{ message: { role: 'assistant', content: translated }, finish_reason: 'stop' }] });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const { server, port } = await startGateway();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-gateway-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  const worker = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  const page = await context.newPage();
  await page.goto('chrome-extension://' + EXTENSION_ID + '/translate/options.html');
  await page.waitForTimeout(600);
  const base = 'http://127.0.0.1:' + port + '/v1';

  const probe = (name) =>
    page.evaluate(
      (args) =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: 'translate:test-model',
              model: { id: 'probe', name: args.name, kind: 'cloud', baseUrl: args.base, apiKey: 'probe-key', model: args.name },
            },
            (reply) => {
              if (chrome.runtime.lastError) resolve({ lastError: chrome.runtime.lastError.message });
              else resolve(reply);
            }
          );
        }),
      { name, base }
    );

  for (const name of ['fake-flags', 'fake-parts', 'fake-empty', 'fake-truncate']) {
    seen.length = 0;
    const reply = await probe(name);
    const calls = seen.map((entry) => (entry.flags ? '[flags]' : '[no flags]')).join(' -> ');
    console.log(name + ': ok=' + Boolean(reply && reply.ok) + ' calls=' + calls);
    if (reply && reply.ok) console.log('  sample: ' + String(reply.sample).slice(0, 80));
    else console.log('  error : ' + String((reply && reply.error) || '').split('\n').join(' / ').slice(0, 220));
  }

  /* The shipped glossary has to reach the model, and short ASCII terms must
   * not fire inside longer words. */
  if (worker) {
    await worker.evaluate(async (args) => {
      await chrome.storage.local.set({
        translateSettings: {
          displayMode: 'replace',
          models: [{ id: 'probe', name: 'probe', kind: 'cloud', baseUrl: args.base, apiKey: 'k', model: 'fake-model' }],
          translateModelId: 'probe',
        },
      });
    }, { base });
  }
  seen.length = 0;
  const batch = await page.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'translate:batch', texts: ['Open the API key page, then rebuild the settings screen.'] },
          (reply) => {
            if (chrome.runtime.lastError) resolve({ lastError: chrome.runtime.lastError.message });
            else resolve(reply);
          }
        );
      })
  );
  const system = seen.length ? seen[seen.length - 1].system : '';
  console.log('batch ok           : ' + Boolean(batch && batch.ok));
  console.log('glossary injected  : ' + system.includes('API Key -> API 密钥') + ' / ' + system.includes('Settings -> 设置'));
  console.log('longer word skipped: ' + !system.includes('Build -> 构建') + ' (text says rebuild)');

  /*
   * Names have to come back untouched, and a block that is nothing but a name
   * must not cost a request at all. Ordinary words that merely look like a name
   * ("edge cases") must still be translated.
   */
  const sendBatch = (texts) =>
    page.evaluate(
      (values) =>
        new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'translate:batch', texts: values }, (reply) => {
            if (chrome.runtime.lastError) resolve({ lastError: chrome.runtime.lastError.message });
            else resolve(reply);
          });
        }),
      texts
    );

  seen.length = 0;
  const nameOnly = await sendBatch(['ChatGPT']);
  const nameOnlyValue = nameOnly && nameOnly.translations ? String(nameOnly.translations[0]) : '';
  console.log('name-only batch    : "' + nameOnlyValue + '"  requests=' + seen.length + ' (expect 0)');

  seen.length = 0;
  await sendBatch(['Ask ChatGPT about the pricing page.']);
  const nameSystem = seen.length ? seen[seen.length - 1].system : '';
  console.log('keep-as-is rule    : ' + nameSystem.includes('Do not translate') + ' / ' + nameSystem.includes('- ChatGPT'));

  seen.length = 0;
  await sendBatch(['Edge cases are rare, and the windows are open.']);
  const plainSystem = seen.length ? seen[seen.length - 1].system : '';
  console.log('plain words open   : ' + !plainSystem.includes('- Microsoft Edge') + ' (text says edge cases)');

  /*
   * One failing batch must not cancel the whole page. A batch holds at most 40
   * items, so 45 items is two requests and only the second one carries the
   * poison marker: those five keep their original text, the other forty still
   * come back translated.
   */
  seen.length = 0;
  const many = [];
  for (let index = 0; index < 44; index++) many.push('Line ' + index + ' needs a translation.');
  many.push('POISON this batch has to fail.');
  const partial = await page.evaluate(
    (texts) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'translate:batch', texts }, (reply) => {
          if (chrome.runtime.lastError) resolve({ lastError: chrome.runtime.lastError.message });
          else resolve(reply);
        });
      }),
    many
  );
  const values = (partial && Array.isArray(partial.translations) ? partial.translations : []).map(String);
  const hasCjk = (value) => /[\u4e00-\u9fff]/.test(value);
  console.log('partial batch ok   : ' + Boolean(partial && partial.ok));
  console.log('partial requests   : ' + seen.length + ' (expect 2)');
  console.log('translated entries : ' + values.filter(hasCjk).length + ' / ' + many.length + ' (expect 40)');
  console.log('failed batch kept  : ' + (values[values.length - 1] === many[many.length - 1]) + ' (original text)');

  await context.close();
  server.close();
}

main().catch((error) => {
  console.error('fake gateway test failed: ' + (error && error.message));
  process.exit(1);
});
