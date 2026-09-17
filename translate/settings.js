/*
 * Translation settings: defaults and storage access.
 *
 * Everything lives under one chrome.storage.local key so the Codex extension's
 * own state is never read or written.
 */

const TRANSLATE_SETTINGS_KEY = 'translateSettings';

/*
 * The shipped local model. TranslateGemma 4B is a translation model built for
 * this job, and measured about 1.7x faster per batch than the 7B it replaced
 * (translation-plan.md, section 17).
 */
const TRANSLATE_DEFAULT_MODEL = {
  id: 'local-translategemma',
  name: 'TranslateGemma-4B',
  kind: 'local',
  baseUrl: 'http://127.0.0.1:11434/v1',
  apiKey: '',
  model: 'translategemma:4b',
};

/* The local model that shipped before it. Anyone still pointing at it is moved
 * across once; re-pulling the old model later stays their own choice. */
const TRANSLATE_MODEL_STAMP = 'local-translategemma-2026-09';
const TRANSLATE_OLD_LOCAL_MODEL = { id: 'local-hunyuan', model: 'hunyuan-mt-7b:latest' };

const TRANSLATE_DEFAULTS = {
  // Which model translates, and which one translates subtitles (empty = same as page translation).
  translateModelId: TRANSLATE_DEFAULT_MODEL.id,
  subtitleModelId: '',
  models: [TRANSLATE_DEFAULT_MODEL],

  // Language and display.
  targetLang: 'zh-CN',
  displayMode: 'replace', // bilingual | replace
  autoTranslateSelection: true,

  // Turning reasoning off for translation requests. Manual switch, never probed.
  disableThinking: true,

  // Whole-page translation runs on every site by default; the list below only
  // carves out exceptions.
  autoTranslateAll: true,
  blockedSites: ['chatgpt.com'],

  // Glossary entries: { from, to }
  glossary: [],

  // Subtitles (behaviour lands with the subtitle stage).
  subtitleEnabled: true,
  subtitleFontSize: 20,
  subtitlePosition: 'bottom', // bottom | top
  subtitleMaxLines: 2,
};

const TARGET_LANGUAGES = [
  { id: 'zh-CN', label: '简体中文' },
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'es', label: 'Español' },
  { id: 'ru', label: 'Русский' },
];

/*
 * Shipped glossary. Nothing here is stored: it travels with the extension, so
 * a wording fix in a later build reaches every install. Terms the user writes
 * win over these, which is also how a built-in gets "edited" - add your own
 * entry with the same source text.
 *
 * Kept to terms where a forced rendering is clearly better than whatever the
 * model improvises: product/UI vocabulary, the words this extension's own
 * subject matter is full of, the AI / finance / technology vocabulary those
 * pages are written in, and brand names that must never be translated
 * ("Command Code" came back as 命令代码 before this list existed).
 */
const TRANSLATE_BUILTIN_GLOSSARY = [
  // Account and product chrome.
  { from: 'API Key', to: 'API 密钥' },
  { from: 'Sign in', to: '登录' },
  { from: 'Sign out', to: '退出登录' },
  { from: 'Billing', to: '账单' },
  { from: 'Subscription', to: '订阅' },
  { from: 'Quota', to: '配额' },
  { from: 'Upgrade', to: '升级' },
  { from: 'Workspace', to: '工作区' },
  { from: 'Dashboard', to: '仪表盘' },
  { from: 'Settings', to: '设置' },

  // Models and AI.
  { from: 'Prompt', to: '提示词' },
  { from: 'System prompt', to: '系统提示词' },
  { from: 'Context window', to: '上下文窗口' },
  { from: 'Fine-tuning', to: '微调' },
  { from: 'Inference', to: '推理' },
  { from: 'Embedding', to: '嵌入' },
  { from: 'Hallucination', to: '幻觉' },
  { from: 'Multimodal', to: '多模态' },
  { from: 'Chain of thought', to: '思维链' },
  { from: 'Few-shot', to: '少样本' },
  { from: 'Tool call', to: '工具调用' },
  { from: 'Rate limit', to: '速率限制' },
  { from: 'Rate limiting', to: '限流' },
  { from: 'Latency', to: '延迟' },
  { from: 'Throughput', to: '吞吐量' },
  { from: 'Large language model', to: '大语言模型' },
  { from: 'AI agent', to: 'AI 智能体' },
  { from: 'Prompt engineering', to: '提示词工程' },
  { from: 'Prompt injection', to: '提示词注入' },
  { from: 'Zero-shot', to: '零样本' },
  { from: 'Retrieval-augmented generation', to: '检索增强生成' },
  { from: 'Vector database', to: '向量数据库' },
  { from: 'Knowledge base', to: '知识库' },
  { from: 'Attention mechanism', to: '注意力机制' },
  { from: 'Mixture of experts', to: '混合专家' },
  { from: 'Knowledge distillation', to: '知识蒸馏' },
  { from: 'Quantization', to: '量化' },

  // Engineering.
  { from: 'Repository', to: '仓库' },
  { from: 'Commit', to: '提交' },
  { from: 'Branch', to: '分支' },
  { from: 'Merge', to: '合并' },
  { from: 'Pull request', to: '拉取请求' },
  { from: 'Deploy', to: '部署' },
  { from: 'Build', to: '构建' },
  { from: 'Container', to: '容器' },
  { from: 'Cache', to: '缓存' },
  { from: 'Sandbox', to: '沙箱' },
  { from: 'Endpoint', to: '端点' },
  { from: 'Middleware', to: '中间件' },
  { from: 'Framework', to: '框架' },
  { from: 'Refactor', to: '重构' },
  { from: 'Environment variable', to: '环境变量' },
  { from: 'Timeout', to: '超时' },
  { from: 'Retry', to: '重试' },
  { from: 'Fallback', to: '回退' },

  /*
   * Finance. The bare words that carry an everyday meaning as well - Options,
   * Call, Put, Bond, Long, Short - stay out: a hit forces the rendering on
   * every page, and "Options" is a settings menu far more often than it is a
   * contract. Multi-word forms are the ones worth pinning.
   */
  { from: 'Market cap', to: '市值' },
  { from: 'Valuation', to: '估值' },
  { from: 'Dividend', to: '股息' },
  { from: 'Yield', to: '收益率' },
  { from: 'Revenue', to: '营收' },
  { from: 'Cash flow', to: '现金流' },
  { from: 'Balance sheet', to: '资产负债表' },
  { from: 'Gross margin', to: '毛利率' },
  { from: 'Fiscal year', to: '财年' },
  { from: 'Buyback', to: '回购' },
  { from: 'Interest rate', to: '利率' },
  { from: 'Inflation', to: '通货膨胀' },
  { from: 'Liquidity', to: '流动性' },
  { from: 'Volatility', to: '波动率' },
  { from: 'Leverage', to: '杠杆' },
  { from: 'Short selling', to: '做空' },
  { from: 'Bull market', to: '牛市' },
  { from: 'Bear market', to: '熊市' },
  { from: 'Hedge fund', to: '对冲基金' },
  { from: 'Private equity', to: '私募股权' },
  { from: 'Venture capital', to: '风险投资' },
  { from: 'Portfolio', to: '投资组合' },

  // Machine learning and the layers under a model.
  { from: 'Machine learning', to: '机器学习' },
  { from: 'Deep learning', to: '深度学习' },
  { from: 'Reinforcement learning', to: '强化学习' },
  { from: 'Neural network', to: '神经网络' },
  { from: 'Computer vision', to: '计算机视觉' },
  { from: 'Speech recognition', to: '语音识别' },

  // Technology, infrastructure and hardware.
  { from: 'Cloud computing', to: '云计算' },
  { from: 'Data center', to: '数据中心' },
  { from: 'Edge computing', to: '边缘计算' },
  { from: 'Quantum computing', to: '量子计算' },
  { from: 'Open source', to: '开源' },
  { from: 'Microservice', to: '微服务' },
  { from: 'Load balancing', to: '负载均衡' },
  { from: 'Bandwidth', to: '带宽' },
  { from: 'Firewall', to: '防火墙' },
  { from: 'Encryption', to: '加密' },
  { from: 'Authentication', to: '身份验证' },
  { from: 'Authorization', to: '授权' },
  { from: 'Two-factor authentication', to: '双因素认证' },
  { from: 'Blockchain', to: '区块链' },
  { from: 'Smart contract', to: '智能合约' },
  { from: 'Supply chain', to: '供应链' },
  { from: 'Semiconductor', to: '半导体' },
  { from: 'Wafer', to: '晶圆' },
  { from: 'Lithography', to: '光刻' },
  { from: 'Advanced packaging', to: '先进封装' },
  { from: 'Autonomous driving', to: '自动驾驶' },

  /*
   * Names that have to survive translation unchanged (原文与译法相同).
   *
   * Deliberately narrow: a name only belongs here when a Chinese rendering
   * would be wrong or odd. Product names, vendors, operating systems,
   * languages, file formats and hardware - not ordinary English words that
   * happen to look like a name ("Edge" is out, "Microsoft Edge" is in, so a
   * sentence about edge cases is never touched).
   */
  // AI products and vendors.
  { from: 'ChatGPT', to: 'ChatGPT' },
  { from: 'Codex', to: 'Codex' },
  { from: 'OpenAI', to: 'OpenAI' },
  { from: 'GPT', to: 'GPT' },
  { from: 'Claude', to: 'Claude' },
  { from: 'Anthropic', to: 'Anthropic' },
  { from: 'Gemini', to: 'Gemini' },
  { from: 'Copilot', to: 'Copilot' },
  { from: 'Ollama', to: 'Ollama' },
  { from: 'Hugging Face', to: 'Hugging Face' },
  { from: 'Transformer', to: 'Transformer' },
  { from: 'LLM', to: 'LLM' },
  { from: 'RAG', to: 'RAG' },
  { from: 'Llama', to: 'Llama' },

  // The tools this extension plugs into.
  { from: 'Command Code', to: 'Command Code' },
  { from: 'OpenCode', to: 'OpenCode' },
  { from: 'DeepSeek', to: 'DeepSeek' },
  { from: 'GitHub', to: 'GitHub' },
  { from: 'VS Code', to: 'VS Code' },
  { from: 'Node.js', to: 'Node.js' },
  { from: 'npm', to: 'npm' },
  { from: 'Python', to: 'Python' },
  { from: 'JavaScript', to: 'JavaScript' },
  { from: 'TypeScript', to: 'TypeScript' },
  { from: 'React', to: 'React' },
  { from: 'Docker', to: 'Docker' },
  { from: 'Kubernetes', to: 'Kubernetes' },
  { from: 'JSON', to: 'JSON' },
  { from: 'HTML', to: 'HTML' },
  { from: 'CSS', to: 'CSS' },
  { from: 'SQL', to: 'SQL' },
  { from: 'API', to: 'API' },
  { from: 'URL', to: 'URL' },
  { from: 'GPU', to: 'GPU' },
  { from: 'CPU', to: 'CPU' },
  { from: 'RTX', to: 'RTX' },

  // Shorthand these pages write as-is in every language.
  { from: 'CUDA', to: 'CUDA' },
  { from: 'TPU', to: 'TPU' },
  { from: 'HBM', to: 'HBM' },
  { from: 'SSD', to: 'SSD' },
  { from: 'SaaS', to: 'SaaS' },
  { from: 'ETF', to: 'ETF' },
  { from: 'IPO', to: 'IPO' },

  // Vendors and platforms.
  { from: 'Microsoft', to: 'Microsoft' },
  { from: 'Microsoft Edge', to: 'Microsoft Edge' },
  { from: 'Google', to: 'Google' },
  { from: 'Apple', to: 'Apple' },
  { from: 'NVIDIA', to: 'NVIDIA' },
  { from: 'Windows', to: 'Windows' },
  { from: 'macOS', to: 'macOS' },
  { from: 'Linux', to: 'Linux' },
  { from: 'Android', to: 'Android' },
  { from: 'iOS', to: 'iOS' },
  { from: 'iPhone', to: 'iPhone' },
];

/* Built-ins plus the user's own entries, where the user's entry wins. */
function mergeGlossary(userEntries) {
  const own = (Array.isArray(userEntries) ? userEntries : []).filter((entry) => entry && entry.from && entry.to);
  const taken = {};
  own.forEach((entry) => {
    taken[String(entry.from).trim().toLowerCase()] = true;
  });
  const builtin = TRANSLATE_BUILTIN_GLOSSARY.filter((entry) => !taken[entry.from.toLowerCase()]);
  return builtin.concat(own);
}

/*
 * Entries whose two sides are the same word are not translations: they say
 * "this is a name, leave it alone" (ChatGPT -> ChatGPT). Both the prompt and
 * the settings table read them that way.
 */
function translateKeepNames(list) {
  return (Array.isArray(list) ? list : []).filter(
    (entry) =>
      entry &&
      entry.from &&
      entry.to &&
      String(entry.from).trim().toLowerCase() === String(entry.to).trim().toLowerCase()
  );
}

/*
 * 2026-09 layout fix. Bilingual mode now writes the translation into the text
 * that is already there instead of wrapping it in its own box, but extra text
 * still makes narrow rows taller, so the default became 仅译文. Anyone still on
 * the old default is moved across once; the stamp is stored, so a later manual
 * choice sticks.
 */
const TRANSLATE_LAYOUT_STAMP = 'inline-2026-09';

/*
 * Field names that gateways use to switch reasoning off differ per vendor, so
 * the switch sends one combined set. This is the combination the reference
 * extension proved out across Hy3/vLLM, Qwen-family gateways and generic
 * OpenAI-compatible relays.
 */
const NO_THINK_PARAMS = {
  reasoning: { effort: 'none' },
  reasoning_effort: 'none',
  chat_template_kwargs: { reasoning_effort: 'no_think' },
  enable_thinking: false,
  thinking: { type: 'disabled' },
};

function translateSettingsDefaults() {
  return JSON.parse(JSON.stringify(TRANSLATE_DEFAULTS));
}

async function readTranslateSettings() {
  let stored = null;
  try {
    const bag = await chrome.storage.local.get(TRANSLATE_SETTINGS_KEY);
    stored = bag ? bag[TRANSLATE_SETTINGS_KEY] : null;
  } catch (error) {
    stored = null;
  }
  const merged = Object.assign(translateSettingsDefaults(), stored || {});
  if (!Array.isArray(merged.models) || merged.models.length === 0) {
    merged.models = translateSettingsDefaults().models;
  }
  if (!Array.isArray(merged.glossary)) merged.glossary = [];
  if (!Array.isArray(merged.blockedSites)) merged.blockedSites = [];
  if (merged.modelStamp !== TRANSLATE_MODEL_STAMP) {
    merged.modelStamp = TRANSLATE_MODEL_STAMP;
    const old = merged.models.find(
      (model) =>
        model &&
        (String(model.id) === TRANSLATE_OLD_LOCAL_MODEL.id ||
          String(model.model) === TRANSLATE_OLD_LOCAL_MODEL.model)
    );
    if (old) {
      /*
       * If the new model is already in the list, the old entry is a leftover
       * from adding it by hand: drop it rather than leaving two cards for the
       * same thing. Otherwise the entry is moved across in place.
       */
      const twin = merged.models.find(
        (model) =>
          model !== old &&
          String(model.baseUrl) === TRANSLATE_DEFAULT_MODEL.baseUrl &&
          String(model.model) === TRANSLATE_DEFAULT_MODEL.model
      );
      const replacementId = twin ? twin.id : TRANSLATE_DEFAULT_MODEL.id;
      /* Read the id before the entry is rewritten: the model in use has to be
       * matched against what it was called, not what it just became. */
      const oldId = String(old.id || '');
      if (twin) {
        merged.models = merged.models.filter((model) => model !== old);
      } else {
        Object.assign(old, TRANSLATE_DEFAULT_MODEL);
      }
      if (String(merged.translateModelId || '') === oldId) {
        merged.translateModelId = replacementId;
      }
      if (String(merged.subtitleModelId || '') === oldId) {
        merged.subtitleModelId = replacementId;
      }
    }
    chrome.storage.local.set({ [TRANSLATE_SETTINGS_KEY]: merged }).catch(() => {});
  }
  if (merged.layoutStamp !== TRANSLATE_LAYOUT_STAMP) {
    merged.layoutStamp = TRANSLATE_LAYOUT_STAMP;
    if (merged.displayMode === 'bilingual') merged.displayMode = 'replace';
    chrome.storage.local.set({ [TRANSLATE_SETTINGS_KEY]: merged }).catch(() => {});
  }
  return merged;
}

async function writeTranslateSettings(patch) {
  const current = await readTranslateSettings();
  const next = Object.assign(current, patch || {});
  await chrome.storage.local.set({ [TRANSLATE_SETTINGS_KEY]: next });
  return next;
}

/* Resolves the model used for a given purpose, falling back to the first one. */
function pickModel(settings, idKey) {
  const wanted = String(settings[idKey] || '');
  if (wanted) {
    const hit = settings.models.find((model) => String(model.id) === wanted);
    if (hit) return hit;
  }
  return settings.models[0] || null;
}

/*
 * The models one translation is allowed to use, in the order it may use them:
 * the one the settings point at, then the rest of the list in the order the
 * user arranged it.
 *
 * A model that cannot be reached is not the end of the run - the next entry
 * picks the work up (section 30). Entries that are missing an address or a
 * model name are not candidates at all: they cannot translate anything, so
 * spending a request on them would only delay the model that can.
 */
function translateModelCandidates(settings, idKey) {
  const list = Array.isArray(settings.models) ? settings.models : [];
  const first = pickModel(settings, idKey);
  const ordered = first ? [first].concat(list.filter((model) => model !== first)) : list.slice();
  const seen = {};
  return ordered.filter((model) => {
    if (!model || !model.baseUrl || !model.model) return false;
    /* Two cards pointing at one endpoint and one model name are one model,
     * however they are named - asking the same server twice buys nothing. */
    const key = String(model.baseUrl) + '\u0000' + String(model.model);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function hostMatches(hostname, patterns) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  for (const raw of patterns || []) {
    const pattern = String(raw || '').trim().toLowerCase();
    if (!pattern) continue;
    const bare = pattern.replace(/^\*\./, '');
    if (host === bare || host.endsWith('.' + bare)) return true;
  }
  return false;
}
