#!/usr/bin/env node
/**
 * chuanban-antigravity-theme-patch · CDP Theme & Live Metrics Daemon (core/daemon.mjs)
 *
 * 架构特性（v6.0.3）：
 * 1. 动态 Node 分级：
 *    - Node >= 22.0：完整启用昼夜双模式独立主题（暖纸浅色三预设 + 深色 onyx / claude-warm 双预设 + 外观「跟随系统」开关）、Google Sans Flex 原生西文引擎 × 更纱黑体 UI 精密字重桥接 + Anthropic Serif 正文、输入框三态、2210条母语级汉化、宿主独占指纹门禁、死锁与冷启动兜底包自愈及 2.33.0+ ~ 2.35.1+ CDP Opt-in 自动接力（M2 · SingletonLock/lockfile 零子进程空闲短路 + OS 分层启动参数与代理保留）。
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
import { performance } from 'node:perf_hooks';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CORE_DIR = path.join(ROOT_DIR, 'core');
const USER_DIR = path.join(ROOT_DIR, 'user');
const CACHE_DIR = path.join(ROOT_DIR, '.cache');

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
const KEEP_ALIVE_ONLY = hasFlag('--keep-alive') || hasFlag('--if-not-running');
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

const wslDirsCache = new Map(); // cacheKey -> { sig, distro, dirs, probedAt, ttlMs }
let cachedRegWslDistros = { distros: [], probedAt: 0, promise: null };
let cachedRunningWslDistros = { ok: false, distros: new Set(), probedAt: 0, promise: null };
let wslUncBackoffUntil = 0;

function markUncSlowIfExceeded(unc, startMs, budgetMs = 400) {
  if (unc && Date.now() - startMs > budgetMs) {
    wslUncBackoffUntil = Date.now() + 45000;
    return true;
  }
  return false;
}

function parseWslRunningStdout(rawOut, exitCode = 0) {
  const buf = Buffer.isBuffer(rawOut) ? rawOut : Buffer.from(String(rawOut || ''), 'utf8');
  const text = (buf.includes(0) ? buf.toString('utf16le') : buf.toString('utf8')).replace(/^\uFEFF/, '');
  const running = new Set();
  if (exitCode === 0) {
    for (const line of text.split(/\r?\n/)) {
      const name = line.replace(/\0/g, '').trim();
      if (name && !/^docker-desktop/i.test(name) && /^[A-Za-z0-9._-]+$/.test(name)) {
        running.add(name.toLowerCase());
      }
    }
  }
  return running;
}

function parseWslLxssRegistryStdout(outText) {
  const distros = [];
  const out = String(outText || '');
  if (!out) return distros;
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
  return distros;
}

function refreshRunningWslDistrosAsync() {
  if (process.platform !== 'win32') return Promise.resolve(cachedRunningWslDistros);
  if (cachedRunningWslDistros.promise) return cachedRunningWslDistros.promise;
  const p = new Promise((resolve) => {
    execFile(
      'wsl.exe',
      ['--list', '--running', '--quiet'],
      {
        windowsHide: true,
        timeout: 1200,
        encoding: 'buffer',
        maxBuffer: 256 * 1024,
        env: { ...process.env, WSL_UTF8: '1' }
      },
      (err, stdout) => {
        const now = Date.now();
        if (err && err.killed) {
          cachedRunningWslDistros = { ok: false, distros: cachedRunningWslDistros.distros, probedAt: now, promise: null };
        } else if (err && typeof err.code !== 'number') {
          cachedRunningWslDistros = { ok: false, distros: new Set(), probedAt: now, promise: null };
        } else {
          const code = err && typeof err.code === 'number' ? err.code : 0;
          const running = parseWslRunningStdout(stdout, code);
          cachedRunningWslDistros = { ok: code === 0, distros: running, probedAt: now, promise: null };
        }
        resolve(cachedRunningWslDistros);
      }
    );
  });
  cachedRunningWslDistros.promise = p;
  return p;
}

function refreshWslRegistryDistrosAsync() {
  if (process.platform !== 'win32') return Promise.resolve(cachedRegWslDistros.distros);
  if (cachedRegWslDistros.promise) return cachedRegWslDistros.promise;
  const p = new Promise((resolve) => {
    execFile(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss', '/s'],
      {
        windowsHide: true,
        encoding: 'buffer',
        timeout: 1500,
        maxBuffer: 512 * 1024
      },
      (err, stdout) => {
        const outStr = Buffer.isBuffer(stdout) ? stdout.toString('latin1') : String(stdout || '');
        const distros = !err && outStr ? parseWslLxssRegistryStdout(outStr) : cachedRegWslDistros.distros;
        cachedRegWslDistros = { distros, probedAt: Date.now(), promise: null };
        resolve(distros);
      }
    );
  });
  cachedRegWslDistros.promise = p;
  return p;
}

function inspectWin32WslProbeDemand(endpointsOrSingle) {
  try {
    if (process.platform !== 'win32') return { hasWsl: false, needsRegistry: false };
    const envDistro = String(process.env.ANTIGRAVITY_WSL_DISTRO || '').trim();
    const validEnvDistro = envDistro && !/^docker-desktop/i.test(envDistro) ? envDistro : '';
    if (endpointsOrSingle === undefined || endpointsOrSingle === null) {
      return validEnvDistro ? { hasWsl: true, needsRegistry: false } : { hasWsl: true, needsRegistry: true };
    }
    const list = Array.isArray(endpointsOrSingle) ? endpointsOrSingle : [endpointsOrSingle];
    let hasEligibleEndpoint = false;
    let hasWsl = false;
    let needsRegistry = false;
    for (const ep of list) {
      if (!ep || ep.explicitConvDir || !ep.portFile) continue;
      hasEligibleEndpoint = true;
      const wslStatePath = path.join(path.dirname(ep.portFile), 'wsl_state.json');
      if (getFileMtimeSig(wslStatePath) === '0:0') continue;
      hasWsl = true;
      const wslState = readJsonSafe(wslStatePath, {});
      const persisted = String(wslState?.distro || wslState?.distroName || wslState?.defaultDistro || '').trim();
      if (!persisted && !validEnvDistro) needsRegistry = true;
    }
    if (hasEligibleEndpoint && validEnvDistro) {
      hasWsl = true;
    }
    return { hasWsl, needsRegistry };
  } catch {
    return { hasWsl: false, needsRegistry: false };
  }
}

async function ensureWin32WslProbesWarmAsync() {
  try {
    if (process.platform !== 'win32') return;
    const demand = inspectWin32WslProbeDemand(arguments.length > 0 ? arguments[0] : undefined);
    if (!demand.hasWsl) return;
    const now = Date.now();
    const tasks = [];
    if (now - cachedRunningWslDistros.probedAt >= 30000) {
      tasks.push(refreshRunningWslDistrosAsync());
    }
    if (demand.needsRegistry && now - cachedRegWslDistros.probedAt >= 60000) {
      tasks.push(refreshWslRegistryDistrosAsync());
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  } catch {}
}

function resolveRunningWslDistros() {
  if (process.platform !== 'win32') return { ok: false, distros: new Set() };
  const now = Date.now();
  if (now - cachedRunningWslDistros.probedAt < 30000) {
    return cachedRunningWslDistros;
  }
  // 常驻守护态采用非阻塞 Stale-While-Revalidate，彻底消除 wsl.exe 80~1200ms 同步阻塞主事件循环；仅单次 CLI (--once) 冷态才同步探测一次
  if (!RUN_ONCE) {
    void refreshRunningWslDistrosAsync();
    return cachedRunningWslDistros;
  }
  try {
    const res = spawnSync('wsl.exe', ['--list', '--running', '--quiet'], {
      windowsHide: true,
      timeout: 1000,
      env: { ...process.env, WSL_UTF8: '1' }
    });
    if (res.error || res.status === null) {
      cachedRunningWslDistros = { ok: false, distros: new Set(), probedAt: now, promise: null };
      return cachedRunningWslDistros;
    }
    const running = parseWslRunningStdout(res.stdout, res.status);
    cachedRunningWslDistros = { ok: res.status === 0, distros: running, probedAt: now, promise: null };
    return cachedRunningWslDistros;
  } catch {
    cachedRunningWslDistros = { ok: false, distros: new Set(), probedAt: now, promise: null };
    return cachedRunningWslDistros;
  }
}

function resolveWslDistrosFromRegistry() {
  if (process.platform !== 'win32') return [];
  const now = Date.now();
  if (now - cachedRegWslDistros.probedAt < 60000) {
    return cachedRegWslDistros.distros;
  }
  if (!RUN_ONCE) {
    void refreshWslRegistryDistrosAsync();
    return cachedRegWslDistros.distros;
  }
  let distros = [];
  try {
    const res = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss', '/s'], {
      windowsHide: true,
      encoding: 'buffer',
      timeout: 1200
    });
    if (res.status === 0 && res.stdout) {
      distros = parseWslLxssRegistryStdout(res.stdout.toString('latin1'));
    }
  } catch {}
  cachedRegWslDistros = { distros, probedAt: now, promise: null };
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
    if (fileSig === '0:0' && !envDistro) {
      wslDirsCache.delete(wslStatePath);
      return [];
    }
    const wslState = fileSig !== '0:0' ? readJsonSafe(wslStatePath, {}) : {};
    const persistedDistro = String(wslState?.distro || wslState?.distroName || wslState?.defaultDistro || '').trim();
    const rawDistro = persistedDistro || envDistro;

    const regList = rawDistro ? [] : resolveWslDistrosFromRegistry();
    const runningWsl = resolveRunningWslDistros();
    const regSig = rawDistro ? '' : regList.join(',');
    const runSig = runningWsl.ok ? [...runningWsl.distros].sort().join(',') : 'unavail';
    const compositeSig = `${fileSig}|env:${envDistro}|reg:${regSig}|run:${runSig}`;

    const cached = wslDirsCache.get(wslStatePath);
    const probesPending =
      !RUN_ONCE &&
      (cachedRunningWslDistros.probedAt === 0 || (!rawDistro && cachedRegWslDistros.probedAt === 0));
    const cachedTtl = cached?.ttlMs || (cached?.dirs?.length > 0 ? 60000 : 30000);
    if (cached && cached.sig === compositeSig && now - cached.probedAt < cachedTtl && !probesPending) {
      return cached.dirs;
    }

    let candidateDistros = [];
    if (rawDistro) {
      if (!/^docker-desktop/i.test(rawDistro) && /^[A-Za-z0-9._-]+$/.test(rawDistro)) {
        candidateDistros = [rawDistro];
      }
    } else if (fileSig !== '0:0') {
      candidateDistros = regList.slice();
    }
    if (candidateDistros.length === 0) {
      const ttlMs = !rawDistro && cachedRegWslDistros.probedAt === 0 ? 3000 : 45000;
      wslDirsCache.set(wslStatePath, { sig: compositeSig, distro: '', dirs: [], probedAt: now, ttlMs });
      return [];
    }

    // 仅探测已确认正在运行的 WSL 发行版；在异步探测尚未完成预热或 wsl.exe 失败/超时(!ok)时绝不穿透触碰 UNC，彻底杜绝冷唤醒 Stopped VM
    if (!RUN_ONCE && cachedRunningWslDistros.probedAt === 0) {
      return cached?.dirs || [];
    }
    if (!runningWsl.ok) {
      wslDirsCache.set(wslStatePath, { sig: compositeSig, distro: '', dirs: [], probedAt: now, ttlMs: 30000 });
      return [];
    }
    candidateDistros = candidateDistros.filter((d) => runningWsl.distros.has(d.toLowerCase()));
    if (candidateDistros.length === 0) {
      wslDirsCache.set(wslStatePath, { sig: compositeSig, distro: '', dirs: [], probedAt: now, ttlMs: 30000 });
      return [];
    }

    const t0 = Date.now();
    const subParts = geminiSubDir.split('/');
    const found = [];
    outer: for (const distro of candidateDistros) {
      for (const uncHost of ['wsl.localhost', 'wsl$']) {
        const distroRoot = `\\\\${uncHost}\\${distro}`;
        if (!fs.existsSync(distroRoot)) {
          if (markUncSlowIfExceeded(true, t0)) break outer;
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
        if (markUncSlowIfExceeded(true, t0)) break outer;
        // 首个发行版命中会话目录后立即终止内外层探测，杜绝继续访问其它已停止发行版触发虚拟机唤醒
        if (found.length > 0) break outer;
      }
      if (markUncSlowIfExceeded(true, t0)) break;
    }
    markUncSlowIfExceeded(true, t0);
    const uniqueDirs = Array.from(new Set(found));
    if (Date.now() < wslUncBackoffUntil && uniqueDirs.length === 0 && cached?.dirs?.length) {
      return cached.dirs;
    }
    wslDirsCache.set(wslStatePath, {
      sig: compositeSig,
      distro: candidateDistros.join(','),
      dirs: uniqueDirs,
      probedAt: Date.now(),
      ttlMs: uniqueDirs.length > 0 ? 60000 : 30000
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

  const customFallbackPort =
    Number(userCfg.fallbackPort) > 0 ? Number(userCfg.fallbackPort) : Number(userCfg.port) > 0 ? Number(userCfg.port) : 0;

  return {
    channel: singleChannel,
    portFile,
    geminiSubDir,
    explicitConvDir: Boolean(explicitConvDir),
    fallbackPort: customFallbackPort || fallbackPort,
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
const BASE_VERSION = '20261125-v6.0.3';
let cachedBundleSig = '';
let cachedInjectScript = '';
let cachedIframeInjectScript = '';
let cachedPatchVersion = '';
let metricsConfigEpoch = 0;
const metricsCache = new Map(); // dbPath -> { sig, payload }
// Must be declared before the top-level rebuildBundleIfNeeded() call: it clears this cache
// when user/config.json contextLimit differs from the default, which would otherwise hit the TDZ.
const lastBestEffortPayloadCache = new Map(); // dbPath -> payload
const incrementalMetricsMap = new Map(); // dbPath -> { rowCount, maxIdx, userStepsCount, lastUserStepIdx, items, validItems, totalIn, totalCache, totalOut, totalThink, totalResp }
const tokenAnalyticsDbCache = new Map(); // dbPath -> { sig, parsed, _inc }
const tokenAnalyticsSummariesCache = new Map(); // summariesDbPath -> { sig, map }
let lastTokenAnalyticsAccessMs = 0;
let tokenAnalyticsDiskLoaded = false;
let tokenAnalyticsPersistTimer = null;
let tokenAnalyticsLastJsonCache = { dataRef: null, jsonStr: '' };
let inFlightTokenAnalyticsPromise = null;
let inFlightTokenAnalyticsKey = '';
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
  preset: 'morandi',
  darkPreset: 'onyx',
  installedLocale: 'zh-CN',
  metricsMode: 'compact',
  contextLimit: 256000,
  contextLimitOverride: 0,
  modules: {
    i18n: true,
    metrics: true,
    tokenAnalytics: true,
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

function normalizeDarkPresetValue(rawVal) {
  const s = String(rawVal || '').trim().toLowerCase();
  if (s === 'claude-warm' || s === 'warm-paper-night' || s === 'claude-night' || s === '暖炭') {
    return 'claude-warm';
  }
  return 'onyx';
}

function normalizeLightPresetValue(rawVal) {
  const s = String(rawVal || '').trim().toLowerCase();
  if (s === 'native' || s === 'stock' || s === 'original' || s === '原版配色') return 'native';
  if (s === 'absolutely' || s === 'claude-orange' || s === 'absolutely!' || s === 'absolutely！') {
    return 'absolutely';
  }
  if (s === 'claude-desktop-purewhite' || s === 'claude-desktop-official' || s === 'claudedesktop 净白') {
    return 'claude-desktop-purewhite';
  }
  if (s === 'vintage-deep' || s === 'absoulutely-chuanban' || s === '复古深色') {
    return 'vintage-deep';
  }
  return 'morandi';
}

function broadcastPresetToTargets(kind, normalizedVal, excludeTargetId = null) {
  if (!activeConfig.enabled) return;
  const fnName = kind === 'dark' ? '__ag_set_host_dark_preset' : '__ag_set_host_light_preset';
  const expr = `window.${fnName} && window.${fnName}(${JSON.stringify(normalizedVal)})`;
  const tasks = [];
  for (const [id, entry] of attachedTargets.entries()) {
    if (!entry?.hostConfirmed) continue;
    if (excludeTargetId && id === excludeTargetId) {
      if (entry.updateNewDocScript) tasks.push(entry.updateNewDocScript().catch(() => {}));
      continue;
    }
    if (entry.send) {
      tasks.push(entry.send('Runtime.evaluate', { expression: expr, returnByValue: false }).catch(() => {}));
    }
    if (entry.updateNewDocScript) {
      tasks.push(entry.updateNewDocScript().catch(() => {}));
    }
  }
  if (tasks.length > 0) {
    void Promise.allSettled(tasks);
  }
}

let cfgWriteSeq = 0;

function atomicWriteTextFileSync(tmpPath, targetPath, content) {
  fs.writeFileSync(tmpPath, content, 'utf8');
  const maxAttempts = process.platform === 'win32' ? 5 : 1;
  let lastErr = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      fs.renameSync(tmpPath, targetPath);
      return;
    } catch (err) {
      lastErr = err;
      const code = err && err.code;
      const retryable = process.platform === 'win32' && (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES');
      if (!retryable) throw err;
      if (attempt < maxAttempts - 1) {
        sleepSync(15 * (attempt + 1));
      }
    }
  }
  // Windows Defender / 索引器持续持锁时回退直接覆写并清理临时文件，避免配置修改静默丢失
  try {
    fs.writeFileSync(targetPath, content, 'utf8');
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    return;
  } catch (fallbackErr) {
    throw lastErr || fallbackErr;
  }
}

function persistDarkPresetToUserConfig(rawDarkPreset) {
  if (SAFE_MODE) return false;
  const nextDarkPreset = normalizeDarkPresetValue(rawDarkPreset);
  const cfgPath = path.join(USER_DIR, 'config.json');
  const tmpPath = `${cfgPath}.tmp-${process.pid}-dp-${++cfgWriteSeq}`;
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
    const prevNorm = normalizeDarkPresetValue(currentObj.darkPreset);
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
    atomicWriteTextFileSync(tmpPath, cfgPath, `${JSON.stringify(updatedObj, null, 2)}\n`);
    if (rebuildBundleIfNeeded({ fromUiPersist: true })) {
      const tasks = [];
      for (const [, entry] of attachedTargets.entries()) {
        if (entry?.hostConfirmed && entry.updateNewDocScript) {
          tasks.push(entry.updateNewDocScript().catch(() => {}));
        }
      }
      if (tasks.length > 0) void Promise.allSettled(tasks);
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

function persistLightPresetToUserConfig(rawLightPreset) {
  if (SAFE_MODE) return false;
  const nextPreset = normalizeLightPresetValue(rawLightPreset);
  const cfgPath = path.join(USER_DIR, 'config.json');
  const tmpPath = `${cfgPath}.tmp-${process.pid}-lp-${++cfgWriteSeq}`;
  try {
    fs.mkdirSync(USER_DIR, { recursive: true });
    let currentObj = {};
    if (fs.existsSync(cfgPath)) {
      let parsed = null;
      try {
        const rawText = fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, '');
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        logDaemonEvent(`persistLightPreset skipped: user/config.json unreadable (${parseErr?.message || parseErr})`);
        return false;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return false;
      }
      currentObj = parsed;
    }
    if (currentObj.preset === nextPreset) {
      return false;
    }
    const updatedObj = {};
    let inserted = false;
    for (const [k, v] of Object.entries(currentObj)) {
      if (k === 'preset') {
        updatedObj.preset = nextPreset;
        inserted = true;
      } else {
        updatedObj[k] = v;
      }
    }
    if (!inserted) {
      updatedObj.preset = nextPreset;
    }
    atomicWriteTextFileSync(tmpPath, cfgPath, `${JSON.stringify(updatedObj, null, 2)}\n`);
    if (rebuildBundleIfNeeded({ fromUiPersist: true })) {
      const tasks = [];
      for (const [, entry] of attachedTargets.entries()) {
        if (entry?.hostConfirmed && entry.updateNewDocScript) {
          tasks.push(entry.updateNewDocScript().catch(() => {}));
        }
      }
      if (tasks.length > 0) void Promise.allSettled(tasks);
    }
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    logDaemonEvent(`persistLightPreset error: ${err?.message || err}`);
    return false;
  }
}

function normalizeUiLangValue(rawVal) {
  const s = String(rawVal || '').trim().toLowerCase();
  if (s === 'en' || s === 'en-us' || s === 'english' || s === 'off' || s === 'false' || s === '0') {
    return 'en';
  }
  return 'target';
}

function broadcastUiLangToTargets(rawUiLang, excludeTargetId = null) {
  if (!activeConfig.enabled) return;
  const normLang = normalizeUiLangValue(rawUiLang);
  const wantI18n = normLang !== 'en';
  if (activeConfig.modules && typeof activeConfig.modules === 'object') {
    activeConfig.modules.i18n = wantI18n;
    metricsConfigEpoch += 1;
  }
  const expr = `window.__ag_set_host_ui_lang && window.__ag_set_host_ui_lang(${JSON.stringify(normLang)})`;
  const tasks = [];
  for (const [id, entry] of attachedTargets.entries()) {
    if (!entry?.hostConfirmed) continue;
    if (entry.updateNewDocScript) {
      tasks.push(entry.updateNewDocScript().catch(() => {}));
    }
    if (!excludeTargetId || id !== excludeTargetId) {
      if (entry.send) {
        tasks.push(entry.send('Runtime.evaluate', { expression: expr, returnByValue: false }).catch(() => {}));
      }
    }
    if (entry.type !== 'iframe' && entry.syncMetricsForSession) {
      tasks.push(entry.syncMetricsForSession(true).catch(() => {}));
    }
  }
  if (tasks.length > 0) {
    void Promise.allSettled(tasks);
  }
}

function persistUiLangToUserConfig(rawUiLang, skipNewDocSync = false) {
  if (SAFE_MODE) return false;
  const normLang = normalizeUiLangValue(rawUiLang);
  const wantI18n = normLang !== 'en';
  const cfgPath = path.join(USER_DIR, 'config.json');
  const tmpPath = `${cfgPath}.tmp-${process.pid}-ul-${++cfgWriteSeq}`;
  try {
    fs.mkdirSync(USER_DIR, { recursive: true });
    let currentObj = {};
    if (fs.existsSync(cfgPath)) {
      let parsed = null;
      try {
        const rawText = fs.readFileSync(cfgPath, 'utf8').replace(/^\uFEFF/, '');
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        logDaemonEvent(`persistUiLang skipped: user/config.json unreadable (${parseErr?.message || parseErr})`);
        return false;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return false;
      }
      currentObj = parsed;
    }
    const curModules =
      currentObj.modules && typeof currentObj.modules === 'object' && !Array.isArray(currentObj.modules)
        ? currentObj.modules
        : {};
    if (curModules.i18n === wantI18n && 'i18n' in curModules) {
      return true;
    }
    const nextModules = Object.assign({ i18n: wantI18n }, curModules, { i18n: wantI18n });
    const updatedObj = {};
    let inserted = false;
    for (const [k, v] of Object.entries(currentObj)) {
      if (k === 'modules') {
        updatedObj.modules = nextModules;
        inserted = true;
      } else {
        updatedObj[k] = v;
      }
    }
    if (!inserted) {
      updatedObj.modules = nextModules;
    }
    atomicWriteTextFileSync(tmpPath, cfgPath, `${JSON.stringify(updatedObj, null, 2)}\n`);
    if (rebuildBundleIfNeeded({ fromUiPersist: true }) && !skipNewDocSync) {
      const tasks = [];
      for (const [, entry] of attachedTargets.entries()) {
        if (entry?.hostConfirmed && entry.updateNewDocScript) {
          tasks.push(entry.updateNewDocScript().catch(() => {}));
        }
      }
      if (tasks.length > 0) void Promise.allSettled(tasks);
    }
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    logDaemonEvent(`persistUiLang error: ${err?.message || err}`);
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

function rebuildBundleIfNeeded(opts = {}) {
  const fromUiPersist = !!(opts && opts.fromUiPersist);
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
  const preset = SAFE_MODE && activeConfig ? activeConfig.preset : normalizeLightPresetValue(userCfg.preset);
  const darkPreset =
    SAFE_MODE && activeConfig ? activeConfig.darkPreset : normalizeDarkPresetValue(userCfg.darkPreset);
  const rawInstalledLocale = String(userCfg.installedLocale || 'zh-CN').trim() || 'zh-CN';
  const installedLocale =
    rawInstalledLocale === 'none' || rawInstalledLocale === 'zh-CN' ? rawInstalledLocale : 'zh-CN';
  const prevActivePreset = activeConfig ? activeConfig.preset : null;
  const prevActiveDarkPreset = activeConfig ? activeConfig.darkPreset : null;
  const prevActiveI18nEnabled = activeConfig?.modules ? activeConfig.modules.i18n !== false : null;
  if (activeConfig && preset !== prevActivePreset) {
    targetLightPresets.clear();
  }
  if (activeConfig && darkPreset !== prevActiveDarkPreset) {
    targetDarkPresets.clear();
  }
  const rawCtxLimit = Number(userCfg.contextLimit);
  const contextLimit = Number.isFinite(rawCtxLimit) && rawCtxLimit > 0 ? rawCtxLimit : 256000;
  const rawCtxOverride = Number(userCfg.contextLimitOverride);
  const contextLimitOverride = Number.isFinite(rawCtxOverride) && rawCtxOverride > 0 ? rawCtxOverride : 0;
  const rawMetricsMode = String(userCfg.metricsMode || 'compact').trim().toLowerCase();
  const metricsMode = rawMetricsMode === 'full' || rawMetricsMode === 'legacy' ? 'full' : 'compact';
  if (
    activeConfig &&
    (contextLimit !== activeConfig.contextLimit ||
      contextLimitOverride !== activeConfig.contextLimitOverride ||
      metricsMode !== activeConfig.metricsMode)
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
      tokenAnalytics: true,
      composerWaxSeal: true,
      deadlockHealer: true,
      coldBootHealer: true,
      zoomShortcuts: true,
      cdpAutoRelaunch: true,
      cdpEventDiscovery: true,
      googleFonts: true,
      customCss: true,
      customJs: true
    },
    rawModules
  );
  if (SAFE_MODE && activeConfig?.modules && typeof activeConfig.modules.i18n === 'boolean') {
    modules.i18n = activeConfig.modules.i18n;
  }
  if (!DatabaseSync) {
    modules.metrics = false;
    modules.tokenAnalytics = false;
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
    !normalizedSelectors.excludeI18n.includes('sidebar-agent-row-')
  ) {
    normalizedSelectors.excludeI18n +=
      ', [data-testid^="sidebar-agent-row-"] span.truncate, [data-testid="sidebar-agent-hover-card-title"], [data-testid="coordinator-hover-card-title"], [data-testid="doc-row-title"], [data-ag-sys-follow-row="1"]';
  }
  if (
    typeof normalizedSelectors.excludeI18n === 'string' &&
    normalizedSelectors.excludeI18n.trim() &&
    !normalizedSelectors.excludeI18n.includes('ag-live-metrics-pill')
  ) {
    normalizedSelectors.excludeI18n += ', .ag-live-metrics-pill, [data-ag-metrics-pill]';
  }
  if (
    typeof normalizedSelectors.excludeI18n === 'string' &&
    normalizedSelectors.excludeI18n.trim() &&
    !normalizedSelectors.excludeI18n.includes('data-uri^=')
  ) {
    normalizedSelectors.excludeI18n +=
      ', [data-uri^="file:"], [data-uri^="vscode-"], a.inline-pill[href^="file:"], a.inline-pill[href^="vscode-"]';
  }
  if (
    typeof normalizedSelectors.excludeI18n === 'string' &&
    normalizedSelectors.excludeI18n.trim() &&
    !normalizedSelectors.excludeI18n.includes('ag-token-analytics-panel')
  ) {
    normalizedSelectors.excludeI18n +=
      ', #ag-token-nav-section, #ag-token-analytics-panel, #ag-ta-tooltip, [data-ag-token-ui]';
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
    installedLocale,
    metricsMode,
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

  const mergedDict =
    installedLocale === 'none'
      ? {}
      : Object.assign(
          {},
          readJsonSafe(path.join(CORE_DIR, 'i18n.json'), {}),
          !SAFE_MODE ? normalizeOverrideDict(readJsonSafe(path.join(USER_DIR, 'i18n.override.json'), {})) : {}
        );

  const customJs = !SAFE_MODE && modules.customJs ? readTextSafe(path.join(USER_DIR, 'custom.js'), '') : '';
  const runtimeTemplate = readTextSafe(path.join(CORE_DIR, 'runtime.js'), '');

  const { i18n: _omitI18nFromHash, ...hashModules } = modules;
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
        installedLocale,
        metricsMode,
        modules: hashModules,
        themeVars,
        darkThemeVars,
        selectors: activeConfig.selectors,
        hostThemeMode
      })
    )
    .digest('hex')
    .slice(0, 8);

  if (!fromUiPersist && enabled) {
    if (prevActivePreset && preset !== prevActivePreset) {
      broadcastPresetToTargets('light', preset, null);
    }
    if (prevActiveDarkPreset && darkPreset !== prevActiveDarkPreset) {
      broadcastPresetToTargets('dark', darkPreset, null);
    }
    if (prevActiveI18nEnabled !== null && (modules.i18n !== false) !== prevActiveI18nEnabled) {
      broadcastUiLangToTargets(modules.i18n === false ? 'en' : 'target', null);
    }
  }

  const channelTag = channel === 'insiders' ? 'insiders' : 'stable';
  cachedPatchVersion = `${BASE_VERSION}-${channelTag}-${hash}`;

  const RE_STRIP_TA_CSS = /\/\* __AG_TOKEN_ANALYTICS_CSS_START__ \*\/[\s\S]*?\/\* __AG_TOKEN_ANALYTICS_CSS_END__ \*\//g;
  const RE_STRIP_TA_JS = /\/\* __AG_TOKEN_ANALYTICS_JS_START__ \*\/[\s\S]*?\/\* __AG_TOKEN_ANALYTICS_JS_END__ \*\//g;

  const pageCss = modules.tokenAnalytics ? baseCss : baseCss.replace(RE_STRIP_TA_CSS, '');
  const pageRuntime = modules.tokenAnalytics
    ? runtimeTemplate
    : runtimeTemplate.replace(RE_STRIP_TA_JS, '  cleanupTokenAnalyticsDom();');

  const bootPayload = {
    version: cachedPatchVersion,
    platform: process.platform,
    hostThemeMode,
    enabled,
    preset,
    darkPreset,
    installedLocale,
    cssText: pageCss,
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
      installedLocale,
      contextLimit,
      contextLimitOverride,
      modules,
      themeVars,
      darkThemeVars
    },
    customJs
  };

  cachedInjectScript = pageRuntime.replace('})(__AG_BOOT_PAYLOAD__);', () => `})(${JSON.stringify(bootPayload)});`);

  // Swarm 等跨进程子 iframe 永不承载设置弹窗，固定裁剪 Token 统计 CSS+JS（单 iframe 立减 ~100 KB，且保持同一 version 哈希）
  const iframeCss = baseCss.replace(RE_STRIP_TA_CSS, '');
  const iframeRuntime = runtimeTemplate.replace(RE_STRIP_TA_JS, '');
  const iframeModules = Object.assign({}, modules, { tokenAnalytics: false });
  const iframePayload = Object.assign({}, bootPayload, {
    cssText: iframeCss,
    modules: iframeModules,
    config: Object.assign({}, bootPayload.config, { modules: iframeModules })
  });
  cachedIframeInjectScript = iframeRuntime.replace(
    '})(__AG_BOOT_PAYLOAD__);',
    () => `})(${JSON.stringify(iframePayload)});`
  );
  cachedBundleSig = sig;
  return true;
}

// ============================================================================
// 3. 单实例 PID 锁与协作式所有权围栏（防跨周期陈旧锁自杀、防跨完整性双实例并存）
// ============================================================================
const attachedTargets = new Map();
const targetThemeModes = new Map();
const targetDarkPresets = new Map();
const targetLightPresets = new Map();
const targetMetaMap = new Map();
const skippedNonHostTargets = new Map(); // targetId -> { origin, skippedAt }
const browserWatchers = new Map(); // `${channel}:${port}` -> { ws, wsUrl, port, channel, endpoint, reconnectAfterMs, closing }
const browserWatcherBackoffUntil = new Map(); // `${channel}:${port}` -> timestamp ms
const attachingTargetIds = new Set();
const destroyedWhileAttaching = new Set();

// --keep-alive 健康检查在 daemon 存活时会在下方 PID 锁段直接 exit(0)，无需预先构建注入 bundle
if (!KEEP_ALIVE_ONLY) rebuildBundleIfNeeded();

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

// 记录致命异常（含未处理的 Promise rejection）与非零退出码，便于排查 daemon 意外退出；
// 使用 uncaughtExceptionMonitor 仅旁路观测，不改变 Node 默认的崩溃退出语义（保活任务会按周期重新拉起）
process.on('uncaughtExceptionMonitor', (err, origin) => {
  logDaemonEvent(`FATAL ${origin}: ${err?.stack || err}`);
});
process.on('exit', (code) => {
  if (code) logDaemonEvent(`Process exiting with code ${code}`);
});

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
  closeAllBrowserWatchers();
  for (const [, entry] of attachedTargets.entries()) {
    try {
      entry.ws.close();
    } catch {}
  }
  attachedTargets.clear();
  attachingTargetIds.clear();
  destroyedWhileAttaching.clear();
  targetThemeModes.clear();
  targetDarkPresets.clear();
  targetLightPresets.clear();
  targetMetaMap.clear();
  skippedNonHostTargets.clear();
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
    let prevPid = 0;
    let prevPidState = 'none';
    if (fs.existsSync(PID_FILE)) {
      const { pid: oldPid, startMs: oldStartMs, stopRequested } = parsePidFile(PID_FILE);
      prevPid = oldPid;
      prevPidState = stopRequested ? 'stop-requested' : 'self-or-empty';
      if (!stopRequested && oldPid > 0 && oldPid !== process.pid) {
        const pidState = checkDaemonPidState(oldPid, oldStartMs);
        prevPidState = pidState;
        if (KEEP_ALIVE_ONLY) {
          if (pidState === 'confirmed' || pidState === 'uncertain') {
            process.exit(0);
          }
        } else if (pidState === 'confirmed') {
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
    logDaemonEvent(
      `Daemon started (${BASE_VERSION}, ${KEEP_ALIVE_ONLY ? 'via --keep-alive' : 'direct start'}); previous PID ${prevPid || 'none'} [${prevPidState}]`
    );
    const cleanPid = () => {
      cleanupWslSqliteStagingCache();
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
      daemonExiting = true;
      closeAllBrowserWatchers();
      cleanPid();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      daemonExiting = true;
      closeAllBrowserWatchers();
      cleanPid();
      process.exit(0);
    });
  } catch (err) {
    logDaemonEvent(`PID lock init warning: ${err?.message || err}`);
  }
}

// --keep-alive 确认原 daemon 已退出、由本进程接管后，再构建注入 bundle
if (KEEP_ALIVE_ONLY) rebuildBundleIfNeeded();

// ============================================================================
// 4. SQLite + Protobuf 实时会话指标解析器（读取 ~/.gemini/antigravity/conversations/<id>.db）
// ============================================================================

function parseProtoAll(buf, tolerant = false) {
  const fields = [];
  if (!buf || typeof buf.length !== 'number' || buf.length === 0) return fields;
  let i = 0;
  const n = buf.length;
  while (i < n) {
    let tag = 0;
    let shift = 0;
    while (i < n) {
      const b = buf[i++];
      tag |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
      if (shift > 35) return fields;
    }
    const fn = tag >>> 3;
    const wt = tag & 7;
    if (fn <= 0 || fn > 10000) break;
    if (wt === 0) {
      let val = 0;
      let m = 1;
      while (i < n) {
        const b = buf[i++];
        val += (b & 0x7f) * m;
        if (!(b & 0x80)) break;
        m *= 128;
        if (m > 2 ** 64) return fields;
      }
      fields.push({ f: fn, w: 0, v: val });
    } else if (wt === 2) {
      let len = 0;
      let s = 0;
      while (i < n) {
        const b = buf[i++];
        len |= (b & 0x7f) << s;
        if (!(b & 0x80)) break;
        s += 7;
        if (s > 35) return fields;
      }
      if (len < 0 || i + len > n) {
        if (tolerant && i < n) {
          fields.push({ f: fn, w: 2, buf: buf.subarray(i), partial: true });
        }
        break;
      }
      fields.push({ f: fn, w: 2, buf: buf.subarray(i, i + len) });
      i += len;
    } else if (wt === 1) {
      if (i + 8 > n) break;
      fields.push({ f: fn, w: 1, buf: buf.subarray(i, i + 8) });
      i += 8;
    } else if (wt === 5) {
      if (i + 4 > n) break;
      fields.push({ f: fn, w: 5, buf: buf.subarray(i, i + 4) });
      i += 4;
    } else {
      break;
    }
  }
  return fields;
}

function parseProto(buf) {
  const out = new Map();
  for (const fld of parseProtoAll(buf, false)) {
    out.set(fld.f, fld.w === 0 ? fld.v : fld.buf);
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

function getSqliteFileSig(dbPath, { trackUnc = false } = {}) {
  try {
    const unc = trackUnc && isUncPath(dbPath);
    if (unc && Date.now() < wslUncBackoffUntil) return null;
    const t0 = Date.now();
    const st = fs.statSync(dbPath, { throwIfNoEntry: false });
    markUncSlowIfExceeded(unc, t0);
    if (!st) return null;
    let wst = null;
    if (!unc || Date.now() >= wslUncBackoffUntil) {
      wst = fs.statSync(`${dbPath}-wal`, { throwIfNoEntry: false });
      markUncSlowIfExceeded(unc, t0);
    }
    const baseSig = `${st.mtimeMs}:${st.size}`;
    const walSig = wst ? `${wst.mtimeMs}:${wst.size}` : '0:0';
    return {
      dbPath,
      baseSig,
      walSize: wst ? wst.size || 0 : 0,
      mtimeMs: Math.max(st.mtimeMs || 0, wst ? wst.mtimeMs || 0 : 0),
      sig: `${baseSig}|${walSig}`
    };
  } catch {
    return null;
  }
}

function getDbStatByPath(dbPath) {
  return getSqliteFileSig(dbPath, { trackUnc: false });
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
    markUncSlowIfExceeded(cachedUnc, tCheck);
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
      if (markUncSlowIfExceeded(true, t0)) break;
    }
    markUncSlowIfExceeded(true, t0);
    const probesStillCold = !RUN_ONCE && cachedRunningWslDistros.probedAt === 0;
    if (!probesStillCold) {
      if (negativeCascadeWslCache.size >= 128) {
        negativeCascadeWslCache.clear();
      }
      negativeCascadeWslCache.set(cacheKey, Date.now() + 10000);
    }
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
    const info = getSqliteFileSig(dbPath, { trackUnc: true });
    if (!info) {
      if (!unc || Date.now() >= wslUncBackoffUntil) {
        lastKnownDbStateCache.delete(dbPath);
      }
      return null;
    }
    const stateObj = {
      dbPath,
      rawSig: info.sig,
      sig: `${dbPath}#${info.sig}`
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
let wslOrphanTmpSwept = false;
const wslSqliteStagingCache = new Map(); // dbPath -> { tmpBase, baseSig, lastUsedMs }
const MAX_WSL_STAGING_ENTRIES = 6;

function sweepOrphanWslStagingFilesOnce() {
  if (wslOrphanTmpSwept || process.platform !== 'win32') return;
  wslOrphanTmpSwept = true;
  try {
    const tmpDir = os.tmpdir();
    const now = Date.now();
    for (const name of fs.readdirSync(tmpDir)) {
      if (!name.startsWith('ag-wsl-sqlite-') || name.startsWith(`ag-wsl-sqlite-${process.pid}-`)) continue;
      const full = path.join(tmpDir, name);
      try {
        const st = fs.statSync(full, { throwIfNoEntry: false });
        if (st && now - (st.mtimeMs || 0) > 7200000) {
          fs.rmSync(full, { force: true });
        }
      } catch {}
    }
  } catch {}
}

function removeWslStagingEntry(dbPath) {
  const ent = wslSqliteStagingCache.get(dbPath);
  if (!ent) return;
  wslSqliteStagingCache.delete(dbPath);
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(`${ent.tmpBase}${suffix}`, { force: true });
    } catch {}
  }
}

function cleanupWslSqliteStagingCache() {
  for (const key of [...wslSqliteStagingCache.keys()]) {
    removeWslStagingEntry(key);
  }
}

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
  let baseSig = '';
  let hasActiveWal = false;
  try {
    const st = fs.statSync(dbPath, { throwIfNoEntry: false });
    if (st) baseSig = `${st.mtimeMs}:${st.size}`;
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

  // 活跃 WAL 流式会话主库副本按 baseSig 缓存复用（O(1) LRU）：主库未发生 checkpoint 时每拍仅拷贝轻量 -wal，消除每 2.5s 跨 P9 拷贝数十 MB 主库
  sweepOrphanWslStagingFilesOnce();
  let staged = baseSig ? wslSqliteStagingCache.get(dbPath) : null;
  let tmpBase = '';
  let reuseStaged = false;
  if (staged && staged.baseSig === baseSig && fs.existsSync(staged.tmpBase)) {
    tmpBase = staged.tmpBase;
    staged.lastUsedMs = Date.now();
    wslSqliteStagingCache.delete(dbPath);
    wslSqliteStagingCache.set(dbPath, staged);
    reuseStaged = true;
  } else {
    if (staged) removeWslStagingEntry(dbPath);
    while (wslSqliteStagingCache.size >= MAX_WSL_STAGING_ENTRIES) {
      const oldestKey = wslSqliteStagingCache.keys().next().value;
      if (!oldestKey) break;
      removeWslStagingEntry(oldestKey);
    }
    wslSqliteTmpSeq = (wslSqliteTmpSeq + 1) % 1000000;
    tmpBase = path.join(os.tmpdir(), `ag-wsl-sqlite-${process.pid}-${wslSqliteTmpSeq}.db`);
  }

  let tmpDb = null;
  let copySucceeded = reuseStaged;
  try {
    for (const suffix of ['-wal', '-shm']) {
      try {
        fs.rmSync(`${tmpBase}${suffix}`, { force: true });
      } catch {}
    }
    if (!reuseStaged) {
      fs.copyFileSync(dbPath, tmpBase);
      copySucceeded = true;
      if (baseSig) {
        wslSqliteStagingCache.set(dbPath, { tmpBase, baseSig, lastUsedMs: Date.now() });
      }
    }
    if (hasActiveWal) {
      try {
        fs.copyFileSync(walPath, `${tmpBase}-wal`);
        if (reuseStaged) {
          const postSt = fs.statSync(dbPath, { throwIfNoEntry: false });
          const postSig = postSt ? `${postSt.mtimeMs}:${postSt.size}` : '';
          if (postSig && postSig !== baseSig) {
            // 拷贝 -wal 瞬间恰好发生 SQLite checkpoint，重拷最新主库保证主库与 WAL 一致
            fs.copyFileSync(dbPath, tmpBase);
            baseSig = postSig;
            wslSqliteStagingCache.set(dbPath, { tmpBase, baseSig, lastUsedMs: Date.now() });
          }
        }
      } catch (walErr) {
        if (walErr?.code === 'ENOENT') {
          // 拷贝瞬间 -wal 已被 checkpoint 回收，重拷最新主库即可获得完整数据
          fs.copyFileSync(dbPath, tmpBase);
          const postSt = fs.statSync(dbPath, { throwIfNoEntry: false });
          baseSig = postSt ? `${postSt.mtimeMs}:${postSt.size}` : '';
          if (baseSig) {
            wslSqliteStagingCache.set(dbPath, { tmpBase, baseSig, lastUsedMs: Date.now() });
          }
        } else {
          throw walErr;
        }
      }
    }
    tmpDb = new DatabaseSync(tmpBase, { readOnly: true, timeout: timeoutMs });
    return fn(tmpDb);
  } catch (err) {
    removeWslStagingEntry(dbPath);
    copySucceeded = false;
    throw err;
  } finally {
    try {
      tmpDb?.close();
    } catch {}
    // 每次关闭后必删 -wal 与 -shm 以防下一拍 WAL 索引错位；若未纳入 baseSig 复用则一并删主库
    const suffixesToClean = copySucceeded && baseSig ? ['-wal', '-shm'] : ['', '-wal', '-shm'];
    for (const suffix of suffixesToClean) {
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
        } else if (statInfo.sig === prevSig && nowMs - statInfo.mtimeMs >= 300000) {
          // 超过 5 分钟仍未写入 trajectory_metadata 的历史空库移出高频轮询队列（后续若产生新 -wal 仍由 dirChanged 自动捕获）
          dirState.noMetaPending.delete(uuid);
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
        if (!res.permanentInvalid && Date.now() - item.mtimeMs < 300000) {
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
  const estCtx = ctxWin.get(1) || 0;
  const maxCtx = ctxWin.get(4) || 0;
  const ttftRaw = chat.get(11);
  const ttftMap = ttftRaw instanceof Uint8Array ? parseProto(ttftRaw) : new Map();
  const streamRaw = chat.get(12);
  const streamMap = streamRaw instanceof Uint8Array ? parseProto(streamRaw) : new Map();

  const inTok = usage.get(2) || 0;
  const outTok = usage.get(3) || 0;
  const cacheRead = usage.get(5) || 0;
  const apiProvider = usage.get(6) || 0;
  const thinkTok = usage.get(9) || 0;
  const respTok = usage.get(10) || 0;
  const slugRaw = chat.get(19);
  const slug = slugRaw instanceof Uint8Array ? textDecoder.decode(slugRaw) : '';
  const thinkUnreported =
    !usage.has(9) && thinkTok === 0 && (apiProvider === 26 || /^claude-/i.test(slug));
  const ttft = (ttftMap.get(1) || 0) + (ttftMap.get(2) || 0) / 1e9;
  const stream = (streamMap.get(1) || 0) + (streamMap.get(2) || 0) / 1e9;

  return {
    idx: r.idx,
    inTok,
    outTok,
    cacheRead,
    ctx: inTok + cacheRead,
    estCtx,
    maxCtx,
    thinkTok,
    respTok,
    thinkUnreported,
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
  if (!state || !state.dbPath || !state.sig) return { cascadeId, hasData: false, dbFound: false };
  const { dbPath, sig } = state;
  const conversationsDir = path.dirname(dbPath);
  const childSnap =
    precomputedChildSnap || getCompositeChildSnapshot(cascadeId, conversationsDir, state.rawSig || sig);
  const isEnMetrics = activeConfig.modules?.i18n === false || activeConfig.installedLocale === 'none';
  const compositeSig = `${childSnap?.sig || sig}|${isEnMetrics ? 'en' : 'zh'}`;

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
      const rawUserLastIdx = userStat?.lastIdx ?? -1;
      const rawUserStepsCount = userStat?.cnt ?? 0;
      let lastTurnStepIdx = rawUserLastIdx;
      let effectiveTurnsCount = rawUserStepsCount;
      let isSubagentWakeTurns = false;
      if (rawUserStepsCount === 0) {
        // 子 Agent 与 Swarm Worker 会话不含 step_type=14，改按外部消息唤醒边界切分轮次（合并连发 [Message] 并排除自身后台 /task- 与系统广播）
        isSubagentWakeTurns = true;
        const wakeStat = db
          .prepare(
            `SELECT COUNT(*) AS cnt, COALESCE(MAX(s.idx), -1) AS lastIdx
             FROM steps s
             WHERE s.step_type = 101
               AND instr(substr(s.step_payload, 1, 1024), CAST('[Message]' AS BLOB)) > 0
               AND instr(substr(s.step_payload, 1, 1024), CAST('/task-' AS BLOB)) = 0
               AND instr(substr(s.step_payload, 1, 1024), CAST('sender=system' AS BLOB)) = 0
               AND NOT EXISTS (
                 SELECT 1 FROM steps p
                 WHERE p.idx = s.idx - 1
                   AND p.step_type = 101
                   AND instr(substr(p.step_payload, 1, 1024), CAST('[Message]' AS BLOB)) > 0
               )`
          )
          .get();
        const wakeCnt = wakeStat?.cnt ?? 0;
        lastTurnStepIdx = wakeStat?.lastIdx ?? -1;
        effectiveTurnsCount = wakeCnt > 0 ? wakeCnt : 1;
      }
      const turnStat = db
        .prepare('SELECT COUNT(*) AS cnt FROM steps WHERE step_type = 15 AND idx > ?')
        .get(lastTurnStepIdx);
      const rawTurnSteps = turnStat?.cnt ?? 0;

      let inc = incrementalMetricsMap.get(dbPath);
      if (
        inc &&
        (rowCount < inc.rowCount ||
          maxIdx < inc.maxIdx ||
          effectiveTurnsCount < inc.userStepsCount ||
          lastTurnStepIdx < inc.lastUserStepIdx ||
          isSubagentWakeTurns !== Boolean(inc.isSubagentWakeTurns) ||
          (lastTurnStepIdx !== inc.lastUserStepIdx && effectiveTurnsCount <= inc.userStepsCount))
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
          inc.userStepsCount = effectiveTurnsCount;
          inc.lastUserStepIdx = lastTurnStepIdx;
          inc.isSubagentWakeTurns = isSubagentWakeTurns;
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
          userStepsCount: effectiveTurnsCount,
          lastUserStepIdx: lastTurnStepIdx,
          isSubagentWakeTurns,
          items,
          validItems,
          totalIn,
          totalCache,
          totalOut,
          totalThink,
          totalResp
        };
      }

      return { empty: false, inc, userStepsCount: effectiveTurnsCount, isSubagentWakeTurns, rawTurnSteps };
    });

    if (parentDbRes.empty) {
      incrementalMetricsMap.delete(dbPath);
      const emptyPayload = {
        cascadeId,
        hasData: false,
        dbFound: true,
        sig: compositeSig,
        isDraining: Boolean(childSnap?.isDraining),
        partialStale: Boolean(childSnap?.partialStale)
      };
      if (!childSnap?.isDraining && !childSnap?.partialStale) {
        setMetricsCache(dbPath, { sig: compositeSig, payload: emptyPayload });
      }
      return emptyPayload;
    }

    const { inc, userStepsCount, isSubagentWakeTurns, rawTurnSteps } = parentDbRes;
    if (uncParent && Date.now() - tParentWallStart > 400) {
      wslUncBackoffUntil = Date.now() + 45000;
    }
    setIncrementalMetrics(dbPath, inc);

    const { validItems: valid, totalIn, totalCache, totalOut, totalThink, totalResp } = inc;
    if (valid.length === 0) {
      const emptyPayload = {
        cascadeId,
        hasData: false,
        dbFound: true,
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
    let turnIn = 0;
    let turnOut = 0;
    let turnThink = 0;
    let turnResp = 0;
    let turnDur = 0;
    let turnAllThinkUnreported = turnSlice.length > 0;
    for (let i = 0; i < turnSlice.length; i++) {
      turnIn += turnSlice[i].inTok;
      turnOut += turnSlice[i].outTok;
      turnThink += turnSlice[i].thinkTok;
      turnResp += turnSlice[i].respTok;
      turnDur += turnSlice[i].totDur;
      if (!turnSlice[i].thinkUnreported || turnSlice[i].thinkTok > 0) {
        turnAllThinkUnreported = false;
      }
    }
    let sessionAllThinkUnreported = totalThink === 0 && valid.length > 0;
    if (sessionAllThinkUnreported) {
      for (let i = 0; i < valid.length; i++) {
        if (!valid[i].thinkUnreported) {
          sessionAllThinkUnreported = false;
          break;
        }
      }
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
    // 统一以真实计费上下文 last.ctx 计算胶囊水位与压缩预警（实证 61 次压缩前夕 last.ctx 落在 92%~100%），消除双数不一致
    const ctxPct = Math.round((last.ctx / contextLimitTokens) * 100);
    const ctxClass = ctxPct >= 90 ? 'ag-ctx-crit' : ctxPct >= 75 ? 'ag-ctx-warn' : 'ag-ctx-ok';
    const lastCacheRate = last.ctx > 0 ? ((last.cacheRead / last.ctx) * 100).toFixed(1) : '0.0';
    const sessionCacheRate = totalIn + totalCache > 0 ? ((totalCache / (totalIn + totalCache)) * 100).toFixed(1) : '0.0';
    const remainCtx = Math.max(0, contextLimitTokens - last.ctx);

    const zhWarnActive =
      !isEnMetrics &&
      process.platform === 'darwin' &&
      (zhTitleStatus.state === 'tcc_blocked' || zhTitleStatus.state === 'stale_inode');
    const zhWarnInlineHtml = zhWarnActive
      ? `<span class="ag-sep">·</span><span class="ag-zh-warn-dot" title="${escapeHtmlSafe(zhTitleStatus.label)}">●</span>`
      : '';
    const subSyncing = isDraining || partialStale;
    const zhCmdEsc = zhWarnActive && zhTitleStatus.cmd ? escapeHtmlSafe(zhTitleStatus.cmd) : '';
    const zhCmdRowHtml = zhCmdEsc
      ? `<div class="ag-tt-warn-cmd-row"><code class="ag-tt-warn-cmd">${zhCmdEsc}</code><button type="button" class="ag-tt-copy-btn" data-ag-copy-cmd="${zhCmdEsc}">复制命令</button></div>`
      : '';
    const zhWarnRowHtml = zhWarnActive
      ? `<div class="ag-tt-warn"><div class="ag-tt-warn-hdr"><span class="ag-tt-warn-lbl">⚠ ${escapeHtmlSafe(zhTitleStatus.label)}</span></div><span class="ag-tt-warn-val">${escapeHtmlSafe(zhTitleStatus.detail)}</span>${zhCmdRowHtml}</div>`
      : '';

    const isFullMetrics = activeConfig.metricsMode === 'full';
    const turnsUnitEn = isSubagentWakeTurns ? (userStepsCount === 1 ? 'wake' : 'wakes') : (userStepsCount === 1 ? 'turn' : 'turns');
    const turnsUnitZh = isSubagentWakeTurns ? '次唤醒' : '轮提问';
    let inlineHtml = '';
    let tooltipHtml = '';

    if (isFullMetrics) {
      const subInlineHtml =
        childCount > 0 ? `<span class="ag-sep">·</span><span class="ag-sub-badge">+${childCount} sub</span>` : '';
      inlineHtml = [
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

      const turnOutDetailEn = turnAllThinkUnreported
        ? `Out ${fmtNum(turnOut)} (Think+Resp merged)`
        : `Out ${fmtNum(turnOut)} (Think ${fmtNum(turnThink)} + Resp ${fmtNum(turnResp)})`;
      const turnOutDetailZh = turnAllThinkUnreported
        ? `输出 ${fmtNum(turnOut)} (含思考链)`
        : `输出 ${fmtNum(turnOut)} (思考 ${fmtNum(turnThink)} + 响应 ${fmtNum(turnResp)})`;
      const turnRowHtml =
        turnSteps > 1
          ? isEnMetrics
            ? `<div class="ag-tt-row"><span class="ag-tt-lbl">Turn Total (${turnSteps} steps)</span><span class="ag-tt-val">${turnOutDetailEn} | ${turnDur.toFixed(1)}s</span></div>`
            : `<div class="ag-tt-row"><span class="ag-tt-lbl">本轮合计 (${turnSteps}步)</span><span class="ag-tt-val">${turnOutDetailZh} | 耗时 ${turnDur.toFixed(1)}s</span></div>`
          : '';
      const combinedOut = totalOut + childOut;
      const subRowHtml =
        childCount > 0
          ? isEnMetrics
            ? `<div class="ag-tt-row"><span class="ag-tt-lbl">Subagents (${childCount}${subSyncing ? ' · syncing' : ''})</span><span class="ag-tt-val">${childCalls} calls · New ${fmtTok(childIn)} + Cache ${fmtTok(childCache)} · Out ${fmtTok(childOut)}</span></div>`
            : `<div class="ag-tt-row"><span class="ag-tt-lbl">子 Agent (${childCount}${subSyncing ? ' · 同步中' : ''})</span><span class="ag-tt-val">${childCalls} 次 · 新增 ${fmtTok(childIn)} + 缓存 ${fmtTok(childCache)} · 输出 ${fmtTok(childOut)}</span></div>`
          : descendantIds.length > 0 && subSyncing
            ? isEnMetrics
              ? `<div class="ag-tt-row"><span class="ag-tt-lbl">Subagents (syncing)</span><span class="ag-tt-val">Indexing ${descendantIds.length} sub-sessions…</span></div>`
              : `<div class="ag-tt-row"><span class="ag-tt-lbl">子 Agent (同步中)</span><span class="ag-tt-val">正在索引 ${descendantIds.length} 个子会话…</span></div>`
            : '';
      const outputRowHtml =
        childCount > 0
          ? isEnMetrics
            ? `<div class="ag-tt-row"><span class="ag-tt-lbl">Total Output</span><span class="ag-tt-val">Total ${fmtTok(combinedOut)} (Main ${fmtTok(totalOut)} + Sub ${fmtTok(childOut)})</span></div>`
            : `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输出量</span><span class="ag-tt-val">总计 ${fmtTok(combinedOut)} (主 ${fmtTok(totalOut)} + 子 ${fmtTok(childOut)})</span></div>`
          : sessionAllThinkUnreported
            ? isEnMetrics
              ? `<div class="ag-tt-row"><span class="ag-tt-lbl">Total Output</span><span class="ag-tt-val">Total ${fmtTok(totalOut)} (Think+Resp merged)</span></div>`
              : `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输出量</span><span class="ag-tt-val">总计 ${fmtTok(totalOut)} (接口合并计入思考链)</span></div>`
            : isEnMetrics
              ? `<div class="ag-tt-row"><span class="ag-tt-lbl">Total Output</span><span class="ag-tt-val">Total ${fmtTok(totalOut)} (Think ${fmtTok(totalThink)} + Resp ${fmtTok(totalResp)})</span></div>`
              : `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输出量</span><span class="ag-tt-val">总计 ${fmtTok(totalOut)} (思考链 ${fmtTok(totalThink)} + 正文/工具 ${fmtTok(totalResp)})</span></div>`;
      const stepOutValEn = last.thinkUnreported
        ? `${fmtNum(last.outTok)} (Think+Resp merged)`
        : `${fmtNum(last.outTok)} (Think ${fmtNum(last.thinkTok)} + Resp ${fmtNum(last.respTok)})`;
      const stepOutValZh = last.thinkUnreported
        ? `${fmtNum(last.outTok)} (接口合并计入思考链)`
        : `${fmtNum(last.outTok)} (思考链 ${fmtNum(last.thinkTok)} + 正文/工具 ${fmtNum(last.respTok)})`;

      tooltipHtml = isEnMetrics
        ? [
            `<div class="ag-tt-hdr">Latest Call (Gen #${last.idx + 1})</div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">Throughput</span><span class="ag-tt-val">${useStream ? `Stream ${rawStreamTps.toFixed(1)} tok/s | ` : ''}E2E ${e2eTps.toFixed(1)} tok/s</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">Latency</span><span class="ag-tt-val">${useStream ? `TTFT ${last.ttft.toFixed(2)}s | Stream ${last.stream.toFixed(2)}s | Total ${last.totDur.toFixed(2)}s` : `Wait ${last.ttft.toFixed(2)}s | Flush ${last.stream.toFixed(2)}s | Total ${last.totDur.toFixed(2)}s`}</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">Context</span><span class="ag-tt-val">${fmtNum(last.ctx)} (New ${fmtNum(last.inTok)} + Cache ${fmtNum(last.cacheRead)}, ${lastCacheRate}%)</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">Step Output</span><span class="ag-tt-val">${stepOutValEn}</span></div>`,
            turnRowHtml,
            `<div class="ag-tt-hdr ag-tt-sec">Session Total (${userStepsCount} ${turnsUnitEn} / ${valid.length} calls)</div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">Compaction</span><span class="ag-tt-val">${fmtTok(last.ctx)} / ${limitStr} (${ctxPct}%) · ${fmtTok(remainCtx)} left</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">Total Input</span><span class="ag-tt-val">New ${fmtTok(totalIn)} + Cache ${fmtTok(totalCache)} (${sessionCacheRate}% hit)</span></div>`,
            subRowHtml,
            outputRowHtml
          ].join('')
        : [
            `<div class="ag-tt-hdr">本轮最新调用 (Gen #${last.idx + 1})</div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">生成速度</span><span class="ag-tt-val">${useStream ? `流式 ${rawStreamTps.toFixed(1)} tok/s | ` : ''}端到端（含等待） ${e2eTps.toFixed(1)} tok/s</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">响应耗时</span><span class="ag-tt-val">${useStream ? `TTFT ${last.ttft.toFixed(2)}s | 流式 ${last.stream.toFixed(2)}s | 总计 ${last.totDur.toFixed(2)}s` : `等待 ${last.ttft.toFixed(2)}s | 刷出 ${last.stream.toFixed(2)}s | 总计 ${last.totDur.toFixed(2)}s`}</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">当前上下文</span><span class="ag-tt-val">${fmtNum(last.ctx)} (新增 ${fmtNum(last.inTok)} + 缓存 ${fmtNum(last.cacheRead)}, ${lastCacheRate}%)</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">本步输出量</span><span class="ag-tt-val">${stepOutValZh}</span></div>`,
            turnRowHtml,
            `<div class="ag-tt-hdr ag-tt-sec">当前会话累计 (${userStepsCount} ${turnsUnitZh} / ${valid.length} 次有效调用)</div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">压缩水位线</span><span class="ag-tt-val">${fmtTok(last.ctx)} / ${limitStr} (${ctxPct}%) · 距压缩余 ${fmtTok(remainCtx)}</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输入量</span><span class="ag-tt-val">新增 ${fmtTok(totalIn)} + 缓存读取 ${fmtTok(totalCache)} (命中率 ${sessionCacheRate}%)</span></div>`,
            subRowHtml,
            outputRowHtml,
            zhWarnRowHtml
          ].join('');
    } else {
      const clampedPct = Math.max(0, Math.min(100, ctxPct));
      const ringVisualPct = last.ctx > 0 && clampedPct < 5 ? 5 : clampedPct;
      const ringCircum = 36.44;
      const ringOffset = (ringCircum * (1 - ringVisualPct / 100)).toFixed(2);
      const ringSvg = `<svg class="ag-ctx-ring ${ctxClass}" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle class="ag-ctx-ring-track" cx="8" cy="8" r="5.8" fill="none" stroke-width="2.1"/><circle class="ag-ctx-ring-fill" cx="8" cy="8" r="5.8" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-dasharray="${ringCircum}" stroke-dashoffset="${ringOffset}" transform="rotate(-90 8 8)"/></svg>`;

      inlineHtml = [
        ringSvg,
        `<span class="ag-ring-after">${Math.round(displayTps)} tok/s</span>`,
        `<span class="ag-sep">·</span>`,
        `<span>${useStream ? 'TTFT' : 'Hold'} ${last.ttft.toFixed(1)}s</span>`,
        zhWarnInlineHtml
      ].join('');

      const turnDisplayNum = userStepsCount > 0 ? userStepsCount : last.idx + 1;
      const effectiveTurnSteps = turnSteps > 0 ? turnSteps : 1;
      const effectiveTurnDur = turnSteps > 0 ? turnDur : last.totDur;
      const turnDurStr = effectiveTurnDur >= 10 ? `${Math.round(effectiveTurnDur)}s` : `${effectiveTurnDur.toFixed(1)}s`;

      const effectiveTurnIn = turnSteps > 0 ? turnIn : last.inTok;
      const effectiveTurnOut = turnSteps > 0 ? turnOut : last.outTok;
      const effectiveTurnThink = turnSteps > 0 ? turnThink : last.thinkTok;
      const effectiveTurnResp = turnSteps > 0 ? turnResp : last.respTok;
      const effectiveThinkUnreported = turnSteps > 0 ? turnAllThinkUnreported : Boolean(last.thinkUnreported);
      const splitSum = (effectiveTurnThink || 0) + (effectiveTurnResp || 0);
      const thinkRatioPct = splitSum > 0 ? Math.round(((effectiveTurnThink || 0) / splitSum) * 100) : 0;
      const respRatioPct = 100 - thinkRatioPct;

      const resolveCacheTier = (rateVal) =>
        rateVal >= 95 ? 'good' : rateVal >= 90 ? 'fair' : rateVal >= 50 ? 'low' : 'bad';
      const lastCacheTier = resolveCacheTier(Number(lastCacheRate) || 0);
      const sessionCacheTier = resolveCacheTier(Number(sessionCacheRate) || 0);
      const ctxVolTier = last.ctx > 400000 ? 'bad' : last.ctx >= 200000 ? 'fair' : 'good';

      const compactSplitRowEn = effectiveThinkUnreported
        ? `<div class="ag-tt-row ag-tt-row-merged"><span class="ag-tt-lbl">Output</span><span class="ag-tt-val">${fmtTok(effectiveTurnOut)} <span class="ag-tt-lbl">(Think+Resp merged)</span></span></div>`
        : `<div class="ag-tt-row ag-tt-row-merged"><span class="ag-tt-lbl">Output Split</span><span class="ag-tt-split-group"><span class="ag-tt-split-ratio ag-tt-think-lbl">Think ${thinkRatioPct}%</span><span class="ag-tt-split-track"><span class="ag-tt-split-think" style="width:${thinkRatioPct}%"></span><span class="ag-tt-split-resp" style="width:${respRatioPct}%"></span></span><span class="ag-tt-split-ratio ag-tt-resp-lbl">Resp ${respRatioPct}%</span></span></div>`;
      const compactSplitRowZh = effectiveThinkUnreported
        ? `<div class="ag-tt-row ag-tt-row-merged"><span class="ag-tt-lbl">本轮输出</span><span class="ag-tt-val">${fmtTok(effectiveTurnOut)} <span class="ag-tt-lbl">(接口合并计入思考链)</span></span></div>`
        : `<div class="ag-tt-row ag-tt-row-merged"><span class="ag-tt-lbl">输出比例</span><span class="ag-tt-split-group"><span class="ag-tt-split-ratio ag-tt-think-lbl">思考链 ${thinkRatioPct}%</span><span class="ag-tt-split-track"><span class="ag-tt-split-think" style="width:${thinkRatioPct}%"></span><span class="ag-tt-split-resp" style="width:${respRatioPct}%"></span></span><span class="ag-tt-split-ratio ag-tt-resp-lbl">正文/工具 ${respRatioPct}%</span></span></div>`;
      const turnHdrLabelEn = isSubagentWakeTurns ? `Wake #${turnDisplayNum}` : `Turn #${turnDisplayNum}`;
      const turnHdrLabelZh = isSubagentWakeTurns ? `第${turnDisplayNum}次唤醒` : `第${turnDisplayNum}轮`;

      tooltipHtml = isEnMetrics
        ? [
            `<div class="ag-tt-hdr"><span>Current Turn</span><span class="ag-tt-hdr-meta">${turnHdrLabelEn} · ${effectiveTurnSteps} ${effectiveTurnSteps === 1 ? 'step' : 'steps'} · ${turnDurStr}</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">Throughput</span><span class="ag-tt-val">${useStream ? `Stream ${rawStreamTps.toFixed(1)} tok/s | ` : ''}E2E ${e2eTps.toFixed(1)} tok/s</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">Latency</span><span class="ag-tt-val">${useStream ? `TTFT ${last.ttft.toFixed(2)}s | Stream ${last.stream.toFixed(2)}s | Total ${last.totDur.toFixed(2)}s` : `Wait ${last.ttft.toFixed(2)}s | Flush ${last.stream.toFixed(2)}s | Total ${last.totDur.toFixed(2)}s`}</span></div>`,
            `<div class="ag-tt-row ag-tt-row-merged"><span class="ag-tt-lbl">Net Input</span><span class="ag-tt-compact-right"><span class="ag-tt-val">+${fmtTok(effectiveTurnIn)}</span><span class="ag-tt-cache-tag ag-cache-${lastCacheTier}">Cache ${lastCacheRate}%</span></span></div>`,
            compactSplitRowEn,
            `<div class="ag-tt-hdr ag-tt-sec"><span>Session Total</span><span class="ag-tt-hdr-meta">${userStepsCount} ${turnsUnitEn} / ${valid.length} calls</span></div>`,
            `<div class="ag-tt-row ag-tt-row-merged"><span class="ag-tt-bar-group"><span class="ag-tt-ctx-bar"><span class="ag-tt-ctx-fill ${ctxClass}" style="width:${clampedPct}%"></span></span><span class="ag-tt-bar-lbl ag-tt-num-${ctxVolTier}">${fmtTok(last.ctx)}/${limitStr} (${ctxPct}%)</span></span><span class="ag-tt-nowrap"><span class="ag-tt-lbl">Avg Cache </span><span class="ag-tt-val ag-tt-num-${sessionCacheTier}">${sessionCacheRate}%</span></span></div>`
          ].join('')
        : [
            `<div class="ag-tt-hdr"><span>当前轮次</span><span class="ag-tt-hdr-meta">${turnHdrLabelZh} 总${effectiveTurnSteps}步 共耗时${turnDurStr}</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">生成速度</span><span class="ag-tt-val">${useStream ? `流式 ${rawStreamTps.toFixed(1)} tok/s | ` : ''}端到端 ${e2eTps.toFixed(1)} tok/s</span></div>`,
            `<div class="ag-tt-row"><span class="ag-tt-lbl">响应耗时</span><span class="ag-tt-val">${useStream ? `TTFT ${last.ttft.toFixed(2)}s | 流式 ${last.stream.toFixed(2)}s | 总计 ${last.totDur.toFixed(2)}s` : `等待 ${last.ttft.toFixed(2)}s | 刷出 ${last.stream.toFixed(2)}s | 总计 ${last.totDur.toFixed(2)}s`}</span></div>`,
            `<div class="ag-tt-row ag-tt-row-merged"><span class="ag-tt-lbl">本轮净增</span><span class="ag-tt-compact-right"><span class="ag-tt-val">+${fmtTok(effectiveTurnIn)}</span><span class="ag-tt-cache-tag ag-cache-${lastCacheTier}">缓存率 ${lastCacheRate}%</span></span></div>`,
            compactSplitRowZh,
            `<div class="ag-tt-hdr ag-tt-sec"><span>会话总计</span><span class="ag-tt-hdr-meta">${userStepsCount} ${turnsUnitZh} / ${valid.length} 次调用</span></div>`,
            `<div class="ag-tt-row ag-tt-row-merged"><span class="ag-tt-bar-group"><span class="ag-tt-ctx-bar"><span class="ag-tt-ctx-fill ${ctxClass}" style="width:${clampedPct}%"></span></span><span class="ag-tt-bar-lbl ag-tt-num-${ctxVolTier}">${fmtTok(last.ctx)}/${limitStr} (${ctxPct}%)</span></span><span class="ag-tt-nowrap"><span class="ag-tt-lbl">全轮次平均缓存 </span><span class="ag-tt-val ag-tt-num-${sessionCacheTier}">${sessionCacheRate}%</span></span></div>`,
            zhWarnRowHtml
          ].join('');
    }

    const uncBackoffActive = Boolean(
      childSnap?.uncBackoffActive || (uncParent && Date.now() < wslUncBackoffUntil)
    );
    const payload = {
      cascadeId,
      hasData: true,
      dbFound: true,
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
// 4.5 SQLite 全量增量 Token 统计分析（系统设置弹窗「Token 统计」Tab）
// ============================================================================

const TA_MEM_FILE_RE = /(?:^|[\\/])MEMORY\.md$|[\\/]\.gemini[\\/]antigravity[\\/]knowledge[\\/]|[\\/]memories[\\/]/i;
const TA_SLUG_LABELS = {
  'gemini-pro-orchestrator': 'Orchestrator (Carbon)',
  'gemini-pro-orchestrator-neon': 'Orchestrator (Neon)',
  'gemini-pro-orchestrator-g1-pro': 'Orchestrator (Argon)',
  'gemini-pro-orchestrator-argon': 'Orchestrator (Argon)',
  'gemini-pro-orchestrator-carbon': 'Orchestrator (Carbon)',
  'gemini-flash-worker-agy': 'Gemini 4 Hydrogen (Orchestrator)',
  'gemini-4-hydrogen': 'Gemini 4 Hydrogen',
  'gemini-4-hydrogen-low': 'Gemini 4 Hydrogen (Low)',
  'gemini-4-hydrogen-medium': 'Gemini 4 Hydrogen (Medium)',
  'gemini-4-hydrogen-high': 'Gemini 4 Hydrogen (High)',
  'gemini-4-hydrogen-xhigh': 'Gemini 4 Hydrogen (Extra High)',
  'gemini-4-hydrogen-sonar': 'Gemini 4 Hydrogen (Sonar)',
  'gemini-4-hydrogen-tiered-high': 'Gemini 4 Hydrogen (High)',
  'gemini-4-hydrogen-tiered-xhigh': 'Gemini 4 Hydrogen (Extra High)',
  'gemini-4-argon': 'Gemini 4 Argon',
  'gemini-4-argon-b': 'Gemini 4 Argon (High)',
  'gemini-4-argon-low': 'Gemini 4 Argon (Low)',
  'gemini-4-argon-medium': 'Gemini 4 Argon (Medium)',
  'gemini-4-argon-high': 'Gemini 4 Argon (High)',
  'gemini-4-argon-trial': 'Gemini 4 Argon',
  'gemini-4-carbon': 'Gemini 4 Carbon',
  'gemini-4-carbon-low': 'Gemini 4 Carbon (Low)',
  'gemini-4-carbon-medium': 'Gemini 4 Carbon (Medium)',
  'gemini-4-carbon-high': 'Gemini 4 Carbon (High)',
  'gemini-4-neon': 'Gemini 4 Neon',
  'gemini-4-neon-low': 'Gemini 4 Neon (Low)',
  'gemini-4-neon-medium': 'Gemini 4 Neon (Medium)',
  'gemini-4-neon-high': 'Gemini 4 Neon (High)',
  'gemini-4-neon-xhigh': 'Gemini 4 Neon (XHigh)',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.8-flash-n': 'Gemini 3.8 Flash',
  'gemini-3.8-flash-low': 'Gemini 3.8 Flash (Low)',
  'gemini-3.8-flash-medium': 'Gemini 3.8 Flash (Medium)',
  'gemini-3.8-flash-high': 'Gemini 3.8 Flash (High)',
  'gemini-3.8-flash-tiered': 'Gemini 3.8 Flash',
  'gemini-3.7-flash': 'Gemini 3.7 Flash',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
  'gemini-3-pro': 'Gemini 3 Pro',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-sonnet-5-5-low': 'Claude Sonnet 5.5 (Low)',
  'claude-sonnet-5-5-medium': 'Claude Sonnet 5.5 (Medium)',
  'claude-sonnet-5-5-high': 'Claude Sonnet 5.5 (High)',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-opus-4-6-thinking': 'Claude Opus 4.6 (Thinking)',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-opus-5-5-low': 'Claude Opus 5.5 (Low)',
  'claude-opus-5-5-medium': 'Claude Opus 5.5 (Medium)',
  'claude-opus-5-5-high': 'Claude Opus 5.5 (High)',
  'claude-opus-5-5-max': 'Claude Opus 5.5 (Max)',
  'gpt-oss-120b-medium': 'GPT-OSS 120B (Medium)',
  'gpt-oss-120b-maas': 'GPT-OSS 120B',
  'gpt-oss-20b-maas': 'GPT-OSS 20B'
};

const TA_CACHE_SCHEMA_REV = 5;
const TA_CACHE_FILE = path.join(CACHE_DIR, 'token-analytics-index.json');
const TA_CACHE_SALT = crypto
  .createHash('sha1')
  .update(
    JSON.stringify({
      v: BASE_VERSION,
      rev: TA_CACHE_SCHEMA_REV,
      slugs: TA_SLUG_LABELS,
      memRe: TA_MEM_FILE_RE.source
    })
  )
  .digest('hex')
  .slice(0, 16);

const taParseProtoAll = parseProtoAll;

function taParsePackedVarints(buf) {
  const out = [];
  if (!buf || typeof buf.length !== 'number') return out;
  let i = 0;
  while (i < buf.length) {
    let v = 0;
    let s = 0;
    while (i < buf.length) {
      const b = buf[i++];
      v |= (b & 0x7f) << s;
      if (!(b & 0x80)) break;
      s += 7;
      if (s > 35) return out;
    }
    out.push(v);
  }
  return out;
}

function taGetField(fields, num) {
  return fields.find((x) => x.f === num);
}

function taGetAllFields(fields, num) {
  return fields.filter((x) => x.f === num);
}

function taFieldToStr(f) {
  return f?.buf ? textDecoder.decode(f.buf) : '';
}

function taInspectToolArgsForMemory(toolName, argsBuf) {
  if (/^memory_/i.test(toolName)) return true;
  if (!argsBuf || argsBuf.length === 0) return false;
  const headSample = textDecoder.decode(argsBuf.length > 4096 ? argsBuf.subarray(0, 4096) : argsBuf);
  if (!/memory|memories|knowledge/i.test(headSample)) return false;
  try {
    const obj = JSON.parse(textDecoder.decode(argsBuf));
    const pathVal = String(
      obj?.Path || obj?.TargetFile || obj?.File || obj?.path || obj?.file_path || obj?.uri || ''
    ).trim();
    return Boolean(pathVal && TA_MEM_FILE_RE.test(pathVal));
  } catch {
    return false;
  }
}

function taInspectStepMetadata(metaBuf, isToolStep) {
  let ts = 0;
  let isExitPlan = false;
  let hasMemoryPath = false;
  if (!metaBuf || !metaBuf.length) return { ts, isExitPlan, hasMemoryPath };
  let toolChecked = !isToolStep;
  for (const fld of taParseProtoAll(metaBuf, true)) {
    if (ts === 0 && fld.w === 2 && fld.buf.length >= 2 && fld.buf.length <= 24) {
      const sub = taParseProtoAll(fld.buf);
      const sec = taGetField(sub, 1)?.v;
      if (sec && sec > 1700000000 && sec < 1900000000) ts = sec;
    } else if (!toolChecked && fld.f === 4 && fld.w === 2 && fld.buf.length >= 8) {
      toolChecked = true;
      let tName = '';
      let tArgsBuf = null;
      for (const tcFld of taParseProtoAll(fld.buf, true)) {
        if (tcFld.f === 2 && tcFld.w === 2 && !tcFld.partial) {
          tName = textDecoder.decode(tcFld.buf);
        } else if (tcFld.f === 3 && tcFld.w === 2) {
          tArgsBuf = tcFld.buf;
        }
      }
      if (tName === 'exit_plan_mode') isExitPlan = true;
      hasMemoryPath = taInspectToolArgsForMemory(tName, tArgsBuf);
    }
    if (ts > 0 && toolChecked) break;
  }
  return { ts, isExitPlan, hasMemoryPath };
}

function taResolveStepLookup(stepTs, fallbackSec) {
  const sorted = [...stepTs.keys()].sort((a, b) => a - b);
  return (stepIdx) => {
    if (stepTs.has(stepIdx)) return stepTs.get(stepIdx);
    let lo = 0;
    let hi = sorted.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] <= stepIdx) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best >= 0) return stepTs.get(sorted[best]);
    return sorted.length > 0 ? stepTs.get(sorted[0]) : fallbackSec;
  };
}

function taExtractUserStepPlanConfig(payloadBuf) {
  if (!payloadBuf || !payloadBuf.length) return null;
  const top = taParseProtoAll(payloadBuf);
  const u19 = taGetField(top, 19);
  if (!u19?.buf) return null;
  const u19Fields = taParseProtoAll(u19.buf);
  let plannerEnum = 0;
  let execEnum = 0;
  let planFlag = false;
  const mc12 = taGetField(u19Fields, 12);
  if (mc12?.buf) {
    const mc1 = taGetField(taParseProtoAll(mc12.buf), 1);
    if (mc1?.buf) {
      const mcFields = taParseProtoAll(mc1.buf);
      plannerEnum = taGetField(mcFields, 1)?.v || 0;
      const f60 = taGetField(mcFields, 60);
      if (f60?.buf) {
        execEnum = taGetField(taParseProtoAll(f60.buf), 1)?.v || 0;
      }
    }
  }
  const u18 = taGetField(u19Fields, 18);
  if (u18?.buf) {
    const f3 = taGetField(taParseProtoAll(u18.buf), 3);
    if (f3?.buf) {
      const f1 = taGetField(taParseProtoAll(f3.buf), 1);
      if (f1?.buf) {
        planFlag = taParseProtoAll(f1.buf).some((x) => x.f === 6 && x.v === 1);
      }
    }
  }
  return {
    orchestrator: Boolean(execEnum > 0 || planFlag),
    plannerEnum,
    execEnum
  };
}

function taResolvePlanStateLookup(planTimeline) {
  if (!Array.isArray(planTimeline) || planTimeline.length === 0) {
    return () => null;
  }
  return (stepIdx) => {
    let lo = 0;
    let hi = planTimeline.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (planTimeline[mid].idx <= stepIdx) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best >= 0 ? planTimeline[best] : null;
  };
}

function taGetDbFileSig(dbPath) {
  return getSqliteFileSig(dbPath, { trackUnc: true });
}

function taNormalizeSlashPath(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('file://')) {
    s = s.slice(7);
    try {
      s = decodeURIComponent(s);
    } catch {}
  }
  s = s.replace(/\\/g, '/');
  if (/^\/[A-Za-z]:\//.test(s)) {
    s = s.slice(1);
  }
  if (!s.startsWith('//')) {
    s = s.replace(/\/{2,}/g, '/');
  } else {
    s = '//' + s.slice(2).replace(/\/{2,}/g, '/');
  }
  if (s.length > 1 && !/^[A-Za-z]:\/$/.test(s)) {
    s = s.replace(/\/+$/, '');
  }
  return s || '/';
}

const TA_NORMALIZED_OS_TMP = taNormalizeSlashPath(os.tmpdir()).toLowerCase();

function taIsTempPath(p) {
  if (!p) return false;
  const low = p.toLowerCase();
  if (TA_NORMALIZED_OS_TMP && TA_NORMALIZED_OS_TMP.length > 1) {
    if (low === TA_NORMALIZED_OS_TMP || low.startsWith(`${TA_NORMALIZED_OS_TMP}/`)) return true;
  }
  return (
    /^(?:\/private)?\/tmp(?:\/|$)/i.test(low) ||
    /^\/var\/folders(?:\/|$)/i.test(low) ||
    /^[a-z]:\/users\/[^/]+\/appdata\/local\/temp(?:\/|$)/i.test(low) ||
    /^[a-z]:\/windows\/temp(?:\/|$)/i.test(low) ||
    /^\/mnt\/[a-z]\/users\/[^/]+\/appdata\/local\/temp(?:\/|$)/i.test(low)
  );
}

function taParseWorkspaceUrisList(workspaceUris) {
  if (!workspaceUris) return [];
  if (Array.isArray(workspaceUris)) {
    return workspaceUris.map((x) => taNormalizeSlashPath(x)).filter(Boolean);
  }
  const str = String(workspaceUris).trim();
  if (!str) return [];
  if (str.startsWith('[')) {
    try {
      const arr = JSON.parse(str);
      if (Array.isArray(arr)) {
        return arr.map((x) => taNormalizeSlashPath(x)).filter(Boolean);
      }
    } catch {}
  }
  const decoded = taNormalizeSlashPath(str);
  return decoded ? [decoded] : [];
}

function taNormalizeProjectInfo(workspaceUris, projectId = '') {
  const paths = taParseWorkspaceUrisList(workspaceUris);
  const nonTemp = paths.find((p) => !taIsTempPath(p));
  const chosen = nonTemp || paths[0] || '';
  const pid = String(projectId || '').trim();

  if (!chosen || (pid === 'outside-of-project' && !nonTemp)) {
    return {
      key: '__none__',
      name: '未绑定项目',
      rawBasename: '未绑定项目',
      path: '',
      isTemp: false
    };
  }

  if (taIsTempPath(chosen)) {
    return {
      key: '__tmp__',
      name: '临时目录 (/tmp)',
      rawBasename: '临时目录 (/tmp)',
      path: '/tmp',
      isTemp: true
    };
  }

  const parts = chosen.split('/').filter(Boolean);
  const base = parts[parts.length - 1] || chosen;
  const isCaseInsensitive =
    process.platform === 'darwin' ||
    process.platform === 'win32' ||
    /^[a-z]:\//i.test(chosen) ||
    /^\/mnt\/[a-z]\//i.test(chosen);
  return {
    key: isCaseInsensitive ? chosen.toLowerCase() : chosen,
    name: base,
    rawBasename: base,
    path: chosen,
    isTemp: false
  };
}

function taClassifyModelPool({ label = '', slug = '', modelEnum = '', usedClaude = '', apiProvider = 0 } = {}) {
  const combined = `${label} ${slug} ${modelEnum}`.toLowerCase();
  if (combined.includes('argon')) return 'Argon';
  if (combined.includes('claude') || combined.includes('gpt')) return 'Claude';
  if (combined.includes('gemini') || combined.includes('orchestrator')) return 'Gemini';
  if (apiProvider === 26 || apiProvider === 31 || apiProvider === 32) return 'Claude';
  if (String(usedClaude).toLowerCase() === 'true') return 'Claude';
  return 'Gemini';
}

function taNormalizeModelLabel({ label = '', slug = '', modelEnum = '', enumId = 0 } = {}) {
  const trimmedLabel = String(label || '').trim();
  if (trimmedLabel) return trimmedLabel;
  const trimmedSlug = String(slug || '').trim();
  if (trimmedSlug && TA_SLUG_LABELS[trimmedSlug]) return TA_SLUG_LABELS[trimmedSlug];
  if (trimmedSlug) return trimmedSlug;
  if (modelEnum) return String(modelEnum).trim();
  return `model-${enumId || 'unknown'}`;
}

function taFormatOrchestratorModelLabel(label) {
  const trimmed = String(label || '').trim();
  if (!trimmed || /orchestrator/i.test(trimmed)) return trimmed;
  let core = trimmed.replace(/^Gemini\s+4\s+/i, '');
  const parenMatch = core.match(/^(.+?)\s*\(([^()]+)\)$/);
  if (parenMatch) {
    core = `${parenMatch[1].trim()} · ${parenMatch[2].trim()}`;
  }
  return `Orchestrator (${core})`;
}

function taResolveCallScenario(callBaseScenario, isSubagent, source) {
  if (isSubagent) return 'subagent';
  if (callBaseScenario === 'planning' || callBaseScenario === 'memory') return callBaseScenario;
  if (source === 'cli') return 'internal';
  return callBaseScenario || 'internal';
}

function taParseIsoSeconds(val) {
  if (!val) return 0;
  const str = String(val).trim();
  if (!str || str.startsWith('0001-01-01')) return 0;
  const ms = Date.parse(str.includes('T') ? str : str.replace(' ', 'T'));
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 1000);
}

function taToLocalDateString(tsSec) {
  const d = new Date(tsSec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function taReadSummariesIndex(summariesDbPath) {
  const map = new Map();
  if (!summariesDbPath || !fs.existsSync(summariesDbPath)) return map;
  try {
    withReadOnlyDb(summariesDbPath, 150, (db) => {
      const rows = db
        .prepare(
          `SELECT conversation_id, title, workspace_uris, project_id, source, agent_name,
                  parent_conversation_id, nesting_depth, last_modified_time
           FROM conversation_summaries`
        )
        .all();
      for (const r of rows) {
        if (!r?.conversation_id) continue;
        map.set(r.conversation_id, {
          id: r.conversation_id,
          title: String(r.title || '').trim(),
          workspaceUris: String(r.workspace_uris || ''),
          projectId: String(r.project_id || ''),
          source: String(r.source || '') === 'CORTEX_TRAJECTORY_SOURCE_CLI' ? 'cli' : 'desktop',
          agentName: String(r.agent_name || '').trim(),
          parentId: String(r.parent_conversation_id || '').trim(),
          nestingDepth: Number(r.nesting_depth || 0) || 0,
          lastModifiedSec: taParseIsoSeconds(r.last_modified_time)
        });
      }
    });
    return map;
  } catch {
    return null;
  }
}

function taLoadSummariesCached(summariesDbPath, force) {
  if (!summariesDbPath) return new Map();
  const sigInfo = taGetDbFileSig(summariesDbPath);
  if (!sigInfo) return new Map();
  const cached = tokenAnalyticsSummariesCache.get(summariesDbPath);
  if (force !== 'hard' && cached && cached.sig === sigInfo.sig) {
    return cached.map;
  }
  const fresh = taReadSummariesIndex(summariesDbPath);
  if (fresh) {
    tokenAnalyticsSummariesCache.set(summariesDbPath, { sig: sigInfo.sig, map: fresh });
    return fresh;
  }
  return cached ? cached.map : new Map();
}

function taParseGenMetadataRowToCall(row, { lookupTs, lookupPlanState, stepByIdx, compactionStepIndices, trajParentId, state }) {
  const top = taParseProtoAll(row.data);
  const chatField = taGetField(top, 1);
  if (!chatField?.buf) return null;
  const chat = taParseProtoAll(chatField.buf);
  const usageField = taGetField(chat, 4);
  if (!usageField?.buf) return null;
  const usage = taParseProtoAll(usageField.buf);

  const kv = {};
  for (const entry of taGetAllFields(chat, 20)) {
    const pair = taParseProtoAll(entry.buf);
    const k = taFieldToStr(taGetField(pair, 1));
    if (k) kv[k] = taFieldToStr(taGetField(pair, 2));
  }

  const stepIndicesField = taGetField(top, 2);
  const stepIndices = stepIndicesField?.buf ? taParsePackedVarints(stepIndicesField.buf) : [];
  const refStep = stepIndices.length > 0 ? stepIndices[0] : Number(kv.last_step_index) || 0;
  const ts = lookupTs(refStep);

  let hasStep132 = false;
  let hasStep15 = false;
  let hasLinkedStep = false;
  let hasMemoryStep = false;
  let hasExitPlanStep = false;
  let hasNearbyCompaction = false;
  for (const sIdx of stepIndices) {
    const info = stepByIdx.get(sIdx);
    if (info) {
      hasLinkedStep = true;
      if (info.stepType === 132) hasStep132 = true;
      else if (info.stepType === 15) hasStep15 = true;
      if (info.hasMemoryPath) hasMemoryStep = true;
      if (info.isExitPlan) hasExitPlanStep = true;
    }
    if (
      compactionStepIndices.has(sIdx) ||
      compactionStepIndices.has(sIdx - 1) ||
      compactionStepIndices.has(sIdx + 1)
    ) {
      hasNearbyCompaction = true;
    }
  }
  if (!hasNearbyCompaction && stepIndices.length === 0 && refStep > 0) {
    if (
      compactionStepIndices.has(refStep) ||
      compactionStepIndices.has(refStep - 1) ||
      compactionStepIndices.has(refStep + 1)
    ) {
      hasNearbyCompaction = true;
    }
  }

  const slug = taFieldToStr(taGetField(chat, 19));
  const rawLabel = taFieldToStr(taGetField(chat, 21));
  const enumId = taGetField(usage, 1)?.v || taGetField(chat, 3)?.v || 0;
  const apiProvider = taGetField(usage, 6)?.v || 0;
  const modelEnum = kv.model_enum || '';
  const usedClaude = kv.used_claude || '';
  const baseLabel = taNormalizeModelLabel({ label: rawLabel, slug, modelEnum, enumId });
  const pool = taClassifyModelPool({ label: baseLabel, slug, modelEnum, usedClaude, apiProvider });

  const slugLower = String(slug || '').toLowerCase();
  const labelTrim = String(baseLabel || '').trim();
  const planSt = lookupPlanState(refStep);
  let isOrchestratorPlanning = false;
  if (slugLower.includes('worker')) {
    isOrchestratorPlanning = false;
  } else if (slugLower.includes('orchestrator') || /^orchestrator\b/i.test(labelTrim)) {
    isOrchestratorPlanning = true;
  } else if (hasExitPlanStep) {
    isOrchestratorPlanning = true;
  } else if (planSt?.orchestrator) {
    if (planSt.plannerEnum > 0 && planSt.execEnum > 0 && planSt.plannerEnum !== planSt.execEnum) {
      isOrchestratorPlanning = enumId === planSt.plannerEnum;
    } else {
      isOrchestratorPlanning = Boolean(planSt.inPlanPhase);
    }
  }

  let baseScenario = 'internal';
  if (isOrchestratorPlanning) {
    baseScenario = 'planning';
  } else if (hasNearbyCompaction || hasMemoryStep) {
    baseScenario = 'memory';
  } else if (hasLinkedStep) {
    if (hasStep132) baseScenario = 'tools';
    else if (hasStep15) baseScenario = 'chat';
  }

  const inTok = taGetField(usage, 2)?.v || 0;
  const outTok = taGetField(usage, 3)?.v || 0;
  const cacheRead = taGetField(usage, 5)?.v || 0;
  const thinkTok = taGetField(usage, 9)?.v || 0;
  const respTok = taGetField(usage, 10)?.v || 0;

  const subagentType = String(kv.subagent_type || '').trim();
  const parentCascadeId = String(kv.parent_cascade_id || '').trim();
  const rootCascadeId = String(kv.root_cascade_id || '').trim();
  if (!state.firstParentCascadeId && parentCascadeId) state.firstParentCascadeId = parentCascadeId;
  if (!state.firstRootCascadeId && rootCascadeId) state.firstRootCascadeId = rootCascadeId;
  if (!state.firstSubagentType && subagentType) state.firstSubagentType = subagentType;
  if (inTok === 0 && cacheRead === 0 && outTok === 0) return null;

  const isSubagentCall = Boolean(trajParentId || state.firstParentCascadeId || subagentType);
  const finalModelLabel =
    isOrchestratorPlanning && !isSubagentCall ? taFormatOrchestratorModelLabel(baseLabel) : baseLabel;

  return {
    gIdx: row.idx,
    ts,
    model: finalModelLabel,
    pool,
    inTok,
    cacheRead,
    outTok,
    thinkTok,
    respTok,
    total: inTok + cacheRead + outTok,
    weighted: Math.round(inTok + 0.1 * cacheRead + 6 * outTok),
    billable: inTok + outTok,
    baseScenario,
    subagentType
  };
}

function taIngestStepRow(row, stepTs, stepByIdx, compactionStepIndices, planTimeline, planCursor) {
  const { ts, isExitPlan, hasMemoryPath } = taInspectStepMetadata(row.metadata, row.step_type === 132);
  if (ts > 0) stepTs.set(row.idx, ts);
  if (row.step_type === 23) compactionStepIndices.add(row.idx);
  if (row.step_type === 14 && row.step_payload) {
    const cfg = taExtractUserStepPlanConfig(row.step_payload);
    if (cfg) {
      planCursor.cur = { ...cfg, inPlanPhase: cfg.orchestrator };
      planTimeline.push({ ...planCursor.cur, idx: row.idx });
    }
  } else if (row.step_type === 101 && row.step_payload && planCursor.cur.orchestrator) {
    const headStr = textDecoder.decode(row.step_payload);
    if (headStr.includes('Plan mode is off:') && planCursor.cur.inPlanPhase) {
      planCursor.cur = { ...planCursor.cur, inPlanPhase: false };
      planTimeline.push({ ...planCursor.cur, idx: row.idx });
    } else if (headStr.includes('[plan review]') && !planCursor.cur.inPlanPhase) {
      planCursor.cur = { ...planCursor.cur, inPlanPhase: true };
      planTimeline.push({ ...planCursor.cur, idx: row.idx });
    }
  }
  stepByIdx.set(row.idx, { stepType: row.step_type, hasMemoryPath, isExitPlan });
}

function taParseConversationDetailDb(dbPath, statInfo, prevCacheEntry = null) {
  const dbId = path.basename(dbPath, '.db');
  try {
    return withReadOnlyDb(dbPath, 150, (db) => {
      const fallbackSec = Math.floor((statInfo?.mtimeMs || fs.statSync(dbPath).mtimeMs || Date.now()) / 1000);

      let trajParentId = '';
      let trajRootId = '';
      let trajWorkspaceUri = '';
      let trajProjectId = '';
      try {
        const mrow = db.prepare('SELECT data FROM trajectory_metadata_blob LIMIT 1').get();
        if (mrow?.data) {
          const mf = taParseProtoAll(mrow.data);
          trajParentId = taFieldToStr(taGetField(mf, 5)).trim();
          trajRootId = taFieldToStr(taGetField(mf, 6)).trim();
          trajWorkspaceUri = taFieldToStr(taGetField(mf, 7)).trim();
          trajProjectId = taFieldToStr(taGetField(mf, 18)).trim();
          if (!trajWorkspaceUri) {
            const wsField = taGetField(mf, 1);
            if (wsField?.buf) {
              const wsSub = taParseProtoAll(wsField.buf);
              trajWorkspaceUri =
                taFieldToStr(taGetField(wsSub, 1)).trim() || taFieldToStr(taGetField(wsSub, 2)).trim();
            }
          }
        }
      } catch {}

      const gmStat = db.prepare('SELECT COUNT(*) AS cnt, COALESCE(MAX(idx), -1) AS maxIdx FROM gen_metadata').get();
      const genCount = Number(gmStat?.cnt || 0);
      const maxGenIdx = Number(gmStat?.maxIdx ?? -1);
      if (genCount === 0) {
        return {
          ok: true,
          dbId,
          mtimeSec: fallbackSec,
          trajMeta: {
            parentId: trajParentId,
            rootId: trajRootId,
            subagentType: '',
            workspaceUri: trajWorkspaceUri,
            projectId: trajProjectId
          },
          calls: [],
          _inc: null
        };
      }

      const stStat = db.prepare('SELECT COUNT(*) AS cnt, COALESCE(MAX(idx), -1) AS maxIdx FROM steps').get();
      const stepCount = Number(stStat?.cnt || 0);
      const maxStepIdx = Number(stStat?.maxIdx ?? -1);

      const prevInc = prevCacheEntry?._inc;
      const prevParsed = prevCacheEntry?.parsed;
      const startStepIdx = prevInc ? Math.max(0, prevInc.maxStepIdx - 4) : 0;
      const startGenIdx = prevInc ? Math.max(0, prevInc.maxGenIdx - 1) : 0;
      let anchorValid = false;
      if (
        prevInc &&
        prevParsed?.ok &&
        genCount >= prevInc.genCount &&
        maxGenIdx >= prevInc.maxGenIdx &&
        stepCount >= prevInc.stepCount &&
        maxStepIdx >= prevInc.maxStepIdx
      ) {
        if (startGenIdx > 0 && prevInc.anchorIdx >= 0) {
          const prefixCnt = db.prepare('SELECT COUNT(*) AS cnt FROM gen_metadata WHERE idx < ?').get(startGenIdx)?.cnt ?? -1;
          const aRow = db
            .prepare('SELECT length(data) AS len, hex(substr(data, 1, 24)) AS hex FROM gen_metadata WHERE idx = ?')
            .get(prevInc.anchorIdx);
          anchorValid = Boolean(
            prefixCnt === prevInc.frozenGenCount &&
              aRow &&
              aRow.len === prevInc.anchorLen &&
              aRow.hex === prevInc.anchorHex
          );
        } else {
          anchorValid = startGenIdx === 0;
        }
      }

      if (anchorValid) {
        // 回退重读末尾 2 条 gen_metadata 与末尾 5 条 steps，兼顾邻近压缩步 (sIdx+1) 与流式尾行原地更新，并精确拦截 Undo 重写
        const deltaSteps = db
          .prepare(
            `SELECT idx, step_type, metadata,
                    CASE
                      WHEN step_type = 14 THEN step_payload
                      WHEN step_type = 101 THEN substr(step_payload, 1, 1024)
                      ELSE NULL
                    END AS step_payload
             FROM steps
             WHERE idx >= ?
             ORDER BY idx ASC`
          )
          .all(startStepIdx);
        const deltaGenRows = db
          .prepare('SELECT idx, data FROM gen_metadata WHERE idx >= ? ORDER BY idx ASC')
          .all(startGenIdx);

        const baseCalls = prevParsed.calls.filter((c) => typeof c.gIdx === 'number' && c.gIdx < startGenIdx);
        if (baseCalls.length + deltaGenRows.length <= genCount) {
          const stepTs = new Map(prevInc.stepTs);
          const stepByIdx = new Map(prevInc.stepByIdx);
          const compactionStepIndices = new Set(prevInc.compactionStepIndices);
          for (const k of [...stepTs.keys()]) {
            if (k >= startStepIdx) stepTs.delete(k);
          }
          for (const k of [...stepByIdx.keys()]) {
            if (k >= startStepIdx) stepByIdx.delete(k);
          }
          for (const k of [...compactionStepIndices]) {
            if (k >= startStepIdx) compactionStepIndices.delete(k);
          }
          const planTimeline = prevInc.planTimeline.filter((p) => p.idx < startStepIdx);
          let seedCur = { orchestrator: false, plannerEnum: 0, execEnum: 0, inPlanPhase: false };
          if (planTimeline.length > 0) {
            const lastPt = planTimeline[planTimeline.length - 1];
            seedCur = {
              orchestrator: Boolean(lastPt.orchestrator),
              plannerEnum: lastPt.plannerEnum || 0,
              execEnum: lastPt.execEnum || 0,
              inPlanPhase: Boolean(lastPt.inPlanPhase)
            };
          }
          const planCursor = { cur: seedCur };
          for (const row of deltaSteps) {
            taIngestStepRow(row, stepTs, stepByIdx, compactionStepIndices, planTimeline, planCursor);
          }
          const lookupTs = taResolveStepLookup(stepTs, fallbackSec);
          const lookupPlanState = taResolvePlanStateLookup(planTimeline);
          const lineageState = {
            firstParentCascadeId: prevInc.firstParentCascadeId || '',
            firstRootCascadeId: prevInc.firstRootCascadeId || '',
            firstSubagentType: prevInc.firstSubagentType || ''
          };
          for (const row of deltaGenRows) {
            const c = taParseGenMetadataRowToCall(row, {
              lookupTs,
              lookupPlanState,
              stepByIdx,
              compactionStepIndices,
              trajParentId,
              state: lineageState
            });
            if (c) baseCalls.push(c);
          }
          const nextStartGenIdx = Math.max(0, maxGenIdx - 1);
          const nextFrozenCnt = nextStartGenIdx > 0
            ? db.prepare('SELECT COUNT(*) AS cnt FROM gen_metadata WHERE idx < ?').get(nextStartGenIdx)?.cnt ?? 0
            : 0;
          const nextFrozenRow = nextStartGenIdx > 0
            ? db
                .prepare('SELECT idx, length(data) AS len, hex(substr(data, 1, 24)) AS hex FROM gen_metadata WHERE idx < ? ORDER BY idx DESC LIMIT 1')
                .get(nextStartGenIdx)
            : null;
          return {
            ok: true,
            dbId,
            mtimeSec: fallbackSec,
            trajMeta: {
              parentId: trajParentId || lineageState.firstParentCascadeId,
              rootId: trajRootId || lineageState.firstRootCascadeId,
              subagentType: lineageState.firstSubagentType,
              workspaceUri: trajWorkspaceUri,
              projectId: trajProjectId
            },
            calls: baseCalls,
            _inc: {
              genCount,
              maxGenIdx,
              stepCount,
              maxStepIdx,
              frozenGenCount: nextFrozenCnt,
              anchorIdx: nextFrozenRow ? nextFrozenRow.idx : -1,
              anchorLen: nextFrozenRow ? nextFrozenRow.len : 0,
              anchorHex: nextFrozenRow ? nextFrozenRow.hex : '',
              stepTs,
              stepByIdx,
              compactionStepIndices,
              planTimeline,
              firstParentCascadeId: lineageState.firstParentCascadeId,
              firstRootCascadeId: lineageState.firstRootCascadeId,
              firstSubagentType: lineageState.firstSubagentType
            }
          };
        }
      }

      const stepTs = new Map();
      const stepByIdx = new Map();
      const compactionStepIndices = new Set();
      const planTimeline = [];
      const planCursor = { cur: { orchestrator: false, plannerEnum: 0, execEnum: 0, inPlanPhase: false } };

      // 整列读取 metadata（保障 100% exit_plan_mode 与长工具参数零截断丢失），CASE 跳过占全库 92% 体积的 step_type=132 step_payload 溢出页；
      // 使用 .all() 避免 Node 22.13~22.14 StatementSync.iterate() 链式临时对象在循环内遭 V8 GC 提前析构触发 ERR_INVALID_STATE / 0xC0000005
      for (const row of db
        .prepare(
          `SELECT idx, step_type, metadata,
                  CASE
                    WHEN step_type = 14 THEN step_payload
                    WHEN step_type = 101 THEN substr(step_payload, 1, 1024)
                    ELSE NULL
                  END AS step_payload
           FROM steps
           ORDER BY idx ASC`
        )
        .all()) {
        taIngestStepRow(row, stepTs, stepByIdx, compactionStepIndices, planTimeline, planCursor);
      }
      const lookupTs = taResolveStepLookup(stepTs, fallbackSec);
      const lookupPlanState = taResolvePlanStateLookup(planTimeline);

      const calls = [];
      const lineageState = {
        firstParentCascadeId: '',
        firstRootCascadeId: '',
        firstSubagentType: ''
      };

      const allGenRows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx ASC').all();
      for (const row of allGenRows) {
        const c = taParseGenMetadataRowToCall(row, {
          lookupTs,
          lookupPlanState,
          stepByIdx,
          compactionStepIndices,
          trajParentId,
          state: lineageState
        });
        if (c) calls.push(c);
      }

      const nextStartGenIdx = Math.max(0, maxGenIdx - 1);
      let fullFrozenCnt = 0;
      let lastFrozenGen = null;
      if (nextStartGenIdx > 0) {
        for (const row of allGenRows) {
          if (row.idx < nextStartGenIdx) {
            fullFrozenCnt += 1;
            lastFrozenGen = row;
          }
        }
      }
      const fullAnchorIdx = lastFrozenGen ? lastFrozenGen.idx : -1;
      const fullAnchorLen = lastFrozenGen?.data ? lastFrozenGen.data.length : 0;
      const fullAnchorHex =
        lastFrozenGen?.data
          ? Buffer.from(lastFrozenGen.data.subarray(0, Math.min(24, lastFrozenGen.data.length))).toString('hex').toUpperCase()
          : '';

      return {
        ok: true,
        dbId,
        mtimeSec: fallbackSec,
        trajMeta: {
          parentId: trajParentId || lineageState.firstParentCascadeId,
          rootId: trajRootId || lineageState.firstRootCascadeId,
          subagentType: lineageState.firstSubagentType,
          workspaceUri: trajWorkspaceUri,
          projectId: trajProjectId
        },
        calls,
        _inc: {
          genCount,
          maxGenIdx,
          stepCount,
          maxStepIdx,
          frozenGenCount: fullFrozenCnt,
          anchorIdx: fullAnchorIdx,
          anchorLen: fullAnchorLen,
          anchorHex: fullAnchorHex,
          stepTs,
          stepByIdx,
          compactionStepIndices,
          planTimeline,
          firstParentCascadeId: lineageState.firstParentCascadeId,
          firstRootCascadeId: lineageState.firstRootCascadeId,
          firstSubagentType: lineageState.firstSubagentType
        }
      };
    });
  } catch (err) {
    return {
      ok: false,
      dbId,
      error: err?.message || String(err)
    };
  }
}

function taChooseCanonicalProjectNames(projVotes) {
  const canonical = new Map();
  for (const [key, voteMap] of projVotes.entries()) {
    const candidates = [...voteMap.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const aUpper = /^[A-Z]/.test(a[0]) ? 1 : 0;
      const bUpper = /^[A-Z]/.test(b[0]) ? 1 : 0;
      if (bUpper !== aUpper) return bUpper - aUpper;
      return a[0].localeCompare(b[0]);
    });
    canonical.set(key, candidates[0]?.[0] || key);
  }
  return canonical;
}

const yieldEventLoop = () => new Promise((resolve) => setImmediate(resolve));
const sleepAsync = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadTokenAnalyticsDiskCacheIfNeeded(force) {
  if (SAFE_MODE) return;
  if (force === 'hard') {
    tokenAnalyticsDbCache.clear();
    tokenAnalyticsSummariesCache.clear();
    tokenAnalyticsDiskLoaded = true;
    return;
  }
  if (tokenAnalyticsDiskLoaded || tokenAnalyticsDbCache.size > 0) return;
  tokenAnalyticsDiskLoaded = true;
  try {
    const raw = await fs.promises.readFile(TA_CACHE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    if (!obj || obj.salt !== TA_CACHE_SALT || !obj.entries || typeof obj.entries !== 'object') {
      await fs.promises.unlink(TA_CACHE_FILE).catch(() => {});
      return;
    }
    for (const [dbPath, item] of Object.entries(obj.entries)) {
      if (item && typeof item.sig === 'string' && item.parsed?.ok && Array.isArray(item.parsed.calls)) {
        tokenAnalyticsDbCache.set(dbPath, { sig: item.sig, parsed: item.parsed, _inc: null });
      }
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      await fs.promises.unlink(TA_CACHE_FILE).catch(() => {});
    }
  }
}

let tokenAnalyticsFlushInFlight = false;
let tokenAnalyticsFlushPending = false;

async function flushTokenAnalyticsDiskCacheAsync() {
  if (SAFE_MODE || RUN_ONCE || daemonExiting || tokenAnalyticsDbCache.size === 0) return;
  if (tokenAnalyticsFlushInFlight) {
    tokenAnalyticsFlushPending = true;
    return;
  }
  tokenAnalyticsFlushInFlight = true;
  try {
    do {
      tokenAnalyticsFlushPending = false;
      if (SAFE_MODE || RUN_ONCE || daemonExiting || tokenAnalyticsDbCache.size === 0) break;
      const entries = Object.create(null);
      for (const [dbPath, item] of tokenAnalyticsDbCache.entries()) {
        if (item && item.sig && item.parsed?.ok) {
          entries[dbPath] = { sig: item.sig, parsed: item.parsed };
        }
      }
      const tmpFile = `${TA_CACHE_FILE}.${process.pid}.${Date.now()}.tmp`;
      try {
        await fs.promises.mkdir(CACHE_DIR, { recursive: true });
        const payloadStr = JSON.stringify({ salt: TA_CACHE_SALT, updatedAt: Date.now(), entries });
        await fs.promises.writeFile(tmpFile, payloadStr, 'utf8');
        const retryDelays = [0, 60, 160, 360];
        let renamed = false;
        for (let i = 0; i < retryDelays.length; i++) {
          if (retryDelays[i] > 0) await sleepAsync(retryDelays[i]);
          try {
            await fs.promises.rename(tmpFile, TA_CACHE_FILE);
            renamed = true;
            break;
          } catch (renErr) {
            const code = renErr?.code || '';
            if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') break;
          }
        }
        if (!renamed) {
          await fs.promises.unlink(tmpFile).catch(() => {});
        }
      } catch {
        await fs.promises.unlink(tmpFile).catch(() => {});
      }
    } while (tokenAnalyticsFlushPending);
  } finally {
    tokenAnalyticsFlushInFlight = false;
  }
}

function scheduleTokenAnalyticsDiskPersist() {
  if (SAFE_MODE || RUN_ONCE || daemonExiting) return;
  if (tokenAnalyticsPersistTimer) clearTimeout(tokenAnalyticsPersistTimer);
  tokenAnalyticsPersistTimer = setTimeout(() => {
    tokenAnalyticsPersistTimer = null;
    void flushTokenAnalyticsDiskCacheAsync();
  }, 2000);
  if (typeof tokenAnalyticsPersistTimer.unref === 'function') {
    tokenAnalyticsPersistTimer.unref();
  }
}

function normalizeDirPrefix(dirPath) {
  const s = String(dirPath || '').replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() + '\\' : s + '/';
}

function isPathInIncompleteDirs(filePath, incompletePrefixes) {
  if (incompletePrefixes.size === 0) return false;
  const norm = process.platform === 'win32' ? String(filePath || '').toLowerCase() : String(filePath || '');
  for (const prefix of incompletePrefixes) {
    if (norm.startsWith(prefix)) return true;
  }
  return false;
}

async function queryTokenAnalytics(
  endpoint,
  { maxDays = 365, force = false, nowSec = Math.floor(Date.now() / 1000) } = {}
) {
  lastTokenAnalyticsAccessMs = Date.now();
  const t0 = performance.now();
  await Promise.all([loadTokenAnalyticsDiskCacheIfNeeded(force), ensureWin32WslProbesWarmAsync(endpoint)]);
  let sliceStartMs = performance.now();
  const primaryDir =
    endpoint?.conversationsDir || path.join(os.homedir(), endpoint?.geminiSubDir || '.gemini/antigravity', 'conversations');

  const candidateDirs = [];
  const pushDir = (d) => {
    if (d && !candidateDirs.includes(d)) candidateDirs.push(d);
  };
  pushDir(primaryDir);

  if (process.platform === 'win32' && !endpoint?.explicitConvDir && endpoint?.portFile) {
    if (Date.now() >= wslUncBackoffUntil) {
      const wslDirs = resolveWin32WslConversationsDirs(
        endpoint.portFile,
        endpoint.geminiSubDir || '.gemini/antigravity'
      );
      for (const wd of wslDirs) pushDir(wd);
    } else {
      // UNC 退避窗口内沿用已知 WSL 目录标记为 incomplete，保留其既有缓存参与汇总而不清空
      const wslStatePath = path.join(path.dirname(endpoint.portFile), 'wsl_state.json');
      const prevWsl = wslDirsCache.get(wslStatePath);
      if (prevWsl?.dirs?.length) {
        for (const wd of prevWsl.dirs) pushDir(wd);
      }
    }
  }

  const summaries = new Map();
  const dbCandidateById = new Map(); // dbId -> { dbPath, sigInfo }
  const incompleteDirPrefixes = new Set();
  const wslConfiguredButOffline =
    process.platform === 'win32' &&
    !endpoint?.explicitConvDir &&
    Boolean(endpoint?.portFile) &&
    !candidateDirs.some((d) => isUncPath(d)) &&
    inspectWin32WslProbeDemand(endpoint).hasWsl;
  if (Date.now() < wslUncBackoffUntil || (wslConfiguredButOffline && force !== 'hard')) {
    for (const cachedPath of tokenAnalyticsDbCache.keys()) {
      if (isUncPath(cachedPath)) {
        incompleteDirPrefixes.add(normalizeDirPrefix(path.dirname(cachedPath)));
      }
    }
  }

  for (const convDir of candidateDirs) {
    const uncDir = isUncPath(convDir);
    if (uncDir && Date.now() < wslUncBackoffUntil) {
      incompleteDirPrefixes.add(normalizeDirPrefix(convDir));
      continue;
    }
    const tDir = Date.now();
    let dirExists = false;
    try {
      dirExists = fs.existsSync(convDir);
    } catch {
      dirExists = false;
    }
    if (markUncSlowIfExceeded(uncDir, tDir) || (uncDir && Date.now() < wslUncBackoffUntil)) {
      incompleteDirPrefixes.add(normalizeDirPrefix(convDir));
      if (!dirExists) continue;
    }
    if (!dirExists) continue;

    const sumPath = path.join(path.dirname(convDir), 'conversation_summaries.db');
    const sumMap = taLoadSummariesCached(sumPath, force);
    for (const [k, v] of sumMap.entries()) {
      if (!summaries.has(k)) summaries.set(k, v);
    }

    let entries = [];
    try {
      const tRead = Date.now();
      entries = fs.readdirSync(convDir).filter((name) => name.endsWith('.db')).sort();
      if (markUncSlowIfExceeded(uncDir, tRead)) {
        incompleteDirPrefixes.add(normalizeDirPrefix(convDir));
      }
    } catch {
      if (uncDir) incompleteDirPrefixes.add(normalizeDirPrefix(convDir));
      entries = [];
    }

    const dirStatLoopStartMs = Date.now();
    let statIter = 0;
    for (const fileName of entries) {
      if (uncDir) {
        if (Date.now() < wslUncBackoffUntil || markUncSlowIfExceeded(true, dirStatLoopStartMs)) {
          incompleteDirPrefixes.add(normalizeDirPrefix(convDir));
          break;
        }
      }
      const dbPath = path.join(convDir, fileName);
      const dbId = path.basename(fileName, '.db');
      const sigInfo = taGetDbFileSig(dbPath);
      if (!sigInfo) {
        if (uncDir && Date.now() < wslUncBackoffUntil) {
          incompleteDirPrefixes.add(normalizeDirPrefix(convDir));
          break;
        }
        continue;
      }
      const existing = dbCandidateById.get(dbId);
      if (!existing || sigInfo.mtimeMs > existing.sigInfo.mtimeMs) {
        dbCandidateById.set(dbId, { dbPath, sigInfo });
      }
      statIter += 1;
      if (statIter % 80 === 0 && performance.now() - sliceStartMs >= 16) {
        await yieldEventLoop();
        sliceStartMs = performance.now();
      }
    }
  }

  const activePaths = new Set();
  const parsedDbs = [];
  const failedDbs = [];
  let cacheHits = 0;
  let cacheMisses = 0;
  let missesSinceYield = 0;

  // 若 UNC 目录因 400ms 预算中断未扫完，从既有缓存回填尚未 stat 到的会话库，避免 WSL 多库用户统计残缺
  if (incompleteDirPrefixes.size > 0 && force !== 'hard') {
    for (const [cachedPath, cachedItem] of tokenAnalyticsDbCache.entries()) {
      if (!cachedItem?.parsed?.ok || !isPathInIncompleteDirs(cachedPath, incompleteDirPrefixes)) continue;
      const dbId = cachedItem.parsed.dbId || path.basename(cachedPath, '.db');
      if (!dbCandidateById.has(dbId)) {
        activePaths.add(cachedPath);
        cacheHits += 1;
        parsedDbs.push(cachedItem.parsed);
      }
    }
  }

  // 按最新修改时间优先解析，每处理 8 个未命中库或单切片达 16ms 即让出事件循环，保障主窗口胶囊与 BrowserWatcher 零阻塞
  const dbEntries = [...dbCandidateById.values()].sort(
    (a, b) => (b.sigInfo.mtimeMs || 0) - (a.sigInfo.mtimeMs || 0) || a.dbPath.localeCompare(b.dbPath)
  );
  for (const { dbPath, sigInfo } of dbEntries) {
    activePaths.add(dbPath);
    const cached = force !== 'hard' ? tokenAnalyticsDbCache.get(dbPath) : null;
    if (cached && cached.sig === sigInfo.sig) {
      cacheHits += 1;
      parsedDbs.push(cached.parsed);
      continue;
    }

    const uncDb = isUncPath(dbPath);
    if (uncDb && Date.now() < wslUncBackoffUntil) {
      if (cached?.parsed) parsedDbs.push(cached.parsed);
      continue;
    }

    cacheMisses += 1;
    missesSinceYield += 1;
    const tDbStart = Date.now();
    const rawResult = taParseConversationDetailDb(dbPath, sigInfo, force !== 'hard' ? cached : null);
    markUncSlowIfExceeded(uncDb, tDbStart);
    if (rawResult.ok) {
      const { _inc, ...compactParsed } = rawResult;
      const keepInc = _inc && Date.now() - (sigInfo.mtimeMs || 0) < 86400000 ? _inc : null;
      tokenAnalyticsDbCache.set(dbPath, { sig: sigInfo.sig, parsed: compactParsed, _inc: keepInc });
      parsedDbs.push(compactParsed);
    } else if (cached?.parsed) {
      parsedDbs.push(cached.parsed);
    } else {
      failedDbs.push({ dbId: rawResult.dbId, error: rawResult.error });
    }

    if (missesSinceYield >= 8 || performance.now() - sliceStartMs >= 16) {
      await yieldEventLoop();
      sliceStartMs = performance.now();
      missesSinceYield = 0;
    }
  }

  let prunedCount = 0;
  for (const oldPath of tokenAnalyticsDbCache.keys()) {
    if (!activePaths.has(oldPath) && !isPathInIncompleteDirs(oldPath, incompleteDirPrefixes)) {
      tokenAnalyticsDbCache.delete(oldPath);
      prunedCount += 1;
    }
  }

  if (cacheMisses > 0 || prunedCount > 0 || force === 'hard') {
    scheduleTokenAnalyticsDiskPersist();
  }

  const cutoffSec = maxDays > 0 ? nowSec - maxDays * 86400 : 0;

  const rawMetaById = new Map();
  for (const parsed of parsedDbs) {
    const id = parsed.dbId;
    const sum = summaries.get(id);

    const parentId = sum?.parentId || parsed.trajMeta.parentId || '';
    const rawRoot = parsed.trajMeta.rootId || '';
    const agentName = sum?.agentName || parsed.trajMeta.subagentType || '';
    const isSubagent = Boolean(
      (sum && sum.nestingDepth > 0) ||
        parentId ||
        agentName ||
        (rawRoot && rawRoot !== id)
    );
    const source = sum?.source || 'desktop';
    const workspaceUris = sum?.workspaceUris || parsed.trajMeta.workspaceUri || '';
    const projectId = sum?.projectId || parsed.trajMeta.projectId || '';
    const proj = taNormalizeProjectInfo(workspaceUris, projectId);

    rawMetaById.set(id, {
      id,
      title: sum?.title || '',
      source,
      agentName,
      parentId,
      rawRoot,
      isSubagent,
      proj,
      parsed
    });
  }

  const resolvedMetaById = new Map();
  const projectRegistry = new Map();

  function resolveRootId(id) {
    const seen = new Set();
    let cur = id;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const m = rawMetaById.get(cur);
      if (!m) break;
      if (m.parentId && rawMetaById.has(m.parentId) && m.parentId !== cur) {
        cur = m.parentId;
        continue;
      }
      if (m.rawRoot && rawMetaById.has(m.rawRoot) && m.rawRoot !== cur) {
        cur = m.rawRoot;
        continue;
      }
      return cur;
    }
    const m = rawMetaById.get(id);
    return m?.parentId || m?.rawRoot || id;
  }

  for (const [id, m] of rawMetaById.entries()) {
    const rootId = resolveRootId(id);
    let proj = m.proj;
    if (proj.key === '__none__' && rootId !== id && rawMetaById.has(rootId)) {
      proj = rawMetaById.get(rootId).proj;
    }
    if (!projectRegistry.has(proj.key)) {
      projectRegistry.set(proj.key, {
        key: proj.key,
        path: proj.path,
        isTemp: proj.isTemp,
        votes: new Map()
      });
    }
    const reg = projectRegistry.get(proj.key);
    reg.votes.set(proj.rawBasename, (reg.votes.get(proj.rawBasename) || 0) + 1);
    if (!reg.path && proj.path) reg.path = proj.path;

    const fallbackTitle = m.isSubagent
      ? `${m.agentName || 'subagent'} 子任务 (${id.slice(0, 8)})`
      : `会话 ${id.slice(0, 8)}`;

    resolvedMetaById.set(id, {
      id,
      title: m.title || fallbackTitle,
      source: m.source,
      agentName: m.agentName,
      parentId: m.parentId || (m.isSubagent && rootId !== id ? rootId : ''),
      rootId,
      isSubagent: m.isSubagent,
      projectKey: proj.key,
      parsed: m.parsed
    });
  }

  const projVotes = new Map([...projectRegistry.entries()].map(([k, v]) => [k, v.votes]));
  const canonicalProjectNames = taChooseCanonicalProjectNames(projVotes);

  const projects = [...projectRegistry.values()]
    .map((p) => ({
      key: p.key,
      name: p.key === '__none__' ? '未绑定项目' : p.key === '__tmp__' ? '临时目录 (/tmp)' : canonicalProjectNames.get(p.key),
      path: p.path,
      isTemp: p.isTemp
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const projNameByKey = new Map(projects.map((p) => [p.key, p.name]));

  const factsMap = new Map();
  const conversations = {};
  const dailyMap = new Map();
  let totalCalls = 0;

  for (const meta of resolvedMetaById.values()) {
    const windowCalls = cutoffSec > 0 ? meta.parsed.calls.filter((c) => c.ts >= cutoffSec) : meta.parsed.calls;
    if (windowCalls.length === 0) continue;

    let lastTs = 0;
    const modelSet = new Set();

    for (const c of windowCalls) {
      totalCalls += 1;
      if (c.ts > lastTs) lastTs = c.ts;
      modelSet.add(c.model);

      const callIsSubagent = meta.isSubagent || Boolean(c.subagentType);
      const rawSubType =
        c.subagentType === 'worker' && meta.agentName ? meta.agentName : c.subagentType || meta.agentName;
      const subagentType = callIsSubagent ? rawSubType || 'subagent' : '';
      const scenario = taResolveCallScenario(c.baseScenario, callIsSubagent, meta.source);
      const date = taToLocalDateString(c.ts || meta.parsed.mtimeSec);
      const fKey = `${date}\x00${meta.id}\x00${c.model}\x00${c.pool}\x00${scenario}\x00${subagentType}`;
      let fact = factsMap.get(fKey);
      if (!fact) {
        fact = {
          date,
          cid: meta.id,
          model: c.model,
          pool: c.pool,
          scenario,
          subagentType,
          calls: 0,
          inTok: 0,
          cacheRead: 0,
          outTok: 0,
          thinkTok: 0,
          respTok: 0,
          total: 0,
          weighted: 0,
          billable: 0
        };
        factsMap.set(fKey, fact);
      }
      fact.calls += 1;
      fact.inTok += c.inTok;
      fact.cacheRead += c.cacheRead;
      fact.outTok += c.outTok;
      fact.thinkTok += c.thinkTok;
      fact.respTok += c.respTok;
      fact.total += c.total;
      fact.weighted += c.weighted;
      fact.billable += c.billable;

      let dAcc = dailyMap.get(date);
      if (!dAcc) {
        dAcc = { date, calls: 0, inTok: 0, cacheRead: 0, outTok: 0, total: 0, weighted: 0, billable: 0 };
        dailyMap.set(date, dAcc);
      }
      dAcc.calls += 1;
      dAcc.inTok += c.inTok;
      dAcc.cacheRead += c.cacheRead;
      dAcc.outTok += c.outTok;
      dAcc.total += c.total;
      dAcc.weighted += c.weighted;
      dAcc.billable += c.billable;
    }

    conversations[meta.id] = {
      id: meta.id,
      title: meta.title,
      projectKey: meta.projectKey,
      projectName: projNameByKey.get(meta.projectKey) || '未绑定项目',
      source: meta.source,
      isSubagent: meta.isSubagent,
      agentName: meta.agentName,
      parentId: meta.parentId,
      rootId: meta.rootId,
      lastTs,
      models: [...modelSet]
    };
  }

  const facts = [...factsMap.values()].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.weighted - a.weighted;
  });
  const dailySummary = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const usedProjectKeys = new Set(Object.values(conversations).map((c) => c.projectKey));
  const activeProjects = projects.filter((p) => usedProjectKeys.has(p.key));

  return {
    version: 1,
    generatedAt: new Date(nowSec * 1000).toISOString(),
    nowSec,
    defaultMetric: 'weighted',
    elapsedMs: Number((performance.now() - t0).toFixed(2)),
    stats: {
      dbCount: dbEntries.length,
      scannedDbs: parsedDbs.length,
      failedDbs: failedDbs.length,
      totalCalls,
      conversationCount: Object.keys(conversations).length,
      projectCount: activeProjects.length,
      cacheHits,
      cacheMisses
    },
    projects: activeProjects,
    conversations,
    facts,
    dailySummary
  };
}

function runTokenAnalyticsQuery(endpoint, opts = {}) {
  const key = `${endpoint?.channel || 'default'}|${endpoint?.conversationsDir || ''}|${opts.maxDays || 365}`;
  if (!opts.force && inFlightTokenAnalyticsPromise && inFlightTokenAnalyticsKey === key) {
    return inFlightTokenAnalyticsPromise;
  }
  const run = (async () => {
    if (inFlightTokenAnalyticsPromise) {
      try {
        await inFlightTokenAnalyticsPromise;
      } catch {}
    }
    return queryTokenAnalytics(endpoint, opts);
  })();
  inFlightTokenAnalyticsKey = key;
  inFlightTokenAnalyticsPromise = run;
  run
    .finally(() => {
      if (inFlightTokenAnalyticsPromise === run) {
        inFlightTokenAnalyticsPromise = null;
        inFlightTokenAnalyticsKey = '';
      }
    })
    .catch(() => {});
  return run;
}

// ============================================================================
// 5. CDP 目标发现、WebSocket 会话挂载与热更新推送
// ============================================================================

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
  const nextDarkPreset = normalizeDarkPresetValue(rawDarkPreset);
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

function resolveParentLightPreset(target, endpoint) {
  let curId = target?.parentId || null;
  const seen = new Set();
  while (curId && !seen.has(curId)) {
    seen.add(curId);
    if (targetLightPresets.has(curId)) {
      return targetLightPresets.get(curId);
    }
    curId = targetMetaMap.get(curId)?.parentId || null;
  }
  const ch = endpoint?.channel || null;
  for (const [id, entry] of attachedTargets.entries()) {
    if (
      entry.hostConfirmed &&
      entry.type === 'page' &&
      (!ch || entry.endpoint?.channel === ch) &&
      targetLightPresets.has(id)
    ) {
      return targetLightPresets.get(id);
    }
  }
  return null;
}

function syncLightPresetToChildIframes(parentTargetId, rawLightPreset) {
  if (!activeConfig.enabled) return;
  const nextLightPreset = normalizeLightPresetValue(rawLightPreset);
  targetLightPresets.set(parentTargetId, nextLightPreset);
  const parentEntry = attachedTargets.get(parentTargetId);
  const parentChannel = parentEntry?.endpoint?.channel || null;
  for (const [, entry] of attachedTargets.entries()) {
    if (!entry.hostConfirmed || entry.type !== 'iframe') continue;
    if (!belongsToParentTarget(entry, parentTargetId, parentChannel)) continue;
    entry
      .send('Runtime.evaluate', {
        expression: `window.__ag_set_host_light_preset && window.__ag_set_host_light_preset(${JSON.stringify(nextLightPreset)})`,
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
    if (
      typeof document === 'undefined' ||
      !document.documentElement ||
      document.readyState === 'loading' ||
      (loc && (loc.protocol === 'chrome-error:' || loc.protocol === 'about:' || loc.protocol === 'data:'))
    ) {
      return 'pending';
    }
    return 'non_host';
  } catch (e) {
    return 'pending';
  }
})()`;

function readPortInfo(portFile) {
  try {
    const raw = fs.readFileSync(portFile, 'utf8').trim();
    const lines = raw.split(/\r?\n/);
    const port = parseInt(lines[0], 10);
    const wsPath = (lines[1] || '').trim();
    return {
      port: Number.isFinite(port) && port > 0 ? port : null,
      browserWsPath: wsPath.startsWith('/') ? wsPath : ''
    };
  } catch {
    return { port: null, browserWsPath: '' };
  }
}

function readPort(portFile) {
  return readPortInfo(portFile).port;
}

function redactTargetLabelForLog(raw) {
  return String(raw || '').replace(/([?&#](?:access_)?token=)[^&#\s)]+/gi, '$1<redacted>');
}

let lastIframeInjectLogAt = 0;
let lastIframeInjectLogVer = '';
let suppressedIframeInjectCount = 0;

function shouldLogIframeTargetLifecycle(patchVer) {
  const now = Date.now();
  if (patchVer !== lastIframeInjectLogVer || now - lastIframeInjectLogAt >= 600000) {
    const extra = suppressedIframeInjectCount > 0 ? ` (+${suppressedIframeInjectCount} routine iframe mounts)` : '';
    lastIframeInjectLogVer = patchVer;
    lastIframeInjectLogAt = now;
    suppressedIframeInjectCount = 0;
    return { log: true, suffix: extra };
  }
  suppressedIframeInjectCount += 1;
  return { log: false, suffix: '' };
}

function isExternalNonHostBrowserProduct(browserStr, userAgentStr = '') {
  const b = String(browserStr || '').trim();
  const ua = String(userAgentStr || '').trim();
  if (!b && !ua) return false;
  if (/electron|antigravity/i.test(b) || /electron\/|antigravity\//i.test(ua)) return false;
  return /^(?:Headless)?Chrome\/|^Edg\/|^Brave\//i.test(b);
}

function fetchBrowserVersionInfo(port) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    const req = http.get(
      { host: '127.0.0.1', port, path: '/json/version', timeout: 450 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          done({ wsUrl: '', externalBrowser: false });
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const rawWs = typeof parsed?.webSocketDebuggerUrl === 'string' ? parsed.webSocketDebuggerUrl.trim() : '';
            const wsUrl = rawWs.startsWith('ws://') || rawWs.startsWith('wss://') ? rawWs : '';
            done({
              wsUrl,
              externalBrowser: isExternalNonHostBrowserProduct(parsed?.Browser, parsed?.['User-Agent'])
            });
          } catch {
            done({ wsUrl: '', externalBrowser: false });
          }
        });
        res.on('error', () => done({ wsUrl: '', externalBrowser: false }));
      }
    );
    req.on('error', () => done({ wsUrl: '', externalBrowser: false }));
    req.on('timeout', () => {
      req.destroy();
      done({ wsUrl: '', externalBrowser: false });
    });
  });
}

async function fetchBrowserWsUrl(port, rejectExternal = false) {
  const info = await fetchBrowserVersionInfo(port);
  if (rejectExternal && info.externalBrowser) return '';
  return info.wsUrl;
}

function fetchTargetsResult(port) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    const req = http.get(
      { host: '127.0.0.1', port, path: '/json/list', timeout: 450 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          done({ reachable: false, targets: [] });
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
              done({ reachable: true, targets: parsed });
            } else {
              done({ reachable: false, targets: [] });
            }
          } catch {
            done({ reachable: false, targets: [] });
          }
        });
        res.on('error', () => done({ reachable: false, targets: [] }));
      }
    );
    req.on('error', () => done({ reachable: false, targets: [] }));
    req.on('timeout', () => {
      req.destroy();
      done({ reachable: false, targets: [] });
    });
  });
}

async function fetchTargets(port) {
  const res = await fetchTargetsResult(port);
  return res.targets;
}

function isAllowedOrigin(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  return activeConfig.allowedOrigins.some((prefix) => urlStr.startsWith(prefix));
}

function isEventDiscoveryEnabled() {
  return Boolean(
    !RUN_ONCE &&
      !daemonExiting &&
      activeConfig.enabled &&
      activeConfig.modules?.cdpEventDiscovery !== false
  );
}

function closeAllBrowserWatchers() {
  for (const [, entry] of browserWatchers.entries()) {
    entry.closing = true;
    try {
      entry.ws?.close();
    } catch {}
  }
  browserWatchers.clear();
  browserWatcherBackoffUntil.clear();
}

function isSkippedNonHost(t, nowMs = Date.now()) {
  const id = String(t?.id || t?.targetId || '').trim();
  if (!id) return false;
  const skipped = skippedNonHostTargets.get(id);
  if (!skipped || skipped.origin !== getTargetOriginKey(t.url)) return false;
  const attempts = skipped.attempts || 1;
  const ageMs = nowMs - (skipped.skippedAt || 0);
  const titleHasAg = String(t.title || '').includes('Antigravity');
  if (titleHasAg && !skipped.titleHadAg && attempts < 6 && ageMs >= 150) return false;
  if (titleHasAg && attempts < 6 && ageMs >= 3000) return false;
  if (attempts < 3 && ageMs >= 8000) return false;
  return true;
}

function isCandidateTargetInfo(t, nowMs = Date.now()) {
  if (!t || typeof t !== 'object') return false;
  const id = String(t.id || t.targetId || '').trim();
  if (!id) return false;
  const type = String(t.type || '');
  const url = String(t.url || '');
  if (!(type === 'page' || (type === 'iframe' && url.startsWith('plugin://swarm--')))) {
    return false;
  }
  if (url.startsWith('devtools://')) return false;
  if (!isAllowedOrigin(url)) return false;
  if (String(t.title || '').includes('Launchpad')) return false;
  if (isSkippedNonHost(t, nowMs)) return false;
  return true;
}

function handleBrowserTargetUpsert(info, watcherEntry) {
  if (!isEventDiscoveryEnabled()) return;
  if (!info || typeof info !== 'object') return;
  const targetId = String(info.targetId || info.id || '').trim();
  if (!targetId) return;

  const url = String(info.url || '');
  const title = String(info.title || '');
  const prevMeta = targetMetaMap.get(targetId);
  const nextParentId = info.parentId || prevMeta?.parentId || null;
  targetMetaMap.set(targetId, {
    type: info.type || prevMeta?.type || '',
    parentId: nextParentId,
    channel: watcherEntry.channel || prevMeta?.channel || 'stable',
    updatedAt: Date.now()
  });

  const skipped = skippedNonHostTargets.get(targetId);
  if (skipped && (!isAllowedOrigin(url) || getTargetOriginKey(url) !== skipped.origin)) {
    skippedNonHostTargets.delete(targetId);
  }

  const existingAttached = attachedTargets.get(targetId);
  if (existingAttached) {
    if (url || title) {
      existingAttached.updateTargetUrl?.(url, title);
    }
    return;
  }

  if (attachingTargetIds.has(targetId)) return;
  if (!isCandidateTargetInfo(info, Date.now())) return;

  const syntheticTarget = {
    id: targetId,
    type: info.type,
    title: info.title || '',
    url,
    parentId: nextParentId,
    webSocketDebuggerUrl: `ws://127.0.0.1:${watcherEntry.port}/devtools/page/${targetId}`
  };
  void attachTarget(syntheticTarget, watcherEntry.endpoint);
}

function handleBrowserTargetDestroyed(rawTargetId) {
  const targetId = String(rawTargetId || '').trim();
  if (!targetId) return;
  if (attachingTargetIds.has(targetId)) {
    destroyedWhileAttaching.add(targetId);
  }
  const entry = attachedTargets.get(targetId);
  if (entry) {
    attachedTargets.delete(targetId);
    try {
      entry.ws?.close();
    } catch {}
  }
  targetThemeModes.delete(targetId);
  targetDarkPresets.delete(targetId);
  targetLightPresets.delete(targetId);
  targetMetaMap.delete(targetId);
  skippedNonHostTargets.delete(targetId);
}

async function ensureBrowserWatcher(endpoint, port, browserWsPath = '', isFallbackPort = false) {
  if (!isEventDiscoveryEnabled() || !port) return false;
  const channel = endpoint?.channel || 'stable';
  const watcherKey = `${channel}:${port}`;

  // 同通道切换了新端口时，主动关闭旧端口上的残留 BrowserWatcher
  for (const [key, entry] of Array.from(browserWatchers.entries())) {
    if (entry.channel === channel && entry.port !== port) {
      entry.closing = true;
      browserWatchers.delete(key);
      browserWatcherBackoffUntil.delete(key);
      try {
        entry.ws?.close();
      } catch {}
    }
  }

  const desiredWsUrl = browserWsPath && browserWsPath.startsWith('/') ? `ws://127.0.0.1:${port}${browserWsPath}` : '';
  const existing = browserWatchers.get(watcherKey);
  if (existing && existing.ws) {
    const isAlive = existing.ws.readyState === WebSocket.CONNECTING || existing.ws.readyState === WebSocket.OPEN;
    const sameEndpointUrl = !desiredWsUrl || existing.wsUrl === desiredWsUrl;
    if (isAlive && sameEndpointUrl) {
      existing.endpoint = endpoint;
      return true;
    }
    existing.closing = true;
    browserWatchers.delete(watcherKey);
    try {
      existing.ws.close();
    } catch {}
  }

  const backoffUntil = browserWatcherBackoffUntil.get(watcherKey) || 0;
  if (Date.now() < backoffUntil) {
    return false;
  }

  const wsUrl = desiredWsUrl || (await fetchBrowserWsUrl(port, isFallbackPort));
  if (!wsUrl || !isEventDiscoveryEnabled()) return false;

  const existingAfterAwait = browserWatchers.get(watcherKey);
  if (
    existingAfterAwait &&
    existingAfterAwait.ws &&
    (existingAfterAwait.ws.readyState === WebSocket.CONNECTING || existingAfterAwait.ws.readyState === WebSocket.OPEN) &&
    existingAfterAwait.wsUrl === wsUrl
  ) {
    existingAfterAwait.endpoint = endpoint;
    return true;
  }

  try {
    const ws = new WebSocket(wsUrl);
    const watcherEntry = {
      ws,
      wsUrl,
      port,
      channel,
      endpoint,
      reconnectAfterMs: 0,
      closing: false
    };
    browserWatchers.set(watcherKey, watcherEntry);

    let msgId = 1;
    let disconnected = false;
    const watcherConnectTimer = setTimeout(() => {
      if (!disconnected && ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close();
        } catch {}
        handleDisconnect();
      }
    }, 3000);

    ws.addEventListener('open', () => {
      clearTimeout(watcherConnectTimer);
      if (watcherEntry.closing || !isEventDiscoveryEnabled()) {
        try {
          ws.close();
        } catch {}
        return;
      }
      browserWatcherBackoffUntil.delete(watcherKey);
      watcherEntry.reconnectAfterMs = 0;
      try {
        ws.send(
          JSON.stringify({
            id: msgId++,
            method: 'Target.setDiscoverTargets',
            params: { discover: true }
          })
        );
        console.log(`[Daemon] Browser CDP watcher connected (${channel}:${port})`);
      } catch {}
    });

    ws.addEventListener('message', (event) => {
      if (watcherEntry.closing || !isEventDiscoveryEnabled()) return;
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!msg || !msg.method) return;
      if (msg.method === 'Target.targetCreated' || msg.method === 'Target.targetInfoChanged') {
        handleBrowserTargetUpsert(msg.params?.targetInfo, watcherEntry);
      } else if (msg.method === 'Target.targetDestroyed') {
        handleBrowserTargetDestroyed(msg.params?.targetId);
      }
    });

    const handleDisconnect = () => {
      if (disconnected) return;
      disconnected = true;
      clearTimeout(watcherConnectTimer);
      if (browserWatchers.get(watcherKey) === watcherEntry) {
        browserWatchers.delete(watcherKey);
      }
      if (!watcherEntry.closing && isEventDiscoveryEnabled()) {
        const until = Date.now() + 5000;
        watcherEntry.reconnectAfterMs = until;
        browserWatcherBackoffUntil.set(watcherKey, until);
      }
    };

    ws.addEventListener('close', handleDisconnect);
    ws.addEventListener('error', handleDisconnect);
    return true;
  } catch {
    if (isEventDiscoveryEnabled()) {
      browserWatcherBackoffUntil.set(watcherKey, Date.now() + 5000);
    }
    return false;
  }
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
  if (attachedTargets.has(target.id) || attachingTargetIds.has(target.id)) {
    return Promise.resolve(false);
  }
  attachingTargetIds.add(target.id);
  destroyedWhileAttaching.delete(target.id);

  return new Promise((resolveAttach) => {
    let ws = null;
    let settled = false;
    const finishAttach = (ok) => {
      if (!settled) {
        settled = true;
        clearTimeout(attachTimeout);
        attachingTargetIds.delete(target.id);
        if (destroyedWhileAttaching.delete(target.id)) {
          if (attachedTargets.get(target.id)?.ws === ws) {
            attachedTargets.delete(target.id);
          }
          targetThemeModes.delete(target.id);
          targetDarkPresets.delete(target.id);
          targetLightPresets.delete(target.id);
          targetMetaMap.delete(target.id);
          skippedNonHostTargets.delete(target.id);
          try {
            ws?.close();
          } catch {}
          resolveAttach(false);
          return;
        }
        resolveAttach(ok);
      }
    };
    const attachTimeout = setTimeout(() => finishAttach(false), 2500);

    try {
      ws = new WebSocket(wsUrl);
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
        const uiLangVal = activeConfig.modules?.i18n === false ? 'en' : 'target';
        if (target.type !== 'iframe') {
          return {
            script: activeConfig.enabled
              ? `window.__ag_host_ui_lang=${JSON.stringify(uiLangVal)};\n${cachedInjectScript}`
              : cachedInjectScript,
            parentMode: '',
            parentDarkPreset: '',
            parentLightPreset: '',
            uiLangVal
          };
        }
        if (!activeConfig.enabled) {
          return { script: cachedIframeInjectScript, parentMode: '', parentDarkPreset: '', parentLightPreset: '', uiLangVal };
        }
        const parentMode = resolveParentThemeMode(target, endpoint) || '';
        const parentDarkPreset = resolveParentDarkPreset(target, endpoint) || '';
        const parentLightPreset = resolveParentLightPreset(target, endpoint) || '';
        const modeVal = parentMode === 'dark' || parentMode === 'light' ? parentMode : null;
        const darkVal = parentDarkPreset === 'claude-warm' || parentDarkPreset === 'onyx' ? parentDarkPreset : null;
        const lightVal = parentLightPreset ? normalizeLightPresetValue(parentLightPreset) : null;
        return {
          script: `window.__ag_host_theme_mode=${modeVal ? JSON.stringify(modeVal) : 'null'};\nwindow.__ag_host_dark_preset=${darkVal ? JSON.stringify(darkVal) : 'null'};\nwindow.__ag_host_light_preset=${lightVal ? JSON.stringify(lightVal) : 'null'};\nwindow.__ag_host_ui_lang=${JSON.stringify(uiLangVal)};\n${cachedIframeInjectScript}`,
          parentMode: modeVal || '',
          parentDarkPreset: darkVal || '',
          parentLightPreset: lightVal || '',
          uiLangVal
        };
      };

      const updateNewDocScript = (force = false) => {
        newDocQueue = newDocQueue
          .then(async () => {
            const { script, parentMode, parentDarkPreset, parentLightPreset, uiLangVal } = buildTargetInjectScript();
            const nextSig = `${activeConfig.enabled}|${cachedPatchVersion}|${activeConfig.preset || ''}|${activeConfig.darkPreset || ''}|${uiLangVal || ''}|${parentMode}|${parentDarkPreset || ''}|${parentLightPreset || ''}`;
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
        if (ws.readyState !== WebSocket.OPEN || destroyedWhileAttaching.has(target.id)) {
          return false;
        }
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
          targetLightPresets.delete(target.id);
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
          if (target.type === 'iframe') {
            const gate = shouldLogIframeTargetLifecycle(cachedPatchVersion);
            if (gate.log) {
              console.log(
                `[Daemon] Injected (${cachedPatchVersion}) into iframe ${target.id} [${endpoint.channel}]${gate.suffix}`
              );
            }
          } else {
            console.log(`[Daemon] Injected (${cachedPatchVersion}) into target ${target.id} [${endpoint.channel}]`);
          }
          return true;
        }
      };

      let metricsSyncInFlight = null;
      let queuedMetricsSync = null;

      const syncMetricsForSessionInner = async (force = false, skipDomEval = false) => {
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

          const renderedSig = `${payload.hasData ? '1' : '0'}:${payload.dbFound ? '1' : '0'}\n${payload.inlineHtml || ''}\n${payload.tooltipHtml || ''}`;
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

      const syncMetricsForSession = async (force = false, skipDomEval = false) => {
        if (metricsSyncInFlight) {
          queuedMetricsSync = {
            force: Boolean(queuedMetricsSync?.force || force),
            skipDomEval: queuedMetricsSync ? Boolean(queuedMetricsSync.skipDomEval && skipDomEval) : Boolean(skipDomEval)
          };
          return metricsSyncInFlight;
        }
        metricsSyncInFlight = (async () => {
          let curForce = force;
          let curSkip = skipDomEval;
          try {
            while (true) {
              await syncMetricsForSessionInner(curForce, curSkip);
              if (!queuedMetricsSync) break;
              curForce = queuedMetricsSync.force;
              curSkip = queuedMetricsSync.skipDomEval;
              queuedMetricsSync = null;
            }
          } finally {
            metricsSyncInFlight = null;
          }
        })();
        return metricsSyncInFlight;
      };

      const checkAndInject = async () => {
        try {
          if (!hostConfirmed || nonHostSettled || ws.readyState !== WebSocket.OPEN) return;
          if (!isAllowedOrigin(currentTargetUrl)) {
            if (attachedTargets.get(target.id)?.ws === ws) {
              attachedTargets.delete(target.id);
              targetThemeModes.delete(target.id);
              targetDarkPresets.delete(target.id);
          targetLightPresets.delete(target.id);
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
                ' === "iframe" ? (window.__ag_host_dark_preset || window.__ag_runtime_dark_preset || (document.documentElement ? document.documentElement.getAttribute("data-ag-dark-preset") : null)) : (document.documentElement ? document.documentElement.getAttribute("data-ag-dark-preset") : null), lightPreset: ' +
                JSON.stringify(target.type === 'iframe' ? 'iframe' : 'page') +
                ' === "iframe" ? (window.__ag_host_light_preset || window.__ag_runtime_light_preset || (document.documentElement ? document.documentElement.getAttribute("data-ag-preset") : null)) : (document.documentElement ? document.documentElement.getAttribute("data-ag-preset") : null) })',
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
              if (checkVal.lightPreset) {
                const normLight = normalizeLightPresetValue(checkVal.lightPreset);
                const prevLightPreset = targetLightPresets.get(target.id);
                targetLightPresets.set(target.id, normLight);
                if (prevLightPreset !== normLight) {
                  syncLightPresetToChildIframes(target.id, normLight);
                }
              }
            } else if (activeConfig.enabled && target.type === 'iframe') {
              const parentMode = resolveParentThemeMode(target, endpoint);
              const parentDarkPreset = resolveParentDarkPreset(target, endpoint);
              const parentLightPreset = resolveParentLightPreset(target, endpoint);
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
              if (parentLightPreset && checkVal.lightPreset !== parentLightPreset) {
                await send('Runtime.evaluate', {
                  expression: `window.__ag_set_host_light_preset && window.__ag_set_host_light_preset(${JSON.stringify(parentLightPreset)})`,
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
              darkPreset: document.documentElement ? document.documentElement.getAttribute("data-ag-dark-preset") : null,
              lightPreset: document.documentElement ? document.documentElement.getAttribute("data-ag-preset") : null
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
            if (state.lightPreset) {
              const normLight = normalizeLightPresetValue(state.lightPreset);
              const prevLightPreset = targetLightPresets.get(target.id);
              targetLightPresets.set(target.id, normLight);
              if (prevLightPreset !== normLight) {
                syncLightPresetToChildIframes(target.id, normLight);
              }
            }
          }
        } catch {}
      };

      let currentTargetUrl = String(target.url || '');
      let currentTargetTitle = String(target.title || '');
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
          const prevSkipped = skippedNonHostTargets.get(target.id);
          const sameOrigin = prevSkipped && prevSkipped.origin === originKey;
          const attempts = sameOrigin ? (prevSkipped.attempts || 1) + 1 : 1;
          const titleHasAg = String(currentTargetTitle || target.title || '').includes('Antigravity');
          skippedNonHostTargets.set(target.id, {
            origin: originKey,
            skippedAt: Date.now(),
            attempts,
            titleHadAg: Boolean((sameOrigin && prevSkipped.titleHadAg) || titleHasAg)
          });
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
          targetLightPresets.delete(target.id);
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
        skippedNonHostTargets.delete(target.id);
        const entry = attachedTargets.get(target.id);
        if (entry && entry.ws === ws) {
          entry.hostConfirmed = true;
        }
        if (target.type === 'iframe') {
          const gate = shouldLogIframeTargetLifecycle(cachedPatchVersion);
          if (gate.log) {
            console.log(
              `[Daemon] Attached iframe: ${target.id} (${redactTargetLabelForLog(target.title || target.url || 'iframe')}) [${endpoint.channel}]${gate.suffix}`
            );
          }
        } else {
          console.log(
            `[Daemon] Attached target: ${target.id} (${redactTargetLabelForLog(target.title || 'Untitled')}) [${endpoint.channel}]`
          );
        }
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
          if (target.type === 'page') {
            await send('Runtime.addBinding', { name: '__agRequestMetrics' });
            await send('Runtime.addBinding', { name: '__agRequestHardReload' });
            await send('Runtime.addBinding', { name: '__agSetDarkPreset' });
            await send('Runtime.addBinding', { name: '__agSetLightPreset' });
            await send('Runtime.addBinding', { name: '__agSetUiLang' });
            await send('Runtime.addBinding', { name: '__agSyncHostThemeMode' });
            await send('Runtime.addBinding', { name: '__agRequestTokenAnalytics' });
          }
        }
        if (ws.readyState !== WebSocket.OPEN || nonHostSettled) {
          finishAttach(false);
          return false;
        }
        await updateNewDocScript(true);
        const ok = await inject();
        if (target.type === 'page') {
          await syncMetricsForSession(true);
        }
        initialAttachDone = true;
        clearTimeout(attachTimeout);
        finishAttach(ok);
        return ok;
      };

      const PENDING_RETRY_DELAYS_MS = [30, 50, 100, 200];
      const schedulePendingRetry = () => {
        clearPendingTimer();
        if (!pendingProbe || hostConfirmed || nonHostSettled || ws.readyState !== WebSocket.OPEN) return;
        if (pendingRetryCount >= 40) {
          pendingProbe = false;
          if (attachedTargets.get(target.id)?.ws === ws) {
            attachedTargets.delete(target.id);
            targetThemeModes.delete(target.id);
            targetDarkPresets.delete(target.id);
          targetLightPresets.delete(target.id);
          }
          clearTimeout(attachTimeout);
          try {
            ws.close();
          } catch {}
          finishAttach(false);
          return;
        }
        const delayMs = PENDING_RETRY_DELAYS_MS[Math.min(pendingRetryCount, PENDING_RETRY_DELAYS_MS.length - 1)];
        pendingRetryCount += 1;
        pendingRetryTimer = setTimeout(() => {
          pendingRetryTimer = null;
          void recheckPendingHost();
        }, delayMs);
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
          targetLightPresets.delete(target.id);
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
        if (destroyedWhileAttaching.has(target.id) || ws.readyState !== WebSocket.OPEN || nonHostSettled) {
          finishAttach(false);
          return;
        }
        if (isExemptInternalTarget(target)) {
          await promoteToHost();
          return;
        }
        if (!runtimeEnabled) {
          runtimeEnabled = true;
          await send('Runtime.enable');
        }
        if (ws.readyState !== WebSocket.OPEN || nonHostSettled || destroyedWhileAttaching.has(target.id)) {
          finishAttach(false);
          return;
        }
        const kind = await probeHostKind();
        if (ws.readyState !== WebSocket.OPEN || nonHostSettled || destroyedWhileAttaching.has(target.id)) {
          finishAttach(false);
          return;
        }
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
        if (ws.readyState !== WebSocket.OPEN || nonHostSettled || destroyedWhileAttaching.has(target.id)) {
          finishAttach(false);
          return;
        }
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
            const normDark = normalizeDarkPresetValue(msg.params.payload);
            syncDarkPresetToChildIframes(target.id, normDark);
            broadcastPresetToTargets('dark', normDark, target.id);
            if (!SAFE_MODE) {
              persistDarkPresetToUserConfig(normDark);
            }
            return;
          }
          if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agSetLightPreset') {
            if (!hostConfirmed || target.type !== 'page' || !activeConfig.enabled) {
              return;
            }
            const normLight = normalizeLightPresetValue(msg.params.payload);
            syncLightPresetToChildIframes(target.id, normLight);
            broadcastPresetToTargets('light', normLight, target.id);
            if (!SAFE_MODE) {
              persistLightPresetToUserConfig(normLight);
            }
            return;
          }
          if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agSetUiLang') {
            if (!hostConfirmed || target.type !== 'page' || !activeConfig.enabled) {
              return;
            }
            const normLang = normalizeUiLangValue(msg.params.payload);
            const persistedOk = SAFE_MODE ? true : persistUiLangToUserConfig(normLang, true);
            if (persistedOk) {
              broadcastUiLangToTargets(normLang, target.id);
            }
            return;
          }
          if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agRequestTokenAnalytics') {
            if (
              !hostConfirmed ||
              target.type !== 'page' ||
              !activeConfig.enabled ||
              !activeConfig.modules.tokenAnalytics ||
              !DatabaseSync
            ) {
              return;
            }
            let req = {};
            try {
              req = msg.params.payload ? JSON.parse(String(msg.params.payload)) : {};
            } catch {}
            const reqId = String(req?.reqId || '');
            const maxDays = Number(req?.maxDays) > 0 ? Number(req.maxDays) : 365;
            const force = req?.force === 'hard' ? 'hard' : Boolean(req?.force);
            void (async () => {
              let payloadJson = '';
              try {
                const data = await runTokenAnalyticsQuery(endpoint, { maxDays, force });
                if (tokenAnalyticsLastJsonCache.dataRef === data && tokenAnalyticsLastJsonCache.jsonStr) {
                  payloadJson = tokenAnalyticsLastJsonCache.jsonStr;
                } else {
                  payloadJson = JSON.stringify({ ok: true, data });
                  tokenAnalyticsLastJsonCache = { dataRef: data, jsonStr: payloadJson };
                }
              } catch (err) {
                payloadJson = JSON.stringify({
                  ok: false,
                  error: err?.message || String(err || 'token analytics failed')
                });
              }
              if (ws.readyState === WebSocket.OPEN) {
                const safeJsonLiteral = JSON.stringify(payloadJson)
                  .replace(/\u2028/g, '\\u2028')
                  .replace(/\u2029/g, '\\u2029');
                try {
                  await send('Runtime.evaluate', {
                    expression: `if (typeof window.__ag_on_token_analytics === 'function') { window.__ag_on_token_analytics(${JSON.stringify(reqId)}, JSON.parse(${safeJsonLiteral})); }`,
                    returnByValue: false
                  });
                } catch {}
              }
            })();
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
          targetLightPresets.delete(target.id);
        }
        finishAttach(false);
      };
      ws.addEventListener('close', closeHandler);
      ws.addEventListener('error', closeHandler);

      attachedTargets.set(target.id, {
        ws,
        type: target.type,
        parentId: target.parentId || null,
        attachedAt: Date.now(),
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
        updateTargetUrl: (u, nextTitle = '') => {
          let changed = false;
          if (nextTitle) {
            const tStr = String(nextTitle);
            if (tStr !== currentTargetTitle) {
              currentTargetTitle = tStr;
              if (tStr.includes('Antigravity')) changed = true;
            }
          }
          if (u) {
            const nextUrl = String(u);
            if (nextUrl !== currentTargetUrl) {
              currentTargetUrl = nextUrl;
              changed = true;
            }
          }
          if (changed && pendingProbe && !hostConfirmed && !nonHostSettled && ws.readyState === WebSocket.OPEN) {
            void recheckPendingHost();
          }
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
let staleZhHubPids = [];

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
        staleZhHubPids = [];
        setZhTitleStatus('ok');
        return;
      }
      const isPatchedDisk = (r) => String(r?.diskState || '').startsWith('PATCHED');
      const channelScoped =
        activeConfig.channel === 'stable'
          ? activeRecs.filter((r) => !String(r.app || '').includes('Insiders'))
          : activeConfig.channel === 'insiders'
            ? activeRecs.filter((r) => String(r.app || '').includes('Insiders'))
            : activeRecs;
      const baseRecs = channelScoped.length > 0 ? channelScoped : activeRecs;
      const runningRecs = baseRecs.filter((r) => Array.isArray(r.hubProcs) && r.hubProcs.length > 0);
      const relevantRecs = runningRecs.length > 0 ? runningRecs : baseRecs;

      const staleRecs = relevantRecs.filter((r) => isPatchedDisk(r) && r.liveState === 'STALE_RUNNING_INODE');
      if (staleRecs.length > 0) {
        const nextStalePids = [];
        for (const rec of staleRecs) {
          if (Array.isArray(rec.hubProcs)) {
            for (const hp of rec.hubProcs) {
              const p = Number(hp?.pid) || 0;
              if (p > 0 && hp?.match === false && !nextStalePids.includes(p)) {
                nextStalePids.push(p);
              }
            }
          }
        }
        staleZhHubPids = nextStalePids;
        setZhTitleStatus(
          'stale_inode',
          '中文标题补丁待重载生效',
          '磁盘补丁已自动修补完毕，但运行中服务仍挂载更新前旧镜像。可在对话空闲时重启客户端，或在终端执行下方命令热重载（热重载会刷新窗口）：',
          'python3 ~/.gemini/antigravity/scripts/antigravity-zh-title-patch.py reload-hub'
        );
        return;
      }
      if (relevantRecs.every(isPatchedDisk)) {
        staleZhHubPids = [];
        setZhTitleStatus('ok');
      } else {
        staleZhHubPids = [];
        if (zhTitleStatus.state !== 'tcc_blocked') {
          setZhTitleStatus('unpatched');
        }
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
    staleZhHubPids = [];
    setZhTitleStatus('ok');
    return;
  }
  if (sig === lastZhPatchSig) {
    if (!hasProbedZhLiveOnce) {
      const pyProbe = resolveWorkingPython3();
      if (pyProbe) probeZhTitleLiveState(pyProbe, scriptPath);
    } else if (
      zhTitleStatus.state === 'stale_inode' &&
      (staleZhHubPids.length === 0 || !staleZhHubPids.every(isPidAlive))
    ) {
      // 仅在旧镜像 language_server PID 退出或变化时重新探测，避免空闲态每 30s 反复读取 ~390MB 二进制
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

function readPosixSingletonLockState(portFile) {
  if (!portFile) return { status: 'unknown', pid: 0 };
  const userDataDir = path.dirname(portFile);
  if (!fs.existsSync(userDataDir)) return { status: 'absent', pid: 0 };
  const lockPath = path.join(userDataDir, 'SingletonLock');
  try {
    const lst = fs.lstatSync(lockPath, { throwIfNoEntry: false });
    if (!lst) return { status: 'absent', pid: 0 };
    if (!lst.isSymbolicLink()) return { status: 'unknown', pid: 0 };
    const target = String(fs.readlinkSync(lockPath) || '');
    const m = target.match(/-(\d+)$/);
    if (!m) return { status: 'unknown', pid: 0 };
    const pid = parseInt(m[1], 10);
    if (!pid || pid <= 0) return { status: 'absent', pid: 0 };
    return isPidAlive(pid) ? { status: 'alive', pid } : { status: 'dead', pid };
  } catch {
    return { status: 'unknown', pid: 0 };
  }
}

const staleWinLockfileChannels = new Set();

function probeRunningHostProcesses(channelMode = 'auto', endpoints = [], reachableChannels = null) {
  const allowStable = channelMode !== 'insiders';
  const allowInsiders = channelMode !== 'stable';

  if (process.platform === 'darwin' || process.platform === 'linux') {
    // 零子进程空闲预筛（解决客户端未启动或已豁免时每 2.5s fork `ps` 被 launchd 标记 inefficient 的 CPU 空转缺陷）：
    // Electron 主进程启动首行即调用 app.requestSingleInstanceLock() 在 userDataDir 下创建 SingletonLock -> <host>-<pid> 软链。
    // 仅当通道无活跃可达 CDP、无存活豁免 PID 且 SingletonLock 指向未处理的存活 PID（或罕见非软链残留）时才按需执行 ps。
    const targetPids = [];
    let needFullScan = false;
    const candidateChannels = [];
    if (allowStable) candidateChannels.push('stable');
    if (allowInsiders) candidateChannels.push('insiders');

    for (const ch of candidateChannels) {
      const ep = endpoints.find((e) => e.channel === ch);
      if (ch === 'insiders' && ep && ep.channelInstalled === false) continue;
      if (reachableChannels ? reachableChannels.has(ch) : ep && readPort(ep.portFile)) continue;
      const exemptPid = exemptedHostPidByChannel.get(ch);
      if (exemptPid && isPidAlive(exemptPid)) continue;

      if (ep && ep.portFile) {
        const lockState = readPosixSingletonLockState(ep.portFile);
        if (lockState.status === 'absent' || lockState.status === 'dead') {
          continue;
        }
        if (lockState.status === 'alive') {
          if (!ignoredUnflaggedHostPids.has(lockState.pid) && !targetPids.includes(lockState.pid)) {
            targetPids.push(lockState.pid);
          }
          continue;
        }
      }
      needFullScan = true;
    }

    if (!needFullScan && targetPids.length === 0) return [];

    const psArgs = needFullScan
      ? ['-axo', 'pid=,etime=,command=']
      : ['-p', targetPids.join(','), '-o', 'pid=,etime=,command='];
    const res = spawnSync('ps', psArgs, {
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
      if (!pid || NON_HOST_CMD_RE.test(cmd)) continue;
      if (process.platform === 'darwin') {
        if (/Helper(?:\s|\.|\/)/i.test(cmd)) continue;
        const appMatch = cmd.match(
          /^(\/[^\r\n]*?\/Antigravity(?:\s-\sInsiders)?\.app)\/Contents\/MacOS\/(Antigravity(?:\s-\sInsiders)?)(?:\s|$)/
        );
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
      } else {
        if (/daemon\.mjs|install\.mjs/.test(cmd)) continue;
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
    }
    return found;
  }

  if (process.platform === 'win32') {
    // 三层零开销预筛（零文件句柄锁竞态）：
    // 1) 若某通道已存在活跃 DevToolsActivePort，或已豁免无参宿主 PID 仍存活，直接 O(1) 内存级跳过；
    // 2) 只读检查 userDataDir/lockfile 是否存在（GetFileAttributesExW，绝不打开句柄以免与 Electron FILE_SHARE_NONE 抢锁）：正常关闭后 lockfile 被自动删除，实现客户端关闭态 0 次 tasklist、0 次 PowerShell；
    // 3) 若遇崩溃残留未删 lockfile，首次未检出进程后降频为隔拍复检（<=5s，仍完全覆盖 12s 冷启动接力窗）。
    const imageSpecs = [];
    const checkWinChannelCandidate = (ch, ep, img) => {
      if (reachableChannels ? reachableChannels.has(ch) : ep && readPort(ep.portFile)) {
        staleWinLockfileChannels.delete(ch);
        return;
      }
      const exemptPid = exemptedHostPidByChannel.get(ch);
      if (exemptPid && isPidAlive(exemptPid)) return;
      if (ep && ep.portFile) {
        const lockPath = path.join(path.dirname(ep.portFile), 'lockfile');
        if (!fs.statSync(lockPath, { throwIfNoEntry: false })) {
          staleWinLockfileChannels.delete(ch);
          return;
        }
        if (staleWinLockfileChannels.has(ch) && syncTickCount % 2 === 0) {
          return;
        }
      }
      imageSpecs.push({ channel: ch, img });
    };
    const stableEp = endpoints.find((ep) => ep.channel === 'stable');
    const insidersEp = endpoints.find((ep) => ep.channel === 'insiders');
    if (allowStable) {
      checkWinChannelCandidate('stable', stableEp, 'Antigravity.exe');
    }
    if (allowInsiders && insidersEp && insidersEp.channelInstalled) {
      checkWinChannelCandidate('insiders', insidersEp, 'Antigravity - Insiders.exe');
    }
    if (imageSpecs.length === 0) return [];

    const candidatePids = [];
    for (const { channel: ch, img } of imageSpecs) {
      const tl = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${img}`, '/FO', 'CSV', '/NH'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 2500
      });
      let anyProcessForImg = false;
      if (tl.status === 0 && tl.stdout) {
        for (const row of String(tl.stdout).split(/\r?\n/)) {
          const cm = row.trim().match(/^"([^"]+)","(\d+)"/);
          if (cm && cm[1].toLowerCase() === img.toLowerCase()) {
            anyProcessForImg = true;
            const p = parseInt(cm[2], 10);
            if (p > 0 && !ignoredUnflaggedHostPids.has(p) && !knownNonHostPids.has(p)) {
              candidatePids.push(p);
            }
          }
        }
      }
      if (anyProcessForImg) {
        staleWinLockfileChannels.delete(ch);
      } else {
        staleWinLockfileChannels.add(ch);
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

  return [];
}

function hasActiveConversationWalWrite(endpoint, windowSec = 15, minWalMtimeMs = 0) {
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
        if (
          st &&
          st.size > 4096 &&
          now - st.mtimeMs < windowMs &&
          (!minWalMtimeMs || st.mtimeMs >= minWalMtimeMs)
        ) {
          return true;
        }
      }
    } catch {}
  }
  return false;
}

const WIN32_LNK_SIG_FILE = path.join(os.tmpdir(), 'ag-win32-lnk-sig.json');
let isWin32LnkHealing = false;
let lastWin32ExeSigMem = null;

function ensureWin32CdpShortcutsIfUpdated(forceHeal = false) {
  if (SAFE_MODE || RUN_ONCE || process.platform !== 'win32' || isWin32LnkHealing) return;
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const exeCandidates = [
    path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
    path.join(progFiles, 'Antigravity', 'Antigravity.exe'),
    path.join(localAppData, 'Programs', 'Antigravity - Insiders', 'Antigravity - Insiders.exe')
  ];
  const sigParts = [];
  for (const exe of exeCandidates) {
    try {
      const st = fs.statSync(exe, { throwIfNoEntry: false });
      if (st) sigParts.push(`${exe}:${Math.round(st.mtimeMs)}:${st.size}`);
    } catch {}
  }
  if (sigParts.length === 0) return;
  const currentSig = sigParts.join('|');

  if (lastWin32ExeSigMem === null) {
    const saved = readJsonSafe(WIN32_LNK_SIG_FILE, null);
    lastWin32ExeSigMem = saved && typeof saved.sig === 'string' ? saved.sig : '';
  }
  if (!forceHeal && currentSig === lastWin32ExeSigMem) return;

  isWin32LnkHealing = true;
  const psHeal = [
    `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$specs = @(`,
    `  @{ dir = [Environment]::GetFolderPath('Desktop'); recurse = $false; depth = 0 },`,
    `  @{ dir = [Environment]::GetFolderPath('CommonDesktopDirectory'); recurse = $false; depth = 0 },`,
    `  @{ dir = [Environment]::GetFolderPath('Programs'); recurse = $true; depth = 2 },`,
    `  @{ dir = [Environment]::GetFolderPath('CommonPrograms'); recurse = $true; depth = 2 },`,
    `  @{ dir = (Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'); recurse = $false; depth = 0 }`,
    `) | Where-Object { $_.dir -and (Test-Path -LiteralPath $_.dir) }`,
    `$seenDirs = @{}`,
    `$wsh = New-Object -ComObject WScript.Shell`,
    `$patched = 0`,
    `foreach ($spec in $specs) {`,
    `  $key = ([string]$spec.dir).ToLowerInvariant()`,
    `  if ($seenDirs.ContainsKey($key)) { continue }`,
    `  $seenDirs[$key] = $true`,
    `  $lnks = if ($spec.recurse) {`,
    `    Get-ChildItem -LiteralPath $spec.dir -Filter '*.lnk' -File -Recurse -Depth $spec.depth -ErrorAction SilentlyContinue`,
    `  } else {`,
    `    Get-ChildItem -LiteralPath $spec.dir -Filter '*.lnk' -File -ErrorAction SilentlyContinue`,
    `  }`,
    `  foreach ($f in $lnks) {`,
    `    $sc = $wsh.CreateShortcut($f.FullName)`,
    `    $tp = [string]$sc.TargetPath`,
    `    if ($tp -match 'Antigravity( - Insiders)?\\.exe$') {`,
    `      $argStr = [string]$sc.Arguments`,
    `      if ($argStr -notmatch '--remote-debugging-port') {`,
    `        $sc.Arguments = if ($argStr.Trim()) { "$($argStr.Trim()) --remote-debugging-port=0" } else { '--remote-debugging-port=0' }`,
    `        $sc.Save()`,
    `        $patched++`,
    `      }`,
    `    }`,
    `  }`,
    `}`,
    `Write-Output "PATCHED=$patched"`
  ].join('\n');

  const child = execFile(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psHeal],
    { windowsHide: true, timeout: 15000 },
    (err, stdout) => {
      isWin32LnkHealing = false;
      if (err) return;
      lastWin32ExeSigMem = currentSig;
      const m = String(stdout || '').match(/PATCHED=(\d+)/);
      const patchedCount = m ? parseInt(m[1], 10) || 0 : 0;
      try {
        fs.writeFileSync(
          WIN32_LNK_SIG_FILE,
          `${JSON.stringify({ sig: currentSig, updatedAt: new Date().toISOString(), patched: patchedCount }, null, 2)}\n`,
          'utf8'
        );
      } catch {}
      if (patchedCount > 0) {
        const msg = `[Daemon] Auto-healed ${patchedCount} Windows shortcut(s) with --remote-debugging-port=0 after client update.`;
        console.log(msg);
        logDaemonEvent(msg);
      }
    }
  );
  try {
    child.stdin?.end();
  } catch {}
}

function tokenizeRelaunchCmdLine(cmdLine, platform = process.platform) {
  const src = String(cmdLine || '');
  const tokens = [];
  if (platform === 'win32') {
    // 遵循 Windows CommandLineToArgvW 的 2n / 2n+1 反斜杠 + 双引号规则
    let cur = '';
    let inQuotes = false;
    let hasToken = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\\') {
        let bsCount = 1;
        while (i + bsCount < src.length && src[i + bsCount] === '\\') bsCount++;
        if (i + bsCount < src.length && src[i + bsCount] === '"') {
          cur += '\\'.repeat(Math.floor(bsCount / 2));
          hasToken = true;
          if (bsCount % 2 === 1) {
            cur += '"';
          } else {
            inQuotes = !inQuotes;
          }
          i += bsCount;
          continue;
        }
        cur += '\\'.repeat(bsCount);
        hasToken = true;
        i += bsCount - 1;
        continue;
      }
      if (ch === '"') {
        hasToken = true;
        if (inQuotes && i + 1 < src.length && src[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && /\s/.test(ch)) {
        if (hasToken || cur.length > 0) {
          tokens.push(cur);
          cur = '';
          hasToken = false;
        }
        continue;
      }
      cur += ch;
      hasToken = true;
    }
    if (hasToken || cur.length > 0) tokens.push(cur);
    return tokens;
  }

  // POSIX ps -axo command= 输出无外层 shell 引号，禁用单引号配对以免路径中的撇号（如 John's Repo）吞没后续参数
  let cur = '';
  let inDoubleQuote = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inDoubleQuote) {
      if (ch === '\\' && i + 1 < src.length && src[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inDoubleQuote = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inDoubleQuote = true;
    } else if (/\s/.test(ch)) {
      if (cur.length > 0) {
        tokens.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) tokens.push(cur);
  return tokens;
}

function stripLeadingExecutableFromCmdLine(cmdLine, exePath = '', platform = process.platform) {
  const src = String(cmdLine || '').trimStart();
  if (!src) return '';
  const exe = String(exePath || '').trim();
  if (exe) {
    const cmpSrc = platform === 'win32' ? src.toLowerCase() : src;
    const cmpExe = platform === 'win32' ? exe.toLowerCase() : exe;
    const quotedExe = `"${cmpExe}"`;
    if (cmpSrc.startsWith(quotedExe)) {
      const rest = src.slice(quotedExe.length);
      if (!rest || /^\s/.test(rest)) return rest.trimStart();
    }
    if (cmpSrc.startsWith(cmpExe)) {
      const rest = src.slice(cmpExe.length);
      if (!rest || /^\s/.test(rest)) return rest.trimStart();
    }
  }
  if (platform === 'darwin') {
    const macAppMatch = src.match(
      /^(?:"[^"]+"|\S.*?\/Antigravity(?:\s-\sInsiders)?\.app\/Contents\/MacOS\/Antigravity(?:\s-\sInsiders)?)(?=\s|$)/
    );
    if (macAppMatch) return src.slice(macAppMatch[0].length).trimStart();
  } else if (platform === 'win32') {
    const winExeMatch = src.match(/^(?:"[^"]+"|[a-zA-Z]:\\[^\r\n]*?\.exe)(?=\s|$)/i);
    if (winExeMatch) return src.slice(winExeMatch[0].length).trimStart();
  }
  if (src.startsWith('"')) {
    const endQuote = src.indexOf('"', 1);
    if (endQuote > 0) return src.slice(endQuote + 1).trimStart();
  }
  const firstWs = src.search(/\s/);
  return firstWs < 0 ? '' : src.slice(firstWs + 1).trimStart();
}

function readLinuxProcCmdlineArgs(pid, platform = process.platform) {
  if (platform !== 'linux' || !Number.isInteger(pid) || pid <= 0) return null;
  try {
    const raw = fs.readFileSync(`/proc/${pid}/cmdline`);
    if (!raw || raw.length === 0) return null;
    const parts = raw.toString('utf8').split('\0');
    if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    return parts.length > 1 ? parts.slice(1) : [];
  } catch {
    return null;
  }
}

function normalizeProxyUrl(address, defaultScheme = 'http') {
  const raw = String(address || '').trim();
  if (!raw) return '';
  // Chromium --proxy-server 允许逗号分隔回退链（如 http://127.0.0.1:7890,direct://），提取首个真实代理节点
  const firstHop = raw
    .split(',')
    .map((s) => s.trim())
    .find((s) => s && !/^direct:\/\//i.test(s));
  if (!firstHop) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(firstHop)) return firstHop;
  return `${defaultScheme}://${firstHop}`;
}

function parseProxyServerSpec(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (!text.includes('=')) {
    const url = normalizeProxyUrl(text, 'http');
    return url ? { httpProxy: url, httpsProxy: url } : null;
  }
  const map = Object.create(null);
  for (const entry of text.split(';')) {
    const eq = entry.indexOf('=');
    if (eq <= 0) continue;
    const scheme = entry.slice(0, eq).trim().toLowerCase();
    const val = entry.slice(eq + 1).trim();
    if (scheme && val) map[scheme] = val;
  }
  let httpProxy = map.http ? normalizeProxyUrl(map.http, 'http') : '';
  let httpsProxy = map.https ? normalizeProxyUrl(map.https, 'http') : '';
  if (map.socks) {
    // WinINet 注册表中的 socks= 协议名无版本后缀，现代本地代理客户端普遍提供 SOCKS5 混合监听，Go net/http 亦仅支持 socks5://
    const socks = normalizeProxyUrl(map.socks, 'socks5');
    if (!httpProxy) httpProxy = socks;
    if (!httpsProxy) httpsProxy = socks;
  }
  if (!httpProxy && httpsProxy) httpProxy = httpsProxy;
  if (!httpsProxy && httpProxy) httpsProxy = httpProxy;
  if (!httpProxy && !httpsProxy) {
    const firstVal = Object.values(map)[0];
    if (firstVal) {
      const url = normalizeProxyUrl(firstVal, 'http');
      httpProxy = url;
      httpsProxy = url;
    }
  }
  return httpProxy || httpsProxy ? { httpProxy, httpsProxy } : null;
}

function normalizeBypassTokenForNoProxy(rawEntry) {
  const trimmed = String(rawEntry || '').trim();
  if (!trimmed) return '';
  const low = trimmed.toLowerCase();
  if (low === '<local>' || low === '<-loopback>') return '';
  if (low === '[::1]') return '::1';
  if (trimmed === '*.*.*.*') return '*';

  // 分离非 IPv6 末尾端口（如 192.168.1.*:8080 或 *corp.com:8443）
  let hostPart = trimmed;
  let portSuffix = '';
  const firstColon = trimmed.indexOf(':');
  const lastColon = trimmed.lastIndexOf(':');
  if (firstColon > 0 && firstColon === lastColon && /^\d{1,5}$/.test(trimmed.slice(firstColon + 1))) {
    hostPart = trimmed.slice(0, firstColon);
    portSuffix = trimmed.slice(firstColon);
  }

  if (/^\d{1,3}(?:\.(?:\d{1,3}|\*)){1,3}$/.test(hostPart) && hostPart.includes('*')) {
    const parts = hostPart.split('.');
    const starIdx = parts.indexOf('*');
    if (starIdx >= 1 && starIdx <= 3 && parts.slice(starIdx).every((p) => p === '*')) {
      const nums = parts.slice(0, starIdx).map((n) => Number(n));
      if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
        const octets = [...nums, 0, 0, 0].slice(0, 4);
        // Go httpproxy 对 CIDR 条目不支持附带端口后缀，统一输出标准网段 CIDR
        return `${octets.join('.')}/${starIdx * 8}`;
      }
    }
    return '';
  }

  // WinINet 允许 *corp.com（无点号），近似转换为 Go/Node 支持的子域后缀 .corp.com
  if (/^\*[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(hostPart)) {
    return `.${hostPart.slice(1)}${portSuffix}`;
  }

  return `${hostPart}${portSuffix}`;
}

function parseBypassListEntries(raw) {
  const out = [];
  for (const part of String(raw || '').split(/[;,\s]+/)) {
    const norm = normalizeBypassTokenForNoProxy(part);
    if (norm) out.push(norm);
  }
  return out;
}

function mergeNoProxyValue(existingRaw, extraEntries = []) {
  const LOOPBACK_ENTRIES = ['localhost', '127.0.0.1', '::1'];
  const merged = [];
  const seen = new Set();
  const pushItem = (rawItem) => {
    const norm = normalizeBypassTokenForNoProxy(rawItem);
    if (!norm) return;
    const key = norm.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(norm);
  };
  for (const part of String(existingRaw || '').split(/[,;]+/)) {
    pushItem(part);
  }
  for (const extra of extraEntries) {
    pushItem(extra);
  }
  for (const lb of LOOPBACK_ENTRIES) {
    pushItem(lb);
  }
  return merged.join(',');
}

function extractRelaunchArgsFromCmdLine(cmdLine, meta = {}) {
  const platform = meta?.platform || process.platform;
  const procTokens = Array.isArray(meta?.procArgs)
    ? meta.procArgs
    : readLinuxProcCmdlineArgs(meta?.pid, platform);
  const tokens =
    procTokens !== null
      ? procTokens
      : (() => {
          const rest = stripLeadingExecutableFromCmdLine(cmdLine, meta?.exePath || '', platform);
          return rest ? tokenizeRelaunchCmdLine(rest, platform) : [];
        })();
  if (tokens.length === 0) return { allArgs: [], preservedProxyArgs: [] };

  const VALUE_FLAGS = new Set(['--proxy-server', '--proxy-bypass-list', '--proxy-pac-url']);
  const BOOL_FLAGS = new Set(['--no-proxy-server', '--proxy-auto-detect']);
  const DROP_EXACT_FLAGS = new Set(['--updated', '--remote-debugging-pipe', '--inspect', '--inspect-brk']);
  const DROP_VALUE_FLAGS = new Set(['--remote-debugging-port', '--type']);
  const DROP_PREFIXES = ['--squirrel-', '-psn_', '--inspect=', '--inspect-brk='];
  const allArgs = [];
  const preservedProxyArgs = [];
  const seenProxy = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok) continue;
    if (tok.startsWith('-')) {
      const lowTok = tok.toLowerCase();
      if (DROP_PREFIXES.some((pfx) => lowTok.startsWith(pfx))) {
        continue;
      }
      const eqIdx = tok.indexOf('=');
      const flag = (eqIdx >= 0 ? tok.slice(0, eqIdx) : tok).toLowerCase();
      if (DROP_EXACT_FLAGS.has(flag)) continue;
      if (DROP_VALUE_FLAGS.has(flag)) {
        if (eqIdx < 0 && i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
          i++;
        }
        continue;
      }
      if (BOOL_FLAGS.has(flag)) {
        if (!seenProxy.has(flag)) {
          seenProxy.add(flag);
          preservedProxyArgs.push(flag);
          allArgs.push(flag);
        }
        continue;
      }
      if (VALUE_FLAGS.has(flag)) {
        let val = '';
        if (eqIdx >= 0) {
          val = tok.slice(eqIdx + 1).trim();
        } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
          val = tokens[++i].trim();
        }
        if (val && !seenProxy.has(flag)) {
          seenProxy.add(flag);
          const normalized = `${flag}=${val}`;
          preservedProxyArgs.push(normalized);
          allArgs.push(normalized);
        }
        continue;
      }
      if (platform === 'darwin') {
        if (tok.startsWith('--')) {
          allArgs.push(tok);
        }
        continue;
      }
    } else if (platform === 'darwin') {
      // macOS ps -axo command= 不带引号，丢弃无引号位置路径碎片，交由 Electron 原生会话记忆恢复打开的工作区
      continue;
    }
    allArgs.push(tok);
  }
  return { allArgs, preservedProxyArgs };
}

function readWindowsSystemProxyFresh() {
  if (process.platform !== 'win32') return null;
  try {
    const r = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000
    });
    if (r.status !== 0 || !r.stdout) return null;
    const out = String(r.stdout);
    const enabledMatch = out.match(/ProxyEnable[ \t]+REG_DWORD[ \t]+0x([0-9a-f]+)/i);
    if (!enabledMatch || parseInt(enabledMatch[1], 16) !== 1) return null;
    const serverMatch = out.match(/ProxyServer[ \t]+REG_SZ[ \t]*([^\r\n]*)/i);
    if (!serverMatch || !serverMatch[1].trim()) return null;
    const parsed = parseProxyServerSpec(serverMatch[1]);
    if (!parsed) return null;
    const overrideMatch = out.match(/ProxyOverride[ \t]+REG_SZ[ \t]*([^\r\n]*)/i);
    const rawBypassList = overrideMatch ? overrideMatch[1].trim() : '';
    return {
      ...parsed,
      rawBypassList,
      noProxyEntries: parseBypassListEntries(rawBypassList)
    };
  } catch {
    return null;
  }
}

function redactProxyCredentials(text) {
  return String(text || '').replace(/(:\/\/)([^@\s/]+)@/g, '$1<redacted>@');
}

function readEnvCaseInsensitive(envObj, keyName, joinAll = false) {
  const target = keyName.toLowerCase();
  const vals = [];
  for (const [k, v] of Object.entries(envObj)) {
    if (k.toLowerCase() === target && v !== undefined && v !== null && String(v).trim() !== '') {
      if (!joinAll) return String(v);
      vals.push(String(v));
    }
  }
  return joinAll ? vals.join(',') : '';
}

function writeProxyEnvPair(envObj, upperKey, val, platform = process.platform) {
  const lowerKey = upperKey.toLowerCase();
  if (platform === 'win32') {
    for (const k of Object.keys(envObj)) {
      if (k.toLowerCase() === lowerKey && k !== upperKey) {
        delete envObj[k];
      }
    }
    envObj[upperKey] = val;
  } else {
    envObj[upperKey] = val;
    envObj[lowerKey] = val;
  }
}

function buildRelaunchPlan(cmdLine, targetMeta = {}) {
  const platform = targetMeta?.platform || process.platform;
  const { allArgs, preservedProxyArgs } = extractRelaunchArgsFromCmdLine(cmdLine, targetMeta);
  const args = ['--remote-debugging-port=0', ...allArgs];
  const env = { ...(targetMeta?.baseEnv || process.env) };
  const hasExplicitNoProxyFlag = preservedProxyArgs.includes('--no-proxy-server');
  const proxyBypassArg = preservedProxyArgs.find((a) => a.startsWith('--proxy-bypass-list='));
  const cliBypassEntries = proxyBypassArg
    ? parseBypassListEntries(proxyBypassArg.slice('--proxy-bypass-list='.length))
    : [];
  const hasAnyProxyEnv = () =>
    Boolean(
      readEnvCaseInsensitive(env, 'HTTP_PROXY') ||
        readEnvCaseInsensitive(env, 'HTTPS_PROXY') ||
        readEnvCaseInsensitive(env, 'ALL_PROXY')
    );

  let proxySource = 'none';
  let extraBypassEntries = [...cliBypassEntries];
  if (hasExplicitNoProxyFlag) {
    proxySource = 'cli-no-proxy';
  } else if (hasAnyProxyEnv()) {
    proxySource = 'inherited-env';
  } else {
    const proxyServerArg = preservedProxyArgs.find((a) => a.startsWith('--proxy-server='));
    let resolved = proxyServerArg ? parseProxyServerSpec(proxyServerArg.slice('--proxy-server='.length)) : null;
    if (resolved) {
      proxySource = 'cli-proxy-flag';
    } else if (platform === 'win32') {
      resolved = readWindowsSystemProxyFresh();
      if (resolved) proxySource = 'win32-system-proxy';
    }
    if (resolved) {
      if (resolved.httpProxy) {
        writeProxyEnvPair(env, 'HTTP_PROXY', resolved.httpProxy, platform);
      }
      if (resolved.httpsProxy) {
        writeProxyEnvPair(env, 'HTTPS_PROXY', resolved.httpsProxy, platform);
      }
      if (Array.isArray(resolved.noProxyEntries)) {
        extraBypassEntries = [...extraBypassEntries, ...resolved.noProxyEntries];
      }
    }
  }

  // 只要最终环境携带任意 *_PROXY（包括 --no-proxy-server 下仍从父进程继承 HTTP_PROXY 的场景），一律合并环回与绕行列表以防 Node 侧代理库劫持环回请求
  if (hasAnyProxyEnv()) {
    const existingNoProxy = readEnvCaseInsensitive(env, 'NO_PROXY', true);
    const mergedNoProxy = mergeNoProxyValue(existingNoProxy, extraBypassEntries);
    writeProxyEnvPair(env, 'NO_PROXY', mergedNoProxy, platform);
  }

  return { args, env, preservedProxyArgs, proxySource };
}

function maybeAutoRelaunchColdStartWithoutCdp(reachableChannels = null) {
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
  const hostProcs = probeRunningHostProcesses(activeConfig.channel, activeConfig.endpoints, reachableChannels);
  if (hostProcs.length === 0) return false;

  for (const proc of hostProcs) {
    if (proc.hasCdpFlag) continue;
    if (ignoredUnflaggedHostPids.has(proc.pid)) continue;

    const ep = activeConfig.endpoints.find((e) => e.channel === proc.channel) || activeConfig.endpoints[0];
    if (reachableChannels ? reachableChannels.has(proc.channel) : ep && readPort(ep.portFile)) continue;

    const maxWindowSec = proc.hasUpdatedFlag ? 25 : 12;
    if (proc.elapsedSec > maxWindowSec) {
      ignoredUnflaggedHostPids.add(proc.pid);
      exemptedHostPidByChannel.set(proc.channel, proc.pid);
      const msg = `[Daemon] Detected running Antigravity (${proc.channel}, PID ${proc.pid}, uptime ${proc.elapsedSec}s) started without --remote-debugging-port; skipping auto-relaunch to protect active session. Run \`node ${path.join(ROOT_DIR, 'install.mjs')} relaunch\` when idle.`;
      console.log(msg);
      logDaemonEvent(msg);
      continue;
    }

    const procBirthMs = Number.isFinite(proc.elapsedSec) ? Date.now() - proc.elapsedSec * 1000 + 800 : 0;
    if (hasActiveConversationWalWrite(ep, 15, procBirthMs)) {
      ignoredUnflaggedHostPids.add(proc.pid);
      exemptedHostPidByChannel.set(proc.channel, proc.pid);
      const msg = `[Daemon] Skipped cold-start auto-relaunch for PID ${proc.pid}: active conversation WAL write detected after process start.`;
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

      // 在终止旧主进程之前提前构建重启计划（确保 Linux 下 /proc/<pid>/cmdline 存活可读）
      const relaunchPlan = buildRelaunchPlan(proc.cmd, proc);

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
        spawnSync('/usr/bin/open', ['-a', proc.appPath, '--args', ...relaunchPlan.args], {
          env: relaunchPlan.env,
          stdio: 'ignore',
          timeout: 5000
        });
      } else if (proc.exePath) {
        const child = spawn(proc.exePath, relaunchPlan.args, {
          cwd: os.homedir(),
          env: relaunchPlan.env,
          detached: true,
          stdio: 'ignore',
          windowsHide: false
        });
        child.unref();
      }

      const safeArgsLog = relaunchPlan.args.map(redactProxyCredentials).join(' ');
      const okMsg = `[Daemon] Cold-start auto-relaunched Antigravity (${proc.channel}, old PID ${proc.pid}, age ${proc.elapsedSec}s) with ${safeArgsLog} (proxy=${relaunchPlan.proxySource}).`;
      console.log(okMsg);
      logDaemonEvent(okMsg);
      if (process.platform === 'win32' && proc.hasUpdatedFlag) {
        ensureWin32CdpShortcutsIfUpdated(true);
      }
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
  const syncStartMs = Date.now();
  syncTickCount = (syncTickCount + 1) % 6000;
  try {
    if (syncTickCount % 12 === 1) ensureZhTitlePatchIfPresent();
    if (syncTickCount % 12 === 2) ensureWin32CdpShortcutsIfUpdated(false);
    if (process.platform === 'win32' && syncTickCount % 12 === 3 && attachedTargets.size > 0) {
      void ensureWin32WslProbesWarmAsync(activeConfig.endpoints);
    }
    if (syncTickCount % 24 === 1) {
      trimPosixDaemonLogsIfNeeded();
      if (
        !inFlightTokenAnalyticsPromise &&
        !tokenAnalyticsPersistTimer &&
        (tokenAnalyticsDbCache.size > 0 || tokenAnalyticsSummariesCache.size > 0 || wslSqliteStagingCache.size > 0) &&
        Date.now() - lastTokenAnalyticsAccessMs > 600000
      ) {
        tokenAnalyticsDbCache.clear();
        tokenAnalyticsSummariesCache.clear();
        tokenAnalyticsDiskLoaded = false;
        tokenAnalyticsLastJsonCache = { dataRef: null, jsonStr: '' };
        cleanupWslSqliteStagingCache();
      }
    }
    const bundleChanged = rebuildBundleIfNeeded();
    if (!activeConfig.enabled) {
      targetThemeModes.clear();
      targetDarkPresets.clear();
      targetLightPresets.clear();
    }
    if (!isEventDiscoveryEnabled()) {
      closeAllBrowserWatchers();
    }
    const shouldHeartbeatCheck = bundleChanged || syncTickCount % 6 === 1;

    const activeTargetIds = new Set();
    const seenRawTargetIds = new Set();
    const fullScannedChannels = new Set();
    const reachableChannels = new Set();
    const pendingPages = [];
    const pendingIframes = [];
    const fastPathPageEntries = [];

    const probedPorts = new Set();
    const nowMs = Date.now();
    for (const endpoint of activeConfig.endpoints) {
      const portInfo = readPortInfo(endpoint.portFile);
      let activePort = portInfo.port;
      let activeBrowserWsPath = portInfo.browserWsPath;

      // BrowserWatcher 事件流在线时的非心跳拍快路径：跳过每 2.5s 的 HTTP /json/list 全量枚举（削减 83% 轮询 IPC），
      // 目标创建/销毁由 Target.setDiscoverTargets 毫秒级实时推送，每 6 拍（15s）或配置热更新时仍执行完整 HTTP 对账。
      const liveWatcher =
        !RUN_ONCE && !shouldHeartbeatCheck && isEventDiscoveryEnabled() && activePort
          ? browserWatchers.get(`${endpoint.channel}:${activePort}`)
          : null;
      if (liveWatcher && liveWatcher.ws && liveWatcher.ws.readyState === WebSocket.OPEN) {
        probedPorts.add(activePort);
        reachableChannels.add(endpoint.channel);
        liveWatcher.endpoint = endpoint;
        for (const [id, entry] of attachedTargets.entries()) {
          if ((entry.endpoint?.channel || 'stable') !== endpoint.channel) continue;
          const rs = entry.ws?.readyState;
          if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) {
            activeTargetIds.add(id);
            if (entry.hostConfirmed && entry.type !== 'iframe' && entry.syncMetricsForSession) {
              fastPathPageEntries.push(entry);
            }
          }
        }
        continue;
      }

      let fromPortFile = false;
      let reachable = false;
      let targets = [];
      if (activePort && !probedPorts.has(activePort)) {
        probedPorts.add(activePort);
        const res = await fetchTargetsResult(activePort);
        reachable = res.reachable;
        targets = res.targets;
        if (reachable) fromPortFile = true;
      }
      if (
        !reachable &&
        endpoint.channelInstalled !== false &&
        endpoint.fallbackPort &&
        !probedPorts.has(endpoint.fallbackPort) &&
        (RUN_ONCE || nowMs >= (fallbackBackoffUntil.get(endpoint.fallbackPort) || 0))
      ) {
        probedPorts.add(endpoint.fallbackPort);
        const res = await fetchTargetsResult(endpoint.fallbackPort);
        if (!res.reachable) {
          fallbackBackoffUntil.set(endpoint.fallbackPort, nowMs + 10000);
        } else {
          const verInfo = await fetchBrowserVersionInfo(endpoint.fallbackPort);
          if (verInfo.externalBrowser) {
            fallbackBackoffUntil.set(endpoint.fallbackPort, nowMs + 10000);
          } else {
            reachable = true;
            targets = res.targets;
            fallbackBackoffUntil.delete(endpoint.fallbackPort);
            activePort = endpoint.fallbackPort;
            activeBrowserWsPath = '';
          }
        }
      }
      if (!reachable) continue;

      fullScannedChannels.add(endpoint.channel);
      if (fromPortFile || targets.length > 0) {
        reachableChannels.add(endpoint.channel);
      }
      if (isEventDiscoveryEnabled() && activePort) {
        await ensureBrowserWatcher(endpoint, activePort, activeBrowserWsPath, !fromPortFile);
      }
      if (targets.length === 0) continue;

      for (const t of targets) {
        if (!t?.id) continue;
        seenRawTargetIds.add(t.id);
        targetMetaMap.set(t.id, {
          type: t.type,
          parentId: t.parentId || null,
          channel: endpoint.channel,
          updatedAt: Date.now()
        });
        const skipped = skippedNonHostTargets.get(t.id);
        if (skipped && (!isAllowedOrigin(t.url) || getTargetOriginKey(t.url) !== skipped.origin)) {
          skippedNonHostTargets.delete(t.id);
        }
      }

      const pages = targets.filter((t) => Boolean(t.webSocketDebuggerUrl) && isCandidateTargetInfo(t, nowMs));

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
          if (!attachingTargetIds.has(page.id)) {
            attachPromises.push(attachTarget(page, endpoint));
          }
        } else {
          const entry = attachedTargets.get(page.id);
          entry.endpoint = endpoint;
          entry.parentId = page.parentId || entry.parentId || null;
          entry.updateTargetUrl?.(page.url, page.title);
          if (entry.hostConfirmed) {
            if (bundleChanged && entry.updateNewDocScript) {
              await entry.updateNewDocScript();
            }
            if (shouldHeartbeatCheck && entry.checkAndInject) await entry.checkAndInject();
            if (entry.type !== 'iframe' && entry.syncMetricsForSession) {
              await entry.syncMetricsForSession(bundleChanged);
            }
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
    for (const entry of fastPathPageEntries) {
      if (entry.hostConfirmed && entry.ws?.readyState === WebSocket.OPEN && entry.syncMetricsForSession) {
        await entry.syncMetricsForSession(false);
      }
    }

    // 2.33.0+ 冷启动无标记自愈（M2）：仅在 0 活跃 CDP 目标且无可达 CDP 通道时按严苛冷启动时间窗探测并自动接力重启
    if (pendingPages.length === 0 && attachedTargets.size === 0 && reachableChannels.size === 0) {
      maybeAutoRelaunchColdStartWithoutCdp(reachableChannels);
    }

    // 清理已关闭的目标连接（防竞态误杀：跳过本轮快照开始后由 BrowserWS 新附着的目标）
    for (const [id, entry] of attachedTargets.entries()) {
      if (!activeTargetIds.has(id)) {
        if (entry.attachedAt && entry.attachedAt >= syncStartMs) {
          continue;
        }
        try {
          entry.ws.close();
        } catch {}
        attachedTargets.delete(id);
        targetThemeModes.delete(id);
        targetDarkPresets.delete(id);
        targetLightPresets.delete(id);
      }
    }
    if (fullScannedChannels.size > 0) {
      for (const [id, skipped] of skippedNonHostTargets.entries()) {
        const metaCh = targetMetaMap.get(id)?.channel;
        if ((!metaCh || fullScannedChannels.has(metaCh)) && !seenRawTargetIds.has(id) && (skipped?.skippedAt || 0) < syncStartMs) {
          skippedNonHostTargets.delete(id);
        }
      }
      for (const [id, meta] of targetMetaMap.entries()) {
        if (
          (!meta?.channel || fullScannedChannels.has(meta.channel)) &&
          !seenRawTargetIds.has(id) &&
          !attachedTargets.has(id) &&
          !attachingTargetIds.has(id) &&
          (meta?.updatedAt || 0) < syncStartMs
        ) {
          targetMetaMap.delete(id);
        }
      }
    } else if (reachableChannels.size === 0 && attachedTargets.size === 0 && attachingTargetIds.size === 0) {
      for (const [id, skipped] of skippedNonHostTargets.entries()) {
        if ((skipped?.skippedAt || 0) < syncStartMs) {
          skippedNonHostTargets.delete(id);
        }
      }
      for (const [id, meta] of targetMetaMap.entries()) {
        if ((meta?.updatedAt || 0) < syncStartMs) {
          targetMetaMap.delete(id);
        }
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
