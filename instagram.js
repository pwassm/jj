// ─── Instagram embed module ───────────────────────────────────────────────────
// Instagram does NOT allow iframe embeds in third-party pages.
// This module shows a styled link-out card for Instagram posts/reels.
//
// Thumbnail fetching: Instagram's oEmbed API now requires a Facebook app
// access token — no public unauthenticated endpoint exists as of 2023.
// So this module shows a clean branded card that opens the post on click.
//
// To remove this feature: delete instagram.js and its <script> tag in index.html.
// No other files need changing — grid.js checks window.isInstagramLink first.
//
// How to use: set VidRange = "ig" (or leave it as whatever it is) for any row
// whose link is an instagram.com URL. The grid auto-detects Instagram URLs.

(function() {
  'use strict';

  window.isInstagramLink = function(url) {
    return /instagram\.com\/(p|reel|tv)\//i.test(url || '');
  };

  // Extract shortcode from Instagram URL for display
  function igShortcode(url) {
    var m = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : '';
  }

  // Build a branded link-out card for an Instagram cell
  window.buildInstagramCell = function(it, cellW, cellH, callback) {
    var div = document.createElement('div');
    div.style.cssText = 'width:100%;height:100%;position:relative;'
      + 'background:linear-gradient(135deg,#405DE6,#5851DB,#833AB4,#C13584,#E1306C,#FD1D1D,#F56040);'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;'
      + 'cursor:pointer;overflow:hidden;';

    var code = igShortcode(it.link);
    var label = it.cname || (code ? code.slice(0,10) + (code.length > 10 ? '…' : '') : 'Instagram');

    div.innerHTML = '<div style="font-size:28px;line-height:1;margin-bottom:6px;">&#x1F4F8;</div>'
      + '<div style="font-size:11px;font-weight:bold;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.6);">'
      + 'Instagram</div>'
      + '<div style="font-size:10px;color:rgba(255,255,255,0.75);margin-top:3px;'
      + 'max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;">'
      + label + '</div>'
      + '<div style="position:absolute;bottom:3px;right:5px;font-size:9px;'
      + 'color:rgba(255,255,255,0.5);">tap to open</div>';

    div.title = it.link;
    div.addEventListener('click', function() {
      window.open(it.link, '_blank', 'noopener,noreferrer');
    });

    // Swipe right → open (consistent with image cells)
    var startX = 0;
    div.addEventListener('pointerdown', function(e) { startX = e.clientX; });
    div.addEventListener('pointerup', function(e) {
      var dx = e.clientX - startX;
      if (dx > 25) window.open(it.link, '_blank', 'noopener,noreferrer');
    });

    callback(div);
  };

})();
