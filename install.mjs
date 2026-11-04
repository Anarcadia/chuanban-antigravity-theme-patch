#!/usr/bin/env node
/**
 * chuanban-antigravity-theme-patch · One-Click Installer & Doctor CLI (install.mjs)
 *
 * 用法：
 *   node install.mjs install [--preset high-contrast|claude-desktop-purewhite|vintage-deep] [--channel stable|insiders] [--target-dir ~/.antigravity-patch]
 *   node install.mjs doctor  [--channel stable|insiders]
 *   node install.mjs verify  [--safe-mode] [--channel stable|insiders]
 *   node install.mjs rollback [--target-dir ~/.antigravity-patch]
 *   node install.mjs uninstall [--target-dir ~/.antigravity-patch]
 *   node install.mjs build-manifest
 */
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GDRIVE_FULL_PACK_URL = 'https://drive.google.com/drive/folders/1NX92SgVUqtSjWg6bt6sIJXy-cn7J_boC';
const GITHUB_REPO_URL = 'https://github.com/Anarcadia/chuanban-antigravity-theme-patch';
const NOTION_GUIDE_URL = 'https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554';

const args = process.argv.slice(2);
const subcmd = args[0] && !args[0].startsWith('-') ? args[0] : 'install';

function getArg(flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseNodeVersion() {
  const [maj, min, pat] = process.versions.node.split('.').map((n) => parseInt(n, 10));
  return { maj, min, pat, raw: process.versions.node };
}

async function checkSqliteSupport() {
  try {
    const mod = await import('node:sqlite');
    return Boolean(mod && mod.DatabaseSync);
  } catch {
    return false;
  }
}

function resolveAppPaths(channel = 'stable') {
  const home = os.homedir();
  const isInsiders = channel === 'insiders';
  const appDirName = isInsiders ? 'Antigravity - Insiders' : 'Antigravity';
  const appBundleName = isInsiders ? 'Antigravity - Insiders.app' : 'Antigravity.app';

  let portFile;
  if (process.platform === 'darwin') {
    portFile = path.join(home, 'Library', 'Application Support', appDirName, 'DevToolsActivePort');
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    portFile = path.join(appData, appDirName, 'DevToolsActivePort');
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    portFile = path.join(xdgConfig, appDirName, 'DevToolsActivePort');
  }

  return {
    channel,
    appDirName,
    appBundlePath: process.platform === 'darwin' ? path.join('/Applications', appBundleName) : null,
    portFile
  };
}

function checkInstalledFonts() {
  const home = os.homedir();
  const dirs =
    process.platform === 'darwin'
      ? [path.join(home, 'Library', 'Fonts'), '/Library/Fonts']
      : process.platform === 'win32'
        ? [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'), path.join(home, 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts')]
        : [path.join(home, '.local', 'share', 'fonts'), '/usr/local/share/fonts', '/usr/share/fonts'];

  let hasAnthropic = false;
  let hasSarasa = false;
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) continue;
      const files = fs.readdirSync(d);
      if (files.some((f) => /anthropic/i.test(f))) hasAnthropic = true;
      if (files.some((f) => /sarasa/i.test(f))) hasSarasa = true;
    } catch {}
  }
  return { hasAnthropic, hasSarasa };
}

function buildManifest(baseDir = __dirname) {
  const coreDir = path.join(baseDir, 'core');
  const coreFiles = ['daemon.mjs', 'runtime.js', 'theme.css', 'i18n.json'];
  const hashes = {};
  for (const f of coreFiles) {
    const p = path.join(coreDir, f);
    if (fs.existsSync(p)) {
      hashes[f] = sha256File(p);
    }
  }
  const i18nObj = JSON.parse(fs.readFileSync(path.join(coreDir, 'i18n.json'), 'utf8'));
  const manifest = {
    name: 'chuanban-antigravity-theme-patch',
    version: '5.0.0',
    patchTag: '20261104-v5.0.0',
    nodePolicy: {
      minBase: '22.0.0',
      minMetricsSqlite: '22.13.0',
      strategy: 'dynamic-grading'
    },
    testedAppVersions: ['2.29.0', 'Insiders-2026.11'],
    i18nKeyCount: Object.keys(i18nObj).length,
    distribution: {
      notionGuide: NOTION_GUIDE_URL,
      googleDriveFullPack: GDRIVE_FULL_PACK_URL,
      githubRepo: GITHUB_REPO_URL
    },
    files: hashes,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(coreDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

function verifyCoreIntegrity(baseDir) {
  const manifestPath = path.join(baseDir, 'core', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { ok: false, modified: ['manifest.json missing'] };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const modified = [];
  for (const [file, expectedHash] of Object.entries(manifest.files || {})) {
    const p = path.join(baseDir, 'core', file);
    if (!fs.existsSync(p)) {
      modified.push(`${file} (missing)`);
    } else if (sha256File(p) !== expectedHash) {
      modified.push(`${file} (modified)`);
    }
  }
  return { ok: modified.length === 0, modified, manifest };
}

function queryCdpTargets(port) {
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

async function inspectLiveWindow(portFile) {
  if (!fs.existsSync(portFile)) {
    return { reachable: false, reason: `DevToolsActivePort not found at ${portFile}` };
  }
  const port = parseInt(fs.readFileSync(portFile, 'utf8').trim().split('\n')[0], 10);
  if (!port) return { reachable: false, reason: 'Invalid port in DevToolsActivePort' };

  const targets = await queryCdpTargets(port);
  const appTarget = targets.find(
    (t) => t.type === 'page' && t.webSocketDebuggerUrl && (t.url.startsWith('http://127.0.0.1') || t.url.startsWith('https://127.0.0.1'))
  );
  if (!appTarget) {
    return { reachable: false, port, reason: 'No active Antigravity page target found on port ' + port };
  }

  return new Promise((resolve) => {
    const ws = new globalThis.WebSocket(appTarget.webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      resolve({ reachable: false, port, reason: 'WebSocket evaluate timed out' });
    }, 3500);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const pill = document.getElementById("ag-live-metrics-pill");
              const d = window.__ag_i18n_dict;
              return {
                version: window.__ag_patch_version || null,
                hasStyle: Boolean(document.getElementById("ag-custom-fonts")),
                preset: document.documentElement.getAttribute("data-ag-preset"),
                pageType: document.documentElement.getAttribute("data-ag-page-type"),
                dictCount: d ? Object.keys(d).length : 0,
                protoSafe: d ? Object.getPrototypeOf(d) === null : false,
                pillMounted: Boolean(pill),
                pillText: pill ? pill.innerText : null
              };
            })()`,
            returnByValue: true
          }
        })
      );
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.id === 1) {
          clearTimeout(timer);
          ws.close();
          resolve({
            reachable: true,
            port,
            targetId: appTarget.id,
            title: appTarget.title,
            state: msg.result?.result?.value || null
          });
        }
      } catch {}
    };

    ws.onerror = (err) => {
      clearTimeout(timer);
      resolve({ reachable: false, port, reason: err?.message || 'WebSocket error' });
    };
  });
}

async function runDoctor() {
  const channel = getArg('--channel', 'stable');
  const targetDir = path.resolve(getArg('--target-dir', __dirname));
  const nv = parseNodeVersion();
  const hasWebSocket = typeof globalThis.WebSocket === 'function';
  const hasSqlite = await checkSqliteSupport();
  const fonts = checkInstalledFonts();
  const appPaths = resolveAppPaths(channel);
  const integrity = verifyCoreIntegrity(targetDir);
  const live = hasWebSocket ? await inspectLiveWindow(appPaths.portFile) : { reachable: false, reason: 'No WebSocket' };

  const report = {
    node: {
      version: process.version,
      execPath: process.execPath,
      tier: !hasWebSocket
        ? 'UNSUPPORTED (< 22.0, missing WebSocket)'
        : hasSqlite
          ? 'FULL (>= 22.13, Theme + Fonts + i18n + SQLite Live Metrics)'
          : 'BASE (22.0~22.12, Theme + Fonts + i18n active; SQLite Metrics gracefully disabled)'
    },
    fonts: {
      anthropicInstalled: fonts.hasAnthropic,
      sarasaInstalled: fonts.hasSarasa,
      downloadUrl: !fonts.hasAnthropic || !fonts.hasSarasa ? GDRIVE_FULL_PACK_URL : null
    },
    antigravity: {
      channel,
      appExists: appPaths.appBundlePath ? fs.existsSync(appPaths.appBundlePath) : true,
      portFile: appPaths.portFile,
      portFileExists: fs.existsSync(appPaths.portFile)
    },
    coreIntegrity: {
      targetDir,
      clean: integrity.ok,
      modifiedFiles: integrity.modified
    },
    liveWindow: live
  };

  console.log(JSON.stringify(report, null, 2));
  if (!hasWebSocket) process.exit(1);
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

async function runInstall() {
  const nv = parseNodeVersion();
  if (nv.maj < 22 || typeof globalThis.WebSocket !== 'function') {
    console.error(
      `[Install Aborted] Node.js >= 22.0.0 is required (current: ${process.version}). Please upgrade Node.js first.`
    );
    process.exit(1);
  }

  const preset = getArg('--preset', null);
  const channel = getArg('--channel', null);
  const defaultTarget = path.join(os.homedir(), '.gemini', 'antigravity', 'theme-patch');
  const targetDir = path.resolve(getArg('--target-dir', defaultTarget));

  buildManifest(__dirname);

  if (targetDir !== path.resolve(__dirname)) {
    fs.mkdirSync(targetDir, { recursive: true });
    const targetCore = path.join(targetDir, 'core');
    if (fs.existsSync(targetCore)) {
      const check = verifyCoreIntegrity(targetDir);
      if (!check.ok) {
        console.warn(`[Upgrade Notice] Existing core/ had local modifications (${check.modified.join(', ')}). Backing up to core.prev/`);
      }
      const prevCore = path.join(targetDir, 'core.prev');
      fs.rmSync(prevCore, { recursive: true, force: true });
      fs.cpSync(targetCore, prevCore, { recursive: true });
    }
    copyDirRecursive(path.join(__dirname, 'core'), targetCore);
    fs.copyFileSync(path.join(__dirname, 'install.mjs'), path.join(targetDir, 'install.mjs'));

    // 初始化 user/ 目录：若已存在则绝不覆盖，保护用户与 Agent 的自定义配置
    const targetUser = path.join(targetDir, 'user');
    fs.mkdirSync(targetUser, { recursive: true });
    for (const f of ['config.json', 'custom.css', 'i18n.override.json', 'custom.js']) {
      const srcU = path.join(__dirname, 'user', f);
      const dstU = path.join(targetUser, f);
      if (fs.existsSync(srcU) && !fs.existsSync(dstU)) {
        fs.copyFileSync(srcU, dstU);
      }
    }
  }

  // 更新 user/config.json 中的 preset 或 channel（若显式传入）
  const cfgPath = path.join(targetDir, 'user', 'config.json');
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
  if (preset) cfg.preset = preset;
  if (channel) cfg.channel = channel;
  if (!cfg.preset) cfg.preset = 'high-contrast';
  if (!cfg.channel) cfg.channel = 'stable';
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');

  // 兼容旧版 ~/.gemini/antigravity/scripts/antigravity-font-daemon.mjs 软链/包装入口
  const legacyScriptsDir = path.join(os.homedir(), '.gemini', 'antigravity', 'scripts');
  if (fs.existsSync(legacyScriptsDir)) {
    const wrapperCode = `#!/usr/bin/env node\n// Auto-generated v5 wrapper pointing to modular core/daemon.mjs\nimport ${JSON.stringify(path.join(targetDir, 'core', 'daemon.mjs'))};\n`;
    fs.writeFileSync(path.join(legacyScriptsDir, 'antigravity-font-daemon.mjs'), wrapperCode, 'utf8');
  }

  // 在 macOS 上配置或重启 LaunchAgent
  if (process.platform === 'darwin' && !args.includes('--no-service')) {
    const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    fs.mkdirSync(launchAgentsDir, { recursive: true });
    const existingCustomFontPlist = path.join(launchAgentsDir, 'com.antigravity.customfont.plist');
    const uid = typeof process.getuid === 'function' ? process.getuid() : 501;

    if (fs.existsSync(existingCustomFontPlist)) {
      try {
        execFileSync('launchctl', ['kickstart', '-k', `gui/${uid}/com.antigravity.customfont`], { stdio: 'ignore' });
      } catch {}
    } else {
      const label = 'com.antigravity.customfont';
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
    <string>${path.join(targetDir, 'core', 'daemon.mjs')}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/antigravity-font.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/antigravity-font.err</string>
</dict>
</plist>
`;
      fs.writeFileSync(existingCustomFontPlist, plistContent, 'utf8');
      try {
        execFileSync('launchctl', ['bootstrap', `gui/${uid}`, existingCustomFontPlist], { stdio: 'ignore' });
      } catch {}
      try {
        execFileSync('launchctl', ['kickstart', '-k', `gui/${uid}/${label}`], { stdio: 'ignore' });
      } catch {}
    }
  }

  // 立即执行一次注入并验证
  spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(targetDir, 'core', 'daemon.mjs'), '--once'], {
    stdio: 'inherit'
  });

  const appPaths = resolveAppPaths(cfg.channel);
  const live = await inspectLiveWindow(appPaths.portFile);
  console.log('\n[Install Complete]', JSON.stringify({ targetDir, config: cfg, liveWindow: live }, null, 2));
}

async function runVerify() {
  const safeMode = args.includes('--safe-mode') || args.includes('--no-user');
  const channel = getArg('--channel', 'stable');
  const defaultTarget = fs.existsSync(path.join(os.homedir(), '.gemini', 'antigravity', 'theme-patch', 'core', 'daemon.mjs'))
    ? path.join(os.homedir(), '.gemini', 'antigravity', 'theme-patch')
    : __dirname;
  const targetDir = path.resolve(getArg('--target-dir', defaultTarget));

  const daemonArgs = ['--disable-warning=ExperimentalWarning', path.join(targetDir, 'core', 'daemon.mjs'), '--once', '--channel', channel];
  if (safeMode) daemonArgs.push('--safe-mode');

  spawnSync(process.execPath, daemonArgs, { stdio: 'inherit' });
  const appPaths = resolveAppPaths(channel);
  const live = await inspectLiveWindow(appPaths.portFile);
  console.log(JSON.stringify({ safeMode, channel, live }, null, 2));
}

function runRollback() {
  const defaultTarget = path.join(os.homedir(), '.gemini', 'antigravity', 'theme-patch');
  const targetDir = path.resolve(getArg('--target-dir', defaultTarget));
  const prevCore = path.join(targetDir, 'core.prev');
  const currCore = path.join(targetDir, 'core');
  if (!fs.existsSync(prevCore)) {
    console.error(`[Rollback Failed] No core.prev/ backup found in ${targetDir}`);
    process.exit(1);
  }
  fs.rmSync(currCore, { recursive: true, force: true });
  fs.cpSync(prevCore, currCore, { recursive: true });
  console.log(`[Rollback Complete] Restored core.prev/ -> core/ in ${targetDir}`);
}

function runUninstall() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
  if (process.platform === 'darwin') {
    const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.antigravity.customfont.plist');
    try {
      execFileSync('launchctl', ['bootout', `gui/${uid}`, plist], { stdio: 'ignore' });
    } catch {}
  }
  for (const ch of ['stable', 'insiders']) {
    const pidFile = path.join(os.tmpdir(), `ag-theme-daemon-${ch}.pid`);
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
        if (pid) process.kill(pid, 'SIGTERM');
        fs.unlinkSync(pidFile);
      } catch {}
    }
  }
  console.log('[Uninstall Complete] Stopped daemon service. Restart Antigravity to return to factory default state.');
}

if (subcmd === 'build-manifest') {
  const m = buildManifest(__dirname);
  console.log('Built core/manifest.json:', m.version, 'files:', Object.keys(m.files).length);
} else if (subcmd === 'doctor') {
  await runDoctor();
} else if (subcmd === 'verify') {
  await runVerify();
} else if (subcmd === 'rollback') {
  runRollback();
} else if (subcmd === 'uninstall') {
  runUninstall();
} else {
  await runInstall();
}
