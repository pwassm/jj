'use strict';

window.seeLearnVideoPlayers = {};
window.seeLearnVideoTimers  = {};
window.seeLearnYTReady      = false;
window.seeLearnYTLoading    = false;
window.seeLearnVimeoReady   = false;
window.seeLearnVimeoLoading = false;

window.getYouTubeId = function(url) {
  if (!url) return '';
  var m = url.match(/^.*((youtu\.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/);
  return (m && m[7] && m[7].length === 11) ? m[7] : '';
};

// ─── VidRange parsing ─────────────────────────────────────────────────────────
// Format:  "986 20"          → [{start:986, dur:20}]
// Format:  "986 20, 1200 15" → [{start:986,dur:20},{start:1200,dur:15}]
// "i" or non-numeric         → null (image, not video)
window.parseVideoAsset = function(v) {
  var str = String(v || '').trim();
  if (!str || str === 'i') return null;
  var segments = str.split(',');
  var result = [];
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i].trim();
    if (!seg) continue;
    var parts = seg.split(/\s+/);
    if (!parts.length || isNaN(Number(parts[0]))) return null;
    result.push({
      start: Number(parts[0]),
      dur:   (parts.length > 1 && !isNaN(Number(parts[1]))) ? Number(parts[1]) : 1
    });
  }
  return result.length ? result : null;
};

// Serialize array of segments back to VidRange string
window.serializeSegments = function(segs) {
  return segs.map(function(s) {
    var st = parseFloat(Number(s.start).toFixed(1));
    var d  = parseFloat(Number(s.dur).toFixed(1));
    return d === 1 ? String(st) : st + ' ' + d;
  }).join(', ');
};

window.isNumericAsset = function(v) { return window.parseVideoAsset(v) !== null; };
window.isYouTubeLink  = function(url) { return /youtu\.be|youtube\.com/i.test(url || ''); };
window.isVimeoLink    = function(url) { return /vimeo\.com/i.test(url || ''); };

// ─── API loaders ──────────────────────────────────────────────────────────────
window.loadYouTubeApiOnce = function() {
  if (window.YT && window.YT.Player) { window.seeLearnYTReady = true; return Promise.resolve(); }
  if (window.seeLearnYTLoading) {
    return new Promise(function(res) {
      var t = setInterval(function() { if (window.seeLearnYTReady) { clearInterval(t); res(); } }, 100);
    });
  }
  window.seeLearnYTLoading = true;
  return new Promise(function(res) {
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    var first = document.getElementsByTagName('script')[0];
    if (first && first.parentNode) first.parentNode.insertBefore(tag, first);
    else document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = function() { window.seeLearnYTReady = true; res(); };
  });
};

window.loadVimeoApiOnce = function() {
  if (window.Vimeo && window.Vimeo.Player) { window.seeLearnVimeoReady = true; return Promise.resolve(); }
  if (window.seeLearnVimeoLoading) {
    return new Promise(function(res) {
      var t = setInterval(function() { if (window.seeLearnVimeoReady) { clearInterval(t); res(); } }, 100);
    });
  }
  window.seeLearnVimeoLoading = true;
  return new Promise(function(res) {
    var tag = document.createElement('script');
    tag.src = 'https://player.vimeo.com/api/player.js';
    tag.onload = function() { window.seeLearnVimeoReady = true; res(); };
    document.head.appendChild(tag);
  });
};

window.stopCellVideoLoop = function(cellId) {
  if (window.seeLearnVideoTimers[cellId]) {
    clearInterval(window.seeLearnVideoTimers[cellId]);
    delete window.seeLearnVideoTimers[cellId];
  }
  if (window.seeLearnVideoPlayers[cellId] &&
      typeof window.seeLearnVideoPlayers[cellId].destroy === 'function') {
    try { window.seeLearnVideoPlayers[cellId].destroy(); } catch(e) {}
  }
  delete window.seeLearnVideoPlayers[cellId];
};

// ─── Multi-segment playback ───────────────────────────────────────────────────
// segsArg: optional array of {start,dur}. If omitted, uses legacy startSec+dur.
// Plays each segment in order then loops back to first.

window.mountYouTubeClip = async function(hostEl, url, startSec, dur, isMuted, customSeekTo, segsArg) {
  var vid = getYouTubeId(url);
  if (!vid || !hostEl) return;

  // YouTube blocks embedding on file:/// origins (Error 153).
  // Show a simple click-to-open card instead.
  if (location.protocol === 'file:') {
    hostEl.innerHTML = '';
    var card = document.createElement('div');
    card.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;'
      + 'align-items:center;justify-content:center;background:#111;cursor:pointer;';
    card.innerHTML = '<div style="font-size:28px;margin-bottom:6px;">▶</div>'
      + '<div style="color:#f00;font-size:11px;font-weight:bold;">YouTube</div>'
      + '<div style="color:#aaa;font-size:10px;margin-top:4px;text-align:center;padding:0 8px;">'
      + 'Tap to open<br>(local file)</div>';
    card.addEventListener('click', function() { window.open(url, '_blank'); });
    hostEl.appendChild(card);
    return;
  }

  await loadYouTubeApiOnce();
  var cellId = hostEl.id;
  stopCellVideoLoop(cellId);
  hostEl.innerHTML = '';

  var segs = Array.isArray(segsArg) ? segsArg
    : [{ start: Number(startSec), dur: Number(dur) }];
  var segIdx = 0;

  var innerId = 'yt_' + cellId.replace(/[^a-zA-Z0-9_-]/g, '_');
  var div = document.createElement('div');
  div.id = innerId;
  // pointer-events:auto allows clicking the YouTube "More videos" X button if it appears
  div.style.cssText = 'width:100%;height:100%;pointer-events:auto;';
  hostEl.appendChild(div);

  var initSeek = customSeekTo !== undefined ? Number(customSeekTo) : segs[0].start;

  var player = new YT.Player(innerId, {
    videoId: vid,
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0,
      modestbranding: 1, playsinline: 1,
      start: Math.floor(initSeek),
      iv_load_policy: 3,
      endscreen: 0,
      cc_load_policy: 0
    },
    events: {
      onReady: function(e) {
        if (isMuted) e.target.mute(); else e.target.unMute();
        var allowSeek = !window.keyframeOnly;
        e.target.seekTo(initSeek, allowSeek);
        e.target.playVideo();
        // Autopause: if enabled, pause after 100ms so a frame is visible but video doesn't run
        if (window.autoPauseGrid !== false) {
          setTimeout(function() { try { e.target.pauseVideo(); } catch(ex) {} }, 100);
        }
        window.seeLearnVideoTimers[cellId] = setInterval(function() {
          try {
            var t   = e.target.getCurrentTime();
            var seg = segs[segIdx];
            // Seek back 0.2s before end to prevent YouTube reaching ENDED state
            // (ENDED triggers the suggestions overlay)
            if (t >= seg.start + seg.dur - 0.2 || t < seg.start - 0.5) {
              segIdx = (segIdx + 1) % segs.length;
              e.target.seekTo(segs[segIdx].start, allowSeek);
              e.target.playVideo();
            }
          } catch(err) {}
        }, 100);
      },
      onStateChange: function(e) {
        if (e.data === YT.PlayerState.ENDED) {
          segIdx = (segIdx + 1) % segs.length;
          e.target.seekTo(segs[segIdx].start, !window.keyframeOnly);
          e.target.playVideo();
        }
      }
    }
  });
  window.seeLearnVideoPlayers[cellId] = player;
};

window.mountVimeoClip = async function(hostEl, url, startSec, dur, isMuted, customSeekTo, segsArg) {
  if (!hostEl) return;
  await loadVimeoApiOnce();
  var cellId = hostEl.id;
  stopCellVideoLoop(cellId);
  hostEl.innerHTML = '';

  var segs = Array.isArray(segsArg) ? segsArg
    : [{ start: Number(startSec), dur: Number(dur) }];
  var segIdx = 0;

  var div = document.createElement('div');
  div.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;pointer-events:none;';
  hostEl.appendChild(div);

  var player = new Vimeo.Player(div, {
    url: url, autoplay: true, muted: isMuted, controls: false,
    loop: false, autopause: false, transparent: false, background: false
  });

  player.ready().then(function() {
    var iframe = div.querySelector('iframe');
    if (iframe) { iframe.style.width = '100%'; iframe.style.height = '100%'; }
    if (isMuted) player.setVolume(0); else player.setVolume(1);
    var seekTo = customSeekTo !== undefined ? Number(customSeekTo) : segs[0].start;
    player.setCurrentTime(seekTo);
    player.play();
    // Autopause: pause after 100ms so a frame is visible
    if (window.autoPauseGrid !== false) {
      setTimeout(function() { player.pause().catch(function(){}); }, 100);
    }
    window.seeLearnVideoTimers[cellId] = setInterval(function() {
      player.getCurrentTime().then(function(t) {
        var seg = segs[segIdx];
        if (t >= seg.start + seg.dur || t < seg.start - 0.5) {
          segIdx = (segIdx + 1) % segs.length;
          player.setCurrentTime(segs[segIdx].start);
          player.play();
        }
      }).catch(function() {});
    }, 100);
  });

  player.on('ended', function() {
    segIdx = (segIdx + 1) % segs.length;
    player.setCurrentTime(segs[segIdx].start);
    player.play();
  });

  window.seeLearnVideoPlayers[cellId] = player;
};

window.cleanupAllVideos = function() {
  for (var cid in window.seeLearnVideoTimers) clearInterval(window.seeLearnVideoTimers[cid]);
  window.seeLearnVideoTimers  = {};
  window.seeLearnVideoPlayers = {};
};

// ─── VIDEO EDITOR (multi-segment) ────────────────────────────────────────────
window.openVideoEditor = function(it) {
  var rawSegs = window.parseVideoAsset(it.VidRange);
  // Load VidComment labels (comma-delimited, one per segment)
  var rawComments = (it.VidComment || '').split(',').map(function(s) { return s.trim(); });
  var segs = rawSegs ? rawSegs.map(function(s, i) {
    return { start: s.start, dur: s.dur, comment: rawComments[i] || '' };
  }) : [{ start: 0, dur: 1, comment: '' }];
  var activeSegIdx = 0;
  var currentMute  = it.Mute !== '0';
  var totalVideoDur = null;   // filled once player reports duration

  var overlay = document.createElement('div');
  overlay.id  = 'video-editor-overlay';
  overlay.style.cssText = 'position:fixed;z-index:99999;left:5%;top:5%;width:90%;height:90%;'
    + 'background:#1a1a1a;border:2px solid #8ef;display:flex;flex-direction:column;'
    + 'box-shadow:0 10px 40px rgba(0,0,0,0.9);font-family:sans-serif;color:#fff;'
    + 'border-radius:10px;overflow:hidden;';

  overlay.innerHTML = '<style>'
    + '.v2btn{min-width:38px;height:34px;font-size:12px;font-weight:bold;'
    + 'background:#2a2a2a;border:1px solid #555;color:#ddd;cursor:pointer;'
    + 'border-radius:4px;display:inline-flex;align-items:center;justify-content:center;'
    + 'user-select:none;padding:0 6px;}'
    + '.v2btn:hover{background:#3a3a3a;border-color:#8ef;color:#fff;}'
    + '.v2btn:active{background:#8ef;color:#000;}'
    + '.v2num{width:72px;text-align:center;font-size:15px;font-weight:bold;'
    + 'background:#111;color:#fff;border:1px solid #555;border-radius:4px;padding:5px;}'
    + '.v2num::-webkit-inner-spin-button,.v2num::-webkit-outer-spin-button{-webkit-appearance:none;}'
    + '.v2num{-moz-appearance:textfield;}'
    + '.v2segbtn{padding:5px 12px;border-radius:4px;border:1px solid #555;'
    + 'background:#2a2a2a;color:#ccc;cursor:pointer;font-size:13px;}'
    + '.v2segbtn.active{border-color:#8ef;background:#0a1a2a;color:#8ef;font-weight:bold;}'
    + '</style>'
    // ── Title bar ──
    + '<div style="display:flex;justify-content:space-between;align-items:center;'
    + 'padding:10px 16px;background:#111;border-bottom:1px solid #333;flex-shrink:0;">'
    + '<div>'
    + '<span style="font-size:15px;font-weight:bold;">&#9658; Video Editor &mdash; Cell '
    + (it.cell||'?') + '</span>'
    + '&nbsp;<span id="v2segcount" style="font-size:12px;color:#888;"></span>'
    // Stats: total clips duration + total video duration
    + '&nbsp;&nbsp;<span id="v2clipstotal" style="font-size:12px;color:#aef;">'
    + '</span>'
    + '&nbsp;&nbsp;<span id="v2videototal" style="font-size:12px;color:#8a8;"></span>'
    + '</div>'
    + '<div style="display:flex;gap:10px;align-items:center;">'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">'
    + '<input type="checkbox" id="v2mute" style="width:15px;height:15px;"'
    + (currentMute?' checked':'') + '> Muted</label>'
    + '<button id="v2save" style="padding:8px 20px;background:#8ef;color:#000;border:none;'
    + 'border-radius:5px;font-weight:bold;cursor:pointer;font-size:14px;">Save (^S)</button>'
    + '<button id="v2close" style="padding:8px 14px;background:none;border:1px solid #f66;'
    + 'color:#f66;border-radius:5px;cursor:pointer;font-size:14px;">&#10005; Close</button>'
    + '</div></div>'
    + '<div style="display:flex;flex:1;overflow:hidden;">'
    // ── Video + timeline column ──
    + '<div style="flex:1;display:flex;flex-direction:column;background:#000;min-width:0;">'
    + '<div id="v2host" style="flex:1;position:relative;pointer-events:auto;overflow:hidden;cursor:pointer;"></div>'
    + '<div style="flex-shrink:0;padding:8px 12px;background:#111;border-top:1px solid #333;">'
    + '<div style="font-size:11px;color:#555;margin-bottom:3px;">'
    + 'Ctrl+click video = add segment here &nbsp;|&nbsp; '
    + 'Click timeline = scrub &nbsp;|&nbsp; '
    + 'Ctrl+click timeline band = delete</div>'
    + '<div id="v2timeline" style="position:relative;height:36px;background:#222;'
    + 'border-radius:4px;cursor:crosshair;border:1px solid #444;overflow:hidden;user-select:none;"></div>'
    + '<div style="display:flex;justify-content:space-between;margin-top:3px;">'
    + '<span style="font-size:11px;color:#555;">0s</span>'
    + '<span id="v2tcur" style="font-size:12px;color:#8ef;font-weight:bold;">—</span>'
    + '<span id="v2tend" style="font-size:11px;color:#555;"></span>'
    + '</div></div></div>'
    // ── Right panel ──
    + '<div style="width:270px;flex-shrink:0;padding:14px;background:#1e1e1e;'
    + 'border-left:1px solid #333;display:flex;flex-direction:column;gap:12px;overflow-y:auto;">'
    // Segment tabs
    + '<div><div style="font-size:11px;color:#888;margin-bottom:5px;">Segment (Tab key to cycle)</div>'
    + '<div id="v2segtabs" style="display:flex;gap:5px;flex-wrap:wrap;"></div></div>'
    // Fine Adjustments title
    + '<div style="font-size:13px;font-weight:bold;color:#ccc;border-bottom:1px solid #444;'
    + 'padding-bottom:5px;">Fine Adjustments</div>'
    // ── Start ──
    + '<div style="margin-bottom:6px;">'
    + '<div style="font-size:11px;color:#888;margin-bottom:2px;">Start (sec)</div>'
    // 5-col grid: col3 holds number, carets, and 0 button
    + '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;align-items:center;">'
    // Row 1: number in col 3 (cols 1-2 empty, col 3 = number, cols 4-5 empty)
    + '<div></div><div></div>'
    + '<input type="number" id="v2start" class="v2num" min="0" step="0.1" style="width:100%;text-align:center;grid-column:3;">'
    + '<div></div><div></div>'
    // Row 2: carets in col 3
    + '<div></div><div></div>'
    + '<div style="display:flex;gap:2px;justify-content:center;">'
    + '<button class="v2btn" id="vs-frame" title="Start -1 frame, pause">&#9664;</button>'
    + '<button class="v2btn" id="vs+frame" title="Start +1 frame, pause">&#9654;</button>'
    + '</div>'
    + '<div></div><div></div>'
    // Row 3: -5 -1 0 +1 +5
    + '<button class="v2btn" id="vs---">-5</button>'
    + '<button class="v2btn" id="vs--">-1</button>'
    + '<button class="v2btn" id="vs-0" style="border-color:#666;color:#aaa;">0</button>'
    + '<button class="v2btn" id="vs++">+1</button>'
    + '<button class="v2btn" id="vs+++">+5</button>'
    + '</div>'
    + '</div>'
    // ── Duration ──
    + '<div style="margin-bottom:6px;">'
    + '<div style="font-size:11px;color:#888;margin-bottom:2px;">Duration (sec)</div>'
    + '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;align-items:center;">'
    // Row 1: number in col 3
    + '<div></div><div></div>'
    + '<input type="number" id="v2dur" class="v2num" min="0.1" step="0.1" style="width:100%;text-align:center;">'
    + '<div></div><div></div>'
    // Row 2: carets in col 3
    + '<div></div><div></div>'
    + '<div style="display:flex;gap:2px;justify-content:center;">'
    + '<button class="v2btn" id="vd-frame" title="Dur -1 frame, pause">&#9664;</button>'
    + '<button class="v2btn" id="vd+frame" title="Dur +1 frame, pause">&#9654;</button>'
    + '</div>'
    + '<div></div><div></div>'
    // Row 3: -5 -1 0 +1 +5
    + '<button class="v2btn" id="vd---">-5</button>'
    + '<button class="v2btn" id="vd--">-1</button>'
    + '<button class="v2btn" id="vd-0" style="border-color:#666;color:#aaa;">0</button>'
    + '<button class="v2btn" id="vd++">+1</button>'
    + '<button class="v2btn" id="vd+++">+5</button>'
    + '</div>'
    + '</div>'
    // Segment ops — Loop Segment just above Add/Delete
    + '<button id="v2-ls" style="width:100%;padding:7px;border-radius:4px;border:1px solid #4af;'
    + 'background:rgba(0,80,180,0.2);color:#8ef;cursor:pointer;font-size:13px;">&#9654; Loop Segment</button>'
    + '<button id="v2addseg" style="padding:7px;border-radius:4px;border:1px solid #4af;'
    + 'background:rgba(0,80,180,0.2);color:#8ef;cursor:pointer;font-size:13px;">+ Add segment</button>'
    + '<button id="v2delseg" style="padding:7px;border-radius:4px;border:1px solid #f66;'
    + 'background:rgba(180,0,0,0.2);color:#f88;cursor:pointer;font-size:13px;">'
    + '&#10005; Delete this segment</button>'
    // VidRange
    + '<div><div style="font-size:11px;color:#888;margin-bottom:4px;">VidRange value</div>'
    + '<div id="v2vrprev" style="font-size:12px;color:#8ef;word-break:break-all;'
    + 'background:#111;padding:5px;border-radius:4px;border:1px solid #333;'
    + 'font-family:monospace;min-height:20px;"></div></div>'
    + '</div></div>';

  document.body.appendChild(overlay);

  // ── Element refs ────────────────────────────────────────────────────────
  var host        = document.getElementById('v2host');
  var iStart      = document.getElementById('v2start');
  var iDur        = document.getElementById('v2dur');
  var iMute       = document.getElementById('v2mute');
  var timeline    = document.getElementById('v2timeline');
  var tCur        = document.getElementById('v2tcur');
  var tEnd        = document.getElementById('v2tend');
  var segTabs     = document.getElementById('v2segtabs');
  var vrPrev      = document.getElementById('v2vrprev');
  var segCount    = document.getElementById('v2segcount');
  var clipsTotal  = document.getElementById('v2clipstotal');
  var videoTotal  = document.getElementById('v2videototal');

  var fmt = function(v) { return parseFloat(Number(v).toFixed(1)); };

  // mm:ss formatter for total video duration
  function toMMSS(sec) {
    var s = Math.floor(sec);
    var m = Math.floor(s / 60);
    return m + ':' + ('0' + (s % 60)).slice(-2);
  }

  // Visible timeline window
  function calcEnd() {
    var maxEnd = Math.max.apply(null, segs.map(function(s) { return s.start + s.dur; }));
    return totalVideoDur ? Math.max(maxEnd + 5, totalVideoDur) : maxEnd + 30;
  }

  // Update header stats
  function updateStats() {
    var total = segs.reduce(function(sum, s) { return sum + s.dur; }, 0);
    clipsTotal.textContent = 'Clips: ' + total.toFixed(1) + 's';
    videoTotal.textContent = totalVideoDur ? ('Video: ' + toMMSS(totalVideoDur)) : '';
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  var COLOURS = ['#2a6ef5','#e5732a','#2aa87a','#c03ec0','#c0c03e','#e53a3a'];

  function renderTimeline(curT) {
    timeline.innerHTML = '';
    var W   = timeline.offsetWidth || 600;
    var end = calcEnd();
    var sc  = W / end;
    tEnd.textContent = end.toFixed(0) + 's';

    segs.forEach(function(seg, i) {
      var x    = seg.start * sc;
      var w    = Math.max(seg.dur * sc, 4);
      var isAct = i === activeSegIdx;
      var band = document.createElement('div');
      band.style.cssText = 'position:absolute;top:3px;height:30px;'
        + 'left:' + x + 'px;width:' + w + 'px;'
        + 'background:' + COLOURS[i % COLOURS.length] + ';'
        + 'opacity:' + (isAct ? 0.9 : 0.4) + ';border-radius:3px;'
        + 'border:' + (isAct ? '2px solid #fff' : '1px solid rgba(255,255,255,0.25)') + ';'
        + 'display:flex;align-items:center;justify-content:center;'
        + 'font-size:10px;color:#fff;font-weight:bold;cursor:pointer;overflow:hidden;';
      band.textContent = (segs[i].comment ? segs[i].comment.slice(0, 8) : (i + 1));
      // Use pointerdown so it fires before the timeline's own pointerdown handler
      band.addEventListener('pointerdown', function(ev) {
        ev.stopPropagation();
        if (ev.ctrlKey && ev.shiftKey) {
          // Ctrl+Shift+click band = delete segment
          ev.preventDefault();
          if (segs.length <= 1) { alert('Need at least one segment.'); return; }
          segs.splice(i, 1);
          setActiveSeg(Math.min(activeSegIdx, segs.length - 1));
        } else if (!ev.ctrlKey) {
          // Plain click band = switch to that segment and loop it
          ev.preventDefault();
          scrubClickedBand = true;
          setActiveSeg(i);
        }
      });

      // Ctrl+right-click band = open VidComment mini-editor
      band.addEventListener('contextmenu', function(ev) {
        ev.preventDefault(); ev.stopPropagation();
        openCommentEditor(i, band);
      });
      timeline.appendChild(band);
    });

    if (curT !== undefined) {
      var sx = curT * sc;
      var line = document.createElement('div');
      line.style.cssText = 'position:absolute;top:0;bottom:0;left:' + sx + 'px;'
        + 'width:2px;background:#fff;opacity:0.85;pointer-events:none;';
      timeline.appendChild(line);
      tCur.textContent = curT.toFixed(1) + 's';
    }
  }

  // ── Segment tabs ─────────────────────────────────────────────────────────
  function renderSegTabs() {
    segTabs.innerHTML = '';
    segs.forEach(function(seg, i) {
      var btn = document.createElement('button');
      btn.className = 'v2segbtn' + (i === activeSegIdx ? ' active' : '');
      btn.textContent = segs[i].comment ? ('Seg ' + (i+1) + ': ' + segs[i].comment.slice(0,12)) : 'Seg ' + (i + 1);
      btn.title = segs[i].comment || (seg.start + 's + ' + seg.dur + 's');
      btn.addEventListener('click', function() { setActiveSeg(i); });
      segTabs.appendChild(btn);
    });
    segCount.textContent = '(' + segs.length + ' seg' + (segs.length > 1 ? 's' : '') + ')';
    vrPrev.textContent   = window.serializeSegments(segs);
    updateStats();
  }

  function setActiveSeg(i) {
    activeSegIdx = ((i % segs.length) + segs.length) % segs.length;
    iStart.value = segs[activeSegIdx].start;
    iDur.value   = segs[activeSegIdx].dur;
    renderSegTabs();
    renderTimeline();
    mountLoop();    // switch loop to new active segment
  }

  // ── VidComment mini-editor (right-click on segment band) ─────────────────
  function openCommentEditor(segIdx, anchorEl) {
    var existing = document.getElementById('v2comment-popup');
    if (existing) existing.remove();

    var popup = document.createElement('div');
    popup.id = 'v2comment-popup';
    var rect = anchorEl ? anchorEl.getBoundingClientRect() : { left: 200, bottom: 200 };
    popup.style.cssText = 'position:fixed;z-index:999999;'
      + 'left:' + Math.min(rect.left, window.innerWidth - 320) + 'px;'
      + 'top:' + (rect.bottom + 4) + 'px;'
      + 'width:300px;background:#1a2a3a;border:1px solid #4af;border-radius:8px;'
      + 'padding:12px;box-shadow:0 4px 20px rgba(0,0,0,0.8);font-family:sans-serif;color:#fff;';

    popup.innerHTML = '<div style="font-size:13px;font-weight:bold;margin-bottom:8px;color:#8ef;">'
      + 'Segment ' + (segIdx + 1) + ' Label (VidComment)</div>'
      + '<textarea id="v2comment-inp" rows="2" style="width:100%;box-sizing:border-box;'
      + 'background:#0d1a2a;color:#fff;border:1px solid #4af;border-radius:4px;padding:6px;'
      + 'font-size:13px;resize:vertical;outline:none;">'
      + (segs[segIdx].comment || '')
      + '</textarea>'
      + '<div style="font-size:10px;color:#666;margin:4px 0 8px;">One label per segment. Stored as comma-delimited VidComment.</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button id="v2comment-save" style="flex:1;padding:7px;border-radius:4px;border:1px solid #4af;'
      + 'background:rgba(0,80,180,0.3);color:#8ef;cursor:pointer;font-size:13px;font-weight:bold;">Save</button>'
      + '<button id="v2comment-cancel" style="padding:7px 14px;border-radius:4px;border:1px solid #555;'
      + 'background:#222;color:#aaa;cursor:pointer;font-size:13px;">Cancel</button>'
      + '</div>';

    document.body.appendChild(popup);

    var inp = document.getElementById('v2comment-inp');
    setTimeout(function() { inp.focus(); inp.select(); }, 50);

    document.getElementById('v2comment-save').addEventListener('click', function() {
      segs[segIdx].comment = inp.value.trim();
      popup.remove();
      renderTimeline();
      renderSegTabs();
      // Persist comment immediately — don't wait for main Save button
      it.VidComment = segs.map(function(s) { return s.comment || ''; }).join(', ');
      if (window.saveData) window.saveData(true);
      else {
        localStorage.setItem('seeandlearn-links', JSON.stringify(window.linksData));
        localStorage.setItem('sal-edited', Date.now().toString());
      }
    });
    document.getElementById('v2comment-cancel').addEventListener('click', function() {
      popup.remove();
    });
    // Escape closes
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { e.stopPropagation(); popup.remove(); }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); e.stopPropagation();
        segs[segIdx].comment = inp.value.trim();
        popup.remove(); renderTimeline(); renderSegTabs();
        // Persist comment immediately
        it.VidComment = segs.map(function(s) { return s.comment || ''; }).join(', ');
        if (window.saveData) window.saveData(true);
        else {
          localStorage.setItem('seeandlearn-links', JSON.stringify(window.linksData));
          localStorage.setItem('sal-edited', Date.now().toString());
        }
      }
    });
    // Click outside closes
    setTimeout(function() {
      document.addEventListener('pointerdown', function closePopup(ev) {
        if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('pointerdown', closePopup); }
      });
    }, 100);
  }

  // ── Input / delta helpers ─────────────────────────────────────────────────
  function readInputs() {
    segs[activeSegIdx].start = fmt(Math.max(0,   parseFloat(iStart.value) || 0));
    segs[activeSegIdx].dur   = fmt(Math.max(0.1, parseFloat(iDur.value)   || 0.1));
    vrPrev.textContent = window.serializeSegments(segs);
    updateStats();
    renderTimeline();
    renderSegTabs();
  }

  // applyDelta: full remount (used by +/- buttons in panel)
  // applyDelta: type='start' restarts from beginning of segment
  //             type='dur'   seeks to 2s before new end
  function applyDelta(type, delta) {
    if (type === 'start') {
      segs[activeSegIdx].start = fmt(Math.max(0, segs[activeSegIdx].start + delta));
      iStart.value = segs[activeSegIdx].start;
      vrPrev.textContent = window.serializeSegments(segs);
      updateStats(); renderTimeline(); renderSegTabs();
      scheduleMount('start');
    } else {
      segs[activeSegIdx].dur = fmt(Math.max(0.1, segs[activeSegIdx].dur + delta));
      iDur.value = segs[activeSegIdx].dur;
      vrPrev.textContent = window.serializeSegments(segs);
      updateStats(); renderTimeline(); renderSegTabs();
      scheduleMount('end');
    }
  }

  // applyDeltaNoRemount: used by keyboard L/R/Up/Down keys.
  // Updates segment data and seeks the existing player — no player recreation.
  // The loop interval keeps running; its endT boundary is read from segs[] each tick.
  function applyDeltaNoRemount(type, delta) {
    if (type === 'start') {
      segs[activeSegIdx].start = fmt(Math.max(0, segs[activeSegIdx].start + delta));
      iStart.value = segs[activeSegIdx].start;
    } else {
      segs[activeSegIdx].dur = fmt(Math.max(0.1, segs[activeSegIdx].dur + delta));
      iDur.value = segs[activeSegIdx].dur;
    }
    vrPrev.textContent = window.serializeSegments(segs);
    updateStats(); renderTimeline(); renderSegTabs();
    // Don't scheduleMount — just let the interval pick up the new boundary naturally.
    // The interval already reads segs[activeSegIdx] each tick, so it self-corrects.
  }

  // Frame step = 0.1s — one visible "click" step when paused
  // (1/30 ≈ 0.033 rounds to 0.0 with toFixed(1), so we use 0.1 as the step unit)
  var FRAME_SEC = 0.1;
  // Use higher precision for frame arithmetic
  var fmt2 = function(v) { return parseFloat(Number(v).toFixed(2)); };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function updateSegData() {
    vrPrev.textContent = window.serializeSegments(segs);
    updateStats(); renderTimeline(); renderSegTabs();
  }

  // Freeze the video at a specific frame:
  // 1. Show shield over host (blocks YouTube iframe pointer events)
  // 2. Pause the player (PAUSED state does NOT trigger "More Videos" — only ENDED does)
  // 3. Seek to the new time
  // Shield stays up until spacebar or a play action clears it.
  function editorSeekFreeze(t) {
    scrubShield.style.display = 'block';
    var p = getEditorPlayer();
    if (!p) return;
    if (typeof p.pauseVideo === 'function') {
      try { p._salPaused = true; p.pauseVideo(); p.seekTo(Math.max(0, t), true); } catch(ex) {}
    } else if (p.pause) {
      p._salPaused = true;
      p.pause().catch(function(){});
      p.setCurrentTime(Math.max(0, t)).catch(function(){});
    }
  }

  function editorSeek(t) {
    var p = getEditorPlayer();
    if (!p) return;
    if (typeof p.seekTo === 'function') { try { p.seekTo(Math.max(0, t), true); } catch(ex) {} }
    else if (p.setCurrentTime) p.setCurrentTime(Math.max(0, t)).catch(function(){});
  }

  // playStartLoop: loop from seg.start for min(3, seg.dur) seconds on existing player
  function playStartLoop() {
    scrubShield.style.display = 'none';
    readInputs();
    var seg = segs[activeSegIdx];
    var loopDur = Math.min(3, seg.dur);
    var p = getEditorPlayer();
    if (p) {
      // Use existing player — no remount, no "More Videos" flash
      resumeLoop(p, seg.start, loopDur);
    } else {
      _mountEditorPlayer(seg.start, loopDur, seg.start, true, null);
    }
  }

  // playEndLoop: loop 3s before end of segment on existing player
  function playEndLoop() {
    scrubShield.style.display = 'none';
    readInputs();
    var seg = segs[activeSegIdx];
    var previewStart = Math.max(seg.start, seg.start + seg.dur - 3);
    var previewDur   = seg.start + seg.dur - previewStart;
    var p = getEditorPlayer();
    if (p) {
      resumeLoop(p, previewStart, previewDur);
    } else {
      _mountEditorPlayer(previewStart, previewDur, previewStart, true, null);
    }
  }

  // ── Single Loop Segment button ────────────────────────────────────────────
  document.getElementById('v2-ls').addEventListener('pointerdown', function(e) {
    e.preventDefault();
    readInputs();
    mountLoop();  // loops entire active segment
  });

  // ── Start carets: pause, seek ±0.1s, update number ──────────────────────
  document.getElementById('vs-frame').addEventListener('pointerdown', function(e) {
    e.preventDefault();
    suspendLoop();
    segs[activeSegIdx].start = fmt2(Math.max(0, segs[activeSegIdx].start - FRAME_SEC));
    iStart.value = segs[activeSegIdx].start;
    updateSegData();
    editorSeekFreeze(segs[activeSegIdx].start);
  });
  document.getElementById('vs+frame').addEventListener('pointerdown', function(e) {
    e.preventDefault();
    suspendLoop();
    segs[activeSegIdx].start = fmt2(segs[activeSegIdx].start + FRAME_SEC);
    iStart.value = segs[activeSegIdx].start;
    updateSegData();
    editorSeekFreeze(segs[activeSegIdx].start);
  });

  // -5 -1 0 +1 +5: adjust start, play from new start for min(3, dur) then loop
  var startDeltas = { 'vs---': -5, 'vs--': -1, 'vs-0': 0, 'vs++': 1, 'vs+++': 5 };
  Object.keys(startDeltas).forEach(function(id) {
    document.getElementById(id).addEventListener('pointerdown', function(e) {
      e.preventDefault();
      var delta = startDeltas[id];
      if (delta !== 0) {
        segs[activeSegIdx].start = fmt(Math.max(0, segs[activeSegIdx].start + delta));
        iStart.value = segs[activeSegIdx].start;
        updateSegData();
      }
      playStartLoop();
    });
  });

  // ── Duration carets: pause, adjust ±0.1s, seek near new end ─────────────
  document.getElementById('vd-frame').addEventListener('pointerdown', function(e) {
    e.preventDefault();
    suspendLoop();
    segs[activeSegIdx].dur = fmt2(Math.max(0.1, segs[activeSegIdx].dur - FRAME_SEC));
    iDur.value = segs[activeSegIdx].dur;
    updateSegData();
    editorSeekFreeze(Math.max(segs[activeSegIdx].start,
      segs[activeSegIdx].start + segs[activeSegIdx].dur - 0.1));
  });
  document.getElementById('vd+frame').addEventListener('pointerdown', function(e) {
    e.preventDefault();
    suspendLoop();
    segs[activeSegIdx].dur = fmt2(segs[activeSegIdx].dur + FRAME_SEC);
    iDur.value = segs[activeSegIdx].dur;
    updateSegData();
    editorSeekFreeze(Math.max(segs[activeSegIdx].start,
      segs[activeSegIdx].start + segs[activeSegIdx].dur - 0.1));
  });

  // -5 -1 0 +1 +5: adjust duration, play from 3s before new end, loop
  var durDeltas = { 'vd---': -5, 'vd--': -1, 'vd-0': 0, 'vd++': 1, 'vd+++': 5 };
  Object.keys(durDeltas).forEach(function(id) {
    document.getElementById(id).addEventListener('pointerdown', function(e) {
      e.preventDefault();
      var delta = durDeltas[id];
      if (delta !== 0) {
        segs[activeSegIdx].dur = fmt(Math.max(0.1, segs[activeSegIdx].dur + delta));
        iDur.value = segs[activeSegIdx].dur;
        updateSegData();
      }
      playEndLoop();
    });
  });

  // Input field changes
  iStart.addEventListener('change', function() { readInputs(); scheduleMount('start'); });
  iDur.addEventListener('change',   function() { readInputs(); scheduleMount('end');   });
  iMute.addEventListener('change',  function() { currentMute = iMute.checked; mountLoop(); });

  // ── Add / delete segment ──────────────────────────────────────────────────
  document.getElementById('v2addseg').addEventListener('click', function() {
    var last = segs[segs.length - 1];
    segs.push({ start: fmt(last.start + last.dur + 2), dur: 5 });
    setActiveSeg(segs.length - 1);
  });
  document.getElementById('v2delseg').addEventListener('click', function() {
    if (segs.length <= 1) { alert('Need at least one segment.'); return; }
    segs.splice(activeSegIdx, 1);
    setActiveSeg(Math.min(activeSegIdx, segs.length - 1));
  });

  // ── Timeline click + drag scrubbing ──────────────────────────────────────
  // Plain drag: scrub through video, stay paused on release
  // Band click (no ctrl): switch active segment and start looping it
  // Ctrl+click empty area: add segment
  // Ctrl+click band: delete segment
  var isDraggingScrub = false;
  var scrubClickedBand = false; // true if pointerdown landed on a band

  function getEditorPlayer() {
    return window.seeLearnVideoPlayers['v2host'] || null;
  }

  // Suspend the loop interval (don't destroy player)
  function suspendLoop() {
    if (window.seeLearnVideoTimers['v2host']) {
      clearInterval(window.seeLearnVideoTimers['v2host']);
      delete window.seeLearnVideoTimers['v2host'];
    }
  }

  // Resume loop for the active segment on the existing player
  function resumeLoop(p, segStart, segDur) {
    suspendLoop();
    var endT = segStart + segDur;
    if (!p) return;
    if (typeof p.playVideo === 'function') {
      try { p._salPaused = false; p.seekTo(segStart, true); p.playVideo(); } catch(ex) {}
      window.seeLearnVideoTimers['v2host'] = setInterval(function() {
        try {
          if (p._salPaused) return;
          var t = p.getCurrentTime();
          if (t >= endT - 0.2 || t < segStart - 0.5) {
            p.seekTo(segStart, true); p.playVideo();
          }
        } catch(ex) {}
      }, 100);
    } else if (typeof p.play === 'function') {
      p._salPaused = false;
      p.setCurrentTime(segStart).catch(function(){});
      p.play().catch(function(){});
      window.seeLearnVideoTimers['v2host'] = setInterval(function() {
        p.getCurrentTime().then(function(t) {
          if (p._salPaused) return;
          if (t >= endT - 0.2 || t < segStart - 0.5) {
            p.setCurrentTime(segStart); p.play();
          }
        }).catch(function(){});
      }, 100);
    }
  }


  function timelineSecFromEvent(e) {
    var rect = timeline.getBoundingClientRect();
    var x    = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * calcEnd();
  }

  // ── Scrub shield: covers only the VIDEO HOST area, not the right panel ──────
  // This blocks YouTube iframe pointer events (hover triggers "More videos" UI)
  // without blocking the right-panel buttons.
  var scrubShield = document.createElement('div');
  scrubShield.style.cssText = 'position:absolute;inset:0;z-index:200000;display:none;'
    + 'background:transparent;cursor:crosshair;pointer-events:auto;';
  // Append to host div (not overlay) so it only covers the video, not the panel
  host.appendChild(scrubShield);

  // scrubToSec: mirrors VideoShow's fsSeek exactly.
  // Just seek — no pause, no suspendLoop, no player state changes.
  // Pausing is what triggers YouTube's "More videos" UI.
  function scrubToSec(sec) {
    var maxSec = totalVideoDur > 2 ? totalVideoDur - 1 : calcEnd();
    var clamped = Math.max(0, Math.min(sec, Math.min(calcEnd(), maxSec)));
    renderTimeline(clamped);
    tCur.textContent = clamped.toFixed(1) + 's';
    var p = getEditorPlayer();
    if (!p) return;
    if (typeof p.seekTo === 'function') {
      try { p.seekTo(clamped, !window.keyframeOnly); } catch(ex) {}
    } else if (p.setCurrentTime) {
      p.setCurrentTime(clamped).catch(function(){});
    }
  }

  var scrubResumeTimerV2 = null;

  timeline.addEventListener('pointerdown', function(e) {
    if (e.ctrlKey) return;
    if (scrubClickedBand) { scrubClickedBand = false; return; }
    e.preventDefault();
    isDraggingScrub = true;
    scrubShield.style.display = 'block';
    if (scrubResumeTimerV2) { clearTimeout(scrubResumeTimerV2); scrubResumeTimerV2 = null; }
    timeline.setPointerCapture(e.pointerId);
    suspendLoop();
    scrubToSec(timelineSecFromEvent(e));
  });

  timeline.addEventListener('pointermove', function(e) {
    if (!isDraggingScrub) return;
    scrubToSec(timelineSecFromEvent(e));
  });

  timeline.addEventListener('pointerup', function(e) {
    if (!isDraggingScrub) return;
    isDraggingScrub = false;
    scrubShield.style.display = 'none';
    scrubToSec(timelineSecFromEvent(e));
    // Stay paused — press Space to resume
  });

  timeline.addEventListener('pointercancel', function() {
    isDraggingScrub = false;
    scrubShield.style.display = 'none';
  });

  timeline.addEventListener('click', function(e) {
    if (!e.ctrlKey) return;
    var W = timeline.offsetWidth || 600;
    var clickSec = (e.offsetX / W) * calcEnd();
    var hitIdx = -1;
    segs.forEach(function(s, i) {
      if (clickSec >= s.start && clickSec <= s.start + s.dur) hitIdx = i;
    });
    if (hitIdx < 0) {
      segs.push({ start: fmt(clickSec), dur: 5 });
      setActiveSeg(segs.length - 1);
    }
  });

  // ── Editor playback: always loops ONLY the active segment ─────────────────
  // mountLoop: mount player looping just the active segment (start change)
  function mountLoop() {
    clearTimeout(mountDebounce);
    currentMute = iMute.checked;
    readInputs();
    var seg  = segs[activeSegIdx];
    var onDur = function(d) {
      if (d && !totalVideoDur) {
        totalVideoDur = d;
        renderTimeline(); updateStats();
      }
    };
    _mountEditorPlayer(seg.start, seg.dur, seg.start, true, onDur);
  }

  // mountEndPreview: seek to 2s before end of active segment and loop
  function mountEndPreview() {
    clearTimeout(mountDebounce);
    currentMute = iMute.checked;
    readInputs();
    var seg     = segs[activeSegIdx];
    var preview = Math.max(seg.start, seg.start + seg.dur - 2);
    _mountEditorPlayer(seg.start, seg.dur, preview, true, null);
  }

  // seekAndPause: seek to specific time but don't loop — show that frame only
  function seekAndPause(seekSec) {
    clearTimeout(mountDebounce);
    currentMute = iMute.checked;
    readInputs();
    var seg = segs[activeSegIdx];
    _mountEditorPlayer(seg.start, seg.dur, seekSec, false, null);
  }

  // Low-level: mount the editor player.
  // loopSeg=true → normal looped segment playback (start..start+dur then repeat)
  // loopSeg=false → seek to seekSec, play briefly then pause
  function _mountEditorPlayer(segStart, segDur, seekSec, loopSeg, onDurationReady) {
    window.stopCellVideoLoop('v2host');
    host.innerHTML = '';

    if (window.isYouTubeLink(it.link)) {
      _mountYTEditor(segStart, segDur, seekSec, loopSeg, onDurationReady);
    } else if (window.isVimeoLink(it.link)) {
      _mountVimeoEditor(segStart, segDur, seekSec, loopSeg, onDurationReady);
    }
  }

  async function _mountYTEditor(segStart, segDur, seekSec, loopSeg, onDurationReady) {
    var vid = getYouTubeId(it.link);
    if (!vid) return;
    await loadYouTubeApiOnce();
    host.innerHTML = '';
    var div = document.createElement('div');
    div.id = 'v2host_yt';
    // Allow pointer-events so YouTube overlay X button is clickable
    div.style.cssText = 'width:100%;height:100%;pointer-events:auto;';
    host.appendChild(div);
    var endT  = segStart + segDur;
    var paused = false;

    var player = new YT.Player('v2host_yt', {
      videoId: vid,
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0,
        modestbranding: 1, playsinline: 1, start: Math.floor(seekSec),
        iv_load_policy: 3, endscreen: 0, cc_load_policy: 0
      },
      events: {
        onReady: function(ev) {
          if (currentMute) ev.target.mute(); else ev.target.unMute();
          ev.target.seekTo(seekSec, true);
          ev.target.playVideo();
          ev.target._salPaused = false;
          if (onDurationReady) {
            try {
              var d = ev.target.getDuration();
              if (d > 0) onDurationReady(d);
            } catch(ex) {}
          }
          if (!loopSeg) {
            setTimeout(function() {
              try { ev.target.pauseVideo(); ev.target._salPaused = true; paused = true; } catch(ex) {}
            }, 1500);
          }
        },
        onStateChange: function(ev) {
          if (paused || ev.target._salPaused) return;
          if (loopSeg && ev.data === YT.PlayerState.ENDED) {
            ev.target.seekTo(segStart, true); ev.target.playVideo();
          }
        }
      }
    });

    if (loopSeg) {
      window.seeLearnVideoTimers['v2host'] = setInterval(function() {
        try {
          if (paused || player._salPaused) return;
          var t = player.getCurrentTime();
          var seg = segs[activeSegIdx];
          var endT2 = seg.start + seg.dur;
          if (t >= endT2 - 0.2 || t < seg.start - 0.5) {
            player.seekTo(seg.start, true); player.playVideo();
          }
        } catch(ex) {}
      }, 100);
    }
    window.seeLearnVideoPlayers['v2host'] = player;
  }

  async function _mountVimeoEditor(segStart, segDur, seekSec, loopSeg, onDurationReady) {
    await loadVimeoApiOnce();
    host.innerHTML = '';
    var div = document.createElement('div');
    div.style.cssText = 'width:100%;height:100%;position:absolute;top:0;left:0;pointer-events:none;';
    host.appendChild(div);
    var endT   = segStart + segDur;
    var paused = false;

    var player = new Vimeo.Player(div, {
      url: it.link, autoplay: true, muted: currentMute,
      controls: false, loop: false, autopause: false, transparent: false, background: false
    });

    player.ready().then(function() {
      var iframe = div.querySelector('iframe');
      if (iframe) { iframe.style.width = '100%'; iframe.style.height = '100%'; }
      if (currentMute) player.setVolume(0); else player.setVolume(1);
      player.setCurrentTime(seekSec);
      player.play();
      if (onDurationReady) {
        player.getDuration().then(function(d) { if (d > 0) onDurationReady(d); }).catch(function(){});
      }
      if (!loopSeg) {
        setTimeout(function() { player.pause().catch(function(){}); paused = true; }, 1500);
      }
      if (loopSeg) {
        window.seeLearnVideoTimers['v2host'] = setInterval(function() {
          if (paused) return;
          player.getCurrentTime().then(function(t) {
            var seg = segs[activeSegIdx];
            var endT2 = seg.start + seg.dur;
            if (t >= endT2 || t < seg.start - 0.5) {
              player.setCurrentTime(seg.start); player.play();
            }
          }).catch(function(){});
        }, 100);
      }
    });

    player.on('ended', function() {
      if (!paused && loopSeg) { player.setCurrentTime(segStart); player.play(); }
    });

    window.seeLearnVideoPlayers['v2host'] = player;
  }

  // ── Debounced mount ───────────────────────────────────────────────────────
  var mountDebounce;
  var pendingMountType = 'start';
  function scheduleMount(type) {
    pendingMountType = type || 'start';
    clearTimeout(mountDebounce);
    mountDebounce = setTimeout(function() {
      if (pendingMountType === 'end') mountEndPreview();
      else mountLoop();
    }, 500);
  }

  // ── Scrubber position polling ─────────────────────────────────────────────
  var scrubTimer = setInterval(function() {
    var p = window.seeLearnVideoPlayers['v2host'];
    if (!p) return;
    if (typeof p.getCurrentTime === 'function') {
      var t = p.getCurrentTime();
      if (t && typeof t.then === 'function') t.then(function(v) { if (v !== null) renderTimeline(v); });
      else if (typeof t === 'number' && t > 0) renderTimeline(t);
    }
  }, 300);

  // ── Save / Close ──────────────────────────────────────────────────────────
  function closeEditor() {
    clearInterval(scrubTimer);
    clearTimeout(mountDebounce);
    window.stopCellVideoLoop('v2host');
    overlay.remove();
    document.removeEventListener('keydown', handleKey, true);
  }

  function saveEditor() {
    readInputs();
    it.VidRange   = window.serializeSegments(segs);
    it.VidComment = segs.map(function(s) { return s.comment || ''; }).join(', ');
    it.Mute       = iMute.checked ? '1' : '0';
    // Use saveData() if available (writes sal-edited + both storage keys)
    // Fallback for safety if called before ui.js initialises saveData
    if (window.saveData) {
      window.saveData(true);  // skipSync — we've already updated linksData via it.*
    } else {
      var s = JSON.stringify(window.linksData);
      localStorage.setItem('seeandlearn-links', s);
      localStorage.setItem('mlynx-links', s);
      localStorage.setItem('sal-edited', Date.now().toString());
    }
    closeEditor();
    if (window.renderTableEditor && document.getElementById('tableEditor'))
      window.renderTableEditor();
    if (window.renderGrid) window.renderGrid();
  }

  document.getElementById('v2save').addEventListener('click',  saveEditor);
  document.getElementById('v2close').addEventListener('click', closeEditor);

  // ── Ctrl+click on video panel → insert new segment at current time ────────
  host.addEventListener('click', function(e) {
    if (!e.ctrlKey) return;
    e.preventDefault(); e.stopPropagation();
    var p = getEditorPlayer();
    function insertAtTime(t) {
      var insertSec = fmt(Math.max(0, t));
      segs.push({ start: insertSec, dur: 5 });
      setActiveSeg(segs.length - 1);
      vrPrev.textContent = 'New seg at ' + insertSec + 's — ' + window.serializeSegments(segs);
    }
    if (p && typeof p.getCurrentTime === 'function') {
      var t = p.getCurrentTime();
      if (t && typeof t.then === 'function') t.then(function(v) { insertAtTime(v || 0); });
      else insertAtTime(typeof t === 'number' ? t : 0);
    } else if (p && p.getCurrentTime) {
      p.getCurrentTime().then(function(v) { insertAtTime(v || 0); }).catch(function() { insertAtTime(0); });
    } else {
      // No player ready — insert after last segment
      var last = segs[segs.length - 1];
      insertAtTime(last.start + last.dur + 2);
    }
  });

  // ── Keyboard ──────────────────────────────────────────────────────────────
  function handleKey(e) {
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault(); e.stopPropagation(); saveEditor(); return;
    }
    if (e.key === 'Escape') { closeEditor(); return; }
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault(); e.stopPropagation();
      var p = getEditorPlayer();
      if (!p) return;
      if (p._salPaused) {
        // Currently paused — resume
        scrubShield.style.display = 'none';
        var seg = segs[activeSegIdx];
        resumeLoop(p, seg.start, seg.dur);
      } else {
        // Currently playing — pause
        suspendLoop();
        if (typeof p.pauseVideo === 'function') {
          try { p._salPaused = true; p.pauseVideo(); } catch(ex) {}
        } else if (p.pause) {
          p._salPaused = true; p.pause().catch(function(){});
        }
      }
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation();
      setActiveSeg((activeSegIdx + 1) % segs.length); return;
    }

    // Arrow keys adjust start (left/right) and duration (up/down) — no remount
    // L and R letter keys are NOT bound here — only arrow keys
    var isInp = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
    var k = e.key;

    if (k==='ArrowLeft'||k==='ArrowRight'||k==='ArrowUp'||k==='ArrowDown') {
      if (isInp) return;  // don't intercept arrow keys when typing in an input
      e.preventDefault();
      if (k==='ArrowLeft')  applyDeltaNoRemount('start', -0.1);
      if (k==='ArrowRight') applyDeltaNoRemount('start',  0.1);
      if (k==='ArrowDown')  applyDeltaNoRemount('dur',   -0.1);
      if (k==='ArrowUp')    applyDeltaNoRemount('dur',    0.1);
    }
  }
  document.addEventListener('keydown', handleKey, true);

  // ── Initial render ────────────────────────────────────────────────────────
  iStart.value = segs[0].start;
  iDur.value   = segs[0].dur;
  renderSegTabs();
  renderTimeline();
  mountLoop();   // start looping the first segment
};
