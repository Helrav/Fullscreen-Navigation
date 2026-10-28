// Pushes the page aside while the overlay is pinned.
// 1. The page's root gets margins on every side the overlay occupies.
// 2. If the site wipes those margins (many do while scrolling), they are put back.
// 3. Parts of the site that are glued to the window (fixed/sticky/absolute headers,
//    side bars, chat bars and popups) ignore margins. Those are measured and moved or
//    shrunk into the remaining safe area instead of being left underneath the overlay.
(() => {
  const X = (globalThis.FNX = globalThis.FNX || {});
  const DIRS = ['left', 'right', 'top', 'bottom'];
  const PROPS = ['margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'transition'];
  const EPS = 0.5;
  const rootEl = () => document.documentElement;
  const vw = () => document.documentElement.clientWidth || window.innerWidth;
  const vh = () => document.documentElement.clientHeight || window.innerHeight;

  let saved = null, cur = [], curMap = {}, timer = 0, mo = null, qTimer = 0, laterTimer = 0;
  let laterRounds = 0;
  const queue = new Set();
  const later = new Set();
  const adj = new Map();

  function restoreProp(p) {
    if (!saved) return;
    const st = rootEl().style;
    const [v, pr] = saved[p];
    if (v) st.setProperty(p, v, pr); else st.removeProperty(p);
  }

  function apply() {
    if (!cur.length) return;
    const st = rootEl().style;
    for (const d of DIRS) {
      const px = curMap[d];
      if (px != null) st.setProperty('margin-' + d, px + 'px', 'important');
      else restoreProp('margin-' + d);
    }
  }

  function guard() {
    if (!cur.length) return;
    const st = rootEl().style;
    for (const d of DIRS) {
      const px = curMap[d];
      if (px == null) continue;
      const p = 'margin-' + d;
      if (Math.abs(parseFloat(st.getPropertyValue(p)) - px) > EPS || st.getPropertyPriority(p) !== 'important') {
        apply();
        return;
      }
    }
  }

  // ----- page-attached elements -----
  // Keep our own bookkeeping per element so a popup can be moved on both axes.
  function record(el) {
    let rec = adj.get(el);
    if (!rec) {
      rec = { saved: new Map(), tx: 0, ty: 0 };
      adj.set(el, rec);
    }
    return rec;
  }

  function setElProp(el, rec, p, v) {
    if (!rec.saved.has(p)) rec.saved.set(p, [el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
    el.style.setProperty(p, v, 'important');
  }

  function restoreElProp(el, rec, p) {
    const v = rec.saved.get(p);
    if (!v) return;
    if (v[0]) el.style.setProperty(p, v[0], v[1]); else el.style.removeProperty(p);
  }

  function unadjust(el) {
    const rec = adj.get(el);
    if (!rec) return;
    adj.delete(el);
    for (const [p, v] of rec.saved) {
      if (v[0]) el.style.setProperty(p, v[0], v[1]); else el.style.removeProperty(p);
    }
  }

  function unadjustAll() {
    for (const el of [...adj.keys()]) unadjust(el);
  }

  function sweepDetached() {
    for (const el of [...adj.keys()]) if (!el.isConnected) unadjust(el);
  }

  function measureRect(el) {
    try {
      const r = el.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) return null;
      return r;
    } catch (e) {
      return null;
    }
  }

  // `max-width`/`max-height` size the content box unless the site uses
  // border-box. Subtract the element's own padding/border in content-box mode so
  // the outer box really fits the safe area instead of overflowing by a few px.
  const px = (v) => parseFloat(v) || 0;
  function maxContentSize(cs, axis, safeSize) {
    if (cs.boxSizing === 'border-box') return safeSize;
    const extra = axis === 'w'
      ? px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth)
      : px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
    return Math.max(0, safeSize - extra);
  }

  function consider(el) {
    if (!cur.length || !el || el.nodeType !== 1) return;
    if (el === rootEl() || el === document.body || el.id === 'fn-host') return;

    let cs;
    try { cs = getComputedStyle(el); } catch (e) { return; }
    const pos = cs.position;
    if (pos !== 'fixed' && pos !== 'sticky' && pos !== 'absolute') return;
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return;

    let rect = measureRect(el);
    if (!rect) return;

    const vpW = vw(), vpH = vh();
    const pL = curMap.left || 0, pR = curMap.right || 0;
    const pT = curMap.top || 0, pB = curMap.bottom || 0;
    if (!pL && !pR && !pT && !pB) return;

    const safeL = pL, safeR = vpW - pR;
    const safeT = pT, safeB = vpH - pB;
    if (safeR - safeL <= 0 || safeB - safeT <= 0) return;

    // Ignore boxes whose own position is entirely outside the viewport (closed
    // popups often stay in the DOM at a negative offset while they animate out).
    // Use the un-translated position: our own earlier nudge must not make a box
    // look permanently off-screen and hide it from correction.
    let rec = adj.get(el) || null;
    let base = {
      left: rect.left - (rec ? rec.tx : 0),
      right: rect.right - (rec ? rec.tx : 0),
      top: rect.top - (rec ? rec.ty : 0),
      bottom: rect.bottom - (rec ? rec.ty : 0),
      width: rect.width,
      height: rect.height
    };
    if (base.right < -1 || base.bottom < -1 || base.left > vpW + 1 || base.top > vpH + 1) {
      if (rec && (rec.tx || rec.ty)) {
        rec.tx = 0;
        rec.ty = 0;
        restoreElProp(el, rec, 'translate');
      }
      return;
    }

    // Work from the element's own position, without our previous translate, so
    // follow-up passes correct an earlier nudge instead of stacking another one.
    const outL = pL > 0 && base.left < safeL - EPS;
    const outR = pR > 0 && base.right > safeR + EPS;
    const outT = pT > 0 && base.top < safeT - EPS;
    const outB = pB > 0 && base.bottom > safeB + EPS;
    if (!outL && !outR && !outT && !outB) {
      if (rec && (rec.tx || rec.ty)) {
        rec.tx = 0;
        rec.ty = 0;
        restoreElProp(el, rec, 'translate');
      }
      return;
    }

    // A box that is wider or taller than the remaining page area can never be
    // "nudged" into it, so constrain its size first. This is what makes
    // full-width fixed headers and 90%-wide fixed panels behave as though the
    // viewport itself became smaller.
    if (outL || outR) {
      const safeW = safeR - safeL;
      if (base.width > safeW + EPS) {
        rec = rec || record(el);
        setElProp(el, rec, 'max-width', maxContentSize(cs, 'w', safeW) + 'px');
        rect = measureRect(el) || rect;
        base = {
          left: rect.left - rec.tx, right: rect.right - rec.tx,
          top: rect.top - rec.ty, bottom: rect.bottom - rec.ty,
          width: rect.width, height: rect.height
        };
      }
    }
    if (outT || outB) {
      const safeH = safeB - safeT;
      if (base.height > safeH + EPS) {
        rec = rec || record(el);
        setElProp(el, rec, 'max-height', maxContentSize(cs, 'h', safeH) + 'px');
        rect = measureRect(el) || rect;
        base = {
          left: rect.left - rec.tx, right: rect.right - rec.tx,
          top: rect.top - rec.ty, bottom: rect.bottom - rec.ty,
          width: rect.width, height: rect.height
        };
      }
    }

    // Move the box the minimum distance needed to leave the overlay strip.
    // Using the individual `translate` property keeps site transforms and
    // transitions untouched.
    let dx = 0, dy = 0;
    if (pL > 0 || pR > 0) {
      if (base.left < safeL - EPS) dx = safeL - base.left;
      else if (base.right > safeR + EPS) dx = safeR - base.right;
    }
    if (pT > 0 || pB > 0) {
      if (base.top < safeT - EPS) dy = safeT - base.top;
      else if (base.bottom > safeB + EPS) dy = safeB - base.bottom;
    }

    const tx = rec ? rec.tx : 0, ty = rec ? rec.ty : 0;
    if (Math.abs(dx - tx) > EPS || Math.abs(dy - ty) > EPS) {
      rec = rec || record(el);
      rec.tx = dx;
      rec.ty = dy;
      setElProp(el, rec, 'translate', dx + 'px ' + dy + 'px');
    }
  }

  function scanAll() {
    const list = rootEl().querySelectorAll('*');
    const mine = cur;
    const n = list.length;
    let i = 0;
    (function step() {
      if (cur !== mine) return;
      const end = Math.min(i + 400, n);
      for (; i < end; i++) consider(list[i]);
      if (i < n) setTimeout(step, 0);
    })();
  }

  function enqueue(el) {
    if (!cur.length || !el || el.nodeType !== 1) return;
    queue.add(el);
    if (!qTimer) qTimer = setTimeout(flush, 16);
  }

  function flush() {
    qTimer = 0;
    if (!cur.length) { queue.clear(); later.clear(); return; }
    const items = [...queue];
    queue.clear();
    for (const el of items) {
      if (!el.isConnected) continue;
      consider(el);
      // Popups are frequently animated in. Check once more after the transition
      // settles so the final box, not its starting frame, is the one we nudge.
      later.add(el);
    }
    sweepDetached();
    if (later.size && !laterTimer) {
      laterRounds = 2;
      laterTimer = setTimeout(function checkLater() {
        laterTimer = 0;
        if (!cur.length) { later.clear(); return; }
        const again = [...later];
        for (const el of again) if (el.isConnected) consider(el);
        if (--laterRounds > 0) laterTimer = setTimeout(checkLater, 300);
        else { later.clear(); sweepDetached(); }
      }, 180);
    }
  }

  function watch() {
    if (mo) return;
    mo = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.target === rootEl() && r.type === 'attributes') { guard(); continue; }
        if (r.type === 'attributes') enqueue(r.target);
        else {
          if (r.removedNodes.length && !qTimer) qTimer = setTimeout(flush, 16);
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
    clearTimeout(laterTimer);
    qTimer = 0;
    laterTimer = 0;
    queue.clear();
    later.clear();
    unadjustAll();
    cur = [];
    curMap = {};
  }

  function normalize(parts) {
    const map = {};
    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (!p || !DIRS.includes(p.dir) || !Number.isFinite(p.px)) continue;
        map[p.dir] = (map[p.dir] || 0) + p.px;
      }
    } else if (parts && typeof parts === 'object') {
      for (const d of DIRS) if (Number.isFinite(parts[d])) map[d] = parts[d];
    }
    return DIRS.filter((d) => map[d] > EPS).map((d) => ({ dir: d, px: map[d] }));
  }

  X.push = {
    on(parts, animate) {
      const next = normalize(parts);
      if (!next.length) { this.off(animate); return; }
      const el = rootEl(), st = el.style;
      if (!saved) {
        saved = {};
        for (const p of PROPS) saved[p] = [st.getPropertyValue(p), st.getPropertyPriority(p)];
      }
      clearTimeout(timer);
      const map = {};
      for (const p of next) map[p.dir] = p.px;
      const changed = next.length !== cur.length || next.some((p) => {
        const old = cur.find((c) => c.dir === p.dir);
        return !old || Math.abs(old.px - p.px) > EPS;
      });
      if (changed) { unadjustAll(); cur = next; curMap = map; }
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
