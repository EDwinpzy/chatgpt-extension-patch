/*
 * In-page translation UI.
 *
 * One surface for now: a bubble that translates the selected text. It lives in
 * a shadow root so page styles cannot reach it and its styles cannot leak out.
 *
 * There is no permanent button on the page. The bubble appears on demand and
 * disappears when the selection goes away.
 */

(() => {
  if (window.__codexTranslateUiLoaded) return;
  window.__codexTranslateUiLoaded = true;

  const BUBBLE_ID = 'codex-translate-bubble';
  const MAX_SELECTION_CHARS = 3000;

  let host = null;
  let shadow = null;
  let settings = null;
  let current = null; // { text, translation, range, replaced, savedHtml }
  let requestToken = 0;
  let pageHost = null;
  let pageShadow = null;
  let pageRun = null;

  /*
   * Late content. Single-page apps render their nav views after load and swap
   * them without navigating, so the one pass at document_idle misses every
   * screen that appears later. Anything the page adds afterwards is queued
   * into an extra, quieter pass.
   */
  const RERUN_DEBOUNCE_MS = 900;
  const RERUN_COOLDOWN_MS = 2500;
  const RERUN_LIMIT = 60;
  let rerunTimer = null;
  let rerunCount = 0;
  let lastRunAt = 0;
  let contentObserver = null;
  /* Every block translated on this page, so 还原原文 covers the late passes too. */
  let translatedUnits = [];
  /* Text nodes inside a container that were translated on their own. A WeakSet:
   * a text node cannot carry an attribute. */
  let translatedRuns = new WeakSet();

  /* ------------------------------------------------------------- styling */

  const BUBBLE_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap {
      position: fixed; z-index: 2147483646; width: 320px; max-width: calc(100vw - 16px);
      font: 13px/1.6 -apple-system, "Segoe UI", "Noto Sans SC", system-ui, sans-serif;
      letter-spacing: 0; color: #ececec;
      background: #212121; border: 1px solid rgba(255,255,255,.14); border-radius: 12px;
      box-shadow: 0 14px 34px rgba(0,0,0,.5); overflow: hidden;
    }
    .hd {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,.08);
      font-size: 12px; color: #a3a3a3;
    }
    .hd .spacer { flex: 1; }
    .iconbtn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border: 0; border-radius: 6px; padding: 0;
      background: transparent; color: #a3a3a3; cursor: pointer;
    }
    .iconbtn:hover { background: #2f2f2f; color: #ececec; }
    .iconbtn svg { width: 15px; height: 15px; stroke: currentColor; fill: none;
      stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .bd { padding: 12px; max-height: 260px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
    .bd.error { color: #c9a227; }
    .bd .hint { display: block; margin-top: 6px; color: #8a8a8a; font-size: 12px; white-space: pre-wrap; }
    .sk { height: 9px; border-radius: 4px; background: #2c2c2c; margin: 8px 0; }
    .sk:first-child { margin-top: 0; }
    .ft {
      display: flex; gap: 6px; padding: 10px 12px;
      border-top: 1px solid rgba(255,255,255,.08); background: #1b1b1b;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px;
      border: 1px solid transparent; border-radius: 999px; background: #2f2f2f;
      color: #ececec; font: inherit; font-size: 12px; cursor: pointer;
    }
    .btn:hover { background: #3a3a3a; }
    .btn.ghost { background: transparent; border-color: rgba(255,255,255,.14); color: #a3a3a3; }
    .btn.ghost:hover { color: #ececec; }
    .btn svg { width: 14px; height: 14px; stroke: currentColor; fill: none;
      stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .chip {
      position: fixed; z-index: 2147483646;
      display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px;
      border-radius: 999px; border: 1px solid rgba(255,255,255,.14);
      background: #212121; color: #ececec; cursor: pointer;
      font: 12px/1 -apple-system, "Segoe UI", "Noto Sans SC", system-ui, sans-serif;
      box-shadow: 0 8px 20px rgba(0,0,0,.45);
    }
    .chip svg { width: 14px; height: 14px; stroke: currentColor; fill: none;
      stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  `;

  const ICON = {
    gear: '<svg viewBox="0 0 24 24"><path d="M4 6h10"/><path d="M18 6h2"/><path d="M4 12h4"/><path d="M12 12h8"/><path d="M4 18h12"/><path d="M20 18h0"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z"/></svg>',
  };

  const LANG_LABEL = {
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    en: 'English',
    ja: '日本語',
    ko: '한국어',
    fr: 'Français',
    de: 'Deutsch',
    es: 'Español',
    ru: 'Русский',
  };

  /* ------------------------------------------------------------- helpers */

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = BUBBLE_ID;
    host.style.cssText = 'all: initial; position: static;';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = BUBBLE_CSS;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
  }

  function clear() {
    if (host) host.remove();
    host = null;
    shadow = null;
    current = null;
  }

  function currentSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const text = String(selection.toString() || '').trim();
    if (!text) return null;
    if (text.length > MAX_SELECTION_CHARS) return null;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const element = node && node.nodeType === 3 ? node.parentElement : node;
    if (!element || !element.isConnected) return null;
    if (host && (element === host || host.contains(element))) return null;
    return { text, range };
  }

  function rectForRange(range) {
    const rects = range.getClientRects();
    if (rects && rects.length) return rects[rects.length - 1];
    const box = range.getBoundingClientRect();
    return box;
  }

  function place(element, rect, below) {
    const width = element.offsetWidth || 300;
    const height = element.offsetHeight || 80;
    let top = below ? rect.bottom + 10 : rect.top - height - 10;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 10);
    if (top < 8) top = 8;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    element.style.top = Math.round(top) + 'px';
    element.style.left = Math.round(left) + 'px';
  }

  function blocked() {
    const hostName = location.hostname || '';
    const list = (settings && settings.blockedSites) || [];
    for (const raw of list) {
      const pattern = String(raw || '').trim().toLowerCase();
      if (!pattern) continue;
      const bare = pattern.replace(/^\*\./, '');
      if (hostName === bare || hostName.endsWith('.' + bare)) return true;
    }
    return false;
  }

  /* ----------------------------------------------------------- rendering */

  function renderLoading(rect) {
    ensureHost();
    shadow.querySelectorAll('.wrap, .chip').forEach((node) => node.remove());
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML =
      '<div class="hd"><span>正在翻译…</span></div>' +
      '<div class="bd"><div class="sk" style="width:92%"></div>' +
      '<div class="sk" style="width:78%"></div><div class="sk" style="width:56%"></div></div>';
    shadow.appendChild(wrap);
    place(wrap, rect, true);
  }

  function renderError(rect, message) {
    ensureHost();
    shadow.querySelectorAll('.wrap, .chip').forEach((node) => node.remove());
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    const body = document.createElement('div');
    body.className = 'bd error';
    body.textContent = '翻译失败';
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = message || '';
    body.appendChild(hint);

    const head = document.createElement('div');
    head.className = 'hd';
    head.textContent = '翻译失败';

    const foot = document.createElement('div');
    foot.className = 'ft';
    const retry = document.createElement('button');
    retry.className = 'btn';
    retry.innerHTML = ICON.undo + '<span>重试</span>';
    retry.addEventListener('click', () => run(current ? current.text : ''));
    const openSettings = document.createElement('button');
    openSettings.className = 'btn ghost';
    openSettings.innerHTML = ICON.gear + '<span>打开设置</span>';
    openSettings.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'translate:open-options' }).catch(() => {});
    });
    foot.appendChild(retry);
    foot.appendChild(openSettings);

    wrap.appendChild(head);
    wrap.appendChild(body);
    wrap.appendChild(foot);
    shadow.appendChild(wrap);
    place(wrap, rect, true);
  }

  function renderBubble(rect, text, translation, range) {
    ensureHost();
    shadow.querySelectorAll('.wrap, .chip').forEach((node) => node.remove());
    // Re-rendering the same text keeps an active replacement so the button can
    // still undo it; a new selection starts clean.
    const previous = current || {};
    const sameText = previous.text === text;
    current = {
      text,
      translation,
      range,
      original: sameText && previous.original ? previous.original : text,
      node: sameText && previous.node && previous.node.isConnected ? previous.node : null,
    };

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    const head = document.createElement('div');
    head.className = 'hd';
    const title = document.createElement('span');
    title.textContent = '译为 ' + (LANG_LABEL[(settings && settings.targetLang) || 'zh-CN'] || 'zh-CN');
    head.appendChild(title);
    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    head.appendChild(spacer);
    const gear = document.createElement('button');
    gear.className = 'iconbtn';
    gear.title = '翻译设置';
    gear.innerHTML = ICON.gear;
    gear.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'translate:open-options' }).catch(() => {});
    });
    head.appendChild(gear);

    const body = document.createElement('div');
    body.className = 'bd';
    body.textContent = translation;

    const foot = document.createElement('div');
    foot.className = 'ft';

    const copy = document.createElement('button');
    copy.className = 'btn';
    copy.innerHTML = ICON.copy + '<span>复制</span>';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(translation);
        copy.innerHTML = ICON.check + '<span>已复制</span>';
        setTimeout(() => {
          copy.innerHTML = ICON.copy + '<span>复制</span>';
        }, 1400);
      } catch (error) {
        /* clipboard can be refused; leave the label unchanged */
      }
    });

    const replace = document.createElement('button');
    replace.className = 'btn';
    const paintReplace = () => {
      const active = Boolean(current && current.node && current.node.isConnected);
      replace.innerHTML = active
        ? ICON.undo + '<span>撤销替换</span>'
        : ICON.check + '<span>替换原文</span>';
      replace.setAttribute('aria-pressed', active ? 'true' : 'false');
    };
    paintReplace();
    replace.addEventListener('click', () => {
      if (!current) return;
      try {
        if (current.node && current.node.isConnected) {
          current.node.replaceWith(document.createTextNode(current.original || text));
          current.node = null;
        } else {
          if (!current.range) return;
          const node = document.createTextNode(translation);
          current.range.deleteContents();
          current.range.insertNode(node);
          current.node = node;
          current.original = text;
        }
      } catch (error) {
        // A detached range means the page changed underneath us; report the
        // button back in its idle state instead of leaving it stuck.
        current.node = null;
      }
      paintReplace();
    });

    const again = document.createElement('button');
    again.className = 'btn ghost';
    again.innerHTML = ICON.refresh + '<span>重译</span>';
    again.addEventListener('click', () => {
      // Put the original text back first, otherwise the new translation would
      // be inserted on top of the replaced text and the original would be lost.
      if (current && current.node && current.node.isConnected) {
        try {
          current.node.replaceWith(document.createTextNode(current.original || text));
        } catch (error) {
          /* page changed; nothing to restore */
        }
        current.node = null;
      }
      run(text);
    });

    foot.appendChild(copy);
    foot.appendChild(replace);
    foot.appendChild(again);

    wrap.appendChild(head);
    wrap.appendChild(body);
    wrap.appendChild(foot);
    shadow.appendChild(wrap);
    place(wrap, rect, true);
  }

  function renderChip(rect) {
    ensureHost();
    shadow.querySelectorAll('.wrap, .chip').forEach((node) => node.remove());
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.innerHTML = ICON.globe + '<span>翻译</span>';
    chip.addEventListener('click', () => {
      const selection = currentSelection();
      run(selection ? selection.text : '');
    });
    shadow.appendChild(chip);
    place(chip, rect, true);
  }

  /* --------------------------------------------------------------- logic */

  /* ---------------------------------------------------- page translation */

  const PAGE_HOST_ID = 'codex-translate-page';
  const MARK = 'data-codex-translated';
  const MARK_HASH = 'data-codex-translated-hash';
  const GHOST_ATTR = 'data-codex-ghost';
  const SETTINGS_KEY = 'translateSettings';
  const BLOCK_TAGS = new Set([
    'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'BLOCKQUOTE',
    'DD', 'DT', 'FIGCAPTION', 'SUMMARY', 'CAPTION', 'DIV',
    // A button is a text holder too ("Change plan", "Buy credits"). Only text
    // nodes are rewritten, so translating one cannot break the control.
    'BUTTON',
  ]);
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CODE',
    'PRE', 'KBD', 'SAMP', 'SVG', 'MATH', 'CANVAS', 'IFRAME', 'VIDEO', 'AUDIO',
    'TEMPLATE',
  ]);
  const MAX_UNITS = 500;
  const MAX_SHORTEN = 24;
  const UNIT_MAX_CHARS = 1500;
  /*
   * Forty is the size the engine merges a request up to anyway, so a smaller
   * slice here only added round trips. Several slices travel at once; the
   * engine's own limiter is what keeps that from turning into a flood.
   */
  const BATCH_UNITS = 40;
  const BATCH_PARALLEL = 4;
  /*
   * The first batch stays small on purpose. Units are collected in reading
   * order, so a short first slice is the first screenful: the page starts
   * showing translations in a fraction of the time a full batch takes, and
   * everything behind it is still packed into full-size batches.
   */
  const BATCH_FIRST_UNITS = 8;
  /*
   * When the automatic pass may start. A flat wait is either too long for a
   * page that has nothing left to render or too short for one that is still
   * painting, so the wait is over as soon as the document has been still for
   * a moment - and never later than START_MAX_MS.
   */
  const START_MIN_MS = 150;
  const START_QUIET_MS = 200;
  const START_MAX_MS = 600;

  /*
   * A video player's caption layer belongs to the subtitle feature, which
   * replaces those lines itself. If page translation rewrote them too, the two
   * would fight over the same text and the caption would end up translated
   * twice. Only skipped on pages that actually have a video.
   */
  const CAPTION_LAYERS = [
    '.ytp-caption-window-container',
    '.caption-visual-line',
    '.captions-text',
    '.vjs-text-track-display',
    '.plyr__caption',
    '.jw-text-track-display',
    '.bpx-player-subtitle-wrap',
    '.bpx-player-subtitle-simple',
    '.shaka-text-container',
  ];
  const CAPTION_HINT = /caption|subtitles?|timedtext|player-text/i;

  function insideCaptionLayer(element) {
    try {
      let node = element;
      for (let depth = 0; node && node !== document.body && depth < 6; depth++, node = node.parentElement) {
        if (node.matches(CAPTION_LAYERS.join(','))) return true;
        if (CAPTION_HINT.test(String(node.className || '') + ' ' + String(node.id || ''))) return true;
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  const PAGE_CSS = `
    :host { all: initial; }
    .pill {
      position: fixed; left: 50%; transform: translateX(-50%); bottom: 20px;
      z-index: 2147483645;
      display: flex; align-items: center; gap: 10px;
      padding: 7px 8px 7px 14px;
      background: #212121; border: 1px solid rgba(255,255,255,.14); border-radius: 999px;
      box-shadow: 0 14px 34px rgba(0,0,0,.5); color: #a3a3a3;
      font: 12.5px/1.4 -apple-system, "Segoe UI", "Noto Sans SC", system-ui, sans-serif;
      letter-spacing: 0; white-space: nowrap; max-width: calc(100vw - 32px);
    }
    /* An error message must never push the pill off the screen. */
    .label { min-width: 0; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
    .bar { width: 110px; height: 4px; border-radius: 3px; background: #333; overflow: hidden; }
    /* A message stands on its own; an empty track next to it is just noise. */
    .pill.plain .bar { display: none; }
    .bar i { display: block; height: 100%; width: 0; background: #f5f5f5; transition: width .2s; }
    .btn {
      height: 24px; padding: 0 10px; border-radius: 999px; cursor: pointer;
      border: 1px solid rgba(255,255,255,.14); background: transparent; color: #a3a3a3;
      font: inherit; font-size: 12px;
    }
    .btn:hover { color: #ececec; }
  `;

  /*
   * Page translation rewrites text nodes and nothing else: no wrapper
   * elements, no inline styles, no font overrides. The first version appended
   * a styled <span>, which became an extra flex item inside nav rows and
   * squeezed labels into one word per line. A text node cannot change a box,
   * so the page keeps its own layout, fonts and colours.
   */
  function textNodesOf(element) {
    const nodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest('[' + MARK + ']')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function ensurePageHost() {
    if (pageHost && pageHost.isConnected) return;
    pageHost = document.createElement('div');
    pageHost.id = PAGE_HOST_ID;
    pageHost.style.cssText = 'all: initial; position: static;';
    pageShadow = pageHost.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PAGE_CSS;
    pageShadow.appendChild(style);
    document.documentElement.appendChild(pageHost);
  }

  function renderProgress(done, total, note) {
    ensurePageHost();
    let pill = pageShadow.querySelector('.pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'pill';
      const label = document.createElement('span');
      label.className = 'label';
      const bar = document.createElement('span');
      bar.className = 'bar';
      bar.appendChild(document.createElement('i'));
      const cancel = document.createElement('button');
      cancel.className = 'btn';
      cancel.textContent = '取消';
      cancel.addEventListener('click', () => {
        if (pageRun) pageRun.cancelled = true;
        hideProgress();
      });
      pill.appendChild(label);
      pill.appendChild(bar);
      pill.appendChild(cancel);
      pageShadow.appendChild(pill);
    }
    pill.querySelector('.label').textContent = note || ('正在翻译 ' + done + ' / ' + total + ' 段');
    pill.classList.toggle('plain', Boolean(note));
    const fill = pill.querySelector('.bar i');
    fill.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
  }

  function hideProgress() {
    if (pageShadow) pageShadow.querySelectorAll('.pill').forEach((node) => node.remove());
  }

  function ownText(element) {
    return String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /*
   * A mark left on a block only means "we wrote this" while the block still
   * holds what we wrote. Single-page apps re-render their data views: the text
   * goes back to the original while our attribute stays, and without this check
   * the mark would block that block from ever being translated again.
   */
  function staleMark(element) {
    if (!element.hasAttribute(MARK)) return false;
    // Echo layers keep their own mark; nothing re-renders those for us.
    if (element.getAttribute(MARK) === 'twin') return true;
    if (element.getAttribute(MARK_HASH) === String(textHash(ownText(element)))) return true;
    element.removeAttribute(MARK);
    element.removeAttribute(MARK_HASH);
    return false;
  }

  /* Cheap fingerprint of what we wrote, to tell our own text from a re-render. */
  function textHash(value) {
    const text = String(value || '');
    let hash = 0;
    for (let index = 0; index < text.length; index++) {
      hash = (hash * 31 + text.charCodeAt(index)) | 0;
    }
    return hash;
  }

  /* Inline children of a container: a badge, a button label, a row of links. */
  const INLINE_UNITS = new Set(['SPAN', 'A', 'B', 'STRONG', 'EM', 'SMALL', 'LABEL', 'TIME', 'ABBR', 'CITE', 'MARK']);

  /* Text written directly in the element, not inside a child element. */
  function hasOwnText(element) {
    for (const child of element.childNodes) {
      if (child.nodeType === 3 && String(child.nodeValue || '').trim()) return true;
    }
    return false;
  }

  /* How many inline children carry text of their own. */
  function inlineTextChildren(element) {
    let count = 0;
    for (const child of element.childNodes) {
      if (child.nodeType !== 1) continue;
      if (!INLINE_UNITS.has(child.tagName)) continue;
      if (!String(child.textContent || '').trim()) continue;
      count++;
    }
    return count;
  }

  /*
   * Innermost text blocks: a container that holds other blocks is not a unit.
   * Two kinds of text would fall through that rule - the container's own text
   * and the inline elements sitting next to its block children - so both are
   * added back here. Only for containers: inside a plain text block an inline
   * element is part of the sentence and must stay in it.
   */
  function collectUnits() {
    const hasVideo = Boolean(document.querySelector('video'));
    const candidates = [];
    /* Every text block on the page, translated or not. */
    const blocks = [];

    /*
     * A TreeWalker cannot cross a shadow boundary, so every open shadow root is
     * walked as well: a component library keeps its text in there, and that
     * text used to be invisible to us.
     */
    const roots = [document.body];
    for (let depth = 0; depth < 3; depth++) {
      const found = [];
      for (const root of roots) {
        for (const element of root.querySelectorAll('*')) {
          if (element.shadowRoot) found.push(element.shadowRoot);
        }
      }
      if (!found.length) break;
      for (const root of found) roots.push(root);
    }

    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(element) {
          if (SKIP_TAGS.has(element.tagName)) return NodeFilter.FILTER_REJECT;
          if (element.id === PAGE_HOST_ID || element.id === BUBBLE_ID) return NodeFilter.FILTER_REJECT;
          if (element.isContentEditable) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let node;
      while ((node = walker.nextNode())) {
        if (!BLOCK_TAGS.has(node.tagName)) continue;
        const text = ownText(node);
        if (text.length < 2 || text.length > UNIT_MAX_CHARS) continue;
        // Every text block counts as a block, including the ones we already
        // translated: otherwise an ancestor would stop being a container and
        // get collected itself, carrying the translated children's text.
        blocks.push(node);
        if (hasVideo && insideCaptionLayer(node)) continue;
        if (staleMark(node)) continue;
        candidates.push({ element: node, text });
      }
    }

    // A Set, not a WeakSet: the second pass iterates it.
    const containers = new Set();
    for (const block of blocks) {
      /*
       * A row whose text lives entirely in two or more inline children - a
       * label and a value, a row of buttons - is not one sentence. Translating
       * it as a block would put the whole result into the first child and blank
       * the others, which is exactly the misplacement this avoids: each child
       * becomes a unit of its own instead.
       */
      if (!hasOwnText(block) && inlineTextChildren(block) >= 2) containers.add(block);
      let parent = block.parentElement;
      while (parent && parent !== document.body) {
        containers.add(parent);
        parent = parent.parentElement;
      }
    }

    const units = candidates.filter((candidate) => !containers.has(candidate.element));
    for (const container of containers) {
      if (units.length >= MAX_UNITS) break;
      for (const child of container.childNodes) {
        if (child.nodeType === 3) {
          // The container's own text, outside every block child. Scoped to this
          // one text node, so the children keep theirs.
          if (translatedRuns.has(child)) continue;
          const run = String(child.nodeValue || '').replace(/\s+/g, ' ').trim();
          if (run.length < 2) continue;
          units.push({
            element: container,
            nodes: [child],
            original: [child.nodeValue],
            text: run,
            noMark: true,
          });
          continue;
        }
        if (child.nodeType !== 1) continue;
        if (!INLINE_UNITS.has(child.tagName)) continue;
        if (child.isContentEditable) continue;
        if (staleMark(child)) continue;
        if (hasVideo && insideCaptionLayer(child)) continue;
        const text = ownText(child);
        if (text.length < 2 || text.length > UNIT_MAX_CHARS) continue;
        units.push({ element: child, text });
      }
    }

    return units.slice(0, MAX_UNITS);
  }

  function looksLikeTargetLanguage(units) {
    const sample = units.slice(0, 24).map((unit) => unit.text).join(' ');
    if (!sample) return false;
    const cjk = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
    const latin = (sample.match(/[A-Za-z]/g) || []).length;
    const lang = (settings && settings.targetLang) || 'zh-CN';
    if (/^(zh|cn|yue)/i.test(lang)) return cjk > latin;
    return false;
  }

  function currentMode() {
    return (settings && settings.displayMode) || 'bilingual';
  }

  /*
   * Writes one slot - a block, or a decorative twin of one - back to its
   * original text and then applies the translation on top. Only text node
   * values change, so the page keeps its own boxes.
   */
  function writeSlot(slot, translation, mode) {
    const nodes = slot.nodes;
    nodes.forEach((node, index) => {
      node.nodeValue = slot.original[index];
    });
    if (mode === 'replace') {
      // The translation lands in the first text run; the rest is blanked so a
      // block split by inline markup does not leave stray original words.
      nodes[0].nodeValue = translation;
      for (let index = 1; index < nodes.length; index++) nodes[index].nodeValue = '';
      return;
    }
    // Prefer a text run that belongs to the block itself, so the translation
    // does not end up inside a nested <b>/<code> with the wrong styling.
    const direct = nodes.filter((node) => node.parentElement === slot.element);
    const host = direct.length ? direct[direct.length - 1] : nodes[nodes.length - 1];
    host.nodeValue = String(host.nodeValue).replace(/\s+$/, '') + ' ' + translation;
  }

  function normalizeLabel(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
  }

  /* Two boxes count as stacked when they largely sit on top of each other. */
  function overlaps(first, second) {
    const a = first.getBoundingClientRect();
    const b = second.getBoundingClientRect();
    if (!a.width || !a.height || !b.width || !b.height) return false;
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (width <= 0 || height <= 0) return false;
    return width * height >= 0.5 * Math.min(a.width * a.height, b.width * b.height);
  }

  /*
   * Some designs draw a decorative duplicate of a label (an uppercase ghost
   * layer) on top of it. Translating only the visible copy leaves the two
   * layers disagreeing, which reads as broken text, so the twin follows. The
   * boxes have to overlap: two identical rows side by side are not twins.
   */
  function twinSlots(unit) {
    if (unit.twins) return unit.twins;
    unit.twins = [];
    const wanted = normalizeLabel(unit.text);
    if (wanted.length < 3) return unit.twins;
    const seen = [];
    // Layered designs put the echo next to the heading, or one wrapper up.
    let scope = unit.element.parentElement;
    for (let depth = 0; scope && scope !== document.body && depth < 3; depth++, scope = scope.parentElement) {
      for (const sibling of scope.children) {
        if (sibling === unit.element) continue;
        if (sibling.hasAttribute(MARK) || sibling.hasAttribute(GHOST_ATTR)) continue;
        // Only a separate layer counts; a wrapper around the unit, or anything
        // inside it, would just write the same text twice.
        if (sibling.contains(unit.element) || unit.element.contains(sibling)) continue;
        if (seen.indexOf(sibling) >= 0) continue;
        seen.push(sibling);
        if (normalizeLabel(sibling.textContent) !== wanted) continue;
        if (!overlaps(unit.element, sibling)) continue;
        const nodes = textNodesOf(sibling);
        if (!nodes.length) continue;
        unit.twins.push({ element: sibling, nodes, original: nodes.map((node) => node.nodeValue) });
        sibling.setAttribute(MARK, 'twin');
      }
    }
    // A print-offset echo is not always a relative: sample the stacking order
    // at the unit's own pixels, which finds layers from anywhere in the page.
    for (const slot of stackedSlots(unit, wanted, seen)) {
      unit.twins.push(slot);
      slot.element.setAttribute(MARK, 'twin');
    }
    return unit.twins;
  }

  function stackedSlots(unit, wanted, seen) {
    const found = [];
    const rect = unit.element.getBoundingClientRect();
    if (rect.width < 6 || rect.height < 6) return found;
    const points = [];
    for (let step = 1; step <= 4; step++) {
      points.push([rect.left + (rect.width * step) / 5, rect.top + rect.height / 2]);
    }
    for (const point of points) {
      let stack = [];
      try {
        stack = document.elementsFromPoint(point[0], point[1]) || [];
      } catch (error) {
        return found;
      }
      for (const node of stack) {
        const slot = acceptTwin(unit, node, wanted, seen);
        if (slot) found.push(slot);
      }
    }
    // Hit testing skips `pointer-events: none`, which is exactly how a
    // decorative layer is usually styled, so positioned boxes are compared
    // directly as well.
    for (const node of floatingLayers()) {
      const slot = acceptTwin(unit, node, wanted, seen);
      if (slot) found.push(slot);
    }
    return found;
  }

  function acceptTwin(unit, node, wanted, seen) {
    if (!node || node.nodeType !== 1) return null;
    if (node === unit.element || seen.indexOf(node) >= 0) return null;
    if (node.id === PAGE_HOST_ID || node.id === BUBBLE_ID) return null;
    if (node.contains(unit.element) || unit.element.contains(node)) return null;
    if (node.hasAttribute(MARK) || node.hasAttribute(GHOST_ATTR)) return null;
    seen.push(node);
    if (normalizeLabel(node.textContent) !== wanted) return null;
    if (!overlaps(unit.element, node)) return null;
    const nodes = textNodesOf(node);
    if (!nodes.length) return null;
    return { element: node, nodes, original: nodes.map((item) => item.nodeValue) };
  }

  /*
   * Every box that floats over the page: those are the only candidates that can
   * be an echo layer from an unrelated part of the tree. Collected once and
   * reused, because resolving the position of every element is not cheap.
   */
  let floatingCache = null;

  function floatingLayers() {
    if (floatingCache && Date.now() - floatingCache.at < 3000) return floatingCache.list;
    const list = [];
    const scan = (root, depth) => {
      const nodes = root.querySelectorAll('*');
      const limit = Math.min(nodes.length, 6000);
      for (let index = 0; index < limit; index++) {
        const node = nodes[index];
        // Design-system components keep their echo inside a shadow root.
        if (depth < 2 && node.shadowRoot) scan(node.shadowRoot, depth + 1);
        if (SKIP_TAGS.has(node.tagName)) continue;
        const position = getComputedStyle(node).position;
        if (position === 'absolute' || position === 'fixed' || position === 'sticky') list.push(node);
      }
    };
    if (document.body) scan(document.body, 0);
    floatingCache = { at: Date.now(), list };
    return list;
  }

  function paint(unit, translation) {
    const mode = currentMode();
    writeSlot(unit, translation, mode);
    for (const slot of twinSlots(unit)) writeSlot(slot, translation, mode);
    overridePseudoEcho(unit, mode === 'replace' ? translation : unit.text + ' ' + translation);
  }

  /*
   * The echo is sometimes CSS instead of an element: the heading says
   * "Quick links" and a ::before prints the same string behind it. Rewriting
   * the element's own text then leaves that layer in the original language,
   * which renders as doubled glyphs, so the pseudo content is overridden when
   * - and only when - it repeats the element's text verbatim.
   */
  let ghostStyle = null;
  let ghostRules = [];

  function cssString(value) {
    return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n\s*/g, ' ') + '"';
  }

  function repaintGhostRules() {
    if (!ghostStyle || !ghostStyle.isConnected) return;
    ghostStyle.textContent = ghostRules
      .map((rule) => rule.selector + ' { content: ' + cssString(rule.text) + ' !important; }')
      .join('\n');
  }

  function overridePseudoEcho(unit, rendered) {
    const wanted = normalizeLabel(unit.text);
    if (wanted.length < 3) return;
    for (const pseudo of ['::before', '::after']) {
      let raw = '';
      try {
        raw = getComputedStyle(unit.element, pseudo).content || '';
      } catch (error) {
        continue;
      }
      const literal = /^"(.*)"$/s.exec(raw) || /^'(.*)'$/s.exec(raw);
      let echo = literal ? literal[1] : '';
      if (!literal) {
        // Tailwind-style `content: attr(data-echo)` carries the echo in an
        // attribute instead of a literal, so the attribute is read directly.
        const fromAttr = /^attr\(\s*([\w-]+)\s*(?:,\s*"([^"]*)"\s*)?\)$/i.exec(raw.trim());
        if (fromAttr) echo = unit.element.getAttribute(fromAttr[1]) || fromAttr[2] || '';
      }
      if (!echo || normalizeLabel(echo) !== wanted) continue;

      const existing = ghostRules.find((rule) => rule.owner === unit.element && rule.pseudo === pseudo);
      if (existing) {
        existing.text = rendered;
      } else {
        const index = ghostRules.length;
        unit.element.setAttribute(GHOST_ATTR, String(index));
        ghostRules.push({
          owner: unit.element,
          pseudo,
          selector: '[' + GHOST_ATTR + '="' + index + '"]' + pseudo,
          text: rendered,
        });
      }
      if (!ghostStyle || !ghostStyle.isConnected) {
        ghostStyle = document.createElement('style');
        ghostStyle.setAttribute('data-codex-ghost-style', '1');
        (document.head || document.documentElement).appendChild(ghostStyle);
      }
      repaintGhostRules();
    }
  }

  function dropPseudoEchoes() {
    document.querySelectorAll('[' + GHOST_ATTR + ']').forEach((element) => element.removeAttribute(GHOST_ATTR));
    if (ghostStyle && ghostStyle.isConnected) ghostStyle.remove();
    ghostStyle = null;
    ghostRules = [];
  }

  /* The nearest box the text actually has to fit inside. */
  function boxOf(element) {
    let node = element;
    while (node && node !== document.body) {
      if (node.clientWidth > 0 && getComputedStyle(node).display !== 'inline') return node;
      node = node.parentElement;
    }
    return null;
  }

  /*
   * Every box the translated text has to satisfy: the text node boxes deepest
   * first, then the block itself and a couple of ancestors.
   */
  function boxesFor(unit) {
    const boxes = [];
    const add = (node) => {
      if (node && node !== document.body && boxes.indexOf(node) < 0) boxes.push(node);
    };
    for (const node of unit.nodes || []) {
      let parent = node.parentElement;
      while (parent) {
        add(parent);
        if (parent === unit.element) break;
        parent = parent.parentElement;
      }
    }
    add(unit.element);
    let above = unit.element.parentElement;
    for (let depth = 0; above && above !== document.body && depth < 2; depth++, above = above.parentElement) add(above);
    return boxes;
  }

  /*
   * The classic "does not fit" signal: a box that hides its overflow while
   * holding more than it shows - ellipsis labels, one-line menu items, squeezed
   * table headers. Only boxes that hide are counted, so scrollable areas are
   * left alone.
   */
  function clippedBox(unit) {
    for (const box of boxesFor(unit)) {
      if (!box.clientWidth || box.scrollWidth <= box.clientWidth + 1) continue;
      const style = getComputedStyle(box);
      if (style.overflowX === 'hidden' || style.overflowX === 'clip' || style.textOverflow === 'ellipsis') return box;
    }
    return null;
  }

  function textWidthOf(element) {
    try {
      const range = document.createRange();
      range.selectNodeContents(element);
      return Math.round(range.getBoundingClientRect().width);
    } catch (error) {
      return 0;
    }
  }

  /* Records whether what we wrote still fits the box it was written into. */
  function measure(unit) {
    const clip = clippedBox(unit);
    if (clip) {
      unit.limit = clip.clientWidth;
      unit.textWidth = clip.scrollWidth;
      return;
    }
    const box = unit.element.clientWidth ? unit.element : boxOf(unit.element);
    if (!box) return;
    unit.limit = box.clientWidth;
    unit.textWidth = textWidthOf(unit.element);
  }

  /*
   * Character budget that would fit, or 0 when the text is fine. Site
   * agnostic: it only looks at the rendered box, so a clipped menu item, a
   * squeezed table header and a fixed-width button are treated the same.
   */
  function shorterBudget(unit) {
    if (!unit.translation || !unit.limit || !unit.textWidth) return 0;
    if (unit.text.length > 80) return 0;
    const limit = unit.limit;
    if (unit.textWidth <= limit + Math.max(4, limit * 0.04)) return 0;
    // Scale the current wording by how far it overflows, so the budget comes
    // from real glyphs instead of an assumed characters-per-em.
    const ratio = limit / unit.textWidth;
    const budget = Math.max(2, Math.floor(String(unit.translation).length * ratio) - 1);
    return budget < String(unit.translation).length ? budget : 0;
  }

  /* Second pass: whatever did not fit is asked for again, shorter. */
  async function shortenOverflowing(run) {
    const jobs = [];
    for (const unit of run.units) {
      if (run.cancelled || jobs.length >= MAX_SHORTEN) break;
      const budget = shorterBudget(unit);
      if (budget) jobs.push({ unit, budget });
    }
    if (!jobs.length) return;

    renderProgress(run.done, run.units.length, '有 ' + jobs.length + ' 处放不下，正在精简');
    const response = await chrome.runtime
      .sendMessage({
        type: 'translate:batch',
        texts: jobs.map((job) => job.unit.text),
        budgets: jobs.map((job) => job.budget),
      })
      .catch(() => null);
    if (run.cancelled || !response || !response.ok || !Array.isArray(response.translations)) return;

    jobs.forEach((job, index) => {
      const short = response.translations[index];
      if (!short || !short.trim() || short === job.unit.translation) return;
      paint(job.unit, short);
      job.unit.translation = short;
    });
  }

  /*
   * A translated block keeps every bit of its presentation: the font, the
   * size and the colour all come from the page's own CSS, because the only
   * thing written here is text. Anything that sets a style - an inline
   * font-size, a class, a wrapper element - shows up as the page changing
   * its look, which is never worth the convenience.
   */
  function applyTranslation(unit, translation) {
    if (!translation || !translation.trim()) return;
    if (!unit.nodes) {
      const nodes = textNodesOf(unit.element);
      if (!nodes.length) return;
      unit.nodes = nodes;
      unit.original = nodes.map((node) => node.nodeValue);
    }
    paint(unit, translation);
    if (!unit.noMark) {
      unit.element.setAttribute(MARK, currentMode());
      unit.element.setAttribute(MARK_HASH, String(textHash(ownText(unit.element))));
    } else if (unit.nodes && unit.nodes[0]) {
      // Remember the text node itself, so the next pass leaves it alone.
      translatedRuns.add(unit.nodes[0]);
    }
    translatedUnits.push(unit);
    if (translatedUnits.length > 4000) translatedUnits.splice(0, 1000);
    unit.translation = translation;
    measure(unit);
  }

  function restorePage() {
    if (pageRun) pageRun.cancelled = true;
    document.querySelectorAll('[' + MARK + ']').forEach((element) => {
      element.removeAttribute(MARK);
      element.removeAttribute(MARK_HASH);
    });
    dropPseudoEchoes();
    /*
     * Every unit remembers the text it had, so restoring is writing it back.
     * The list spans the whole page and not just the last pass: late content
     * runs its own pass, and its blocks have to come back too.
     */
    for (const unit of translatedUnits) {
      for (const slot of unit.twins ? [unit, ...unit.twins] : [unit]) {
        if (!slot.nodes) continue;
        slot.nodes.forEach((node, index) => {
          try {
            node.nodeValue = slot.original[index];
          } catch (error) {
            /* the page replaced the node; nothing to restore */
          }
        });
      }
    }
    translatedUnits = [];
    translatedRuns = new WeakSet();
    hideProgress();
    pageRun = null;
  }

  async function translateUnitBatch(units) {
    const response = await chrome.runtime
      .sendMessage({ type: 'translate:batch', texts: units.map((unit) => unit.text) })
      .catch((error) => ({ ok: false, error: String(error && error.message) }));
    if (!response || !response.ok) {
      throw new Error((response && response.error) || '翻译失败');
    }
    return response.translations || [];
  }

  async function runPageTranslation(options) {
    if (pageRun && !pageRun.finished) return;
    // The catch-up pass runs over a page the user is already reading, so it
    // stays silent instead of flashing the progress pill.
    const quiet = Boolean(options && options.quiet);
    const units = collectUnits();
    lastRunAt = Date.now();
    if (!units.length) {
      if (quiet) noteState('quiet:empty');
      if (options && options.manual) renderProgress(0, 0, '没有找到可翻译的段落');
      return;
    }
    if (!(options && options.force) && looksLikeTargetLanguage(units)) {
      if (quiet) {
        noteState('quiet:already-target');
      }
      return;
    }

    pageRun = { units, cancelled: false, finished: false, done: 0 };
    const run = pageRun;
    if (!quiet) renderProgress(0, units.length);

    try {
      /*
       * Batches travel together instead of one after another. Waiting for each
       * one to land before sending the next bought nothing: the model call
       * dominates, and the engine is the thing that throttles. Each batch is
       * applied the moment it arrives, so the page fills in progressively.
       */
      const slices = [];
      let from = 0;
      if (units.length > BATCH_FIRST_UNITS + BATCH_UNITS) {
        slices.push(units.slice(0, BATCH_FIRST_UNITS));
        from = BATCH_FIRST_UNITS;
      }
      for (let index = from; index < units.length; index += BATCH_UNITS) {
        slices.push(units.slice(index, index + BATCH_UNITS));
      }
      let cursor = 0;
      let failed = 0;
      let firstError = null;
      const worker = async () => {
        while (cursor < slices.length && !run.cancelled) {
          const slice = slices[cursor++];
          let translations;
          try {
            translations = await translateUnitBatch(slice);
          } catch (error) {
            failed++;
            if (!firstError) firstError = error;
            continue;
          }
          if (run.cancelled) return;
          slice.forEach((unit, position) => applyTranslation(unit, translations[position]));
          /* Batches land out of order, so the count only ever grows. */
          run.done = Math.min(run.done + slice.length, units.length);
          if (!quiet) renderProgress(run.done, units.length);
        }
      };
      const workers = [];
      const crew = Math.min(BATCH_PARALLEL, slices.length);
      for (let index = 0; index < crew; index++) workers.push(worker());
      await Promise.all(workers);
      /* One unlucky batch must not blank the rest of the page. */
      if (failed === slices.length) throw firstError;
      if (!run.cancelled) await shortenOverflowing(run);
    } catch (error) {
      if (quiet) noteState('quiet:error ' + String((error && error.message) || error).slice(0, 70));
      if (!quiet) {
        renderProgress(run.done, units.length, '翻译出错：' + String((error && error.message) || error).slice(0, 60));
        setTimeout(hideProgress, 4000);
      }
      pageRun.finished = true;
      return;
    }

    if (!run.cancelled && !quiet) {
      renderProgress(units.length, units.length, '已翻译 ' + units.length + ' 段');
      setTimeout(hideProgress, 1500);
    }
    run.finished = true;
    if (quiet) noteState('quiet:done ' + units.length + (run.cancelled ? ' cancelled' : ''));
  }

  /*
   * When the automatic pass starts. Watching the document for a moment tells
   * the two cases apart: a page that has finished rendering starts at once,
   * while an app that is still painting its first screen keeps waiting - up to
   * the cap the flat delay used to be.
   */
  function startWhenSettled() {
    const beganAt = Date.now();
    let lastChangeAt = beganAt;
    const observer = new MutationObserver(() => {
      lastChangeAt = Date.now();
    });
    try {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (error) {
      /* nothing to watch: the tick below still ends at the cap */
    }
    const tick = () => {
      const elapsed = Date.now() - beganAt;
      if (elapsed >= START_MAX_MS || (elapsed >= START_MIN_MS && Date.now() - lastChangeAt >= START_QUIET_MS)) {
        observer.disconnect();
        runPageTranslation({ auto: true });
        return;
      }
      setTimeout(tick, 50);
    };
    setTimeout(tick, START_MIN_MS);
  }

  /*
   * Late content, step by step. Only added element/text nodes count, and a
   * rewrite of a text node is a characterData change - which this observer
   * never watches. The translation therefore cannot trigger itself.
   */
  function hasNewContent(records) {
    for (const record of records) {
      for (const node of record.addedNodes) {
        const type = node.nodeType;
        if (type !== 1 && type !== 3) continue;
        const text = String(type === 3 ? node.nodeValue : node.textContent || '').trim();
        if (text.length > 1) return true;
      }
    }
    return false;
  }

  /* One word on <html> saying what the catch-up pass decided last. Visible from
   * the page's own world, so a test can tell "no new content" from "gave up". */
  function noteState(value) {
    try {
      document.documentElement.setAttribute('data-codex-translate-state', value);
    } catch (error) {
      /* the document is going away */
    }
  }

  function scheduleRerun() {
    if (rerunCount >= RERUN_LIMIT) return;
    noteState('queued');
    if (rerunTimer) clearTimeout(rerunTimer);
    rerunTimer = setTimeout(() => {
      rerunTimer = null;
      maybeRerun();
    }, RERUN_DEBOUNCE_MS);
  }

  function maybeRerun() {
    if (rerunCount >= RERUN_LIMIT) return noteState('skip:limit');
    if (!settings || settings.autoTranslateAll === false) return noteState('skip:off');
    if (blocked()) return noteState('skip:blocked');
    if (document.hidden) return noteState('skip:hidden');
    if (pageRun && !pageRun.finished) {
      noteState('skip:busy');
      scheduleRerun();
      return;
    }
    if (Date.now() - lastRunAt < RERUN_COOLDOWN_MS) {
      noteState('skip:cooldown');
      scheduleRerun();
      return;
    }
    // Translated blocks carry a mark and collectUnits skips marked blocks, so
    // this asks only for what is genuinely new. Nothing to do means no pass.
    if (!collectUnits().length) return noteState('skip:nothing');
    rerunCount++;
    noteState('running');
    runPageTranslation({ auto: true, quiet: true });
  }

  function watchNewContent() {
    if (contentObserver || !document.body) return;
    contentObserver = new MutationObserver((records) => {
      if (!hasNewContent(records)) return;
      noteState('mutation');
      scheduleRerun();
    });
    contentObserver.observe(document.body, { childList: true, subtree: true });
  }

  async function run(text) {
    const value = String(text || '').trim();
    if (!value) return;
    const selection = currentSelection();
    const range = (current && current.range) || (selection && selection.range) || null;
    const rect = range ? rectForRange(range) : { top: 80, bottom: 80, left: 40 };
    current = { text: value, range };

    const token = ++requestToken;
    renderLoading(rect);
    const response = await chrome.runtime
      .sendMessage({ type: 'translate:batch', texts: [value] })
      .catch((error) => ({ ok: false, error: String(error && error.message) }));
    if (token !== requestToken) return;

    if (response && response.ok && Array.isArray(response.translations) && response.translations.length) {
      renderBubble(rect, value, response.translations[0], range);
    } else {
      renderError(rect, (response && response.error) || '未知错误');
    }
  }

  function onSelectionSettled() {
    if (blocked()) return;
    const selection = currentSelection();
    if (!selection) {
      if (current) clear();
      return;
    }
    const rect = rectForRange(selection.range);
    current = { text: selection.text, range: selection.range };
    if (settings && settings.autoTranslateSelection === false) renderChip(rect);
    else run(selection.text);
  }

  let settleTimer = null;
  let ignoreSelectionUntil = 0;

  function pointerInsideHost(event) {
    try {
      return Boolean(host && event.composedPath && event.composedPath().includes(host));
    } catch (error) {
      return false;
    }
  }

  function scheduleSelectionCheck() {
    if (Date.now() < ignoreSelectionUntil) return;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (Date.now() < ignoreSelectionUntil) return;
      onSelectionSettled();
    }, 180);
  }

  document.addEventListener('mousedown', (event) => {
    if (pointerInsideHost(event)) {
      // Clicking our own button collapses the selection. Without this the next
      // selection check would read an empty selection and tear the bubble down
      // the moment any button is used.
      ignoreSelectionUntil = Date.now() + 900;
      return;
    }
    clear();
  }, true);

  document.addEventListener('mouseup', (event) => {
    if (pointerInsideHost(event)) {
      ignoreSelectionUntil = Date.now() + 900;
      return;
    }
    scheduleSelectionCheck();
  }, true);

  document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') {
      clear();
      return;
    }
    if (event.shiftKey || event.key === 'a' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      scheduleSelectionCheck();
    }
  }, true);

  window.addEventListener('scroll', () => {
    if (current && host) clear();
  }, { passive: true });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== 'object') return false;
    if (message.type === 'translate:translate-page') {
      runPageTranslation({ manual: true, force: true });
      return false;
    }
    if (message.type === 'translate:restore-page') {
      restorePage();
      return false;
    }
    if (message.type !== 'translate:show-bubble') return false;
    const text = String(message.text || '').trim();
    if (!text) return false;
    const selection = currentSelection();
    current = { text, range: selection ? selection.range : null };
    run(text);
    return false;
  });

  chrome.runtime
    .sendMessage({ type: 'translate:get-settings' })
    .then((reply) => {
      settings = reply && reply.settings ? reply.settings : null;
      // Rendering after this point is picked up as it happens: an in-page tab
      // switch renders a new screen instead of loading a new document.
      watchNewContent();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        // A fresh visit gets a fresh budget for catch-up passes.
        rerunCount = 0;
        scheduleRerun();
      });
      // Whole-page translation is on by default for every site; the block list
      // is only there to carve out exceptions.
      if (settings && settings.autoTranslateAll !== false && !blocked()) {
        startWhenSettled();
      }
    })
    .catch(() => {
      settings = null;
    });

  // The settings page writes straight to storage, so a change made there has to
  // reach this copy without a page reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    settings = changes[SETTINGS_KEY].newValue || settings;
  });

  // Visible from the page's own world, so the load can be confirmed from
  // DevTools or an automated check without digging into isolated worlds.
  document.documentElement.setAttribute('data-codex-translate', 'ready');
})();
