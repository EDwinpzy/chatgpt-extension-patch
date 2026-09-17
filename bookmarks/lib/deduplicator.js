/*
 * Ported from bookmark-sorter (deduplicator.js).
 * Duplicate detection: URL normalisation, similarity pass, removals.
 *
 * Plain script, not a module: the service worker loads it with importScripts.
 * Everything stays inside this function scope, and only the names listed at the
 * bottom are published on self.CodexBookmarks.
 */

(function () {
  'use strict';

/**
 * Deduplicator - 书签去重引擎
 * 检测并处理重复书签
 */

// 跟踪参数黑名单：这些query参数只影响来源统计，不影响内容，去重时剔除
const TRACKING_PARAM_REGEX = [
  /^utm_/i,          // UTM 营销参数: utm_source/utm_medium/utm_campaign...
  /^spm/i,           // 阿里系: spm=.../spm_id_from=...
  /^from$|^from_/i,  // 分享来源: from=singlemessage/from=groupmessage...
  /^source$/i,       // 来源
  /^ref$|^referrer$|^referer$/i, // 来源页
  /^share_/i,        // 分享: share_token/share_uid/share_source...
  /^scene$/i,        // 微信场景
  /^chksm$/i,        // 微博追踪
  /^isappinstalled$/i, // 移动端标记
  /^clicktime$/i,    // 点击时间
  /^st$|^mt$|^ts$|^t$/i,  // 时间戳类（st/mt/ts 常见于分享链接）
  /^wid$|^mid$/i,    // 微信/微博会话ID
  /^r$/i,            // 站内跳转记录（如 bilibili ?r=）
  /^xid$|^token$/i,  // 追踪token
];

/**
 * 判断query参数是否为跟踪参数
 */
function isTrackingParam(name) {
  return TRACKING_PARAM_REGEX.some(re => re.test(name));
}

/**
 * URL标准化 - 去除跟踪参数、hash、排序query、www、默认端口
 * @param {string} url - 原始URL
 * @param {Object} options - 选项
 * @param {boolean} options.ignoreHash - 是否忽略hash部分（默认true）
 * @param {boolean} options.ignoreQuery - 是否完全忽略query参数（默认false）
 * @param {boolean} options.ignoreTrailingSlash - 是否忽略末尾斜杠（默认true）
 * @param {boolean} options.ignoreProtocol - 是否忽略协议差异（默认true，http/https视为相同）
 * @returns {string} 标准化后的URL
 */
function normalizeUrl(url, options = {}) {
  const {
    ignoreHash = true,
    ignoreQuery = false,
    ignoreTrailingSlash = true,
    ignoreProtocol = true,
  } = options;

  try {
    let normalized = url.trim();
    if (!normalized) return normalized;

    // 解析URL各部分（浏览器扩展环境中URL可用；Node测试环境中全局URL也可用）
    const parsed = new URL(normalized);

    // 协议归一：http/https视为相同，统一为 http（需在解析后处理，避免影响默认端口判断）
    let protocol = parsed.protocol;
    if (ignoreProtocol && (protocol === 'http:' || protocol === 'https:')) {
      protocol = 'http:';
    }

    // 去除www前缀（仅对裸域名www，保留子域名如 www2）
    let host = parsed.hostname;
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }

    // 剥离默认端口
    const port = parsed.port;
    const isDefaultPort =
      (parsed.protocol === 'http:' && (port === '80' || port === '')) ||
      (parsed.protocol === 'https:' && (port === '443' || port === ''));
    const portPart = isDefaultPort ? '' : (port ? `:${port}` : '');

    // hash
    const hash = (ignoreHash || !parsed.hash) ? '' : parsed.hash;

    // query: 剔除跟踪参数，剩余参数排序（保证 ?a=1&b=2 与 ?b=2&a=1 等价）
    let query = '';
    if (!ignoreQuery) {
      const params = [];
      parsed.searchParams.forEach((value, key) => {
        if (isTrackingParam(key)) return;
        params.push(`${key}=${value}`);
      });
      params.sort();
      if (params.length > 0) {
        query = '?' + params.join('&');
      }
    }

    // path + trailing slash + 首页文件等价（/index.html 与 / 相同）
    let path = parsed.pathname;
    if (ignoreTrailingSlash) {
      path = path.replace(/\/+$/, '');
      path = path.replace(/\/index\.(?:html?|php|aspx?|jsp|shtml)$/i, '');
    }

    normalized = `${protocol}//${host}${portPart}${path}${query}${hash}`;
    return normalized.toLowerCase();
  } catch {
    // URL解析失败（如非标准scheme），退回到基础处理
    let normalized = url.trim();
    if (ignoreProtocol) {
      normalized = normalized.replace(/^https?:\/\//, 'http://');
    }
    if (ignoreHash) {
      normalized = normalized.split('#')[0];
    }
    if (ignoreQuery) {
      normalized = normalized.split('?')[0];
    }
    if (ignoreTrailingSlash) {
      normalized = normalized.replace(/\/+$/, '');
    }
    return normalized.toLowerCase();
  }
}

/**
 * 规范化标题 - 去除空白、标点差异，用于相似重复检测
 */
function normalizeTitle(title) {
  return (title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')            // 合并空白
    .replace(/[。．.!！?？,，;；:：\-—_·~～/\\|()（）\[\]【】<>《》"'“”‘’#*]+/g, ''); // 去标点
}

/**
 * 提取URL域名（去除 www/m/mobile/wap 变体，用于相似重复检测）
 */
function extractDomain(url) {
  try {
    let host = new URL(url).hostname;
    host = host.replace(/^(?:www|m|mobile|wap)\./, '');
    return host;
  } catch {
    return '';
  }
}

/**
 * 提取URL路径（不含query和hash）
 */
function extractPath(url) {
  try {
    return new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * 检测重复书签
 * 两阶段检测：
 * 1. 精确重复（reason: 'url'） - 标准化URL（剔除跟踪参数后）相同
 * 2. 相似重复（reason: 'title'） - 同域名+同路径+同标题，仅query参数不同（如 ?v=2024 vs ?v=2025）
 * @param {Array} bookmarks - 书签列表 [{id, name, url, path, dateAdded}]
 * @param {Object} options - 去重选项
 * @returns {Array<DuplicateGroup>} 重复分组列表
 */
function findDuplicates(bookmarks, options = {}) {
  const { ignoreQuery = false } = options;

  const groups = [];          // 所有分组（含单例，用于相似检测）
  const urlMap = new Map();   // 标准化URL -> 索引

  // ---- 第一阶段：精确URL重复 ----
  for (const bm of bookmarks) {
    const key = normalizeUrl(bm.url, { ignoreQuery });
    if (!urlMap.has(key)) {
      urlMap.set(key, { key, bookmarks: [], reason: 'url' });
      groups.push(urlMap.get(key));
    }
    urlMap.get(key).bookmarks.push(bm);
  }

  // ---- 第二阶段：相似重复（标题+域名+路径相同，仅参数不同）----
  // 只对"标准化URL唯一"的书签做相似检测，避免重复统计
  const uniqueByUrl = [];
  for (const group of groups) {
    if (group.bookmarks.length === 1) {
      uniqueByUrl.push(group.bookmarks[0]);
    }
  }

  const titleMap = new Map(); // "domain>path>title" -> 书签数组
  for (const bm of uniqueByUrl) {
    const domain = extractDomain(bm.url);
    const path = extractPath(bm.url);
    const title = normalizeTitle(bm.name);
    if (!domain || !title) continue;

    const key = `${domain}>${path}>${title}`;
    if (!titleMap.has(key)) {
      titleMap.set(key, []);
    }
    titleMap.get(key).push(bm);
  }

  for (const [titleKey, bmList] of titleMap) {
    if (bmList.length <= 1) continue;
    // 与URL精确分组合并：如果这些书签已属于某个URL重复分组，则跳过
    const alreadyGrouped = bmList.filter(bm => urlMap.get(normalizeUrl(bm.url, { ignoreQuery })).bookmarks.length > 1);
    if (alreadyGrouped.length > 0) continue;
    groups.push({ key: titleKey, bookmarks: bmList, reason: 'title' });
  }

  // ---- 只返回有重复的分组 ----
  const duplicates = [];
  for (const group of groups) {
    if (group.bookmarks.length <= 1) continue;

    // 按日期排序，最新的在前
    group.bookmarks.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

    // 推荐保留：名称最完整的那个（字数最多），如果相同则保留最新的
    const recommended = group.bookmarks.reduce((best, current) => {
      if ((current.name || '').length > (best.name || '').length) return current;
      if ((current.name || '').length === (best.name || '').length && (current.dateAdded || 0) > (best.dateAdded || 0)) return current;
      return best;
    });

    duplicates.push({
      normalizedUrl: group.key,
      reason: group.reason,
      bookmarks: group.bookmarks,
      recommendedId: recommended.id,
      count: group.bookmarks.length,
    });
  }

  // 按重复数量降序排列（同数量URL精确优先）
  duplicates.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (a.reason === 'url' ? 0 : 1) - (b.reason === 'url' ? 0 : 1);
  });

  return duplicates;
}

/**
 * 执行去重 - 删除非保留的书签
 * @param {Array<DuplicateGroup>} duplicates - 重复分组
 * @param {Set<string>} keepIds - 每组中要保留的书签ID集合
 * @returns {Promise<{removed: number, errors: string[]}>}
 */
async function removeDuplicates(duplicates, keepIds) {
  let removed = 0;
  const errors = [];

  // 收集所有待删除书签
  const toRemove = [];
  for (const group of duplicates) {
    for (const bm of group.bookmarks) {
      if (!keepIds.has(bm.id)) {
        toRemove.push(bm);
      }
    }
  }

  // 分批并发删除（chrome.bookmarks.remove 是异步IPC，串行删除大量书签会很慢）
  const CHUNK_SIZE = 20;
  for (let i = 0; i < toRemove.length; i += CHUNK_SIZE) {
    const chunk = toRemove.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(async (bm) => {
      try {
        await chrome.bookmarks.remove(bm.id);
        removed++;
      } catch (err) {
        errors.push(`删除书签 "${bm.name}" (${bm.url}) 失败: ${err.message}`);
      }
    }));
  }

  return { removed, errors };
}

/**
 * 统计去重信息
 * @param {Array<DuplicateGroup>} duplicates
 * @returns {{totalGroups, totalDuplicates, totalRemovable}}
 */
function getDuplicateStats(duplicates) {
  return {
    totalGroups: duplicates.length,
    totalDuplicates: duplicates.reduce((sum, g) => sum + g.count, 0),
    totalRemovable: duplicates.reduce((sum, g) => sum + g.count - 1, 0),
  };
}

  self.CodexBookmarks = Object.assign(self.CodexBookmarks || {}, {
    normalizeUrl,
    findDuplicates,
    removeDuplicates,
    getDuplicateStats,
  });
})();
