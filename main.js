async function init(){
  setupLayout(); syncFit(); syncAdminUI();

  // Data loading priority:
  //   1. localStorage (seeandlearn-links or mlynx-links) — your saved edits
  //   2. links.json on disk — only used if localStorage is empty
  //
  // This means deploying a new zip NEVER overwrites your saved data.
  // To reset to the bundled links.json, use "Load from file" (Import button)
  // or clear localStorage in DevTools.
  const lsSaved = localStorage.getItem('seeandlearn-links') || localStorage.getItem('mlynx-links');
  if (lsSaved) {
    try {
      linksData = JSON.parse(lsSaved);
    } catch(e) { linksData = []; }
  } else {
    // First run — no localStorage yet — load from links.json
    try {
      const r = await fetch('links.json?v=' + Date.now());
      linksData = await r.json();
    } catch(e) { linksData = []; }
  }

  // Migrate legacy field names
  linksData.forEach(row => {
    if ('asset' in row && !('VidRange' in row)) {
      row.VidRange = row.asset;
      delete row.asset;
    }
  });
  render();
}

init();
window.addEventListener('resize',()=>{ setupLayout(); render(); });
window.addEventListener('orientationchange',()=>setTimeout(()=>{ setupLayout(); render(); },350));

// ─── FastLinkPaste ────────────────────────────────────────────────────────────
var flPendingCell  = '';   // cell that was assigned when URL was validated
var flPendingLink  = '';   // the URL just saved

function flShowStep1() {
  document.getElementById('flStep1').style.display = 'flex';
  document.getElementById('flStep2').style.display = 'none';
  document.getElementById('fastLinkInput').value  = '';
  document.getElementById('fastLinkPreview').textContent = '';
  document.getElementById('fastLinkStatus').textContent  = '';
  flPendingCell = '';
  flPendingLink = '';
  setTimeout(() => document.getElementById('fastLinkInput').focus(), 80);
}

function flPopulateCnameList() {
  const dl = document.getElementById('flCnameList');
  dl.innerHTML = '';
  // Collect all individual cname terms (split on comma)
  const terms = new Set();
  linksData.forEach(r => {
    if (r.cname) r.cname.split(',').map(s=>s.trim()).filter(Boolean).forEach(t=>terms.add(t));
  });
  Array.from(terms).sort().forEach(t => {
    const opt = document.createElement('option'); opt.value = t; dl.appendChild(opt);
  });
}

function flSaveUrl(url) {
  const occ = occupied();
  let nextCell = '';
  outer: for(let r=1;r<=ROWS;r++) for(let c=1;c<=COLS;c++) {
    const cs=mkCell(r,c); if(!occ.has(cs)){nextCell=cs;break outer;}
  }
  if (!nextCell) {
    document.getElementById('fastLinkStatus').textContent = 'No empty cells!';
    return false;
  }
  const d=new Date();
  const da=`${String(d.getFullYear()).slice(-2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}.${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}.${String(d.getSeconds()).padStart(2,'0')}`;
  linksData.push({show:"1",VidRange:"i",cell:nextCell,fit:"fc",link:url,cname:"",sname:"",attribution:"",comment:"",DateAdded:da,Mute:"1"});
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  flPendingCell = nextCell;
  flPendingLink = url;
  return nextCell;
}

document.getElementById('miFastLinks').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  if(typeof isAdmin==='function'&&!isAdmin()){alert('Admin privileges required.');return;}
  document.getElementById('fastLinkModal').style.display = 'flex';
  flShowStep1();
});

document.getElementById('fastLinkPasteTop').addEventListener('click', async () => {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) return;
    document.getElementById('fastLinkInput').value = text;
    document.getElementById('fastLinkInput').dispatchEvent(new Event('input'));
  } catch(err) {
    document.getElementById('fastLinkStatus').textContent = 'Clipboard blocked — paste manually.';
  }
});

document.getElementById('fastLinkInput').addEventListener('input', function() {
  const val = this.value.trim();
  document.getElementById('fastLinkPreview').textContent = val.length > 50 ? val.slice(0,50)+'…' : val;
  if (!val) { document.getElementById('fastLinkStatus').textContent=''; return; }
  if (!/^https?:\/\//i.test(val)) {
    document.getElementById('fastLinkStatus').textContent = 'Waiting for valid URL…';
    return;
  }
  // Valid URL → save it, advance to step 2
  const cell = flSaveUrl(val);
  if (!cell) return;
  document.getElementById('flCellName').textContent = cell;
  document.getElementById('fastLinkCname').value = '';
  flPopulateCnameList();
  document.getElementById('flStep1').style.display = 'none';
  document.getElementById('flStep2').style.display = 'flex';
  setTimeout(() => document.getElementById('fastLinkCname').focus(), 80);
});

// Next: save cname to the pending entry, reset for another URL
document.getElementById('flNext').addEventListener('click', () => {
  const cname = document.getElementById('fastLinkCname').value.trim();
  if (cname && flPendingCell) {
    const entry = linksData.find(r => r.cell === flPendingCell);
    if (entry) entry.cname = cname;
    localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  }
  render();
  flShowStep1();   // ready for next URL
});

// Skip cname: just reset
document.getElementById('flSkip').addEventListener('click', () => {
  render();
  flShowStep1();
});

// Ctrl+Enter in cname = Next
document.getElementById('fastLinkCname').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('flNext').click(); }
});

document.getElementById('fastLinkExit').addEventListener('pointerup', () => {
  document.getElementById('fastLinkModal').style.display = 'none';
  render();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (typeof stopColResize === 'function' && isColResizing) {
      stopColResize();
    }
    const jsonMod = document.getElementById('jsonModal');
    if (jsonMod && jsonMod.classList.contains('open')) {
      jsonMod.classList.remove('open');
      render();
    }
    const fastMod = document.getElementById('fastLinkModal');
    if (fastMod && fastMod.style.display === 'flex') {
      fastMod.style.display = 'none';
      render();
    }
  }
});


window.addEventListener('keydown', e => {
  if (e.key === 'Control') document.body.classList.add('ctrl-pressed');

  if (e.ctrlKey && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
      // Simulate click
      const ev = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
      menuBtn.dispatchEvent(ev);
    }
  }

  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 't') {
    const menuPanel = document.getElementById('menuPanel');
    if (menuPanel && menuPanel.classList.contains('open')) {
       // If hamburger is open, trigger Tables
       e.preventDefault();
       const miTables = document.getElementById('miTables');
       if (miTables) {
         const ev = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
         miTables.dispatchEvent(ev);
       }
    }
  }
});

window.addEventListener('keyup', e => {
  if (e.key === 'Control') document.body.classList.remove('ctrl-pressed');
});
window.addEventListener('blur', () => {
  document.body.classList.remove('ctrl-pressed');
});


window.rKeyDown = false;
window.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'r') window.rKeyDown = true; });
window.addEventListener('keyup', e => { if (e.key.toLowerCase() === 'r') window.rKeyDown = false; });
