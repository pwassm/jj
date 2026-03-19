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
  div.style.cssText = 'width:100%;height:100%;pointer-events:none;';
  hostEl.appendChild(div);

  var initSeek = customSeekTo !== undefined ? Number(customSeekTo) : segs[0].start;

  var player = new YT.Player(innerId, {
    videoId: vid,
    host: 'https://www.youtube-nocookie.com',
    playerVars: {
      autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0,
      modestbranding: 1, playsinline: 1,
      start: Math.floor(initSeek),
      iv_load_policy: 3
    },
    events: {
      onReady: function(e) {
        if (isMuted) e.target.mute(); else e.target.unMute();
        e.target.seekTo(initSeek, true);
        e.target.playVideo();
        window.seeLearnVideoTimers[cellId] = setInterval(function() {
          try {
            var t   = e.target.getCurrentTime();
            var seg = segs[segIdx];
            if (t >= seg.start + seg.dur || t < seg.start - 0.5) {
              segIdx = (segIdx + 1) % segs.length;
              e.target.seekTo(segs[segIdx].start, true);
              e.target.playVideo();
            }
          } catch(err) {}
        }, 100);
      },
      onStateChange: function(e) {
        if (e.data === YT.PlayerState.ENDED) {
          segIdx = (segIdx + 1) % segs.length;
          e.target.seekTo(segs[segIdx].start, true);
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
  var segs = rawSegs ? rawSegs.map(function(s) { return { start: s.start, dur: s.dur }; })
                     : [{ start: 0, dur: 1 }];
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
    + 'Click timeline = scrub &amp; pause &nbsp;|&nbsp; '
    + 'Ctrl+click empty = add segment &nbsp;|&nbsp; Ctrl+click band = delete</div>'
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
    // Start
    + '<div><div style="font-size:11px;color:#888;margin-bottom:4px;">Start time (sec)</div>'
    + '<input type="number" id="v2start" class="v2num" min="0" step="0.1" style="margin-bottom:5px;">'
    + '<div style="display:flex;gap:3px;">'
    + '<button class="v2btn" id="vs---">&#8722;&#8722;&#8722;</button>'
    + '<button class="v2btn" id="vs--">&#8722;&#8722;</button>'
    + '<button class="v2btn" id="vs-">&#8722;</button>'
    + '<div style="flex:1"></div>'
    + '<button class="v2btn" id="vs+">+</button>'
    + '<button class="v2btn" id="vs++">++</button>'
    + '<button class="v2btn" id="vs+++">+++</button>'
    + '</div></div>'
    // Duration
    + '<div><div style="font-size:11px;color:#888;margin-bottom:4px;">Duration (sec)</div>'
    + '<input type="number" id="v2dur" class="v2num" min="0.1" step="0.1" style="margin-bottom:5px;">'
    + '<div style="display:flex;gap:3px;">'
    + '<button class="v2btn" id="vd---">&#8722;&#8722;&#8722;</button>'
    + '<button class="v2btn" id="vd--">&#8722;&#8722;</button>'
    + '<button class="v2btn" id="vd-">&#8722;</button>'
    + '<div style="flex:1"></div>'
    + '<button class="v2btn" id="vd+">+</button>'
    + '<button class="v2btn" id="vd++">++</button>'
    + '<button class="v2btn" id="vd+++">+++</button>'
    + '</div></div>'
    // Segment ops
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
      band.textContent = (i + 1);
      band.addEventListener('click', function(ev) {
        if (!ev.ctrlKey) { ev.stopPropagation(); setActiveSeg(i); }
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
      btn.textContent = 'Seg ' + (i + 1);
      btn.title = seg.start + 's + ' + seg.dur + 's';
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

  // ── Input / delta helpers ─────────────────────────────────────────────────
  function readInputs() {
    segs[activeSegIdx].start = fmt(Math.max(0,   parseFloat(iStart.value) || 0));
    segs[activeSegIdx].dur   = fmt(Math.max(0.1, parseFloat(iDur.value)   || 0.1));
    vrPrev.textContent = window.serializeSegments(segs);
    updateStats();
    renderTimeline();
    renderSegTabs();
  }

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

  // Wire start buttons
  var startDeltas = { 'vs---': -5, 'vs--': -1, 'vs-': -0.1, 'vs+': 0.1, 'vs++': 1, 'vs+++': 5 };
  Object.keys(startDeltas).forEach(function(id) {
    document.getElementById(id).addEventListener('pointerdown', function(e) {
      e.preventDefault(); applyDelta('start', startDeltas[id]);
    });
  });
  // Wire dur buttons
  var durDeltas = { 'vd---': -5, 'vd--': -1, 'vd-': -0.1, 'vd+': 0.1, 'vd++': 1, 'vd+++': 5 };
  Object.keys(durDeltas).forEach(function(id) {
    document.getElementById(id).addEventListener('pointerdown', function(e) {
      e.preventDefault(); applyDelta('dur', durDeltas[id]);
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
  // Plain click/drag: scrub to position — uses approximate seek (fast, nearest keyframe)
  // Ctrl+click: add or delete segment
  var isDraggingScrub = false;

  function scrubToSec(sec) {
    var clamped = Math.max(0, Math.min(sec, calcEnd()));
    renderTimeline(clamped);
    tCur.textContent = clamped.toFixed(1) + 's';
    // Approximate seek = fast (false = nearest keyframe, no decode wait)
    var p = window.seeLearnVideoPlayers['v2host'];
    if (p) {
      if (typeof p.seekTo === 'function') {
        try { p.seekTo(clamped, false); } catch(ex) {}
      } else if (p.setCurrentTime) {
        p.setCurrentTime(clamped).catch(function(){});
      }
    }
  }

  function timelineSecFromEvent(e) {
    var rect = timeline.getBoundingClientRect();
    var x    = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * calcEnd();
  }

  timeline.addEventListener('pointerdown', function(e) {
    if (e.ctrlKey) return;  // ctrl handled in click
    e.preventDefault();
    isDraggingScrub = true;
    timeline.setPointerCapture(e.pointerId);
    // Stop loop so scrub is visible
    clearTimeout(mountDebounce);
    var p = window.seeLearnVideoPlayers['v2host'];
    if (p && typeof p.pauseVideo === 'function') try { p.pauseVideo(); } catch(ex) {}
    else if (p && p.pause) p.pause().catch(function(){});
    scrubToSec(timelineSecFromEvent(e));
  });

  timeline.addEventListener('pointermove', function(e) {
    if (!isDraggingScrub) return;
    scrubToSec(timelineSecFromEvent(e));
  });

  timeline.addEventListener('pointerup', function(e) {
    if (!isDraggingScrub) return;
    isDraggingScrub = false;
    var sec = timelineSecFromEvent(e);
    scrubToSec(sec);
    // After releasing, resume looping from dragged position
    scheduleMount('scrub_' + sec);
  });

  timeline.addEventListener('pointercancel', function() {
    isDraggingScrub = false;
  });

  timeline.addEventListener('click', function(e) {
    if (!e.ctrlKey) return;  // plain click/drag handled by pointer events above
    var W       = timeline.offsetWidth || 600;
    var clickSec = (e.offsetX / W) * calcEnd();
    var hitIdx = -1;
    segs.forEach(function(s, i) {
      if (clickSec >= s.start && clickSec <= s.start + s.dur) hitIdx = i;
    });
    if (hitIdx >= 0) {
      if (segs.length <= 1) { alert('Need at least one segment.'); return; }
      segs.splice(hitIdx, 1);
      setActiveSeg(Math.min(activeSegIdx, segs.length - 1));
    } else {
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
    div.style.cssText = 'width:100%;height:100%;pointer-events:none;';
    host.appendChild(div);
    var endT  = segStart + segDur;
    var paused = false;

    var player = new YT.Player('v2host_yt', {
      videoId: vid,
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0,
        modestbranding: 1, playsinline: 1, start: Math.floor(seekSec), iv_load_policy: 3
      },
      events: {
        onReady: function(ev) {
          if (currentMute) ev.target.mute(); else ev.target.unMute();
          ev.target.seekTo(seekSec, true);
          ev.target.playVideo();
          // Fetch total duration once
          if (onDurationReady) {
            try {
              var d = ev.target.getDuration();
              if (d > 0) onDurationReady(d);
            } catch(ex) {}
          }
          if (!loopSeg) {
            // Pause after ~1.5s to show the frame
            setTimeout(function() { try { ev.target.pauseVideo(); paused = true; } catch(ex) {} }, 1500);
          }
        },
        onStateChange: function(ev) {
          if (paused) return;
          if (loopSeg && ev.data === YT.PlayerState.ENDED) {
            ev.target.seekTo(segStart, true); ev.target.playVideo();
          }
        }
      }
    });

    if (loopSeg) {
      window.seeLearnVideoTimers['v2host'] = setInterval(function() {
        try {
          if (paused) return;
          var t = player.getCurrentTime();
          if (t >= endT || t < segStart - 0.5) {
            player.seekTo(segStart, true); player.playVideo();
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
            if (t >= endT || t < segStart - 0.5) {
              player.setCurrentTime(segStart); player.play();
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
      if (pendingMountType === 'end') {
        mountEndPreview();
      } else if (String(pendingMountType).startsWith('scrub_')) {
        // Resume loop from wherever user scrubbed to
        var seekSec = parseFloat(String(pendingMountType).replace('scrub_', '')) || segs[activeSegIdx].start;
        currentMute = iMute.checked;
        readInputs();
        var seg = segs[activeSegIdx];
        _mountEditorPlayer(seg.start, seg.dur, seekSec, true, null);
      } else {
        mountLoop();
      }
    }, 600);
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
    it.VidRange = window.serializeSegments(segs);
    it.Mute     = iMute.checked ? '1' : '0';
    localStorage.setItem('seeandlearn-links', JSON.stringify(window.linksData));
    closeEditor();
    if (window.renderTableEditor && document.getElementById('tableEditor'))
      window.renderTableEditor();
    if (window.renderGrid) window.renderGrid();
  }

  document.getElementById('v2save').addEventListener('click',  saveEditor);
  document.getElementById('v2close').addEventListener('click', closeEditor);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  function handleKey(e) {
    if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault(); e.stopPropagation(); saveEditor(); return;
    }
    if (e.key === 'Escape') { closeEditor(); return; }
    if (e.key === 'Tab') {
      e.preventDefault(); e.stopPropagation();
      setActiveSeg((activeSegIdx + 1) % segs.length); return;
    }
    var isInp = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
    var k = e.key, kl = k.toLowerCase();
    if (kl==='l'||kl==='r'||k==='ArrowLeft'||k==='ArrowRight'||k==='ArrowUp'||k==='ArrowDown') {
      if (isInp && (k==='ArrowLeft'||k==='ArrowRight')) return;
      e.preventDefault();
      if (kl==='l'||k==='ArrowLeft')  applyDelta('start', -0.1);
      if (kl==='r'||k==='ArrowRight') applyDelta('start',  0.1);
      if (k==='ArrowDown')            applyDelta('dur',   -0.1);
      if (k==='ArrowUp')              applyDelta('dur',    0.1);
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
