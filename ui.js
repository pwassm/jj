// Version 11: Focus-based actions, clean column headers, live autocomplete

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

// Column widths: default 30 chars × 8px/char = 240px, min 1 char = 8px
const COL_DEFAULT_PX = 240;
const COL_MIN_PX     = 8;

let colWidths   = JSON.parse(localStorage.getItem('seeandlearn-colWidths') || '{}');
let recycleData = JSON.parse(localStorage.getItem('seeandlearn-recycle')   || '[]');

// isColResizing / stopColResize kept for main.js Esc-handler compatibility
let isColResizing = false;
window.stopColResize = function() {};

// ─── Focus tracking ───────────────────────────────────────────────────────────
// activeRow: the Tabulator Row component of the most-recently clicked cell
// activeCol: the field name (string) of the most-recently clicked cell
let activeRow = null;
let activeCol = null;   // field name string

// ─── Table-key helpers ───────────────────────────────────────────────────────
function initTableKeys() {
  const keys = new Set();
  linksData.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
  tableKeys = Array.from(keys);
  if (tableKeys.length === 0)
    tableKeys = ['show','asset','cell','fit','link','cname','sname','v.title','v.author','attribution','comment','Mute','Portrait'];
}

// ─── Live autocomplete lookup ─────────────────────────────────────────────────
// Called fresh each time a cell editor opens — reads current linksData state.
function makeLookupFn(field) {
  return function(cell) {          // Tabulator valuesLookup callback signature
    const s = new Set();
    linksData.forEach(r => {
      const v = r[field];
      if (v !== undefined && v !== null && String(v).trim()) s.add(String(v));
    });
    return Array.from(s).sort();
  };
}

// ─── Sync Tabulator → linksData ──────────────────────────────────────────────
function syncFromTabulator() {
  if (!window.tabulatorTable) return;
  // getData() returns the live reactive objects; assign to linksData reference
  const d = window.tabulatorTable.getData();
  linksData.length = 0;
  d.forEach(r => linksData.push(r));
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
}

// ─── Status bar helper ────────────────────────────────────────────────────────
function setStatus(msg, color) {
  const el = document.getElementById('jsonStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || '#8ef';
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
}

// ─── Main Tabulator init ──────────────────────────────────────────────────────
window.renderTableEditor = function() {
  const container = document.getElementById('tableEditor');
  if (!container) return;
  if (!tableKeys.length) initTableKeys();

  // Destroy previous instance cleanly
  if (window.tabulatorTable) {
    try { window.tabulatorTable.destroy(); } catch(e) {}
    window.tabulatorTable = null;
  }
  container.innerHTML = '';
  activeRow = null;
  activeCol = null;

  // ── Header right-click menu ──────────────────────────────────────────────
  const headerMenu = [
    {
      label: '✏ Rename this column',
      action(e, col) {
        const oldK = col.getField();
        const newK = prompt('Rename "' + oldK + '" to:', oldK);
        if (!newK || newK === oldK) return;
        if (tableKeys.includes(newK)) { alert('Name already exists.'); return; }
        tableKeys[tableKeys.indexOf(oldK)] = newK;
        linksData.forEach(row => { row[newK] = row[oldK] !== undefined ? row[oldK] : ''; delete row[oldK]; });
        localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
        window.renderTableEditor();
      }
    },
    {
      label: '⧉ Duplicate this column',
      action(e, col) {
        dupColumn(col.getField());
      }
    },
    {
      label: '✖ Delete this column',
      action(e, col) {
        delColumn(col.getField());
      }
    }
  ];

  // ── Column definitions ───────────────────────────────────────────────────
  const cols = [];

  // ── Del button (inline per row) — NO field, no header text ──────────────
  cols.push({
    title: '',           // empty string = no header label, no decoration
    field: '_del',
    width: 28, minWidth: 28,
    resizable: false,
    headerSort: false,
    hozAlign: 'center',
    headerHozAlign: 'center',
    formatter: () => "<span style='color:#f55;font-size:15px;cursor:pointer;'>✕</span>",
    cellClick(e, cell) {
      if (!confirm('Delete this row?')) return;
      const data = cell.getRow().getData();
      recycleData.push(JSON.parse(JSON.stringify(data)));
      localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
      syncFromTabulator();
      const idx = linksData.findIndex(r => r === data);
      if (idx > -1) linksData.splice(idx, 1);
      cell.getRow().delete();
      localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
    }
  });

  // ── Row-selection checkbox — NO decorative title ─────────────────────────
  // titleFormatter:"rowSelection" makes Tabulator put a "select all" checkbox.
  // We want a plain checkbox column — use a custom titleFormatter instead.
  cols.push({
    title: '',                         // no text at all in header
    field: '_sel',
    width: 28, minWidth: 28,
    resizable: false,
    headerSort: false,
    hozAlign: 'center',
    headerHozAlign: 'center',
    // Custom title formatter: just a select-all checkbox with no icons
    titleFormatter: function(cell) {
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.title = 'Select all';
      inp.addEventListener('change', function() {
        if (this.checked) window.tabulatorTable.selectRow();
        else window.tabulatorTable.deselectRow();
      });
      return inp;
    },
    formatter: function(cell) {
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = cell.getRow().isSelected();
      inp.addEventListener('change', function() {
        if (this.checked) cell.getRow().select();
        else cell.getRow().deselect();
      });
      return inp;
    },
    cellClick(e, cell) {
      // toggle handled by checkbox change event above
    }
  });

  // ── Move up/down — NO decorative title ───────────────────────────────────
  cols.push({
    title: '',
    field: '_move',
    width: 38, minWidth: 38,
    resizable: false,
    headerSort: false,
    hozAlign: 'center',
    headerHozAlign: 'center',
    formatter: () => "<span style='cursor:pointer;color:#888;font-size:11px;line-height:1.2;display:inline-block;'>▲<br>▼</span>",
    cellClick(e, cell) {
      const rect = cell.getElement().getBoundingClientRect();
      const dir  = e.clientY < rect.top + rect.height / 2 ? -1 : 1;
      syncFromTabulator();
      const pos = linksData.indexOf(cell.getRow().getData());
      const tgt = pos + dir;
      if (pos < 0 || tgt < 0 || tgt >= linksData.length) return;
      const tmp = linksData[pos]; linksData[pos] = linksData[tgt]; linksData[tgt] = tmp;
      localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
      window.renderTableEditor();
    }
  });

  // ── Data columns ─────────────────────────────────────────────────────────
  tableKeys.forEach(k => {
    const w = colWidths[k] !== undefined ? colWidths[k] : COL_DEFAULT_PX;

    let colDef = {
      title: k,              // exact field name — no sort arrows added by headerSort:true in title
      field: k,
      editor: 'input',
      headerSort: true,      // sort arrows appear on click, not in the static title text
      headerMenu: headerMenu,
      headerTooltip: k,
      width: w,
      minWidth: COL_MIN_PX,
      resizable: true,
      cellClick(e, cell) {
        activeRow = cell.getRow();
        activeCol = cell.getColumn().getField();
        updateFocusIndicator();
      },
      cellEdited(cell) {
        localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
      }
    };

    // Live autocomplete for cname and sname
    if (k === 'cname' || k === 'sname') {
      colDef.editor = 'list';
      colDef.editorParams = {
        valuesLookup: makeLookupFn(k),  // called fresh each time editor opens
        autocomplete: true,
        freetext: true,
        allowEmpty: true,
        listOnEmpty: true,
        filterDelay: 50,
        emptyValue: ''
      };
    } else if (k === 'v.author') {
      colDef.editor = 'list';
      colDef.editorParams = {
        valuesLookup: makeLookupFn('v.author'),
        autocomplete: true,
        freetext: true,
        allowEmpty: true,
        listOnEmpty: true,
        filterDelay: 50,
        emptyValue: ''
      };
    }

    cols.push(colDef);
  });

  // ── Tabulator instantiation ───────────────────────────────────────────────
  window.tabulatorTable = new Tabulator(container, {
    data: linksData,
    reactiveData: true,
    columns: cols,
    layout: 'fitDataNoStretch',
    selectableRows: true,
    history: false,
    movableColumns: false,
    height: '100%',

    columnResized(column) {
      const field = column.getField();
      if (!field || field.startsWith('_')) return;
      colWidths[field] = column.getWidth();
      localStorage.setItem('seeandlearn-colWidths', JSON.stringify(colWidths));
      // Column widths are saved immediately to localStorage.
      // They survive Apply, Push, and page reload automatically.
    },

    rowSelectionChanged(data, rows) {
      const btn = document.getElementById('deleteSelectedRows');
      if (btn) btn.style.display = rows.length > 0 ? 'inline-block' : 'none';
    },

    rowClick(e, row) {
      activeRow = row;
      updateFocusIndicator();
    }
  });
};

// ─── Focus indicator in toolbar ───────────────────────────────────────────────
function updateFocusIndicator() {
  const el = document.getElementById('focusIndicator');
  if (!el) return;
  const rowStr = activeRow ? ('row ' + activeRow.getPosition()) : '—';
  const colStr = activeCol && !activeCol.startsWith('_') ? activeCol : '—';
  el.textContent = 'Focus: ' + rowStr + ' · col: ' + colStr;
}

// ─── Helper: get focused column field (for col operations) ───────────────────
function getFocusedColField() {
  if (activeCol && !activeCol.startsWith('_') && tableKeys.includes(activeCol)) return activeCol;
  // Fall back to last tableKeys entry
  return tableKeys.length ? tableKeys[tableKeys.length - 1] : null;
}

// ─── Helper: get focused row ─────────────────────────────────────────────────
function getFocusedRow() {
  if (activeRow) return activeRow;
  if (!window.tabulatorTable) return null;
  const rows = window.tabulatorTable.getRows();
  return rows.length ? rows[0] : null;
}

// ─── Column operations ────────────────────────────────────────────────────────
function dupColumn(srcField) {
  if (!srcField || !tableKeys.includes(srcField)) return;
  // Auto-name: srcField + '_copy', or srcField + '_copy2', etc. — no dialog
  let newK = srcField + '_copy';
  let n = 2;
  while (tableKeys.includes(newK)) newK = srcField + '_copy' + n++;
  const idx = tableKeys.indexOf(srcField);
  tableKeys.splice(idx + 1, 0, newK);
  linksData.forEach(row => { row[newK] = row[srcField] !== undefined ? String(row[srcField]) : ''; });
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  activeCol = newK;
  window.renderTableEditor();
  setStatus('Duplicated column "' + srcField + '" → "' + newK + '"');
}

function delColumn(k) {
  if (!k || !tableKeys.includes(k)) return;
  if (!confirm('Delete column "' + k + '" from ALL rows?')) return;
  tableKeys = tableKeys.filter(x => x !== k);
  linksData.forEach(row => delete row[k]);
  if (activeCol === k) activeCol = null;
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  window.renderTableEditor();
}

function addColAfter(afterField) {
  const newK = prompt('Name for new column' + (afterField ? ' (after "' + afterField + '")' : '') + ':');
  if (!newK) return;
  if (tableKeys.includes(newK)) { alert('Column "' + newK + '" already exists.'); return; }
  const idx = afterField ? tableKeys.indexOf(afterField) : tableKeys.length - 1;
  tableKeys.splice(idx + 1, 0, newK);
  linksData.forEach(row => { if (row[newK] === undefined) row[newK] = ''; });
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  activeCol = newK;
  window.renderTableEditor();
}

function renameColumn(k) {
  if (!k || !tableKeys.includes(k)) return;
  const newK = prompt('Rename "' + k + '" to:', k);
  if (!newK || newK === k) return;
  if (tableKeys.includes(newK)) { alert('Name already exists.'); return; }
  tableKeys[tableKeys.indexOf(k)] = newK;
  linksData.forEach(row => { row[newK] = row[k] !== undefined ? row[k] : ''; delete row[k]; });
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  activeCol = newK;
  window.renderTableEditor();
}

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

// ─── Toolbar button listeners ─────────────────────────────────────────────────

// RowAddNext — insert empty row immediately after focused row
document.getElementById('addTableItem').addEventListener('click', function() {
  if (!window.tabulatorTable) return;
  syncFromTabulator();
  const newRow = {}; tableKeys.forEach(k => newRow[k] = '');
  const focRow = getFocusedRow();
  if (focRow) {
    const pos = linksData.indexOf(focRow.getData());
    linksData.splice(pos < 0 ? linksData.length : pos + 1, 0, newRow);
    window.tabulatorTable.addRow(newRow, false, focRow);
  } else {
    linksData.unshift(newRow);
    window.tabulatorTable.addRow(newRow, true);
  }
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  setStatus('Row added');
});

// RowAddBottom — always append at end
document.getElementById('btn-row-add-bottom').addEventListener('click', function() {
  if (!window.tabulatorTable) return;
  syncFromTabulator();
  const newRow = {}; tableKeys.forEach(k => newRow[k] = '');
  linksData.push(newRow);
  window.tabulatorTable.addRow(newRow, false);
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  setStatus('Row added at bottom');
});

// RowDupNext — duplicate focused/selected row, insert after it, auto-assign cell
document.getElementById('btn-duplicate-row-action').addEventListener('click', function() {
  if (!window.tabulatorTable) return;
  syncFromTabulator();
  const sel = window.tabulatorTable.getSelectedRows();
  const targets = sel.length ? sel : (activeRow ? [activeRow] : []);
  if (!targets.length) {
    setStatus('Click a row first to duplicate it', '#f88'); return;
  }
  // Process in reverse so splices don't shift later indices
  [...targets].reverse().forEach(row => {
    const src = row.getData();
    const newRow = JSON.parse(JSON.stringify(src));
    newRow.cell = window.getFirstEmptyCell();
    const idx = linksData.indexOf(src);
    linksData.splice(idx > -1 ? idx + 1 : linksData.length, 0, newRow);
  });
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  window.renderTableEditor();
  setStatus('Row(s) duplicated');
});

// RowDelete — delete selected rows (or focused row if nothing selected)
document.getElementById('deleteSelectedRows').addEventListener('click', function() {
  if (!window.tabulatorTable) return;
  const sel = window.tabulatorTable.getSelectedRows();
  if (!sel.length) { setStatus('Select rows to delete', '#f88'); return; }
  if (!confirm('Delete ' + sel.length + ' row(s)?')) return;
  syncFromTabulator();
  sel.forEach(row => {
    const d = row.getData();
    recycleData.push(JSON.parse(JSON.stringify(d)));
    const idx = linksData.indexOf(d);
    if (idx > -1) linksData.splice(idx, 1);
    row.delete();
  });
  if (activeRow && sel.includes(activeRow)) activeRow = null;
  localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  this.style.display = 'none';
  setStatus('Row(s) deleted');
});

// ColAddNext — add new column after focused column (prompts for name only)
document.getElementById('btn-col-add').addEventListener('click', function() {
  addColAfter(getFocusedColField());
});

// ColDupNext — duplicate focused column instantly, auto-name col_copy
document.getElementById('btn-duplicate-col-action').addEventListener('click', function() {
  const src = getFocusedColField();
  if (!src) { setStatus('Click a cell in the column to duplicate', '#f88'); return; }
  dupColumn(src);
});

// ColNameEdit — rename focused column (one prompt for new name only)
document.getElementById('btn-col-rename').addEventListener('click', function() {
  const k = getFocusedColField();
  if (!k) { setStatus('Click a cell in the column to rename', '#f88'); return; }
  renameColumn(k);
});

// ColDelete — delete focused column
document.getElementById('btn-col-delete').addEventListener('click', function() {
  const k = getFocusedColField();
  if (!k) { setStatus('Click a cell in the column to delete', '#f88'); return; }
  delColumn(k);
});

// ExportChosen — download selected rows (or all if none selected)
document.getElementById('btn-export-chosen').addEventListener('click', function() {
  syncFromTabulator();
  const sel = window.tabulatorTable ? window.tabulatorTable.getSelectedRows() : [];
  const data = sel.length > 0 ? sel.map(r => r.getData()) : linksData;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = sel.length > 0 ? 'links_selected.json' : 'links.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
  setStatus('Downloaded ' + data.length + ' row(s)');
});

// Import — pick JSON file and merge or replace
document.getElementById('btn-import').addEventListener('click', function() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) { alert('Expected a JSON array.'); return; }
        const merge = confirm('Merge imported rows with existing data?\nOK = merge  ·  Cancel = replace all');
        if (merge) { imported.forEach(r => linksData.push(r)); }
        else { linksData.length = 0; imported.forEach(r => linksData.push(r)); }
        initTableKeys();
        localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
        window.renderTableEditor();
        setStatus('Imported ' + imported.length + ' rows');
      } catch(e) { alert('Invalid JSON: ' + e.message); }
    };
    reader.readAsText(file);
  };
  inp.click();
});

// Ctrl+D — duplicate active/selected row
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
    document.getElementById('jsonText').value    = JSON.stringify(linksData, null, 2);
    document.getElementById('tableEditor').style.display   = 'none';
    document.getElementById('jsonText').style.display      = 'block';
    document.getElementById('tableToolbar').style.display  = 'none';
  } else {
    try { linksData = JSON.parse(document.getElementById('jsonText').value); }
    catch(e) { alert('Invalid JSON'); rawJsonMode = true; return; }
    document.getElementById('tableEditor').style.display   = 'block';
    document.getElementById('jsonText').style.display      = 'none';
    document.getElementById('tableToolbar').style.display  = 'flex';
    initTableKeys(); window.renderTableEditor();
  }
});

// ─── Open table editor ────────────────────────────────────────────────────────
document.getElementById('miTables').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  if (typeof isAdmin === 'function' && !isAdmin()) { alert('Admin privileges required.'); return; }
  rawJsonMode = false;
  document.getElementById('toggleRawJson').textContent          = 'Show Raw JSON';
  document.getElementById('tableEditor').style.display          = 'block';
  document.getElementById('jsonText').style.display             = 'none';
  document.getElementById('tableToolbar').style.display         = 'flex';
  document.getElementById('deleteSelectedRows').style.display   = 'none';
  document.getElementById('jsonStatus').textContent             = '';
  document.getElementById('jsonModal').classList.add('open');
  initTableKeys();
  window.renderTableEditor();
});

// ─── Apply / Push / Download / Cancel ────────────────────────────────────────
// Column widths: already in localStorage after every drag.
// Apply / Push: also save the current grid data. You never need to do anything
// special for col widths — just Apply or Push whenever you're happy with edits.
window.applyJsonChanges = function() {
  try {
    if (rawJsonMode) {
      const d = JSON.parse(document.getElementById('jsonText').value);
      if (!Array.isArray(d)) throw new Error('Expected array');
      linksData.length = 0; d.forEach(r => linksData.push(r));
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

// ─── Save JSON ────────────────────────────────────────────────────────────────
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

// ─── Settings ─────────────────────────────────────────────────────────────────
document.getElementById('miSaveJson').addEventListener('pointerup', e => { e.stopPropagation(); closeMenu(); saveJson(); });
document.getElementById('miHelp').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  alert('SeeAndLearn\n\nTap cell image → fullscreen\nTap empty cell → quick-fill (Ctrl+S to save)\nHamburger → Tables, Save JSON (Ctrl+Alt+S), Settings\n\nTable editor tips:\n• Click any cell to set focus for row/col buttons\n• Col resize is auto-saved — just Apply or Push when done\n• RowDupNext / ColDupNext act on the focused row/col');
});
document.getElementById('miSettings').addEventListener('pointerup', e => {
  e.stopPropagation();
  const sp = document.getElementById('settingsPanel');
  const o  = sp.classList.toggle('open');
  e.currentTarget.textContent = o ? 'Settings \u25be' : 'Settings \u25b8';
});

function syncFit() {
  document.getElementById('togFit').checked       = (fitMode === 'ei');
  document.getElementById('fitLabel').textContent = fitMode === 'ei' ? 'Img: Entire Image' : 'Img: Fill Cell';
}
document.getElementById('togFit').addEventListener('change', function() {
  fitMode = this.checked ? 'ei' : 'fc';
  localStorage.setItem('mlynx-fit', fitMode); syncFit(); render();
});
document.getElementById('togCellLbl').addEventListener('change', function() { showCellLbl = this.checked; render(); });
document.getElementById('togCname').addEventListener('change',   function() { showCname   = this.checked; render(); });

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
      if (data.title       && !row['v.title'])  { row['v.title']  = data.title;       updated = true; }
      if (data.author_name && !row['v.author']) { row['v.author'] = data.author_name; updated = true; }
      if (data.width && data.height && (!row.Portrait || row.Portrait === ''))
        { row.Portrait = data.width < data.height ? '1' : '0'; updated = true; }
    } catch(e) {}
  }));
  if (updated) { localStorage.setItem('seeandlearn-links', JSON.stringify(linksData)); window.renderTableEditor(); }
  if (btn) btn.textContent = 'Get Video Info';
  setStatus(updated ? 'Video info updated' : 'No new video info found');
};

// ─── Compat shims ─────────────────────────────────────────────────────────────
window.duplicateActiveRow = function() {
  document.getElementById('btn-duplicate-row-action').click();
};
window.lastActiveRowIdx = -1;
