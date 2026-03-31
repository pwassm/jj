// ── history.js — GM display snapshots ────────────────────────────────────────
// Row format: { HistID, Topic, DateSaved, CellAssignments }
//   HistID: auto-incrementing integer, permanent, used for ?h=N deep-links.
// CellAssignments: "1a:3|1b:7" — pipe-separated cell:UniqID pairs.
// Storage: localStorage 'sal-history' + history.json on server (newer wins).

var historyData = [];

// ── Normalise one history row (migration: old field names + missing HistID) ──
function normaliseHistRow(r) {
  var ca = r.CellAssignments !== undefined ? r.CellAssignments
         : r.Assignment      !== undefined ? r.Assignment
         : '';
  return {
    HistID:          parseInt(r.HistID || '0', 10) || 0,
    Topic:           String(r.Topic    || ''),
    DateSaved:       String(r.DateSaved || ''),
    CellAssignments: String(ca)
  };
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function initHistory() {
  var lsRaw  = localStorage.getItem('sal-history');
  var lsData = null;
  if (lsRaw) { try { lsData = JSON.parse(lsRaw); } catch(e) {} }
  var lsTime = parseInt(localStorage.getItem('sal-history-edited') || '0', 10);

  var fileData = null, fileTime = 0;
  try {
    var resp = await fetch('history.json?v=' + Date.now());
    if (resp.ok) {
      var raw = await resp.json();
      if (Array.isArray(raw)) {
        if (raw.length && raw[0]._salMeta) {
          fileTime = parseInt(raw[0]._salPushTime || '0', 10);
          fileData = raw.slice(1);
        } else {
          fileData = raw;
        }
      }
    }
  } catch(e) {}

  var src = (fileData && fileTime > lsTime) ? fileData : (lsData || fileData || []);
  historyData = src.map(normaliseHistRow);

  // Assign HistIDs to any entries that have HistID=0 (old format migration)
  var maxId = 0;
  historyData.forEach(function(r) { if (r.HistID > maxId) maxId = r.HistID; });
  var changed = false;
  historyData.forEach(function(r) {
    if (!r.HistID) { maxId++; r.HistID = maxId; changed = true; }
  });
  // Always persist (migration + normalisation)
  saveHistory_ls();
}

function saveHistory_ls() {
  localStorage.setItem('sal-history', JSON.stringify(historyData));
  localStorage.setItem('sal-history-edited', Date.now().toString());
}

// Expose so main.js can await it for ?h= deep-link
window._historyReady = initHistory();

// ── Encode / decode CellAssignments ──────────────────────────────────────────
function encodeAssignment() {
  return linksData
    .filter(function(r) {
      return r.cell && String(r.cell).trim() && r.UniqID && String(r.UniqID).trim();
    })
    .slice().sort(function(a, b) { return String(a.cell).localeCompare(String(b.cell)); })
    .map(function(r) { return String(r.cell).trim() + ':' + String(r.UniqID).trim(); })
    .join('|');
}

function decodeAssignment(str) {
  if (!str || typeof str !== 'string') return [];
  var result = [];
  str.split('|').forEach(function(s) {
    var colon = s.indexOf(':');
    if (colon < 1) return;
    var cell = s.slice(0, colon).trim();
    var uid  = s.slice(colon + 1).trim();
    if (cell && uid) result.push({ cell: cell, uid: uid });
  });
  return result;
}

// ── Save snapshot ─────────────────────────────────────────────────────────────
window.writeToHistory = function() {
  var missing = linksData.filter(function(r) {
    return r.show === '1' && r.cell && String(r.cell).trim() &&
           (!r.UniqID || !String(r.UniqID).trim());
  });
  if (missing.length) {
    if (!confirm(missing.length + ' visible row(s) have a cell but no UniqID'
      + ' — they will be excluded.\n\nRun "Fill UIDs" first for a complete snapshot.\n\nSave partial snapshot?')) return;
  }
  var ca = encodeAssignment();
  if (!ca) {
    alert('Nothing to snapshot.\n\nNo rows have both a cell position and a UniqID.\n\n'
      + 'Steps:\n 1. Open TM table\n 2. Click "Fill UIDs"\n 3. Try again.');
    return;
  }
  var topic = prompt('Topic / label for this snapshot:', '');
  if (topic === null) return;

  var d = new Date();
  var ds = [String(d.getFullYear()).slice(-2),
    String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0'),
    String(d.getHours()).padStart(2,'0'),
    String(d.getMinutes()).padStart(2,'0'),
    String(d.getSeconds()).padStart(2,'0')].join('.');

  // Auto-increment HistID
  var maxId = 0;
  historyData.forEach(function(r) { if (r.HistID > maxId) maxId = r.HistID; });
  var newId = maxId + 1;

  historyData.unshift({
    HistID:          newId,
    Topic:           topic || '(untitled)',
    DateSaved:       ds,
    CellAssignments: ca
  });
  saveHistory_ls();

  var count = decodeAssignment(ca).length;
  if (typeof setStatus === 'function')
    setStatus('✓ Snapshot #' + newId + ' "' + (topic || '(untitled)') + '" saved — ' + count + ' cells', '#5f5');
  renderHistoryTable();
};

// ── Restore by index ──────────────────────────────────────────────────────────
window.restoreFromHistory = function(rowIdx) {
  var hrow = historyData[rowIdx];
  if (!hrow) return;
  restoreHistRow(hrow);
};

// ── Restore by HistID (used by ?h= deep-link) ─────────────────────────────────
window.restoreByHistID = function(hid) {
  var hrow = historyData.find(function(r) {
    return parseInt(r.HistID || '0', 10) === parseInt(hid, 10);
  });
  if (!hrow) {
    console.warn('SeeAndLearn: no history entry with HistID=' + hid);
    return false;
  }
  restoreHistRow(hrow);
  return true;
};

// ── Core restore logic ─────────────────────────────────────────────────────────
function restoreHistRow(hrow) {
  var caStr = hrow.CellAssignments || hrow.Assignment || '';
  var pairs = decodeAssignment(caStr);
  if (!pairs.length) {
    if (typeof setStatus === 'function')
      setStatus('Snapshot #' + (hrow.HistID||'?') + ' has no UIDs — run Fill UIDs in TM, save new snapshot', '#f88');
    return;
  }

  // Kill Tabulator — syncTab becomes guaranteed no-op
  if (window._salTab) {
    try { window._salTab.destroy(); } catch(ex) {}
    window._salTab = null;
  }
  // Close all modals and overlays — user lands on GM
  var jsonMod = document.getElementById('jsonModal');
  if (jsonMod) jsonMod.classList.remove('open');
  var hm = document.getElementById('historyModal');
  if (hm) hm.classList.remove('open');
  var fsOv = document.getElementById('fs-overlay');   if (fsOv) fsOv.remove();
  var veOv = document.getElementById('video-editor-overlay'); if (veOv) veOv.remove();
  if (window.menuWrap) window.menuWrap.style.display = '';

  // Wipe all cells
  for (var i = 0; i < linksData.length; i++) { linksData[i].cell = ''; }

  // Assign from snapshot by UniqID
  var applied = 0, notFound = 0;
  for (var j = 0; j < pairs.length; j++) {
    var p = pairs[j];
    var matched = false;
    for (var k = 0; k < linksData.length; k++) {
      if (String(linksData[k].UniqID || '').trim() === p.uid) {
        linksData[k].cell = p.cell;
        applied++; matched = true; break;
      }
    }
    if (!matched) notFound++;
  }

  // Write to localStorage directly
  localStorage.setItem('seeandlearn-links', JSON.stringify(linksData));
  localStorage.setItem('sal-edited', Date.now().toString());

  // Render GM
  if (typeof render === 'function') render();

  var msg = 'Restored #' + (hrow.HistID||'?') + ' "' + hrow.Topic + '": ' + applied + ' cells'
    + (notFound ? ' (' + notFound + ' UIDs not found)' : '');
  if (typeof setStatus === 'function') setStatus(msg, applied > 0 ? '#5f5' : '#f88');
}

// ── Delete ────────────────────────────────────────────────────────────────────
function deleteHistoryRow(idx) {
  if (!confirm('Delete snapshot #' + (historyData[idx].HistID||'?') + ' "' + historyData[idx].Topic + '"?')) return;
  historyData.splice(idx, 1);
  saveHistory_ls();
  renderHistoryTable();
}

// ── Render table ──────────────────────────────────────────────────────────────
function renderHistoryTable() {
  var body = document.getElementById('historyTableBody');
  if (!body) return;
  body.innerHTML = '';

  var countEl = document.getElementById('historyRowCount');
  if (countEl) countEl.textContent = historyData.length
    + ' snapshot' + (historyData.length !== 1 ? 's' : '');

  if (!historyData.length) {
    body.innerHTML = '<tr><td colspan="5" style="color:#666;text-align:center;padding:20px;'
      + 'font-style:italic;">No snapshots yet — open TM table, run Fill UIDs, '
      + 'then click Write to History.</td></tr>';
    return;
  }

  historyData.forEach(function(row, i) {
    var pairs    = decodeAssignment(row.CellAssignments);
    var pairList = pairs.map(function(p) { return p.cell + ':' + p.uid; }).join('  ');
    var deepLink = '?h=' + (row.HistID || i);

    var tr = document.createElement('tr');
    tr.style.cssText = 'border-bottom:1px solid #1e1e30;vertical-align:top;';
    tr.innerHTML =
      // Col 1: HistID + deep-link
      '<td style="padding:6px 8px;text-align:center;white-space:nowrap;">'
        + '<span style="color:#8ef;font-size:14px;font-weight:bold;font-family:monospace;">#'
        + escH(String(row.HistID || '?')) + '</span><br>'
        + '<a href="' + escH(deepLink) + '" title="Deep-link to restore this layout on load" '
        + 'style="color:#4af;font-size:9px;font-family:monospace;text-decoration:none;" '
        + 'onclick="event.preventDefault();navigator.clipboard&&navigator.clipboard.writeText(location.origin+location.pathname+\''
        + escH(deepLink) + '\').catch(function(){});">copy ?h=' + escH(String(row.HistID||'?')) + '</a>'
      + '</td>'
      // Col 2: Topic
    + '<td style="padding:6px 10px;color:#fff;font-size:13px;min-width:100px;">'
        + escH(row.Topic) + '</td>'
      // Col 3: DateSaved
    + '<td style="padding:6px 10px;color:#8ef;font-size:12px;white-space:nowrap;font-family:monospace;">'
        + escH(row.DateSaved) + '</td>'
      // Col 4: CellAssignments
    + '<td style="padding:6px 10px;color:#888;font-size:11px;font-family:monospace;word-break:break-all;max-width:260px;">'
        + '<span style="color:#666;font-size:10px;">' + pairs.length + ' cells — </span>'
        + escH(pairList || '(empty — save again after running Fill UIDs)')
    + '</td>'
      // Col 5: Actions
    + '<td style="padding:6px 8px;white-space:nowrap;">'
        + '<div style="display:flex;gap:5px;">'
        + '<button onclick="window.restoreFromHistory(' + i + ')" '
        + 'style="padding:4px 10px;border-radius:4px;border:1px solid #5f5;'
        + 'background:rgba(0,100,0,0.3);color:#5f5;cursor:pointer;font-size:12px;font-weight:bold;">Restore</button>'
        + '<button onclick="deleteHistoryRow(' + i + ')" '
        + 'style="padding:4px 7px;border-radius:4px;border:1px solid #f66;'
        + 'background:rgba(100,0,0,0.25);color:#f66;cursor:pointer;font-size:12px;">✕</button>'
        + '</div>'
    + '</td>';
    body.appendChild(tr);
  });
}

function escH(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Open / close ──────────────────────────────────────────────────────────────
window.openHistoryModal = function() {
  renderHistoryTable();
  var modal = document.getElementById('historyModal');
  if (modal) modal.classList.add('open');
  if (window.menuWrap) window.menuWrap.style.display = 'none';
};

window.closeHistoryModal = function() {
  var modal = document.getElementById('historyModal');
  if (modal) modal.classList.remove('open');
  if (window.menuWrap) window.menuWrap.style.display = '';
};

// ── Download history.json ─────────────────────────────────────────────────────
window.downloadHistoryJson = function() {
  var payload = [{ _salMeta: true, _salPushTime: Date.now() }].concat(historyData);
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'history.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
};
