---
name: chuanban-antigravity-theme-patch
description: 船板的 Antigravity 2.0 主题、字体与深度汉化全栈成品补丁包（v5.0.0 模块化架构）。采用「core/ 只读黄金内核 + user/ 永不覆盖改装层 + install.mjs 一键生命周期 CLI」，支持对方 Agent 零代码生成一键部署、2.5 秒热重载二次定制与 --safe-mode 沙箱排障。当用户提到“安装船板 Antigravity 主题”、“升级/修复 Antigravity 汉化与字体”、“定制 Antigravity 界面样式或汉化词条”时触发。
---

# 船板的 Antigravity 2.0 主题、字体与深度汉化全栈成品补丁（v5.0.0）

> **致执行部署的 AI Agent**：
> 本项目自 **v5.0.0** 起已从「阅读 1500 行蓝图现场拼装代码」全面升级为 **「预制模块化成品包 + 一键生命周期 CLI + `user/` 无损热改装」** 架构。
> **请勿从头手写或重生成守护进程代码**！请直接调用仓库根目录的 `node install.mjs` 完成一键安装、健康体检、热重载改装与安全模式排障。

---

## 一、三端分发拓扑与资源获取（权威源说明）

本项目采用**三端协同分发架构**（不设第三方镜像源）：

1. **Notion 端（Skill + 说明引导页）**
   - 链接：<https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554>
   - 定位：作为面向人类用户与 AI Agent 的**导航入口、架构说明与 Skill 引导页**，引导获取 Google Drive 完全资源包或 GitHub 权威代码库。
2. **Google Drive 端（全项目 + 全套字体完全资源包）**
   - 链接：<https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC>
   - 定位：包含 **v5.0.0 完整项目成品包 + 全套必备字体包（Anthropic 官方字体族 `Anthropic Sans` / `Anthropic Serif` / `Anthropic Mono` + 更纱黑体 `Sarasa Gothic SC` / `Mono SC` / `Term SC` 超集）** 的一站式完全资源包。
3. **GitHub 端（权威代码完全体）**
   - 仓库：<https://github.com/Anarcadia/chuanban-antigravity-theme-patch>
   - 定位：除**不内置商业版权 Anthropic 字体二进制文件**（字体下载统一通过链接指向上述 Google Drive 文件夹）之外的**权威代码完全体**，包含全部 `core/` 黄金内核、`user/` 改装模板、`install.mjs` CLI 与双分支（`main` / `insiders-dev`）历史。

---

## 二、Node.js 动态分级兼容策略

守护进程（`core/daemon.mjs`）内置**运行时环境动态分级**，绝不因 Node 小版本差异崩溃或无限重启：

| 运行时版本 | 主题 / 蜡封设计 / 字体排版 | 450 条深度汉化 + 原型安全词典 | 死锁自愈 + 窗口激活重绘 | SQLite 实时会话指标胶囊 (`node:sqlite`) |
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
│   ├── manifest.json           # 版本号、构建时间与 core/* 文件 SHA-256 校验清单
│   ├── daemon.mjs              # Node CDP 守护进程（动态 SQLite 分级、2.5s 热重载感知、PID 锁、稳定版/Insiders 双通道）
│   ├── runtime.js              # 纯正浏览器端注入引擎（零模板转义，含 O(N·深度) 脏根节流、死锁自愈、设置菜单注入）
│   ├── theme.css               # 纯正 CSS 样式表（Anthropic 暖纸浅色、输入框 C/A/B 蜡封三态解耦、字重与护眼对比度）
│   └── i18n.json               # 450 条标准 JSON 汉化基准词典（运行时挂载至 Object.create(null) 免疫原型键冲突）
└── user/                       # 【用户改装层】升级时 100% 永不覆盖，守护进程每 2.5s 自动检测 mtimeMs 热重载注入！
    ├── config.json             # 开关配置（enabled / channel / features / themeVars 颜色字号变量覆盖）
    ├── custom.css              # 用户/对方 Agent 自定义追加 CSS（自动挂载于 #antigravity-user-custom-style）
    ├── i18n.override.json      # 用户自定义词条覆盖或新增（优先级高于 core/i18n.json）
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
# 正式稳定版（默认）
node install.mjs install --channel stable

# 若用户同时或单独使用 Antigravity Insiders 预览版
node install.mjs install --channel insiders
```
`install.mjs install` 会自动完成：
1. 校验 `core/manifest.json` SHA-256 完整性；
2. 将当前已安装的旧版本自动快照备份至 `~/.gemini/antigravity/theme-patch/backups/<timestamp>/`；
3. 原子更新 `core/` 内核，**初始化或无损保留已有的 `user/` 改装文件**；
4. 自动修补 Antigravity 应用的 `argv.json`（注入 `"remote-debugging-port": 9222`）；
5. 自动生成 `~/.gemini/antigravity/scripts/antigravity-font-daemon.mjs` 兼容包装入口，并注册/重启系统后台自启服务（macOS `LaunchAgent` / Linux `systemd --user` / Windows Startup VBS）。

### Step 3：CDP 实机注入验收
确保 Antigravity 客户端正在运行，执行实机验证：
```bash
node install.mjs verify
```
当终端输出 `"ok": true` 且显示 `"version": "20261104-v5.0.0-stable-..."`、`"themeStyle": true` 时，即代表主题、字体、汉化与指标胶囊已 100% 注入成功。

---

## 五、对方 Agent 如何协助用户做个性化改装与 Debug？

**黄金铁律**：永远在 `~/.gemini/antigravity/theme-patch/user/` 目录下修改，**无需重启守护进程或 Antigravity**（`core/daemon.mjs` 每 2.5 秒自动感知 `user/*` 文件的 `mtimeMs` 变化并热更新到所有打开的窗口）。

### 1. 修改字号、主色调或功能开关（编辑 `user/config.json`）
```json
{
  "enabled": true,
  "channel": "stable",
  "features": {
    "i18n": true,
    "metricsCapsule": true,
    "composerWaxSeal": true,
    "deadlockHealer": true,
    "customJs": true
  },
  "themeVars": {
    "--ag-chat-font-size": "16px",
    "--ag-wax-seal-hover": "#8C221C"
  }
}
```
- `themeVars` 中的任何键值都会自动作为内联 CSS 变量挂载到 `document.documentElement`（`<html>` 根节点），瞬间覆盖全局样式。

### 2. 追加或微调界面 CSS（编辑 `user/custom.css`）
直接编写标准原生 CSS（**零反斜杠转义**），保存后 2.5 秒内自动在页面 `<style id="antigravity-user-custom-style">` 热生效。

### 3. 覆盖或新增汉化词条（编辑 `user/i18n.override.json`）
在 `"exact"` 对象中添加 `"英文原词": "自定义中文"`，保存后 2.5 秒内自动合并生效并触发全页重扫。

### 4. 编写前端自定义 JS 扩展（编辑 `user/custom.js`）
`user/custom.js` 已完全开放！你编写的脚本会在每次注入或热更新时，在独立 `try/catch` 沙箱中执行，并可通过全局变量 `boot` 访问当前运行时上下文（`boot.version`、`boot.config`、`boot.metrics`）。

### 5. 故障隔离与一键回滚（Safe Mode & Rollback）
如果用户编写的 `user/custom.css` 或 `user/custom.js` 导致页面显示异常，对方 Agent 只需运行：
```bash
# 启用安全模式：彻底绕过 user/ 层，仅注入纯净 core/ 黄金内核以定位问题
node install.mjs verify --safe-mode

# 查看所有模块的 SHA-256 校验与守护进程状态
node install.mjs doctor

# 一键回滚到上一次自动备份的快照版本
node install.mjs rollback
```

---

## 六、设计亮点速览（v5.0.0 内核特性）

1. **输入框「蜡封三态」零延迟纯 CSS 解耦（设计 C / A / B）**：
   - **场景二（首页新建对话 / Home Splash & New Conversation）**：日常状态为 **设计 C**（外框完全透明 `rgba(122, 31, 26, 0)`，保持首页极简呼吸感）；鼠标移上或打字聚焦时平滑浮现为 **设计 A**（`1.5px` 淡雅暗红蜡封线 `rgba(122, 31, 26, 0.34)` + 微暖晕染）。
   - **场景一（日常推进具体聊天会话）**：日常常驻 **设计 A**（`1.5px` 略粗偏淡古朴蜡封线）；鼠标移上或聚焦时进阶为 **设计 B**（`2px` 浓郁古朴暗红蜡封 `#7A1F1A` + 双层内嵌微光）。
   - **0ms 切换**：完全依靠组件级现代 CSS `:has([data-testid="branch-pill-trigger"], [aria-label^="Select project"], [aria-label^="选择项目"])` 与 `html:has([data-testid="home-greeting"])` 解耦，彻底消除 JS 轮询延迟。
2. **原型安全与 O(N·深度) 高性能 DOM 汉化引擎**：
   - 词典采用 `Object.create(null)` 空原型哈希表，彻底免疫 `toString` / `valueOf` / `constructor` 等原型链属性冲突。
   - `MutationObserver` 采用 `requestAnimationFrame` + `80ms setTimeout` 双重触发（防止窗口最小化至后台时 `dirtyRoots` 无限堆积），配合祖先链 `O(N·深度)` 去重与单帧 200 节点熔断。
3. **精准会话指标胶囊（Metrics Capsule）**：
   - 自动解析 `trajectory.pb` 并在计算每轮平均耗时时过滤 `0` 用量异常元数据记录，采用最后一轮 `USER_INPUT` 后的真实规划步数切片 `valid.slice(-rawTurnSteps)`，消除索引错位。
4. **原生阅读版式切换面板（Settings -> Customization）**：
   - 在设置页内置「船板经典暖色学术排版（Serif 衬线）」与「现代清爽无衬线排版（Sans-Serif）」一键切换卡片，实时持久化至 `localStorage`。
