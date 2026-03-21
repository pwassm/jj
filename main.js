async function init(){
  setupLayout(); syncFit(); syncAdminUI();

  // Data loading strategy (works for both file:/// and http://):
  //
  // Priority:
  //   1. fetch('links.json') — works on http/https, gets fresh server copy
  //   2. window.LINKS_JSON_INLINE — embedded in index.html, always works including file:///
  //   3. localStorage — saved edits from previous sessions
  //
  // If localStorage has MORE rows than the file, it has unsaved edits → keep localStorage.
  // This means local edits are never silently discarded, and file:/// always works.

  let fileData = null;
  try {
    const r = await fetch('links.json?v=' + Date.now());
    if (r.ok) fileData = await r.json();
  } catch(e) {
    // fetch() blocked (file:///) or network error
  }
  // Fallback: use the data embedded inline in index.html
  if (!fileData && window.LINKS_JSON_INLINE) {
    fileData = window.LINKS_JSON_INLINE;
  }

  const lsRaw = localStorage.getItem('seeandlearn-links') || localStorage.getItem('mlynx-links');
  let lsData = null;
  if (lsRaw) {
    try { lsData = JSON.parse(lsRaw); } catch(e) {}
  }

  if (fileData && Array.isArray(fileData) && fileData.length > 0) {
    if (lsData && Array.isArray(lsData) && lsData.length > fileData.length) {
      // localStorage has more rows → user has unsaved edits
      linksData = lsData;
    } else {
      // File data is authoritative
      linksData = fileData;
      // Seed localStorage so next load (including file:///) has a copy
      localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
    }
  } else if (lsData && Array.isArray(lsData) && lsData.length > 0) {
    linksData = lsData;
  } else {
    linksData = [];
  }

  // Migrate legacy field names
  linksData.forEach(row => {
    if ('asset' in row && !('VidRange' in row)) {
      row.VidRange = row.asset;
      delete row.asset;
    }
    // Normalize V.Title → v.title, V.Author → v.author (capital V was old convention)
    if ('V.Title' in row && !('v.title' in row)) {
      row['v.title'] = row['V.Title'];
      delete row['V.Title'];
    }
    if ('V.Author' in row && !('v.author' in row)) {
      row['v.author'] = row['V.Author'];
      delete row['V.Author'];
    }
    // Remove old uppercase duplicates if both exist
    if ('V.Title' in row && 'v.title' in row) delete row['V.Title'];
    if ('V.Author' in row && 'v.author' in row) delete row['V.Author'];
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

// ── Shared dropdown arrow-key navigation ─────────────────────────────────────
function flDropdownNav(ddId, inpEl, e, onSelect) {
  const dd = document.getElementById(ddId);
  if (!dd || dd.style.display === 'none') return false;
  const items = Array.from(dd.querySelectorAll('[data-fl-item]'));
  if (!items.length) return false;
  const cur = dd.querySelector('[data-fl-focus]');
  let idx = cur ? items.indexOf(cur) : -1;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (cur) { cur.removeAttribute('data-fl-focus'); cur.style.background = ''; }
    idx = Math.min(idx + 1, items.length - 1);
    items[idx].setAttribute('data-fl-focus', '1');
    items[idx].style.background = '#1a3a5a';
    items[idx].scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (cur) { cur.removeAttribute('data-fl-focus'); cur.style.background = ''; }
    idx = Math.max(idx - 1, 0);
    items[idx].setAttribute('data-fl-focus', '1');
    items[idx].style.background = '#1a3a5a';
    items[idx].scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (e.key === 'Enter' && cur) {
    e.preventDefault();
    onSelect(cur.textContent);
    return true;
  }
  return false;
}

function flPickCname(t) {
  const inp = document.getElementById('fastLinkCname');
  const parts = inp.value.split(',');
  parts[parts.length - 1] = ' ' + t;
  inp.value = parts.join(',') + ', ';
  document.getElementById('flCnameDropdown').style.display = 'none';
  inp.focus(); flUpdateCnameDropdown();
}

function flPickTopic(t) {
  const inp = document.getElementById('fastLinkTopic');
  const parts = inp.value.split(',');
  parts[parts.length - 1] = ' ' + t;
  inp.value = parts.join(',') + ', ';
  document.getElementById('flTopicDropdown').style.display = 'none';
  inp.focus(); flUpdateTopicDropdown();
}

function flShowDropdown(terms) {
  const dd  = document.getElementById('flCnameDropdown');
  const inp = document.getElementById('fastLinkCname');
  dd.innerHTML = '';
  if (!terms.length) { dd.style.display = 'none'; return; }
  terms.forEach(t => {
    const item = document.createElement('div');
    item.textContent = t;
    item.setAttribute('data-fl-item', '1');
    item.style.cssText = 'padding:6px 10px;cursor:pointer;font-size:13px;color:#cef;border-bottom:1px solid #244;';
    item.addEventListener('mouseenter', () => { item.setAttribute('data-fl-focus','1'); item.style.background = '#1a3a5a'; });
    item.addEventListener('mouseleave', () => { item.removeAttribute('data-fl-focus'); item.style.background = ''; });
    item.addEventListener('mousedown', e => { e.preventDefault(); flPickCname(t); });
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
  document.getElementById('fastLinkTopic').value  = '';
  document.getElementById('fastLinkStatus').textContent = '';
  document.getElementById('flCnameDropdown').style.display = 'none';
  document.getElementById('flTopicDropdown').style.display = 'none';
  flPendingCell = '';
  setTimeout(() => document.getElementById('fastLinkInput').focus(), 80);
}

function flGetTopicTerms() {
  const s = new Set();
  linksData.forEach(r => {
    if (r.Topic) r.Topic.split(',').map(t => t.trim()).filter(Boolean).forEach(t => s.add(t));
  });
  return Array.from(s).sort();
}

function flShowTopicDropdown(terms) {
  const dd  = document.getElementById('flTopicDropdown');
  dd.innerHTML = '';
  if (!terms.length) { dd.style.display = 'none'; return; }
  terms.forEach(t => {
    const item = document.createElement('div');
    item.textContent = t;
    item.setAttribute('data-fl-item', '1');
    item.style.cssText = 'padding:6px 10px;cursor:pointer;font-size:13px;color:#bbb;border-bottom:1px solid #244;';
    item.addEventListener('mouseenter', () => { item.setAttribute('data-fl-focus','1'); item.style.background = '#1a3a5a'; });
    item.addEventListener('mouseleave', () => { item.removeAttribute('data-fl-focus'); item.style.background = ''; });
    item.addEventListener('mousedown', e => { e.preventDefault(); flPickTopic(t); });
    dd.appendChild(item);
  });
  dd.style.display = 'block';
}

function flUpdateTopicDropdown() {
  const inp = document.getElementById('fastLinkTopic');
  const parts = inp.value.split(',');
  const last = parts[parts.length - 1].trimStart();
  const terms = flGetTopicTerms();
  flShowTopicDropdown(last ? terms.filter(t => t.toLowerCase().startsWith(last.toLowerCase())) : terms);
}

document.getElementById('fastLinkTopic').addEventListener('input',  flUpdateTopicDropdown);
document.getElementById('fastLinkTopic').addEventListener('focus',  flUpdateTopicDropdown);
document.getElementById('fastLinkTopic').addEventListener('blur',   () => setTimeout(() => { document.getElementById('flTopicDropdown').style.display='none'; }, 150));
document.getElementById('fastLinkTopic').addEventListener('keydown', e => {
  if (flDropdownNav('flTopicDropdown', document.getElementById('fastLinkTopic'), e, flPickTopic)) return;
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('flNext').click(); }
  if (e.key === 'Escape') document.getElementById('flTopicDropdown').style.display = 'none';
  if (e.key === 'Tab') { e.preventDefault(); document.getElementById('flNext').focus(); }
});

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
document.getElementById('fastLinkCname').addEventListener('input',  flUpdateCnameDropdown);
document.getElementById('fastLinkCname').addEventListener('focus',  flUpdateCnameDropdown);
document.getElementById('fastLinkCname').addEventListener('blur',   () => setTimeout(() => { document.getElementById('flCnameDropdown').style.display='none'; }, 150));
document.getElementById('fastLinkCname').addEventListener('keydown', e => {
  if (flDropdownNav('flCnameDropdown', document.getElementById('fastLinkCname'), e, flPickCname)) return;
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('flNext').click(); }
  if (e.key === 'Escape') { document.getElementById('flCnameDropdown').style.display='none'; }
  if (e.key === 'Tab') { e.preventDefault(); document.getElementById('fastLinkTopic').focus(); }
});

// Next — save link + cname, reset for another
document.getElementById('flNext').addEventListener('click', () => {
  const link  = document.getElementById('fastLinkInput').value.trim();
  const cname = document.getElementById('fastLinkCname').value.trim();
  const topic = document.getElementById('fastLinkTopic').value.trim();
  if (!link) { document.getElementById('fastLinkStatus').textContent = 'Need a URL first.'; return; }
  if (!/^https?:\/\//i.test(link)) { document.getElementById('fastLinkStatus').textContent = 'Not a valid URL.'; return; }

  const occ = occupied();
  let nextCell = '';
  outer: for(let r=1;r<=ROWS;r++) for(let c=1;c<=COLS;c++) {
    const cs=mkCell(r,c); if(!occ.has(cs)){nextCell=cs;break outer;}
  }
  if (!nextCell) { document.getElementById('fastLinkStatus').textContent = 'No empty cells!'; return; }

  const d=new Date();
  const da=`${String(d.getFullYear()).slice(-2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}.${String(d.getHours()).padStart(2,'0')}.${String(d.getMinutes()).padStart(2,'0')}.${String(d.getSeconds()).padStart(2,'0')}`;
  linksData.push({show:"1",VidRange:"i",cell:nextCell,fit:"fc",link,cname,Topic:topic,sname:"",attribution:"",comment:"",DateAdded:da,Mute:"1"});
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  render();
  document.getElementById('fastLinkStatus').textContent = '✓ Saved to ' + nextCell;
  flReset();
});

// Skip — save link only, reset
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
      linksData.push({show:"1",VidRange:"i",cell:nextCell,fit:"fc",link,cname:"",Topic:"",sname:"",attribution:"",comment:"",DateAdded:da,Mute:"1"});
      localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
      render();
    }
  }
  flReset();
});

document.getElementById('fastLinkExit').addEventListener('pointerup', () => {
  document.getElementById('fastLinkModal').style.display = 'none';
  document.getElementById('flCnameDropdown').style.display = 'none';
  document.getElementById('flTopicDropdown').style.display = 'none';
  render();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (typeof stopColResize === 'function' && isColResizing) {
      stopColResize();
    }
    const jsonMod = document.getElementById('jsonModal');
    if (jsonMod && jsonMod.classList.contains('open')) {
      if (window.closeTableEditor) window.closeTableEditor();
      else { jsonMod.classList.remove('open'); render(); }
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
