# 船板的 Antigravity 主题、字体与汉化补丁 (v6.0.0)

[![Version](https://img.shields.io/badge/version-6.0.0-3D6470.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![Antigravity](https://img.shields.io/badge/Antigravity-2.34.0%2B-3F6E7A.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0%20(22.13%2B%20Full)-339933.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/Anarcadia/chuanban-antigravity-theme-patch)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向 Google Antigravity（支持最新 **`2.34.0+`**）的非侵入式运行时补丁：**v6.0.0 全新默认启用「莫兰迪古典矿物」冷暖互补配色体系**，在系统设置外观面板原生集成 **五段式主题切换器**（含 `Absolutely！` 经典暖白与零开销一键退回官方原版配色/字体）及 **`[ EN | 中文 ]` 二元语言热切换**，并提供四层中西文排版、`1,965` 条界面汉化、SQLite 实时会话遥测胶囊与「Token 统计」多维分析面板。不修改客户端 `.asar` 与系统签名，零第三方 npm 依赖，由 AI Agent 一键部署并通过 `user/` 层实现 `2.5s` 热重载定制。

> 供 AI Agent 读取的完整部署与改装技术契约位于仓库根目录 **[`SKILL.md`](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/blob/main/SKILL.md)**。

---

## 🔗 资源入口

| 入口 | 地址 | 说明 |
| :--- | :--- | :--- |
| **1. Google Drive 资源包（含字体）** | [**Google Drive 共享文件夹**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) | 含成品包与全套必备字体：`AnthropicSerif-Regular/Bold.ttf`、`AnthropicMono-Regular.ttf`、**Windows 专用精简拆分包 [`Windows-Sarasa-Split-SC-TTF-v1.0.43.zip`](https://drive.google.com/file/d/1iVVvZXtwUcDiHy42tJ25X6N-JlOf3l7A/view?usp=sharing)**（170 MB，内含 14 个独立 SC `.ttf`，彻底规避 791 MB 单体 `SuperTTC` 在 DirectWrite/Chromium 引发的加载卡顿与 >2GB 虚存占用，见 #19）以及 macOS/Linux 用 `Sarasa-SuperTTC.ttc`（macOS 亦可直接运行 `brew install --cask font-sarasa-gothic`）。 |
| **2. GitHub 代码仓库** | [**Anarcadia/chuanban-antigravity-theme-patch**](https://github.com/Anarcadia/chuanban-antigravity-theme-patch) | 包含预封装内核 `core/`、个人改装层 `user/`、生命周期 CLI `install.mjs` 与 [`SKILL.md`](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/blob/main/SKILL.md)（字体请从上方 Google Drive 获取）。 |
| **3. Notion 引导页** | [**chuanban-antigravity-theme-patch**](https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554) | 图文说明与安装引导镜像页。 |

---

## 🎨 配色与主题体系说明（v6.0.0 全新升级）

v6.0.0 在「系统设置 → 外观界面」原生嵌入了 **五段式主题胶囊 `[ A | ✳️ | MO | 📖 | 🌙 ]`**，各档位均自动联动 Windows 原生标题栏、启动幕布与 `Swarm` 蜂群协作子帧：

| 槽位 | 预设名称（配置项） | 视觉风格与色彩设计说明 |
| :---: | :--- | :--- |
| **`MO`**<br>*(默认)* | **莫兰迪色**<br>`preset: "morandi"` | **暖底冷器 · 古典矿物冷暖互补**：汲取乔治·莫兰迪静物画配色法则，以 `#F4F1EA` 暖宣纸灰主画布与 `#E8E3D9` 亚麻石膏侧栏铺底，搭配 `#A3B5BA → #3D6470` **烟岚石青**单层 `2px` 合并输入框与同色深石青发送钮，久看不倦且视觉锚点沉稳醒目（另在 `user/config.json` 提供 `claude-desktop-purewhite` 素绢浅雾与 `vintage-deep` 敦煌古壁两套扩展浅色变体）。 |
| **`✳️`** | **Absolutely！**<br>`preset: "absolutely"` | **致敬 Claude 经典书卷暖白**：`#FCFCFB` 微暖亮白画布配 `#F7F5F0` 暖燕麦侧栏，底部采用 `#DFAC98 → #A64229` 信封火漆暖橙单层粗线框与 `#D97757` 陶土暖橙发送按钮，明快锐利。 |
| **`A`** | **原版配色**<br>`preset: "native"` | **零开销一键退回官方原貌**：通过样式表硬件级瞬时旁路（`<1ms` 零重刷、常驻隔离 `@font-face` 防缺字），一键恢复 Antigravity 官方纯净配色与原生字体，同时无缝保留界面汉化、指标胶囊与「Token 统计」扩展。 |
| **`📖`** | **暖纸深色**<br>`darkPreset: "claude-warm"` | **低蓝光暖炭黑夜**：`#21201D` 暖炭纸底配 `#191815` 深炭侧栏与 `#ECE7D9` 温润象牙字色，输入框采用 `#3F5258 → #78A1AD` 矿石粉青聚焦实线。 |
| **`🌙`** | **深色**<br>`darkPreset: "onyx"` | **深海石青冷碳黑夜**：`#15191C` 深海青黛底色配 `#101417` 侧栏与 `#4C7C89` 石青主按钮，输入框采用 `#344950 → #739CA8` 青釉实线收口。 |

---

## 🖼️ 实机效果

### 1. 默认标准主界面：莫兰迪古典矿物主题（`MO`）+ 烟岚石青单线输入框 + 实时遥测悬停详情卡
> `#E8E3D9` 亚麻石膏侧栏 + `#F4F1EA` 暖宣纸灰主工作区（`Anthropic Serif` × `Sarasa Mono Slab SC` 衬线正文）+ 底部烟岚石青单层 `2px` 输入框与同行实时遥测胶囊（悬停展开流式/端到端 `tok/s`、`TTFT`、思维链与正文比例及上下文水位）。

![默认莫兰迪古典矿物主界面与遥测详情卡演示](assets/preview-morandi-workbench.png)

### 2. 外观与语言控制中心：五段式皮肤预设切换 + `[ EN | 中文 ]` 双语热切换
> 在「系统设置 → 外观界面」一键切换五套明暗预设（切至 `A` 原版配色会同步回退至官方原版字体），并通过独立「界面语言」行在英文原版（`EN` 态观察器零开销休眠）与中文汉化间毫秒级无损往返。

![外观五段式皮肤预设与中英语言切换面板](assets/preview-theme-lang-switcher.png)

### 3. `Absolutely！` 主题演示：书卷暖白高对比工作台 + 暖橙蜡封输入框 + 子 Agent 副栏汉化
> 切至 `✳️ Absolutely！` 即可启用经典高对比暖白纸感与暖橙火漆单线输入框，右侧子 Agent / 蜂群协作者、拉取请求与支线提问面板均完整汉化。

![Absolutely！主题主界面与子 Agent 汉化演示](assets/preview-absolutely-workbench.png)

### 4. 深色模式界面：暖纸深色（`📖`）/ 深海碳黑（`🌙`）与代码审阅 Diff 视图
> 支持在两套独立黑夜预设间 `0ms` 切换并自动持久化，代码行号与 Diff 增删着色均按低眩光矿物色阶调校。

![黑夜模式与代码审阅视图](assets/preview-dark-workbench.png)

---

## ✨ 核心特性（v6.0.0）

- **莫兰迪古典矿物默认视觉与五段式主题秒切**：默认采用「暖宣纸底 × 烟岚石青器」冷暖互补莫兰迪配色，消除输入框内外双层套框，合并为未聚焦浅色、聚焦 100% 实色的单层 `2px` 矿物粗线（新建对话主界面保留深色顶栏并消除中间分割线）；外观面板原生集成 `[ A 原版配色 | ✳️ Absolutely！ | MO 莫兰迪色 | 📖 暖纸深色 | 🌙 深色 ]` 五段式切换，将 `@font-face` 独立常驻隔离，切换耗时 `<1ms` 且跨平台零缺字、零侧栏滚动发白。
- **外观面板 `[ EN | 中文 ]` 一键零重刷语言切换与 `1,965` 条精准汉化**：支持在外观界面一键退回纯英文原版（`EN` 态断开 `MutationObserver` 实现常时零监听开销，同步联动实时指标胶囊、悬停卡片与 `Swarm` 子帧）或切回中文；全词表扩充至 `1,965` 条（补齐子 Agent 全视图、蜂群协作者与面板控制文案，兼容 Windows PowerShell `5.1` 零大小写碰撞），严格隔离代码块、Monaco 编辑器、终端、行内文件胶囊及自定义子 Agent 名称。
- **四层中西文排版与字重桥接**：UI 西文直连官方 `Google Sans Flex` 可变字体引擎（`wght 350–650`, `wdth 92`），中文经 `AgSarasaUI` 精确映射更纱黑体字重；对话正文与 Markdown 保持 `Anthropic Serif` + `Sarasa Mono Slab SC` 衬线（含 macOS 浅色活字润墨与 Windows `DirectWrite` 子节点字重还原）；代码、终端与 `.inline-pill[data-uri]` 行内文件芯片采用 `Anthropic Mono` 等宽。
- **SQLite `O(1)` 实时指标胶囊 + 系统设置「本地扩展 → Token 统计」分析面板**：基于 Node.js `>= 22.13` 原生 `node:sqlite`（兼容本地会话库与 Windows WSL2 异步零唤醒双轨只读读取），在分屏、`/btw` 与子 Agent 标签页各自独立展示 `tok/s`、`TTFT`、真实模型上下文上限（`256k`–`1M+`）、子 Agent 全树汇总（`+N sub`）与缓存命中率；设置弹窗原生嵌入「Token 统计」Tab（带 `.cache/token-analytics-index.json` 毫秒级持久化索引）。
- **零侵入单图标启动接力、Windows 保活自愈与 `2.5s` 热重载架构**：保持双端唯一官方原版图标，内置冷启动 `M2` 调试端口无感接力、Windows 5 分钟 `TimeTrigger` 计划任务保活与 NTFS 原子写盘防锁退避重试；`core/` 只读内核与 `user/` 个人配置层物理分离，升级永不覆盖个人修改，修改 `user/*` 保存后 `2.5s` 自动热生效。

---

## 🚀 安装、升级与日常定制

### 一、新用户首次安装
1. **环境准备**：安装 **Node.js `>= 22.0.0`**（推荐 **`>= 22.13.0`** 以启用实时指标胶囊与 Token 统计），并从 [**Google Drive 资源包**](https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC) 下载上述必备字体文件（可先放在下载目录，直接让下方 Agent 一键完成注册安装）。
2. **复制以下引导词发给你的 AI Agent（Antigravity / Claude Code / Codex / Cursor 等）**：

> **💬 复制发给 Agent（新用户一键安装）**：  
> 请帮我克隆 `https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git`（或读取我已下载解压的补丁目录），先完整阅读仓库内的 `SKILL.md`，再按以下顺序部署并处理边缘情况：  
> 1. 若本机有 `nvm` / `fnm` / `volta`，优先切换至 `Node >= 22.13.0` 执行命令；运行 `node install.mjs doctor` 检查 `fonts.allRequiredInstalled`。  
> 2. 若缺少字体（需 `Anthropic Serif`、`Anthropic Mono` 与更纱黑体）：先在我刚下载的目录中查找并用 `node install.mjs install-fonts --from <字体目录>` 一键安装（Windows 下必须用此命令写入注册表，勿仅手动复制文件）；若缺少更纱黑体，macOS 可直接执行 `brew install --cask font-sarasa-gothic`，Linux 可用 `Sarasa-SuperTTC.ttc`，**Windows 请优先从 Google Drive 共享目录下载 `Windows-Sarasa-Split-SC-TTF-v1.0.43.zip`（或从 `be5invis/Sarasa-Gothic` Releases 下载拆分版 `SarasaUiSC-TTF` + `SarasaMonoSlabSC-TTF`）解压后配合 `--retire-super-ttc` 安装**（避免 791 MB 单体 `SuperTTC` 引发首次字重加载卡顿与 >2GB 虚存占用）。
> 3. 运行 `node install.mjs install` 完成安装（默认启用 `"morandi"` 莫兰迪配色；注：macOS 默认单图标模式 `launcherInstalled: false` 属正常设计）。
> 4. 检查输出中的 `cdpStatus`：若为 `"missing_opt_in_flag"`（Antigravity `2.33.0+` 尚未挂调试端口），**如果你当前正在 Antigravity 内部对话中运行，请勿执行 `--force` 强行重启自断会话**，只需把空闲时执行的命令 `node ~/.gemini/antigravity/theme-patch/install.mjs relaunch`（Windows 为 `node "$HOME\.gemini\antigravity\theme-patch\install.mjs" relaunch`，或提示我直接手动退出重开一次 Antigravity）发给我；如果你在外部独立终端运行且客户端空闲，请直接执行 `node install.mjs relaunch`。
> 5. 在端口就绪后运行 `node install.mjs verify`，确认 `"ok": true` 且 `"hasStyle": true` 即完成验收。

### 二、老用户升级至 v6.0.0
`node install.mjs install` 会自动备份旧版 `core/` 内核、将旧版默认浅色预设平滑升级至 `"morandi"`（用户自定义的 `claude-desktop-purewhite` / `vintage-deep` 等配置完整保留）：

> **💬 复制发给 Agent（老用户无缝升级）**：  
> 请帮我拉取最新的 `https://github.com/Anarcadia/chuanban-antigravity-theme-patch.git`（或读取最新解压目录），阅读其中的 `SKILL.md` 后直接运行 `node install.mjs install` 升级至 `v6.0.0`（若我此前使用的是更早期的单文件版 `antigravity-font-daemon.mjs` 且有自定义字号/配色，请先帮我把自定义项迁移到 `~/.gemini/antigravity/theme-patch/user/`）。若安装后 `cdpStatus` 为 `"missing_opt_in_flag"` 且你正在 Antigravity 内部会话中运行，请勿直接中断当前对话，告诉我空闲时运行 `node ~/.gemini/antigravity/theme-patch/install.mjs relaunch`（或手动重开一次客户端）即可；端口已就绪则直接运行 `node install.mjs verify` 验收。

### 三、后续个性化调整与排障话术
- **🎨 切换主题预设、语言或微调字号样式**：
  > 日常切换主题与中英语言可直接在「系统设置 → 外观界面」点击 `[ A | ✳️ | MO | 📖 | 🌙 ]` 与 `[ EN | 中文 ]`；如需切换扩展浅色变体或调字号，请按 `~/.gemini/antigravity/theme-patch/SKILL.md` 规范修改 `user/config.json`（如将 `"preset"` 改为 `"claude-desktop-purewhite"` 或 `"vintage-deep"`，或将 `"--ag-chat-font-size"` 调为 `"16.5px"`）。
- **🇨🇳 自定义修改或补充汉化词条**：
  > 请在 `~/.gemini/antigravity/theme-patch/user/i18n.override.json` 中新增或覆盖词条 `"英文原词": "自定义中文"`，确认 2.5 秒内页面实时热更新生效。
- **🔍 故障定界与一键回滚**：
  > 请按 `~/.gemini/antigravity/theme-patch/SKILL.md` 依次运行 `node install.mjs doctor` 和 `node install.mjs verify --safe-mode` 排查是否为 `user/` 自定义层冲突；如需退回上一版本请运行 `node install.mjs rollback`。
  - *注：若客户端冷启动后偶发未显示 `Remote`（远程）入口，属官方 `language_server` 冷启动兜底包竞态（补丁已内置空输入态自动自愈；若启动瞬间正在输入触发了草稿保护，按 `Cmd/Ctrl + Shift + R` 刷新一次即可恢复）。*

---

## 🛡️ 开发红线、合规边界与免责声明

- **开发红线（致贡献者与 AI Agent）**：本仓库 `main` 分支的后续全部功能迭代（包括但不限于 Token 统计、UI 扩展与主题增强）**坚决不加入**任何自动发送消息/自动化操控对话流、绕过配额或模型限制、拦截或篡改网络请求与请求头、读取/导出 OAuth 凭据、屏蔽官方遥测，以及修改/破解客户端 `.asar` 或二进制签名的功能，从源头杜绝触发账号风控与安全合规风险。
- **合规边界与免责声明**：本项目为独立的非官方社区视觉、汉化与本地只读统计辅助补丁，与 Google 没有任何关联、背书或合作关系。补丁仅在本地渲染层注入样式/界面文案并以只读方式解析本地会话 SQLite，不修改客户端安装包与代码签名、不代理模型请求、不接触鉴权凭据。鉴于商业客户端软件服务条款（ToS）对运行时前端修改存在字面灰区，且官方客户端策略与调试端口机制可能随时变更，本项目按「现状（AS IS）」提供，不对其长期可用性或合规状态作任何担保；使用者需自行评估并承担相应风险，亦可随时运行 `node install.mjs uninstall` 彻底卸载并还原为官方原版状态。

---

## 🕒 版本演进（完整记录见 [`CHANGELOG.md`](CHANGELOG.md)）

- **v6.0.0（2026-11-23 · 现行版）**
  - 全新升级默认 **莫兰迪古典矿物（`MO`）** 全 UI 配色体系（暖宣纸画布 × 烟岚石青单层 `2px` 合并输入框与石青按钮），并在外观界面集成 `[ A 原版配色 | ✳️ Absolutely！ | MO 莫兰迪色 | 📖 暖纸深色 | 🌙 深色 ]` 五段式秒切（支持 `<1ms` 零开销一键退回官方原版配色与字体）。
  - 在外观界面新增独立 **`[ EN | 中文 ]` 二元语言热切换**（`EN` 态断开观察器零常驻开销，毫秒级双向还原并联动指标胶囊与 `Swarm` 子帧），补齐子 Agent 与蜂群副栏汉化至 `1,965` 条零碰撞词典。
  - 隔离 `@font-face` 常驻样式防切换缺字、移除全局 `:has()` 消除侧栏虚拟滚动发白与重算卡顿（单帧峰值 `-40%`），收敛按钮伪焦点橙框并加固 Windows NTFS 原子写盘与 `TitleBarOverlay` 五态同步。
- **v5.5.5（2026-11-22）**
  - 迁移 Windows 计划任务至独立 `TimeTrigger` 并补充 `SessionUnlock` / 健康检查减负与后台进程工作目录脱钩，闭环 5 分钟全时段静默保活（[#30](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/30)、[#32](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/32)），同时新增 MIT `LICENSE`。
  - 合入「Token 统计」`.cache/token-analytics-index.json` 毫秒级持久化索引、92% SQLite 溢出页跳过与 WSL2 异步零唤醒扫描（`v5.5.4` [#28](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/28)）。
- **v5.5.3（2026-11-21）**：新增「系统设置 → 本地扩展 → Token 统计」多维 SQLite 归因面板（[#25](https://github.com/Anarcadia/chuanban-antigravity-theme-patch/pull/25)），完成 Antigravity `2.34.0` 编排器与界面漂移适配并实现守护进程空闲零子进程短路。
- **v5.5.0（2026-11-19）**：落地单图标纯净模式与 `M1 + M2` 零侵入 CDP 自动启动接力，UI 西文直连 `Google Sans Flex` 可变字体引擎 × 更纱黑体字重桥接（配合 `v5.5.2` 拆分字体退订 SuperTTC 根治 Windows 渲染卡顿）。
- **v5.0.0（2026-11-04）**：确立「`core/` 只读预封装内核 + `user/` 永不覆盖 `2.5s` 热重载改装层 + `install.mjs` 一键生命周期 CLI」模块化架构底座。
