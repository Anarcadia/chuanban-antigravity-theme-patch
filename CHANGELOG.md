# Changelog

本项目的所有重要版本演进、客户端漂移适配、汉化扩充与跨平台架构加固均记录于此文件。

---

## [v5.1.8] - 2026-11-14

> **适用版本**：Antigravity `2.31.2+`（`CL=1019359392`，向下完全兼容 `2.31.1` / `2.31.0` / `2.30.0`）  
> **核验基线**：社区 Issue `#1` / PR `#2` 实机源码核验与择优吸收 + macOS `2.31.2` CDP 全断言回归验证  
> **社区致谢**：感谢 `@webber181`（[#1](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/1)）与 `@pumblus`（[#2](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/2)）的详实排查与贡献

### Fixed（冷启动内嵌兜底包无感自愈、无障碍正则修复与字体回退兜底）
- **冷启动 `embedded assets` 旧版兜底包零流量安全自愈（`core/daemon.mjs` / `core/runtime.js`）**：
  - 针对 Antigravity 冷启动期 `language_server` 先返回内置旧版兜底包（导致偶发缺失 `Remote` 远程项目入口）、约 1~5 秒后才切换至 Mendel/Fastpush 新版 `/main.js` 的官方竞态缺陷（由 `@webber181` 在 `#1` 定位反馈），新增受 `modules.coldBootHealer`（默认 `true`）控制的零流量安全自愈器；
  - 采用 `PerformanceResourceTiming` 已加载字节数与 `HEAD /main.js`（`ETag` 十六进制体积头 / `Content-Length`，**0 字节响应体下载开销**）比对，并在重载前强制校验六重安全门禁（仅限冷启动前 `25s` 窗口、未发生任何键盘输入/粘贴/输入法组合、所有 Lexical/输入框草稿为空、无打开弹窗或运行中任务、`sessionStorage` 单会话单次锁），通过 `daemon.mjs` `__agRequestHardReload` 绑定执行 `Page.reload({ ignoreCache: true })`（`60s` 冷却保护），彻底杜绝额外拉取 ~12MB 脚本或误清用户草稿的风险。
- **带括号权限预设名称（`Auto (Preview)`）的无障碍标签匹配修复（`core/runtime.js`）**：
  - 修复 `RE_ARIA_PERM_FIXED` 在匹配 `"Agent permissions preset: Auto (Preview), Automatically decide if commands run."` 时因模式名自身含括号被提前截断导致漏翻的正则缺陷，并补齐运行态会话行 `[data-testid="running-row-stop"]` 的 `"Stop <会话名>"` 动态无障碍标签翻译。
- **未安装更纱黑体时的输入框中文字形防点阵退化与桌面版 Anthropic 字体别名兼容（`core/theme.css`）**：
  - 在 `Anthropic Serif` / `Anthropic Sans` `@font-face` 中追加 `Anthropic Serif Text`、`Anthropic Sans Text` 及对应 `Bold` 桌面版 `local()` 别名兜底（由 `@pumblus` 在 `#2` 建议，置于现有 Web 可变字体声明之后，对 Google Drive 官方字体包与 Windows `DirectWrite` 零干扰）；
  - 在输入框编辑区（Lexical / `contenteditable` / `textarea`）字体栈末尾 `monospace` 之前补充 `'PingFang SC'`、`'Hiragino Sans GB'`、`'Microsoft YaHei UI'`、`'Microsoft YaHei'`，确保未安装 `Sarasa-SuperTTC.ttc` 的 Windows 用户在输入框中文排版时优雅回退至微软雅黑，不再跌落至新宋体（`NSimSun`）。

### Added（1,575 条零冲突词典补全、`--sync-user` 安全同步开关与备用字体源指引）
- **补齐 21 条 `2.31.2` 原生漏翻 UI 词条至 1,575 条（`core/i18n.json`）**：
  - 基于 `#2` 核验并补齐跨平台对称词条：文件管理器定位（`Reveal in Finder` / `Show in File Explorer` / `Show in File Manager`）、会话已读状态与调试菜单（`Mark Read` / `Mark Unread` / `View Debug`）、项目与工作区排序筛选（`Sort Projects` / `Sort Workspaces` / `Filter` / `Display`）、思考与复制状态（`Thinking...` / `Thinking…` / `Thought Process` / `Copy code` / `Copy error messages` / `Copied` / `Stop`）及生命周期钩子事件名（`Pre/Post Tool Use`、`Pre/Post Invocation`），保持 100% 大小写与弯直引号不敏感唯一性。
- **`install.mjs install --sync-user` 可选非破坏性同步参数（`install.mjs`）**：
  - 默认继续严格保护已有 `user/` 改装层永不覆盖；当进阶用户或调试场景显式传入 `--sync-user` 时，自动先将原 `target/user/` 备份至 `backups/<timestamp>-user/`，再按 4 模板白名单同步最新 `user/` 模板。
- **文档补充 `Sarasa-SuperTTC.ttc` 官方开源备用源与冷启动排障说明（`README.md` / `SKILL.md`）**：
  - 针对 `791 MB` `Sarasa-SuperTTC.ttc` 偶发触发 Google Drive 24 小时单文件下载配额限制的问题，补充 macOS（`brew install --cask font-sarasa-gothic`）与 Windows/Linux（`be5invis/Sarasa-Gothic` GitHub Releases）备用获取方式及冷启动 `Cmd/Ctrl + Shift + R` 手动强刷提示。

---

## [v5.1.7] - 2026-11-14

> **适用版本**：Antigravity `2.31.2+`（`CL=1019359392`，向下完全兼容 `2.31.1` / `2.31.0` / `2.30.0`）  
> **核验基线**：Windows `2.31.2` 实机排障热修合流 + macOS `2.31.2` 实机 CDP 全断言回归 + `Claude Sonnet 5.5 (High)` 独立对抗审查闭环加固

### Fixed（Windows `2.31.2` 专有缺陷根治与双平台对称加固）
- **Windows `DirectWrite` 可变字体 `wght/opsz` 双轴全字重/斜体修复（`core/theme.css`）**：
  - 针对 `AnthropicSerif-*.ttf` 默认 `wght=300` 轴导致 Windows `DirectWrite` 将 `nameID 4/6` 暴露为 `'Anthropic Serif Web Text Light'` / `'AnthropicSerifWebWeb-TextLight'` 进而使 `600 900` 粗体回退至 `Sarasa Mono Slab SC` 的底层缺陷，补齐 `Anthropic Serif` 与 `Anthropic Sans` `@font-face` `local()` 全名声明；
  - 在 `html[data-ag-os="win32"]` 下显式注入 `:is(p, li, ...)` 正文（`'wght' 400, 'opsz' 16`）、`:is(i, em, .italic)` 斜体（`'wght' 400`）、`.font-medium` 中黑（`'wght' 500`）、`:is(strong, b, h1~h6, th, .font-semibold, .font-bold)` 粗体及粗斜体嵌套（`'wght' 600, 'opsz' 16`）与代码块内嵌 `normal` 还原规则，同时对 macOS `CoreText` 保持 0 干扰。
- **Windows 计划任务电池断电强杀与 72 小时时限修复（`install.mjs`）**：
  - `registerSystemService()` 在创建 `AntigravityThemeDaemon` 后通过 PowerShell `Set-ScheduledTask` 关闭 `DisallowStartIfOnBatteries`、`StopIfGoingOnBatteries`、清除 `ExecutionTimeLimit='PT0S'` 72 小时上限并设置 `MultipleInstances='Parallel'`，根治笔记本拔电休眠唤醒后守护进程失活；同步在 `install` 流程向安装目录拷入 `CHANGELOG.md`。
- **Windows/Linux `0ms` 长按连发缩放、异步 `resize` 水位追踪与欧式键盘保护（`core/runtime.js`）**：
  - 保留 macOS 主键盘 `60ms` `NSMenu` 原生菜单加速双倍跳变防抖窗口，将无原生 `NSMenu` 加速器的 Windows / Linux 及 macOS 数字小键盘与 `_` 改为 `0ms` 即时执行（彻底修复长按 `Ctrl + =/-` `e.repeat` `33ms` 周期被 `60ms` 定时器重置吞键的缺陷）；
  - 修复 `void ipcRenderer.invoke('window:zoom-*')` 异步缩放期间 `__ag_zoom_resize_fn` 水位吸收逻辑，补齐 `plugin://swarm--` 子帧小键盘 `Ctrl + Numpad0`、`_` 及中文输入法归一化转发，并收窄 `isCjkImeKey`（移除 `Dead` 重音死键）防止误伤德语 QWERTZ `Ctrl+ß` / `Ctrl+´`。
- **Windows 原生标题栏按钮 `setTitleBarOverlay` 昼夜反差同步与 `2.31.2` 主题优先级对齐（`core/runtime.js`）**：
  - 新增支持 `color-mix()` / `oklch()` 零 DOM 污染离屏解析的 `resolveCssColorToHex6()` 与仅在 `win32` 顶层窗口激活的 `syncWinTitleBarOverlay()`，实时同步标题栏最小化/最大化/关闭按钮反差，禁用/卸载（含 `<head>` 早注阶段）时精准还原宿主原生色值；
  - 修正跨版本升级场景下旧版 `localStorage['theme-mode']` 残留压过 `2.31.2` 实时 `colorScheme` 与 `hostThemeMode` 的优先级缺陷。
- **Windows WSL 会话库按需懒探测、休眠退避与双游标零重扫（`core/daemon.mjs`）**：
  - 新增基于 `%APPDATA%\Antigravity\wsl_state.json`（及 `ANTIGRAVITY_WSL_DISTRO` 环境变量）缓存、未命中短冷却负缓存与 `>400ms` 慢响应 `45s` 自动熔断退避的 WSL `\\wsl.localhost\<distro>` / `\\wsl$\<distro>` 按需懒解析（本地会话命中时 0 UNC 网络探测，避免休眠 WSL2 VM 被轮询唤醒或阻塞主线程），并合并 `getDbState` 消除单轮重复 `statSync`。
- **Windows 守护进程三态 PID 防误杀、字体占用容错与 `.NET ZipFile` 打包（`install.mjs` / `core/daemon.mjs`）**：
  - `checkDaemonPidState()` 引入 `'confirmed' | 'not_daemon' | 'uncertain'` 三态校验与 `12s` WMI 超时重试，既杜绝系统重启后 PID 复用误杀无关 `node.exe`，又防止登录高负载超时误删 `.pid` 制造孤儿双守护进程；
  - `install-fonts` 捕获客户端运行期 `EBUSY/EPERM/EACCES` 字体内存映射锁并归入 `skippedLocked`，通过 `25s` 超时的 `gdi32!AddFontResource` 与异步 `SendNotifyMessage(HWND_BROADCAST, WM_FONTCHANGE)` 即时广播刷新；
  - `buildDistZip()` 双端共享 `user/` 4 模板白名单，Windows 下采用 `.NET System.IO.Compression.ZipFile` 原生流式生成 POSIX `/` 路径规范压缩包，彻底告别 `Compress-Archive` 30 秒卡顿与反斜杠归档污染。

### Added（Swarm 隐藏预加载感知、弯引号归一与 1,554 条词典扩充）
- **`plugin://swarm--` OOPIF 顶层重注入与宿主 `config.json` 主题兜底（`core/daemon.mjs` / `core/runtime.js`）**：
  - 修复 `daemon.mjs` `Page.frameNavigated` 在 OOPIF 子帧上因携带 `frame.parentId` 漏触发重注入的问题；
  - `daemon.mjs` 新增 `~/.gemini/config/config.json` `userSettings.themeMode` `mtime` 缓存读取并注入 `bootPayload.hostThemeMode`（纳入热更新签名），解决 Swarm 面板隐藏预加载期 `hostLum === null` 时的初始深浅色对齐。
- **弯引号（`\u2018`/`\u2019`）双向归一化与 1,554 条零冲突词典（`core/i18n.json` / `core/runtime.js`）**：
  - `dictLookup()` 新增 `DICT_APOS` 双向弯单引号（`’`/`‘` ↔ `'`）归一化映射（同时兼容宿主弯引号 DOM 与用户 `i18n.override.json` 弯引号覆盖，且保持 `dictCount` 精确恒定）；
  - `core/i18n.json` 扩充 54 条新词条至 **1,554 条**（保持 100% 大小写不敏感与弯直引号不敏感唯一性），支持带多词后缀的 `Version X.Y.Z · <Channel>` 版本号文本与 4 组 Swarm 任务/讨论计数动态正则（`X of Y tasks done`、`Up next · N`、`N posts`、`N members`）。

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
