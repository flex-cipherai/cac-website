/* ============================================
   SDFM GROUP LIMITED — Main JS
   Header state, mobile menu, FAQ accordion, path tabs, GTM cta_click, campaign attribution,
   thank-you generate_lead, card spotlight, scroll reveal.
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('site-nav');
  var mqMobile = window.matchMedia('(max-width: 860px)');

  // --- Header: hairline appears once content scrolls underneath ---
  if (header) {
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // --- Mobile menu (disclosure pattern: button + list, Escape closes) ---
  if (header && toggle && menu) {
    var setMenu = function (open, returnFocus) {
      header.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (!open && returnFocus) toggle.focus();
    };

    toggle.addEventListener('click', function () {
      setMenu(!header.classList.contains('menu-open'));
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('menu-open')) setMenu(false, true);
    });

    document.addEventListener('click', function (e) {
      if (header.classList.contains('menu-open') && !header.contains(e.target)) setMenu(false);
    });

    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });

    var onBreakpoint = function () { if (!mqMobile.matches) setMenu(false); };
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', onBreakpoint);
    else if (mqMobile.addListener) mqMobile.addListener(onBreakpoint);
  }


  // --- FAQ accordion ---
  // Items open and close independently, so opening one never shifts the others.
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var question = item.querySelector('.faq-question');
    if (!question) return;

    question.addEventListener('click', function () {
      var isOpen = item.classList.toggle('open');
      question.setAttribute('aria-expanded', String(isOpen));
    });
  });


  // --- Path tabs (home page). All panels are in the HTML; once this runs the inactive ones are hidden. ---
  // Arrow keys, Home and End move between tabs. A bare hash (#assessment, #guide, #industry, #custom) opens one.
  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    var names = tabs.map(function (t) { return t.getAttribute('data-tab'); });

    var select = function (i, focus) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (panels[j]) panels[j].hidden = !on;
      });
      if (focus) tabs[i].focus();
    };

    var fromHash = function () { return names.indexOf((window.location.hash || '').replace('#', '')); };
    var first = fromHash();
    select(first > -1 ? first : 0);
    if (first > -1) setTimeout(function () { root.scrollIntoView({ block: 'start' }); }, 60);

    window.addEventListener('hashchange', function () {
      var n = fromHash();
      if (n > -1) { select(n); root.scrollIntoView({ block: 'start' }); }
    });

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        select(next, true);
      });
    });
  });


  // --- Google Tag Manager: cta_click on every primary button, with the path it belongs to ---
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-cta-path]') : null;
    if (!el) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'cta_click',
      path: el.getAttribute('data-cta-path'),
      cta_label: el.getAttribute('data-sdfm-label') || '',
      cta_page: window.location.pathname
    });
  });


  // --- Campaign attribution: keep the first utm_* / external referrer of the session so a form
  //     submitted on a later page still knows how the visitor arrived. ---
  try {
    var ATTR_KEY = 'sdfm_attribution';
    var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term'];
    var stored = JSON.parse(sessionStorage.getItem(ATTR_KEY) || 'null') || {};
    var params = new URLSearchParams(window.location.search);
    var hasUtm = UTM_KEYS.some(function (k) { return params.get(k); });
    if (hasUtm) {
      UTM_KEYS.forEach(function (k) { stored[k] = (params.get(k) || '').slice(0, 120); });
      if (params.get('source')) stored.source = params.get('source').slice(0, 60);
    }
    if (!stored.referrer && document.referrer) {
      var refHost = new URL(document.referrer).hostname;
      if (refHost && refHost !== window.location.hostname) stored.referrer = document.referrer.slice(0, 300);
    }
    if (!stored.landing) stored.landing = window.location.pathname;
    sessionStorage.setItem(ATTR_KEY, JSON.stringify(stored));
  } catch (err) { /* storage or URL parsing unavailable: forms fall back to the live page values */ }


  // --- Thank-you pages: one generate_lead event per submission, carrying the offer. ---
  // The form stores a flag just before redirecting, so reloading the page or opening the URL
  // directly does not count a second lead. If storage is unavailable the event fires anyway.
  var thanksOffer = document.body.getAttribute('data-thanks-offer');
  if (thanksOffer) {
    var flagKey = 'sdfm_lead_offer';
    var count = true;
    try {
      count = sessionStorage.getItem(flagKey) === thanksOffer;
      if (count) sessionStorage.removeItem(flagKey);
    } catch (err) { count = true; }
    if (count) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'generate_lead', offer: thanksOffer });
      // The Meta Pixel only exists once the visitor has accepted cookies, and cookie-consent.js
      // creates it after DOMContentLoaded, so wait for load.
      window.addEventListener('load', function () {
        try { if (typeof window.fbq === 'function') window.fbq('track', 'Lead', { content_name: thanksOffer }); } catch (err) { /* ad tags are optional */ }
      });
    }
  }


  // --- Card spotlight: soft red glow follows the pointer (fine pointers only) ---
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }


  // --- Scroll reveal ---
  var revealElements = document.querySelectorAll('.reveal');

  if (revealElements.length > 0) {
    var show = function (el) { el.classList.add('visible'); };

    // Reduced motion, or no IntersectionObserver: show everything immediately
    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      revealElements.forEach(show);
    } else {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            show(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });

      revealElements.forEach(function (el) { observer.observe(el); });

      // Anchor navigation (a link or a URL hash): reveal the destination straight
      // away so you never land on a blank section.
      var revealTarget = function (hash) {
        if (!hash || hash.length < 2) return;
        try {
          var target = document.querySelector(hash);
          if (!target) return;
          var holder = target.classList.contains('reveal') ? target : target.closest('.reveal');
          if (holder) show(holder);
        } catch (e) { /* invalid selector in hash: ignore */ }
      };

      document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function () { revealTarget(anchor.getAttribute('href')); });
      });
      window.addEventListener('hashchange', function () { revealTarget(window.location.hash); });
      revealTarget(window.location.hash);
    }
  }

});
