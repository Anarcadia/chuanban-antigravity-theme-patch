#!/usr/bin/env node
/**
 * chuanban-antigravity-theme-patch · CDP Theme & Live Metrics Daemon (core/daemon.mjs)
 *
 * 架构特性（v5.5.1）：
 * 1. 动态 Node 分级：
 *    - Node >= 22.0：完整启用昼夜双模式独立主题（暖纸浅色三预设 + 深色 onyx / claude-warm 双预设）、Google Sans Flex 原生西文引擎 × 更纱黑体 UI 精密字重桥接 + Anthropic Serif 正文、输入框三态、1860条母语级汉化、宿主独占指纹门禁、死锁与冷启动兜底包自愈及 2.33.0+ CDP Opt-in 自动接力（M2）。
 *    - Node >= 22.13：动态 `await import('node:sqlite')` 解锁底部实时会话指标胶囊（O(1) 增量尾行解析 + WSL2 双轨只读读取）；低版本优雅降级绝不崩溃。
 * 2. 模块化与热重载：
 *    - 周期性检测 `user/config.json`、`user/custom.css`、`user/i18n.override.json`、`user/custom.js` 的 mtime，
 *      用户或对方 Agent 修改 `user/` 层后 2.5 秒内自动重新构建签名并热更新至所有打开的 Antigravity 窗口。
 * 3. 双通道同进程共生：
 *    - 默认 `channel: "auto"` 同时探测 Stable 与 Insiders 调试端口（亦可通过 `--channel stable|insiders` 锁定单通道）。
 * 4. 安全模式隔离：
 *    - 支持 `--safe-mode` 启动参数，一键绕过 `user/` 改装层，仅加载 `core/` 黄金内核用于故障定界。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CORE_DIR = path.join(ROOT_DIR, 'core');
const USER_DIR = path.join(ROOT_DIR, 'user');

// ============================================================================
// 0. 动态探测 node:sqlite（Node >= 22.13 自动解锁，低版本优雅降级）
// ============================================================================
let DatabaseSync = null;
try {
  const sqliteMod = await import('node:sqlite').catch(() => null);
  if (sqliteMod && typeof sqliteMod.DatabaseSync === 'function') {
    DatabaseSync = sqliteMod.DatabaseSync;
  }
} catch {
  DatabaseSync = null;
}

// ============================================================================
// 1. CLI 参数解析（同时兼容 --flag value 与 --flag=value）与跨平台路径探测
// ============================================================================
const args = process.argv.slice(2);
const hasFlag = (f) => args.some((a) => a === f || a.startsWith(f + '='));
function getArg(flag, fallback = null) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) return args[i + 1];
    if (args[i].startsWith(flag + '=')) return args[i].slice(flag.length + 1);
  }
  return fallback;
}

const SAFE_MODE = hasFlag('--safe-mode');
const RUN_ONCE = hasFlag('--once');
const CLI_CHANNEL = getArg('--channel', null);

function readJsonSafe(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readTextSafe(filePath, fallback = '') {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function getFileMtimeSig(filePath) {
  try {
    const st = fs.statSync(filePath, { throwIfNoEntry: false });
    return st ? `${st.mtimeMs}:${st.size}` : '0:0';
  } catch {
    return '0:0';
  }
}

const wslDirsCache = new Map(); // cacheKey -> { sig, distro, dirs, probedAt }
let cachedRegWslDistros = { distros: [], probedAt: 0 };
let wslUncBackoffUntil = 0;

function resolveWslDistrosFromRegistry() {
  if (process.platform !== 'win32') return [];
  const now = Date.now();
  if (now - cachedRegWslDistros.probedAt < 60000) {
    return cachedRegWslDistros.distros;
  }
  const distros = [];
  try {
    // 仅读取 Windows 注册表 Lxss 项获取默认及已注册 WSL 发行版名，0 虚拟机唤醒开销（不调用 wsl.exe）
    const res = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss', '/s'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 1500
    });
    if (res.status === 0 && res.stdout) {
      const out = String(res.stdout);
      const defMatch = out.match(/^\s*DefaultDistribution\s+REG_SZ\s+(\{[^\r\n]+\})/im);
      const defaultGuid = defMatch ? defMatch[1].trim().toLowerCase() : '';
      const byGuid = new Map();
      const blocks = out.split(/\r?\n(?=\s*HKEY_CURRENT_USER\\)/i);
      for (const blk of blocks) {
        const hdrMatch = blk.match(/\\Lxss\\(\{[^\\\r\n]+\})\s*$/im);
        if (!hdrMatch) continue;
        const guid = hdrMatch[1].trim().toLowerCase();
        const nameMatch = blk.match(/^\s*DistributionName\s+REG_SZ\s+([^\r\n]+)/im);
        if (!nameMatch) continue;
        const name = nameMatch[1].trim();
        if (!name || /^docker-desktop/i.test(name) || !/^[A-Za-z0-9._-]+$/.test(name)) continue;
        byGuid.set(guid, name);
      }
      if (defaultGuid && byGuid.has(defaultGuid)) {
        // wsl_state.json {"distro":""} 特指连接默认发行版；仅返回默认发行版，杜绝触碰其它已停止发行版触发 P9 冷启动唤醒
        distros.push(byGuid.get(defaultGuid));
      } else {
        for (const [, name] of byGuid.entries()) {
          if (!distros.includes(name)) {
            distros.push(name);
          }
        }
      }
    }
  } catch {}
  cachedRegWslDistros = { distros, probedAt: now };
  return distros;
}

function resolveWin32WslConversationsDirs(portFile, geminiSubDir) {
  if (process.platform !== 'win32' || !portFile || !geminiSubDir) return [];
  const now = Date.now();
  if (now < wslUncBackoffUntil) return [];
  try {
    const wslStatePath = path.join(path.dirname(portFile), 'wsl_state.json');
    const fileSig = getFileMtimeSig(wslStatePath);
    const envDistro = String(process.env.ANTIGRAVITY_WSL_DISTRO || '').trim();
    const compositeSig = `${fileSig}|env:${envDistro}`;
    if (fileSig === '0:0' && !envDistro) {
      wslDirsCache.delete(wslStatePath);
      return [];
    }
    const cached = wslDirsCache.get(wslStatePath);
    if (
      cached &&
      cached.sig === compositeSig &&
      ((cached.dirs.length > 0 && now - cached.probedAt < 60000) || now - cached.probedAt < 15000)
    ) {
      return cached.dirs;
    }

    const wslState = fileSig !== '0:0' ? readJsonSafe(wslStatePath, {}) : {};
    const persistedDistro = String(wslState?.distro || wslState?.distroName || wslState?.defaultDistro || '').trim();
    const rawDistro = persistedDistro || envDistro;
    let candidateDistros = [];
    if (rawDistro) {
      if (/^[A-Za-z0-9._-]+$/.test(rawDistro)) {
        candidateDistros = [rawDistro];
      }
    } else if (fileSig !== '0:0') {
      // 默认 WSL 发行版下 Antigravity 写入 {"distro":""}，从 HKCU\...\Lxss 注册表兜底解析默认发行版
      candidateDistros = resolveWslDistrosFromRegistry();
    }
    if (candidateDistros.length === 0) {
      wslDirsCache.set(wslStatePath, { sig: compositeSig, distro: '', dirs: [], probedAt: now });
      return [];
    }

    const t0 = Date.now();
    const subParts = geminiSubDir.split('/');
    const found = [];
    outer: for (const distro of candidateDistros) {
      for (const uncHost of ['wsl.localhost', 'wsl$']) {
        const distroRoot = `\\\\${uncHost}\\${distro}`;
        if (!fs.existsSync(distroRoot)) {
          if (Date.now() - t0 > 400) break outer;
          continue;
        }
        const homeRoot = path.join(distroRoot, 'home');
        if (fs.existsSync(homeRoot)) {
          try {
            for (const userEntry of fs.readdirSync(homeRoot)) {
              const convDir = path.join(homeRoot, userEntry, ...subParts, 'conversations');
              if (fs.existsSync(convDir)) found.push(convDir);
            }
          } catch {}
        }
        const rootConvDir = path.join(distroRoot, 'root', ...subParts, 'conversations');
        if (fs.existsSync(rootConvDir)) found.push(rootConvDir);
        if (Date.now() - t0 > 400) break outer;
        // 首个发行版命中会话目录后立即终止内外层探测，杜绝继续访问其它已停止发行版触发虚拟机唤醒
        if (found.length > 0) break outer;
      }
      if (Date.now() - t0 > 400) break;
    }
    if (Date.now() - t0 > 400) {
      wslUncBackoffUntil = Date.now() + 45000;
    }
    const uniqueDirs = Array.from(new Set(found));
    wslDirsCache.set(wslStatePath, {
      sig: compositeSig,
      distro: candidateDistros.join(','),
      dirs: uniqueDirs,
      probedAt: Date.now()
    });
    return uniqueDirs;
  } catch {
    wslUncBackoffUntil = Date.now() + 45000;
    return [];
  }
}

function resolveChannelPaths(singleChannel = 'stable', userCfg = {}) {
  const home = os.homedir();
  const isInsiders = singleChannel === 'insiders';
  const appDirName = isInsiders ? 'Antigravity - Insiders' : 'Antigravity';
  const geminiSubDir = isInsiders ? '.gemini/antigravity-insiders' : '.gemini/antigravity';

  let defaultPortFile;
  if (process.platform === 'darwin') {
    defaultPortFile = path.join(home, 'Library', 'Application Support', appDirName, 'DevToolsActivePort');
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    defaultPortFile = path.join(appData, appDirName, 'DevToolsActivePort');
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    defaultPortFile = path.join(xdgConfig, appDirName, 'DevToolsActivePort');
  }

  const defaultConvDir = path.join(home, geminiSubDir, 'conversations');
  const dotDir = path.join(home, isInsiders ? '.antigravity-insiders' : '.antigravity');
  const argvPath = path.join(dotDir, 'argv.json');
  let fallbackPort = isInsiders ? 9223 : 9222;
  try {
    if (fs.existsSync(argvPath)) {
      const stripped = fs
        .readFileSync(argvPath, 'utf8')
        .replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
      const m = stripped.match(/"remote-debugging-port"\s*:\s*(\d+)/);
      if (m && parseInt(m[1], 10) > 0) fallbackPort = parseInt(m[1], 10);
    }
  } catch {}

  const portFile = getArg('--port-file', userCfg.portFile || defaultPortFile);
  const channelInstalled =
    fs.existsSync(portFile) || fs.existsSync(path.dirname(defaultPortFile)) || fs.existsSync(dotDir);
  const explicitConvDir = getArg('--conversations-dir', userCfg.conversationsDir || '');
  const primaryConvDir = explicitConvDir || defaultConvDir;

  return {
    channel: singleChannel,
    portFile,
    geminiSubDir,
    explicitConvDir: Boolean(explicitConvDir),
    fallbackPort: Number(userCfg.fallbackPort) > 0 ? Number(userCfg.fallbackPort) : fallbackPort,
    channelInstalled,
    conversationsDir: primaryConvDir
  };
}

function resolveActiveChannelEndpoints(channelMode = 'auto', userCfg = {}) {
  const explicitPortFile = getArg('--port-file', userCfg.portFile || '');
  if (explicitPortFile) {
    const ch = channelMode === 'insiders' ? 'insiders' : 'stable';
    return [resolveChannelPaths(ch, userCfg)];
  }
  if (channelMode === 'stable') {
    return [resolveChannelPaths('stable', userCfg)];
  }
  if (channelMode === 'insiders') {
    return [resolveChannelPaths('insiders', userCfg)];
  }
  // 'auto' 或 'both'：同时轮询 Stable 与 Insiders 两个通道，互不抢占
  return [resolveChannelPaths('stable', userCfg), resolveChannelPaths('insiders', userCfg)];
}

// ============================================================================
// 2. 动态构建注入载荷（支持 core/ + user/ 实时合并与热更新签名）
// ============================================================================
const BASE_VERSION = '20261119-v5.5.1';
let cachedBundleSig = '';
let cachedInjectScript = '';
let cachedPatchVersion = '';
let metricsConfigEpoch = 0;
const metricsCache = new Map(); // dbPath -> { sig, payload }
// Must be declared before the top-level rebuildBundleIfNeeded() call: it clears this cache
// when user/config.json contextLimit differs from the default, which would otherwise hit the TDZ.
const lastBestEffortPayloadCache = new Map(); // dbPath -> payload
const incrementalMetricsMap = new Map(); // dbPath -> { rowCount, maxIdx, userStepsCount, lastUserStepIdx, items, validItems, totalIn, totalCache, totalOut, totalThink, totalResp }
const MAX_METRICS_CACHE_SIZE = 30;

function setMetricsCache(dbPath, entry) {
  if (metricsCache.has(dbPath)) metricsCache.delete(dbPath);
  metricsCache.set(dbPath, entry);
  if (metricsCache.size > MAX_METRICS_CACHE_SIZE) {
    const oldestKey = metricsCache.keys().next().value;
    if (oldestKey) {
      metricsCache.delete(oldestKey);
      incrementalMetricsMap.delete(oldestKey);
    }
  }
}

function setIncrementalMetrics(dbPath, state) {
  if (incrementalMetricsMap.has(dbPath)) incrementalMetricsMap.delete(dbPath);
  incrementalMetricsMap.set(dbPath, state);
  if (incrementalMetricsMap.size > MAX_METRICS_CACHE_SIZE) {
    const oldestKey = incrementalMetricsMap.keys().next().value;
    if (oldestKey) incrementalMetricsMap.delete(oldestKey);
  }
}

let activeConfig = {
  enabled: true,
  channel: 'auto',
  preset: 'high-contrast',
  darkPreset: 'onyx',
  contextLimit: 256000,
  contextLimitOverride: 0,
  modules: {
    i18n: true,
    metrics: true,
    composerWaxSeal: true,
    deadlockHealer: true,
    coldBootHealer: true,
    zoomShortcuts: true,
    cdpAutoRelaunch: true,
    customCss: true,
    customJs: true
  },
  themeVars: {},
  darkThemeVars: {},
  allowedOrigins: [
    'http://127.0.0.1',
    'https://127.0.0.1',
    'http://localhost',
    'https://localhost',
    'vscode-file://',
    'plugin://swarm--'
  ],
  endpoints: []
};

function normalizeOverrideDict(rawObj) {
  if (!rawObj || typeof rawObj !== 'object') return {};
  const source = rawObj.exact && typeof rawObj.exact === 'object' ? rawObj.exact : rawObj;
  const clean = {};
  for (const [k, v] of Object.entries(source)) {
    if (k.startsWith('_')) continue;
    if (typeof v === 'string') {
      clean[k] = v;
    }
  }
  return clean;
}

const HOST_CONFIG_PATH = path.join(os.homedir(), '.gemini', 'config', 'config.json');
let cachedHostCfgFileSig = '';
let cachedHostThemeMode = null;

function persistDarkPresetToUserConfig(rawDarkPreset) {
  if (SAFE_MODE) return false;
  const nextDarkPreset = String(rawDarkPreset || '').trim().toLowerCase() === 'claude-warm' ? 'claude-warm' : 'onyx';
  const cfgPath = path.join(USER_DIR, 'config.json');
  const tmpPath = `${cfgPath}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(USER_DIR, { recursive: true });
    let currentObj = {};
    if (fs.existsSync(cfgPath)) {
      let parsed = null;
      try {
        const rawText = fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, '');
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        logDaemonEvent(`persistDarkPreset skipped: user/config.json unreadable (${parseErr?.message || parseErr})`);
        return false;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        logDaemonEvent('persistDarkPreset skipped: user/config.json root is not a plain object');
        return false;
      }
      currentObj = parsed;
    }
    const prevNorm =
      String(currentObj.darkPreset || 'onyx').trim().toLowerCase() === 'claude-warm' ? 'claude-warm' : 'onyx';
    if (prevNorm === nextDarkPreset && currentObj.darkPreset === nextDarkPreset) {
      return false;
    }
    const updatedObj = {};
    let inserted = false;
    for (const [k, v] of Object.entries(currentObj)) {
      if (k === 'darkPreset') {
        updatedObj.darkPreset = nextDarkPreset;
        inserted = true;
      } else {
        updatedObj[k] = v;
        if (k === 'preset' && !('darkPreset' in currentObj)) {
          updatedObj.darkPreset = nextDarkPreset;
          inserted = true;
        }
      }
    }
    if (!inserted) {
      updatedObj.darkPreset = nextDarkPreset;
    }
    fs.writeFileSync(tmpPath, `${JSON.stringify(updatedObj, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, cfgPath);
    if (rebuildBundleIfNeeded()) {
      void (async () => {
        const pageEntries = [];
        const iframeEntries = [];
        for (const [, entry] of attachedTargets.entries()) {
          if (!entry?.hostConfirmed) continue;
          if (entry.type === 'iframe') iframeEntries.push(entry);
          else pageEntries.push(entry);
        }
        for (const batch of [pageEntries, iframeEntries]) {
          await Promise.allSettled(
            batch.map(async (entry) => {
              await entry.updateNewDocScript?.();
              await entry.inject?.();
              if (entry.type === 'page') {
                await entry.syncMetricsForSession?.(true);
              }
            })
          );
        }
      })();
    }
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    logDaemonEvent(`persistDarkPreset error: ${err?.message || err}`);
    return false;
  }
}

function readHostThemeMode() {
  const fileSig = getFileMtimeSig(HOST_CONFIG_PATH);
  if (fileSig === cachedHostCfgFileSig) {
    return cachedHostThemeMode;
  }
  cachedHostCfgFileSig = fileSig;
  if (fileSig === '0:0') {
    cachedHostThemeMode = null;
    return null;
  }
  try {
    const hostCfg = readJsonSafe(HOST_CONFIG_PATH, {});
    const raw = String(hostCfg?.userSettings?.themeMode || '').toUpperCase();
    if (raw === 'THEME_MODE_DARK') cachedHostThemeMode = 'dark';
    else if (raw === 'THEME_MODE_LIGHT') cachedHostThemeMode = 'light';
    else if (raw === 'THEME_MODE_INHERIT') cachedHostThemeMode = 'inherit';
    else cachedHostThemeMode = null;
  } catch {
    cachedHostThemeMode = null;
  }
  return cachedHostThemeMode;
}

function rebuildBundleIfNeeded() {
  const coreFiles = [
    path.join(CORE_DIR, 'theme.css'),
    path.join(CORE_DIR, 'i18n.json'),
    path.join(CORE_DIR, 'runtime.js')
  ];
  const userFiles = SAFE_MODE
    ? []
    : [
        path.join(USER_DIR, 'config.json'),
        path.join(USER_DIR, 'custom.css'),
        path.join(USER_DIR, 'i18n.override.json'),
        path.join(USER_DIR, 'custom.js')
      ];

  const hostThemeMode = readHostThemeMode();
  const sig =
    [...coreFiles, ...userFiles].map(getFileMtimeSig).join('|') +
    `|hostTheme:${hostThemeMode || ''}|safe:${SAFE_MODE}|cli:${CLI_CHANNEL || ''}`;
  if (sig === cachedBundleSig && cachedInjectScript) {
    return false;
  }

  const userCfg = SAFE_MODE ? {} : readJsonSafe(path.join(USER_DIR, 'config.json'), {});
  const enabled = SAFE_MODE ? true : userCfg.enabled !== false;
  const channel = CLI_CHANNEL || userCfg.channel || 'auto';
  const preset = userCfg.preset || 'high-contrast';
  const rawDarkPreset = String(userCfg.darkPreset || 'onyx').trim().toLowerCase();
  const darkPreset =
    rawDarkPreset === 'claude-warm' ||
    rawDarkPreset === 'warm-paper-night' ||
    rawDarkPreset === 'claude-night' ||
    rawDarkPreset === '暖炭'
      ? 'claude-warm'
      : 'onyx';
  if (activeConfig && darkPreset !== activeConfig.darkPreset) {
    targetDarkPresets.clear();
  }
  const rawCtxLimit = Number(userCfg.contextLimit);
  const contextLimit = Number.isFinite(rawCtxLimit) && rawCtxLimit > 0 ? rawCtxLimit : 256000;
  const rawCtxOverride = Number(userCfg.contextLimitOverride);
  const contextLimitOverride = Number.isFinite(rawCtxOverride) && rawCtxOverride > 0 ? rawCtxOverride : 0;
  if (
    activeConfig &&
    (contextLimit !== activeConfig.contextLimit || contextLimitOverride !== activeConfig.contextLimitOverride)
  ) {
    metricsCache.clear();
    lastBestEffortPayloadCache.clear();
    metricsConfigEpoch += 1;
  }

  const rawModules = Object.assign({}, userCfg.features || {}, userCfg.modules || {});
  if (typeof rawModules.metricsCapsule === 'boolean' && typeof rawModules.metrics !== 'boolean') {
    rawModules.metrics = rawModules.metricsCapsule;
  }
  const modules = Object.assign(
    {
      i18n: true,
      metrics: true,
      composerWaxSeal: true,
      deadlockHealer: true,
      coldBootHealer: true,
      zoomShortcuts: true,
      cdpAutoRelaunch: true,
      customCss: true,
      customJs: true
    },
    rawModules
  );
  if (!DatabaseSync) {
    modules.metrics = false;
  }
  modules.metricsCapsule = modules.metrics;

  const themeVars = !SAFE_MODE && userCfg.themeVars && typeof userCfg.themeVars === 'object' ? userCfg.themeVars : {};
  const darkThemeVars =
    !SAFE_MODE && userCfg.darkThemeVars && typeof userCfg.darkThemeVars === 'object' ? userCfg.darkThemeVars : {};
  const endpoints = resolveActiveChannelEndpoints(channel, userCfg);

  const normalizedSelectors = Object.assign({}, userCfg.selectors || {});
  if (
    normalizedSelectors.branchPillInBox &&
    !String(normalizedSelectors.branchPillInBox).includes('project-branch-picker')
  ) {
    delete normalizedSelectors.branchPillInBox;
  }
  if (normalizedSelectors.homeGreeting && !String(normalizedSelectors.homeGreeting).includes('home-splash-content')) {
    delete normalizedSelectors.homeGreeting;
  }
  if (
    typeof normalizedSelectors.excludeI18n === 'string' &&
    normalizedSelectors.excludeI18n.trim() &&
    !normalizedSelectors.excludeI18n.includes('.monaco-editor')
  ) {
    normalizedSelectors.excludeI18n +=
      ', .monaco-editor, .monaco-diff-editor, .xterm, [data-markdown-root], [data-testid="user-message-content"], .agy-user-bubble, [class*="onyx-key"]';
  }
  if (
    typeof normalizedSelectors.excludeI18n === 'string' &&
    normalizedSelectors.excludeI18n.trim() &&
    !normalizedSelectors.excludeI18n.includes('conversation-row-history')
  ) {
    normalizedSelectors.excludeI18n +=
      ', [data-testid="conversation-row-history"] a[href^="/c/"], [data-testid="conversation-row-history"] span.truncate';
  }
  if (
    typeof normalizedSelectors.excludeI18n === 'string' &&
    normalizedSelectors.excludeI18n.trim() &&
    !normalizedSelectors.excludeI18n.includes('ag-live-metrics-pill')
  ) {
    normalizedSelectors.excludeI18n += ', .ag-live-metrics-pill, [data-ag-metrics-pill]';
  }

  const DEFAULT_ALLOWED_ORIGINS = [
    'http://127.0.0.1',
    'https://127.0.0.1',
    'http://localhost',
    'https://localhost',
    'vscode-file://',
    'plugin://swarm--'
  ];

  activeConfig = {
    enabled,
    channel,
    preset,
    darkPreset,
    contextLimit,
    contextLimitOverride,
    modules,
    themeVars,
    darkThemeVars,
    selectors: normalizedSelectors,
    allowedOrigins: Array.isArray(userCfg.allowedOrigins)
      ? Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...userCfg.allowedOrigins]))
      : DEFAULT_ALLOWED_ORIGINS,
    endpoints
  };

  const baseCss = readTextSafe(path.join(CORE_DIR, 'theme.css'), '');
  const customCss = !SAFE_MODE && modules.customCss ? readTextSafe(path.join(USER_DIR, 'custom.css'), '') : '';

  const baseDict = readJsonSafe(path.join(CORE_DIR, 'i18n.json'), {});
  const rawOverrideDict = !SAFE_MODE ? readJsonSafe(path.join(USER_DIR, 'i18n.override.json'), {}) : {};
  const overrideDict = normalizeOverrideDict(rawOverrideDict);
  const mergedDict = Object.assign({}, baseDict, overrideDict);

  const customJs = !SAFE_MODE && modules.customJs ? readTextSafe(path.join(USER_DIR, 'custom.js'), '') : '';
  const runtimeTemplate = readTextSafe(path.join(CORE_DIR, 'runtime.js'), '');

  const hash = crypto
    .createHash('sha256')
    .update(String(enabled))
    .update(runtimeTemplate)
    .update(baseCss)
    .update(customCss)
    .update(JSON.stringify(mergedDict))
    .update(customJs)
    .update(
      JSON.stringify({
        preset,
        darkPreset,
        modules,
        themeVars,
        darkThemeVars,
        selectors: activeConfig.selectors,
        hostThemeMode
      })
    )
    .digest('hex')
    .slice(0, 8);

  const channelTag = channel === 'insiders' ? 'insiders' : 'stable';
  cachedPatchVersion = `${BASE_VERSION}-${channelTag}-${hash}`;

  const bootPayload = {
    version: cachedPatchVersion,
    platform: process.platform,
    hostThemeMode,
    enabled,
    preset,
    darkPreset,
    cssText: baseCss,
    customCss,
    themeVars,
    darkThemeVars,
    i18nDict: mergedDict,
    modules,
    selectors: activeConfig.selectors,
    config: {
      enabled,
      channel,
      preset,
      darkPreset,
      contextLimit,
      contextLimitOverride,
      modules,
      themeVars,
      darkThemeVars
    },
    customJs
  };

  cachedInjectScript = runtimeTemplate.replace('})(__AG_BOOT_PAYLOAD__);', () => `})(${JSON.stringify(bootPayload)});`);
  cachedBundleSig = sig;
  return true;
}

// ============================================================================
// 3. 单实例 PID 锁与协作式所有权围栏（防跨周期陈旧锁自杀、防跨完整性双实例并存）
// ============================================================================
const attachedTargets = new Map();
const targetThemeModes = new Map();
const targetDarkPresets = new Map();
const targetMetaMap = new Map();

rebuildBundleIfNeeded();

const MY_PROC_START_MS = Math.round(Date.now() - process.uptime() * 1000);
const DAEMON_LOG_FILE = path.join(os.tmpdir(), 'ag-theme-daemon.log');

function logDaemonEvent(msg) {
  try {
    const line = `[${new Date().toISOString()}] [PID ${process.pid}] ${msg}\n`;
    if (fs.existsSync(DAEMON_LOG_FILE)) {
      const st = fs.statSync(DAEMON_LOG_FILE);
      if (st.size > 131072) {
        const buf = fs.readFileSync(DAEMON_LOG_FILE);
        const tail = buf.subarray(Math.max(0, buf.length - 32768));
        fs.writeFileSync(DAEMON_LOG_FILE, Buffer.concat([tail, Buffer.from(line, 'utf8')]));
        return;
      }
    }
    fs.appendFileSync(DAEMON_LOG_FILE, line, 'utf8');
  } catch {}
}

function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {}
}

function parsePidFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { pid: 0, startMs: 0, stopRequested: false };
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return { pid: 0, startMs: 0, stopRequested: false };
    const lines = raw.split(/\r?\n/);
    const pid = parseInt(lines[0], 10) || 0;
    const second = (lines[1] || '').trim();
    if (second === 'STOP') return { pid, startMs: 0, stopRequested: true };
    let startMs = parseInt(second, 10) || 0;
    if (!startMs && pid > 0) {
      try {
        startMs = Math.round(fs.statSync(filePath).mtimeMs);
      } catch {}
    }
    return { pid, startMs, stopRequested: false };
  } catch {
    return { pid: 0, startMs: 0, stopRequested: false };
  }
}

function checkDaemonPidState(pid, recordedStartMs = 0) {
  if (!pid || pid <= 0 || pid === process.pid) return 'not_daemon';
  let kill0Eperm = false;
  try {
    process.kill(pid, 0);
  } catch (err) {
    if (err && err.code === 'EPERM') {
      kill0Eperm = true;
    } else {
      return 'not_daemon';
    }
  }
  if (process.platform === 'win32') {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = spawnSync('tasklist', ['/FI', `PID eq ${Number(pid)}`, '/FO', 'CSV', '/NH'], {
          windowsHide: true,
          encoding: 'utf8',
          timeout: 4000
        });
        if (res.status === 0) {
          const out = String(res.stdout || '').toLowerCase();
          if (!out.includes('node.exe')) return 'not_daemon';
        }
        const psCmd = [
          `$gp = Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue`,
          `if (-not $gp) { [Console]::Out.WriteLine('STATE=GONE'); exit 0 }`,
          `if ($gp.ProcessName -ne 'node') { [Console]::Out.WriteLine('STATE=NOT_NODE'); exit 0 }`,
          `$ms = try { ([DateTimeOffset]$gp.StartTime).ToUnixTimeMilliseconds() } catch { 0 }`,
          `[Console]::Out.WriteLine("STARTMS=$ms"); [Console]::Out.Flush()`,
          `$cmd = try { (Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}" -ErrorAction SilentlyContinue).CommandLine } catch { '' }`,
          `[Console]::Out.WriteLine("CMD=$cmd")`
        ].join('; ');
        const cimRes = spawnSync(
          'powershell',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCmd],
          {
            windowsHide: true,
            encoding: 'utf8',
            timeout: 6000
          }
        );
        const rawOut = String(cimRes.stdout || '');
        if (rawOut.includes('STATE=GONE') || rawOut.includes('STATE=NOT_NODE')) {
          return 'not_daemon';
        }
        const msMatch = rawOut.match(/STARTMS=(\d+)/);
        const procStartMs = msMatch ? parseInt(msMatch[1], 10) || 0 : 0;
        const cmdMatch = rawOut.match(/CMD=([^\r\n]*)/);
        if (cmdMatch) {
          const cmdLine = cmdMatch[1].trim().toLowerCase();
          if (cmdLine) {
            if (cmdLine.includes('daemon.mjs') || cmdLine.includes('antigravity-font-daemon')) {
              return 'confirmed';
            }
            return 'not_daemon';
          }
        }
        // cmdLine 为空（如中完整性探测高完整性 node.exe 或登录风暴期 WMI 超时）：用 Win32 GetProcessTimes 内核创建时间精准比对
        if (procStartMs > 0 && recordedStartMs > 0) {
          return Math.abs(procStartMs - recordedStartMs) <= 5000 ? 'confirmed' : 'not_daemon';
        }
        if (cimRes.status === 0) {
          try {
            process.kill(pid, 0);
            return 'uncertain';
          } catch (e) {
            return e && e.code === 'EPERM' ? 'uncertain' : 'not_daemon';
          }
        }
      } catch {}
    }
    return 'uncertain';
  }
  if (kill0Eperm) return 'not_daemon';
  return 'confirmed';
}

const pidKey = CLI_CHANNEL || 'default';
const PID_FILE = path.join(os.tmpdir(), `ag-theme-daemon-${pidKey}.pid`);
const MY_PID_PAYLOAD = `${process.pid}\n${MY_PROC_START_MS}`;
let daemonExiting = false;
let pidHealTimer = null;
let pidWatcher = null;

function requestCooperativeStop(targetPid, waitMs = 800) {
  try {
    fs.writeFileSync(PID_FILE, `${targetPid}\nSTOP`, 'utf8');
    const steps = Math.max(1, Math.ceil(waitMs / 50));
    for (let i = 0; i < steps; i++) {
      sleepSync(50);
      if (!fs.existsSync(PID_FILE)) return true;
      if (targetPid > 0) {
        try {
          process.kill(targetPid, 0);
        } catch (err) {
          if (!err || err.code !== 'EPERM') return true;
        }
      }
    }
  } catch {}
  return false;
}

function shutdownDaemon(reason, unlinkStopFile = false) {
  if (daemonExiting) return;
  daemonExiting = true;
  if (pidHealTimer) {
    clearTimeout(pidHealTimer);
    pidHealTimer = null;
  }
  if (pidWatcher) {
    try {
      pidWatcher.close();
    } catch {}
    pidWatcher = null;
  }
  if (unlinkStopFile) {
    try {
      const cur = parsePidFile(PID_FILE);
      if (cur.stopRequested && (cur.pid === 0 || cur.pid === process.pid)) {
        fs.unlinkSync(PID_FILE);
      }
    } catch {}
  }
  logDaemonEvent(reason);
  for (const [, entry] of attachedTargets.entries()) {
    try {
      entry.ws.close();
    } catch {}
  }
  attachedTargets.clear();
  targetThemeModes.clear();
  targetDarkPresets.clear();
  targetMetaMap.clear();
  process.exit(0);
}

function armPidWatcher() {
  if (RUN_ONCE || daemonExiting || pidWatcher) return;
  try {
    if (!fs.existsSync(PID_FILE)) return;
    pidWatcher = fs.watch(PID_FILE, { persistent: false }, () => {
      checkPidFileOwnership();
    });
    pidWatcher.on('error', () => {
      try {
        pidWatcher?.close();
      } catch {}
      pidWatcher = null;
    });
  } catch {
    pidWatcher = null;
  }
}

function checkPidFileOwnership() {
  if (RUN_ONCE || daemonExiting) return;
  try {
    if (!fs.existsSync(PID_FILE)) {
      if (pidWatcher) {
        try {
          pidWatcher.close();
        } catch {}
        pidWatcher = null;
      }
      if (!pidHealTimer) {
        pidHealTimer = setTimeout(() => {
          pidHealTimer = null;
          if (daemonExiting) return;
          try {
            if (!fs.existsSync(PID_FILE)) {
              fs.writeFileSync(PID_FILE, MY_PID_PAYLOAD, 'utf8');
              armPidWatcher();
            } else {
              checkPidFileOwnership();
            }
          } catch {}
        }, 80);
        pidHealTimer.unref?.();
      }
      return;
    }
    const cur = parsePidFile(PID_FILE);
    if (cur.stopRequested && (cur.pid === 0 || cur.pid === process.pid)) {
      shutdownDaemon('Received cooperative STOP signal via PID file; exiting cleanly.', true);
      return;
    }
    if (!cur.stopRequested && cur.pid > 0 && cur.pid !== process.pid) {
      let otherAlive = false;
      try {
        process.kill(cur.pid, 0);
        otherAlive = true;
      } catch (err) {
        if (err && err.code === 'EPERM') otherAlive = true;
      }
      if (otherAlive) {
        shutdownDaemon(`PID lock superseded by newer daemon PID ${cur.pid}; yielding cleanly.`, false);
        return;
      }
      fs.writeFileSync(PID_FILE, MY_PID_PAYLOAD, 'utf8');
      armPidWatcher();
    }
  } catch {}
}

if (!RUN_ONCE) {
  try {
    if (fs.existsSync(PID_FILE)) {
      const { pid: oldPid, startMs: oldStartMs, stopRequested } = parsePidFile(PID_FILE);
      if (!stopRequested && oldPid > 0 && oldPid !== process.pid) {
        const pidState = checkDaemonPidState(oldPid, oldStartMs);
        if (pidState === 'confirmed') {
          let killed = false;
          try {
            process.kill(oldPid, 'SIGTERM');
            for (let i = 0; i < 8; i++) {
              sleepSync(50);
              try {
                process.kill(oldPid, 0);
              } catch (e) {
                if (!e || e.code !== 'EPERM') {
                  killed = true;
                  break;
                }
              }
            }
          } catch {}
          if (!killed) {
            requestCooperativeStop(oldPid, 1200);
          }
          logDaemonEvent(`Replaced existing daemon PID ${oldPid}.`);
        } else if (pidState === 'uncertain') {
          requestCooperativeStop(oldPid, 350);
          logDaemonEvent(`PID state uncertain for PID ${oldPid}; taking over lock instead of exiting.`);
        }
      }
    }
    fs.writeFileSync(PID_FILE, MY_PID_PAYLOAD, 'utf8');
    armPidWatcher();
    const cleanPid = () => {
      if (pidWatcher) {
        try {
          pidWatcher.close();
        } catch {}
        pidWatcher = null;
      }
      try {
        const cur = parsePidFile(PID_FILE);
        if (cur.pid === process.pid && !cur.stopRequested) {
          fs.unlinkSync(PID_FILE);
        }
      } catch {}
    };
    process.on('exit', cleanPid);
    process.on('SIGINT', () => {
      cleanPid();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanPid();
      process.exit(0);
    });
  } catch (err) {
    logDaemonEvent(`PID lock init warning: ${err?.message || err}`);
  }
}

// ============================================================================
// 4. SQLite + Protobuf 实时会话指标解析器（读取 ~/.gemini/antigravity/conversations/<id>.db）
// ============================================================================

function parseProto(buf) {
  let i = 0;
  const out = new Map();
  while (i < buf.length) {
    let tag = 0;
    let shift = 0;
    while (i < buf.length) {
      const b = buf[i++];
      tag |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    const fn = tag >>> 3;
    const wt = tag & 7;
    if (fn <= 0 || fn > 10000) break;
    if (wt === 0) {
      let val = 0;
      let s = 0;
      while (i < buf.length) {
        const b = buf[i++];
        val += (b & 0x7f) * Math.pow(2, s);
        if (!(b & 0x80)) break;
        s += 7;
      }
      out.set(fn, val);
    } else if (wt === 2) {
      let len = 0;
      let s = 0;
      while (i < buf.length) {
        const b = buf[i++];
        len |= (b & 0x7f) << s;
        if (!(b & 0x80)) break;
        s += 7;
      }
      if (len < 0 || i + len > buf.length) break;
      out.set(fn, buf.subarray(i, i + len));
      i += len;
    } else if (wt === 1) {
      if (i + 8 > buf.length) break;
      out.set(fn, buf.subarray(i, i + 8));
      i += 8;
    } else if (wt === 5) {
      if (i + 4 > buf.length) break;
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

const resolvedCascadeDbCache = new Map();
const negativeCascadeWslCache = new Map(); // cacheKey -> expireAtMs
const lastKnownDbStateCache = new Map(); // dbPath -> { dbPath, rawSig, sig }
const UUID_RE = /^[0-9a-f-]{36}$/i;
const DB_FILE_RE = /^([0-9a-f-]{36})\.db$/i;
const textDecoder = new TextDecoder('utf-8', { fatal: false });
const MAX_CHILD_METRICS_CACHE_SIZE = 4096;
const MAX_NO_META_PENDING_IDS = 64;
const LINEAGE_TICK_MAX_OPENS = 45;
const LINEAGE_TICK_MAX_OPENS_UNC = 8;
const LINEAGE_TICK_MAX_MS = 60;
const NO_META_RESCAN_LOCAL_MS = 2500;
const NO_META_RESCAN_UNC_MS = 15000;
const childMetricsCache = new Map(); // dbPath -> { sig, hasData, calls, totalIn, totalCache, totalOut, totalThink, totalResp }
const lineageStateByDir = new Map(); // conversationsDir -> dirState
let zhTitleStatus = { state: 'ok', label: '', detail: '', cmd: '' };

function escapeHtmlSafe(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setZhTitleStatus(nextState, label = '', detail = '', cmd = '') {
  if (
    zhTitleStatus.state === nextState &&
    zhTitleStatus.label === label &&
    zhTitleStatus.detail === detail &&
    zhTitleStatus.cmd === cmd
  ) {
    return;
  }
  zhTitleStatus = { state: nextState, label, detail, cmd };
  metricsCache.clear();
  lastBestEffortPayloadCache.clear();
  metricsConfigEpoch += 1;
}

function setChildMetricsCache(dbPath, entry) {
  if (childMetricsCache.has(dbPath)) childMetricsCache.delete(dbPath);
  childMetricsCache.set(dbPath, entry);
  if (childMetricsCache.size > MAX_CHILD_METRICS_CACHE_SIZE) {
    const oldestKey = childMetricsCache.keys().next().value;
    if (oldestKey !== undefined) childMetricsCache.delete(oldestKey);
  }
}

function isUncPath(p) {
  if (!p || process.platform !== 'win32') return false;
  return (
    p.startsWith('\\\\wsl.localhost\\') ||
    p.startsWith('\\\\wsl$\\') ||
    p.startsWith('\\\\?\\UNC\\') ||
    p.startsWith('\\\\') ||
    p.startsWith('//wsl')
  );
}

function setBoundedMap(map, key, val, maxEntries = 64) {
  if (map.has(key)) map.delete(key);
  map.set(key, val);
  if (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
}

function readUtf8(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (val instanceof Uint8Array) return textDecoder.decode(val);
  return '';
}

function getDbStatByPath(dbPath) {
  try {
    const st = fs.statSync(dbPath, { throwIfNoEntry: false });
    if (!st) return null;
    const wst = fs.statSync(`${dbPath}-wal`, { throwIfNoEntry: false });
    const walSig = wst ? `${wst.mtimeMs}:${wst.size}` : '0:0';
    return {
      dbPath,
      mtimeMs: Math.max(st.mtimeMs || 0, wst ? wst.mtimeMs || 0 : 0),
      sig: `${st.mtimeMs}:${st.size}|${walSig}`
    };
  } catch {
    return null;
  }
}

function resolveConversationDbPath(cascadeId, endpointOrDir) {
  if (!cascadeId || !endpointOrDir) return '';
  if (Array.isArray(endpointOrDir)) {
    const dirs = endpointOrDir.filter(Boolean);
    for (let i = 0; i < dirs.length; i++) {
      const candidate = path.join(dirs[i], `${cascadeId}.db`);
      if (fs.existsSync(candidate)) return candidate;
    }
    return dirs.length > 0 ? path.join(dirs[0], `${cascadeId}.db`) : '';
  }
  if (typeof endpointOrDir === 'string') {
    return path.join(endpointOrDir, `${cascadeId}.db`);
  }

  const primaryDir = endpointOrDir.conversationsDir || '';
  const cacheKey = `${endpointOrDir.channel || 'default'}|${primaryDir}|${cascadeId}`;
  const cachedPath = resolvedCascadeDbCache.get(cacheKey);
  if (cachedPath) {
    const cachedUnc = isUncPath(cachedPath);
    if (cachedUnc && Date.now() < wslUncBackoffUntil) {
      return cachedPath;
    }
    const tCheck = Date.now();
    const exists = fs.existsSync(cachedPath);
    if (cachedUnc && Date.now() - tCheck > 400) {
      wslUncBackoffUntil = Date.now() + 45000;
    }
    if (exists) {
      return cachedPath;
    }
    resolvedCascadeDbCache.delete(cacheKey);
  }

  const remember = (foundPath) => {
    negativeCascadeWslCache.delete(cacheKey);
    if (resolvedCascadeDbCache.size >= 64) {
      const oldestKey = resolvedCascadeDbCache.keys().next().value;
      if (oldestKey !== undefined) resolvedCascadeDbCache.delete(oldestKey);
    }
    resolvedCascadeDbCache.set(cacheKey, foundPath);
    return foundPath;
  };

  if (primaryDir) {
    const primaryCandidate = path.join(primaryDir, `${cascadeId}.db`);
    if (fs.existsSync(primaryCandidate)) {
      return remember(primaryCandidate);
    }
  }

  const now = Date.now();
  if (
    process.platform === 'win32' &&
    !endpointOrDir.explicitConvDir &&
    endpointOrDir.portFile &&
    now >= wslUncBackoffUntil &&
    (negativeCascadeWslCache.get(cacheKey) || 0) <= now
  ) {
    const t0 = Date.now();
    const wslDirs = resolveWin32WslConversationsDirs(
      endpointOrDir.portFile,
      endpointOrDir.geminiSubDir || '.gemini/antigravity'
    );
    for (let i = 0; i < wslDirs.length; i++) {
      const wslCandidate = path.join(wslDirs[i], `${cascadeId}.db`);
      if (fs.existsSync(wslCandidate)) {
        return remember(wslCandidate);
      }
      if (Date.now() - t0 > 400) break;
    }
    if (Date.now() - t0 > 400) {
      wslUncBackoffUntil = Date.now() + 45000;
    }
    if (negativeCascadeWslCache.size >= 128) {
      negativeCascadeWslCache.clear();
    }
    negativeCascadeWslCache.set(cacheKey, Date.now() + 10000);
  }

  return primaryDir ? path.join(primaryDir, `${cascadeId}.db`) : '';
}

function getDbState(cascadeId, endpointOrDir) {
  try {
    const dbPath = resolveConversationDbPath(cascadeId, endpointOrDir);
    if (!dbPath) return null;
    const unc = isUncPath(dbPath);
    if (unc && Date.now() < wslUncBackoffUntil) {
      const prev = lastKnownDbStateCache.get(dbPath);
      return prev ? { ...prev, uncDeferred: true } : { dbPath, rawSig: 'unc_deferred', sig: `${dbPath}#unc_deferred`, uncDeferred: true };
    }
    const t0 = Date.now();
    const st = fs.statSync(dbPath, { throwIfNoEntry: false });
    if (unc && Date.now() - t0 > 400) {
      wslUncBackoffUntil = Date.now() + 45000;
    }
    if (!st) {
      lastKnownDbStateCache.delete(dbPath);
      return null;
    }
    let wst = null;
    if (!unc || Date.now() >= wslUncBackoffUntil) {
      wst = fs.statSync(`${dbPath}-wal`, { throwIfNoEntry: false });
      if (unc && Date.now() - t0 > 400) {
        wslUncBackoffUntil = Date.now() + 45000;
      }
    }
    const walSig = wst ? `${wst.mtimeMs}:${wst.size}` : '0:0';
    const rawSig = `${st.mtimeMs}:${st.size}|${walSig}`;
    const stateObj = {
      dbPath,
      rawSig,
      sig: `${dbPath}#${rawSig}`
    };
    setBoundedMap(lastKnownDbStateCache, dbPath, stateObj, 64);
    return stateObj;
  } catch {
    return null;
  }
}

function getDbSignature(cascadeId, endpointOrDir) {
  return getDbState(cascadeId, endpointOrDir)?.sig || null;
}

let wslSqliteTmpSeq = 0;
let sqliteUriSupported = null;

function canUseSqliteFileUri() {
  if (sqliteUriSupported !== null) return sqliteUriSupported;
  if (!DatabaseSync) return false;
  let probeDb = null;
  try {
    // Node >= 22.15 / 24 启用 SQLITE_OPEN_URI 时 file::memory: 零磁盘 I/O 秒开；Node 22.13~22.14 未启用时立即失败且 readOnly 绝不落盘建文件
    probeDb = new DatabaseSync('file::memory:', { readOnly: true });
    sqliteUriSupported = true;
  } catch {
    sqliteUriSupported = false;
  } finally {
    try {
      probeDb?.close();
    } catch {}
  }
  return sqliteUriSupported;
}

function buildSqliteImmutableUncUri(uncDbPath) {
  let normalized = String(uncDbPath || '').replace(/\\/g, '/');
  if (normalized.startsWith('//?/UNC/')) {
    normalized = '//' + normalized.slice(8);
  }
  const encoded = normalized
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `file://${encoded}?immutable=1`;
}

function withReadOnlyDb(dbPath, timeoutMs, fn) {
  if (!isUncPath(dbPath)) {
    const db = new DatabaseSync(dbPath, { readOnly: true, timeout: timeoutMs });
    try {
      return fn(db);
    } finally {
      try {
        db.close();
      } catch {}
    }
  }

  const walPath = `${dbPath}-wal`;
  let hasActiveWal = false;
  try {
    const wst = fs.statSync(walPath, { throwIfNoEntry: false });
    hasActiveWal = Boolean(wst && wst.size > 0);
  } catch {}

  if (!hasActiveWal && canUseSqliteFileUri()) {
    let immDb = null;
    try {
      immDb = new DatabaseSync(buildSqliteImmutableUncUri(dbPath), { readOnly: true, timeout: timeoutMs });
      const out = fn(immDb);
      immDb.close();
      immDb = null;
      return out;
    } catch (immErr) {
      try {
        immDb?.close();
      } catch {}
      const msg = String(immErr?.message || '');
      if (/no such table/i.test(msg)) {
        throw immErr;
      }
    }
  }

  wslSqliteTmpSeq = (wslSqliteTmpSeq + 1) % 1000000;
  const tmpBase = path.join(
    os.tmpdir(),
    `ag-wsl-sqlite-${process.pid}-${Date.now()}-${wslSqliteTmpSeq}.db`
  );
  let tmpDb = null;
  try {
    fs.copyFileSync(dbPath, tmpBase);
    if (hasActiveWal) {
      try {
        fs.copyFileSync(walPath, `${tmpBase}-wal`);
      } catch {}
    }
    tmpDb = new DatabaseSync(tmpBase, { readOnly: true, timeout: timeoutMs });
    return fn(tmpDb);
  } finally {
    try {
      tmpDb?.close();
    } catch {}
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.rmSync(`${tmpBase}${suffix}`, { force: true });
      } catch {}
    }
  }
}

function readTrajectoryLineage(dbPath) {
  try {
    return withReadOnlyDb(dbPath, 20, (db) => {
      const row = db.prepare('SELECT data FROM trajectory_metadata_blob LIMIT 1').get();
      if (!row || !row.data) {
        return { ok: true, hasMeta: false, parentId: '', rootId: '' };
      }
      const meta = parseProto(row.data);
      const parentId = readUtf8(meta.get(5)).trim();
      const rootId = readUtf8(meta.get(6)).trim();
      return { ok: true, hasMeta: true, parentId, rootId };
    });
  } catch (err) {
    const msg = String(err?.message || '');
    if (/no such table/i.test(msg)) {
      return { ok: true, hasMeta: false, parentId: '', rootId: '' };
    }
    if (isUncPath(dbPath) && /locked|busy|malformed|disk i\/o|ebusy|eacces|enoent/i.test(msg)) {
      return { ok: false, error: err };
    }
    if (!/locked|busy/i.test(msg)) {
      return { ok: true, hasMeta: false, permanentInvalid: true, parentId: '', rootId: '' };
    }
    return { ok: false, error: err };
  }
}

function addAdjacencyEdge(map, key, childId) {
  if (!key || !childId || key === childId) return;
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(childId);
}

function removeAdjacencyEdge(map, key, childId) {
  if (!key) return;
  const set = map.get(key);
  if (!set) return;
  set.delete(childId);
  if (set.size === 0) map.delete(key);
}

function setNodeLineage(dirState, uuid, node) {
  const prev = dirState.nodes.get(uuid);
  if (prev) {
    if (prev.parentId && prev.parentId !== node.parentId) {
      removeAdjacencyEdge(dirState.byParent, prev.parentId, uuid);
    }
    if (prev.rootId && prev.rootId !== node.rootId) {
      removeAdjacencyEdge(dirState.byRoot, prev.rootId, uuid);
    }
  }
  dirState.nodes.set(uuid, node);
  if (node.parentId) addAdjacencyEdge(dirState.byParent, node.parentId, uuid);
  if (node.rootId) addAdjacencyEdge(dirState.byRoot, node.rootId, uuid);
}

function deleteNodeLineage(dirState, uuid) {
  const prev = dirState.nodes.get(uuid);
  if (prev) {
    removeAdjacencyEdge(dirState.byParent, prev.parentId, uuid);
    removeAdjacencyEdge(dirState.byRoot, prev.rootId, uuid);
    dirState.nodes.delete(uuid);
  }
  dirState.noMetaPending.delete(uuid);
}

function rememberNoMetaPending(dirState, uuid, statSig) {
  if (dirState.noMetaPending.has(uuid)) dirState.noMetaPending.delete(uuid);
  dirState.noMetaPending.set(uuid, statSig);
  while (dirState.noMetaPending.size > MAX_NO_META_PENDING_IDS) {
    const oldest = dirState.noMetaPending.keys().next().value;
    if (oldest === undefined) break;
    dirState.noMetaPending.delete(oldest);
  }
}

function refreshLineageIndex(conversationsDir) {
  if (!conversationsDir || !DatabaseSync) {
    return { dirState: null, isDraining: false, backoffSkipped: false };
  }
  let dirState = lineageStateByDir.get(conversationsDir);
  if (!dirState) {
    dirState = {
      dirMtimeMs: -1,
      scanningDirMtimeMs: -1,
      lastPendingScanAt: 0,
      unindexedQueue: [],
      unindexedSet: new Set(),
      noMetaPending: new Map(),
      nodes: new Map(),
      byParent: new Map(),
      byRoot: new Map()
    };
    lineageStateByDir.set(conversationsDir, dirState);
  }

  const unc = isUncPath(conversationsDir);
  const nowMs = Date.now();
  if (unc && nowMs < wslUncBackoffUntil) {
    return {
      dirState,
      isDraining: dirState.unindexedQueue.length > 0,
      backoffSkipped: true
    };
  }

  const dirSt = fs.statSync(conversationsDir, { throwIfNoEntry: false });
  if (!dirSt || !dirSt.isDirectory()) {
    return { dirState, isDraining: false, backoffSkipped: false };
  }

  const dirChanged = dirSt.mtimeMs !== dirState.dirMtimeMs && dirSt.mtimeMs !== dirState.scanningDirMtimeMs;
  const tWallStart = nowMs;
  let backoffSkipped = false;

  if (dirChanged) {
    let entries;
    try {
      entries = fs.readdirSync(conversationsDir);
    } catch {
      if (unc && Date.now() - tWallStart > 400) {
        wslUncBackoffUntil = Date.now() + 45000;
        backoffSkipped = true;
      }
      return { dirState, isDraining: dirState.unindexedQueue.length > 0, backoffSkipped };
    }

    const seenIds = new Set();
    let enqueued = false;
    for (let i = 0; i < entries.length; i++) {
      if (unc && Date.now() - tWallStart > 400) {
        wslUncBackoffUntil = Date.now() + 45000;
        backoffSkipped = true;
        break;
      }
      const m = entries[i].match(DB_FILE_RE);
      if (!m) continue;
      const uuid = m[1];
      seenIds.add(uuid);
      const existingNode = dirState.nodes.get(uuid);
      if (existingNode?.hasMeta === true) continue;
      if (dirState.unindexedSet.has(uuid)) continue;

      const dbPath = path.join(conversationsDir, entries[i]);
      const statInfo = getDbStatByPath(dbPath);
      if (!statInfo) continue;

      if (existingNode && existingNode.statSig === statInfo.sig) continue;
      if (dirState.noMetaPending.has(uuid) && dirState.noMetaPending.get(uuid) === statInfo.sig) {
        continue;
      }
      dirState.unindexedQueue.push({ uuid, dbPath, mtimeMs: statInfo.mtimeMs, statSig: statInfo.sig });
      dirState.unindexedSet.add(uuid);
      enqueued = true;
    }

    if (!backoffSkipped) {
      for (const existingId of Array.from(dirState.nodes.keys())) {
        if (!seenIds.has(existingId)) {
          deleteNodeLineage(dirState, existingId);
        }
      }
      if (dirState.unindexedQueue.length > 0) {
        const nextQueue = [];
        for (let i = 0; i < dirState.unindexedQueue.length; i++) {
          const item = dirState.unindexedQueue[i];
          if (seenIds.has(item.uuid)) {
            nextQueue.push(item);
          } else {
            dirState.unindexedSet.delete(item.uuid);
          }
        }
        if (enqueued || nextQueue.length !== dirState.unindexedQueue.length) {
          nextQueue.sort((a, b) => b.mtimeMs - a.mtimeMs);
        }
        dirState.unindexedQueue = nextQueue;
      }
      dirState.scanningDirMtimeMs = dirSt.mtimeMs;
    } else if (enqueued && dirState.unindexedQueue.length > 1) {
      dirState.unindexedQueue.sort((a, b) => b.mtimeMs - a.mtimeMs);
    }
  } else if (dirState.unindexedQueue.length === 0) {
    const pendingRescanMs = unc ? NO_META_RESCAN_UNC_MS : NO_META_RESCAN_LOCAL_MS;
    if (dirState.noMetaPending.size > 0 && nowMs - dirState.lastPendingScanAt >= pendingRescanMs) {
      dirState.lastPendingScanAt = nowMs;
      const newlyChanged = [];
      for (const [uuid, prevSig] of Array.from(dirState.noMetaPending.entries())) {
        if (unc && Date.now() - tWallStart > 400) {
          wslUncBackoffUntil = Date.now() + 45000;
          backoffSkipped = true;
          break;
        }
        if (dirState.nodes.get(uuid)?.hasMeta) {
          dirState.noMetaPending.delete(uuid);
          continue;
        }
        const dbPath = path.join(conversationsDir, `${uuid}.db`);
        const statInfo = getDbStatByPath(dbPath);
        if (!statInfo) {
          dirState.noMetaPending.delete(uuid);
          continue;
        }
        if (statInfo.sig !== prevSig && !dirState.unindexedSet.has(uuid)) {
          newlyChanged.push({ uuid, dbPath, mtimeMs: statInfo.mtimeMs, statSig: statInfo.sig });
          dirState.unindexedSet.add(uuid);
        }
      }
      if (newlyChanged.length > 0) {
        newlyChanged.sort((a, b) => b.mtimeMs - a.mtimeMs);
        dirState.unindexedQueue.push(...newlyChanged);
      }
    }
  }

  if (dirState.unindexedQueue.length === 0) {
    if (!backoffSkipped && dirState.scanningDirMtimeMs >= 0) {
      dirState.dirMtimeMs = dirState.scanningDirMtimeMs;
    }
    return { dirState, isDraining: false, backoffSkipped };
  }

  if (backoffSkipped || (unc && Date.now() < wslUncBackoffUntil)) {
    return {
      dirState,
      isDraining: dirState.unindexedQueue.length > 0,
      backoffSkipped: true
    };
  }

  const tPerfStart = performance.now();
  const maxTickOpens = unc ? LINEAGE_TICK_MAX_OPENS_UNC : LINEAGE_TICK_MAX_OPENS;
  let opens = 0;
  let qIdx = 0;
  const busyRetry = [];

  while (qIdx < dirState.unindexedQueue.length) {
    if (opens > 0 && (opens >= maxTickOpens || performance.now() - tPerfStart >= LINEAGE_TICK_MAX_MS)) {
      break;
    }
    if (unc && Date.now() - tWallStart > 400) {
      wslUncBackoffUntil = Date.now() + 45000;
      backoffSkipped = true;
      break;
    }
    const item = dirState.unindexedQueue[qIdx++];
    dirState.unindexedSet.delete(item.uuid);
    opens += 1;
    const res = readTrajectoryLineage(item.dbPath);
    if (res.ok) {
      if (res.hasMeta) {
        dirState.noMetaPending.delete(item.uuid);
        setNodeLineage(dirState, item.uuid, {
          hasMeta: true,
          parentId: res.parentId,
          rootId: res.rootId,
          statSig: item.statSig
        });
      } else {
        setNodeLineage(dirState, item.uuid, {
          hasMeta: false,
          parentId: '',
          rootId: '',
          statSig: item.statSig
        });
        if (!res.permanentInvalid) {
          rememberNoMetaPending(dirState, item.uuid, item.statSig);
          dirState.lastPendingScanAt = Date.now();
        } else {
          dirState.noMetaPending.delete(item.uuid);
        }
      }
    } else {
      busyRetry.push(item);
      dirState.unindexedSet.add(item.uuid);
    }
  }

  if (qIdx > 0 || busyRetry.length > 0) {
    const remaining = dirState.unindexedQueue.slice(qIdx);
    if (busyRetry.length > 0) {
      remaining.push(...busyRetry);
    }
    dirState.unindexedQueue = remaining;
  }

  if (unc && !backoffSkipped && Date.now() - tWallStart > 400) {
    wslUncBackoffUntil = Date.now() + 45000;
    backoffSkipped = true;
  }

  if (dirState.unindexedQueue.length === 0 && !backoffSkipped && dirState.scanningDirMtimeMs >= 0) {
    dirState.dirMtimeMs = dirState.scanningDirMtimeMs;
  }

  return {
    dirState,
    isDraining: dirState.unindexedQueue.length > 0,
    backoffSkipped
  };
}

function findDescendantIds(cascadeId, dirState) {
  if (!dirState) return [];
  const visited = new Set([cascadeId]);
  const queue = [];

  const selfNode = dirState.nodes.get(cascadeId);
  if (!selfNode || !selfNode.parentId) {
    const rootSet = dirState.byRoot.get(cascadeId);
    if (rootSet) {
      for (const id of rootSet) {
        if (id === cascadeId || visited.has(id)) continue;
        visited.add(id);
        queue.push(id);
      }
    }
  }

  const directSet = dirState.byParent.get(cascadeId);
  if (directSet) {
    for (const id of directSet) {
      if (id === cascadeId || visited.has(id)) continue;
      visited.add(id);
      queue.push(id);
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const curId = queue[qi++];
    const nextSet = dirState.byParent.get(curId);
    if (!nextSet) continue;
    for (const id of nextSet) {
      if (id === cascadeId || visited.has(id)) continue;
      visited.add(id);
      queue.push(id);
    }
  }

  queue.sort();
  return queue;
}

function getCompositeChildSnapshot(cascadeId, conversationsDir, parentSig = '') {
  if (!cascadeId || !UUID_RE.test(cascadeId) || !conversationsDir) {
    return {
      conversationsDir: '',
      descendantIds: [],
      childSigs: new Map(),
      isDraining: false,
      partialStale: false,
      sig: parentSig
    };
  }

  const { dirState, isDraining, backoffSkipped } = refreshLineageIndex(conversationsDir);
  const descendantIds = findDescendantIds(cascadeId, dirState);
  const childSigs = new Map();
  const childSigParts = [];
  let partialStale = Boolean(backoffSkipped);
  const unc = isUncPath(conversationsDir);
  const t0 = Date.now();

  if (unc && Date.now() < wslUncBackoffUntil) {
    partialStale = true;
    for (let i = 0; i < descendantIds.length; i++) {
      const cid = descendantIds[i];
      const prev = childMetricsCache.get(path.join(conversationsDir, `${cid}.db`))?.sig || '';
      childSigs.set(cid, prev || 'unc_deferred');
      childSigParts.push(`${cid}=${prev || '0:0|0:0'}`);
    }
  } else {
    for (let i = 0; i < descendantIds.length; i++) {
      const cid = descendantIds[i];
      if (unc && (Date.now() < wslUncBackoffUntil || Date.now() - t0 > 400)) {
        if (Date.now() >= wslUncBackoffUntil) {
          wslUncBackoffUntil = Date.now() + 45000;
        }
        partialStale = true;
        const prev = childMetricsCache.get(path.join(conversationsDir, `${cid}.db`))?.sig || '';
        childSigs.set(cid, prev || 'unc_deferred');
        childSigParts.push(`${cid}=${prev || '0:0|0:0'}`);
        continue;
      }
      const statInfo = getDbStatByPath(path.join(conversationsDir, `${cid}.db`));
      if (unc && Date.now() - t0 > 400) {
        wslUncBackoffUntil = Date.now() + 45000;
        partialStale = true;
      }
      childSigs.set(cid, statInfo ? statInfo.sig : 'missing');
      childSigParts.push(`${cid}=${statInfo ? statInfo.sig : '0:0|0:0'}`);
    }
  }

  const uncBackoffActive = Boolean(unc && Date.now() < wslUncBackoffUntil);
  return {
    conversationsDir,
    descendantIds,
    childSigs,
    isDraining: Boolean(isDraining),
    partialStale,
    uncBackoffActive,
    sig: `${parentSig}|children:${childSigParts.join(',')}${isDraining ? '|draining' : ''}${partialStale ? '|stale' : ''}`
  };
}

function loadChildScalarMetrics(childId, conversationsDir, knownStatSig = null, allowUncachedOpen = true) {
  if (knownStatSig === 'missing') return { exists: false };
  const dbPath = path.join(conversationsDir, `${childId}.db`);
  const cached = childMetricsCache.get(dbPath);
  if (knownStatSig === 'unc_deferred') {
    return { exists: true, deferred: true, staleMetrics: cached || null };
  }
  if (!knownStatSig && !allowUncachedOpen) {
    return cached ? { exists: true, deferred: true, staleMetrics: cached } : { exists: true, deferred: true, staleMetrics: null };
  }
  const sig = knownStatSig || getDbStatByPath(dbPath)?.sig || '';
  if (!sig) return { exists: false };

  if (cached && cached.sig === sig) {
    setChildMetricsCache(dbPath, cached);
    return { exists: true, fromCache: true, metrics: cached };
  }
  if (!allowUncachedOpen) {
    return { exists: true, deferred: true, staleMetrics: cached || null };
  }

  try {
    return withReadOnlyDb(dbPath, 20, (db) => {
      const rows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx ASC').all();
      let calls = 0;
      let totalIn = 0;
      let totalCache = 0;
      let totalOut = 0;
      let totalThink = 0;
      let totalResp = 0;
      for (let i = 0; i < rows.length; i++) {
        const p = parseGenMetadataRow(rows[i]);
        if (p.ctx > 0 || p.outTok > 0) {
          calls += 1;
          totalIn += p.inTok;
          totalCache += p.cacheRead;
          totalOut += p.outTok;
          totalThink += p.thinkTok;
          totalResp += p.respTok;
        }
      }
      const entry = {
        sig,
        hasData: calls > 0,
        calls,
        totalIn,
        totalCache,
        totalOut,
        totalThink,
        totalResp
      };
      setChildMetricsCache(dbPath, entry);
      return { exists: true, fromCache: false, metrics: entry };
    });
  } catch (err) {
    const msg = String(err?.message || '');
    if (
      /locked|busy/i.test(msg) ||
      (isUncPath(dbPath) && /malformed|disk i\/o|ebusy|eacces|enoent/i.test(msg))
    ) {
      return { exists: true, fromCache: false, transientError: true, staleMetrics: cached || null };
    }
    const emptyEntry = {
      sig,
      hasData: false,
      calls: 0,
      totalIn: 0,
      totalCache: 0,
      totalOut: 0,
      totalThink: 0,
      totalResp: 0
    };
    setChildMetricsCache(dbPath, emptyEntry);
    return { exists: true, fromCache: false, metrics: emptyEntry };
  }
}

function parseGenMetadataRow(r) {
  const top = parseProto(r.data);
  const chatRaw = top.get(1);
  const chat = chatRaw instanceof Uint8Array ? parseProto(chatRaw) : new Map();
  const usageRaw = chat.get(4);
  const usage = usageRaw instanceof Uint8Array ? parseProto(usageRaw) : new Map();
  const chatStartRaw = chat.get(9);
  const chatStart = chatStartRaw instanceof Uint8Array ? parseProto(chatStartRaw) : new Map();
  const ctxWinRaw = chatStart.get(10);
  const ctxWin = ctxWinRaw instanceof Uint8Array ? parseProto(ctxWinRaw) : new Map();
  const maxCtx = ctxWin.get(4) || 0;
  const ttftRaw = chat.get(11);
  const ttftMap = ttftRaw instanceof Uint8Array ? parseProto(ttftRaw) : new Map();
  const streamRaw = chat.get(12);
  const streamMap = streamRaw instanceof Uint8Array ? parseProto(streamRaw) : new Map();

  const inTok = usage.get(2) || 0;
  const outTok = usage.get(3) || 0;
  const cacheRead = usage.get(5) || 0;
  const thinkTok = usage.get(9) || 0;
  const respTok = usage.get(10) || 0;
  const ttft = (ttftMap.get(1) || 0) + (ttftMap.get(2) || 0) / 1e9;
  const stream = (streamMap.get(1) || 0) + (streamMap.get(2) || 0) / 1e9;

  return {
    idx: r.idx,
    inTok,
    outTok,
    cacheRead,
    ctx: inTok + cacheRead,
    maxCtx,
    thinkTok,
    respTok,
    ttft,
    stream,
    totDur: ttft + stream
  };
}

function formatContextCeiling(tokens) {
  if (tokens >= 1000000) {
    return `${Number((tokens / 1000000).toFixed(1))}M`;
  }
  return `${Math.round(tokens / 1000)}k`;
}

function parseConversationMetrics(cascadeId, endpointOrDir, precomputedState = null, precomputedChildSnap = null) {
  if (!DatabaseSync) return null;
  if (!cascadeId || !UUID_RE.test(cascadeId)) return null;
  const state = precomputedState || getDbState(cascadeId, endpointOrDir);
  if (!state || !state.dbPath || !state.sig) return { cascadeId, hasData: false };
  const { dbPath, sig } = state;
  const conversationsDir = path.dirname(dbPath);
  const childSnap =
    precomputedChildSnap || getCompositeChildSnapshot(cascadeId, conversationsDir, state.rawSig || sig);
  const compositeSig = childSnap?.sig || sig;

  const cached = metricsCache.get(dbPath);
  if (cached && cached.sig === compositeSig && !childSnap?.isDraining && !childSnap?.partialStale) {
    return cached.payload;
  }

  const uncParent = isUncPath(dbPath);
  if (uncParent && Date.now() < wslUncBackoffUntil) {
    const bestEffort = cached?.payload || lastBestEffortPayloadCache.get(dbPath) || null;
    if (bestEffort) {
      return {
        ...bestEffort,
        partialStale: true,
        uncBackoffActive: true
      };
    }
    return {
      cascadeId,
      transientError: true,
      uncBackoffActive: true,
      cachedPayload: null
    };
  }

  const tParentWallStart = Date.now();
  try {
    const parentDbRes = withReadOnlyDb(dbPath, 200, (db) => {
      const metaStat = db.prepare('SELECT COUNT(*) AS cnt, COALESCE(MAX(idx), -1) AS maxIdx FROM gen_metadata').get();
      const rowCount = metaStat?.cnt ?? 0;
      const maxIdx = metaStat?.maxIdx ?? -1;
      if (rowCount === 0 || maxIdx < 0) {
        return { empty: true };
      }

      // 利用 idx_steps_step_type 覆盖索引直接在 SQLite C 引擎内完成聚合计数，0 数组分配
      // 注意：gen_metadata.idx 与 steps.idx 属于两套独立递增坐标系，绝不可混用！
      const userStat = db
        .prepare('SELECT COUNT(*) AS cnt, COALESCE(MAX(idx), -1) AS lastIdx FROM steps WHERE step_type = 14')
        .get();
      const lastUserStepIdx = userStat?.lastIdx ?? -1;
      const userStepsCount = userStat?.cnt ?? 0;
      const turnStat = db
        .prepare('SELECT COUNT(*) AS cnt FROM steps WHERE step_type = 15 AND idx > ?')
        .get(lastUserStepIdx);
      const rawTurnSteps = turnStat?.cnt ?? 0;

      let inc = incrementalMetricsMap.get(dbPath);
      if (
        inc &&
        (rowCount < inc.rowCount ||
          maxIdx < inc.maxIdx ||
          userStepsCount < inc.userStepsCount ||
          lastUserStepIdx < inc.lastUserStepIdx ||
          (lastUserStepIdx !== inc.lastUserStepIdx && userStepsCount <= inc.userStepsCount))
      ) {
        inc = null;
      }

      if (inc) {
        const startIdx = inc.maxIdx;
        const deltaRows = db.prepare('SELECT idx, data FROM gen_metadata WHERE idx >= ? ORDER BY idx ASC').all(startIdx);
        while (inc.items.length > 0 && inc.items[inc.items.length - 1].idx >= startIdx) {
          const popped = inc.items.pop();
          inc.totalIn -= popped.inTok;
          inc.totalCache -= popped.cacheRead;
          inc.totalOut -= popped.outTok;
          inc.totalThink -= popped.thinkTok;
          inc.totalResp -= popped.respTok;
        }
        while (inc.validItems.length > 0 && inc.validItems[inc.validItems.length - 1].idx >= startIdx) {
          inc.validItems.pop();
        }
        if (inc.items.length + deltaRows.length === rowCount) {
          for (let i = 0; i < deltaRows.length; i++) {
            const p = parseGenMetadataRow(deltaRows[i]);
            inc.items.push(p);
            inc.totalIn += p.inTok;
            inc.totalCache += p.cacheRead;
            inc.totalOut += p.outTok;
            inc.totalThink += p.thinkTok;
            inc.totalResp += p.respTok;
            if (p.ctx > 0 || p.outTok > 0) {
              inc.validItems.push(p);
            }
          }
          inc.rowCount = rowCount;
          inc.maxIdx = maxIdx;
          inc.userStepsCount = userStepsCount;
          inc.lastUserStepIdx = lastUserStepIdx;
        } else {
          inc = null;
        }
      }

      if (!inc) {
        const rows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx ASC').all();
        const items = [];
        const validItems = [];
        let totalIn = 0;
        let totalCache = 0;
        let totalOut = 0;
        let totalThink = 0;
        let totalResp = 0;
        for (let i = 0; i < rows.length; i++) {
          const p = parseGenMetadataRow(rows[i]);
          items.push(p);
          totalIn += p.inTok;
          totalCache += p.cacheRead;
          totalOut += p.outTok;
          totalThink += p.thinkTok;
          totalResp += p.respTok;
          if (p.ctx > 0 || p.outTok > 0) {
            validItems.push(p);
          }
        }
        inc = {
          rowCount: rows.length,
          maxIdx: rows.length > 0 ? rows[rows.length - 1].idx : -1,
          userStepsCount,
          lastUserStepIdx,
          items,
          validItems,
          totalIn,
          totalCache,
          totalOut,
          totalThink,
          totalResp
        };
      }

      return { empty: false, inc, userStepsCount, rawTurnSteps };
    });

    if (parentDbRes.empty) {
      incrementalMetricsMap.delete(dbPath);
      const emptyPayload = {
        cascadeId,
        hasData: false,
        sig: compositeSig,
        isDraining: Boolean(childSnap?.isDraining),
        partialStale: Boolean(childSnap?.partialStale)
      };
      if (!childSnap?.isDraining && !childSnap?.partialStale) {
        setMetricsCache(dbPath, { sig: compositeSig, payload: emptyPayload });
      }
      return emptyPayload;
    }

    const { inc, userStepsCount, rawTurnSteps } = parentDbRes;
    if (uncParent && Date.now() - tParentWallStart > 400) {
      wslUncBackoffUntil = Date.now() + 45000;
    }
    setIncrementalMetrics(dbPath, inc);

    const { validItems: valid, totalIn, totalCache, totalOut, totalThink, totalResp } = inc;
    if (valid.length === 0) {
      const emptyPayload = {
        cascadeId,
        hasData: false,
        sig: compositeSig,
        isDraining: Boolean(childSnap?.isDraining),
        partialStale: Boolean(childSnap?.partialStale)
      };
      if (!childSnap?.isDraining && !childSnap?.partialStale) {
        setMetricsCache(dbPath, { sig: compositeSig, payload: emptyPayload });
      }
      return emptyPayload;
    }

    const descendantIds = childSnap?.descendantIds || [];
    const isDraining = Boolean(childSnap?.isDraining);
    let partialStale = Boolean(childSnap?.partialStale);
    let childCount = 0;
    let childCalls = 0;
    let childIn = 0;
    let childCache = 0;
    let childOut = 0;
    let childThink = 0;
    let childResp = 0;
    let childSqlOpens = 0;
    const tChildPerfStart = performance.now();
    const tChildWallStart = Date.now();
    const uncChildren = isUncPath(conversationsDir);

    const maxChildOpens = uncChildren ? LINEAGE_TICK_MAX_OPENS_UNC : LINEAGE_TICK_MAX_OPENS;

    for (let i = 0; i < descendantIds.length; i++) {
      const childId = descendantIds[i];
      if (childId === cascadeId) continue;

      const knownChildSig = childSnap.childSigs?.get(childId) || null;
      const uncNowBlocked =
        uncChildren && (Date.now() < wslUncBackoffUntil || Date.now() - tChildWallStart > 400);
      if (uncChildren && Date.now() - tChildWallStart > 400 && Date.now() >= wslUncBackoffUntil) {
        wslUncBackoffUntil = Date.now() + 45000;
      }
      const allowUncachedOpen =
        !uncNowBlocked &&
        (childSqlOpens === 0 ||
          (childSqlOpens < maxChildOpens &&
            performance.now() - tChildPerfStart < LINEAGE_TICK_MAX_MS));
      const childRes = loadChildScalarMetrics(
        childId,
        conversationsDir,
        knownChildSig,
        allowUncachedOpen
      );
      if (!childRes.exists) continue;
      if (!childRes.fromCache && !childRes.deferred) {
        childSqlOpens += 1;
        if (uncChildren && Date.now() - tChildWallStart > 400) {
          wslUncBackoffUntil = Date.now() + 45000;
        }
      }

      let cm = null;
      if (childRes.deferred || childRes.transientError) {
        partialStale = true;
        if (childRes.staleMetrics && childRes.staleMetrics.hasData) {
          cm = childRes.staleMetrics;
        } else {
          continue;
        }
      } else {
        cm = childRes.metrics;
      }

      if (!cm || !cm.hasData) continue;
      childCount += 1;
      childCalls += cm.calls;
      childIn += cm.totalIn;
      childCache += cm.totalCache;
      childOut += cm.totalOut;
      childThink += cm.totalThink;
      childResp += cm.totalResp;
    }

    // 统计最后一条用户提问之后的模型规划步数，并从有效调用末尾切片汇总，消除按位置对齐的错位风险
    const turnSlice = rawTurnSteps > 0 ? valid.slice(-rawTurnSteps) : [];
    const turnSteps = turnSlice.length;
    let turnOut = 0;
    let turnThink = 0;
    let turnResp = 0;
    let turnDur = 0;
    for (let i = 0; i < turnSlice.length; i++) {
      turnOut += turnSlice[i].outTok;
      turnThink += turnSlice[i].thinkTok;
      turnResp += turnSlice[i].respTok;
      turnDur += turnSlice[i].totDur;
    }

    const last = valid[valid.length - 1];
    const fallbackContextLimit = activeConfig.contextLimit || 256000;
    const contextLimitTokens =
      activeConfig.contextLimitOverride > 0
        ? activeConfig.contextLimitOverride
        : last.maxCtx > 0
          ? last.maxCtx
          : fallbackContextLimit;
    const limitStr = formatContextCeiling(contextLimitTokens);

    const rawStreamTps = last.stream >= 0.5 ? last.outTok / last.stream : 0;
    const e2eTps = last.totDur > 0 ? last.outTok / last.totDur : 0;
    const streamRatio = last.totDur > 0 ? last.stream / last.totDur : 0;
    const useStream =
      rawStreamTps > 0 &&
      rawStreamTps <= 600 &&
      (streamRatio >= 0.15 || (last.stream >= 2.0 && rawStreamTps <= 250));
    const displayTps = useStream ? rawStreamTps : e2eTps;
    const ctxPct = Math.round((last.ctx / contextLimitTokens) * 100);
    const ctxClass = ctxPct >= 90 ? 'ag-ctx-crit' : ctxPct >= 75 ? 'ag-ctx-warn' : 'ag-ctx-ok';
    const lastCacheRate = last.ctx > 0 ? ((last.cacheRead / last.ctx) * 100).toFixed(1) : '0.0';
    const sessionCacheRate = totalIn + totalCache > 0 ? ((totalCache / (totalIn + totalCache)) * 100).toFixed(1) : '0.0';
    const remainCtx = Math.max(0, contextLimitTokens - last.ctx);

    const zhWarnActive =
      process.platform === 'darwin' &&
      (zhTitleStatus.state === 'tcc_blocked' || zhTitleStatus.state === 'stale_inode');
    const zhWarnInlineHtml = zhWarnActive
      ? `<span class="ag-sep">·</span><span class="ag-zh-warn-dot" title="${escapeHtmlSafe(zhTitleStatus.label)}">●</span>`
      : '';
    const subSyncing = isDraining || partialStale;
    const subInlineHtml =
      childCount > 0 ? `<span class="ag-sep">·</span><span class="ag-sub-badge">+${childCount} sub</span>` : '';
    const inlineHtml = [
      `<span>${Math.round(displayTps)} tok/s</span>`,
      `<span class="ag-sep">·</span>`,
      `<span>${useStream ? 'TTFT' : 'Hold'} ${last.ttft.toFixed(1)}s</span>`,
      `<span class="ag-sep">·</span>`,
      `<span>Ctx ${fmtTok(last.ctx)}/${limitStr} <span class="${ctxClass}">(${ctxPct}%)</span></span>`,
      `<span class="ag-sep">·</span>`,
      `<span>Out ${fmtTok(last.outTok)}</span>`,
      subInlineHtml,
      zhWarnInlineHtml
    ].join('');

    const turnRowHtml =
      turnSteps > 1
        ? `<div class="ag-tt-row"><span class="ag-tt-lbl">本轮合计 (${turnSteps}步)</span><span class="ag-tt-val">输出 ${fmtNum(turnOut)} (思考 ${fmtNum(turnThink)} + 响应 ${fmtNum(turnResp)}) | 耗时 ${turnDur.toFixed(1)}s</span></div>`
        : '';

    const combinedOut = totalOut + childOut;
    const subRowHtml =
      childCount > 0
        ? `<div class="ag-tt-row"><span class="ag-tt-lbl">子 Agent (${childCount}${subSyncing ? ' · 同步中' : ''})</span><span class="ag-tt-val">${childCalls} 次 · 新增 ${fmtTok(childIn)} + 缓存 ${fmtTok(childCache)} · 输出 ${fmtTok(childOut)}</span></div>`
        : descendantIds.length > 0 && subSyncing
          ? `<div class="ag-tt-row"><span class="ag-tt-lbl">子 Agent (同步中)</span><span class="ag-tt-val">正在索引 ${descendantIds.length} 个子会话…</span></div>`
          : '';
    const outputRowHtml =
      childCount > 0
        ? `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输出量</span><span class="ag-tt-val">总计 ${fmtTok(combinedOut)} (主 ${fmtTok(totalOut)} + 子 ${fmtTok(childOut)})</span></div>`
        : `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输出量</span><span class="ag-tt-val">总计 ${fmtTok(totalOut)} (思考链 ${fmtTok(totalThink)} + 正文/工具 ${fmtTok(totalResp)})</span></div>`;
    const zhCmdEsc = zhWarnActive && zhTitleStatus.cmd ? escapeHtmlSafe(zhTitleStatus.cmd) : '';
    const zhCmdRowHtml = zhCmdEsc
      ? `<div class="ag-tt-warn-cmd-row"><code class="ag-tt-warn-cmd">${zhCmdEsc}</code><button type="button" class="ag-tt-copy-btn" data-ag-copy-cmd="${zhCmdEsc}">复制命令</button></div>`
      : '';
    const zhWarnRowHtml = zhWarnActive
      ? `<div class="ag-tt-warn"><div class="ag-tt-warn-hdr"><span class="ag-tt-warn-lbl">⚠ ${escapeHtmlSafe(zhTitleStatus.label)}</span></div><span class="ag-tt-warn-val">${escapeHtmlSafe(zhTitleStatus.detail)}</span>${zhCmdRowHtml}</div>`
      : '';

    const tooltipRows = [
      `<div class="ag-tt-hdr">本轮最新调用 (Gen #${last.idx + 1})</div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">生成速度</span><span class="ag-tt-val">${useStream ? `流式 ${rawStreamTps.toFixed(1)} tok/s | ` : ''}端到端（含等待） ${e2eTps.toFixed(1)} tok/s</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">响应耗时</span><span class="ag-tt-val">${useStream ? `TTFT ${last.ttft.toFixed(2)}s | 流式 ${last.stream.toFixed(2)}s | 总计 ${last.totDur.toFixed(2)}s` : `等待 ${last.ttft.toFixed(2)}s | 刷出 ${last.stream.toFixed(2)}s | 总计 ${last.totDur.toFixed(2)}s`}</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">当前上下文</span><span class="ag-tt-val">${fmtNum(last.ctx)} (新增 ${fmtNum(last.inTok)} + 缓存 ${fmtNum(last.cacheRead)}, ${lastCacheRate}%)</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">本步输出量</span><span class="ag-tt-val">${fmtNum(last.outTok)} (思考链 ${fmtNum(last.thinkTok)} + 正文/工具 ${fmtNum(last.respTok)})</span></div>`,
      turnRowHtml,
      `<div class="ag-tt-hdr ag-tt-sec">当前会话累计 (${userStepsCount} 轮提问 / ${valid.length} 次有效调用)</div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">压缩水位线</span><span class="ag-tt-val">${fmtTok(last.ctx)} / ${limitStr} (${ctxPct}%) · 距压缩余 ${fmtTok(remainCtx)}</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输入量</span><span class="ag-tt-val">新增 ${fmtTok(totalIn)} + 缓存读取 ${fmtTok(totalCache)} (命中率 ${sessionCacheRate}%)</span></div>`,
      subRowHtml,
      outputRowHtml,
      zhWarnRowHtml
    ];
    const tooltipHtml = tooltipRows.join('');

    const uncBackoffActive = Boolean(
      childSnap?.uncBackoffActive || (uncParent && Date.now() < wslUncBackoffUntil)
    );
    const payload = {
      cascadeId,
      hasData: true,
      sig: compositeSig,
      isDraining,
      partialStale,
      uncBackoffActive,
      inlineHtml,
      tooltipHtml
    };
    setBoundedMap(lastBestEffortPayloadCache, dbPath, payload, 64);
    if (!isDraining && !partialStale) {
      setMetricsCache(dbPath, { sig: compositeSig, payload });
    }
    return payload;
  } catch {
    // 若遇 SQLITE_BUSY 等瞬态锁竞争，标记 transientError 使得上层不锁死 lastPushedHash，下一轮自动重试
    return {
      cascadeId,
      transientError: true,
      cachedPayload: cached?.payload || null
    };
  }
}

// ============================================================================
// 5. CDP 目标发现、WebSocket 会话挂载与热更新推送
// ============================================================================
const skippedNonHostTargets = new Map(); // targetId -> { origin, skippedAt }

function belongsToParentTarget(entry, parentTargetId, parentChannel) {
  let curId = entry.parentId || null;
  if (!curId) {
    return !parentChannel || entry.endpoint?.channel === parentChannel;
  }
  const seen = new Set();
  while (curId && !seen.has(curId)) {
    if (curId === parentTargetId) return true;
    const known = attachedTargets.get(curId);
    if (known && known.type === 'page') return false;
    seen.add(curId);
    curId = targetMetaMap.get(curId)?.parentId || null;
  }
  return !parentChannel || entry.endpoint?.channel === parentChannel;
}

function resolveParentThemeMode(target, endpoint) {
  let curId = target?.parentId || null;
  const seen = new Set();
  while (curId && !seen.has(curId)) {
    seen.add(curId);
    if (targetThemeModes.has(curId)) {
      return targetThemeModes.get(curId);
    }
    curId = targetMetaMap.get(curId)?.parentId || null;
  }
  const ch = endpoint?.channel || null;
  for (const [id, entry] of attachedTargets.entries()) {
    if (
      entry.hostConfirmed &&
      entry.type === 'page' &&
      (!ch || entry.endpoint?.channel === ch) &&
      targetThemeModes.has(id)
    ) {
      return targetThemeModes.get(id);
    }
  }
  return null;
}

function syncThemeToChildIframes(parentTargetId, mode) {
  if (!activeConfig.enabled || (mode !== 'dark' && mode !== 'light')) return;
  const parentEntry = attachedTargets.get(parentTargetId);
  const parentChannel = parentEntry?.endpoint?.channel || null;
  for (const [, entry] of attachedTargets.entries()) {
    if (!entry.hostConfirmed || entry.type !== 'iframe') continue;
    if (!belongsToParentTarget(entry, parentTargetId, parentChannel)) continue;
    entry
      .send('Runtime.evaluate', {
        expression: `window.__ag_set_host_theme_mode && window.__ag_set_host_theme_mode(${JSON.stringify(mode)})`,
        returnByValue: false
      })
      .catch(() => {});
    if (entry.updateNewDocScript) {
      entry.updateNewDocScript().catch(() => {});
    }
  }
}

function resolveParentDarkPreset(target, endpoint) {
  let curId = target?.parentId || null;
  const seen = new Set();
  while (curId && !seen.has(curId)) {
    seen.add(curId);
    if (targetDarkPresets.has(curId)) {
      return targetDarkPresets.get(curId);
    }
    curId = targetMetaMap.get(curId)?.parentId || null;
  }
  const ch = endpoint?.channel || null;
  for (const [id, entry] of attachedTargets.entries()) {
    if (
      entry.hostConfirmed &&
      entry.type === 'page' &&
      (!ch || entry.endpoint?.channel === ch) &&
      targetDarkPresets.has(id)
    ) {
      return targetDarkPresets.get(id);
    }
  }
  return null;
}

function syncDarkPresetToChildIframes(parentTargetId, rawDarkPreset) {
  if (!activeConfig.enabled) return;
  const nextDarkPreset = String(rawDarkPreset || '').trim().toLowerCase() === 'claude-warm' ? 'claude-warm' : 'onyx';
  targetDarkPresets.set(parentTargetId, nextDarkPreset);
  const parentEntry = attachedTargets.get(parentTargetId);
  const parentChannel = parentEntry?.endpoint?.channel || null;
  for (const [, entry] of attachedTargets.entries()) {
    if (!entry.hostConfirmed || entry.type !== 'iframe') continue;
    if (!belongsToParentTarget(entry, parentTargetId, parentChannel)) continue;
    entry
      .send('Runtime.evaluate', {
        expression: `window.__ag_set_host_dark_preset && window.__ag_set_host_dark_preset(${JSON.stringify(nextDarkPreset)})`,
        returnByValue: false
      })
      .catch(() => {});
    if (entry.updateNewDocScript) {
      entry.updateNewDocScript().catch(() => {});
    }
  }
}

function getTargetOriginKey(urlStr) {
  const raw = String(urlStr || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.origin && u.origin !== 'null') {
      return u.origin.toLowerCase();
    }
    return `${u.protocol}//${u.host || u.pathname || ''}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function isExemptInternalTarget(target) {
  const url = String(target?.url || '');
  if (target?.type === 'iframe' && url.startsWith('plugin://swarm--')) return true;
  if (url.startsWith('vscode-file://')) return true;
  return false;
}

const HOST_PROBE_EXPRESSION = `(function(){
  try {
    var loc = window.location;
    var isSwarm = !!(loc && ((loc.protocol === 'plugin:' && /^swarm--/i.test(loc.hostname || '')) || /^plugin:\\/\\/swarm--/i.test(String(loc.href || ''))));
    if (isSwarm || (loc && loc.protocol === 'vscode-file:')) return 'host';
    if (window.__APP_CONFIG__ && window.__APP_CONFIG__.productName === 'antigravity') return 'host';
    if (
      window.electronNative &&
      ((typeof window.electronNative.setTitleBarOverlay === 'function' &&
        window.nativeStorage &&
        typeof window.nativeStorage.getItems === 'function') ||
        (typeof window.electronNative.getZoomLevel === 'function' &&
          window.electronNative.wcvBrowser &&
          typeof window.electronNative.wcvBrowser.setThemeColor === 'function'))
    ) return 'host';
    if (
      typeof document !== 'undefined' &&
      typeof document.querySelector === 'function' &&
      document.querySelector('link[href*="/jetbox.css"], body[data-agy-theme], body[data-newux-theme], [id="antigravity.agentSidePanelInputBox"]')
    ) return 'host';
    if (typeof document === 'undefined' || !document.documentElement || document.readyState === 'loading') {
      return 'pending';
    }
    return 'non_host';
  } catch (e) {
    return 'pending';
  }
})()`;

function readPort(portFile) {
  try {
    const raw = fs.readFileSync(portFile, 'utf8').trim();
    const lines = raw.split(/\r?\n/);
    const port = parseInt(lines[0], 10);
    return Number.isFinite(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function fetchTargets(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/json/list', timeout: 450 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve([]);
          }
        });
      }
    );
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

function isAllowedOrigin(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  return activeConfig.allowedOrigins.some((prefix) => urlStr.startsWith(prefix));
}

const CASCADE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_WATCHED_CASCADES = 12;

function normalizeCascadeIdList(raw) {
  const candidates = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') candidates.push(item);
    }
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed) {
      let decoded = trimmed;
      try {
        decoded = decodeURIComponent(trimmed);
      } catch {}
      for (const part of decoded.split(/[+,]/)) {
        candidates.push(part);
      }
    }
  }
  const seen = new Set();
  const out = [];
  for (const item of candidates) {
    const clean = String(item || '').trim().toLowerCase();
    if (!CASCADE_UUID_RE.test(clean) || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= MAX_WATCHED_CASCADES) break;
  }
  return out;
}

function parseMetricsSubscriptionPayload(rawPayload) {
  const raw = String(rawPayload ?? '').trim();
  if (!raw) return { valid: false, ids: [] };
  if (raw.startsWith('[')) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return { valid: true, ids: normalizeCascadeIdList(arr) };
      }
    } catch {}
    return { valid: false, ids: [] };
  }
  const ids = normalizeCascadeIdList(raw);
  return { valid: ids.length > 0, ids };
}

function attachTarget(target, endpoint) {
  const wsUrl = target.webSocketDebuggerUrl;
  if (!wsUrl) return Promise.resolve(false);

  return new Promise((resolveAttach) => {
    let settled = false;
    const finishAttach = (ok) => {
      if (!settled) {
        settled = true;
        resolveAttach(ok);
      }
    };
    const attachTimeout = setTimeout(() => finishAttach(false), 2500);

    try {
      const ws = new WebSocket(wsUrl);
      let msgId = 1;
      let watchedCascadeIds = [];
      let hasExplicitSubscription = false;
      const perCascadeState = new Map(); // cascadeId -> { lastPushedHash, lastRenderedSig }
      let evalScriptId = null;
      const pendingCallbacks = new Map();

      const send = (method, params = {}) =>
        new Promise((resolve) => {
          if (ws.readyState !== WebSocket.OPEN) return resolve(null);
          const id = msgId++;
          const timer = setTimeout(() => {
            pendingCallbacks.delete(id);
            resolve(null);
          }, 2500);
          pendingCallbacks.set(id, (msg) => {
            clearTimeout(timer);
            resolve(msg);
          });
          ws.send(JSON.stringify({ id, method, params }));
        });

      let newDocQueue = Promise.resolve();
      let lastNewDocSig = '';

      const buildTargetInjectScript = () => {
        if (!activeConfig.enabled || target.type !== 'iframe') {
          return { script: cachedInjectScript, parentMode: '', parentDarkPreset: '' };
        }
        const parentMode = resolveParentThemeMode(target, endpoint) || '';
        const parentDarkPreset = resolveParentDarkPreset(target, endpoint) || '';
        const modeVal = parentMode === 'dark' || parentMode === 'light' ? parentMode : null;
        const darkVal = parentDarkPreset === 'claude-warm' || parentDarkPreset === 'onyx' ? parentDarkPreset : null;
        return {
          script: `window.__ag_host_theme_mode=${modeVal ? JSON.stringify(modeVal) : 'null'};\nwindow.__ag_host_dark_preset=${darkVal ? JSON.stringify(darkVal) : 'null'};\n${cachedInjectScript}`,
          parentMode: modeVal || '',
          parentDarkPreset: darkVal || ''
        };
      };

      const updateNewDocScript = (force = false) => {
        newDocQueue = newDocQueue
          .then(async () => {
            const { script, parentMode, parentDarkPreset } = buildTargetInjectScript();
            const nextSig = `${activeConfig.enabled}|${cachedPatchVersion}|${parentMode}|${parentDarkPreset || ''}`;
            if (!force && evalScriptId && nextSig === lastNewDocSig) return;
            if (evalScriptId) {
              await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: evalScriptId });
              evalScriptId = null;
            }
            if (activeConfig.enabled) {
              const addRes = await send('Page.addScriptToEvaluateOnNewDocument', { source: script });
              if (addRes?.result?.identifier) {
                evalScriptId = addRes.result.identifier;
                lastNewDocSig = nextSig;
              }
            } else {
              lastNewDocSig = nextSig;
            }
          })
          .catch(() => {});
        return newDocQueue;
      };

      const inject = async () => {
        if (target.type === 'page') {
          hasExplicitSubscription = false;
        }
        const { script } = buildTargetInjectScript();
        const res = await send('Runtime.evaluate', {
          expression: script,
          returnByValue: true
        });
        if (res?.error) {
          console.error(`[Daemon] Injection error on ${target.id}:`, res.error.message || res.error);
          return false;
        } else if (res?.result?.exceptionDetails) {
          console.error(
            `[Daemon] Injection failed on ${target.id}: Script Exception:`,
            res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text
          );
          return false;
        } else {
          if (target.type === 'page') {
            if (!activeConfig.enabled) {
              targetThemeModes.delete(target.id);
              targetDarkPresets.delete(target.id);
              watchedCascadeIds = [];
              perCascadeState.clear();
            } else {
              const resolvedMode = res?.result?.result?.value;
              if (resolvedMode === 'dark' || resolvedMode === 'light') {
                const prevMode = targetThemeModes.get(target.id);
                targetThemeModes.set(target.id, resolvedMode);
                if (prevMode !== resolvedMode) {
                  syncThemeToChildIframes(target.id, resolvedMode);
                }
              }
            }
          }
          console.log(`[Daemon] Injected (${cachedPatchVersion}) into target ${target.id} [${endpoint.channel}]`);
          return true;
        }
      };

      const syncMetricsForSession = async (force = false, skipDomEval = false) => {
        if (target.type === 'iframe' || !DatabaseSync || !activeConfig.modules.metrics || !activeConfig.enabled) return;

        // 仅在尚未获知前端订阅或强制重同步时向前端发起 Runtime.evaluate，日常靠 __agRequestMetrics 绑定事件实时驱动
        if (!skipDomEval && (!hasExplicitSubscription || force)) {
          const evalRes = await send('Runtime.evaluate', {
            expression: `(function(){
              if (Array.isArray(window.__ag_watched_cascade_ids) && typeof window.__ag_watched_cascade_sig === 'string') {
                return window.__ag_watched_cascade_ids;
              }
              var out = [];
              var seen = {};
              var add = function(v) {
                var s = String(v || '').trim().toLowerCase();
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) && !seen[s]) {
                  seen[s] = true;
                  out.push(s);
                }
              };
              var addTab = function(v) {
                var m = String(v || '').trim().match(/^(?:side_question|subagent_convo)__([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
                if (m) add(m[1]);
              };
              var views = document.querySelectorAll('[data-testid="conversation-view"][data-cascade-id], [data-testid="side-question-tab-conversation"][data-cascade-id], [data-testid="subagent-tab-conversation"][data-cascade-id]');
              for (var i = 0; i < views.length; i++) add(views[i].getAttribute('data-cascade-id'));
              var activeTabs = document.querySelectorAll('[data-active-tab-id^="side_question__"], [data-active-tab-id^="subagent_convo__"]');
              for (var t = 0; t < activeTabs.length; t++) addTab(activeTabs[t].getAttribute('data-active-tab-id'));
              try {
                var dec = decodeURIComponent(window.location.pathname || '');
                var m = dec.match(/\\/c\\/([^/?#]+)/i);
                if (m) {
                  var parts = m[1].split(/[+%]/);
                  for (var j = 0; j < parts.length; j++) add(parts[j]);
                }
                var sp = new URLSearchParams(window.location.search || '');
                add(sp.get('focused'));
                add(sp.get('cascadeId'));
                var tabs = sp.getAll('tab');
                for (var u = 0; u < tabs.length; u++) addTab(tabs[u]);
              } catch (e) {}
              if (out.length === 0) {
                var sel = document.querySelectorAll('[data-testid=conversation-row-sidebar][data-selected=true]');
                for (var k = 0; k < sel.length; k++) add(sel[k].getAttribute('data-cascade-id'));
              }
              return out;
            })()`,
            returnByValue: true
          });
          const rawDetected = evalRes?.result?.result?.value;
          if (Array.isArray(rawDetected)) {
            const detectedIds = normalizeCascadeIdList(rawDetected);
            if (!hasExplicitSubscription || detectedIds.length > 0 || rawDetected.length === 0) {
              watchedCascadeIds = detectedIds;
              const keep = new Set(watchedCascadeIds);
              for (const k of perCascadeState.keys()) {
                if (!keep.has(k)) perCascadeState.delete(k);
              }
            }
          }
        }
        if (watchedCascadeIds.length === 0) return;

        const currentEndpoint = attachedTargets.get(target.id)?.endpoint || endpoint;
        const pendingUpdates = [];

        for (const cid of watchedCascadeIds) {
          let cState = perCascadeState.get(cid);
          if (!cState) {
            cState = { lastPushedHash: '', lastRenderedSig: '' };
            perCascadeState.set(cid, cState);
          }

          // 先在 Node 本地通过 statSync 检查 .db/.db-wal 与子 Agent 复合签名（兼容 Windows WSL 按需懒探测），未变化则 0 WebSocket 通信直接跳过
          const dbState = getDbState(cid, currentEndpoint);
          const conversationsDir = dbState?.dbPath ? path.dirname(dbState.dbPath) : '';
          const childSnap = conversationsDir
            ? getCompositeChildSnapshot(cid, conversationsDir, dbState.rawSig || dbState.sig)
            : null;
          const sig = childSnap?.sig || dbState?.sig || 'empty';
          const sessionKey = `${cid}@${sig}|${metricsConfigEpoch}`;
          const uncCoolingDown = Boolean(
            (dbState?.uncDeferred || childSnap?.uncBackoffActive) && Date.now() < wslUncBackoffUntil
          );
          if (
            !force &&
            ((!childSnap?.isDraining && !childSnap?.partialStale && sessionKey === cState.lastPushedHash) ||
              (uncCoolingDown && cState.lastRenderedSig !== ''))
          ) {
            continue;
          }

          const payload = parseConversationMetrics(cid, currentEndpoint, dbState, childSnap);
          if (!payload || payload.transientError) {
            if (force && payload?.cachedPayload) {
              pendingUpdates.push({ payload: payload.cachedPayload, isTransientFallback: true });
            }
            continue;
          }

          const renderedSig = `${payload.hasData ? '1' : '0'}\n${payload.inlineHtml || ''}\n${payload.tooltipHtml || ''}`;
          if (force || renderedSig !== cState.lastRenderedSig) {
            pendingUpdates.push({
              payload,
              state: cState,
              renderedSig,
              sessionKey,
              canCommitHash: !payload.isDraining && !payload.partialStale
            });
          } else if (!payload.isDraining && !payload.partialStale) {
            cState.lastPushedHash = sessionKey;
          } else {
            cState.lastPushedHash = '';
          }
        }

        if (pendingUpdates.length > 0) {
          const pushPayloads = pendingUpdates.map((u) => u.payload);
          const pushRes = await send('Runtime.evaluate', {
            expression: `if (typeof window.__ag_render_metrics === 'function') { for (const p of ${JSON.stringify(pushPayloads)}) { window.__ag_render_metrics(p); } }`,
            returnByValue: false
          });
          const pushOk = Boolean(pushRes && !pushRes.error && !pushRes.result?.exceptionDetails);
          if (pushOk) {
            for (const u of pendingUpdates) {
              if (u.isTransientFallback || !u.state) continue;
              u.state.lastRenderedSig = u.renderedSig;
              u.state.lastPushedHash = u.canCommitHash ? u.sessionKey : '';
            }
          }
        }
      };

      const checkAndInject = async () => {
        try {
          if (!hostConfirmed || nonHostSettled || ws.readyState !== WebSocket.OPEN) return;
          if (!isAllowedOrigin(currentTargetUrl)) {
            if (attachedTargets.get(target.id)?.ws === ws) {
              attachedTargets.delete(target.id);
              targetThemeModes.delete(target.id);
              targetDarkPresets.delete(target.id);
            }
            try {
              ws.close();
            } catch {}
            return;
          }
          if (isExemptInternalTarget({ type: target.type, url: currentTargetUrl })) {
            const checkRes = await send('Runtime.evaluate', {
              expression:
                '({ ok: window.__ag_patch_version === ' +
                JSON.stringify(cachedPatchVersion) +
                ' && (' +
                JSON.stringify(!activeConfig.enabled) +
                ' || (window.__ag_body_ready === true && !!document.getElementById("ag-custom-fonts"))), mode: ' +
                JSON.stringify(target.type === 'iframe' ? 'iframe' : 'page') +
                ' === "iframe" ? (window.__ag_host_theme_mode || null) : (window.__ag_resolved_theme_mode || null), darkPreset: ' +
                JSON.stringify(target.type === 'iframe' ? 'iframe' : 'page') +
                ' === "iframe" ? (window.__ag_host_dark_preset || window.__ag_runtime_dark_preset || (document.documentElement ? document.documentElement.getAttribute("data-ag-dark-preset") : null)) : (document.documentElement ? document.documentElement.getAttribute("data-ag-dark-preset") : null) })',
              returnByValue: true
            });
            const checkVal = checkRes?.result?.result?.value;
            if (!checkVal || checkVal.ok !== true) {
              await inject();
              await syncMetricsForSession(true);
            } else if (activeConfig.enabled && target.type === 'page') {
              if (checkVal.mode === 'dark' || checkVal.mode === 'light') {
                const prevMode = targetThemeModes.get(target.id);
                targetThemeModes.set(target.id, checkVal.mode);
                if (prevMode !== checkVal.mode) {
                  syncThemeToChildIframes(target.id, checkVal.mode);
                }
              }
              if (checkVal.darkPreset === 'claude-warm' || checkVal.darkPreset === 'onyx') {
                const prevDarkPreset = targetDarkPresets.get(target.id);
                targetDarkPresets.set(target.id, checkVal.darkPreset);
                if (prevDarkPreset !== checkVal.darkPreset) {
                  syncDarkPresetToChildIframes(target.id, checkVal.darkPreset);
                }
              }
            } else if (activeConfig.enabled && target.type === 'iframe') {
              const parentMode = resolveParentThemeMode(target, endpoint);
              const parentDarkPreset = resolveParentDarkPreset(target, endpoint);
              let needNewDocUpdate = !evalScriptId;
              if (parentMode && checkVal.mode !== parentMode) {
                await send('Runtime.evaluate', {
                  expression: `window.__ag_set_host_theme_mode && window.__ag_set_host_theme_mode(${JSON.stringify(parentMode)})`,
                  returnByValue: false
                });
                needNewDocUpdate = true;
              }
              if (parentDarkPreset && checkVal.darkPreset !== parentDarkPreset) {
                await send('Runtime.evaluate', {
                  expression: `window.__ag_set_host_dark_preset && window.__ag_set_host_dark_preset(${JSON.stringify(parentDarkPreset)})`,
                  returnByValue: false
                });
                needNewDocUpdate = true;
              }
              if (needNewDocUpdate) {
                await updateNewDocScript();
              }
            }
            return;
          }
          const checkRes = await send('Runtime.evaluate', {
            expression: `({
              injected: window.__ag_patch_version === ${JSON.stringify(cachedPatchVersion)} && (${JSON.stringify(!activeConfig.enabled)} || (window.__ag_body_ready === true && !!document.getElementById("ag-custom-fonts"))),
              skipNonHost: window.__ag_skip_non_host === true,
              kind: ${HOST_PROBE_EXPRESSION},
              mode: window.__ag_resolved_theme_mode || null,
              darkPreset: document.documentElement ? document.documentElement.getAttribute("data-ag-dark-preset") : null
            })`,
            returnByValue: true
          });
          const state = checkRes?.result?.result?.value;
          if (!state || typeof state !== 'object') return;
          if (state.skipNonHost || state.kind === 'non_host') {
            await markNonHostAndDetach(currentTargetUrl);
            return;
          }
          if (state.kind === 'pending') {
            return;
          }
          if (state.injected !== true) {
            await inject();
            await syncMetricsForSession(true);
          } else if (activeConfig.enabled && target.type === 'page') {
            if (!evalScriptId) {
              await updateNewDocScript();
            }
            if (state.mode === 'dark' || state.mode === 'light') {
              const prevMode = targetThemeModes.get(target.id);
              targetThemeModes.set(target.id, state.mode);
              if (prevMode !== state.mode) {
                syncThemeToChildIframes(target.id, state.mode);
              }
            }
            if (state.darkPreset === 'claude-warm' || state.darkPreset === 'onyx') {
              const prevDarkPreset = targetDarkPresets.get(target.id);
              targetDarkPresets.set(target.id, state.darkPreset);
              if (prevDarkPreset !== state.darkPreset) {
                syncDarkPresetToChildIframes(target.id, state.darkPreset);
              }
            }
          }
        } catch {}
      };

      let currentTargetUrl = String(target.url || '');
      let hostConfirmed = false;
      let nonHostSettled = false;
      let pendingProbe = false;
      let probingPending = false;
      let pendingRecheckQueued = false;
      let pendingRetryCount = 0;
      let pendingRetryTimer = null;
      let runtimeEnabled = false;
      let pageEnabled = false;
      let bindingsAdded = false;
      let initialAttachDone = false;
      let navDebounceTimer = null;
      let lastHardReloadAt = 0;

      const clearPendingTimer = () => {
        if (pendingRetryTimer) {
          clearTimeout(pendingRetryTimer);
          pendingRetryTimer = null;
        }
      };

      const probeHostKind = async () => {
        const res = await send('Runtime.evaluate', {
          expression: HOST_PROBE_EXPRESSION,
          returnByValue: true
        });
        const val = res?.result?.result?.value;
        return val === 'host' || val === 'non_host' || val === 'pending' ? val : 'pending';
      };

      const markNonHostAndDetach = async (reasonUrl = currentTargetUrl) => {
        if (nonHostSettled) return;
        nonHostSettled = true;
        pendingProbe = false;
        hostConfirmed = false;
        clearPendingTimer();
        if (navDebounceTimer) {
          clearTimeout(navDebounceTimer);
          navDebounceTimer = null;
        }
        const originKey = getTargetOriginKey(reasonUrl || target.url);
        if (originKey) {
          skippedNonHostTargets.set(target.id, { origin: originKey, skippedAt: Date.now() });
        }
        if (evalScriptId && ws.readyState === WebSocket.OPEN) {
          const idToRemove = evalScriptId;
          evalScriptId = null;
          try {
            await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: idToRemove });
          } catch {}
        }
        if (attachedTargets.get(target.id)?.ws === ws) {
          attachedTargets.delete(target.id);
          targetThemeModes.delete(target.id);
          targetDarkPresets.delete(target.id);
        }
        clearTimeout(attachTimeout);
        try {
          ws.close();
        } catch {}
        finishAttach(false);
      };

      const promoteToHost = async () => {
        if (hostConfirmed || nonHostSettled || ws.readyState !== WebSocket.OPEN) return false;
        hostConfirmed = true;
        pendingProbe = false;
        clearPendingTimer();
        const entry = attachedTargets.get(target.id);
        if (entry && entry.ws === ws) {
          entry.hostConfirmed = true;
        }
        console.log(`[Daemon] Attached target: ${target.id} (${target.title || 'Untitled'}) [${endpoint.channel}]`);
        if (!pageEnabled) {
          pageEnabled = true;
          await send('Page.enable');
        }
        if (!runtimeEnabled) {
          runtimeEnabled = true;
          await send('Runtime.enable');
        }
        if (ws.readyState !== WebSocket.OPEN || nonHostSettled) {
          finishAttach(false);
          return false;
        }
        if (!bindingsAdded) {
          bindingsAdded = true;
          await send('Runtime.addBinding', { name: '__agRequestMetrics' });
          if (target.type === 'page') {
            await send('Runtime.addBinding', { name: '__agRequestHardReload' });
            await send('Runtime.addBinding', { name: '__agSetDarkPreset' });
            await send('Runtime.addBinding', { name: '__agSyncHostThemeMode' });
          }
        }
        if (ws.readyState !== WebSocket.OPEN || nonHostSettled) {
          finishAttach(false);
          return false;
        }
        await updateNewDocScript(true);
        const ok = await inject();
        await syncMetricsForSession(true);
        initialAttachDone = true;
        clearTimeout(attachTimeout);
        finishAttach(ok);
        return ok;
      };

      const schedulePendingRetry = () => {
        clearPendingTimer();
        if (!pendingProbe || hostConfirmed || nonHostSettled || ws.readyState !== WebSocket.OPEN) return;
        if (pendingRetryCount >= 40) {
          pendingProbe = false;
          if (attachedTargets.get(target.id)?.ws === ws) {
            attachedTargets.delete(target.id);
            targetThemeModes.delete(target.id);
            targetDarkPresets.delete(target.id);
          }
          clearTimeout(attachTimeout);
          try {
            ws.close();
          } catch {}
          finishAttach(false);
          return;
        }
        pendingRetryCount += 1;
        pendingRetryTimer = setTimeout(() => {
          pendingRetryTimer = null;
          void recheckPendingHost();
        }, 200);
      };

      const recheckPendingHost = async () => {
        if (!pendingProbe || hostConfirmed || nonHostSettled || ws.readyState !== WebSocket.OPEN) return;
        if (probingPending) {
          pendingRecheckQueued = true;
          return;
        }
        probingPending = true;
        try {
          if (!isAllowedOrigin(currentTargetUrl)) {
            pendingProbe = false;
            clearPendingTimer();
            if (attachedTargets.get(target.id)?.ws === ws) {
              attachedTargets.delete(target.id);
              targetThemeModes.delete(target.id);
              targetDarkPresets.delete(target.id);
            }
            clearTimeout(attachTimeout);
            try {
              ws.close();
            } catch {}
            finishAttach(false);
            return;
          }
          if (isExemptInternalTarget({ type: target.type, url: currentTargetUrl })) {
            await promoteToHost();
            return;
          }
          const kind = await probeHostKind();
          if (ws.readyState !== WebSocket.OPEN || nonHostSettled || hostConfirmed) return;
          if (kind === 'host') {
            await promoteToHost();
          } else if (kind === 'non_host') {
            await markNonHostAndDetach(currentTargetUrl);
          } else if (!pendingRecheckQueued) {
            schedulePendingRetry();
          }
        } finally {
          probingPending = false;
          if (pendingRecheckQueued) {
            pendingRecheckQueued = false;
            if (pendingProbe && !hostConfirmed && !nonHostSettled && ws.readyState === WebSocket.OPEN) {
              void recheckPendingHost();
            }
          }
        }
      };

      ws.addEventListener('open', async () => {
        if (isExemptInternalTarget(target)) {
          await promoteToHost();
          return;
        }
        if (!runtimeEnabled) {
          runtimeEnabled = true;
          await send('Runtime.enable');
        }
        if (ws.readyState !== WebSocket.OPEN || nonHostSettled) return;
        const kind = await probeHostKind();
        if (ws.readyState !== WebSocket.OPEN || nonHostSettled) return;
        if (kind === 'host') {
          await promoteToHost();
          return;
        }
        if (kind === 'non_host') {
          await markNonHostAndDetach(currentTargetUrl);
          return;
        }
        pendingProbe = true;
        if (!pageEnabled) {
          pageEnabled = true;
          await send('Page.enable');
        }
        if (ws.readyState !== WebSocket.OPEN || nonHostSettled) return;
        await recheckPendingHost();
      });

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.id && pendingCallbacks.has(msg.id)) {
            const cb = pendingCallbacks.get(msg.id);
            pendingCallbacks.delete(msg.id);
            cb(msg);
            return;
          }
          if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agRequestMetrics') {
            if (!hostConfirmed) return;
            const parsedSub = parseMetricsSubscriptionPayload(msg.params.payload);
            if (parsedSub.valid) {
              watchedCascadeIds = parsedSub.ids;
              hasExplicitSubscription = true;
              const keep = new Set(watchedCascadeIds);
              for (const k of perCascadeState.keys()) {
                if (!keep.has(k)) perCascadeState.delete(k);
              }
              for (const cid of watchedCascadeIds) {
                const st = perCascadeState.get(cid);
                if (st) {
                  st.lastPushedHash = '';
                  st.lastRenderedSig = '';
                }
              }
              if (watchedCascadeIds.length > 0) {
                syncMetricsForSession(true, true);
              }
            }
            return;
          }
          if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agSyncHostThemeMode') {
            if (hostConfirmed && target.type === 'page' && activeConfig.enabled) {
              const mode = String(msg.params.payload || '').trim();
              if (mode === 'dark' || mode === 'light') {
                const prevMode = targetThemeModes.get(target.id);
                targetThemeModes.set(target.id, mode);
                if (prevMode !== mode) {
                  syncThemeToChildIframes(target.id, mode);
                }
              }
            }
            return;
          }
          if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agRequestHardReload') {
            if (
              !hostConfirmed ||
              target.type !== 'page' ||
              !activeConfig.enabled ||
              activeConfig.modules.deadlockHealer === false ||
              activeConfig.modules.coldBootHealer === false
            ) {
              return;
            }
            const now = Date.now();
            if (now - lastHardReloadAt < 60000) return;
            lastHardReloadAt = now;
            const reason = String(msg.params.payload || 'coldboot-drift').slice(0, 80);
            console.log(
              `[Daemon] Cold-boot embedded UI drift detected on target ${target.id} (${reason}), triggering ignoreCache reload`
            );
            send('Page.reload', { ignoreCache: true });
            return;
          }
          if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agSetDarkPreset') {
            if (!hostConfirmed || target.type !== 'page' || !activeConfig.enabled) {
              return;
            }
            syncDarkPresetToChildIframes(target.id, msg.params.payload);
            if (!SAFE_MODE) {
              persistDarkPresetToUserConfig(msg.params.payload);
            }
            return;
          }
          if (
            msg.method === 'Page.frameNavigated' &&
            (!msg.params?.frame?.parentId || msg.params.frame.id === target.id) &&
            msg.params?.frame?.url
          ) {
            currentTargetUrl = String(msg.params.frame.url);
            hasExplicitSubscription = false;
          }
          if (
            msg.method === 'Page.frameNavigated' ||
            msg.method === 'Page.loadEventFired' ||
            msg.method === 'Page.domContentEventFired'
          ) {
            if (!msg.params?.frame || !msg.params.frame.parentId || msg.params.frame.id === target.id) {
              if (pendingProbe && !hostConfirmed && !nonHostSettled) {
                void recheckPendingHost();
                return;
              }
              if (!initialAttachDone) return;
              if (navDebounceTimer) clearTimeout(navDebounceTimer);
              navDebounceTimer = setTimeout(() => {
                navDebounceTimer = null;
                checkAndInject();
              }, 120);
            }
          }
        } catch {}
      });

      const closeHandler = () => {
        clearTimeout(attachTimeout);
        clearPendingTimer();
        pendingProbe = false;
        if (navDebounceTimer) {
          clearTimeout(navDebounceTimer);
          navDebounceTimer = null;
        }
        for (const [, cb] of pendingCallbacks) cb(null);
        pendingCallbacks.clear();
        if (attachedTargets.get(target.id)?.ws === ws) {
          attachedTargets.delete(target.id);
          targetThemeModes.delete(target.id);
          targetDarkPresets.delete(target.id);
        }
        finishAttach(false);
      };
      ws.addEventListener('close', closeHandler);
      ws.addEventListener('error', closeHandler);

      attachedTargets.set(target.id, {
        ws,
        type: target.type,
        parentId: target.parentId || null,
        send,
        updateNewDocScript,
        inject,
        checkAndInject,
        syncMetricsForSession,
        endpoint,
        get hostConfirmed() {
          return hostConfirmed;
        },
        set hostConfirmed(v) {
          hostConfirmed = Boolean(v);
        },
        updateTargetUrl: (u) => {
          if (u) currentTargetUrl = String(u);
        },
        setActiveCascade: (cid) => {
          const ids = normalizeCascadeIdList(cid);
          watchedCascadeIds = ids;
          hasExplicitSubscription = ids.length > 0;
          perCascadeState.clear();
        }
      });
    } catch {
      clearTimeout(attachTimeout);
      finishAttach(false);
    }
  });
}

let isSyncing = false;
let syncTickCount = 0;
let lastZhPatchSig = '';
let isZhPatchRunning = false;
let isZhStatusProbing = false;
let hasProbedZhLiveOnce = false;
let cachedWorkingPython = undefined;
let zhPatchFailedSig = '';
let zhPatchFailCount = 0;

function probeZhTitleLiveState(pyBin, scriptPath) {
  if (SAFE_MODE || process.platform !== 'darwin' || isZhStatusProbing || !pyBin || !scriptPath) return;
  isZhStatusProbing = true;
  const child = execFile(pyBin, [scriptPath, 'status', '--json'], { timeout: 8000 }, (err, stdout) => {
    isZhStatusProbing = false;
    hasProbedZhLiveOnce = true;
    if (err) return;
    try {
      const records = JSON.parse(String(stdout || '').trim());
      if (!Array.isArray(records) || records.length === 0) return;
      const activeRecs = records.filter((r) => r && !r.disabled);
      if (activeRecs.length === 0) {
        setZhTitleStatus('ok');
        return;
      }
      if (activeRecs.some((r) => r.diskState === 'PATCHED' && r.liveState === 'STALE_RUNNING_INODE')) {
        setZhTitleStatus(
          'stale_inode',
          '中文标题补丁待重载生效',
          '磁盘补丁已自动修补完毕，但运行中服务仍挂载更新前旧镜像。可在对话空闲时重启客户端，或在终端执行下方命令热重载（热重载会刷新窗口）：',
          'python3 ~/.gemini/antigravity/scripts/antigravity-zh-title-patch.py reload-hub'
        );
        return;
      }
      if (activeRecs.every((r) => r.diskState === 'PATCHED')) {
        setZhTitleStatus('ok');
      }
    } catch {
      // 旧版脚本尚不支持 status --json 时静默兼容降级
    }
  });
  try {
    child.stdin?.end();
  } catch {}
}

function resolveWorkingPython3() {
  if (cachedWorkingPython !== undefined) return cachedWorkingPython;
  const candidates = [
    '/opt/homebrew/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/Current/bin/python3',
    '/usr/local/bin/python3',
    'python3'
  ];
  for (const bin of candidates) {
    if (bin.startsWith('/') && !fs.existsSync(bin)) continue;
    try {
      const res = spawnSync(bin, ['-c', 'import sys; sys.exit(0)'], {
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
      if (res.status === 0) {
        cachedWorkingPython = bin;
        return bin;
      }
    } catch {}
  }
  cachedWorkingPython = null;
  return null;
}

function ensureZhTitlePatchIfPresent() {
  if (SAFE_MODE || process.platform !== 'darwin' || isZhPatchRunning) return;
  const scriptPath = path.join(os.homedir(), '.gemini/antigravity/scripts/antigravity-zh-title-patch.py');
  if (!fs.existsSync(scriptPath)) return;
  const disabledMarkerPath = path.join(os.homedir(), '.gemini/antigravity/scripts/backups/zh-title/DISABLED');
  const lsBins = [
    '/Applications/Antigravity.app/Contents/Resources/bin/language_server',
    '/Applications/Antigravity - Insiders.app/Contents/Resources/bin/language_server'
  ];
  const computeZhSig = () => {
    const scriptSig = getFileMtimeSig(scriptPath);
    const disabledSig = getFileMtimeSig(disabledMarkerPath);
    const binSig = lsBins
      .map((p) => {
        const st = fs.statSync(p, { throwIfNoEntry: false });
        return st ? `${p}:${st.mtimeMs}:${st.size}` : '';
      })
      .join('|');
    return binSig ? `script:${scriptSig}|disabled:${disabledSig}|${binSig}` : '';
  };
  const sig = computeZhSig();
  if (!sig) return;
  if (fs.existsSync(disabledMarkerPath)) {
    lastZhPatchSig = sig;
    setZhTitleStatus('ok');
    return;
  }
  if (sig === lastZhPatchSig) {
    if (!hasProbedZhLiveOnce || zhTitleStatus.state === 'stale_inode') {
      const pyProbe = resolveWorkingPython3();
      if (pyProbe) probeZhTitleLiveState(pyProbe, scriptPath);
    }
    return;
  }
  if (sig === zhPatchFailedSig && zhPatchFailCount >= 3) return;

  const pyBin = resolveWorkingPython3();
  if (!pyBin) {
    zhPatchFailedSig = sig;
    zhPatchFailCount = 3;
    console.error('[Daemon] No working python3 interpreter found (Xcode license or PATH issue); skipping zh-title auto-patch.');
    return;
  }

  isZhPatchRunning = true;
  const child = execFile(pyBin, [scriptPath, 'patch', '--auto'], { timeout: 25000 }, (err, stdout, stderr) => {
    isZhPatchRunning = false;
    const outStr = String(stdout || '').trim();
    const errStr = String(stderr || '').trim();
    if (err) {
      if (
        err.code === 3 ||
        outStr.includes('[PERM_DENIED]') ||
        /Operation not permitted|PermissionError/i.test(errStr) ||
        /Operation not permitted|PermissionError/i.test(outStr)
      ) {
        zhPatchFailedSig = sig;
        zhPatchFailCount = 3;
        setZhTitleStatus(
          'tcc_blocked',
          '中文标题补丁待终端授权',
          '客户端更新后，macOS「App 管理」权限拦截了后台自动修补。请在已授权该权限的终端执行下方命令（可在「系统设置 → 隐私与安全性 → App 管理」为终端开启权限）：',
          'python3 ~/.gemini/antigravity/scripts/antigravity-zh-title-patch.py patch --reload-hub'
        );
        console.log(
          '[Daemon] zh-title auto-patch skipped (macOS App Management TCC blocks background LaunchAgent write; run `python3 ~/.gemini/antigravity/scripts/antigravity-zh-title-patch.py patch --reload-hub` in an authorized terminal).'
        );
        return;
      }
      if (zhPatchFailedSig !== sig) {
        zhPatchFailedSig = sig;
        zhPatchFailCount = 1;
      } else {
        zhPatchFailCount += 1;
      }
      console.error(
        `[Daemon] zh-title auto-patch failed (${zhPatchFailCount}/3): ${err.message} ${errStr}`
      );
      return;
    }
    zhPatchFailedSig = '';
    zhPatchFailCount = 0;
    lastZhPatchSig = computeZhSig();
    if (outStr.includes('中文标题补丁写入磁盘成功') || outStr.includes('中文标题补丁注入成功')) {
      console.log('[Daemon] Auto-applied zh-title patch:', outStr.split('\n')[0]);
    } else if (outStr.includes('DISABLED')) {
      console.log('[Daemon] zh-title auto-patch skipped (DISABLED marker present).');
      setZhTitleStatus('ok');
      return;
    }
    probeZhTitleLiveState(pyBin, scriptPath);
  });
  try {
    child.stdin?.end();
  } catch {}
}

const fallbackBackoffUntil = new Map();
const CDP_RELAUNCH_GUARD_FILE = path.join(os.tmpdir(), 'ag-cdp-relaunch-guard.json');
const ignoredUnflaggedHostPids = new Set();
const exemptedHostPidByChannel = new Map();
const knownNonHostPids = new Set();
const NON_HOST_CMD_RE = /--type=|--crashpad|--utility-sub-type=|--import=|sidecar_sdk|--ms-enable-electron-run-as-node/i;
let isCdpRelaunching = false;

function parsePosixEtimeSeconds(raw) {
  const s = String(raw || '').trim();
  if (!s) return Infinity;
  let days = 0;
  let rest = s;
  const dashIdx = s.indexOf('-');
  if (dashIdx !== -1) {
    days = parseInt(s.slice(0, dashIdx), 10);
    if (!Number.isFinite(days)) return Infinity;
    rest = s.slice(dashIdx + 1);
  }
  const parts = rest.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n))) return Infinity;
  if (parts.length === 3) return days * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return days * 86400 + parts[0] * 60 + parts[1];
  if (parts.length === 1) return days * 86400 + parts[0];
  return Infinity;
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
}

function pruneIgnoredHostPids() {
  for (const pid of Array.from(ignoredUnflaggedHostPids)) {
    if (!isPidAlive(pid)) {
      ignoredUnflaggedHostPids.delete(pid);
    }
  }
  for (const [ch, pid] of Array.from(exemptedHostPidByChannel.entries())) {
    if (!isPidAlive(pid)) {
      exemptedHostPidByChannel.delete(ch);
    }
  }
  if (knownNonHostPids.size > 0) {
    for (const pid of Array.from(knownNonHostPids)) {
      if (!isPidAlive(pid)) {
        knownNonHostPids.delete(pid);
      }
    }
  }
}

function probeRunningHostProcesses(channelMode = 'auto', endpoints = []) {
  const allowStable = channelMode !== 'insiders';
  const allowInsiders = channelMode !== 'stable';

  if (process.platform === 'darwin') {
    const res = spawnSync('ps', ['-axo', 'pid=,etime=,command='], {
      encoding: 'utf8',
      timeout: 2500
    });
    if (res.status !== 0 || !res.stdout) return [];
    const found = [];
    for (const line of String(res.stdout).split(/\r?\n/)) {
      const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
      if (!m) continue;
      const pid = parseInt(m[1], 10);
      const etimeRaw = m[2];
      const cmd = m[3];
      if (!pid || NON_HOST_CMD_RE.test(cmd) || /Helper(?:\s|\.|\/)/i.test(cmd)) continue;
      const appMatch = cmd.match(/^(\S.*?\/Antigravity(?:\s-\sInsiders)?\.app)\/Contents\/MacOS\/(Antigravity(?:\s-\sInsiders)?)(?:\s|$)/);
      if (!appMatch) continue;
      const appPath = appMatch[1];
      const binName = appMatch[2];
      const ch = /Insiders/i.test(binName) ? 'insiders' : 'stable';
      if ((ch === 'stable' && !allowStable) || (ch === 'insiders' && !allowInsiders)) continue;
      found.push({
        pid,
        channel: ch,
        elapsedSec: parsePosixEtimeSeconds(etimeRaw),
        appPath,
        exePath: `${appPath}/Contents/MacOS/${binName}`,
        cmd,
        hasCdpFlag: /--remote-debugging-port(?:=|\s|$)/.test(cmd),
        hasUpdatedFlag: /--updated(?:\s|$)/.test(cmd)
      });
    }
    return found;
  }

  if (process.platform === 'win32') {
    // 双层零开销预筛：
    // 1) 若某通道已存在活跃 DevToolsActivePort，或该通道已豁免的无参宿主主进程 PID 仍存活（SingletonLock 保证单通道唯一主进程），直接 O(1) 内存级跳过（0 tasklist + 0 PowerShell）；
    // 2) 仅对尚未锁定的通道调用原生 C++ tasklist 检查是否存在未见过的 PID，并对渲染/GPU/Utility/sidecar_sdk 同名子进程记入 knownNonHostPids 防止重复唤醒 PowerShell。
    const imageSpecs = [];
    const stableEp = endpoints.find((ep) => ep.channel === 'stable');
    const insidersEp = endpoints.find((ep) => ep.channel === 'insiders');
    const stableExemptPid = exemptedHostPidByChannel.get('stable');
    const insidersExemptPid = exemptedHostPidByChannel.get('insiders');
    if (allowStable && !(stableEp && readPort(stableEp.portFile)) && !(stableExemptPid && isPidAlive(stableExemptPid))) {
      imageSpecs.push({ channel: 'stable', img: 'Antigravity.exe' });
    }
    if (
      allowInsiders &&
      insidersEp &&
      insidersEp.channelInstalled &&
      !readPort(insidersEp.portFile) &&
      !(insidersExemptPid && isPidAlive(insidersExemptPid))
    ) {
      imageSpecs.push({ channel: 'insiders', img: 'Antigravity - Insiders.exe' });
    }
    if (imageSpecs.length === 0) return [];

    const candidatePids = [];
    for (const { img } of imageSpecs) {
      const tl = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${img}`, '/FO', 'CSV', '/NH'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 2500
      });
      if (tl.status === 0 && tl.stdout) {
        for (const row of String(tl.stdout).split(/\r?\n/)) {
          const cm = row.trim().match(/^"([^"]+)","(\d+)"/);
          if (cm && cm[1].toLowerCase() === img.toLowerCase()) {
            const p = parseInt(cm[2], 10);
            if (p > 0 && !ignoredUnflaggedHostPids.has(p) && !knownNonHostPids.has(p)) {
              candidatePids.push(p);
            }
          }
        }
      }
    }
    if (candidatePids.length === 0) return [];

    const psCmd = [
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
      `$ErrorActionPreference = 'SilentlyContinue'`,
      `$now = [DateTime]::UtcNow`,
      `$procs = Get-CimInstance Win32_Process -Filter "Name = 'Antigravity.exe' OR Name = 'Antigravity - Insiders.exe'"`,
      `$hostOut = @(); $nonHostPids = @()`,
      `foreach ($p in $procs) {`,
      `  $pidVal = [int]$p.ProcessId`,
      `  $cmd = [string]$p.CommandLine`,
      `  if ($cmd -match '--type=|--crashpad|--utility-sub-type=|--import=|sidecar_sdk|--ms-enable-electron-run-as-node') { $nonHostPids += $pidVal; continue }`,
      `  $age = if ($p.CreationDate) { [Math]::Max(0, [int][Math]::Round(($now - ([DateTime]$p.CreationDate).ToUniversalTime()).TotalSeconds)) } else { 999999 }`,
      `  $hostOut += @{ pid = $pidVal; name = [string]$p.Name; exe = [string]$p.ExecutablePath; cmd = $cmd; elapsedSec = $age }`,
      `}`,
      `@{ hosts = $hostOut; nonHostPids = $nonHostPids } | ConvertTo-Json -Compress -Depth 4`
    ].join('\n');
    const cim = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 5000
    });
    if (cim.status !== 0 || !cim.stdout || !cim.stdout.trim()) return [];
    let parsedHosts = [];
    try {
      const payload = JSON.parse(cim.stdout.trim());
      const nonHosts = Array.isArray(payload?.nonHostPids)
        ? payload.nonHostPids
        : payload?.nonHostPids
        ? [payload.nonHostPids]
        : [];
      for (const np of nonHosts) {
        const n = Number(np);
        if (n > 0) knownNonHostPids.add(n);
      }
      const rawHosts = payload?.hosts;
      parsedHosts = Array.isArray(rawHosts) ? rawHosts : rawHosts ? [rawHosts] : [];
    } catch {
      return [];
    }
    return parsedHosts
      .map((item) => {
        const ch = /insiders/i.test(item.name || item.exe || '') ? 'insiders' : 'stable';
        const cmd = String(item.cmd || '');
        const hasCdpFlag = /--remote-debugging-port(?:=|\s|$)/i.test(cmd);
        const pidNum = Number(item.pid) || 0;
        if (hasCdpFlag && pidNum > 0) {
          knownNonHostPids.add(pidNum);
        }
        return {
          pid: pidNum,
          channel: ch,
          elapsedSec: Number.isFinite(Number(item.elapsedSec)) ? Number(item.elapsedSec) : Infinity,
          appPath: '',
          exePath: String(item.exe || ''),
          cmd,
          hasCdpFlag,
          hasUpdatedFlag: /--updated(?:\s|$)/i.test(cmd)
        };
      })
      .filter(
        (p) =>
          p.pid > 0 &&
          p.exePath &&
          ((p.channel === 'stable' && allowStable) || (p.channel === 'insiders' && allowInsiders))
      );
  }

  if (process.platform === 'linux') {
    const res = spawnSync('ps', ['-axo', 'pid=,etime=,command='], {
      encoding: 'utf8',
      timeout: 2500
    });
    if (res.status !== 0 || !res.stdout) return [];
    const found = [];
    for (const line of String(res.stdout).split(/\r?\n/)) {
      const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
      if (!m) continue;
      const pid = parseInt(m[1], 10);
      const etimeRaw = m[2];
      const cmd = m[3];
      if (!pid || NON_HOST_CMD_RE.test(cmd) || /daemon\.mjs|install\.mjs/.test(cmd)) continue;
      const binMatch = cmd.match(/^(\/\S*\/antigravity(?:-insiders)?)(?:\s|$)/i);
      if (!binMatch) continue;
      const exePath = binMatch[1];
      const ch = /insiders/i.test(exePath) ? 'insiders' : 'stable';
      if ((ch === 'stable' && !allowStable) || (ch === 'insiders' && !allowInsiders)) continue;
      found.push({
        pid,
        channel: ch,
        elapsedSec: parsePosixEtimeSeconds(etimeRaw),
        appPath: '',
        exePath,
        cmd,
        hasCdpFlag: /--remote-debugging-port(?:=|\s|$)/.test(cmd),
        hasUpdatedFlag: /--updated(?:\s|$)/.test(cmd)
      });
    }
    return found;
  }

  return [];
}

function hasActiveConversationWalWrite(endpoint, windowSec = 15) {
  if (!endpoint) return false;
  const dirs = [endpoint.conversationsDir].filter(Boolean);
  if (process.platform === 'win32') {
    const cachedWsl = wslDirsCache.get(path.join(path.dirname(endpoint.portFile || ''), 'wsl_state.json'));
    if (cachedWsl && Array.isArray(cachedWsl.dirs)) {
      dirs.push(...cachedWsl.dirs);
    }
  }
  const now = Date.now();
  const windowMs = windowSec * 1000;
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.db-wal')) continue;
        const st = fs.statSync(path.join(dir, name), { throwIfNoEntry: false });
        if (st && st.size > 4096 && now - st.mtimeMs < windowMs) {
          return true;
        }
      }
    } catch {}
  }
  return false;
}

function maybeAutoRelaunchColdStartWithoutCdp() {
  if (
    SAFE_MODE ||
    RUN_ONCE ||
    isCdpRelaunching ||
    !activeConfig.enabled ||
    activeConfig.modules?.cdpAutoRelaunch === false
  ) {
    return false;
  }

  pruneIgnoredHostPids();
  const hostProcs = probeRunningHostProcesses(activeConfig.channel, activeConfig.endpoints);
  if (hostProcs.length === 0) return false;

  for (const proc of hostProcs) {
    if (proc.hasCdpFlag) continue;
    if (ignoredUnflaggedHostPids.has(proc.pid)) continue;

    const ep = activeConfig.endpoints.find((e) => e.channel === proc.channel) || activeConfig.endpoints[0];
    if (ep && readPort(ep.portFile)) continue;

    const maxWindowSec = proc.hasUpdatedFlag ? 25 : 12;
    if (proc.elapsedSec > maxWindowSec) {
      ignoredUnflaggedHostPids.add(proc.pid);
      exemptedHostPidByChannel.set(proc.channel, proc.pid);
      const msg = `[Daemon] Detected running Antigravity (${proc.channel}, PID ${proc.pid}, uptime ${proc.elapsedSec}s) started without --remote-debugging-port; skipping auto-relaunch to protect active session. Run \`node ${path.join(ROOT_DIR, 'install.mjs')} relaunch\` when idle.`;
      console.log(msg);
      logDaemonEvent(msg);
      continue;
    }

    if (hasActiveConversationWalWrite(ep, 15)) {
      ignoredUnflaggedHostPids.add(proc.pid);
      exemptedHostPidByChannel.set(proc.channel, proc.pid);
      const msg = `[Daemon] Skipped cold-start auto-relaunch for PID ${proc.pid}: active conversation WAL write detected within 15s.`;
      console.log(msg);
      logDaemonEvent(msg);
      continue;
    }

    const guard = readJsonSafe(CDP_RELAUNCH_GUARD_FILE, {});
    const handledPids = Array.isArray(guard.handledPids) ? guard.handledPids.map((n) => Number(n)).filter(Boolean) : [];
    const lastAt = Number(guard.lastRelaunchAtMs) || 0;
    if (handledPids.includes(proc.pid) || Date.now() - lastAt < 60000) {
      ignoredUnflaggedHostPids.add(proc.pid);
      exemptedHostPidByChannel.set(proc.channel, proc.pid);
      logDaemonEvent(
        `Skipped cold-start auto-relaunch for PID ${proc.pid}: guard cooldown active (lastRelaunchDeltaMs=${Date.now() - lastAt}).`
      );
      continue;
    }

    isCdpRelaunching = true;
    try {
      ignoredUnflaggedHostPids.add(proc.pid);
      const nextGuard = {
        lastRelaunchAtMs: Date.now(),
        lastChannel: proc.channel,
        lastOldPid: proc.pid,
        reason: proc.hasUpdatedFlag ? 'cold-start-post-update' : 'cold-start-unflagged',
        handledPids: Array.from(new Set([...handledPids.slice(-15), proc.pid]))
      };
      try {
        fs.writeFileSync(CDP_RELAUNCH_GUARD_FILE, `${JSON.stringify(nextGuard, null, 2)}\n`, 'utf8');
      } catch {}

      // 终止刚冷启动的无标记主进程，并严格等待其优雅刷盘释放 SingletonLock 后再拉起带 --remote-debugging-port=0 的新进程
      if (process.platform === 'win32') {
        const stopPs = [
          `$gp = Get-Process -Id ${proc.pid} -ErrorAction SilentlyContinue`,
          `if ($gp) { [void]$gp.CloseMainWindow(); if (-not $gp.WaitForExit(1800)) { Stop-Process -Id ${proc.pid} -Force -ErrorAction SilentlyContinue } }`
        ].join('; ');
        spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', stopPs], {
          windowsHide: true,
          stdio: 'ignore',
          timeout: 4500
        });
      } else {
        try {
          process.kill(proc.pid, 'SIGTERM');
        } catch {}
      }

      for (let i = 0; i < 55; i++) {
        if (!isPidAlive(proc.pid)) break;
        sleepSync(80);
      }
      if (isPidAlive(proc.pid) && process.platform !== 'win32') {
        try {
          process.kill(proc.pid, 'SIGKILL');
        } catch {}
        for (let i = 0; i < 15 && isPidAlive(proc.pid); i++) {
          sleepSync(60);
        }
      }
      // 预留极短排空窗口确保 Electron SingletonLock 文件句柄完全释放
      sleepSync(180);

      if (process.platform === 'darwin' && proc.appPath) {
        spawnSync('/usr/bin/open', ['-a', proc.appPath, '--args', '--remote-debugging-port=0'], {
          stdio: 'ignore',
          timeout: 5000
        });
      } else if (proc.exePath) {
        const child = spawn(proc.exePath, ['--remote-debugging-port=0'], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        });
        child.unref();
      }

      const okMsg = `[Daemon] Cold-start auto-relaunched Antigravity (${proc.channel}, old PID ${proc.pid}, age ${proc.elapsedSec}s) with --remote-debugging-port=0.`;
      console.log(okMsg);
      logDaemonEvent(okMsg);
      return true;
    } catch (err) {
      logDaemonEvent(`Cold-start auto-relaunch error for PID ${proc.pid}: ${err?.message || err}`);
    } finally {
      isCdpRelaunching = false;
    }
  }
  return false;
}

function trimPosixDaemonLogsIfNeeded() {
  if (process.platform === 'win32') return;
  const maxBytes = 262144; // 256 KB
  const keepBytes = 65536; // 64 KB
  for (const logPath of ['/tmp/antigravity-font-daemon.log', '/tmp/antigravity-font-daemon.err']) {
    try {
      const st = fs.statSync(logPath, { throwIfNoEntry: false });
      if (!st || st.size <= maxBytes) continue;
      const buf = fs.readFileSync(logPath);
      let sliceStart = Math.max(0, buf.length - keepBytes);
      const nlIdx = buf.indexOf(10, sliceStart);
      if (nlIdx !== -1 && nlIdx + 1 < buf.length) {
        sliceStart = nlIdx + 1;
      }
      // 原位截断覆写以保留相同 inode，兼容 LaunchAgent O_APPEND 重定向句柄
      fs.writeFileSync(logPath, buf.subarray(sliceStart));
    } catch {}
  }
}

async function sync() {
  checkPidFileOwnership();
  if (isSyncing) return;
  isSyncing = true;
  syncTickCount = (syncTickCount + 1) % 6000;
  try {
    if (syncTickCount % 12 === 1) ensureZhTitlePatchIfPresent();
    if (syncTickCount % 24 === 1) trimPosixDaemonLogsIfNeeded();
    const bundleChanged = rebuildBundleIfNeeded();
    if (!activeConfig.enabled) {
      targetThemeModes.clear();
      targetDarkPresets.clear();
    }
    const shouldHeartbeatCheck = bundleChanged || syncTickCount % 6 === 1;

    const activeTargetIds = new Set();
    const seenRawTargetIds = new Set();
    const pendingPages = [];
    const pendingIframes = [];

    const probedPorts = new Set();
    const nowMs = Date.now();
    for (const endpoint of activeConfig.endpoints) {
      let port = readPort(endpoint.portFile);
      let targets = [];
      if (port && !probedPorts.has(port)) {
        probedPorts.add(port);
        targets = await fetchTargets(port);
      }
      if (
        targets.length === 0 &&
        endpoint.channelInstalled !== false &&
        endpoint.fallbackPort &&
        !probedPorts.has(endpoint.fallbackPort) &&
        (RUN_ONCE || nowMs >= (fallbackBackoffUntil.get(endpoint.fallbackPort) || 0))
      ) {
        probedPorts.add(endpoint.fallbackPort);
        targets = await fetchTargets(endpoint.fallbackPort);
        if (targets.length === 0) {
          fallbackBackoffUntil.set(endpoint.fallbackPort, nowMs + 10000);
        } else {
          fallbackBackoffUntil.delete(endpoint.fallbackPort);
        }
      }
      if (targets.length === 0) continue;

      for (const t of targets) {
        if (!t?.id) continue;
        seenRawTargetIds.add(t.id);
        targetMetaMap.set(t.id, { type: t.type, parentId: t.parentId || null, channel: endpoint.channel });
        const skipped = skippedNonHostTargets.get(t.id);
        if (skipped && (!isAllowedOrigin(t.url) || getTargetOriginKey(t.url) !== skipped.origin)) {
          skippedNonHostTargets.delete(t.id);
        }
      }

      const pages = targets.filter(
        (t) =>
          (t.type === 'page' || (t.type === 'iframe' && String(t.url || '').startsWith('plugin://swarm--'))) &&
          t.webSocketDebuggerUrl &&
          !String(t.url || '').startsWith('devtools://') &&
          isAllowedOrigin(t.url) &&
          !String(t.title || '').includes('Launchpad') &&
          skippedNonHostTargets.get(t.id)?.origin !== getTargetOriginKey(t.url)
      );

      for (const page of pages) {
        activeTargetIds.add(page.id);
        if (page.type === 'iframe') {
          pendingIframes.push({ page, endpoint });
        } else {
          pendingPages.push({ page, endpoint });
        }
      }
    }

    const syncTargetBatch = async (items) => {
      const attachPromises = [];
      for (const { page, endpoint } of items) {
        if (!attachedTargets.has(page.id)) {
          attachPromises.push(attachTarget(page, endpoint));
        } else {
          const entry = attachedTargets.get(page.id);
          entry.endpoint = endpoint;
          entry.parentId = page.parentId || entry.parentId || null;
          entry.updateTargetUrl?.(page.url);
          if (entry.hostConfirmed) {
            if (bundleChanged && entry.updateNewDocScript) {
              await entry.updateNewDocScript();
            }
            if (shouldHeartbeatCheck && entry.checkAndInject) await entry.checkAndInject();
            if (entry.syncMetricsForSession) await entry.syncMetricsForSession(bundleChanged);
          }
        }
      }
      if (attachPromises.length > 0) {
        await Promise.allSettled(attachPromises);
      }
    };

    // 先同步宿主 page 目标以获取权威深浅色状态，再同步子 Swarm iframe（确保 --once 与冷启动零闪烁）
    await syncTargetBatch(pendingPages);
    await syncTargetBatch(pendingIframes);

    // 2.33.0+ 冷启动无标记自愈（M2）：仅在 0 活跃 CDP 目标时按严苛冷启动时间窗探测并自动接力重启
    if (pendingPages.length === 0 && attachedTargets.size === 0) {
      maybeAutoRelaunchColdStartWithoutCdp();
    }

    // 清理已关闭的目标连接
    for (const [id, entry] of attachedTargets.entries()) {
      if (!activeTargetIds.has(id)) {
        try {
          entry.ws.close();
        } catch {}
        attachedTargets.delete(id);
        targetThemeModes.delete(id);
        targetDarkPresets.delete(id);
      }
    }
    if (seenRawTargetIds.size > 0) {
      for (const id of skippedNonHostTargets.keys()) {
        if (!seenRawTargetIds.has(id)) {
          skippedNonHostTargets.delete(id);
        }
      }
      for (const id of targetMetaMap.keys()) {
        if (!seenRawTargetIds.has(id)) {
          targetMetaMap.delete(id);
        }
      }
    } else if (attachedTargets.size === 0) {
      targetMetaMap.clear();
    }
  } finally {
    isSyncing = false;
  }
}

console.log(
  `[Antigravity Daemon] Started (${cachedPatchVersion}) | channel=${activeConfig.channel} | sqlite=${!!DatabaseSync} | safeMode=${SAFE_MODE}`
);

await sync();
if (RUN_ONCE) {
  for (const [, entry] of attachedTargets.entries()) {
    try {
      entry.ws.close();
    } catch {}
  }
  process.exit(0);
} else {
  setInterval(sync, 2500);
}
