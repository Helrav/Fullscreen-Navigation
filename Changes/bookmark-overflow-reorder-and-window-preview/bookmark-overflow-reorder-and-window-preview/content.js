(() => {
  'use strict';
  if (window.top !== window) return;
  const api = globalThis.browser || globalThis.chrome;
  if (!api || !api.runtime || !api.storage) return;

  const DIRS = ['left', 'right', 'top', 'bottom'];
  const GROUP_COLORS = {
    grey: '#9aa0a6', blue: '#4f8cff', red: '#ea5b52', yellow: '#f2b631', green: '#34a853',
    pink: '#ee6fb0', purple: '#a66cf0', cyan: '#2cc1d6', orange: '#f28b3d'
  };
  const COMPACT_BELOW = 90;    // keep names until the panel is genuinely narrow

  let settings = fnNormalize();
  let pinned = false, fullscreen = false, peek = false, shown = false;
  let dockedPinned = false;
  let u = 1;                   // 1 / browser zoom: keeps the overlay the same real size on every page
  let data = { cur: -1, windows: [], groups: {} };
  let flat = [];
  let winPopFlat = [];
  let collapsed = {};
  let folderIcons = {};        // bookmark folder id -> { color, glyph, emoji }
  const selected = new Set();
  let filter = '', selId = null, anchorId = null, needCenter = false, scrollSel = false;
  let port = null, dead = false, hoverPanel = false, lastInZone = false, needRearm = false;
  let resizing = false;
  let openTimer = 0, closeTimer = 0, resizeTimer = 0, tipTimer = 0;
  let mods = { ctrl: false, alt: false, shift: false, meta: false };
  let hostEl = null, root = null, ui = null, els = {};
  let contextMenu = null, bookmarks = null, dragIds = null, dragTarget = null;
  let bookmarkDrag = null, bookmarkDropTarget = null;
  let suppressedBookmarkClickIds = new Set();
  let suppressBookmarkClickUntil = 0;
  let dockDrag = null, hotZoneEditMode = false, tipEl = null;
  let searchPopupOpen = false;
  let keepPeekOpenAfterEscape = false;
  let lastPointer = { x: -1, y: -1 };
  let windowNames = {};
  // Horizontal rails can show the current window or all windows. In current-only
  // mode, other windows live in a vertical popover anchored to either strip end.
  let winPopOpen = false, winDocDown = null, winPopIcons = false, winPopPinned = false, hoverWinPop = false;
  const DEFAULT_TOOLBAR_ORDER = ['bookmarks', 'pin', 'settings'];
  let toolbarOrder = [...DEFAULT_TOOLBAR_ORDER];
  // One toolbar icon occupies the overlay's edge slot (bottom for vertical,
  // right for horizontal). Settings is the default, but users can drag any
  // toolbar icon into that slot without an empty-slot placeholder.
  let edgeToolId = 'settings';
  let toolbarDragId = null;
  const GROUP_COLOR_NAMES = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

  // ---------- helpers ----------
  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  const svg = (d) => {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill-rule', 'evenodd');
    s.appendChild(p);
    return s;
  };

  const ICON_PIN = 'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z';
  const ICON_OVERLAY_COLLAPSE = 'M3 5h12v2H3zM3 10h9v2H3zM3 15h12v2H3zM18 7l-5 5 5 5v-3h3v-4h-3z';
  const ICON_OVERLAY_EXPAND = 'M3 5h12v2H3zM3 10h9v2H3zM3 15h12v2H3zM14 7l5 5-5 5v-3h-3v-4h3z';
  const ICON_SEARCH = 'M10 2a8 8 0 1 0 4.906 14.32l5.387 5.386 1.414-1.414-5.386-5.387A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z';
  const ICON_CHEV = 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z';
  const ICON_STACKED_TABS = 'M8 3.75h10.25A2.25 2.25 0 0 1 20.5 6v10.25a2.25 2.25 0 0 1-2.25 2.25H8A2.25 2.25 0 0 1 5.75 16.25V6A2.25 2.25 0 0 1 8 3.75Zm0 2A.25.25 0 0 0 7.75 6v10.25c0 .14.11.25.25.25h10.25a.25.25 0 0 0 .25-.25V6a.25.25 0 0 0-.25-.25H8ZM3.5 8.5h1.75v8.75c0 1.24 1.01 2.25 2.25 2.25h8.75v1.75H7.5a4 4 0 0 1-4-4V8.5Z';
  const ICON_GEAR = 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z';

  const iconBtn = (cls, title, path) => {
    const b = h('button', cls);
    b.type = 'button';
    b.title = title;
    b.appendChild(svg(path));
    return b;
  };

  const textBtn = (cls, text) => {
    const b = h('button', cls, text);
    b.type = 'button';
    return b;
  };

  async function send(msg) {
    if (dead) return null;
    try {
      return await api.runtime.sendMessage(msg);
    } catch (e) {
      if (String(e && e.message).includes('context invalidated')) destroy();
      return null;
    }
  }

  const saveSettings = () => { try { api.storage.local.set({ settings }); } catch (e) {} };
  const saveCollapsed = () => { try { api.storage.local.set({ collapsed }); } catch (e) {} };

  function toolbarButtonMap() {
    return { bookmarks: els.bookmarkBtn, pin: els.pin, settings: els.gear };
  }

  function applyToolbarOrder(persist = false) {
    if (!els.head || !els.searchRow) return;
    const buttons = toolbarButtonMap();
    const order = [...new Set(toolbarOrder.filter((id) => buttons[id]))];
    for (const id of DEFAULT_TOOLBAR_ORDER) if (!order.includes(id)) order.push(id);
    toolbarOrder = order;
    if (!buttons[edgeToolId]) edgeToolId = 'settings';

    // Docked vertical overlays keep the chosen edge button in its edge slot.
    // Windowed and horizontal layouts place it inline after the other two toolbar
    // buttons, so it stays on the top bar rather than floating at the bottom/right.
    if (els.edgeTools) els.edgeTools.replaceChildren();
    const visibleOrder = order.filter((id) => id !== edgeToolId);
    const inlineEdgeTool = isBox() || !isVertical();
    els.head.append(els.searchRow, ...visibleOrder.map((id) => buttons[id]));
    if (inlineEdgeTool) {
      if (buttons[edgeToolId]) els.head.appendChild(buttons[edgeToolId]);
    } else if (els.edgeTools && buttons[edgeToolId]) {
      els.edgeTools.appendChild(buttons[edgeToolId]);
    }
    els.head.classList.add('default-toolbar-placement');
    if (els.panel) {
      els.panel.classList.add('default-toolbar-placement');
      els.panel.classList.toggle('inline-edge-tools', inlineEdgeTool);
    }
    if (persist) {
      try { api.storage.local.set({ toolbarOrder, edgeToolId }); } catch (_) {}
    }
  }

  function setupToolbarReordering() {
    const buttons = toolbarButtonMap();
    for (const [id, button] of Object.entries(buttons)) {
      if (!button) continue;
      button.classList.add('toolbar-item');
      button.dataset.toolbarId = id;
      button.draggable = true;
      button.addEventListener('dragstart', (e) => {
        toolbarDragId = id;
        try {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', 'fn-toolbar:' + id);
        } catch (_) {}
        button.classList.add('toolbar-dragging');
      });
      button.addEventListener('dragend', clearToolbarDragMarks);
    }

    function clearToolbarDragMarks() {
      toolbarDragId = null;
      if (els.panel) els.panel.querySelectorAll('.toolbar-dragging,.toolbar-drop-target').forEach((n) => n.classList.remove('toolbar-dragging', 'toolbar-drop-target'));
    }

    // The drop strip is invisible by design. It occupies the actual edge area
    // while a toolbar icon is being dragged: bottom for vertical layouts,
    // right for horizontal layouts. It is deliberately not triggered elsewhere.
    function isEdgeDrop(e) {
      if (!toolbarDragId || settings.style !== 'docked' || !els.panel) return false;
      const r = els.panel.getBoundingClientRect();
      const threshold = Math.max(34, Math.round(44 * u));
      return isVertical()
        ? e.clientY >= r.bottom - threshold
        : e.clientX >= r.right - threshold;
    }

    els.panel.addEventListener('dragover', (e) => {
      if (!toolbarDragId) return;
      const target = e.target.closest && e.target.closest('[data-toolbar-id]');
      const targetId = target && target.dataset.toolbarId;
      if (targetId && targetId !== toolbarDragId) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        els.panel.querySelectorAll('.toolbar-drop-target').forEach((n) => n.classList.remove('toolbar-drop-target'));
        target.classList.add('toolbar-drop-target');
        return;
      }
      if (isEdgeDrop(e)) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        els.panel.querySelectorAll('.toolbar-drop-target').forEach((n) => n.classList.remove('toolbar-drop-target'));
      }
    });

    els.panel.addEventListener('drop', (e) => {
      if (!toolbarDragId) return;
      const draggedId = toolbarDragId;
      const target = e.target.closest && e.target.closest('[data-toolbar-id]');
      const targetId = target && target.dataset.toolbarId;

      if (targetId && targetId !== draggedId) {
        e.preventDefault();
        e.stopPropagation();
        const from = toolbarOrder.indexOf(draggedId);
        const to = toolbarOrder.indexOf(targetId);
        if (from >= 0 && to >= 0) {
          // Keep the exact order position when swapping with the edge icon;
          // when swapping two header icons, this is a simple reorder.
          const next = [...toolbarOrder];
          [next[from], next[to]] = [next[to], next[from]];
          toolbarOrder = next;
          if (targetId === edgeToolId) edgeToolId = draggedId;
          else if (draggedId === edgeToolId) edgeToolId = targetId;
          applyToolbarOrder(true);
        }
      } else if (isEdgeDrop(e) && draggedId !== edgeToolId) {
        e.preventDefault();
        e.stopPropagation();
        edgeToolId = draggedId;
        applyToolbarOrder(true);
      }
      clearToolbarDragMarks();
    });
  }

  // ---------- state ----------
  const vw = () => document.documentElement.clientWidth || window.innerWidth;
  const vh = () => document.documentElement.clientHeight || window.innerHeight;
  const isVertical = () => settings.edge === 'left' || settings.edge === 'right';
  const isBox = () => settings.style === 'windowed';
  const FLOATING_BOOKMARK_BAR_HEIGHT = 36;
  const allowed = () => (!settings.onlyFullscreen || fullscreen) && !document.fullscreenElement;
  const wantVisible = () => allowed() && (isBox() ? pinned : (pinned || peek));
  const modOk = () => settings.triggerKey === 'none' || !!mods[settings.triggerKey];
  // Pinning a docked overlay always reserves page space; no separate Push toggle.
  // Floating Windowed mode remains an overlay and does not resize the page.
  const pushHere = () => pinned && settings.style === 'docked';

  async function loadStorage() {
    try {
      const r = await api.storage.local.get(['settings', 'pinned', 'dockedPinned', 'collapsed', 'windowNames', 'toolbarOrder', 'edgeToolId', 'bmFolderIcons', 'railStripV2', 'winPopPinned', 'winPopIcons']);
      settings = fnNormalize(r.settings);
      folderIcons = r.bmFolderIcons && typeof r.bmFolderIcons === 'object' ? r.bmFolderIcons : {};
      // The previous rail build could save an expanded thickness (it snapped
      // the old shelf to whole rows). The strip has no expanded state, so reset
      // that one-time value to the smallest height. Later manual sizes stick.
      if (!r.railStripV2) {
        const horizontalDock = settings.style === 'docked'
          && (settings.edge === 'top' || settings.edge === 'bottom');
        if (horizontalDock && settings.barHeight !== 40) {
          settings.barHeight = 40;
          try { api.storage.local.set({ settings }); } catch (_) {}
        }
        try { api.storage.local.set({ railStripV2: true }); } catch (_) {}
      }
      pinned = !!r.pinned;
      winPopPinned = !!r.winPopPinned;
      winPopIcons = !!r.winPopIcons;
      // Legacy floating mode always forced pinned=true, so only infer from the
      // live pin when the saved layout is docked and no previous docked state exists.
      dockedPinned = typeof r.dockedPinned === 'boolean'
        ? r.dockedPinned
        : (settings.style === 'docked' ? pinned : false);
      if (typeof r.dockedPinned !== 'boolean') {
        try { api.storage.local.set({ dockedPinned }); } catch (_) {}
      }
      collapsed = r.collapsed || {};
      windowNames = r.windowNames || {};
      if (Array.isArray(r.toolbarOrder)) {
        const valid = r.toolbarOrder.filter((id) => DEFAULT_TOOLBAR_ORDER.includes(id));
        toolbarOrder = [...new Set(valid)];
        for (const id of DEFAULT_TOOLBAR_ORDER) if (!toolbarOrder.includes(id)) toolbarOrder.push(id);
      }
      if (DEFAULT_TOOLBAR_ORDER.includes(r.edgeToolId)) edgeToolId = r.edgeToolId;
    } catch (e) {}
  }

  function applyFullscreenState(next) {
    const wasFullscreen = fullscreen;
    fullscreen = !!next;
    if (wasFullscreen && !fullscreen) {
      // Browser fullscreen exit is a window-state transition (F11), not
      // necessarily a document.fullscreenchange event or exact screen-size match.
      if (bookmarks && bookmarks.closeNavigation) bookmarks.closeNavigation();
      hideTip();
    }
    return wasFullscreen !== fullscreen;
  }

  async function queryEnv() {
    const r = await send({ type: 'env' });
    if (r) return { fs: !!r.fullscreen, zoom: r.zoom > 0 ? r.zoom : 1 };
    return { fs: false, zoom: 1 };
  }

  function resync() {
    if (dead) return;
    refreshEnv();
    if (shown) {
      if (!port) connect();
      refreshTabs();
    }
    measure();
    applyGeometry();
    syncPush(false);
    kickHover();
  }

  // A window that just regained focus does not recompute :hover until the mouse
  // moves. Chrome re-evaluates hover after a layout change, so nudge one.
  function kickHover() {
    if (!els.panel) return;
    const p = els.panel;
    const nudge = (v) => { p.style.paddingBottom = v; };
    const prev = p.style.paddingBottom;
    nudge('0.01px');
    requestAnimationFrame(() => requestAnimationFrame(() => nudge(prev)));
  }

  async function refreshEnv() {
    const r = await queryEnv();
    let changed = applyFullscreenState(r.fs);
    const nu = 1 / r.zoom;
    if (Math.abs(nu - u) > 0.001) { u = nu; applyUnit(); changed = true; }
    if (changed) update();
  }

  function setPinned(v) {
    pinned = !!v;
    const state = { pinned };
    if (settings.style === 'docked') {
      dockedPinned = pinned;
      state.dockedPinned = dockedPinned;
    }
    if (!pinned) peek = isBox() ? false : true;
    if (pinned) peek = false;
    update();
    try { api.storage.local.set(state); } catch (e) {}
  }

  // ---------- hot zone (real pixels: page px = real px * u) ----------
  function zoneRect() {
    const s = settings, W = vw(), H = vh(), t = Math.max(1, s.zoneThickness * u);
    const total = isVertical() ? H : W;
    const len = (total * s.zoneLength) / 100;
    const start = (total * s.zoneStart) / 100;
    switch (s.edge) {
      case 'left': return { x: 0, y: start, w: t, h: len };
      case 'right': return { x: W - t, y: start, w: t, h: len };
      case 'top': return { x: start, y: 0, w: len, h: t };
      default: return { x: start, y: H - t, w: len, h: t };
    }
  }

  function inZone(x, y) {
    const r = zoneRect();
    return x >= r.x && x < r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function placeHint() {
    if (!els.hint) return;
    const r = zoneRect();
    const editing = hotZoneEditMode && !isBox();
    const edge = settings.edge;
    const thickness = editing ? Math.max(24, 16 * u) : (isVertical() ? r.w : r.h);
    let left = r.x, top = r.y, width = r.w, height = r.h;

    // In edit mode, enlarge the edge strip into an easy-to-grab target without
    // changing the actual activation-zone thickness stored in settings.
    if (editing) {
      if (edge === 'left') { left = 0; width = thickness; }
      else if (edge === 'right') { left = Math.max(0, vw() - thickness); width = thickness; }
      else if (edge === 'top') { top = 0; height = thickness; }
      else { top = Math.max(0, vh() - thickness); height = thickness; }
    }

    els.hint.dataset.edge = edge;
    els.hint.dataset.dir = isVertical() ? 'v' : 'h';
    els.hint.classList.toggle('editing', editing);
    // Write the live preview geometry directly from the current settings on
    // every pointer move. Using explicit pixel values (rather than relying on
    // only the Settings-page preview) keeps long-axis changes visible while
    // editing on a website, including after changing between vertical/horizontal
    // edges.
    els.hint.style.setProperty('left', Math.round(left) + 'px', 'important');
    els.hint.style.setProperty('top', Math.round(top) + 'px', 'important');
    els.hint.style.setProperty('width', Math.max(1, Math.round(width)) + 'px', 'important');
    els.hint.style.setProperty('height', Math.max(1, Math.round(height)) + 'px', 'important');

    // Match the Settings-page editor: put the thickness handle on the INNER
    // edge of the visible bar, not over its center. The bar is intentionally
    // enlarged here for easier grabbing; positioning the handle at the real
    // zone boundary made it cover the main drag area, so dragging the long
    // side accidentally edited thickness and appeared to do nothing.
    const thicknessHandle = els.hint.querySelector('.hint-thickness');
    if (thicknessHandle && editing) {
      thicknessHandle.style.left = '';
      thicknessHandle.style.right = '';
      thicknessHandle.style.top = '';
      thicknessHandle.style.bottom = '';
      if (edge === 'left') Object.assign(thicknessHandle.style, { left: Math.max(0, width - 5) + 'px', right: 'auto', top: '25%', bottom: '25%', width: '10px', height: 'auto' });
      else if (edge === 'right') Object.assign(thicknessHandle.style, { left: '-5px', right: 'auto', top: '25%', bottom: '25%', width: '10px', height: 'auto' });
      else if (edge === 'top') Object.assign(thicknessHandle.style, { top: Math.max(0, height - 5) + 'px', bottom: 'auto', left: '25%', right: '25%', height: '10px', width: 'auto' });
      else Object.assign(thicknessHandle.style, { top: '-5px', bottom: 'auto', left: '25%', right: '25%', height: '10px', width: 'auto' });
    } else if (thicknessHandle) {
      thicknessHandle.removeAttribute('style');
    }
  }

  function updateHintVisibility() {
    if (!els.hint) return;
    const editing = hotZoneEditMode && !isBox() && allowed();
    els.hint.classList.toggle('editing', editing);
    els.hint.style.display = editing || (settings.showHint && allowed() && !shown) ? 'block' : 'none';
    els.hint.style.pointerEvents = editing ? 'auto' : 'none';
    if (els.editShield) {
      els.editShield.classList.toggle('on', editing);
      els.editShield.style.pointerEvents = editing ? 'auto' : 'none';
      els.editShield.setAttribute('aria-hidden', String(!editing));
    }
    updateResizeBuffer();
  }

  function startHotZoneEdit(e) {
    if (!hotZoneEditMode || isBox() || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    clearClose();
    // Keep the drag stream attached to the editor even when the pointer leaves
    // the visible bar; otherwise the website can steal the pointer and the
    // long-axis preview appears to stop following the setting.
    try { els.hint.setPointerCapture(e.pointerId); } catch (_) {}

    const target = e.target.closest && e.target.closest('[data-zone-part]');
    const part = target ? target.dataset.zonePart : 'body';
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    const nearestEdge = (x, y) => [
      ['left', x], ['right', vw() - x], ['top', y], ['bottom', vh() - y]
    ].sort((a, b) => a[1] - b[1])[0];
    const percentAlong = (edge, x, y) => {
      const vertical = edge === 'left' || edge === 'right';
      const total = Math.max(1, vertical ? vh() : vw());
      return ((vertical ? y : x) / total) * 100;
    };

    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
      moved = true;
      if (part === 'thickness') {
        const distance = {
          left: ev.clientX,
          right: vw() - ev.clientX,
          top: ev.clientY,
          bottom: vh() - ev.clientY
        }[settings.edge];
        settings.zoneThickness = fnClamp(Math.round(distance / u), 1, 40);
      } else if (part === 'start' || part === 'end') {
        const pct = percentAlong(settings.edge, ev.clientX, ev.clientY);
        if (part === 'start') {
          const end = settings.zoneStart + settings.zoneLength;
          settings.zoneStart = fnClamp(pct, 0, end - 5);
          settings.zoneLength = end - settings.zoneStart;
        } else {
          const end = fnClamp(pct, settings.zoneStart + 5, 100);
          settings.zoneLength = end - settings.zoneStart;
        }
      } else {
        const [edge, distance] = nearestEdge(ev.clientX, ev.clientY);
        // Keep the bar on its current edge until the pointer reaches an edge.
        // This avoids accidental jumps while adjusting its position mid-screen.
        if (distance <= Math.max(36, 24 * u)) settings.edge = edge;
        const pct = percentAlong(settings.edge, ev.clientX, ev.clientY);
        settings.zoneStart = fnClamp(pct - settings.zoneLength / 2, 0, 100 - settings.zoneLength);
      }
      settings.zoneLength = fnClamp(Number(settings.zoneLength) || 40, 5, 100);
      settings.zoneStart = fnClamp(Number(settings.zoneStart) || 0, 0, 100 - settings.zoneLength);
      placeHint();
      updateHintVisibility();
      // Force a layout read so the live handle's long-axis geometry is committed
      // immediately instead of waiting for a later settings/storage refresh.
      void els.hint.offsetWidth;
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (moved) {
        saveSettings();
        applySettings(true);
        // Keep the editor open after a drag so the user can make fine adjustments.
        hotZoneEditMode = !isBox();
        placeHint();
        updateHintVisibility();
      } else if (part === 'body') {
        // Clicking the blue zone itself (without moving it) exits live editing.
        // The end/thickness handles remain dedicated adjustment controls.
        hotZoneEditMode = false;
        placeHint();
        updateHintVisibility();
      }
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }


  function updateResizeBuffer() {
    const el = els.resizeBuffer;
    if (!el) return;
    if (!shown || !els.panel || isBox() || !allowed() || hotZoneEditMode || settingsCard) {
      el.style.display = 'none';
      return;
    }
    // DISABLED ONLY for horizontal docked mode: the outside hit buffer is
    // the same resize line as the bottom/top grip. Vertical rails keep theirs.
    if (!isVertical()) {
      el.style.display = 'none';
      return;
    }
    const r = els.panel.getBoundingClientRect();
    const size = 3;          // a narrow, outside-only resize buffer
    const inset = 12;        // keep the target away from rounded/end corners
    el.dataset.axis = isVertical() ? 'x' : 'y';
    el.dataset.handle = ({ left: 'e', right: 'w', top: 's', bottom: 'n' })[settings.edge];
    Object.assign(el.style, {
      display: 'block', left: '0px', top: '0px', width: '0px', height: '0px',
      cursor: isVertical() ? 'ew-resize' : 'ns-resize'
    });
    if (settings.edge === 'left') Object.assign(el.style, { left: r.right + 'px', top: (r.top + inset) + 'px', width: size + 'px', height: Math.max(0, r.height - inset * 2) + 'px' });
    else if (settings.edge === 'right') Object.assign(el.style, { left: (r.left - size) + 'px', top: (r.top + inset) + 'px', width: size + 'px', height: Math.max(0, r.height - inset * 2) + 'px' });
    else if (settings.edge === 'top') Object.assign(el.style, { left: (r.left + inset) + 'px', top: r.bottom + 'px', width: Math.max(0, r.width - inset * 2) + 'px', height: size + 'px' });
    else Object.assign(el.style, { left: (r.left + inset) + 'px', top: (r.top - size) + 'px', width: Math.max(0, r.width - inset * 2) + 'px', height: size + 'px' });
  }

  function nearResizeTarget(x = lastPointer.x, y = lastPointer.y) {
    if (!shown || !els.panel || isBox() || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    // DISABLED ONLY in horizontal docked mode with its resize-line gesture.
    if (!isVertical()) return false;
    const r = els.panel.getBoundingClientRect();
    const tolerance = 4; // small resize hit band; keep nearby scrollbar thumbs accessible
    if (isVertical()) {
      const activeX = settings.edge === 'left' ? r.right : r.left;
      return Math.abs(x - activeX) <= tolerance && y >= r.top - 4 && y <= r.bottom + 4;
    }
    const activeY = settings.edge === 'top' ? r.bottom : r.top;
    return Math.abs(y - activeY) <= tolerance && x >= r.left - 4 && x <= r.right + 4;
  }

  function nearPanelEdge(x = lastPointer.x, y = lastPointer.y) {
    if (!shown || !els.panel || isBox() || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const r = els.panel.getBoundingClientRect();
    const grace = 18; // a small deadband outside/inside the overlay edge
    if (x < r.left - grace || x > r.right + grace || y < r.top - grace || y > r.bottom + grace) return false;
    return Math.abs(x - r.left) <= grace
      || Math.abs(x - r.right) <= grace
      || Math.abs(y - r.top) <= grace
      || Math.abs(y - r.bottom) <= grace;
  }

  const clearOpen = () => { clearTimeout(openTimer); openTimer = 0; };
  const clearClose = () => { clearTimeout(closeTimer); closeTimer = 0; };

  function checkOpen() {
    if (isBox() || !allowed() || wantVisible() || needRearm) { clearOpen(); return; }
    if (lastInZone && modOk()) {
      if (!openTimer) {
        openTimer = setTimeout(() => {
          openTimer = 0;
          if (!isBox() && lastInZone && modOk() && !needRearm) openPeek();
        }, settings.dwellMs);
      }
    } else clearOpen();
  }

  function hasBlockingPopup() {
    // Covers every modal currently used by the extension, including future
    // dialogs that use the shared backdrop/card/prompt classes.
    return !!(ui && ui.querySelector('.backdrop, .card, .prompt'));
  }

  function scheduleClose() {
    if (closeTimer) return;
    closeTimer = setTimeout(() => {
      closeTimer = 0;
      if (keepPeekOpenAfterEscape || hoverPanel || hoverWinPop || lastInZone || nearResizeTarget() || nearPanelEdge() || pinned || resizing || hotZoneEditMode || dragIds || bookmarkDrag || (winPopOpen && (!winPopPinned || hoverWinPop)) || (els.panel && els.panel.classList.contains('dragging-overlay')) || hasBlockingPopup() || (contextMenu && contextMenu.isOpen()) || (bookmarks && bookmarks.hasOpenFolders && bookmarks.hasOpenFolders()) || (bookmarks && bookmarks.isPlacementDragging && bookmarks.isPlacementDragging())) return;
      if (root && root.activeElement === els.search) return;
      if (isBox()) return;
      closePeek();
    }, settings.closeDelayMs);
  }

  function openPeek() {
    if (!allowed() || wantVisible()) return;
    peek = true;
    update();
  }

  function closePeek() {
    keepPeekOpenAfterEscape = false;
    if (winPopOpen) closeWinPop();
    if (searchPopupOpen) closeSearchPopup(false);
    hotZoneEditMode = false;
    updateHintVisibility();
    peek = false;
    hoverPanel = false;
    needRearm = true;
    clearOpen();
    clearClose();
    selected.clear();
    if (contextMenu) contextMenu.hide();
    hideTip();
    if (root && root.activeElement) root.activeElement.blur();
    update();
  }

  function onMove(e) {
    if (dead) return;
    lastPointer = { x: e.clientX, y: e.clientY };
    mods = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
    lastInZone = !isBox() && allowed() && inZone(e.clientX, e.clientY);
    if (!lastInZone) needRearm = false;
    checkOpen();
    if (peek && !pinned) {
      if (lastInZone || hoverPanel || nearResizeTarget(e.clientX, e.clientY) || nearPanelEdge(e.clientX, e.clientY)) clearClose(); else scheduleClose();
    }
  }

  function onKey(e) {
    if (dead) return;
    if (winPopOpen && e.type === 'keydown' && e.key === 'Escape'
      && !renamePrompt && !settingsCard
      && !(contextMenu && contextMenu.isOpen())) {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Escape is an explicit dismissal: stop the popover from following the
      // overlay instead of letting the next refresh immediately reopen it.
      if (winPopPinned) setWinPopPinned(false);
      closeWinPop();
      return;
    }
    const active = root && root.activeElement;
    const searchFocused = !!(active && active === els.search);
    const renameFocused = !!(renamePrompt && active === renamePrompt.input);
    if (searchFocused) {
      // This listener is installed at document_start, before site shortcuts.
      // Stop keyboard events reaching the page while the user is typing, but
      // do not cancel ordinary key defaults: text entry and editing still work.
      e.stopImmediatePropagation();
      if (e.type === 'keydown') {
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && flat.length) {
          e.preventDefault();
          const i = flat.findIndex((item) => item.id === selId);
          const n = fnClamp((i < 0 ? (e.key === 'ArrowDown' ? -1 : flat.length) : i) + (e.key === 'ArrowDown' ? 1 : -1), 0, flat.length - 1);
          if (flat[n]) { selId = flat[n].id; anchorId = selId; scrollSel = true; render(); }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const query = els.search.value.trim();
          const selectedId = selId;
          // If the current search has matching tabs, Enter activates the
          // highlighted tab. If nothing matches, retain address/web search.
          if (query && flat.length && selectedId != null && flat.some((item) => item.id === selectedId)) {
            activate(selectedId);
          } else if (query) {
            send({ type: 'go', text: query, inNew: settings.searchIn !== 'current' });
            if (!pinned && !isBox()) closePeek();
          } else if (selectedId != null) activate(selectedId);
          // Enter submits the action, then clears the query and restores all tabs.
          clearSearchInput(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (searchPopupOpen) closeSearchPopup(true);
          else if (pinned) els.search.blur();
          else closePeek();
        }
      }
      return;
    }
    // Do not suppress native editing in the small rename prompt. Its own input
    // handler deals with Enter/Escape.
    if (renameFocused) return;
    mods = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
    if (e.type === 'keydown' && e.key === 'Escape') {
      if (settingsCard) { closeSettingsCard(); e.preventDefault(); return; }
      if (renamePrompt) { closePrompt(); e.preventDefault(); return; }
      if (contextMenu && contextMenu.isOpen()) {
        hideTip();
        keepPeekOpenAfterEscape = true;
        if (contextMenu.closeLatest) contextMenu.closeLatest(); else contextMenu.hide();
        clearClose();
        e.preventDefault();
        return;
      }
      if (hotZoneEditMode) {
        hotZoneEditMode = false;
        placeHint();
        updateHintVisibility();
        e.preventDefault();
        return;
      }
      if (peek && !pinned && shown) closePeek();
    }
    checkOpen();
  }

  // ---------- tab data ----------
  function connect() {
    if (port || dead) return;
    try {
      port = api.runtime.connect({ name: 'tabs' });
      const mine = port;
      port.onMessage.addListener((m) => {
        if (m && m.type === 'tabs') { applyTabData(m); if (bookmarks) bookmarks.update(); }
        else if (m && m.type === 'bm' && bookmarks) bookmarks.refresh();
        else if (m && m.type === 'windowState') {
          if (applyFullscreenState(!!m.fullscreen)) update();
        }
      });
      port.onDisconnect.addListener(() => {
        if (port === mine) port = null;
        if (shown && !dead) setTimeout(() => { if (shown && !port) { connect(); refreshTabs(); } }, 500);
      });
    } catch (e) { port = null; }
  }

  function disconnect() {
    if (!port) return;
    const p = port;
    port = null;
    try { p.disconnect(); } catch (e) {}
  }

  // The background re-sends tab data several times after each navigation (to
  // catch late favicon updates). Skip the full re-render when nothing visible
  // changed, which removes most icon/tab flicker.
  let lastTabSig = '';
  function applyTabData(m) {
    let sig = '';
    try { sig = JSON.stringify([m.cur, m.groups, m.windows]); } catch (_) {}
    data = m;
    if (sig && sig === lastTabSig) return;
    lastTabSig = sig;
    render();
  }

  async function refreshTabs() {
    const r = await send({ type: 'tabs' });
    if (r && r.windows) applyTabData(r);
  }

  function setFilter(v) {
    filter = String(v || '');
    if (els.search) els.search.value = filter;
    selId = null;
    render();
  }

  // Search filters open tabs by title or URL while preserving Enter-to-navigate
  // when no open tab matches the entered text.
  const matches = (t) => ((t.title || '') + ' ' + (t.url || ''))
    .toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());

  function fillFav(el, t) {
    if (globalThis.FNX && globalThis.FNX.favicons) {
      globalThis.FNX.favicons.mount(el, t.url || '', t.favIconUrl || '', t.title || t.url || '?', { slot: 't' + t.id });
      return;
    }
    el.textContent = ((t.title || '?').trim().charAt(0) || '•').toUpperCase();
    el.classList.add('letter');
  }

  function tabEl(t, isCur) {
    const cls = ['tab'];
    // The current-window state is shown only by brightening its window icon;
    // individual inactive tabs in that window should not get a blue tint.
    // Only mark the active tab in the current browser window. Tabs that were
    // selected in background windows must not retain a bracket-like marker.
    if (t.active && isCur) cls.push('active');
    if (t.id === selId) cls.push('sel');
    if (selected.has(t.id)) cls.push('selected');
    if (t.discarded) cls.push('dim');
    const d = h('div', cls.join(' '));
    d.dataset.id = String(t.id);
    d.draggable = true;
    d.dataset.title = t.title || 'Untitled tab';
    d.dataset.url = t.url || '';
    const fav = h('span', 'fav');
    fillFav(fav, t);
    const body = h('div', 'tabbody');
    body.append(fav, h('span', 'title', t.title));
    if (t.audible || t.muted) body.appendChild(h('span', 'badge', t.muted ? '🔇' : '🔊'));
    if (t.pinned) body.appendChild(h('span', 'badge', '📌'));
    const x = h('button', 'x', '×');
    x.type = 'button';
    x.title = 'Close tab';
    body.appendChild(x);
    d.appendChild(body);
    return d;
  }

  const chev = () => { const s = svg(ICON_CHEV); s.classList.add('chev'); return s; };

  // Small application-window glyph: frame, title bar, and three title-bar dots.
  const windowIcon = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.classList.add('window-icon');
    const frame = document.createElementNS(ns, 'rect');
    frame.setAttribute('x', '3.5'); frame.setAttribute('y', '4');
    frame.setAttribute('width', '17'); frame.setAttribute('height', '16');
    frame.setAttribute('rx', '1.8'); frame.setAttribute('fill', 'none');
    frame.setAttribute('stroke', 'currentColor'); frame.setAttribute('stroke-width', '1.7');
    const titleLine = document.createElementNS(ns, 'line');
    titleLine.setAttribute('x1', '4'); titleLine.setAttribute('y1', '8');
    titleLine.setAttribute('x2', '20'); titleLine.setAttribute('y2', '8');
    titleLine.setAttribute('stroke', 'currentColor'); titleLine.setAttribute('stroke-width', '1.5');
    s.append(frame, titleLine);
    for (const x of [6.5, 9, 11.5]) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', String(x)); dot.setAttribute('cy', '6');
      dot.setAttribute('r', '.65'); dot.setAttribute('fill', 'currentColor');
      s.appendChild(dot);
    }
    return s;
  };

  function render() {
    if (!els.list) return;
    const filtering = !!filter.trim();
    const frag = document.createDocumentFragment();
    flat = [];
    // Preserve selections from background windows when only the current window
    // is rendered inline. The Other windows popover is also a selectable list.
    const alive = new Set();
    for (const win of data.windows || []) {
      for (const tab of win.tabs || []) alive.add(tab.id);
    }
    let renderedWindows = 0;
    // The rail can either stay compact (current browser window only) or show
    // every window inline with its icon, tab count and divider. In compact mode,
    // other windows remain available from the window popover; search stays global.
    const horizontalRail = !isBox() && !isVertical();
    let currentOnly = horizontalRail && !filtering && settings.horizontalWindows !== 'all';
    let windows = data.windows || [];
    if (currentOnly) {
      const cur = windows.filter((w) => w.id === data.cur);
      if (cur.length) windows = cur;
      else currentOnly = false;
    }
    const showWindowHeader = !currentOnly;

    windows.forEach((w) => {
      const list = filtering ? w.tabs.filter(matches) : w.tabs;
      if (filtering && !list.length) return;
      const isCur = w.id === data.cur;
      const wClosed = showWindowHeader && !filtering && !!collapsed[collapseKey('w' + w.id)];

      // A deliberately short divider separates each visible window section.
      // It is a real flex item so it also works when horizontal layouts flatten
      // window wrappers with display: contents.
      if (showWindowHeader && renderedWindows > 0) frag.appendChild(h('div', 'windivider'));
      renderedWindows++;

      const win = h('div', 'win' + (isCur ? '' : ' inactive-window'));
      win.dataset.win = String(w.id);
      if (showWindowHeader) {
        const wh = h('div', 'whead' + (wClosed ? ' closed' : '') + (isCur ? ' cur' : ''));
        const windowName = String(w.name || '').trim();
        wh.dataset.win = String(w.id);
        wh.dataset.title = windowName;
        wh.dataset.detail = (w.tabs.length + ' tabs');
        wh.title = windowName ? ((wClosed ? 'Expand' : 'Collapse') + ' window: ' + windowName) : (wClosed ? 'Expand tabs' : 'Collapse tabs');
        wh.appendChild(windowIcon());
        if (windowName) wh.appendChild(h('span', 'wlabel', windowName));
        wh.appendChild(h('span', 'wcount', w.tabs.length + ' Tabs'));
        win.appendChild(wh);
      }

      if (!wClosed) {
        const body = h('div', 'wbody');
        let i = 0;
        while (i < list.length) {
          const t = list[i];
          const g = t.groupId >= 0 ? data.groups[t.groupId] : null;
          if (g) {
            let j = i;
            while (j < list.length && list[j].groupId === t.groupId) j++;
            const gClosed = !filtering && !!collapsed[collapseKey('g' + t.groupId)];
            const color = GROUP_COLORS[g.color] || GROUP_COLORS.grey;
            const gh = h('div', 'ghead' + (gClosed ? ' closed' : ''));
            gh.dataset.group = String(t.groupId);
            gh.dataset.title = g.title || 'Group';
            gh.dataset.detail = (j - i) + ' tabs';
            gh.title = (gClosed ? 'Expand' : 'Collapse') + ' group';
            const dot = h('span', 'gdot');
            dot.style.background = color;
            gh.append(chev(), dot, h('span', 'gtitle', g.title || 'Group'), h('span', 'gcount', (j - i) + ' Tabs'));
            body.appendChild(gh);
            if (!gClosed) {
              const gb = h('div', 'gbody');
              gb.style.borderLeftColor = color;
              for (let k = i; k < j; k++) {
                gb.appendChild(tabEl(list[k], isCur));
                flat.push({ id: list[k].id, active: list[k].active && isCur });
              }
              body.appendChild(gb);
            }
            i = j;
          } else {
            body.appendChild(tabEl(t, isCur));
            flat.push({ id: t.id, active: t.active && isCur });
            i++;
          }
        }
        win.appendChild(body);
      }
      frag.appendChild(win);
    });

    for (const id of [...selected]) if (!alive.has(id)) selected.delete(id);
    const visibleNow = new Set(flat.map((f) => f.id));
    if (winPopOpen) for (const id of winPopFlat) visibleNow.add(id);
    if (selId == null || !visibleNow.has(selId)) {
      const pick = filtering ? flat[0] : (flat.find((f) => f.active) || flat[0]);
      selId = pick ? pick.id : null;
    }
    if (!frag.childNodes.length) {
      frag.appendChild(h('div', 'empty', data.windows.length ? 'No matching tabs' : 'Loading tabs…'));
    }

    const st = els.list.scrollTop, sl = els.list.scrollLeft;
    els.list.replaceChildren(frag);
    els.list.scrollTop = st;
    els.list.scrollLeft = sl;
    if (needCenter || scrollSel) {
      const target = els.list.querySelector(needCenter ? '.tab.active' : '.tab.sel');
      if (target) {
        target.scrollIntoView({ block: needCenter ? 'center' : 'nearest', inline: needCenter ? 'center' : 'nearest' });
        needCenter = false;
      }
      scrollSel = false;
    }
    syncWinButton();
    updateRailDensity();
    if (winPopOpen) {
      renderWinPop();
      positionWinPop();
      if (bookmarks) bookmarks.update();
    }
  }

  // Chrome-like density for the horizontal strip. Tabs all shrink to the same
  // width, so a single class on the list is enough: drop the close button
  // first, then the titles when only the favicon fits. Computing this once per
  // render/resize is much cheaper than a container query on every tab.
  function updateRailDensity() {
    const list = els.list;
    if (!list) return;
    if (isBox() || isVertical()) {
      list.classList.remove('tight', 'dense');
      updateScrollButtons();
      return;
    }
    const first = list.querySelector('.tab');
    const width = first ? first.getBoundingClientRect().width : 0;
    if (width) {
      list.classList.toggle('tight', width < 148);
      list.classList.toggle('dense', width < 72);
    }
    updateScrollButtons();
  }

  // Small paging buttons for an overflowing strip. They stay out of the way
  // (and out of the layout) while every tab fits.
  function updateScrollButtons() {
    const prev = els.scrollPrev, next = els.scrollNext, list = els.list;
    if (!prev || !next || !list) return;
    if (isBox() || isVertical()) {
      prev.hidden = true;
      next.hidden = true;
      return;
    }
    // Measure the width the tabs would have without the buttons, so showing
    // them cannot feed back into its own overflow test.
    const navW = (prev.hidden ? 0 : prev.getBoundingClientRect().width + 4)
      + (next.hidden ? 0 : next.getBoundingClientRect().width + 4);
    const fits = list.scrollWidth <= list.clientWidth + navW + 1;
    prev.hidden = fits;
    next.hidden = fits;
    if (fits) return;
    const max = Math.max(0, list.scrollWidth - list.clientWidth);
    prev.disabled = list.scrollLeft <= 1;
    next.disabled = list.scrollLeft >= max - 1;
  }

  function scrollRail(dir) {
    const list = els.list;
    if (!list) return;
    const step = Math.max(140, Math.round(list.clientWidth * 0.8));
    // Keep this instant: smooth scrolling is disabled in some tab states and
    // the paging buttons should always respond on the first press.
    list.scrollBy({ left: dir * step, behavior: 'auto' });
    updateScrollButtons();
  }

  // Reflect window availability on the strip's window button.
  function syncWinButton() {
    const btn = els.winBtn;
    if (!btn) return;
    syncWinButtonPlacement();
    const wins = data.windows || [];
    const others = wins.filter((w) => w.id !== data.cur).length;
    const show = !isBox() && !isVertical()
      && settings.horizontalWindows !== 'all'
      && others > 0;
    btn.hidden = !show;
    if (!show) {
      if (winPopOpen) closeWinPop();
      return;
    }
    const label = others === 1 ? 'Other windows (1)' : ('Other windows (' + others + ')');
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-expanded', String(winPopOpen));
    schedulePinnedWinPop();
  }

  function winPopSide() { return settings.edge === 'bottom' ? 'bottom' : 'top'; }
  function winPopAlign() { return settings.winPopAlign === 'left' ? 'left' : 'right'; }

  function syncWinButtonPlacement() {
    if (!els.panel || !els.winBtn || !els.edgeTools) return;
    const align = winPopAlign();
    els.winBtn.dataset.align = align;
    if (align === 'left') {
      // The left position is before the search toolbar, not before the tab
      // scrolling controls. The matching popover/bookmark offset keeps them clear.
      if (els.panel.firstElementChild !== els.winBtn) {
        els.panel.insertBefore(els.winBtn, els.panel.firstElementChild);
      }
      return;
    }
    if (els.winBtn.parentNode === els.panel && els.winBtn.nextSibling === els.edgeTools) return;
    els.panel.insertBefore(els.winBtn, els.edgeTools);
  }

  function setWinPopAlign(align) {
    settings.winPopAlign = align === 'left' ? 'left' : 'right';
    syncWinButtonPlacement();
    saveSettings();
    if (winPopOpen) {
      positionWinPop();
      if (bookmarks) bookmarks.update();
    }
  }

  function toggleWinPopAlign() {
    setWinPopAlign(winPopAlign() === 'left' ? 'right' : 'left');
  }

  function toggleHorizontalWindowsMode() {
    settings.horizontalWindows = settings.horizontalWindows === 'all' ? 'current' : 'all';
    saveSettings();
    update();
  }

  function showWinPopPositionMenu(e) {
    if (!contextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    const left = winPopAlign() === 'left';
    contextMenu.showContext([{
      label: left ? 'Position button to the right' : 'Position button to the left',
      action: toggleWinPopAlign
    }], e.clientX, e.clientY, undefined, true);
  }

  async function showWinPopEmptyMenu(e) {
    if (!contextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    const reopen = await getReopenMenuItem();
    contextMenu.showContext([
      { label: 'New tab', shortcut: 'Ctrl+T', action: () => send({ type: 'newTab', windowId: data.cur }) },
      { label: 'New window', shortcut: 'Ctrl+N', action: () => send({ type: 'newWindow' }) },
      reopen
    ], e.clientX, e.clientY);
  }

  function setWinPopIcons(on, persist = true) {
    winPopIcons = !!on;
    if (persist) {
      try { api.storage.local.set({ winPopIcons }); } catch (_) {}
    }
    if (!els.winPop) return;
    els.winPop.classList.toggle('icons', winPopIcons);
    if (els.winPopIcons) {
      const path = els.winPopIcons.querySelector('path');
      if (path) path.setAttribute('d', winPopIcons ? ICON_OVERLAY_EXPAND : ICON_OVERLAY_COLLAPSE);
      const label = winPopIcons ? 'Show tab names' : 'Show icons only';
      els.winPopIcons.title = label;
      els.winPopIcons.setAttribute('aria-label', label);
      els.winPopIcons.setAttribute('aria-pressed', String(winPopIcons));
    }
    if (winPopOpen) {
      positionWinPop();
      if (bookmarks) bookmarks.update();
    }
  }

  function syncWinPopPin() {
    if (!els.winPopPin) return;
    const label = winPopPinned ? 'Unpin window list' : 'Pin window list with overlay';
    els.winPopPin.setAttribute('aria-pressed', String(winPopPinned));
    els.winPopPin.title = label;
    els.winPopPin.setAttribute('aria-label', label);
  }

  function canAutoOpenWinPop() {
    return !!(winPopPinned && shown && !winPopOpen
      && !isBox() && !isVertical()
      && settings.horizontalWindows !== 'all'
      && !hasBlockingPopup() && !searchPopupOpen
      && !(contextMenu && contextMenu.isOpen()));
  }

  function schedulePinnedWinPop() {
    if (!canAutoOpenWinPop()) return;
    requestAnimationFrame(() => {
      if (canAutoOpenWinPop()) openWinPop();
    });
  }

  function setWinPopPinned(v, persist = true) {
    winPopPinned = !!v;
    syncWinPopPin();
    if (winPopPinned) schedulePinnedWinPop();
    if (persist) {
      try { api.storage.local.set({ winPopPinned }); } catch (_) {}
    }
  }

  // The popover is a vertical tab strip for the other browser windows. It hangs
  // from the rail (down for a top rail, up for a bottom rail) and is only as
  // tall as its tabs, up to the viewport edge.
  function renderWinPop() {
    if (!els.winPopBody) return;
    const scroll = els.winPopBody.scrollTop;
    const wins = data.windows || [];
    const others = wins.filter((w) => w.id !== data.cur);
    const frag = document.createDocumentFragment();
    winPopFlat = [];
    others.forEach((w, index) => {
      const closed = isWinPopWindowCollapsed(w.id);
      const win = h('div', 'win inactive-window' + (closed ? ' closed' : ''));
      win.dataset.win = String(w.id);
      const wh = h('div', 'whead' + (closed ? ' closed' : ''));
      wh.dataset.win = String(w.id);
      wh.title = closed ? 'Expand tabs' : 'Collapse tabs';
      wh.setAttribute('aria-expanded', String(!closed));
      // Match vertical mode: the header is the collapse control and shows only
      // the window icon and tab count. Window names are intentionally omitted.
      wh.append(windowIcon(), h('span', 'wcount', w.tabs.length + ' Tabs'));
      const wb = h('div', 'wbody');
      for (const t of w.tabs || []) {
        // Background-window active tabs must not get the current-tab marker.
        const el = tabEl(t, false);
        el.title = t.title || 'Untitled tab';
        wb.appendChild(el);
        if (!closed) winPopFlat.push(t.id);
      }
      win.appendChild(wh);
      if (!closed) win.appendChild(wb);
      frag.appendChild(win);
      if (index < others.length - 1) frag.appendChild(h('div', 'windivider'));
    });
    if (!others.length) frag.appendChild(h('div', 'empty', 'No other windows'));
    els.winPopBody.replaceChildren(frag);
    els.winPopBody.scrollTop = scroll;
  }

  function positionWinPop() {
    if (!winPopOpen || !els.winPop || !els.panel) return;
    const side = winPopSide();
    const align = winPopAlign();
    const pr = els.panel.getBoundingClientRect();
    const vpw = document.documentElement.clientWidth || window.innerWidth;
    const vph = document.documentElement.clientHeight || window.innerHeight;
    const uu = u || 1;
    const room = Math.max(180, vpw / uu - 16);
    const wanted = winPopIcons
      ? 52
      : Math.min(340, Math.max(250, Number(settings.panelWidth) || 300));
    // The bookmark bar now yields sideways, so the popover only needs a small
    // viewport margin instead of a vertical reserve.
    const reserve = 8;
    els.winPop.dataset.side = side;
    els.winPop.dataset.align = align;
    els.winPop.style.width = Math.round(Math.min(room, wanted)) + 'px';
    if (align === 'left') {
      // The popover can sit at either end of a horizontal strip. Keeping it
      // flush with the rail's left edge lets the bar start at its right edge.
      els.winPop.style.left = Math.max(0, pr.left / uu) + 'px';
      els.winPop.style.right = 'auto';
    } else {
      els.winPop.style.right = Math.max(0, (vpw - pr.right) / uu) + 'px';
      els.winPop.style.left = 'auto';
    }
    if (side === 'top') {
      els.winPop.style.top = Math.max(0, pr.bottom / uu) + 'px';
      els.winPop.style.bottom = 'auto';
      els.winPop.style.maxHeight = Math.max(140, (vph - pr.bottom) / uu - reserve) + 'px';
    } else {
      els.winPop.style.top = 'auto';
      els.winPop.style.bottom = Math.max(0, (vph - pr.top) / uu) + 'px';
      els.winPop.style.maxHeight = Math.max(140, pr.top / uu - reserve) + 'px';
    }
    // Overflow is only needed when the viewport cap really bites.
    els.winPop.classList.remove('scrolling');
    const body = els.winPopBody;
    if (body && body.scrollHeight - body.clientHeight > 6) els.winPop.classList.add('scrolling');
  }

  function openWinPop() {
    if (winPopOpen || !els.winPop || !els.winBtn || els.winBtn.hidden
      || isBox() || isVertical() || settings.horizontalWindows === 'all') return;
    if (!(data.windows || []).some((w) => w.id !== data.cur)) return;
    winPopOpen = true;
    hoverWinPop = els.winPop.matches(':hover');
    clearClose();
    syncWinPopPin();
    renderWinPop();
    els.winPop.classList.remove('hidden');
    positionWinPop();
    els.winBtn.classList.add('on');
    els.winBtn.setAttribute('aria-expanded', 'true');
    // Closed shadow roots retarget internal pointerdowns to the host by the
    // time they reach the document, so the real inside/outside decision is
    // made by a listener on the shadow root (installed in build()).
    winDocDown = (e) => {
      if (winPopPinned || e.target === root.host) return;
      closeWinPop();
    };
    document.addEventListener('pointerdown', winDocDown, true);
    if (bookmarks) bookmarks.update();
  }

  function closeWinPop() {
    if (!winPopOpen) return;
    winPopOpen = false;
    hoverWinPop = false;
    if (winDocDown) {
      document.removeEventListener('pointerdown', winDocDown, true);
      winDocDown = null;
    }
    if (els.winPop) els.winPop.classList.add('hidden');
    if (els.winBtn) {
      els.winBtn.classList.remove('on');
      els.winBtn.setAttribute('aria-expanded', 'false');
    }
    // The pointer may have been held in the overlay by the popover itself.
    if (hoverPanel && els.panel) hoverPanel = els.panel.matches(':hover');
    if (bookmarks) bookmarks.update();
    if (peek && !pinned && !isBox()) scheduleClose();
  }

  function toggleWinPop() {
    if (winPopOpen) {
      // The rail button is also the quick way to stop following the overlay.
      if (winPopPinned) setWinPopPinned(false);
      closeWinPop();
      return;
    }
    openWinPop();
  }

  // The bookmark bar gives way sideways while the popover is open. The popover
  // consumes the same width from the bar on either side; when it is on the
  // left the bar simply starts after it.
  function winPopBookmarkInset() {
    if (!winPopOpen || !els.winPop) return 0;
    return Math.max(0, els.winPop.getBoundingClientRect().width / (u || 1));
  }

  function winPopBookmarkStart() {
    if (!winPopOpen || !els.winPop || !els.panel || winPopAlign() !== 'left') return 0;
    // When aligned left, bookmarks begin after the popover's right edge.
    return Math.max(0, (els.winPop.getBoundingClientRect().right - els.panel.getBoundingClientRect().left) / (u || 1));
  }

  function visibleIds() {
    const ids = flat.map((entry) => entry.id);
    // The popover is a second vertical list. Treat it as a continuation of the
    // main list for Shift ranges and cross-window selection.
    if (winPopOpen) ids.push(...winPopFlat);
    return ids;
  }

  function visibleIndex(id) { return visibleIds().indexOf(id); }

  function orderedIds(ids) {
    const wanted = new Set(ids);
    const ordered = [];
    // Prefer the order users see in the overlay, including cross-window order.
    for (const entry of flat) if (wanted.has(entry.id)) { ordered.push(entry.id); wanted.delete(entry.id); }
    // Include selected tabs that became hidden by collapsing a section.
    for (const win of (data.windows || [])) {
      for (const tab of win.tabs || []) if (wanted.has(tab.id)) { ordered.push(tab.id); wanted.delete(tab.id); }
    }
    return ordered;
  }

  function toggleSel(id, shift = false, additive = true) {
    const i = visibleIndex(id);
    const a = visibleIndex(anchorId);
    if (shift && i >= 0 && a >= 0) {
      const lo = Math.min(i, a), hi = Math.max(i, a);
      const ids = visibleIds();
      if (!additive) selected.clear();
      for (let k = lo; k <= hi; k++) selected.add(ids[k]);
    } else if (shift) {
      // If the anchor is hidden (for example by a collapsed group), keep the
      // existing selection and add the target rather than toggling it off.
      selected.add(id);
      if (a < 0) anchorId = id;
    } else if (additive) {
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      anchorId = id;
    } else {
      selected.clear();
      anchorId = id;
    }
    selId = id;
    render();
  }

  function clearSel() {
    if (!selected.size && anchorId == null) return;
    selected.clear();
    anchorId = null;
    render();
  }

  // With "collapse windows separately" on, each browser window's overlay keeps
  // its own collapsed state: the key is namespaced by the window being viewed.
  function collapseKey(key) {
    return settings.perWindowCollapse && data.cur >= 0 ? 'v' + data.cur + ':' + key : key;
  }

  // Popover sections are keyed by the background window itself, not by the
  // overlay hosting the popover. This keeps their collapsed state shared across
  // every browser window, even when the main overlay uses per-window collapse.
  function winPopCollapseKey(windowId) {
    return 'wp:' + String(windowId);
  }

  function isWinPopWindowCollapsed(windowId) {
    const key = winPopCollapseKey(windowId);
    if (Object.prototype.hasOwnProperty.call(collapsed, key)) return !!collapsed[key];

    // Honor an older saved collapse state once, then the dedicated shared key
    // takes precedence so expanding in one window won't re-collapse elsewhere.
    if (collapsed['w' + windowId]) return true;
    return Object.keys(collapsed).some((oldKey) =>
      oldKey.endsWith(':w' + windowId) && !!collapsed[oldKey]
    );
  }

  function toggleWinPopCollapse(windowId) {
    const key = winPopCollapseKey(windowId);
    collapsed[key] = isWinPopWindowCollapsed(windowId) ? 0 : 1;
    saveCollapsed();
    renderWinPop();
  }

  function toggleCollapse(key) {
    key = collapseKey(key);
    if (collapsed[key]) delete collapsed[key]; else collapsed[key] = 1;
    render();
    saveCollapsed();
  }

  async function activate(id) {
    await send({ type: 'activate', tabId: id });
    if (settings.closeOnPick && !pinned && !isBox()) closePeek();
  }

  function getTab(id) {
    for (const win of (data.windows || [])) {
      const tab = (win.tabs || []).find((item) => item.id === id);
      if (tab) return { tab, win };
    }
    return null;
  }

  function sameWindowFor(ids) {
    const windows = new Set(ids.map((id) => getTab(id)?.win.id).filter(Number.isInteger));
    return windows.size === 1 ? [...windows][0] : null;
  }

  function sameGroupFor(ids) {
    const gids = ids.map((id) => getTab(id)?.tab.groupId ?? -1);
    return gids.length && gids[0] >= 0 && gids.every((gid) => gid === gids[0]) ? gids[0] : -1;
  }

  function allMuted(ids) {
    return ids.length > 0 && ids.every((id) => !!getTab(id)?.tab.muted);
  }

  function allPinned(ids) {
    return ids.length > 0 && ids.every((id) => !!getTab(id)?.tab.pinned);
  }

  function groupMenuItems(ids) {
    const groups = Object.entries(data.groups || {}).map(([id, g]) => ({ id: Number(id), ...g }));
    groups.sort((a, b) => (a.windowId || 0) - (b.windowId || 0) || a.id - b.id);
    const menu = [{ label: 'Create new group', action: () => send({ type: 'group', tabIds: ids }) }];
    if (groups.length) {
      menu.push({ sep: true });
      for (const group of groups) {
        const count = (data.windows || []).reduce((n, win) => n + win.tabs.filter((tab) => tab.groupId === group.id).length, 0);
        menu.push({
          label: (group.title || 'Group') + (count ? ' (' + count + ')' : ''),
          dot: GROUP_COLORS[group.color] || GROUP_COLORS.grey,
          action: () => send({ type: 'group', tabIds: ids, groupId: group.id })
        });
      }
    }
    menu.push({ sep: true }, { label: 'New group…', action: () => {
      send({ type: 'group', tabIds: ids }).then((result) => {
        if (result && Number.isInteger(result.groupId)) promptText('Name the new group', '', (title) => {
          send({ type: 'groupSet', groupId: result.groupId, title });
        });
      });
    }});
    return menu;
  }

  function groupActions(gid) {
    if (!(gid >= 0)) return [];
    const current = data.groups[gid] || {};
    const colorItems = GROUP_COLOR_NAMES.map((name) => ({
      label: name[0].toUpperCase() + name.slice(1),
      dot: GROUP_COLORS[name],
      checked: current.color === name,
      action: () => send({ type: 'groupSet', groupId: gid, color: name })
    }));
    return [
      { label: 'Color group', sub: colorItems },
      { label: 'Rename group…', action: () => promptText('Rename group', current.title || '', (title) => send({ type: 'groupSet', groupId: gid, title })) },
      { label: 'Ungroup tabs', action: () => send({ type: 'tabop', op: 'ungroup', tabIds: [...selectedForMenu] }) }
    ];
  }

  let selectedForMenu = [];

  function siteKeyFor(tab) {
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.hostname;
    } catch (_) {}
    return 'tab:' + tab.id;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      (document.body || document.documentElement).appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) { return false; }
  }

  function showTabMenu(id, x, y) {
    if (!contextMenu) return;
    const ids = selected.has(id) ? orderedIds([...selected]) : [id];
    selectedForMenu = ids.slice();
    const found = ids.map(getTab).filter(Boolean);
    if (!found.length) return;
    const multiple = ids.length > 1;
    const s = multiple ? 's' : '';

    // "Mute site" applies to every open tab on the same site as the chosen tab(s).
    const keys = new Set(found.map((item) => siteKeyFor(item.tab)));
    const siteIds = [];
    for (const win of (data.windows || [])) {
      for (const tab of (win.tabs || [])) if (keys.has(siteKeyFor(tab))) siteIds.push(tab.id);
    }
    const siteMuted = allMuted(siteIds);

    // "Close other tabs" only looks at the window(s) the chosen tab(s) are in.
    // Like the browser's own menu, pinned tabs are left alone.
    const picked = new Set(ids);
    const winIds = new Set(found.map((item) => item.win.id));
    const others = [], toRight = [];
    for (const win of (data.windows || [])) {
      if (!winIds.has(win.id)) continue;
      let last = -1;
      win.tabs.forEach((tab, i) => { if (picked.has(tab.id)) last = i; });
      win.tabs.forEach((tab, i) => {
        if (picked.has(tab.id) || tab.pinned) return;
        others.push(tab.id);
        if (i > last) toRight.push(tab.id);
      });
    }

    const urls = found.map((item) => item.tab.url).filter(Boolean);
    const items = [];
    if (!multiple) {
      items.push({ label: 'New tab to the right', action: () => send({ type: 'tabop', op: 'newRight', tabIds: ids }) });
    }
    items.push(
      { label: 'Add tab' + s + ' to new group', action: () => send({ type: 'group', tabIds: ids }) },
      { label: 'Move tab' + s + ' to new window', action: () => send({ type: 'tabop', op: 'newWindow', tabIds: ids }) },
      { label: 'Bookmark tab' + s + '…', disabled: !urls.length, action: () => pickBookmarkFolder(ids, x, y) },
      { sep: true },
      { label: 'Copy URL', disabled: !urls.length, action: () => copyText(urls.join('\n')) },
      { label: 'Reload', action: () => send({ type: 'tabop', op: 'reload', tabIds: ids }) },
      { label: 'Duplicate', action: () => send({ type: 'tabop', op: 'duplicate', tabIds: ids }) },
      { label: allPinned(ids) ? 'Unpin' : 'Pin', action: () => send({ type: 'tabop', op: 'pin', tabIds: ids, value: !allPinned(ids) }) },
      { label: (siteMuted ? 'Unmute site' : 'Mute site') + s, action: () => send({ type: 'tabop', op: 'mute', tabIds: siteIds, value: !siteMuted }) },
      { sep: true },
      { label: 'Close', danger: true, action: () => closeTabs(ids) },
      { label: 'Close other tabs', danger: true, disabled: !others.length, action: () => closeTabs(others) },
      { label: 'Close other tabs to the right', danger: true, disabled: !toRight.length, action: () => closeTabs(toRight) }
    );
    contextMenu.showContext(items, x, y);
  }

  function showGroupMenu(groupId, x, y) {
    const group = data.groups[groupId];
    if (!group || !contextMenu) return;
    contextMenu.showContext([
      { label: 'Color group', sub: GROUP_COLOR_NAMES.map((name) => ({ label: name[0].toUpperCase() + name.slice(1), dot: GROUP_COLORS[name], checked: group.color === name, action: () => send({ type: 'groupSet', groupId, color: name }) })) },
      { label: 'Rename group…', action: () => promptText('Rename group', group.title || '', (title) => send({ type: 'groupSet', groupId, title })) },
      { label: 'Ungroup tabs', action: async () => {
        const ids = [];
        for (const win of data.windows) for (const tab of win.tabs) if (tab.groupId === groupId) ids.push(tab.id);
        await send({ type: 'tabop', op: 'ungroup', tabIds: ids });
      } }
    ], x, y);
  }

  async function getReopenMenuItem() {
    const info = await send({ type: 'recentClosedInfo' });
    const kind = info && info.kind;
    return {
      label: kind === 'window' ? 'Reopen closed windows' : 'Reopen closed tabs',
      shortcut: 'Ctrl+Shift+T',
      disabled: !kind,
      action: () => send(info && info.sessionId
        ? { type: 'restoreSession', sessionId: info.sessionId }
        : { type: 'restoreLastClosed' })
    };
  }

  function toggleBookmarkPanel() {
    settings.bookmarks = !settings.bookmarks;
    saveSettings();
    update();
  }

  async function showOverlayMenu(windowId, x, y) {
    if (!contextMenu) return;
    const reopen = await getReopenMenuItem();
    // In "Current window only" there is no window header to right-click, so the
    // strip's own menu is the place to name the current browser window.
    const horizontalRail = !isBox() && !isVertical();
    const compactHorizontal = horizontalRail && settings.horizontalWindows !== 'all';
    const current = compactHorizontal
      ? (data.windows || []).find((win) => win.id === (Number.isInteger(windowId) ? windowId : data.cur))
      : null;
    const items = [
      { label: 'New tab', shortcut: 'Ctrl+T', action: () => send({ type: 'newTab', windowId }) },
      { label: 'New window', shortcut: 'Ctrl+N', action: () => send({ type: 'newWindow' }) },
      reopen
    ];
    if (current) {
      items.push({ sep: true });
      items.push({
        label: 'Name this window',
        action: () => promptText('Name window', current.name || '', (name) => send({ type: 'renameWindow', windowId: current.id, name }))
      });
    }
    items.push({ sep: true });
    if (horizontalRail) {
      items.push({
        label: settings.horizontalWindows === 'all'
          ? 'Show tabs from this window only'
          : 'Show tabs from all windows',
        action: toggleHorizontalWindowsMode
      });
      items.push({ sep: true });
    }
    items.push(
      { label: settings.bookmarks ? 'Hide bookmark bar' : 'Show bookmark bar', action: toggleBookmarkPanel },
      { label: 'Settings', action: () => openSettingsCard() }
    );
    contextMenu.showContext(items, x, y);
  }

  async function showWindowMenu(windowId, x, y, fromWinPop = false) {
    const win = (data.windows || []).find((item) => item.id === windowId);
    if (!win || !contextMenu) return;
    const reopen = await getReopenMenuItem();
    const isCollapsed = fromWinPop
      ? isWinPopWindowCollapsed(windowId)
      : !!collapsed[collapseKey('w' + windowId)];
    contextMenu.showContext([
      { label: 'New tab', shortcut: 'Ctrl+T', action: () => send({ type: 'newTab', windowId }) },
      reopen,
      { label: 'Bookmark all tabs…', shortcut: 'Ctrl+Shift+D', disabled: !win.tabs.length, action: () => pickBookmarkFolder(win.tabs.map((tab) => tab.id)) },
      { sep: true },
      { label: 'Name window…', action: () => promptText('Name window', win.name || '', (name) => send({ type: 'renameWindow', windowId, name })) },
      {
        label: isCollapsed ? 'Expand' : 'Collapse',
        action: () => fromWinPop ? toggleWinPopCollapse(windowId) : toggleCollapse('w' + windowId)
      },
      { sep: true },
      { label: 'Close', shortcut: 'Alt+F4', danger: true, action: () => send({ type: 'closeWindow', windowId }) }
    ], x, y);
  }

  async function closeTabs(ids) {
    const ordered = orderedIds(ids);
    if (!ordered.length) return;
    await send({ type: 'close', tabIds: ordered });
    selected.clear();
    render();
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipTimer = 0;
    if (tipEl) tipEl.style.display = 'none';
  }

  function tabTooltipSide(node) {
    const popover = node && node.closest && node.closest('.winpop');
    if (popover) {
      const r = popover.getBoundingClientRect();
      return r.left + r.width / 2 < vw() / 2 ? 'right' : 'left';
    }
    if (isBox()) {
      const r = els.panel && els.panel.getBoundingClientRect();
      return r && r.left + r.width / 2 < vw() / 2 ? 'right' : 'left';
    }
    if (isVertical()) return settings.edge === 'left' ? 'right' : 'left';
    return settings.edge === 'bottom' ? 'above' : 'below';
  }

  function showTip(rect, title, detail = '', preferredSide = '') {
    if (!tipEl) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      const first = tipEl.querySelector('.t1'), second = tipEl.querySelector('.t2');
      first.textContent = title || '';
      second.textContent = detail || '';
      second.style.display = detail ? '' : 'none';
      tipEl.style.display = 'block';
      tipEl.style.left = '0px';
      tipEl.style.top = '0px';
      const tr = tipEl.getBoundingClientRect();
      const panelRect = els.panel?.getBoundingClientRect() || { left: 0, right: 0, top: 0, bottom: 0 };
      let x, y;
      const side = preferredSide || ({ left: 'right', right: 'left', top: 'below', bottom: 'above' })[settings.edge];
      if (side === 'right') { x = rect.right + 8; y = rect.top + (rect.height - tr.height) / 2; }
      else if (side === 'left') { x = rect.left - tr.width - 8; y = rect.top + (rect.height - tr.height) / 2; }
      else if (side === 'below') { x = rect.left; y = rect.bottom + 8; }
      else { x = rect.left; y = rect.top - tr.height - 8; }
      x = fnClamp(x, 4, vw() - tr.width - 4);
      y = fnClamp(y, 4, vh() - tr.height - 4);
      tipEl.style.left = (x / u) + 'px';
      tipEl.style.top = (y / u) + 'px';
    }, 60);
  }

  function hoverable(el) {
    el.addEventListener('mouseenter', () => { keepPeekOpenAfterEscape = false; hoverPanel = true; clearClose(); });
    el.addEventListener('mouseleave', () => { hoverPanel = false; if (peek && !pinned) scheduleClose(); });
  }

  function openBookmark(url, where) {
    send({ type: 'openUrl', url, where: where || 'current' });
    if (where !== 'bg' && !pinned && !isBox()) closePeek();
  }

  let settingsCard = null;
  let renamePrompt = null;
  function openSettingsCard() {
    if (settingsCard) return;
    if (winPopOpen) closeWinPop();
    clearClose();
    // Avoid stacking the live editor's page shield behind the settings modal.
    hotZoneEditMode = false;
    placeHint();
    updateHintVisibility();
    const backdrop = h('div', 'backdrop');
    const card = h('div', 'card');
    const head = h('div', 'cardhead');
    const label = h('span', '', 'FullNav settings');
    const close = textBtn('btn', '×');
    close.title = 'Close settings';
    head.append(label, close);
    const frame = h('iframe', 'cardframe');
    frame.title = 'FullNav settings';
    frame.src = api.runtime.getURL('options.html?embed=1');
    card.append(head, frame);
    ui.append(backdrop, card);
    settingsCard = { backdrop, card, frame };
    updateResizeBuffer();
    const closeFn = () => closeSettingsCard();
    close.addEventListener('click', closeFn);
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) { e.preventDefault(); e.stopPropagation(); }
    });
    // Close on click, not mousedown: the backdrop remains present through the
    // complete click sequence, so the same click cannot activate the website.
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) { e.preventDefault(); e.stopPropagation(); closeFn(); }
    });
    backdrop.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    backdrop.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    card.addEventListener('mousedown', (e) => e.stopPropagation());
    frame.addEventListener('load', () => { try { frame.contentWindow.focus(); } catch (_) {} });
  }

  function closeSettingsCard() {
    if (!settingsCard) return;
    settingsCard.backdrop.remove();
    settingsCard.card.remove();
    settingsCard = null;
    updateResizeBuffer();
    if (peek && !pinned && !isBox()) scheduleClose();
    schedulePinnedWinPop();
  }

  function closePrompt() {
    if (!renamePrompt) return;
    renamePrompt.backdrop.remove();
    renamePrompt.prompt.remove();
    renamePrompt = null;
    if (peek && !pinned && !isBox()) scheduleClose();
  }

  function promptText(title, value, callback) {
    closePrompt();
    clearClose();
    const backdrop = h('div', 'backdrop');
    const prompt = h('div', 'prompt');
    const label = h('div', 'ptitle', title);
    const input = h('input', 'search pfield');
    input.type = 'text';
    input.value = value || '';
    input.maxLength = 80;
    const row = h('div', 'prow');
    const cancel = textBtn('tbtn', 'Cancel');
    const ok = textBtn('tbtn ok', 'Save');
    row.append(cancel, ok);
    prompt.append(label, input, row);
    ui.append(backdrop, prompt);
    renamePrompt = { backdrop, prompt, input };
    const close = () => closePrompt();
    const save = () => {
      const answer = input.value.trim();
      closePrompt();
      callback(answer);
    };
    cancel.addEventListener('click', close);
    ok.addEventListener('click', save);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) { e.preventDefault(); e.stopPropagation(); }
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    backdrop.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    backdrop.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }


  function setFolderIcon(id, patch) {
    const next = { ...folderIcons };
    if (patch === null) delete next[id];
    else {
      const merged = { ...(next[id] || {}), ...patch };
      for (const k of Object.keys(merged)) if (merged[k] == null || merged[k] === '') delete merged[k];
      if (Object.keys(merged).length) next[id] = merged; else delete next[id];
    }
    folderIcons = next;
    try { api.storage.local.set({ bmFolderIcons: next }); } catch (_) {}
    if (bookmarks) bookmarks.refreshIcons();
  }

  // Separate popup for choosing a bookmark folder's icon. Changes apply live and
  // the popup stays open until Done, Escape, or a click outside it.
  function pickFolderIcon(o) {
    closePrompt();
    clearClose();
    const backdrop = h('div', 'backdrop');
    backdrop.style.background = 'transparent';
    const prompt = h('div', 'prompt fip');
    const heading = h('div', 'ptitle', 'Folder icon' + (o.name ? ': ' + o.name : ''));
    const cur = () => folderIcons[o.id] || {};

    const colorRow = h('div', 'fip-row');
    const swatches = [];
    const defSw = h('button', 'fip-sw fip-def');
    defSw.type = 'button'; defSw.title = 'Default color';
    defSw.addEventListener('click', () => { setFolderIcon(o.id, { color: null }); sync(); });
    colorRow.appendChild(defSw);
    swatches.push([defSw, null]);
    for (const [name, hex] of o.colors) {
      const b = h('button', 'fip-sw');
      b.type = 'button'; b.title = name; b.style.background = hex;
      b.addEventListener('click', () => { setFolderIcon(o.id, { color: hex }); sync(); });
      colorRow.appendChild(b);
      swatches.push([b, hex]);
    }

    const glyphRow = h('div', 'fip-row');
    const glyphBtns = [];
    const mkGlyph = (key, name, d) => {
      const b = h('button', 'fip-gl');
      b.type = 'button'; b.title = name;
      b.appendChild(o.svgIcon(d));
      b.addEventListener('click', () => { setFolderIcon(o.id, { glyph: key, emoji: null }); sync(); });
      glyphRow.appendChild(b);
      glyphBtns.push([b, key]);
    };
    mkGlyph(null, 'Folder', o.shape);
    for (const [key, [name, d]] of Object.entries(o.glyphs)) mkGlyph(key, name, d);

    const emoji = h('input', 'search pfield');
    emoji.type = 'text';
    emoji.placeholder = 'Emoji or a letter';
    emoji.maxLength = 8;
    emoji.addEventListener('input', () => {
      const t = Array.from(emoji.value.trim()).slice(0, 2).join('');
      setFolderIcon(o.id, t ? { emoji: t, glyph: null } : { emoji: null });
      sync(true);
    });
    emoji.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); closePrompt(); }
    });

    function sync(typing) {
      const c = cur();
      swatches.forEach(([b, hex]) => b.classList.toggle('on', (c.color || null) === hex));
      glyphBtns.forEach(([b, key]) => {
        b.classList.toggle('on', !c.emoji && (c.glyph || null) === key);
        b.style.color = c.color || '';
      });
      if (!typing && emoji.value !== (c.emoji || '')) emoji.value = c.emoji || '';
    }

    const row = h('div', 'prow');
    const reset = textBtn('tbtn', 'Reset');
    const done = textBtn('tbtn ok', 'Done');
    reset.addEventListener('click', () => { setFolderIcon(o.id, null); sync(); });
    done.addEventListener('click', () => closePrompt());
    row.append(reset, done);
    prompt.append(heading, h('div', 'fip-label', 'Color'), colorRow, h('div', 'fip-label', 'Symbol'), glyphRow, h('div', 'fip-label', 'Emoji'), emoji, row);
    ui.append(backdrop, prompt);
    renamePrompt = { backdrop, prompt, input: emoji };
    sync();

    // Sit beside the folder that was clicked so the change is visible while picking.
    const r = o.anchor;
    if (r) {
      const width = 300 * u, vwp = window.innerWidth, vhp = window.innerHeight;
      let left = r.right + 10 * u;
      if (left + width > vwp - 8) left = Math.max(8, r.left - width - 10 * u);
      const top = Math.max(8, Math.min(r.top, vhp - 380 * u));
      prompt.style.transform = 'none';
      prompt.style.left = (left / u) + 'px';
      prompt.style.top = (top / u) + 'px';
    }
    backdrop.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); closePrompt(); });
    backdrop.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    backdrop.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
  }

  // Folder chooser for bookmarking tabs (the browser's own dialog is not available
  // to extensions): pick any bookmark folder, optionally make a new one.
  async function pickBookmarkFolder(tabIds, x, y) {
    const found = tabIds.map(getTab).filter(Boolean);
    if (!found.length) return;
    const tree = await send({ type: 'bmTree' });
    if (!tree) return;
    closePrompt();
    clearClose();
    const multiple = found.length > 1;
    const backdrop = h('div', 'backdrop');
    const prompt = h('div', 'prompt bmpick');
    const heading = h('div', 'ptitle', multiple ? 'Bookmark ' + found.length + ' tabs' : 'Bookmark tab');
    const nameInput = h('input', 'search');
    nameInput.type = 'text';
    nameInput.maxLength = 255;
    let useFolder = null;
    if (multiple) {
      nameInput.value = 'Saved tabs ' + new Date().toLocaleDateString();
      const wrap = h('label', 'bp-check');
      useFolder = h('input');
      useFolder.type = 'checkbox';
      useFolder.checked = true;
      wrap.append(useFolder, h('span', '', 'Put them in a new folder named:'));
      useFolder.addEventListener('change', () => { nameInput.disabled = !useFolder.checked; });
      prompt.append(heading, wrap, nameInput);
    } else {
      nameInput.value = found[0].tab.title || found[0].tab.url || '';
      const lab = h('label', 'bookmark-field', 'Name');
      lab.appendChild(nameInput);
      prompt.append(heading, lab);
    }

    const roots = [{ id: tree.barId, title: 'Bookmarks bar', children: tree.bar || [] }];
    if (tree.otherId) roots.push({ id: tree.otherId, title: 'Other bookmarks', children: tree.other || [] });
    let selectedId = null;
    try { selectedId = (await api.storage.local.get('bmLastFolder')).bmLastFolder || null; } catch (_) {}
    const folderIds = new Set();
    const collect = (nodes) => { for (const n of nodes) if (n.children) { folderIds.add(String(n.id)); collect(n.children); } };
    collect(roots);
    if (!selectedId || !folderIds.has(String(selectedId))) selectedId = roots[0].id;
    selectedId = String(selectedId);
    const expanded = new Set(roots.map((r) => String(r.id)));
    const parentOf = new Map();
    const index = (nodes, parent) => { for (const n of nodes) if (n.children) { parentOf.set(String(n.id), parent); index(n.children, String(n.id)); } };
    roots.forEach((r) => { parentOf.set(String(r.id), null); index(r.children, String(r.id)); });
    for (let p = parentOf.get(selectedId); p; p = parentOf.get(p)) expanded.add(p);

    const list = h('div', 'bp-list');
    const FOLDER = 'M10 4H3.5A1.5 1.5 0 0 0 2 5.5v13A1.5 1.5 0 0 0 3.5 20h17a1.5 1.5 0 0 0 1.5-1.5V8a1.5 1.5 0 0 0-1.5-1.5H12z';
    function drawTree() {
      list.replaceChildren();
      const walk = (nodes, depth) => {
        for (const n of nodes) {
          if (!n.children) continue;
          const id = String(n.id);
          const row = h('div', 'bp-row' + (id === selectedId ? ' on' : ''));
          row.style.paddingLeft = (6 + depth * 14) + 'px';
          const kids = n.children.some((c) => c.children);
          const chev = h('span', 'bp-chev');
          if (kids) {
            chev.appendChild(svg(ICON_CHEV));
            chev.classList.toggle('open', expanded.has(id));
            chev.addEventListener('click', (e) => {
              e.stopPropagation();
              if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
              drawTree();
            });
          }
          const ico = h('span', 'bp-ico');
          ico.appendChild(svg(FOLDER));
          row.append(chev, ico, h('span', 'bp-name', n.title || 'Folder'));
          row.addEventListener('click', () => { selectedId = id; drawTree(); });
          row.addEventListener('dblclick', () => { if (kids) { if (expanded.has(id)) expanded.delete(id); else expanded.add(id); drawTree(); } });
          list.appendChild(row);
          if (kids && expanded.has(id)) walk(n.children, depth + 1);
        }
      };
      walk(roots, 0);
      const on = list.querySelector('.bp-row.on');
      if (on) on.scrollIntoView({ block: 'nearest' });
    }
    drawTree();

    // New folder inside the selected one.
    const newRow = h('div', 'bp-new');
    const newBtn = textBtn('tbtn', 'New folder');
    const newInput = h('input', 'search');
    newInput.type = 'text';
    newInput.placeholder = 'Folder name, then Enter';
    newInput.maxLength = 120;
    newInput.style.display = 'none';
    newRow.append(newBtn, newInput);
    newBtn.addEventListener('click', () => {
      newBtn.style.display = 'none';
      newInput.style.display = '';
      newInput.focus();
    });
    newInput.addEventListener('keydown', async (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); newInput.value = ''; newInput.style.display = 'none'; newBtn.style.display = ''; return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const name = newInput.value.trim();
      if (!name) return;
      const result = await send({ type: 'bookmarkAction', op: 'createFolder', parentId: selectedId, title: name });
      if (!(result && result.ok && result.id)) return;
      const fresh = await send({ type: 'bmTree' });
      if (fresh) {
        roots[0].children = fresh.bar || [];
        if (roots[1]) roots[1].children = fresh.other || [];
        parentOf.clear();
        roots.forEach((r) => { parentOf.set(String(r.id), null); index(r.children, String(r.id)); });
      }
      expanded.add(selectedId);
      selectedId = String(result.id);
      newInput.value = '';
      newInput.style.display = 'none';
      newBtn.style.display = '';
      drawTree();
      if (bookmarks) bookmarks.refresh();
    });

    const row = h('div', 'prow');
    const cancel = textBtn('tbtn', 'Cancel');
    const ok = textBtn('tbtn ok', 'Save');
    row.append(cancel, ok);
    prompt.append(h('div', 'fip-label', 'Folder'), list, newRow, row);
    ui.append(backdrop, prompt);
    renamePrompt = { backdrop, prompt, input: nameInput };

    const save = async () => {
      const message = { type: 'tabop', op: 'bookmark', tabIds, parentId: selectedId };
      if (multiple) { if (useFolder.checked) message.folderName = nameInput.value.trim(); }
      else message.title = nameInput.value.trim();
      closePrompt();
      try { api.storage.local.set({ bmLastFolder: selectedId }); } catch (_) {}
      await send(message);
      if (bookmarks) bookmarks.refresh();
    };
    cancel.addEventListener('click', () => closePrompt());
    ok.addEventListener('click', save);
    nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); closePrompt(); }
    });
    backdrop.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); closePrompt(); });
    backdrop.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    backdrop.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    requestAnimationFrame(() => { if (!nameInput.disabled) { nameInput.focus(); nameInput.select(); } });
  }

  function promptBookmarkEditor(title, initialName, initialUrl, withUrl, callback) {
    closePrompt();
    clearClose();
    const backdrop = h('div', 'backdrop');
    const prompt = h('div', 'prompt bookmark-prompt');
    const heading = h('div', 'ptitle', title);
    const nameLabel = h('label', 'bookmark-field', 'Name');
    const nameInput = h('input', 'search');
    nameInput.type = 'text';
    nameInput.value = initialName || '';
    nameInput.maxLength = 255;
    nameLabel.appendChild(nameInput);
    prompt.append(heading, nameLabel);
    let urlInput = null;
    if (withUrl) {
      const urlLabel = h('label', 'bookmark-field', 'URL');
      urlInput = h('input', 'search');
      urlInput.type = 'url';
      urlInput.value = initialUrl || '';
      urlInput.maxLength = 4096;
      urlLabel.appendChild(urlInput);
      prompt.appendChild(urlLabel);
    }
    const row = h('div', 'prow');
    const cancel = textBtn('tbtn', 'Cancel');
    const save = textBtn('tbtn ok', 'Save');
    row.append(cancel, save);
    prompt.appendChild(row);
    ui.append(backdrop, prompt);
    renamePrompt = { backdrop, prompt, input: nameInput };
    const close = () => closePrompt();
    const submit = () => {
      const url = urlInput ? urlInput.value.trim() : undefined;
      if (withUrl && !url) { urlInput.focus(); return; }
      const values = { title: nameInput.value.trim() };
      if (withUrl) values.url = url;
      closePrompt();
      callback(values);
    };
    cancel.addEventListener('click', close);
    save.addEventListener('click', submit);
    for (const input of [nameInput, urlInput].filter(Boolean)) {
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); close(); }
      });
    }
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) { e.preventDefault(); e.stopPropagation(); }
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    backdrop.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    backdrop.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    requestAnimationFrame(() => { nameInput.focus(); nameInput.select(); });
  }

  function openBookmarkEditor(node) {
    if (!node) return;
    promptBookmarkEditor(
      node.url ? 'Edit bookmark' : 'Edit folder',
      node.title || '',
      node.url || '',
      !!node.url,
      async (values) => {
        const message = { type: 'bookmarkAction', op: 'update', id: node.id, title: values.title };
        if (typeof values.url === 'string') message.url = values.url;
        const result = await send(message);
        if (result && result.ok && bookmarks) bookmarks.refresh();
      }
    );
  }

  function addBookmarkFromPanel(kind, parentId) {
    if (kind === 'page') {
      const currentUrl = /^(https?:|file:)/i.test(location.href) ? location.href : '';
      promptBookmarkEditor('Add page', document.title || '', currentUrl, true, async (values) => {
        const result = await send({
          type: 'bookmarkAction', op: 'createPage', parentId,
          title: values.title, url: values.url
        });
        if (result && result.ok && bookmarks) bookmarks.refresh();
      });
      return;
    }
    promptText('Add folder', '', async (name) => {
      if (!name) return;
      const result = await send({ type: 'bookmarkAction', op: 'createFolder', parentId, title: name });
      if (result && result.ok && bookmarks) bookmarks.refresh();
    });
  }

  // ---------- push mode ----------
  // A docked overlay can reserve space on more than one side: a vertical panel
  // with a horizontal bookmark bar needs both its width and the bar's height.
  const pushParts = () => {
    if (!(shown && pinned && pushHere())) return [];
    const parts = [];
    const extra = bookmarks && typeof bookmarks.thickness === 'function' ? bookmarks.thickness() * u : 0;
    parts.push({ dir: settings.edge, px: (isVertical() ? settings.panelWidth : settings.barHeight) * u + extra });
    if (bookmarks && isVertical() && settings.bookmarks && ['top', 'bottom'].includes(settings.floatingBookmarksEdge || 'auto')) {
      // The bookmark bar is not part of the sidebar's width in this layout; it
      // spans the viewport at the top or bottom, so the page needs that room too.
      parts.push({ dir: settings.floatingBookmarksEdge, px: FLOATING_BOOKMARK_BAR_HEIGHT * u });
    }
    return parts;
  };

  function syncPush(animate) {
    if (!globalThis.FNX || !globalThis.FNX.push) return;
    const parts = pushParts();
    if (parts.length) FNX.push.on(parts, animate);
    else FNX.push.off(animate);
  }

  // ---------- layout ----------
  function measure() {
    if (!hostEl) return;
    const d = document.documentElement;
    const set = (k, v) => hostEl.style.setProperty(k, v + 'px');
    set('--sbv', Math.max(0, Math.round(window.innerWidth - d.clientWidth)) / u);
    set('--sbh', Math.max(0, Math.round(window.innerHeight - d.clientHeight)) / u);
    set('--pw', d.clientWidth / u);
    set('--ph', d.clientHeight / u);
  }

  function applyUnit() {
    if (!hostEl) return;
    hostEl.style.setProperty('--u', String(u));
    measure();
    placeHint();
    applyGeometry();
  }

  function currentWidthUnits() {
    if (!isVertical() && !isBox()) return 9999;
    return isBox() && settings.winRect ? settings.winRect.w : settings.panelWidth;
  }

  function minimumWindowedHeightUnits() {
    const ph = vh() / u;
    const screenH = Math.max(1, Number(window.screen && window.screen.height) || vh());
    const requested = (screenH * 0.35) / u;
    // Keep the minimum at 35% of screen height, except when the visible
    // browser viewport physically cannot accommodate that height.
    return Math.min(Math.max(80, requested), Math.max(80, ph - 12));
  }

  function ensureWindowRect() {
    if (settings.winRect) return settings.winRect;
    const pw = vw() / u, ph = vh() / u;
    // Base the initial window size on the screen dimensions rather than the
    // current browser viewport; cap it only if the viewport cannot fit it.
    const screenW = Math.max(1, Number(window.screen && window.screen.width) || vw());
    const screenH = Math.max(1, Number(window.screen && window.screen.height) || vh());
    const w = fnClamp((screenW * 0.30) / u, 220, Math.max(220, pw - 24));
    const minH = minimumWindowedHeightUnits();
    const h0 = fnClamp((screenH * 0.35) / u, minH, Math.max(minH, ph - 24));
    const x = settings.edge === 'right' ? Math.max(12, pw - w - 12) : settings.edge === 'left' ? 12 : fnClamp((pw - w) / 2, 12, Math.max(12, pw - w - 12));
    const y = settings.edge === 'bottom' ? Math.max(12, ph - h0 - 12) : settings.edge === 'top' ? 12 : fnClamp((ph - h0) / 3, 12, Math.max(12, ph - h0 - 12));
    settings.winRect = { x, y, w, h: h0 };
    return settings.winRect;
  }

  // Clear the offset used by the previous implementation. Windowed bookmarks
  // now sit on the viewport edge and never reserve space by moving the overlay.
  function syncFloatingBookmarkLayout() {
    const stored = settings.floatingBookmarksDockOffset;
    const current = Number.isFinite(stored) ? stored : 0;
    const changed = !Number.isFinite(stored) || Math.abs(current) > 0.1;
    if (Math.abs(current) > 0.1 && settings.winRect) {
      const rect = settings.winRect;
      const ph = vh() / u;
      rect.y = fnClamp(rect.y - current, 0, Math.max(0, ph - rect.h));
      settings.winRect = rect;
    }
    settings.floatingBookmarksDockOffset = 0;
    return changed;
  }

  function searchWidthUnits() {
    if (isBox() && settings.winRect) return settings.winRect.w;
    if (isVertical()) return settings.panelWidth;
    return vw() / u;
  }

  function positionSearchPopup() {
    if (!searchPopupOpen || !els.searchWrap || !els.searchToggle) return;
    const anchor = els.searchToggle.getBoundingClientRect();
    const viewportW = document.documentElement.clientWidth || window.innerWidth;
    const viewportH = document.documentElement.clientHeight || window.innerHeight;
    const width = Math.max(100, Math.min(210, viewportW - 16));
    let left;
    let top;
    if (isBox()) {
      const panelRect = els.panel.getBoundingClientRect();
      left = panelRect.right + 6 + width <= viewportW - 8 ? panelRect.right + 6 : panelRect.left - width - 6;
      top = anchor.top + (anchor.height - 32) / 2;
    } else {
      if (settings.edge === 'right') left = anchor.left - width - 6;
      else if (settings.edge === 'left') left = anchor.right + 6;
      else left = anchor.left;
      if (settings.edge === 'top') top = anchor.bottom + 5;
      else if (settings.edge === 'bottom') top = anchor.top - 37;
      else top = anchor.top + (anchor.height - 32) / 2;
    }
    left = fnClamp(left, 8, Math.max(8, viewportW - width - 8));
    top = fnClamp(top, 8, Math.max(8, viewportH - 40));
    els.searchWrap.style.width = width + 'px';
    els.searchWrap.style.left = left + 'px';
    els.searchWrap.style.top = top + 'px';
  }

  function updateSearchClearButton() {
    if (!els.searchWrap || !els.search) return;
    const hasValue = !!els.search.value;
    els.searchWrap.classList.toggle('has-value', hasValue);
    if (els.searchClear) {
      els.searchClear.hidden = !hasValue;
      els.searchClear.setAttribute('aria-hidden', String(!hasValue));
    }
  }

  function clearSearchInput(keepFocus = true) {
    if (!els.search) return;
    els.search.value = '';
    filter = '';
    selId = null;
    anchorId = null;
    scrollSel = false;
    render();
    updateSearchClearButton();
    if (keepFocus) {
      try { els.search.focus({ preventScroll: true }); } catch (_) { try { els.search.focus(); } catch (_) {} }
    }
  }

  function closeSearchPopup(focusToggle = false) {
    if (!els.searchWrap || !els.searchRow) return;
    searchPopupOpen = false;
    els.searchWrap.classList.remove('search-popup');
    els.searchWrap.style.left = '';
    els.searchWrap.style.top = '';
    els.searchWrap.style.width = '';
    if (els.searchWrap.parentNode !== els.searchRow) els.searchRow.appendChild(els.searchWrap);
    if (focusToggle && els.searchToggle) els.searchToggle.focus();
    schedulePinnedWinPop();
  }

  function openSearchPopup() {
    if (!settings.showSearch || !els.searchWrap || !ui) return;
    if (winPopOpen) closeWinPop();
    searchPopupOpen = true;
    els.searchWrap.classList.add('search-popup');
    ui.appendChild(els.searchWrap);
    els.searchWrap.style.display = '';
    positionSearchPopup();
    requestAnimationFrame(() => {
      if (!searchPopupOpen || !els.search) return;
      els.search.focus();
      try { const n = els.search.value.length; els.search.setSelectionRange(n, n); } catch (_) {}
    });
  }

  function updateSearchLayout() {
    if (!els.searchRow || !els.searchWrap) return;
    const width = searchWidthUnits();
    const mode = !settings.showSearch ? 'off' : width >= 170 ? 'inline' : width >= 104 ? 'icon' : 'popover';
    els.searchRow.dataset.mode = mode;
    if (!settings.showSearch || mode === 'inline') {
      if (searchPopupOpen) closeSearchPopup(false);
    } else if (searchPopupOpen) {
      if (els.searchWrap.parentNode !== ui) ui.appendChild(els.searchWrap);
      els.searchWrap.classList.add('search-popup');
      positionSearchPopup();
    } else if (els.searchWrap.parentNode !== els.searchRow) {
      els.searchWrap.classList.remove('search-popup');
      els.searchWrap.style.left = '';
      els.searchWrap.style.top = '';
      els.searchWrap.style.width = '';
      els.searchRow.appendChild(els.searchWrap);
    }
    if (els.searchToggle) els.searchToggle.setAttribute('aria-expanded', String(searchPopupOpen));
  }

  function applyGeometry() {
    if (!els.panel) return;
    const s = settings, panel = els.panel;
    hostEl.style.setProperty('--w', s.panelWidth + 'px');
    hostEl.style.setProperty('--h', s.barHeight + 'px');
    if (isBox()) {
      const pw = vw() / u, ph = vh() / u;
      const rect = ensureWindowRect();
      const w = fnClamp(rect.w, 52, Math.max(52, pw - 12));
      const minH = minimumWindowedHeightUnits();
      const hh = fnClamp(rect.h, minH, Math.max(minH, ph - 12));
      const x = fnClamp(rect.x, 0, Math.max(0, pw - w));
      const y = fnClamp(rect.y, 0, Math.max(0, ph - hh));
      settings.winRect = { x, y, w, h: hh };
      for (const [key, value] of [['--bx', x], ['--by', y], ['--bw', w], ['--bh', hh]]) hostEl.style.setProperty(key, value + 'px');
    }
    panel.dataset.side = isBox() ? 'start' : (s.edge === 'right' ? 'end' : 'start');
    panel.dataset.dir = (isBox() || isVertical()) ? 'v' : 'h';
    syncOverlayCollapsedState();
    panel.classList.toggle('resizing', resizing);
    const compact = currentWidthUnits() < COMPACT_BELOW;
    panel.classList.toggle('compact', compact);
    panel.classList.toggle('icons', compact || !s.showNames);
    syncWinButton();
    updateRailDensity();
    if (winPopOpen) positionWinPop();
    const sizeBadge = els.sizeBadge;
    if (sizeBadge && isBox()) sizeBadge.textContent = Math.round((settings.winRect?.w || 0)) + ' × ' + Math.round((settings.winRect?.h || 0));
    updateSearchLayout();
    updateResizeBuffer();
  }

  // Collapse is a size state, not a separate mode. Horizontal rails are a
  // fixed strip with no expand/collapse state.
  function isOverlayCollapsed() {
    if (isBox()) return (settings.winRect?.w ?? settings.panelWidth ?? 360) <= 60;
    if (isVertical()) return Number(settings.panelWidth) <= 60;
    return false;
  }

  function syncOverlayToggle() {
    if (!els.overlayToggle) return;
    const collapsed = isOverlayCollapsed();
    const path = els.overlayToggle.querySelector('path');
    if (path) path.setAttribute('d', collapsed ? ICON_OVERLAY_EXPAND : ICON_OVERLAY_COLLAPSE);
    const label = collapsed ? 'Expand overlay' : 'Collapse overlay';
    els.overlayToggle.title = label;
    els.overlayToggle.setAttribute('aria-label', label);
    els.overlayToggle.setAttribute('aria-expanded', String(!collapsed));
    els.overlayToggle.setAttribute('aria-pressed', String(collapsed));
  }

  function syncOverlayCollapsedState() {
    if (els.panel) els.panel.classList.toggle('overlay-collapsed', isOverlayCollapsed());
    syncOverlayToggle();
  }

  function toggleOverlayCollapsed() {
    // Horizontal rails have no expanded state; the height slider and the edge
    // resize grip still control the strip thickness.
    if (!isBox() && !isVertical()) return;
    const collapsed = isOverlayCollapsed();
    const viewportWidth = vw() / u;

    if (isBox()) {
      const rect = ensureWindowRect();
      if (collapsed) {
        const maxWidth = Math.min(800, Math.max(52, viewportWidth - 12));
        const width = fnClamp(Math.round(viewportWidth * 0.15), 52, maxWidth);
        const right = rect.x + rect.w;
        const x = settings.edge === 'right' ? right - width : rect.x;
        settings.winRect = {
          ...rect,
          x: fnClamp(x, 0, Math.max(0, viewportWidth - width)),
          w: width
        };
      } else {
        const width = 52;
        const right = rect.x + rect.w;
        const x = settings.edge === 'right' ? right - width : rect.x;
        settings.winRect = {
          ...rect,
          x: fnClamp(x, 0, Math.max(0, viewportWidth - width)),
          w: width
        };
      }
    } else if (isVertical()) {
      settings.panelWidth = collapsed
        ? fnClamp(Math.round(viewportWidth * 0.15), 52, 800)
        : 52;
    }

    saveSettings();
    applyGeometry();
    update(true);
  }

  function update(instant) {
    if (dead || !els.panel) return;
    const bookmarkLayoutChanged = syncFloatingBookmarkLayout();
    if (bookmarkLayoutChanged) {
      saveSettings();
      applyGeometry();
    }
    if (!allowed()) peek = false;
    const wasShown = shown;
    const vis = wantVisible();
    if (vis && !shown) { needCenter = true; measure(); placeHint(); }
    shown = vis;
    els.panel.classList.toggle('hidden', !vis);
    if ((!vis || isBox() || isVertical() || settings.horizontalWindows === 'all') && winPopOpen) closeWinPop();
    syncOverlayCollapsedState();
    const bookmarkEdge = settings.floatingBookmarksEdge || 'auto';
    const windowedSideBookmarks = isBox() && !['top', 'bottom'].includes(bookmarkEdge);
    els.panel.classList.toggle('with-floating-bookmarks', !!(vis && settings.bookmarks && windowedSideBookmarks));
    const attachedBookmarksEdge = vis && settings.bookmarks
      && (windowedSideBookmarks || (!isBox() && isVertical() && ['top', 'bottom'].includes(bookmarkEdge)));
    for (const cls of ['bookmarks-left', 'bookmarks-top', 'bookmarks-bottom']) els.panel.classList.remove(cls);
    if (attachedBookmarksEdge && ['left', 'top', 'bottom'].includes(bookmarkEdge)) {
      els.panel.classList.add('bookmarks-' + bookmarkEdge);
    }
    updateResizeBuffer();
    if (ui) ui.dataset.theme = settings.theme;
    els.pin.setAttribute('aria-pressed', String(pinned));
    els.pin.title = pinned ? 'Unpin' : 'Pin open (stays visible when you switch tabs)';
    syncWinPopPin();
    if (els.bookmarkBtn) els.bookmarkBtn.setAttribute('aria-pressed', String(!!settings.bookmarks));
    updateHintVisibility();

    const needPort = vis && document.visibilityState === 'visible';
    if (needPort && !port) { connect(); refreshTabs(); }
    else if (!needPort && port) disconnect();
    if (bookmarks) {
      bookmarks.update();
      // Do not show the drawer at the panel's off-screen starting coordinates.
      // It becomes visible again as soon as the panel finishes sliding in.
      if (vis && !wasShown && !isBox() && !els.panel.classList.contains('no-anim')) {
        bookmarks.el.classList.add('pending-place');
      }
    }
    if (vis) schedulePinnedWinPop();
    syncPush(!instant);
  }

  // Optional theme colour: tints the overlay with shades of one colour, with a
  // deeper header, a lighter raised surface for menus/bookmarks, and tuned text.
  function applyThemeTint() {
    if (ui && typeof fnApplyPalette === 'function') fnApplyPalette(ui, settings, 'overlay');
  }
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => { if (!dead && settings.themeTint && settings.theme === 'auto') applyThemeTint(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);
  } catch (_) {}

  function applySettings(instant) {
    if (!els.panel) return;
    const s = settings, p = els.panel;
    p.dataset.edge = s.edge;
    p.dataset.dir = (isBox() || isVertical()) ? 'v' : 'h';
    p.dataset.style = s.style;
    p.dataset.align = fnAlign(s);
    p.dataset.theme = s.theme;
    // Reflow the edge button whenever switching between docked, horizontal,
    // and Windowed layouts (including a drag that changes the overlay style).
    applyToolbarOrder(false);
    hostEl.style.setProperty('--accent', s.accent);
    if (ui) ui.dataset.theme = s.theme;
    applyThemeTint();
    els.searchWrap.style.display = s.showSearch ? '' : 'none';
    els.searchRow.classList.toggle('nosearch', !s.showSearch);
    if (!s.showSearch && searchPopupOpen) closeSearchPopup(false);
    if (isBox()) hotZoneEditMode = false;
    applyUnit();
    render();
    update(instant);
  }

  // ---------- resizing ----------
  function startResize(e, handle) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    const startX = e.clientX, startY = e.clientY;
    const rect = els.panel.getBoundingClientRect();
    const start = { l: rect.left, t: rect.top, r: rect.right, b: rect.bottom };
    resizing = true;
    els.panel.classList.add('resizing');
    clearClose();

    const move = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!isBox()) {
        if (isVertical()) {
          const delta = settings.edge === 'left' ? dx : -dx;
          settings.panelWidth = Math.round(fnClamp((start.r - start.l + delta) / u, 52, 800));
        } else {
          const delta = settings.edge === 'top' ? dy : -dy;
          settings.barHeight = Math.round(fnClamp((start.b - start.t + delta) / u, 40, 400));
        }
      } else {
        let { l, t, r, b } = start;
        const minW = 52 * u, minH = minimumWindowedHeightUnits() * u, W = vw(), H = vh();
        if (handle.includes('e')) r = fnClamp(r + dx, l + minW, W);
        if (handle.includes('w')) l = fnClamp(l + dx, 0, r - minW);
        if (handle.includes('s')) b = fnClamp(b + dy, t + minH, H);
        if (handle.includes('n')) t = fnClamp(t + dy, 0, b - minH);
        settings.winRect = { x: l / u, y: t / u, w: (r - l) / u, h: (b - t) / u };
      }
      applyGeometry();
      if (bookmarks) bookmarks.update();
      syncPush(false);
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      resizing = false;
      els.panel.classList.remove('resizing');
      saveSettings();
      applyGeometry();
      update(true);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  function startOverlayDrag(e) {
    if (e.button !== 0) return;
    const target = e.target;
    const interactive = target && target.closest && target.closest(
      'button,input,textarea,select,a,.searchwrap,.rz,.edge-tools,.sizebadge,.menu,.submenu'
    );
    if (interactive) return;
    if (isBox()) startFloatingMove(e);
    else startDockDrag(e);
  }

  // Dock only when the pointer itself reaches the outermost 0.5% of the viewport.
  // Normalize distances by the relevant axis so corners resolve consistently.
  function snapEdgeAtPointer(x, y) {
    const width = vw(), height = vh();
    const candidates = [
      ['left', Math.max(0, x), width * 0.005],
      ['right', Math.max(0, width - x), width * 0.005],
      ['top', Math.max(0, y), height * 0.005],
      ['bottom', Math.max(0, height - y), height * 0.005]
    ].map(([edge, distance, limit]) => ({
      edge,
      ratio: distance / Math.max(1, limit)
    })).sort((a, b) => a.ratio - b.ratio);
    return candidates[0] && candidates[0].ratio <= 1 ? candidates[0].edge : null;
  }

  function startDockDrag(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    clearClose();
    const startX = e.clientX, startY = e.clientY;
    const r = els.panel.getBoundingClientRect();
    const origin = { x: r.left / u, y: r.top / u, w: r.width / u, h: r.height / u };
    // A docked panel can be viewport-height (left/right) or viewport-width
    // (top/bottom). Do not carry those dimensions into the floating preview:
    // turn it into a compact, landscape window as soon as the drag begins.
    const pw = vw() / u, ph = vh() / u;
    const dragW = Math.max(120, Math.min(420, pw - 16));
    const dragH = Math.max(120, Math.min(320, ph - 16));
    // Preserve the pointer's grab point, so the panel does not jump when its
    // docked dimensions are replaced by the smaller floating dimensions.
    const grabX = (startX - r.left) / u;
    const grabY = (startY - r.top) / u;
    let moved = false, snapEdge = null;
    dockDrag = { startX, startY };

    const positionWindow = (x, y) => {
      const xx = fnClamp(x, 0, Math.max(0, pw - dragW));
      const yy = fnClamp(y, 0, Math.max(0, ph - dragH));
      for (const [key, value] of [['--bx', xx], ['--by', yy], ['--bw', dragW], ['--bh', dragH]]) hostEl.style.setProperty(key, value + 'px');
      return { x: xx, y: yy, w: dragW, h: dragH };
    };
    let current = { ...origin };
    const edgeAt = snapEdgeAtPointer;
    const showSnap = (edge) => {
      snapEdge = edge;
      if (!els.snap) return;
      if (!edge) { els.snap.style.display = 'none'; return; }
      const w = settings.panelWidth * u, hh = settings.barHeight * u;
      const styles = {
        left: { left: '0px', top: '0px', width: w + 'px', height: '100%' },
        right: { right: '0px', top: '0px', left: 'auto', width: w + 'px', height: '100%' },
        top: { left: '0px', top: '0px', width: '100%', height: hh + 'px' },
        bottom: { left: '0px', bottom: '0px', top: 'auto', width: '100%', height: hh + 'px' }
      };
      Object.assign(els.snap.style, { display: 'block', right: 'auto', bottom: 'auto', ...styles[edge] });
    };
    const move = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) {
        if (winPopOpen) closeWinPop();
        if (contextMenu && contextMenu.isOpen()) contextMenu.hide();
        hideTip();
      }
      moved = true;
      hotZoneEditMode = false;
      updateHintVisibility();
      placeHint();
      // Once the move threshold is crossed, replace the whole panel with a
      // tiny stacked-tabs icon that follows the pointer. The real panel stays
      // hidden underneath so release can still resolve to docked/windowed mode.
      els.panel.classList.add('moving', 'dragging-overlay');
      if (bookmarks) bookmarks.el.classList.add('dragging-overlay');
      els.panel.dataset.style = 'windowed';
      if (els.dragPreview) {
        els.dragPreview.style.display = 'grid';
        els.dragPreview.style.left = ev.clientX + 'px';
        els.dragPreview.style.top = ev.clientY + 'px';
      }
      current = positionWindow(ev.clientX / u - grabX, ev.clientY / u - grabY);
      showSnap(edgeAt(ev.clientX, ev.clientY));
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      els.panel.classList.remove('moving', 'dragging-overlay');
      if (bookmarks) bookmarks.el.classList.remove('dragging-overlay');
      if (els.dragPreview) els.dragPreview.style.display = 'none';
      if (els.snap) els.snap.style.display = 'none';
      dockDrag = null;
    };
    const up = (ev) => {
      cleanup();
      if (!moved) return;
      if (snapEdge) {
        settings.edge = snapEdge;
        settings.style = 'docked';
        settings.winRect = null;
      } else {
        // Floating mode requires being visible, but keep the last docked pin
        // preference intact so snapping back to an edge restores that state.
        settings.style = 'windowed';
        settings.winRect = current;
        pinned = true;
        peek = false;
        try { api.storage.local.set({ pinned: true, dockedPinned }); } catch (_) {}
      }
      hotZoneEditMode = false;
      updateHintVisibility();
      saveSettings();
      applySettings(true);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  function startFloatingMove(e) {
    if (!isBox() || e.button !== 0 || (e.target.closest && e.target.closest('button,input,.searchwrap,.rz,.edge-tools'))) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const rect = els.panel.getBoundingClientRect();
    const original = { x: rect.left / u, y: rect.top / u, w: rect.width / u, h: rect.height / u };
    let moved = false;


    const showSnap = (edge) => {
      if (!els.snap) return;
      if (!edge) { els.snap.style.display = 'none'; return; }
      const w = settings.panelWidth * u, hh = settings.barHeight * u;
      const styles = {
        left: { left: '0px', top: '0px', width: w + 'px', height: '100%' },
        right: { right: '0px', top: '0px', left: 'auto', width: w + 'px', height: '100%' },
        top: { left: '0px', top: '0px', width: '100%', height: hh + 'px' },
        bottom: { left: '0px', bottom: '0px', top: 'auto', width: '100%', height: hh + 'px' }
      };
      Object.assign(els.snap.style, { display: 'block', right: 'auto', bottom: 'auto', ...styles[edge] });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      els.panel.classList.remove('moving', 'dragging-overlay');
      if (bookmarks) bookmarks.el.classList.remove('dragging-overlay');
      if (els.dragPreview) els.dragPreview.style.display = 'none';
      if (els.snap) els.snap.style.display = 'none';
    };
    const move = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved) {
        if (winPopOpen) closeWinPop();
        if (contextMenu && contextMenu.isOpen()) contextMenu.hide();
        hideTip();
        els.panel.classList.add('moving', 'dragging-overlay');
        if (bookmarks) bookmarks.el.classList.add('dragging-overlay');
        if (els.dragPreview) els.dragPreview.style.display = 'grid';
      }
      moved = true;
      const pw = vw() / u, ph = vh() / u;
      settings.winRect = {
        x: fnClamp(original.x + dx / u, 0, Math.max(0, pw - original.w)),
        y: fnClamp(original.y + dy / u, 0, Math.max(0, ph - original.h)),
        w: original.w, h: original.h
      };
      if (els.dragPreview) {
        els.dragPreview.style.left = ev.clientX + 'px';
        els.dragPreview.style.top = ev.clientY + 'px';
      }
      applyGeometry();
      if (bookmarks) bookmarks.update();
      showSnap(snapEdgeAtPointer(ev.clientX, ev.clientY));
    };
    const up = (ev) => {
      const edge = moved ? snapEdgeAtPointer(ev.clientX, ev.clientY) : null;
      cleanup();
      if (!moved) return;
      if (edge) {
        settings.edge = edge;
        settings.style = 'docked';
        settings.winRect = null;
        pinned = !!dockedPinned;
        peek = false;
        try { api.storage.local.set({ pinned, dockedPinned }); } catch (_) {}
        saveSettings();
        applySettings(true);
      } else {
        saveSettings();
        applySettings(true);
      }
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  // ---------- build UI ----------
  const CSS = globalThis.FNX && globalThis.FNX.CSS ? globalThis.FNX.CSS : '';

  function addStyles(shadow, css) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
    } catch (e) {
      const st = document.createElement('style');
      st.textContent = css;
      shadow.appendChild(st);
    }
  }

  function build() {
    hostEl = document.createElement('div');
    hostEl.id = 'fn-host';
    hostEl.style.cssText = 'all:initial!important;position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important';
    root = hostEl.attachShadow({ mode: 'closed' });
    addStyles(root, CSS);
    ui = h('div', 'ui');
    ui.dataset.theme = settings.theme;
    // Track the entire overlay hover state, not only the individual scroller under the pointer.
    ui.addEventListener('pointerover', () => {
      if (hostEl) hostEl.classList.add('overlay-pointer-hover');
    });
    ui.addEventListener('pointerout', (e) => {
      if (!e.relatedTarget || !ui.contains(e.relatedTarget)) {
        if (hostEl) hostEl.classList.remove('overlay-pointer-hover');
      }
    });
    const internalScrollers = '.list, .winpopbody, .bmlist, .bmstrip, .menu.scroll, .submenu.scroll';
    ui.addEventListener('wheel', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const scroller = target && target.closest(internalScrollers);
      if (scroller) {
        const scale = e.deltaMode === 1 ? 16
          : (e.deltaMode === 2 ? Math.max(scroller.clientWidth, scroller.clientHeight, 1) : 1);
        let dx = e.deltaX * scale;
        let dy = e.deltaY * scale;
        // On the horizontal rail, a conventional vertical wheel moves the tab row sideways.
        if (scroller === els.list && !isVertical() && !isBox() && Math.abs(dy) > Math.abs(dx)) {
          dx = dy;
          dy = 0;
        }
        if (dx) scroller.scrollLeft += dx;
        if (dy) scroller.scrollTop += dy;
        if (scroller === els.list && !isVertical() && !isBox()) updateScrollButtons();
      }
      // Always consume wheel input over FullNav, even on blank/non-scrollable
      // surfaces or at a scroll boundary, so the website underneath never moves.
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true, passive: false });
    ui.addEventListener('pointerdown', (e) => {
      if (!searchPopupOpen) return;
      const target = e.target;
      if (target === els.searchToggle || target === els.search || (els.searchWrap && els.searchWrap.contains(target))) return;
      closeSearchPopup(false);
    }, true);

    els.panel = h('div', 'panel hidden no-anim');
    const top = h('div', 'top');
    const head = h('div', 'head');
    els.head = head;
    els.overlayToggle = iconBtn('btn overlay-toggle', 'Collapse overlay', ICON_OVERLAY_COLLAPSE);
    els.overlayToggle.setAttribute('aria-expanded', 'true');
    els.overlayToggle.setAttribute('aria-label', 'Collapse overlay');
    els.overlayToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleOverlayCollapsed();
    });
    els.searchRow = h('div', 'searchrow');
    els.searchToggle = iconBtn('btn searchtoggle', 'Search', ICON_SEARCH);
    els.searchToggle.setAttribute('aria-label', 'Search');
    els.searchToggle.setAttribute('aria-expanded', 'false');
    els.searchWrap = h('div', 'searchwrap');
    els.search = h('input', 'search');
    els.search.type = 'text';
    els.search.placeholder = 'Search';
    els.search.setAttribute('aria-label', 'Search tabs or enter an address');
    els.search.spellcheck = false;
    els.search.autocomplete = 'off';
    els.search.autocapitalize = 'off';
    els.searchClear = iconBtn('btn search-clear', 'Clear search', 'M7.41 6 12 10.59 16.59 6 18 7.41 13.41 12 18 16.59 16.59 18 12 13.41 7.41 18 6 16.59 10.59 12 6 7.41z');
    els.searchClear.setAttribute('aria-label', 'Clear search');
    els.searchClear.hidden = true;
    els.searchWrap.append(els.search, els.searchClear);
    els.searchClear.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearSearchInput(true);
    });
    els.searchRow.append(els.overlayToggle, els.searchToggle, els.searchWrap);
    els.searchToggle.addEventListener('click', () => {
      if (searchPopupOpen) closeSearchPopup(true);
      else openSearchPopup();
    });
    els.bookmarkBtn = iconBtn('btn bookmarkbtn', 'Show bookmarks', 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z');
    els.pin = iconBtn('btn pin', 'Pin open', ICON_PIN);
    els.gear = iconBtn('btn gear', 'Settings', ICON_GEAR);
    // The window button can sit at either end of the horizontal strip and opens
    // a vertical tab popover for the other browser windows.
    els.winBtn = h('button', 'btn winbtn');
    els.winBtn.type = 'button';
    els.winBtn.hidden = true;
    els.winBtn.title = 'Other windows';
    els.winBtn.setAttribute('aria-label', 'Other windows');
    els.winBtn.setAttribute('aria-haspopup', 'true');
    els.winBtn.setAttribute('aria-expanded', 'false');
    els.winBtn.appendChild(windowIcon());
    els.winBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleWinPop();
    });
    els.winBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    els.winBtn.addEventListener('contextmenu', showWinPopPositionMenu);
    els.edgeTools = h('div', 'edge-tools');
    applyToolbarOrder();
    setupToolbarReordering();
    top.appendChild(head);
    // Click-and-hold any non-interactive part of the top bar to move the overlay.
    top.addEventListener('pointerdown', startOverlayDrag);

    const railNav = (cls, label, dir) => {
      const b = h('button', 'btn stripnav ' + cls);
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.appendChild(chev());
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        scrollRail(dir);
      });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      return b;
    };
    els.scrollPrev = railNav('stripnav-prev', 'Scroll tabs left', -1);
    els.scrollNext = railNav('stripnav-next', 'Scroll tabs right', 1);
    els.scrollPrev.hidden = true;
    els.scrollNext.hidden = true;

    els.list = h('div', 'list');
    els.list.addEventListener('scroll', updateScrollButtons, { passive: true });
    els.panel.append(top, els.scrollPrev, els.list, els.scrollNext, els.winBtn, els.edgeTools);
    syncWinButtonPlacement();
    els.sizeBadge = h('div', 'sizebadge', '');
    els.panel.appendChild(els.sizeBadge);
    els.resizeBuffer = h('div', 'resize-buffer');
    els.resizeBuffer.addEventListener('pointerdown', (e) => startResize(e, els.resizeBuffer.dataset.handle || 'e'));
    for (const handle of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      const grip = h('div', 'rz');
      grip.dataset.h = handle;
      grip.addEventListener('pointerdown', (e) => startResize(e, handle));
      els.panel.appendChild(grip);
    }
    els.editShield = h('div', 'edit-shield');
    els.editShield.setAttribute('aria-hidden', 'true');
    els.editShield.addEventListener('pointerdown', (e) => {
      // The shield is the pointer target over empty page space, so no click can
      // hit the underlying website. Keep it until click so the whole click
      // sequence is consumed before closing the editor.
      e.stopPropagation();
    });
    els.editShield.addEventListener('click', (e) => {
      if (e.target !== els.editShield || !hotZoneEditMode) return;
      e.preventDefault();
      e.stopPropagation();
      hotZoneEditMode = false;
      placeHint();
      updateHintVisibility();
    });
    els.editShield.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    els.editShield.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });

    els.hint = h('div', 'hint');
    els.dragPreview = h('div', 'drag-preview');
    els.dragPreview.setAttribute('aria-hidden', 'true');
    els.dragPreview.appendChild(svg(ICON_STACKED_TABS));
    for (const [part, cls] of [['start', 'hint-start'], ['end', 'hint-end'], ['thickness', 'hint-thickness']]) {
      const handle = h('i', 'hint-handle ' + cls);
      handle.dataset.zonePart = part;
      els.hint.appendChild(handle);
    }
    els.hint.addEventListener('pointerdown', startHotZoneEdit);
    els.snap = h('div', 'snap');
    tipEl = h('div', 'tip');
    tipEl.append(h('div', 't1'), h('div', 't2'));

    // Vertical popover for the other browser windows, anchored to the rail.
    els.winPop = h('div', 'winpop hidden');
    els.winPop.dataset.side = 'top';
    els.winPopHead = h('div', 'winpophead');
    els.winPopTitle = h('span', 'wptitle', 'Other windows');
    els.winPopPin = iconBtn('btn pin winpop-pin', 'Pin window list with overlay', ICON_PIN);
    els.winPopPin.setAttribute('aria-pressed', String(winPopPinned));
    els.winPopPin.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setWinPopPinned(!winPopPinned);
    });
    els.winPopIcons = iconBtn('btn winpop-collapse', 'Show icons only', ICON_OVERLAY_COLLAPSE);
    els.winPopIcons.setAttribute('aria-pressed', 'false');
    els.winPopIcons.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setWinPopIcons(!winPopIcons);
    });
    syncWinPopPin();
    els.winPopHead.append(els.winPopTitle, els.winPopPin, els.winPopIcons);
    els.winPopBody = h('div', 'winpopbody');
    els.winPop.append(els.winPopHead, els.winPopBody);
    // Initialize the popover's compact/full-tab state from shared extension storage.
    setWinPopIcons(winPopIcons, false);
    els.winPop.addEventListener('pointerdown', (e) => e.stopPropagation());
    els.winPop.addEventListener('mouseenter', () => {
      hoverWinPop = true;
      clearClose();
    });
    els.winPop.addEventListener('mouseleave', () => {
      hoverWinPop = false;
      if (peek && !pinned && !isBox()) scheduleClose();
    });
    els.winPop.addEventListener('click', (e) => {
      const tabNode = e.target.closest && e.target.closest('.tab');
      if (tabNode) {
        const id = Number(tabNode.dataset.id);
        if (e.target.closest('.x')) {
          if (!winPopPinned) closeWinPop();
          closeTabs([id]);
          return;
        }
        if (e.shiftKey) { toggleSel(id, true, !!(e.ctrlKey || e.metaKey)); return; }
        if (e.ctrlKey || e.metaKey) { toggleSel(id, false, true); return; }
        if (selected.size) selected.clear();
        selId = id;
        anchorId = id;
        if (winPopPinned) render();
        else closeWinPop();
        activate(id);
        return;
      }
      const wh = e.target.closest && e.target.closest('.whead');
      if (wh) {
        // Like vertical mode, the header itself collapses/expands this window.
        toggleWinPopCollapse(Number(wh.dataset.win));
        return;
      }
      if (e.target.closest && e.target.closest('button')) return;
      clearSel();
    });
    els.winPop.addEventListener('contextmenu', (e) => {
      const tabNode = e.target.closest && e.target.closest('.tab');
      if (tabNode) {
        e.preventDefault();
        e.stopPropagation();
        showTabMenu(Number(tabNode.dataset.id), e.clientX, e.clientY);
        return;
      }
      const windowNode = e.target.closest && e.target.closest('.whead');
      if (windowNode) {
        e.preventDefault();
        e.stopPropagation();
        showWindowMenu(Number(windowNode.dataset.win), e.clientX, e.clientY, true);
        return;
      }
      showWinPopEmptyMenu(e);
    });
    els.winPop.addEventListener('mouseover', (e) => {
      const node = e.target.closest && e.target.closest('.tab,.whead');
      if (!node) return;
      if (e.relatedTarget && node.contains(e.relatedTarget)) return;
      const title = node.dataset.title || (node.classList.contains('whead') ? '' : node.textContent.trim());
      if (!title) return;
      showTip(node.getBoundingClientRect(), title, node.dataset.url || node.dataset.detail || '', tabTooltipSide(node));
    });
    els.winPop.addEventListener('mouseout', (e) => {
      const node = e.target.closest && e.target.closest('.tab,.whead');
      if (node && (!e.relatedTarget || !node.contains(e.relatedTarget))) hideTip();
    });
    els.winPop.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      const node = e.target.closest && e.target.closest('.tab');
      if (node) { e.preventDefault(); closeTabs([Number(node.dataset.id)]); }
    });
    els.winPop.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    hoverable(els.winPop);
    // The shield dims and blocks the page (z-index 2); the panel stays above
    // it (z-index 3), and the editable hot-zone handles stay above both (z-4).
    ui.append(els.snap, els.editShield, els.hint, els.panel, els.winPop, els.dragPreview, els.resizeBuffer, tipEl);
    root.appendChild(ui);

    // Create feature modules after their shared elements exist.
    contextMenu = globalThis.FNX.createMenu({
      ui, root, h, vw, vh, u: () => u,
      tip: showTip,
      hideTip,
      onOpen: () => clearClose(),
      onClose: () => { if (peek && !pinned && !isBox()) scheduleClose(); }
    });
    bookmarks = globalThis.FNX.createBookmarks({
      ui, h, chevron: chev, menu: contextMenu,
      settings: () => settings,
      shown: () => shown,
      u: () => u,
      panelRect: () => els.panel.getBoundingClientRect(),
      placement: () => ({ left: 'right', right: 'left', top: 'below', bottom: 'above' })[settings.edge],
      floating: () => isBox(),
      vertical: () => isVertical(),
      barInset: winPopBookmarkInset,
      barOffset: winPopBookmarkStart,
      vw,
      vh,
      setFloatingSide: (side) => {
        for (const cls of ['bookmarks-left', 'bookmarks-top', 'bookmarks-bottom']) els.panel.classList.remove(cls);
        if (side === 'left') els.panel.classList.add('bookmarks-left');
        if (side === 'top') els.panel.classList.add('bookmarks-top');
        if (side === 'bottom') els.panel.classList.add('bookmarks-bottom');
      },
      setFloatingBookmarkEdge: (edge) => {
        settings.floatingBookmarksEdge = edge || 'auto';
        update(true);
        saveSettings();
      },
      send,
      folderIcons: () => folderIcons,
      setFolderIcon,
      pickFolderIcon,
      toggleBookmarks: toggleBookmarkPanel,
      setMode: (mode) => { settings.bookmarksMode = mode; saveSettings(); update(true); },
      open: openBookmark,
      tip: showTip,
      hideTip,
      hoverable,
      editBookmark: openBookmarkEditor,
      addBookmark: addBookmarkFromPanel
    });
    // Closed shadow roots retarget internal pointerdowns to the host before the
    // document sees them, so decide inside/outside on the shadow root itself.
    root.addEventListener('pointerdown', (e) => {
      if (!winPopOpen || winPopPinned) return;
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (els.winPop.contains(t) || els.winBtn.contains(t)) return;
      if (bookmarks && bookmarks.el && bookmarks.el.contains(t)) return;
      if (contextMenu && contextMenu.isOpen()) return;
      if (hasBlockingPopup()) return;
      closeWinPop();
    }, true);

    els.panel.addEventListener('transitionend', (e) => {
      if (e.target !== els.panel || !['transform', 'opacity'].includes(e.propertyName) || !bookmarks) return;
      bookmarks.el.classList.remove('pending-place');
      // A peek rail may have been clicked open mid-slide; keep the popover
      // attached to the rail's final position.
      if (winPopOpen) positionWinPop();
      if (shown) bookmarks.update();
    });

    // Avoid page keyboard listeners taking over focus when the address/search field is in use.
    els.panel.addEventListener('mousedown', (e) => {
      // Preserve the browser's native contextmenu event on secondary clicks.
      if (e.button !== 0) return;
      if (e.target !== els.search && !(e.target.closest && e.target.closest('button,.tab,.rz'))) e.preventDefault();
    });
    hoverable(els.panel);
    els.pin.addEventListener('click', () => setPinned(!pinned));
    els.bookmarkBtn.addEventListener('click', toggleBookmarkPanel);
    els.gear.addEventListener('click', openSettingsCard);
    els.list.addEventListener('click', (e) => {
      const tabNode = e.target.closest && e.target.closest('.tab');
      if (tabNode) {
        const id = Number(tabNode.dataset.id);
        if (e.target.closest('.x')) { closeTabs([id]); return; }
        if (e.shiftKey) { toggleSel(id, true, !!(e.ctrlKey || e.metaKey)); return; }
        if (e.ctrlKey || e.metaKey) { toggleSel(id, false, true); return; }
        if (selected.size) selected.clear();
        selId = id;
        anchorId = id;
        render();
        activate(id);
        return;
      }
      const gh = e.target.closest && e.target.closest('.ghead');
      if (gh) { toggleCollapse('g' + gh.dataset.group); return; }
      const wh = e.target.closest && e.target.closest('.whead');
      if (wh) { toggleCollapse('w' + wh.dataset.win); return; }
      clearSel();
    });
    els.panel.addEventListener('click', (e) => {
      // Clear selection from blank panel/header space too, not just the list.
      if (els.list.contains(e.target)) return;
      if (e.target.closest && e.target.closest('button,input,.tab,.whead,.ghead,.rz')) return;
      clearSel();
    });
    els.list.addEventListener('contextmenu', (e) => {
      const tabNode = e.target.closest && e.target.closest('.tab');
      const groupNode = e.target.closest && e.target.closest('.ghead');
      const windowNode = e.target.closest && e.target.closest('.whead');
      if (tabNode) {
        e.preventDefault();
        showTabMenu(Number(tabNode.dataset.id), e.clientX, e.clientY);
      } else if (groupNode) {
        e.preventDefault();
        showGroupMenu(Number(groupNode.dataset.group), e.clientX, e.clientY);
      } else if (windowNode) {
        e.preventDefault();
        showWindowMenu(Number(windowNode.dataset.win), e.clientX, e.clientY);
      }
    });

    // Right-click only the overlay's own blank space. Tabs, window/group
    // headers and controls retain their dedicated handlers; bookmarks live
    // outside this panel and are not affected.
    els.panel.addEventListener('contextmenu', (e) => {
      if (e.defaultPrevented) return;
      const target = e.target;
      if (!target || !target.closest) return;
      if (target.closest('.tab,.whead,.ghead,button,input,textarea,select,a,.rz,.sizebadge,.menu,.submenu,.card,.prompt,.backdrop')) return;
      e.preventDefault();
      e.stopPropagation();
      showOverlayMenu(Number.isInteger(data.cur) ? data.cur : undefined, e.clientX, e.clientY);
    });
    els.list.addEventListener('mouseover', (e) => {
      const node = e.target.closest && e.target.closest('.tab,.whead,.ghead');
      if (!node) return;
      // Horizontal strips always show a tooltip so a truncated (or hidden)
      // title is still available; vertical rails keep the icons-only rule.
      const horizontal = !isVertical() && !isBox();
      if (!horizontal && !els.panel.classList.contains('icons')) return;
      if (e.relatedTarget && node.contains(e.relatedTarget)) return;
      const title = node.dataset.title || (node.classList.contains('whead') ? '' : node.textContent.trim());
      if (!title) return;
      showTip(node.getBoundingClientRect(), title, node.dataset.url || node.dataset.detail || '', tabTooltipSide(node));
    });
    els.list.addEventListener('mouseout', (e) => {
      const node = e.target.closest && e.target.closest('.tab,.whead,.ghead');
      if (node && (!e.relatedTarget || !node.contains(e.relatedTarget))) hideTip();
    });
    els.list.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      const node = e.target.closest && e.target.closest('.tab');
      if (node) { e.preventDefault(); closeTabs([Number(node.dataset.id)]); }
    });
    els.list.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    // Multi-tab drag/drop with real before/after positions and named
    // destinations. The same handlers serve the main list and the other-window
    // popover, so tabs can be dragged between them or into another window.
    const clearMarks = () => {
      ui.querySelectorAll('.drop-before,.drop-after,.drop-win,.drop-into,.drop-reorder,.drop-invalid,[data-drop]').forEach((node) => {
        node.classList.remove('drop-before', 'drop-after', 'drop-win', 'drop-into', 'drop-reorder', 'drop-invalid');
        delete node.dataset.drop;
      });
    };
    function determineTarget(e) {
      const tabNode = e.target.closest && e.target.closest('.tab');
      if (tabNode) {
        const id = Number(tabNode.dataset.id);
        if (dragIds && dragIds.includes(id)) return { invalid: true, node: tabNode };
        const r = tabNode.getBoundingClientRect();
        const vertical = isBox() || isVertical()
          || !!(e.target.closest && e.target.closest('.winpop'));
        const after = vertical ? e.clientY >= r.top + r.height / 2 : e.clientX >= r.left + r.width / 2;
        return { target: { kind: 'tab', tabId: id, pos: after ? 'after' : 'before' }, node: tabNode, after };
      }
      const groupNode = e.target.closest && e.target.closest('.ghead');
      if (groupNode) {
        const gid = Number(groupNode.dataset.group);
        const same = dragIds && dragIds.length > 0 && dragIds.every((id) => getTab(id)?.tab.groupId === gid);
        return { target: { kind: 'group', groupId: gid }, node: groupNode, kind: same ? 'reorder' : 'into' };
      }
      const winNode = e.target.closest && e.target.closest('.whead');
      if (winNode) {
        const wid = Number(winNode.dataset.win);
        const targetWindow = (data.windows || []).find((win) => win.id === wid);
        return { target: { kind: 'window', windowId: wid }, node: winNode.closest('.win'), head: winNode, label: targetWindow?.name ? 'Move to ' + targetWindow.name : 'Move to window' };
      }
      const win = e.target.closest && e.target.closest('.win');
      if (win) return { target: { kind: 'window', windowId: Number(win.dataset.win) }, node: win };
      return null;
    }
    function tabDragStart(e) {
      const tabNode = e.target.closest && e.target.closest('.tab');
      if (!tabNode || bookmarkDrag) return;
      const id = Number(tabNode.dataset.id);
      dragIds = orderedIds(selected.has(id) ? [...selected] : [id]);
      dragTarget = null;
      tabNode.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'fn-tabs:' + dragIds.join(','));
      const preview = h('div', 'dragimg' + (dragIds.length > 1 ? ' multi' : ''));
      const found = getTab(id);
      preview.appendChild(h('span', 'dtitle', found?.tab.title || 'Tab'));
      if (dragIds.length > 1) preview.appendChild(h('span', 'dcount', dragIds.length + ' Tabs'));
      ui.appendChild(preview);
      try { e.dataTransfer.setDragImage(preview, 12, 12); } catch (_) {}
      requestAnimationFrame(() => preview.remove());
      clearClose();
    }
    function tabDragOver(e) {
      if (!dragIds || !dragIds.length) return;
      clearMarks();
      const info = determineTarget(e);
      if (!info) { dragTarget = null; return; }
      e.preventDefault();
      if (info.invalid) {
        dragTarget = null;
        e.dataTransfer.dropEffect = 'none';
        info.node.classList.add('drop-invalid');
        return;
      }
      dragTarget = info.target;
      e.dataTransfer.dropEffect = 'move';
      if (info.target.kind === 'tab') info.node.classList.add(info.after ? 'drop-after' : 'drop-before');
      else if (info.target.kind === 'group') {
        info.node.classList.add(info.kind === 'into' ? 'drop-into' : 'drop-reorder');
        info.node.dataset.drop = info.kind === 'into' ? 'Move into group' : 'Reorder within group';
      } else if (info.target.kind === 'window') {
        (info.node || info.head)?.classList.add('drop-win');
        if (info.head) info.head.dataset.drop = info.label || 'Move to window';
      }
    }
    function tabDragDrop(e) {
      if (!dragIds || !dragIds.length) return;
      e.preventDefault();
      const ids = dragIds;
      const target = determineTarget(e);
      clearMarks();
      dragIds = null;
      dragTarget = null;
      if (!ids.length || !target || target.invalid || !target.target) return;
      send({ type: 'move', tabIds: ids, target: target.target });
      selected.clear();
      render();
    }
    function tabDragEnd() {
      dragIds = null;
      dragTarget = null;
      clearMarks();
      ui.querySelectorAll('.tab.dragging').forEach((node) => node.classList.remove('dragging'));
      if (peek && !pinned && !hoverPanel) scheduleClose();
    }
    function bindTabDrag(container) {
      if (!container) return;
      container.addEventListener('dragstart', tabDragStart);
      container.addEventListener('dragover', tabDragOver);
      container.addEventListener('drop', tabDragDrop);
      container.addEventListener('dragend', tabDragEnd);
    }
    bindTabDrag(els.list);
    bindTabDrag(els.winPopBody);

    // ---------- bookmark drag/drop ----------
    // Bookmark items are rendered by fn-bookmarks.js. Their data attributes keep
    // this handler independent of that module: the same drag can reorder the
    // Chrome bookmark tree, open in a specific window/tab slot, or open on the
    // page under the pointer.
    const bookmarkInfo = (node) => {
      const el = node && node.closest && node.closest('[data-bm-id]');
      if (!el || !el.dataset.bmId) return null;
      const index = Number(el.dataset.bmIndex);
      return {
        id: el.dataset.bmId,
        parentId: el.dataset.bmParent || '',
        index: Number.isInteger(index) ? index : null,
        title: el.dataset.bmTitle || '',
        url: el.dataset.bmUrl || '',
        folder: el.dataset.bmFolder === '1',
        el
      };
    };
    const clearBookmarkMarks = () => {
      ui.querySelectorAll('.bm-drop-before,.bm-drop-after').forEach((node) => {
        node.classList.remove('bm-drop-before', 'bm-drop-after');
      });
    };
    const clearBookmarkDrag = () => {
      if (bookmarkDrag && bookmarkDrag.el) bookmarkDrag.el.classList.remove('bm-dragging');
      bookmarkDrag = null;
      bookmarkDropTarget = null;
      clearBookmarkMarks();
    };
    const isBookmarkMenuArea = (node) => {
      if (!node || !node.closest) return false;
      const menu = node.closest('.menu, .submenu');
      return !!(menu && menu.querySelector('[data-bm-id]'));
    };
    const isBookmarkDragArea = (node) => !!(node && node.closest && (
      node.closest('.windowbookmarks, .bm, .panel, .winpop') || isBookmarkMenuArea(node)
    ));
    const bookmarkDropInfo = (e) => {
      const item = e.target.closest && e.target.closest('[data-bm-id]');
      if (item) {
        const info = bookmarkInfo(item);
        if (!info) return null;
        if (bookmarkDrag && info.id === bookmarkDrag.id) {
          return { kind: 'invalid', node: item };
        }
        const r = item.getBoundingClientRect();
        const inBar = !!(item.closest && item.closest('.bmbar'));
        const after = inBar
          ? e.clientX >= r.left + r.width / 2
          : e.clientY >= r.top + r.height / 2;
        return { kind: 'bookmark', node: item, info, after };
      }
      const tabNode = e.target.closest && e.target.closest('.tab');
      if (tabNode) {
        const tabId = Number(tabNode.dataset.id);
        const found = getTab(tabId);
        if (!found) return null;
        const r = tabNode.getBoundingClientRect();
        const inPopover = !!(tabNode.closest && tabNode.closest('.winpop'));
        const after = inPopover
          ? e.clientY >= r.top + r.height / 2
          : (isBox() || isVertical())
            ? e.clientY >= r.top + r.height / 2
            : e.clientX >= r.left + r.width / 2;
        return {
          kind: 'tab', node: tabNode, after,
          target: { tabId, windowId: found.win.id, pos: after ? 'after' : 'before' }
        };
      }
      const head = e.target.closest && e.target.closest('.whead');
      if (head) {
        return {
          kind: 'window', node: head.closest('.win'), head,
          target: { windowId: Number(head.dataset.win), pos: 'end' }
        };
      }
      const win = e.target.closest && e.target.closest('.win');
      if (win) {
        return {
          kind: 'window', node: win,
          target: { windowId: Number(win.dataset.win), pos: 'end' }
        };
      }
      return null;
    };
    const showBookmarkDrop = (info) => {
      clearMarks();
      clearBookmarkMarks();
      if (!info || info.kind === 'invalid') return;
      if (info.kind === 'bookmark') {
        info.node.classList.add(info.after ? 'bm-drop-after' : 'bm-drop-before');
      } else if (info.kind === 'window') {
        (info.node || info.head)?.classList.add('drop-win');
        if (info.head) info.head.dataset.drop = 'Open bookmark here';
      }
    };
    const moveBookmarkTo = async (source, target) => {
      if (!source || !target || target.kind !== 'bookmark' || !target.info.id) return;
      // The background resolves the destination parent and sibling order from
      // the live tree. This avoids stale parent/index metadata in lazy submenus
      // and the horizontal overflow (») slice.
      const result = await send({
        type: 'bookmarkAction',
        op: 'move',
        id: source.id,
        targetId: target.info.id,
        after: !!target.after
      });
      if (result && result.ok && bookmarks) bookmarks.refresh();
    };
    const openBookmarkAt = async (source, target) => {
      await send({
        type: 'bookmarkAction',
        op: 'openAt',
        id: source.id,
        url: source.url,
        folder: source.folder,
        windowId: target.windowId,
        targetTabId: target.tabId,
        pos: target.pos,
        focusWindow: target.windowId !== data.cur
      });
      if (target.windowId === data.cur && settings.closeOnPick && !pinned && !isBox()) closePeek();
    };
    const resetBookmarkDragAfterDrop = () => {
      clearMarks();
      clearBookmarkDrag();
      if (peek && !pinned && !hoverPanel) scheduleClose();
    };
    function bookmarkDragStart(e) {
      const info = bookmarkInfo(e.target);
      if (!info) return;
      bookmarkDrag = info;
      dragIds = null;
      dragTarget = null;
      bookmarkDropTarget = null;
      clearMarks();
      clearBookmarkMarks();
      info.el.classList.add('bm-dragging');
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('application/x-fullnav-bookmark', String(info.id));
      e.dataTransfer.setData('text/plain', info.url || info.title || 'Bookmark');
      if (info.url) e.dataTransfer.setData('text/uri-list', info.url);
      hideTip();
      clearClose();
    }
    function bookmarkDragOver(e) {
      if (!bookmarkDrag) return;
      const target = isBookmarkDragArea(e.target) ? bookmarkDropInfo(e) : null;
      if (!target) {
        clearMarks();
        clearBookmarkMarks();
        bookmarkDropTarget = null;
        if (isBookmarkDragArea(e.target)) e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      bookmarkDropTarget = target;
      if (target.kind === 'invalid') {
        clearMarks();
        clearBookmarkMarks();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        return;
      }
      showBookmarkDrop(target);
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = target.kind === 'bookmark' ? 'move' : 'copy';
      }
    }
    function bookmarkDragDrop(e) {
      if (!bookmarkDrag) return;
      const source = bookmarkDrag;
      const liveTarget = bookmarkDropInfo(e);
      // A native drop event can be retargeted to the dragged row in nested or
      // overflow menus. Dragover tracks the current valid target continuously.
      const target = bookmarkDropTarget || liveTarget;
      e.preventDefault();
      e.stopPropagation();
      if (target && target.kind === 'bookmark') {
        // Suppress only a trailing click on the dragged or dropped bookmark.
        // Otherwise a successful reorder can also invoke the row's open action.
        suppressedBookmarkClickIds = new Set([String(source.id), String(target.info.id)]);
        suppressBookmarkClickUntil = Date.now() + 700;
        void moveBookmarkTo(source, target);
      } else if (target && (target.kind === 'tab' || target.kind === 'window')) {
        void openBookmarkAt(source, target.target);
      }
      resetBookmarkDragAfterDrop();
    }
    function bookmarkDragEnd() {
      if (!bookmarkDrag) return;
      clearBookmarkDrag();
      if (peek && !pinned && !hoverPanel) scheduleClose();
    }
    function pageBookmarkDragOver(e) {
      if (!bookmarkDrag) return;
      const t = e.target;
      if (t === hostEl || (t && t.closest && t.closest('#fn-host'))) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }
    function pageBookmarkDrop(e) {
      if (!bookmarkDrag) return;
      const t = e.target;
      if (t === hostEl || (t && t.closest && t.closest('#fn-host'))) return;
      e.preventDefault();
      e.stopPropagation();
      const source = bookmarkDrag;
      clearBookmarkDrag();
      void openBookmarkAt(source, { windowId: data.cur, tabId: null, pos: 'end' });
      if (peek && !pinned && !hoverPanel) scheduleClose();
    }
    function suppressBookmarkClickAfterDrag(e) {
      if (Date.now() > suppressBookmarkClickUntil) {
        suppressedBookmarkClickIds.clear();
        return;
      }
      const row = e.target && e.target.closest && e.target.closest('[data-bm-id]');
      if (!row || !suppressedBookmarkClickIds.has(String(row.dataset.bmId || ''))) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      suppressedBookmarkClickIds.clear();
      suppressBookmarkClickUntil = 0;
    }
    // The tab insertion marker is only for dragging FullNav tabs. External links/files and bookmark drags must never show it.
    ui.addEventListener('dragover', () => { if (!dragIds || !dragIds.length) clearMarks(); }, true);
    // The tab insertion marker is only for dragging FullNav tabs. External links/files and bookmark drags must never show it.
    ui.addEventListener('dragover', () => { if (!dragIds || !dragIds.length) clearMarks(); }, true);
    ui.addEventListener('click', suppressBookmarkClickAfterDrag, true);
    ui.addEventListener('dragstart', bookmarkDragStart);
    ui.addEventListener('dragover', bookmarkDragOver);
    ui.addEventListener('drop', bookmarkDragDrop);
    ui.addEventListener('dragend', bookmarkDragEnd);
    document.addEventListener('dragover', pageBookmarkDragOver, true);
    document.addEventListener('drop', pageBookmarkDrop, true);

    els.search.addEventListener('input', () => { filter = els.search.value; selId = null; render(); updateSearchClearButton(); });
    updateSearchClearButton();

    document.documentElement.appendChild(hostEl);
    new MutationObserver(() => {
      if (!dead && hostEl && !hostEl.isConnected && document.documentElement) document.documentElement.appendChild(hostEl);
    }).observe(document.documentElement, { childList: true });
  }

  function destroy() {
    if (dead) return;
    dead = true;
    disconnect();
    if (globalThis.FNX && globalThis.FNX.push) globalThis.FNX.push.off(false);
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    clearTimeout(resizeTimer);
    clearTimeout(tipTimer);
    if (winDocDown) { document.removeEventListener('pointerdown', winDocDown, true); winDocDown = null; }
    winPopOpen = false;
    if (hostEl) hostEl.remove();
  }

  // ---------- init ----------
  async function init() {
    if (!document.documentElement) {
      await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
    }
    const [, env] = await Promise.all([loadStorage(), queryEnv()]);
    fullscreen = env.fs;
    u = 1 / env.zoom;
    if (dead) return;
    build();
    applySettings(true);
    requestAnimationFrame(() => requestAnimationFrame(() => els.panel.classList.remove('no-anim')));

    window.addEventListener('mousemove', onMove, { capture: true, passive: true });
    window.addEventListener('blur', () => { mods = { ctrl: false, alt: false, shift: false, meta: false }; clearOpen(); });
    window.addEventListener('mousedown', (e) => {
      if (peek && !pinned && !hotZoneEditMode && e.target !== hostEl) closePeek();
    }, true);
    window.addEventListener('pointerdown', (e) => {
      // Dismiss the floating search field on page clicks without swallowing the page click.
      if (searchPopupOpen && e.target !== hostEl) closeSearchPopup(false);
    }, true);
    document.documentElement.addEventListener('mouseleave', () => {
      lastInZone = false;
      clearOpen();
      if (peek && !pinned && !hoverPanel) scheduleClose();
    });
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(async () => {
        await refreshEnv();
        measure();
        placeHint();
        applyGeometry();
        if (shown) update(true);
      }, 120);
    });
    window.addEventListener('pageshow', (e) => { if (e.persisted) { refreshEnv(); update(true); } });
    document.addEventListener('fullscreenchange', () => { refreshEnv(); update(); });
    document.addEventListener('visibilitychange', () => {
      if (dead) return;
      if (document.visibilityState === 'visible') { refreshEnv(); resync(); }
      else { peek = false; hoverPanel = false; lastInZone = false; clearOpen(); clearClose(); }
      update(true);
    });
    // Returning to this window (for example after FullNav briefly opened another
    // one): refresh everything right away instead of waiting for the next input.
    window.addEventListener('focus', () => { if (!dead) resync(); });

    // Sent by the background after it hands focus back to this window.
    api.runtime.onMessage.addListener((m) => {
      if (!dead && m && m.type === 'fn-refocus') {
        try { window.focus(); } catch (_) {}
        resync();
      }
    });

    api.storage.onChanged.addListener((ch, area) => {
      if (dead || area !== 'local') return;
      if (ch.settings && !resizing) {
        settings = fnNormalize(ch.settings.newValue);
        applySettings();
      }
      if (ch.bmFolderIcons) {
        folderIcons = ch.bmFolderIcons.newValue && typeof ch.bmFolderIcons.newValue === 'object' ? ch.bmFolderIcons.newValue : {};
        if (bookmarks) bookmarks.refreshIcons();
      }
      if (ch.collapsed) { collapsed = ch.collapsed.newValue || {}; render(); }
      if (ch.dockedPinned) dockedPinned = !!ch.dockedPinned.newValue;
      if (ch.pinned) {
        const v = !!ch.pinned.newValue;
        if (v !== pinned) {
          pinned = v;
          peek = isBox() ? false : !v;
          update();
        }
      }
      if (ch.windowNames) {
        windowNames = ch.windowNames.newValue || {};
        // A fresh port snapshot contains the friendly window labels.
        if (port) refreshTabs();
        else render();
      }
      if (ch.winPopPinned) {
        const v = !!ch.winPopPinned.newValue;
        if (v !== winPopPinned) setWinPopPinned(v, false);
      }
      if (ch.winPopIcons) {
        const v = !!ch.winPopIcons.newValue;
        if (v !== winPopIcons) setWinPopIcons(v, false);
      }
      if (ch.toolbarOrder && Array.isArray(ch.toolbarOrder.newValue)) {
        const valid = ch.toolbarOrder.newValue.filter((id) => DEFAULT_TOOLBAR_ORDER.includes(id));
        toolbarOrder = [...new Set(valid)];
        for (const id of DEFAULT_TOOLBAR_ORDER) if (!toolbarOrder.includes(id)) toolbarOrder.push(id);
      }
      if (ch.edgeToolId) {
        edgeToolId = DEFAULT_TOOLBAR_ORDER.includes(ch.edgeToolId.newValue) ? ch.edgeToolId.newValue : 'settings';
      }
      if (ch.toolbarOrder || ch.edgeToolId) applyToolbarOrder(false);
    });
  }

  // Install keyboard capture synchronously at document_start, rather than
  // after asynchronous storage reads; this lets the focused search box stop
  // site-level keyboard handlers before they can steal focus or consume keys.
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keypress', onKey, true);
  window.addEventListener('keyup', onKey, true);
  init();
})();
