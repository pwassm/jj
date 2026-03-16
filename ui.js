function openFS(it){
  const img = document.getElementById('fsImg');
  img.src = it.link;
  if(isPortrait) {
    img.style.transform = 'rotate(90deg)';
    img.style.maxWidth = '95vh';
    img.style.maxHeight = '95vw';
  } else {
    img.style.transform = 'none';
    img.style.maxWidth = '95vw';
    img.style.maxHeight = '95vh';
  }
  document.getElementById('fsWrap').classList.add('open');
}
document.getElementById('fsImg').addEventListener('pointerup',e=>{
  e.stopPropagation();
  document.getElementById('fsWrap').classList.remove('open');
});
document.getElementById('fsWrap').addEventListener('pointerup',e=>{
  if(e.target===document.getElementById('fsWrap')) document.getElementById('fsWrap').classList.remove('open');
});

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
  if(tableKeys.length===0) tableKeys = ['show','asset','cell','fit','link','cname','sname','attribution','comment'];
}

function updateSelectedRowsButton() {
  const btn = document.getElementById('deleteSelectedRows');
  if(btn) btn.style.display = selectedRows.size > 0 ? 'block' : 'none';
}

window.renderTableEditor = function() {
  const container = document.getElementById('tableEditor');
  if(!container) return;
  if(tableKeys.length===0) initTableKeys();

  selectedRows = new Set(Array.from(selectedRows).filter(idx => idx < linksData.length));
  updateSelectedRowsButton();

  let html = '<div style="display:table; border-collapse:collapse; color:#fff; font-family:sans-serif; font-size:13px; table-layout:fixed;">';
  html += '<div style="display:table-row; background:#222; font-weight:bold; position:sticky; top:0; z-index:10;">';
  html += `<div style="display:table-cell; padding:8px; border:1px solid #444; width:60px; min-width:60px; max-width:60px; text-align:center;">
             <input type="checkbox" onchange="toggleSelectAll(this.checked)" ${selectedRows.size>0 && selectedRows.size===linksData.length?'checked':''}>
             <span style="margin-left:4px;">Del</span>
           </div>`;

  tableKeys.forEach((k, i) => {
    let w = colWidths[k] || 150;
    html += `<div id="th-${k}" style="display:table-cell; border:1px solid #444; background:#222; width:${w}px; min-width:${w}px; max-width:${w}px; position:sticky; top:0; z-index:10; border-bottom: 3px solid #8ef; box-shadow: 0 4px 8px rgba(0,0,0,0.5);"
               draggable="true" ondragstart="colDragStart(event, ${i})" ondragover="event.preventDefault(); this.style.background='#444'" ondragleave="this.style.background='#222'" ondrop="this.style.background='#222'; colDrop(event, ${i})">
               <div style="position:relative; width:100%; height:100%; padding:4px 12px 6px 4px; box-sizing:border-box; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between;">

                 <div style="display:flex; flex-direction:column; align-items:flex-start; gap:4px; width:14px; margin-bottom:8px;">
                   <button onclick="deleteCol('${k}')" style="background:none;border:none;color:#f66;cursor:pointer;font-size:14px;padding:0;line-height:1;width:14px;height:14px;text-align:left;" title="Delete Column">&#10006;</button>
                   <button onclick="renameCol('${k}')" style="background:none;border:none;color:#8ef;cursor:pointer;font-size:14px;padding:0;line-height:1;width:14px;height:14px;text-align:left;" title="Rename Column">&#9998;</button>
                 </div>

                 <div style="width:100%;">
                   <span style="cursor:pointer; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%; user-select:none; font-size:14px; text-align:left; color:#ccc;" onclick="sortData('${k}')" title="Sort by ${k}">${k} ${sortCol===k?(sortAsc?'\u25B2':'\u25BC'):''}</span>
                 </div>

                 <div onpointerdown="initColResize(event, '${k}')" ondragstart="event.preventDefault(); event.stopPropagation();" style="position:absolute; right:0; top:0; width:10px; height:100%; cursor:col-resize; background:transparent; z-index:12; border-left:1px solid #555;" title="Drag to resize"></div>
               </div>
             </div>`;
  });

  html += '<div style="display:table-cell; padding:8px; border:1px solid #444; width:60px; min-width:60px;"><button onclick="addCol()" style="cursor:pointer;background:#2a2a3e;color:#fff;border:1px solid #555;padding:4px 8px;border-radius:4px;">+ Col</button></div></div>';

  linksData.forEach((row, rIdx) => {
    const isSel = selectedRows.has(rIdx);
    html += `<div style="display:table-row; background:${isSel ? '#2e1c1c' : (rIdx%2===0?'#111':'#1a1a1a')};">`;
    html += `<div style="display:table-cell; padding:10px 4px 4px 4px; border:1px solid #444; text-align:center;">
               <input type="checkbox" ${isSel?'checked':''} onchange="toggleRowSelect(${rIdx}, this.checked)">
               <button onclick="deleteRow(${rIdx})" style="color:#f66;background:none;border:none;cursor:pointer;font-size:14px; margin-left:6px;" title="Delete Row">&#10006;</button>
             </div>`;
    tableKeys.forEach(k => {
      const val = (row[k] === undefined || row[k] === null) ? '' : String(row[k]).replace(/"/g, '&quot;');
      html += `<div style="display:table-cell; padding:0; border:1px solid #444; overflow:hidden;">
                 <input id="cell-${rIdx}-${k}" type="text" value="${val}" onchange="updateCell(${rIdx}, '${k}', this.value)" style="width:100%; height:100%; min-height:30px; background:transparent; color:#fff; border:none; padding:10px 8px 4px 8px; box-sizing:border-box;">
               </div>`;
    });
    html += `<div style="display:table-cell; padding:10px 4px 4px 4px; border:1px solid #444; text-align:center;">
               <button onclick="moveRow(${rIdx}, -1)" style="cursor:pointer;background:none;border:none;color:#aaa;font-size:16px;">&#9650;</button>
               <button onclick="moveRow(${rIdx}, 1)" style="cursor:pointer;background:none;border:none;color:#aaa;font-size:16px;">&#9660;</button>
             </div></div>`;
  });
  html += '</div>';
  container.innerHTML = html;
  calcPortrait();
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
        suggestedName: filename,
        types: [{ description: 'JSON File', accept: {'application/json': ['.json']} }]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonText);
      await writable.close();
      return;
    }
  } catch(e) {
    // user cancelled or error, fallback to normal download just in case? Or do nothing if aborted.
    if(e.name !== 'AbortError') console.error(e);
    return;
  }

  // Fallback for browsers that don't support showSaveFilePicker
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

(()=>{
  const d=new Date();
  document.getElementById('menuDateStamp').textContent=
    d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'})+
    ' '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
})();

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