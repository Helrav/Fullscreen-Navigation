(() => {
  const api = globalThis.browser || globalThis.chrome;
  if (new URL(location.href).searchParams.has('embed')) document.documentElement.classList.add('embedded');
  const fields = [...document.querySelectorAll('[data-key]')];
  const status = document.getElementById('status');
  const screenEl = document.getElementById('screen');
  const zoneEl = document.getElementById('zone');
  let settings = tpNormalize();
  let flashTimer = 0, saveTimer = 0, lastLocalEdit = 0;

  screenEl.style.aspectRatio = (window.screen.width || 1920) + ' / ' + (window.screen.height || 1080);

  const parseSites = (text) => text.split('\n')
    .map((l) => l.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0].replace(/^www\./, ''))
    .filter(Boolean);

  const read = (el) => {
    if (el.dataset.key === 'sites') return parseSites(el.value);
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range' || el.type === 'number') return Number(el.value);
    return el.value;
  };

  function showOut(el) {
    const o = document.querySelector('[data-out="' + el.dataset.key + '"]');
    if (o) o.textContent = Math.round(el.value) + (o.dataset.unit || '');
  }

  function write(el, v) {
    if (el.dataset.key === 'sites') el.value = (v || []).join('\n');
    else if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
    showOut(el);
  }

  function writeKeys(keys) {
    fields.filter((el) => keys.includes(el.dataset.key)).forEach((el) => write(el, settings[el.dataset.key]));
  }

  function syncRows() {
    const vertical = settings.edge === 'left' || settings.edge === 'right';
    const box = settings.style === 'windowed';
    document.querySelectorAll('[data-for]').forEach((row) => { row.hidden = (row.dataset.for === 'v') !== vertical; });
    document.querySelectorAll('[data-notbox]').forEach((row) => { row.hidden = box; });
    const boxNote = document.getElementById('boxNote');
    if (boxNote) boxNote.hidden = !box;
    const bmMode = document.querySelector('[data-bookmarks-mode]');
    if (bmMode) bmMode.hidden = !settings.bookmarks || !vertical;
  }

  function applyTheme() {
    const theme = ['auto', 'light', 'dark'].includes(settings.theme) ? settings.theme : 'auto';
    const accent = /^#[0-9a-f]{6}$/i.test(String(settings.accent || ''))
      ? settings.accent
      : '#2f6fed';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.colorScheme = theme === 'auto' ? 'light dark' : theme;
  }

  function fixZone() {
    settings.zoneLength = tpClamp(Math.round(settings.zoneLength), 5, 100);
    settings.zoneStart = tpClamp(Math.round(settings.zoneStart), 0, 100 - settings.zoneLength);
  }

  function drawZone() {
    const W = screenEl.clientWidth, H = screenEl.clientHeight, s = settings;
    const vertical = s.edge === 'left' || s.edge === 'right';
    const total = vertical ? H : W;
    const len = (total * s.zoneLength) / 100, start = (total * s.zoneStart) / 100;
    const th = 6 + s.zoneThickness;      // drawn thicker than real so it is easy to grab
    const box = {
      left: [0, start, th, len], right: [W - th, start, th, len],
      top: [start, 0, len, th], bottom: [start, H - th, len, th]
    }[s.edge];
    Object.assign(zoneEl.style, { left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px' });
    zoneEl.dataset.edge = s.edge;
    zoneEl.dataset.dir = vertical ? 'v' : 'h';
  }

  function save() {
    lastLocalEdit = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await api.storage.local.set({ settings });
      status.textContent = 'Saved';
      status.classList.add('on');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => status.classList.remove('on'), 1200);
    }, 100);
  }

  async function load() {
    const r = await api.storage.local.get('settings');
    settings = tpNormalize(r.settings);
    applyTheme();
    fields.forEach((el) => write(el, settings[el.dataset.key]));
    syncRows();
    drawZone();
  }

  fields.forEach((el) => el.addEventListener('input', () => {
    const k = el.dataset.key;
    settings[k] = read(el);
    applyTheme();
    if (k === 'edge' || k === 'style') settings.winRect = null;
    // Selecting a floating window is an explicit request to show it; pinning
    // it here makes the choice visible even when the hot-zone cannot open it.
    if (k === 'style' && settings.style === 'windowed') api.storage.local.set({ pinned: true });
    if (['zoneStart', 'zoneLength', 'edge'].includes(k)) { fixZone(); writeKeys(['zoneStart', 'zoneLength']); }
    showOut(el);
    syncRows();
    drawZone();
    save();
  }));

  // ----- hot zone preview: drag to move, drag handles to resize -----
  function point(ev) {
    const r = screenEl.getBoundingClientRect();
    return { x: tpClamp(ev.clientX - r.left, 0, r.width), y: tpClamp(ev.clientY - r.top, 0, r.height), W: r.width, H: r.height };
  }

  function afterZoneChange() {
    fixZone();
    writeKeys(['edge', 'zoneStart', 'zoneLength', 'zoneThickness']);
    syncRows();
    drawZone();
    save();
  }

  function drag(el, onMove) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const up = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  drag(zoneEl, (ev) => {
    const { x, y, W, H } = point(ev);
    const d = { left: x, right: W - x, top: y, bottom: H - y };
    const edge = Object.keys(d).sort((a, b) => d[a] - d[b])[0];
    const vertical = edge === 'left' || edge === 'right';
    const total = vertical ? H : W;
    const len = (total * settings.zoneLength) / 100;
    const along = vertical ? y : x;
    if (edge !== settings.edge) { settings.edge = edge; settings.winRect = null; }
    settings.zoneStart = tpClamp(Math.round(((along - len / 2) / total) * 100), 0, 100 - settings.zoneLength);
    afterZoneChange();
  });

  const alongPct = (ev) => {
    const { x, y, W, H } = point(ev);
    const vertical = settings.edge === 'left' || settings.edge === 'right';
    return ((vertical ? y : x) / (vertical ? H : W)) * 100;
  };

  drag(zoneEl.querySelector('[data-h=a]'), (ev) => {
    const end = settings.zoneStart + settings.zoneLength;
    const start = tpClamp(Math.round(alongPct(ev)), 0, end - 5);
    settings.zoneStart = start;
    settings.zoneLength = end - start;
    afterZoneChange();
  });

  drag(zoneEl.querySelector('[data-h=b]'), (ev) => {
    const end = tpClamp(Math.round(alongPct(ev)), settings.zoneStart + 5, 100);
    settings.zoneLength = end - settings.zoneStart;
    afterZoneChange();
  });

  drag(zoneEl.querySelector('[data-h=t]'), (ev) => {
    const { x, y, W, H } = point(ev);
    const dist = { left: x, right: W - x, top: y, bottom: H - y }[settings.edge];
    settings.zoneThickness = tpClamp(Math.round(dist - 6), 1, 40);
    afterZoneChange();
  });

  window.addEventListener('resize', drawZone);

  document.getElementById('resetSize').addEventListener('click', () => {
    settings.winRect = null;
    settings.panelWidth = TP_DEFAULTS.panelWidth;
    settings.barHeight = TP_DEFAULTS.barHeight;
    writeKeys(['panelWidth', 'barHeight']);
    save();
  });

  document.getElementById('reset').addEventListener('click', async () => {
    settings = tpNormalize();
    await api.storage.local.set({ settings });
    await load();
    status.textContent = 'Reset';
    status.classList.add('on');
    setTimeout(() => status.classList.remove('on'), 1200);
  });

  // Pick up changes made on a page (resizing the panel or editing preferences).
  api.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.settings && Date.now() - lastLocalEdit > 1200) {
      settings = tpNormalize(ch.settings.newValue);
      applyTheme();
      fields.forEach((el) => { if (el.dataset.key !== 'sites' || document.activeElement !== el) write(el, settings[el.dataset.key]); });
      syncRows();
      drawZone();
    }
  });

  load();
})();
