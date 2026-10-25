// A small menu (with sub-menus) drawn by Tab Peek. Every entry runs a real browser feature.
// Item shapes: {label, action, disabled, danger, checked, dot:'#hex', icon:()=>Node, sub:[items]} or {sep:true}
(() => {
  const X = (globalThis.TPX = globalThis.TPX || {});

  X.createMenu = (env) => {
    const { ui, root, h } = env;
    let el = null, open = false;

    function hide() {
      if (!el) return;
      el.remove();
      el = null;
      if (open) {
        open = false;
        if (env.onClose) env.onClose();
      }
    }

    function build(items, cls) {
      const box = h('div', cls);
      // The extension host has pointer-events:none so page interaction remains
      // unaffected outside the overlay. Menus must explicitly opt back in or
      // clicks fall through to the tab/page and the capture listener dismisses
      // the menu before its action can fire.
      box.style.pointerEvents = 'auto';
      box.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
      // Long plain lists scroll; lists with sub-menus must not (a scrolling box would clip its sub-menus).
      if (!items.some((i) => i.sub)) box.classList.add('scroll');
      for (const it of items) {
        if (it.sep) { box.appendChild(h('div', 'msep')); continue; }
        const row = h('div', 'mi' + (it.disabled ? ' dis' : '') + (it.danger ? ' danger' : '') + (it.sub ? ' has-sub' : ''));
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
            e.preventDefault();
            e.stopPropagation();
            it.onContext(e);
          });
        }
        const lead = h('span', 'mlead');
        if (it.dot) {
          const d = h('span', 'mdot');
          d.style.background = it.dot;
          lead.appendChild(d);
        } else if (it.icon) {
          lead.appendChild(it.icon());
        }
        row.append(lead, h('span', 'mlabel', it.label));
        if (it.checked) row.appendChild(h('span', 'mchk', '✓'));
        if (it.sub) {
          row.appendChild(h('span', 'marrow', '›'));
          const sm = build(it.sub, 'submenu');
          row.appendChild(sm);
          row.addEventListener('mouseenter', () => {
            sm.classList.remove('flip');
            sm.style.top = '';
            sm.style.display = 'block';
            const r = sm.getBoundingClientRect();
            sm.style.display = '';
            if (r.right > env.vw() - 4) sm.classList.add('flip');
            if (r.bottom > env.vh() - 4) sm.style.top = (-6 - (r.bottom - env.vh() + 8) / env.u()) + 'px';
          });
        } else {
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            if (it.disabled) return;
            hide();
            if (it.action) it.action();
          });
        }
        row.addEventListener('mousedown', (e) => e.preventDefault());
        box.appendChild(row);
      }
      return box;
    }

    function place(x, y, side) {
      const u = env.u();
      el.style.left = (x / u) + 'px';
      el.style.top = (y / u) + 'px';
      const r = el.getBoundingClientRect();
      let nx = x, ny = y;
      if (side === 'left') nx = x - r.width;
      if (side === 'above') ny = y - r.height;
      nx = Math.max(4, Math.min(nx, env.vw() - 4 - r.width));
      ny = Math.max(4, Math.min(ny, env.vh() - 4 - r.height));
      el.style.left = (nx / u) + 'px';
      el.style.top = (ny / u) + 'px';
    }

    function show(items, x, y, side) {
      hide();
      if (!items.length) return;
      el = build(items, 'menu');
      ui.appendChild(el);
      open = true;
      if (env.onOpen) env.onOpen();
      place(x, y, side);
    }

    // Open next to an element: side = the side of the element the menu appears on.
    function showBeside(items, rect, side) {
      const x = side === 'right' ? rect.right : rect.left;
      const y = side === 'below' ? rect.bottom : rect.top;
      show(items, x, y, side);
    }

    // A click anywhere in the overlay that is not on the menu closes it.
    root.addEventListener('mousedown', (e) => {
      const target = e.target;
      const insideMenu = target && target.closest && target.closest('.menu');
      const folderTrigger = target && target.closest && target.closest('.bm-folder-menu-trigger');
      if (open && !insideMenu && !folderTrigger) hide();
    }, true);

    return { show, showBeside, hide, isOpen: () => open };
  };
})();
