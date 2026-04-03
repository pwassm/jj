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
let fitMode = localStorage.getItem("sal-fit") || localStorage.getItem("mlynx-fit") || "fc"; // mlynx-fit fallback for existing devices
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

// ── Date stamp: YY.MM.DD.HH.MM.SS ────────────────────────────────────────────
window.salDateStamp = function() {
  const d = new Date();
  return [
    String(d.getFullYear()).slice(-2),
    String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0'),
    String(d.getHours()).padStart(2,'0'),
    String(d.getMinutes()).padStart(2,'0'),
    String(d.getSeconds()).padStart(2,'0')
  ].join('.');
};

// ── Next unique integer ID across both TM and TA ─────────────────────────────
window.salNextUID = function() {
  let max = 0;
  [window.linksData, window.addingData].forEach(function(arr) {
    (arr || []).forEach(function(r) {
      const n = parseInt(r.UniqID || '0', 10);
      if (n > max) max = n;
    });
  });
  return max + 1;
};

// ── Auto-fill UniqID + DateAdded + DateModified on a new row ─────────────────
window.salAutoFill = function(row) {
  const now = window.salDateStamp();
  if (!row.UniqID || !String(row.UniqID).trim())
    row.UniqID = String(window.salNextUID());
  if (!row.DateAdded   || !String(row.DateAdded).trim())   row.DateAdded   = now;
  if (!row.DateModified|| !String(row.DateModified).trim()) row.DateModified = now;
  return row;
};
