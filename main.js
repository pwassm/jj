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

  const lsRaw = localStorage.getItem('seeandlearn-links') || localStorage.getItem('mlynx-links');
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
    if ('asset' in row && !('VidRange' in row)) {
      row.VidRange = row.asset;
      delete row.asset;
    }
    // Normalize V.Title → v.title, V.Author → v.author (capital V was old convention)
    if ('V.Title' in row && !('v.title' in row)) {
      row['v.title'] = row['V.Title'];
      delete row['V.Title'];
    }
    if ('V.Author' in row && !('v.author' in row)) {
      row['v.author'] = row['V.Author'];
      delete row['V.Author'];
    }
    // Remove old uppercase duplicates if both exist
    if ('V.Title' in row && 'v.title' in row) delete row['V.Title'];
    if ('V.Author' in row && 'v.author' in row) delete row['V.Author'];
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

// ─── FastLinkPaste — unified smart-parse textarea ────────────────────────────
// Parsing rules:
//   Non-URL line (1st of a group) → cname
//   Non-URL line (2nd of a group) → topic
//   URL lines                     → assigned to current cname + topic
//   Blank line or new non-URL     → resets to new cname group
//   Single URL works fine too.

function flIsURL(s) { return /^https?:\/\//i.test(s.trim()); }

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

function flParseAndImport() {
  const raw   = document.getElementById('fastLinkInput').value;
  const lines = raw.split(/\r?\n/).map(l => l.trim());
  const da    = flDateStamp();

  // If GAdd overlay is active, import into addingData instead of linksData
  const target = (typeof window.flImportTarget === 'function') ? window.flImportTarget() : 'master';
  const isAdding = target === 'adding';

  let cname = '', topic = '', nonUrlCount = 0;
  let imported = 0, skipped = 0;

  lines.forEach(line => {
    if (!line) {
      cname = ''; topic = ''; nonUrlCount = 0; return;
    }
    if (!flIsURL(line)) {
      if (nonUrlCount === 0) { cname = line; topic = ''; nonUrlCount = 1; }
      else                   { topic = line; nonUrlCount = 2; }
      return;
    }
    // It's a URL — assign to next free cell in the appropriate grid
    let nextCell = '';
    if (isAdding) {
      nextCell = (typeof nextFreeAddCell === 'function') ? nextFreeAddCell() : '';
    } else {
      nextCell = flNextFreeCell();
    }
    if (!nextCell) { skipped++; return; }

    const entry = { show:'1', VidRange:'i', cell:nextCell, fit:'fc',
      link:line, cname, Topic:topic, sname:'', attribution:'', comment:'', DateAdded:da, Mute:'1' };

    if (isAdding) {
      addingData.push(entry);
      if (typeof saveAdding === 'function') saveAdding();
    } else {
      linksData.push(entry);
    }
    imported++;
  });

  if (!imported && !skipped) {
    document.getElementById('fastLinkStatus').textContent = 'No URLs found.';
    return;
  }

  if (!isAdding) {
    if (window.saveData) window.saveData(true);
    else localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  }

  if (typeof renderAddGrid === 'function') renderAddGrid();
  render();

  const dest = isAdding ? 'staging grid (GAdd)' : 'masterlinks';
  const msg = `✓ Pushed ${imported} URL${imported !== 1 ? 's' : ''} to ${dest}` +
              (skipped ? ` (${skipped} skipped — no empty cells)` : '');
  document.getElementById('fastLinkStatus').textContent = msg;
  document.getElementById('fastLinkInput').value = '';
}

document.getElementById('miFastLinks').addEventListener('pointerup', e => {
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

document.getElementById('flImport').addEventListener('click', flParseAndImport);

// Ctrl+Enter also imports
document.getElementById('fastLinkInput').addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); flParseAndImport(); }
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
      // If hamburger is open, trigger FastLinks
      e.preventDefault();
      const miFast = document.getElementById('miFastLinks');
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

  // Close FastLink modal (optionally importing pending content first)
  function closeFastLink(andImport) {
    var modal = document.getElementById('fastLinkModal');
    if (!modal || modal.style.display === 'none') return;
    if (andImport) {
      var ta = document.getElementById('fastLinkInput');
      if (ta && ta.value.trim()) flParseAndImport();
    }
    modal.style.display = 'none';
  }

  function doSwitch(key) {
    if (window.saveData) window.saveData();

    if (key === 'g') {
      closeFastLink(true);   // push pending links then go to grid
      if (window.closeTableEditor) window.closeTableEditor();
      closeAllOverlays();
    }
    else if (key === 't') {
      closeFastLink(true);   // push pending links then go to table
      closeAllOverlays();
      var modal = document.getElementById('jsonModal');
      if (modal && !modal.classList.contains('open')) {
        var miT = document.getElementById('miTables');
        if (miT) miT.dispatchEvent(new Event('pointerup', {bubbles:true}));
      }
    }
    else if (key === 'e') {
      closeFastLink(false);
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
      closeFastLink(true);   // push pending links then play video
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
      var miFL = document.getElementById('miFastLinks');
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
  bar.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:9999998;'
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

  // Ctrl+right-click on any table cell → open VideoEdit for that row
  document.addEventListener('contextmenu', function(e) {
    if (!e.ctrlKey) return;
    var modal = document.getElementById('jsonModal');
    if (!modal || !modal.classList.contains('open')) return;
    // Find if click landed inside a Tabulator row
    var rowEl = e.target && e.target.closest && e.target.closest('.tabulator-row');
    if (!rowEl) return;
    e.preventDefault(); e.stopPropagation();
    // Find matching linksData entry from row's data
    if (window._salTab) {
      try {
        var rows = window._salTab.getRows();
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].getElement() === rowEl) {
            var data = rows[i].getData();
            if (data.link && data.VidRange && window.parseVideoAsset &&
                window.parseVideoAsset(String(data.VidRange)) !== null) {
              if (window.syncFromTabulator) window.syncFromTabulator();
              var entry = (window.linksData || []).find(function(r) {
                return r.link === data.link && r.cell === data.cell;
              });
              if (entry && window.openVideoEditor) window.openVideoEditor(entry);
            }
            break;
          }
        }
      } catch(ex) {}
    }
  });

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
