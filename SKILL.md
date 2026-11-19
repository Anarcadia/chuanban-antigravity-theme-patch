---
name: chuanban-antigravity-theme-patch
description: 船板的 Antigravity 2.0 主题、字体与汉化补丁（v5.5.1 · 适配 Antigravity 2.33.0+ macOS / Windows / Linux 单图标 M1+M2 启动接力 + UI 西文 Google Sans Flex 可变字体引擎 × 中文更纱黑体字重桥接 + 对话正文 Anthropic Serif 衬线 + 昼夜双模式四套预设与外观面板 📖 书卷切换钮 + 宿主独占指纹门禁 + WSL2 双轨只读 SQLite + 1,860 条零冲突词典 + 分屏/支线提问(/btw)/子Agent侧栏独立实时指标胶囊）。采用「core/ 只读内核 + user/ 永不覆盖改装层 + install.mjs CLI」，支持 Agent 一键部署、2.5 秒热重载定制与 --safe-mode 沙箱排障。当用户提到“安装船板 Antigravity 主题”、“升级/修复 Antigravity 汉化与字体”、“定制 Antigravity 界面样式或汉化词条”时触发。
---

# 船板的 Antigravity 主题、字体与汉化补丁（v5.5.1 · AI Agent 部署与改装契约）

> **核心摘要（致执行端 AI Agent）**：
> - **功能边界**：纯运行时本地回环 CDP 注入（不改 `.asar`、不破系统签名、零第三方 npm 依赖），适配 Google Antigravity **`2.33.0+`**：
>   - **昼夜双模式**：白天模式（`body:not(.dark)`）提供三套暖纸预设（默认 `high-contrast`）与 macOS 浅色全域活字润墨；黑夜模式（`body.dark`）在「系统设置 → 外观界面 → 主题模式」嵌入 **📖 书卷按钮**（`[ 🖥️ | ☀️ | 📖 | 🌙 ]`），支持官方冷碳黑 `"onyx"`（默认）与暖纸深夜 `"claude-warm"`（`#242320` 暖炭底 / `#D97757` 陶土橙）`0ms` 切换并自动持久化至 `user/config.json`；
>   - **四层排版与遥测**：UI 西文直连官方 `Google Sans Flex` 可变字体（内置 `#ag-google-sans-flex-fonts` 防脱靶保底）× 中文 `AgSarasaUI` 更纱黑体字重桥接；对话正文采用 `Anthropic Serif` + `Sarasa Mono Slab SC` 衬线；代码采用 `Anthropic Mono` 等宽；输入框采用打字机粗衬线配 `1.5px` 三态蜡封边框；内置 `1,860` 条零冲突汉化与多路分屏/`/btw`/子 Agent 侧栏独立 SQLite 实时指标胶囊。
> - **真注入肉眼验真三特征（防 `2.33.0` 原生 `Google Sans Flex` 视觉假象）**：
>   1. 对话正文与 Markdown 为 `Anthropic Serif` 衬线体（未注入时退化为无衬线体）；
>   2. 主输入框为打字机板状粗衬线 + `1.5px` 暗红蜡封外框；
>   3. 输入框底栏挂载实时指标胶囊（`.ag-live-metrics-pill`）且全界面呈中文。
> - **两条执行红线**：
>   1. **严禁从头手写或篡改 `core/` 内核**：全部样式、词典、DOM 引擎与守护进程已预封装在 `core/`（受 `core/manifest.json` SHA-256 校验保护），直接通过 `node install.mjs` 部署；
>   2. **所有个性化定制仅在 `user/` 层修改**：`user/` 目录升级时永不覆盖，保存后守护进程在 `2.5s` 内自动检测 `mtimeMs` 热重载生效。

---

## 一、核心资源链接与示例基准

1. **Google Drive 资源包（含必备字体）**：<https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC>
   - 必备 4 个字体文件：`AnthropicSerif-Regular.ttf`、`AnthropicSerif-Bold.ttf`、`AnthropicMono-Regular.ttf`、`Sarasa-SuperTTC.ttc`（`v5.5.0` UI 西文直连官方 `Google Sans Flex`，**不再依赖 `AnthropicSans-*.ttf`**）。
   - *限流备选*：若 `Sarasa-SuperTTC.ttc`（~791 MB）触发 Google Drive 24h 下载限额，macOS 直接运行 `brew install --cask font-sarasa-gothic`，Windows / Linux 从 [`be5invis/Sarasa-Gothic` Releases](https://github.com/be5invis/Sarasa-Gothic/releases) 下载同款 `Sarasa-SuperTTC.ttc`。
2. **GitHub 代码仓库**：<https://github.com/Anarcadia/chuanban-antigravity-theme-patch>
3. **Notion 引导页**：<https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554>

### 实机样式基准参考
- **标准浅色主界面视图（高对比书卷暖白工作台 + 衬线正文 + 暗红蜡封输入框）**：[`assets/preview-light-workbench.png`](assets/preview-light-workbench.png)
- **黑夜界面视图（Claude 暖纸深夜模式 + 代码审阅 Diff 视图，支持与官方碳黑一键切换）**：[`assets/preview-dark-workbench.png`](assets/preview-dark-workbench.png)
- **上下文对话信息胶囊视图（同行实时指标胶囊 + 悬停全量调用与缓存遥测详情卡）**：[`assets/preview-metrics-capsule.png`](assets/preview-metrics-capsule.png)

---

## 二、Node.js 运行时分级要求

> **多版本环境提示**：若用户电脑装有 `nvm` / `fnm` / `volta` / Homebrew Node，请优先选用 **`Node.js >= 22.13.0`** 执行 `node install.mjs install`（安装器会将当前 `process.execPath` 绝对路径固化写入系统自启服务）。

| 运行时版本 | 昼夜双模式主题 / 蜡封三态 / 四层字体 | 1,860 条汉化 + 原型安全词典 | 死锁/冷启动自愈 + M2 端口接力 + 缩放修复 | SQLite 实时会话指标胶囊 (`node:sqlite`) |
| :--- | :---: | :---: | :---: | :---: |
| **Node.js `>= 22.13.0`**（推荐） | ✅ 全量启用 | ✅ 全量启用 | ✅ 全量启用 | ✅ **自动启用**（显示速度、耗时、上下文水位与缓存命中率） |
| **Node.js `22.0.0 ~ 22.12.x`** | ✅ 全量启用 | ✅ 全量启用 | ✅ 全量启用 | ⚠️ 自动优雅关闭（后台零报错） |
| **Node.js `< 22.0.0`** | ❌ `install.mjs` 拦截提示 | ❌ 需升级至 Node 22+ | — | — |

---

## 三、目录结构：`core/` 只读内核 + `user/` 无损改装层

运行态默认安装路径：`~/.gemini/antigravity/theme-patch/`（macOS / Linux）或 `%USERPROFILE%\.gemini\antigravity\theme-patch\`（Windows）：

```text
chuanban-antigravity-theme-patch/
├── install.mjs                 # 生命周期 CLI（install / relaunch / install-fonts / doctor / verify / rollback / uninstall / pack）
├── SKILL.md                    # 面向 AI Agent 的部署与二次改装契约（本文件）
├── README.md                   # 面向用户的项目说明与快速上手指南
├── CHANGELOG.md                # 版本演进记录
├── core/                       # 【只读内核】随版本升级原子替换，Agent 严禁直接修改
│   ├── manifest.json           # 版本号（5.5.1）、三端地址与 core/* 四件套 SHA-256 校验清单
│   ├── daemon.mjs              # Node CDP 守护进程（宿主独占指纹门禁、2.33.0+ M2 冷启动自动接力重启、Windows 0.02ms 内存空闲短路与跨完整性 PID 协作围栏、SQLite O(1) 增量与子 Agent `+N sub` 聚合、WSL2 双轨只读读取、Swarm 子帧注入、2.5s 热重载感知）
│   ├── runtime.js              # 浏览器端注入引擎（宿主指纹门禁与 0ms 防闪白、昼夜双预设 `preset`/`darkPreset` 与 curtainView/标题栏联动、Google Sans Flex 防脱靶保底 `#ag-google-sans-flex-fonts`、冷启动兜底包自愈、弯引号与 DICT_CI 索引）
│   ├── theme.css               # 四段式样式表（Part I Google Sans Flex × AgSarasaUI 字重桥接、Anthropic Serif 正文与 macOS 浅色全域活字润墨平衡 / Part II 白天暖纸三预设 / Part III 独立黑夜双预设 / Part IV 指标胶囊）
│   └── i18n.json               # 1,860 条零冲突标准 JSON 基准词典（兼容 PowerShell ConvertFrom-Json，挂载至 Object.create(null)）
└── user/                       # 【用户改装层】升级 100% 保留，守护进程每 2.5s 检测 mtimeMs 热重载注入
    ├── config.json             # 开关配置（enabled / channel / preset / darkPreset / contextLimit / contextLimitOverride / modules / themeVars / darkThemeVars）
    ├── custom.css              # 自定义追加 CSS（独立挂载于 #antigravity-user-custom-style）
    ├── i18n.override.json      # 自定义词条覆盖或新增（支持扁平键值对或 "exact": { ... }，优先级高于 core/i18n.json）
    └── custom.js               # 前端自定义 JS 钩子（支持 ctx.onCleanup(fn) 热重载自动清理）
```

---

## 四、AI Agent 标准部署流程与关键边缘场景处理

### Step 1：环境与字体前置检查
```bash
node install.mjs doctor
```
重点检查输出中的 `fonts.allRequiredInstalled`（以及缺失列表 `fonts.missing`）：
- **若 `fonts.allRequiredInstalled === false`**：
  - 若用户已将字体下载解压到本地（如 `~/Downloads`），**macOS / Windows / Linux 均可直接执行内置命令一键安装**：
    ```bash
    node install.mjs install-fonts --from "<字体所在目录>"
    ```
    *（关键：在 Windows 10/11 下，单纯复制字体文件到用户字体目录不会写 `HKCU\...\Fonts` 注册表，Chromium `local()` 将无法识别字体，**必须**通过 `install-fonts` 写入注册表并广播 `WM_FONTCHANGE`。）*
  - 若尚未下载：引导用户从 [Google Drive 资源包](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 获取（macOS 下 `Sarasa-SuperTTC.ttc` 亦可直接执行 `brew install --cask font-sarasa-gothic`）。
- **若老用户此前使用早期 `v1 ~ v4` 单文件版 `~/.gemini/antigravity/scripts/antigravity-font-daemon.mjs`**：先读取旧文件检查是否有用户手改过的字号或配色值，安装完成后将其迁入 `~/.gemini/antigravity/theme-patch/user/config.json` 或 `user/custom.css`。

### Step 2：安装内核与注册系统常驻服务
```bash
# 默认安装（channel="auto"，单守护进程同时自动兼容 Stable 正式版与 Insiders 预览版窗口）
node install.mjs install

# 可选：安装时直接指定初始白天预设或黑夜预设
node install.mjs install --preset high-contrast --dark-preset claude-warm

# （仅在需要重置 user/ 模板时使用）先备份旧 user/ 至 backups/<timestamp>-user/，再同步最新模板
node install.mjs install --sync-user
```
**关键行为与边缘判读（必读）**：
1. **单图标纯净模式（双平台均无多余图标）**：
   - Windows 自动原地为桌面/公共桌面/开始菜单/任务栏 5 处 `Antigravity.lnk` 幂等追加 `--remote-debugging-port=0`（`"launcherMode": "in-place-lnk"`）；Linux 写入 `~/.local/share/applications/antigravity.desktop`；
   - **macOS 默认不创建第二个 `.app` 图标**：`doctor` / `install` 返回 `"launcherMode": "single-icon-m2-relay"` 且 `"launcherInstalled": false` **属于正常预期设计，切勿误判为安装失败**（仅显式传 `--with-launcher` 时才生成可选启动器）。
2. **Antigravity `2.33.0+` 调试端口接力与防 Agent 自断会话**：
   - Antigravity `2.33.0+` 默认不生成 `DevToolsActivePort`，需携带 `--remote-debugging-port=0` 启动。后台守护进程内置 **M2 冷启动接力**：当用户日常点击原版图标或 Windows 热更新（`--updated`）重启时，守护进程会在冷启动前 `12s`（更新重启 `25s`）内自动无感补参重拉，且**对运行已超时间窗的存量会话 100% 豁免绝不强杀**。
   - **若 `install` 或 `doctor` 返回 `"cdpStatus": "missing_opt_in_flag"`**：
     - **场景 A（当前 Agent 正运行在 Antigravity 内部对话中）**：**严禁加 `--force` 同步调用 `relaunch` 自杀中断当前回复！**（不带 `--force` 调用也会被 15 秒 `.db-wal` 活跃会话门禁以退出码 `2` 安全拦截）。请直接告知用户补丁与后台守护已部署就绪，等本轮对话结束后**手动退出重开一次 Antigravity**（`M2` 将自动接力），或在外部终端执行：
       - macOS / Linux：`node ~/.gemini/antigravity/theme-patch/install.mjs relaunch`
       - Windows PowerShell：`node "$HOME\.gemini\antigravity\theme-patch\install.mjs" relaunch`
     - **场景 B（当前 Agent 运行在外部独立终端，如 Claude Code / Codex / iTerm2 / Windows Terminal，且 Antigravity 无正在输出的对话）**：可直接运行 `node install.mjs relaunch` 自动完成平滑重启与重注。

### Step 3：CDP 实机注入验收
```bash
node install.mjs verify
```
当输出 `"ok": true`、`"bodyReady": true`、`"hasStyle": true`、`"dictCount": 1860` 时，代表主题、字体、汉化与指标胶囊已全部实机生效。

---

## 五、个性化改装与故障排障规范

永远在 `~/.gemini/antigravity/theme-patch/user/`（Windows 为 `%USERPROFILE%\.gemini\antigravity\theme-patch\user\`）下修改，**无需重启守护进程或客户端**（保存后 `2.5s` 自动热生效）。

### 1. 修改配色预设、字号变量或模块开关（`user/config.json`）
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
- **`preset`（白天暖纸预设）**：`"high-contrast"`（默认高对比暖白）、`"claude-desktop-purewhite"`（ClaudeDesktop 净白）、`"vintage-deep"`（复古羊皮纸）。
- **`darkPreset`（黑夜配色预设）**：默认 `"onyx"`（官方冷碳黑）；设为 `"claude-warm"`（或在客户端「系统设置 → 外观界面」点击 **📖 书卷按钮**）启用暖纸深夜并自动持久化。
- **`contextLimit` / `contextLimitOverride`**：默认从会话元数据动态识别真实模型上下文窗口（`256k` / `512k` / `840k` / `1M+`），缺失时回退 `contextLimit`；如需全局强制锁定固定上限，可设正整数 `"contextLimitOverride": 1000000`。
- **`modules`**：支持独立开关各模块（如设 `"cdpAutoRelaunch": false` 关闭冷启动自动补参重拉，或将顶层 `"enabled": false` 保存以在 `2.5s` 内无损卸载全部样式并还原英文界面）。
- **`themeVars` / `darkThemeVars`**：自动注入 `<style id="ag-user-theme-vars">`；普通色彩变量（如 `--sidebar`）仅作用于白天模式，如需微调黑夜模式核心色彩变量请写入可选对象 `"darkThemeVars": { "--background": "#1B1A18" }`。

### 2. 追加自定义 CSS（`user/custom.css`）
编写标准原生 CSS（零反斜杠转义），保存后 `2.5s` 自动挂载于最高优先级的 `<style id="antigravity-user-custom-style">`；仅针对单模式微调时请加 `body:not(.dark)` 或 `body.dark` 前缀。

### 3. 覆盖或新增汉化词条（`user/i18n.override.json`）
写入扁平键值对 `"英文原词": "自定义中文"`（或包裹在 `"exact": { ... }` 中）。得益于 `WeakMap` 原文追踪，新增、修改或删除词条后 `2.5s` 内页面已渲染文字均实时更新或还原。

### 4. 前端自定义 JS 扩展（`user/custom.js`）
在独立 `try/catch` 沙箱执行，入参 `ctx` 提供 `ctx.version`、`ctx.preset`、`ctx.config`、`ctx.modules`、`ctx.dict`、`ctx.metrics`、`ctx.syncPreset()`、`ctx.ensureMetricsPill(true)` 与 `ctx.onCleanup(fn)`。

### 5. 故障定界、回滚与卸载
```bash
# 安全模式：绕过 user/ 层仅注入纯净 core/ 内核，快速定界是否为自定义配置冲突
node install.mjs verify --safe-mode

# 检查环境、字体完整性、进程参数、core/* SHA-256 与窗口实时状态
node install.mjs doctor

# 一键回滚至上一次自动备份的快照版本并立即重注
node install.mjs rollback

# 卸载：停止自启服务与后台守护进程，并将当前已打开窗口即时还原为官方原貌（保留 user/ 配置）
node install.mjs uninstall
```

---

## 六、平台专项排障要点（Windows / macOS）

1. **Windows 杀毒软件拦截 `wscript.exe` 自启时的无黑框备选注册**：
   - `install.mjs` 默认以非提权中完整性（`ME` SDDL）注册 `AntigravityThemeDaemon` 计划任务调用静默 `.vbs`。若第三方安全软件拦截 `wscript.exe`，改用 `powershell.exe -WindowStyle Hidden` 并显式加 `/RL LIMITED`（防止高完整性任务产生 `.pid` 权限锁冲突）：
     ```powershell
     schtasks /create /tn "AntigravityThemeDaemon" /sc onlogon /rl LIMITED /tr "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command \"& '$env:ProgramFiles\nodejs\node.exe' --disable-warning=ExperimentalWarning '$HOME\.gemini\antigravity\scripts\antigravity-font-daemon.mjs'\"" /f
     ```
2. **Windows WSL2 远程工作区指标胶囊说明**：
   - 守护进程会自动从注册表 `Lxss` 识别默认 WSL2 发行版，对历史库采用四斜杠只读 URI、对活跃 `-wal` 会话库采用临时快照双轨读取，并在 UNC 不可达时自动触发 `45s` `0-I/O` 熔断避免唤醒休眠虚拟机。
3. **macOS 中文会话标题外挂权限说明（可选）**：
   - 若用户本机额外部署了可选脚本 `antigravity-zh-title-patch.py`，客户端升级后若指标胶囊旁出现提示小点，悬停胶囊点击「复制命令」在终端执行一次即可恢复（未部署该外挂的用户无任何影响）。
