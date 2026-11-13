# Changelog

本项目的所有重要版本演进、客户端漂移适配、汉化扩充与跨平台架构加固均记录于此文件。

---

## [v5.1.6] - 2026-11-13

> **适用版本**：Antigravity `2.31.2+`（`CL=1019359392`，向下完全兼容 `2.31.1` / `2.31.0` / `2.30.0`）  
> **核验基线**：实机 CDP 回归断言全绿 + `Claude Sonnet 5.5 (High)` 独立只读对抗审查闭环加固

### Added（新增特性与新模型/新模块全量汉化）
- **云端动态下发新模型家族与提示汉化（`core/runtime.js` / `core/i18n.json`）**：
  - 支持 `Orchestrator (<Model>)` 动态译为 `编排器 (<Model>)`（含列表项与底部选择器 `aria-label` 当前模型联动）；
  - 新增编排器分流气泡动态规则（`"<Model> that may offload routine steps to <Sub>. Same <Model>-level quality, fewer tokens used."` → `"可将常规步骤分流至 <Sub> 执行的 <Model> 编排模型。保持 <Model> 同等质量，消耗更少 Token。"`）；
  - 补齐 `Gemini 4 Hydrogen Extra` / `Extra High` / `XHigh` 超高思考档位（列表文案与无障碍标签均映射为 `超高`）、模型下线预告（`"<Model> will be removed from Antigravity on <Date>."`）与模型周期限额标题（`"<Model> Weekly/Daily/Monthly Limit"`）；
  - 智能区分操作按钮与模型/卡片徽标中的 `"New"`：独立操作按钮（含 `.rounded-full` 胶囊形 `+ New`）译为 `新建`，模型选择器及特性胶囊徽标译为 `新`，`Fast` / `Notice` 徽标分别译为 `极速` / `提示`。
- **1,500 条严格零大小写冲突词典（较 `v5.1.5` 净增 406 条）与 26 组新增动态正则**：
  - 全覆盖 `2.31.2` 新增的 **Swarm 蜂群协作面板**（`Swarm` / `Roster` / `Board` / `Coordinator` / `Spawn worker` 等）、**Automations 自动化任务**、**Coordinators 协调员**、**Environments 运行环境**、**Marketplace 插件市场**、**会话排序与归档筛选器**、**语音通话录音清理弹窗** 与 **消息排队发送快捷键提示**；
  - 保持 100% 大小写不敏感键唯一性（`len(keys) == len(lower_keys) == 1500`），原生兼容 Windows PowerShell 5.1 `ConvertFrom-Json`。
- **`plugin://swarm--` 蜂群协作 OOP 子帧全栈接管（`core/daemon.mjs` / `core/runtime.js` / `core/theme.css`）**：
  - `daemon.mjs` 支持挂载并热注入 `type === "iframe"` 且 Origin 匹配 `plugin://swarm--` 的官方内置协作面板（继续严格隔离 Artifact / HTML 预览子帧），并在 `user/config.json` 自定义 `allowedOrigins` 时与内置白名单取并集；
  - `theme.css` 补齐 `--font-family` 变量映射以接管 `2.31.2` `[data-agy-font]` 与 Swarm 面板字体栈；
  - 严格隔离保护 Swarm 面板中的 `.msg-body`、`#raw`、`[data-testid="swarm-raw"]` 与 `#swarm-title` 用户/Agent 正文零误伤，并跳过对子帧的无意义 SQLite 指标轮询。
- **`2.31.2` BaseWindow `curtainView` 原生幕布底色主动桥接（`core/runtime.js`）**：
  - 新增 `syncCurtainSurfaceColor()`（支持 `#RGB`、`#RRGGBB`、`rgb()/rgba()` 与 `color(srgb ...)` 解析），通过 `electronNative.wcvBrowser.setThemeColor` 将主题 `--background` 实时同步至 Electron 主进程 `curtainView` 与 `app_storage.json`，消除启动与切换会话时的原生背景色差闪白；禁用/卸载时自动还原原生底色与标题栏覆盖色。

### Fixed（功能漂移与对抗审阅缺陷修复）
- **根治 `2.31.2` 原生菜单缩放快捷键双倍跳变（`core/runtime.js`）**：
  - 针对 `2.31.2` `dist/menu.js` / `dist/hubZoom.js` 新增的原生 `View` 菜单加速器，引入轻量 `resize` 缩放水位跟踪（`__ag_settled_zoom` + `80ms` 前置外部缩放检测 + `60ms` 延迟差值复核），无论主进程菜单先于或后于渲染层 `keydown` 触发均确保单次按键只缩放一档，同时完整保留数字小键盘、欧式键盘与 Windows 无菜单栏兜底能力，并在调用 `preventDefault()` 前先行校验原生方法存在。
- **修复 Swarm 子帧深浅色反向锁死与描边选择器越界（`core/runtime.js` / `core/theme.css`）**：
  - Swarm 子帧直接读取 `preload.js` 注入 `document.documentElement.style` 的内联宿主 `--background` 计算亮度并双向同步 `data-theme` 与 `data-ag-theme-mode`，避免被样式表浅色 `!important` 反向锁死；
  - `theme.css` Part II 浅色模式通用描边规则补齐 `:not([data-ag-theme-mode="dark"])`，防止在无 `body.dark` 类名的深色子帧中误命中。
- **移除宿主 `data-agy-theme` 布尔空属性误判依赖（`core/runtime.js`）**：
  - `2.31.2` 在深浅色下均向 `body` 写入空值 `data-agy-theme=""`；移除旧版 `bodyAgyTheme === 'onyx'` 判定与冗余属性监听，消除潜在模式误判。
- **内置浏览器 `WebContentsView` 抽屉打孔与 `.agy-titlebar` 透明保护（`core/theme.css`）**：
  - 新增 `body[data-has-drawer-browser-hole="true"]`、`.surface-opaque`、`.browser-hole-ancestor` 透明保护及 `[data-browser-hole="true"]::after` 内嵌描边豁免；对 `.agy-sheet .agy-titlebar.bg-sidebar` 豁免实色背景覆盖。
- **无障碍属性翻译精准放行与动态正则性能门控（`core/runtime.js`）**：
  - 放开 Lexical `[contenteditable="true"]` 输入框与对话轮次导航点（`[data-testid="conversation-navigator-turn"]`）自身的 `aria-label` / `placeholder` / `title` 翻译，同时严密隔离其内部文本节点；
  - 收紧 `RE_MODEL_PERIOD_LIMIT` 至显式模型家族前缀并为跨首字母动态正则增加长度与特征子串前置短路，消除长文本回溯与常规英语短语误伤。
- **macOS `LaunchAgent` 启停竞态消除与 TCC 权限日志收敛（`install.mjs` / `core/daemon.mjs`）**：
  - `install.mjs` 在 `registerSystemService()` 中核验真实运行 `pid` 并轮询等待异步 `bootout` 完成；`runUninstall()` 先卸载 `LaunchAgent` 并确认退出后再清理残留进程，杜绝 `KeepAlive` 复活竞态；
  - `daemon.mjs` 在 macOS App Management TCC 拦截 `/Applications/Antigravity.app` 写入时降级打印单次说明，不再每轮重连重复刷屏。

---

## [v5.1.5] - 2026-11-12

- 融合 macOS 与 Windows PC 双端针对 Antigravity `2.31.1` 的实机漂移审计修复（Batch #003）。
- `core/runtime.js` 新增首字母大写不敏感兜底索引 `DICT_CI`（自动兼容 `Toggle Sidebar` / `Toggle sidebar` 等大小写漂移且零误伤小写代码标识符），补齐 `No more older messages, showing X of Y` 与 `Go to turn X of Y` 动态无障碍翻译。
- `core/i18n.json` 扩充至 **1,094 条严格零大小写冲突词条**（覆盖 Fork、Best of N、Scheduled Tasks、快捷键编辑器、沙箱与浏览器权限、命令面板标签并统一「置顶 / 取消置顶」用语）。
- `core/theme.css` 兼容 `2.31.1` 布尔空属性 `[data-active=""]`；`install.mjs` 屏蔽 Node 22 `node:sqlite` `ExperimentalWarning` 噪声。

---

## [v5.1.4] - 2026-11-11

- 修复 `2.31.0` `.surface-composer-card`（`flex-direction: column`）下折行实时指标胶囊 `flex-basis: 100%` 纵向撑高溢出输入框底边的缺陷。
- 回调常规窗口恒定同行阈值（`< 165px` 窄栏折行、`>= 180px` 滞回恢复），为 `ResizeObserver` 补齐左右按钮组宽度签名监听与会话路由切换强制重算。

---

## [v5.1.3] - 2026-11-11

- 合并 Windows `2.31.0` 前端适配、3 轮性能对抗审计与 macOS `v5.1.2` Opus 安全加固：适配 `[data-markdown-root]`、Lexical 等距 Slab 输入框、`input-cancel-button` 昼夜双态、Base UI `[role="listbox"]` 与 `electronNative.resetZoom`，词典扩充至 900 条。
- `core/daemon.mjs` SQLite 遥测升级为双游标独立坐标系 `O(1)` 增量读取；`core/runtime.js` 引入 `WeakMap` 不可变容器 `O(1)` 缓存短路与 `ctx.onCleanup(fn)` 生命周期钩子；`install.mjs` 升级为 JSONC 安全解析与 Windows 单一权威 `schtasks` 自启。

---

## [v5.1.2] - 2026-11-11

- 修复 `2.31.0` 内置浏览器 `data-has-browser-hole="true"` 透明打孔兼容、`html[style]` 昼夜切换竞争、`<input>` 占位符翻译、`applyThemeVars` 样式层叠顺序及 macOS `LaunchAgent` 孤立进程 `PATH` 注入。

---

## [v5.1.1] - 2026-11-10

- 修复 Windows `DirectWrite` 双轴可变字体 `STAT` 表家族解析（`'Anthropic Serif/Sans Web Display Light'`）、消除 `Georgia` 高低数字与微软雅黑截胡，接入 Windows `schtasks` 常驻与 `.gitattributes` `LF` 护栏。

---

## [v5.1.0] - 2026-11-10

- 实现昼夜双模式独立解耦：白天模式保留三套暖纸预设与古朴暗红蜡封，黑夜模式 `0ms` 还原官方 `onyx` Default Dark 碳黑配色（`#070708` / `#111114` / `#15151A` / `#2F71E3`），CSS 变量化精简 47% 体积。

---

## [v5.0.0 ~ v5.0.1] - 2026-11-04 ~ 2026-11-10

- 重构为「`core/` 只读黄金内核 + `user/` 2.5 秒可逆热重载改装层 + `install.mjs` 跨平台生命周期 CLI」模块化架构，完整适配 Antigravity `2.30.0`。
