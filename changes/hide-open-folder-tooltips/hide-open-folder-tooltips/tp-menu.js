// A small menu (with sub-menus) drawn by Tab Peek. Every entry runs a real browser feature.
// Item shapes: {label, action, disabled, danger, checked, dot:'#hex', icon:()=>Node, sub:[items]}
(() => {
  const X = (globalThis.TPX = globalThis.TPX || {});
  X.createMenu = (env) => {
    const { ui, root, h } = env;
    let el = null, open = false, contextEl = null, contextOpen = false;
    let folderHoverMode = false;
    const isOpen = () => open || contextOpen;

    function notifyClosedIfLast(wasOpen) {
      if (wasOpen && !isOpen() && env.onClose) env.onClose();
    }
    function hideMain() {
      const wasOpen = open;
      if (el) el.remove();
      el = null; open = false; folderHoverMode = false;
      notifyClosedIfLast(wasOpen);
    }

    function activateFolderHoverMode() {
      if (open && el) folderHoverMode = true;
    }
    function isFolderHoverActive() {
      return !!(folderHoverMode && open && el);
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
      notifyClosedIfLast(wasOpen);
    }

    // Escape dismisses only the topmost layer: first a context menu, then the
    // deepest opened folder submenu, then the root folder menu. It never owns
    // or closes the Tab Peek overlay itself.
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
            const r = sm.getBoundingClientRect();
            sm.style.display = '';
            if (r.right > env.vw() - 4) sm.classList.add('flip');
            if (r.bottom > env.vh() - 4) sm.style.top = (-6 - (r.bottom - env.vh() + 8) / env.u()) + 'px';
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
        row.addEventListener('mousedown', (e) => e.preventDefault());
        box.appendChild(row);
      }
    }

    function place(menuEl, x, y, side) {
      const u = env.u();
      menuEl.style.left = (x / u) + 'px'; menuEl.style.top = (y / u) + 'px';
      const r = menuEl.getBoundingClientRect();
      let nx = x, ny = y;
      if (side === 'left') nx = x - r.width;
      if (side === 'above') ny = y - r.height;
      nx = Math.max(4, Math.min(nx, env.vw() - 4 - r.width));
      ny = Math.max(4, Math.min(ny, env.vh() - 4 - r.height));
      menuEl.style.left = (nx / u) + 'px'; menuEl.style.top = (ny / u) + 'px';
    }

    function show(items, x, y, side, preserveFolderHover = false) {
      const keepFolderHover = folderHoverMode;
      hide();
      folderHoverMode = !!(preserveFolderHover && keepFolderHover);
      if (!items.length) return;
      el = build(items, 'menu', 'main'); ui.appendChild(el); open = true;
      if (env.onOpen) env.onOpen();
      place(el, x, y, side);
    }
    function showContext(items, x, y, side) {
      hideContext();
      if (!items.length) return;
      contextEl = build(items, 'menu context-menu', 'context'); ui.appendChild(contextEl); contextOpen = true;
      if (env.onOpen) env.onOpen();
      place(contextEl, x, y, side);
    }
    function showBeside(items, rect, side) {
      show(items, side === 'right' ? rect.right : rect.left, side === 'below' ? rect.bottom : rect.top, side);
    }
    function switchFolderBeside(items, rect, side) {
      show(items, side === 'right' ? rect.right : rect.left, side === 'below' ? rect.bottom : rect.top, side, true);
    }
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
    root.addEventListener('mousedown', (e) => {
      const target = e.target;
      const insideMenu = target && target.closest && target.closest('.menu');
      const folderTrigger = target && target.closest && target.closest('.bm-folder-menu-trigger');
      if (isOpen() && !insideMenu && !folderTrigger) hide();
    }, true);
    // Right-clicking somewhere else inside the overlay closes an open context menu.
    root.addEventListener('contextmenu', (e) => {
      const target = e.target;
      const insideMenu = target && target.closest && target.closest('.menu');
      if (contextOpen && !insideMenu) hideContext();
    }, true);
    return { show, showBeside, switchFolderBeside, activateFolderHoverMode, isFolderHoverActive, showContext, showContextBeside, hide, closeLatest, isOpen };
  };
})();
