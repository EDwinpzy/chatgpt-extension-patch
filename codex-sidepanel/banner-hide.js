/*
 * Codex browser-extension (Edge "ChatGPT") upsell-banner suppressor.
 *
 * Same method as the Codex desktop fix: the usage data is left untouched and
 * only the banner element is hidden in the DOM. The side panel renders that
 * banner from the JSON returned by GET https://chatgpt.com/backend-api/wham/usage,
 * so hiding it in the DOM keeps the usage meter and rate-limit behaviour honest.
 *
 * This file is loaded by codex-sidepanel/index.html in the patched extension.
 *
 * Design notes carried over from the desktop hook:
 *   - Never call getBoundingClientRect()/getComputedStyle() in a loop.
 *   - Detect with XPath (native, layout-free) and hide in the same microtask.
 *   - Install a CSS rule for the banner container, because React re-renders the
 *     banner and would otherwise reset the inline style.
 *
 * Switch:
 *   STRIP_UPSELL - also drop rate_limit_upsell from /wham/usage responses.
 *                  Off by default: the DOM hide alone is enough and the app
 *                  keeps receiving its real data.
 */

(() => {
  'use strict';

  const STRIP_UPSELL = false;

  const TITLES = [
    'You\u2019re out of Codex messages',
    "You're out of Codex messages",
    'You\u2019re out of Codex and Work usage',
    "You're out of Codex and Work usage",
    "You've reached your Codex usage limit.",
    'Codex \u548c\u5de5\u4f5c\u4f7f\u7528\u989d\u5ea6\u5df2\u7528\u5b8c',
    '\u4f60\u7684 Codex \u548c\u5de5\u4f5c\u4f7f\u7528\u989d\u5ea6\u5df2\u7528\u5b8c'
  ];
  const HINTS = ['out of Codex', 'rate limit resets', 'usage limit', '\u5df2\u7528\u5b8c'];
  const CTAS = ['Add Credits', 'Add credits', 'Upgrade', '\u6dfb\u52a0\u989d\u5ea6', '\u5347\u7ea7'];
  // Body copy used as a second anchor, for variants whose heading differs.
  const DESCRIPTION_PATTERNS = [
    ['rate limit resets', 'add credits'],
    ['rate limit resets', 'upgrade'],
    ['\u6dfb\u52a0\u989d\u5ea6', '\u91cd\u7f6e']
  ];

  const STYLE_ID = 'codex-upsell-banner-style';
  const MAX_CONTAINER_TEXT = 320;
  const MAX_UP_LEVELS = 8;
  const MAX_FALLBACK_SCAN = 400;
  const BURST_DELAYS = [300, 800, 1500, 3000, 6000, 12000, 20000, 30000];

  const hidden = new Set();
  const installedRules = new Set();
  let lastSignature = '';
  let started = false;

  function textOf(el) {
    return el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function describe(el) {
    if (!el || !el.tagName) return '?';
    let name = el.tagName.toLowerCase();
    const cls = el.getAttribute && el.getAttribute('class');
    if (cls) name += '.' + cls.split(/\s+/).slice(0, 4).join('.');
    return name;
  }

  function hasHeading(el) {
    try {
      return el.querySelector('h1, h2, h3, h4, h5, h6') !== null;
    } catch (error) {
      return false;
    }
  }

  function hasInput(el) {
    try {
      return el.querySelector('textarea, input, [contenteditable]') !== null;
    } catch (error) {
      return false;
    }
  }

  function hasCta(el) {
    let nodes;
    try {
      nodes = el.querySelectorAll('button, [role="button"], a[href]');
    } catch (error) {
      nodes = [];
    }
    for (const node of nodes) {
      const text = textOf(node);
      if (!text || text.length > 24) continue;
      for (const cta of CTAS) {
        if (text.indexOf(cta) !== -1) return true;
      }
    }
    // Some design-system buttons render as plain elements; accept those only on
    // an exact label match so chat text quoting the banner cannot match.
    try {
      nodes = el.querySelectorAll('*');
    } catch (error) {
      nodes = [];
    }
    let scanned = 0;
    for (const node of nodes) {
      scanned += 1;
      if (scanned > MAX_FALLBACK_SCAN) break;
      if (node.children.length > 0) continue;
      const text = textOf(node);
      if (!text || text.length > 24) continue;
      for (const cta of CTAS) {
        if (text === cta) return true;
      }
    }
    return false;
  }

  function acceptsContainer(el) {
    if (hasInput(el)) return false;
    if (textOf(el).length > MAX_CONTAINER_TEXT) return false;
    if (hasCta(el)) return true;
    // Plain-element buttons: only accepted together with a heading, so chat text
    // that merely quotes the banner can never match.
    return hasHeading(el) && hasCta(el);
  }

  // Native XPath: no layout, no walking the whole DOM in JS.
  function findTitleElements() {
    const found = [];
    if (!document.body) return found;
    const quoted = (value) => '"' + String(value).replace(/"/g, '&quot;') + '"';
    const clauses = TITLES.map((title) => 'contains(., ' + quoted(title) + ')');
    for (const pattern of DESCRIPTION_PATTERNS) {
      clauses.push('(' + pattern.map((word) => 'contains(., ' + quoted(word) + ')').join(' and ') + ')');
    }
    const expression = '//*[text()[' + clauses.join(' or ') + ']]';

    let snapshot = null;
    try {
      snapshot = document.evaluate(
        expression,
        document.body,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
    } catch (error) {
      snapshot = null;
    }
    if (snapshot) {
      for (let i = 0; i < snapshot.snapshotLength; i++) {
        const element = snapshot.snapshotItem(i);
        if (!element) continue;
        const text = textOf(element);
        let label = 'description-match';
        for (const candidate of TITLES) {
          if (text.indexOf(candidate) !== -1) {
            label = candidate;
            break;
          }
        }
        found.push({ element: element, title: label });
      }
      return found;
    }

    // Fallback for environments without XPath.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue;
      if (!value || !node.parentElement) continue;
      for (const title of TITLES) {
        if (value.indexOf(title) !== -1) {
          found.push({ element: node.parentElement, title: title });
          break;
        }
      }
    }
    return found;
  }

  // Innermost box carrying a CTA and no input field: that is the banner. Chat
  // paragraphs quoting the text have no button.
  function pickContainer(seed) {
    const chain = [];
    let node = seed;
    for (let level = 0; level < MAX_UP_LEVELS && node && node !== document.body; level++) {
      chain.push(describe(node));
      if (acceptsContainer(node)) {
        return { container: node, chain: chain.join(' < ') };
      }
      node = node.parentElement;
    }
    return { container: null, chain: chain.join(' < ') };
  }

  // The banner box sits inside a wrapper that also draws the icon and the
  // rounded background, so that wrapper has to go too. Only ancestors that add
  // no other text and contain no input are eligible.
  function expandContainer(container) {
    const limit = textOf(container).length + 8;
    let node = container.parentElement;
    let best = container;
    for (let level = 0; level < 3 && node && node !== document.body; level++) {
      if (hasInput(node)) break;
      if (textOf(node).length > limit) break;
      best = node;
      node = node.parentElement;
    }
    return best;
  }

  function cssEscape(value) {
    try {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    } catch (error) {
      /* manual fallback below */
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
  }

  // A stylesheet rule survives React re-renders, so it is installed only once
  // and only when the derived selector provably matches just that one element.
  function installCssRule(el) {
    try {
      if (!el || el.nodeType !== 1) return '';
      const tag = el.tagName.toLowerCase();
      if (tag === 'body' || tag === 'html') return '';
      const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      if (classes.length === 0) return '';
      let selector = tag;
      for (const name of classes) selector += '.' + cssEscape(name);
      selector += ':has(h1, h2, h3, h4, h5, h6):has(button, [role="button"], a[href])';
      if (installedRules.has(selector)) return selector;
      const matches = document.querySelectorAll(selector);
      if (matches.length !== 1 || matches[0] !== el) return '';
      const style = document.createElement('style');
      style.id = STYLE_ID + '-' + installedRules.size;
      style.textContent = selector + ' { display: none !important; }';
      (document.head || document.documentElement).appendChild(style);
      installedRules.add(selector);
      return selector;
    } catch (error) {
      return '';
    }
  }

  function hideElement(el) {
    hidden.add(el);
    if (el.getAttribute('data-codex-banner-hidden') !== '1') {
      el.setAttribute('data-codex-banner-hidden', '1');
    }
    if (el.style.display !== 'none') el.style.setProperty('display', 'none', 'important');
  }

  function reapplyHidden() {
    hidden.forEach((el) => {
      if (!el || el.isConnected === false) {
        hidden.delete(el);
        return;
      }
      if (el.style.display !== 'none') el.style.setProperty('display', 'none', 'important');
    });
  }

  function textMatchesHint(text) {
    if (!text) return false;
    for (const hint of HINTS) {
      if (text.indexOf(hint) !== -1) return true;
    }
    return false;
  }

  function run() {
    const result = { hid: 0, titles: [], chains: [], cssRules: [], sample: '', error: null };
    try {
      for (const seed of findTitleElements()) {
        result.titles.push(seed.title);
        const picked = pickContainer(seed.element);
        result.chains.push(picked.chain);
        if (!picked.container) continue;
        const outer = expandContainer(picked.container);
        if (outer.getAttribute('data-codex-banner-hidden') === '1') {
          reapplyHidden();
          continue;
        }
        hideElement(picked.container);
        if (outer !== picked.container) hideElement(outer);
        const rule = installCssRule(picked.container) || installCssRule(outer);
        if (rule) result.cssRules.push(rule);
        result.hid += 1;
        if (!result.sample) result.sample = outer.outerHTML.slice(0, 400);
      }
      return result;
    } catch (error) {
      result.error = String((error && error.message) || error);
      return result;
    }
  }

  function report(result) {
    try {
      const signature =
        (result.error ? 'error:' + result.error : '') +
        '|' + result.hid +
        '|' + result.titles.join(',') +
        '|' + result.cssRules.join(',');
      if (signature === lastSignature) return;
      lastSignature = signature;
      console.log('[codex-upsell-banner] ' + JSON.stringify({
        hid: result.hid,
        titles: result.titles,
        chains: result.chains,
        cssRules: result.cssRules,
        sample: result.sample,
        error: result.error
      }));
    } catch (error) {
      /* reporting is best-effort */
    }
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    const flush = () => {
      scheduled = false;
      report(run());
    };
    try {
      Promise.resolve().then(flush);
    } catch (error) {
      flush();
    }
  }

  function stripUpsellFromResponses() {
    const originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') return;
    if (originalFetch.__codexUpsellStripped === true) return;
    const patched = function (input, init) {
      const url = typeof input === 'string' ? input : input && input.url ? String(input.url) : '';
      const result = originalFetch.apply(this, arguments);
      if (url.indexOf('/wham/usage') === -1) return result;
      return result.then((response) =>
        response
          .clone()
          .text()
          .then((body) => {
            let data;
            try {
              data = JSON.parse(body);
            } catch (error) {
              return response;
            }
            if (!data || typeof data !== 'object') return response;
            if (!('rate_limit_upsell' in data) && !('model_picker_upsell' in data)) return response;
            delete data.rate_limit_upsell;
            delete data.model_picker_upsell;
            return new Response(JSON.stringify(data), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          })
          .catch(() => response)
      );
    };
    patched.__codexUpsellStripped = true;
    try {
      window.fetch = patched;
    } catch (error) {
      /* assignment refused; DOM hiding still applies */
    }
  }

  function start() {
    if (started) return;
    started = true;

    if (STRIP_UPSELL) stripUpsellFromResponses();

    let burstStep = 0;
    function scheduleBurst() {
      if (installedRules.size > 0) return;
      if (burstStep >= BURST_DELAYS.length) return;
      const delay = BURST_DELAYS[burstStep];
      burstStep += 1;
      setTimeout(() => {
        reapplyHidden();
        if (installedRules.size > 0) return;
        report(run());
        scheduleBurst();
      }, delay);
    }

    try {
      // childList only: attribute churn is handled by the cheap reapply pass and
      // by the installed stylesheet. Large inserted subtrees (opening a thread
      // re-inserts the whole message list) are skipped before reading text.
      new MutationObserver((mutations) => {
        reapplyHidden();
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            const element = node.nodeType === 1 ? node : node.parentElement;
            if (!element) continue;
            if (element.children && element.children.length > 40) continue;
            const text = node.nodeType === 3 ? node.nodeValue || '' : element.textContent || '';
            if (!textMatchesHint(text)) continue;
            scheduleApply();
            return;
          }
        }
      }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style']
      });
    } catch (error) {
      /* observer is best-effort */
    }

    report(run());
    scheduleBurst();
  }

  window.__codexUpsellBannerHider = () => report(run());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
