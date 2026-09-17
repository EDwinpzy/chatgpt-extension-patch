/*
 * Subtitle translation: a player-painted caption line and a native TextTrack
 * cue both have to end up as a translated line in our own overlay, and that
 * overlay replaces the player's line - the original is hidden while ours is up,
 * and put back the moment ours goes away.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-subtitle.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const FIXTURE = 'fixture-subtitle.html';

function startServer() {
  const html = fs.readFileSync(path.join(projectRoot, 'tests', FIXTURE));
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* Reads the overlay out of its shadow root, if it exists at all. */
function readOverlay(page) {
  return page.evaluate(() => {
    const host = document.getElementById('codex-subtitle');
    const bar = host && host.shadowRoot ? host.shadowRoot.querySelector('.bar') : null;
    const rect = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
    const video = document.getElementById('video').getBoundingClientRect();
    const line = document.getElementById('captionLine');
    const lineRect = line.getBoundingClientRect();
    const captionsShown = !document.getElementById('captions').hidden;
    const style = document.querySelector('style[data-codex-subtitle-style]');
    return {
      text: bar && !bar.hidden ? bar.textContent : '',
      hidden: !bar || bar.hidden,
      // Our line stands where the player's line was, not above it.
      overCaption: rect && captionsShown ? Math.abs(rect.top - lineRect.top) <= 2 : null,
      insideVideo: rect ? rect.top >= video.top - 1 && rect.bottom <= video.bottom + 1 : null,
      captionText: line.textContent,
      captionStyle: line.getAttribute('style'),
      captionHidden: getComputedStyle(line).visibility === 'hidden',
      marked: line.hasAttribute('data-codex-subtitle-hidden'),
      cueRule: Boolean(style && style.textContent.indexOf('::cue') >= 0),
    };
  });
}

async function waitForOverlay(page, wanted) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const state = await readOverlay(page);
    if (state.text && (!wanted || state.text !== wanted)) return state;
    await page.waitForTimeout(400);
  }
  return readOverlay(page);
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const { server, port } = await startServer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-subtitle-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 720 },
    deviceScaleFactor: 2,
    args: ['--disable-extensions-except=' + projectRoot, '--load-extension=' + projectRoot],
  });
  await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  await page.goto('http://127.0.0.1:' + port + '/' + FIXTURE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // 1. Player-painted captions.
  await page.evaluate(() => window.setCaption('Machine learning models need data.'));
  const dom = await waitForOverlay(page);
  console.log('dom caption   : ' + JSON.stringify(dom.text));
  console.log('replaces line : over=' + dom.overCaption + '  inside video: ' + dom.insideVideo);
  console.log('original line : hidden=' + dom.captionHidden + '  marked=' + dom.marked + '  cue rule=' + dom.cueRule);
  console.log('page caption  : ' + JSON.stringify(dom.captionText) + ' style=' + JSON.stringify(dom.captionStyle));
  console.log('has CJK       : ' + /[\u4e00-\u9fff]/.test(dom.text));
  await page.screenshot({ path: path.join(shotDir, 'subtitle-dom.png') });

  // 2. The line changes, the overlay follows.
  await page.evaluate(() => window.setCaption('The API key is required to sign in.'));
  const next = await waitForOverlay(page, dom.text);
  console.log('second line   : ' + JSON.stringify(next.text));
  console.log('changed       : ' + Boolean(next.text && next.text !== dom.text));

  // 3. Caption gone -> overlay clears.
  await page.evaluate(() => window.setCaption(''));
  await page.waitForTimeout(2200);
  const cleared = await readOverlay(page);
  console.log('cleared       : overlay hidden=' + cleared.hidden + '  original back=' + (cleared.captionHidden === false && cleared.marked === false));

  // 4. Native TextTrack cues, which never touch the DOM.
  await page.evaluate(() => window.setCue('Subtitle tracks are translated too.'));
  const cue = await waitForOverlay(page);
  console.log('track cue     : ' + JSON.stringify(cue.text) + '  has CJK: ' + /[\u4e00-\u9fff]/.test(cue.text));
  await page.screenshot({ path: path.join(shotDir, 'subtitle-track.png') });

  // 5. Turning the switch off removes the overlay entirely.
  const worker = context.serviceWorkers()[0];
  if (worker) {
    await worker.evaluate(async () => {
      const bag = await chrome.storage.local.get('translateSettings');
      const next = Object.assign({}, bag.translateSettings || {}, { subtitleEnabled: false });
      await chrome.storage.local.set({ translateSettings: next });
    });
  }
  await page.waitForTimeout(900);
  const off = await page.evaluate(() => Boolean(document.getElementById('codex-subtitle')));
  console.log('switch off    : overlay present = ' + off);
  console.log('page errors   : ' + (errors.length ? errors.join(' | ') : '(none)'));

  await context.close();
  server.close();
}

main().catch((error) => {
  console.error('subtitle e2e failed: ' + (error && error.message));
  process.exit(1);
});
