/**
 * chuanban-antigravity-theme-patch · Browser Runtime Engine (core/runtime.js)
 * 纯正浏览器端注入脚本（零模板字符串双重转义）。
 * 由 core/daemon.mjs 读取并将文件末尾的启动载荷占位符替换为实时配置与资源对象。
 */
((boot) => {
  // 0. 顶层窗口隔离：绝不注入 Artifact / HTML 预览等子 iframe
  if (window.top !== window) return;
  if (!boot || typeof boot !== 'object') return;

  const PATCH_VERSION = boot.version || '20261104-v5.0.0';
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
  const SELECTORS = Object.assign(
    {
      inputBoxId: 'antigravity.agentSidePanelInputBox',
      branchPillInBox:
        '#antigravity\\.agentSidePanelInputBox [data-testid="branch-pill-trigger"], [id="antigravity.agentSidePanelInputBox"] [data-testid="branch-pill-trigger"], #antigravity\\.agentSidePanelInputBox [aria-label^="Select project"], [id="antigravity.agentSidePanelInputBox"] [aria-label^="Select project"], #antigravity\\.agentSidePanelInputBox [aria-label^="选择项目"], [id="antigravity.agentSidePanelInputBox"] [aria-label^="选择项目"]',
      homeGreeting: '[data-testid="home-greeting"]',
      excludeI18n:
        'code, pre, kbd, samp, textarea, input, style, script, noscript, [contenteditable="true"], .prose, .markdown, [class*="chat-message"], [class*="group/file-title"], [data-testid="conversation-row-sidebar"] a[href^="/c/"], [data-testid="conversation-row-sidebar"] span.truncate, #ag-live-metrics-pill, #ag-live-metrics-tooltip'
    },
    boot.selectors || {}
  );

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
      }
    }
    for (let i = 0; i < nextKeys.length; i++) {
      const k = nextKeys[i];
      const v = varsObj[k];
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        document.documentElement.style.setProperty(k, String(v).trim());
      } else {
        document.documentElement.style.removeProperty(k);
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
  // 2.1 缩放快捷键原生缺陷修复（恢复 Cmd + - / Cmd + = / Cmd + 0）
  // ============================================================================
  window.__ag_zoom_keydown_fn = (e) => {
    if (MODULES.deadlockHealer === false) return;
    if (e.metaKey && !e.ctrlKey && !e.altKey) {
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
    const rows = box.querySelectorAll('div.flex.w-full.items-center.justify-between');
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.querySelector('[data-testid="model-selector-trigger"], [data-testid="send-button"]')) {
        return r;
      }
    }
    return rows[rows.length - 1] || null;
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
    const rightGroup = bottomRow.children[1];

    let pill = document.getElementById('ag-live-metrics-pill');
    if (!pill) {
      pill = document.createElement('span');
      pill.id = 'ag-live-metrics-pill';
      pill.textContent = '…';
      pill.addEventListener('mouseenter', () => {
        const tt = ensureMetricsTooltip();
        if (!tt || !tt.innerHTML) return;
        const rect = pill.getBoundingClientRect();
        tt.classList.add('ag-tt-visible');
        const ttWidth = tt.offsetWidth || 270;
        const ttHeight = tt.offsetHeight || 200;
        let left = rect.left + rect.width / 2 - ttWidth / 2;
        left = Math.max(12, Math.min(window.innerWidth - ttWidth - 12, left));
        let top = rect.top - ttHeight - 10;
        if (top < 12) top = rect.bottom + 10;
        tt.style.left = Math.round(left) + 'px';
        tt.style.top = Math.round(top) + 'px';
      });
      pill.addEventListener('mouseleave', () => {
        const tt = document.getElementById('ag-live-metrics-tooltip');
        if (tt) tt.classList.remove('ag-tt-visible');
      });
    }

    const rowW = bottomRow.clientWidth || 0;
    const leftW = measureNaturalLeftWidth(leftGroup);
    const rightW = rightGroup ? rightGroup.offsetWidth || 0 : 0;
    const middleAvailW = rowW - leftW - rightW - 16;
    const layoutSig = `${Math.round(rowW / 4)}:${Math.round(leftW / 4)}:${Math.round(rightW / 4)}`;

    if (!forceLayout && pill.isConnected && pill.getAttribute('data-ag-layout-sig') === layoutSig) {
      return pill;
    }
    pill.setAttribute('data-ag-layout-sig', layoutSig);

    bottomRow.classList.add('ag-footer-row-wrap');
    leftGroup.style.flex = '0 0 auto';
    if (rightGroup) rightGroup.style.flex = '0 0 auto';

    if (rowW > 0 && middleAvailW < MIDDLE_MIN_WIDTH_PX) {
      pill.classList.remove('ag-pill-middle');
      pill.classList.add('ag-pill-wrapped');
      if (pill.parentElement !== bottomRow || bottomRow.lastElementChild !== pill) {
        bottomRow.appendChild(pill);
      }
    } else {
      pill.classList.remove('ag-pill-wrapped');
      pill.classList.add('ag-pill-middle');
      if (rightGroup && (pill.parentElement !== bottomRow || pill.nextElementSibling !== rightGroup)) {
        bottomRow.insertBefore(pill, rightGroup);
      } else if (!rightGroup && pill.parentElement !== bottomRow) {
        bottomRow.appendChild(pill);
      }
    }

    if (!window.__ag_pill_resize_observer && typeof ResizeObserver !== 'undefined') {
      window.__ag_pill_resize_observer = new ResizeObserver(() => {
        if (window.__ag_pill_ro_raf) return;
        window.__ag_pill_ro_raf = requestAnimationFrame(() => {
          window.__ag_pill_ro_raf = 0;
          ensureMetricsPill(true);
        });
      });
    }
    if (window.__ag_pill_resize_observer && window.__ag_observed_row !== bottomRow) {
      try {
        window.__ag_pill_resize_observer.disconnect();
        window.__ag_pill_resize_observer.observe(bottomRow);
        window.__ag_observed_row = bottomRow;
      } catch (e) {}
    }

    return pill;
  }

  window.__ag_update_live_metrics = function (data) {
    if (!data || !MODULES.metrics) return;
    window.__ag_last_metrics = data;
    const pill = ensureMetricsPill();
    if (!pill) return;

    if (!data.hasData) {
      pill.style.display = 'none';
      return;
    }
    pill.style.display = 'inline-flex';

    const tpsStr = data.tps > 0 ? data.tps + ' tok/s' : '-- tok/s';
    const ttftNum = Number(data.ttftSec);
    const ttftStr = ttftNum > 0 ? 'TTFT ' + ttftNum.toFixed(1) + 's' : 'TTFT --';
    const ctxK = (data.contextUsed / 1000).toFixed(data.contextUsed >= 10000 ? 0 : 1) + 'k';
    const limitK = Math.round((data.contextLimit || 256000) / 1000) + 'k';
    const pctNum = Number(data.contextPct) || 0;
    const ctxStr = 'Ctx ' + ctxK + '/' + limitK + ' (' + Math.round(pctNum) + '%)';
    const outStr =
      'Out ' + (data.lastOutput >= 1000 ? (data.lastOutput / 1000).toFixed(1) + 'k' : data.lastOutput || 0);

    pill.innerHTML =
      '<span class="ag-m-item">' +
      tpsStr +
      '</span>' +
      '<span class="ag-m-sep">·</span>' +
      '<span class="ag-m-item">' +
      ttftStr +
      '</span>' +
      '<span class="ag-m-sep">·</span>' +
      '<span class="ag-m-item ag-m-ctx">' +
      ctxStr +
      '</span>' +
      '<span class="ag-m-sep">·</span>' +
      '<span class="ag-m-item">' +
      outStr +
      '</span>';

    if (pctNum >= 80) {
      pill.setAttribute('data-ctx-warn', 'high');
    } else {
      pill.removeAttribute('data-ctx-warn');
    }

    const tt = ensureMetricsTooltip();
    if (tt) {
      const fmtNum = (n) => (Number(n) || 0).toLocaleString();
      const hitPct = (Number(data.cacheHitRate) || 0).toFixed(1) + '%';
      const thinkSec = (Number(data.thinkingSec) || 0).toFixed(1) + 's';
      const genSec = (Number(data.genSec) || 0).toFixed(1) + 's';
      tt.innerHTML =
        '<div class="ag-tt-title"><span>会话实时指标 (真实 trajectory.pb)</span><span>#' +
        (data.stepCount || 0) +
        ' 步</span></div>' +
        '<div class="ag-tt-row"><span class="ag-tt-label">当前步骤总输入 (Ctx)</span><span class="ag-tt-val">' +
        fmtNum(data.contextUsed) +
        ' / ' +
        fmtNum(data.contextLimit || 256000) +
        ' (' +
        pctNum.toFixed(1) +
        '%)</span></div>' +
        '<div class="ag-tt-row"><span class="ag-tt-label">├─ 缓存读取 (Cache Read)</span><span class="ag-tt-val ag-tt-accent">' +
        fmtNum(data.lastCacheRead) +
        ' (' +
        hitPct +
        ')</span></div>' +
        '<div class="ag-tt-row"><span class="ag-tt-label">└─ 增量输入 (Fresh Input)</span><span class="ag-tt-val">' +
        fmtNum(data.lastInput) +
        '</span></div>' +
        '<div class="ag-tt-div"></div>' +
        '<div class="ag-tt-row"><span class="ag-tt-label">本轮回复输出 (Turn Out)</span><span class="ag-tt-val">' +
        fmtNum(data.lastOutput) +
        ' tok (含思考 ' +
        fmtNum(data.lastThinking) +
        ')</span></div>' +
        '<div class="ag-tt-row"><span class="ag-tt-label">本轮生成耗时 (TTFT / Gen)</span><span class="ag-tt-val">' +
        thinkSec +
        ' / ' +
        genSec +
        ' (' +
        (data.turnSteps || 1) +
        ' 步)</span></div>' +
        '<div class="ag-tt-row"><span class="ag-tt-label">输出生成速度 (TPS)</span><span class="ag-tt-val ag-tt-accent">' +
        (data.tps || 0) +
        ' tokens / sec</span></div>' +
        '<div class="ag-tt-div"></div>' +
        '<div class="ag-tt-row"><span class="ag-tt-label">会话累计 Input / Cache</span><span class="ag-tt-val">' +
        fmtNum(data.totalInput) +
        ' / ' +
        fmtNum(data.totalCacheRead) +
        '</span></div>' +
        '<div class="ag-tt-row"><span class="ag-tt-label">会话累计 Output / Tools</span><span class="ag-tt-val">' +
        fmtNum(data.totalOutput) +
        ' / ' +
        (data.toolCalls || 0) +
        ' 次调用</span></div>' +
        '<div class="ag-tt-row"><span class="ag-tt-label">底层模型枚举</span><span class="ag-tt-val">' +
        (data.modelName || 'Default') +
        '</span></div>';
    }
  };

  function checkRouteAndMountMetrics() {
    try {
      const cid = extractCascadeId();
      const box = document.getElementById(SELECTORS.inputBoxId);
      const hasBranchPillInBox = !!(box && box.querySelector(SELECTORS.branchPillInBox));
      const hasHomeGreeting = !!document.querySelector(SELECTORS.homeGreeting);
      const pageType = hasBranchPillInBox || hasHomeGreeting ? 'home' : 'chat';
      if (document.documentElement.getAttribute('data-ag-page-type') !== pageType) {
        document.documentElement.setAttribute('data-ag-page-type', pageType);
      }

      if (!MODULES.metrics) {
        const existing = document.getElementById('ag-live-metrics-pill');
        if (existing) existing.style.display = 'none';
        return;
      }

      const pill = ensureMetricsPill();
      if (cid && cid !== window.__ag_active_cascade_id) {
        window.__ag_active_cascade_id = cid;
        if (typeof window.__ag_on_session_change === 'function') {
          try {
            window.__ag_on_session_change(cid);
          } catch (e) {}
        }
      } else if (pill && window.__ag_last_metrics && pill.textContent === '…') {
        window.__ag_update_live_metrics(window.__ag_last_metrics);
      }
    } catch (e) {}
  }

  window.__ag_check_route_fn = checkRouteAndMountMetrics;

  if (window.__ag_metrics_route_watcher) {
    try {
      clearInterval(window.__ag_metrics_route_watcher);
    } catch (e) {}
    window.__ag_metrics_route_watcher = null;
  }
  window.__ag_metrics_route_watcher = setInterval(checkRouteAndMountMetrics, 800);
  checkRouteAndMountMetrics();

  // ============================================================================
  // 4. 高性能界面汉化引擎（无原型词典 + WeakMap 热重载还原 + 双触发防后台堆积）
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

    function isExcludedElement(el) {
      if (!el || el.nodeType !== 1) return true;
      return !!el.closest(EXCLUDE_SELECTOR);
    }

    function computeTextTranslation(raw) {
      if (!raw) return null;
      const trimmed = raw.trim();
      if (!trimmed) return null;

      // 1. 无原型静态词典 O(1) 精确匹配
      const replacement = DICT[trimmed];
      if (typeof replacement === 'string') {
        if (/[\u4e00-\u9fa5]/.test(replacement) && /^\s*[a-zA-Z]+\s*$/.test(raw)) {
          return replacement;
        }
        return raw.replace(trimmed, replacement);
      }

      // 2. 快速短路：不含任何英文字母直接跳过后续 14 个正则
      if (!/[a-zA-Z]/.test(trimmed)) return null;

      // 3. 动态正则匹配
      if (/^(\d+)\s+files?\s+changed$/i.test(trimmed)) {
        return raw.replace(/^(\d+)\s+files?\s+changed$/i, '$1 个文件变更');
      }
      if (/^See all\s*\((\d+)\)$/i.test(trimmed)) {
        return raw.replace(/^See all\s*\((\d+)\)$/i, '查看全部 ($1)');
      }
      if (/^Show\s+(\d+)\s+breakdowns?$/i.test(trimmed)) {
        return raw.replace(/^Show\s+(\d+)\s+breakdowns?$/i, '展开明细 ($1 项)');
      }
      if (/^(\d+)\s+tools?$/i.test(trimmed)) {
        return raw.replace(/^(\d+)\s+tools?$/i, '$1 个工具');
      }
      if (/^(\d+)\s+demoted$/i.test(trimmed)) {
        return raw.replace(/^(\d+)\s+demoted$/i, '$1 项已降级');
      }
      if (/^(\d+)\s+excluded$/i.test(trimmed)) {
        return raw.replace(/^(\d+)\s+excluded$/i, '$1 项已排除');
      }
      if (/^(\d+)\s+tools?\s+excluded$/i.test(trimmed)) {
        return raw.replace(/^(\d+)\s+tools?\s+excluded$/i, '$1 个工具已排除');
      }
      if (/^(\d+)\s+active\s+conversations$/i.test(trimmed)) {
        return raw.replace(/^(\d+)\s+active\s+conversations$/i, '$1 个进行中的会话');
      }
      if (/^Permanently delete\s+(.*)\s+including\s+(\d+)\s+active\s+conversations\.?$/i.test(trimmed)) {
        return raw.replace(
          /^Permanently delete\s+(.*)\s+including\s+(\d+)\s+active\s+conversations\.?$/i,
          '永久删除 $1 及 $2 个进行中的会话。'
        );
      }
      if (/^Worked for\s+(\d+[smhd])$/i.test(trimmed)) {
        return raw.replace(/^Worked for\s+(\d+[smhd])$/i, '已工作 $1');
      }
      if (/^Thought for\s+(\d+[smhd])$/i.test(trimmed)) {
        return raw.replace(/^Thought for\s+(\d+[smhd])$/i, '已思考 $1');
      }

      if (
        /^You have used (some|all|most) of your (weekly|5-hour|five-hour|daily) limit,?\s*it will fully refresh in (.*)\.?$/i.test(
          trimmed
        )
      ) {
        const match = trimmed.match(
          /^You have used (some|all|most) of your (weekly|5-hour|five-hour|daily) limit,?\s*it will fully refresh in (.*)\.?$/i
        );
        const degreeMap = { some: '部分', all: '全部', most: '大部分' };
        const typeMap = { weekly: '每周', '5-hour': '5 小时', 'five-hour': '5 小时', daily: '每日' };
        const degree = degreeMap[match[1].toLowerCase()] || match[1];
        const type = typeMap[match[2].toLowerCase()] || match[2];
        const timeStr = match[3]
          .replace(/\.$/, '')
          .replace(/(\d+)\s*days?/gi, '$1 天')
          .replace(/(\d+)\s*hours?/gi, '$1 小时')
          .replace(/(\d+)\s*minutes?/gi, '$1 分钟')
          .replace(/(\d+)\s*seconds?/gi, '$1 秒')
          .replace(/,\s*/g, ' ')
          .trim();
        return '您已消耗' + degree + type + '额度，将在 ' + timeStr + ' 后完全重置。';
      }
      if (/^You have not used any of your (weekly|5-hour|five-hour|daily) limit\.?$/i.test(trimmed)) {
        const match = trimmed.match(/^You have not used any of your (weekly|5-hour|five-hour|daily) limit\.?$/i);
        const typeMap = { weekly: '每周', '5-hour': '5 小时', 'five-hour': '5 小时', daily: '每日' };
        const type = typeMap[match[1].toLowerCase()] || match[1];
        return '您尚未消耗任何' + type + '额度。';
      }

      return null;
    }

    function translateTextNode(node) {
      const currentVal = node.nodeValue;
      if (!currentVal) return;

      const rec = origTextMap.get(node);
      const origRaw = rec && rec.lastVal === currentVal ? rec.origRaw : currentVal;

      const nextVal = computeTextTranslation(origRaw);
      if (nextVal !== null) {
        origTextMap.set(node, { origRaw, lastVal: nextVal });
        if (node.nodeValue !== nextVal) {
          node.nodeValue = nextVal;
        }
      } else if (rec && rec.lastVal === currentVal) {
        // 词条覆盖被用户在 i18n.override.json 中移除，恢复原始英文
        node.nodeValue = origRaw;
        origTextMap.delete(node);
      }
    }

    function translateSingleAttr(el, attrName, origDataAttr, customResolver) {
      const cur = el.getAttribute(attrName);
      if (!cur) return;
      const savedOrig = el.getAttribute(origDataAttr);
      const savedLast = el.getAttribute(origDataAttr + '-last');
      const origVal = savedOrig && savedLast === cur ? savedOrig : cur;
      const trimmed = origVal.trim();
      const nextVal = customResolver ? customResolver(trimmed) : typeof DICT[trimmed] === 'string' ? DICT[trimmed] : null;
      if (typeof nextVal === 'string') {
        el.setAttribute(origDataAttr, origVal);
        el.setAttribute(origDataAttr + '-last', nextVal);
        if (cur !== nextVal) {
          el.setAttribute(attrName, nextVal);
        }
      } else if (savedOrig && savedLast === cur) {
        el.setAttribute(attrName, savedOrig);
        el.removeAttribute(origDataAttr);
        el.removeAttribute(origDataAttr + '-last');
      }
    }

    function translateElementAttrs(el) {
      if (!el || el.nodeType !== 1) return;
      translateSingleAttr(el, 'title', 'data-ag-orig-title', null);
      translateSingleAttr(el, 'placeholder', 'data-ag-orig-placeholder', null);
      translateSingleAttr(el, 'aria-label', 'data-ag-orig-aria-label', (atrim) => {
        if (typeof DICT[atrim] === 'string') return DICT[atrim];
        if (/^Branch, current:\s*(.*)$/i.test(atrim)) {
          const bName = atrim.match(/^Branch, current:\s*(.*)$/i)[1].trim();
          return '分支，当前：' + (bName === 'Select branch' ? '选择分支' : bName);
        }
        if (/^Select project, current:\s*(.*)$/i.test(atrim)) {
          const pName = atrim.match(/^Select project, current:\s*(.*)$/i)[1].trim();
          return '选择项目，当前：' + (pName === 'No project' ? '未关联项目' : pName);
        }
        return null;
      });
    }

    const walkerFilter = {
      acceptNode(node) {
        if (node.nodeType === 1) {
          if (node.matches && node.matches(EXCLUDE_SELECTOR)) {
            return NodeFilter.FILTER_REJECT;
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

      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        walkerFilter
      );
      while (walker.nextNode()) {
        translateTextNode(walker.currentNode);
      }

      try {
        if (
          root.hasAttribute &&
          (root.hasAttribute('title') || root.hasAttribute('aria-label') || root.hasAttribute('placeholder'))
        ) {
          translateElementAttrs(root);
        }
        const labeledEls = root.querySelectorAll ? root.querySelectorAll('[title], [aria-label], [placeholder]') : [];
        for (let i = 0; i < labeledEls.length; i++) {
          const el = labeledEls[i];
          if (!isExcludedElement(el)) {
            translateElementAttrs(el);
          }
        }
      } catch (e) {}
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
