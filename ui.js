// Version 9: Header layout fixed
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
}

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
let tableKeys = [];
let sortCol = null;
let sortAsc = true;
let draggedCol = -1;
let selectedRows = new Set();
let colWidths = JSON.parse(localStorage.getItem('seeandlearn-colWidths') || '{}');
let recycleData = JSON.parse(localStorage.getItem('seeandlearn-recycle') || '[]');

let isColResizing = false;
let startX = 0, startW = 0, currentResizingCol = '';
let resizePointerId = null, resizeHandleEl = null;

window.initColResize = function(e, k) {
  if (e.button !== undefined && e.button !== 0) return; // Only left click
  e.preventDefault();
  e.stopPropagation();

  const th = document.getElementById('th-'+k);
  if (!th) return;

  isColResizing = true;
  currentResizingCol = k;
  startX = e.clientX || (e.touches && e.touches[0].clientX);
  startW = th.offsetWidth;
  resizePointerId = e.pointerId ?? null;
  resizeHandleEl = e.currentTarget || e.target;

  if (resizeHandleEl && resizeHandleEl.setPointerCapture && resizePointerId !== null) {
    try { resizeHandleEl.setPointerCapture(resizePointerId); } catch(err) {}
  }

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  window.addEventListener('pointermove', doColResize, true);
  window.addEventListener('pointerup', stopColResize, true);
  window.addEventListener('pointercancel', stopColResize, true);
  window.addEventListener('blur', stopColResize, true);
};

function doColResize(e) {
  if(!isColResizing) return;
  if(e.buttons !== undefined && e.buttons === 0 && e.type !== 'pointerup') {
    stopColResize(e);
    return;
  }
  const clientX = e.clientX || (e.touches ? e.touches[0].clientX : startX);
  let newW = startW + (clientX - startX);
  if(newW < 24) newW = 24;
  colWidths[currentResizingCol] = newW;
  const th = document.getElementById('th-'+currentResizingCol);
  if(th) {
    th.style.width = newW + 'px';
    th.style.minWidth = newW + 'px';
    th.style.maxWidth = newW + 'px';
  }
}

window.stopColResize = function(e) {
  if(!isColResizing) return;
  if (resizeHandleEl && resizeHandleEl.releasePointerCapture && resizePointerId !== null) {
    try { resizeHandleEl.releasePointerCapture(resizePointerId); } catch(err) {}
  }
  isColResizing = false;
  currentResizingCol = '';
  resizePointerId = null;
  resizeHandleEl = null;

  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  localStorage.setItem('seeandlearn-colWidths', JSON.stringify(colWidths));

  window.removeEventListener('pointermove', doColResize, true);
  window.removeEventListener('pointerup', stopColResize, true);
  window.removeEventListener('pointercancel', stopColResize, true);
  window.removeEventListener('blur', stopColResize, true);

  renderTableEditor();
}

function calcPortrait() {
  if(!tableKeys.includes('Portrait')) return;
  linksData.forEach((row, i) => {
    if((row.Portrait === undefined || row.Portrait === "") && row.link && row.link.match(/^https?:/i)) {
      const img = new Image();
      img.onload = () => {
        const val = img.width < img.height ? "1" : "0";
        if(row.Portrait !== val) {
          row.Portrait = val;
          const input = document.getElementById(`cell-${i}-Portrait`);
          if(input) input.value = val;
          localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
        }
      };
      img.src = row.link;
    }
  });
}

function initTableKeys() {
  const keys = new Set();
  linksData.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
  tableKeys = Array.from(keys);
  if(tableKeys.length===0) tableKeys = ['show','asset','cell','fit','link','cname','sname','v.title','v.author','attribution','comment','Mute','Portrait'];
}

function updateSelectedRowsButton() {
  const btn = document.getElementById('deleteSelectedRows');
  if(btn) btn.style.display = selectedRows.size > 0 ? 'block' : 'none';
}

window.renderTableEditor = function() {
  const container = document.getElementById('tableEditor');
  if(!container) return;
  if(typeof tableKeys === 'undefined' || tableKeys.length===0) initTableKeys();

  container.innerHTML = '';
  if (window.tabulatorTable) {
      window.tabulatorTable.destroy();
      window.tabulatorTable = null;
  }

  // Active tracking for "Next" operations
  window.activeColField = tableKeys[0] || null;
  window.activeRowNode = null;

  // Track the most recently clicked cell to determine "active" column and row
  const updateActiveState = function(e, cell) {
      if(cell) {
          window.activeColField = cell.getField();
          window.activeRowNode = cell.getRow();
      }
  };

  const cols = [];

  // Delete Row column
  cols.push({
      title: "Del",
      formatter: () => "<span style='color:#f66; font-size:18px; font-weight:bold; cursor:pointer;'>&times;</span>",
      width: 50,
      hozAlign: "center",
      headerSort: false,
      cellClick: function(e, cell) {
          updateActiveState(e, cell);
          if(confirm("Delete row?")) {
              const row = cell.getRow();
              const rowData = row.getData();
              const idx = linksData.indexOf(rowData);
              if(idx > -1) linksData.splice(idx, 1);
              row.delete();
          }
      }
  });

  // Checkbox column for Selection
  cols.push({
      formatter: "rowSelection", 
      titleFormatter: "rowSelection", 
      width: 50, 
      hozAlign: "center", 
      headerSort: false
  });

  tableKeys.forEach(k => {
      let colDef = { 
          title: k, 
          field: k, 
          editor: "input",
          headerSort: true,
          width: colWidths[k] || 150,
          headerClick: function(e, column) {
              window.activeColField = column.getField();
          },
          cellClick: updateActiveState
      };

      // Dropdown autocomplete fixed
      if (k === 'cname' || k === 'sname' || k === 'v.author') {
          colDef.editor = "list";
          colDef.editorParams = {
              // Dynamically get all unique values in this column across linksData
              values: function(cell) {
                  const field = cell.getField();
                  return [...new Set(linksData.map(r => r[field]).filter(x => x))].sort();
              },
              autocomplete: true,
              freetext: true,
              listOnEmpty: true,
              clearable: true
          };
      }
      cols.push(colDef);
  });

  window.tabulatorTable = new Tabulator(container, {
      data: linksData,
      reactiveData: true, 
      columns: cols,
      selectableRows: true, 
      history: true,
      rowClick: function(e, row) {
          window.activeRowNode = row;
      },
      columnResized: function(column) {
          const field = column.getField();
          if(field) {
              colWidths[field] = column.getWidth();
              localStorage.setItem('seeandlearn-colWidths', JSON.stringify(colWidths));
          }
      }
  });

  // --- TOP BUTTON ACTIONS ---

  // RowAddNext
  const btnRowAddNext = document.getElementById('btn-row-add-next');
  if(btnRowAddNext) btnRowAddNext.onclick = () => {
      const newRow = {};
      tableKeys.forEach(k => newRow[k] = '');

      const activeRow = window.activeRowNode;
      if (activeRow) {
          window.tabulatorTable.addRow(newRow, false, activeRow);
          // Insert into linksData immediately after activeRow's underlying data
          const rowData = activeRow.getData();
          const targetIdx = linksData.indexOf(rowData);
          if(targetIdx > -1) linksData.splice(targetIdx + 1, 0, newRow);
          else linksData.push(newRow);
      } else {
          // Fallback to top if no row active
          window.tabulatorTable.addRow(newRow, true);
          linksData.unshift(newRow);
      }
  };

  // RowAddBottom
  const btnRowAddBottom = document.getElementById('btn-row-add-bottom');
  if(btnRowAddBottom) btnRowAddBottom.onclick = () => {
      const newRow = {};
      tableKeys.forEach(k => newRow[k] = '');
      window.tabulatorTable.addRow(newRow, false); // bottom
      linksData.push(newRow);
  };

  // RowDupNext
  const btnRowDupNext = document.getElementById('btn-row-dup-next');
  if(btnRowDupNext) btnRowDupNext.onclick = () => {
      const selectedRows = window.tabulatorTable.getSelectedRows();
      let targetRow = window.activeRowNode;

      if(selectedRows.length > 0) {
          // If rows are explicitly checked, duplicate them
          selectedRows.reverse().forEach(row => { // reverse to maintain selection order when inserting after
              const data = Object.assign({}, row.getData());
              if(window.getFirstEmptyCell) data.cell = window.getFirstEmptyCell(); 
              window.tabulatorTable.addRow(data, false, row);

              const idx = linksData.indexOf(row.getData());
              if(idx > -1) linksData.splice(idx + 1, 0, data);
              else linksData.push(data);
          });
      } else if (targetRow) {
          // If no row checked, duplicate the last clicked row
          const data = Object.assign({}, targetRow.getData());
          if(window.getFirstEmptyCell) data.cell = window.getFirstEmptyCell();
          window.tabulatorTable.addRow(data, false, targetRow);

          const idx = linksData.indexOf(targetRow.getData());
          if(idx > -1) linksData.splice(idx + 1, 0, data);
          else linksData.push(data);
      } else {
          alert("Click on a row or check boxes to duplicate.");
      }
  };

  // RowDelete
  const btnRowDelete = document.getElementById('btn-row-delete');
  if(btnRowDelete) btnRowDelete.onclick = () => {
      const selectedRows = window.tabulatorTable.getSelectedRows();
      if(selectedRows.length > 0) {
          if(confirm(`Delete ${selectedRows.length} selected rows?`)) {
              selectedRows.forEach(row => {
                  const rowData = row.getData();
                  const idx = linksData.indexOf(rowData);
                  if(idx > -1) linksData.splice(idx, 1);
                  row.delete();
              });
          }
      } else if (window.activeRowNode) {
           if(confirm(`Delete active row?`)) {
                  const rowData = window.activeRowNode.getData();
                  const idx = linksData.indexOf(rowData);
                  if(idx > -1) linksData.splice(idx, 1);
                  window.activeRowNode.delete();
                  window.activeRowNode = null;
           }
      } else {
          alert("Select rows to delete first.");
      }
  };

  // Helper for naming columns
  const getUniqueColName = (base) => {
      let counter = 1;
      let name = base;
      while(tableKeys.includes(name)) {
          counter++;
          name = base + counter;
      }
      return name;
  };

  // ColumnAddNext
  const btnColAddNext = document.getElementById('btn-col-add-next');
  if(btnColAddNext) btnColAddNext.onclick = () => {
      if(!window.activeColField) { alert("Click a column header/cell first."); return; }
      const newName = prompt("Enter name for new column:", "NewColumn");
      if(!newName || tableKeys.includes(newName)) return;

      const targetIndex = tableKeys.indexOf(window.activeColField) + 1;
      tableKeys.splice(targetIndex, 0, newName);
      linksData.forEach(row => row[newName] = "");
      window.activeColField = newName; // focus new
      window.renderTableEditor();
  };

  // ColumnDupNext
  const btnColDupNext = document.getElementById('btn-col-dup-next');
  if(btnColDupNext) btnColDupNext.onclick = () => {
      if(!window.activeColField) { alert("Click a column header/cell first."); return; }
      const oldK = window.activeColField;
      const newName = prompt("Enter name for duplicated column:", oldK + "_copy");
      if(!newName) return;

      const finalName = getUniqueColName(newName);
      const targetIndex = tableKeys.indexOf(oldK) + 1;
      tableKeys.splice(targetIndex, 0, finalName);

      linksData.forEach(row => {
          row[finalName] = row[oldK] !== undefined ? row[oldK] : "";
      });
      window.activeColField = finalName;
      window.renderTableEditor();
  };

  // ColumnNameEdit
  const btnColNameEdit = document.getElementById('btn-col-name-edit');
  if(btnColNameEdit) btnColNameEdit.onclick = () => {
      if(!window.activeColField) { alert("Click a column header/cell first."); return; }
      const oldK = window.activeColField;
      const newK = prompt("Rename column:", oldK);
      if(newK && newK !== oldK && !tableKeys.includes(newK)) {
          tableKeys[tableKeys.indexOf(oldK)] = newK;
          linksData.forEach(row => { row[newK] = row[oldK]; delete row[oldK]; });
          window.activeColField = newK;
          window.renderTableEditor();
      }
  };

  // ColumnDelete
  const btnColDelete = document.getElementById('btn-col-delete');
  if(btnColDelete) btnColDelete.onclick = () => {
      if(!window.activeColField) { alert("Click a column header/cell first."); return; }
      const k = window.activeColField;
      if(confirm('Delete column ' + k + ' from ALL rows?')) {
          tableKeys = tableKeys.filter(x => x !== k);
          linksData.forEach(row => delete row[k]);
          window.activeColField = tableKeys[0] || null; // reset
          window.renderTableEditor();
      }
  };

  // ExportChosen
  const btnExportChosen = document.getElementById('btn-export-chosen');
  if(btnExportChosen) btnExportChosen.onclick = () => {
      const selectedRows = window.tabulatorTable.getSelectedRows();
      if(selectedRows.length === 0) { alert("Check the boxes of rows to export first."); return; }

      const exportData = selectedRows.map(row => row.getData());
      if (window.triggerDownload) {
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          window.triggerDownload(`export_${ts}.json`, exportData);
      } else {
          // Fallback download if triggerDownload isn't defined
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'export.json';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
  };

  // Import
  const btnImport = document.getElementById('btn-import');
  const inputImport = document.getElementById('input-import-json');
  if(btnImport && inputImport) {
      btnImport.onclick = () => inputImport.click();
      // Important: replace the event listener cleanly so it doesn't fire multiple times
      inputImport.onchange = (e) => {
          const file = e.target.files[0];
          if(!file) return;
          const reader = new FileReader();
          reader.onload = function(evt) {
              try {
                  const importedData = JSON.parse(evt.target.result);
                  if(!Array.isArray(importedData)) throw new Error("JSON is not an array");

                  // Ask user: Append or Replace?
                  if(confirm("Click OK to APPEND to existing table. Click Cancel to REPLACE current table.")) {
                      // Append
                      importedData.forEach(r => linksData.push(r));

                      // Discover any new keys
                      importedData.forEach(r => {
                          Object.keys(r).forEach(k => {
                              if(!tableKeys.includes(k)) tableKeys.push(k);
                          });
                      });
                  } else {
                      // Replace
                      linksData = importedData;
                      tableKeys = [];
                      linksData.forEach(r => Object.keys(r).forEach(k => {
                          if(!tableKeys.includes(k)) tableKeys.push(k);
                      }));
                  }
                  window.renderTableEditor(); // Redraw with new data and headers
              } catch(err) {
                  alert("Failed to load JSON: " + err.message);
              }
              inputImport.value = ''; // Reset file input
          };
          reader.readAsText(file);
      };
  }
};
window.toggleRowSelect = function(idx, state) { if(state) selectedRows.add(idx); else selectedRows.delete(idx); renderTableEditor(); };
window.toggleSelectAll = function(state) { if(state) { linksData.forEach((_, i) => selectedRows.add(i)); } else { selectedRows.clear(); } renderTableEditor(); };
window.updateCell = function(r, k, v) { linksData[r][k] = v; };
window.colDragStart = function(e, i) { draggedCol = i; };
window.colDrop = function(e, i) {
  if(draggedCol === -1 || draggedCol === i) return;
  const key = tableKeys.splice(draggedCol, 1)[0];
  tableKeys.splice(i, 0, key); rebuildLinksDataKeys(); renderTableEditor();
};
window.rebuildLinksDataKeys = function() {
  linksData = linksData.map(obj => {
    const newObj = {};
    tableKeys.forEach(k => { if(obj.hasOwnProperty(k)) newObj[k] = obj[k]; });
    Object.keys(obj).forEach(k => { if(!tableKeys.includes(k)) newObj[k] = obj[k]; });
    return newObj;
  });
}
window.sortData = function(k) {
  if(sortCol === k) sortAsc = !sortAsc; else { sortCol = k; sortAsc = true; }
  linksData.sort((a,b) => {
    let v1 = a[k]!==undefined?a[k]:''; let v2 = b[k]!==undefined?b[k]:'';
    if(!isNaN(v1) && !isNaN(v2) && v1!=='' && v2!=='') { v1=Number(v1); v2=Number(v2); }
    if(v1 < v2) return sortAsc ? -1 : 1; if(v1 > v2) return sortAsc ? 1 : -1; return 0;
  });
  selectedRows.clear(); renderTableEditor();
};
window.renameCol = function(oldK) {
  const newK = prompt('Rename column:', oldK);
  if(!newK || newK === oldK || tableKeys.includes(newK)) return;
  tableKeys[tableKeys.indexOf(oldK)] = newK;
  linksData.forEach(row => { if(row.hasOwnProperty(oldK)) { row[newK] = row[oldK]; delete row[oldK]; } });
  rebuildLinksDataKeys(); renderTableEditor();
};
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
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

window.deleteCol = function(k) {
  if(!confirm('Delete column "' + k + '" from ALL rows?')) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  triggerDownload(`links_${ts}.json`, linksData);
  localStorage.setItem('seeandlearn-backup', JSON.stringify(linksData));
  tableKeys = tableKeys.filter(x => x !== k);
  linksData.forEach(row => delete row[k]);
  renderTableEditor();
};

window.addCol = function() {
  const newK = prompt('New column name:');
  if(!newK || tableKeys.includes(newK)) return;
  tableKeys.push(newK);
  linksData.forEach(row => row[newK] = "");
  rebuildLinksDataKeys();
  renderTableEditor();
};

window.addRow = function() {
  const newRow = {};
  tableKeys.forEach(k => newRow[k] = "");
  linksData.push(newRow);
  renderTableEditor();
};

window.deleteRow = function(idx) {
  if(confirm('Delete row?')) {
    triggerDownload('recycle.json', [linksData[idx]]);
    recycleData.push(linksData[idx]);
    localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
    linksData.splice(idx, 1);
    selectedRows.delete(idx);
    renderTableEditor();
  }
};

document.getElementById('deleteSelectedRows').addEventListener('click', () => {
  if(selectedRows.size === 0) return;
  if(confirm(`Delete ${selectedRows.size} selected rows?`)) {
    const indices = Array.from(selectedRows).sort((a,b)=>b-a);
    const deleted = [];
    indices.forEach(i => {
      deleted.push(linksData[i]);
      recycleData.push(linksData[i]);
      linksData.splice(i, 1);
    });
    triggerDownload('recycle.json', deleted);
    localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
    selectedRows.clear();
    renderTableEditor();
  }
});
window.moveRow = function(idx, dir) {
  if(idx+dir < 0 || idx+dir >= linksData.length) return;
  const temp = linksData[idx]; linksData[idx] = linksData[idx+dir]; linksData[idx+dir] = temp;
  if(selectedRows.has(idx) && !selectedRows.has(idx+dir)) { selectedRows.delete(idx); selectedRows.add(idx+dir); } 
  else if(!selectedRows.has(idx) && selectedRows.has(idx+dir)) { selectedRows.add(idx); selectedRows.delete(idx+dir); }
  renderTableEditor();
};
document.getElementById('addTableItem').addEventListener('click', window.addRow);
document.getElementById('toggleRawJson').addEventListener('click', function() {
  rawJsonMode = !rawJsonMode; this.textContent = rawJsonMode ? 'Show Visual Editor' : 'Show Raw JSON';
  if(rawJsonMode) {
    document.getElementById('jsonText').value = JSON.stringify(linksData, null, 2);
    document.getElementById('tableEditor').style.display = 'none'; document.getElementById('jsonText').style.display = 'block';
    document.getElementById('addTableItem').style.display = 'none'; document.getElementById('deleteSelectedRows').style.display = 'none';
  } else {
    try { linksData = JSON.parse(document.getElementById('jsonText').value); } catch(e) { alert("Invalid JSON"); rawJsonMode = true; return; }
    document.getElementById('tableEditor').style.display = 'block'; document.getElementById('jsonText').style.display = 'none';
    document.getElementById('addTableItem').style.display = 'block'; initTableKeys(); renderTableEditor();
  }
});
document.getElementById('miTables').addEventListener('pointerup',e=>{
  e.stopPropagation(); closeMenu();
  if(typeof isAdmin === 'function' && !isAdmin()) { alert('Admin privileges required.'); return; }
  rawJsonMode = false; selectedRows.clear(); document.getElementById('toggleRawJson').textContent = 'Show Raw JSON';
  document.getElementById('tableEditor').style.display = 'block'; document.getElementById('jsonText').style.display = 'none';
  document.getElementById('addTableItem').style.display = 'block'; initTableKeys(); renderTableEditor();
  document.getElementById('jsonStatus').textContent=''; document.getElementById('jsonModal').classList.add('open');
});
document.getElementById('miSaveJson').addEventListener('pointerup',e=>{ e.stopPropagation(); closeMenu(); saveJson(); });
document.getElementById('miHelp').addEventListener('pointerup',e=>{
  e.stopPropagation(); closeMenu();
  alert('Mlynx\n\nTap cell image -> fullscreen\nTap empty cell -> quick-fill (Ctrl+S to save)\nHamburger -> Tables (JSON editor), Save JSON (Ctrl+Alt+S), Settings');
});
document.getElementById('miSettings').addEventListener('pointerup',e=>{
  e.stopPropagation();
  const sp=document.getElementById('settingsPanel');
  const o=sp.classList.toggle('open');
  e.currentTarget.textContent=o?'Settings \u25be':'Settings \u25b8';
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

// Save JSON
function saveJson(){
  localStorage.setItem('mlynx-links',JSON.stringify(linksData));
  const blob=new Blob([JSON.stringify(linksData,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='links.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
}

// Quick-fill
let qfCell='';
document.getElementById('qfDesktop').style.display=ISMOBILE?'none':'block';

async 

window.fillEmptyVideoInfo = async function() {
  const btn = document.getElementById('btn-get-vid-info');
  if (btn) btn.textContent = "Fetching...";
  let updated = false;

  // ensure keys exist
  if (!tableKeys.includes('v.title')) tableKeys.push('v.title');
  if (!tableKeys.includes('v.author')) tableKeys.push('v.author');
  if (!tableKeys.includes('Portrait')) tableKeys.push('Portrait');

  const promises = linksData.map(async (row, i) => {
    const isVid = row.asset && window.parseVideoAsset && window.parseVideoAsset(row.asset) !== null;
    if (isVid && row.link && row.link.match(/^https?:/i)) {
      if (!row['v.title'] || !row['v.author'] || !row.Portrait) {
        try {
          const res = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(row.link));
          const data = await res.json();
          if (data.title && !row['v.title']) { row['v.title'] = data.title; updated = true; }
          if (data.author_name && !row['v.author']) { row['v.author'] = data.author_name; updated = true; }
          if (data.width && data.height && (!row.Portrait || row.Portrait === "")) {
            row.Portrait = data.width < data.height ? "1" : "0";
            updated = true;
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
  if (btn) btn.textContent = "Get Video Info";
};





window.lastActiveRowIdx = -1;

document.addEventListener('focusin', function(e) {
  if (e.target && e.target.id && e.target.id.startsWith('cell-')) {
    window.lastActiveRowIdx = parseInt(e.target.id.split('-')[1]);
  }
});

window.getFirstEmptyCell = function() {
  try {
    const occ = new Set();
    linksData.forEach(r => { if(r && r.cell) occ.add(String(r.cell).toUpperCase()); });
    const letters = "ABCDE";
    for(let r=1; r<=5; r++) {
      for(let c=0; c<5; c++) {
        let cs = r + letters[c];
        if(!occ.has(cs)) return cs;
      }
    }
  } catch(e) { console.error(e); }
  return "";
};

window.duplicateActiveRow = function() {
  try {
    let rIdx = window.lastActiveRowIdx;
    if (typeof selectedRows !== 'undefined' && selectedRows.size > 0) {
      rIdx = Array.from(selectedRows)[0];
    }
    if (rIdx < 0 && linksData.length > 0) rIdx = linksData.length - 1; 

    if (rIdx >= 0 && rIdx < linksData.length) {
       const newRow = JSON.parse(JSON.stringify(linksData[rIdx]));
       newRow.cell = window.getFirstEmptyCell();
       linksData.splice(rIdx + 1, 0, newRow);

       try { localStorage.setItem('seeandlearn-links', JSON.stringify(linksData)); } catch(e){}

       if(window.renderTableEditor) window.renderTableEditor();

       window.lastActiveRowIdx = rIdx + 1;

       const btn = document.getElementById('btn-duplicate-row-action');
       if(btn) {
         const oldBg = btn.style.background;
         btn.style.background = '#fff';
         btn.style.color = '#000';
         setTimeout(() => {
           btn.style.background = oldBg;
           btn.style.color = '#eaf';
         }, 200);
       }

       setTimeout(() => {
         const isVidNode = newRow.asset && window.parseVideoAsset && window.parseVideoAsset(newRow.asset) !== null;
         if (isVidNode && window.openVideoEditor) {
           window.openVideoEditor(linksData[rIdx + 1]);
         }
       }, 200);
    } else {
       alert("No row selected to duplicate! Click on a row first.");
    }
  } catch(err) {
    alert("Duplicate Error: " + err.message);
  }
};

window.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    const jsonMod = document.getElementById('jsonModal');
    if (jsonMod && jsonMod.classList.contains('open')) {
      e.preventDefault();
      e.stopPropagation();
      window.duplicateActiveRow();
    }
  }
}, true); // Use capture phase to beat browser default Ctrl+D

// Wait until DOM is ready to bind the button, or bind it directly to the document
document.addEventListener('click', function(e) {
  if (e.target && e.target.id === 'btn-duplicate-row-action') {
    window.duplicateActiveRow();
  }
});




