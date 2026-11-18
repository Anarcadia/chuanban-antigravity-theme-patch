---
name: chuanban-antigravity-theme-patch
description: 船板的 Antigravity 2.0 主题、字体与深度汉化全栈成品补丁包（v5.5.0 模块化架构 · 适配 Antigravity 2.33.0+ macOS + Windows 双平台 CDP Opt-in 架构演进 [M1 启动器 + M2 冷启动无感接力 + relaunch] + UI 西文直连官方 Google Sans Flex 可变字体引擎 × 中文更纱黑体 UI 精密字重桥接 + 对话正文 Anthropic Serif 古典衬线 + 昼夜双模式独立预设与外观界面原生书卷一键切换钮 [🖥️|☀️|📖|🌙] + 宿主独占指纹门禁 + Windows 跨完整性 PID 协作围栏与 ME SDDL 计划任务 + WSL2 双轨只读 SQLite + Swarm 协作面板实时主题/字体中继 + 1860条母语级去机翻零冲突词典 + 多路分屏/支线提问(/btw)/子Agent侧栏独立实时指标胶囊）。采用「core/ 只读黄金内核 + user/ 永不覆盖改装层 + install.mjs 一键生命周期 CLI」，支持对方 Agent 零代码生成一键部署、2.5 秒热重载二次定制与 --safe-mode 沙箱排障。当用户提到“安装船板 Antigravity 主题”、“升级/修复 Antigravity 汉化与字体”、“定制 Antigravity 界面样式或汉化词条”时触发。
---

# 船板的 Antigravity 主题、字体与深度汉化全栈成品补丁（v5.5.0 · 适配 Antigravity 2.33.0+ M1+M2 启动接力 & Google Sans Flex 原生西文引擎）

> **前置概括（致用户与执行端 AI Agent）**：
> - **设计目的**：以纯运行时 CDP 非侵入式注入，为 Google Antigravity（含 **`2.33.0+`** 最新版）提供**白天/黑夜双模式物理隔离与可选预设**：
>   - **白天模式（`body:not(.dark)`）**：提供三套 Anthropic 暖纸护眼配色预设（默认高对比暖白）与输入框「古朴暗红蜡封」三态交互；
>   - **黑夜模式（`body.dark` · 支持 `darkPreset` 双预设与外观设置原生书卷按钮一键切换）**：在「系统设置 → 外观界面 → 主题模式」胶囊的 **☀️ 浅色** 与 **🌙 深色** 之间无损内嵌 **📖 书卷按钮**（`[ 🖥️ | ☀️ | 📖 | 🌙 ]`）——默认 `"darkPreset": "onyx"`（点 **🌙 月亮**）`0ms` 还原官方 `onyx` Default Dark 碳黑配色方案（`#070708` 主背景 / `#111114` 侧栏 / `#2F71E3` 品牌蓝）；点击 **📖 书卷按钮**（或将 `"darkPreset"` 设为 `"claude-warm"`）即可 `0ms` 一键切换至与白天同族的 **「Claude 暖纸深夜」**（`#242320` 暖炭底 / `#1B1A18` 侧栏 / `#F3F0E4` 象牙字 / `#D97757` 陶土暖橙点缀）并自动持久化写回 `user/config.json`；
>   - **全局共享能力**：四层中西文精密排版（**UI 西文直连官方 `Google Sans Flex` 可变字体引擎 × 中文 `AgSarasaUI` 更纱黑体精密字重桥接 + 对话正文 `Anthropic Serif` & `Sarasa Mono Slab SC` 古典衬线 + 代码 `Anthropic Mono` + 输入框打字机粗衬线**，兼容 `2.33.0` 移除 `data-newux-theme="onyx"` 后的新选择器体系与 Windows `DirectWrite` 可变字重轴）、**`2.33.0+` `M1 + M2` 双保险 CDP 启动接力机制**（不改 `.asar` 不破签名，自动部署启动器并在冷启动早期无感补挂 `--remote-debugging-port=0`，严苛保护运行中活跃会话）、**Antigravity 独占宿主指纹先探后注门禁**（豁免内置浏览器本地预览页）、1,860 条全界面母语级去机翻汉化，以及基于 SQLite `O(1)` 增量游标的多路分屏/`/btw` 支线提问/子 Agent 侧栏独立实时会话指标胶囊。
> - **一秒肉眼验真三大特征（防未注入态 `Google Sans Flex` 视觉混淆）**：
>   1. **对话正文与 Artifact 为 `Anthropic Serif` 衬线体**（未注入时退化为无衬线体）；
>   2. **主输入框为打字机板状粗衬线 + `1.5px` 暗红蜡封外框**；
>   3. **输入框底部挂载实时指标胶囊（`.ag-live-metrics-pill`）且全界面呈母语级中文**。
> - **v5.5.0 核心执行铁律**：
>   1. **Agent 一键部署，内核已预封装无需构建**：全部样式、词典、DOM 引擎与守护进程已封装在 `core/` 只读黄金内核中，**严禁 Agent 从头手写或重生成守护代码**，直接运行 `node install.mjs` 即可完成部署；
>   2. **个性化修改永远只在 `user/` 改装层进行（2.5 秒可逆热重载）**：`user/` 目录在升级时 100% 永不覆盖，保存后 2.5 秒自动热更新生效。

---

## 一、核心资源链接与三端官方入口

1. **Google Drive 完全资源包（全项目成品包 + 全套商业/开源字体库）**
   - 链接：<https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC>
   - 包含：**v5.5.0 完整项目成品包 + 全套必备字体包（`Anthropic Serif` / `Anthropic Mono` + 更纱黑体 `Sarasa-SuperTTC.ttc` 超集；`v5.5.0` UI 西文已改用官方内置 `Google Sans Flex` 引擎，不再依赖 `Anthropic Sans`）**。
   - *备用字体获取渠道*：若大文件 `Sarasa-SuperTTC.ttc`（~791 MB）偶发触发 Google Drive 24 小时下载配额限制，macOS 可直接执行 `brew install --cask font-sarasa-gothic`，Windows / Linux 可从官方开源仓库 [`be5invis/Sarasa-Gothic` GitHub Releases](https://github.com/be5invis/Sarasa-Gothic/releases) 获取同款 `Sarasa-SuperTTC.ttc`。
2. **GitHub 权威代码库（成品补丁仓库与 `SKILL.md` 本体）**
   - 仓库：<https://github.com/Anarcadia/chuanban-antigravity-theme-patch>
   - 包含：全部 `core/` 黄金内核、`user/` 改装模板、`install.mjs` CLI 与本 `SKILL.md`（字体文件请从上方 Google Drive 链接下载）。
3. **Notion 引导主页**
   - 链接：<https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554>

### 实机样式基准参考
- **三栏对话与工件视图（高对比暖白 + 暗红蜡封 + 同行实时指标胶囊）**：[`assets/preview-workspace-chat-and-artifact.png`](assets/preview-workspace-chat-and-artifact.png)
- **新建对话首页视图（全界面汉化 + 首页蜡封聚焦态）**：[`assets/preview-home-new-conversation.png`](assets/preview-home-new-conversation.png)

---

## 二、Node.js 动态分级兼容策略

守护进程（`core/daemon.mjs`）内置**运行时环境动态分级**，绝不因 Node 小版本差异崩溃或无限重启：

| 运行时版本 | 昼夜双模式主题 / 蜡封三态 / 四层字体 | 1,860 条深度汉化 + 原型安全词典 | 死锁/冷启动自愈 + M2 端口接力 + 缩放修复 | SQLite 实时会话指标胶囊 (`node:sqlite`) |
| :--- | :---: | :---: | :---: | :---: |
| **Node.js `>= 22.13.0`**（推荐完全体） | ✅ 全量启用 | ✅ 全量启用 | ✅ 全量启用 | ✅ **自动动态解锁**（精确显示生成速度、耗时、上下文窗口与缓存命中率） |
| **Node.js `22.0.0 ~ 22.12.x`** | ✅ 全量启用 | ✅ 全量启用 | ✅ 全量启用 | ⚠️ 自动优雅降级关闭（无需 `--experimental-sqlite` 标志，后台零报错） |
| **Node.js `< 22.0.0`** | ❌ `install.mjs` 拦截提示 | ❌ 需升级至 Node 22+ | — | — |

---

## 三、架构总览：`core/` 只读黄金内核 + `user/` 无损改装层

安装后运行时部署于 `~/.gemini/antigravity/theme-patch/`（macOS / Linux）或 `%USERPROFILE%\.gemini\antigravity\theme-patch\`（Windows）：

```text
chuanban-antigravity-theme-patch/
├── install.mjs                 # 跨平台一键生命周期 CLI（install / relaunch / install-fonts / doctor / verify / rollback / uninstall / pack）
├── SKILL.md                    # 面向 AI Agent 的极简部署与二次改装指南（本文件）
├── README.md                   # 面向用户的项目说明与快速上手指南
├── CHANGELOG.md                # 历次版本演进与双平台修复记录
├── core/                       # 【只读黄金内核】随版本升级整包原子替换，对方 Agent 严禁直接修改
│   ├── manifest.json           # 版本号（5.5.0）、三端地址与 core/* 文件 SHA-256 校验清单
│   ├── daemon.mjs              # Node CDP 守护进程（宿主独占指纹门禁、2.33.0+ M2 冷启动无标记自动接力重启、跨完整性 PID 协作围栏、SQLite O(1) 增量与子 Agent `+N sub` 聚合、WSL2 双轨只读读取、Swarm 子帧注入、2.5s 热重载感知）
│   ├── runtime.js              # 浏览器端注入引擎（宿主指纹门禁与 0ms 防闪白空指针防护、昼夜双预设 `preset`/`darkPreset` 与 curtainView/标题栏联动、Google Sans Flex 防脱靶保底挂载 `#ag-google-sans-flex-fonts`、冷启动兜底包自愈、弯引号与 DICT_CI 索引）
│   ├── theme.css               # 四段式 CSS 样式表（Part I Google Sans Flex × AgSarasaUI 字重桥接、Anthropic Serif 正文与 macOS 浅色全域活字润墨平衡 / Part II 白天暖纸三预设 / Part III 独立黑夜双预设 / Part IV 指标胶囊）
│   └── i18n.json               # 1,860 条严格零冲突标准 JSON 基准词典（兼容 PowerShell ConvertFrom-Json，挂载至 Object.create(null)）
└── user/                       # 【用户改装层】升级时 100% 永不覆盖，守护进程每 2.5s 自动检测 mtimeMs 热重载注入！
    ├── config.json             # 开关配置（enabled / channel / preset / darkPreset / contextLimit / contextLimitOverride / modules / themeVars / darkThemeVars）
    ├── custom.css              # 用户/对方 Agent 自定义追加 CSS（独立挂载于 #antigravity-user-custom-style）
    ├── i18n.override.json      # 用户自定义词条覆盖或新增（支持扁平键值对或 "exact": { ... }，优先级高于 core/i18n.json）
    └── custom.js               # 开放的前端自定义 JS 钩子（支持 ctx.onCleanup(fn) 热重载自动清理）
```

---

## 四、AI Agent 标准部署流程（3 步极简闭环）

当用户要求安装或更新本补丁时，请按顺序执行以下 3 步：

### Step 1：环境与字体前置检查
```bash
node install.mjs doctor
```
- **若缺少字体**：引导用户从 [Google Drive 完全资源包](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 下载字体包并安装（macOS: `~/Library/Fonts/`；Windows: 运行 `node install.mjs install-fonts --from <解压目录>`；Linux: `~/.local/share/fonts/`；若 `Sarasa-SuperTTC.ttc` 遇 Google Drive 限流，macOS 可用 `brew install --cask font-sarasa-gothic`，Windows/Linux 可用 [`be5invis/Sarasa-Gothic` Releases](https://github.com/be5invis/Sarasa-Gothic/releases)）。

### Step 2：一键安装并注册守护服务与 M1 启动器
```bash
# 默认安装（channel="auto"，单守护进程同时自动兼容并守护 Stable 正式版与 Insiders 预览版窗口）
node install.mjs install

# 若需强制锁定只监听单一通道，可显式指定 --channel stable 或 --channel insiders
node install.mjs install --channel stable

# （仅限调试或需重置模板时）先自动备份旧 user/ 至 backups/<timestamp>-user/，再同步最新 user/ 模板
node install.mjs install --sync-user
```
`install.mjs install` 会自动完成：
1. 生成并校验 `core/manifest.json` SHA-256 完整性；
2. 当检测到已安装的 `core/` 与新版本哈希不同时，自动将旧版备份至 `backups/<timestamp>/` 与 `core.prev/`；
3. 原子更新 `core/` 内核，**初始化或无损保留已有的 `user/` 改装文件**；
4. **适配 Antigravity `2.33.0+` 单图标纯净体验与 `M1 + M2` 双保险 CDP 启动机制**：
   - **单图标纯净模式（双平台均零多余图标）**：Windows 自动原地为系统原有的桌面/开始菜单/任务栏 `Antigravity.lnk` 幂等追加 `--remote-debugging-port=0`（Linux 生成 `~/.local/share/applications/antigravity.desktop`）；macOS 默认**不生成第二个应用图标**，保持唯一官方原版图标纯净度（仅在显式传 `--with-launcher` 时才生成带 `LSUIElement` 的可选启动器）；
   - **M2（冷启动自动接力）**：无论在 macOS 直接点击原版 Dock 图标，还是在 Windows 遭遇自动更新器（`--updated`）吞参启动，后台守护进程都会在冷启动前 `12s`（更新重启 `25s`）内自动无感补挂 `--remote-debugging-port=0` 接力重启；同时对运行已超时间窗的存量会话 **100% 豁免绝不强杀**！
   - **注意（防 Agent 自断会话）**：若当前客户端正以无 `--remote-debugging-port` 状态运行（`doctor` 返回 `"cdpStatus": "missing_opt_in_flag"`），如果 Agent 当前就运行在 Antigravity 内部会话中，**请勿在当前回合直接同步调用 `relaunch` 自杀**，而是提示用户在空闲时执行 `node ~/.gemini/antigravity/theme-patch/install.mjs relaunch` 完成一次性平滑重启接力；若在外部独立终端（如 iTerm2 / Windows Terminal / Claude Code CLI）执行，则可直接运行 `node install.mjs relaunch`！
5. 自动生成 `~/.gemini/antigravity/scripts/antigravity-font-daemon.mjs` 兼容包装入口，并注册单一权威系统后台自启服务（macOS `LaunchAgent` / Linux `systemd --user` / Windows `schtasks` 计划任务）。

### Step 3：CDP 实机注入验收
```bash
node install.mjs verify
```
当终端输出 `"ok": true` 且显示 `"version": "20261119-v5.5.0-..."`、`"bodyReady": true`、`"hasStyle": true`、`"themeMode": "light" | "dark"` 时，即代表昼夜双模式主题、字体、汉化与指标胶囊已 100% 注入成功。

---

## 五、对方 Agent 如何协助用户做个性化改装与 Debug？

**黄金铁律**：永远在 `~/.gemini/antigravity/theme-patch/user/` 目录下修改，**无需重启守护进程或 Antigravity**（`core/daemon.mjs` 每 2.5 秒自动感知 `user/*` 文件的 `mtimeMs` 变化并热更新到所有打开的窗口）。

### 1. 修改色彩预设、字号变量或模块开关（编辑 `user/config.json`）
```json
{
  "enabled": true,
  "channel": "auto",
  "preset": "high-contrast",
  "darkPreset": "onyx",
  "contextLimit": 256000,
  "modules": {
    "i18n": true,
    "metrics": true,
    "composerWaxSeal": true,
    "deadlockHealer": true,
    "coldBootHealer": true,
    "zoomShortcuts": true,
    "cdpAutoRelaunch": true,
    "customCss": true,
    "customJs": true
  },
  "themeVars": {
    "--ag-chat-font-size": "16px",
    "--ag-wax-seal-hover": "#74221A",
    "--ag-dark-wax-seal-hover": "rgba(47, 113, 227, 0.72)"
  }
}
```
- **`preset`（白天模式暖纸预设）**：支持 `"high-contrast"`（默认高对比暖白）、`"claude-desktop-purewhite"`（ClaudeDesktop 净白）、`"vintage-deep"`（复古深色羊皮纸），修改保存后 2.5 秒内自动热切换。
- **`darkPreset`（黑夜模式配色预设）**：默认 `"onyx"`（还原官方冷碳黑 `#070708` + `#2F71E3` 品牌蓝）；用户可直接打开客户端「系统设置 → 外观界面 → 主题模式」点击浅色与深色之间的 **📖 书卷按钮** `0ms` 一键切换并自动持久化（或手动设为 `"claude-warm"` / 安装时传 `--dark-preset claude-warm`），启用与白天暖纸同族的 **「Claude 暖纸深夜」**（`#242320` 暖炭底 + `#1B1A18` 侧栏 + `#F3F0E4` 象牙白字 + `#D97757` 陶土暖橙点缀，自动同步原生标题栏、`curtainView` 幕布与 Swarm 子帧）。
- **`contextLimit` / `contextLimitOverride`（上下文水位上限）**：默认自动从当前会话最新生成元数据动态识别真实模型上下文窗口（如 `256k`、`512k`、`840k`、`1M+`）；仅当元数据缺失时回退至 `contextLimit`（默认 `256000`）。如需在所有会话强制锁定自定义水位上限，可在 `user/config.json` 中设置正整数 `"contextLimitOverride": 1000000`，保存后 2.5 秒热重载立即生效。
- **`modules`**：支持单独开关任意子模块（含 `zoomShortcuts` 独立开关）；若将顶层 `"enabled": false` 保存，页面将在 2.5 秒内无损卸载全部样式并将已汉化的界面文字还原为英文原貌。
- **`themeVars` / `darkThemeVars`**：由 `runtime.js` 自动编译注入到独立的 `<style id="ag-user-theme-vars">` 节点（排在 `#ag-custom-fonts` 之后、`#antigravity-user-custom-style` 之前；`themeVars` 中 `--ag-dark-*` 作用于黑夜模式、`--ag-*` 全局排版变量作用于 `:root, body`、普通色彩变量如 `--sidebar` 仅作用于白天模式；如需专门微调黑夜模式任意核心色彩变量，可直接写入可选对象 `"darkThemeVars": { "--background": "#1B1A18" }`）。

### 2. 追加或微调界面 CSS（编辑 `user/custom.css`）
直接编写标准原生 CSS（**零反斜杠转义**），保存后 2.5 秒内自动在页面独立 `<style id="antigravity-user-custom-style">` 节点热生效（排在 `#ag-user-theme-vars` 之后，拥有最高覆盖优先级）。若只针对白天或黑夜微调，请分别加上 `body:not(.dark)` 或 `body.dark` 前缀。

### 3. 覆盖或新增汉化词条（编辑 `user/i18n.override.json`）
支持直接写入扁平键值对 `"英文原词": "自定义中文"`（或包裹在 `"exact": { ... }` 对象中）。由于运行时内置 `WeakMap` 原始英文文本追踪，**无论新增、修改还是删除覆盖词条，保存后 2.5 秒内页面上已渲染的文字都会实时热更新或还原**！

### 4. 编写前端自定义 JS 扩展（编辑 `user/custom.js`）
脚本在独立 `try/catch` 沙箱中执行，可直接访问入参 `ctx`（或同义入参 `boot`）：
- `ctx.version`、`ctx.preset`、`ctx.config`、`ctx.modules`、`ctx.themeVars`、`ctx.dict`、`ctx.metrics`、`ctx.syncPreset()`、`ctx.ensureMetricsPill(true)`、`ctx.onCleanup(fn)`（注册清理回调，在下一轮热重载或卸载前自动执行）。

### 5. 故障隔离、一键回滚与彻底卸载（Safe Mode / Rollback / Uninstall）
```bash
# 启用安全模式：彻底绕过 user/ 层，仅注入纯净 core/ 黄金内核以定位问题
node install.mjs verify --safe-mode

# 查看所有模块的 SHA-256 校验与守护进程状态
node install.mjs doctor

# 一键回滚到上一次自动备份的快照版本并立即重新注入
node install.mjs rollback

# 彻底卸载：先停止守护进程与开机自启服务，再即时还原当前打开窗口的原始样式与英文界面（保留 user/ 配置）
node install.mjs uninstall
```

---

## 六、Windows (`win32`) 平台 Agent 适配与排障专章（最后一公里）

本项目的 `core/` 黄金内核与 `install.mjs` 已原生支持 Windows 平台（含 `pathToFileURL` 反斜杠转换、`127.0.0.1:9222/9223` 端口自动兜底、UTF-16LE 中文用户名 VBS 兼容、单一权威 `schtasks` 计划任务自启、SQLite `O(1)` 增量只读缓存、ClearType 去重影与 `Ctrl + -/=/0` 缩放）。**Windows 端的 AI Agent 严禁从头手写重写 `core/` 代码**，只需协助处理以下「最后一公里」事项：

1. **Windows 字体安装与 DirectWrite 注册表写入（必检）**：
   - 在 Windows 10/11 下，单纯用 `copy` 将 `.ttf/.otf` 复制到 `%LOCALAPPDATA%\Microsoft\Windows\Fonts` 不会写入注册表，导致 Chromium `local()` 找不到字体。下载解压字体目录后，请直接运行内置命令：
     ```bash
     node install.mjs install-fonts --from "C:\path\to\extracted-fonts"
     ```
2. **CDP 调试端口连通性（`2.33.0+` `--remote-debugging-port=0` Opt-in 自动接力）**：
   - Antigravity `2.33.0+` 将内置浏览器切至 `cdpPipe` 后，仅在显式携带 `--remote-debugging-port=0` 启动参数时才生成 `%APPDATA%\Antigravity\DevToolsActivePort`（且 Windows 自动更新器 `quitAndInstall()` 重启时会丢弃快捷方式参数）。`v5.5.0` 通过 **M1**（`install` 自动为桌面/开始菜单/任务栏 `Antigravity.lnk` 追加 `--remote-debugging-port=0`）+ **M2**（守护进程在冷启动 `<=12s` / 更新重启 `<=25s` 早期窗口内自动接力补参重启，且绝不误杀已打开超过窗口期的活跃会话）彻底闭环。若 `doctor` 提示 `"cdpStatus": "missing_opt_in_flag"`，在空闲时执行 `node install.mjs relaunch` 即可一键接力恢复。
3. **第三方安全软件拦截 `.vbs` 自启时的备选方案**：
   - 若用户安装了拦截 `wscript.exe` 的第三方杀毒软件，Agent 可直接用 Windows 任务计划程序注册原生 `node.exe` 登录自启：
     ```powershell
     schtasks /create /tn "AntigravityThemeDaemon" /sc onlogon /tr "\"$env:ProgramFiles\nodejs\node.exe\" --disable-warning=ExperimentalWarning \"$HOME\.gemini\antigravity\scripts\antigravity-font-daemon.mjs\"" /f
     ```
