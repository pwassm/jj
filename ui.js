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
let recycleData = JSON.parse(localStorage.getItem('seeandlearn-recycle') || '[]');
window.tabulatorTable = null;

function calcPortrait() {
  if(!tableKeys.includes('Portrait')) return;
  linksData.forEach((row, i) => {
    if((row.Portrait === undefined || row.Portrait === "") && row.link && row.link.match(/^https?:/i)) {
      const img = new Image();
      img.onload = () => {
        const val = img.width < img.height ? "1" : "0";
        if(row.Portrait !== val) {
          row.Portrait = val;
          try { localStorage.setItem('seeandlearn-links', JSON.stringify(linksData)); } catch(e){}
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

window.renderTableEditor = function() {
  const container = document.getElementById('tableEditor');
  if(!container) {
    console.error('tableEditor container not found');
    return;
  }

  if(tableKeys.length === 0) initTableKeys();

  // Destroy existing table if present
  if (window.tabulatorTable) {
      window.tabulatorTable.destroy();
  }

  // Build columns
  let cols = [
      {formatter:"rowSelection", titleFormatter:"rowSelection", hozAlign:"center", headerSort:false, width:50, cellClick:function(e, cell){ cell.getRow().toggleSelect(); }}
  ];

  tableKeys.forEach(k => {
      let colDef = { 
          title: k, 
          field: k, 
          editor: "input", 
          headerFilter: "input", 
          width: 150,
          resizable: true
      };

      // Dropdown for cname and v.author
      if (k === 'cname' || k === 'v.author') {
          colDef.editor = "autocomplete";
          colDef.editorParams = { 
              values: true, 
              autocomplete: true, 
              allowEmpty: true,
              clearable: true 
          };
      }

      cols.push(colDef);
  });

  window.tabulatorTable = new Tabulator("#tableEditor", {
      data: linksData,
      reactiveData: true,
      layout: "fitColumns",
      columns: cols,
      history: true, // Undo/Redo
      rowSelection: "click",
      height: "100%",
      placeholder: "No data available",
      cellEdited: function(cell) {
          try { localStorage.setItem('seeandlearn-links', JSON.stringify(linksData)); } catch(e){}
          calcPortrait();
      },
      rowDeleted: function(row) {
          try { localStorage.setItem('seeandlearn-links', JSON.stringify(linksData)); } catch(e){}
      }
  });

  console.log('Tabulator initialized with', tableKeys.length, 'columns');
};

// Add Row (inserts at top)
window.addRow = function() {
  const newRow = {};
  tableKeys.forEach(k => newRow[k] = "");
  window.tabulatorTable.addRow(newRow, true);
};

// Delete Selected
document.getElementById('deleteSelectedRows').addEventListener('click', () => {
  if(!window.tabulatorTable) return;
  const selected = window.tabulatorTable.getSelectedData();
  if(selected.length === 0) return;
  if(confirm(`Delete ${selected.length} rows?`)) {
      window.tabulatorTable.deleteRow(selected);
      try { localStorage.setItem('seeandlearn-links', JSON.stringify(linksData)); } catch(e){}
  }
});

// Dup Row (duplicate selected)
window.duplicateActiveRow = function() {
  if(!window.tabulatorTable) return;
  const selected = window.tabulatorTable.getSelectedData();
  if(selected.length === 0) {
      alert("Check the box next to the row you want to duplicate.");
      return;
  }
  const rowData = JSON.parse(JSON.stringify(selected[0]));
  window.tabulatorTable.addRow(rowData, false, selected[0]);
};

// Dup Col (prompt for column name)
window.duplicateActiveCol = function() {
  const colName = prompt("Enter column name to duplicate:");
  if(!colName) return;
  if(!tableKeys.includes(colName)) {
      alert("Column '" + colName + "' not found");
      return;
  }
  const newCol = colName + "_copy";
  tableKeys.push(newCol);
  linksData.forEach(row => row[newCol] = row[colName]);
  window.tabulatorTable.addColumn({title: newCol, field: newCol, editor: "input"}, false, colName);
};

// Bind buttons
document.addEventListener('DOMContentLoaded', function() {
  const addBtn = document.getElementById('addTableItem');
  if(addBtn) addBtn.addEventListener('click', window.addRow);
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




