globalThis.TPX = globalThis.TPX || {};
globalThis.TPX.CSS = `
:host{all:initial}
*{box-sizing:border-box}
.ui{
  display:contents;
  --bg:#fbfbfa;--fg:#1c1f23;--muted:#69707a;--line:rgba(20,24,30,.14);--hover:rgba(20,24,30,.06);--sel:rgba(20,24,30,.11);
  font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;color:var(--fg);
}
.ui[data-theme=dark]{--bg:#1d2025;--fg:#e8eaed;--muted:#9aa1ab;--line:rgba(255,255,255,.14);--hover:rgba(255,255,255,.08);--sel:rgba(255,255,255,.14)}
@media (prefers-color-scheme:dark){.ui[data-theme=auto]{--bg:#1d2025;--fg:#e8eaed;--muted:#9aa1ab;--line:rgba(255,255,255,.14);--hover:rgba(255,255,255,.08);--sel:rgba(255,255,255,.14)}}

/* Minimal scrollbars: no track; a wider thumb appears over the scroller and remains easy to grab. */
*{scrollbar-width:auto;scrollbar-color:transparent transparent}
*:hover{scrollbar-color:color-mix(in srgb,var(--muted) 88%,transparent) transparent}
*::-webkit-scrollbar{width:12px;height:12px;background:transparent}
*::-webkit-scrollbar-track{background:transparent;border:0}
*::-webkit-scrollbar-corner{background:transparent}
*::-webkit-scrollbar-thumb{background:transparent;border:1px solid transparent;border-radius:999px;background-clip:padding-box}
*:hover::-webkit-scrollbar-thumb{background-color:color-mix(in srgb,var(--muted) 88%,transparent)}
*:hover::-webkit-scrollbar-thumb:hover{background-color:var(--muted)}
/* Keep every overlay scrollbar visible whenever the pointer is anywhere over Tab Peek. */
:host(:hover) *{scrollbar-width:auto;scrollbar-color:color-mix(in srgb,var(--muted) 88%,transparent) transparent}
:host(:hover) *::-webkit-scrollbar-thumb{background-color:color-mix(in srgb,var(--muted) 88%,transparent)}
:host(:hover) *::-webkit-scrollbar-thumb:hover{background-color:var(--muted)}
.list,.bmlist,.bmstrip,.menu.scroll,.submenu.scroll{overscroll-behavior:contain}
.list:hover,.list:focus-within,.bmlist:hover,.bmlist:focus-within,.bmstrip:hover,.bmstrip:focus-within,.menu.scroll:hover,.menu.scroll:focus-within,.submenu.scroll:hover,.submenu.scroll:focus-within{scrollbar-color:color-mix(in srgb,var(--muted) 88%,transparent) transparent}
.list:hover::-webkit-scrollbar-thumb,.list:focus-within::-webkit-scrollbar-thumb,.bmlist:hover::-webkit-scrollbar-thumb,.bmlist:focus-within::-webkit-scrollbar-thumb,.bmstrip:hover::-webkit-scrollbar-thumb,.bmstrip:focus-within::-webkit-scrollbar-thumb,.menu.scroll:hover::-webkit-scrollbar-thumb,.menu.scroll:focus-within::-webkit-scrollbar-thumb,.submenu.scroll:hover::-webkit-scrollbar-thumb,.submenu.scroll:focus-within::-webkit-scrollbar-thumb{background-color:color-mix(in srgb,var(--muted) 88%,transparent)}
.list:hover::-webkit-scrollbar-thumb:hover,.bmlist:hover::-webkit-scrollbar-thumb:hover,.bmstrip:hover::-webkit-scrollbar-thumb:hover,.menu.scroll:hover::-webkit-scrollbar-thumb:hover,.submenu.scroll:hover::-webkit-scrollbar-thumb:hover{background-color:var(--muted)}


/* ---------- panel ---------- */
.panel{
  zoom:var(--u,1);
  position:fixed;z-index:3;display:flex;overflow:hidden;pointer-events:auto;
  color:var(--fg);background:var(--bg);
  box-shadow:0 0 0 1px var(--line),0 10px 32px rgba(0,0,0,.28);
  transition:transform .18s ease,opacity .18s ease,visibility 0s;
}
.panel.hidden{opacity:0;visibility:hidden;pointer-events:none;transition:transform .18s ease,opacity .18s ease,visibility 0s linear .18s}
.panel.no-anim,.panel.no-anim.hidden{transition:none}
.panel.hidden[data-edge=left]{transform:translateX(calc(-100% - 24px))}
.panel.hidden[data-edge=right]{transform:translateX(calc(100% + 24px))}
.panel.hidden[data-edge=top]{transform:translateY(calc(-100% - 24px))}
.panel.hidden[data-edge=bottom]{transform:translateY(calc(100% + 24px))}
.panel.hidden[data-style=windowed]{transform:none}
.panel[data-dir=v]{flex-direction:column}
.panel[data-dir=h]{flex-direction:row;align-items:stretch}

.panel[data-style=docked][data-edge=left]{top:0;bottom:var(--sbh,0px);left:0;width:var(--w)}
.panel[data-style=docked][data-edge=right]{top:0;bottom:var(--sbh,0px);right:var(--sbv,0px);width:var(--w)}
.panel[data-style=docked][data-edge=top]{left:0;right:var(--sbv,0px);top:0;height:var(--h)}
.panel[data-style=docked][data-edge=bottom]{left:0;right:var(--sbv,0px);bottom:var(--sbh,0px);height:var(--h)}
.panel[data-style=windowed]{left:var(--bx);top:var(--by);width:var(--bw);height:var(--bh);border-radius:14px}
.panel[data-style=windowed].with-floating-bookmarks:not(.bookmarks-left):not(.bookmarks-top):not(.bookmarks-bottom){border-top-right-radius:0;border-bottom-right-radius:0}
.panel[data-style=windowed].with-floating-bookmarks.bookmarks-left{border-top-left-radius:0;border-bottom-left-radius:0}
.panel[data-style=windowed].with-floating-bookmarks.bookmarks-top{border-top-left-radius:0;border-top-right-radius:0}
.panel[data-style=windowed].with-floating-bookmarks.bookmarks-bottom{border-bottom-left-radius:0;border-bottom-right-radius:0}
.panel.moving{transition:none}
.panel.dragging-overlay{opacity:0!important;visibility:hidden!important;pointer-events:none!important}

/* ---------- resize grips ---------- */
.rz{display:none;position:absolute;z-index:6;touch-action:none;background:transparent!important}
.panel[data-style=docked][data-edge=left] .rz[data-h=e],
.panel[data-style=docked][data-edge=right] .rz[data-h=w],
.panel[data-style=docked][data-edge=top] .rz[data-h=s],
.panel[data-style=docked][data-edge=bottom] .rz[data-h=n],
.panel[data-style=windowed] .rz{display:block}
/* The hit target is wider, but the only visible feedback is a slim strip at the exact edge. */
.rz[data-h=e]{top:10px;bottom:10px;right:0;width:2px;cursor:ew-resize}
.rz[data-h=w]{top:10px;bottom:10px;left:0;width:2px;cursor:ew-resize}
.rz[data-h=n]{left:10px;right:10px;top:0;height:2px;cursor:ns-resize}
.rz[data-h=s]{left:10px;right:10px;bottom:0;height:2px;cursor:ns-resize}
.rz[data-h=ne]{top:0;right:0;width:18px;height:18px;cursor:nesw-resize}
.rz[data-h=sw]{bottom:0;left:0;width:18px;height:18px;cursor:nesw-resize}
.rz[data-h=nw]{top:0;left:0;width:18px;height:18px;cursor:nwse-resize}
.rz[data-h=se]{bottom:0;right:0;width:18px;height:18px;cursor:nwse-resize}
.panel[data-style=docked] .rz[data-h=e],.panel[data-style=docked] .rz[data-h=w]{top:0;bottom:0}
.panel[data-style=docked] .rz[data-h=n],.panel[data-style=docked] .rz[data-h=s]{left:0;right:0}
.rz::after{content:"";position:absolute;display:block;pointer-events:none;opacity:0;background:color-mix(in srgb,var(--accent) 45%,transparent)}
.rz:hover::after,.panel.resizing .rz::after{opacity:1}
.rz[data-h=e]::after{top:0;bottom:0;right:0;width:4px}
.rz[data-h=w]::after{top:0;bottom:0;left:0;width:4px}
.rz[data-h=n]::after{left:0;right:0;top:0;height:4px}
.rz[data-h=s]::after{left:0;right:0;bottom:0;height:4px}
.rz[data-h=ne]::after{top:0;right:0;width:8px;height:8px}
.rz[data-h=sw]::after{bottom:0;left:0;width:8px;height:8px}
.rz[data-h=nw]::after{top:0;left:0;width:8px;height:8px}
.rz[data-h=se]::after{bottom:0;right:0;width:8px;height:8px}
.resize-buffer{position:fixed;z-index:4;display:none;pointer-events:auto;background:transparent!important;touch-action:none;user-select:none}
.resize-buffer[data-axis=x]{cursor:ew-resize}
.resize-buffer[data-axis=y]{cursor:ns-resize}
.sizebadge{display:none;position:absolute;z-index:7;right:14px;bottom:14px;padding:3px 8px;border-radius:99px;background:var(--accent);color:#fff;font-size:11px;pointer-events:none;white-space:nowrap}
.panel[data-style=windowed].resizing .sizebadge{display:block}
.panel[data-dir=h] .sizebadge{right:auto;left:50%;bottom:auto;top:50%;transform:translate(-50%,-50%)}

/* ---------- top part: search + buttons ---------- */
.top{display:flex;flex-direction:column;flex:none}
.panel[data-dir=h] .top{flex-direction:row;align-items:center;border-right:1px solid var(--line)}
.head{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px}
.panel[data-dir=v] .head{border-bottom:1px solid var(--line)}
.panel[data-dir=h] .head{flex-wrap:nowrap}
.head.default-toolbar-placement{padding-right:0}
/* Settings is attached to the overlay itself, not the header/settings dialog. */
.edge-tools{position:absolute;z-index:8;display:flex;align-items:center;justify-content:center;pointer-events:auto}
.edge-tools:empty{display:none}
.panel.default-toolbar-placement[data-dir=v] .edge-tools{left:50%;right:auto;bottom:8px;top:auto;transform:translateX(-50%)}
.panel.default-toolbar-placement[data-dir=h] .edge-tools{right:8px;left:auto;top:50%;bottom:auto;transform:translateY(-50%)}
.panel.default-toolbar-placement[data-dir=v] .list{padding-bottom:44px}
.panel.default-toolbar-placement[data-dir=h] .list{padding-right:44px}
.panel[data-dir=v].compact .edge-tools .toolbar-item,.panel[data-dir=h].compact .edge-tools .toolbar-item{width:22px;height:22px}
.searchrow{display:flex;flex:1 1 140px;min-width:0;align-items:center;gap:6px}
.searchrow.nosearch{flex:0 0 28px}
.searchwrap{flex:1 1 110px;min-width:0;height:28px;position:relative}
.panel[data-dir=h] .searchrow{flex:1 1 0}
.panel[data-dir=h] .searchrow.nosearch{flex:0 0 28px}
.panel[data-dir=h] .searchwrap{flex:1 1 170px;width:170px}
.field{display:block;width:100%;height:100%;border:0;background:transparent;border-radius:8px}
.search{width:100%;height:100%;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--hover);color:inherit;font:inherit;outline:none}
.search{padding-right:30px}
.search-clear{position:absolute;z-index:2;right:4px;top:4px;width:20px;height:20px;min-width:20px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;line-height:0;color:var(--muted);background:transparent;transition:background .12s ease,color .12s ease}
.search-clear svg{width:11px;height:11px;fill:currentColor}
.search-clear:hover{background:var(--hover);color:var(--fg)}
.search-clear:focus-visible{outline:1px solid var(--accent);outline-offset:1px}
.search-clear[hidden]{display:none!important}
.search::placeholder{color:var(--muted)}
.search:focus{border-color:var(--accent)}
.btn{flex:none;width:28px;height:28px;display:grid;place-items:center;padding:0;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer}
.btn:hover{background:transparent!important;color:var(--fg);filter:brightness(1.22)}
.btn:focus-visible{outline:1px solid color-mix(in srgb,var(--fg) 45%,transparent);outline-offset:1px}
.btn.toolbar-dragging{opacity:.45}
.btn.toolbar-drop-target{color:var(--fg);filter:brightness(1.45)}
.btn svg{width:17px;height:17px;fill:currentColor}
.grip{cursor:grab;touch-action:none}
.grip svg{width:18px;height:18px}
.grip[aria-pressed=true]{color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent)}
.pin svg{transition:transform .15s}
.pin[aria-pressed=false] svg{transform:rotate(45deg)}
.pin[aria-pressed=true]{color:var(--accent);background:transparent}

.tools{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;min-height:24px}
.panel[data-dir=h] .tools{flex-wrap:nowrap;white-space:nowrap}
.tbtn{height:24px;padding:0 9px;border:1px solid var(--line);border-radius:7px;background:transparent;color:var(--fg);font:12px/1 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;cursor:pointer}
.tbtn:hover{background:var(--hover)}
.closesel{border-color:#d9534f;color:#d9534f}
.closesel:hover{background:rgba(217,83,79,.14)}
.compact .head{flex-direction:row;align-items:center;padding:6px 4px;gap:4px}
.compact .tools{flex-direction:column;align-items:flex-start;padding:6px 4px}
.panel[data-side=end].compact .head{align-items:stretch;justify-content:flex-end}
.panel[data-side=end].compact .searchrow{flex-direction:row-reverse}
.panel[data-side=end].compact .tools{align-items:flex-end}
.compact .searchrow{gap:4px}
/* Search adapts to the available overlay thickness instead of squeezing its text. */
.searchtoggle{display:none;flex:none;background:transparent;color:var(--muted)}
.searchtoggle svg{width:16px;height:16px}
.searchrow[data-mode=inline]{flex-direction:row}
.searchrow[data-mode=inline] .searchwrap{display:block!important}
.searchrow[data-mode=icon]{flex:0 0 62px;width:62px;min-width:62px;gap:6px}
.searchrow[data-mode=icon] .searchtoggle{display:grid}
.searchrow[data-mode=icon] .searchwrap{display:none!important}
.searchrow[data-mode=popover]{position:relative;flex:0 0 28px;width:28px;min-width:28px;flex-direction:column;align-items:center;gap:2px}
.searchrow[data-mode=popover] .searchtoggle{display:grid}
.searchrow[data-mode=popover] .searchwrap{display:none!important}
.searchrow[data-mode=off] .searchtoggle,.searchrow[data-mode=off] .searchwrap{display:none!important}
.panel[data-side=end].compact .searchrow[data-mode=popover]{flex-direction:column}
.searchwrap.search-popup{position:fixed!important;z-index:2147483000;display:block!important;pointer-events:auto!important;flex:none;width:210px;height:32px;min-width:0;padding:2px;background:var(--bg);border:1px solid var(--line);border-radius:9px;box-shadow:0 6px 24px rgba(0,0,0,.28);overflow:visible}
.searchwrap.search-popup .search{background:var(--bg);border:0;padding:0 8px}
.searchwrap.search-popup .search{padding-right:30px}
.compact .searchrow[data-mode=inline] .searchwrap{display:block!important}
.compact .tbtn{padding:0 4px;font-size:11px}

/* ---------- list ---------- */
.list{flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column;gap:2px;padding:6px;overflow:auto;scrollbar-width:auto}
.panel[data-dir=h] .list{flex-direction:row;align-items:stretch;overflow-y:hidden;padding:0}
.panel[data-style=windowed][data-dir=v] .list{flex-direction:column;overflow:auto}
.win{display:flex;flex-direction:column;gap:2px;border-radius:8px}
.win+.win{margin-top:6px}
.windivider{flex:none;align-self:center;width:min(58%,120px);height:1px;margin:7px 0;background:color-mix(in srgb,var(--line) 72%,var(--muted));pointer-events:none}
.wbody,.gbody{display:flex;flex-direction:column;gap:2px}
.panel[data-dir=h] .win,.panel[data-dir=h] .wbody,.panel[data-dir=h] .gbody{display:contents}
.panel[data-dir=h] .win+.win{margin:0}
.panel[data-dir=h] .windivider{align-self:center;width:1px;height:24px;margin:0 6px;background:color-mix(in srgb,var(--line) 72%,var(--muted))}
.gbody{margin-left:10px;padding-left:4px;border-left:3px solid var(--muted)}

.whead,.ghead{flex:none;display:flex;align-items:center;gap:7px;padding:4px 8px;border-radius:7px;cursor:pointer;user-select:none;color:var(--muted);font-size:12px;font-weight:600}
.whead:hover,.ghead:hover{background:transparent;color:var(--fg)}
/* Current-window feedback: brighten only its glyph; dim other windows' content. */
.whead.cur .window-icon{color:var(--fg);opacity:1;filter:brightness(1.22) contrast(1.2) drop-shadow(0 0 1.25px currentColor)}
.whead:hover .window-icon,.ghead:hover .chev{filter:brightness(1.28)}
.whead.cur:hover .window-icon{filter:brightness(1.28) contrast(1.2) drop-shadow(0 0 1.5px currentColor)}
/* Non-current windows remain usable, but read clearly as background windows. */
.win.inactive-window .window-icon{opacity:.42;filter:grayscale(1) brightness(.82)}
.win.inactive-window .tab{opacity:.76;transition:opacity .12s ease,background .12s ease}
.win.inactive-window .tab:hover{opacity:.92}
.win.inactive-window .ghead{opacity:.78}
.win.inactive-window .ghead:hover{opacity:.96}
.chev{flex:none;width:16px;height:16px;fill:currentColor;transition:transform .12s;transform:rotate(90deg)}
.closed .chev{transform:none}
.window-icon{flex:none;display:block;width:16px;height:16px;overflow:visible;color:var(--fg);opacity:.76;filter:none}
.wnum{display:none;font-variant-numeric:tabular-nums}
.wlabel{flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.wbadge{flex:none;padding:1px 6px;border-radius:99px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);font-size:11px;font-weight:500}
.wcount,.gcount{margin-left:auto;font-weight:500;font-variant-numeric:tabular-nums}
.gdot{flex:none;width:10px;height:10px;border-radius:50%}
.gtitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.panel[data-dir=h] .whead,.panel[data-dir=h] .ghead{height:32px;align-self:center;border:1px solid var(--line)}
.panel[data-dir=h] .wcount,.panel[data-dir=h] .gcount{margin-left:4px}

.tab{position:relative;flex:none;min-height:32px;display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;cursor:pointer;user-select:none}
.panel[data-dir=h] .tab{width:190px;min-height:0;align-self:stretch}
.panel[data-dir=h][data-edge=top] .tab{border-radius:0 0 8px 8px}
.panel[data-dir=h][data-edge=bottom] .tab{border-radius:8px 8px 0 0}
.tab:hover{background:var(--hover)}
.tab.active{background:color-mix(in srgb,var(--accent) 16%,transparent);box-shadow:inset 3px 0 0 var(--accent)}
.panel[data-dir=h] .tab.active{box-shadow:inset 0 -3px 0 var(--accent)}
.panel[data-dir=h][data-edge=bottom] .tab.active{box-shadow:inset 0 3px 0 var(--accent)}
.tab.selected{background:color-mix(in srgb,var(--accent) 30%,transparent);outline:1px solid var(--accent);outline-offset:-1px}
.tab.ctx{background:var(--sel)}
.tab.dim .title{opacity:.55}
.tab.dragging{opacity:.4}
.fav{flex:none;width:16px;height:16px;display:grid;place-items:center}
.fav img{width:16px;height:16px;max-width:100%;max-height:100%;object-fit:contain;border-radius:2px;display:block;background:transparent;image-rendering:auto}
.fav svg{width:16px;height:16px;fill:currentColor;color:var(--muted)}
.fav.letter{border-radius:50%;background:var(--sel);font-size:10px;font-weight:600;color:var(--muted)}
.title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badge{flex:none;font-size:11px}
.x{flex:none;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--muted);font:16px/1 system-ui,sans-serif;cursor:pointer;opacity:0}
.tab:hover .x{opacity:1}
.x:hover{background:var(--line);color:var(--fg)}
.empty{padding:12px;color:var(--muted);white-space:nowrap}

/* icons-only mode: icons stay on the side of the overlay instead of floating in the middle */
.icons .title,.icons .badge,.icons .x,.icons .wlabel,.icons .wbadge,.icons .wcount,.icons .gtitle,.icons .gcount{display:none}
.icons .wnum{display:none}
.icons .tab{justify-content:flex-start;padding:6px}
.panel[data-side=end].icons .tab{justify-content:flex-end}
.panel[data-dir=h].icons .tab{width:auto;justify-content:center}
.icons .whead,.icons .ghead{justify-content:flex-start;gap:4px;padding:4px}
.panel[data-side=end].icons .whead,.panel[data-side=end].icons .ghead{justify-content:flex-end}
.panel[data-dir=h].icons .whead,.panel[data-dir=h].icons .ghead{justify-content:center}
.icons .gbody{margin-left:2px;padding-left:2px}

/* ---------- drag and drop ---------- */
.tab.drop-before::before,.tab.drop-after::after{content:"";position:absolute;left:2px;right:2px;height:3px;border-radius:2px;background:var(--accent);pointer-events:none;z-index:2}
.tab.drop-before::before{top:-2px}
.tab.drop-after::after{bottom:-2px}
.panel[data-dir=h] .tab.drop-before::before,.panel[data-dir=h] .tab.drop-after::after{top:2px;bottom:2px;width:3px;height:auto}
.panel[data-dir=h] .tab.drop-before::before{left:-2px;right:auto}
.panel[data-dir=h] .tab.drop-after::after{right:-2px;left:auto}
.win.drop-win{outline:2px solid var(--accent);outline-offset:1px;background:color-mix(in srgb,var(--accent) 9%,transparent)}
.panel[data-dir=h] .win.drop-win .whead,.panel[data-dir=h] .win.drop-win .tab,.panel[data-dir=h] .gbody.drop-into .tab,.panel[data-dir=h] .ghead.drop-into{outline:2px solid var(--accent);outline-offset:-2px}
.ghead.drop-into{outline:2px solid var(--accent);outline-offset:-2px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--fg)}
.ghead.drop-reorder{outline:2px dashed var(--accent);outline-offset:-2px;background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--fg)}
.gbody.drop-into{outline:2px solid var(--accent);outline-offset:1px;border-radius:6px}
.gbody.drop-reorder{outline:2px dashed var(--accent);outline-offset:1px;border-radius:6px}
.whead[data-drop]::after,.ghead[data-drop]::after{content:attr(data-drop);flex:none;margin-left:6px;padding:1px 7px;border-radius:99px;background:var(--accent);color:#fff;font-size:11px;font-weight:500;white-space:nowrap}
.whead[data-drop] .wcount,.ghead[data-drop] .gcount{margin-left:auto}
.icons [data-drop]::after{display:none}
.dragimg{position:fixed;left:-600px;top:-600px;zoom:var(--u,1);display:flex;align-items:center;gap:8px;max-width:230px;padding:6px 10px;border-radius:8px;background:var(--bg);color:var(--fg);box-shadow:0 0 0 1px var(--line);white-space:nowrap}
.dragimg.multi{box-shadow:0 0 0 1px var(--line),5px 5px 0 -1px var(--bg),5px 5px 0 0 var(--line),10px 10px 0 -1px var(--bg),10px 10px 0 0 var(--line)}
.dragimg .dtitle{overflow:hidden;text-overflow:ellipsis;min-width:0}
.dragimg .dcount{flex:none;padding:0 7px;border-radius:99px;background:var(--accent);color:#fff;font-size:11px}

/* ---------- docking preview ---------- */
.snap{position:fixed;z-index:2;display:none;pointer-events:none;background:color-mix(in srgb,var(--accent) 22%,transparent);outline:2px solid var(--accent);outline-offset:-2px}

/* ---------- context menu ---------- */
.menu,.submenu{min-width:190px;padding:5px;border-radius:10px;background:var(--bg);color:var(--fg);box-shadow:0 0 0 1px var(--line),0 12px 32px rgba(0,0,0,.32);user-select:none;pointer-events:auto;touch-action:manipulation}
.menu{position:fixed;zoom:var(--u,1);z-index:2147483000}
.submenu{display:none;position:absolute;top:-6px;left:calc(100% - 4px);z-index:2147483001}
.submenu.flip{left:auto;right:calc(100% - 4px)}
.menu.scroll,.submenu.scroll{max-height:70vh;overflow-y:auto;scrollbar-width:thin}
.mi{position:relative;display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}
.mi:hover{background:var(--hover)}
.mi.dis{opacity:.45;pointer-events:none}
.mi.danger{color:#d9534f}
.mi.has-sub:hover>.submenu{display:block}
.mlead{flex:none;width:16px;height:16px;display:grid;place-items:center}
.mdot{width:11px;height:11px;border-radius:50%}
.mlabel{min-width:0;max-width:280px;overflow:hidden;text-overflow:ellipsis}
.mchk{margin-left:auto;padding-left:12px;color:var(--accent)}
.marrow{margin-left:auto;padding-left:14px;opacity:.6}
.msep{height:1px;margin:4px 2px;background:var(--line)}

/* ---------- hover name popup ---------- */
.tip{position:fixed;zoom:var(--u,1);z-index:30;display:none;pointer-events:none;max-width:340px;padding:6px 10px;border-radius:8px;background:var(--bg);color:var(--fg);box-shadow:0 0 0 1px var(--line),0 8px 24px rgba(0,0,0,.3)}
.tip .t1{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tip .t2{margin-top:1px;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---------- undo message ---------- */
.toast{position:fixed;zoom:var(--u,1);z-index:15;display:none;align-items:center;gap:12px;padding:8px 8px 8px 14px;border-radius:10px;background:var(--fg);color:var(--bg);box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:nowrap}
.toast.on{display:flex}
.toast button{height:26px;padding:0 12px;border:0;border-radius:7px;background:var(--accent);color:#fff;font:600 12px/1 system-ui,sans-serif;cursor:pointer}

/* ---------- settings card + rename prompt ---------- */
.backdrop{position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.32);pointer-events:auto;touch-action:none;overscroll-behavior:contain}
.card,.prompt{position:fixed;zoom:var(--u,1);z-index:41;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:14px;background:var(--bg);color:var(--fg);box-shadow:0 0 0 1px var(--line),0 24px 64px rgba(0,0,0,.45);overflow:hidden;pointer-events:auto}
.card{display:flex;flex-direction:column;width:min(460px,calc(100vw / var(--u,1) - 24px));height:min(680px,calc(100vh / var(--u,1) - 24px))}
.cardhead{flex:none;display:flex;align-items:center;justify-content:space-between;padding:8px 8px 8px 16px;border-bottom:1px solid var(--line);font-weight:600}
.cardframe{flex:1;min-height:0;width:100%;border:0;background:var(--bg)}
.prompt{width:300px;padding:14px;display:flex;flex-direction:column;gap:10px}
.bookmark-prompt{width:min(380px,calc(100vw / var(--u,1) - 24px))}
.bookmark-field{display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:12px}
.bookmark-field .search{height:32px;position:static;color:var(--fg);font-size:13px}
.ptitle{font-weight:600}
.pfield{height:30px;position:relative}
.prow{display:flex;justify-content:flex-end;gap:8px}
.prow .ok{background:var(--accent);border-color:var(--accent);color:#fff}

/* ---------- bookmarks ---------- */
.bm{position:fixed;z-index:4;zoom:var(--u,1);display:flex;align-items:center;pointer-events:none}
.bm.hidden{display:none}
.bm.pending-place{visibility:hidden}
.bm.dragging-overlay{visibility:hidden!important}
/* Bookmarks are a drawer attached directly to the overlay, with no arrow tab. */
.bm[data-pos=right],.bm[data-pos=left],.bm[data-pos=floating-left],.bm[data-pos=floating-right]{flex-direction:row}
.bm[data-pos=below],.bm[data-pos=above],.bm[data-pos=floating-top],.bm[data-pos=floating-bottom]{flex-direction:column}
.bm[data-pos^=floating-]{align-items:stretch}
.bm.open .bmc{box-shadow:none;border:1px solid var(--line)}
.bm:not(.open) .bmc{display:none}
.bmc{pointer-events:auto;display:flex;background:var(--bg);color:var(--fg);box-shadow:0 0 0 1px var(--line),0 6px 20px rgba(0,0,0,.22);overflow:hidden}
.bm[data-mode=strip] .bmc{flex-direction:column;width:44px;align-self:stretch}
.bm[data-mode=card] .bmc{flex-direction:column;width:250px;max-height:min(440px,100%);align-self:flex-start;margin:0;border-radius:0;box-shadow:none;border:1px solid var(--line)}
/* Names mode is attached at the overlay corner: square on the joined edge, subtly rounded on the outer edge. */
.bm[data-pos=right][data-mode=card] .bmc{border-radius:0 8px 8px 0}
.bm[data-pos=left][data-mode=card] .bmc{border-radius:8px 0 0 8px}
.bm[data-mode=bar] .bmc{width:100%;height:36px;align-self:stretch;box-shadow:none;border:1px solid var(--line)}
.bm[data-pos=floating-left][data-mode=floating] .bmc,.bm[data-pos=floating-right][data-mode=floating] .bmc{flex-direction:column;width:var(--bm-floating-width,250px);height:100%;max-height:100%;align-self:stretch;flex:0 1 var(--bm-floating-width,250px);margin:0;border:1px solid var(--line);box-shadow:0 6px 20px rgba(0,0,0,.22);border-radius:0}
.bm[data-pos=floating-right][data-mode=floating] .bmc{border-left:0;border-radius:0 14px 14px 0}
.bm[data-pos=floating-left][data-mode=floating] .bmc{border-right:0;border-radius:14px 0 0 14px}
.bm[data-pos=floating-top][data-mode=floating] .bmc,.bm[data-pos=floating-bottom][data-mode=floating] .bmc{flex-direction:column;width:100%;height:100%;max-height:100%;align-self:stretch;flex:1 1 auto;margin:0;border:1px solid var(--line);box-shadow:0 6px 20px rgba(0,0,0,.22);border-radius:0}
.bm[data-pos=floating-top][data-mode=floating] .bmc{border-bottom:0;border-radius:14px 14px 0 0}
.bm[data-pos=floating-bottom][data-mode=floating] .bmc{border-top:0;border-radius:0 0 14px 14px}
.bm[data-pos^=floating-][data-mode=floating] .bmhead{cursor:grab;user-select:none;touch-action:none}
.bm[data-pos^=floating-][data-mode=floating] .bmhead:active{cursor:grabbing}
/* Floating bookmarks switch between a names card and a compact icon strip. */
.bm[data-pos=floating-left][data-view=strip] .bmc,.bm[data-pos=floating-right][data-view=strip] .bmc{flex-direction:column;width:44px;height:100%;max-height:100%;align-self:stretch;flex:0 0 44px;margin:0;border:1px solid var(--line);box-shadow:0 6px 20px rgba(0,0,0,.22);border-radius:0}
.bm[data-pos=floating-right][data-view=strip] .bmc{border-left:0;border-radius:0 14px 14px 0}
.bm[data-pos=floating-left][data-view=strip] .bmc{border-right:0;border-radius:14px 0 0 14px}
.bm[data-pos=floating-top][data-view=strip] .bmc,.bm[data-pos=floating-bottom][data-view=strip] .bmc{flex-direction:row;width:100%;height:44px;max-height:44px;align-self:stretch;flex:0 0 44px;margin:0;border:1px solid var(--line);box-shadow:0 6px 20px rgba(0,0,0,.22);border-radius:0}
.bm[data-pos=floating-top][data-view=strip] .bmc{border-bottom:0;border-radius:14px 14px 0 0}
.bm[data-pos=floating-bottom][data-view=strip] .bmc{border-top:0;border-radius:0 0 14px 14px}
.bm[data-pos^=floating-][data-view=strip] .bmstriphead{flex:none;padding:4px 2px;justify-content:center}
.bm[data-pos^=floating-][data-view=strip] .bmstriphead .bmmode{max-width:100%;margin:2px;padding:2px;font-size:10px;white-space:nowrap}
.bm[data-pos=floating-top][data-view=strip] .bmstrip,.bm[data-pos=floating-bottom][data-view=strip] .bmstrip{flex-direction:row;align-items:center;min-width:0;width:auto;min-height:0;height:auto;overflow-x:auto;overflow-y:hidden;padding:0 4px;scrollbar-width:auto}
.bmempty{padding:10px 12px;color:var(--muted)}
.bmhead{flex:none;display:flex;align-items:center;justify-content:space-between;padding:6px 8px 6px 12px;border-bottom:1px solid var(--line);font-weight:600}
.bmmode{flex:none}
.bm[data-mode=strip] .bmmode{margin:6px 4px;padding:0}
.bmlist{flex:1;min-height:0;overflow:auto;padding:4px;scrollbar-width:auto}
.bmr{display:flex;align-items:center;gap:8px;min-height:28px;padding:3px 8px;border-radius:6px;cursor:pointer}
.bmr:hover{background:var(--hover)}
.bmr.bmempty{cursor:default;color:var(--muted);padding-top:3px;padding-bottom:3px}
.bmt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bmchev{flex:none;width:16px;height:16px;fill:currentColor;color:var(--muted);transform:none}
.bmchev.o{transform:rotate(90deg)}
.bmsp{flex:none;width:16px}
.bmstrip{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 0;overflow-y:auto;scrollbar-width:auto}
.bmicon{flex:none;width:34px;height:32px;display:grid;place-items:center;padding:0;border:0;border-radius:7px;background:transparent;cursor:pointer}
.bmicon:hover{background:var(--hover)}
.bmbar{display:flex;align-items:center;width:100%;height:100%;padding:0 4px;gap:2px}
.bmrow{position:relative;flex:1 1 auto;min-width:0;display:flex;overflow:hidden}
.bmitem{flex:none;display:flex;align-items:center;gap:6px;max-width:170px;height:28px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.bmitem:hover{background:var(--hover)}
.bmmore{font-weight:700}
.bmother{border-left:1px solid var(--line);border-radius:0 6px 6px 0;margin-left:2px}

.edit-shield{position:fixed;inset:0;z-index:2;display:none;pointer-events:auto;background:rgba(0,0,0,.30);touch-action:none;user-select:none;overscroll-behavior:contain}
.edit-shield.on{display:block}
.hint{position:fixed;z-index:1;display:none;pointer-events:none;border-radius:3px;background:var(--accent);opacity:.4;touch-action:none;user-select:none;will-change:left,top,width,height}
.hint.editing{z-index:4;display:block;pointer-events:auto;opacity:.95;outline:1px solid var(--accent);cursor:grab;box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 30%,transparent)}
.hint.editing:active{cursor:grabbing}
.drag-preview{position:fixed;z-index:8;display:none;place-items:center;width:38px;height:38px;transform:translate(-50%,-50%);border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--accent);box-shadow:0 5px 18px rgba(0,0,0,.32);pointer-events:none}
.drag-preview svg{width:23px;height:23px;fill:currentColor}
.hint-handle{display:none;position:absolute;z-index:1;background:var(--accent);border:1px solid var(--bg);border-radius:4px;touch-action:none}
.hint.editing .hint-handle{display:block}
.hint[data-dir=v] .hint-start,.hint[data-dir=v] .hint-end{left:-3px;right:-3px;height:10px}
.hint[data-dir=v] .hint-start{top:-4px;cursor:ns-resize}
.hint[data-dir=v] .hint-end{bottom:-4px;cursor:ns-resize}
.hint[data-dir=h] .hint-start,.hint[data-dir=h] .hint-end{top:-3px;bottom:-3px;width:10px}
.hint[data-dir=h] .hint-start{left:-4px;cursor:ew-resize}
.hint[data-dir=h] .hint-end{right:-4px;cursor:ew-resize}
.hint[data-dir=v] .hint-thickness{top:25%;bottom:25%;width:10px}
.hint[data-edge=left] .hint-thickness{right:-4px;cursor:ew-resize}
.hint[data-edge=right] .hint-thickness{left:-4px;cursor:ew-resize}
.hint[data-dir=h] .hint-thickness{left:25%;right:25%;height:10px}
.hint[data-edge=top] .hint-thickness{bottom:-4px;cursor:ns-resize}
.hint[data-edge=bottom] .hint-thickness{top:-4px;cursor:ns-resize}
/* The active dock edge and all floating-window edges remain resizable at all times. */
.rz{background:transparent}
/* Docked horizontal rails sit flush to the physical viewport edge. */
.panel[data-style=docked][data-dir=h] .list{padding-top:0;padding-bottom:0}
.tab.drop-invalid{cursor:not-allowed;opacity:.48;outline:2px solid #d9534f;outline-offset:-2px}
@media (prefers-reduced-motion:reduce){.panel,.pin svg,.chev{transition:none!important}}
`;
