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
    var path   = 'links.json';
    var apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path;
    var headers = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };

    // GET current file to retrieve its SHA (required for PUT)
    var getRes = await fetch(apiUrl, { headers: headers });
    if (!getRes.ok) {
      var ge = {}; try { ge = await getRes.json(); } catch(x) {}
      throw new Error('GET ' + getRes.status + ': ' + (ge.message || getRes.statusText));
    }
    var getJson = await getRes.json();
    var sha = getJson.sha;

    // Build data: prepend _salMeta row with push timestamp so other clients
    // can detect this push is newer than their localStorage
    var pushTime = Date.now();
    var dataToSend = [{ _salMeta: true, _salPushTime: pushTime }]
      .concat(JSON.parse(JSON.stringify(linksData)));

    var jsonText   = JSON.stringify(dataToSend, null, 2);
    var contentB64 = btoa(unescape(encodeURIComponent(jsonText)));
    var stamp      = new Date().toISOString().slice(0,16).replace('T',' ');

    // Also update local sal-edited to match push time so we don't re-load our own push
    localStorage.setItem('sal-edited', String(pushTime));

    var putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify({ message: 'Update links.json ' + stamp, content: contentB64, sha: sha })
    });

    if (putRes.ok) {
      showGhBalloon('✓ Pushed to GitHub!', 4000);
      setGhStatus('Pushed ' + stamp, '#4f8');
    } else {
      var pe = {}; try { pe = await putRes.json(); } catch(x) {}
      throw new Error('PUT ' + putRes.status + ': ' + (pe.message || putRes.statusText));
    }
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
