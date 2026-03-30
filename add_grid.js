// ── add_grid.js — GAdd 3×3 staging grid ──────────────────────────────────────
// Separate from masterlinks.json. Works on both desktop and mobile.
// Data: addingData[] stored in localStorage 'sal-adding' + adding.json on server.
// Displayed as overlay when _addGridActive = true.

const ADD_COLS = 3, ADD_ROWS = 3;

// ── Load adding.json from server, merge with localStorage ───────────────────
async function initAdding() {
  const lsRaw = localStorage.getItem('sal-adding');
  let lsData = null;
  if (lsRaw) { try { lsData = JSON.parse(lsRaw); } catch(e) {} }
  const lsTime = parseInt(localStorage.getItem('sal-adding-edited') || '0', 10);

  let fileData = null, fileTime = 0;
  try {
    const r = await fetch('adding.json?v=' + Date.now());
    if (r.ok) {
      const raw = await r.json();
      if (Array.isArray(raw)) {
        if (raw.length > 0 && raw[0]._salMeta) {
          fileTime = parseInt(raw[0]._salPushTime || '0', 10);
          fileData = raw.slice(1);
        } else {
          fileData = raw;
        }
      }
    }
  } catch(e) {}

  const fileIsNewer = fileData && fileData.length > 0 && fileTime > lsTime;
  const hasLocal    = lsData && lsData.length > 0;

  if (fileIsNewer)      { addingData = fileData; saveAdding(); }
  else if (hasLocal)    { addingData = lsData; }
  else if (fileData)    { addingData = fileData; saveAdding(); }
  else                  { addingData = []; }
}

function saveAdding() {
  localStorage.setItem('sal-adding', JSON.stringify(addingData));
  localStorage.setItem('sal-adding-edited', Date.now().toString());
}

// ── mkAddCell / occupiedAdding — mirror of mkCell/occupied for 3×3 ───────────
function mkAddCell(r, c) { return 'a' + r + LETTERS[c - 1]; }  // a1a, a1b, a1c … a3c
function occupiedAdding() {
  const s = new Set();
  addingData.forEach(it => {
    if (it.show === '1' && it.cell) s.add(it.cell);
  });
  return s;
}
function nextFreeAddCell() {
  const occ = occupiedAdding();
  for (let r = 1; r <= ADD_ROWS; r++)
    for (let c = 1; c <= ADD_COLS; c++) {
      const cs = mkAddCell(r, c); if (!occ.has(cs)) return cs;
    }
  return '';
}

// ── Render the GAdd overlay ──────────────────────────────────────────────────
var _addOverlay = null;

function renderAddGrid() {
  // Remove stale overlay
  if (_addOverlay) { _addOverlay.remove(); _addOverlay = null; }
  if (!_addGridActive) return;

  const vw = window.innerWidth, vh = window.innerHeight;
  const cellW = vw / ADD_COLS, cellH = vh / ADD_ROWS;

  _addOverlay = document.createElement('div');
  _addOverlay.id = 'add-grid-overlay';
  _addOverlay.style.cssText = 'position:fixed;inset:0;z-index:8000;background:#333;'
    + 'display:grid;grid-template-columns:repeat(' + ADD_COLS + ',1fr);'
    + 'grid-template-rows:repeat(' + ADD_ROWS + ',1fr);gap:3px;padding:3px;box-sizing:border-box;';

  // Header bar inside overlay
  const hdr = document.createElement('div');
  hdr.style.cssText = 'position:absolute;top:0;left:0;right:0;height:28px;z-index:1;'
    + 'background:#1a2a3a;display:flex;align-items:center;padding:0 10px;'
    + 'font-size:12px;color:#8ef;font-family:sans-serif;gap:12px;';
  hdr.innerHTML = '<span style="font-weight:bold;color:#8ef;">GAdd — Staging Grid</span>'
    + '<span style="color:#adf;">' + addingData.filter(r=>r.show==='1'&&r.cell).length
    + '/9 cells used</span>';

  // Merge button in header
  const mergeBtn = document.createElement('button');
  mergeBtn.textContent = 'Merge → TM';
  mergeBtn.title = 'Merge all staged entries into TM (masterlinks) — dedup by link URL';
  mergeBtn.style.cssText = 'margin-left:auto;padding:3px 10px;font-size:11px;border-radius:4px;'
    + 'border:1px solid #5f5;background:rgba(0,100,0,0.4);color:#5f5;cursor:pointer;';
  mergeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    mergeAddingToML();
  });
  hdr.appendChild(mergeBtn);

  // Clear button
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear All';
  clearBtn.title = 'Clear the staging grid (does NOT remove from masterlinks)';
  clearBtn.style.cssText = 'padding:3px 10px;font-size:11px;border-radius:4px;'
    + 'border:1px solid #f66;background:rgba(100,0,0,0.3);color:#f88;cursor:pointer;';
  clearBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (!confirm('Clear all ' + addingData.filter(r=>r.show==='1').length + ' staged entries?\nThey will NOT be in masterlinks unless already merged.')) return;
    addingData = [];
    saveAdding();
    renderAddGrid();
  });
  hdr.appendChild(clearBtn);
  _addOverlay.appendChild(hdr);

  // Build 3×3 cells
  const occ = occupiedAdding();
  for (let r = 1; r <= ADD_ROWS; r++) {
    for (let c = 1; c <= ADD_COLS; c++) {
      const cs = mkAddCell(r, c);
      const cell = document.createElement('div');
      cell.style.cssText = 'position:relative;background:#fff;border:none;'
        + 'display:flex;flex-direction:column;align-items:center;justify-content:center;'
        + 'overflow:hidden;cursor:pointer;min-height:0;margin-top:' + (r === 1 ? '28px' : '0');

      const entry = addingData.find(it => it.show === '1' && it.cell === cs);
      if (entry) {
        // Filled cell — thumbnail based on link URL (not just VidRange)
        const isYT  = window.isYouTubeLink && window.isYouTubeLink(entry.link);
        const isVim = window.isVimeoLink && window.isVimeoLink(entry.link);
        const isImg = !isYT && !isVim;  // anything else treated as image

        if (isYT) {
          const ytId = (entry.link.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/) || [])[1];
          if (ytId) {
            const img = document.createElement('img');
            img.src = 'https://img.youtube.com/vi/' + ytId + '/mqdefault.jpg';
            img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.75;';
            cell.appendChild(img);
          }
        } else if (isVim) {
          // Vimeo thumbnail via noembed
          const vimId = (entry.link.match(/vimeo\.com\/(\d+)/) || [])[1];
          if (vimId) {
            const img = document.createElement('img');
            img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.75;';
            fetch('https://noembed.com/embed?url=https://vimeo.com/' + vimId)
              .then(function(r) { return r.json(); })
              .then(function(d) { if (d.thumbnail_url) img.src = d.thumbnail_url; })
              .catch(function(){});
            cell.appendChild(img);
          }
        } else if (isImg && entry.VidRange === 'i') {
          // Direct image URL
          const img = document.createElement('img');
          img.src = entry.link;
          img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.8;';
          cell.appendChild(img);
        }

        // Label — hidden for image cells (shows only on load error), visible for video cells
        const lbl = document.createElement('div');
        lbl.style.cssText = 'position:relative;z-index:2;text-align:center;padding:4px;'
          + 'font-size:11px;font-family:sans-serif;color:#111;'
          + 'text-shadow:0 1px 3px rgba(255,255,255,0.8);word-break:break-word;max-width:100%;';
        lbl.textContent = entry.cname || entry.link.slice(0, 28);
        if (isImg) {
          // Hide label until we know image failed
          lbl.style.display = 'none';
          const imgEl = cell.querySelector('img');
          if (imgEl) {
            imgEl.addEventListener('error', function() { lbl.style.display = ''; });
          } else {
            // No img element (e.g. VidRange wasn't 'i') — show label
            lbl.style.display = '';
          }
        }
        cell.appendChild(lbl);

        // Cell label badge
        const badge = document.createElement('div');
        badge.style.cssText = 'position:absolute;top:2px;left:3px;font-size:9px;color:#006;'
          + 'font-family:monospace;z-index:3;';
        badge.textContent = cs;
        cell.appendChild(badge);

        // Tap → open VideoShow / image view
        cell.addEventListener('pointerup', function(e) {
          e.stopPropagation();
          if (window.openFS) window.openFS(entry);
        });

        // Long-press or right-click → delete from staging
        let pressTimer = null;
        cell.addEventListener('pointerdown', function() {
          pressTimer = setTimeout(function() {
            if (confirm('Remove "' + (entry.cname || entry.link.slice(0,40)) + '" from staging grid?')) {
              const idx = addingData.indexOf(entry);
              if (idx !== -1) { addingData.splice(idx, 1); saveAdding(); renderAddGrid(); }
            }
          }, 700);
        });
        cell.addEventListener('pointerup', function() { clearTimeout(pressTimer); });
        cell.addEventListener('pointercancel', function() { clearTimeout(pressTimer); });

      } else {
        // Empty cell
        cell.style.background = '#f0f4f0';
        cell.style.border = 'none';
        cell.innerHTML = '<span style="font-size:22px;color:#888;">+</span>'
          + '<span style="font-size:10px;color:#666;font-family:monospace;">' + cs + '</span>';
        cell.addEventListener('pointerup', function(e) {
          e.stopPropagation();
          const url = prompt('Paste URL for cell ' + cs + ':');
          if (!url || !/^https?:\/\//i.test(url.trim())) return;
          const cname = prompt('Name (optional):') || '';
          const d = new Date();
          const da = [String(d.getFullYear()).slice(-2),
            String(d.getMonth()+1).padStart(2,'0'),
            String(d.getDate()).padStart(2,'0'),
            String(d.getHours()).padStart(2,'0'),
            String(d.getMinutes()).padStart(2,'0'),
            String(d.getSeconds()).padStart(2,'0')].join('.');
          // Detect video URLs — default VidRange to "0 99999" (full video) for YT/Vimeo
          const isVidUrl = (window.isYouTubeLink && window.isYouTubeLink(url.trim()))
            || (window.isVimeoLink && window.isVimeoLink(url.trim()));
          const vidRange = isVidUrl ? '0 99999' : 'i';
          addingData.push({ show:'1', VidRange:vidRange, cell:cs, fit:'fc',
            link:url.trim(), cname, Topic:'', sname:'', attribution:'',
            comment:'', DateAdded:da, Mute:'1' });
          saveAdding();
          renderAddGrid();
        });
      }
      _addOverlay.appendChild(cell);
    }
  }

  document.body.appendChild(_addOverlay);
}

// ── Merge addingData → linksData (masterlinks) ───────────────────────────────
function mergeAddingToML() {
  const toAdd = addingData.filter(function(it) { return it.show === '1' && it.link; });
  if (!toAdd.length) { alert('No entries in staging (TA) to merge.'); return; }

  // Dedup by link URL — skip if already in TM
  const existingLinks = new Set(linksData.map(function(r) { return r.link; }));
  let added = 0, dupes = 0;

  toAdd.forEach(function(it) {
    if (existingLinks.has(it.link)) { dupes++; return; }
    // Assign next free cell in TM grid
    const occ = (typeof occupied === 'function') ? occupied() : new Set();
    let nextCell = '';
    for (let r = 1; r <= ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        const cs = mkCell(r, c);
        if (!occ.has(cs)) { nextCell = cs; break; }
      }
      if (nextCell) break;
    }
    const merged = Object.assign({}, it, { cell: nextCell });
    delete merged._salMeta;
    linksData.push(merged);
    existingLinks.add(it.link);
    added++;
  });

  if (added === 0) {
    alert('All ' + dupes + ' entries already exist in TM. Nothing added.');
    return;
  }

  // Save TM — skipSync=true so Tabulator's current state (may be TA) doesn't overwrite linksData
  if (window.saveData) window.saveData(true);
  else {
    localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
    localStorage.setItem('sal-edited', Date.now().toString());
  }

  // Clear merged entries from addingData
  const mergedLinks = new Set(toAdd.map(function(it) { return it.link; }));
  addingData = addingData.filter(function(it) { return !mergedLinks.has(it.link); });
  saveAdding();

  const msg = '✓ Merged ' + added + ' entries into TM.'
    + (dupes ? ' (' + dupes + ' duplicates skipped)' : '')
    + '\n\nPush to GitHub from the hamburger menu to make permanent.';
  alert(msg);

  renderAddGrid();
  if (window.renderGrid) window.renderGrid();
  // Refresh TA table if open
  if (window._salTab && window._tabMode === 'adding' && window.openTable) window.openTable(true);
}
// Expose for TA toolbar button
window.mergeAddingToML = mergeAddingToML;

// ── Toggle GAdd overlay ───────────────────────────────────────────────────────
window.toggleAddGrid = function() {
  _addGridActive = !_addGridActive;
  window._addGridActive = _addGridActive;
  renderAddGrid();

  // If the table modal is open, refresh it with explicit mode (avoids timing issue)
  const modal = document.getElementById('jsonModal');
  if (modal && modal.classList.contains('open') && window.openTable) {
    window.openTable(_addGridActive);  // pass mode explicitly
  }

  // Update A button appearance
  const aBtn = document.getElementById('sal-add-btn');
  if (aBtn) {
    aBtn.style.background = _addGridActive ? 'rgba(0,80,20,0.9)' : 'rgba(0,20,50,0.85)';
    aBtn.style.borderColor = _addGridActive ? '#5f5' : '#4af';
    aBtn.style.color       = _addGridActive ? '#5f5' : '#8ef';
  }
};

// ── LP (LinkPaste) always imports to TA (staging) ────────────────────────────
// TA is the provisional table — always paste here, then merge to TM when ready.
// This is true whether GA overlay is active or not.
window.flImportTarget = function() { return 'adding'; };

// ── Window resize ─────────────────────────────────────────────────────────────
window.addEventListener('resize', function() {
  if (_addGridActive) renderAddGrid();
});

// ── Init on page load ─────────────────────────────────────────────────────────
initAdding();
