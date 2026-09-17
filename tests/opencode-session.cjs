/*
 * OpenCode's endpoints answer 400 MissingSessionID unless the request carries
 * an x-opencode-session header, and they use it for routing and prompt caching.
 * The header belongs on those requests only: every other provider must keep
 * getting exactly the request it got before.
 *
 * The scripts under test are the built ones, loaded the way the service worker
 * loads them (engine.js first, so the bookmark classifier can reuse the helper).
 * fetch is a stub, so what is asserted is the request that would go out.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\opencode-session.cjs
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const projectRoot = path.resolve(__dirname, '..');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
}

const OPEN_CODE = 'https://opencode.ai/zen/go/v1';
const OTHER_HOSTS = [
  'https://api.deepseek.com',
  'https://api.commandcode.ai/provider/v1',
  'https://opencode.ai.evil.example/v1',
  'https://notopencode.ai/v1',
  'http://127.0.0.1:11434/v1',
];

/*
 * A service-worker-shaped sandbox: the listeners the engine registers are
 * accepted and never fired, storage is a plain object, and every fetch is
 * recorded instead of sent.
 */
function makeWorker(storage, requests) {
  const noopEvent = () => ({ addListener() {} });
  const chrome = {
    runtime: {
      onMessage: noopEvent(),
      onInstalled: noopEvent(),
      onStartup: noopEvent(),
      openOptionsPage() {},
      sendMessage: async () => null,
    },
    storage: {
      local: {
        get: async (key) => (key in storage ? { [key]: storage[key] } : {}),
        set: async (patch) => Object.assign(storage, patch),
        remove: async (key) => {
          delete storage[key];
        },
      },
    },
    contextMenus: { removeAll() {}, create() {}, onClicked: noopEvent() },
    tabs: { sendMessage: async () => null },
    scripting: { executeScript: async () => [] },
    sidePanel: { open: async () => {} },
  };

  const fetchStub = async (url, init) => {
    const body = (init && init.body) || '';
    requests.push({
      url,
      method: (init && init.method) || 'GET',
      headers: (init && init.headers) || {},
      body,
    });
    let payload = { choices: [{ message: { content: '译文' } }] };
    if (String(url).endsWith('/models')) payload = { object: 'list', data: [{ id: 'glm-5.3-flash' }] };
    else if (String(body).includes('classify-marker')) payload = { choices: [{ message: { content: '[{"id":"1","category":"工具"}]' } }] };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
      json: async () => payload,
    };
  };

  const sandbox = {
    chrome,
    console: { log() {}, warn() {}, error() {} },
    URL,
    fetch: fetchStub,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    AbortController,
    Uint8Array,
    Math,
    Date,
    JSON,
    Promise,
    String,
    Boolean,
    Array,
    Object,
    Number,
    Map,
    Set,
    Error,
  };
  vm.createContext(sandbox);
  vm.runInContext('globalThis.self = globalThis;', sandbox);
  // Same order as translate/background-loader.js.
  for (const file of ['translate/settings.js', 'translate/engine.js', 'bookmarks/lib/classifier.js']) {
    const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }
  return sandbox;
}

const isSessionId = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const sentTo = (requests, host) => requests.filter((item) => item.url.startsWith(host));

async function main() {
  const storage = {};
  const requests = [];
  const worker = makeWorker(storage, requests);

  // 1. the header itself
  const first = await worker.openCodeSessionHeaders(OPEN_CODE);
  check('the session header is sent to OpenCode Go', Boolean(first && first['x-opencode-session']), JSON.stringify(first));
  check('the value looks like a session id', isSessionId(first && first['x-opencode-session']), String(first && first['x-opencode-session']));

  const again = await worker.openCodeSessionHeaders('https://opencode.ai/zen/v1');
  check(
    'the same id is reused, Zen and Zen/Go included',
    Boolean(again) && again['x-opencode-session'] === first['x-opencode-session'],
    String(again && again['x-opencode-session'])
  );
  check('the id was written to storage', isSessionId(storage.translateSessionId), String(storage.translateSessionId));

  // 2. a worker restart keeps the same id, which is what the caching bucket wants
  const restarted = makeWorker(storage, []);
  const afterRestart = await restarted.openCodeSessionHeaders(OPEN_CODE);
  check('a new worker keeps the stored id', afterRestart['x-opencode-session'] === first['x-opencode-session']);

  // 3. nobody else gets the header
  let strangers = 0;
  for (const base of OTHER_HOSTS) {
    const headers = await worker.openCodeSessionHeaders(base);
    if (headers !== null) strangers++;
  }
  check('other providers get no session header', strangers === 0, OTHER_HOSTS.length + ' hosts checked');

  // 4. the wire: one translation call to each kind of endpoint
  await worker.callModel([{ role: 'user', content: 'hello' }], {
    baseUrl: OPEN_CODE,
    apiKey: 'sk-test',
    model: 'glm-5.3-flash',
    maxTokens: 64,
  });
  const goRequest = sentTo(requests, 'https://opencode.ai')[0];
  check('the translation request goes to /chat/completions', Boolean(goRequest), goRequest && goRequest.url);
  check('it carries the session header', Boolean(goRequest && goRequest.headers['x-opencode-session']), JSON.stringify(goRequest && goRequest.headers));
  check('it still carries the API key', Boolean(goRequest && goRequest.headers.Authorization === 'Bearer sk-test'));

  requests.length = 0;
  await worker.callModel([{ role: 'user', content: 'hello' }], {
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'sk-test',
    model: 'deepseek-chat',
    maxTokens: 64,
  });
  const plainRequest = sentTo(requests, 'https://api.deepseek.com')[0];
  check('a non-OpenCode call is unchanged', Boolean(plainRequest && !plainRequest.headers['x-opencode-session']), JSON.stringify(plainRequest && plainRequest.headers));

  // 5. listing models is a request to the same host, so it gets the header too
  requests.length = 0;
  const listed = await worker.handleListModels({ baseUrl: OPEN_CODE, apiKey: 'sk-test' });
  check('the model list comes back', Boolean(listed && listed.ok && listed.models.length === 1), JSON.stringify(listed));
  const listRequest = sentTo(requests, 'https://opencode.ai')[0];
  check('the model list request carries the session header', Boolean(listRequest && listRequest.headers['x-opencode-session']));

  requests.length = 0;
  await worker.handleListModels({ baseUrl: 'http://127.0.0.1:11434/v1' });
  const localListRequest = sentTo(requests, 'http://127.0.0.1')[0];
  check('the local model list request is unchanged', Boolean(localListRequest && !localListRequest.headers['x-opencode-session']));

  // 6. the bookmark classifier shares the same model list, so it shares the fix
  requests.length = 0;
  await worker.CodexBookmarks.classifyBookmarks(
    [{ id: '1', name: 'classify-marker', url: 'https://example.com/a' }],
    { model: { baseUrl: OPEN_CODE, apiKey: 'sk-test', model: 'glm-5.3-flash' } },
    null
  );
  const classifyRequest = sentTo(requests, 'https://opencode.ai')[0];
  check('the bookmark classifier carries the session header', Boolean(classifyRequest && classifyRequest.headers['x-opencode-session']));

  console.log('');
  console.log(failures === 0 ? 'all checks passed' : failures + ' check(s) failed');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
