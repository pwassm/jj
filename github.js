// --- GITHUB INTEGRATION ---

function showGhBalloon(msg, duration=2000) {
  let b = document.getElementById('gh-balloon');
  if(!b) {
    b = document.createElement('div');
    b.id = 'gh-balloon';
    b.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(0,0,0,0.85); color:#fff; padding:15px 25px; border-radius:8px; border:1px solid #4af; z-index:10000; font-family:sans-serif; font-size:16px; text-align:center; pointer-events:none; box-shadow: 0 4px 12px rgba(0,0,0,0.5);';
    document.body.appendChild(b);
  }
  b.textContent = msg;
  b.style.display = 'block';
  if(b.timeoutId) clearTimeout(b.timeoutId);
  if(duration > 0) {
    b.timeoutId = setTimeout(() => { b.style.display = 'none'; }, duration);
  }
}

window.pushToGitHub = async function() {
  const token = localStorage.getItem('github-token');
  if (!token) {
    alert("1. Open Settings -> Turn on GitHub Sync\n2. Paste your token and press Enter");
    document.getElementById('settingsPanel').classList.add('open');
    const tg = document.getElementById('togGithub');
    if (tg) tg.checked = true;
    const setup = document.getElementById('githubTokenSetup');
    if (setup) setup.classList.add('open');
    const inp = document.getElementById('tokenInput');
    if (inp) inp.focus();
    return;
  }
  let owner = localStorage.getItem('github-owner');
  let repo = localStorage.getItem('github-repo');
  if (!owner || !repo) {
    owner = prompt('GitHub Owner (username):', owner || '') || '';
    repo = prompt('Repository Name:', repo || '') || '';
    if (!owner || !repo) return;
    localStorage.setItem('github-owner', owner);
    localStorage.setItem('github-repo', repo);
  }

  showGhBalloon("Pushing to GitHub...", 0);

  try {
    const path = 'links.json';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' };

    const getRes = await fetch(apiUrl, { headers });
    if (!getRes.ok) throw new Error('Repository or file not found.');
    const { sha } = await getRes.json();

    const jsonText = JSON.stringify(linksData, null, 2);
    const contentB64 = btoa(unescape(encodeURIComponent(jsonText)));

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message: 'Update links.json via SeeAndLearn', content: contentB64, sha })
    });

    if (putRes.ok) {
      showGhBalloon("Successfully pushed to GitHub!", 2000);
    } else {
      const errData = await putRes.json();
      throw new Error(errData.message || 'Push failed');
    }
  } catch (err) {
    showGhBalloon("Error: " + err.message, 3000);
  }
}

document.getElementById('miPushGithub').addEventListener('pointerup', function(e) {
  e.stopPropagation();
  closeMenu();
  window.pushToGitHub();
});

document.getElementById('togGithub').addEventListener('change', function(e) {
  const s = document.getElementById('githubTokenSetup');
  if (e.target.checked) s.classList.add('open');
  else s.classList.remove('open');
});

document.getElementById('tokenInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    const val = this.value.trim();
    if (val) {
      localStorage.setItem('github-token', val);
      alert('Token saved!');
      syncAdminUI();
      render();
    }
  }
});
