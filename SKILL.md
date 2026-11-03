---
name: chuanban-antigravity-theme-patch
description: 一次性安装型 Skill：引导执行端 Agent（Claude Code / Codex / Antigravity 等）在用户电脑上为 Google Antigravity 客户端制作并常驻安装界面补丁——Claude 式暖象牙纸配色预设、牛皮纸侧栏、更纱黑体三层字体、前端 Bundle 静态扫描+280条全界面汉化、设置弹窗死锁修复与模型同行实时指标栏（TPS/TTFT/水位）。基于 CDP 运行时注入，不修改 App 原包。以 macOS 为主，附 Windows 与轻量路线原则。触发：安装/定制 Antigravity 主题、字体、配色、汉化补丁，或 Antigravity 设置按钮点不开。
---

# Antigravity 界面增强、暖色预设与无损注入工程指南 (`chuanban-antigravity-theme-patch`)
> **面向 AI Agent 的自动化落地执行说明书（v4 · 与 Notion Skill Page 权威源同步）**  
> **Notion 公开页**：https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554  
> **GitHub 发布页**：https://github.com/Anarcadia/chuanban-antigravity-theme-patch  

> 🧭 **这是一份一次性的安装说明书，读者是执行端 Agent。** 按「执行流程」走完一遍，就在用户机器上做好并装好一套属于他自己的 Antigravity 界面补丁。§0–§6 是原方案的核心设计与 macOS 实现，数值与选择器都经过实测，**请照原样执行，不要自行“优化”**；§7 Windows、§8 轻量路线只给原则，细节由你自行调研解决。
> 🕒 **最近版本更新记录（当前时间：2026-11-01 22:30）**
> - **2026-11-01（v4 现行）**：
> 	1. **新增 §4「前端 Bundle 静态全量扫描法 + 280+ 条全界面基准词典」**：针对 Radix UI 弹窗菜单（如 `+ Add Context`）与 TanStack Router 未打开设置子页面默认不挂载在 DOM 树导致初始汉化遗漏的问题，新增直接通过 CDP 拉取渲染端编译包（`./assets/index-*.js`）1 秒静态扫全所有隐藏菜单/设置项的审计脚本，并附带完整 280+ 条基准词典与 13 条动态正则，确保初次部署即 100% 零遗漏；
> 	2. **新增 §5.5【可选模块】输入框模型名称同行实时指标栏（TPS / TTFT / 256k 上下文水位 / Token 消耗 + 悬浮双层详情卡）**：基于 Node.js 22.5+ 原生 `node:sqlite` 零依赖只读解析本地 `~/.gemini/antigravity/conversations/<cascadeId>.db` 的 `gen_metadata` Protobuf 遥测表，配合 CDP `Runtime.addBinding` 实现切换会话 `< 5ms` 秒级刷新、`ResizeObserver` 严格锁定「左(模型)-中(仪表)-右(模式与发送)」三栏缩略与极窄（中间 `<150px`）自动跳至独立第二行；探针统一升级为 `20261101-metrics-v4`。
> - **2026-10-19（v2）**：界面排版扎实度与温润墨感（Solid Ink）深度实装；精准解耦左侧文件目录折叠标题（`📁 Root` 等）粗度过重问题；侧栏常规字重 450 与 0.2px 微润墨精细微调固化；探针升级为 `20261019-solid-consolidated-v2`。
> - **2026-10-17**：增补 Antigravity 新版模型选择器等未汉化词典；初步试验 UI 字重加固与排版质感提升。
> - **2026-10-13**：防白屏崩溃底层存储穿透修复（Codex 加固）；输入框独立引入 Codex 同款等宽粗衬线（`Sarasa Mono Slab SC`）；发布三大独立配色预设（高对比版/净白/复古深色）及 Google Drive 字体公开分享库。
## 执行流程（先读这里）
1. **确认环境**：操作系统、Antigravity 是否已安装并运行、本机是否有 Node.js（推荐 **Node.js `>= 22.5.0`**，原生内置 `globalThis.WebSocket` 与 `node:sqlite`，全程零第三方 npm 依赖；若仅用基础样式且 Node `< 21` 则需 `ws` 包）。
2. **向用户明确三件事并询问配色预设偏好**（一次问完）：
	- **【核心配色选择】询问用户使用哪一种配色方案**（直接列出以下三种选项，**默认首选为「1、高对比版」**）：
		- **1、高对比版**（推荐首选 / 默认）：暖燕麦浅色边栏 + 净白主区 + 极淡暖棕输入框，具有高对比度纯黑文字（#0A0A0A）与清晰界面主轮廓线；
		- **2、ClaudeDesktop 净白**：官方客户端纯净两栏微暖极净白，柔和细腻；
		- **3、复古深色**：原版浓郁黄棕牛皮纸双栏质感。
		*(若用户未特殊指定，直接部署「1、高对比版」)*。
	- 是否需要 §4 汉化与 §5 步骤 4 的设置死锁与缩放快捷键修复？（默认建议开启）
	- **【可选模块】是否开启 §5.5「模型名称同行实时指标栏（TPS / TTFT / 256k 上下文水位 / Token 消耗）」？**（默认建议开启；需本机 Node.js `>= 22.5.0` 以支持内置零依赖 `node:sqlite` 只读解析）
	- 是否只想改字体/颜色、不需要常驻守护？是 → 直接走 §8 轻量路线。
3. **安装字体与资源下载（Google Drive 公开共享库）**：
	- **【官方网盘源】Google Drive Public Share 字体库**：
		- **公开下载链接**：[https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC)
		- **已包含全套字体资源**：
			- **Anthropic 官方原版字体族**（无衬线 `AnthropicSans`、西文商业衬线 `AnthropicSerif`、等宽 `AnthropicMono`）；
			- **更纱黑体超集族**（`Sarasa-SuperTTC.ttc`，包含 `Sarasa UI SC`、`Sarasa UI Slab SC`、`Sarasa Mono Slab SC` 等全套粗细）。
	- **安装说明**：
		- macOS 可直接从上方网盘下载双击安装到系统字体册（或通过 `brew install --cask font-sarasa-gothic` 安装更纱）；
		- 安装后确认系统识别 `Sarasa UI SC`、`Sarasa UI Slab SC`、`Sarasa Mono Slab SC` 及 `Anthropic` 族名即可。
4. **写补丁**：按 §5 蓝图在用户目录下建一个独立文件夹（如 `~/.antigravity-patch/`），把守护进程、注入脚本、CSS、汉化字典分文件存放，便于维护与卸载。**汉化模块必须直接采用 §4 D 的 280+ 条全界面基准词典，并按 §4 B 运行一次「前端 Bundle 静态全量扫描脚本」做差量核对，严禁只靠扫描当前 DOM 采集词条（会漏掉所有未点开的弹窗菜单与设置子页）**。*注：若将前端注入脚本写在 Node.js 模板字符串 `` const INJECT_SCRIPT = `...` `` 内部，内部所有正则表达式反斜杠必须双写（如 `\\d`、`\\s`），或直接将前端脚本存为独立 `.js` 文件并用 `fs.readFileSync` 读取以避免二次转义！*
5. **配置常驻**：macOS 用 `launchd` 用户级 LaunchAgent（`~/Library/LaunchAgents/`，`RunAtLoad` + `KeepAlive`），日志写到补丁目录。
6. **验收**：逐条跑 §6 清单，全部通过再向用户汇报。
7. **交付**：告诉用户补丁目录位置、如何切换预设、以及卸载方法（停掉并删除 LaunchAgent → 结束守护进程 → 设置里切回 Default Light → 重启 Antigravity；补丁目录删掉即彻底干净）。
> ⚠️ 若 `DevToolsActivePort` 文件不存在，说明当前进程没开远程调试端口。自行调研让 Antigravity 带 `--remote-debugging-port` 启动的办法（并相应调整常驻方案），不要转而去改 App 包。CDP 只连 `127.0.0.1`，不要把端口暴露到外网。
---
## 0. 概要与设计意图
> **适用目标**：macOS 环境下的 Google Antigravity 客户端<br>**方案性质**：无侵入式动态运行时注入（基于 Chrome DevTools Protocol，不修改 App 原包签名）
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
### A. 预设 1：高对比版（`high-contrast`，推荐首选 / 当前默认）
针对日常高强度编码与长文本阅读调校，兼顾微暖护眼底色与极致锐利的文字轮廓识别度：
- **正文主区背景**（`--background`）：`#FCFCFB`（通透温润的微暖亮白，无反光刺眼感）
- **正文文字前景色**（`--foreground`）：`#1F1E1D`（高清晰度石墨深黑）
- **左侧导航栏背景**（`--sidebar`）：`#F7F5F0`（介于白色与原纸质底色之间的暖白燕麦色）
- **输入框卡片底色**（`--card` / `--card-border`）：底色 `#F9F7F2`（比正文略深、带有一抹极淡微暖棕色相），外轮廓线 `rgba(0, 0, 0, 0.35)`（立体清晰）
- **高对比轮廓与文字强化**：
	- **输入框底部文字/图标**：模型名称（Gemini 3.8 Flash 等）、Turbo 模式、状态图标颜色设为近乎纯黑深墨色 `#0A0A0A`（彻底去除原生 0.7 模糊灰度滤镜，与 Claude 桌面端一致）；
	- **主操作按钮轮廓**：「新建对话」、「历史对话」等胶囊按钮边框强化为 `rgba(0, 0, 0, 0.32)` 实线；
	- **三栏竖向中缝**：左侧栏、主内容区与辅助看板间的分隔竖线强化为清晰可见实线（`rgba(0, 0, 0, 0.28)`）。
### B. 预设 2：ClaudeDesktop 净白（`claude-desktop-purewhite`）
直接基于 Anthropic 官方桌面端进行像素级采样还原的纯净双栏版本：
- **主正文背景**（`--background`）：`#FCFCFB`
- **左侧栏背景**（`--sidebar`）：`#FBFBF9`（极浅中性燕麦冷灰白）
- **选中项背景**（`--sidebar-secondary`）：`#EDECE9`
- **悬停态底色**（`--sidebar-muted`）：`#F3F2EF`
- **中缝分割线**（`--sidebar-border`）：`#F0F0EE`（极细素净中性灰线）
- **视觉风格**：极简、现代、整体近乎纯白，通透开阔。
### C. 预设 3：复古深色（`vintage-deep` / 原 `absoulutely-chuanban`）
浓郁黄棕牛皮纸质感双栏，致敬复古羊皮纸手稿风格：
- **主正文背景**（`--background`）：`#FBF9F5`（经典暖象牙纸质）
- **正文前景色**（`--foreground`）：`#2C2B29`
- **强调色**（`--primary`）：`#D97757`（陶土砖红）
- **左侧栏背景**（`--sidebar`）：`#F1E8DC`（深牛皮纸暖黄）
- **选中态底色**（`--sidebar-secondary`）：`#E6DCCE`
- **边框线**（`--sidebar-border`）：`#E0D4C3`
### D. 官方原生默认浅色（Default Light）出厂复原标准
当用户在系统设置中切回官方 `Default Light` 时，补丁自动卸载所有自定义样式变量，100% 回退出厂状态：
- 背景色：`#F9F9F9`，前景色：`#101010`，强调色：`#007ACC`（微软蓝），侧边栏恢复出厂冷灰白。
---
## 3. 硬性指标 2：字体层次化排版（Typography Hierarchy）
本工程定义三套排版方案。**Agent 默认直接部署 A 方案（推荐首选配置）**，无需额外向用户询问确认；B 与 C 方案作为备选方案仅列出供技术参考与代码储备。
### 【首选配置】A 方案：Claude 官方原版书卷 + 更纱 Slab 深度融合（默认推荐）
融合 Claude 官方原版商业衬线（Tiempos Text）与更纱黑体/Slab，兼具古典书香阅读质感与 Codex 同款打字机工整感：
| 层级 | 覆盖范围 | 推荐字体族（CSS 声明） | 设计原因 |
| :--- | :--- | :--- | :--- |
| 1. UI 控件层 | 全局按钮、导航栏、侧栏标题、下拉菜单、Tabs、常规面板 | `'Anthropic Sans', 'Styrene B', system-ui, -apple-system, BlinkMacSystemFont, 'Sarasa UI SC', '更纱黑体 UI SC', sans-serif` | 西文使用 Claude 官方原版几何无衬线（Styrene B），中文无缝回退更纱 UI，现代规整。 |
| 2. 阅读正文层 | 对话区正文、Markdown 渲染区、`.prose`、`.markdown`、段落 `p`、列表 `li`、标题 `h1-h6` | `'Anthropic Serif', 'Tiempos Text', Georgia, Cambria, 'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', 'Sarasa Gothic SC', '更纱黑体 SC', serif` | **西文使用 Claude 官方原版 Anthropic Serif 书卷衬线**（行高 1.62、字距 -0.003em），**中文优先回退更纱粗衬线/黑体**，彻底消除官方原生硬塞苹方黑体所导致的“中西文拼凑割裂感”。 |
| 3. 代码与终端层 | `code`、`pre`、`.monaco-editor`、`.xterm` 终端、文件名与路径、diff 变更器 | `'Anthropic Mono', 'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', ui-monospace, SFMono-Regular, monospace` | Claude 官方等宽与更纱等宽双重保障，严格 1:2 中英等宽打字机版，字符对齐、符号分明。 |
| 4. 主输入框编辑区 | `div[contenteditable="true"]`、`textarea`、`[data-composer]`、`.ProseMirror` | `'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', 'Anthropic Mono', monospace` | **独立配置为 Codex 同款方案**：具备打字机板状粗衬线（Slab Serif）、数字 1 横底座与 0 带斜杠、严格 1:2 中西文等宽，打字手感与视觉极佳。 |
#### 附：界面排版扎实度与温润墨感渲染（Solid Ink Optimization）
为彻底解决更纱黑体在浅色暖底上笔画偏细、中西文排版略显散漫的问题，方案在 CSS 注入层附加了精细微调与解耦：
1. **字重分级饱满化与精细微削**：侧栏常规列表与对话条目收敛为 `font-weight: 450 !important;`（笔画舒展通透，消除复杂中文字糊死感）；选中激活态精准限定为 `520` 并纯黑化（`#0A0A0A`）；侧栏小标题设为沉静的 `500`（`#7A7670`）。
2. **项目目录标题精准解耦**：避免通用选择器误伤目录折叠按钮（`📁 Root` 等），将其精准限定为 `450` 并微弱化墨晕至 `0.15px`，与文件夹图标重回优雅平衡。
3. **微负字距凝聚**：侧边栏与常用按钮加入 `letter-spacing: -0.012em`，消除更纱黑体西文在窄栏界面的稀疏感。
4. **深暖炭墨色**：常规项使用 `#262422`，分类小标题设为 `#7A7670`。
5. **0.2px 精细润墨柔化**：通过 `text-shadow: 0 0 0.2px rgba(38, 36, 34, 0.35);` 模拟真实纸墨微晕扩散，抚平硬角，温润通透。
6. **控制栏加固**：输入框底部模型切换栏与状态图标同步设为 `#0A0A0A` 与 `500` 字重。
---
### 【备选方案】仅供 Agent 技术参考（不要求询问用户）
#### 备选 B 方案：纯血更纱黑体经典方案（全盘 Sarasa）
若运行环境未安装 Anthropic 官方 WebFont 字体，或用户偏好纯统一的更纱字体家族时采用：
- **UI 控件**：`'Sarasa UI SC', '更纱黑体 UI SC', system-ui, sans-serif`
- **阅读正文**：`'Sarasa UI Slab SC', '更纱黑体 UI Slab SC', 'Sarasa UI SC', sans-serif`
- **代码与终端**：`'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', ui-monospace, monospace`
- **输入框**：`'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', monospace`
#### 备选 C 方案：Claude 官方原生苹方方案（100% 还原官方原生回退）
若需要 100% 还原 Claude 网页版与官方桌面端出厂状态（西文衬线、中文粗暴回退苹方黑体）时采用：
- **UI 控件**：`'Anthropic Sans', 'Styrene B', system-ui, -apple-system, 'PingFang SC', sans-serif`
- **阅读正文**：`'Anthropic Serif', 'Tiempos Text', Georgia, 'PingFang SC', 'Microsoft YaHei', serif`（官方线上原生回退链）
- **代码与终端**：`'Anthropic Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace`
- **输入框**：继承 UI 字体（Anthropic Sans + 苹方）
---
## 4. 硬性指标 3：汉化范围、全量 Bundle 扫描法与严格排除边界（Localization Scope）
通过注入 DOM `TreeWalker` 与 `MutationObserver` 实现轻量实时界面汉化，重点降低日常操作认知负担。

### A. 为什么严禁仅靠扫描当前 DOM 采集词条？（Radix 按需挂载陷阱）
Antigravity 是基于 **React + Radix UI + TanStack Router** 的单页应用（SPA）：
- **所有弹出菜单（Popovers / Dropdowns）**：例如输入框左下角 `+` 号弹出的 `Add Context / Files / Folder / Mentions / Actions / Screen Recording / Drive` 菜单、模型切换菜单、模式切换菜单，在未点击时**完全不存在于 DOM 树中**（由 Radix Portal 在点击瞬间动态创建并挂载到 `document.body` 末尾）。
- **系统设置全部 15 个子页面（Settings Screens）**：如 `Notifications`（系统通知与提示音）、`Customizations`（Token 预算占用明细卡片、超限降级告警横幅）、`Browser`（CDP 高级参数）、`Execution`（终端沙盒策略）等，在未点开对应左侧 Tab 时**同样处于未挂载状态**。

> [!IMPORTANT]
> **执行铁律**：对面 Agent 在初次部署或版本升级巡检时，**严禁只读取当前页面的 `document.body.innerText`**。必须直接采用下方 **「B. 前端 Bundle 静态全量扫描法」** + **「C. 280+ 条全界面基准词典」**，确保无需人工逐一点开菜单即可 100% 覆盖所有未挂载界面。

### B. 前端 Bundle 静态全量扫描与差量审计法（Agent 初次部署必跑）
执行端 Agent 连接 CDP 后，直接通过 `Runtime.evaluate` 在渲染进程内拉取当前编译后的前端主包（`./assets/index-*.js`），1 秒内即可提取出所有设置项定义表（`label` + `description`）、Radix 弹窗菜单项（`DropdownMenuItem` / `PopoverContent`）与按钮无障碍提示（`aria-label` / `title`），并与本地 `I18N_DICT` 自动做差集比对：

```javascript
// Agent 初次汉化或升级巡检时通过 CDP Runtime.evaluate 执行的「全量未挂载界面词条扫描器」
(async () => {
  const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src);
  const mainScript = scripts.find(s => /\/assets\/index-.*\.js/.test(s)) || scripts[0];
  const code = await fetch(mainScript).then(r => r.text());

  // 1. 扫描全部系统设置子页面的 label 与 description 配置表（兼容 Vite/esbuild 单双引号）
  const settingsItems = [...code.matchAll(/label:\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1\s*,\s*description:\s*(["'])((?:(?!\3)[^\\]|\\.)*)\3/g)]
    .map(m => ({ label: m[2], description: m[4] }));

  // 2. 扫描全部 JSX 静态 UI 文本节点（含未挂载的 Radix 菜单、弹窗标题、告警横幅）
  const jsxTexts = [...new Set(
    [...code.matchAll(/children:\s*(["'])([A-Z][^"{}\n\\]{1,180})\1/g)].map(m => m[2].trim())
  )];

  // 3. 扫描全部图标按钮的 aria-label 与 title 悬停提示
  const ariaLabels = [...new Set(
    [...code.matchAll(/(?:aria-label|title)["']?\s*:\s*(["'])([A-Z][^"'\n]{1,80})\1/g)].map(m => m[2].trim())
  )];

  // 若已注入 window.__ag_i18n_dict，可直接过滤出尚未收录的新增英文词条
  const dict = window.__ag_i18n_dict || {};
  return {
    untranslatedSettings: settingsItems.filter(x => !dict[x.label] || !dict[x.description]),
    untranslatedJsxSample: jsxTexts.filter(t => !dict[t]).slice(0, 200),
    untranslatedAria: ariaLabels.filter(a => !dict[a])
  };
})();
```

### C. 严密保护区（绝对排除，禁止任何文本替换）
汉化遍历函数必须在进入前通过 `node.parentElement.closest(...)` 检查，命中以下任何选择器时**立刻跳过**：
- 代码块与终端：`code, pre, kbd, samp, [class*="language-"], .monaco-editor, .xterm`
- 智能体对话内容与 Markdown 文章正文：`.prose, .markdown, [class*="chat-message"]`
- 任何输入与编辑区：`input, textarea, [contenteditable="true"]`
- 文件树标题与文件路径：`[class*="group/file-title"], [class*="file-title"], [class*="file-path"], [data-path]`
- 实时性能指标胶囊与悬浮仪表盘：`#ag-live-metrics-pill, #ag-live-metrics-tooltip`

### D. 开箱即用的全界面基准词典（`I18N_DICT` 280+ 词条）与完整汉化执行引擎
执行端 Agent 部署时，**必须完整拷入以下经过实机验证的全量 `I18N_DICT` 与 `translateTextNode` 动态正则引擎**（已完整覆盖主界面、侧边栏、输入框 `+` 添加上下文菜单、系统通知与提示音面板、技能与自定义 Token 预算明细卡片及全部 15 个设置子页）：

```javascript
const I18N_DICT = {
  // --- 侧边栏与主导航 ---
  'New Conversation': '新建对话',
  'Conversation History': '历史对话',
  'Pinned Conversations': '置顶对话',
  'Automations': '自动化任务',
  'Customizations': '技能与自定义',
  'Projects': '项目管理',
  'CLI Project': 'CLI 项目',
  'No conversations yet': '暂无对话记录',
  'Settings': '系统设置',
  'Open IDE': '打开 IDE',
  'Load older messages': '加载更早消息',
  'Conversation Log': '会话日志',

  // --- 辅助面板（Auxiliary Pane）与通用标签 ---
  'Overview': '概览',
  'Review': '代码审查',
  'Subagents': '子代理',
  'Background Tasks': '后台任务',
  'Artifacts': '交付工件',
  'Files Changed': '文件变更',
  'Terminals': '终端会话',

  // --- 通用操作按钮 ---
  'Proceed': '确认执行',
  'Cancel': '取消',
  'Reject': '拒绝',
  'Copy': '复制',
  'Retry': '重试',
  'Submit': '提交',
  'Save': '保存',
  'Done': '完成',
  'Running': '运行中',
  'Completed': '已完成',
  'Failed': '失败',
  'See all': '查看全部',
  'Show All': '显示全部',
  'Open': '打开',
  'Close': '关闭',
  'Edit': '编辑',
  'Recommended': '推荐',
  'Sign Out': '退出登录',
  'Provide Feedback': '提供反馈',
  'Bug Report': '错误反馈 (Bug)',
  'Feature Request': '新功能建议',
  'Back': '返回',

  // --- 输入框「+ 添加上下文」弹窗与快捷操作 ---
  'Ask anything, @ to mention, / for actions': '向智能体提问，键入 @ 引用上下文，键入 / 调出快捷操作',
  'Running commands': '正在执行命令',
  'Add Context': '添加上下文',
  'Add context': '添加上下文',
  'Files': '文件',
  'Folder': '文件夹',
  'Mentions': '提及引用 (@)',
  'Actions': '快捷指令 (/)',
  'Screen Recording': '屏幕录制',
  'Drive': 'Google 云端硬盘',
  'Log in': '登录',
  'Set up': '配置',
  'Record voice memo': '录制语音输入',
  'Send message': '发送消息',

  // --- 主设置：分类导航 Tabs ---
  'General': '常规设置',
  'Application': '应用配置',
  'Appearance': '外观界面',
  'Models': '模型配置',
  'Conversations': '对话管理',
  'Shortcuts': '快捷键',
  'Keyboard shortcuts': '键盘快捷键',
  'Account': '用户账号',
  'Execution': '执行策略',
  'Queued Messages': '排队消息',
  'Global Permissions': '全局权限',
  'Tool Permissions': '工具权限',
  'Network Access Rules': '网络访问规则',
  'Agent Behavior': '代理行为',
  'Plan Review Policy': '计划审查策略',
  'Browser': '内置浏览器',
  'Browser Javascript Execution Policy': '浏览器 JS 执行策略',
  'Browser Actuation Rules': '浏览器操作规则',
  'Chat Settings': '聊天设置',
  'Editor Settings': '编辑器设置',
  'Marketplace': '插件市场',
  'Token Usage': 'Token 用量',
  'Mcp Tools': 'MCP 工具',
  'MCP Tools': 'MCP 工具',
  'Skills': '技能列表',
  'Plugins': '扩展插件',
  'Remote Control': '远程控制',
  'Notifications': '系统通知',
  'Advanced Settings': '高级设置',
  'Developer': '开发者模式',

  // --- 系统通知与提示音设置 (Notifications & Sound) ---
  'Manage your notification preferences.': '管理您的系统通知与提示音偏好设置。',
  'Enable Notifications for Agent': '启用智能体系统通知',
  'Show system notifications when your action is needed or the agent finishes.': '当需要您操作或智能体完成任务时显示系统通知。',
  'Sound': '提示音',
  'Enable Sounds for Agent': '启用智能体提示音',
  'Play a sound when your action is needed or the agent finishes.': '当需要您操作或智能体完成任务时播放提示音。',
  'Volume': '提示音量',
  'Set the volume of agent sounds.': '调节智能体提示音的音量大小。',
  'Chime volume': '提示音音量',
  'Notification Settings': '通知设置',
  "To modify notification settings, open your operating system's system preferences.": '如需修改通知设置，请前往 macOS 的系统设置进行配置。',

  // --- 技能与自定义 / Token 占用明细 (Customizations & Token Breakdown) ---
  'The breakdown below shows token usage from customizations like rules, skills, and MCP. If a budget is exceeded, large rules are demoted to path pointers and large customizations are excluded automatically.':
    '下方明细展示了规则、技能及 MCP 等自定义项的 Token 占用情况。若超出预算上限，体积较大的规则将自动降级为路径指针，过大的自定义项将被自动排除。',
  'Customization token budget exceeded. Large customizations are excluded from context.':
    '已超出自定义项 Token 预算上限，体积较大的自定义项已自动从上下文中排除。',
  'Rules and customization token budgets exceeded. Large rules are demoted to path pointers and large customizations are excluded from context.':
    '已超出规则与自定义项 Token 预算上限，较大规则已降级为路径指针，较大自定义项已从上下文中排除。',
  'Rules token budget exceeded. Large rules are demoted to path pointers.':
    '已超出规则 Token 预算上限，体积较大的规则已自动降级为路径指针。',
  'There are no customizations enabled.': '当前未启用任何自定义项。',
  'Loading token usage...': '正在加载 Token 占用数据...',
  'No token data available.': '暂无可用的 Token 占用数据。',
  'Loading workspace customizations...': '正在加载工作区自定义项...',
  'Hide breakdown': '收起明细',
  'Hide breakdowns': '收起明细',
  'Hide tools': '收起工具',
  'Excluded': '已排除',
  'Demoted': '已降级',
  'Default Customizations': '默认自定义项',
  'Include Jetski Default Customizations': '包含内置默认自定义项',
  'Include default customizations, such as default skills.': '包含系统内置的默认自定义项（如默认技能等）。',
  'Customize Global Skills': '管理全局技能',
  'Custom Agents': '自定义子代理',
  'MCP Servers': 'MCP 服务器',
  'Copy path': '复制路径',
  'Copy Path': '复制路径',
  'Path copied!': '路径已复制！',
  'Delete agent': '删除子代理',
  'Delete plugin': '删除插件',
  'Workspace': '工作区',
  'Local': '本地',
  'Global': '全局',
  'Configure default behaviors, skills, and MCP servers.': '配置默认行为、技能及 MCP 服务器。',
  'Build With Google Plugins': 'Build With Google 官方插件',
  'Browse and enable plugins from the Build With Google catalog.': '浏览并启用来自 Build With Google 目录的扩展插件。',
  'Customize': '自定义',
  'Configure external tools via Model Context Protocol.': '通过模型上下文协议 (Model Context Protocol) 配置外部工具。',
  'Not in Project': '未关联项目',
  'Rules': '项目规则',
  'Other Customizations': '其他自定义项',

  // --- 主设置：选项卡卡片、执行策略与沙盒安全 ---
  'Permission Preset': '权限预设',
  'Turbo': '极速模式 (Turbo)',
  'Strict': '严格模式 (Strict)',
  'Always Proceed': '直接执行 (Always Proceed)',
  'Request Review': '请求审查 (Request Review)',
  'Deny': '拒绝 (Deny)',
  'Allow': '允许 (Allow)',
  'Ask': '询问 (Ask)',
  'Send Immediately': '立即发送',
  'Queue': '排队等待',
  'Default': '默认',
  'Strong': '高对比度',
  'Default Light': '默认浅色',
  'Default Dark': '默认深色',
  'Light Theme': '浅色主题',
  'Dark Theme': '深色主题',
  'Theme': '主题模式',
  'Contrast': '对比度',
  'Background': '背景色',
  'Foreground': '前景色',
  'Accent': '强调色',
  'Verbose Agent Chat': '显示详细思考过程',
  'Conversation Width': '对话显示宽度',
  'Narrow': '居中紧凑',
  'Wide': '全宽铺开',
  'Fill': '铺满全宽',
  'Markdown Artifact Width': 'Markdown 工件显示宽度',
  'Configure the default width of markdown artifacts.': '配置 Markdown 交付工件的默认显示宽度。',
  'Context Menus': '右键快捷菜单',
  'Custom Context Menus': '自定义右键快捷菜单',
  'Replace the default browser right-click menu with quick actions.': '使用快捷操作菜单替换默认的浏览器右键菜单。',
  'Open Links In': '默认打开链接方式',
  'Choose where links open by default when clicked.': '选择点击链接时的默认打开位置。',
  'Side Panel': '右侧边栏',
  'Built-in Browser': '内置浏览器',
  'New Tab': '新标签页',
  'External Browser': '系统外部浏览器',
  'Inline Actions': '行内快捷操作卡片',
  'Show a floating notification card when background conversations need your input. Answer questions, approve commands, and grant permissions without leaving your current conversation. Share feedback at go/inline-actions-feedback.':
    '当后台会话需要您输入时显示浮动通知卡片，无需离开当前会话即可回答问题、批准命令或授予权限。',
  'Autonomous Mode': '全自主运行模式 (Autonomous)',
  'Adds an Autonomous Mode switch to the modes dropdown below the input box. Turns sent with it on run non-interactively: the agent does not ask questions or request new permissions.':
    '在输入框下方的模式菜单中增加“全自主模式”开关。开启后发送的轮次将以非交互方式运行：智能体不会向您提问或请求新的权限。',
  'Allow List Terminal Commands': '终端命令白名单 (Allow List)',
  'Deny List Terminal Commands': '终端命令黑名单 (Deny List)',
  'Terminal Command Auto Execution': '终端命令自动执行策略',
  'Proceed in Sandbox': '沙盒内自动执行',
  'Auto': '自动判断 (Auto)',
  'Enable Terminal Sandbox': '启用终端沙盒隔离',
  'Run terminal commands with sandbox restrictions.': '在沙盒安全限制下运行终端命令。',
  'Sandbox Allow Network': '允许沙盒访问网络',
  'Allow sandboxed commands to make network requests.': '允许在沙盒内运行的终端命令发起网络请求。',
  'Command Setup Script': '命令前置初始化脚本',
  'A shell setup script run before every command the agent executes.': '智能体在执行每条终端命令前自动运行的 Shell 环境初始化脚本。',
  'Agent Non-Workspace File Access': '允许访问工作区外文件',
  'Allow the agent to automatically view and edit files outside the current workspace. Use with caution: this gives the agent access to additional potentially-relevant information, but also allows the agent to access credential files, secrets, and other files outside of the workspace that could be targeted in prompt injection attacks or other exploits by malicious actors.':
    '允许智能体自动查看和编辑当前工作区目录以外的文件。请谨慎开启：这虽能提供更多参考信息，但也可能让智能体接触到工作区外的凭证或密钥文件。',
  'Strict Mode': '严格安全模式 (Strict Mode)',
  'Enforce settings that prevent the agent from autonomously running targeted exploits and require human review for all agent actions. Visit antigravity.google/docs/strict-mode for details.':
    '强制启用安全限制，防止智能体自主运行高风险操作，并要求所有智能体动作均经过人工审查。',
  'Review Policy': '工件审查策略',
  "Specifies the agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.":
    '指定智能体在创建文档工件（Artifacts）时请求人工审查的策略。',
  'Always Ask': '始终询问 (Always Ask)',
  'The agent always asks for review.': '智能体始终请求人工审查。',
  'Agent always asks for review.': '智能体始终请求人工审查。',

  // --- 应用配置、浏览器、快捷键、配额与账号 ---
  'Prevent Sleep': '防止电脑休眠',
  'Keep In Menu Bar': '保持在系统菜单栏',
  'Enable Remote Control': '启用远程控制',
  'Open System Preferences': '打开系统设置',
  'Toggle Sidebar': '切换侧边栏',
  'Toggle Auxiliary Pane': '切换辅助看板',
  'Toggle Terminal': '切换终端面板',
  'Archive This Conversation': '归档当前会话',
  'Toggle Maximize Auxiliary Pane': '最大化/还原辅助看板',
  'Toggle Overview Panel': '切换概览面板',
  'Configure agent execution, queued message delivery, and permissions.': '配置代理执行策略、排队消息发送及权限。',
  'Configure when follow-up messages are sent.': '配置后续追加消息的发送时机。',
  'Configure global allowed and denied resource permissions.': '配置全局允许与拒绝的系统资源访问权限。',
  'Learn more.': '了解更多。',
  'Learn more': '了解更多',
  'Controls the actions the agent can take.': '控制智能体可直接采取的系统操作范围。',
  'Modify permissions for file, terminal, and MCP tools.': '配置针对文件系统、终端和 MCP 工具的具体权限。',
  'Inherit Global': '继承全局 (Inherit Global)',
  'Folders': '项目目录',
  'Add Folder': '添加目录',
  '+ Add Folder': '+ 添加目录',
  'Permission Settings': '权限设置',
  'Also includes': '在此项目中同样包含',
  'when working in this project.': '。',
  'File Access Rules': '文件访问规则',
  'Configure allowed and denied paths for file reads and writes.': '配置文件读取与写入的允许和拒绝路径。',
  'Configure allowed and denied URLs for reading.': '配置文件读取中允许与拒绝的 URL 规则。',
  'Terminal Commands': '终端命令',
  'Configure allowed terminal commands.': '配置允许智能体执行的终端命令。',
  'Danger Zone': '危险区域',
  'Delete Project': '删除项目',
  'Permanently delete': '永久删除',
  'Delete': '删除',
  'Project': '项目',
  'including': '及',
  'Whether the agent asks you to review its documents.': '控制智能体在生成文档时是否请求您进行审查。',
  'Type': '键入',
  'and select': '并选择',
  'to have the agent generate a plan.': '让智能体生成计划。',
  'Configure the browser subagent. It requires': '配置内置浏览器子代理。需要安装',
  'to be installed. The browser subagent can be invoked by typing /browser in the conversation input box.': '。可以在对话输入框中键入 /browser 调出浏览器子代理。',
  'to be installed.': '。',
  'The browser subagent can be invoked by typing /browser in the conversation input box.': '可以在对话输入框中键入 /browser 调出浏览器子代理。',
  'Controls whether the agent can run custom JavaScript to automate complex browser actions.': '控制智能体是否可以运行自定义 JavaScript 以自动化复杂的浏览器操作。',
  'Configure allowed and denied URLs for browser actuation.': '配置允许和拒绝进行浏览器交互操作的 URL 规则。',
  'Enable Browser Tools': '启用浏览器工具',
  'Let the agent use browser tools to open URLs, read web pages, and interact with browser content. This gives the agent access to important (and often critical) knowledge and methods of validation, but any browser integration does increase exposure to external malicious parties for security exploits.':
    '允许智能体使用浏览器工具打开网址、读取网页并与页面内容交互。这能让智能体获取重要知识并完成验证，但接入浏览器也会增加遭受外部恶意内容攻击的风险。',
  'Disabled': '已禁用',
  'Block all browser JavaScript execution.': '禁止执行任何浏览器端 JavaScript 脚本。',
  'Prompt for approval before running browser scripts.': '在运行浏览器脚本前请求您的批准。',
  'Allow full browser script execution without prompting.': '允许直接执行所有浏览器脚本，无需每次询问。',
  'Advanced': '高级选项',
  'Chrome Binary Path': 'Chrome 可执行文件路径',
  'Path to the Chrome/Chromium executable. Leave empty for auto-detection.': 'Chrome/Chromium 可执行文件的绝对路径，留空则自动检测。',
  'Browser User Profile Path': '浏览器用户配置目录路径',
  'Custom path for the browser user profile directory. Leave empty for default (~/.gemini/antigravity-browser-profile).':
    '浏览器用户数据目录的自定义路径，留空则使用默认路径 (~/.gemini/antigravity-browser-profile)。',
  'Browser CDP Port': '浏览器 CDP 调试端口',
  'Port number for Chrome DevTools Protocol remote debugging. Leave empty for default (9222).':
    'Chrome DevTools Protocol 远程调试端口号，留空则使用默认值 (9222)。',
  'Manage Antigravity app settings.': '管理 Antigravity 客户端应用设置。',
  'Prevent the computer from sleeping while the app is running.': '在应用运行期间阻止系统进入休眠状态。',
  'Keep the app accessible from the menu bar and running in the background when all windows are closed.': '在所有窗口关闭后保持应用在后台运行，并可通过菜单栏快捷访问。',
  'Work with local agents from another device.': '允许从其他设备连接并协同本地智能体。',
  'Manage your conversations from the companion website.': '通过配套网页端远程管理您的本地会话。',
  'Nickname': '设备昵称',
  'A nickname for identifying this application in the companion website. Changing this will restart the connection.':
    '用于在配套网页端识别此客户端的设备昵称，修改后将重新建立连接。',
  'Updater': '软件更新',
  'Automatic Check for Updates': '自动检查更新',
  'Automatically prompt you to restart the app when a new update is available. When disabled, you can check for updates manually from the app menu.':
    '当有新版本可用时自动提示重启应用进行更新；关闭后仍可通过应用菜单手动检查更新。',
  'Version': '版本信息',
  'App version': '客户端版本',
  'Preset': '预设方案',
  'Choose the experience that fits how you work.': '选择适合您工作方式的界面体验。',
  'Choose between the Default and Project 4K experience.': '在默认体验与 Project 4K 体验之间进行切换。',
  'Configure editor-specific behaviors and shortcuts.': '配置编辑器专属行为与快捷键。',
  'Marketplace Item URL': '插件市场项目链接',
  'Marketplace Gallery URL': '插件市场画廊链接',
  'Selection Actions': '划词操作',
  'Show Selection Actions': '显示划词操作',
  'Show "Edit" and "Chat" buttons when selecting text in the editor.': '在编辑器中划选文本时显示“编辑”和“对话”按钮。',
  'To modify editor settings, open Settings within the editor window.': '如需修改编辑器设置，请在编辑器窗口内打开“设置”。',
  'Open Editor Settings': '打开编辑器设置',
  'Tab': 'Tab 补全',
  'Configure tab completion, suggestions, and navigation behavior.': '配置 Tab 补全、代码建议及导航行为。',
  'Keyboard shortcuts for quick navigation and control.': '用于快速导航与全局控制的键盘快捷键。',
  'Open Conversation Picker': '打开对话选择器',
  'Open File Search': '打开文件搜索',
  'Focus Input': '聚焦输入框',
  'Navigation': '导航控制',
  'File Picker': '文件选择器',
  'Select Previous Conversation': '切换到上一个对话',
  'Select Next Conversation': '切换到下一个对话',
  'Previous Pane Tab': '上一个面板标签页',
  'Next Pane Tab': '下一个面板标签页',
  'Open Settings': '打开系统设置',
  'Conversation': '对话操作',
  'Toggle Model Selector': '切换模型选择器',
  'Toggle Voice Recording': '切换语音输入录制',
  'Find in Pane': '在面板中查找',
  'Add to Chat/Quote': '添加至对话/引用',
  'Layout Controls': '界面布局控制',
  'Models & Usage': '模型与用量',
  'Manage your model quota and credits.': '管理您的模型配额与额度。',
  'Model Credits': '模型额度',
  'Enable AI Credit Overages': '启用 AI 超额抵扣',
  'Model Quota': '模型配额',
  'Gemini Models': 'Gemini 模型',
  'Claude and GPT models': 'Claude 与 GPT 模型',
  'Gemini 4 Argon': 'Gemini 4 Argon',
  'Gemini 4 Argon Weekly Limit': 'Gemini 4 Argon 每周限额',
  'Weekly Limit Remaining': '每周剩余额度',
  'Five Hour Limit Remaining': '5 小时剩余额度',
  "When toggled on, Antigravity will use your AI credits to fulfill model requests once you're out of model quota. Antigravity will always use your model quota first before using AI credits.":
    '开启后，当模型配额耗尽时，Antigravity 将使用您的 AI 点数来满足模型调用需求。Antigravity 始终优先消耗模型配额，然后再使用 AI 点数。',
  'Refresh quota and credits data': '刷新配额与额度数据',
  'See Activity': '查看消费明细',
  'Get More AI Credits': '获取更多 AI 点数',
  'Plan': '方案套餐',
  'Email': '电子邮箱',
  'Terms of Service': '服务条款',
  'By using this app, you agree to its': '使用此应用即表示您同意其',
  'Regroup Google3 Chats': '重新分组 Google3 会话',
  'Google3 chats will be regrouped into their workspaces in the sidebar.': 'Google3 对话将重新归类至侧边栏对应的各工作区中。',
  'Feedback Type': '反馈类型',
  'Auth and Billing': '认证与计费',
  'Remote Control Issue': '远程控制问题',
  'General Feedback': '常规反馈',
  'Description': '详细描述',
  'Steps to reproduce the issue': '复现步骤',
  'Expected behavior': '预期行为',
  'Actual behavior': '实际行为',
  'Any error messages': '任何错误信息',
  'Any relevant information': '其他相关信息',
  'Steps to Reproduce': '复现步骤',
  'Attach a screenshot (optional)': '附加屏幕截图（可选）',
  'Attach Antigravity server logs': '附加 Antigravity 服务端日志',
  'Visit': '访问',
  'Legal Help': '法律援助',
  'to ask for content changes for legal reasons.': '以出于法律原因申请内容变更。',
  "Configure the agent's visual theme and display preferences.": '配置智能体的视觉主题与界面显示偏好。',
  'Display and preserve intermediate thinking steps.': '显示并保留详细的中间思考过程。',
  'Configure the maximum width of the conversation panel.': '配置对话主界面的最大显示宽度。',
  'Manage project folders, agent settings, and permissions.': '管理项目目录、智能体设置及权限。',
  'Manage your plan, credentials, and general preferences.': '管理您的订阅方案、凭证及常规偏好。',
  'Enable Telemetry': '启用遥测数据上报',
  'When toggled on, Antigravity collects usage data to help Google enhance performance and features.': '开启后，Antigravity 将收集匿名使用数据以帮助 Google 改进性能与功能。',
  'Marketing Emails': '产品推广邮件',
  'Receive product updates, tips, and promotions from Google Antigravity via email.': '通过电子邮件接收 Google Antigravity 的产品更新、使用技巧和优惠信息。',
  'Your Plan:': '当前方案：',
  'You can upgrade to a Google AI Ultra plan to receive higher rate limits.': '您可以升级到 Google AI Ultra 方案以获得更高的配额速率限制。',
  'Upgrade': '升级方案'
};
```

配套的 `translateTextNode`（含 13 条动态正则）、`scanAndTranslate`（含 `title` / `aria-label` 悬停提示转换）与 `MutationObserver` 热监听：
> ⚠️ **模板字符串转义警告**：下方代码为标准前端 JS。若你将其存为独立文件（如 `inject-client.js`）并用 `fs.readFileSync` 读取后通过 CDP 注入，可直接原样复制；若你将其内联包裹在 Node.js 的反引号模板字符串（`` const INJECT_SCRIPT = `...` ``）中，**必须将正则与字符类中的所有单反斜杠 `\` 双写为 `\\`**（如 `\\d`、`\\s`、`\\.`、`\\(`、`\\u4e00`），否则外层模板字符串会吞掉单反斜杠导致正则失效！

```javascript
window.__ag_i18n_dict = I18N_DICT;

function isExcluded(node) {
  if (!node || !node.parentElement) return true;
  return !!node.parentElement.closest(
    'code, pre, kbd, samp, textarea, input, [contenteditable="true"], .prose, .markdown, [class*="chat-message"], [class*="group/file-title"], #ag-live-metrics-pill, #ag-live-metrics-tooltip'
  );
}

function translateTextNode(node) {
  if (isExcluded(node)) return;
  const raw = node.nodeValue;
  if (!raw) return;
  const trimmed = raw.trim();
  if (!trimmed) return;

  // 1. 静态词典精确匹配
  if (I18N_DICT[trimmed]) {
    const replacement = I18N_DICT[trimmed];
    if (/[\u4e00-\u9fa5]/.test(replacement) && /^\s*[a-zA-Z]+\s*$/.test(raw)) {
      node.nodeValue = replacement;
    } else {
      node.nodeValue = raw.replace(trimmed, replacement);
    }
    return;
  }

  // 2. 动态正则匹配（覆盖数量统计、耗时、Token 明细与配额重置倒计时，共 13 条）
  if (/^(\d+)\s+files?\s+changed$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^(\d+)\s+files?\s+changed$/i, '$1 个文件变更'); return;
  }
  if (/^See all\s*\((\d+)\)$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^See all\s*\((\d+)\)$/i, '查看全部 ($1)'); return;
  }
  if (/^Show\s+(\d+)\s+breakdowns?$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^Show\s+(\d+)\s+breakdowns?$/i, '展开明细 ($1 项)'); return;
  }
  if (/^(\d+)\s+tools?$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^(\d+)\s+tools?$/i, '$1 个工具'); return;
  }
  if (/^(\d+)\s+demoted$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^(\d+)\s+demoted$/i, '$1 项已降级'); return;
  }
  if (/^(\d+)\s+excluded$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^(\d+)\s+excluded$/i, '$1 项已排除'); return;
  }
  if (/^(\d+)\s+tools?\s+excluded$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^(\d+)\s+tools?\s+excluded$/i, '$1 个工具已排除'); return;
  }
  if (/^(\d+)\s+active\s+conversations$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^(\d+)\s+active\s+conversations$/i, '$1 个进行中的会话'); return;
  }
  if (/^Permanently delete\s+(.*)\s+including\s+(\d+)\s+active\s+conversations\.?$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^Permanently delete\s+(.*)\s+including\s+(\d+)\s+active\s+conversations\.?$/i, '永久删除 $1 及 $2 个进行中的会话。'); return;
  }
  if (/^Worked for\s+(\d+[smhd])$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^Worked for\s+(\d+[smhd])$/i, '已工作 $1'); return;
  }
  if (/^Thought for\s+(\d+[smhd])$/i.test(trimmed)) {
    node.nodeValue = raw.replace(/^Thought for\s+(\d+[smhd])$/i, '已思考 $1'); return;
  }
  if (/^You have used (some|all|most) of your (weekly|5-hour|five-hour|daily) limit,?\s*it will fully refresh in (.*)\.?$/i.test(trimmed)) {
    const match = trimmed.match(/^You have used (some|all|most) of your (weekly|5-hour|five-hour|daily) limit,?\s*it will fully refresh in (.*)\.?$/i);
    const degreeMap = { some: '部分', all: '全部', most: '大部分' };
    const typeMap = { weekly: '每周', '5-hour': '5 小时', 'five-hour': '5 小时', daily: '每日' };
    const timeStr = match[3].replace(/\.$/, '')
      .replace(/(\d+)\s*days?/gi, '$1 天').replace(/(\d+)\s*hours?/gi, '$1 小时')
      .replace(/(\d+)\s*minutes?/gi, '$1 分钟').replace(/(\d+)\s*seconds?/gi, '$1 秒')
      .replace(/,\s*/g, ' ').trim();
    node.nodeValue = '您已消耗' + (degreeMap[match[1].toLowerCase()] || match[1]) + (typeMap[match[2].toLowerCase()] || match[2]) + '额度，将在 ' + timeStr + ' 后完全重置。';
    return;
  }
  if (/^You have not used any of your (weekly|5-hour|five-hour|daily) limit\.?$/i.test(trimmed)) {
    const match = trimmed.match(/^You have not used any of your (weekly|5-hour|five-hour|daily) limit\.?$/i);
    const typeMap = { weekly: '每周', '5-hour': '5 小时', 'five-hour': '5 小时', daily: '每日' };
    node.nodeValue = '您尚未消耗任何' + (typeMap[match[1].toLowerCase()] || match[1]) + '额度。';
  }
}

function scanAndTranslate(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) translateTextNode(walker.currentNode);
  // 同步汉化按钮悬停提示与无障碍标签（如 "+" 按钮的 Add Context）
  const labeledEls = root.querySelectorAll ? root.querySelectorAll('[title], [aria-label]') : [];
  for (let i = 0; i < labeledEls.length; i++) {
    const el = labeledEls[i];
    const t = el.getAttribute('title');
    if (t && I18N_DICT[t.trim()]) el.setAttribute('title', I18N_DICT[t.trim()]);
    const a = el.getAttribute('aria-label');
    if (a && I18N_DICT[a.trim()]) el.setAttribute('aria-label', I18N_DICT[a.trim()]);
  }
}

scanAndTranslate();
if (window.__ag_i18n_observer) {
  try { window.__ag_i18n_observer.disconnect(); } catch (e) {}
}
let i18nPending = false;
window.__ag_i18n_observer = new MutationObserver(() => {
  if (i18nPending) return;
  i18nPending = true;
  requestAnimationFrame(() => {
    i18nPending = false;
    scanAndTranslate(document.body);
  });
});
if (document.body || document.documentElement) {
  window.__ag_i18n_observer.observe(document.body || document.documentElement, {
    childList: true, subtree: true, characterData: true
  });
}
```
---
## 5. 硬性指标 4：实现注入的核心架构逻辑（Agent 执行蓝图）
执行 Agent 可以通过以下步骤，在受体机器上完成全自动守护进程的部署：
```javascript
[Antigravity 运行]
       │ 监听端口文件
       ▼
[DevToolsActivePort] ──(读取端口)──► [Node.js 守护进程]
                                           │
                                           ├─► WebSocket 连接 CDP (Page/Runtime)
                                           ├─► 注入更纱 + Anthropic 字体分层 CSS (#ag-custom-fonts)
                                           ├─► 拦截 localStorage 同步 html[data-ag-preset]（防白屏）
                                           ├─► 挂载 SQLite + Protobuf 实时遥测胶囊与双层悬浮仪表盘
                                           └─► 捕获设置点击防死锁 + 恢复 Cmd+-/=/0 缩放快捷键
```
### 步骤 1：定位 CDP 调试端口
在 macOS 下，Antigravity 启动后会在用户目录下生成端口记录文件：
```javascript
~/Library/Application Support/Antigravity/DevToolsActivePort
```
- 读取该文件第一行即可获取当前活动的 CDP 监听端口（例如 `56626`）。
- 访问 `http://127.0.0.1:<PORT>/json` 获取活跃的目标页面列表，找到 `type === "page"` 且 URL 匹配主应用的 target，获取其 `webSocketDebuggerUrl`。
### 步骤 2：建立 WebSocket 通信并双通道注入
通过 WebSocket 建立与 CDP 的通信，并在目标页面中执行注入：
1. **持久注入（去重防累积）**：每个 CDP Session **仅调用一次** `Page.addScriptToEvaluateOnNewDocument`，并记录返回的 `session.newDocumentScriptId`。避免在窗口生命周期自愈或巡检时重复累积注入多份全局持久脚本。
2. **实时生效**：调用 CDP `Runtime.evaluate`，直接在当前已经打开的活跃页面中即时执行一次注入脚本。
### 步骤 3：在注入脚本中实现预设扩展与侧栏联动（防白屏崩溃设计）
> [!IMPORTANT]
> **React 崩溃陷阱警示**：Antigravity 内部外观设置组件（`Krc`）会在打开「系统设置」时同步渲染预设列表。其预设字典为内部模块硬编码，仅识别官方预设名（如 `Default Light`、`Catppuccin` 等）。若在 `localStorage.getItem("theme-preset-light")` 中写入自定义名称，设置弹窗在查找预设时会因找不到对象而抛出 `TypeError: Cannot read properties of undefined (reading 'background')`，导致整个 React 根节点卸载崩溃（即点击系统设置直接变白屏死锁）。
>
> **正解架构**：
> 1. `theme-preset-light` 必须始终对 React 维持合法的官方基准 `"Default Light"`。
> 2. 注入脚本挂载 `localStorage.getItem` 拦截器，若检测到自定义预设名一律安全回退至 `"Default Light"`，彻底免疫白屏崩溃。
> 3. **真实底层存储迁移**：清理历史脏数据时必须调用原型方法 `Storage.prototype.getItem.call(localStorage, "theme-preset-light")`，避免被已包装的方法遮蔽导致物理存储未真正迁移。
> 4. **DOM 注入脏检查**：仅在 `style.textContent` 与目标 CSS 不一致时才赋值，避免无意义的 DOM mutation 与性能损耗。
> 5. **三大预设调度与隔离**：支持 `high-contrast`（高对比版）、`claude-desktop-purewhite`（Claude 净白）与 `vintage-deep`（复古深色）。通过 `localStorage.getItem("theme-color-flavor")` 调度，默认为 `high-contrast`，切回官方出厂主题时自动撤销数据属性。
```javascript
// 1. 注入全局自定义样式标签 (#ag-custom-fonts)
let style = document.getElementById("ag-custom-fonts");
if (!style) {
  style = document.createElement("style");
  style.id = "ag-custom-fonts";
  (document.head || document.documentElement).appendChild(style);
}
if (style.textContent !== CSS_CONTENT) {
  style.textContent = CSS_CONTENT;
}

// 2. 三大预设状态联动与防崩溃保护
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

// 3. 拦截 localStorage 防止非官方预设名污染导致系统设置弹窗白屏崩溃
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
// ⚠️ 注意：必须与步骤 5 checkAndHeal 的探针版本完全一致，否则会触发每 2.5s 无限重注入！
window.__ag_patch_version = "20261101-metrics-v4";
```
配套完整 CSS 规则（已统一采用 `[id="antigravity.agentSidePanelInputBox"]` 属性选择器，无论在独立 `.css` 文件还是在 JS 模板字符串 `const CSS_CONTENT = \`...\`` 中均 100% 免转义通用）：
```css
/* 0. 显式映射本机已安装的 Anthropic 官方原版字体 */
@font-face {
  font-family: 'Anthropic Serif';
  src: local('Anthropic Serif Web Text Regular'), local('AnthropicSerif-Regular'), local('Anthropic Serif Web');
  font-weight: 400; font-style: normal;
}
@font-face {
  font-family: 'Anthropic Serif';
  src: local('Anthropic Serif Web Text Italic'), local('AnthropicSerif-Italic');
  font-weight: 400; font-style: italic;
}
@font-face {
  font-family: 'Anthropic Serif';
  src: local('Anthropic Serif Web Text Semibold'), local('AnthropicSerif-Semibold');
  font-weight: 500 700; font-style: normal;
}
@font-face {
  font-family: 'Anthropic Sans';
  src: local('Anthropic Sans Web Text Regular'), local('AnthropicSans-Regular'), local('Anthropic Sans Web');
  font-weight: 400; font-style: normal;
}
@font-face {
  font-family: 'Anthropic Sans';
  src: local('Anthropic Sans Web Text Semibold'), local('AnthropicSans-Semibold');
  font-weight: 500 700; font-style: normal;
}

/* 1. 四层字体排版体系 (A 方案：Claude 原版书卷 + 更纱 Slab 深度融合) */
:root {
  --font-sans: 'Anthropic Sans', 'Styrene B', system-ui, -apple-system, BlinkMacSystemFont, 'Sarasa UI SC', '更纱黑体 UI SC', sans-serif !important;
  --font-mono: 'Anthropic Mono', 'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', ui-monospace, SFMono-Regular, monospace !important;
  --vscode-font-family: 'Anthropic Sans', 'Styrene B', system-ui, -apple-system, BlinkMacSystemFont, 'Sarasa UI SC', '更纱黑体 UI SC', sans-serif !important;
  --vscode-editor-font-family: 'Anthropic Mono', 'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', ui-monospace, SFMono-Regular, monospace !important;
  --vscode-chat-font-family: 'Anthropic Serif', 'Tiempos Text', Georgia, Cambria, 'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', 'Sarasa Gothic SC', '更纱黑体 SC', serif !important;
}
body, html {
  font-family: var(--font-sans) !important;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.prose, .markdown, [class*="markdown"], [class*="prose"], .select-text p, .select-text li, .select-text ol, .select-text ul, .select-text blockquote, .select-text h1, .select-text h2, .select-text h3, .select-text h4 {
  font-family: var(--vscode-chat-font-family) !important;
  line-height: 1.62;
  letter-spacing: -0.003em;
}
code, pre, kbd, samp, [class*="font-mono"], .monaco-editor, .xterm, [class*="terminal"], [class*="code-block"], .select-text code, .select-text pre, .select-text pre span {
  font-family: var(--font-mono) !important;
  font-variant-ligatures: none;
}
div[contenteditable="true"], textarea, input[type="text"], input[type="search"], [role="textbox"], .ProseMirror {
  font-family: 'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', 'Anthropic Mono', monospace !important;
  letter-spacing: 0.01em;
}

/* 2. 预设 1：高对比版（当前默认） */
html[data-ag-preset="chuanban-warm-white"] body.theme-light,
html[data-ag-preset="high-contrast"] body.theme-light {
  --background: #FCFCFB !important;
  --foreground: #1F1E1D !important;
  --primary: #D97757 !important;
  --accent: #D97757 !important;
  --sidebar: #F7F5F0 !important;
  --sidebar-secondary: #ECE9E1 !important;
  --sidebar-muted: #F2EFE9 !important;
  --sidebar-border: rgba(0, 0, 0, 0.35) !important;
  --border: rgba(0, 0, 0, 0.38) !important;
  --vscode-sideBar-background: #F7F5F0 !important;
  --card: #F9F7F2 !important;
  --card-border: rgba(0, 0, 0, 0.35) !important;
  --secondary-foreground: #0A0A0A !important;
  --muted-foreground: #1A1A1A !important;
}
html[data-ag-preset="chuanban-warm-white"] .bg-sidebar,
html[data-ag-preset="high-contrast"] .bg-sidebar { background-color: var(--sidebar) !important; }
html[data-ag-preset="chuanban-warm-white"] body,
html[data-ag-preset="high-contrast"] body { background-color: var(--background) !important; color: var(--foreground) !important; }
html[data-ag-preset="chuanban-warm-white"] [id="antigravity.agentSidePanelInputBox"],
html[data-ag-preset="high-contrast"] [id="antigravity.agentSidePanelInputBox"] { background-color: var(--card-border) !important; }
html[data-ag-preset="chuanban-warm-white"] [id="antigravity.agentSidePanelInputBox"] > div.bg-card,
html[data-ag-preset="high-contrast"] [id="antigravity.agentSidePanelInputBox"] > div.bg-card { background-color: var(--card) !important; }
html[data-ag-preset="chuanban-warm-white"] a[class*="inline-flex items-center"],
html[data-ag-preset="high-contrast"] a[class*="inline-flex items-center"],
html[data-ag-preset="chuanban-warm-white"] .bg-sidebar a,
html[data-ag-preset="high-contrast"] .bg-sidebar a,
html[data-ag-preset="chuanban-warm-white"] .bg-sidebar button,
html[data-ag-preset="high-contrast"] .bg-sidebar button { border-color: rgba(0, 0, 0, 0.32) !important; }
html[data-ag-preset="chuanban-warm-white"] .bg-border,
html[data-ag-preset="high-contrast"] .bg-border { background-color: rgba(0, 0, 0, 0.28) !important; }
html[data-ag-preset="chuanban-warm-white"] [id="antigravity.agentSidePanelInputBox"] [class*="text-secondary-foreground"],
html[data-ag-preset="high-contrast"] [id="antigravity.agentSidePanelInputBox"] [class*="text-secondary-foreground"],
html[data-ag-preset="chuanban-warm-white"] [id="antigravity.agentSidePanelInputBox"] button,
html[data-ag-preset="high-contrast"] [id="antigravity.agentSidePanelInputBox"] button,
html[data-ag-preset="chuanban-warm-white"] [id="antigravity.agentSidePanelInputBox"] span,
html[data-ag-preset="high-contrast"] [id="antigravity.agentSidePanelInputBox"] span,
html[data-ag-preset="chuanban-warm-white"] [id="antigravity.agentSidePanelInputBox"] svg,
html[data-ag-preset="high-contrast"] [id="antigravity.agentSidePanelInputBox"] svg { color: #0A0A0A !important; opacity: 1 !important; }

/* 3. 预设 2：ClaudeDesktop 净白 */
html[data-ag-preset="claude-desktop-official"] body.theme-light,
html[data-ag-preset="claude-desktop-purewhite"] body.theme-light {
  --background: #FCFCFB !important;
  --foreground: #141413 !important;
  --primary: #D97757 !important;
  --accent: #D97757 !important;
  --sidebar: #FBFBF9 !important;
  --sidebar-secondary: #EDECE9 !important;
  --sidebar-muted: #F3F2EF !important;
  --sidebar-border: #F0F0EE !important;
  --border: #E8E6E1 !important;
  --vscode-sideBar-background: #FBFBF9 !important;
}
html[data-ag-preset="claude-desktop-official"] .bg-sidebar,
html[data-ag-preset="claude-desktop-purewhite"] .bg-sidebar { background-color: var(--sidebar) !important; }
html[data-ag-preset="claude-desktop-official"] body,
html[data-ag-preset="claude-desktop-purewhite"] body { background-color: var(--background) !important; color: var(--foreground) !important; }

/* 4. 预设 3：复古深色 */
html[data-ag-preset="absoulutely-chuanban"] body.theme-light,
html[data-ag-preset="vintage-deep"] body.theme-light {
  --background: #FBF9F5 !important;
  --foreground: #2C2B29 !important;
  --primary: #D97757 !important;
  --accent: #D97757 !important;
  --sidebar: #F1E8DC !important;
  --sidebar-secondary: #E6DCCE !important;
  --sidebar-muted: #EAE0D2 !important;
  --sidebar-border: #E0D4C3 !important;
  --border: #E2D7C7 !important;
  --vscode-sideBar-background: #F1E8DC !important;
}
html[data-ag-preset="absoulutely-chuanban"] .bg-sidebar,
html[data-ag-preset="vintage-deep"] .bg-sidebar { background-color: var(--sidebar) !important; }
html[data-ag-preset="absoulutely-chuanban"] body,
html[data-ag-preset="vintage-deep"] body { background-color: var(--background) !important; color: var(--foreground) !important; }

/* 5. 界面排版扎实度与温润墨感渲染（Solid Ink Optimization） */
.bg-sidebar a, .bg-sidebar button, .bg-sidebar [class*="truncate"], .bg-sidebar [class*="text-sm"], .bg-sidebar [class*="text-xs"], aside a, aside button {
  font-weight: 450 !important; letter-spacing: -0.012em !important; color: #262422 !important; text-rendering: optimizeLegibility; text-shadow: 0 0 0.2px rgba(38, 36, 34, 0.35);
}
button[data-testid="project-header"], button[data-project-card="true"], [data-project-label], [data-subtext] span[class*="text-muted"], span:has(> svg) + span {
  font-weight: 450 !important; color: #383533 !important; text-shadow: 0 0 0.15px rgba(38, 36, 34, 0.25) !important;
}
button[data-testid="project-header"] span, button[data-project-card="true"] span {
  font-weight: 450 !important; color: #2C2B29 !important; text-shadow: 0 0 0.15px rgba(38, 36, 34, 0.25) !important; letter-spacing: -0.01em !important;
}
[data-testid="conversation-row-sidebar"][data-selected="true"], [data-testid="conversation-row-sidebar"][data-selected="true"] span, .bg-sidebar [data-active="true"], .bg-sidebar [data-active="true"] span, .bg-sidebar [aria-selected="true"] {
  font-weight: 520 !important; color: #0A0A0A !important; text-shadow: 0 0 0.25px rgba(10, 10, 10, 0.4);
}
.bg-sidebar [class*="text-muted"], .bg-sidebar [class*="text-[11px]"], .bg-sidebar [class*="uppercase"] {
  font-weight: 500 !important; letter-spacing: -0.005em !important; color: #7A7670 !important;
}
button, [role="button"], select { letter-spacing: -0.012em; }
[id="antigravity.agentSidePanelInputBox"] [class*="text-secondary-foreground"], [id="antigravity.agentSidePanelInputBox"] button, [id="antigravity.agentSidePanelInputBox"] span {
  font-weight: 500 !important; letter-spacing: -0.012em !important; text-shadow: 0 0 0.25px rgba(10, 10, 10, 0.4);
}
```
### 步骤 4：修复 TanStack Router 弹窗死锁 Bug 与缩放快捷键缺陷
1. **修复设置弹窗死锁**：Antigravity 内部采用 TanStack Router 管理设置页面路由。当用户快速点击左下角设置按钮，或在弹窗退出动画期间再次点击时，URL 会残留 `settingsOpen=true`，但实际 Dialog 节点已被卸载。此时再次点击设置按钮，Router 判定状态未发生变化（No-op），导致用户再也点不开系统设置。
2. **修复页面缩放快捷键失效**：Antigravity 官方在桌面端将 `zoomIn`/`zoomOut` 按键绑定设为空数组 `[]`，且 macOS 菜单 role 事件被 `<webview>` 隔离。在捕获阶段直接桥接 `window.electronNative` 即可恢复 `Cmd + -` / `Cmd + =` / `Cmd + 0`。
```javascript
// 4.1 捕获阶段破除设置弹窗路由死锁并保留路由 State
if (!window.__ag_settings_guard_installed) {
  window.__ag_settings_guard_installed = true;
  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest && e.target.closest('[data-testid="settings-button"]');
    if (!btn) return;

    const hasDialog = !!document.querySelector('[role="dialog"]');
    const urlHasSettings = window.location.search.includes("settingsOpen=true");

    if (!hasDialog && urlHasSettings) {
      const url = new URL(window.location.href);
      url.searchParams.delete("settingsOpen");
      url.searchParams.delete("settingsScreen");
      // 必须保留 window.history.state，避免抹去 TanStack Router 的 __TSR_key / __TSR_index
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, true);
}

// 4.2 恢复 Cmd + - / Cmd + = / Cmd + 0 界面缩放快捷键
if (!window.__ag_zoom_guard_installed) {
  window.__ag_zoom_guard_installed = true;
  window.addEventListener("keydown", (e) => {
    if (e.metaKey && !e.ctrlKey && !e.altKey) {
      if (!e.shiftKey && (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract" || e.keyCode === 189)) {
        e.preventDefault(); e.stopPropagation(); window.electronNative?.zoomOut?.();
      } else if (e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd" || e.keyCode === 187) {
        e.preventDefault(); e.stopPropagation(); window.electronNative?.zoomIn?.();
      } else if (!e.shiftKey && (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0" || e.keyCode === 48)) {
        e.preventDefault(); e.stopPropagation(); window.electronNative?.zoomReset?.();
      }
    }
  }, true);
}
```
### 步骤 5：自愈巡检与常驻运行（完整 CDP 通信骨架）
- 守护脚本使用 `setInterval(sync, 2500)` 定期检查目标页面的样式与探针版本（**必须与步骤 3 中的 `window.__ag_patch_version` 完全一致**）：
```javascript
const activeSockets = new Map(); // targetId -> { ws, pendingRequests, isInjecting, isChecking, lastPushedSig }
let rpcCounter = 1;

function sendCDP(session, method, params = {}) {
  return new Promise((resolve, reject) => {
    const { ws, pendingRequests } = session;
    if (!ws || ws.readyState !== 1) return reject(new Error('WebSocket not connected'));
    const id = rpcCounter++;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`CDP request ${method} timed out`));
    }, 4000);
    pendingRequests.set(id, { resolve, reject, timer, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function inject(session, targetId) {
  if (session.isInjecting) return;
  session.isInjecting = true;
  try {
    if (!session.newDocumentScriptId) {
      const reg = await sendCDP(session, 'Page.addScriptToEvaluateOnNewDocument', { source: INJECT_SCRIPT });
      session.newDocumentScriptId = reg.identifier;
    }
    await sendCDP(session, 'Runtime.evaluate', { expression: INJECT_SCRIPT, returnByValue: true });
    session.lastPushedSig = '';
  } catch (err) {
    console.error(`[Daemon] Injection failed on ${targetId}:`, err.message || err);
  } finally {
    session.isInjecting = false;
  }
  if (typeof syncMetricsForSession === 'function') await syncMetricsForSession(session);
}

async function checkAndHeal(session, targetId) {
  if (session.isChecking || session.isInjecting) return;
  session.isChecking = true;
  try {
    const res = await sendCDP(session, 'Runtime.evaluate', {
      expression: 'Boolean(document.getElementById("ag-custom-fonts") && window.__ag_patch_version === "20261101-metrics-v4")',
      returnByValue: true
    });
    if (res?.result?.value !== true) await inject(session, targetId);
  } catch {} finally {
    session.isChecking = false;
  }
}
```
- 在用户机器上，可通过用户的 `launchd` 启动项（`~/Library/LaunchAgents/`）维持守护进程生命周期。
---
## 5.5 【可选模块】模型名称同行实时指标栏（TPS / TTFT / 256k 上下文水位 / Token 消耗）
> **模块定位**：可选增强模块（推荐开启）。在输入框底部与模型选择器（如 `Gemini 4 Argon Medium ^`）同行右侧实时渲染**「方案 C：性能 + 256k 上下文压缩水位线」**紧凑胶囊，并在鼠标悬停时弹出包含**「本轮最新调用明细 + 当前会话累计统计」**的双层详情卡。
### A. 遥测数据源具体路径与 Protobuf 底层结构
Antigravity 客户端虽未在原生 UI 暴露每轮 TPS 与 Token 消耗面板，但其底层引擎在每次模型调用（`PLANNER_RESPONSE`）完成时，会将完整遥测结构以二进制 Protobuf 实时写入本地 SQLite 数据库：
1. **具体文件路径**：
	- **SQLite 数据库路径（macOS / Linux）**：`~/.gemini/antigravity/conversations/<cascadeId>.db`（含实时活跃写入的 WAL 日志 `<cascadeId>.db-wal`）
	- **SQLite 数据库路径（Windows）**：`%USERPROFILE%\.gemini\antigravity\conversations\<cascadeId>.db`
	- **当前会话 **`<cascadeId>`** 提取方式**：在渲染进程中读取 `window.location.pathname` 匹配 `/\/c\/([0-9a-f-]{36})/i`（或 URL 参数 `?cascadeId=`）。
2. **核心表结构与 Protobuf Wire 字段映射（零外部依赖解码）**：
	- **`gen_metadata (idx INTEGER PRIMARY KEY, data BLOB)`**：按生成次序存储 `CortexStepGeneratorMetadata` 二进制块。无需 `.proto` 编译依赖，直接按 Protobuf Wire Format（`wt=0` Varint，`wt=2` Length-delimited）读取以下字段号：
		- **Top-level Field ****`1`**（`ChatModelMetadata`，length-delimited 子消息）：
			- **Field ****`4`**（`ModelUsageStats`，length-delimited 子消息）：
				- `2` (`input_tokens`, varint)：本步新增未命中缓存的输入 Token
				- `3` (`output_tokens`, varint)：本步总输出 Token（等于 `thinking + response`）
				- `4` (`cache_write_tokens`, varint)：本步缓存写入 Token
				- `5` (`cache_read_tokens`, varint)：本步缓存命中读取 Token
				- `9` (`thinking_output_tokens`, varint)：本步思考链（Reasoning）消耗 Token
				- `10` (`response_output_tokens`, varint)：本步正文与工具调用输出 Token
			- **Field ****`11`**（`time_to_first_token`，`google.protobuf.Duration` 子消息）：`1` = `seconds` (varint)，`2` = `nanos` (varint)，首字延迟秒数 `ttft = seconds + nanos / 1e9`
			- **Field ****`12`**（`streaming_duration`，`google.protobuf.Duration` 子消息）：`1` = `seconds` (varint)，`2` = `nanos` (varint)，流式生成秒数 `stream = seconds + nanos / 1e9`
	- **`steps (idx INTEGER PRIMARY KEY, step_type INTEGER, data BLOB)`**：
		- `step_type = 14` 代表用户提问（`USER_INPUT`）；`step_type = 15` 代表模型响应步骤（`PLANNER_RESPONSE`，其行序与 `gen_metadata` 的 `idx` 一一对应）。
		- **单轮多步聚合逻辑**：取最后一个 `step_type = 14` 的 `idx` 为 `lastUserStepIdx`，所有 `plannerSteps[i].idx > lastUserStepIdx` 的模型调用均属于当前这一轮用户提问触发的连续工具链调用。
### B. 核心指标计算口径与公式
- **当前上下文总占用（**`Ctx`**）**：`ctx = input_tokens + cache_read_tokens`（代表最新一次请求实际送入模型窗口的完整上下文 Token 数）。
- **256k 自动压缩水位线**：Antigravity 内置 `checkpointer` 在上下文达到 **`256,000`**** tokens** 时触发截断压缩。水位百分比 `ctxPct = Math.round((ctx / 256000) * 100)`：
	- `< 75%`：常态深炭墨色；
	- `75% – 89%`：琥珀橙预警（`.ag-ctx-warn { color: #B45309 }`）；
	- `>= 90%`：朱红临近压缩告警（`.ag-ctx-crit { color: #DC2626 }`）。
- **生成速度（**`TPS`**）双轨防失真口径**：
	- **流式生成速度**：`streamTps = output_tokens / streaming_duration`（当 `streaming_duration >= 0.25s` 且 `streamTps <= 600` 时优先采用，真实反映输出流吐字速率）；
	- **端到端生成速度**：`e2eTps = output_tokens / (ttft + streaming_duration)`（当遇到纯工具调用步被服务端整包缓冲下发、`streaming_duration` 仅数毫秒导致流式 TPS 虚高失真时，自动回退展示端到端 TPS）。
### C. UI 挂载路径与「左-中-右 / 极窄跳第二行」防错位铁律（必读）
1. **同行挂载路径与严格三栏拓扑**：
	- 目标输入框根节点：`#antigravity.agentSidePanelInputBox`
	- 底部第一行控制栏（`bottomRow`）：`div.@container/input-footer.flex.w-full.items-center.justify-between`
	- **左（Left）**：`bottomRow.children[0]` 内的 `+` 按钮与模型选择器（`Gemini 4 Argon Medium ^`），保持 `flex-shrink: 0`；
	- **中（Middle，常态 `data-ag-row-mode="middle"`）**：`#ag-live-metrics-pill` 挂载在 `bottomRow.children[0]`（`leftGroup`）内部末尾，物理位置严格处于左侧模型选择器与右侧按钮组正中间，随允许宽度通过 `text-overflow: ellipsis` 平滑缩略；
	- **右（Right）**：`bottomRow.children[1]`（`rightGroup`：模式选择器 + 语音 + 发送按钮），强制 `flex-shrink: 0 !important; margin-left: auto !important`，永远钉在页面最右边。
2. **三条防错位布局铁律**：
	- **铁律 1（严禁把胶囊 append 到 `bottomRow` 末尾或依赖 `@container` 自查询）**：`bottomRow` 自身就是 `@container/input-footer`，CSS 规范中容器不能在 `@container` 中查询自身（会导致 `flex-wrap: wrap` 失效，若把胶囊塞进 `bottomRow` 末尾就会跑到发送按钮右边造成错位！）。
	- **铁律 2（中间 `< 150px` 物理跳至独立第二行 + `ResizeObserver` 零延迟重排）**：实时计算第一行中间剩余可用宽度 `availMiddleW = bottomRow.clientWidth - leftFixedW - rightFixedW - 14`。当 `availMiddleW < 150px`（缩略到连 `TPS + TTFT` 都将受损）时，立即切换 `data-ag-row-mode="bottom"`，并通过 `bottomRow.after(pill)` 将胶囊物理挂载到外层垂直列容器 `div.surface-composer-card.flex.flex-col` 中作为独立第二行；同时在 `bottomRow` 上绑定 `ResizeObserver` 确保窗口缩放 0ms 响应。
	- **铁律 3（Tooltip 必须挂载于 `document.body`）**：输入框外层祖先含有 `overflow-hidden`。悬浮详情卡片 `#ag-live-metrics-tooltip` **严禁作为子元素挂在胶囊内部**，必须直接 `document.body.appendChild(tt)` 并采用 `position: fixed` + `getBoundingClientRect()` 动态定位。
3. **悬浮上浮渐变阴影双层仪表盘（`#ag-live-metrics-tooltip`）硬性视觉与动效规范（严禁降级为原生 `title` 或简陋黑框）**：
	- **禁止降级声明**：执行端 Agent **严禁**偷懒使用 HTML 原生 `title="..."` 属性或简陋黑底 Tooltip！必须按以下参数 1:1 实现纸感上浮双层遥测仪表盘：
	- **纸质底色与双层环境渐变阴影（Surface & Elevation）**：
		- 底色与边框：`background-color: var(--card, #F9F7F2) !important`（自动联动当前预设的微暖纸张底色），边框 `1px solid var(--card-border, rgba(0, 0, 0, 0.35)) !important`，圆角 `8px`，内边距 `10px 12px`，宽度 `min-width: 370px; max-width: 450px`；
		- 双层立体阴影：`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08)`（外层 24px 柔和漫反射环境阴影 + 内层 6px 接触面锐利阴影，营造悬浮于输入框上方的真实卡片层次）。
	- **4px 轻盈上浮渐显动效（Upward Float Micro-Animation）**：
		- 隐藏态：`opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(4px);`
		- 激活态（`[data-visible="1"]`）：`opacity: 1 !important; visibility: visible !important; transform: translateY(0);`
		- 动效曲线：`transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s;`（鼠标移入时从胶囊正上方 `8px` 处伴随 `4px` 上浮与透明度渐变丝滑浮现）。
	- **双层等宽对齐数据网格（Two-Tier Tabular Grid）**：
		- 字体：`font-family: var(--font-mono) !important; font-variant-numeric: tabular-nums; font-size: 11px !important; line-height: 1.55 !important;`
		- 分区标题（`.ag-tt-hdr`）：纯黑 `#0A0A0A`、`font-weight: 600`，带底部细分割线 `border-bottom: 1px solid rgba(0, 0, 0, 0.14)`，分为上半区「**本轮最新调用 (Gen #N)**」与下半区「**当前会话累计 (X 轮提问 / Y 次模型调用)**」；
		- 左右对齐行（`.ag-tt-row`）：`display: flex; justify-content: space-between; gap: 10px;`，左列标签 `.ag-tt-lbl` 采用暖灰棕 `#57534E`，右列数值 `.ag-tt-val` 采用纯黑 `#0A0A0A`（`font-weight: 500`、右对齐），子项间用 ` | ` 分隔。

### D. 完整实现代码（直接并入守护进程）
#### 1. 附加 CSS 规则（并入 `CSS_CONTENT` 末尾）
```css
/* 严格锁定左(模型) - 中(指标胶囊) - 右(模式与发送按钮)三栏布局 */
[id="antigravity.agentSidePanelInputBox"] div[data-ag-row-mode="middle"] > div:first-child,
[id="antigravity.agentSidePanelInputBox"] div[data-ag-row-mode="bottom"] > div:first-child {
  overflow: hidden !important; min-width: 0 !important;
}
[id="antigravity.agentSidePanelInputBox"] div[data-ag-row-mode="middle"] > div:first-child > *:not(#ag-live-metrics-pill),
[id="antigravity.agentSidePanelInputBox"] div[data-ag-row-mode="bottom"] > div:first-child > *:not(#ag-live-metrics-pill) {
  flex-shrink: 0 !important;
}
[id="antigravity.agentSidePanelInputBox"] div[data-ag-row-mode="middle"] > div:last-child,
[id="antigravity.agentSidePanelInputBox"] div[data-ag-row-mode="bottom"] > div:last-child {
  flex-shrink: 0 !important; margin-left: auto !important;
}
#ag-live-metrics-pill {
  position: relative; display: none; align-items: center;
  flex: 1 1 0% !important; max-width: max-content !important; min-width: 0 !important;
  height: 22px; margin-left: 6px; margin-right: 4px; padding: 0 4px 0 8px;
  border-left: 1px solid rgba(0, 0, 0, 0.22);
  font-family: var(--font-mono) !important; font-variant-numeric: tabular-nums;
  font-size: 11px !important; line-height: 1 !important;
  white-space: nowrap; overflow: hidden; user-select: none; cursor: default;
}
/* 极窄下物理位于 bottomRow 正下方第二行 (surface-composer-card flex-col 子项) */
#ag-live-metrics-pill[data-ag-row-mode="bottom"] {
  flex: 0 0 auto !important;
  width: calc(100% - 8px) !important; max-width: calc(100% - 8px) !important;
  height: 20px !important; margin: 1px 4px 2px 4px !important;
  padding: 2px 4px 0 6px !important;
  border-left: none !important; border-top: 1px dashed rgba(0, 0, 0, 0.14) !important;
}
#ag-live-metrics-pill #ag-live-metrics-text {
  display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--font-mono) !important; font-size: 11px !important; font-weight: 500 !important;
  letter-spacing: -0.02em !important; color: #262422 !important; opacity: 0.92 !important;
}
#ag-live-metrics-pill:hover #ag-live-metrics-text { opacity: 1 !important; color: #0A0A0A !important; }
#ag-live-metrics-pill .ag-sep { margin: 0 3.5px; opacity: 0.45 !important; }
#ag-live-metrics-pill .ag-ctx-warn { color: #B45309 !important; font-weight: 600 !important; }
#ag-live-metrics-pill .ag-ctx-crit { color: #DC2626 !important; font-weight: 700 !important; }

/* Body 级 Fixed 悬浮详情卡，彻底规避 overflow:hidden 裁剪 */
#ag-live-metrics-tooltip {
  position: fixed; z-index: 2147483647; min-width: 370px; max-width: 450px;
  padding: 10px 12px; border-radius: 8px;
  background-color: var(--card, #F9F7F2) !important;
  border: 1px solid var(--card-border, rgba(0, 0, 0, 0.35)) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08);
  font-family: var(--font-mono) !important; font-variant-numeric: tabular-nums;
  font-size: 11px !important; line-height: 1.55 !important;
  color: var(--foreground, #1F1E1D) !important;
  opacity: 0; visibility: hidden; pointer-events: none;
  transform: translateY(4px); transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s;
}
#ag-live-metrics-tooltip[data-visible="1"] { opacity: 1 !important; visibility: visible !important; transform: translateY(0); }
#ag-live-metrics-tooltip .ag-tt-hdr {
  font-weight: 600 !important; font-size: 11px !important; color: #0A0A0A !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.14); padding-bottom: 3px; margin-bottom: 4px;
}
#ag-live-metrics-tooltip .ag-tt-sec { margin-top: 8px; }
#ag-live-metrics-tooltip .ag-tt-row { display: flex; justify-content: space-between; gap: 10px; font-size: 11px !important; }
#ag-live-metrics-tooltip .ag-tt-lbl { color: #57534E !important; flex-shrink: 0; }
#ag-live-metrics-tooltip .ag-tt-val { color: #0A0A0A !important; font-weight: 500 !important; text-align: right; }
```
#### 2. 注入端前端挂载与路由监听逻辑（并入 `INJECT_SCRIPT`）
*注意：务必同时将 **`#ag-live-metrics-pill, #ag-live-metrics-tooltip`** 加入 §4 汉化排除函数 **`isExcluded`** 的选择器中；若置于 Node.js 模板字符串内，请将 `/\/c\/([0-9a-f-]{36})/i` 双写反斜杠为 `/\\/c\\/([0-9a-f-]{36})/i`。*
```javascript
const MIDDLE_MIN_WIDTH_PX = 150;

function extractCascadeId() {
  try {
    const m = window.location.pathname.match(/\/c\/([0-9a-f-]{36})/i);
    if (m) return m[1];
    const q = new URLSearchParams(window.location.search).get("cascadeId");
    if (q && /^[0-9a-f-]{36}$/i.test(q)) return q;
  } catch (e) {}
  return "";
}

function ensureMetricsTooltip() {
  let tt = document.getElementById("ag-live-metrics-tooltip");
  if (!tt && document.body) {
    tt = document.createElement("div");
    tt.id = "ag-live-metrics-tooltip";
    document.body.appendChild(tt);
  } else if (tt && tt.parentElement !== document.body && document.body) {
    document.body.appendChild(tt);
  }
  return tt;
}

function findFooterRow(box) {
  if (!box) return null;
  const rows = box.querySelectorAll("div.flex.w-full.items-center.justify-between");
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].querySelector('[data-testid="model-selector-trigger"], [data-testid="send-button"]')) {
      return rows[i];
    }
  }
  return rows[rows.length - 1] || null;
}

function measureNaturalLeftWidth(leftGroup) {
  let w = 0;
  for (let i = 0; i < leftGroup.children.length; i++) {
    const ch = leftGroup.children[i];
    if (ch.id === "ag-live-metrics-pill") continue;
    const cw = Math.max(ch.offsetWidth || 0, ch.scrollWidth || 0);
    if (cw > 0) w += cw;
  }
  return w;
}

function ensureMetricsPill() {
  const box = document.getElementById("antigravity.agentSidePanelInputBox");
  if (!box) return null;
  const bottomRow = findFooterRow(box);
  if (!bottomRow || !bottomRow.children[0]) return null;
  const leftGroup = bottomRow.children[0];
  const rightGroup = bottomRow.children[1] || null;

  let pill = document.getElementById("ag-live-metrics-pill");
  if (pill && pill.getAttribute("data-v") !== "3") {
    pill.remove();
    pill = null;
  }
  if (!pill) {
    pill = document.createElement("div");
    pill.id = "ag-live-metrics-pill";
    pill.setAttribute("data-v", "3");
    pill.innerHTML = '<span id="ag-live-metrics-text"></span>';
    pill.addEventListener("mouseenter", () => {
      const tt = ensureMetricsTooltip();
      if (!tt || !tt.innerHTML) return;
      const r = pill.getBoundingClientRect();
      const ttWidth = Math.min(440, Math.max(370, tt.offsetWidth || 400));
      const left = Math.max(12, Math.min(r.left, window.innerWidth - ttWidth - 16));
      const bottomPx = Math.min(window.innerHeight - r.top + 8, window.innerHeight - (tt.offsetHeight || 220) - 12);
      tt.style.left = left + "px";
      tt.style.bottom = Math.max(8, bottomPx) + "px";
      tt.setAttribute("data-visible", "1");
    });
    pill.addEventListener("mouseleave", () => {
      const tt = document.getElementById("ag-live-metrics-tooltip");
      if (tt) tt.removeAttribute("data-visible");
    });
  }

  const rowW = bottomRow.clientWidth || 0;
  const leftW = measureNaturalLeftWidth(leftGroup);
  const rightW = rightGroup ? (rightGroup.offsetWidth || 0) : 0;
  const availMiddleW = rowW - leftW - rightW - 14;
  const useBottomRow = rowW > 0 && availMiddleW < MIDDLE_MIN_WIDTH_PX;
  const rowMode = useBottomRow ? "bottom" : "middle";

  bottomRow.setAttribute("data-ag-row-mode", rowMode);
  pill.setAttribute("data-ag-row-mode", rowMode);

  if (useBottomRow) {
    // 物理挂载至 bottomRow 正下方 (surface-composer-card flex-col 的下一行)
    const cardParent = bottomRow.parentElement;
    if (cardParent && (pill.parentElement !== cardParent || pill.previousElementSibling !== bottomRow)) {
      bottomRow.after(pill);
    }
  } else {
    // 物理挂载至 leftGroup 末尾，严格处于「左：模型名」与「右：模式/发送按钮」正中间
    if (pill.parentElement !== leftGroup) {
      leftGroup.appendChild(pill);
    }
  }

  if (typeof ResizeObserver !== "undefined" && window.__ag_metrics_ro_target !== bottomRow) {
    if (window.__ag_metrics_ro) { try { window.__ag_metrics_ro.disconnect(); } catch (e) {} }
    window.__ag_metrics_ro_target = bottomRow;
    window.__ag_metrics_ro = new ResizeObserver(() => ensureMetricsPill());
    window.__ag_metrics_ro.observe(bottomRow);
    if (box !== bottomRow) window.__ag_metrics_ro.observe(box);
  }
  return pill;
}

if (!window.__ag_metrics_win_resize) {
  window.__ag_metrics_win_resize = true;
  window.addEventListener("resize", () => ensureMetricsPill());
}

window.__ag_render_metrics = function(payload) {
  try {
    window.__ag_last_metrics = payload;
    const currentId = extractCascadeId();
    const pill = ensureMetricsPill();
    const ttEl = ensureMetricsTooltip();
    if (!pill) return;
    if (!currentId || !payload || !payload.hasData || payload.cascadeId !== currentId) {
      pill.style.display = "none";
      if (ttEl) ttEl.removeAttribute("data-visible");
      return;
    }
    const textEl = pill.querySelector("#ag-live-metrics-text");
    if (textEl && textEl.innerHTML !== payload.inlineHtml) textEl.innerHTML = payload.inlineHtml;
    if (ttEl && ttEl.innerHTML !== payload.tooltipHtml) ttEl.innerHTML = payload.tooltipHtml;
    pill.style.display = "inline-flex";
  } catch (e) {}
};

function checkRouteAndMountMetrics() {
  try {
    const cid = extractCascadeId();
    if (cid !== window.__ag_watched_cascade_id) {
      window.__ag_watched_cascade_id = cid;
      const pill = document.getElementById("ag-live-metrics-pill");
      if (pill && (!window.__ag_last_metrics || window.__ag_last_metrics.cascadeId !== cid)) {
        pill.style.display = "none";
      }
      if (cid && typeof window.__agRequestMetrics === "function") {
        window.__agRequestMetrics(cid); // 触发 CDP Binding 毫秒级拉取
      }
    } else if (cid && window.__ag_last_metrics && window.__ag_last_metrics.cascadeId === cid) {
      ensureMetricsPill();
    }
  } catch (e) {}
}
if (!window.__ag_metrics_route_watcher) {
  window.__ag_metrics_route_watcher = setInterval(checkRouteAndMountMetrics, 400);
}
checkRouteAndMountMetrics();
```
#### 3. Node.js 守护端 SQLite + Protobuf 解析与 CDP 推送逻辑
在守护进程顶部引入 `import { DatabaseSync } from 'node:sqlite';`，并在 `ws.onopen` 中注册 `await sendCDP(session, 'Runtime.addBinding', { name: '__agRequestMetrics' });`：
```javascript
const CONVERSATIONS_DIR = path.join(os.homedir(), '.gemini/antigravity/conversations');
const CONTEXT_LIMIT_TOKENS = 256000;
const metricsCache = new Map(); // cascadeId -> { sig, payload }

function parseProto(buf) {
  let i = 0;
  const out = new Map();
  while (i < buf.length) {
    let tag = 0, shift = 0;
    while (i < buf.length) {
      const b = buf[i++];
      tag |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    const fn = tag >>> 3, wt = tag & 7;
    if (wt === 0) {
      let val = 0, s = 0;
      while (i < buf.length) {
        const b = buf[i++];
        val += (b & 0x7f) * Math.pow(2, s);
        if (!(b & 0x80)) break;
        s += 7;
      }
      out.set(fn, val);
    } else if (wt === 2) {
      let len = 0, s = 0;
      while (i < buf.length) {
        const b = buf[i++];
        len |= (b & 0x7f) << s;
        if (!(b & 0x80)) break;
        s += 7;
      }
      out.set(fn, buf.subarray(i, i + len));
      i += len;
    } else if (wt === 1) {
      out.set(fn, buf.subarray(i, i + 8)); i += 8;
    } else if (wt === 5) {
      out.set(fn, buf.subarray(i, i + 4)); i += 4;
    } else break;
  }
  return out;
}

function fmtTok(n) {
  if (!n || n <= 0) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
const fmtNum = (n) => (n || 0).toLocaleString('en-US');

// 通过比对 .db 与 .db-wal 的 mtimeMs + size 实现零开销增量感知
function getDbSignature(cascadeId) {
  try {
    const dbPath = path.join(CONVERSATIONS_DIR, `${cascadeId}.db`);
    if (!fs.existsSync(dbPath)) return null;
    const st = fs.statSync(dbPath);
    const walPath = `${dbPath}-wal`;
    const walSig = fs.existsSync(walPath)
      ? `${fs.statSync(walPath).mtimeMs}:${fs.statSync(walPath).size}`
      : '0:0';
    return `${st.mtimeMs}:${st.size}|${walSig}`;
  } catch { return null; }
}

function readConversationMetrics(cascadeId) {
  if (!cascadeId || !/^[0-9a-f-]{36}$/i.test(cascadeId)) return null;
  const sig = getDbSignature(cascadeId);
  if (!sig) return { cascadeId, hasData: false };
  const cached = metricsCache.get(cascadeId);
  if (cached && cached.sig === sig) return cached.payload;

  const dbPath = path.join(CONVERSATIONS_DIR, `${cascadeId}.db`);
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx ASC').all();
    if (!rows || rows.length === 0) {
      db.close(); db = null;
      const emptyPayload = { cascadeId, hasData: false, sig };
      metricsCache.set(cascadeId, { sig, payload: emptyPayload });
      return emptyPayload;
    }
    const userSteps = db.prepare('SELECT idx FROM steps WHERE step_type = 14 ORDER BY idx ASC').all();
    const plannerSteps = db.prepare('SELECT idx FROM steps WHERE step_type = 15 ORDER BY idx ASC').all();
    db.close(); db = null;

    const lastUserStepIdx = userSteps.length > 0 ? userSteps[userSteps.length - 1].idx : -1;
    let totalIn = 0, totalCache = 0, totalOut = 0, totalThink = 0, totalResp = 0;
    let turnSteps = 0, turnOut = 0, turnThink = 0, turnResp = 0, turnDur = 0;

    const parsed = rows.map((r, i) => {
      const top = parseProto(r.data);
      const chat = top.has(1) ? parseProto(top.get(1)) : new Map();
      const usage = chat.has(4) ? parseProto(chat.get(4)) : new Map();
      const ttftMap = chat.has(11) ? parseProto(chat.get(11)) : new Map();
      const streamMap = chat.has(12) ? parseProto(chat.get(12)) : new Map();

      const inTok = usage.get(2) || 0, outTok = usage.get(3) || 0, cacheRead = usage.get(5) || 0;
      const thinkTok = usage.get(9) || 0, respTok = usage.get(10) || 0;
      const ttft = (ttftMap.get(1) || 0) + (ttftMap.get(2) || 0) / 1e9;
      const stream = (streamMap.get(1) || 0) + (streamMap.get(2) || 0) / 1e9;
      const stepIdx = plannerSteps[i] ? plannerSteps[i].idx : i;

      totalIn += inTok; totalCache += cacheRead; totalOut += outTok;
      totalThink += thinkTok; totalResp += respTok;
      if (stepIdx > lastUserStepIdx) {
        turnSteps += 1; turnOut += outTok; turnThink += thinkTok;
        turnResp += respTok; turnDur += (ttft + stream);
      }
      return { idx: r.idx, inTok, outTok, cacheRead, ctx: inTok + cacheRead, thinkTok, respTok, ttft, stream, totDur: ttft + stream };
    });

    const last = parsed[parsed.length - 1];
    const streamTps = last.stream >= 0.25 ? (last.outTok / last.stream) : 0;
    const e2eTps = last.totDur > 0 ? (last.outTok / last.totDur) : 0;
    const displayTps = (streamTps > 0 && streamTps <= 600) ? streamTps : e2eTps;
    const ctxPct = Math.round((last.ctx / CONTEXT_LIMIT_TOKENS) * 100);
    const ctxClass = ctxPct >= 90 ? 'ag-ctx-crit' : (ctxPct >= 75 ? 'ag-ctx-warn' : 'ag-ctx-ok');
    const lastCacheRate = last.ctx > 0 ? ((last.cacheRead / last.ctx) * 100).toFixed(1) : '0.0';
    const sessionCacheRate = (totalIn + totalCache) > 0 ? ((totalCache / (totalIn + totalCache)) * 100).toFixed(1) : '0.0';
    const remainCtx = Math.max(0, CONTEXT_LIMIT_TOKENS - last.ctx);

    const inlineHtml = [
      `<span>${Math.round(displayTps)} tok/s</span><span class="ag-sep">·</span>`,
      `<span>TTFT ${last.ttft.toFixed(1)}s</span><span class="ag-sep">·</span>`,
      `<span>Ctx ${fmtTok(last.ctx)}/256k <span class="${ctxClass}">(${ctxPct}%)</span></span><span class="ag-sep">·</span>`,
      `<span>Out ${fmtTok(last.outTok)}</span>`
    ].join('');

    const turnRowHtml = turnSteps > 1
      ? `<div class="ag-tt-row"><span class="ag-tt-lbl">本轮合计 (${turnSteps}步)</span><span class="ag-tt-val">输出 ${fmtNum(turnOut)} (思考 ${fmtNum(turnThink)} + 响应 ${fmtNum(turnResp)}) | 耗时 ${turnDur.toFixed(1)}s</span></div>`
      : '';

    const tooltipHtml = [
      `<div class="ag-tt-hdr">本轮最新调用 (Gen #${last.idx + 1})</div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">生成速度</span><span class="ag-tt-val">${streamTps > 0 && streamTps <= 600 ? `流式 ${streamTps.toFixed(1)} tok/s | ` : ''}端到端 ${e2eTps.toFixed(1)} tok/s</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">响应耗时</span><span class="ag-tt-val">TTFT ${last.ttft.toFixed(2)}s | 流式 ${last.stream.toFixed(2)}s | 总计 ${last.totDur.toFixed(2)}s</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">当前上下文</span><span class="ag-tt-val">${fmtNum(last.ctx)} (新增 ${fmtNum(last.inTok)} + 缓存 ${fmtNum(last.cacheRead)}, ${lastCacheRate}%)</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">本步输出量</span><span class="ag-tt-val">${fmtNum(last.outTok)} (思考链 ${fmtNum(last.thinkTok)} + 正文/工具 ${fmtNum(last.respTok)})</span></div>`,
      turnRowHtml,
      `<div class="ag-tt-hdr ag-tt-sec">当前会话累计 (${userSteps.length} 轮提问 / ${parsed.length} 次模型调用)</div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">压缩水位线</span><span class="ag-tt-val">${fmtTok(last.ctx)} / 256k (${ctxPct}%) · 距压缩余 ${fmtTok(remainCtx)}</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输入量</span><span class="ag-tt-val">新增 ${fmtTok(totalIn)} + 缓存读取 ${fmtTok(totalCache)} (命中率 ${sessionCacheRate}%)</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输出量</span><span class="ag-tt-val">总计 ${fmtTok(totalOut)} (思考链 ${fmtTok(totalThink)} + 正文/工具 ${fmtTok(totalResp)})</span></div>`
    ].join('');

    const payload = { cascadeId, hasData: true, sig, inlineHtml, tooltipHtml };
    metricsCache.set(cascadeId, { sig, payload });
    return payload;
  } catch {
    if (db) { try { db.close(); } catch {} }
    return null;
  }
}

async function pushMetricsToSession(session, cascadeId, force = false) {
  if (!session || session.ws?.readyState !== 1 || !cascadeId) return;
  try {
    const sig = getDbSignature(cascadeId) || 'empty';
    const sessionKey = `${cascadeId}@${sig}`;
    if (!force && session.lastPushedSig === sessionKey) return;
    const payload = readConversationMetrics(cascadeId);
    if (!payload) return;
    session.lastPushedSig = sessionKey;
    await sendCDP(session, 'Runtime.evaluate', {
      expression: `window.__ag_render_metrics && window.__ag_render_metrics(${JSON.stringify(payload)})`,
      returnByValue: false
    });
  } catch {}
}

async function syncMetricsForSession(session) {
  if (!session || session.isInjecting || session.ws?.readyState !== 1) return;
  try {
    const res = await sendCDP(session, 'Runtime.evaluate', {
      expression: 'window.__ag_watched_cascade_id || ""',
      returnByValue: true
    });
    const cid = res?.result?.value;
    if (cid) await pushMetricsToSession(session, cid, false);
  } catch {}
}

async function syncAllMetrics() {
  for (const session of activeSockets.values()) {
    await syncMetricsForSession(session);
  }
}
```
- **双通道触发机制**：
	1. **会话切换秒级响应（**`< 5ms`**）**：在 `ws.onmessage` 中捕获 `msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agRequestMetrics'`，立即调用 `pushMetricsToSession(session, msg.params.payload, true)` 执行 `window.__ag_render_metrics(payload)`；
	2. **生成过程实时跳动（**`1200ms`**）**：使用 `setInterval(syncAllMetrics, 1200)` 巡检当前活跃会话的 `.db-wal` 文件签名，仅在签名变化时才查询 SQLite 并推送更新，空闲态零数据库开销。
---
## 6. 验证清单（给执行 Agent 的验收步骤）
执行完毕后，执行端 Agent 应当进行如下自检：
1. **字体生效验证**：检查正文段落计算样式，确认 `font-family` 包含 `Anthropic Serif` 与 `Sarasa Mono Slab SC`（默认 A 方案）或 `Sarasa UI Slab SC`（备选 B 方案），代码块为等宽打字机衬线。
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
7. **实时指标胶囊与上浮阴影仪表盘验证（若启用 §5.5 可选模块）**：
	- **三栏与跳行验证**：在已有对话中检查 `#ag-live-metrics-pill` 的 `getBoundingClientRect()`，确认宽屏下严格位于「左侧模型选择」与「右侧模式/发送按钮」正中间（`data-ag-row-mode="middle"`），窄栏（中间可用宽度 `< 150px`）下物理跳转至 `bottomRow` 正下方独立第二行（`data-ag-row-mode="bottom"`），任何宽度下绝不出现在发送按钮右侧；
	- **切换会话毫秒级刷新**：切换左侧不同历史会话，确认指标栏在 `< 5ms` 内同步刷新为对应会话的 `TPS · TTFT · Ctx/256k · Out`；
	- **上浮渐变阴影仪表盘验证**：校验 `document.body > #ag-live-metrics-tooltip` 存在且 `getComputedStyle` 满足 `position === "fixed"`、包含双层 `box-shadow`、具备 `translateY(4px) -> translateY(0)` 的 `0.12s` 上浮过渡，且内部包含上下两个 `.ag-tt-hdr` 分区与 `.ag-tt-row` 左右对齐网格。
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
---
> 📦 **GitHub 发布**：本 Skill 已以文本形式发布至 [**Anarcadia/chuanban-antigravity-theme-patch**](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)（含完整 `SKILL.md` 与 README，可直接投喂给执行端 Agent 使用）。
