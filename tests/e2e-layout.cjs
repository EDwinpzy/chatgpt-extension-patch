/*
 * Proves page translation only rewrites text: no elements are added, no inline
 * styles appear, and flex rows keep the exact geometry they had before. The
 * fixture copies the sidebar shape that broke when translations were wrapped
 * in a styled span.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-layout.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');
const FIXTURE = 'fixture-layout.html';

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

/* Everything a translation must leave alone. */
function snapshot(page) {
  return page.evaluate(() => {
    // Our own shadow hosts and the injected echo stylesheet are not page content.
    const own = ['codex-translate-page', 'codex-translate-bubble'];
    const pageElements = Array.from(document.querySelectorAll('*')).filter(
      (el) => !own.includes(el.id) && !el.hasAttribute('data-codex-ghost-style')
    );
    const box = (id) => {
      const element = document.getElementById(id);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)];
    };
    const styles = pageElements.map((element) => element.getAttribute('style'));
    // The page's own look, element by element. Nothing a translation does may
    // move any of these: font size, colour, family, weight and line height all
    // keep coming from the page's own CSS.
    const look = pageElements.map((element) => {
      const style = getComputedStyle(element);
      return [
        style.fontSize,
        style.color,
        style.fontFamily,
        style.fontWeight,
        style.lineHeight,
        style.display,
      ].join('|');
    });
    const named = ['label1', 'label4', 'cardTitle', 'cardBody', 'cardMono', 'nav1'].map((id) => {
      const element = document.getElementById(id);
      if (!element) return id + ': (missing)';
      const style = getComputedStyle(element);
      return id + ' ' + style.fontSize + ' ' + style.color + ' ' + style.fontFamily.split(',')[0];
    });
    const computed = (id) => {
      const style = getComputedStyle(document.getElementById(id));
      return [style.fontSize, style.color, style.lineHeight, style.display, style.fontFamily].join(' | ');
    };
    return {
      elements: pageElements.length,
      styles,
      look,
      named,
      nav: box('nav1'),
      label: box('label1'),
      ghost: (document.getElementById('cardGhost') || {}).textContent || '',
      title: (document.getElementById('cardTitle') || {}).textContent || '',
      body: computed('cardBody'),
      text: document.getElementById('cardBody').textContent,
    };
  });
}

function compare(before, after, options) {
  const checkGeometry = !options || options.geometry !== false;
  const problems = [];
  if (before.elements !== after.elements) {
    problems.push('element count ' + before.elements + ' -> ' + after.elements);
  }
  const changed = after.styles
    .map((value, index) => (value === before.styles[index] ? null : index))
    .filter((index) => index !== null);
  if (changed.length) {
    problems.push('inline style changed on ' + changed.length + ' element(s)');
  }
  const restyled = after.look
    .map((value, index) => (value === before.look[index] ? null : index))
    .filter((index) => index !== null);
  if (restyled.length) {
    problems.push('font, size or colour changed on ' + restyled.length + ' element(s)');
  }
  if (checkGeometry) {
    if (JSON.stringify(before.nav) !== JSON.stringify(after.nav)) {
      problems.push('sidebar row ' + JSON.stringify(before.nav) + ' -> ' + JSON.stringify(after.nav));
    }
    if (JSON.stringify(before.label) !== JSON.stringify(after.label)) {
      problems.push('sidebar label ' + JSON.stringify(before.label) + ' -> ' + JSON.stringify(after.label));
    }
  }
  if (before.body !== after.body) {
    problems.push('computed style ' + before.body + ' -> ' + after.body);
  }
  return problems;
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const { server, port } = await startServer();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-layout-e2e-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 700 },
    deviceScaleFactor: 1,
    args: [
      '--disable-extensions-except=' + projectRoot,
      '--load-extension=' + projectRoot,
    ],
  });
  const worker = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  const url = 'http://127.0.0.1:' + port + '/' + FIXTURE;

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));

  // Watches the progress pill for the shortening pass.
  await page.addInitScript(() => {
    window.__notes = [];
    window.setInterval(() => {
      const host = document.getElementById('codex-translate-page');
      const label = host && host.shadowRoot && host.shadowRoot.querySelector('.pill .label');
      if (!label) return;
      const text = label.textContent || '';
      if (text.indexOf('放不下') < 0) return;
      if (window.__notes[window.__notes.length - 1] !== text) window.__notes.push(text);
    }, 100);
  });

  const setMode = async (mode) => {
    if (!worker) return;
    await worker.evaluate(async (value) => {
      const bag = await chrome.storage.local.get('translateSettings');
      // The stamp keeps the one-time layout migration from rewriting the mode
      // this test sets on purpose.
      const next = Object.assign({}, bag.translateSettings || {}, {
        displayMode: value,
        layoutStamp: 'inline-2026-09',
      });
      await chrome.storage.local.set({ translateSettings: next });
    }, mode);
  };

  /* ---- bilingual ---- */
  await setMode('bilingual');
  await page.goto(url, { waitUntil: 'load' });
  const before = await snapshot(page);
  const bilingual = await page
    .waitForFunction(
      () => {
        const marks = Array.from(document.querySelectorAll('[data-codex-translated]'));
        return marks.length ? marks.map((el) => el.textContent.trim()) : null;
      },
      { timeout: 90000 }
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  const afterBilingual = await snapshot(page);
  // Bilingual mode adds text, so a narrow row can legitimately get taller;
  // everything except that geometry is still expected to be untouched.
  const bilingualProblems = compare(before, afterBilingual, { geometry: false });
  const detail = await page.evaluate(() => {
    const label = document.getElementById('label4');
    const stack = document.getElementById('stackTitle');
    const pseudo = document.getElementById('pseudoTitle');
    const pseudoContent = getComputedStyle(pseudo, '::after').content || '';
    const attr = document.getElementById('attrTitle');
    const deep = document.getElementById('deepTitle');
    return {
      notes: window.__notes || [],
      clipped: label ? label.textContent : '',
      fits: label ? label.scrollWidth <= label.clientWidth + 1 : null,
      stackTwin: document.querySelector('.ghost2') ? document.querySelector('.ghost2').textContent : '',
      stackTitle: stack ? stack.textContent : '',
      pseudoTitle: pseudo ? pseudo.textContent : '',
      pseudoContent: pseudoContent.replace(/^"|"$/g, ''),
      farTwin: document.querySelector('.ghost3') ? document.querySelector('.ghost3').textContent : '',
      farTitle: deep ? deep.textContent : '',
      attrTitle: attr ? attr.textContent : '',
      attrEcho: (getComputedStyle(attr, '::before').content || '').replace(/^"|"$/g, ''),
    };
  });
  // The decorative ghost must end up saying the same thing as the heading.
  const twin = {
    ghost: afterBilingual.ghost.replace(before.ghost, '').trim(),
    title: afterBilingual.title.replace(before.title, '').trim(),
  };
  // A match only counts when the echo really carries the translation, so an
  // untranslated page cannot pass these checks by comparing two originals.
  const inSync = (echo, title) => Boolean(echo) && echo === title && /[\u4e00-\u9fff]/.test(echo);
  console.log('bilingual blocks     : ' + (bilingual ? bilingual.length : 0));
  console.log('bilingual sample     : ' + String(bilingual && bilingual[0]).slice(0, 120));
  console.log('bilingual layout     : ' + (bilingualProblems.length ? bilingualProblems.join(' | ') : 'text only, untouched'));
  console.log('bilingual row height : ' + before.nav[3] + ' -> ' + afterBilingual.nav[3] + ' (longer text may wrap)');
  console.log('shorten pass         : ' + (detail.notes.length ? detail.notes.join(' | ') : '(not needed)'));
  console.log('clipped label        : ' + detail.clipped + '  [fits: ' + detail.fits + ']');
  console.log('ghost vs heading     : ' + (inSync(twin.ghost, twin.title) ? 'in sync' : 'MISMATCH (' + twin.ghost + ' / ' + twin.title + ')'));
  console.log('layered echo         : ' + (inSync(detail.stackTwin, detail.stackTitle) ? 'in sync' : 'MISMATCH (' + detail.stackTwin + ' / ' + detail.stackTitle + ')'));
  console.log('::after echo         : ' + (inSync(detail.pseudoContent, detail.pseudoTitle) ? 'in sync' : 'MISMATCH (' + detail.pseudoContent + ' / ' + detail.pseudoTitle + ')'));
  console.log('far layer echo       : ' + (inSync(detail.farTwin, detail.farTitle) ? 'in sync' : 'MISMATCH (' + detail.farTwin + ' / ' + detail.farTitle + ')'));
  console.log('attr() echo          : ' + (inSync(detail.attrEcho, detail.attrTitle) ? 'in sync' : 'MISMATCH (' + detail.attrEcho + ' / ' + detail.attrTitle + ')'));
  await page.screenshot({ path: path.join(shotDir, 'layout-bilingual.png') });

  /* ---- replace ---- */
  // A stored 译文字号 from an older build must not be able to restyle the page.
  if (worker) {
    await worker.evaluate(async () => {
      const bag = await chrome.storage.local.get('translateSettings');
      const next = Object.assign({}, bag.translateSettings || {}, { fontSize: 'large' });
      await chrome.storage.local.set({ translateSettings: next });
    });
  }
  await setMode('replace');
  await page.goto(url, { waitUntil: 'load' });
  const beforeReplace = await snapshot(page);
  const replaced = await page
    .waitForFunction(
      () => {
        const marks = Array.from(document.querySelectorAll('[data-codex-translated]'));
        return marks.length ? marks.map((el) => el.textContent.trim()) : null;
      },
      { timeout: 90000 }
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  const afterReplace = await snapshot(page);
  const replaceProblems = compare(beforeReplace, afterReplace);
  const replaceDetail = await page.evaluate(() => {
    const label = document.getElementById('label4');
    return {
      notes: window.__notes || [],
      clipped: label ? label.textContent : '',
      fits: label ? label.scrollWidth <= label.clientWidth + 1 : null,
    };
  });
  console.log('replace blocks       : ' + (replaced ? replaced.length : 0));
  console.log('replace sample       : ' + String(replaced && replaced[0]).slice(0, 120));
  console.log('original gone        : ' + !/Command Code uses API keys/.test(afterReplace.text));
  console.log('shorten pass         : ' + (replaceDetail.notes.length ? replaceDetail.notes.join(' | ') : '(not needed)'));
  console.log('clipped label        : ' + replaceDetail.clipped + '  [fits: ' + replaceDetail.fits + ']');
  console.log('ghost vs heading     : ' + (afterReplace.ghost === afterReplace.title && afterReplace.ghost !== beforeReplace.ghost ? 'in sync' : 'MISMATCH (' + afterReplace.ghost + ' / ' + afterReplace.title + ')'));
  console.log('replace layout       : ' + (replaceProblems.length ? replaceProblems.join(' | ') : 'text only, untouched'));
  console.log('fonts and colours    : ' + afterReplace.named.join('  //  '));
  console.log('page errors          : ' + (errors.length ? errors.join(' | ') : '(none)'));
  await page.screenshot({ path: path.join(shotDir, 'layout-replace.png') });

  // Restoring has to undo the injected echo rules as well.
  if (worker) {
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((item) => item.url && item.url.includes('fixture-layout.html'));
      if (tab) await chrome.tabs.sendMessage(tab.id, { type: 'translate:restore-page' });
    });
  }
  await page.waitForTimeout(700);
  const restored = await page.evaluate(() => ({
    after: (getComputedStyle(document.getElementById('pseudoTitle'), '::after').content || '').replace(/^"|"$/g, ''),
    title: document.getElementById('pseudoTitle').textContent,
    ghostAttrs: document.querySelectorAll('[data-codex-ghost]').length,
    ghostStyles: document.querySelectorAll('style[data-codex-ghost-style]').length,
    marked: document.querySelectorAll('[data-codex-translated]').length,
  }));
  console.log('restored echo        : ' + JSON.stringify(restored));

  await context.close();
  server.close();
}

main().catch((error) => {
  console.error('layout e2e failed: ' + (error && error.message));
  process.exit(1);
});
