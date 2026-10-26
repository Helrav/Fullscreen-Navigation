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
  floatingBookmarksDockOffset: null // internal vertical offset reserved for a floating top/bottom bookmark bar
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

// Shared favicon loader for tabs and bookmarks. Browser favicons can appear
// after the initial navigation event, so this helper supports delayed retries.
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

    // Browser-provided favicons can be unavailable on some browsers, so try
    // conventional same-origin paths only after the actual icon sources.
    let page;
    try {
      const parsed = new URL(String(pageUrl || ''));
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') page = parsed;
    } catch (_) {}
    if (page) {
      for (const path of ['/favicon.ico', '/favicon.svg', '/favicon.png', '/favicon-32x32.png', '/apple-touch-icon.png']) {
        add(page.origin + path);
      }
    }
    return list;
  }

  function mount(el, pageUrl, preferredUrl, label, options = {}) {
    if (!el) return;
    const state = {
      token: nextToken++,
      key: String(pageUrl || '') + '\n' + String(preferredUrl || ''),
      retries: 0,
      success: false
    };
    states.set(el, state);
    const isCurrent = () => states.get(el) === state;
    const fallback = ((String(label || '').trim().charAt(0)) || (options.emptyFallback ? '' : '•')).toUpperCase();
    if (fallback) {
      el.textContent = fallback;
      el.classList.add('letter');
    } else {
      el.replaceChildren();
      el.classList.remove('letter');
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
      const list = candidates(pageUrl, preferredUrl, !!options.serviceFirst, retryOnly);
      let index = 0;
      const tryNext = () => {
        if (!isCurrent() || state.success) return;
        if (index >= list.length) { scheduleRetry(); return; }
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.onload = () => {
          if (!isCurrent() || state.success) return;
          if (!img.naturalWidth || !img.naturalHeight) { tryNext(); return; }
          state.success = true;
          el.classList.remove('letter');
          el.replaceChildren(img);
        };
        img.onerror = tryNext;
        img.src = list[index++];
      };
      tryNext();
    };

    attempt(false);
  }

  X.favicons = { mount };
})();

