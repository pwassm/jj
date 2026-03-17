'use strict';

window.seeLearnVideoPlayers = {};
window.seeLearnVideoTimers = {};
window.seeLearnYTReady = false;
window.seeLearnYTLoading = false;
window.seeLearnVimeoReady = false;
window.seeLearnVimeoLoading = false;

window.getYouTubeId = function(url) {
  if (!url) return '';
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7] && match[7].length === 11) ? match[7] : '';
};

window.parseVideoAsset = function(v) {
  const str = String(v).trim();
  if (!str) return null;
  const parts = str.split(/\s+/);
  if (parts.length > 0 && !isNaN(Number(parts[0]))) {
    const start = Number(parts[0]);
    const dur = (parts.length > 1 && !isNaN(Number(parts[1]))) ? Number(parts[1]) : 1;
    return { start, dur };
  }
  return null;
};

// Retro-compatibility just in case
window.isNumericAsset = function(v) { return window.parseVideoAsset(v) !== null; };

window.isYouTubeLink = function(url) { return /youtu\.be|youtube\.com/i.test(url || ''); };
window.isVimeoLink = function(url) { return /vimeo\.com/i.test(url || ''); };

window.loadYouTubeApiOnce = function() {
  if (window.YT && window.YT.Player) {
    window.seeLearnYTReady = true;
    return Promise.resolve();
  }
  if (window.seeLearnYTLoading) {
    return new Promise(resolve => {
      const t = setInterval(() => { if (window.seeLearnYTReady) { clearInterval(t); resolve(); } }, 100);
    });
  }
  window.seeLearnYTLoading = true;
  return new Promise(resolve => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    else document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = function() { window.seeLearnYTReady = true; resolve(); };
  });
};

window.loadVimeoApiOnce = function() {
  if (window.Vimeo && window.Vimeo.Player) {
    window.seeLearnVimeoReady = true;
    return Promise.resolve();
  }
  if (window.seeLearnVimeoLoading) {
    return new Promise(resolve => {
      const t = setInterval(() => { if (window.seeLearnVimeoReady) { clearInterval(t); resolve(); } }, 100);
    });
  }
  window.seeLearnVimeoLoading = true;
  return new Promise(resolve => {
    const tag = document.createElement('script');
    tag.src = 'https://player.vimeo.com/api/player.js';
    tag.onload = function() { window.seeLearnVimeoReady = true; resolve(); };
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    else document.head.appendChild(tag);
  });
};

window.stopCellVideoLoop = function(cellId) {
  if (window.seeLearnVideoTimers[cellId]) {
    clearInterval(window.seeLearnVideoTimers[cellId]);
    delete window.seeLearnVideoTimers[cellId];
  }
  if (window.seeLearnVideoPlayers[cellId] && typeof window.seeLearnVideoPlayers[cellId].destroy === 'function') {
    try { window.seeLearnVideoPlayers[cellId].destroy(); } catch(e){}
  }
};

window.mountYouTubeClip = async function(hostEl, url, startSec, dur, isMuted) {
  const vid = getYouTubeId(url);
  if (!vid || !hostEl) return;
  await loadYouTubeApiOnce();
  const cellId = hostEl.id;
  stopCellVideoLoop(cellId);
  hostEl.innerHTML = '';
  const innerId = 'yt_' + cellId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const div = document.createElement('div');
  div.id = innerId;
  div.style.width = '100%';
  div.style.height = '100%';
  // div.style.pointerEvents = 'none'; // disabled so user can click skip ad
  hostEl.appendChild(div);

  const endSec = Number(startSec) + Number(dur);

  const player = new YT.Player(innerId, {
    videoId: vid,
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0,
      modestbranding: 1, playsinline: 1, start: Number(startSec), end: endSec + 1, iv_load_policy: 3
    },
    events: {
      onReady: function(e) {
        if (isMuted) e.target.mute(); else e.target.unMute();
        e.target.seekTo(Number(startSec), true);
        e.target.playVideo();

        window.seeLearnVideoTimers[cellId] = setInterval(() => {
          try {
            const t = e.target.getCurrentTime();
            if (t >= endSec || t < Number(startSec)) {
              e.target.seekTo(Number(startSec), true);
              e.target.playVideo();
            }
          } catch(err) {}
        }, 100);
      },
      onStateChange: function(e) {
        if (e.data === YT.PlayerState.ENDED) {
          e.target.seekTo(Number(startSec), true);
          e.target.playVideo();
        }
      }
    }
  });
  window.seeLearnVideoPlayers[cellId] = player;
};

window.mountVimeoClip = async function(hostEl, url, startSec, dur, isMuted) {
  if (!hostEl) return;
  await loadVimeoApiOnce();
  const cellId = hostEl.id;
  stopCellVideoLoop(cellId);
  hostEl.innerHTML = '';

  const div = document.createElement('div');
  div.style.width = '100%';
  div.style.height = '100%';
  // to fill cell properly and mimic YT no-controls
  div.style.pointerEvents = 'none'; 
  hostEl.appendChild(div);

  const endSec = Number(startSec) + Number(dur);

  const player = new Vimeo.Player(div, {
    url: url,
    autoplay: true,
    muted: isMuted,
    controls: false,
    loop: false,
    autopause: false,
    transparent: false,
    background: false // background=true forces mute, we want to allow unmuted
  });

  player.ready().then(function() {
    if (isMuted) player.setVolume(0); else player.setVolume(1);
    player.setCurrentTime(Number(startSec));
    player.play();

    window.seeLearnVideoTimers[cellId] = setInterval(() => {
      player.getCurrentTime().then(function(t) {
        if (t >= endSec || t < Number(startSec)) {
          player.setCurrentTime(Number(startSec));
          player.play();
        }
      }).catch(function(){});
    }, 100);
  });

  player.on('ended', function() {
    player.setCurrentTime(Number(startSec));
    player.play();
  });

  window.seeLearnVideoPlayers[cellId] = player;
};

window.cleanupAllVideos = function() {
  for (const cid in window.seeLearnVideoTimers) clearInterval(window.seeLearnVideoTimers[cid]);
  window.seeLearnVideoTimers = {};
  window.seeLearnVideoPlayers = {};
};


window.openVideoEditor = function(it) {
  const parsed = window.parseVideoAsset(it.asset) || {start: 0, dur: 1};
  let currentStart = parsed.start;
  let currentDur = parsed.dur;
  let currentMute = it.Mute !== "0";

  const overlay = document.createElement('div');
  overlay.id = 'video-editor-overlay';
  overlay.style.cssText = 'position:fixed; z-index:99999; left:15%; top:15%; width:70%; height:70%; background:#222; border:2px solid #8ef; display:flex; flex-direction:column; box-shadow: 0 10px 30px rgba(0,0,0,0.8); font-family:sans-serif; color:#fff; border-radius:8px; overflow:hidden;';

  overlay.innerHTML = `
    <div style="display:flex; justify-content:space-between; padding:10px 15px; background:#111; border-bottom:1px solid #444;">
      <h3 style="margin:0; font-size:16px;">Video Editor - Cell ${it.cell}</h3>
      <button id="ved-close" style="background:none; border:none; color:#f66; font-size:18px; cursor:pointer;" title="Close without saving">&#10006;</button>
    </div>
    <div style="display:flex; flex:1; overflow:hidden;">
      <div id="editor-vid-host" style="flex:1; background:#000; position:relative; pointer-events:none;"></div>
      <div style="width:250px; padding:20px; background:#1a1a1a; display:flex; flex-direction:column; gap:20px; border-left:1px solid #444;">
         <div>
           <label style="display:block; margin-bottom:5px; font-size:13px; color:#ccc;">Start Time (sec)</label>
           <input type="number" id="ved-start" value="${currentStart}" min="0" style="width:100%; padding:8px; box-sizing:border-box; background:#333; color:#fff; border:1px solid #555; border-radius:4px;">
         </div>
         <div>
           <label style="display:block; margin-bottom:5px; font-size:13px; color:#ccc;">Duration (sec)</label>
           <input type="number" id="ved-dur" value="${currentDur}" min="0.1" step="0.1" style="width:100%; padding:8px; box-sizing:border-box; background:#333; color:#fff; border:1px solid #555; border-radius:4px;">
         </div>
         <div>
           <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:14px; user-select:none;">
             <input type="checkbox" id="ved-mute" ${currentMute ? 'checked' : ''} style="width:16px; height:16px;">
             Muted
           </label>
         </div>
         <button id="ved-save" style="margin-top:auto; padding:12px; background:#8ef; color:#000; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-size:14px;">Save changes (^S)</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const host = document.getElementById('editor-vid-host');
  const iStart = document.getElementById('ved-start');
  const iDur = document.getElementById('ved-dur');
  const iMute = document.getElementById('ved-mute');

  const updatePreview = () => {
     currentStart = Number(iStart.value) || 0;
     currentDur = Number(iDur.value) || 1;
     currentMute = iMute.checked;
     if (window.isYouTubeLink(it.link)) {
       window.mountYouTubeClip(host, it.link, currentStart, currentDur, currentMute);
     } else if (window.isVimeoLink(it.link)) {
       window.mountVimeoClip(host, it.link, currentStart, currentDur, currentMute);
     }
  };

  updatePreview();

  let debounce;
  const onChange = () => {
    clearTimeout(debounce);
    debounce = setTimeout(updatePreview, 600);
  };

  iStart.addEventListener('input', onChange);
  iDur.addEventListener('input', onChange);
  iStart.addEventListener('change', updatePreview);
  iDur.addEventListener('change', updatePreview);
  iMute.addEventListener('change', updatePreview);

  const closeEditor = () => {
    window.stopCellVideoLoop('editor-vid-host');
    overlay.remove();
    document.removeEventListener('keydown', handleKey);
  };

  const saveEditor = () => {
    it.asset = currentStart + (currentDur !== 1 ? ' ' + currentDur : '');
    it.Mute = currentMute ? "1" : "0";
    localStorage.setItem('seeandlearn-links', JSON.stringify(window.linksData));
    closeEditor();
    if (window.renderTableEditor && document.getElementById('tableEditor')) {
      window.renderTableEditor();
    }
    if (window.renderGrid) {
      window.renderGrid();
    }
  };

  document.getElementById('ved-close').addEventListener('click', closeEditor);
  document.getElementById('ved-save').addEventListener('click', saveEditor);

  const handleKey = (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveEditor();
    }
    if (e.key === 'Escape') {
      closeEditor();
    }
  };
  document.addEventListener('keydown', handleKey);
};
