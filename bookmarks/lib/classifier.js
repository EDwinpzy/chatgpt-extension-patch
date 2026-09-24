/*
 * Ported from bookmark-sorter (classifier.js).
 * Classification: domain and keyword rules first, the model for the rest.
 *
 * Plain script, not a module: the service worker loads it with importScripts.
 * Everything stays inside this function scope, and only the names listed at the
 * bottom are published on self.CodexBookmarks.
 */

(function () {
  'use strict';

/**
 * AI Classifier - AI分类引擎
 * 调用自定义API（DeepSeek/OpenAI等）对书签进行智能分类
 */

// 默认分类体系（一级扁平结构，与当前收藏栏实际文件夹一致）
const DEFAULT_CATEGORIES = [
  { name: '财经', children: [] },
  { name: '新闻', children: [] },
  { name: 'AI', children: [] },
  { name: '社交', children: [] },
  { name: '视频', children: [] },
  { name: '娱乐', children: [] },
  { name: '学习', children: [] },
  { name: '开发', children: [] },
  { name: '购物', children: [] },
  { name: '美食', children: [] },
  { name: '旅行', children: [] },
  { name: '健康', children: [] },
  { name: '工具', children: [] },
];

/**
 * 将分类树扁平化为文本描述，供AI理解
 */
function flattenCategories(categories, prefix = '') {
  let lines = [];
  for (const cat of categories) {
    const fullName = prefix ? `${prefix} > ${cat.name}` : cat.name;
    lines.push(fullName);
    if (cat.children && cat.children.length > 0) {
      lines.push(...flattenCategories(cat.children, fullName));
    }
  }
  return lines;
}

/**
 * 提取书签URL的域名，辅助AI判断分类
 */
function extractHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * 域名规则表：域名(去www) → 推荐分类
 * 确定性规则优先于AI判断，命中即不再调用AI，保证常见站点分类100%准确
 * 门户网站（新浪/网易/腾讯等）只收录具体子域名，避免粗粒度误分
 */
const DOMAIN_RULES = [
  {
    category: 'AI',
    domains: [
      'xfyun.cn', 'iflytek.com', 'iflytek.cn', 'iflytek.com.cn', // 科大讯飞
      'maas.xfyun.cn', // 讯飞开放平台(大模型平台)
      'openai.com', 'chatgpt.com', 'claude.ai', 'anthropic.com',
      'huggingface.co', 'huggingface.cn', 'deepseek.com', 'deepseek.cn',
      'platform.deepseek.com', // DeepSeek开放平台
      'moonshot.cn', 'kimi.moonshot.cn', 'platform.kimi.com', // Kimi
      'zhipuai.cn', 'bigmodel.cn', // 智谱AI
      'baichuan-ai.com', 'doubao.com', 'tongyi.aliyun.com', 'qwen.ai',
      'jina.ai', 'lmarena.ai', 'mistral.ai', 'stability.ai',
      'midjourney.com', 'runwayml.com', 'coze.cn', 'dify.ai',
      'ollama.com', 'langchain.com', 'hunyuan.tencent.com',
      'volcengine.com', 'ark.cn-beijing.volces.com', // 火山引擎方舟(豆包/大模型)
      'siliconflow.cn', 'siliconflow.com', // 硅基流动
      'skillhub.cn', 'opencode.ai', 'workbuddy.cn', 'z.ai', // AI工具/平台
      'github.com', // 用户明确归入AI（GitHub探索/协作开发平台）
    ],
  },
  {
    category: '财经',
    domains: [
      'xueqiu.com', 'eastmoney.com', '10jqka.com.cn', 'cninfo.com.cn',
      'cls.cn', 'hexun.com', 'wallstreetcn.com', 'yicai.com', 'jin10.com',
      'jisilu.cn', 'finance.sina.com.cn', 'money.163.com', 'finance.qq.com',
      'stockstar.com', 'futunn.com', 'tigerbrokers.com', 'ibkr.com',
      'ftchinese.com', 'bloomberg.com', 'wsj.com', 'caixin.com',
      '21jingji.com', 'stcn.com', 'investing.com', 'cs.com.cn',
      'tgb.cn',
    ],
  },
  {
    category: '新闻',
    domains: [
      'people.com.cn', 'xinhuanet.com', 'news.cn', 'chinanews.com.cn',
      'ce.cn', 'thepaper.cn', 'huanqiu.com', 'gmw.cn', 'news.sina.com.cn',
      'news.163.com', 'news.qq.com', 'news.sohu.com', 'news.cctv.com',
      'cctv.com', 'china.com.cn', 'ithome.com', '36kr.com', 'huxiu.com',
      'cnbeta.com', 'ifeng.com', 'sohu.com', 'bbc.com', 'nytimes.com',
      'nationalgeographic.com', 'foxnews.com', 'gjrwls.com',
    ],
  },
  {
    category: '社交',
    domains: [
      'weibo.com', 'x.com', 'twitter.com', 'reddit.com', 'weixin.qq.com',
      'zhihu.com', 'tieba.baidu.com', 'douban.com', 'xiaohongshu.com',
      'instagram.com', 'facebook.com', 'telegram.org', 'discord.com',
    ],
  },
  {
    category: '视频',
    domains: [
      'bilibili.com', 'b23.tv', 'youtube.com', 'youtu.be', 'douyin.com',
      'iesdouyin.com', 'kuaishou.com', 'iqiyi.com', 'youku.com', 'v.qq.com',
      'tiktok.com', 'netflix.com', 'twitch.tv', 'huya.com', 'douyu.com',
      'zhanqi.tv', 'tudou.com', 'acfun.cn',
    ],
  },
  {
    category: '娱乐',
    domains: [
      'music.163.com', 'y.qq.com', 'kugou.com', 'kuwo.com', 'taptap.cn',
      '4399.com', 'qidian.com', 'zongheng.com', '17k.com', 'maoyan.com',
      'mtime.com', 'bcy.net', 'steampowered.com', 'steamcommunity.com',
      'weread.qq.com', 'zxcs.zip', 'robertsspaceindustries.com',
    ],
  },
  {
    category: '学习',
    domains: [
      'coursera.org', 'edx.org', 'udemy.com', 'khanacademy.org',
      'icourse163.org', 'xuetangx.com', 'ted.com', 'w3schools.com',
      'runoob.com', 'freecodecamp.org', 'codecademy.com', 'duolingo.com',
      'busuu.com', 'englishclub.com', 'zhihu.com', 'csdn.net',
    ],
  },
  {
    category: '开发',
    domains: [
      'gitee.com', 'gitlab.com', 'stackoverflow.com',
      'segmentfault.com', 'csdn.net', 'cnblogs.com', 'juejin.cn',
      'developer.mozilla.org', 'npmjs.com', 'pypi.org', 'maven.apache.org',
      'crates.io', 'rubygems.org', 'developer.android.com',
      'developer.apple.com', 'learn.microsoft.com',
      'leetcode.cn', 'leetcode.com', 'nowcoder.com', 'luogu.com.cn',
      'v2ex.com', 'infoq.cn',
    ],
  },
  {
    category: '购物',
    domains: [
      'taobao.com', 'tmall.com', 'jd.com', 'pinduoduo.com', 'suning.com',
      'vip.com', 'gome.com.cn', 'yangkeduo.com', '1688.com', 'amazon.com',
      'amazon.cn', 'ebay.com', 'smzdm.com', 'detail.tmall.com',
    ],
  },
  {
    category: '美食',
    domains: [
      'meituan.com', 'dianping.com', 'ele.me', 'xiachufang.com',
      'meishij.net', 'douguo.com', 'yummly.com', 'allrecipes.com',
      'wufazhuce.com', 'huoguo.com', 'canyin88.com',
    ],
  },
  {
    category: '旅行',
    domains: [
      'ctrip.com', 'qunar.com', 'tuniu.com', 'ly.com', 'elong.com',
      'airbnb.com', 'booking.com', 'agoda.com', 'tripadvisor.com',
      'mafengwo.cn', 'qyer.com', 'fliggy.com', '12306.cn', 'feizhu.com',
      'expedia.com', 'kayak.com',
    ],
  },
  {
    category: '健康',
    domains: [
      'dxy.cn', 'mijian.com', 'chaonei.com', 'dayi.org.cn', 'msdmanuals.cn',
      'webmd.com', 'mayoclinic.org', 'healthline.com', 'medsci.cn',
      'guokr.com', 'jiankang.com', '39.net',
    ],
  },
  {
    category: '工具',
    domains: [
      'baidu.com', 'google.com', 'google.com.hk', 'bing.com',
      'dict.youdao.com', 'iciba.com', 'pan.baidu.com', 'aliyundrive.com',
      'wps.cn', 'office.com', 'notion.so', 'feishu.cn', 'larksuite.com', 'yuque.com',
      'figma.com', 'adobe.com', 'docs.qq.com', 'doc.weixin.qq.com',
      'xunlei.com', 'speedtest.net', 'translate.google.com',
      'canva.cn', 'canva.com', 'draw.io', 'excalidraw.com', 'whimsical.com',
      'apifox.com', 'postman.com', 'swagger.io', 'json.cn', 'tool.lu',
      'sotool.cc', 'uutool.cn', 'jiemian', 'zhanzhang.baidu.com',
      'tinypng.com', 'compress', 'convertio.co', 'ilovepdf.com',
      'smallpdf.com', 'regex101.com', 'carbon.now.sh', 'zhipin.com',
      'mail.qq.com', 'api-flowercloud.com', 'haowallpaper.com',
    ],
  },
];

/**
 * 标题关键词规则表：按顺序匹配，先命中者优先（工具放最后，避免"在线视频"被"在线"抢走）
 */
const KEYWORD_RULES = [
  {
    category: 'AI',
    keywords: [
      '大模型', '人工智能', '机器学习', '深度学习', '神经网络', '讯飞', '星火',
      '文心一言', '通义', '豆包', '智谱', 'kimi', 'chatgpt', 'openai', 'claude',
      'deepseek', 'glm', 'grok', 'midjourney', 'stable diffusion',
      'huggingface', 'langchain', 'prompt', '提示词', '智能体', 'aigc',
      'ai绘画', 'ai写作', 'ai生成', 'ai助手', 'ai智能',
    ],
    regex: /\bai\b/i, // 独立英文词 AI（"AI绘画"命中，"email"不命中）
  },
  {
    category: '视频',
    keywords: ['视频', '直播', '电视剧', '综艺', '番剧', '动漫', '纪录片', 'vlog', '解说', '弹幕', '影视'],
  },
  {
    category: '娱乐',
    keywords: ['电影', '音乐', '游戏', '小说', '漫画', '演唱会', '壁纸', '表情包', '搞笑', '段子', '明星', '八卦', '桌游', '剧本杀'],
  },
  {
    category: '财经',
    keywords: [
      '股票', '基金', 'a股', '美股', '港股', '财报', '研报', '行情', '股价',
      '涨停', '跌停', 'k线', '炒股', '理财', '投资', '股市', '上证指数',
      '深证成指', '创业板', '科创板', '纳斯达克', '道琼斯', '标普', 'etf',
      '债券', '国债', '利率', '降准', '降息', '通胀', 'gdp', '龙头',
      '市盈率', '分红', '股息', '打新', '可转债', '期权', '期货', '外汇',
      '黄金', '比特币', '区块链',
    ],
  },
  {
    category: '新闻',
    keywords: ['新闻', '快讯', '头条', '要闻', '时政', '日报', '早报', '晚报', '资讯', '报道', '突发', '热点', '时评', '央视', '新华社', '人民日报'],
  },
  {
    category: '社交',
    keywords: ['知乎', '贴吧', '论坛', '社区', '豆瓣', '朋友圈', '粉丝', '社交', '博主', '社群', '群聊', '小红书', '微博', 'twitter', 'reddit', 'discord'],
  },
  {
    category: '开发',
    keywords: ['代码', '编程', '前端', '后端', 'java', 'python', 'javascript', 'typescript', 'react', 'vue', 'node', 'docker', 'kubernetes', 'api', '接口', '数据库', 'mysql', 'sql', 'redis', 'linux', 'shell', '脚本', '框架', '库', '依赖', '部署', '调试', 'bug', '开源', 'gitlab', 'npm', 'pip', 'npm包', '脚手架', 'webpack', 'vite', '算法', '数据结构', '刷题', 'leetcode', '开发', '程序员', '代码库', 'sdk', 'sass', '前端框架', '后端开发', '微服务', '架构', '云服务', 'cuda'],
    regex: /\b(js|ts|css|html|sql|api|git|dev|code|programming|developer)\b/i,
  },
  {
    category: '学习',
    keywords: ['教程', '课程', '学习', '教学', '入门', '进阶', '笔记整理', '公开课', '慕课', '网课', '英语', '背单词', '语法', '学习方法', '读书笔记', '书单', '文献', '论文', '考研', '公务员', '考证', 'coursera', 'udemy', 'khan', 'ted演讲', '知识', '教育', '考试', '题库', '网课', '训练营', 'workshop', 'lecture', 'tutorial'],
  },
  {
    category: '购物',
    keywords: ['淘宝', '天猫', '京东', '拼多多', '苏宁', '购物', '下单', '商品', '商城', '促销', '优惠券', '剁手', '网购', '亚马逊', '秒杀', '比价', '值得买', '购物车', '加购', '团购'],
  },
  {
    category: '美食',
    keywords: ['食谱', '菜谱', '美食', '做饭', '下厨房', '烹饪', '烘焙', '蛋糕', '家常菜', '小吃', '餐厅', '探店', '外卖', '奶茶', '咖啡', '火锅', '烧烤', '料理', '甜品', '零食', '早餐', '晚餐', '夜宵', '点菜', '菜式', '调料'],
  },
  {
    category: '旅行',
    keywords: ['旅行', '旅游', '攻略', '游记', '景点', '机票', '酒店', '民宿', '签证', '出境', '自由行', '跟团', '行程', '地图', '导航', '目的地', '出发', '打卡', '风景', '住宿', '攻略'],
  },
  {
    category: '健康',
    keywords: ['健康', '养生', '锻炼', '健身', '瑜伽', '跑步', '减肥', '饮食健康', '营养', '维生素', '睡眠', '冥想', '心理', '疾病', '症状', '治疗', '医院', '医生', '药品', '疫苗', '体检', '运动', '拉伸', '康复', '免疫力', '护肤', '早睡', '作息'],
  },
  {
    category: '工具',
    keywords: [
      '工具', '计算器', '转换', '压缩', '解压', 'pdf', 'ocr', '翻译', '词典',
      '字典', '笔记', '备忘录', '日历', '邮箱', '邮件', '网盘', '云盘', '同步',
      '快捷键', '编辑器', '截图', '录屏', '模板', '图床', '短链', '二维码',
      '待办', '番茄', '思维导图', '流程图', '原型', '正则', 'json', '格式化',
      'base64', 'markdown', '导航', '在线工具', '工具箱', '在线转换',
      '证件照', '抠图', '去水印', '在线ps', '在线压缩', '图床', '免费api',
      '接口测试', 'postman', 'apifox', '正则测试', '在线调试',
    ],
  },
];

/**
 * 对单个书签应用确定性规则（域名优先，其次标题关键词）
 * @param {Object} bm - {name, url}
 * @param {Set<string>} categoryNameSet - 用户分类体系中的合法分类名（小写归一）
 * @returns {string|null} 命中的分类名；未命中返回null
 */
function matchRule(bm, categoryNameSet) {
  const host = extractHostname(bm.url);
  const title = (bm.name || '').toLowerCase();

  // 域名规则（优先，比关键词更可靠）
  for (const rule of DOMAIN_RULES) {
    const target = normalizeCategoryName(rule.category);
    if (!categoryNameSet.has(target)) continue; // 用户分类体系中没有该分类，跳过此规则
    if (rule.domains.some(d => host === d || host.endsWith('.' + d))) {
      return rule.category;
    }
  }

  // 标题关键词规则
  for (const rule of KEYWORD_RULES) {
    const target = normalizeCategoryName(rule.category);
    if (!categoryNameSet.has(target)) continue;
    if (rule.keywords.some(k => title.includes(k))) return rule.category;
    if (rule.regex && rule.regex.test(title)) return rule.category;
  }

  return null;
}

/**
 * 批量应用确定性规则，返回已分类与未分类两部分
 * @param {Array} bookmarks
 * @param {Array} validCategories - collectValidCategories 的结果
 * @returns {{ruled: Array<{id, category: string[]}>, unrouted: Array}}
 */
function applyRules(bookmarks, validCategories) {
  const categoryNameSet = new Set(validCategories.map(v => normalizeCategoryName(v.name)));
  const ruled = [];
  const unrouted = [];
  for (const bm of bookmarks) {
    const category = matchRule(bm, categoryNameSet);
    if (category) {
      ruled.push({ id: bm.id, category: [category] });
    } else {
      unrouted.push(bm);
    }
  }
  return { ruled, unrouted };
}

/**
 * 分类说明：帮助AI理解每个分类的语义，减少误判到"工具"
 */
const CATEGORY_DESCRIPTIONS = {
  '财经': '股票、基金、理财、投资、财报、行情、经济、金融',
  '新闻': '新闻、时政、资讯、快讯、媒体报道、热点事件',
  'AI': '人工智能、大模型、ChatGPT、AI工具、机器学习、AIGC、提示词',
  '社交': '微信、微博、知乎、贴吧、社区、论坛、博客、SNS',
  '视频': '视频、直播、影视、番剧、综艺、视频平台',
  '娱乐': '游戏、音乐、电影、小说、漫画、娱乐八卦、明星',
  '学习': '教程、课程、网课、英语、学习资料、考试、知识、慕课',
  '开发': '编程、代码、前端、后端、Git、GitHub、数据库、开发工具、程序员',
  '购物': '网购、淘宝、京东、电商、商城、优惠、商品',
  '美食': '食谱、菜谱、做饭、餐厅、探店、美食、烹饪、外卖',
  '旅行': '旅游、攻略、景点、机票、酒店、民宿、出行、游记',
  '健康': '健康、养生、健身、运动、医疗、心理、营养、体检',
  '工具': '在线工具、计算器、翻译、转换、笔记、网盘、编辑器、效率工具',
};

/**
 * 构建AI分类的Prompt
 * 传完整分类树（含子分类路径）、分类说明、few-shot示例、域名提示
 * @param {Array} bookmarks - 待分类书签列表 [{id, name, url}]
 * @param {Array} categories - 分类体系
 * @returns {string}
 */
function buildClassifyPrompt(bookmarks, categories, instruction = '') {
  const categoryLines = flattenCategories(categories || DEFAULT_CATEGORIES);
  const customInstruction = instruction == null ? '' : String(instruction);
  const hasInstruction = customInstruction.trim().length > 0;
  const instructionBlock = hasInstruction
    ? `自定义整理要求：\n${customInstruction}\n\n`
    : '';
  const customRule = hasInstruction
    ? '\n6. 按上方自定义要求逐一判断；仅当书签明确符合删除条件时才返回 action:"delete"，其余书签必须正常分类，不能漏项。'
    : '';
  const responseContract = hasInstruction
    ? `返回JSON数组，每项含id，并且只能二选一：删除时使用{"id":"123","action":"delete"}；保留时使用{"id":"456","category":"AI"}。只有明确要求删除时才能返回action:"delete"。每个书签都必须恰好返回一项。`
    : `返回JSON数组，每项含id和category，如：
[{"id":"123","category":"财经"},{"id":"456","category":"AI"},{"id":"789","category":"工具"}]`;
  const categoryList = categoryLines.map(line => {
    const topName = line.split(' > ')[0];
    const desc = CATEGORY_DESCRIPTIONS[topName] ? `（${CATEGORY_DESCRIPTIONS[topName]}）` : '';
    return `- ${line}${desc}`;
  }).join('\n');

  const bookmarkList = bookmarks.map((bm, i) => {
    const host = extractHostname(bm.url);
    const createdAt = hasInstruction
      ? ` | 创建时间:${formatBookmarkDateAdded(bm.dateAdded)}`
      : '';
    return `${i + 1}. [ID:${bm.id}] "${bm.name}"${createdAt} | 域名:${host} | URL:${bm.url}`;
  }).join('\n');

  // few-shot 示例（与默认分类体系对应）
  const examples = [
    { name: '雪球 - 白酒板块今日异动', url: 'https://xueqiu.com/12345', category: '财经' },
    { name: 'ChatGPT 使用技巧合集', url: 'https://juejin.cn/post/123', category: 'AI' },
    { name: '人民日报今日要闻', url: 'https://people.com.cn/abc', category: '新闻' },
  ].map(ex => {
    const host = extractHostname(ex.url);
    return `示例：${ex.name} (域名:${host}) → "${ex.category}"`;
  }).join('\n');

  return `${instructionBlock}你是书签分类助手。将以下书签归入给定的分类体系，返回JSON。

分类体系（可归入一级或子分类，多级用">"连接，括号内为该分类含义）：
${categoryList}

规则：
1. 只能使用上面列出的分类名，不要创建新分类；
2. 优先归入最具体的子分类；拿不准时归入对应一级分类；
3. 根据书签名称和URL域名，选择语义最接近的分类；
4. 仅当书签确实无法归入任何分类、或信息过于模糊时，才归入"工具"；
5. 不要因为不确定就随意放入"工具"。${customRule}

${examples}

书签：
${bookmarkList}

${responseContract}`;
}

function formatBookmarkDateAdded(dateAdded) {
  let timestamp;
  if (typeof dateAdded === 'number' && Number.isFinite(dateAdded)) {
    timestamp = dateAdded;
  } else if (typeof dateAdded === 'string' && dateAdded.trim()) {
    timestamp = Date.parse(dateAdded);
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '未知';
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 从分类树中收集所有合法分类路径（含子分类）
 * @param {Array} categories - 分类体系
 * @returns {Array<{name, path, fullPath}>} 合法分类列表
 */
function collectValidCategories(categories, prefix = []) {
  const valid = [];
  for (const cat of categories || []) {
    const path = [...prefix, cat.name];
    valid.push({ name: cat.name, path, fullPath: path.join(' > ') });
    if (cat.children && cat.children.length > 0) {
      valid.push(...collectValidCategories(cat.children, path));
    }
  }
  return valid;
}

/**
 * 规范化分类名（去空白、小写），用于模糊匹配
 */
function normalizeCategoryName(name) {
  return (name || '').trim().replace(/\s+/g, '').toLowerCase();
}

/**
 * 同义词映射：AI可能使用"合理但不属于用户分类体系"的分类名，
 * 映射到语义最接近的标准分类。仅作兜底，避免一律回退"工具"。
 */
const CATEGORY_SYNONYMS = {
  '科技': ['AI', '开发'],
  '技术': ['开发'],
  '工程': ['开发'],
  '计算机': ['开发'],
  '软件': ['工具', '开发'],
  '编程': ['开发'],
  '代码': ['开发'],
  '学习': ['学习'],
  '教育': ['学习'],
  '课程': ['学习'],
  '教程': ['学习'],
  '培训': ['学习'],
  '英语': ['学习'],
  '外语': ['学习'],
  '资料': ['工具'],
  '文档': ['工具'],
  '文件': ['工具'],
  '办公': ['工具'],
  '效率': ['工具'],
  '生产力': ['工具'],
  '购物': ['购物'],
  '电商': ['购物'],
  '网购': ['购物'],
  '美食': ['美食'],
  '餐饮': ['美食'],
  '做饭': ['美食'],
  '烹饪': ['美食'],
  '旅行': ['旅行'],
  '旅游': ['旅行'],
  '出行': ['旅行'],
  '健康': ['健康'],
  '医疗': ['健康'],
  '健身': ['健康'],
  '养生': ['健康'],
  '娱乐': ['娱乐'],
  '游戏': ['娱乐'],
  '音乐': ['娱乐'],
  '影音': ['娱乐'],
  '影视': ['视频', '娱乐'],
  '电影': ['娱乐'],
  '新闻': ['新闻'],
  '资讯': ['新闻'],
  '时政': ['新闻'],
  '财经': ['财经'],
  '金融': ['财经'],
  '股票': ['财经'],
  '理财': ['财经'],
  '投资': ['财经'],
  '社交': ['社交'],
  '社区': ['社交'],
  '论坛': ['社交'],
  '视频': ['视频'],
  '直播': ['视频'],
  '综合': ['工具'],
  '其他': ['工具'],
  '未分类': ['工具'],
};

/**
 * 根据同义词映射解析分类名
 * @param {string} name - 需要解析的分类名
 * @param {Set<string>} categoryNameSet - 用户分类体系的规范化名字集合
 * @returns {string|null} 映射到的合法分类名；找不到返回null
 */
function resolveSynonym(name, categoryNameSet) {
  const norm = normalizeCategoryName(name);
  // 先直接查
  if (categoryNameSet.has(norm)) return name;
  // 查同义词表
  const candidates = CATEGORY_SYNONYMS[norm];
  if (candidates) {
    const hit = candidates.find(c => categoryNameSet.has(normalizeCategoryName(c)));
    if (hit) return hit;
  }
  return null;
}

/**
 * 校验并修正AI返回的分类
 * 返回的分类必须存在于分类体系中，否则映射到最接近分类或回退"工具"
 * @param {string} category - AI返回的分类名或路径（如 "财经" / "AI > 工具"）
 * @param {Array} validCategories - collectValidCategories 的结果
 * @returns {string[]} 校验后的分类路径数组
 */
function validateCategory(category, validCategories) {
  if (!category) return ['工具'];

  const parts = String(category)
    .split(/\s*(?:>|→|＞|->)\s*/g)
    .map(p => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return ['工具'];

  // 合法分类名集合（用于同义词映射判断）
  const categoryNameSet = new Set(validCategories.map(v => normalizeCategoryName(v.name)));

  // 直接整体匹配（AI可能返回 "一级 > 二级" 完整路径）
  const fullText = parts.join(' > ');
  const fullNorm = normalizeCategoryName(fullText);
  const exactMatch = validCategories.find(v => normalizeCategoryName(v.fullPath) === fullNorm);
  if (exactMatch) return exactMatch.path;

  // 逐级匹配：每级必须是上层分类的子分类（一级匹配不上时尝试同义词映射）
  const result = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const norm = normalizeCategoryName(part);

    // 当前层候选：与已匹配路径前缀一致、且名为 part 的分类
    let candidates;
    if (i === 0) {
      candidates = validCategories.filter(v => v.path.length === 1);
    } else {
      const prefixPath = result.join(' > ');
      candidates = validCategories.filter(v =>
        v.path.length === i + 1 &&
        v.path.slice(0, i).join(' > ') === prefixPath
      );
    }

    let matched = candidates.find(v => normalizeCategoryName(v.name) === norm);

    // 一级未精确匹配：尝试同义词映射
    if (!matched && i === 0) {
      const resolved = resolveSynonym(part, categoryNameSet);
      if (resolved) {
        matched = candidates.find(v => normalizeCategoryName(v.name) === normalizeCategoryName(resolved));
      }
    }

    if (!matched) {
      // 某级匹配不上 → 分类不可信，回退"工具"
      return ['工具'];
    }
    result.push(matched.name);
  }

  return result.length > 0 ? result : ['工具'];
}

/**
 * 校验批量分类结果，返回修正后的结果
 * @param {Array} results - AI返回 [{id, category}]
 * @param {Array} validCategories - 合法分类列表
 * @returns {Array} 校验后的结果 [{id, category: string[]}]
 */
function validateResults(results, validCategories, allowDeletes = false) {
  return results.map(item => {
    if (allowDeletes && item.action === 'delete') {
      return { id: item.id, action: 'delete' };
    }
    let cat = item.category;
    if (Array.isArray(cat)) {
      cat = cat.join(' > ');
    }
    return { id: item.id, category: validateCategory(cat, validCategories) };
  });
}

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
 *   - the request shape is the one the translation engine already uses, built by
 *     the same dialectRequest helper (so an OpenCode model that answers on
 *     /messages works here too), with a short ladder of retries instead of
 *     guessing /v4, /v2 or /v1 from the host name
 */

const CLASSIFY_TIMEOUT_MS = 60000;
const CLASSIFY_MAX_TOKENS = 4096;

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
  // Anthropic Messages: { content: [ { type: 'text', text } ] }.
  if (Array.isArray(data.content)) {
    const joined = data.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') return part.text || part.content || '';
        return '';
      })
      .join('')
      .trim();
    if (joined) return joined;
  }
  if (typeof data.content === 'string' && data.content.trim()) return data.content.trim();
  // Responses: { output: [ { content: [ { type: 'output_text', text } ] } ] }.
  if (Array.isArray(data.output)) {
    const joined = data.output
      .map((item) => (item && Array.isArray(item.content) ? item.content : []))
      .reduce((all, parts) => all.concat(parts), [])
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') return part.text || part.content || '';
        return '';
      })
      .join('')
      .trim();
    if (joined) return joined;
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
    .map((item) => ({ id: String(item.id), category: item.category, action: item.action }));
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
  // Shared with the translation engine (same worker scope): the session header
  // OpenCode refuses to route without, and the dialect a model answers on.
  const fixedHeaders = Object.assign(
    { 'Content-Type': 'application/json' },
    (await openCodeSessionHeaders(base)) || {}
  );
  const dialect = dialectFor(model.dialect);
  const withFlags = Boolean(options && options.disableThinking);

  const send = async (responseFormat, disableThinking) => {
    const request = dialectRequest(
      dialect,
      base,
      model.model,
      [
        { role: 'system', content: '只返回 JSON。' },
        { role: 'user', content: prompt },
      ],
      model.apiKey,
      disableThinking,
      CLASSIFY_MAX_TOKENS
    );
    request.body.temperature = 0;
    // response_format is an OpenAI field; the Messages route exists precisely
    // because that model does not take OpenAI fields.
    if (dialect === DIALECT_CHAT && responseFormat) request.body.response_format = { type: 'json_object' };
    const headers = Object.assign({}, fixedHeaders, request.headers);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(request.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request.body),
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
      /* length / max_tokens / max_output_tokens, one per API. */
      const incomplete = data.incomplete_details && data.incomplete_details.reason
        ? String(data.incomplete_details.reason)
        : '';
      const finish = choice && choice.finish_reason
        ? String(choice.finish_reason)
        : data.stop_reason
          ? String(data.stop_reason)
          : incomplete;
      const truncated = finish === 'length' || finish === 'max_tokens' || finish === 'max_output_tokens';
      const label = truncated
        ? '（输出被截断）'
        : finish
          ? '（finish_reason: ' + finish + '）'
          : '';
      const error = new Error('模型没有返回内容' + label);
      // An empty answer is worth one more attempt: either the request shape or
      // the reasoning budget is what stopped it.
      if (truncated || responseFormat || disableThinking) error.tryNextShape = true;
      throw error;
    }
    return content;
  };

  const plan = [];
  const add = (entry) => {
    const known = plan.some(
      (item) =>
        item.responseFormat === entry.responseFormat &&
        item.disableThinking === entry.disableThinking
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
  const prompt = buildClassifyPrompt(bookmarks, categories, settings.instruction);
  const raw = await callClassifyModel(prompt, settings.model, settings);
  return parseClassifyPayload(raw);
}

/**
 * 批量分类书签（自动分批）
 * @param {Array} bookmarks - 所有待分类书签
 * @param {Object} settings - API设置
 * @param {Function} onProgress - 进度回调 (completed, total)
 * @returns {Promise<Array<{id, category}>>}
 */
async function classifyBookmarks(bookmarks, settings, onProgress) {
  const BATCH_SIZE = 50;
  const validCategories = collectValidCategories(settings.categories || DEFAULT_CATEGORIES);
  const instruction = settings.instruction == null ? '' : String(settings.instruction);
  const hasInstruction = instruction.trim().length > 0;

  // 确定性规则先行：域名/关键词命中的书签不调用AI，保证准确性并节省API调用
  const { ruled, unrouted } = hasInstruction
    ? { ruled: [], unrouted: bookmarks }
    : applyRules(bookmarks, validCategories);
  const allResults = [...ruled];

  const total = Math.ceil(unrouted.length / BATCH_SIZE);
  let completed = 0;

  // 全部被规则命中时无需AI调用
  if (total === 0 && onProgress) {
    onProgress(1, 1);
  }

  for (let i = 0; i < unrouted.length; i += BATCH_SIZE) {
    const batch = unrouted.slice(i, i + BATCH_SIZE);

    try {
      const batchResult = await classifyBatch(batch, settings);
      // 校验并修正分类（不存在的分类回退"工具"）
      allResults.push(...validateResults(batchResult, validCategories, hasInstruction));
    } catch (err) {
      console.error(`批次 ${completed + 1} 分类失败:`, err);
      for (const bm of batch) {
        allResults.push({ id: bm.id, category: ['工具'] });
      }
    }

    completed++;
    if (onProgress) {
      onProgress(completed, total);
    }
  }

  return allResults;
}

/**
 * 分类单个书签（用于新书签自动分类）
 * @param {Object} bookmark - {id, name, url}
 * @param {Object} settings - API设置
 * @returns {Promise<string[]>} 分类路径数组
 */
async function classifySingleBookmark(bookmark, settings) {
  const validCategories = collectValidCategories(settings.categories || DEFAULT_CATEGORIES);

  // 确定性规则先行
  const { ruled } = applyRules([bookmark], validCategories);
  if (ruled.length > 0) return ruled[0].category;

  const results = await classifyBatch([bookmark], settings);
  if (results.length > 0 && results[0].category) {
    const validated = validateResults(results, validCategories);
    if (validated.length > 0) {
      return validated[0].category;
    }
  }
  return ['工具'];
}

/**
 * 获取默认分类体系
 * @returns {Array}
 */
function getDefaultCategories() {
  return DEFAULT_CATEGORIES;
}

/**
 * 导出设置获取函数
 */

  self.CodexBookmarks = Object.assign(self.CodexBookmarks || {}, {
    classifyBookmarks,
    classifySingleBookmark,
    getDefaultCategories,
    validateCategory,
  });
})();
