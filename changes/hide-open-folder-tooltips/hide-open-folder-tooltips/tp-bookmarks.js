// Bookmarks panel that sits on the page-facing side of the overlay.
//  - overlay on left/right : a small card with names, or a narrow strip of icons
//  - overlay on top/bottom : a Chrome-style bar with a » button for what does not fit
(() => {
  const X = (globalThis.TPX = globalThis.TPX || {});

  X.createBookmarks = (env) => {
    const { ui, h } = env;
    const BAR_H = 36, STRIP_W = 44;

    let data = null, loading = false, failed = false, lastKey = '', fitRaf = 0;
    const openIds = new Set();
    let openFolderMenuId = null;

    const el = h('div', 'bm hidden');
    const content = h('div', 'bmc');
    const dragShield = h('div', 'bm-drag-shield');
    dragShield.setAttribute('aria-hidden', 'true');
    const dragPreview = h('div', 'bm-drag-preview');
    dragPreview.setAttribute('aria-hidden', 'true');
    const dragIconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    dragIconSvg.setAttribute('viewBox', '0 0 24 24');
    dragIconSvg.setAttribute('aria-hidden', 'true');
    const dragIconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    dragIconPath.setAttribute('d', 'M6 3h12v18l-6-4-6 4z');
    dragIconSvg.appendChild(dragIconPath);
    dragPreview.appendChild(dragIconSvg);
    const floatingPreviewPanel = h('div', 'bm-dock-preview bm-dock-preview-panel');
    const floatingPreviewBookmarks = h('div', 'bm-dock-preview bm-dock-preview-bookmarks');
    // The bookmarks drawer is attached directly to the overlay. It is opened
    // by the existing Bookmarks toolbar icon; there is no separate chevron tab.
    el.appendChild(content);
    content.addEventListener('contextmenu', (e) => {
      const target = e.target;
      const blankSurface = target === content || (target && target.classList
        && ['bmlist', 'bmstrip', 'bmbar', 'bmrow', 'bmempty'].some((cls) => target.classList.contains(cls)));
      if (blankSurface) showContextMenu(e, null);
    });
    ui.appendChild(el);
    ui.appendChild(dragShield);
    ui.appendChild(floatingPreviewPanel);
    ui.appendChild(floatingPreviewBookmarks);
    ui.appendChild(dragPreview);
    env.hoverable(el);

    // A DOMRect cannot be copied with {...rect}; its values live on the prototype.
    const plainRect = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
    const panelBox = () => plainRect(env.panelRect());
    const horizontal = () => ['below', 'above', 'floating-top', 'floating-bottom'].includes(el.dataset.pos);
    const label = (n) => n && typeof n.title === 'string' && n.title.trim()
      ? n.title
      : (n && n.url ? '' : 'Folder');
    const canOpenBookmarkUrl = (url) => /^(https?|ftp|file|about|chrome|edge|brave|vivaldi|opera):/i.test(String(url || ''))
      && !/^javascript:/i.test(String(url || ''));
    const bookmarkTooltip = (n) => {
      const name = label(n);
      return {
        title: name || (n && n.url ? String(n.url) : ''),
        detail: name && n && n.url ? String(n.url) : ''
      };
    };
    function bookmarkTooltipSide() {
      const pos = el.dataset.pos || '';
      if (pos === 'left' || pos === 'floating-left') return 'left';
      if (pos === 'right' || pos === 'floating-right') return 'right';
      if (pos === 'above' || pos === 'floating-top') return 'above';
      if (pos === 'below' || pos === 'floating-bottom') return 'below';
      return 'right';
    }
    function isOpenRootFolder(n) {
      return !!(n && n.children && openFolderMenuId === String(n.id) && env.menu.isOpen());
    }

    function attachBookmarkTooltip(target, n, preferredSide) {
      const tip = bookmarkTooltip(n);
      if (!tip.title || !env.tip) return;
      target.addEventListener('mouseenter', () => {
        if (isOpenRootFolder(n)) {
          if (env.hideTip) env.hideTip();
          return;
        }
        env.tip(target.getBoundingClientRect(), tip.title, tip.detail, preferredSide || bookmarkTooltipSide());
      });
      target.addEventListener('mouseleave', () => { if (env.hideTip) env.hideTip(); });
    }

    function makeModeToggle(targetMode) {
      const expanding = targetMode === 'card';
      const btn = h('button', 'tbtn bmmode bm-mode-toggle');
      btn.type = 'button';
      const labelText = expanding ? 'Show bookmark names' : 'Show bookmark icons';
      btn.title = labelText;
      btn.setAttribute('aria-label', labelText);
      const ns = 'http://www.w3.org/2000/svg';
      const s = document.createElementNS(ns, 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', expanding
        ? 'M3 5h12v2H3zM3 10h9v2H3zM3 15h12v2H3zM14 7l5 5-5 5v-3h-3v-4h3z'
        : 'M3 5h12v2H3zM3 10h9v2H3zM3 15h12v2H3zM18 7l-5 5 5 5v-3h3v-4h-3z');
      s.appendChild(p);
      btn.appendChild(s);
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => env.setMode(targetMode));
      return btn;
    }

    // ----- pieces -----
    function icon(n) {
      const s = h('span', 'fav');
      const letter = () => {
        // Keep the icon slot, but do not add a text glyph for an unnamed bookmark.
        const first = (label(n).trim().charAt(0) || '').toUpperCase();
        s.textContent = first;
        if (first) s.classList.add('letter');
      };
      if (!n.url) {
        const ns = 'http://www.w3.org/2000/svg';
        const folder = document.createElementNS(ns, 'svg');
        folder.setAttribute('viewBox', '0 0 24 24');
        folder.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M10 4H3.5A1.5 1.5 0 0 0 2 5.5v13A1.5 1.5 0 0 0 3.5 20h17a1.5 1.5 0 0 0 1.5-1.5V8a1.5 1.5 0 0 0-1.5-1.5H12z');
        path.setAttribute('fill', 'currentColor');
        folder.appendChild(path);
        s.appendChild(folder);
        return s;
      }
      if (X.favicons) {
        X.favicons.mount(s, n.url, '', label(n), { serviceFirst: true, emptyFallback: !label(n), lazy: true });
      } else letter();
      return s;
    }

    function openBm(n, e) {
      if (!n.url || /^javascript:/i.test(n.url)) return;
      const bg = e && (e.ctrlKey || e.metaKey || e.button === 1);
      env.open(n.url, bg ? 'bg' : 'current');
    }

    function openFolderInBackground(n) {
      if (!n || !n.children || !n.children.length) return;
      env.send({ type: 'bookmarkAction', op: 'openFolder', id: n.id });
    }

    function toItems(nodes, suppressFolderTooltips = false) {
      if (!nodes.length) return [{ label: '(empty)', disabled: true }];
      return nodes.map((n) => (n.children
        ? {
            label: label(n), tooltip: suppressFolderTooltips ? null : bookmarkTooltip(n), icon: () => icon(n),
            lazySub: () => toItems(n.children, suppressFolderTooltips), clickSub: true,
            modifiedAction: () => openFolderInBackground(n),
            onContext: (e) => showContextMenu(e, n)
          }
        : {
            label: label(n), tooltip: bookmarkTooltip(n), icon: () => icon(n),
            action: (e) => openBm(n, e), keepOpenOnModified: true,
            onContext: (e) => showContextMenu(e, n)
          }));
    }

    function showFolderMenuBeside(items, rect, side, preserveFolderHover = false) {
      if (horizontal() && env.menu.showBesideAutoVertical) {
        env.menu.showBesideAutoVertical(items, rect, side, preserveFolderHover);
        return;
      }
      if (preserveFolderHover && env.menu.switchFolderBeside) env.menu.switchFolderBeside(items, rect, side);
      else env.menu.showBeside(items, rect, side);
    }

    function toggleFolderMenu(n, button, side) {
      const id = String(n.id);
      if (env.menu.isOpen() && openFolderMenuId === id) {
        env.menu.hide();
        openFolderMenuId = null;
        return;
      }
      openFolderMenuId = id;
      env.hideTip();
      showFolderMenuBeside(toItems(n.children, true), button.getBoundingClientRect(), side);
      // Clicking a root folder is the first intentional step into folder
      // navigation. From this point on, hovering another root folder switches
      // immediately, just like hovering another sibling inside the menu.
      if (env.menu.activateFolderHoverMode) env.menu.activateFolderHoverMode();
    }

    function hoverSwitchFolderMenu(n, button, side) {
      if (!env.menu.isFolderHoverActive || !env.menu.isFolderHoverActive()) return;
      const id = String(n.id);
      if (openFolderMenuId === id) return;
      openFolderMenuId = id;
      env.hideTip();
      const rect = button.getBoundingClientRect();
      showFolderMenuBeside(toItems(n.children, true), rect, side, true);
    }


    async function showContextMenu(e, n) {
      e.preventDefault();
      e.stopPropagation();
      const targetParentId = n && n.children
        ? n.id
        : (n && n.parentId != null ? n.parentId : (data && data.barId));
      const targetId = n && n.id;
      const isPage = !!(n && n.url);
      const isFolder = !!(n && Array.isArray(n.children));
      const folderCount = isFolder ? n.children.filter((child) => child && child.url && canOpenBookmarkUrl(child.url)).length : 0;
      const [clip, capabilities] = await Promise.all([
        env.send({ type: 'bookmarkAction', op: 'clipboardGet' }),
        env.send({ type: 'bookmarkAction', op: 'capabilities' })
      ]);
      const run = (op, values = {}, refreshAfter = false) => async () => {
        const result = await env.send({ type: 'bookmarkAction', op, ...values });
        if (result && result.ok && refreshAfter) {
          failed = false;
          load();
        }
      };
      const action = (labelText, op, values, enabled = true, refreshAfter = false) => ({
        label: labelText,
        disabled: !enabled,
        action: run(op, values, refreshAfter)
      });
      const edit = {
        label: 'Edit...',
        disabled: !n || !env.editBookmark,
        action: () => env.editBookmark && env.editBookmark(n)
      };
      const addPage = {
        label: 'Add page...',
        disabled: !targetParentId || !env.addBookmark,
        action: () => env.addBookmark && env.addBookmark('page', String(targetParentId))
      };
      const addFolder = {
        label: 'Add folder...',
        disabled: !targetParentId || !env.addBookmark,
        action: () => env.addBookmark && env.addBookmark('folder', String(targetParentId))
      };
      const openItems = isFolder ? [
        action('Open all (' + folderCount + ')', 'openFolder', { id: targetId }, folderCount > 0),
        action('Open all (' + folderCount + ') in new window', 'openFolderWindow', { id: targetId }, folderCount > 0),
        action('Open all (' + folderCount + ') in incognito window', 'openFolderIncognito', { id: targetId }, folderCount > 0),
        action('Open all (' + folderCount + ') in new tab group', 'openFolderGroup', { id: targetId }, folderCount > 0 && !!(capabilities && capabilities.tabGroups))
      ] : [
        action('Open in new tab', 'openTab', { url: n && n.url }, isPage),
        action('Open in new window', 'openWindow', { url: n && n.url }, isPage),
        action('Open in split view', 'openSplit', { url: n && n.url }, isPage && !!(capabilities && capabilities.splitView)),
        action('Open in Incognito window', 'openIncognito', { url: n && n.url }, isPage)
      ];
      const items = [
        ...openItems,
        { sep: true },
        edit,
        { sep: true },
        action('Cut', 'clipboardSet', { id: targetId, cut: true }, !!targetId),
        action('Copy', 'clipboardSet', { id: targetId, cut: false }, !!targetId),
        action('Paste', 'clipboardPaste', { parentId: targetParentId }, !!(targetParentId && clip && clip.available), true),
        { sep: true },
        action('Delete', 'delete', { id: targetId }, !!targetId, true),
        { sep: true },
        addPage,
        addFolder,
        { sep: true },
        { label: 'Open bookmarks manager', action: run('openManager') },
        { label: 'Show bookmark bar', action: run('showBarSettings') }
      ];
      if (env.menu.showContext) env.menu.showContext(items, e.clientX, e.clientY);
      else env.menu.show(items, e.clientX, e.clientY);
    }

    function allTop() {
      const list = data.bar.slice();
      if (data.other.length) list.push({ id: data.otherId || 'other', title: 'Other bookmarks', children: data.other });
      return list;
    }

    // ----- horizontal bar (like a browser's own) -----
    function renderBar() {
      const bar = h('div', 'bmbar');
      const floatingHorizontal = env.floating && env.floating()
        && (el.dataset.pos === 'floating-top' || el.dataset.pos === 'floating-bottom');
      const dockedHorizontal = !env.floating() && env.vertical && env.vertical()
        && (el.dataset.pos === 'above' || el.dataset.pos === 'below')
        && ['top', 'bottom'].includes(env.settings().floatingBookmarksEdge);
      if (floatingHorizontal || dockedHorizontal) {
        bar.classList.add('bm-placement-drag-surface');
        bar.addEventListener('pointerdown', (e) => startBookmarkPlacementDrag(e, true));
      }
      const row = h('div', 'bmrow');
      const items = [];
      const mk = (n) => {
        const b = h('button', 'bmitem');
        b.type = 'button';
        b.append(icon(n), h('span', 'bmt', label(n)));
        b.title = label(n) || n.url || '';
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('contextmenu', (e) => showContextMenu(e, n));
        if (n.children) {
          b.classList.add('bm-folder-menu-trigger');
          const side = (el.dataset.pos === 'below' || el.dataset.pos === 'floating-bottom') ? 'above' : 'below';
          b.addEventListener('mouseenter', () => hoverSwitchFolderMenu(n, b, side));
          b.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) { e.preventDefault(); openFolderInBackground(n); return; }
            toggleFolderMenu(n, b, side);
          });
          b.addEventListener('auxclick', (e) => {
            if (e.button === 1) { e.preventDefault(); openFolderInBackground(n); }
          });
        } else {
          b.addEventListener('click', (e) => openBm(n, e));
          b.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); openBm(n, e); } });
        }
        return b;
      };
      for (const n of data.bar) { const b = mk(n); items.push(b); row.appendChild(b); }
      const more = h('button', 'bmitem bmmore', '»');
      more.type = 'button';
      more.title = 'More bookmarks';
      more.style.display = 'none';
      more.addEventListener('mousedown', (e) => e.preventDefault());
      bar.append(row, more);
      if (data.other.length) {
        const o = mk({ id: data.otherId || 'other', title: 'Other bookmarks', children: data.other });
        o.classList.add('bmother');
        bar.appendChild(o);
      }
      content.appendChild(bar);
      bar._fit = () => {
        for (const b of items) b.style.display = '';
        more.style.display = '';
        let cut = -1;
        const w = row.clientWidth;
        items.forEach((b, i) => { if (cut < 0 && b.offsetLeft + b.offsetWidth > w + 0.5) cut = i; });
        if (cut < 0) { more.style.display = 'none'; return; }
        for (let i = cut; i < items.length; i++) items[i].style.display = 'none';
        more.onclick = () => env.menu.showBeside(toItems(data.bar.slice(cut)), more.getBoundingClientRect(), (el.dataset.pos === 'above' || el.dataset.pos === 'floating-bottom') ? 'above' : 'below');
      };
      fitSoon();
    }

    function fitSoon() {
      cancelAnimationFrame(fitRaf);
      fitRaf = requestAnimationFrame(() => {
        const bar = content.querySelector('.bmbar');
        if (bar && bar._fit) bar._fit();
      });
    }

    // ----- vertical strip: icons only -----
    function renderStrip() {
      const modeButton = makeModeToggle('card');
      const head = h('div', 'bmhead bmstriphead');
      const divider = h('div', 'bm-strip-divider');
      divider.title = 'Drag the divider below the expand button to reposition bookmarks';
      divider.setAttribute('aria-label', 'Drag to reposition bookmarks');
      divider.addEventListener('pointerdown', startBookmarkPlacementDrag);
      head.append(modeButton, divider);
      head.addEventListener('pointerdown', startBookmarkPlacementDrag);
      const list = h('div', 'bmstrip');
      const pos = el.dataset.pos || '';
      const side = pos.endsWith('left') ? 'left' : pos.endsWith('right') ? 'right' : (pos.endsWith('top') ? 'above' : 'below');
      for (const n of allTop()) {
        const b = h('button', 'bmicon');
        b.type = 'button';
        b.appendChild(icon(n));
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('mouseenter', () => {
          if (isOpenRootFolder(n)) {
            env.hideTip();
            return;
          }
          const title = label(n);
          const hoverText = title || n.url || '';
          if (hoverText) env.tip(b.getBoundingClientRect(), hoverText, title ? (n.url || '') : '', side);
          else env.hideTip();
        });
        b.addEventListener('mouseleave', () => env.hideTip());
        b.addEventListener('contextmenu', (e) => showContextMenu(e, n));
        if (n.children) {
          b.classList.add('bm-folder-menu-trigger');
          b.addEventListener('mouseenter', () => hoverSwitchFolderMenu(n, b, side));
          b.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey) { e.preventDefault(); openFolderInBackground(n); return; }
            toggleFolderMenu(n, b, side);
          });
          b.addEventListener('auxclick', (e) => {
            if (e.button === 1) { e.preventDefault(); openFolderInBackground(n); }
          });
        } else {
          b.addEventListener('click', (e) => openBm(n, e));
          b.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); openBm(n, e); } });
        }
        list.appendChild(b);
      }
      content.append(head, list);
    }

    // ----- vertical card: named items; folders open the same popup as strip mode -----
    function renderCard() {
      const head = h('div', 'bmhead');
      const title = h('span', 'bmtitle', 'Bookmarks');
      const mode = makeModeToggle('strip');
      head.append(title, mode);
      head.title = 'Drag this header to reposition bookmarks';
      head.addEventListener('pointerdown', startBookmarkPlacementDrag);
      const list = h('div', 'bmlist');
      const pos = el.dataset.pos || '';
      const side = pos.endsWith('left') ? 'left'
        : pos.endsWith('right') ? 'right'
        : (pos.endsWith('top') ? 'above' : 'below');

      for (const n of allTop()) {
        const row = h('div', 'bmr');
        row.style.paddingLeft = '8px';
        row.append(h('span', 'bmsp'), icon(n), h('span', 'bmt', label(n)));
        attachBookmarkTooltip(row, n);
        if (n.children) {
          row.classList.add('bm-folder-menu-trigger');
          // Once a folder popup is open, hovering another top-level folder
          // switches immediately, matching icon-strip and horizontal-bar mode.
          row.addEventListener('mouseenter', () => hoverSwitchFolderMenu(n, row, side));
          row.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (e.ctrlKey || e.metaKey) { openFolderInBackground(n); return; }
            toggleFolderMenu(n, row, side);
          });
          row.addEventListener('auxclick', (e) => {
            if (e.button === 1) { e.preventDefault(); e.stopPropagation(); openFolderInBackground(n); }
          });
        } else {
          row.addEventListener('click', (e) => openBm(n, e));
          row.addEventListener('auxclick', (e) => {
            if (e.button === 1) { e.preventDefault(); openBm(n, e); }
          });
        }
        row.addEventListener('contextmenu', (e) => showContextMenu(e, n));
        list.appendChild(row);
      }
      if (!list.childNodes.length) list.appendChild(h('div', 'bmr bmempty', 'No bookmarks yet'));
      content.append(head, list);
    }
    function renderContent() {
      content.replaceChildren();
      const s = env.settings();
      if (!s.bookmarks) return;
      if (!data) { content.appendChild(h('div', 'bmempty', loading ? 'Loading…' : 'Bookmarks are not available')); return; }
      if (el.dataset.mode === 'floating') {
        if (el.dataset.pos === 'floating-top' || el.dataset.pos === 'floating-bottom') renderBar();
        else if (s.bookmarksMode === 'strip') renderStrip();
        else renderCard();
      } else if (horizontal()) renderBar();
      else if (s.bookmarksMode === 'strip') renderStrip();
      else renderCard();
    }

    // In floating mode, drag the bookmarks header to choose one of the overlay's four edges.
    const FLOATING_BOOKMARK_MIN = 120;
    const FLOATING_BOOKMARK_MAX = 250;
    let floatingPreviewEdge = null;
    let placementDragging = false;

    function isVerticalDocked() {
      return !!(!(env.floating && env.floating()) && env.vertical && env.vertical());
    }

    function floatingSpaces(r) {
      const u = env.u();
      const width = window.innerWidth / u;
      const height = window.innerHeight / u;
      return {
        left: Math.max(0, r.left / u),
        right: Math.max(0, width - r.right / u),
        top: Math.max(0, r.top / u),
        bottom: Math.max(0, height - r.bottom / u)
      };
    }

    function activeDockedBookmarkEdge() {
      const edge = env.settings().floatingBookmarksEdge || 'auto';
      return isVerticalDocked() && env.settings().bookmarks && ['top', 'bottom'].includes(edge)
        ? edge
        : null;
    }

    function basePanelRect(rect) {
      const u = env.u();
      const edge = activeDockedBookmarkEdge();
      if (edge === 'top') return { ...rect, top: rect.top - BAR_H * u, height: rect.height + BAR_H * u };
      if (edge === 'bottom') return { ...rect, bottom: rect.bottom + BAR_H * u, height: rect.height + BAR_H * u };
      return { ...rect };
    }

    function shiftedPanelRect(baseRect, edge) {
      const u = env.u();
      // Windowed mode is an overlay: bookmarks never move or resize it.
      if (env.floating && env.floating()) return { ...baseRect };
      if (isVerticalDocked() && edge === 'top') {
        return { ...baseRect, top: baseRect.top + BAR_H * u, height: Math.max(1, baseRect.height - BAR_H * u) };
      }
      if (isVerticalDocked() && edge === 'bottom') {
        return { ...baseRect, bottom: baseRect.bottom - BAR_H * u, height: Math.max(1, baseRect.height - BAR_H * u) };
      }
      return { ...baseRect };
    }

    function resolveFloatingEdge(preferred, spaces) {
      const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
      const minimumFor = (side) => side === 'top' || side === 'bottom'
        ? BAR_H
        : (env.settings().bookmarksMode === 'strip' ? STRIP_W : FLOATING_BOOKMARK_MIN);
      let edge = preferred;
      if (!['left', 'right', 'top', 'bottom'].includes(edge)) {
        edge = (spaces.right >= FLOATING_BOOKMARK_MAX || spaces.right >= spaces.left) ? 'right' : 'left';
      }
      if (spaces[edge] >= minimumFor(edge)) return edge;
      if (spaces[opposite[edge]] >= minimumFor(opposite[edge])) return opposite[edge];
      const fitting = ['left', 'right', 'top', 'bottom'].filter((side) => spaces[side] >= minimumFor(side));
      if (fitting.length) return fitting.sort((a, b) => spaces[b] - spaces[a])[0];
      return ['left', 'right', 'top', 'bottom'].sort((a, b) => spaces[b] - spaces[a])[0] || opposite[edge];
    }

    function resolveRequestedFloatingEdge(preferred, rect) {
      const base = basePanelRect(rect);
      if (!['left', 'right', 'top', 'bottom'].includes(preferred)) return resolveFloatingEdge(null, floatingSpaces(base));
      // Top/bottom are browser-viewport destinations in Windowed mode, not spaces around the panel.
      if (env.floating && env.floating() && (preferred === 'top' || preferred === 'bottom')) return preferred;
      if (isVerticalDocked()) return preferred;
      return resolveFloatingEdge(preferred, floatingSpaces(shiftedPanelRect(base, preferred)));
    }

    function nearestFloatingEdge(x, y) {
      // Top/bottom are detected at the browser viewport edges, regardless of
      // where the Windowed overlay is placed horizontally.
      const viewportH = window.innerHeight;
      const edgeZone = 48;
      if (y <= edgeZone) return 'top';
      if (y >= viewportH - edgeZone) return 'bottom';

      // Elsewhere, bookmarks remain adjacent to either side of the overlay.
      const r = basePanelRect(panelBox());
      const edgeY = Math.max(r.top, Math.min(r.bottom, y));
      return [
        ['left', Math.hypot(x - r.left, y - edgeY)],
        ['right', Math.hypot(x - r.right, y - edgeY)]
      ].sort((a, b) => a[1] - b[1])[0][0];
    }

    function positionPreviewBox(node, left, top, width, height) {
      const u = env.u();
      node.style.display = 'block';
      node.style.left = (left / u) + 'px';
      node.style.top = (top / u) + 'px';
      node.style.width = Math.max(1, width / u) + 'px';
      node.style.height = Math.max(1, height / u) + 'px';
    }

    function hideFloatingDragPreview() {
      floatingPreviewPanel.style.display = 'none';
      floatingPreviewBookmarks.style.display = 'none';
      floatingPreviewPanel.removeAttribute('data-edge');
      floatingPreviewBookmarks.removeAttribute('data-edge');
    }

    function showFloatingDragPreview(edge, panelRect, bookmarkSize) {
      const floating = !!(env.floating && env.floating());
      const showDockedPanelDestination = !floating && isVerticalDocked() && (edge === 'top' || edge === 'bottom');
      if (showDockedPanelDestination) {
        floatingPreviewPanel.dataset.edge = edge;
        positionPreviewBox(floatingPreviewPanel, panelRect.left, panelRect.top, panelRect.width, panelRect.height);
      } else {
        floatingPreviewPanel.style.display = 'none';
        floatingPreviewPanel.removeAttribute('data-edge');
      }

      floatingPreviewBookmarks.dataset.edge = edge;
      if (edge === 'left') {
        positionPreviewBox(floatingPreviewBookmarks, panelRect.left - bookmarkSize * env.u(), panelRect.top, bookmarkSize * env.u(), panelRect.height);
      } else if (edge === 'right') {
        positionPreviewBox(floatingPreviewBookmarks, panelRect.right, panelRect.top, bookmarkSize * env.u(), panelRect.height);
      } else {
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const top = edge === 'top' ? 0 : viewportH - bookmarkSize * env.u();
        positionPreviewBox(floatingPreviewBookmarks, 0, top, viewportW, bookmarkSize * env.u());
      }
    }

    function moveBookmarkDragVisuals(ev, visible) {
      // Hide only the drawer being dragged; never modify the actual overlay.
      if (visible) {
        el.classList.add('dragging-placement');
        dragShield.style.display = 'block';
        dragPreview.style.display = 'grid';
        dragPreview.style.left = ev.clientX + 'px';
        dragPreview.style.top = ev.clientY + 'px';
      } else {
        el.classList.remove('dragging-placement');
        dragShield.style.display = 'none';
        dragPreview.style.display = 'none';
      }
    }

    function startBookmarkPlacementDrag(e, allowButtons = false) {
      if (e.button !== 0) return;
      const startedOnButton = !!(e.target.closest && e.target.closest('button'));
      if (startedOnButton && !allowButtons) return;
      if (!(env.floating && env.floating()) && !(env.vertical && env.vertical())) return;
      // Preserve a bookmark click if the pointer does not move into a drag.
      if (!startedOnButton) e.preventDefault();
      e.stopPropagation();
      let moved = false;
      const startX = e.clientX, startY = e.clientY;
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        moved = true;
        placementDragging = true;
        if (ev.cancelable) ev.preventDefault();
        moveBookmarkDragVisuals(ev, true);
        const next = nearestFloatingEdge(ev.clientX, ev.clientY);
        if (next !== floatingPreviewEdge) {
          floatingPreviewEdge = next;
          place();
        }
      };
      const finish = (ev) => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', finish, true);
        window.removeEventListener('pointercancel', finish, true);
        placementDragging = false;
        if (!moved) {
          floatingPreviewEdge = null;
          moveBookmarkDragVisuals(ev, false);
          hideFloatingDragPreview();
          return;
        }
        if (ev.type !== 'pointerup') {
          floatingPreviewEdge = null;
          moveBookmarkDragVisuals(ev, false);
          hideFloatingDragPreview();
          place();
          return;
        }
        let edge = resolveRequestedFloatingEdge(nearestFloatingEdge(ev.clientX, ev.clientY), panelBox());
        if (isVerticalDocked() && (edge === 'left' || edge === 'right')) edge = 'auto';
        floatingPreviewEdge = null;
        moveBookmarkDragVisuals(ev, false);
        hideFloatingDragPreview();
        if (env.setFloatingBookmarkEdge) env.setFloatingBookmarkEdge(edge);
        else place();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', finish, true);
      window.addEventListener('pointercancel', finish, true);
    }

    // ----- placement next to the overlay -----
    function place() {
      const u = env.u(), actualRect = panelBox(), st = el.style;
      const floating = !!(env.floating && env.floating());
      const s = env.settings();
      el.dataset.view = s.bookmarksMode || 'card';

      if (floating) {
        const storedEdge = s.floatingBookmarksEdge || 'auto';
        const requestedEdge = floatingPreviewEdge || storedEdge;
        const edge = resolveRequestedFloatingEdge(requestedEdge, actualRect);
        const r = floatingPreviewEdge !== null ? basePanelRect(actualRect) : actualRect;
        const spaces = floatingSpaces(r);
        const horizontalEdge = edge === 'top' || edge === 'bottom';
        const preferredSize = horizontalEdge
          ? BAR_H
          : (s.bookmarksMode === 'strip' ? STRIP_W : FLOATING_BOOKMARK_MAX);
        const sideSize = horizontalEdge ? BAR_H : Math.max(1, Math.min(preferredSize, spaces[edge]));
        el.dataset.pos = 'floating-' + edge;
        el.dataset.mode = 'floating';
        st.right = 'auto';
        st.bottom = 'auto';
        if (edge === 'left' || edge === 'right') {
          el.style.setProperty('--bm-floating-width', sideSize + 'px');
          el.style.removeProperty('--bm-floating-height');
          st.top = (r.top / u) + 'px';
          st.height = (r.height / u) + 'px';
          st.width = 'auto';
          st.left = ((edge === 'right' ? r.right : r.left) / u) + 'px';
          st.transform = edge === 'right' ? '' : 'translateX(-100%)';
        } else {
          const viewportW = window.innerWidth;
          const viewportH = window.innerHeight / u;
          el.style.removeProperty('--bm-floating-width');
          el.style.setProperty('--bm-floating-height', sideSize + 'px');
          st.left = '0px';
          st.width = (viewportW / u) + 'px';
          st.height = sideSize + 'px';
          st.top = (edge === 'top' ? 0 : Math.max(0, viewportH - sideSize)) + 'px';
          st.transform = '';
        }
        if (floatingPreviewEdge !== null) {
          el.classList.add('dragging-placement');
          showFloatingDragPreview(edge, r, sideSize);
        } else {
          el.classList.remove('dragging-placement');
          hideFloatingDragPreview();
        }
        // Never alter the overlay's classes during a bookmark drag.
        if (floatingPreviewEdge === null && env.setFloatingSide) {
          env.setFloatingSide(s.bookmarks && (edge === 'left' || edge === 'right') ? edge : null);
        }
        return;
      }

      el.style.removeProperty('--bm-floating-width');
      el.style.removeProperty('--bm-floating-height');
      const dockedEdge = activeDockedBookmarkEdge();
      const previewing = floatingPreviewEdge !== null;
      const targetEdge = previewing ? floatingPreviewEdge : dockedEdge;
      const baseRect = previewing ? basePanelRect(actualRect) : actualRect;
      const r = previewing ? shiftedPanelRect(baseRect, targetEdge) : actualRect;
      const horizontalEdge = targetEdge === 'top' || targetEdge === 'bottom';
      const pos = horizontalEdge
        ? (targetEdge === 'top' ? 'above' : 'below')
        : env.placement();
      el.dataset.pos = pos;
      el.dataset.mode = (pos === 'below' || pos === 'above') ? 'bar' : s.bookmarksMode;
      st.right = 'auto';
      if (pos === 'right' || pos === 'left') {
        st.top = (r.top / u) + 'px';
        st.height = (r.height / u) + 'px';
        st.width = 'auto';
        st.bottom = 'auto';
        st.left = ((pos === 'right' ? r.right : r.left) / u) + 'px';
        st.transform = pos === 'right' ? '' : 'translateX(-100%)';
      } else {
        const viewportW = window.innerWidth;
        st.left = horizontalEdge ? '0px' : (r.left / u) + 'px';
        st.width = horizontalEdge ? (viewportW / u) + 'px' : (r.width / u) + 'px';
        st.height = 'auto';
        st.top = ((pos === 'below' ? r.bottom : r.top) / u) + 'px';
        st.transform = pos === 'below' ? '' : 'translateY(-100%)';
      }

      if (previewing) {
        el.classList.add('dragging-placement');
        const visualEdge = horizontalEdge ? targetEdge : (env.placement() === 'right' ? 'right' : 'left');
        const sideSize = horizontalEdge ? BAR_H : (s.bookmarksMode === 'strip' ? STRIP_W : FLOATING_BOOKMARK_MAX);
        showFloatingDragPreview(visualEdge, r, sideSize);
      } else {
        el.classList.remove('dragging-placement');
        hideFloatingDragPreview();
      }
      if (!previewing && env.setFloatingSide) env.setFloatingSide(s.bookmarks ? dockedEdge : null);
    }

    let treeSig = '', reloadQueued = false;
    async function load() {
      if (loading) { reloadQueued = true; return; }
      loading = true;
      const r = await env.send({ type: 'bmTree' });
      loading = false;
      let changed = true;
      if (r) {
        let sig = '';
        try { sig = JSON.stringify(r); } catch (_) {}
        changed = !data || !sig || sig !== treeSig;
        treeSig = sig;
        data = r; failed = false;
      } else if (!data) failed = true;
      // Only rebuild the bookmark UI when the tree really changed; keeping the
      // old data meanwhile avoids the "Loading..." flash on every refresh.
      if (changed) lastKey = '';
      update();
      if (reloadQueued) { reloadQueued = false; load(); }
    }

    function update() {
      const s = env.settings(), vis = env.shown();
      el.classList.toggle('hidden', !vis);
      el.classList.toggle('open', !!s.bookmarks);
      if (!vis) return;
      place();
      if (s.bookmarks && !data && !loading && !failed) load();
      const key = [el.dataset.pos, el.dataset.mode, s.bookmarksMode, s.bookmarks, !!data].join('|');
      if (key !== lastKey) { lastKey = key; renderContent(); }
      else if (horizontal() && s.bookmarks) fitSoon();
    }

    // Space the bookmarks take on the page side (used to push the page by the right amount).
    function thickness() {
      const s = env.settings();
      if (!env.shown() || !s.bookmarks || (env.floating && env.floating())) return 0;
      if (activeDockedBookmarkEdge()) return 0;
      if (el.dataset.pos === 'below' || el.dataset.pos === 'above') return BAR_H;
      // The drawer starts directly at the overlay edge; no chevron tab is present.
      return s.bookmarksMode === 'strip' ? STRIP_W : 250;
    }

    new ResizeObserver(() => { if (horizontal() && env.settings().bookmarks) fitSoon(); }).observe(content);

    return {
      el,
      update,
      isPlacementDragging: () => placementDragging,
      thickness,
      hasOpenFolders() {
        const s = env.settings();
        const menuFolderOpen = openFolderMenuId !== null && env.menu.isOpen();
        const inPlaceFolderOpen = s.bookmarksMode === 'card' && !horizontal() && openIds.size > 0;
        return !!s.bookmarks && (menuFolderOpen || inPlaceFolderOpen);
      },
      closeNavigation() {
        openFolderMenuId = null;
        openIds.clear();
        env.menu.hide();
        if (env.hideTip) env.hideTip();
        renderContent();
      },
      refresh() { failed = false; if (env.settings().bookmarks) load(); else { data = null; treeSig = ''; lastKey = ''; } }
    };
  };
})();
