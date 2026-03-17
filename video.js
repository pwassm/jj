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
