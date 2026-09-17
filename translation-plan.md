# 网页翻译功能 · 实施方案

- 日期：2026-09-16
- 目标扩展：Codex 浏览器扩展（Edge，ID `odlomjlbamekndcpllcnffbgeohgkmjh`）的补丁副本
- 参考实现：`D:\MyProjects\ai-edge-extension`（成熟 MV3 翻译扩展，含网页翻译与视频字幕翻译）
- 界面样稿：`mockups\translation-ui.html`
- 状态：P0 已完成并端到端验证

## 进度

| 阶段 | 状态 |
| --- | --- |
| P0 加载器 + 内容脚本骨架 + 配置存储 + 划词翻译 | 已完成，已在真实 Edge 里验证 |
| P1 整页翻译 | 已完成，已在真实 Edge 里验证 |
| P2 视频字幕翻译 | 已完成，已在真实 Edge 里用假播放器验证 |
| P3 设置页收尾 | 字幕分区已加；进站自动翻译本来就是默认全站生效，不需要额外开关 |

### P2 落地的东西（视频字幕）

- 新增内容脚本 `translate\subtitle.js`，跟整页翻译一样在所有站点跑，但只在页面上
  真的有字幕时才有动作。
- **不改播放器**：译文画在我们自己的 shadow-root 字幕条里，叠在画面上、位于播放器
  自己那行字幕的正上方（量它的 bounding box），所以原字幕、播放器样式、播放器的
  重绘节奏全都不受影响。字幕条 `pointer-events: none`，不抢点击。
- 两个来源都读：播放器画进 DOM 的字幕（YouTube / bilibili / Video.js / Plyr /
  JW / Shaka / Netflix 的已知选择器），以及**原生 TextTrack 的 activeCues**
  （`<video><track>` 那种根本不进 DOM 的）。已知选择器都没命中时，还会在视频自己的
  容器里按 class/id 关键词（caption / subtitle / timedtext…）兜底找一次，所以自制
  播放器也能覆盖。
- 译文字号 / 位置 / 最多行数可调；行数超限时会把「最多几行 × 一行能放几个字」作为
  字数上限发给模型，让它在翻译阶段就压短，而不是靠 CSS 截断。
- 字幕模型可以单独指定（默认「同翻译模型」）；字幕文本命中缓存，重复台词不重复
  请求。
- 目标语言已经是中文时自动跳过；字幕消失有 1.2 秒宽限，换行瞬间不会闪。

### P1 落地的东西

- 整页翻译：按块级元素切分（只取最内层文本块，容器不重复翻），跳过脚本、样式、
  代码块、输入控件与编辑区；双语模式下译文以独立节点插在原文下方，仅译文模式下
  换掉原文但保留原始节点以便还原。
- 自动翻译默认对所有网站生效，站点规则只做「排除」。打开页面即翻译，不需要逐个添加；
  目标语言与页面语言一致时自动跳过，排除列表里的站点完全不介入。
- 进度胶囊：显示进度、可随时取消；翻完自动淡出。
- 右键菜单补上「翻译整页」与「还原本页原文」。

### 目录结构

**项目文件夹本身就是可加载的扩展**，Edge 直接指向它，不再有嵌套的子目录。

```
chatgpt-extension-patch\        <- Edge 加载这个目录
├── manifest.json               <- 构建生成
├── background.js               <- 构建生成（宿主原文件，零改动）
├── codex-sidepanel\            <- 构建生成，内含挂进去的 banner-hide.js
├── content-scripts\ assets\ images\ ...   <- 构建生成
├── translate\                  <- 构建生成，从 src\translate 拷过来
├── src\                        <- 补丁源码（受保护）
│   ├── banner-hide.js
│   └── translate\
├── tools\apply-patches.ps1     <- 构建脚本
├── tests\                      <- 夹具与两个 Playwright 脚本
├── mockups\                    <- 界面样稿
└── translation-plan.md
```

### P0 实际落地的东西

- `src/translate/background-loader.js`：manifest 的后台入口指向它，用 `importScripts` 依次加载
  宿主 `background.js`、`settings.js`、`engine.js`。宿主后台文件零改动。
- `src/translate/settings.js`：默认值与存储读写，独立命名空间。
- `src/translate/engine.js`：跳过规则、缓存、编号行协议与四级兜底解析、批量合并、并发限流、
  模型调用（含关闭思考开关）、右键菜单、消息路由。
- `src/translate/content.js`：划词气泡（独立 shadow DOM），复制 / 替换原文 / 重译 / 齿轮进设置，
  另有加载中与失败两种状态。
- `src/translate/options.*`：设置页，四个分区（模型 / 语言与显示 / 术语表 / 站点规则）。
- `tools/apply-patches.ps1`：一次完成镜像、去元数据、挂隐藏横幅、挂翻译文件与 manifest 改动。
  `src\`、`tools\`、`tests\`、`mockups\` 与方案文档受保护，镜像前会校验其存在。
- `tests/`：本地 HTTP 夹具 + 两个 Playwright 脚本，分别验证气泡链路与设置页渲染。

### 与方案的偏差

1. 设置页这一版只有四个分区。视频字幕分区等字幕功能落地时一起加，避免出现不起作用的开关。
2. 右键菜单四项已补齐（翻译选中文字 / 翻译整页 / 还原本页原文 / 翻译设置）。
3. 内容脚本的样式直接内联在 `content.js` 里（shadow DOM 需要），没有单独的 `content.css`。
4. 追加需求：侧边栏界面中文化（`src/panel-zh.js`），并把「翻译设置」加进右上角菜单。
   扩展包内没有任何中文文案，所以只能做界面层替换；替换范围严格限定在控件上
   （按钮、菜单项、标签、选项卡、可选项），会话内容一律不碰。
5. 必须改一处 `manifest.json` 的 `content_security_policy`：原扩展的 `connect-src`
   只放行了它自己的几个 OpenAI 域名，云端翻译的任何请求都会被浏览器直接拦掉
   （报错是 `Failed to fetch`，看不出原因）。补丁在 `connect-src` 末尾追加
   `https://api.deepseek.com`、`https://api.commandcode.ai`、`https://opencode.ai`
   与 `https:`（自定义服务用），`127.0.0.1` / `localhost` 原本就已放行，本地模型
   与本地 Codex Router 不需要额外改动。构建脚本 `Apply-NetworkPatch` 负责这一步，
   锚点找不到就直接报错退出，不会写出半截的 manifest。
6. 整页翻译改成「只改文本节点」：不插元素、不写内联样式、不改颜色与行高。第一版把
   译文包在一个 `display:block` 的 `<span>` 里，在导航这类 flex 行里变成了额外的
   flex item，把原文挤成一行一个词（Command Code 侧边栏就是这样崩的）。现在只在
   原文所在的文本节点上写，双语是「原文 + 空格 + 译文」，仅译文是把译文写进第一个
   文本节点、其余文本节点清空，子元素（图标、`<b>`、`<code>`）全部保留。
   代价是译文字号没法再单独控制——字号只对「仅译文」模式生效（直接改单元元素的
   font-size），设置页那一行也照实写成「只在『仅译文』模式下生效」。
7. 挂载了「显示方式」默认值迁移：默认从「双语对照」改成「仅译文」，并用
   `layoutStamp` 做一次性迁移，用户之后手动改回「双语对照」不会被再改掉。
   原因是双语必然让文字变长、窄栏会换行变高，这不是样式被改，而是多了一行字。
8. 译文长度不再只靠模型自觉，加了三层：
   - 提示词明确要求界面文字（标签、菜单、按钮、表头、短标题）用最自然的中文短写，
     不要逐字直译；正文段落仍然要求完整。
   - 整页翻译结束后做一次「放不下」检查：`scrollWidth > clientWidth` 且元素自身
     `overflow-x: hidden/clip` 或 `text-overflow: ellipsis` 才算被截断，然后按
     「已渲染宽度 / 可用宽度」的比例折算出可用字数，再问模型要一版更短的译文。
     判定只看盒子，不认站点，所以折叠菜单、表头、固定宽按钮是同一套逻辑；
     可横向滚动的容器不会被误判。每页最多补一次，最多 24 处。
   - 装饰性重影标签（同一位置、同样文字的第二层，常见于大标题）会跟着一起改，
     否则两层一个中一个英，看起来就是重影。要求两个盒子重叠面积过半才算，
     避免把「两条一模一样的菜单项」误认成重影。
9. 云端响应不再只认一种形状。`content` 可能是字符串、内容数组
   （`[{type:'text',text:…}]`）、`choices[0].text`，也可能是 Responses 风格的
   `output_text` / `output[].content[].text`，还有把答案平铺成 `response` / `text`
   的中转。`extractContent()` 依次从这些位置取值。
10. 空结果不再直接失败：先原样再发一次（去掉「关闭思考」的那几个字段，并把上限提到
    1024），两次都拿不到内容才报错，而且错误里带上 `finish_reason` 和原始响应的前
    200 个字符。网关直接以 400 / 404 / 422 拒收关闭思考参数时走同一条自动重试。
    这样「连得上但读不出内容」这种最难查的情况，下一次就能从报错里看出服务端原话。
11. 新增 `tests\fake-gateway.cjs`：本地假网关分别扮演「只在不带关闭思考参数时才
    回内容」「内容用数组包着」「永远回空」三种服务，验证上面两条逻辑。
12. 模型卡片上的徽标改成可操作的状态：以前两张卡都是同样的灰色小标签（「翻译」/
    「备用」），看不出哪个在用，也没有任何提示说能切换。现在在用的那张是白底黑字
    「在用」，其他卡片是描边按钮「设为在用」，整张卡片依然可点；容器加了
    `role="radiogroup"`，卡片加了 `role="radio"` + `aria-checked`。
    徽标宽度统一（`min-width: 64px` + 居中），否则「在用」和「设为在用」宽度不同，
    两张卡的模型名会各自缩进、对不齐。
    内容脚本补了 `chrome.storage.onChanged` 监听，设置页改完立刻生效（模型本来就是
    每次请求现取，顺带把显示方式、目标语言这些也变成实时生效）。
13. 内置术语表：`TRANSLATE_BUILTIN_GLOSSARY` 共 158 条，随扩展走、不写进存储，覆盖
    账户与产品词汇、AI 大模型与机器学习、工程术语、金融与科技词汇，以及必须保持原样的
    品牌名（「Command Code」原来会被译成「命令代码」）。术语页把它们渲染成只读行并打
    「内置」标签，用户加一条同名的即可覆盖。匹配从「包含子串」改成 ASCII 词边界匹配
    （`(?<![\w-])term(?![\w-])`），否则 `Build` 会在 `rebuild`、`Commit` 会在
    `committed` 里误命中；还刻意剔除了语义两可的词（Plan / Usage / Token / Agent /
    Streaming），免得在普通网页上把「旅行 agent」「流媒体 streaming」类文本强制译错。
    金融那一组按同一条规矩收：`Options` / `Call` / `Put` / `Bond` / `Long` / `Short`
    单独出现时更常是设置菜单或日常词，只收词义唯一的多词形式（`Hedge fund`、
    `Short selling`、`Private equity`），`ETF` / `IPO` 这种中文里本来就不译的放进
    「保持原样」那一段。
14. 重影标签（同一句话画两层，常见于大标题）有两条路径，现在都覆盖了：
    - 另一层是**真元素**：原来只找同一个父节点下的兄弟，现在向上找三层，要求「文字
      相同 + 两个盒子重叠过半」，并且排除祖先/子树关系（否则外层容器会被当成重影，
      双语模式下同一句话会被写两遍）。
    - 另一层是 **CSS 伪元素**：`::before/::after` 的 `content` 是字面量且与正文相同，
      这时才注入一条 `[data-codex-ghost="n"]::after { content: … }` 覆盖成同样的译文
      （这是整个改造里唯一一处改页面样式，且只在完全重复正文时触发）。`//` 这类装饰
      前缀的内容不等于正文，因此不会被误改。
    - 还原时把注入的样式表和 `data-codex-ghost` 属性一起清掉，伪元素内容回到原文。
15. 重影检测又补了三处（都是按「文字相同 + 盒子重叠」判定，不认站点）：
    - **不是亲属、而且 `pointer-events: none` 的定位层**：`elementsFromPoint` 命中不到
      这类元素，所以改成直接遍历页面上所有 `absolute / fixed / sticky` 的盒子来比对。
      这份列表缓存 3 秒，每次整页翻译只扫一遍，不会按段落重复计算。
    - **伪元素把文字放在属性里**（`content: attr(data-echo)`）：解析属性名后取属性值
      再比对，命中一样用注入的规则覆盖成译文。
    - **重影在 shadow root 里**：扫描时向下穿透两层 shadow root，覆盖设计系统组件的
      画法。

## 0. 决策依据

本方案以**推荐判断**为准，而不是「照参考扩展原样照搬」。参考扩展里有的功能，只要判断为重复、没有落点、或会破坏现有行为，一律不迁；判断为需要精简的，按精简后的做法做。

---

## 1. 本次相对上一版的变化

1. 删掉三处本地模型相关的优化：本地/云端参数自动切换、关思考字段自动探测、Ollama 被关掉时自动拉起。
2. 不做快捷键，触发入口只保留右键菜单。
3. 其余功能按参考扩展的做法原样移植。

由此带来的一个直接好处：**不再需要改动 `D:\ollama\native-host` 下的 native host 白名单**，整套改动收敛在扩展自己的目录里。

---

## 2. 约束

- 不改动 Codex 扩展现有的任何界面：侧边栏、气泡、图标点击行为全部保持原样。
- 页面上不放任何常驻按钮。
- 翻译功能全部由新增文件承载，OpenAI 的原始包体文件尽量保持字节不变。

---

## 3. 功能范围

### 3.1 要做

| 功能 | 说明 |
| --- | --- |
| 整页翻译 | 双语对照或替换原文，可取消、可一键还原；译文随翻随出 |
| 划词翻译 | 选中文字后浮出译文卡片，支持复制、替换原文、重译 |
| 视频字幕翻译 | 播放器上的双语字幕条，字号/位置/最多行数可调 |
| 翻译缓存 | 内存 + 持久化，键含「文本 + 目标语言 + 模型」；重复内容零调用 |
| 术语表 | 命中的词条随请求下发，强制指定译法；支持导入导出 |
| 跳过规则 | 纯数字、符号、URL、邮箱、已经是目标语言的文本不发请求 |
| 编号行批量协议 | 多条文本合并成一次请求，返回编号行；缺条只补缺条，不整批重译 |
| 并发控制 | 在途请求数上限 + 运行时按限流与延迟自适应 |
| 多模型管理 | 云端（Base URL + Key + 模型 ID）与本地（Ollama）并存，可就地测试连接 |
| 关闭思考开关 | 设置页「模型」分区里的一个开关，默认打开；打开后翻译请求带上一组关闭推理的参数 |
| 模型档位 | 只有两档：网页翻译模型、字幕翻译模型。不设「主模型」档，那一档由 Codex 侧边栏自己管 |
| 进站自动翻译 | 命中站点规则时打开页面即翻译 |
| 右键菜单 | 翻译选中文字 / 翻译整页 / 还原原文 / 翻译设置 |
| 设置页 | 模型、语言与显示、视频字幕、术语表、站点规则，共 5 个分区 |
| 界面语言 | 第一版只做中文。设置页是新增页面，中文够用；语言包结构留着，以后要英文再补 |

### 3.2 不做

| 不做的事 | 原因 |
| --- | --- |
| 本地/云端参数自动切换 | 本次明确删除。改为固定一套参数（见第 5 节） |
| 关思考字段自动探测 | 本次明确删除。需要时用设置页的手动开关代替 |
| Ollama 自动拉起 | 本次明确删除。Ollama 没跑就报错提示，由用户自己启动 |
| 快捷键 | 本次明确删除。入口只有右键菜单 |
| 侧边栏聊天助手 | 与 Codex 自带侧边栏重复 |
| 网页/选区摘要 | 没有合适的落点，Codex 侧边栏本身能摘要 |
| 侧边栏双模式（Kimi 转发） | 当年没有本地 Router 时的绕行方案，已无必要 |
| 扩展弹窗（popup） | 会改掉「点图标打开侧边栏」的现有行为 |
| 页面正文提取 | 只服务于摘要，摘要不做则用不上 |
| 三个模型档位里的「主模型」档 | 侧边栏会话用的模型由 Codex 自己管，这里再设一档是重复 |
| 中英双语界面 | 第一版不需要，增加界面面积却没有收益 |

---

## 4. 技术落点

### 4.1 后台装载

Codex 扩展只有一个 service worker，被它自己的 `background.js` 占着。做法是把 manifest 的
`background.service_worker` 指向一个两行的加载器：

```js
importScripts('background.js');
importScripts('translate/engine.js');
```

`background.js` 保持字节不变，翻译引擎独立成 `translate/` 目录。参考扩展本来就是用
`importScripts` 引它自己的三个库文件，所以这套做法是平移，不是新发明。

### 4.2 内容脚本

- 新增 `translate/content.js` + `translate/content.css`，manifest 里加一条全站注入，`run_at: document_idle`。
- 排除 `https://chatgpt.com/*`，避免和扩展自己的页面脚本互相干扰。
- 参考扩展的 `content.js` 是直接照搬的候选（文本节点遍历与过滤、代际标记防旧译文写回、动态内容重排队、原文还原、进度与错误提示），需要删掉里面的悬浮球与通知转发部分。

### 4.3 配置存储

模型、目标语言、术语表、站点规则全部存在 `chrome.storage.local` 里独立的键下，与 Codex 自身的设置互不读取。缓存单独一个键，带体积上限与过期时间。

### 4.4 设置页

挂在浏览器原生的「扩展选项」入口（manifest 的 `options_ui`），是一个新增页面，不改动扩展图标的行为。

### 4.5 构建脚本

`tools\apply-patches.ps1` 一次完成：把商店版镜像到项目目录、去掉完整性元数据、挂隐藏横幅脚本、把 `src\translate` 与 `src\banner-hide.js` 铺进去、改好 manifest。扩展每次更新后重跑一次即可。镜像前会校验 `src\`、`tools\`、`tests\`、`mockups\` 与方案文档都在，并把它们排除在镜像之外。

---

## 5. 参数策略（因为删掉了自动切换）

参考扩展原先按网关类型分两套参数：本地小批（12 条 / 2000 字符 / 90 秒超时），云端大批（60 条 / 7000 字符 / 45 秒超时）。删掉自动切换后需要一套固定值，建议：

| 参数 | 建议值 | 理由 |
| --- | --- | --- |
| 每批条数 | 40 | 云端够省调用，本地也不会等太久 |
| 每批字符 | 4000 | 留足输出余量，避免截断导致整批重译 |
| 超时 | 60 秒 | 两端都能接受 |
| 并发 | 8 | 与常见本地服务槽位对齐 |

### 关闭思考

已确定做成设置页里的一个开关，放在「模型」分区，默认打开。

- 打开：翻译请求带上一组关闭推理的字段。参考扩展里有一组「全部字段」的写法，一次覆盖 Hy3、Qwen 和通用中转这三类网关的字段名，是已经被验证可用的组合。
- 关闭：不发送任何关闭推理的参数。
- 不做自动探测，也不记忆探测结果 —— 开关的状态就是唯一依据。

默认打开的理由：翻译本身不需要推理，而带思考模式的模型做翻译可能慢两到五倍。参考扩展同样是默认关闭思考的。

---

## 6. 分期与工作量

| 阶段 | 内容 | 预估 |
| --- | --- | --- |
| P0 | 加载器、内容脚本骨架、配置存储、划词翻译跑通 | 半天 |
| P1 | 整页翻译：遍历过滤、批量协议、缓存、跳过规则、进度与还原 | 一到两天 |
| P2 | 视频字幕翻译：观察器、字幕条、与网页翻译共用引擎 | 一天 |
| P3 | 设置页 5 个分区、术语表、站点规则、进站自动翻译、收尾 | 一天 |

移植为主、重写为辅：引擎与页面侧在参考扩展里已经是调好的成品。

---

## 7. 验证方式

1. 单测：参考扩展的 `test_speed_unit.js`、`test_auto_tune.js` 直接搬过来跑。
2. 本地夹具：自建测试页（长文、代码块、表格、动态加载），用 Playwright 截图对照，确认译文位置、进度条、还原都正确。
3. 真机：在 Edge 里加载补丁扩展，翻一个真实英文页面，再开一个带字幕的视频，确认双语字幕跟随播放。
4. 回归：确认 Codex 侧边栏、隐藏横幅补丁、图标点击行为都不受影响。

---

## 8. 风险

- **补丁面积变大**：挂载的文件从 1 个变成 4 到 5 个，扩展更新后必须重跑构建。
- **CSP 放行了 `https:`**：这样自定义云端地址不用改扩展就能用，代价是扩展页可以向
  任意 https 域名发请求。`script-src` 仍是 `'self'`，远程脚本依旧进不来；如果以后
  想收紧，把 `https:` 去掉、只留具体域名即可。
- **token 成本**：整页翻译开销大，缓存与跳过规则必须一起搬，否则重复访问会反复调用。
- **字幕适配**：字幕选择器依赖各家播放器的 DOM，需要按站点维护，属于长期成本。

---

## 9. 已确定的决定

1. 固定参数取第 5 节建议值：每批 40 条 / 每批 4000 字符 / 超时 60 秒 / 并发 8。
2. 关思考做成设置页「模型」分区里的一个开关，默认打开；不做自动探测。
3. 视频字幕翻译这次一起做，不拆到下一版。
4. 范围原则：以推荐为准。🔶 项按建议精简，标「不建议」与 ❌ 的一律不做。

---

## 10. 后续修补：切换标签页时的漏翻

现象：站点内的标签页（单页应用换个视图）切换后，新出现的区块保持英文。原因是整页
翻译只在页面加载时跑一次，而这类站点是加载之后才渲染视图、并且在同一个文档里替换
视图，第一次遍历根本看不到它们。

两处改动，都在 `translate/content.js`：

1. 补跑晚到的内容。挂一个只观察 `childList` 的 `MutationObserver` 在 `document.body`
   上，页面新加进来带文字的节点就排一次增量翻译。三条限流保证它不会失控：900 毫秒
   防抖、两次翻译之间至少隔 2.5 秒、每次可见会话最多 60 次补跑（切回标签页时重置）。
   已翻译的区块带标记，遍历时直接跳过，所以补跑只处理真正新增的部分；没有新增就不
   发请求、也不显示进度条 —— 用户正在读的页面上不该跳出进度条。
2. 按钮也算文本块。`BUTTON` 从跳过名单移到了块级名单（`Change plan`、`Buy credits`
   这类按钮文案之前完全没翻）。因为整页翻译只改文本节点、不动元素和样式，翻按钮
   文案不会影响控件本身。

写入译文是改文本节点的值，属于 `characterData` 变化，而观察器不监听这个类型，程序
自己改的内容不会反过来触发自己。

验证：新增 `tests/fixture-late.html` 与 `tests/e2e-late.cjs`。首轮翻译完成后向页面追
加一段英文并等待 —— 延迟段落与按钮都译成中文，第一段译文没有被二次翻译，补跑期间
没有出现进度条。同批回归（整页、布局、划词、字幕、模型切换、设置页、云端弹窗、网关）
全部通过。

---

## 11. 后续修补：模型返回空结果与报错显示

现象：页面底部弹出一整条错误条，内容里塞着模型返回的原始 JSON，条子被撑得跑出屏幕
两边；同一次翻译里其他段落也没翻。原始报错是
`模型返回了空结果（finish_reason: length）`。

`finish_reason: length` 的含义是输出被长度上限截断。常见于带思考的模型：思考把输出
预算吃光，正文一个字都没剩下。原来的处理是把这批直接判失败，抛出异常；页面侧收到
失败就中断整轮翻译，于是一批坏掉，整页停在那儿。

改动都在 `translate/engine.js`，一处显示改动在 `translate/content.js`：

1. 一批最多问模型三次，第二次问什么由第一次怎么失败决定：
   - 输出被截断 → 原样再问一次，只把输出上限放大到四倍（上限 16384 封顶）；
   - 其他失败且带着「关闭思考」参数 → 去掉这组参数再问一次（网关不接受它们时就是这条路）。
2. 单批失败不再中断整页。没回来的那几十条保留原文，其余批次照常落盘；只有所有批次
   全部失败才报错。
3. 报错文案不再拼原始 JSON（原始回应改写到服务工作线程的控制台），并给 `length`
   这种情况换了人话：`模型没有返回内容（输出被截断）`。
4. 进度条不再被长文案撑破窗口：宽度上限 `calc(100vw - 32px)`，文字超长显示省略号，
   并且出现文字说明时隐掉那条空的进度槽。

验证：`tests/fake-gateway.cjs` 增加两个场景 —— 一是「预算小于 4000 就只回
`finish_reason: length` 和空内容、预算够了才正常回答」的假网关，现在第一次失败后自动
放大上限并成功（两次调用）；二是 45 条文本里最后一条带毒标记，让两个批次中的一个整批
失败，结果 40 条照常译出、失败的 5 条保留原文、调用次数 2。新增
`tests/e2e-error-pill.cjs`：指向一个永远不回内容的假网关，量出错误条在 1100 宽和 420
宽两种窗口下都留在屏幕内、文字走省略号、条子里不再出现原始 JSON。

---

## 12. 后续修补：译文不再改动页面样式

要求：整页翻译只换文字，字号、颜色、字体一律不动。

之前唯一会动页面样式的功能是设置页里的「译文字号」：选“小”或“大”时，每个被翻译的
区块都会被写上一条内联 `font-size`（0.9em / 1.15em）。只要这个选项不是“中”，全站
每段译文都会变大或变小，看起来就是扩展改了页面的样式。

处理：整个功能删掉，而不是默认值改回“中”。

- `content.js`：删除 `applyTextSize` 及其调用，`restorePage` 里对应的
  `removeProperty('font-size')` 一并删除。
- `options.html` / `options.js`：删掉「语言与显示」里的「译文字号」一行。
- `settings.js`：默认值里不再有 `fontSize`。

视频字幕的「字幕字号」保留 —— 那条字幕条是扩展自己画在画面上的图层，不是页面内容，
字号本来就是它的属性。

除文字节点外，整页翻译现在对页面不写任何东西：不加元素、不加类名、不写内联样式、
不写字体族。唯一会落到页面 CSS 上的规则仍然只有那条替换装饰性重影文字的
`content` 覆盖（它替换的那层原本就写着同样的文字）。

验证：`tests/e2e-layout.cjs` 的对照口径加严 —— 遍历页面上每一个元素，比对
`font-size / color / font-family / font-weight / line-height / display`，并且
在「仅译文」那一轮里故意往存储里塞一个旧版的 `fontSize: 'large'`，确认旧设置也无法
再让页面变形。结果：

```
replace layout       : text only, untouched
fonts and colours    : label1 13px rgb(185, 185, 185) -apple-system  //  label4 13px rgb(185, 185, 185) -apple-system  //  cardTitle 16px rgb(234, 234, 234) -apple-system  //  cardBody 15px rgb(168, 168, 168) -apple-system  //  cardMono 15px rgb(168, 168, 168) ui-monospace  //  nav1 15px rgb(234, 234, 234) -apple-system
```

也就是页面上每个元素都还是它自己的字号与颜色，等宽字体仍然是等宽字体。

---

## 13. 新增：书签整理（移植 bookmark-sorter）

来源：`D:\MyProjects\bookmark-sorter`。整套逻辑照搬，界面按本扩展设置页的风格重画，
模型与配置接进已有的一套，不再单开一份。

### 搬过来的

| 功能 | 说明 |
| --- | --- |
| 一键整理 | 扫收藏栏 → 域名/关键词规则先命中一批（不调模型）→ 剩下的交模型 → 预览树 → 确认后移动 |
| 重复检测 | 两阶段：URL 归一化后相同（剔除 utm、spm、分享来源等跟踪参数），以及同域名同路径同标题的相似重复；每组保留名字最全的 |
| 新书签自动分类 | 收藏后等 2 秒（防正在改标题）再分类归档，默认关 |
| 定时去重 | 按 1 / 6 / 24 / 168 小时扫全部书签去重，默认关 |
| 分类体系 | 直接用收藏栏里现成的文件夹；只有收藏栏没有文件夹时才用内置的 13 个默认分类 |
| 归档收尾 | 移动后合并同名文件夹、清理空文件夹 |

### 改动的地方

- **模型来源**：上游自己存了一份模型配置（还写死了两把智谱 key）。这里改成复用翻译那套
  模型列表，新增一个「书签模型」下拉，默认跟随主模型。请求形状也统一成翻译引擎在用的
  `{baseUrl}/chat/completions`，不再按域名猜 `/v4` `/v2` `/v1`；另外加了一条重试阶梯：
  先带 `response_format`，被拒就去掉，还是空内容就再去掉「关闭思考」字段。
- **落地位置**：做成设置页里的一栏（模型 / 语言与显示 / 术语表 / 视频字幕 / 站点规则 /
  书签整理）。上游那个弹窗没搬 —— 点图标开侧边栏的行为不能动。
- **执行位置**：分类、移动、删除全部在服务工作线程里跑，页面关掉也不会中断；页面只负责
  显示，通过一个长连接把进度和结果拿回来。
- **权限**：不用加。宿主扩展的 manifest 本来就申请了 `bookmarks`。
- 上游设置页的「分类体系」手动编辑器这次没做（按约定）。

文件：`src\bookmarks\lib\{bookmark-utils,deduplicator,classifier}.js`（由
`tools\port-bookmarks.mjs` 从上游转成经典脚本，模型调用那一段替换成
`tools\parts\classify-model-call.js`）、`src\bookmarks\worker.js`（服务工作线程）、
`src\bookmarks\{panel.js,panel.css}`（设置页面板）。构建脚本多了一步把 `src\bookmarks`
镜像到 `bookmarks\`。

### 安全边界

整理与去重都必须先看预览再点确认；删除只删每组里非推荐的那些；归档只写收藏栏里的
文件夹；两个自动开关默认关；最近一次自动分类/自动去重的结果会显示在面板上，随时可查。

### 验证

`tests\e2e-bookmarks.cjs`：临时配置里放一个假网关当模型，往收藏栏种入两个分类文件夹、
三个待归类书签、一对重复、一个已归类的书签，然后照人的操作点一遍。21 项检查全过：

```
ok   the pane lists the bar  [6 个书签 · 2 个分类]
ok   the preview names the duplicate  [5 个书签 → 2 个分类 · 删除重复 1 个]
ok   the preview changed nothing  [OpenAI 新模型发布, A 股行情一览, Zebra 观察笔记, 重复的页面, 重复的页面]
ok   apply reports what it did  [整理完成：移动 5 个 · 删除重复 1 个]
ok   the model-decided bookmark is filed
ok   the duplicate is gone  [重复的页面]
ok   already-filed bookmarks are skipped  [这 5 个书签都已经在对应文件夹里了，没有需要移动的。]
ok   one of the pair was deleted  [删除了 1 个重复书签。 -> 1 left]
ok   a new bookmark files itself
ok   the automatic run is recorded  [{"category":["AI"],"name":"自动分类的新书签","state":"done",...}]
RESULT: all checks passed
```

截图：`tests\out\bookmarks-preview.png`（整理预览）、`bookmarks-duplicates.png`（重复分组）、
`bookmarks-pane.png`（整栏）。

### 界面重做（同批）

第一版只是"能用"，视觉上太素，这一轮按设置页已有的语言重画：

- 顶部加一条三格摘要：收藏栏书签数 / 分类文件夹数 / 上次整理日期。
- 每个功能块带图标（一键整理、重复检测、自动）、标题右侧一句说明，块底色与卡片一致。
- 整理进度从一行文字换成真正的进度条（有批次数时按比例，没批次数时走不确定条）。
- 分类预览：文件夹图标 + 右侧数量胶囊 + 缩进引导线；每条书签显示网站图标（用扩展自带的
  favicon 接口，取不到就自己隐藏）与省略号截断的标题。
- 重复分组：每组一张小卡片，带"链接相同 / 标题与路径相同"标签，保留项高亮并挂"保留"胶囊，
  待删项划线挂"删除"胶囊。

顺手修掉一个真 bug：`.btn` 的 `display: inline-flex` 会盖掉 `[hidden]`，所以"删除重复项 /
取消 / 扫描频率"这几个本该藏起来的东西一直显示着（上一版就有）。面板里补了
`#view-bookmarks [hidden] { display: none !important; }`，并给测试加了对应的断言：
不该出现的按钮和频率行一开始必须不可见，扫描后才出现，删完再消失，定时去重打开才显示
频率行。

### 文案精炼

排版保持上一版（摘要三格 → 模型一行 + 分类文件夹一行 → 一键整理 / 重复检测 / 自动三个
块 → 底部三行记录），中途试过一版"键值对齐栅格"的排版，用户看后要求还原，已回退：
`src\bookmarks\panel.css` 与 `options.html` 里恢复 `.bm-taxonomy` / `.bm-check` /
`.bm-auto-row` / `.bm-dup-stats`，删掉那一版新增的 `.bm-row` / `.bm-key` / `.bm-value` /
`.bm-inline` / `.bm-status`。只留下文案的改动。

文案：能删就删，数字为 0 的一律不写。

| 位置 | 改前 | 改后 |
| --- | --- | --- |
| 顶部说明 | 按你收藏栏里现有的文件夹把书签归好，顺手清掉重复的。整理和去重都先给你看一遍，点了确认才真的动。 | 按收藏栏现有的文件夹归类，顺手清掉重复的。动手前先给你看一遍。 |
| 复选框 | 移动已经在分类文件夹里的书签（取消勾选则跳过它们） | 已归类的书签也重新整理 |
| 摘要 | 收藏栏书签 / 分类文件夹 / 上次整理 | 书签 / 文件夹 / 上次整理 |
| 分类一行 | 只有分类名 | 分类文件夹：AI · 财经 |
| 预览统计 | 5 个书签 → 2 个分类 · 删除重复 1 个 · 跳过已归类 1 个 | 5 个书签 → 2 个文件夹 · 删重复 1 · 跳过 1 |
| 整理结果 | 整理完成：移动 5 个 · 删除重复 1 个 · 合并重名文件夹 0 个 · 清理空文件夹 0 个 | 整理完成 · 移动 5 · 删重复 1 |
| 去重统计 | 扫了 7 个书签：1 组重复，可以删掉 1 个（每组保留名字最全的那个）。 | 扫了 7 个 · 1 组重复 · 可删 1 个（每组留名字最全的） |
| 去重结果 | 删除了 1 个重复书签。 | 删了 1 个 |
| 按钮 | 扫描重复书签 / 删除重复项 | 扫描重复 / 删除 1 项 |
| 自动说明 | 按设定的频率扫描全部书签，自动删掉重复的 | 按频率扫全部书签，自动删重复 |
| 块标题说明 | 规则先筛，剩下的交给模型 / 想让它自己跑的时候再打开 | 去掉，只留「链接或标题相同」 |
| 记录 | 上次整理（2026/9/16 16:49:59）：移动 5 · 删重复 1 · 合并 0 · 清空文件夹 0 | 上次整理 9/16 17:05 · 移动 5 · 删重复 1 |

### 行样式统一（一键整理 / 重复检测）

原来「一键整理」的勾选框和按钮各占一行、「重复检测」的说明挤在标题右侧，看着不整齐。
现在这两块也改成「自动」那种行样式：一行一件，左边标题 + 一句说明，右边控件，行间一条细线。

| 块 | 第一行 | 第二行 |
| --- | --- | --- |
| 一键整理 | 已归类的书签 / 打开就重新整理已经在文件夹里的 → 勾选框 | 整理收藏栏 / 先给预览，确认后才移动 → 开始整理 |
| 重复检测 | 重复书签 / 链接相同，或标题与路径相同 → 扫描 | 找到的重复项 / 每组保留名字最全的那个 → 删除 N 项 · 取消 |
| 自动 | 新书签自动分类 → 开关 | 定时去重 → 开关（打开后再显示扫描频率） |

「删除 N 项 / 取消」不再整行消失，而是先禁用、扫出重复后才可用（`.bm-line .btn:disabled`），
这样块的高度不会在扫描前后跳一下。`setBusy` 也顺手修好了：它原来收尾时无条件把按钮
设回可用，会把「本来禁用」的状态弄丢。

### 设置页字体统一（微软雅黑）

原来 `options.css` 的字体栈是 `-apple-system, "Segoe UI", "Noto Sans SC", system-ui`：
在 Windows 上拉丁字母走 Segoe UI、汉字走回退字体，同一行里两种字形混着，看着不齐。

现在整页统一：

- `body` 的字体栈改成 `"Microsoft YaHei", "微软雅黑", "PingFang SC", "Noto Sans SC",
  system-ui, sans-serif`，汉字和拉丁都走雅黑。
- 补一条 `input, select, textarea, button { font-family: inherit; }` —— 表单控件默认
  不继承页面字体，不补的话下拉框和输入框还是系统默认字体。
- 字号、字重、行高全部不动。

`tests/options-shot.cjs` 增加了字体检查：打印系统里有没有装雅黑，并逐个读出 body、
标题、按钮、下拉、输入框、勾选框、书签面板标题的字体栈，全部以 `Microsoft YaHei` 开头
才算统一。当前输出：

```
yahei installed    : true
font family        : "Microsoft YaHei", 微软雅黑, "PingFang SC", "Noto Sans SC", system-ui, sans-serif
font everywhere    : yes
```

### 字幕改成替换原文

原来译文单独画在播放器那行字幕的**上方**，原文照旧显示。现在改成替换：

- 我们自己的字幕条**站到原来那行的位置上**（`place()` 里不再 `caption.rect.top - height - 8`，
  直接用 `caption.rect.top`）。
- 我们这条字幕在屏幕上时，播放器自己那行被隐藏：给它的容器加一个
  `data-codex-subtitle-hidden` 属性，配一条 `{ visibility: hidden !important }` 的规则。
  只动 `visibility`，播放器自己的 `style` 和布局都不碰；元素被播放器换掉时属性跟着走，
  我们这条消失时属性撤掉、原文立刻回来。
- 原生 `TextTrack`（浏览器自己渲染的那条）没法用属性盖，就在同一条样式里加
  `video::cue { visibility: hidden !important }`，只在我们这条字幕显示期间生效。
- 读字幕文本从 `innerText` 改成 `textContent`：原文被我们隐藏后 `innerText` 会读成空，
  那样会「字幕被藏→读不到→还原→又读到」来回抖动。

同时修掉一个连带问题：整页翻译会把这行字幕**也翻一遍**（尤其是它后来加了「补翻晚到内容」
之后），两个功能抢同一段文字——字幕先被整页翻译改成中文，字幕功能就会以为"已经是中文"
而什么都不显示。现在 `content.js` 在有 `<video>` 的页面上跳过玩家的字幕层
（已知选择器 + class/id 里带 caption/subtitle/timedtext/player-text 的祖先，最多向上找 6 层），
字幕交给字幕功能，页面其余部分照常翻。

验证：`tests\e2e-subtitle.cjs` 现在检查「替换」这件事本身。

```
dom caption   : "机器学习模型需要数据。"
replaces line : over=true  inside video: true        ← 正好落在原来那行的位置
original line : hidden=true  marked=true  cue rule=true
page caption  : "Machine learning models need data." style=null   ← 页面自己的文字与样式没被动过
cleared       : overlay hidden=true  original back=true           ← 字幕消失后原文立刻回来
track cue     : "字幕轨道也会被翻译。"  has CJK: true
switch off    : overlay present = false
```

### 说明文字再瘦身

设置页里能删的说明都删了，只留信息量高的：重复检测的两句判定规则、以及关闭思考那条
「网关不认就关掉」的排错提示。其余每行只留标题，按钮/开关在右侧。

| 位置 | 改后 |
| --- | --- |
| 书签整理顶部 | 按收藏栏的文件夹归类、清重复，动手前先给预览。 |
| 一键整理两行 | 已归类的书签 / 整理收藏栏（说明整行去掉） |
| 重复检测两行 | 重复书签·链接或标题相同 / 找到的重复项·每组留名字最全的 |
| 自动三行 | 新书签自动分类 / 定时去重 / 扫描频率（说明去掉） |
| 书签模型 | 默认跟随主模型 |
| 视频字幕说明 | 播放器的字幕自动翻译，译文替换掉原本的那行。 |
| 模型页 | 和 Codex 的对话模型互相独立，点卡片切换。 |
| 术语表 | 命中的词条会强制使用指定译法；自建同名词条会覆盖内置的。 |
| 站点规则 | 不自动翻译，也不显示划词气泡 |

---

## 14. 后续修补：为什么中间有一块没翻译

现象：账单页侧边栏（静态标记）全翻好了，中间那块（数据渲染出来的）整片英文。

先把"到底哪种形状会被跳过"用夹具钉死（`tests\fixture-skips.html` +
`tests\probe-skips.cjs`，一次跑十种形状），查出三个真原因：

1. **徽章类行内元素漏掉**。`ON GOAT PLAN` 这种 `<span>` 直接挂在卡片下，而卡片因为还有
   块级子元素被当成"容器"跳过，`<span>` 本身又不算文本块 —— 两边都不管，那段文字没人翻。
   修法：容器的**行内子元素**（span/a/b/label/…）以及容器**自己的直接文本**补成独立单元；
   只对"容器"这么做，所以句子里嵌的 `<span>` 仍然跟着整句走，不会被拆开翻。
2. **页面重渲染后不再翻第二次**。单页应用拿到数据会把区块重画一遍，文字回到英文，而我们
   打在元素上的 `data-codex-translated` 标记还在，于是那个块被永久跳过。
   修法：标记再带一个 `data-codex-translated-hash`（我们写进去那串文字的指纹），
   只有内容仍然等于指纹时标记才算数；对不上就当作原文回来了，撤掉标记重翻。
3. **Web Component 的 shadow DOM 根本没被遍历**。`TreeWalker` 跨不过 shadow 边界，
   组件库把文字放在里面就等于不存在。修法：把每个 open shadow root（最多三层）也走一遍。

修的过程中还揪出两个连带问题：

- **容器集合把已翻译的块漏掉了**：某块因为"已翻译"被跳过以后，它的父元素不再是容器，
  于是父元素自己被当成单元收进来，带着已经翻好的中文文本又进模型 —— 语言判定一看"全是
  中文"就整批退出，新内容永远等不到翻译。现在容器集合按"页面里所有文本块"算，
  不管它翻没翻过。
- **`restorePage` 只还原最后一轮**：补翻是各跑各的一轮，`pageRun` 被覆盖，前面几轮的原
  文就找不回来了。现在用一个跨轮次的 `translatedUnits` 记录，"还原本页原文"能把补翻的
  内容一起还原。

顺带把"容器自己那段文本"用 WeakSet 记住（文本节点挂不了属性），否则每轮补翻都会把它
再翻一次、双语模式下还会越叠越长。

验证：新增 `tests\e2e-shapes.cjs`（13 项断言，夹具就是上面十种形状），外加
`tests\probe-skips.cjs` 作为排错工具。关键输出：

```
ok   a link alone in a div  [购买信用点数]
ok   a row of links  [取消 / 更改计划 / 管理]
ok   a badge span next to block children  [ON GOAT 计划 额外信用点数 …]
ok   a link as the heading  [开始使用命令行界面（CLI）…]
ok   text inside a shadow root  [工作区的信用点数由所有成员共享。]
ok   a re-rendered block is translated again  [您的计划现在每月自动更新一次。]
ok   a block added later is translated  [成功经验（Credits）在整个工作区（Workspace）内被共享。]
ok   restore brings the originals back  [Cancel Change plan Manage / marks=0]
RESULT: all checks passed
```

另外在 `<html>` 上留了一个单词的诊断属性 `data-codex-translate-state`
（`queued` / `skip:cooldown` / `quiet:done 2` …），出问题时一眼能看出补翻是没触发、
被限流，还是自己退出了。

---

## 15. 译文错位：真正的原因与修法

用户反馈"里面的翻译错位了"。这次先做了一个**能机械判定错位**的测试，而不是靠眼睛看：
假网关不是模型，而是把每一行原文原样包成 `« 原文 »` 返回；翻完之后逐个元素比对，
出现「没有包裹」「别人的包裹」「两份包裹」三者之一即判错位，并报出是哪个元素。

第一次跑就掉了 7 项，全部集中在两种形状：

```
FAIL a1x Monthly usage summary  [wrong text :: « Monthly usage summary 41 percent used »  (expected « Monthly usage summary »)]
FAIL a1y 41 percent used        [not translated :: ]
FAIL a3x Cancel everything now  [wrong text :: « Cancel everything now Change the current plan Manage billing details »]
FAIL a3y Change the current plan[not translated :: ]
FAIL a3z Manage billing details [not translated :: ]
FAIL a9x Workspace credits      [wrong text :: « Workspace credits Zero dollars »]
FAIL a9y Zero dollars           [not translated :: ]
```

**原因**：像 `<div class="row"><span>标签</span><span>数值</span></div>`、
`<div class="row"><a>取消</a><a>改套餐</a><a>管理</a></div>` 这种一行两项以上的结构，
文字全在行内子元素里、自己没有任何直接文本 —— 于是整行被当成**一个**文本块翻译。
「仅译文」模式下，整段译文写进第一个文本节点、其余文本节点被清空，所以：
第一个子元素显示整段（标签+数值连在一起），后面几个**变成空白**。这就是"错位"。

**修法**：这类块不再当单元，改成它的每个带文字的行内子元素各自成单元
（判据：自己没有非空直接文本，且有两个以上带文字的行内子元素）。
句子里嵌 `<b>` / `<span>` 的情况不受影响 —— 那种块自己有直接文本，仍然整句翻译。

**覆盖**：`tests\e2e-align.cjs` —— 23 个元素 × 两种显示模式（仅译文 / 双语对照）共 47 条
断言，另加"网关确实被调用"和"无页面错误"。夹具 `fixture-align.html` 覆盖：标签+数值行、
徽章+块级行、一排链接按钮、句子内嵌粗体、图标+文字按钮、表格四格、列表与定义列表、
带装饰重影的标题。

```
ok   a1x Monthly usage summary  [« Monthly usage summary »]
ok   a1y 41 percent used  [« 41 percent used »]
ok   a3x Cancel everything now  [« Cancel everything now »]
ok   a3y Change the current plan  [« Change the current plan »]
ok   a3z Manage billing details  [« Manage billing details »]
ok   bilingual a9y Zero dollars  [Zero dollars « Zero dollars »]
RESULT: all checks passed
```

顺带更正上一节（第 14 节）里的一条结论：那时把"一排链接"记为「translated ✓」是**假通过** ——
它其实是被合并成一段翻的，元素本身空了。现在这种形状由 `e2e-align` 盯着。

---

## 16. 提速：先量，再改

用户反馈「翻译速度太慢」。这次没有猜，先做了一个能读出并行度的天平：
`tests\e2e-speed.cjs` —— 200 段的静态页，假网关固定 500 ms 才回一句，
于是「发了几次请求」「一共耗掉几个 500 ms」「同时最多几个请求在飞」都是读出来的数。

改前（20 段一批、一批一批等）:

```
blocks            : 200
gateway requests  : 11    <- 200 段 / 20 段一批
first译文 at       : 1215 ms
all译文 at         : 5881 ms
batch window      : 4666 ms  (约 9.3 个 500 ms)
```

**瓶颈一：请求排队。** `content.js` 每批只发 20 段，而且要等上一批回来才发下一批。
引擎里本来就有的并发（`engine.js` 的 `CONCURRENCY = 8`、`BATCH_MAX_ITEMS = 40`）
因此永远轮不到用 —— 整页的时间就是「往返 × 批数」。

改法：`BATCH_UNITS` 20 -> 40（引擎自己合并的上限就是 40，更小只多占往返），
再加 `BATCH_PARALLEL = 4`：四批同时在飞，谁先回来先落地，进度按落地数往上走。
顺带把错误处理改成「单批失败不影响其他批」，只有全部批次都失败才报错 ——
出错横幅的行为因此没变，`e2e-error-pill` 照旧。

**瓶颈二：开跑前固定干等 600 ms。** 来自启动处的 `setTimeout(..., 600)`。
改成 `startWhenSettled()`：盯住文档，安静 200 ms 就开跑，最晚不超过原来的 600 ms。
已经渲染完的页面约 210 ms 就开工；还在刷首屏的应用仍然等满 600 ms，不会更差。

**瓶颈三（感知上的）：第一批太大。** 单元是按阅读顺序收集的，40 段一批意味着
本地模型要等满满一批才有第一句译文。所以 `BATCH_FIRST_UNITS = 8`：第一批只发 8 条，
后面的仍然是整批。真实模型上第一段译文从「等一个整批」变成「先出几段」，
请求数只多一个，总时长基本不动。

**顺带收紧：一个全局闸门。** 引擎原来每次调用各建一个并发限制器，
现在页面会同时发好几批、长文本还会在引擎里再拆，各建一个就等于没有总上限。
改成模块级共享的 `requestQueue`：无论活儿怎么来，供应商同时最多看到 8 个调用。

改后：

```
blocks            : 200
translate model   : slow
gateway requests  : 6
peak concurrent   : 4
first译文 at       : 843 ms
all译文 at         : 1365 ms
batch window      : 522 ms  (约 1 个 500 ms)
```

整页 5881 ms -> 1365 ms，约 4.3 倍。剩下的 843 ms 里，500 ms 是模型那一次往返，
约 210 ms 是等页面稳定的那一下，其余是内容脚本与服务 worker 的启动 —— 已经贴着
单次往返的下限，再快就得从模型本身拿了。

「6 次请求」不是算错：夹具是 1 个标题 + 200 段 = 201 个单元。

**本地模型另算一本账。** 上面是调度，换成真实的本地 Ollama
（`tests\probe-speed-local.cjs`，独立诊断，不进回归）后：

```
one 40-line call : 18059 ms
one 8-line call  : 3264 ms
four at once     : 8042 ms  -> about 1.6 of them run at once
blocks           : 200
first译文 at      : 17992 ms
all译文 at        : 54115 ms
the same 201 blocks one batch at a time would be about 90295 ms; this was 54115 ms
```

本地这台服务器同一时刻只真跑约 1.6 个请求，所以四路并发在本地只换到约 1.7 倍；
单次 40 行要 18 秒，整页 54 秒。**本地速度的天花板在模型和它的服务器上**
（Ollama 的并行槽位数、模型大小、量化），不在调度 —— 调度这边能省的时间已经省完了。
换更小的模型、或把服务器的并行度调大，才是本地继续提速的手段。

本地第一段译文的时间波动很大（另一次同样的跑法是 5.2 秒）：服务器会把同时到达的几个请求
放在一起推进，谁先出完就不一定了。云端模型各请求互相独立，首批变小这一条才稳定生效。

改动文件：`src\translate\content.js`（批大小、并行、起始时机、首批大小）、
`src\translate\engine.js`（共享闸门）。

验证：`tests\e2e-speed.cjs` 连跑三次稳定；整套 `e2e-*` / `probe-*`
（page / late / layout / translate / shapes / align / subtitle / error-pill /
skips / bookmarks / options-shot / model-switch / panel-zh / cloud-dialog /
fake-gateway）重跑一遍，无回归。截图：`tests\out\speed.png`（整页 201 段全部翻完）。

---

## 17. 本地小模型实测：translategemma:4b 对 hunyuan-mt-7b

用户问「有没有更好的翻译小模型」。这台机器是 RTX 4060 Ti 8GB，
所以选了一个 4B 的翻译专用模型（`ollama pull translategemma:4b`，3.07GB）和现有的
hunyuan-mt-7b（4.31GB）对打。诊断脚本 `tests\probe-speed-local.cjs` 现在可以用
`$env:SPEED_MODEL` 指定要测哪个，并且会先做一次不计时的预热 ——
模型刚加载的那几秒会把数字带偏（第一次测到的 46.8 秒里有一半是加载）。

同一台机器、都已加载，同一张 201 段的页面：

```
                      translategemma:4b   hunyuan-mt-7b
一次 40 行            11.5 s              20.2 s
一次 8 行              2.1 s               3.4 s
四个小请求同时发        4.6 s（约 1.8 并发）  9.0 s（约 1.5 并发）
整页 201 段           44.3 s              60.6 s
第一段译文            13.2 s               5.4 s
漏翻                  0                   0
```

速度上 4B 全面占优（整页快约 27%，单批快约 1.75 倍）。第一段译文两个模型都波动很大，
原因是本地服务器把同时到达的几个请求放在一起推进，谁先出完不一定 ——
这一点在第 16 节已经量到，不是这次改动引入的。

译文抽查（`tests\probe-translation-quality.cjs`，7 句真实界面文案，两个模型都是 7/7 行）：

```
Credits never expire, and the whole workspace shares one balance.
  translategemma -> 积分永不过期，并且整个工作空间共享一个余额。
  hunyuan        -> 信用点数永远不会过期，整个工作空间共享同一个信用余额。

Requests on this model cost no credits while capacity lasts.
  translategemma -> 针对此型号的请求在容量允许的情况下不收取积分。
  hunyuan        -> 在容量允许的范围内，使用该模型的功能无需支付信用点数。
```

质量差距不大，hunyuan 的措辞略自然一点（"信用点数""容量允许的范围"），
4B 会把 Credits 译成"积分"、把 model 译成"型号"。实际使用时扩展会注入内置术语表，
这类词会被统一成项目里定的译法，所以差距比裸测更小。

结论：日常用 `translategemma:4b`，要更顺的中文时切回 hunyuan。
设置页的本地模型列表会自动刷新（实测已显示"找到 2 个模型"），不需要手填。
本地速度的硬上限仍然是服务器的并行槽位，换云端模型才是整页提速的大头。

---

## 18. 换默认本地模型 + 专有名词不翻译

用户决定「把原来那个模型卸载掉」，并要求有些专有名词不要翻，比如 ChatGPT。

**默认模型换代。** `settings.js` 里的 `TRANSLATE_DEFAULT_MODEL` 从
`hunyuan-mt-7b:latest` 换成 `translategemma:4b`（第 17 节测下来单批快约 1.75 倍）。
光换默认值不够：老用户存的是旧模型的**副本**（模型列表里存的是 baseUrl + model 字段，
不是引用），本地把模型删掉之后，那个副本就会一直连接失败。所以加了一次性迁移
（`TRANSLATE_MODEL_STAMP`）：读到旧本地的词条就原地换成新的，`translateModelId` /
`subtitleModelId` 指过去的一并改过来，然后打上标记，不会重复迁移 ——
哪天用户自己又把旧模型拉回来手动选上，也不会被改回去。
旧模型已从 Ollama 卸载（`ollama rm hunyuan-mt-7b:latest`，实测磁盘只剩 3.3GB 那一个）。

**专有名词保持原文。** 术语表里原本就有几条 `ChatGPT -> ChatGPT` 这种两边一样的词条，
但那只是把「同名」当成普通词条喂给模型，模型爱看不看。现在分成两段说清楚：

```
Do not translate, transliterate or explain these names. Keep them exactly as written:
- ChatGPT
- Command Code
```

真正翻成什么的部分仍然是老样子（`API Key -> API 密钥`）。判据就是「原文与译法相同」，
所以用户想加自己的不译词，在设置页把两边填一样就行，不用新的界面。

另外，整段只有专有名词时（一个链接写的就是 `ChatGPT`、一行只有 `OpenAI, GitHub`）
现在**根本不发请求**：答案只可能是它自己，问了反而有翻坏的风险。
匹配是区分大小写的，所以 `Edge cases` / `the windows are open` 这类普通词不受影响
（为此清单里放的是 `Microsoft Edge` 而不是 `Edge`，也刻意不收 `apple` / `windows` 的小写形态）。

内置不译清单也扩了一批（AI 产品与厂商、本扩展要对接的工具、操作系统与语言、文件格式、硬件），
共 86 条内置词条（`options-shot` 输出 `builtin: 86`），设置页里这类词条的「译法」列显示
「保持原文」，不用看两遍同一个词：

```
keep-as-is row     : ChatGPT 保持原文 内置
```

验证（`tests\fake-gateway.cjs`，直接看发给模型的请求体和请求数）：

```
glossary injected  : true / true
name-only batch    : "ChatGPT"  requests=0 (expect 0)
keep-as-is rule    : true / true
plain words open   : true (text says edge cases)
```

`tests\model-switch.cjs` 现在同时覆盖迁移（存旧词条 → 读出来是 TranslateGemma-4B）。
整套 `e2e-*` / `probe-*` 用新默认模型重跑一遍，全部通过。

一个要留意的地方：字幕那条路上，新模型更愿意执行「放不下就精简」的指令，
实测 `Subtitle tracks are translated too.` 在字幕条里译成「字幕已翻译」，
比旧模型省掉了一些词。这是照着用户之前「精简一点」的要求在走，
如果哪天觉得丢信息，把提示词里的压缩指令放松即可。

---

## 19. 模型卡片加删除

用户截图反馈「没有删除按钮」：换了默认模型之后，旧的那张卡（Hunyuan-MT-7B）留在列表里，
既删不掉也不能用，只能看着。模型卡片原本只有「设为在用 / 测试 / 编辑」。

改法（`options.js`）：

- 每张卡片后面加一个「删除」，样式沿用现有的胶囊按钮（`btn sm ghost danger`）。
- **点两下才删**：第一下变成「确认删除」，2.6 秒不动就自己变回去。
  同一行已经挤着「测试」和「编辑」，手一抖不该把手工填过的模型丢掉。
- 删掉的只是这张卡，本地模型文件不受影响，随时可以用「添加模型」加回来。
- 删的正好是「在用」那张时，「在用」自动交给剩下的第一张；字幕模型若指向它，回到「同翻译模型」。
- 只剩一张卡时删除按钮不出现 —— 一个模型都没有就没什么可翻译的了。

顺带把第 18 节那个迁移改稳：如果用户已经手动把 TranslateGemma 加进列表了，
旧的那条就直接删掉（不留两张一样的卡），否则才原地改名。

**测试抓到一个真 bug。** `model-switch.cjs` 打印出「卡片改名成功、但当前模型指向没跟上」：
迁移里我先执行了 `Object.assign(old, TRANSLATE_DEFAULT_MODEL)` 再比对
`merged.translateModelId === old.id`，此时 `old.id` 已经是新 id，比对必然落空，
结果是卡片换了名字、权限还挂在旧 id 上（设置页里一眼看去没有任何卡片是「在用」）。
改成先取出 `oldId` 再改名。第一次跑的输出留在下面，这就是修它的依据：

```
migrated: true  (old local entry -> TranslateGemma-4B)
stored : local-hunyuan  (expect local-translategemma)     <- bug
```

修好后（`tests\model-switch.cjs`，三个模型，覆盖改名后指向、切换、删除三条路）：

```
before : [TranslateGemma-4B 在用] [Command Code 设为在用] [OpenCode 设为在用]
migrated: true  (old local entry -> TranslateGemma-4B)
stored : local-translategemma  (expect local-translategemma)
delete asks first: "确认删除" (after one tap)
spare removed  : true  (2 left)
active removed : true  (TranslateGemma-4B took over)
last one kept  : true  (no delete button on the only card)
```

截图：`tests\out\models-delete.png`（第三张卡停在「确认删除」的状态）。

---

## 20. 侧边栏合并五个菜单 —— 已按用户要求还原

先做了一版：把模型 / 语言与显示 / 术语表 / 视频字幕 / 站点规则 合并成侧边栏的一项
「网页翻译」，五块内容按顺序堆进同一页（`#view-web`），页内小标题用 `h2.sec` 加一条细线分隔，
不再点一下换一页。侧边栏那时只剩「网页翻译」「书签整理」两项，分组标题也去掉了。

用户随后说「侧边栏还是还原原来的几个吧，不要合并了」，所以这一版**已经退回去**：

- `options.html` 恢复五个平级菜单 + 「网页翻译」「书签」两行分组标题，五块内容各自回到
  `<section class="view" id="view-*" hidden>`，各自带自己的 `<h1>`。
- `options.css` 里为合并版加的 `.sec` 规则一并删除，没有留下没人用的样式。
- 测试也改回去：`options-shot.cjs` 重新按菜单切页截图（`showPane`），
  `cloud-dialog.cjs`、`e2e-bookmarks.cjs` 里点回 `[data-pane="models"]`。

这一版唯一保留的东西是合并期间顺手做的修复：`cloud-dialog.cjs` 里那行「先点模型菜单」
曾经被换成 `#addModel` 但忘了删原行，连点两次被刚弹出的对话框挡住，报
`<div class="modal" id="modelModal">… intercepts pointer events`；现在是干净的单次点击。

还原后重跑：`options-shot`、`model-switch`、`e2e-bookmarks`、`cloud-dialog`、`e2e-page`
全部通过，无页面报错。

---

## 21. 右键菜单：总结全文

用户要求「右键菜单里面加一个总结全文的按钮，参考原来的那个扩展」。
早先的移植表里这条被标成「不做」（理由是"没有落点"），这次补上。

**菜单**（`engine.js`）：`createTranslateMenus` 里加一项「总结全文」，`contexts: ['page']`，
排在「翻译整页」后面。点击后和翻译整页同一条路：`chrome.tabs.sendMessage(tab.id,
{ type: 'translate:summarize-page' })`。菜单在 onInstalled / onStartup 重建，和原来四项同一段代码。

**落点**：原扩展把总结显示在自己的侧边栏里；这个扩展的侧边栏是 Codex 的，不能占用，
所以落点是页面里的浮层卡片（`translate/summary.js`，独立内容脚本）。
它和翻译气泡、字幕条一样住在一个 shadow root 里：页面自己的 DOM 和 CSS 一个字节都不碰。
面板固定在右上角，标题「总结」，右上角两个图标按钮（复制 / 关闭），正文是渲染过的 Markdown。

**正文提取**照搬原扩展的三级阶梯（`lib/page-extractor.js`）：

1. 语义标签：`article`、`[role=article]`、`.post-content`、`.markdown-body`、`#js_content` …
2. 打分搜索：在 `div/section/article/main` 里按「段落数 × 100 + 文本长度 + 链接密度 + 图片」打分，
   取最高的一块；分数接近的前三块合并（分页文章常见）。
3. 兜底：所有像正文的 `<p>`；再不行取 `body`。

同时搬了它的噪声规则：class/id 关键词（nav / sidebar / comment / footer / ad …，短词按整词比，
「ad」不会命中「gradient」）、链接密度过高、以及中文样板文字（免责声明 / 版权所有 / 风险提示 …）。

**改进的地方**：原扩展取的是容器的 `innerText`，容器里嵌一个侧栏就一起吞进去。
这里换成「容器内非噪声文本块按顺序拼接」，并且打分候选会剔除包含已选块的父块。
测试夹具 `fixture-summary-plain.html` 就是专门为这条路做的（没有 `<article>` 标签、
侧栏和评论都在同一个 layout 里），第一版就是在这里漏出了 `SIDEBAR-MARKER`，改成按块取之后才干净：

```
FAIL nav, sidebar, comments and footer stayed out  [SIDEBAR-MARKER]
ok   nav, sidebar, comments and footer stayed out  [clean]
```

**提示词**沿用原扩展那份（`storage.js` 的 `prompts.summarize`），删掉图标那两条：
中文、Markdown、第一行给结论、保留数字与名称、忽略导航广告免责声明。
模型用「翻译模型」那一档，没加新设置（实测本地这个 4B 就能胜任）。走共享的 `requestQueue`，
所以它和整页翻译一起排队，不会额外并发。

**Markdown 渲染**是自带的小渲染器：标题、加粗、行内代码、有序/无序列表。
全部用 DOM 节点拼，不用 innerHTML —— 文本来自模型，不能让它变成 script 标签。

**测试**（`tests/e2e-summary.cjs`，两张夹具各 12 项断言）：原生右键菜单没法在测试里点，
所以从扩展自己的页面（和菜单点击同一个来源）用 `chrome.tabs.sendMessage` 触发同一段逻辑。

```
ok   the summary script is loaded
ok   the menu action reaches the page
ok   the panel shows a summary  [结论： 年内可能还有一次加息。…]
ok   markdown became real markup  [1 heading(s), 3 item(s), 1 bold]
ok   copy and close are both there  [复制,关闭]
ok   the summary prompt was sent  [请用中文总结下面这篇网页正文，用 Markdown 输出。]
ok   the article reached the model  [1367 chars]
ok   nav, sidebar, comments and footer stayed out  [clean]
ok   the page text was not touched  [Interest rates and the year ahea]
ok   only our own host was added  [2 -> 3]
ok   关闭 removes the panel
ok   no page errors
```

另外 `tests\probe-summary.cjs` 用真实本地模型跑同一张夹具（不进回归，只看质量）：

```
model            : translategemma:4b
elapsed          : 8561 ms

结论： 央行预计在未来一年内继续加息，但具体时间取决于通货膨胀和劳动力市场的表现。

要点：
央行于周三宣布加息 0.25 个百分点，这是今年第四次加息，原因是通货膨胀已持续超过 2% 的目标 18 个月。
…
```

---

## 22. 总结全文改走侧边栏 + 修「点了没反应」

用户反馈：点了「总结全文」没反应；并且要的是——**自动打开侧边栏，把正文输进对话框，
让对话本身来总结**。

**为什么没反应。** 菜单点击后引擎发的是
`chrome.tabs.sendMessage(tab.id, { type: 'translate:summarize-page' })`。
重载扩展之后，**已经打开的标签页里没有内容脚本**（内容脚本是加载时注入的），
这条消息没有收件人，而代码里写的是 `.catch(() => {})` —— 于是静默失败。
这也解释了为什么测试全绿、用户却什么都看不到：测试每次都是新开的标签页。

改法（`engine.js`）：

1. 先 `translate:ping` 问一句有没有人；没回应就
   `chrome.scripting.executeScript({ files: ['translate/summary.js'] })` 手动注入，
   再问一次。`summary.js` 有 `__codexSummaryLoaded` 守卫，不会重复注册。
2. 点击后立刻给页面一条 `translate:summary-wait`，页面上先出现一张「正在交给侧边栏…」的卡片，
   不再是只有静默。

**新的流程。**

```
右键「总结全文」
  -> 内容脚本提取正文（translate:extract-page）
  -> 正文 + 标题 + 链接写进 storage（codexSummaryRequest）
  -> chrome.sidePanel.open({ tabId })
  -> 侧边栏脚本（panel-summary.js）找到对话框，写入提示词 + 正文，发送
  -> 写回结果（codexSummaryResult）；页面把那张等待卡片收掉
```

侧边栏脚本是新增的 `src\panel-summary.js`，和 `panel-zh.js` 一样被塞进
`codex-sidepanel/index.html`（见 `tools\apply-patches.ps1`）。它做的事：

- 找对话框：`textarea` / `[contenteditable][role=textbox]` / …… 依次试，最多等 20 秒；
- 写入：textarea 用原生 setter + `input` 事件（React 才认），富文本用 `execCommand('insertText')`；
- 发送：先找带 send / 发送 字样的按钮点它，找不到就模拟回车；
- 报告：成功/失败写进 `codexSummaryResult`，失败时附上「面板里有什么」
  （textarea=0 contenteditable=1 button=12 | 面板文字前 70 字），方便下次直接定位。

**兜底**：引擎等 25 秒。面板说失败（或者根本打不开面板，比如本机 Codex 服务没起），
就退回原来的做法——页面自己调模型出总结。所以最坏情况是「等一会儿，然后看到页面内的总结」，
不会再出现点了没反应。

**验证**（`tests\e2e-summary.cjs`，两个夹具各 16 项 + 侧边栏 5 项）：

```
ok   the article can be extracted on its own  [1367 chars]
ok   the extracted text has no page furniture  [clean]
ok   the panel shows a summary  [结论： 年内可能还有一次加息。…]
ok   the page text was not touched
ok   the panel script finds the composer  [126 chars typed]
ok   the composer gets a summary request  [true / true]
ok   the composer is sent
ok   the panel reports back  [{"ok":true,"reason":"发送方式：button"}]
ok   the request is spent once used
```

侧边栏那几项是在真实的面板页里测的：测试往面板页面里放一个替身对话框，
再看侧边栏脚本有没有把「提示词 + 正文」写进去、有没有点发送、有没有写回结果。
`tests\panel-dump.cjs` 也加了「composer candidates」一段，用来在真实环境里查面板结构。

**没能验证的部分（说明白）**：真正那个 Codex 对话框——面板只有在**本机 Codex 服务就绪**时
才渲染真实界面，测试里的干净配置只会看到「Open the ChatGPT side panel to start the local app server」。
所以「写入真实对话框」这一步是按常见结构写的（textarea / contenteditable + 原生事件），
现场对不对要用一次真实点击才知道；不对的话兜底仍然会给页面内的总结，
而失败信息会写进 `codexSummaryResult.reason`，我可以照它改。

---

## 23. OpenCode Go 返回 400：请求缺 x-opencode-session

用户报错：接 OpenCode Go 那一档，模型返回

```
400 {"type":"error","error":{"type":"MissingSessionID","message":"Error from provider
(Console Go): Request is missing x-opencode-session and cannot be routed efficiently."}}
```

**这不是密钥或地址问题，是少了他们要求的头。** OpenCode 的 Go 文档（Where can I use it?）
对客户端有两条要求：用自己的 User-Agent 标识自己（不要用通用 SDK / HTTP 库的名字），
以及**每个会话用一个稳定的 session id 放在 `x-opencode-session` 里**，他们靠它做路由和
prompt 缓存。文档里列出的已验证客户端（Claude Code、Codex、ZCode、Pi、jcode…）凑的就是
这一件事。扩展两处请求都只发了 `Content-Type` + `Authorization`，所以对端认不出会话。

**改法**（`src\translate\engine.js` 新增一段 provider helper）：

- `getSessionId()`：第一次用 `crypto.randomUUID()` 造一个 id 写进
  `chrome.storage.local.translateSessionId`，之后一直用它。翻译没有「会话」可言，
  所以按**安装级稳定**处理：重复翻译落在同一个路由/缓存桶里，而不是每条请求一个新桶。
  worker 重启后从 storage 读回同一个 id（`sessionIdPromise` 只保证一个 worker 里只读一次）。
- `isOpenCodeBase(base)`：只认 `opencode.ai` 和它的子域，**只给这些地址加头**。
  给一个从没答应过这个头的供应商多发一个自定义头，是白白弄坏已经能用的配置。
- `openCodeSessionHeaders(base)`：不是 OpenCode 就返回 `null`，调用方 `Object.assign` 一下即可。
  用在三处：`callModel`（网页/字幕/划词/总结走同一条路）、`handleListModels`
  （设置页的「测试」和模型列表）、以及书签分类器 `bookmarks\lib\classifier.js` 的
  `callClassifyModel`（同一个模型列表，同一个毛病）。

**User-Agent 这一条没做。** 浏览器不允许脚本设置 `User-Agent`，要改得走
declarativeNetRequest 改请求头，为一个「should」加一份规则文件和权限不划算；
Edge 自己的 UA 本来也不是「通用 SDK / HTTP 库名字」，按文档的口径不算违规。

**验证。** 新增 `tests\opencode-session.cjs`（进回归，不联网）：把 `translate\engine.js`
和 `bookmarks\lib\classifier.js` 按 service worker 的顺序装进一个 vm 沙箱，fetch 换成
记录器，然后断言**真正会发出去的那个请求对象**：

```
ok   the session header is sent to OpenCode Go  [{"x-opencode-session":"36edb76a-d9a3-…"}]
ok   the value looks like a session id
ok   the same id is reused, Zen and Zen/Go included
ok   the id was written to storage
ok   a new worker keeps the stored id
ok   other providers get no session header  [5 hosts checked]
ok   the translation request goes to /chat/completions
ok   it carries the session header
ok   it still carries the API key
ok   a non-OpenCode call is unchanged  [{"Content-Type":"application/json","Authorization":"Bearer sk-test"}]
ok   the model list comes back
ok   the model list request carries the session header
ok   the local model list request is unchanged
ok   the bookmark classifier carries the session header
```

「5 hosts checked」里包含 `https://opencode.ai.evil.example` 和 `https://notopencode.ai`：
后缀匹配写错就会把别人的域名当成 OpenCode，这两条是防这个的。

另外用 `tests\probe-opencode-wire.cjs`（诊断脚本，不进回归）在**真实 Edge 里**打了一次
真实端点，密钥故意用无效的——要证明的是头有没有出浏览器，不是服务怎么回：

```
service worker : chrome-extension://odlomjlbamekndcpllcnffbgeohgkmjh/translate/background-loader.js
helper says    : {"ok":true,"headers":{"x-opencode-session":"969ec011-20ad-4e3a-9995-9547fb45d402"}}
live call      : {"ok":false,"error":"模型返回 401：{\"type\":\"error\",\"error\":{\"type\":\"AuthError\",\"message\":\"无效的 API 密钥。\"}}"}
requests seen  : 1
  POST https://opencode.ai/zen/go/v1/chat/completions  auth=present  x-opencode-session=969ec011-…  from=service worker

header on the wire : true
still MissingSessionID : false
```

**说明白没验证到的部分**：无效密钥在对端是**先**判的（不带头的探测请求同样是 401
`Invalid API key`），所以「有效密钥的请求不再 400」这一步只能由用户下一次真实翻译来确认。
能确认的是：头确实随请求发出去了，且格式（标准 UUID）与文档里已验证客户端用的会话 id 同型。

**同一个档位的另一个坑：模型和接口不是一一对应的。** 用户添加 OpenCode Go 的
`union-alpha` 时，设置页「测试连接」报
`模型返回 500：{"type":"error","error":{"type":"error","message":"Internal server error"}}`。
不是密钥问题，是**协议不匹配**：OpenCode 的模型表里每个模型都标了自己走哪个端点，

```
union-alpha       https://opencode.ai/zen/v1/messages      @ai-sdk/anthropic
claude-*          https://opencode.ai/zen/v1/messages      @ai-sdk/anthropic
qwen3.7-max/plus  https://opencode.ai/zen/v1/messages      @ai-sdk/anthropic
gpt-5.x / gpt-6   https://opencode.ai/zen/v1/responses     @ai-sdk/openai
grok-4.5/4.6      https://opencode.ai/zen/v1/responses     @ai-sdk/openai
muse-spark-1.2/1.3 https://opencode.ai/zen/v1/responses    @ai-sdk/openai
glm-5.x / kimi-* / deepseek-v4-* / minimax-* / big-pickle
                  https://opencode.ai/zen/v1/chat/completions  @ai-sdk/openai-compatible
```

而扩展只会发 Chat Completions（`{baseUrl}/chat/completions`）。把一个 Messages 专属的模型
POST 到 chat/completions，对端路由不到就回 500 Internal server error —— 一个看不出原因的错。
两个 /models 列表里 `union-alpha` 都在（Go 38 个、Zen 71 个），所以**「模型列表里有」不等于
「这个扩展能调」**：列表是 OpenCode 的全量目录，`/zen/go/v1/models` 不带 key 都能拉到。
实测 `/zen/go/v1/messages` 这条路由是存在的（无效 key 回 401 而不是 404）。

结论：要接这一族模型，得给引擎加一条 Messages 通道（请求体映射 + content 块解析 +
`anthropic-version` 头 + 关思考参数换 `thinking:{type:'disabled'}`）；`/responses` 那一族还要
另一条。还没做，等用户决定。

---

## 25. 接口跟着模型自动选：加上 Messages 通道

用户确认要做，范围就是他提的那条：**只做 Messages，接口跟着模型自动选，不加新界面**。

**落点**（`src\translate\engine.js` 的 provider 段，`dialectRequest` 是唯一的请求出产地）：

- `preferredDialect(base, model)`：只对 `opencode.ai` 返回可能不是 chat 的答案，其它供应商
  一律 chat。已知族的表按厂商文档写：

  ```
  /^claude-/                      -> messages
  /^union-alpha$/                 -> messages
  /^qwen3\.[567]-(?:plus|max)$/   -> messages
  其余                             -> chat
  ```

- `dialectRequest(dialect, …)` 一个函数同时产出两种请求：

  ```
  chat      {base}/chat/completions  {model,messages,temperature,stream,max_tokens} + NO_THINK_PARAMS
  messages  {base}/messages          {model,system,max_tokens,temperature,messages:[{role,content}]}
                                     + x-api-key + anthropic-version + thinking:{type:'disabled'}
  ```

  system 轮提到顶层、messages 里只留 user/assistant —— 这两条是 Anthropic 的硬要求；
  `stream` 和 `response_format` 是 OpenAI 字段，messages 那条一个都不带。
- **表里没有的模型靠自己学会**：OpenCode 上一个不是 chat 的模型被发到 chat 路由，回的是
  500（我们量到的正是这个）。所以 5xx + OpenCode 主机 = 换上另一条路重试一次，成功后把
  `host|model -> dialect` 记进 `chrome.storage.local.translateModelDialects`，下次直接走对的那条，
  一次冤枉请求换一条永久结论。`/responses` 那族（GPT-5.x、Grok、Muse Spark）不在范围内，
  撞上去仍然是失败，只是不会假装成功。
- 响应侧：`extractContent` 补了顶层 `content`（Anthropic 的 `[{type:'text',text}]`，顺带兼容
  被中转压平成 `content:"…"` 的）；截断判定同时认 `finish_reason:'length'` 和
  `stop_reason:'max_tokens'`，所以「思考把预算花光」那条老路对新接口一样有效。
- 两条接口都失败时，错误信息会带上「已改用 X 接口重试」这行（原来只在整轮重试跑完时追加，
  提前抛出的那条路是没有的）。差别在于：一眼能看出是「这个模型我们两种接口都试过了」，
  而不是又撞上一个没头没尾的 500 —— 用户刚踩过这个坑，不该再靠猜。
- 书签分类器共用同一套：它原来的 `thinkingOffFields()` 删了（dialectRequest 按接口给），
  `extractMessageContent` 同样补了顶层 `content`。它的重试阶梯多一层：5xx 时把计划换成
  另一条路的三种形状。

**验证。** 新增 `tests\model-dialects.cjs`（进回归，不联网），和 `opencode-session.cjs` 一样把
`settings.js / engine.js / classifier.js` 按 service worker 的顺序装进 vm 沙箱、fetch 换成记录器。
28 项全过，关键几条：

```
ok   documented models pick the documented route  [9 models]
ok   other providers are never switched  [3 hosts checked]
ok   a Messages model is posted to /messages  [https://opencode.ai/zen/go/v1/messages]
ok   the reply is read from content[]  [[1] 机器学习模型需要数据。]
ok   it sends x-api-key and anthropic-version  [["Content-Type","x-opencode-session","Authorization","x-api-key","anthropic-version"]]
ok   the system prompt is hoisted out of the turns
ok   no OpenAI-only fields ride along  [["model","max_tokens","temperature","messages","system","thinking"]]
ok   a chat model still goes to /chat/completions  […/chat/completions]
ok   it keeps the OpenAI thinking-off fields  [["model","messages","temperature","stream","max_tokens","reasoning",…]]
ok   an unknown model falls back to the other route  [[1] 学到了]
ok   the lesson is stored  [{"opencode.ai|qwen3.8-max":"messages"}]
ok   the learned route is reused  [1 request(s)]
ok   a non-OpenCode 500 is not retried on another route  [1 request(s)]
ok   stop_reason max_tokens raises the budget instead of failing
ok   the classifier uses /messages for a Messages model
```

真实 Edge 里也打了一次真实端点（`tests\probe-opencode-wire.cjs`，密钥故意无效——证明的是走哪条
路、头在不在，不是服务怎么回）：

```
live call glm-5.3-flash   : 401 AuthError
live call union-alpha     : 401 AuthError          <- 不是原来的 500
  POST https://opencode.ai/zen/go/v1/chat/completions  auth=present  x-opencode-session=252eb1b6-…
  POST https://opencode.ai/zen/go/v1/messages          auth=present  x-opencode-session=252eb1b6-…
reached /messages  : true
still a router 500 : false
```

回归：`fake-gateway`、`e2e-translate`、`e2e-page`、`e2e-subtitle`、`e2e-summary`、`e2e-shapes`、
`e2e-late`、`e2e-layout`、`e2e-align`、`e2e-bookmarks`、`e2e-error-pill`、`e2e-speed`、
`model-switch`、`options-shot`、`cloud-dialog`、`panel-zh` 全过。（`e2e-bookmarks` 在一次八个
Edge 实例并排跑的时候超时报过一次「no loose bookmarks left」，单独跑连过两次，是并发负载下
的 UI 等待超时，不是这次改动；那台机器还有本地模型在抢 GPU。）

**没验证到的一句话**：手上没有有效的 OpenCode key，所以「有效 key 下 union-alpha 真的翻出
中文」这一步只能由用户在设置页点一次「测试连接」确认；能确认的是请求已经走上了对的接口，
而且不再返回路由器那个 500。

---

## 26. 第三条通道：OpenAI Responses

紧接着把 `/responses` 那族也接上（用户一句「加上」）。这一族在 Go 目录里有
`gpt-5.6-luna`、`grok-4.5`、`grok-4.6`、`muse-spark-1.3-contributor`、
`muse-spark-1.2-contributor`，在 Zen 目录里是整个 GPT-5.x / GPT-6 家族加 Grok、Muse Spark。

**做法**（同一个 `dialectRequest`，多一个分支）：

```
responses  {base}/responses  {model, instructions:<system>, input:[{role,content}], max_output_tokens}
                             + reasoning:{effort:'none'}（关思考时）
```

- system 走 `instructions`（Responses 自己的系统槽），其余轮次走 `input`；`temperature`
  故意不带 —— 这条路上是推理模型，它们对 temperature 有意见。
- 响应从 `output[].content[].text` 读（`output_text` 那条老路本来就认）。
- 截断现在是三套词汇一起认：`finish_reason:'length'`（chat）、`stop_reason:'max_tokens'`
  （Anthropic）、`incomplete_details.reason:'max_output_tokens'`（Responses），三种都会触发
  「加大输出上限重试」。
- 分类器同步：`extractMessageContent` 也认 `output[]` 了。

**接口怎么选**（`dialectCandidates`，从「试一次」升级成「有序试一遍」）：

| 情况 | 顺序 | 代价 |
| --- | --- | --- |
| 记忆里有结论 | 记住的那条打头 | 0 冤枉请求 |
| id 命中文档表（claude/union-alpha/qwen3.x-plus/max → messages，gpt/grok/muse-spark → responses） | 命中的打头 | 0 冤枉请求 |
| id 谁都不认识 | chat → messages → responses | 最多 2 次冤枉请求，成功即记住 |
| 非 OpenCode 主机 | 只有 chat | 一次都不试 |

`MAX_ATTEMPTS` 仍是 3，正好等于通道数，所以「三条都试过还是 500」会带着
「已改用 Messages 接口重试；已改用 Responses 接口重试」一起抛出，不会变成没头没尾的 500。

**验证。** `tests\model-dialects.cjs` 长到 42 项，新增的关键几条：

```
ok   documented models pick the documented route  [13 models]
ok   a Responses model is posted to /responses  [https://opencode.ai/zen/go/v1/responses]
ok   the reply is read from output[].content[]  [[1] 响应接口]
ok   the system prompt becomes instructions
ok   the turns become input  [[{"role":"user","content":"[1] Machine learning models need data."}]]
ok   the budget is max_output_tokens  [["model","input","max_output_tokens","instructions","reasoning"]]
ok   no chat-only or Anthropic fields ride along
ok   thinking off uses reasoning effort none  [{"effort":"none"}]
ok   an unknown model can land on the third route  [[1] 第三条路]
ok   it walked chat, messages, responses in order  [chat/completions,messages,responses]
ok   the third route is the one remembered  [{"opencode.ai|hy3":"responses"}]
ok   a model that refuses every route says which ones it tried  [3 request(s)]
ok   incomplete max_output_tokens raises the budget too  [[1] 响应加长成功]
```

真实 Edge 里三个模型打三条路由（`tests\probe-opencode-wire.cjs`，无效密钥）：

```
live call glm-5.3-flash   : 401 AuthError
live call union-alpha     : 401 AuthError
live call gpt-5.6-luna    : 401 AuthError
  POST https://opencode.ai/zen/go/v1/chat/completions
  POST https://opencode.ai/zen/go/v1/messages
  POST https://opencode.ai/zen/go/v1/responses
routes reached : /chat/completions=true  /messages=true  /responses=true
still a router 500 : false
```

回归：12 个脚本连跑一遍全过。两条只在机器被压着的时候才抖的：`e2e-bookmarks` 的
「no loose bookmarks left」超时（八个 Edge 并排那次），和 `fake-gateway` 里那行
`failed batch kept`（整批跑完接着跑时出现过一次 false，之后单独连跑四次都是 true）。
两条都是等 UI/等批次的等待项，和这次改动无关；`fake-gateway` 那行本来就是 `console.log`，
不是断言。

---

## 27. 真实 key 下的验证：Messages 通道通了，500 是 union-alpha 自己的

用户在设置页把「测试连接」点在了同一个 key、同一个 OpenCode Go 基址上，只换模型：

```
glm-5.3-flash   连接正常（1846 毫秒）  [1] 机器学习模型需要数据。    <- chat/completions
qwen3.7-max     连接正常（1608 毫秒）  [1] 机器学习模型需要数据。    <- /messages
union-alpha     模型返回 500：{"type":"error",…"Internal server error"}
                （已改用 Chat Completions 接口重试；已改用 Responses 接口重试）
```

两件事因此定了：

1. **第 25 节那条 Messages 通道在有效密钥下真的能用** —— `qwen3.7-max` 是被我们的表判给
   Messages 的，它拿到了真译文，所以那个请求确实走通了 `/zen/go/v1/messages`。
   第 25 节末尾那句「没验证到，要靠用户点一次」到此作废。
2. **union-alpha 的 500 不是我们请求形状的问题。** 同一个 key、同一个基址、同一条
   messages 路，`qwen3.7-max` 能过，它不能。而且它在 chat / messages / responses 三种
   结构完全不同的请求体下回的是**同一句** `Internal server error` —— 如果是「模型和接口不
   匹配」，三条里至少有一条该回 400/404 这类具体错。加上它 2026-09-16 才发布、标注
   Free（限时），models.dev 里它的 temperature 字段是空的，结论是上游那个模型自己挂着。
   能做的只有先别用它（`glm-5.3-flash`、`deepseek-v4-flash` 这些 chat 路的模型都正常）。

顺带一条行为记录：报错里那行 trail（「已改用 Chat Completions 接口重试；已改用 Responses
接口重试」）就是这次能一眼判定「不是接口选错」的依据 —— 第 26 节加那行提示的用处当场兑现了。

**还没用真 key 验过的**：Responses 通道（第 26 节）。它目前只有「无效密钥下请求确实发到
`/responses`」这一层证据，等一次 `gpt-5.6-luna` 的「测试连接」才算闭环。

---

## 28. 接口改成可以手选：设置页加一个下拉框

用户要求：「那三个协议让我自己来选，加个下拉框」。所以 `自动` 之外多一个手动档。

> **已被第 29 节取代**：这一节里的「自动」档（按模型名猜 + 失败后换路探测 + 记住哪条路
> 成功）后来被用户要求整个删掉了 —— 接口现在只有三条，必须手选。下面的原文保留，
> 只作当时的记录。

**设置页**（`options.html` / `options.js`，只加在「云端模型」那一侧 —— 本地那三种服务
只有 chat 一条路，多一个框只是噪音）：

```
接口  [ 自动 | Chat Completions | Messages（Anthropic） | Responses（OpenAI） ]
```

- 存在模型记录里就是一个字段：`dialect`，`''` = 自动，其余取 `chat` / `messages` / `responses`。
  老的记录没有这个字段，读出来是 `undefined`，落在自动档，不用迁移。
- 卡片副标题会多一段，只在这个字段有值的时候出现（`example.test · 云端 · Messages`），
  一眼能看出这条是被钉过的；没钉的不显示。
- 「测试连接」和「保存」走的是同一个 `readModalModel()`，所以测试的就是你选的那条路。

**引擎**（`dialectCandidates(base, model, chosen)` 多收一个参数）：

```
chosen 是三者之一  -> [chosen]                只走这一条，不猜、不探测
否则              -> 原来的逻辑（记忆 -> 文档表 -> chat/messages/responses 依次试）
```

「钉住就只走它」是刻意的：用户既然手选了，就别再自作主张换路 —— 想让它自己找就留在
「自动」。副作用是钉住时那个 5xx 不会再有「已改用 X 接口重试」的提示，因为确实没换。
钉住也允许跨供应商（比如把某个自建 Anthropic 兼容中转填成 Messages），不再是
OpenCode 专属的开关。

**验证**

`tests\model-dialects.cjs` 加到 45 项，新增：

```
ok   a pinned interface overrides the model-name guess  [3 pins]
ok   a pinned interface is not walked on a 5xx  [1 request(s)]
ok   a pin wins over the learned route  [https://opencode.ai/zen/go/v1/messages]
ok   a pin is honoured even off OpenCode  [http://127.0.0.1:11434/v1/messages]
```

`tests\cloud-dialog.cjs` 本来只截图和查 CSP，这次给它加了断言（并改成失败退 1）：

```
ok   the interface picker offers auto plus the three protocols  [=自动,chat=Chat Completions,messages=Messages（Anthropic）,responses=Responses（OpenAI）]
ok   the card says which interface was pinned  [example.test · 云端 · Messages]
ok   reopening the model shows the pinned interface  [messages]
```

截图 `tests\out\dialog-cloud-dialect.png`（下拉框在「模型 ID」下面，和上面几行同宽同位）。
回归 13 个脚本全过。

---

## 24. 把本机两个模型库并成一个（本地默认模型恢复可用）

第 17、18 节测过的 `translategemma:4b`，在这台机器上一直连不上：扩展发出去得到的是
`404 model 'translategemma:4b' not found`。原因不在扩展，而在 Ollama 有两个模型库：

```
D:\ollama\models     blobs 5 + manifest 1 + metadata 1   translategemma:4b（3.07GB，完整）
D:\ollama_models     blobs 4 + manifest 2 + metadata 2   hunyuan-mt-7b + qwen3-4b
```

而**哪个被用上取决于服务启动时拿到的环境**：正在跑的 `ollama serve`（12:15 启动）拿到的是
`OLLAMA_MODELS=D:\ollama_models`，用户级环境变量却是 `D:\ollama\models`。于是
`ollama list` 只列出 hunyuan 和 qwen3，扩展默认那一档指向的标签根本不存在。
（12:15 那次启动是升级之后由 `cmd /C set PATH=D:\ollama;%PATH% & "ollama app.exe"` 拉起来的，
环境是那一刻继承下来的，不是当前用户环境。）

**处理**（用户选「并成一个库」）：停掉 app 与 serve，确认没有模型还在显存里，把
`D:\ollama_models` 的 4 个 blob、2 个模型 manifest、2 个 metadata 逐条 `Move-Item` 进
`D:\ollama\models`（同一块盘，是改名不是复制，秒完），确认源目录只剩空目录后删掉
`D:\ollama_models`，最后带着 `OLLAMA_MODELS=D:\ollama\models` 重新拉起 app。

**验证**

```
ollama list
  translategemma:4b       c49d986b0764    3.3 GB
  hunyuan-mt-7b:latest    cc4586ffa555    4.6 GB
  qwen3-4b:latest         83f94de04436    2.5 GB

新服务的配置转储：OLLAMA_MODELS:D:\\ollama\\models
```

直连 `127.0.0.1:11434/v1/chat/completions` 用 `translategemma:4b` 真翻（扩展走的就是这条路）：

```
界面文案  30199 ms | 信用额度永不过期，并且整个工作空间共享一个余额。   <- 含首次加载
字幕单句    197 ms | 我们不会再回去那里，毕竟发生了那样的事情。
短标签      123 ms | 字幕也进行翻译。
```

之前因为 404 报「nothing was translated」的三个回归脚本全部恢复：

```
e2e-translate  TEXT: 机器学习模型需要在大规模数据上进行训练，才能很好地泛化。…  按钮：复制/替换原文/重译
e2e-subtitle   dom caption "机器学习模型需要数据。"  has CJK true   track cue "字幕已翻译"
e2e-page       RESULT: 3 block(s) translated   marks before restore: 3
```

截图 `tests\out\page-translated.png`（真实 Edge、整页翻译、进度胶囊「已翻译 3 段」）。

**两个要留意的**：第一次调用那 30 秒是**加载模型**，不是翻译慢（`OLLAMA_KEEP_ALIVE=5m`，
五分钟内再来就一直是几百毫秒）；如果哪天 `ollama list` 又变回两个模型，先看服务启动时
继承到的 `OLLAMA_MODELS` 是哪一个，目录本身已经只有一个了。

**紧接着：另外两个模型删掉。** 用户要求只留 `translategemma:4b`，所以
`ollama rm hunyuan-mt-7b:latest` 和 `ollama rm qwen3-4b:latest` 都执行了。
Ollama 自己把两边的 blob 也回收了：`D:\ollama\models` 从 15 个文件 / 9.705GB
降到 7 个文件 / 3.072GB，两个大 blob 在磁盘上确认已不存在。

删之前把来源记下来了，将来想装回来有路径（`hunyuan-mt-7b` 不在 ollama 官方库里，
不是一条 `ollama pull` 能拿回来的）：

```
hunyuan-mt-7b   GGUF Q4_K_M  https://huggingface.co/mradermacher/Hunyuan-MT-7B-GGUF
                原始权重      https://huggingface.co/tencent/Hunyuan-MT-7B
qwen3-4b        Qwen3-4B-Instruct-2507 GGUF Q4_K_M（unsloth 转的）
```

删完立刻复测：`/v1/models` 只剩 `translategemma:4b`，直连翻译 208 ms 正常。

**用户 Edge 配置里可能留下旧卡片。** 扫了一眼扩展自己的存储
（`Local Extension Settings\odlomjlbamekndcpllcnffbgeohgkmjh`，只读、只查关键字），
里面还留着老一代记录：模型卡片 `id: local-hunyuan`、`model: hunyuan-mt-7b:latest`，
以及约 1774 处以 `hunyuan-mt-7b:latest` 为模型键的翻译缓存。leveldb 不压实就会一直留着
旧版本记录，所以**不一定**是当前生效的那份；真要判断得看设置页的模型列表。处理办法就两条，
都在设置页里：模型分区里把不是 TranslateGemma-4B 的卡片删掉（第 19 节的删除按钮），
语言与显示分区点「清空缓存」把按旧模型键存的缓存清掉（不清也不影响正确性，
缓存是 5000 条上限、按「文本 + 目标语言 + 模型」分键的）。

---

## 29. 拆掉「自动」档：接口只有三条，选哪条就走哪条

用户要求：「不要三条路轮的是，我选择哪个就是哪个，手动选择那一块，不要搞自动的。」
所以第 25～28 节那套自动机制整体删掉。

**删掉的**（`src\translate\engine.js`）：

```
ANTHROPIC_MODEL_PATTERNS / RESPONSES_MODEL_PATTERNS   按模型名猜接口的表
knownDialect() / preferredDialect() / dialectCandidates()
DIALECT_ORDER                                         chat -> messages -> responses 的轮询顺序
dialectKey() / dialectStore() / rememberDialect()      「哪条路成功过」的记忆
translateModelDialects（storage 键）                    随之不再写入
dialectLabel()                                        只服务于「已改用 X 接口重试」那行提示
retryReason = 'dialect'                               5xx 时换另一条路
```

书签分类器里对应的那套（`tryNextDialect`、路数 × 形状的 9 次 guard）也回到原来的三条形状阶梯。

**剩下的规则就一条**（`dialectFor(model)`）：

```
存的字段是 chat / messages / responses 之一 -> 就用它
空、缺失、认不出来                          -> chat
```

跟着一起变的：

- 下拉框只剩三项，「自动」删掉；新建模型默认 `Chat Completions`。
- 云端模型的卡片**永远**显示走哪条接口（以前只在手选过时才显示）—— 它现在是个人为选择，
  不是猜测，就该看得见。
- 两个**同一条接口内部**的重试保留，它们不换接口：网关拒绝「关思考」字段（400/404/422）时
  去掉那几个字段再试一次；输出被截断时加大输出上限再试一次。
- 失败就是失败：一次请求，原样报错，不再带「已改用 X 接口重试」那行尾巴。

**代价说明白**：老的模型记录里 `dialect` 是空或没这个字段，现在一律走 chat。以前靠名字猜
落到 Messages / Responses 的那些卡（比如 OpenCode 上的 `claude-*`、`gpt-*`），升级后要手动
在下拉框里改一次 —— 这是删掉猜测的必然结果，不是 bug。

**验证**

`tests\model-dialects.cjs` 按新语义重写（旧的轮询用例删了），全过，前四条专证「没有自动」：

```
ok   the stored pick decides the route, empty means chat  [8 values]
ok   a model nobody configured goes to chat completions  [chat/completions]
ok   the old name tables are gone  [chat/completions]
ok   no auto-detection helpers remain  [none]
ok   a 5xx is not answered by trying another route  [1 request(s)]
ok   nothing is remembered behind the user's back  [["translateSessionId"]]
ok   and the error carries no retry trail
ok   stop_reason max_tokens raises the budget instead of failing  [[1] 加长后成功]
ok   incomplete max_output_tokens raises the budget too  [[1] 响应加长成功]
ok   the classifier uses the picked route  [https://opencode.ai/zen/go/v1/messages]
ok   the classifier keeps response_format on the chat route  [https://opencode.ai/zen/go/v1/chat/completions]
```

`tests\cloud-dialog.cjs`：

```
ok   the interface picker offers the three protocols, with no auto entry
ok   a new model defaults to Chat Completions  [chat]
ok   the card says which interface was pinned  [example.test · 云端 · Messages]
ok   reopening the model shows the pinned interface  [messages]
```

真实 Edge 里三个模型各钉一条路（`tests\probe-opencode-wire.cjs` 改成按模型带 dialect，
密钥故意无效）：

```
live call glm-5.3-flash    [chat]: 401 AuthError
live call union-alpha      [messages]: 401 AuthError
live call gpt-5.6-luna     [responses]: 401 AuthError
  POST https://opencode.ai/zen/go/v1/chat/completions
  POST https://opencode.ai/zen/go/v1/messages
  POST https://opencode.ai/zen/go/v1/responses
routes reached : /chat/completions=true  /messages=true  /responses=true
```

**这次回归顺带暴露的一件环境问题（与本次改动无关）**：`e2e-translate` 与 `e2e-page` 失败，
报的是

```
error starting llama-server: llama-server binary not found
(checked: D:\ollama\llama-server.exe, D:\ollama\lib\ollama\llama-server.exe, ...)
```

查下来 `D:\ollama\lib\ollama` 整个目录不存在了（现在 `D:\ollama\lib` 里只剩一个 `Ollama.lnk`），
而今天 13:45 有两个 Inno Setup 的临时文件（`is-8QQQ75TXXW.tmp`、`is-I4YE6O16B5.tmp`），
Ollama app 在 15:21 又被重启过 —— 像是那次升级没留下可用的运行库。直接 curl
`127.0.0.1:11434` 也是同一个错（扩展没参与），所以本机**本地模型那一档现在完全用不了**
（网页、字幕、划词、总结都会 500），云端模型不受影响。修法是重装/修复 Ollama，
而且修完要能真加载模型才算数（`ollama list` 能列出模型不算数）。

---

## 30. 模型连不上时，自动换列表里的下一个

用户要求：「当有一个模型连接失败时，翻译失败时自动切换下一个模型。」

**规则**（`src\translate\settings.js` 的 `translateModelCandidates`，
`src\translate\engine.js` 的 `translateTexts` / `handleSummarize`）：

```
候选顺序         = 设置里在用的那一档 + 列表里剩下的，按用户排的顺序
地址或模型名为空  = 不进候选（它翻不了，试它只是拖时间）
同地址 + 同模型名 = 只算一次（两张卡指一个服务，问两遍也不会多翻一个字）
```

网页、划词、字幕、精简、总结全文都走这条顺序。书签分类器不在内 —— 它自己挑模型（第 13 节）。

跟着一起定的几条：

- **一批失败了，只有这批的条目往下传**：第一个模型已经翻好的那批留在它手里，不再重复问。
- **缓存还是按模型分键**（第 17 节）：所以下一轮只在「连不上的那一档」上花一次失败请求，
  好模型翻过的内容直接命中缓存。
- **全部模型都失败才把错误交给页面**，错误文案是**在用那一档**的 —— 要修的是它。
- 有的批次成功、有的失败时不报错：失败的那些条目保留原文，和第 11 节的老规矩一致。

**取舍说明白**：

- **不写回设置**。在用那张卡还是「在用」，换模型只发生在这一次请求里；用户把本地 Ollama
  修好之后，不需要再去设置里改回来。
- **不记「哪个模型好用过」**（第 29 节刚删掉同类记忆），也不给连不上的模型设冷却。
  本机 Ollama 没起、key 错这类失败是立刻返回的（毫秒级），代价可以忽略；贵的是真超时
  （60 秒），而那是少数。
- **界面上看得见**：设置页模型那一栏的说明补了一句「在用的一档连不上时，按下面的顺序自动换下一个」。
  不然这个行为从界面上完全看不出来。

**验证**

`tests\model-fallback.cjs`（新增，25 条断言）：

```
ok   the configured model is asked first  [http://127.0.0.1:41101/v1/chat/completions]
ok   the next model finishes the job  [["译文1（127.0.0.1:41102）..."]]
ok   one request per model, nothing else  [127.0.0.1:41101,127.0.0.1:41102]
ok   the second run only pays for the model that is down  [41101,41102,41101]
ok   and the sentence still comes back translated
ok   every model is tried in list order  [41101,41102,41103]
ok   the third model is the one that answers
ok   the page is not told about the two failures
ok   every model down is still a failure  [{"ok":false,"error":"无法连接模型：Failed to fetch"}]
ok   the error is the configured model's
ok   it was tried on both of them
ok   the batch the first model managed stays with it
ok   the batch it could not do goes to the next model
ok   no entry is left in the source language
ok   three requests: two batches, the second one twice
ok   the subtitle model is asked first for subtitles
ok   subtitles fall back without a page model request
ok   a summary walks the list the same way  [127.0.0.1:41101,127.0.0.1:41102]
ok   and comes back with the second model's text
ok   a summary fails only when every model does  [无法连接模型：Failed to fetch]
ok   the picked model leads, the rest follow in list order  [two,one,three]
ok   entries that cannot translate are skipped, copies are dropped  [one]
ok   a one-model list is the list
ok   no models at all is no candidates
ok   a single model has nowhere to fall back to
```

写这两条用例时揪出一个自己造的 bug：`delivered` 只看「有没有批次成功」，忘了把缓存命中也算上，
于是「第一个模型连不上、第二个模型的译文全在缓存里」这种一轮会被判成失败。
`tests\model-fallback.cjs` 第 1 组后半段就是拦它的。

`tests\e2e-fallback.cjs`（新增）：真 Edge 里挂两个假网关，第一档照着本机 Ollama 现在的毛病
回 500（`error starting llama-server: llama-server binary not found`），第二档正常回答，
整页照常翻出来：

```
ok   the broken model was asked first  [1 request(s)]
ok   the working model took the page over  [1 request(s)]
ok   the page came out translated  [3 block(s)]
ok   and in Chinese, not in the source language
ok   no error pill was left behind  [已翻译 3 段]
ok   no page errors
```

截图 `tests\out\fallback-translated.png`（页面全是中文，进度条「已翻译 3 段」，没有错误条）。

回归（全部照旧通过）：`tests\model-dialects.cjs`、`tests\model-switch.cjs`（卡片切换/删除）、
`tests\e2e-error-pill.cjs`（只有一个模型时错误条一字不变）、`tests\e2e-summary.cjs`、
`tests\options-shot.cjs`（模型栏新说明的排版，`tests\out\options-models.png`）。

**顺带**：本机 Ollama 现在能起服务了（`/v1/models` 返 200），但 `llama-server` 依然缺失，
`tests\e2e-translate.cjs` 还是那条 500 —— 环境问题，与本次改动无关（第 29 节末尾记录过）。
这次加的兜底正好能兜住这一类：只要列表里还有能用的云端模型，本地那一档挂了整页也能翻。

---

## 31. 本机 Ollama 修好了：本地那一档恢复可用

用户要求：「解决本地模型连不上的问题。」修的就是第 29 节末尾那件环境问题。

**病历**：Ollama 自带的更新器今天静默升级到 0.34.1，几次都没写完 ——
`%LOCALAPPDATA%\Ollama\upgrade.log` 只剩 13:45 那次，停在这里：

```
13:45:13.939   -- File entry --
13:45:13.940   Dest filename: D:\ollama\ollama app.exe
13:45:13.940   Installing the file.        <- 日志到此为止
```

目录里的 `is-*.tmp`（11:17 一对、13:45 一对，共 66 MB）就是那几次中断留下的临时文件。
后果：`D:\ollama\lib\ollama\` 被清空，只剩一个 `Ollama.lnk`；服务照常在 11434 上跑，
但每次要起模型都报
`llama-server binary not found (checked: D:\ollama\lib\ollama\llama-server.exe, ...)`，
于是网页、划词、字幕、总结全线 500。

**修法**（不重装、不动安装器状态，只补缺的那一层）：

1. 取官方 v0.34.1 的 `ollama-windows-amd64.zip`。GitHub 直连在这台机器上 1-2 MB 就断
   （~500 KB/s），换 `https://gh-proxy.com/` 前缀镜像后 22 MB/s、62 秒下完；
   下完按官方 sha256 校验：`428c94622a04764b318ddf13a061898edf69e32ffa896f638ed6015fd3f33288` ✓。
2. 只把包里的 `lib\ollama\**`（81 个文件、1.79 GB：`llama-server.exe`、`llama-quantize.exe`、
   各 `ggml*.dll`、`libllama*.dll`，以及 `cuda_v12` / `cuda_v13` / `vulkan` 三套运行库）
   解到 `D:\ollama\lib\ollama\`。
3. **没有覆盖 `ollama.exe`**：包里的那份 sha256 与机器上现存的完全一致
   （`1ff56c8b2c791bff69b6457d25aa63ed11073562cd47b14f42dd16dfa4353e05`），
   这同时证明装的确实是 0.34.1，缺的只有 `lib\ollama` 这一层 —— 所以不用降级、不用重装。
4. 重启 `ollama app.exe`。

**验证**

```
/api/version          -> {"version":"0.34.1"}
/v1/chat/completions  -> 机器学习模型需要使用大量的训练数据。      (冷加载 6.1 秒)
server.log            -> using device CUDA0 (NVIDIA GeForce RTX 4060 Ti) - 7075 MiB free
                         offloaded 35/35 layers to GPU
                         llama-server started in 5.02 seconds
```

是显卡跑起来的，不是退回 CPU —— `cuda_v13` 那套运行库也确实补齐了。

扩展侧端到端（真 Edge，走默认的本地那一档）：

```
tests\e2e-translate.cjs  -> 气泡 bd：机器学习模型需要在大规模数据上进行训练，才能很好地泛化。…
                            替换原文 / 撤销替换 都正常
tests\e2e-page.cjs       -> 3 段翻译完成，还原正常，无页面报错（tests\out\page-translated.png）
tests\e2e-subtitle.cjs   -> 字幕「机器学习模型需要数据。」「需要 API 密钥才能登录。」，清理正常
```

**留档与提醒**

- `D:\ollama-setup\ollama-windows-amd64-0.34.1.zip`（1.4 GB）留着：再出同样的问题，
  重新解 `lib\ollama` 一层就行，不必再下。
- `D:\ollama\is-*.tmp`（4 个、66 MB）是中断的更新留下的垃圾，没动它，无害。
- app 的更新检查每小时跑一次，日后仍可能再升一次；这次失败的原因是更新过程被打断，
  不是版本本身的毛病。判断标准还是第 29 节那句：真能加载模型才算修好，
  `ollama list` 能列出模型不算数。

---

## 32. 模型卡可以拖动排序

用户要求：「模型那里要能够拖动上下改变顺序。」

做完第 30 节之后，列表顺序就是兜底顺序 —— 排在前面的那一档连不上，才轮到后面那档。
顺序既然有含义，就得让人能改。

**做法**（`src\translate\options.js`、`options.css`，新增 `icons\grip.svg`）：

```
每张卡片左侧一个六点把手         只有一个模型时不出现（没有可换的对象）
把手是唯一的拖动起点             整张卡仍然是「点一下切换模型」的按钮
落下 = 落在某张卡的上半/下半       即插到它前面/后面；向下拖整体提前一位（先拔出来再插）
松手后写 storage + 重排 DOM      焦点留在刚移动的那张把手上
键盘同样管用                    把手上按 ↑ / ↓ = 这张卡上移 / 下移一位
```

**取舍**：

- 不动任何既有操作：点卡片切换、徽章、测试/编辑/删除、两下删除都原样保留。
- **只改顺序，不改「在用」**：`translateModelId` / `subtitleModelId` 存的是 id，挪卡片不碰它们。
- 模型栏那行说明补了半句「拖左侧把手改顺序」。
- 为什么不是直接拖整张卡：整张卡是个按钮，里面的「测试 / 编辑 / 删除」也是按钮，
  整卡可拖会让单击变得不确定；所以按下位置决定这次算不算拖动（dragstart 里检查）。

**验证** `tests\model-reorder.cjs`（新增，真 Edge，16 条）：

```
ok   the list starts in the stored order  [Model One,Model Two,Model Three]
ok   every card carries a handle  [3]
ok   the handle says what it does
ok   the handle draws the grip icon  [url("chrome-extension://.../translate/icons/grip.svg")]
ok   dragging the last card to the top reorders the list  [Model Three,Model One,Model Two]
ok   and the stored order follows
ok   the model in use did not change  [two]
ok   the in-use card is still the one marked
ok   arrow down on the handle moves that card one place down  [Model One,Model Three,Model Two]
ok   and that order is stored too
ok   the handle keeps the focus after the move
ok   dragging the card body does not reorder
ok   clicking a card still switches the model in use  [three]
ok   the order survived the switch
ok   the last card keeps no handle  [{"cards":1,"grips":0}]
ok   no page errors
```

截图 `tests\out\models-reorder.png`（三张卡 + 左侧把手 + 「在用」仍在 Model Two）；
`tests\out\options-models.png` 是只有一张卡时的样子（没有把手）。

回归：`tests\model-switch.cjs`（x 对齐、切换、两下删除照旧）、`tests\options-shot.cjs`、
`tests\model-fallback.cjs`（顺序如何变成引擎的候选顺序，第 30 节那组用例）。

---

## 33. 上游 503 的报错改成能读的一句话

用户发来一张截图：设置页点「测试」，union-alpha 弹出的是一整坨 JSON ——

```
模型返回 503：{"type":"error","error":{"type":"api_error","message":"Upstream request failed: Endpoint is unavailable."}}
```

**这是谁的问题**：opencode.ai 的。用故意无效的密钥打三条路
（`tests\probe-opencode-wire.cjs`，2026-09-17 当天跑的）：

```
live call glm-5.3-flash [chat]     : 模型返回 401：无效的 API 密钥。
live call union-alpha   [messages] : 模型返回 401：无效的 API 密钥。
live call gpt-5.6-luna  [responses]: 模型返回 401：无效的 API 密钥。
routes reached        : /chat/completions=true  /messages=true  /responses=true
still MissingSessionID : false
```

请求形状、路由、`x-opencode-session` 全部被接受（401 是走到鉴权那一步才会有的回答），
所以 503 是上游在这个模型上不可用，扩展这边没有可改的开关（第 27 节也记过 union-alpha 自己 500）。

**能改的是我们自己那部分**（`src\translate\engine.js`）：

- 新增 `gatewayReason()`：从网关的回应里挑出一句话 —— `error.message` → `error` 字符串 →
  `message` → `error.type` → `detail`；纯文本原样用；都没有就返回空。
- 于是 5xx/4xx 的报错从「状态码 + 一坨 JSON」变成
  `模型返回 503：Upstream request failed: Endpoint is unavailable.`，
  连原因都没给时是 `模型返回 503（没有给出原因）`。
- 原始回应照样留着，写进服务工作线程的控制台（`[translate] the gateway refused the request`），
  和第 11 节对「空结果」的处理同一套规矩：正文给控制台，人看的那句话给人看。

设置页（`src\translate\options.js`）：测试失败时，如果这张卡正好是翻译在用的那一档、而且列表里还有别的，
弹窗多一行「这一档正是翻译在用的那一个；翻译时连不上会自动按列表顺序换下一个。」（第 30 节的兜底）。

**验证**

`tests\model-dialects.cjs` 加了一组：

```
ok   a refused request quotes the gateway, braces and all removed  [模型返回 503：Upstream request failed: Endpoint is unavailable.]
ok   a body with no message says so instead of printing {}  [模型返回 503（没有给出原因）]
ok   a body that is just text is passed through as the reason  [模型返回 429：rate limited]
ok   and so is a body that is not JSON at all  [模型返回 429：too many requests]
```

`tests\model-fallback.cjs` 加了截图里的那条路：

```
ok   a 503 on the model in use hands the page to the next model  [127.0.0.1:41101,127.0.0.1:41102]
ok   with no other model the reason comes back as a sentence  [模型返回 503：Upstream request failed: Endpoint is unavailable.]
```

新增 `tests\model-test-error.cjs`（真 Edge，两个假网关：一个照抄那天的 503 回应，一个正常回答），
直接量「点测试之后弹什么」：

```
ok   the failure is reported as one reason  [模型返回 503：Upstream request failed: Endpoint is unavailable.]
ok   no JSON in the dialog
ok   it says this is the model translation runs on  [ 这一档正是翻译在用的那一个；…]
ok   a working model reports back without a dialog  [1 dialog(s) / 连接正常]
ok   the reason still comes through
ok   the fallback hint is gone once it is not the model in use
ok   no page errors

dialog 1 : "模型返回 503：Upstream request failed: Endpoint is unavailable.\n\n这一档正是翻译在用的那一个；翻译时连不上会自动按列表顺序换下一个。"
dialog 2 : "模型返回 503：Upstream request failed: Endpoint is unavailable."
```

截图 `tests\out\models-test-error.png`（弹窗是浏览器原生对话框，截不到，截的是设置页本身）。

回归：`tests\model-switch.cjs`、`tests\e2e-error-pill.cjs`（页面错误条一字未变）照旧通过。

**那句 503 本身不用处理**：它是上游当时的状态。换个能用的模型、或者把这张卡按第 32 节往后挪，
翻译就照常走 —— 这正是第 30 节那条兜底存在的理由。

---

## 34. 「我要用这个模型」：union-alpha 其实能用，是我们没给它第二次机会

用户又发来同一张截图（第 33 节那张），这次只有一句话：**「我要用这个模型」**。

先查厂商文档，而不是先猜。OpenCode 的 Go 文档里那张表把每个模型钉在自己的端点上：

```
Union Alpha Free  union-alpha  https://opencode.ai/zen/go/v1/messages  @ai-sdk/anthropic
```

和截图里的配置逐字对得上（服务 `OpenCode Go`、模型 `union-alpha`、接口 `Messages（Anthropic）`）。
顺手确认了那句「找到 31 个模型」：拿用户这把 key 拉 `/zen/go/v1/models` 是 **31 个**
（匿名拉是 38 个），`union-alpha` 就在这 31 个里 —— 下拉里有它，不是「模型不在这个档位」。

**拿用户自己的 key 真打了一遍**（key 从扩展自己的 storage 里读，只在内存里交给探针，
不落盘、不进日志、不打印）。同一把 key、同一条 `/messages` 路，连着发：

```
go  messages  union-alpha   200   21606ms  [{"type":"text","text":"[1] 机器学习模型需要数据。"}]
go  messages  union-alpha   200   20675ms  [{"type":"text","text":"[1] 机器学习模型需要数据。"}]
go  messages  union-alpha   503     441ms  Upstream request failed: Endpoint is unavailable.
go  messages  union-alpha   200    9919ms  [{"type":"text","text":"机器学习模型需要数据。"}]   （无 system、无 thinking 那次）
go  messages  union-alpha   200   23057ms  [{"type":"text","text":"[1] 机器学习模型需要数据。"}]
zen messages  union-alpha   403     291ms  OpenCode's free tier can only be used from within OpenCode
go  chat      union-alpha   503     346ms  Upstream request failed: Endpoint is unavailable.
go  responses union-alpha   503     696ms  Upstream request failed: Endpoint is unavailable.
go  messages  qwen3.7-max   200    1481ms  [{"type":"text","text":"[1] 机器学习模型需要数据。"}]
```

四件事因此定了：

1. **模型是好的，是上游间歇性拒。** 三次 200、一次 503，请求体完全一样，间隔几十秒。
   第 33 节那句「503 不用处理」只对了一半：它的确不是我们的请求形状问题，但它是**可以重试的**。
2. **接口选错会回一模一样的 503。** `union-alpha` 打到 chat / responses 两路，回的还是同一句
   `Endpoint is unavailable`。所以这句话不能当「接口选错」的证据 —— 反过来也一样，
   接口选对了照样可能吃 503。谁该走哪条路只有厂商文档那张表说了算（第 25 节那张表就是它）。
3. **免费档必须待在 Go 基址。** `/zen/v1/messages` 直接回 403
   「OpenCode's free tier can only be used from within OpenCode」：换个基址并不能绕开。
4. **它很慢。** 一行 10-58 秒，20 行 20.5 秒（同一时刻 `deepseek-v4.1-flash` 20 行是 3.1 秒）。

**落点**（`src\translate\engine.js`，两处）

```js
UPSTREAM_STATUS   = [500, 502, 503, 504]
UPSTREAM_ATTEMPTS = 3      // 第一次 + 两次重试
UPSTREAM_PAUSE_MS = 700    // 退避 700ms、1400ms
```

- `send()` 里多了一层循环：5xx 时**同一条路、同一个请求体、同一批头**再发一次，最多三次。
  这不是第 29 节删掉的那种「失败就换接口」—— 路线一次都不变，变的只有发送次数，
  正好是用户自己再点一次「测试连接」会做的事。三次都被拒时，报错后面才多一行
  `（上游短暂不可用，已重试 2 次）`，把「你看到的这句是重试过的」写在明面上；
  每次重试的原文照旧进服务工作线程控制台（`[translate] the gateway is not serving this model right now`）。
- **测试按钮的耐心从 30 秒改成 60 秒**（和 `REQUEST_TIMEOUT_MS` 一致）。实测有一次
  `连接正常（57966 毫秒）`：同一个模型，测试卡在 30 秒会报「请求超时」，而翻译那条路
  （本来就是 60 秒）其实过得去 —— 这个按钮存在的意义就是回答「翻译能不能用」，
  它的耐心不该比翻译短。

**验证**

`tests\model-fallback.cjs` 新增 3c，3b 改成新的说法：

```
ok   a 503 on the model in use hands the page to the next model  [41101,41101,41101,41102]
ok   the model that refuses is asked three times first
ok   with no other model the reason comes back as a sentence  [模型返回 503：…（上游短暂不可用，已重试 2 次）]
ok   a 503 that clears up costs a retry, not the batch  [["译文1（127.0.0.1:41101）…"]]
ok   the same route was asked again, not another model  [41101,41101,41101]
ok   one request for the first batch, three for the refused one, then the handover  [41101,41101,41101,41101,41102]
```

`tests\model-dialects.cjs` 第 7 组改成量「重试没有换路」：

```
ok   a 5xx is not answered by trying another route  [messages,messages,messages request(s) / …]
ok   and the error says those retries happened  [模型返回 500：Internal server error （上游短暂不可用，已重试 2 次）]
ok   a refused request quotes the gateway, braces and all removed  [模型返回 503：…（上游短暂不可用，已重试 2 次）]
```

`tests\model-test-error.cjs`（真 Edge）新增一条，并把等待放宽到 3.4 秒（三次尝试的时间）：

```
ok   the dialog says the retries happened  [（上游短暂不可用，已重试 2 次）  这一档正是翻译在用的那一个；…]
```

回归：`tests\opencode-session.cjs`、`tests\model-switch.cjs`、`tests\options-shot.cjs`、
`tests\cloud-dialog.cjs`、`tests\e2e-error-pill.cjs` 全部照旧通过。

**真机闭环**（真 key、真端点、走扩展自己的「测试连接」；新增 `tests\probe-union-alpha.cjs`，
诊断脚本不进回归，key 从 `OPENCODE_KEY` 读、从不打印）：

```
service  : opencode-go
model    : union-alpha
dialect  : messages
elapsed  : 58154 ms
result   : 连接正常（57966 毫秒） [1] 机器学习模型需要数据。
```

截图 `tests\out\probe-union-alpha.png`：还是那张「编辑模型」对话框，红字换成了
`连接正常（57966 毫秒）` 和那句译文。

**还留着的**：它比 `deepseek-v4.1-flash` 慢一个数量级，最慢一次 58 秒离 60 秒上限不远，
所以列表里要留一档快的做兜底（第 30 节的顺序就是兜底顺序）。这一条不是这次能修掉的，
是模型自己的脾性。60 秒上限没动：目前没观测到任何**成功**的调用超过它。
