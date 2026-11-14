/**
 * chuanban-antigravity-theme-patch · Browser Runtime Engine (core/runtime.js)
 * 纯正浏览器端注入脚本（零模板字符串双重转义）。
 * 由 core/daemon.mjs 读取并将文件末尾的启动载荷占位符替换为实时配置与资源对象。
 */
((boot) => {
  // 0. 顶层窗口隔离：仅允许主窗口与官方内置 Swarm 协作侧栏插件帧（绝不注入 Artifact / HTML 预览等子 iframe）
  const IS_SWARM_PLUGIN_FRAME = !!(
    window.location &&
    ((window.location.protocol === 'plugin:' && /^swarm--/i.test(window.location.hostname || '')) ||
      /^plugin:\/\/swarm--/i.test(String(window.location.href || '')))
  );
  if (window.top !== window && !IS_SWARM_PLUGIN_FRAME) return;
  if (!boot || typeof boot !== 'object') return;

  const PATCH_VERSION = boot.version || '20261114-v5.2.0';
  const DETECTED_OS =
    boot.platform || (/Win/i.test(navigator.platform || '') ? 'win32' : /Mac/i.test(navigator.platform || '') ? 'darwin' : 'linux');
  const ENABLED = boot.enabled !== false;
  const CSS_TEXT = boot.cssText || '';
  const CUSTOM_CSS_TEXT = boot.customCss || '';
  const THEME_VARS = boot.themeVars && typeof boot.themeVars === 'object' ? boot.themeVars : {};
  const MODULES = Object.assign(
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
    boot.modules || {}
  );

  const DEFAULT_PRESET = boot.preset || 'high-contrast';
  const DEFAULT_EXCLUDE_I18N =
    'code, pre, kbd, samp, textarea, input, style, script, noscript, [contenteditable="true"], [data-markdown-root], [data-testid="user-message-content"], .agy-user-bubble, .monaco-editor, .monaco-diff-editor, .xterm, [class*="onyx-key"], .prose, .markdown, [class*="chat-message"], [class*="group/file-title"], [data-testid="conversation-row-sidebar"] a[href^="/c/"], [data-testid="conversation-row-sidebar"] span.truncate, [data-testid="conversation-navigator-turn"], .msg-body, #raw, [data-testid="swarm-raw"], #swarm-title, #ag-live-metrics-pill, #ag-live-metrics-tooltip';

  const SELECTORS = Object.assign(
    {
      inputBoxId: 'antigravity.agentSidePanelInputBox',
      branchPillInBox:
        '[data-testid="branch-pill-trigger"], [data-testid="project-branch-picker"], [data-testid="project-selector-trigger"], [data-testid="location-selector-trigger"], [aria-label^="Select project"], [aria-label^="选择项目"]',
      homeGreeting: '[data-testid="home-greeting"], [data-testid="home-splash-content"]',
      excludeI18n: DEFAULT_EXCLUDE_I18N
    },
    boot.selectors || {}
  );

  // 执行上一轮 user/custom.js 或内部注册的生命周期清理函数（防止热重载或卸载逃逸）
  if (Array.isArray(window.__ag_cleanup_fns) && window.__ag_cleanup_fns.length > 0) {
    const prevCleanups = window.__ag_cleanup_fns.splice(0, window.__ag_cleanup_fns.length);
    for (let i = 0; i < prevCleanups.length; i++) {
      try {
        if (typeof prevCleanups[i] === 'function') prevCleanups[i]();
      } catch (e) {}
    }
  }
  window.__ag_cleanup_fns = [];
  if (window.__ag_dcl_handler) {
    try {
      window.removeEventListener('DOMContentLoaded', window.__ag_dcl_handler);
    } catch (e) {}
    window.__ag_dcl_handler = null;
  }
  if (window.__ag_user_231_observer) {
    try {
      window.__ag_user_231_observer.disconnect();
    } catch (e) {}
    window.__ag_user_231_observer = null;
  }
  if (window.__ag_coldboot_timer) {
    try {
      clearTimeout(window.__ag_coldboot_timer);
    } catch (e) {}
    window.__ag_coldboot_timer = null;
  }

  // 全局持久化的原始英文文本映射表（支持 i18n.override.json 热重载增删改与一键还原）
  if (!window.__ag_orig_text_map) {
    window.__ag_orig_text_map = new WeakMap();
  }
  const origTextMap = window.__ag_orig_text_map;

  function restoreAllTranslations(root = document.body) {
    if (!root) return;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const rec = origTextMap.get(node);
        if (rec) {
          if (node.nodeValue === rec.lastVal) {
            node.nodeValue = rec.origRaw;
          }
          origTextMap.delete(node);
        }
      }
      const attrNames = ['title', 'placeholder', 'aria-label'];
      const attrEls = root.querySelectorAll
        ? root.querySelectorAll(
            '[data-ag-orig-title], [data-ag-orig-title-last], [data-ag-orig-placeholder], [data-ag-orig-placeholder-last], [data-ag-orig-aria-label], [data-ag-orig-aria-label-last]'
          )
        : [];
      for (let i = 0; i < attrEls.length; i++) {
        const el = attrEls[i];
        for (let j = 0; j < attrNames.length; j++) {
          const attr = attrNames[j];
          const origAttr = 'data-ag-orig-' + attr;
          const lastAttr = origAttr + '-last';
          if (el.hasAttribute(origAttr) || el.hasAttribute(lastAttr)) {
            const savedOrig = el.getAttribute(origAttr);
            const savedLast = el.getAttribute(lastAttr);
            const cur = el.getAttribute(attr);
            if (savedOrig !== null && (savedLast === null || cur === savedLast)) {
              el.setAttribute(attr, savedOrig);
            }
            el.removeAttribute(origAttr);
            el.removeAttribute(lastAttr);
            delete el['__ag_attr_ver_' + attr];
          }
        }
        delete el.__ag_attr_ver;
      }
    } catch (e) {}
  }

  function applyThemeVars(varsObj) {
    // 清理早期版本遗留的内联 style 属性，避免压制 body.dark 或被原生 iY() 冲掉
    const prevKeys = Array.isArray(window.__ag_applied_theme_vars) ? window.__ag_applied_theme_vars : [];
    for (let i = 0; i < prevKeys.length; i++) {
      const k = prevKeys[i];
      document.documentElement.style.removeProperty(k);
      if (document.body) document.body.style.removeProperty(k);
    }
    window.__ag_applied_theme_vars = [];

    const keys = Object.keys(varsObj || {});
    const globalDecls = [];
    const lightDecls = [];
    const darkDecls = [];

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const v = varsObj[k];
      if (!k.startsWith('--') || v === null || v === undefined || String(v).trim() === '') continue;
      const cleanVal = String(v).trim().replace(/[;{}]/g, '');
      if (k.startsWith('--ag-dark-')) {
        darkDecls.push(`${k}: ${cleanVal} !important;`);
      } else if (k.startsWith('--ag-')) {
        globalDecls.push(`${k}: ${cleanVal} !important;`);
      } else {
        lightDecls.push(`${k}: ${cleanVal} !important;`);
      }
    }

    let varStyle = document.getElementById('ag-user-theme-vars');
    if (globalDecls.length === 0 && lightDecls.length === 0 && darkDecls.length === 0) {
      if (varStyle) varStyle.remove();
    } else {
      const head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
      if (!varStyle) {
        varStyle = document.createElement('style');
        varStyle.id = 'ag-user-theme-vars';
      }
      if (head) {
        const customStyleEl = document.getElementById('antigravity-user-custom-style');
        if (customStyleEl && customStyleEl.parentNode === head) {
          head.insertBefore(varStyle, customStyleEl);
        } else if (varStyle.parentNode !== head) {
          head.appendChild(varStyle);
        }
      }
      const blocks = [];
      if (globalDecls.length > 0) {
        blocks.push(
          `:root, html[data-ag-os][data-ag-wax-seal]:not([data-ag-disabled]), html[data-ag-os][data-ag-wax-seal]:not([data-ag-disabled]) body { ${globalDecls.join(' ')} }`
        );
      }
      if (lightDecls.length > 0) {
        blocks.push(
          `html[data-ag-os][data-ag-wax-seal]:not([data-ag-theme-mode="dark"]):not(:has(> body.dark)), html[data-ag-os][data-ag-wax-seal]:not([data-ag-theme-mode="dark"]) body:not(.dark) { ${lightDecls.join(' ')} }`
        );
      }
      if (darkDecls.length > 0) {
        blocks.push(
          `html[data-ag-os][data-ag-wax-seal]:not([data-ag-disabled])[data-ag-theme-mode="dark"], html[data-ag-os][data-ag-wax-seal]:not([data-ag-disabled])[data-ag-theme-mode="dark"] body, html[data-ag-os][data-ag-wax-seal]:not([data-ag-disabled]):has(> body.dark), html[data-ag-os][data-ag-wax-seal]:not([data-ag-disabled]) body.dark { ${darkDecls.join(' ')} }`
        );
      }
      const nextCss = blocks.join('\n');
      if (varStyle.textContent !== nextCss) {
        varStyle.textContent = nextCss;
      }
    }

    if (varsObj && varsObj['--ag-chat-font-size']) {
      document.documentElement.setAttribute('data-ag-custom-font-size', 'true');
    } else {
      document.documentElement.removeAttribute('data-ag-custom-font-size');
    }
  }

  // Antigravity 2.31.2+ BaseWindow + curtainView 底色同步与宿主内联色彩亮度解析
  function parseColorToRgb(rawColor, requireOpaque = false) {
    const s = String(rawColor || '').trim();
    if (!s) return null;
    if (/^#[0-9a-fA-F]{6}$/.test(s)) {
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    }
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16)];
    }
    const mRgb = s.match(/^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/i);
    if (mRgb) {
      if (mRgb[4] !== undefined) {
        const a = mRgb[4].endsWith('%') ? parseFloat(mRgb[4]) / 100 : parseFloat(mRgb[4]);
        if (!Number.isFinite(a) || (requireOpaque && a < 1)) return null;
      }
      const c255 = (v) =>
        Math.max(0, Math.min(255, Math.round(v.endsWith('%') ? parseFloat(v) * 2.55 : Number(v))));
      return [c255(mRgb[1]), c255(mRgb[2]), c255(mRgb[3])];
    }
    const mSrgb = s.match(/^color\(\s*srgb\s+([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+%?)(?:\s*\/\s*([\d.%]+))?\s*\)$/i);
    if (mSrgb) {
      if (mSrgb[4] !== undefined) {
        const a = mSrgb[4].endsWith('%') ? parseFloat(mSrgb[4]) / 100 : parseFloat(mSrgb[4]);
        if (!Number.isFinite(a) || (requireOpaque && a < 1)) return null;
      }
      const f255 = (v) =>
        Math.max(0, Math.min(255, Math.round(v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v) * 255)));
      return [f255(mSrgb[1]), f255(mSrgb[2]), f255(mSrgb[3])];
    }
    return null;
  }

  function parseColorToHex6(rawColor) {
    const rgb = parseColorToRgb(rawColor, true);
    if (!rgb) return null;
    const h2 = (v) => v.toString(16).padStart(2, '0');
    return ('#' + h2(rgb[0]) + h2(rgb[1]) + h2(rgb[2])).toUpperCase();
  }

  function computeColorLuminance(rawColor) {
    const rgb = parseColorToRgb(rawColor, false);
    if (!rgb) return null;
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  }

  let colorProbeCanvasCtx = null;
  function parseCssColorViaCanvasHex6(rawColor) {
    if (!rawColor || typeof document === 'undefined') return null;
    try {
      if (!colorProbeCanvasCtx) {
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        colorProbeCanvasCtx = c.getContext('2d', { willReadFrequently: true });
      }
      if (!colorProbeCanvasCtx) return null;
      colorProbeCanvasCtx.clearRect(0, 0, 1, 1);
      colorProbeCanvasCtx.fillStyle = 'rgba(0, 0, 0, 0)';
      colorProbeCanvasCtx.fillStyle = rawColor;
      colorProbeCanvasCtx.fillRect(0, 0, 1, 1);
      const d = colorProbeCanvasCtx.getImageData(0, 0, 1, 1).data;
      if (!d || d[3] < 242) return null;
      const h2 = (v) => v.toString(16).padStart(2, '0');
      return ('#' + h2(d[0]) + h2(d[1]) + h2(d[2])).toUpperCase();
    } catch (e) {
      return null;
    }
  }

  function resolveCssColorToHex6(propName, targetEl, fallbackHex) {
    try {
      const el = targetEl || document.body || document.documentElement;
      if (!el || typeof getComputedStyle !== 'function') return fallbackHex;
      const cs = getComputedStyle(el);
      let cur = (cs.getPropertyValue(propName) || '').trim();
      let hex = parseColorToHex6(cur);
      for (let depth = 0; depth < 4 && !hex && cur && cur.includes('var('); depth++) {
        cur = cur
          .replace(/var\(\s*(--[A-Za-z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)/g, (_, vName, fb) => {
            return (cs.getPropertyValue(vName) || fb || '').trim();
          })
          .trim();
        hex = parseColorToHex6(cur);
      }
      if (!hex && cur && !cur.includes('var(')) {
        hex = parseCssColorViaCanvasHex6(cur);
      }
      if (!hex && cur) {
        const host = document.head || document.documentElement;
        if (host) {
          const probe = document.createElement('span');
          probe.style.cssText =
            'position:fixed!important;left:-9999px!important;top:-9999px!important;pointer-events:none!important;display:none!important;';
          probe.style.setProperty('color', cur.includes('var(') ? `var(${propName})` : cur, 'important');
          host.appendChild(probe);
          try {
            const resolved = getComputedStyle(probe).color;
            hex = parseColorToHex6(resolved) || parseCssColorViaCanvasHex6(resolved);
          } finally {
            probe.remove();
          }
        }
      }
      return hex || fallbackHex;
    } catch (e) {
      return fallbackHex;
    }
  }

  function syncWinTitleBarOverlay(isDark, force = false, customFallbacks = null) {
    if (IS_SWARM_PLUGIN_FRAME || DETECTED_OS !== 'win32') return;
    try {
      const setOverlay = window.electronNative?.setTitleBarOverlay;
      if (typeof setOverlay !== 'function') return;
      const targetEl = document.body || document.documentElement;
      if (!targetEl || typeof getComputedStyle !== 'function') return;
      const fbBg = (customFallbacks && customFallbacks.bg) || (isDark ? '#111114' : '#F7F5F0');
      const fbFg = (customFallbacks && customFallbacks.fg) || (isDark ? '#FAFAFA' : '#1F1E1D');
      const bgHex = resolveCssColorToHex6('--sidebar', targetEl, fbBg);
      const fgHex = resolveCssColorToHex6('--foreground', targetEl, fbFg);
      const sig = bgHex + '|' + fgHex;
      if (force || window.__ag_last_overlay_sig !== sig) {
        window.__ag_last_overlay_sig = sig;
        Promise.resolve(setOverlay({ color: bgHex, symbolColor: fgHex })).catch(() => {});
      }
    } catch (e) {}
  }

  function syncCurtainSurfaceColor(force = false) {
    if (IS_SWARM_PLUGIN_FRAME) return;
    try {
      const setThemeColor = window.electronNative?.wcvBrowser?.setThemeColor;
      if (typeof setThemeColor !== 'function') return;
      const targetEl = document.body || document.documentElement;
      if (!targetEl || typeof getComputedStyle !== 'function') return;
      const cs = getComputedStyle(targetEl);
      let hex = resolveCssColorToHex6('--background', targetEl, null);
      if (!hex) {
        hex = parseColorToHex6(cs.backgroundColor);
      }
      if (hex && (force || window.__ag_last_curtain_hex !== hex)) {
        window.__ag_last_curtain_hex = hex;
        Promise.resolve(setThemeColor(hex)).catch(() => {});
      }
    } catch (e) {}
  }

  // 若用户在 user/config.json 中将 enabled 设为 false，执行无损卸载还原
  if (!ENABLED) {
    const s1 = document.getElementById('ag-custom-fonts');
    if (s1) s1.remove();
    const s2 = document.getElementById('antigravity-user-custom-style');
    if (s2) s2.remove();
    const pill = document.getElementById('ag-live-metrics-pill');
    if (pill) pill.remove();
    const tt = document.getElementById('ag-live-metrics-tooltip');
    if (tt) tt.remove();
    if (window.__ag_i18n_observer) {
      try {
        window.__ag_i18n_observer.disconnect();
      } catch (e) {}
      window.__ag_i18n_observer = null;
    }
    if (window.__ag_user_231_observer) {
      try {
        window.__ag_user_231_observer.disconnect();
      } catch (e) {}
      window.__ag_user_231_observer = null;
    }
    if (window.__ag_metrics_ro) {
      try {
        window.__ag_metrics_ro.disconnect();
      } catch (e) {}
      window.__ag_metrics_ro = null;
      window.__ag_metrics_ro_target = null;
      window.__ag_metrics_ro_observed = null;
      window.__ag_last_metrics_layout_sig = '';
    }
    if (window.__ag_metrics_route_watcher) {
      try {
        clearInterval(window.__ag_metrics_route_watcher);
      } catch (e) {}
      window.__ag_metrics_route_watcher = null;
    }
    if (window.__ag_theme_mode_observer) {
      try {
        window.__ag_theme_mode_observer.disconnect();
      } catch (e) {}
      window.__ag_theme_mode_observer = null;
    }
    if (window.__ag_mql_cleanup) {
      try {
        window.__ag_mql_cleanup();
      } catch (e) {}
      window.__ag_mql_cleanup = null;
    }
    if (window.__ag_zoom_timer) {
      try {
        clearTimeout(window.__ag_zoom_timer);
      } catch (e) {}
      window.__ag_zoom_timer = null;
    }
    if (window.__ag_self_zoom_timer) {
      try {
        clearTimeout(window.__ag_self_zoom_timer);
      } catch (e) {}
      window.__ag_self_zoom_timer = null;
    }
    window.__ag_self_zooming = false;
    window.__ag_zoom_keydown_fn = null;
    window.__ag_zoom_resize_fn = null;
    window.__ag_settings_click_fn = null;
    window.__ag_body_ready = false;
    applyThemeVars({});
    document.documentElement.removeAttribute('data-ag-preset');
    document.documentElement.removeAttribute('data-ag-theme-mode');
    document.documentElement.removeAttribute('data-ag-page-type');
    document.documentElement.removeAttribute('data-ag-wax-seal');
    document.documentElement.removeAttribute('data-ag-os');
    const restoreNativeSurfaces = () => {
      syncCurtainSurfaceColor(true);
      if (!IS_SWARM_PLUGIN_FRAME) {
        const hEl = document.documentElement;
        const bEl = document.body;
        const sysDark = !!(
          typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
        );
        const hDataTheme = hEl ? hEl.getAttribute('data-theme') : null;
        const bHydrated = !!(bEl && (bEl.hasAttribute('data-agy-theme') || bEl.hasAttribute('data-newux-theme')));
        let nativeDark = false;
        if (
          hDataTheme === 'dark' ||
          (bEl && (bEl.classList.contains('dark') || bEl.classList.contains('theme-dark') || bEl.classList.contains('dark-theme')))
        ) {
          nativeDark = true;
        } else if (
          hDataTheme === 'light' ||
          (bEl && (bEl.classList.contains('theme-light') || bEl.classList.contains('light-theme') || bEl.classList.contains('light')))
        ) {
          nativeDark = false;
        } else if (hEl && hEl.style.colorScheme === 'dark') {
          nativeDark = true;
        } else if (hEl && hEl.style.colorScheme === 'light') {
          nativeDark = false;
        } else if (bHydrated) {
          nativeDark = false;
        } else if (boot.hostThemeMode === 'dark') {
          nativeDark = true;
        } else if (boot.hostThemeMode === 'light') {
          nativeDark = false;
        } else {
          nativeDark = sysDark;
        }
        syncWinTitleBarOverlay(nativeDark, true, {
          bg: nativeDark ? '#131313' : '#FAFAFA',
          fg: nativeDark ? '#FAFAFA' : '#383A42'
        });
      }
    };
    restoreAllTranslations(document.body);
    restoreNativeSurfaces();
    if (!document.body && typeof document.addEventListener === 'function') {
      if (window.__ag_disabled_dcl_fn) {
        document.removeEventListener('DOMContentLoaded', window.__ag_disabled_dcl_fn);
      }
      window.__ag_disabled_dcl_fn = () => {
        window.__ag_disabled_dcl_fn = null;
        restoreAllTranslations(document.body);
        restoreNativeSurfaces();
      };
      document.addEventListener('DOMContentLoaded', window.__ag_disabled_dcl_fn, { once: true });
    }
    window.__ag_patch_version = PATCH_VERSION + '-disabled';
    return;
  }

  if (window.__ag_disabled_dcl_fn && typeof document.removeEventListener === 'function') {
    document.removeEventListener('DOMContentLoaded', window.__ag_disabled_dcl_fn);
    window.__ag_disabled_dcl_fn = null;
  }

  // ============================================================================
  // 1. 注入更纱黑体与主题样式（#ag-custom-fonts -> #ag-user-theme-vars -> #antigravity-user-custom-style）
  // ============================================================================
  const headTarget = document.head || document.getElementsByTagName('head')[0] || document.documentElement;

  let style = document.getElementById('ag-custom-fonts');
  if (!style) {
    style = document.createElement('style');
    style.id = 'ag-custom-fonts';
    if (headTarget) headTarget.appendChild(style);
  }
  if (style && style.textContent !== CSS_TEXT) {
    style.textContent = CSS_TEXT;
  }

  document.documentElement.setAttribute('data-ag-wax-seal', MODULES.composerWaxSeal === false ? 'off' : 'on');
  const detectedOs = DETECTED_OS;
  document.documentElement.setAttribute('data-ag-os', detectedOs);
  applyThemeVars(THEME_VARS);

  let userStyle = document.getElementById('antigravity-user-custom-style');
  if (MODULES.customCss && CUSTOM_CSS_TEXT.trim()) {
    if (!userStyle) {
      userStyle = document.createElement('style');
      userStyle.id = 'antigravity-user-custom-style';
      if (headTarget) headTarget.appendChild(userStyle);
    }
    if (userStyle.textContent !== CUSTOM_CSS_TEXT) {
      userStyle.textContent = CUSTOM_CSS_TEXT;
    }
  } else if (userStyle) {
    userStyle.remove();
  }

  function ensureStylesAtEndOfHead() {
    const h = document.head || document.getElementsByTagName('head')[0];
    if (!h) return;
    const base = document.getElementById('ag-custom-fonts');
    if (!base) return;
    let needsMove = base.parentNode !== h;
    if (!needsMove) {
      for (let sib = base.nextElementSibling; sib; sib = sib.nextElementSibling) {
        if (
          sib.id !== 'ag-user-theme-vars' &&
          sib.id !== 'antigravity-user-custom-style' &&
          (sib.tagName === 'LINK' || sib.tagName === 'STYLE')
        ) {
          needsMove = true;
          break;
        }
      }
    }
    if (needsMove) {
      for (const id of ['ag-custom-fonts', 'ag-user-theme-vars', 'antigravity-user-custom-style']) {
        const el = document.getElementById(id);
        if (el) h.appendChild(el);
      }
    }
  }
  ensureStylesAtEndOfHead();

  // ============================================================================
  // 2. 防死锁守护：Antigravity 原生 TanStack Router 缺陷修复（支持热重载更新回调）
  // ============================================================================
  window.__ag_settings_click_fn = (e) => {
    if (IS_SWARM_PLUGIN_FRAME || MODULES.deadlockHealer === false) return;
    const btn = e.target && e.target.closest && e.target.closest('[data-testid="settings-button"]');
    if (!btn) return;

    const hasDialog = !!document.querySelector('[role="dialog"]');
    const urlHasSettings = window.location.search.includes('settingsOpen=true');

    if (!hasDialog && urlHasSettings) {
      const url = new URL(window.location.href);
      url.searchParams.delete('settingsOpen');
      url.searchParams.delete('settingsScreen');
      window.history.replaceState(window.history.state, '', url.toString());
    }
  };

  if (!window.__ag_settings_guard_installed) {
    window.__ag_settings_guard_installed = true;
    document.addEventListener(
      'click',
      (e) => {
        if (typeof window.__ag_settings_click_fn === 'function') {
          window.__ag_settings_click_fn(e);
        }
      },
      true
    );
  }

  // ============================================================================
  // 2.05 冷启动内嵌兜底包漂移安全自愈（HEAD ETag 零流量比对 + 六重空输入/零交互安全门禁）
  // ============================================================================
  if (
    !IS_SWARM_PLUGIN_FRAME &&
    window.top === window &&
    MODULES.deadlockHealer !== false &&
    MODULES.coldBootHealer !== false &&
    /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(String(window.location.origin || ''))
  ) {
    const markUserDirty = () => {
      window.__ag_user_interacted_dirty = true;
      if (window.__ag_coldboot_timer) {
        try {
          clearTimeout(window.__ag_coldboot_timer);
        } catch (e) {}
        window.__ag_coldboot_timer = null;
      }
    };

    if (!window.__ag_user_dirty_guard_installed) {
      window.__ag_user_dirty_guard_installed = true;
      const PURE_MOD_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn']);
      document.addEventListener(
        'keydown',
        (e) => {
          const k = String(e.key || '');
          if (PURE_MOD_KEYS.has(k)) return;
          if ((e.metaKey || e.ctrlKey) && !e.altKey && (k === '-' || k === '_' || k === '=' || k === '+' || k === '0')) {
            return;
          }
          markUserDirty();
        },
        { capture: true, passive: true }
      );
      for (const evtName of ['paste', 'drop', 'compositionstart', 'input']) {
        document.addEventListener(evtName, markUserDirty, { capture: true, passive: true });
      }
    }

    const readSessionHealedFlag = () => {
      try {
        return window.sessionStorage.getItem('__ag_coldboot_bundle_healed') === '1';
      } catch (e) {
        return true;
      }
    };

    const isWindowUntouchedAndIdleForColdHeal = () => {
      if (!ENABLED || MODULES.deadlockHealer === false || MODULES.coldBootHealer === false) return false;
      if (window.__ag_user_interacted_dirty) return false;
      if (typeof performance === 'undefined' || typeof performance.now !== 'function' || performance.now() >= 25000) {
        return false;
      }
      if (readSessionHealedFlag()) return false;
      if (
        document.querySelector(
          '[role="dialog"], [data-testid="input-cancel-button"], [data-testid*="running-"], button[aria-label="Stop execution"], button[aria-label="停止执行"], button[aria-label*="Cancel ("], button[aria-label*="取消生成"]'
        )
      ) {
        return false;
      }
      const editableList = document.querySelectorAll(
        '[data-lexical-editor="true"], [contenteditable="true"], textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"])'
      );
      for (let i = 0; i < editableList.length; i++) {
        const el = editableList[i];
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.tagName === 'INPUT') {
            const itype = String(el.type || '').toLowerCase();
            if (
              itype === 'hidden' ||
              itype === 'checkbox' ||
              itype === 'radio' ||
              itype === 'range' ||
              itype === 'color' ||
              itype === 'button' ||
              itype === 'submit' ||
              itype === 'reset' ||
              itype === 'file'
            ) {
              continue;
            }
          }
          if (String(el.value || '').trim() !== '') return false;
        } else {
          const txt = String(el.textContent || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
          if (txt !== '') return false;
        }
      }
      return true;
    };

    const probeColdBootBundleDrift = async (attempt) => {
      window.__ag_coldboot_timer = null;
      if (!isWindowUntouchedAndIdleForColdHeal()) {
        window.__ag_coldboot_probe_done = true;
        window.__ag_coldboot_healer_state = { probeDone: true, drifted: false, skippedReason: 'gate-blocked' };
        return;
      }
      try {
        const entries =
          typeof performance.getEntriesByType === 'function'
            ? performance.getEntriesByType('resource').filter((e) => /\/main\.js(?:\?|$)/.test(String(e.name || '')))
            : [];
        const mainEntry = entries.length > 0 ? entries[entries.length - 1] : null;
        const loadedDecoded = Number(mainEntry && mainEntry.decodedBodySize) || 0;
        const loadedEncoded = Number(mainEntry && mainEntry.encodedBodySize) || 0;
        if (loadedDecoded <= 0 && loadedEncoded <= 0) {
          window.__ag_coldboot_probe_done = true;
          window.__ag_coldboot_healer_state = { probeDone: true, drifted: false, skippedReason: 'no-perf-entry' };
          return;
        }

        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const abortTimer = ctrl ? setTimeout(() => ctrl.abort(), 2500) : null;
        let res = null;
        try {
          res = await fetch('/main.js', {
            method: 'HEAD',
            cache: 'no-store',
            signal: ctrl ? ctrl.signal : undefined
          });
        } finally {
          if (abortTimer) clearTimeout(abortTimer);
        }
        if (!res || !res.ok) {
          window.__ag_coldboot_probe_done = true;
          window.__ag_coldboot_healer_state = { probeDone: true, drifted: false, skippedReason: 'head-failed' };
          return;
        }

        const etag = String(res.headers.get('etag') || '').trim();
        const mEtag = etag.match(/^(?:W\/)?"([0-9a-f]+)-[0-9a-f]+"$/i);
        const serverDecoded = mEtag ? parseInt(mEtag[1], 16) : 0;
        const serverEncoded = Number(res.headers.get('content-length')) || 0;

        let hasDrift = false;
        if (serverDecoded > 0 && loadedDecoded > 0) {
          hasDrift = Math.abs(serverDecoded - loadedDecoded) > 1024;
        } else if (serverEncoded > 0 && loadedEncoded > 0) {
          hasDrift = Math.abs(serverEncoded - loadedEncoded) > 1024;
        }

        if (!isWindowUntouchedAndIdleForColdHeal()) {
          window.__ag_coldboot_probe_done = true;
          window.__ag_coldboot_healer_state = {
            probeDone: true,
            loadedDecoded,
            serverDecoded,
            drifted: hasDrift,
            skippedReason: 'dirty-after-head'
          };
          return;
        }

        if (hasDrift) {
          window.__ag_coldboot_probe_done = true;
          window.__ag_coldboot_healer_state = {
            probeDone: true,
            loadedDecoded,
            serverDecoded,
            drifted: true,
            healed: true
          };
          try {
            window.sessionStorage.setItem('__ag_coldboot_bundle_healed', '1');
          } catch (e) {
            return;
          }
          const driftTag = `decoded:${loadedDecoded}->${serverDecoded || serverEncoded}`;
          if (typeof window.__agRequestHardReload === 'function') {
            try {
              window.__agRequestHardReload(driftTag);
            } catch (e) {}
          }
          window.__ag_coldboot_timer = setTimeout(() => {
            window.__ag_coldboot_timer = null;
            if (!window.__ag_user_interacted_dirty) {
              window.location.reload();
            }
          }, 280);
          return;
        }

        const hasRemoteTrigger = !!document.querySelector(
          '[data-testid="project-selector-this-machine-trigger"], [data-testid="location-selector-trigger"]'
        );
        if (attempt === 1 && !hasRemoteTrigger && performance.now() < 16000) {
          window.__ag_coldboot_healer_state = {
            probeDone: false,
            attempt: 1,
            loadedDecoded,
            serverDecoded,
            drifted: false
          };
          window.__ag_coldboot_timer = setTimeout(() => {
            probeColdBootBundleDrift(2);
          }, 5500);
          return;
        }

        window.__ag_coldboot_probe_done = true;
        window.__ag_coldboot_healer_state = {
          probeDone: true,
          attempt,
          loadedDecoded,
          serverDecoded,
          drifted: false
        };
      } catch (e) {
        window.__ag_coldboot_probe_done = true;
        window.__ag_coldboot_healer_state = { probeDone: true, drifted: false, skippedReason: 'exception' };
      }
    };

    if (!window.__ag_coldboot_probe_done && isWindowUntouchedAndIdleForColdHeal() && performance.now() < 20000) {
      const delayMs = Math.max(1500, Math.round(5800 - Math.min(4300, performance.now())));
      window.__ag_coldboot_healer_state = { armed: true, delayMs, probeDone: false };
      window.__ag_coldboot_timer = setTimeout(() => {
        probeColdBootBundleDrift(1);
      }, delayMs);
    } else if (!window.__ag_coldboot_healer_state) {
      window.__ag_coldboot_healer_state = {
        armed: false,
        probeDone: true,
        skippedReason: performance.now() >= 20000 ? 'warm-window' : 'gate-blocked'
      };
    }
  }

  // ============================================================================
  // 2.1 缩放快捷键修复与 2.31.2 原生菜单快捷键防双倍缩放保护（兼容 Numpad、欧式键盘与 Windows BaseWindow）
  // ============================================================================
  try {
    const initZoom = window.electronNative?.getZoomLevel?.();
    if (typeof initZoom === 'number' && typeof window.__ag_settled_zoom !== 'number') {
      window.__ag_settled_zoom = initZoom;
    }
  } catch (e) {}

  window.__ag_zoom_resize_fn = () => {
    const native = window.electronNative;
    if (!native || typeof native.getZoomLevel !== 'function') return;
    try {
      const cur = native.getZoomLevel();
      if (typeof cur === 'number') {
        if (window.__ag_self_zooming) {
          window.__ag_settled_zoom = cur;
          return;
        }
        if (typeof window.__ag_settled_zoom === 'number' && Math.abs(cur - window.__ag_settled_zoom) > 0.003) {
          window.__ag_last_ext_zoom_ts = typeof performance !== 'undefined' ? performance.now() : Date.now();
        }
        window.__ag_settled_zoom = cur;
      }
    } catch (e) {}
  };

  window.__ag_zoom_keydown_fn = (e) => {
    if (MODULES.zoomShortcuts === false || MODULES.deadlockHealer === false) return;
    if (e.isComposing) return;
    const isMac = detectedOs === 'darwin';
    const modKey = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!modKey || e.altKey) return;

    const k = String(e.key || '');
    const isCjkImeKey =
      k === 'Process' || k === 'Unidentified' || /[\uFF00-\uFFEF\u3000-\u303F]/.test(k);

    let action = null;
    if (
      k === '-' ||
      k === '_' ||
      e.code === 'NumpadSubtract' ||
      (!e.shiftKey && e.code === 'Minus' && isCjkImeKey)
    ) {
      action = 'out';
    } else if (
      k === '=' ||
      k === '+' ||
      e.code === 'NumpadAdd' ||
      (e.code === 'Equal' && isCjkImeKey)
    ) {
      action = 'in';
    } else if (!e.shiftKey && (k === '0' || e.code === 'Numpad0' || (e.code === 'Digit0' && isCjkImeKey))) {
      action = 'reset';
    }
    if (!action) return;

    // Swarm 子帧内：当 e.key 非宿主 sidecar-key-event 直接识别的 '+'/'='/'-'/'0'（如 Numpad0 'Insert'、'_'、中文输入法 'Process'/全角符号）时归一化转发
    if (IS_SWARM_PLUGIN_FRAME) {
      if (k !== '+' && k !== '=' && k !== '-' && k !== '0' && window.parent && window.parent !== window) {
        e.preventDefault();
        e.stopPropagation();
        try {
          window.parent.postMessage(
            {
              type: 'sidecar-key-event',
              payload: {
                eventType: 'keydown',
                key: action === 'in' ? '=' : action === 'out' ? '-' : '0',
                code: e.code,
                ctrlKey: !!e.ctrlKey,
                metaKey: !!e.metaKey,
                shiftKey: action === 'reset' ? false : !!e.shiftKey,
                altKey: false,
                repeat: !!e.repeat
              }
            },
            '*'
          );
        } catch (err) {}
      }
      return;
    }

    const native = window.electronNative;
    if (!native) return;

    const actionFn =
      action === 'out'
        ? native.zoomOut
        : action === 'in'
        ? native.zoomIn
        : typeof native.resetZoom === 'function'
        ? native.resetZoom
        : native.zoomReset;
    if (typeof actionFn !== 'function') return;

    const nowTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const curFactor = typeof native.getZoomLevel === 'function' ? native.getZoomLevel() : null;
    const settledBefore = typeof window.__ag_settled_zoom === 'number' ? window.__ag_settled_zoom : curFactor;

    e.preventDefault();
    e.stopPropagation();

    // 若原生菜单加速器已在 keydown 到达渲染进程前刚完成缩放（macOS NSMenu），直接同步状态并跳过补触发
    if (
      !window.__ag_self_zooming &&
      ((typeof curFactor === 'number' && typeof settledBefore === 'number' && Math.abs(curFactor - settledBefore) > 0.003) ||
        nowTs - (window.__ag_last_ext_zoom_ts || 0) < (isMac ? 80 : 40))
    ) {
      if (typeof curFactor === 'number') window.__ag_settled_zoom = curFactor;
      return;
    }

    // preload.js 中 getZoomLevel() 底层为 webFrame.getZoomFactor()，100% 原始大小恒为 1.0
    if (action === 'reset' && typeof curFactor === 'number' && Math.abs(curFactor - 1) < 0.005) {
      return;
    }

    const markSelfZoomWindow = (ms) => {
      window.__ag_self_zooming = true;
      if (window.__ag_self_zoom_timer) clearTimeout(window.__ag_self_zoom_timer);
      window.__ag_self_zoom_timer = setTimeout(() => {
        window.__ag_self_zoom_timer = null;
        try {
          const latest = typeof native.getZoomLevel === 'function' ? native.getZoomLevel() : null;
          if (typeof latest === 'number') window.__ag_settled_zoom = latest;
        } catch (err) {}
        window.__ag_self_zooming = false;
      }, ms);
    };

    const runZoomAction = () => {
      markSelfZoomWindow(250);
      try {
        const ret = actionFn.call(native);
        const syncNext = typeof native.getZoomLevel === 'function' ? native.getZoomLevel() : null;
        if (
          typeof syncNext === 'number' &&
          (typeof curFactor !== 'number' || Math.abs(syncNext - curFactor) > 0.003)
        ) {
          window.__ag_settled_zoom = syncNext;
        }
        if (ret && typeof ret.then === 'function') {
          ret.then(
            () => {
              try {
                const asyncNext = typeof native.getZoomLevel === 'function' ? native.getZoomLevel() : null;
                if (typeof asyncNext === 'number') window.__ag_settled_zoom = asyncNext;
              } catch (err) {}
              markSelfZoomWindow(80);
            },
            () => {
              markSelfZoomWindow(40);
            }
          );
        }
      } catch (err) {
        markSelfZoomWindow(40);
      }
    };

    // Windows / Linux 无 NSMenu 加速器竞态，且 macOS 原生菜单未绑定小键盘与 '_'：零延迟即时执行，确保长按连发 (e.repeat) 丝滑不吞键
    if (!isMac || String(e.code || '').startsWith('Numpad') || k === '_') {
      runZoomAction();
      return;
    }

    // macOS 保留 60ms NSMenu 防双倍缩放观察窗口
    if (window.__ag_zoom_timer) {
      clearTimeout(window.__ag_zoom_timer);
      window.__ag_zoom_timer = null;
    }

    window.__ag_zoom_timer = setTimeout(() => {
      window.__ag_zoom_timer = null;
      try {
        const afterFactor = typeof native.getZoomLevel === 'function' ? native.getZoomLevel() : null;
        if (
          !window.__ag_self_zooming &&
          ((typeof curFactor === 'number' && typeof afterFactor === 'number' && Math.abs(afterFactor - curFactor) > 0.003) ||
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) - (window.__ag_last_ext_zoom_ts || 0) < 80)
        ) {
          if (typeof afterFactor === 'number') window.__ag_settled_zoom = afterFactor;
          return;
        }
        runZoomAction();
      } catch (err) {}
    }, 60);
  };

  if (!window.__ag_zoom_guard_installed) {
    window.__ag_zoom_guard_installed = true;
    window.addEventListener(
      'resize',
      () => {
        if (typeof window.__ag_zoom_resize_fn === 'function') {
          window.__ag_zoom_resize_fn();
        }
      },
      { passive: true }
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (typeof window.__ag_zoom_keydown_fn === 'function') {
          window.__ag_zoom_keydown_fn(e);
        }
      },
      true
    );
  }

  // ============================================================================
  // 3. 专属色彩预设状态联动（支持 user/config.json 热重载切换）与防白屏崩溃保护
  // ============================================================================
  const PRESETS = {
    HIGH_CONTRAST: 'high-contrast',
    CLAUDE_PUREWHITE: 'claude-desktop-purewhite',
    VINTAGE_DEEP: 'vintage-deep',
    LEGACY_WARM_WHITE: 'chuanban-warm-white',
    LEGACY_OFFICIAL: 'claude-desktop-official',
    LEGACY_CHUANBAN: 'absoulutely-chuanban'
  };

  const ALL_CUSTOM_PRESET_NAMES = new Set(Object.values(PRESETS));

  // 当用户在 user/config.json 中修改了 preset 时，同步刷新 localStorage 中的 theme-color-flavor
  if (DEFAULT_PRESET && window.__ag_last_boot_preset !== DEFAULT_PRESET) {
    window.__ag_last_boot_preset = DEFAULT_PRESET;
    try {
      Storage.prototype.setItem.call(localStorage, 'theme-color-flavor', DEFAULT_PRESET);
    } catch (e) {}
  }

  function syncChuanbanPreset() {
    try {
      const storedLight = Storage.prototype.getItem.call(localStorage, 'theme-preset-light');
      if (ALL_CUSTOM_PRESET_NAMES.has(storedLight)) {
        try {
          Storage.prototype.setItem.call(localStorage, 'theme-preset-light', 'Default Light');
        } catch (e) {}
      }
      const storedDark = Storage.prototype.getItem.call(localStorage, 'theme-preset-dark');
      if (ALL_CUSTOM_PRESET_NAMES.has(storedDark)) {
        try {
          Storage.prototype.setItem.call(localStorage, 'theme-preset-dark', 'Default Dark');
        } catch (e) {}
      }

      const flavor =
        Storage.prototype.getItem.call(localStorage, 'theme-color-flavor') || DEFAULT_PRESET || PRESETS.HIGH_CONTRAST;

      let targetPreset = PRESETS.HIGH_CONTRAST;
      if (flavor === PRESETS.HIGH_CONTRAST || flavor === PRESETS.LEGACY_WARM_WHITE || flavor === '高对比版') {
        targetPreset = PRESETS.HIGH_CONTRAST;
      } else if (
        flavor === PRESETS.CLAUDE_PUREWHITE ||
        flavor === PRESETS.LEGACY_OFFICIAL ||
        flavor === 'ClaudeDesktop 净白'
      ) {
        targetPreset = PRESETS.CLAUDE_PUREWHITE;
      } else if (flavor === PRESETS.VINTAGE_DEEP || flavor === PRESETS.LEGACY_CHUANBAN || flavor === '复古深色') {
        targetPreset = PRESETS.VINTAGE_DEEP;
      }

      const prevPreset = document.documentElement.getAttribute('data-ag-preset');
      if (prevPreset !== targetPreset) {
        document.documentElement.setAttribute('data-ag-preset', targetPreset);
      }

      const htmlEl = document.documentElement;
      const bodyEl = document.body;
      const htmlDataTheme = htmlEl ? htmlEl.getAttribute('data-theme') : null;
      const hostThemeMode = boot.hostThemeMode || null;
      const systemPrefersDark = !!(
        typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
      );
      let isDark = false;
      if (IS_SWARM_PLUGIN_FRAME) {
        // Swarm 插件 preload 直接向 html 内联 style 注入宿主 --background（不受样式表 !important 覆盖影响）；
        // 若后台预热阶段尚未收到宿主 theme-change（hostLum === null），优先对齐 ~/.gemini/config/config.json 的 hostThemeMode
        const inlineHostBg = htmlEl ? (htmlEl.style.getPropertyValue('--background') || '').trim() : '';
        const hostLum = computeColorLuminance(inlineHostBg);
        if (hostLum !== null) {
          isDark = hostLum < 0.5;
        } else if (hostThemeMode === 'dark') {
          isDark = true;
        } else if (hostThemeMode === 'light') {
          isDark = false;
        } else if (htmlDataTheme === 'dark') {
          isDark = true;
        } else if (htmlDataTheme === 'light') {
          isDark = false;
        } else {
          isDark = systemPrefersDark;
        }
        const swarmMode = isDark ? 'dark' : 'light';
        if (htmlEl && htmlEl.getAttribute('data-theme') !== swarmMode) {
          htmlEl.setAttribute('data-theme', swarmMode);
        }
      } else {
        const bodyExplicitDark = !!(
          htmlDataTheme === 'dark' ||
          (bodyEl &&
            (bodyEl.classList.contains('dark') ||
              bodyEl.classList.contains('theme-dark') ||
              bodyEl.classList.contains('dark-theme')))
        );
        const bodyExplicitLight = !!(
          htmlDataTheme === 'light' ||
          (bodyEl &&
            (bodyEl.classList.contains('theme-light') ||
              bodyEl.classList.contains('light-theme') ||
              bodyEl.classList.contains('light')))
        );
        let storedThemeMode = null;
        try {
          storedThemeMode = Storage.prototype.getItem.call(localStorage, 'theme-mode');
        } catch (e) {}
        const hasColorSchemeDark = !!(htmlEl && htmlEl.style.colorScheme === 'dark');
        const hasColorSchemeLight = !!(htmlEl && htmlEl.style.colorScheme === 'light');
        const bodyHydrated = !!(
          bodyEl && (bodyEl.hasAttribute('data-agy-theme') || bodyEl.hasAttribute('data-newux-theme'))
        );
        if (bodyExplicitDark) {
          isDark = true;
        } else if (bodyExplicitLight) {
          isDark = false;
        } else if (hasColorSchemeDark) {
          isDark = true;
        } else if (hasColorSchemeLight) {
          isDark = false;
        } else if (bodyHydrated) {
          isDark = false;
        } else if (hostThemeMode === 'dark') {
          isDark = true;
        } else if (hostThemeMode === 'light') {
          isDark = false;
        } else if (hostThemeMode === 'inherit') {
          isDark = systemPrefersDark;
        } else if (storedThemeMode === 'dark') {
          isDark = true;
        } else if (storedThemeMode === 'light') {
          isDark = false;
        } else {
          isDark = systemPrefersDark;
        }
      }
      const targetMode = isDark ? 'dark' : 'light';
      const prevMode = document.documentElement.getAttribute('data-ag-theme-mode');
      if (prevMode !== targetMode || prevPreset !== targetPreset) {
        document.documentElement.setAttribute('data-ag-theme-mode', targetMode);
      }
      syncWinTitleBarOverlay(isDark);
      syncCurtainSurfaceColor();
    } catch (e) {}
  }

  window.__ag_sync_preset_fn = syncChuanbanPreset;

  if (!window.__ag_preset_hook_installed) {
    window.__ag_preset_hook_installed = true;
    try {
      const origGetItem = localStorage.getItem.bind(localStorage);
      localStorage.getItem = function (key) {
        const val = origGetItem(key);
        if (key === 'theme-preset-light' && ALL_CUSTOM_PRESET_NAMES.has(val)) {
          return 'Default Light';
        }
        if (key === 'theme-preset-dark' && ALL_CUSTOM_PRESET_NAMES.has(val)) {
          return 'Default Dark';
        }
        return val;
      };

      const origSetItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (key, val) {
        if (key === 'theme-preset-light' && ALL_CUSTOM_PRESET_NAMES.has(val)) {
          val = 'Default Light';
        }
        if (key === 'theme-preset-dark' && ALL_CUSTOM_PRESET_NAMES.has(val)) {
          val = 'Default Dark';
        }
        origSetItem(key, val);
        if (
          key === 'theme-preset-light' ||
          key === 'theme-preset-dark' ||
          key === 'theme-mode' ||
          key === 'theme-color-flavor'
        ) {
          setTimeout(() => {
            if (typeof window.__ag_sync_preset_fn === 'function') window.__ag_sync_preset_fn();
          }, 50);
        }
      };
    } catch (e) {}
  }

  if (window.__ag_theme_mode_observer) {
    try {
      window.__ag_theme_mode_observer.disconnect();
    } catch (e) {}
    window.__ag_theme_mode_observer = null;
  }
  if (typeof MutationObserver !== 'undefined') {
    try {
      const modeObs = new MutationObserver(() => {
        if (typeof window.__ag_sync_preset_fn === 'function') {
          window.__ag_sync_preset_fn();
        }
      });
      if (document.body) {
        modeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
      if (document.documentElement) {
        modeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
      }
      window.__ag_theme_mode_observer = modeObs;
    } catch (e) {}
  }
  if (window.__ag_mql_cleanup) {
    try {
      window.__ag_mql_cleanup();
    } catch (e) {}
    window.__ag_mql_cleanup = null;
  }
  if (typeof window.matchMedia === 'function') {
    try {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const onSchemeChange = () => {
        if (typeof window.__ag_sync_preset_fn === 'function') window.__ag_sync_preset_fn();
      };
      mql.addEventListener?.('change', onSchemeChange);
      window.__ag_mql_cleanup = () => mql.removeEventListener?.('change', onSchemeChange);
    } catch (e) {}
  }

  syncChuanbanPreset();
  window.__ag_patch_version = PATCH_VERSION;

  // ============================================================================
  // 3.5 模型名称同行实时指标胶囊 (Scheme C: TPS · TTFT · Ctx/256k · Out + Hover 详情卡)
  // 常规宽度恒定锁定同行(middle)；仅窄侧边栏(<165px，恢复>=180px滞回)折入框内第二行(bottom)。
  // ============================================================================
  const MIDDLE_ENTER_BOTTOM_PX = 165;
  const MIDDLE_EXIT_BOTTOM_PX = 180;

  function extractCascadeId() {
    try {
      const m = window.location.pathname.match(/\/c\/([0-9a-f-]{36})/i);
      if (m) return m[1];
      const q = new URLSearchParams(window.location.search).get('cascadeId');
      if (q && /^[0-9a-f-]{36}$/i.test(q)) return q;
      const selected = document.querySelector('[data-testid=conversation-row-sidebar][data-selected=true]');
      if (selected) {
        const cid = selected.getAttribute('data-cascade-id');
        if (cid && /^[0-9a-f-]{36}$/i.test(cid)) return cid;
      }
    } catch (e) {}
    return '';
  }

  function ensureMetricsTooltip() {
    let tt = document.getElementById('ag-live-metrics-tooltip');
    if (!tt && document.body) {
      tt = document.createElement('div');
      tt.id = 'ag-live-metrics-tooltip';
      document.body.appendChild(tt);
    } else if (tt && tt.parentElement !== document.body && document.body) {
      document.body.appendChild(tt);
    }
    return tt;
  }

  function findFooterRow(box) {
    if (!box) return null;
    const directFooter = box.querySelector('.agy-composer-footer');
    if (directFooter && directFooter.children.length >= 2) {
      return directFooter;
    }
    const rows = box.querySelectorAll('div.flex.w-full.items-center.justify-between');
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.getAttribute('data-testid') === 'input-box-bottom-toolbar') continue;
      if (r.querySelector('[data-testid="model-selector-trigger"], [data-testid="send-button"]')) {
        return r;
      }
    }
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.getAttribute('data-testid') !== 'input-box-bottom-toolbar') return r;
    }
    return directFooter || null;
  }

  function measureNaturalLeftWidth(leftGroup) {
    let w = 0;
    for (let i = 0; i < leftGroup.children.length; i++) {
      const ch = leftGroup.children[i];
      if (ch.id === 'ag-live-metrics-pill') continue;
      const cw = Math.max(ch.offsetWidth || 0, ch.scrollWidth || 0);
      if (cw > 0) w += cw;
    }
    return w;
  }

  function syncMetricsResizeObserver(bottomRow, leftGroup, rightGroup) {
    if (typeof ResizeObserver === 'undefined' || !bottomRow) return;
    if (window.__ag_metrics_ro_target !== bottomRow || window.__ag_metrics_ro_ver !== PATCH_VERSION) {
      if (window.__ag_metrics_ro) {
        try {
          window.__ag_metrics_ro.disconnect();
        } catch (e) {}
      }
      window.__ag_metrics_ro_target = bottomRow;
      window.__ag_metrics_ro_ver = PATCH_VERSION;
      window.__ag_metrics_ro_observed = new WeakSet();
      window.__ag_last_metrics_layout_sig = '';
      window.__ag_metrics_ro = new ResizeObserver(() => {
        if (window.__ag_metrics_raf) return;
        window.__ag_metrics_raf = requestAnimationFrame(() => {
          window.__ag_metrics_raf = 0;
          const curBox = document.getElementById(SELECTORS.inputBoxId);
          const curBottom = findFooterRow(curBox);
          if (!curBottom || !curBottom.children[0]) return;
          const curLeft = curBottom.children[0];
          const curRight = curBottom.children[1] || null;
          const rw = curBottom.clientWidth || 0;
          if (rw <= 0) return;
          const lw = measureNaturalLeftWidth(curLeft);
          const rgw = curRight ? curRight.offsetWidth || 0 : 0;
          const sig = rw + ':' + lw + ':' + rgw;
          if (sig !== window.__ag_last_metrics_layout_sig) {
            if (typeof window.__ag_ensure_metrics_pill_fn === 'function') {
              window.__ag_ensure_metrics_pill_fn(true);
            }
          }
        });
      });
    }
    const ro = window.__ag_metrics_ro;
    const seen = window.__ag_metrics_ro_observed;
    if (!ro || !seen) return;
    const observeOnce = (el) => {
      if (el && el.nodeType === 1 && !seen.has(el)) {
        seen.add(el);
        try {
          ro.observe(el);
        } catch (e) {}
      }
    };
    observeOnce(bottomRow);
    if (rightGroup) observeOnce(rightGroup);
    if (leftGroup) {
      for (let i = 0; i < leftGroup.children.length; i++) {
        const ch = leftGroup.children[i];
        if (ch.id !== 'ag-live-metrics-pill') observeOnce(ch);
      }
    }
  }

  function ensureMetricsPill(forceLayout = false, resetHysteresis = false) {
    if (!MODULES.metrics) {
      const existing = document.getElementById('ag-live-metrics-pill');
      if (existing) existing.style.display = 'none';
      if (window.__ag_metrics_ro) {
        try {
          window.__ag_metrics_ro.disconnect();
        } catch (e) {}
        window.__ag_metrics_ro = null;
        window.__ag_metrics_ro_target = null;
        window.__ag_metrics_ro_observed = null;
        window.__ag_last_metrics_layout_sig = '';
      }
      return null;
    }
    const box = document.getElementById(SELECTORS.inputBoxId);
    if (!box) return null;
    const bottomRow = findFooterRow(box);
    if (!bottomRow || !bottomRow.children[0]) return null;
    const leftGroup = bottomRow.children[0];
    const rightGroup = bottomRow.children[1] || null;

    let pill = document.getElementById('ag-live-metrics-pill');
    let isNewPill = false;
    if (!pill) {
      isNewPill = true;
      pill = document.createElement('div');
      pill.id = 'ag-live-metrics-pill';
      pill.innerHTML = '<span id="ag-live-metrics-text"></span>';
      pill.addEventListener('mouseenter', () => {
        const tt = ensureMetricsTooltip();
        if (!tt || !tt.innerHTML) return;
        const r = pill.getBoundingClientRect();
        const ttWidth = Math.min(440, Math.max(370, tt.offsetWidth || 400));
        const left = Math.max(12, Math.min(r.left, window.innerWidth - ttWidth - 16));
        const bottomPx = Math.min(window.innerHeight - r.top + 8, window.innerHeight - (tt.offsetHeight || 220) - 12);
        tt.style.left = left + 'px';
        tt.style.bottom = Math.max(8, bottomPx) + 'px';
        tt.setAttribute('data-visible', '1');
      });
      pill.addEventListener('mouseleave', () => {
        const tt = document.getElementById('ag-live-metrics-tooltip');
        if (tt) tt.removeAttribute('data-visible');
      });
    }

    syncMetricsResizeObserver(bottomRow, leftGroup, rightGroup);

    const rowW = bottomRow.clientWidth || 0;
    if (rowW <= 0) return pill;
    const leftW = measureNaturalLeftWidth(leftGroup);
    const rightW = rightGroup ? rightGroup.offsetWidth || 0 : 0;
    const curLayoutSig = rowW + ':' + leftW + ':' + rightW;

    const isMountedHere =
      pill.parentElement === leftGroup || (bottomRow.parentElement && pill.parentElement === bottomRow.parentElement);
    if (!forceLayout && !isNewPill && isMountedHere && window.__ag_last_metrics_layout_sig === curLayoutSig) {
      return pill;
    }

    window.__ag_last_metrics_layout_sig = curLayoutSig;
    window.__ag_last_row_width = rowW;
    const availMiddleW = rowW - leftW - rightW - 8;

    const prevMode = resetHysteresis ? 'middle' : pill.getAttribute('data-ag-row-mode') || 'middle';
    const useBottomRow =
      prevMode === 'bottom' ? availMiddleW < MIDDLE_EXIT_BOTTOM_PX : availMiddleW < MIDDLE_ENTER_BOTTOM_PX;
    const rowMode = useBottomRow ? 'bottom' : 'middle';

    if (bottomRow.getAttribute('data-ag-row-mode') !== rowMode) {
      bottomRow.setAttribute('data-ag-row-mode', rowMode);
    }
    if (pill.getAttribute('data-ag-row-mode') !== rowMode) {
      pill.setAttribute('data-ag-row-mode', rowMode);
    }

    if (useBottomRow) {
      const cardParent = bottomRow.parentElement;
      if (cardParent && (pill.parentElement !== cardParent || pill.previousElementSibling !== bottomRow)) {
        bottomRow.after(pill);
      }
    } else {
      if (pill.parentElement !== leftGroup) {
        leftGroup.appendChild(pill);
      }
    }

    return pill;
  }

  window.__ag_ensure_metrics_pill_fn = ensureMetricsPill;

  window.__ag_render_metrics = function (payload) {
    try {
      if (!MODULES.metrics) return;
      window.__ag_last_metrics = payload;
      const currentId = extractCascadeId();
      const pill = ensureMetricsPill(false);
      const ttEl = ensureMetricsTooltip();
      if (!pill) return;
      if (!currentId || !payload || !payload.hasData || payload.cascadeId !== currentId) {
        if (pill.style.display !== 'none') pill.style.display = 'none';
        if (ttEl) ttEl.removeAttribute('data-visible');
        return;
      }
      const textEl = pill.querySelector('#ag-live-metrics-text');
      if (textEl && textEl.innerHTML !== payload.inlineHtml) {
        textEl.innerHTML = payload.inlineHtml;
      }
      if (ttEl && ttEl.innerHTML !== payload.tooltipHtml) {
        ttEl.innerHTML = payload.tooltipHtml;
      }
      if (pill.style.display !== 'inline-flex') {
        pill.style.display = 'inline-flex';
        ensureMetricsPill(true);
      }
    } catch (e) {}
  };

  function checkRouteAndMountMetrics() {
    try {
      if (IS_SWARM_PLUGIN_FRAME) {
        if (document.documentElement.getAttribute('data-ag-page-type') !== 'plugin') {
          document.documentElement.setAttribute('data-ag-page-type', 'plugin');
        }
        return;
      }
      if (document.hidden) return;
      const pathname = window.location.pathname;
      const isChatRoute = pathname.startsWith('/c/');
      const cid = extractCascadeId();
      const isHome = pathname === '/' || (!isChatRoute && !cid) || (!isChatRoute && !!document.querySelector(SELECTORS.homeGreeting));
      const pageType = isHome ? 'home' : 'chat';
      if (document.documentElement.getAttribute('data-ag-page-type') !== pageType) {
        document.documentElement.setAttribute('data-ag-page-type', pageType);
      }

      if (!MODULES.metrics) {
        const existing = document.getElementById('ag-live-metrics-pill');
        if (existing) existing.style.display = 'none';
        return;
      }

      if (!cid) {
        window.__ag_watched_cascade_id = '';
        const pill = document.getElementById('ag-live-metrics-pill');
        if (pill && pill.style.display !== 'none') {
          pill.style.display = 'none';
        }
        const ttEl = document.getElementById('ag-live-metrics-tooltip');
        if (ttEl) ttEl.removeAttribute('data-visible');
        return;
      }

      if (cid !== window.__ag_watched_cascade_id) {
        window.__ag_watched_cascade_id = cid;
        window.__ag_last_metrics_layout_sig = '';
        const pill = ensureMetricsPill(true, true);
        if (pill && (!window.__ag_last_metrics || window.__ag_last_metrics.cascadeId !== cid)) {
          pill.style.display = 'none';
        }
        if (typeof window.__agRequestMetrics === 'function') {
          try {
            window.__agRequestMetrics(cid);
          } catch (e) {}
        }
      } else if (window.__ag_last_metrics && window.__ag_last_metrics.cascadeId === cid) {
        const pill = ensureMetricsPill(false);
        if (pill && window.__ag_last_metrics.hasData && pill.style.display === 'none') {
          window.__ag_render_metrics(window.__ag_last_metrics);
        }
      }
    } catch (e) {}
  }

  if (!IS_SWARM_PLUGIN_FRAME && !window.__ag_history_hook_installed) {
    window.__ag_history_hook_installed = true;
    const triggerRouteCheck = () => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (typeof window.__ag_check_route_fn === 'function') window.__ag_check_route_fn();
        }, 0);
      });
      setTimeout(() => {
        if (typeof window.__ag_check_route_fn === 'function') window.__ag_check_route_fn();
      }, 120);
    };
    const wrapHistory = (type) => {
      const orig = history[type];
      if (typeof orig !== 'function') return;
      history[type] = function (...args) {
        const ret = orig.apply(this, args);
        triggerRouteCheck();
        return ret;
      };
    };
    wrapHistory('pushState');
    wrapHistory('replaceState');
    window.addEventListener('popstate', triggerRouteCheck);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && typeof window.__ag_check_route_fn === 'function') {
        window.__ag_check_route_fn();
      }
    });
  }

  window.__ag_check_route_fn = checkRouteAndMountMetrics;

  if (window.__ag_metrics_route_watcher) {
    try {
      clearInterval(window.__ag_metrics_route_watcher);
    } catch (e) {}
    window.__ag_metrics_route_watcher = null;
  }
  if (!IS_SWARM_PLUGIN_FRAME) {
    window.__ag_metrics_route_watcher = setInterval(checkRouteAndMountMetrics, 3000);
  }
  if (document.body || IS_SWARM_PLUGIN_FRAME) {
    checkRouteAndMountMetrics();
  }

  // ============================================================================
  // 4. 高性能界面汉化引擎（无原型词典 + WeakMap O(1) 隔离缓存 + 单遍扫描 + 首字符分流）
  // ============================================================================
  if (window.__ag_i18n_observer) {
    try {
      window.__ag_i18n_observer.disconnect();
    } catch (e) {}
    window.__ag_i18n_observer = null;
  }

  const DICT = Object.assign(Object.create(null), boot.i18nDict || {});
  window.__ag_i18n_dict = DICT;

  // 大小写不敏感兜底索引与弯撇号 (\u2018/\u2019 -> ') 归一化（2.31.1+ 并存多种大小写与排版弯引号文案）
  // 仅对首字母大写的界面文案启用大小写兜底，避免误伤小写标识符；精确匹配始终优先。
  const RE_CURLY_APOS = /[\u2018\u2019]/g;
  const DICT_APOS = new Map();
  const DICT_CI = new Map();
  for (const k in DICT) {
    const v = DICT[k];
    if (typeof v !== 'string') continue;
    const kNorm = k.indexOf('\u2019') !== -1 || k.indexOf('\u2018') !== -1 ? k.replace(RE_CURLY_APOS, "'") : k;
    if (kNorm !== k && !(kNorm in DICT) && !DICT_APOS.has(kNorm)) {
      DICT_APOS.set(kNorm, v);
    }
    const lk = kNorm.toLowerCase();
    if (!DICT_CI.has(lk)) DICT_CI.set(lk, v);
  }
  function dictLookup(s) {
    if (!s) return undefined;
    const exact = DICT[s];
    if (typeof exact === 'string') return exact;
    const sNorm = s.indexOf('\u2019') !== -1 || s.indexOf('\u2018') !== -1 ? s.replace(RE_CURLY_APOS, "'") : s;
    if (sNorm !== s) {
      const exactNorm = DICT[sNorm];
      if (typeof exactNorm === 'string') return exactNorm;
    }
    const aposAlias = DICT_APOS.get(sNorm);
    if (typeof aposAlias === 'string') return aposAlias;
    const c0 = sNorm.charCodeAt(0);
    if (c0 < 65 || c0 > 90) return undefined;
    return DICT_CI.get(sNorm.toLowerCase());
  }

  let scanBodyFn = null;
  const I18N_OBS_OPTS = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'aria-label', 'placeholder']
  };

  if (MODULES.i18n) {
    function splitTopLevelSelectors(selStr) {
      const parts = [];
      let cur = '';
      let bracketDepth = 0;
      let parenDepth = 0;
      let quote = '';
      const s = String(selStr || '');
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (quote) {
          cur += ch;
          if (ch === quote && s[i - 1] !== '\\') quote = '';
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          cur += ch;
        } else if (ch === '[') {
          bracketDepth++;
          cur += ch;
        } else if (ch === ']') {
          if (bracketDepth > 0) bracketDepth--;
          cur += ch;
        } else if (ch === '(') {
          parenDepth++;
          cur += ch;
        } else if (ch === ')') {
          if (parenDepth > 0) parenDepth--;
          cur += ch;
        } else if (ch === ',' && bracketDepth === 0 && parenDepth === 0) {
          if (cur.trim()) parts.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      if (cur.trim()) parts.push(cur.trim());
      return parts;
    }

    const CONTAINER_IMMUTABLE_EXCLUDE_SELECTOR =
      'code, pre, kbd, samp, style, script, noscript, [data-markdown-root], [data-testid="user-message-content"], .agy-user-bubble, .monaco-editor, .monaco-diff-editor, .xterm, #ag-live-metrics-pill, #ag-live-metrics-tooltip, .msg-body, #raw, [data-testid="swarm-raw"], #swarm-title';
    const TEXT_IMMUTABLE_EXCLUDE_SELECTOR =
      'textarea, input, [contenteditable="true"], [data-testid="conversation-navigator-turn"], ' +
      CONTAINER_IMMUTABLE_EXCLUDE_SELECTOR;

    const mergedExcludeParts = splitTopLevelSelectors(DEFAULT_EXCLUDE_I18N);
    const userExcludeParts = splitTopLevelSelectors(SELECTORS.excludeI18n);
    for (let i = 0; i < userExcludeParts.length; i++) {
      if (!mergedExcludeParts.includes(userExcludeParts[i])) {
        mergedExcludeParts.push(userExcludeParts[i]);
      }
    }
    const EXCLUDE_SELECTOR = mergedExcludeParts.join(', ');
    const FORM_ATTR_EXCLUDE_SELECTOR = mergedExcludeParts
      .filter((tok) => {
        const low = tok.toLowerCase().replace(/\s+/g, '');
        return (
          low !== 'input' &&
          low !== 'textarea' &&
          low !== '[contenteditable="true"]' &&
          low !== "[contenteditable='true']" &&
          low !== '[contenteditable]' &&
          low !== '[data-testid="conversation-navigator-turn"]' &&
          low !== "[data-testid='conversation-navigator-turn']"
        );
      })
      .join(', ');

    function isFormAttrTarget(el) {
      return !!(
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          (el.getAttribute &&
            (el.getAttribute('contenteditable') === 'true' ||
              el.getAttribute('data-testid') === 'conversation-navigator-turn')))
      );
    }

    const immutableTextExclCache = new WeakMap();
    const immutableContainerExclCache = new WeakMap();

    // 预编译模块级正则常量，消除热路径重复编译与二次匹配
    const RE_HAS_CJK = /[\u4e00-\u9fa5]/;
    const RE_PURE_ALPHA = /^\s*[a-zA-Z]+\s*$/;
    const RE_HAS_ALPHA = /[a-zA-Z]/;
    const RE_REL_TIME = /^(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|w|mo|y|yr|yrs)\s+ago$/i;
    const REL_UNIT_MAP = {
      s: '秒',
      sec: '秒',
      secs: '秒',
      m: '分钟',
      min: '分钟',
      mins: '分钟',
      h: '小时',
      hr: '小时',
      hrs: '小时',
      d: '天',
      w: '周',
      mo: '个月',
      y: '年',
      yr: '年',
      yrs: '年'
    };
    const UNIT_MAP_SHORT = { s: '秒', m: '分钟', h: '小时', d: '天', w: '周', mo: '个月', y: '年', yr: '年' };
    const NAMED_PERIOD_MAP = { weekly: '每周', daily: '每日', monthly: '每月' };
    const MONTH_SHORT_MAP = {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12
    };
    // 客户端 main.js ($Q 权限编辑器) 在 onBlur 中硬编码判断 relatedTarget.getAttribute("aria-label") === "Cancel"
    const SKIP_ARIA_LABEL_VALUES = new Set(['Cancel']);

    const RE_PCT_LEFT = /^(\d+(?:\.\d+)?)%\s*left$/i;
    const RE_WINDOW_LIMIT_COMBINED = /^(\d+)\s*([smhd])\s+limit,\s*resets in\s+(.+)$/i;
    const RE_WINDOW_LIMIT = /^(\d+)\s*([smhd])\s+limit$/i;
    const RE_NAMED_LIMIT_RESETS = /^(Weekly|Daily|Monthly)\s+limit,\s*resets in\s+(.+)$/i;
    const RE_RESETS_IN = /^Resets in\s+(.+)$/i;
    const RE_SEARCH_GOOGLE = /^Search Google for "(.+)"$/;
    const RE_UPDATED_AT =
      /^Updated\s+(?:((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}|\d{1,2}月\d{1,2}日),\s*)?((?:上午|下午)?\s*\d{1,2}:\d{2}(?:\s*[AP]M)?)$/;

    const RE_FILES_CHANGED = /^(\d+)\s+files?\s+changed$/i;
    const RE_TOOLS = /^(\d+)\s+tools?$/i;
    const RE_DEMOTED = /^(\d+)\s+demoted$/i;
    const RE_EXCLUDED = /^(\d+)\s+excluded$/i;
    const RE_TOOLS_EXCLUDED = /^(\d+)\s+tools?\s+excluded$/i;
    const RE_ACTIVE_CONVS = /^(\d+)\s+active\s+conversations?$/i;
    const RE_ARCHIVED_CONVS = /^(\d+)\s+archived\s+conversations?$/i;
    const RE_PINNED_COUNT = /^(\d+)\s+pinned(?:\s+tabs?)?$/i;
    const RE_MODELS_SELECTED = /^(\d+)\s+models?\s+selected$/i;
    const RE_BROWSER_STEPS = /^(\d+)\s+browser\s+steps?$/i;
    const RE_MEDIA_ATTACHMENTS = /^(\d+)\s+(image|audio|video)\s+attachments?$/i;
    const RE_ATTACHMENTS_COUNT = /^(\d+)\s+attachments?$/i;
    const RE_COMMENTS_COUNT = /^(\d+)\s+comments?$/i;
    const RE_INSTALLED_COUNT = /^(\d+)\s+installed$/i;
    const RE_ACCOUNTS_COUNT = /^(\d+)\s+accounts?$/i;
    const RE_UPDATES_COUNT = /^(\d+)\s+updates?$/i;
    const RE_PROJECTS_COUNT = /^(\d+)\s+projects?$/i;
    const RE_CALLS_MB = /^(\d+)\s+calls?\s*·\s*([\d.]+\s*MB)$/i;
    const RE_TASKS_DONE = /^(\d+)\s+of\s+(\d+)\s+tasks?\s+done$/i;
    const RE_POSTS_COUNT = /^(\d+)\s+posts?$/i;
    const RE_MEMBERS_COUNT = /^(\d+)\s+members?$/i;
    const RE_MCP_FAILED_START = /^(\d+)\s+MCP servers?\s+failed to start$/i;
    const RE_UP_NEXT_COUNT = /^Up next\s*·\s*(\d+)$/i;
    const RE_USES_LOCAL_CLONE = /^Uses your local clone,\s+([^\r\n]{1,100})$/;
    const RE_PLUS_ATTACHMENTS = /^\+(\d+)\s+attachments?$/i;
    const RE_PLUS_MORE = /^\+(\d+)\s+more(\s*\(Show all\))?$/i;
    const RE_SEE_ALL = /^See all\s*\((\d+)\)$/i;
    const RE_SHOW_BREAKDOWNS = /^Show\s+(\d+)\s+breakdowns?$/i;
    const RE_SHOW_MORE_SUBAGENTS = /^Show\s+(\d+)\s+more\s+subagents?$/i;
    const RE_SHOW_EARLIER_STEPS = /^Show\s+(\d+)\s+earlier\s+steps?$/i;
    const RE_SORT_FILTER_ACTIVE = /^Sort and filter conversations\s*\((\d+)\s+active\)$/i;
    const RE_STILL_THINKING_SEC = /^Still thinking,\s*(\d+)\s*seconds?$/i;
    const RE_MARKED_READ = /^Marked\s+(\d+)\s+conversations?\s+as\s+read$/i;
    const RE_ZIPPING_FOLDER = /^Zipping\s+(.+?)(?:…|\.\.\.)$/i;
    const RE_PERM_DELETE = /^Permanently delete\s+(.*)\s+including\s+(\d+)\s+active\s+conversations\.?$/i;
    const RE_WORKED_FOR_UPDATES = /^Worked for\s+([<0-9smhd\s]+?)\s*·\s*(\d+)\s+updates?$/i;
    const RE_WORKED_FOR = /^Worked for\s+([<0-9smhd]+(?:\s+\d+[smhd])*)$/i;
    const RE_WAITING_CMD_SEC = /^Waiting for command completion\s*\(up to\s+(\d+)\s+seconds?\)$/i;
    const RE_HOME_HEY_NAME = /^Hey\s+([^\r\n]{1,40}?),\s+what should we build today\?$/i;
    const RE_HOME_WELCOME_NAME = /^Welcome back,\s*([^\r\n]{1,40}?)\.\s+Where should we pick up\?$/i;
    const RE_HOME_GOOD_SEE_NAME = /^Good to see you,\s*([^\r\n]{1,40}?)\.\s+What['\u2019]s next\?$/i;
    const RE_WORK_LOCALLY_ON = /^Work locally on\s+([^\r\n]{1,80})$/;
    const RE_WORK_IN_TARGET = /^Work in\s+(?!a New Worktree$)([^\r\n]{1,80})$/;
    const RE_WORKTREE_FROM = /^Worktree from\s+([^\r\n,]{1,80}?)(?:,\s*and reuse\s+([^\r\n]{1,80}))?$/;
    const RE_AUTO_FIG_WORKSPACE =
      /^Automatically create a new\s+(Fig|Piper|JJ)\s+workspace when the conversation starts(?:,\s*Worktree from\s+([^\r\n,]{1,80}?))?(?:,\s*and reuse\s+([^\r\n]{1,80}))?$/;
    const RE_THOUGHT_FOR = /^Thought for\s+([<0-9smhd]+(?:\s+\d+[smhd])*)$/i;
    const RE_THINKING_FOR = /^Thinking for\s+([<0-9smhd]+(?:\s+\d+[smhd])*)$/i;
    const RE_USING_BROWSER_SEC = /^Using browser\s*\((\d+)s\)$/i;
    const RE_RUNNING_FOR = /^Running\s+for\s+([<0-9smhd]+(?:\s+\d+[smhd])*)$/i;
    const RE_KEY_QUEUES_AFTER = /^(\S+)\s+Queues after the turn$/i;
    const RE_KEY_SENDS_IMMEDIATELY = /^(\S+)\s+Sends immediately$/i;
    const RE_KEY_EMPTY_NEXT_QUEUE = /^(\S+)\s+On empty prompt,\s*sends next in queue$/i;
    const RE_EPHEMERAL_SUMMARY =
      /^(Explored(?:\s+(?:\d+\s+)?(?:files?|artifacts?)(?:\s+and\s+(?:\d+\s+)?(?:files?|artifacts?))?)?|Ran\s+(?:\d+\s+)?commands?|Edited(?:\s+(?:\d+\s+)?(?:files?|artifacts?)(?:\s+and\s+(?:\d+\s+)?(?:files?|artifacts?))?)?)(?:,\s*(explored(?:\s+(?:\d+\s+)?(?:files?|artifacts?)(?:\s+and\s+(?:\d+\s+)?(?:files?|artifacts?))?)?|ran\s+(?:\d+\s+)?commands?|edited(?:\s+(?:\d+\s+)?(?:files?|artifacts?)(?:\s+and\s+(?:\d+\s+)?(?:files?|artifacts?))?)?))*$/i;
    const EPHEMERAL_CLAUSE_MAP = {
      explored: '已探索',
      'explored file': '已探索文件',
      'explored files': '已探索文件',
      'explored artifact': '已探索 Artifact',
      'explored artifacts': '已探索 Artifact',
      'explored file and artifact': '已探索文件与 Artifact',
      'explored files and artifact': '已探索文件与 Artifact',
      'explored file and artifacts': '已探索文件与 Artifact',
      'explored files and artifacts': '已探索文件与 Artifact',
      'ran command': '已运行命令',
      'ran commands': '已运行命令',
      edited: '已编辑',
      'edited file': '已编辑文件',
      'edited files': '已编辑文件',
      'edited artifact': '已编辑 Artifact',
      'edited artifacts': '已编辑 Artifact',
      'edited file and artifact': '已编辑文件与 Artifact',
      'edited files and artifact': '已编辑文件与 Artifact',
      'edited file and artifacts': '已编辑文件与 Artifact',
      'edited files and artifacts': '已编辑文件与 Artifact'
    };
    const RE_EPHEMERAL_COUNT_CLAUSE = /^(explored|edited|ran)\s+(\d+)\s+(files?|artifacts?|commands?)$/i;
    function translateEphemeralClause(clause) {
      const low = clause.trim().toLowerCase();
      if (EPHEMERAL_CLAUSE_MAP[low]) return EPHEMERAL_CLAUSE_MAP[low];
      const mCount = low.match(RE_EPHEMERAL_COUNT_CLAUSE);
      if (mCount) {
        const vMap = { explored: '已探索', edited: '已编辑', ran: '已运行' };
        const nMap = {
          file: '个文件',
          files: '个文件',
          artifact: '个 Artifact',
          artifacts: '个 Artifact',
          command: '条命令',
          commands: '条命令'
        };
        return vMap[mCount[1]] + ' ' + mCount[2] + ' ' + nMap[mCount[3]];
      }
      return clause.trim();
    }
    const RE_EPHEMERAL_ACTIVE = /^(Editing|Reading|Listing|Searching)\s+(.+)$/;
    const EPHEMERAL_VERB_MAP = {
      Editing: '正在编辑',
      Reading: '正在读取',
      Listing: '正在列出',
      Searching: '正在搜索'
    };
    const EPHEMERAL_NOUN_MAP = {
      file: '文件',
      files: '文件',
      artifact: 'Artifact',
      artifacts: 'Artifact',
      'file and artifact': '文件与 Artifact',
      'files and artifact': '文件与 Artifact',
      'file and artifacts': '文件与 Artifact',
      'files and artifacts': '文件与 Artifact'
    };
    function joinZhVerbNoun(verbZh, nounZh) {
      return /^[A-Za-z0-9]/.test(nounZh) ? verbZh + ' ' + nounZh : verbZh + nounZh;
    }
    const RE_RUNNING_CMD = /^Running\s+(?!commands?\b|processes\b|for\b|\(Dev\b)(.+)$/;
    const RE_DELETED_RECORDINGS = /^Deleted\s+(\d+)\s+recordings?\s*\(([\d.]+\s*MB)\)$/i;
    const RE_DELETE_RECORDINGS_CONFIRM =
      /^This deletes\s+(\d+)\s+call recordings?\s*\(([\d.]+\s*MB)\)\s+from your machine\.\s*You can't undo this\.$/i;
    const RE_USED_LIMIT = /^You have used (some|all|most) of your (weekly|5-hour|five-hour|daily) limit,?\s*it will fully refresh in (.*)\.?$/i;
    const RE_NOT_USED_LIMIT = /^You have not used any of your (weekly|5-hour|five-hour|daily) limit\.?$/i;
    const RE_ORCHESTRATOR_MODEL = /^Orchestrator\s*\(([^)]+)\)$/i;
    const RE_MODEL_OFFLOAD_DESC =
      /^([A-Za-z0-9 .+-]+?)\s+that may offload routine steps to\s+([A-Za-z0-9 .+-]+?)\.\s*Same\s+([A-Za-z0-9 .+-]+?)-level quality,\s*fewer tokens used\.?$/i;
    const RE_MODEL_REMOVED_ON = /^(.+?)\s+will be removed from Antigravity on\s+(.+?)\.?$/i;
    const RE_MODEL_PERIOD_LIMIT =
      /^(Gemini\b[\w .+-]*|Claude\b[\w .+-]*|GPT\b[\w .+-]*|Orchestrator\b[\w .+()-]*)\s+(Weekly|Daily|Monthly)\s+Limit$/i;
    const RE_QUOTA_RESET_SWITCH =
      /^Your quota for\s+(.+?)\s+will reset on\s+(.+?)\.\s*Switch to another available model to continue\.?$/i;
    const RE_QUOTA_REACHED_SWITCH =
      /^Your quota for\s+(.+?)\s+has been reached\.\s*Switch to another available model to continue\.?$/i;
    const RE_NEED_CREDITS_MODEL =
      /^You need\s+(?:at least\s+(\d+)|more)\s+AI Credits to send messages\.\s*To continue using\s+(.+?)\s+now,\s*purchase more AI Credits\.(?:\s*Your plan's baseline quota will refresh on\s+(.+?)\.)?(?:\s*To continue using this model now,\s*enable AI Credit overages\.)?$/i;
    const RE_BASELINE_QUOTA_REFRESH = /^Your plan's baseline quota will refresh on\s+(.+?)\.?$/i;
    const RE_ARIA_BRANCH = /^Branch, current:\s*(.*)$/i;
    const RE_ARIA_PROJECT = /^Select project(?:, current)?:\s*(.*)$/i;
    const RE_ARIA_LOCATION = /^(?:Where the agent runs, current|Select location(?:, current)?):\s*(.*)$/i;
    const RE_ARIA_VERSION = /^Version\s+(\d+(?:\.\d+)+(?:-[0-9A-Za-z.-]+)?(?:\s*·\s*[^\r\n]{1,32})?)$/i;
    const RE_ARIA_MODEL = /^(?:Select model|Model(?:\s+selector)?)(?:,\s*current)?:\s*(.*)$/i;
    const RE_ARIA_PERM_SEL =
      /^(?:(?:Permission mode|Agent permissions preset)\s+selector(?:,\s*current)?|(?:Permission mode|Agent permissions preset),\s*current):\s*(.*)$/i;
    const RE_ARIA_PERM_FIXED =
      /^(?:Permission mode|Agent permissions preset):\s*(.+?)(?:\s*,\s*(.+?)|\s+\((cannot be changed[^)]*)\))?$/i;
    const RE_ARIA_TURN = /^(?:Conversation turn\s+(\d+)\s+by\s+(User|Agent|Assistant)|Turn\s+(\d+)\s+of\s+(\d+))$/i;
    const RE_ARIA_GOTO_TURN = /^Go to turn\s+(\d+)\s+of\s+(\d+)$/i;
    const RE_ARIA_LOAD_OLDER = /^(?:Load\s+(\d+)\s+older\s+turns?.*|(Load|No more) older messages,\s*showing\s+(\d+)\s+of\s+(\d+))$/i;
    const RE_EFFORT_SUFFIX =
      /^(.*?)\s*(?:\((Extra\s+High|Low|Medium|High|Extra|XHigh|Max)(?:\s+thinking)?\)|\b(Extra\s+High|Low|Medium|High|Extra|XHigh|Max))(?:\s*·\s*(.+))?\s*$/i;
    const EFFORT_MAP = { low: '低', medium: '中', high: '高', extra: '超高', 'extra high': '超高', xhigh: '超高', max: '最高' };
    const MONTH_FULL_MAP = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12
    };

    function formatEnglishDateZh(dateStr) {
      const s = String(dateStr || '').trim().replace(/\.$/, '');
      const m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
      if (m) {
        const mon = MONTH_FULL_MAP[m[1].toLowerCase()] || MONTH_SHORT_MAP[m[1].slice(0, 3).toLowerCase()];
        if (mon) return m[3] + ' 年 ' + mon + ' 月 ' + m[2] + ' 日';
      }
      return s + ' ';
    }

    function formatCompactDurationZh(str) {
      const s = String(str || '').trim();
      if (s === '<1m' || s === '< 1m') return '不到 1 分钟';
      return s
        .replace(/(\d+)\s*d\b/gi, '$1 天')
        .replace(/(\d+)\s*h\b/gi, '$1 小时')
        .replace(/(\d+)\s*m\b/gi, '$1 分钟')
        .replace(/(\d+)\s*s\b/gi, '$1 秒')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function formatUpdatedAtZh(datePart, timePart) {
      if (!datePart) return '更新于 ' + timePart.trim();
      const mEnDate = datePart.trim().match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
      if (mEnDate) {
        const mNum = MONTH_SHORT_MAP[mEnDate[1].toLowerCase()];
        if (mNum) {
          return '更新于 ' + mNum + '月' + mEnDate[2] + '日 ' + timePart.trim();
        }
      }
      return '更新于 ' + datePart.trim() + ' ' + timePart.trim();
    }

    function isExcludedElement(el, batchSafeSet) {
      if (!el || el.nodeType !== 1) return true;
      if (immutableTextExclCache.get(el) === true) return true;
      if (batchSafeSet && batchSafeSet.has(el)) return false;
      if (el.closest(TEXT_IMMUTABLE_EXCLUDE_SELECTOR)) {
        if (el.isConnected) immutableTextExclCache.set(el, true);
        return true;
      }
      if (el.closest(EXCLUDE_SELECTOR)) {
        return true;
      }
      if (batchSafeSet) batchSafeSet.add(el);
      return false;
    }

    function canTranslateElementAttrs(el, batchSafeSet) {
      if (!el || el.nodeType !== 1) return false;
      if (isFormAttrTarget(el)) {
        if (immutableContainerExclCache.get(el) === true) return false;
        if (el.closest(CONTAINER_IMMUTABLE_EXCLUDE_SELECTOR)) {
          if (el.isConnected) immutableContainerExclCache.set(el, true);
          return false;
        }
        return FORM_ATTR_EXCLUDE_SELECTOR ? !el.closest(FORM_ATTR_EXCLUDE_SELECTOR) : true;
      }
      return !isExcludedElement(el, batchSafeSet);
    }

    function isInHeaderOrBreadcrumb(el) {
      return !!(el && el.closest && el.closest('header, [data-testid="breadcrumb-segment"]'));
    }

    function computeTextTranslation(raw, contextEl) {
      if (!raw) return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;

      // 1. 无原型静态词典 O(1) 精确匹配（附句尾句号自动回退；函数式 replace 防止 $&/$1 二次展开）
      let replacement = dictLookup(trimmed);
      if (typeof replacement !== 'string' && trimmed.endsWith('.')) {
        const withoutDot = dictLookup(trimmed.slice(0, -1));
        if (typeof withoutDot === 'string') {
          replacement = withoutDot.endsWith('。') ? withoutDot : withoutDot + '。';
        }
      }
      if (typeof replacement === 'string') {
        if (RE_HAS_CJK.test(replacement) && RE_PURE_ALPHA.test(raw)) {
          return replacement;
        }
        return raw.replace(trimmed, () => replacement);
      }

      // 2. 快速短路：不含任何英文字母直接跳过动态正则
      if (!RE_HAS_ALPHA.test(trimmed)) return null;

      // 3. 首字符 O(1) 分流动态正则匹配
      const c0 = trimmed.charCodeAt(0);
      if (c0 >= 48 && c0 <= 57) {
        // 以数字 '0'-'9' 开头
        if (RE_PCT_LEFT.test(trimmed)) return raw.replace(RE_PCT_LEFT, '$1% 剩余');
        const mWinComb = trimmed.match(RE_WINDOW_LIMIT_COMBINED);
        if (mWinComb) {
          const u = UNIT_MAP_SHORT[mWinComb[2].toLowerCase()] || mWinComb[2];
          return raw.replace(trimmed, () => mWinComb[1] + ' ' + u + '限额，' + formatCompactDurationZh(mWinComb[3]) + '后重置');
        }
        const mWin = trimmed.match(RE_WINDOW_LIMIT);
        if (mWin) {
          const u = UNIT_MAP_SHORT[mWin[2].toLowerCase()] || mWin[2];
          return raw.replace(trimmed, () => mWin[1] + ' ' + u + '限额');
        }
        const mRel = trimmed.match(RE_REL_TIME);
        if (mRel) {
          const unit = REL_UNIT_MAP[mRel[2].toLowerCase()] || mRel[2];
          return raw.replace(trimmed, () => mRel[1] + ' ' + unit + '前');
        }
        if (RE_UPDATES_COUNT.test(trimmed)) return raw.replace(RE_UPDATES_COUNT, '$1 条进展');
        if (RE_FILES_CHANGED.test(trimmed)) return raw.replace(RE_FILES_CHANGED, '$1 个文件变更');
        if (RE_TOOLS.test(trimmed)) return raw.replace(RE_TOOLS, '$1 个工具');
        if (RE_DEMOTED.test(trimmed)) return raw.replace(RE_DEMOTED, '$1 项已降级');
        if (RE_EXCLUDED.test(trimmed)) return raw.replace(RE_EXCLUDED, '$1 项已排除');
        if (RE_TOOLS_EXCLUDED.test(trimmed)) return raw.replace(RE_TOOLS_EXCLUDED, '$1 个工具已排除');
        if (RE_ACTIVE_CONVS.test(trimmed)) return raw.replace(RE_ACTIVE_CONVS, '$1 个进行中的对话');
        if (RE_ARCHIVED_CONVS.test(trimmed)) return raw.replace(RE_ARCHIVED_CONVS, '$1 个已归档对话');
        if (RE_PINNED_COUNT.test(trimmed)) return raw.replace(RE_PINNED_COUNT, '$1 个已固定标签页');
        if (RE_MODELS_SELECTED.test(trimmed)) return raw.replace(RE_MODELS_SELECTED, '已选择 $1 个模型');
        if (RE_BROWSER_STEPS.test(trimmed)) return raw.replace(RE_BROWSER_STEPS, '$1 个浏览器步骤');
        const mMediaAtt = trimmed.match(RE_MEDIA_ATTACHMENTS);
        if (mMediaAtt) {
          const mediaMap = { image: '图片', audio: '音频', video: '视频' };
          const mediaZh = mediaMap[mMediaAtt[2].toLowerCase()] || mMediaAtt[2];
          return raw.replace(trimmed, () => mMediaAtt[1] + ' 个' + mediaZh + '附件');
        }
        if (RE_ATTACHMENTS_COUNT.test(trimmed)) return raw.replace(RE_ATTACHMENTS_COUNT, '$1 个附件');
        if (RE_COMMENTS_COUNT.test(trimmed)) return raw.replace(RE_COMMENTS_COUNT, '$1 条评论');
        if (RE_INSTALLED_COUNT.test(trimmed)) return raw.replace(RE_INSTALLED_COUNT, '已安装 $1 项');
        if (RE_ACCOUNTS_COUNT.test(trimmed)) return raw.replace(RE_ACCOUNTS_COUNT, '$1 个账号');
        if (RE_PROJECTS_COUNT.test(trimmed)) return raw.replace(RE_PROJECTS_COUNT, '$1 个项目');
        if (RE_CALLS_MB.test(trimmed)) return raw.replace(RE_CALLS_MB, '$1 次通话 · $2');
        if (RE_TASKS_DONE.test(trimmed)) return raw.replace(RE_TASKS_DONE, '已完成 $1 / $2 项任务');
        if (RE_POSTS_COUNT.test(trimmed)) return raw.replace(RE_POSTS_COUNT, '$1 条发言');
        if (RE_MEMBERS_COUNT.test(trimmed)) return raw.replace(RE_MEMBERS_COUNT, '$1 名成员');
        if (RE_MCP_FAILED_START.test(trimmed)) return raw.replace(RE_MCP_FAILED_START, '$1 个 MCP 服务器启动失败');
        return null;
      }
      if (c0 === 43) {
        // 以 '+' 开头
        if (RE_PLUS_ATTACHMENTS.test(trimmed)) return raw.replace(RE_PLUS_ATTACHMENTS, '+$1 个附件');
        const mPlusMore = trimmed.match(RE_PLUS_MORE);
        if (mPlusMore) {
          return raw.replace(trimmed, () => (mPlusMore[2] ? '+' + mPlusMore[1] + ' 更多（显示全部）' : '+' + mPlusMore[1] + ' 更多'));
        }
        return null;
      }

      const firstUpper = trimmed[0].toUpperCase();
      if (firstUpper === 'S') {
        if (RE_SEE_ALL.test(trimmed)) return raw.replace(RE_SEE_ALL, '查看全部 ($1)');
        if (RE_SHOW_BREAKDOWNS.test(trimmed)) return raw.replace(RE_SHOW_BREAKDOWNS, '展开明细 ($1 项)');
        if (RE_SHOW_MORE_SUBAGENTS.test(trimmed)) return raw.replace(RE_SHOW_MORE_SUBAGENTS, '显示另外 $1 个子 Agent');
        if (RE_SHOW_EARLIER_STEPS.test(trimmed)) return raw.replace(RE_SHOW_EARLIER_STEPS, '展开前 $1 个步骤');
        if (RE_SORT_FILTER_ACTIVE.test(trimmed)) return raw.replace(RE_SORT_FILTER_ACTIVE, '排序与筛选对话（已启用 $1 项）');
        if (RE_STILL_THINKING_SEC.test(trimmed)) return raw.replace(RE_STILL_THINKING_SEC, '仍在思考（$1 秒）');
        if (RE_SEARCH_GOOGLE.test(trimmed)) return raw.replace(RE_SEARCH_GOOGLE, (_, q) => '使用 Google 搜索“' + q + '”');
        if (!isInHeaderOrBreadcrumb(contextEl)) {
          const mSearch = trimmed.match(RE_EPHEMERAL_ACTIVE);
          if (mSearch) {
            const noun = EPHEMERAL_NOUN_MAP[mSearch[2].toLowerCase()];
            const out = noun ? joinZhVerbNoun(EPHEMERAL_VERB_MAP[mSearch[1]], noun) : EPHEMERAL_VERB_MAP[mSearch[1]] + ' ' + mSearch[2];
            return raw.replace(trimmed, () => out);
          }
        }
      } else if (firstUpper === 'P') {
        if (RE_PERM_DELETE.test(trimmed)) {
          return raw.replace(RE_PERM_DELETE, (_, target, cnt) => '永久删除 ' + target + ' 及 ' + cnt + ' 个进行中的对话。');
        }
      } else if (firstUpper === 'W' || firstUpper === 'M') {
        const mNamed = trimmed.match(RE_NAMED_LIMIT_RESETS);
        if (mNamed) {
          const pZh = NAMED_PERIOD_MAP[mNamed[1].toLowerCase()] || mNamed[1];
          return raw.replace(trimmed, () => pZh + '限额，' + formatCompactDurationZh(mNamed[2]) + '后重置');
        }
        if (firstUpper === 'W') {
          if (RE_WORKED_FOR_UPDATES.test(trimmed)) {
            return raw.replace(RE_WORKED_FOR_UPDATES, (_, dur, cnt) => '已工作 ' + dur.trim() + ' · ' + cnt + ' 条进展');
          }
          if (RE_WORKED_FOR.test(trimmed)) return raw.replace(RE_WORKED_FOR, '已工作 $1');
          if (RE_WAITING_CMD_SEC.test(trimmed)) {
            return raw.replace(RE_WAITING_CMD_SEC, '正在等待命令完成（最多 $1 秒）');
          }
          const mWel = trimmed.match(RE_HOME_WELCOME_NAME);
          if (mWel) {
            return raw.replace(trimmed, () => '欢迎回来，' + mWel[1].trim() + '。我们从哪里继续？');
          }
          const mWorkLocal = trimmed.match(RE_WORK_LOCALLY_ON);
          if (mWorkLocal) {
            return raw.replace(trimmed, () => '在本地 ' + mWorkLocal[1].trim() + ' 中工作');
          }
          const mWorkFrom = trimmed.match(RE_WORKTREE_FROM);
          if (mWorkFrom) {
            return raw.replace(
              trimmed,
              () =>
                mWorkFrom[2]
                  ? '从 ' + mWorkFrom[1].trim() + ' 创建 Worktree，并复用 ' + mWorkFrom[2].trim()
                  : '从 ' + mWorkFrom[1].trim() + ' 创建 Worktree'
            );
          }
          const mWorkIn = trimmed.match(RE_WORK_IN_TARGET);
          if (mWorkIn) {
            return raw.replace(trimmed, () => '在 ' + mWorkIn[1].trim() + ' 中工作');
          }
        } else if (RE_MARKED_READ.test(trimmed)) {
          return raw.replace(RE_MARKED_READ, '已将 $1 个对话标为已读');
        }
      } else if (firstUpper === 'T') {
        if (RE_THOUGHT_FOR.test(trimmed)) return raw.replace(RE_THOUGHT_FOR, '已思考 $1');
        if (RE_THINKING_FOR.test(trimmed)) return raw.replace(RE_THINKING_FOR, '已思考 $1');
        if (RE_DELETE_RECORDINGS_CONFIRM.test(trimmed)) {
          return raw.replace(
            RE_DELETE_RECORDINGS_CONFIRM,
            '这将从您的设备中删除 $1 条通话录音（$2），此操作无法撤销。'
          );
        }
      } else if (firstUpper === 'E' || firstUpper === 'R' || firstUpper === 'L') {
        if (firstUpper === 'R') {
          const mResets = trimmed.match(RE_RESETS_IN);
          if (mResets) {
            return raw.replace(trimmed, () => formatCompactDurationZh(mResets[1]) + '后重置');
          }
        }
        if (RE_EPHEMERAL_SUMMARY.test(trimmed)) {
          const translatedSummary = trimmed
            .split(/,\s*/)
            .map((part) => translateEphemeralClause(part))
            .join('、');
          return raw.replace(trimmed, () => translatedSummary);
        }
        const inHdr = isInHeaderOrBreadcrumb(contextEl);
        if (!inHdr) {
          const mActive = trimmed.match(RE_EPHEMERAL_ACTIVE);
          if (mActive) {
            const noun = EPHEMERAL_NOUN_MAP[mActive[2].toLowerCase()];
            const out = noun ? joinZhVerbNoun(EPHEMERAL_VERB_MAP[mActive[1]], noun) : EPHEMERAL_VERB_MAP[mActive[1]] + ' ' + mActive[2];
            return raw.replace(trimmed, () => out);
          }
        }
        if (firstUpper === 'R') {
          if (RE_RUNNING_FOR.test(trimmed)) {
            return raw.replace(RE_RUNNING_FOR, '已运行 $1');
          }
          if (!inHdr && RE_RUNNING_CMD.test(trimmed)) {
            return raw.replace(RE_RUNNING_CMD, (_, cmd) => '正在运行 ' + cmd);
          }
        }
      } else if (firstUpper === 'D') {
        const mNamedD = trimmed.match(RE_NAMED_LIMIT_RESETS);
        if (mNamedD) {
          const pZh = NAMED_PERIOD_MAP[mNamedD[1].toLowerCase()] || mNamedD[1];
          return raw.replace(trimmed, () => pZh + '限额，' + formatCompactDurationZh(mNamedD[2]) + '后重置');
        }
        if (RE_DELETED_RECORDINGS.test(trimmed)) {
          return raw.replace(RE_DELETED_RECORDINGS, '已删除 $1 条录音 ($2)');
        }
      } else if (firstUpper === 'U') {
        if (RE_USING_BROWSER_SEC.test(trimmed)) {
          return raw.replace(RE_USING_BROWSER_SEC, '正在操作浏览器 ($1s)');
        }
        if (RE_UP_NEXT_COUNT.test(trimmed)) {
          return raw.replace(RE_UP_NEXT_COUNT, '接下来 · $1');
        }
        const mLocalClone = trimmed.match(RE_USES_LOCAL_CLONE);
        if (mLocalClone) {
          return raw.replace(trimmed, () => '使用本地克隆：' + mLocalClone[1].trim());
        }
        const mUpd = trimmed.match(RE_UPDATED_AT);
        if (mUpd) {
          return raw.replace(trimmed, () => formatUpdatedAtZh(mUpd[1], mUpd[2]));
        }
      } else if (firstUpper === 'V') {
        const mVer = trimmed.match(RE_ARIA_VERSION);
        if (mVer) {
          return raw.replace(trimmed, () => '版本 ' + mVer[1].trim());
        }
      } else if (firstUpper === 'Z') {
        if (RE_ZIPPING_FOLDER.test(trimmed)) {
          return raw.replace(RE_ZIPPING_FOLDER, (_, folder) => '正在打包 ' + folder + '…');
        }
      } else if (firstUpper === 'N') {
        if (trimmed === 'New' || trimmed === 'NEW') {
          const btn = contextEl && contextEl.closest && contextEl.closest('button');
          const isActionBtn = !!(
            btn &&
            !btn.hasAttribute('data-model-label') &&
            !(contextEl && contextEl.closest && contextEl.closest('[data-testid*="model-selector"]')) &&
            (btn.textContent || '').replace(/\badd\b|\+/gi, '').trim() === trimmed
          );
          return raw.replace(trimmed, () => (isActionBtn ? '新建' : '新'));
        }
      } else if (firstUpper === 'O') {
        if (RE_ORCHESTRATOR_MODEL.test(trimmed)) {
          return raw.replace(RE_ORCHESTRATOR_MODEL, '编排器 ($1)');
        }
      } else if (firstUpper === 'Y') {
        const mUsed = trimmed.match(RE_USED_LIMIT);
        if (mUsed) {
          const degreeMap = { some: '部分', all: '全部', most: '大部分' };
          const typeMap = { weekly: '每周', '5-hour': '5 小时', 'five-hour': '5 小时', daily: '每日' };
          const degree = degreeMap[mUsed[1].toLowerCase()] || mUsed[1];
          const type = typeMap[mUsed[2].toLowerCase()] || mUsed[2];
          const timeStr = mUsed[3]
            .replace(/\.$/, '')
            .replace(/(\d+)\s*days?/gi, '$1 天')
            .replace(/(\d+)\s*hours?/gi, '$1 小时')
            .replace(/(\d+)\s*minutes?/gi, '$1 分钟')
            .replace(/(\d+)\s*seconds?/gi, '$1 秒')
            .replace(/,\s*/g, ' ')
            .trim();
          return '您已消耗' + degree + type + '额度，将在 ' + timeStr + ' 后完全重置。';
        }
        const mNotUsed = trimmed.match(RE_NOT_USED_LIMIT);
        if (mNotUsed) {
          const typeMap = { weekly: '每周', '5-hour': '5 小时', 'five-hour': '5 小时', daily: '每日' };
          const type = typeMap[mNotUsed[1].toLowerCase()] || mNotUsed[1];
          return '您尚未消耗任何' + type + '额度。';
        }
        if (RE_QUOTA_RESET_SWITCH.test(trimmed)) {
          return raw.replace(RE_QUOTA_RESET_SWITCH, (_, m, dt) => '您的 ' + (dictLookup(m.trim()) || m.trim()) + ' 配额将于 ' + dt + ' 重置，请切换至其他可用模型以继续。');
        }
        if (RE_QUOTA_REACHED_SWITCH.test(trimmed)) {
          return raw.replace(RE_QUOTA_REACHED_SWITCH, (_, m) => '您的 ' + (dictLookup(m.trim()) || m.trim()) + ' 配额已用尽，请切换至其他可用模型以继续。');
        }
        const mNeedCred = trimmed.match(RE_NEED_CREDITS_MODEL);
        if (mNeedCred) {
          const amtPart = mNeedCred[1] ? '至少 ' + mNeedCred[1] + ' 点' : '更多';
          const modName = mNeedCred[2].trim() === 'this model' ? '该模型' : dictLookup(mNeedCred[2].trim()) || mNeedCred[2].trim();
          let out = '发送消息需要' + amtPart + ' AI 点数。若需立即继续使用 ' + modName + '，请购买更多 AI 点数。';
          if (mNeedCred[3]) out += ' 您套餐的基础配额将于 ' + mNeedCred[3] + ' 刷新。';
          if (/enable AI Credit overages/i.test(trimmed)) out += ' 若需立即继续使用该模型，请开启 AI 点数超额使用。';
          return out;
        }
        if (RE_BASELINE_QUOTA_REFRESH.test(trimmed)) {
          return raw.replace(RE_BASELINE_QUOTA_REFRESH, '您套餐的基础配额将于 $1 刷新。');
        }
      } else if (firstUpper === 'H') {
        const mHey = trimmed.match(RE_HOME_HEY_NAME);
        if (mHey) {
          return raw.replace(trimmed, () => '嗨，' + mHey[1].trim() + '，今天想做点什么？');
        }
      } else if (firstUpper === 'G') {
        const mGood = trimmed.match(RE_HOME_GOOD_SEE_NAME);
        if (mGood) {
          return raw.replace(trimmed, () => '很高兴见到你，' + mGood[1].trim() + '。接下来做什么？');
        }
      } else if (firstUpper === 'A') {
        const mAutoFig = trimmed.match(RE_AUTO_FIG_WORKSPACE);
        if (mAutoFig) {
          return raw.replace(
            trimmed,
            () =>
              '对话开始时自动新建 ' +
              mAutoFig[1] +
              ' 工作区' +
              (mAutoFig[2] ? '，从 ' + mAutoFig[2].trim() + ' 创建 Worktree' : '') +
              (mAutoFig[3] ? '，并复用 ' + mAutoFig[3].trim() : '')
          );
        }
      }

      // 跨首字母动态模型提示与限额规则（长度与特征子串前置门控，防止长文本回溯与普通英语短语误伤）
      if (trimmed.length < 220 && trimmed.includes('offload routine steps')) {
        const mOffload = trimmed.match(RE_MODEL_OFFLOAD_DESC);
        if (mOffload) {
          return raw.replace(
            trimmed,
            () =>
              '可将常规步骤分流至 ' +
              mOffload[2] +
              ' 执行的 ' +
              mOffload[1] +
              ' 编排模型。保持 ' +
              mOffload[3] +
              ' 同等质量，消耗更少 Token。'
          );
        }
      }
      if (trimmed.length < 160 && trimmed.includes('removed from Antigravity')) {
        const mRemoved = trimmed.match(RE_MODEL_REMOVED_ON);
        if (mRemoved) {
          return raw.replace(
            trimmed,
            () => mRemoved[1].trim() + ' 将于 ' + formatEnglishDateZh(mRemoved[2]) + '从 Antigravity 下线。'
          );
        }
      }
      if (trimmed.length < 80 && (firstUpper === 'G' || firstUpper === 'C' || firstUpper === 'O')) {
        const mPeriodLim = trimmed.match(RE_MODEL_PERIOD_LIMIT);
        if (mPeriodLim) {
          const pZh = NAMED_PERIOD_MAP[mPeriodLim[2].toLowerCase()] || mPeriodLim[2];
          return raw.replace(trimmed, () => mPeriodLim[1].trim() + ' ' + pZh + '限额');
        }
      }

      if (trimmed.length < 64) {
        if (RE_KEY_QUEUES_AFTER.test(trimmed)) {
          return raw.replace(RE_KEY_QUEUES_AFTER, '$1 当前轮次结束后排队发送');
        }
        if (RE_KEY_SENDS_IMMEDIATELY.test(trimmed)) {
          return raw.replace(RE_KEY_SENDS_IMMEDIATELY, '$1 立即发送');
        }
        if (RE_KEY_EMPTY_NEXT_QUEUE.test(trimmed)) {
          return raw.replace(RE_KEY_EMPTY_NEXT_QUEUE, '$1 输入为空时发送队列下一条');
        }
      }

      return null;
    }

    function translateTextNode(node) {
      const currentVal = node.nodeValue;
      if (!currentVal) return;

      const rec = origTextMap.get(node);
      if (rec && rec.lastVal === currentVal && rec.ver === PATCH_VERSION) {
        return;
      }
      const origRaw = rec && rec.lastVal === currentVal ? rec.origRaw : currentVal;

      const nextVal = computeTextTranslation(origRaw, node.parentElement);
      if (nextVal !== null) {
        origTextMap.set(node, { origRaw, lastVal: nextVal, ver: PATCH_VERSION });
        if (node.nodeValue !== nextVal) {
          node.nodeValue = nextVal;
        }
      } else if (rec && rec.lastVal === currentVal) {
        node.nodeValue = origRaw;
        origTextMap.delete(node);
      }
    }

    function translateSingleAttr(el, attrName, origDataAttr, customResolver) {
      const verProp = '__ag_attr_ver_' + attrName;
      const lastDataAttr = origDataAttr + '-last';
      const cur = el.getAttribute(attrName);
      if (!cur) {
        if (el.hasAttribute(origDataAttr)) el.removeAttribute(origDataAttr);
        if (el.hasAttribute(lastDataAttr)) el.removeAttribute(lastDataAttr);
        delete el[verProp];
        return;
      }
      const savedOrig = el.getAttribute(origDataAttr);
      const savedLast = el.getAttribute(lastDataAttr);
      if (savedOrig !== null && savedLast === cur && el[verProp] === PATCH_VERSION) {
        return;
      }
      const origVal = savedOrig !== null && savedLast === cur ? savedOrig : cur;
      const trimmed = origVal.trim();
      const shouldSkipAttr = attrName === 'aria-label' && SKIP_ARIA_LABEL_VALUES.has(trimmed);
      const nextVal = shouldSkipAttr
        ? null
        : customResolver
        ? customResolver(trimmed, el)
        : typeof dictLookup(trimmed) === 'string'
        ? dictLookup(trimmed)
        : null;
      if (typeof nextVal === 'string') {
        if (savedOrig !== origVal) el.setAttribute(origDataAttr, origVal);
        if (savedLast !== nextVal) el.setAttribute(lastDataAttr, nextVal);
        el[verProp] = PATCH_VERSION;
        if (cur !== nextVal) {
          el.setAttribute(attrName, nextVal);
        }
      } else {
        if (savedOrig !== null && savedLast === cur) {
          el.setAttribute(attrName, savedOrig);
        }
        if (savedOrig !== null) el.removeAttribute(origDataAttr);
        if (savedLast !== null) el.removeAttribute(lastDataAttr);
        el[verProp] = PATCH_VERSION;
      }
    }

    function resolveAttrTranslation(atrim, el) {
      const directHit = dictLookup(atrim);
      if (typeof directHit === 'string') return directHit;
      const mModel = atrim.match(RE_ARIA_MODEL);
      if (mModel) {
        let mName = mModel[1].trim();
        if (mName === 'Select model' || mName === 'Select Model') return '模型，当前：选择模型';
        const directModelZh = dictLookup(mName) || computeTextTranslation(mName, el);
        if (directModelZh) {
          mName = directModelZh;
        } else {
          const mEff = mName.match(RE_EFFORT_SUFFIX);
          if (mEff) {
            const effRaw = mEff[2] || mEff[3];
            const effZh = EFFORT_MAP[effRaw.replace(/\s+/g, ' ').toLowerCase()] || effRaw;
            const baseRaw = mEff[1].trim();
            const baseZh = dictLookup(baseRaw) || computeTextTranslation(baseRaw, el) || baseRaw;
            const ctxTail = mEff[4] ? ' · ' + mEff[4].trim() : '';
            mName = baseZh + (mEff[2] ? ' (' + effZh + ')' : ' · ' + effZh) + ctxTail;
          }
        }
        return '模型，当前：' + mName;
      }
      const lookupPerm = (s) =>
        dictLookup(s) || dictLookup(s.charAt(0).toUpperCase() + s.slice(1)) || s;
      const mPermSel = atrim.match(RE_ARIA_PERM_SEL);
      if (mPermSel) {
        const pMode = mPermSel[1].trim();
        return '权限模式，当前：' + lookupPerm(pMode);
      }
      const mPermFixed = atrim.match(RE_ARIA_PERM_FIXED);
      if (mPermFixed) {
        const pMode = mPermFixed[1].trim();
        const rawNote = (mPermFixed[2] || mPermFixed[3] || '').trim();
        if (!rawNote) {
          return '权限模式：' + lookupPerm(pMode);
        }
        const mappedNote =
          rawNote.toLowerCase() === 'cannot be changed mid-conversation'
            ? '对话中途无法更改'
            : dictLookup(rawNote) || computeTextTranslation(rawNote, el) || rawNote;
        return '权限模式：' + lookupPerm(pMode) + '（' + mappedNote + '）';
      }
      const mGoTurn = atrim.match(RE_ARIA_GOTO_TURN);
      if (mGoTurn) {
        return '跳转至第 ' + mGoTurn[1] + ' / ' + mGoTurn[2] + ' 轮对话';
      }
      const mTurn = atrim.match(RE_ARIA_TURN);
      if (mTurn) {
        if (mTurn[3] && mTurn[4]) {
          return '第 ' + mTurn[3] + ' / ' + mTurn[4] + ' 轮对话';
        }
        const roleZh = mTurn[2].toLowerCase() === 'user' ? '用户' : 'Agent';
        return '第 ' + mTurn[1] + ' 轮对话（' + roleZh + '）';
      }
      const mOlder = atrim.match(RE_ARIA_LOAD_OLDER);
      if (mOlder) {
        if (mOlder[3] && mOlder[4]) {
          return (/^no/i.test(mOlder[2]) ? '没有更早的消息' : '加载更早的消息') + '（当前显示 ' + mOlder[3] + ' / ' + mOlder[4] + '）';
        }
        return '加载更早的 ' + mOlder[1] + ' 轮对话';
      }
      const mBranch = atrim.match(RE_ARIA_BRANCH);
      if (mBranch) {
        const bName = mBranch[1].trim();
        return '分支，当前：' + (bName === 'Select branch' ? '选择分支' : bName);
      }
      const mProj = atrim.match(RE_ARIA_PROJECT);
      if (mProj) {
        const pName = mProj[1].trim();
        return '选择项目，当前：' + (pName === 'No project' || pName === 'No Project' ? '未关联项目' : pName);
      }
      const mLoc = atrim.match(RE_ARIA_LOCATION);
      if (mLoc) {
        const locName = mLoc[1].trim();
        const mappedLoc =
          locName === 'This Computer' ? '本机' : locName === 'Remote' ? '远程' : dictLookup(locName) || locName;
        return 'Agent 运行位置，当前：' + mappedLoc;
      }
      const mVer = atrim.match(RE_ARIA_VERSION);
      if (mVer) {
        return '版本 ' + mVer[1].trim();
      }
      if (
        atrim === 'File' &&
        (IS_SWARM_PLUGIN_FRAME || (el && el.classList && el.classList.contains('segmented')))
      ) {
        return '文件';
      }
      if (
        el &&
        el.getAttribute &&
        el.getAttribute('data-testid') === 'running-row-stop' &&
        /^Stop\s+(.+)$/i.test(atrim)
      ) {
        return '停止 ' + atrim.replace(/^Stop\s+/i, '');
      }
      return computeTextTranslation(atrim, el);
    }

    function translateElementAttrs(el) {
      if (!el || el.nodeType !== 1) return;
      translateSingleAttr(el, 'title', 'data-ag-orig-title', resolveAttrTranslation);
      translateSingleAttr(el, 'placeholder', 'data-ag-orig-placeholder', resolveAttrTranslation);
      translateSingleAttr(el, 'aria-label', 'data-ag-orig-aria-label', resolveAttrTranslation);
    }

    const walkerFilter = {
      acceptNode(node) {
        if (node.nodeType === 1) {
          if (node.matches && node.matches(EXCLUDE_SELECTOR)) {
            if (node.isConnected && node.matches(TEXT_IMMUTABLE_EXCLUDE_SELECTOR)) {
              immutableTextExclCache.set(node, true);
            }
            if (
              isFormAttrTarget(node) &&
              canTranslateElementAttrs(node) &&
              (node.hasAttribute('title') || node.hasAttribute('aria-label') || node.hasAttribute('placeholder'))
            ) {
              translateElementAttrs(node);
            }
            return NodeFilter.FILTER_REJECT;
          }
          if (
            node.hasAttribute &&
            (node.hasAttribute('title') || node.hasAttribute('aria-label') || node.hasAttribute('placeholder'))
          ) {
            translateElementAttrs(node);
          }
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    };

    function scanAndTranslate(root = document.body) {
      if (!root) return;
      if (root.nodeType === 3) {
        if (root.parentElement && !isExcludedElement(root.parentElement)) {
          translateTextNode(root);
        }
        return;
      }
      if (root.nodeType !== 1) return;
      if (isExcludedElement(root)) {
        if (
          isFormAttrTarget(root) &&
          canTranslateElementAttrs(root) &&
          (root.hasAttribute('title') || root.hasAttribute('aria-label') || root.hasAttribute('placeholder'))
        ) {
          translateElementAttrs(root);
        }
        return;
      }

      if (
        root.hasAttribute &&
        (root.hasAttribute('title') || root.hasAttribute('aria-label') || root.hasAttribute('placeholder'))
      ) {
        translateElementAttrs(root);
      }

      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        walkerFilter
      );
      while (walker.nextNode()) {
        translateTextNode(walker.currentNode);
      }
    }

    scanBodyFn = scanAndTranslate;
    if (document.body) {
      scanAndTranslate(document.body);
    }

    const dirtyRoots = new Set();
    let pending = false;
    let fallbackTimer = null;

    function flushTranslations() {
      pending = false;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      if (dirtyRoots.size === 0) return;

      if (dirtyRoots.size > 200) {
        dirtyRoots.clear();
        try {
          scanAndTranslate(document.body);
        } catch (e) {}
        return;
      }

      const roots = Array.from(dirtyRoots);
      const rootSet = new Set(roots);
      dirtyRoots.clear();

      for (let i = 0; i < roots.length; i++) {
        const r = roots[i];
        if (!r || !r.isConnected) continue;
        let covered = false;
        for (let p = r.parentNode; p; p = p.parentNode) {
          if (rootSet.has(p)) {
            covered = true;
            break;
          }
        }
        if (!covered) {
          try {
            scanAndTranslate(r);
          } catch (e) {}
        }
      }
    }

    function scheduleFlush() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(flushTranslations);
      fallbackTimer = setTimeout(flushTranslations, 80);
    }

    window.__ag_i18n_observer = new MutationObserver((mutations) => {
      const batchSafeSet = new Set();
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'characterData') {
          const t = m.target;
          if (t && t.parentElement && !isExcludedElement(t.parentElement, batchSafeSet)) {
            dirtyRoots.add(t);
          }
        } else if (m.type === 'attributes') {
          const el = m.target;
          if (el && el.nodeType === 1 && canTranslateElementAttrs(el, batchSafeSet)) {
            try {
              translateElementAttrs(el);
            } catch (e) {}
          }
        } else if (m.type === 'childList' && m.addedNodes.length > 0) {
          if (m.target && m.target.nodeType === 1 && isExcludedElement(m.target, batchSafeSet)) {
            continue;
          }
          for (let j = 0; j < m.addedNodes.length; j++) {
            const n = m.addedNodes[j];
            if (n.nodeType === 1 || n.nodeType === 3) {
              dirtyRoots.add(n);
            }
          }
        }
      }
      if (dirtyRoots.size > 0) {
        scheduleFlush();
      }
    });

    if (document.body) {
      window.__ag_i18n_observer.observe(document.body, I18N_OBS_OPTS);
    }
  } else if (document.body) {
    // 若用户在配置中关闭了 i18n 模块，实时将已翻译的文本与属性还原为原始英文
    restoreAllTranslations(document.body);
  }

  // 若由 Page.addScriptToEvaluateOnNewDocument 在 <head> 早期触发（此时 document.body === null），
  // 挂载单次 DOMContentLoaded 钩子，确保样式排在原生 <link> 之后，并在 body 就绪后完成监听挂载
  if (document.body) {
    window.__ag_body_ready = true;
  } else {
    window.__ag_body_ready = false;
    window.__ag_dcl_handler = () => {
      window.__ag_dcl_handler = null;
      ensureStylesAtEndOfHead();
      if (document.body) {
        if (window.__ag_theme_mode_observer) {
          try {
            window.__ag_theme_mode_observer.observe(document.body, {
              attributes: true,
              attributeFilter: ['class']
            });
          } catch (e) {}
        } else if (typeof MutationObserver !== 'undefined') {
          try {
            const modeObs = new MutationObserver(() => {
              if (typeof window.__ag_sync_preset_fn === 'function') {
                window.__ag_sync_preset_fn();
              }
            });
            modeObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
            if (document.documentElement) {
              modeObs.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'style', 'data-theme']
              });
            }
            window.__ag_theme_mode_observer = modeObs;
          } catch (e) {}
        }
      }
      syncChuanbanPreset();
      checkRouteAndMountMetrics();
      if (MODULES.i18n && document.body) {
        if (typeof scanBodyFn === 'function') {
          try {
            scanBodyFn(document.body);
          } catch (e) {}
        }
        if (window.__ag_i18n_observer) {
          try {
            window.__ag_i18n_observer.disconnect();
            window.__ag_i18n_observer.observe(document.body, I18N_OBS_OPTS);
          } catch (e) {}
        }
      } else if (!MODULES.i18n && document.body) {
        restoreAllTranslations(document.body);
      }
      window.__ag_body_ready = true;
    };
    window.addEventListener('DOMContentLoaded', window.__ag_dcl_handler, { once: true });
  }

  // ============================================================================
  // 5. 开放用户自定义前端脚本钩子 (user/custom.js，沙箱异常隔离，同时提供 ctx 与 boot)
  // ============================================================================
  window.__AG_PATCH_CTX__ = {
    version: PATCH_VERSION,
    preset: DEFAULT_PRESET,
    config: boot.config || {},
    modules: MODULES,
    features: MODULES,
    themeVars: THEME_VARS,
    dict: DICT,
    get metrics() {
      return window.__ag_last_metrics || null;
    },
    syncPreset: syncChuanbanPreset,
    ensureMetricsPill,
    onCleanup(fn) {
      if (typeof fn === 'function') {
        window.__ag_cleanup_fns.push(fn);
      }
    }
  };

  if (MODULES.customJs && boot.customJs && typeof boot.customJs === 'string' && boot.customJs.trim()) {
    try {
      const fn = new Function('ctx', 'boot', boot.customJs);
      fn(window.__AG_PATCH_CTX__, window.__AG_PATCH_CTX__);
    } catch (err) {
      console.error('[Antigravity Patch] Error in user/custom.js:', err);
    }
  }
})(__AG_BOOT_PAYLOAD__);
