#!/usr/bin/env node
/**
 * chuanban-antigravity-theme-patch · Core CDP Daemon (core/daemon.mjs)
 *
 * 特性：
 * 1. 动态 Node 版本分级：
 *    - Node >= 22.0：启用主题配色 + 三层字体 + 450条全量汉化 + 路由/缩放自愈；
 *    - Node >= 22.13（支持 node:sqlite）：动态加载 DatabaseSync，自动解锁模型同行实时指标胶囊。
 * 2. 只读内核 (core/) 与用户改装层 (user/) 分离，支持 user/ 文件修改后 2.5s 自动热重载注入。
 * 3. 统一支持 stable / insiders 双通道（--channel stable|insiders）与跨平台路径探测（macOS / Windows / Linux）。
 * 4. 单实例 PID 锁保护，防止多进程并发重复注入。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CORE_DIR = __dirname;
const USER_DIR = path.join(ROOT_DIR, 'user');

// ============================================================================
// 0. 运行时环境预检与动态 SQLite 分级加载
// ============================================================================
if (typeof globalThis.WebSocket !== 'function') {
  console.error(
    `[Antigravity Daemon] Fatal: globalThis.WebSocket is unavailable in Node ${process.version}. Please upgrade to Node.js >= 22.0.0.`
  );
  process.exit(1);
}

let DatabaseSync = null;
try {
  const sqliteMod = await import('node:sqlite');
  DatabaseSync = sqliteMod.DatabaseSync || null;
} catch {
  console.warn(
    `[Antigravity Daemon] Notice: node:sqlite is unavailable in Node ${process.version} (requires Node >= 22.13). Live metrics pill disabled; Theme + Fonts + i18n remain 100% active.`
  );
}

// ============================================================================
// 1. CLI 参数与跨平台路径解析
// ============================================================================
const args = process.argv.slice(2);
function getArg(flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}
const CLI_CHANNEL = getArg('--channel', null);
const SAFE_MODE = args.includes('--safe-mode') || args.includes('--no-user');
const RUN_ONCE = args.includes('--once');

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

function resolvePlatformPaths(channel = 'stable', userCfg = {}) {
  const home = os.homedir();
  const isInsiders = channel === 'insiders';
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

  return {
    portFile: getArg('--port-file', userCfg.portFile || defaultPortFile),
    conversationsDir: getArg('--conversations-dir', userCfg.conversationsDir || defaultConvDir)
  };
}

// ============================================================================
// 2. 动态构建注入载荷（支持 core/ + user/ 实时合并与热更新签名）
// ============================================================================
const BASE_VERSION = '20261104-v5.0.0';
let cachedBundleSig = '';
let cachedInjectScript = '';
let cachedPatchVersion = '';
let activeConfig = {
  channel: 'stable',
  preset: 'high-contrast',
  contextLimit: 256000,
  modules: { i18n: true, metrics: true, customCss: true, customJs: true },
  allowedOrigins: ['http://127.0.0.1', 'https://127.0.0.1', 'http://localhost', 'https://localhost', 'vscode-file://'],
  portFile: '',
  conversationsDir: ''
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
  const channel = CLI_CHANNEL || userCfg.channel || 'stable';
  const preset = userCfg.preset || 'high-contrast';
  const contextLimit = Number(userCfg.contextLimit) > 0 ? Number(userCfg.contextLimit) : 256000;
  const modules = Object.assign(
    { i18n: true, metrics: true, customCss: true, customJs: true },
    userCfg.modules || {}
  );
  if (!DatabaseSync) {
    modules.metrics = false;
  }

  const paths = resolvePlatformPaths(channel, userCfg);
  activeConfig = {
    channel,
    preset,
    contextLimit,
    modules,
    selectors: userCfg.selectors || {},
    allowedOrigins: Array.isArray(userCfg.allowedOrigins)
      ? userCfg.allowedOrigins
      : ['http://127.0.0.1', 'https://127.0.0.1', 'http://localhost', 'https://localhost', 'vscode-file://'],
    portFile: paths.portFile,
    conversationsDir: paths.conversationsDir
  };

  const baseCss = readTextSafe(path.join(CORE_DIR, 'theme.css'), '');
  const customCss = !SAFE_MODE && modules.customCss ? readTextSafe(path.join(USER_DIR, 'custom.css'), '') : '';
  const combinedCss = customCss.trim() ? `${baseCss}\n/* === user/custom.css === */\n${customCss}` : baseCss;

  const baseDict = readJsonSafe(path.join(CORE_DIR, 'i18n.json'), {});
  const overrideDict = !SAFE_MODE ? readJsonSafe(path.join(USER_DIR, 'i18n.override.json'), {}) : {};
  const mergedDict = Object.assign({}, baseDict, overrideDict);

  const customJs = !SAFE_MODE && modules.customJs ? readTextSafe(path.join(USER_DIR, 'custom.js'), '') : '';
  const runtimeTemplate = readTextSafe(path.join(CORE_DIR, 'runtime.js'), '');

  const hash = crypto
    .createHash('sha256')
    .update(combinedCss)
    .update(JSON.stringify(mergedDict))
    .update(customJs)
    .update(JSON.stringify({ preset, modules, selectors: activeConfig.selectors }))
    .digest('hex')
    .slice(0, 8);

  cachedPatchVersion = `${BASE_VERSION}-${channel}-${hash}`;

  const bootPayload = {
    version: cachedPatchVersion,
    preset,
    cssText: combinedCss,
    i18nDict: mergedDict,
    modules,
    selectors: activeConfig.selectors,
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
const PID_FILE = path.join(os.tmpdir(), `ag-theme-daemon-${activeConfig.channel}.pid`);
if (!RUN_ONCE) {
  try {
    if (fs.existsSync(PID_FILE)) {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (oldPid && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0);
          // 若旧进程存活，温和终止旧实例以完成平滑接管
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
// 4. SQLite + Protobuf 实时会话指标解析器 (动态分级 + LRU 缓存)
// ============================================================================
const metricsCache = new Map();
const MAX_METRICS_CACHE_SIZE = 30;

function setMetricsCache(cascadeId, entry) {
  if (metricsCache.has(cascadeId)) metricsCache.delete(cascadeId);
  metricsCache.set(cascadeId, entry);
  if (metricsCache.size > MAX_METRICS_CACHE_SIZE) {
    const oldestKey = metricsCache.keys().next().value;
    if (oldestKey) metricsCache.delete(oldestKey);
  }
}

function parseProto(buf) {
  let i = 0;
  const out = new Map();
  while (i < buf.length) {
    let tag = 0,
      shift = 0;
    while (i < buf.length) {
      const b = buf[i++];
      tag |= (b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    const fn = tag >>> 3,
      wt = tag & 7;
    if (wt === 0) {
      let val = 0,
        s = 0;
      while (i < buf.length) {
        const b = buf[i++];
        val += (b & 0x7f) * Math.pow(2, s);
        if (!(b & 0x80)) break;
        s += 7;
      }
      out.set(fn, val);
    } else if (wt === 2) {
      let len = 0,
        s = 0;
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
    const dbPath = path.join(activeConfig.conversationsDir, `${cascadeId}.db`);
    if (!fs.existsSync(dbPath)) return null;
    const st = fs.statSync(dbPath);
    let walSig = '0:0';
    const walPath = `${dbPath}-wal`;
    if (fs.existsSync(walPath)) {
      const wst = fs.statSync(walPath);
      walSig = `${wst.mtimeMs}:${wst.size}`;
    }
    return `${st.mtimeMs}:${st.size}|${walSig}|lim:${activeConfig.contextLimit}`;
  } catch {
    return null;
  }
}

function readConversationMetrics(cascadeId) {
  if (!DatabaseSync || !activeConfig.modules.metrics) return null;
  if (!cascadeId || !/^[0-9a-f-]{36}$/i.test(cascadeId)) return null;
  const sig = getDbSignature(cascadeId);
  if (!sig) return { cascadeId, hasData: false };

  const cached = metricsCache.get(cascadeId);
  if (cached && cached.sig === sig) {
    return cached.payload;
  }

  const dbPath = path.join(activeConfig.conversationsDir, `${cascadeId}.db`);
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx ASC').all();
    if (!rows || rows.length === 0) {
      db.close();
      db = null;
      const emptyPayload = { cascadeId, hasData: false, sig };
      setMetricsCache(cascadeId, { sig, payload: emptyPayload });
      return emptyPayload;
    }
    const userSteps = db.prepare('SELECT idx FROM steps WHERE step_type = 14 ORDER BY idx ASC').all();
    const plannerSteps = db.prepare('SELECT idx FROM steps WHERE step_type = 15 ORDER BY idx ASC').all();
    db.close();
    db = null;

    const lastUserStepIdx = userSteps.length > 0 ? userSteps[userSteps.length - 1].idx : -1;
    let totalIn = 0,
      totalCache = 0,
      totalOut = 0,
      totalThink = 0,
      totalResp = 0;

    const parsed = rows.map((r) => {
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

      totalIn += inTok;
      totalCache += cacheRead;
      totalOut += outTok;
      totalThink += thinkTok;
      totalResp += respTok;

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

    const valid = parsed.filter((p) => p.ctx > 0 || p.outTok > 0);
    if (valid.length === 0) {
      const emptyPayload = { cascadeId, hasData: false, sig };
      setMetricsCache(cascadeId, { sig, payload: emptyPayload });
      return emptyPayload;
    }

    const rawTurnSteps = plannerSteps.filter((s) => s.idx > lastUserStepIdx).length;
    const turnSlice = rawTurnSteps > 0 ? valid.slice(-rawTurnSteps) : [];
    const turnSteps = turnSlice.length;
    let turnOut = 0,
      turnThink = 0,
      turnResp = 0,
      turnDur = 0;
    for (let i = 0; i < turnSlice.length; i++) {
      turnOut += turnSlice[i].outTok;
      turnThink += turnSlice[i].thinkTok;
      turnResp += turnSlice[i].respTok;
      turnDur += turnSlice[i].totDur;
    }

    const ctxLimit = activeConfig.contextLimit || 256000;
    const limitLabel = fmtTok(ctxLimit);
    const last = valid[valid.length - 1];
    const streamTps = last.stream >= 0.25 ? last.outTok / last.stream : 0;
    const e2eTps = last.totDur > 0 ? last.outTok / last.totDur : 0;
    const displayTps = streamTps > 0 && streamTps <= 600 ? streamTps : e2eTps;
    const ctxPct = Math.round((last.ctx / ctxLimit) * 100);
    const ctxClass = ctxPct >= 90 ? 'ag-ctx-crit' : ctxPct >= 75 ? 'ag-ctx-warn' : 'ag-ctx-ok';
    const lastCacheRate = last.ctx > 0 ? ((last.cacheRead / last.ctx) * 100).toFixed(1) : '0.0';
    const sessionCacheRate =
      totalIn + totalCache > 0 ? ((totalCache / (totalIn + totalCache)) * 100).toFixed(1) : '0.0';
    const remainCtx = Math.max(0, ctxLimit - last.ctx);

    const inlineHtml = [
      `<span>${Math.round(displayTps)} tok/s</span>`,
      `<span class="ag-sep">·</span>`,
      `<span>TTFT ${last.ttft.toFixed(1)}s</span>`,
      `<span class="ag-sep">·</span>`,
      `<span>Ctx ${fmtTok(last.ctx)}/${limitLabel} <span class="${ctxClass}">(${ctxPct}%)</span></span>`,
      `<span class="ag-sep">·</span>`,
      `<span>Out ${fmtTok(last.outTok)}</span>`
    ].join('');

    const turnRowHtml =
      turnSteps > 1
        ? `<div class="ag-tt-row"><span class="ag-tt-lbl">本轮合计 (${turnSteps}步)</span><span class="ag-tt-val">输出 ${fmtNum(turnOut)} (思考 ${fmtNum(turnThink)} + 响应 ${fmtNum(turnResp)}) | 耗时 ${turnDur.toFixed(1)}s</span></div>`
        : '';

    const tooltipHtml = [
      `<div class="ag-tt-hdr">本轮最新调用 (Gen #${last.idx + 1})</div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">生成速度</span><span class="ag-tt-val">${streamTps > 0 && streamTps <= 600 ? `流式 ${streamTps.toFixed(1)} tok/s | ` : ''}端到端 ${e2eTps.toFixed(1)} tok/s</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">响应耗时</span><span class="ag-tt-val">TTFT ${last.ttft.toFixed(2)}s | 流式 ${last.stream.toFixed(2)}s | 总计 ${last.totDur.toFixed(2)}s</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">当前上下文</span><span class="ag-tt-val">${fmtNum(last.ctx)} (新增 ${fmtNum(last.inTok)} + 缓存 ${fmtNum(last.cacheRead)}, ${lastCacheRate}%)</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">本步输出量</span><span class="ag-tt-val">${fmtNum(last.outTok)} (思考链 ${fmtNum(last.thinkTok)} + 正文/工具 ${fmtNum(last.respTok)})</span></div>`,
      turnRowHtml,
      `<div class="ag-tt-hdr ag-tt-sec">当前会话累计 (${userSteps.length} 轮提问 / ${valid.length} 次有效调用)</div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">压缩水位线</span><span class="ag-tt-val">${fmtTok(last.ctx)} / ${limitLabel} (${ctxPct}%) · 距压缩余 ${fmtTok(remainCtx)}</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输入量</span><span class="ag-tt-val">新增 ${fmtTok(totalIn)} + 缓存读取 ${fmtTok(totalCache)} (命中率 ${sessionCacheRate}%)</span></div>`,
      `<div class="ag-tt-row"><span class="ag-tt-lbl">累计输出量</span><span class="ag-tt-val">总计 ${fmtTok(totalOut)} (思考链 ${fmtTok(totalThink)} + 正文/工具 ${fmtNum(totalResp)})</span></div>`
    ].join('');

    const payload = {
      cascadeId,
      hasData: true,
      sig,
      inlineHtml,
      tooltipHtml
    };
    setMetricsCache(cascadeId, { sig, payload });
    return payload;
  } catch {
    if (db) {
      try {
        db.close();
      } catch {}
    }
    return null;
  }
}

// ============================================================================
// 5. CDP 守护进程连接池与自愈调度
// ============================================================================
const activeSockets = new Map();
let rpcCounter = 1;
let isSyncingTargets = false;

function isValidAppTarget(target) {
  if (!target || target.type !== 'page' || !target.webSocketDebuggerUrl) return false;
  const url = target.url || '';
  return activeConfig.allowedOrigins.some((prefix) => url.startsWith(prefix));
}

function getDevToolsPort() {
  try {
    if (!fs.existsSync(activeConfig.portFile)) return null;
    const content = fs.readFileSync(activeConfig.portFile, 'utf8');
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
  if (!DatabaseSync || !activeConfig.modules.metrics) return;
  if (!session || session.ws?.readyState !== 1 || !cascadeId) return;
  try {
    const sig = getDbSignature(cascadeId) || 'empty';
    const sessionKey = `${cascadeId}@${sig}`;
    if (!force && session.lastPushedSig === sessionKey) return;
    const payload = readConversationMetrics(cascadeId);
    if (!payload) return;
    await sendCDP(session, 'Runtime.evaluate', {
      expression: `window.__ag_render_metrics && window.__ag_render_metrics(${JSON.stringify(payload)})`,
      returnByValue: false
    });
    session.lastPushedSig = sessionKey;
  } catch {}
}

async function syncMetricsForSession(session) {
  if (!DatabaseSync || !activeConfig.modules.metrics) return;
  if (!session || session.isInjecting || session.isSyncingMetrics || session.ws?.readyState !== 1) return;
  session.isSyncingMetrics = true;
  try {
    const res = await sendCDP(session, 'Runtime.evaluate', {
      expression: 'window.__ag_watched_cascade_id || ""',
      returnByValue: true
    });
    const cid = res?.result?.value;
    if (cid) {
      await pushMetricsToSession(session, cid, false);
    }
  } catch {
  } finally {
    session.isSyncingMetrics = false;
  }
}

async function inject(session, targetId) {
  if (session.isInjecting) return;
  session.isInjecting = true;
  try {
    if (session.newDocumentScriptId && session.newDocumentVersion !== cachedPatchVersion) {
      try {
        await sendCDP(session, 'Page.removeScriptToEvaluateOnNewDocument', {
          identifier: session.newDocumentScriptId
        });
      } catch {}
      session.newDocumentScriptId = null;
    }
    if (!session.newDocumentScriptId) {
      const registered = await sendCDP(session, 'Page.addScriptToEvaluateOnNewDocument', {
        source: cachedInjectScript
      });
      session.newDocumentScriptId = registered.identifier;
      session.newDocumentVersion = cachedPatchVersion;
    }
    const res = await sendCDP(session, 'Runtime.evaluate', {
      expression: cachedInjectScript,
      returnByValue: true
    });
    if (res?.exceptionDetails) {
      console.error(`[Daemon] Script exception on ${targetId}:`, res.exceptionDetails);
    }
    session.lastPushedSig = '';
    console.log(`[Daemon] Injected (${cachedPatchVersion}) into target ${targetId}`);
  } catch (err) {
    console.error(`[Daemon] Injection failed on ${targetId}:`, err.message || err);
  } finally {
    session.isInjecting = false;
  }
  await syncMetricsForSession(session);
}

function scheduleInject(session, targetId) {
  if (session.injectTimer) clearTimeout(session.injectTimer);
  session.injectTimer = setTimeout(() => {
    session.injectTimer = null;
    inject(session, targetId);
  }, 120);
}

async function checkAndHeal(session, targetId, forceReinject = false) {
  if (session.isChecking || session.isInjecting) return;
  session.isChecking = true;
  try {
    if (forceReinject) {
      await inject(session, targetId);
      return;
    }
    const res = await sendCDP(session, 'Runtime.evaluate', {
      expression: `Boolean(document.getElementById("ag-custom-fonts") && window.__ag_patch_version === "${cachedPatchVersion}")`,
      returnByValue: true
    });
    const isHealthy = res?.result?.value === true;
    if (!isHealthy) {
      console.log(`[Self-Healing] Style or version mismatch in target ${targetId}, re-injecting (${cachedPatchVersion})...`);
      await inject(session, targetId);
    }
  } catch {
  } finally {
    session.isChecking = false;
  }
}

async function attachTarget(target) {
  if (!isValidAppTarget(target)) return;
  if (activeSockets.has(target.id)) return;

  try {
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    const session = {
      ws,
      pendingRequests: new Map(),
      isInjecting: false,
      isChecking: false,
      isSyncingMetrics: false,
      lastPushedSig: '',
      injectTimer: null,
      newDocumentScriptId: null,
      newDocumentVersion: ''
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
        console.error(`[Daemon] Initialization failed on ${target.id}, closing for clean retry:`, err.message || err);
        if (session.injectTimer) clearTimeout(session.injectTimer);
        try {
          ws.close();
        } catch {}
        activeSockets.delete(target.id);
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

        if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__agRequestMetrics') {
          const cid = msg.params.payload;
          if (cid) {
            pushMetricsToSession(session, cid, true);
          }
          return;
        }

        if (
          msg.method === 'Page.domContentEventFired' ||
          (msg.method === 'Page.frameNavigated' && !msg.params?.frame?.parentId)
        ) {
          scheduleInject(session, target.id);
        }
      } catch {}
    };

    ws.onclose = () => {
      if (session.injectTimer) clearTimeout(session.injectTimer);
      for (const req of session.pendingRequests.values()) {
        clearTimeout(req.timer);
        req.reject(new Error('WS closed'));
      }
      activeSockets.delete(target.id);
    };

    ws.onerror = () => {
      if (session.injectTimer) clearTimeout(session.injectTimer);
      try {
        ws.close();
      } catch {}
      activeSockets.delete(target.id);
    };
  } catch {
    activeSockets.delete(target.id);
  }
}

async function sync() {
  if (isSyncingTargets) return;
  isSyncingTargets = true;
  try {
    const bundleChanged = rebuildBundleIfNeeded();
    const port = getDevToolsPort();
    if (!port) {
      if (activeSockets.size > 0) {
        for (const session of activeSockets.values()) {
          if (session.injectTimer) clearTimeout(session.injectTimer);
          try {
            session.ws.close();
          } catch {}
        }
        activeSockets.clear();
      }
      return;
    }

    const allTargets = await queryTargets(port);
    const validTargets = allTargets.filter(isValidAppTarget);
    const currentIds = new Set(validTargets.map((t) => t.id));

    for (const [id, session] of activeSockets.entries()) {
      if (!currentIds.has(id)) {
        if (session.injectTimer) clearTimeout(session.injectTimer);
        try {
          session.ws.close();
        } catch {}
        activeSockets.delete(id);
      }
    }

    for (const target of validTargets) {
      if (!activeSockets.has(target.id)) {
        await attachTarget(target);
      } else {
        const session = activeSockets.get(target.id);
        await checkAndHeal(session, target.id, bundleChanged);
      }
    }
  } finally {
    isSyncingTargets = false;
  }
}

async function syncAllMetrics() {
  if (!DatabaseSync || !activeConfig.modules.metrics) return;
  for (const session of activeSockets.values()) {
    await syncMetricsForSession(session);
  }
}

console.log(
  `[Antigravity Daemon] Started (${cachedPatchVersion}) | channel=${activeConfig.channel} | sqlite=${Boolean(DatabaseSync)} | safeMode=${SAFE_MODE}`
);

if (RUN_ONCE) {
  await sync();
  setTimeout(() => process.exit(0), 600);
} else {
  setInterval(sync, 2500);
  setInterval(syncAllMetrics, 1200);
  sync();
}
