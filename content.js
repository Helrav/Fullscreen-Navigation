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

  let settings = tpNormalize();
  let pinned = false, fullscreen = false, peek = false, shown = false;
  let u = 1;                   // 1 / browser zoom: keeps the overlay the same real size on every page
  let data = { cur: -1, windows: [], groups: {} };
  let flat = [];
  let collapsed = {};
  const selected = new Set();
  let filter = '', selId = null, anchorId = null, needCenter = false, scrollSel = false;
  let port = null, dead = false, hoverPanel = false, lastInZone = false, needRearm = false;
  let resizing = false;
  let openTimer = 0, closeTimer = 0, resizeTimer = 0, toastTimer = 0, tipTimer = 0;
  let mods = { ctrl: false, alt: false, shift: false, meta: false };
  let hostEl = null, root = null, ui = null, els = {};
  let contextMenu = null, bookmarks = null, dragIds = null, dragTarget = null;
  let dockDrag = null, hotZoneEditMode = false, tipEl = null, toastSince = 0, toastCount = 0;
  let searchPopupOpen = false;
  let lastPointer = { x: -1, y: -1 };
  let windowNames = {};
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

    // The edge slot is always active, including after customising the toolbar.
    // The chosen icon occupies the real overlay edge; all others stay in the
    // header in the user's stored order.
    if (els.edgeTools) els.edgeTools.replaceChildren();
    const visibleOrder = order.filter((id) => id !== edgeToolId);
    els.head.append(els.searchRow, ...visibleOrder.map((id) => buttons[id]));
    if (els.edgeTools && buttons[edgeToolId]) els.edgeTools.appendChild(buttons[edgeToolId]);
    els.head.classList.add('default-toolbar-placement');
    if (els.panel) els.panel.classList.add('default-toolbar-placement');
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
          e.dataTransfer.setData('text/plain', 'tab-peek-toolbar:' + id);
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
  const allowed = () => (!settings.onlyFullscreen || fullscreen) && !document.fullscreenElement;
  const wantVisible = () => allowed() && (isBox() ? pinned : (pinned || peek));
  const modOk = () => settings.triggerKey === 'none' || !!mods[settings.triggerKey];
  // Pinning a docked overlay always reserves page space; no separate Push toggle.
  // Floating Windowed mode remains an overlay and does not resize the page.
  const pushHere = () => pinned && settings.style === 'docked';

  async function loadStorage() {
    try {
      const r = await api.storage.local.get(['settings', 'pinned', 'collapsed', 'windowNames', 'toolbarOrder', 'edgeToolId']);
      settings = tpNormalize(r.settings);
      pinned = !!r.pinned;
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

  async function queryEnv() {
    const r = await send({ type: 'env' });
    if (r) return { fs: !!r.fullscreen, zoom: r.zoom > 0 ? r.zoom : 1 };
    return { fs: window.innerWidth >= screen.width - 1 && window.innerHeight >= screen.height - 1, zoom: 1 };
  }

  async function refreshEnv() {
    const r = await queryEnv();
    let changed = false;
    if (r.fs !== fullscreen) { fullscreen = r.fs; changed = true; }
    const nu = 1 / r.zoom;
    if (Math.abs(nu - u) > 0.001) { u = nu; applyUnit(); changed = true; }
    if (changed) update();
  }

  function setPinned(v) {
    pinned = !!v;
    if (!pinned) peek = isBox() ? false : true;
    if (pinned) peek = false;
    update();
    try { api.storage.local.set({ pinned }); } catch (e) {}
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
    if (els.grip) {
      els.grip.setAttribute('aria-pressed', String(editing));
      els.grip.title = isBox()
        ? 'Drag to move or dock the window.'
        : editing
          ? 'Hot-zone editing: drag the bar to reposition it; drag its ends or inner edge to adjust it. Click to finish.'
          : 'Drag to move or dock. Click to edit the hot zone.';
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
        settings.zoneThickness = tpClamp(Math.round(distance / u), 1, 40);
      } else if (part === 'start' || part === 'end') {
        const pct = percentAlong(settings.edge, ev.clientX, ev.clientY);
        if (part === 'start') {
          const end = settings.zoneStart + settings.zoneLength;
          settings.zoneStart = tpClamp(pct, 0, end - 5);
          settings.zoneLength = end - settings.zoneStart;
        } else {
          const end = tpClamp(pct, settings.zoneStart + 5, 100);
          settings.zoneLength = end - settings.zoneStart;
        }
      } else {
        const [edge, distance] = nearestEdge(ev.clientX, ev.clientY);
        // Keep the bar on its current edge until the pointer reaches an edge.
        // This avoids accidental jumps while adjusting its position mid-screen.
        if (distance <= Math.max(36, 24 * u)) settings.edge = edge;
        const pct = percentAlong(settings.edge, ev.clientX, ev.clientY);
        settings.zoneStart = tpClamp(pct - settings.zoneLength / 2, 0, 100 - settings.zoneLength);
      }
      settings.zoneLength = tpClamp(Number(settings.zoneLength) || 40, 5, 100);
      settings.zoneStart = tpClamp(Number(settings.zoneStart) || 0, 0, 100 - settings.zoneLength);
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
      if (hoverPanel || lastInZone || nearResizeTarget() || nearPanelEdge() || pinned || resizing || hotZoneEditMode || dragIds || hasBlockingPopup() || (contextMenu && contextMenu.isOpen())) return;
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
          const n = tpClamp((i < 0 ? (e.key === 'ArrowDown' ? -1 : flat.length) : i) + (e.key === 'ArrowDown' ? 1 : -1), 0, flat.length - 1);
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
      if (contextMenu && contextMenu.isOpen()) { contextMenu.hide(); e.preventDefault(); return; }
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
        if (m && m.type === 'tabs') { data = m; render(); if (bookmarks) bookmarks.update(); }
        else if (m && m.type === 'bm' && bookmarks) bookmarks.refresh();
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

  async function refreshTabs() {
    const r = await send({ type: 'tabs' });
    if (r && r.windows) { data = r; render(); }
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
    if (globalThis.TPX && globalThis.TPX.favicons) {
      globalThis.TPX.favicons.mount(el, t.url || '', t.favIconUrl || '', t.title || t.url || '?');
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
    d.append(fav, h('span', 'title', t.title));
    if (t.audible || t.muted) d.appendChild(h('span', 'badge', t.muted ? '🔇' : '🔊'));
    if (t.pinned) d.appendChild(h('span', 'badge', '📌'));
    const x = h('button', 'x', '×');
    x.type = 'button';
    x.title = 'Close tab';
    d.appendChild(x);
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
    const alive = new Set();
    let renderedWindows = 0;

    data.windows.forEach((w) => {
      w.tabs.forEach((t) => alive.add(t.id));
      const list = filtering ? w.tabs.filter(matches) : w.tabs;
      if (filtering && !list.length) return;
      const isCur = w.id === data.cur;
      const wClosed = !filtering && !!collapsed['w' + w.id];

      // A deliberately short divider separates each visible window section.
      // It is a real flex item so it also works when horizontal layouts flatten
      // window wrappers with display: contents.
      if (renderedWindows > 0) frag.appendChild(h('div', 'windivider'));
      renderedWindows++;

      const win = h('div', 'win' + (isCur ? '' : ' inactive-window'));
      win.dataset.win = String(w.id);
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

      if (!wClosed) {
        const body = h('div', 'wbody');
        let i = 0;
        while (i < list.length) {
          const t = list[i];
          const g = t.groupId >= 0 ? data.groups[t.groupId] : null;
          if (g) {
            let j = i;
            while (j < list.length && list[j].groupId === t.groupId) j++;
            const gClosed = !filtering && !!collapsed['g' + t.groupId];
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
    if (selId == null || !flat.some((f) => f.id === selId)) {
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
    updateTools();
  }

  function updateTools() {
    if (!els.closeSel || !els.clearSel) return;
    const n = selected.size;
    if (els.tools) els.tools.style.display = n ? '' : 'none';
    els.closeSel.style.display = n ? '' : 'none';
    els.clearSel.style.display = n ? '' : 'none';
    els.closeSel.textContent = 'Close ' + n;
  }

  function visibleIndex(id) { return flat.findIndex((entry) => entry.id === id); }

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
      if (!additive) selected.clear();
      for (let k = lo; k <= hi; k++) selected.add(flat[k].id);
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

  function toggleCollapse(key) {
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

  function showTabMenu(id, x, y) {
    if (!contextMenu) return;
    const ids = selected.has(id) ? orderedIds([...selected]) : [id];
    selectedForMenu = ids.slice();
    const tabs = ids.map(getTab).filter(Boolean).map((item) => item.tab);
    if (!tabs.length) return;
    const multiple = ids.length > 1;
    const gid = sameGroupFor(ids);
    const wid = sameWindowFor(ids);
    const items = [];
    if (!multiple) items.push({ label: 'Switch to tab', action: () => activate(id) }, { sep: true });
    items.push(
      { label: allMuted(ids) ? 'Unmute tab' + (multiple ? 's' : '') : 'Mute tab' + (multiple ? 's' : ''), action: () => send({ type: 'tabop', op: 'mute', tabIds: ids, value: !allMuted(ids) }) },
      { label: allPinned(ids) ? 'Unpin tab' + (multiple ? 's' : '') : 'Pin tab' + (multiple ? 's' : ''), action: () => send({ type: 'tabop', op: 'pin', tabIds: ids, value: !allPinned(ids) }) },
      { label: 'Duplicate tab' + (multiple ? 's' : ''), action: () => send({ type: 'tabop', op: 'duplicate', tabIds: ids }) },
      { label: 'Reload tab' + (multiple ? 's' : ''), action: () => send({ type: 'tabop', op: 'reload', tabIds: ids }) },
      { label: 'Bookmark tab' + (multiple ? 's' : ''), action: () => send({ type: 'tabop', op: 'bookmark', tabIds: ids }) },
      { sep: true },
      { label: multiple ? 'Group tabs' : 'Group tab', action: () => send({ type: 'group', tabIds: ids }) },
      { label: 'Move to group', sub: groupMenuItems(ids) }
    );
    if (gid >= 0) {
      items.push({ sep: true });
      const group = data.groups[gid] || {};
      items.push(
        { label: 'Color group', sub: GROUP_COLOR_NAMES.map((name) => ({
          label: name[0].toUpperCase() + name.slice(1), dot: GROUP_COLORS[name], checked: group.color === name,
          action: () => send({ type: 'groupSet', groupId: gid, color: name })
        })) },
        { label: 'Rename group…', action: () => promptText('Rename group', group.title || '', (title) => send({ type: 'groupSet', groupId: gid, title })) },
        { label: 'Ungroup tabs', action: () => send({ type: 'tabop', op: 'ungroup', tabIds: ids }) }
      );
    } else if (tabs.some((tab) => tab.groupId >= 0)) {
      items.push({ sep: true }, { label: 'Ungroup tabs', action: () => send({ type: 'tabop', op: 'ungroup', tabIds: ids }) });
    }
    if (wid !== null) {
      const win = (data.windows || []).find((item) => item.id === wid);
      items.push({ sep: true }, { label: 'Rename window…', action: () => promptText('Rename window', win?.name || '', (name) => send({ type: 'renameWindow', windowId: wid, name })) });
    }
    items.push({ sep: true }, { label: 'Close tab' + (multiple ? 's' : ''), danger: true, action: () => closeTabs(ids) });
    contextMenu.show(items, x, y);
  }

  function showGroupMenu(groupId, x, y) {
    const group = data.groups[groupId];
    if (!group || !contextMenu) return;
    contextMenu.show([
      { label: 'Color group', sub: GROUP_COLOR_NAMES.map((name) => ({ label: name[0].toUpperCase() + name.slice(1), dot: GROUP_COLORS[name], checked: group.color === name, action: () => send({ type: 'groupSet', groupId, color: name }) })) },
      { label: 'Rename group…', action: () => promptText('Rename group', group.title || '', (title) => send({ type: 'groupSet', groupId, title })) },
      { label: 'Ungroup tabs', action: async () => {
        const ids = [];
        for (const win of data.windows) for (const tab of win.tabs) if (tab.groupId === groupId) ids.push(tab.id);
        await send({ type: 'tabop', op: 'ungroup', tabIds: ids });
      } }
    ], x, y);
  }

  function showWindowMenu(windowId, x, y) {
    const win = (data.windows || []).find((item) => item.id === windowId);
    if (!win || !contextMenu) return;
    contextMenu.show([
      { label: win.name ? 'Rename window…' : 'Name window…', action: () => promptText('Rename window', win.name || '', (name) => send({ type: 'renameWindow', windowId, name })) },
      { label: collapsed['w' + windowId] ? 'Expand window' : 'Collapse window', action: () => toggleCollapse('w' + windowId) },
      { label: 'Move selected tabs here', disabled: selected.size === 0, action: () => send({ type: 'move', tabIds: orderedIds([...selected]), target: { kind: 'window', windowId } }) }
    ], x, y);
  }

  async function closeTabs(ids) {
    const ordered = orderedIds(ids);
    if (!ordered.length) return;
    const result = await send({ type: 'close', tabIds: ordered });
    selected.clear();
    if (result && result.ok) {
      if (toastCount && Date.now() < toastExpiry) toastSince = Math.min(toastSince, result.since || Date.now());
      else { toastCount = 0; toastSince = result.since || Date.now(); }
      toastCount += Number(result.count || ordered.length);
      showToast();
    }
    render();
  }

  let toastExpiry = 0;
  function showToast() {
    if (!els.toast) return;
    els.toastText.textContent = toastCount + ' tab' + (toastCount === 1 ? '' : 's') + ' closed';
    els.toast.classList.add('on');
    const rect = els.panel?.getBoundingClientRect();
    if (rect && shown) {
      let x = 12, y = 12;
      if (settings.edge === 'left') { x = rect.right + 12; y = Math.max(12, rect.bottom - 50); }
      else if (settings.edge === 'right') { x = Math.max(12, rect.left - 12 - 250); y = Math.max(12, rect.bottom - 50); }
      else if (settings.edge === 'top') { x = Math.max(12, rect.right - 280); y = rect.bottom + 12; }
      else { x = Math.max(12, rect.right - 280); y = Math.max(12, rect.top - 48); }
      els.toast.style.left = (x / u) + 'px';
      els.toast.style.top = (y / u) + 'px';
    } else {
      els.toast.style.left = '12px';
      els.toast.style.bottom = '12px';
      els.toast.style.top = 'auto';
    }
    clearTimeout(toastTimer);
    toastExpiry = Date.now() + settings.undoSeconds * 1000;
    toastTimer = setTimeout(hideToast, settings.undoSeconds * 1000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = 0;
    toastCount = 0;
    toastSince = 0;
    toastExpiry = 0;
    if (els.toast) els.toast.classList.remove('on');
  }

  async function undoClosedTabs() {
    if (!toastCount) return;
    const n = toastCount, since = toastSince;
    hideToast();
    const result = await send({ type: 'undo', count: n, since });
    if (result && result.restored < n) {
      // Keep feedback truthful if the browser no longer has all sessions.
      els.toastText.textContent = result.restored === 0
        ? 'No recently closed tabs are available'
        : 'Restored ' + result.restored + ' of ' + n + ' tabs';
      els.toast.classList.add('on');
      els.toastUndo.style.display = 'none';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { if (els.toastUndo) els.toastUndo.style.display = ''; hideToast(); }, 2500);
    }
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipTimer = 0;
    if (tipEl) tipEl.style.display = 'none';
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
      x = tpClamp(x, 4, vw() - tr.width - 4);
      y = tpClamp(y, 4, vh() - tr.height - 4);
      tipEl.style.left = (x / u) + 'px';
      tipEl.style.top = (y / u) + 'px';
    }, 60);
  }

  function hoverable(el) {
    el.addEventListener('mouseenter', () => { hoverPanel = true; clearClose(); });
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
    clearClose();
    // Avoid stacking the live editor's page shield behind the settings modal.
    hotZoneEditMode = false;
    placeHint();
    updateHintVisibility();
    const backdrop = h('div', 'backdrop');
    const card = h('div', 'card');
    const head = h('div', 'cardhead');
    const label = h('span', '', 'Tab Peek settings');
    const close = textBtn('btn', '×');
    close.title = 'Close settings';
    head.append(label, close);
    const frame = h('iframe', 'cardframe');
    frame.title = 'Tab Peek settings';
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
  const pushSize = () => {
    const base = (isVertical() ? settings.panelWidth : settings.barHeight) * u;
    const extra = bookmarks && typeof bookmarks.thickness === 'function' ? bookmarks.thickness() * u : 0;
    return base + extra;
  };

  function syncPush(animate) {
    if (!globalThis.TPX || !globalThis.TPX.push) return;
    if (shown && pinned && pushHere()) TPX.push.on(settings.edge, pushSize(), animate);
    else TPX.push.off(animate);
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

  function ensureWindowRect() {
    if (settings.winRect) return settings.winRect;
    const pw = vw() / u, ph = vh() / u;
    const w = tpClamp(settings.panelWidth || 360, 220, Math.max(220, pw - 24));
    const h0 = tpClamp(Math.min(520, ph - 40), 160, Math.max(160, ph - 24));
    const x = settings.edge === 'right' ? Math.max(12, pw - w - 12) : settings.edge === 'left' ? 12 : tpClamp((pw - w) / 2, 12, Math.max(12, pw - w - 12));
    const y = settings.edge === 'bottom' ? Math.max(12, ph - h0 - 12) : settings.edge === 'top' ? 12 : tpClamp((ph - h0) / 3, 12, Math.max(12, ph - h0 - 12));
    settings.winRect = { x, y, w, h: h0 };
    return settings.winRect;
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
    left = tpClamp(left, 8, Math.max(8, viewportW - width - 8));
    top = tpClamp(top, 8, Math.max(8, viewportH - 40));
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
  }

  function openSearchPopup() {
    if (!settings.showSearch || !els.searchWrap || !ui) return;
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
      const w = tpClamp(rect.w, 52, Math.max(52, pw - 12));
      const hh = tpClamp(rect.h, 80, Math.max(80, ph - 12));
      const x = tpClamp(rect.x, 0, Math.max(0, pw - w));
      const y = tpClamp(rect.y, 0, Math.max(0, ph - hh));
      settings.winRect = { x, y, w, h: hh };
      for (const [key, value] of [['--bx', x], ['--by', y], ['--bw', w], ['--bh', hh]]) hostEl.style.setProperty(key, value + 'px');
    }
    panel.dataset.side = isBox() ? 'start' : (s.edge === 'right' ? 'end' : 'start');
    panel.dataset.dir = (isBox() || isVertical()) ? 'v' : 'h';
    panel.classList.toggle('resizing', resizing);
    const compact = currentWidthUnits() < COMPACT_BELOW;
    panel.classList.toggle('compact', compact);
    panel.classList.toggle('icons', compact || !s.showNames);
    const sizeBadge = els.sizeBadge;
    if (sizeBadge && isBox()) sizeBadge.textContent = Math.round((settings.winRect?.w || 0)) + ' × ' + Math.round((settings.winRect?.h || 0));
    updateSearchLayout();
    updateResizeBuffer();
  }

  function update(instant) {
    if (dead || !els.panel) return;
    if (!allowed()) peek = false;
    const wasShown = shown;
    const vis = wantVisible();
    if (vis && !shown) { needCenter = true; measure(); placeHint(); }
    shown = vis;
    els.panel.classList.toggle('hidden', !vis);
    els.panel.classList.toggle('with-floating-bookmarks', !!(vis && isBox() && settings.bookmarks));
    if (!(vis && isBox() && settings.bookmarks)) els.panel.classList.remove('bookmarks-left');
    updateResizeBuffer();
    if (ui) ui.dataset.theme = settings.theme;
    els.pin.setAttribute('aria-pressed', String(pinned));
    els.pin.title = pinned ? 'Unpin' : 'Pin open (stays visible when you switch tabs)';
    if (els.bookmarkBtn) els.bookmarkBtn.setAttribute('aria-pressed', String(!!settings.bookmarks));
    updateHintVisibility();
    updateTools();

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
    syncPush(!instant);
  }

  function applySettings(instant) {
    if (!els.panel) return;
    const s = settings, p = els.panel;
    p.dataset.edge = s.edge;
    p.dataset.dir = (isBox() || isVertical()) ? 'v' : 'h';
    p.dataset.style = s.style;
    p.dataset.align = tpAlign(s);
    p.dataset.theme = s.theme;
    hostEl.style.setProperty('--accent', s.accent);
    if (ui) ui.dataset.theme = s.theme;
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
          settings.panelWidth = Math.round(tpClamp((start.r - start.l + delta) / u, 52, 800));
        } else {
          const delta = settings.edge === 'top' ? dy : -dy;
          settings.barHeight = Math.round(tpClamp((start.b - start.t + delta) / u, 40, 400));
        }
      } else {
        let { l, t, r, b } = start;
        const minW = 52 * u, minH = 80 * u, W = vw(), H = vh();
        if (handle.includes('e')) r = tpClamp(r + dx, l + minW, W);
        if (handle.includes('w')) l = tpClamp(l + dx, 0, r - minW);
        if (handle.includes('s')) b = tpClamp(b + dy, t + minH, H);
        if (handle.includes('n')) t = tpClamp(t + dy, 0, b - minH);
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
      const xx = tpClamp(x, 0, Math.max(0, pw - dragW));
      const yy = tpClamp(y, 0, Math.max(0, ph - dragH));
      for (const [key, value] of [['--bx', xx], ['--by', yy], ['--bw', dragW], ['--bh', dragH]]) hostEl.style.setProperty(key, value + 'px');
      return { x: xx, y: yy, w: dragW, h: dragH };
    };
    let current = { ...origin };
    const edgeAt = (x, y) => {
      const pad = 36;
      const near = [
        ['left', x], ['right', vw() - x], ['top', y], ['bottom', vh() - y]
      ].sort((a, b) => a[1] - b[1]);
      return near[0][1] <= pad ? near[0][0] : null;
    };
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
      if (!moved) {
        // In docked mode a click opens the on-page hot-zone editor. In
        // windowed mode there is no activation zone to configure.
        if (!isBox()) {
          hotZoneEditMode = !hotZoneEditMode;
          placeHint();
          updateHintVisibility();
        }
        return;
      }
      if (snapEdge) {
        settings.edge = snapEdge;
        settings.style = 'docked';
        settings.winRect = null;
      } else {
        settings.style = 'windowed';
        settings.winRect = current;
        pinned = true;
        peek = false;
        try { api.storage.local.set({ pinned: true }); } catch (_) {}
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
    if (!isBox() || e.button !== 0 || (e.target.closest && e.target.closest('button,input,.searchwrap,.rz'))) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const rect = els.panel.getBoundingClientRect();
    const original = { x: rect.left / u, y: rect.top / u, w: rect.width / u, h: rect.height / u };
    let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved && bookmarks) bookmarks.el.classList.add('dragging-overlay');
      moved = true;
      const pw = vw() / u, ph = vh() / u;
      settings.winRect = {
        x: tpClamp(original.x + dx / u, 0, Math.max(0, pw - original.w)),
        y: tpClamp(original.y + dy / u, 0, Math.max(0, ph - original.h)),
        w: original.w, h: original.h
      };
      applyGeometry();
      if (bookmarks) bookmarks.update();
    };
    const up = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (bookmarks) bookmarks.el.classList.remove('dragging-overlay');
      if (moved) saveSettings();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  // ---------- build UI ----------
  const CSS = globalThis.TPX && globalThis.TPX.CSS ? globalThis.TPX.CSS : '';

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
    hostEl.id = 'tab-peek-host';
    hostEl.style.cssText = 'all:initial!important;position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important';
    root = hostEl.attachShadow({ mode: 'closed' });
    addStyles(root, CSS);
    ui = h('div', 'ui');
    ui.dataset.theme = settings.theme;
    const internalScrollers = '.list, .bmlist, .bmstrip, .menu.scroll, .submenu.scroll';
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
      }
      // Always consume wheel input over Tab Peek, even on blank/non-scrollable
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
    els.grip = iconBtn('btn grip', 'Drag to move or dock. Click to edit the hot zone.', 'M7 5a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 7 5zm5 0a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 12 5zm5 0a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 17 5zM7 11a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 7 11zm5 0a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 12 11zm5 0a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 17 11zM7 17a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 7 17zm5 0a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 12 17zm5 0a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 17 17z');
    els.grip.addEventListener('pointerdown', startDockDrag);
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
    els.searchRow.append(els.grip, els.searchToggle, els.searchWrap);
    els.searchToggle.addEventListener('click', () => {
      if (searchPopupOpen) closeSearchPopup(true);
      else openSearchPopup();
    });
    els.bookmarkBtn = iconBtn('btn bookmarkbtn', 'Show bookmarks', 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z');
    els.pin = iconBtn('btn pin', 'Pin open', ICON_PIN);
    els.gear = iconBtn('btn gear', 'Settings', ICON_GEAR);
    els.edgeTools = h('div', 'edge-tools');
    applyToolbarOrder();
    setupToolbarReordering();
    head.addEventListener('pointerdown', startFloatingMove);

    const tools = h('div', 'tools');
    els.tools = tools;
    els.closeSel = textBtn('tbtn closesel', 'Close');
    els.clearSel = textBtn('tbtn clearsel', 'Clear');
    tools.append(els.closeSel, els.clearSel);
    top.append(head, tools);

    els.list = h('div', 'list');
    els.panel.append(top, els.list, els.edgeTools);
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
    els.toast = h('div', 'toast');
    els.toastText = h('span', '', 'Tabs closed');
    els.toastUndo = textBtn('', 'Undo');
    els.toastUndo.addEventListener('click', undoClosedTabs);
    els.toast.append(els.toastText, els.toastUndo);
    // The shield dims and blocks the page (z-index 2); the panel stays above
    // it (z-index 3), and the editable hot-zone handles stay above both (z-4).
    ui.append(els.snap, els.editShield, els.hint, els.panel, els.dragPreview, els.resizeBuffer, tipEl, els.toast);
    root.appendChild(ui);

    // Create feature modules after their shared elements exist.
    contextMenu = globalThis.TPX.createMenu({
      ui, root, h, vw, vh, u: () => u,
      onOpen: () => clearClose(),
      onClose: () => { if (peek && !pinned && !isBox()) scheduleClose(); }
    });
    bookmarks = globalThis.TPX.createBookmarks({
      ui, h, chevron: chev, menu: contextMenu,
      settings: () => settings,
      shown: () => shown,
      u: () => u,
      panelRect: () => els.panel.getBoundingClientRect(),
      placement: () => ({ left: 'right', right: 'left', top: 'below', bottom: 'above' })[settings.edge],
      floating: () => isBox(),
      vw,
      setFloatingSide: (side) => {
        els.panel.classList.toggle('bookmarks-left', side === 'left');
      },
      send,
      setMode: (mode) => { settings.bookmarksMode = mode; saveSettings(); update(true); },
      open: openBookmark,
      tip: showTip,
      hideTip,
      hoverable,
      editBookmark: openBookmarkEditor,
      addBookmark: addBookmarkFromPanel
    });
    els.panel.addEventListener('transitionend', (e) => {
      if (e.target !== els.panel || !['transform', 'opacity'].includes(e.propertyName) || !bookmarks) return;
      bookmarks.el.classList.remove('pending-place');
      if (shown) bookmarks.update();
    });

    // Avoid page keyboard listeners taking over focus when the address/search field is in use.
    els.panel.addEventListener('mousedown', (e) => {
      if (e.target !== els.search && !(e.target.closest && e.target.closest('button,.tab,.rz'))) e.preventDefault();
    });
    hoverable(els.panel);
    els.pin.addEventListener('click', () => setPinned(!pinned));
    els.bookmarkBtn.addEventListener('click', () => {
      settings.bookmarks = !settings.bookmarks;
      saveSettings();
      update();
    });
    els.gear.addEventListener('click', openSettingsCard);
    els.closeSel.addEventListener('click', () => closeTabs([...selected]));
    els.clearSel.addEventListener('click', clearSel);

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
    els.list.addEventListener('mouseover', (e) => {
      const node = e.target.closest && e.target.closest('.tab,.whead,.ghead');
      if (!node || !els.panel.classList.contains('icons')) return;
      if (e.relatedTarget && node.contains(e.relatedTarget)) return;
      const title = node.dataset.title || (node.classList.contains('whead') ? '' : node.textContent.trim());
      if (!title) return;
      showTip(node.getBoundingClientRect(), title, node.dataset.url || node.dataset.detail || '');
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
    // Multi-tab drag/drop with real before/after positions and named destinations.
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
        if (dragIds.includes(id)) return { invalid: true, node: tabNode };
        const r = tabNode.getBoundingClientRect();
        const after = (isBox() || isVertical()) ? e.clientY >= r.top + r.height / 2 : e.clientX >= r.left + r.width / 2;
        return { target: { kind: 'tab', tabId: id, pos: after ? 'after' : 'before' }, node: tabNode, after };
      }
      const groupNode = e.target.closest && e.target.closest('.ghead');
      if (groupNode) {
        const gid = Number(groupNode.dataset.group);
        const same = dragIds.length > 0 && dragIds.every((id) => getTab(id)?.tab.groupId === gid);
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
    els.list.addEventListener('dragstart', (e) => {
      const tabNode = e.target.closest && e.target.closest('.tab');
      if (!tabNode) return;
      const id = Number(tabNode.dataset.id);
      dragIds = orderedIds(selected.has(id) ? [...selected] : [id]);
      dragTarget = null;
      tabNode.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'tab-peek:' + dragIds.join(','));
      const preview = h('div', 'dragimg' + (dragIds.length > 1 ? ' multi' : ''));
      const found = getTab(id);
      preview.appendChild(h('span', 'dtitle', found?.tab.title || 'Tab'));
      if (dragIds.length > 1) preview.appendChild(h('span', 'dcount', dragIds.length + ' Tabs'));
      ui.appendChild(preview);
      try { e.dataTransfer.setDragImage(preview, 12, 12); } catch (_) {}
      requestAnimationFrame(() => preview.remove());
      clearClose();
    });
    els.list.addEventListener('dragover', (e) => {
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
    });
    els.list.addEventListener('drop', (e) => {
      e.preventDefault();
      const ids = dragIds;
      const target = determineTarget(e);
      clearMarks();
      dragIds = null;
      dragTarget = null;
      if (!ids || !ids.length || !target || target.invalid || !target.target) return;
      send({ type: 'move', tabIds: ids, target: target.target });
      selected.clear();
      render();
    });
    els.list.addEventListener('dragend', () => {
      dragIds = null;
      dragTarget = null;
      clearMarks();
      els.list.querySelectorAll('.tab.dragging').forEach((node) => node.classList.remove('dragging'));
      if (peek && !pinned && !hoverPanel) scheduleClose();
    });

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
    if (globalThis.TPX && globalThis.TPX.push) globalThis.TPX.push.off(false);
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    clearTimeout(resizeTimer);
    clearTimeout(toastTimer);
    clearTimeout(tipTimer);
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
    document.addEventListener('fullscreenchange', () => update());
    document.addEventListener('visibilitychange', () => {
      if (dead) return;
      if (document.visibilityState === 'visible') refreshEnv();
      else { peek = false; hoverPanel = false; lastInZone = false; clearOpen(); clearClose(); }
      update(true);
    });

    api.storage.onChanged.addListener((ch, area) => {
      if (dead || area !== 'local') return;
      if (ch.settings && !resizing) {
        settings = tpNormalize(ch.settings.newValue);
        applySettings();
      }
      if (ch.collapsed) { collapsed = ch.collapsed.newValue || {}; render(); }
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
