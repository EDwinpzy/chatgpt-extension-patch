/*
 * The model list is also the fallback order, so the cards can be dragged into
 * the order the user wants. What is asserted here: the drag changes the stored
 * order, the model in use does not change, a drag that starts on the card body
 * does not reorder anything (the card is still a button for switching), and
 * the keyboard can do the same thing from the handle.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\model-reorder.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
}

const MODEL = (id, name) => ({
  id,
  name,
  kind: 'cloud',
  baseUrl: 'https://' + id + '.test/v1',
  apiKey: 'k',
  model: id + '-model',
});

const MODELS = [MODEL('one', 'Model One'), MODEL('two', 'Model Two'), MODEL('three', 'Model Three')];

/* The order the page shows, left to right top to bottom. */
async function domOrder(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#modelList .card')).map((card) => {
      const name = card.querySelector('.name');
      return name ? name.textContent : '?';
    })
  );
}

async function stored(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'translate:get-settings' }, (reply) => {
          const settings = (reply && reply.settings) || {};
          resolve({
            order: (settings.models || []).map((model) => model.name),
            inUse: settings.translateModelId,
            first: settings.models && settings.models[0] ? settings.models[0].id : null,
          });
        });
      })
  );
}

/* Drag the handle of one card onto the top or bottom half of another. */
async function dragGrip(page, fromPosition, toPosition, half) {
  const grip = page.locator('#modelList .card:nth-child(' + fromPosition + ') .grip');
  const target = page.locator('#modelList .card:nth-child(' + toPosition + ')');
  const gripBox = await grip.boundingBox();
  const targetBox = await target.boundingBox();
  const startX = gripBox.x + gripBox.width / 2;
  const startY = gripBox.y + gripBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // A few small steps first: Chromium only starts the drag after it has seen
  // the pointer move with the button held down.
  await page.mouse.move(startX, startY + 6, { steps: 4 });
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    half === 'top' ? targetBox.y + 5 : targetBox.y + targetBox.height - 5,
    { steps: 14 }
  );
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-reorder-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 980, height: 660 },
    deviceScaleFactor: 2,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  const worker = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  if (worker) {
    await worker.evaluate(async (models) => {
      /* The middle one is in use, so a reorder has something to leave alone. */
      await chrome.storage.local.set({ translateSettings: { models, translateModelId: models[1].id } });
    }, MODELS);
  }

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  await page.goto('chrome-extension://' + EXTENSION_ID + '/translate/options.html');
  await page.waitForTimeout(700);

  check('the list starts in the stored order', (await domOrder(page)).join(',') === 'Model One,Model Two,Model Three', (await domOrder(page)).join(','));

  const handles = await page.evaluate(() => {
    const grips = Array.from(document.querySelectorAll('#modelList .grip'));
    return {
      count: grips.length,
      labelled: grips.every((grip) => Boolean(grip.getAttribute('aria-label'))),
      masked: grips.map((grip) => {
        const dots = grip.querySelector('.ico');
        return dots ? String(getComputedStyle(dots).maskImage || getComputedStyle(dots).webkitMaskImage) : '';
      }),
    };
  });
  check('every card carries a handle', handles.count === 3, String(handles.count));
  check('the handle says what it does', handles.labelled);
  check('the handle draws the grip icon', handles.masked.every((value) => value.indexOf('grip.svg') >= 0), handles.masked[0]);

  // 1. drag the last card to the top
  await dragGrip(page, 3, 1, 'top');
  const dragged = await domOrder(page);
  const afterDrag = await stored(page);
  check('dragging the last card to the top reorders the list', dragged.join(',') === 'Model Three,Model One,Model Two', dragged.join(','));
  check('and the stored order follows', afterDrag.order.join(',') === dragged.join(','), afterDrag.order.join(','));
  check('the model in use did not change', afterDrag.inUse === 'two', String(afterDrag.inUse));
  check('the in-use card is still the one marked', await page.evaluate(() => {
    const on = document.querySelector('#modelList .card.on .name');
    return on ? on.textContent === 'Model Two' : false;
  }));

  // 2. the keyboard does the same from the handle
  await page.locator('#modelList .card:nth-child(1) .grip').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const keyed = await domOrder(page);
  check('arrow down on the handle moves that card one place down', keyed.join(',') === 'Model One,Model Three,Model Two', keyed.join(','));
  check('and that order is stored too', (await stored(page)).order.join(',') === keyed.join(','));
  check('the handle keeps the focus after the move', await page.evaluate(() => {
    const active = document.activeElement;
    return Boolean(active && active.classList.contains('grip') && active.closest('.card').querySelector('.name').textContent === 'Model Three');
  }));

  // 3. dragging the card body is not a drag: it is still how models get picked
  const bodyBox = await page.locator('#modelList .card:nth-child(2) .name').boundingBox();
  await page.mouse.move(bodyBox.x + 5, bodyBox.y + bodyBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(bodyBox.x + 5, bodyBox.y + bodyBox.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const afterBodyDrag = await domOrder(page);
  check('dragging the card body does not reorder', afterBodyDrag.join(',') === 'Model One,Model Three,Model Two', afterBodyDrag.join(','));

  await page.click('#modelList .card:nth-child(2) .name');
  await page.waitForTimeout(300);
  const picked = await stored(page);
  check('clicking a card still switches the model in use', picked.inUse === 'three', String(picked.inUse));
  check('the order survived the switch', picked.order.join(',') === 'Model One,Model Three,Model Two', picked.order.join(','));

  const orderAfterKeys = await domOrder(page);
  await page.screenshot({ path: path.join(shotDir, 'models-reorder.png') });

  /* Deleting needs two taps on the same button: the first asks, the second
   * does it. */
  const removeCard = async (position) => {
    const selector = '#modelList .card:nth-child(' + position + ') .danger';
    await page.click(selector);
    await page.waitForTimeout(160);
    await page.click(selector);
    await page.waitForTimeout(320);
  };
  await removeCard(3);
  await removeCard(2);
  const lone = await page.evaluate(() => ({
    cards: document.querySelectorAll('#modelList .card').length,
    grips: document.querySelectorAll('#modelList .grip').length,
  }));
  check('the last card keeps no handle', lone.cards === 1 && lone.grips === 0, JSON.stringify(lone));

  check('no page errors', errors.length === 0, errors.join(' | ') || '(none)');

  console.log('');
  console.log('order after the drags : ' + orderAfterKeys.join(' | '));
  console.log('in use                : ' + picked.inUse);
  console.log('screenshot : ' + path.join(shotDir, 'models-reorder.png'));
  console.log(failures === 0 ? 'all checks passed' : failures + ' check(s) failed');

  await context.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('reorder e2e failed: ' + (error && error.message));
  process.exit(1);
});
