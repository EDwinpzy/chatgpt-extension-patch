/*
 * 书签整理 panel, running inside the settings page.
 *
 * Everything that touches bookmarks or the model happens in the service worker
 * over one long-lived port, so closing this page cannot interrupt a run. This
 * file only renders and asks.
 *
 * Wrapped in a function scope on purpose: the settings page already has its own
 * globals (state, save, $) and this panel must not collide with them.
 */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const port = chrome.runtime.connect({ name: 'codex-bookmarks' });

  let nextId = 1;
  const pending = new Map();
  let bookmarkState = null;
  let preview = null;
  let duplicates = null;

  port.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return;
    if (message.progress) {
      paintProgress(message.progress);
      return;
    }
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    if (message.ok) job.resolve(message.data);
    else job.reject(new Error(message.error || '操作失败'));
  });

  function ask(type, extra) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      port.postMessage(Object.assign({ id, type }, extra || {}));
    });
  }

  /* ------------------------------------------------------------- helpers */

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.textContent;
      button.dataset.wasDisabled = button.disabled ? '1' : '';
      button.textContent = busyLabel || '处理中…';
      button.disabled = true;
      return;
    }
    if (button.dataset.label) button.textContent = button.dataset.label;
    // A button that was disabled before it went busy goes back to disabled.
    button.disabled = button.dataset.wasDisabled === '1';
    delete button.dataset.wasDisabled;
  }

  function paintProgress(progress) {
    if (!progress) return;
    showProgress(progress.total
      ? '正在分类 ' + progress.done + ' / ' + progress.total + ' 批'
      : '正在处理…', progress.total ? Math.round((progress.done / progress.total) * 100) : null);
  }

  /* The bar is a real percentage while the batches run, and an indeterminate
   * stripe while a step has no batch count to show. */
  function showProgress(text, percent) {
    const box = $('bmProgressBox');
    const note = $('bmProgress');
    const bar = $('bmProgressBar');
    if (box) {
      box.hidden = false;
      box.classList.toggle('bm-indeterminate', percent === null);
    }
    if (note) note.textContent = text || '';
    if (bar) bar.style.width = percent === null ? '' : percent + '%';
  }

  function clearProgress() {
    const box = $('bmProgressBox');
    if (box) {
      box.hidden = true;
      box.classList.remove('bm-indeterminate');
    }
    const note = $('bmProgress');
    if (note) note.textContent = '';
    const bar = $('bmProgressBar');
    if (bar) bar.style.width = '0%';
  }

  function say(id, text, bad) {
    const node = $(id);
    if (!node) return;
    node.hidden = !text;
    node.textContent = text || '';
    node.classList.toggle('bad', Boolean(bad));
  }

  /* 9/16 16:49 — short enough to sit inside a one-line log entry. */
  function stampLabel(stamp) {
    if (!stamp) return '';
    try {
      const date = new Date(stamp);
      const day = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
      return day + ' ' + time;
    } catch (error) {
      return '';
    }
  }

  /* Today / yesterday / n days ago, for the summary tile. */
  function relativeDay(stamp) {
    if (!stamp) return '—';
    const days = Math.floor((Date.now() - stamp) / 86400000);
    if (days <= 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 30) return days + ' 天前';
    try {
      return new Date(stamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    } catch (error) {
      return '—';
    }
  }

  function setSwitch(id, value) {
    const button = $(id);
    if (!button) return;
    button.classList.toggle('on', Boolean(value));
    button.setAttribute('aria-checked', String(Boolean(value)));
  }

  /* The cleanup row is always there; its buttons wake up once a scan has
   * actually found something to delete. */
  function setDedupeReady(ready) {
    for (const id of ['bmDedupeRemove', 'bmDedupeCancel']) {
      const button = $(id);
      if (button) button.disabled = !ready;
    }
  }

  /* The pageUrl form of the extension's own favicon endpoint: the same icon the
   * bookmark bar shows, and it hides itself when a site has none. */
  function favicon(url) {
    const image = document.createElement('img');
    image.className = 'bm-fav';
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      image.hidden = true;
    });
    try {
      image.src = chrome.runtime.getURL('/_favicon/?pageUrl=' + encodeURIComponent(url) + '&size=16');
    } catch (error) {
      image.hidden = true;
    }
    return image;
  }

  function bookmarkRow(bookmark, options) {
    const row = document.createElement('div');
    row.className = 'bm-item' + (options && options.className ? ' ' + options.className : '');
    if (bookmark.url) row.appendChild(favicon(bookmark.url));
    const name = document.createElement('span');
    name.className = 'bm-name';
    name.textContent = bookmark.name || bookmark.url || bookmark.id;
    name.title = bookmark.url || '';
    row.appendChild(name);
    if (options && options.pill) {
      const pill = document.createElement('span');
      pill.className = 'bm-pill';
      pill.textContent = options.pill;
      row.appendChild(pill);
    }
    return row;
  }

  const AUTO_CLASSIFY_STATE = {
    off: '自动分类没开',
    'no-category': '没拿到分类',
    gone: '书签已经不在',
    'already-there': '已经在那个文件夹里',
  };

  /* --------------------------------------------------------------- state */

  function paintState() {
    if (!bookmarkState) return;
    const settings = bookmarkState.settings || {};

    const count = $('bmBarCount');
    if (count) count.textContent = String(bookmarkState.total);
    const categoryCount = $('bmCategoryCount');
    if (categoryCount) categoryCount.textContent = String(bookmarkState.categories.length);
    const last = bookmarkState.last || {};
    const lastRun = $('bmLastRun');
    if (lastRun) lastRun.textContent = relativeDay(last.organize && last.organize.time);

    const categories = $('bmCategories');
    if (categories) {
      const names = bookmarkState.categories;
      categories.textContent = names.length
        ? '分类文件夹：' + (names.length > 8 ? names.slice(0, 8).join(' · ') + ' 等 ' + names.length + ' 个' : names.join(' · '))
        : '分类文件夹：还没有，先用内置分类';
      categories.title = names.join(' · ');
    }

    const select = $('bmModel');
    if (select) {
      select.textContent = '';
      const follow = document.createElement('option');
      follow.value = '';
      follow.textContent = '同翻译主模型';
      select.appendChild(follow);
      (bookmarkState.models || []).forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name + (model.kind === 'local' ? '（本地）' : '');
        select.appendChild(option);
      });
      select.value = String(settings.bookmarkModelId || '');
    }

    const move = $('bmMoveClassified');
    if (move) move.checked = settings.moveClassified !== false;
    setSwitch('bmAutoClassify', settings.autoClassify);
    setSwitch('bmAutoDedupe', settings.autoDedupe);
    const interval = $('bmInterval');
    if (interval) interval.value = String(settings.autoDedupeInterval || 24);
    const intervalRow = $('bmIntervalRow');
    if (intervalRow) intervalRow.hidden = !settings.autoDedupe;

    const organize = last.organize;
    say(
      'bmLastOrganize',
      organize
        ? '上次整理 ' + stampLabel(organize.time) + ' · ' + [
            '移动 ' + (organize.moved || 0),
            organize.removed ? '删重复 ' + organize.removed : '',
            organize.merged ? '合并 ' + organize.merged : '',
            organize.cleaned ? '清空文件夹 ' + organize.cleaned : '',
          ].filter(Boolean).join(' · ')
        : ''
    );

    const autoClassify = last.autoClassify;
    if (autoClassify) {
      const where = autoClassify.state === 'done' && Array.isArray(autoClassify.category)
        ? autoClassify.category.join(' / ')
        : autoClassify.state === 'error'
          ? '出错：' + (autoClassify.error || '')
          : AUTO_CLASSIFY_STATE[autoClassify.state] || autoClassify.state;
      say('bmLastAutoClassify', '自动分类 ' + stampLabel(autoClassify.time) + ' · ' + autoClassify.name + ' → ' + where);
    } else {
      say('bmLastAutoClassify', '');
    }

    const autoDedupe = last.autoDedupe;
    say(
      'bmLastAutoDedupe',
      autoDedupe
        ? '自动去重 ' + stampLabel(autoDedupe.time) + ' · 删 ' + (autoDedupe.removed || 0) + ' 个'
        : ''
    );
  }

  async function refresh() {
    try {
      bookmarkState = await ask('state');
      paintState();
    } catch (error) {
      say('bmResult', String(error.message || error), true);
    }
  }

  /* -------------------------------------------------------------- render */

  function renderPreview() {
    const box = $('bmPreview');
    const tree = $('bmTree');
    if (!box || !tree) return;
    tree.textContent = '';

    if (!preview || !preview.items.length) {
      box.hidden = true;
      const total = preview ? preview.total : 0;
      say('bmResult', total ? '这 ' + total + ' 个书签已经在对应文件夹里了' : '收藏栏里没有可整理的书签');
      preview = null;
      return;
    }

    // Group by full category path, then rebuild the folder nesting.
    const groups = new Map();
    for (const item of preview.items) {
      const key = item.category.join(' > ');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    const bodies = new Map();
    for (const key of Array.from(groups.keys()).sort()) {
      const parts = key.split(' > ');
      let parent = tree;
      for (let index = 0; index < parts.length; index++) {
        const path = parts.slice(0, index + 1).join(' > ');
        let body = bodies.get(path);
        if (!body) {
          const folder = document.createElement('div');
          folder.className = 'bm-folder';
          const head = document.createElement('div');
          head.className = 'bm-folder-head';
          const icon = document.createElement('span');
          icon.className = 'ico';
          icon.setAttribute('data-icon', 'folder');
          head.appendChild(icon);
          head.appendChild(document.createTextNode(parts[index]));
          if (index === parts.length - 1) {
            const count = document.createElement('span');
            count.className = 'bm-count';
            count.textContent = groups.get(key).length + ' 个';
            head.appendChild(count);
          }
          folder.appendChild(head);
          body = document.createElement('div');
          body.className = 'bm-folder-body';
          folder.appendChild(body);
          bodies.set(path, body);
          parent.appendChild(folder);
        }
        parent = body;
      }
      for (const item of groups.get(key)) {
        parent.appendChild(bookmarkRow(item));
      }
    }

    const bits = [preview.items.length + ' 个书签 → ' + groups.size + ' 个文件夹'];
    if (preview.duplicates && preview.duplicates.removeCount) bits.push('删重复 ' + preview.duplicates.removeCount);
    if (preview.skipped) bits.push('跳过 ' + preview.skipped);
    if (preview.unclassified) bits.push('没分类 ' + preview.unclassified);
    const stats = $('bmPreviewStats');
    if (stats) stats.textContent = bits.join(' · ');
    box.hidden = false;
    say('bmResult', '');
  }

  function renderDuplicates() {
    const list = $('bmDedupeList');
    if (!list) return;
    list.textContent = '';

    if (!duplicates || !duplicates.groups.length) {
      say('bmDedupeStats', '扫了 ' + (duplicates ? duplicates.total : 0) + ' 个，没有重复');
      const clear = $('bmDedupeRemove');
      if (clear) clear.textContent = '删除重复';
      return;
    }

    say(
      'bmDedupeStats',
      '扫了 ' + duplicates.total + ' 个 · ' + duplicates.stats.totalGroups + ' 组重复 · ' +
        '可删 ' + duplicates.stats.totalRemovable + ' 个（每组留名字最全的）'
    );

    const remove = $('bmDedupeRemove');
    if (remove) remove.textContent = '删除 ' + duplicates.stats.totalRemovable + ' 项';

    duplicates.groups.forEach((group, index) => {
      const block = document.createElement('div');
      block.className = 'bm-dup';
      const head = document.createElement('div');
      head.className = 'bm-dup-head';
      const reason = document.createElement('span');
      reason.className = 'bm-reason';
      reason.textContent = group.reason === 'url' ? '链接相同' : '标题与路径相同';
      head.appendChild(reason);
      head.appendChild(document.createTextNode('第 ' + (index + 1) + ' 组 · ' + group.count + ' 个'));
      block.appendChild(head);
      for (const item of group.bookmarks) {
        const keep = item.id === group.recommendedId;
        block.appendChild(bookmarkRow(item, { className: keep ? 'keep' : 'drop', pill: keep ? '保留' : '删除' }));
      }
      list.appendChild(block);
    });
  }

  /* ------------------------------------------------------------ actions */

  async function startOrganize() {
    const button = $('bmOrganize');
    say('bmResult', '');
    setBusy(button, true, '正在扫描并分类…');
    showProgress('正在扫描书签…', null);
    try {
      preview = await ask('organize-preview');
      renderPreview();
    } catch (error) {
      preview = null;
      const box = $('bmPreview');
      if (box) box.hidden = true;
      say('bmResult', '整理失败：' + String(error.message || error), true);
    } finally {
      clearProgress();
      setBusy(button, false);
    }
  }

  async function applyOrganize() {
    if (!preview) return;
    const button = $('bmApply');
    setBusy(button, true, '正在应用…');
    showProgress('正在移动书签…', null);
    try {
      const result = await ask('organize-apply', {
        items: preview.items,
        barId: preview.barId,
        duplicates: preview.duplicates,
      });
      const parts = ['移动 ' + result.moved];
      if (result.removed) parts.push('删重复 ' + result.removed);
      if (result.merged) parts.push('合并 ' + result.merged);
      if (result.cleaned) parts.push('清空文件夹 ' + result.cleaned);
      if (result.failed) parts.push('失败 ' + result.failed);
      if (result.errors && result.errors.length) parts.push('报错 ' + result.errors.length);
      say('bmResult', '整理完成 · ' + parts.join(' · '));
      const box = $('bmPreview');
      if (box) box.hidden = true;
      preview = null;
      await refresh();
    } catch (error) {
      say('bmResult', '整理失败：' + String(error.message || error), true);
    } finally {
      clearProgress();
      setBusy(button, false);
    }
  }

  async function scanDuplicates() {
    const button = $('bmDedupeScan');
    setBusy(button, true, '正在扫描…');
    say('bmDedupeStats', '');
    try {
      duplicates = await ask('dedupe-scan');
      renderDuplicates();
      setDedupeReady(Boolean(duplicates.groups.length));
    } catch (error) {
      duplicates = null;
      say('bmDedupeStats', '扫描失败：' + String(error.message || error), true);
    } finally {
      setBusy(button, false);
    }
  }

  async function removeDuplicates() {
    if (!duplicates || !duplicates.groups.length) return;
    const button = $('bmDedupeRemove');
    setBusy(button, true, '正在删除…');
    let done = false;
    try {
      const result = await ask('dedupe-apply', { groups: duplicates.groups, keepIds: duplicates.keepIds });
      const extra = result.errors && result.errors.length ? ' · ' + result.errors.length + ' 个失败' : '';
      say('bmDedupeStats', '删了 ' + result.removed + ' 个' + extra);
      const list = $('bmDedupeList');
      if (list) list.textContent = '';
      duplicates = null;
      done = true;
      await refresh();
    } catch (error) {
      say('bmDedupeStats', '删除失败：' + String(error.message || error), true);
    } finally {
      setBusy(button, false);
      // Only a successful pass ends the job; a failure keeps the buttons live
      // so the same scan can be retried.
      if (done) setDedupeReady(false);
    }
  }

  async function saveSettings(patch) {
    try {
      const settings = await ask('settings', { patch });
      if (bookmarkState) bookmarkState.settings = settings;
      paintState();
    } catch (error) {
      say('bmResult', String(error.message || error), true);
    }
  }

  /* --------------------------------------------------------------- wiring */

  function click(id, handler) {
    const node = $(id);
    if (node) node.addEventListener('click', handler);
  }

  function change(id, handler) {
    const node = $(id);
    if (node) node.addEventListener('change', handler);
  }

  click('bmOrganize', startOrganize);
  click('bmApply', applyOrganize);
  click('bmCancelOrganize', () => {
    preview = null;
    const box = $('bmPreview');
    if (box) box.hidden = true;
    say('bmResult', '');
  });

  click('bmDedupeScan', scanDuplicates);
  click('bmDedupeRemove', removeDuplicates);
  click('bmDedupeCancel', () => {
    duplicates = null;
    const list = $('bmDedupeList');
    if (list) list.textContent = '';
    say('bmDedupeStats', '');
    setDedupeReady(false);
  });

  change('bmMoveClassified', () => saveSettings({ moveClassified: $('bmMoveClassified').checked }));
  change('bmModel', () => saveSettings({ bookmarkModelId: $('bmModel').value }));
  change('bmInterval', () => saveSettings({ autoDedupeInterval: Number($('bmInterval').value) || 24 }));

  for (const pair of [['bmAutoClassify', 'autoClassify'], ['bmAutoDedupe', 'autoDedupe']]) {
    const id = pair[0];
    const key = pair[1];
    click(id, () => {
      const button = $(id);
      const next = !button.classList.contains('on');
      setSwitch(id, next);
      saveSettings({ [key]: next });
    });
  }

  // Automatic runs happen in the background, so re-read the state every time
  // the pane is opened instead of showing whatever was true at page load.
  const navItem = document.querySelector('[data-pane="bookmarks"]');
  if (navItem) navItem.addEventListener('click', () => { refresh(); });

  refresh();
})();
