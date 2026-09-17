/*
 * Renders the translation settings page from the patched extension and saves a
 * screenshot per section.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\options-shot.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
// The project folder itself is the loadable extension.
const extensionDir = projectRoot;
const shotDir = path.join(projectRoot, 'tests', 'out');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-translate-opt-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 980, height: 720 },
    deviceScaleFactor: 2,
    args: [
      '--disable-extensions-except=' + extensionDir,
      '--load-extension=' + extensionDir,
    ],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));

  await page.goto('chrome-extension://' + EXTENSION_ID + '/translate/options.html');
  await page.waitForTimeout(900);

  const sections = ['models', 'display', 'glossary', 'subtitle', 'sites'];
  /* Each side panel still switches to its own page; the shots follow the nav
   * rather than scrolling a single page. */
  const showPane = (id) =>
    page.click('.nav .item[data-pane="' + id + '"]');
  for (const section of sections) {
    await showPane(section);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(shotDir, 'options-' + section + '.png') });
  }

  const modelCount = await page.locator('#modelList .card').count();
  console.log('model cards rendered: ' + modelCount);
  console.log('page errors: ' + (errors.length ? errors.join(' | ') : '(none)'));

  /* The whole settings page, controls included, has to render in one font. */
  const fonts = await page.evaluate(() => {
    const read = (selector) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node).fontFamily : null;
    };
    return {
      installed: document.fonts.check('13px "Microsoft YaHei"'),
      body: read('body'),
      heading: read('.view h1'),
      button: read('.btn'),
      select: read('#targetLang'),
      field: read('input[type="password"]'),
      checkbox: read('#bmMoveClassified'),
      pane: read('.bm-block-head h3'),
    };
  });
  const yaheiFirst = (value) => typeof value === 'string' && /^\s*"?Microsoft YaHei"?/i.test(value);
  const parts = ['body', 'heading', 'button', 'select', 'field', 'checkbox', 'pane'];
  const offenders = parts.filter((key) => !yaheiFirst(fonts[key]));
  console.log('yahei installed    : ' + fonts.installed);
  console.log('font family        : ' + fonts.body);
  console.log('font everywhere    : ' + (offenders.length ? 'NO (' + offenders.join(', ') + ')' : 'yes'));

  await showPane('glossary');
  await page.waitForTimeout(200);
  const glossary = await page.evaluate(() => ({
    builtin: document.querySelectorAll('#glossaryBody tr.builtin').length,
    builtinInputs: document.querySelectorAll('#glossaryBody tr.builtin input').length,
    own: document.querySelectorAll('#glossaryBody tr:not(.builtin)').length,
    sample: (document.querySelector('#glossaryBody tr.builtin .term') || {}).textContent || '',
  }));
  console.log('glossary rows      : ' + JSON.stringify(glossary));
  await page.screenshot({ path: path.join(shotDir, 'options-glossary.png') });

  /* The names that must survive translation sit at the end of the list. */
  const keepRow = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#glossaryBody tr.builtin'));
    const row = rows.find((item) => item.textContent.indexOf('ChatGPT') >= 0);
    return row ? row.innerText.replace(/\s+/g, ' ').trim() : '(none)';
  });
  console.log('keep-as-is row     : ' + keepRow);
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#glossaryBody tr.builtin');
    if (rows.length) rows[rows.length - 1].scrollIntoView({ block: 'end' });
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(shotDir, 'options-glossary-names.png') });

  await showPane('subtitle');
  await page.waitForTimeout(200);
  const subtitle = await page.evaluate(() => ({
    enabled: document.getElementById('subtitleEnabled').getAttribute('aria-checked'),
    models: Array.from(document.getElementById('subtitleModel').options).map((option) => option.textContent),
    font: (document.querySelector('#subtitleFontSize button.on') || {}).textContent,
    position: (document.querySelector('#subtitlePosition button.on') || {}).textContent,
    lines: (document.querySelector('#subtitleMaxLines button.on') || {}).textContent,
  }));
  console.log('subtitle pane      : ' + JSON.stringify(subtitle));
  await page.screenshot({ path: path.join(shotDir, 'options-subtitle.png') });

  // The add-model dialog, in both modes.
  await showPane('models');
  await page.waitForTimeout(150);
  await page.click('#addModel');
  await page.waitForTimeout(300);
  await page.click('#modelKind button[data-value="local"]');
  await page.waitForTimeout(1500);
  const localState = await page.evaluate(() => ({
    cloudFieldsVisible: !document.getElementById('cloudFields').hidden,
    localFieldsVisible: !document.getElementById('localFields').hidden,
    serviceOptions: Array.from(document.getElementById('fieldService').options).map((o) => o.textContent),
    modelOptions: Array.from(document.getElementById('fieldLocalModel').options).map((o) => o.value),
    hint: document.getElementById('localModelHint').textContent,
  }));
  console.log('local dialog: ' + JSON.stringify(localState));
  await page.screenshot({ path: path.join(shotDir, 'dialog-local.png') });

  await page.click('#modelKind button[data-value="cloud"]');
  await page.waitForTimeout(200);
  const cloudState = await page.evaluate(() => ({
    cloudFieldsVisible: !document.getElementById('cloudFields').hidden,
    localFieldsVisible: !document.getElementById('localFields').hidden,
    cloudServiceOptions: Array.from(document.getElementById('fieldCloudService').options).map((o) => o.textContent),
    presetBlockVisible: !document.getElementById('cloudPresetFields').hidden,
    customBlockVisible: !document.getElementById('cloudCustomFields').hidden,
  }));
  console.log('cloud dialog: ' + JSON.stringify(cloudState));
  await page.screenshot({ path: path.join(shotDir, 'dialog-cloud.png') });

  await page.click('#cancelModel');

  await context.close();
}

main().catch((error) => {
  console.error('options shot failed: ' + (error && error.message));
  process.exit(1);
});
