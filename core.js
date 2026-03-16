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

// --- GITHUB INTEGRATION ---
async function pushToGitHub() {
  const token = localStorage.getItem('github-token');
  if (!token) {
    alert("1. Open Settings -> Turn on GitHub Sync\n2. Paste your token and press Enter");
    document.getElementById('settingsPanel').classList.add('open');
    const tg = document.getElementById('togGithub');
    if (tg) tg.checked = true;
    const setup = document.getElementById('githubTokenSetup');
    if (setup) setup.classList.add('open');
    const inp = document.getElementById('tokenInput');
    if (inp) inp.focus();
    return;
  }
  let owner = localStorage.getItem('github-owner') || '';
  let repo = localStorage.getItem('github-repo') || '';
  owner = prompt('GitHub Owner (username):', owner) || '';
  repo = prompt('Repository Name:', repo) || '';
  if (!owner || !repo) return;

  localStorage.setItem('github-owner', owner);
  localStorage.setItem('github-repo', repo);

  try {
    const path = 'links.json';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' };

    const getRes = await fetch(apiUrl, { headers });
    if (!getRes.ok) throw new Error('Could not find repository or file. Check permissions.');
    const { sha } = await getRes.json();

    const jsonText = JSON.stringify(linksData, null, 2);
    const contentB64 = btoa(unescape(encodeURIComponent(jsonText)));

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message: 'Update links.json via SeeAndLearn', content: contentB64, sha })
    });

    if (putRes.ok) alert('✅ Successfully pushed to GitHub!');
    else throw new Error(await putRes.text());
  } catch (err) {
    alert('❌ GitHub error: ' + err.message);
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