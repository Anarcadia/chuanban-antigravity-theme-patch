# 船板的 Antigravity 主题、字体与汉化补丁 (v5.5.3)

[![Version](https://img.shields.io/badge/version-5.5.3-7A1F1A.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![Antigravity](https://img.shields.io/badge/Antigravity-2.34.0%2B-D97757.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0%20(22.13%2B%20Full)-339933.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)

面向 Google Antigravity（支持最新 **`2.34.0+`**）的非侵入式运行时补丁：提供书卷暖纸与双深色预设、四层中西文排版、1,940 条界面汉化、SQLite 实时会话遥测胶囊与系统设置「Token 统计」多维分析面板。不修改客户端 `.asar` 与系统签名，零第三方 npm 依赖，由 AI Agent 一键部署并通过 `user/` 层实现 `2.5s` 热重载定制。

> 供 AI Agent 读取的完整部署与改装技术契约位于仓库根目录 **[`SKILL.md`](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/blob/main/SKILL.md)**。

---

## 🔗 资源入口

| 入口 | 地址 | 说明 |
| :--- | :--- | :--- |
| **1. Google Drive 资源包（含字体）** | [**Google Drive 共享文件夹**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) | 含成品包与全套必备字体：`AnthropicSerif-Regular/Bold.ttf`、`AnthropicMono-Regular.ttf`、**Windows 专用精简拆分包 [`Windows-Sarasa-Split-SC-TTF-v1.0.43.zip`](https://drive.google.com/file/d/1iVVvZXtwUcDiHy42tJ25X6N-JlOf3l7A/view?usp=sharing)**（170 MB，内含 14 个独立 SC `.ttf`，彻底规避 791 MB 单体 `SuperTTC` 在 DirectWrite/Chromium 引发的加载卡顿与 >2GB 虚存占用，见 #19）以及 macOS/Linux 用 `Sarasa-SuperTTC.ttc`（macOS 亦可直接运行 `brew install --cask font-sarasa-gothic`）。 |
| **2. GitHub 代码仓库** | [**Anarcadia/chuanban-antigravity-theme-patch**](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) | 包含预封装内核 `core/`、个人改装层 `user/`、生命周期 CLI `install.mjs` 与 [`SKILL.md`](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/blob/main/SKILL.md)（字体请从上方 Google Drive 获取）。 |
| **3. Notion 引导页** | [**chuanban-antigravity-theme-patch**](https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554) | 图文说明与安装引导镜像页。 |

---

## 🖼️ 实机效果

### 1. 标准浅色主界面：高对比书卷暖白工作台 + 衬线正文与活字润墨 + 暗红蜡封输入框
> 左侧 `#F7F5F0` 暖燕麦侧栏（`Google Sans Flex` × 更纱黑体 UI 字重桥接）+ `#FCFCFB` 微暖亮白对话区与 Markdown 预览（`Anthropic Serif` × `Sarasa Mono Slab SC` 衬线）+ 底部 `1.5px` 暗红蜡封输入框与同行实时指标胶囊。

![标准浅色书卷暖白主界面视图](assets/preview-light-workbench.png)

### 2. 黑夜界面效果：Claude 暖纸深夜模式（`claude-warm`）+ 代码审阅 Diff 视图
> `#242320` 暖炭底色 + `#1B1A18` 深炭侧栏 + `#F3F0E4` 象牙白正文 + `#D97757` 陶土暖橙点缀；在「系统设置 → 外观界面」点击 **📖 / 🌙** 按钮即可在「暖纸深夜」与「官方冷碳黑（`onyx`）」之间 `0ms` 切换并自动持久化。

![黑夜界面 Claude 暖纸深夜与代码审阅视图](assets/preview-dark-workbench.png)

### 3. 上下文对话信息胶囊与悬停遥测详情卡
> 嵌入输入框底栏的实时指标胶囊（支持多路平铺分屏、`/btw` 支线提问与子 Agent 侧栏独立计量）；悬停展开本轮流式/端到端 `tok/s`、`TTFT`、思考链与正文输出拆分，以及当前会话累计压缩水位线与缓存命中率。

![上下文对话实时信息胶囊与悬停遥测详情卡](assets/preview-metrics-capsule.png)

---

## ✨ 核心特性（v5.5.3）

- **昼夜双模式与四套配色预设**：浅色内置高对比暖白（默认）、ClaudeDesktop 净白、复古羊皮纸三套暖纸预设及 macOS 浅色全域活字润墨；深色在客户端外观面板原生嵌入 **📖 书卷按钮**（`[ 🖥️ | ☀️ | 📖 | 🌙 ]`），一键切换官方碳黑（`onyx`）或 Claude 暖纸深夜（`claude-warm`），自动同步 Windows 原生标题栏、启动幕布与 `Swarm` 协作子帧。
- **四层中西文排版与字重桥接**：UI 西文直连官方 `Google Sans Flex` 可变字体引擎（`wght 350–650`, `wdth 92`，内置 `#ag-google-sans-flex-fonts` 防脱靶保底与去重），中文经 `AgSarasaUI` 精确映射更纱黑体字重（消除 `350` 字重落入 `Light` 发虚与 Windows `FontLink` 微软雅黑替换）；对话正文与 Markdown 保持 `Anthropic Serif` + `Sarasa Mono Slab SC` 衬线（含 Windows `DirectWrite` 子节点 `wght 400/500/600` 还原）；代码、终端与 `.inline-pill[data-uri]` 行内文件芯片采用 `Anthropic Mono` 等宽；主输入框采用打字机板状粗衬线配三态蜡封边框。
- **1,940 条界面汉化与代码/文件芯片严格隔离**：覆盖主界面、划词浮动交互按钮（`Quote` / `Comment` / `支线提问` 上下文守卫精准翻译）、15+ 设置子页、编排器与对战模式、对话与编辑器新设置项、快捷键方案、内置浏览器管理、`Swarm` 蜂群面板与无括号模型努力度档位动态文案；全词表通过大小写与弯直引号零碰撞校验并支持 `…` ↔ `...` 双向容错查找，基于 `WeakMap` 追踪英文原词支持热还原，严格隔离代码块、Monaco 编辑器、终端、行内文件胶囊及英文历史对话标题。
- **SQLite `O(1)` 实时指标胶囊 + 系统设置「本地扩展 → Token 统计」分析面板**：基于 Node.js `>= 22.13` 原生 `node:sqlite`（兼容本地会话库与 Windows WSL2 默认发行版双轨只读读取），在分屏、`/btw` 与子 Agent 标签页各自独立展示 `tok/s`、`TTFT`、真实模型上下文上限（`256k`–`1M+`）、子 Agent 全树汇总（`+N sub`）与缓存命中率；同时在设置弹窗原生嵌入「Token 统计」Tab（26 周贡献热力图、14 日堆叠趋势、模型/配额池与工具/子 Agent/对话/规划/记忆场景归因、父子会话展开与低缓存预警，异步分片零阻塞且对 Swarm 子帧自动裁剪载荷）。
- **零侵入单图标启动接力、Windows 保活自愈与 `2.5s` 热重载架构**：针对 Antigravity `2.33.0+` 默认移除调试端口的变更，保持双端**唯一官方原版图标**（Windows/Linux 原地幂等修补快捷方式参数并内置客户端更新后 `.lnk` 自动自愈与 5 分钟计划任务静默保活，全平台守护进程在冷启动 `<=12s` / 更新重启 `<=25s` 自动无感补挂 `--remote-debugging-port=0`，对存量活跃会话 100% 豁免保护），并通过宿主独占指纹门禁豁免内置浏览器本地预览页；`core/` 只读内核与 `user/` 个人配置层物理分离，升级不覆盖个人修改，修改 `user/*` 保存后 `2.5s` 自动热生效。

---

## 🚀 安装、升级与日常定制

### 一、新用户首次安装
1. **环境准备**：安装 **Node.js `>= 22.0.0`**（推荐 **`>= 22.13.0`** 以启用实时指标胶囊），并从 [**Google Drive 资源包**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 下载上述 4 个字体文件（可先放在下载目录，直接让下方 Agent 一键完成注册安装）。
2. **复制以下引导词发给你的 AI Agent（Antigravity / Claude Code / Codex / Cursor 等）**：

> **💬 复制发给 Agent（新用户一键安装）**：  
> 请帮我克隆 `https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git`（或读取我已下载解压的补丁目录），先完整阅读仓库内的 `SKILL.md`，再按以下顺序部署并处理边缘情况：  
> 1. 若本机有 `nvm` / `fnm` / `volta`，优先切换至 `Node >= 22.13.0` 执行命令；运行 `node install.mjs doctor` 检查 `fonts.allRequiredInstalled`。  
> 2. 若缺少字体（需 `Anthropic Serif`、`Anthropic Mono` 与更纱黑体）：先在我刚下载的目录中查找并用 `node install.mjs install-fonts --from <字体目录>` 一键安装（Windows 下必须用此命令写入注册表，勿仅手动复制文件）；若缺少更纱黑体，macOS 可直接执行 `brew install --cask font-sarasa-gothic`，Linux 可用 `Sarasa-SuperTTC.ttc`，**Windows 请优先从 Google Drive 共享目录下载 `Windows-Sarasa-Split-SC-TTF-v1.0.43.zip`（或从 `be5invis/Sarasa-Gothic` Releases 下载拆分版 `SarasaUiSC-TTF` + `SarasaMonoSlabSC-TTF`）解压后配合 `--retire-super-ttc` 安装**（避免 791 MB 单体 `SuperTTC` 引发首次字重加载卡顿与 >2GB 虚存占用）。
> 3. 运行 `node install.mjs install` 完成安装（注：macOS 默认单图标模式 `launcherInstalled: false` 属正常设计）。
> 4. 检查输出中的 `cdpStatus`：若为 `"missing_opt_in_flag"`（Antigravity `2.33.0+` 尚未挂调试端口），**如果你当前正在 Antigravity 内部对话中运行，请勿执行 `--force` 强行重启自断会话**，只需把空闲时执行的命令 `node ~/.gemini/antigravity/theme-patch/install.mjs relaunch`（Windows 为 `node "$HOME\.gemini\antigravity\theme-patch\install.mjs" relaunch`，或提示我直接手动退出重开一次 Antigravity）发给我；如果你在外部独立终端运行且客户端空闲，请直接执行 `node install.mjs relaunch`。
> 5. 在端口就绪后运行 `node install.mjs verify`，确认 `"ok": true` 且 `"hasStyle": true` 即完成验收。

### 二、老用户升级至 v5.5.3
`node install.mjs install` 会自动备份旧版 `core/` 内核、更新系统常驻服务，并完整保留 `~/.gemini/antigravity/theme-patch/user/` 中的个人配置：

> **💬 复制发给 Agent（老用户无缝升级）**：  
> 请帮我拉取最新的 `https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git`（或读取最新解压目录），阅读其中的 `SKILL.md` 后直接运行 `node install.mjs install` 升级至 `v5.5.3`（若我此前使用的是更早期的单文件版 `antigravity-font-daemon.mjs` 且有自定义字号/配色，请先帮我把自定义项迁移到 `~/.gemini/antigravity/theme-patch/user/`）。若安装后 `cdpStatus` 为 `"missing_opt_in_flag"` 且你正在 Antigravity 内部会话中运行，请勿直接中断当前对话，告诉我空闲时运行 `node ~/.gemini/antigravity/theme-patch/install.mjs relaunch`（或手动重开一次客户端）即可；端口已就绪则直接运行 `node install.mjs verify` 验收。

### 三、后续个性化调整与排障话术
- **🎨 切换昼夜预设、调整字号或微调样式**：
  > 请按 `~/.gemini/antigravity/theme-patch/SKILL.md` 规范，仅修改 `user/` 目录下的配置文件：把白天预设改为 `"claude-desktop-purewhite"`（或 `"vintage-deep"`） / 把黑夜预设 `"darkPreset"` 改为 `"claude-warm"` / 把对话正文字号 `"--ag-chat-font-size"` 调为 `"16.5px"`。
- **🇨🇳 自定义修改或补充汉化词条**：
  > 请在 `~/.gemini/antigravity/theme-patch/user/i18n.override.json` 中新增或覆盖词条 `"英文原词": "自定义中文"`，确认 2.5 秒内页面实时热更新生效。
- **🔍 故障定界与一键回滚**：
  > 请按 `~/.gemini/antigravity/theme-patch/SKILL.md` 依次运行 `node install.mjs doctor` 和 `node install.mjs verify --safe-mode` 排查是否为 `user/` 自定义层冲突；如需退回上一版本请运行 `node install.mjs rollback`。
  - *注：若客户端冷启动后偶发未显示 `Remote`（远程）入口，属官方 `language_server` 冷启动兜底包竞态（补丁已内置空输入态自动自愈；若启动瞬间正在输入触发了草稿保护，按 `Cmd/Ctrl + Shift + R` 刷新一次即可恢复）。*

---

## 🕒 版本演进（完整记录见 [`CHANGELOG.md`](CHANGELOG.md)）

- **v5.5.3（2026-11-21 · 现行版）**
  - **新增系统设置「本地扩展 → Token 统计」多维分析面板（合入并深度加固 [@ghang](https://github.com/ghang) [#25](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/25)）**：基于本机 `conversations/*.db` 与 `conversation_summaries.db` 增量归因，提供加权等效/总 Tokens/净新消耗/调用次数 4 口径 KPI、26 周贡献热力图与 14 日趋势、具体模型/配额池与 6 类工作场景分布、父会话展开子 Agent 轨迹及低缓存命中预警；采用 `setImmediate` 异步分片扫描、紧凑内存缓存与 `Swarm` 子帧 / 关闭态 `~100 KB` 载荷动态剥离，确保日常对话零额外观察器噪声、零主线程卡顿。
  - **适配 Antigravity `2.34.0` 双端界面漂移与 `1,940` 条词典（含 [#27](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/27)）**：修复 `button.inline-pill[data-uri]` 行内文件胶囊误落 `Anthropic Serif` 的排版漂移并纳入 i18n 不可变隔离，将 `Quote` / `Comment` 收归交互控件上下文守卫防误伤同名文件，支持 `…` ↔ `...` 双向词典查找与 `2.34.0` 无括号努力度后缀（`Gemini 4 Neon Extra High` → `Gemini 4 Neon · 超高`），适配 `data-has-three-layer-browser-hole` 与 `O(1)` `[data-has-browser-hole="true"]` 内置浏览器打孔，消除 `plugin://swarm--` 子帧 86 条重复 Google Fonts `@font-face` 挂载，并将词典扩充至 `1,940` 条。
  - **守护进程空闲零子进程、Windows 保活自愈与渲染器性能根治**：基于 POSIX `SingletonLock` 与 Windows `lockfile` 无锁预检实现客户端关闭态/豁免态 **`0` 子进程派生**；在 `BrowserWatcher` 在线时削减 83% `/json/list` 轮询；为 Windows 计划任务补齐 `PT5M` 5 分钟静默保活、修复残留死端口对 `M2` 冷启动接力的遮蔽与进程启动前旧 `.db-wal` 误拦截，并新增客户端热更新后 `.lnk` 快捷方式自动补参自愈；清零 `theme.css` 全量末尾 `*` 通配符，消除 `__ag_i18n_observer` 自写入二次刷新、单容器大子树全页重扫与流式指标胶囊同步强制重排。
- **v5.5.2（2026-11-20）**
  - **Windows 渲染卡顿双层根治（[#19](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/19) / [#23](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/23) / [#24](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/24)）**：`win32` 分支绕过 `AgSarasaUI` `@font-face local()` 与冗余同源中文字体别名，直连 `'Sarasa UI SC'`（默认字重 `400` 共享跨字号缓存）消除二级菜单/弹窗跨字号 `N × 1.2s` 反复冻结；收敛 `runtime.js` 外链 Google Fonts 重复挂载、`syncChuanbanPreset` 弹窗重排短路、`__ag_appearance_toggle_observer` 消息子树豁免与 `win32` 通配选择器；同时在 `doctor` / `install-fonts --retire-super-ttc` 通过 `.NET` UTF-16 原生注册表接口一键退订中英文形态的 `791MB` `Sarasa-SuperTTC.ttc` 并切换 `Windows-Sarasa-Split-SC-TTF-v1.0.43.zip`（Windows 11 真机 31 组布局从 `23.83s` 压至 `142.6ms` 提速 `167×`，渲染器 `WorkingSet` 从 `4.52 GB` 降至 `336 MB` 释放 `23.2 GB` 虚存）。
  - **Browser 级 CDP 事件驱动目标发现与冷启动防永久拉黑（[#21](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/21) / [#22](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/22)）**：订阅 `Target.setDiscoverTargets` 将托盘重开/新窗口/Swarm 发现延迟从 `0–2.5s` 压至毫秒级（Windows 11 真机托盘唤醒主窗 `150.0ms`、Swarm 子帧 `69.5ms` 即时完成注入），支持托盘 `0` 窗口态保活、`User-Agent` 联合识别与 `fallbackPort` 外部浏览器隔离，并修复冷启动切端口过渡文档误触发 `non_host` 永久拉黑。
  - **macOS Homebrew / Keg-only / fnm 稳定软链解析（[#20](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/20)）**：`LaunchAgent` 与 `systemd` 自动将版本化 `Cellar` 路径还原为 `/opt/homebrew/bin/node`、`opt/node@22/bin/node` 或 `fnm` 默认持久软链，免疫 `brew upgrade node && brew cleanup` 升级失效。
- **v5.5.1（2026-11-19）**
  - 修复 `user/config.json` 自定义非默认 `contextLimit` / `contextLimitOverride`（如 `512000`）时守护进程在启动加载阶段触发 `lastBestEffortPayloadCache` 暂时性死区（TDZ）崩溃退出的问题（合入 [@2217173240](https://github.com/2217173240) [#18](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/18)）。
- **v5.5.0（2026-11-19）**
  - 适配 **Antigravity `2.33.0`**（macOS × Windows 11 双端真机验收）：落地单图标纯净模式 + `M1 + M2` 零侵入 CDP 启动接力（Windows `.lnk` / Linux `.desktop` 原地幂等打标、macOS 默认单图标零冗余、`relaunch` 子命令、冷启动 `<=12s` / 更新重启 `<=25s` 自动补参接力、Windows `0.02ms` 内存级空闲短路、`sidecar_sdk` 伴生进程过滤及活跃会话 100% 保护）与 `doctor` `missing_opt_in_flag` 诊断；UI 西文切换至官方 `Google Sans Flex` 可变字体引擎（含 `#ag-google-sans-flex-fonts` 防脱靶保底）× `AgSarasaUI` 更纱黑体字重桥接，保留正文 `Anthropic Serif`（含 Windows `DirectWrite` 子节点 `wght 400/500/600` 还原）；新增 macOS 浅色全域活字润墨与 UI 字重微平衡（Windows 零改动）；补齐无 `data-newux-theme` 选择器并将词典扩充至 `1,860` 条。
- **v5.4.3（2026-11-18）**
  - 适配 Antigravity `2.32.2` 与 `Gemini 4 Carbon` 模型矩阵（词典 `1,790` 条）；新增多路平铺分屏、`/btw` 支线提问与子 Agent 侧栏标签页独立实时指标胶囊及窄分屏动态折行（合入 [@CaramelizedCUDA](https://github.com/CaramelizedCUDA) [#17](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/17) 修复 [#16](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/16)）；加固 Swarm 子帧 `darkPreset` `<1ms` 瞬时同步、修复 `coldBootHealer` 二次复检自锁、隔离英文历史对话标题，并升级 macOS 中文标题外挂悬浮告警卡「一键复制修复命令」与守护日志自截断保护。
- **v5.4.2（2026-11-17）**：打通主窗口至 `plugin://swarm--` 子帧的实时深浅色中继与零闪白预置，消除双向切换下的子帧主题失步（[#15](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/15)）。
- **v5.4.1（2026-11-17）**：在「系统设置 → 外观界面 → 主题模式」胶囊中嵌入原生 **📖 书卷按钮**，支持 `0ms` 一键切换「Claude 暖纸深夜」并自动落盘记忆。
- **v5.4.0（2026-11-16）**：新增 `claude-warm` 暖纸深夜预设（[#13](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/13)）、内置浏览器本地预览页豁免门禁（[#12](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/12)）、Windows WSL2 SQLite 双轨只读读取（[#10](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/10)）与中完整性计划任务自启锁（[#8](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/8)）。
- **v5.3.0（2026-11-15）**：支持子 Agent 全树消耗汇总 `+N sub`（[#7](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/7)）、动态识别模型真实上下文窗口上限（[#6](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/6)），并完成 `2.32.1` 双平台适配（`1,740` 条词典）。
- **v5.2.0（2026-11-14）**：适配 Antigravity `2.32.0`，完成全词库系统性去机翻重构与 6 项核心术语统一（`1,630` 条）。
- **v5.1.8（2026-11-14）**：新增冷启动内嵌兜底包零流量安全自愈机制，解决偶发丢失 `Remote` 远程入口问题。
- **v5.1.6（2026-11-13）**：适配 Antigravity `2.31.2`，打通 `Swarm` 子帧注入、原生幕布底色同步与防双倍缩放。
- **v5.1.3（2026-11-11）**：适配 Antigravity `2.31.0`，将 SQLite 指标读取与 DOM 汉化升级为 `O(1)` 增量引擎。
- **v5.1.0（2026-11-10）**：确立浅色暖纸预设与深色官方碳黑物理隔离的昼夜双模式架构。
- **v5.0.0（2026-11-04）**：确立「`core/` 只读内核 + `user/` `2.5s` 热重载改装层 + `install.mjs` 一键 CLI」模块化架构。
