/*
 * Verifies that a long custom model name and the reasoning label share the
 * available width without either element pushing the other out of view.
 *
 *   $env:NODE_PATH = "C:\Users\63054\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
 *   node tests\model-picker-layout.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-model-picker-layout-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 520, height: 260 },
    deviceScaleFactor: 2,
    args: [
      '--disable-extensions-except=' + projectRoot,
      '--load-extension=' + projectRoot,
    ],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  await page.goto('chrome-extension://' + EXTENSION_ID + '/codex-sidepanel/index.html');
  await page.waitForTimeout(1200);
  await page.addStyleTag({
    content: fs.readFileSync(
      path.join(
        projectRoot,
        'codex-sidepanel',
        'assets',
        'thread-scroll-layout-Bflzd4-M.css',
      ),
      'utf8',
    ),
  });
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.id = 'model-picker-layout-fixture';
    fixture.style.cssText = 'width:240px;padding:0;background:#242424';
    fixture.innerHTML = `
      <div class="_Menu_3tdtn_1" style="width:240px;padding:8px;background:#303030">
        <div class="_SimpleView_3tdtn_118">
          <div class="_SliderTopRowMotion_3tdtn_8" data-active="true">
            <div class="_ViewControls_3tdtn_166" data-ultra-warning-visible="false">
              <button
                type="button"
                class="no-drag outline-hidden group cursor-interaction _ViewToggle_3tdtn_185"
                data-interactive="true"
                data-model-picker-view-toggle
              >
                <span class="_ViewToggleContent_3tdtn_234">
                  <span class="_ViewToggleModelLabel_3tdtn_258">
                    <span class="flex min-w-0 items-center gap-1 tabular-nums">
                      <span
                        aria-hidden="true"
                        style="display:inline-flex;width:20px;height:20px;flex:none;align-items:center;justify-content:center;border-radius:6px;background:#444;color:white"
                      >i</span>
                      <span class="truncate whitespace-nowrap">Space Bunny Alpha (Command Code)</span>
                    </span>
                  </span>
                  <span
                    class="_ViewToggleEffortLabel_3tdtn_265"
                    data-accent="true"
                    data-effort-only="false"
                  >Extra High</span>
                  <span class="_ViewToggleIcon_3tdtn_242" style="font-size:20px">›</span>
                </span>
              </button>
            </div>
          </div>
          <div class="h-3 w-full rounded-full bg-blue-500" style="position:relative">
            <span
              role="slider"
              tabindex="0"
              aria-label="Power"
              aria-valuemin="0"
              aria-valuenow="4"
              aria-valuemax="4"
              style="position:absolute;right:0;top:-13px;width:48px;height:48px;border-radius:999px;background:white"
            ></span>
          </div>
        </div>
      </div>`;
    document.body.appendChild(fixture);
  });
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const stylesheet = document.querySelector('link[href="./model-picker-layout.css"]');
    const toggle = document.querySelector('[data-model-picker-view-toggle]');
    const content = toggle.querySelector(':scope > span');
    const model = content.querySelector(':scope > span:first-child');
    const modelText = model.querySelector('.truncate');
    const effort = content.querySelector(':scope > [data-effort-only]');
    const icon = content.querySelector(':scope > span:last-child');
    const contentRect = content.getBoundingClientRect();
    const modelRect = model.getBoundingClientRect();
    const effortRect = effort.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();

    return {
      stylesheetLoaded: Boolean(stylesheet && stylesheet.sheet),
      text: modelText.textContent,
      effort: effort.textContent,
      contentWidth: contentRect.width,
      modelWidth: modelRect.width,
      modelScrollWidth: modelText.scrollWidth,
      modelClientWidth: modelText.clientWidth,
      effortRight: effortRect.right,
      contentRight: contentRect.right,
      iconCentered: Math.abs(
        iconRect.top + iconRect.height / 2 - (contentRect.top + contentRect.height / 2),
      ) < 1,
      effortIconSeparated: effortRect.right + 6 <= iconRect.left,
      labelsSeparated: effortRect.top >= modelRect.bottom - 1,
      modelOverflowing: modelText.scrollWidth > modelText.clientWidth + 1,
      effortInside: effortRect.right <= contentRect.right + 0.5,
    };
  });

  console.log(JSON.stringify(result, null, 2));
  await page.locator('#model-picker-layout-fixture').screenshot({
    path: path.join(shotDir, 'model-picker-layout.png'),
  });

  const shortModel = await page.evaluate(() => {
    const content = document.querySelector('[data-model-picker-view-toggle] > span');
    const model = content.querySelector(':scope > span:first-child');
    const modelText = model.querySelector('.truncate');
    const effort = content.querySelector(':scope > [data-effort-only]');
    modelText.textContent = '5.6 Sol';
    const modelRect = model.getBoundingClientRect();
    const effortRect = effort.getBoundingClientRect();
    return effortRect.top < modelRect.bottom - 1;
  });

  const effortOnly = await page.evaluate(() => {
    const content = document.querySelector('[data-model-picker-view-toggle] > span');
    const model = content.querySelector(':scope > span:first-child');
    const effort = content.querySelector(':scope > [data-effort-only]');
    model.remove();
    return {
      effortFirst: content.firstElementChild === effort,
      effortMargin: getComputedStyle(effort).marginLeft,
    };
  });

  const failures = [];
  if (!result.stylesheetLoaded) {
    failures.push('the model picker layout stylesheet is not loaded by the extension page');
  }
  if (result.text !== 'Space Bunny Alpha (Command Code)') {
    failures.push('fixture model text changed');
  }
  if (!result.modelOverflowing) {
    failures.push('long model name should ellipsize inside its available width');
  }
  if (result.modelWidth < 145) {
    failures.push('model label should get a readable line in the narrow picker');
  }
  if (!result.labelsSeparated) {
    failures.push('model and reasoning labels should use separate lines when space is tight');
  }
  if (!result.iconCentered) {
    failures.push('the disclosure arrow should stay vertically centered');
  }
  if (!result.effortIconSeparated) {
    failures.push('the reasoning label should keep a gap from the disclosure arrow');
  }
  if (!shortModel) {
    failures.push('a short model name should stay on the same line as the reasoning label');
  }
  if (!effortOnly.effortFirst || effortOnly.effortMargin !== '0px') {
    failures.push('effort-only mode should keep the effort label as an unstyled first child');
  }
  if (!result.effortInside) {
    failures.push('reasoning label overflows the trigger content');
  }
  if (errors.length) {
    failures.push('page errors: ' + errors.join(' | '));
  }

  await context.close();
  if (failures.length) {
    console.error('FAIL ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('ok   long model and reasoning label remain separated');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
