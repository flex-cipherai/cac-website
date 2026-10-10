/* ============================================
   SDFM GROUP LIMITED — Main JS
   Header state, mobile menu, FAQ accordion, scroll reveal, card spotlight.
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
