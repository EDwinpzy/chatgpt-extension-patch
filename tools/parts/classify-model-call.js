/*
 * Replacement for the two functions the ported classifier used to call the
 * model with (getSettings + callAIClassify). Spliced in by
 * tools\port-bookmarks.mjs, which swaps out everything from
 * "获取扩展设置（多模型版本）" up to the end of callAIClassify for this file.
 *
 * Two things changed against the upstream extension:
 *   - the model comes from this extension's own model list (the worker resolves
 *     it), so there is no second place to type a Base URL, a key and a model
 *     name, and no hard-coded API key ships with the port
 *   - the request shape is the one the translation engine already uses:
 *     {baseUrl}/chat/completions with the "thinking off" fields and a short
 *     ladder of retries, instead of guessing /v4, /v2 or /v1 from the host name
 */

const CLASSIFY_TIMEOUT_MS = 60000;
const CLASSIFY_MAX_TOKENS = 4096;

/* The fields the translation engine sends when thinking is off, defined by the
 * translation settings script that loads first. */
function thinkingOffFields() {
  try {
    if (typeof NO_THINK_PARAMS === 'object' && NO_THINK_PARAMS) return NO_THINK_PARAMS;
  } catch (error) {
    /* not loaded yet: fall through to the single most common field */
  }
  return { enable_thinking: false };
}

/* Gateways answer in whatever shape their vendor prefers. */
function extractMessageContent(data) {
  if (!data || typeof data !== 'object') return '';
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const message = choice && choice.message ? choice.message : null;
  if (message) {
    if (typeof message.content === 'string' && message.content.trim()) return message.content.trim();
    if (Array.isArray(message.content)) {
      const joined = message.content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object') return part.text || part.content || '';
          return '';
        })
        .join('')
        .trim();
      if (joined) return joined;
    }
  }
  for (const value of [choice && choice.text, data.output_text, data.response, data.text]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/*
 * The reply is a JSON array of {id, category}. It arrives fenced, wrapped in an
 * object, or buried in a sentence, so every shape seen in the wild is accepted.
 * Anything unparsable becomes an empty batch, which the caller treats as "no
 * classification" rather than as a wrong one.
 */
function parseClassifyPayload(content) {
  const text = String(content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  if (!text) return [];

  const unwrap = (value) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return null;
    const keys = Object.keys(value);
    if (keys.length === 1 && Array.isArray(value[keys[0]])) return value[keys[0]];
    for (const candidate of Object.values(value)) {
      if (Array.isArray(candidate) && candidate.length > 0) return candidate;
    }
    return null;
  };

  let parsed = null;
  try {
    parsed = unwrap(JSON.parse(text));
  } catch (error) {
    parsed = null;
  }
  if (!parsed) {
    const arrayish = text.match(/\[[\s\S]*\]/);
    if (arrayish) {
      try {
        parsed = unwrap(JSON.parse(arrayish[0]));
      } catch (error) {
        parsed = null;
      }
    }
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item) => item && typeof item === 'object' && item.id !== undefined && item.id !== null)
    .map((item) => ({ id: String(item.id), category: item.category }));
}

/*
 * One batch, at most three calls. The first is what the settings asked for;
 * each retry drops whichever part of the request might be the objection:
 *
 *   1. as configured, asking for a JSON object
 *   2. without response_format (local Ollama and several relays reject it)
 *   3. without the "thinking off" fields (a reasoning model that spends its
 *      whole output budget thinking returns nothing, and those fields are the
 *      only lever available to stop it)
 *
 * A network failure, a bad key or a server error throws straight away: asking
 * the same question in another shape will not fix those.
 */
async function callClassifyModel(prompt, model, options) {
  const base = String((model && model.baseUrl) || '').replace(/\/+$/, '');
  if (!base) throw new Error('没有配置模型地址');
  const url = base + '/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (model.apiKey) headers.Authorization = 'Bearer ' + model.apiKey;
  const withFlags = Boolean(options && options.disableThinking);

  const send = async (responseFormat, disableThinking) => {
    const body = {
      model: model.model,
      messages: [
        { role: 'system', content: '只返回 JSON。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      stream: false,
      max_tokens: CLASSIFY_MAX_TOKENS,
    };
    if (responseFormat) body.response_format = { type: 'json_object' };
    if (disableThinking) Object.assign(body, thinkingOffFields());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (error && error.name === 'AbortError') {
        throw new Error('请求超时（' + Math.round(CLASSIFY_TIMEOUT_MS / 1000) + ' 秒）');
      }
      throw new Error('无法连接模型：' + (error && error.message ? error.message : error));
    }
    clearTimeout(timer);

    const text = await response.text();
    if (!response.ok) {
      const error = new Error('模型返回 ' + response.status + '：' + text.slice(0, 200));
      if (response.status === 400 || response.status === 404 || response.status === 415 || response.status === 422) {
        error.tryNextShape = true;
      }
      throw error;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error('模型返回的不是 JSON：' + text.slice(0, 160));
    }

    const content = extractMessageContent(data);
    if (!content) {
      const choice = Array.isArray(data.choices) ? data.choices[0] : null;
      const finish = choice && choice.finish_reason ? String(choice.finish_reason) : '';
      const label = finish === 'length'
        ? '（输出被截断）'
        : finish
          ? '（finish_reason: ' + finish + '）'
          : '';
      const error = new Error('模型没有返回内容' + label);
      // An empty answer is worth one more attempt: either the request shape or
      // the reasoning budget is what stopped it.
      if (finish === 'length' || responseFormat || disableThinking) error.tryNextShape = true;
      throw error;
    }
    return content;
  };

  const plan = [];
  const add = (entry) => {
    const known = plan.some(
      (item) => item.responseFormat === entry.responseFormat && item.disableThinking === entry.disableThinking
    );
    if (!known) plan.push(entry);
  };
  add({ responseFormat: true, disableThinking: withFlags });
  add({ responseFormat: false, disableThinking: withFlags });
  add({ responseFormat: false, disableThinking: false });

  let lastError = null;
  for (const attempt of plan) {
    try {
      return await send(attempt.responseFormat, attempt.disableThinking);
    } catch (error) {
      lastError = error;
      if (!error || !error.tryNextShape) throw error;
    }
  }
  throw lastError || new Error('分类模型不可用');
}

/* One batch of bookmarks through the rules and then the model. */
async function classifyBatch(bookmarks, settings) {
  const categories = settings.categories || DEFAULT_CATEGORIES;
  const prompt = buildClassifyPrompt(bookmarks, categories);
  const raw = await callClassifyModel(prompt, settings.model, settings);
  return parseClassifyPayload(raw);
}
