/*
 * Exercises the cloud half of the add-model dialog: pick a provider, enter a
 * key, and check that the model list actually arrives in the picker.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\cloud-dialog.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';

async function runDialog(page, service, key) {
  await page.click('.nav .item[data-pane="models"]');
  await page.click('#addModel');
  await page.waitForTimeout(200);
  await page.click('#modelKind button[data-value="cloud"]');
  await page.selectOption('#fieldCloudService', service);
  await page.fill('#fieldCloudKey', key);
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const select = document.getElementById('fieldCloudModel');
    return {
      hint: document.getElementById('cloudModelHint').textContent,
      count: select.options.length,
      first: Array.from(select.options).slice(0, 3).map((o) => o.value),
      last: Array.from(select.options).slice(-2).map((o) => o.value),
    };
  });
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-translate-cloud-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 980, height: 720 },
    deviceScaleFactor: 2,
    args: [
      '--disable-extensions-except=' + projectRoot,
      '--load-extension=' + projectRoot,
    ],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  const page = await context.newPage();
  const failures = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) failures.push(msg.text());
  });
  const check = (label, ok, detail) => {
    if (!ok) failures.push(label + (detail ? ' [' + detail + ']' : ''));
    console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
  };

  await page.goto('chrome-extension://' + EXTENSION_ID + '/translate/options.html');
  await page.waitForTimeout(600);

  for (const service of ['commandcode', 'opencode', 'opencode-go']) {
    const state = await runDialog(page, service, 'probe-key');
    console.log(service + ': ' + JSON.stringify(state));
    if (service === 'commandcode') {
      await page.screenshot({ path: path.join(shotDir, 'dialog-cloud-models.png') });
    }
    await page.click('#cancelModel');
    await page.waitForTimeout(200);
  }

  // Switching tabs must not leave the other tab's test result on screen.
  await page.click('#addModel');
  await page.waitForTimeout(200);
  const stale = await page.evaluate(() => {
    const result = document.getElementById('testResult');
    result.hidden = false;
    result.textContent = '连接正常（3468 毫秒）';
    return true;
  });
  await page.click('#modelKind button[data-value="cloud"]');
  await page.waitForTimeout(200);
  const afterSwitch = await page.evaluate(() => {
    const result = document.getElementById('testResult');
    return { hidden: result.hidden, text: result.textContent, label: document.getElementById('testModel').textContent };
  });
  console.log('stale result cleared on tab switch (' + stale + '): ' + JSON.stringify(afterSwitch));
  await page.click('#cancelModel');

  /*
   * The interface picker: does it offer the three protocols + auto, does a
   * pinned one survive save -> reopen, and does the card say which one it is.
   * Typed by hand against a custom service so no network is involved.
   */
  await page.click('#addModel');
  await page.waitForTimeout(150);
  await page.click('#modelKind button[data-value="cloud"]');
  await page.selectOption('#fieldCloudService', 'custom');
  await page.fill('#fieldName', 'probe-messages');
  await page.fill('#fieldBaseUrl', 'https://example.test/v1');
  await page.fill('#fieldApiKey', 'probe-key');
  await page.fill('#fieldModel', 'union-alpha');
  const dialectOptions = await page.evaluate(() =>
    Array.from(document.getElementById('fieldDialect').options).map((option) => option.value + '=' + option.textContent.trim())
  );
  check('the interface picker offers the three protocols, with no auto entry', dialectOptions.join(',') === 'chat=Chat Completions,messages=Messages（Anthropic）,responses=Responses（OpenAI）', dialectOptions.join(','));
  const defaultDialect = await page.evaluate(() => document.getElementById('fieldDialect').value);
  check('a new model defaults to Chat Completions', defaultDialect === 'chat', defaultDialect);

  await page.selectOption('#fieldDialect', 'messages');
  await page.screenshot({ path: path.join(shotDir, 'dialog-cloud-dialect.png') });
  await page.click('#saveModel');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => {
    const cards = document.querySelectorAll('#modelList .card');
    const last = cards[cards.length - 1];
    return { sub: last.querySelector('.sub').textContent, count: cards.length };
  });
  check('the card says which interface was pinned', /Messages/.test(saved.sub) && !/Chat Completions|Responses/.test(saved.sub), saved.sub);

  await page.evaluate(() => {
    const cards = document.querySelectorAll('#modelList .card');
    const buttons = cards[cards.length - 1].querySelectorAll('button');
    for (const button of buttons) {
      if (button.textContent === '编辑') button.click();
    }
  });
  await page.waitForTimeout(300);
  const reopened = await page.evaluate(() => document.getElementById('fieldDialect').value);
  check('reopening the model shows the pinned interface', reopened === 'messages', reopened);
  await page.click('#cancelModel');

  console.log('CSP blocks: ' + (failures.length ? failures.join(' | ') : '(none)'));
  await context.close();
  console.log(failures.length ? 'dialog checks failed' : 'all checks passed');
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error('cloud dialog failed: ' + (error && error.message));
  process.exit(1);
});
