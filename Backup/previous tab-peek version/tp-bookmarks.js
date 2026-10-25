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

    const el = h('div', 'bm hidden');
    const content = h('div', 'bmc');
    // The bookmarks drawer is attached directly to the overlay. It is opened
    // by the existing Bookmarks toolbar icon; there is no separate chevron tab.
    el.appendChild(content);
    ui.appendChild(el);
    env.hoverable(el);

    const horizontal = () => el.dataset.pos === 'below' || el.dataset.pos === 'above';

    // ----- pieces -----
    function icon(n) {
      const s = h('span', 'fav');
      const letter = () => {
        s.textContent = ((n.title || '?').trim().charAt(0) || '•').toUpperCase();
        s.classList.add('letter');
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
        X.favicons.mount(s, n.url, '', n.title || n.url, { serviceFirst: true });
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
        ? { label: n.title, icon: () => icon(n), sub: toItems(n.children) }
        : { label: n.title, icon: () => icon(n), action: () => openBm(n, null) }));
    }

    function allTop() {
      const list = data.bar.slice();
      if (data.other.length) list.push({ id: 'other', title: 'Other bookmarks', children: data.other });
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
        b.append(icon(n), h('span', 'bmt', n.title));
        b.addEventListener('mousedown', (e) => e.preventDefault());
        if (n.children) {
          b.addEventListener('click', () => env.menu.showBeside(toItems(n.children), b.getBoundingClientRect(), el.dataset.pos === 'above' ? 'above' : 'below'));
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
        const o = mk({ id: 'other', title: 'Other bookmarks', children: data.other });
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
      const head = h('button', 'tbtn bmmode', 'Names');
      head.type = 'button';
      head.title = 'Show names';
      head.addEventListener('mousedown', (e) => e.preventDefault());
      head.addEventListener('click', () => env.setMode('card'));
      const list = h('div', 'bmstrip');
      const side = el.dataset.pos === 'left' ? 'left' : 'right';
      for (const n of allTop()) {
        const b = h('button', 'bmicon');
        b.type = 'button';
        b.appendChild(icon(n));
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('mouseenter', () => env.tip(b.getBoundingClientRect(), n.title, n.url || '', side));
        b.addEventListener('mouseleave', () => env.hideTip());
        if (n.children) {
          b.addEventListener('click', () => { env.hideTip(); env.menu.showBeside(toItems(n.children), b.getBoundingClientRect(), side); });
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
      const mode = h('button', 'tbtn bmmode', 'Icons');
      mode.type = 'button';
      mode.title = 'Show a narrow strip of icons';
      mode.addEventListener('mousedown', (e) => e.preventDefault());
      mode.addEventListener('click', () => env.setMode('strip'));
      head.append(title, mode);
      const list = h('div', 'bmlist');
      const rows = (nodes, depth) => {
        for (const n of nodes) {
          const row = h('div', 'bmr');
          row.style.paddingLeft = (8 + depth * 14) + 'px';
          if (n.children) {
            const isOpen = openIds.has(n.id);
            const c = env.chevron();
            c.classList.add('bmchev');
            if (isOpen) c.classList.add('o');
            row.append(c, icon(n), h('span', 'bmt', n.title));
            row.addEventListener('click', () => {
              if (openIds.has(n.id)) openIds.delete(n.id); else openIds.add(n.id);
              renderContent();
            });
            list.appendChild(row);
            if (isOpen) {
              if (n.children.length) rows(n.children, depth + 1);
              else { const e = h('div', 'bmr bmempty', '(empty)'); e.style.paddingLeft = (8 + (depth + 1) * 14 + 16) + 'px'; list.appendChild(e); }
            }
          } else {
            row.append(h('span', 'bmsp'), icon(n), h('span', 'bmt', n.title));
            row.addEventListener('click', (e) => openBm(n, e));
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
      if (!env.settings().bookmarks) return;
      if (!data) { content.appendChild(h('div', 'bmempty', loading ? 'Loading…' : 'Bookmarks are not available')); return; }
      if (horizontal()) renderBar();
      else if (env.settings().bookmarksMode === 'strip') renderStrip();
      else renderCard();
    }

    // ----- placement next to the overlay -----
    function place() {
      const u = env.u(), r = env.panelRect(), pos = env.placement(), st = el.style;
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
      const key = [el.dataset.pos, el.dataset.mode, s.bookmarks, !!data].join('|');
      if (key !== lastKey) { lastKey = key; renderContent(); }
      else if (horizontal() && s.bookmarks) fitSoon();
    }

    // Space the bookmarks take on the page side (used to push the page by the right amount).
    function thickness() {
      const s = env.settings();
      if (!env.shown() || !s.bookmarks) return 0;
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
