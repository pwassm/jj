// Version 10: Tabulator, correct buttons, sticky col widths, autocomplete

// ─── Fullscreen overlay ──────────────────────────────────────────────────────
window.openFS = function(it) {
  if(!it.link) return;
  const fs = document.createElement('div');
  fs.id = 'fs-overlay';
  fs.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';

  const isVidNode = window.parseVideoAsset && window.parseVideoAsset(it.asset) !== null;
  if (isVidNode) {
    const vidHost = document.createElement('div');
    vidHost.id = 'fs-vid-' + it.cell;
    vidHost.style.cssText = 'width:100%; height:100%; pointer-events:none;';
    fs.appendChild(vidHost);
    const parsed = window.parseVideoAsset(it.asset);
    if (parsed) {
      if (window.isYouTubeLink(it.link) && window.mountYouTubeClip)
        window.mountYouTubeClip(vidHost, it.link, parsed.start, parsed.dur, it.Mute !== '0');
      else if (window.isVimeoLink(it.link) && window.mountVimeoClip)
        window.mountVimeoClip(vidHost, it.link, parsed.start, parsed.dur, it.Mute !== '0');
    }
  } else {
    const img = document.createElement('img');
    img.src = it.link;
    img.style.cssText = window.isPortrait
      ? 'max-width:95vh;max-height:95vw;object-fit:contain;transform:rotate(90deg);'
      : 'max-width:95vw;max-height:95vh;object-fit:contain;';
    fs.appendChild(img);
  }

  setTimeout(() => {
    fs.addEventListener('pointerup', e => {
      e.preventDefault(); e.stopPropagation();
      if (isVidNode && fs.children[0] && window.stopCellVideoLoop)
        window.stopCellVideoLoop(fs.children[0].id);
      fs.remove();
    });
  }, 100);
  document.body.appendChild(fs);
};

// ─── Menu ────────────────────────────────────────────────────────────────────
function closeMenu() {
  menuPanel.classList.remove('open');
  menuBtn.classList.remove('open');
  document.getElementById('settingsPanel').classList.remove('open');
  document.getElementById('miSettings').textContent = 'Settings \u25b8';
}
menuBtn.addEventListener('pointerup', e => {
  e.stopPropagation();
  const o = menuPanel.classList.toggle('open');
  menuBtn.classList.toggle('open', o);
  if (!o) document.getElementById('settingsPanel').classList.remove('open');
});
menuPanel.addEventListener('pointerup', e => e.stopPropagation());
document.addEventListener('pointerup', () => { if (menuPanel.classList.contains('open')) closeMenu(); });

// ─── State ───────────────────────────────────────────────────────────────────
let rawJsonMode = false;
let tableKeys   = [];

// colWidths stored in localStorage as pixels. Default = 30 chars ≈ 210px (7px/char).
// Minimum = 1 char ≈ 7px (Tabulator enforces via minWidth).
const CHAR_W    = 7;   // approximate px per character in 13px sans-serif
const COL_DEFAULT_PX = 30 * CHAR_W;  // 210
const COL_MIN_PX     = 1  * CHAR_W;  // 7

let colWidths   = JSON.parse(localStorage.getItem('seeandlearn-colWidths') || '{}');
let recycleData = JSON.parse(localStorage.getItem('seeandlearn-recycle')   || '[]');

// isColResizing kept for main.js Esc handler compatibility
let isColResizing = false;
window.stopColResize = function() {};

// ─── Table-key helpers ───────────────────────────────────────────────────────
function initTableKeys() {
  const keys = new Set();
  linksData.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
  tableKeys = Array.from(keys);
  if (tableKeys.length === 0)
    tableKeys = ['show','asset','cell','fit','link','cname','sname','v.title','v.author','attribution','comment','Mute','Portrait'];
}

// ─── Autocomplete value lists ─────────────────────────────────────────────────
function getDistinctValues(field) {
  const s = new Set();
  linksData.forEach(r => { const v = r[field]; if (v !== undefined && v !== null && String(v).trim()) s.add(String(v)); });
  return Array.from(s).sort();
}

// ─── Sync Tabulator → linksData ──────────────────────────────────────────────
function syncFromTabulator() {
  if (!window.tabulatorTable) return;
  linksData = window.tabulatorTable.getData();
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
}

// ─── Main Tabulator init ──────────────────────────────────────────────────────
window.renderTableEditor = function() {
  const container = document.getElementById('tableEditor');
  if (!container) return;
  if (!tableKeys.length) initTableKeys();

  // Destroy previous instance
  if (window.tabulatorTable) {
    try { window.tabulatorTable.destroy(); } catch(e) {}
    window.tabulatorTable = null;
  }
  container.innerHTML = '';

  // Build autocomplete lists from current data
  const cnameList  = getDistinctValues('cname');
  const snameList  = getDistinctValues('sname');
  const vAuthorList= getDistinctValues('v.author');

  // Header right-click menu (rename / delete / duplicate)
  const headerMenu = [
    {
      label: '✏ ColNameEdit',
      action(e, col) {
        const oldK = col.getField();
        const newK = prompt('Rename column:', oldK);
        if (!newK || newK === oldK) return;
        if (tableKeys.includes(newK)) { alert('Name already exists.'); return; }
        tableKeys[tableKeys.indexOf(oldK)] = newK;
        linksData.forEach(row => { row[newK] = row[oldK] !== undefined ? row[oldK] : ''; delete row[oldK]; });
        window.renderTableEditor();
      }
    },
    {
      label: '⧉ ColDupNext',
      action(e, col) {
        const oldK = col.getField();
        const newK = prompt('New column name (copy of "' + oldK + '"):', oldK + '_copy');
        if (!newK) return;
        let finalK = newK, n = 2;
        while (tableKeys.includes(finalK)) finalK = newK + n++;
        const idx = tableKeys.indexOf(oldK);
        tableKeys.splice(idx + 1, 0, finalK);
        linksData.forEach(row => { row[finalK] = row[oldK] !== undefined ? row[oldK] : ''; });
        window.renderTableEditor();
      }
    },
    {
      label: '✖ ColDelete',
      action(e, col) {
        const k = col.getField();
        if (!confirm('Delete column "' + k + '" from ALL rows?')) return;
        tableKeys = tableKeys.filter(x => x !== k);
        linksData.forEach(row => delete row[k]);
        window.renderTableEditor();
      }
    }
  ];

  // Column definitions
  const cols = [];

  // ── Row-delete column (no title/header — pure action) ──
  cols.push({
    title: 'Del',
    field: '_del',
    width: 36, minWidth: 36,
    resizable: false,
    headerSort: false,
    hozAlign: 'center',
    formatter: () => "<span style='color:#f55;font-size:16px;cursor:pointer;line-height:1;'>✕</span>",
    cellClick(e, cell) {
      if (!confirm('Delete this row?')) return;
      const data = cell.getRow().getData();
      recycleData.push(data);
      localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
      const idx = linksData.findIndex(r => r === data);
      if (idx > -1) linksData.splice(idx, 1);
      cell.getRow().delete();
      localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
    }
  });

  // ── Row-selection column ──
  cols.push({
    formatter: 'rowSelection',
    titleFormatter: 'rowSelection',
    width: 36, minWidth: 36,
    resizable: false,
    headerSort: false,
    hozAlign: 'center',
    cellClick(e, cell) { cell.getRow().toggleSelect(); }
  });

  // ── Move up/down column ──
  cols.push({
    title: '↕',
    field: '_move',
    width: 46, minWidth: 46,
    resizable: false,
    headerSort: false,
    hozAlign: 'center',
    formatter: () => "<span style='cursor:pointer;color:#aaa;font-size:13px;'>▲▼</span>",
    cellClick(e, cell) {
      // clicked ▲ if y < mid of cell, else ▼
      const rect = cell.getElement().getBoundingClientRect();
      const mid  = rect.top + rect.height / 2;
      const dir  = e.clientY < mid ? -1 : 1;
      const rows = window.tabulatorTable.getRows();
      const pos  = cell.getRow().getPosition(true) - 1; // 0-based
      const tgt  = pos + dir;
      if (tgt < 0 || tgt >= rows.length) return;
      // swap in linksData
      const tmp = linksData[pos]; linksData[pos] = linksData[tgt]; linksData[tgt] = tmp;
      localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
      window.renderTableEditor();
    }
  });

  // ── Data columns ──
  tableKeys.forEach(k => {
    const w = colWidths[k] !== undefined ? colWidths[k] : COL_DEFAULT_PX;

    let colDef = {
      title: k,          // exact field name — no decoration
      field: k,
      editor: 'input',
      headerSort: true,
      headerMenu: headerMenu,
      width: w,
      minWidth: COL_MIN_PX,
      resizable: true,
      overflow: 'hidden',
      headerTooltip: k,
      cellEdited(cell) {
        // Write edit straight back to the live linksData object
        const row = cell.getRow().getData();
        const field = cell.getField();
        // getData() returns the live object when reactiveData:true
        localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
      }
    };

    // Autocomplete for cname, sname, v.author
    if (k === 'cname') {
      colDef.editor = 'list';
      colDef.editorParams = {
        values: cnameList,
        autocomplete: true,
        freetext: true,
        allowEmpty: true,
        listOnEmpty: true,
        filterDelay: 100
      };
    } else if (k === 'sname') {
      colDef.editor = 'list';
      colDef.editorParams = {
        values: snameList,
        autocomplete: true,
        freetext: true,
        allowEmpty: true,
        listOnEmpty: true,
        filterDelay: 100
      };
    } else if (k === 'v.author') {
      colDef.editor = 'list';
      colDef.editorParams = {
        values: vAuthorList,
        autocomplete: true,
        freetext: true,
        allowEmpty: true,
        listOnEmpty: true,
        filterDelay: 100
      };
    }

    cols.push(colDef);
  });

  // ─── Tabulator init ───────────────────────────────────────────────────────
  window.tabulatorTable = new Tabulator(container, {
    data: linksData,
    reactiveData: true,
    columns: cols,
    layout: 'fitDataNoStretch',
    selectableRows: true,
    history: false,
    movableColumns: false,   // column reorder via our buttons only
    height: '100%',

    // Save column width when user drags resize handle
    columnResized(column) {
      const field = column.getField();
      if (!field || field.startsWith('_')) return;
      colWidths[field] = column.getWidth();
      localStorage.setItem('seeandlearn-colWidths', JSON.stringify(colWidths));
    },

    // Show/hide Delete Selected button based on selection
    rowSelectionChanged(data, rows) {
      const btn = document.getElementById('deleteSelectedRows');
      if (btn) btn.style.display = rows.length > 0 ? 'inline-block' : 'none';
    }
  });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
window.getFirstEmptyCell = function() {
  const occ = new Set();
  linksData.forEach(r => { if (r && r.cell) occ.add(String(r.cell).toLowerCase()); });
  const letters = 'abcde';
  for (let r = 1; r <= 5; r++)
    for (let c = 0; c < 5; c++) {
      const cs = r + letters[c];
      if (!occ.has(cs)) return cs;
    }
  return '';
};

// ─── Toolbar button actions ────────────────────────────────────────────────
//
// RowAddNext  — insert empty row after last selected (or at top if nothing selected)
// RowAddBottom— append empty row at bottom
// RowDupNext  — duplicate selected row(s), insert after, assign new cell
// RowDelete   — delete selected rows (with confirm)
// ColAddNext  — add new column after current (prompt for name)
// ColDupNext  — duplicate column (via header menu or button)
// ColNameEdit — rename column (via header menu or button)
// ColDelete   — delete column (via header menu or button)
// ExportChosen— download links.json of selected rows (or all if none selected)
// Import      — import JSON file and merge into linksData

document.getElementById('addTableItem').addEventListener('click', function() {
  // RowAddNext — add row at top (before first selected, or at very top)
  if (!window.tabulatorTable) return;
  const newRow = {};
  tableKeys.forEach(k => newRow[k] = '');
  window.tabulatorTable.addRow(newRow, true); // true = top
  linksData.unshift(newRow);
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
});

document.getElementById('btn-row-add-bottom').addEventListener('click', function() {
  // RowAddBottom — append at bottom
  if (!window.tabulatorTable) return;
  const newRow = {};
  tableKeys.forEach(k => newRow[k] = '');
  window.tabulatorTable.addRow(newRow, false); // false = bottom
  linksData.push(newRow);
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
});

document.getElementById('btn-duplicate-row-action').addEventListener('click', function() {
  // RowDupNext — duplicate selected row(s), insert right after, new cell id
  if (!window.tabulatorTable) return;
  const sel = window.tabulatorTable.getSelectedRows();
  if (!sel.length) { alert('Select a row to duplicate first.'); return; }
  // Process in reverse order so inserts stay in right place
  [...sel].reverse().forEach(row => {
    const srcData = row.getData();
    const newRow  = JSON.parse(JSON.stringify(srcData));
    newRow.cell   = window.getFirstEmptyCell();
    const idx = linksData.indexOf(srcData);
    if (idx > -1) {
      linksData.splice(idx + 1, 0, newRow);
    } else {
      linksData.push(newRow);
    }
  });
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  window.renderTableEditor();
});

document.getElementById('deleteSelectedRows').addEventListener('click', function() {
  // RowDelete
  if (!window.tabulatorTable) return;
  const sel = window.tabulatorTable.getSelectedRows();
  if (!sel.length) { alert('Select rows to delete first.'); return; }
  if (!confirm('Delete ' + sel.length + ' selected row(s)?')) return;
  const deleted = [];
  sel.forEach(row => {
    const d = row.getData();
    deleted.push(d);
    recycleData.push(d);
    const idx = linksData.indexOf(d);
    if (idx > -1) linksData.splice(idx, 1);
    row.delete();
  });
  localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  this.style.display = 'none';
});

document.getElementById('btn-col-add').addEventListener('click', function() {
  // ColAddNext — add a new empty column
  const newK = prompt('New column name:');
  if (!newK) return;
  if (tableKeys.includes(newK)) { alert('Column already exists.'); return; }
  // Insert after last selected column, or at end
  tableKeys.push(newK);
  linksData.forEach(row => { if (row[newK] === undefined) row[newK] = ''; });
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  window.renderTableEditor();
});

document.getElementById('btn-duplicate-col-action').addEventListener('click', function() {
  // ColDupNext
  if (!window.tabulatorTable) return;
  const cols = window.tabulatorTable.getColumns().map(c => c.getField()).filter(f => f && !f.startsWith('_'));
  const src = prompt('Column to duplicate:\n' + cols.join(', '));
  if (!src || !tableKeys.includes(src)) { if (src) alert('Column "' + src + '" not found.'); return; }
  const newK = prompt('New column name:', src + '_copy');
  if (!newK) return;
  let finalK = newK, n = 2;
  while (tableKeys.includes(finalK)) finalK = newK + n++;
  const idx = tableKeys.indexOf(src);
  tableKeys.splice(idx + 1, 0, finalK);
  linksData.forEach(row => { row[finalK] = row[src] !== undefined ? row[src] : ''; });
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  window.renderTableEditor();
});

document.getElementById('btn-col-rename').addEventListener('click', function() {
  // ColNameEdit
  if (!window.tabulatorTable) return;
  const cols = tableKeys;
  const oldK = prompt('Column to rename:\n' + cols.join(', '));
  if (!oldK || !tableKeys.includes(oldK)) { if (oldK) alert('Column "' + oldK + '" not found.'); return; }
  const newK = prompt('New name for "' + oldK + '":', oldK);
  if (!newK || newK === oldK) return;
  if (tableKeys.includes(newK)) { alert('Name already exists.'); return; }
  tableKeys[tableKeys.indexOf(oldK)] = newK;
  linksData.forEach(row => { row[newK] = row[oldK] !== undefined ? row[oldK] : ''; delete row[oldK]; });
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  window.renderTableEditor();
});

document.getElementById('btn-col-delete').addEventListener('click', function() {
  // ColDelete
  if (!window.tabulatorTable) return;
  const cols = tableKeys;
  const k = prompt('Column to delete:\n' + cols.join(', '));
  if (!k || !tableKeys.includes(k)) { if (k) alert('Column "' + k + '" not found.'); return; }
  if (!confirm('Delete column "' + k + '" from ALL rows?')) return;
  tableKeys = tableKeys.filter(x => x !== k);
  linksData.forEach(row => delete row[k]);
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  window.renderTableEditor();
});

document.getElementById('btn-export-chosen').addEventListener('click', function() {
  // ExportChosen — download just selected rows (or all if none selected)
  syncFromTabulator();
  const sel = window.tabulatorTable ? window.tabulatorTable.getSelectedRows() : [];
  const data = sel.length > 0 ? sel.map(r => r.getData()) : linksData;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = sel.length > 0 ? 'links_selected.json' : 'links.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
});

document.getElementById('btn-import').addEventListener('click', function() {
  // Import — pick a JSON file and merge into linksData
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) { alert('Expected a JSON array.'); return; }
        const merge = confirm('Merge imported rows with existing data?\nOK = merge, Cancel = replace all.');
        if (merge) {
          imported.forEach(r => linksData.push(r));
        } else {
          linksData.length = 0;
          imported.forEach(r => linksData.push(r));
        }
        initTableKeys();
        localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
        window.renderTableEditor();
      } catch(e) { alert('Invalid JSON: ' + e.message); }
    };
    reader.readAsText(file);
  };
  inp.click();
});

// Ctrl+D inside table modal — duplicate active/selected row
window.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    const jsonMod = document.getElementById('jsonModal');
    if (jsonMod && jsonMod.classList.contains('open')) {
      e.preventDefault(); e.stopPropagation();
      document.getElementById('btn-duplicate-row-action').click();
    }
  }
}, true);

// ─── Raw JSON toggle ──────────────────────────────────────────────────────────
document.getElementById('toggleRawJson').addEventListener('click', function() {
  rawJsonMode = !rawJsonMode;
  this.textContent = rawJsonMode ? 'Show Visual Editor' : 'Show Raw JSON';
  if (rawJsonMode) {
    syncFromTabulator();
    document.getElementById('jsonText').value = JSON.stringify(linksData, null, 2);
    document.getElementById('tableEditor').style.display  = 'none';
    document.getElementById('jsonText').style.display     = 'block';
    document.getElementById('tableToolbar').style.display = 'none';
  } else {
    try { linksData = JSON.parse(document.getElementById('jsonText').value); }
    catch(e) { alert('Invalid JSON'); rawJsonMode = true; return; }
    document.getElementById('tableEditor').style.display  = 'block';
    document.getElementById('jsonText').style.display     = 'none';
    document.getElementById('tableToolbar').style.display = 'flex';
    initTableKeys(); window.renderTableEditor();
  }
});

// ─── Open table editor from menu ──────────────────────────────────────────────
document.getElementById('miTables').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  if (typeof isAdmin === 'function' && !isAdmin()) { alert('Admin privileges required.'); return; }
  rawJsonMode = false;
  document.getElementById('toggleRawJson').textContent   = 'Show Raw JSON';
  document.getElementById('tableEditor').style.display   = 'block';
  document.getElementById('jsonText').style.display      = 'none';
  document.getElementById('tableToolbar').style.display  = 'flex';
  document.getElementById('deleteSelectedRows').style.display = 'none';
  document.getElementById('jsonStatus').textContent      = '';
  document.getElementById('jsonModal').classList.add('open');
  initTableKeys();
  window.renderTableEditor();
});

// ─── Apply / Push / Download / Cancel ────────────────────────────────────────
window.applyJsonChanges = function() {
  try {
    if (rawJsonMode) {
      const d = JSON.parse(document.getElementById('jsonText').value);
      if (!Array.isArray(d)) throw new Error('Expected array');
      linksData = d;
    } else {
      syncFromTabulator();
    }
    localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
    document.getElementById('jsonModal').classList.remove('open');
    render(); return true;
  } catch(e) { document.getElementById('jsonStatus').textContent = 'Error: ' + e.message; return false; }
};
document.getElementById('jsonApply').addEventListener('click', window.applyJsonChanges);
document.getElementById('jsonPush').addEventListener('click', e => {
  e.preventDefault(); e.stopPropagation();
  if (window.applyJsonChanges()) window.pushToGitHub();
});
document.getElementById('jsonDl').addEventListener('click', saveJson);
document.getElementById('jsonCancel').addEventListener('click', () => {
  document.getElementById('jsonModal').classList.remove('open');
});
document.getElementById('jsonModal').addEventListener('pointerup', e => e.stopPropagation());
document.getElementById('jsonText').addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); window.applyJsonChanges(); }
});

// ─── Save JSON (local download) ────────────────────────────────────────────
function saveJson() {
  syncFromTabulator();
  localStorage.setItem('mlynx-links', JSON.stringify(linksData));
  const blob = new Blob([JSON.stringify(linksData, null, 2)], { type: 'application/json' });
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
        id: 'seeandlearn-backup-folder', startIn: 'documents',
        suggestedName: filename,
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonText); await writable.close(); return;
    }
  } catch(e) { if (e.name !== 'AbortError') console.error(e); return; }
  const blob = new Blob([jsonText], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

// ─── Settings / menu items ────────────────────────────────────────────────────
document.getElementById('miSaveJson').addEventListener('pointerup', e => { e.stopPropagation(); closeMenu(); saveJson(); });
document.getElementById('miHelp').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  alert('SeeAndLearn\n\nTap cell image → fullscreen\nTap empty cell → quick-fill (Ctrl+S to save)\nHamburger → Tables, Save JSON (Ctrl+Alt+S), Settings');
});
document.getElementById('miSettings').addEventListener('pointerup', e => {
  e.stopPropagation();
  const sp = document.getElementById('settingsPanel');
  const o  = sp.classList.toggle('open');
  e.currentTarget.textContent = o ? 'Settings \u25be' : 'Settings \u25b8';
});

function syncFit() {
  document.getElementById('togFit').checked    = (fitMode === 'ei');
  document.getElementById('fitLabel').textContent = fitMode === 'ei' ? 'Img: Entire Image' : 'Img: Fill Cell';
}
document.getElementById('togFit').addEventListener('change', function() {
  fitMode = this.checked ? 'ei' : 'fc';
  localStorage.setItem('mlynx-fit', fitMode); syncFit(); render();
});
document.getElementById('togCellLbl').addEventListener('change', function() { showCellLbl = this.checked; render(); });
document.getElementById('togCname').addEventListener('change',   function() { showCname   = this.checked; render(); });

// Ctrl+Alt+S global save
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveJson(); }
});

// ─── Quick-fill modal ─────────────────────────────────────────────────────────
let qfCell = '';
document.getElementById('qfDesktop').style.display = ISMOBILE ? 'none' : 'block';

// ─── Get Video Info ───────────────────────────────────────────────────────────
window.fillEmptyVideoInfo = async function() {
  syncFromTabulator();
  const btn = document.getElementById('btn-get-vid-info');
  if (btn) btn.textContent = 'Fetching...';
  let updated = false;
  if (!tableKeys.includes('v.title'))  tableKeys.push('v.title');
  if (!tableKeys.includes('v.author')) tableKeys.push('v.author');
  if (!tableKeys.includes('Portrait')) tableKeys.push('Portrait');

  await Promise.all(linksData.map(async row => {
    const isVid = row.asset && window.parseVideoAsset && window.parseVideoAsset(row.asset) !== null;
    if (!isVid || !row.link || !row.link.match(/^https?:/i)) return;
    if (row['v.title'] && row['v.author'] && row.Portrait) return;
    try {
      const res  = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(row.link));
      const data = await res.json();
      if (data.title      && !row['v.title'])  { row['v.title']  = data.title;       updated = true; }
      if (data.author_name && !row['v.author']) { row['v.author'] = data.author_name; updated = true; }
      if (data.width && data.height && (!row.Portrait || row.Portrait === '')) {
        row.Portrait = data.width < data.height ? '1' : '0'; updated = true;
      }
    } catch(e) {}
  }));

  if (updated) { localStorage.setItem('seeandlearn-links', JSON.stringify(linksData)); window.renderTableEditor(); }
  if (btn) btn.textContent = 'Get Video Info';
};

// ─── duplicateActiveRow (kept for Ctrl+D compat) ──────────────────────────────
window.duplicateActiveRow = function() {
  document.getElementById('btn-duplicate-row-action').click();
};

// ─── lastActiveRowIdx (kept for video editor compat) ─────────────────────────
window.lastActiveRowIdx = -1;
