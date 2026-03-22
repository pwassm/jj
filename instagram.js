// ─── Instagram embed module ───────────────────────────────────────────────────
// Uses Instagram's official public embed script (//www.instagram.com/embed.js)
// which converts <blockquote class="instagram-media"> tags into real iframes.
// No server auth or API token needed — same method WordPress uses.
//
// To remove: delete instagram.js and its <script> tag in index.html.

(function() {
  'use strict';

  window.isInstagramLink = function(url) {
    return /instagram\.com\/(p|reel|tv)\//i.test(url || '');
  };

  var _igScriptLoaded = false;
  function loadIgScript() {
    if (window.instgrm && window.instgrm.Embeds) {
      window.instgrm.Embeds.process(); return;
    }
    if (_igScriptLoaded) return;
    _igScriptLoaded = true;
    var s = document.createElement('script');
    s.src = 'https://www.instagram.com/embed.js';
    s.async = true;
    s.onload = function() {
      if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process();
    };
    document.head.appendChild(s);
  }

  function cleanUrl(url) {
    // embed.js wants the clean permalink without query params
    return url.split('?')[0].replace(/\/$/, '') + '/';
  }

  window.buildInstagramCell = function(it, cellW, cellH, callback) {
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'width:100%;height:100%;overflow:auto;background:#000;'
      + 'display:flex;align-items:flex-start;justify-content:center;';

    // Instagram embed.js looks for this blockquote
    var bq = document.createElement('blockquote');
    bq.className = 'instagram-media';
    bq.setAttribute('data-instgrm-permalink', cleanUrl(it.link));
    bq.setAttribute('data-instgrm-version', '14');
    bq.style.cssText = 'background:#fff;border:0;border-radius:3px;'
      + 'box-shadow:0 0 1px 0 rgba(0,0,0,0.5);margin:0;'
      + 'max-width:540px;min-width:240px;padding:0;width:calc(100% - 2px);';

    // Fallback link before embed loads
    var fallback = document.createElement('div');
    fallback.style.cssText = 'padding:16px;text-align:center;';
    var a = document.createElement('a');
    a.href = it.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.style.cssText = 'color:#0095f6;font-family:sans-serif;font-size:13px;';
    a.textContent = it.cname || 'View on Instagram';
    fallback.appendChild(a);
    bq.appendChild(fallback);
    wrapper.appendChild(bq);

    // Swipe right to open
    var startX = 0;
    wrapper.addEventListener('pointerdown', function(e) { startX = e.clientX; });
    wrapper.addEventListener('pointerup', function(e) {
      if (e.clientX - startX > 25) window.open(it.link, '_blank', 'noopener,noreferrer');
    });

    callback(wrapper);
    setTimeout(loadIgScript, 50);
  };

})();
