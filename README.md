# Tab Peek

A customizable slide-in tab manager for browsing, including multi-tab actions, group/window organization, real bookmarks, and a movable floating mode.

## Install

### Chrome, Edge, Brave, Opera, or Vivaldi
1. Extract the ZIP.
2. Open the browser's extensions page (`chrome://extensions`, `edge://extensions`, or the equivalent) and enable **Developer mode**.
3. Select **Load unpacked** and choose the extracted folder containing `manifest.json` directly.
4. After installing an update, use the extension's reload button and refresh open pages.

### Firefox (121+)
Open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `manifest.json` directly from the extracted folder. Temporary add-ons need to be loaded again after Firefox restarts.

## Use

- In fullscreen (F11) by default, move the pointer to the configured edge hot zone. Adjust its position, length, and dwell time in settings.
- Click the pin button or press **Alt+Shift+T** to keep the panel open. Pinning a docked panel automatically pushes the page aside to reserve room for it. A floating Windowed panel stays above the page instead.
- Use the search field (placeholder **Search**) to filter open tabs by title or URL as you type. Press Enter to activate a matching selected tab; when no open tab matches, Enter opens the address or searches text with the browser's default search provider. On narrow overlays it becomes a magnifying-glass button; click it to open a small input beside the button. Settings control whether navigation opens in the current tab or a new tab.
- Windows and tab groups are collapsible. Use **Ctrl/Cmd+click** for multi-selection and **Shift+click** for a range. A right-click opens tab, group, or window actions.
- Drag a tab or selection onto another tab to place it before/after, onto a group to move it into that group, or onto a window to move it there. Selected tabs are moved in the order shown in the panel.
- Close tabs with the tab's ×, middle-click, or **Close N**. An **Undo** toast appears for the configured time when the browser has recently-closed session data available.
- Drag the four-dot handle to move the panel. Drag it close to a screen edge to dock it; drop it away from an edge for **Windowed** mode. In docked mode, click the handle to edit the hot zone directly on the page; the page dims and is shielded from clicks while editing, and clicking empty page space exits the editor. Drag the bar to reposition it, its ends to change its length, or its inner edge to change its thickness. Resize the panel at any time by dragging its active edge (or any edge/corner in Windowed mode). In Windowed mode, **Alt+Shift+T** toggles the pinned panel.
- Drag the bookmark header itself (or the plain divider beneath the expand button in icon-only mode) to reposition bookmarks; no extra grip button is added to the horizontal bar. In Windowed mode, left/right placement attaches to the floating panel, while top/bottom placement creates a full-viewport-width bar at the browser edge without moving or resizing the overlay. On a vertical docked sidebar, top/bottom placement creates a full-width bar and shortens the sidebar to reserve space. During a drag, the real overlay stays visible and unchanged; the drag shows a bookmark icon under the pointer and translucent destination previews.
- Use the bookmark button to show or hide real browser bookmarks. Vertical panels support a card or narrow icon strip; horizontal panels show a bookmark bar with an overflow menu for folders and items.
- Pinning a docked panel automatically reduces the page area on the side occupied by the panel. There is no separate Push button or per-site Push toggle. **Windowed** mode does not push the page.
- The gear button opens settings in an overlay. The extension's toolbar button opens the compact settings popup.
- Drag toolbar icons onto another icon to swap their order. One icon stays in the edge slot by default (Settings): bottom-center for vertical overlays, right-center for horizontal overlays. Drag an icon into the invisible bottom/right edge strip to move that icon into the edge slot; the previous edge icon returns to the header. No placeholder is shown.

## Permissions

Tab Peek uses tabs and windows to list/manage tabs, tab groups for group actions, storage for settings and collapsed state, search for the browser's default search provider, bookmarks to display/create bookmarks, sessions for Undo, and favicon access to show site icons.

## Known limits

- Browser-internal pages (for example `chrome://` pages), the new-tab page, extension stores, and PDF viewers do not allow the content overlay.
- Fullscreen initiated by a video's own HTML player is not supported; use browser fullscreen (F11).
- Push mode adjusts page margins and fixed/sticky elements, but some complex layouts and `100vh` designs may not shrink perfectly.
- Only normal browser windows are shown, not popup or app windows.
- Tab and bookmark icons use the browser-provided favicon URL, Chrome's favicon service where available, and common site favicon paths as fallbacks. Icon requests retry briefly after navigation because some browsers populate the favicon URL after the first tab update. A letter badge remains the fallback for browser-internal pages and sites that expose no usable icon.
- Undo depends on the browser's recently-closed session history; tabs permanently removed from that history cannot be restored through the extension.

### Toolbar edge placement and current-window icon

The Settings icon occupies the bottom-center slot on vertical docked overlays and the right-edge slot on horizontal docked overlays by default. Drag a toolbar icon onto another toolbar icon to reorder/swap it, or drop it in the invisible bottom/right edge strip to move it into the edge slot. The displaced edge icon returns to the toolbar. No placeholder is shown for the edge slot.

The active-window indicator brightens only that window's application icon. The window header, tab backgrounds, and tab list are not tinted or highlighted for the current window.



Bookmark drawer appearance: the named-bookmarks card is now flush with the overlay-side toggle, without the previous 8px floating gap. Its connected edge is square and only the outer corners are rounded. The open drawer and toggle read as a single attached panel. Page-push spacing was adjusted to match the reduced gap.


Bookmark attachment refinement: bookmark content no longer floats away from the overlay in show-names/card mode. Removed the 8px margin, squared the connected edge, rounded only the outer card corners, and removed the floating drop shadow/internal seam while open. The toggle and bookmark content visually form one continuous drawer. Page-push thickness now reflects the actual panel width.
