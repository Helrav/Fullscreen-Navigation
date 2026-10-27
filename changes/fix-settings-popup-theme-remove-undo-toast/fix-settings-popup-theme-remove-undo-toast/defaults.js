// Shared by the content script and the options page.
const TP_DEFAULTS = {
  // Hot zone
  edge: 'left',            // left | right | top | bottom
  zoneStart: 30,            // % along the edge where the zone starts
  zoneLength: 40,           // % of the edge
  zoneThickness: 8,         // CSS pixels before browser-zoom compensation
  dwellMs: 150,
  triggerKey: 'none',       // none | ctrl | alt | shift | meta
  showHint: false,
  // Panel
  style: 'docked',          // docked | windowed
  panelWidth: 300,
  barHeight: 56,
  winRect: null,            // {x,y,w,h} for the floating window
  theme: 'auto',
  accent: '#4f8cff',
  showSearch: true,
  showNames: true,
  // Behavior
  onlyFullscreen: true,
  push: false,
  siteMode: 'inclusive',
  sites: [],
  closeDelayMs: 350,
  closeOnPick: true,
  searchIn: 'newtab',        // newtab | current
  undoSeconds: 8,
  // Bookmarks
  bookmarks: false,
  bookmarksMode: 'card',     // card | strip (left/right overlays)
  floatingBookmarksEdge: 'auto', // auto | left | right | top | bottom when floating
  floatingBookmarksDockOffset: 0 // legacy compatibility only; windowed bookmarks no longer offset the overlay
};

const tpClamp = (v, a, b) => Math.min(b, Math.max(a, v));

function tpNormalize(stored) {
  const s = { ...TP_DEFAULTS, ...(stored || {}) };
  if (stored && stored.zoneStart === undefined && stored.alignment) {
    const L = s.zoneLength;
    s.zoneStart = stored.alignment === 'start' ? 0 : stored.alignment === 'end' ? 100 - L : (100 - L) / 2;
  }
  if (stored && stored.push === undefined && stored.pinnedMode === 'push') s.push = true;
  // Migrate the previous floating "box" layout and its saved geometry.
  if (s.style === 'box') s.style = 'windowed';
  if (!s.winRect && s.boxRect) s.winRect = s.boxRect;
  delete s.boxRect;
  if (!['docked', 'windowed'].includes(s.style)) s.style = 'docked';
  if (!['left', 'right', 'top', 'bottom'].includes(s.edge)) s.edge = 'left';
  if (!['newtab', 'current'].includes(s.searchIn)) s.searchIn = 'newtab';
  if (!['card', 'strip'].includes(s.bookmarksMode)) s.bookmarksMode = 'card';
  if (!['auto', 'left', 'right', 'top', 'bottom'].includes(s.floatingBookmarksEdge)) s.floatingBookmarksEdge = 'auto';
  if (![null, -36, 0, 36].includes(s.floatingBookmarksDockOffset)) s.floatingBookmarksDockOffset = null;
  s.undoSeconds = tpClamp(Number(s.undoSeconds) || 8, 2, 30);
  s.zoneLength = tpClamp(Number(s.zoneLength) || 40, 5, 100);
  s.zoneStart = tpClamp(Number(s.zoneStart) || 0, 0, 100 - s.zoneLength);
  s.zoneThickness = tpClamp(Number(s.zoneThickness) || 8, 1, 40);
  s.panelWidth = tpClamp(Number(s.panelWidth) || 300, 52, 800);
  s.barHeight = tpClamp(Number(s.barHeight) || 56, 40, 400);
  if (!Array.isArray(s.sites)) s.sites = [];
  if (s.winRect && ['x','y','w','h'].some((k) => !Number.isFinite(Number(s.winRect[k])))) s.winRect = null;
  return s;
}

function tpAlign(s) {
  return s.zoneStart <= 1 ? 'start' : s.zoneStart + s.zoneLength >= 99 ? 'end' : 'center';
}

function tpHostMatch(host, sites) {
  return sites.some((e) => {
    e = String(e).trim().toLowerCase();
    return e && (host === e || host.endsWith('.' + e));
  });
}

function tpPushAllowed(s, host) {
  if (!s.push || s.style === 'windowed') return false;
  const listed = tpHostMatch(host, s.sites);
  return s.siteMode === 'exclusive' ? listed : !listed;
}

// Shared favicon loader for tabs and bookmarks.
//  - Working icon URLs are cached per site, so re-rendering a list (which happens
//    on every tab update) paints the icon immediately instead of flashing a
//    letter and then the image.
//  - Identical lookups in flight are shared, so 200 bookmarks on one site cost
//    one probe rather than 200.
//  - Options: { lazy: true } waits until the element scrolls near view (used for
//    long bookmark menus); { slot } remembers the last icon of a tab so a
//    loading tab keeps its old icon instead of dropping to a letter.
(() => {
  const X = (globalThis.TPX = globalThis.TPX || {});
  const api = globalThis.browser || globalThis.chrome;
  let chromium = false;
  try {
    const runtimeBase = api && api.runtime && api.runtime.getURL && api.runtime.getURL('/');
    chromium = typeof runtimeBase === 'string' && /^chrome-extension:\/\//i.test(runtimeBase);
  } catch (_) {}

  // Per-element tokens ensure late responses for an old URL cannot replace the
  // icon selected for a newer URL on the same element.
  const states = new WeakMap();
  let nextToken = 1;

  const good = new Map();       // cache key -> working icon URL
  const bad = new Map();        // cache key -> time of last total failure
  const inflight = new Map();   // cache key -> Promise<string|''>
  const slots = new Map();      // slot id -> { origin, src }
  const GOOD_MAX = 1500, BAD_TTL = 15000, LETTER_DELAY = 350;

  const originOf = (pageUrl) => {
    try {
      const u = new URL(String(pageUrl || ''));
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.origin : '';
    } catch (_) { return ''; }
  };

  function faviconServiceUrl(pageUrl) {
    if (!chromium || !api || !api.runtime || !api.runtime.getURL) return '';
    let page;
    try {
      page = new URL(String(pageUrl || ''));
      if (page.protocol !== 'http:' && page.protocol !== 'https:') return '';
    } catch (_) { return ''; }
    try {
      const endpoint = new URL(api.runtime.getURL('_favicon/'));
      endpoint.searchParams.set('pageUrl', page.href);
      endpoint.searchParams.set('size', '32');
      return endpoint.href;
    } catch (_) { return ''; }
  }

  function candidates(pageUrl, preferredUrl, serviceFirst, retryOnly = false) {
    const list = [];
    const seen = new Set();
    const serviceUrl = faviconServiceUrl(pageUrl);
    const add = (raw) => {
      if (typeof raw !== 'string' || !raw.trim()) return;
      const value = raw.trim();
      // Only allow our own generated extension URL for the internal favicon API.
      const isService = !!serviceUrl && value === serviceUrl;
      if (!isService && !/^(?:https?:\/\/|data:image\/|moz-anno:favicon:)/i.test(value)) return;
      if (!seen.has(value)) { seen.add(value); list.push(value); }
    };

    if (retryOnly) {
      add(preferredUrl);
      add(serviceUrl);
      return list;
    }
    if (serviceFirst) add(serviceUrl);
    add(preferredUrl);
    if (!serviceFirst) add(serviceUrl);

    // Same-origin guesses only as a last resort. Chromium's favicon service
    // already answers for every http(s) page, so one guess is enough there;
    // other browsers keep the longer list.
    const origin = originOf(pageUrl);
    if (origin) {
      const paths = chromium
        ? ['/favicon.ico']
        : ['/favicon.ico', '/favicon.svg', '/favicon.png', '/favicon-32x32.png', '/apple-touch-icon.png'];
      for (const path of paths) add(origin + path);
    }
    return list;
  }

  // Resolve the first candidate that really decodes. Result is shared by every
  // element asking for the same key.
  function probe(list) {
    return new Promise((resolve) => {
      let index = 0;
      const next = () => {
        if (index >= list.length) { resolve(''); return; }
        const src = list[index++];
        const img = new Image();
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.onload = () => (img.naturalWidth && img.naturalHeight) ? resolve(src) : next();
        img.onerror = next;
        img.src = src;
      };
      next();
    });
  }

  function resolveIcon(key, list) {
    if (good.has(key)) return Promise.resolve(good.get(key));
    if (!list.length) return Promise.resolve('');
    const failedAt = bad.get(key);
    if (failedAt && Date.now() - failedAt < BAD_TTL) return Promise.resolve('');
    let p = inflight.get(key);
    if (!p) {
      p = probe(list).then((src) => {
        inflight.delete(key);
        if (src) {
          if (good.size >= GOOD_MAX) good.delete(good.keys().next().value);
          good.set(key, src);
          bad.delete(key);
        } else bad.set(key, Date.now());
        return src;
      });
      inflight.set(key, p);
    }
    return p;
  }

  function makeImg(src) {
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.src = src;
    return img;
  }

  // One shared observer starts loading lazily-mounted icons once near view.
  let io = null;
  const pendingStart = new WeakMap();
  function whenVisible(el, fn) {
    if (typeof IntersectionObserver !== 'function') { fn(); return; }
    if (!io) {
      io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.unobserve(entry.target);
          const run = pendingStart.get(entry.target);
          pendingStart.delete(entry.target);
          if (run) run();
        }
      }, { rootMargin: '160px' });
    }
    pendingStart.set(el, fn);
    io.observe(el);
  }

  function mount(el, pageUrl, preferredUrl, label, options = {}) {
    if (!el) return;
    const state = { token: nextToken++, retries: 0, success: false, timer: 0 };
    states.set(el, state);
    const isCurrent = () => states.get(el) === state;

    const origin = originOf(pageUrl);
    const serviceFirst = !!options.serviceFirst;
    const key = (preferredUrl ? 'p|' + preferredUrl : 's|' + (origin || String(pageUrl || ''))) + (serviceFirst ? '|f' : '');
    const fallbackChar = ((String(label || '').trim().charAt(0)) || (options.emptyFallback ? '' : '•')).toUpperCase();

    const showLetter = () => {
      if (!isCurrent() || state.success) return;
      if (fallbackChar) { el.textContent = fallbackChar; el.classList.add('letter'); }
      else { el.replaceChildren(); el.classList.remove('letter'); }
    };
    const showIcon = (src) => {
      if (!isCurrent()) return;
      state.success = true;
      clearTimeout(state.timer);
      el.classList.remove('letter');
      el.replaceChildren(makeImg(src));
      if (options.slot) slots.set(options.slot, { origin, src });
    };

    // 1) Known-good icon: paint it right now, no letter, no async gap.
    let known = good.get(key);
    // 2) Loading tab with no icon yet: keep what this tab showed before, if it
    //    is the same site, instead of flashing a letter or a generic globe.
    if (!known && options.slot && !preferredUrl) {
      const prev = slots.get(options.slot);
      if (prev && prev.origin && prev.origin === origin) known = prev.src;
    }
    if (known) {
      el.classList.remove('letter');
      el.replaceChildren(makeImg(known));
      state.success = !!good.get(key);
      if (state.success) return;
    } else {
      // Leave the slot empty briefly; a letter only appears if loading is slow
      // or fails, so fast icons never flash a letter first.
      el.replaceChildren();
      el.classList.remove('letter');
      state.timer = setTimeout(showLetter, LETTER_DELAY);
    }

    const scheduleRetry = () => {
      // Retry native/service sources only: the browser may not have populated
      // its favicon cache at the first navigation notification.
      const delays = [280, 850, 1700];
      if (!isCurrent() || state.success || state.retries >= delays.length) return;
      const delay = delays[state.retries++];
      setTimeout(() => { if (isCurrent() && !state.success) attempt(true); }, delay);
    };

    const attempt = (retryOnly = false) => {
      if (!isCurrent() || state.success) return;
      const list = candidates(pageUrl, preferredUrl, serviceFirst, retryOnly);
      if (retryOnly) bad.delete(key);
      resolveIcon(key, list).then((src) => {
        if (!isCurrent() || state.success) return;
        if (src) showIcon(src);
        else { showLetter(); scheduleRetry(); }
      });
    };

    if (options.lazy) whenVisible(el, () => { if (isCurrent()) attempt(false); });
    else attempt(false);
  }

  X.favicons = { mount };
})();
