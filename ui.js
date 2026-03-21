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
    // openFS overlay is position:fixed covering the whole physical screen — always landscape.
    // Do NOT rotate: the image should fill the screen normally.
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
    vidHost.appendChild(img);
    vidHost.style.cursor = 'pointer';
    bar.style.display = 'none';
    // Tap anywhere to close
    fs.addEventListener('pointerup', e => { e.stopPropagation(); fsClose(); });
    return;
  }

  mountFSPlayer();

  // Transparent tap-to-close layer over video — sits above the iframe (pointer-events:none)
  // but below the bottom bar so controls still work
  const tapClose = document.createElement('div');
  tapClose.style.cssText = 'position:absolute;inset:0;z-index:5;cursor:pointer;';
  tapClose.title = 'Tap to close';
  tapClose.addEventListener('pointerup', function(e) {
    e.stopPropagation(); fsClose();
  });
  vidHost.appendChild(tapClose);

  // ── Duration + playhead polling ───────────────────────────────────────────
  let durDone = false;
  const durTimer = setInterval(function() {
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

  const playTimer = setInterval(function() {
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

// ─── State ───────────────────────────────────────────────────────────────────
let rawJsonMode = false;
let tableKeys   = [];

const COL_DEFAULT_PX = 120;   // sensible default
const COL_MAX_PX     = 220;   // cap so long-content cols (comment, link) don't blow out the table
const COL_MIN_PX     = 8;

// colWidths: persisted in localStorage, keyed by field name
let colWidths   = JSON.parse(localStorage.getItem('seeandlearn-colWidths') || '{}');
let recycleData = JSON.parse(localStorage.getItem('seeandlearn-recycle')   || '[]');

// main.js Esc-handler compatibility
let isColResizing = false;
window.stopColResize = function() {};

// ─── Focus tracking ───────────────────────────────────────────────────────────
let activeRow = null;   // Tabulator Row object
let activeCol = null;   // field name string

// ─── Helpers ─────────────────────────────────────────────────────────────────
function initTableKeys() {
  // Column order source of truth: the key order in linksData rows (which mirrors links.json).
  // This means column order is consistent across ALL browsers and devices — no per-browser
  // localStorage divergence. localStorage is used only to merge in any newly added columns
  // that aren't yet in the saved JSON.

  // Build ordered key list from linksData rows (first-seen insertion order)
  const seen = new Set();
  const ordered = [];
  linksData.forEach(r => {
    Object.keys(r).forEach(k => {
      if (!k.startsWith('_') && !seen.has(k)) { seen.add(k); ordered.push(k); }
    });
  });

  // Merge in any keys from localStorage that aren't in linksData
  // (e.g. a column added in the editor but not yet saved to links.json)
  const lsSaved = localStorage.getItem('seeandlearn-tableKeys');
  if (lsSaved) {
    try {
      const lsKeys = JSON.parse(lsSaved);
      if (Array.isArray(lsKeys)) {
        lsKeys.forEach(k => { if (!seen.has(k) && !k.startsWith('_')) { seen.add(k); ordered.push(k); } });
      }
    } catch(e) {}
  }

  tableKeys = ordered.length ? ordered
    : ['show','VidRange','cell','fit','link','cname','sname','v.title','v.author','attribution','comment','Mute','Portrait'];

  // Scrub any _ keys from linksData
  linksData = linksData.map(r => {
    const clean = {};
    Object.keys(r).forEach(k => { if (!k.startsWith('_')) clean[k] = r[k]; });
    return clean;
  });
}

function getDistinctVals(field) {
  const s = new Set();
  linksData.forEach(r => {
    const v = r[field];
    if (v === undefined || v === null) return;
    const str = String(v).trim();
    if (!str) return;
    if (field === 'cname') {
      // Split comma-separated cname values into individual terms
      str.split(',').map(t => t.trim()).filter(Boolean).forEach(t => s.add(t));
    } else {
      s.add(str);
    }
  });
  return Array.from(s).sort();
}

// THE KEY FIX FOR DOUBLES:
// Tabulator is the display layer only. linksData is the master store.
// We NEVER pass linksData by reference to Tabulator — always pass a deep copy.
// We NEVER manually push to linksData alongside addRow() — getData() is truth.
function getDataCopy() {
  return JSON.parse(JSON.stringify(linksData));
}

// Reorder every row's keys to match tableKeys order.
// This is what makes column order sticky through push→reload:
// JSON.parse preserves insertion order, so if rows are saved with keys in
// tableKeys order, initTableKeys() recovers that order on next load.
function reorderLinksDataKeys() {
  linksData = linksData.map(row => {
    const out = {};
    tableKeys.forEach(k => { if (k in row) out[k] = row[k]; });
    // preserve any keys not yet in tableKeys (shouldn't happen, but be safe)
    Object.keys(row).forEach(k => { if (!(k in out)) out[k] = row[k]; });
    return out;
  });
}

// Pull current state from Tabulator back into linksData (single call before save/push)
function syncFromTabulator() {
  if (!window.tabulatorTable) return;
  const rows = window.tabulatorTable.getData();
  // Rebuild each row in tableKeys order so column order is preserved in localStorage.
  // Object.keys(row) from Tabulator returns INSERTION order, not visual order,
  // so we must manually reorder using tableKeys.
  linksData = rows.map(r => {
    const clean = {};
    // First: add fields in tableKeys order
    tableKeys.forEach(k => { if (k in r && !k.startsWith('_')) clean[k] = r[k]; });
    // Then: add any fields not in tableKeys (shouldn't happen, but be safe)
    Object.keys(r).forEach(k => { if (!k.startsWith('_') && !(k in clean)) clean[k] = r[k]; });
    return clean;
  });
}

function setStatus(msg, color) {
  const el = document.getElementById('jsonStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || '#8ef';
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
}

function updateFocusIndicator() {
  const el = document.getElementById('focusIndicator');
  if (!el) return;
  const rStr = activeRow ? 'row ' + activeRow.getPosition() : '—';
  const cStr = (activeCol && !activeCol.startsWith('_')) ? activeCol : '—';
  el.textContent = 'Focus: ' + rStr + ' · col: ' + cStr;
}

function getFocusedColField() {
  if (activeCol && !activeCol.startsWith('_') && tableKeys.includes(activeCol)) return activeCol;
  return tableKeys.length ? tableKeys[tableKeys.length - 1] : null;
}

function getFocusedRow() {
  if (activeRow) return activeRow;
  if (!window.tabulatorTable) return null;
  const rows = window.tabulatorTable.getRows();
  return rows.length ? rows[0] : null;
}

window.getFirstEmptyCell = function() {
  const occ = new Set();
  linksData.forEach(r => { if (r && r.cell) occ.add(String(r.cell).toLowerCase()); });
  const letters = 'abcde';
  for (let r = 1; r <= 5; r++)
    for (let c = 0; c < 5; c++) {
      if (!occ.has(r + letters[c])) return r + letters[c];
    }
  return '';
};

// ─── Column operations (all operate on linksData + re-render) ─────────────────
function dupColumn(srcField) {
  if (!srcField || !tableKeys.includes(srcField)) return;
  let newK = srcField + '_copy', n = 2;
  while (tableKeys.includes(newK)) newK = srcField + '_copy' + n++;
  const idx = tableKeys.indexOf(srcField);
  tableKeys.splice(idx + 1, 0, newK);
  linksData.forEach(row => { row[newK] = row[srcField] !== undefined ? String(row[srcField]) : ''; });
  reorderLinksDataKeys();
  saveJsonSilent();
  activeCol = newK;
  window.renderTableEditor();
  setStatus('Duplicated "' + srcField + '" → "' + newK + '"');
}

function delColumn(k) {
  if (!k || !tableKeys.includes(k)) return;
  if (!confirm('Delete column "' + k + '" from ALL rows?')) return;
  tableKeys = tableKeys.filter(x => x !== k);
  linksData.forEach(row => delete row[k]);
  if (activeCol === k) activeCol = null;
  saveJsonSilent();
  window.renderTableEditor();
}

function addColAfter(afterField) {
  const newK = prompt('New column name' + (afterField ? ' (inserted after "' + afterField + '")' : '') + ':');
  if (!newK) return;
  if (tableKeys.includes(newK)) { alert('"' + newK + '" already exists.'); return; }
  const idx = afterField ? tableKeys.indexOf(afterField) : tableKeys.length - 1;
  tableKeys.splice(idx + 1, 0, newK);
  linksData.forEach(row => { if (row[newK] === undefined) row[newK] = ''; });
  reorderLinksDataKeys();  // persist column position in key order
  saveJsonSilent();
  activeCol = newK;
  window.renderTableEditor();
}

function renameColumn(k) {
  if (!k || !tableKeys.includes(k)) return;
  const newK = prompt('Rename "' + k + '" to:', k);
  if (!newK || newK === k) return;
  if (tableKeys.includes(newK)) { alert('"' + newK + '" already exists.'); return; }
  tableKeys[tableKeys.indexOf(k)] = newK;
  linksData.forEach(row => { row[newK] = row[k] !== undefined ? row[k] : ''; delete row[k]; });
  saveJsonSilent();
  activeCol = newK;
  window.renderTableEditor();
}

// ─── Main Tabulator init ──────────────────────────────────────────────────────
window.renderTableEditor = function() {
  const container = document.getElementById('tableEditor');
  if (!container) return;
  if (!tableKeys.length) initTableKeys();

  if (window.tabulatorTable) {
    try { window.tabulatorTable.destroy(); } catch(e) {}
    window.tabulatorTable = null;
  }
  container.innerHTML = '';
  activeRow = null;
  activeCol = null;

  // Build autocomplete value lists fresh from linksData at each render
  const cnameVals   = getDistinctVals('cname');
  const snameVals   = getDistinctVals('sname');
  const vAuthorVals = getDistinctVals('v.author');
  const topicVals   = getDistinctVals('Topic');

  // ── Column definitions ───────────────────────────────────────────────────
  const cols = [];

  // Del column — no title, no menu icon
  cols.push({
    title: '', field: '_del',
    width: 26, minWidth: 26, resizable: false,
    headerSort: false, hozAlign: 'center',
    formatter: () => "<span style='color:#f55;font-size:14px;cursor:pointer;line-height:1;'>✕</span>",
    cellClick(e, cell) {
      if (!confirm('Delete this row?')) return;
      syncFromTabulator();
      const rowData = cell.getRow().getData();
      recycleData.push(JSON.parse(JSON.stringify(rowData)));
      localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
      const idx = linksData.findIndex(r =>
        Object.keys(rowData).every(k => r[k] === rowData[k])
      );
      if (idx > -1) linksData.splice(idx, 1);
      cell.getRow().delete();
      saveJsonSilent();
    }
  });

  // Checkbox selection column — no title, no menu icon
  cols.push({
    title: '', field: '_sel',
    width: 26, minWidth: 26, resizable: false,
    headerSort: false, hozAlign: 'center',
    formatter: 'rowSelection',
    titleFormatter: 'rowSelection',
    cellClick(e, cell) { cell.getRow().toggleSelect(); }
  });

  // Move ▲▼ column
  cols.push({
    title: '↕', field: '_move',
    width: 32, minWidth: 32, resizable: false,
    headerSort: false, hozAlign: 'center',
    formatter: () => "<span style='cursor:pointer;color:#777;font-size:10px;'>▲▼</span>",
    cellClick(e, cell) {
      const rect = cell.getElement().getBoundingClientRect();
      const dir  = e.clientY < rect.top + rect.height / 2 ? -1 : 1;
      syncFromTabulator();
      // Find by content match since references may differ after getData()
      const rowData = cell.getRow().getData();
      const pos = window.tabulatorTable.getRows().indexOf(cell.getRow());
      const tgt = pos + dir;
      const rows = window.tabulatorTable.getRows();
      if (tgt < 0 || tgt >= rows.length) return;
      // Swap in linksData using position
      const tmp = linksData[pos]; linksData[pos] = linksData[tgt]; linksData[tgt] = tmp;
      saveJsonSilent();
      window.renderTableEditor();
    }
  });

  // Data columns
  // Re-read colWidths from localStorage every render to pick up widths saved in prior sessions
  colWidths = JSON.parse(localStorage.getItem('seeandlearn-colWidths') || '{}');

  tableKeys.forEach(k => {
    // Clamp saved width between min and max
    const saved = colWidths[k];
    const w = saved !== undefined
      ? Math.min(Math.max(saved, COL_MIN_PX), COL_MAX_PX)
      : COL_DEFAULT_PX;
    const colDef = {
      title: k,
      field: k,
      editor: 'input',
      headerSort: true,
      width: w,          // explicit — layout:false honours this exactly
      maxWidth: COL_MAX_PX,
      minWidth: COL_MIN_PX,
      resizable: true,
      tooltip: true,
      cellClick(e, cell) {
        activeRow = cell.getRow();
        activeCol = cell.getColumn().getField();
        updateFocusIndicator();
      },
      cellEdited(cell) {
        // Auto-save every cell edit immediately with correct column order
        syncFromTabulator();
        saveJsonSilent();
      }
    };

    // ── makeDatalistEditor: plain autocomplete (sname, v.author) ────────────
    function makeDatalistEditor(valsList) {
      return function(cell, onRendered, success, cancel) {
        const dlId = 'dl_' + Math.random().toString(36).slice(2);
        const dl   = document.createElement('datalist');
        dl.id = dlId;
        valsList.forEach(v => {
          const opt = document.createElement('option'); opt.value = v; dl.appendChild(opt);
        });
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.setAttribute('list', dlId);
        inp.value = cell.getValue() || '';
        inp.style.cssText = 'width:100%;height:100%;border:none;padding:2px 4px;'
          + 'background:#0d1a2a;color:#fff;font-size:13px;outline:none;box-sizing:border-box;';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;';
        wrap.appendChild(dl); wrap.appendChild(inp);
        onRendered(() => { inp.focus(); inp.select(); });
        inp.addEventListener('change', () => success(inp.value));
        inp.addEventListener('blur',   () => success(inp.value));
        inp.addEventListener('keydown', e => {
          e.stopPropagation();
          if (e.key === 'Enter')  { e.preventDefault(); success(inp.value); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          if (e.key === 'Tab')    { success(inp.value); }
        });
        return wrap;
      };
    }

    // ── makeCommaListEditor: comma-separated multi-entry for cname ───────────
    // After each comma, shows a dropdown filtered to the last token.
    // Uses a custom dropdown div (not native datalist) so it filters by
    // last token rather than the whole input value.
    function makeCommaListEditor(valsList) {
      return function(cell, onRendered, success, cancel) {
        // Expand any comma-separated values in valsList into individual terms
        const termSet = new Set();
        valsList.forEach(v => {
          v.split(',').map(s => s.trim()).filter(Boolean).forEach(t => termSet.add(t));
        });
        const terms = Array.from(termSet).sort();

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = cell.getValue() || '';
        inp.style.cssText = 'width:100%;height:100%;border:none;padding:2px 4px;'
          + 'background:#0d1a2a;color:#fff;font-size:13px;outline:none;box-sizing:border-box;position:relative;z-index:1;';

        // Custom dropdown — appended to document.body to escape any overflow:hidden parents
        const dd = document.createElement('div');
        dd.style.cssText = 'position:fixed;z-index:99999;background:#1a2a3a;border:1px solid #4af;'
          + 'border-radius:0 0 6px 6px;max-height:160px;overflow-y:auto;display:none;'
          + 'font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.6);';
        document.body.appendChild(dd);

        function positionDropdown() {
          const r = inp.getBoundingClientRect();
          dd.style.left  = r.left + 'px';
          dd.style.top   = (r.bottom) + 'px';
          dd.style.width = r.width + 'px';
        }

        function getLastToken() {
          const parts = inp.value.split(',');
          return parts[parts.length - 1].trimStart();
        }

        function showDropdown() {
          const token    = getLastToken();
          const filtered = token
            ? terms.filter(t => t.toLowerCase().startsWith(token.toLowerCase()))
            : terms;
          dd.innerHTML = '';
          if (!filtered.length) { dd.style.display = 'none'; return; }
          filtered.forEach(t => {
            const item = document.createElement('div');
            item.textContent = t;
            item.style.cssText = 'padding:7px 10px;cursor:pointer;color:#cef;border-bottom:1px solid #244;';
            item.addEventListener('mouseenter', () => item.style.background = '#1a3a5a');
            item.addEventListener('mouseleave', () => item.style.background = '');
            item.addEventListener('mousedown', e => {
              e.preventDefault();
              const parts = inp.value.split(',');
              parts[parts.length - 1] = ' ' + t;
              inp.value = parts.join(',') + ', ';
              dd.style.display = 'none';
              inp.focus();
              showDropdown();
            });
            dd.appendChild(item);
          });
          positionDropdown();
          dd.style.display = 'block';
        }

        function hideDropdown() {
          dd.style.display = 'none';
        }

        function cleanup() {
          hideDropdown();
          if (dd.parentNode) dd.parentNode.removeChild(dd);
        }

        const wrap = document.createElement('div');
        wrap.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;position:relative;';
        wrap.appendChild(inp);

        onRendered(() => { inp.focus(); inp.select(); showDropdown(); });

        inp.addEventListener('input', showDropdown);
        inp.addEventListener('focus', showDropdown);
        inp.addEventListener('blur', () => setTimeout(hideDropdown, 150));

        inp.addEventListener('keydown', e => {
          e.stopPropagation();
          if (e.key === 'Enter')  { e.preventDefault(); cleanup(); success(inp.value.trim()); }
          if (e.key === 'Escape') { e.preventDefault(); cleanup(); cancel(); }
          if (e.key === 'Tab')    { cleanup(); success(inp.value.trim()); }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            // Navigate dropdown with arrows
            const items = dd.querySelectorAll('div');
            if (!items.length) return;
            e.preventDefault();
            const focused = dd.querySelector('.dd-focus');
            let idx = focused ? Array.from(items).indexOf(focused) : -1;
            if (focused) focused.classList.remove('dd-focus');
            idx = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1)
                                        : Math.max(idx - 1, 0);
            items[idx].classList.add('dd-focus');
            items[idx].style.background = '#2a4a6a';
            items[idx].scrollIntoView({ block: 'nearest' });
          }
          // Enter on a focused dropdown item
          if (e.key === 'Enter') {
            const focused = dd.querySelector('.dd-focus');
            if (focused) { focused.dispatchEvent(new MouseEvent('mousedown')); }
          }
        });

        cell.getElement().addEventListener('keydown', () => cleanup());

        return wrap;
      };
    }

    if (k === 'cname') {
      colDef.editor = makeCommaListEditor(cnameVals);
    } else if (k === 'sname') {
      colDef.editor = makeDatalistEditor(snameVals);
    } else if (k === 'v.author') {
      colDef.editor = makeDatalistEditor(vAuthorVals);
    } else if (k === 'Topic') {
      colDef.editor = makeCommaListEditor(topicVals);
    }

    cols.push(colDef);
  });

  // ── Instantiate Tabulator ─────────────────────────────────────────────────
  // CRITICAL: pass getDataCopy() not linksData directly — prevents double-rows
  window.tabulatorTable = new Tabulator(container, {
    data: getDataCopy(),
    reactiveData: false,
    columns: cols,
    layout: false,         // NO layout engine — column widths are exactly what we set, always
    autoResize: false,
    selectableRows: true,
    movableColumns: true,
    history: false,
    height: '100%',

    // Belt-and-suspenders: re-apply saved widths after build in case anything shifted
    tableBuilt() {
      const tbl = window.tabulatorTable;
      if (!tbl) return;
      tableKeys.forEach(k => {
        const w = colWidths[k] !== undefined
          ? Math.min(Math.max(colWidths[k], COL_MIN_PX), COL_MAX_PX)
          : COL_DEFAULT_PX;
        try { tbl.getColumn(k).setWidth(w); } catch(e) {}
      });
    },

    // Save column width immediately on every resize drag
    columnResized(column) {
      const f = column.getField();
      if (!f || f.startsWith('_')) return;
      // Clamp to max so accidental over-drag is corrected on next open
      colWidths[f] = Math.min(column.getWidth(), COL_MAX_PX);
      localStorage.setItem('seeandlearn-colWidths', JSON.stringify(colWidths));
      syncFromTabulator();
      saveJsonSilent();
    },

    // When user drags columns to reorder, update tableKeys and persist key order
    columnMoved(column, columns) {
      syncFromTabulator();
      const newOrder = columns
        .map(c => c.getField())
        .filter(f => f && !f.startsWith('_'));
      tableKeys = newOrder;
      reorderLinksDataKeys();
      saveJsonSilent();
      updateColHeaderStrip();
    },

    rowSelectionChanged(data, rows) {
      const btn = document.getElementById('deleteSelectedRows');
      if (btn) btn.style.display = rows.length > 0 ? 'inline-block' : 'none';
    },

    rowClick(e, row) {
      activeRow = row;
      updateFocusIndicator();
    }
  });

  // Update the column name strip above the toolbar
  updateColHeaderStrip();
};

// ─── Toolbar button listeners ─────────────────────────────────────────────────

document.getElementById('addTableItem').addEventListener('click', function() {
  // RowAddNext: insert blank row after focused row
  if (!window.tabulatorTable) return;
  const newRow = {}; tableKeys.forEach(k => newRow[k] = '');
  const focRow = getFocusedRow();
  if (focRow) {
    window.tabulatorTable.addRow(newRow, false, focRow);
  } else {
    window.tabulatorTable.addRow(newRow, true);
  }
  // Sync Tabulator → linksData after structural change
  syncFromTabulator();
  saveJsonSilent();
  setStatus('Row added');
});

document.getElementById('btn-row-add-bottom').addEventListener('click', function() {
  if (!window.tabulatorTable) return;
  const newRow = {}; tableKeys.forEach(k => newRow[k] = '');
  window.tabulatorTable.addRow(newRow, false);
  syncFromTabulator();
  saveJsonSilent();
  setStatus('Row added at bottom');
});

document.getElementById('btn-duplicate-row-action').addEventListener('click', function() {
  if (!window.tabulatorTable) return;
  const sel = window.tabulatorTable.getSelectedRows();
  const targets = sel.length ? sel : (activeRow ? [activeRow] : []);
  if (!targets.length) { setStatus('Click a row first to duplicate it', '#f88'); return; }

  [...targets].reverse().forEach(row => {
    const newRow = JSON.parse(JSON.stringify(row.getData()));
    // Strip internal Tabulator fields
    Object.keys(newRow).forEach(k => { if (k.startsWith('_tab')) delete newRow[k]; });
    newRow.cell = window.getFirstEmptyCell();
    window.tabulatorTable.addRow(newRow, false, row);
  });

  syncFromTabulator();
  saveJsonSilent();
  setStatus('Row(s) duplicated');
});

document.getElementById('deleteSelectedRows').addEventListener('click', function() {
  if (!window.tabulatorTable) return;
  const sel = window.tabulatorTable.getSelectedRows();
  if (!sel.length) { setStatus('Select rows to delete', '#f88'); return; }
  if (!confirm('Delete ' + sel.length + ' row(s)?')) return;
  sel.forEach(row => {
    recycleData.push(JSON.parse(JSON.stringify(row.getData())));
    row.delete();
  });
  localStorage.setItem('seeandlearn-recycle', JSON.stringify(recycleData));
  syncFromTabulator();
  saveJsonSilent();
  activeRow = null;
  this.style.display = 'none';
  setStatus('Row(s) deleted');
});

document.getElementById('btn-col-add').addEventListener('click', function() {
  syncFromTabulator();
  addColAfter(getFocusedColField());
});

document.getElementById('btn-duplicate-col-action').addEventListener('click', function() {
  syncFromTabulator();
  const src = getFocusedColField();
  if (!src) { setStatus('Click a cell to choose the column to duplicate', '#f88'); return; }
  dupColumn(src);
});

document.getElementById('btn-col-rename').addEventListener('click', function() {
  syncFromTabulator();
  const k = getFocusedColField();
  if (!k) { setStatus('Click a cell to choose the column to rename', '#f88'); return; }
  renameColumn(k);
});

document.getElementById('btn-col-delete').addEventListener('click', function() {
  syncFromTabulator();
  const k = getFocusedColField();
  if (!k) { setStatus('Click a cell to choose the column to delete', '#f88'); return; }
  delColumn(k);
});

document.getElementById('btn-export-chosen').addEventListener('click', function() {
  syncFromTabulator();
  const sel = window.tabulatorTable ? window.tabulatorTable.getSelectedRows() : [];
  const data = sel.length > 0 ? sel.map(r => JSON.parse(JSON.stringify(r.getData()))) : linksData;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = sel.length > 0 ? 'links_selected.json' : 'links.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
  setStatus('Downloaded ' + data.length + ' row(s)');
});

document.getElementById('btn-import').addEventListener('click', function() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = function() {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) { alert('Expected a JSON array.'); return; }
        const merge = confirm('OK = merge with existing · Cancel = replace all');
        if (merge) imported.forEach(r => linksData.push(r));
        else { linksData = imported; }
        initTableKeys();
        saveJsonSilent();
        window.renderTableEditor();
        setStatus('Imported ' + imported.length + ' rows');
      } catch(e) { alert('Invalid JSON: ' + e.message); }
    };
    reader.readAsText(file);
  };
  inp.click();
});

// Ctrl+D
window.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key.toLowerCase() === 'd') {
    const jsonMod = document.getElementById('jsonModal');
    if (jsonMod && jsonMod.classList.contains('open')) {
      e.preventDefault(); e.stopPropagation();
      document.getElementById('btn-duplicate-row-action').click();
    }
  }
}, true);

// ─── Raw JSON toggle ──────────────────────────────────────────────────────────
document.getElementById('toggleRawJson').addEventListener('click', function() {
  rawJsonMode = !rawJsonMode;
  this.textContent = rawJsonMode ? 'Show Visual Editor' : 'Show Raw JSON';
  if (rawJsonMode) {
    syncFromTabulator();
    document.getElementById('jsonText').value   = JSON.stringify(linksData, null, 2);
    document.getElementById('tableEditor').style.display  = 'none';
    document.getElementById('jsonText').style.display     = 'block';
    document.getElementById('tableToolbar').style.display = 'none';
  } else {
    try { linksData = JSON.parse(document.getElementById('jsonText').value); }
    catch(e) { alert('Invalid JSON'); rawJsonMode = true; return; }
    document.getElementById('tableEditor').style.display  = 'block';
    document.getElementById('jsonText').style.display     = 'none';
    document.getElementById('tableToolbar').style.display = 'flex';
    initTableKeys();
    window.renderTableEditor();
  }
});

// ─── Open table editor ────────────────────────────────────────────────────────
document.getElementById('miTables').addEventListener('pointerup', e => {
  e.stopPropagation(); closeMenu();
  if (typeof isAdmin === 'function' && !isAdmin()) { alert('Admin privileges required.'); return; }
  rawJsonMode = false;
  document.getElementById('toggleRawJson').textContent         = 'Show Raw JSON';
  document.getElementById('tableEditor').style.display         = 'block';
  document.getElementById('jsonText').style.display            = 'none';
  document.getElementById('tableToolbar').style.display        = 'flex';
  document.getElementById('deleteSelectedRows').style.display  = 'none';
  document.getElementById('jsonStatus').textContent            = '';
  document.getElementById('jsonModal').classList.add('open');
  // Only rebuild tableKeys if we don't already have a valid order.
  // Calling initTableKeys() every open resets the user's column ordering.
  // tableKeys is preserved in memory across opens; it's only stale after a page reload,
  // in which case it will be empty and initTableKeys() runs correctly below.
  if (!tableKeys.length) initTableKeys();
  window.renderTableEditor();
});

// ─── Apply / Push / Download / Cancel ────────────────────────────────────────
// Workflow:
//   Edit table → edits auto-saved to localStorage on every cell change
//   Apply  → syncs Tabulator→linksData, closes editor, re-renders grid
//   Push   → same as Apply, then pushes linksData JSON to GitHub
//   Column widths → saved to localStorage on every drag, survive everything
// ─── Table auto-save on close ─────────────────────────────────────────────────
// All cell edits, column moves, and row ops already auto-save to localStorage.
// On close (Exit/Esc), we do a final sync to catch any in-progress edits.
function closeTableEditor() {
  if (!rawJsonMode && window.tabulatorTable) {
    syncFromTabulator();
    saveJsonSilent();
  }
  document.getElementById('jsonModal').classList.remove('open');
  render();
}
window.closeTableEditor = closeTableEditor;

window.applyJsonChanges = function() {
  try {
    if (rawJsonMode) {
      const d = JSON.parse(document.getElementById('jsonText').value);
      if (!Array.isArray(d)) throw new Error('Expected array');
      linksData = d;
      saveJsonSilent();
    } else {
      syncFromTabulator();
      saveJsonSilent();
    }
    document.getElementById('jsonModal').classList.remove('open');
    render(); return true;
  } catch(e) {
    document.getElementById('jsonStatus').textContent = 'Error: ' + e.message;
    return false;
  }
};

document.getElementById('jsonApply').addEventListener('click', window.applyJsonChanges);
document.getElementById('jsonPush').addEventListener('pointerup', e => {
  e.preventDefault(); e.stopPropagation();
  if (!rawJsonMode) syncFromTabulator();
  saveJsonSilent();
  window.pushToGitHub();
});
document.getElementById('jsonDl').addEventListener('click', saveJson);
document.getElementById('jsonCancel').addEventListener('click', closeTableEditor);

// ─── Table horizontal scroll arrows ──────────────────────────────────────────
(function() {
  const SCROLL_AMT = 400; // px per click — aggressive
  function getTableScroller() {
    // Tabulator's scrollable inner element
    const te = document.getElementById('tableEditor');
    if (!te) return null;
    return te.querySelector('.tabulator-tableholder') || te;
  }
  document.getElementById('jsonScrollLeft').addEventListener('click', function() {
    const el = getTableScroller();
    if (el) el.scrollBy({ left: -SCROLL_AMT, behavior: 'smooth' });
  });
  document.getElementById('jsonScrollRight').addEventListener('click', function() {
    const el = getTableScroller();
    if (el) el.scrollBy({ left: SCROLL_AMT, behavior: 'smooth' });
  });
})();
document.getElementById('jsonModal').addEventListener('pointerup', e => e.stopPropagation());
document.getElementById('jsonText').addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); window.applyJsonChanges(); }
});

// ─── Save JSON ────────────────────────────────────────────────────────────────
// saveJsonSilent: save to localStorage only — NO file download, no browser notification
function saveJsonSilent() {
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  localStorage.setItem('mlynx-links', JSON.stringify(linksData));
  // Persist column order so it survives page reload
  localStorage.setItem('seeandlearn-tableKeys', JSON.stringify(tableKeys));
}

// saveJson: explicit download (only called by Download button / Ctrl+Alt+S)
function saveJson() {
  if (!rawJsonMode) syncFromTabulator();
  saveJsonSilent();
  const blob = new Blob([JSON.stringify(linksData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'links.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
}

window.triggerDownload = async function(filename, data) {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

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
// Restore keyframe toggle state on load
(function() {
  const tog = document.getElementById('togKeyframe');
  if (tog) tog.checked = (localStorage.getItem('seeandlearn-keyframeOnly') === '1');
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
    saveJsonSilent();
    render();
    alert('Loaded ' + linksData.length + ' rows from GitHub.');
  } catch(err) { alert('Load from GitHub failed:\n' + err.message); }
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
