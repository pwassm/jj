// ── history.js — GM display snapshots ────────────────────────────────────────
// Saves and restores cell assignments for the TM grid.
// Each history row: { Topic, Assignment, DateSaved }
// Assignment format: "1a:3|1b:7|2a:12" — pipe-separated cell:UniqID pairs.
// Cells with no UniqID are omitted from the snapshot.
//
// Loading: history.json (server) vs localStorage 'sal-history', newer wins.
// Storage key: 'sal-history', timestamp key: 'sal-history-edited'.

var historyData = [];

// ── Load ──────────────────────────────────────────────────────────────────────
async function initHistory() {
  const lsRaw  = localStorage.getItem('sal-history');
  let   lsData = null;
  if (lsRaw) { try { lsData = JSON.parse(lsRaw); } catch(e) {} }
  const lsTime = parseInt(localStorage.getItem('sal-history-edited') || '0', 10);

  let fileData = null, fileTime = 0;
  try {
    const r = await fetch('history.json?v=' + Date.now());
    if (r.ok) {
      const raw = await r.json();
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

  if (fileData && fileTime > lsTime) { historyData = fileData; saveHistory_ls(); }
  else if (lsData)                   { historyData = lsData; }
  else if (fileData)                 { historyData = fileData; saveHistory_ls(); }
  else                               { historyData = []; }
}

function saveHistory_ls() {
  localStorage.setItem('sal-history', JSON.stringify(historyData));
  localStorage.setItem('sal-history-edited', Date.now().toString());
}

// ── Encode / decode assignment string ─────────────────────────────────────────
// "1a:3|1b:7|2a:12" ← cell:UniqID pairs, pipe-separated

function encodeAssignment(data) {
  // data = linksData.  Only rows with both cell and UniqID are snapshotted.
  return (data || linksData)
    .filter(r => r.cell && String(r.cell).trim() && r.UniqID && String(r.UniqID).trim())
    .map(r => String(r.cell).trim() + ':' + String(r.UniqID).trim())
    .join('|');
}

function decodeAssignment(str) {
  // Returns [ {cell, uid}, … ]
  if (!str) return [];
  return str.split('|').map(s => {
    const [cell, uid] = s.split(':');
    return (cell && uid) ? { cell: cell.trim(), uid: uid.trim() } : null;
  }).filter(Boolean);
}

// ── Save snapshot ─────────────────────────────────────────────────────────────
window.writeToHistory = function() {
  // Ensure all rows have UniqIDs first
  const missing = linksData.filter(r => r.show === '1' && (!r.UniqID || r.UniqID === ''));
  if (missing.length) {
    if (!confirm(missing.length + ' visible row(s) have no UniqID and will be excluded from the snapshot.\n\nRun "Fill UIDs" first for a complete snapshot.\n\nSave partial snapshot anyway?')) return;
  }

  const assignment = encodeAssignment(linksData);
  if (!assignment) { alert('No rows with both a cell and UniqID found — nothing to save.\nRun Fill UIDs first.'); return; }

  const topic = prompt('Topic / label for this snapshot:', '');
  if (topic === null) return;  // cancelled

  const d = new Date();
  const ds = [String(d.getFullYear()).slice(-2),
    String(d.getMonth()+1).padStart(2,'0'),
    String(d.getDate()).padStart(2,'0'),
    String(d.getHours()).padStart(2,'0'),
    String(d.getMinutes()).padStart(2,'0'),
    String(d.getSeconds()).padStart(2,'0')].join('.');

  historyData.unshift({ Topic: topic || '(untitled)', Assignment: assignment, DateSaved: ds });
  saveHistory_ls();

  // Count how many cells are snapshotted
  const count = decodeAssignment(assignment).length;
  if (typeof setStatus === 'function') setStatus('✓ Saved snapshot "' + (topic || '(untitled)') + '" — ' + count + ' cells', '#5f5');
  renderHistoryTable();
};

// ── Restore snapshot ──────────────────────────────────────────────────────────
window.restoreFromHistory = function(rowIdx) {
  const hrow = historyData[rowIdx];
  if (!hrow) return;
  const pairs = decodeAssignment(hrow.Assignment);
  if (!pairs.length) { alert('Empty assignment — nothing to restore.'); return; }

  if (!confirm('Restore "' + hrow.Topic + '" (' + hrow.DateSaved + ')?\n\n'
    + pairs.length + ' cell assignments will be applied.\n'
    + 'Rows in TM but NOT in this snapshot will keep their current cell.\n'
    + '(Run Fill UIDs before saving to ensure full coverage.)')) return;

  // Build uid→cell map
  const uidToCell = {};
  pairs.forEach(p => { uidToCell[p.uid] = p.cell; });

  // Detect which cells are about to be claimed, clear them from OTHER rows first
  const claimedCells = new Set(pairs.map(p => p.cell));
  linksData.forEach(r => {
    const uid = String(r.UniqID || '').trim();
    if (r.cell && claimedCells.has(r.cell) && !uidToCell[uid]) {
      r.cell = '';   // evict — another UID is being restored to this cell
    }
  });

  // Assign cells by UniqID
  let applied = 0, notFound = 0;
  pairs.forEach(p => {
    const row = linksData.find(r => String(r.UniqID || '').trim() === p.uid);
    if (row) { row.cell = p.cell; applied++; }
    else { notFound++; }
  });

  if (typeof saveData === 'function') saveData(true);
  if (typeof render === 'function') render();
  if (typeof setStatus === 'function') {
    setStatus('✓ Restored "' + hrow.Topic + '": ' + applied + ' cells applied'
      + (notFound ? ', ' + notFound + ' UIDs not found in TM' : ''), '#5f5');
  }
  // Close history modal
  const hm = document.getElementById('historyModal');
  if (hm) hm.classList.remove('open');
};

// ── Delete a history row ──────────────────────────────────────────────────────
function deleteHistoryRow(idx) {
  if (!confirm('Delete snapshot "' + historyData[idx].Topic + '"?')) return;
  historyData.splice(idx, 1);
  saveHistory_ls();
  renderHistoryTable();
}

// ── Render the history table inside #historyModal ─────────────────────────────
function renderHistoryTable() {
  const modal = document.getElementById('historyModal');
  if (!modal) return;
  const body = document.getElementById('historyTableBody');
  if (!body) return;
  body.innerHTML = '';

  const count = document.getElementById('historyRowCount');
  if (count) count.textContent = historyData.length + ' snapshot' + (historyData.length !== 1 ? 's' : '');

  if (!historyData.length) {
    body.innerHTML = '<tr><td colspan="4" style="color:#666;text-align:center;padding:18px;font-style:italic;">No snapshots yet — open TM table and click Write to History.</td></tr>';
    return;
  }

  historyData.forEach(function(row, i) {
    const pairs = decodeAssignment(row.Assignment);
    // Build human-readable: "1a,2b,3c…" (cell positions only, sorted)
    const cellList = pairs.map(p => p.cell).sort().join(' ');

    const tr = document.createElement('tr');
    tr.style.cssText = 'border-bottom:1px solid #2a2a3a;';
    tr.innerHTML =
      '<td style="padding:6px 8px;color:#8ef;font-size:13px;white-space:nowrap;">' + escH(row.DateSaved) + '</td>'
    + '<td style="padding:6px 8px;color:#fff;font-size:13px;">' + escH(row.Topic) + '</td>'
    + '<td style="padding:6px 8px;color:#888;font-size:11px;font-family:monospace;max-width:220px;word-break:break-all;">'
        + pairs.length + ' cells: ' + escH(cellList) + '</td>'
    + '<td style="padding:6px 8px;white-space:nowrap;display:flex;gap:6px;">'
        + '<button onclick="window.restoreFromHistory(' + i + ')" '
        + 'style="padding:4px 10px;border-radius:4px;border:1px solid #5f5;background:rgba(0,100,0,0.3);'
        + 'color:#5f5;cursor:pointer;font-size:12px;font-weight:bold;">Restore</button>'
        + '<button onclick="deleteHistoryRow(' + i + ')" '
        + 'style="padding:4px 8px;border-radius:4px;border:1px solid #f66;background:rgba(100,0,0,0.25);'
        + 'color:#f66;cursor:pointer;font-size:12px;">✕</button>'
    + '</td>';
    body.appendChild(tr);
  });
}

function escH(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Open / close history modal ────────────────────────────────────────────────
window.openHistoryModal = function() {
  renderHistoryTable();
  const modal = document.getElementById('historyModal');
  if (modal) modal.classList.add('open');
  if (window.menuWrap) window.menuWrap.style.display = 'none';
};

window.closeHistoryModal = function() {
  const modal = document.getElementById('historyModal');
  if (modal) modal.classList.remove('open');
  if (window.menuWrap) window.menuWrap.style.display = '';
};

// ── Download history.json ─────────────────────────────────────────────────────
window.downloadHistoryJson = function() {
  const data = [{ _salMeta: true, _salPushTime: Date.now() }].concat(historyData);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'history.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(a.href);
};

// ── Init ──────────────────────────────────────────────────────────────────────
initHistory();
