// Pushes the page aside while the overlay is pinned.
// 1. The page's root gets a margin on the overlay's side.
// 2. If the site wipes that margin (many do while scrolling), it is put back.
// 3. Parts of the site that are glued to the window (sticky headers, side bars, chat bars)
//    ignore margins, so those are nudged by the same amount.
(() => {
  const X = (globalThis.TPX = globalThis.TPX || {});
  const DIRS = ['left', 'right', 'top', 'bottom'];
  const PROPS = ['margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'transition'];
  const AXIS = { left: 'max-width', right: 'max-width', top: 'max-height', bottom: 'max-height' };
  const rootEl = () => document.documentElement;

  let saved = null, cur = null, timer = 0, mo = null, qTimer = 0;
  const queue = new Set();
  const adj = new Map();

  function restoreProp(p) {
    if (!saved) return;
    const st = rootEl().style;
    const [v, pr] = saved[p];
    if (v) st.setProperty(p, v, pr); else st.removeProperty(p);
  }

  function apply() {
    if (!cur) return;
    const st = rootEl().style;
    for (const d of DIRS) if (d !== cur.dir) restoreProp('margin-' + d);
    st.setProperty('margin-' + cur.dir, cur.px + 'px', 'important');
  }

  function guard() {
    if (!cur) return;
    const st = rootEl().style, p = 'margin-' + cur.dir;
    if (Math.abs(parseFloat(st.getPropertyValue(p)) - cur.px) > 0.01 || st.getPropertyPriority(p) !== 'important') apply();
  }

  // ----- glued elements -----
  function unadjust(el) {
    const r = adj.get(el);
    if (!r) return;
    adj.delete(el);
    for (const [p, v] of r.saved) {
      if (v[0]) el.style.setProperty(p, v[0], v[1]); else el.style.removeProperty(p);
    }
  }

  function unadjustAll() {
    for (const el of [...adj.keys()]) unadjust(el);
  }

  function consider(el) {
    if (!cur || !el || el.nodeType !== 1 || el === rootEl() || el === document.body || el.id === 'tab-peek-host') return;
    let cs;
    try { cs = getComputedStyle(el); } catch (e) { return; }
    const rec = adj.get(el);
    if (rec) {
      const pos0 = cs.position;
      if ((pos0 === 'fixed' || pos0 === 'sticky') && rec.dir === cur.dir && Math.abs(rec.px - cur.px) < 0.5) return;
      unadjust(el);
      cs = getComputedStyle(el);
    }
    const pos = cs.position;
    if (pos !== 'fixed' && pos !== 'sticky') return;
    const dir = cur.dir, v = cs[dir];
    if (!v || v === 'auto') return;
    const base = parseFloat(v);
    if (!(base >= 0) || base >= cur.px) return;
    const st = el.style, keep = [];
    const props = [dir];
    if (pos === 'fixed') props.push(AXIS[dir]);
    for (const p of props) keep.push([p, [st.getPropertyValue(p), st.getPropertyPriority(p)]]);
    adj.set(el, { dir, px: cur.px, saved: keep });
    st.setProperty(dir, (base + cur.px) + 'px', 'important');
    if (pos === 'fixed') st.setProperty(AXIS[dir], 'calc(100% - ' + cur.px + 'px)', 'important');
  }

  function scanAll() {
    const list = rootEl().querySelectorAll('*');
    const mine = cur, n = list.length;
    let i = 0;
    (function step() {
      if (cur !== mine) return;
      const end = Math.min(i + 400, n);
      for (; i < end; i++) consider(list[i]);
      if (i < n) setTimeout(step, 0);
    })();
  }

  function enqueue(el) {
    queue.add(el);
    if (!qTimer) qTimer = setTimeout(flush, 120);
  }

  function flush() {
    qTimer = 0;
    const items = [...queue];
    queue.clear();
    for (const el of items) consider(el);
  }

  function watch() {
    if (mo) return;
    mo = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.target === rootEl() && r.type === 'attributes') { guard(); continue; }
        if (r.type === 'attributes') enqueue(r.target);
        else {
          for (const n of r.addedNodes) {
            if (n.nodeType !== 1) continue;
            enqueue(n);
            if (n.querySelectorAll) {
              let c = 0;
              for (const k of n.querySelectorAll('*')) { if (++c > 200) break; enqueue(k); }
            }
          }
        }
      }
    });
    mo.observe(rootEl(), { attributes: true, attributeFilter: ['class', 'style', 'hidden'], subtree: true, childList: true });
  }

  function unwatch() {
    if (mo) { mo.disconnect(); mo = null; }
    clearTimeout(qTimer);
    qTimer = 0;
    queue.clear();
    unadjustAll();
    cur = null;
  }

  X.push = {
    on(dir, px, animate) {
      const el = rootEl(), st = el.style;
      if (!saved) {
        saved = {};
        for (const p of PROPS) saved[p] = [st.getPropertyValue(p), st.getPropertyPriority(p)];
      }
      clearTimeout(timer);
      const changed = !cur || cur.dir !== dir || Math.abs(cur.px - px) > 0.5;
      if (changed) { unadjustAll(); cur = { dir, px }; }
      if (animate) { st.setProperty('transition', 'margin .18s ease', 'important'); void el.offsetWidth; }
      else st.removeProperty('transition');
      apply();
      watch();
      if (changed) scanAll();
    },
    off(animate) {
      if (!saved) return;
      const el = rootEl(), st = el.style;
      clearTimeout(timer);
      unwatch();
      if (animate) { st.setProperty('transition', 'margin .18s ease', 'important'); void el.offsetWidth; }
      for (const d of DIRS) restoreProp('margin-' + d);
      timer = setTimeout(() => { if (saved) { restoreProp('transition'); saved = null; } }, animate ? 260 : 0);
    }
  };
})();
