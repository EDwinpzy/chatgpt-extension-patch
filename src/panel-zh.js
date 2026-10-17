/*
 * Chinese localisation for the Codex side panel, plus a fixed settings
 * button pinned to the top-right corner of the panel.
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

  /* --------------------- 右上角常驻「设置」按钮 ----------------------
   *
   * 菜单注入试过三轮都被面板自身的渲染节奏打乱（菜单延迟挂载、可访问名称
   * 既有属性又有隐藏文本、行菜单和头部菜单难以区分），改为不再依赖任何
   * 菜单：直接在视口右上角固定一个半透明小按钮，点它打开补丁设置页。
   * 普通侧边栏和 work 模式的原生页面（content script 注入）都能看到。
   */

  const GEAR_ID = 'codex-translate-gear';

  function openTranslationSettings() {
    chrome.runtime.sendMessage({ type: 'translate:open-options' }).catch(() => {});
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function mountSettingsButton() {
    if (document.getElementById(GEAR_ID)) return;
    const host = document.body || document.documentElement;
    if (!host || !host.appendChild) return;

    const style = document.createElement('style');
    style.id = GEAR_ID + '-style';
    style.textContent = [
      '#' + GEAR_ID + ' {',
      '  position: fixed; top: 14px; right: 8px; z-index: 2147483647;',
      '  width: 26px; height: 26px; padding: 0; margin: 0;',
      '  display: flex; align-items: center; justify-content: center;',
      '  border: 0; border-radius: 6px; cursor: pointer;',
      '  background: transparent; color: inherit; opacity: .6;',
      '  transition: opacity .12s ease;',
      '}',
      '#' + GEAR_ID + ':hover { opacity: 1; }',
      '#' + GEAR_ID + ' svg { display: block; }',
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);

    const button = document.createElement('button');
    button.id = GEAR_ID;
    button.type = 'button';
    /* 竖排三点（kebab），三颗圆点在 16x16 视图里上下对称，天然居中。 */
    button.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="3" r="1.7" fill="currentColor"/>' +
      '<circle cx="8" cy="8" r="1.7" fill="currentColor"/>' +
      '<circle cx="8" cy="13" r="1.7" fill="currentColor"/>' +
      '</svg>';
    button.setAttribute('aria-label', '设置（翻译 / 摘要 / 书签）');
    button.setAttribute('title', '设置（翻译 / 摘要 / 书签）');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openTranslationSettings();
    });
    host.appendChild(button);
  }

  /* --------------------------------------------------------- scheduling */

  let scheduled = false;
  function apply() {
    scheduled = false;
    try {
      translateControls(document);
      mountSettingsButton();
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
