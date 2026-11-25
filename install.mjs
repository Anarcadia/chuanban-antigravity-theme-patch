#!/usr/bin/env node
/**
 * chuanban-antigravity-theme-patch · 一键安装、自检、CDP 接力重启、安全模式验证、打包与回滚 CLI (install.mjs)
 *
 * 支持子命令：
 *   node install.mjs install        [--channel auto|stable|insiders] [--preset native|morandi|absolutely|claude-desktop-purewhite|vintage-deep] [--dark-preset onyx|claude-warm] [--sync-user] [--with-launcher] [--target-dir <dir>]
 *   node install.mjs relaunch       [--channel auto|stable|insiders] [--force] [--target-dir <dir>]
 *   node install.mjs download-fonts [--dir <download-dir>] [--all] [--force] [--super-ttc]
 *   node install.mjs install-fonts  --auto-download [--dir <download-dir>] [--force] [--super-ttc] [--retire-super-ttc]
 *   node install.mjs install-fonts  --from <font-folder-or-zip-path> [--retire-super-ttc]
 *   node install.mjs doctor         [--channel auto|stable|insiders] [--target-dir <dir>]
 *   node install.mjs verify         [--safe-mode] [--channel auto|stable|insiders] [--target-dir <dir>]
 *   node install.mjs rollback       [--target-dir <dir>]
 *   node install.mjs uninstall      [--target-dir <dir>]
 *   node install.mjs build-manifest
 *   node install.mjs pack
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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
const WINDOWS_SARASA_SPLIT_VIEW_URL = 'https://drive.google.com/file/d/1iVVvZXtwUcDiHy42tJ25X6N-JlOf3l7A/view?usp=sharing';
const SARASA_GITHUB_RELEASES_URL = 'https://github.com/be5invis/Sarasa-Gothic/releases';
const NOTION_GUIDE_URL = 'https://chuanban.notion.site/chuanban-antigravity-theme-patch-db7c5846f37546be9481cd791aed0554';
const GITHUB_REPO_URL = 'https://github.com/Anarcadia/chuanban-antigravity-theme-patch';
const R2_FONT_MIRROR_BASE_URL = 'https://img.chuanban.cc/fonts/chuanban-suite';
const GITHUB_FONT_MIRROR_TAG = 'fonts-sarasa-v1.0.43';
const GITHUB_FONT_MIRROR_BASE_URL = `${GITHUB_REPO_URL}/releases/download/${GITHUB_FONT_MIRROR_TAG}`;
const R2_SARASA_SPLIT_URL = `${R2_FONT_MIRROR_BASE_URL}/Windows-Sarasa-Split-SC-TTF-v1.0.43.zip`;
const GITHUB_SARASA_SPLIT_URL = `${GITHUB_FONT_MIRROR_BASE_URL}/Windows-Sarasa-Split-SC-TTF-v1.0.43.zip`;

function buildGoogleDriveDirectUrl(fileId) {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}

const FONT_DOWNLOAD_CATALOG = {
  anthropicSerifRegular: {
    id: 'anthropicSerifRegular',
    label: 'Anthropic Serif Regular',
    filename: 'AnthropicSerif-Regular.ttf',
    driveFileId: '1RZ1rMYYFlr5B-slSSZV-DCJtv5AfTMUV',
    sha256: '5806e7fbfebfe6683fdb2c16d8eb91b98ccd6b4ba0d477e8f5167782e0d7b009',
    mirrors: [
      { id: 'cloudflare-r2', url: `${R2_FONT_MIRROR_BASE_URL}/AnthropicSerif-Regular.ttf` },
      { id: 'google-drive', url: buildGoogleDriveDirectUrl('1RZ1rMYYFlr5B-slSSZV-DCJtv5AfTMUV') }
    ],
    url: `${R2_FONT_MIRROR_BASE_URL}/AnthropicSerif-Regular.ttf`,
    kind: 'font',
    minBytes: 100 * 1024,
    timeoutSec: 120
  },
  anthropicSerifBold: {
    id: 'anthropicSerifBold',
    label: 'Anthropic Serif Bold',
    filename: 'AnthropicSerif-Bold.ttf',
    driveFileId: '1-LJfTa1wasIqkoCCHI4mfVyh8tzreiAO',
    sha256: '3e0d9660390f1800f229e2724cf0b09030ec53188cd3d361ca210077ce564426',
    mirrors: [
      { id: 'cloudflare-r2', url: `${R2_FONT_MIRROR_BASE_URL}/AnthropicSerif-Bold.ttf` },
      { id: 'google-drive', url: buildGoogleDriveDirectUrl('1-LJfTa1wasIqkoCCHI4mfVyh8tzreiAO') }
    ],
    url: `${R2_FONT_MIRROR_BASE_URL}/AnthropicSerif-Bold.ttf`,
    kind: 'font',
    minBytes: 100 * 1024,
    timeoutSec: 120
  },
  anthropicMonoRegular: {
    id: 'anthropicMonoRegular',
    label: 'Anthropic Mono Regular',
    filename: 'AnthropicMono-Regular.ttf',
    driveFileId: '1NK_1Q2MBl5yHw94pC_kbzybDgqEFCZVk',
    sha256: '0e686e9d651bf3b7448bbc7ec5c5ffd48e3ae9b07710d26ed332170487f60295',
    mirrors: [
      { id: 'cloudflare-r2', url: `${R2_FONT_MIRROR_BASE_URL}/AnthropicMono-Regular.ttf` },
      { id: 'google-drive', url: buildGoogleDriveDirectUrl('1NK_1Q2MBl5yHw94pC_kbzybDgqEFCZVk') }
    ],
    url: `${R2_FONT_MIRROR_BASE_URL}/AnthropicMono-Regular.ttf`,
    kind: 'font',
    minBytes: 50 * 1024,
    timeoutSec: 120
  },
  sarasaSplitScZip: {
    id: 'sarasaSplitScZip',
    label: 'Sarasa Gothic SC Split TTF (14 weights, 170 MB ZIP)',
    filename: 'Windows-Sarasa-Split-SC-TTF-v1.0.43.zip',
    driveFileId: '1iVVvZXtwUcDiHy42tJ25X6N-JlOf3l7A',
    sha256: '5add515b1bdc35a246e2507f34b3fce45e517e156842e81a948ca91e51dafde3',
    mirrors: [
      { id: 'cloudflare-r2', url: R2_SARASA_SPLIT_URL },
      { id: 'github-release', url: GITHUB_SARASA_SPLIT_URL },
      { id: 'google-drive', url: buildGoogleDriveDirectUrl('1iVVvZXtwUcDiHy42tJ25X6N-JlOf3l7A') }
    ],
    url: R2_SARASA_SPLIT_URL,
    viewUrl: R2_SARASA_SPLIT_URL,
    kind: 'zip',
    minBytes: 50 * 1024 * 1024,
    timeoutSec: 600
  },
  sarasaSuperTtc: {
    id: 'sarasaSuperTtc',
    label: 'Sarasa Gothic SuperTTC (791 MB TTC, macOS/Linux optional)',
    filename: 'Sarasa-SuperTTC.ttc',
    driveFileId: '1i7mqpF2UpjCSR9oBPvPAD3CB6TJn9mwu',
    sha256: 'c66ea03101e8615e3205dc383323f7a3c3100ef783f228b3d877d38ce84ff314',
    mirrors: [
      { id: 'github-release', url: `${GITHUB_FONT_MIRROR_BASE_URL}/Sarasa-SuperTTC.ttc` },
      { id: 'google-drive', url: buildGoogleDriveDirectUrl('1i7mqpF2UpjCSR9oBPvPAD3CB6TJn9mwu') }
    ],
    url: `${GITHUB_FONT_MIRROR_BASE_URL}/Sarasa-SuperTTC.ttc`,
    kind: 'font',
    minBytes: 200 * 1024 * 1024,
    timeoutSec: 1200
  }
};

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

function canonicalPath(p) {
  const resolved = path.resolve(p);
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
  } catch {
    const parent = path.dirname(resolved);
    if (parent && parent !== resolved) {
      try {
        const realParent = fs.realpathSync.native ? fs.realpathSync.native(parent) : fs.realpathSync(parent);
        return path.join(realParent, path.basename(resolved));
      } catch {}
    }
    return resolved;
  }
}

function isSameTargetPath(a, b) {
  const pa = canonicalPath(a);
  const pb = canonicalPath(b);
  return process.platform === 'win32' || process.platform === 'darwin'
    ? pa.toLowerCase() === pb.toLowerCase()
    : pa === pb;
}

function resolveGlobalInstallDir() {
  return path.join(os.homedir(), '.gemini', 'antigravity', 'theme-patch');
}

function resolveDefaultTargetDir() {
  const installed = resolveGlobalInstallDir();
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
    version: '6.0.3',
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
    'LICENSE',
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

  const allowedUserFiles = new Set(['config.json', 'custom.css', 'custom.js', 'i18n.override.json']);
  const skipNames = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
  const entriesToPack = [];
  const collectEntries = (relPosix) => {
    const fullPath = path.join(baseDir, ...relPosix.split('/'));
    if (!fs.existsSync(fullPath)) return;
    const st = fs.statSync(fullPath);
    if (st.isDirectory()) {
      for (const child of fs.readdirSync(fullPath).sort()) {
        if (skipNames.has(child)) continue;
        if (relPosix === 'user' && !allowedUserFiles.has(child)) continue;
        collectEntries(`${relPosix}/${child}`);
      }
    } else if (st.isFile()) {
      entriesToPack.push({ abs: fullPath, entry: relPosix });
    }
  };
  for (const item of includeItems) {
    collectEntries(item.replace(/\\/g, '/'));
  }

  if (process.platform === 'win32') {
    const listTmpPath = path.join(os.tmpdir(), `ag-pack-entries-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(listTmpPath, JSON.stringify(entriesToPack), 'utf8');
    try {
      const psScript = [
        '$ErrorActionPreference = "Stop"',
        'Add-Type -AssemblyName System.IO.Compression',
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        `$zipPath = '${zipPath.replace(/'/g, "''")}'`,
        `$listPath = '${listTmpPath.replace(/'/g, "''")}'`,
        '$parsed = Get-Content -LiteralPath $listPath -Raw -Encoding UTF8 | ConvertFrom-Json',
        '$items = @(foreach ($x in $parsed) { if ($null -ne $x) { $x } })',
        '$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)',
        'try {',
        '  foreach ($it in $items) {',
        '    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, [string]$it.abs, [string]$it.entry, [System.IO.Compression.CompressionLevel]::Optimal)',
        '  }',
        '} finally {',
        '  $zip.Dispose()',
        '}',
        '$zr = [System.IO.Compression.ZipFile]::OpenRead($zipPath)',
        '$sha = [System.Security.Cryptography.SHA256]::Create()',
        '$out = @{ hasBackslash = $false; core = @{} }',
        'try {',
        '  foreach ($e in $zr.Entries) {',
        '    if ($e.FullName.Contains("\\")) { $out.hasBackslash = $true }',
        '    if ($e.FullName.StartsWith("core/") -and $e.Name -ne "") {',
        '      $s = $e.Open()',
        '      $ms = New-Object System.IO.MemoryStream',
        '      try { $s.CopyTo($ms) } finally { $s.Dispose() }',
        '      $bytes = $ms.ToArray()',
        '      $ms.Dispose()',
        '      $hash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()',
        '      $out.core[$e.Name] = @{ sha256 = $hash; bytes = $bytes.Length }',
        '    }',
        '  }',
        '} finally {',
        '  $sha.Dispose()',
        '  $zr.Dispose()',
        '}',
        '$out | ConvertTo-Json -Compress -Depth 4'
      ].join('; ');

      const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
        cwd: baseDir,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      });
      if (r.status !== 0) {
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        throw new Error(`ZipArchive pack failed: ${(r.stderr || r.stdout || '').trim()}`);
      }
      const verifyData = JSON.parse(String(r.stdout || '').trim());
      if (verifyData.hasBackslash) {
        fs.unlinkSync(zipPath);
        throw new Error(`Verification failed: backslash path detected in ${zipName}`);
      }
      for (const [name, meta] of Object.entries(manifest.files)) {
        const actual = verifyData.core?.[name];
        if (!actual) {
          fs.unlinkSync(zipPath);
          throw new Error(`Verification failed: missing core/${name} in ${zipName}`);
        }
        if (actual.sha256 !== meta.sha256 || actual.bytes !== meta.bytes) {
          fs.unlinkSync(zipPath);
          throw new Error(
            `Verification failed for core/${name} in ${zipName}: expected ${meta.sha256} (${meta.bytes}B), got ${actual.sha256} (${actual.bytes}B)`
          );
        }
      }
    } finally {
      try {
        if (fs.existsSync(listTmpPath)) fs.unlinkSync(listTmpPath);
      } catch {}
    }
  } else {
    const r = spawnSync('zip', ['-q', zipPath, ...entriesToPack.map((e) => e.entry)], {
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
// 2. 环境、字体、2.33.0+ CDP Opt-in 状态、M1 启动器与实时 CDP 窗口检查
// ============================================================================
function buildWin32LnkSpecsPs() {
  return [
    `$lnkSpecs = if ($env:AG_WIN32_LNK_DIRS) {`,
    `  @($env:AG_WIN32_LNK_DIRS -split ';' | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | ForEach-Object { @{ dir = $_; recurse = $true; depth = 2 } })`,
    `} else {`,
    `  @(`,
    `    @{ dir = [Environment]::GetFolderPath('Desktop'); recurse = $false; depth = 0 },`,
    `    @{ dir = [Environment]::GetFolderPath('CommonDesktopDirectory'); recurse = $false; depth = 0 },`,
    `    @{ dir = (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'); recurse = $true; depth = 2 },`,
    `    @{ dir = (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'); recurse = $true; depth = 2 },`,
    `    @{ dir = (Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'); recurse = $false; depth = 0 }`,
    `  ) | Where-Object { $_.dir -and (Test-Path -LiteralPath $_.dir) }`,
    `}`,
    `$seenLnkDirs = @{}`
  ];
}

function readHostVersionAndProcesses(channel = 'auto') {
  const home = os.homedir();
  const allowStable = channel !== 'insiders';
  const allowInsiders = channel !== 'stable';
  let appVersion = null;
  let runningProcesses = [];
  let launcherInstalled = false;

  if (process.platform === 'darwin') {
    const appCandidates =
      channel === 'insiders'
        ? ['/Applications/Antigravity - Insiders.app', path.join(home, 'Applications/Antigravity - Insiders.app')]
        : ['/Applications/Antigravity.app', path.join(home, 'Applications/Antigravity.app'), '/Applications/Antigravity - Insiders.app'];
    for (const appBundle of appCandidates) {
      const infoPlist = path.join(appBundle, 'Contents', 'Info.plist');
      if (!fs.existsSync(infoPlist)) continue;
      try {
        const xml = fs.readFileSync(infoPlist, 'utf8');
        const m = xml.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
        if (m && m[1]) {
          appVersion = m[1].trim();
          break;
        }
      } catch {}
    }
    const launcherApp =
      channel === 'insiders'
        ? path.join(home, 'Applications', 'Antigravity - Insiders (Theme).app')
        : path.join(home, 'Applications', 'Antigravity (Theme).app');
    launcherInstalled = fs.existsSync(path.join(launcherApp, 'Contents', 'MacOS', 'launcher'));

    const ps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', timeout: 2500 });
    if (ps.status === 0 && ps.stdout) {
      for (const line of String(ps.stdout).split(/\r?\n/)) {
        const m = line.trim().match(/^(\d+)\s+(.+)$/);
        if (!m) continue;
        const pid = parseInt(m[1], 10);
        const cmd = m[2];
        if (
          !pid ||
          /--type=|--crashpad|--utility-sub-type=|--import=|sidecar_sdk|--ms-enable-electron-run-as-node/i.test(cmd) ||
          /Helper(?:\s|\.|\/)/i.test(cmd)
        ) {
          continue;
        }
        const appMatch = cmd.match(/^(\/[^\r\n]*?\/Antigravity(?:\s-\sInsiders)?\.app)\/Contents\/MacOS\/(Antigravity(?:\s-\sInsiders)?)(?:\s|$)/);
        if (!appMatch) continue;
        const ch = /Insiders/i.test(appMatch[2]) ? 'insiders' : 'stable';
        if ((ch === 'stable' && !allowStable) || (ch === 'insiders' && !allowInsiders)) continue;
        runningProcesses.push({
          pid,
          channel: ch,
          appPath: appMatch[1],
          exePath: `${appMatch[1]}/Contents/MacOS/${appMatch[2]}`,
          cmd,
          hasCdpFlag: /--remote-debugging-port(?:=|\s|$)/.test(cmd)
        });
      }
    }
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const exeCandidates =
      channel === 'insiders'
        ? [
            path.join(localAppData, 'Programs', 'Antigravity - Insiders', 'Antigravity - Insiders.exe'),
            path.join(progFiles, 'Antigravity - Insiders', 'Antigravity - Insiders.exe')
          ]
        : [
            path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
            path.join(progFiles, 'Antigravity', 'Antigravity.exe'),
            path.join(localAppData, 'Programs', 'Antigravity - Insiders', 'Antigravity - Insiders.exe')
          ];
    const existingExe = exeCandidates.find((p) => fs.existsSync(p)) || '';
    const psProbe = [
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
      `$ErrorActionPreference = 'SilentlyContinue'`,
      `$allowStable = $${allowStable ? 'true' : 'false'}`,
      `$allowInsiders = $${allowInsiders ? 'true' : 'false'}`,
      `$ver = $null`,
      existingExe ? `$ver = (Get-Item -LiteralPath '${existingExe.replace(/'/g, "''")}').VersionInfo.ProductVersion` : '',
      `$procs = @()`,
      `try { $procs = @(Get-CimInstance Win32_Process -Filter "Name = 'Antigravity.exe' OR Name = 'Antigravity - Insiders.exe'" -ErrorAction Stop | Where-Object { $_.CommandLine -notmatch '--type=|--crashpad|--utility-sub-type=|--import=|sidecar_sdk|--ms-enable-electron-run-as-node' } | ForEach-Object { @{ pid = [int]$_.ProcessId; name = [string]$_.Name; exe = [string]$_.ExecutablePath; cmd = [string]$_.CommandLine } }) } catch {}`,
      `if ($procs.Count -eq 0) { $byName = Get-Process -Name 'Antigravity','Antigravity - Insiders' -ErrorAction SilentlyContinue | Group-Object ProcessName; $procs = @(foreach ($g in $byName) { $p = ($g.Group | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1); if ($null -eq $p) { $p = $g.Group | Select-Object -First 1 }; if ($null -ne $p) { $exePath = ''; try { $exePath = [string]$p.Path } catch {}; @{ pid = [int]$p.Id; name = ([string]$p.ProcessName + '.exe'); exe = $exePath; cmd = '' } } }) }`,
      `$lnkOk = $false`,
      `$wsh = New-Object -ComObject WScript.Shell`,
      ...buildWin32LnkSpecsPs(),
      `foreach ($spec in $lnkSpecs) { $dk = ([string]$spec.dir).ToLowerInvariant(); if ($seenLnkDirs.ContainsKey($dk)) { continue }; $seenLnkDirs[$dk] = $true; $items = if ($spec.recurse) { Get-ChildItem -LiteralPath $spec.dir -Filter '*.lnk' -File -Recurse -Depth $spec.depth -ErrorAction SilentlyContinue } else { Get-ChildItem -LiteralPath $spec.dir -Filter '*.lnk' -File -ErrorAction SilentlyContinue }; foreach ($item in $items) { try { $s = $wsh.CreateShortcut($item.FullName); $leaf = [IO.Path]::GetFileName([string]$s.TargetPath); $matchTarget = (($leaf -ieq 'Antigravity.exe' -and $allowStable) -or ($leaf -ieq 'Antigravity - Insiders.exe' -and $allowInsiders)); if ($matchTarget -and ($s.Arguments -match '--remote-debugging-port')) { $lnkOk = $true } } catch {} } }`,
      `@{ appVersion = $ver; launcherInstalled = $lnkOk; procs = $procs } | ConvertTo-Json -Compress -Depth 4`
    ]
      .filter(Boolean)
      .join('\n');
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psProbe], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 6000
    });
    if (r.status === 0 && r.stdout && r.stdout.trim()) {
      try {
        const info = JSON.parse(r.stdout.trim());
        if (info.appVersion) appVersion = String(info.appVersion).trim();
        launcherInstalled = Boolean(info.launcherInstalled);
        const rawProcs = Array.isArray(info.procs) ? info.procs : info.procs ? [info.procs] : [];
        runningProcesses = rawProcs
          .map((p) => {
            const ch = /insiders/i.test(p.name || p.exe || '') ? 'insiders' : 'stable';
            const cmd = String(p.cmd || '');
            return {
              pid: Number(p.pid) || 0,
              channel: ch,
              appPath: '',
              exePath: String(p.exe || existingExe || ''),
              cmd,
              hasCdpFlag: /--remote-debugging-port(?:=|\s|$)/i.test(cmd)
            };
          })
          .filter(
            (p) =>
              p.pid > 0 && ((p.channel === 'stable' && allowStable) || (p.channel === 'insiders' && allowInsiders))
          );
        if (!appVersion && runningProcesses[0]?.exePath && fs.existsSync(runningProcesses[0].exePath)) {
          const vRes = spawnSync(
            'powershell',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (Get-Item -LiteralPath '${runningProcesses[0].exePath.replace(/'/g, "''")}').VersionInfo.ProductVersion`
            ],
            { windowsHide: true, encoding: 'utf8', timeout: 3000 }
          );
          if (vRes.status === 0 && vRes.stdout.trim()) appVersion = vRes.stdout.trim();
        }
      } catch {}
    }
  } else {
    const desktopOverride = path.join(home, '.local', 'share', 'applications', 'antigravity.desktop');
    launcherInstalled =
      fs.existsSync(desktopOverride) && fs.readFileSync(desktopOverride, 'utf8').includes('--remote-debugging-port');
    const pkgCandidates = ['/usr/share/antigravity/resources/app/package.json', '/opt/Antigravity/resources/app/package.json'];
    for (const pkgPath of pkgCandidates) {
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.version) {
            appVersion = String(pkg.version);
            break;
          }
        } catch {}
      }
    }
    const ps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', timeout: 2500 });
    if (ps.status === 0 && ps.stdout) {
      for (const line of String(ps.stdout).split(/\r?\n/)) {
        const m = line.trim().match(/^(\d+)\s+(.+)$/);
        if (!m) continue;
        const pid = parseInt(m[1], 10);
        const cmd = m[2];
        if (
          !pid ||
          /--type=|--crashpad|--utility-sub-type=|--import=|sidecar_sdk|--ms-enable-electron-run-as-node|daemon\.mjs|install\.mjs/i.test(
            cmd
          )
        ) {
          continue;
        }
        const binMatch = cmd.match(/^(\/\S*\/antigravity(?:-insiders)?)(?:\s|$)/i);
        if (!binMatch) continue;
        const ch = /insiders/i.test(binMatch[1]) ? 'insiders' : 'stable';
        if ((ch === 'stable' && !allowStable) || (ch === 'insiders' && !allowInsiders)) continue;
        runningProcesses.push({
          pid,
          channel: ch,
          appPath: '',
          exePath: binMatch[1],
          cmd,
          hasCdpFlag: /--remote-debugging-port(?:=|\s|$)/.test(cmd)
        });
      }
    }
  }

  return { appVersion, runningProcesses, launcherInstalled };
}

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
  const winUserFontsDir =
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')
      : null;
  const winSystemFontsDir =
    process.platform === 'win32' ? path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts') : null;
  const fontDirs =
    process.platform === 'darwin'
      ? [path.join(home, 'Library/Fonts'), '/Library/Fonts']
      : process.platform === 'win32'
      ? [winUserFontsDir, winSystemFontsDir]
      : [path.join(home, '.local/share/fonts'), '/usr/local/share/fonts', '/usr/share/fonts'];

  let allFontFiles = [];
  let userFontFiles = [];
  let systemFontFiles = [];
  for (const d of fontDirs) {
    try {
      if (d && fs.existsSync(d)) {
        const list = fs.readdirSync(d);
        allFontFiles.push(...list);
        if (process.platform === 'win32') {
          if (winUserFontsDir && isSameTargetPath(d, winUserFontsDir)) {
            userFontFiles = list;
          } else if (winSystemFontsDir && isSameTargetPath(d, winSystemFontsDir)) {
            systemFontFiles = list;
          }
        }
      }
    } catch {}
  }

  let winHkcuFontEntries = null;
  if (process.platform === 'win32') {
    winHkcuFontEntries = readWinHkcuFontRegistryEntries();
  }

  const registeredWinUserBasenames = new Set();
  if (Array.isArray(winHkcuFontEntries)) {
    for (const e of winHkcuFontEntries) {
      const rawData = String(e?.data || '').trim();
      if (!rawData) continue;
      const base = path.win32.basename(rawData).toLowerCase();
      if (base) registeredWinUserBasenames.add(base);
    }
  }

  // Windows 下 Chromium local() 只能识别已写入注册表（HKCU\...\Fonts）或系统目录（C:\Windows\Fonts）的字体；
  // 仅手动复制到 AppData\Local\Microsoft\Windows\Fonts 但未写注册表的文件不算“有效已装”
  const effectiveFontFiles =
    process.platform === 'win32' && Array.isArray(winHkcuFontEntries)
      ? [
          ...systemFontFiles,
          ...userFontFiles.filter((f) => registeredWinUserBasenames.has(f.toLowerCase()))
        ]
      : allFontFiles;

  // v5.5.0+ UI 西文直连官方 Google Sans Flex 引擎，本地仅需 Anthropic Serif（对话正文）+ Anthropic Mono（代码）+ Sarasa（中文）
  const hasAnthropicSerifFont = effectiveFontFiles.some((f) => /AnthropicSerif|Anthropic[ _-]Serif/i.test(f));
  const hasAnthropicSerifRegular = effectiveFontFiles.some((f) =>
    /AnthropicSerif.*(Regular|Text)|Anthropic[ _-]Serif.*(Regular|Text)/i.test(f)
  );
  const hasAnthropicSerifBold = effectiveFontFiles.some((f) =>
    /AnthropicSerif.*(Bold|SemiBold)|Anthropic[ _-]Serif.*(Bold|SemiBold)/i.test(f)
  );
  const hasAnthropicMonoFont = effectiveFontFiles.some((f) => /AnthropicMono|Anthropic[ _-]Mono/i.test(f));
  const hasAnthropicFont = hasAnthropicSerifFont && hasAnthropicMonoFont;
  const hasSarasaUiScSplit = effectiveFontFiles.some((f) => /^Sarasa[-_ ]?Ui[-_ ]?SC[-_ ].*\.ttf$/i.test(f));
  const hasSarasaMonoSlabScSplit = effectiveFontFiles.some((f) => /^Sarasa[-_ ]?Mono[-_ ]?Slab[-_ ]?SC[-_ ].*\.ttf$/i.test(f));
  const hasSarasaSplitScTtf = hasSarasaUiScSplit && hasSarasaMonoSlabScSplit;

  const systemWinFontBasenames = new Set(systemFontFiles.map((f) => f.toLowerCase()));
  const targetFontFilePattern = /AnthropicSerif|Anthropic[ _-]Serif|AnthropicMono|Anthropic[ _-]Mono|Sarasa|更纱|更紗/i;
  const unregisteredWinFonts =
    process.platform === 'win32' && Array.isArray(winHkcuFontEntries)
      ? userFontFiles.filter(
          (f) =>
            /\.(ttf|otf|ttc)$/i.test(f) &&
            targetFontFilePattern.test(f) &&
            !(hasSarasaSplitScTtf && /Sarasa.*\.ttc$/i.test(f)) &&
            !registeredWinUserBasenames.has(f.toLowerCase()) &&
            !systemWinFontBasenames.has(f.toLowerCase())
        )
      : [];
  const diskHasSuperTtc = allFontFiles.some((f) => /Sarasa[ _-]?SuperTTC[^\\\/]*\.ttc$/i.test(f));
  const sysHasSuperTtc = systemFontFiles.some((f) => /Sarasa[ _-]?SuperTTC[^\\\/]*\.ttc$/i.test(f));
  const hkcuHasSuperTtc =
    winHkcuFontEntries !== null
      ? winHkcuFontEntries.some(
          (e) => /Sarasa[ _-]?SuperTTC/i.test(e.name) || /Sarasa[ _-]?SuperTTC[^\\\/]*\.ttc$/i.test(e.data)
        )
      : diskHasSuperTtc;
  const hasSarasaSuperTtc =
    process.platform === 'win32' ? Boolean(sysHasSuperTtc || hkcuHasSuperTtc) : diskHasSuperTtc;
  const orphanSuperTtcPendingReboot = Boolean(process.platform === 'win32' && diskHasSuperTtc && !hasSarasaSuperTtc);
  const hasSarasaFont =
    process.platform === 'win32'
      ? Boolean(
          hasSarasaSplitScTtf ||
            hasSarasaSuperTtc ||
            systemFontFiles.some((f) => /Sarasa|更纱|更紗/i.test(f)) ||
            (winHkcuFontEntries !== null &&
              winHkcuFontEntries.some((e) => /Sarasa|更纱|更紗/i.test(e.name) || /Sarasa|更纱|更紗/i.test(e.data)))
        )
      : effectiveFontFiles.some((f) => /Sarasa|更纱|更紗/i.test(f));

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
  const stableInfo = checkSingleChannel('stable');
  const insidersInfo = checkSingleChannel('insiders');
  const chInfo = primaryChannel === 'insiders' ? insidersInfo : stableInfo;
  const channelsMap = {
    stable: stableInfo,
    insiders: insidersInfo
  };
  const hostRuntime = readHostVersionAndProcesses(channel);
  const portFileExists =
    channel === 'stable'
      ? stableInfo.portFileExists
      : channel === 'insiders'
      ? insidersInfo.portFileExists
      : hostRuntime.runningProcesses.length > 0
      ? hostRuntime.runningProcesses.some((p) => channelsMap[p.channel]?.portFileExists)
      : stableInfo.portFileExists || insidersInfo.portFileExists;

  let cdpStatus = 'app_not_running';
  if (hostRuntime.runningProcesses.length > 0) {
    const anyReadyRunning = hostRuntime.runningProcesses.some(
      (p) => p.hasCdpFlag || channelsMap[p.channel]?.portFileExists
    );
    cdpStatus = anyReadyRunning ? 'ready' : 'missing_opt_in_flag';
  } else if (portFileExists) {
    cdpStatus = 'stale_port_file';
  }

  const activeRunningChannel = hostRuntime.runningProcesses[0]?.channel || primaryChannel;
  const preferredPortFile =
    channelsMap[activeRunningChannel]?.portFile ||
    (chInfo.portFileExists ? chInfo.portFile : insidersInfo.portFileExists ? insidersInfo.portFile : chInfo.portFile);

  return {
    nodeVer,
    major,
    minor,
    nodeBasicOk,
    sqliteAvailable,
    tier: sqliteAvailable
      ? 'FULL (>= 22.13, Theme + Google Sans Flex/Sarasa/Serif + i18n + SQLite Live Metrics)'
      : nodeBasicOk
      ? 'STANDARD (22.0~22.12, Theme + Fonts + i18n; SQLite Metrics gracefully disabled)'
      : 'UNSUPPORTED (< 22.0, requires Node 22+)',
    hasAnthropicFont,
    hasAnthropicSerifFont,
    hasAnthropicSerifRegular,
    hasAnthropicSerifBold,
    hasAnthropicMonoFont,
    hasSarasaFont,
    hasSarasaSplitScTtf,
    hasSarasaSuperTtc,
    orphanSuperTtcPendingReboot,
    unregisteredWinFonts,
    winUserFontsDir,
    channel,
    appExists: chInfo.appExists || insidersInfo.appExists || hostRuntime.runningProcesses.length > 0,
    appVersion: hostRuntime.appVersion,
    cdpStatus,
    launcherInstalled: hostRuntime.launcherInstalled,
    runningProcesses: hostRuntime.runningProcesses,
    portFile: preferredPortFile,
    portFileExists,
    channels: channelsMap
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

  const evaluatePageState = (candidate) =>
    new Promise((resolve) => {
      const ws = new WebSocket(candidate.webSocketDebuggerUrl);
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
              expression: `(() => {
                const pills = typeof document !== 'undefined' && typeof document.querySelectorAll === 'function'
                  ? Array.from(document.querySelectorAll('[data-ag-metrics-pill="1"], #ag-live-metrics-pill'))
                  : [];
                const primaryPill = (typeof document !== 'undefined' && document.getElementById('ag-live-metrics-pill')) || pills[0] || null;
                return {
                  __isHost: !!(
                    (window.location && window.location.protocol === 'vscode-file:') ||
                    (window.__APP_CONFIG__ && window.__APP_CONFIG__.productName === 'antigravity') ||
                    (window.electronNative && (
                      (typeof window.electronNative.setTitleBarOverlay === 'function' && window.nativeStorage && typeof window.nativeStorage.getItems === 'function') ||
                      (typeof window.electronNative.getZoomLevel === 'function' && window.electronNative.wcvBrowser && typeof window.electronNative.wcvBrowser.setThemeColor === 'function')
                    )) ||
                    (typeof document !== 'undefined' && typeof document.querySelector === 'function' && document.querySelector('link[href*="/jetbox.css"], body[data-agy-theme], body[data-newux-theme], [id="antigravity.agentSidePanelInputBox"]'))
                  ),
                  version: window.__ag_patch_version || null,
                  bodyReady: window.__ag_body_ready === true,
                  hasStyle: !!document.getElementById('ag-custom-fonts'),
                  hasUserStyle: !!document.getElementById('antigravity-user-custom-style'),
                  preset: document.documentElement ? document.documentElement.getAttribute('data-ag-preset') : null,
                  darkPreset: document.documentElement ? document.documentElement.getAttribute('data-ag-dark-preset') : null,
                  uiLang: document.documentElement ? document.documentElement.getAttribute('data-ag-lang') : null,
                  themeMode: document.documentElement ? document.documentElement.getAttribute('data-ag-theme-mode') : null,
                  pageType: document.documentElement ? document.documentElement.getAttribute('data-ag-page-type') : null,
                  waxSeal: document.documentElement ? document.documentElement.getAttribute('data-ag-wax-seal') : null,
                  dictCount: window.__ag_i18n_dict ? Object.keys(window.__ag_i18n_dict).length : 0,
                  protoSafe: window.__ag_i18n_dict ? Object.getPrototypeOf(window.__ag_i18n_dict) === null : false,
                  pillMounted: pills.length > 0,
                  pillCount: pills.length,
                  pillText: primaryPill ? (primaryPill.textContent || null) : null
                };
              })()`,
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

  let selected = null;
  let firstHostCandidate = null;
  let firstNullCandidate = null;

  for (const candidate of pages) {
    const rawState = await evaluatePageState(candidate);
    if (rawState === null) {
      if (!firstNullCandidate) {
        firstNullCandidate = { page: candidate, state: null };
      }
      continue;
    }
    const isHost = rawState.__isHost === true;
    const cleanState = { ...rawState };
    delete cleanState.__isHost;
    if (isHost) {
      if (cleanState.hasStyle === true) {
        selected = { page: candidate, state: cleanState };
        break;
      }
      if (!firstHostCandidate) {
        firstHostCandidate = { page: candidate, state: cleanState };
      }
    }
  }

  if (!selected) {
    selected = firstHostCandidate || firstNullCandidate;
  }
  if (!selected) {
    return { reachable: true, port, pages: 0, reason: 'No active workbench page target' };
  }

  return {
    reachable: true,
    port,
    targetId: selected.page.id,
    title: selected.page.title,
    state: selected.state
  };
}

// ============================================================================
// 3. M1 跨平台 CDP Opt-in 启动器部署与清理 + 子命令实现
// ============================================================================
function ensureCdpLaunchers(channel = 'auto', options = {}) {
  const home = os.homedir();
  const allowStable = channel !== 'insiders';
  const allowInsiders = channel !== 'stable';
  const withDarwinLauncher = Boolean(options && options.withLauncher);

  if (process.platform === 'darwin') {
    // 默认采用「单图标纯净模式」：不额外生成第二个 .app 图标，全靠 M2 守护进程冷启动自动接力 + relaunch 子命令；
    // 若历史安装曾生成过 (Theme).app，默认自动注销 LaunchServices 索引并移入废纸篓，确保启动台/Spotlight 仅保留唯一官方图标。
    if (!withDarwinLauncher) {
      const cleaned = removeCdpLaunchers();
      return {
        platform: 'darwin',
        mode: 'single-icon-m2-relay',
        launchers: [],
        cleanedLegacyLaunchers: cleaned
      };
    }

    const appsDir = path.join(home, 'Applications');
    const specs = [
      allowStable
        ? {
            channel: 'stable',
            srcApp: ['/Applications/Antigravity.app', path.join(appsDir, 'Antigravity.app')].find((p) => fs.existsSync(p)),
            launcherName: 'Antigravity (Theme).app',
            bundleId: 'com.chuanban.antigravity.theme-launcher',
            displayName: 'Antigravity (Theme)'
          }
        : null,
      allowInsiders
        ? {
            channel: 'insiders',
            srcApp: ['/Applications/Antigravity - Insiders.app', path.join(appsDir, 'Antigravity - Insiders.app')].find(
              (p) => fs.existsSync(p)
            ),
            launcherName: 'Antigravity - Insiders (Theme).app',
            bundleId: 'com.chuanban.antigravity.theme-launcher.insiders',
            displayName: 'Antigravity - Insiders (Theme)'
          }
        : null
    ].filter((s) => s && s.srcApp);

    const created = [];
    for (const spec of specs) {
      try {
        const destApp = path.join(appsDir, spec.launcherName);
        const contentsDir = path.join(destApp, 'Contents');
        const macosDir = path.join(contentsDir, 'MacOS');
        const resDir = path.join(contentsDir, 'Resources');
        fs.mkdirSync(macosDir, { recursive: true });
        fs.mkdirSync(resDir, { recursive: true });

        const srcResDir = path.join(spec.srcApp, 'Contents', 'Resources');
        let iconBase = '';
        if (fs.existsSync(srcResDir)) {
          const icnsCandidate =
            ['icon.icns', 'electron.icns'].find((n) => fs.existsSync(path.join(srcResDir, n))) ||
            fs.readdirSync(srcResDir).find((n) => n.endsWith('.icns')) ||
            '';
          if (icnsCandidate) {
            fs.copyFileSync(path.join(srcResDir, icnsCandidate), path.join(resDir, 'icon.icns'));
            iconBase = 'icon';
          }
        }

        const plistXml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
          '<plist version="1.0">',
          '<dict>',
          '  <key>CFBundleExecutable</key>',
          '  <string>launcher</string>',
          '  <key>CFBundleIdentifier</key>',
          `  <string>${spec.bundleId}</string>`,
          '  <key>CFBundleName</key>',
          `  <string>${spec.displayName}</string>`,
          '  <key>CFBundleDisplayName</key>',
          `  <string>${spec.displayName}</string>`,
          '  <key>CFBundlePackageType</key>',
          '  <string>APPL</string>',
          '  <key>CFBundleShortVersionString</key>',
          '  <string>6.0.3</string>',
          '  <key>CFBundleVersion</key>',
          '  <string>603</string>',
          ...(iconBase ? ['  <key>CFBundleIconFile</key>', `  <string>${iconBase}</string>`] : []),
          '  <key>LSMinimumSystemVersion</key>',
          '  <string>12.0</string>',
          '  <key>LSUIElement</key>',
          '  <true/>',
          '  <key>NSHighResolutionCapable</key>',
          '  <true/>',
          '</dict>',
          '</plist>',
          ''
        ].join('\n');
        fs.writeFileSync(path.join(contentsDir, 'Info.plist'), plistXml, 'utf8');

        const escapedAppPath = spec.srcApp.replace(/(["\\$`])/g, '\\$1');
        const launcherScript = [
          '#!/bin/sh',
          '# Managed by chuanban-antigravity-theme-patch (Optional M1 CDP Opt-in Launcher)',
          `exec /usr/bin/open -a "${escapedAppPath}" --args --remote-debugging-port=0 "$@"`,
          ''
        ].join('\n');
        const binPath = path.join(macosDir, 'launcher');
        fs.writeFileSync(binPath, launcherScript, { encoding: 'utf8', mode: 0o755 });
        fs.chmodSync(binPath, 0o755);

        const lsreg =
          '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
        if (fs.existsSync(lsreg)) {
          spawnSync(lsreg, ['-f', destApp], { stdio: 'ignore', timeout: 4000 });
        }
        created.push(destApp);
      } catch {}
    }
    return { platform: 'darwin', mode: 'optional-m1-launcher', launchers: created };
  }

  if (process.platform === 'win32') {
    const psPatch = [
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
      `$ErrorActionPreference = 'SilentlyContinue'`,
      `$allowStable = $${allowStable ? 'true' : 'false'}`,
      `$allowInsiders = $${allowInsiders ? 'true' : 'false'}`,
      `$wsh = New-Object -ComObject WScript.Shell`,
      ...buildWin32LnkSpecsPs(),
      `$patched = @(); $already = @(); $skipped = @()`,
      `foreach ($spec in $lnkSpecs) {`,
      `  $dk = ([string]$spec.dir).ToLowerInvariant()`,
      `  if ($seenLnkDirs.ContainsKey($dk)) { continue }`,
      `  $seenLnkDirs[$dk] = $true`,
      `  $items = if ($spec.recurse) {`,
      `    Get-ChildItem -LiteralPath $spec.dir -Filter '*.lnk' -File -Recurse -Depth $spec.depth -ErrorAction SilentlyContinue`,
      `  } else {`,
      `    Get-ChildItem -LiteralPath $spec.dir -Filter '*.lnk' -File -ErrorAction SilentlyContinue`,
      `  }`,
      `  foreach ($item in $items) {`,
      `    $lnkPath = $item.FullName`,
      `    try {`,
      `      $sc = $wsh.CreateShortcut($lnkPath)`,
      `      $leaf = [IO.Path]::GetFileName([string]$sc.TargetPath)`,
      `      $isStable = ($leaf -ieq 'Antigravity.exe')`,
      `      $isIns = ($leaf -ieq 'Antigravity - Insiders.exe')`,
      `      if ((-not $isStable -or -not $allowStable) -and (-not $isIns -or -not $allowInsiders)) { continue }`,
      `      $argsStr = [string]$sc.Arguments`,
      `      if ($argsStr -match '--remote-debugging-port') { $already += $lnkPath; continue }`,
      `      $sc.Arguments = if ($argsStr.Trim()) { "$($argsStr.Trim()) --remote-debugging-port=0" } else { '--remote-debugging-port=0' }`,
      `      $sc.Save()`,
      `      $patched += $lnkPath`,
      `    } catch { $skipped += $lnkPath }`,
      `  }`,
      `}`,
      `@{ patched = $patched; already = $already; skipped = $skipped } | ConvertTo-Json -Compress -Depth 3`
    ].join('\n');
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psPatch], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 8000
    });
    try {
      const parsed = JSON.parse(String(r.stdout || '').trim() || '{}');
      const normArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
      return {
        platform: 'win32',
        patched: normArr(parsed.patched),
        already: normArr(parsed.already),
        skipped: normArr(parsed.skipped)
      };
    } catch {
      return { platform: 'win32', patched: [], already: [], skipped: [] };
    }
  }

  if (process.platform === 'linux') {
    const updated = [];
    const sysApps = '/usr/share/applications';
    const userApps = path.join(home, '.local', 'share', 'applications');
    const names = [
      allowStable ? 'antigravity.desktop' : null,
      allowInsiders ? 'antigravity-insiders.desktop' : null
    ].filter(Boolean);
    for (const name of names) {
      try {
        const srcPath = fs.existsSync(path.join(userApps, name))
          ? path.join(userApps, name)
          : path.join(sysApps, name);
        if (!fs.existsSync(srcPath)) continue;
        const raw = fs.readFileSync(srcPath, 'utf8');
        let next = raw.replace(/^(Exec=.*)$/gm, (line) =>
          /--remote-debugging-port/.test(line) ? line : `${line} --remote-debugging-port=0`
        );
        if (!next.includes('# X-Chuanban-Theme-Patch=1')) {
          next = `# X-Chuanban-Theme-Patch=1\n${next}`;
        }
        fs.mkdirSync(userApps, { recursive: true });
        const destPath = path.join(userApps, name);
        fs.writeFileSync(destPath, next, 'utf8');
        updated.push(destPath);
      } catch {}
    }
    return { platform: 'linux', desktopFiles: updated };
  }

  return { platform: process.platform };
}

function removeCdpLaunchers() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    const appsDir = path.join(home, 'Applications');
    const lsreg =
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
    const removed = [];
    for (const name of ['Antigravity (Theme).app', 'Antigravity - Insiders (Theme).app']) {
      const appPath = path.join(appsDir, name);
      const plistPath = path.join(appPath, 'Contents', 'Info.plist');
      if (!fs.existsSync(plistPath)) continue;
      try {
        const xml = fs.readFileSync(plistPath, 'utf8');
        if (!xml.includes('com.chuanban.antigravity.theme-launcher')) continue;
        if (fs.existsSync(lsreg)) {
          spawnSync(lsreg, ['-u', appPath], { stdio: 'ignore', timeout: 4000 });
        }
        if (fs.existsSync('/usr/bin/trash')) {
          spawnSync('/usr/bin/trash', [appPath], { stdio: 'ignore', timeout: 4000 });
        } else {
          fs.rmSync(appPath, { recursive: true, force: true });
        }
        removed.push(appPath);
      } catch {}
    }
    return removed;
  }

  if (process.platform === 'win32') {
    const psClean = [
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`,
      `$ErrorActionPreference = 'SilentlyContinue'`,
      `$wsh = New-Object -ComObject WScript.Shell`,
      ...buildWin32LnkSpecsPs(),
      `foreach ($spec in $lnkSpecs) {`,
      `  $dk = ([string]$spec.dir).ToLowerInvariant()`,
      `  if ($seenLnkDirs.ContainsKey($dk)) { continue }`,
      `  $seenLnkDirs[$dk] = $true`,
      `  $items = if ($spec.recurse) {`,
      `    Get-ChildItem -LiteralPath $spec.dir -Filter '*.lnk' -File -Recurse -Depth $spec.depth -ErrorAction SilentlyContinue`,
      `  } else {`,
      `    Get-ChildItem -LiteralPath $spec.dir -Filter '*.lnk' -File -ErrorAction SilentlyContinue`,
      `  }`,
      `  foreach ($item in $items) {`,
      `    try {`,
      `      $sc = $wsh.CreateShortcut($item.FullName)`,
      `      $leaf = [IO.Path]::GetFileName([string]$sc.TargetPath)`,
      `      if (($leaf -ieq 'Antigravity.exe') -or ($leaf -ieq 'Antigravity - Insiders.exe')) {`,
      `        $orig = [string]$sc.Arguments`,
      `        $clean = ($orig -replace '(^|\\s)--remote-debugging-port(=\\d+)?(\\s|$)', ' ').Trim()`,
      `        if ($clean -ne $orig.Trim()) { $sc.Arguments = $clean; $sc.Save() }`,
      `      }`,
      `    } catch {}`,
      `  }`,
      `}`
    ].join('\n');
    spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psClean], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 8000
    });
    return;
  }

  if (process.platform === 'linux') {
    const userApps = path.join(home, '.local', 'share', 'applications');
    for (const name of ['antigravity.desktop', 'antigravity-insiders.desktop']) {
      const p = path.join(userApps, name);
      if (!fs.existsSync(p)) continue;
      try {
        const raw = fs.readFileSync(p, 'utf8');
        if (raw.includes('# X-Chuanban-Theme-Patch=1')) {
          fs.unlinkSync(p);
        }
      } catch {}
    }
  }
}

function inspectWindowsTaskXmlTriggers(rawXml) {
  const xml = String(rawXml || '').replace(/\0/g, '');
  const settingsBlock = xml.match(/<Settings\b[^>]*>[\s\S]*?<\/Settings>/i)?.[0] || '';
  const taskEnabled = !/<Enabled>\s*false\s*<\/Enabled>/i.test(settingsBlock);
  const isTriggerEnabled = (block) => !/<Enabled>\s*false\s*<\/Enabled>/i.test(block);
  const hasIntervalRepetition = (block) =>
    /<Repetition\b[^>]*>[\s\S]*?<Interval>\s*[^<\s]+\s*<\/Interval>[\s\S]*?<\/Repetition>/i.test(block);
  const timedBlocks = xml.match(/<(?:TimeTrigger|CalendarTrigger)\b[^>]*>[\s\S]*?<\/(?:TimeTrigger|CalendarTrigger)>/gi) || [];
  const hasTimedRepetition = timedBlocks.some((block) => isTriggerEnabled(block) && hasIntervalRepetition(block));
  const logonBlocks = xml.match(/<LogonTrigger\b[^>]*>[\s\S]*?<\/LogonTrigger>/gi) || [];
  const logonHasRepetition = logonBlocks.some((block) => isTriggerEnabled(block) && hasIntervalRepetition(block));
  const legacyLogonOnlyRepetition = logonHasRepetition && !hasTimedRepetition;
  return { taskEnabled, hasTimedRepetition, legacyLogonOnlyRepetition };
}

function inspectWindowsKeepAliveTask(targetDir) {
  if (process.platform !== 'win32') return null;
  try {
    const ps = [
      "try {",
      "  $i = Get-ScheduledTaskInfo -TaskName 'AntigravityThemeDaemon' -ErrorAction Stop;",
      "  [pscustomobject]@{",
      "    registered=$true;",
      "    nextRunTime=$(if($i.NextRunTime){$i.NextRunTime.ToString('o')}else{$null});",
      "    lastRunTime=$(if($i.LastRunTime -and $i.LastRunTime.Year -gt 2000){$i.LastRunTime.ToString('o')}else{$null});",
      "    lastTaskResult=$i.LastTaskResult",
      "  } | ConvertTo-Json -Compress",
      "} catch { '{\"registered\":false}' }"
    ].join(' ');
    const infoRes = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000
    });
    if (infoRes.status !== 0) {
      return {
        registered: null,
        error: String(infoRes.stderr || infoRes.stdout || `powershell exit ${infoRes.status}`).trim()
      };
    }
    const info = JSON.parse(String(infoRes.stdout || '').trim());
    if (!info.registered) {
      return {
        registered: false,
        taskEnabled: false,
        nextRunTime: null,
        lastRunTime: null,
        lastTaskResult: null,
        hasTimedRepetition: false,
        legacyLogonOnlyRepetition: false,
        warning: '未找到 AntigravityThemeDaemon 计划任务，daemon 意外退出后不会被自动拉起'
      };
    }

    const queryRes = spawnSync('schtasks', ['/Query', '/TN', 'AntigravityThemeDaemon', '/XML'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 4000
    });
    if (queryRes.status !== 0) {
      return {
        registered: true,
        taskEnabled: null,
        nextRunTime: info.nextRunTime ?? null,
        lastRunTime: info.lastRunTime ?? null,
        lastTaskResult: info.lastTaskResult ?? null,
        hasTimedRepetition: null,
        legacyLogonOnlyRepetition: null,
        warning: `无法读取 AntigravityThemeDaemon 计划任务 XML（exit ${queryRes.status}）`
      };
    }

    const { taskEnabled, hasTimedRepetition, legacyLogonOnlyRepetition } = inspectWindowsTaskXmlTriggers(queryRes.stdout);

    const installScriptPath = path.join(targetDir || resolveDefaultTargetDir(), 'install.mjs');
    const warning = !taskEnabled
      ? `计划任务 AntigravityThemeDaemon 当前处于禁用状态，保活不会触发；请启用该任务或执行 node "${installScriptPath}" install 重新注册`
      : !hasTimedRepetition
      ? `5 分钟保活只挂在登录触发器上，安装后到下次登录前不会重复；请执行 node "${installScriptPath}" install 重新注册`
      : null;

    return {
      registered: true,
      taskEnabled,
      nextRunTime: info.nextRunTime ?? null,
      lastRunTime: info.lastRunTime ?? null,
      lastTaskResult: info.lastTaskResult ?? null,
      hasTimedRepetition,
      legacyLogonOnlyRepetition,
      warning
    };
  } catch (err) {
    return {
      registered: null,
      error: String(err?.message || err)
    };
  }
}

function buildFontReport(env) {
  const missingFonts = [];
  if (!env.hasAnthropicSerifFont) {
    missingFonts.push('Anthropic Serif (AnthropicSerif-Regular.ttf, AnthropicSerif-Bold.ttf)');
  }
  if (!env.hasAnthropicMonoFont) {
    missingFonts.push('Anthropic Mono (AnthropicMono-Regular.ttf)');
  }
  if (!env.hasSarasaFont) {
    missingFonts.push(
      process.platform === 'win32'
        ? 'Sarasa Gothic (Windows 推荐拆分版 Windows-Sarasa-Split-SC-TTF-v1.0.43.zip，避免 791MB SuperTTC 卡顿)'
        : 'Sarasa Gothic (Sarasa SC Split TTF ZIP 或 Sarasa-SuperTTC.ttc)'
    );
  }
  const allRequiredFontsInstalled = missingFonts.length === 0;
  const superTtcWarning =
    process.platform === 'win32' && env.hasSarasaSuperTtc
      ? `Detected monolithic 791MB Sarasa-SuperTTC.ttc active on Windows; DirectWrite/Chromium may stall 1.5–10.5s on initial weight instantiation and consume >2GB renderer virtual memory. Recommended: run \`node install.mjs install-fonts --auto-download --retire-super-ttc\` (or manually download Windows-Sarasa-Split-SC-TTF-v1.0.43.zip from ${WINDOWS_SARASA_SPLIT_VIEW_URL}).`
      : null;
  const unregisteredFiles = Array.isArray(env.unregisteredWinFonts) ? env.unregisteredWinFonts : [];
  const unregisteredWarning =
    process.platform === 'win32' && unregisteredFiles.length > 0
      ? `Found ${unregisteredFiles.length} font file(s) copied into ${env.winUserFontsDir} without HKCU\\...\\Fonts registry entries (${unregisteredFiles.slice(0, 5).join(', ')}${unregisteredFiles.length > 5 ? ', ...' : ''}). Chromium local() cannot load unregistered Windows user fonts. Fix immediately with: node install.mjs install-fonts --from "${env.winUserFontsDir}"`
      : null;

  const autoDownloadCommand = !allRequiredFontsInstalled
    ? process.platform === 'win32' && env.hasSarasaSuperTtc
      ? 'node install.mjs install-fonts --auto-download --retire-super-ttc'
      : 'node install.mjs install-fonts --auto-download'
    : null;

  return {
    uiLatinEngine: 'Google Sans Flex (native variable font)',
    allRequiredInstalled: allRequiredFontsInstalled,
    anthropicInstalled: env.hasAnthropicFont,
    anthropicSerifInstalled: env.hasAnthropicSerifFont,
    anthropicMonoInstalled: env.hasAnthropicMonoFont,
    sarasaInstalled: env.hasSarasaFont,
    sarasaSplitScInstalled: env.hasSarasaSplitScTtf,
    superTtcActive: env.hasSarasaSuperTtc,
    orphanSuperTtcPendingReboot: env.orphanSuperTtcPendingReboot,
    superTtcWarning,
    unregisteredFiles,
    unregisteredWarning,
    missing: missingFonts,
    autoDownloadCommand,
    downloadUrl: !allRequiredFontsInstalled ? GOOGLE_DRIVE_URL : null,
    directDownloadUrls: !allRequiredFontsInstalled
      ? {
          anthropicSerifRegular: FONT_DOWNLOAD_CATALOG.anthropicSerifRegular.url,
          anthropicSerifBold: FONT_DOWNLOAD_CATALOG.anthropicSerifBold.url,
          anthropicMonoRegular: FONT_DOWNLOAD_CATALOG.anthropicMonoRegular.url,
          sarasaSplitScZip: FONT_DOWNLOAD_CATALOG.sarasaSplitScZip.url,
          sarasaSplitScView: WINDOWS_SARASA_SPLIT_VIEW_URL,
          sarasaGithubReleases: SARASA_GITHUB_RELEASES_URL
        }
      : null
  };
}

function extractBaseSemverTuple(verStr) {
  const m = String(verStr || '').match(/v?(\d+)\.(\d+)\.(\d+)/i);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function compareSemverTuples(a, b) {
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

function inspectSourceSync(sourceDir, targetDir) {
  if (isSameTargetPath(sourceDir, targetDir)) {
    return { sameDirectory: true, inSync: true, sourceOlder: false, outdatedFiles: [] };
  }
  const srcManifestPath = path.join(sourceDir, 'core', 'manifest.json');
  const dstManifestPath = path.join(targetDir, 'core', 'manifest.json');
  if (!fs.existsSync(srcManifestPath)) return null;
  if (!fs.existsSync(dstManifestPath)) {
    return {
      sourceDir,
      targetDir,
      inSync: false,
      sourceOlder: false,
      reason: 'target_manifest_missing',
      outdatedFiles: ['core/manifest.json']
    };
  }
  try {
    const srcManifest = JSON.parse(fs.readFileSync(srcManifestPath, 'utf8'));
    const dstManifest = JSON.parse(fs.readFileSync(dstManifestPath, 'utf8'));
    const fileNames = new Set([
      ...Object.keys(srcManifest.files || {}),
      ...Object.keys(dstManifest.files || {})
    ]);
    const outdatedFiles = [];
    for (const name of fileNames) {
      const srcFile = path.join(sourceDir, 'core', name);
      const dstFile = path.join(targetDir, 'core', name);
      const srcSha = fs.existsSync(srcFile) ? sha256File(srcFile) : null;
      const dstSha = fs.existsSync(dstFile) ? sha256File(dstFile) : null;
      if (srcSha !== dstSha) {
        outdatedFiles.push(`core/${name}`);
      }
    }
    if (sha256File(srcManifestPath) !== sha256File(dstManifestPath)) {
      outdatedFiles.push('core/manifest.json');
    }
    const srcInstaller = path.join(sourceDir, 'install.mjs');
    const dstInstaller = path.join(targetDir, 'install.mjs');
    if (fs.existsSync(srcInstaller) && fs.existsSync(dstInstaller) && sha256File(srcInstaller) !== sha256File(dstInstaller)) {
      outdatedFiles.push('install.mjs');
    }
    const verCmp = compareSemverTuples(
      extractBaseSemverTuple(srcManifest.version),
      extractBaseSemverTuple(dstManifest.version)
    );
    const sourceOlder = verCmp < 0;
    return {
      sourceDir,
      targetDir,
      sourceVersion: srcManifest.version || null,
      targetVersion: dstManifest.version || null,
      sourceOlder,
      inSync: outdatedFiles.length === 0,
      outdatedFiles,
      syncHint:
        outdatedFiles.length > 0 && !sourceOlder
          ? `node ${JSON.stringify(path.join(sourceDir, 'install.mjs'))} install`
          : null
    };
  } catch {
    return null;
  }
}

async function runDoctor() {
  const channel = getArg('--channel', 'auto');
  const defaultTarget = resolveGlobalInstallDir();
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const isCustomSandboxTarget =
    hasFlag('--target-dir') && !isSameTargetPath(targetDir, defaultTarget) && !hasFlag('--register-service');

  const env = await detectEnvironment(channel);
  const integrity = verifyCoreIntegrity(targetDir);
  const sourceSync = inspectSourceSync(__dirname, targetDir);
  const live = await inspectLiveWindow(env);

  const cdpMissingFlag = !isCustomSandboxTarget && !live.reachable && env.cdpStatus === 'missing_opt_in_flag';
  const remediation = cdpMissingFlag ? `node ${JSON.stringify(path.join(targetDir, 'install.mjs'))} relaunch` : null;

  const fontsReport = buildFontReport(env);
  const launcherMode =
    process.platform === 'darwin'
      ? env.launcherInstalled
        ? 'optional-launcher-app'
        : 'single-icon-m2-relay'
      : process.platform === 'win32'
      ? 'in-place-lnk'
      : 'desktop-entry';

  const report = {
    ok: Boolean(env.nodeBasicOk && integrity.ok && !cdpMissingFlag),
    node: {
      version: env.nodeVer,
      execPath: process.execPath,
      serviceExecPath: resolveStableNodeExecPath(),
      tier: env.tier
    },
    fonts: fontsReport,
    antigravity: {
      channel: env.channel,
      appExists: env.appExists,
      appVersion: env.appVersion,
      cdpStatus: live.reachable ? 'ready' : env.cdpStatus,
      launcherMode,
      launcherInstalled: env.launcherInstalled,
      runningProcesses: env.runningProcesses.map(({ cmd: _cmd, ...rest }) => rest),
      remediation,
      portFile: env.portFile,
      portFileExists: env.portFileExists,
      channels: env.channels
    },
    coreIntegrity: {
      targetDir,
      clean: integrity.ok,
      modifiedFiles: integrity.modified,
      ...(sourceSync && !sourceSync.sameDirectory ? { sourceSync } : {})
    },
    keepAliveTask: inspectWindowsKeepAliveTask(targetDir),
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

function sendCooperativeStop(pidPath, pid, waitMs = 1200) {
  try {
    fs.writeFileSync(pidPath, `${pid}\nSTOP`, 'utf8');
    const steps = Math.max(1, Math.ceil(waitMs / 50));
    for (let i = 0; i < steps; i++) {
      sleepSync(50);
      if (!fs.existsSync(pidPath)) return true;
      if (pid > 0) {
        try {
          process.kill(pid, 0);
        } catch (err) {
          if (!err || err.code !== 'EPERM') return true;
        }
      }
    }
  } catch {}
  return false;
}

function stopRunningDaemonProcesses() {
  const tmpDir = os.tmpdir();
  const stopped = [];
  try {
    for (const f of fs.readdirSync(tmpDir)) {
      if (f.startsWith('ag-theme-daemon-') && f.endsWith('.pid')) {
        const pidPath = path.join(tmpDir, f);
        const { pid, startMs, stopRequested } = parsePidFile(pidPath);
        if (!stopRequested && pid > 0) {
          const pidState = checkDaemonPidState(pid, startMs);
          if (pidState === 'confirmed') {
            let killed = false;
            try {
              process.kill(pid, 'SIGTERM');
              for (let i = 0; i < 8; i++) {
                sleepSync(50);
                try {
                  process.kill(pid, 0);
                } catch (e) {
                  if (!e || e.code !== 'EPERM') {
                    killed = true;
                    break;
                  }
                }
              }
            } catch {}
            if (!killed) {
              killed = sendCooperativeStop(pidPath, pid, 1500);
            }
            if (killed) stopped.push(pid);
          } else if (pidState === 'uncertain') {
            // 不对无法确认的进程发送 SIGTERM，但发出协作 STOP 信号等待片刻后无条件移除陈旧 .pid，防止重装自锁
            sendCooperativeStop(pidPath, pid, 350);
          }
        }
        try {
          if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
        } catch {}
      }
    }
  } catch {}
  return stopped;
}

function resolveStableNodeExecPath(execPath = process.execPath, platform = process.platform, home = os.homedir()) {
  if (platform !== 'darwin' && platform !== 'linux') return execPath;
  let realExec = '';
  try {
    realExec = fs.realpathSync(execPath);
  } catch {
    return execPath;
  }

  const dynamicCellarCandidates = [];
  for (const probePath of [execPath, realExec]) {
    const m = String(probePath || '').match(/^(.*)\/Cellar\/([^/]+)\/[^/]+\/bin\/(node)$/i);
    if (m) {
      const brewPrefix = m[1];
      const formula = m[2];
      const binName = m[3];
      dynamicCellarCandidates.push(path.join(brewPrefix, 'bin', binName));
      dynamicCellarCandidates.push(path.join(brewPrefix, 'opt', formula, 'bin', binName));
    }
  }

  const envExtra = process.env.AG_STABLE_NODE_CANDIDATES
    ? String(process.env.AG_STABLE_NODE_CANDIDATES)
        .split(path.delimiter)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const staticCandidates =
    platform === 'darwin'
      ? [
          '/opt/homebrew/bin/node',
          '/usr/local/bin/node',
          '/opt/homebrew/opt/node/bin/node',
          '/usr/local/opt/node/bin/node',
          '/opt/homebrew/opt/node@22/bin/node',
          '/opt/homebrew/opt/node@24/bin/node',
          path.join(home, 'Library', 'Application Support', 'fnm', 'aliases', 'default', 'bin', 'node'),
          path.join(home, '.local', 'share', 'fnm', 'aliases', 'default', 'bin', 'node')
        ]
      : [
          '/home/linuxbrew/.linuxbrew/bin/node',
          '/home/linuxbrew/.linuxbrew/opt/node/bin/node',
          '/usr/local/bin/node',
          '/usr/bin/node',
          path.join(home, '.local', 'share', 'fnm', 'aliases', 'default', 'bin', 'node')
        ];

  const seen = new Set();
  for (const cand of [...envExtra, ...dynamicCellarCandidates, ...staticCandidates]) {
    if (!cand || seen.has(cand)) continue;
    seen.add(cand);
    try {
      if (fs.existsSync(cand) && fs.realpathSync(cand) === realExec) {
        return cand;
      }
    } catch {}
  }
  return execPath;
}

function registerSystemService(targetDir, wrapperDaemon) {
  const home = os.homedir();
  const serviceNodeExec = resolveStableNodeExecPath();
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
        <string>${serviceNodeExec}</string>
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
    return { platform: 'darwin', serviceFile: activePlist, label, nodeExec: serviceNodeExec, runningNow };
  }

  if (process.platform === 'linux') {
    const systemdDir = path.join(home, '.config', 'systemd', 'user');
    fs.mkdirSync(systemdDir, { recursive: true });
    const serviceFile = path.join(systemdDir, 'antigravity-theme.service');
    const unitContent = `[Unit]
Description=Chuanban Antigravity Theme & Live Metrics Daemon
After=default.target

[Service]
ExecStart="${serviceNodeExec}" --disable-warning=ExperimentalWarning "${wrapperDaemon}"
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
    // 传入 --keep-alive：PT5M 周期保活探测到健康守护仍在运行时直接静默退出（不强杀清缓存），仅在进程意外退出/被误杀后自动复活
    const cmd = `""${process.execPath}"" --disable-warning=ExperimentalWarning ""${wrapperDaemon}"" --keep-alive`;
    const vbsContent = `\uFEFFSet WshShell = CreateObject("WScript.Shell")\r\nWshShell.Run "${cmd}", 0, False\r\n`;
    try {
      // 使用 UTF-16LE (带 BOM) 写入本地启动跳板 VBS，彻底兼容 Windows 中文用户名路径 (wscript.exe 原生支持 UTF-16LE)
      fs.writeFileSync(localVbsFile, vbsContent, 'utf16le');
    } catch {}

    // 单一权威自启策略：优先使用带当前用户 <UserId> 与 ME 完整性 SDDL 的 XML 注册 Windows 计划任务，
    // 兼顾非提权（Medium Integrity）终端零报错创建、跨完整性覆盖与脱离沙盒 Job Object；成功后清理旧版残留避免多路争抢！
    let autostartMethod = 'none';
    let scheduledTaskStarted = false;
    let taskSettingsUpdated = false;
    let taskEnabled = null;
    let taskHasTimedRepetition = null;
    let taskUpdateError = null;
    let taskUpdateWarning = null;
    const xmlEsc = (s) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    let userAuthor = (process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\` : '') + (process.env.USERNAME || os.userInfo().username);
    let userSid = '';
    try {
      const whoRes = spawnSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
      if (whoRes.status === 0) {
        const m = String(whoRes.stdout || '').trim().match(/^"([^"]+)","(S-1-[^"]+)"/);
        if (m) {
          userAuthor = m[1];
          userSid = m[2];
        }
      }
    } catch {}
    const principalId = userSid || userAuthor;
    const sddl = `D:(A;;FA;;;BA)(A;;FA;;;SY)(A;;FA;;;IU)${userSid ? `(A;;FA;;;${userSid})` : ''}S:(ML;;NW;;;ME)`;
    // LogonTrigger 上的 Repetition 要等登录事件发生后才开始，install/升级在登录之后执行，所以下次登录前不会重复；
    // 改由 TimeTrigger 承载每 5 分钟的重复，不写 Duration 即无限期；
    // 首次周期触发在 StartBoundary+5min，install 末尾的 /Run 会立即补跑一次。
    const pad2 = (n) => String(n).padStart(2, '0');
    const nowLocal = new Date();
    const startBoundary = `${nowLocal.getFullYear()}-${pad2(nowLocal.getMonth() + 1)}-${pad2(nowLocal.getDate())}T${pad2(nowLocal.getHours())}:${pad2(nowLocal.getMinutes())}:00`;
    const taskXml = [
      '\uFEFF<?xml version="1.0" encoding="UTF-16"?>',
      '<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
      '  <RegistrationInfo>',
      `    <Author>${xmlEsc(userAuthor)}</Author>`,
      '    <URI>\\AntigravityThemeDaemon</URI>',
      `    <SecurityDescriptor>${xmlEsc(sddl)}</SecurityDescriptor>`,
      '  </RegistrationInfo>',
      '  <Principals>',
      '    <Principal id="Author">',
      `      <UserId>${xmlEsc(principalId)}</UserId>`,
      '      <LogonType>InteractiveToken</LogonType>',
      '      <RunLevel>LeastPrivilege</RunLevel>',
      '    </Principal>',
      '  </Principals>',
      '  <Settings>',
      '    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>',
      '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
      '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
      '    <StartWhenAvailable>true</StartWhenAvailable>',
      '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
      '    <Enabled>true</Enabled>',
      '    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>',
      '  </Settings>',
      '  <Triggers>',
      '    <LogonTrigger>',
      '      <Enabled>true</Enabled>',
      `      <UserId>${xmlEsc(principalId)}</UserId>`,
      '    </LogonTrigger>',
      '    <TimeTrigger>',
      '      <Repetition>',
      '        <Interval>PT5M</Interval>',
      '        <StopAtDurationEnd>false</StopAtDurationEnd>',
      '      </Repetition>',
      `      <StartBoundary>${startBoundary}</StartBoundary>`,
      '      <Enabled>true</Enabled>',
      '    </TimeTrigger>',
      '    <SessionStateChangeTrigger>',
      '      <Enabled>true</Enabled>',
      '      <StateChange>SessionUnlock</StateChange>',
      `      <UserId>${xmlEsc(principalId)}</UserId>`,
      '    </SessionStateChangeTrigger>',
      '  </Triggers>',
      '  <Actions Context="Author">',
      '    <Exec>',
      '      <Command>wscript.exe</Command>',
      `      <Arguments>//B //NoLogo &quot;${xmlEsc(localVbsFile)}&quot;</Arguments>`,
      '    </Exec>',
      '  </Actions>',
      '</Task>',
      ''
    ].join('\r\n');

    const tmpXmlPath = path.join(os.tmpdir(), `ag-theme-task-${process.pid}.xml`);
    try {
      fs.writeFileSync(tmpXmlPath, taskXml, 'utf16le');
      const createRes = spawnSync('schtasks', ['/Create', '/TN', 'AntigravityThemeDaemon', '/XML', tmpXmlPath, '/F'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 6000
      });
      if (createRes.status === 0) {
        autostartMethod = 'schtasks';
        taskSettingsUpdated = true;
        taskEnabled = true;
        taskHasTimedRepetition = true;
      } else {
        taskUpdateError =
          String(createRes.stderr || createRes.stdout || '').trim() || `schtasks /Create exited with code ${createRes.status}`;
        // 兼容旧版高完整性创建的无 SDDL 计划任务：若同名任务已存在且指向当前 VBS，直接复用而不降级写 HKCU\Run 制造双路并发
        const queryRes = spawnSync('schtasks', ['/Query', '/TN', 'AntigravityThemeDaemon', '/XML'], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 4000
        });
        if (
          queryRes.status === 0 &&
          String(queryRes.stdout || '')
            .replace(/\0/g, '')
            .toLowerCase()
            .includes('antigravitythemedaemon.vbs')
        ) {
          autostartMethod = 'schtasks';
          const triggerCheck = inspectWindowsTaskXmlTriggers(queryRes.stdout);
          taskEnabled = triggerCheck.taskEnabled;
          taskHasTimedRepetition = triggerCheck.hasTimedRepetition;
          if (!triggerCheck.taskEnabled || !triggerCheck.hasTimedRepetition) {
            const installScriptPath = path.join(targetDir, 'install.mjs');
            const reason = !triggerCheck.taskEnabled
              ? '现有任务当前处于禁用状态（<Settings><Enabled>false</Enabled>）'
              : '现有任务缺少定时重复触发器（安装后至下次登录前 5 分钟保活不会生效）';
            taskUpdateWarning = `未能覆盖更新计划任务 AntigravityThemeDaemon（可能因旧任务由管理员权限创建），且${reason}。请以管理员身份运行 node "${installScriptPath}" install，或先管理员执行 schtasks /Delete /TN AntigravityThemeDaemon /F 后重装。`;
          }
        }
      }
    } catch (err) {
      taskUpdateError = taskUpdateError || String(err?.message || err);
    } finally {
      try {
        if (fs.existsSync(tmpXmlPath)) fs.unlinkSync(tmpXmlPath);
      } catch {}
    }

    if (autostartMethod === 'schtasks') {
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

      try {
        const runRes = spawnSync('schtasks', ['/Run', '/TN', 'AntigravityThemeDaemon'], {
          stdio: 'ignore',
          windowsHide: true,
          timeout: 5000
        });
        if (runRes.status === 0) {
          const tmpDir = os.tmpdir();
          for (let i = 0; i < 15; i++) {
            sleepSync(100);
            const hasLivePid = fs.readdirSync(tmpDir).some((f) => {
              if (!f.startsWith('ag-theme-daemon-') || !f.endsWith('.pid')) return false;
              const parsed = parsePidFile(path.join(tmpDir, f));
              return !parsed.stopRequested && parsed.pid > 0;
            });
            if (hasLivePid) {
              scheduledTaskStarted = true;
              break;
            }
          }
        }
      } catch {}
    }

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
        // 固定工作目录为用户主目录，避免后台进程继承调用方终端的 CWD 导致该目录被占用无法删除
        const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', wrapperDaemon], {
          cwd: os.homedir(),
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
      taskSettingsUpdated,
      taskEnabled,
      hasTimedRepetition: taskHasTimedRepetition,
      taskUpdateError,
      taskUpdateWarning,
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
  const darkPreset = getArg('--dark-preset', null);
  const syncUser = hasFlag('--sync-user');
  const defaultTarget = resolveGlobalInstallDir();
  const targetDir = path.resolve(getArg('--target-dir', defaultTarget));
  const isCustomSandboxTarget =
    hasFlag('--target-dir') && !isSameTargetPath(targetDir, defaultTarget) && !hasFlag('--register-service');

  const VALID_LIGHT_PRESETS = new Set([
    'native',
    'morandi',
    'absolutely',
    'high-contrast',
    'claude-desktop-purewhite',
    'vintage-deep'
  ]);
  const VALID_DARK_PRESETS = new Set(['onyx', 'claude-warm']);
  if (preset && !VALID_LIGHT_PRESETS.has(preset)) {
    console.error(
      `[ERROR] Invalid --preset "${preset}". Expected one of: native, morandi, absolutely, claude-desktop-purewhite, vintage-deep.`
    );
    process.exit(1);
  }
  if (darkPreset && !VALID_DARK_PRESETS.has(darkPreset)) {
    console.error(`[ERROR] Invalid --dark-preset "${darkPreset}". Expected one of: onyx, claude-warm.`);
    process.exit(1);
  }

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
  let userBackupCreated = null;
  if (!isSameTargetPath(__dirname, targetDir)) {
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

    // user/ 层默认永不覆盖已有文件；仅在显式传入 --sync-user 时先备份旧 user/ 再按标准 4 模板白名单同步
    const USER_TEMPLATE_FILES = ['config.json', 'custom.css', 'i18n.override.json', 'custom.js'];
    if (syncUser && fs.existsSync(targetUser)) {
      const userStamp = new Date().toISOString().replace(/[:.]/g, '-') + '-user';
      const stampedUserBackupDir = path.join(backupsDir, userStamp);
      fs.mkdirSync(backupsDir, { recursive: true });
      copyDirRecursive(targetUser, stampedUserBackupDir);
      userBackupCreated = stampedUserBackupDir;
    }
    fs.mkdirSync(targetUser, { recursive: true });
    for (const item of USER_TEMPLATE_FILES) {
      const s = path.join(srcUser, item);
      const d = path.join(targetUser, item);
      if (fs.existsSync(s) && (!fs.existsSync(d) || syncUser)) {
        fs.copyFileSync(s, d);
      }
    }

    for (const docFile of ['install.mjs', 'SKILL.md', 'README.md', 'CHANGELOG.md']) {
      const s = path.join(__dirname, docFile);
      const d = path.join(targetDir, docFile);
      if (fs.existsSync(s)) fs.copyFileSync(s, d);
    }
  }

  // 更新 user/config.json（仅在显式传入 CLI 参数或首次初始化时更新对应字段，保留用户自定义；兼容 Windows 记事本 UTF-8 BOM）
  const userConfigPath = path.join(targetUser, 'config.json');
  let currentCfg = {};
  let canWriteUserCfg = true;
  if (fs.existsSync(userConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(userConfigPath, 'utf8').replace(/^\uFEFF/, ''));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        currentCfg = parsed;
      } else {
        canWriteUserCfg = false;
      }
    } catch {
      canWriteUserCfg = false;
      console.warn('[Install] Warning: existing user/config.json is invalid JSON; leaving it untouched to prevent data loss.');
    }
  }
  if (typeof currentCfg.enabled !== 'boolean') currentCfg.enabled = true;
  if (cliChannel) {
    currentCfg.channel = cliChannel;
  } else if (!currentCfg.channel) {
    currentCfg.channel = 'auto';
  }
  if (preset) {
    currentCfg.preset = preset === 'high-contrast' ? 'morandi' : preset;
  } else if (!currentCfg.preset || currentCfg.preset === 'high-contrast') {
    currentCfg.preset = 'morandi';
  }
  if (darkPreset) {
    currentCfg.darkPreset = darkPreset;
  } else if (!currentCfg.darkPreset) {
    currentCfg.darkPreset = 'onyx';
  }
  if (!currentCfg.modules || typeof currentCfg.modules !== 'object' || Array.isArray(currentCfg.modules)) {
    currentCfg.modules = {};
  }
  for (const modKey of [
    'i18n',
    'metrics',
    'composerWaxSeal',
    'deadlockHealer',
    'coldBootHealer',
    'zoomShortcuts',
    'cdpAutoRelaunch',
    'customCss',
    'customJs'
  ]) {
    if (typeof currentCfg.modules[modKey] !== 'boolean') {
      currentCfg.modules[modKey] = true;
    }
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
  if (canWriteUserCfg) {
    fs.writeFileSync(userConfigPath, JSON.stringify(currentCfg, null, 2) + '\n', 'utf8');
  }

  const realDaemon = path.join(targetCore, 'daemon.mjs');
  let argvStatus = { skipped: true, reason: 'custom-target-dir' };
  let launcherStatus = { skipped: true, reason: 'custom-target-dir' };
  let serviceInfo = { skipped: true, reason: 'custom-target-dir' };

  if (!isCustomSandboxTarget) {
    // 自动检查并修补 ~/.antigravity/argv.json (兼容 1.x) 与 M1 跨平台单图标参数/可选启动器 (2.33.0+)
    argvStatus = ensureArgvRemoteDebugging(currentCfg.channel);
    launcherStatus = ensureCdpLaunchers(currentCfg.channel, { withLauncher: hasFlag('--with-launcher') });

    // 创建兼容包装脚本 ~/.gemini/antigravity/scripts/antigravity-font-daemon.mjs（使用 pathToFileURL 兼容 Windows C:\ 路径）
    const scriptsDir = path.join(os.homedir(), '.gemini', 'antigravity', 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    const wrapperDaemon = path.join(scriptsDir, 'antigravity-font-daemon.mjs');
    const realDaemonUrl = pathToFileURL(realDaemon).href;
    fs.writeFileSync(
      wrapperDaemon,
      `#!/usr/bin/env node\n// Auto-generated wrapper -> ${realDaemon}\nawait import(${JSON.stringify(realDaemonUrl)});\n`,
      { encoding: 'utf8', mode: 0o755 }
    );

    // 注册/更新跨平台自启服务
    serviceInfo = registerSystemService(targetDir, wrapperDaemon);

    // 立即执行一次 --once 同步注入
    spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', realDaemon, '--once'], {
      stdio: 'inherit'
    });
  }

  const postEnv = isCustomSandboxTarget ? env : await detectEnvironment(currentCfg.channel);
  const live = isCustomSandboxTarget ? { skipped: true, reason: 'custom-target-dir' } : await inspectLiveWindow(postEnv);
  const fontsReport = buildFontReport(postEnv);
  const needsCdpRelaunch =
    !isCustomSandboxTarget && !live.reachable && postEnv.cdpStatus === 'missing_opt_in_flag';
  const keepAliveUpgradeWarning =
    !isCustomSandboxTarget && serviceInfo && typeof serviceInfo === 'object' ? serviceInfo.taskUpdateWarning || null : null;
  const warnings = keepAliveUpgradeWarning ? [keepAliveUpgradeWarning] : [];
  if (!fontsReport.allRequiredInstalled) {
    warnings.push(
      `Missing required fonts (${fontsReport.missing.join('; ')}). Run: node ${JSON.stringify(path.join(targetDir, 'install.mjs'))} install-fonts --auto-download`
    );
  }
  if (fontsReport.unregisteredWarning) {
    warnings.push(fontsReport.unregisteredWarning);
  }
  const installOk = !keepAliveUpgradeWarning;
  console.log(
    '\n[Install Complete]',
    JSON.stringify(
      {
        ok: installOk,
        targetDir,
        backupCreated,
        userSynced: syncUser,
        userBackupCreated,
        argvStatus,
        launcherStatus,
        serviceInfo,
        fonts: fontsReport,
        warnings,
        config: currentCfg,
        cdpStatus: isCustomSandboxTarget ? 'sandbox' : live.reachable ? 'ready' : postEnv.cdpStatus,
        relaunchHint: needsCdpRelaunch
          ? `Antigravity (${postEnv.appVersion || '2.33.0+'}) is currently running without --remote-debugging-port. When idle, run: node ${JSON.stringify(path.join(targetDir, 'install.mjs'))} relaunch`
          : null,
        liveWindow: live
      },
      null,
      2
    )
  );
  if (keepAliveUpgradeWarning) {
    console.warn(`\n[WARN] ${keepAliveUpgradeWarning}`);
    process.exitCode = 1;
  }
  if (!fontsReport.allRequiredInstalled) {
    console.warn(
      `\n[WARN] Missing fonts detected: ${fontsReport.missing.join(' | ')}\n       Auto-download & install: node ${JSON.stringify(path.join(targetDir, 'install.mjs'))} install-fonts --auto-download`
    );
  }
}

function hasRecentActiveConversationWal(channel = 'auto', windowSec = 15) {
  const home = os.homedir();
  const dirs = [];
  if (channel !== 'insiders') dirs.push(path.join(home, '.gemini', 'antigravity', 'conversations'));
  if (channel !== 'stable') dirs.push(path.join(home, '.gemini', 'antigravity-insiders', 'conversations'));
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const activeFiles = [];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.db-wal')) continue;
        const full = path.join(dir, name);
        const st = fs.statSync(full, { throwIfNoEntry: false });
        if (st && st.size > 4096 && now - st.mtimeMs < windowMs) {
          activeFiles.push({ file: name, ageMs: Math.round(now - st.mtimeMs), bytes: st.size });
        }
      }
    } catch {}
  }
  return activeFiles;
}

function isPidRunning(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
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

async function runRelaunch() {
  const channel = getArg('--channel', 'auto');
  const force = hasFlag('--force');
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const daemonPath = path.join(targetDir, 'core', 'daemon.mjs');

  if (!force) {
    const activeWals = hasRecentActiveConversationWal(channel, 15);
    if (activeWals.length > 0) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            reason: 'active_conversation_detected',
            activeWals,
            hint: 'An Agent conversation updated its WAL within the last 15s. Wait until the turn finishes, or pass --force to relaunch anyway.'
          },
          null,
          2
        )
      );
      process.exit(2);
    }
  }

  const hostBefore = readHostVersionAndProcesses(channel);
  const procsToStop = hostBefore.runningProcesses;
  const home = os.homedir();

  // 写入防重入冷却锁，告知后台守护进程 M2 本次为主动接力重启
  const guardFile = path.join(os.tmpdir(), 'ag-cdp-relaunch-guard.json');
  try {
    const prevGuard = fs.existsSync(guardFile) ? JSON.parse(fs.readFileSync(guardFile, 'utf8')) : {};
    const prevHandled = Array.isArray(prevGuard.handledPids) ? prevGuard.handledPids : [];
    fs.writeFileSync(
      guardFile,
      JSON.stringify(
        {
          lastRelaunchAtMs: Date.now(),
          lastChannel: channel,
          reason: 'manual-cli-relaunch',
          handledPids: Array.from(new Set([...prevHandled.slice(-15), ...procsToStop.map((p) => p.pid)]))
        },
        null,
        2
      ) + '\n',
      'utf8'
    );
  } catch {}

  let launchTarget = procsToStop[0] || null;
  if (!launchTarget) {
    if (process.platform === 'darwin') {
      const appPath =
        channel === 'insiders'
          ? '/Applications/Antigravity - Insiders.app'
          : ['/Applications/Antigravity.app', path.join(home, 'Applications/Antigravity.app')].find((p) =>
              fs.existsSync(p)
            ) || '/Applications/Antigravity.app';
      launchTarget = { channel: channel === 'insiders' ? 'insiders' : 'stable', appPath, exePath: '' };
    } else if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
      const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
      const cands =
        channel === 'insiders'
          ? [
              path.join(localAppData, 'Programs', 'Antigravity - Insiders', 'Antigravity - Insiders.exe'),
              path.join(progFiles, 'Antigravity - Insiders', 'Antigravity - Insiders.exe')
            ]
          : [
              path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
              path.join(progFiles, 'Antigravity', 'Antigravity.exe')
            ];
      const exePath = cands.find((p) => fs.existsSync(p)) || '';
      launchTarget = { channel: channel === 'insiders' ? 'insiders' : 'stable', appPath: '', exePath };
    } else {
      const exePath = ['/usr/bin/antigravity', '/usr/local/bin/antigravity', '/opt/Antigravity/antigravity'].find((p) =>
        fs.existsSync(p)
      );
      launchTarget = { channel: 'stable', appPath: '', exePath: exePath || 'antigravity' };
    }
  }

  // 在终止旧主进程之前提前构建重启计划（确保 Linux 下 /proc/<pid>/cmdline 存活可读）
  const relaunchPlan = buildRelaunchPlan(launchTarget.cmd, launchTarget);

  for (const p of procsToStop) {
    if (process.platform === 'darwin' && p.appPath) {
      spawnSync('osascript', ['-e', `tell application "${p.appPath}" to quit`], { stdio: 'ignore', timeout: 3000 });
      for (let i = 0; i < 25 && isPidRunning(p.pid); i++) sleepSync(100);
    } else if (process.platform === 'win32') {
      const stopPs = `$gp = Get-Process -Id ${p.pid} -ErrorAction SilentlyContinue; if ($gp) { [void]$gp.CloseMainWindow(); if (-not $gp.WaitForExit(1800)) { Stop-Process -Id ${p.pid} -Force -ErrorAction SilentlyContinue } }`;
      spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', stopPs], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5000
      });
    }
    if (isPidRunning(p.pid)) {
      try {
        process.kill(p.pid, 'SIGTERM');
      } catch {}
      for (let i = 0; i < 35 && isPidRunning(p.pid); i++) sleepSync(100);
    }
    if (isPidRunning(p.pid) && process.platform !== 'win32') {
      try {
        process.kill(p.pid, 'SIGKILL');
      } catch {}
      for (let i = 0; i < 15 && isPidRunning(p.pid); i++) sleepSync(80);
    }
  }

  // 确保 Electron SingletonLock 完全释放后再启动带 --remote-debugging-port=0 的新宿主实例
  sleepSync(250);

  if (process.platform === 'darwin' && launchTarget.appPath) {
    spawnSync('/usr/bin/open', ['-a', launchTarget.appPath, '--args', ...relaunchPlan.args], {
      env: relaunchPlan.env,
      stdio: 'ignore',
      timeout: 5000
    });
  } else if (launchTarget.exePath) {
    const child = spawn(launchTarget.exePath, relaunchPlan.args, {
      cwd: os.homedir(),
      env: relaunchPlan.env,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.unref();
  } else {
    console.error(JSON.stringify({ ok: false, reason: 'executable_not_found' }, null, 2));
    process.exit(1);
  }

  let live = { reachable: false };
  for (let i = 0; i < 30; i++) {
    sleepSync(500);
    const curEnv = await detectEnvironment(launchTarget.channel || channel);
    const targetChInfo = curEnv.channels?.[launchTarget.channel || 'stable'];
    if (targetChInfo && !targetChInfo.portFileExists) continue;
    if (fs.existsSync(daemonPath)) {
      spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', daemonPath, '--once'], {
        stdio: 'ignore',
        windowsHide: true
      });
    }
    live = await inspectLiveWindow(curEnv);
    if (live.reachable && live.state?.hasStyle) break;
  }

  const ok = Boolean(live.reachable && live.state?.hasStyle);
  console.log(
    JSON.stringify(
      {
        ok,
        stoppedPids: procsToStop.map((p) => p.pid),
        proxySource: relaunchPlan.proxySource,
        preservedProxyArgs: relaunchPlan.preservedProxyArgs.map(redactProxyCredentials),
        version: live.state?.version || null,
        themeStyle: Boolean(live.state?.hasStyle),
        dictCount: live.state?.dictCount || 0,
        pillMounted: Boolean(live.state?.pillMounted),
        live
      },
      null,
      2
    )
  );
  if (!ok) process.exit(1);
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
  const fontsReport = buildFontReport(env);
  const ok = Boolean(live.reachable && (live.state?.hasStyle || live.pages === 0));
  console.log(
    JSON.stringify(
      {
        ok,
        version: live.state?.version || null,
        themeStyle: Boolean(live.state?.hasStyle),
        safeMode,
        channel,
        fonts: {
          allRequiredInstalled: fontsReport.allRequiredInstalled,
          missing: fontsReport.missing,
          unregisteredFiles: fontsReport.unregisteredFiles,
          autoDownloadCommand: fontsReport.autoDownloadCommand
        },
        live
      },
      null,
      2
    )
  );
}

async function runRollback() {
  const defaultTarget = resolveGlobalInstallDir();
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const isCustomSandboxTarget =
    hasFlag('--target-dir') && !isSameTargetPath(targetDir, defaultTarget) && !hasFlag('--register-service');
  const targetCore = path.join(targetDir, 'core');
  const targetPrev = path.join(targetDir, 'core.prev');
  const backupsDir = path.join(targetDir, 'backups');

  const isValidCoreBackup = (dir) =>
    fs.existsSync(path.join(dir, 'daemon.mjs')) && fs.existsSync(path.join(dir, 'runtime.js'));

  let restoreSource = null;
  if (isValidCoreBackup(targetPrev)) {
    restoreSource = targetPrev;
  } else if (fs.existsSync(backupsDir)) {
    const stamps = fs
      .readdirSync(backupsDir)
      .filter((name) => !name.endsWith('-user') && isValidCoreBackup(path.join(backupsDir, name)))
      .sort()
      .reverse();
    if (stamps.length > 0) {
      restoreSource = path.join(backupsDir, stamps[0]);
    }
  }

  if (!restoreSource) {
    console.error(`[ERROR] No valid core backup found at ${targetPrev} or ${backupsDir}`);
    process.exit(1);
  }

  fs.rmSync(targetCore, { recursive: true, force: true });
  copyDirRecursive(restoreSource, targetCore);

  // 重启守护进程并立即执行一次 --once 重新注入（沙箱 --target-dir 隔离模式下跳过全局服务干预）
  const realDaemon = path.join(targetCore, 'daemon.mjs');
  const wrapperDaemon = path.join(os.homedir(), '.gemini', 'antigravity', 'scripts', 'antigravity-font-daemon.mjs');
  if (!isCustomSandboxTarget) {
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
            cwd: os.homedir(),
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
  }

  const env = await detectEnvironment('auto');
  const live = isCustomSandboxTarget ? { skipped: true, reason: 'custom-target-dir' } : await inspectLiveWindow(env);
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

let _cachedWinSystemProxy = undefined;
function detectWindowsSystemProxy() {
  if (process.platform !== 'win32') return null;
  if (_cachedWinSystemProxy !== undefined) return _cachedWinSystemProxy;
  _cachedWinSystemProxy = null;
  const envHasProxy = Boolean(
    process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy
  );
  if (envHasProxy) return null;
  try {
    const r = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
      { encoding: 'utf8', windowsHide: true, timeout: 4000 }
    );
    if (r.status !== 0 || !r.stdout) return null;
    const out = String(r.stdout);
    const enabledMatch = out.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-f]+)/i);
    if (!enabledMatch || parseInt(enabledMatch[1], 16) !== 1) return null;
    const serverMatch = out.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i);
    if (!serverMatch) return null;
    const raw = serverMatch[1].trim();
    if (!raw) return null;
    let picked = raw;
    if (raw.includes('=')) {
      const pairs = raw.split(';').map((s) => s.trim()).filter(Boolean);
      const map = Object.create(null);
      for (const p of pairs) {
        const idx = p.indexOf('=');
        if (idx > 0) map[p.slice(0, idx).trim().toLowerCase()] = p.slice(idx + 1).trim();
      }
      if (map.https) picked = map.https;
      else if (map.http) picked = map.http;
      else if (map.socks) picked = map.socks.includes('://') ? map.socks : `socks5h://${map.socks}`;
      else picked = pairs[0].slice(pairs[0].indexOf('=') + 1).trim();
    }
    if (picked && !/^[a-z0-9+.-]+:\/\//i.test(picked)) {
      picked = `http://${picked}`;
    }
    _cachedWinSystemProxy = picked || null;
  } catch {
    _cachedWinSystemProxy = null;
  }
  return _cachedWinSystemProxy;
}

function sha256FileChunked(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.allocUnsafe(256 * 1024);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(bytesRead === buf.length ? buf : buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function validateDownloadedBinary(filePath, { kind = 'font', minBytes = 1024, sha256 = null } = {}) {
  try {
    if (!fs.existsSync(filePath)) return { ok: false, reason: 'file_missing', bytes: 0 };
    const st = fs.statSync(filePath);
    const bytes = st.size;
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(Math.min(512, Math.max(0, bytes)));
    try {
      if (head.length > 0) fs.readSync(fd, head, 0, head.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    const asciiPrefix = head.toString('utf8').trimStart().toLowerCase();
    if (asciiPrefix.startsWith('<!doctype') || asciiPrefix.startsWith('<html') || asciiPrefix.startsWith('<?xml')) {
      const isQuotaExceeded = /quota exceeded|too many users have viewed or downloaded/i.test(asciiPrefix);
      return {
        ok: false,
        reason: isQuotaExceeded ? 'quota_exceeded_html' : 'html_interstitial_or_quota_exceeded',
        bytes,
        circuitBreakMirror: true
      };
    }
    if (bytes < minBytes) {
      return { ok: false, reason: 'file_too_small', bytes, minBytes };
    }
    if (kind === 'zip') {
      const isZip = head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
      if (!isZip) return { ok: false, reason: 'invalid_zip_magic', bytes };
    } else if (kind === 'font') {
      const tag = head.length >= 4 ? head.subarray(0, 4).toString('ascii') : '';
      const isTtf = head.length >= 4 && head[0] === 0x00 && head[1] === 0x01 && head[2] === 0x00 && head[3] === 0x00;
      const isValidFont = isTtf || tag === 'OTTO' || tag === 'true' || tag === 'ttcf';
      if (!isValidFont) return { ok: false, reason: 'invalid_font_magic', bytes };
    }
    if (sha256) {
      const actualSha = sha256FileChunked(filePath);
      if (actualSha.toLowerCase() !== String(sha256).toLowerCase()) {
        return {
          ok: false,
          reason: 'sha256_mismatch',
          bytes,
          expectedSha256: String(sha256).toLowerCase(),
          actualSha256: actualSha
        };
      }
      return { ok: true, bytes, sha256: actualSha };
    }
    return { ok: true, bytes };
  } catch (err) {
    return { ok: false, reason: 'validation_error', error: String(err?.message || err), bytes: 0 };
  }
}

function resolveAssetMirrors(asset, { preferredMirror = null, mirrorOrder = null } = {}) {
  const baseMirrors =
    Array.isArray(asset.mirrors) && asset.mirrors.length > 0
      ? asset.mirrors.map((m) => ({ id: m.id || 'default', url: m.url }))
      : [{ id: 'default', url: asset.url }];

  if (Array.isArray(mirrorOrder) && mirrorOrder.length > 0) {
    const ordered = [];
    const seen = new Set();
    for (const id of mirrorOrder) {
      const found = baseMirrors.find((m) => m.id === id);
      if (found && !seen.has(found.id)) {
        ordered.push(found);
        seen.add(found.id);
      }
    }
    for (const m of baseMirrors) {
      if (!seen.has(m.id)) {
        ordered.push(m);
        seen.add(m.id);
      }
    }
    return ordered;
  }

  if (preferredMirror) {
    const exact = baseMirrors.filter((m) => m.id === preferredMirror);
    if (exact.length > 0) {
      const rest = baseMirrors.filter((m) => m.id !== preferredMirror);
      return [...exact, ...rest];
    }
  }
  return baseMirrors;
}

function shouldCircuitBreakMirror(attempt) {
  if (!attempt) return false;
  if (attempt.circuitBreakMirror) return true;
  if (attempt.reason === 'quota_exceeded_html' || attempt.reason === 'html_interstitial_or_quota_exceeded') return true;
  if (attempt.reason === 'sha256_mismatch') return true;
  const httpStatus = Number(attempt.httpStatus || 0);
  if ([401, 403, 404, 410, 429, 451].includes(httpStatus)) return true;
  const errStr = String(attempt.error || '');
  if (/\b(403|404|410|429)\b/.test(errStr) && /requested URL returned error|status code/i.test(errStr)) return true;
  return false;
}

async function downloadFontAsset(
  asset,
  downloadDir,
  { force = false, preferredMirror = null, mirrorOrder = null } = {}
) {
  fs.mkdirSync(downloadDir, { recursive: true });
  const finalPath = path.join(downloadDir, asset.filename);
  if (!force && fs.existsSync(finalPath)) {
    const cachedCheck = validateDownloadedBinary(finalPath, asset);
    if (cachedCheck.ok) {
      return {
        ok: true,
        id: asset.id,
        filename: asset.filename,
        filePath: finalPath,
        cached: true,
        bytes: cachedCheck.bytes,
        ...(cachedCheck.sha256 ? { sha256: cachedCheck.sha256 } : {}),
        method: 'cache'
      };
    }
  }

  const partPath = `${finalPath}.part-${process.pid}-${Date.now()}`;
  const cleanupPart = () => {
    try {
      if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
    } catch {}
  };
  const timeoutSec = asset.timeoutSec || 300;
  const mirrors = resolveAssetMirrors(asset, { preferredMirror, mirrorOrder });
  const attempts = [];

  for (const mirror of mirrors) {
    let mirrorCircuitBroken = false;
    const recordAttemptAndCheckBreak = (entry) => {
      const fullEntry = { mirror: mirror.id, url: mirror.url, ...entry };
      attempts.push(fullEntry);
      if (shouldCircuitBreakMirror(fullEntry)) {
        mirrorCircuitBroken = true;
        process.stderr.write(
          `[Fonts] Mirror "${mirror.id}" rejected ${asset.filename} (${fullEntry.reason || fullEntry.httpStatus || fullEntry.error || 'blocked'}), switching to next mirror...\n`
        );
      }
    };

    // Strategy 1: curl / curl.exe（跨平台原生支持 HTTP_PROXY/HTTPS_PROXY，Windows 下自动探测系统注册表代理）
    try {
      const curlBin = process.platform === 'win32' ? 'curl.exe' : 'curl';
      const winProxy = detectWindowsSystemProxy();
      const curlArgs = [
        '-fSL',
        '--retry',
        '1',
        '--retry-delay',
        '2',
        '--connect-timeout',
        '15',
        '--max-time',
        String(timeoutSec)
      ];
      if (winProxy) curlArgs.push('--proxy', winProxy);
      curlArgs.push('-o', partPath, mirror.url);
      const r = spawnSync(curlBin, curlArgs, {
        stdio: ['ignore', 'ignore', 'pipe'],
        encoding: 'utf8',
        windowsHide: true,
        timeout: (timeoutSec + 15) * 1000
      });
      if (r.status === 0 && !r.error) {
        const chk = validateDownloadedBinary(partPath, asset);
        if (chk.ok) {
          fs.renameSync(partPath, finalPath);
          return {
            ok: true,
            id: asset.id,
            filename: asset.filename,
            filePath: finalPath,
            cached: false,
            bytes: chk.bytes,
            ...(chk.sha256 ? { sha256: chk.sha256 } : {}),
            mirror: mirror.id,
            url: mirror.url,
            method: winProxy ? 'curl(win-system-proxy)' : 'curl',
            ...(attempts.length > 0 ? { failoverAttempts: attempts } : {})
          };
        }
        recordAttemptAndCheckBreak({ method: 'curl', ok: false, ...chk });
      } else {
        recordAttemptAndCheckBreak({
          method: 'curl',
          ok: false,
          status: r.status,
          error: String(r.error?.message || r.stderr || '').trim().slice(0, 240)
        });
      }
    } catch (err) {
      recordAttemptAndCheckBreak({ method: 'curl', ok: false, error: String(err?.message || err).slice(0, 240) });
    }
    cleanupPart();
    if (mirrorCircuitBroken) continue;

    // Strategy 2 (Windows): PowerShell .NET HttpClient（原生继承 WinINET/PAC/系统代理与 TLS 1.2+，流式落盘零高内存）
    if (process.platform === 'win32') {
      const cfgTmp = path.join(os.tmpdir(), `ag-dl-cfg-${process.pid}-${Date.now()}.json`);
      try {
        fs.writeFileSync(cfgTmp, JSON.stringify({ url: mirror.url, out: partPath, timeoutSec }), 'utf8');
        const psScript = [
          '$ErrorActionPreference = "Stop"',
          '[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12',
          'Add-Type -AssemblyName System.Net.Http',
          `$cfg = Get-Content -LiteralPath '${cfgTmp.replace(/'/g, "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json`,
          '$handler = New-Object System.Net.Http.HttpClientHandler',
          '$handler.AllowAutoRedirect = $true',
          '$handler.UseProxy = $true',
          '$client = New-Object System.Net.Http.HttpClient($handler)',
          '$client.Timeout = [TimeSpan]::FromSeconds([int]$cfg.timeoutSec)',
          'try {',
          '  $resp = $client.GetAsync([string]$cfg.url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()',
          '  $resp.EnsureSuccessStatusCode() | Out-Null',
          '  $inStream = $resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()',
          '  $outStream = [System.IO.File]::Create([string]$cfg.out)',
          '  try { $inStream.CopyTo($outStream) } finally { $outStream.Dispose(); $inStream.Dispose() }',
          '} finally { $client.Dispose(); $handler.Dispose() }'
        ].join('\n');
        const r = spawnSync(
          'powershell',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
          {
            stdio: ['ignore', 'ignore', 'pipe'],
            encoding: 'utf8',
            windowsHide: true,
            timeout: (timeoutSec + 20) * 1000
          }
        );
        if (r.status === 0 && !r.error) {
          const chk = validateDownloadedBinary(partPath, asset);
          if (chk.ok) {
            fs.renameSync(partPath, finalPath);
            return {
              ok: true,
              id: asset.id,
              filename: asset.filename,
              filePath: finalPath,
              cached: false,
              bytes: chk.bytes,
              ...(chk.sha256 ? { sha256: chk.sha256 } : {}),
              mirror: mirror.id,
              url: mirror.url,
              method: 'powershell-httpclient',
              ...(attempts.length > 0 ? { failoverAttempts: attempts } : {})
            };
          }
          recordAttemptAndCheckBreak({ method: 'powershell-httpclient', ok: false, ...chk });
        } else {
          recordAttemptAndCheckBreak({
            method: 'powershell-httpclient',
            ok: false,
            status: r.status,
            error: String(r.error?.message || r.stderr || '').trim().slice(0, 240)
          });
        }
      } catch (err) {
        recordAttemptAndCheckBreak({
          method: 'powershell-httpclient',
          ok: false,
          error: String(err?.message || err).slice(0, 240)
        });
      } finally {
        try {
          if (fs.existsSync(cfgTmp)) fs.unlinkSync(cfgTmp);
        } catch {}
      }
      cleanupPart();
      if (mirrorCircuitBroken) continue;
    }

    // Strategy 3: Node 22+ 原生 fetch 流式下载兜底
    try {
      const res = await fetch(mirror.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutSec * 1000)
      });
      if (!res.ok || !res.body) {
        recordAttemptAndCheckBreak({ method: 'node-fetch', ok: false, httpStatus: res.status });
      } else {
        await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(partPath));
        const chk = validateDownloadedBinary(partPath, asset);
        if (chk.ok) {
          fs.renameSync(partPath, finalPath);
          return {
            ok: true,
            id: asset.id,
            filename: asset.filename,
            filePath: finalPath,
            cached: false,
            bytes: chk.bytes,
            ...(chk.sha256 ? { sha256: chk.sha256 } : {}),
            mirror: mirror.id,
            url: mirror.url,
            method: 'node-fetch',
            ...(attempts.length > 0 ? { failoverAttempts: attempts } : {})
          };
        }
        recordAttemptAndCheckBreak({ method: 'node-fetch', ok: false, ...chk });
      }
    } catch (err) {
      recordAttemptAndCheckBreak({ method: 'node-fetch', ok: false, error: String(err?.message || err).slice(0, 240) });
    }
    cleanupPart();
  }

  return {
    ok: false,
    id: asset.id,
    filename: asset.filename,
    url: mirrors[0]?.url || asset.url,
    mirrors: mirrors.map((m) => ({ id: m.id, url: m.url })),
    manualUrl: asset.viewUrl || mirrors[0]?.url || GOOGLE_DRIVE_URL,
    attempts
  };
}

function extractZipArchive(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    const cfgTmp = path.join(os.tmpdir(), `ag-unzip-cfg-${process.pid}-${Date.now()}.json`);
    try {
      fs.writeFileSync(cfgTmp, JSON.stringify({ zip: path.resolve(zipPath), dest: path.resolve(destDir) }), 'utf8');
      const psUnzip = [
        '$ErrorActionPreference = "Stop"',
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        `$cfg = Get-Content -LiteralPath '${cfgTmp.replace(/'/g, "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json`,
        '[System.IO.Compression.ZipFile]::ExtractToDirectory([string]$cfg.zip, [string]$cfg.dest)'
      ].join('\n');
      const r = spawnSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psUnzip],
        { encoding: 'utf8', windowsHide: true, timeout: 120000 }
      );
      if (r.status === 0 && !r.error) return { ok: true, method: 'dotnet-zipfile' };
      return { ok: false, error: String(r.error?.message || r.stderr || 'ZipFile extract failed').trim().slice(0, 240) };
    } finally {
      try {
        if (fs.existsSync(cfgTmp)) fs.unlinkSync(cfgTmp);
      } catch {}
    }
  }

  const uz = spawnSync('unzip', ['-oq', zipPath, '-d', destDir], { encoding: 'utf8', timeout: 120000 });
  if (uz.status === 0 && !uz.error) return { ok: true, method: 'unzip' };
  if (process.platform === 'darwin') {
    const dt = spawnSync('ditto', ['-xk', zipPath, destDir], { encoding: 'utf8', timeout: 120000 });
    if (dt.status === 0 && !dt.error) return { ok: true, method: 'ditto' };
  }
  const py = spawnSync('python3', ['-m', 'zipfile', '-e', zipPath, destDir], { encoding: 'utf8', timeout: 120000 });
  if (py.status === 0 && !py.error) return { ok: true, method: 'python3-zipfile' };
  return {
    ok: false,
    error: String(uz.stderr || py.stderr || uz.error?.message || 'Failed to extract zip archive').trim().slice(0, 240)
  };
}

function selectMissingFontAssets(env, { includeAll = false, useSuperTtc = false, wantSplitSarasa = false } = {}) {
  const assets = [];
  if (includeAll || !env.hasAnthropicSerifFont || !env.hasAnthropicSerifRegular) {
    if (includeAll || !env.hasAnthropicSerifFont || (!env.hasAnthropicSerifRegular && env.hasAnthropicSerifBold)) {
      assets.push(FONT_DOWNLOAD_CATALOG.anthropicSerifRegular);
    }
  }
  if (includeAll || !env.hasAnthropicSerifFont || !env.hasAnthropicSerifBold) {
    if (includeAll || !env.hasAnthropicSerifFont || (env.hasAnthropicSerifRegular && !env.hasAnthropicSerifBold)) {
      assets.push(FONT_DOWNLOAD_CATALOG.anthropicSerifBold);
    }
  }
  if (includeAll || !env.hasAnthropicMonoFont) {
    assets.push(FONT_DOWNLOAD_CATALOG.anthropicMonoRegular);
  }
  const needSarasa = includeAll || !env.hasSarasaFont || (wantSplitSarasa && !env.hasSarasaSplitScTtf);
  if (needSarasa) {
    if (useSuperTtc && process.platform !== 'win32') {
      assets.push(FONT_DOWNLOAD_CATALOG.sarasaSuperTtc);
    } else {
      assets.push(FONT_DOWNLOAD_CATALOG.sarasaSplitScZip);
    }
  }
  return assets;
}

async function downloadFontsBatch({
  downloadDir,
  includeAll = false,
  force = false,
  useSuperTtc = false,
  wantSplitSarasa = false,
  preferredMirror = null,
  mirrorOrder = null
} = {}) {
  const env = await detectEnvironment('auto');
  const assets = selectMissingFontAssets(env, { includeAll, useSuperTtc, wantSplitSarasa });
  const targetDownloadDir = path.resolve(downloadDir || path.join(os.tmpdir(), 'chuanban-ag-fonts-cache'));
  fs.mkdirSync(targetDownloadDir, { recursive: true });
  const results = [];
  for (const asset of assets) {
    process.stderr.write(`[Fonts] Downloading ${asset.filename} ...\n`);
    const r = await downloadFontAsset(asset, targetDownloadDir, { force, preferredMirror, mirrorOrder });
    results.push(r);
  }
  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    downloadDir: targetDownloadDir,
    requestedCount: assets.length,
    downloadedCount: results.filter((r) => r.ok && !r.cached).length,
    cachedCount: results.filter((r) => r.ok && r.cached).length,
    failedCount: failed.length,
    results,
    manualFallbackHint:
      failed.length > 0
        ? `Automatic download failed for ${failed.map((f) => f.filename).join(', ')} (likely terminal network/proxy restriction). Download manually in browser from Cloudflare R2 (${R2_SARASA_SPLIT_URL}), GitHub Release (${GITHUB_SARASA_SPLIT_URL}), or Google Drive (${GOOGLE_DRIVE_URL}), then run: node install.mjs install-fonts --from "<downloaded-folder-or-zip>"`
        : null
  };
}

function parseMirrorOrderArg() {
  const raw = getArg('--mirror-order', null);
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

async function runDownloadFontsCmd() {
  const downloadDir = getArg('--dir', path.join(os.tmpdir(), 'chuanban-ag-fonts-cache'));
  const includeAll = hasFlag('--all');
  const force = hasFlag('--force');
  const useSuperTtc = hasFlag('--super-ttc');
  const preferredMirror = getArg('--mirror', null);
  const mirrorOrder = parseMirrorOrderArg();
  const summary = await downloadFontsBatch({
    downloadDir,
    includeAll,
    force,
    useSuperTtc,
    preferredMirror,
    mirrorOrder
  });
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

async function runInstallFonts() {
  const autoDownload = hasFlag('--auto-download');
  const fromArg = getArg('--from', null);
  const shouldRetireSuperTtc = process.platform === 'win32' && hasFlag('--retire-super-ttc');

  if (!autoDownload && !fromArg) {
    console.error(
      'Usage:\n  node install.mjs install-fonts --auto-download [--dir <cache-dir>] [--force] [--retire-super-ttc]\n  node install.mjs install-fonts --from <font-folder-or-zip-path> [--retire-super-ttc]'
    );
    process.exit(1);
  }
  if (fromArg && !fs.existsSync(fromArg)) {
    console.error(`[ERROR] --from path does not exist: ${fromArg}`);
    process.exit(1);
  }

  let downloadSummary = null;
  const sourceInputs = [];
  if (fromArg) sourceInputs.push(path.resolve(fromArg));
  if (autoDownload) {
    const preEnv = await detectEnvironment('auto');
    downloadSummary = await downloadFontsBatch({
      downloadDir: getArg('--dir', null),
      includeAll: hasFlag('--all'),
      force: hasFlag('--force'),
      useSuperTtc: hasFlag('--super-ttc'),
      wantSplitSarasa: shouldRetireSuperTtc,
      preferredMirror: getArg('--mirror', null),
      mirrorOrder: parseMirrorOrderArg()
    });
    if (downloadSummary.requestedCount > 0) {
      for (const r of downloadSummary.results) {
        if (r.ok && r.filePath && fs.existsSync(r.filePath)) {
          sourceInputs.push(r.filePath);
        }
      }
    }
    // Windows 下如果已有手动复制但未写注册表的目标用户字体，仅将其精准加入队列补齐注册表（避免误扫整个目录或重新注册已退订的 SuperTTC）
    if (
      process.platform === 'win32' &&
      Array.isArray(preEnv.unregisteredWinFonts) &&
      preEnv.unregisteredWinFonts.length > 0 &&
      preEnv.winUserFontsDir &&
      fs.existsSync(preEnv.winUserFontsDir)
    ) {
      for (const fname of preEnv.unregisteredWinFonts) {
        const fp = path.join(preEnv.winUserFontsDir, fname);
        if (fs.existsSync(fp)) sourceInputs.push(fp);
      }
    }
    if (downloadSummary.requestedCount === 0 && sourceInputs.length === 0) {
      const superTtcRetirement = shouldRetireSuperTtc
        ? retireWindowsSuperTtc({ force: hasFlag('--force') })
        : null;
      const postEnv = await detectEnvironment('auto');
      console.log(
        JSON.stringify(
          {
            ok: true,
            alreadyInstalled: true,
            platform: process.platform,
            downloadSummary,
            ...(superTtcRetirement ? { superTtcRetirement } : {}),
            postCheck: buildFontReport(postEnv)
          },
          null,
          2
        )
      );
      return;
    }
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
  const skippedLocked = [];
  const extractedArchives = [];
  const archiveExtractErrors = [];
  const tempExtractDirs = [];
  const fontFileQueue = [];
  const seenSourceFiles = new Set();

  const collectFontsFromDir = (dir, depth = 0) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (entry === '__MACOSX') continue;
        collectFontsFromDir(full, depth + 1);
      } else if (/\.(ttf|otf|ttc)$/i.test(entry)) {
        const key = canonicalPath(full).toLowerCase();
        if (!seenSourceFiles.has(key)) {
          seenSourceFiles.add(key);
          fontFileQueue.push({ full, entry });
        }
      } else if (depth <= 2 && /\.zip$/i.test(entry) && /sarasa|anthropic|font/i.test(entry)) {
        const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-font-zip-'));
        tempExtractDirs.push(stageDir);
        const ex = extractZipArchive(full, stageDir);
        if (ex.ok) {
          extractedArchives.push({ archive: full, method: ex.method });
          collectFontsFromDir(stageDir, depth + 1);
        } else {
          archiveExtractErrors.push({ archive: full, error: ex.error });
        }
      }
    }
  };

  try {
    for (const src of sourceInputs) {
      const st = fs.statSync(src);
      if (st.isFile()) {
        if (/\.zip$/i.test(src)) {
          const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-font-zip-'));
          tempExtractDirs.push(stageDir);
          const ex = extractZipArchive(src, stageDir);
          if (ex.ok) {
            extractedArchives.push({ archive: src, method: ex.method });
            collectFontsFromDir(stageDir, 0);
          } else {
            archiveExtractErrors.push({ archive: src, error: ex.error });
          }
        } else if (/\.(ttf|otf|ttc)$/i.test(src)) {
          const key = canonicalPath(src).toLowerCase();
          if (!seenSourceFiles.has(key)) {
            seenSourceFiles.add(key);
            fontFileQueue.push({ full: src, entry: path.basename(src) });
          }
        }
      } else if (st.isDirectory()) {
        collectFontsFromDir(src, 0);
      }
    }

    const seenDestPaths = new Set();
    for (const { full, entry } of fontFileQueue) {
      const destPath = path.join(destDir, entry);
      const destKey = canonicalPath(destPath).toLowerCase();
      if (seenDestPaths.has(destKey)) continue;
      seenDestPaths.add(destKey);
      let copied = false;
      if (isSameTargetPath(full, destPath)) {
        skippedLocked.push(destPath);
      } else {
        try {
          fs.copyFileSync(full, destPath);
          copied = true;
        } catch (err) {
          if (
            process.platform === 'win32' &&
            (err?.code === 'EBUSY' || err?.code === 'EPERM' || err?.code === 'EACCES') &&
            fs.existsSync(destPath)
          ) {
            skippedLocked.push(destPath);
          } else {
            throw err;
          }
        }
      }
      if (copied) installed.push(destPath);
    }
  } finally {
    for (const d of tempExtractDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {}
    }
  }

  const allTargetFontPaths = Array.from(new Set([...installed, ...skippedLocked]));
  let fontBroadcastOk = process.platform !== 'win32';
  let fontRegisteredCount = 0;
  let registryWrittenCount = process.platform === 'win32' ? 0 : allTargetFontPaths.length;
  let registryFailed = [];

  if (process.platform === 'win32' && allTargetFontPaths.length > 0) {
    fontBroadcastOk = false;
    const regItems = allTargetFontPaths.map((destPath) => {
      const entry = path.basename(destPath);
      const ext = path.extname(entry).toLowerCase();
      const typeSuffix = ext === '.otf' ? ' (OpenType)' : ' (TrueType)';
      const title = entry.replace(/\.(ttf|otf|ttc)$/i, '') + typeSuffix;
      return { path: destPath, title };
    });
    const listTmp = path.join(os.tmpdir(), `ag-fonts-${process.pid}-${Date.now()}.json`);
    try {
      fs.writeFileSync(listTmp, JSON.stringify(regItems), 'utf8');
      // 使用 .NET Microsoft.Win32.Registry UTF-16 原生写入 HKCU\...\Fonts（规避中文用户名下 reg.exe CP936 路径乱码），并合并广播 WM_FONTCHANGE
      const psNotify = [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '$ErrorActionPreference = "Stop"',
        'Add-Type -TypeDefinition @"',
        'using System; using System.Runtime.InteropServices;',
        'public static class AgFontBroadcast {',
        '  [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern int AddFontResource(string lpFileName);',
        '  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern bool SendNotifyMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);',
        '}',
        '"@',
        `$parsed = Get-Content -LiteralPath '${listTmp.replace(/'/g, "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json`,
        '$items = @($parsed)',
        '$regOk = 0',
        '$regFailed = New-Object System.Collections.Generic.List[string]',
        '$sk = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts")',
        'if ($null -ne $sk) {',
        '  try {',
        '    foreach ($it in $items) {',
        '      if ($null -eq $it -or -not $it.path -or -not $it.title) { continue }',
        '      try {',
        '        $sk.SetValue([string]$it.title, [string]$it.path, [Microsoft.Win32.RegistryValueKind]::String)',
        '        $regOk++',
        '      } catch { $regFailed.Add([string]$it.title) }',
        '    }',
        '  } finally { $sk.Dispose() }',
        '} else {',
        '  foreach ($it in $items) { if ($it.title) { $regFailed.Add([string]$it.title) } }',
        '}',
        '$added = 0',
        'foreach ($it in $items) { if ($it -and $it.path -and ([AgFontBroadcast]::AddFontResource([string]$it.path) -gt 0)) { $added++ } }',
        '$notified = [AgFontBroadcast]::SendNotifyMessage([IntPtr]0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero)',
        '[PSCustomObject]@{ regOk = $regOk; regFailed = @($regFailed); added = $added; notified = [bool]$notified } | ConvertTo-Json -Compress'
      ].join('\n');
      const psRes = spawnSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psNotify],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 30000
        }
      );
      if (psRes.status === 0) {
        const notifyData = JSON.parse(String(psRes.stdout || '').trim() || '{}');
        registryWrittenCount = Number(notifyData.regOk) || 0;
        registryFailed = Array.isArray(notifyData.regFailed)
          ? notifyData.regFailed
          : notifyData.regFailed
          ? [String(notifyData.regFailed)]
          : [];
        fontRegisteredCount = Number(notifyData.added) || 0;
        fontBroadcastOk = fontRegisteredCount > 0 && Boolean(notifyData.notified);
      } else {
        registryFailed = regItems.map((i) => i.title);
      }
    } catch {
      registryFailed = regItems.map((i) => i.title);
    } finally {
      try {
        if (fs.existsSync(listTmp)) fs.unlinkSync(listTmp);
      } catch {}
    }
  } else if (process.platform === 'linux' && allTargetFontPaths.length > 0) {
    try {
      execSync('fc-cache -f 2>/dev/null || true');
    } catch {}
  }

  const superTtcRetirement = shouldRetireSuperTtc
    ? retireWindowsSuperTtc({ destDir, force: hasFlag('--force') })
    : null;
  const postEnv = await detectEnvironment('auto');
  const postCheck = buildFontReport(postEnv);

  const noFontsFound = allTargetFontPaths.length === 0;
  const winRegistryFailed = process.platform === 'win32' && allTargetFontPaths.length > 0 && registryWrittenCount === 0;
  const downloadFailed = Boolean(downloadSummary && !downloadSummary.ok);
  const ok = !noFontsFound && !winRegistryFailed && !downloadFailed;
  const failureReason = downloadFailed
    ? 'font_download_failed'
    : noFontsFound
    ? 'no_font_files_found'
    : winRegistryFailed
    ? 'windows_font_registry_failed'
    : null;
  const restartAntigravityRequired = Boolean(
    process.platform === 'win32' && allTargetFontPaths.length > 0 && postEnv.runningProcesses.length > 0
  );

  console.log(
    JSON.stringify(
      {
        ok,
        ...(failureReason ? { reason: failureReason } : {}),
        platform: process.platform,
        destDir,
        installedCount: installed.length,
        skippedLockedCount: skippedLocked.length,
        registryWrittenCount,
        ...(registryFailed.length > 0 ? { registryFailed } : {}),
        fontRegisteredCount,
        fontBroadcastOk,
        ...(extractedArchives.length > 0 ? { extractedArchives } : {}),
        ...(archiveExtractErrors.length > 0 ? { archiveExtractErrors } : {}),
        ...(downloadSummary ? { downloadSummary } : {}),
        installed,
        skippedLocked,
        ...(superTtcRetirement ? { superTtcRetirement } : {}),
        restartAntigravityRequired,
        ...(restartAntigravityRequired
          ? {
              restartHint:
                'Windows DirectWrite caches system fonts per process. Restart Antigravity once (e.g. `node install.mjs relaunch` when idle) for newly installed fonts to take effect.'
            }
          : {}),
        postCheck
      },
      null,
      2
    )
  );
  if (!ok) {
    process.exitCode = 1;
  }
}

function readWinHkcuFontRegistryEntries() {
  if (process.platform !== 'win32') return null;
  try {
    const ps = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$sk = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts", $false)',
      'if ($null -eq $sk) { Write-Output "[]"; exit 0 }',
      'try {',
      '  $items = @(foreach ($n in $sk.GetValueNames()) {',
      '    if ($n) { [PSCustomObject]@{ name = [string]$n; data = [string]$sk.GetValue($n) } }',
      '  })',
      '  if ($items.Count -eq 0) { Write-Output "[]" } else { ConvertTo-Json -InputObject $items -Compress }',
      '} finally { $sk.Dispose() }'
    ].join('\n');
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 12000
    });
    if (r.status === 0) {
      const parsed = JSON.parse(String(r.stdout || '').trim() || '[]');
      return Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {}
  // PowerShell 被策略拦截或超时时降级到 reg query 只读兜底
  try {
    const rq = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    });
    if (rq.status === 0 && rq.stdout) {
      const items = [];
      for (const line of String(rq.stdout).split(/\r?\n/)) {
        const m = line.match(/^\s+(.+?)\s+REG_SZ\s+(.+?)\s*$/);
        if (m) items.push({ name: m[1].trim(), data: m[2].trim() });
      }
      return items;
    }
  } catch {}
  return null;
}

function retireWindowsSuperTtc({ destDir = null, force = false } = {}) {
  if (process.platform !== 'win32') {
    return { ok: true, skipped: true, reason: 'non-win32' };
  }
  const home = os.homedir();
  const userFontsDir =
    destDir || path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts');
  let userFontList = [];
  try {
    if (fs.existsSync(userFontsDir)) userFontList = fs.readdirSync(userFontsDir);
  } catch {}
  const hasUiSplit = userFontList.some((f) => /^Sarasa[-_ ]?Ui[-_ ]?SC[-_ ].*\.ttf$/i.test(f));
  const hasMonoSplit = userFontList.some((f) => /^Sarasa[-_ ]?Mono[-_ ]?Slab[-_ ]?SC[-_ ].*\.ttf$/i.test(f));
  if (!force && (!hasUiSplit || !hasMonoSplit)) {
    return {
      ok: false,
      reason: 'split_sc_ttf_missing',
      hint: 'Install SarasaUiSC-*.ttf and SarasaMonoSlabSC-*.ttf first (or pass --force) before retiring Sarasa-SuperTTC.ttc.'
    };
  }

  const removedRegistryValues = [];
  const candidateTtcPaths = new Set();
  for (const f of userFontList) {
    if (/^Sarasa[ _-]?SuperTTC[^\\\/]*\.ttc$/i.test(f)) {
      candidateTtcPaths.add(path.join(userFontsDir, f));
    }
  }

  let gdiRemovedCount = 0;
  let broadcastOk = false;
  try {
    const seedTmp = path.join(os.tmpdir(), `ag-retire-ttc-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(seedTmp, JSON.stringify({ userFontsDir, initialPaths: Array.from(candidateTtcPaths) }), 'utf8');
    try {
      const psRetire = [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '$ErrorActionPreference = "SilentlyContinue"',
        'Add-Type -TypeDefinition @"',
        'using System; using System.Runtime.InteropServices;',
        'public static class AgFontRetire {',
        '  [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern bool RemoveFontResource(string lpFileName);',
        '  [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern bool SendNotifyMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);',
        '}',
        '"@',
        `$seed = Get-Content -LiteralPath '${seedTmp.replace(/'/g, "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json`,
        '$paths = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)',
        'foreach ($p in @($seed.initialPaths)) { if ($p) { [void]$paths.Add([string]$p) } }',
        '$removedNames = New-Object System.Collections.Generic.List[string]',
        '$sk = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts", $true)',
        'if ($null -ne $sk) {',
        '  try {',
        '    foreach ($n in @($sk.GetValueNames())) {',
        '      if (-not $n) { continue }',
        '      $d = [string]$sk.GetValue($n)',
        '      if (($n -match "Sarasa[ _-]?SuperTTC") -or ($d -match "Sarasa[ _-]?SuperTTC[^\\\\/]*\\.ttc$")) {',
        '        if ($d -and ($d -match "\\.ttc$")) {',
        '          $full = if ([System.IO.Path]::IsPathRooted($d)) { $d } else { Join-Path ([string]$seed.userFontsDir) $d }',
        '          [void]$paths.Add($full)',
        '        }',
        '        $sk.DeleteValue($n, $false)',
        '        if ($null -eq $sk.GetValue($n, $null)) { $removedNames.Add([string]$n) }',
        '      }',
        '    }',
        '  } finally { $sk.Dispose() }',
        '}',
        '$rem = 0',
        '$notified = $false',
        'if ($paths.Count -gt 0 -or $removedNames.Count -gt 0) {',
        '  foreach ($fp in $paths) { if ($fp) { for ($i = 0; $i -lt 4; $i++) { if ([AgFontRetire]::RemoveFontResource([string]$fp)) { $rem++ } else { break } } } }',
        '  $notified = [bool][AgFontRetire]::SendNotifyMessage([IntPtr]0xffff, 0x001D, [IntPtr]::Zero, [IntPtr]::Zero)',
        '}',
        '[PSCustomObject]@{ removedNames = @($removedNames); candidatePaths = @($paths); gdiRemoved = $rem; notified = $notified } | ConvertTo-Json -Compress'
      ].join('\n');
      const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psRetire], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000
      });
      if (r.status === 0) {
        const d = JSON.parse(String(r.stdout || '').trim() || '{}');
        if (Array.isArray(d.removedNames)) removedRegistryValues.push(...d.removedNames);
        if (Array.isArray(d.candidatePaths)) {
          for (const cp of d.candidatePaths) {
            if (cp) candidateTtcPaths.add(String(cp));
          }
        }
        gdiRemovedCount = Number(d.gdiRemoved) || 0;
        broadcastOk = Boolean(d.notified);
      }
    } finally {
      try {
        if (fs.existsSync(seedTmp)) fs.unlinkSync(seedTmp);
      } catch {}
    }
  } catch {}

  const deletedFiles = [];
  const lockedPendingRebootFiles = [];
  for (const fp of candidateTtcPaths) {
    if (!fp.toLowerCase().startsWith(userFontsDir.toLowerCase())) continue;
    if (!fs.existsSync(fp)) continue;
    try {
      fs.unlinkSync(fp);
      deletedFiles.push(fp);
    } catch {
      lockedPendingRebootFiles.push(fp);
    }
  }

  return {
    ok: true,
    removedRegistryValues,
    gdiRemovedCount,
    broadcastOk,
    deletedFiles,
    lockedPendingRebootFiles,
    effectiveOnNextAntigravityLaunch: true
  };
}

async function runUninstall() {
  const home = os.homedir();
  const defaultTarget = resolveGlobalInstallDir();
  const targetDir = path.resolve(getArg('--target-dir', resolveDefaultTargetDir()));
  const isCustomSandboxTarget =
    hasFlag('--target-dir') && !isSameTargetPath(targetDir, defaultTarget) && !hasFlag('--register-service');
  const userConfigPath = path.join(targetDir, 'user', 'config.json');
  const realDaemon = path.join(targetDir, 'core', 'daemon.mjs');

  if (isCustomSandboxTarget) {
    const localVbs = path.join(targetDir, 'AntigravityThemeDaemon.vbs');
    const localCacheDir = path.join(targetDir, '.cache');
    try {
      if (fs.existsSync(localVbs)) fs.unlinkSync(localVbs);
    } catch {}
    try {
      if (fs.existsSync(localCacheDir)) fs.rmSync(localCacheDir, { recursive: true, force: true });
    } catch {}
    console.log(`[Uninstall] Cleaned custom sandbox target (${targetDir}); global daemon and services were left untouched.`);
    return;
  }

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
  removeCdpLaunchers();
  try {
    const cacheDir = path.join(targetDir, '.cache');
    if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true });
  } catch {}

  // 2. 在无后台守护进程干扰的纯净状态下，向打开的窗口发送一次禁用还原载荷，即时卸载样式并恢复英文原貌
  if (fs.existsSync(userConfigPath) && fs.existsSync(realDaemon)) {
    try {
      const origRaw = fs.readFileSync(userConfigPath, 'utf8');
      const cfg = JSON.parse(origRaw.replace(/^\uFEFF/, ''));
      cfg.enabled = false;
      fs.writeFileSync(userConfigPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', realDaemon, '--once'], {
        stdio: 'ignore',
        windowsHide: true
      });
      fs.writeFileSync(userConfigPath, origRaw, 'utf8');
    } catch {}
  }
  console.log('[Uninstall] Stopped daemon, removed autostart services & CDP launchers, and unloaded live styles. User config in ~/.gemini/antigravity/theme-patch/user/ is preserved.');
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
  case 'relaunch':
    await runRelaunch();
    break;
  case 'download-fonts':
    await runDownloadFontsCmd();
    break;
  case 'install-fonts':
    await runInstallFonts();
    break;
  case 'retire-super-ttc':
    console.log(JSON.stringify(retireWindowsSuperTtc({ force: hasFlag('--force') }), null, 2));
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
  node install.mjs install          [--channel auto|stable|insiders] [--preset native|morandi|absolutely|claude-desktop-purewhite|vintage-deep] [--dark-preset onyx|claude-warm] [--sync-user] [--with-launcher]
  node install.mjs relaunch         [--channel auto|stable|insiders] [--force]
  node install.mjs download-fonts   [--dir <download-dir>] [--all] [--force] [--super-ttc]
  node install.mjs install-fonts    --auto-download [--dir <download-dir>] [--force] [--super-ttc] [--retire-super-ttc]
  node install.mjs install-fonts    --from <font-folder-or-zip-path> [--retire-super-ttc]
  node install.mjs retire-super-ttc [--force]
  node install.mjs doctor           [--channel auto|stable|insiders]
  node install.mjs verify           [--safe-mode] [--channel auto|stable|insiders]
  node install.mjs rollback
  node install.mjs uninstall
  node install.mjs build-manifest
  node install.mjs pack`);
    break;
}
