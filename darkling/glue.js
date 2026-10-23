/*
 * Merged entry layer: the right-click menu, and the Darkling shortcuts.
 *
 * The host extension owns the toolbar button (it opens the ChatGPT side panel),
 * and three modules used to create context-menu items on their own — which made
 * the order depend on load timing, and let translate/engine.js wipe everyone
 * else's items with an unfiltered contextMenus.removeAll(). All items are now
 * created here, in one list, in the order they should appear:
 *
 *   翻译网页 / 还原翻译        (handled in translate/engine.js)
 *   总结全文
 *   切换暗黑模式 / 切换明亮模式
 *   添加暗黑模式黑名单 / 移除暗黑模式黑名单
 *   ---
 *   暗色模式设置…
 *   翻译设置
 *
 * Labels follow the state of the active tab, so they are refreshed on tab
 * switches and whenever the page reports that it was translated or restored.
 */

const CODEX_MENU = {
  selection: 'translate-selection',
  page: 'translate-page',
  summary: 'translate-summary',
  settings: 'translate-settings',
  darkToggle: 'darkling-toggle',
  darkBlacklist: 'darkling-blacklist',
  darkPanel: 'darkling-panel',
  separator: 'codex-menu-separator',
};

const DARKLING_PANEL_PAGE = 'darkling/popup/popup.html';

let menuRefreshTimer = 0;
let menuInstalling = false;

function updateMenuTitle(id, title) {
  chrome.contextMenus.update(id, { title }, () => void chrome.runtime.lastError);
}

function activeTab() {
  return chrome.tabs
    .query({ active: true, lastFocusedWindow: true })
    .then((tabs) => (tabs && tabs[0]) || null)
    .catch(() => null);
}

async function refreshContextMenus() {
  // The worker may have just woken up with an empty translated-tab set.
  if (typeof ensurePageStates === 'function') await ensurePageStates();
  const tab = await activeTab();
  const enabled = typeof self.__darklingIsEnabled === 'function' && self.__darklingIsEnabled();
  const blacklisted = Boolean(
    tab &&
      tab.url &&
      typeof self.__darklingIsBlacklist === 'function' &&
      self.__darklingIsBlacklist(tab.url)
  );
  const translated = Boolean(
    tab && typeof isPageTranslated === 'function' && isPageTranslated(tab.id)
  );

  updateMenuTitle(CODEX_MENU.page, translated ? '还原翻译' : '翻译网页');
  updateMenuTitle(CODEX_MENU.darkToggle, enabled ? '切换明亮模式' : '切换暗黑模式');
  updateMenuTitle(CODEX_MENU.darkBlacklist, blacklisted ? '移除暗黑模式黑名单' : '添加暗黑模式黑名单');
}

// Tab updates fire in bursts; one refresh per idle moment is enough.
function scheduleMenuRefresh() {
  clearTimeout(menuRefreshTimer);
  menuRefreshTimer = setTimeout(() => {
    refreshContextMenus().catch(() => {});
  }, 120);
}

function installContextMenus() {
  if (menuInstalling) return;
  menuInstalling = true;
  chrome.contextMenus.removeAll(() => {
    menuInstalling = false;
    chrome.contextMenus.create({
      id: CODEX_MENU.selection,
      title: '翻译选中文字',
      contexts: ['selection'],
    }, () => void chrome.runtime.lastError);
    chrome.contextMenus.create({
      id: CODEX_MENU.page,
      title: '翻译网页',
      contexts: ['page'],
    }, () => void chrome.runtime.lastError);
    chrome.contextMenus.create({
      id: CODEX_MENU.summary,
      title: '总结全文',
      contexts: ['page'],
    }, () => void chrome.runtime.lastError);
    chrome.contextMenus.create({
      id: CODEX_MENU.darkToggle,
      title: '切换暗黑模式',
      contexts: ['page'],
    }, () => void chrome.runtime.lastError);
    chrome.contextMenus.create({
      id: CODEX_MENU.darkBlacklist,
      title: '添加暗黑模式黑名单',
      contexts: ['page'],
    }, () => void chrome.runtime.lastError);
    chrome.contextMenus.create({
      id: CODEX_MENU.separator,
      type: 'separator',
      contexts: ['page'],
    }, () => void chrome.runtime.lastError);
    chrome.contextMenus.create({
      id: CODEX_MENU.darkPanel,
      title: '暗色模式设置…',
      contexts: ['page'],
    }, () => void chrome.runtime.lastError);
    chrome.contextMenus.create({
      id: CODEX_MENU.settings,
      title: '翻译设置',
      contexts: ['page', 'selection'],
    }, () => void chrome.runtime.lastError);

    refreshContextMenus().catch(() => {});
  });
}

/* ------------------------------------------------------------- dark mode */

function darklingToggle() {
  if (typeof self.__darklingToggle !== 'function') {
    console.warn('[Darkling] engine is not loaded; toggle ignored');
    return;
  }
  self.__darklingToggle();
  scheduleMenuRefresh();
}

async function darklingToggleBlacklist(tab) {
  const url = tab && typeof tab.url === 'string' ? tab.url : '';
  if (!/^https?:/i.test(url) || typeof self.__darklingToggleBlacklist !== 'function') return;
  try {
    await self.__darklingToggleBlacklist(url);
  } catch (error) {
    console.warn('[Darkling] blacklist toggle failed', error);
  }
  // The engine answers before its storage write lands; wait one beat to re-read.
  setTimeout(() => {
    refreshContextMenus().catch(() => {});
  }, 260);
}

function darklingOpenPanel(tab) {
  const page = chrome.runtime.getURL(DARKLING_PANEL_PAGE);
  const url = tab && typeof tab.url === 'string' && /^https?:/i.test(tab.url)
    ? `${page}?url=${encodeURIComponent(tab.url)}`
    : page;
  chrome.windows.create({ url, type: 'popup', width: 290, height: 240 }).catch(() => {});
}

/* ----------------------------------------------------------------- wiring */

installContextMenus();
chrome.runtime.onInstalled.addListener(installContextMenus);
chrome.runtime.onStartup.addListener(installContextMenus);

chrome.tabs.onActivated.addListener(scheduleMenuRefresh);
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'complete' || change.url) scheduleMenuRefresh();
});
chrome.windows.onFocusChanged.addListener(scheduleMenuRefresh);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CODEX_MENU.darkToggle) {
    darklingToggle();
  } else if (info.menuItemId === CODEX_MENU.darkBlacklist) {
    darklingToggleBlacklist(tab);
  } else if (info.menuItemId === CODEX_MENU.darkPanel) {
    darklingOpenPanel(tab);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-darkling') darklingToggle();
});
