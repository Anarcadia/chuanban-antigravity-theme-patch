---
name: chuanban-antigravity-theme-patch
description: 船板的 Antigravity 2.0 主题、字体与深度汉化全栈成品补丁包（v5.0.0 模块化架构）。采用「core/ 只读黄金内核 + user/ 永不覆盖改装层 + install.mjs 一键生命周期 CLI」，支持对方 Agent 零代码生成一键部署、2.5 秒热重载二次定制与 --safe-mode 沙箱排障。当用户提到“安装船板 Antigravity 主题”、“升级/修复 Antigravity 汉化与字体”、“定制 Antigravity 界面样式或汉化词条”时触发。
---

# 船板的 Antigravity 主题、字体与深度汉化全栈成品补丁（v5.0.0）

> **前置概括（致用户与执行端 AI Agent）**：
> - **设计目的**：以纯运行时 CDP 非侵入式注入，为 Google Antigravity 提供三套 Anthropic 暖纸护眼配色预设（默认高对比暖白）、四层中西文精密排版（`Anthropic` 官方字体族 + `Sarasa` 更纱黑体超集 Solid Ink 润墨）、输入框「古朴暗红蜡封」三态解耦交互、450 条全界面无死角汉化及同行实时会话指标胶囊（`tok/s · TTFT · Ctx 256k 水位 · Out`）。
> - **v5.0.0 核心特性**：
>   1. **Agent 一键部署，内核封装完毕无需构建**：全部样式、词典、DOM 引擎与守护进程已预封装在 `core/` 只读黄金内核中，**严禁 Agent 从头手写或重生成守护代码**，直接调用 `node install.mjs` 即可 3 秒完成部署；
>   2. **开放 `user/` 独立改装层（2.5 秒可逆热重载）**：用户后续可随时与 Agent 对话，在永不随升级覆盖的 `user/` 目录内自定义风格、字号、词条或通过 `--safe-mode` / `rollback` 自我 Debug；
>   3. **不改变程序本体且小版本更新不失效**：绝不修改 Antigravity 客户端二进制与 `.asar`，依靠系统常驻守护服务自动重连注入，客户端日常小幅更新后依然自动生效（同进程兼容 Stable 与 Insiders）。

---

## 一、核心资源链接与三端官方入口

1. **Notion 官方主页（主介绍、版本历程与部署引导页）**
   - 链接：<https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554>
2. **Google Drive 完全资源包（全项目成品包 + 全套商业/开源字体库）**
   - 链接：<https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC>
   - 包含：**v5.0.0 完整项目成品包 + 全套必备字体包（Anthropic 官方字体族 `Anthropic Sans` / `Anthropic Serif` / `Anthropic Mono` + 更纱黑体 `Sarasa-SuperTTC.ttc` 超集）**。
3. **GitHub 权威代码库（成品补丁仓库与 `SKILL.md` 本体）**
   - 仓库：<https://github.com/Anarcadia/chuanban-antigravity-theme-patch>
   - 包含：全部 `core/` 黄金内核、`user/` 改装模板、`install.mjs` CLI 与本 `SKILL.md`（字体文件请从上方 Google Drive 链接下载）。

---

## 二、Node.js 动态分级兼容策略

守护进程（`core/daemon.mjs`）内置**运行时环境动态分级**，绝不因 Node 小版本差异崩溃或无限重启：

| 运行时版本 | 主题 / 蜡封设计 / 字体排版 | 450 条深度汉化 + 原型安全词典 | 死锁自愈 + 缩放快捷键修复 | SQLite 实时会话指标胶囊 (`node:sqlite`) |
| :--- | :---: | :---: | :---: | :---: |
| **Node.js `>= 22.13.0`**（推荐完全体） | ✅ 全量启用 | ✅ 全量启用 | ✅ 全量启用 | ✅ **自动动态解锁**（精确显示模型名、耗时、上下文窗口与真实缓存命中率） |
| **Node.js `22.0.0 ~ 22.12.x`** | ✅ 全量启用 | ✅ 全量启用 | ✅ 全量启用 | ⚠️ 自动优雅降级关闭（无需 `--experimental-sqlite` 标志，后台零报错） |
| **Node.js `< 22.0.0`** | ❌ `install.mjs` 拦截提示 | ❌ 需升级至 Node 22+ | — | — |

---

## 三、架构总览：`core/` 只读黄金内核 + `user/` 无损改装层

安装后运行时部署于 `~/.gemini/antigravity/theme-patch/`（macOS / Linux）或 `%USERPROFILE%\.gemini\antigravity\theme-patch\`（Windows）：

```text
chuanban-antigravity-theme-patch/
├── install.mjs                 # 跨平台一键生命周期 CLI（install / doctor / verify / rollback / uninstall）
├── SKILL.md                    # 面向 AI Agent 的极简部署与二次改装指南（本文件）
├── README.md                   # 项目说明与三端获取指南
├── core/                       # 【只读黄金内核】随版本升级整包原子替换，对方 Agent 严禁直接修改
│   ├── manifest.json           # 版本号、三端地址与 core/* 文件 SHA-256 校验清单
│   ├── daemon.mjs              # Node CDP 守护进程（动态 SQLite 分级、2.5s 热重载感知、PID 锁、Stable+Insiders 同进程双通道守护）
│   ├── runtime.js              # 纯正浏览器端注入引擎（零模板转义，含 WeakMap 热重载还原、O(N·深度) 脏根节流、死锁自愈）
│   ├── theme.css               # 纯正多行 CSS 样式表（挂载于 #ag-custom-fonts，含暖纸浅色、输入框 C/A/B 蜡封三态解耦）
│   └── i18n.json               # 450 条标准 JSON 汉化基准词典（运行时挂载至 Object.create(null) 免疫原型键冲突）
└── user/                       # 【用户改装层】升级时 100% 永不覆盖，守护进程每 2.5s 自动检测 mtimeMs 热重载注入！
    ├── config.json             # 开关配置（enabled / channel / preset / modules(或 features) / themeVars 变量覆盖）
    ├── custom.css              # 用户/对方 Agent 自定义追加 CSS（独立挂载于 #antigravity-user-custom-style）
    ├── i18n.override.json      # 用户自定义词条覆盖或新增（支持扁平键值对或 "exact": { ... }，优先级高于 core/i18n.json）
    └── custom.js               # 开放的前端自定义 JS 钩子（在 core/runtime.js 之后于独立 try/catch 沙箱内安全执行）
```

---

## 四、AI Agent 标准部署流程（3 步极简闭环）

当用户要求安装或更新本补丁时，请按顺序执行以下 3 步：

### Step 1：环境与字体前置检查
运行一键体检命令，检查 Node.js 版本、字体安装情况与 Antigravity CDP 端口状态：
```bash
node install.mjs doctor
```
- **若缺少字体**：引导用户从 [Google Drive 完全资源包](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 下载字体包并安装到系统字体目录（macOS: `~/Library/Fonts/`；Windows: `%LOCALAPPDATA%\Microsoft\Windows\Fonts\`；Linux: `~/.local/share/fonts/`）。

### Step 2：一键安装并注册守护服务
```bash
# 默认安装（channel="auto"，单守护进程同时自动兼容并守护 Stable 正式版与 Insiders 预览版窗口）
node install.mjs install

# 若需强制锁定只监听单一通道，可显式指定 --channel stable 或 --channel insiders
node install.mjs install --channel stable
```
`install.mjs install` 会自动完成：
1. 生成并校验 `core/manifest.json` SHA-256 完整性；
2. 当检测到已安装的 `core/` 与新版本哈希不同时，自动将旧版备份至 `~/.gemini/antigravity/theme-patch/backups/<timestamp>/` 与 `core.prev/`（重复安装同一版本不会冲掉上一版快照）；
3. 原子更新 `core/` 内核，**初始化或无损保留已有的 `user/` 改装文件**；
4. 自动检查并修补 `~/.antigravity/argv.json`（及 `~/.antigravity-insiders/argv.json`，注入 `"remote-debugging-port": 9222`）；
5. 自动生成 `~/.gemini/antigravity/scripts/antigravity-font-daemon.mjs` 兼容包装入口，并注册/更新系统后台自启服务（macOS `LaunchAgent` / Linux `systemd --user` / Windows Startup VBS）。

### Step 3：CDP 实机注入验收
确保 Antigravity 客户端正在运行，执行实机验证：
```bash
node install.mjs verify
```
当终端输出 `"ok": true` 且显示 `"version": "20261104-v5.0.0-..."`、`"themeStyle": true` 时，即代表主题、字体、汉化与指标胶囊已 100% 注入成功。

---

## 五、对方 Agent 如何协助用户做个性化改装与 Debug？

**黄金铁律**：永远在 `~/.gemini/antigravity/theme-patch/user/` 目录下修改，**无需重启守护进程或 Antigravity**（`core/daemon.mjs` 每 2.5 秒自动感知 `user/*` 文件的 `mtimeMs` 变化并热更新到所有打开的窗口）。

### 1. 修改色彩预设、字号变量或模块开关（编辑 `user/config.json`）
```json
{
  "enabled": true,
  "channel": "auto",
  "preset": "high-contrast",
  "contextLimit": 256000,
  "modules": {
    "i18n": true,
    "metrics": true,
    "composerWaxSeal": true,
    "deadlockHealer": true,
    "customCss": true,
    "customJs": true
  },
  "themeVars": {
    "--ag-chat-font-size": "16px",
    "--ag-wax-seal-hover": "rgba(122, 31, 26, 0.88)"
  }
}
```
- **`preset`**：支持 `"high-contrast"`（默认高对比暖白）、`"claude-desktop-purewhite"`（ClaudeDesktop 净白）、`"vintage-deep"`（复古深色羊皮纸），修改保存后 2.5 秒内自动热切换。
- **`modules`（亦兼容别名 `features`，其中 `metrics` 兼容别名 `metricsCapsule`）**：支持单独开关任意子模块；若将顶层 `"enabled": false` 保存，页面将在 2.5 秒内无损卸载全部样式并将已汉化的界面文字还原为英文原貌。
- **`themeVars`**：任何 CSS 变量键值都会自动挂载到 `document.documentElement`（`<html>` 根节点），删除键时自动清理。

### 2. 追加或微调界面 CSS（编辑 `user/custom.css`）
直接编写标准原生 CSS（**零反斜杠转义**），保存后 2.5 秒内自动在页面独立 `<style id="antigravity-user-custom-style">` 节点热生效（排在 `#ag-custom-fonts` 之后，优先级更高）。

### 3. 覆盖或新增汉化词条（编辑 `user/i18n.override.json`）
支持直接写入扁平键值对 `"英文原词": "自定义中文"`（或包裹在 `"exact": { ... }` 对象中）。由于运行时内置 `WeakMap` 原始英文文本追踪，**无论新增、修改还是删除覆盖词条，保存后 2.5 秒内页面上已渲染的文字都会实时热更新或还原**！

### 4. 编写前端自定义 JS 扩展（编辑 `user/custom.js`）
`user/custom.js` 已完全开放！脚本在独立 `try/catch` 沙箱中执行，可直接访问入参 `ctx`（或同义入参 `boot`）：
- `ctx.version`、`ctx.preset`、`ctx.config`、`ctx.modules`、`ctx.themeVars`、`ctx.dict`、`ctx.metrics`。

### 5. 故障隔离与一键回滚（Safe Mode & Rollback）
如果用户编写的 `user/custom.css` 或 `user/custom.js` 导致页面显示异常，对方 Agent 只需运行：
```bash
# 启用安全模式：彻底绕过 user/ 层，仅注入纯净 core/ 黄金内核以定位问题
node install.mjs verify --safe-mode

# 查看所有模块的 SHA-256 校验与守护进程状态
node install.mjs doctor

# 一键回滚到上一次自动备份的快照版本并立即重新注入
node install.mjs rollback
```

---

## 六、Windows (`win32`) 平台 Agent 适配与排障专章（最后一公里）

本项目的 `core/` 黄金内核与 `install.mjs` 已原生支持 Windows 平台（含 `pathToFileURL` 反斜杠转换、`127.0.0.1:9222` 端口自动兜底、UTF-16LE 中文用户名 VBS 兼容、后台 `windowsHide` 立即拉起、SQLite 文件锁缓存防闪烁、ClearType 去重影与 `Ctrl + -/=/0` 缩放）。**Windows 端的 AI Agent 严禁从头手写重写 `core/` 代码**，只需在遇到宿主环境差异时协助处理以下「最后一公里」事项：

1. **Windows 字体安装与 DirectWrite 注册表写入（必检）**：
   - 在 Windows 10/11 下，单纯用 `copy` 将 `.ttf/.otf` 复制到 `%LOCALAPPDATA%\Microsoft\Windows\Fonts` 不会写入注册表，导致 Chromium `local()` 找不到字体。
   - **标准操作**：下载并解压字体目录后，请直接运行内置的一键字体安装与注册表写入命令：
     ```bash
     node install.mjs install-fonts --from "C:\path\to\extracted-fonts"
     ```
2. **首次开启 CDP 端口 (`9222`) 后的客户端重启**：
   - `node install.mjs install` 会自动在 `%USERPROFILE%\.antigravity\argv.json` 中注入 `"remote-debugging-port": 9222`。
   - 若安装前 Antigravity 已经处于打开状态，首次修补 `argv.json` 后需引导用户**完全退出并重新打开一次 Antigravity**（或帮用户在 Antigravity 桌面快捷方式 `.lnk` 的目标末尾追加 `--remote-debugging-port=9222`），之后 `node install.mjs verify` 即可自动连通 `DevToolsActivePort` 或 `127.0.0.1:9222`。
3. **第三方安全软件拦截 `.vbs` 自启时的备选方案**：
   - `install.mjs` 默认同时通过 `Startup\AntigravityThemeDaemon.vbs`、`HKCU\...\Run` 注册表以及 detached `node.exe` 子进程启动守护。
   - 若用户安装了拦截 `wscript.exe` 的第三方杀毒软件，Agent 可直接用 Windows 任务计划程序注册原生 `node.exe` 登录自启：
     ```powershell
     schtasks /create /tn "AntigravityThemeDaemon" /sc onlogon /tr "\"$env:ProgramFiles\nodejs\node.exe\" --disable-warning=ExperimentalWarning \"$HOME\.gemini\antigravity\scripts\antigravity-font-daemon.mjs\"" /f
     ```

---

## 七、设计亮点速览（v5.0.0 内核特性）

1. **输入框「蜡封三态」零延迟纯 CSS 解耦（设计 C / A / B）**：
   - **场景二（首页新建对话 / Home Splash & New Conversation）**：日常状态为 **设计 C**（外框完全透明 `rgba(122, 31, 26, 0)`，保持首页极简呼吸感）；鼠标移上或打字聚焦时平滑浮现为 **设计 A**（`1.5px` 淡雅暗红蜡封线 `rgba(122, 31, 26, 0.34)` + 微暖晕染）。
   - **场景一（日常推进具体聊天会话）**：日常常驻 **设计 A**（`1.5px` 略粗偏淡古朴蜡封线）；鼠标移上或聚焦时进阶为 **设计 B**（`2px` 浓郁古朴暗红蜡封 `--ag-wax-seal-hover` + 双层内嵌微光）。
   - **0ms 切换**：完全依靠组件级现代 CSS `:has([data-testid="branch-pill-trigger"], [aria-label^="Select project"], [aria-label^="选择项目"])` 与 `html:has([data-testid="home-greeting"])` 解耦，彻底消除 JS 轮询延迟。
2. **原型安全、WeakMap 可逆热重载与 O(N·深度) 高性能 DOM 汉化引擎**：
   - 词典采用 `Object.create(null)` 空原型哈希表，彻底免疫 `toString` / `valueOf` / `constructor` 等原型链属性冲突。
   - 采用 `WeakMap` 记录被汉化节点的原始英文文本，支持热重载增删改词条及无损卸载还原。
   - `MutationObserver` 采用 `requestAnimationFrame` + `80ms setTimeout` 双重触发（防止窗口最小化至后台时 `dirtyRoots` 无限堆积），配合祖先链 `O(N·深度)` 去重与单帧 200 节点熔断。
3. **精准会话指标胶囊（Metrics Capsule）**：
   - 基于 `node:sqlite` 只读解析 `${cascadeId}.db`（`gen_metadata` / `steps` 表）与 `.db-wal` 增量签名，并在计算每轮耗时与步数时过滤 `0` 用量异常元数据记录，采用最后一轮 `USER_INPUT` 后的真实规划步数切片 `valid.slice(-rawTurnSteps)`，消除索引错位。
4. **三套色彩预设热切换与 React 白屏崩溃防护**：
   - 内置 `high-contrast`（高对比暖白）、`claude-desktop-purewhite`（净白）、`vintage-deep`（复古深色）三套预设联动，并拦截非法 `theme-preset-light` 存储值防止 Antigravity 原生主题选择器崩溃。
