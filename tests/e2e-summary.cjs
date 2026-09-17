/*
 * 总结全文, end to end: the action the right-click menu triggers, the article
 * extraction, and the panel that shows the result.
 *
 * A native browser menu cannot be clicked from a test, so the message the menu
 * sends is sent here instead - from the extension's own origin, which is where
 * the menu click comes from.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-summary.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';
const SUMMARY_MD = '**结论：** 年内可能还有一次加息。\n\n## 要点\n\n- 基准利率上调 0.25 个百分点\n- 市场小幅下跌 0.3%\n- 失业率升至 4.1%';
const NOISE = ['NAV-MARKER', 'SIDEBAR-MARKER', 'COMMENT-MARKER', 'FOOTER-MARKER'];

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
}

function startGateway(seen) {
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'summary-model' }] }));
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
      seen.push({
        system: String((messages[0] && messages[0].content) || ''),
        user: String((messages[1] && messages[1].content) || ''),
      });
      response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      response.end(
        JSON.stringify({
          id: 'x',
          choices: [{ index: 0, message: { role: 'assistant', content: SUMMARY_MD }, finish_reason: 'stop' }],
        })
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function startPages() {
  const server = http.createServer((request, response) => {
    const name = String(request.url || '').replace(/^\//, '').split('?')[0];
    const file = path.join(projectRoot, 'tests', name);
    if (!name || !fs.existsSync(file)) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('missing');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function armSummary(context, gatewayPort) {
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null));
  if (!worker) return false;
  await worker.evaluate(async (base) => {
    await chrome.storage.local.set({
      translateSettings: {
        displayMode: 'replace',
        autoTranslateAll: false,
        blockedSites: [],
        disableThinking: true,
        models: [{ id: 'sum', name: 'summary', kind: 'cloud', baseUrl: base, apiKey: 'k', model: 'summary-model' }],
        translateModelId: 'sum',
      },
    });
  }, 'http://127.0.0.1:' + gatewayPort + '/v1');
  return true;
}

/* Exactly what the context menu does: find the tab, tell its content script. */
function triggerFromExtension(driver, needle) {
  return driver.evaluate(
    (value) =>
      new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => {
          const tab = (tabs || []).find((item) => String(item.url || '').includes(value));
          if (!tab) {
            resolve({ ok: false, error: 'tab not found' });
            return;
          }
          chrome.tabs.sendMessage(tab.id, { type: 'translate:summarize-page' }, () => {
            resolve({ ok: true });
          });
        });
      }),
    needle
  );
}

function readPanel(page) {
  return page.evaluate(() => {
    const host = document.getElementById('codex-summary-page');
    if (!host || !host.shadowRoot) return null;
    const body = host.shadowRoot.querySelector('.panel .bd');
    if (!body || body.querySelector('.sk')) return null;
    const buttons = host.shadowRoot.querySelectorAll('.panel .hd .iconbtn');
    return {
      text: body.innerText.trim(),
      headings: host.shadowRoot.querySelectorAll('.bd h1, .bd h2, .bd h3').length,
      items: host.shadowRoot.querySelectorAll('.bd li').length,
      strong: host.shadowRoot.querySelectorAll('.bd strong').length,
      labels: Array.from(buttons).map((button) => button.getAttribute('aria-label')).join(','),
    };
  });
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const seen = [];
  const { server: gateway, port: gatewayPort } = await startGateway(seen);
  const { server: pages, port: pagePort } = await startPages();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-summary-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 820 },
    deviceScaleFactor: 1,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  if (!(await armSummary(context, gatewayPort))) {
    console.error('no service worker appeared: nothing would be armed');
    process.exit(1);
  }

  /* The extension's own page, standing in for the menu click's origin. */
  const driver = await context.newPage();
  await driver.goto('chrome-extension://' + EXTENSION_ID + '/translate/options.html');
  await driver.waitForTimeout(500);

  for (const fixture of ['fixture-summary.html', 'fixture-summary-plain.html']) {
    console.log('--- ' + fixture + ' ---');
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error.message)));
    await page.goto('http://127.0.0.1:' + pagePort + '/' + fixture, { waitUntil: 'load' });
    const ready = await page
      .waitForFunction(
        () => document.documentElement.getAttribute('data-codex-summary') === 'ready',
        { timeout: 15000 }
      )
      .then(() => true)
      .catch(() => false);
    check('the summary script is loaded', ready);
    if (!ready) {
      await page.close();
      continue;
    }

    const before = await page.evaluate(() => ({
      article: (document.querySelector('article, #story') || document.body).innerText.trim().slice(0, 120),
      nodes: document.documentElement.children.length,
    }));

    /*
     * What the menu asks for first: the article, without drawing anything. This
     * is the text that goes into the side panel's composer.
     */
    const extracted = await driver.evaluate(
      (value) =>
        new Promise((resolve) => {
          chrome.tabs.query({}, (tabs) => {
            const tab = (tabs || []).find((item) => String(item.url || '').includes(value));
            if (!tab) {
              resolve({ ok: false, error: 'tab not found' });
              return;
            }
            chrome.tabs.sendMessage(tab.id, { type: 'translate:extract-page' }, (reply) => {
              resolve(reply || { ok: false, error: 'no reply' });
            });
          });
        }),
      fixture
    );
    check('the article can be extracted on its own', extracted.ok, (extracted.text || '').length + ' chars');
    const noiseInExtract = NOISE.filter((marker) => String(extracted.text || '').includes(marker));
    check('the extracted text has no page furniture', noiseInExtract.length === 0, noiseInExtract.join(', ') || 'clean');

    seen.length = 0;
    const sent = await triggerFromExtension(driver, fixture);
    check('the menu action reaches the page', sent.ok, sent.error || '');

    const panel = await page
      .waitForFunction(
        () => {
          const host = document.getElementById('codex-summary-page');
          if (!host || !host.shadowRoot) return null;
          const body = host.shadowRoot.querySelector('.panel .bd');
          return body && !body.querySelector('.sk') ? true : null;
        },
        { timeout: 60000 }
      )
      .then(() => readPanel(page))
      .catch(() => null);

    if (!panel) {
      check('the panel shows a summary', false, 'no panel appeared');
      await page.close();
      continue;
    }
    check('the panel shows a summary', panel.text.includes('利率上调'), panel.text.slice(0, 32));
    check(
      'markdown became real markup',
      panel.headings > 0 && panel.items >= 3 && panel.strong > 0,
      panel.headings + ' heading(s), ' + panel.items + ' item(s), ' + panel.strong + ' bold'
    );
    check('copy and close are both there', panel.labels === '复制,关闭', panel.labels);

    const sentBody = seen.length ? seen[seen.length - 1] : { system: '', user: '' };
    check('the summary prompt was sent', sentBody.system.includes('总结'), sentBody.system.split('\n')[0]);
    const article =
      fixture === 'fixture-summary.html'
        ? 'central bank raised its benchmark rate'
        : 'Cell prices dropped nine percent';
    check('the article reached the model', sentBody.user.includes(article), sentBody.user.length + ' chars');
    const leaked = NOISE.filter((marker) => sentBody.user.includes(marker));
    check('nav, sidebar, comments and footer stayed out', leaked.length === 0, leaked.join(', ') || 'clean');

    const after = await page.evaluate(() => ({
      article: (document.querySelector('article, #story') || document.body).innerText.trim().slice(0, 120),
      nodes: document.documentElement.children.length,
    }));
    check('the page text was not touched', after.article === before.article, after.article.slice(0, 32));
    check('only our own host was added', after.nodes === before.nodes + 1, before.nodes + ' -> ' + after.nodes);

    if (fixture === 'fixture-summary.html') {
      await page.screenshot({ path: path.join(shotDir, 'summary-panel.png') });
    }

    const closed = await page.evaluate(() => {
      const host = document.getElementById('codex-summary-page');
      const buttons = host.shadowRoot.querySelectorAll('.panel .hd .iconbtn');
      buttons[buttons.length - 1].click();
      return !document.getElementById('codex-summary-page');
    });
    check('关闭 removes the panel', closed);
    check('no page errors', errors.length === 0, errors.join(' | '));

    await page.close();
  }

  /* ---- the side panel: the request lands in the composer and gets sent ---- */
  const ARTICLE = '利率上调了零点二五个百分点，市场小幅下跌。';
  await driver.evaluate(async (text) => {
    await chrome.storage.local.set({
      codexSummaryRequest: { text, title: 'Fixture article', url: 'http://127.0.0.1/fixture', at: Date.now() },
      codexSummaryResult: { at: 0, ok: false, reason: '' },
    });
  }, ARTICLE);
  const panel = await context.newPage();
  await panel.goto('chrome-extension://' + EXTENSION_ID + '/codex-sidepanel/index.html');
  /* The real composer only renders once the local app server is up, so a stand
   * in is placed where the panel script looks for one. */
  await panel.evaluate(() => {
    const form = document.createElement('form');
    const area = document.createElement('textarea');
    area.id = 'fake-composer';
    const send = document.createElement('button');
    send.type = 'button';
    send.id = 'fake-send';
    send.setAttribute('aria-label', 'Send');
    send.addEventListener('click', () => {
      window.__sent = true;
    });
    form.appendChild(area);
    form.appendChild(send);
    document.body.appendChild(form);
  });
  await panel.waitForTimeout(1200);
  const filled = await panel.evaluate(async () => {
    const bag = await chrome.storage.local.get(['codexSummaryRequest', 'codexSummaryResult']);
    const area = document.getElementById('fake-composer');
    return {
      typed: String(area.value || '').length,
      asked: String(area.value || '').includes('总结'),
      carried: String(area.value || '').includes('利率上调'),
      sent: Boolean(window.__sent),
      result: bag.codexSummaryResult || null,
      spent: !bag.codexSummaryRequest,
    };
  });
  check('the panel script finds the composer', filled.typed > 0, filled.typed + ' chars typed');
  check('the composer gets a summary request', filled.asked && filled.carried, filled.asked + ' / ' + filled.carried);
  check('the composer is sent', filled.sent);
  check('the panel reports back', Boolean(filled.result && filled.result.ok), JSON.stringify(filled.result));
  check('the request is spent once used', filled.spent);
  await panel.close();

  await context.close();
  gateway.close();
  pages.close();
  console.log(failures ? 'RESULT: ' + failures + ' check(s) failed' : 'RESULT: all checks passed');
}

main().catch((error) => {
  console.error('summary e2e failed: ' + (error && error.message));
  process.exit(1);
});
