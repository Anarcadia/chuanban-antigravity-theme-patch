/**
 * chuanban-antigravity-theme-patch · Browser Runtime Engine (core/runtime.js)
 * 纯正浏览器端注入脚本（零模板字符串双重转义）。
 * 由 core/daemon.mjs 读取并将文件末尾的启动载荷占位符替换为实时配置与资源对象。
 */
(function runBoot(boot, fromDcl) {
  // 0. 顶层窗口隔离：仅允许主窗口与官方内置 Swarm 协作侧栏插件帧（绝不注入 Artifact / HTML 预览等子 iframe）
  const IS_SWARM_PLUGIN_FRAME = !!(
    window.location &&
    ((window.location.protocol === 'plugin:' && /^swarm--/i.test(window.location.hostname || '')) ||
      /^plugin:\/\/swarm--/i.test(String(window.location.href || '')))
  );
  if (window.top !== window && !IS_SWARM_PLUGIN_FRAME) return;
  if (!boot || typeof boot !== 'object') return;

  if (window.__ag_boot_dcl_handler) {
    try {
      window.removeEventListener('DOMContentLoaded', window.__ag_boot_dcl_handler);
    } catch (e) {}
    window.__ag_boot_dcl_handler = null;
  }
  if (window.__ag_boot_doc_observer) {
    try {
      window.__ag_boot_doc_observer.disconnect();
    } catch (e) {}
    window.__ag_boot_doc_observer = null;
  }

  const isPreloadHost = () => {
    if (IS_SWARM_PLUGIN_FRAME || (window.location && window.location.protocol === 'vscode-file:')) {
      return true;
    }
    if (window.__APP_CONFIG__ && window.__APP_CONFIG__.productName === 'antigravity') {
      return true;
    }
    return !!(
      window.electronNative &&
      ((typeof window.electronNative.setTitleBarOverlay === 'function' &&
        window.nativeStorage &&
        typeof window.nativeStorage.getItems === 'function') ||
        (typeof window.electronNative.getZoomLevel === 'function' &&
          window.electronNative.wcvBrowser &&
          typeof window.electronNative.wcvBrowser.setThemeColor === 'function'))
    );
  };

  const isAntigravityHost = () => {
    if (isPreloadHost()) return true;
    return !!(
      typeof document !== 'undefined' &&
      typeof document.querySelector === 'function' &&
      document.querySelector(
        'link[href*="/jetbox.css"], body[data-agy-theme], body[data-newux-theme], [id="antigravity.agentSidePanelInputBox"]'
      )
    );
  };

  const scheduleBootOnDcl = () => {
    if (typeof window.addEventListener !== 'function') return;
    window.__ag_boot_dcl_handler = () => {
      window.__ag_boot_dcl_handler = null;
      runBoot(boot, true);
    };
    window.addEventListener('DOMContentLoaded', window.__ag_boot_dcl_handler, { once: true });
  };

  if (typeof document === 'undefined' || !document.documentElement) {
    if (typeof document !== 'undefined') {
      // 主窗口 Preload 桥接已就绪但 <html> 尚未创建（NewDocument 0ms）：监听节点诞生微秒级瞬时挂载防闪白
      if (isPreloadHost() && typeof MutationObserver === 'function') {
        try {
          const obs = new MutationObserver(() => {
            if (document.documentElement) {
              try {
                obs.disconnect();
              } catch (e) {}
              window.__ag_boot_doc_observer = null;
              runBoot(boot, false);
            }
          });
          window.__ag_boot_doc_observer = obs;
          obs.observe(document, { childList: true });
        } catch (e) {}
      }
      if (!fromDcl && document.readyState === 'loading') {
        scheduleBootOnDcl();
      }
    }
    return;
  }

  if (!isAntigravityHost()) {
    if (!fromDcl && document.readyState === 'loading') {
      scheduleBootOnDcl();
      return;
    }
    window.__ag_skip_non_host = true;
    return;
  }

  if (window.__ag_skip_non_host) {
    try {
      delete window.__ag_skip_non_host;
    } catch (e) {
      window.__ag_skip_non_host = false;
    }
  }

  const PATCH_VERSION = boot.version || '20261119-v5.5.1';
  const DETECTED_OS =
    boot.platform || (/Win/i.test(navigator.platform || '') ? 'win32' : /Mac/i.test(navigator.platform || '') ? 'darwin' : 'linux');
  const ENABLED = boot.enabled !== false;
  const CSS_TEXT = boot.cssText || '';
  const CUSTOM_CSS_TEXT = boot.customCss || '';
  const THEME_VARS = boot.themeVars && typeof boot.themeVars === 'object' ? boot.themeVars : {};
  const DARK_THEME_VARS = boot.darkThemeVars && typeof boot.darkThemeVars === 'object' ? boot.darkThemeVars : {};
  const MODULES = Object.assign(
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
    boot.modules || {}
  );

  const DEFAULT_PRESET = boot.preset || 'high-contrast';
  const DEFAULT_DARK_PRESET = boot.darkPreset || 'onyx';
  const DEFAULT_EXCLUDE_I18N =
    'code, pre, kbd, samp, textarea, input, style, script, noscript, [contenteditable="true"], [data-markdown-root], [data-testid="user-message-content"], .agy-user-bubble, .monaco-editor, .monaco-diff-editor, .xterm, [class*="onyx-key"], .prose, .markdown, [class*="chat-message"], [class*="group/file-title"], [data-testid="conversation-row-sidebar"] a[href^="/c/"], [data-testid="conversation-row-sidebar"] span.truncate, [data-testid="conversation-row-history"] a[href^="/c/"], [data-testid="conversation-row-history"] span.truncate, [data-testid="conversation-navigator-turn"], .msg-body, #raw, [data-testid="swarm-raw"], #swarm-title, #ag-live-metrics-pill, .ag-live-metrics-pill, [data-ag-metrics-pill], #ag-live-metrics-tooltip';

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
  if (window.__ag_metrics_ro) {
    try {
      window.__ag_metrics_ro.disconnect();
    } catch (e) {}
    window.__ag_metrics_ro = null;
    window.__ag_metrics_ro_target = null;
    window.__ag_metrics_ro_observed = null;
    window.__ag_last_metrics_layout_sig = '';
  }
  if (window.__ag_metrics_raf) {
    try {
      cancelAnimationFrame(window.__ag_metrics_raf);
    } catch (e) {}
    window.__ag_metrics_raf = 0;
  }
  window.__ag_watched_cascade_sig = undefined;
  try {
    document.querySelectorAll('#ag-live-metrics-pill, .ag-live-metrics-pill, [data-ag-metrics-pill]').forEach((el) => {
      if (el.getAttribute('data-ag-pill-ver') !== PATCH_VERSION) {
        el.remove();
      }
    });
    const staleTt = document.getElementById('ag-live-metrics-tooltip');
    if (staleTt && staleTt.getAttribute('data-ag-tt-ver') !== PATCH_VERSION) {
      staleTt.remove();
    }
  } catch (e) {}
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
  if (window.__ag_metrics_tt_hide_timer) {
    try {
      clearTimeout(window.__ag_metrics_tt_hide_timer);
    } catch (e) {}
    window.__ag_metrics_tt_hide_timer = null;
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

  function applyThemeVars(varsObj, darkVarsObj = {}) {
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

    const darkKeys = Object.keys(darkVarsObj || {});
    for (let i = 0; i < darkKeys.length; i++) {
      const k = darkKeys[i];
      const v = darkVarsObj[k];
      if (!k.startsWith('--') || v === null || v === undefined || String(v).trim() === '') continue;
      const cleanVal = String(v).trim().replace(/[;{}]/g, '');
      darkDecls.push(`${k}: ${cleanVal} !important;`);
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
    const sSwarmFont = document.getElementById('ag-swarm-google-fonts');
    if (sSwarmFont) sSwarmFont.remove();
    const sGsfFont = document.getElementById('ag-google-sans-flex-fonts');
    if (sGsfFont) sGsfFont.remove();
    try {
      document.querySelectorAll('#ag-live-metrics-pill, .ag-live-metrics-pill, [data-ag-metrics-pill]').forEach((el) => el.remove());
      document.querySelectorAll('[data-ag-row-mode]').forEach((el) => el.removeAttribute('data-ag-row-mode'));
    } catch (e) {}
    const tt = document.getElementById('ag-live-metrics-tooltip');
    if (tt) tt.remove();
    if (window.__ag_metrics_tt_hide_timer) {
      try {
        clearTimeout(window.__ag_metrics_tt_hide_timer);
      } catch (e) {}
      window.__ag_metrics_tt_hide_timer = null;
    }
    window.__ag_active_tooltip_pill = null;
    window.__ag_pill_tooltip_map = null;
    window.__ag_metrics_focusin_fn = null;
    window.__ag_metrics_click_fn = null;
    window.__ag_metrics_by_id = null;
    window.__ag_watched_cascade_ids = null;
    window.__ag_watched_cascade_id = '';
    window.__ag_watched_cascade_sig = '';
    window.__ag_last_metrics = null;
    const themeBtnTt = document.getElementById('ag-theme-btn-tooltip');
    if (themeBtnTt) themeBtnTt.remove();
    if (window.__ag_theme_btn_tt_timer) {
      try {
        clearTimeout(window.__ag_theme_btn_tt_timer);
      } catch (e) {}
      window.__ag_theme_btn_tt_timer = null;
    }
    if (window.__ag_appearance_toggle_observer) {
      try {
        window.__ag_appearance_toggle_observer.disconnect();
      } catch (e) {}
      window.__ag_appearance_toggle_observer = null;
    }
    if (window.__ag_appearance_btn_attr_observer) {
      try {
        window.__ag_appearance_btn_attr_observer.disconnect();
      } catch (e) {}
      window.__ag_appearance_btn_attr_observer = null;
    }
    try {
      document.querySelectorAll('button[data-ag-warm-night-btn]').forEach((el) => el.remove());
      document.querySelectorAll('[data-ag-theme-toggle-group]').forEach((g) => {
        g.removeAttribute('data-ag-theme-toggle-group');
        g.removeAttribute('data-ag-active-night');
      });
      document.querySelectorAll('[data-ag-native-theme-slot]').forEach((b) => {
        b.removeAttribute('data-ag-native-theme-slot');
      });
    } catch (e) {}
    window.__ag_set_dark_preset_fn = null;
    window.__ag_sync_warm_night_btn_fn = null;
    window.__ag_ensure_warm_night_btn_fn = null;
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
    window.__ag_sync_preset_fn = null;
    window.__ag_host_theme_mode = null;
    window.__ag_host_dark_preset = null;
    window.__ag_set_host_theme_mode = null;
    window.__ag_set_host_dark_preset = null;
    window.__ag_resolved_theme_mode = null;
    window.__ag_body_ready = false;
    applyThemeVars({}, {});
    document.documentElement.removeAttribute('data-ag-preset');
    document.documentElement.removeAttribute('data-ag-dark-preset');
    document.documentElement.removeAttribute('data-ag-theme-mode');
    document.documentElement.removeAttribute('data-ag-page-type');
    document.documentElement.removeAttribute('data-ag-wax-seal');
    document.documentElement.removeAttribute('data-ag-os');
    const restoreNativeSurfaces = () => {
      syncCurtainSurfaceColor(true);
      if (IS_SWARM_PLUGIN_FRAME) {
        if (window.__ag_swarm_owned_cs && document.documentElement) {
          document.documentElement.style.removeProperty('color-scheme');
          window.__ag_swarm_owned_cs = false;
        }
        if (window.__ag_swarm_orig_data_theme !== undefined && document.documentElement) {
          if (window.__ag_swarm_orig_data_theme === null) {
            document.documentElement.removeAttribute('data-theme');
          } else {
            document.documentElement.setAttribute('data-theme', window.__ag_swarm_orig_data_theme);
          }
          delete window.__ag_swarm_orig_data_theme;
        }
      } else {
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
  // 1. 注入 Google Sans Flex 防脱靶保底样式表（兼容 settings.json font.family / hasEditor / Swarm 子帧）、更纱黑体与主题样式
  // ============================================================================
  const headTarget = document.head || document.getElementsByTagName('head')[0] || document.documentElement;

  const legacySwarmFont = document.getElementById('ag-swarm-google-fonts');
  if (legacySwarmFont) legacySwarmFont.remove();
  if (
    headTarget &&
    !document.getElementById('agy-new-themes-fonts') &&
    !document.getElementById('ag-google-sans-flex-fonts')
  ) {
    try {
      const gfLink = document.createElement('link');
      gfLink.id = 'ag-google-sans-flex-fonts';
      gfLink.rel = 'stylesheet';
      gfLink.href =
        'https://fonts.googleapis.com/css2?family=Google+Sans:ital,wght@0,400..700;1,400..700&family=Google+Sans+Code:ital,wght@0,300..800;1,300..800&family=Google+Sans+Flex:ROND,opsz,slnt,wdth,wght@0..100,6..144,-10..0,92..100,100..1000&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap';
      gfLink.onerror = () => {
        try {
          gfLink.remove();
        } catch (e) {}
      };
      headTarget.appendChild(gfLink);
    } catch (e) {}
  }

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
  applyThemeVars(THEME_VARS, DARK_THEME_VARS);

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

    const resolveInitialMainBundleSize = () => {
      try {
        if (typeof performance.getEntriesByType === 'function') {
          const allMain = performance
            .getEntriesByType('resource')
            .filter((e) => /\/main\.js(?:\?|$)/.test(String(e.name || '')));
          // 优先读取 <script src="/main.js"> 条目，排除本自愈器发起的 0 字节 HEAD fetch 条目防止二次复检自锁
          const scriptEntries = allMain.filter(
            (e) =>
              e.initiatorType === 'script' &&
              ((Number(e.decodedBodySize) || 0) > 0 || (Number(e.encodedBodySize) || 0) > 0)
          );
          const nonZeroEntries =
            scriptEntries.length > 0
              ? scriptEntries
              : allMain.filter(
                  (e) =>
                    e.initiatorType !== 'fetch' &&
                    ((Number(e.decodedBodySize) || 0) > 0 || (Number(e.encodedBodySize) || 0) > 0)
                );
          if (nonZeroEntries.length > 0) {
            const picked = nonZeroEntries[nonZeroEntries.length - 1];
            const sizeObj = {
              decoded: Number(picked.decodedBodySize) || 0,
              encoded: Number(picked.encodedBodySize) || 0
            };
            window.__ag_coldboot_initial_main_size = sizeObj;
            return sizeObj;
          }
        }
      } catch (e) {}
      if (
        window.__ag_coldboot_initial_main_size &&
        (window.__ag_coldboot_initial_main_size.decoded > 0 || window.__ag_coldboot_initial_main_size.encoded > 0)
      ) {
        return window.__ag_coldboot_initial_main_size;
      }
      return { decoded: 0, encoded: 0 };
    };

    // 模块初始化时即捕获初始 script 体积快照，免疫后续 ResourceTiming 250 条环形缓冲淘汰与 HEAD 探测干扰
    resolveInitialMainBundleSize();

    const probeColdBootBundleDrift = async (attempt) => {
      window.__ag_coldboot_timer = null;
      if (!isWindowUntouchedAndIdleForColdHeal()) {
        window.__ag_coldboot_probe_done = true;
        window.__ag_coldboot_healer_state = { probeDone: true, drifted: false, skippedReason: 'gate-blocked' };
        return;
      }
      try {
        const initSize = resolveInitialMainBundleSize();
        const loadedDecoded = initSize.decoded;
        const loadedEncoded = initSize.encoded;
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

  const DARK_PRESETS = {
    ONYX: 'onyx',
    CLAUDE_WARM: 'claude-warm'
  };

  const ALL_CUSTOM_PRESET_NAMES = new Set(Object.values(PRESETS));

  // 当用户在 user/config.json 中修改了 preset / darkPreset 时，同步刷新 localStorage 中的预设标记
  if (DEFAULT_PRESET && window.__ag_last_boot_preset !== DEFAULT_PRESET) {
    window.__ag_last_boot_preset = DEFAULT_PRESET;
    try {
      Storage.prototype.setItem.call(localStorage, 'theme-color-flavor', DEFAULT_PRESET);
    } catch (e) {}
  }
  const effectiveBootDarkPreset =
    IS_SWARM_PLUGIN_FRAME &&
    (window.__ag_host_dark_preset === DARK_PRESETS.CLAUDE_WARM || window.__ag_host_dark_preset === DARK_PRESETS.ONYX)
      ? window.__ag_host_dark_preset
      : DEFAULT_DARK_PRESET;
  if (effectiveBootDarkPreset && window.__ag_last_boot_dark_preset !== effectiveBootDarkPreset) {
    window.__ag_last_boot_dark_preset = effectiveBootDarkPreset;
    window.__ag_runtime_dark_preset = effectiveBootDarkPreset;
    try {
      Storage.prototype.setItem.call(localStorage, 'theme-dark-flavor', effectiveBootDarkPreset);
    } catch (e) {}
  }

  function resolveNormalizedDarkPreset(rawVal) {
    const s = String(rawVal || '').trim().toLowerCase();
    if (
      s === DARK_PRESETS.CLAUDE_WARM ||
      s === 'warm-paper-night' ||
      s === 'claude-night' ||
      s === '暖炭'
    ) {
      return DARK_PRESETS.CLAUDE_WARM;
    }
    return DARK_PRESETS.ONYX;
  }

  let lastSyncedHostMode = null;

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

      let storedDarkFlavor = null;
      try {
        storedDarkFlavor = Storage.prototype.getItem.call(localStorage, 'theme-dark-flavor');
      } catch (e) {}
      const liveHostDarkPreset =
        IS_SWARM_PLUGIN_FRAME &&
        (window.__ag_host_dark_preset === DARK_PRESETS.CLAUDE_WARM ||
          window.__ag_host_dark_preset === DARK_PRESETS.ONYX)
          ? window.__ag_host_dark_preset
          : null;
      const targetDarkPreset = resolveNormalizedDarkPreset(
        liveHostDarkPreset || window.__ag_runtime_dark_preset || storedDarkFlavor || DEFAULT_DARK_PRESET
      );
      const prevDarkPreset = document.documentElement.getAttribute('data-ag-dark-preset');
      if (prevDarkPreset !== targetDarkPreset) {
        document.documentElement.setAttribute('data-ag-dark-preset', targetDarkPreset);
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
        // 优先级：1) daemon 从宿主 page 实时同步的 __ag_host_theme_mode（解决系统跟随/隐藏预加载/陈旧内联样式不同步）；
        // 2) ~/.gemini/config/config.json 的显式 dark/light；3) 宿主内联 --background 亮度；4) Swarm data-theme="dark"；5) systemPrefersDark（不采信 Swarm 初始默认 data-theme="light"）
        const liveParentMode =
          window.__ag_host_theme_mode === 'dark' || window.__ag_host_theme_mode === 'light'
            ? window.__ag_host_theme_mode
            : null;
        const inlineHostBg = htmlEl ? (htmlEl.style.getPropertyValue('--background') || '').trim() : '';
        const hostLum = computeColorLuminance(inlineHostBg);
        if (liveParentMode) {
          isDark = liveParentMode === 'dark';
        } else if (hostThemeMode === 'dark') {
          isDark = true;
        } else if (hostThemeMode === 'light') {
          isDark = false;
        } else if (hostLum !== null) {
          isDark = hostLum < 0.5;
        } else if (htmlDataTheme === 'dark') {
          isDark = true;
        } else {
          isDark = systemPrefersDark;
        }
        const swarmMode = isDark ? 'dark' : 'light';
        if (htmlEl && htmlEl.getAttribute('data-theme') !== swarmMode) {
          if (window.__ag_swarm_orig_data_theme === undefined) {
            window.__ag_swarm_orig_data_theme = htmlEl.hasAttribute('data-theme')
              ? htmlEl.getAttribute('data-theme')
              : null;
          }
          htmlEl.setAttribute('data-theme', swarmMode);
        }
        if (htmlEl && htmlEl.style.colorScheme !== swarmMode) {
          htmlEl.style.colorScheme = swarmMode;
          window.__ag_swarm_owned_cs = true;
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
      const darkPresetChanged = prevDarkPreset !== targetDarkPreset;
      if (prevMode !== targetMode || prevPreset !== targetPreset || darkPresetChanged) {
        document.documentElement.setAttribute('data-ag-theme-mode', targetMode);
      }
      window.__ag_resolved_theme_mode = targetMode;
      if (!IS_SWARM_PLUGIN_FRAME && lastSyncedHostMode !== targetMode) {
        lastSyncedHostMode = targetMode;
        if (typeof window.__agSyncHostThemeMode === 'function') {
          try {
            window.__agSyncHostThemeMode(targetMode);
          } catch (e) {}
        }
      }
      syncWinTitleBarOverlay(isDark, darkPresetChanged);
      syncCurtainSurfaceColor(darkPresetChanged);
      if (typeof window.__ag_sync_warm_night_btn_fn === 'function') {
        window.__ag_sync_warm_night_btn_fn();
      }
    } catch (e) {}
  }

  window.__ag_sync_preset_fn = syncChuanbanPreset;
  window.__ag_set_host_theme_mode = (mode) => {
    if (mode !== 'dark' && mode !== 'light') return;
    window.__ag_host_theme_mode = mode;
    if (typeof window.__ag_sync_preset_fn === 'function') {
      window.__ag_sync_preset_fn();
    }
  };
  window.__ag_set_host_dark_preset = (nextDarkPreset) => {
    window.__ag_runtime_dark_preset = resolveNormalizedDarkPreset(nextDarkPreset);
    if (IS_SWARM_PLUGIN_FRAME) {
      window.__ag_host_dark_preset = window.__ag_runtime_dark_preset;
    }
    try {
      Storage.prototype.setItem.call(localStorage, 'theme-dark-flavor', window.__ag_runtime_dark_preset);
    } catch (e) {}
    if (typeof window.__ag_sync_preset_fn === 'function') {
      window.__ag_sync_preset_fn();
    }
  };

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
  // 3.2 外观界面「主题模式」四段式胶囊：在浅色(☀️)与深色(🌙)间无损挂载「暖纸深色(📖)」书卷按钮
  // ============================================================================
  if (!IS_SWARM_PLUGIN_FRAME) {
    const MENU_BOOK_SVG_PATH =
      'M557.69-570.15v-52.61q32.62-15.15 68.27-22.73T700-653.08q24.08,0 46.77,3.42t45.54,9.04v50.15q-22.46-7.85-44.65-11.38T700-605.39q-38.38,0-74.35,9.12t-67.96,26.12Zm0,219.23v-53.38q31.85-15.15 68.08-22.73T700-434.61q24.08,0 46.77,3.42t45.54,9.04V-372q-22.46-7.85-44.65-11.38T700-386.92q-38.38,0-74.35,9.19t-67.96,26.81Zm0-109.23v-53.38q32.62-15.15 68.27-22.73T700-543.85q24.08,0 46.77,3.42t45.54,9.04v50.15q-22.46-7.85-44.65-11.38T700-496.15q-38.38,0-74.35,9.5t-67.96,26.5ZM260-319.23q49.69,0 96.69,11.27T450-272.61V-665.85q-42.15-27.46-91.23-41.19T260-720.77q-36,0-67.27,5.65t-64.27,18.5q-4.62,1.54-6.54,4.42T120-685.85v378.31q0,5.39 3.85,7.89t8.46,0.58q28.46-9.69 60.08-14.92T260-319.23Zm250,46.62q46.31-24.08 93.31-35.35T700-319.23q36,0 67.62,5.23t60.08,14.92q4.62,1.92 8.46-0.58t3.85-7.89V-685.85q0-3.46-1.92-6.15t-6.54-4.62q-33-12.85-64.27-18.5T700-720.77q-49.69,0-98.77,13.73T510-665.85v393.23Zm-30,88q-48.38-35.69-104.38-55.15T260-259.23q-36.61,0-71.92,8.12T120-227.23q-21.38,9.85-40.69-3.12T60-267.08v-434.3q0-12.92 6.65-24.27T85.85-742q40.61-19.77 84.65-29.27t89.5-9.5q58.38,0 114.08,15.96T480-717.69q50.23-31.15 105.92-47.12T700-780.77q45.46,0 89.5,9.5T874.15-742q12.54,5 19.19,16.35T900-701.38v434.3q0,23.77-20.08,36.35T837.69-228q-32.38-15.38-67.11-23.31T700-259.23q-59.62,0-115.62,19.46T480-184.62ZM285-496.69Z';

    function hideThemeBtnTooltip() {
      if (window.__ag_theme_btn_tt_timer) {
        try {
          clearTimeout(window.__ag_theme_btn_tt_timer);
        } catch (e) {}
        window.__ag_theme_btn_tt_timer = null;
      }
      const tt = document.getElementById('ag-theme-btn-tooltip');
      if (tt) {
        tt.removeAttribute('data-visible');
      }
    }

    function scheduleThemeBtnTooltip(anchorBtn, text) {
      hideThemeBtnTooltip();
      window.__ag_theme_btn_tt_timer = setTimeout(() => {
        window.__ag_theme_btn_tt_timer = null;
        if (!anchorBtn || !anchorBtn.isConnected || !document.body) return;
        let tt = document.getElementById('ag-theme-btn-tooltip');
        if (!tt) {
          tt = document.createElement('div');
          tt.id = 'ag-theme-btn-tooltip';
          tt.setAttribute('role', 'tooltip');
          document.body.appendChild(tt);
        }
        tt.textContent = text;
        const r = anchorBtn.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        tt.style.left = `${Math.round(r.left + r.width / 2)}px`;
        tt.style.top = `${Math.round(r.top - 7)}px`;
        tt.setAttribute('data-visible', '1');
      }, 260);
    }

    function setRuntimeDarkPreset(nextPreset, persist = true) {
      const normalized = resolveNormalizedDarkPreset(nextPreset);
      window.__ag_runtime_dark_preset = normalized;
      try {
        Storage.prototype.setItem.call(localStorage, 'theme-dark-flavor', normalized);
      } catch (e) {}
      syncChuanbanPreset();
      if (typeof window.__ag_sync_warm_night_btn_fn === 'function') {
        window.__ag_sync_warm_night_btn_fn();
      }
      if (persist && typeof window.__agSetDarkPreset === 'function') {
        try {
          window.__agSetDarkPreset(normalized);
        } catch (e) {}
      }
    }

    function identifyNativeThemeButtons(group) {
      if (!group || group.nodeType !== 1) return null;
      const nativeBtns = [];
      for (let i = 0; i < group.children.length; i++) {
        const ch = group.children[i];
        if (ch && ch.tagName === 'BUTTON' && !ch.hasAttribute('data-ag-warm-night-btn')) {
          nativeBtns.push(ch);
        }
      }
      if (nativeBtns.length !== 3) return null;
      const classifyBtn = (btn) => {
        const tagged = btn.getAttribute('data-ag-native-theme-slot');
        if (tagged === 'system' || tagged === 'light' || tagged === 'dark') return tagged;
        const pathEl = btn.querySelector('svg path');
        const d = pathEl ? String(pathEl.getAttribute('d') || '') : '';
        const aria = String(btn.getAttribute('aria-label') || '').trim().toLowerCase();
        if (d.startsWith('M263.85-140') || aria === 'system' || aria === '跟随系统') return 'system';
        if (d.startsWith('M565-395') || aria === 'light' || aria === '浅色' || aria === '浅色主题') return 'light';
        if (d.startsWith('M481.15-140') || aria === 'dark' || aria === '深色' || aria === '深色主题') return 'dark';
        return null;
      };
      const k0 = classifyBtn(nativeBtns[0]);
      const k1 = classifyBtn(nativeBtns[1]);
      const k2 = classifyBtn(nativeBtns[2]);
      if (k0 === 'system' && k1 === 'light' && k2 === 'dark') {
        return { sysBtn: nativeBtns[0], lightBtn: nativeBtns[1], darkBtn: nativeBtns[2] };
      }
      return null;
    }

    function syncAppearanceWarmNightToggle() {
      const isWarmNight = document.documentElement.getAttribute('data-ag-dark-preset') === DARK_PRESETS.CLAUDE_WARM;
      const groups = document.querySelectorAll('[data-slot="toggle-group"][data-ag-theme-toggle-group="1"]');
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const bookBtn = group.querySelector('button[data-ag-warm-night-btn="1"]');
        const darkBtn = group.querySelector('button[data-ag-native-theme-slot="dark"]');
        if (!bookBtn || !darkBtn) continue;
        const isExplicitDarkSelected =
          darkBtn.hasAttribute('data-pressed') || darkBtn.getAttribute('aria-pressed') === 'true';
        const bookActive = isExplicitDarkSelected && isWarmNight;
        if (bookActive) {
          if (!bookBtn.hasAttribute('data-pressed')) bookBtn.setAttribute('data-pressed', '');
          if (bookBtn.getAttribute('aria-pressed') !== 'true') bookBtn.setAttribute('aria-pressed', 'true');
          if (group.getAttribute('data-ag-active-night') !== DARK_PRESETS.CLAUDE_WARM) {
            group.setAttribute('data-ag-active-night', DARK_PRESETS.CLAUDE_WARM);
          }
        } else {
          if (bookBtn.hasAttribute('data-pressed')) bookBtn.removeAttribute('data-pressed');
          if (bookBtn.getAttribute('aria-pressed') !== 'false') bookBtn.setAttribute('aria-pressed', 'false');
          if (group.hasAttribute('data-ag-active-night')) {
            group.removeAttribute('data-ag-active-night');
          }
        }
      }
    }

    function mountWarmNightBtnOnGroup(group) {
      const slots = identifyNativeThemeButtons(group);
      if (!slots) return false;
      const { sysBtn, lightBtn, darkBtn } = slots;
      group.setAttribute('data-ag-theme-toggle-group', '1');
      sysBtn.setAttribute('data-ag-native-theme-slot', 'system');
      lightBtn.setAttribute('data-ag-native-theme-slot', 'light');
      darkBtn.setAttribute('data-ag-native-theme-slot', 'dark');

      if (!darkBtn.__ag_warm_night_hooked) {
        darkBtn.__ag_warm_night_hooked = true;
        darkBtn.addEventListener(
          'click',
          () => {
            if (window.__ag_internal_moon_click) return;
            if (typeof window.__ag_set_dark_preset_fn === 'function') {
              window.__ag_set_dark_preset_fn(DARK_PRESETS.ONYX, true);
            }
            requestAnimationFrame(() => {
              if (typeof window.__ag_sync_warm_night_btn_fn === 'function') {
                window.__ag_sync_warm_night_btn_fn();
              }
            });
          },
          true
        );
      }
      for (const otherBtn of [sysBtn, lightBtn]) {
        if (!otherBtn.__ag_warm_night_hooked) {
          otherBtn.__ag_warm_night_hooked = true;
          otherBtn.addEventListener(
            'click',
            () => {
              requestAnimationFrame(() => {
                if (typeof window.__ag_sync_warm_night_btn_fn === 'function') {
                  window.__ag_sync_warm_night_btn_fn();
                }
              });
            },
            true
          );
        }
      }

      if (window.__ag_appearance_btn_attr_observer) {
        try {
          window.__ag_appearance_btn_attr_observer.observe(sysBtn, {
            attributes: true,
            attributeFilter: ['data-pressed', 'aria-pressed']
          });
          window.__ag_appearance_btn_attr_observer.observe(lightBtn, {
            attributes: true,
            attributeFilter: ['data-pressed', 'aria-pressed']
          });
          window.__ag_appearance_btn_attr_observer.observe(darkBtn, {
            attributes: true,
            attributeFilter: ['data-pressed', 'aria-pressed']
          });
        } catch (e) {}
      }

      let bookBtn = group.querySelector('button[data-ag-warm-night-btn="1"]');
      if (!bookBtn) {
        bookBtn = document.createElement('button');
        bookBtn.type = 'button';
        bookBtn.setAttribute('data-ag-warm-night-btn', '1');
        bookBtn.setAttribute('aria-label', '暖纸深色');
        bookBtn.setAttribute('aria-pressed', 'false');
        bookBtn.className = lightBtn.className;

        const spanWrap = document.createElement('span');
        spanWrap.className = 'shrink-0 flex items-center';
        const svgNS = 'http://www.w3.org/2000/svg';
        const svgEl = document.createElementNS(svgNS, 'svg');
        svgEl.setAttribute('xmlns', svgNS);
        svgEl.setAttribute('width', '16');
        svgEl.setAttribute('height', '16');
        svgEl.setAttribute('viewBox', '0 -960 960 960');
        svgEl.setAttribute('fill', 'currentColor');
        svgEl.setAttribute('aria-hidden', 'true');
        const pathEl = document.createElementNS(svgNS, 'path');
        pathEl.setAttribute('d', MENU_BOOK_SVG_PATH);
        svgEl.appendChild(pathEl);
        spanWrap.appendChild(svgEl);
        bookBtn.appendChild(spanWrap);

        bookBtn.addEventListener('mouseenter', () => {
          scheduleThemeBtnTooltip(bookBtn, '暖纸深色');
        });
        bookBtn.addEventListener('mouseleave', hideThemeBtnTooltip);
        bookBtn.addEventListener('focus', () => {
          scheduleThemeBtnTooltip(bookBtn, '暖纸深色');
        });
        bookBtn.addEventListener('blur', hideThemeBtnTooltip);
        bookBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          hideThemeBtnTooltip();
          if (typeof window.__ag_set_dark_preset_fn === 'function') {
            window.__ag_set_dark_preset_fn(DARK_PRESETS.CLAUDE_WARM, true);
          }
          const moonPressed = darkBtn.hasAttribute('data-pressed') || darkBtn.getAttribute('aria-pressed') === 'true';
          if (!moonPressed) {
            window.__ag_internal_moon_click = true;
            try {
              darkBtn.click();
            } finally {
              window.__ag_internal_moon_click = false;
            }
          }
          requestAnimationFrame(() => {
            if (typeof window.__ag_sync_warm_night_btn_fn === 'function') {
              window.__ag_sync_warm_night_btn_fn();
            }
          });
        });

        // 物理挂载在末尾（不干扰 React 前 3 个按钮的 nextSibling 链），由 CSS order: 3 排入太阳与月亮正中间
        group.appendChild(bookBtn);
      }
      return true;
    }

    function ensureAppearanceWarmNightToggle(root) {
      if (!document.body) return;
      const scope = root && root.nodeType === 1 ? root : document;
      let mountedAny = false;
      if (scope.matches && scope.matches('[data-slot="toggle-group"]')) {
        if (mountWarmNightBtnOnGroup(scope)) mountedAny = true;
      }
      if (scope.querySelectorAll) {
        const groups = scope.querySelectorAll('[data-slot="toggle-group"]');
        for (let i = 0; i < groups.length; i++) {
          if (mountWarmNightBtnOnGroup(groups[i])) mountedAny = true;
        }
      }
      if (mountedAny) {
        syncAppearanceWarmNightToggle();
      }
    }

    window.__ag_set_dark_preset_fn = setRuntimeDarkPreset;
    window.__ag_sync_warm_night_btn_fn = syncAppearanceWarmNightToggle;
    window.__ag_ensure_warm_night_btn_fn = ensureAppearanceWarmNightToggle;

    if (window.__ag_appearance_btn_attr_observer) {
      try {
        window.__ag_appearance_btn_attr_observer.disconnect();
      } catch (e) {}
    }
    if (typeof MutationObserver !== 'undefined') {
      window.__ag_appearance_btn_attr_observer = new MutationObserver(() => {
        syncAppearanceWarmNightToggle();
      });
      if (window.__ag_appearance_toggle_observer) {
        try {
          window.__ag_appearance_toggle_observer.disconnect();
        } catch (e) {}
      }
      window.__ag_appearance_toggle_observer = new MutationObserver((mutations) => {
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          if (m.type !== 'childList' || m.addedNodes.length === 0) continue;
          for (let j = 0; j < m.addedNodes.length; j++) {
            const n = m.addedNodes[j];
            if (n && n.nodeType === 1) {
              if (
                (n.matches && n.matches('[data-slot="toggle-group"]')) ||
                (n.firstElementChild && n.querySelector && n.querySelector('[data-slot="toggle-group"]'))
              ) {
                ensureAppearanceWarmNightToggle(n);
              }
            }
          }
        }
      });
      if (document.body) {
        window.__ag_appearance_toggle_observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    ensureAppearanceWarmNightToggle(document);
    syncAppearanceWarmNightToggle();
  }

  // ============================================================================
  // 3.5 模型名称同行实时指标胶囊 (Scheme C: TPS · TTFT · Ctx/256k · Out + Hover 详情卡)
  // 支持多窗格/多分屏与 /btw 独立挂载、动态宽度折行及标题外挂告警一键复制桥接。
  // ============================================================================
  const MIDDLE_ENTER_BOTTOM_PX = 165;
  const MIDDLE_EXIT_BOTTOM_PX = 180;
  const CASCADE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const AUX_CONVO_TAB_RE =
    /^(?:side_question|subagent_convo)__([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  function extractAuxConvoTabUuid(raw) {
    const m = String(raw || '').trim().match(AUX_CONVO_TAB_RE);
    return m ? m[1].toLowerCase() : '';
  }
  function isWeakMapInstance(v) {
    return (
      v instanceof WeakMap ||
      !!(
        v &&
        typeof v.get === 'function' &&
        typeof v.set === 'function' &&
        typeof v.delete === 'function' &&
        typeof v.has === 'function'
      )
    );
  }
  if (!isWeakMapInstance(window.__ag_pill_tooltip_map)) {
    window.__ag_pill_tooltip_map = new WeakMap();
  }
  const pillTooltipMap = window.__ag_pill_tooltip_map;
  const rowStateMap = new WeakMap();
  const activeMetricsObservers = new Set();
  const activeMetricsRafs = new Set();
  const metricsRouteTimers = new Set();

  function scheduleTrackedHandle(trackSet, schedulerFn, callback) {
    let settled = false;
    let handle = 0;
    handle = schedulerFn(() => {
      settled = true;
      if (handle) trackSet.delete(handle);
      callback();
    });
    if (!settled && handle) trackSet.add(handle);
    return settled ? 0 : handle;
  }

  if (!window.__ag_metrics_by_id || window.__ag_metrics_cache_ver !== PATCH_VERSION) {
    window.__ag_metrics_by_id = Object.create(null);
    window.__ag_metrics_cache_ver = PATCH_VERSION;
  }
  const metricsById = window.__ag_metrics_by_id;

  window.__ag_cleanup_fns.push(() => {
    for (const ro of activeMetricsObservers) {
      try {
        ro.disconnect();
      } catch (e) {}
    }
    activeMetricsObservers.clear();
    for (const rafId of activeMetricsRafs) {
      try {
        cancelAnimationFrame(rafId);
      } catch (e) {}
    }
    activeMetricsRafs.clear();
    for (const tid of metricsRouteTimers) {
      try {
        clearTimeout(tid);
      } catch (e) {}
    }
    metricsRouteTimers.clear();
    window.__ag_metrics_focusin_fn = null;
    window.__ag_metrics_click_fn = null;
    window.__ag_trigger_route_check_fn = null;
  });

  function isPillNode(el) {
    return !!(
      el &&
      el.nodeType === 1 &&
      (el.id === 'ag-live-metrics-pill' ||
        el.hasAttribute('data-ag-metrics-pill') ||
        (el.classList && el.classList.contains('ag-live-metrics-pill')))
    );
  }

  function getPillTextEl(pill) {
    if (!pill || !pill.querySelector) return null;
    return pill.querySelector('[data-ag-metrics-text="1"], .ag-live-metrics-text, #ag-live-metrics-text');
  }

  function getAllInputBoxes() {
    try {
      const rawId = String(SELECTORS.inputBoxId || '').trim();
      if (!rawId || typeof document.querySelectorAll !== 'function') return [];
      const escId = rawId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return Array.from(document.querySelectorAll('[id="' + escId + '"]'));
    } catch (e) {
      return [];
    }
  }

  function extractAllPathnameCascadeIds() {
    const out = [];
    const seen = new Set();
    try {
      let decoded = String(window.location.pathname || '');
      try {
        decoded = decodeURIComponent(decoded);
      } catch (e) {}
      const m = decoded.match(/\/c\/([^/?#]+)/i);
      if (m) {
        const parts = m[1].split(/\+|%2b/i);
        for (let i = 0; i < parts.length; i++) {
          const cid = String(parts[i] || '').trim().toLowerCase();
          if (CASCADE_UUID_RE.test(cid) && !seen.has(cid)) {
            seen.add(cid);
            out.push(cid);
          }
        }
      }
      const sp = new URLSearchParams(window.location.search || '');
      const tabs = sp.getAll('tab');
      for (let i = 0; i < tabs.length; i++) {
        const sideCid = extractAuxConvoTabUuid(tabs[i]);
        if (sideCid && !seen.has(sideCid)) {
          seen.add(sideCid);
          out.push(sideCid);
        }
      }
    } catch (e) {}
    return out;
  }

  function extractFocusedOrPrimaryCascadeId() {
    try {
      const sp = new URLSearchParams(window.location.search || '');
      const focused = String(sp.get('focused') || '').trim().toLowerCase();
      if (CASCADE_UUID_RE.test(focused)) return focused;
      const pathIds = extractAllPathnameCascadeIds();
      if (pathIds.length > 0) return pathIds[0];
      const q = String(sp.get('cascadeId') || '').trim().toLowerCase();
      if (CASCADE_UUID_RE.test(q)) return q;
      const selected = document.querySelector('[data-testid=conversation-row-sidebar][data-selected=true]');
      if (selected) {
        const cid = String(selected.getAttribute('data-cascade-id') || '').trim().toLowerCase();
        if (CASCADE_UUID_RE.test(cid)) return cid;
      }
    } catch (e) {}
    return '';
  }

  function extractCascadeId() {
    return extractFocusedOrPrimaryCascadeId();
  }

  function resolveBoxCascadeId(box, totalBoxes) {
    if (!box) return '';
    try {
      const sideContainer =
        box.closest &&
        box.closest(
          '[data-testid="side-question-tab-content"], [data-testid="side-question-tab-composer"], [data-side-panel-composer], [data-media-drop-scope="subpane"]'
        );
      if (sideContainer) {
        const tabContent =
          (sideContainer.matches &&
          sideContainer.matches('[data-testid="side-question-tab-content"], [data-media-drop-scope="subpane"]')
            ? sideContainer
            : sideContainer.closest &&
              sideContainer.closest('[data-testid="side-question-tab-content"], [data-media-drop-scope="subpane"]')) ||
          sideContainer;
        const sideConv =
          tabContent && tabContent.querySelector
            ? tabContent.querySelector(
                '[data-testid="side-question-tab-conversation"][data-cascade-id], [data-testid="subagent-tab-conversation"][data-cascade-id], [data-cascade-id]'
              )
            : null;
        if (sideConv) {
          const sideCid = String(sideConv.getAttribute('data-cascade-id') || '').trim().toLowerCase();
          if (CASCADE_UUID_RE.test(sideCid)) return sideCid;
        }
        const auxRoot =
          (box.closest && box.closest('[data-testid="aux-pane-split"], [data-pane-id]')) || document;
        const strip =
          auxRoot && auxRoot.querySelector
            ? auxRoot.querySelector('[data-active-tab-id^="side_question__"], [data-active-tab-id^="subagent_convo__"]')
            : null;
        if (strip) {
          const stripCid = extractAuxConvoTabUuid(strip.getAttribute('data-active-tab-id'));
          if (stripCid) return stripCid;
        }
        return '';
      }
      const view =
        box.closest && box.closest('[data-testid="conversation-view"][data-cascade-id], [data-cascade-id]');
      if (view) {
        const cid = String(view.getAttribute('data-cascade-id') || '').trim().toLowerCase();
        if (CASCADE_UUID_RE.test(cid)) return cid;
      }
      if (totalBoxes === 1) {
        const paneScope =
          (box.closest && box.closest('[data-pane-id], [data-testid="overview-panel-host"], main')) || document;
        const hasHomeGreeting = !!(
          (box.closest && box.closest(SELECTORS.homeGreeting)) ||
          (paneScope && paneScope.querySelector && paneScope.querySelector(SELECTORS.homeGreeting))
        );
        const hasBranchTrigger = !!(box.querySelector && box.querySelector(SELECTORS.branchPillInBox));
        if (window.location.pathname !== '/' && !hasHomeGreeting && !hasBranchTrigger) {
          return extractFocusedOrPrimaryCascadeId();
        }
      }
    } catch (e) {}
    return '';
  }

  function clearMetricsTooltipHideTimer() {
    if (window.__ag_metrics_tt_hide_timer) {
      try {
        clearTimeout(window.__ag_metrics_tt_hide_timer);
      } catch (e) {}
      window.__ag_metrics_tt_hide_timer = null;
    }
  }

  function scheduleMetricsTooltipHide(delayMs = 160) {
    clearMetricsTooltipHideTimer();
    window.__ag_metrics_tt_hide_timer = setTimeout(() => {
      window.__ag_metrics_tt_hide_timer = null;
      const tt = document.getElementById('ag-live-metrics-tooltip');
      if (tt) tt.removeAttribute('data-visible');
      window.__ag_active_tooltip_pill = null;
    }, delayMs);
  }

  function copyTextWithFallback(text) {
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard
        .writeText(text)
        .then(() => true)
        .catch(() => fallbackExecCopy(text));
    }
    return Promise.resolve(fallbackExecCopy(text));
  }

  function fallbackExecCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  function ensureMetricsTooltip() {
    let tt = document.getElementById('ag-live-metrics-tooltip');
    if (tt && tt.getAttribute('data-ag-tt-ver') !== PATCH_VERSION) {
      try {
        tt.remove();
      } catch (e) {}
      tt = null;
    }
    if (!tt && document.body) {
      tt = document.createElement('div');
      tt.id = 'ag-live-metrics-tooltip';
      tt.setAttribute('data-ag-tt-ver', PATCH_VERSION);
      document.body.appendChild(tt);
    } else if (tt && tt.parentElement !== document.body && document.body) {
      document.body.appendChild(tt);
    }
    if (tt && !tt.__ag_tt_interactive_bound) {
      tt.__ag_tt_interactive_bound = true;
      tt.addEventListener('mouseenter', () => {
        clearMetricsTooltipHideTimer();
      });
      tt.addEventListener('mouseleave', () => {
        scheduleMetricsTooltipHide(120);
      });
      tt.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest && ev.target.closest('.ag-tt-copy-btn');
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        const cmd = String(btn.getAttribute('data-ag-copy-cmd') || '').trim();
        if (!cmd) return;
        copyTextWithFallback(cmd).then((ok) => {
          const label = ok ? '✓ 已复制' : '复制失败';
          tt.__ag_copy_feedback_until = Date.now() + 1800;
          tt.__ag_copy_feedback_text = label;
          tt.__ag_copy_feedback_cmd = cmd;
          if (btn.isConnected) btn.textContent = label;
          if (tt.__ag_copy_reset_timer) clearTimeout(tt.__ag_copy_reset_timer);
          tt.__ag_copy_reset_timer = setTimeout(() => {
            tt.__ag_copy_reset_timer = null;
            tt.__ag_copy_feedback_until = 0;
            tt.__ag_copy_feedback_text = '';
            tt.__ag_copy_feedback_cmd = '';
            const curBtn = tt.querySelector && tt.querySelector('.ag-tt-copy-btn');
            if (curBtn) curBtn.textContent = '复制命令';
          }, 1800);
        });
      });
    }
    return tt;
  }

  function hideMetricsTooltipIfOwner(pill) {
    if (!pill || window.__ag_active_tooltip_pill === pill) {
      clearMetricsTooltipHideTimer();
      const tt = document.getElementById('ag-live-metrics-tooltip');
      if (tt) tt.removeAttribute('data-visible');
      if (!pill || window.__ag_active_tooltip_pill === pill) {
        window.__ag_active_tooltip_pill = null;
      }
    }
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

  function findPillInBox(box) {
    if (!box || !box.querySelector) return null;
    return box.querySelector('[data-ag-metrics-pill="1"], .ag-live-metrics-pill, #ag-live-metrics-pill');
  }

  function measureNaturalLeftWidth(leftGroup) {
    let w = 0;
    for (let i = 0; i < leftGroup.children.length; i++) {
      const ch = leftGroup.children[i];
      if (isPillNode(ch)) continue;
      const cw = Math.max(ch.offsetWidth || 0, ch.scrollWidth || 0);
      if (cw > 0) w += cw;
    }
    return w;
  }

  function computeNeededPillWidth(pill) {
    if (!pill || pill.style.display === 'none') return 0;
    const textEl = getPillTextEl(pill);
    const textScrollW = textEl ? textEl.scrollWidth || 0 : 0;
    return textScrollW > 0 ? Math.ceil(textScrollW + 12) : 0;
  }

  function syncMetricsResizeObserver(box, bottomRow, leftGroup, rightGroup) {
    if (typeof ResizeObserver === 'undefined' || !bottomRow) return null;
    let state = rowStateMap.get(bottomRow);
    if (!state || state.ver !== PATCH_VERSION) {
      if (state && state.ro) {
        try {
          state.ro.disconnect();
        } catch (e) {}
        activeMetricsObservers.delete(state.ro);
      }
      if (state && state.rafId) {
        try {
          cancelAnimationFrame(state.rafId);
        } catch (e) {}
        activeMetricsRafs.delete(state.rafId);
      }
      state = {
        ver: PATCH_VERSION,
        observed: new WeakSet(),
        rafId: 0,
        lastSig: '',
        lastRowW: 0,
        ro: null
      };
      const ro = new ResizeObserver(() => {
        if (state.rafId) return;
        state.rafId = scheduleTrackedHandle(activeMetricsRafs, requestAnimationFrame, () => {
          state.rafId = 0;
          if (!bottomRow.isConnected || !box.isConnected) {
            try {
              ro.disconnect();
            } catch (e) {}
            activeMetricsObservers.delete(ro);
            return;
          }
          const curLeft = bottomRow.children[0];
          if (!curLeft) return;
          const curRight = bottomRow.children[1] || null;
          const rw = bottomRow.clientWidth || 0;
          if (rw <= 0) return;
          const lw = measureNaturalLeftWidth(curLeft);
          const rgw = curRight ? curRight.offsetWidth || 0 : 0;
          const curPill = findPillInBox(box);
          const nw = computeNeededPillWidth(curPill);
          const sig = rw + ':' + lw + ':' + rgw + ':' + nw;
          if (sig !== state.lastSig) {
            ensureMetricsPillForBox(box, true, false);
          }
        });
      });
      state.ro = ro;
      activeMetricsObservers.add(ro);
      rowStateMap.set(bottomRow, state);
    }
    const ro = state.ro;
    const seen = state.observed;
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
        if (!isPillNode(ch)) observeOnce(ch);
      }
    }
    return state;
  }

  function createPillElement() {
    const pill = document.createElement('div');
    pill.className = 'ag-live-metrics-pill';
    pill.setAttribute('data-ag-metrics-pill', '1');
    pill.setAttribute('data-ag-pill-ver', PATCH_VERSION);
    const span = document.createElement('span');
    span.className = 'ag-live-metrics-text';
    span.setAttribute('data-ag-metrics-text', '1');
    pill.appendChild(span);
    pill.addEventListener('mouseenter', () => {
      clearMetricsTooltipHideTimer();
      const map = isWeakMapInstance(window.__ag_pill_tooltip_map) ? window.__ag_pill_tooltip_map : pillTooltipMap;
      const ttHtml = map.get(pill);
      if (!ttHtml) return;
      const tt = ensureMetricsTooltip();
      if (!tt) return;
      if (tt.innerHTML !== ttHtml) {
        tt.innerHTML = ttHtml;
      }
      window.__ag_active_tooltip_pill = pill;
      const r = pill.getBoundingClientRect();
      const ttWidth = Math.min(450, Math.max(370, tt.offsetWidth || 400));
      const left = Math.max(12, Math.min(r.left, window.innerWidth - ttWidth - 16));
      const bottomPx = Math.min(window.innerHeight - r.top + 8, window.innerHeight - (tt.offsetHeight || 220) - 12);
      tt.style.left = left + 'px';
      tt.style.bottom = Math.max(8, bottomPx) + 'px';
      tt.setAttribute('data-visible', '1');
    });
    pill.addEventListener('mouseleave', () => {
      if (window.__ag_active_tooltip_pill !== pill) return;
      const tt = document.getElementById('ag-live-metrics-tooltip');
      if (tt && tt.querySelector && tt.querySelector('.ag-tt-copy-btn')) {
        scheduleMetricsTooltipHide(160);
      } else {
        hideMetricsTooltipIfOwner(pill);
      }
    });
    return pill;
  }

  function ensureMetricsPillForBox(box, forceLayout = false, resetHysteresis = false) {
    if (!MODULES.metrics || !box) return null;
    const bottomRow = findFooterRow(box);
    if (!bottomRow || !bottomRow.children[0]) return null;
    const leftGroup = bottomRow.children[0];
    const rightGroup = bottomRow.children[1] || null;

    let pill = findPillInBox(box);
    let isNewPill = false;
    if (!pill) {
      isNewPill = true;
      pill = createPillElement();
    } else if (!pill.hasAttribute('data-ag-metrics-pill')) {
      pill.setAttribute('data-ag-metrics-pill', '1');
      pill.setAttribute('data-ag-pill-ver', PATCH_VERSION);
      if (pill.classList && !pill.classList.contains('ag-live-metrics-pill')) {
        pill.classList.add('ag-live-metrics-pill');
      }
      const textEl = getPillTextEl(pill);
      if (textEl) {
        if (textEl.classList && !textEl.classList.contains('ag-live-metrics-text')) {
          textEl.classList.add('ag-live-metrics-text');
        }
        textEl.setAttribute('data-ag-metrics-text', '1');
      }
    }

    const rowState = syncMetricsResizeObserver(box, bottomRow, leftGroup, rightGroup);

    const rowW = bottomRow.clientWidth || 0;
    if (rowW <= 0) {
      if (pill.parentElement !== leftGroup && !(bottomRow.parentElement && pill.parentElement === bottomRow.parentElement)) {
        leftGroup.appendChild(pill);
      }
      return pill;
    }
    const leftW = measureNaturalLeftWidth(leftGroup);
    const rightW = rightGroup ? rightGroup.offsetWidth || 0 : 0;
    const neededPillW = computeNeededPillWidth(pill);
    const curLayoutSig = rowW + ':' + leftW + ':' + rightW + ':' + neededPillW;

    const isMountedHere =
      pill.parentElement === leftGroup || (bottomRow.parentElement && pill.parentElement === bottomRow.parentElement);
    if (!forceLayout && !isNewPill && isMountedHere && rowState && rowState.lastSig === curLayoutSig) {
      return pill;
    }

    if (rowState) {
      rowState.lastSig = curLayoutSig;
      rowState.lastRowW = rowW;
    }
    const availMiddleW = rowW - leftW - rightW - 8;
    const enterBottomPx = Math.max(MIDDLE_ENTER_BOTTOM_PX, neededPillW);
    const exitBottomPx = Math.max(MIDDLE_EXIT_BOTTOM_PX, enterBottomPx + 16);

    const prevMode = resetHysteresis ? 'middle' : pill.getAttribute('data-ag-row-mode') || 'middle';
    const useBottomRow = prevMode === 'bottom' ? availMiddleW < exitBottomPx : availMiddleW < enterBottomPx;
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

  function pruneOrphanedPills(activeBoxes) {
    const activeSet = new Set(activeBoxes || []);
    const allPills = document.querySelectorAll('[data-ag-metrics-pill="1"], .ag-live-metrics-pill, #ag-live-metrics-pill');
    const kept = [];
    for (let i = 0; i < allPills.length; i++) {
      const p = allPills[i];
      let ownerBox = null;
      for (let j = 0; j < activeBoxes.length; j++) {
        if (activeBoxes[j] && activeBoxes[j].contains && activeBoxes[j].contains(p)) {
          ownerBox = activeBoxes[j];
          break;
        }
      }
      if (!ownerBox || !activeSet.has(ownerBox)) {
        hideMetricsTooltipIfOwner(p);
        p.remove();
      } else {
        kept.push({ pill: p, box: ownerBox });
      }
    }
    if (window.__ag_active_tooltip_pill && !window.__ag_active_tooltip_pill.isConnected) {
      hideMetricsTooltipIfOwner(null);
    }
    return kept;
  }

  function assignPrimaryPillIds(mountedEntries, primaryCid) {
    if (!Array.isArray(mountedEntries) || mountedEntries.length === 0) return null;
    let primary = null;
    for (let i = 0; i < mountedEntries.length; i++) {
      const { pill, box } = mountedEntries[i];
      const focused = !(box.closest && box.closest('[data-pane-unfocused]'));
      if (focused && (!primaryCid || pill.getAttribute('data-ag-cascade-id') === primaryCid)) {
        primary = pill;
        break;
      }
    }
    if (!primary) {
      for (let i = 0; i < mountedEntries.length; i++) {
        const { pill, box } = mountedEntries[i];
        if (!(box.closest && box.closest('[data-pane-unfocused]'))) {
          primary = pill;
          break;
        }
      }
    }
    if (!primary && primaryCid) {
      for (let i = 0; i < mountedEntries.length; i++) {
        if (mountedEntries[i].pill.getAttribute('data-ag-cascade-id') === primaryCid) {
          primary = mountedEntries[i].pill;
          break;
        }
      }
    }
    if (!primary) primary = mountedEntries[0].pill;

    for (let i = 0; i < mountedEntries.length; i++) {
      const p = mountedEntries[i].pill;
      const t = getPillTextEl(p);
      if (p === primary) {
        if (p.id !== 'ag-live-metrics-pill') p.id = 'ag-live-metrics-pill';
        if (t && t.id !== 'ag-live-metrics-text') t.id = 'ag-live-metrics-text';
      } else {
        if (p.id) p.removeAttribute('id');
        if (t && t.id) t.removeAttribute('id');
      }
    }
    return primary;
  }

  function applyPayloadToPill(box, pill, payload) {
    if (!pill) return;
    const textEl = getPillTextEl(pill);
    const ttMap = isWeakMapInstance(window.__ag_pill_tooltip_map) ? window.__ag_pill_tooltip_map : pillTooltipMap;
    if (!payload || !payload.hasData) {
      pill.removeAttribute('data-ag-rendered-cid');
      if (textEl && textEl.innerHTML !== '') {
        textEl.innerHTML = '';
      }
      if (pill.style.display !== 'none') pill.style.display = 'none';
      ttMap.delete(pill);
      hideMetricsTooltipIfOwner(pill);
      return;
    }
    const renderedCid = String(payload.cascadeId || pill.getAttribute('data-ag-cascade-id') || '').trim().toLowerCase();
    if (renderedCid) {
      if (pill.getAttribute('data-ag-rendered-cid') !== renderedCid) {
        pill.setAttribute('data-ag-rendered-cid', renderedCid);
      }
    } else {
      pill.removeAttribute('data-ag-rendered-cid');
    }
    const nextTooltip = payload.tooltipHtml || '';
    ttMap.set(pill, nextTooltip);
    if (window.__ag_active_tooltip_pill === pill) {
      const tt = document.getElementById('ag-live-metrics-tooltip');
      if (tt && tt.getAttribute('data-visible') === '1' && tt.innerHTML !== nextTooltip) {
        tt.innerHTML = nextTooltip;
        if (tt.__ag_copy_feedback_until > Date.now() && tt.__ag_copy_feedback_cmd) {
          const newBtn = tt.querySelector && tt.querySelector('.ag-tt-copy-btn');
          if (
            newBtn &&
            String(newBtn.getAttribute('data-ag-copy-cmd') || '').trim() === tt.__ag_copy_feedback_cmd
          ) {
            newBtn.textContent = tt.__ag_copy_feedback_text || '✓ 已复制';
          }
        }
      }
    }
    const nextHtml = payload.inlineHtml || '';
    const textChanged = !!(textEl && textEl.innerHTML !== nextHtml);
    if (textEl && textChanged) {
      textEl.innerHTML = nextHtml;
    }
    const wasHidden = pill.style.display !== 'inline-flex';
    if (wasHidden) {
      pill.style.display = 'inline-flex';
    }
    if (wasHidden || textChanged) {
      ensureMetricsPillForBox(box, true, false);
    }
  }

  function syncPillForResolvedCascade(box, pill, cid) {
    if (!pill) return;
    if (!cid) {
      if (pill.hasAttribute('data-ag-cascade-id')) {
        pill.removeAttribute('data-ag-cascade-id');
      }
      applyPayloadToPill(box, pill, null);
      return;
    }
    if (pill.getAttribute('data-ag-cascade-id') !== cid) {
      pill.setAttribute('data-ag-cascade-id', cid);
    }
    const renderedCid = String(pill.getAttribute('data-ag-rendered-cid') || '').trim().toLowerCase();
    const cached = metricsById[cid];
    if (cached && cached.hasData) {
      if (renderedCid !== cid || pill.style.display !== 'inline-flex') {
        applyPayloadToPill(box, pill, cached);
      }
    } else if (renderedCid !== '' || pill.style.display === 'inline-flex') {
      applyPayloadToPill(box, pill, null);
    }
  }

  function ensureMetricsPill(forceLayout = false, resetHysteresis = false) {
    if (!MODULES.metrics) {
      document.querySelectorAll('#ag-live-metrics-pill, .ag-live-metrics-pill, [data-ag-metrics-pill]').forEach((el) => {
        el.style.display = 'none';
      });
      for (const ro of activeMetricsObservers) {
        try {
          ro.disconnect();
        } catch (e) {}
      }
      activeMetricsObservers.clear();
      hideMetricsTooltipIfOwner(null);
      return null;
    }
    const boxes = getAllInputBoxes();
    const totalBoxes = boxes.length;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      const pill = ensureMetricsPillForBox(box, forceLayout, resetHysteresis);
      if (pill) {
        syncPillForResolvedCascade(box, pill, resolveBoxCascadeId(box, totalBoxes));
      }
    }
    const kept = pruneOrphanedPills(boxes);
    return assignPrimaryPillIds(kept, extractFocusedOrPrimaryCascadeId());
  }

  window.__ag_ensure_metrics_pill_fn = ensureMetricsPill;

  window.__ag_render_metrics = function (payload) {
    try {
      if (!MODULES.metrics || !payload || typeof payload !== 'object') return;
      const cid = String(payload.cascadeId || '').trim().toLowerCase();
      if (!CASCADE_UUID_RE.test(cid)) return;
      metricsById[cid] = payload;
      const primaryCid = window.__ag_watched_cascade_id || extractFocusedOrPrimaryCascadeId();
      if (!primaryCid || cid === primaryCid) {
        window.__ag_last_metrics = payload;
      }
      ensureMetricsPill(false);
      const boxes = getAllInputBoxes();
      const totalBoxes = boxes.length;
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const pill = findPillInBox(box);
        if (!pill) continue;
        const boxCid =
          String(pill.getAttribute('data-ag-cascade-id') || '').trim().toLowerCase() ||
          resolveBoxCascadeId(box, totalBoxes);
        if (boxCid === cid) {
          if (pill.getAttribute('data-ag-cascade-id') !== cid) {
            pill.setAttribute('data-ag-cascade-id', cid);
          }
          applyPayloadToPill(box, pill, payload);
        }
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
      const boxes = getAllInputBoxes();
      const totalBoxes = boxes.length;
      const paneCids = [];
      const activeIds = [];
      const seenIds = new Set();
      for (let i = 0; i < boxes.length; i++) {
        const boxCid = resolveBoxCascadeId(boxes[i], totalBoxes);
        paneCids.push(boxCid);
        if (boxCid && !seenIds.has(boxCid)) {
          seenIds.add(boxCid);
          activeIds.push(boxCid);
        }
      }

      const pathname = window.location.pathname;
      const isChatRoute = pathname.startsWith('/c/');
      const primaryCid = extractFocusedOrPrimaryCascadeId() || activeIds[0] || '';
      const isHome =
        pathname === '/' ||
        (!isChatRoute && !primaryCid && activeIds.length === 0) ||
        (!isChatRoute && !!document.querySelector(SELECTORS.homeGreeting));
      const pageType = isHome ? 'home' : 'chat';
      if (document.documentElement.getAttribute('data-ag-page-type') !== pageType) {
        document.documentElement.setAttribute('data-ag-page-type', pageType);
      }

      if (!MODULES.metrics) {
        document.querySelectorAll('#ag-live-metrics-pill, .ag-live-metrics-pill, [data-ag-metrics-pill]').forEach((el) => {
          if (el.style.display !== 'none') el.style.display = 'none';
        });
        hideMetricsTooltipIfOwner(null);
        return;
      }

      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const pill = ensureMetricsPillForBox(box, false, false);
        if (pill) {
          syncPillForResolvedCascade(box, pill, paneCids[i]);
        }
      }

      const kept = pruneOrphanedPills(boxes);
      assignPrimaryPillIds(kept, primaryCid);

      const watchedIds = boxes.length === 0 && isChatRoute ? extractAllPathnameCascadeIds() : activeIds;
      const watchedSig = watchedIds.join(',');
      const primaryWatched = (primaryCid && seenIds.has(primaryCid) ? primaryCid : watchedIds[0]) || '';
      window.__ag_watched_cascade_ids = watchedIds;
      window.__ag_watched_cascade_id = primaryWatched;
      window.__ag_last_metrics = primaryWatched ? metricsById[primaryWatched] || null : null;

      if (watchedSig !== window.__ag_watched_cascade_sig) {
        window.__ag_watched_cascade_sig = watchedSig;
        if (typeof window.__agRequestMetrics === 'function') {
          try {
            window.__agRequestMetrics(JSON.stringify(watchedIds));
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  function scheduleRouteCheck() {
    const runCheck = () => {
      if (typeof window.__ag_check_route_fn === 'function') window.__ag_check_route_fn();
    };
    scheduleTrackedHandle(activeMetricsRafs, requestAnimationFrame, () => {
      scheduleTrackedHandle(metricsRouteTimers, (cb) => setTimeout(cb, 0), runCheck);
    });
    for (const delay of [120, 400]) {
      scheduleTrackedHandle(metricsRouteTimers, (cb) => setTimeout(cb, delay), runCheck);
    }
  }

  window.__ag_trigger_route_check_fn = scheduleRouteCheck;
  window.__ag_metrics_focusin_fn = (e) => {
    const t = e && e.target;
    if (!t || !t.closest) return;
    const rawId = String(SELECTORS.inputBoxId || '').trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const baseSel =
      '[data-pane-id], [data-testid="conversation-view"], [data-testid="side-question-tab-content"], [data-media-drop-scope="subpane"], [data-side-panel-strip]';
    const matchSel = rawId ? `${baseSel}, [id="${rawId}"]` : baseSel;
    if (t.closest(matchSel)) {
      scheduleRouteCheck();
    }
  };
  window.__ag_metrics_click_fn = (e) => {
    const t = e && e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-tab-id], [data-side-panel-strip]')) {
      scheduleRouteCheck();
    }
  };

  if (!IS_SWARM_PLUGIN_FRAME && !window.__ag_metrics_focusin_installed) {
    window.__ag_metrics_focusin_installed = true;
    document.addEventListener(
      'focusin',
      (e) => {
        if (typeof window.__ag_metrics_focusin_fn === 'function') {
          window.__ag_metrics_focusin_fn(e);
        }
      },
      true
    );
  }
  if (!IS_SWARM_PLUGIN_FRAME && !window.__ag_metrics_click_installed) {
    window.__ag_metrics_click_installed = true;
    document.addEventListener(
      'click',
      (e) => {
        if (typeof window.__ag_metrics_click_fn === 'function') {
          window.__ag_metrics_click_fn(e);
        }
      },
      true
    );
  }

  if (!IS_SWARM_PLUGIN_FRAME && !window.__ag_history_hook_installed) {
    window.__ag_history_hook_installed = true;
    const triggerRouteCheck = () => {
      if (typeof window.__ag_trigger_route_check_fn === 'function') {
        window.__ag_trigger_route_check_fn();
        return;
      }
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (typeof window.__ag_check_route_fn === 'function') window.__ag_check_route_fn();
        }, 0);
      });
      setTimeout(() => {
        if (typeof window.__ag_check_route_fn === 'function') window.__ag_check_route_fn();
      }, 120);
      setTimeout(() => {
        if (typeof window.__ag_check_route_fn === 'function') window.__ag_check_route_fn();
      }, 400);
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
  const SWARM_FRAME_ONLY_DICT = IS_SWARM_PLUGIN_FRAME
    ? {
        Coordinator: '协调器',
        Goal: '目标',
        Threads: '工作流',
        Now: '当前',
        Progress: '进度',
        Stuck: '受阻停滞',
        Moving: '推进中',
        Waiting: '等待中',
        Other: '其他',
        Tasks: '任务',
        Task: '任务',
        Active: '活跃中',
        Team: '团队',
        Retired: '已退役',
        Error: '错误',
        Killed: '已终止',
        Frames: '关键帧',
        Previous: '上一帧',
        Next: '下一帧',
        updating: '更新中',
        watching: '监听中',
        stopped: '已停止',
        stale: '待刷新',
        '(archived)': '（已归档）',
        '(empty)': '（空）',
        'tasks done': '项任务已完成'
      }
    : null;

  function dictLookup(s) {
    if (!s) return undefined;
    const exact = DICT[s];
    if (typeof exact === 'string') return exact;
    if (SWARM_FRAME_ONLY_DICT) {
      const swarmHit = SWARM_FRAME_ONLY_DICT[s];
      if (typeof swarmHit === 'string') return swarmHit;
    }
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
      'code, pre, kbd, samp, style, script, noscript, [data-markdown-root], [data-testid="user-message-content"], .agy-user-bubble, .monaco-editor, .monaco-diff-editor, .xterm, #ag-live-metrics-pill, .ag-live-metrics-pill, [data-ag-metrics-pill], #ag-live-metrics-tooltip, .msg-body, #raw, [data-testid="swarm-raw"], #swarm-title';
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
    const RE_IMAGES_COUNT = /^(\d+)\s+images?$/i;
    const RE_COMMENTS_COUNT = /^(\d+)\s+comments?$/i;
    const RE_SIDE_QUESTIONS_COUNT = /^(\d+)\s+side\s+questions?$/i;
    const RE_RESUME_COMMENT_DRAFTS = /^Resume\s+(\d+)\s+comment\s+drafts?$/i;
    const RE_VIEW_SIDE_QUESTIONS = /^View\s+(\d+)\s+side\s+questions?$/i;
    const RE_SIDE_QUESTION_TITLE = /^Side\s+Question:\s*(.+)$/i;
    const RE_OPENS_EXT_LINK = /^Opens\s+external\s+link:\s*(.+)$/i;
    const RE_OPEN_CONV_ID = /^Open\s+conversation\s+([0-9a-f-]{8,36})$/i;
    const RE_OPEN_PLUGIN_NAME = /^Open\s+the\s+([^\r\n]{1,80}?)\s+plugin$/i;
    const RE_EDIT_SIDE_Q_TITLE = /^Edit\s+side\s+question\s+title:\s*(.+)$/i;
    const RE_CONNECTED_TO_HOST = /^Connected\s+to\s+([^\r\n]{1,120})$/;

    // Swarm 侧车专属动态规则（仅在 IS_SWARM_PLUGIN_FRAME 下生效，主窗口零开销零误伤）
    const RE_SWARM_NUM_OF_NUM = /^(\d+)\s+of\s+(\d+)$/i;
    const RE_SWARM_WAITING_ON = /^Waiting\s+on\s+(@?\S+)$/i;
    const RE_SWARM_N_WAITING_ON = /^(\d+)\s+waiting\s+on\s+(@\S+)$/i;
    const RE_SWARM_N_STUCK = /^(\d+)\s+stuck$/i;
    const RE_SWARM_N_NEEDS_YOU = /^(\d+)\s+needs?\s+you$/i;
    const RE_SWARM_N_THREADS_OPEN = /^(\d+)\s+threads?\s+open$/i;
    const RE_SWARM_N_ACTIVE = /^(\d+)\s+active$/i;
    const RE_SWARM_LAST_SEEN = /^last\s+seen\s+(\d+)\s*(m|h|d)\s+ago$/i;
    const RE_SWARM_NOW_FRAC = /^Now\s*·\s*(\d+)\s*\/\s*(\d+)$/i;
    const RE_SWARM_READ_SEQ = /^read\s+#(\d+)(?:\s*·\s*updated\s+(.+))?$/i;
    const RE_SWARM_PAUSED_REASON = /^paused:\s*(quota|error)$/i;
    const RE_SWARM_OV_NOTES = /^overview\s*·\s*from\s+the\s+narrator['\u2019]s\s+notes(?:\s*·\s*(.+))?$/i;
    const RE_SWARM_YOU_SUFFIX = /^([A-Za-z0-9._-]+)\s+\(you\)$/;
    const RE_SWARM_FROM_OPT = /^From\s+([A-Za-z0-9._-]+)$/;
    const RE_SWARM_TO_OPT = /^To\s+(@?[A-Za-z0-9._-]+)$/;
    const RE_SWARM_LIVE_TIP = /^(Thinking|Latest action):\s*([\s\S]+)$/;
    const RE_SWARM_RUNS_ON = /^Runs\s+on\s+(.+)$/i;
    const RE_SWARM_NARRATOR_READ = /^Narrator\s+read\s+up\s+to\s+#(\d+)\s+of\s+(\d+)$/i;
    const RE_SWARM_POSTS_SINCE_UPD = /^(\d+)\s+posts?\s+since\s+the\s+view\s+was\s+updated$/i;
    const RE_SWARM_NARRATOR_FAILED_TIP = /^The\s+narrator['\u2019]s\s+last\s+step\s+failed:\s*(.+)$/i;
    const RE_SWARM_POSTED_IN_CH = /^Posted\s+in\s+#([^\s;]+);\s*click\s+to\s+show\s+only\s+#\1$/i;
    const RE_SWARM_GOTO_SEQ = /^Go\s+to\s+#(\d+)(?:\s*\((.+)\))?$/i;
    const RE_SWARM_TPROG_DONE = /^(.+?)\s+done$/i;
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
    const RE_MODEL_EFFORT_LABEL =
      /^(Gemini\b[\w .+-]*|Claude\b[\w .+-]*|GPT\b[\w .+-]*)\s+\((Extra\s+High|Minimal|Low|Medium|High|Extra|XHigh|Max)\)$/i;
    const RE_YOUR_PLAN = /^Your Plan:\s*([^\r\n]{1,80})$/;
    const RE_AVAILABLE_AI_CREDITS = /^Available AI Credits:\s*([^\r\n]{1,40})$/i;
    const RE_EXITED_CODE_ONLY = /^Exited with code\s+(-?\d+)(\.)?$/i;
    const RE_SUMMARY_EXITED_CODE = /^([^\r\n]{1,220}?)\s*·\s*Exited with code\s+(-?\d+)$/;
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
      /^(.*?)\s*(?:\((Extra\s+High|Minimal|Low|Medium|High|Extra|XHigh|Max)(?:\s+thinking)?\)|\b(Extra\s+High|Minimal|Low|Medium|High|Extra|XHigh|Max))(?:\s*·\s*(.+))?\s*$/i;
    const EFFORT_MAP = { minimal: '最低', low: '低', medium: '中', high: '高', extra: '超高', 'extra high': '超高', xhigh: '超高', max: '最高' };
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

    const MARKDOWN_UI_ATTR_SELECTOR =
      'button[aria-label], button[title], [role="region"][aria-label], span[aria-label^="Opens external link:"]';

    function isMarkdownChromeAttrTarget(el) {
      return !!(
        el &&
        el.nodeType === 1 &&
        el.matches &&
        el.matches(MARKDOWN_UI_ATTR_SELECTOR) &&
        el.closest('[data-markdown-root]') &&
        !el.closest('pre, code, .monaco-editor, .monaco-diff-editor, .xterm')
      );
    }

    function canTranslateElementAttrs(el, batchSafeSet) {
      if (!el || el.nodeType !== 1) return false;
      if (isMarkdownChromeAttrTarget(el)) return true;
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
        if (RE_IMAGES_COUNT.test(trimmed)) return raw.replace(RE_IMAGES_COUNT, '$1 张图片');
        if (RE_COMMENTS_COUNT.test(trimmed)) return raw.replace(RE_COMMENTS_COUNT, '$1 条评论');
        if (RE_SIDE_QUESTIONS_COUNT.test(trimmed)) return raw.replace(RE_SIDE_QUESTIONS_COUNT, '$1 个支线提问');
        if (RE_INSTALLED_COUNT.test(trimmed)) return raw.replace(RE_INSTALLED_COUNT, '已安装 $1 项');
        if (RE_ACCOUNTS_COUNT.test(trimmed)) return raw.replace(RE_ACCOUNTS_COUNT, '$1 个账号');
        if (RE_PROJECTS_COUNT.test(trimmed)) return raw.replace(RE_PROJECTS_COUNT, '$1 个项目');
        if (RE_CALLS_MB.test(trimmed)) return raw.replace(RE_CALLS_MB, '$1 次通话 · $2');
        if (RE_TASKS_DONE.test(trimmed)) return raw.replace(RE_TASKS_DONE, '已完成 $1 / $2 项任务');
        if (RE_POSTS_COUNT.test(trimmed)) return raw.replace(RE_POSTS_COUNT, '$1 条发言');
        if (RE_MEMBERS_COUNT.test(trimmed)) return raw.replace(RE_MEMBERS_COUNT, '$1 名成员');
        if (RE_MCP_FAILED_START.test(trimmed)) return raw.replace(RE_MCP_FAILED_START, '$1 个 MCP 服务器启动失败');
        if (IS_SWARM_PLUGIN_FRAME) {
          if (RE_SWARM_N_WAITING_ON.test(trimmed)) return raw.replace(RE_SWARM_N_WAITING_ON, '$1 项等待 $2');
          if (RE_SWARM_N_STUCK.test(trimmed)) return raw.replace(RE_SWARM_N_STUCK, '$1 项受阻停滞');
          if (RE_SWARM_N_NEEDS_YOU.test(trimmed)) return raw.replace(RE_SWARM_N_NEEDS_YOU, '$1 项需要您处理');
          if (RE_SWARM_N_THREADS_OPEN.test(trimmed)) return raw.replace(RE_SWARM_N_THREADS_OPEN, '$1 个工作流进行中');
          if (RE_SWARM_N_ACTIVE.test(trimmed)) return raw.replace(RE_SWARM_N_ACTIVE, '$1 项活跃');
          if (contextEl && contextEl.closest && contextEl.closest('.o2-progt') && RE_SWARM_NUM_OF_NUM.test(trimmed)) {
            return raw.replace(RE_SWARM_NUM_OF_NUM, '$1 / $2');
          }
        }
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
      if (IS_SWARM_PLUGIN_FRAME) {
        if (firstUpper === 'W' && RE_SWARM_WAITING_ON.test(trimmed)) {
          return raw.replace(RE_SWARM_WAITING_ON, '等待 $1');
        }
        if (firstUpper === 'L') {
          const mSeen = trimmed.match(RE_SWARM_LAST_SEEN);
          if (mSeen) {
            const u = UNIT_MAP_SHORT[mSeen[2].toLowerCase()] || mSeen[2];
            return raw.replace(trimmed, () => '上次活跃 ' + mSeen[1] + ' ' + u + '前');
          }
        }
        if (firstUpper === 'N' && RE_SWARM_NOW_FRAC.test(trimmed)) {
          return raw.replace(RE_SWARM_NOW_FRAC, '当前 · $1 / $2');
        }
        if (firstUpper === 'R') {
          const mRead = trimmed.match(RE_SWARM_READ_SEQ);
          if (mRead) {
            const updPart = mRead[2] ? ' · 更新于 ' + (computeTextTranslation(mRead[2].trim(), contextEl) || mRead[2].trim()) : '';
            return raw.replace(trimmed, () => '已读 #' + mRead[1] + updPart);
          }
        }
        if (firstUpper === 'P') {
          const mPaused = trimmed.match(RE_SWARM_PAUSED_REASON);
          if (mPaused) {
            return raw.replace(trimmed, () => '已暂停：' + (mPaused[1].toLowerCase() === 'quota' ? '配额耗尽' : '错误'));
          }
        }
        if (firstUpper === 'O') {
          const mOvNotes = trimmed.match(RE_SWARM_OV_NOTES);
          if (mOvNotes) {
            const rRaw = mOvNotes[1] ? mOvNotes[1].trim() : '';
            const rZh = rRaw ? dictLookup(rRaw) || rRaw : '';
            return raw.replace(trimmed, () => '概览 · 来自纪要员笔记' + (rZh ? ' · ' + rZh : ''));
          }
        }
        if (firstUpper === 'F' && contextEl && contextEl.tagName === 'OPTION' && RE_SWARM_FROM_OPT.test(trimmed)) {
          return raw.replace(RE_SWARM_FROM_OPT, '来自 $1');
        }
        if (firstUpper === 'T' && contextEl && contextEl.tagName === 'OPTION' && RE_SWARM_TO_OPT.test(trimmed)) {
          return raw.replace(RE_SWARM_TO_OPT, '发给 $1');
        }
        if (trimmed.endsWith('(you)') && RE_SWARM_YOU_SUFFIX.test(trimmed)) {
          return raw.replace(RE_SWARM_YOU_SUFFIX, '$1（您）');
        }
      }
      if (firstUpper === 'S') {
        if (RE_SEE_ALL.test(trimmed)) return raw.replace(RE_SEE_ALL, '查看全部 ($1)');
        if (RE_SHOW_BREAKDOWNS.test(trimmed)) return raw.replace(RE_SHOW_BREAKDOWNS, '展开明细 ($1 项)');
        if (RE_SHOW_MORE_SUBAGENTS.test(trimmed)) return raw.replace(RE_SHOW_MORE_SUBAGENTS, '显示另外 $1 个子 Agent');
        if (RE_SHOW_EARLIER_STEPS.test(trimmed)) return raw.replace(RE_SHOW_EARLIER_STEPS, '展开前 $1 个步骤');
        if (RE_SORT_FILTER_ACTIVE.test(trimmed)) return raw.replace(RE_SORT_FILTER_ACTIVE, '排序与筛选对话（已启用 $1 项）');
        if (RE_STILL_THINKING_SEC.test(trimmed)) return raw.replace(RE_STILL_THINKING_SEC, '仍在思考（$1 秒）');
        if (RE_SIDE_QUESTION_TITLE.test(trimmed)) return raw.replace(RE_SIDE_QUESTION_TITLE, (_, q) => '支线提问：' + q);
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
        if (firstUpper === 'E') {
          const mExitOnly = trimmed.match(RE_EXITED_CODE_ONLY);
          if (mExitOnly) {
            return raw.replace(trimmed, () => '已退出，退出码 ' + mExitOnly[1] + (mExitOnly[2] ? '。' : ''));
          }
        }
        if (firstUpper === 'R') {
          if (RE_RESUME_COMMENT_DRAFTS.test(trimmed)) {
            return raw.replace(RE_RESUME_COMMENT_DRAFTS, '恢复 $1 条评论草稿');
          }
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
        if (RE_VIEW_SIDE_QUESTIONS.test(trimmed)) {
          return raw.replace(RE_VIEW_SIDE_QUESTIONS, '查看 $1 个支线提问');
        }
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
      } else if (firstUpper === 'C') {
        if (
          contextEl &&
          contextEl.closest &&
          contextEl.closest('[data-testid="ssh-machine-switcher-status"]') &&
          RE_CONNECTED_TO_HOST.test(trimmed)
        ) {
          return raw.replace(RE_CONNECTED_TO_HOST, '已连接到 $1');
        }
      } else if (firstUpper === 'Y') {
        const mYourPlan = trimmed.match(RE_YOUR_PLAN);
        if (mYourPlan) {
          return raw.replace(trimmed, () => '当前套餐：' + mYourPlan[1].trim());
        }
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
          return raw.replace(
            RE_QUOTA_RESET_SWITCH,
            (_, m, dt) =>
              '您的 ' +
              (dictLookup(m.trim()) || computeTextTranslation(m.trim(), contextEl) || m.trim()) +
              ' 配额将于 ' +
              dt +
              ' 重置，请切换至其他可用模型以继续。'
          );
        }
        if (RE_QUOTA_REACHED_SWITCH.test(trimmed)) {
          return raw.replace(
            RE_QUOTA_REACHED_SWITCH,
            (_, m) =>
              '您的 ' +
              (dictLookup(m.trim()) || computeTextTranslation(m.trim(), contextEl) || m.trim()) +
              ' 配额已用尽，请切换至其他可用模型以继续。'
          );
        }
        const mNeedCred = trimmed.match(RE_NEED_CREDITS_MODEL);
        if (mNeedCred) {
          const amtPart = mNeedCred[1] ? '至少 ' + mNeedCred[1] + ' 点' : '更多';
          const modName =
            mNeedCred[2].trim() === 'this model'
              ? '该模型'
              : dictLookup(mNeedCred[2].trim()) || computeTextTranslation(mNeedCred[2].trim(), contextEl) || mNeedCred[2].trim();
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
        const mAvailCred = trimmed.match(RE_AVAILABLE_AI_CREDITS);
        if (mAvailCred) {
          return raw.replace(trimmed, () => '可用 AI 点数：' + mAvailCred[1].trim());
        }
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
        const mModEff = trimmed.match(RE_MODEL_EFFORT_LABEL);
        if (mModEff) {
          const effZh = EFFORT_MAP[mModEff[2].replace(/\s+/g, ' ').toLowerCase()] || mModEff[2];
          return raw.replace(trimmed, () => mModEff[1].trim() + ' (' + effZh + ')');
        }
      }
      if (trimmed.length < 240 && trimmed.includes('Exited with code')) {
        const mSumExit = trimmed.match(RE_SUMMARY_EXITED_CODE);
        if (mSumExit) {
          return raw.replace(trimmed, () => mSumExit[1].trim() + ' · 退出码 ' + mSumExit[2]);
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
      const mExtLink = atrim.match(RE_OPENS_EXT_LINK);
      if (mExtLink) {
        return '打开外部链接：' + mExtLink[1].trim();
      }
      const mOpenConv = atrim.match(RE_OPEN_CONV_ID);
      if (mOpenConv) {
        return '打开对话 ' + mOpenConv[1];
      }
      const mOpenPlugin = atrim.match(RE_OPEN_PLUGIN_NAME);
      if (mOpenPlugin) {
        return '打开 ' + mOpenPlugin[1].trim() + ' 插件';
      }
      const mEditSq = atrim.match(RE_EDIT_SIDE_Q_TITLE);
      if (mEditSq) {
        return '编辑支线提问标题：' + mEditSq[1].trim();
      }
      if (IS_SWARM_PLUGIN_FRAME) {
        const mLiveTip = atrim.match(RE_SWARM_LIVE_TIP);
        if (mLiveTip) {
          return (mLiveTip[1] === 'Thinking' ? '思考中：' : '最新动作：') + mLiveTip[2];
        }
        const mRunsOn = atrim.match(RE_SWARM_RUNS_ON);
        if (mRunsOn) {
          return '运行于 ' + mRunsOn[1].trim();
        }
        const mNarRead = atrim.match(RE_SWARM_NARRATOR_READ);
        if (mNarRead) {
          return '纪要员已读至 #' + mNarRead[1] + ' / 共 ' + mNarRead[2] + ' 条';
        }
        const mPostsSince = atrim.match(RE_SWARM_POSTS_SINCE_UPD);
        if (mPostsSince) {
          return '视图更新后新增 ' + mPostsSince[1] + ' 条发言';
        }
        const mNarFail = atrim.match(RE_SWARM_NARRATOR_FAILED_TIP);
        if (mNarFail) {
          return '纪要员上一步失败：' + mNarFail[1].trim();
        }
        const mPostedCh = atrim.match(RE_SWARM_POSTED_IN_CH);
        if (mPostedCh) {
          return '发布于 #' + mPostedCh[1] + '；点击仅看 #' + mPostedCh[1];
        }
        const mGotoSeq = atrim.match(RE_SWARM_GOTO_SEQ);
        if (mGotoSeq) {
          return '跳至 #' + mGotoSeq[1] + (mGotoSeq[2] ? '（' + mGotoSeq[2].trim() + '）' : '');
        }
        if (el && el.classList && el.classList.contains('o2-tprog')) {
          const mTpDone = atrim.match(RE_SWARM_TPROG_DONE);
          if (mTpDone) {
            return '已完成 ' + mTpDone[1].trim();
          }
        }
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

    function translateMarkdownChromeSubtree(container) {
      if (!container || container.nodeType !== 1) return;
      if (isMarkdownChromeAttrTarget(container)) {
        translateElementAttrs(container);
      }
      if (!container.querySelectorAll) return;
      const els = container.querySelectorAll(MARKDOWN_UI_ATTR_SELECTOR);
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el.closest('pre, code, .monaco-editor, .monaco-diff-editor, .xterm')) {
          translateElementAttrs(el);
        }
      }
    }

    const walkerFilter = {
      acceptNode(node) {
        if (node.nodeType === 1) {
          if (node.matches && node.matches(EXCLUDE_SELECTOR)) {
            if (node.isConnected && node.matches(TEXT_IMMUTABLE_EXCLUDE_SELECTOR)) {
              immutableTextExclCache.set(node, true);
            }
            if (node.matches('[data-markdown-root]')) {
              translateMarkdownChromeSubtree(node);
              return NodeFilter.FILTER_REJECT;
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
        if (root.closest && root.closest('[data-markdown-root]')) {
          translateMarkdownChromeSubtree(root);
          return;
        }
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
            if (m.target.closest && m.target.closest('[data-markdown-root]')) {
              for (let j = 0; j < m.addedNodes.length; j++) {
                const n = m.addedNodes[j];
                if (
                  n.nodeType === 1 &&
                  ((n.matches && n.matches(MARKDOWN_UI_ATTR_SELECTOR)) ||
                    (n.firstElementChild && n.querySelector && n.querySelector(MARKDOWN_UI_ATTR_SELECTOR)))
                ) {
                  dirtyRoots.add(n);
                }
              }
            }
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
      if (typeof window.__ag_ensure_warm_night_btn_fn === 'function' && document.body) {
        if (window.__ag_appearance_toggle_observer) {
          try {
            window.__ag_appearance_toggle_observer.disconnect();
            window.__ag_appearance_toggle_observer.observe(document.body, { childList: true, subtree: true });
          } catch (e) {}
        }
        window.__ag_ensure_warm_night_btn_fn(document);
      }
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
    darkPreset: DEFAULT_DARK_PRESET,
    config: boot.config || {},
    modules: MODULES,
    features: MODULES,
    themeVars: THEME_VARS,
    darkThemeVars: DARK_THEME_VARS,
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
  if (!IS_SWARM_PLUGIN_FRAME) {
    return window.__ag_resolved_theme_mode || null;
  }
})(__AG_BOOT_PAYLOAD__);
