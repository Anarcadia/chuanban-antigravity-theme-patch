#!/usr/bin/env node
/**
 * chuanban-antigravity-theme-patch · CDP Theme & Live Metrics Daemon (core/daemon.mjs)
 *
 * 架构特性（v5.0.0）：
 * 1. 动态 Node 分级：
 *    - Node >= 22.0：完整启用暖白主题、更纱黑体、输入框蜡封三态、450条汉化、死锁自愈。
 *    - Node >= 22.13：动态 `await import('node:sqlite')` 解锁底部实时会话指标胶囊；低版本优雅降级绝不崩溃。
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
  const argvPath = path.join(home, isInsiders ? '.antigravity-insiders' : '.antigravity', 'argv.json');
  let fallbackPort = isInsiders ? 9223 : 9222;
  try {
    if (fs.existsSync(argvPath)) {
      const m = fs.readFileSync(argvPath, 'utf8').match(/"remote-debugging-port"\s*:\s*(\d+)/);
      if (m && parseInt(m[1], 10) > 0) fallbackPort = parseInt(m[1], 10);
    }
  } catch {}

  return {
    channel: singleChannel,
    portFile: getArg('--port-file', userCfg.portFile || defaultPortFile),
    fallbackPort: Number(userCfg.fallbackPort) > 0 ? Number(userCfg.fallbackPort) : fallbackPort,
    conversationsDir: getArg('--conversations-dir', userCfg.conversationsDir || defaultConvDir)
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
const BASE_VERSION = '20261104-v5.0.0';
let cachedBundleSig = '';
let cachedInjectScript = '';
let cachedPatchVersion = '';
let activeConfig = {
  enabled: true,
  channel: 'auto',
  preset: 'high-contrast',
  contextLimit: 256000,
  modules: {
    i18n: true,
    metrics: true,
    composerWaxSeal: true,
    deadlockHealer: true,
    customCss: true,
    customJs: true
  },
  themeVars: {},
  allowedOrigins: ['http://127.0.0.1', 'https://127.0.0.1', 'http://localhost', 'https://localhost', 'vscode-file://'],
  endpoints: []
};

function getFileMtimeSig(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '0:0';
    const st = fs.statSync(filePath);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return '0:0';
  }
}

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

  const sig = [...coreFiles, ...userFiles].map(getFileMtimeSig).join('|') + `|safe:${SAFE_MODE}|cli:${CLI_CHANNEL || ''}`;
  if (sig === cachedBundleSig && cachedInjectScript) {
    return false;
  }

  const userCfg = SAFE_MODE ? {} : readJsonSafe(path.join(USER_DIR, 'config.json'), {});
  const enabled = SAFE_MODE ? true : userCfg.enabled !== false;
  const channel = CLI_CHANNEL || userCfg.channel || 'auto';
  const preset = userCfg.preset || 'high-contrast';
  const contextLimit = Number(userCfg.contextLimit) > 0 ? Number(userCfg.contextLimit) : 256000;

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

  activeConfig = {
    enabled,
    channel,
    preset,
    contextLimit,
    modules,
    themeVars,
    selectors: userCfg.selectors || {},
    allowedOrigins: Array.isArray(userCfg.allowedOrigins)
      ? userCfg.allowedOrigins
      : ['http://127.0.0.1', 'https://127.0.0.1', 'http://localhost', 'https://localhost', 'vscode-file://'],
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
    .update(baseCss)
    .update(customCss)
    .update(JSON.stringify(mergedDict))
    .update(customJs)
    .update(JSON.stringify({ preset, modules, themeVars, selectors: activeConfig.selectors }))
    .digest('hex')
    .slice(0, 8);

  const channelTag = channel === 'insiders' ? 'insiders' : 'stable';
  cachedPatchVersion = `${BASE_VERSION}-${channelTag}-${hash}`;

  const bootPayload = {
    version: cachedPatchVersion,
    platform: process.platform,
    enabled,
    preset,
    cssText: baseCss,
    customCss,
    themeVars,
    i18nDict: mergedDict,
    modules,
    features: modules,
    selectors: activeConfig.selectors,
    config: {
      enabled,
      channel,
      preset,
      contextLimit,
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
// 3. 单实例 PID 锁（防止重复启动守护进程）
// ============================================================================
const pidKey = CLI_CHANNEL || 'default';
const PID_FILE = path.join(os.tmpdir(), `ag-theme-daemon-${pidKey}.pid`);
if (!RUN_ONCE) {
  try {
    if (fs.existsSync(PID_FILE)) {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (oldPid && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0);
          process.kill(oldPid, 'SIGTERM');
        } catch {}
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
// 4. 零依赖 Protobuf 解析器（专用于解析 ~/.gemini/antigravity/conversations/<id>.pb）
// ============================================================================
const MODEL_ENUM_MAP = {
  285: 'Gemini 3 Pro (High)',
  286: 'Gemini 3 Pro (Low)',
  334: 'Claude Sonnet 4.6',
  342: 'GPT-OSS 120B (Medium)',
  378: 'Gemini 3 Flash',
  382: 'Claude Opus 4.6 (Thinking)',
  402: 'Claude Opus 4.6 (High)',
  405: 'Claude Sonnet 4.6 (High)'
};

const pbCache = new Map();
const PB_CACHE_MAX_SIZE = 50;

function readVarint(buf, offset) {
  let res = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const b = buf[pos++];
    res |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { val: res, pos };
    shift += 7n;
    if (shift > 64n) break;
  }
  return null;
}

function parseProto(buf, maxDepth = 2) {
  let i = 0;
  const out = {};
  while (i < buf.length) {
    const tag = readVarint(buf, i);
    if (!tag) break;
    i = tag.pos;
    const wt = Number(tag.val & 7n);
    const fn = Number(tag.val >> 3n);
    if (fn <= 0 || fn > 10000) break;

    if (wt === 0) {
      const v = readVarint(buf, i);
      if (!v) break;
      i = v.pos;
      if (!out[fn]) out[fn] = [];
      out[fn].push(Number(v.val));
    } else if (wt === 2) {
      let len = 0;
      let s = 0;
      while (i < buf.length) {
        const b = buf[i++];
        len |= (b & 0x7f) << s;
        if ((b & 0x80) === 0) break;
        s += 7;
      }
      if (len < 0 || i + len > buf.length) break;
      const sub = buf.subarray(i, i + len);
      i += len;
      if (!out[fn]) out[fn] = [];
      if (maxDepth > 0) {
        out[fn].push({ _buf: sub, _parsed: parseProto(sub, maxDepth - 1) });
      } else {
        out[fn].push({ _buf: sub });
      }
    } else if (wt === 1) {
      if (i + 8 > buf.length) break;
      i += 8;
    } else if (wt === 5) {
      if (i + 4 > buf.length) break;
      i += 4;
    } else {
      break;
    }
  }
  return out;
}

function tsToMs(tsParsed) {
  if (!tsParsed) return 0;
  const sec = tsParsed[1]?.[0] || 0;
  const nanos = tsParsed[2]?.[0] || 0;
  return sec * 1000 + nanos / 1e6;
}

function parseConversationMetrics(cascadeId, conversationsDir) {
  if (!DatabaseSync) return null;
  if (!cascadeId || !/^[0-9a-f-]{36}$/i.test(cascadeId)) return null;
  const pbPath = path.join(conversationsDir, `${cascadeId}.pb`);
  let stat;
  try {
    stat = fs.statSync(pbPath);
  } catch {
    return { cascadeId, hasData: false };
  }

  const cached = pbCache.get(pbPath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.metrics;
  }

  let db;
  try {
    db = new DatabaseSync(pbPath, { readOnly: true });
    const stepRow = db
      .prepare("SELECT value FROM [default] WHERE key = 'trajectory.steps'")
      .get();
    const metaRow = db
      .prepare("SELECT value FROM [default] WHERE key = 'trajectory.generator_metadata'")
      .get();

    const stepList = stepRow?.value
      ? parseProto(Buffer.from(stepRow.value, 'base64'), 1)[1] || []
      : [];
    const metaList = metaRow?.value
      ? parseProto(Buffer.from(metaRow.value, 'base64'), 1)[1] || []
      : [];

    let toolCalls = 0;
    let lastUserStepIdx = -1;
    const stepTimingByIdx = new Map();

    for (let idx = 0; idx < stepList.length; idx++) {
      const s = stepList[idx]._parsed;
      const type = s[1]?.[0];
      if (type === 14) {
        lastUserStepIdx = idx;
      }
      if (type === 15) {
        const meta = parseProto(s[4]?.[0]?._buf || Buffer.alloc(0), 2);
        const createdMs = tsToMs(meta[1]?.[0]?._parsed);
        const completedMs = tsToMs(meta[7]?.[0]?._parsed);
        const firstChunkMs = tsToMs(meta[12]?.[0]?._parsed);

        const pr = parseProto(s[20]?.[0]?._buf || Buffer.alloc(0), 1);
        const tcCount = pr[6] ? pr[6].length : 0;
        toolCalls += tcCount;

        const thinkDur = pr[8]?.[0]
          ? parseProto(pr[8][0]._buf, 0)[1]?.[0] || 0
          : 0;
        stepTimingByIdx.set(idx, {
          createdMs,
          completedMs,
          firstChunkMs,
          thinkDurSec: thinkDur
        });
      }
    }

    let totalInput = 0;
    let totalOutput = 0;
    let totalThinking = 0;
    let totalCacheRead = 0;
    const valid = [];

    for (const gm of metaList) {
      const g = gm._parsed;
      const stepIndices = g[1] || [];
      const cmBuf = g[2]?.[0]?._buf;
      if (!cmBuf) continue;
      const cm = parseProto(cmBuf, 2);
      const u = cm[1]?.[0]?._parsed;
      if (!u) continue;

      const modelEnum = u[1]?.[0] || cm[3]?.[0] || 0;
      const inputTokens = u[2]?.[0] || 0;
      const outputTokens = u[3]?.[0] || 0;
      const cacheReadTokens = u[5]?.[0] || 0;
      const thinkingTokens = u[8]?.[0] || 0;

      if (inputTokens === 0 && outputTokens === 0 && cacheReadTokens === 0) {
        continue;
      }

      totalInput += inputTokens;
      totalOutput += outputTokens;
      totalThinking += thinkingTokens;
      totalCacheRead += cacheReadTokens;

      const lastStepIdx = stepIndices.length > 0 ? stepIndices[stepIndices.length - 1] : -1;
      const timing = stepTimingByIdx.get(lastStepIdx);

      let genMs = 0;
      let ttftMs = 0;
      if (timing && timing.completedMs > timing.createdMs) {
        if (timing.firstChunkMs > timing.createdMs && timing.completedMs > timing.firstChunkMs) {
          ttftMs = timing.firstChunkMs - timing.createdMs;
          genMs = timing.completedMs - timing.firstChunkMs;
        } else {
          const totalMs = timing.completedMs - timing.createdMs;
          ttftMs = timing.thinkDurSec > 0 ? timing.thinkDurSec * 1000 : Math.min(totalMs * 0.25, 2500);
          genMs = Math.max(200, totalMs - ttftMs);
        }
      }

      valid.push({
        stepIndices,
        lastStepIdx,
        modelEnum,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        thinkingTokens,
        ttftMs,
        genMs
      });
    }

    if (valid.length === 0) {
      const emptyRes = { cascadeId, hasData: false, stepCount: stepList.length };
      if (pbCache.size >= PB_CACHE_MAX_SIZE) {
        const oldestKey = pbCache.keys().next().value;
        pbCache.delete(oldestKey);
      }
      pbCache.set(pbPath, { mtimeMs: stat.mtimeMs, size: stat.size, metrics: emptyRes });
      return emptyRes;
    }

    const last = valid[valid.length - 1];
    let rawTurnSteps = 0;
    for (let idx = Math.max(0, lastUserStepIdx + 1); idx < stepList.length; idx++) {
      if (stepList[idx]._parsed[1]?.[0] === 15) {
        rawTurnSteps++;
      }
    }
    const turnRecords =
      lastUserStepIdx >= 0 && rawTurnSteps > 0
        ? valid.slice(-Math.min(rawTurnSteps, valid.length))
        : [last];

    let turnOutput = 0;
    let turnThinking = 0;
    let turnGenMs = 0;
    let firstTurnTtftMs = turnRecords[0]?.ttftMs || last.ttftMs || 0;

    for (const r of turnRecords) {
      turnOutput += r.outputTokens;
      turnThinking += r.thinkingTokens;
      turnGenMs += r.genMs;
    }

    const effectiveGenMs = turnGenMs > 0 ? turnGenMs : last.genMs;
    const effectiveOut = turnOutput > 0 ? turnOutput : last.outputTokens;
    const tps =
      effectiveGenMs > 100 && effectiveOut > 0
        ? Math.round((effectiveOut / (effectiveGenMs / 1000)) * 10) / 10
        : 0;

    const contextLimit = activeConfig.contextLimit || 256000;
    const contextUsed = last.inputTokens + last.cacheReadTokens;
    const contextPct = Math.min(100, Math.round((contextUsed / contextLimit) * 1000) / 10);
    const cacheHitRate =
      totalInput + totalCacheRead > 0
        ? Math.round((totalCacheRead / (totalInput + totalCacheRead)) * 1000) / 10
        : 0;

    const metrics = {
      cascadeId,
      hasData: true,
      modelEnum: last.modelEnum,
      modelName: MODEL_ENUM_MAP[last.modelEnum] || `Model #${last.modelEnum}`,
      contextUsed,
      contextLimit,
      contextPct,
      lastInput: last.inputTokens,
      lastCacheRead: last.cacheReadTokens,
      lastOutput: turnOutput || last.outputTokens,
      lastThinking: turnThinking || last.thinkingTokens,
      ttftSec: Math.round((firstTurnTtftMs / 1000) * 10) / 10,
      thinkingSec: Math.round((firstTurnTtftMs / 1000) * 10) / 10,
      genSec: Math.round((effectiveGenMs / 1000) * 10) / 10,
      tps,
      totalInput,
      totalOutput,
      totalThinking,
      totalCacheRead,
      cacheHitRate,
      stepCount: stepList.length,
      turnSteps: turnRecords.length,
      toolCalls
    };

    if (pbCache.size >= PB_CACHE_MAX_SIZE) {
      const oldestKey = pbCache.keys().next().value;
      pbCache.delete(oldestKey);
    }
    pbCache.set(pbPath, { mtimeMs: stat.mtimeMs, size: stat.size, metrics });
    return metrics;
  } catch {
    if (cached && cached.metrics) {
      return cached.metrics;
    }
    return { cascadeId, hasData: false };
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

function getLatestCascadeId(conversationsDir) {
  try {
    const files = fs
      .readdirSync(conversationsDir)
      .filter((f) => f.endsWith('.pb'))
      .map((f) => {
        const full = path.join(conversationsDir, f);
        return { id: f.slice(0, -3), mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return files[0]?.id || '';
  } catch {
    return '';
  }
}

// ============================================================================
// 5. CDP 目标发现、WebSocket 会话挂载与热更新推送
// ============================================================================
const attachedTargets = new Map();

function readPort(portFile) {
  try {
    if (!fs.existsSync(portFile)) return null;
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
      { host: '127.0.0.1', port, path: '/json/list', timeout: 1500 },
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
        if (!DatabaseSync || !activeConfig.modules.metrics || !activeConfig.enabled) return;
        if (!activeCascadeId) {
          const evalRes = await send('Runtime.evaluate', {
            expression: `(function(){
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
          } else {
            activeCascadeId = getLatestCascadeId(endpoint.conversationsDir);
          }
        }
        if (!activeCascadeId) return;

        const metrics = parseConversationMetrics(activeCascadeId, endpoint.conversationsDir);
        if (!metrics) return;
        const hash = `${metrics.cascadeId}:${metrics.stepCount}:${metrics.totalOutput}:${metrics.contextUsed}:${metrics.tps}`;
        if (!force && hash === lastPushedHash) return;
        lastPushedHash = hash;

        await send('Runtime.evaluate', {
          expression: `window.__ag_update_live_metrics && window.__ag_update_live_metrics(${JSON.stringify(metrics)})`,
          returnByValue: false
        });
      };

      const checkAndInject = async () => {
        try {
          const checkRes = await send('Runtime.evaluate', {
            expression:
              'window.__ag_patch_version === ' +
              JSON.stringify(cachedPatchVersion) +
              ' && (' +
              JSON.stringify(!activeConfig.enabled) +
              ' || !!document.getElementById("ag-custom-fonts"))',
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

      ws.addEventListener('open', async () => {
        console.log(`[Daemon] Attached target: ${target.id} (${target.title || 'Untitled'}) [${endpoint.channel}]`);
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Runtime.addBinding', { name: '__ag_on_session_change' });
        await send('Page.addScriptToEvaluateOnNewDocument', { source: cachedInjectScript });
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
          if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__ag_on_session_change') {
            const nextId = String(msg.params.payload || '').trim();
            if (/^[0-9a-f-]{36}$/i.test(nextId) && nextId !== activeCascadeId) {
              activeCascadeId = nextId;
              lastPushedHash = '';
              syncMetricsForSession(true);
            }
            return;
          }
          if (!initialAttachDone) return;
          if (
            msg.method === 'Page.frameNavigated' ||
            msg.method === 'Page.loadEventFired' ||
            msg.method === 'Page.domContentEventFired'
          ) {
            if (!msg.params?.frame || !msg.params.frame.parentId) {
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
async function sync() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const bundleChanged = rebuildBundleIfNeeded();

    const activeTargetIds = new Set();
    const attachPromises = [];

    const probedPorts = new Set();
    for (const endpoint of activeConfig.endpoints) {
      let port = readPort(endpoint.portFile);
      let targets = [];
      if (port && !probedPorts.has(port)) {
        probedPorts.add(port);
        targets = await fetchTargets(port);
      }
      if (targets.length === 0 && endpoint.fallbackPort && !probedPorts.has(endpoint.fallbackPort)) {
        probedPorts.add(endpoint.fallbackPort);
        targets = await fetchTargets(endpoint.fallbackPort);
      }
      if (targets.length === 0) continue;

      const pages = targets.filter(
        (t) =>
          t.type === 'page' &&
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
          if (bundleChanged && entry.send) {
            await entry.send('Page.addScriptToEvaluateOnNewDocument', { source: cachedInjectScript });
          }
          if (entry.checkAndInject) await entry.checkAndInject();
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
