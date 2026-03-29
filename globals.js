'use strict';

const COLS=5, ROWS=5, LETTERS="abcde";
const ISMOBILE = ('ontouchstart' in window) || navigator.maxTouchPoints>0;

function isAdmin() { return true; }
function syncAdminUI() {
  const el = document.getElementById('miAdmin');
  if (!el) return;
  if (isAdmin()) { el.innerHTML = '&#9989; Admin'; el.style.opacity = '1'; el.style.color = '#9f9'; }
  else { el.innerHTML = '&#128274; Admin'; el.style.opacity = '0.45'; el.style.color = '#aaa'; }
}

let GW=0, GH=0, cellW=0, cellH=0, isPortrait=false, bgColor='#c8ddf0';
let fitMode = localStorage.getItem("mlynx-fit")||"fc";
let showCellLbl=false, showCname=true;
var linksData=[];  // var (not let) so window.linksData works from all scripts

// Keyframe-only seek — when true, YouTube seekTo uses allowSeekAhead=false (faster on slow machines)
window.keyframeOnly = localStorage.getItem('seeandlearn-keyframeOnly') === '1';

const canvas    = document.getElementById('gameCanvas');
const ctx       = canvas.getContext('2d');
const wrap      = document.getElementById('rotateWrap');
const menuWrap  = document.getElementById('menuWrap');
window.menuWrap = menuWrap;  // expose globally so overlay screens can hide/show it
const menuBtn   = document.getElementById('menuBtn');
const menuPanel = document.getElementById('menuPanel');

// helpers

// ── Adding grid — separate staging area for new links ────────────────────────
var addingData = [];   // var so window.addingData works cross-file
var _addGridActive = false;   // true when GAdd overlay is shown
window._addGridActive = false;
