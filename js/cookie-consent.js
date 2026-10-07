/* ============================================
   SDFM GROUP LIMITED — Cookie Consent
   Gates the LinkedIn Insight Tag and the Meta Pixel behind visitor consent.
   ============================================ */

(function () {
  var STORAGE_KEY = 'sdfm_cookie_consent';
  var LINKEDIN_PARTNER_ID = '10918017';
  var META_PIXEL_ID = '2235159617264200';

  function getConsent() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setConsent(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {
      /* Storage unavailable (private mode, blocked cookies, etc). Consent will be re-asked next visit. */
    }
    // Tell the first-party tracker (sdfm-tracker.js) so it starts or stops
    // recognising returning visitors straight away.
    window.dispatchEvent(new CustomEvent('sdfm:consent', { detail: value }));
  }

  function loadMetaPixel() {
    if (window._metaPixelLoaded) return;
    window._metaPixelLoaded = true;

    // Standard Meta Pixel base code, run only after the visitor accepts.
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function loadTrackingTags() {
    loadLinkedInInsightTag();
    loadMetaPixel();
  }

  function loadLinkedInInsightTag() {
    if (window._linkedInInsightLoaded) return;
    window._linkedInInsightLoaded = true;

    window._linkedin_partner_id = LINKEDIN_PARTNER_ID;
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(LINKEDIN_PARTNER_ID);

    (function (l) {
      if (!l) {
        window.lintrk = function (a, b) { window.lintrk.q.push([a, b]); };
        window.lintrk.q = [];
      }
      var s = document.getElementsByTagName('script')[0];
      var b = document.createElement('script');
      b.type = 'text/javascript';
      b.async = true;
      b.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js';
      s.parentNode.insertBefore(b, s);
    })(window.lintrk);

    var img = document.createElement('img');
    img.height = 1;
    img.width = 1;
    img.style.display = 'none';
    img.alt = '';
    img.src = 'https://px.ads.linkedin.com/collect/?pid=' + LINKEDIN_PARTNER_ID + '&fmt=gif';
    document.body.appendChild(img);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('cookie-banner');
    var acceptBtn = document.getElementById('cookie-accept');
    var rejectBtn = document.getElementById('cookie-reject');
    var manageLinks = document.querySelectorAll('[data-cookie-preferences]');

    var consent = getConsent();

    if (consent === 'accepted') {
      loadTrackingTags();
    } else if (consent !== 'rejected' && banner) {
      banner.hidden = false;
    }

    if (acceptBtn && banner) {
      acceptBtn.addEventListener('click', function () {
        setConsent('accepted');
        loadTrackingTags();
        banner.hidden = true;
      });
    }

    if (rejectBtn && banner) {
      rejectBtn.addEventListener('click', function () {
        setConsent('rejected');
        banner.hidden = true;
      });
    }

    manageLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        if (banner) banner.hidden = false;
      });
    });
  });
})();
