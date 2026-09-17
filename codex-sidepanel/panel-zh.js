/*
 * Chinese localisation for the Codex side panel, plus one added menu entry.
 *
 * The extension ships English strings only: there is no Chinese catalogue
 * anywhere in the package, so translating means rewriting text in the DOM.
 *
 * Two rules keep that safe:
 *   1. Only controls are touched - buttons, menu items, tabs, labels, options.
 *      Anything that could be conversation content is left alone, so a reply
 *      that happens to contain the word "Settings" is never rewritten.
 *   2. Attribute strings (aria-label / title / placeholder) are translated too,
 *      because menus are often labelled that way only.
 *
 * A MutationObserver re-applies the map, so React re-renders cannot revert it.
 */

(() => {
  'use strict';

  if (window.__codexPanelZhLoaded) return;
  window.__codexPanelZhLoaded = true;

  const MENU_MARK = 'data-codex-translate-menu';

  /* Only controls are eligible. Conversation bubbles never match. */
  const CONTROL_SELECTOR = [
    'button',
    '[role="button"]',
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="menuitemcheckbox"]',
    '[role="option"]',
    '[role="tab"]',
    'a[href]',
    'option',
    'label',
    'legend',
    'summary',
  ].join(',');

  const TEXT = {
    // Header and navigation
    'New chat': '新对话',
    'New chat in this worktree': '在此工作树中新建对话',
    'Chat history': '聊天记录',
    'Recent chats.': '最近聊天',
    'Search recent chats': '搜索聊天记录',
    'All chats': '全部聊天',
    'Local chats': '本地聊天',
    'Cloud chats': '云端聊天',
    'No chats yet': '还没有聊天',
    'No chats in progress': '没有进行中的聊天',
    'Filter chats by environment': '按环境筛选聊天',
    'Clear search': '清除搜索',
    'Loading…': '载入中…',

    // The "..." menu
    'Chat actions': '聊天操作',
    'Copy': '复制',
    'Copy deeplink': '复制深链',
    'Copy as Markdown': '复制为 Markdown',
    'Copy working directory': '复制工作目录',
    'Fork chat': '分叉对话',
    'Fork': '分叉',
    'Continue in': '继续于',
    'Open in new window': '在新窗口打开',
    'Rename': '重命名',
    'Pin': '置顶',
    'Unpin': '取消置顶',
    'Archive': '归档',
    'Unarchive': '取消归档',
    'Mark as read': '标记为已读',
    'Mark as unread': '标记为未读',
    'Delete': '删除',
    'Settings': '设置',
    'Share': '分享',
    'Share chat': '分享对话',
    'Copy link': '复制链接',
    'App settings': '应用设置',
    'Edge computer use settings': 'Edge 计算机使用设置',
    'Sign out': '退出登录',
    'Log out': '退出登录',
    'Close': '关闭',
    'Cancel': '取消',
    'Confirm': '确定',
    'Save': '保存',
    'Done': '完成',
    'Archive chat?': '归档这个对话？',
    'You can find it later in your archived chats.': '之后可以在已归档的对话里找到它。',
    'Stop and archive this chat?': '停止并归档这个对话？',
    'Archive and remove': '归档并移除',
    'Stop and archive': '停止并归档',

    // Settings surface
    'Codex settings': 'Codex 设置',
    'Settings and config': '设置与配置',
    'General': '通用',
    'Appearance': '外观',
    'Notifications': '通知',
    'Model default': '默认模型',
    'Output detail': '输出详细度',
    'Approval policy': '审批策略',
    'Reasoning': '推理',
    'Reasoning summary': '推理摘要',
    'Sandbox': '沙箱',
    'Sandbox settings': '沙箱设置',
    'Network access': '网络访问',
    'Allow network access': '允许网络访问',
    'Web search': '联网搜索',
    'Speed': '速度',
    'Agent defaults': '智能体默认值',
    'Custom config.toml settings': '自定义 config.toml 设置',
    'Global config': '全局配置',
    'Project config': '项目配置',
    'User config': '用户配置',
    'Admin config': '管理员配置',
    'Full access': '完全访问',
    'Read only': '只读',
    'Workspace write': '工作区可写',
    'Never ask for approval': '从不请求批准',
    'On failure': '失败时',
    'On request': '按请求',
    'Untrusted': '不受信任',
    'High': '高',
    'Medium': '中',
    'Low': '低',
    'None': '无',
    'Auto': '自动',
    'Concise': '简明',
    'Detailed': '详细',
    'On': '开',
    'Off': '关',
    'Enabled': '已启用',
    'Disabled': '已禁用',
    'Cached': '缓存',
    'Indexed': '索引',
    'Live': '实时',

    // Our own entry, added to the top of the menu below
    'Translation settings': '设置',
    '翻译设置': '设置',
  };

  function translateString(value) {
    if (!value) return value;
    const trimmed = String(value).trim();
    if (!trimmed) return value;
    const hit = TEXT[trimmed];
    if (!hit) return value;
    return String(value).replace(trimmed, hit);
  }

  function translateElement(element) {
    if (!element || element.nodeType !== 1) return;
    if (element.closest('pre, code, [contenteditable="true"]')) return;

    if (element.matches(CONTROL_SELECTOR) || element.querySelector(CONTROL_SELECTOR)) {
      translateAttributes(element);
    }
  }

  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];

  function translateAttributes(root) {
    if (!root.querySelectorAll) return;
    const targets = [root];
    root.querySelectorAll('*').forEach((node) => targets.push(node));
    for (const node of targets) {
      for (const attr of ATTRS) {
        if (!node.hasAttribute || !node.hasAttribute(attr)) continue;
        const value = node.getAttribute(attr);
        const next = translateString(value);
        if (next !== value) node.setAttribute(attr, next);
      }
    }
  }

  /*
   * Walks text nodes under a control and swaps exact matches. Only the control
   * subtree is visited, so conversation text is never touched.
   */
  function translateControls(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const controls = scope.querySelectorAll(CONTROL_SELECTOR);
    const list = [];
    if (scope.matches && scope.matches(CONTROL_SELECTOR)) list.push(scope);
    controls.forEach((node) => list.push(node));

    for (const control of list) {
      if (control.closest('pre, code')) continue;
      const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode())) {
        const next = translateString(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
      }
      translateAttributes(control);
    }
  }

  /* ------------------------------------------------- added menu entry */

  const MENU_ITEM_HINT = ['Chat actions', '聊天操作'];

  function looksLikeMenu(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.closest('#' + 'codex-translate-bubble')) return false;
    const role = element.getAttribute('role');
    if (role === 'menu') return true;
    const text = element.textContent || '';
    if (text.length > 600) return false;
    let hints = 0;
    for (const hint of MENU_ITEM_HINT) if (text.includes(hint)) hints++;
    return hints > 0;
  }

  function findMenuRoot() {
    const candidates = document.querySelectorAll('[role="menu"], [data-radix-menu-content], [data-state="open"]');
    for (const candidate of candidates) {
      if (looksLikeMenu(candidate)) {
        const items = candidate.querySelectorAll('[role="menuitem"], [role="menuitemradio"], button');
        if (items.length >= 2) return candidate;
      }
    }
    return null;
  }

  function openTranslationSettings() {
    chrome.runtime.sendMessage({ type: 'translate:open-options' }).catch(() => {});
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function injectMenuEntry() {
    const root = findMenuRoot();
    if (!root) return false;
    if (root.querySelector('[' + MENU_MARK + ']')) return true;

    const items = Array.from(root.querySelectorAll('[role="menuitem"], [role="menuitemradio"], button'))
      .filter((node) => !node.hasAttribute(MENU_MARK));
    if (!items.length) return false;

    // Clone the first entry so the added row matches the top of the menu, then
    // put it above that entry.
    const template = items[0];
    const entry = template.cloneNode(true);
    entry.setAttribute(MENU_MARK, '1');
    entry.removeAttribute('data-state');

    const walker = document.createTreeWalker(entry, NodeFilter.SHOW_TEXT, null);
    let replaced = false;
    let node;
    while ((node = walker.nextNode())) {
      if (!replaced && node.nodeValue && node.nodeValue.trim()) {
        node.nodeValue = '设置';
        replaced = true;
      } else if (replaced) {
        node.nodeValue = '';
      }
    }
    if (!replaced) entry.textContent = '设置';
    ['aria-label', 'title'].forEach((attr) => entry.setAttribute(attr, '设置'));
    // Drop any icon in the cloned entry so only the label remains.
    entry.querySelectorAll('svg, img').forEach((icon) => icon.remove());

    entry.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTranslationSettings();
    }, true);

    if (template.parentElement) template.parentElement.insertBefore(entry, template);
    return true;
  }

  /* --------------------------------------------------------- scheduling */

  let scheduled = false;
  function apply() {
    scheduled = false;
    try {
      translateControls(document);
      injectMenuEntry();
    } catch (error) {
      /* a failed pass must never break the panel */
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(apply);
  }

  function start() {
    schedule();
    try {
      new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'placeholder'],
      });
    } catch (error) {
      /* observer is best-effort */
    }
    // The panel mounts late and re-renders often; a few passes cover the wake-up.
    [400, 1200, 2500, 5000].forEach((delay) => setTimeout(schedule, delay));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
