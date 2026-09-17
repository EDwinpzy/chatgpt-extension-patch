/*
 * A model that cannot be reached is not the end of the run: the configured
 * model goes first, whatever it leaves untranslated is handed to the next model
 * in the list, and only a failure on every model reaches the page.
 *
 * The built scripts are loaded the way the service worker loads them, with
 * fetch stubbed, so what is asserted is where each request went and what came
 * back to the caller.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\model-fallback.cjs
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

const A = 'http://127.0.0.1:41101/v1';
const B = 'http://127.0.0.1:41102/v1';
const C = 'http://127.0.0.1:41103/v1';
const hostOf = (base) => new URL(base).host;

const model = (id, base, name) => ({
  id,
  name,
  kind: 'cloud',
  baseUrl: base,
  apiKey: 'sk-test',
  model: name,
  dialect: 'chat',
});

/* One service-worker-shaped sandbox. `respond` decides what each fetch
 * answers - and throws when a host refuses the connection. */
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
      text: async () => JSON.stringify(reply.body),
      json: async () => reply.body,
    };
  };

  const sandbox = {
    chrome,
    console: { log() {}, warn() {}, error() {} },
    self: null,
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
    URL,
  };
  vm.createContext(sandbox);
  vm.runInContext('globalThis.self = globalThis;', sandbox);
  // Same order as translate/background-loader.js: settings first (it defines
  // NO_THINK_PARAMS), then the engine. The bookmark port stays out of this one.
  for (const file of ['translate/settings.js', 'translate/engine.js']) {
    vm.runInContext(fs.readFileSync(path.join(projectRoot, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox;
}

/* A gateway that answers every numbered line, and signs the answer with the
 * host it came from, so a reply says which model produced it. */
function answers(record) {
  const host = new URL(record.url).host;
  const lines = String(record.body.messages[1].content).split('\n').filter(Boolean);
  const out = lines
    .map((line) => line.replace(/^\[(\d+)\]\s*/, (all, n) => '[' + n + '] 译文' + n + '（' + host + '）'))
    .join('\n');
  return { status: 200, body: { choices: [{ message: { content: out } }] } };
}

const unreachable = () => {
  throw new Error('Failed to fetch');
};

const translate = (worker, texts, purpose) =>
  worker.handleTranslateBatch({ type: 'translate:batch', texts, purpose });

const line = 'Machine learning models need data.';
const hosts = (requests) => requests.map((record) => new URL(record.url).host).join(',');

async function main() {
  // 1. the configured model goes first, and a dead one hands the work on
  {
    const requests = [];
    const worker = makeWorker(
      { translateSettings: { models: [model('primary', A, 'm-a'), model('backup', B, 'm-b')], translateModelId: 'primary' } },
      requests,
      (record) => (new URL(record.url).host === hostOf(A) ? unreachable() : answers(record))
    );

    const reply = await translate(worker, [line]);
    check('the configured model is asked first', requests[0].url.startsWith(A), requests[0].url);
    check('the next model finishes the job', Boolean(reply.ok) && reply.translations[0].indexOf(hostOf(B)) > 0, JSON.stringify(reply.translations));
    check('one request per model, nothing else', requests.length === 2, hosts(requests));

    /*
     * The cache is read per model, so the second run pays for the model that is
     * down and nothing else: the backup already has this sentence.
     */
    const again = await translate(worker, [line]);
    check('the second run only pays for the model that is down', requests.length === 3, hosts(requests));
    check('and the sentence still comes back translated', Boolean(again.ok) && again.translations[0].indexOf(hostOf(B)) > 0, JSON.stringify(again.translations));
  }

  // 2. three models: the two that are down are walked through in order
  {
    const requests = [];
    const worker = makeWorker(
      {
        translateSettings: {
          models: [model('one', A, 'm-a'), model('two', B, 'm-b'), model('three', C, 'm-c')],
          translateModelId: 'one',
        },
      },
      requests,
      (record) => (new URL(record.url).host === hostOf(C) ? answers(record) : unreachable())
    );

    const reply = await translate(worker, [line]);
    check('every model is tried in list order', hosts(requests) === [A, B, C].map(hostOf).join(','), hosts(requests));
    check('the third model is the one that answers', Boolean(reply.ok) && reply.translations[0].indexOf(hostOf(C)) > 0, JSON.stringify(reply.translations));
    check('the page is not told about the two failures', reply.ok === true && reply.error === undefined, JSON.stringify(reply.error));
  }

  // 3. only when every model fails does the caller see an error
  {
    const requests = [];
    const worker = makeWorker(
      { translateSettings: { models: [model('one', A, 'm-a'), model('two', B, 'm-b')], translateModelId: 'one' } },
      requests,
      unreachable
    );

    const reply = await translate(worker, [line]);
    check('every model down is still a failure', reply.ok === false, JSON.stringify(reply));
    check('the error is the configured model\'s', String(reply.error || '').indexOf('无法连接模型') === 0 || String(reply.error || '').indexOf('无法连接模型') > 0, String(reply.error));
    check('it was tried on both of them', requests.length === 2, hosts(requests));
  }

  // 3b. the 503 from the screenshot: a live endpoint that is not answering for
  //     this model. The next model takes over; with no next model the caller
  //     gets the gateway's own words, not its JSON.
  {
    const down503 = {
      status: 503,
      body: { type: 'error', error: { type: 'api_error', message: 'Upstream request failed: Endpoint is unavailable.' } },
    };
    const requests = [];
    const covered = makeWorker(
      {
        translateSettings: {
          models: [model('union', A, 'union-alpha'), model('spare', B, 'm-b')],
          translateModelId: 'union',
        },
      },
      requests,
      (record) => (new URL(record.url).host === hostOf(B) ? answers(record) : down503)
    );
    const coveredReply = await translate(covered, [line]);
    check(
      'a 503 on the model in use hands the page to the next model',
      Boolean(coveredReply.ok) && coveredReply.translations[0].indexOf(hostOf(B)) > 0,
      hosts(requests) + ' -> ' + JSON.stringify(coveredReply.translations)[0]
    );
    check(
      'the model that refuses is asked three times first',
      requests.filter((record) => new URL(record.url).host === hostOf(A)).length === 3,
      hosts(requests)
    );

    const alone = makeWorker(
      { translateSettings: { models: [model('union', A, 'union-alpha')], translateModelId: 'union' } },
      [],
      () => down503
    );
    const aloneReply = await translate(alone, [line]);
    check(
      'with no other model the reason comes back as a sentence',
      String(aloneReply.error) ===
        '模型返回 503：Upstream request failed: Endpoint is unavailable.\n（上游短暂不可用，已重试 2 次）',
      String(aloneReply.error)
    );
  }

  // 3c. the 503 that clears up: a refusal is not final until the same request
  //     has been sent again, so a batch stays with the model that was picked.
  {
    const down503 = {
      status: 503,
      body: { type: 'error', error: { type: 'api_error', message: 'Upstream request failed: Endpoint is unavailable.' } },
    };
    const requests = [];
    let asked = 0;
    const worker = makeWorker(
      { translateSettings: { models: [model('union', A, 'union-alpha')], translateModelId: 'union' } },
      requests,
      (record) => (++asked < 3 ? down503 : answers(record))
    );

    const reply = await translate(worker, [line]);
    check(
      'a 503 that clears up costs a retry, not the batch',
      Boolean(reply.ok) && String(reply.translations[0]).indexOf(hostOf(A)) > 0,
      JSON.stringify(reply.translations || reply.error)
    );
    check(
      'the same route was asked again, not another model',
      requests.length === 3 && requests.every((record) => new URL(record.url).host === hostOf(A)),
      hosts(requests)
    );
  }

  // 4. a model that answers but fails on one batch hands on that batch only
  {
    const requests = [];
    const poison = (record) => String(JSON.stringify(record.body)).indexOf('poison') >= 0;
    const worker = makeWorker(
      {
        translateSettings: {
          models: [model('one', A, 'm-a'), model('two', B, 'm-b')],
          translateModelId: 'one',
          // A long list is what forces two batches; the marker rides in the
          // second one.
          glossary: [],
        },
      },
      requests,
      (record) => {
        const host = new URL(record.url).host;
        if (host === hostOf(A)) {
          return poison(record) ? { status: 500, body: { error: 'too big' } } : answers(record);
        }
        return answers(record);
      }
    );

    const texts = [];
    for (let index = 0; index < 60; index++) {
      texts.push(
        (index < 40 ? 'Sentence ' : 'poison sentence ') + index + ' about machine learning models.'
      );
    }

    const reply = await translate(worker, texts);
    const fromFirst = reply.translations.slice(0, 40).every((value) => value.indexOf(hostOf(A)) > 0);
    const fromSecond = reply.translations.slice(40).every((value) => value.indexOf(hostOf(B)) > 0);
    const nothingLeft = reply.translations.every((value) => String(value || '').indexOf('译文') >= 0);
    check('the batch the first model managed stays with it', Boolean(reply.ok) && fromFirst, JSON.stringify(reply.translations && reply.translations[0]));
    check('the batch it could not do goes to the next model', fromSecond, JSON.stringify(reply.translations && reply.translations[40]));
    check('no entry is left in the source language', nothingLeft, JSON.stringify((reply.translations || []).filter((value) => String(value).indexOf('译文') < 0).slice(0, 2)));
    /*
     * The batch the first model refuses is sent three times before the next
     * model is asked: one batch, two attempts at it, then the handover.
     */
    check('one request for the first batch, three for the refused one, then the handover', requests.length === 5, hosts(requests));
  }

  // 5. subtitles keep their own first choice
  {
    const requests = [];
    const worker = makeWorker(
      {
        translateSettings: {
          models: [model('page', A, 'm-a'), model('subs', B, 'm-b')],
          translateModelId: 'page',
          subtitleModelId: 'subs',
        },
      },
      requests,
      (record) => (new URL(record.url).host === hostOf(B) ? answers(record) : unreachable())
    );

    const reply = await translate(worker, [line], 'subtitle');
    check('the subtitle model is asked first for subtitles', requests[0].url.startsWith(B), requests[0].url);
    check('subtitles fall back without a page model request', Boolean(reply.ok) && requests.length === 1, hosts(requests));
  }

  // 6. the same order of business for 总结全文, which is one long call
  {
    const requests = [];
    const good = makeWorker(
      { translateSettings: { models: [model('primary', A, 'm-a'), model('backup', B, 'm-b')], translateModelId: 'primary' } },
      requests,
      (record) => (new URL(record.url).host === hostOf(A) ? unreachable() : answers(record))
    );
    const summary = await good.handleSummarize({ text: 'Machine learning models need data.' });
    check('a summary walks the list the same way', Boolean(summary.ok) && hosts(requests) === [A, B].map(hostOf).join(','), hosts(requests));
    check('and comes back with the second model\'s text', String(summary.text || '').indexOf('Machine learning') >= 0, String(summary.text).slice(0, 60));

    const dead = makeWorker(
      { translateSettings: { models: [model('primary', A, 'm-a'), model('backup', B, 'm-b')], translateModelId: 'primary' } },
      [],
      unreachable
    );
    const failed = await dead.handleSummarize({ text: 'Machine learning models need data.' });
    check('a summary fails only when every model does', failed.ok === false && String(failed.error).indexOf('无法连接模型') >= 0, String(failed.error));
  }

  // 7. the candidate list itself
  {
    const worker = makeWorker({}, [], () => ({ status: 200, body: {} }));
    const list = [model('one', A, 'm-a'), model('two', B, 'm-b'), model('three', C, 'm-c')];

    const order = worker
      .translateModelCandidates({ models: list, translateModelId: 'two' }, 'translateModelId')
      .map((entry) => entry.id);
    check('the picked model leads, the rest follow in list order', order.join(',') === 'two,one,three', order.join(','));

    const broken = worker.translateModelCandidates(
      {
        models: [
          { id: 'no-address', model: 'm', kind: 'cloud' },
          { id: 'no-model', baseUrl: A, kind: 'cloud' },
          model('one', A, 'm-a'),
          model('one-again', A, 'm-a'),
        ],
        translateModelId: 'missing',
      },
      'translateModelId'
    );
    check('entries that cannot translate are skipped, copies are dropped', broken.map((entry) => entry.id).join(',') === 'one', broken.map((entry) => entry.id).join(','));

    const listed = worker.translateModelCandidates({ models: list, translateModelId: 'one' }, 'translateModelId');
    check('a one-model list is the list', worker.translateModelCandidates({ models: [list[0]], translateModelId: 'one' }, 'translateModelId').length === 1, String(listed.length));
    check('no models at all is no candidates', worker.translateModelCandidates({ models: [] }, 'translateModelId').length === 0);
  }

  // 8. one model, the old behaviour, unchanged
  {
    const requests = [];
    const worker = makeWorker(
      { translateSettings: { models: [model('only', A, 'm-a')], translateModelId: 'only' } },
      requests,
      unreachable
    );
    const reply = await translate(worker, [line]);
    check('a single model has nowhere to fall back to', reply.ok === false && requests.length === 1, hosts(requests) + ' / ' + String(reply.error).slice(0, 40));
  }

  console.log('');
  console.log(failures === 0 ? 'all checks passed' : failures + ' check(s) failed');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
