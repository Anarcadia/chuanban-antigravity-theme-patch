# chuanban-antigravity-theme-patch

> **Google Antigravity 客户端界面补丁 Skill**  
> *Warm-paper theme, layered typography, partial localization & settings-deadlock fix for Google Antigravity — via non-invasive CDP runtime injection.*

**极简介绍**：船板自用 Antigravity 界面补丁 Skill。引导执行端 Agent（Claude Code / Codex / Antigravity 等）在用户电脑上制作并常驻安装一套属于自己的 Antigravity 界面补丁——Claude 式暖象牙纸配色预设（三套可切换）、牛皮纸侧栏、更纱黑体 + Anthropic 官方字体三层排版、界面局部汉化、设置弹窗白屏死锁修复。基于 Chrome DevTools Protocol 运行时动态注入，**不修改 App 原包、不重新打包 .asar、不破坏系统签名**，随时可一键撤销回出厂状态。

---

## 这是什么

`chuanban-antigravity-theme-patch` 是一份写给执行端 Agent 的一次性安装说明书（Skill）。把它交给 Claude Code、Codex 或 Antigravity 自己，它会按蓝图在你的机器上搭好一套常驻补丁：

- **🎨 三套配色预设**：高对比版（默认，暖燕麦边栏 + 净白主区 + 近纯黑文字）、ClaudeDesktop 净白、复古深色（黄棕牛皮纸双栏），`localStorage` 一个键秒级热切换；
- **🔤 三层字体排版**：UI 几何无衬线（Anthropic Sans + 更纱 UI）→ 正文书卷衬线（Anthropic Serif + 更纱 Slab）→ 代码严格 1:2 等宽（Anthropic Mono + 更纱 Mono Slab），输入框独立配 Codex 同款打字机粗衬线；
- **🇨🇳 界面局部汉化**：只汉化导航、设置面板与状态文案，代码块、终端、对话正文严格排除，绝不误伤；
- **🔧 两个官方 Bug 自愈**：设置弹窗白屏死锁（自定义预设名污染 localStorage）与 TanStack Router `settingsOpen=true` 残留死锁，均已在注入层修复。

三条底线：不改 App 包与 `.asar`；注入幂等（固定 id、全局标记，重复执行不叠加）；随时可一键撤销。

## 使用方式

这个仓库的正文就是 [SKILL.md](SKILL.md)。两种用法：

1. **直接投喂**：把 SKILL.md 全文复制给你的执行端 Agent（Claude Code / Codex / Antigravity），说「按这个装」；
2. **作为 Skill 安装**：把本仓库克隆（或下载 SKILL.md）到你的 skills 目录，触发词：安装/定制 Antigravity 主题、字体、配色、汉化补丁，或 Antigravity 设置按钮点不开。

Agent 会先确认环境（macOS / Windows、Node.js 18+、Antigravity 已安装），询问你的配色偏好（不指定则默认部署高对比版），然后完成安装、常驻配置与验收。

## 字体资源

Anthropic 官方字体族（`AnthropicSans` / `AnthropicSerif` / `AnthropicMono`）与更纱黑体超集（`Sarasa-SuperTTC.ttc`）打包在 Google Drive 公开共享库：

<https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC>

更纱黑体也可以通过 `brew install --cask font-sarasa-gothic`（macOS）或 GitHub Release（Windows）安装。

## 安全说明

- 补丁通过 CDP 只连接 `127.0.0.1` 本地回环，不把调试端口暴露到外网；
- 不修改 `/Applications/Antigravity.app` 原生二进制，不破坏系统签名与自动更新；
- 卸载即净：停掉并删除 LaunchAgent → 结束守护进程 → 设置里切回 Default Light → 重启 Antigravity → 删除补丁目录，100% 回退出厂状态。

## 适合谁

- 用 Antigravity 干活、受够了冷灰工程界面的人；
- 想要 Claude Desktop 那种暖纸阅读质感的人；
- 被设置按钮点不开 / 主题切了白屏折磨过的人。

---

*Made by [船板](https://github.com/Anarcadia) · 原方案数值与选择器均经 macOS 实测 · Windows 与轻量路线只给原则，由执行 Agent 自行调研落地*
