import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// ==============================================================================
// 1. 字体配置 (Claude 官方设计系统 + 更纱黑体/Slab 融合：UI Sans | 正文 Serif + 更纱 | 代码/输入框 Mono Slab)
// ==============================================================================
const UI_FONT = "'Anthropic Sans', 'Anthropic Sans Web', 'Anthropic Sans Web Text', 'anthropic-sans', 'Styrene B', 'Styrene', system-ui, -apple-system, BlinkMacSystemFont, 'Sarasa UI SC', '更纱黑体 UI SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
const CONTENT_FONT = "'Anthropic Serif', 'Anthropic Serif Web', 'Anthropic Serif Web Text Light', 'anthropic-serif', 'Tiempos Text', 'Tiempos', Georgia, Cambria, 'Times New Roman', 'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', 'Sarasa Gothic SC', '更纱黑体 SC', 'PingFang SC', serif";
const MONO_FONT = "'Anthropic Mono', 'Anthropic Mono Web', 'anthropic-mono', 'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace";
const INPUT_FONT = "'Sarasa Mono Slab SC', '等距更纱黑体 Slab SC', 'Anthropic Mono', ui-monospace, monospace";

const PORT_FILE = path.join(
  os.homedir(),
  'Library/Application Support/Antigravity - Insiders/DevToolsActivePort'
);
const CONVERSATIONS_DIR = path.join(
  os.homedir(),
  '.gemini/antigravity-insiders/conversations'
);
const CONTEXT_LIMIT_TOKENS = 256000;

// ==============================================================================
// 2. CSS 样式定义
// ==============================================================================
const CSS_CONTENT = `
  @font-face {
    font-family: 'Anthropic Serif';
    src: local('Anthropic Serif Web'), local('Anthropic Serif Web Text Light'), local('Anthropic Serif');
    font-weight: 300 500;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'Anthropic Serif';
    src: local('Anthropic Serif Bold'), local('Anthropic Serif Web Bold');
    font-weight: 600 900;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'Anthropic Sans';
    src: local('Anthropic Sans Web'), local('Anthropic Sans Web Text'), local('Anthropic Sans');
    font-weight: 300 500;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'Anthropic Sans';
    src: local('Anthropic Sans Bold'), local('Anthropic Sans Web Bold');
    font-weight: 600 900;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: 'Anthropic Mono';
    src: local('Anthropic Mono Web'), local('Anthropic Mono');
    font-weight: 400 700;
    font-style: normal;
    font-display: swap;
  }

  :root,
  body,
  body[data-agy-font],
  body[data-agy-font="google-sans"],
  body[data-agy-font="inter"] {
    --vscode-font-family: ${UI_FONT} !important;
    --editor-font-family: ${MONO_FONT} !important;
    --font-sans: ${UI_FONT} !important;
    --font-mono: ${MONO_FONT} !important;
    --default-font-family: var(--font-sans) !important;
    --default-mono-font-family: var(--font-mono) !important;
  }
  /* 1. UI 控件与全局界面：Claude Anthropic Sans / 更纱 UI */
  html, body, body[data-agy-font], button, select, nav, header, aside {
    font-family: var(--font-sans) !important;
    -webkit-font-smoothing: antialiased;
  }

  /* 2. 对话正文与 Markdown 内容：Claude 标志性 Anthropic Serif 衬线 + 更纱粗衬线/黑体 */
  .select-text, .prose, .markdown, article,
  .select-text :is(p, li, blockquote, h1, h2, h3, h4, h5, h6, strong, em, span, div) {
    font-family: ${CONTENT_FONT};
    letter-spacing: -0.003em;
  }
  .select-text :is(p, li, blockquote) {
    line-height: 1.62;
  }

  /* 3. 代码、终端、diff查看器、文件名、文件路径：Claude Anthropic Mono / Sarasa Mono */
  code, pre, kbd, samp, .font-mono, [class*="language-"], .monaco-editor, .xterm, pre *,
  [class*="group/file-title"], [class*="group/file-title"] *,
  [class*="file-title"], [class*="file-path"],
  [data-path], [data-file-path], .tabular-nums,
  .select-text :is(code, pre, kbd, samp, .font-mono) {
    font-family: var(--font-mono) !important;
  }

  /* 4. 输入框编辑区：Codex 同款等距更纱黑体 SLAB (Sarasa Mono Slab SC) */
  div[contenteditable="true"], textarea,
  div[contenteditable="true"] :is(p, span, div),
  [data-composer], .ProseMirror, .ProseMirror :is(p, span) {
    font-family: ${INPUT_FONT} !important;
  }

  /* 5. 配色版本 3: 复古深色 (absoulutely-chuanban) */
  html[data-ag-preset="absoulutely-chuanban"],
  html[data-ag-preset="vintage-deep"],
  html[data-ag-preset="absoulutely-chuanban"] body.theme-light,
  html[data-ag-preset="vintage-deep"] body.theme-light {
    --background: #FBF9F5 !important;
    --sidebar: #F1E8DC !important;
    --sidebar-secondary: #E6DCCE !important;
    --sidebar-muted: #E8DFD1 !important;
    --sidebar-border: #E0D4C3 !important;
    --vscode-sideBar-background: #F1E8DC !important;
  }
  html[data-ag-preset="absoulutely-chuanban"] .bg-sidebar,
  html[data-ag-preset="vintage-deep"] .bg-sidebar {
    background-color: var(--sidebar) !important;
  }
  html[data-ag-preset="absoulutely-chuanban"] body,
  html[data-ag-preset="vintage-deep"] body {
    background-color: var(--background) !important;
  }

  /* 6. 配色版本 2: ClaudeDesktop 净白 (claude-desktop-official / claude-desktop-purewhite) */
  html[data-ag-preset="claude-desktop-official"],
  html[data-ag-preset="claude-desktop-purewhite"],
  html[data-ag-preset="claude-desktop-official"] body.theme-light,
  html[data-ag-preset="claude-desktop-purewhite"] body.theme-light {
    --background: #FCFCFB !important;
    --foreground: #1F1E1D !important;
    --sidebar: #FBFBF9 !important;
    --sidebar-secondary: #EDECE9 !important;
    --sidebar-muted: #F3F2EF !important;
    --sidebar-border: #F0F0EE !important;
    --vscode-sideBar-background: #FBFBF9 !important;
    --card: color-mix(in srgb, #FBF9F5 70%, #ffffff) !important;
    --card-border: color-mix(in srgb, #2C2B29 12%, color-mix(in srgb, #FBF9F5 70%, #ffffff)) !important;
  }
  html[data-ag-preset="claude-desktop-official"] .bg-sidebar,
  html[data-ag-preset="claude-desktop-purewhite"] .bg-sidebar {
    background-color: var(--sidebar) !important;
  }
  html[data-ag-preset="claude-desktop-official"] body,
  html[data-ag-preset="claude-desktop-purewhite"] body {
    background-color: var(--background) !important;
    color: var(--foreground) !important;
  }

  /* 7. 配色版本 1 (默认首选): 高对比版 (chuanban-warm-white / high-contrast)
     - 正文页面: 保持微暖亮白 #FCFCFB
     - 左边栏: 介于白色和原正文底色之间的暖白燕麦色 #F7F5F0
     - 输入框: 保持白色但比正文略深一点点、带有一点接近暖棕的颜色 #F9F7F2
     - 高对比强化:
       * 按钮主轮廓线 (新建对话、历史对话): 边框从浅淡灰提升为高清晰度对比线
       * 竖线中缝 (正文与左栏右栏间): 从淡灰透明提升为清晰实线
       * 输入框下方的模型名称、Turbo模式、图标等: 从浅灰提升为近乎纯黑深墨色 (#0A0A0A)
  */
  html[data-ag-preset="chuanban-warm-white"],
  html[data-ag-preset="high-contrast"],
  html[data-ag-preset="chuanban-warm-white"] body.theme-light,
  html[data-ag-preset="high-contrast"] body.theme-light {
    --background: #FCFCFB !important;
    --foreground: #1F1E1D !important;
    --sidebar: #F7F5F0 !important;
    --sidebar-secondary: #ECE9E1 !important;
    --sidebar-muted: #F2EFE7 !important;
    --sidebar-border: rgba(0, 0, 0, 0.35) !important;
    --border: rgba(0, 0, 0, 0.38) !important;
    --vscode-sideBar-background: #F7F5F0 !important;
    --card: #FFFFFF !important;
    --card-border: #F7EFE6 !important;
    --secondary-foreground: #0A0A0A !important;
    --muted-foreground: #1A1A1A !important;
  }
  html[data-ag-preset="chuanban-warm-white"] .bg-sidebar,
  html[data-ag-preset="high-contrast"] .bg-sidebar {
    background-color: var(--sidebar) !important;
  }
  html[data-ag-preset="chuanban-warm-white"] body,
  html[data-ag-preset="high-contrast"] body {
    background-color: var(--background) !important;
    color: var(--foreground) !important;
  }

  /* 输入框外层容器（含上方工具栏与延伸至下方的弧形外框轮廓）：与按钮同色系的高白度低干扰浅色 (#F7EFE6 / #E8DDD0) */
  html[data-ag-preset] #antigravity\\.agentSidePanelInputBox,
  html[data-ag-preset] [id="antigravity.agentSidePanelInputBox"],
  #antigravity\\.agentSidePanelInputBox,
  [id="antigravity.agentSidePanelInputBox"],
  .surface-composer.bg-card-border {
    background-color: #F7EFE6 !important;
    border-color: #E8DDD0 !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03), 0 0 0 1px #E8DDD0 !important;
  }
  /* 上方工具栏文字与小按钮（No Project 及其箭头） */
  [id="antigravity.agentSidePanelInputBox"] > div:first-child button,
  [id="antigravity.agentSidePanelInputBox"] > div:first-child span,
  [id="antigravity.agentSidePanelInputBox"] > div:first-child svg {
    color: #383431 !important;
  }
  [id="antigravity.agentSidePanelInputBox"] > div:first-child button:hover {
    background-color: rgba(217, 119, 87, 0.08) !important;
    color: #1F1E1D !important;
  }
  /* 内部输入区域卡片：纯净高白 (#FFFFFF)，与外层形成优雅的纸本质感阶梯 */
  .surface-composer-card.bg-card,
  [id="antigravity.agentSidePanelInputBox"] .surface-composer-card,
  [id="antigravity.agentSidePanelInputBox"] > div.bg-card {
    background-color: #FFFFFF !important;
    border: 1px solid #ECE3D8 !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02) !important;
  }

  /* 高对比主轮廓线：新建对话、历史对话及操作胶囊 */
  html[data-ag-preset="chuanban-warm-white"] a[class*="inline-flex items-center"],
  html[data-ag-preset="high-contrast"] a[class*="inline-flex items-center"],
  html[data-ag-preset="chuanban-warm-white"] .bg-sidebar a,
  html[data-ag-preset="high-contrast"] .bg-sidebar a,
  html[data-ag-preset="chuanban-warm-white"] .bg-sidebar button,
  html[data-ag-preset="high-contrast"] .bg-sidebar button {
    border-color: rgba(0, 0, 0, 0.32) !important;
  }
  /* 高对比竖线中缝：正文与左右栏边界 */
  html[data-ag-preset="chuanban-warm-white"] .bg-border,
  html[data-ag-preset="high-contrast"] .bg-border {
    background-color: rgba(0, 0, 0, 0.28) !important;
  }
  /* 高对比输入框底部：模型名称、Turbo模式、图标字体深色近乎纯黑 */
  html[data-ag-preset="chuanban-warm-white"] #antigravity\\.agentSidePanelInputBox [class*="text-secondary-foreground"],
  html[data-ag-preset="high-contrast"] #antigravity\\.agentSidePanelInputBox [class*="text-secondary-foreground"],
  html[data-ag-preset="chuanban-warm-white"] #antigravity\\.agentSidePanelInputBox button:not([data-testid="send-button"]):not([data-testid="voice-start-button"]),
  html[data-ag-preset="high-contrast"] #antigravity\\.agentSidePanelInputBox button:not([data-testid="send-button"]):not([data-testid="voice-start-button"]),
  html[data-ag-preset="chuanban-warm-white"] #antigravity\\.agentSidePanelInputBox span:not([data-testid="voice-live-pill"]),
  html[data-ag-preset="high-contrast"] #antigravity\\.agentSidePanelInputBox span:not([data-testid="voice-live-pill"]),
  html[data-ag-preset="chuanban-warm-white"] #antigravity\\.agentSidePanelInputBox svg,
  html[data-ag-preset="high-contrast"] #antigravity\\.agentSidePanelInputBox svg {
    color: #0A0A0A !important;
    opacity: 1 !important;
  }

  /* 发送按钮与操作胶囊：Claude 陶土暖橙与暗金质感 (#D97757)，高对比纯白图标 */
  html[data-ag-preset] #antigravity\\.agentSidePanelInputBox [data-testid="voice-live-pill"],
  html[data-ag-preset] #antigravity\\.agentSidePanelInputBox button[data-testid="send-button"],
  html[data-ag-preset] #antigravity\\.agentSidePanelInputBox .agy-send-button,
  [data-testid="voice-live-pill"],
  button[data-testid="send-button"],
  .agy-send-button {
    background-color: #D97757 !important;
    color: #FFFFFF !important;
    border: 1px solid #C45F40 !important;
    box-shadow: 0 1px 2px rgba(217, 119, 87, 0.25) !important;
  }
  html[data-ag-preset] #antigravity\\.agentSidePanelInputBox [data-testid="voice-live-pill"]:hover,
  html[data-ag-preset] #antigravity\\.agentSidePanelInputBox button[data-testid="send-button"]:hover,
  html[data-ag-preset] #antigravity\\.agentSidePanelInputBox .agy-send-button:hover,
  [data-testid="voice-live-pill"]:hover,
  button[data-testid="send-button"]:hover,
  .agy-send-button:hover {
    background-color: #C86646 !important;
    opacity: 1 !important;
  }
  html[data-ag-preset] #antigravity\\.agentSidePanelInputBox [data-testid="voice-live-pill"] *,
  html[data-ag-preset] #antigravity\\.agentSidePanelInputBox button[data-testid="send-button"] *,
  html[data-ag-preset] #antigravity\\.agentSidePanelInputBox .agy-send-button * {
    color: #FFFFFF !important;
    fill: #FFFFFF !important;
  }

  /* 8. 界面排版扎实度与温润墨感增强（保留更纱黑体不变） */
  /* 侧边栏常规列表：字重450微收敛、微负字距凝聚、深暖炭墨色、0.2px微润墨柔化硬切角 */
  .bg-sidebar a,
  .bg-sidebar button,
  .bg-sidebar [class*="truncate"],
  .bg-sidebar [class*="text-sm"],
  .bg-sidebar [class*="text-xs"],
  aside a,
  aside button {
    font-weight: 450 !important;
    letter-spacing: -0.012em !important;
    color: #262422 !important;
    text-rendering: optimizeLegibility;
    text-shadow: 0 0 0.2px rgba(38, 36, 34, 0.35);
  }

  /* 项目目录文件夹标题 (Root / Storydesk 等展开按钮及子标签)：轻削粗度与墨晕，避免误伤 */
  button[data-testid="project-header"],
  button[data-project-card="true"],
  [data-project-label],
  [data-subtext] span[class*="text-muted"],
  span:has(> svg) + span {
    font-weight: 450 !important;
    color: #383533 !important;
    text-shadow: 0 0 0.15px rgba(38, 36, 34, 0.25) !important;
  }
  button[data-testid="project-header"] span,
  button[data-project-card="true"] span {
    font-weight: 450 !important;
    color: #2C2B29 !important;
    text-shadow: 0 0 0.15px rgba(38, 36, 34, 0.25) !important;
    letter-spacing: -0.01em !important;
  }

  /* 侧栏选中态与激活项：精准限定激活对话，深墨纯黑、轮廓扎实 */
  [data-testid="conversation-row-sidebar"][data-selected="true"],
  [data-testid="conversation-row-sidebar"][data-selected="true"] span,
  .bg-sidebar [data-active="true"],
  .bg-sidebar [data-active="true"] span,
  .bg-sidebar [aria-selected="true"] {
    font-weight: 520 !important;
    color: #0A0A0A !important;
    text-shadow: 0 0 0.25px rgba(10, 10, 10, 0.4);
  }

  /* 侧栏分类小标题（如置顶对话、项目管理） */
  .bg-sidebar [class*="text-muted"],
  .bg-sidebar [class*="text-[11px]"],
  .bg-sidebar [class*="uppercase"] {
    font-weight: 500 !important;
    letter-spacing: -0.005em !important;
    color: #7A7670 !important;
  }

  /* 界面按钮与全局操作控件：微负字距增加紧实感 */
  button, [role="button"], select {
    letter-spacing: -0.012em;
  }

  /* 输入框底部模型控制栏：深墨色与扎实字重 */
  #antigravity\\.agentSidePanelInputBox [class*="text-secondary-foreground"],
  #antigravity\\.agentSidePanelInputBox button,
  #antigravity\\.agentSidePanelInputBox span {
    font-weight: 500 !important;
    letter-spacing: -0.012em !important;
    text-shadow: 0 0 0.25px rgba(10, 10, 10, 0.4);
  }

  /* 9. 模型名称同行实时指标胶囊 (TPS / TTFT / Ctx 256k / Out)
     布局铁律：
     - 常态 (data-ag-row-mode="middle")：严格处于「左：+ 与模型选择」和「右：模式选择与发送按钮」正中间，随宽度自动 ellipsis 缩略；
     - 极窄 (data-ag-row-mode="bottom")：当中间可用宽度 < 150px (损失过多信息) 时，物理挂载至 bottomRow 正下方作为独立第二行，绝不改变第一行左右布局。
  */
  #antigravity\\.agentSidePanelInputBox div[data-ag-row-mode="middle"] > div:first-child,
  #antigravity\\.agentSidePanelInputBox div[data-ag-row-mode="bottom"] > div:first-child {
    overflow: hidden !important;
    min-width: 0 !important;
  }
  #antigravity\\.agentSidePanelInputBox div[data-ag-row-mode="middle"] > div:first-child > *:not(#ag-live-metrics-pill),
  #antigravity\\.agentSidePanelInputBox div[data-ag-row-mode="bottom"] > div:first-child > *:not(#ag-live-metrics-pill) {
    flex-shrink: 0 !important;
  }
  #antigravity\\.agentSidePanelInputBox div[data-ag-row-mode="middle"] > div:last-child,
  #antigravity\\.agentSidePanelInputBox div[data-ag-row-mode="bottom"] > div:last-child {
    flex-shrink: 0 !important;
    margin-left: auto !important;
  }
  #ag-live-metrics-pill {
    position: relative;
    display: none;
    align-items: center;
    flex: 1 1 0% !important;
    max-width: max-content !important;
    min-width: 0 !important;
    height: 22px;
    margin-left: 6px;
    margin-right: 4px;
    padding: 0 4px 0 8px;
    border-left: 1px solid rgba(0, 0, 0, 0.22);
    font-family: var(--font-mono) !important;
    font-variant-numeric: tabular-nums;
    font-size: 11px !important;
    line-height: 1 !important;
    white-space: nowrap;
    overflow: hidden;
    user-select: none;
    cursor: default;
  }
  #ag-live-metrics-pill[data-ag-row-mode="bottom"] {
    flex: 0 0 auto !important;
    width: calc(100% - 8px) !important;
    max-width: calc(100% - 8px) !important;
    height: 20px !important;
    margin: 1px 4px 2px 4px !important;
    padding: 2px 4px 0 6px !important;
    border-left: none !important;
    border-top: 1px dashed rgba(0, 0, 0, 0.14) !important;
  }
  #ag-live-metrics-pill #ag-live-metrics-text {
    display: block;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono) !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    letter-spacing: -0.02em !important;
    color: #262422 !important;
    opacity: 0.92 !important;
  }
  #ag-live-metrics-pill:hover #ag-live-metrics-text {
    opacity: 1 !important;
    color: #0A0A0A !important;
  }
  #ag-live-metrics-pill .ag-sep {
    margin: 0 3.5px;
    opacity: 0.45 !important;
  }
  #ag-live-metrics-pill .ag-ctx-warn {
    color: #B45309 !important;
    font-weight: 600 !important;
  }
  #ag-live-metrics-pill .ag-ctx-crit {
    color: #DC2626 !important;
    font-weight: 700 !important;
  }
  #ag-live-metrics-tooltip {
    position: fixed;
    z-index: 2147483647;
    min-width: 370px;
    max-width: 450px;
    padding: 10px 12px;
    border-radius: 8px;
    background-color: var(--card, #F9F7F2) !important;
    border: 1px solid var(--card-border, rgba(0, 0, 0, 0.35)) !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08);
    font-family: var(--font-mono) !important;
    font-variant-numeric: tabular-nums;
    font-size: 11px !important;
    line-height: 1.55 !important;
    color: var(--foreground, #1F1E1D) !important;
    text-align: left;
    white-space: normal;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateY(4px);
    transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s;
  }
  #ag-live-metrics-tooltip[data-visible="1"] {
    opacity: 1 !important;
    visibility: visible !important;
    transform: translateY(0);
  }
  #ag-live-metrics-tooltip .ag-tt-hdr {
    font-weight: 600 !important;
    font-size: 11px !important;
    color: #0A0A0A !important;
    border-bottom: 1px solid rgba(0, 0, 0, 0.14);
    padding-bottom: 3px;
    margin-bottom: 4px;
  }
  #ag-live-metrics-tooltip .ag-tt-sec {
    margin-top: 8px;
  }
  #ag-live-metrics-tooltip .ag-tt-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 11px !important;
    font-weight: 450 !important;
  }
  #ag-live-metrics-tooltip .ag-tt-lbl {
    color: #57534E !important;
    flex-shrink: 0;
  }
  #ag-live-metrics-tooltip .ag-tt-val {
    color: #0A0A0A !important;
    font-weight: 500 !important;
    text-align: right;
  }
`.replace(/\s+/g, ' ').trim();

// ==============================================================================
// 3. 汉化词典定义
// ==============================================================================
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
  'Skills': '技能列表',
  'Plugins': '扩展插件',
  'Remote Control': '远程控制',
  'Notifications': '系统通知',
  'Advanced Settings': '高级设置',
  'Developer': '开发者模式',

  // --- 主设置：选项卡卡片与说明 ---
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
  'Prevent Sleep': '防止电脑休眠',
  'Keep In Menu Bar': '保持在系统菜单栏',
  'Enable Remote Control': '启用远程控制',
  'Open System Preferences': '打开系统设置',
  'Toggle Sidebar': '切换侧边栏',
  'Toggle Auxiliary Pane': '切换辅助看板',
  'Toggle Terminal': '切换终端面板',
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
  'Archive This Conversation': '归档当前会话',
  'Toggle Maximize Auxiliary Pane': '最大化/还原辅助看板',
  'Toggle Overview Panel': '切换概览面板',

  // --- 设置说明文案与细项 ---
  'Configure agent execution, queued message delivery, and permissions.': '配置代理执行策略、排队消息发送及权限。',
  'Configure when follow-up messages are sent.': '配置后续追加消息的发送时机。',
  'Configure global allowed and denied resource permissions.': '配置全局允许与拒绝的系统资源访问权限。',
  'Learn more.': '了解更多。',
  'Learn more': '了解更多',
  'Controls the actions the agent can take.': '控制智能体可直接采取的系统操作范围。',
  'Modify permissions for file, terminal, and MCP tools.': '配置针对文件系统、终端和 MCP 工具的具体权限。',

  // --- 权限预设与项目设置 (Project Settings) ---
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

  // --- 代理行为与内置浏览器 (Agent Behavior & Browser) ---
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

  // --- 应用配置 (Application Settings) ---
  'Manage Antigravity app settings.': '管理 Antigravity 客户端应用设置。',
  'Prevent the computer from sleeping while the app is running.': '在应用运行期间阻止系统进入休眠状态。',
  'Keep the app accessible from the menu bar and running in the background when all windows are closed.': '在所有窗口关闭后保持应用在后台运行，并可通过菜单栏快捷访问。',
  'Work with local agents from another device.': '允许从其他设备连接并协同本地智能体。',
  'Notification Settings': '通知设置',
  'To modify notification settings, open your operating system\'s system preferences.': '如需修改通知设置，请前往 macOS 的系统设置进行配置。',
  'Version': '版本信息',
  'App version': '客户端版本',

  // --- MCP 工具与项目管理 (MCP & Projects) ---
  'MCP Tools': 'MCP 工具',
  'Mcp Tools': 'MCP 工具',
  'Configure external tools via Model Context Protocol.': '通过模型上下文协议 (Model Context Protocol) 配置外部工具。',
  'Not in Project': '未关联项目',
  'Rules': '项目规则',
  'Other Customizations': '其他自定义项',
  'Delete Project': '删除项目',
  'Delete': '删除',
  'Project': '项目',
  'including': '及',
  'Global': '全局',

  // --- 外观与编辑器 (Appearance & Editor) ---
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
  'Configure default behaviors, skills, and MCP servers.': '配置默认行为、技能及 MCP 服务器。',
  'Build With Google Plugins': 'Build With Google 官方插件',
  'Browse and enable plugins from the Build With Google catalog.': '浏览并启用来自 Build With Google 目录的扩展插件。',
  'Customize': '自定义',

  // --- 键盘快捷键 (Shortcuts) ---
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

  // --- 模型、用量与账号 (Models, Usage & Account) ---
  'Models & Usage': '模型与用量',
  'Manage your model quota and credits.': '管理您的模型配额与额度。',
  'Plan': '方案套餐',
  'Email': '电子邮箱',
  'Terms of Service': '服务条款',
  'By using this app, you agree to its': '使用此应用即表示您同意其',
  'Regroup Google3 Chats': '重新分组 Google3 会话',
  'Google3 chats will be regrouped into their workspaces in the sidebar.': 'Google3 对话将重新归类至侧边栏对应的各工作区中。',

  // --- 反馈表单 (Feedback) ---
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

  // --- 外观与账户通用文案 ---
  'Configure the agent\'s visual theme and display preferences.': '配置智能体的视觉主题与界面显示偏好。',
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
  'Upgrade': '升级方案',

  // --- 状态栏与输入框提示 ---
  'Ask anything, @ to mention, / for actions': '向智能体提问，键入 @ 引用上下文，键入 / 调出快捷操作',
  'Running commands': '正在执行命令',

  // --- 输入框「+ 添加上下文」弹窗与快捷操作 (Screenshot 1 & 邻近项) ---
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

  // --- 系统通知与提示音设置 (Screenshot 2: Notifications & Sound) ---
  'Manage your notification preferences.': '管理您的系统通知与提示音偏好设置。',
  'Enable Notifications for Agent': '启用智能体系统通知',
  'Show system notifications when your action is needed or the agent finishes.': '当需要您操作或智能体完成任务时显示系统通知。',
  'Sound': '提示音',
  'Enable Sounds for Agent': '启用智能体提示音',
  'Play a sound when your action is needed or the agent finishes.': '当需要您操作或智能体完成任务时播放提示音。',
  'Volume': '提示音量',
  'Set the volume of agent sounds.': '调节智能体提示音的音量大小。',
  'Chime volume': '提示音音量',

  // --- 技能与自定义 / Token 占用明细 (Screenshot 3: Customizations & Token Breakdown) ---
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

  // --- 新增设置项补全 (常规 / 外观 / 应用 / 终端沙盒 / 浏览器高级项) ---
  'Context Menus': '右键快捷菜单',
  'Custom Context Menus': '自定义右键快捷菜单',
  'Replace the default browser right-click menu with quick actions.': '使用快捷操作菜单替换默认的浏览器右键菜单。',
  'Markdown Artifact Width': 'Markdown 工件显示宽度',
  'Configure the default width of markdown artifacts.': '配置 Markdown 交付工件的默认显示宽度。',
  'Fill': '铺满全宽',
  'Open Links In': '默认打开链接方式',
  'Choose where links open by default when clicked.': '选择点击链接时的默认打开位置。',
  'Side Panel': '右侧边栏',
  'Built-in Browser': '内置浏览器',
  'New Tab': '新标签页',
  'External Browser': '系统外部浏览器',
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
  'Updater': '软件更新',
  'Automatic Check for Updates': '自动检查更新',
  'Automatically prompt you to restart the app when a new update is available. When disabled, you can check for updates manually from the app menu.':
    '当有新版本可用时自动提示重启应用进行更新；关闭后仍可通过应用菜单手动检查更新。',
  'Manage your conversations from the companion website.': '通过配套网页端远程管理您的本地会话。',
  'Nickname': '设备昵称',
  'A nickname for identifying this application in the companion website. Changing this will restart the connection.':
    '用于在配套网页端识别此客户端的设备昵称，修改后将重新建立连接。',
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
  'See Activity': '查看消费明细',
  'Get More AI Credits': '获取更多 AI 点数',
  'Back': '返回'
};

// ==============================================================================
// 4. 浏览器端自执行脚本（含样式注入 + 实时防误伤汉化）
// ==============================================================================
const INJECT_SCRIPT = `
  (() => {
    // 1. 注入更纱黑体样式
    let style = document.getElementById("ag-custom-fonts");
    if (!style) {
      style = document.createElement("style");
      style.id = "ag-custom-fonts";
      const target = document.head || document.getElementsByTagName("head")[0] || document.documentElement;
      if (target) {
        target.appendChild(style);
      }
    }
    if (style && style.textContent !== ${JSON.stringify(CSS_CONTENT)}) {
      style.textContent = ${JSON.stringify(CSS_CONTENT)};
    }

    // 2. 防死锁守护：Antigravity 原生 TanStack Router 缺陷修复
    // 当快速多次点击系统设置，或弹窗在 250ms 关闭动画期间再次点击时，URL 会残留 settingsOpen=true，
    // 导致 TanStack Router 判定状态未变（No-op），导致弹窗永久点不开。
    if (!window.__ag_settings_guard_installed) {
      window.__ag_settings_guard_installed = true;
      document.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest && e.target.closest('[data-testid="settings-button"]');
        if (!btn) return;

        const hasDialog = !!document.querySelector('[role="dialog"]');
        const urlHasSettings = window.location.search.includes("settingsOpen=true");

        // 如果弹窗未打开但 URL 却残留了 settingsOpen=true，说明陷入了路由死锁状态
        if (!hasDialog && urlHasSettings) {
          const url = new URL(window.location.href);
          url.searchParams.delete("settingsOpen");
          url.searchParams.delete("settingsScreen");
          window.history.replaceState(window.history.state, "", url.toString());
        }
      }, true); // 捕获阶段拦截，确保在 React 事件触发前破除死锁
    }

    // 2.1 缩放快捷键原生缺陷修复（恢复 Cmd + - / Cmd + = / Cmd + 0）
    // 原因：Antigravity 官方在桌面端 variant 显式将 zoomIn/zoomOut 的按键绑定设成了空数组 []，
    // 且 macOS 系统菜单的 role 事件被 <webview> 隔离无法穿透。此处在捕获阶段直接桥接 window.electronNative。
    if (!window.__ag_zoom_guard_installed) {
      window.__ag_zoom_guard_installed = true;
      window.addEventListener("keydown", (e) => {
        if (e.metaKey && !e.ctrlKey && !e.altKey) {
          // Cmd + - (缩小)
          if (!e.shiftKey && (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract" || e.keyCode === 189)) {
            e.preventDefault();
            e.stopPropagation();
            window.electronNative?.zoomOut?.();
          }
          // Cmd + = 或 Cmd + + (放大)
          else if ((e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd" || e.keyCode === 187)) {
            e.preventDefault();
            e.stopPropagation();
            window.electronNative?.zoomIn?.();
          }
          // Cmd + 0 (重置 100%)
          else if (!e.shiftKey && (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0" || e.keyCode === 48)) {
            e.preventDefault();
            e.stopPropagation();
            window.electronNative?.zoomReset?.();
          }
        }
      }, true);
    }

    // 3. 专属预设状态联动与防崩溃保护
    // 船板三大预设官方定义：
    // 1、高对比版（当前首选默认）："high-contrast" / "chuanban-warm-white"
    // 2、ClaudeDesktop 净白："claude-desktop-purewhite" / "claude-desktop-official"
    // 3、复古深色："vintage-deep" / "absoulutely-chuanban"
    const PRESETS = {
      HIGH_CONTRAST: "high-contrast",
      CLAUDE_PUREWHITE: "claude-desktop-purewhite",
      VINTAGE_DEEP: "vintage-deep",
      // 向下兼容别名
      LEGACY_WARM_WHITE: "chuanban-warm-white",
      LEGACY_OFFICIAL: "claude-desktop-official",
      LEGACY_CHUANBAN: "absoulutely-chuanban"
    };

    const ALL_CUSTOM_PRESET_NAMES = new Set(Object.values(PRESETS));

    function syncChuanbanPreset() {
      try {
        const stored = Storage.prototype.getItem.call(localStorage, "theme-preset-light");
        if (ALL_CUSTOM_PRESET_NAMES.has(stored)) {
          try { Storage.prototype.setItem.call(localStorage, "theme-preset-light", "Default Light"); } catch (e) {}
        }

        // 读取配色版本偏好（默认激活船板 1、高对比版）
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

    if (!window.__ag_preset_hook_installed) {
      window.__ag_preset_hook_installed = true;
      try {
        const origGetItem = localStorage.getItem.bind(localStorage);
        localStorage.getItem = function(key) {
          const val = origGetItem(key);
          if (key === "theme-preset-light" && ALL_CUSTOM_PRESET_NAMES.has(val)) {
            return "Default Light";
          }
          return val;
        };

        const origSetItem = localStorage.setItem.bind(localStorage);
        localStorage.setItem = function(key, val) {
          if (key === "theme-preset-light" && ALL_CUSTOM_PRESET_NAMES.has(val)) {
            val = "Default Light";
          }
          origSetItem(key, val);
          if (key === "theme-preset-light" || key === "theme-mode" || key === "theme-color-flavor") {
            setTimeout(syncChuanbanPreset, 50);
          }
        };
      } catch (e) {}
    }

    syncChuanbanPreset();
    window.__ag_patch_version = "20261103-insiders-dev-v2";

    // 3.5 模型名称同行实时指标胶囊 (Scheme C: TPS · TTFT · Ctx/256k · Out + Hover 详情卡)
    // 严格保证「左(模型) - 中(指标胶囊) - 右(模式与发送)」三栏结构；中间过窄(<150px)时物理跳至下方第二行。
    const MIDDLE_MIN_WIDTH_PX = 150;

    function extractCascadeId() {
      try {
        const m = window.location.pathname.match(/\\/c\\/([0-9a-f-]{36})/i);
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
        const r = rows[i];
        if (r.querySelector('[data-testid="model-selector-trigger"], [data-testid="send-button"]')) {
          return r;
        }
      }
      return rows[rows.length - 1] || null;
    }

    function measureNaturalLeftWidth(leftGroup) {
      let w = 0;
      for (let i = 0; i < leftGroup.children.length; i++) {
        const ch = leftGroup.children[i];
        if (ch.id === "ag-live-metrics-pill") continue;
        // 取 scrollWidth 与 offsetWidth 的较大值，防止在 bottom 模式下因左侧曾收缩而低估真实宽度
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

      // 计算第一行中间可用宽度：总宽 - 左侧(+与模型名) - 右侧(模式与发送按钮) - 间距余量
      const rowW = bottomRow.clientWidth || 0;
      const leftW = measureNaturalLeftWidth(leftGroup);
      const rightW = rightGroup ? (rightGroup.offsetWidth || 0) : 0;
      const availMiddleW = rowW - leftW - rightW - 14;
      const useBottomRow = rowW > 0 && availMiddleW < MIDDLE_MIN_WIDTH_PX;
      const rowMode = useBottomRow ? "bottom" : "middle";

      bottomRow.setAttribute("data-ag-row-mode", rowMode);
      pill.setAttribute("data-ag-row-mode", rowMode);

      if (useBottomRow) {
        // 挂载到 bottomRow 所在的垂直父容器 (surface-composer-card)，严格位于 bottomRow 正下方第二行
        const cardParent = bottomRow.parentElement;
        if (cardParent && (pill.parentElement !== cardParent || pill.previousElementSibling !== bottomRow)) {
          bottomRow.after(pill);
        }
      } else {
        // 挂载到 leftGroup 末尾，严格处于「左侧模型选择」与「右侧模式/发送按钮」正中间
        if (pill.parentElement !== leftGroup) {
          leftGroup.appendChild(pill);
        }
      }

      // 绑定 ResizeObserver 实现窗口缩放 0ms 实时重排
      if (typeof ResizeObserver !== "undefined" && window.__ag_metrics_ro_target !== bottomRow) {
        if (window.__ag_metrics_ro) {
          try { window.__ag_metrics_ro.disconnect(); } catch (e) {}
        }
        window.__ag_metrics_ro_target = bottomRow;
        window.__ag_metrics_ro = new ResizeObserver(() => {
          ensureMetricsPill();
        });
        window.__ag_metrics_ro.observe(bottomRow);
        if (box !== bottomRow) window.__ag_metrics_ro.observe(box);
      }

      return pill;
    }

    if (!window.__ag_metrics_win_resize) {
      window.__ag_metrics_win_resize = true;
      window.addEventListener("resize", () => {
        ensureMetricsPill();
      });
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
        if (textEl && textEl.innerHTML !== payload.inlineHtml) {
          textEl.innerHTML = payload.inlineHtml;
        }
        if (ttEl && ttEl.innerHTML !== payload.tooltipHtml) {
          ttEl.innerHTML = payload.tooltipHtml;
        }
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
            window.__agRequestMetrics(cid);
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

    // 4. 注入界面汉化逻辑
    const DICT = ${JSON.stringify(I18N_DICT)};
    window.__ag_i18n_dict = DICT;

    // 严密保护区：绝不汉化正文内容、代码、输入框及文件名
    function isExcluded(node) {
      if (!node || !node.parentElement) return true;
      const el = node.parentElement;
      return !!el.closest(
        'code, pre, kbd, samp, textarea, input, [contenteditable="true"], .prose, .markdown, [class*="chat-message"], [class*="group/file-title"], #ag-live-metrics-pill, #ag-live-metrics-tooltip'
      );
    }

    function translateTextNode(node) {
      if (isExcluded(node)) return;
      const raw = node.nodeValue;
      if (!raw) return;
      const trimmed = raw.trim();
      if (!trimmed) return;

      // 静态词典精确匹配
      if (DICT[trimmed]) {
        const replacement = DICT[trimmed];
        // 如果原内容是孤立英文单词带空格（如 "Delete "），且替换目标为中文，则收缩空格为干净中文
        if (/[\\u4e00-\\u9fa5]/.test(replacement) && /^\\s*[a-zA-Z]+\\s*$/.test(raw)) {
          node.nodeValue = replacement;
        } else {
          node.nodeValue = raw.replace(trimmed, replacement);
        }
        return;
      }

      // 动态正则匹配
      if (/^(\\d+)\\s+files?\\s+changed$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^(\\d+)\\s+files?\\s+changed$/i, '$1 个文件变更');
        return;
      }
      if (/^See all\\s*\\((\\d+)\\)$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^See all\\s*\\((\\d+)\\)$/i, '查看全部 ($1)');
        return;
      }
      if (/^Show\\s+(\\d+)\\s+breakdowns?$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^Show\\s+(\\d+)\\s+breakdowns?$/i, '展开明细 ($1 项)');
        return;
      }
      if (/^(\\d+)\\s+tools?$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^(\\d+)\\s+tools?$/i, '$1 个工具');
        return;
      }
      if (/^(\\d+)\\s+demoted$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^(\\d+)\\s+demoted$/i, '$1 项已降级');
        return;
      }
      if (/^(\\d+)\\s+excluded$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^(\\d+)\\s+excluded$/i, '$1 项已排除');
        return;
      }
      if (/^(\\d+)\\s+tools?\\s+excluded$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^(\\d+)\\s+tools?\\s+excluded$/i, '$1 个工具已排除');
        return;
      }
      if (/^(\\d+)\\s+active\\s+conversations$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^(\\d+)\\s+active\\s+conversations$/i, '$1 个进行中的会话');
        return;
      }
      if (/^Permanently delete\\s+(.*)\\s+including\\s+(\\d+)\\s+active\\s+conversations\\.?$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^Permanently delete\\s+(.*)\\s+including\\s+(\\d+)\\s+active\\s+conversations\\.?$/i, '永久删除 $1 及 $2 个进行中的会话。');
        return;
      }
      if (/^Worked for\\s+(\\d+[smhd])$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^Worked for\\s+(\\d+[smhd])$/i, '已工作 $1');
        return;
      }
      if (/^Thought for\\s+(\\d+[smhd])$/i.test(trimmed)) {
        node.nodeValue = raw.replace(/^Thought for\\s+(\\d+[smhd])$/i, '已思考 $1');
        return;
      }

      // 模型配额重置时间动态汉化 (如 "You have used some of your weekly limit, it will fully refresh in 6 days, 12 hours.")
      if (/^You have used (some|all|most) of your (weekly|5-hour|five-hour|daily) limit,?\\s*it will fully refresh in (.*)\\.?$/i.test(trimmed)) {
        var match = trimmed.match(/^You have used (some|all|most) of your (weekly|5-hour|five-hour|daily) limit,?\\s*it will fully refresh in (.*)\\.?$/i);
        var degreeMap = { some: '部分', all: '全部', most: '大部分' };
        var typeMap = { weekly: '每周', '5-hour': '5 小时', 'five-hour': '5 小时', daily: '每日' };
        var degree = degreeMap[match[1].toLowerCase()] || match[1];
        var type = typeMap[match[2].toLowerCase()] || match[2];
        var timeStr = match[3].replace(/\\.$/, '')
          .replace(/(\\d+)\\s*days?/gi, '$1 天')
          .replace(/(\\d+)\\s*hours?/gi, '$1 小时')
          .replace(/(\\d+)\\s*minutes?/gi, '$1 分钟')
          .replace(/(\\d+)\\s*seconds?/gi, '$1 秒')
          .replace(/,\\s*/g, ' ')
          .trim();
        node.nodeValue = '您已消耗' + degree + type + '额度，将在 ' + timeStr + ' 后完全重置。';
        return;
      }
      if (/^You have not used any of your (weekly|5-hour|five-hour|daily) limit\\.?$/i.test(trimmed)) {
        var match = trimmed.match(/^You have not used any of your (weekly|5-hour|five-hour|daily) limit\\.?$/i);
        var typeMap = { weekly: '每周', '5-hour': '5 小时', 'five-hour': '5 小时', daily: '每日' };
        var type = typeMap[match[1].toLowerCase()] || match[1];
        node.nodeValue = '您尚未消耗任何' + type + '额度。';
        return;
      }
    }

    function scanAndTranslate(root = document.body) {
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        translateTextNode(walker.currentNode);
      }
      try {
        const labeledEls = root.querySelectorAll ? root.querySelectorAll('[title], [aria-label]') : [];
        for (let i = 0; i < labeledEls.length; i++) {
          const el = labeledEls[i];
          const t = el.getAttribute('title');
          if (t && DICT[t.trim()]) el.setAttribute('title', DICT[t.trim()]);
          const a = el.getAttribute('aria-label');
          if (a && DICT[a.trim()]) el.setAttribute('aria-label', DICT[a.trim()]);
        }
      } catch (e) {}
    }

    // 初次立即全量扫描
    scanAndTranslate();

    // 断开旧的监听器（如果存在），确保热重载生效
    if (window.__ag_i18n_observer) {
      try { window.__ag_i18n_observer.disconnect(); } catch (e) {}
    }

    let pending = false;
    window.__ag_i18n_observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        scanAndTranslate(document.body);
      });
    });

    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      window.__ag_i18n_observer.observe(targetNode, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  })()
`;

// ==============================================================================
// 5. SQLite + Protobuf 实时会话指标解析器 (node:sqlite 只读零依赖)
// ==============================================================================
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
      out.set(fn, buf.subarray(i, i + 8));
      i += 8;
    } else if (wt === 5) {
      out.set(fn, buf.subarray(i, i + 4));
      i += 4;
    } else {
      break;
    }
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

function fmtNum(n) {
  return (n || 0).toLocaleString('en-US');
}

function getDbSignature(cascadeId) {
  try {
    const dbPath = path.join(CONVERSATIONS_DIR, `${cascadeId}.db`);
    if (!fs.existsSync(dbPath)) return null;
    const st = fs.statSync(dbPath);
    let walSig = '0:0';
    const walPath = `${dbPath}-wal`;
    if (fs.existsSync(walPath)) {
      const wst = fs.statSync(walPath);
      walSig = `${wst.mtimeMs}:${wst.size}`;
    }
    return `${st.mtimeMs}:${st.size}|${walSig}`;
  } catch {
    return null;
  }
}

function readConversationMetrics(cascadeId) {
  if (!cascadeId || !/^[0-9a-f-]{36}$/i.test(cascadeId)) return null;
  const sig = getDbSignature(cascadeId);
  if (!sig) return { cascadeId, hasData: false };

  const cached = metricsCache.get(cascadeId);
  if (cached && cached.sig === sig) {
    return cached.payload;
  }

  const dbPath = path.join(CONVERSATIONS_DIR, `${cascadeId}.db`);
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx ASC').all();
    if (!rows || rows.length === 0) {
      db.close();
      db = null;
      const emptyPayload = { cascadeId, hasData: false, sig };
      metricsCache.set(cascadeId, { sig, payload: emptyPayload });
      return emptyPayload;
    }
    const userSteps = db.prepare('SELECT idx FROM steps WHERE step_type = 14 ORDER BY idx ASC').all();
    const plannerSteps = db.prepare('SELECT idx FROM steps WHERE step_type = 15 ORDER BY idx ASC').all();
    db.close();
    db = null;

    const lastUserStepIdx = userSteps.length > 0 ? userSteps[userSteps.length - 1].idx : -1;
    let totalIn = 0, totalCache = 0, totalOut = 0, totalThink = 0, totalResp = 0;
    let turnSteps = 0, turnOut = 0, turnThink = 0, turnResp = 0, turnDur = 0;

    const parsed = rows.map((r, i) => {
      const top = parseProto(r.data);
      const chat = top.has(1) ? parseProto(top.get(1)) : new Map();
      const usage = chat.has(4) ? parseProto(chat.get(4)) : new Map();
      const ttftMap = chat.has(11) ? parseProto(chat.get(11)) : new Map();
      const streamMap = chat.has(12) ? parseProto(chat.get(12)) : new Map();

      const inTok = usage.get(2) || 0;
      const outTok = usage.get(3) || 0;
      const cacheRead = usage.get(5) || 0;
      const thinkTok = usage.get(9) || 0;
      const respTok = usage.get(10) || 0;
      const ttft = (ttftMap.get(1) || 0) + (ttftMap.get(2) || 0) / 1e9;
      const stream = (streamMap.get(1) || 0) + (streamMap.get(2) || 0) / 1e9;
      const stepIdx = plannerSteps[i] ? plannerSteps[i].idx : i;

      totalIn += inTok;
      totalCache += cacheRead;
      totalOut += outTok;
      totalThink += thinkTok;
      totalResp += respTok;

      if (stepIdx > lastUserStepIdx) {
        turnSteps += 1;
        turnOut += outTok;
        turnThink += thinkTok;
        turnResp += respTok;
        turnDur += (ttft + stream);
      }

      return {
        idx: r.idx,
        inTok,
        outTok,
        cacheRead,
        ctx: inTok + cacheRead,
        thinkTok,
        respTok,
        ttft,
        stream,
        totDur: ttft + stream
      };
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

    // 方案 C 行内格式: 154 tok/s · TTFT 4.2s · Ctx 182k/256k (71%) · Out 1.8k
    const inlineHtml = [
      `<span>${Math.round(displayTps)} tok/s</span>`,
      `<span class="ag-sep">·</span>`,
      `<span>TTFT ${last.ttft.toFixed(1)}s</span>`,
      `<span class="ag-sep">·</span>`,
      `<span>Ctx ${fmtTok(last.ctx)}/256k <span class="${ctxClass}">(${ctxPct}%)</span></span>`,
      `<span class="ag-sep">·</span>`,
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

    const payload = {
      cascadeId,
      hasData: true,
      sig,
      inlineHtml,
      tooltipHtml
    };
    metricsCache.set(cascadeId, { sig, payload });
    return payload;
  } catch (err) {
    if (db) {
      try { db.close(); } catch {}
    }
    return null;
  }
}

// ==============================================================================
// 6. 守护进程调度与健壮 RPC 逻辑
// ==============================================================================
const activeSockets = new Map(); // targetId -> { ws, pendingRequests, isInjecting, isChecking, lastPushedSig }
let rpcCounter = 1;

function getDevToolsPort() {
  try {
    if (!fs.existsSync(PORT_FILE)) return null;
    const content = fs.readFileSync(PORT_FILE, 'utf8');
    const port = content.trim().split('\n')[0];
    return port ? parseInt(port, 10) : null;
  } catch {
    return null;
  }
}

function queryTargets(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve([]);
    });
  });
}

function sendCDP(session, method, params = {}) {
  return new Promise((resolve, reject) => {
    const { ws, pendingRequests } = session;
    if (!ws || ws.readyState !== 1) {
      return reject(new Error('WebSocket not connected'));
    }
    const id = rpcCounter++;
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`CDP request ${method} (id=${id}) timed out`));
    }, 4000);

    pendingRequests.set(id, { resolve, reject, timer, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
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
    if (cid) {
      await pushMetricsToSession(session, cid, false);
    }
  } catch {}
}

async function inject(session, targetId) {
  if (session.isInjecting) return;
  session.isInjecting = true;
  try {
    // Register once per CDP session; lifecycle reinjection must not accumulate scripts.
    if (!session.newDocumentScriptId) {
      const registered = await sendCDP(session, 'Page.addScriptToEvaluateOnNewDocument', { source: INJECT_SCRIPT });
      session.newDocumentScriptId = registered.identifier;
    }
    await sendCDP(session, 'Runtime.evaluate', {
      expression: INJECT_SCRIPT,
      returnByValue: true
    });
    session.lastPushedSig = '';
    console.log(`[Daemon] Injected font, i18n & live metrics into target ${targetId}`);
  } catch (err) {
    console.error(`[Daemon] Injection failed on ${targetId}:`, err.message || err);
  } finally {
    session.isInjecting = false;
  }
  await syncMetricsForSession(session);
}

async function checkAndHeal(session, targetId) {
  if (session.isChecking || session.isInjecting) return;
  session.isChecking = true;
  try {
    const res = await sendCDP(session, 'Runtime.evaluate', {
      expression: 'Boolean(document.getElementById("ag-custom-fonts") && window.__ag_patch_version === "20261103-insiders-dev-v2")',
      returnByValue: true
    });
    const isHealthy = res?.result?.value === true;
    if (!isHealthy) {
      console.log(`[Self-Healing] Custom style or hooks missing in target ${targetId}, re-injecting...`);
      await inject(session, targetId);
    }
  } catch {
    // 忽略页面刷新等短时通信中断
  } finally {
    session.isChecking = false;
  }
}

async function attachTarget(target) {
  if (!target || target.type !== 'page' || !target.webSocketDebuggerUrl) return;
  if (activeSockets.has(target.id)) return;

  try {
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    const session = {
      ws,
      pendingRequests: new Map(),
      isInjecting: false,
      isChecking: false,
      lastPushedSig: ''
    };
    activeSockets.set(target.id, session);

    ws.onopen = async () => {
      console.log(`[Daemon] Attached target: ${target.id} (${target.title || 'untitled'})`);
      try {
        await sendCDP(session, 'Page.enable');
        await sendCDP(session, 'Runtime.enable');
        await sendCDP(session, 'Runtime.addBinding', { name: '__agRequestMetrics' });
        await inject(session, target.id);
      } catch (err) {
        console.error(`[Daemon] Initialization failed on ${target.id}:`, err.message || err);
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id && session.pendingRequests.has(msg.id)) {
          const req = session.pendingRequests.get(msg.id);
          clearTimeout(req.timer);
          session.pendingRequests.delete(msg.id);
          if (msg.error) {
            req.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else if (msg.result?.exceptionDetails) {
            const desc = msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails.text;
            req.reject(new Error(`Script Exception: ${desc}`));
          } else {
            req.resolve(msg.result);
          }
          return;
        }

        // 前端切换会话时立即响应推送指标 (< 5ms)
        if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agRequestMetrics') {
          const cid = msg.params.payload;
          if (cid) {
            pushMetricsToSession(session, cid, true);
          }
          return;
        }

        // 页面导航或加载事件：触发重注入
        if (
          msg.method === 'Page.loadEventFired' ||
          msg.method === 'Page.domContentEventFired' ||
          msg.method === 'Page.frameNavigated'
        ) {
          console.log(`[Daemon] Page lifecycle ${msg.method} on ${target.id}`);
          inject(session, target.id);
        }
      } catch {}
    };

    ws.onclose = () => {
      console.log(`[Daemon] Disconnected from target: ${target.id}`);
      for (const req of session.pendingRequests.values()) {
        clearTimeout(req.timer);
        req.reject(new Error('WS closed'));
      }
      activeSockets.delete(target.id);
    };

    ws.onerror = (e) => {
      console.error(`[Daemon] WS error on target: ${target.id}`, e?.message || '');
      try { ws.close(); } catch {}
      activeSockets.delete(target.id);
    };
  } catch (err) {
    console.error(`[Daemon] Failed to attach target: ${target.id}`, err);
    activeSockets.delete(target.id);
  }
}

async function sync() {
  const port = getDevToolsPort();
  if (!port) {
    if (activeSockets.size > 0) {
      console.log('[Daemon] Antigravity port file unavailable or closed. Clearing active targets.');
      for (const session of activeSockets.values()) {
        try { session.ws.close(); } catch {}
      }
      activeSockets.clear();
    }
    return;
  }

  const targets = await queryTargets(port);
  const currentIds = new Set(targets.map((t) => t.id));

  // 清理已经关闭的 target
  for (const [id, session] of activeSockets.entries()) {
    if (!currentIds.has(id)) {
      try { session.ws.close(); } catch {}
      activeSockets.delete(id);
    }
  }

  // 挂载新 target，或对已连接 target 进行自愈巡检
  for (const target of targets) {
    if (target.type === 'page') {
      if (!activeSockets.has(target.id)) {
        await attachTarget(target);
      } else {
        const session = activeSockets.get(target.id);
        await checkAndHeal(session, target.id);
      }
    }
  }
}

async function syncAllMetrics() {
  for (const session of activeSockets.values()) {
    await syncMetricsForSession(session);
  }
}

console.log('[Antigravity Insiders Dev Daemon] Started with active self-healing targeting Insiders.');
setInterval(sync, 2500);
setInterval(syncAllMetrics, 1200);
sync();
