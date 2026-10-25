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
    env.hoverable(el);

    const horizontal = () => el.dataset.pos === 'below' || el.dataset.pos === 'above';
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
    function attachBookmarkTooltip(target, n, preferredSide) {
      const tip = bookmarkTooltip(n);
      if (!tip.title || !env.tip) return;
      target.addEventListener('mouseenter', () => {
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
        X.favicons.mount(s, n.url, '', label(n), { serviceFirst: true, emptyFallback: !label(n) });
      } else letter();
      return s;
    }

    function openBm(n, e) {
      if (!n.url || /^javascript:/i.test(n.url)) return;
      const bg = e && (e.ctrlKey || e.metaKey || e.button === 1);
      env.open(n.url, bg ? 'bg' : 'current');
    }

    function toItems(nodes) {
      if (!nodes.length) return [{ label: '(empty)', disabled: true }];
      return nodes.map((n) => (n.children
        ? { label: label(n), tooltip: bookmarkTooltip(n), icon: () => icon(n), sub: toItems(n.children), onContext: (e) => showContextMenu(e, n) }
        : { label: label(n), tooltip: bookmarkTooltip(n), icon: () => icon(n), action: () => openBm(n, null), onContext: (e) => showContextMenu(e, n) }));
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
      env.menu.showBeside(toItems(n.children), button.getBoundingClientRect(), side);
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
          data = null;
          lastKey = '';
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
      env.menu.show(items, e.clientX, e.clientY);
    }

    function allTop() {
      const list = data.bar.slice();
      if (data.other.length) list.push({ id: data.otherId || 'other', title: 'Other bookmarks', children: data.other });
      return list;
    }

    // ----- horizontal bar (like a browser's own) -----
    function renderBar() {
      const bar = h('div', 'bmbar');
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
          b.addEventListener('click', () => toggleFolderMenu(n, b, el.dataset.pos === 'above' ? 'above' : 'below'));
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
        more.onclick = () => env.menu.showBeside(toItems(data.bar.slice(cut)), more.getBoundingClientRect(), el.dataset.pos === 'above' ? 'above' : 'below');
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
      let head = modeButton;
      if (el.dataset.mode === 'floating') {
        head = h('div', 'bmhead bmstriphead');
        head.title = 'Drag this header to move bookmarks around the floating overlay';
        head.appendChild(modeButton);
        head.addEventListener('pointerdown', startFloatingBookmarkDrag);
      }
      const list = h('div', 'bmstrip');
      const pos = el.dataset.pos || '';
      const side = pos.endsWith('left') ? 'left' : pos.endsWith('right') ? 'right' : (pos.endsWith('top') ? 'above' : 'below');
      for (const n of allTop()) {
        const b = h('button', 'bmicon');
        b.type = 'button';
        b.appendChild(icon(n));
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('mouseenter', () => {
          const title = label(n);
          const hoverText = title || n.url || '';
          if (hoverText) env.tip(b.getBoundingClientRect(), hoverText, title ? (n.url || '') : '', side);
          else env.hideTip();
        });
        b.addEventListener('mouseleave', () => env.hideTip());
        b.addEventListener('contextmenu', (e) => showContextMenu(e, n));
        if (n.children) {
          b.classList.add('bm-folder-menu-trigger');
          b.addEventListener('click', () => toggleFolderMenu(n, b, side));
        } else {
          b.addEventListener('click', (e) => openBm(n, e));
          b.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); openBm(n, e); } });
        }
        list.appendChild(b);
      }
      content.append(head, list);
    }

    // ----- vertical card: names, folders open in place -----
    function renderCard() {
      const head = h('div', 'bmhead');
      const title = h('span', 'bmtitle', 'Bookmarks');
      const mode = makeModeToggle('strip');
      head.append(title, mode);
      head.title = 'Drag this header to move bookmarks around the floating overlay';
      head.addEventListener('pointerdown', startFloatingBookmarkDrag);
      const list = h('div', 'bmlist');
      const rows = (nodes, depth) => {
        for (const n of nodes) {
          const row = h('div', 'bmr');
          row.style.paddingLeft = (8 + depth * 14) + 'px';
          attachBookmarkTooltip(row, n);
          if (n.children) {
            const isOpen = openIds.has(n.id);
            const c = env.chevron();
            c.classList.add('bmchev');
            if (isOpen) c.classList.add('o');
            row.append(c, icon(n), h('span', 'bmt', label(n)));
            row.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (openIds.has(n.id)) openIds.delete(n.id);
              else openIds.add(n.id);
              renderContent();
            });
            row.addEventListener('contextmenu', (e) => showContextMenu(e, n));
            list.appendChild(row);
            if (isOpen) {
              if (n.children.length) rows(n.children, depth + 1);
              else { const e = h('div', 'bmr bmempty', '(empty)'); e.style.paddingLeft = (8 + (depth + 1) * 14 + 16) + 'px'; list.appendChild(e); }
            }
          } else {
            row.append(h('span', 'bmsp'), icon(n), h('span', 'bmt', label(n)));
            row.addEventListener('click', (e) => openBm(n, e));
            row.addEventListener('contextmenu', (e) => showContextMenu(e, n));
            row.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); openBm(n, e); } });
            list.appendChild(row);
          }
        }
      };
      rows(allTop(), 0);
      if (!list.childNodes.length) list.appendChild(h('div', 'bmr bmempty', 'No bookmarks yet'));
      content.append(head, list);
    }

    function renderContent() {
      content.replaceChildren();
      const s = env.settings();
      if (!s.bookmarks) return;
      if (!data) { content.appendChild(h('div', 'bmempty', loading ? 'Loading…' : 'Bookmarks are not available')); return; }
      if (el.dataset.mode === 'floating') {
        if (s.bookmarksMode === 'strip') renderStrip();
        else renderCard();
      } else if (horizontal()) renderBar();
      else if (s.bookmarksMode === 'strip') renderStrip();
      else renderCard();
    }

    // In floating mode, drag the bookmarks header to choose one of the overlay's four edges.
    const FLOATING_BOOKMARK_MIN = 120;
    const FLOATING_BOOKMARK_MAX = 250;
    let floatingPreviewEdge = null;

    function floatingSpaces(r) {
      const u = env.u();
      const width = (typeof env.vw === 'function' ? env.vw() : window.innerWidth) / u;
      const height = (typeof env.vh === 'function' ? env.vh() : window.innerHeight) / u;
      return {
        left: Math.max(0, r.left / u),
        right: Math.max(0, width - r.right / u),
        top: Math.max(0, r.top / u),
        bottom: Math.max(0, height - r.bottom / u)
      };
    }

    function resolveFloatingEdge(preferred, spaces) {
      const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
      const minSize = env.settings().bookmarksMode === 'strip' ? STRIP_W : FLOATING_BOOKMARK_MIN;
      let edge = preferred;
      if (!['left', 'right', 'top', 'bottom'].includes(edge)) {
        edge = (spaces.right >= FLOATING_BOOKMARK_MAX || spaces.right >= spaces.left) ? 'right' : 'left';
      }
      if (spaces[edge] >= minSize) return edge;
      if (spaces[opposite[edge]] >= minSize) return opposite[edge];
      const fitting = ['left', 'right', 'top', 'bottom'].filter((side) => spaces[side] >= minSize);
      if (fitting.length) return fitting.sort((a, b) => spaces[b] - spaces[a])[0];
      return ['left', 'right', 'top', 'bottom'].sort((a, b) => spaces[b] - spaces[a])[0] || opposite[edge];
    }

    function nearestFloatingEdge(x, y) {
      const r = env.panelRect();
      return [
        ['left', Math.abs(x - r.left)],
        ['right', Math.abs(x - r.right)],
        ['top', Math.abs(y - r.top)],
        ['bottom', Math.abs(y - r.bottom)]
      ].sort((a, b) => a[1] - b[1])[0][0];
    }

    function startFloatingBookmarkDrag(e) {
      if (!env.floating || !env.floating() || e.button !== 0 || (e.target.closest && e.target.closest('button'))) return;
      e.preventDefault();
      e.stopPropagation();
      let moved = false;
      const startX = e.clientX, startY = e.clientY;
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        moved = true;
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
        if (!moved) return;
        const edge = resolveFloatingEdge(nearestFloatingEdge(ev.clientX, ev.clientY), floatingSpaces(env.panelRect()));
        floatingPreviewEdge = null;
        if (env.setFloatingBookmarkEdge) env.setFloatingBookmarkEdge(edge);
        else place();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', finish, true);
      window.addEventListener('pointercancel', finish, true);
    }

    // ----- placement next to the overlay -----
    function place() {
      const u = env.u(), r = env.panelRect(), st = el.style;
      const floating = !!(env.floating && env.floating());
      el.dataset.view = env.settings().bookmarksMode || 'card';
      if (floating) {
        const spaces = floatingSpaces(r);
        const storedEdge = env.settings().floatingBookmarksEdge || 'auto';
        const requestedEdge = floatingPreviewEdge || storedEdge;
        const edge = resolveFloatingEdge(requestedEdge === 'auto' ? null : requestedEdge, spaces);
        const preferredSize = env.settings().bookmarksMode === 'strip' ? STRIP_W : FLOATING_BOOKMARK_MAX;
        const sideSize = Math.max(1, Math.min(preferredSize, spaces[edge]));
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
          el.style.removeProperty('--bm-floating-width');
          el.style.setProperty('--bm-floating-height', sideSize + 'px');
          st.left = (r.left / u) + 'px';
          st.width = (r.width / u) + 'px';
          st.height = sideSize + 'px';
          st.top = (edge === 'top' ? r.top / u - sideSize : r.bottom / u) + 'px';
          st.transform = '';
        }
        if (env.setFloatingSide) env.setFloatingSide(env.settings().bookmarks ? edge : null);
        return;
      }
      if (env.setFloatingSide) env.setFloatingSide(null);
      el.style.removeProperty('--bm-floating-width');
      el.style.removeProperty('--bm-floating-height');
      const pos = env.placement();
      el.dataset.pos = pos;
      el.dataset.mode = (pos === 'below' || pos === 'above') ? 'bar' : env.settings().bookmarksMode;
      st.right = 'auto';
      if (pos === 'right' || pos === 'left') {
        st.top = (r.top / u) + 'px';
        st.height = (r.height / u) + 'px';
        st.width = 'auto';
        st.bottom = 'auto';
        st.left = ((pos === 'right' ? r.right : r.left) / u) + 'px';
        st.transform = pos === 'right' ? '' : 'translateX(-100%)';
      } else {
        st.left = (r.left / u) + 'px';
        st.width = (r.width / u) + 'px';
        st.height = 'auto';
        st.top = ((pos === 'below' ? r.bottom : r.top) / u) + 'px';
        st.transform = pos === 'below' ? '' : 'translateY(-100%)';
      }
    }

    async function load() {
      if (loading) return;
      loading = true;
      const r = await env.send({ type: 'bmTree' });
      loading = false;
      if (r) { data = r; failed = false; } else failed = true;
      lastKey = '';
      update();
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
      if (el.dataset.pos === 'below' || el.dataset.pos === 'above') return BAR_H;
      // The drawer starts directly at the overlay edge; no chevron tab is present.
      return s.bookmarksMode === 'strip' ? STRIP_W : 250;
    }

    new ResizeObserver(() => { if (horizontal() && env.settings().bookmarks) fitSoon(); }).observe(content);

    return {
      el,
      update,
      thickness,
      refresh() { failed = false; data = null; lastKey = ''; if (env.settings().bookmarks) load(); }
    };
  };
})();
