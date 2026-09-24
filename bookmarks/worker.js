/*
 * Bookmark organising, service worker side.
 *
 * Loaded by translate/background-loader.js after the three ported libraries and
 * after the translation settings, so NO_THINK_PARAMS and the user's model list
 * are both available. Everything the settings page needs is served over one
 * long-lived port, because several of these actions outlive the page: a
 * classification run is dozens of model calls.
 *
 * Nothing here touches the host extension's own state.
 */

(function () {
  'use strict';

  const NS = self.CodexBookmarks;
  const SETTINGS_KEY = 'bookmarkSettings';
  const DEDUPE_ALARM = 'codex-bookmarks-dedupe';
  const AUTO_CLASSIFY_DEBOUNCE_MS = 2000;
  const PORT_NAME = 'codex-bookmarks';

  const DEFAULT_SETTINGS = {
    // New bookmarks are only filed when this is switched on: it changes
    // bookmarks on its own, so it is never on by default.
    autoClassify: false,
    // Same for the scheduled dedupe, and it deletes rather than moves.
    autoDedupe: false,
    autoDedupeInterval: 24,
    // Empty means "whatever the translation main model is".
    bookmarkModelId: '',
    moveClassified: true,
  };

  if (!NS) {
    console.error('[bookmarks] the ported libraries did not load; bookmark features are off');
    return;
  }

  /* ------------------------------------------------------------- settings */

  async function readSettings() {
    let stored = null;
    try {
      const bag = await chrome.storage.local.get(SETTINGS_KEY);
      stored = bag ? bag[SETTINGS_KEY] : null;
    } catch (error) {
      stored = null;
    }
    return Object.assign({}, DEFAULT_SETTINGS, stored || {});
  }

  async function writeSettings(patch) {
    const next = Object.assign(await readSettings(), patch || {});
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    await scheduleDedupeAlarm(next);
    return next;
  }

  /* The model comes from the translation model list: one place to configure. */
  async function resolveModel(settings) {
    const translation = await readTranslateSettings();
    const models = Array.isArray(translation.models) ? translation.models : [];
    const wanted = String(settings.bookmarkModelId || '');
    let model = wanted ? models.find((item) => String(item.id) === wanted) : null;
    if (!model) model = models.find((item) => String(item.id) === String(translation.translateModelId));
    if (!model) model = models[0];
    if (!model || !model.baseUrl || !model.model) {
      throw new Error('还没有可用的模型，先去「模型」里配一个');
    }
    return {
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
      model: model.model,
      disableThinking: translation.disableThinking !== false,
    };
  }

  /*
   * The taxonomy is whatever folders the bookmark bar already has. Only a bar
   * with no folders at all falls back to the built-in list, so a user who has
   * organised bookmarks never has a second structure invented for them.
   */
  async function currentCategories() {
    const bar = await NS.getBookmarkBarCategories();
    return bar.length ? bar : NS.getDefaultCategories();
  }

  /* ------------------------------------------------------------ organise */

  function currentFolder(bookmark) {
    if (!bookmark || !bookmark.path) return '';
    const segments = bookmark.path.split('>').map((part) => part.trim()).filter(Boolean);
    return segments[segments.length - 1] || '';
  }

  function alreadyClassified(bookmark, category) {
    const folder = currentFolder(bookmark);
    return Boolean(folder) && category[category.length - 1] === folder;
  }

  /*
   * The preview: scan, fold duplicates out of the way, classify what is left,
   * and change nothing. Everything the apply step needs is in the answer, so a
   * worker restart in between cannot lose it.
   */
  function formatDateAdded(dateAdded) {
    const timestamp = typeof dateAdded === 'number' ? dateAdded : Date.parse(dateAdded);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
  }

  async function organizePreview(port, instruction = '') {
    const settings = await readSettings();
    const model = await resolveModel(settings);
    const barId = await NS.getBookmarkBarId();
    const bar = await NS.getBookmarkBarBookmarks();
    if (!bar.length) throw new Error('收藏栏里还没有书签');

    const customInstruction = instruction == null ? '' : String(instruction);
    const hasCustomInstruction = customInstruction.trim().length > 0;
    const groups = NS.findDuplicates(bar, { ignoreQuery: false });
    const removeIds = new Set();
    for (const group of groups) {
      for (const bookmark of group.bookmarks) {
        if (bookmark.id !== group.recommendedId) removeIds.add(bookmark.id);
      }
    }
    // In the default flow, duplicates are excluded because they are already
    // scheduled for removal.
    // With custom instructions, include duplicates so a rule such as a date
    // cutoff can choose which copy survives. Unaffected groups still use the
    // normal dedupe plan after classification.
    const candidates = hasCustomInstruction ? bar : bar.filter((bookmark) => !removeIds.has(bookmark.id));
    const categories = await currentCategories();

    const results = await NS.classifyBookmarks(
      candidates,
      { categories, model, disableThinking: model.disableThinking, instruction: customInstruction },
      (done, total) => {
        post(port, { progress: { done, total } });
      }
    );

    const byId = new Map(candidates.map((bookmark) => [bookmark.id, bookmark]));
    const resultById = new Map();
    const deletionIds = new Set();
    const answeredIds = new Set();
    for (const result of results) {
      const bookmark = byId.get(String(result.id));
      if (!bookmark) continue;
      answeredIds.add(bookmark.id);
      if (hasCustomInstruction && result.action === 'delete') {
        deletionIds.add(bookmark.id);
        continue;
      }
      if (Array.isArray(result.category) && result.category.length) {
        resultById.set(bookmark.id, result.category);
      }
    }

    // If the custom rule selected anything in a duplicate group, its decision
    // takes precedence over the default "keep the richest title" heuristic.
    const plannedDuplicateGroups = hasCustomInstruction
      ? groups.filter((group) => !group.bookmarks.some((bookmark) => deletionIds.has(bookmark.id)))
      : groups;
    const plannedDuplicateRemoveIds = new Set();
    for (const group of plannedDuplicateGroups) {
      for (const bookmark of group.bookmarks) {
        if (bookmark.id !== group.recommendedId) plannedDuplicateRemoveIds.add(bookmark.id);
      }
    }
    const plannedKeepIds = plannedDuplicateGroups.map((group) => group.recommendedId);

    const items = [];
    const deletions = [];
    let skipped = 0;
    if (!hasCustomInstruction) {
      // Keep the original response order and handling when no instruction is set.
      for (const result of results) {
        const bookmark = byId.get(result.id);
        if (!bookmark || !Array.isArray(result.category) || !result.category.length) continue;
        if (!settings.moveClassified && alreadyClassified(bookmark, result.category)) {
          skipped++;
          continue;
        }
        items.push({ id: bookmark.id, name: bookmark.name, url: bookmark.url, category: result.category });
      }
    } else {
      for (const bookmark of candidates) {
        if (deletionIds.has(bookmark.id)) {
          deletions.push({
            id: bookmark.id,
            name: bookmark.name,
            url: bookmark.url,
            dateAdded: formatDateAdded(bookmark.dateAdded),
          });
          continue;
        }
        if (plannedDuplicateRemoveIds.has(bookmark.id)) continue;

        const category = resultById.get(bookmark.id) || ['工具'];
        if (!settings.moveClassified && alreadyClassified(bookmark, category)) {
          skipped++;
          continue;
        }
        items.push({ id: bookmark.id, name: bookmark.name, url: bookmark.url, category });
      }
    }

    return {
      barId,
      total: candidates.length,
      items,
      deletions,
      skipped,
      // Bookmark the model never answered for: left exactly where they are.
      unclassified: Math.max(0, candidates.length - (hasCustomInstruction ? answeredIds.size : results.length)),
      duplicates: { groups: plannedDuplicateGroups, keepIds: plannedKeepIds, removeCount: plannedDuplicateRemoveIds.size },
    };
  }

  async function organizeApply(message) {
    const barId = message.barId || (await NS.getBookmarkBarId());
    const out = { removed: 0, customDeleted: 0, moved: 0, failed: 0, merged: 0, cleaned: 0, errors: [] };

    const duplicates = message.duplicates;
    if (duplicates && Array.isArray(duplicates.groups) && duplicates.groups.length) {
      const result = await NS.removeDuplicates(duplicates.groups, new Set(duplicates.keepIds || []));
      out.removed = result.removed;
      out.errors.push(...result.errors);
    }

    const requestedDeletionIds = Array.isArray(message.deletionIds)
      ? [...new Set(message.deletionIds.filter((id) => typeof id === 'string'))]
      : [];
    if (requestedDeletionIds.length) {
      // Restrict confirmation to bookmarks that are still in the bar. A saved
      // preview must not delete an item the user has moved elsewhere since.
      const liveBarIds = new Set((await NS.getBookmarkBarBookmarks()).map((bookmark) => String(bookmark.id)));
      const eligibleIds = requestedDeletionIds.filter((id) => liveBarIds.has(id));
      const outcomes = await Promise.all(eligibleIds.map(async (id) => {
        try {
          await chrome.bookmarks.remove(id);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: `自定义删除 ${id} 失败：${String((error && error.message) || error)}` };
        }
      }));
      for (const outcome of outcomes) {
        if (outcome.ok) out.customDeleted++;
        else out.errors.push(outcome.error);
      }
    }

    const moves = (message.items || [])
      .filter((item) => item && Array.isArray(item.category) && item.category.length)
      .map((item) => ({ bookmarkId: item.id, category: item.category }));
    if (moves.length) {
      const moved = await NS.batchMoveBookmarks(moves, barId);
      out.moved = moved.success;
      out.failed = moved.failed;
      out.errors.push(...moved.errors);
    }

    out.merged = await NS.mergeDuplicateFolders(barId);
    out.cleaned = await NS.cleanEmptyFolders(barId);
    await chrome.storage.local.set({ lastOrganize: { time: Date.now(), ...out, errors: out.errors.slice(0, 20) } });
    return out;
  }

  /* ----------------------------------------------------------- duplicates */

  async function dedupeScan() {
    const bar = await NS.getBookmarkBarBookmarks();
    const groups = NS.findDuplicates(bar, { ignoreQuery: false });
    return {
      total: bar.length,
      groups,
      keepIds: groups.map((group) => group.recommendedId),
      stats: NS.getDuplicateStats(groups),
    };
  }

  async function dedupeApply(message) {
    const groups = Array.isArray(message.groups) ? message.groups : [];
    if (!groups.length) return { removed: 0, errors: [] };
    const result = await NS.removeDuplicates(groups, new Set(message.keepIds || []));
    await chrome.storage.local.set({
      lastManualDedupe: { time: Date.now(), removed: result.removed, groups: groups.length },
    });
    return result;
  }

  /* --------------------------------------------------------- the port API */

  function post(port, message) {
    try {
      port.postMessage(message);
    } catch (error) {
      /* the page was closed mid-run */
    }
  }

  async function getState() {
    const settings = await readSettings();
    const [bar, categories, translation, stored] = await Promise.all([
      NS.getBookmarkBarBookmarks(),
      currentCategories(),
      readTranslateSettings(),
      chrome.storage.local.get(['lastAutoClassify', 'lastAutoDedupe', 'lastOrganize', 'lastManualDedupe']),
    ]);
    return {
      settings,
      total: bar.length,
      categories: categories.map((category) => category.name),
      models: (translation.models || []).map((model) => ({
        id: model.id,
        name: model.name,
        kind: model.kind,
      })),
      mainModelId: translation.translateModelId || '',
      last: {
        organize: stored.lastOrganize || null,
        autoClassify: stored.lastAutoClassify || null,
        autoDedupe: stored.lastAutoDedupe || null,
      },
    };
  }

  async function handle(message, port) {
    switch (message.type) {
      case 'state':
        return getState();
      case 'settings':
        return writeSettings(message.patch || {});
      case 'organize-preview':
        return organizePreview(port, message.instruction);
      case 'organize-apply':
        return organizeApply(message);
      case 'dedupe-scan':
        return dedupeScan();
      case 'dedupe-apply':
        return dedupeApply(message);
      default:
        throw new Error('未知操作');
    }
  }

  chrome.runtime.onConnect.addListener((port) => {
    if (!port || port.name !== PORT_NAME) return;
    port.onMessage.addListener((message) => {
      if (!message || typeof message !== 'object') return;
      const id = message.id;
      Promise.resolve()
        .then(() => handle(message, port))
        .then((data) => port.postMessage({ id, ok: true, data }))
        .catch((error) => {
          port.postMessage({ id, ok: false, error: String((error && error.message) || error) });
        });
    });
  });

  /* -------------------------------------------------------- automatic jobs */

  const pendingClassify = new Map();

  async function autoClassify(id, bookmark) {
    const note = async (state, extra) => {
      try {
        await chrome.storage.local.set({
          lastAutoClassify: {
            time: Date.now(),
            name: bookmark.title || '',
            url: bookmark.url || '',
            state,
            ...(extra || {}),
          },
        });
      } catch (error) {
        /* a log line failing is not worth reporting */
      }
    };

    try {
      const settings = await readSettings();
      if (!settings.autoClassify) {
        await note('off');
        return;
      }
      const model = await resolveModel(settings);
      const categories = await currentCategories();
      const category = await NS.classifySingleBookmark(
        { id, name: bookmark.title, url: bookmark.url },
        { categories, model, disableThinking: model.disableThinking }
      );
      if (!category || !category.length) {
        await note('no-category');
        return;
      }

      // The user may have moved or deleted it while the model was thinking.
      const current = await chrome.bookmarks.get(id).catch(() => null);
      if (!current || !current[0]) {
        await note('gone', { category });
        return;
      }
      const barId = await NS.getBookmarkBarId();
      const target = await NS.ensureFolderPath(barId, category);
      if (current[0].parentId === target) {
        await note('already-there', { category });
        return;
      }
      await chrome.bookmarks.move(id, { parentId: target });
      await note('done', { category });
    } catch (error) {
      await note('error', { error: String((error && error.message) || error) });
    }
  }

  chrome.bookmarks.onCreated.addListener((id, bookmark) => {
    if (!bookmark || !bookmark.url) return;
    if (/^(chrome|edge|about|devtools|file|chrome-extension|edge-extension|moz-extension):/i.test(bookmark.url)) return;
    const previous = pendingClassify.get(id);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      pendingClassify.delete(id);
      autoClassify(id, bookmark).catch(() => {});
    }, AUTO_CLASSIFY_DEBOUNCE_MS);
    pendingClassify.set(id, timer);
  });

  chrome.bookmarks.onRemoved.addListener((id) => {
    const timer = pendingClassify.get(id);
    if (!timer) return;
    clearTimeout(timer);
    pendingClassify.delete(id);
  });

  /* ------------------------------------------------------ scheduled dedupe */

  async function scheduleDedupeAlarm(settings) {
    await chrome.alarms.clear(DEDUPE_ALARM);
    const resolved = settings || (await readSettings());
    if (!resolved.autoDedupe) return;
    const hours = Math.max(1, Math.min(168, parseInt(resolved.autoDedupeInterval, 10) || 24));
    chrome.alarms.create(DEDUPE_ALARM, {
      delayInMinutes: hours * 60,
      periodInMinutes: hours * 60,
    });
  }

  async function runScheduledDedupe() {
    const all = await NS.getAllBookmarks();
    const groups = NS.findDuplicates(all, { ignoreQuery: false });
    const keepIds = new Set(groups.map((group) => group.recommendedId));
    const result = groups.length ? await NS.removeDuplicates(groups, keepIds) : { removed: 0, errors: [] };
    await chrome.storage.local.set({
      lastAutoDedupe: {
        time: Date.now(),
        groups: groups.length,
        removed: result.removed,
        errors: result.errors.slice(0, 10),
      },
    });
  }

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || alarm.name !== DEDUPE_ALARM) return;
    runScheduledDedupe().catch((error) => {
      console.error('[bookmarks] the scheduled dedupe run failed', error);
    });
  });

  scheduleDedupeAlarm().catch(() => {});
  chrome.runtime.onStartup.addListener(() => scheduleDedupeAlarm().catch(() => {}));
  chrome.runtime.onInstalled.addListener(() => scheduleDedupeAlarm().catch(() => {}));
})();
