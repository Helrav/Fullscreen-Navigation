// Drag and drop extras for FullNav. Loaded after fn-bookmarks.js: it wraps the
// bookmarks factory so it can attach to the overlay without touching content.js.
//  - Links, URLs and files dragged from the page, another window or the desktop
//    open the overlay when held at the hot zone, and open when dropped on the tab
//    strip (above or below a tab, on a window, or on empty strip space).
//  - A bookmark dropped on empty tab-strip space (for example in current-window-only
//    mode, which has no window header) opens there.
//  - Bookmark folders can be dragged to reorder them. They never open their tabs.
//  - Dragging a bookmark over the » button opens the overflow menu, and an open
//    overflow menu is rebuilt after a bookmark moved.
(() => {
  const X = (globalThis.FNX = globalThis.FNX || {});
  if (!X.createBookmarks || X.fnDropInstalled) return;
  X.fnDropInstalled = true;

  const HOST_ID = 'fn-host';
  const LINK_TYPES = ['Files', 'text/uri-list', 'text/x-moz-url', 'DownloadURL'];
  // Files are opened through a data: URL, which browsers cap at about 2 MB.
  const FILE_LIMIT = 1400000;

  const original = X.createBookmarks;
  X.createBookmarks = (env) => {
    const api = original(env);
    try { install(env, api); } catch (_) {}
    return api;
  };

  function install(env, bmApi) {
    const { ui } = env;
    let internalDrag = false;     // a drag that started inside the overlay
    let bookmarkSource = null;    // { id } while a bookmark row is being dragged
    let folderSource = false;     // the dragged bookmark is a folder
    let foreignActive = false;    // a link or file is being dragged in from outside
    let foreignTimer = 0;
    let hoverPart = null;
    let moreTimer = 0;
    let resync = false;
    let resyncTimer = 0;

    const typesOf = (dt) => (dt && dt.types ? Array.from(dt.types) : []);
    const hasLinkTypes = (dt) => typesOf(dt).some((t) => LINK_TYPES.includes(t));
    const inOverlay = (node) => !!(node && (node.id === HOST_ID || (node.closest && node.closest('#' + HOST_ID))));

    // ---------- where a drop would land ----------
    const currentWindowId = () => {
      const node = ui.querySelector('.list .win:not(.inactive-window)') || ui.querySelector('.list .win');
      const id = node ? Number(node.dataset.win) : NaN;
      return Number.isInteger(id) ? id : null;
    };

    function dropTarget(e) {
      const t = e.target;
      if (!t || !t.closest) return null;
      const tabNode = t.closest('.tab');
      if (tabNode) {
        const win = tabNode.closest('.win');
        const windowId = win ? Number(win.dataset.win) : currentWindowId();
        if (!Number.isInteger(windowId)) return null;
        const panel = ui.querySelector('.panel');
        const r = tabNode.getBoundingClientRect();
        const horizontalRail = !!(panel && panel.dataset.dir === 'h') && !tabNode.closest('.winpop');
        const after = horizontalRail ? e.clientX >= r.left + r.width / 2 : e.clientY >= r.top + r.height / 2;
        return { kind: 'tab', node: tabNode, windowId, tabId: Number(tabNode.dataset.id), pos: after ? 'after' : 'before', after };
      }
      const head = t.closest('.whead');
      if (head && Number.isInteger(Number(head.dataset.win))) {
        return { kind: 'window', node: head.closest('.win') || head, windowId: Number(head.dataset.win), pos: 'end' };
      }
      const win = t.closest('.win');
      if (win && Number.isInteger(Number(win.dataset.win))) {
        return { kind: 'window', node: win, windowId: Number(win.dataset.win), pos: 'end' };
      }
      const list = t.closest('.list');
      if (list) {
        const windowId = currentWindowId();
        if (Number.isInteger(windowId)) return { kind: 'list', node: list, windowId, pos: 'end' };
      }
      return null;
    }

    function clearDropMarks() {
      ui.querySelectorAll('.drop-before,.drop-after,.drop-win').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-win'));
      const list = ui.querySelector('.list');
      if (list) { list.style.outline = ''; list.style.outlineOffset = ''; }
    }
    function clearBookmarkMarks() {
      ui.querySelectorAll('.bm-drop-before,.bm-drop-after,.bm-drop-into').forEach((n) => n.classList.remove('bm-drop-before', 'bm-drop-after', 'bm-drop-into'));
    }

    // Opens what was dropped (a bookmark id and/or URLs) at the drop position.
    function openDropped(payload, info) {
      const cur = currentWindowId();
      return env.send({
        type: 'bookmarkAction',
        op: 'openAt',
        ...payload,
        windowId: info.windowId,
        targetTabId: info.kind === 'tab' ? info.tabId : null,
        pos: info.kind === 'tab' ? info.pos : 'end',
        focusWindow: info.windowId !== cur
      });
    }

    function notify(node, text) {
      if (!env.tip || !node) return;
      env.tip(node.getBoundingClientRect(), text, '', 'below');
      setTimeout(() => { if (env.hideTip) env.hideTip(); }, 2600);
    }

    // ---------- links and files dragged in from outside ----------
    const effectFor = (dt) => {
      const allowed = String(dt.effectAllowed || '');
      if (allowed === 'link' || allowed === 'linkMove') return 'link';
      if (allowed === 'move') return 'move';
      return 'copy';
    };

    function readLinks(dt) {
      const out = [];
      const push = (value) => {
        const s = String(value || '').trim();
        if (s && !out.includes(s)) out.push(s);
      };
      const list = dt.getData('text/uri-list');
      if (list) list.split(/\r?\n/).forEach((line) => { if (line && !line.startsWith('#')) push(line); });
      if (!out.length) {
        const moz = dt.getData('text/x-moz-url');
        if (moz) push(moz.split(/\r?\n/)[0]);
      }
      if (!out.length) {
        // Chrome download drags look like "mime:name:url".
        const download = dt.getData('DownloadURL');
        if (download) push(download.split(':').slice(2).join(':'));
      }
      return out;
    }

    const readAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    async function finishForeignDrop(urls, files, info) {
      let tooBig = false;
      for (const file of files) {
        if (file.size > FILE_LIMIT) { tooBig = true; continue; }
        try { urls.push(await readAsDataUrl(file)); } catch (_) {}
      }
      if (tooBig) notify(info.node, 'That file is too large to open from here');
      if (!urls.length) return;
      await openDropped({ urls }, info);
    }

    ui.addEventListener('dragover', (e) => {
      if (internalDrag || !hasLinkTypes(e.dataTransfer)) return;
      // Always accept inside the overlay so a file dropped on a gap is not
      // opened by the browser in the current tab.
      e.preventDefault();
      const info = dropTarget(e);
      clearDropMarks();
      if (!info) { e.dataTransfer.dropEffect = 'none'; return; }
      e.dataTransfer.dropEffect = effectFor(e.dataTransfer);
    }, true);

    ui.addEventListener('drop', (e) => {
      if (internalDrag || !hasLinkTypes(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      const info = dropTarget(e);
      clearDropMarks();
      if (!info) return;
      // A DataTransfer can only be read while its event runs, so read it now.
      const urls = readLinks(e.dataTransfer);
      const files = Array.from(e.dataTransfer.files || []);
      void finishForeignDrop(urls, files, info);
    }, true);

    // Which overlay part (panel, bookmarks, window popover) is under the pointer.
    const overlayPart = (e) => {
      const rootNode = ui.getRootNode();
      if (!rootNode || typeof rootNode.elementFromPoint !== 'function') return null;
      const hit = rootNode.elementFromPoint(e.clientX, e.clientY);
      return hit && hit.closest ? hit.closest('.panel, .bm, .winpop') : null;
    };
    // Native drags send no mouse events, so hover is replayed through the same
    // listeners the real mouse uses. This keeps the overlay open while you hold a
    // link over it.
    const sendHover = (node, type) => { if (node) node.dispatchEvent(new MouseEvent(type, { bubbles: false })); };
    function setHoverPart(part) {
      if (part === hoverPart) return;
      sendHover(hoverPart, 'mouseleave');
      hoverPart = part;
      sendHover(hoverPart, 'mouseenter');
    }
    const panelVisible = () => {
      const panel = ui.querySelector('.panel');
      return !!(panel && !panel.classList.contains('hidden'));
    };

    function endForeign() {
      clearTimeout(foreignTimer);
      foreignTimer = 0;
      foreignActive = false;
      setHoverPart(null);
    }

    function onForeignDragOver(e) {
      if (internalDrag || !hasLinkTypes(e.dataTransfer)) return;
      foreignActive = true;
      clearTimeout(foreignTimer);
      foreignTimer = setTimeout(endForeign, 1200);
      setHoverPart(inOverlay(e.target) ? overlayPart(e) : null);
      const margin = 60;
      const nearEdge = e.clientX <= margin || e.clientY <= margin
        || e.clientX >= window.innerWidth - margin || e.clientY >= window.innerHeight - margin;
      if (!nearEdge && !hoverPart && !panelVisible()) return;
      // Feed the hot-zone logic the position it would have received from a mouse.
      window.dispatchEvent(new MouseEvent('mousemove', {
        clientX: e.clientX, clientY: e.clientY,
        ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey,
        bubbles: true
      }));
    }
    document.addEventListener('dragenter', onForeignDragOver, true);
    document.addEventListener('dragover', onForeignDragOver, true);

    // ---------- bookmark drags that start inside the overlay ----------
    ui.addEventListener('dragstart', (e) => {
      internalDrag = true;
      const row = e.target && e.target.closest ? e.target.closest('[data-bm-id]') : null;
      bookmarkSource = row ? { id: row.dataset.bmId } : null;
      folderSource = !!(row && row.dataset.bmFolderSrc === '1');
      // An open » menu is rebuilt once the dragged bookmark has moved.
      if (overflowMenuOpen()) {
        resync = true;
        clearTimeout(resyncTimer);
        resyncTimer = setTimeout(() => { resync = false; }, 4000);
      }
    }, true);

    const resetInternal = () => {
      internalDrag = false;
      bookmarkSource = null;
      folderSource = false;
      clearTimeout(moreTimer);
      moreTimer = 0;
      const more = ui.querySelector('.bmmore');
      if (more) more.style.background = '';
      clearDropMarks();
      clearBookmarkMarks();
      endForeign();
    };
    document.addEventListener('dragend', () => resetInternal(), true);
    document.addEventListener('drop', () => setTimeout(resetInternal, 0), true);

    // A bookmark (not a folder) dropped on empty tab-strip space opens there.
    ui.addEventListener('dragover', (e) => {
      if (!internalDrag || !bookmarkSource || folderSource) return;
      const info = dropTarget(e);
      if (!info || info.kind !== 'list') return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      clearBookmarkMarks();
      clearDropMarks();
    }, true);
    ui.addEventListener('drop', (e) => {
      if (!internalDrag || !bookmarkSource || folderSource) return;
      const info = dropTarget(e);
      if (!info || info.kind !== 'list') return;
      e.preventDefault();
      e.stopPropagation();
      clearDropMarks();
      void openDropped({ id: bookmarkSource.id }, info);
    }, true);

    // ---------- bookmark folders: reorder only, never open ----------
    const isRootFolderRow = (row) => {
      const parent = row.dataset.bmParent;
      return !parent || parent === '0' || parent === 'root________';
    };
    function enableFolderDrag(node) {
      if (!node || node.nodeType !== 1) return;
      const rows = [];
      if (node.matches && node.matches('[data-bm-folder="1"]')) rows.push(node);
      if (node.querySelectorAll) rows.push(...node.querySelectorAll('[data-bm-folder="1"]'));
      for (const row of rows) {
        // content.js treats a row marked as a folder as "not draggable". Clearing
        // that flag lets it run its normal reorder path; data-bm-folder-src keeps
        // the real answer for this module, which stops folders from opening.
        row.dataset.bmFolderSrc = '1';
        row.dataset.bmFolder = '0';
        row.draggable = !isRootFolderRow(row);
      }
    }
    enableFolderDrag(ui);
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        const t = m.target;
        if (t !== ui && !(t.closest && t.closest('.bm, .menu'))) continue;
        m.addedNodes.forEach(enableFolderDrag);
      }
    }).observe(ui, { childList: true, subtree: true });

    // Folders can be dropped between bookmarks, never on tabs, windows or the page.
    ui.addEventListener('dragover', (e) => {
      if (!folderSource) return;
      const t = e.target;
      if (t && t.closest && t.closest('[data-bm-id], .bmmore')) return;
      if (t && t.closest && t.closest('.tab, .whead, .ghead, .win, .winpop, .list')) {
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'none';
        clearBookmarkMarks();
        clearDropMarks();
      }
    }, true);
    const guardPage = (e) => {
      if (!internalDrag || !folderSource || inOverlay(e.target)) return;
      e.stopImmediatePropagation();
      if (e.type === 'drop') e.preventDefault();
      else if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    document.addEventListener('dragover', guardPage, true);
    document.addEventListener('drop', guardPage, true);

    // ---------- the » overflow menu ----------
    const moreButton = () => {
      const button = ui.querySelector('.bmmore');
      return button && button.style.display !== 'none' ? button : null;
    };
    const firstHiddenBarId = () => {
      const hidden = Array.from(ui.querySelectorAll('.bmrow .bmitem')).find((b) => b.style.display === 'none');
      return hidden ? hidden.dataset.bmId : null;
    };
    function overflowMenuOpen() {
      if (!env.menu || !env.menu.isMainOpen || !env.menu.isMainOpen()) return false;
      const menu = ui.querySelector(':scope > .menu:not(.context-menu)');
      const first = menu && menu.querySelector(':scope > .mi[data-bm-id]');
      const id = firstHiddenBarId();
      return !!(first && id && first.dataset.bmId === id);
    }
    function openOverflow() {
      const button = moreButton();
      if (button && !overflowMenuOpen()) button.click();
    }

    ui.addEventListener('dragover', (e) => {
      const over = internalDrag && bookmarkSource && e.target && e.target.closest ? e.target.closest('.bmmore') : null;
      if (!over) {
        if (moreTimer) { clearTimeout(moreTimer); moreTimer = 0; }
        const more = ui.querySelector('.bmmore');
        if (more && more.style.background) more.style.background = '';
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      over.style.background = 'var(--sel)';
      if (!moreTimer) moreTimer = setTimeout(() => { moreTimer = 0; openOverflow(); }, 280);
    }, true);

    // After a bookmark moved, the bar is rebuilt; rebuild the open » menu from the
    // new overflow slice instead of leaving the old rows on screen.
    const content = bmApi.el && bmApi.el.querySelector ? bmApi.el.querySelector('.bmc') : null;
    if (content) {
      new MutationObserver(() => {
        if (!resync) return;
        resync = false;
        clearTimeout(resyncTimer);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!ui.querySelector(':scope > .menu:not(.context-menu)')) return;
          env.menu.hide();
          const button = moreButton();
          if (button) button.click();
        }));
      }).observe(content, { childList: true });
    }
  }
})();
