// Shared by the content script and the options page.
const FN_DEFAULTS = {
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
  barHeight: 40,
  horizontalWindows: 'current', // current | all (top/bottom strip layout)
  // Which side of a top/bottom strip the other-windows popover hangs from.
  winPopAlign: 'right',      // right | left
  winRect: null,            // {x,y,w,h} for the floating window
  theme: 'auto',
  accent: '#4f8cff',
  // Optional theme colour: tints every surface with shades of one colour and
  // drives the accent. Light/dark follows the Theme setting.
  themeTint: false,
  themeColor: '#4f8cff',
  showSearch: true,
  showNames: true,
  // Behavior
  onlyFullscreen: true,
  push: false,
  siteMode: 'inclusive',
  sites: [],
  closeDelayMs: 350,
  closeOnPick: true,
  // Collapse windows separately in each browser window's overlay.
  perWindowCollapse: false,
  // Windows opened (or tabs moved to a new window) through FullNav open fullscreen / without taking focus.
  newWindowFullscreen: true,
  openInBackground: true,
  searchIn: 'newtab',        // newtab | current
  // Bookmarks
  bookmarks: false,
  bookmarksMode: 'card',     // card | strip (left/right overlays)
  folderIconsVerticalOnly: false, // custom bookmark-folder icons show only in the vertical list
  floatingBookmarksEdge: 'auto', // auto | left | right | top | bottom when floating
  floatingBookmarksDockOffset: 0 // legacy compatibility only; windowed bookmarks no longer offset the overlay
};

const fnClamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Rough brightness (0 = black, 1 = white) of a #rrggbb colour.
const fnLuma = (hex) => {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

// ---- Theme colour -------------------------------------------------------
// One colour in, a whole palette out. Surfaces keep the colour's hue at a low
// saturation and are stepped in lightness so regions read as distinct layers:
//   head  : the deepest layer (toolbar / page behind cards)
//   bg    : the main surface (tab list)
//   bg2   : the raised layer (menus, bookmarks, settings cards)
function fnHexToHsl(hex) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hh = 0;
  if (d) {
    hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
    if (hh < 0) hh += 360;
  }
  const l = (max + min) / 2;
  const sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h: hh, s: sat, l };
}

function fnIsDark(s) {
  if (s.theme === 'dark') return true;
  if (s.theme === 'light') return false;
  try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (_) { return false; }
}

function fnPalette(s) {
  if (!s || !s.themeTint) return null;
  const dark = fnIsDark(s);
  const c = fnHexToHsl(s.themeColor);
  const h = Math.round(c.h);
  const pc = (v) => Math.round(v * 100);
  const sat = Math.min(c.s * 0.6, 0.4);            // tinted, never garish
  const hsl = (sa, l, a) => 'hsl(' + h + ' ' + pc(sa) + '% ' + pc(l) + '%' + (a == null ? '' : ' / ' + a) + ')';
  // The accent keeps the chosen colour but is nudged so it stays readable.
  const acc = fnHexToHsl(s.themeColor);
  const accL = dark ? Math.max(acc.l, 0.6) : Math.min(acc.l, 0.48);
  const accent = 'hsl(' + h + ' ' + pc(Math.max(acc.s, 0.45)) + '% ' + pc(accL) + '%)';
  if (dark) {
    return {
      dark,
      '--head': hsl(sat, 0.085),
      '--bg': hsl(sat, 0.125),
      '--bg2': hsl(sat, 0.175),
      '--fg': hsl(Math.min(sat, 0.2), 0.93),
      '--muted': hsl(Math.min(sat, 0.25), 0.7),
      '--line': hsl(Math.min(sat + 0.1, 0.5), 0.8, 0.14),
      '--hover': hsl(Math.min(sat + 0.1, 0.5), 0.85, 0.08),
      '--sel': hsl(Math.min(sat + 0.1, 0.5), 0.85, 0.15),
      '--accent': accent,
      '--fav-edge': 'none'
    };
  }
  return {
    dark,
    '--head': hsl(sat, 0.925),
    '--bg': hsl(Math.min(sat + 0.1, 0.5), 0.955),
    '--bg2': hsl(Math.min(sat + 0.1, 0.5), 0.99),
    '--fg': hsl(Math.min(sat, 0.3), 0.13),
    '--muted': hsl(Math.min(sat, 0.2), 0.4),
    '--line': hsl(Math.min(sat + 0.1, 0.5), 0.2, 0.15),
    '--hover': hsl(Math.min(sat + 0.1, 0.5), 0.25, 0.07),
    '--sel': hsl(Math.min(sat + 0.1, 0.5), 0.25, 0.12),
    '--accent': accent,
    '--fav-edge': 'drop-shadow(0 0 .5px rgba(20,24,30,.6)) drop-shadow(0 0 1px rgba(20,24,30,.35))'
  };
}

const FN_PALETTE_VARS = ['--head', '--bg', '--bg2', '--fg', '--muted', '--line', '--hover', '--sel', '--accent', '--fav-edge'];
// Settings page variables for the same palette.
const FN_PAGE_MAP = { '--bg': '--head', '--card': '--bg2', '--fg': '--fg', '--muted': '--muted', '--line': '--line', '--accent': '--accent' };

// target: 'overlay' (element holding the overlay's variables) or 'page' (settings document).
function fnApplyPalette(el, s, target) {
  const st = el.style;
  const pal = fnPalette(s);
  if (target === 'page') {
    for (const k of Object.keys(FN_PAGE_MAP)) st.removeProperty(k);
    st.removeProperty('--line-soft');
    if (!pal) { st.colorScheme = s.theme === 'auto' ? 'light dark' : s.theme; return; }
    for (const [k, from] of Object.entries(FN_PAGE_MAP)) st.setProperty(k, pal[from]);
    st.colorScheme = pal.dark ? 'dark' : 'light';
    return;
  }
  for (const k of FN_PALETTE_VARS) {
    if (pal) st.setProperty(k, pal[k]); else st.removeProperty(k);
  }
}

function fnNormalize(stored) {
  const s = { ...FN_DEFAULTS, ...(stored || {}) };
  if (stored && stored.zoneStart === undefined && stored.alignment) {
    const L = s.zoneLength;
    s.zoneStart = stored.alignment === 'start' ? 0 : stored.alignment === 'end' ? 100 - L : (100 - L) / 2;
  }
  if (stored && stored.push === undefined && stored.pinnedMode === 'push') s.push = true;
  // Migrate the previous floating "box" layout and its saved geometry.
  if (s.style === 'box') s.style = 'windowed';
  if (!s.winRect && s.boxRect) s.winRect = s.boxRect;
  delete s.boxRect;
  delete s.undoSeconds;
  if (!['docked', 'windowed'].includes(s.style)) s.style = 'docked';
  if (!['left', 'right', 'top', 'bottom'].includes(s.edge)) s.edge = 'left';
  if (!['newtab', 'current'].includes(s.searchIn)) s.searchIn = 'newtab';
  if (!['card', 'strip'].includes(s.bookmarksMode)) s.bookmarksMode = 'card';
  if (!['current', 'all'].includes(s.horizontalWindows)) s.horizontalWindows = 'current';
  if (!['left', 'right'].includes(s.winPopAlign)) s.winPopAlign = FN_DEFAULTS.winPopAlign;
  if (!['auto', 'left', 'right', 'top', 'bottom'].includes(s.floatingBookmarksEdge)) s.floatingBookmarksEdge = 'auto';
  if (![null, -36, 0, 36].includes(s.floatingBookmarksDockOffset)) s.floatingBookmarksDockOffset = null;
  s.zoneLength = fnClamp(Number(s.zoneLength) || 40, 5, 100);
  s.zoneStart = fnClamp(Number(s.zoneStart) || 0, 0, 100 - s.zoneLength);
  s.zoneThickness = fnClamp(Number(s.zoneThickness) || 8, 1, 40);
  s.panelWidth = fnClamp(Number(s.panelWidth) || 300, 52, 800);
  s.barHeight = fnClamp(Number(s.barHeight) || 40, 40, 400);
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
  // Older builds had separate background/text colours; keep the background's hue.
  if (stored && stored.themeTint === undefined && stored.customColors) {
    s.themeTint = true;
    s.themeColor = stored.customBg;
  }
  delete s.customColors; delete s.customBg; delete s.customFg;
  s.themeTint = !!s.themeTint;
  s.themeColor = hex(s.themeColor, FN_DEFAULTS.themeColor);
  s.perWindowCollapse = !!s.perWindowCollapse;
  s.folderIconsVerticalOnly = !!s.folderIconsVerticalOnly;
  s.newWindowFullscreen = s.newWindowFullscreen !== false;
  s.openInBackground = s.openInBackground !== false;
  if (!Array.isArray(s.sites)) s.sites = [];
  if (s.winRect && ['x','y','w','h'].some((k) => !Number.isFinite(Number(s.winRect[k])))) s.winRect = null;
  return s;
}

function fnAlign(s) {
  return s.zoneStart <= 1 ? 'start' : s.zoneStart + s.zoneLength >= 99 ? 'end' : 'center';
}

function fnHostMatch(host, sites) {
  return sites.some((e) => {
    e = String(e).trim().toLowerCase();
    return e && (host === e || host.endsWith('.' + e));
  });
}

function fnPushAllowed(s, host) {
  if (!s.push || s.style === 'windowed') return false;
  const listed = fnHostMatch(host, s.sites);
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
  const X = (globalThis.FNX = globalThis.FNX || {});
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
