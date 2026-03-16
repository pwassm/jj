// --- GITHUB INTEGRATION ---
async function pushToGitHub() {
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
  let owner = localStorage.getItem('github-owner') || '';
  let repo = localStorage.getItem('github-repo') || '';
  owner = prompt('GitHub Owner (username):', owner) || '';
  repo = prompt('Repository Name:', repo) || '';
  if (!owner || !repo) return;

  localStorage.setItem('github-owner', owner);
  localStorage.setItem('github-repo', repo);

  try {
    const path = 'links.json';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' };

    const getRes = await fetch(apiUrl, { headers });
    if (!getRes.ok) throw new Error('Could not find repository or file. Check permissions.');
    const { sha } = await getRes.json();

    const jsonText = JSON.stringify(linksData, null, 2);
    const contentB64 = btoa(unescape(encodeURIComponent(jsonText)));

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message: 'Update links.json via SeeAndLearn', content: contentB64, sha })
    });

    if (putRes.ok) alert('✅ Successfully pushed to GitHub!');
    else throw new Error(await putRes.text());
  } catch (err) {
    alert('❌ GitHub error: ' + err.message);
  }
}

document.getElementById('miPushGithub').addEventListener('pointerup', function(e) {
  e.stopPropagation();
  closeMenu();
  pushToGitHub();
});

const togGithubEl = document.getElementById('togGithub');
if (togGithubEl) {
  togGithubEl.addEventListener('change', function() {
    const setup = document.getElementById('githubTokenSetup');
    const status = document.getElementById('tokenStatus');
    if (this.checked) {
      if (setup) setup.classList.add('open');
      const saved = localStorage.getItem('github-token');
      if (status) status.textContent = saved ? '✅ Token loaded from browser' : 'Paste token → press Enter';
      syncAdminUI();
      if (!saved) {
        const inp = document.getElementById('tokenInput');
        if (inp) inp.focus();
      }
    } else {
      if (setup) setup.classList.remove('open');
    }
  });
}

const tokenInputEl = document.getElementById('tokenInput');
if (tokenInputEl) {
  tokenInputEl.addEventListener('change', function() {
    const t = this.value.trim();
    if (t) {
      localStorage.setItem('github-token', t);
      syncAdminUI();
      const status = document.getElementById('tokenStatus');
      if (status) status.textContent = '✅ Saved securely in browser';
      this.value = '';
      this.blur();
    }
  });
  tokenInputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') this.blur();
  });
}

