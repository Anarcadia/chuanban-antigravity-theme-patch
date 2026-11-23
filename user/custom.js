/**
 * user/custom.js — 侧边栏中文+日期标题 & 胶囊/面板 5h/周额度扩展
 * 在 core/runtime.js 执行完毕后于独立 try/catch 沙箱中调用。
 * 可直接使用入参 `ctx`（或别名 `boot`）：
 *   ctx.version          - 当前补丁版本与哈希
 *   ctx.preset           - 当前激活的色彩预设 ('high-contrast' | 'claude-desktop-purewhite' | 'vintage-deep')
 *   ctx.config           - 当前合并后的 user/config.json 对象
 *   ctx.modules          - 模块启用状态 (含 i18n, metrics, composerWaxSeal, deadlockHealer, customCss, customJs, zhTitle)
 *   ctx.themeVars        - 当前注入的自定义 CSS 变量表
 *   ctx.dict             - 原型安全的当前汉化词典对象
 *   ctx.metrics          - 最近一次会话实时指标数据 (TPS / TTFT / Ctx / Out)
 *   ctx.syncPreset()     - 手动触发预设状态同步
 *   ctx.ensureMetricsPill(true) - 手动刷新实时指标胶囊布局
 *   ctx.onCleanup(fn)    - 注册热重载/卸载清理回调
 *
 * 若此脚本报错，可通过 `node install.mjs verify --safe-mode` 一键绕过排障。
 */
(function initZhSidebarTitles(ctx) {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof location !== 'undefined' && location.protocol === 'plugin:') return;
  if (window.top !== window) return;

  const THROTTLE_MS = 80;
  const origTextMap = new WeakMap();
  const origLinkTitleMap = new WeakMap();

  let disposed = false;
  let isApplyingDom = false;
  let observer = null;
  let dclHandler = null;
  let rafId = 0;
  let throttleTimer = 0;
  let clickFallbackTimer = 0;
  let lastRunAt = 0;
  let lastSentSig = '';
  let lastSentAt = 0;
  let lastSeenActiveId = null;

  function isModuleEnabled() {
    if (ctx && ctx.config && ctx.config.enabled === false) return false;
    if (ctx && ctx.modules && ctx.modules.zhTitle === false) return false;
    if (ctx && ctx.config && ctx.config.zhTitle && ctx.config.zhTitle.enabled === false) return false;
    return true;
  }

  function isPayloadEnabled(state) {
    if (!isModuleEnabled()) return false;
    if (state && state.enabled === false) return false;
    return true;
  }

  function getActiveCascadeId() {
    try {
      const m = String(window.location && window.location.pathname ? window.location.pathname : '').match(
        /\/c\/([0-9a-f-]{36})/i
      );
      return m ? m[1] : '';
    } catch {
      return '';
    }
  }

  function getPrimaryTextNode(el) {
    if (!el || !el.childNodes) return null;
    for (let i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) {
        return el.childNodes[i];
      }
    }
    return null;
  }

  function hasDirectProjectGlyphSibling(spanEl) {
    const parent = spanEl && spanEl.parentElement;
    if (!parent || !parent.children) return false;
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child !== spanEl && child.hasAttribute && child.hasAttribute('data-project-glyph')) {
        return true;
      }
    }
    return false;
  }

  function findSidebarTitleSpan(row) {
    if (!row || !row.querySelectorAll) return null;
    const preferred = row.querySelector('div.flex-col > span.truncate');
    if (
      preferred &&
      !hasDirectProjectGlyphSibling(preferred) &&
      (!preferred.closest || !preferred.closest('.text-muted-foreground'))
    ) {
      return preferred;
    }
    const spans = row.querySelectorAll('span.truncate');
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      const parent = s.parentElement;
      if (!parent) continue;
      if (hasDirectProjectGlyphSibling(s)) continue;
      if (s.closest && s.closest('.text-muted-foreground')) continue;
      if (parent.tagName === 'SPAN') continue;
      return s;
    }
    return null;
  }

  function restoreLinkTitle(link) {
    if (!link) return;
    const orig = origLinkTitleMap.has(link)
      ? origLinkTitleMap.get(link)
      : link.getAttribute('data-ag-zh-orig-title');
    if (orig !== undefined && orig !== null) {
      if (orig === '__NONE__') {
        if (link.hasAttribute('title')) link.removeAttribute('title');
      } else if (link.getAttribute('title') !== orig) {
        link.setAttribute('title', orig);
      }
    }
    origLinkTitleMap.delete(link);
    if (link.hasAttribute('data-ag-zh-orig-title')) {
      link.removeAttribute('data-ag-zh-orig-title');
    }
  }

  function restoreRowTitle(row, clearNativeAttr) {
    if (!row) return;
    const titleSpan = findSidebarTitleSpan(row) || row.querySelector('span[data-ag-applied-display]');
    if (titleSpan) {
      const textNode = getPrimaryTextNode(titleSpan);
      const applied = titleSpan.getAttribute('data-ag-applied-display');
      const native = (textNode && origTextMap.get(textNode)) || row.getAttribute('data-ag-native-title');
      if (textNode && applied !== null && textNode.nodeValue === applied && typeof native === 'string') {
        textNode.nodeValue = native;
      }
      if (textNode && clearNativeAttr) {
        origTextMap.delete(textNode);
      }
      if (titleSpan.hasAttribute('data-ag-applied-display')) {
        titleSpan.removeAttribute('data-ag-applied-display');
      }
      if (titleSpan.hasAttribute('data-ag-stale-display')) {
        titleSpan.removeAttribute('data-ag-stale-display');
      }
      if (clearNativeAttr && titleSpan.hasAttribute('data-ag-zh-cascade-id')) {
        titleSpan.removeAttribute('data-ag-zh-cascade-id');
      }
    }
    if (row.hasAttribute('data-ag-zh-applied')) {
      row.removeAttribute('data-ag-zh-applied');
    }
    if (clearNativeAttr && row.hasAttribute('data-ag-native-title')) {
      row.removeAttribute('data-ag-native-title');
    }
    if (clearNativeAttr && row.hasAttribute('data-ag-zh-cascade-id')) {
      row.removeAttribute('data-ag-zh-cascade-id');
    }
    const links = row.querySelectorAll('a[href^="/c/"], a[data-ag-zh-orig-title]');
    for (let i = 0; i < links.length; i++) {
      restoreLinkTitle(links[i]);
    }
  }

  function restoreBreadcrumbSpan(span) {
    if (!span) return;
    const textNode = getPrimaryTextNode(span);
    const applied = span.getAttribute('data-ag-applied-display');
    const native = (textNode && origTextMap.get(textNode)) || span.getAttribute('data-ag-native-title');
    if (textNode && applied !== null && textNode.nodeValue === applied && typeof native === 'string') {
      textNode.nodeValue = native;
    }
    if (textNode) {
      origTextMap.delete(textNode);
    }
    span.removeAttribute('data-ag-applied-display');
    span.removeAttribute('data-ag-native-title');
    span.removeAttribute('data-ag-zh-cascade-id');
  }

  function restoreAllZhTitles() {
    if (!document.body && !document.documentElement) return;
    const root = document.body || document.documentElement;
    const prevApplying = isApplyingDom;
    isApplyingDom = true;
    try {
      const rows = root.querySelectorAll('[data-testid^="conversation-row-"][data-cascade-id]');
      for (let i = 0; i < rows.length; i++) {
        restoreRowTitle(rows[i], true);
      }

      const strayLinks = root.querySelectorAll('a[data-ag-zh-orig-title]');
      for (let i = 0; i < strayLinks.length; i++) {
        restoreLinkTitle(strayLinks[i]);
      }

      const bcSpans = root.querySelectorAll(
        '[data-testid="breadcrumb-segment"] span.truncate[data-ag-applied-display], [data-testid="breadcrumb-segment"] span.truncate[data-ag-native-title]'
      );
      for (let i = 0; i < bcSpans.length; i++) {
        restoreBreadcrumbSpan(bcSpans[i]);
      }
    } finally {
      isApplyingDom = prevApplying;
    }
  }

  function applyBreadcrumbTitle(activeId, titles, enabled) {
    const bcSegs = document.querySelectorAll('[data-testid="breadcrumb-segment"]');
    const lastSeg = bcSegs.length > 0 ? bcSegs[bcSegs.length - 1] : null;
    const targetSpan = activeId && lastSeg ? lastSeg.querySelector('span.truncate') : null;

    const existingBcSpans = document.querySelectorAll(
      '[data-testid="breadcrumb-segment"] span.truncate[data-ag-applied-display], [data-testid="breadcrumb-segment"] span.truncate[data-ag-native-title]'
    );
    for (let i = 0; i < existingBcSpans.length; i++) {
      if (existingBcSpans[i] !== targetSpan) {
        restoreBreadcrumbSpan(existingBcSpans[i]);
      }
    }

    if (!targetSpan) return false;
    const textNode = getPrimaryTextNode(targetSpan);
    if (!textNode) return false;

    const entry = enabled && activeId ? titles[activeId] : null;
    const prevCid = targetSpan.getAttribute('data-ag-zh-cascade-id') || '';
    const hasApplied = targetSpan.hasAttribute('data-ag-applied-display');
    const appliedVal = hasApplied ? targetSpan.getAttribute('data-ag-applied-display') : null;
    let syncNeeded = false;

    if (hasApplied) {
      if (textNode.nodeValue !== appliedVal) {
        origTextMap.set(textNode, textNode.nodeValue);
        targetSpan.setAttribute('data-ag-native-title', textNode.nodeValue);
        targetSpan.removeAttribute('data-ag-applied-display');
        targetSpan.setAttribute('data-ag-zh-cascade-id', activeId);
        syncNeeded = true;
      } else if (prevCid && prevCid !== activeId) {
        if (entry && entry.displayTitle) {
          if (typeof entry.nativeTitle === 'string' && entry.nativeTitle) {
            origTextMap.set(textNode, entry.nativeTitle);
            targetSpan.setAttribute('data-ag-native-title', entry.nativeTitle);
          } else {
            origTextMap.delete(textNode);
            targetSpan.removeAttribute('data-ag-native-title');
          }
        } else {
          restoreBreadcrumbSpan(targetSpan);
          return false;
        }
      }
    } else {
      origTextMap.set(textNode, textNode.nodeValue);
      targetSpan.setAttribute('data-ag-native-title', textNode.nodeValue);
      targetSpan.setAttribute('data-ag-zh-cascade-id', activeId);
    }

    if (entry && entry.displayTitle) {
      if (textNode.nodeValue !== entry.displayTitle) {
        textNode.nodeValue = entry.displayTitle;
      }
      if (targetSpan.getAttribute('data-ag-applied-display') !== entry.displayTitle) {
        targetSpan.setAttribute('data-ag-applied-display', entry.displayTitle);
      }
      if (targetSpan.getAttribute('data-ag-zh-cascade-id') !== activeId) {
        targetSpan.setAttribute('data-ag-zh-cascade-id', activeId);
      }
    } else if (targetSpan.hasAttribute('data-ag-applied-display')) {
      restoreBreadcrumbSpan(targetSpan);
    }

    return syncNeeded;
  }

  function applyTitlesToDom() {
    if (disposed || !document.body) return false;
    const state = window.__ag_zh_titles_state;
    const enabled = isPayloadEnabled(state);
    if (!enabled) {
      restoreAllZhTitles();
      return false;
    }

    const titles = state && state.titles && typeof state.titles === 'object' ? state.titles : {};
    const activeId = getActiveCascadeId();
    let syncNeeded = false;

    const prevApplying = isApplyingDom;
    isApplyingDom = true;
    try {
      const rows = document.querySelectorAll('[data-testid^="conversation-row-"][data-cascade-id]');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.querySelector('input, textarea, [contenteditable="true"]')) {
          continue;
        }
        const id = row.getAttribute('data-cascade-id');
        if (!id) continue;

        const titleSpan = findSidebarTitleSpan(row);
        if (!titleSpan) continue;
        const textNode = getPrimaryTextNode(titleSpan);
        if (!textNode) continue;

        const prevRowCid =
          titleSpan.getAttribute('data-ag-zh-cascade-id') || row.getAttribute('data-ag-zh-cascade-id') || '';
        const recycledRow = Boolean(prevRowCid && prevRowCid !== id);
        if (recycledRow) {
          const prevApplied = titleSpan.getAttribute('data-ag-applied-display');
          origTextMap.delete(textNode);
          titleSpan.removeAttribute('data-ag-applied-display');
          row.removeAttribute('data-ag-zh-applied');
          row.removeAttribute('data-ag-native-title');
          if (prevApplied !== null && textNode.nodeValue === prevApplied) {
            titleSpan.setAttribute('data-ag-stale-display', prevApplied);
          } else {
            titleSpan.removeAttribute('data-ag-stale-display');
          }
          syncNeeded = true;
        }
        if (titleSpan.getAttribute('data-ag-zh-cascade-id') !== id) {
          titleSpan.setAttribute('data-ag-zh-cascade-id', id);
        }
        if (row.getAttribute('data-ag-zh-cascade-id') !== id) {
          row.setAttribute('data-ag-zh-cascade-id', id);
        }

        const staleDisplay = titleSpan.getAttribute('data-ag-stale-display');
        if (staleDisplay !== null && textNode.nodeValue !== staleDisplay) {
          titleSpan.removeAttribute('data-ag-stale-display');
        }

        let nativeTitle = '';
        if (!recycledRow && titleSpan.hasAttribute('data-ag-applied-display')) {
          const applied = titleSpan.getAttribute('data-ag-applied-display');
          if (textNode.nodeValue !== applied) {
            nativeTitle = textNode.nodeValue;
            origTextMap.set(textNode, nativeTitle);
            row.setAttribute('data-ag-native-title', nativeTitle);
            titleSpan.removeAttribute('data-ag-applied-display');
            syncNeeded = true;
          } else {
            nativeTitle =
              origTextMap.get(textNode) ?? row.getAttribute('data-ag-native-title') ?? '';
            if (typeof nativeTitle === 'string' && nativeTitle !== '') {
              origTextMap.set(textNode, nativeTitle);
            }
          }
        } else if (titleSpan.hasAttribute('data-ag-stale-display') && textNode.nodeValue === staleDisplay) {
          nativeTitle = '';
        } else {
          nativeTitle = textNode.nodeValue;
          origTextMap.set(textNode, nativeTitle);
          if (row.getAttribute('data-ag-native-title') !== nativeTitle) {
            row.setAttribute('data-ag-native-title', nativeTitle);
          }
        }

        const entry = titles[id];
        if (entry && entry.displayTitle) {
          if (textNode.nodeValue !== entry.displayTitle) {
            textNode.nodeValue = entry.displayTitle;
          }
          titleSpan.removeAttribute('data-ag-stale-display');
          if (titleSpan.getAttribute('data-ag-applied-display') !== entry.displayTitle) {
            titleSpan.setAttribute('data-ag-applied-display', entry.displayTitle);
          }
          if (row.getAttribute('data-ag-zh-applied') !== '1') {
            row.setAttribute('data-ag-zh-applied', '1');
          }

          const link = row.querySelector('a[href^="/c/"]');
          if (link) {
            if (!origLinkTitleMap.has(link) && !link.hasAttribute('data-ag-zh-orig-title')) {
              const origAttr = link.getAttribute('title');
              const marker = origAttr === null ? '__NONE__' : origAttr;
              origLinkTitleMap.set(link, marker);
              link.setAttribute('data-ag-zh-orig-title', marker);
            }
            const rawOrig =
              entry.originalNativeTitle ||
              (entry.nativeTitle && entry.nativeTitle !== entry.displayTitle ? entry.nativeTitle : '') ||
              (nativeTitle && nativeTitle !== entry.displayTitle ? nativeTitle : '');
            const nextTooltip =
              entry.displayTitle +
              '\n创建时间: ' +
              (entry.createdAtLocal || entry.date || '') +
              (rawOrig && rawOrig !== entry.displayTitle ? '\n原生标题: ' + rawOrig : '');
            if (link.getAttribute('title') !== nextTooltip) {
              link.setAttribute('title', nextTooltip);
            }
          }
        } else if (titleSpan.hasAttribute('data-ag-applied-display') || row.hasAttribute('data-ag-zh-applied')) {
          restoreRowTitle(row, false);
        }
      }

      if (applyBreadcrumbTitle(activeId, titles, enabled)) {
        syncNeeded = true;
      }
    } finally {
      isApplyingDom = prevApplying;
    }

    return syncNeeded;
  }

  function scanAndSyncSidebar() {
    if (disposed || !document.body) return;
    if (!isPayloadEnabled(window.__ag_zh_titles_state)) return;

    const state = window.__ag_zh_titles_state;
    const titles = state && state.titles && typeof state.titles === 'object' ? state.titles : {};
    const activeId = getActiveCascadeId();
    const rowEls = document.querySelectorAll('[data-testid^="conversation-row-"][data-cascade-id]');
    const rows = [];
    const sigParts = [activeId];
    let anyRowNeedsSync = false;

    for (let i = 0; i < rowEls.length; i++) {
      const row = rowEls[i];
      const id = row.getAttribute('data-cascade-id') || '';
      if (!id) continue;

      const projectHint = row.getAttribute('data-subtext') || '';
      const isEditing = !!row.querySelector('input, textarea, [contenteditable="true"]');
      let nativeTitle = '';

      if (isEditing) {
        nativeTitle = row.getAttribute('data-ag-native-title') || '';
        if (!nativeTitle) continue;
      } else {
        const titleSpan = findSidebarTitleSpan(row);
        const textNode = titleSpan ? getPrimaryTextNode(titleSpan) : null;
        if (titleSpan && textNode) {
          const prevRowCid =
            titleSpan.getAttribute('data-ag-zh-cascade-id') || row.getAttribute('data-ag-zh-cascade-id') || '';
          if (prevRowCid && prevRowCid !== id) {
            const prevApplied = titleSpan.getAttribute('data-ag-applied-display');
            if (prevApplied !== null && textNode.nodeValue === prevApplied) {
              nativeTitle = '';
            } else {
              nativeTitle = textNode.nodeValue;
            }
          } else if (
            titleSpan.hasAttribute('data-ag-stale-display') &&
            textNode.nodeValue === titleSpan.getAttribute('data-ag-stale-display')
          ) {
            nativeTitle = '';
          } else if (
            titleSpan.hasAttribute('data-ag-applied-display') &&
            textNode.nodeValue === titleSpan.getAttribute('data-ag-applied-display')
          ) {
            nativeTitle =
              origTextMap.get(textNode) ?? row.getAttribute('data-ag-native-title') ?? textNode.nodeValue;
          } else {
            nativeTitle = textNode.nodeValue;
          }
        } else {
          nativeTitle = row.getAttribute('data-ag-native-title') || '';
        }
      }

      rows.push({ id, nativeTitle, projectHint });
      sigParts.push(id + ':' + nativeTitle);

      const entry = titles[id];
      if (!entry || !entry.displayTitle) {
        anyRowNeedsSync = true;
      } else if (
        nativeTitle &&
        nativeTitle !== entry.displayTitle &&
        entry.nativeTitle !== nativeTitle
      ) {
        anyRowNeedsSync = true;
      }
    }

    if (rows.length === 0 && !activeId) return;

    const activeIdChanged = activeId !== lastSeenActiveId;
    if (activeId && (!titles[activeId] || !titles[activeId].displayTitle)) {
      anyRowNeedsSync = true;
    }

    const sig = sigParts.join('\n');
    const now = Date.now();
    const retryDue = anyRowNeedsSync && now - lastSentAt > 8000;
    if ((activeIdChanged || anyRowNeedsSync) && (sig !== lastSentSig || retryDue)) {
      if (typeof window.__agTitleSync === 'function') {
        try {
          window.__agTitleSync(JSON.stringify({ type: 'sync', activeId, rows }));
          lastSeenActiveId = activeId;
          lastSentSig = sig;
          lastSentAt = now;
        } catch {
          setTimeout(() => {
            if (!disposed) scheduleDomSync();
          }, 300);
        }
      } else {
        setTimeout(() => {
          if (!disposed) scheduleDomSync();
        }, 300);
      }
    } else if (activeIdChanged) {
      lastSeenActiveId = activeId;
    }
  }

  const persistedSessionMap = new Map();
  const persistInFlight = new Set();
  let persistTimer = 0;
  let persistRunning = false;

  function findUpdateAnnotationsFn() {
    try {
      const rows = document.querySelectorAll('[data-testid^="conversation-row-"][data-cascade-id]');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const keys = Object.keys(row);
        let fiberKey = '';
        for (let k = 0; k < keys.length; k++) {
          if (keys[k].startsWith('__reactFiber$') || keys[k].startsWith('__reactInternalInstance$')) {
            fiberKey = keys[k];
            break;
          }
        }
        if (!fiberKey) continue;
        let cur = row[fiberKey];
        for (let depth = 0; cur && depth < 20; depth++, cur = cur.return) {
          const props = cur.memoizedProps;
          if (!props || !props.cascadeId || typeof cur.type !== 'function') continue;
          let st = cur.memoizedState;
          for (let hi = 0; st && hi < 350; hi++, st = st.next) {
            const ms = st.memoizedState;
            if (Array.isArray(ms) && typeof ms[0] === 'function') {
              let fnSrc = '';
              try {
                fnSrc = Function.prototype.toString.call(ms[0]);
              } catch {}
              if (
                fnSrc.indexOf('updateConversationAnnotations') !== -1 &&
                fnSrc.indexOf('No agent service to write to') !== -1
              ) {
                return ms[0];
              }
            }
          }
        }
      }
    } catch {}
    return null;
  }

  function scheduleNativePersist() {
    if (disposed || !document.body || persistRunning) return;
    if (!isPayloadEnabled(window.__ag_zh_titles_state)) return;

    const state = window.__ag_zh_titles_state;
    const titles = state && state.titles && typeof state.titles === 'object' ? state.titles : {};

    const editingIds = new Set();
    const visibleOrderIds = [];
    const domRows = document.querySelectorAll('[data-testid^="conversation-row-"][data-cascade-id]');
    for (let i = 0; i < domRows.length; i++) {
      const r = domRows[i];
      const cid = r.getAttribute('data-cascade-id');
      if (!cid) continue;
      if (r.querySelector('input, textarea, [contenteditable="true"]')) {
        editingIds.add(cid);
      } else {
        visibleOrderIds.push(cid);
      }
    }

    const visibleSet = new Set(visibleOrderIds);
    const queue = [];
    for (let i = 0; i < visibleOrderIds.length; i++) {
      const cid = visibleOrderIds[i];
      const entry = titles[cid];
      if (
        entry &&
        entry.displayTitle &&
        entry.needsNativePersist === true &&
        persistedSessionMap.get(cid) !== entry.displayTitle &&
        !persistInFlight.has(cid)
      ) {
        queue.push({ id: cid, displayTitle: entry.displayTitle });
      }
    }
    const entries = Object.entries(titles);
    for (let i = 0; i < entries.length; i++) {
      const cid = entries[i][0];
      const entry = entries[i][1];
      if (visibleSet.has(cid) || editingIds.has(cid)) continue;
      if (
        entry &&
        entry.displayTitle &&
        entry.needsNativePersist === true &&
        persistedSessionMap.get(cid) !== entry.displayTitle &&
        !persistInFlight.has(cid)
      ) {
        queue.push({ id: cid, displayTitle: entry.displayTitle });
      }
    }

    if (queue.length === 0) return;

    const updateFn = findUpdateAnnotationsFn();
    if (!updateFn) {
      if (!persistTimer) {
        persistTimer = setTimeout(() => {
          persistTimer = 0;
          if (!disposed) scheduleNativePersist();
        }, 500);
      }
      return;
    }

    persistRunning = true;
    const batch = queue.slice(0, 2);
    const hasMore = queue.length > batch.length;
    for (let i = 0; i < batch.length; i++) {
      persistInFlight.add(batch[i].id);
    }

    Promise.allSettled(
      batch.map((item) =>
        Promise.resolve(
          updateFn({
            cascadeId: item.id,
            annotations: { title: item.displayTitle },
            onError: { reportedByCaller: true }
          })
        ).then(
          (res) => ({ item, ok: Boolean(res && res.ok) }),
          () => ({ item, ok: false })
        )
      )
    )
      .then((results) => {
        const ackItems = [];
        for (let i = 0; i < results.length; i++) {
          const item = batch[i];
          persistInFlight.delete(item.id);
          const outcome = results[i];
          if (outcome.status === 'fulfilled' && outcome.value && outcome.value.ok) {
            persistedSessionMap.set(item.id, item.displayTitle);
            const curState = window.__ag_zh_titles_state;
            const curEntry = curState && curState.titles ? curState.titles[item.id] : null;
            if (curEntry && curEntry.displayTitle === item.displayTitle) {
              curEntry.needsNativePersist = false;
            }
            ackItems.push({ id: item.id, title: item.displayTitle });
          }
        }
        if (ackItems.length > 0 && typeof window.__agTitleSync === 'function') {
          try {
            window.__agTitleSync(JSON.stringify({ type: 'persisted', items: ackItems }));
          } catch {}
        }
      })
      .finally(() => {
        persistRunning = false;
        if (!disposed && hasMore && !persistTimer) {
          persistTimer = setTimeout(() => {
            persistTimer = 0;
            if (!disposed) scheduleNativePersist();
          }, 80);
        }
      });
  }

  function runApplyAndSync() {
    if (disposed || !document.body) return;
    if (!isPayloadEnabled(window.__ag_zh_titles_state)) {
      restoreAllZhTitles();
      return;
    }
    applyTitlesToDom();
    scanAndSyncSidebar();
  }

  function scheduleDomSync() {
    if (disposed || !document.body) return;
    if (!isPayloadEnabled(window.__ag_zh_titles_state)) return;
    if (rafId || throttleTimer) return;

    const elapsed = Date.now() - lastRunAt;
    if (elapsed >= THROTTLE_MS) {
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        lastRunAt = Date.now();
        runApplyAndSync();
      });
    } else {
      throttleTimer = setTimeout(() => {
        throttleTimer = 0;
        if (disposed) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          lastRunAt = Date.now();
          runApplyAndSync();
        });
      }, THROTTLE_MS - elapsed);
    }
  }

  function isMutationRelevant(mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      const target = m.target;
      if (m.type === 'attributes') {
        if (
          target &&
          target.nodeType === 1 &&
          ((target.hasAttribute && target.hasAttribute('data-cascade-id')) ||
            (target.closest &&
              target.closest(
                '[data-testid^="conversation-row-"], [data-testid="conversation-list-sidebar"], .bg-sidebar'
              )))
        ) {
          return true;
        }
        continue;
      }
      if (target) {
        const el = target.nodeType === 1 ? target : target.parentElement;
        if (
          el &&
          el.closest &&
          el.closest(
            '[data-testid^="conversation-row-"], [data-testid="conversation-list-sidebar"], [data-testid="breadcrumb-segment"], .bg-sidebar, .agy-layout-vars'
          )
        ) {
          return true;
        }
      }
      if (m.type === 'childList') {
        for (let j = 0; j < m.addedNodes.length; j++) {
          const n = m.addedNodes[j];
          if (n && n.nodeType === 1) {
            if (
              (n.matches &&
                n.matches(
                  '[data-testid^="conversation-row-"], [data-testid="conversation-list-sidebar"], [data-testid="breadcrumb-segment"]'
                )) ||
              (n.querySelector &&
                n.querySelector(
                  '[data-testid^="conversation-row-"], [data-testid="breadcrumb-segment"]'
                ))
            ) {
              return true;
            }
          }
        }
        for (let j = 0; j < m.removedNodes.length; j++) {
          const n = m.removedNodes[j];
          if (
            n &&
            n.nodeType === 1 &&
            ((n.matches && n.matches('[data-testid="breadcrumb-segment"]')) ||
              (n.querySelector && n.querySelector('[data-testid="breadcrumb-segment"]')))
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function onPopState() {
    if (disposed) return;
    scheduleDomSync();
  }

  function onSidebarScroll(e) {
    if (disposed) return;
    const t = e && e.target;
    if (
      t &&
      t.nodeType === 1 &&
      t.closest &&
      t.closest('[data-testid="conversation-list-sidebar"], .bg-sidebar')
    ) {
      scheduleDomSync();
    }
  }

  function onDocumentClick(e) {
    if (disposed) return;
    const t = e && e.target;
    if (
      t &&
      t.closest &&
      t.closest('a[href^="/c/"], [data-testid^="conversation-row-"], [data-testid="breadcrumb-segment"], button')
    ) {
      scheduleDomSync();
      if (clickFallbackTimer) clearTimeout(clickFallbackTimer);
      clickFallbackTimer = setTimeout(() => {
        clickFallbackTimer = 0;
        if (!disposed) scheduleDomSync();
      }, 120);
    }
  }

  function ensureObserver() {
    if (disposed || !document.body || observer || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver((mutations) => {
      if (isApplyingDom || disposed) return;
      if (!isPayloadEnabled(window.__ag_zh_titles_state)) return;
      if (!isMutationRelevant(mutations)) return;
      scheduleDomSync();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-cascade-id', 'href']
    });
  }

  function applyZhTitlesHandler(payload) {
    if (disposed) return;
    window.__ag_zh_titles_state = payload;
    if (!payload || payload.enabled === false || !isModuleEnabled()) {
      lastSentSig = '';
      lastSentAt = 0;
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = 0;
      }
      restoreAllZhTitles();
      return;
    }
    ensureObserver();
    applyTitlesToDom();
    scanAndSyncSidebar();
    scheduleNativePersist();
  }

  window.__ag_apply_zh_titles = applyZhTitlesHandler;

  function startRuntimeHooks() {
    if (disposed || !document.body) return;

    if (!isModuleEnabled()) {
      restoreAllZhTitles();
      return;
    }

    ensureObserver();
    runApplyAndSync();
    scheduleNativePersist();
  }

  window.addEventListener('popstate', onPopState);
  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('scroll', onSidebarScroll, { capture: true, passive: true });

  if (document.body) {
    startRuntimeHooks();
  } else {
    dclHandler = () => {
      dclHandler = null;
      if (!disposed) startRuntimeHooks();
    };
    document.addEventListener('DOMContentLoaded', dclHandler, { once: true });
  }

  if (ctx && typeof ctx.onCleanup === 'function') {
    ctx.onCleanup(() => {
      disposed = true;
      if (observer) {
        try {
          observer.disconnect();
        } catch {}
        observer = null;
      }
      if (dclHandler) {
        try {
          document.removeEventListener('DOMContentLoaded', dclHandler);
        } catch {}
        dclHandler = null;
      }
      if (rafId) {
        try {
          cancelAnimationFrame(rafId);
        } catch {}
        rafId = 0;
      }
      if (throttleTimer) {
        clearTimeout(throttleTimer);
        throttleTimer = 0;
      }
      if (clickFallbackTimer) {
        clearTimeout(clickFallbackTimer);
        clickFallbackTimer = 0;
      }
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = 0;
      }
      try {
        window.removeEventListener('popstate', onPopState);
        document.removeEventListener('click', onDocumentClick, true);
        document.removeEventListener('scroll', onSidebarScroll, true);
      } catch {}
      if (window.__ag_apply_zh_titles === applyZhTitlesHandler) {
        try {
          delete window.__ag_apply_zh_titles;
        } catch {
          window.__ag_apply_zh_titles = undefined;
        }
      }
      restoreAllZhTitles();
    });
  }
})(typeof ctx !== 'undefined' ? ctx : undefined);

(function initCompactMetricsAndQuota(ctx) {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof location !== 'undefined' && location.protocol === 'plugin:') return;
  if (window.top !== window) return;

  const RING_RADIUS = 5.8;
  const RING_CIRC = +(2 * Math.PI * RING_RADIUS).toFixed(2);
  const rawByCid = (window.__ag_cm_raw_by_cid = window.__ag_cm_raw_by_cid || Object.create(null));
  const rawByPill = new WeakMap();

  let disposed = false;
  let quotaState = window.__ag_quota_snapshot || null;
  let lastQuotaReqAt = 0;
  let prevApplyQuota = null;
  let origRenderMetrics = null;

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseIntClean(str) {
    const n = Number(String(str || '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  function fmtCompactInt(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return '0';
    if (v >= 1000000) return (v / 1000000).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (v >= 1000) {
      return v >= 100000 ? Math.round(v / 1000) + 'k' : (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return String(Math.round(v));
  }

  function formatResetLong(resetAt) {
    const ts = Number(resetAt) || 0;
    if (ts <= 0) return '待同步';
    const diff = ts - Date.now();
    if (diff <= 0) return '即将重置';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return Math.max(1, mins) + 'm后重置';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h' + (mins % 60) + 'm后重置';
    const days = Math.floor(hrs / 24);
    return days + 'd' + (hrs % 24) + 'h后重置';
  }

  function formatResetShort(resetAt) {
    const ts = Number(resetAt) || 0;
    if (ts <= 0) return '-';
    const diff = ts - Date.now();
    if (diff <= 0) return '即将重置';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return Math.max(1, mins) + 'm';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h' + (mins % 60) + 'm';
    const days = Math.floor(hrs / 24);
    return days + 'd' + (hrs % 24) + 'h';
  }

  function formatObservedTime(ts) {
    const n = Number(ts) || 0;
    if (n <= 0) return '';
    try {
      const d = new Date(n);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    } catch {
      return '';
    }
  }

  function quotaLevelClass(pct) {
    if (pct <= 15) return 'ag-q-crit';
    if (pct <= 35) return 'ag-q-warn';
    return 'ag-q-ok';
  }

  function detectActivePool(box) {
    if (!box || !box.querySelector) return 'gemini';
    const trigger =
      box.querySelector('[data-testid="model-selector-trigger"]') ||
      box.querySelector('button[aria-haspopup]');
    const txt = String(trigger ? trigger.textContent : box.textContent || '');
    return /claude/i.test(txt) ? 'claude' : 'gemini';
  }

  function parseRawMetrics(inlineHtml, tooltipHtml) {
    const inDiv = document.createElement('div');
    inDiv.innerHTML = String(inlineHtml || '');
    const inText = inDiv.textContent || '';

    const mTps = inText.match(/([\d.]+)\s*tok\/s/i);
    const tpsRounded = mTps ? Math.round(Number(mTps[1])) : 0;
    const mTtft = inText.match(/\b(TTFT|Hold)\s+([\d.]+s)\b/i);
    const ttftLabel = mTtft ? mTtft[1] : 'TTFT';
    const ttftShort = mTtft ? mTtft[2] : '0.0s';

    const mCtx = inText.match(/Ctx\s+([^\s(]+)\s*\((\d+)%\)/i);
    const ctxRatioStr = mCtx ? mCtx[1] : '';
    const ctxPct = mCtx ? Math.max(0, Math.min(100, Number(mCtx[2]) || 0)) : 0;

    let ctxClass = 'ag-ctx-ok';
    if (inDiv.querySelector('.ag-ctx-crit')) ctxClass = 'ag-ctx-crit';
    else if (inDiv.querySelector('.ag-ctx-warn')) ctxClass = 'ag-ctx-warn';

    const subBadgeEl = inDiv.querySelector('.ag-sub-badge');
    const subBadge = subBadgeEl ? subBadgeEl.textContent.trim() : '';
    const zhWarnDotEl = inDiv.querySelector('.ag-zh-warn-dot');
    const zhWarnDotHtml = zhWarnDotEl ? `<span class="ag-sep">·</span>${zhWarnDotEl.outerHTML}` : '';

    const ttDiv = document.createElement('div');
    ttDiv.innerHTML = String(tooltipHtml || '');
    const rows = {};
    let subRow = null;
    let turnSteps = 1;
    let turnOut = 0;
    let turnThink = 0;
    let turnResp = 0;
    let turnDur = '';

    const rowEls = ttDiv.querySelectorAll('.ag-tt-row');
    for (let i = 0; i < rowEls.length; i++) {
      const lblEl = rowEls[i].querySelector('.ag-tt-lbl');
      const valEl = rowEls[i].querySelector('.ag-tt-val');
      if (!lblEl || !valEl) continue;
      const lbl = lblEl.textContent.trim();
      const val = valEl.textContent.trim();
      rows[lbl] = val;
      const mTurn = lbl.match(/^本轮合计\s*\((\d+)步\)$/);
      if (mTurn) {
        turnSteps = Number(mTurn[1]) || 1;
        const mTurnDet = val.match(/输出\s+([\d,]+)\s*\(思考\s+([\d,]+)\s*\+\s*响应\s+([\d,]+)\)\s*\|\s*耗时\s+([\d.]+s)/);
        if (mTurnDet) {
          turnOut = parseIntClean(mTurnDet[1]);
          turnThink = parseIntClean(mTurnDet[2]);
          turnResp = parseIntClean(mTurnDet[3]);
          turnDur = mTurnDet[4];
        }
      } else if (lbl.startsWith('子 Agent')) {
        subRow = { lbl, val };
      }
    }

    let userTurns = 0;
    let validCalls = 0;
    const secHdr = ttDiv.querySelector('.ag-tt-sec');
    if (secHdr) {
      const mSec = secHdr.textContent.match(/\((\d+)\s*轮提问\s*\/\s*(\d+)\s*次有效调用\)/);
      if (mSec) {
        userTurns = Number(mSec[1]) || 0;
        validCalls = Number(mSec[2]) || 0;
      }
    }

    const speedVal = rows['生成速度'] || '';
    const mStream = speedVal.match(/流式\s+([\d.]+)\s*tok\/s/);
    const mE2e = speedVal.match(/端到端[^0-9]*([\d.]+)\s*tok\/s/);

    const timeVal = rows['响应耗时'] || '';
    const isStreamTime = /TTFT/i.test(timeVal);
    const mTimeTtft = timeVal.match(/(?:TTFT|等待)\s+([\d.]+s)/);
    const mTimeStream = timeVal.match(/(?:流式|刷出)\s+([\d.]+s)/);
    const mTimeTotal = timeVal.match(/总计\s+([\d.]+s)/);

    const ctxVal = rows['当前上下文'] || '';
    const mCtxDetail = ctxVal.match(/([\d,]+)\s*\(新增\s+([\d,]+)\s*\+\s*缓存\s+([\d,]+),\s*([\d.]+%)\)/);
    const lastNewTok = mCtxDetail ? parseIntClean(mCtxDetail[2]) : 0;
    const lastCachePct = mCtxDetail ? mCtxDetail[4] : '0.0%';

    const stepVal = rows['本步输出量'] || '';
    const mStep = stepVal.match(/([\d,]+)\s*\(思考链\s+([\d,]+)\s*\+\s*正文\/工具\s+([\d,]+)\)/);
    const stepThink = mStep ? parseIntClean(mStep[2]) : 0;
    const stepResp = mStep ? parseIntClean(mStep[3]) : 0;

    const inTotalVal = rows['累计输入量'] || '';
    const mSessCache = inTotalVal.match(/命中率\s+([\d.]+%)/);
    const sessionCachePct = mSessCache ? mSessCache[1] : '0.0%';

    const zhWarnEl = ttDiv.querySelector('.ag-tt-warn');
    const zhWarnHtml = zhWarnEl ? zhWarnEl.outerHTML : '';

    return {
      tpsRounded,
      ttftLabel,
      ttftShort,
      ctxRatioStr,
      ctxPct,
      ctxClass,
      subBadge,
      zhWarnDotHtml,
      userTurns,
      validCalls,
      turnSteps,
      turnDur: turnDur || (mTimeTotal ? mTimeTotal[1] : ttftShort),
      streamTps: mStream ? mStream[1] : '',
      e2eTps: mE2e ? mE2e[1] : String(tpsRounded),
      isStreamTime,
      timeTtft: mTimeTtft ? mTimeTtft[1] : ttftShort,
      timeStream: mTimeStream ? mTimeStream[1] : '0.00s',
      timeTotal: mTimeTotal ? mTimeTotal[1] : ttftShort,
      lastNewTok,
      lastCachePct,
      thinkTokens: turnSteps > 1 && turnThink + turnResp > 0 ? turnThink : stepThink,
      respTokens: turnSteps > 1 && turnThink + turnResp > 0 ? turnResp : stepResp,
      sessionCachePct,
      subRow,
      zhWarnHtml
    };
  }

  function buildInlineQuotaFragment(activePool) {
    const q = quotaState;
    if (!q || !q.available) return '';
    const isClaude = activePool === 'claude';
    const poolData = (isClaude ? q.claude : q.gemini) || q.gemini || q.claude || null;
    if (!poolData || (!poolData.h5 && !poolData.weekly)) return '';
    const parts = [];
    const tipParts = [];
    if (poolData.h5) {
      const p5 = Math.max(0, Math.min(100, Number(poolData.h5.remaining) || 0));
      const c5 = p5 <= 15 ? 'ag-q-crit' : p5 <= 35 ? 'ag-q-warn' : '';
      parts.push(`<span class="${c5}">5h ${p5}%</span>`);
      tipParts.push(`5小时剩余 ${p5}% (${formatResetLong(poolData.h5.resetAt)})`);
    }
    if (poolData.weekly) {
      const pw = Math.max(0, Math.min(100, Number(poolData.weekly.remaining) || 0));
      const cw = pw <= 15 ? 'ag-q-crit' : pw <= 35 ? 'ag-q-warn' : '';
      parts.push(`<span class="${cw}">周 ${pw}%</span>`);
      tipParts.push(`每周剩余 ${pw}% (${formatResetLong(poolData.weekly.resetAt)})`);
    }
    if (parts.length === 0) return '';
    return (
      `<span class="ag-sep">·</span>` +
      `<span class="ag-cm-inline-quota" data-ag-cm-quota="1" title="${escHtml(tipParts.join(' · '))}">` +
      parts.join(`<span class="ag-sep">·</span>`) +
      `</span>`
    );
  }

  function transformPayloadForView(raw, activePool) {
    const rawInline = String(raw.inlineHtml || '');
    const rawTt = String(raw.tooltipHtml || '');
    const quotaInlineHtml = buildInlineQuotaFragment(activePool);
    const quotaTtHtml = buildQuotaSectionHtml(activePool);

    // v6.0.0 already ships native ag-ctx-ring compact pill & card: augment instead of replacing
    if (rawInline.includes('ag-ctx-ring')) {
      const warnDotRe = /(<span class="ag-sep">·<\/span><span class="ag-zh-warn-dot"[\s\S]*?<\/span>)$/;
      const nextInline = quotaInlineHtml
        ? warnDotRe.test(rawInline)
          ? rawInline.replace(warnDotRe, quotaInlineHtml + '$1')
          : rawInline + quotaInlineHtml
        : rawInline;
      const taggedInline = `<span class="ag-cm-native-wrap" data-ag-cm-inline="1">${nextInline}</span>`;
      const nextTt = rawTt.includes('ag-tt-warn')
        ? rawTt.replace(/(<div class="ag-tt-warn">)/, quotaTtHtml + '$1')
        : rawTt + quotaTtHtml;
      return {
        inlineHtml: taggedInline,
        tooltipHtml: `<div class="ag-cm-native-tt" data-ag-cm-tt="1">${nextTt}</div>`
      };
    }

    const parsed = parseRawMetrics(rawInline, rawTt);
    return {
      inlineHtml: buildCompactInlineHtml(parsed, activePool),
      tooltipHtml: buildCompactTooltipHtml(parsed, activePool)
    };
  }

  function buildCompactInlineHtml(m, activePool) {
    const pct = Math.max(0, Math.min(100, m.ctxPct || 0));
    const dashOffset = +(RING_CIRC * (1 - pct / 100)).toFixed(2);
    const tip = `上下文 ${m.ctxRatioStr || ''} (${pct}%)`;

    let quotaInlineHtml = '';
    const q = quotaState;
    if (q && q.available) {
      const isClaude = activePool === 'claude';
      const poolData = (isClaude ? q.claude : q.gemini) || q.gemini || q.claude || null;
      if (poolData && (poolData.h5 || poolData.weekly)) {
        const parts = [];
        const tipParts = [];
        if (poolData.h5) {
          const p5 = Math.max(0, Math.min(100, Number(poolData.h5.remaining) || 0));
          const c5 = p5 <= 15 ? 'ag-q-crit' : p5 <= 35 ? 'ag-q-warn' : '';
          parts.push(`<span class="${c5}">5h ${p5}%</span>`);
          tipParts.push(`5小时剩余 ${p5}% (${formatResetLong(poolData.h5.resetAt)})`);
        }
        if (poolData.weekly) {
          const pw = Math.max(0, Math.min(100, Number(poolData.weekly.remaining) || 0));
          const cw = pw <= 15 ? 'ag-q-crit' : pw <= 35 ? 'ag-q-warn' : '';
          parts.push(`<span class="${cw}">周 ${pw}%</span>`);
          tipParts.push(`每周剩余 ${pw}% (${formatResetLong(poolData.weekly.resetAt)})`);
        }
        if (parts.length > 0) {
          quotaInlineHtml =
            `<span class="ag-sep">·</span>` +
            `<span class="ag-cm-inline-quota" title="${escHtml(tipParts.join(' · '))}">` +
            parts.join(`<span class="ag-sep">·</span>`) +
            `</span>`;
        }
      }
    }

    return (
      `<span class="ag-cm-ring-wrap" data-ag-cm-inline="1" title="${escHtml(tip)}">` +
      `<svg class="ag-cm-ring" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">` +
      `<circle class="ag-cm-ring-bg" cx="8" cy="8" r="${RING_RADIUS}"></circle>` +
      `<circle class="ag-cm-ring-fg ${escHtml(m.ctxClass)}" cx="8" cy="8" r="${RING_RADIUS}" stroke-dasharray="${RING_CIRC}" stroke-dashoffset="${dashOffset}"></circle>` +
      `</svg></span>` +
      `<span class="ag-cm-inline-stat">${escHtml(m.tpsRounded)} tok/s</span>` +
      `<span class="ag-sep">·</span>` +
      `<span class="ag-cm-inline-stat">${escHtml(m.ttftLabel)} ${escHtml(m.ttftShort)}</span>` +
      quotaInlineHtml +
      m.zhWarnDotHtml
    );
  }

  function buildQuotaSectionHtml(activePool) {
    const q = quotaState;
    const emailShort = q && q.email ? String(q.email).split('@')[0] : '';
    const obsTime = q && q.observedAt ? formatObservedTime(q.observedAt) : '';
    const metaRight = [emailShort, obsTime].filter(Boolean).join(' · ');
    const isClaude = activePool === 'claude';
    const primaryName = isClaude ? 'Claude' : 'Gemini';
    const otherName = isClaude ? 'Gemini' : 'Claude';

    if (!q || !q.available) {
      return (
        `<div class="ag-tt-hdr ag-tt-sec"><span>账号额度</span><span class="ag-cm-hdr-meta">${escHtml(metaRight || '未连接')}</span></div>` +
        `<div class="ag-cm-quota-other"><span>5 小时 / 每周额度</span><span>打开 Cockpit Tools 后自动同步</span></div>`
      );
    }

    const primaryPool = (isClaude ? q.claude : q.gemini) || q.gemini || q.claude || {};
    const otherPool = isClaude ? q.gemini : q.claude;

    const renderQuotaRow = (label, item) => {
      if (!item) {
        return `<div class="ag-cm-quota-row"><span class="ag-tt-lbl">${label}</span><span class="ag-cm-quota-reset">暂无数据</span></div>`;
      }
      const pct = Math.max(0, Math.min(100, Number(item.remaining) || 0));
      const lvl = quotaLevelClass(pct);
      return (
        `<div class="ag-cm-quota-row">` +
        `<span class="ag-tt-lbl">${label}</span>` +
        `<span class="ag-cm-quota-bar-wrap">` +
        `<span class="ag-cm-quota-track"><span class="ag-cm-bar-fill ${lvl}" style="display:block;width:${pct}%"></span></span>` +
        `<span class="ag-cm-quota-meta">${pct}% <span class="ag-cm-quota-reset">· ${escHtml(formatResetLong(item.resetAt))}</span></span>` +
        `</span></div>`
      );
    };

    let otherHtml = '';
    if (otherPool && (otherPool.h5 || otherPool.weekly)) {
      const p5 = otherPool.h5 ? `5h ${otherPool.h5.remaining}% (${formatResetShort(otherPool.h5.resetAt)})` : '';
      const pw = otherPool.weekly ? `周 ${otherPool.weekly.remaining}% (${formatResetShort(otherPool.weekly.resetAt)})` : '';
      const otherText = [p5, pw].filter(Boolean).join(' · ');
      if (otherText) {
        otherHtml = `<div class="ag-cm-quota-other"><span>${otherName} 额度</span><span>${escHtml(otherText)}</span></div>`;
      }
    }

    return (
      `<div class="ag-tt-hdr ag-tt-sec"><span>账号额度 · ${primaryName}</span><span class="ag-cm-hdr-meta">${escHtml(metaRight)}</span></div>` +
      renderQuotaRow('5 小时额度', primaryPool.h5) +
      renderQuotaRow('每周额度', primaryPool.weekly) +
      otherHtml
    );
  }

  function buildCompactTooltipHtml(m, activePool) {
    const speedText = `${m.streamTps ? `流式 ${m.streamTps} tok/s | ` : ''}端到端 ${m.e2eTps} tok/s`;
    const timeText = `${m.isStreamTime ? `TTFT ${m.timeTtft} | 流式 ${m.timeStream}` : `等待 ${m.timeTtft} | 刷出 ${m.timeStream}`} | 总计 ${m.timeTotal}`;
    const incText = m.lastNewTok > 0 ? `+${fmtCompactInt(m.lastNewTok)}` : '0';

    const outTotal = m.thinkTokens + m.respTokens;
    const thinkPct = outTotal > 0 ? Math.round((m.thinkTokens / outTotal) * 100) : 0;
    const respPct = outTotal > 0 ? Math.max(0, 100 - thinkPct) : 0;

    const turnStepLabel = m.turnSteps > 1 ? `总${m.turnSteps}步` : '1步';
    const turnMeta = `第${m.userTurns || 1}轮 ${turnStepLabel} 共耗时${m.turnDur}`;
    const sessMeta = `${m.userTurns} 轮提问 / ${m.validCalls} 次调用${m.subBadge ? ` · ${m.subBadge}` : ''}`;

    const subDetailHtml = m.subRow
      ? `<div class="ag-tt-row"><span class="ag-tt-lbl">${escHtml(m.subRow.lbl)}</span><span class="ag-tt-val">${escHtml(m.subRow.val)}</span></div>`
      : '';

    return (
      `<div class="ag-cm-panel" data-ag-cm-tt="1">` +
      `<div class="ag-tt-hdr"><span>当前轮次</span><span class="ag-cm-hdr-meta">${escHtml(turnMeta)}</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">生成速度</span><span class="ag-tt-val">${escHtml(speedText)}</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">响应耗时</span><span class="ag-tt-val">${escHtml(timeText)}</span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">本步净增</span><span class="ag-tt-val">${escHtml(incText)}<span class="ag-cm-cache-badge">缓存率 ${escHtml(m.lastCachePct)}</span></span></div>` +
      `<div class="ag-tt-row"><span class="ag-tt-lbl">输出比例</span><span class="ag-cm-ratio-val">` +
      `<span class="ag-cm-ratio-lbl-warm">思维链 ${thinkPct}%</span>` +
      `<span class="ag-cm-ratio-track"><span class="ag-cm-ratio-think" style="width:${thinkPct}%"></span><span class="ag-cm-ratio-resp" style="width:${respPct}%"></span></span>` +
      `<span class="ag-cm-ratio-lbl-cool">正文/工具 ${respPct}%</span>` +
      `</span></div>` +
      `<div class="ag-tt-hdr ag-tt-sec"><span>会话总计</span><span class="ag-cm-hdr-meta">${escHtml(sessMeta)}</span></div>` +
      `<div class="ag-cm-bar-row">` +
      `<div class="ag-cm-bar-track"><div class="ag-cm-bar-fill ${escHtml(m.ctxClass)}" style="width:${Math.min(100, m.ctxPct)}%"></div></div>` +
      `<span class="ag-cm-bar-stat">${escHtml(m.ctxRatioStr)} (${m.ctxPct}%)</span>` +
      `<span class="ag-cm-bar-cache">全轮次平均缓存 ${escHtml(m.sessionCachePct)}</span>` +
      `</div>` +
      subDetailHtml +
      buildQuotaSectionHtml(activePool) +
      (m.zhWarnHtml || '') +
      `</div>`
    );
  }

  function resolveRawPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const cid = String(payload.cascadeId || '').trim().toLowerCase();
    const isTransformed =
      payload._agCmTransformed ||
      String(payload.inlineHtml || '').includes('data-ag-cm-inline="1"') ||
      String(payload.tooltipHtml || '').includes('data-ag-cm-tt="1"');
    if (isTransformed) {
      return (cid && rawByCid[cid]) || null;
    }
    if (cid && payload.hasData) {
      rawByCid[cid] = { ...payload };
    }
    return payload;
  }

  function findPrimaryOrMatchingBox(cid) {
    const pills = document.querySelectorAll('.ag-live-metrics-pill, #ag-live-metrics-pill, [data-ag-metrics-pill]');
    for (let i = 0; i < pills.length; i++) {
      const p = pills[i];
      const pCid = String(p.getAttribute('data-ag-cascade-id') || '').trim().toLowerCase();
      if (!cid || pCid === cid) {
        return p.closest('#antigravity\\.agentSidePanelInputBox, [id="antigravity.agentSidePanelInputBox"], .surface-composer');
      }
    }
    return null;
  }

  function refreshAllMountedPills() {
    if (disposed) return;
    const ttMap = window.__ag_pill_tooltip_map;
    const pills = document.querySelectorAll('.ag-live-metrics-pill, #ag-live-metrics-pill, [data-ag-metrics-pill]');
    for (let i = 0; i < pills.length; i++) {
      const pill = pills[i];
      const cid = String(pill.getAttribute('data-ag-cascade-id') || '').trim().toLowerCase();
      let raw = rawByPill.get(pill) || (cid && rawByCid[cid]) || null;
      if (!raw) {
        const textEl = pill.querySelector('.ag-live-metrics-text, #ag-live-metrics-text, [data-ag-metrics-text]');
        const curInline = textEl ? textEl.innerHTML : '';
        const curTt = ttMap && typeof ttMap.get === 'function' ? ttMap.get(pill) || '' : '';
        if (
          curInline &&
          !curInline.includes('data-ag-cm-inline="1"') &&
          curTt &&
          !curTt.includes('data-ag-cm-tt="1"')
        ) {
          raw = { cascadeId: cid, hasData: true, inlineHtml: curInline, tooltipHtml: curTt };
          if (cid) rawByCid[cid] = raw;
          rawByPill.set(pill, raw);
        }
      }
      if (!raw || !raw.hasData) continue;
      rawByPill.set(pill, raw);

      const box = pill.closest('#antigravity\\.agentSidePanelInputBox, [id="antigravity.agentSidePanelInputBox"], .surface-composer');
      const pool = detectActivePool(box);
      const { inlineHtml: nextInline, tooltipHtml: nextTt } = transformPayloadForView(raw, pool);

      const textEl = pill.querySelector('.ag-live-metrics-text, #ag-live-metrics-text, [data-ag-metrics-text]');
      if (textEl && textEl.innerHTML !== nextInline) {
        textEl.innerHTML = nextInline;
      }
      if (ttMap && typeof ttMap.set === 'function') {
        ttMap.set(pill, nextTt);
      }
      if (window.__ag_active_tooltip_pill === pill) {
        const tt = document.getElementById('ag-live-metrics-tooltip');
        if (tt && tt.getAttribute('data-visible') === '1' && tt.innerHTML !== nextTt) {
          tt.innerHTML = nextTt;
        }
      }
      if (typeof origRenderMetrics === 'function' && cid) {
        origRenderMetrics({
          ...raw,
          _agCmTransformed: true,
          inlineHtml: nextInline,
          tooltipHtml: nextTt
        });
      }
    }
  }

  function requestQuotaRefresh(force = false) {
    if (disposed || typeof window.__agTitleSync !== 'function') return;
    const now = Date.now();
    if (!force && now - lastQuotaReqAt < 5000) return;
    lastQuotaReqAt = now;
    try {
      window.__agTitleSync(JSON.stringify({ type: 'getQuota', force: Boolean(force) }));
    } catch {}
  }

  function onQuotaSnapshot(snap) {
    if (disposed || !snap || typeof snap !== 'object') return;
    quotaState = snap;
    window.__ag_quota_snapshot = snap;
    refreshAllMountedPills();
  }

  if (typeof window.__ag_apply_quota_snapshot === 'function' && !window.__ag_apply_quota_snapshot.__ag_cm) {
    prevApplyQuota = window.__ag_apply_quota_snapshot;
  }
  const quotaHandler = (snap) => {
    if (prevApplyQuota) {
      try {
        prevApplyQuota(snap);
      } catch {}
    }
    onQuotaSnapshot(snap);
  };
  quotaHandler.__ag_cm = true;
  window.__ag_apply_quota_snapshot = quotaHandler;

  if (typeof window.__ag_render_metrics === 'function') {
    const curFn = window.__ag_render_metrics;
    origRenderMetrics = curFn.__ag_cm_orig || curFn;
    const wrappedRender = function (payload) {
      try {
        if (!payload || typeof payload !== 'object' || !payload.hasData) {
          return origRenderMetrics.call(this, payload);
        }
        const raw = resolveRawPayload(payload);
        if (!raw) {
          return origRenderMetrics.call(this, payload);
        }
        const cid = String(raw.cascadeId || '').trim().toLowerCase();
        const box = findPrimaryOrMatchingBox(cid);
        const pool = detectActivePool(box);
          const { inlineHtml: nextInline, tooltipHtml: nextTt } = transformPayloadForView(raw, pool);
        const transformed = {
          ...raw,
          _agCmTransformed: true,
          inlineHtml: nextInline,
          tooltipHtml: nextTt
        };
        return origRenderMetrics.call(this, transformed);
      } catch {
        return origRenderMetrics.call(this, payload);
      }
    };
    wrappedRender.__ag_cm_orig = origRenderMetrics;
    wrappedRender.__ag_cm_wrapped = true;
    window.__ag_render_metrics = wrappedRender;
  }

  let modelClickTimer = 0;

  function onMouseEnterCapture(ev) {
    if (disposed) return;
    const t = ev && ev.target;
    const pill = t && t.closest ? t.closest('.ag-live-metrics-pill, #ag-live-metrics-pill, [data-ag-metrics-pill]') : null;
    if (!pill) return;
    const cid = String(pill.getAttribute('data-ag-cascade-id') || '').trim().toLowerCase();
    const raw = rawByPill.get(pill) || (cid && rawByCid[cid]) || null;
    if (raw && raw.hasData && window.__ag_pill_tooltip_map) {
      const box = pill.closest('#antigravity\\.agentSidePanelInputBox, [id="antigravity.agentSidePanelInputBox"], .surface-composer');
      const pool = detectActivePool(box);
      const { inlineHtml: nextInline, tooltipHtml: nextTt } = transformPayloadForView(raw, pool);
      const textEl = pill.querySelector('.ag-live-metrics-text, #ag-live-metrics-text, [data-ag-metrics-text]');
      if (textEl && textEl.innerHTML !== nextInline) textEl.innerHTML = nextInline;
      window.__ag_pill_tooltip_map.set(pill, nextTt);
    }
    requestQuotaRefresh(false);
  }

  function onDocumentClickRefresh(ev) {
    if (disposed) return;
    const t = ev && ev.target;
    if (!t || !t.closest) return;
    if (
      t.closest('[role="menuitem"], [role="option"], [data-testid="model-selector-trigger"], [data-testid^="conversation-row-"], a[href^="/c/"]')
    ) {
      if (modelClickTimer) clearTimeout(modelClickTimer);
      modelClickTimer = setTimeout(() => {
        modelClickTimer = 0;
        if (!disposed) refreshAllMountedPills();
      }, 180);
    }
  }

  document.addEventListener('mouseenter', onMouseEnterCapture, true);
  document.addEventListener('click', onDocumentClickRefresh, true);

  if (window.__ag_last_metrics && window.__ag_last_metrics.hasData && typeof window.__ag_render_metrics === 'function') {
    const lastRaw = resolveRawPayload(window.__ag_last_metrics);
    if (lastRaw) {
      window.__ag_render_metrics(lastRaw);
    }
  }
  refreshAllMountedPills();
  if (ctx && typeof ctx.ensureMetricsPill === 'function') {
    try {
      ctx.ensureMetricsPill(true);
    } catch {}
  }
  requestQuotaRefresh(true);

  if (ctx && typeof ctx.onCleanup === 'function') {
    ctx.onCleanup(() => {
      disposed = true;
      if (modelClickTimer) {
        clearTimeout(modelClickTimer);
        modelClickTimer = 0;
      }
      try {
        document.removeEventListener('mouseenter', onMouseEnterCapture, true);
        document.removeEventListener('click', onDocumentClickRefresh, true);
      } catch {}
      if (window.__ag_render_metrics && window.__ag_render_metrics.__ag_cm_wrapped && origRenderMetrics) {
        window.__ag_render_metrics = origRenderMetrics;
      }
      if (window.__ag_apply_quota_snapshot === quotaHandler) {
        window.__ag_apply_quota_snapshot = prevApplyQuota || undefined;
      }
    });
  }
})(typeof ctx !== 'undefined' ? ctx : undefined);
