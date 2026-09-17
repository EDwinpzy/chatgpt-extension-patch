/*
 * Switching the model that translation actually uses: the in-use badge has to
 * be obvious and the other card has to offer to take over.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\model-switch.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';

const MODELS = [
  /* Written the way it was stored before the shipped local model changed, so
   * this run also covers the one-time move to the new one. */
  { id: 'local-hunyuan', name: 'Hunyuan-MT-7B', kind: 'local', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', model: 'hunyuan-mt-7b:latest' },
  {
    id: 'cloud-commandcode',
    name: 'Command Code · deepseek/deepseek-v4.1-flash',
    kind: 'cloud',
    baseUrl: 'https://api.commandcode.ai/provider/v1',
    apiKey: 'k',
    model: 'deepseek/deepseek-v4.1-flash',
  },
  {
    id: 'cloud-opencode',
    name: 'OpenCode · qwen3.8-max',
    kind: 'cloud',
    baseUrl: 'https://opencode.ai/zen/v1',
    apiKey: 'k',
    model: 'qwen3.8-max',
  },
];
const MOVED = { id: 'local-translategemma', name: 'TranslateGemma-4B' };

async function readCards(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#modelList .card')).map((card) => {
      const tag = card.querySelector('.tag');
      return {
        name: (card.querySelector('.name') || {}).textContent,
        badge: tag ? tag.textContent : '',
        badgeTag: tag ? tag.tagName : '',
        active: card.classList.contains('on'),
        checked: card.getAttribute('aria-checked'),
      };
    })
  );
}

async function storedPick(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'translate:get-settings' }, (reply) => {
          resolve((reply && reply.settings && reply.settings.translateModelId) || null);
        });
      })
  );
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-switch-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 980, height: 620 },
    deviceScaleFactor: 2,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  const worker = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  if (worker) {
    await worker.evaluate(async (models) => {
      await chrome.storage.local.set({ translateSettings: { models, translateModelId: models[0].id } });
    }, MODELS);
  }

  const page = await context.newPage();
  await page.goto('chrome-extension://' + EXTENSION_ID + '/translate/options.html');
  await page.waitForTimeout(700);

  const before = await readCards(page);
  console.log('before : ' + JSON.stringify(before));
  console.log('migrated: ' + (before[0].name === MOVED.name) + '  (old local entry -> ' + MOVED.name + ')');
  console.log('stored : ' + (await storedPick(page)) + '  (expect ' + MOVED.id + ')');

  // Both cards have to start their name at the same x.
  const nameOffsets = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#modelList .card .name')).map((el) =>
      Math.round(el.getBoundingClientRect().left)
    )
  );
  console.log('name x  : ' + JSON.stringify(nameOffsets) + ' aligned=' + (new Set(nameOffsets).size === 1));

  // Click the badge on the model that is not in use.
  await page.click('#modelList .card:nth-child(2) .tag.action');
  await page.waitForTimeout(400);

  const after = await readCards(page);
  console.log('after  : ' + JSON.stringify(after));
  console.log('stored : ' + (await storedPick(page)));
  console.log(
    'switched: ' +
      (after[1].active && after[1].badge === '在用' && after[0].badge === '设为在用' && after[0].badgeTag === 'BUTTON')
  );
  await page.screenshot({ path: path.join(shotDir, 'models-switch.png') });

  /*
   * Deleting: the first tap asks, the second one removes. A card that is in
   * use hands the badge to another one instead of leaving nothing selected,
   * and the last card keeps its delete button hidden.
   */
  const clickDelete = async (position) => {
    const selector = '#modelList .card:nth-child(' + position + ') .danger';
    await page.click(selector);
    await page.waitForTimeout(160);
    await page.click(selector);
    await page.waitForTimeout(320);
  };

  await page.click('#modelList .card:nth-child(3) .danger');
  await page.waitForTimeout(200);
  const armed = await page.evaluate(() => {
    const button = document.querySelector('#modelList .card:nth-child(3) .danger');
    return button ? button.textContent : '(gone)';
  });
  console.log('delete asks first: ' + JSON.stringify(armed) + ' (after one tap)');
  await page.screenshot({ path: path.join(shotDir, 'models-delete.png') });
  await page.click('#modelList .card:nth-child(3) .danger');
  await page.waitForTimeout(320);
  const spare = await readCards(page);
  console.log('spare removed  : ' + (spare.length === 2) + '  (' + spare.length + ' left)');

  await clickDelete(2);
  const rest = await readCards(page);
  const deleteButtons = await page.evaluate(
    () => document.querySelectorAll('#modelList .card .danger').length
  );
  console.log('active removed : ' + (rest.length === 1 && rest[0].badge === '在用') + '  (' + rest[0].name + ' took over)');
  console.log('last one kept  : ' + (deleteButtons === 0) + '  (no delete button on the only card)');
  console.log('stored now     : ' + (await storedPick(page)));

  await context.close();
}

main().catch((error) => {
  console.error('model switch test failed: ' + (error && error.message));
  process.exit(1);
});
