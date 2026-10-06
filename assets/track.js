/* LongLearnDo — visit tracking.
   Records one row in page_visits per browser session: traffic source
   (UTM or referrer-classified), path, and user agent. Fire-and-forget,
   never blocks the page, fails silently. Reads config from window.EA_CONFIG. */
(function () {
  'use strict';
  try {
    var KEY = 'lld_visit_tracked';
    try { if (sessionStorage.getItem(KEY)) return; } catch (e) {}

    var cfg = window.EA_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return;

    var qs = new URLSearchParams(location.search);
    var ref = document.referrer || '';
    var refHost = '';
    try { if (ref) refHost = new URL(ref).hostname.replace(/^www\./, ''); } catch (e) {}

    var utmSource = qs.get('utm_source') || '';
    var utmMedium = qs.get('utm_medium') || '';
    var utmCampaign = qs.get('utm_campaign') || '';

    function classify() {
      if (utmSource) return utmSource.toLowerCase();
      if (!refHost) return 'direct';
      var h = refHost.toLowerCase();
      if (/(^|\.)google\./.test(h)) return 'google';
      if (/facebook\.|fb\.me|fb\.com|l\.facebook/.test(h)) return 'facebook';
      if (/instagram\./.test(h)) return 'instagram';
      if (/tiktok\./.test(h)) return 'tiktok';
      if (/youtube\.|youtu\.be/.test(h)) return 'youtube';
      if (/(^|\.)t\.co$|twitter\.|x\.com/.test(h)) return 'twitter';
      if (/line\.me|liff\.line|line\./.test(h)) return 'line';
      if (/(^|\.)bing\./.test(h)) return 'bing';
      if (/longlearndo\.com/.test(h)) return 'internal';
      return 'referral';
    }

    var payload = {
      path: (location.pathname || '/').slice(0, 300),
      referrer: ref.slice(0, 500),
      ref_host: refHost.slice(0, 200),
      utm_source: utmSource.slice(0, 100),
      utm_medium: utmMedium.slice(0, 100),
      utm_campaign: utmCampaign.slice(0, 150),
      source: classify().slice(0, 50),
      user_agent: (navigator.userAgent || '').slice(0, 300)
    };

    // Send to the track-visit edge function so the server can add
    // device (from UA) and approximate location (from the visitor IP).
    fetch(cfg.SUPABASE_URL + '/functions/v1/track-visit', {
      method: 'POST',
      headers: {
        'apikey': cfg.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(function () {
      try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    }).catch(function () {});
  } catch (e) {}
})();
