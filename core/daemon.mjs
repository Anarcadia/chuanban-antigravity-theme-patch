#!/usr/bin/env node
/**
 * chuanban-antigravity-theme-patch · CDP Theme & Live Metrics Daemon (core/daemon.mjs)
 *
 * 架构特性（v5.2.0）：
 * 1. 动态 Node 分级：
 *    - Node >= 22.0：完整启用昼夜双模式独立主题（暖纸浅色 + 官方 onyx 深色）、四层字体、输入框三态、1630条母语级汉化、死锁与冷启动兜底包自愈及 2.32.0/2.31.2 curtainView/Swarm 适配。
 *    - Node >= 22.13：动态 `await import('node:sqlite')` 解锁底部实时会话指标胶囊（O(1) 增量尾行解析）；低版本优雅降级绝不崩溃。
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
import { execFile, spawnSync } from 'node:child_process';
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
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
let wslUncBackoffUntil = 0;

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
      (!cached.distro ||
        (cached.dirs.length > 0 && now - cached.probedAt < 60000) ||
        now - cached.probedAt < 15000)
    ) {
      return cached.dirs;
    }

    const wslState = fileSig !== '0:0' ? readJsonSafe(wslStatePath, {}) : {};
    const persistedDistro = String(wslState?.distro || wslState?.distroName || wslState?.defaultDistro || '').trim();
    const rawDistro = persistedDistro || envDistro;
    if (!rawDistro || !/^[A-Za-z0-9._-]+$/.test(rawDistro)) {
      wslDirsCache.set(wslStatePath, { sig: compositeSig, distro: '', dirs: [], probedAt: now });
      return [];
    }

    const t0 = Date.now();
    const subParts = geminiSubDir.split('/');
    const found = [];
    for (const uncHost of ['wsl.localhost', 'wsl$']) {
      const distroRoot = `\\\\${uncHost}\\${rawDistro}`;
      if (!fs.existsSync(distroRoot)) {
        if (Date.now() - t0 > 400) break;
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
      if (found.length > 0 || Date.now() - t0 > 400) break;
    }
    if (Date.now() - t0 > 400) {
      wslUncBackoffUntil = Date.now() + 45000;
    }
    const uniqueDirs = Array.from(new Set(found));
    wslDirsCache.set(wslStatePath, { sig: compositeSig, distro: rawDistro, dirs: uniqueDirs, probedAt: Date.now() });
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
const BASE_VERSION = '20261114-v5.2.0';
let cachedBundleSig = '';
let cachedInjectScript = '';
let cachedPatchVersion = '';
let metricsConfigEpoch = 0;
const metricsCache = new Map(); // dbPath -> { sig, payload }
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
  contextLimit: 256000,
  contextLimitOverride: 0,
  modules: {
    i18n: true,
    metrics: true,
    composerWaxSeal: true,
    deadlockHealer: true,
    coldBootHealer: true,
    zoomShortcuts: true,
    customCss: true,
    customJs: true
  },
  themeVars: {},
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
  const rawCtxLimit = Number(userCfg.contextLimit);
  const contextLimit = Number.isFinite(rawCtxLimit) && rawCtxLimit > 0 ? rawCtxLimit : 256000;
  const rawCtxOverride = Number(userCfg.contextLimitOverride);
  const contextLimitOverride = Number.isFinite(rawCtxOverride) && rawCtxOverride > 0 ? rawCtxOverride : 0;
  if (
    activeConfig &&
    (contextLimit !== activeConfig.contextLimit || contextLimitOverride !== activeConfig.contextLimitOverride)
  ) {
    metricsCache.clear();
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
    contextLimit,
    contextLimitOverride,
    modules,
    themeVars,
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
    .update(JSON.stringify({ preset, modules, themeVars, selectors: activeConfig.selectors, hostThemeMode }))
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
    cssText: baseCss,
    customCss,
    themeVars,
    i18nDict: mergedDict,
    modules,
    selectors: activeConfig.selectors,
    config: {
      enabled,
      channel,
      preset,
      contextLimit,
      contextLimitOverride,
      modules,
      themeVars
    },
    customJs
  };

  cachedInjectScript = runtimeTemplate.replace('})(__AG_BOOT_PAYLOAD__);', () => `})(${JSON.stringify(bootPayload)});`);
  cachedBundleSig = sig;
  return true;
}

rebuildBundleIfNeeded();

// ============================================================================
// 3. 单实例 PID 锁（防止重复启动守护进程，Windows 校验 node.exe 防止 PID 复用误杀）
// ============================================================================
function checkDaemonPidState(pid) {
  if (!pid || pid <= 0 || pid === process.pid) return 'not_daemon';
  try {
    process.kill(pid, 0);
  } catch (err) {
    return err && err.code === 'EPERM' ? 'uncertain' : 'not_daemon';
  }
  if (process.platform === 'win32') {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
          windowsHide: true,
          encoding: 'utf8',
          timeout: 4000
        });
        if (res.status === 0) {
          const out = String(res.stdout || '').toLowerCase();
          if (!out.includes('node.exe')) return 'not_daemon';
        } else if (attempt === 0) {
          continue;
        } else {
          return 'uncertain';
        }
        const cimRes = spawnSync(
          'powershell',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}" -ErrorAction SilentlyContinue; if ($p) { $p.CommandLine }`
          ],
          {
            windowsHide: true,
            encoding: 'utf8',
            timeout: 12000
          }
        );
        if (cimRes.status === 0) {
          const cmdLine = String(cimRes.stdout || '').trim().toLowerCase();
          if (!cmdLine) {
            try {
              process.kill(pid, 0);
              return 'uncertain';
            } catch {
              return 'not_daemon';
            }
          }
          if (cmdLine.includes('daemon.mjs') || cmdLine.includes('antigravity-font-daemon')) {
            return 'confirmed';
          }
          return 'not_daemon';
        }
      } catch {}
    }
    return 'uncertain';
  }
  return 'confirmed';
}

const pidKey = CLI_CHANNEL || 'default';
const PID_FILE = path.join(os.tmpdir(), `ag-theme-daemon-${pidKey}.pid`);
if (!RUN_ONCE) {
  try {
    if (fs.existsSync(PID_FILE)) {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      const pidState = checkDaemonPidState(oldPid);
      if (pidState === 'confirmed') {
        try {
          process.kill(oldPid, 'SIGTERM');
        } catch {}
      } else if (pidState === 'uncertain') {
        console.warn(`[Daemon] Existing node.exe PID ${oldPid} still active while WMI busy; skipping duplicate startup.`);
        process.exit(0);
      }
    }
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
    const cleanPid = () => {
      try {
        if (fs.existsSync(PID_FILE) && fs.readFileSync(PID_FILE, 'utf8').trim() === String(process.pid)) {
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
  } catch {}
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
  if (cachedPath && fs.existsSync(cachedPath)) {
    return cachedPath;
  }
  if (cachedPath) {
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
    const st = fs.statSync(dbPath, { throwIfNoEntry: false });
    if (!st) return null;
    const wst = fs.statSync(`${dbPath}-wal`, { throwIfNoEntry: false });
    const walSig = wst ? `${wst.mtimeMs}:${wst.size}` : '0:0';
    return {
      dbPath,
      sig: `${dbPath}#${st.mtimeMs}:${st.size}|${walSig}`
    };
  } catch {
    return null;
  }
}

function getDbSignature(cascadeId, endpointOrDir) {
  return getDbState(cascadeId, endpointOrDir)?.sig || null;
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

function parseConversationMetrics(cascadeId, endpointOrDir, precomputedState = null) {
  if (!DatabaseSync) return null;
  if (!cascadeId || !/^[0-9a-f-]{36}$/i.test(cascadeId)) return null;
  const state = precomputedState || getDbState(cascadeId, endpointOrDir);
  if (!state || !state.dbPath || !state.sig) return { cascadeId, hasData: false };
  const { dbPath, sig } = state;

  const cached = metricsCache.get(dbPath);
  if (cached && cached.sig === sig) {
    return cached.payload;
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true, timeout: 200 });
    const metaStat = db.prepare('SELECT COUNT(*) AS cnt, COALESCE(MAX(idx), -1) AS maxIdx FROM gen_metadata').get();
    const rowCount = metaStat?.cnt ?? 0;
    const maxIdx = metaStat?.maxIdx ?? -1;
    if (rowCount === 0 || maxIdx < 0) {
      db.close();
      db = null;
      incrementalMetricsMap.delete(dbPath);
      const emptyPayload = { cascadeId, hasData: false, sig };
      setMetricsCache(dbPath, { sig, payload: emptyPayload });
      return emptyPayload;
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

    db.close();
    db = null;
    setIncrementalMetrics(dbPath, inc);

    const { validItems: valid, totalIn, totalCache, totalOut, totalThink, totalResp } = inc;
    if (valid.length === 0) {
      const emptyPayload = { cascadeId, hasData: false, sig };
      setMetricsCache(dbPath, { sig, payload: emptyPayload });
      return emptyPayload;
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

    const inlineHtml = [
      `<span>${Math.round(displayTps)} tok/s</span>`,
      `<span class="ag-sep">·</span>`,
      `<span>${useStream ? 'TTFT' : 'Hold'} ${last.ttft.toFixed(1)}s</span>`,
      `<span class="ag-sep">·</span>`,
      `<span>Ctx ${fmtTok(last.ctx)}/${limitStr} <span class="${ctxClass}">(${ctxPct}%)</span></span>`,
      `<span class="ag-sep">·</span>`,
      `<span>Out ${fmtTok(last.outTok)}</span>`
    ].join('');

    const turnRowHtml =
      turnSteps > 1
        ? `<div class="ag-tt-row"><span class="ag-tt-lbl">本轮合计 (${turnSteps}步)</span><span class="ag-tt-val">输出 ${fmtNum(turnOut)} (思考 ${fmtNum(turnThink)} + 响应 ${fmtNum(turnResp)}) | 耗时 ${turnDur.toFixed(1)}s</span></div>`
        : '';

    const tooltipHtml = [
      `<div class="ag-tt-hdr">本轮最新调用 (Gen #${last.idx + 1})</div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">生成速度</span><span class="ag-tt-val">${useStream ? `流式 ${rawStreamTps.toFixed(1)} tok/s | ` : ''}端到端（含等待） ${e2eTps.toFixed(1)} tok/s</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">响应耗时</span><span class="ag-tt-val">${useStream ? `TTFT ${last.ttft.toFixed(2)}s | 流式 ${last.stream.toFixed(2)}s | 总计 ${last.totDur.toFixed(2)}s` : `等待 ${last.ttft.toFixed(2)}s | 刷出 ${last.stream.toFixed(2)}s | 总计 ${last.totDur.toFixed(2)}s`}</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">当前上下文</span><span class="ag-tt-val">${fmtNum(last.ctx)} (新增 ${fmtNum(last.inTok)} + 缓存 ${fmtNum(last.cacheRead)}, ${lastCacheRate}%)</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">本步输出量</span><span class="ag-tt-val">${fmtNum(last.outTok)} (思考链 ${fmtNum(last.thinkTok)} + 正文/工具 ${fmtNum(last.respTok)})</span></div>`,
      turnRowHtml,
      `<div class="ag-tt-hdr ag-tt-sec">当前会话累计 (${userStepsCount} 轮提问 / ${valid.length} 次有效调用)</div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">压缩水位线</span><span class="ag-tt-val">${fmtTok(last.ctx)} / ${limitStr} (${ctxPct}%) · 距压缩余 ${fmtTok(remainCtx)}</span></div>`,
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
    setMetricsCache(dbPath, { sig, payload });
    return payload;
  } catch {
    // 若遇 SQLITE_BUSY 等瞬态锁竞争，标记 transientError 使得上层不锁死 lastPushedHash，下一轮自动重试
    return {
      cascadeId,
      transientError: true,
      cachedPayload: cached?.payload || null
    };
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

// ============================================================================
// 5. CDP 目标发现、WebSocket 会话挂载与热更新推送
// ============================================================================
const attachedTargets = new Map();

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
      let activeCascadeId = '';
      let lastPushedHash = '';
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

      const updateNewDocScript = async () => {
        if (evalScriptId) {
          await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: evalScriptId });
          evalScriptId = null;
        }
        if (activeConfig.enabled) {
          const addRes = await send('Page.addScriptToEvaluateOnNewDocument', { source: cachedInjectScript });
          if (addRes?.result?.identifier) {
            evalScriptId = addRes.result.identifier;
          }
        }
      };

      const inject = async () => {
        const res = await send('Runtime.evaluate', {
          expression: cachedInjectScript,
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
          console.log(`[Daemon] Injected (${cachedPatchVersion}) into target ${target.id} [${endpoint.channel}]`);
          return true;
        }
      };

      const syncMetricsForSession = async (force = false) => {
        if (target.type === 'iframe' || !DatabaseSync || !activeConfig.modules.metrics || !activeConfig.enabled) return;

        // 仅在尚未获知 activeCascadeId 或强制重同步时向前端发起 Runtime.evaluate，日常靠 __agRequestMetrics 绑定事件实时驱动
        if (!activeCascadeId || force) {
          const evalRes = await send('Runtime.evaluate', {
            expression: `(function(){
              if (window.__ag_watched_cascade_id) return window.__ag_watched_cascade_id;
              const m = window.location.pathname.match(/\\/c\\/([0-9a-f-]{36})/i);
              if (m) return m[1];
              const el = document.querySelector('[data-testid=conversation-row-sidebar][data-selected=true]');
              return el ? (el.getAttribute('data-cascade-id') || '') : '';
            })()`,
            returnByValue: true
          });
          const detected = evalRes?.result?.result?.value;
          if (detected && /^[0-9a-f-]{36}$/i.test(detected)) {
            activeCascadeId = detected;
          }
        }
        if (!activeCascadeId) return;

        // 先在 Node 本地通过 statSync 检查 .db/.db-wal 签名（兼容 Windows WSL 按需懒探测），未变化则 0 WebSocket 通信直接返回
        const currentEndpoint = attachedTargets.get(target.id)?.endpoint || endpoint;
        const dbState = getDbState(activeCascadeId, currentEndpoint);
        const sig = dbState?.sig || 'empty';
        const sessionKey = `${activeCascadeId}@${sig}|${metricsConfigEpoch}`;
        if (!force && sessionKey === lastPushedHash) return;

        const payload = parseConversationMetrics(activeCascadeId, currentEndpoint, dbState);
        if (!payload || payload.transientError) {
          if (force && payload?.cachedPayload) {
            await send('Runtime.evaluate', {
              expression: `window.__ag_render_metrics && window.__ag_render_metrics(${JSON.stringify(payload.cachedPayload)})`,
              returnByValue: false
            });
          }
          return;
        }

        await send('Runtime.evaluate', {
          expression: `window.__ag_render_metrics && window.__ag_render_metrics(${JSON.stringify(payload)})`,
          returnByValue: false
        });
        lastPushedHash = sessionKey;
      };

      const checkAndInject = async () => {
        try {
          const checkRes = await send('Runtime.evaluate', {
            expression:
              'window.__ag_patch_version === ' +
              JSON.stringify(cachedPatchVersion) +
              ' && (' +
              JSON.stringify(!activeConfig.enabled) +
              ' || (window.__ag_body_ready === true && !!document.getElementById("ag-custom-fonts")))',
            returnByValue: true
          });
          if (checkRes?.result?.result?.value !== true) {
            await inject();
            await syncMetricsForSession(true);
          }
        } catch {}
      };

      let initialAttachDone = false;
      let navDebounceTimer = null;
      let lastHardReloadAt = 0;

      ws.addEventListener('open', async () => {
        console.log(`[Daemon] Attached target: ${target.id} (${target.title || 'Untitled'}) [${endpoint.channel}]`);
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Runtime.addBinding', { name: '__agRequestMetrics' });
        if (target.type === 'page') {
          await send('Runtime.addBinding', { name: '__agRequestHardReload' });
        }
        await updateNewDocScript();
        const ok = await inject();
        await syncMetricsForSession(true);
        initialAttachDone = true;
        clearTimeout(attachTimeout);
        finishAttach(ok);
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
            const nextId = String(msg.params.payload || '').trim();
            if (/^[0-9a-f-]{36}$/i.test(nextId)) {
              activeCascadeId = nextId;
              lastPushedHash = '';
              syncMetricsForSession(true);
            }
            return;
          }
          if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agRequestHardReload') {
            if (
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
          if (!initialAttachDone) return;
          if (
            msg.method === 'Page.frameNavigated' ||
            msg.method === 'Page.loadEventFired' ||
            msg.method === 'Page.domContentEventFired'
          ) {
            if (!msg.params?.frame || !msg.params.frame.parentId || msg.params.frame.id === target.id) {
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
        if (navDebounceTimer) {
          clearTimeout(navDebounceTimer);
          navDebounceTimer = null;
        }
        for (const [, cb] of pendingCallbacks) cb(null);
        pendingCallbacks.clear();
        attachedTargets.delete(target.id);
        finishAttach(false);
      };
      ws.addEventListener('close', closeHandler);
      ws.addEventListener('error', closeHandler);

      attachedTargets.set(target.id, {
        ws,
        send,
        updateNewDocScript,
        inject,
        checkAndInject,
        syncMetricsForSession,
        endpoint,
        setActiveCascade: (cid) => {
          activeCascadeId = cid;
          lastPushedHash = '';
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
let cachedWorkingPython = undefined;
let zhPatchFailedSig = '';
let zhPatchFailCount = 0;

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
  if (!sig || sig === lastZhPatchSig) return;
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
        console.log(
          '[Daemon] zh-title auto-patch skipped (macOS App Management TCC blocks background LaunchAgent write; run `python3 ~/.gemini/antigravity/scripts/antigravity-zh-title-patch.py patch` in an authorized terminal).'
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
    if (outStr.includes('中文标题补丁注入成功')) {
      console.log('[Daemon] Auto-applied zh-title patch:', outStr.split('\n')[0]);
    } else if (outStr.includes('DISABLED')) {
      console.log('[Daemon] zh-title auto-patch skipped (DISABLED marker present).');
    }
  });
  try {
    child.stdin?.end();
  } catch {}
}

const fallbackBackoffUntil = new Map();

async function sync() {
  if (isSyncing) return;
  isSyncing = true;
  syncTickCount = (syncTickCount + 1) % 6000;
  try {
    if (syncTickCount % 12 === 1) ensureZhTitlePatchIfPresent();
    const bundleChanged = rebuildBundleIfNeeded();
    const shouldHeartbeatCheck = bundleChanged || syncTickCount % 6 === 1;

    const activeTargetIds = new Set();
    const attachPromises = [];

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

      const pages = targets.filter(
        (t) =>
          (t.type === 'page' || (t.type === 'iframe' && String(t.url || '').startsWith('plugin://swarm--'))) &&
          t.webSocketDebuggerUrl &&
          !String(t.url || '').startsWith('devtools://') &&
          isAllowedOrigin(t.url) &&
          !String(t.title || '').includes('Launchpad')
      );

      for (const page of pages) {
        activeTargetIds.add(page.id);
        if (!attachedTargets.has(page.id)) {
          attachPromises.push(attachTarget(page, endpoint));
        } else {
          const entry = attachedTargets.get(page.id);
          entry.endpoint = endpoint;
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

    // 清理已关闭的目标连接
    for (const [id, entry] of attachedTargets.entries()) {
      if (!activeTargetIds.has(id)) {
        try {
          entry.ws.close();
        } catch {}
        attachedTargets.delete(id);
      }
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
