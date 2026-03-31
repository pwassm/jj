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
  // Build info in bottom-right cell (row ROWS, col COLS)
  (function(){
    const bfs = Math.max(8, Math.floor(Math.min(cellW, cellH) * 0.11));
    const bx = (COLS-1)*cellW + 3;
    const by = ROWS*cellH - 4;
    const label = 'zip171 · 2026-03-30';
    ctx.font = bfs + 'px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(label, bx+1, by+1);
    ctx.fillStyle = 'rgba(100,160,255,0.6)';
    ctx.fillText(label, bx, by);
  })();
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

    const assetVal = String(it.VidRange || '').trim();

    // Instagram: VidRange="3" is the legacy signal; also detect by URL
    const isIg = window.isInstagramLink && window.isInstagramLink(it.link);

    if (isIg && window.buildInstagramCell) {
      window.buildInstagramCell(it, cellW, cellH, function(igDiv) {
        igDiv.style.cssText += 'position:absolute;inset:0;';
        div.appendChild(igDiv);
      });
    } else if(assetVal==='i' && it.link){
      const img=document.createElement('img');
      img.src=it.link; img.alt=it.cname||'';
      img.className=(it.fit||fitMode)==='ei'?'ei':'fc';
      div.appendChild(img);
    } else if (window.parseVideoAsset && window.parseVideoAsset(assetVal) !== null) {
      const vidHost = document.createElement('div');
      vidHost.id = 'vid-' + it.cell;
      vidHost.style.cssText = 'position:absolute; inset:0; overflow:hidden; background:#000; display:flex; justify-content:center; align-items:center;';
      div.appendChild(vidHost);
      videoMountTasks.push({ host: vidHost, link: it.link, VidRange: assetVal, mute: it.Mute !== '0' });
    }

    if(it.cname && showCname){
      const lbl=document.createElement('div');
      lbl.className='cell-label'; lbl.textContent=it.cname;
      div.appendChild(lbl);
    }

    const isVidNode = !isIg && window.parseVideoAsset && window.parseVideoAsset(assetVal) !== null;

    // On mobile, add a transparent interceptor div over video cells.
    // YouTube iframes absorb all pointer events, so pointerdown on `div` never
    // fires when touching the iframe area. The interceptor sits above the iframe
    // (z-index:10) and routes swipes → openFS. It's invisible and passes taps through
    // on desktop (display:none when not ISMOBILE).
    if (ISMOBILE && isVidNode) {
      const swipeInt = document.createElement('div');
      swipeInt.style.cssText = 'position:absolute;inset:0;z-index:10;touch-action:none;'
        + 'background:transparent;cursor:pointer;';
      let siStartX = 0, siStartY = 0;
      swipeInt.addEventListener('pointerdown', function(e) {
        siStartX = e.clientX; siStartY = e.clientY;
        try { swipeInt.setPointerCapture(e.pointerId); } catch(ex) {}
      });
      swipeInt.addEventListener('pointerup', function(e) {
        const dx = e.clientX - siStartX;
        const dy = e.clientY - siStartY;
        const swipeDist = isPortrait ? dy : dx;
        const swipePerp = isPortrait ? dx : dy;
        if (swipeDist > 25 && Math.abs(swipePerp) < Math.abs(swipeDist) * 1.5) {
          // Swipe → open VideoShow
          e.stopPropagation(); window.openFS(it);
        } else if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
          // Tap → also open VideoShow on mobile
          e.stopPropagation(); window.openFS(it);
        }
      });
      div.appendChild(swipeInt);
    }

    let startX = 0, startY = 0, isDragging = false;

    div.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0 && e.pointerType !== 'touch') return;
      startX = e.clientX; startY = e.clientY;
      isDragging = true;
      // Capture pointer so pointermove/pointerup fire even if pointer leaves the div
      try { div.setPointerCapture(e.pointerId); } catch(ex) {}
    });

    div.addEventListener('pointermove', e => {
      if (!isDragging) return;
    });

    div.addEventListener('pointerup', e => {
      if (!isDragging) return;
      isDragging = false;
      if (isIg) return;  // Instagram card handles its own clicks
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // In portrait mode the canvas is rotated 90deg. A physical rightward swipe
      // on screen appears as a downward swipe in rotated grid coordinates (dy > 0).
      // In landscape, a rightward swipe is dx > 0 as expected.
      const swipeDist = isPortrait ? dy : dx;
      const swipePerp = isPortrait ? dx : dy;

      // Swipe to open fullscreen — on mobile always open VideoShow (V screen)
      // On desktop only image/video cells respond to swipe
      if (swipeDist > 25 && Math.abs(swipePerp) < Math.abs(swipeDist) * 1.5) {
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
               if (!ISMOBILE && window.openVideoEditor) window.openVideoEditor(it);
               else window.openFS(it);  // no VideoEdit on mobile
            }
          } else if (ISMOBILE) {
            // Plain tap on video cell opens VideoShow on mobile
            e.stopPropagation();
            window.openFS(it);
          }
        } else if (assetVal === 'i') {
          e.stopPropagation();
          window.openFS(it);
        }
      }
    });

    div.addEventListener('pointercancel', () => { isDragging = false; });
    // Note: pointerleave is NOT used here — setPointerCapture ensures pointerup
    // fires even when finger moves off the element (critical for fast mobile swipes)

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
      const parsed = window.parseVideoAsset(task.VidRange);
      if(!parsed) return;
      var segs0 = parsed[0];
      if (window.isYouTubeLink(task.link) && window.mountYouTubeClip) {
        window.mountYouTubeClip(task.host, task.link, segs0.start, segs0.dur, task.mute, undefined, parsed);
      } else if (window.isVimeoLink(task.link) && window.mountVimeoClip) {
        window.mountVimeoClip(task.host, task.link, segs0.start, segs0.dur, task.mute, undefined, parsed);
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
