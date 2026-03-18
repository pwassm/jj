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
    div.style.cssText='left:'+x+'px;top:'+y+'px;width:'+cellW+'px;height:'+cellH+'px; touch-action: none;';

    const assetVal = String(it.asset || '').trim();

    if(assetVal==='i' && it.link){
      const img=document.createElement('img');
      img.src=it.link; img.alt=it.cname||'';
      img.className=(it.fit||fitMode)==='ei'?'ei':'fc';
      div.appendChild(img);
    } else if (window.parseVideoAsset && window.parseVideoAsset(assetVal) !== null) {
      const vidHost = document.createElement('div');
      vidHost.id = 'vid-' + it.cell;
      vidHost.style.cssText = 'position:absolute; inset:0; overflow:hidden; background:#000; display:flex; justify-content:center; align-items:center;';
      div.appendChild(vidHost);
      videoMountTasks.push({ host: vidHost, link: it.link, asset: assetVal, mute: it.Mute !== '0' });
    }

    if(it.cname && showCname){
      const lbl=document.createElement('div');
      lbl.className='cell-label'; lbl.textContent=it.cname;
      div.appendChild(lbl);
    }

    const isVidNode = window.parseVideoAsset && window.parseVideoAsset(assetVal) !== null;

    let startX = 0, startY = 0, isDragging = false;

    div.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0 && e.pointerType !== 'touch') return;
      startX = e.clientX; startY = e.clientY;
      isDragging = true;
    });

    div.addEventListener('pointermove', e => {
      if (!isDragging) return;
    });

    div.addEventListener('pointerup', e => {
      if (!isDragging) return;
      isDragging = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Swipe Right -> Full Screen (made more tolerant for mobile)
      if (dx > 25 && Math.abs(dy) < Math.abs(dx) * 1.5) {
         e.stopPropagation();
         window.openFS(it);
         return;
      }

      // Tap / Click
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        if (isVidNode) {
          if (e.ctrlKey) {
            e.stopPropagation();
            if (window.rKeyDown || e.shiftKey) {
               window.openFS(it);
            } else {
               if (window.openVideoEditor) window.openVideoEditor(it);
            }
          }
        } else if (assetVal === 'i') {
          e.stopPropagation();
          window.openFS(it);
        }
      }
    });

    div.addEventListener('pointercancel', () => { isDragging = false; });
    div.addEventListener('pointerleave', () => { isDragging = false; });

    div.addEventListener('contextmenu', e => {
      if (isVidNode && e.ctrlKey) {
         e.preventDefault();
         e.stopPropagation();
         window.openFS(it);
      } else if (isVidNode) {
         e.preventDefault();
      }
    });

    wrap.appendChild(div);
  });

  // Mount players after DOM insertion
  if (videoMountTasks.length > 0) {
    videoMountTasks.forEach(task => {
      const parsed = window.parseVideoAsset(task.asset);
      if(!parsed) return;
      if (window.isYouTubeLink(task.link) && window.mountYouTubeClip) {
        window.mountYouTubeClip(task.host, task.link, parsed.start, parsed.dur, task.mute);
      } else if (window.isVimeoLink(task.link) && window.mountVimeoClip) {
        window.mountVimeoClip(task.host, task.link, parsed.start, parsed.dur, task.mute);
      }
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
