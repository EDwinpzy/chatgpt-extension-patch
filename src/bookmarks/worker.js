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
  const AUTO_BOOKMARK_DEBOUNCE_MS = 2000;
  const PORT_NAME = 'codex-bookmarks';

  const DEFAULT_SETTINGS = {
    // New bookmarks are only filed when this is switched on: it changes
    // bookmarks on its own, so it is never on by default.
    autoClassify: false,
    // New bookmark titles are only rewritten when this is switched on.
    autoRename: false,
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

  async function organizePreview(port, instruction = '', simplifyNames = false) {
    const settings = await readSettings();
    const model = await resolveModel(settings);
    const barId = await NS.getBookmarkBarId();
    const bar = await NS.getBookmarkBarBookmarks();
    if (!bar.length && !simplifyNames) throw new Error('收藏栏里还没有书签');

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

    let renames = [];
    let renameTotal = 0;
    let renameUnanswered = 0;
    if (simplifyNames) {
      const excludedIds = new Set([...deletionIds, ...plannedDuplicateRemoveIds].map(String));
      const renameCandidates = (await NS.getAllBookmarks())
        .filter((bookmark) => !excludedIds.has(String(bookmark.id)));
      renameTotal = renameCandidates.length;
      const renameResult = await NS.renameBookmarks(
        renameCandidates,
        { model, disableThinking: model.disableThinking },
        (done, total) => post(port, { progress: { kind: 'rename', done, total } })
      );
      const bookmarksById = new Map(renameCandidates.map((bookmark) => [String(bookmark.id), bookmark]));
      renames = renameResult.suggestions.flatMap((suggestion) => {
        const bookmark = bookmarksById.get(String(suggestion.id));
        if (!bookmark || suggestion.name === String(bookmark.name || '')) return [];
        return [{
          id: String(bookmark.id),
          oldName: String(bookmark.name || ''),
          name: suggestion.name,
          url: bookmark.url,
        }];
      });
      renameUnanswered = Math.max(0, renameCandidates.length - renameResult.suggestions.length);
    }

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
      renameAll: Boolean(simplifyNames),
      renameTotal,
      renames,
      renameUnanswered,
      skipped,
      // Bookmark the model never answered for: left exactly where they are.
      unclassified: Math.max(0, candidates.length - (hasCustomInstruction ? answeredIds.size : results.length)),
      duplicates: { groups: plannedDuplicateGroups, keepIds: plannedKeepIds, removeCount: plannedDuplicateRemoveIds.size },
    };
  }

  async function organizeApply(message, port) {
    const barId = message.barId || (await NS.getBookmarkBarId());
    const out = {
      removed: 0,
      customDeleted: 0,
      moved: 0,
      failed: 0,
      renamed: 0,
      renameUnchanged: 0,
      renameSkipped: 0,
      renameFailed: 0,
      merged: 0,
      cleaned: 0,
      errors: [],
    };

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

    const requestedRenames = Array.isArray(message.renames)
      ? message.renames.filter((item) => item && typeof item.id === 'string' &&
        typeof item.oldName === 'string' && typeof item.name === 'string' && typeof item.url === 'string')
      : [];
    const RENAME_CHUNK_SIZE = 25;
    for (let index = 0; index < requestedRenames.length; index += RENAME_CHUNK_SIZE) {
      const batch = requestedRenames.slice(index, index + RENAME_CHUNK_SIZE);
      const outcomes = await Promise.all(batch.map(async (item) => {
        let current;
        try {
          const found = await chrome.bookmarks.get(item.id);
          current = found && found[0];
        } catch (error) {
          return 'skipped';
        }
        if (!current || current.url !== item.url) return 'skipped';
        if (current.title === item.name) return 'unchanged';
        if (current.title !== item.oldName) return 'skipped';
        try {
          await chrome.bookmarks.update(item.id, { title: item.name });
          return 'renamed';
        } catch (error) {
          return 'failed';
        }
      }));
      for (const outcome of outcomes) {
        if (outcome === 'renamed') out.renamed++;
        else if (outcome === 'unchanged') out.renameUnchanged++;
        else if (outcome === 'skipped') out.renameSkipped++;
        else out.renameFailed++;
      }
      post(port, {
        progress: {
          kind: 'rename-write',
          done: Math.min(index + batch.length, requestedRenames.length),
          total: requestedRenames.length,
        },
      });
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
      chrome.storage.local.get(['lastAutoClassify', 'lastAutoRename', 'lastAutoDedupe', 'lastOrganize', 'lastManualDedupe']),
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
        autoRename: stored.lastAutoRename || null,
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
        return organizePreview(port, message.instruction, message.simplifyNames);
      case 'organize-apply':
        return organizeApply(message, port);
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

  const pendingBookmarkCreate = new Map();

  async function autoRenameBookmark(id, bookmark) {
    const note = async (state, extra) => {
      try {
        await chrome.storage.local.set({
          lastAutoRename: {
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
      if (!settings.autoRename) return;

      const found = await chrome.bookmarks.get(id).catch(() => null);
      const before = found && found[0];
      if (!before) {
        await note('gone');
        return;
      }

      const model = await resolveModel(settings);
      const result = await NS.renameBookmarks(
        [{ id, name: before.title || '', url: before.url || '' }],
        { model, disableThinking: model.disableThinking }
      );
      const suggestion = (result.suggestions || []).find((item) => String(item.id) === String(id));
      if (!suggestion) {
        if (result.errors && result.errors.length) throw new Error(result.errors[0]);
        await note('no-name');
        return;
      }

      const latestSettings = await readSettings();
      if (!latestSettings.autoRename) {
        await note('off');
        return;
      }
      const latest = await chrome.bookmarks.get(id).catch(() => null);
      const current = latest && latest[0];
      if (!current) {
        await note('gone');
        return;
      }
      if (current.title !== before.title || current.url !== before.url) {
        await note('changed');
        return;
      }
      if (suggestion.name === current.title) {
        await note('unchanged', { newName: suggestion.name });
        return;
      }

      await chrome.bookmarks.update(id, { title: suggestion.name });
      await note('done', { newName: suggestion.name });
    } catch (error) {
      await note('error', { error: String((error && error.message) || error) });
    }
  }

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
    const previous = pendingBookmarkCreate.get(id);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      pendingBookmarkCreate.delete(id);
      autoRenameBookmark(id, bookmark)
        .then(async () => {
          const latest = await chrome.bookmarks.get(id).catch(() => null);
          await autoClassify(id, latest && latest[0] ? latest[0] : bookmark);
        })
        .catch(() => {});
    }, AUTO_BOOKMARK_DEBOUNCE_MS);
    pendingBookmarkCreate.set(id, timer);
  });

  chrome.bookmarks.onRemoved.addListener((id) => {
    const timer = pendingBookmarkCreate.get(id);
    if (!timer) return;
    clearTimeout(timer);
    pendingBookmarkCreate.delete(id);
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
