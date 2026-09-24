/*
 * Bookmark organising, end to end.
 *
 * Runs the whole thing against a throwaway profile: a local gateway stands in
 * for the model, a handful of bookmarks are planted in the bookmark bar, and
 * the settings pane is driven the way a person would drive it. It checks that
 * the preview changes nothing, that applying files the bookmarks and removes
 * the duplicate, that a second preview skips what is already filed, that the
 * duplicate tab deletes, and that a new bookmark is filed on its own when
 * auto-classify is on. Nothing here touches the real profile.
 *
 *   $env:NODE_PATH = "$env:APPDATA\npm\node_modules"
 *   node tests\e2e-bookmarks.cjs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const shotDir = path.join(projectRoot, 'tests', 'out');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
}

/* Stands in for the model: turns every "[ID:x] "name"" line in the prompt into
 * a category, so the whole flow runs without a real API. */
function startGateway(seen) {
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'classify-model' }] }));
      return;
    }
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      seen.push(raw);
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch (error) {
        body = {};
      }
      const prompt = String(((body.messages || [])[1] || {}).content || '');
      const items = [];
      const instructionMatch = prompt.match(/自定义整理要求：[\s\S]*?\n([\s\S]*?)\n\n/);
      const cutoffMatch = instructionMatch && instructionMatch[1].match(/(\d{4}-\d{2}-\d{2})/);
      const line = /\[ID:([^\]]+)\] "([^"]*)"(?: \| 创建时间:([^|\n]+))?/g;
      let match;
      while ((match = line.exec(prompt))) {
        const name = match[2];
        if (cutoffMatch && Date.parse((match[3] || '').trim()) >= Date.parse(cutoffMatch[1] + 'T00:00:00Z')) {
          items.push({ id: match[1], action: 'delete' });
          continue;
        }
        items.push({ id: match[1], category: /股票|行情|A 股/.test(name) ? '财经' : 'AI' });
      }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      response.end(
        JSON.stringify({
          id: 'gen_classify_1',
          choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(items) }, finish_reason: 'stop' }],
        })
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* The bookmark bar as plain data, so the assertions read like the tree. */
const READ_TREE = () => {
  const walk = (node) => ({
    title: node.title || '',
    url: node.url || null,
    children: (node.children || []).map(walk),
  });
  return chrome.bookmarks.getTree().then((tree) => {
    const root = tree[0];
    const bar = (root.children || []).find((child) => child.id === '1') || (root.children || [])[0];
    return walk(bar);
  });
};

function titlesIn(node, url) {
  const out = [];
  const walk = (current) => {
    if (current.url === url) out.push(current.title);
    (current.children || []).forEach(walk);
  };
  walk(node);
  return out;
}

function folderTitles(node, folder) {
  const out = [];
  for (const item of (node.children || []).filter((child) => !child.url && child.title === folder)) {
    const collect = (current) => {
      if (current.url) out.push(current.title);
      (current.children || []).forEach(collect);
    };
    collect(item);
  }
  return out;
}

function looseTitles(node) {
  return (node.children || []).filter((child) => child.url).map((child) => child.title);
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const seen = [];
  const { server: gateway, port: gatewayPort } = await startGateway(seen);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-bookmarks-e2e-'));

  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge',
    headless: true,
    viewport: { width: 1100, height: 900 },
    deviceScaleFactor: 1,
    args: [
      '--disable-extensions-except=' + projectRoot,
      '--load-extension=' + projectRoot,
      // Without this, a fresh profile imports Edge's own default favourites a
      // few seconds in, which would show up as extra bookmarks mid-test.
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  const worker = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  if (!worker) throw new Error('the extension service worker never started');

  const extensionId = new URL(worker.url()).host;

  /* Point the bookmark classifier at the stand-in gateway and plant the
   * bookmarks: two folders are the taxonomy, three loose bookmarks have to be
   * filed, two more are the same page saved twice, one is already filed. */
  await worker.evaluate(async (base) => {
    await chrome.storage.local.set({
      translateSettings: {
        displayMode: 'replace',
        models: [{ id: 'probe', name: 'classify', kind: 'cloud', baseUrl: base, apiKey: 'k', model: 'classify-model' }],
        translateModelId: 'probe',
        disableThinking: true,
      },
      bookmarkSettings: { bookmarkModelId: 'probe', moveClassified: true, autoClassify: false, autoDedupe: false },
    });

    const bar = (await chrome.bookmarks.getTree())[0].children.find((child) => child.id === '1');
    const ai = await chrome.bookmarks.create({ parentId: bar.id, title: 'AI' });
    await chrome.bookmarks.create({ parentId: bar.id, title: '财经' });
    await chrome.bookmarks.create({ parentId: bar.id, title: 'OpenAI 新模型发布', url: 'https://example-ai.test/one' });
    await chrome.bookmarks.create({ parentId: bar.id, title: 'A 股行情一览', url: 'https://example-fin.test/two' });
    await chrome.bookmarks.create({ parentId: bar.id, title: 'Zebra 观察笔记', url: 'https://zebra-diary.test/three' });
    await chrome.bookmarks.create({ parentId: bar.id, title: '重复的页面', url: 'https://example-dup.test/page?utm_source=a' });
    await chrome.bookmarks.create({ parentId: bar.id, title: '重复的页面', url: 'https://example-dup.test/page?utm_source=b' });
    await chrome.bookmarks.create({ parentId: ai.id, title: '已经在分类里', url: 'https://example-ai.test/inside' });
  }, 'http://127.0.0.1:' + gatewayPort + '/v1');

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message)));
  await page.goto('chrome-extension://' + extensionId + '/translate/options.html');
  await page.click('[data-pane="bookmarks"]');

  await page.waitForFunction(() => {
    const node = document.getElementById('bmBarCount');
    return node && node.textContent.trim().length > 0;
  }, { timeout: 20000 });

  const count = await page.textContent('#bmBarCount');
  const folderCount = await page.textContent('#bmCategoryCount');
  const categories = await page.textContent('#bmCategories');
  const modelValue = await page.inputValue('#bmModel');
  check('the pane counts the bar', count === '6' && folderCount === '2', count + ' / ' + folderCount);
  check('the taxonomy is the bar folders', /AI/.test(categories || '') && /财经/.test(categories || ''), categories);
  check('the bookmark model is the configured one', modelValue === 'probe', modelValue);
  // Nothing that belongs to a state the user has not reached may be on screen.
  check('the cleanup row is there but disabled', (await page.isVisible('#bmDedupeRow')) && (await page.isDisabled('#bmDedupeRemove')));
  check('the frequency row starts hidden', (await page.isVisible('#bmIntervalRow')) === false);
  check('the preview starts hidden', (await page.isVisible('#bmPreview')) === false);
  await page.screenshot({ path: path.join(shotDir, 'bookmarks-pane-idle.png'), fullPage: true });

  /* ---- 一键整理: preview, then apply ---- */
  await page.click('#bmOrganize');
  await page.waitForFunction(() => {
    const box = document.getElementById('bmPreview');
    const stats = document.getElementById('bmPreviewStats');
    return box && !box.hidden && stats && stats.textContent.includes('个文件夹');
  }, { timeout: 60000 });

  const previewStats = await page.textContent('#bmPreviewStats');
  check('the preview names the duplicate', /删重复 1/.test(previewStats || ''), previewStats);
  check('the model was asked to classify', seen.length > 0, seen.length + ' call(s)');

  const beforeApply = await worker.evaluate(READ_TREE);
  check('the preview changed nothing', looseTitles(beforeApply).length === 5, looseTitles(beforeApply).join(', '));
  await page.screenshot({ path: path.join(shotDir, 'bookmarks-preview.png'), fullPage: true });

  await page.click('#bmApply');
  await page.waitForFunction(() => {
    const node = document.getElementById('bmResult');
    return node && !node.hidden && node.textContent.includes('整理完成');
  }, { timeout: 60000 });
  const resultText = await page.textContent('#bmResult');
  check('apply reports what it did', /移动 \d+/.test(resultText || '') && /删重复 1/.test(resultText || ''), resultText);

  const tree = await worker.evaluate(READ_TREE);
  check('the rule-matched bookmark is filed', folderTitles(tree, 'AI').includes('OpenAI 新模型发布'), folderTitles(tree, 'AI').join(', '));
  check('the model-decided bookmark is filed', folderTitles(tree, 'AI').includes('Zebra 观察笔记'));
  check('the finance bookmark is filed', folderTitles(tree, '财经').includes('A 股行情一览'), folderTitles(tree, '财经').join(', '));
  const dupLeft = [];
  const collectDup = (node, prefix) => {
    if (node.url && node.url.indexOf(prefix) === 0) dupLeft.push(node.title);
    (node.children || []).forEach((child) => collectDup(child, prefix));
  };
  collectDup(tree, 'https://example-dup.test/page');
  check('the duplicate is gone', dupLeft.length === 1, dupLeft.join(', '));
  check('the bar has no loose bookmarks left', looseTitles(tree).length === 0, looseTitles(tree).join(', '));

  /* ---- 不移动已归类: the same run with the option off ---- */
  await page.uncheck('#bmMoveClassified');
  await page.waitForTimeout(400);
  await page.click('#bmOrganize');
  await page.waitForFunction(() => {
    const node = document.getElementById('bmResult');
    return node && !node.hidden && node.textContent.trim().length > 0;
  }, { timeout: 60000 });
  const skippedText = await page.textContent('#bmResult');
  check('already-filed bookmarks are skipped', /已经在对应文件夹里/.test(skippedText || ''), skippedText);
  await page.check('#bmMoveClassified');
  await page.waitForTimeout(400);

  /* ---- 重复检测 ---- */
  await worker.evaluate(async () => {
    const bar = (await chrome.bookmarks.getTree())[0].children.find((child) => child.id === '1');
    await chrome.bookmarks.create({ parentId: bar.id, title: '同一篇文章', url: 'https://example-two.test/story?from=share' });
    await chrome.bookmarks.create({ parentId: bar.id, title: '同一篇文章', url: 'https://example-two.test/story' });
  });
  await page.click('#bmDedupeScan');
  await page.waitForFunction(() => {
    const node = document.getElementById('bmDedupeStats');
    return node && node.textContent.includes('组重复');
  }, { timeout: 30000 });
  const dupStats = await page.textContent('#bmDedupeStats');
  const dupRows = await page.locator('#bmDedupeList .bm-dup').count();
  check('the duplicate scan groups them', /1 组重复/.test(dupStats || ''), dupStats);
  check('the group is rendered', dupRows === 1, dupRows + ' group row(s)');
  check('the scan enables the delete button', await page.isEnabled('#bmDedupeRemove'));
  const pills = await page.locator('#bmDedupeList .bm-pill').allTextContents();
  check('the group marks one to keep', pills.includes('保留') && pills.includes('删除'), pills.join(' / '));
  await page.screenshot({ path: path.join(shotDir, 'bookmarks-duplicates.png'), fullPage: true });

  await page.click('#bmDedupeRemove');
  await page.waitForFunction(() => {
    const node = document.getElementById('bmDedupeStats');
    return node && node.textContent.includes('删了');
  }, { timeout: 30000 });
  const dedupeResult = await page.textContent('#bmDedupeStats');
  const afterDedupe = await worker.evaluate(READ_TREE);
  let survivors = 0;
  const countUrl = (node, prefix) => {
    if (node.url && node.url.indexOf(prefix) === 0) survivors++;
    (node.children || []).forEach((child) => countUrl(child, prefix));
  };
  countUrl(afterDedupe, 'https://example-two.test/story');
  check('one of the pair was deleted', survivors === 1, dedupeResult + ' -> ' + survivors + ' left');
  check('the delete button disables again', await page.isDisabled('#bmDedupeRemove'));

  /* ---- 自动分类 ---- */
  // Anything a fresh profile dropped in on its own is removed first, so the
  // automatic run below is the only thing that can write the log line.
  await worker.evaluate(async () => {
    const ours = new Set([
      'OpenAI 新模型发布', 'A 股行情一览', 'Zebra 观察笔记', '重复的页面', '已经在分类里', '同一篇文章',
    ]);
    const bar = (await chrome.bookmarks.getTree())[0].children.find((child) => child.id === '1');
    const clean = async (node) => {
      for (const child of node.children || []) {
        if (child.url) {
          if (!ours.has(child.title)) await chrome.bookmarks.remove(child.id).catch(() => {});
          continue;
        }
        await clean(child);
      }
    };
    await clean(bar);
    await chrome.storage.local.remove('lastAutoClassify');
  });

  await page.click('#bmAutoClassify');
  await page.waitForTimeout(400);
  const autoState = await page.getAttribute('#bmAutoClassify', 'aria-checked');
  check('auto-classify can be switched on', autoState === 'true', autoState);

  await page.click('#bmAutoDedupe');
  await page.waitForTimeout(400);
  check('the frequency row appears with the timer', await page.isVisible('#bmIntervalRow'));
  await page.click('#bmAutoDedupe');
  await page.waitForTimeout(400);
  check('the frequency row hides with the timer', (await page.isVisible('#bmIntervalRow')) === false);

  await worker.evaluate(async () => {
    const bar = (await chrome.bookmarks.getTree())[0].children.find((child) => child.id === '1');
    await chrome.bookmarks.create({ parentId: bar.id, title: '自动分类的新书签', url: 'https://auto-filed.test/x' });
  });
  let filed = false;
  for (let attempt = 0; attempt < 40 && !filed; attempt++) {
    await page.waitForTimeout(500);
    const current = await worker.evaluate(READ_TREE);
    filed = folderTitles(current, 'AI').includes('自动分类的新书签');
  }
  check('a new bookmark files itself', filed);

  const record = await worker.evaluate(() =>
    chrome.storage.local.get('lastAutoClassify').then((bag) => bag.lastAutoClassify || null)
  );
  check(
    'the automatic run is recorded',
    Boolean(record) && record.state === 'done' && record.name === '自动分类的新书签' &&
      Array.isArray(record.category) && record.category.join('') === 'AI',
    JSON.stringify(record)
  );

  // Re-open the pane: the automatic run happened while it was already open.
  await page.click('[data-pane="models"]');
  await page.click('[data-pane="bookmarks"]');
  await page.waitForTimeout(800);
  const lastAuto = await page.textContent('#bmLastAutoClassify');
  // A fresh profile can still drop Edge's own favourites in late, and those get
  // filed too, so the newest line is not necessarily ours: what this checks is
  // that the pane renders a "bookmark -> folder" line at all.
  check('the pane shows the log line', /→\s*(AI|财经)/.test(lastAuto || ''), lastAuto);
  await page.screenshot({ path: path.join(shotDir, 'bookmarks-pane.png'), fullPage: true });

  /* ---- 自定义整理要求: date-based deletions stay in preview until confirmed ---- */
  // Keep newly planted bookmarks out of the background auto-classifier so the
  // date-based run sees both copies in the bar, including the duplicate case.
  await page.click('#bmAutoClassify');
  await page.waitForTimeout(400);
  const customDuplicateDates = await worker.evaluate(async () => {
    const bar = (await chrome.bookmarks.getTree())[0].children.find((child) => child.id === '1');
    const first = await chrome.bookmarks.create({ parentId: bar.id, title: '按日期删除的重复书签', url: 'https://custom-dup.test/page' });
    const second = await chrome.bookmarks.create({ parentId: bar.id, title: '按日期删除的重复书签', url: 'https://custom-dup.test/page' });
    const localDate = (stamp) => {
      const date = new Date(stamp);
      const pad = (value) => String(value).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    };
    return [first, second].map((bookmark) => ({ id: bookmark.id, date: localDate(bookmark.dateAdded) }));
  });
  await page.click('[data-pane="models"]');
  await page.click('[data-pane="bookmarks"]');
  await page.waitForTimeout(800);
  const customInstruction = '只保留 2000-01-01 之前的书签，之后新增的删除';
  const callsBeforeCustom = seen.length;
  await page.fill('#bmOrganizeInstruction', customInstruction);
  await page.click('#bmOrganize');
  await page.waitForFunction(() => {
    const box = document.getElementById('bmPreview');
    const list = document.getElementById('bmCustomDeleteList');
    return box && !box.hidden && list && list.querySelectorAll('.bm-item').length > 0;
  }, null, { timeout: 60000 });
  const customDeleteCount = await page.locator('#bmCustomDeleteList .bm-item').count();
  const customDuplicateRows = await page.locator('#bmCustomDeleteList .bm-item')
    .filter({ hasText: '按日期删除的重复书签' }).count();
  check('custom instruction and bookmark dates reach the model',
    seen.slice(callsBeforeCustom).some((raw) => raw.includes(customInstruction) && raw.includes('创建时间:')));
  check('creation dates use the local calendar day shown in the preview',
    seen.slice(callsBeforeCustom).some((raw) => customDuplicateDates.every((bookmark) =>
      raw.includes('创建时间:' + bookmark.date + ' |'))));
  check('newer bookmarks are listed for deletion', customDeleteCount > 0, customDeleteCount + ' item(s)');
  check('custom date rule previews both copies of a duplicate', customDuplicateRows === 2,
    customDuplicateRows + ' duplicate row(s)');
  const beforeCustomApply = await worker.evaluate(READ_TREE);
  check('custom deletions wait for confirmation', looseTitles(beforeCustomApply).length > 0 ||
    folderTitles(beforeCustomApply, 'AI').length > 0 || folderTitles(beforeCustomApply, '财经').length > 0);
  await page.screenshot({ path: path.join(shotDir, 'bookmarks-custom-instruction-preview.png'), fullPage: true });

  await page.click('#bmApply');
  await page.waitForFunction(() => {
    const node = document.getElementById('bmResult');
    return node && !node.hidden && node.textContent.includes('整理完成');
  }, { timeout: 60000 });
  const afterCustomApply = await worker.evaluate(READ_TREE);
  let remainingUrls = 0;
  const countRemaining = (node) => {
    if (node.url) remainingUrls++;
    (node.children || []).forEach(countRemaining);
  };
  countRemaining(afterCustomApply);
  check('confirmed custom deletions remove the selected bookmarks', remainingUrls === 0,
    remainingUrls + ' bookmark(s) remain');

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log('bookmark gateway calls: ' + seen.length);
  console.log(failures ? 'RESULT: ' + failures + ' check(s) failed' : 'RESULT: all checks passed');

  await context.close();
  gateway.close();
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error('bookmark e2e failed: ' + (error && error.message));
  process.exit(1);
});
