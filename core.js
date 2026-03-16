'use strict';

const COLS=5, ROWS=5, LETTERS="abcde";
const ISMOBILE = ('ontouchstart' in window) || navigator.maxTouchPoints>0;

function isAdmin() { return !!localStorage.getItem('github-token'); }
function syncAdminUI() {
  const el = document.getElementById('miAdmin');
  if (!el) return;
  if (isAdmin()) { el.innerHTML = '&#9989; Admin'; el.style.opacity = '1'; el.style.color = '#9f9'; }
  else { el.innerHTML = '&#128274; Admin'; el.style.opacity = '0.45'; el.style.color = '#aaa'; }
}

let GW=0, GH=0, cellW=0, cellH=0, isPortrait=false, bgColor='#c8ddf0';
let fitMode = localStorage.getItem("mlynx-fit")||"fc";
let showCellLbl=false, showCname=true;
let linksData=[];

const canvas    = document.getElementById('gameCanvas');
const ctx       = canvas.getContext('2d');
const wrap      = document.getElementById('rotateWrap');
const menuWrap  = document.getElementById('menuWrap');
const menuBtn   = document.getElementById('menuBtn');
const menuPanel = document.getElementById('menuPanel');

// helpers
function parseCell(s){
  if(!s||s.length<2) return null;
  const r=parseInt(s[0]), c=LETTERS.indexOf(s[1].toLowerCase())+1;
  if(isNaN(r)||r<1||r>ROWS||c<1||c>COLS) return null;
  return {row:r,col:c};
}
function mkCell(r,c){ return r+LETTERS[c-1]; }
function occupied(){
  const s=new Set();
  linksData.forEach(it=>{ if(it.show==="1"){ const p=parseCell(it.cell); if(p) s.add(mkCell(p.row,p.col)); }});
  return s;
}

// layout — exact braintrain pattern from paste.txt
function setupLayout(){
  const pw=window.innerWidth, ph=window.innerHeight;
  isPortrait = pw<ph;
  bgColor = Math.min(pw,ph)<600 ? '#7ab8e8' : '#ffffff';
  if(isPortrait){
    GW=ph; GH=pw;
    canvas.width=GW; canvas.height=GH;
    wrap.style.cssText='width:'+GW+'px;height:'+GH+'px;transform-origin:0 0;transform:rotate(90deg) translateY(-'+pw+'px)';
  } else {
    GW=pw; GH=ph;
    canvas.width=GW; canvas.height=GH;
    wrap.style.cssText='width:'+GW+'px;height:'+GH+'px;transform-origin:0 0;transform:none';
  }
  cellW=GW/COLS; cellH=GH/ROWS;
  updateMenuPosition();
}

function updateMenuPosition(){
  const PAD=14;
  if(isPortrait){
    menuWrap.classList.add('portrait-mode');
    menuWrap.style.cssText='bottom:'+PAD+'px;left:'+PAD+'px;right:auto';
  } else {
    menuWrap.classList.remove('portrait-mode');
    menuWrap.style.cssText='bottom:'+PAD+'px;right:'+PAD+'px;left:auto';
  }
}

// render
function renderGrid(){
  if(!GW||!GH) return;
  ctx.fillStyle=bgColor; ctx.fillRect(0,0,GW,GH);
  ctx.strokeStyle='#002b55'; ctx.lineWidth=1;
  for(let i=1;i<COLS;i++){ const x=GW*i/COLS; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,GH); ctx.stroke(); }
  for(let i=1;i<ROWS;i++){ const y=GH*i/ROWS; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(GW,y); ctx.stroke(); }
  if(showCellLbl){
    const fs=Math.max(10,Math.floor(Math.min(cellW,cellH)*0.22));
    ctx.font='bold '+fs+'px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
    for(let r=1;r<=ROWS;r++) for(let c=1;c<=COLS;c++){
      const cx=(c-.5)*cellW, cy=(r-.5)*cellH, lbl=r+LETTERS[c-1];
      ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillText(lbl,cx+1,cy+1);
      ctx.fillStyle='rgba(60,60,180,0.75)'; ctx.fillText(lbl,cx,cy);
    }
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  }
  buildOverlays();
}

// overlays inside rotateWrap — rotate with canvas automatically
function buildOverlays(){
  wrap.querySelectorAll('.cell-overlay,.cell-empty').forEach(el=>el.remove());
  const occ=occupied();

  linksData.forEach(it=>{
    if(it.show!=='1') return;
    const pos=parseCell(it.cell); if(!pos) return;
    const x=(pos.col-1)*cellW, y=(pos.row-1)*cellH;
    const div=document.createElement('div');
    div.className='cell-overlay';
    div.style.cssText='left:'+x+'px;top:'+y+'px;width:'+cellW+'px;height:'+cellH+'px;';
    if(it.asset==='i' && it.link){
      const img=document.createElement('img');
      img.src=it.link; img.alt=it.cname||'';
      img.className=(it.fit||fitMode)==='ei'?'ei':'fc';
      div.appendChild(img);
    }
    if(it.cname && showCname){
      const lbl=document.createElement('div');
      lbl.className='cell-label'; lbl.textContent=it.cname;
      div.appendChild(lbl);
    }
    div.addEventListener('pointerup',e=>{ e.stopPropagation(); openFS(it); });
    wrap.appendChild(div);
  });

  for(let r=1;r<=ROWS;r++) for(let c=1;c<=COLS;c++){
    const cs=mkCell(r,c); if(occ.has(cs)) continue;
    const div=document.createElement('div');
    div.className='cell-empty';
    div.style.cssText='left:'+(c-1)*cellW+'px;top:'+(r-1)*cellH+'px;width:'+cellW+'px;height:'+cellH+'px;';
    div.title='Add -- '+cs;
    div.addEventListener('pointerup',e=>{ e.preventDefault(); if (isAdmin()) openQF(cs); });
    wrap.appendChild(div);
  }
}

function render(){ renderGrid(); }

// fullscreen
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

async function openQF(cs){
  qfCell=cs;
  const ex=linksData.find(it=>it.cell===cs);
  let lv=ex?(ex.link||''):'';
  if(!ISMOBILE){
    try{ const c=(await navigator.clipboard.readText()).trim(); if(/^https?:\/\//i.test(c)) lv=c; }catch(e){}
  }
  document.getElementById('qfLink').value=lv;
  document.getElementById('qfLinkPrev').textContent=lv;
  document.getElementById('qfCname').value=ex?(ex.cname||''):'';
  if(!ISMOBILE){
    document.getElementById('qfSname').value  =ex?(ex.sname||''):'';
    document.getElementById('qfAttrib').value =ex?(ex.attribution||''):'';
    document.getElementById('qfComment').value=ex?(ex.comment||''):'';
    document.getElementById('qfAsset').value  =ex?(ex.asset||'i'):'i';
    document.getElementById('qfFit').value    =ex?(ex.fit||''):'';
  }
  document.getElementById('qfTitle').textContent='Pin '+cs;
  document.getElementById('qfError').textContent='';
  document.getElementById('qfModal').classList.add('open');
  setTimeout(()=>document.getElementById(lv?'qfCname':'qfLink').focus(),80);
}

function qfSave(){
  const link =document.getElementById('qfLink').value.trim();
  const cname=document.getElementById('qfCname').value.trim();
  if(!link&&!cname){ document.getElementById('qfError').textContent='Need link or cname'; return; }
  const sname  =ISMOBILE?'':document.getElementById('qfSname').value.trim();
  const attrib =ISMOBILE?'':document.getElementById('qfAttrib').value.trim();
  const comment=ISMOBILE?'':document.getElementById('qfComment').value.trim();
  const asset  =ISMOBILE?'i':document.getElementById('qfAsset').value;
  const fit    =ISMOBILE?'':document.getElementById('qfFit').value;
  let e=linksData.find(it=>it.cell===qfCell);
  if(e) Object.assign(e,{show:'1',asset,fit,link,cname,sname,attribution:attrib,comment});
  else  linksData.push({show:'1',asset,cell:qfCell,fit,link,cname,sname,attribution:attrib,comment});
  localStorage.setItem('mlynx-links',JSON.stringify(linksData));
  document.getElementById('qfModal').classList.remove('open');
  render();
}

['qfSave','qfSave2'].forEach(id=>
  document.getElementById(id).addEventListener('pointerup',e=>{ e.stopPropagation(); qfSave(); })
);
['qfCancel','qfCancel2'].forEach(id=>
  document.getElementById(id).addEventListener('pointerup',e=>{ e.stopPropagation(); document.getElementById('qfModal').classList.remove('open'); })
);
document.getElementById('qfLink').addEventListener('input',function(){ document.getElementById('qfLinkPrev').textContent=this.value; });
document.getElementById('qfModal').addEventListener('pointerup',e=>e.stopPropagation());

// THE ONE NEW THING: Ctrl+S inside quick-fill saves
document.getElementById('qfModal').addEventListener('keydown',e=>{
  if(e.ctrlKey && e.key.toLowerCase()==='s'){ e.preventDefault(); qfSave(); }
});

document.getElementById('qfPasteBtn').addEventListener('pointerup',async e=>{
  e.stopPropagation();
  try{
    const t=(await navigator.clipboard.readText()).trim();
    if(/^https?:\/\//i.test(t)){
      document.getElementById('qfLink').value=t;
      document.getElementById('qfLinkPrev').textContent=t;
    } else alert('No URL in clipboard.');
  }catch(err){ alert('Tap Image link field and paste manually.'); }
});

// JSON editor
function applyJsonChanges() {
  try {
    if(rawJsonMode) {
      const d=JSON.parse(document.getElementById('jsonText').value);
      if(!Array.isArray(d)) throw new Error('Expected array');
      linksData=d;
    }
    localStorage.setItem('seeandlearn-links',JSON.stringify(linksData));
    document.getElementById('jsonModal').classList.remove('open');
    render(); return true;
  } catch(e) { document.getElementById('jsonStatus').textContent='Error: '+e.message; return false; }
}
document.getElementById('jsonApply').addEventListener('pointerup', applyJsonChanges);
document.getElementById('jsonPush').addEventListener('pointerup', () => { if (applyJsonChanges()) { pushToGitHub(); } });
document.getElementById('jsonDl').addEventListener('pointerup',saveJson);
document.getElementById('jsonCancel').addEventListener('pointerup',()=>document.getElementById('jsonModal').classList.remove('open'));
document.getElementById('jsonModal').addEventListener('pointerup',e=>e.stopPropagation());
document.getElementById('jsonText').addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.key.toLowerCase()==='s'){ e.preventDefault(); document.getElementById('jsonApply').dispatchEvent(new Event('pointerup')); }
});

// bootstrap
// --- GITHUB INTEGRATION ---
async function pushFileToGitHub(path, dataObj) {
  const token = localStorage.getItem('github-token');
  const owner = localStorage.getItem('github-owner');
  const repo = localStorage.getItem('github-repo');
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' };

  let sha;
  try {
    const getRes = await fetch(apiUrl, { headers });
    if (getRes.ok) {
      const getJson = await getRes.json();
      sha = getJson.sha;
    }
  } catch(e) {}

  const jsonText = JSON.stringify(dataObj, null, 2);
  const contentB64 = btoa(unescape(encodeURIComponent(jsonText)));
  const body = { message: `Update ${path} via SeeAndLearn`, content: contentB64 };
  if(sha) body.sha = sha;

  const putRes = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
  if(!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Failed to push ${path}: ` + errText);
  }
}

async function pushToGitHub() {
  const token = localStorage.getItem('github-token');
  let owner = localStorage.getItem('github-owner');
  let repo = localStorage.getItem('github-repo');

  if (!owner || !repo) {
    if (window.location.hostname.includes('github.io')) {
      owner = owner || window.location.hostname.split('.')[0];
      repo = repo || window.location.pathname.split('/')[1] || '';
      if(owner) localStorage.setItem('github-owner', owner);
      if(repo) localStorage.setItem('github-repo', repo);
      const oi = document.getElementById('ownerInput');
      if(oi) oi.value = owner;
      const ri = document.getElementById('repoInput');
      if(ri) ri.value = repo;
    }
  }

  if (!token || !owner || !repo) {
    alert("Please set your Token, Owner, and Repo in Settings (Admin).");
    document.getElementById('settingsPanel').classList.add('open');
    const tg = document.getElementById('togGithub');
    if (tg) tg.checked = true;
    const setup = document.getElementById('githubTokenSetup');
    if (setup) setup.classList.add('open');
    if (!token) {
      const inp = document.getElementById('tokenInput');
      if (inp) inp.focus();
    } else if (!owner) {
      const inp = document.getElementById('ownerInput');
      if (inp) inp.focus();
    } else {
      const inp = document.getElementById('repoInput');
      if (inp) inp.focus();
    }
    return;
  }

  const t = document.createElement('div');
  t.textContent = '⏳ Pushing to GitHub...';
  t.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#0055aa; color:#fff; padding:16px 32px; border-radius:12px; z-index:999999; box-shadow:0 8px 24px rgba(0,0,0,0.6); font:bold 18px sans-serif; transition:opacity 0.3s; pointer-events:none;';
  document.body.appendChild(t);

  try {
    await pushFileToGitHub('links.json', linksData);
    const recycleStr = localStorage.getItem('seeandlearn-recycle');
    if(recycleStr) {
       const recData = JSON.parse(recycleStr);
       if(recData.length > 0) await pushFileToGitHub('recycle.json', recData);
    }
    const backupStr = localStorage.getItem('seeandlearn-backup');
    if(backupStr) {
       await pushFileToGitHub('backup.json', JSON.parse(backupStr));
       localStorage.removeItem('seeandlearn-backup');
    }
    t.textContent = '✅ Successfully pushed to GitHub!';
    t.style.background = '#28a745';
    setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(), 300); }, 2000);
  } catch (err) {
    t.textContent = '❌ GitHub error: ' + err.message;
    t.style.background = '#dc3545';
    setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(), 300); }, 3500);
  }
}

document.getElementById('miPushGithub').addEventListener('pointerup', function(e) {
  e.stopPropagation();
  closeMenu();
  pushToGitHub();
});

const togGithubEl = document.getElementById('togGithub');
if (togGithubEl) {
  togGithubEl.addEventListener('change', function() {
    const setup = document.getElementById('githubTokenSetup');
    const status = document.getElementById('tokenStatus');
    if (this.checked) {
      if (setup) setup.classList.add('open');
      const saved = localStorage.getItem('github-token');
      if (status) status.textContent = saved ? '✅ Token loaded from browser' : 'Paste token → press Enter';
      syncAdminUI();
      if (!saved) {
        const inp = document.getElementById('tokenInput');
        if (inp) inp.focus();
      }
    } else {
      if (setup) setup.classList.remove('open');
    }
  });
}

const tokenInputEl = document.getElementById('tokenInput');
if (tokenInputEl) {
  tokenInputEl.addEventListener('change', function() {
    const t = this.value.trim();
    if (t) {
      localStorage.setItem('github-token', t);
      syncAdminUI();
      const status = document.getElementById('tokenStatus');
      if (status) status.textContent = '✅ Saved securely in browser';
      this.value = '';
      this.blur();
    }
  });
  tokenInputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') this.blur();
  });
}

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
    cname: "", sname: "", attribution: "", comment: "", DateAdded: dateAdded
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