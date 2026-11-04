/**
 * chuanban-antigravity-theme-patch · Browser Runtime Engine (core/runtime.js)
 * 纯正浏览器端注入脚本（零模板字符串双重转义）。
 * 由 core/daemon.mjs 读取并将文件末尾的启动载荷占位符替换为实时配置与资源对象。
 */
((boot) => {
  // 0. 顶层窗口隔离：绝不注入 Artifact / HTML 预览等子 iframe
  if (window.top !== window) return;
  if (!boot || typeof boot !== 'object') return;

  const PATCH_VERSION = boot.version || '20261104-stable-v22';
  const CSS_TEXT = boot.cssText || '';
  const MODULES = Object.assign(
    { i18n: true, metrics: true, customCss: true, customJs: true },
    boot.modules || {}
  );
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

  // ============================================================================
  // 1. 注入更纱黑体与主题样式（core/theme.css + user/custom.css 合并结果）
  // ============================================================================
  let style = document.getElementById('ag-custom-fonts');
  if (!style) {
    style = document.createElement('style');
    style.id = 'ag-custom-fonts';
    const target = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
    if (target) {
      target.appendChild(style);
    }
  }
  if (style && style.textContent !== CSS_TEXT) {
    style.textContent = CSS_TEXT;
  }

  // ============================================================================
  // 2. 防死锁守护：Antigravity 原生 TanStack Router 缺陷修复（支持热重载更新回调）
  // ============================================================================
  window.__ag_settings_click_fn = (e) => {
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
  // 3. 专属预设状态联动与防白屏崩溃保护
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

  function syncChuanbanPreset() {
    try {
      const stored = Storage.prototype.getItem.call(localStorage, 'theme-preset-light');
      if (ALL_CUSTOM_PRESET_NAMES.has(stored)) {
        try {
          Storage.prototype.setItem.call(localStorage, 'theme-preset-light', 'Default Light');
        } catch (e) {}
      }

      const flavor = Storage.prototype.getItem.call(localStorage, 'theme-color-flavor') || DEFAULT_PRESET || PRESETS.HIGH_CONTRAST;
      const currentBg = (window.getComputedStyle(document.documentElement).getPropertyValue('--background') || '')
        .trim()
        .toUpperCase();
      const isWarmBg = currentBg === '#FBF9F5' || currentBg === '#FCFCFB';

      let targetPreset = null;
      if (flavor === PRESETS.HIGH_CONTRAST || flavor === PRESETS.LEGACY_WARM_WHITE || flavor === '高对比版') {
        targetPreset = PRESETS.HIGH_CONTRAST;
      } else if (
        flavor === PRESETS.CLAUDE_PUREWHITE ||
        flavor === PRESETS.LEGACY_OFFICIAL ||
        flavor === 'ClaudeDesktop 净白'
      ) {
        targetPreset = PRESETS.CLAUDE_PUREWHITE;
      } else if (flavor === PRESETS.VINTAGE_DEEP || flavor === PRESETS.LEGACY_CHUANBAN || flavor === '复古深色' || isWarmBg) {
        targetPreset = PRESETS.VINTAGE_DEEP;
      }

      if (targetPreset) {
        if (document.documentElement.getAttribute('data-ag-preset') !== targetPreset) {
          document.documentElement.setAttribute('data-ag-preset', targetPreset);
        }
      } else {
        document.documentElement.removeAttribute('data-ag-preset');
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
    const rightGroup = bottomRow.children[1] || null;

    let pill = document.getElementById('ag-live-metrics-pill');
    if (pill && pill.getAttribute('data-v') !== '3') {
      pill.remove();
      pill = null;
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
        const w = bottomRow.clientWidth || 0;
        if (w > 0 && Math.abs(w - (window.__ag_last_row_width || 0)) >= 1) {
          window.__ag_last_row_width = w;
          if (typeof window.__ag_ensure_metrics_pill_fn === 'function') {
            window.__ag_ensure_metrics_pill_fn(true);
          }
        }
      });
      window.__ag_metrics_ro.observe(bottomRow);
    }

    const isMountedHere =
      pill.parentElement === leftGroup ||
      (bottomRow.parentElement && pill.parentElement === bottomRow.parentElement);
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

  function checkRouteAndMountMetrics() {
    try {
      const hasBranchPill = !!document.querySelector(SELECTORS.branchPillInBox);
      const isHome =
        hasBranchPill ||
        !!document.querySelector(SELECTORS.homeGreeting) ||
        window.location.pathname === '/' ||
        !window.location.pathname.startsWith('/c/');
      const pageType = isHome ? 'home' : 'chat';
      if (document.documentElement.getAttribute('data-ag-page-type') !== pageType) {
        document.documentElement.setAttribute('data-ag-page-type', pageType);
      }
      if (document.body && document.body.hasAttribute('data-ag-page-type')) {
        document.body.removeAttribute('data-ag-page-type');
      }

      if (!MODULES.metrics) {
        const pill = document.getElementById('ag-live-metrics-pill');
        if (pill && pill.style.display !== 'none') pill.style.display = 'none';
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
          window.__agRequestMetrics(cid);
        }
      } else if (window.__ag_last_metrics && window.__ag_last_metrics.cascadeId === cid) {
        ensureMetricsPill(false);
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
  // 4. 高性能界面汉化引擎（无原型词典 + TreeWalker 剪枝 + 双触发防后台堆积）
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

    function setNodeVal(node, nextVal) {
      if (node.nodeValue !== nextVal) {
        node.nodeValue = nextVal;
      }
    }

    function translateTextNode(node) {
      const raw = node.nodeValue;
      if (!raw) return;
      const trimmed = raw.trim();
      if (!trimmed) return;

      // 1. 无原型静态词典 O(1) 精确匹配
      const replacement = DICT[trimmed];
      if (typeof replacement === 'string') {
        if (/[\u4e00-\u9fa5]/.test(replacement) && /^\s*[a-zA-Z]+\s*$/.test(raw)) {
          setNodeVal(node, replacement);
        } else {
          setNodeVal(node, raw.replace(trimmed, replacement));
        }
        return;
      }

      // 2. 快速短路：不含任何英文字母直接跳过后续 14 个正则
      if (!/[a-zA-Z]/.test(trimmed)) return;

      // 3. 动态正则匹配
      if (/^(\d+)\s+files?\s+changed$/i.test(trimmed)) {
        setNodeVal(node, raw.replace(/^(\d+)\s+files?\s+changed$/i, '$1 个文件变更'));
        return;
      }
      if (/^See all\s*\((\d+)\)$/i.test(trimmed)) {
        setNodeVal(node, raw.replace(/^See all\s*\((\d+)\)$/i, '查看全部 ($1)'));
        return;
      }
      if (/^Show\s+(\d+)\s+breakdowns?$/i.test(trimmed)) {
        setNodeVal(node, raw.replace(/^Show\s+(\d+)\s+breakdowns?$/i, '展开明细 ($1 项)'));
        return;
      }
      if (/^(\d+)\s+tools?$/i.test(trimmed)) {
        setNodeVal(node, raw.replace(/^(\d+)\s+tools?$/i, '$1 个工具'));
        return;
      }
      if (/^(\d+)\s+demoted$/i.test(trimmed)) {
        setNodeVal(node, raw.replace(/^(\d+)\s+demoted$/i, '$1 项已降级'));
        return;
      }
      if (/^(\d+)\s+excluded$/i.test(trimmed)) {
        setNodeVal(node, raw.replace(/^(\d+)\s+excluded$/i, '$1 项已排除'));
        return;
      }
      if (/^(\d+)\s+tools?\s+excluded$/i.test(trimmed)) {
        setNodeVal(node, raw.replace(/^(\d+)\s+tools?\s+excluded$/i, '$1 个工具已排除'));
        return;
      }
      if (/^(\d+)\s+active\s+conversations$/i.test(trimmed)) {
        setNodeVal(node, raw.replace(/^(\d+)\s+active\s+conversations$/i, '$1 个进行中的会话'));
        return;
      }
      if (/^Permanently delete\s+(.*)\s+including\s+(\d+)\s+active\s+conversations\.?$/i.test(trimmed)) {
        setNodeVal(
          node,
          raw.replace(
            /^Permanently delete\s+(.*)\s+including\s+(\d+)\s+active\s+conversations\.?$/i,
            '永久删除 $1 及 $2 个进行中的会话。'
          )
        );
        return;
      }
      if (/^Worked for\s+(\d+[smhd])$/i.test(trimmed)) {
        setNodeVal(node, raw.replace(/^Worked for\s+(\d+[smhd])$/i, '已工作 $1'));
        return;
      }
      if (/^Thought for\s+(\d+[smhd])$/i.test(trimmed)) {
        setNodeVal(node, raw.replace(/^Thought for\s+(\d+[smhd])$/i, '已思考 $1'));
        return;
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
        setNodeVal(node, '您已消耗' + degree + type + '额度，将在 ' + timeStr + ' 后完全重置。');
        return;
      }
      if (/^You have not used any of your (weekly|5-hour|five-hour|daily) limit\.?$/i.test(trimmed)) {
        const match = trimmed.match(/^You have not used any of your (weekly|5-hour|five-hour|daily) limit\.?$/i);
        const typeMap = { weekly: '每周', '5-hour': '5 小时', 'five-hour': '5 小时', daily: '每日' };
        const type = typeMap[match[1].toLowerCase()] || match[1];
        setNodeVal(node, '您尚未消耗任何' + type + '额度。');
        return;
      }
    }

    function translateElementAttrs(el) {
      if (!el || el.nodeType !== 1) return;
      const t = el.getAttribute('title');
      if (t) {
        const ttrim = t.trim();
        const rep = DICT[ttrim];
        if (typeof rep === 'string' && t !== rep) el.setAttribute('title', rep);
      }
      const p = el.getAttribute('placeholder');
      if (p) {
        const ptrim = p.trim();
        const rep = DICT[ptrim];
        if (typeof rep === 'string' && p !== rep) el.setAttribute('placeholder', rep);
      }
      const a = el.getAttribute('aria-label');
      if (a) {
        const atrim = a.trim();
        let nextAria = null;
        if (typeof DICT[atrim] === 'string') {
          nextAria = DICT[atrim];
        } else if (/^Branch, current:\s*(.*)$/i.test(atrim)) {
          const bName = atrim.match(/^Branch, current:\s*(.*)$/i)[1].trim();
          nextAria = '分支，当前：' + (bName === 'Select branch' ? '选择分支' : bName);
        } else if (/^Select project, current:\s*(.*)$/i.test(atrim)) {
          const pName = atrim.match(/^Select project, current:\s*(.*)$/i)[1].trim();
          nextAria = '选择项目，当前：' + (pName === 'No project' ? '未关联项目' : pName);
        }
        if (nextAria && a !== nextAria) el.setAttribute('aria-label', nextAria);
      }
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
  }

  // ============================================================================
  // 5. 开放用户自定义前端脚本钩子 (user/custom.js，沙箱异常隔离)
  // ============================================================================
  window.__AG_PATCH_CTX__ = {
    version: PATCH_VERSION,
    preset: DEFAULT_PRESET,
    modules: MODULES,
    dict: DICT,
    syncPreset: syncChuanbanPreset,
    ensureMetricsPill
  };

  if (MODULES.customJs && boot.customJs && typeof boot.customJs === 'string' && boot.customJs.trim()) {
    try {
      const fn = new Function('ctx', boot.customJs);
      fn(window.__AG_PATCH_CTX__);
    } catch (err) {
      console.error('[Antigravity Patch] Error in user/custom.js:', err);
    }
  }
})(__AG_BOOT_PAYLOAD__);
