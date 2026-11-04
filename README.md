# 船板的 Antigravity 2.0 主题、字体与深度汉化全栈补丁 (v5.0.0)

[![Version](https://img.shields.io/badge/version-5.0.0-7A1F1A.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0%20(22.13%2B%20Full)-339933.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)

专为 **Google Antigravity 2.0** 打造的 Anthropic 暖纸学术浅色护眼主题、中英混排字体精调、输入框「古朴暗红蜡封」三态解耦交互、450 条深度界面汉化与实时上下文/缓存命中率指标胶囊。

自 **v5.0.0** 起，项目重构为 **「`core/` 只读黄金内核 + `user/` 永不覆盖改装层 + `install.mjs` 一键生命周期 CLI」** 的模块化成品包架构。无论是人类用户手动安装，还是把本仓库交给你的 AI Agent 部署与二次改装，均可 **3 秒一键落地、2.5 秒保存热重载生效**。

---

## 🌐 三端官方获取与引导拓扑

本项目通过以下三个官方端点协同分发：

| 端点 | 链接 | 角色与内容说明 |
| :--- | :--- | :--- |
| **1. Notion 引导页** | [**船板 Notion 主题补丁主页**](https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554) | **Skill + 说明引导页**。提供设计理念展示、AI Agent 引导提示词，并引导前往 Google Drive 与 GitHub。 |
| **2. Google Drive 完全包** | [**Google Drive 完全资源包文件夹**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) | **全项目 + 全套字体完全资源包**。包含完整项目源码包，以及商业版权 **Anthropic 官方字体族**（Sans / Serif / Mono）与 **更纱黑体超集**（Sarasa Gothic SC / Mono SC / Term SC）。 |
| **3. GitHub 权威代码库** | [**Anarcadia/chuanban-antigravity-theme-patch**](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) | **权威代码完全体**。包含全部 `core/` 黄金内核、`user/` 改装层模板与 `install.mjs` CLI（注：因字体版权规范，GitHub 仓库不直接内置 Anthropic 字体二进制文件，字体请点击上方 Google Drive 链接下载）。 |

---

## ✨ 核心特性（v5.0.0）

- **📦 模块化成品包与零转义内核**：彻底告别将 CSS/JS 塞进单文件多重反斜杠转义字符串的历史。`core/theme.css`、`core/i18n.json`、`core/runtime.js`、`core/daemon.mjs` 四大模块全部以原生格式独立存在，附带 SHA-256 签名清单 `core/manifest.json`。
- **🔧 `user/` 无损热改装层（2.5 秒热重载）**：所有个性化定制（`user/config.json`、`user/custom.css`、`user/i18n.override.json`、`user/custom.js`）均与 `core/` 黄金内核物理隔离。未来升级补丁永不覆盖你的个人配置，且修改保存后 **2.5 秒内自动热更新至 Antigravity 窗口**，无需重启守护进程。
- **🕯️ 输入框「古朴暗红蜡封」三态解耦（设计 C / A / B）**：
  - **首页新建对话**：日常保持 **设计 C（透明外框）**，鼠标悬停或打字聚焦时浮现 **设计 A（`1.5px` 淡雅蜡封线）**；
  - **日常推进聊天会话**：日常常驻 **设计 A（`1.5px` 淡雅蜡封线）**，鼠标悬停或打字聚焦时加深变粗为 **设计 B（`2px` 浓郁古朴暗红蜡封 `#7A1F1A` + 微暖内发光）**；
  - 纯组件级 CSS `:has()` 驱动，页面切换 **0ms 瞬时响应**。
- **⚡ Node.js 动态分级兼容**：
  - **Node `>= 22.0`**：完整启用暖纸主题、字体排版、450 条深度汉化、死锁自愈与原生设置面板；
  - **Node `>= 22.13`**：通过动态 `await import('node:sqlite')` 自动解锁底部 **实时会话指标胶囊**（精准展示模型名、每轮平均耗时、上下文窗口占用与真实缓存命中率）。

---

## 🚀 快速开始

### 方式 A：交给你的 AI Agent 一键部署（推荐）
直接对你的 AI Agent（Antigravity / Claude Code / Codex / Cursor 等）发送：
> 请读取 `/path/to/chuanban-antigravity-theme-patch/SKILL.md`，帮我执行 `node install.mjs doctor` 和 `node install.mjs install` 完成主题补丁部署与实机验证。

### 方式 B：终端手动一键安装

1. **安装前置字体**：从 [Google Drive 完全资源包](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 下载字体并安装到系统字体目录。
2. **执行一键安装与自检**：
   ```bash
   git clone https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git
   cd chuanban-antigravity-theme-patch

   # 1. 环境与字体体检
   node install.mjs doctor

   # 2. 一键安装并启动后台守护服务（支持 --channel stable 或 --channel insiders）
   node install.mjs install

   # 3. 验证实时 CDP 注入状态
   node install.mjs verify
   ```

---

## 🛠️ 常用 CLI 命令 (`install.mjs`)

| 命令 | 说明 |
| :--- | :--- |
| `node install.mjs doctor` | 全面诊断 Node 版本、`node:sqlite` 可用性、字体文件、核心文件 SHA-256、守护进程与 CDP 端口状态 |
| `node install.mjs install [--channel stable\|insiders]` | 备份旧版、部署 `core/` 内核、保留 `user/` 改装层、配置 `argv.json` 并启动系统后台守护服务 |
| `node install.mjs verify [--safe-mode]` | 立即通过 CDP 向当前 Antigravity 窗口推送注入并校验（加 `--safe-mode` 可临时屏蔽 `user/` 层排查冲突） |
| `node install.mjs rollback` | 一键回滚至 `~/.gemini/antigravity/theme-patch/backups/` 下最近一次自动备份的版本 |
| `node install.mjs uninstall` | 停止后台守护服务并移除包装脚本（保留 `theme-patch/user` 配置以备后用） |

---

## 📁 目录结构与二次定制指南

详见 [SKILL.md](SKILL.md) 第五节。所有个人微调请直接编辑安装目录 `~/.gemini/antigravity/theme-patch/user/` 下的文件：
- `user/config.json`：切换功能模块开关、覆盖全局 CSS 变量（如 `--ag-chat-font-size`）；
- `user/custom.css`：追加自定义 CSS 样式；
- `user/i18n.override.json`：覆盖或新增汉化词条；
- `user/custom.js`：编写在独立沙箱内执行的自定义前端脚本。

> 历史 v4 单文件架构技术蓝图已归档至 [`DOCS/BLUEPRINT_V4_LEGACY.md`](DOCS/BLUEPRINT_V4_LEGACY.md)。
