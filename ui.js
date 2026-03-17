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
  if(tableKeys.length===0) initTableKeys();

  selectedRows = new Set(Array.from(selectedRows).filter(idx => idx < linksData.length));
  updateSelectedRowsButton();

  let html = '<div style="display:table; border-collapse:collapse; color:#fff; font-family:sans-serif; font-size:13px; table-layout:fixed;">';
  html += '<div style="display:table-row; font-weight:bold; position:sticky; top:0; z-index:10; background:#222; box-shadow: 0 4px 10px rgba(0,0,0,0.8);">';
  html += `<div style="display:table-cell; padding:12px 8px; border:1px solid #444; border-top:2px solid #8ef; border-bottom:2px solid #8ef; width:60px; min-width:60px; max-width:60px; text-align:center; vertical-align:bottom; box-sizing:border-box;">
             <input type="checkbox" onchange="toggleSelectAll(this.checked)" ${selectedRows.size>0 && selectedRows.size===linksData.length?'checked':''}>
             <span style="margin-left:4px;">Del</span>
           </div>`;

  tableKeys.forEach((k, i) => {
    let w = colWidths[k] || 150;
    html += `<div id="th-${k}" style="display:table-cell; border:1px solid #444; border-top:2px solid #8ef; border-bottom:2px solid #8ef; background:#222; width:${w}px; min-width:${w}px; max-width:${w}px; position:relative; box-sizing:border-box; vertical-align:bottom;" 
               draggable="true" ondragstart="colDragStart(event, ${i})" ondragover="event.preventDefault(); this.style.background='#444'" ondragleave="this.style.background='#222'" ondrop="this.style.background='#222'; colDrop(event, ${i})">
               <div style="position:relative; width:100%; min-height:60px; padding:12px 12px 8px 6px; box-sizing:border-box;">

                 <div style="display:flex; flex-direction:column; align-items:flex-start; gap:4px; margin-bottom:12px;">
                   <button onclick="deleteCol('${k}')" style="background:none;border:none;color:#f66;cursor:pointer;font-size:14px;padding:0;line-height:1;text-align:left;" title="Delete Column">&#10006;</button>
                   <button onclick="renameCol('${k}')" style="background:none;border:none;color:#8ef;cursor:pointer;font-size:14px;padding:0;line-height:1;text-align:left;" title="Rename Column">&#9998;</button>
                 </div>

                 <span style="cursor:pointer; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%; user-select:none; font-size:14px; text-align:left; color:#ccc;" onclick="sortData('${k}')" title="Sort by ${k}">${k} ${sortCol===k?(sortAsc?'\u25B2':'\u25BC'):''}</span>

                 <div onpointerdown="initColResize(event, '${k}')" ondragstart="event.preventDefault(); event.stopPropagation();" style="position:absolute; right:0; top:0; width:10px; height:100%; cursor:col-resize; background:transparent; z-index:12; border-left:1px solid #555;" title="Drag to resize"></div>
               </div>
             </div>`;
  });

  html += '<div style="display:table-cell; padding:12px 8px; border:1px solid #444; border-top:2px solid #8ef; border-bottom:2px solid #8ef; width:60px; min-width:60px; background:#222; vertical-align:bottom; box-sizing:border-box;"><button onclick="addCol()" style="cursor:pointer;background:#2a2a3e;color:#fff;border:1px solid #555;padding:4px 8px;border-radius:4px;">+ Col</button></div></div>';

  html += '<div style="display:table-row; height:12px; background:transparent;"></div>';

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




