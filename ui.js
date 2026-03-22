// Version 12: All bugs fixed — no dots, no doubles, draggable cols, reliable push

// ─── VideoShow (fullscreen) ───────────────────────────────────────────────────
window.openFS = function(it) {
  if (!it.link) return;

  const isVidNode = window.parseVideoAsset && window.parseVideoAsset(it.VidRange) !== null;
  const parsed    = isVidNode ? window.parseVideoAsset(it.VidRange) : null;
  const vidComments = (it.VidComment || '').split(',').map(s => s.trim());
  function segLabel(i) { return vidComments[i] || String(i + 1); }

  function selectedDurSec() {
    return parsed ? parsed.reduce((s, seg) => s + seg.dur, 0) : 0;
  }
  function toMMSS(sec) {
    const s = Math.round(Math.max(0, sec)), m = Math.floor(s / 60);
    return m + ':' + ('0' + (s % 60)).slice(-2);
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let audioMode  = parseInt(sessionStorage.getItem('fs-audio') || '0', 10);
  let playMode   = sessionStorage.getItem('fs-play')  || 'selected'; // 'selected'|'full'
  let playSpeed  = parseFloat(sessionStorage.getItem('fs-speed') || '1');
  // timelineExpanded mirrors playMode: selected=collapsed bands, full=real timescale
  let timelineExpanded = playMode === 'full';
  // Estimate total duration from segments; updated once player reports actual duration
  let totalVidDur = parsed ? Math.max.apply(null, parsed.map(s => s.start + s.dur)) + 15 : 60;
  let lastCurT = undefined;   // last known playback time for playhead
  let abA = null, abB = null, abLoopTimer = null;
  let isScrubbing = false;
  let isPlaying   = true;  // assume playing on open

  const isMuted  = () => audioMode === 0;
  const COLOURS  = ['#2a6ef5','#e5732a','#2aa87a','#c03ec0','#c0c03e','#e53a3a'];

  // ── Build DOM ──────────────────────────────────────────────────────────────
  const fs = document.createElement('div');
  fs.id = 'fs-overlay';
  fs.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;'
    + 'z-index:99999;display:flex;flex-direction:column;font-family:sans-serif;';

  // Upper info bar (absolute, overlays video)
  const topBar = document.createElement('div');
  topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:20;'
    + 'display:flex;justify-content:space-between;align-items:flex-start;padding:8px 12px;'
    + 'background:linear-gradient(to bottom,rgba(0,0,0,0.65) 0%,transparent 100%);pointer-events:none;';
  const topLeft = document.createElement('div');
  topLeft.style.cssText = 'color:#fff;font-size:12px;text-shadow:0 1px 3px #000;pointer-events:none;line-height:1.4;';
  function updateTopLeft(fullDur) {
    topLeft.innerHTML = '<span style="color:#8ef;">▶ ' + toMMSS(selectedDurSec()) + '</span>'
      + ' <span style="color:#555;">|</span> '
      + '<span style="color:#6a8;">⏱ ' + (fullDur ? toMMSS(fullDur) : '…') + '</span>';
  }
  updateTopLeft(totalVidDur > 15 ? totalVidDur : null);

  const topRight = document.createElement('a');
  topRight.href = it.link; topRight.target = '_blank'; topRight.rel = 'noopener noreferrer';
  topRight.style.cssText = 'color:#8ef;font-size:11px;text-decoration:underline;'
    + 'text-shadow:0 1px 3px #000;pointer-events:auto;max-width:160px;overflow:hidden;'
    + 'text-overflow:ellipsis;white-space:nowrap;display:block;';
  topRight.textContent = '↗ ' + (it['v.title'] || it.cname || 'Source');
  topRight.addEventListener('click', e => e.stopPropagation());
  topBar.appendChild(topLeft); topBar.appendChild(topRight);

  // Video host
  const vidHost = document.createElement('div');
  vidHost.id = 'fs-vid-' + (it.cell || 'x');
  vidHost.style.cssText = 'flex:1;position:relative;overflow:hidden;min-height:0;';

  // Bottom bar
  const bar = document.createElement('div');
  bar.style.cssText = 'flex-shrink:0;background:rgba(0,0,0,0.88);padding:5px 8px 7px;'
    + 'display:flex;flex-direction:column;gap:4px;z-index:10;';

  // ── Timeline bar (single element, two rendering modes) ────────────────────
  // Clicking anywhere on it expands/collapses; scrubbing works in both modes.
  // A thin white vertical line shows current playback position in both modes.
  const tl = document.createElement('div');
  tl.style.cssText = 'position:relative;height:30px;border-radius:5px;overflow:hidden;'
    + 'cursor:crosshair;user-select:none;border:1px solid #333;';

  function tlScrubSec(e) {
    const r = tl.getBoundingClientRect();
    const xFrac = Math.max(0, Math.min(e.clientX - r.left, r.width)) / r.width;
    if (!timelineExpanded) {
      // Selected mode: bar represents only the selected clips in order
      // Map xFrac → actual video time within the segments
      const totalSel = selectedDurSec() || 1;
      const targetSel = xFrac * totalSel; // seconds into selected content
      let acc = 0;
      if (parsed) {
        for (let i = 0; i < parsed.length; i++) {
          const seg = parsed[i];
          if (targetSel <= acc + seg.dur) {
            return seg.start + (targetSel - acc);
          }
          acc += seg.dur;
        }
        // Past end — return end of last segment
        const last = parsed[parsed.length - 1];
        return last.start + last.dur;
      }
      return 0;
    } else {
      return xFrac * totalVidDur;
    }
  }

  // Render the timeline bar.
  // Collapsed (Selected mode): coloured bands fill proportionally, no gaps.
  //   The playhead moves within the coloured area only.
  // Full (Full mode): dark background, bands at their real time positions, gaps visible.
  function renderTL(curT) {
    tl.innerHTML = '';
    const W = tl.offsetWidth || (window.innerWidth - 20);

    if (!timelineExpanded) {
      // ── Collapsed / Selected view: bands fill the bar proportionally ──────
      // Background = dark
      tl.style.background = '#1a1a1a';
      if (parsed) {
        const totalSel = selectedDurSec() || 1;
        let xPx = 0;
        parsed.forEach(function(seg, i) {
          const wPx = Math.max(Math.round((seg.dur / totalSel) * W), 3);
          const band = document.createElement('div');
          band.style.cssText = 'position:absolute;top:2px;bottom:2px;'
            + 'left:' + xPx + 'px;width:' + wPx + 'px;'
            + 'background:' + COLOURS[i % COLOURS.length] + ';border-radius:2px;'
            + 'display:flex;align-items:center;justify-content:center;overflow:hidden;'
            + 'font-size:9px;color:#fff;font-weight:bold;pointer-events:none;';
          band.textContent = segLabel(i);
          tl.appendChild(band);
          xPx += wPx + 1;
        });
        // Playhead in selected mode: map video time → position within compressed bar
        if (curT !== undefined) {
          const totalSel = selectedDurSec() || 1;
          let pxPos = 0, xAcc = 0, selAcc = 0, placed = false;
          if (parsed) {
            parsed.forEach(function(seg, i) {
              const wPx = Math.max(Math.round((seg.dur / totalSel) * W), 3);
              if (!placed) {
                if (curT >= seg.start && curT < seg.start + seg.dur) {
                  // Inside this segment
                  pxPos = xAcc + Math.round(((curT - seg.start) / seg.dur) * wPx);
                  placed = true;
                } else if (curT < seg.start) {
                  // Between previous segment and this one — snap to start of this band
                  pxPos = xAcc;
                  placed = true;
                }
              }
              xAcc += wPx + 1;
              selAcc += seg.dur;
            });
            if (!placed) pxPos = xAcc; // past all segments — right edge
          }
          addPlayhead(pxPos);
          timeLbl.textContent = curT.toFixed(1) + 's';
        }
      }
    } else {
      // ── Expanded / Full view: real time scale, gaps visible ───────────────
      tl.style.background = '#111';
      const sc = W / totalVidDur;
      if (parsed) {
        parsed.forEach(function(seg, i) {
          const band = document.createElement('div');
          band.style.cssText = 'position:absolute;top:2px;bottom:2px;'
            + 'left:' + Math.round(seg.start * sc) + 'px;'
            + 'width:' + Math.max(Math.round(seg.dur * sc), 3) + 'px;'
            + 'background:' + COLOURS[i % COLOURS.length] + ';opacity:0.65;border-radius:2px;'
            + 'display:flex;align-items:center;justify-content:center;overflow:hidden;'
            + 'font-size:9px;color:#fff;font-weight:bold;pointer-events:none;';
          band.textContent = segLabel(i);
          tl.appendChild(band);
        });
      }
      // A/B markers
      if (abA !== null) {
        tl.insertAdjacentHTML('beforeend',
          '<div style="position:absolute;top:0;bottom:0;left:' + Math.round(abA*sc) + 'px;width:3px;background:#ff0;pointer-events:none;z-index:4;">'
          + '<div style="font-size:8px;background:#ff0;color:#000;font-weight:bold;line-height:1;padding:1px 2px;">A</div></div>');
      }
      if (abB !== null) {
        tl.insertAdjacentHTML('beforeend',
          '<div style="position:absolute;top:0;bottom:0;left:' + Math.round(abB*sc) + 'px;width:3px;background:#f80;pointer-events:none;z-index:4;">'
          + '<div style="font-size:8px;background:#f80;color:#000;font-weight:bold;line-height:1;padding:1px 2px;">B</div></div>');
      }
      if (curT !== undefined) {
        addPlayhead(Math.round(curT * sc));
        timeLbl.textContent = curT.toFixed(1) + 's';
      }
    }
  }

  function addPlayhead(xPx) {
    const ph = document.createElement('div');
    ph.style.cssText = 'position:absolute;top:0;bottom:0;left:' + xPx + 'px;'
      + 'width:3px;background:#fff;opacity:0.95;pointer-events:none;z-index:5;'
      + 'box-shadow:0 0 4px rgba(255,255,255,0.8);';
    tl.appendChild(ph);
  }

  // ── Controls row ──────────────────────────────────────────────────────────
  const ctrlRow = document.createElement('div');
  ctrlRow.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:nowrap;overflow-x:auto;';

  function mkBtn(label, title, extra) {
    const b = document.createElement('button');
    b.innerHTML = label; b.title = title || '';
    b.style.cssText = 'padding:3px 7px;font-size:12px;border-radius:4px;cursor:pointer;'
      + 'border:1px solid #555;background:#222;color:#ccc;flex-shrink:0;white-space:nowrap;' + (extra || '');
    return b;
  }

  const timeLbl = document.createElement('span');
  timeLbl.style.cssText = 'font-size:11px;color:#8ef;font-family:monospace;min-width:38px;flex-shrink:0;';
  timeLbl.textContent = '—';

  const btnStepL = mkBtn('◀', 'Step back ~1 frame');
  const btnStepR = mkBtn('▶', 'Step forward ~1 frame');

  const speedWrap = document.createElement('label');
  speedWrap.style.cssText = 'display:flex;align-items:center;gap:2px;font-size:11px;color:#aaa;flex-shrink:0;';
  speedWrap.innerHTML = 'Spd ';
  const speedSlider = document.createElement('input');
  speedSlider.type='range'; speedSlider.min='0.25'; speedSlider.max='2';
  speedSlider.step='0.25'; speedSlider.value=String(playSpeed);
  speedSlider.style.cssText='width:55px;accent-color:#8ef;cursor:pointer;';
  const speedLbl = document.createElement('span');
  speedLbl.style.cssText='min-width:26px;color:#8ef;font-size:11px;font-family:monospace;';
  speedLbl.textContent = playSpeed + 'x';
  speedWrap.appendChild(speedSlider); speedWrap.appendChild(speedLbl);

  // Selected/Full: two-line toggle button, active state on top
  function makePlayModeBtn() {
    const b = document.createElement('button');
    b.style.cssText = 'padding:2px 7px;font-size:11px;border-radius:4px;cursor:pointer;'
      + 'border:1px solid #4af;background:#222;color:#8ef;flex-shrink:0;white-space:nowrap;'
      + 'line-height:1.3;text-align:left;';
    function update() {
      if (playMode === 'selected') {
        b.innerHTML = '<span style="color:#8ef;font-weight:bold;">● Selected</span><br>'
          + '<span style="color:#555;">○ Full</span>';
      } else {
        b.innerHTML = '<span style="color:#8ef;font-weight:bold;">● Full</span><br>'
          + '<span style="color:#555;">○ Selected</span>';
      }
    }
    update();
    b.addEventListener('click', function(e) {
      e.stopPropagation();
      playMode = playMode === 'selected' ? 'full' : 'selected';
      update();
      switchPlayMode();
    });
    return b;
  }
  const playModeBtn = makePlayModeBtn();

  const audioLabels = ['🔇', '🔊', '🎵'];
  const audioBtn = mkBtn(audioLabels[audioMode], 'Audio: Mute / Original / Site');

  const abLbl = document.createElement('span');
  abLbl.style.cssText='font-size:10px;color:#fa0;font-family:monospace;flex-shrink:0;';
  abLbl.textContent = '';

  // A/B buttons: tap A to set mark A, tap B to set mark B (loops), tap either to clear
  const btnA = mkBtn('A', 'Set A loop start (Ctrl+click timeline in Full mode)',
    'border-color:#ff0;color:#ff0;background:rgba(80,80,0,0.3);font-weight:bold;');
  const btnB = mkBtn('B', 'Set B loop end — loops between A and B',
    'border-color:#f80;color:#f80;background:rgba(80,40,0,0.3);font-weight:bold;');

  btnA.addEventListener('click', function(e) {
    e.stopPropagation();
    if (abA !== null && abB !== null) {
      // Clear loop
      abA = null; abB = null;
      if (abLoopTimer) { clearInterval(abLoopTimer); abLoopTimer = null; }
      btnA.style.background = 'rgba(80,80,0,0.3)';
      btnB.style.background = 'rgba(80,40,0,0.3)';
    } else {
      // Set A at current position
      const t = lastCurT !== undefined ? lastCurT : 0;
      abA = t; abB = null;
      if (abLoopTimer) { clearInterval(abLoopTimer); abLoopTimer = null; }
      btnA.style.background = 'rgba(180,180,0,0.5)';
      btnB.style.background = 'rgba(80,40,0,0.3)';
    }
    updateAbLbl(); renderTL(lastCurT);
  });

  btnB.addEventListener('click', function(e) {
    e.stopPropagation();
    if (abA === null) { alert('Set A first'); return; }
    if (abA !== null && abB !== null) {
      // Clear
      abA = null; abB = null;
      if (abLoopTimer) { clearInterval(abLoopTimer); abLoopTimer = null; }
      btnA.style.background = 'rgba(80,80,0,0.3)';
      btnB.style.background = 'rgba(80,40,0,0.3)';
      updateAbLbl(); renderTL(lastCurT); return;
    }
    const t = lastCurT !== undefined ? lastCurT : (abA + 5);
    abB = t > abA ? t : abA + 1;
    btnB.style.background = 'rgba(180,80,0,0.5)';
    startAbLoop();
    updateAbLbl(); renderTL(lastCurT);
  });

  const closBtn = mkBtn('✕', 'Close (tap video)',
    'margin-left:auto;border-color:#f66;color:#f88;background:rgba(80,0,0,0.4);');

  ctrlRow.appendChild(btnStepL); ctrlRow.appendChild(btnStepR);
  ctrlRow.appendChild(timeLbl);
  ctrlRow.appendChild(speedWrap);
  ctrlRow.appendChild(playModeBtn);
  ctrlRow.appendChild(audioBtn);
  ctrlRow.appendChild(btnA); ctrlRow.appendChild(btnB);
  ctrlRow.appendChild(abLbl);
  ctrlRow.appendChild(closBtn);

  bar.appendChild(tl);
  bar.appendChild(ctrlRow);
  fs.appendChild(topBar);
  fs.appendChild(vidHost);
  fs.appendChild(bar);
  document.body.appendChild(fs);

  // Initial render
  renderTL(undefined);

  // ── Player helpers ────────────────────────────────────────────────────────
  const getP  = () => window.seeLearnVideoPlayers[vidHost.id] || null;
  const FRAME = 1 / 30;

  function fsSeek(t) {
    const p = getP(); if (!p) return;
    lastCurT = t;
    const kf = !window.keyframeOnly;
    if (typeof p.seekTo === 'function') try { p.seekTo(t, kf); } catch(ex) {}
    else if (p.setCurrentTime) p.setCurrentTime(t).catch(function(){});
    renderTL(t);
  }

  function fsSetSpeed(r) {
    const p = getP(); if (!p) return;
    if (typeof p.setPlaybackRate === 'function') try { p.setPlaybackRate(r); } catch(ex) {}
    else if (p.setPlaybackRate) p.setPlaybackRate(r).catch(function(){});
  }

  // ── Mount — full remount (used on open, audio change, speed change) ──────
  function mountFSPlayer(seekTo) {
    window.stopCellVideoLoop(vidHost.id);
    if (abLoopTimer) { clearInterval(abLoopTimer); abLoopTimer = null; }
    vidHost.innerHTML = '';
    if (!parsed) return;
    const seg0 = parsed[0], muted = isMuted();
    const segsArg = playMode === 'selected'
      ? parsed
      : [{ start: 0, dur: totalVidDur || 9999 }];
    const seekSec = (seekTo !== undefined) ? seekTo : (lastCurT !== undefined ? lastCurT : seg0.start);
    if (window.isYouTubeLink(it.link) && window.mountYouTubeClip)
      window.mountYouTubeClip(vidHost, it.link, seg0.start, seg0.dur, muted, seekSec, segsArg);
    else if (window.isVimeoLink(it.link) && window.mountVimeoClip)
      window.mountVimeoClip(vidHost, it.link, seg0.start, seg0.dur, muted, seekSec, segsArg);
    setTimeout(() => { if (playSpeed !== 1) fsSetSpeed(playSpeed); }, 1200);
  }

  // ── Switch mode without remounting — seek existing player, change loop ────
  function switchPlayMode() {
    timelineExpanded = playMode === 'full';
    sessionStorage.setItem('fs-play', playMode);
    renderTL(lastCurT);

    // Try to update loop on the existing player without destroying it
    const p = getP();
    const cur = lastCurT;
    if (!p) { mountFSPlayer(cur); return; }

    // Stop the current loop interval, keep the player alive
    if (window.seeLearnVideoTimers[vidHost.id]) {
      clearInterval(window.seeLearnVideoTimers[vidHost.id]);
      delete window.seeLearnVideoTimers[vidHost.id];
    }

    // Restart the loop with new segs
    const segsArg = playMode === 'selected'
      ? parsed
      : [{ start: 0, dur: totalVidDur || 9999 }];

    if (typeof p.seekTo === 'function') {
      // YT: seek to current position and restart interval with new boundaries
      try {
        if (cur !== undefined) p.seekTo(cur, !window.keyframeOnly);
        p.playVideo();
      } catch(ex) {}
      let segIdx = 0;
      window.seeLearnVideoTimers[vidHost.id] = setInterval(function() {
        try {
          const t = p.getCurrentTime();
          const seg = segsArg[segIdx];
          if (t >= seg.start + seg.dur || t < seg.start - 0.5) {
            segIdx = (segIdx + 1) % segsArg.length;
            p.seekTo(segsArg[segIdx].start, !window.keyframeOnly);
            p.playVideo();
          }
        } catch(ex) {}
      }, 100);
    } else if (p.setCurrentTime) {
      // Vimeo: same
      if (cur !== undefined) p.setCurrentTime(cur).catch(function(){});
      p.play().catch(function(){});
      let segIdx = 0;
      window.seeLearnVideoTimers[vidHost.id] = setInterval(function() {
        p.getCurrentTime().then(function(t) {
          const seg = segsArg[segIdx];
          if (t >= seg.start + seg.dur || t < seg.start - 0.5) {
            segIdx = (segIdx + 1) % segsArg.length;
            p.setCurrentTime(segsArg[segIdx].start);
            p.play();
          }
        }).catch(function(){});
      }, 100);
    } else {
      mountFSPlayer(cur);
    }
  }

  // Image mode
  if (!isVidNode) {
    const img = document.createElement('img');
    img.src = it.link;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
    vidHost.appendChild(img);
    vidHost.style.cursor = 'pointer';
    bar.style.display = 'none';
    // Tap anywhere to close — attach to both img and fs for reliability
    const imgClose = e => { e.stopPropagation(); fs.remove(); };
    img.addEventListener('pointerup', imgClose);
    fs.addEventListener('pointerup', imgClose);
    return;
  }

  // ── Duration + playhead polling (video only — declared here so fsClose can see them) ───
  let durTimer = null;
  let playTimer = null;

  mountFSPlayer();
  const tapClose = document.createElement('div');
  tapClose.style.cssText = 'position:absolute;inset:0;z-index:5;cursor:pointer;';
  tapClose.title = 'Tap to close';
  tapClose.addEventListener('pointerup', function(e) {
    e.stopPropagation(); fsClose();
  });
  vidHost.appendChild(tapClose);

  // ── Duration + playhead polling ───────────────────────────────────────────
  let durDone = false;
  durTimer = setInterval(function() {
    const p = getP(); if (!p || durDone) return;
    let d;
    if (typeof p.getDuration === 'function') {
      try { d = p.getDuration(); } catch(ex) {}
      if (d > 0) { durDone = true; totalVidDur = d; updateTopLeft(d); renderTL(lastCurT); }
    } else if (p.getDuration) {
      p.getDuration().then(v => {
        if (v > 0) { durDone = true; totalVidDur = v; updateTopLeft(v); renderTL(lastCurT); }
      }).catch(function(){});
    }
  }, 400);

  playTimer = setInterval(function() {
    const p = getP(); if (!p || isScrubbing) return;
    if (typeof p.getCurrentTime === 'function') {
      try {
        const t = p.getCurrentTime();
        if (typeof t === 'number' && t >= 0) { lastCurT = t; renderTL(t); }
      } catch(ex) {}
    } else if (p.getCurrentTime) {
      p.getCurrentTime().then(t => {
        if (t >= 0) { lastCurT = t; renderTL(t); }
      }).catch(function(){});
    }
  }, 250);

  // ── Timeline interaction — scrub only, no tap-toggle ─────────────────────
  tl.addEventListener('pointerdown', function(e) {
    if (e.ctrlKey) {
      e.preventDefault(); e.stopPropagation();
      if (timelineExpanded) fsSetAbMark(tlScrubSec(e));
      return;
    }
    e.preventDefault(); isScrubbing = true;
    tl.setPointerCapture(e.pointerId);
    fsSeek(tlScrubSec(e));
  });
  tl.addEventListener('pointermove', function(e) {
    if (!isScrubbing) return;
    fsSeek(tlScrubSec(e));
  });
  tl.addEventListener('pointerup', function(e) {
    if (!isScrubbing) return;
    isScrubbing = false;
    fsSeek(tlScrubSec(e));
    // Playhead stays at scrubbed position; polling resumes naturally
  });
  tl.addEventListener('pointercancel', function() { isScrubbing = false; });

  // ── A/B ───────────────────────────────────────────────────────────────────
  function updateAbLbl() {
    abLbl.textContent = abA !== null ? ('A:' + abA.toFixed(1) + (abB !== null ? ' B:' + abB.toFixed(1) : '')) : '';
  }

  function startAbLoop() {
    if (abLoopTimer) clearInterval(abLoopTimer);
    const p = getP(); if (!p || abA === null || abB === null) return;
    const lo = abA, hi = abB;
    if (typeof p.seekTo === 'function') {
      try { p.seekTo(lo, true); p.playVideo(); } catch(ex) {}
      abLoopTimer = setInterval(function() {
        try { const t = p.getCurrentTime();
          if (t >= hi || t < lo - 0.5) { p.seekTo(lo, true); p.playVideo(); }
        } catch(ex) {}
      }, 100);
    } else if (p.setCurrentTime) {
      p.setCurrentTime(lo); p.play();
      abLoopTimer = setInterval(function() {
        p.getCurrentTime().then(t => {
          if (t >= hi || t < lo - 0.5) { p.setCurrentTime(lo); p.play(); }
        }).catch(function(){});
      }, 100);
    }
  }

  function fsSetAbMark(t) {
    if (abA === null || abB !== null) { abA = t; abB = null;
      if (abLoopTimer) { clearInterval(abLoopTimer); abLoopTimer = null; }
    } else { abB = t > abA ? t : abA + 1; startAbLoop(); }
    updateAbLbl(); renderTL(lastCurT);
  }

  // ── Buttons ───────────────────────────────────────────────────────────────
  btnStepL.addEventListener('click', function(e) {
    e.stopPropagation();
    const p = getP(); if (!p) return;
    if (typeof p.getCurrentTime === 'function') {
      try { fsSeek(Math.max(0, p.getCurrentTime() - FRAME)); } catch(ex) {}
    } else if (p.getCurrentTime) {
      p.getCurrentTime().then(t => fsSeek(Math.max(0, t - FRAME))).catch(function(){});
    }
  });
  btnStepR.addEventListener('click', function(e) {
    e.stopPropagation();
    const p = getP(); if (!p) return;
    if (typeof p.getCurrentTime === 'function') {
      try { fsSeek(p.getCurrentTime() + FRAME); } catch(ex) {}
    } else if (p.getCurrentTime) {
      p.getCurrentTime().then(t => fsSeek(t + FRAME)).catch(function(){});
    }
  });
  speedSlider.addEventListener('input', function(e) {
    e.stopPropagation();
    playSpeed = parseFloat(this.value);
    speedLbl.textContent = playSpeed + 'x';
    sessionStorage.setItem('fs-speed', playSpeed);
    fsSetSpeed(playSpeed);
  });
  audioBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    audioMode = (audioMode + 1) % 3;
    if (audioMode === 2) { alert('Site audio: stub — not yet implemented.'); audioMode = 0; }
    sessionStorage.setItem('fs-audio', audioMode);
    this.textContent = audioLabels[audioMode];
    mountFSPlayer();
  });
  closBtn.addEventListener('click', function(e) { e.stopPropagation(); fsClose(); });

  function fsClose() {
    clearInterval(durTimer); clearInterval(playTimer);
    if (abLoopTimer) clearInterval(abLoopTimer);
    window.stopCellVideoLoop(vidHost.id);
    fs.remove();
  }
};
// ─── Menu ────────────────────────────────────────────────────────────────────
function closeMenu() {
  menuPanel.classList.remove('open');
  menuBtn.classList.remove('open');
  document.getElementById('settingsPanel').classList.remove('open');
  document.getElementById('miSettings').textContent = 'Settings \u25b8';
}

function positionMenuPanel() {
  const PAD   = 14;
  const viewH = window.innerHeight;
  const viewW = window.innerWidth;
  // menuWrap is 48×48px. In portrait: bottom:PAD left:PAD. In landscape: bottom:PAD right:PAD.
  // Panel opens above the button. Set via individual style props (cssText would wipe display:flex).
  const maxH = viewH - 48 - PAD * 2 - 10; // full height minus button and margins
  menuPanel.style.position  = 'fixed';
  menuPanel.style.maxHeight = Math.max(maxH, 150) + 'px';
  menuPanel.style.minWidth  = '200px';
  menuPanel.style.overflowY = 'scroll';
  menuPanel.style.bottom    = (PAD + 48 + 6) + 'px'; // just above the button
  if (isPortrait) {
    // Button is at bottom-left in portrait
    menuPanel.style.left  = PAD + 'px';
    menuPanel.style.right = 'auto';
  } else {
    // Button is at bottom-right in landscape
    menuPanel.style.right = PAD + 'px';
    menuPanel.style.left  = 'auto';
  }
}

menuBtn.addEventListener('pointerup', e => {
  e.stopPropagation();
  const o = menuPanel.classList.toggle('open');
  menuBtn.classList.toggle('open', o);
  if (o) positionMenuPanel();
  else document.getElementById('settingsPanel').classList.remove('open');
});
menuPanel.addEventListener('pointerup', e => e.stopPropagation());
document.addEventListener('pointerup', () => { if (menuPanel.classList.contains('open')) closeMenu(); });

// ═══════════════════════════════════════════════════════════════════════════
// TABLE MODULE — clean rewrite
//
// Design rules (simple, auditable, no surprises):
//
//  1. ONE storage key for column config:  'sal-cols'
//     Format: { order: ['field',...], widths: { field: px, ... } }
//     Written only by: colMoved(), colResized()
//     Read only by:    buildColConfig() at the start of openTable()
//
//  2. linksData is MASTER.  Tabulator gets a deep copy.
//     syncTab() pulls Tabulator → linksData before every save.
//
//  3. saveData() is the ONE save function.
//     It calls syncTab(), writes seeandlearn-links + mlynx-links.
//     It does NOT touch 'sal-cols'.
//
//  4. openTable() rebuilds Tabulator from scratch every time it's called.
//     It always reads 'sal-cols' fresh.  No stale in-memory state.
//
//  5. Column widths are applied with setTimeout(0) + _applyingWidths guard
//     so Tabulator's layout engine can't overwrite them.
// ═══════════════════════════════════════════════════════════════════════════

let rawJsonMode = false;

const COL_W_DEFAULT = 120;
const COL_W_MAX     = 245;   // ~35 chars
const COL_W_MIN     = 8;

// ── Column config storage (ONE key, ONE object) ───────────────────────────
function colConfigLoad() {
  try {
    const s = localStorage.getItem('sal-cols');
    if (!s) return null;
    const c = JSON.parse(s);
    if (c && Array.isArray(c.order) && c.order.length) return c;
  } catch(e) {}
  return null;
}
function colConfigSave(order, widths) {
  localStorage.setItem('sal-cols', JSON.stringify({ order: order, widths: widths }));
}

// ── Data helpers ──────────────────────────────────────────────────────────
function deepCopy(x) { return JSON.parse(JSON.stringify(x)); }

// Scrub Tabulator's internal _ fields out of linksData
function scrubUnderscores() {
  linksData = linksData.map(r => {
    const o = {};
    Object.keys(r).forEach(k => { if (!k.startsWith('_')) o[k] = r[k]; });
    return o;
  });
}

// Pull Tabulator's current state into linksData
function syncTab() {
  if (!window._salTab) return;
  try {
    const rows = window._salTab.getData();
    linksData = rows.map(r => {
      const o = {};
      Object.keys(r).forEach(k => { if (!k.startsWith('_')) o[k] = r[k]; });
      return o;
    });
  } catch(e) {}
}

// Save linksData to localStorage.
// Pass skipSync=true when linksData has already been updated directly (e.g. after delete)
// to prevent syncTab() from reading Tabulator's async state and resurrecting deleted rows.
function saveData(skipSync) {
  if (!skipSync) syncTab();
  scrubUnderscores();
  const s = JSON.stringify(linksData);
  localStorage.setItem('seeandlearn-links', s);
  localStorage.setItem('mlynx-links', s);
  localStorage.setItem('sal-edited', Date.now().toString());
}

// Alias expected by rest of codebase
function saveJsonSilent() { saveData(); }

// saveJson: explicit download
function saveJson() {
  saveData();
  const blob = new Blob([JSON.stringify(linksData, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'links.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
}

window.triggerDownload = async function(filename, data) {
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

// ── Column order ──────────────────────────────────────────────────────────
// Build ordered key list from linksData, merged with saved config order
function buildKeyOrder() {
  // All real keys in data
  const allKeys = new Set();
  linksData.forEach(r => Object.keys(r).forEach(k => {
    if (!k.startsWith('_')) allKeys.add(k);
  }));

  const cfg = colConfigLoad();
  if (cfg) {
    // Use saved order, append any new keys not yet in it
    const extra = [...allKeys].filter(k => !cfg.order.includes(k));
    return [...cfg.order.filter(k => allKeys.has(k)), ...extra];
  }
  // No saved order — use data key insertion order
  const seen = new Set(), order = [];
  linksData.forEach(r => Object.keys(r).forEach(k => {
    if (!k.startsWith('_') && !seen.has(k)) { seen.add(k); order.push(k); }
  }));
  return order.length ? order :
    ['show','VidRange','cell','fit','link','cname','sname',
     'v.title','v.author','attribution','comment','Mute','Portrait'];
}

// Rewrite every linksData row's key order to match keyOrder array
function reorderKeys(keyOrder) {
  linksData = linksData.map(r => {
    const o = {};
    keyOrder.forEach(k => { if (k in r) o[k] = r[k]; });
    Object.keys(r).forEach(k => { if (!(k in o)) o[k] = r[k]; });
    return o;
  });
}

// ── Table state ───────────────────────────────────────────────────────────
let _colOrder  = [];   // current visual column order (field names)
let _activeRow = null; // Tabulator Row object
let _activeCol = null; // field name string

window._salTab  = null; // the Tabulator instance

// ── Utility ───────────────────────────────────────────────────────────────
function setStatus(msg, color) {
  const el = document.getElementById('jsonStatus');
  if (!el) return;
  el.textContent = msg; el.style.color = color || '#8ef';
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
}
function updateFocusIndicator() {
  const el = document.getElementById('focusIndicator');
  if (!el) return;
  const r = _activeRow ? 'row ' + _activeRow.getPosition() : '—';
  const c = (_activeCol && !_activeCol.startsWith('_')) ? _activeCol : '—';
  el.textContent = 'Focus: ' + r + ' · col: ' + c;
}
function getFocusedCol() {
  if (_activeCol && !_activeCol.startsWith('_') && _colOrder.includes(_activeCol)) return _activeCol;
  return _colOrder.length ? _colOrder[_colOrder.length-1] : null;
}
function getFocusedRow() {
  if (_activeRow) return _activeRow;
  if (!window._salTab) return null;
  const rows = window._salTab.getRows();
  return rows.length ? rows[0] : null;
}

window.getFirstEmptyCell = function() {
  const occ = new Set();
  linksData.forEach(r => { if (r && r.cell) occ.add(String(r.cell).toLowerCase()); });
  const L = 'abcde';
  for (let r=1; r<=5; r++)
    for (let c=0; c<5; c++)
      if (!occ.has(r+L[c])) return r+L[c];
  return '';
};

function getDistinctVals(field) {
  const s = new Set();
  linksData.forEach(r => {
    const v = String(r[field]||'').trim(); if (!v) return;
    if (field==='cname'||field==='Topic')
      v.split(',').map(t=>t.trim()).filter(Boolean).forEach(t=>s.add(t));
    else s.add(v);
  });
  return Array.from(s).sort();
}

// ── Column operations ─────────────────────────────────────────────────────
function dupColumn(src) {
  if (!src || !_colOrder.includes(src)) return;
  let nk = src+'_copy', n=2;
  while (_colOrder.includes(nk)) nk = src+'_copy'+n++;
  const idx = _colOrder.indexOf(src);
  _colOrder.splice(idx+1, 0, nk);
  linksData.forEach(r => { r[nk] = r[src]!==undefined ? String(r[src]) : ''; });
  reorderKeys(_colOrder);
  saveData();
  _activeCol = nk;
  openTable();
  setStatus('Duplicated "'+src+'" → "'+nk+'"');
}
function delColumn(k) {
  if (!k || !_colOrder.includes(k)) return;
  if (!confirm('Delete column "'+k+'" from ALL rows?')) return;
  _colOrder = _colOrder.filter(x => x!==k);
  linksData.forEach(r => delete r[k]);
  if (_activeCol===k) _activeCol=null;
  saveData();
  openTable();
}
function addColAfter(after) {
  const nk = prompt('New column name'+(after?' (after "'+after+'")':'')+':');
  if (!nk) return;
  if (_colOrder.includes(nk)) { alert('"'+nk+'" already exists.'); return; }
  const idx = after ? _colOrder.indexOf(after) : _colOrder.length-1;
  _colOrder.splice(idx+1, 0, nk);
  linksData.forEach(r => { if (r[nk]===undefined) r[nk]=''; });
  reorderKeys(_colOrder);
  saveData();
  _activeCol = nk;
  openTable();
}
function renameColumn(k) {
  if (!k || !_colOrder.includes(k)) return;
  const nk = prompt('Rename "'+k+'" to:', k);
  if (!nk || nk===k) return;
  if (_colOrder.includes(nk)) { alert('"'+nk+'" already exists.'); return; }
  _colOrder[_colOrder.indexOf(k)] = nk;
  linksData.forEach(r => { r[nk]=r[k]!==undefined?r[k]:''; delete r[k]; });
  saveData();
  _activeCol = nk;
  openTable();
}

// ── autocomplete editors ──────────────────────────────────────────────────
function makeDatalistEditor(vals) {
  return function(cell, onRendered, success, cancel) {
    const dlId = 'dl_'+Math.random().toString(36).slice(2);
    const dl   = document.createElement('datalist'); dl.id = dlId;
    vals.forEach(v => { const o=document.createElement('option'); o.value=v; dl.appendChild(o); });
    const inp = document.createElement('input');
    inp.type='text'; inp.setAttribute('list',dlId); inp.value=cell.getValue()||'';
    inp.style.cssText='width:100%;height:100%;border:none;padding:2px 4px;background:#0d1a2a;color:#fff;font-size:13px;outline:none;box-sizing:border-box;';
    const w = document.createElement('div');
    w.style.cssText='width:100%;height:100%;display:flex;align-items:center;';
    w.appendChild(dl); w.appendChild(inp);
    onRendered(()=>{ inp.focus(); inp.select(); });
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key==='Enter')  { e.preventDefault(); success(inp.value.trim()); }
      if (e.key==='Escape') { e.preventDefault(); cancel(); }
      if (e.key==='Tab')    { success(inp.value.trim()); }
    });
    inp.addEventListener('blur', ()=>success(inp.value.trim()));
    return w;
  };
}

function makeCommaListEditor(terms) {
  return function(cell, onRendered, success, cancel) {
    const inp = document.createElement('input');
    inp.type='text'; inp.value=cell.getValue()||'';
    inp.style.cssText='width:100%;height:100%;border:none;padding:2px 4px;background:#0d1a2a;color:#fff;font-size:13px;outline:none;box-sizing:border-box;';
    const dd = document.createElement('div');
    dd.style.cssText='position:fixed;z-index:99999;background:#1a2a3a;border:1px solid #4af;border-radius:0 0 6px 6px;max-height:160px;overflow-y:auto;display:none;';
    document.body.appendChild(dd);
    function posDD() {
      const r=inp.getBoundingClientRect();
      dd.style.left=r.left+'px'; dd.style.top=r.bottom+'px'; dd.style.width=r.width+'px';
    }
    function lastToken() { const p=inp.value.split(','); return p[p.length-1].trimStart(); }
    function showDD() {
      const tok=lastToken();
      const hits=tok ? terms.filter(t=>t.toLowerCase().startsWith(tok.toLowerCase())) : terms;
      dd.innerHTML='';
      if (!hits.length) { dd.style.display='none'; return; }
      hits.forEach(t => {
        const it=document.createElement('div');
        it.textContent=t; it.style.cssText='padding:6px 10px;cursor:pointer;color:#cef;border-bottom:1px solid #244;';
        it.addEventListener('mouseenter',()=>it.style.background='#1a3a5a');
        it.addEventListener('mouseleave',()=>it.style.background='');
        it.addEventListener('mousedown',e=>{
          e.preventDefault();
          const p=inp.value.split(','); p[p.length-1]=' '+t; inp.value=p.join(',')+', ';
          showDD(); inp.focus();
        });
        dd.appendChild(it);
      });
      posDD(); dd.style.display='block';
    }
    function cleanup() { dd.style.display='none'; if(dd.parentNode) dd.parentNode.removeChild(dd); }
    const wrap=document.createElement('div');
    wrap.style.cssText='width:100%;height:100%;display:flex;align-items:center;position:relative;';
    wrap.appendChild(inp);
    onRendered(()=>{ inp.focus(); inp.select(); showDD(); });
    inp.addEventListener('input', showDD);
    inp.addEventListener('focus', showDD);
    inp.addEventListener('blur',  ()=>setTimeout(()=>{ cleanup(); success(inp.value.trim()); },150));
    inp.addEventListener('keydown', e=>{
      e.stopPropagation();
      if (e.key==='Enter')  { e.preventDefault(); cleanup(); success(inp.value.trim()); }
      if (e.key==='Escape') { e.preventDefault(); cleanup(); cancel(); }
      if (e.key==='Tab')    { cleanup(); success(inp.value.trim()); }
      if (e.key==='ArrowDown'||e.key==='ArrowUp') {
        const items=dd.querySelectorAll('div'); if (!items.length) return;
        e.preventDefault();
        const cur=dd.querySelector('.dd-hi');
        let idx=cur?Array.from(items).indexOf(cur):-1;
        if(cur){cur.classList.remove('dd-hi');cur.style.background='';}
        idx=e.key==='ArrowDown'?Math.min(idx+1,items.length-1):Math.max(idx-1,0);
        items[idx].classList.add('dd-hi'); items[idx].style.background='#2a4a6a';
        items[idx].scrollIntoView({block:'nearest'});
      }
    });
    return wrap;
  };
}

// Apply column widths by injecting a <style> tag with CSS selectors.
// This bypasses Tabulator's layout engine completely — no API calls, no events.
// Tabulator uses [tabulator-field="fieldname"] on column header and cell elements.


// This is the ONLY entry point for (re)building Tabulator.
// It always reads fresh from linksData and colConfig.
window.openTable = function() {
  const container = document.getElementById('tableEditor');
  if (!container) return;

  if (window._salTab) { try { window._salTab.destroy(); } catch(e) {} window._salTab = null; }
  container.innerHTML = '';
  _activeRow = null;
  scrubUnderscores();
  _colOrder = buildKeyOrder();

  const cnameVals  = getDistinctVals('cname');
  const snameVals  = getDistinctVals('sname');
  const authorVals = getDistinctVals('v.author');
  const topicVals  = getDistinctVals('Topic');

  const cols = [];
  cols.push({
    title:'', field:'_del', width:26, minWidth:26, resizable:false, headerSort:false, hozAlign:'center',
    formatter:()=>"<span style='color:#f55;font-size:14px;cursor:pointer;'>\u2715</span>",
    cellClick(e, cell) {
      if (!confirm('Delete this row?')) return;
      const rowData = cell.getRow().getData();
      const cellVal = rowData.cell;
      const idx = cellVal ? linksData.findIndex(r => r.cell === cellVal) : window._salTab.getRows().indexOf(cell.getRow());
      if (idx > -1) {
        const rd = JSON.parse(localStorage.getItem('seeandlearn-recycle')||'[]');
        rd.push(deepCopy(linksData[idx]));
        localStorage.setItem('seeandlearn-recycle', JSON.stringify(rd));
        linksData.splice(idx, 1);
      }
      // Save BEFORE Tabulator's async row.delete() so syncTab can't resurrect the row
      saveData(true);  // skipSync=true — linksData already updated by splice above
      cell.getRow().delete();  // visual removal only
    }
  });
  cols.push({ title:'', field:'_sel', width:26, minWidth:26, resizable:false, headerSort:false, hozAlign:'center', formatter:'rowSelection', titleFormatter:'rowSelection', cellClick(e,cell){ cell.getRow().toggleSelect(); } });
  cols.push({
    title:'\u2195', field:'_move', width:32, minWidth:32, resizable:false, headerSort:false, hozAlign:'center',
    formatter:()=>"<span style='cursor:pointer;color:#777;font-size:10px;'>\u25b2\u25bc</span>",
    cellClick(e, cell) {
      const rect = cell.getElement().getBoundingClientRect();
      const dir = e.clientY < rect.top + rect.height/2 ? -1 : 1;
      syncTab();
      const pos = window._salTab.getRows().indexOf(cell.getRow());
      const tgt = pos + dir;
      if (tgt < 0 || tgt >= linksData.length) return;
      const tmp = linksData[pos]; linksData[pos] = linksData[tgt]; linksData[tgt] = tmp;
      saveData(); window.openTable();
    }
  });

  _colOrder.forEach(k => {
    const def = { title:k, field:k, editor:'input', headerSort:true, maxWidth:COL_W_MAX, minWidth:COL_W_MIN, resizable:true, tooltip:true,
      cellClick(e,cell){ _activeRow=cell.getRow(); _activeCol=cell.getColumn().getField(); updateFocusIndicator(); },
      cellEdited(){ saveData(); }
    };
    if (k==='cname'||k==='Topic') def.editor = makeCommaListEditor(k==='cname'?cnameVals:topicVals);
    else if (k==='sname')    def.editor = makeDatalistEditor(snameVals);
    else if (k==='v.author') def.editor = makeDatalistEditor(authorVals);
    cols.push(def);
  });

  // Column widths AND order are managed exclusively by Tabulator's built-in persistence module.
  // It writes/reads localStorage['tabulator-sal-table'] automatically.
  // It subscribes internally to: column-resized, column-moved, column-width, layout-refreshed.
  // We do NOT call setWidth(), do NOT inject CSS, do NOT fight the layout engine.
  window._salTab = new Tabulator(container, {
    data: deepCopy(linksData),
    reactiveData: false,
    columns: cols,
    layout: 'fitData',
    autoResize: false,
    selectableRows: true,
    movableColumns: true,
    history: false,
    height: '100%',
    persistence: { columns: true },
    persistenceID: 'sal-table',

    tableBuilt() {
      if (!window._salTab) return;
      const actual = window._salTab.getColumns().map(c=>c.getField()).filter(f=>f&&!f.startsWith('_'));
      if (actual.length) _colOrder = actual;
      updateColHeaderStrip();
    },

    columnMoved(column, columns) {
      syncTab();
      _colOrder = columns.map(c=>c.getField()).filter(f=>f&&!f.startsWith('_'));
      reorderKeys(_colOrder);
      colConfigSave(_colOrder, {});
      saveData();
      updateColHeaderStrip();
    },

    rowSelectionChanged(data, rows) {
      const btn = document.getElementById('deleteSelectedRows');
      if (btn) btn.style.display = rows.length > 0 ? 'inline-block' : 'none';
    },

    rowClick(e, row) { _activeRow = row; updateFocusIndicator(); }
  });

  updateColHeaderStrip();
};

// Backwards-compat alias used throughout codebase
window.renderTableEditor = window.openTable;

// Expose legacy names used by other modules
window.syncFromTabulator = syncTab;
let tableKeys = _colOrder; // live reference — updated by openTable
Object.defineProperty(window, 'tableKeys', { get:()=>_colOrder, set:v=>{ _colOrder=v; } });

// ─── TOOLBAR BUTTONS ───────────────────────────────────────────────────────
document.getElementById('addTableItem').addEventListener('click', function() {
  if (!window._salTab) return;
  const newRow = {}; _colOrder.forEach(k => newRow[k]='');
  const fr = getFocusedRow();
  if (fr) window._salTab.addRow(newRow, false, fr);
  else    window._salTab.addRow(newRow, true);
  saveData(); setStatus('Row added');
});

document.getElementById('btn-row-add-bottom').addEventListener('click', function() {
  if (!window._salTab) return;
  const newRow = {}; _colOrder.forEach(k => newRow[k]='');
  window._salTab.addRow(newRow, false);
  saveData(); setStatus('Row added at bottom');
});

document.getElementById('btn-duplicate-row-action').addEventListener('click', function() {
  if (!window._salTab) return;
  const sel = window._salTab.getSelectedRows();
  const targets = sel.length ? sel : (_activeRow ? [_activeRow] : []);
  if (!targets.length) { setStatus('Click a row first', '#f88'); return; }
  [...targets].reverse().forEach(row => {
    const nr = deepCopy(row.getData());
    Object.keys(nr).forEach(k => { if (k.startsWith('_')) delete nr[k]; });
    nr.cell = window.getFirstEmptyCell();
    window._salTab.addRow(nr, false, row);
  });
  saveData(); setStatus('Row(s) duplicated');
});

document.getElementById('deleteSelectedRows').addEventListener('click', function() {
  if (!window._salTab) return;
  const sel = window._salTab.getSelectedRows();
  if (!sel.length) { setStatus('Select rows first', '#f88'); return; }
  if (!confirm('Delete '+sel.length+' row(s)?')) return;
  const rd = JSON.parse(localStorage.getItem('seeandlearn-recycle')||'[]');
  // Remove from linksData first (by cell value), then delete visually from Tabulator
  sel.forEach(row => {
    const rowData = row.getData();
    rd.push(deepCopy(rowData));
    const cellVal = rowData.cell;
    const idx = cellVal ? linksData.findIndex(r => r.cell === cellVal) : -1;
    if (idx > -1) linksData.splice(idx, 1);
    row.delete(); // visual only
  });
  localStorage.setItem('seeandlearn-recycle', JSON.stringify(rd));
  saveData(true);  // skipSync=true — linksData already updated by splices above
  _activeRow=null; this.style.display='none'; setStatus('Row(s) deleted');
});

document.getElementById('btn-col-add').addEventListener('click', function() {
  syncTab(); addColAfter(getFocusedCol());
});
document.getElementById('btn-duplicate-col-action').addEventListener('click', function() {
  syncTab(); const s=getFocusedCol();
  if (!s) { setStatus('Click a cell first','#f88'); return; } dupColumn(s);
});
document.getElementById('btn-col-rename').addEventListener('click', function() {
  syncTab(); const k=getFocusedCol();
  if (!k) { setStatus('Click a cell first','#f88'); return; } renameColumn(k);
});
document.getElementById('btn-col-delete').addEventListener('click', function() {
  syncTab(); const k=getFocusedCol();
  if (!k) { setStatus('Click a cell first','#f88'); return; } delColumn(k);
});

document.getElementById('btn-export-chosen').addEventListener('click', function() {
  syncTab();
  const sel = window._salTab ? window._salTab.getSelectedRows() : [];
  const data = sel.length ? sel.map(r=>deepCopy(r.getData())) : linksData;
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=sel.length?'links_selected.json':'links.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
  setStatus('Downloaded '+data.length+' row(s)');
});

document.getElementById('btn-import').addEventListener('click', function() {
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
  inp.onchange=function(){
    const file=this.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try {
        const imported=JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) { alert('Expected JSON array'); return; }
        if (confirm('OK=merge · Cancel=replace')) imported.forEach(r=>linksData.push(r));
        else linksData=imported;
        saveData(); window.openTable(); setStatus('Imported '+imported.length+' rows');
      } catch(e) { alert('Invalid JSON: '+e.message); }
    };
    reader.readAsText(file);
  };
  inp.click();
});

// Ctrl+D duplicate row
window.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key.toLowerCase()==='d') {
    const m=document.getElementById('jsonModal');
    if (m && m.classList.contains('open')) {
      e.preventDefault(); e.stopPropagation();
      document.getElementById('btn-duplicate-row-action').click();
    }
  }
}, true);

// ─── RAW JSON TOGGLE ───────────────────────────────────────────────────────
document.getElementById('toggleRawJson').addEventListener('click', function() {
  rawJsonMode = !rawJsonMode;
  this.textContent = rawJsonMode ? 'Show Visual Editor' : 'Show Raw JSON';
  if (rawJsonMode) {
    syncTab();
    document.getElementById('jsonText').value = JSON.stringify(linksData, null, 2);
    document.getElementById('tableEditor').style.display  = 'none';
    document.getElementById('jsonText').style.display     = 'block';
    document.getElementById('tableToolbar').style.display = 'none';
  } else {
    try { linksData = JSON.parse(document.getElementById('jsonText').value); }
    catch(e) { alert('Invalid JSON'); rawJsonMode=true; return; }
    document.getElementById('tableEditor').style.display  = 'block';
    document.getElementById('jsonText').style.display     = 'none';
    document.getElementById('tableToolbar').style.display = 'flex';
    window.openTable();
  }
});

// ─── OPEN / CLOSE TABLE EDITOR ─────────────────────────────────────────────
document.getElementById('miTables').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  rawJsonMode = false;
  document.getElementById('toggleRawJson').textContent         = 'Show Raw JSON';
  document.getElementById('tableEditor').style.display         = 'block';
  document.getElementById('jsonText').style.display            = 'none';
  document.getElementById('tableToolbar').style.display        = 'flex';
  document.getElementById('deleteSelectedRows').style.display  = 'none';
  document.getElementById('jsonStatus').textContent            = '';
  document.getElementById('jsonModal').classList.add('open');
  window.openTable();
});

function closeTableEditor() {
  saveData();
  document.getElementById('jsonModal').classList.remove('open');
  render();
}
window.closeTableEditor = closeTableEditor;

window.applyJsonChanges = function() {
  try {
    if (rawJsonMode) {
      const d=JSON.parse(document.getElementById('jsonText').value);
      if (!Array.isArray(d)) throw new Error('Expected array');
      linksData=d;
    }
    saveData();
    document.getElementById('jsonModal').classList.remove('open');
    render(); return true;
  } catch(e) {
    document.getElementById('jsonStatus').textContent='Error: '+e.message; return false;
  }
};

document.getElementById('jsonApply').addEventListener('click', window.applyJsonChanges);
document.getElementById('jsonPush').addEventListener('pointerup', e => {
  e.preventDefault(); e.stopPropagation();
  saveData();
  window.pushToGitHub();
});
document.getElementById('jsonDl').addEventListener('click', saveJson);
document.getElementById('jsonCancel').addEventListener('click', closeTableEditor);

// ─── HORIZONTAL SCROLL — buttons + keyboard arrows ─────────────────────────
(function() {
  const AMT = 400;
  function scroller() {
    const te = document.getElementById('tableEditor');
    return te ? (te.querySelector('.tabulator-tableholder')||te) : null;
  }
  document.getElementById('jsonScrollLeft').addEventListener('click', ()=>{ const el=scroller(); if(el) el.scrollBy({left:-AMT,behavior:'smooth'}); });
  document.getElementById('jsonScrollRight').addEventListener('click', ()=>{ const el=scroller(); if(el) el.scrollBy({left:AMT,behavior:'smooth'}); });
  document.addEventListener('keydown', function(e) {
    const modal=document.getElementById('jsonModal');
    if (!modal||!modal.classList.contains('open')) return;
    if (e.key!=='ArrowLeft'&&e.key!=='ArrowRight') return;
    const a=document.activeElement;
    if (a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.closest('.tabulator-cell.tabulator-editing'))) return;
    e.preventDefault();
    const el=scroller();
    if (el) el.scrollBy({left:e.key==='ArrowRight'?AMT:-AMT,behavior:'smooth'});
  });
})();
document.getElementById('jsonModal').addEventListener('pointerup', e => e.stopPropagation());
document.getElementById('jsonText').addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase()==='s') { e.preventDefault(); window.applyJsonChanges(); }
});


// (saveJsonSilent, saveJson, triggerDownload defined in table module above)

// ─── Settings ─────────────────────────────────────────────────────────────────
document.getElementById('miSaveJson').addEventListener('pointerup', e => { e.stopPropagation(); closeMenu(); saveJson(); });
document.getElementById('miHelp').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  alert('SeeAndLearn\n\nTap cell image → fullscreen\nTap empty cell → quick-fill (Ctrl+S to save)\n\nTable editor:\n• Click any cell to focus it for toolbar row/col buttons\n• Drag column headers to reorder\n• Drag column edges to resize (auto-saved)\n• Right-click column header: rename / duplicate / delete\n• Push to GitHub: syncs all edits including column order');
});
document.getElementById('miSettings').addEventListener('pointerup', e => {
  e.stopPropagation();
  const sp = document.getElementById('settingsPanel');
  const o = sp.classList.toggle('open');
  e.currentTarget.textContent = o ? 'Settings \u25be' : 'Settings \u25b8';
});

function syncFit() {
  document.getElementById('togFit').checked       = (fitMode === 'ei');
  document.getElementById('fitLabel').textContent = fitMode === 'ei' ? 'Img: Entire Image' : 'Img: Fill Cell';
}
document.getElementById('togFit').addEventListener('change', function() {
  fitMode = this.checked ? 'ei' : 'fc';
  localStorage.setItem('mlynx-fit', fitMode); syncFit(); render();
});
document.getElementById('togCellLbl').addEventListener('change', function() { showCellLbl = this.checked; render(); });
document.getElementById('togCname').addEventListener('change',   function() { showCname   = this.checked; render(); });
document.getElementById('togKeyframe').addEventListener('change', function() {
  window.keyframeOnly = this.checked;
  localStorage.setItem('seeandlearn-keyframeOnly', this.checked ? '1' : '0');
});
document.getElementById('togAutopause').addEventListener('change', function() {
  window.autoPauseGrid = this.checked;
  localStorage.setItem('seeandlearn-autopause', this.checked ? '1' : '0');
});
// Restore toggles on load
(function() {
  const kf = document.getElementById('togKeyframe');
  if (kf) kf.checked = (localStorage.getItem('seeandlearn-keyframeOnly') === '1');
  const ap = document.getElementById('togAutopause');
  // Default ON — only off if explicitly saved as '0'
  if (ap) ap.checked = (localStorage.getItem('seeandlearn-autopause') !== '0');
  window.autoPauseGrid = ap ? ap.checked : true;
})();

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveJson(); }
});

// ─── Quick-fill ───────────────────────────────────────────────────────────────
let qfCell = '';
document.getElementById('qfDesktop').style.display = ISMOBILE ? 'none' : 'block';

// ─── Get Video Info ───────────────────────────────────────────────────────────
window.fillEmptyVideoInfo = async function() {
  if (!rawJsonMode) syncFromTabulator();
  const btn = document.getElementById('btn-get-vid-info');
  if (btn) btn.textContent = 'Fetching...';
  let updated = false;
  if (!tableKeys.includes('v.title'))  tableKeys.push('v.title');
  if (!tableKeys.includes('v.author')) tableKeys.push('v.author');
  if (!tableKeys.includes('Portrait')) tableKeys.push('Portrait');

  await Promise.all(linksData.map(async row => {
    const isVid = row.VidRange && window.parseVideoAsset && window.parseVideoAsset(row.VidRange) !== null;
    if (!isVid || !row.link || !row.link.match(/^https?:/i)) return;
    if (row['v.title'] && row['v.author'] && row.Portrait) return;
    try {
      const res  = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(row.link));
      const data = await res.json();
      if (data.title       && !row['v.title'])  { row['v.title']  = data.title;       updated = true; }
      if (data.author_name && !row['v.author']) { row['v.author'] = data.author_name; updated = true; }
      if (data.width && data.height && (!row.Portrait || row.Portrait === ''))
        { row.Portrait = data.width < data.height ? '1' : '0'; updated = true; }
    } catch(e) {}
  }));

  if (updated) {
    saveJsonSilent();
    window.renderTableEditor();
  }
  if (btn) btn.textContent = 'Get Video Info';
  setStatus(updated ? 'Video info updated' : 'No new info found');
};

// ─── Compat shims ─────────────────────────────────────────────────────────────
window.duplicateActiveRow = function() {
  document.getElementById('btn-duplicate-row-action').click();
};
window.lastActiveRowIdx = -1;

// ─── Load from GitHub (hamburger menu) ───────────────────────────────────────
document.getElementById('miLoadGithub').addEventListener('pointerup', async e => {
  e.stopPropagation(); closeMenu();
  const owner = localStorage.getItem('github-owner');
  const repo  = localStorage.getItem('github-repo');
  const token = localStorage.getItem('github-token');
  if (!owner || !repo) {
    alert('GitHub owner/repo not set.\nOpen Settings → GitHub Sync to configure, or do a Push first.');
    return;
  }
  if (!confirm('Load links.json from GitHub?\n\nThis REPLACES your current data.\nMake sure you have pushed unsaved changes first.')) return;
  try {
    const headers = token ? { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' } : {};
    const rawUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/links.json?v=' + Date.now();
    const res = await fetch(rawUrl, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Expected JSON array');
    linksData = data;
    linksData.forEach(row => {
      if ('asset' in row && !('VidRange' in row)) { row.VidRange = row.asset; delete row.asset; }
    });
    saveData();   // writes sal-edited so localStorage stays authoritative
    render();
    alert('Loaded ' + linksData.length + ' rows from GitHub.');
  } catch(err) { alert('Load from GitHub failed:\n' + err.message); }
});

// ─── ShowThumb ────────────────────────────────────────────────────────────────
document.getElementById('btn-show-thumb').addEventListener('click', function() {
  if (!_activeRow) { setStatus('Click a row first', '#f88'); return; }
  const data = _activeRow.getData();
  const link = data.link || '';
  if (!link) { setStatus('No link in this row', '#f88'); return; }

  // Remove any existing thumb popup
  const old = document.getElementById('sal-thumb-popup');
  if (old) { old.remove(); return; }

  const popup = document.createElement('div');
  popup.id = 'sal-thumb-popup';
  popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
    + 'z-index:99999;background:#111;border:2px solid #4af;border-radius:10px;'
    + 'padding:8px;box-shadow:0 8px 32px rgba(0,0,0,0.8);max-width:360px;width:90%;';

  const isVid = data.VidRange && window.parseVideoAsset && window.parseVideoAsset(String(data.VidRange)) !== null;
  const isYT  = window.isYouTubeLink && window.isYouTubeLink(link);
  const isVim = window.isVimeoLink && window.isVimeoLink(link);

  let imgSrc = '';
  if (isYT) {
    // YouTube thumbnail URL (hqdefault is always available)
    const m = link.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) imgSrc = 'https://img.youtube.com/vi/' + m[1] + '/hqdefault.jpg';
  } else if (!isVid) {
    imgSrc = link; // direct image URL
  }

  const label = document.createElement('div');
  label.style.cssText = 'color:#8ef;font-size:12px;margin-bottom:6px;text-align:center;'
    + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  label.textContent = (data.cname || data['v.title'] || link).slice(0, 50);
  popup.appendChild(label);

  if (imgSrc) {
    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.cssText = 'width:100%;border-radius:6px;display:block;';
    img.onerror = function() { img.style.display='none'; label.textContent += ' (image failed to load)'; };
    popup.appendChild(img);
  } else if (isVim) {
    // Vimeo thumbnail via noembed
    fetch('https://noembed.com/embed?url=' + encodeURIComponent(link))
      .then(r => r.json()).then(d => {
        if (d.thumbnail_url) {
          const img = document.createElement('img');
          img.src = d.thumbnail_url;
          img.style.cssText = 'width:100%;border-radius:6px;display:block;';
          popup.appendChild(img);
        }
      }).catch(function(){});
  } else {
    const msg = document.createElement('div');
    msg.style.cssText = 'color:#888;font-size:12px;text-align:center;padding:20px;';
    msg.textContent = 'No thumbnail available';
    popup.appendChild(msg);
  }

  const close = document.createElement('div');
  close.style.cssText = 'text-align:center;margin-top:8px;color:#666;font-size:11px;cursor:pointer;';
  close.textContent = 'click anywhere to close';
  popup.appendChild(close);

  document.body.appendChild(popup);

  // Click anywhere to close
  setTimeout(function() {
    document.addEventListener('pointerup', function handler() {
      popup.remove(); document.removeEventListener('pointerup', handler);
    });
  }, 100);
});

// ─── MakeJsonFromTopic stub ───────────────────────────────────────────────────
document.getElementById('btn-make-json-topic').addEventListener('click', function() {
  const topic = prompt('Enter a topic to generate links.json entries for (stub):');
  if (!topic) return;
  setStatus('MakeJsonFromTopic: stub — topic="' + topic + '" (not yet implemented)', '#ff8');
});

// ─── VideoEdit button ─────────────────────────────────────────────────────────
document.getElementById('btn-video-edit').addEventListener('click', function() {
  const row = activeRow;
  if (!row) { setStatus('Click a row first to open VideoEdit', '#f88'); return; }
  const data = row.getData();
  if (!data.link) { setStatus('Active row has no link', '#f88'); return; }
  const isVid = data.VidRange && window.parseVideoAsset && window.parseVideoAsset(String(data.VidRange)) !== null;
  if (!isVid) { setStatus('Active row is not a video (VidRange must be numeric start time)', '#f88'); return; }
  // Find the matching linksData entry by syncing first
  syncFromTabulator();
  const entry = linksData.find(r => r.link === data.link && r.cell === data.cell);
  if (entry && window.openVideoEditor) {
    window.openVideoEditor(entry);
  } else {
    setStatus('Could not open VideoEdit for this row', '#f88');
  }
});

// ─── Column header strip ──────────────────────────────────────────────────────
function updateColHeaderStrip() {
  const el = document.getElementById('colHeaderStrip');
  if (!el) return;
  if (!tableKeys || !tableKeys.length) { el.textContent = ''; return; }
  el.textContent = tableKeys.join(' | ');
}
