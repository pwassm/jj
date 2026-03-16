'use strict';

window.seeLearnVideoPlayers = {};
window.seeLearnVideoTimers = {};
window.seeLearnYTReady = false;
window.seeLearnYTLoading = false;

window.getYouTubeId = function(url) {
  if (!url) return '';
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7] && match[7].length === 11) ? match[7] : '';
};

window.isNumericAsset = function(v) {
  return String(v).trim() !== '' && !isNaN(Number(v));
};

window.isYouTubeLink = function(url) {
  return /youtu\.be|youtube\.com/i.test(url || '');
};

window.loadYouTubeApiOnce = function() {
  if (window.YT && window.YT.Player) {
    window.seeLearnYTReady = true;
    return Promise.resolve();
  }
  if (window.seeLearnYTLoading) {
    return new Promise(resolve => {
      const t = setInterval(() => {
        if (window.seeLearnYTReady) {
          clearInterval(t);
          resolve();
        }
      }, 100);
    });
  }

  window.seeLearnYTLoading = true;

  return new Promise(resolve => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag && firstScriptTag.parentNode) {
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
      document.head.appendChild(tag);
    }

    window.onYouTubeIframeAPIReady = function() {
      window.seeLearnYTReady = true;
      resolve();
    };
  });
};

window.stopCellVideoLoop = function(cellId) {
  if (window.seeLearnVideoTimers[cellId]) {
    clearInterval(window.seeLearnVideoTimers[cellId]);
    delete window.seeLearnVideoTimers[cellId];
  }
};

window.mountYouTubeClip = async function(hostEl, url, startSec, fitModeStr) {
  const vid = getYouTubeId(url);
  if (!vid || !hostEl) return;

  await loadYouTubeApiOnce();

  const cellId = hostEl.id;
  stopCellVideoLoop(cellId);

  hostEl.innerHTML = '';
  const innerId = 'yt_' + cellId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const div = document.createElement('div');
  div.id = innerId;

  // To simulate "fill cell" with a YouTube iframe without controls:
  // Usually, pointer-events:none prevents users from clicking it and pausing it or revealing controls.
  // Transform scale can be used to crop out black bars if we really wanted to, but let's stick to 100% width/height first.
  div.style.width = '100%';
  div.style.height = '100%';
  div.style.pointerEvents = 'none';

  hostEl.appendChild(div);

  const endSec = Number(startSec) + 1;

  const player = new YT.Player(innerId, {
    videoId: vid,
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      start: Number(startSec),
      end: Number(startSec) + 2, // Provide an end just in case interval misses, though we poll anyway
      iv_load_policy: 3
    },
    events: {
      onReady: function(e) {
        e.target.mute();
        e.target.seekTo(Number(startSec), true);
        e.target.playVideo();

        window.seeLearnVideoTimers[cellId] = setInterval(() => {
          try {
            const t = e.target.getCurrentTime();
            // If it reaches endSec or somehow jumps way past it (or user pauses)
            if (t >= endSec || t < Number(startSec)) {
              e.target.seekTo(Number(startSec), true);
              e.target.playVideo(); // ensure it stays playing
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

// Cleanup routine when cell is re-rendered or destroyed
window.cleanupAllVideos = function() {
  for (const cid in window.seeLearnVideoTimers) {
    clearInterval(window.seeLearnVideoTimers[cid]);
  }
  window.seeLearnVideoTimers = {};
  window.seeLearnVideoPlayers = {};
};
