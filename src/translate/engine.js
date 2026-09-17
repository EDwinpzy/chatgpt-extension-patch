/*
 * Translation engine, running inside the extension's service worker.
 *
 * Loaded by translate/background-loader.js via importScripts, so the
 * extension's own background.js stays byte-identical. Runs alongside it in the
 * same global scope; nothing here touches the host extension's state.
 *
 * Shape of the pipeline, ported from the reference extension:
 *   skip trivial text -> cache -> merge into batches -> call the model with a
 *   numbered-line protocol -> parse (four fallbacks) -> fill missing entries
 */

const TRANSLATE_CACHE_KEY = 'translateCacheV1';
const CACHE_MAX_ENTRIES = 5000;
const CACHE_PERSIST_LIMIT = 4000;
const CONCURRENCY = 8;
const BATCH_MAX_ITEMS = 40;
const BATCH_MAX_CHARS = 4000;
const REQUEST_TIMEOUT_MS = 60000;
/* One batch gets at most three model calls, and never an output budget above
 * this, so a misbehaving model cannot turn into a wall of requests. */
const MAX_ATTEMPTS = 3;
const MAX_OUTPUT_TOKENS = 16384;
/*
 * A gateway that is out of upstream endpoints for a moment says so with a 5xx
 * in a few hundred milliseconds (measured against opencode.ai on 2026-09-17:
 * two identical union-alpha requests answered 200 in ~21s, the next answered
 * 503 in 441ms). That is worth the identical request one more time before the
 * user is told, since that is what a second press of 测试连接 would send. The
 * route never changes here - only the number of times it is asked.
 */
const UPSTREAM_STATUS = [500, 502, 503, 504];
const UPSTREAM_ATTEMPTS = 3;
const UPSTREAM_PAUSE_MS = 700;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ cache */

const memoryCache = new Map();
let cacheLoaded = false;
let persistTimer = null;

async function loadCacheOnce() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const bag = await chrome.storage.local.get(TRANSLATE_CACHE_KEY);
    const stored = bag ? bag[TRANSLATE_CACHE_KEY] : null;
    if (stored && typeof stored === 'object') {
      for (const [key, value] of Object.entries(stored)) {
        if (typeof value === 'string' && value.trim()) memoryCache.set(key, value);
      }
    }
  } catch (error) {
    /* a missing or unreadable cache is not fatal */
  }
}

/* "variant" keeps a shortened request from reusing the normal translation. */
function cacheKey(text, lang, modelKey, variant) {
  return lang + '|' + modelKey + '|' + (variant ? variant + '|' : '') + text;
}

function variantFor(budget) {
  return budget > 0 ? 'max' + Math.round(budget) : '';
}

function cacheGet(key) {
  const hit = memoryCache.get(key);
  if (hit === undefined) return null;
  if (typeof hit !== 'string' || !hit.trim()) {
    memoryCache.delete(key);
    return null;
  }
  return hit;
}

function cacheSet(key, value) {
  memoryCache.set(key, value);
  if (memoryCache.size > CACHE_MAX_ENTRIES) {
    const overflow = memoryCache.size - CACHE_MAX_ENTRIES;
    let dropped = 0;
    for (const oldest of memoryCache.keys()) {
      memoryCache.delete(oldest);
      if (++dropped >= overflow) break;
    }
  }
  schedulePersist();
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistCache().catch(() => {});
  }, 2000);
}

async function persistCache() {
  const entries = Array.from(memoryCache.entries()).slice(-CACHE_PERSIST_LIMIT);
  try {
    await chrome.storage.local.set({ [TRANSLATE_CACHE_KEY]: Object.fromEntries(entries) });
  } catch (error) {
    /* quota failures must never break translation */
  }
}

/* ------------------------------------------------------------------ text */

// Strips reasoning wrappers some gateways emit despite being asked not to.
function stripThinkingTags(text) {
  let cleaned = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, '').trim();
  cleaned = cleaned.replace(/<\/?(?:reasoning|thought|reflection)>/gi, '').trim();
  return cleaned;
}

/*
 * Parses an "[n] translation" reply. Accepts [1], 1., 1), 1、 and 1: markers.
 * Returns an array of the requested length with empty strings for missing
 * entries (so only the missing ones are retried), or null when nothing could
 * be matched at all, which means the batch must be redone.
 */
function parseNumberedLines(raw, count) {
  const text = stripThinkingTags(raw)
    .split('\n')
    .filter((line) => !/^\s*```/.test(line))
    .join('\n')
    .trim();
  if (!text) return null;

  const out = new Array(count).fill('');
  let matched = 0;
  let lastIdx = -1;
  let pending = [];

  const flush = () => {
    if (lastIdx >= 0 && pending.length) {
      const value = pending.join(' ').trim();
      if (value) {
        out[lastIdx] = value;
        matched++;
      }
    }
    pending = [];
  };

  // Deliberately does not match a bare number, so body text starting with a
  // figure is never swallowed as a marker.
  const NUMBERED = /^\s*(?:\[\s*(\d{1,3})\s*\]|(\d{1,3})\s*[.、)：:]\s*)\s*(.*)$/;

  for (const line of text.split('\n')) {
    const match = line.match(NUMBERED);
    if (match) {
      flush();
      const idx = parseInt(match[1] ?? match[2], 10) - 1;
      const rest = match[3];
      if (idx >= 0 && idx < count) {
        lastIdx = idx;
        if (rest && rest.trim()) pending.push(rest.trim());
        continue;
      }
      lastIdx = -1;
      continue;
    }
    // An unnumbered continuation line belongs to the previous entry.
    if (lastIdx >= 0 && line.trim()) pending.push(line.trim());
  }
  flush();

  return matched > 0 ? out : null;
}

function parseTranslationOutput(raw, count) {
  const text = stripThinkingTags(raw);

  const numbered = parseNumberedLines(raw, count);
  if (numbered) return numbered;

  try {
    let jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const match = jsonStr.match(/\[[\s\S]*\]/);
    if (match) jsonStr = match[0];
    let parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) parsed = [parsed];
    const hasNumeric = parsed.some((item) => typeof item === 'number');
    if (parsed.length > 0 && !hasNumeric) {
      const mapped = parsed.map((item) => {
        const str =
          typeof item === 'string'
            ? item
            : item && typeof item === 'object'
              ? (item.translation ?? item.text ?? item.content ?? '')
              : '';
        const trimmed = String(str ?? '').trim();
        return /^-{2,}\s*$/.test(trimmed) || trimmed === '' ? '' : str;
      });
      if (mapped.length === count) return mapped;
    }
  } catch (error) {
    /* fall through */
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('```') && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('>'));
  if (lines.length === count) {
    return lines.map((line) => line.replace(/^\d+[.)]\s*/, '').replace(/^["']|["']$/g, ''));
  }

  if (count === 1 && text && text !== raw) {
    return [text.replace(/^["'“”]|["'“”]$/g, '').trim()];
  }

  return null;
}

function isCjkTarget(lang) {
  return /^(zh|cn|yue|ja|jp|ko|kr)/i.test(String(lang || ''));
}

const TARGET_LANG_NAMES = {
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

function targetLangName(lang) {
  return TARGET_LANG_NAMES[lang] || lang;
}

/* Text that carries no meaning worth translating: numbers, punctuation,
 * links, addresses, handles, hashtags, plain timestamps, emoji. */
function shouldSkipTranslation(text, lang) {
  const value = String(text || '').trim();
  if (!value) return true;
  if (value.length <= 1) return true;
  if (/^[\d\s\p{P}\p{S}]+$/u.test(value)) return true;
  if (/^(https?:\/\/|www\.|mailto:|tel:|data:)\S*$/i.test(value)) return true;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(value)) return true;
  if (/^[\p{Extended_Pictographic}\s]+$/u.test(value)) return true;
  if (/^@[\w.+-]{1,30}$/.test(value)) return true;
  if (/^#[\w\u4e00-\u9fff]{1,30}$/.test(value)) return true;
  if (/^\d+(\.\d+)?\s?(ms|s|m|h|d|w|mo|y|yr|yrs)$/i.test(value)) return true;
  if (/^\d+(\.\d+)?(GB|MB|KB|TB|[KMGT])$/i.test(value)) return true;
  if (/^[$€£¥]?\d+(\.\d+)?\s?[KMBT]?\+?$/i.test(value)) return true;

  // Already in the target language.
  if (/^(zh|cn|yue)/i.test(String(lang || ''))) {
    if (/[\u4e00-\u9fff]/.test(value) && !/[A-Za-z]{3,}/.test(value) && !/[\u3040-\u30ff\uac00-\ud7af]/.test(value)) {
      return true;
    }
  }
  return false;
}

/*
 * A block that is nothing but protected names - a link that says "ChatGPT", a
 * row that says "OpenAI, GitHub" - has exactly one possible answer: itself.
 * Asking the model only risks changing it, so it is answered here and never
 * costs a request. Matching is case sensitive on purpose: "ChatGPT" is a name,
 * "chatgpt" written mid-sentence is just text, and "windows are open" must
 * stay translatable.
 */
function keepNameMatcher(glossary) {
  const names = translateKeepNames(glossary)
    .map((entry) => String(entry.from).trim())
    .filter(Boolean)
    .sort((first, second) => second.length - first.length);
  if (!names.length) return null;
  const pattern = names
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return new RegExp('(?<![\\w-])(?:' + pattern + ')(?![\\w-])', 'g');
}

function isOnlyKeepNames(text, matcher) {
  if (!matcher) return false;
  const rest = String(text || '').replace(matcher, ' ');
  return !/[\p{L}\p{N}]/u.test(rest);
}

function estimateMaxTokens(texts, lang) {
  let chars = 0;
  for (const text of texts) chars += String(text || '').length;
  const cjk = isCjkTarget(lang);
  const ratio = cjk ? 0.75 : 1.15;
  const perItem = cjk ? 10 : 14;
  const estimate = Math.ceil(chars * ratio + texts.length * perItem + 64);
  return Math.max(512, Math.min(8192, estimate));
}

/*
 * ASCII terms match on word boundaries, so the built-in list can hold short
 * words without firing inside longer ones: "Build" must not fire on "rebuild"
 * and "Commit" must not fire on "committed". Non-ASCII entries stay plain
 * substring.
 */
function glossaryHit(haystack, from) {
  const term = String(from || '').trim();
  if (!term) return false;
  if (!/^[\x20-\x7e]+$/.test(term)) return haystack.includes(term.toLowerCase());
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp('(?<![\\w-])' + escaped + '(?![\\w-])', 'i').test(haystack);
  } catch (error) {
    return haystack.includes(term.toLowerCase());
  }
}

function pickGlossaryFor(texts, glossary) {
  if (!Array.isArray(glossary) || glossary.length === 0) return [];
  const haystack = texts.join('\n').toLowerCase();
  return glossary
    .filter((entry) => entry && entry.from && entry.to)
    .filter((entry) => glossaryHit(haystack, entry.from))
    .slice(0, 40);
}

function buildMessages(lang, texts, glossary, options) {
  const input = texts.map((text, index) => '[' + (index + 1) + '] ' + text).join('\n');
  const name = targetLangName(lang);
  /*
   * Two kinds of entry arrive here. "Term -> 译法" forces a rendering. A name
   * written on both sides ("ChatGPT -> ChatGPT") means "leave this alone", and
   * saying that in words beats showing the model a glossary line where both
   * sides are identical - which it happily reads as an ordinary entry.
   */
  const list = Array.isArray(glossary) ? glossary : [];
  const kept = translateKeepNames(list).map((entry) => String(entry.from).trim());
  const names = kept.length
    ? '\nDo not translate, transliterate or explain these names. Keep them exactly as written:\n' +
      kept.map((value) => '- ' + value).join('\n')
    : '';
  const terms = list.filter((entry) => kept.indexOf(String((entry && entry.from) || '').trim()) === -1);
  const translations = terms.length
    ? '\nGlossary (these terms MUST use the exact translations):\n' +
      terms.map((entry) => '- ' + entry.from + ' -> ' + entry.to).join('\n')
    : '';
  const budgets = options && Array.isArray(options.budgets) ? options.budgets : [];
  const limits = budgets.some((value) => value > 0)
    ? '\nHard length limits, count characters of the result:\n' +
      budgets
        .map((value, index) => (value > 0 ? '[line ' + (index + 1) + '] at most ' + value + ' characters' : null))
        .filter(Boolean)
        .join('\n')
    : '';

  const format =
    'Output ONLY translated lines, keeping [n] order, exactly ' + texts.length + ' lines:\n' +
    '[1] translated line 1\n[2] translated line 2\n' +
    'No merge, no split, no explanation, no markdown, no code fence, no blank lines.';

  /*
   * Interface copy is where a literal translation hurts: it either overflows
   * the box or reads like a machine. When the caller already knows the box is
   * too small it also sends a character budget, and the wording changes from
   * "keep it short" to "compress it".
   */
  const task = limits
    ? 'Translate and compress each numbered line to ' + name + '. These are interface labels that have to fit a fixed ' +
      'box, so every result must stay inside the character limit listed below. Prefer the shortest natural wording: ' +
      'drop qualifiers, repeated product names and filler before dropping meaning.'
    : 'Translate each numbered line to ' + name + '. Interface text - labels, menu items, buttons, tabs, table ' +
      'headers, short headings - must be short and idiomatic: use the wording a ' + name + ' product would ship, ' +
      'never a word-for-word rendering. Body paragraphs stay complete and faithful.';

  return [
    { role: 'system', content: task + '\n' + format + limits + names + translations },
    { role: 'user', content: input },
  ];
}

/* ---------------------------------------------------------------- limiter */

function createLimiter(limit) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= limit || waiting.length === 0) return;
    active++;
    const job = waiting.shift();
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      waiting.push({ task, resolve, reject });
      next();
    });
}

/*
 * One gate for the whole worker, not one per caller. Page translation sends
 * several batches at once now, and each of those splits further on long text;
 * a shared gate is what keeps the total number of calls the provider ever sees
 * at once at CONCURRENCY, no matter how the work arrived.
 */
const requestQueue = createLimiter(CONCURRENCY);

/* ------------------------------------------------------------------ model */

/* ----------------------------------------------------------------- provider */

/*
 * OpenCode's endpoints (Zen and Zen/Go) answer
 *   400 {"type":"MissingSessionID"}
 * unless the request carries a session id, and they use that id to pick a
 * routing and prompt-cache bucket. There is no conversation here, so the id is
 * stable per install: every translation from this browser keeps landing in the
 * same bucket instead of a fresh one per request.
 *
 * Only OpenCode asks for it, so every other provider gets a byte-identical
 * request - an extra header on a host that never agreed to it is a needless way
 * to break a working setup.
 */
const SESSION_ID_KEY = 'translateSessionId';
let sessionIdPromise = null;

function newSessionId() {
  try {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    /* older runtime, fall through to the manual form */
  }
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch (error) {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

/* One id for the life of the install, so a worker restart does not change it. */
function getSessionId() {
  if (!sessionIdPromise) {
    sessionIdPromise = (async () => {
      try {
        const bag = await chrome.storage.local.get(SESSION_ID_KEY);
        const stored = bag ? bag[SESSION_ID_KEY] : null;
        if (typeof stored === 'string' && stored.trim()) return stored.trim();
      } catch (error) {
        /* no stored id yet, or storage refused the read */
      }
      const created = newSessionId();
      try {
        await chrome.storage.local.set({ [SESSION_ID_KEY]: created });
      } catch (error) {
        /* an id that only lives for this worker is still better than none */
      }
      return created;
    })();
  }
  return sessionIdPromise;
}

function isOpenCodeBase(base) {
  try {
    const host = new URL(base).hostname.toLowerCase();
    return host === 'opencode.ai' || host.endsWith('.opencode.ai');
  } catch (error) {
    return false;
  }
}

/* null when the provider does not want it, so callers can Object.assign it. */
async function openCodeSessionHeaders(base) {
  if (!isOpenCodeBase(base)) return null;
  return { 'x-opencode-session': await getSessionId() };
}

/*
 * The three APIs a provider can hide behind one base URL:
 *
 *   {base}/chat/completions  OpenAI chat - everything except OpenCode's catalog
 *   {base}/messages          Anthropic Messages - claude-*, union-alpha, qwen3.x plus|max
 *   {base}/responses         OpenAI Responses - gpt-5.x, grok-*, muse-spark-*
 *
 * A catalog does not say which model wants which one, and getting it wrong looks
 * like a bare "500 Internal server error" with nothing in it - so the picker in
 * the settings does, per model, and the card shows what it is set to.
 */
const DIALECT_CHAT = 'chat';
const DIALECT_MESSAGES = 'messages';
const DIALECT_RESPONSES = 'responses';
const DIALECTS = [DIALECT_CHAT, DIALECT_MESSAGES, DIALECT_RESPONSES];
const ANTHROPIC_VERSION = '2023-06-01';

/*
 * Which API the endpoint speaks is picked by hand in the settings, per model,
 * and that pick is the whole rule:
 *
 *   no guessing from the model name, no walking the other routes when one
 *   fails, no remembering what happened to work. What is configured is what is
 *   sent, once, and its error is the error.
 *
 * Empty or unrecognised falls back to chat completions, which is what every
 * provider outside OpenCode's catalog speaks anyway.
 */
function dialectFor(model) {
  const chosen = String(model || '').trim().toLowerCase();
  return DIALECTS.indexOf(chosen) >= 0 ? chosen : DIALECT_CHAT;
}

/*
 * The request one attempt sends. Anthropic wants the system prompt at the top
 * level rather than in the turn list, and rejects the OpenAI-only thinking
 * fields, so the "thinking off" switch has its own shape per dialect.
 */
function splitMessages(messages) {
  const system = [];
  const turns = [];
  for (const message of messages) {
    const content = typeof message.content === 'string' ? message.content : String(message.content ?? '');
    if (message.role === 'system') system.push(content);
    else turns.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content });
  }
  return { system: system.join('\n\n'), turns };
}

function dialectRequest(dialect, base, model, messages, apiKey, disableThinking, maxTokens) {
  const auth = {};
  if (apiKey) auth.Authorization = 'Bearer ' + apiKey;

  if (dialect === DIALECT_MESSAGES) {
    if (apiKey) auth['x-api-key'] = apiKey;
    auth['anthropic-version'] = ANTHROPIC_VERSION;
    const { system, turns } = splitMessages(messages);
    const body = { model, max_tokens: maxTokens, temperature: 0.1, messages: turns };
    if (system) body.system = system;
    if (disableThinking) body.thinking = { type: 'disabled' };
    return { url: base + '/messages', headers: auth, body };
  }

  if (dialect === DIALECT_RESPONSES) {
    const { system, turns } = splitMessages(messages);
    /*
     * Responses takes the system prompt as instructions and the turns as input.
     * temperature is left out on purpose - the reasoning models on this route
     * are the ones that object to it.
     */
    const body = { model, input: turns, max_output_tokens: maxTokens };
    if (system) body.instructions = system;
    if (disableThinking) body.reasoning = { effort: 'none' };
    return { url: base + '/responses', headers: auth, body };
  }

  const body = { model, messages, temperature: 0.1, stream: false, max_tokens: maxTokens };
  if (disableThinking) Object.assign(body, NO_THINK_PARAMS);
  return { url: base + '/chat/completions', headers: auth, body };
}

/*
 * Gateways answer in whatever shape their vendor prefers, so the text is dug
 * out of every shape seen in the wild instead of assuming chat-completions.
 */
function extractContent(data) {
  if (!data || typeof data !== 'object') return '';
  const out = [];
  const push = (value) => {
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  };

  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const message = choice && choice.message ? choice.message : null;
  if (message) {
    if (typeof message.content === 'string') push(message.content);
    else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (typeof part === 'string') push(part);
        else if (part && typeof part === 'object') push(part.text || part.content);
      }
    }
  }
  push(choice && choice.text);

  // Anthropic Messages answers with { content: [ { type: 'text', text } ] }.
  // Relays that flatten the same thing to { content: "..." } land here too.
  if (Array.isArray(data.content)) {
    for (const part of data.content) {
      if (typeof part === 'string') push(part);
      else if (part && typeof part === 'object') push(part.text || part.content);
    }
  } else if (data.content && typeof data.content === 'object') {
    push(data.content.text);
  } else {
    push(data.content);
  }

  // Responses-style payloads, and relays that flatten the answer themselves.
  push(data.output_text);
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      for (const part of item && Array.isArray(item.content) ? item.content : []) {
        if (typeof part === 'string') push(part);
        else if (part && typeof part === 'object') push(part.text);
      }
    }
  }
  push(data.response);
  push(data.text);

  return stripThinkingTags(out.join('\n')).trim();
}

/*
 * Why a gateway refused, in the words it used, without the JSON wrapped around
 * it. Every one of these services nests a message somewhere - OpenAI and
 * Anthropic say error.message, some relays only say message, a few answer
 * plain text - and the braces are for the console, not for a dialog on the
 * settings page. When there is no message to quote, the status alone is the
 * honest answer.
 */
function gatewayReason(body) {
  const raw = String(body || '').trim();
  if (!raw) return '';
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    /* not JSON: plain text is already the best form of itself */
    return raw.slice(0, 200);
  }
  /* Some relays wrap their reason in a JSON string. */
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 200);
  const nested = data && data.error;
  const candidates = [
    nested && typeof nested === 'object' ? nested.message : '',
    nested && typeof nested === 'string' ? nested : '',
    data && data.message,
    nested && typeof nested === 'object' ? nested.type : '',
    data && data.detail,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

async function callModel(messages, options) {
  const base = String(options.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('没有配置模型地址');
  const fixedHeaders = Object.assign(
    { 'Content-Type': 'application/json' },
    (await openCodeSessionHeaders(base)) || {}
  );
  /* One route, the configured one, for every attempt this call makes. */
  const dialect = dialectFor(options.dialect);

  const send = async (disableThinking, maxTokens) => {
    const request = dialectRequest(dialect, base, options.model, messages, options.apiKey, disableThinking, maxTokens);
    const headers = Object.assign({}, fixedHeaders, request.headers);

    let response = null;
    let text = '';
    let refusals = 0;

    for (let attempt = 1; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);

      try {
        response = await fetch(request.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(request.body),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        if (error && error.name === 'AbortError') throw new Error('请求超时（' + Math.round((options.timeoutMs || REQUEST_TIMEOUT_MS) / 1000) + ' 秒）');
        throw new Error('无法连接模型：' + (error && error.message ? error.message : error));
      }
      clearTimeout(timer);

      text = await response.text();
      if (response.ok) break;
      /*
       * Same URL, same body, same headers: the one thing that changes between
       * these attempts is when they are sent.
       */
      if (UPSTREAM_STATUS.indexOf(response.status) < 0 || attempt >= UPSTREAM_ATTEMPTS) break;
      refusals = attempt;
      console.warn('[translate] the gateway is not serving this model right now', {
        status: response.status,
        model: options.model,
        attempt,
        body: text.slice(0, 200),
      });
      await pause(UPSTREAM_PAUSE_MS * attempt);
    }

    if (!response.ok) {
      /*
       * A gateway that rejects the "thinking off" fields answers 4xx, and the
       * same request without them works - that gets its own retry. Nothing else
       * is retried: the route is the configured one and stays that way.
       */
      const flagsRejected = disableThinking && (response.status === 400 || response.status === 404 || response.status === 422);
      const reason = gatewayReason(text);
      // The body is still worth keeping, just not in the caller's face.
      console.warn('[translate] the gateway refused the request', {
        status: response.status,
        model: options.model,
        body: text.slice(0, 500),
      });
      const error = new Error('模型返回 ' + response.status + (reason ? '：' + reason : '（没有给出原因）'));
      if (flagsRejected) error.retryReason = 'flags';
      else if (refusals) {
        /* The attempts already happened on this route; what is left is saying so. */
        error.retryReason = 'upstream';
        error.upstreamRefusals = refusals;
      }
      throw error;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      throw new Error('模型返回的不是 JSON：' + text.slice(0, 200));
    }

    const content = extractContent(data);
    if (!content) {
      const choice = Array.isArray(data.choices) ? data.choices[0] : null;
      /*
       * Three vocabularies for the same idea: OpenAI chat says "length",
       * Anthropic says stop_reason "max_tokens", Responses says
       * incomplete_details.reason "max_output_tokens".
       */
      const incomplete = data.incomplete_details && data.incomplete_details.reason
        ? String(data.incomplete_details.reason)
        : '';
      const finish = choice && choice.finish_reason
        ? String(choice.finish_reason)
        : data.stop_reason
          ? String(data.stop_reason)
          : incomplete;
      const truncated = finish === 'length' || finish === 'max_tokens' || finish === 'max_output_tokens';
      // The raw body used to be pasted into the page's progress pill; it now
      // goes to the worker console, where it is actually useful.
      console.warn('[translate] the model returned no content', {
        model: options.model,
        finish: finish || '(none)',
        maxTokens,
        body: text.slice(0, 500),
      });
      // "length" is the common one and the plain-reading version of it belongs
      // in the message; any other finish_reason stays as it came.
      const why = truncated ? '（输出被截断）' : finish ? '（finish_reason: ' + finish + '）' : '';
      const error = new Error('模型没有返回内容' + why);
      if (truncated) error.retryReason = 'truncated';
      else if (disableThinking) error.retryReason = 'empty';
      throw error;
    }
    return content;
  };

  /*
   * The first call is exactly what the settings asked for. What follows
   * depends on how it failed:
   *
   *   a 5xx - the gateway has no upstream for this model at this moment. The
   *           identical request is sent again inside send(), and if it is
   *           still refused the trail says so. The route never changes.
   *   truncated - the answer hit the output limit, which is what a reasoning
   *               model does when it spends the whole budget on thinking and
   *               leaves nothing for the translation. Same request, a much
   *               larger budget.
   *   anything else while the "thinking off" fields are in play - the same
   *               request without them, because they are what the gateway or
   *               the model objected to.
   */
  const queue = [{ disableThinking: options.disableThinking === true, maxTokens: options.maxTokens }];
  const tried = new Set();
  const notes = [];
  const note = (value) => {
    if (notes.indexOf(value) < 0) notes.push(value);
  };
  let lastError = null;

  while (queue.length && tried.size < MAX_ATTEMPTS) {
    const attempt = queue.shift();
    const key = (attempt.disableThinking ? 'on' : 'off') + ':' + attempt.maxTokens;
    if (tried.has(key)) continue;
    tried.add(key);

    try {
      return await send(attempt.disableThinking, attempt.maxTokens);
    } catch (error) {
      lastError = error;
      const reason = error && error.retryReason;
      if (!reason) throw error;

      if (reason === 'upstream') {
        /*
         * The identical request has already been sent UPSTREAM_ATTEMPTS times
         * on this route, so there is no other request left to make - only the
         * sentence that says the retries happened.
         */
        note('上游短暂不可用，已重试 ' + error.upstreamRefusals + ' 次');
      } else if (reason === 'truncated' && attempt.maxTokens < MAX_OUTPUT_TOKENS) {
        const bigger = Math.min(Math.max(attempt.maxTokens * 4, 2048), MAX_OUTPUT_TOKENS);
        note('已加大输出上限重试');
        queue.push({ disableThinking: attempt.disableThinking, maxTokens: bigger });
        if (attempt.disableThinking) {
          note('已去掉关闭思考的参数重试');
          queue.push({ disableThinking: false, maxTokens: bigger });
        }
      } else if (attempt.disableThinking) {
        note('已去掉关闭思考的参数重试');
        queue.push({ disableThinking: false, maxTokens: Math.max(attempt.maxTokens, 1024) });
      }
    }
  }

  if (lastError && notes.length) lastError.message += '\n（' + notes.join('；') + '）';
  throw lastError;
}

/* ----------------------------------------------------------- orchestration */

/*
 * Merge small strings so each round trip carries as much as it can.
 */
function batchEntries(entries) {
  const batches = [];
  let items = [];
  let chars = 0;
  const flush = () => {
    if (items.length) batches.push(items);
    items = [];
    chars = 0;
  };
  for (const entry of entries) {
    const length = entry.text.length;
    if (items.length && (items.length >= BATCH_MAX_ITEMS || chars + length > BATCH_MAX_CHARS)) flush();
    items.push(entry);
    chars += length;
  }
  flush();
  return batches;
}

/*
 * Translates a list of strings. Skips what needs no translation, serves what
 * the cache already has, batches the rest, and fills in any entry the model
 * failed to return.
 *
 * A model that cannot be reached does not end the run: the configured model
 * goes first, and whatever it leaves untranslated is handed to the next model
 * in the list (section 30). Only when every model has failed for every batch
 * does the error reach the page.
 */
async function translateTexts(texts, targetLang, purpose, options) {
  const settings = await readTranslateSettings();
  const lang = targetLang || settings.targetLang;
  const models = translateModelCandidates(
    settings,
    purpose === 'subtitle' ? 'subtitleModelId' : 'translateModelId'
  );
  if (!models.length) {
    throw new Error('翻译模型没有配置好，去设置里检查一下');
  }
  await loadCacheOnce();

  const budgets = options && Array.isArray(options.budgets) ? options.budgets : [];
  const results = new Array(texts.length);
  const pending = [];
  /* Merged once, used for both the prompt and the name-only shortcut. */
  const allTerms = mergeGlossary(settings.glossary);
  const keepNames = keepNameMatcher(allTerms);

  texts.forEach((text, index) => {
    const value = String(text == null ? '' : text);
    if (shouldSkipTranslation(value, lang)) {
      results[index] = value;
      return;
    }
    if (isOnlyKeepNames(value, keepNames)) {
      results[index] = value;
      return;
    }
    pending.push({ index, text: value, budget: budgets[index] || 0 });
  });

  if (pending.length === 0) {
    return { translations: results, calls: 0 };
  }

  let calls = 0;
  /* Whether this run handed the page anything at all: a batch that landed, or
   * an entry an earlier run had already translated with this model. */
  let delivered = false;
  let firstError = null;
  /* What is still waiting for a translation; each model gets what the last
   * one could not deliver. */
  let todo = pending;

  for (let position = 0; position < models.length && todo.length; position++) {
    const model = models[position];
    const modelKey = String(model.baseUrl) + '/' + String(model.model);

    /*
     * The cache is read per model, because a translation is only known to be
     * good for the model that produced it. A model that is down still pays
     * nothing for text it translated in an earlier run.
     */
    const misses = [];
    for (const entry of todo) {
      const hit = cacheGet(cacheKey(entry.text.trim(), lang, modelKey, variantFor(entry.budget)));
      if (hit === null) misses.push(entry);
      else {
        results[entry.index] = hit;
        delivered = true;
      }
    }
    if (misses.length === 0) {
      todo = [];
      break;
    }

    const batches = batchEntries(misses);
    const tasks = batches.map((batch) =>
      requestQueue(async () => {
        const payload = batch.map((entry) => entry.text);
        const glossary = pickGlossaryFor(payload, allTerms);
        const messages = buildMessages(lang, payload, glossary, {
          budgets: batch.map((entry) => entry.budget),
        });
        calls++;
        const raw = await callModel(messages, {
          baseUrl: model.baseUrl,
          apiKey: model.apiKey,
          model: model.model,
          dialect: model.dialect,
          disableThinking: settings.disableThinking !== false,
          timeoutMs: REQUEST_TIMEOUT_MS,
          maxTokens: estimateMaxTokens(payload, lang),
        });
        const parsed = parseTranslationOutput(raw, payload.length);
        batch.forEach((entry, at) => {
          const value = parsed && typeof parsed[at] === 'string' ? parsed[at] : '';
          if (value && value.trim()) {
            results[entry.index] = value;
            cacheSet(cacheKey(entry.text.trim(), lang, modelKey, variantFor(entry.budget)), value);
          } else {
            // Nothing usable came back for this entry; fall back to the source.
            results[entry.index] = entry.text;
          }
        });
      })
    );

    const settled = await Promise.allSettled(tasks);
    /*
     * One unlucky batch must not cancel the whole page: the entries that batch
     * never returned go to the next model, and every other batch still lands.
     * Only a total failure is worth reporting.
     */
    const failed = settled.filter((entry) => entry.status === 'rejected');
    if (settled.length && failed.length < settled.length) delivered = true;

    const next = [];
    settled.forEach((entry, at) => {
      if (entry.status === 'rejected') next.push(...batches[at]);
    });
    if (failed.length) {
      if (!firstError) firstError = failed[0].reason;
      const nextModel = next.length ? models[position + 1] : null;
      console.warn(
        '[translate] ' + failed.length + ' of ' + settled.length + ' batches failed on ' +
          String(model.name || model.model) + (nextModel ? '，改用 ' + String(nextModel.name || nextModel.model) : '') + ': ' +
          failed.map((entry) => (entry.reason && entry.reason.message) || String(entry.reason)).join(' | ')
      );
    }
    todo = next;
  }

  /* Every model refused these entries; the page keeps its own text. */
  for (const entry of todo) results[entry.index] = entry.text;
  if (firstError && !delivered) throw firstError;

  for (let index = 0; index < results.length; index++) {
    if (results[index] === undefined) results[index] = String(texts[index] == null ? '' : texts[index]);
  }
  return { translations: results, calls };
}

/* --------------------------------------------------------------- messages */

/*
 * Whole-page summary, the right-click menu's "总结全文". The wording is the
 * reference extension's, trimmed: Chinese, Markdown, conclusion first, keep
 * numbers and names, ignore the furniture around the article.
 */
const SUMMARY_PROMPT = [
  '请用中文总结下面这篇网页正文，用 Markdown 输出。',
  '',
  '要求：',
  '- 第一行给出一句话结论，再用要点列出关键信息',
  '- 保留数字、时间、名称，专有名词保持原文',
  '- 只根据正文总结，不要补充原文没有的内容',
  '- 忽略导航、广告、免责声明等无关内容',
].join('\n');

const SUMMARY_MAX_TOKENS = 2048;
const SUMMARY_TIMEOUT_MS = 120000;

function buildSummaryMessages(text) {
  return [
    { role: 'system', content: SUMMARY_PROMPT },
    { role: 'user', content: text },
  ];
}

async function handleSummarize(message) {
  const text = String((message && message.text) || '').trim();
  if (!text) return { ok: false, error: '没有提取到正文' };
  const settings = await readTranslateSettings();
  /*
   * Same order of business as a translation: the configured model first, the
   * rest of the list behind it. A summary is one long call, so a model that is
   * down would otherwise cost the whole feature.
   */
  const models = translateModelCandidates(settings, 'translateModelId');
  if (!models.length) {
    return { ok: false, error: '翻译模型没有配置好，去设置里检查一下' };
  }

  /* The first model's failure is the one worth reporting: it is the one the
   * settings point at, and the one to fix. */
  let firstError = null;
  for (const model of models) {
    try {
      const raw = await requestQueue(() =>
        callModel(buildSummaryMessages(text), {
          baseUrl: model.baseUrl,
          apiKey: model.apiKey,
          model: model.model,
          dialect: model.dialect,
          /* A summary is not a translation, but the "thinking off" switch is
           * still the right call: it only asks the model to skip its reasoning
           * pass, and a summary that spends the budget thinking is no summary. */
          disableThinking: settings.disableThinking !== false,
          timeoutMs: SUMMARY_TIMEOUT_MS,
          maxTokens: SUMMARY_MAX_TOKENS,
        })
      );
      const summary = stripThinkingTags(raw).trim();
      if (!summary) throw new Error('模型没有返回内容');
      return { ok: true, text: summary };
    } catch (error) {
      if (!firstError) firstError = error;
      console.warn(
        '[translate] summarize failed on ' + String(model.name || model.model) + ': ' +
          String((error && error.message) || error)
      );
    }
  }
  return { ok: false, error: String((firstError && firstError.message) || firstError) };
}

async function handleTranslateBatch(message) {
  const texts = Array.isArray(message.texts) ? message.texts.map((text) => String(text ?? '')) : [];
  if (texts.length === 0) return { ok: true, translations: [] };
  try {
    const budgets = Array.isArray(message.budgets) ? message.budgets : [];
    const out = await translateTexts(texts, message.targetLang, message.purpose, { budgets });
    return { ok: true, translations: out.translations, calls: out.calls };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
}

async function handleTestModel(request) {
  const settings = await readTranslateSettings();
  let model = null;
  // An unsaved model from the settings form can be tested directly.
  if (request && request.model && request.model.baseUrl && request.model.model) {
    model = request.model;
  } else if (request && request.modelId) {
    model = settings.models.find((item) => String(item.id) === String(request.modelId)) || settings.models[0];
  } else {
    model = settings.models[0];
  }
  if (!model) return { ok: false, error: '没有配置模型' };

  const started = Date.now();
  try {
    const raw = await callModel(buildMessages('zh-CN', ['Machine learning models need data.'], []), {
      baseUrl: model.baseUrl,
      apiKey: model.apiKey,
      model: model.model,
      dialect: model.dialect,
      disableThinking: settings.disableThinking !== false,
      /*
       * The same patience a real translation gets: this button exists to say
       * whether translation will work, and union-alpha measured 10-44s per
       * answer, so a shorter fuse here would fail a model that works.
       */
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxTokens: 1024,
    });
    return { ok: true, elapsedMs: Date.now() - started, sample: stripThinkingTags(raw).slice(0, 120) };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
}

/* Lists the models a service offers, so the local form can be a picker. */
async function handleListModels(request) {
  const base = String((request && request.baseUrl) || '').replace(/\/+$/, '');
  if (!base) return { ok: false, error: '缺少服务地址' };
  const headers = {};
  if (request.apiKey) headers.Authorization = 'Bearer ' + request.apiKey;
  Object.assign(headers, (await openCodeSessionHeaders(base)) || {});

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(base + '/models', { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      return { ok: false, error: '服务返回 ' + response.status + '，检查服务是否在运行' };
    }
    const data = await response.json();
    const list = Array.isArray(data && data.data) ? data.data : [];
    const models = list
      .map((item) => String(item && item.id ? item.id : item || ''))
      .filter(Boolean)
      .sort();
    if (!models.length) return { ok: false, error: '服务没有返回任何模型' };
    return { ok: true, models };
  } catch (error) {
    clearTimeout(timer);
    if (error && error.name === 'AbortError') return { ok: false, error: '连接超时，服务可能没在运行' };
    return {
      ok: false,
      error: '无法连接：' + String((error && error.message) || error) + '。检查服务地址是否正确、服务是否在运行。',
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'translate:batch') {
    handleTranslateBatch(message).then(sendResponse);
    return true;
  }
  if (message.type === 'translate:test-model') {
    handleTestModel(message).then(sendResponse);
    return true;
  }
  if (message.type === 'translate:list-models') {
    handleListModels(message).then(sendResponse);
    return true;
  }
  if (message.type === 'translate:get-settings') {
    readTranslateSettings().then((settings) => sendResponse({ ok: true, settings }));
    return true;
  }
  if (message.type === 'translate:set-settings') {
    writeTranslateSettings(message.patch || {}).then((settings) => sendResponse({ ok: true, settings }));
    return true;
  }
  if (message.type === 'translate:clear-cache') {
    const removed = memoryCache.size;
    memoryCache.clear();
    chrome.storage.local.remove(TRANSLATE_CACHE_KEY).catch(() => {});
    sendResponse({ ok: true, removed });
    return false;
  }
  if (message.type === 'translate:summarize') {
    handleSummarize(message).then(sendResponse);
    return true;
  }
  if (message.type === 'translate:open-options') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

/* ----------------------------------------------------------- context menu */

const TRANSLATE_MENU = {
  SELECTION: 'translate-selection',
  PAGE: 'translate-page',
  SUMMARY: 'translate-summary',
  RESTORE: 'translate-restore',
  SETTINGS: 'translate-settings',
};

function createTranslateMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: TRANSLATE_MENU.SELECTION,
      title: '翻译选中文字',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: TRANSLATE_MENU.PAGE,
      title: '翻译整页',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: TRANSLATE_MENU.SUMMARY,
      title: '总结全文',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: TRANSLATE_MENU.RESTORE,
      title: '还原本页原文',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: TRANSLATE_MENU.SETTINGS,
      title: '翻译设置',
      contexts: ['page', 'selection'],
    });
  });
}

chrome.runtime.onInstalled.addListener(createTranslateMenus);
chrome.runtime.onStartup.addListener(createTranslateMenus);

/* ------------------------------------------------------- 总结全文: the flow */

const SUMMARY_REQUEST_KEY = 'codexSummaryRequest';
const SUMMARY_RESULT_KEY = 'codexSummaryResult';
/* The panel gets 20s to lay itself out; the extra 5s here is the margin that
 * keeps a slow panel from being declared dead while it is still starting. */
const SUMMARY_PANEL_WAIT_MS = 25000;

/*
 * A tab that was already open when the extension was reloaded has no content
 * script in it, and the menu click then fails with nothing to show for it -
 * which is exactly how "点了没反应" happens. Ask first; inject the file by hand
 * only when the answer does not come.
 */
async function pageScriptReady(tabId) {
  const ping = await chrome.tabs.sendMessage(tabId, { type: 'translate:ping' }).catch(() => null);
  if (ping && ping.ok) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['translate/summary.js'] });
  } catch (error) {
    return false;
  }
  const again = await chrome.tabs.sendMessage(tabId, { type: 'translate:ping' }).catch(() => null);
  return Boolean(again && again.ok);
}

/* The page then summarises by itself, and is told why it had to - that line is
 * what makes a failed hand-off diagnosable without opening a console. */
function askPageToSummarize(tabId, note) {
  chrome.tabs.sendMessage(tabId, { type: 'translate:summarize-page', note: note || '' }).catch(() => {});
}

/*
 * 总结全文: hand the article to the Codex side panel, which is where the chat
 * already lives. The panel opens for this tab, its own script finds the article
 * in storage and types it into the composer. If no panel takes it in time - the
 * local app server is not running, or the composer moved - the page falls back
 * to summarising by itself, so the menu never ends in silence.
 */
async function summarizeIntoPanel(tab) {
  const tabId = tab.id;
  if (!(await pageScriptReady(tabId))) {
    return;
  }
  /* Something on screen right away: the panel route can take seconds, and a
   * silent menu click is the thing this is fixing. */
  chrome.tabs.sendMessage(tabId, { type: 'translate:summary-wait' }).catch(() => {});
  const found = await chrome.tabs
    .sendMessage(tabId, { type: 'translate:extract-page' })
    .catch(() => null);
  if (!found || !found.ok || !found.text) {
    askPageToSummarize(tabId);
    return;
  }

  const request = {
    text: found.text,
    title: found.title || '',
    url: found.url || '',
    at: Date.now(),
  };
  await chrome.storage.local
    .set({ [SUMMARY_REQUEST_KEY]: request, [SUMMARY_RESULT_KEY]: { at: 0, ok: false, reason: '' } })
    .catch(() => {});

  try {
    await chrome.sidePanel.open({ tabId });
  } catch (error) {
    /* No side panel for this tab, or the click did not count as a user gesture
     * (a test, a replayed message): summarise in the page instead. */
    askPageToSummarize(tabId);
    return;
  }
  /* A panel that is already loaded gets this right away; one that is still
   * starting reads the same request from storage on its own. */
  chrome.runtime.sendMessage({ type: 'summary:fill' }).catch(() => {});

  const deadline = Date.now() + SUMMARY_PANEL_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const bag = await chrome.storage.local.get(SUMMARY_RESULT_KEY).catch(() => null);
    const result = bag && bag[SUMMARY_RESULT_KEY];
    if (result && result.at > request.at) {
      if (result.ok) {
        chrome.tabs.sendMessage(tabId, { type: 'translate:summary-panel-ok' }).catch(() => {});
      } else {
        askPageToSummarize(tabId, '侧边栏没接住：' + (result.reason || '未知原因'));
      }
      return;
    }
  }
  askPageToSummarize(tabId, '侧边栏超时没接住');
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === TRANSLATE_MENU.SETTINGS) {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (!tab || typeof tab.id !== 'number') return;
  if (info.menuItemId === TRANSLATE_MENU.PAGE) {
    chrome.tabs.sendMessage(tab.id, { type: 'translate:translate-page' }).catch(() => {});
    return;
  }
  if (info.menuItemId === TRANSLATE_MENU.SUMMARY) {
    summarizeIntoPanel(tab);
    return;
  }
  if (info.menuItemId === TRANSLATE_MENU.RESTORE) {
    chrome.tabs.sendMessage(tab.id, { type: 'translate:restore-page' }).catch(() => {});
    return;
  }
  if (info.menuItemId === TRANSLATE_MENU.SELECTION) {
    chrome.tabs
      .sendMessage(tab.id, { type: 'translate:show-bubble', text: info.selectionText || '' })
      .catch(() => {});
  }
});

createTranslateMenus();
