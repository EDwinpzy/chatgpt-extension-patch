/*
 * Diagnostic (not part of the regression set): does the built extension really
 * put x-opencode-session on the wire?
 *
 * It loads the extension in Edge, asks the real service worker for the header,
 * then sends one request to the real OpenCode endpoint with a deliberately
 * invalid key while watching the outgoing request. The key is invalid on
 * purpose: what is being checked is that the header leaves the browser, not
 * what the service answers. A 401 means the request was let through to the
 * auth check; 400 MissingSessionID is the failure this header exists to avoid.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\probe-opencode-wire.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const extensionDir = projectRoot;
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';
const BASE = 'https://opencode.ai/zen/go/v1';
/* One model per route OpenCode serves, each with the interface a user would
 * pick for it: chat completions, Anthropic messages, OpenAI responses. */
const MODELS = [
  { id: 'glm-5.3-flash', dialect: 'chat' },
  { id: 'union-alpha', dialect: 'messages' },
  { id: 'gpt-5.6-luna', dialect: 'responses' },
];

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-opencode-wire-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    args: ['--disable-extensions-except=' + extensionDir, '--load-extension=' + extensionDir],
  });

  const seen = [];
  context.on('request', (request) => {
    if (!request.url().startsWith('https://opencode.ai')) return;
    const headers = request.headers();
    seen.push({
      url: request.url(),
      method: request.method(),
      auth: headers.authorization ? 'present' : 'absent',
      session: headers['x-opencode-session'] || '',
      source: request.serviceWorker() ? 'service worker' : 'page',
    });
  });

  const worker = await context.waitForEvent('serviceworker', { timeout: 25000 }).catch(() => null);
  if (!worker) {
    console.log('FAIL no service worker - the extension did not start');
    await context.close();
    process.exit(1);
  }
  console.log('service worker : ' + worker.url());

  const helper = await worker.evaluate(async (base) => {
    try {
      return { ok: true, headers: await openCodeSessionHeaders(base) };
    } catch (error) {
      return { ok: false, error: String((error && error.message) || error) };
    }
  }, BASE);
  console.log('helper says    : ' + JSON.stringify(helper));

  const outcomes = [];
  for (const entry of MODELS) {
    const result = await worker.evaluate(
      async (args) => {
        try {
          const raw = await callModel([{ role: 'user', content: 'say ok' }], {
            baseUrl: args.base,
            apiKey: 'sk-probe-invalid-key',
            model: args.model,
            dialect: args.dialect,
            maxTokens: 16,
            timeoutMs: 20000,
          });
          return { ok: true, sample: String(raw).slice(0, 60) };
        } catch (error) {
          return { ok: false, error: String((error && error.message) || error) };
        }
      },
      { base: BASE, model: entry.id, dialect: entry.dialect }
    );
    outcomes.push(result);
    console.log('live call ' + entry.id.padEnd(16) + ' [' + entry.dialect + ']: ' + JSON.stringify(result));
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log('requests seen  : ' + seen.length);
  for (const item of seen) {
    console.log(
      '  ' + item.method + ' ' + item.url + '  auth=' + item.auth + '  x-opencode-session=' + (item.session || '(missing)') + '  from=' + item.source
    );
  }

  const carried = seen.some((item) => item.session);
  const expectedRoutes = ['/chat/completions', '/messages', '/responses'];
  const missing = expectedRoutes.filter((route) => !seen.some((item) => item.url.endsWith(route)));
  const rejected = /MissingSessionID/.test(JSON.stringify(outcomes));
  const routerFailure = /500/.test(JSON.stringify(outcomes));
  console.log('');
  console.log('header on the wire : ' + carried);
  console.log('routes reached     : ' + expectedRoutes.map((route) => route + '=' + seen.some((item) => item.url.endsWith(route))).join('  '));
  console.log('still MissingSessionID : ' + rejected);
  console.log('still a router 500 : ' + routerFailure);

  await context.close();
  process.exit(carried && missing.length === 0 && !rejected && !routerFailure ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
