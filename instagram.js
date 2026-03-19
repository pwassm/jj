// ─── Instagram embed module ───────────────────────────────────────────────────
// Shows an Instagram thumbnail that links out to the post.
// To remove this feature: delete instagram.js and remove the script tag in index.html.
//
// Instagram does NOT allow iframe embeds — this uses oEmbed to get a thumbnail
// and opens the post in a new tab on click.
//
// Usage: this module hooks into the grid rendering. When a cell has:
//   VidRange: "3"  (the magic value meaning "instagram")
//   link: "https://www.instagram.com/p/..."
// it renders a thumbnail overlay instead of trying to embed a video.
//
// The oEmbed endpoint requires no auth for public posts.
// Note: Instagram oEmbed may be rate-limited. Thumbnails are cached in localStorage.

(function() {
  'use strict';

  var IG_CACHE_KEY = 'seeandlearn-ig-cache';

  function getCache() {
    try { return JSON.parse(localStorage.getItem(IG_CACHE_KEY) || '{}'); } catch(e) { return {}; }
  }
  function setCache(url, data) {
    var c = getCache(); c[url] = data;
    try { localStorage.setItem(IG_CACHE_KEY, JSON.stringify(c)); } catch(e) {}
  }

  // Fetch Instagram oEmbed thumbnail URL for a given Instagram post URL.
  // Returns a promise that resolves to {thumbnail_url, title, author_name} or null.
  window.fetchInstagramOEmbed = async function(postUrl) {
    var cache = getCache();
    if (cache[postUrl]) return cache[postUrl];
    try {
      var endpoint = 'https://graph.facebook.com/v18.0/instagram_oembed'
        + '?url=' + encodeURIComponent(postUrl)
        + '&fields=thumbnail_url,title,author_name'
        + '&access_token=' + (localStorage.getItem('instagram-token') || '');
      // Fallback to public oEmbed (no token required for some endpoints)
      if (!localStorage.getItem('instagram-token')) {
        // Try the public endpoint — works for public posts without auth
        endpoint = 'https://api.instagram.com/oembed/?url=' + encodeURIComponent(postUrl);
      }
      var res  = await fetch(endpoint);
      if (!res.ok) return null;
      var data = await res.json();
      var result = {
        thumbnail_url: data.thumbnail_url || null,
        title: data.title || '',
        author_name: data.author_name || ''
      };
      if (result.thumbnail_url) setCache(postUrl, result);
      return result;
    } catch(e) { return null; }
  };

  // Check if a row is an Instagram entry
  window.isInstagramLink = function(url) {
    return /instagram\.com\/(p|reel|tv)\//i.test(url || '');
  };

  // Build an Instagram thumbnail overlay div for a grid cell.
  // Calls back with the div element when ready.
  window.buildInstagramCell = function(it, cellW, cellH, callback) {
    var div = document.createElement('div');
    div.style.cssText = 'width:100%;height:100%;position:relative;background:#111;'
      + 'display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;';

    // Placeholder while loading
    div.innerHTML = '<div style="color:#888;font-size:12px;text-align:center;">'
      + '&#x1F4F7;<br>Instagram<br><small style="font-size:10px;opacity:0.6;">loading…</small></div>';

    // Click → open Instagram post in new tab
    div.addEventListener('click', function() {
      window.open(it.link, '_blank', 'noopener');
    });

    // Instagram logo overlay badge
    var badge = document.createElement('div');
    badge.style.cssText = 'position:absolute;bottom:4px;right:4px;'
      + 'background:rgba(0,0,0,0.65);border-radius:4px;padding:2px 5px;'
      + 'font-size:10px;color:#e1306c;font-weight:bold;pointer-events:none;';
    badge.textContent = '▶ Instagram';
    div.appendChild(badge);

    // Async: fetch thumbnail and update
    window.fetchInstagramOEmbed(it.link).then(function(data) {
      if (data && data.thumbnail_url) {
        div.innerHTML = '';
        var img = document.createElement('img');
        img.src = data.thumbnail_url;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        img.onerror = function() {
          // Thumbnail blocked (CORS) — show link-out placeholder
          div.innerHTML = '<div style="color:#e1306c;font-size:12px;text-align:center;padding:8px;">'
            + '&#x1F4F7;<br><b>Instagram</b><br>'
            + '<small style="color:#aaa;">' + (it.cname || 'tap to open') + '</small></div>';
        };
        div.appendChild(img);
        // Re-add badge
        div.appendChild(badge);
        if (it.cname) {
          var lbl = document.createElement('div');
          lbl.className = 'cell-label';
          lbl.textContent = it.cname;
          div.appendChild(lbl);
        }
      } else {
        // No thumbnail — show link-out placeholder
        div.innerHTML = '<div style="color:#e1306c;font-size:13px;text-align:center;padding:8px;">'
          + '&#x1F4F7;<br><b>Instagram</b><br>'
          + '<small style="color:#aaa;">' + (data && data.author_name ? '@' + data.author_name : it.cname || 'tap to open') + '</small></div>';
        div.appendChild(badge);
      }
    });

    callback(div);
  };

})();
