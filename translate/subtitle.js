/*
 * Subtitle translation for video pages.
 *
 * The translation replaces the original: while a translated line is on screen
 * the player's own caption box is hidden (visibility only, so the player keeps
 * its layout) and our shadow-root bar is drawn where that box was. The page's
 * text is never rewritten, so a player can re-render its captions as often as
 * it likes without fighting us.
 *
 * Two sources are read:
 *   - caption elements the player renders into the DOM (YouTube, bilibili,
 *     Video.js, Plyr, JW Player, Shaka, Netflix, ...)
 *   - native TextTrack cues, which never enter the DOM at all
 */
(() => {
  if (window.__codexSubtitleLoaded) return;
  window.__codexSubtitleLoaded = true;

  const HOST_ID = 'codex-subtitle';
  const HIDDEN_ATTR = 'data-codex-subtitle-hidden';
  const SETTINGS_KEY = 'translateSettings';
  const POLL_MS = 320;
  // A caption blinking away between two lines must not clear the bar.
  const EMPTY_GRACE_MS = 1200;
  const MEMO_MAX = 400;

  const DOM_CAPTIONS = [
    '.ytp-caption-window-container',
    '.ytp-caption-window-rollup',
    '.caption-visual-line',
    '.captions-text',
    '.vjs-text-track-display',
    '.plyr__caption',
    '.bpx-player-subtitle-wrap',
    '.jw-text-track-display',
    '.shaka-text-container',
    '.player-timedtext',
    '.subtitle-container',
    '[class*="subtitle-wrap" i]',
  ].join(',');

  /* Class or id hint for captions we do not have a selector for. */
  const CAPTION_HINT = /caption|subtitles?|timedtext|cc-|player-text/i;

  let settings = null;
  let host = null;
  let shadow = null;
  let bar = null;
  let lastSource = '';
  let token = 0;
  let emptySince = 0;
  let hiddenNode = null;
  let hideStyle = null;
  const memo = new Map();

  /* ------------------------------------------------------------- settings */

  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const enabled = () => Boolean(settings && settings.subtitleEnabled !== false);
  const fontSize = () => Math.min(40, Math.max(12, Number(settings && settings.subtitleFontSize) || 20));
  const maxLines = () => Math.min(4, Math.max(1, Number(settings && settings.subtitleMaxLines) || 2));
  const atTop = () => Boolean(settings && settings.subtitlePosition === 'top');

  function looksLikeTarget(text) {
    const lang = (settings && settings.targetLang) || 'zh-CN';
    if (!/^(zh|cn|yue|ja|ko)/i.test(lang)) return false;
    const target = (text.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    return target > latin;
  }

  /* --------------------------------------------------------------- sources */

  function findVideo() {
    let best = null;
    let bestArea = 0;
    for (const video of document.querySelectorAll('video')) {
      const rect = video.getBoundingClientRect();
      if (rect.width < 140 || rect.height < 90) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = video;
      }
    }
    return best;
  }

  /* The caption box the player draws, used as the anchor to sit above. */
  function captionBox() {
    let found = null;
    for (const node of document.querySelectorAll(DOM_CAPTIONS)) {
      const hit = captionCandidate(node);
      if (hit) found = hit;
    }
    if (found) return found;
    return genericCaptionBox();
  }

  /* Shared shape check: short visible text, real box, on screen. */
  function captionCandidate(node) {
    if (!node || node.id === HOST_ID || node.closest('#' + HOST_ID)) return null;
    // textContent, not innerText: while our own line is up this box is hidden
    // by us, and innerText of a hidden element reads as empty.
    const text = clean(node.textContent || node.innerText);
    if (!text || text.length > 220) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 8) return null;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return null;
    return { node, text, rect };
  }

  /*
   * Unknown players exist, so when no known selector matches, the video's own
   * container is scanned for an element that is named like a caption track and
   * sits over the picture. Scanning only that container keeps it cheap, and
   * still covers the custom players.
   */
  function genericCaptionBox() {
    const video = findVideo();
    if (!video) return null;
    const scope = video.parentElement && video.parentElement.parentElement
      ? video.parentElement.parentElement
      : video.parentElement;
    if (!scope) return null;
    const videoRect = video.getBoundingClientRect();
    let found = null;
    const nodes = scope.querySelectorAll('div, span, p');
    const limit = Math.min(nodes.length, 500);
    for (let index = 0; index < limit; index++) {
      const node = nodes[index];
      if (!CAPTION_HINT.test(String(node.className || '') + ' ' + String(node.id || ''))) continue;
      const hit = captionCandidate(node);
      if (!hit) continue;
      // Only what is drawn on the picture counts; a caption list under the
      // player must not be mistaken for the line being spoken.
      if (hit.rect.bottom < videoRect.top + videoRect.height * 0.4) continue;
      if (hit.rect.top > videoRect.bottom + 40) continue;
      found = hit;
    }
    return found;
  }

  function cueText() {
    for (const video of document.querySelectorAll('video')) {
      const tracks = video.textTracks || [];
      for (let index = 0; index < tracks.length; index++) {
        const track = tracks[index];
        if (!track || track.mode === 'disabled') continue;
        const cues = track.activeCues;
        if (!cues || !cues.length) continue;
        let text = '';
        for (let cue = 0; cue < cues.length; cue++) text += ' ' + (cues[cue] ? cues[cue].text : '');
        text = clean(text);
        if (text) return text;
      }
    }
    return '';
  }

  function currentSubtitle() {
    const caption = captionBox();
    if (caption) return { text: caption.text, node: caption.node };
    return { text: cueText(), node: null };
  }

  /* ------------------------------------------------- the original caption */

  /*
   * Hiding is done with a stylesheet of our own plus one attribute on the
   * caption box, never by editing the player's own style attribute: when the
   * player replaces that element the attribute goes with it, and removing our
   * rule puts everything back exactly as it was.
   */
  function ensureHideStyle() {
    if (hideStyle && hideStyle.isConnected) return;
    hideStyle = document.createElement('style');
    hideStyle.setAttribute('data-codex-subtitle-style', '1');
    (document.head || document.documentElement).appendChild(hideStyle);
  }

  /*
   * Two things are hidden while a translated line is on screen: the caption box
   * the player painted, and whatever the browser paints itself for a native
   * text track (the ::cue rule). Both go back the moment our line goes away.
   */
  function paintHideStyle(active) {
    ensureHideStyle();
    const rules = ['[' + HIDDEN_ATTR + '] { visibility: hidden !important; }'];
    if (active) rules.push('video::cue { visibility: hidden !important; }');
    const next = rules.join('\n');
    if (hideStyle.textContent !== next) hideStyle.textContent = next;
  }

  function hideOriginal(node) {
    paintHideStyle(true);
    if (!node || node === hiddenNode) return;
    restoreOriginalNode();
    try {
      node.setAttribute(HIDDEN_ATTR, '1');
      hiddenNode = node;
    } catch (error) {
      hiddenNode = null;
    }
  }

  function restoreOriginalNode() {
    if (!hiddenNode) return;
    try {
      hiddenNode.removeAttribute(HIDDEN_ATTR);
    } catch (error) {
      /* the player already replaced the node */
    }
    hiddenNode = null;
  }

  function restoreOriginal() {
    restoreOriginalNode();
    if (hideStyle) paintHideStyle(false);
  }

  /* ----------------------------------------------------------------- model */

  function charBudget() {
    const video = findVideo();
    const width = video ? Math.min(video.getBoundingClientRect().width * 0.9, 1100) : Math.min(window.innerWidth * 0.8, 900);
    // One CJK glyph is about one em wide, so this is the count that fits.
    return Math.max(6, Math.min(140, Math.floor(width / fontSize()) * maxLines()));
  }

  async function translate(text) {
    if (memo.has(text)) return memo.get(text);
    const reply = await chrome.runtime
      .sendMessage({
        type: 'translate:batch',
        texts: [text],
        purpose: 'subtitle',
        budgets: [charBudget()],
      })
      .catch(() => null);
    const out = reply && reply.ok && Array.isArray(reply.translations) ? clean(reply.translations[0]) : '';
    if (out) {
      memo.set(text, out);
      if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
    }
    return out;
  }

  /* --------------------------------------------------------------- overlay */

  function ensureOverlay() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483644; pointer-events: none;';
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = [
      '.bar {',
      '  position: fixed; box-sizing: border-box;',
      '  padding: 5px 12px; border-radius: 8px;',
      '  background: rgba(8, 8, 8, .74); color: #fff;',
      '  font: 600 20px/1.35 -apple-system, "Segoe UI", "Noto Sans SC", system-ui, sans-serif;',
      '  text-align: center; white-space: pre-wrap; word-break: break-word;',
      '  display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;',
      '  text-shadow: 0 1px 3px rgba(0, 0, 0, .85);',
      '}',
    ].join('\n');
    shadow.appendChild(style);
    bar = document.createElement('div');
    bar.className = 'bar';
    bar.hidden = true;
    shadow.appendChild(bar);
    document.documentElement.appendChild(host);
  }

  function place() {
    if (!bar || bar.hidden) return;
    const video = findVideo();
    const caption = captionBox();
    const videoRect = video ? video.getBoundingClientRect() : null;

    let width = videoRect ? Math.min(videoRect.width * 0.92, 1100) : Math.min(window.innerWidth * 0.8, 900);
    width = Math.max(180, width);
    const left = videoRect
      ? videoRect.left + Math.max(0, (videoRect.width - width) / 2)
      : Math.max(8, (window.innerWidth - width) / 2);

    bar.style.width = Math.round(width) + 'px';
    bar.style.left = Math.round(left) + 'px';

    const height = bar.offsetHeight || Math.round(fontSize() * 1.6 * maxLines());
    let top;
    if (atTop()) {
      top = videoRect ? videoRect.top + Math.round(videoRect.height * 0.08) : window.innerHeight * 0.1;
    } else if (caption && (!videoRect || caption.rect.top >= videoRect.top)) {
      // Stand exactly where the player's own line is: that line is hidden, so
      // this is what the viewer reads.
      top = caption.rect.top;
    } else if (videoRect) {
      top = videoRect.bottom - Math.round(videoRect.height * 0.16) - height;
    } else {
      top = window.innerHeight - height - Math.round(window.innerHeight * 0.12);
    }

    const low = videoRect ? videoRect.top + 4 : 4;
    const high = videoRect ? videoRect.bottom - height - 4 : window.innerHeight - height - 4;
    top = Math.min(Math.max(top, low), Math.max(low, high));
    bar.style.top = Math.round(top) + 'px';
  }

  function show(text, node) {
    ensureOverlay();
    bar.style.fontSize = fontSize() + 'px';
    bar.style.webkitLineClamp = String(maxLines());
    bar.textContent = text;
    bar.hidden = false;
    // Hide whatever the player is showing right now, not only the element the
    // text came from: several players build a fresh one for every cue.
    const current = captionBox();
    hideOriginal((current && current.node) || node);
    place();
  }

  function hide() {
    restoreOriginal();
    if (!bar) return;
    bar.hidden = true;
    bar.textContent = '';
  }

  function destroy() {
    restoreOriginal();
    if (hideStyle && hideStyle.isConnected) hideStyle.remove();
    hideStyle = null;
    if (host && host.isConnected) host.remove();
    host = null;
    shadow = null;
    bar = null;
  }

  function refresh() {
    if (!enabled()) {
      destroy();
      lastSource = '';
      return;
    }
    if (bar && !bar.hidden) {
      bar.style.fontSize = fontSize() + 'px';
      bar.style.webkitLineClamp = String(maxLines());
      place();
    }
  }

  /* ------------------------------------------------------------------ loop */

  function loop() {
    window.setTimeout(loop, POLL_MS);
    if (document.hidden || !enabled()) return;

    const source = currentSubtitle();
    const text = source.text;
    if (!text) {
      if (!emptySince) emptySince = Date.now();
      if (Date.now() - emptySince > EMPTY_GRACE_MS) {
        hide();
        lastSource = '';
      }
      return;
    }
    emptySince = 0;

    // Our line is the caption now, so whatever the player paints stays hidden.
    if (bar && !bar.hidden) hideOriginal(source.node);

    if (text === lastSource) {
      place();
      return;
    }
    lastSource = text;

    if (text.length < 2 || looksLikeTarget(text)) {
      hide();
      return;
    }

    const mine = ++token;
    translate(text)
      .then((out) => {
        if (mine !== token) return;
        if (out) show(out, source.node);
        else hide();
      })
      .catch(() => {});
  }

  chrome.runtime
    .sendMessage({ type: 'translate:get-settings' })
    .then((reply) => {
      settings = reply && reply.settings ? reply.settings : null;
      refresh();
    })
    .catch(() => {
      settings = null;
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    settings = changes[SETTINGS_KEY].newValue || settings;
    refresh();
  });

  window.addEventListener('resize', place, { passive: true });
  window.addEventListener('scroll', place, { passive: true });
  document.addEventListener('fullscreenchange', place, true);

  window.setTimeout(loop, POLL_MS);
})();
