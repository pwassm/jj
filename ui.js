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
    vidHost.dataset.noAutoPause = '1';

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

window.renderTableEditor = function() {
  const container = document.getElementById('tableEditor');
  if(!container) return;

  if(tableKeys.length === 0) initTableKeys();

  if (window.tabulatorTable) {
      // If initialized, just update data
      window.tabulatorTable.replaceData(linksData);
      return;
  }

  // Define columns dynamically from keys
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
          editable: true
      };

      // Magic feature: Turn 'cname' into an autocomplete dropdown!
      if (k === 'cname' || k === 'v.author') {
          colDef.editor = "list";
          colDef.editorParams = { autocomplete: true, clearable: true, allowEmpty: true, valuesLookup: true };
      }
      cols.push(colDef);
  });

  window.tabulatorTable = new Tabulator("#tableEditor", {
      data: linksData,
      reactiveData: true, // Auto-syncs grid edits with linksData array
      layout: "fitData",
      columns: cols,
      history: true, // Enables Ctrl+Z to undo
      rowFormatter: function(row) {
          // Highlight empty cells or specific rules
      },
      cellEdited: function(cell) {
          try { localStorage.setItem('seeandlearn-links', JSON.stringify(linksData)); } catch(e){}
          calcPortrait();
      }
  });
};

// Add Row
window.addRow = function() {
  const newRow = {};
  tableKeys.forEach(k => newRow[k] = "");
  if(window.tabulatorTable) window.tabulatorTable.addRow(newRow, true); // true = add to top
};

// Delete Selected
document.getElementById('deleteSelectedRows').addEventListener('click', () => {
  if(!window.tabulatorTable) return;
  let selected = window.tabulatorTable.getSelectedRows();
  if(selected.length === 0) { alert("Check the boxes next to rows you want to delete."); return; }

  if(confirm(`Delete ${selected.length} rows?`)) {
      selected.forEach(row => {
          recycleData.push(row.getData());
          row.delete();
      });
      localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
      localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  }
});

// Duplicate Row
window.duplicateActiveRow = function() {
  if(!window.tabulatorTable) return;
  let selected = window.tabulatorTable.getSelectedRows();
  if(selected.length === 0) {
      alert("Please check the box next to the row you want to duplicate.");
      return;
  }

  let rowToDup = selected[0];
  let newRowData = JSON.parse(JSON.stringify(rowToDup.getData()));
  if(window.getFirstEmptyCell) {
      try { newRowData.cell = window.getFirstEmptyCell(); } catch(e) {}
  }

  window.tabulatorTable.addRow(newRowData, false, rowToDup); // insert below
  try { localStorage.setItem('seeandlearn-links', JSON.stringify(linksData)); } catch(e){}

  const btn = document.getElementById('btn-duplicate-row-action');
  if (btn) {
      const oldBg = btn.style.background;
      btn.style.background = '#fff'; btn.style.color = '#000';
      setTimeout(() => { btn.style.background = oldBg; btn.style.color = '#eaf'; }, 200);
  }
};

// Duplicate Column
window.duplicateActiveCol = function() {
  if(!window.tabulatorTable) return;
  let colToCopy = prompt("Enter the exact column name to duplicate (e.g., v.title, cname, comment):");
  if(!colToCopy) return;
  if(!tableKeys.includes(colToCopy)) {
      alert(`Column '${colToCopy}' not found!`);
      return;
  }

  let newCol = colToCopy + "_copy";
  let counter = 1;
  while(tableKeys.includes(newCol)) {
      counter++;
      newCol = colToCopy + "_copy" + counter;
  }

  tableKeys.push(newCol);

  // Clone data
  linksData.forEach(r => {
      if(r[colToCopy] !== undefined) r[newCol] = JSON.parse(JSON.stringify(r[colToCopy]));
  });

  window.tabulatorTable.addColumn({
      title: newCol, 
      field: newCol, 
      editor: "input", 
      headerFilter: "input"
  }, false, colToCopy);

  try { localStorage.setItem('seeandlearn-links', JSON.stringify(linksData)); } catch(e){}
};

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

document.getElementById('togAutoPause').checked = window.autoPauseMode;
document.getElementById('togAutoPause').addEventListener('change', function() {
  window.autoPauseMode = this.checked;
  localStorage.setItem('seeandlearn-autopause', window.autoPauseMode ? 'true' : 'false');
});

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

window.lastActiveColKey = null;
document.addEventListener('focusin', function(e) {
  if (e.target && e.target.id && e.target.id.startsWith('cell-')) {
    const parts = e.target.id.split('-');
    window.lastActiveRowIdx = parseInt(parts[1]);
    if (parts.length > 2) {
      window.lastActiveColKey = parts.slice(2).join('-');
    }
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






