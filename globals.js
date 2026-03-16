'use strict';

const COLS=5, ROWS=5, LETTERS="abcde";
const ISMOBILE = ('ontouchstart' in window) || navigator.maxTouchPoints>0;

function isAdmin() { return !!localStorage.getItem('github-token'); }
function syncAdminUI() {
  const el = document.getElementById('miAdmin');
  if (!el) return;
  if (isAdmin()) { el.innerHTML = '&#9989; Admin'; el.style.opacity = '1'; el.style.color = '#9f9'; }
  else { el.innerHTML = '&#128274; Admin'; el.style.opacity = '0.45'; el.style.color = '#aaa'; }
}

let GW=0, GH=0, cellW=0, cellH=0, isPortrait=false, bgColor='#c8ddf0';
let fitMode = localStorage.getItem("mlynx-fit")||"fc";
let showCellLbl=false, showCname=true;
let linksData=[];

const canvas    = document.getElementById('gameCanvas');
const ctx       = canvas.getContext('2d');
const wrap      = document.getElementById('rotateWrap');
const menuWrap  = document.getElementById('menuWrap');
const menuBtn   = document.getElementById('menuBtn');
const menuPanel = document.getElementById('menuPanel');

// helpers
