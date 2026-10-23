# Darkling（合并进 ChatGPT 扩展）

上游：`D:\MyProjects\darkling-dark-mode` 4.0.7（MV3 暗色引擎）。
这里只保留运行时需要的文件，并把入口挂到宿主扩展的 service worker 上。

## 目录

| 路径 | 说明 |
| --- | --- |
| `js/background.js` | 暗色引擎主体（webpack 打包产物，已打补丁，见下） |
| `js/content.js`、`js/fb.js` | 页面侧注入脚本 / filter 兜底 |
| `js/proxy.js` | MAIN world 的样式代理，已在 `web_accessible_resources` 注册 |
| `js/popup.js`、`popup/` | 面板 UI |
| `config/styles.txt` | 站点样式覆盖表（约 35k 行） |
| `config/blacklist.txt` | 默认黑名单域名 |
| `glue.js` | 合并层：右键菜单与快捷键入口 |
| `tests/dark-mode-regression.test.js` | 上游静态回归测试 |

## 入口

宿主扩展的工具栏图标仍然打开 ChatGPT 侧边栏，所以暗色模式走这些入口：

- 扩展设置页 → 左侧「外观 / 暗色模式」：开关、黑名单增删
- 右键菜单：`切换暗黑模式` / `切换明亮模式`
- 右键菜单：`添加暗黑模式黑名单` / `移除暗黑模式黑名单`
- 右键菜单：`暗色模式设置…`（小窗打开面板，带上当前页 URL）
- 快捷键 `Alt+Shift+D`

开关状态存在 `chrome.storage.local` 的 `enabled` / `blacklist`，**默认关闭**。
设置页不直接写 storage：开关与黑名单都走引擎的消息接口，读回 `isEnabled` 作为准。

## 右键菜单

菜单项统一由 `glue.js` 创建（原先由 translate/engine.js、darkling background、glue 三处分别创建，
顺序随时序漂移，而且 engine 的 `contextMenus.removeAll()` 会把其它模块的项一起删掉）。顺序固定为：

| # | 菜单项 | 上下文 | 标题随状态 |
| --- | --- | --- | --- |
| 1 | 翻译选中文字 | selection | — |
| 2 | 翻译网页 / 还原翻译 | page | 页面是否已翻译 |
| 3 | 总结全文 | page | — |
| 4 | 切换暗黑模式 / 切换明亮模式 | page | 引擎开关 |
| 5 | 添加暗黑模式黑名单 / 移除暗黑模式黑名单 | page | 当前页是否在黑名单 |
| 6 | —（分隔线） | page | — |
| 7 | 暗色模式设置… | page | — |
| 8 | 翻译设置 | page / selection | — |

翻译状态由 `translate/content.js` 上报（`translate:page-state`），`translate/engine.js` 存在
`translatedTabs` 里并触发标题刷新；标签页导航或关闭时清除。菜单 id 见 `engine.js` 的
`TRANSLATE_MENU` 与 `glue.js` 的 `CODEX_MENU`，两处必须一致。

## 合并时对上游代码做的改动

1. 资源路径统一加 `darkling/` 前缀（`config/*.txt`、`js/content.js`、`js/fb.js`、`js/proxy.js`）。
2. `unregisterContentScripts` 全部改为按自己的 id（`stylesheet-proxy`、`content-scripts`）注销：
   宿主扩展也用动态内容脚本，无参调用会把 `codex-webmcp` 系列一起清掉。
   只注销实际存在的 id，否则 Chrome 会以 `Nonexistent script ID` 拒绝。
3. 清理残留 DNR session 规则时只删 `900000..999999`：宿主扩展的请求头规则在 `1000000..1004999`。
4. 默认 `enabled: false`，并且只在开启时才注册内容脚本：
   关闭状态下内容脚本收到 `null` 会走自己的兜底主题，等于关不掉。
5. 消息监听器只接管自己的 `getStyle` 与 `bg-*` / `cs-*` 消息，其他消息同步返回 `false`，
   避免占住宿主扩展的消息通道。
6. 移除 Google Analytics 上报（上游在 worker 启动时 `analytics(G-..., secret)`）。
7. 黑名单操作的三个 popup 动作支持显式 `url`，面板作为独立窗口打开时才能作用于目标页面；
   `?standalone=1` 打开时隐藏黑名单按钮（没有可作用的标签页）。
8. 暴露 `self.__darklingToggle()` / `self.__darklingIsEnabled()` 给 `glue.js`：
   service worker 收不到自己发出的 runtime 消息，只能直接调引擎。
9. 右键菜单集中到 `glue.js` 创建：`translate/engine.js` 不再 `removeAll()` + 自建（它会清掉
   暗色与书签模块的菜单），暗色 background 也不再建 `addBlacklist` / `deleteBlacklist`。
10. 「翻译网页 / 还原翻译」由页面状态驱动：`translate/content.js` 在整页翻译完成、还原后上报
    `translate:page-state`，`engine.js` 存进 `translatedTabs` 并镜像到 `storage.session`
    （worker 休眠后仍能恢复），标签页导航或关闭时清除。

## 验证

```bash
node --test darkling/tests/dark-mode-regression.test.js
```

真实 Chromium 冒烟（加载扩展 → 面板点“启用” → 打开 http 页面确认背景变深）已本地跑过：
`body` 由 `rgb(255,255,255)` 变为 `rgb(14,16,17)`，关闭后恢复。
