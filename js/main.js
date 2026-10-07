/* ============================================
   SDFM GROUP LIMITED — Main JS
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {

  // --- Sticky Nav Scroll Edge ---
  var navWrapper = document.querySelector('.nav-wrapper');
  if (navWrapper) {
    var onScroll = function () {
      navWrapper.classList.toggle('scrolled', window.scrollY > 10);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }


  // --- FAQ Accordion ---
  // Items open and close independently, so opening one never shifts the others.
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var question = item.querySelector('.faq-question');
    if (!question) return;

    question.addEventListener('click', function () {
      var isOpen = item.classList.toggle('open');
      question.setAttribute('aria-expanded', String(isOpen));
    });
  });


  // --- Scroll Reveal ---
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
      }, {
        threshold: 0.05
      });

      revealElements.forEach(function (el) {
        observer.observe(el);
      });

      // Anchor navigation (nav link or a URL hash): reveal the destination
      // straight away so you never land on a blank section. Scrolling itself is
      // left to CSS (scroll-behavior), which already honours reduced motion.
      var revealTarget = function (hash) {
        if (!hash || hash.length < 2) return;
        try {
          var target = document.querySelector(hash);
          if (target && target.classList.contains('reveal')) show(target);
        } catch (e) { /* invalid selector in hash: ignore */ }
      };

      document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function () {
          revealTarget(anchor.getAttribute('href'));
        });
      });
      window.addEventListener('hashchange', function () { revealTarget(window.location.hash); });
      revealTarget(window.location.hash);
    }
  }

});
