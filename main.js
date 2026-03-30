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
    // Server has data pushed after our last local edit — use it
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
  // Match against UniqID field. Add a UniqID column to links.json to use this.
  const urlId = new URLSearchParams(location.search).get('id');
  if (urlId) {
    const target = linksData.find(r => String(r.UniqID || '') === String(urlId));
    if (target) {
      setTimeout(function() { if (window.openFS) window.openFS(target); }, 500);
    } else {
      console.warn('SeeAndLearn: no row found for ?id=' + urlId);
    }
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

async function flParseAndImport() {
  const raw   = document.getElementById('fastLinkInput').value;
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const da    = flDateStamp();

  const target = (typeof window.flImportTarget === 'function') ? window.flImportTarget() : 'master';
  const isAdding = target === 'adding';

  const statusEl = document.getElementById('fastLinkStatus');
  statusEl.textContent = 'Processing...';

  let imported = 0, skipped = 0;
  let lastEntry = null;   // the most recently created row (for attaching linkpage)
  let cname = '';         // text line before an image = cname

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Blank-like separator: skip
    if (!line) { cname = ''; lastEntry = null; continue; }

    // Non-URL line → cname for the next image
    if (!flIsURL(line)) {
      cname = line;
      continue;
    }

    // Video URL → row with VidRange
    if (flIsVideoURL(line)) {
      const nextCell = isAdding
        ? (typeof nextFreeAddCell === 'function' ? nextFreeAddCell() : '')
        : flNextFreeCell();
      if (!nextCell) { skipped++; continue; }
      const entry = { show:'1', VidRange:'0 99999', cell:nextCell, fit:'fc',
        link:line, cname, linkpage:'', sname:'', attribution:'', comment:'', DateAdded:da, Mute:'1' };
      if (isAdding) { addingData.push(entry); if (typeof saveAdding==='function') saveAdding(); }
      else linksData.push(entry);
      lastEntry = entry; cname = ''; imported++;
      continue;
    }

    // Wikipedia #/media/File: URL → resolve to direct image URL
    if (/wikipedia\.org\/wiki\/.*#\/media\/File:/i.test(line)) {
      statusEl.textContent = 'Resolving Wikipedia image URL...';
      const resolved = await flResolveWikipediaMedia(line);
      if (!resolved) {
        statusEl.textContent = 'Could not resolve Wikipedia image URL: ' + line.slice(0, 60);
        skipped++;
        continue;
      }
      // Fall through with resolved URL as the image link, original as linkpage
      const nextCell = isAdding
        ? (typeof nextFreeAddCell === 'function' ? nextFreeAddCell() : '')
        : flNextFreeCell();
      if (!nextCell) { skipped++; continue; }
      const entry = { show:'1', VidRange:'i', cell:nextCell, fit:'fc',
        link:resolved, linkpage:line, cname, sname:'', attribution:'', comment:'', DateAdded:da, Mute:'1' };
      if (isAdding) { addingData.push(entry); if (typeof saveAdding==='function') saveAdding(); }
      else linksData.push(entry);
      lastEntry = entry; cname = ''; imported++;
      continue;
    }

    // Direct image URL
    if (flIsImageURL(line)) {
      const nextCell = isAdding
        ? (typeof nextFreeAddCell === 'function' ? nextFreeAddCell() : '')
        : flNextFreeCell();
      if (!nextCell) { skipped++; continue; }
      const entry = { show:'1', VidRange:'i', cell:nextCell, fit:'fc',
        link:line, linkpage:'', cname, sname:'', attribution:'', comment:'', DateAdded:da, Mute:'1' };
      if (isAdding) { addingData.push(entry); if (typeof saveAdding==='function') saveAdding(); }
      else linksData.push(entry);
      lastEntry = entry; cname = ''; imported++;
      continue;
    }

    // Non-image URL after an image row → linkpage on that row
    if (lastEntry) {
      lastEntry.linkpage = line;
      lastEntry = null;   // consumed — next non-image URL won't attach here
      continue;
    }

    // Any other URL (no preceding image row) — treat as cname-less image attempt
    const nextCell = isAdding
      ? (typeof nextFreeAddCell === 'function' ? nextFreeAddCell() : '')
      : flNextFreeCell();
    if (!nextCell) { skipped++; continue; }
    const entry = { show:'1', VidRange:'i', cell:nextCell, fit:'fc',
      link:line, linkpage:'', cname, sname:'', attribution:'', comment:'', DateAdded:da, Mute:'1' };
    if (isAdding) { addingData.push(entry); if (typeof saveAdding==='function') saveAdding(); }
    else linksData.push(entry);
    lastEntry = entry; cname = ''; imported++;
  }

  if (!imported && !skipped) {
    statusEl.textContent = 'No URLs found.';
    return;
  }

  if (!isAdding) {
    if (window.saveData) window.saveData(true);
    else localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  }

  if (typeof renderAddGrid === 'function') renderAddGrid();
  render();

  const dest = isAdding ? 'staging (AT)' : 'masterlinks (TM)';
  const msg = '✓ Pushed ' + imported + ' row' + (imported !== 1 ? 's' : '') + ' to ' + dest
    + (skipped ? ' (' + skipped + ' skipped — no empty cells)' : '');
  statusEl.textContent = msg;
  document.getElementById('fastLinkInput').value = '';
}

document.getElementById('miLinkPastes').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  if (typeof isAdmin === 'function' && !isAdmin()) { alert('Admin privileges required.'); return; }
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
    }
    const fastMod = document.getElementById('fastLinkModal');
    if (fastMod && fastMod.style.display === 'flex') {
      fastMod.style.display = 'none';
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

  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 't') {
    const menuPanel = document.getElementById('menuPanel');
    if (menuPanel && menuPanel.classList.contains('open')) {
       // If hamburger is open, trigger Tables
       e.preventDefault();
       const miTables = document.getElementById('miTables');
       if (miTables) {
         const ev = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
         miTables.dispatchEvent(ev);
       }
    }
  }

  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'l') {
    const menuPanel = document.getElementById('menuPanel');
    if (menuPanel && menuPanel.classList.contains('open')) {
      // If hamburger is open, trigger LinkPastes
      e.preventDefault();
      const miFast = document.getElementById('miLinkPastes');
      if (miFast) {
        const ev = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
        miFast.dispatchEvent(ev);
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
    // Save the CORRECT dataset — never call saveData() while Tabulator holds addingData
    function safeSave() {
      if (window._addGridActive) {
        // Tabulator may hold addingData rows — save only the staging data, not linksData
        if (typeof saveAdding === 'function') saveAdding();
      } else {
        if (window.saveData) window.saveData();
      }
    }

    if (key === 'g') {
      closeLinkPaste(true);
      // closeTableEditor handles its own save correctly (already guarded for addMode)
      if (window.closeTableEditor) window.closeTableEditor();
      else safeSave();
      closeAllOverlays();
    }
    else if (key === 't') {
      closeLinkPaste(true);
      safeSave();   // save before touching Tabulator
      closeAllOverlays();
      var modal = document.getElementById('jsonModal');
      // Always open/refresh table — don't skip if modal was already open
      if (modal) {
        if (!modal.classList.contains('open')) {
          // Set up modal display
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
  }

  // ── Floating button bar ─────────────────────────────────────────────────────
  // Layout (both desktop and mobile):
  //   Top row:    G  T  L       (Grid, Table/Master, Links)
  //   Bottom row: E  V  A       (VideoEdit [desktop only], VideoShow, Add grid)
  //   S stub: small button above T (Subjects — future)
  // On mobile E is hidden (replaced by nothing, or just V A remain)

  var bar = document.createElement('div');
  bar.id = 'sal-switcher-bar';
  bar.style.cssText = 'position:fixed;bottom:67px;right:18px;z-index:9999998;'
    + 'display:grid;grid-template-columns:repeat(3,34px);grid-template-rows:auto auto;'
    + 'gap:5px;';

  var btnStyle = 'width:34px;height:34px;border-radius:6px;border:1px solid #4af;'
    + 'background:rgba(0,20,50,0.85);color:#8ef;font-size:13px;font-weight:bold;'
    + 'cursor:pointer;font-family:sans-serif;';
  var btnTitles = {
    G:'Grid view (masterlinks)',
    T:'Table view (masterlinks)',
    L:'Links — fast paste screen',
    E:'VideoEdit',
    V:'VideoShow (play)',
    A:'Toggle GAdd staging grid'
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

  // S stub — small, sits above T (column 2, row 1)
  var sBtn = document.createElement('button');
  sBtn.textContent = 'S';
  sBtn.title = 'Subjects grid — coming soon';
  sBtn.style.cssText = 'width:34px;height:20px;border-radius:4px;border:1px solid #888;'
    + 'background:rgba(0,20,50,0.7);color:#888;font-size:10px;font-weight:bold;'
    + 'cursor:pointer;font-family:sans-serif;grid-column:2;';
  sBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (typeof showToast === 'function') showToast('Subjects grid — coming soon');
  });

  // S stub row (spans full width, only S visible)
  var sRow = document.createElement('div');
  sRow.style.cssText = 'grid-column:1/4;display:flex;justify-content:center;';
  sRow.appendChild(sBtn);
  bar.appendChild(sRow);

  // Top row: G T L
  bar.appendChild(mkBarBtn('G'));
  bar.appendChild(mkBarBtn('T'));
  bar.appendChild(mkBarBtn('L'));

  // Bottom row: E V A  (E hidden on mobile)
  var eBtn = mkBarBtn('E');
  if (ISMOBILE) eBtn.style.visibility = 'hidden';
  bar.appendChild(eBtn);
  bar.appendChild(mkBarBtn('V'));

  // A button
  var aBtn = document.createElement('button');
  aBtn.id = 'sal-add-btn';
  aBtn.textContent = 'A';
  aBtn.title = btnTitles['A'];
  aBtn.style.cssText = btnStyle;
  aBtn.addEventListener('click', function(e) {
    e.stopPropagation(); doSwitch('a');
  });
  bar.appendChild(aBtn);

  if (document.body) document.body.appendChild(bar);
  else window.addEventListener('DOMContentLoaded', function() { document.body.appendChild(bar); });

    var rmbDown = false;
  var switcherFired = false;

  // mousedown/mouseup capture so we detect RMB even inside iframes
  document.addEventListener('mousedown', function(e) {
    if (e.button === 2) { rmbDown = true; switcherFired = false; }
  }, true);
  document.addEventListener('mouseup', function(e) {
    if (e.button === 2) rmbDown = false;
  }, true);
  // Suppress contextmenu in capture phase whenever rmbDown (but not ctrl+right-click)
  document.addEventListener('contextmenu', function(e) {
    if (rmbDown && !e.ctrlKey) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // ── Double-tap key ──────────────────────────────────────────────────────────
  var lastKey = '', lastTime = 0, DOUBLE_MS = 350;

  // Single capture-phase keydown handles both RMB-hold and double-tap
  document.addEventListener('keydown', function(e) {
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
  }, true);  // capture phase — fires even when iframe has focus

})();
