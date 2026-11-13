#!/usr/bin/env node
/**
 * chuanban-antigravity-theme-patch · 一键安装、自检、安全模式验证、打包与回滚 CLI (install.mjs)
 *
 * 支持子命令：
 *   node install.mjs install [--channel auto|stable|insiders] [--preset high-contrast] [--target-dir <dir>]
 *   node install.mjs install-fonts --from <font-folder-path>
 *   node install.mjs doctor  [--channel auto|stable|insiders] [--target-dir <dir>]
 *   node install.mjs verify  [--safe-mode] [--channel auto|stable|insiders] [--target-dir <dir>]
 *   node install.mjs rollback [--target-dir <dir>]
 *   node install.mjs uninstall [--target-dir <dir>]
 *   node install.mjs build-manifest
 *   node install.mjs pack
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { execSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 屏蔽 Node 22.x 动态探测 node:sqlite 时的 ExperimentalWarning 噪声，保持 doctor/verify JSON 输出纯净
const _origEmitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  const type = typeof rest[0] === 'string' ? rest[0] : rest[0] && rest[0].type;
  if (type === 'ExperimentalWarning' || (warning && warning.name === 'ExperimentalWarning')) return;
  return _origEmitWarning.call(this, warning, ...rest);
};

const GOOGLE_DRIVE_URL = 'https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC';
const NOTION_GUIDE_URL = 'https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554';
const GITHUB_REPO_URL = 'https://github.com/Anarcadia/chuanban-antigravity-theme-patch';

const ALLOWED_ORIGINS = [
  'http://127.0.0.1',
  'https://127.0.0.1',
  'http://localhost',
  'https://localhost',
  'vscode-file://'
];

const args = process.argv.slice(2);
const subcommand = args.find((a) => !a.startsWith('-')) || 'help';
const hasFlag = (f) => args.some((a) => a === f || a.startsWith(f + '='));
function getArg(flag, fallback = null) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) return args[i + 1];
    if (args[i].startsWith(flag + '=')) return args[i].slice(flag.length + 1);
  }
  return fallback;
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function resolveDefaultTargetDir() {
  const installed = path.join(os.homedir(), '.gemini', 'antigravity', 'theme-patch');
  if (fs.existsSync(path.join(installed, 'core', 'daemon.mjs'))) {
    return installed;
  }
  return __dirname;
}

// ============================================================================
// 1. 生成与校验 core/manifest.json 及 dist/ 发行包
// ============================================================================
function buildManifest(baseDir = __dirname) {
  const coreDir = path.join(baseDir, 'core');
  const files = ['daemon.mjs', 'runtime.js', 'theme.css', 'i18n.json'];
  const entries = {};
  for (const name of files) {
    const p = path.join(coreDir, name);
    if (!fs.existsSync(p)) {
      throw new Error(`Missing core file: ${p}`);
    }
    const stat = fs.statSync(p);
    entries[name] = {
      sha256: sha256File(p),
      bytes: stat.size
    };
  }
  const manifest = {
    name: 'chuanban-antigravity-theme-patch',
    version: '5.1.6',
    minNodeVersion: '22.0.0',
    fullMetricsNodeVersion: '22.13.0',
    distribution: {
      notionGuide: NOTION_GUIDE_URL,
      googleDriveFullBundle: GOOGLE_DRIVE_URL,
      githubRepo: GITHUB_REPO_URL
    },
    files: entries
  };
  const manifestPath = path.join(coreDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

function buildDistZip(baseDir = __dirname) {
  const manifest = buildManifest(baseDir);
  const distDir = path.join(baseDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const zipName = `${manifest.name}-v${manifest.version}.zip`;
  const zipPath = path.join(distDir, zipName);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const includeItems = [
    'SKILL.md',
    'README.md',
    'CHANGELOG.md',
    'install.mjs',
    '.gitattributes',
    '.gitignore',
    'core',
    'user',
    'assets'
  ].filter((item) => fs.existsSync(path.join(baseDir, item)));

  if (process.platform === 'win32') {
    const psArgs = [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path ${includeItems.map((i) => `'${i}'`).join(',')} -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`
    ];
    const r = spawnSync('powershell', psArgs, { cwd: baseDir, stdio: 'inherit', windowsHide: true });
    if (r.status !== 0) throw new Error('Compress-Archive failed');
  } else {
    const r = spawnSync('zip', ['-r', '-q', zipPath, ...includeItems, '-x', '*.DS_Store'], {
      cwd: baseDir,
      stdio: 'inherit'
    });
    if (r.status !== 0) throw new Error('zip command failed');
    // 逐文件校验 zip 内 core/* 的 SHA-256 与字节数与 manifest 完全一致，杜绝脏包发布
    for (const [name, meta] of Object.entries(manifest.files)) {
      const uz = spawnSync('unzip', ['-p', zipPath, `core/${name}`], { maxBuffer: 20 * 1024 * 1024 });
      if (uz.status !== 0) {
        fs.unlinkSync(zipPath);
        throw new Error(`Verification failed: missing core/${name} in ${zipName}`);
      }
      const actualSha = crypto.createHash('sha256').update(uz.stdout).digest('hex');
      if (actualSha !== meta.sha256 || uz.stdout.length !== meta.bytes) {
        fs.unlinkSync(zipPath);
        throw new Error(
          `Verification failed for core/${name} in ${zipName}: expected ${meta.sha256} (${meta.bytes}B), got ${actualSha} (${uz.stdout.length}B)`
        );
      }
    }
  }
  return { zipPath, version: manifest.version, filesVerified: Object.keys(manifest.files).length };
}

function verifyCoreIntegrity(baseDir = __dirname) {
  const coreDir = path.join(baseDir, 'core');
  const manifestPath = path.join(coreDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, reason: 'missing manifest.json', modified: [] };
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const modified = [];
  for (const [name, meta] of Object.entries(manifest.files || {})) {
    const p = path.join(coreDir, name);
    if (!fs.existsSync(p)) {
      modified.push({ file: name, status: 'missing' });
      continue;
    }
    let actualHash = sha256File(p);
    if (actualHash !== meta.sha256) {
      // 自动自愈 Windows Git core.autocrlf=true 导致的 CRLF 换行符哈希差异
      try {
        const rawText = fs.readFileSync(p, 'utf8');
        if (rawText.includes('\r\n')) {
          const lfText = rawText.replace(/\r\n/g, '\n');
          const lfHash = crypto.createHash('sha256').update(Buffer.from(lfText, 'utf8')).digest('hex');
          if (lfHash === meta.sha256) {
            fs.writeFileSync(p, lfText, 'utf8');
            actualHash = lfHash;
          }
        }
      } catch {}
    }
    if (actualHash !== meta.sha256) {
      modified.push({ file: name, status: 'modified', expected: meta.sha256, actual: actualHash });
    }
  }
  return { ok: modified.length === 0, manifest, modified };
}

// ============================================================================
// 2. 环境、字体、argv.json 与实时 CDP 窗口检查
// ============================================================================
async function detectEnvironment(channel = 'auto') {
  const nodeVer = process.versions.node;
  const [major, minor] = nodeVer.split('.').map((n) => parseInt(n, 10));
  const nodeBasicOk = major >= 22;

  let sqliteAvailable = false;
  try {
    const mod = await import('node:sqlite').catch(() => null);
    sqliteAvailable = !!(mod && typeof mod.DatabaseSync === 'function');
  } catch {
    sqliteAvailable = false;
  }

  const home = os.homedir();
  const fontDirs =
    process.platform === 'darwin'
      ? [path.join(home, 'Library/Fonts'), '/Library/Fonts']
      : process.platform === 'win32'
      ? [
          path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData/Local'), 'Microsoft/Windows/Fonts'),
          'C:\\Windows\\Fonts'
        ]
      : [path.join(home, '.local/share/fonts'), '/usr/local/share/fonts', '/usr/share/fonts'];

  let allFontFiles = [];
  for (const d of fontDirs) {
    try {
      if (fs.existsSync(d)) {
        allFontFiles.push(...fs.readdirSync(d));
      }
    } catch {}
  }

  const hasAnthropicFont = allFontFiles.some((f) => /Anthropic/i.test(f));
  const hasSarasaFont = allFontFiles.some((f) => /Sarasa|更纱/i.test(f));

  const checkSingleChannel = (ch) => {
    const isInsiders = ch === 'insiders';
    const appDirName = isInsiders ? 'Antigravity - Insiders' : 'Antigravity';
    const dotDir = path.join(home, isInsiders ? '.antigravity-insiders' : '.antigravity');
    let portFile;
    let appPath;
    if (process.platform === 'darwin') {
      portFile = path.join(home, 'Library/Application Support', appDirName, 'DevToolsActivePort');
      appPath = isInsiders ? '/Applications/Antigravity - Insiders.app' : '/Applications/Antigravity.app';
    } else if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(home, 'AppData/Roaming');
      portFile = path.join(appData, appDirName, 'DevToolsActivePort');
      appPath = '';
    } else {
      const xdg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
      portFile = path.join(xdg, appDirName, 'DevToolsActivePort');
      appPath = '';
    }
    const portFileExists = fs.existsSync(portFile);
    const appExists = appPath
      ? fs.existsSync(appPath)
      : portFileExists || fs.existsSync(path.dirname(portFile)) || fs.existsSync(dotDir);
    return {
      channel: ch,
      appExists,
      portFile,
      portFileExists
    };
  };

  const primaryChannel = channel === 'insiders' ? 'insiders' : 'stable';
  const chInfo = checkSingleChannel(primaryChannel);
  const insidersInfo = checkSingleChannel('insiders');

  return {
    nodeVer,
    major,
    minor,
    nodeBasicOk,
    sqliteAvailable,
    tier: sqliteAvailable
      ? 'FULL (>= 22.13, Theme + Fonts + i18n + SQLite Live Metrics)'
      : nodeBasicOk
      ? 'STANDARD (22.0~22.12, Theme + Fonts + i18n; SQLite Metrics gracefully disabled)'
      : 'UNSUPPORTED (< 22.0, requires Node 22+)',
    hasAnthropicFont,
    hasSarasaFont,
    channel,
    appExists: chInfo.appExists || insidersInfo.appExists,
    portFile: chInfo.portFileExists ? chInfo.portFile : insidersInfo.portFileExists ? insidersInfo.portFile : chInfo.portFile,
    portFileExists: chInfo.portFileExists || insidersInfo.portFileExists,
    channels: {
      stable: checkSingleChannel('stable'),
      insiders: insidersInfo
    }
  };
}

function inspectJsoncRootObject(raw) {
  let i = 0;
  const len = raw.length;
  let depth = 0;
  let openBraceIdx = -1;
  let closeBraceIdx = -1;
  let hasTopProps = false;
  let hasRemoteDebuggingPort = false;

  while (i < len) {
    const ch = raw[i];
    const next = i + 1 < len ? raw[i + 1] : '';

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && raw[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < len && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '"') {
      i++;
      let val = '';
      while (i < len) {
        if (raw[i] === '\\') {
          val += raw.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (raw[i] === '"') {
          i++;
          break;
        }
        val += raw[i++];
      }
      if (depth === 1 && openBraceIdx !== -1 && closeBraceIdx === -1) {
        hasTopProps = true;
        if (val === 'remote-debugging-port') {
          let k = i;
          while (k < len) {
            if (/\s/.test(raw[k])) {
              k++;
            } else if (raw[k] === '/' && raw[k + 1] === '/') {
              k += 2;
              while (k < len && raw[k] !== '\n') k++;
            } else if (raw[k] === '/' && raw[k + 1] === '*') {
              k += 2;
              while (k + 1 < len && !(raw[k] === '*' && raw[k + 1] === '/')) k++;
              k += 2;
            } else {
              break;
            }
          }
          if (raw[k] === ':') {
            hasRemoteDebuggingPort = true;
          }
        }
      }
      continue;
    }

    if (ch === '{') {
      if (depth === 0 && openBraceIdx === -1) {
        openBraceIdx = i;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && openBraceIdx !== -1 && closeBraceIdx === -1) {
        closeBraceIdx = i;
      }
    } else if (depth === 1 && openBraceIdx !== -1 && closeBraceIdx === -1 && !/\s/.test(ch)) {
      hasTopProps = true;
    }
    i++;
  }

  return { openBraceIdx, closeBraceIdx, hasTopProps, hasRemoteDebuggingPort };
}

function ensureArgvRemoteDebugging(channel = 'auto') {
  const home = os.homedir();
  const dirs =
    channel === 'insiders'
      ? ['.antigravity-insiders']
      : channel === 'stable'
      ? ['.antigravity']
      : ['.antigravity', '.antigravity-insiders'];

  const results = [];
  for (const d of dirs) {
    const defaultPort = d === '.antigravity-insiders' ? 9223 : 9222;
    const argvDir = path.join(home, d);
    const argvPath = path.join(argvDir, 'argv.json');
    if (!fs.existsSync(argvDir)) continue;
    try {
      if (!fs.existsSync(argvPath)) {
        fs.writeFileSync(argvPath, JSON.stringify({ 'remote-debugging-port': defaultPort }, null, 2) + '\n', 'utf8');
        results.push({ path: argvPath, port: defaultPort, action: 'created' });
        continue;
      }
      const raw = fs.readFileSync(argvPath, 'utf8');
      const parsedInfo = inspectJsoncRootObject(raw);
      if (parsedInfo.hasRemoteDebuggingPort) {
        results.push({ path: argvPath, action: 'already-present' });
        continue;
      }
      if (parsedInfo.openBraceIdx !== -1 && parsedInfo.closeBraceIdx > parsedInfo.openBraceIdx) {
        const afterOpen = raw.slice(parsedInfo.openBraceIdx + 1);
        const comma = parsedInfo.hasTopProps ? ',' : '';
        const trailingNl = afterOpen.startsWith('\n') || afterOpen.startsWith('\r') ? '' : '\n';
        const patched =
          raw.slice(0, parsedInfo.openBraceIdx + 1) +
          `\n\t"remote-debugging-port": ${defaultPort}${comma}${trailingNl}` +
          afterOpen;
        fs.writeFileSync(argvPath, patched, 'utf8');
        results.push({ path: argvPath, port: defaultPort, action: 'patched' });
      } else {
        results.push({ path: argvPath, action: 'skipped', error: 'root JSON object not found' });
      }
    } catch (e) {
      results.push({ path: argvPath, action: 'skipped', error: e.message });
    }
  }
  return results;
}

function isAllowedOrigin(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  return ALLOWED_ORIGINS.some((prefix) => urlStr.startsWith(prefix));
}

function fetchTargetsFromPort(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/list', timeout: 450 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

async function inspectLiveWindow(portFileOrEnv, fallbackPort = 9222) {
  const candidateFiles = [];
  const candidatePorts = [];

  if (portFileOrEnv && typeof portFileOrEnv === 'object' && portFileOrEnv.channels) {
    if (portFileOrEnv.portFile) candidateFiles.push(portFileOrEnv.portFile);
    if (portFileOrEnv.channels.stable?.portFile) candidateFiles.push(portFileOrEnv.channels.stable.portFile);
    if (portFileOrEnv.channels.insiders?.portFile) candidateFiles.push(portFileOrEnv.channels.insiders.portFile);
    if (portFileOrEnv.channels.stable?.appExists !== false) candidatePorts.push(9222);
    if (portFileOrEnv.channels.insiders?.appExists) candidatePorts.push(9223);
  } else if (typeof portFileOrEnv === 'string' && portFileOrEnv) {
    candidateFiles.push(portFileOrEnv);
    if (fallbackPort > 0) candidatePorts.push(fallbackPort);
  } else if (fallbackPort > 0) {
    candidatePorts.push(fallbackPort);
  }

  let port = null;
  let targets = [];
  const triedPorts = new Set();

  for (const pf of candidateFiles) {
    if (pf && fs.existsSync(pf)) {
      const raw = fs.readFileSync(pf, 'utf8').trim();
      const parsed = parseInt(raw.split(/\r?\n/)[0], 10);
      if (parsed > 0 && !triedPorts.has(parsed)) {
        triedPorts.add(parsed);
        const res = await fetchTargetsFromPort(parsed);
        if (res.length > 0) {
          port = parsed;
          targets = res;
          break;
        }
      }
    }
  }
  if (targets.length === 0) {
    for (const fb of candidatePorts) {
      if (fb > 0 && !triedPorts.has(fb)) {
        triedPorts.add(fb);
        const fbTargets = await fetchTargetsFromPort(fb);
        if (fbTargets.length > 0) {
          port = fb;
          targets = fbTargets;
          break;
        }
      }
    }
  }
  if (!port || targets.length === 0) {
    return { reachable: false, reason: 'No active CDP port responded (checked DevToolsActivePort & fallback port 9222)' };
  }

  const pages = targets.filter(
    (t) =>
      t.type === 'page' &&
      t.webSocketDebuggerUrl &&
      !String(t.url || '').startsWith('devtools://') &&
      isAllowedOrigin(t.url) &&
      !String(t.title || '').includes('Launchpad')
  );

  if (pages.length === 0) {
    return { reachable: true, port, pages: 0, reason: 'No active workbench page target' };
  }

  const page = pages[0];
  const state = await new Promise((resolve) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      resolve(null);
    }, 2000);
    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `({
              version: window.__ag_patch_version || null,
              bodyReady: window.__ag_body_ready === true,
              hasStyle: !!document.getElementById('ag-custom-fonts'),
              hasUserStyle: !!document.getElementById('antigravity-user-custom-style'),
              preset: document.documentElement.getAttribute('data-ag-preset'),
              themeMode: document.documentElement.getAttribute('data-ag-theme-mode'),
              pageType: document.documentElement.getAttribute('data-ag-page-type'),
              waxSeal: document.documentElement.getAttribute('data-ag-wax-seal'),
              dictCount: window.__ag_i18n_dict ? Object.keys(window.__ag_i18n_dict).length : 0,
              protoSafe: window.__ag_i18n_dict ? Object.getPrototypeOf(window.__ag_i18n_dict) === null : false,
              pillMounted: !!document.getElementById('ag-live-metrics-pill'),
              pillText: document.getElementById('ag-live-metrics-pill')?.textContent || null
            })`,
            returnByValue: true
          }
        })
      );
    });
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.id === 1) {
          clearTimeout(timer);
          ws.close();
          resolve(msg.result?.result?.value || null);
        }
      } catch {}
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });

  return {
    reachable: true,
    port,
    targetId: page.id,
    title: page.title,
    state
  };
}

// ============================================================================
// 3. 子命令实现：doctor / install / verify / rollback / uninstall
// ============================================================================
async function runDoctor() {
  const channel = getArg('--channel', 'auto');
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const env = await detectEnvironment(channel);
  const integrity = verifyCoreIntegrity(targetDir);
  const live = await inspectLiveWindow(env);

  const report = {
    ok: Boolean(env.nodeBasicOk && integrity.ok),
    node: {
      version: env.nodeVer,
      execPath: process.execPath,
      tier: env.tier
    },
    fonts: {
      anthropicInstalled: env.hasAnthropicFont,
      sarasaInstalled: env.hasSarasaFont,
      downloadUrl: !env.hasAnthropicFont || !env.hasSarasaFont ? GOOGLE_DRIVE_URL : null
    },
    antigravity: {
      channel: env.channel,
      appExists: env.appExists,
      portFile: env.portFile,
      portFileExists: env.portFileExists,
      channels: env.channels
    },
    coreIntegrity: {
      targetDir,
      clean: integrity.ok,
      modifiedFiles: integrity.modified
    },
    liveWindow: live
  };

  console.log(JSON.stringify(report, null, 2));
  if (!env.nodeBasicOk) {
    console.error('\n[ERROR] Node.js >= 22.0.0 is required. Current:', env.nodeVer);
    process.exit(1);
  }
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    const st = fs.statSync(s);
    if (st.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function isConfirmedDaemonPid(pid) {
  if (!pid || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (process.platform === 'win32') {
    try {
      const res = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 1500
      });
      const out = String(res.stdout || '').toLowerCase();
      if (!out.includes('node.exe')) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function stopRunningDaemonProcesses() {
  const tmpDir = os.tmpdir();
  const stopped = [];
  try {
    for (const f of fs.readdirSync(tmpDir)) {
      if (f.startsWith('ag-theme-daemon-') && f.endsWith('.pid')) {
        const pidPath = path.join(tmpDir, f);
        const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
        if (isConfirmedDaemonPid(pid)) {
          try {
            process.kill(pid, 'SIGTERM');
            stopped.push(pid);
          } catch {}
        }
        try {
          fs.unlinkSync(pidPath);
        } catch {}
      }
    }
  } catch {}
  return stopped;
}

function registerSystemService(targetDir, wrapperDaemon) {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    const launchAgentsDir = path.join(home, 'Library', 'LaunchAgents');
    fs.mkdirSync(launchAgentsDir, { recursive: true });
    const existingCustomFontPlist = path.join(launchAgentsDir, 'com.antigravity.customfont.plist');
    const themePlist = path.join(launchAgentsDir, 'com.antigravity.theme.plist');
    const activePlist = fs.existsSync(existingCustomFontPlist) ? existingCustomFontPlist : themePlist;
    const label = path.basename(activePlist, '.plist');

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>--disable-warning=ExperimentalWarning</string>
        <string>${wrapperDaemon}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/Current/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/antigravity-font-daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/antigravity-font-daemon.err</string>
</dict>
</plist>
`;
    const prevPlist = fs.existsSync(activePlist) ? fs.readFileSync(activePlist, 'utf8') : '';
    const plistChanged = prevPlist !== plistContent;
    if (plistChanged) {
      fs.writeFileSync(activePlist, plistContent, 'utf8');
    }

    const uid = process.getuid ? process.getuid() : 501;
    const domainTarget = `gui/${uid}/${label}`;
    const sleepSync = (ms) => {
      try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
      } catch {}
    };
    const queryServiceState = () => {
      const r = spawnSync('launchctl', ['print', domainTarget], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const out = String(r.stdout || '');
      return { loaded: r.status === 0, running: r.status === 0 && /\bpid\s*=\s*\d+/i.test(out) };
    };

    let runningNow = false;
    try {
      const initial = queryServiceState();
      if (initial.loaded && !plistChanged) {
        spawnSync('launchctl', ['kickstart', '-k', domainTarget], { stdio: 'ignore' });
      } else {
        if (initial.loaded) {
          spawnSync('launchctl', ['bootout', domainTarget], { stdio: 'ignore' });
          for (let i = 0; i < 20 && queryServiceState().loaded; i++) {
            sleepSync(100);
          }
        }
        for (let i = 0; i < 6; i++) {
          if (!queryServiceState().loaded) {
            const bootRes = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, activePlist], { stdio: 'ignore' });
            if (bootRes.status !== 0 && !queryServiceState().loaded) {
              spawnSync('launchctl', ['load', '-w', activePlist], { stdio: 'ignore' });
            }
          }
          if (queryServiceState().loaded) break;
          sleepSync(120);
        }
        spawnSync('launchctl', ['kickstart', '-k', domainTarget], { stdio: 'ignore' });
      }
      for (let i = 0; i < 5; i++) {
        const st = queryServiceState();
        if (st.running) {
          runningNow = true;
          break;
        }
        sleepSync(60);
      }
      if (!runningNow) runningNow = queryServiceState().loaded;
    } catch {}
    return { platform: 'darwin', serviceFile: activePlist, label, runningNow };
  }

  if (process.platform === 'linux') {
    const systemdDir = path.join(home, '.config', 'systemd', 'user');
    fs.mkdirSync(systemdDir, { recursive: true });
    const serviceFile = path.join(systemdDir, 'antigravity-theme.service');
    const unitContent = `[Unit]
Description=Chuanban Antigravity Theme & Live Metrics Daemon
After=default.target

[Service]
ExecStart="${process.execPath}" --disable-warning=ExperimentalWarning "${wrapperDaemon}"
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
`;
    fs.writeFileSync(serviceFile, unitContent, 'utf8');
    try {
      execSync('systemctl --user daemon-reload && systemctl --user enable --now antigravity-theme.service 2>/dev/null || true');
    } catch {}
    return { platform: 'linux', serviceFile, runningNow: true };
  }

  if (process.platform === 'win32') {
    stopRunningDaemonProcesses();
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const startupDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const vbsFile = path.join(startupDir, 'AntigravityThemeDaemon.vbs');
    const localVbsFile = path.join(targetDir, 'AntigravityThemeDaemon.vbs');
    const cmd = `""${process.execPath}"" --disable-warning=ExperimentalWarning ""${wrapperDaemon}""`;
    const vbsContent = `\uFEFFSet WshShell = CreateObject("WScript.Shell")\r\nWshShell.Run "${cmd}", 0, False\r\n`;
    try {
      // 使用 UTF-16LE (带 BOM) 写入本地启动跳板 VBS，彻底兼容 Windows 中文用户名路径 (wscript.exe 原生支持 UTF-16LE)
      fs.writeFileSync(localVbsFile, vbsContent, 'utf16le');
    } catch {}

    // 单一权威自启策略：优先使用 Windows 计划任务 (schtasks ONLOGON)，由系统 Schedule 服务拉起、
    // 脱离沙盒 Win32 Job Object；注册成功后主动清理旧版遗留的 HKCU\...\Run 与 Startup\*.vbs，避免开机三路并发争抢！
    let autostartMethod = 'none';
    let scheduledTaskStarted = false;
    try {
      const createRes = spawnSync(
        'schtasks',
        [
          '/Create',
          '/TN',
          'AntigravityThemeDaemon',
          '/SC',
          'ONLOGON',
          '/TR',
          `wscript.exe //B //NoLogo "${localVbsFile}"`,
          '/F'
        ],
        { stdio: 'ignore', windowsHide: true }
      );
      if (createRes.status === 0) {
        autostartMethod = 'schtasks';
        // 清理旧版多重自启残留
        try {
          if (fs.existsSync(vbsFile)) fs.unlinkSync(vbsFile);
        } catch {}
        try {
          spawnSync(
            'reg',
            ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'AntigravityThemeDaemon', '/f'],
            { stdio: 'ignore', windowsHide: true }
          );
        } catch {}

        const runRes = spawnSync('schtasks', ['/Run', '/TN', 'AntigravityThemeDaemon'], {
          stdio: 'ignore',
          windowsHide: true
        });
        scheduledTaskStarted = runRes.status === 0;
      }
    } catch {}

    // 仅当组策略等禁用了 schtasks 时，按 HKCU\Run -> Startup 目录顺序单路降级自启
    if (autostartMethod === 'none') {
      try {
        const regRes = spawnSync(
          'reg',
          [
            'add',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
            '/v',
            'AntigravityThemeDaemon',
            '/t',
            'REG_SZ',
            '/d',
            `wscript.exe //B //NoLogo "${localVbsFile}"`,
            '/f'
          ],
          { stdio: 'ignore', windowsHide: true }
        );
        if (regRes.status === 0) {
          autostartMethod = 'registry-run';
          try {
            if (fs.existsSync(vbsFile)) fs.unlinkSync(vbsFile);
          } catch {}
        }
      } catch {}
    }
    if (autostartMethod === 'none') {
      try {
        fs.mkdirSync(startupDir, { recursive: true });
        fs.writeFileSync(vbsFile, vbsContent, 'utf16le');
        autostartMethod = 'startup-vbs';
      } catch {}
    }

    // 若计划任务未能即时拉起后台进程，回退到 detached spawn 直接拉起
    let spawnedPid = null;
    if (!scheduledTaskStarted) {
      try {
        const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', wrapperDaemon], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
        spawnedPid = child.pid || null;
      } catch {}
    }
    return {
      platform: 'win32',
      autostartMethod,
      serviceFile: autostartMethod === 'startup-vbs' ? vbsFile : localVbsFile,
      localVbsFile,
      scheduledTask: autostartMethod === 'schtasks' ? 'AntigravityThemeDaemon' : null,
      scheduledTaskStarted,
      spawnedPid,
      runningNow: Boolean(scheduledTaskStarted || spawnedPid)
    };
  }

  return { platform: process.platform, serviceFile: null };
}

async function runInstall() {
  const cliChannel = getArg('--channel', null);
  const channel = cliChannel || 'auto';
  const preset = getArg('--preset', null);
  const defaultTarget = path.join(os.homedir(), '.gemini', 'antigravity', 'theme-patch');
  const targetDir = path.resolve(getArg('--target-dir', defaultTarget));

  const env = await detectEnvironment(channel);
  if (!env.nodeBasicOk) {
    console.error(`[ERROR] Node.js >= 22.0.0 is required (current: ${env.nodeVer}).`);
    process.exit(1);
  }

  buildManifest(__dirname);

  const srcCore = path.join(__dirname, 'core');
  const srcUser = path.join(__dirname, 'user');
  const targetCore = path.join(targetDir, 'core');
  const targetPrev = path.join(targetDir, 'core.prev');
  const backupsDir = path.join(targetDir, 'backups');
  const targetUser = path.join(targetDir, 'user');

  let backupCreated = null;
  if (path.resolve(__dirname) !== targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });

    // 仅当已安装的 core/ 与当前待安装 core/ 的 manifest SHA-256 不同时才备份，防止重复 install 冲掉上一版快照
    const srcManifestPath = path.join(srcCore, 'manifest.json');
    const targetManifestPath = path.join(targetCore, 'manifest.json');
    const shouldBackup =
      fs.existsSync(targetCore) &&
      (!fs.existsSync(targetManifestPath) || sha256File(srcManifestPath) !== sha256File(targetManifestPath));

    if (shouldBackup) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const stampedBackupDir = path.join(backupsDir, stamp);
      fs.mkdirSync(backupsDir, { recursive: true });
      copyDirRecursive(targetCore, stampedBackupDir);
      fs.rmSync(targetPrev, { recursive: true, force: true });
      copyDirRecursive(targetCore, targetPrev);
      backupCreated = stampedBackupDir;
    } else if (fs.existsSync(targetCore) && !fs.existsSync(targetPrev)) {
      copyDirRecursive(targetCore, targetPrev);
      backupCreated = targetPrev;
    }

    fs.rmSync(targetCore, { recursive: true, force: true });
    copyDirRecursive(srcCore, targetCore);

    // user/ 层永不覆盖已有文件
    fs.mkdirSync(targetUser, { recursive: true });
    for (const item of fs.readdirSync(srcUser)) {
      const s = path.join(srcUser, item);
      const d = path.join(targetUser, item);
      if (!fs.existsSync(d)) {
        fs.copyFileSync(s, d);
      }
    }

    for (const docFile of ['install.mjs', 'SKILL.md', 'README.md']) {
      const s = path.join(__dirname, docFile);
      const d = path.join(targetDir, docFile);
      if (fs.existsSync(s)) fs.copyFileSync(s, d);
    }
  }

  // 更新 user/config.json（仅在显式传入 CLI 参数或首次初始化时更新对应字段，保留用户自定义）
  const userConfigPath = path.join(targetUser, 'config.json');
  const currentCfg = fs.existsSync(userConfigPath)
    ? JSON.parse(fs.readFileSync(userConfigPath, 'utf8'))
    : {};
  if (typeof currentCfg.enabled !== 'boolean') currentCfg.enabled = true;
  if (cliChannel) {
    currentCfg.channel = cliChannel;
  } else if (!currentCfg.channel) {
    currentCfg.channel = 'auto';
  }
  if (preset) {
    currentCfg.preset = preset;
  } else if (!currentCfg.preset) {
    currentCfg.preset = 'high-contrast';
  }
  // 自动清理早期版本遗留在 user/config.json 中的出厂默认 selectors，确保后续升级由 core/runtime.js 统一托管
  if (currentCfg.selectors && typeof currentCfg.selectors === 'object') {
    if (currentCfg.selectors.inputBoxId === 'antigravity.agentSidePanelInputBox') {
      delete currentCfg.selectors;
    } else if (
      typeof currentCfg.selectors.excludeI18n === 'string' &&
      (!currentCfg.selectors.excludeI18n.includes('.monaco-editor') ||
        (currentCfg.selectors.excludeI18n.startsWith('code, pre, kbd, samp') &&
          !currentCfg.selectors.excludeI18n.includes('[data-markdown-root]')))
    ) {
      delete currentCfg.selectors.excludeI18n;
      if (Object.keys(currentCfg.selectors).length === 0) {
        delete currentCfg.selectors;
      }
    }
  }
  fs.writeFileSync(userConfigPath, JSON.stringify(currentCfg, null, 2) + '\n', 'utf8');

  // 自动检查并修补 ~/.antigravity/argv.json (remote-debugging-port)
  const argvStatus = ensureArgvRemoteDebugging(currentCfg.channel);

  // 创建兼容包装脚本 ~/.gemini/antigravity/scripts/antigravity-font-daemon.mjs（使用 pathToFileURL 兼容 Windows C:\ 路径）
  const scriptsDir = path.join(os.homedir(), '.gemini', 'antigravity', 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const wrapperDaemon = path.join(scriptsDir, 'antigravity-font-daemon.mjs');
  const realDaemon = path.join(targetCore, 'daemon.mjs');
  const realDaemonUrl = pathToFileURL(realDaemon).href;
  fs.writeFileSync(
    wrapperDaemon,
    `#!/usr/bin/env node\n// Auto-generated wrapper -> ${realDaemon}\nawait import(${JSON.stringify(realDaemonUrl)});\n`,
    { encoding: 'utf8', mode: 0o755 }
  );

  // 注册/更新跨平台自启服务
  const serviceInfo = registerSystemService(targetDir, wrapperDaemon);

  // 立即执行一次 --once 同步注入
  spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', realDaemon, '--once'], {
    stdio: 'inherit'
  });

  const live = await inspectLiveWindow(env);
  console.log(
    '\n[Install Complete]',
    JSON.stringify(
      {
        ok: true,
        targetDir,
        backupCreated,
        argvStatus,
        serviceInfo,
        config: currentCfg,
        liveWindow: live
      },
      null,
      2
    )
  );
}

async function runVerify() {
  const safeMode = hasFlag('--safe-mode');
  const channel = getArg('--channel', 'auto');
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const daemonPath = path.join(targetDir, 'core', 'daemon.mjs');

  const daemonArgs = ['--disable-warning=ExperimentalWarning', daemonPath, '--once'];
  if (safeMode) daemonArgs.push('--safe-mode');
  if (channel && channel !== 'auto') daemonArgs.push('--channel', channel);

  spawnSync(process.execPath, daemonArgs, { stdio: 'inherit' });
  const env = await detectEnvironment(channel);
  const live = await inspectLiveWindow(env);
  const ok = Boolean(live.reachable && (live.state?.hasStyle || live.pages === 0));
  console.log(
    JSON.stringify(
      {
        ok,
        version: live.state?.version || null,
        themeStyle: Boolean(live.state?.hasStyle),
        safeMode,
        channel,
        live
      },
      null,
      2
    )
  );
}

async function runRollback() {
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const targetCore = path.join(targetDir, 'core');
  const targetPrev = path.join(targetDir, 'core.prev');
  const backupsDir = path.join(targetDir, 'backups');

  let restoreSource = null;
  if (fs.existsSync(targetPrev)) {
    restoreSource = targetPrev;
  } else if (fs.existsSync(backupsDir)) {
    const stamps = fs.readdirSync(backupsDir).sort().reverse();
    if (stamps.length > 0) {
      restoreSource = path.join(backupsDir, stamps[0]);
    }
  }

  if (!restoreSource) {
    console.error(`[ERROR] No backup found at ${targetPrev} or ${backupsDir}`);
    process.exit(1);
  }

  fs.rmSync(targetCore, { recursive: true, force: true });
  copyDirRecursive(restoreSource, targetCore);

  // 重启守护进程并立即执行一次 --once 重新注入
  const realDaemon = path.join(targetCore, 'daemon.mjs');
  const wrapperDaemon = path.join(os.homedir(), '.gemini', 'antigravity', 'scripts', 'antigravity-font-daemon.mjs');
  if (process.platform === 'darwin') {
    const uid = process.getuid ? process.getuid() : 501;
    try {
      execSync(`launchctl kickstart -k gui/${uid}/com.antigravity.customfont 2>/dev/null || launchctl kickstart -k gui/${uid}/com.antigravity.theme 2>/dev/null || true`);
    } catch {}
  } else if (process.platform === 'linux') {
    try {
      execSync('systemctl --user restart antigravity-theme.service 2>/dev/null || true');
    } catch {}
  } else if (process.platform === 'win32') {
    stopRunningDaemonProcesses();
    let restartedViaTask = false;
    try {
      const r = spawnSync('schtasks', ['/Run', '/TN', 'AntigravityThemeDaemon'], {
        stdio: 'ignore',
        windowsHide: true
      });
      restartedViaTask = r.status === 0;
    } catch {}
    if (!restartedViaTask) {
      try {
        const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fs.existsSync(wrapperDaemon) ? wrapperDaemon : realDaemon], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
        child.unref();
      } catch {}
    }
  }
  spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', realDaemon, '--once'], {
    stdio: 'inherit'
  });

  const env = await detectEnvironment('auto');
  const live = await inspectLiveWindow(env);
  console.log(
    JSON.stringify(
      {
        ok: true,
        restoredFrom: restoreSource,
        restoredTo: targetCore,
        live
      },
      null,
      2
    )
  );
}

function runInstallFonts() {
  const fromDir = getArg('--from', null);
  if (!fromDir || !fs.existsSync(fromDir)) {
    console.error('Usage: node install.mjs install-fonts --from <font-folder-path>');
    process.exit(1);
  }
  const home = os.homedir();
  const destDir =
    process.platform === 'darwin'
      ? path.join(home, 'Library', 'Fonts')
      : process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')
      : path.join(home, '.local', 'share', 'fonts');

  fs.mkdirSync(destDir, { recursive: true });
  const installed = [];

  const walkFonts = (dir) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walkFonts(full);
      } else if (/\.(ttf|otf|ttc)$/i.test(entry)) {
        const destPath = path.join(destDir, entry);
        fs.copyFileSync(full, destPath);
        if (process.platform === 'win32') {
          const ext = path.extname(entry).toLowerCase();
          const typeSuffix = ext === '.otf' ? ' (OpenType)' : ' (TrueType)';
          const fontTitle = entry.replace(/\.(ttf|otf|ttc)$/i, '') + typeSuffix;
          try {
            spawnSync(
              'reg',
              [
                'add',
                'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
                '/v',
                fontTitle,
                '/t',
                'REG_SZ',
                '/d',
                destPath,
                '/f'
              ],
              { stdio: 'ignore', windowsHide: true }
            );
          } catch {}
        }
        installed.push(destPath);
      }
    }
  };

  walkFonts(path.resolve(fromDir));
  if (process.platform === 'linux') {
    try {
      execSync('fc-cache -f 2>/dev/null || true');
    } catch {}
  }
  console.log(JSON.stringify({ ok: true, platform: process.platform, destDir, installedCount: installed.length, installed }, null, 2));
}

async function runUninstall() {
  const home = os.homedir();
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const userConfigPath = path.join(targetDir, 'user', 'config.json');
  const realDaemon = path.join(targetDir, 'core', 'daemon.mjs');

  // 1. 先移除跨平台开机自启服务（防止 KeepAlive/Restart 自动拉起），再彻底终止残留后台守护进程，消除与 --once 还原注入的并发竞态
  if (process.platform === 'darwin') {
    const uid = process.getuid ? process.getuid() : 501;
    const launchAgentsDir = path.join(home, 'Library', 'LaunchAgents');
    for (const label of ['com.antigravity.customfont', 'com.antigravity.theme']) {
      try {
        execSync(`launchctl bootout gui/${uid}/${label} 2>/dev/null || true`);
      } catch {}
      for (let i = 0; i < 15; i++) {
        const res = spawnSync('launchctl', ['print', `gui/${uid}/${label}`], { stdio: 'ignore' });
        if (res.status !== 0) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
      try {
        const plistFile = path.join(launchAgentsDir, `${label}.plist`);
        if (fs.existsSync(plistFile)) fs.unlinkSync(plistFile);
      } catch {}
    }
  } else if (process.platform === 'linux') {
    try {
      execSync('systemctl --user disable --now antigravity-theme.service 2>/dev/null || true');
      const serviceFile = path.join(home, '.config', 'systemd', 'user', 'antigravity-theme.service');
      if (fs.existsSync(serviceFile)) fs.unlinkSync(serviceFile);
      execSync('systemctl --user daemon-reload 2>/dev/null || true');
    } catch {}
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const vbsFile = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'AntigravityThemeDaemon.vbs');
    const localVbs = path.join(targetDir, 'AntigravityThemeDaemon.vbs');
    try {
      spawnSync('schtasks', ['/Delete', '/TN', 'AntigravityThemeDaemon', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } catch {}
    try {
      spawnSync('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'AntigravityThemeDaemon', '/f'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } catch {}
    try {
      if (fs.existsSync(vbsFile)) fs.unlinkSync(vbsFile);
      if (fs.existsSync(localVbs)) fs.unlinkSync(localVbs);
    } catch {}
  }
  stopRunningDaemonProcesses();

  // 2. 在无后台守护进程干扰的纯净状态下，向打开的窗口发送一次禁用还原载荷，即时卸载样式并恢复英文原貌
  if (fs.existsSync(userConfigPath) && fs.existsSync(realDaemon)) {
    try {
      const origRaw = fs.readFileSync(userConfigPath, 'utf8');
      const cfg = JSON.parse(origRaw);
      cfg.enabled = false;
      fs.writeFileSync(userConfigPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', realDaemon, '--once'], {
        stdio: 'ignore',
        windowsHide: true
      });
      fs.writeFileSync(userConfigPath, origRaw, 'utf8');
    } catch {}
  }
  console.log('[Uninstall] Stopped daemon, removed autostart services, and unloaded live styles. User config in ~/.gemini/antigravity/theme-patch/user/ is preserved.');
}

// ============================================================================
// 4. 路由分发
// ============================================================================
switch (subcommand) {
  case 'build-manifest': {
    const m = buildManifest(__dirname);
    console.log('Built core/manifest.json:', m.version, 'files:', Object.keys(m.files).length);
    break;
  }
  case 'pack': {
    const packed = buildDistZip(__dirname);
    console.log('Packed & verified dist archive:', packed.zipPath, `(verified ${packed.filesVerified} core files)`);
    break;
  }
  case 'doctor':
    await runDoctor();
    break;
  case 'install':
    await runInstall();
    break;
  case 'install-fonts':
    runInstallFonts();
    break;
  case 'verify':
    await runVerify();
    break;
  case 'rollback':
    await runRollback();
    break;
  case 'uninstall':
    await runUninstall();
    break;
  default:
    console.log(`Usage:
  node install.mjs install       [--channel auto|stable|insiders] [--preset high-contrast]
  node install.mjs install-fonts --from <font-folder-path>
  node install.mjs doctor        [--channel auto|stable|insiders]
  node install.mjs verify        [--safe-mode] [--channel auto|stable|insiders]
  node install.mjs rollback
  node install.mjs uninstall
  node install.mjs build-manifest
  node install.mjs pack`);
    break;
}
