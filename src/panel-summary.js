/* 总结全文, panel side: take the article the menu extracted, type it into the
 * chat composer and send it, so the summary comes from the conversation. */

(() => {
  'use strict';

  if (window.__codexPanelSummaryLoaded) return;
  window.__codexPanelSummaryLoaded = true;

  const REQUEST_KEY = 'codexSummaryRequest';
  const RESULT_KEY = 'codexSummaryResult';
  const REQUEST_MAX_AGE_MS = 120000;
  const COMPOSER_WAIT_MS = 20000;

  /* One request is handled once, even if the panel reloads mid-flight. */
  let handled = 0;

  function report(ok, reason) {
    chrome.storage.local
      .set({ [RESULT_KEY]: { at: Date.now(), ok, reason: reason || '' } })
      .catch(() => {});
  }

  function visible(node) {
    return Boolean(node && (node.getClientRects().length || node.offsetParent));
  }

  /*
   * The composer belongs to the host extension's own app, and it only renders
   * once the local app server is up, so the shape cannot be assumed: these are
   * the usual composer elements, in the order they tend to be found.
   */
  function findComposer() {
    const selectors = [
      'textarea',
      '[contenteditable="true"][role="textbox"]',
      '[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"]',
      'form textarea',
    ];
    for (const selector of selectors) {
      let nodes = [];
      try {
        nodes = Array.from(document.querySelectorAll(selector));
      } catch (error) {
        continue;
      }
      const hit = nodes.find(visible);
      if (hit) return hit;
    }
    return null;
  }

  async function waitForComposer(deadline) {
    while (Date.now() < deadline) {
      const composer = findComposer();
      if (composer) return composer;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  }

  /*
   * React keeps its own copy of the composer's text, so assigning .value is not
   * enough: the native setter plus an input event is what makes the framework
   * notice. A rich text composer gets the same treatment through execCommand,
   * which is what pasting does.
   */
  function typeInto(element, text) {
    element.focus();
    const tag = element.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) setter.set.call(element, text);
      else element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return String(element.value).length > 0;
    }
    if (element.isContentEditable) {
      try {
        if (document.execCommand('insertText', false, text)) return true;
      } catch (error) {
        /* fall through to the blunt version */
      }
      element.textContent = text;
      element.dispatchEvent(
        new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })
      );
      return Boolean(element.textContent);
    }
    return false;
  }

  function submit(composer) {
    const root = composer.closest('form') || document;
    const buttons = Array.from(root.querySelectorAll('button')).filter((button) => {
      const label = [
        button.getAttribute('aria-label') || '',
        button.getAttribute('data-testid') || '',
        button.getAttribute('title') || '',
        button.innerText || '',
      ]
        .join(' ')
        .toLowerCase();
      return !button.disabled && /send|submit|发送/.test(label);
    });
    if (buttons.length) {
      buttons[0].click();
      return 'button';
    }
    /* No send button in sight: Enter is what a person would press. */
    const press = (type) => {
      composer.dispatchEvent(
        new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
        })
      );
    };
    press('keydown');
    press('keypress');
    press('keyup');
    return 'enter';
  }

  function promptText(request) {
    const lines = [
      '请用中文总结下面这篇网页正文，用 Markdown 输出：第一行给结论，再用要点列出关键信息，保留数字与名称。',
      '',
      '标题：' + (request.title || '（无标题）'),
    ];
    if (request.url) lines.push('来源：' + request.url);
    lines.push('', request.text);
    return lines.join('\n');
  }

  /*
   * What the panel looked like when the composer was missing. Written into the
   * result so this can be diagnosed from the outside: the real panel only
   * renders once the local app server is up, so its shape is not something a
   * test on a bare profile can see.
   */
  function describePanel() {
    const counts = ['textarea', '[contenteditable="true"]', '[role="textbox"]', 'button']
      .map((selector) => selector + '=' + document.querySelectorAll(selector).length)
      .join(' ');
    const text = String((document.body && document.body.innerText) || '')
      .replace(/\s+/g, ' ')
      .slice(0, 70);
    return counts + ' | ' + text;
  }

  async function run() {
    const bag = await chrome.storage.local.get(REQUEST_KEY).catch(() => null);
    const request = bag && bag[REQUEST_KEY];
    if (!request || !request.text) return;
    if (!request.at || Date.now() - request.at > REQUEST_MAX_AGE_MS) return;
    if (handled === request.at) return;
    handled = request.at;

    const composer = await waitForComposer(Date.now() + COMPOSER_WAIT_MS);
    if (!composer) {
      report(false, '侧边栏里没有找到对话框（' + describePanel() + '）');
      return;
    }
    if (!typeInto(composer, promptText(request))) {
      report(false, '没能把正文写进对话框');
      return;
    }
    /* Give the framework a beat to enable its send button. */
    await new Promise((resolve) => setTimeout(resolve, 150));
    const how = submit(composer);
    /* The request is spent: a panel reload must not type it in again. */
    chrome.storage.local.remove(REQUEST_KEY).catch(() => {});
    report(true, '发送方式：' + how);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'summary:fill') run();
    return false;
  });

  /* The panel is usually opened *because* of this request. */
  run();
})();
