# 船板的 Antigravity 书卷暖纸 × 官方碳黑昼夜双模式主题、字体优化与深度汉化全栈补丁 (v5.1.5 · 完整适配 Antigravity 2.31.1)

[![Version](https://img.shields.io/badge/version-5.1.5-7A1F1A.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![Antigravity](https://img.shields.io/badge/Antigravity-2.31.1%2B-D97757.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0%20(22.13%2B%20Full)-339933.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)

> **本页面为补丁主介绍、极简部署指南与版本演进说明。**  
> 供 AI Agent 执行一键安装与二次改装读取的完整技术契约独立存放于仓库根目录的 **[`SKILL.md`](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/blob/main/SKILL.md)**。

---

## 🔗 核心资源链接与三端入口

| 端点名称 | 链接地址 | 定位与包含内容 |
| :--- | :--- | :--- |
| **1. Google Drive 全套资源包（含字体）** | [**Google Drive 官方共享文件夹**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) | **全项目成品包 + 全套必备字体库**。内置 **Anthropic 官方原版字体族**（`Anthropic Sans` / `Anthropic Serif` / `Anthropic Mono`）与 **更纱黑体超集**（`Sarasa-SuperTTC.ttc`）。 |
| **2. GitHub 项目代码库** | [**Anarcadia/chuanban-antigravity-theme-patch**](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) | **成品补丁代码完全体**。包含预封装只读内核 `core/`、个人改装层 `user/`、一键安装器 `install.mjs` 及 Agent 专用的 [`SKILL.md`](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/blob/main/SKILL.md)（字体请从上方 Google Drive 下载）。 |
| **3. Notion 引导安装页** | [**chuanban-antigravity-theme-patch**](https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554) | 备用说明与部署引导主页。 |

---

## 🖼️ 实机样式演示

### 1. 三栏工作台：高对比暖纸主题 + 古朴暗红蜡封输入框 + 同行实时指标胶囊 + 书卷衬线工件
![三栏对话与工件阅读视图](assets/preview-workspace-chat-and-artifact.png)

### 2. 新建对话首页：全界面深度汉化 + 聚焦浮现淡雅暗红蜡封外框
![新建对话首页视图](assets/preview-home-new-conversation.png)

---

## ✨ 补丁简介：核心定位与五大亮点（v5.1.5）

### 1. 设计目的
Google Antigravity 原生浅色界面偏冷刺眼、全局仅使用单一无衬线字体，长时间高强度阅读与编码容易视觉疲劳。本补丁以**纯运行时非侵入注入**的方式，将 Antigravity 重塑为兼具 **Anthropic 暖纸学术质感、官方原版高可读深色模式、四层中西文精密排版、全界面母语级汉化与实时模型遥测** 的主力工作台：

- **🌓 昼夜双模式独立解耦（暖纸白天 + 官方碳黑黑夜）**：
  - **白天模式（Light）**：内置 **高对比暖白**（默认，暖燕麦侧栏 `#F7F5F0` + 微暖亮白主区 `#FCFCFB` + 深墨文字 `#0A0A0A`）、**ClaudeDesktop 净白** 与 **复古深色羊皮纸** 三套护眼预设；
  - **黑夜模式（Dark）**：当你点击设置中的「深色 / Dark」按钮（或跟随系统深色）时，**100% 保持四层字体与 UI 形状要素不变**，同时 `0ms` 自动还原 **Antigravity `2.30.0 ~ 2.31.1` 官方无补丁时的 `onyx` Default Dark 碳黑配色方案**（`#070708` 主背景 / `#111114` 侧栏 / `#15151A` 悬浮输入卡 / `#2F71E3` 官方品牌蓝），并专项提升深色下的文字对比度、卡片边界与指标可读性。
- **🔤 四层字体排版（昼夜完全共用 · 原生适配 `2.31.1` `[data-markdown-root]`、`data-agy-font` 与 Lexical 编辑器）**：UI 控件采用 `Anthropic Sans` + `Sarasa UI SC`，阅读正文采用 `Anthropic Serif` 古典衬线 + `Sarasa Mono Slab SC`，代码与终端采用严格 1:2 等宽，主输入框独立配置 Codex 同款打字机板状粗衬线。
- **🕯️ 输入框三态 `1.5px` 交互结构**：区分「新建对话首页」与「日常聊天会话」自动切换外框呼吸感与聚焦反馈（白天为古朴暗红蜡封，黑夜为官方微亮边与 `#2F71E3` 品牌蓝聚焦光环）。
- **🇨🇳 1,094 条零大小写冲突深度汉化 + 首字母大写不敏感兜底索引（`DICT_CI`） + ⚡ `O(1)` 增量实时指标胶囊**：全覆盖 `2.31.1` 新增的 Fork / Best of N / 定时任务（Scheduled Tasks）/ 快捷键编辑器 / 远程控制二维码 / 沙箱与浏览器执行权限 / 插件主题外观及全部命令面板标签（基于 `WeakMap` `O(1)` 隔离保护代码块、Monaco 编辑器、终端与对话正文不误伤），并在输入框底部同行实时展示生成速度（`tok/s`）、首字耗时（`TTFT`）、`256k` 上下文水位及缓存命中率详情面板。

### 2. 五大工程亮点
1. **🤖 Agent 3 秒一键部署，零构建零依赖**：所有 CSS、词典、DOM 引擎与守护进程已预封装在 `core/` 只读内核中，无需任何 npm 依赖或编译构建，交给你的 Agent 即可 3 秒一键安装。
2. **🛠️ 开放 `user/` 独立改装层，2.5 秒热重载**：内置升级永不覆盖的 `user/` 改装层（`config.json` / `custom.css` / `i18n.override.json` / `custom.js`）。想换配色、改字号、微调颜色或增改汉化词条，只需直接跟 Agent 对话，保存后 2.5 秒内自动热生效。
3. **🛡️ 纯运行时 CDP 注入，绝不改动客户端本体**：仅通过本地 `127.0.0.1` Chrome DevTools Protocol 在渲染层动态注入，不拆包 `.asar`、不破坏系统签名，且自动拦截修复官方设置弹窗路由死锁问题。
4. **🔄 客户端日常小版本更新后自动延续**：配合系统常驻守护服务（macOS `LaunchAgent` / Windows 计划任务自启 / Linux `systemd`）自动探测窗口与重连注入，单守护进程同时兼容 **Stable 正式版** 与 **Insiders 预览版**。
5. **💻 macOS 与 Windows 双平台原生统一体验**：内置 Windows 字体一键注册表写入命令 `install-fonts`、ClearType 抗锯齿自动适配、SQLite `O(1)` 增量只读游标缓存与 `Cmd/Ctrl + -/=/0` 缩放快捷键修复（兼容 `2.31.0` `resetZoom`）。

---

## 🚀 极简部署与日常使用指南

### 一、新用户初次安装
1. **前置准备**：从 [**Google Drive 全套资源包**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 下载并安装字体文件（macOS 双击安装到「字体册」，Windows 可让 Agent 用内置命令一键注册），并确保本机已安装 **Node.js `>= 22.0.0`**（推荐 `>= 22.13.0` 以解锁实时指标胶囊）。
2. **复制发给你的 AI Agent（Antigravity / Claude Code / Codex / Cursor 等）**：

> **💬 复制发给 Agent（新用户一键安装）**：  
> 请帮我克隆 `https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git`（或读取我已下载解压的补丁目录），严格按照仓库内的 `SKILL.md` 依次执行 `node install.mjs doctor`（Windows 下若未装字体请先用 `node install.mjs install-fonts` 注册字体）、`node install.mjs install` 和 `node install.mjs verify`，帮我一键部署好船板的 Antigravity 主题补丁并验证实机生效。

### 二、老版本用户无缝升级至 v5.1.5
`node install.mjs install` 会自动备份旧内核、接管旧版常驻服务，并无损保留你在 `~/.gemini/antigravity/theme-patch/user/` 中的个人配置：

> **💬 复制发给 Agent（老用户无缝升级）**：  
> 请帮我拉取最新的 `https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git`，阅读其中的 `SKILL.md`，直接运行 `node install.mjs install` 和 `node install.mjs verify` 将我的环境升级至最新 `v5.1.5` 版本（若我旧脚本里有自定义的配色预设或字号修改，请迁移保留到 `~/.gemini/antigravity/theme-patch/user/` 改装层中）。

### 三、后续与 Agent 对话定制风格或排障
- **🎨 切换白天预设、调整字号或微调外观**：
  > 请参考 `~/.gemini/antigravity/theme-patch/SKILL.md` 的 `user/` 改装规范，只修改 `user/` 目录下的配置文件：帮我把白天配色预设切换为「ClaudeDesktop 净白」（或「复古深色」） / 把对话正文字号调为 `16.5px` / 在 `user/custom.css` 里微调某处样式。
- **🇨🇳 自定义修改或新增某条汉化词条**：
  > 请在 `~/.gemini/antigravity/theme-patch/user/i18n.override.json` 中添加或修改词条，把界面上的 `"某英文原词"` 改成 `"我想要的中文"`，确认 2.5 秒内页面实时热更新生效。
- **🔍 自我 Debug 或一键回滚**：
  > 当前 Antigravity 界面有点异常，请按照 `~/.gemini/antigravity/theme-patch/SKILL.md` 先运行 `node install.mjs doctor`，再用 `node install.mjs verify --safe-mode` 排查是否是 `user/` 自定义层冲突；如需恢复上一版本请执行 `node install.mjs rollback`。

---

## 🕒 版本演进简史

- **2026-11-12（v5.1.5 现行版 · Antigravity `2.31.1` 双端漂移合流、1,094 条零大小写冲突词典与 `DICT_CI` 兜底引擎）**：
  联合 macOS 与 Windows 双端 `2.31.1` 实机审计完成无损合流：`core/runtime.js` 新增首字母大写不敏感兜底索引 `DICT_CI`（自动兼容 `Toggle Sidebar` / `Toggle sidebar`、`Archive Conversation` / `Archive conversation` 等大小写漂移且零误伤小写标识符），补齐 `No more older messages, showing X of Y` 与 `Go to turn X of Y` 动态无障碍翻译；`core/i18n.json` 扩充至 **1,094 条严格零大小写冲突词条**（原生兼容 Windows PowerShell 5.1 `ConvertFrom-Json`，全覆盖 `2.31.1` Fork / Best of N / 定时任务 / 快捷键编辑器 / 沙箱与浏览器权限 / 插件主题外观 / 命令面板标签并统一「置顶」用语）；`core/theme.css` 兼容 `2.31.1` 布尔空属性 `[data-active=""]`；`install.mjs` 屏蔽 Node 22 `node:sqlite` `ExperimentalWarning` 保持 CLI JSON 输出绝对纯净。
- **2026-11-11（v5.1.4 · 实时指标胶囊运行态同行稳定化与 `flex-col` 越界根治）**：
  修复 `2.31.0` `.surface-composer-card`（`flex-direction: column`）下折行胶囊 `flex-basis: 100%` 纵向撑高溢出输入框底边的 CSS 缺陷；回调常规窗口恒定同行阈值（`< 165px` 窄栏进入、`>= 180px` 滞回恢复），并为 `ResizeObserver` 补齐左右按钮组宽度签名监听与会话路由切换强制重算，彻底消除会话运转时指标行掉出框外及跨会话状态串染。
- **2026-11-11（v5.1.3 · Antigravity `2.31.0` 双端全量合并与性能/安全深度加固）**：
  1. **`2.31.0` 新架构全量对齐与 900 条汉化词典**：适配 `[data-markdown-root]` 流式渲染容器、Lexical 输入框与占位符等距 Slab 排版、生成中止按钮（`input-cancel-button`）昼夜双态样式、Base UI `[role="listbox"]` 弹层排版、`electronNative.resetZoom` 重置缩放 API 与内置浏览器透明打孔（`data-has-browser-hole`）；词典扩充至 **900 条零重复词条**，并补齐模型努力程度（`Low/Medium/High/Max`）、权限模式、对话轮次与相对时间的动态翻译及权限编辑器 `aria-label="Cancel"` 安全豁免；
  2. **`O(1)` 性能跃迁与全生命周期无逃逸治理**：`core/daemon.mjs` SQLite 遥测引擎升级为双游标独立坐标系 `O(1)` 增量读取（支持 `Undo` 回退自愈与 `200ms` 锁超时），消除超长会话全表扫描开销；`core/runtime.js` 引入 `WeakMap` 不可变容器 `O(1)` 缓存短路、早期 `<head>` 注入 `DOMContentLoaded` 自愈挂载、胶囊实测宽度滞回防抖与 `ctx.onCleanup(fn)` 生命周期钩子；`install.mjs` 升级为 JSONC 注释安全 `argv.json` 解析、Windows 单一权威 `schtasks` 自启与无竞态卸载还原。
- **2026-11-11（v5.1.2 · `2.31.0` 内置浏览器透明打孔、用量/右侧边栏汉化与 Opus 对抗审查加固）**：
  修复内置浏览器 `data-has-browser-hole="true"` 透明打孔兼容、`html[style]` 昼夜切换竞争、`<input>` 占位符翻译引擎、`applyThemeVars` 样式表优先级顺序及 macOS `LaunchAgent` 孤立进程 `PATH` 注入。
- **2026-11-10（v5.1.1 · Windows DirectWrite 双轴可变字体与计划任务常驻修复）**：
  兼容 OpenType `STAT` 表 `opsz` 轴生成的 `'Anthropic Serif/Sans Web Display Light'` 家族名及 macOS `CoreText` PostScript 名称，接入 Windows `schtasks` 计划任务常驻与 `.gitattributes` `CRLF -> LF` 自动自愈。
- **2026-11-10（v5.1.0 · 昼夜双模式独立解耦 & 全栈去冗余精简）**：
  白天模式保留三套暖纸预设与古朴暗红蜡封，黑夜模式还原官方 `onyx` Default Dark 碳黑配色（`#070708` / `#111114` / `#15151A` / `#2F71E3`），并通过 CSS 变量化重构精简 47% 样式体积。
- **2026-11-04 ~ 2026-11-10（v5.0.0 ~ v5.0.1）**：
  升级为「`core/` 只读黄金内核 + `user/` 2.5 秒可逆热重载改装层 + `install.mjs` 生命周期 CLI」架构，完整对齐 `2.30.0` `Knowledge Work` 模式。
