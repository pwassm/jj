async function init(){
  setupLayout(); syncFit(); syncAdminUI();
  try{
    const r=await fetch('links.json?v='+Date.now());
    linksData=await r.json();
  }catch(e){
    try{ const ls=(localStorage.getItem('seeandlearn-links') || localStorage.getItem('mlynx-links')); linksData=ls?JSON.parse(ls):[]; }catch(e2){ linksData=[]; }
  }
  render();
}

init();
window.addEventListener('resize',()=>{ setupLayout(); render(); });
window.addEventListener('orientationchange',()=>setTimeout(()=>{ setupLayout(); render(); },350));

document.getElementById('miFastLinks').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  if(typeof isAdmin === 'function' && !isAdmin()) { alert('Admin privileges required.'); return; }
  document.getElementById('fastLinkInput').value = '';
  document.getElementById('fastLinkStatus').textContent = 'Ready.';
  document.getElementById('fastLinkStatus').style.color = '#888';
  document.getElementById('fastLinkModal').style.display = 'flex';
  setTimeout(() => {
    const inp = document.getElementById('fastLinkInput');
    inp.focus();
  }, 100);
});

document.getElementById('fastLinkPasteTop').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const inp = document.getElementById('fastLinkInput');
    inp.value = text;
    inp.dispatchEvent(new Event('input'));
  } catch (err) {
    document.getElementById('fastLinkStatus').textContent = 'Clipboard blocked. Tap the box to paste manually.';
    document.getElementById('fastLinkStatus').style.color = '#f66';
  }
});

document.getElementById('fastLinkExit').addEventListener('pointerup', () => {
  document.getElementById('fastLinkModal').style.display = 'none';
  render();
});

document.getElementById('fastLinkInput').addEventListener('input', function() {
  const val = this.value.trim();
  if (!val) return;
  if (!/^https?:\/\//i.test(val)) {
    document.getElementById('fastLinkStatus').textContent = 'Waiting for valid URL...';
    document.getElementById('fastLinkStatus').style.color = '#f66';
    return;
  }
  const occ = occupied();
  let nextCell = "";
  outer: for(let r=1; r<=ROWS; r++) {
    for(let c=1; c<=COLS; c++) {
      const cs = mkCell(r, c);
      if(!occ.has(cs)) { nextCell = cs; break outer; }
    }
  }

  if (!nextCell) {
    document.getElementById('fastLinkStatus').textContent = 'No empty cells available!';
    document.getElementById('fastLinkStatus').style.color = '#f66';
    return;
  }

  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const dateAdded = `${yy}.${mm}.${dd}.${hh}.${min}.${ss}`;

  linksData.push({
    show: "1", asset: "i", cell: nextCell, fit: "fc", link: val,
    cname: "", sname: "", attribution: "", comment: "", DateAdded: dateAdded, Mute: "1"
  });
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));

  document.getElementById('fastLinkStatus').textContent = `Saved to ${nextCell}: ${val.substring(0,25)}...`;
  document.getElementById('fastLinkStatus').style.color = '#9f9';
  this.value = '';
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
