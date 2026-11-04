# Antigravity Insiders 分支阶段性归档与稳定版合并指引

> **归档日期**：2026-11-04  
> **归档分支**：`Factory/chuanban-antigravity-theme-patch` 的 `main` 与 `insiders-dev`（已完全同步）  
> **起始提交**：`b94445c`（建立 Insiders 独立分支与调试套件）  
> **最新提交**：`v22`（Opus 独立对抗核验闭环：修复 0 用量指标、无原型词典防污染、双触发防后台堆积与纯 CSS 0ms 场景切换）  
> **探针版本**：`20261104-stable-v22` / `20261104-insiders-dev-v22`  
> **目标宿主**：`/Applications/Antigravity.app` (2.29.0 正式稳定版已全量加载生效) 与 `/Applications/Antigravity - Insiders.app`

---

## 一、 分支架构与运行环境隔离

为了在不侵扰现有稳定版（`/Applications/Antigravity.app`）日常办公的前提下开展前沿特性的优化，本次开发设立了完全平行的双轨机制：

| 维度 | 稳定版生产环境 (Stable) | Insiders 分支开发环境 (Insiders-Dev) |
| :--- | :--- | :--- |
| **应用路径** | `/Applications/Antigravity.app` | `/Applications/Antigravity - Insiders.app` |
| **调试端口文件** | `~/Library/Application Support/Antigravity/DevToolsActivePort` (默认 51223) | `~/Library/Application Support/Antigravity - Insiders/DevToolsActivePort` (动态自愈) |
| **会话数据库** | `~/.gemini/antigravity/conversations/*.db` | `~/.gemini/antigravity-insiders/conversations/*.db` |
| **Git 分支** | `main` | `insiders-dev` |
| **执行脚本** | `scripts/antigravity-font-daemon.mjs` | `scripts/antigravity-font-daemon.insiders.mjs` |
| **探针标识** | `window.__ag_patch_version = "20261101-metrics-v4"` | `window.__ag_patch_version = "20261104-insiders-dev-v14"` |
| **后台守护** | LaunchAgent `com.chuanban.antigravity.font-patch` | 独立后台 Node 进程，日志位于 `/tmp/antigravity-font-insiders.log` |

---

## 二、 相对稳定版的核心新增与改进（Diff 剖析）

本次 Insiders 版本共推进了 12 次迭代提交（v1 ~ v13），聚焦于解决新版上游架构改动带来的破损、视觉失衡与新特性遗留英文问题：

### 1. 字重级阶锁死与 Solid Ink 墨感重塑 (v4, v5)
- **上游变化**：Insiders 在根节点引入了 `body[data-agy-font="google-sans"]`，将 `--font-weight-normal` 降级为 350、`--font-weight-medium` 降级为 450，导致所有二级菜单、设置配置项和模型名称发虚无力。
- **治理方案**：
  - 在 `:root`、`body`、`body[data-agy-font]` 上重载恢复标准梯阶（300/400/500/600/700/900），`body` 强行锁死为 400。
  - 为设置弹窗（`[role="dialog"]`）和模型弹出菜单（`[role="menu"]`）增加专有提升规则：二级配置卡片标题、模型名称提升至 450，栏目标题提升至 500。
  - 修复 `View Usage` 因缺少 `.truncate` 类未继承 450 的缺陷，使 `View Usage` 与相邻的 `Main Agent` 字重达成严格一致。

### 2. Inset Shell 架构适配与大工作区黑度对齐 (v6)
- **上游变化**：右侧交互区从原先平铺的结构重构为 `.agy-inset-shell` $\rightarrow$ `[data-main-content-body]`，原先的描边与阴影变量被降级为 `0.5px rgba(0, 0, 0, 0.12)`，轮廓几不可见。
- **治理方案**：
  - 注入 `.agy-inset-shell { --card-edge: rgba(0, 0, 0, 0.35) !important; --sash-line: rgba(0, 0, 0, 0.35) !important; }`。
  - 通过 `[data-main-content-body]::after { box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35) !important; }` 重塑 1px 扎实深墨边框。
  - 侧栏与主工作区的中缝中线同步恢复为 `0.35` 墨度。

### 3. 输入框扁平化美学革新与按钮纠偏 (v3, v7, v8)
- **按钮配色纠正 (v3)**：解决 Insiders 中发送按钮背景误回退为全黑的问题，强制重载为品牌暖橙色（`#D97757`），并修复了 `voice-live-pill` 内部麦克风与星光图标的重叠错位 bug。
- **外框线透明化 (v7)**：响应船板手感测试要求，将最外层 `#antigravity.agentSidePanelInputBox` 容器的外部描边与投射阴影完全置为 100% 透明（`border: 1px solid transparent !important; box-shadow: none !important;`），保留 `#F7EFE6` 暖杏色低干扰底色。
- **内框线透明化 (v8)**：进一步将内部打字卡片（`.surface-composer-card`）的内描边也完全隐去（`border: transparent; box-shadow: none;`），使得纯白打字卡片（`#FFFFFF`）如白玉般平嵌于暖杏托盘之中，依靠明度差自然分割，彻底告别所有线条割裂感。

### 4. 搜索栏焦点交互治理——根除双层同心圈 (v10)
- **上游问题**：Insiders 引入了高权重全局规则：`outline: 2px solid var(--nux-focus-ring) !important; outline-offset: 2px;`。由于 `outline-offset: 2px`，点击搜索栏时外部会浮现一圈粗糙的橙色外环，与原位的细灰边框形成生硬的“双层同心圆”。
- **治理方案**：
  - 在局部作用域将 `--nux-focus-ring` 重载为 `transparent !important`，并设置 `outline: none !important;`。
  - 在 `:focus` 和 `:focus-visible` 状态下，直接将原位的 `border-color` 原地平滑切换为品牌暖橙色 `#D97757` 并附加 1px 紧贴微锁边。
  - **效果**：外圈彻底消隐，内圈原地高亮，**0 视觉跳动，0 同心圆割裂**。

### 5. Insiders 新版特性全量汉化补全 (v12, v14)
针对新版界面中新增的 35+ 处英文，完成无死角字典匹配与动态 Observer 挂载拦截：
- **权限预设与执行策略 (v14)**：`Every command requires approval.`（每条命令均需人工批准。）、`Ask before sensitive operations.`（执行敏感操作前进行询问。）、`Run all commands without restrictions.`（无限制执行所有命令。）、`Automatically decide if commands run.`（自动判断是否直接执行命令。）、生命周期钩子管理、命令前置初始化脚本、工作目录外文件访问策略等。
- **内置浏览器偏好**：`Configure link opening...`（配置链接打开方式与内置浏览器偏好设置）、`Download Location`（下载位置）、`Folder where files downloaded...`（内置浏览器下载文件的保存目录）、`Browsing History`（浏览历史记录）、`Clear`（清除）、`Change…` / `Change...`（更改…，双重适配 Unicode 省略号与 ASCII 点号）、`Browser Subagent`（内置浏览器子代理）。
- **Gemini Live 语音模式**：`Voice mode`（语音模式）、`Voice`（音色）、`The voice used in Voice mode...`（语音模式使用的音色。由 Gemini Live 提供支持）、`Change`（更改）、`Microphone`（麦克风）、`Input device for voice mode...`（用于语音模式与语音输入的输入设备）、`System default`（系统默认）、`How loud Antigravity's voice is.`（Antigravity 的语音播放音量）。
- **右键上下文菜单**：`Rename`（重命名）、`Pin` / `Unpin`（固定/取消固定）、`Archive` / `Unarchive`（归档/取消归档）、`Split`（分屏）、`Split Right`（向右分屏）、`Split Down`（向下分屏）、`Replace with New`（新建替换）、`Close Tab`（关闭标签页）等。
- **对话与步骤详情**：`Chat`（对话）、`Conversation Steps`（会话步骤详情）、`Choose how much detail...`（选择对话过程中显示的详细程度）、`Verbose`（详细 (Verbose)）。
- **通用修饰**：`Manage Antigravity Insiders app settings.`（管理 Antigravity Insiders 客户端应用设置）、`Give Feedback`（反馈建议）、`Font`（字体设置）。

### 6. 模型吞吐仪表盘 (Live Metrics Pill) 路由加固 (v13)
- **上游问题**：Insiders 采用单页路由架构，刚启动或新建对话时，URL 仅为 `/?project=...`（不含 `/c/<id>`）。原稳定版脚本依赖从 URL 提取 `/c/` 路径，导致在首页时误将仪表盘隐藏。
- **加固方案**：
  - **前端三级探测**：优先检查 URL 路径 $\rightarrow$ 探测侧栏选中会话节点（`[data-testid=conversation-row-sidebar][data-selected=true]`）$\rightarrow$ 允许在首页空态下回显全局待命指标。
  - **后端 Node 自动感知**：新增 `getLatestConversationId()`，自动按修改时间排序读取 `~/.gemini/antigravity-insiders/conversations/` 中的最新会话数据库，无论用户处于首页还是会话详情，仪表盘均能 0ms 秒开待命。
  - **自适应重排**：严格维持「模型胶囊 — 吞吐仪表盘 — 模式/发送」三栏水平居中结构，宽度 `< 150px` 时由 `ResizeObserver` 自动跳至下方第二行。

---

## 三、 提交历史索引表 (Commit Log)

| 提交哈希 | 探针版本 | 类型与简述 |
| :--- | :--- | :--- |
| `b94445c` | - | `feat(insiders)`: 建立 Antigravity Insiders 分支开发脚本与独立调试套件 |
| `d218ab4` | - | `fix(insiders)`: 适配 Insiders 新版 body[data-agy-font] 字体覆盖规则，完善后台守护控制 |
| `91fc993` | - | `fix(insiders-ui)`: 修复输入框上方灰色沉重底色并修正操作/发送按钮为暖橙色 |
| `88dacfc` | `v3` | `fix(insiders)`: 修复 voice-live-pill 内部图标重叠 bug 并升级探针至 v3 |
| `3686f77` | `v4` | `fix(insiders)`: 恢复标准字重级阶并对齐稳定版设置二级项与模型名称字重 |
| `a5c28fb` | `v5` | `fix(insiders)`: 统一 View Usage 与 Main Agent 菜单动作项字重 |
| `70fb834` | `v6` | `fix(insiders)`: 右侧主交互面板外框线与输入对话框外框线对齐稳定版纯正黑度 |
| `be68589` | `v7` | `feat(insiders)`: 将对话框最外层轮廓线隐去（设为全透明无阴影），保留暖杏底色与内部锁边 |
| `b358c6d` | `v8` | `feat(insiders)`: 将对话框内部输入卡片内框线也完全隐去（设为透明无阴影） |
| `835f144` | `v10` | `feat(insiders)`: 优化搜索栏聚焦交互，消除突兀橙色外圈，将内圈灰线直接平滑切换为品牌橙色粗线 |
| `f4b0641` | `v12` | `feat(insiders)`: 全量补充 Insiders 新版汉化词条（内置浏览器偏好、语音模式、应用配置、会话步骤详情、标签页右键菜单） |
| `bb930f2` | `v13` | `feat(insiders)`: 全面恢复并加固模型吞吐仪表盘（Live Metrics Pill），支持 Insiders 路由与侧栏自适应回显 |
| `447a99b` | `v14` | `feat(insiders)`: 补充权限预设模式说明与执行策略汉化（探针升级至 v14） |
| `78142e6` | `v14` | `feat(stable)`: 官方稳定版推送 2.29.0，正式将 Insiders 全量特性合并并加载到稳定版主线 |
| `9bce787` | `v15` | `style(sidebar)`: 侧边栏任务清单与对话列表微降一个字重层级至 400（消除墨晕，西文清爽锐利） |
| `ad96c2b` | `v16` | `feat(i18n)`: 补全 Permissions 全局权限、本机权限与远程权限说明词条（探针升级至 v16） |
| `609c8a4` | `v17` | `style(composer)`: 聊天框外圆弧线采用加深古朴蜡封暗红 (#74221A)，打字卡片采用方案2温润微浮雕聚焦抬升（v17） |
| `11da971` | `v18` | `feat(i18n, composer)`: 补齐内置浏览器、语音、右键菜单、Chat、权限等50+词条汉化；落地聊天框分场景三形态及方案2微浮雕（v18） |
| `8814330` | `v19` | `feat(composer)`: 彻底解耦首页新建对话与日常推进页，消除单例闭包死锁，解决特异性倒挂（v19） |
| `da46011` | `v20` | `feat(i18n-composer)`: 补齐权限与分支汉化，基于 branch-pill-trigger 原生结构彻底解耦新建对话(设计C)与推进页(设计A)（v20） |

---

## 四、 核心资产专著引用

本版本确立并沉淀的输入框全新设计方案已升华为独立官方设计规范：
- **设计规范专著**：[COMPOSER_WAX_SEAL_DESIGN_SPEC.md](COMPOSER_WAX_SEAL_DESIGN_SPEC.md)
  - **核心体系**：古朴蜡封·双场景解耦与分级演进系统（Ancient Wax Seal & Decoupled Dual-Scene Composer System）；
  - **错位矩阵**：新建对话框（透明 C ➔ 淡红 A）与日常推进页（淡红 A ➔ 深红 B）严格错开一个层级；
  - **工程锚点**：基于 `[data-testid="branch-pill-trigger"]` 原生结构与 CSS 原生 `:has(...)` 0 延迟解耦；
  - **触感拟物**：方案 2 白玉打字卡片 250ms 贝塞尔微浮雕拟物平滑浮起；
  - **汉化闭环**：分支选择器、权限气泡说明与全局权限设置页 100% 汉化覆盖。

---

## 五、 将来合并到“稳定版”的推送操作指南

当 Google 官方将当前的 Insiders 特性正式合入并推送到稳定版（`/Applications/Antigravity.app`）时，遵循以下标准合并流程：

### 1. 通用改动（直接并入生产版脚本 `scripts/antigravity-font-daemon.mjs`）
- [x] **全量词典补充**：将 `I18N_DICT` 中新增的 28+ 浏览器、语音、右键菜单、Chat 词条合入稳定版字典。
- [x] **搜索栏无抖动焦点环**：将 `--nux-focus-ring: transparent !important;` 及聚焦内圈改橙的 CSS 规则直接合入稳定版。
- [x] **字重级阶兜底**：保留针对 `body[data-agy-font]` 的强制字重重载，防止稳定版更新后出现文字变细。
- [x] **吞吐仪表盘加固**：将 `getLatestConversationId()` 与三级会话探测逻辑合入稳定版，使稳定版同样具备新建对话时的指标回显能力。

### 2. 视觉决策核对项（与船板确认偏好）
- **输入框外框线风格**：
  - 若船板偏好 Insiders 的**极简扁平白玉风**：合入 `border: transparent; box-shadow: none;`；
  - 若船板偏好稳定版原先的**深墨硬朗线框风**：保留 `border: 1px solid rgba(0, 0, 0, 0.35);`。

### 3. 一键合流指令步骤

```bash
# 1. 切换到主题补丁仓库
cd Factory/chuanban-antigravity-theme-patch

# 2. 检出主干分支并合并 insiders-dev
git checkout main
git merge insiders-dev -m "merge(insiders): 合并 Insiders 验证成熟的汉化、排版、焦点环优化与仪表盘加固至稳定版"

# 3. 部署并重启生产守护进程
bash scripts/antigravity-font-ctl.sh restart
```
