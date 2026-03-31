// --- GITHUB INTEGRATION ---

function showGhBalloon(msg, duration) {
  if (duration === undefined) duration = 2000;
  var b = document.getElementById('gh-balloon');
  if (!b) {
    b = document.createElement('div');
    b.id = 'gh-balloon';
    b.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
      + 'background:rgba(0,0,30,0.97);color:#fff;padding:18px 30px;border-radius:10px;'
      + 'border:2px solid #4af;z-index:99999;font-family:sans-serif;font-size:17px;'
      + 'text-align:center;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,0.8);'
      + 'min-width:260px;white-space:pre-wrap;max-width:80vw;';
    document.body.appendChild(b);
  }
  b.textContent = msg;
  b.style.display = 'block';
  if (b._tid) clearTimeout(b._tid);
  if (duration > 0) b._tid = setTimeout(function() { b.style.display = 'none'; }, duration);
}

function setGhStatus(msg, color) {
  var el = document.getElementById('jsonStatus');
  if (el) { el.textContent = msg; el.style.color = color || '#8ef'; }
}

// ── Shared helper: PUT one file to GitHub (GET sha first, handle 404 for new files) ──
async function ghPutFile(owner, repo, headers, filePath, jsonData, commitMsg) {
  var apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filePath;
  var sha = null;
  var getRes = await fetch(apiUrl, { headers: headers });
  if (getRes.ok) {
    var getJson = await getRes.json(); sha = getJson.sha;
  } else if (getRes.status !== 404) {
    var ge = {}; try { ge = await getRes.json(); } catch(x) {}
    throw new Error('GET ' + filePath + ' ' + getRes.status + ': ' + (ge.message || getRes.statusText));
  }
  var content = btoa(unescape(encodeURIComponent(JSON.stringify(jsonData, null, 2))));
  var body = { message: commitMsg, content: content };
  if (sha) body.sha = sha;
  var putRes = await fetch(apiUrl, { method: 'PUT', headers: headers, body: JSON.stringify(body) });
  if (!putRes.ok) {
    var pe = {}; try { pe = await putRes.json(); } catch(x) {}
    throw new Error('PUT ' + filePath + ' ' + putRes.status + ': ' + (pe.message || putRes.statusText));
  }
}

window.pushToGitHub = async function() {
  var token = localStorage.getItem('github-token');
  if (!token) {
    var t = prompt('No GitHub token found.\nEnter your GitHub Fine-Grained PAT (Contents:Write):');
    if (!t || !t.trim()) { showGhBalloon('Push cancelled — no token.', 2500); return; }
    token = t.trim();
    localStorage.setItem('github-token', token);
  }
  var owner = localStorage.getItem('github-owner');
  var repo  = localStorage.getItem('github-repo');
  if (!owner || !repo) {
    owner = prompt('GitHub Owner (username):', owner || '') || '';
    repo  = prompt('Repository Name:', repo  || '') || '';
    if (!owner || !repo) { showGhBalloon('Push cancelled — no repo.', 2500); return; }
    localStorage.setItem('github-owner', owner);
    localStorage.setItem('github-repo',  repo);
  }

  showGhBalloon('Pushing to GitHub...', 0);
  setGhStatus('Pushing to GitHub...', '#8ef');

  try {
    var headers = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
    var pushTime = Date.now();
    var stamp    = new Date().toISOString().slice(0,16).replace('T',' ');

    // ── Build _salMeta for masterlinks.json ──────────────────────────────────
    var colLayout = null;
    try {
      var salCols = localStorage.getItem('sal-cols');
      var tabCols = localStorage.getItem('tabulator-sal-table-columns');
      if (salCols || tabCols) {
        colLayout = {};
        if (salCols) colLayout.salCols = JSON.parse(salCols);
        if (tabCols) colLayout.tabCols = JSON.parse(tabCols);
      }
    } catch(ex) {}

    var mlData = [{ _salMeta: true, _salPushTime: pushTime, _salColLayout: colLayout }]
      .concat(JSON.parse(JSON.stringify(linksData)));

    // ── Push masterlinks.json ────────────────────────────────────────────────
    await ghPutFile(owner, repo, headers, 'masterlinks.json', mlData, 'Update masterlinks.json ' + stamp);
    localStorage.setItem('sal-edited', String(pushTime));

    // ── Push history.json (non-fatal if it fails) ────────────────────────────
    try {
      var hData = window.historyData || [];
      var histPayload = [{ _salMeta: true, _salPushTime: pushTime }].concat(hData);
      await ghPutFile(owner, repo, headers, 'history.json', histPayload, 'Update history.json ' + stamp);
      localStorage.setItem('sal-history-edited', String(pushTime));
    } catch(hErr) {
      console.warn('history.json push skipped:', hErr.message);
    }

    showGhBalloon('✓ Pushed to GitHub!', 4000);
    setGhStatus('Pushed ' + stamp, '#4f8');

    // ── Auto-download both JSONs so local m:\jj copy stays in sync ────────────
    // Files go to the browser's configured download folder.
    // Tip: set browser download folder to m:\jj for seamless sync.
    try {
      var dlA = document.createElement('a');
      var mlBlob = new Blob([JSON.stringify(mlData, null, 2)], {type:'application/json'});
      dlA.href = URL.createObjectURL(mlBlob); dlA.download = 'masterlinks.json';
      document.body.appendChild(dlA); dlA.click(); document.body.removeChild(dlA);
      setTimeout(function() { URL.revokeObjectURL(dlA.href); }, 1000);
      // history.json with a brief delay so browser allows the second download
      setTimeout(function() {
        try {
          var hd = window.historyData || [];
          var hp = [{ _salMeta:true, _salPushTime:pushTime }].concat(hd);
          var dlH = document.createElement('a');
          var hBlob = new Blob([JSON.stringify(hp, null, 2)], {type:'application/json'});
          dlH.href = URL.createObjectURL(hBlob); dlH.download = 'history.json';
          document.body.appendChild(dlH); dlH.click(); document.body.removeChild(dlH);
          setTimeout(function() { URL.revokeObjectURL(dlH.href); }, 1000);
        } catch(e2) {}
      }, 600);
    } catch(dlErr) {}

  } catch (err) {
    showGhBalloon('PUSH ERROR:\n' + err.message, 7000);
    setGhStatus('PUSH ERROR: ' + err.message, '#f66');
  }
};

document.getElementById('miPushGithub').addEventListener('pointerup', function(e) {
  e.stopPropagation(); closeMenu(); window.pushToGitHub();
});
document.getElementById('togGithub').addEventListener('change', function(e) {
  var s = document.getElementById('githubTokenSetup');
  if (e.target.checked) s.classList.add('open'); else s.classList.remove('open');
});
document.getElementById('tokenInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var val = this.value.trim();
    if (val) { localStorage.setItem('github-token', val); alert('Token saved!'); syncAdminUI(); render(); }
  }
});
