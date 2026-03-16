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
  if (window.cleanupAllVideos) window.cleanupAllVideos();
  wrap.querySelectorAll('.cell-overlay,.cell-empty').forEach(el=>el.remove());
  const occ=occupied();

  const videoMountTasks = [];

  linksData.forEach(it=>{
    if(it.show!=='1') return;
    const pos=parseCell(it.cell); if(!pos) return;
    const x=(pos.col-1)*cellW, y=(pos.row-1)*cellH;
    const div=document.createElement('div');
    div.className='cell-overlay';
    div.style.cssText='left:'+x+'px;top:'+y+'px;width:'+cellW+'px;height:'+cellH+'px;';

    const assetVal = String(it.asset || '').trim();

    if(assetVal==='i' && it.link){
      const img=document.createElement('img');
      img.src=it.link; img.alt=it.cname||'';
      img.className=(it.fit||fitMode)==='ei'?'ei':'fc';
      div.appendChild(img);
    } else if (window.isNumericAsset && window.isNumericAsset(assetVal) && window.isYouTubeLink && window.isYouTubeLink(it.link)) {
      const vidHost = document.createElement('div');
      vidHost.id = 'vid-' + it.cell;
      vidHost.style.cssText = 'position:absolute; inset:0; overflow:hidden; background:#000; display:flex; justify-content:center; align-items:center;';
      div.appendChild(vidHost);
      videoMountTasks.push({ host: vidHost, link: it.link, sec: assetVal });
    }

    if(it.cname && showCname){
      const lbl=document.createElement('div');
      lbl.className='cell-label'; lbl.textContent=it.cname;
      div.appendChild(lbl);
    }

    // For full-screen overlay, ignore pointer up if they click on video to pause it, but pointer events are none on the video itself.
    div.addEventListener('pointerup',e=>{ e.stopPropagation(); openFS(it); });
    wrap.appendChild(div);
  });

  // Mount players after DOM insertion
  if (videoMountTasks.length > 0 && window.mountYouTubeClip) {
    videoMountTasks.forEach(task => {
      window.mountYouTubeClip(task.host, task.link, task.sec);
    });
  }

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
