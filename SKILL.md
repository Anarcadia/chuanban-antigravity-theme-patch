---
name: chuanban-antigravity-theme-patch
description: 一次性安装型 Skill：引导执行端 Agent（Claude Code / Codex / Antigravity 等）在用户电脑上为 Google Antigravity 客户端制作并常驻安装界面补丁——Claude 式暖象牙纸配色预设、牛皮纸侧栏、更纱黑体三层字体、界面局部汉化、设置弹窗死锁修复。基于 CDP 运行时注入，不修改 App 原包。以 macOS 为主，附 Windows 与轻量路线原则。触发：安装/定制 Antigravity 主题、字体、配色、汉化补丁，或 Antigravity 设置按钮点不开。
---

# chuanban-antigravity-theme-patch

> 🧭

**这是一份一次性的安装说明书，读者是执行端 Agent。** 按「执行流程」走完一遍，就在用户机器上做好并装好一套属于他自己的 Antigravity 界面补丁。§0–§6 是原方案的核心设计与 macOS 实现，数值与选择器都经过实测，**请照原样执行，不要自行“优化”**；§7 Windows、§8 轻量路线只给原则，细节由你自行调研解决。

### 执行流程（先读这里）

1. **确认环境**：操作系统、Antigravity 是否已安装并运行、本机是否有 Node.js（建议 18+，需内置或安装 `ws` 等 WebSocket 能力）。

2. **向用户明确三件事并询问配色预设偏好**（一次问完）：

  - **【核心配色选择】询问用户使用哪一种配色方案**（直接列出以下三种选项，**默认首选为「1、高对比版」**）：

    - **1、高对比版**（推荐首选 / 默认）：暖燕麦浅色边栏 + 净白主区 + 极淡暖棕输入框，具有高对比度纯黑文字（#0A0A0A）与清晰界面主轮廓线；

    - **2、ClaudeDesktop 净白**：官方客户端纯净两栏微暖极净白，柔和细腻；

    - **3、复古深色**：原版浓郁黄棕牛皮纸双栏质感。

*(若用户未特殊指定，直接部署「1、高对比版」)*。

  - 是否需要 §4 汉化与 §5 步骤 4 的设置死锁修复？（默认建议开启）

  - 是否只想改字体/颜色、不需要常驻守护？是 → 直接走 §8 轻量路线。

3. **安装字体与资源下载（Google Drive 公开共享库）**：

  - **【官方网盘源】Google Drive Public Share 字体库**：

    - **公开下载链接**：https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC

    - **已包含全套字体资源**：

      - **Anthropic 官方原版字体族**（无衬线 `AnthropicSans`、西文商业衬线 `AnthropicSerif`、等宽 `AnthropicMono`）；

      - **更纱黑体超集族**（`Sarasa-SuperTTC.ttc`，包含 `Sarasa UI SC`、`Sarasa UI Slab SC`、`Sarasa Mono Slab SC` 等全套粗细）。

  - **安装说明**：

    - macOS 可直接从上方网盘下载双击安装到系统字体册（或通过 `brew install --cask font-sarasa-gothic` 安装更纱）；

    - 安装后确认系统识别 `Sarasa UI SC`、`Sarasa UI Slab SC`、`Sarasa Mono Slab SC` 及 `Anthropic` 族名即可。

4. **写补丁**：按 §5 蓝图在用户目录下建一个独立文件夹（如 `~/.antigravity-patch/`），把守护进程、注入脚本、CSS、汉化字典分文件存放，便于维护与卸载。§4 只列了核心词条，按同样口径补全字典即可。

5. **配置常驻**：macOS 用 `launchd` 用户级 LaunchAgent（`~/Library/LaunchAgents/`，`RunAtLoad` + `KeepAlive`），日志写到补丁目录。

6. **验收**：逐条跑 §6 清单，全部通过再向用户汇报。

7. **交付**：告诉用户补丁目录位置、如何切换预设、以及卸载方法（停掉并删除 LaunchAgent → 结束守护进程 → 设置里切回 Default Light → 重启 Antigravity；补丁目录删掉即彻底干净）。

> ⚠️

若 `DevToolsActivePort` 文件不存在，说明当前进程没开远程调试端口。自行调研让 Antigravity 带 `--remote-debugging-port` 启动的办法（并相应调整常驻方案），不要转而去改 App 包。CDP 只连 `127.0.0.1`，不要把端口暴露到外网。

---

## 0. 概要与设计意图

> **适用目标**：macOS 环境下的 Google Antigravity 客户端
**方案性质**：无侵入式动态运行时注入（基于 Chrome DevTools Protocol，不修改 App 原包签名）

本指南旨在指导执行端 Agent（如 Claude Code、Codex、Antigravity 自身等）为用户的 Mac 环境构建一套**高舒适度排版、Claude Desktop 温暖纸质色调、界面局部汉化及路由死锁自愈**的常驻补丁。

我们**不通过**修改 `/Applications/Antigravity.app` 原生二进制或重新打包 `.asar` 文件来做修改（避免破坏系统签名、更新失效与安全告警），而是通过 **CDP（Chrome DevTools Protocol）守护脚本**在运行时动态注入 CSS 与前端增强逻辑。

---

## 1. 为什么不能仅靠官方外观设置（核心认知）

Antigravity 官方设置虽然提供了“外观”（Appearance）面板并允许调节背景、前景与强调色，但在全局视觉调校上存在**四大本质机制限制**：

1. **预设列表写死且改名必崩**：官方前端将预设列表（`Default Light`、`Catppuccin` 等）硬编码在内部字典常量中，**没有提供“新建/保存自定义预设”的入口**；若将非官方预设名直接存入存储，React 组件在查找属性时会因 `undefined` 抛出致命 `TypeError` 导致设置弹窗直接白屏死锁。

2. **侧边栏与框线无法独立定制**：

  - **侧边栏机械混黑**：官方公式为 `--sidebar = color-mix(in srgb, #000000 4%, var(--background))`。不论主背景调得多温暖，只要混入 4% 纯黑，侧栏立刻呈现发冷、灰暗的塑料感，无法达成优雅的双栏色调层次；

  - **主轮廓线与输入框缺乏独立控制**：对话框主体轮廓线、新建/历史对话胶囊边框、左右三栏中缝竖线、以及底部输入框（`--card` / `--card-border`）均无法在官方外观面板中单独设置，导致原生浅灰线条在浅色底上对比度过低、视觉发飘。

3. **底部模型与操作字体被全局灰化**：输入框下方的模型名称（如 Gemini 3.8 Flash）、极速模式、麦克风等操作元素，原生组件默认被赋予了 `opacity: 0.7` 浅灰滤镜，无法单独通过官方设置调为高清晰度纯黑墨色。

4. **字体无法精细分层分工**：官方仅开放全局字号滑动条，无法实现“UI 几何无衬线、正文古典书卷衬线、代码严格等宽、输入框 Codex 同款打字机粗衬线”的专业排版分层。

---

## 2. 硬性指标 1：配色方案规范（Color Specification）

本方案提供**三大独立预设**供用户选择，并严格保障原厂 `Default Light` 的出厂复原能力。**执行端 Agent 在部署时必须记录并向用户确认偏好，默认首选部署「1、高对比版」**。

#### A. 预设 1：高对比版（`high-contrast`，推荐首选 / 当前默认）

针对日常高强度编码与长文本阅读调校，兼顾微暖护眼底色与极致锐利的文字轮廓识别度：

- **正文主区背景**（`--background`）：`#FCFCFB`（通透温润的微暖亮白，无反光刺眼感）

- **正文文字前景色**（`--foreground`）：`#1F1E1D`（高清晰度石墨深黑）

- **左侧导航栏背景**（`--sidebar`）：`#F7F5F0`（介于白色与原纸质底色之间的暖白燕麦色）

- **输入框卡片底色**（`--card` / `--card-border`）：底色 `#F9F7F2`（比正文略深、带有一抹极淡微暖棕色相），外轮廓线 `rgba(0, 0, 0, 0.35)`（立体清晰）

- **高对比轮廓与文字强化**：

  - **输入框底部文字/图标**：模型名称（Gemini 3.8 Flash 等）、Turbo 模式、状态图标颜色设为近乎纯黑深墨色 `#0A0A0A`（彻底去除原生 0.7 模糊灰度滤镜，与 Claude 桌面端一致）；

  - **主操作按钮轮廓**：「新建对话」、「历史对话」等胶囊按钮边框强化为 `rgba(0, 0, 0, 0.32)` 实线；

  - **三栏竖向中缝**：左侧栏、主内容区与辅助看板间的分隔竖线强化为清晰可见实线（`rgba(0, 0, 0, 0.28)`）。

#### B. 预设 2：ClaudeDesktop 净白（`claude-desktop-purewhite`）

直接基于 Anthropic 官方桌面端进行像素级采样还原的纯净双栏版本：

- **主正文背景**（`--background`）：`#FCFCFB`

- **左侧栏背景**（`--sidebar`）：`#FBFBF9`（极浅中性燕麦冷灰白）

- **选中项背景**（`--sidebar-secondary`）：`#EDECE9`

- **悬停态底色**（`--sidebar-muted`）：`#F3F2EF`

- **中缝分割线**（`--sidebar-border`）：`#F0F0EE`（极细素净中性灰线）

- **视觉风格**：极简、现代、整体近乎纯白，通透开阔。

#### C. 预设 3：复古深色（`vintage-deep` / 原 `absoulutely-chuanban`）

浓郁黄棕牛皮纸质感双栏，致敬复古羊皮纸手稿风格：

- **主正文背景**（`--background`）：`#FBF9F5`（经典暖象牙纸质）

- **正文前景色**（`--foreground`）：`#2C2B29`

- **强调色**（`--primary`）：`#D97757`（陶土砖红）

- **左侧栏背景**（`--sidebar`）：`#F1E8DC`（深牛皮纸暖黄）

- **选中态底色**（`--sidebar-secondary`）：`#E6DCCE`

- **边框线**（`--sidebar-border`）：`#E0D4C3`

#### D. 官方原生默认浅色（Default Light）出厂复原标准

当用户在系统设置中切回官方 `Default Light` 时，补丁自动卸载所有自定义样式变量，100% 回退出厂状态：

- 背景色：`#F9F9F9`，前景色：`#101010`，强调色：`#007ACC`（微软蓝），侧边栏恢复出厂冷灰白。

---

## 3. 硬性指标 2：字体层次化排版（Typography Hierarchy）

本工程定义三套排版方案。**Agent 默认直接部署 A 方案（推荐首选配置）**，无需额外向用户询问确认；B 与 C 方案作为备选方案仅列出供技术参考与代码储备。

#### 【首选配置】A 方案：Claude 官方原版书卷 + 更纱 Slab 深度融合（默认推荐）

融合 Claude 官方原版商业衬线（Tiempos Text）与更纱黑体/Slab，兼具古典书香阅读质感与 Codex 同款打字机工整感：

| 层级 | 覆盖范围 | 推荐字体族（CSS 声明） | 设计原因 |
|---|---|---|---|
| 1. UI 控件层 | 全局按钮、导航栏、侧栏标题、下拉菜单、Tabs、常规面板 | `'Anthropic Sans', 'Styrene B', system-ui, -apple-system, BlinkMacSystemFont, 'Sarasa UI SC', '更纱黑体 UI SC', sans-serif` | 西文使用 Claude 官方原版几何无衬线（Styrene B），中文无缝回退更纱 UI，现代规整。 |
| 2. 阅读正文层 | 对话区正文、Markdown 渲染区、`.prose`、`.markdown`、段落 `p`、列表 `li`、标题 `h1-h6` | `'Anthropic Serif', 'Tiempos Text', Georgia, Cambria, 'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', 'Sarasa Gothic SC', '更纱黑体 SC', serif` | **西文使用 Claude 官方原版 Anthropic Serif 书卷衬线**（行高 1.62、字距 -0.003em），**中文优先回退更纱粗衬线/黑体**，彻底消除官方原生硬塞苹方黑体所导致的“中西文拼凑割裂感”。 |
| 3. 代码与终端层 | `code`、`pre`、`.monaco-editor`、`.xterm` 终端、文件名与路径、diff 变更器 | `'Anthropic Mono', 'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', ui-monospace, SFMono-Regular, monospace` | Claude 官方等宽与更纱等宽双重保障，严格 1:2 中英等宽打字机版，字符对齐、符号分明。 |
| 4. 主输入框编辑区 | `div[contenteditable="true"]`、`textarea`、`[data-composer]`、`.ProseMirror` | `'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', 'Anthropic Mono', monospace` | **独立配置为 Codex 同款方案**：具备打字机板状粗衬线（Slab Serif）、数字 1 横底座与 0 带斜杠、严格 1:2 中西文等宽，打字手感与视觉极佳。 |

---

#### 【备选方案】仅供 Agent 技术参考（不要求询问用户）

##### 备选 B 方案：纯血更纱黑体经典方案（全盘 Sarasa）

若运行环境未安装 Anthropic 官方 WebFont 字体，或用户偏好纯统一的更纱字体家族时采用：

- **UI 控件**：`'Sarasa UI SC', '更纱黑体 UI SC', system-ui, sans-serif`

- **阅读正文**：`'Sarasa UI Slab SC', '更纱黑体 UI Slab SC', 'Sarasa UI SC', sans-serif`

- **代码与终端**：`'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', ui-monospace, monospace`

- **输入框**：`'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', monospace`

##### 备选 C 方案：Claude 官方原生苹方方案（100% 还原官方原生回退）

若需要 100% 还原 Claude 网页版与官方桌面端出厂状态（西文衬线、中文粗暴回退苹方黑体）时采用：

- **UI 控件**：`'Anthropic Sans', 'Styrene B', system-ui, -apple-system, 'PingFang SC', sans-serif`

- **阅读正文**：`'Anthropic Serif', 'Tiempos Text', Georgia, 'PingFang SC', 'Microsoft YaHei', serif`（官方线上原生回退链）

- **代码与终端**：`'Anthropic Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace`

- **输入框**：继承 UI 字体（Anthropic Sans + 苹方）

---

## 4. 硬性指标 3：汉化范围与严格排除边界（Localization Scope）

通过注入 DOM `TreeWalker` 与 `MutationObserver` 实现轻量实时界面汉化，重点降低日常操作认知负担。

#### A. 允许汉化区（系统导航、设置面板与常用状态）

1. **侧栏与导航**：`New Conversation`（新建对话）、`Conversation History`（历史对话）、`Settings`（系统设置）、`Automations`（自动化任务）、`Customizations`（技能与自定义）等。

2. **设置界面与项目管理**：

  - 常规与全局权限：`General`（常规设置）、`Execution`（执行策略）、`Global Permissions`（全局权限）、`Tool Permissions`（工具权限）、`Network Access Rules`（网络访问规则）等。

  - 应用偏好与防休眠：`Application`（应用配置）、`Prevent Sleep`（防止电脑休眠）、`Keep In Menu Bar`（保持在系统菜单栏）等。

  - 项目专属配置：`Folders`（项目目录）、`Permission Settings`（权限设置）、`Inherit Global`（继承全局）、`MCP Tools`（MCP 工具）、`Rules`（项目规则）、`Delete Project`（删除项目）等。

  - 快捷键、模型与反馈：`Shortcuts`（快捷键）、`Models & Usage`（模型与用量）、`Feedback Type`（反馈类型）等。

3. **通用操作**：`Proceed`（确认执行）、`Cancel`（取消）、`Copy`（复制）、`Running`（运行中）、`Completed`（已完成）等。

4. **动态正则模式**：

  - 会话数量：`/^(\d+)\s+active\s+conversations$/i` → `$1 个进行中的会话`

  - 文件与统计：`/^(\d+)\s+files?\s+changed$/i` → `$1 个文件变更`；`/^Show\s+(\d+)\s+breakdowns?$/i` → `展开明细 ($1 项)`

  - 耗时指标：`/^Worked for\s+(\d+[smhd])$/i` → `已工作 $1`；`/^Thought for\s+(\d+[smhd])$/i` → `已思考 $1`

#### B. 严密保护区（绝对排除，禁止任何文本替换）

汉化遍历函数必须在进入前通过 `node.parentElement.closest(...)` 检查，命中以下任何选择器时**立刻跳过**：

- 代码块与终端：`code, pre, kbd, samp, [class*="language-"], .monaco-editor, .xterm`

- 智能体对话内容与 Markdown 文章正文：`.prose, .markdown, [class*="chat-message"]`

- 任何输入与编辑区：`input, textarea, [contenteditable="true"]`

- 文件树标题与文件路径：`[class*="group/file-title"], [class*="file-title"], [class*="file-path"], [data-path]`

---

## 5. 硬性指标 4：实现注入的核心架构逻辑（Agent 执行蓝图）

执行 Agent 可以通过以下步骤，在受体机器上完成全自动守护进程的部署：

```
[Antigravity 运行]
       │ 监听端口文件
       ▼
[DevToolsActivePort] ──(读取端口)──► [Node.js 守护进程]
                                           │
                                           ├─► WebSocket 连接 CDP (Page/Runtime)
                                           ├─► 注入更纱黑体 CSS + 动态选择器
                                           ├─► 注册 window.Vlc.light['absoulutely-chuanban']
                                           ├─► 拦截 localStorage.setItem 同步 data-ag-preset
                                           └─► 捕获设置按钮点击，修复 TanStack Router 死锁
```

#### 步骤 1：定位 CDP 调试端口

在 macOS 下，Antigravity 启动后会在用户目录下生成端口记录文件：

```
~/Library/Application Support/Antigravity/DevToolsActivePort
```

- 读取该文件第一行即可获取当前活动的 CDP 监听端口（例如 `56626`）。

- 访问 `http://127.0.0.1:<PORT>/json` 获取活跃的目标页面列表，找到 `type === "page"` 且 URL 匹配主应用的 target，获取其 `webSocketDebuggerUrl`。

#### 步骤 2：建立 WebSocket 通信并双通道注入

通过 WebSocket 建立与 CDP 的通信，并在目标页面中执行注入：

1. **持久注入（去重防累积）**：每个 CDP Session **仅调用一次** `Page.addScriptToEvaluateOnNewDocument`，并记录返回的 `session.newDocumentScriptId`。避免在窗口生命周期自愈或巡检时重复累积注入多份全局持久脚本。

2. **实时生效**：调用 CDP `Runtime.evaluate`，直接在当前已经打开的活跃页面中即时执行一次注入脚本。

#### 步骤 3：在注入脚本中实现预设扩展与侧栏联动（防白屏崩溃设计）

> [!IMPORTANT]

> **React 崩溃陷阱警示**：Antigravity 内部外观设置组件（`Krc`）会在打开「系统设置」时同步渲染预设列表。其预设字典为内部模块硬编码，仅识别官方预设名（如 `Default Light`、`Catppuccin` 等）。若在 `localStorage.getItem("theme-preset-light")` 中写入自定义名称，设置弹窗在查找预设时会因找不到对象而抛出 `TypeError: Cannot read properties of undefined (reading 'background')`，导致整个 React 根节点卸载崩溃（即点击系统设置直接变白屏死锁）。

> 

> **正解架构**：

> 1. `theme-preset-light` 必须始终对 React 维持合法的官方基准 `"Default Light"`。

> 2. 注入脚本挂载 `localStorage.getItem` 拦截器，若检测到自定义预设名一律安全回退至 `"Default Light"`，彻底免疫白屏崩溃。

> 3. **真实底层存储迁移**：清理历史脏数据时必须调用原型方法 `Storage.prototype.getItem.call(localStorage, "theme-preset-light")`，避免被已包装的方法遮蔽导致物理存储未真正迁移。

> 4. **DOM 注入脏检查**：仅在 `style.textContent` 与目标 CSS 不一致时才赋值，避免无意义的 DOM mutation 与性能损耗。

> 5. **三大预设调度与隔离**：支持 `high-contrast`（高对比版）、`claude-desktop-purewhite`（Claude 净白）与 `vintage-deep`（复古深色）。通过 `localStorage.getItem("theme-color-flavor")` 调度，默认为 `high-contrast`，切回官方出厂主题时自动撤销数据属性。

```JavaScript
// 1. 三大预设状态联动与防崩溃保护
const PRESETS = {
  HIGH_CONTRAST: "high-contrast",
  CLAUDE_PUREWHITE: "claude-desktop-purewhite",
  VINTAGE_DEEP: "vintage-deep",
  LEGACY_WARM_WHITE: "chuanban-warm-white",
  LEGACY_OFFICIAL: "claude-desktop-official",
  LEGACY_CHUANBAN: "absoulutely-chuanban"
};
const ALL_CUSTOM_PRESETS = new Set(Object.values(PRESETS));

function syncPresetAttribute() {
  try {
    // 穿透包装层，迁移底层物理存储中的历史非法值
    const stored = Storage.prototype.getItem.call(localStorage, "theme-preset-light");
    if (ALL_CUSTOM_PRESETS.has(stored)) {
      try { Storage.prototype.setItem.call(localStorage, "theme-preset-light", "Default Light"); } catch (e) {}
    }

    const flavor = Storage.prototype.getItem.call(localStorage, "theme-color-flavor") || PRESETS.HIGH_CONTRAST;
    const currentBg = (window.getComputedStyle(document.documentElement).getPropertyValue("--background") || "").trim().toUpperCase();
    const isWarmBg = (currentBg === "#FBF9F5" || currentBg === "#FCFCFB");

    if (flavor === PRESETS.HIGH_CONTRAST || flavor === PRESETS.LEGACY_WARM_WHITE || flavor === "高对比版") {
      document.documentElement.setAttribute("data-ag-preset", PRESETS.HIGH_CONTRAST);
    } else if (flavor === PRESETS.CLAUDE_PUREWHITE || flavor === PRESETS.LEGACY_OFFICIAL || flavor === "ClaudeDesktop 净白") {
      document.documentElement.setAttribute("data-ag-preset", PRESETS.CLAUDE_PUREWHITE);
    } else if (flavor === PRESETS.VINTAGE_DEEP || flavor === PRESETS.LEGACY_CHUANBAN || flavor === "复古深色" || isWarmBg) {
      document.documentElement.setAttribute("data-ag-preset", PRESETS.VINTAGE_DEEP);
    } else {
      document.documentElement.removeAttribute("data-ag-preset");
    }
  } catch (e) {}
}

// 2. 拦截 localStorage 防止非官方预设名污染导致系统设置弹窗白屏崩溃
if (!window.__ag_preset_hooked) {
  window.__ag_preset_hooked = true;
  try {
    const originalGet = localStorage.getItem.bind(localStorage);
    localStorage.getItem = function(k) {
      const val = originalGet(k);
      if (k === "theme-preset-light" && ALL_CUSTOM_PRESETS.has(val)) {
        return "Default Light";
      }
      return val;
    };

    const originalSet = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(k, v) {
      if (k === "theme-preset-light" && ALL_CUSTOM_PRESETS.has(v)) {
        v = "Default Light";
      }
      originalSet(k, v);
      if (k === "theme-preset-light" || k === "theme-mode" || k === "theme-color-flavor") {
        setTimeout(syncPresetAttribute, 50);
      }
    };
  } catch (e) {}
}

syncPresetAttribute();
window.__ag_patch_version = "20261013-high-contrast-v1";
```

配套 CSS 规则：

```CSS
/* 1、高对比版（当前默认） */
html[data-ag-preset="high-contrast"] body.theme-light {
  --background: #FCFCFB !important;
  --foreground: #1F1E1D !important;
  --sidebar: #F7F5F0 !important;
  --sidebar-secondary: #ECE9E1 !important;
  --sidebar-border: rgba(0, 0, 0, 0.35) !important;
  --border: rgba(0, 0, 0, 0.38) !important;
  --card: #F9F7F2 !important;
  --card-border: rgba(0, 0, 0, 0.35) !important;
  --secondary-foreground: #0A0A0A !important;
}
html[data-ag-preset="high-contrast"] .bg-sidebar { background-color: var(--sidebar) !important; }
html[data-ag-preset="high-contrast"] .bg-border { background-color: rgba(0, 0, 0, 0.28) !important; }
html[data-ag-preset="high-contrast"] a[class*="inline-flex"],
html[data-ag-preset="high-contrast"] .bg-sidebar a { border-color: rgba(0, 0, 0, 0.32) !important; }
html[data-ag-preset="high-contrast"] #antigravity\.agentSidePanelInputBox span,
html[data-ag-preset="high-contrast"] #antigravity\.agentSidePanelInputBox button { color: #0A0A0A !important; opacity: 1 !important; }

/* 2、ClaudeDesktop 净白 */
html[data-ag-preset="claude-desktop-purewhite"] body.theme-light {
  --background: #FCFCFB !important;
  --sidebar: #FBFBF9 !important;
  --sidebar-secondary: #EDECE9 !important;
  --sidebar-border: #F0F0EE !important;
}

/* 3、复古深色 */
html[data-ag-preset="vintage-deep"] body.theme-light {
  --background: #FBF9F5 !important;
  --sidebar: #F1E8DC !important;
  --sidebar-secondary: #E6DCCE !important;
  --sidebar-border: #E0D4C3 !important;
}
```

#### 步骤 4：修复 TanStack Router 弹窗死锁 Bug

Antigravity 内部采用 TanStack Router 管理设置页面路由。存在一个已知缺陷：当用户快速点击左下角设置按钮，或在弹窗退出动画期间再次点击时，URL 会残留 `settingsOpen=true`，但实际 Dialog 节点已被卸载。此时再次点击设置按钮，Router 判定状态未发生变化（No-op），导致用户再也点不开系统设置。

**修复方案（事件捕获阶段破除死锁并保留路由 State）**：

```JavaScript
if (!window.__ag_settings_guard_installed) {
  window.__ag_settings_guard_installed = true;
  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-testid="settings-button"]');
    if (!btn) return;

    const hasDialog = !!document.querySelector('[role="dialog"]');
    const urlHasSettings = window.location.search.includes("settingsOpen=true");

    // 弹窗实际未打开，但 URL 残留了 settingsOpen=true，判定为死锁
    if (!hasDialog && urlHasSettings) {
      const url = new URL(window.location.href);
      url.searchParams.delete("settingsOpen");
      url.searchParams.delete("settingsScreen");
      // 必须保留 window.history.state，避免抹去 TanStack Router 的 __TSR_key / __TSR_index
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, true); // 必须在捕获阶段执行，先于 React 事件触发
}
```

#### 步骤 5：自愈巡检与常驻运行

- 守护脚本使用 `setInterval(sync, 2500)` 定期检查目标页面的样式与探针版本：

```JavaScript
Boolean(document.getElementById("ag-custom-fonts") && window.__ag_patch_version === "20261013-high-contrast-v1")
```

- 检查失败时通过 `Runtime.evaluate` 执行热注入自愈（不重复累加 `addScriptToEvaluateOnNewDocument`）。

- 在用户机器上，可通过后台 Node 进程（如 `nohup node ... &`）或用户的 `launchd` 启动项维持守护进程生命周期。

---

## 6. 验证清单（给执行 Agent 的验收步骤）

执行完毕后，执行端 Agent 应当进行如下自检：

1. **字体生效验证**：检查正文段落计算样式，确认 `font-family` 包含 `Sarasa UI Slab SC`（或其回退字体），代码块为等宽打字机衬线。

2. **色彩层级与防白屏验证**：

  - 打开「系统设置 → 外观界面」，确认设置弹窗秒级流畅打开，控制台无 `TypeError: Cannot read properties of undefined (reading 'background')` 报错，**界面绝不白屏**（在原型层始终汇报为合法的 `Default Light`）。

  - **默认高对比版检验**：确认主正文为微暖亮白 `#FCFCFB`，左侧栏呈现暖燕麦色 `#F7F5F0`，输入框内芯呈现极淡微暖棕 `#F9F7F2`，底部模型名称及操作文字呈现近乎纯黑深墨色 `#0A0A0A`，界面三栏竖线与按钮轮廓线清晰明朗。

3. **切换与深色模式隔离验证**：

  - **预设切换**：检查 `localStorage.setItem("theme-color-flavor", ...)` 能在「高对比版」、「ClaudeDesktop 净白」与「复古深色」间秒级热切换；

  - **深色隔离**：在系统设置中切换至深色模式（Dark Theme）时，浅色自定义覆盖变量自动让出控制权，回退官方深色样式。

4. **排除区安全验证**：确认代码块、终端、智能体回复正文中的技术英文未被汉化字典误伤替换。

5. **设置弹窗防死锁与路由 State 验证**：

  - 快速连续点击设置按钮，确认弹窗可以正常流畅打开，不会卡死。

  - 检查 `window.history.state`，确认保留了 TanStack Router 所需的路由键（如 `__TSR_key` 等）。

6. **常驻验证**：完全退出并重开 Antigravity，确认补丁在无人干预下自动恢复。

---

## 7. Windows 用户（原则，细节自行调研）

- §0–§4 的设计、§5 的注入脚本与 CSS、§6 验收清单**全部通用**，只有“找端口”和“常驻”两处需要换平台实现。

- 端口文件通常在 Antigravity 的用户数据目录下（多半是 `%APPDATA%\Antigravity\DevToolsActivePort`），以实际搜索结果为准。

- 常驻用「任务计划程序」登录触发或启动文件夹，让 Node 守护进程无窗口后台运行；注意路径分隔符、中文路径与编码。

- 更纱黑体从 GitHub Release 或包管理器安装，装完确认族名能被识别。代码层回退字体把 `Menlo, Monaco` 换成 `Consolas`。

## 8. 轻量路线（不需要 Mac 那套常驻机制时）

只想改字体或颜色、不在乎自定义预设名、汉化和死锁修复时，不必搭守护进程：

- **只要暖色**：直接在官方外观面板填三基色，接受侧栏偏灰的局限（见 §1）。

- **只要字体 / 侧栏 CSS**：写一个一次性脚本，通过 CDP `Runtime.evaluate` 注入一个带固定 id 的 `<style>` 标签，需要时手动跑一次即可；不需要拦截 `localStorage`、不需要巡检。

- **无论哪条路线都守住三条底线**：不改 App 包与 `.asar`；注入幂等（固定 id、全局标记，重复执行不叠加）；随时可一键撤销。