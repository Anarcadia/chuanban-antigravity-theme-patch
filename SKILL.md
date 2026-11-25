---
name: chuanban-antigravity-theme-patch
description: 船板的 Antigravity 2.0 主题、字体与汉化补丁（v6.0.3 · 适配 Antigravity 2.35.1+ / 2.35.0 / 2.34.0+ macOS / Windows / Linux 单图标 M1+M2 零子进程空闲短路启动接力与 OS 分层参数/代理保留 + Windows TimeTrigger 5 分钟全时段保活 + 一键自动直链字体下载/ZIP 解压与 Windows UTF-16 注册表写入 + 全新默认「莫兰迪古典矿物 (morandi)」冷暖互补配色体系与烟岚石青单层合并输入框 + 外观面板五段式主题秒切 `[ A 原版配色 | ✳️ Absolutely！ | MO 莫兰迪色 | 📖 暖纸深色 | 🌙 深色 ]` 与独立「跟随系统」日夜配对开关 + 外观 `[ EN | 中文 ]` 一键零重刷语言切换 + UI 西文 Google Sans Flex 可变字体引擎 × 中文更纱黑体映射 + 对话正文 Anthropic Serif 衬线 + 2,210 条零冲突词典 + Swarm 1.5s 轮询零闪烁翻译护盾 + 分屏/支线提问(/btw)/子Agent侧栏独立实时指标胶囊 + 系统设置「本地扩展 → Token 统计」磁盘持久化毫秒级分析面板）。采用「core/ 只读内核 + user/ 永不覆盖改装层 + install.mjs CLI」，支持 Agent 一键部署、2.5 秒热重载定制与 --safe-mode 沙箱排障。当用户提到“安装船板 Antigravity 主题”、“升级/修复 Antigravity 汉化与字体”、“定制 Antigravity 界面样式或汉化词条”时触发。
---

# 船板的 Antigravity 主题、字体与汉化补丁（v6.0.3 · AI Agent 部署与改装契约）

> **核心摘要（致执行端 AI Agent）**：
> - **功能边界**：纯运行时本地回环 CDP 注入（不改 `.asar`、不破系统签名、零第三方 npm 依赖），适配 Google Antigravity **`2.35.1+` / `2.35.0` / `2.34.0+`**：
>   - **五段式主题、跟随系统开关与双语热切换**：默认启用 **`"morandi"`（莫兰迪古典矿物：暖宣纸底 × 烟岚石青单层 `2px` 输入框与按钮）**；在「系统设置 → 外观界面」嵌入 **`[ A 原版配色 | ✳️ Absolutely！ | MO 莫兰迪色 | 📖 暖纸深色 | 🌙 深色 ]`** 五段式切换（`A` 原版配色 `<1ms` 零开销回退官方配色与原版字体）、独立 **「跟随系统」** 日夜配对开关（保留浅色 `preset` 与深色 `darkPreset` 配对，点击相反极性预设即时预览并自动退出跟随）及独立 **`[ EN | 中文 ]`** 二元语言切换（`EN` 态观察器零开销休眠），自动持久化至 `user/config.json` 并同步 Windows 原生标题栏（含 `--custom-window-controls` 高对比自绘控制键）与 `Swarm` 子帧；
>   - **四层排版与双层遥测**：UI 西文直连官方 `Google Sans Flex` 可变字体（`#ag-font-faces` 常驻隔离防切换缺字）× 中文 `AgSarasaUI` 更纱黑体字重桥接；对话正文采用 `Anthropic Serif` + `Sarasa Mono Slab SC` 衬线；代码与 `.inline-pill[data-uri]` 文件胶囊采用 `Anthropic Mono` 等宽；输入框采用打字机粗衬线配 `2px` 单层合并边框；内置 `2,210` 条零冲突汉化（含 Swarm 面板 `1.5s` 轮询零闪烁实例级护盾）、多路分屏/`/btw`/子 Agent 侧栏独立 SQLite 实时指标胶囊（`260ms` 悬浮意图防误触 + Remote SSH 无本地库自动隐身），以及「系统设置 → 本地扩展 → Token 统计」全量多维归因面板（支持 `modules.tokenAnalytics: false` 动态裁剪 ~100 KB 载荷）。
> - **真注入肉眼验真三特征（防 `2.33.0` 原生 `Google Sans Flex` 视觉假象）**：
>   1. 对话正文与 Markdown 为 `Anthropic Serif` 衬线体（`A` 原版配色除外）；
>   2. 主输入框为单层 `2px` 合并粗线（`MO` 下为烟岚石青 `#A3B5BA → #3D6470`，`Absolutely！` 下为暖橙火漆 `#DFAC98 → #A64229`）；
>   3. 输入框底栏挂载实时指标胶囊（`.ag-live-metrics-pill`），外观面板显示五段式主题与 `界面语言 [ EN | 中文 ]` 行。
> - **两条执行红线**：
>   1. **严禁从头手写或篡改 `core/` 内核**：全部样式、词典、DOM 引擎与守护进程已预封装在 `core/`（受 `core/manifest.json` SHA-256 校验保护），直接通过 `node install.mjs` 部署；
>   2. **所有个性化定制仅在 `user/` 层修改**：`user/` 目录升级时永不覆盖，保存后守护进程在 `2.5s` 内自动检测 `mtimeMs` 热重载生效。

---

## 一、核心资源链接与示例基准

1. **多源字体镜像与资源包（已接入 Cloudflare R2 主源 + GitHub Release 备源 + Google Drive 兜底）**：
   - 必备字体：`AnthropicSerif-Regular.ttf`、`AnthropicSerif-Bold.ttf`、`AnthropicMono-Regular.ttf`，以及更纱黑体中文包（`v5.5.0` UI 西文直连官方 `Google Sans Flex`，**不再依赖 `AnthropicSans-*.ttf`**）。
   - **全平台首选一键自动下载与安装**：`install.mjs` 内置多镜像自动回退下载器（优先走 **Cloudflare R2** `https://img.chuanban.cc/fonts/chuanban-suite/`，更纱黑体自动按 **Cloudflare R2 → GitHub Release (`fonts-sarasa-v1.0.43`) → Google Drive** 顺序切换；遇到 Google Drive 配额超限 HTML 页立即熔断切源并强制校验二进制魔数与 SHA-256，Windows 自动探测系统代理并自动解压 `.zip`），直接运行 **`node install.mjs install-fonts --auto-download`**（Windows 退订旧 `SuperTTC` 加 `--retire-super-ttc`；如需指定优先源可加 `--mirror cloudflare-r2|github-release|google-drive`）即可补齐全部缺失字体。
   - **手动下载兜底（Windows 强烈推荐拆分版 SC TTF）**：若终端网络受限需走浏览器手动下载，优先从 **[Cloudflare R2 直链 (`Windows-Sarasa-Split-SC-TTF-v1.0.43.zip`)](https://img.chuanban.cc/fonts/chuanban-suite/Windows-Sarasa-Split-SC-TTF-v1.0.43.zip)** 或 **[GitHub Release 镜像 (`fonts-sarasa-v1.0.43`)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/releases/tag/fonts-sarasa-v1.0.43)** 下载 170 MB 拆分版更纱黑体（含 `SarasaUiSC` + `SarasaMonoSlabSC` 共 14 个 SC 字重 `.ttf`，避免 791 MB `Sarasa-SuperTTC.ttc` 在 DirectWrite/Chromium 引起卡顿与 >2GB 虚存占用，见 #19），3 个 `Anthropic*.ttf` 可从 `https://img.chuanban.cc/fonts/chuanban-suite/` 或 [Google Drive 共享目录](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 获取；无需手动解压即可运行 `node install.mjs install-fonts --from "<下载目录或.zip路径>" --retire-super-ttc`（macOS 更纱黑体亦可用 `brew install --cask font-sarasa-gothic`）。
2. **GitHub 代码仓库**：<https://github.com/Anarcadia/chuanban-antigravity-theme-patch>
3. **Notion 引导页**：<https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554>

### 实机样式基准参考
- **默认莫兰迪浅色主界面视图（暖宣纸画布 + 烟岚石青单线输入框 + 实时遥测悬停详情卡）**：[`assets/preview-morandi-workbench.png`](assets/preview-morandi-workbench.png)
- **外观五段式皮肤预设与 `[ EN | 中文 ]` 语言切换视图**：[`assets/preview-theme-lang-switcher.png`](assets/preview-theme-lang-switcher.png)
- **`Absolutely！` 主题主界面视图（书卷暖白高对比工作台 + 暖橙蜡封输入框 + 子 Agent 副栏汉化）**：[`assets/preview-absolutely-workbench.png`](assets/preview-absolutely-workbench.png)
- **黑夜界面视图（暖纸深色 / 深海碳黑 + 代码审阅 Diff 视图）**：[`assets/preview-dark-workbench.png`](assets/preview-dark-workbench.png)

---

## 二、Node.js 运行时分级要求

> **多版本环境提示**：若用户电脑装有 `nvm` / `fnm` / `volta` / Homebrew Node，请优先选用 **`Node.js >= 22.13.0`** 执行 `node install.mjs install`（安装器会将当前 `process.execPath` 绝对路径固化写入系统自启服务）。

| 运行时版本 | 五段式主题 + 跟随系统 / 单线矿物框 / 四层字体 | 2,210 条汉化 + `[ EN \| 中文 ]` 零重刷切换 | 死锁/冷启动自愈 + M2 端口与参数接力 + 缩放修复 | SQLite 实时指标胶囊 + 设置「Token 统计」 (`node:sqlite`) |
| :--- | :---: | :---: | :---: | :---: |
| **Node.js `>= 22.13.0`**（推荐） | ✅ 全量启用 | ✅ 全量启用 | ✅ 全量启用 | ✅ **自动启用**（实时胶囊 + 全量多维 Token 归因统计） |
| **Node.js `22.0.0 ~ 22.12.x`** | ✅ 全量启用 | ✅ 全量启用 | ✅ 全量启用 | ⚠️ 自动优雅关闭（后台零报错） |
| **Node.js `< 22.0.0`** | ❌ `install.mjs` 拦截提示 | ❌ 需升级至 Node 22+ | — | — |

---

## 三、目录结构：`core/` 只读内核 + `user/` 无损改装层

运行态默认安装路径：`~/.gemini/antigravity/theme-patch/`（macOS / Linux）或 `%USERPROFILE%\.gemini\antigravity\theme-patch\`（Windows）：

```text
chuanban-antigravity-theme-patch/
├── install.mjs                 # 生命周期 CLI（install / relaunch / download-fonts / install-fonts / doctor / verify / rollback / uninstall / pack）
├── SKILL.md                    # 面向 AI Agent 的部署与二次改装契约（本文件）
├── README.md                   # 面向用户的项目说明与快速上手指南
├── CHANGELOG.md                # 版本演进记录
├── LICENSE                     # MIT 开源许可协议
├── core/                       # 【只读内核】随版本升级原子替换，Agent 严禁直接修改
│   ├── manifest.json           # 版本号（6.0.3）、三端地址与 core/* 四件套 SHA-256 校验清单
│   ├── daemon.mjs              # Node CDP 守护进程（宿主独占指纹门禁、2.33.0+~2.35.1+ M2 冷启动自动接力重启与 OS 分层启动参数/Windows 系统代理保留、Windows .lnk 限深更新自愈、NTFS 原子写盘退避防锁、SingletonLock/lockfile 全平台零子进程空闲短路、SQLite O(1) 增量胶囊与全量 Token 统计归因、WSL2 双轨只读读取、Swarm 子帧同步与载荷裁剪、2.5s 热重载感知）
│   ├── runtime.js              # 浏览器端注入引擎（五段式外观主题 +「跟随系统」日夜配对开关 + `[ EN | 中文 ]` 二元语言零重刷切换、#ag-font-faces 常驻字库防缺字、Windows TitleBarOverlay 零过渡污染同步、Swarm 子帧 1.5s 轮询零闪烁护盾与原版底色还原、O(1) 观察器短路、指标胶囊 260ms 悬浮意图与 rAF 合批）
│   ├── theme.css               # 样式表（莫兰迪古典矿物默认视觉、烟岚石青/火漆单层 `2px` 合并输入框、`Absolutely！` 与双深色预设、2.35.0+ 自绘窗口控制键高对比适配、指标胶囊与 Token 统计 `@container` 自适应面板）
│   └── i18n.json               # 2,210 条零冲突标准 JSON 基准词典（兼容 PowerShell 5.1 ConvertFrom-Json，挂载至 Object.create(null)）
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
重点检查输出中的 `fonts.allRequiredInstalled`、`fonts.missing`、`fonts.unregisteredWarning`（Windows 手动复制漏写注册表告警）与 `fonts.superTtcWarning`：
- **若 `fonts.allRequiredInstalled === false`（或 `fonts.unregisteredWarning` 非空）**：
  1. **若用户本地已下载好字体目录或 `.zip` 压缩包（如 `~/Downloads`）**：直接一键安装（支持自动识别并解压目录内字体 `.zip`，Windows 下采用 `.NET Microsoft.Win32.Registry` UTF-16 写入 `HKCU\...\Fonts` 并广播 `WM_FONTCHANGE`，规避中文用户名乱码）：
     ```bash
     node install.mjs install-fonts --from "<字体目录或.zip路径>"
     ```
     *（关键：在 Windows 10/11 下，单纯复制字体文件到用户字体目录不会写 `HKCU\...\Fonts` 注册表，Chromium `local()` 将无法识别字体，**必须**通过 `install-fonts` 注册；若 `doctor` 提示 `fonts.unregisteredWarning`，直接对 `%LOCALAPPDATA%\Microsoft\Windows\Fonts` 运行 `install-fonts --from` 即可原地补写注册表。）*
  2. **若本地尚未下载（新用户首选，全自动下载 + 解压 + 注册）**：
     ```bash
     # 自动下载缺失的 Anthropic Serif/Mono + 170 MB 精简拆分版更纱黑体 .zip 并安装注册
     node install.mjs install-fonts --auto-download

     # 若 Windows 此前装过 791 MB SuperTTC，追加 --retire-super-ttc 一并退订
     node install.mjs install-fonts --auto-download --retire-super-ttc
     ```
     *（内部采用 **Cloudflare R2 → GitHub Release (`fonts-sarasa-v1.0.43`) → Google Drive** 多源自动回退，遇到 Google Drive 配额超限 HTML 页会立即熔断切换下一个镜像源；Windows 下自动探测系统代理并支持 `curl.exe` → `.NET HttpClient` → `fetch` 三级传输回退，且强制校验二进制魔数与 SHA-256。若仅需先下载不安装，可运行 `node install.mjs download-fonts [--mirror cloudflare-r2|github-release|google-drive]`。）*
  3. **仅当终端网络/代理完全受限导致 `--auto-download` 所有镜像源均返回 `ok: false` 时**：引导用户在浏览器中优先从 **[Cloudflare R2 直链 (`Windows-Sarasa-Split-SC-TTF-v1.0.43.zip`)](https://img.chuanban.cc/fonts/chuanban-suite/Windows-Sarasa-Split-SC-TTF-v1.0.43.zip)** 或 **[GitHub Release 镜像 (`fonts-sarasa-v1.0.43`)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/releases/tag/fonts-sarasa-v1.0.43)** 下载 170 MB 更纱拆分包，3 个 `Anthropic*.ttf` 可从 `https://img.chuanban.cc/fonts/chuanban-suite/` 或 [Google Drive 资源包](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 下载（macOS 缺少更纱亦可 `brew install --cask font-sarasa-gothic`），下载后无需手动解压直接交给 `node install.mjs install-fonts --from "<下载目录或.zip>"` 即可。
  4. **Windows 重启生效提示**：若 `install-fonts` 返回 `restartAntigravityRequired: true`，说明 Antigravity 正在运行且 DirectWrite 已缓存旧字体列表，需在 Step 2 完成后重启一次客户端（`relaunch` 或手动重开）使新字体立即生效。
- **若老用户此前使用早期 `v1 ~ v4` 单文件版 `~/.gemini/antigravity/scripts/antigravity-font-daemon.mjs`**：先读取旧文件检查是否有用户手改过的字号或配色值，安装完成后将其迁入 `~/.gemini/antigravity/theme-patch/user/config.json` 或 `user/custom.css`。

### Step 2：安装内核与注册系统常驻服务
```bash
# 默认安装（channel="auto"，单守护进程同时自动兼容 Stable 正式版与 Insiders 预览版窗口）
node install.mjs install

# 可选：安装时直接指定初始白天预设或黑夜预设
node install.mjs install --preset morandi --dark-preset claude-warm

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
当输出 `"ok": true`、`"bodyReady": true`、`"hasStyle": true`、`"dictCount": 2210` 且 `fonts.allRequiredInstalled: true`（在源码仓库目录运行 `doctor` 时还会返回 `sourceSync.inSync: true` 校验仓库与已安装内核是否一致）时，代表主题、字体、汉化与指标胶囊已全部实机生效。

---

## 五、个性化改装与故障排障规范

永远在 `~/.gemini/antigravity/theme-patch/user/`（Windows 为 `%USERPROFILE%\.gemini\antigravity\theme-patch\user\`）下修改，**无需重启守护进程或客户端**（保存后 `2.5s` 自动热生效）。

### 1. 修改配色预设、字号变量或模块开关（`user/config.json`）
```json
{
  "enabled": true,
  "channel": "auto",
  "preset": "morandi",
  "darkPreset": "onyx",
  "installedLocale": "zh-CN",
  "contextLimit": 256000,
  "modules": {
    "i18n": true,
    "metrics": true,
    "tokenAnalytics": true,
    "composerWaxSeal": true,
    "deadlockHealer": true,
    "coldBootHealer": true,
    "zoomShortcuts": true,
    "cdpAutoRelaunch": true,
    "customCss": true,
    "customJs": true
  },
  "themeVars": {
    "--ag-chat-font-size": "16px"
  }
}
```
- **`preset`（浅色与原版预设）**：`"morandi"`（默认莫兰迪古典矿物）、`"absolutely"`（致敬 Claude 书卷暖白）、`"native"`（官方原版配色与原版字体）、`"claude-desktop-purewhite"`（莫兰迪素绢浅雾）、`"vintage-deep"`（莫兰迪敦煌古壁）；旧版 `"high-contrast"` 升级时自动平滑映射至 `"morandi"`。
- **`darkPreset`（黑夜配色预设）**：默认 `"onyx"`（深海石青碳黑）；设为 `"claude-warm"`（或在外观面板点击 **📖 书卷按钮**）启用暖纸深色并自动持久化。
- **`modules.i18n`（界面汉化开关）**：默认 `true`（也可直接在外观界面点击 **`[ EN | 中文 ]`** 一键切换并自动落盘，无需重新编译注入包）。
- **`contextLimit` / `contextLimitOverride`**：默认从会话元数据动态识别真实模型上下文窗口（`256k` / `512k` / `840k` / `1M+`），缺失时回退 `contextLimit`；如需全局强制锁定固定上限，可设正整数 `"contextLimitOverride": 1000000`。
- **`modules`**：支持独立开关各模块（如设 `"tokenAnalytics": false` 关闭设置弹窗「Token 统计」Tab 并动态剥离 ~100 KB CSS/JS 注入载荷，设 `"cdpAutoRelaunch": false` 关闭冷启动自动补参重拉，或将顶层 `"enabled": false` 保存以在 `2.5s` 内无损卸载全部样式并还原英文界面）。
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
     schtasks /create /tn "AntigravityThemeDaemon" /sc onlogon /rl LIMITED /tr "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command \"& '$env:ProgramFiles\nodejs\node.exe' --disable-warning=ExperimentalWarning '$HOME\.gemini\antigravity\scripts\antigravity-font-daemon.mjs' --keep-alive\"" /f
     ```
2. **Windows WSL2 远程工作区指标胶囊说明**：
   - 守护进程会自动从注册表 `Lxss` 识别默认 WSL2 发行版，对历史库采用四斜杠只读 URI、对活跃 `-wal` 会话库采用临时快照双轨读取，并在 UNC 不可达时自动触发 `45s` `0-I/O` 熔断避免唤醒休眠虚拟机。
3. **macOS 中文会话标题外挂权限说明（可选）**：
   - 若用户本机额外部署了可选脚本 `antigravity-zh-title-patch.py`，客户端升级后若指标胶囊旁出现提示小点，悬停胶囊点击「复制命令」在终端执行一次即可恢复（未部署该外挂的用户无任何影响）。
