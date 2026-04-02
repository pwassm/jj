async function init(){
  setupLayout(); syncFit(); syncAdminUI();

  // Data loading priority:
  //
  // 1. Fetch links.json from server (always attempted on http/https)
  // 2. Compare server data's _salPushTime against localStorage's sal-edited timestamp
  //    If server data is NEWER → use server data (picks up pushes from other sessions/devices)
  //    If localStorage is NEWER or same → use localStorage (preserves local edits)
  // 3. On file:/// fetch fails → use localStorage or LINKS_JSON_INLINE fallback
  //
  // This means:
  //  - Push to GitHub from any session → other sessions pick it up on next load
  //  - Local edits always preserved until a newer push overwrites them
  //  - file:/// still works via localStorage/inline fallback

  const lsRaw = localStorage.getItem('seeandlearn-links');
  let lsData = null;
  if (lsRaw) { try { lsData = JSON.parse(lsRaw); } catch(e) {} }
  const lsTime = parseInt(localStorage.getItem('sal-edited') || '0', 10);

  let fileData = null;
  let fileTime = 0;
  try {
    const r = await fetch('masterlinks.json?v=' + Date.now());
    if (r.ok) {
      const raw = await r.json();
      if (Array.isArray(raw)) {
        // Check for metadata element (first element with _salMeta flag)
        if (raw.length > 0 && raw[0]._salMeta) {
          fileTime = parseInt(raw[0]._salPushTime || '0', 10);
          // Apply column layout when file is authoritative (checked below after lsTime compare)
          window._pendingColLayout = raw[0]._salColLayout || null;
          fileData = raw.slice(1); // rest is the actual data
        } else {
          fileData = raw; // legacy format, no timestamp
        }
      }
    }
  } catch(e) {}

  if (!fileData && window.LINKS_JSON_INLINE) fileData = window.LINKS_JSON_INLINE;

  const fileIsNewer = fileData && Array.isArray(fileData) && fileData.length > 0 && fileTime > lsTime;
  const hasLocalData = lsData && Array.isArray(lsData) && lsData.length > 0 && lsTime > 0;

  if (fileIsNewer) {
    // Server has data pushed after our last local edit — use it, including column layout
    if (window._pendingColLayout && typeof applyColLayout === 'function') {
      applyColLayout(window._pendingColLayout);
    }
    linksData = fileData;
    localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
    localStorage.setItem('sal-edited', String(fileTime));
  } else if (hasLocalData) {
    // Local edits are current
    linksData = lsData;
  } else if (fileData && Array.isArray(fileData) && fileData.length > 0) {
    // Fresh install — seed from file
    linksData = fileData;
    localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
    localStorage.setItem('sal-edited', Date.now().toString());
  } else {
    linksData = [];
  }

  // Migrate legacy field names
  linksData.forEach(row => {
    // Migrate legacy VidRange field name
    if ('asset' in row && !('VidRange' in row)) {
      row.VidRange = row.asset;
      delete row.asset;
    }
    // Migrate old dot-field names (v.title, v.author, V.Title, V.Author) → VidTitle, VidAuthor
    if ('v.title'  in row) { if (!row.VidTitle)  row.VidTitle  = row['v.title'];  delete row['v.title'];  }
    if ('v.author' in row) { if (!row.VidAuthor) row.VidAuthor = row['v.author']; delete row['v.author']; }
    if ('V.Title'  in row) { if (!row.VidTitle)  row.VidTitle  = row['V.Title'];  delete row['V.Title'];  }
    if ('V.Author' in row) { if (!row.VidAuthor) row.VidAuthor = row['V.Author']; delete row['V.Author']; }
    // Repair corruption from old Tabulator nestedFieldSeparator bug:
    // If a 'v' object exists, extract title/author then delete it
    if (row.v && typeof row.v === 'object') {
      if (row.v.title  !== undefined && !row.VidTitle)  row.VidTitle  = String(row.v.title  || '');
      if (row.v.author !== undefined && !row.VidAuthor) row.VidAuthor = String(row.v.author || '');
      delete row.v;
    }
  });
  render();

  // ── Deep-link: ?id=UNIQUEID opens VideoShow directly ─────────────────────
  // Usage: pwassm.github.io/jj/?id=ABC123
  const urlParams = new URLSearchParams(location.search);
  const urlId     = urlParams.get('id');
  const urlScreen = urlParams.get('screen');
  const urlH      = urlParams.get('h');

  if (urlId) {
    const target = linksData.find(r => String(r.UniqID || '') === String(urlId));
    if (target) {
      setTimeout(function() { if (window.openFS) window.openFS(target); }, 500);
    } else {
      console.warn('SeeAndLearn: no row found for ?id=' + urlId);
    }
  }

  // ── Deep-link: ?screen=ga opens GA overlay ────────────────────────────────
  if (urlScreen === 'ga') {
    setTimeout(function() {
      if (window.toggleAddGrid && !window._addGridActive) window.toggleAddGrid();
    }, 400);
  }

  // ── Deep-link: ?h=N restores history snapshot N and shows GM ─────────────
  // Usage: pwassm.github.io/jj/?h=3
  // Waits for historyData to load (initHistory is async), then restores.
  if (urlH) {
    Promise.resolve(window._historyReady).then(function() {
      if (window.restoreByHistID) {
        const ok = window.restoreByHistID(parseInt(urlH, 10));
        if (!ok) console.warn('SeeAndLearn: no history entry with HistID=' + urlH);
      }
    });
  }
}

init();
window.addEventListener('resize',()=>{ setupLayout(); render(); });
window.addEventListener('orientationchange',()=>setTimeout(()=>{ setupLayout(); render(); },350));

// ─── LinkUpload (LU) — smart-parse textarea ──────────────────────────────────
// New parsing rules for alternating image+source format:
//   Image URL line   → new row, VidRange='i', next free cell
//   Next non-image line (optional) → linkpage field on that same row
//   Next image URL   → new row, etc.
//
// An "image URL" is: direct .jpg/.png/.gif/.webp/.svg extension,
//   OR a Wikipedia /wiki/.../media/File: URL (resolved via Wikimedia API),
//   OR a YouTube/Vimeo URL (video, VidRange='0 99999')
//
// A non-URL text line still works as cname (old behaviour preserved)
// A non-image URL (e.g. a Wikipedia article page) → linkpage on current row

function flIsURL(s) { return /^https?:\/\//i.test(s.trim()); }

function flIsImageURL(s) {
  s = s.trim();
  if (!flIsURL(s)) return false;
  // Direct image extension (strip query/fragment first)
  const clean = s.split('?')[0].split('#')[0].toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff?)$/.test(clean)) return true;
  // Wikimedia commons direct upload URLs
  if (/upload\.wikimedia\.org/i.test(s)) return true;
  // Wikipedia #/media/File: fragment pattern
  if (/wikipedia\.org\/wiki\/.*#\/media\/File:/i.test(s)) return true;
  return false;
}

function flIsVideoURL(s) {
  return (window.isYouTubeLink && window.isYouTubeLink(s)) ||
         (window.isVimeoLink && window.isVimeoLink(s));
}

// Resolve a Wikipedia wiki page #/media/File: URL to the actual image URL
// via the Wikimedia imageinfo API. Returns a Promise<string|null>.
async function flResolveWikipediaMedia(url) {
  try {
    // Extract filename: .../wiki/Page#/media/File:Foo.jpg → "File:Foo.jpg"
    const m = url.match(/#\/media\/(File:[^&?#]+)/i);
    if (!m) return null;
    const filename = decodeURIComponent(m[1]);
    // Determine language prefix (en, de, fr, etc.)
    const langM = url.match(/^https?:\/\/([a-z]{2,})\.wikipedia\.org/i);
    const lang = langM ? langM[1] : 'en';
    const apiUrl = 'https://' + lang + '.wikipedia.org/w/api.php'
      + '?action=query&titles=' + encodeURIComponent(filename)
      + '&prop=imageinfo&iiprop=url&format=json&origin=*';
    const res = await fetch(apiUrl);
    const data = await res.json();
    const pages = data.query && data.query.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (page && page.imageinfo && page.imageinfo[0]) {
      return page.imageinfo[0].url;
    }
  } catch(e) {}
  return null;
}

function flDateStamp() {
  const d = new Date();
  return `${String(d.getFullYear()).slice(-2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}.${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}.${String(d.getSeconds()).padStart(2,'0')}`;
}

function flNextFreeCell() {
  const occ = occupied();
  for (let r = 1; r <= ROWS; r++)
    for (let c = 1; c <= COLS; c++) {
      const cs = mkCell(r, c);
      if (!occ.has(cs)) return cs;
    }
  return '';
}

// ── URL cleanup ──────────────────────────────────────────────────────────────
function flCleanURL(url) {
  // Strip tracking/sharing params from YouTube: keep only ?v=ID
  const ytM = url.match(/(?:youtube\.com\/watch[^\s]*[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytM) {
    // Check if it's a Shorts URL before stripping
    if (/youtube\.com\/shorts\//.test(url)) return 'https://www.youtube.com/shorts/' + ytM[1];
    return 'https://www.youtube.com/watch?v=' + ytM[1];
  }
  // Strip ?share and other Vimeo/generic junk after the path
  return url.replace(/[?#](share|utm_[^&]*|si=[^&]*)(&.*)?$/, '').replace(/&utm_[^&]*/g, '');
}

// ── Detect YouTube Shorts (with or without /shorts/ in URL) ─────────────────
// Strategy: check URL path first, then use noembed oEmbed API to check
// the thumbnail dimensions (Shorts are taller than wide → portrait).
async function flIsYouTubeShorts(url, vid) {
  if (/youtube\.com\/shorts\//.test(url)) return true;
  // Try oEmbed to get thumbnail dimensions (works for public videos)
  try {
    const oe = await fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + vid));
    if (oe.ok) {
      const j = await oe.json();
      if (j.thumbnail_width && j.thumbnail_height) {
        return j.thumbnail_height > j.thumbnail_width;  // portrait → Shorts
      }
    }
  } catch(e) {}
  return false;
}

// ── Image dimension fetch ─────────────────────────────────────────────────────
function flGetImageDims(url) {
  return new Promise(function(resolve) {
    const img = new Image();
    const timer = setTimeout(function() { resolve(null); }, 6000);
    img.onload  = function() { clearTimeout(timer); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = function() { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

async function flParseAndImport() {
  const raw   = document.getElementById('fastLinkInput').value;
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && flIsURL(l));
  const da    = flDateStamp();

  const target   = (typeof window.flImportTarget === 'function') ? window.flImportTarget() : 'adding';
  const isAdding = target === 'adding';
  const statusEl = document.getElementById('fastLinkStatus');

  if (!lines.length) { statusEl.textContent = 'No URLs found.'; return; }

  let imported = 0, skipped = 0;
  let lastEntry = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    statusEl.textContent = 'Processing ' + (i+1) + '/' + lines.length + '…';

    const line = ISMOBILE ? rawLine : flCleanURL(rawLine);

    const cell = isAdding ? '' : flNextFreeCell();
    if (!isAdding && !cell) { skipped++; continue; }

    // ── Video URL (YouTube / Vimeo) ─────────────────────────────────────────
    if (flIsVideoURL(line)) {
      let portrait = '0';
      let vidRange = '0 99999';

      if (!ISMOBILE && window.isYouTubeLink && window.isYouTubeLink(line)) {
        const vid = window.getYouTubeId ? window.getYouTubeId(line) : '';
        if (vid) {
          const isShorts = await flIsYouTubeShorts(line, vid);
          portrait = isShorts ? '1' : '0';
        }
        // Try to get actual duration via noembed (not always available)
        // Default to 0 99999 which means "play all"
      }

      const entry = { show:'1', VidRange:vidRange, cell, fit:'fc', Portrait:portrait,
        link:line, cname:'', linkpage:'', sname:'', attribution:'', comment:'', DateAdded:da, Mute:'1' };
      if (isAdding) { addingData.push(entry); if (typeof saveAdding==='function') saveAdding(); }
      else linksData.push(entry);
      lastEntry = entry; imported++;
      continue;
    }

    // ── Wikipedia media URL → resolve to direct image ──────────────────────
    if (/wikipedia\.org\/wiki\/.*#\/media\/File:/i.test(line)) {
      statusEl.textContent = 'Resolving Wikipedia image…';
      const resolved = await flResolveWikipediaMedia(line);
      if (!resolved) { skipped++; continue; }
      const dims = ISMOBILE ? null : await flGetImageDims(resolved);
      const mpix = dims ? ((dims.w * dims.h) / 1e6).toFixed(2) : '';
      const portrait = dims ? (dims.h > dims.w ? '1' : '0') : '';
      const entry = { show:'1', VidRange:'i', cell, fit:'ei', MPix:mpix, Portrait:portrait,
        link:resolved, linkpage:line, cname:'', sname:'', attribution:'', comment:'', DateAdded:da, Mute:'1' };
      if (isAdding) { addingData.push(entry); if (typeof saveAdding==='function') saveAdding(); }
      else linksData.push(entry);
      lastEntry = entry; imported++;
      continue;
    }

    // ── Direct image URL ───────────────────────────────────────────────────
    if (flIsImageURL(line)) {
      const dims = ISMOBILE ? null : await flGetImageDims(line);
      const mpix = dims ? ((dims.w * dims.h) / 1e6).toFixed(2) : '';
      const portrait = dims ? (dims.h > dims.w ? '1' : '0') : '';
      const entry = { show:'1', VidRange:'i', cell, fit:'ei', MPix:mpix, Portrait:portrait,
        link:line, linkpage:'', cname:'', sname:'', attribution:'', comment:'', DateAdded:da, Mute:'1' };
      if (isAdding) { addingData.push(entry); if (typeof saveAdding==='function') saveAdding(); }
      else linksData.push(entry);
      lastEntry = entry; imported++;
      continue;
    }

    // ── Non-image URL after image/video row → linkpage ─────────────────────
    if (lastEntry) {
      lastEntry.linkpage = line;
      lastEntry = null;
      continue;
    }

    // ── Unknown URL — treat as image ───────────────────────────────────────
    const dims2 = ISMOBILE ? null : await flGetImageDims(line);
    const mpix2 = dims2 ? ((dims2.w * dims2.h) / 1e6).toFixed(2) : '';
    const portrait2 = dims2 ? (dims2.h > dims2.w ? '1' : '0') : '';
    const entry = { show:'1', VidRange:'i', cell, fit:'ei', MPix:mpix2, Portrait:portrait2,
      link:line, linkpage:'', cname:'', sname:'', attribution:'', comment:'', DateAdded:da, Mute:'1' };
    if (isAdding) { addingData.push(entry); if (typeof saveAdding==='function') saveAdding(); }
    else linksData.push(entry);
    lastEntry = entry; imported++;
  }

  if (!isAdding) {
    if (window.saveData) window.saveData(true);
    else localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  } else {
    if (window._salTab && window._tabMode === 'adding' && window.openTable) window.openTable(true);
  }

  if (typeof renderAddGrid === 'function') renderAddGrid();
  render();

  const dest = isAdding ? 'TA staging' : 'TM';
  statusEl.textContent = '✓ ' + imported + ' URL' + (imported!==1?'s':'') + ' → ' + dest
    + (skipped ? ', ' + skipped + ' skipped (grid full)' : '');
  document.getElementById('fastLinkInput').value = '';
}

document.getElementById('miLinkPastes').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  if (typeof isAdmin === 'function' && !isAdmin()) { alert('Admin privileges required.'); return; }
  if (window.menuWrap) window.menuWrap.style.display = 'none';  // hide HM on L screen
  document.getElementById('fastLinkModal').style.display = 'flex';
  document.getElementById('fastLinkStatus').textContent = '';
  setTimeout(() => document.getElementById('fastLinkInput').focus(), 80);
});

document.getElementById('fastLinkPasteTop').addEventListener('click', async () => {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) return;
    const ta = document.getElementById('fastLinkInput');
    // Append to existing content (may already have cname above cursor)
    const cur = ta.value;
    ta.value = cur ? (cur.trimEnd() + '\n' + text) : text;
    document.getElementById('fastLinkStatus').textContent = '';
    ta.focus();
  } catch(err) {
    document.getElementById('fastLinkStatus').textContent = 'Clipboard blocked — paste manually (Ctrl+V).';
  }
});

document.getElementById('flClearBtn').addEventListener('click', () => {
  document.getElementById('fastLinkInput').value = '';
  document.getElementById('fastLinkStatus').textContent = '';
  document.getElementById('fastLinkInput').focus();
});

document.getElementById('flImport').addEventListener('click', () => flParseAndImport().catch(err => { document.getElementById('fastLinkStatus').textContent = 'Error: ' + err.message; }));

// Ctrl+Enter also imports
document.getElementById('fastLinkInput').addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); flParseAndImport().catch(err => { document.getElementById('fastLinkStatus').textContent = 'Error: ' + err.message; }); }
});

document.getElementById('fastLinkExit').addEventListener('pointerup', () => {
  document.getElementById('fastLinkModal').style.display = 'none';
  if (window.menuWrap) window.menuWrap.style.display = '';  // restore HM
  render();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (typeof stopColResize === 'function' && isColResizing) {
      stopColResize();
    }
    const jsonMod = document.getElementById('jsonModal');
    if (jsonMod && jsonMod.classList.contains('open')) {
      if (window.closeTableEditor) window.closeTableEditor();
      else { jsonMod.classList.remove('open'); render(); }
      if (window.menuWrap) window.menuWrap.style.display = '';  // restore HM
    }
    const histMod = document.getElementById('historyModal');
    if (histMod && histMod.classList.contains('open')) {
      if (window.closeHistoryModal) window.closeHistoryModal();
    }
    const fastMod = document.getElementById('fastLinkModal');
    if (fastMod && fastMod.style.display === 'flex') {
      fastMod.style.display = 'none';
      if (window.menuWrap) window.menuWrap.style.display = '';  // restore HM
      render();
    }
  }
});


window.addEventListener('keydown', e => {
  if (e.key === 'Control') document.body.classList.add('ctrl-pressed');

  if (e.ctrlKey && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
      // Simulate click
      const ev = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
      menuBtn.dispatchEvent(ev);
    }
  }

  // ── Hamburger menu keyboard shortcuts (menu must be open) ──────────────────
  // When the hamburger panel is open, pressing the first letter of each item
  // triggers it.  Map: A=Admin(skip) D=Download C=ClearStaging P=Push
  //                    L=LoadGH R=ReloadML S=Settings H=Help G=GetLinksFromClip
  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    const menuPanel = document.getElementById('menuPanel');
    if (menuPanel && menuPanel.classList.contains('open')) {
      const menuKeyMap = {
        'd': 'miDlAll',
        'c': 'miClearStaging',
        'p': 'miPushGithub',
        'l': 'miLoadGithub',
        'r': 'miReloadML',
        's': 'miSettings',
        'h': 'miHelp',
        'g': 'miLinkPastes'
        // 'a' = Admin — no interactive action, skip
      };
      const mk = e.key.toLowerCase();
      if (menuKeyMap[mk]) {
        e.preventDefault();
        const el = document.getElementById(menuKeyMap[mk]);
        if (el) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
      }
    }
  }
});

window.addEventListener('keyup', e => {
  if (e.key === 'Control') document.body.classList.remove('ctrl-pressed');
});
window.addEventListener('blur', () => {
  document.body.classList.remove('ctrl-pressed');
});


window.rKeyDown = false;
window.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'r') window.rKeyDown = true; });
window.addEventListener('keyup', e => { if (e.key.toLowerCase() === 'r') window.rKeyDown = false; });

// ── Screen switcher: floating buttons + RMB-hold+key + double-tap ────────────
(function() {

  // ── Shared helpers ──────────────────────────────────────────────────────────

  function showToast(msg) {
    var t = document.getElementById('sal-switcher-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sal-switcher-toast';
      t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
        + 'background:rgba(0,0,30,0.92);color:#f88;padding:14px 28px;border-radius:8px;'
        + 'border:1px solid #f66;font-family:sans-serif;font-size:15px;z-index:9999999;'
        + 'pointer-events:none;text-align:center;';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(t._tid);
    t._tid = setTimeout(function() { t.style.display = 'none'; }, 2000);
  }

  // Resolve the best available video entry for E/V switching
  function resolveEntry() {
    // Priority: focused table row → last video shown
    if (window._activeRow) {
      var data = window._activeRow.getData ? window._activeRow.getData() : null;
      if (data && data.link) {
        if (window.syncFromTabulator) window.syncFromTabulator();
        var found = (window.linksData || []).find(function(r) {
          return r.link === data.link && r.cell === data.cell;
        });
        if (found) return found;
      }
    }
    if (window._lastVideoShown) return window._lastVideoShown;
    return null;
  }

  // Close all video overlays and stop any playing video
  function closeAllOverlays() {
    var ov = document.getElementById('video-editor-overlay');
    if (ov) ov.remove();
    var fs = document.getElementById('fs-overlay');
    if (fs) {
      // Stop the VideoShow player before removing
      if (window.stopCellVideoLoop) {
        var vh = document.getElementById('fs-vid');
        if (vh) window.stopCellVideoLoop(vh.id);
        // Also stop any player whose key starts with fs-
        if (window.seeLearnVideoPlayers) {
          Object.keys(window.seeLearnVideoPlayers).forEach(function(k) {
            if (k.indexOf('fs') === 0) window.stopCellVideoLoop(k);
          });
        }
      }
      fs.remove();
    }
  }

  // Close LinkPaste modal (optionally importing pending content first)
  function closeLinkPaste(andImport) {
    var modal = document.getElementById('fastLinkModal');
    if (!modal || modal.style.display === 'none') return;
    if (andImport) {
      var ta = document.getElementById('fastLinkInput');
      if (ta && ta.value.trim()) flParseAndImport().catch(err => { document.getElementById('fastLinkStatus').textContent = 'Error: ' + err.message; });
    }
    modal.style.display = 'none';
  }

  function doSwitch(key) {
    // Close history modal on any screen switch
    var _hm = document.getElementById('historyModal');
    if (_hm && _hm.classList.contains('open')) {
      _hm.classList.remove('open');
      if (window.menuWrap) window.menuWrap.style.display = '';
    }

    function safeSave() {
      if (window._addGridActive) {
        if (typeof saveAdding === 'function') saveAdding();
      } else {
        if (window.saveData) window.saveData();
      }
    }

    if (key === 'g') {
      closeLinkPaste(true);
      if (window.closeTableEditor) window.closeTableEditor();
      else safeSave();
      closeAllOverlays();
      if (window.menuWrap) window.menuWrap.style.display = '';
    }
    else if (key === 't') {
      closeLinkPaste(true);
      safeSave();
      closeAllOverlays();
      if (window.menuWrap) window.menuWrap.style.display = 'none';
      var modal = document.getElementById('jsonModal');
      if (modal) {
        if (!modal.classList.contains('open')) {
          var rawJ = document.getElementById('toggleRawJson');
          if (rawJ) rawJ.textContent = 'Show Raw JSON';
          var te = document.getElementById('tableEditor'); if (te) te.style.display = 'block';
          var jt = document.getElementById('jsonText'); if (jt) jt.style.display = 'none';
          var tb = document.getElementById('tableToolbar'); if (tb) tb.style.display = 'flex';
          var ds = document.getElementById('deleteSelectedRows'); if (ds) ds.style.display = 'none';
          var js = document.getElementById('jsonStatus'); if (js) js.textContent = '';
          modal.classList.add('open');
        }
        if (window.openTable) window.openTable();
      }
    }
    else if (key === 'h') {
      closeLinkPaste(false);
      safeSave();
      closeAllOverlays();
      if (window.openHistoryModal) window.openHistoryModal();
    }
    else if (key === 'e') {
      closeLinkPaste(false);
      var entry = resolveEntry();
      if (!entry) { showToast('No video selected — click a row or open a video first'); return; }
      if (!entry.VidRange || !window.parseVideoAsset ||
          window.parseVideoAsset(String(entry.VidRange)) === null) {
        showToast('Row has no video segment (VidRange)'); return;
      }
      var fs = document.getElementById('fs-overlay');
      if (fs) {
        if (window.seeLearnVideoPlayers) {
          Object.keys(window.seeLearnVideoPlayers).forEach(function(k) {
            if (window.stopCellVideoLoop) window.stopCellVideoLoop(k);
          });
        }
        fs.remove();
      }
      if (window.openVideoEditor) window.openVideoEditor(entry);
    }
    else if (key === 'v') {
      closeLinkPaste(true);
      safeSave();
      var entry2 = resolveEntry();
      if (!entry2) { showToast('No video selected — click a row or open a video first'); return; }
      var ov = document.getElementById('video-editor-overlay');
      if (ov) {
        if (window.stopCellVideoLoop) window.stopCellVideoLoop('v2host');
        ov.remove();
      }
      if (window.openFS) window.openFS(entry2);
    }
    else if (key === 'l') {
      var miFL = document.getElementById('miLinkPastes');
      if (miFL) miFL.dispatchEvent(new Event('pointerup', {bubbles:true}));
    }
    else if (key === 'a') {
      if (window.toggleAddGrid) window.toggleAddGrid();
    }
    else if (key === 's') {
      showToast('Subjects grid — coming soon');
    }
  }

  // Expose so history.js and other modules can call it
  window.doSwitch = doSwitch;

  // ── Floating button bar ─────────────────────────────────────────────────────
  // Stub row: H(above G)  S(above T)
  // Main row: G  T  L
  // Alt row:  E  V  A

  var bar = document.createElement('div');
  bar.id = 'sal-switcher-bar';
  bar.style.cssText = 'position:fixed;bottom:67px;right:18px;z-index:9999998;'
    + 'display:grid;grid-template-columns:repeat(3,34px);grid-template-rows:auto auto;'
    + 'gap:5px;';

  var btnStyle = 'width:34px;height:34px;border-radius:6px;border:1px solid #4af;'
    + 'background:rgba(0,20,50,0.85);color:#8ef;font-size:13px;font-weight:bold;'
    + 'cursor:pointer;font-family:sans-serif;';
  var stubStyle = 'width:34px;height:20px;border-radius:4px;font-size:10px;font-weight:bold;'
    + 'cursor:pointer;font-family:sans-serif;';
  var btnTitles = {
    G:'Grid view (masterlinks)  [double-tap G]',
    T:'Table view (masterlinks)  [double-tap T]',
    L:'Links — fast paste screen',
    H:'History — GM snapshots',
    E:'VideoEdit  [double-tap E]',
    V:'VideoShow (play)  [double-tap V]',
    A:'Toggle GA staging grid',
    S:'Subjects — coming soon'
  };

  function mkBarBtn(lbl, extraStyle) {
    var btn = document.createElement('button');
    btn.textContent = lbl;
    btn.title = btnTitles[lbl] || lbl;
    btn.style.cssText = btnStyle + (extraStyle || '');
    btn.addEventListener('click', function(e) {
      e.stopPropagation(); doSwitch(lbl.toLowerCase());
    });
    return btn;
  }

  // ── Stub row: H above G, S above T ─────────────────────────────────────────
  var stubRow = document.createElement('div');
  stubRow.style.cssText = 'grid-column:1/4;display:grid;grid-template-columns:repeat(3,34px);gap:5px;';

  // H button — above G
  var hStubBtn = document.createElement('button');
  hStubBtn.textContent = 'H';
  hStubBtn.title = btnTitles['H'];
  hStubBtn.style.cssText = stubStyle + 'border:1px solid #8a8;background:rgba(0,50,20,0.7);color:#afa;';
  hStubBtn.addEventListener('click', function(e) { e.stopPropagation(); doSwitch('h'); });

  // S button — above T
  var sBtn = document.createElement('button');
  sBtn.textContent = 'S';
  sBtn.title = btnTitles['S'];
  sBtn.style.cssText = stubStyle + 'border:1px solid #888;background:rgba(0,20,50,0.7);color:#888;';
  sBtn.addEventListener('click', function(e) {
    e.stopPropagation(); doSwitch('s');
  });

  // Empty spacer above L
  var stubSpacer = document.createElement('div');

  stubRow.appendChild(hStubBtn);
  stubRow.appendChild(sBtn);
  stubRow.appendChild(stubSpacer);
  bar.appendChild(stubRow);

  // Main row: G T L
  bar.appendChild(mkBarBtn('G'));
  bar.appendChild(mkBarBtn('T'));
  bar.appendChild(mkBarBtn('L'));

  // Alt row: E V A  (E hidden on mobile)
  var eBtn = mkBarBtn('E');
  if (ISMOBILE) eBtn.style.visibility = 'hidden';
  bar.appendChild(eBtn);
  bar.appendChild(mkBarBtn('V'));

  var aBtn = document.createElement('button');
  aBtn.id = 'sal-add-btn';
  aBtn.textContent = 'A';
  aBtn.title = btnTitles['A'];
  aBtn.style.cssText = btnStyle;
  aBtn.addEventListener('click', function(e) { e.stopPropagation(); doSwitch('a'); });
  bar.appendChild(aBtn);

  if (document.body) document.body.appendChild(bar);
  else window.addEventListener('DOMContentLoaded', function() { document.body.appendChild(bar); });

  // ── RMB-hold + double-tap switcher ─────────────────────────────────────────
  var rmbDown = false;
  var switcherFired = false;

  document.addEventListener('mousedown', function(e) {
    if (e.button === 2) { rmbDown = true; switcherFired = false; }
  }, true);
  document.addEventListener('mouseup', function(e) {
    if (e.button === 2) rmbDown = false;
  }, true);
  document.addEventListener('contextmenu', function(e) {
    if (rmbDown && !e.ctrlKey) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  var lastKey = '', lastTime = 0, DOUBLE_MS = 350;

  // ── Ctrl+0 keyboard menu ────────────────────────────────────────────────────
  // Ctrl+0 toggles the switcher overlay. Stays until key chosen, Esc, or Ctrl+0 again.
  var ctrl0Pending = false;
  var ctrl0Toast = null;

  function showCtrl0Menu() {
    if (!ctrl0Toast) {
      ctrl0Toast = document.createElement('div');
      ctrl0Toast.style.cssText =
        'position:fixed;bottom:62px;right:14px;z-index:9999999;'
        + 'background:rgba(5,12,30,0.97);border:1px solid rgba(100,180,255,0.4);'
        + 'border-radius:10px;padding:12px 16px 10px;'
        + 'box-shadow:0 6px 28px rgba(0,0,0,0.85);pointer-events:none;'
        + 'font-family:Arial,sans-serif;min-width:200px;';
      document.body.appendChild(ctrl0Toast);
    }
    ctrl0Toast.innerHTML =
      '<div style="font-size:10px;color:rgba(120,160,220,0.7);letter-spacing:0.08em;'
      + 'text-transform:uppercase;margin-bottom:8px;">Navigate — press key</div>'
      + '<table style="border-collapse:collapse;width:100%;">'
      + rows([
          ['G','Grid','T','Table'],
          ['H','History','L','Links'],
          ['E','Edit','V','Video'],
          ['A','Add','S','Subjects'],
        ])
      + '</table>'
      + '<div style="margin-top:8px;font-size:10px;color:rgba(100,130,170,0.6);">'
      + 'Ctrl+0 or Esc to close</div>';

    function rows(pairs) {
      return pairs.map(function(p) {
        return '<tr>'
          + td(p[0], p[1])
          + td(p[2], p[3])
          + '</tr>';
      }).join('');
    }
    function td(key, label) {
      return '<td style="padding:3px 10px 3px 0;">'
        + '<span style="display:inline-block;width:18px;height:18px;line-height:18px;'
        + 'text-align:center;border-radius:3px;background:rgba(60,120,200,0.25);'
        + 'border:1px solid rgba(100,170,255,0.4);font-size:12px;font-weight:bold;'
        + 'color:#8ef;margin-right:5px;">' + key + '</span>'
        + '<span style="font-size:12px;color:#ccc;">' + label + '</span>'
        + '</td>';
    }
    ctrl0Toast.style.display = 'block';
  }

  function hideCtrl0Menu() {
    if (ctrl0Toast) ctrl0Toast.style.display = 'none';
    ctrl0Pending = false;
  }

  document.addEventListener('keydown', function(e) {
    // Ctrl+0 toggles the keyboard switcher overlay
    if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === '0') {
      e.preventDefault();
      if (ctrl0Pending) { hideCtrl0Menu(); return; }  // second Ctrl+0 closes
      ctrl0Pending = true;
      showCtrl0Menu();
      return;
    }

    // If Ctrl+0 menu is active, intercept the next keypress
    if (ctrl0Pending) {
      var k0 = e.key.toLowerCase();
      if (k0 !== 'control' && k0 !== 'shift' && k0 !== 'alt' && k0 !== 'meta') {
        e.preventDefault(); e.stopPropagation();
        hideCtrl0Menu();
        if (k0 !== 'escape' && 'gthlevsa'.indexOf(k0) >= 0) doSwitch(k0);
      }
      return;
    }

    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var key = e.key.toLowerCase();
    if (key !== 'g' && key !== 't' && key !== 'e' && key !== 'v') return;

    // RMB-hold mode
    if (rmbDown) {
      e.preventDefault(); e.stopPropagation();
      switcherFired = true;
      doSwitch(key);
      return;
    }

    // Double-tap mode
    var now = Date.now();
    if (key === lastKey && now - lastTime < DOUBLE_MS) {
      e.preventDefault(); e.stopPropagation();
      lastKey = ''; lastTime = 0;
      doSwitch(key);
    } else {
      lastKey = key; lastTime = now;
    }
  }, true);

})();
