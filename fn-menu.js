// A small menu (with sub-menus) drawn by FullNav. Every entry runs a real browser feature.
// Item shapes: {label, action, disabled, danger, checked, dot:'#hex', icon:()=>Node, sub:[items]}
(() => {
  const X = (globalThis.FNX = globalThis.FNX || {});
  X.createMenu = (env) => {
    const { ui, root, h } = env;
    let el = null, open = false, contextEl = null, contextOpen = false;
    let folderHoverMode = false;
    // Bookmark drags navigate the open folder chain. Track the last row under
    // the pointer so moving back up to an ancestor can collapse that ancestor
    // (not just the child submenu it contains). A collapsed row is remembered
    // until the pointer leaves it, otherwise the next dragover would reopen it.
    let lastDragHoverRow = null;
    let dragHoverCollapsedRow = null;
    const isOpen = () => open || contextOpen;

    function notifyClosedIfLast(wasOpen) {
      if (wasOpen && !isOpen() && env.onClose) env.onClose();
    }
    function resetDragHoverState() {
      lastDragHoverRow = null;
      dragHoverCollapsedRow = null;
    }
    function hideMain() {
      const wasOpen = open;
      if (el) el.remove();
      el = null; open = false; folderHoverMode = false;
      resetDragHoverState();
      notifyClosedIfLast(wasOpen);
    }

    function activateFolderHoverMode() {
      if (open && el) folderHoverMode = true;
    }
    function isFolderHoverActive() {
      return !!(folderHoverMode && open && el);
    }

    function isBookmarkDragEvent(e) {
      return !!(e && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('application/x-fullnav-bookmark'));
    }
    function hideContext() {
      const wasOpen = contextOpen;
      if (contextEl) contextEl.remove();
      contextEl = null; contextOpen = false;
      notifyClosedIfLast(wasOpen);
    }
    function hide() {
      const wasOpen = isOpen();
      if (el) el.remove();
      if (contextEl) contextEl.remove();
      el = null; contextEl = null; open = false; contextOpen = false;
      resetDragHoverState();
      notifyClosedIfLast(wasOpen);
    }

    // Escape dismisses only the topmost layer: first a context menu, then the
    // deepest opened folder submenu, then the root folder menu. It never owns
    // or closes the FullNav overlay itself.
    function closeLatest() {
      if (contextOpen) { hideContext(); return true; }
      if (!open || !el) return false;
      const opened = Array.from(el.querySelectorAll('.mi.open'));
      if (opened.length) {
        const latest = opened[opened.length - 1];
        latest.classList.remove('open');
        latest.querySelectorAll('.mi.open').forEach((row) => row.classList.remove('open'));
        return true;
      }
      hideMain();
      return true;
    }

    function eventPath(e) {
      return typeof e.composedPath === 'function' ? e.composedPath() : [];
    }
    function isInside(menuEl, e) {
      if (!menuEl) return false;
      const path = eventPath(e);
      return path.includes(menuEl) || (e.target && menuEl.contains(e.target));
    }
    // These listeners sit on the page's window. The overlay lives in a closed
    // shadow root, so for presses inside the overlay the page only sees the host
    // element (composedPath cannot reveal the menu). Those presses are handled
    // by the listeners on `root` below; only presses on the page itself close
    // everything here. The press is never stopped, so it still reaches the page.
    function dismissOutside(e) {
      if (!isOpen()) return;
      if (e.target === root.host) return;
      hide();
    }

    function build(items, cls, owner) {
      const box = h('div', cls);
      box.style.pointerEvents = 'auto';
      box.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
      fill(box, items, owner);
      return box;
    }

    // Fills a menu box with rows. Folder submenus are built lazily (the first
    // time they are opened) via `lazySub`, so opening a big bookmarks folder no
    // longer builds every nested folder's rows and icons up front.
    function fill(box, items, owner) {
      const dismiss = owner === 'context' ? hideContext : hideMain;
      if (!items.some((i) => i.sub || i.lazySub)) box.classList.add('scroll');
      for (const it of items) {
        if (it.sep) { box.appendChild(h('div', 'msep')); continue; }
        const row = h('div', 'mi' + (it.disabled ? ' dis' : '') +
          (it.danger ? ' danger' : '') + ((it.sub || it.lazySub) ? ' has-sub' : '') +
          (it.clickSub ? ' click-sub' : ''));
        if (it.bookmark) {
          const bm = it.bookmark;
          row.dataset.bmId = String(bm.id);
          row.dataset.bmParent = bm.parentId == null ? '' : String(bm.parentId);
          row.dataset.bmIndex = String(bm.index);
          row.dataset.bmTitle = String(bm.title || '');
          row.dataset.bmUrl = String(bm.url || '');
          row.dataset.bmFolder = bm.folder ? '1' : '0';
          // Folder rows are draggable too; content.js supplies a clean drag image without nested submenu DOM.
          row.draggable = true;
        }
        if (it.tooltip && it.tooltip.title && typeof env.tip === 'function') {
          row.addEventListener('mouseenter', () => {
            const rect = row.getBoundingClientRect();
            const side = rect.left + rect.width / 2 < env.vw() / 2 ? 'right' : 'left';
            env.tip(rect, it.tooltip.title, it.tooltip.detail || '', side);
          });
          row.addEventListener('mouseleave', () => { if (env.hideTip) env.hideTip(); });
        } else if (it.title) row.title = String(it.title);
        if (typeof it.onContext === 'function') {
          row.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation(); it.onContext(e);
          });
        }
        const lead = h('span', 'mlead');
        if (it.dot) {
          const d = h('span', 'mdot'); d.style.background = it.dot; lead.appendChild(d);
        } else if (it.icon) lead.appendChild(it.icon());
        row.append(lead, h('span', 'mlabel', it.label));
        if (it.shortcut) row.appendChild(h('span', 'mshortcut', it.shortcut));
        if (it.checked) row.appendChild(h('span', 'mchk', '✓'));

        if (it.sub || it.lazySub) {
          row.appendChild(h('span', 'marrow', '›'));
          let sm;
          let ensureBuilt = () => {};
          if (it.lazySub) {
            sm = h('div', 'submenu');
            sm.style.pointerEvents = 'auto';
            sm.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
            let built = false;
            ensureBuilt = () => {
              if (built) return;
              built = true;
              fill(sm, it.lazySub(), owner);
            };
          } else sm = build(it.sub, 'submenu', owner);
          row.appendChild(sm);
          const positionSubmenu = () => {
            ensureBuilt();
            sm.classList.remove('flip');
            sm.style.top = '';
            sm.style.display = 'block';
            const mainMenu = row.closest('.menu.main');
            const obstacles = mainMenu ? popupObstacleRects() : [];
            const W = env.vw(), H = env.vh(), u = env.u() || 1, pad = 4;
            const rowRect = row.getBoundingClientRect();
            const rightRect = sm.getBoundingClientRect();
            sm.classList.add('flip');
            const leftRect = sm.getBoundingClientRect();
            sm.classList.remove('flip');
            const baseTop = rowRect.top - 6 * u;
            // Submenus can be taller than the space between their row and the
            // screen edge. In particular, a folder menu opened upward from the
            // bottom bookmark bar would otherwise spill down across the bar.
            // Try the natural offset first, then both sides of every obstacle
            // and the viewport, keeping the popup wholly reachable.
            const topCandidates = [baseTop, pad, H - pad - Math.max(rightRect.height, leftRect.height)];
            for (const obstacle of obstacles) {
              topCandidates.push(obstacle.top - Math.max(rightRect.height, leftRect.height) - pad);
              topCandidates.push(obstacle.bottom + pad);
            }
            const candidates = [];
            for (const side of ['right', 'left']) {
              const width = side === 'right' ? rightRect.width : leftRect.width;
              const height = side === 'right' ? rightRect.height : leftRect.height;
              const left = side === 'right' ? rowRect.right - 4 * u : rowRect.left + 4 * u - width;
              for (const top of topCandidates) {
                const rect = { left, top, right: left + width, bottom: top + height };
                const overflow = Math.max(0, pad - rect.left) + Math.max(0, pad - rect.top)
                  + Math.max(0, rect.right - (W - pad)) + Math.max(0, rect.bottom - (H - pad));
                const overlap = obstacles.reduce((sum, obstacle) => sum + rectOverlapArea(rect, obstacle), 0);
                // Keep the normal right-side placement when both sides are
                // equally clear, and prefer the submenu's natural top offset.
                const sideBias = side === 'right' ? 0 : 1;
                candidates.push({
                  side, top, width, height,
                  score: overlap * 10000000 + overflow * 10000
                    + Math.abs(top - baseTop) * 0.02 + sideBias
                });
              }
            }
            candidates.sort((a, b) => a.score - b.score);
            const chosen = candidates[0];
            if (!chosen) { sm.style.display = ''; return; }
            sm.classList.toggle('flip', chosen.side === 'left');
            sm.style.top = ((chosen.top - rowRect.top) / u) + 'px';
            sm.style.display = '';
          };
          if (it.clickSub) {
            const closeSiblingFolders = () => {
              for (const sibling of Array.from(box.children)) {
                if (sibling === row || !sibling.classList || !sibling.classList.contains('mi')) continue;
                sibling.classList.remove('open');
                sibling.querySelectorAll('.mi.open').forEach((node) => node.classList.remove('open'));
              }
            };
            const openThisFolder = () => {
              closeSiblingFolders();
              row.classList.add('open');
              positionSubmenu();
            };
            // The menu-level bookmark-drag handler opens this row when the
            // pointer is over it and closes any deeper levels when the pointer
            // moves back up the hierarchy.
            if (it.bookmark && it.bookmark.folder) row._fnBookmarkFolderOpen = openThisFolder;
            // A row-level fallback keeps the same behavior even when a native
            // drag event is retargeted to a submenu or a nested row. Only the
            // row directly under the pointer handles it.
            const closeDescendantsOnDragHover = (e) => {
              if (!isBookmarkDragEvent(e)) return;
              let direct = e.target && e.target.closest && e.target.closest('.mi');
              // Match the menu-level hit test so a retargeted event cannot make
              // a row that is no longer under the pointer reopen itself.
              if (typeof root.elementFromPoint === 'function'
                  && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
                const hit = root.elementFromPoint(e.clientX, e.clientY);
                if (hit && el.contains(hit)) {
                  const hitRow = hit.closest && hit.closest('.mi');
                  if (hitRow) direct = hitRow;
                }
              }
              if (direct !== row) return;
              folderHoverMode = true;
              handleDragHoverRow(row);
            };
            row.addEventListener('dragenter', closeDescendantsOnDragHover, true);
            row.addEventListener('dragover', closeDescendantsOnDragHover, true);
            // Before any folder has been clicked, hovering is intentionally inert.
            // Once the user enters folder navigation, hovering another folder
            // switches to it immediately and closes the previously open sibling.
            row.addEventListener('mouseenter', () => {
              if (!folderHoverMode || row.classList.contains('open')) return;
              openThisFolder();
            });
            row.addEventListener('click', (e) => {
              e.stopPropagation();
              if (it.disabled) return;
              if ((e.ctrlKey || e.metaKey) && it.modifiedAction) {
                it.modifiedAction(e); return;
              }
              folderHoverMode = true;
              const wasOpen = row.classList.contains('open');
              closeSiblingFolders();
              row.classList.toggle('open', !wasOpen);
              if (wasOpen) sm.style.top = '';
              else positionSubmenu();
            });
            row.addEventListener('auxclick', (e) => {
              if (e.button !== 1 || it.disabled || !it.modifiedAction) return;
              e.preventDefault(); e.stopPropagation(); it.modifiedAction(e);
            });
          } else {
            row.addEventListener('mouseenter', positionSubmenu);
          }
        } else {
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            if (it.disabled) return;
            if (it.keepOpenOnModified && (e.ctrlKey || e.metaKey)) {
              if (it.action) it.action(e); return;
            }
            dismiss();
            if (it.action) it.action(e);
          });
          row.addEventListener('auxclick', (e) => {
            if (e.button !== 1 || it.disabled || !it.keepOpenOnModified) return;
            e.preventDefault(); e.stopPropagation();
            if (it.action) it.action(e);
          });
        }
        row.addEventListener('mousedown', (e) => { if (!it.bookmark) e.preventDefault(); });
        box.appendChild(row);
      }
    }

    function popupObstacleRects() {
      const rects = [], seen = new Set();
      for (const node of ui.querySelectorAll('.panel,.bm .bmc,.winpop:not(.hidden)')) {
        const r = node.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const key = [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)).join(':');
        if (seen.has(key)) continue;
        seen.add(key);
        rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
      }
      return rects;
    }

    function rectOverlapArea(a, b) {
      const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return w * h;
    }

    function collapseFolders() {
      if (!open || !el) return;
      el.querySelectorAll('.mi.open').forEach((row) => row.classList.remove('open'));
    }

    function rowVisible(row) {
      return !!(row && row.isConnected && row.getClientRects().length);
    }
    function closeFolderRow(row) {
      if (!row) return;
      row.classList.remove('open');
      row.querySelectorAll('.mi.open').forEach((node) => node.classList.remove('open'));
    }
    function keepOnlyOpenPath(row) {
      const keep = new Set();
      for (let node = row; node && node !== el; node = node.parentElement) {
        if (node.nodeType === 1 && node.classList && node.classList.contains('mi') && node.classList.contains('open')) {
          keep.add(node);
        }
      }
      el.querySelectorAll('.mi.open').forEach((node) => {
        if (!keep.has(node)) node.classList.remove('open');
      });
    }
    function handleDragHoverRow(row) {
      if (!row || !el || !el.contains(row)) {
        collapseFolders();
        resetDragHoverState();
        return;
      }
      const previous = lastDragHoverRow;
      // Returning from a child submenu to the folder that owns it closes that
      // folder too, not just the deeper submenu. D -> C therefore leaves C's
      // row visible and closed instead of keeping C expanded.
      const cameFromInside = !!(previous && previous !== row
        && row.contains(previous) && rowVisible(previous));
      if (cameFromInside) {
        closeFolderRow(row);
        dragHoverCollapsedRow = row;
        lastDragHoverRow = row;
        return;
      }
      if (row.classList.contains('open')) {
        keepOnlyOpenPath(row);
        dragHoverCollapsedRow = null;
        lastDragHoverRow = row;
        return;
      }
      // A folder collapsed by this hover must stay closed while the pointer
      // remains on it. Leaving and re-entering is a fresh hover and may open it.
      if (dragHoverCollapsedRow === row && previous === row) {
        lastDragHoverRow = row;
        return;
      }
      dragHoverCollapsedRow = null;
      keepOnlyOpenPath(row);
      if (row._fnBookmarkFolderOpen) row._fnBookmarkFolderOpen();
      lastDragHoverRow = row;
    }

    // Bookmark drags use the open folder chain as their navigation path. The
    // closest row under the pointer is the path's deepest valid level; every
    // open folder below that level is closed. Moving back onto an open ancestor
    // also closes that ancestor, so D -> C -> B collapses each level as it is
    // left. This also handles the pointer being over a sibling leaf or the
    // empty part of a parent's submenu, not just directly over the parent row.
    function handleBookmarkDragHover(e) {
      if (!open || !el || !isBookmarkDragEvent(e)) return;
      // Native drag events can be retargeted to an ancestor (or to the shadow
      // host) as the pointer crosses nested popups. Resolve the actual row
      // under the pointer when possible; fall back to the event target.
      let target = e.target;
      if (typeof root.elementFromPoint === 'function'
          && Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
        const hit = root.elementFromPoint(e.clientX, e.clientY);
        if (hit && el.contains(hit)) target = hit;
      }
      if (!target || !el.contains(target)) return;
      folderHoverMode = true;
      const row = target.closest && target.closest('.mi');
      handleDragHoverRow(row);
    }

    function place(menuEl, x, y, side, anchorRect = null) {
      const u = env.u() || 1;
      menuEl.style.left = (x / u) + 'px';
      menuEl.style.top = (y / u) + 'px';
      const measured = menuEl.getBoundingClientRect();

      if (menuEl.classList.contains('main') && anchorRect) {
        const width = measured.width, height = measured.height;
        const W = env.vw(), H = env.vh(), pad = 4;
        const obstacles = popupObstacleRects();
        const sides = ['right', 'left', 'below', 'above'];
        const candidates = sides.map((candidateSide) => {
          let left = candidateSide === 'left' ? anchorRect.left - width - pad
            : candidateSide === 'right' ? anchorRect.right + pad
            : Math.max(pad, Math.min(anchorRect.left, W - width - pad));
          let top = candidateSide === 'above' ? anchorRect.top - height - pad
            : candidateSide === 'below' ? anchorRect.bottom + pad
            : Math.max(pad, Math.min(anchorRect.top, H - height - pad));

          for (let pass = 0; pass < obstacles.length + 1; pass++) {
            let changed = false;
            const rect = { left, top, right: left + width, bottom: top + height };
            for (const obstacle of obstacles) {
              const anchorInside = rectOverlapArea(anchorRect, obstacle) > 0;
              if (!anchorInside && rectOverlapArea(rect, obstacle) === 0) continue;
              if (candidateSide === 'left' || candidateSide === 'right') {
                if (rect.bottom <= obstacle.top || rect.top >= obstacle.bottom) continue;
                const next = candidateSide === 'left' ? obstacle.left - width - pad : obstacle.right + pad;
                if (next !== left) { left = next; changed = true; }
              } else {
                if (rect.right <= obstacle.left || rect.left >= obstacle.right) continue;
                const next = candidateSide === 'above' ? obstacle.top - height - pad : obstacle.bottom + pad;
                if (next !== top) { top = next; changed = true; }
              }
            }
            if (!changed) break;
          }
          const rect = { left, top, right: left + width, bottom: top + height };
          const overflow = Math.max(0, pad - left) + Math.max(0, pad - top)
            + Math.max(0, rect.right - (W - pad)) + Math.max(0, rect.bottom - (H - pad));
          const overlap = obstacles.reduce((sum, obstacle) => sum + rectOverlapArea(rect, obstacle), 0);
          const preferred = candidateSide === side ? -1 : 0;
          return { left, top, overflow, overlap, score: overlap * 100000 + overflow * 1000 + preferred };
        });
        candidates.sort((a, b) => a.score - b.score);
        const chosen = candidates[0];
        let left = chosen.left, top = chosen.top;
        if (chosen.overlap !== 0) {
          // If no clear slot exists, use the least-overlapping position and keep
          // enough of the popup reachable rather than burying it under the panel.
          left = Math.max(pad - width + 24, Math.min(left, W - pad - 24));
          top = Math.max(pad - height + 24, Math.min(top, H - pad - 24));
        }
        menuEl.style.left = (left / u) + 'px';
        menuEl.style.top = (top / u) + 'px';
        return;
      }

      let nx = x, ny = y;
      if (side === 'left') nx = x - measured.width;
      if (side === 'above') ny = y - measured.height;
      nx = Math.max(4, Math.min(nx, env.vw() - 4 - measured.width));
      ny = Math.max(4, Math.min(ny, env.vh() - 4 - measured.height));
      menuEl.style.left = (nx / u) + 'px';
      menuEl.style.top = (ny / u) + 'px';
    }

    function show(items, x, y, side, preserveFolderHover = false, anchorRect = null) {
      const keepFolderHover = folderHoverMode;
      hide();
      folderHoverMode = !!(preserveFolderHover && keepFolderHover);
      if (!items.length) return;
      el = build(items, 'menu main', 'main'); ui.appendChild(el); open = true;
      if (env.onOpen) env.onOpen();
      place(el, x, y, side, anchorRect);
    }
    function showContext(items, x, y, side, compact = false) {
      hideContext();
      if (!items.length) return;
      contextEl = build(items, 'menu context-menu', 'context');
      if (compact) contextEl.classList.add('compact-context');
      ui.appendChild(contextEl); contextOpen = true;
      if (env.onOpen) env.onOpen();
      place(contextEl, x, y, side);
    }
    function showBeside(items, rect, side) {
      show(items, side === 'right' ? rect.right : rect.left, side === 'below' ? rect.bottom : rect.top, side, false, rect);
    }
    function showBesideAutoVertical(items, rect, preferredSide, preserveFolderHover = false) {
      const side = preferredSide === 'above' ? 'above' : 'below';
      show(items, rect.left, side === 'below' ? rect.bottom : rect.top, side, preserveFolderHover, rect);
    }
    function switchFolderBeside(items, rect, side) {
      show(items, side === 'right' ? rect.right : rect.left, side === 'below' ? rect.bottom : rect.top, side, true, rect);
    }
    // Rebuild the open folder popup in place (same position, same opened
    // sub-folders and scroll) after its bookmarks changed.
    function rebuildMain(items) {
      if (!open || !el) return false;
      const rowsOf = (box) => Array.from(box.children).filter((c) => c.classList && c.classList.contains('mi'));
      const path = [];
      let box = el;
      for (;;) {
        const idx = rowsOf(box).findIndex((r) => r.classList.contains('open'));
        if (idx < 0) break;
        path.push(idx);
        const next = rowsOf(box)[idx].querySelector(':scope > .submenu');
        if (!next) break;
        box = next;
      }
      const top = el.scrollTop;
      const hover = folderHoverMode;
      el.replaceChildren();
      resetDragHoverState();
      fill(el, items.length ? items : [{ label: '(empty)', disabled: true }], 'main');
      folderHoverMode = hover;
      box = el;
      for (const idx of path) {
        const row = rowsOf(box)[idx];
        if (!row) break;
        // Rebuild while a drag has just ended, so a synthetic row click can be
        // swallowed by the bookmark-click suppression window. Open the folder
        // through its direct helper instead, then continue down its submenu.
        if (row._fnBookmarkFolderOpen) row._fnBookmarkFolderOpen();
        else row.click();
        box = row.querySelector(':scope > .submenu');
        if (!box) break;
      }
      el.scrollTop = top;
      return true;
    }
    const isMainOpen = () => !!(open && el);
    function showContextBeside(items, rect, side) {
      showContext(items, side === 'right' ? rect.right : rect.left, side === 'below' ? rect.bottom : rect.top, side);
    }

    window.addEventListener('blur', hide);
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') hide(); });
    // Pressing anywhere on the page closes the folder menu and any context menu,
    // even while the overlay is pinned. Registered on window (capture) so it runs
    // before page scripts that stop propagation lower down.
    window.addEventListener('mousedown', dismissOutside, true);
    window.addEventListener('pointerdown', dismissOutside, true);
    window.addEventListener('contextmenu', dismissOutside, true);
    const dismissOverlayMenuOutside = (e) => {
      const target = e.target;
      // Dialogs opened from a menu (edit bookmark, folder icon...) must not close
      // the menu they came from: it stays open underneath them.
      if (target && target.closest && target.closest('.prompt,.backdrop')) return;
      const insideMenu = target && target.closest && target.closest('.menu');
      const folderTrigger = target && target.closest && target.closest('.bm-folder-menu-trigger');
      const overflowTrigger = target && target.closest && target.closest('.bmmore');
      if (isOpen() && !insideMenu && !folderTrigger && !overflowTrigger) hide();
    };
    root.addEventListener('dragstart', resetDragHoverState, true);
    root.addEventListener('dragend', resetDragHoverState, true);
    root.addEventListener('dragenter', handleBookmarkDragHover, true);
    root.addEventListener('dragover', handleBookmarkDragHover, true);
    root.addEventListener('mousedown', dismissOverlayMenuOutside, true);
    // The horizontal bookmarks bar can receive clicks in places where its own
    // handlers prevent the usual mouse sequence from dismissing the popup.
    // Capture click as a second outside-dismiss path; menu rows and folder
    // triggers remain exempt, and target handlers still run normally afterward.
    root.addEventListener('click', dismissOverlayMenuOutside, true);
    // Right-clicking somewhere else inside the overlay closes an open context menu.
    root.addEventListener('contextmenu', (e) => {
      const target = e.target;
      const insideMenu = target && target.closest && target.closest('.menu');
      if (contextOpen && !insideMenu) hideContext();
    }, true);
    return { rebuildMain, isMainOpen, show, showBeside, showBesideAutoVertical, switchFolderBeside, activateFolderHoverMode, isFolderHoverActive, collapseFolders, showContext, showContextBeside, hide, closeLatest, isOpen };
  };
})();
