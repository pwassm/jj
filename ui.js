// Version 10: Tabulator replaces custom HTML table editor
window.openFS = function(it) {
  if(!it.link) return;
  const fs=document.createElement('div');
  fs.id='fs-overlay';
  fs.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';

  const isVidNode = window.parseVideoAsset && window.parseVideoAsset(it.asset) !== null;
  if (isVidNode) {
    const vidHost = document.createElement('div');
    vidHost.id = 'fs-vid-' + it.cell;
    vidHost.style.cssText = 'width:100%; height:100%; pointer-events:none;';
    fs.appendChild(vidHost);

    const parsed = window.parseVideoAsset(it.asset);
    if (parsed) {
      if (window.isYouTubeLink(it.link) && window.mountYouTubeClip) {
        window.mountYouTubeClip(vidHost, it.link, parsed.start, parsed.dur, it.Mute !== '0');
      } else if (window.isVimeoLink(it.link) && window.mountVimeoClip) {
        window.mountVimeoClip(vidHost, it.link, parsed.start, parsed.dur, it.Mute !== '0');
      }
    }
  } else {
    const img=document.createElement('img');
    img.src=it.link;
    if (window.isPortrait) {
      img.style.cssText='max-width:95vh;max-height:95vw;object-fit:contain;transform:rotate(90deg);';
    } else {
      img.style.cssText='max-width:95vw;max-height:95vh;object-fit:contain;';
    }
    fs.appendChild(img);
  }

  setTimeout(() => {
    fs.addEventListener('pointerup', e => {
      e.preventDefault();
      e.stopPropagation();
      if (isVidNode && fs.children[0]) {
         if (window.stopCellVideoLoop) window.stopCellVideoLoop(fs.children[0].id);
      }
      fs.remove();
    });
  }, 100);

  document.body.appendChild(fs);
};

// menu
function closeMenu(){
  menuPanel.classList.remove('open');
  menuBtn.classList.remove('open');
  document.getElementById('settingsPanel').classList.remove('open');
  document.getElementById('miSettings').textContent='Settings \u25b8';
}
menuBtn.addEventListener('pointerup',e=>{
  e.stopPropagation();
  const o=menuPanel.classList.toggle('open');
  menuBtn.classList.toggle('open',o);
  if(!o) document.getElementById('settingsPanel').classList.remove('open');
});
menuPanel.addEventListener('pointerup',e=>e.stopPropagation());
document.addEventListener('pointerup',()=>{ if(menuPanel.classList.contains('open')) closeMenu(); });

let rawJsonMode = false;
let recycleData = JSON.parse(localStorage.getItem('seeandlearn-recycle') || '[]');

// ─── Tabulator instance ─────────────────────────────────────────────────────
let tabulatorTable = null;
window.tabulatorTable = null; // kept in sync below

// Collect all cname/v.author values for autocomplete
function getCnameList() {
  const s = new Set();
  linksData.forEach(r => { if(r.cname) s.add(r.cname); });
  return Array.from(s).sort();
}
function getVAuthorList() {
  const s = new Set();
  linksData.forEach(r => { if(r['v.author']) s.add(r['v.author']); });
  return Array.from(s).sort();
}

window.renderTableEditor = function() {
  const container = document.getElementById('tableEditor');
  if (!container) return;

  // Sync from Tabulator back to linksData before rebuilding (if already mounted)
  if (tabulatorTable) {
    tabulatorTable.destroy();
    tabulatorTable = null;
    window.tabulatorTable = null;
  }

  // Derive column list from data
  const keys = new Set();
  linksData.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
  let colKeys = Array.from(keys);
  if (colKeys.length === 0) {
    colKeys = ['show','asset','cell','fit','link','cname','sname','v.title','v.author','attribution','comment','Mute','Portrait'];
  }

  // Build Tabulator column definitions
  const columns = colKeys.map(k => {
    const base = {
      title: k,
      field: k,
      headerSort: true,
      editor: true,         // default: plain text editor
      resizable: true,
      minWidth: 80,
      width: 150,
      headerContextMenu: [
        {
          label: '✏️ Rename',
          action: function(e, col) {
            const oldK = col.getField();
            const newK = prompt('Rename column:', oldK);
            if (!newK || newK === oldK) return;
            // rename in data
            tabulatorTable.getRows().forEach(row => {
              const d = row.getData();
              if (d.hasOwnProperty(oldK)) {
                d[newK] = d[oldK];
                delete d[oldK];
                row.update(d);
              }
            });
            syncTabulatorToLinksData();
            renderTableEditor();
          }
        },
        {
          label: '❌ Delete Column',
          action: function(e, col) {
            const field = col.getField();
            if (!confirm('Delete column "' + field + '" from ALL rows?')) return;
            tabulatorTable.deleteColumn(field);
            syncTabulatorToLinksData();
          }
        },
        {
          label: '⧉ Duplicate Column',
          action: function(e, col) {
            const field = col.getField();
            const newK = prompt('New column name (copy of "' + field + '"):', field + '_copy');
            if (!newK || newK === field) return;
            tabulatorTable.getRows().forEach(row => {
              const d = row.getData();
              d[newK] = d[field] !== undefined ? d[field] : '';
              row.update(d);
            });
            syncTabulatorToLinksData();
            renderTableEditor();
          }
        }
      ]
    };

    if (k === 'cname') {
      return Object.assign(base, {
        editor: 'list',
        editorParams: {
          values: getCnameList(),
          autocomplete: true,
          freetext: true,
          allowEmpty: true,
          listOnEmpty: false,
        }
      });
    }
    if (k === 'v.author') {
      return Object.assign(base, {
        editor: 'list',
        editorParams: {
          values: getVAuthorList(),
          autocomplete: true,
          freetext: true,
          allowEmpty: true,
          listOnEmpty: false,
        }
      });
    }
    if (k === 'show' || k === 'Mute' || k === 'Portrait') {
      return Object.assign(base, { width: 60, minWidth: 50 });
    }
    if (k === 'cell') {
      return Object.assign(base, { width: 60, minWidth: 50 });
    }
    if (k === 'asset' || k === 'fit') {
      return Object.assign(base, { width: 80 });
    }
    if (k === 'link') {
      return Object.assign(base, { width: 260 });
    }
    return base;
  });

  // Prepend row-actions column
  columns.unshift({
    title: '',
    field: '__actions',
    width: 70,
    minWidth: 70,
    resizable: false,
    headerSort: false,
    frozen: true,
    formatter: function(cell) {
      const idx = cell.getRow().getPosition() - 1;
      return `<button onclick="window._tabDelRow(this)" data-pos="${idx}" style="color:#f66;background:none;border:none;cursor:pointer;font-size:15px;" title="Delete">✖</button>
              <button onclick="window._tabMoveRow(this,-1)" data-pos="${idx}" style="color:#aaa;background:none;border:none;cursor:pointer;font-size:13px;" title="Move Up">▲</button>
              <button onclick="window._tabMoveRow(this,1)" data-pos="${idx}" style="color:#aaa;background:none;border:none;cursor:pointer;font-size:13px;" title="Move Down">▼</button>`;
    },
    cellClick: function() {}
  });

  tabulatorTable = new Tabulator('#tableEditor', {
    data: linksData.map(r => Object.assign({}, r)),
    columns: columns,
    layout: 'fitDataFill',
    movableColumns: true,
    selectable: true,
    selectableRangeMode: 'click',
    history: true,
    persistence: false,
    height: '100%',
    theme: 'midnight',
    rowFormatter: function(row) {
      row.getElement().style.background = '';
    },
    cellEdited: function(cell) {
      const field = cell.getField();
      if (field === '__actions') return;
      syncTabulatorToLinksData();
    },
    columnMoved: function() {
      syncTabulatorToLinksData();
    },
    rowSelectionChanged: function(data, rows) {
      const btn = document.getElementById('deleteSelectedRows');
      if (btn) btn.style.display = rows.length > 0 ? 'block' : 'none';
    }
  });
  window.tabulatorTable = tabulatorTable;

  // Delete/move row helpers called from formatter buttons
  window._tabDelRow = function(btn) {
    const row = tabulatorTable.getRows()[parseInt(btn.dataset.pos)];
    if (!row) return;
    if (!confirm('Delete this row?')) return;
    const d = row.getData();
    recycleData.push(d);
    localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
    row.delete();
    syncTabulatorToLinksData();
    tabulatorTable.redraw(true);
  };
  window._tabMoveRow = function(btn, dir) {
    const rows = tabulatorTable.getRows();
    const idx = parseInt(btn.dataset.pos);
    const target = idx + dir;
    if (target < 0 || target >= rows.length) return;
    if (dir === -1) rows[idx].moveTo(rows[target], true);
    else rows[idx].moveTo(rows[target], false);
    syncTabulatorToLinksData();
    tabulatorTable.redraw(true);
  };
};

function syncTabulatorToLinksData() {
  if (!tabulatorTable) return;
  const rows = tabulatorTable.getData();
  // Remove __actions pseudo-field
  linksData = rows.map(r => {
    const clean = Object.assign({}, r);
    delete clean.__actions;
    return clean;
  });
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
}

// ─── Top toolbar button wiring ──────────────────────────────────────────────

window.addRow = function() {
  if (!tabulatorTable) return;
  const newRow = {};
  // Build keys from first row or existing columns
  const cols = tabulatorTable.getColumns().map(c => c.getField()).filter(f => f !== '__actions');
  cols.forEach(k => newRow[k] = '');
  tabulatorTable.addRow(newRow);
  syncTabulatorToLinksData();
};

window.duplicateActiveRow = function() {
  if (!tabulatorTable) return;
  const selected = tabulatorTable.getSelectedRows();
  const rows = tabulatorTable.getRows();
  let srcRow = selected.length > 0 ? selected[0] : rows[rows.length - 1];
  if (!srcRow) { alert('No row to duplicate.'); return; }
  const newRow = Object.assign({}, srcRow.getData());
  delete newRow.__actions;
  newRow.cell = window.getFirstEmptyCell ? window.getFirstEmptyCell() : '';
  tabulatorTable.addRow(newRow, false, srcRow);
  syncTabulatorToLinksData();
  tabulatorTable.redraw(true);
  // Flash the button
  const btn = document.getElementById('btn-duplicate-row-action');
  if (btn) {
    const oldBg = btn.style.background;
    btn.style.background = '#fff'; btn.style.color = '#000';
    setTimeout(() => { btn.style.background = oldBg; btn.style.color = '#eaf'; }, 200);
  }
};

window.duplicateActiveColumn = function() {
  if (!tabulatorTable) return;
  const cols = tabulatorTable.getColumns().map(c => c.getField()).filter(f => f !== '__actions');
  const field = prompt('Column to duplicate (name):', cols[cols.length - 1] || '');
  if (!field || !cols.includes(field)) { alert('Column not found.'); return; }
  const newK = prompt('New column name:', field + '_copy');
  if (!newK || newK === field) return;
  tabulatorTable.getRows().forEach(row => {
    const d = row.getData();
    d[newK] = d[field] !== undefined ? d[field] : '';
    row.update(d);
  });
  syncTabulatorToLinksData();
  renderTableEditor();
};

document.getElementById('addTableItem').addEventListener('click', window.addRow);

document.getElementById('btn-duplicate-row-action').addEventListener('click', function() {
  window.duplicateActiveRow();
});

document.getElementById('btn-duplicate-col-action').addEventListener('click', function() {
  window.duplicateActiveColumn();
});

document.getElementById('deleteSelectedRows').addEventListener('click', () => {
  if (!tabulatorTable) return;
  const selected = tabulatorTable.getSelectedRows();
  if (selected.length === 0) return;
  if (!confirm(`Delete ${selected.length} selected rows?`)) return;
  const deleted = selected.map(r => { const d = Object.assign({}, r.getData()); delete d.__actions; return d; });
  deleted.forEach(d => recycleData.push(d));
  localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
  selected.forEach(r => r.delete());
  syncTabulatorToLinksData();
  document.getElementById('deleteSelectedRows').style.display = 'none';
});

document.getElementById('toggleRawJson').addEventListener('click', function() {
  rawJsonMode = !rawJsonMode;
  this.textContent = rawJsonMode ? 'Show Visual Editor' : 'Show Raw JSON';
  if (rawJsonMode) {
    syncTabulatorToLinksData();
    document.getElementById('jsonText').value = JSON.stringify(linksData, null, 2);
    document.getElementById('tableEditor').style.display = 'none';
    document.getElementById('jsonText').style.display = 'block';
    document.getElementById('addTableItem').style.display = 'none';
    document.getElementById('deleteSelectedRows').style.display = 'none';
    document.getElementById('btn-duplicate-row-action').style.display = 'none';
    document.getElementById('btn-duplicate-col-action').style.display = 'none';
  } else {
    try { linksData = JSON.parse(document.getElementById('jsonText').value); } catch(e) { alert('Invalid JSON'); rawJsonMode = true; return; }
    document.getElementById('tableEditor').style.display = 'block';
    document.getElementById('jsonText').style.display = 'none';
    document.getElementById('addTableItem').style.display = 'block';
    document.getElementById('btn-duplicate-row-action').style.display = 'block';
    document.getElementById('btn-duplicate-col-action').style.display = 'block';
    renderTableEditor();
  }
});

document.getElementById('miTables').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  if (typeof isAdmin === 'function' && !isAdmin()) { alert('Admin privileges required.'); return; }
  rawJsonMode = false;
  document.getElementById('toggleRawJson').textContent = 'Show Raw JSON';
  document.getElementById('tableEditor').style.display = 'block';
  document.getElementById('jsonText').style.display = 'none';
  document.getElementById('addTableItem').style.display = 'block';
  document.getElementById('btn-duplicate-row-action').style.display = 'block';
  document.getElementById('btn-duplicate-col-action').style.display = 'block';
  renderTableEditor();
  document.getElementById('jsonStatus').textContent = '';
  document.getElementById('jsonModal').classList.add('open');
});

document.getElementById('miSaveJson').addEventListener('pointerup', e => { e.stopPropagation(); closeMenu(); saveJson(); });
document.getElementById('miHelp').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  alert('SeeAndLearn\n\nTap cell image -> fullscreen\nTap empty cell -> quick-fill (Ctrl+S to save)\nHamburger -> Tables (JSON editor), Save JSON (Ctrl+Alt+S), Settings');
});
document.getElementById('miSettings').addEventListener('pointerup', e => {
  e.stopPropagation();
  const sp = document.getElementById('settingsPanel');
  const o = sp.classList.toggle('open');
  e.currentTarget.textContent = o ? 'Settings \u25be' : 'Settings \u25b8';
});

function syncFit(){
  document.getElementById('togFit').checked=(fitMode==='ei');
  document.getElementById('fitLabel').textContent=fitMode==='ei'?'Img: Entire Image':'Img: Fill Cell';
}
document.getElementById('togFit').addEventListener('change',function(){
  fitMode=this.checked?'ei':'fc'; localStorage.setItem('mlynx-fit',fitMode); syncFit(); render();
});
document.getElementById('togCellLbl').addEventListener('change',function(){ showCellLbl=this.checked; render(); });
document.getElementById('togCname').addEventListener('change',function(){ showCname=this.checked; render(); });

// Ctrl+Alt+S global
document.addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.altKey&&e.key.toLowerCase()==='s'){ e.preventDefault(); saveJson(); }
});

// Ctrl+D in table modal
window.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    const jsonMod = document.getElementById('jsonModal');
    if (jsonMod && jsonMod.classList.contains('open')) {
      e.preventDefault();
      e.stopPropagation();
      window.duplicateActiveRow();
    }
  }
}, true);

// Save JSON
function saveJson(){
  if (tabulatorTable) syncTabulatorToLinksData();
  localStorage.setItem('mlynx-links', JSON.stringify(linksData));
  const blob = new Blob([JSON.stringify(linksData, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'links.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
}

window.triggerDownload = async function(filename, data) {
  const jsonText = JSON.stringify(data, null, 2);
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        id: 'seeandlearn-backup-folder',
        startIn: 'documents',
        suggestedName: filename,
        types: [{ description: 'JSON File', accept: {'application/json': ['.json']} }]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonText);
      await writable.close();
      return;
    }
  } catch(e) {
    if(e.name !== 'AbortError') console.error(e);
    return;
  }
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Quick-fill
let qfCell='';
document.getElementById('qfDesktop').style.display=ISMOBILE?'none':'block';

// ─── Get Video Info ──────────────────────────────────────────────────────────
window.fillEmptyVideoInfo = async function() {
  if (tabulatorTable) syncTabulatorToLinksData();
  const btn = document.getElementById('btn-get-vid-info');
  if (btn) btn.textContent = 'Fetching...';
  let updated = false;

  const promises = linksData.map(async (row) => {
    const isVid = row.asset && window.parseVideoAsset && window.parseVideoAsset(row.asset) !== null;
    if (isVid && row.link && row.link.match(/^https?:/i)) {
      if (!row['v.title'] || !row['v.author'] || !row.Portrait) {
        try {
          const res = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(row.link));
          const data = await res.json();
          if (data.title && !row['v.title']) { row['v.title'] = data.title; updated = true; }
          if (data.author_name && !row['v.author']) { row['v.author'] = data.author_name; updated = true; }
          if (data.width && data.height && (!row.Portrait || row.Portrait === '')) {
            row.Portrait = data.width < data.height ? '1' : '0'; updated = true;
          }
        } catch(e) {}
      }
    }
  });

  await Promise.all(promises);
  if (updated) {
    localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
    if (window.renderTableEditor) window.renderTableEditor();
  }
  if (btn) btn.textContent = 'Get Video Info';
};

// ─── Helpers used by other modules ──────────────────────────────────────────
window.getFirstEmptyCell = function() {
  try {
    const occ = new Set();
    linksData.forEach(r => { if(r && r.cell) occ.add(String(r.cell).toUpperCase()); });
    const letters = 'ABCDE';
    for(let r=1; r<=5; r++) {
      for(let c=0; c<5; c++) {
        let cs = r + letters[c];
        if(!occ.has(cs)) return cs;
      }
    }
  } catch(e) { console.error(e); }
  return '';
};

// isColResizing kept as no-op so main.js Esc handler doesn't throw
let isColResizing = false;
window.stopColResize = function() {};
