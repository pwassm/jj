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

  // ── Deep-link: ?id=UNIQUEID opens VideoShow directly ─────────────────────
  // Usage: pwassm.github.io/jj/?id=ABC123
  // Match against UniqID field. Add a UniqID column to links.json to use this.
  const urlId = new URLSearchParams(location.search).get('id');
  if (urlId) {
    const target = linksData.find(r => String(r.UniqID || '') === String(urlId));
    if (target) {
      setTimeout(function() { if (window.openFS) window.openFS(target); }, 500);
    } else {
      console.warn('SeeAndLearn: no row found for ?id=' + urlId);
    }
  }
}

init();
window.addEventListener('resize',()=>{ setupLayout(); render(); });
window.addEventListener('orientationchange',()=>setTimeout(()=>{ setupLayout(); render(); },350));

// ─── FastLinkPaste ────────────────────────────────────────────────────────────
var flPendingCell = '';

function flGetCnameTerms() {
  const s = new Set();
  linksData.forEach(r => {
    if (r.cname) r.cname.split(',').map(t => t.trim()).filter(Boolean).forEach(t => s.add(t));
  });
  return Array.from(s).sort();
}

function flShowDropdown(terms) {
  const dd  = document.getElementById('flCnameDropdown');
  const inp = document.getElementById('fastLinkCname');
  dd.innerHTML = '';
  if (!terms.length) { dd.style.display = 'none'; return; }
  terms.forEach(t => {
    const item = document.createElement('div');
    item.textContent = t;
    item.style.cssText = 'padding:9px 12px;cursor:pointer;font-size:14px;color:#cef;border-bottom:1px solid #244;';
    item.addEventListener('mouseenter', () => item.style.background = '#1a3a5a');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      // Splice this term into the last token position
      const parts = inp.value.split(',');
      parts[parts.length - 1] = ' ' + t;
      inp.value = parts.join(',') + ', ';
      dd.style.display = 'none';
      inp.focus();
      // Update for next token
      flUpdateCnameDropdown();
    });
    dd.appendChild(item);
  });
  dd.style.display = 'block';
}

function flUpdateCnameDropdown() {
  const inp   = document.getElementById('fastLinkCname');
  const parts = inp.value.split(',');
  const last  = parts[parts.length - 1].trimStart();
  const terms = flGetCnameTerms();
  // Show terms that start with the current last token (case-insensitive)
  const filtered = last ? terms.filter(t => t.toLowerCase().startsWith(last.toLowerCase()))
                        : terms;
  flShowDropdown(filtered);
}

function flReset() {
  document.getElementById('fastLinkInput').value  = '';
  document.getElementById('fastLinkCname').value  = '';
  document.getElementById('fastLinkStatus').textContent = '';
  document.getElementById('flCnameDropdown').style.display = 'none';
  flPendingCell = '';
  setTimeout(() => document.getElementById('fastLinkInput').focus(), 80);
}

document.getElementById('miFastLinks').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  if (typeof isAdmin === 'function' && !isAdmin()) { alert('Admin privileges required.'); return; }
  document.getElementById('fastLinkModal').style.display = 'flex';
  flReset();
});

// Paste button — fills link field and moves focus to cname
document.getElementById('fastLinkPasteTop').addEventListener('click', async () => {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (!text) return;
    if (!/^https?:\/\//i.test(text)) {
      document.getElementById('fastLinkStatus').textContent = 'Clipboard has no URL.';
      return;
    }
    document.getElementById('fastLinkInput').value = text;
    document.getElementById('fastLinkStatus').textContent = '';
    setTimeout(() => {
      document.getElementById('fastLinkCname').focus();
      flUpdateCnameDropdown();
    }, 60);
  } catch(err) {
    document.getElementById('fastLinkStatus').textContent = 'Clipboard blocked — paste manually.';
  }
});

// cname field — comma-aware custom dropdown
document.getElementById('fastLinkCname').addEventListener('input', () => {
  flUpdateCnameDropdown();
});
document.getElementById('fastLinkCname').addEventListener('focus', () => {
  flUpdateCnameDropdown();
});
document.getElementById('fastLinkCname').addEventListener('blur', () => {
  // Slight delay so mousedown on dropdown fires first
  setTimeout(() => {
    document.getElementById('flCnameDropdown').style.display = 'none';
  }, 150);
});
document.getElementById('fastLinkCname').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('flNext').click(); }
  if (e.key === 'Escape') { document.getElementById('flCnameDropdown').style.display='none'; }
});

// Next — save link + cname, reset for another
document.getElementById('flNext').addEventListener('click', () => {
  const link  = document.getElementById('fastLinkInput').value.trim();
  const cname = document.getElementById('fastLinkCname').value.trim();
  if (!link) { document.getElementById('fastLinkStatus').textContent = 'Need a URL first.'; return; }
  if (!/^https?:\/\//i.test(link)) { document.getElementById('fastLinkStatus').textContent = 'Not a valid URL.'; return; }

  // Find next empty cell
  const occ = occupied();
  let nextCell = '';
  outer: for(let r=1;r<=ROWS;r++) for(let c=1;c<=COLS;c++) {
    const cs=mkCell(r,c); if(!occ.has(cs)){nextCell=cs;break outer;}
  }
  if (!nextCell) { document.getElementById('fastLinkStatus').textContent = 'No empty cells!'; return; }

  const d=new Date();
  const da=`${String(d.getFullYear()).slice(-2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}.${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}.${String(d.getSeconds()).padStart(2,'0')}`;
  linksData.push({show:"1",VidRange:"i",cell:nextCell,fit:"fc",link,cname,sname:"",attribution:"",comment:"",DateAdded:da,Mute:"1"});
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  render();
  document.getElementById('fastLinkStatus').textContent = '✓ Saved to ' + nextCell;
  flReset();
});

// Skip — save link only with no cname, reset
document.getElementById('flSkip').addEventListener('click', () => {
  const link = document.getElementById('fastLinkInput').value.trim();
  if (link && /^https?:\/\//i.test(link)) {
    const occ = occupied();
    let nextCell = '';
    outer: for(let r=1;r<=ROWS;r++) for(let c=1;c<=COLS;c++) {
      const cs=mkCell(r,c); if(!occ.has(cs)){nextCell=cs;break outer;}
    }
    if (nextCell) {
      const d=new Date();
      const da=`${String(d.getFullYear()).slice(-2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}.${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}.${String(d.getSeconds()).padStart(2,'0')}`;
      linksData.push({show:"1",VidRange:"i",cell:nextCell,fit:"fc",link,cname:"",sname:"",attribution:"",comment:"",DateAdded:da,Mute:"1"});
      localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
      render();
    }
  }
  flReset();
});

document.getElementById('fastLinkExit').addEventListener('pointerup', () => {
  document.getElementById('fastLinkModal').style.display = 'none';
  document.getElementById('flCnameDropdown').style.display = 'none';
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

  if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'l') {
    const menuPanel = document.getElementById('menuPanel');
    if (menuPanel && menuPanel.classList.contains('open')) {
      // If hamburger is open, trigger FastLinks
      e.preventDefault();
      const miFast = document.getElementById('miFastLinks');
      if (miFast) {
        const ev = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
        miFast.dispatchEvent(ev);
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
