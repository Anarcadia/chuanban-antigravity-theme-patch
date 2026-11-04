# Antigravity 输入框「古朴蜡封·双场景解耦与分级演进」设计方案规范 (v20)

> **设计代号**：Ancient Wax Seal & Decoupled Dual-Scene Composer System  
> **设计版本**：v20 (2026-11-04)  
> **适用宿主**：Antigravity 正式稳定版 (2.29.0+) 与 Antigravity Insiders 双轨环境  
> **设计提出与定版**：忒修斯的船板  
> **工程落地**：Antigravity Theme Patch 守护进程与原生 CSS 互斥引擎  

---

## 一、 设计哲学与核心理念

本设计旨在解决传统 AI 聊天客户端“首页新建态”与“会话推进态”共用同一输入框样式导致的**视觉喧宾夺主**或**层级缺失**问题，确立了三大核心美学与交互原则：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        输入框三形态与双场景错位流转矩阵                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   【场景 2：新建对话 / 首页空白态】                                       │
│   常态 (失焦)                       鼠标移上 / 聚焦 (获得焦点)            │
│   ┌────────────────────────┐        ┌────────────────────────┐         │
│   │ 设计 C: 完全透明        │  ────> │ 设计 A: 偏淡蜡封暗红   │         │
│   │ 纯净融于背景，杜绝线条 │        │ 略粗偏淡，柔和底阴影   │         │
│   └────────────────────────┘        └────────────────────────┘         │
│                                                                        │
│                                错开一个视觉层级                          │
│                                ────────────────>                       │
│                                                                        │
│   【场景 1：日常推进具体会话页】                                           │
│   常态 (失焦)                       鼠标移上 / 聚焦 (获得焦点)            │
│   ┌────────────────────────┐        ┌────────────────────────┐         │
│   │ 设计 A: 偏淡蜡封暗红   │  ────> │ 设计 B: 实色深蜡封红   │         │
│   │ 明确容器边界，低干扰   │        │ 加深变浓，细腻红晕阴影 │         │
│   └────────────────────────┘        └────────────────────────┘         │
│                                                                        │
│   【内嵌方案 2：白玉打字卡片】                                             │
│   常态平嵌于暖杏托盘 (#F7EFE6) ──focus-within──> 250ms 贝塞尔曲线平滑浮起    │
│                                                 (拟物微浮雕光影)       │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. 场景自知与沉浸退让 (Contextual Retreat)
- **新建对话时（Scene 2）**：界面应当呈现最极致的纯净度与思考留白。输入框外框在日常常态下完全隐去（**设计 C**：100% 透明无阴影），让用户视线自然集中于思考构思，消除不必要的矩形线条压迫感；
- **具体推进时（Scene 1）**：由于上方已有连续滚动的消息流，输入框作为页面底部的持久操作锚点，日常常态下呈现温和克制的轮廓（**设计 A**：略粗偏淡蜡封暗红），清晰定义输入区边界。

### 2. 交互呼吸与阶梯反馈 (Tiered Interaction Stepping)
两场景在交互响应上严格**错开一个视觉层级**，形成充满呼吸感的情绪递进：
- **新建对话框**：从极简纯粹的“隐”走向温和提醒的“显”：
  $$\text{日常失焦：设计 C (透明)} \xrightarrow{\text{Hover / Focus}} \text{交互获焦：设计 A (淡红)}$$
  *（绝不突兀地直接跳跃至加深深红，保持初见时的雅致）*
- **日常推进页**：从温和定位的“显”走向明确聚焦的“定”：
  $$\text{日常失焦：设计 A (淡红)} \xrightarrow{\text{Hover / Focus}} \text{交互获焦：设计 B (深红)}$$

### 3. 白玉微浮雕与物理级零抖动 (Relief Elevation & Zero Jitter)
- **方案 2 内层白玉卡片**：打字核心区（`.surface-composer-card`）选用高纯度象牙白（`#FFFFFF`），平嵌于 `#F7EFE6` 暖杏色托盘中。失焦时内框线 100% 透明，完全依赖柔和的明度差自然分割；一旦内部获得焦点（`:focus-within`），通过 `250ms cubic-bezier(0.16, 1, 0.3, 1)` 贝塞尔曲线，平滑升起一层极其细腻的微浮雕扩散阴影（`0 6px 20px -2px rgba(60, 20, 15, 0.07), 0 2px 6px -1px rgba(0, 0, 0, 0.04)`），营造拟物白玉石板被微量托起的温润手感；
- **物理尺寸零抖动**：所有形态切换（透明 $\leftrightarrow$ 淡红 $\leftrightarrow$ 深红）时，外层边框物理宽度严格锁死为 `1.5px`，背景色恒定锁死为 `#F7EFE6`，彻底杜绝了因 border-width 变化引发的 DOM 布局跳动与像素级抖晃。

---

## 二、 调色板与视觉参数定义

### 1. 蜡封古朴暗红调色板 (Ancient Wax Seal Palette)

| 形态编号 | 形态名称 | 边框规格 (Border) | 边框色值 (Hex / RGBA) | 投影与光晕效果 (Box Shadow) | 视觉语义 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **设计 A** | 略粗偏淡蜡封暗红 | `1.5px solid` | `rgba(116, 34, 26, 0.36)` | `0 1px 3px rgba(116, 34, 26, 0.04)` | 温和透润，克制低调，提供基础轮廓边界 |
| **设计 B** | 加深变浓实色蜡封红 | `1.5px solid` | `#74221A` (RGB: 116, 34, 26) | `0 1px 4px rgba(116, 34, 26, 0.12)` | 饱满庄重，如同信函上凝固的古朴火漆印鉴 |
| **设计 C** | 彻底隐匿纯净全透明 | `1.5px solid` | `transparent` (`rgba(0, 0, 0, 0)`) | `none` | 极致退隐，消除视觉阻隔，融于背景 |

### 2. 卡片与底板物理参数

```css
/* 外层托盘底板 */
--composer-tray-bg: #F7EFE6;
--composer-border-width: 1.5px;
--composer-transition: border-color 220ms cubic-bezier(0.16, 1, 0.3, 1),
                       box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1);

/* 内层白玉打字卡片 (方案 2) */
--composer-card-bg: #FFFFFF;
--composer-card-border: 1px solid transparent;
--composer-card-shadow-idle: 0 1px 2px rgba(0, 0, 0, 0.02);
--composer-card-shadow-lift: 0 6px 20px -2px rgba(60, 20, 15, 0.07),
                             0 2px 6px -1px rgba(0, 0, 0, 0.04);
--composer-card-transition: box-shadow 250ms cubic-bezier(0.16, 1, 0.3, 1);
```

---

## 三、 工程实现：物理级原生解耦架构

### 1. 破解 SPA 路由自动重定向陷阱
- **上游行为**：在 Antigravity 官方 React / TanStack Router 单页架构中，用户点击“新建对话”（`a[href="/"]`）时，客户端会在 300ms 内瞬间完成两件事：分配全新会话 UUID，并将路由无刷新替换为 `/c/<uuid>`；
- **旧版失效根因**：若仅根据 URL 是否以 `/c/` 开头来判定场景，会导致新建对话刚打开的瞬间就被错误归类为“具体推进页”，导致日常常态无法透明，错误悬挂红线；
- **原生结构解耦破解方案**：
  在 Antigravity 真实 DOM 树中，**新建对话框顶部强制渲染项目与分支选择栏**（包含 `button[data-testid="branch-pill-trigger"]`），而一旦发出首条消息进入会话推进流，此顶部工具栏便会被销毁或移出输入框。
  因此，`[data-testid="branch-pill-trigger"]` 是判定新建会话场景的**物理级绝对锚点**。

### 2. 原生 CSS `:has()` 互斥引擎代码

```css
/* ======================================================================
 * 基础底板：锁死暖杏底色、1.5px 尺寸与贝塞尔过渡曲线
 * ====================================================================== */
html[data-ag-preset] #antigravity\.agentSidePanelInputBox,
html[data-ag-preset] [id="antigravity.agentSidePanelInputBox"],
#antigravity\.agentSidePanelInputBox,
[id="antigravity.agentSidePanelInputBox"],
.surface-composer.bg-card-border {
  background-color: #F7EFE6 !important;
  outline: none !important;
  transition: border-color 220ms cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 220ms cubic-bezier(0.16, 1, 0.3, 1) !important;
}

/* ======================================================================
 * 【场景 2：新建对话 / 首页空白态】
 * 判定依据：输入框自身包含分支触发器，或页面带有 home 标记
 * ====================================================================== */
/* 2.1 新建对话日常常态：设计 C (完全透明，无阴影) */
#antigravity\.agentSidePanelInputBox:has([data-testid="branch-pill-trigger"]),
[id="antigravity.agentSidePanelInputBox"]:has([data-testid="branch-pill-trigger"]),
.surface-composer.bg-card-border:has([data-testid="branch-pill-trigger"]),
:is(html, body):has([data-testid="home-greeting"]) #antigravity\.agentSidePanelInputBox,
:is(html, body):has([data-testid="home-greeting"]) [id="antigravity.agentSidePanelInputBox"],
:is(html, body):has([data-testid="home-greeting"]) .surface-composer.bg-card-border,
:is(html, body)[data-ag-page-type="home"] #antigravity\.agentSidePanelInputBox,
:is(html, body)[data-ag-page-type="home"] [id="antigravity.agentSidePanelInputBox"],
:is(html, body)[data-ag-page-type="home"] .surface-composer.bg-card-border {
  border: 1.5px solid transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

/* 2.2 新建对话移上 / 获焦：变成为设计 A (略粗偏淡蜡封暗红，微弱底阴影) */
#antigravity\.agentSidePanelInputBox:has([data-testid="branch-pill-trigger"]):hover,
[id="antigravity.agentSidePanelInputBox"]:has([data-testid="branch-pill-trigger"]):hover,
.surface-composer.bg-card-border:has([data-testid="branch-pill-trigger"]):hover,
#antigravity\.agentSidePanelInputBox:has([data-testid="branch-pill-trigger"]):focus-within,
[id="antigravity.agentSidePanelInputBox"]:has([data-testid="branch-pill-trigger"]):focus-within,
.surface-composer.bg-card-border:has([data-testid="branch-pill-trigger"]):focus-within,
:is(html, body):has([data-testid="home-greeting"]) #antigravity\.agentSidePanelInputBox:hover,
:is(html, body):has([data-testid="home-greeting"]) [id="antigravity.agentSidePanelInputBox"]:hover,
:is(html, body):has([data-testid="home-greeting"]) .surface-composer.bg-card-border:hover,
:is(html, body):has([data-testid="home-greeting"]) #antigravity\.agentSidePanelInputBox:focus-within,
:is(html, body):has([data-testid="home-greeting"]) [id="antigravity.agentSidePanelInputBox"]:focus-within,
:is(html, body):has([data-testid="home-greeting"]) .surface-composer.bg-card-border:focus-within,
:is(html, body)[data-ag-page-type="home"] #antigravity\.agentSidePanelInputBox:hover,
:is(html, body)[data-ag-page-type="home"] [id="antigravity.agentSidePanelInputBox"]:hover,
:is(html, body)[data-ag-page-type="home"] .surface-composer.bg-card-border:hover,
:is(html, body)[data-ag-page-type="home"] #antigravity\.agentSidePanelInputBox:focus-within,
:is(html, body)[data-ag-page-type="home"] [id="antigravity.agentSidePanelInputBox"]:focus-within,
:is(html, body)[data-ag-page-type="home"] .surface-composer.bg-card-border:focus-within {
  border: 1.5px solid rgba(116, 34, 26, 0.36) !important;
  border-color: rgba(116, 34, 26, 0.36) !important;
  box-shadow: 0 1px 3px rgba(116, 34, 26, 0.04) !important;
}

/* ======================================================================
 * 【场景 1：日常推进具体聊天会话页面】
 * 判定依据：严格排斥分支触发器，排斥 home 标记与问候元素
 * ====================================================================== */
/* 1.1 具体会话日常常态：设计 A (略粗偏淡蜡封暗红) */
:is(html, body):not(:has([data-testid="home-greeting"])):not([data-ag-page-type="home"]) #antigravity\.agentSidePanelInputBox:not(:has([data-testid="branch-pill-trigger"])),
:is(html, body):not(:has([data-testid="home-greeting"])):not([data-ag-page-type="home"]) [id="antigravity.agentSidePanelInputBox"]:not(:has([data-testid="branch-pill-trigger"])),
:is(html, body):not(:has([data-testid="home-greeting"])):not([data-ag-page-type="home"]) .surface-composer.bg-card-border:not(:has([data-testid="branch-pill-trigger"])) {
  border: 1.5px solid rgba(116, 34, 26, 0.36) !important;
  border-color: rgba(116, 34, 26, 0.36) !important;
  box-shadow: 0 1px 3px rgba(116, 34, 26, 0.03) !important;
}

/* 1.2 具体会话移上 / 聚焦：变成为设计 B (加深变浓实色蜡封暗红 #74221A) */
:is(html, body):not(:has([data-testid="home-greeting"])):not([data-ag-page-type="home"]) #antigravity\.agentSidePanelInputBox:not(:has([data-testid="branch-pill-trigger"])):hover,
:is(html, body):not(:has([data-testid="home-greeting"])):not([data-ag-page-type="home"]) [id="antigravity.agentSidePanelInputBox"]:not(:has([data-testid="branch-pill-trigger"])):hover,
:is(html, body):not(:has([data-testid="home-greeting"])):not([data-ag-page-type="home"]) .surface-composer.bg-card-border:not(:has([data-testid="branch-pill-trigger"])):hover,
:is(html, body):not(:has([data-testid="home-greeting"])):not([data-ag-page-type="home"]) #antigravity\.agentSidePanelInputBox:not(:has([data-testid="branch-pill-trigger"])):focus-within,
:is(html, body):not(:has([data-testid="home-greeting"])):not([data-ag-page-type="home"]) [id="antigravity.agentSidePanelInputBox"]:not(:has([data-testid="branch-pill-trigger"])):focus-within,
:is(html, body):not(:has([data-testid="home-greeting"])):not([data-ag-page-type="home"]) .surface-composer.bg-card-border:not(:has([data-testid="branch-pill-trigger"])):focus-within {
  border: 1.5px solid #74221A !important;
  border-color: #74221A !important;
  box-shadow: 0 1px 4px rgba(116, 34, 26, 0.12) !important;
}

/* ======================================================================
 * 【方案 2：内部白玉打字卡片微浮雕平滑抬升】
 * ====================================================================== */
.surface-composer-card.bg-card,
[id="antigravity.agentSidePanelInputBox"] .surface-composer-card,
[id="antigravity.agentSidePanelInputBox"] > div.bg-card {
  background-color: #FFFFFF !important;
  border: 1px solid transparent !important;
  border-color: transparent !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02) !important;
  outline: none !important;
  transition: box-shadow 250ms cubic-bezier(0.16, 1, 0.3, 1) !important;
}
.surface-composer:focus-within > .surface-composer-card,
.surface-composer-card:focus-within,
[id="antigravity.agentSidePanelInputBox"]:focus-within .surface-composer-card {
  box-shadow: 0 6px 20px -2px rgba(60, 20, 15, 0.07),
              0 2px 6px -1px rgba(0, 0, 0, 0.04) !important;
}
```

---

## 四、 配套汉化治理矩阵

与本套输入框设计同批落地的全界面汉化词典中，重点覆盖了输入框及相关周边弹窗的每一处英文：

```
┌────────────────────────────────────────────────────────────────────────┐
│                        输入框与权限系统汉化全景                        │
├────────────────────────────────────────────────────────────────────────┤
│  顶部工具栏:                                                           │
│  [📁 Root] ➔ [🌿 选择分支 (Select branch)]                             │
│                                                                        │
│  输入编辑区:                                                           │
│  "向智能体提问，键入 @ 引用上下文，键入 / 调出快捷操作"                     │
│                                                                        │
│  底部状态条与弹出菜单:                                                 │
│  [+] [Gemini 4 Argon Medium]  [🛡️ 极速模式 (Turbo)]                    │
│                                 │                                      │
│                                 ▼ (下拉弹出)                           │
│     ┌────────────────────────────────────────────────────────────┐     │
│     │ 👁️ 请求审查 (Request Review)                              │     │
│     │    每项命令均需经过用户批准。 (Every command requires ...)  │     │
│     │ 🔒 默认 (Default)                                         │     │
│     │    执行敏感操作前进行确认。 (Ask before sensitive ...)      │     │
│     │ 🛡️ 极速模式 (Turbo)                                       │     │
│     │    不受限制地直接执行所有命令。(Run all commands without ...)│     │
│     └────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  全局系统设置 (Settings ➔ Permissions):                                │
│  - 大标题: 权限 (Permissions)                                          │
│  - 主说明: 配置智能体在本地与远程对话中的操作权限。 (Configure what...)  │
│  - 本地权限: 本机 (This Computer)                                      │
│  - 远程权限: 远程 (Remote)                                              │
│  - 远程说明: 控制智能体在远程对话中的操作权限。(Controls permissions...)│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 五、 长期演进与稳定版推送准则

1. **零破坏升级契约**：后续任何对 `antigravity-font-daemon.mjs` 或 Insiders 开发版的修改，必须先执行 `:has([data-testid="branch-pill-trigger"])` 互斥测试，严禁回退为全局无条件绑定；
2. **字重与边框尺寸锁定**：边框宽度必须严格保持 `1.5px`，严禁在交互态随意变更物理尺寸；
3. **双分支同步制度**：任何涉及本方案的变动，主分支 `main` 与开发分支 `insiders-dev` 必须通过 Fast-forward 保持绝对一致，确保官方稳定版下一次推送时一键平滑吸收。
