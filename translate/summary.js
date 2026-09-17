/*
 * Whole-page summary ("总结全文" in the right-click menu).
 *
 * Ported in spirit from the reference extension: find the article in the page -
 * not the nav, not the sidebar, not the comments - hand it to the model, and
 * show what comes back. Extraction is that extension's three-step ladder:
 * semantic tags, then a scored search for the densest run of paragraphs, then
 * every paragraph that looks like prose.
 *
 * Nothing here writes to the page: the panel lives in its own shadow root, the
 * way the translation pill and the subtitle bar already do.
 */

(() => {
  if (window.__codexSummaryLoaded) return;
  window.__codexSummaryLoaded = true;

  const HOST_ID = 'codex-summary-page';
  const MAX_CHARS = 12000;
  const MIN_ARTICLE_CHARS = 200;

  let host = null;
  let shadow = null;
  let running = false;
  let token = 0;

  /* ------------------------------------------------------------- styling */

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .panel {
      position: fixed; top: 16px; right: 16px; z-index: 2147483646;
      width: 420px; max-width: calc(100vw - 32px); max-height: 74vh;
      display: flex; flex-direction: column;
      font: 13px/1.65 -apple-system, "Segoe UI", "Noto Sans SC", system-ui, sans-serif;
      letter-spacing: 0; color: #ececec;
      background: #212121; border: 1px solid rgba(255,255,255,.14); border-radius: 12px;
      box-shadow: 0 14px 34px rgba(0,0,0,.5); overflow: hidden;
    }
    .hd {
      display: flex; align-items: center; gap: 8px; flex: none;
      padding: 9px 10px 9px 12px; border-bottom: 1px solid rgba(255,255,255,.08);
      font-size: 12px; color: #a3a3a3;
    }
    .hd .title { flex: 1; }
    .iconbtn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border: 0; border-radius: 6px; padding: 0;
      background: transparent; color: #a3a3a3; cursor: pointer;
    }
    .iconbtn:hover { background: #2f2f2f; color: #ececec; }
    .iconbtn svg { width: 15px; height: 15px; stroke: currentColor; fill: none;
      stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .bd { padding: 12px; overflow: auto; word-break: break-word; }
    .bd p { margin: 0 0 8px; }
    .bd p:last-child { margin-bottom: 0; }
    .bd h1, .bd h2, .bd h3 { margin: 14px 0 6px; font-size: 13.5px; font-weight: 600; }
    .bd h1:first-child, .bd h2:first-child, .bd h3:first-child { margin-top: 0; }
    .bd ul, .bd ol { margin: 0 0 8px; padding-left: 18px; }
    .bd li { margin: 2px 0; }
    .bd code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
      background: #2c2c2c; border-radius: 4px; padding: 1px 4px;
    }
    .bd .note { margin-top: 10px; color: #8a8a8a; font-size: 12px; }
    .bd.error { color: #c9a227; }
    .bd .hint { display: block; margin-top: 6px; color: #8a8a8a; font-size: 12px; }
    .sk { height: 9px; border-radius: 4px; background: #2c2c2c; margin: 8px 0; }
    .sk:first-child { margin-top: 0; }
  `;

  const ICON = {
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>',
  };

  /* ----------------------------------------------------------- extraction */

  /*
   * Areas that are never the article. Short keys are compared against whole
   * class tokens (so "ad" does not fire on "gradient"), longer ones anywhere in
   * the name ("sidebar", "navigation", "pagination").
   */
  const NOISE_KEYS = [
    'nav', 'navigation', 'menu', 'sidebar', 'aside', 'footer', 'header',
    'comment', 'comments', 'reply', 'discuss', 'review',
    'recommend', 'related', 'similar', 'popular', 'trending', 'hot',
    'ad', 'ads', 'advert', 'banner', 'promo', 'sponsor',
    'share', 'social', 'follow', 'subscribe',
    'search', 'filter', 'sort', 'tag', 'tags', 'label', 'breadcrumb', 'pagination', 'pager',
    'modal', 'popup', 'dialog', 'overlay', 'toast', 'tooltip',
    'widget', 'plugin', 'disclaimer', 'copyright', 'license', 'terms', 'cookie',
    'toc', 'outline', 'catalog', 'directory',
  ];

  /* Boilerplate that survives the block filter because it sits inside the
   * article itself. Patterns are the reference extension's. */
  const NOISE_TEXT = [
    /风险提示[：:][\s\S]{0,200}/gi,
    /免责声明[：:][\s\S]{0,300}/gi,
    /免责条款[\s\S]{0,200}/gi,
    /(投资|股市)有风险[\s\S]{0,100}/gi,
    /仅供参考[\s\S]{0,100}/gi,
    /不构成[\s\S]{0,50}(建议|意见)/gi,
    /版权所有[\s\S]{0,100}/gi,
    /未经授权[\s\S]{0,100}/gi,
    /转载请注明[\s\S]{0,100}/gi,
    /不代表[\s\S]{0,30}(平台|本站|作者)观点/gi,
    /分享到[\s\S]{0,20}/gi,
    /关注我们[\s\S]{0,30}/gi,
    /扫码下载[\s\S]{0,30}/gi,
    /点击查看更多/gi,
  ];

  const NOISE_LINE = [
    /^分享到/, /^转发/, /^评论/, /^点赞/, /^收藏/,
    /^上一篇/, /^下一篇/, /^相关(文章|阅读|推荐)/, /^推荐阅读/,
    /^热门/, /^最新/, /^点击查看/, /^点击阅读/,
    /^免责声明/, /^风险提示/, /^版权所有/, /^关注我们/, /^扫码/, /^下载APP/,
    /^Sign in$/i, /^Log in$/i, /^Subscribe$/i, /^Share$/i, /^Advertisement$/i,
  ];

  const SEMANTIC_SELECTORS = [
    'article', '[role="article"]', 'main article',
    '.article-content', '.post-content', '.entry-content', '.content-body',
    '.article-body', '.post-body', '.post-text', '.news-content', '.detail-content',
    '.markdown-body', '.reader-content', '.rich_media_content',
    '#article-content', '#post-content', '#content-body', '#js_content',
  ];

  function namesOf(element) {
    return [
      typeof element.className === 'string' ? element.className : '',
      element.id || '',
      Object.keys(element.dataset || {}).join(' '),
      (element.getAttribute && element.getAttribute('role')) || '',
    ]
      .join(' ')
      .toLowerCase();
  }

  function looksLikeFurniture(element) {
    const raw = namesOf(element);
    if (!raw.trim()) return false;
    const tokens = raw.split(/[\s_\-.:|/]+/).filter(Boolean);
    for (const key of NOISE_KEYS) {
      if (key.length >= 5 ? raw.includes(key) : tokens.includes(key)) return true;
    }
    return false;
  }

  function hidden(element) {
    try {
      const style = getComputedStyle(element);
      return style.display === 'none' || style.visibility === 'hidden';
    } catch (error) {
      return false;
    }
  }

  function linkDensity(element) {
    const text = String(element.innerText || '');
    if (!text.length) return 1;
    return Math.min(sumLinkText(element) / text.length, 1);
  }
  /* Defined after its only caller on purpose: the ratio above reads better as
   * the main idea, and hoisting makes the order irrelevant. */
  function sumLinkText(element) {
    let links = 0;
    element.querySelectorAll('a').forEach((anchor) => {
      links += String(anchor.innerText || '').trim().length;
    });
    return links;
  }

  /*
   * Is this node inside something that is furniture? Walks up a few levels,
   * which is what catches a paragraph inside <div class="comments"> without
   * walking all the way to <body> and calling an article part of the page
   * header because one of its wrappers happens to be named that way.
   */
  function insideFurniture(node, root) {
    let current = node;
    let depth = 0;
    while (current && current !== root && current !== document.body && depth < 3) {
      if (looksLikeFurniture(current)) return true;
      current = current.parentElement;
      depth++;
    }
    return false;
  }

  /*
   * A block nobody wants summarised: furniture by name, furniture by shape (a
   * list of links) or furniture by position (inside one of those).
   */
  function skipBlock(element) {
    if (!element || element === document.body) return false;
    if (looksLikeFurniture(element)) return true;
    if (element.tagName !== 'ARTICLE' && insideFurniture(element.parentElement, document.body)) return true;
    const links = element.querySelectorAll('a');
    const text = String(element.innerText || '');
    if (links.length > 20 && text && text.length / links.length < 20) return true;
    return false;
  }

  /*
   * The readable text of a block, in order, with the furniture inside it left
   * out. Taken from the block's own text nodes rather than its innerText
   * because a container's innerText happily includes the sidebar sitting
   * inside it - which is how a summary ends up describing "related reading".
   */
  function blockText(element) {
    const parts = [];
    element.querySelectorAll('h1, h2, h3, h4, h5, p, blockquote, li, figcaption, td').forEach((node) => {
      if (hidden(node) || insideFurniture(node, element)) return;
      const text = String(node.innerText || '').trim().replace(/\s+/g, ' ');
      if (text.length < 12) return;
      /* A list item that contains a paragraph, or a cell that contains both,
       * would otherwise be counted twice. */
      if (parts.some((item) => item.includes(text) || text.includes(item))) return;
      parts.push(text);
    });
    return parts.join('\n\n');
  }

  function cleanText(text) {
    return String(text || '')
      .replace(/[\u00A0\u2000-\u200B\u3000]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim();
  }

  function filterText(text) {
    let out = String(text || '');
    NOISE_TEXT.forEach((pattern) => {
      out = out.replace(pattern, '');
    });
    return cleanText(out.replace(/\n{3,}/g, '\n\n'));
  }

  function paragraphText() {
    const parts = [];
    document.querySelectorAll('p').forEach((paragraph) => {
      if (skipBlock(paragraph) || hidden(paragraph)) return;
      const text = String(paragraph.innerText || '').trim();
      if (text.length <= 30) return;
      if (NOISE_LINE.some((pattern) => pattern.test(text))) return;
      parts.push(text);
    });
    return parts.join('\n\n');
  }

  function semanticText() {
    for (const selector of SEMANTIC_SELECTORS) {
      let element = null;
      try {
        element = document.querySelector(selector);
      } catch (error) {
        continue;
      }
      if (!element || skipBlock(element) || hidden(element)) continue;
      const text = blockText(element);
      if (text.length > MIN_ARTICLE_CHARS) return text;
      /* Nothing tagged as prose inside it: a layout of plain divs is still
       * better than nothing. */
      const raw = String(element.innerText || '').trim();
      if (raw.length > MIN_ARTICLE_CHARS && text.length < MIN_ARTICLE_CHARS) return raw;
    }
    return '';
  }

  /*
   * The scored search: the densest run of real paragraphs wins. The weights are
   * the reference extension's, and they behave - many paragraphs beat one long
   * line, link-heavy blocks are pushed down, a couple of images is normal for
   * an article.
   */
  function scoredText() {
    const candidates = [];
    document.querySelectorAll('div, section, article, main, [role="article"]').forEach((element) => {
      if (skipBlock(element) || hidden(element)) return;
      const text = blockText(element);
      if (text.length < 120) return;
      const paragraphs = Array.from(element.querySelectorAll('p')).filter((item) => {
        return !insideFurniture(item, element) && String(item.innerText || '').trim().length > 20;
      });
      if (!paragraphs.length) return;
      const density = text.length ? Math.min(sumLinkText(element) / text.length, 1) : 1;
      if (density > 0.5) return;
      const textLength = paragraphs.reduce((sum, item) => sum + String(item.innerText || '').trim().length, 0);
      const images = Math.min(element.querySelectorAll('img').length / 10, 1);
      const score = paragraphs.length * 100 + textLength * 0.1 + (1 - density) * 500 + images * 50;
      if (score > 100) candidates.push({ element, text, score });
    });
    if (!candidates.length) return '';
    candidates.sort((first, second) => second.score - first.score);
    /*
     * Paginated articles show up as two or three blocks with similar scores;
     * anything far behind the best is a different part of the page. A parent
     * that contains an already chosen block adds nothing - its text is the
     * child's, again.
     */
    const kept = [];
    candidates
      .filter((item) => item.score > candidates[0].score * 0.6)
      .slice(0, 3)
      .forEach((item) => {
        if (kept.some((other) => other.element.contains(item.element) || other.text === item.text)) return;
        kept.push(item);
      });
    return kept.length > 1 ? kept.map((item) => item.text).join('\n\n') : candidates[0].text;
  }

  /*
   * What will be summarised, plus where it came from - the source is what makes
   * a wrong extraction diagnosable instead of mysterious.
   */
  function articleText() {
    const semantic = semanticText();
    if (semantic) return { text: filterText(semantic), source: 'semantic' };
    const scored = scoredText();
    if (scored && scored.length >= MIN_ARTICLE_CHARS) {
      return { text: filterText(scored), source: 'scored' };
    }
    const paragraphs = paragraphText();
    if (paragraphs.length >= MIN_ARTICLE_CHARS) {
      return { text: filterText(paragraphs), source: 'paragraphs' };
    }
    const body = String((document.body && document.body.innerText) || '');
    return { text: filterText(body), source: body ? 'body' : 'none' };
  }

  /* -------------------------------------------------------------- render */

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all: initial; position: static;';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
  }

  function close() {
    if (host) host.remove();
    host = null;
    shadow = null;
  }

  function iconButton(name, label, onClick) {
    const button = document.createElement('button');
    button.className = 'iconbtn';
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = ICON[name];
    button.addEventListener('click', onClick);
    return button;
  }

  /*
   * Markdown, as much of it as a summary uses: headings, bold, inline code,
   * bullet and numbered lists. Built out of DOM nodes, never HTML - the text
   * comes from a model, and a summary must not be able to become a script tag.
   */
  function inline(text, parent) {
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let rest = String(text || '');
    let match = pattern.exec(rest);
    while (match) {
      if (match.index > 0) parent.appendChild(document.createTextNode(rest.slice(0, match.index)));
      const piece = match[0];
      if (piece.startsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = piece.slice(2, -2);
        parent.appendChild(strong);
      } else {
        const code = document.createElement('code');
        code.textContent = piece.slice(1, -1);
        parent.appendChild(code);
      }
      rest = rest.slice(match.index + piece.length);
      match = pattern.exec(rest);
    }
    if (rest) parent.appendChild(document.createTextNode(rest));
  }

  function renderMarkdown(container, text) {
    let list = null;
    String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .forEach((line) => {
        const value = line.trim();
        if (!value) {
          list = null;
          return;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(value);
        if (heading) {
          const node = document.createElement('h' + Math.min(heading[1].length, 3));
          inline(heading[2], node);
          container.appendChild(node);
          list = null;
          return;
        }
        const bullet = /^[-*+]\s+(.*)$/.exec(value);
        const numbered = /^\d+[.)]\s+(.*)$/.exec(value);
        if (bullet || numbered) {
          const wanted = bullet ? 'UL' : 'OL';
          if (!list || list.tagName !== wanted) {
            list = document.createElement(bullet ? 'ul' : 'ol');
            container.appendChild(list);
          }
          const item = document.createElement('li');
          inline((bullet || numbered)[1], item);
          list.appendChild(item);
          return;
        }
        const paragraph = document.createElement('p');
        inline(value, paragraph);
        container.appendChild(paragraph);
        list = null;
      });
  }

  function render(state) {
    ensureHost();
    shadow.querySelectorAll('.panel').forEach((node) => node.remove());
    const panel = document.createElement('div');
    panel.className = 'panel';

    const head = document.createElement('div');
    head.className = 'hd';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = state.title || '总结';
    head.appendChild(title);

    if (state.state === 'done') {
      const copy = iconButton('copy', '复制', async () => {
        try {
          await navigator.clipboard.writeText(state.text || '');
          copy.innerHTML = ICON.check;
          window.setTimeout(() => {
            copy.innerHTML = ICON.copy;
          }, 1400);
        } catch (error) {
          /* clipboard blocked: the text is on screen anyway */
        }
      });
      head.appendChild(copy);
    }
    head.appendChild(iconButton('close', '关闭', close));
    panel.appendChild(head);

    const body = document.createElement('div');
    body.className = 'bd' + (state.state === 'error' ? ' error' : '');

    if (state.state === 'loading') {
      body.innerHTML =
        '<div class="sk" style="width:92%"></div><div class="sk" style="width:80%"></div>' +
        '<div class="sk" style="width:64%"></div><div class="sk" style="width:72%"></div>';
    } else if (state.state === 'error') {
      body.appendChild(document.createTextNode('总结失败'));
      if (state.text) {
        const hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = state.text;
        body.appendChild(hint);
      }
    } else {
      renderMarkdown(body, state.text);
      if (state.note) {
        const note = document.createElement('div');
        note.className = 'note';
        note.textContent = state.note;
        body.appendChild(note);
      }
    }

    panel.appendChild(body);
    shadow.appendChild(panel);
    return panel;
  }

  /* ---------------------------------------------------------------- flow */

  async function summarize(note) {
    if (running) return;
    running = true;
    const mine = ++token;
    try {
      render({ state: 'loading', title: '正在总结…' });
      const found = articleText();
      if (!found.text || found.text.length < MIN_ARTICLE_CHARS / 4) {
        render({ state: 'error', title: '总结', text: '没有提取到正文，换个页面试试' });
        return;
      }
      const clipped = found.text.length > MAX_CHARS ? found.text.slice(0, MAX_CHARS) : found.text;
      const reply = await chrome.runtime
        .sendMessage({ type: 'translate:summarize', text: clipped })
        .catch((error) => ({ ok: false, error: String((error && error.message) || error) }));
      if (mine !== token) return;
      if (!reply || !reply.ok) {
        render({ state: 'error', title: '总结', text: (reply && reply.error) || '未知错误' });
        return;
      }
      render({
        state: 'done',
        title: '总结',
        text: reply.text,
        note: [note, found.text.length > MAX_CHARS ? '正文较长，只取了前 ' + MAX_CHARS + ' 字' : '']
          .filter(Boolean)
          .join(' · '),
      });
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;
    /* An already-open tab has no content script after the extension is
     * reloaded, and the menu has no way to tell. This is how it finds out, and
     * how it gets the article without drawing anything. */
    if (message.type === 'translate:ping') {
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'translate:extract-page') {
      const found = articleText();
      sendResponse({
        ok: Boolean(found.text),
        text: found.text.slice(0, MAX_CHARS),
        source: found.source,
        title: document.title || '',
        url: location.href,
      });
      return true;
    }
    if (message.type === 'translate:summarize-page') {
      summarize(message.note);
      return false;
    }
    /* The menu opens the side panel to do the summarising there. This is the
     * page saying "working on it" in the meantime, and then clearing itself
     * once the panel has taken the text. */
    if (message.type === 'translate:summary-wait') {
      render({ state: 'loading', title: '正在交给侧边栏…' });
      return false;
    }
    if (message.type === 'translate:summary-panel-ok') {
      close();
      return false;
    }
    return false;
  });

  /* Visible from the page's own world, next to the translation flag, so the
   * load can be confirmed without digging into isolated worlds. */
  document.documentElement.setAttribute('data-codex-summary', 'ready');
})();
