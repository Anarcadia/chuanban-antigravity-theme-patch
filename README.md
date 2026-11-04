# 船板的 Antigravity 主题、字体与深度汉化全栈补丁 (v5.0.0)

[![Version](https://img.shields.io/badge/version-5.0.0-7A1F1A.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0%20(22.13%2B%20Full)-339933.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)

> **本页面为补丁主介绍、版本演进历程与极简部署指南（作为 [`SKILL.md`](SKILL.md) 的前置概括）。**  
> 供 AI Agent 执行部署与二次改装读取的完整技术契约独立存放于仓库根目录的 **[`SKILL.md`](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/blob/main/SKILL.md)**，不再直接堆叠于主页正文中。

---

## 🔗 核心资源链接与三端官方入口

| 端点名称 | 链接地址 | 定位与包含内容 |
| :--- | :--- | :--- |
| **1. Notion 官方主页** | [**chuanban-antigravity-theme-patch**](https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554) | **说明与部署引导主页**。提供补丁设计概览、版本更新历程与面向 AI Agent 的标准提示词引导。 |
| **2. Google Drive 完全资源包** | [**Google Drive 官方共享文件夹**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) | **全项目成品包 + 全套字体库**。内置 **Anthropic 官方原版字体族**（`Anthropic Sans` / `Anthropic Serif` / `Anthropic Mono`）与 **更纱黑体超集**（`Sarasa-SuperTTC.ttc`），以及完整补丁打包资源。 |
| **3. GitHub 权威代码库** | [**Anarcadia/chuanban-antigravity-theme-patch**](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) | **成品补丁代码完全体**。包含预封装黄金内核 `core/`、个人改装层 `user/`、一键安装器 `install.mjs` 及 Agent 专用的 [`SKILL.md`](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/blob/main/SKILL.md)（字体文件请从上方 Google Drive 链接下载）。 |

---

## 🕒 版本更新历程

- **2026-11-04（v5.0.0 现行版 · 模块化成品包与双平台全栈内核）**：
  1. **架构全面升级为「`core/` 只读黄金内核 + `user/` 无损热改装层 + `install.mjs` 一键生命周期 CLI」**：彻底告别由 Agent 现场拼装单文件代码的模式，将全部样式、450 条深度汉化词典、增量 DOM 汉化引擎与后台守护进程预封装为原生模块化成品包，实现 **Agent 零代码生成 3 秒一键部署**；
  2. **新增输入框「古朴暗红蜡封」双场景三态解耦（设计 C / A / B）**：首页新建对话保持透明外框呼吸感（悬停/聚焦浮现 `1.5px` 淡雅蜡封线）；日常会话常驻 `1.5px` 淡蜡封线（悬停/聚焦进阶为 `2px` 浓郁古朴暗红蜡封 `#7A1F1A` + 微暖内发光），纯 CSS `:has()` 驱动实现 `0ms` 无延迟切换；
  3. **开放 `user/` 2.5 秒可逆热重载改装层与 `--safe-mode` 沙箱排障**：支持用户后续随时与 Agent 自然语言沟通，在永不覆盖的 `user/` 层实时微调配色、字号、CSS、词条与前端扩展脚本，保存后 2.5 秒自动热生效（含 `WeakMap` 词条实时还原）；
  4. **macOS / Windows 双平台原生兼容与 Stable / Insiders 同进程双守护**：支持 Node.js 动态分级（`>= 22.13` 自动解锁 SQLite 实时指标胶囊，低版本优雅降级零报错），新增 Windows DirectWrite 字体一键注册命令 `install-fonts`、ClearType 去重影与跨版本观察器防抖动清理。
- **2026-11-01（v4）**：
  1. **新增前端 Bundle 静态全量扫描与全界面基准词典**：穿透 Radix UI 未挂载弹窗菜单（如 `+ Add Context`）与 TanStack Router 全部 15 个设置子页面，实现初次注入即全界面零遗漏汉化；
  2. **新增输入框模型名称同行实时性能指标胶囊**：实时展示 `TPS · TTFT · 256k 上下文水位 · Token 消耗` 与悬浮双层详情仪表盘，基于 `node:sqlite` 只读解析本地会话数据库并配合 CDP `Runtime.addBinding` 实现毫秒级会话切换刷新。
- **2026-10-19（v2）**：界面排版扎实度与温润墨感（Solid Ink）深度实装；精准解耦左侧文件目录折叠标题粗度，固化侧栏常规字重 `450` 与 `0.2px` 微润墨调校。
- **2026-10-17**：增补新版模型选择器等界面汉化词典，优化 UI 字重与排版层次。
- **2026-10-13（v1）**：首发防白屏崩溃底层存储穿透修复；输入框独立引入 Codex 同款等宽粗衬线（`Sarasa Mono Slab SC`）；发布三大独立配色预设（高对比版 / ClaudeDesktop 净白 / 复古深色）及 Google Drive 字体公开共享库。

---

## ✨ 补丁简介：设计目的与当前版本亮点

### 1. 凝练设计目的
Google Antigravity 原生界面采用冷灰底色、机械混黑侧栏与单一无衬线字体，长时间高强度编码与阅读极易视觉疲劳。本补丁旨在以**完全非侵入**的方式，将 Antigravity 重塑为兼具 **Anthropic 暖纸学术质感、四层中西文精密排版、全界面母语级汉化与实时模型遥测** 的主力工作台：

- **🎨 三套暖纸护眼配色预设**：默认部署 **高对比版**（暖燕麦侧栏 `#F7F5F0` + 微暖亮白主区 `#FCFCFB` + 近纯黑深墨文字 `#0A0A0A`），同时内置 **ClaudeDesktop 净白** 与 **复古深色羊皮纸**，一键秒级热切换；
- **🔤 四层字体排版（Solid Ink 润墨调校）**：UI 控件采用 `Anthropic Sans` + `Sarasa UI SC`，阅读正文采用 `Anthropic Serif` 古典衬线 + `Sarasa Mono Slab SC`，代码与终端采用严格 1:2 等宽，主输入框独立配置 Codex 同款打字机板状粗衬线；
- **🕯️ 输入框「古朴暗红蜡封」三态交互**：区分「新建对话首页」与「日常聊天会话」自动切换外框呼吸感与暗红蜡封聚焦反馈；
- **🇨🇳 450 条深度汉化 + ⚡ 实时性能指标胶囊**：全覆盖隐藏菜单与 15 个设置子页（严格隔离保护代码块、终端与对话正文不误伤），并在输入框底部同行实时展示生成速度（`tok/s`）、首字耗时（`TTFT`）、`256k` 上下文水位及缓存命中率详情仪表盘。

### 2. 当前版本五大核心亮点（v5.0.0）
1. **🤖 Agent 一键极简部署，内核封装完毕无需构建**：
   所有经过深度调优与多轮对抗审计的 CSS、词典、DOM 引擎与守护进程已预封装在 `core/` 只读黄金内核中，**零第三方 npm 依赖、无需任何编译构建步骤、更不需要 Agent 现场从头手写代码**。交给你的 Agent 后 3 秒即可一键落地。
2. **🛠️ 开放 `user/` 独立改装层，后续可随时与 Agent 沟通自我 Debug 与定制风格**：
   内置与内核物理隔离、升级永不覆盖的 `user/` 改装层（`config.json` / `custom.css` / `i18n.override.json` / `custom.js`）。任何修改保存后 **2.5 秒内自动热重载到当前窗口**——你后续想换配色、改字号、微调某个界面元素或增改汉化词条，只需直接跟 Agent 对话，Agent 即可为你实时定制或通过 `--safe-mode` / `rollback` 秒级自愈排障。
3. **🛡️ 纯运行时 CDP 注入，完全不改变 Antigravity 程序本体**：
   仅通过本地回环（`127.0.0.1`）Chrome DevTools Protocol 在渲染层内存动态注入，**绝不修改 `/Applications/Antigravity.app` 或 Windows 安装包原文件、不拆包重签 `.asar`、不破坏系统签名**，且在注入层自动拦截修复官方设置弹窗白屏与路由死锁问题。
4. **🔄 Antigravity 日常小幅更新后自动延续，不会失效**：
   正因为不改动客户端程序文件，配合系统级常驻守护服务（macOS `LaunchAgent` / Windows 后台自启 / Linux `systemd`）自动探测窗口与重连注入，**当 Antigravity 客户端进行日常小版本更新或重启后，主题与汉化会自动恢复生效**，无需反复重装；单守护进程同时自动兼容 **Stable 正式版** 与 **Insiders 预览版**。
5. **💻 macOS 与 Windows 双平台原生统一体验**：
   同一套补丁包在 macOS 与 Windows 下均提供完整的生命周期 CLI 支持，自动处理 Windows 路径转义、DirectWrite 字体注册表写入、ClearType 字体去重影与 SQLite 锁冲突防闪烁。

---

## 🚀 极简部署与日常使用指南

### 一、新用户初次安装：拿到补丁后对 Agent 说什么？

1. **前置准备**：请先从 [**Google Drive 完全资源包**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 下载字体文件（macOS 可直接双击安装到「字体册」，Windows 解压后可直接让 Agent 用内置命令一键注册安装），并确保本机已安装 **Node.js `>= 22.0.0`**（推荐 `>= 22.13.0` 以解锁实时指标胶囊）。
2. **发送给 Agent 的安装指令**：打开你的 AI Agent（Antigravity 自身、Claude Code、Codex、Cursor 等），直接复制发送以下话术：

> **💬 复制发给 Agent（新用户一键安装）**：  
> 请帮我克隆 `https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git`（或读取我已经下载解压的补丁目录），严格按照仓库内的 `SKILL.md` 依次执行 `node install.mjs doctor`（若在 Windows 下未装字体请先用 `node install.mjs install-fonts` 注册字体）、`node install.mjs install` 和 `node install.mjs verify`，帮我一键部署好船板的 Antigravity 主题补丁并验证实机生效。

---

### 二、老用户升级指南：为什么强烈建议重新安装？如何指引 Agent？

#### 为什么建议所有 v1 ~ v4 老用户重新安装升级至 v5.0.0？
1. **彻底消除性能拖累与界面抖动**：旧版由 Agent 现场生成的单文件脚本容易因全量 DOM 扫描、双重正则转义或残留 `ResizeObserver` 导致流式输出掉帧或输入框高度跳动；v5.0.0 采用预封装 `O(N·深度)` 增量引擎与跨版本观察器清理，流式响应丝滑零抖动。
2. **告别「一升级就丢个人修改」**：v5.0.0 首次将 `core/` 黄金内核与 `user/` 个人改装层彻底分离，重装后以后再升级内核永不覆盖你的个人字号、配色和自定义词条。
3. **自动接管旧版常驻服务**：`node install.mjs install` 会自动备份并替换旧版 `~/.gemini/antigravity/scripts/antigravity-font-daemon.mjs` 与系统 `LaunchAgent` 服务，无缝完成架构迁移。

> **💬 复制发给 Agent（老用户无缝升级重装）**：  
> 我电脑上之前装过旧版 Antigravity 主题守护脚本。请帮我拉取最新的 `https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git`，先阅读其中的 `SKILL.md`，直接运行 `node install.mjs install` 和 `node install.mjs verify` 将我的环境整体升级替换为最新 v5.0.0 模块化成品包架构（如果我旧脚本里有自定义的配色预设或字号修改，请帮我提取迁移到新的 `~/.gemini/antigravity/theme-patch/user/` 改装层中）。

---

### 三、后续自我 Debug 与调整皮肤风格：平时如何提示 Agent？

补丁安装完成后常驻于 `~/.gemini/antigravity/theme-patch/`（Windows 为 `%USERPROFILE%\.gemini\antigravity\theme-patch\`）。后续任何个性化微调或故障排查，**你都无需自己动手改代码**，直接向 Agent 发出自然语言指令即可：

- **🎨 想切换配色、调整字号或修改界面局部外观时**：
  > **💬 复制发给 Agent**：  
  > 请参考 `~/.gemini/antigravity/theme-patch/SKILL.md` 第五节的 `user/` 改装规范，只修改 `user/` 目录下的配置文件：帮我把配色预设切换为「ClaudeDesktop 净白」（或「复古深色」） / 把对话正文字号调为 `16.5px` / 在 `user/custom.css` 里微调一下某处的颜色。*(保存后 2.5 秒自动热重载生效)*

- **🇨🇳 想自己修改或补充某条汉化翻译时**：
  > **💬 复制发给 Agent**：  
  > 请帮我在 `~/.gemini/antigravity/theme-patch/user/i18n.override.json` 中添加或修改词条，把界面上的 `"某英文原词"` 改成 `"我想要的中文"`，确认 2.5 秒内页面实时热更新生效。

- **🔍 遇到界面异常、想让 Agent 自我 Debug 或一键回滚时**：
  > **💬 复制发给 Agent**：  
  > 当前 Antigravity 界面样式或指标胶囊有点异常，请按照 `~/.gemini/antigravity/theme-patch/SKILL.md` 的排障指引，先运行 `node install.mjs doctor` 检查健康状态，再用 `node install.mjs verify --safe-mode` 排查是不是 `user/` 自定义层冲突；如需恢复上一正常版本请执行 `node install.mjs rollback`。

- **🧹 想临时关闭补丁或彻底还原官方出厂状态时**：
  > **💬 复制发给 Agent**：  
  > 请帮我将 `~/.gemini/antigravity/theme-patch/user/config.json` 中的 `"enabled"` 设为 `false` 临时无损还原为官方原貌（或者运行 `node install.mjs uninstall` 停止后台守护服务）。

---

*Made by [船板](https://github.com/Anarcadia) · 面向 AI Agent 的完整执行与改装规范请查阅仓库内 [`SKILL.md`](SKILL.md)*
