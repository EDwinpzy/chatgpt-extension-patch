/*
 * The interface is picked by hand in the settings, per model, and that pick is
 * the whole rule: no guessing from the model name, no walking the other routes
 * when one fails, no remembering what happened to work.
 *
 * The built scripts are loaded the way the service worker loads them, with fetch
 * stubbed, so what is asserted is the request that would go out and the reply
 * that would be read back.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\model-dialects.cjs
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

const GO = 'https://opencode.ai/zen/go/v1';

/* One service-worker-shaped sandbox. `respond` decides what each fetch answers. */
function makeWorker(storage, requests, respond) {
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
    let body = {};
    try {
      body = JSON.parse((init && init.body) || '{}');
    } catch (error) {
      body = {};
    }
    const record = {
      url,
      method: (init && init.method) || 'GET',
      headers: (init && init.headers) || {},
      body,
    };
    requests.push(record);
    const reply = respond(record, requests.length);
    return {
      ok: reply.status < 400,
      status: reply.status,
      text: async () => (typeof reply.raw === 'string' ? reply.raw : JSON.stringify(reply.body)),
      json: async () => reply.body,
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
  // Same order as translate/background-loader.js: settings first (it defines
  // NO_THINK_PARAMS), then the engine, then the bookmark port.
  for (const file of ['translate/settings.js', 'translate/engine.js', 'bookmarks/lib/classifier.js']) {
    vm.runInContext(fs.readFileSync(path.join(projectRoot, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox;
}

const ok200 = (content) => ({ status: 200, body: { choices: [{ message: { content } }] } });
const messages200 = (text) => ({ status: 200, body: { content: [{ type: 'text', text }], stop_reason: 'end_turn' } });
const responses200 = (text) => ({
  status: 200,
  body: {
    id: 'resp_1',
    status: 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
  },
});
const router500 = { status: 500, body: { type: 'error', error: { type: 'error', message: 'Internal server error' } } };

const translateCall = (worker, base, model, dialect) =>
  worker.callModel(
    [
      { role: 'system', content: 'Translate each numbered line to Chinese.' },
      { role: 'user', content: '[1] Machine learning models need data.' },
    ],
    { baseUrl: base, apiKey: 'sk-test', model, dialect, maxTokens: 512, disableThinking: true }
  );

const routeOf = (url) => url.slice(GO.length + 1);

async function main() {
  // 1. the stored pick is the rule, and nothing else is
  {
    const worker = makeWorker({}, [], () => ok200('x'));
    const cases = [
      ['messages', 'messages'],
      ['responses', 'responses'],
      ['chat', 'chat'],
      ['MESSAGES', 'messages'],
      ['', 'chat'],
      [undefined, 'chat'],
      ['auto', 'chat'],
      ['nonsense', 'chat'],
    ];
    const wrong = [];
    for (const [stored, want] of cases) {
      const got = worker.dialectFor(stored);
      if (got !== want) wrong.push(JSON.stringify(stored) + '->' + got);
    }
    check('the stored pick decides the route, empty means chat', wrong.length === 0, wrong.join(', ') || cases.length + ' values');
  }

  // 2. a name is not a guess: no table, no probing
  {
    const requests = [];
    const worker = makeWorker({}, requests, () => ok200('[1] 默认走 chat'));
    const out = await translateCall(worker, GO, 'union-alpha', undefined);
    check('a model nobody configured goes to chat completions', out === '[1] 默认走 chat' && requests.length === 1 && requests[0].url.endsWith('/chat/completions'), requests.map((item) => routeOf(item.url)).join(','));

    const gptRequests = [];
    const gptWorker = makeWorker({}, gptRequests, () => ok200('[1] 也是 chat'));
    await translateCall(gptWorker, GO, 'gpt-5.6-luna', undefined);
    check('the old name tables are gone', gptRequests.length === 1 && gptRequests[0].url.endsWith('/chat/completions'), gptRequests.map((item) => routeOf(item.url)).join(','));
  }

  // 3. there is no such thing as auto-detection left in the engine
  {
    const worker = makeWorker({}, [], () => ok200('x'));
    const leftover = ['dialectCandidates', 'preferredDialect', 'rememberDialect', 'knownDialect', 'ANTHROPIC_MODEL_PATTERNS']
      .filter((name) => typeof worker[name] !== 'undefined');
    check('no auto-detection helpers remain', leftover.length === 0, leftover.join(', ') || 'none');
  }

  // 4. the wire for a Messages pick
  {
    const requests = [];
    const worker = makeWorker({}, requests, () => messages200('[1] 机器学习模型需要数据。'));
    const out = await translateCall(worker, GO, 'union-alpha', 'messages');
    const request = requests[0];
    check('Messages goes to /messages', request.url === GO + '/messages', request.url);
    check('the reply is read from content[]', out === '[1] 机器学习模型需要数据。', out);
    check('it sends x-api-key and anthropic-version', Boolean(request.headers['x-api-key'] === 'sk-test' && request.headers['anthropic-version']), JSON.stringify(Object.keys(request.headers)));
    check('it keeps the OpenCode session header', Boolean(request.headers['x-opencode-session']));
    check('the system prompt is hoisted out of the turns', Boolean(request.body.system) && request.body.messages.length === 1 && request.body.messages[0].role === 'user', JSON.stringify(request.body.messages));
    check('max_tokens is sent', request.body.max_tokens === 512, String(request.body.max_tokens));
    check('no OpenAI-only fields ride along', !('stream' in request.body) && !('response_format' in request.body) && !('enable_thinking' in request.body) && !('chat_template_kwargs' in request.body) && !('reasoning' in request.body), JSON.stringify(Object.keys(request.body)));
    check('thinking off uses the Anthropic shape', JSON.stringify(request.body.thinking) === '{"type":"disabled"}', JSON.stringify(request.body.thinking));
  }

  // 5. the wire for a Chat Completions pick
  {
    const requests = [];
    const worker = makeWorker({}, requests, () => ok200('[1] 译文'));
    const out = await translateCall(worker, GO, 'glm-5.3-flash', 'chat');
    const request = requests[0];
    check('Chat Completions goes to /chat/completions', request.url === GO + '/chat/completions', request.url);
    check('it gets no Anthropic headers', !request.headers['x-api-key'] && !request.headers['anthropic-version']);
    check('it keeps the OpenAI thinking-off fields', request.body.enable_thinking === false && Boolean(request.body.reasoning), JSON.stringify(Object.keys(request.body)));
    check('the system prompt stays in the turns', request.body.messages.length === 2, String(request.body.messages.length));
    check('the answer is read as before', out === '[1] 译文', out);
  }

  // 6. the wire for a Responses pick
  {
    const requests = [];
    const worker = makeWorker({}, requests, () => responses200('[1] 响应接口'));
    const out = await translateCall(worker, GO, 'gpt-5.6-luna', 'responses');
    const request = requests[0];
    check('Responses goes to /responses', request.url === GO + '/responses', request.url);
    check('the reply is read from output[].content[]', out === '[1] 响应接口', out);
    check('the system prompt becomes instructions', typeof request.body.instructions === 'string' && request.body.instructions.length > 0);
    check('the turns become input', Array.isArray(request.body.input) && request.body.input.length === 1 && request.body.input[0].role === 'user', JSON.stringify(request.body.input));
    check('the budget is max_output_tokens', request.body.max_output_tokens === 512 && !('max_tokens' in request.body), JSON.stringify(Object.keys(request.body)));
    check('no chat-only or Anthropic fields ride along', !('messages' in request.body) && !('temperature' in request.body) && !('stream' in request.body) && !request.headers['x-api-key']);
    check('thinking off uses reasoning effort none', JSON.stringify(request.body.reasoning) === '{"effort":"none"}', JSON.stringify(request.body.reasoning));
  }

  // 7. a refused route is refused: the same route again, never another one
  {
    const storage = {};
    const requests = [];
    const worker = makeWorker(storage, requests, () => router500);
    const error = await translateCall(worker, GO, 'union-alpha', 'messages').then(
      () => '',
      (failure) => String((failure && failure.message) || failure)
    );
    check(
      'a 5xx is not answered by trying another route',
      requests.length === 3 && requests.every((item) => item.url === GO + '/messages') && /500/.test(error),
      requests.map((item) => routeOf(item.url)).join(',') + ' request(s) / ' + error.replace(/\n/g, ' ').slice(0, 40)
    );
    check('and the error says those retries happened', /已重试 2 次/.test(error), error.replace(/\n/g, ' '));
    check('nothing is remembered behind the user\'s back', !('translateModelDialects' in storage), JSON.stringify(Object.keys(storage)));
    check('and the error carries no retry trail', !/接口重试/.test(error), error.replace(/\n/g, ' ').slice(0, 60));
  }

  // 7b. what the user is told when the gateway refuses: its words, not its JSON
  {
    const refused = (body) => {
      const worker = makeWorker({}, [], () => ({ status: 503, body }));
      return translateCall(worker, GO, 'union-alpha', 'messages').then(
        () => '',
        (failure) => String((failure && failure.message) || failure)
      );
    };

    /* The exact body opencode.ai answered with when union-alpha's endpoint was
     * down (2026-09-17). */
    const down = await refused({
      type: 'error',
      error: { type: 'api_error', message: 'Upstream request failed: Endpoint is unavailable.' },
    });
    check(
      'a refused request quotes the gateway, braces and all removed',
      down === '模型返回 503：Upstream request failed: Endpoint is unavailable.\n（上游短暂不可用，已重试 2 次）',
      down
    );

    const bare = await refused({ type: 'error' });
    check(
      'a body with no message says so instead of printing {}',
      bare === '模型返回 503（没有给出原因）\n（上游短暂不可用，已重试 2 次）',
      bare
    );

    /* Relays that answer in plain text, and the ones that flatten the error
     * into a string, still have to come back as a sentence. */
    const plainWorker = makeWorker({}, [], () => ({ status: 429, body: 'rate limited' }));
    const plain = await translateCall(plainWorker, GO, 'union-alpha', 'messages').then(
      () => '',
      (failure) => String((failure && failure.message) || failure)
    );
    check('a body that is just text is passed through as the reason', plain === '模型返回 429：rate limited', plain);

    const rawWorker = makeWorker({}, [], () => ({ status: 429, body: null, raw: 'too many requests' }));
    const raw = await translateCall(rawWorker, GO, 'union-alpha', 'messages').then(
      () => '',
      (failure) => String((failure && failure.message) || failure)
    );
    check('and so is a body that is not JSON at all', raw === '模型返回 429：too many requests', raw);
  }

  // 8. off OpenCode the request is byte-identical to what it always was
  {
    const requests = [];
    const worker = makeWorker({}, requests, () => ok200('[1] 译文'));
    await translateCall(worker, 'https://api.deepseek.com', 'deepseek-chat', 'chat');
    const request = requests[0];
    check('other providers are untouched', request.url === 'https://api.deepseek.com/chat/completions' && !request.headers['x-opencode-session'], JSON.stringify(request.headers));

    const localRequests = [];
    const localWorker = makeWorker({}, localRequests, () => ok200('[1] 本地'));
    await translateCall(localWorker, 'http://127.0.0.1:11434/v1', 'translategemma:4b', 'chat');
    check('the local model is unchanged', localRequests[0].url === 'http://127.0.0.1:11434/v1/chat/completions', localRequests[0].url);
  }

  // 9. the two in-route retries still exist: budget and thinking-off fields
  {
    const requests = [];
    const worker = makeWorker({}, requests, (record) =>
      record.body.max_tokens > 512
        ? messages200('[1] 加长后成功')
        : { status: 200, body: { content: [], stop_reason: 'max_tokens' } }
    );
    const out = await translateCall(worker, GO, 'claude-sonnet-4-5', 'messages');
    check('stop_reason max_tokens raises the budget instead of failing', out === '[1] 加长后成功', out);
    check('the retry asked for more tokens', requests.length === 2 && requests[1].body.max_tokens > 512, requests.map((item) => item.body.max_tokens).join(' -> '));

    const respRequests = [];
    const respWorker = makeWorker({}, respRequests, (record) =>
      record.body.max_output_tokens > 512
        ? responses200('[1] 响应加长成功')
        : { status: 200, body: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] } }
    );
    const respOut = await translateCall(respWorker, GO, 'gpt-5.6-luna', 'responses');
    check('incomplete max_output_tokens raises the budget too', respOut === '[1] 响应加长成功', respOut);
  }

  // 10. the bookmark classifier is sent down the same picked route
  {
    const requests = [];
    const worker = makeWorker({}, requests, () => messages200('[{"id":"1","category":"AI"}]'));
    const results = await worker.CodexBookmarks.classifyBookmarks(
      [{ id: '1', name: 'Something', url: 'https://example.com/a' }],
      { model: { baseUrl: GO, apiKey: 'sk-test', model: 'union-alpha', dialect: 'messages' } },
      null
    );
    const request = requests[0];
    check('the classifier uses the picked route', Boolean(request && request.url.endsWith('/messages')), request && request.url);
    check('the classifier hoists the system prompt', Boolean(request && request.body.system) && request.body.messages.length === 1);
    check('the classifier sends no response_format there', Boolean(request && !('response_format' in request.body)));
    // validateResults normalises the category into a path, hence the array.
    check('the classifier reads the JSON out of content[]', JSON.stringify(results) === JSON.stringify([{ id: '1', category: ['AI'] }]), JSON.stringify(results));

    const chatRequests = [];
    const chatWorker = makeWorker({}, chatRequests, () => ok200('[{"id":"1","category":"工具"}]'));
    await chatWorker.CodexBookmarks.classifyBookmarks(
      [{ id: '1', name: 'Something', url: 'https://example.com/a' }],
      { model: { baseUrl: GO, apiKey: 'sk-test', model: 'glm-5.3-flash', dialect: 'chat' } },
      null
    );
    check('the classifier keeps response_format on the chat route', Boolean(chatRequests[0] && chatRequests[0].url.endsWith('/chat/completions') && chatRequests[0].body.response_format), chatRequests[0] && chatRequests[0].url);
  }

  console.log('');
  console.log(failures === 0 ? 'all checks passed' : failures + ' check(s) failed');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
