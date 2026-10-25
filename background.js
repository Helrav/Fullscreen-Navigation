const api = globalThis.browser || globalThis.chrome;

// Tab Peek keeps window labels internally because browsers do not expose a
// general API for naming their own windows. These labels intentionally reset
// when the browser starts again because window IDs may be reused.
if (api.runtime.onStartup) api.runtime.onStartup.addListener(() => {
  api.storage.local.remove('windowNames');
});

if (api.windows && api.windows.onRemoved) {
  api.windows.onRemoved.addListener(async (id) => {
    try {
      const { windowNames = {} } = await api.storage.local.get('windowNames');
      if (Object.prototype.hasOwnProperty.call(windowNames, id)) {
        delete windowNames[id];
        await api.storage.local.set({ windowNames });
      }
    } catch (_) {}
  });
}

api.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-pin') return;
  const { pinned, settings } = await api.storage.local.get(['pinned', 'settings']);
  const next = !pinned;
  const state = { pinned: next };
  if (!settings || settings.style !== 'windowed') state.dockedPinned = next;
  await api.storage.local.set(state);
});

const slim = (tab) => ({
  id: tab.id,
  windowId: tab.windowId,
  title: tab.title || tab.url || 'New tab',
  url: tab.url || '',
  favIconUrl: tab.favIconUrl || '',
  active: !!tab.active,
  pinned: !!tab.pinned,
  audible: !!tab.audible,
  muted: !!(tab.mutedInfo && tab.mutedInfo.muted),
  discarded: !!tab.discarded,
  groupId: Number.isInteger(tab.groupId) ? tab.groupId : -1
});

async function collect() {
  const [wins, all, stored] = await Promise.all([
    api.windows.getAll({ windowTypes: ['normal'] }),
    api.tabs.query({}),
    api.storage.local.get('windowNames')
  ]);
  const names = stored.windowNames || {};
  const groups = {};
  if (api.tabGroups && api.tabGroups.query) {
    try {
      for (const group of await api.tabGroups.query({})) {
        groups[group.id] = {
          title: group.title || '',
          color: group.color || 'grey',
          windowId: group.windowId,
          collapsed: !!group.collapsed
        };
      }
    } catch (_) {}
  }
  const byWindow = new Map();
  for (const tab of all) {
    if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, []);
    byWindow.get(tab.windowId).push(tab);
  }
  const windows = wins
    .filter((win) => byWindow.has(win.id))
    .sort((a, b) => a.id - b.id)
    .map((win) => ({
      id: win.id,
      name: String(names[win.id] || ''),
      tabs: byWindow.get(win.id).sort((a, b) => a.index - b.index).map(slim)
    }));
  return { windows, groups };
}

// A plain host/domain or an explicitly schemed URL is a URL. Text that is not
// recognizably a URL is handed to the browser's default search provider.
function toUrl(text) {
  const value = String(text || '').trim();
  if (!value || /\s/.test(value)) return null;
  if (/^(https?|ftp|file):\/\/\S+$/i.test(value)) return value;
  if (/^(chrome|edge|brave|vivaldi|opera|about):\S+$/i.test(value)) return value;
  if (/^localhost(:\d+)?([/?#]\S*)?$/i.test(value) || /^(\d{1,3}\.){3}\d{1,3}(:\d+)?([/?#]\S*)?$/.test(value)) return 'http://' + value;
  if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(value)) return 'https://' + value;
  return null;
}

async function searchDefault(query, inNewTab, sender) {
  const text = String(query || '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  const tabId = sender && sender.tab && sender.tab.id;
  const windowId = sender && sender.tab && sender.tab.windowId;
  try {
    if (api.search && api.search.query) {
      const queryInfo = inNewTab
        ? { text, disposition: 'NEW_TAB' }
        : (Number.isInteger(tabId) ? { text, tabId } : { text, disposition: 'CURRENT_TAB' });
      await api.search.query(queryInfo);
      return { ok: true };
    }
    if (api.search && api.search.search) {
      const queryInfo = inNewTab
        ? { query: text, disposition: 'NEW_TAB' }
        : (Number.isInteger(tabId) ? { query: text, tabId } : { query: text, disposition: 'CURRENT_TAB' });
      await api.search.search(queryInfo);
      return { ok: true };
    }
  } catch (_) {
    // The browser can expose a Search namespace but still reject a request
    // (for example when its search provider is unavailable). Fall back below.
  }
  // Fallback for browsers that do not expose a working Search API. Google is
  // used only here; Chromium and Firefox normally use the browser default.
  const url = 'https://www.google.com/search?q=' + encodeURIComponent(text);
  if (inNewTab) await api.tabs.create({ url, ...(Number.isInteger(windowId) ? { windowId } : {}) });
  else if (Number.isInteger(tabId)) await api.tabs.update(tabId, { url });
  else await api.tabs.create({ url, ...(Number.isInteger(windowId) ? { windowId } : {}) });
  return { ok: true };
}

async function go(text, inNewTab, sender) {
  const value = String(text || '').trim();
  if (!value) return { ok: false, reason: 'empty' };
  const tabId = sender && sender.tab && sender.tab.id;
  const windowId = sender && sender.tab && sender.tab.windowId;
  const url = toUrl(value);
  if (url) {
    try {
      if (inNewTab) await api.tabs.create({ url, windowId });
      else if (Number.isInteger(tabId)) await api.tabs.update(tabId, { url });
      else await api.tabs.create({ url, windowId });
      return { ok: true, kind: 'url' };
    } catch (_) {
      // Browser-internal URLs can be blocked for security reasons. Treat them
      // as search text rather than letting the request fail silently.
    }
  }
  const result = await searchDefault(value, inNewTab, sender);
  return { ...result, kind: 'search' };
}

// ---------- bookmarks ----------
async function bookmarksTree() {
  if (!api.bookmarks || !api.bookmarks.getTree) return null;
  const root = (await api.bookmarks.getTree())[0];
  if (!root) return { barId: null, bar: [], other: [] };
  const mapNode = (node) => node.url
    ? { id: node.id, parentId: node.parentId, title: typeof node.title === 'string' ? node.title : '', url: node.url }
    : { id: node.id, parentId: node.parentId, title: node.title || 'Folder', children: (node.children || []).map(mapNode) };
  let bar = null;
  let other = null;
  for (const child of root.children || []) {
    if (child.id === '1' || child.id === 'toolbar_____' || child.folderType === 'bookmarks-bar') bar = child;
    else if (child.id === '2' || child.id === 'unfiled_____' || child.folderType === 'other') other = child;
  }
  if (!bar) bar = (root.children || [])[0] || null;
  return {
    barId: bar ? bar.id : null,
    otherId: other ? other.id : null,
    bar: bar ? (bar.children || []).map(mapNode) : [],
    other: other ? (other.children || []).map(mapNode) : []
  };
}


async function cloneBookmarkNode(source, parentId) {
  const details = {
    parentId: String(parentId),
    title: typeof source.title === 'string' ? source.title : ''
  };
  if (source.url) details.url = source.url;
  const created = await api.bookmarks.create(details);
  for (const child of source.children || []) await cloneBookmarkNode(child, created.id);
  return created;
}

async function openFolderBookmarks(folderId, operation, senderTab) {
  if (!folderId || !api.bookmarks || !api.bookmarks.getSubTree) return { ok: false, reason: 'missing-folder' };
  const result = await api.bookmarks.getSubTree(String(folderId));
  const folder = result && result[0];
  if (!folder || !Array.isArray(folder.children)) return { ok: false, reason: 'missing-folder' };

  const allowedUrl = (value) => /^(https?|ftp|file|about|chrome|edge|brave|vivaldi|opera):/i.test(String(value || ''))
    && !/^javascript:/i.test(String(value || ''));
  const urls = folder.children.filter((item) => item && item.url && allowedUrl(item.url)).map((item) => item.url);
  if (!urls.length) return { ok: true, count: 0 };

  const sourceWindow = senderTab && Number.isInteger(senderTab.windowId) ? senderTab.windowId : undefined;
  const addTabs = async (windowId, startIndex = 0) => {
    const opened = [];
    for (let i = startIndex; i < urls.length; i++) {
      const tab = await api.tabs.create({ url: urls[i], active: false, ...(Number.isInteger(windowId) ? { windowId } : {}) });
      if (tab && Number.isInteger(tab.id)) opened.push(tab.id);
    }
    return opened;
  };

  switch (operation) {
    case 'openFolder': {
      const opened = await addTabs(sourceWindow);
      return { ok: true, count: opened.length };
    }
    case 'openFolderWindow': {
      const win = await api.windows.create({ url: urls });
      if (!win || !Number.isInteger(win.id)) return { ok: false, reason: 'window-create-failed' };
      return { ok: true, count: urls.length };
    }
    case 'openFolderIncognito': {
      const win = await api.windows.create({ url: urls, incognito: true });
      if (!win || !Number.isInteger(win.id)) return { ok: false, reason: 'window-create-failed' };
      return { ok: true, count: urls.length };
    }
    case 'openFolderGroup': {
      if (typeof api.tabs.group !== 'function') return { ok: false, reason: 'tab-groups-unavailable' };
      const opened = await addTabs(sourceWindow);
      if (!opened.length) return { ok: false, reason: 'no-tabs-opened' };
      const groupId = await api.tabs.group({ tabIds: opened });
      return { ok: true, count: opened.length, groupId };
    }
    default:
      return { ok: false, reason: 'unknown-operation' };
  }
}

async function bookmarkAction(message, sender) {
  const bm = api.bookmarks;
  if (!bm) return { ok: false, reason: 'unsupported' };
  const op = String(message && message.op || '');
  const id = message && message.id != null ? String(message.id) : '';
  const url = String(message && message.url || '');
  const senderTab = sender && sender.tab;
  const local = api.storage && api.storage.local;

  try {
    switch (op) {
      case 'capabilities':
        return { ok: true, splitView: typeof api.tabs.createSplit === 'function', tabGroups: typeof api.tabs.group === 'function' };

      case 'openTab':
        if (!url) return { ok: false, reason: 'missing-url' };
        await api.tabs.create({ url, ...(senderTab && Number.isInteger(senderTab.windowId) ? { windowId: senderTab.windowId } : {}) });
        return { ok: true };

      case 'openWindow':
        if (!url) return { ok: false, reason: 'missing-url' };
        await api.windows.create({ url });
        return { ok: true };

      case 'openIncognito':
        if (!url) return { ok: false, reason: 'missing-url' };
        await api.windows.create({ url, incognito: true });
        return { ok: true };

      case 'openFolder':
      case 'openFolderWindow':
      case 'openFolderIncognito':
      case 'openFolderGroup':
        return openFolderBookmarks(id, op, senderTab);

      case 'openSplit': {
        if (!url || typeof api.tabs.createSplit !== 'function') return { ok: false, reason: 'split-view-unavailable' };
        const current = senderTab && Number.isInteger(senderTab.id)
          ? await api.tabs.get(senderTab.id).catch(() => null)
          : (await api.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []))[0];
        if (!current || current.splitViewId >= 0) return { ok: false, reason: 'split-view-unavailable' };
        let created = null;
        try {
          created = await api.tabs.create({
            url,
            windowId: current.windowId,
            index: current.index + 1,
            pinned: !!current.pinned,
            active: true
          });
          if (Number.isInteger(current.groupId) && current.groupId >= 0) {
            await api.tabs.group({ tabIds: [created.id], groupId: current.groupId });
            const anchor = await api.tabs.get(current.id);
            await api.tabs.move(created.id, { windowId: current.windowId, index: anchor.index + 1 });
          }
          await api.tabs.createSplit([current.id, created.id]);
          return { ok: true };
        } catch (_) {
          if (created && Number.isInteger(created.id)) await api.tabs.remove(created.id).catch(() => {});
          return { ok: false, reason: 'split-view-unavailable' };
        }
      }

      case 'update':
        if (!id) return { ok: false, reason: 'missing-id' };
        {
          const changes = { title: String(message.title == null ? '' : message.title) };
          if (typeof message.url === 'string') changes.url = message.url;
          await bm.update(id, changes);
        }
        scheduleBookmarks();
        return { ok: true };

      case 'createPage':
      case 'createFolder': {
        const tree = await bookmarksTree();
        const parentId = message.parentId != null ? String(message.parentId) : tree && tree.barId;
        if (!parentId) return { ok: false, reason: 'missing-parent' };
        const details = { parentId, title: String(message.title == null ? '' : message.title) };
        if (op === 'createPage') {
          if (!url) return { ok: false, reason: 'missing-url' };
          details.url = url;
        }
        await bm.create(details);
        scheduleBookmarks();
        return { ok: true };
      }

      case 'delete':
        if (!id) return { ok: false, reason: 'missing-id' };
        {
          const found = await bm.getSubTree(id);
          if (!found || !found[0]) return { ok: false, reason: 'missing-bookmark' };
          if (found[0].children) await bm.removeTree(id);
          else await bm.remove(id);
        }
        scheduleBookmarks();
        return { ok: true };

      case 'clipboardGet': {
        const stored = local ? await local.get('tabPeekBookmarkClipboard') : {};
        const clip = stored && stored.tabPeekBookmarkClipboard;
        return { ok: true, available: !!(clip && clip.item && clip.item.id), cut: !!(clip && clip.cut) };
      }

      case 'clipboardSet': {
        if (!local || !id) return { ok: false, reason: 'unsupported' };
        const found = await bm.getSubTree(id);
        if (!found || !found[0]) return { ok: false, reason: 'missing-bookmark' };
        await local.set({ tabPeekBookmarkClipboard: { item: found[0], cut: !!message.cut } });
        return { ok: true };
      }

      case 'clipboardPaste': {
        if (!local || !message.parentId) return { ok: false, reason: 'missing-parent' };
        const stored = await local.get('tabPeekBookmarkClipboard');
        const clip = stored && stored.tabPeekBookmarkClipboard;
        if (!clip || !clip.item || !clip.item.id) return { ok: false, reason: 'clipboard-empty' };
        const destination = String(message.parentId);
        const contains = (node, targetId) => String(node.id) === String(targetId)
          || (node.children || []).some((child) => contains(child, targetId));
        if (clip.cut && contains(clip.item, destination)) return { ok: false, reason: 'paste-into-self' };
        await cloneBookmarkNode(clip.item, destination);
        if (clip.cut) {
          if (clip.item.children) await bm.removeTree(String(clip.item.id));
          else await bm.remove(String(clip.item.id));
          await local.remove('tabPeekBookmarkClipboard');
        }
        scheduleBookmarks();
        return { ok: true };
      }

      case 'openManager': {
        const isFirefox = api.runtime.getURL('').startsWith('moz-extension:');
        await api.tabs.create({ url: isFirefox ? 'about:bookmarks' : 'chrome://bookmarks/' });
        return { ok: true };
      }

      case 'showBarSettings': {
        // WebExtensions do not expose a cross-browser API to toggle the native
        // bookmarks bar. Open its browser settings instead of silently doing nothing.
        const isFirefox = api.runtime.getURL('').startsWith('moz-extension:');
        await api.tabs.create({ url: isFirefox ? 'about:preferences#general' : 'chrome://settings/appearance' });
        return { ok: true, settingsOpened: true };
      }

      default:
        return { ok: false, reason: 'unknown-operation' };
    }
  } catch (_) {
    return { ok: false, reason: 'operation-failed' };
  }
}

async function bookmarkTabs(ids) {
  if (!api.bookmarks || !api.bookmarks.create) return { ok: false, reason: 'unsupported' };
  const tabs = (await Promise.all(ids.map((id) => api.tabs.get(id).catch(() => null)))
    ).filter((tab) => tab && tab.url && !/^(chrome|edge|about|javascript):/i.test(tab.url));
  if (!tabs.length) return { ok: false, reason: 'no-bookmarkable-tabs' };
  const tree = await bookmarksTree();
  const parentId = tree && tree.barId ? tree.barId : undefined;
  if (tabs.length === 1) {
    await api.bookmarks.create({ parentId, title: tabs[0].title || tabs[0].url, url: tabs[0].url });
  } else {
    const folder = await api.bookmarks.create({ parentId, title: 'Saved tabs ' + new Date().toLocaleDateString() });
    for (const tab of tabs) {
      await api.bookmarks.create({ parentId: folder.id, title: tab.title || tab.url, url: tab.url });
    }
  }
  return { ok: true };
}

// ---------- tab groups ----------
async function groupTabs(ids, groupId) {
  if (!api.tabs.group) return { ok: false, reason: 'unsupported' };
  const tabs = (await Promise.all(ids.map((id) => api.tabs.get(id).catch(() => null)))).filter(Boolean);
  if (!tabs.length) return { ok: false };
  // New groups can only contain tabs from one window; keep the current visible
  // ordering and bring tabs from other windows into the first selected tab's window.
  const ordered = ids.map((id) => tabs.find((tab) => tab.id === id)).filter(Boolean);
  let targetWindowId = ordered[0].windowId;
  if (Number.isInteger(groupId) && groupId >= 0) {
    const group = await api.tabGroups.get(groupId).catch(() => null);
    if (!group) return { ok: false, reason: 'missing-group' };
    targetWindowId = group.windowId;
  }
  // Append every selected tab in the passed display order, including tabs
  // already in the destination window, so mixed-window selections stay ordered.
  let existingGroupTabIds = new Set();
  if (Number.isInteger(groupId) && groupId >= 0) {
    existingGroupTabIds = new Set(ordered.filter((tab) => tab.groupId === groupId).map((tab) => tab.id));
  }
  for (const tab of ordered) {
    // A pinned tab cannot belong to a group, so unpin it before grouping.
    if (tab.pinned) await api.tabs.update(tab.id, { pinned: false });
    // Do not stage existing destination-group tabs at the end: moving every
    // member can destroy the group before the group operation runs.
    if (existingGroupTabIds.has(tab.id)) continue;
    await api.tabs.move(tab.id, { windowId: targetWindowId, index: -1 });
  }
  const orderedIds = ordered.map((tab) => tab.id);
  const resultGroupId = Number.isInteger(groupId) && groupId >= 0
    ? await api.tabs.group({ tabIds: orderedIds, groupId })
    : await api.tabs.group({ tabIds: orderedIds });
  return { ok: true, groupId: resultGroupId };
}

// Moving target shapes:
// {kind:'tab', tabId, pos:'before'|'after'} | {kind:'group', groupId} | {kind:'window', windowId}
async function moveTabs(ids, target) {
  if (!target || !Array.isArray(ids)) return { ok: false };
  const unique = [...new Set(ids.filter(Number.isInteger))];
  const tabs = (await Promise.all(unique.map((id) => api.tabs.get(id).catch(() => null)))).filter(Boolean);
  if (!tabs.length) return { ok: false };
  const orderedIds = tabs.map((tab) => tab.id);
  const moving = new Set(orderedIds);
  let windowId;
  let destinationGroupId = -1;
  let anchorId = null;
  let position = target.pos === 'after' ? 'after' : 'before';
  let atEnd = false;
  let atGroupStart = false;
  let pinnedDestination = false;

  if (target.kind === 'tab') {
    anchorId = Number(target.tabId);
    if (moving.has(anchorId)) return { ok: false, reason: 'drop-on-selection' };
    const anchor = await api.tabs.get(anchorId).catch(() => null);
    if (!anchor) return { ok: false };
    windowId = anchor.windowId;
    destinationGroupId = Number.isInteger(anchor.groupId) ? anchor.groupId : -1;
    pinnedDestination = destinationGroupId < 0 && !!anchor.pinned;
  } else if (target.kind === 'group') {
    if (!api.tabGroups || !api.tabGroups.get) return { ok: false, reason: 'unsupported' };
    const group = await api.tabGroups.get(Number(target.groupId)).catch(() => null);
    if (!group) return { ok: false };
    windowId = group.windowId;
    destinationGroupId = group.id;
    atGroupStart = true;
  } else if (target.kind === 'window') {
    windowId = Number(target.windowId);
    atEnd = true;
  } else {
    return { ok: false };
  }

  // Match pin state to the destination. Pinned tabs cannot be in groups and
  // cannot be inserted after ordinary tabs, so normalize it before moving.
  for (const tab of tabs) {
    // Moving to a window preserves each tab's pin state. Other destinations
    // must match the target row (pinned region, unpinned region, or a group).
    const shouldPin = target.kind === 'window'
      ? !!tab.pinned
      : (!atGroupStart && destinationGroupId < 0 && pinnedDestination);
    try {
      if (!!tab.pinned !== shouldPin) await api.tabs.update(tab.id, { pinned: shouldPin });
    } catch (_) {}
  }

  // Move selected tabs to the destination window in visual order. For tab and
  // group targets they are temporarily staged at the end, then inserted at
  // the exact destination index below. When dropping on a group, leave tabs
  // already in that group in place so staging cannot destroy an all-selected
  // group before the new members are added.
  for (const tab of tabs) {
    // Tabs already in the destination group stay put until the other members
    // have arrived; this prevents deleting a group whose every tab is selected.
    if (target.kind === 'group' && tab.groupId === destinationGroupId) continue;
    try {
      await api.tabs.move(tab.id, { windowId, index: -1 });
    } catch (_) {
      // A tab may have been closed or its window may have disappeared mid-move.
    }
  }

  // Group operations happen only after the tabs have reached one window.
  if (api.tabs.group && api.tabs.ungroup) {
    try {
      if (destinationGroupId >= 0) await api.tabs.group({ tabIds: orderedIds, groupId: destinationGroupId });
      else if (target.kind !== 'window') await api.tabs.ungroup(orderedIds);
    } catch (_) {
      if (destinationGroupId >= 0) return { ok: false, reason: 'group-failed' };
    }
  }

  if (atEnd) return { ok: true };

  let rawIndex;
  if (atGroupStart) {
    const groupTabs = await api.tabs.query({ groupId: destinationGroupId });
    const others = groupTabs.filter((tab) => !moving.has(tab.id));
    rawIndex = others.length
      ? Math.min(...others.map((tab) => tab.index))
      : (groupTabs.length ? Math.min(...groupTabs.map((tab) => tab.index)) : 0);
  } else {
    // Fetch the anchor again: staging selected tabs may have shifted its index.
    const anchor = await api.tabs.get(anchorId).catch(() => null);
    if (!anchor) return { ok: false };
    rawIndex = anchor.index + (position === 'after' ? 1 : 0);
  }

  try {
    await api.tabs.move(orderedIds, { windowId, index: rawIndex });
  } catch (_) {
    // Fallback for engines that reject multi-tab moves.
    let insert = rawIndex;
    for (const id of orderedIds) {
      try { await api.tabs.move(id, { windowId, index: insert }); insert++; } catch (_) {}
    }
  }
  return { ok: true };
}

async function undoClose(count, since) {
  if (!api.sessions || !api.sessions.getRecentlyClosed || !api.sessions.restore) {
    return { ok: false, restored: 0, reason: 'unsupported' };
  }
  const want = Math.max(1, Math.min(100, Number(count) | 0));
  const cutoff = Number(since) || 0; // caller timestamp is always milliseconds
  const seen = new Set();
  let restored = 0, passes = 0;
  while (restored < want && passes++ < 5) {
    const items = await api.sessions.getRecentlyClosed({ maxResults: 25 });
    // Chromium reports lastModified in seconds; Firefox reports milliseconds.
    // Normalize both to ms before comparing to the toast's cutoff timestamp.
    const available = items.filter((session) => {
      const raw = Number(session.lastModified || 0);
      const modifiedMs = raw > 0 && raw < 100000000000 ? raw * 1000 : raw;
      const id = session.tab && session.tab.sessionId;
      return !!id && !seen.has(id) && (!cutoff || modifiedMs >= cutoff);
    });
    if (!available.length) break;
    let progressed = false;
    for (const session of available) {
      if (restored >= want) break;
      const id = session.tab && session.tab.sessionId;
      if (!id) continue;
      seen.add(id);
      try {
        await api.sessions.restore(id);
        restored++;
        progressed = true;
      } catch (_) {}
    }
    if (!progressed) break;
  }
  return { ok: true, restored };
}

async function handle(message, sender) {
  const senderTab = sender && sender.tab;
  const windowId = senderTab && senderTab.windowId;
  const ids = (message && Array.isArray(message.tabIds) ? message.tabIds : []).filter(Number.isInteger);
  switch (message && message.type) {
    case 'env': {
      const win = await api.windows.get(windowId);
      let zoom = 1;
      try { zoom = await api.tabs.getZoom(senderTab.id); } catch (_) {}
      return { fullscreen: win.state === 'fullscreen', zoom: zoom > 0 ? zoom : 1 };
    }
    case 'tabs':
      return { cur: windowId, ...(await collect()) };
    case 'recentClosedInfo': {
      if (!api.sessions || !api.sessions.getRecentlyClosed) return { ok: false, kind: null };
      const [last] = await api.sessions.getRecentlyClosed({ maxResults: 1 });
      if (!last) return { ok: true, kind: null };
      if (last.window) return { ok: true, kind: 'window', sessionId: last.window.sessionId || null };
      if (last.tab) return { ok: true, kind: 'tab', sessionId: last.tab.sessionId || null };
      return { ok: true, kind: null };
    }
    case 'restoreLastClosed': {
      if (!api.sessions || !api.sessions.getRecentlyClosed || !api.sessions.restore) return { ok: false, reason: 'unsupported' };
      const [last] = await api.sessions.getRecentlyClosed({ maxResults: 1 });
      if (!last) return { ok: false, reason: 'none' };
      const sessionId = (last.window && last.window.sessionId) || (last.tab && last.tab.sessionId);
      await api.sessions.restore(sessionId);
      return { ok: true, kind: last.window ? 'window' : 'tab' };
    }
    case 'restoreSession': {
      if (!api.sessions || !api.sessions.restore || typeof message.sessionId !== 'string' || !message.sessionId) return { ok: false, reason: 'unsupported' };
      await api.sessions.restore(message.sessionId);
      return { ok: true };
    }
    case 'activate': {
      if (!Number.isInteger(message.tabId)) return { ok: false };
      const tab = await api.tabs.get(message.tabId);
      await api.tabs.update(message.tabId, { active: true });
      if (tab.windowId !== windowId) await api.windows.update(tab.windowId, { focused: true });
      return { ok: true };
    }
    case 'close': {
      const since = Date.now() - 1500;
      if (ids.length) await api.tabs.remove(ids);
      return { ok: true, since, count: ids.length };
    }
    case 'undo':
      return undoClose(message.count || message.n, message.since || 0);
    case 'newTab': {
      const targetWindowId = Number.isInteger(message.windowId) ? message.windowId : windowId;
      await api.tabs.create({ ...(Number.isInteger(targetWindowId) ? { windowId: targetWindowId } : {}) });
      return { ok: true };
    }
    case 'closeWindow': {
      if (!Number.isInteger(message.windowId)) return { ok: false, reason: 'invalid-window' };
      await api.windows.remove(message.windowId);
      return { ok: true };
    }
    case 'openTaskManager': {
      const targetWindowId = Number.isInteger(message.windowId) ? message.windowId : windowId;
      const ua = String((globalThis.navigator && globalThis.navigator.userAgent) || '');
      const url = /Firefox\//i.test(ua) ? 'about:processes'
        : /Edg\//i.test(ua) ? 'edge://taskmanager/'
        : 'chrome://taskmanager/';
      await api.tabs.create({ url, ...(Number.isInteger(targetWindowId) ? { windowId: targetWindowId } : {}) });
      return { ok: true };
    }
    case 'go':
      return go(message.text, !!message.inNew, sender);
    case 'openUrl': {
      const url = String(message.url || '');
      if (!/^(https?|ftp|file|about|chrome|edge|brave|vivaldi|opera):/i.test(url)) return { ok: false, reason: 'unsupported-url' };
      const where = message.where || 'current';
      if (where === 'current' && senderTab) await api.tabs.update(senderTab.id, { url });
      else await api.tabs.create({ url, windowId, active: where !== 'bg' });
      return { ok: true };
    }
    case 'openOptions':
      await api.runtime.openOptionsPage();
      return { ok: true };
    case 'renameWindow': {
      if (!Number.isInteger(message.windowId)) return { ok: false };
      const { windowNames = {} } = await api.storage.local.get('windowNames');
      const name = String(message.name || '').trim().slice(0, 80);
      if (name) windowNames[message.windowId] = name;
      else delete windowNames[message.windowId];
      await api.storage.local.set({ windowNames });
      schedule();
      return { ok: true };
    }
    case 'tabop': {
      if (!ids.length) return { ok: false };
      switch (message.op) {
        case 'mute':
          await Promise.all(ids.map((id) => api.tabs.update(id, { muted: !!message.value })));
          break;
        case 'pin':
          await Promise.all(ids.map((id) => api.tabs.update(id, { pinned: !!message.value })));
          break;
        case 'duplicate':
          for (const id of ids) await api.tabs.duplicate(id);
          break;
        case 'reload':
          await Promise.all(ids.map((id) => api.tabs.reload(id)));
          break;
        case 'bookmark':
          return bookmarkTabs(ids);
        case 'ungroup':
          if (api.tabs.ungroup) await api.tabs.ungroup(ids);
          break;
        default:
          return { ok: false, reason: 'unknown-operation' };
      }
      return { ok: true };
    }
    case 'group':
      return groupTabs(ids, Number.isInteger(message.groupId) ? message.groupId : -1);
    case 'groupSet': {
      if (!api.tabGroups || !Number.isInteger(message.groupId)) return { ok: false };
      const update = {};
      if (typeof message.color === 'string') update.color = message.color;
      if (typeof message.title === 'string') update.title = message.title.slice(0, 80);
      await api.tabGroups.update(message.groupId, update);
      return { ok: true };
    }
    case 'move':
      return moveTabs(ids, message.target);
    case 'bmTree':
      return bookmarksTree();
    case 'bookmarkAction':
      return bookmarkAction(message, sender);
    default:
      return null;
  }
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  Promise.resolve().then(() => handle(message, sender))
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, reason: 'operation-failed' }));
  return true;
});

// Live tab lists stay attached only while the overlay is visible.
const ports = new Set();
api.runtime.onConnect.addListener((port) => {
  if (port.name !== 'tabs' || !port.sender || !port.sender.tab) return;
  const entry = { port, windowId: port.sender.tab.windowId };
  ports.add(entry);
  port.onDisconnect.addListener(() => ports.delete(entry));
  collect().then((base) => port.postMessage({ type: 'tabs', cur: entry.windowId, ...base })).catch(() => {});
});

let timer = 0;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!ports.size) return;
    let base;
    try { base = await collect(); } catch (_) { return; }
    for (const entry of ports) {
      try { entry.port.postMessage({ type: 'tabs', cur: entry.windowId, ...base }); } catch (_) {}
    }
  }, 60);
}

let bookmarkTimer = 0;
function scheduleBookmarks() {
  clearTimeout(bookmarkTimer);
  bookmarkTimer = setTimeout(() => {
    for (const entry of ports) {
      try { entry.port.postMessage({ type: 'bm' }); } catch (_) {}
    }
  }, 150);
}

const watchedEvents = [
  [api.tabs, ['onCreated', 'onRemoved', 'onUpdated', 'onMoved', 'onActivated', 'onAttached', 'onDetached', 'onReplaced'], schedule],
  [api.windows, ['onCreated', 'onRemoved', 'onFocusChanged'], schedule],
  [api.tabGroups, ['onCreated', 'onUpdated', 'onRemoved', 'onMoved'], schedule],
  [api.bookmarks, ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded'], scheduleBookmarks]
];
for (const [namespace, events, callback] of watchedEvents) {
  if (!namespace) continue;
  for (const eventName of events) {
    const event = namespace[eventName];
    if (event && event.addListener) event.addListener(callback);
  }
}

// A tab's favicon URL can arrive later than its initial navigation event (and
// may update again after back/forward navigation). Re-query tabs a few times
// so visible overlays receive the final favIconUrl without requiring a reload.
if (api.tabs && api.tabs.onUpdated) {
  api.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (!changeInfo || !(changeInfo.url || changeInfo.favIconUrl || changeInfo.status === 'complete')) return;
    for (const delay of [220, 720, 1500]) setTimeout(schedule, delay);
  });
}
if (api.tabs && api.tabs.onActivated) {
  api.tabs.onActivated.addListener(() => {
    for (const delay of [180, 620]) setTimeout(schedule, delay);
  });
}
