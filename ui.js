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



  const letters = "ABCDE";
  for(let r=1; r<=5; r++) {
    for(let c=0; c<5; c++) {
      let cs = r + letters[c];
      if(!occ.has(cs)) return cs;
    }
  }
  return "";
};

window.duplicateActiveRow = function() {
  let rIdx = -1;
  const ae = document.activeElement;
  if (ae && ae.id && ae.id.startsWith('cell-')) {
    rIdx = parseInt(ae.id.split('-')[1]);
  } else if (window.selectedRows && window.selectedRows.size > 0) {
    rIdx = Array.from(window.selectedRows)[0];
  }
  if (rIdx >= 0 && rIdx < window.linksData.length) {
     const newRow = JSON.parse(JSON.stringify(window.linksData[rIdx]));
     newRow.cell = window.getFirstEmptyCell();
     window.linksData.splice(rIdx + 1, 0, newRow);
     localStorage.setItem('seeandlearn-links', JSON.stringify(window.linksData));
     if(window.renderTableEditor) window.renderTableEditor();
  }
};

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    const tableWrap = document.getElementById('tableEditorWrap');
    if (tableWrap && tableWrap.offsetParent !== null) {
      e.preventDefault();
      window.duplicateActiveRow();
    }
  }
});

// Need to bind the button too after render or dynamically. We can do it here by intercepting clicks on the document
document.addEventListener('click', function(e) {
  if (e.target && e.target.id === 'btn-duplicate-row') {
    window.duplicateActiveRow();
  }
});


window.lastActiveRowIdx = -1;

document.addEventListener('focusin', function(e) {
  if (e.target && e.target.id && e.target.id.startsWith('cell-')) {
    window.lastActiveRowIdx = parseInt(e.target.id.split('-')[1]);
  }
});

window.getFirstEmptyCell = function() {
  const occ = new Set();
  window.linksData.forEach(r => { if(r.cell) occ.add(r.cell.toUpperCase()); });
  const letters = "ABCDE";
  for(let r=1; r<=5; r++) {
    for(let c=0; c<5; c++) {
      let cs = r + letters[c];
      if(!occ.has(cs)) return cs;
    }
  }
  return "";
};

window.duplicateActiveRow = function() {
  let rIdx = window.lastActiveRowIdx;
  if (window.selectedRows && window.selectedRows.size > 0) {
    rIdx = Array.from(window.selectedRows)[0];
  }
  if (rIdx < 0 && window.linksData.length > 0) rIdx = window.linksData.length - 1; 

  if (rIdx >= 0 && rIdx < window.linksData.length) {
     const newRow = JSON.parse(JSON.stringify(window.linksData[rIdx]));
     newRow.cell = window.getFirstEmptyCell();
     window.linksData.splice(rIdx + 1, 0, newRow);
     localStorage.setItem('seeandlearn-links', JSON.stringify(window.linksData));
     if(window.renderTableEditor) window.renderTableEditor();

     // Set new row as active
     window.lastActiveRowIdx = rIdx + 1;

     // Open video editor if it's a video
     setTimeout(() => {
       const isVidNode = newRow.asset && window.parseVideoAsset && window.parseVideoAsset(newRow.asset) !== null;
       if (isVidNode && window.openVideoEditor) {
         window.openVideoEditor(window.linksData[rIdx + 1]);
       }
     }, 200);
  }
};

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    const tableWrap = document.getElementById('tableEditorWrap');
    if (tableWrap && tableWrap.offsetParent !== null) {
      e.preventDefault();
      window.duplicateActiveRow();
    }
  }
});
