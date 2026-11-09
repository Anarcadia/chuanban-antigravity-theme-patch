/**
 * chuanban-antigravity-theme-patch · Browser Runtime Engine (core/runtime.js)
 * 纯正浏览器端注入脚本（零模板字符串双重转义）。
 * 由 core/daemon.mjs 读取并将文件末尾的启动载荷占位符替换为实时配置与资源对象。
 */
((boot) => {
  // 0. 顶层窗口隔离：绝不注入 Artifact / HTML 预览等子 iframe
  if (window.top !== window) return;
  if (!boot || typeof boot !== 'object') return;

  const PATCH_VERSION = boot.version || '20261110-v5.0.1';
  const ENABLED = boot.enabled !== false;
  const CSS_TEXT = boot.cssText || '';
  const CUSTOM_CSS_TEXT = boot.customCss || '';
  const THEME_VARS = boot.themeVars && typeof boot.themeVars === 'object' ? boot.themeVars : {};
  const RAW_MODULES = Object.assign({}, boot.features || {}, boot.modules || {});
  if (typeof RAW_MODULES.metricsCapsule === 'boolean' && typeof RAW_MODULES.metrics !== 'boolean') {
    RAW_MODULES.metrics = RAW_MODULES.metricsCapsule;
  }
  const MODULES = Object.assign(
    {
      i18n: true,
      metrics: true,
      composerWaxSeal: true,
      deadlockHealer: true,
      customCss: true,
      customJs: true
    },
    RAW_MODULES
  );
  MODULES.metricsCapsule = MODULES.metrics;

  const DEFAULT_PRESET = boot.preset || 'high-contrast';
  const DEFAULT_BRANCH_PILL_SELECTOR =
    '[data-testid="branch-pill-trigger"], [data-testid="project-selector-trigger"], [data-testid="location-selector-trigger"], [aria-label^="Select project"], [aria-label^="选择项目"]';
  const LEGACY_BRANCH_PILL_SELECTORS = new Set([
    '[data-testid="branch-pill-trigger"], [aria-label^="Select project"], [aria-label^="选择项目"]',
    '#antigravity\\.agentSidePanelInputBox [data-testid="branch-pill-trigger"], [id="antigravity.agentSidePanelInputBox"] [data-testid="branch-pill-trigger"], #antigravity\\.agentSidePanelInputBox [aria-label^="Select project"], [id="antigravity.agentSidePanelInputBox"] [aria-label^="Select project"], #antigravity\\.agentSidePanelInputBox [aria-label^="选择项目"], [id="antigravity.agentSidePanelInputBox"] [aria-label^="选择项目"]'
  ]);
  const SELECTORS = Object.assign(
    {
      inputBoxId: 'antigravity.agentSidePanelInputBox',
      branchPillInBox: DEFAULT_BRANCH_PILL_SELECTOR,
      homeGreeting: '[data-testid="home-greeting"]',
      excludeI18n:
        'code, pre, kbd, samp, textarea, input, style, script, noscript, [contenteditable="true"], .prose, .markdown, [class*="chat-message"], [class*="group/file-title"], [data-testid="conversation-row-sidebar"] a[href^="/c/"], [data-testid="conversation-row-sidebar"] span.truncate, #ag-live-metrics-pill, #ag-live-metrics-tooltip'
    },
    boot.selectors || {}
  );
  if (LEGACY_BRANCH_PILL_SELECTORS.has(SELECTORS.branchPillInBox)) {
    SELECTORS.branchPillInBox = DEFAULT_BRANCH_PILL_SELECTOR;
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
        if (rec && node.nodeValue === rec.lastVal) {
          node.nodeValue = rec.origRaw;
          origTextMap.delete(node);
        }
      }
      const attrEls = root.querySelectorAll
        ? root.querySelectorAll('[data-ag-orig-title], [data-ag-orig-placeholder], [data-ag-orig-aria-label]')
        : [];
      for (let i = 0; i < attrEls.length; i++) {
        const el = attrEls[i];
        if (el.hasAttribute('data-ag-orig-title')) {
          el.setAttribute('title', el.getAttribute('data-ag-orig-title'));
          el.removeAttribute('data-ag-orig-title');
        }
        if (el.hasAttribute('data-ag-orig-placeholder')) {
          el.setAttribute('placeholder', el.getAttribute('data-ag-orig-placeholder'));
          el.removeAttribute('data-ag-orig-placeholder');
        }
        if (el.hasAttribute('data-ag-orig-aria-label')) {
          el.setAttribute('aria-label', el.getAttribute('data-ag-orig-aria-label'));
          el.removeAttribute('data-ag-orig-aria-label');
        }
      }
    } catch (e) {}
  }

  function applyThemeVars(varsObj) {
    const prevKeys = Array.isArray(window.__ag_applied_theme_vars) ? window.__ag_applied_theme_vars : [];
    const nextKeys = Object.keys(varsObj || {});
    for (let i = 0; i < prevKeys.length; i++) {
      const k = prevKeys[i];
      if (!(k in (varsObj || {}))) {
        document.documentElement.style.removeProperty(k);
        if (document.body) document.body.style.removeProperty(k);
      }
    }
    for (let i = 0; i < nextKeys.length; i++) {
      const k = nextKeys[i];
      const v = varsObj[k];
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        const trimmedVal = String(v).trim();
        document.documentElement.style.setProperty(k, trimmedVal, 'important');
        if (document.body) document.body.style.setProperty(k, trimmedVal, 'important');
      } else {
        document.documentElement.style.removeProperty(k);
        if (document.body) document.body.style.removeProperty(k);
      }
    }
    if (varsObj && varsObj['--ag-chat-font-size']) {
      document.documentElement.setAttribute('data-ag-custom-font-size', 'true');
    } else {
      document.documentElement.removeAttribute('data-ag-custom-font-size');
    }
    window.__ag_applied_theme_vars = nextKeys;
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
    if (window.__ag_metrics_route_watcher) {
      try {
        clearInterval(window.__ag_metrics_route_watcher);
      } catch (e) {}
      window.__ag_metrics_route_watcher = null;
    }
    applyThemeVars({});
    document.documentElement.removeAttribute('data-ag-preset');
    document.documentElement.removeAttribute('data-ag-page-type');
    document.documentElement.removeAttribute('data-ag-wax-seal');
    restoreAllTranslations(document.body);
    window.__ag_patch_version = PATCH_VERSION + '-disabled';
    return;
  }

  // ============================================================================
  // 1. 注入更纱黑体与主题样式（#ag-custom-fonts 与独立 #antigravity-user-custom-style）
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

  applyThemeVars(THEME_VARS);
  document.documentElement.setAttribute('data-ag-wax-seal', MODULES.composerWaxSeal === false ? 'off' : 'on');
  const detectedOs =
    boot.platform || (/Win/i.test(navigator.platform || '') ? 'win32' : /Mac/i.test(navigator.platform || '') ? 'darwin' : 'linux');
  document.documentElement.setAttribute('data-ag-os', detectedOs);

  // ============================================================================
  // 2. 防死锁守护：Antigravity 原生 TanStack Router 缺陷修复（支持热重载更新回调）
  // ============================================================================
  window.__ag_settings_click_fn = (e) => {
    if (MODULES.deadlockHealer === false) return;
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
  // 2.1 缩放快捷键原生缺陷修复（macOS: Cmd + -/=/0，Windows/Linux: Ctrl + -/=/0）
  // ============================================================================
  window.__ag_zoom_keydown_fn = (e) => {
    if (MODULES.deadlockHealer === false) return;
    const isMac = detectedOs === 'darwin';
    const modKey = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (modKey && !e.altKey) {
      if (!e.shiftKey && (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract' || e.keyCode === 189)) {
        e.preventDefault();
        e.stopPropagation();
        window.electronNative?.zoomOut?.();
      } else if (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd' || e.keyCode === 187) {
        e.preventDefault();
        e.stopPropagation();
        window.electronNative?.zoomIn?.();
      } else if (!e.shiftKey && (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0' || e.keyCode === 48)) {
        e.preventDefault();
        e.stopPropagation();
        window.electronNative?.zoomReset?.();
      }
    }
  };

  if (!window.__ag_zoom_guard_installed) {
    window.__ag_zoom_guard_installed = true;
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
      const stored = Storage.prototype.getItem.call(localStorage, 'theme-preset-light');
      if (ALL_CUSTOM_PRESET_NAMES.has(stored)) {
        try {
          Storage.prototype.setItem.call(localStorage, 'theme-preset-light', 'Default Light');
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

      if (document.documentElement.getAttribute('data-ag-preset') !== targetPreset) {
        document.documentElement.setAttribute('data-ag-preset', targetPreset);
      }
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
        return val;
      };

      const origSetItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (key, val) {
        if (key === 'theme-preset-light' && ALL_CUSTOM_PRESET_NAMES.has(val)) {
          val = 'Default Light';
        }
        origSetItem(key, val);
        if (key === 'theme-preset-light' || key === 'theme-mode' || key === 'theme-color-flavor') {
          setTimeout(() => {
            if (typeof window.__ag_sync_preset_fn === 'function') window.__ag_sync_preset_fn();
          }, 50);
        }
      };
    } catch (e) {}
  }

  syncChuanbanPreset();
  window.__ag_patch_version = PATCH_VERSION;

  // ============================================================================
  // 3.5 模型名称同行实时指标胶囊 (Scheme C: TPS · TTFT · Ctx/256k · Out + Hover 详情卡)
  // 严格保证「左(模型) - 中(指标胶囊) - 右(模式与发送)」三栏结构；中间过窄(<150px)时物理跳至下方第二行。
  // ============================================================================
  const MIDDLE_MIN_WIDTH_PX = 150;

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

  function ensureMetricsPill(forceLayout = false) {
    // 清理旧版残留的 ResizeObserver，防止新旧 Observer 互相抢夺 DOM 节点引发高度震荡
    if (window.__ag_pill_resize_observer) {
      try {
        window.__ag_pill_resize_observer.disconnect();
      } catch (e) {}
      window.__ag_pill_resize_observer = null;
    }
    if (!MODULES.metrics) {
      const existing = document.getElementById('ag-live-metrics-pill');
      if (existing) existing.style.display = 'none';
      return null;
    }
    const box = document.getElementById(SELECTORS.inputBoxId);
    if (!box) return null;
    const bottomRow = findFooterRow(box);
    if (!bottomRow || !bottomRow.children[0]) return null;
    const leftGroup = bottomRow.children[0];
    const rightGroup = bottomRow.children[1] || null;

    // 清理旧版残留类名与内联 flex 样式
    if (bottomRow.classList.contains('ag-footer-row-wrap')) {
      bottomRow.classList.remove('ag-footer-row-wrap');
    }
    if (leftGroup.style.flex) leftGroup.style.removeProperty('flex');
    if (rightGroup && rightGroup.style.flex) rightGroup.style.removeProperty('flex');

    let pill = document.getElementById('ag-live-metrics-pill');
    if (pill && (pill.getAttribute('data-v') !== '3' || pill.classList.contains('ag-pill-middle') || pill.classList.contains('ag-pill-wrapped'))) {
      pill.classList.remove('ag-pill-middle', 'ag-pill-wrapped');
    }
    let isNewPill = false;
    if (!pill) {
      isNewPill = true;
      pill = document.createElement('div');
      pill.id = 'ag-live-metrics-pill';
      pill.setAttribute('data-v', '3');
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

    if (
      typeof ResizeObserver !== 'undefined' &&
      (window.__ag_metrics_ro_target !== bottomRow || window.__ag_metrics_ro_ver !== PATCH_VERSION)
    ) {
      if (window.__ag_metrics_ro) {
        try {
          window.__ag_metrics_ro.disconnect();
        } catch (e) {}
      }
      window.__ag_metrics_ro_target = bottomRow;
      window.__ag_metrics_ro_ver = PATCH_VERSION;
      window.__ag_last_row_width = -1;
      window.__ag_metrics_ro = new ResizeObserver(() => {
        if (window.__ag_metrics_raf) return;
        window.__ag_metrics_raf = requestAnimationFrame(() => {
          window.__ag_metrics_raf = 0;
          const w = bottomRow.clientWidth || 0;
          if (w > 0 && Math.abs(w - (window.__ag_last_row_width || 0)) >= 1) {
            window.__ag_last_row_width = w;
            if (typeof window.__ag_ensure_metrics_pill_fn === 'function') {
              window.__ag_ensure_metrics_pill_fn(true);
            }
          }
        });
      });
      window.__ag_metrics_ro.observe(bottomRow);
    }

    const isMountedHere =
      pill.parentElement === leftGroup || (bottomRow.parentElement && pill.parentElement === bottomRow.parentElement);
    if (!forceLayout && !isNewPill && isMountedHere) {
      return pill;
    }

    const rowW = bottomRow.clientWidth || 0;
    window.__ag_last_row_width = rowW;
    const leftW = measureNaturalLeftWidth(leftGroup);
    const rightW = rightGroup ? rightGroup.offsetWidth || 0 : 0;
    const availMiddleW = rowW - leftW - rightW - 14;
    const useBottomRow = rowW > 0 && availMiddleW < MIDDLE_MIN_WIDTH_PX;
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
      let textChanged = false;
      if (textEl && textEl.innerHTML !== payload.inlineHtml) {
        textEl.innerHTML = payload.inlineHtml;
        textChanged = true;
      }
      if (ttEl && ttEl.innerHTML !== payload.tooltipHtml) {
        ttEl.innerHTML = payload.tooltipHtml;
      }
      if (pill.style.display !== 'inline-flex') {
        pill.style.display = 'inline-flex';
        textChanged = true;
      }
      if (textChanged) {
        ensureMetricsPill(true);
      }
    } catch (e) {}
  };

  window.__ag_update_live_metrics = window.__ag_render_metrics;

  function checkRouteAndMountMetrics() {
    try {
      if (document.hidden) return;
      const pathname = window.location.pathname;
      const isNonChatRoute = pathname === '/' || !pathname.startsWith('/c/');
      let isHome = isNonChatRoute;
      if (!isHome) {
        const box = document.getElementById(SELECTORS.inputBoxId);
        const hasBranchPillInBox = !!(box && box.querySelector(SELECTORS.branchPillInBox));
        isHome = hasBranchPillInBox || !!document.querySelector(SELECTORS.homeGreeting);
      }
      const pageType = isHome ? 'home' : 'chat';
      if (document.documentElement.getAttribute('data-ag-page-type') !== pageType) {
        document.documentElement.setAttribute('data-ag-page-type', pageType);
      }
      if (document.body && document.body.hasAttribute('data-ag-page-type')) {
        document.body.removeAttribute('data-ag-page-type');
      }

      if (!MODULES.metrics) {
        const existing = document.getElementById('ag-live-metrics-pill');
        if (existing) existing.style.display = 'none';
        return;
      }

      const cid = extractCascadeId();
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
        const pill = document.getElementById('ag-live-metrics-pill');
        if (pill && (!window.__ag_last_metrics || window.__ag_last_metrics.cascadeId !== cid)) {
          pill.style.display = 'none';
        }
        if (typeof window.__agRequestMetrics === 'function') {
          try {
            window.__agRequestMetrics(cid);
          } catch (e) {}
        }
        if (typeof window.__ag_on_session_change === 'function') {
          try {
            window.__ag_on_session_change(cid);
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

  if (!window.__ag_history_hook_installed) {
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
  window.__ag_metrics_route_watcher = setInterval(checkRouteAndMountMetrics, 1500);
  checkRouteAndMountMetrics();

  // ============================================================================
  // 4. 高性能界面汉化引擎（无原型词典 + WeakMap 热重载还原 + 单遍扫描 + 首字符分流）
  // ============================================================================
  if (window.__ag_i18n_observer) {
    try {
      window.__ag_i18n_observer.disconnect();
    } catch (e) {}
    window.__ag_i18n_observer = null;
  }

  const DICT = Object.assign(Object.create(null), boot.i18nDict || {});
  window.__ag_i18n_dict = DICT;

  if (MODULES.i18n) {
    const EXCLUDE_SELECTOR = SELECTORS.excludeI18n;

    // 预编译模块级正则常量，消除热路径重复编译与二次匹配
    const RE_HAS_CJK = /[\u4e00-\u9fa5]/;
    const RE_PURE_ALPHA = /^\s*[a-zA-Z]+\s*$/;
    const RE_HAS_ALPHA = /[a-zA-Z]/;
    const RE_FILES_CHANGED = /^(\d+)\s+files?\s+changed$/i;
    const RE_TOOLS = /^(\d+)\s+tools?$/i;
    const RE_DEMOTED = /^(\d+)\s+demoted$/i;
    const RE_EXCLUDED = /^(\d+)\s+excluded$/i;
    const RE_TOOLS_EXCLUDED = /^(\d+)\s+tools?\s+excluded$/i;
    const RE_ACTIVE_CONVS = /^(\d+)\s+active\s+conversations$/i;
    const RE_UPDATES_COUNT = /^(\d+)\s+updates?$/i;
    const RE_PROJECTS_COUNT = /^(\d+)\s+projects?$/i;
    const RE_CALLS_MB = /^(\d+)\s+calls?\s*·\s*([\d.]+\s*MB)$/i;
    const RE_SEE_ALL = /^See all\s*\((\d+)\)$/i;
    const RE_SHOW_BREAKDOWNS = /^Show\s+(\d+)\s+breakdowns?$/i;
    const RE_SHOW_MORE_SUBAGENTS = /^Show\s+(\d+)\s+more\s+subagents?$/i;
    const RE_ZIPPING_FOLDER = /^Zipping\s+(.+?)(?:…|\.\.\.)$/i;
    const RE_PERM_DELETE = /^Permanently delete\s+(.*)\s+including\s+(\d+)\s+active\s+conversations\.?$/i;
    const RE_WORKED_FOR_UPDATES = /^Worked for\s+([<0-9smhd\s]+?)\s*·\s*(\d+)\s+updates?$/i;
    const RE_WORKED_FOR = /^Worked for\s+([<0-9smhd]+(?:\s+\d+[smhd])*)$/i;
    const RE_THOUGHT_FOR = /^Thought for\s+([<0-9smhd]+(?:\s+\d+[smhd])*)$/i;
    const RE_RUNNING_FOR = /^Running\s+for\s+([<0-9smhd]+(?:\s+\d+[smhd])*)$/i;
    const RE_EPHEMERAL_SUMMARY =
      /^(Explored(?:\s+(?:\d+\s+)?(?:files?|artifacts?)(?:\s+and\s+(?:\d+\s+)?(?:files?|artifacts?))?)?|Ran\s+(?:\d+\s+)?commands?|Edited(?:\s+(?:\d+\s+)?(?:files?|artifacts?)(?:\s+and\s+(?:\d+\s+)?(?:files?|artifacts?))?)?)(?:,\s*(explored(?:\s+(?:\d+\s+)?(?:files?|artifacts?)(?:\s+and\s+(?:\d+\s+)?(?:files?|artifacts?))?)?|ran\s+(?:\d+\s+)?commands?|edited(?:\s+(?:\d+\s+)?(?:files?|artifacts?)(?:\s+and\s+(?:\d+\s+)?(?:files?|artifacts?))?)?))*$/i;
    const EPHEMERAL_CLAUSE_MAP = {
      explored: '已探索',
      'explored file': '已探索文件',
      'explored files': '已探索文件',
      'explored artifact': '已探索交付工件',
      'explored artifacts': '已探索交付工件',
      'explored file and artifact': '已探索文件与交付工件',
      'explored files and artifact': '已探索文件与交付工件',
      'explored file and artifacts': '已探索文件与交付工件',
      'explored files and artifacts': '已探索文件与交付工件',
      'ran command': '已运行命令',
      'ran commands': '已运行命令',
      edited: '已编辑',
      'edited file': '已编辑文件',
      'edited files': '已编辑文件',
      'edited artifact': '已编辑交付工件',
      'edited artifacts': '已编辑交付工件',
      'edited file and artifact': '已编辑文件与交付工件',
      'edited files and artifact': '已编辑文件与交付工件',
      'edited file and artifacts': '已编辑文件与交付工件',
      'edited files and artifacts': '已编辑文件与交付工件'
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
          artifact: '个交付工件',
          artifacts: '个交付工件',
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
      artifact: '交付工件',
      artifacts: '交付工件',
      'file and artifact': '文件与交付工件',
      'files and artifact': '文件与交付工件',
      'file and artifacts': '文件与交付工件',
      'files and artifacts': '文件与交付工件'
    };
    const RE_RUNNING_CMD = /^Running\s+(?!commands?\b|processes\b|for\b|\(Dev\b)(.+)$/;
    const RE_DELETED_RECORDINGS = /^Deleted\s+(\d+)\s+recordings?\s*\(([\d.]+\s*MB)\)$/i;
    const RE_DELETE_RECORDINGS_CONFIRM =
      /^This deletes\s+(\d+)\s+call recordings?\s*\(([\d.]+\s*MB)\)\s+from your machine\.\s*You can't undo this\.$/i;
    const RE_USED_LIMIT = /^You have used (some|all|most) of your (weekly|5-hour|five-hour|daily) limit,?\s*it will fully refresh in (.*)\.?$/i;
    const RE_NOT_USED_LIMIT = /^You have not used any of your (weekly|5-hour|five-hour|daily) limit\.?$/i;
    const RE_ARIA_BRANCH = /^Branch, current:\s*(.*)$/i;
    const RE_ARIA_PROJECT = /^Select project(?:, current)?:\s*(.*)$/i;
    const RE_ARIA_LOCATION = /^(?:Where the agent runs, current|Select location(?:, current)?):\s*(.*)$/i;
    const RE_ARIA_VERSION = /^Version\s+([\d.]+(?:\s*·\s*\S+)?)$/i;

    function isExcludedElement(el) {
      if (!el || el.nodeType !== 1) return true;
      return !!el.closest(EXCLUDE_SELECTOR);
    }

    function computeTextTranslation(raw) {
      if (!raw) return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;

      // 1. 无原型静态词典 O(1) 精确匹配（附句尾句号自动回退）
      let replacement = DICT[trimmed];
      if (typeof replacement !== 'string' && trimmed.endsWith('.')) {
        const withoutDot = DICT[trimmed.slice(0, -1)];
        if (typeof withoutDot === 'string') {
          replacement = withoutDot.endsWith('。') ? withoutDot : withoutDot + '。';
        }
      }
      if (typeof replacement === 'string') {
        if (RE_HAS_CJK.test(replacement) && RE_PURE_ALPHA.test(raw)) {
          return replacement;
        }
        return raw.replace(trimmed, replacement);
      }

      // 2. 快速短路：不含任何英文字母直接跳过动态正则
      if (!RE_HAS_ALPHA.test(trimmed)) return null;

      // 3. 首字符 O(1) 分流动态正则匹配
      const c0 = trimmed.charCodeAt(0);
      if (c0 >= 48 && c0 <= 57) {
        // 以数字 '0'-'9' 开头
        if (RE_UPDATES_COUNT.test(trimmed)) return raw.replace(RE_UPDATES_COUNT, '$1 条进展');
        if (RE_FILES_CHANGED.test(trimmed)) return raw.replace(RE_FILES_CHANGED, '$1 个文件变更');
        if (RE_TOOLS.test(trimmed)) return raw.replace(RE_TOOLS, '$1 个工具');
        if (RE_DEMOTED.test(trimmed)) return raw.replace(RE_DEMOTED, '$1 项已降级');
        if (RE_EXCLUDED.test(trimmed)) return raw.replace(RE_EXCLUDED, '$1 项已排除');
        if (RE_TOOLS_EXCLUDED.test(trimmed)) return raw.replace(RE_TOOLS_EXCLUDED, '$1 个工具已排除');
        if (RE_ACTIVE_CONVS.test(trimmed)) return raw.replace(RE_ACTIVE_CONVS, '$1 个进行中的会话');
        if (RE_PROJECTS_COUNT.test(trimmed)) return raw.replace(RE_PROJECTS_COUNT, '$1 个项目');
        if (RE_CALLS_MB.test(trimmed)) return raw.replace(RE_CALLS_MB, '$1 次通话 · $2');
        return null;
      }

      const firstUpper = trimmed[0].toUpperCase();
      if (firstUpper === 'S') {
        if (RE_SEE_ALL.test(trimmed)) return raw.replace(RE_SEE_ALL, '查看全部 ($1)');
        if (RE_SHOW_BREAKDOWNS.test(trimmed)) return raw.replace(RE_SHOW_BREAKDOWNS, '展开明细 ($1 项)');
        if (RE_SHOW_MORE_SUBAGENTS.test(trimmed)) return raw.replace(RE_SHOW_MORE_SUBAGENTS, '显示另外 $1 个子代理');
        const mSearch = trimmed.match(RE_EPHEMERAL_ACTIVE);
        if (mSearch) {
          const noun = EPHEMERAL_NOUN_MAP[mSearch[2].toLowerCase()];
          return raw.replace(trimmed, noun ? EPHEMERAL_VERB_MAP[mSearch[1]] + noun : EPHEMERAL_VERB_MAP[mSearch[1]] + ' ' + mSearch[2]);
        }
      } else if (firstUpper === 'P') {
        if (RE_PERM_DELETE.test(trimmed)) {
          return raw.replace(RE_PERM_DELETE, '永久删除 $1 及 $2 个进行中的会话。');
        }
      } else if (firstUpper === 'W') {
        if (RE_WORKED_FOR_UPDATES.test(trimmed)) {
          return raw.replace(RE_WORKED_FOR_UPDATES, (_, dur, cnt) => '已工作 ' + dur.trim() + ' · ' + cnt + ' 条进展');
        }
        if (RE_WORKED_FOR.test(trimmed)) return raw.replace(RE_WORKED_FOR, '已工作 $1');
      } else if (firstUpper === 'T') {
        if (RE_THOUGHT_FOR.test(trimmed)) return raw.replace(RE_THOUGHT_FOR, '已思考 $1');
        if (RE_DELETE_RECORDINGS_CONFIRM.test(trimmed)) {
          return raw.replace(
            RE_DELETE_RECORDINGS_CONFIRM,
            '这将从您的设备中删除 $1 条通话录音（$2），此操作无法撤销。'
          );
        }
      } else if (firstUpper === 'E' || firstUpper === 'R' || firstUpper === 'L') {
        if (RE_EPHEMERAL_SUMMARY.test(trimmed)) {
          const translatedSummary = trimmed
            .split(/,\s*/)
            .map((part) => translateEphemeralClause(part))
            .join('、');
          return raw.replace(trimmed, translatedSummary);
        }
        const mActive = trimmed.match(RE_EPHEMERAL_ACTIVE);
        if (mActive) {
          const noun = EPHEMERAL_NOUN_MAP[mActive[2].toLowerCase()];
          return raw.replace(trimmed, noun ? EPHEMERAL_VERB_MAP[mActive[1]] + noun : EPHEMERAL_VERB_MAP[mActive[1]] + ' ' + mActive[2]);
        }
        if (firstUpper === 'R') {
          if (RE_RUNNING_FOR.test(trimmed)) {
            return raw.replace(RE_RUNNING_FOR, '已运行 $1');
          }
          if (RE_RUNNING_CMD.test(trimmed)) {
            return raw.replace(RE_RUNNING_CMD, '正在运行 $1');
          }
        }
      } else if (firstUpper === 'D') {
        if (RE_DELETED_RECORDINGS.test(trimmed)) {
          return raw.replace(RE_DELETED_RECORDINGS, '已删除 $1 条录音 ($2)');
        }
      } else if (firstUpper === 'Z') {
        if (RE_ZIPPING_FOLDER.test(trimmed)) {
          return raw.replace(RE_ZIPPING_FOLDER, '正在打包 $1…');
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

      const nextVal = computeTextTranslation(origRaw);
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
      const cur = el.getAttribute(attrName);
      if (!cur) return;
      const savedOrig = el.getAttribute(origDataAttr);
      const savedLast = el.getAttribute(origDataAttr + '-last');
      if (savedOrig && savedLast === cur && el.__ag_attr_ver === PATCH_VERSION) {
        return;
      }
      const origVal = savedOrig && savedLast === cur ? savedOrig : cur;
      const trimmed = origVal.trim();
      const nextVal = customResolver ? customResolver(trimmed) : typeof DICT[trimmed] === 'string' ? DICT[trimmed] : null;
      if (typeof nextVal === 'string') {
        if (savedOrig !== origVal) el.setAttribute(origDataAttr, origVal);
        if (savedLast !== nextVal) el.setAttribute(origDataAttr + '-last', nextVal);
        el.__ag_attr_ver = PATCH_VERSION;
        if (cur !== nextVal) {
          el.setAttribute(attrName, nextVal);
        }
      } else if (savedOrig && savedLast === cur) {
        el.setAttribute(attrName, savedOrig);
        el.removeAttribute(origDataAttr);
        el.removeAttribute(origDataAttr + '-last');
        el.__ag_attr_ver = PATCH_VERSION;
      }
    }

    function resolveAttrTranslation(atrim) {
      if (typeof DICT[atrim] === 'string') return DICT[atrim];
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
          locName === 'This Computer' ? '本机' : locName === 'Remote' ? '远程' : DICT[locName] || locName;
        return '智能体运行位置，当前：' + mappedLoc;
      }
      const mVer = atrim.match(RE_ARIA_VERSION);
      if (mVer) {
        return '版本 ' + mVer[1].trim();
      }
      return computeTextTranslation(atrim);
    }

    function translateElementAttrs(el) {
      if (!el || el.nodeType !== 1) return;
      translateSingleAttr(el, 'title', 'data-ag-orig-title', resolveAttrTranslation);
      translateSingleAttr(el, 'placeholder', 'data-ag-orig-placeholder', null);
      translateSingleAttr(el, 'aria-label', 'data-ag-orig-aria-label', resolveAttrTranslation);
    }

    const walkerFilter = {
      acceptNode(node) {
        if (node.nodeType === 1) {
          if (node.matches && node.matches(EXCLUDE_SELECTOR)) {
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
      if (root.nodeType !== 1 || isExcludedElement(root)) return;

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

    scanAndTranslate(document.body);

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
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'characterData') {
          const t = m.target;
          if (t && t.parentElement && !isExcludedElement(t.parentElement)) {
            dirtyRoots.add(t);
          }
        } else if (m.type === 'attributes') {
          const el = m.target;
          if (el && el.nodeType === 1 && !isExcludedElement(el)) {
            try {
              translateElementAttrs(el);
            } catch (e) {}
          }
        } else if (m.type === 'childList' && m.addedNodes.length > 0) {
          if (m.target && m.target.nodeType === 1 && isExcludedElement(m.target)) {
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

    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      window.__ag_i18n_observer.observe(targetNode, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['title', 'aria-label', 'placeholder']
      });
    }
  } else {
    // 若用户在配置中关闭了 i18n 模块，实时将已翻译的文本与属性还原为原始英文
    restoreAllTranslations(document.body);
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
    ensureMetricsPill
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
