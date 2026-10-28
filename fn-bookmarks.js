// Bookmarks panel that sits on the page-facing side of the overlay.
//  - overlay on left/right : a small card with names, or a narrow strip of icons
//  - overlay on top/bottom : a Chrome-style bar with a » button for what does not fit
(() => {
  const X = (globalThis.FNX = globalThis.FNX || {});

  X.createBookmarks = (env) => {
    const { ui, h } = env;
    const BAR_H = 36, STRIP_W = 44;

    let data = null, loading = false, failed = false, lastKey = '', fitRaf = 0;
    let barOverflowCut = -1;
    const openIds = new Set();
    let openFolderMenuId = null;
    let openMoreMenu = false;

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
      target.addEventListener('pointerenter', () => {
        if (isOpenRootFolder(n)) {
          if (env.hideTip) env.hideTip();
          return;
        }
        env.tip(target.getBoundingClientRect(), tip.title, tip.detail, preferredSide || bookmarkTooltipSide());
      });
      target.addEventListener('pointerleave', () => { if (env.hideTip) env.hideTip(); });
    }

    // Bookmark drag handling lives in content.js; these attributes are the
    // small hand-off contract for both Chrome-tree reordering and dragging a
    // bookmark onto a window/tab or the page.
    function markBookmarkDraggable(target, n, index) {
      if (!target || !n || n.id == null) return;
      target.dataset.bmId = String(n.id);
      if (n.parentId != null) target.dataset.bmParent = String(n.parentId);
      const i = Number.isInteger(index) ? index : (Number.isInteger(n.index) ? n.index : null);
      if (Number.isInteger(i)) target.dataset.bmIndex = String(i);
      target.dataset.bmTitle = n.title || '';
      target.dataset.bmUrl = n.url || '';
      target.dataset.bmFolder = n.children ? '1' : '0';
      // Folder entries and leaf bookmark items are draggable sources; drag images are sanitized in content.js.
      target.draggable = true;
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

    // ----- custom folder icons -----
    // Per-folder look, stored by bookmark id: { color?: '#hex', glyph?: key, emoji?: 'text' }.
    const FOLDER_GLYPHS = {
      star: ['Star', 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'],
      heart: ['Heart', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z'],
      home: ['Home', 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'],
      work: ['Work', 'M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 0h-4V4h4v2z'],
      book: ['Reading', 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z'],
      code: ['Code', 'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6z'],
      music: ['Music', 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'],
      cart: ['Shopping', 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z'],
      game: ['Games', 'M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z'],
      mail: ['Mail', 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z'],
      bolt: ['Bolt', 'M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z']
    };
    const FOLDER_COLORS = [
      ['Grey', '#9aa0a6'], ['Blue', '#4f8cff'], ['Red', '#ea5b52'], ['Yellow', '#f2b631'], ['Green', '#34a853'],
      ['Pink', '#ee6fb0'], ['Purple', '#a66cf0'], ['Cyan', '#2cc1d6'], ['Orange', '#f28b3d']
    ];
    const FOLDER_SHAPE = 'M10 4H3.5A1.5 1.5 0 0 0 2 5.5v13A1.5 1.5 0 0 0 3.5 20h17a1.5 1.5 0 0 0 1.5-1.5V8a1.5 1.5 0 0 0-1.5-1.5H12z';
    let iconSig = '';
    const folderSpec = (n) => {
      const map = env.folderIcons ? env.folderIcons() : null;
      const spec = map && n && map[String(n.id)];
      if (!spec) return null;
      // Optionally keep custom icons to the vertical list; bars and their menus stay default.
      if (env.settings().folderIconsVerticalOnly && horizontal()) return null;
      return spec;
    };
    const svgIcon = (d, color) => {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      if (color) svg.style.color = color;
      return svg;
    };

    // One menu entry opens a separate picker popup, so choosing colors or symbols
    // never closes a menu: the popup stays until you press Done.
    function folderIconMenu(n, anchor) {
      const id = String(n.id);
      return {
        label: 'Folder icon…',
        action: () => env.pickFolderIcon && env.pickFolderIcon({
          id, name: label(n), anchor: anchor || el.getBoundingClientRect(),
          glyphs: FOLDER_GLYPHS, colors: FOLDER_COLORS, shape: FOLDER_SHAPE, svgIcon
        })
      };
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
        const spec = folderSpec(n);
        if (spec && spec.emoji) {
          s.textContent = spec.emoji;
          s.classList.add('emoji');
          return s;
        }
        const glyph = spec && FOLDER_GLYPHS[spec.glyph];
        s.appendChild(svgIcon(glyph ? glyph[1] : FOLDER_SHAPE, spec && spec.color));
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

    function toItems(nodes, suppressFolderTooltips = false, parentId = '') {
      if (!nodes.length) return [{ label: '(empty)', disabled: true }];
      return nodes.map((n, index) => {
        // The main bookmark rows and the folder-popover rows share the same
        // data contract with content.js so drag/drop behaves identically.
        const bookmark = {
          id: n.id,
          parentId: n.parentId != null ? n.parentId : parentId,
          index: Number.isInteger(n.index) ? n.index : index,
          title: label(n),
          url: n.url || '',
          folder: !!n.children
        };
        return n.children
          ? {
              bookmark,
              label: label(n), tooltip: suppressFolderTooltips ? null : bookmarkTooltip(n), icon: () => icon(n),
              lazySub: () => toItems(n.children, suppressFolderTooltips, n.id), clickSub: true,
              modifiedAction: () => openFolderInBackground(n),
              onContext: (e) => showContextMenu(e, n)
            }
          : {
              bookmark,
              label: label(n), tooltip: bookmarkTooltip(n), icon: () => icon(n),
              action: (e) => openBm(n, e), keepOpenOnModified: true,
              onContext: (e) => showContextMenu(e, n)
            };
      });
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
      openMoreMenu = false;
      const id = String(n.id);
      if (env.menu.isOpen() && openFolderMenuId === id) {
        env.menu.hide();
        openFolderMenuId = null;
        return;
      }
      openFolderMenuId = id;
      env.hideTip();
      showFolderMenuBeside(toItems(n.children, true, n.id), button.getBoundingClientRect(), side);
      // Clicking a root folder is the first intentional step into folder
      // navigation. From this point on, hovering another root folder switches
      // immediately, just like hovering another sibling inside the menu.
      if (env.menu.activateFolderHoverMode) env.menu.activateFolderHoverMode();
    }

    function hoverSwitchFolderMenu(n, button, side) {
      if (!env.menu.isFolderHoverActive || !env.menu.isFolderHoverActive()) return;
      openMoreMenu = false;
      const id = String(n.id);
      if (openFolderMenuId === id) return;
      openFolderMenuId = id;
      env.hideTip();
      const rect = button.getBoundingClientRect();
      showFolderMenuBeside(toItems(n.children, true, n.id), rect, side, true);
    }

    function isBookmarkDragEvent(e) {
      return !!(e && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('application/x-fullnav-bookmark'));
    }

    function openFolderOnBookmarkDrag(n, button, side, e) {
      if (!n || !n.children || !isBookmarkDragEvent(e)) return;
      const id = String(n.id);
      if (openFolderMenuId === id && env.menu.isMainOpen && env.menu.isMainOpen()) {
        // Dragging back over the root folder means the user has returned to the
        // top of this folder's popup; collapse every deeper open subfolder.
        if (env.menu.collapseFolders) env.menu.collapseFolders();
        if (env.menu.activateFolderHoverMode) env.menu.activateFolderHoverMode();
        return;
      }
      openMoreMenu = false;
      openFolderMenuId = id;
      env.hideTip();
      showFolderMenuBeside(toItems(n.children, true, n.id), button.getBoundingClientRect(), side, true);
      if (env.menu.activateFolderHoverMode) env.menu.activateFolderHoverMode();
    }


    async function showContextMenu(e, n) {
      openMoreMenu = false;
      e.preventDefault();
      e.stopPropagation();
      // Remember which row was clicked (before any await) so popups can sit beside it.
      const rowEl = e.target && e.target.closest && e.target.closest('.mi,.bmr,.bmicon,.bmitem');
      const rr = rowEl ? rowEl.getBoundingClientRect() : null;
      const anchor = rr && rr.width ? rr
        : { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY, width: 1, height: 1 };
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
        ...(isFolder && n.id != null && env.setFolderIcon ? [folderIconMenu(n, anchor)] : []),
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
        { label: env.settings().bookmarks ? 'Hide bookmark bar' : 'Show bookmark bar', action: () => env.toggleBookmarks && env.toggleBookmarks() }
      ];
      if (env.menu.showContext) env.menu.showContext(items, e.clientX, e.clientY);
      else env.menu.show(items, e.clientX, e.clientY);
    }

    function allTop() {
      const list = data.bar.slice();
      if (data.other.length) list.push({
        id: data.otherId || 'other',
        parentId: data.otherParentId,
        index: data.otherIndex,
        title: 'Other bookmarks',
        children: data.other
      });
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
      const mk = (n, index) => {
        const b = h('button', 'bmitem');
        b.type = 'button';
        b.append(icon(n), h('span', 'bmt', label(n)));
        b.title = label(n) || n.url || '';
        markBookmarkDraggable(b, n, index);
        attachBookmarkTooltip(b, n);
        b.addEventListener('contextmenu', (e) => showContextMenu(e, n));
        if (n.children) {
          b.classList.add('bm-folder-menu-trigger');
          const side = (el.dataset.pos === 'below' || el.dataset.pos === 'floating-bottom') ? 'above' : 'below';
          b.addEventListener('mouseenter', () => hoverSwitchFolderMenu(n, b, side));
          b.addEventListener('dragenter', (e) => openFolderOnBookmarkDrag(n, b, side, e));
          b.addEventListener('dragover', (e) => openFolderOnBookmarkDrag(n, b, side, e));
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
      data.bar.forEach((n, index) => { const b = mk(n, index); items.push(b); row.appendChild(b); });
      const more = h('button', 'bmitem bmmore', '»');
      more.type = 'button';
      more.title = 'More bookmarks';
      more.style.display = 'none';
      more.addEventListener('mousedown', (e) => e.preventDefault());
      bar.append(row, more);
      if (data.other.length) {
        const o = mk({
          id: data.otherId || 'other',
          parentId: data.otherParentId,
          index: data.otherIndex,
          title: 'Other bookmarks',
          children: data.other
        }, data.otherIndex);
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
        barOverflowCut = cut;
        if (cut < 0) { more.style.display = 'none'; return; }
        for (let i = cut; i < items.length; i++) items[i].style.display = 'none';
        more.onclick = () => {
          // The menu's outside-dismiss handler exempts this trigger so the
          // second click reaches this toggle before the menu is removed.
          if (openMoreMenu && env.menu.isMainOpen && env.menu.isMainOpen()) {
            env.menu.hide();
            openMoreMenu = false;
            openFolderMenuId = null;
            return;
          }
          openMoreMenu = true;
          openFolderMenuId = null;
          const side = (el.dataset.pos === 'below' || el.dataset.pos === 'floating-bottom') ? 'above' : 'below';
          showFolderMenuBeside(toItems(data.bar.slice(cut), false, data.barId), more.getBoundingClientRect(), side);
        };
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
      allTop().forEach((n, index) => {
        const b = h('button', 'bmicon');
        b.type = 'button';
        b.appendChild(icon(n));
        markBookmarkDraggable(b, n, index);
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
          b.addEventListener('dragenter', (e) => openFolderOnBookmarkDrag(n, b, side, e));
          b.addEventListener('dragover', (e) => openFolderOnBookmarkDrag(n, b, side, e));
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
      });
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

      allTop().forEach((n, index) => {
        const row = h('div', 'bmr');
        row.style.paddingLeft = '8px';
        row.append(h('span', 'bmsp'), icon(n), h('span', 'bmt', label(n)));
        markBookmarkDraggable(row, n, index);
        attachBookmarkTooltip(row, n);
        if (n.children) {
          row.classList.add('bm-folder-menu-trigger');
          // Once a folder popup is open, hovering another top-level folder
          // switches immediately, matching icon-strip and horizontal-bar mode.
          row.addEventListener('mouseenter', () => hoverSwitchFolderMenu(n, row, side));
          row.addEventListener('dragenter', (e) => openFolderOnBookmarkDrag(n, row, side, e));
          row.addEventListener('dragover', (e) => openFolderOnBookmarkDrag(n, row, side, e));
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
      });
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
      // The Other windows popover consumes space from the same side it occupies:
      // right-aligned popovers reduce the bar's right edge; left-aligned popovers
      // shift the bar and its contents right, reducing the bar's left-side width.
      const barInset = (!previewing && env.barInset) ? env.barInset() : 0;
      const barOffset = (!previewing && env.barOffset) ? env.barOffset() : 0;
      if (pos === 'right' || pos === 'left') {
        st.top = (r.top / u) + 'px';
        st.height = (r.height / u) + 'px';
        st.width = 'auto';
        st.bottom = 'auto';
        st.left = ((pos === 'right' ? r.right : r.left) / u) + 'px';
        st.transform = pos === 'right' ? '' : 'translateX(-100%)';
      } else {
        const horizontalBar = pos === 'below' || pos === 'above';
        const leftPush = horizontalBar ? barOffset : 0;
        const rightPush = horizontalBar && leftPush <= 0 ? barInset : 0;
        const barWidth = Math.max(1, (r.width / u) - leftPush - rightPush);
        st.left = horizontalBar ? ((r.left / u) + leftPush) + 'px' : (r.left / u) + 'px';
        st.width = barWidth + 'px';
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

    // A folder popup that is open while its contents change (a page added, edited
    // or deleted, an icon changed) is rebuilt in place instead of showing stale rows.
    function findNode(nodes, id) {
      for (const node of nodes) {
        if (String(node.id) === String(id)) return node;
        if (node.children) { const hit = findNode(node.children, id); if (hit) return hit; }
      }
      return null;
    }
    function rebuildOpenFolderMenu() {
      if (!data || openFolderMenuId === null || !env.menu.isMainOpen || !env.menu.isMainOpen()) return;
      const node = findNode(allTop(), openFolderMenuId);
      if (!node || !node.children) return;
      env.menu.rebuildMain(toItems(node.children, true, node.id));
    }

    function rebuildOpenMoreMenu() {
      if (!data || !openMoreMenu || !env.menu.isMainOpen || !env.menu.isMainOpen()) return;
      // The overflow slice depends on the live bar width, so recompute it
      // before rebuilding. This keeps the open » menu in sync after a bookmark
      // is moved into or out of the overflow without closing/reopening it.
      const bar = content.querySelector('.bmbar');
      if (bar && bar._fit) bar._fit();
      if (barOverflowCut < 0) {
        openMoreMenu = false;
        openFolderMenuId = null;
        if (env.menu.hide) env.menu.hide();
        return;
      }
      env.menu.rebuildMain(toItems(data.bar.slice(barOverflowCut), false, data.barId));
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
      if (changed) rebuildOpenFolderMenu();
      rebuildOpenMoreMenu();
      if (reloadQueued) { reloadQueued = false; load(); }
    }

    function update() {
      const s = env.settings(), vis = env.shown();
      el.classList.toggle('hidden', !vis);
      el.classList.toggle('open', !!s.bookmarks);
      if (!vis) return;
      place();
      if (s.bookmarks && !data && !loading && !failed) load();
      const key = [el.dataset.pos, el.dataset.mode, s.bookmarksMode, s.bookmarks, !!data, iconSig, !!s.folderIconsVerticalOnly].join('|');
      if (key !== lastKey) { lastKey = key; renderContent(); }
      else if (horizontal() && s.bookmarks) fitSoon();
    }

    // Space the bookmarks take on the page side (used to push the page by the right amount).
    function thickness() {
      const s = env.settings();
      if (!env.shown() || !s.bookmarks || (env.floating && env.floating())) return 0;
      if (activeDockedBookmarkEdge()) return 0;
      if (el.dataset.pos === 'below' || el.dataset.pos === 'above') return BAR_H;
      // The icon strip reserves page space. The expanded names card does not:
      // it floats over the page, which stays where the strip left it, so
      // expanding and collapsing the drawer never shifts the page.
      return STRIP_W;
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
        openMoreMenu = false;
        openIds.clear();
        env.menu.hide();
        if (env.hideTip) env.hideTip();
        renderContent();
      },
      // Re-render when custom folder icons change.
      refreshIcons() {
        let sig = '';
        try { sig = JSON.stringify(env.folderIcons ? env.folderIcons() : {}); } catch (_) {}
        if (sig === iconSig) return;
        iconSig = sig;
        update();
        rebuildOpenFolderMenu();
        rebuildOpenMoreMenu();
      },
      refresh() { failed = false; if (env.settings().bookmarks) load(); else { data = null; treeSig = ''; lastKey = ''; } }
    };
  };
})();
