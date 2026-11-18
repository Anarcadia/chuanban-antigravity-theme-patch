# 船板的 Antigravity 书卷暖纸 × 昼夜双预设主题、字体优化与深度汉化全栈补丁 (v5.5.0 · 适配 Antigravity 2.33.0+)

[![Version](https://img.shields.io/badge/version-5.5.0-7A1F1A.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![Antigravity](https://img.shields.io/badge/Antigravity-2.33.0%2B-D97757.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0%20(22.13%2B%20Full)-339933.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)

> **本页面为补丁主介绍、极简部署指南与版本演进说明。**  
> 供 AI Agent 执行一键安装与二次改装读取的完整技术契约独立存放于仓库根目录的 **[`SKILL.md`](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/blob/main/SKILL.md)**。

---

## 🔗 核心资源链接与三端入口

| 端点名称 | 链接地址 | 定位与包含内容 |
| :--- | :--- | :--- |
| **1. Google Drive 全套资源包（含字体）** | [**Google Drive 官方共享文件夹**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) | **全项目成品包 + 全套必备字体库**。内置 **Anthropic 官方衬线与等宽字体族**（`Anthropic Serif` / `Anthropic Mono`；`v5.5.0` UI 西文已直连官方 `Google Sans Flex` 可变字体引擎）与 **更纱黑体超集**（`Sarasa-SuperTTC.ttc`；若大文件偶发触发 Google Drive 24h 下载限流，macOS 可用 `brew install --cask font-sarasa-gothic`，Windows/Linux 可从 [`be5invis/Sarasa-Gothic` Releases](https://github.com/be5invis/Sarasa-Gothic/releases) 获取同款 `Sarasa-SuperTTC.ttc`）。 |
| **2. GitHub 项目代码库** | [**Anarcadia/chuanban-antigravity-theme-patch**](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) | **成品补丁代码完全体**。包含预封装只读内核 `core/`、个人改装层 `user/`、一键安装器 `install.mjs` 及 Agent 专用的 [`SKILL.md`](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/blob/main/SKILL.md)（字体请从上方 Google Drive 下载）。 |
| **3. Notion 引导安装页** | [**chuanban-antigravity-theme-patch**](https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554) | 备用说明与部署引导主页。 |

---

## 🖼️ 实机样式演示

### 1. 三栏工作台：高对比暖纸主题 + 古朴暗红蜡封输入框 + 同行实时指标胶囊 + 书卷衬线工件
![三栏对话与工件阅读视图](assets/preview-workspace-chat-and-artifact.png)

### 2. 新建对话首页：全界面深度汉化 + 聚焦浮现淡雅暗红蜡封外框
![新建对话首页视图](assets/preview-home-new-conversation.png)

---

## ✨ 补丁简介：核心定位与五大亮点（v5.5.0）

### 1. 设计目的
Google Antigravity 原生浅色界面偏冷刺眼、全局仅使用单一无衬线字体，长时间高强度阅读与编码容易视觉疲劳。本补丁以**纯运行时非侵入注入**的方式，将 Antigravity 重塑为兼具 **Anthropic 暖纸学术质感、官方碳黑与 Claude 暖炭橙可选深色模式、Google Sans Flex × 更纱黑体 × Anthropic Serif 四层精密排版、全界面母语级汉化与实时模型遥测** 的主力工作台：

- **🌓 昼夜双模式独立解耦（白天暖纸三预设 + 黑夜官方碳黑 / Claude 暖纸深夜双预设 + 设置面板原生书卷一键切换钮）**：
  - **白天模式（Light · `preset`）**：内置 **高对比暖白**（默认，暖燕麦侧栏 `#F7F5F0` + 微暖亮白主区 `#FCFCFB` + 深墨文字 `#0A0A0A`）、**ClaudeDesktop 净白** 与 **复古深色羊皮纸** 三套护眼预设；
  - **黑夜模式（Dark · `darkPreset`）**：在「系统设置 → 外观界面 → 主题模式」胶囊的 **☀️ 浅色** 与 **🌙 深色** 之间原生内嵌 **📖 书卷切换按钮**（`[ 🖥️ | ☀️ | 📖 | 🌙 ]`）——点击 **🌙 月亮** `0ms` 启用默认 **官方 `onyx` Default Dark 碳黑配色**（`#070708` 主背景 / `#111114` 侧栏 / `#2F71E3` 官方品牌蓝），点击 **📖 书卷** `0ms` 一键切换至同族 **Claude 暖纸深夜 (`claude-warm`)**（`#242320` 暖炭底 / `#1B1A18` 侧栏 / `#F3F0E4` 柔和象牙白字 / `#D97757` 陶土暖橙点缀），并自动写回 `user/config.json` 永久记忆！
- **🔤 四层字体排版（昼夜完全共用 · 原生适配 `2.33.0+` `Google Sans Flex` 可变字体引擎、`[data-markdown-root]`、`.pdf-sdk-root`、Lexical 编辑器、`plugin://swarm--` 子帧与 Windows `DirectWrite`）**：UI 控件西文直接采用官方最新 `Google Sans Flex` 可变字体引擎（`wght: 350/450/550/650`, `wdth: 92`），中文经 `AgSarasaUI` 精密字重桥接稳落 `Sarasa UI SC`（防 `350` 落入 `Light` 发虚、防 Windows `FontLink` 微软雅黑截胡）；阅读正文采用 `Anthropic Serif` 古典衬线 + `Sarasa Mono Slab SC`（局部隔离可变窄字宽轴）；代码与终端采用 `Anthropic Mono` 严格等宽；主输入框独立配置 Codex 同款打字机板状粗衬线。
- **🕯️ 输入框三态 `1.5px` 交互结构**：区分「新建对话首页」与「日常聊天会话」自动切换外框呼吸感与聚焦反馈（白天为古朴暗红蜡封，黑夜随 `darkPreset` 自动匹配 `#2F71E3` 品牌蓝或 `#D97757` 陶土橙聚焦光环）。
- **🇨🇳 1,860 条零冲突母语级汉化 + 弯引号自动归一与 `DICT_CI` 兜底索引 + ⚡ `O(1)` 增量实时指标胶囊（原生兼容本地与 Windows WSL2 默认发行版及双轨 WAL 读取）**：全覆盖 `2.33.0` / `2.32.2` 的插件组合包（Bundles）、内置浏览器数据/站点 Cookie 清理、快捷键方案、蜂群协作面板（Swarm 概览与纪要员视图）、`Gemini 4 Carbon` 等最新模型矩阵与动态上下文水位、支线提问插入主对话、账号套餐与配额告警及多路分屏/`/btw`/子 Agent 侧栏独立实时指标胶囊（`tok/s`、`TTFT`/`Hold`、动态上下文水位与 `+N sub` 全树输出聚合）。

### 2. 五大工程亮点
1. **🤖 Agent 3 秒一键部署，零构建零依赖**：所有 CSS、词典、DOM 引擎与守护进程已预封装在 `core/` 只读内核中，无需任何 npm 依赖或编译构建，交给你的 Agent 即可 3 秒一键安装。
2. **🛠️ 开放 `user/` 独立改装层，2.5 秒热重载**：内置升级永不覆盖的 `user/` 改装层（`config.json` / `custom.css` / `i18n.override.json` / `custom.js`）。想换昼夜配色预设、改字号、微调颜色或增改汉化词条，只需直接跟 Agent 对话，保存后 2.5 秒内自动热生效。
3. **🛡️ 纯运行时 CDP 注入、`2.33.0+` 单图标无感启动接力（`M1 + M2`）与宿主独占指纹门禁，绝不改动客户端本体**：针对 Antigravity `2.33.0` 移除默认调试端口演进，不拆包 `.asar`、不破坏系统签名与自动更新，双端均保持**唯一官方图标**（Windows/Linux 原地修补快捷方式参数，macOS 默认不生成多余图标，全平台守护进程在冷启动早期 `<=12s` 无感补挂 `--remote-debugging-port=0` 自动接力并严苛保护运行中存量会话），同时提供 `node install.mjs relaunch` 一键平滑重启。
4. **🔄 客户端日常小版本更新后自动延续**：配合系统常驻守护服务（macOS `LaunchAgent` / Windows 带中完整性 SDDL 的 `schtasks` 计划任务与跨周期 `.pid` 协作围栏 / Linux `systemd`）自动探测窗口与重连注入，单守护进程同时兼容 **Stable 正式版** 与 **Insiders 预览版**。
5. **💻 macOS 与 Windows 双平台原生统一体验**：内置 Windows 字体一键注册表写入命令 `install-fonts`、ClearType 抗锯齿自动适配、SQLite `O(1)` 增量只读游标缓存与 `Cmd/Ctrl + -/=/0` 缩放快捷键修复。

---

## 🚀 极简部署与日常使用指南

### 一、新用户初次安装
1. **前置准备**：从 [**Google Drive 全套资源包**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 下载并安装字体文件（macOS 双击安装到「字体册」，Windows 可让 Agent 用内置命令一键注册），并确保本机已安装 **Node.js `>= 22.0.0`**（推荐 `>= 22.13.0` 以解锁实时指标胶囊）。
2. **复制发给你的 AI Agent（Antigravity / Claude Code / Codex / Cursor 等）**：

> **💬 复制发给 Agent（新用户一键安装）**：  
> 请帮我克隆 `https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git`（或读取我已下载解压的补丁目录），严格按照仓库内的 `SKILL.md` 依次执行 `node install.mjs doctor`（Windows 下若未装字体请先用 `node install.mjs install-fonts` 注册字体）、`node install.mjs install`（若当前 `2.33.0+` 客户端未开启调试端口则提示我在空闲时运行 `node install.mjs relaunch`）和 `node install.mjs verify`，帮我一键部署好船板的 Antigravity 主题补丁并验证实机生效。

### 二、老版本用户无缝升级至 v5.5.0
`node install.mjs install` 会自动备份旧内核、接管旧版常驻服务，并无损保留你在 `~/.gemini/antigravity/theme-patch/user/` 中的个人配置：

> **💬 复制发给 Agent（老用户无缝升级）**：  
> 请帮我拉取最新的 `https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git`，阅读其中的 `SKILL.md`，直接运行 `node install.mjs install` 将我的环境升级至最新 `v5.5.0` 版本（若当前运行在 Antigravity `2.33.0+` 内部会话，请勿直接中断当前对话，安装完成后告诉我运行 `node ~/.gemini/antigravity/theme-patch/install.mjs relaunch` 接力生效即可）。

### 三、后续与 Agent 对话定制风格或排障
- **🎨 切换白天/黑夜预设、调整字号或微调外观**：
  > 请参考 `~/.gemini/antigravity/theme-patch/SKILL.md` 的 `user/` 改装规范，只修改 `user/` 目录下的配置文件：帮我把白天配色预设切换为「ClaudeDesktop 净白」（或「复古深色」） / 把黑夜配色预设 `"darkPreset"` 切换为 `"claude-warm"`（Claude 暖炭 + 陶土橙夜间风格） / 把对话正文字号调为 `16.5px`。
- **🇨🇳 自定义修改或新增某条汉化词条**：
  > 请在 `~/.gemini/antigravity/theme-patch/user/i18n.override.json` 中添加或修改词条，把界面上的 `"某英文原词"` 改成 `"我想要的中文"`，确认 2.5 秒内页面实时热更新生效。
- **🔍 自我 Debug 或一键回滚**：
  > 当前 Antigravity 界面有点异常，请按照 `~/.gemini/antigravity/theme-patch/SKILL.md` 先运行 `node install.mjs doctor`，再用 `node install.mjs verify --safe-mode` 排查是否是 `user/` 自定义层冲突；如需恢复上一版本请执行 `node install.mjs rollback`。
  - *注：若客户端冷启动后偶发未看到 `Remote`（远程）项目入口，属 Antigravity 官方 `language_server` 冷启动兜底包竞态（`v5.1.8+` 已内置空输入态自动自愈；若启动瞬间你已在输入框打字触发了草稿保护跳过自愈，手动按一次 `Cmd/Ctrl + Shift + R` 强制刷新即可恢复）。*

---

## 🕒 近期更新与关键演进（完整记录见 [`CHANGELOG.md`](CHANGELOG.md)）

### 近期更新
- **v5.5.0（2026-11-19 · 现行版）**
  - 全面适配 **Antigravity `2.33.0`** 架构演进：针对官方内置浏览器迁移 `cdpPipe` 移除默认 CDP 端口的变更，落地**单图标纯净模式 + `M1 + M2` 双保险零侵入启动接力架构**（Windows `.lnk`/Linux `.desktop` 原地打标 + macOS 默认单图标零冗余 + `node install.mjs relaunch` 一键重启 + 守护进程冷启动 `<=12s` / 更新重启 `<=25s` 无感自动补参重启并严苛保护运行中活跃会话）及 `doctor` `missing_opt_in_flag` 防假绿诊断；UI 西文排版全面切换至官方原生 **`Google Sans Flex` 可变字体引擎**（`wght: 350/450/550/650`, `wdth: 92`），新增 `AgSarasaUI` `@font-face` 精密字重桥接保护中文更纱黑体不落 `Light`、不被 Windows `FontLink` 截胡，同时完整保留对话正文 `Anthropic Serif` 衬线（局部隔离可变窄字宽轴）；修复 `2.33.0` 移除 `data-newux-theme="onyx"` 后的侧栏选中态与输入卡片选择器，并将母语级零冲突词典扩充至 **`1,860` 条**。
- **v5.4.3（2026-11-18）**
  - 全面适配 Antigravity `2.32.2`（Electron `44.9.1` `wcv` 三层堆栈 / `catcherView` 透明层与 `Gemini 4 Carbon` 512k 模型矩阵），扩充词典至 `1,790` 条并补齐账号套餐、模型括号档位（含 `Minimal` 正文与无障碍 `aria-label`）与退出码动态规则；新增多路平铺分屏、`/btw` 支线提问与子 Agent 侧栏标签页（`subagent_convo__`）独立实时指标胶囊及窄分屏 `+N sub` 动态折行（合入 [@CaramelizedCUDA](https://github.com/CaramelizedCUDA) [#17](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/17) 修复 [#16](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/16)）；加固 Swarm 协作子帧 `darkPreset`（📖 ↔ 🌙）`<1ms` 瞬时同步与重载防回退、修复 `coldBootHealer` 二次复检自锁缺陷、补齐历史对话列表防误翻隔离、升级中文标题外挂悬浮告警卡「一键复制修复命令」闭环及后台日志自截断保护。
- **v5.4.2（2026-11-17）**
  - 新增宿主主窗口 → `plugin://swarm--` 蜂群子帧实时深浅色中继、零闪白预置与浅色次级变量兜底，根治 `THEME_MODE_INHERIT` 及双向切换下的子帧主题失步（合入 [@honlam996](https://github.com/honlam996) [#15](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/15) 修复 [#14](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/14)）。
- **v5.4.1（2026-11-17）**
  - 在「系统设置 → 外观界面 → 主题模式」胶囊中新增原生 **📖 书卷按钮**，支持一键切换「Claude 暖纸深夜」并自动持久化记忆。
- **v5.4.0（2026-11-16）**
  - 新增可选深色预设 `"darkPreset": "claude-warm"`（暖炭底 + 象牙字 + 陶土暖橙），默认保持官方冷碳黑 `"onyx"` 不变（致谢 [@CaramelizedCUDA](https://github.com/CaramelizedCUDA) [#13](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/13)）。
  - 新增宿主独占指纹门禁，彻底豁免内置浏览器本地 `127.0.0.1` / `localhost` 网页并修复极早期空指针（合入 [#12](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/12)）。
  - 打通 Windows WSL2 默认发行版注册表识别与 SQLite 双轨只读读取，解决 WSL 环境下实时指标胶囊不显示问题（修复 [#10](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/10)）。
  - 重构 Windows 登录自启单实例锁与非提权计划任务注册，根治重启后遗留 `.pid` 冲突静默退出问题（修复 [#8](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/issues/8)）。
- **v5.3.0（2026-11-15）**
  - 支持子 Agent 与本地 `/swarm` 全树消耗汇总（`+N sub`），并在胶囊悬浮卡展示主/子会话累计输出明细（合入 [@honlam996](https://github.com/honlam996) [#7](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/7)）。
  - 支持从会话元数据动态识别模型真实上下文窗口上限（`256k` / `512k` / `840k` / `1M`），并区分缓冲型调用等待耗时（合入 [#6](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/6)）。
  - 完成 Antigravity `2.32.1` 双平台字体、连字与 Swarm 2.0 适配，静态汉化词典扩充至 `1,740` 条。

### 关键里程碑
- **v5.2.0（2026-11-14）**：适配 Antigravity `2.32.0`，完成全词库系统性去机翻重构与高频术语统一（`1,630` 条）。
- **v5.1.8（2026-11-14）**：新增冷启动内嵌兜底包零流量安全自愈机制，解决偶发丢失 `Remote` 远程入口问题。
- **v5.1.6（2026-11-13）**：适配 Antigravity `2.31.2`，打通 `plugin://swarm--` 蜂群子帧注入、原生幕布底色同步与防双倍缩放。
- **v5.1.3（2026-11-11）**：适配 Antigravity `2.31.0` 新架构，并将 SQLite 实时指标与 DOM 翻译全面升级为 `O(1)` 增量引擎。
- **v5.1.0（2026-11-10）**：确立白天暖纸护眼预设与黑夜官方碳黑物理隔离的昼夜双模式架构。
- **v5.0.0（2026-11-04）**：确立「`core/` 只读黄金内核 + `user/` 热重载改装层 + `install.mjs` 一键 CLI」模块化架构。
