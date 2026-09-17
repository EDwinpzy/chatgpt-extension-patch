/*
 * Verifies the side-panel localisation script inside the real panel page.
 *
 * The panel only renders its full UI when it is connected to a running Codex
 * app server, which a throwaway profile cannot do. So this test loads the real
 * page (proving the script is wired in and runs) and then feeds it a synthetic
 * menu to check the translation map and the added menu entry.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\panel-zh.cjs
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-panel-zh-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 520, height: 700 },
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

  const loaded = await page.evaluate(() => window.__codexPanelZhLoaded === true);
  console.log('localisation script running: ' + loaded);

  // Synthetic chrome: a plain control, and a menu that looks like the real one.
  await page.evaluate(() => {
    const bar = document.createElement('div');
    bar.id = 'synthetic';
    bar.innerHTML =
      '<button id="s1" aria-label="New chat">New chat</button>' +
      '<button id="s2" title="Chat history">Chat history</button>' +
      '<div role="menu" id="menu">' +
      '<button role="menuitem">App settings</button>' +
      '<button role="menuitem">Copy</button>' +
      '<button role="menuitem">Archive</button>' +
      '</div>' +
      '<div id="chat">Settings Copy Archive</div>';
    document.body.appendChild(bar);
  });
  await page.waitForTimeout(700);

  const result = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#menu > *')).map((el) => el.textContent.trim());
    return {
      button1: document.getElementById('s1').textContent.trim(),
      aria1: document.getElementById('s1').getAttribute('aria-label'),
      button2: document.getElementById('s2').textContent.trim(),
      title2: document.getElementById('s2').getAttribute('title'),
      menuItems: items,
      added: items.filter((t) => t === '翻译设置').length,
      firstIsSettings: items[0] === '设置',
      chatUntouched: document.getElementById('chat').textContent.trim(),
    };
  });

  console.log('button text      : ' + result.button1 + ' / aria=' + result.aria1);
  console.log('second control   : ' + result.button2 + ' / title=' + result.title2);
  console.log('menu items       : ' + JSON.stringify(result.menuItems));
  console.log('our entry first  : ' + result.firstIsSettings);
  console.log('chat text intact : ' + JSON.stringify(result.chatUntouched));
  console.log('page errors      : ' + (errors.length ? errors.join(' | ') : '(none)'));

  await page.screenshot({ path: path.join(shotDir, 'panel-zh.png') });
  await context.close();
}

main().catch((error) => {
  console.error('panel zh test failed: ' + (error && error.message));
  process.exit(1);
});
