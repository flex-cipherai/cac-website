/* ============================================
   SDFM GROUP LIMITED — Lead forms
   One script for the three forms (industry, custom, contact).
   A form is <form class="lead-form" data-offer="...">. Every submission goes to the
   website-lead Edge Function, which saves it as an inquiry and sends the emails;
   on success the visitor is sent to /thanks/<offer>.
   ============================================ */

(function () {
  'use strict';

  var ENDPOINT = 'https://kvlietqeafjtwojkqnqa.supabase.co/functions/v1/website-lead';
  // Public anon key (same one the analytics tracker uses). It only lets the browser call the function.
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2bGlldHFlYWZqdHdvamtxbnFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNzM0MDQsImV4cCI6MjEwMzk0OTQwNH0.S_TbT7Fnm83PCdrUoiNksgvtZaSDaDjoALnJzA8NoGk';
  var WHATSAPP = 'https://wa.me/254757230579?text=' + encodeURIComponent("Hi SDFM, I tried to send the form on your website and it didn't go through.");
  var MIN_MS = 3000; // the server rejects anything faster than this, so wait it out rather than lose a quick typist
  var LEAD_FLAG = 'sdfm_lead_offer';
  var ATTR_KEY = 'sdfm_attribution';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Kenyan numbers: +254 7xx, 254 7xx, 07xx, 01xx (spaces, dashes and brackets allowed). Saved as +254...
  function normalisePhone(raw) {
    var s = String(raw || '').replace(/[\s\-().]/g, '');
    var m = /^(?:\+254|254|0)([17]\d{8})$/.exec(s);
    return m ? '+254' + m[1] : null;
  }

  function track(type, props) {
    try {
      if (window.sdfm && window.sdfm.__loaded && window.sdfm.track) window.sdfm.track(type, props || {});
      else { window.sdfmq = window.sdfmq || []; window.sdfmq.push(['track', type, props || {}]); }
    } catch (e) { /* analytics must never break the form */ }
  }

  function attribution() {
    var out = {};
    try { out = JSON.parse(sessionStorage.getItem(ATTR_KEY) || 'null') || {}; } catch (e) { out = {}; }
    var ref = out.referrer || document.referrer || '';
    return {
      referrer: ref.slice(0, 300),
      utm_source: out.utm_source || '', utm_medium: out.utm_medium || '',
      utm_campaign: out.utm_campaign || '', utm_term: out.utm_term || '',
      source: out.source || ''
    };
  }

  Array.prototype.forEach.call(document.querySelectorAll('form.lead-form'), function (form) {
    var offer = form.getAttribute('data-offer');
    var renderedAt = Date.now();
    var started = false;
    var el = form.elements;
    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn ? submitBtn.textContent : '';
    var formError = form.querySelector('[data-form-error]');
    var sending = false;

    var fields = {
      full_name: function (v) { return v.trim().length >= 2 ? '' : 'Enter your full name.'; },
      email: function (v) { return EMAIL_RE.test(v.trim()) ? '' : 'Enter an email like name@company.co.ke'; },
      phone: function (v) {
        if (!v.trim() && !isRequired('phone')) return '';
        return normalisePhone(v) ? '' : 'Enter a Kenyan number like 0712 345 678 or +254 712 345 678';
      },
      business_name: function (v) { return v.trim() || !isRequired('business_name') ? '' : 'Enter your business name.'; },
      staff_band: function (v) { return v || !isRequired('staff_band') ? '' : 'Choose how many staff you have.'; },
      sector: function (v) { return v || !isRequired('sector') ? '' : 'Choose your sector.'; },
      interest: function (v) { return v || !isRequired('interest') ? '' : 'Choose what you are interested in.'; },
      message: function (v) {
        if (v.trim() || !isRequired('message')) return '';
        return offer === 'custom' ? 'Tell us which process or workflow you want built.' : 'Write us a short message.';
      },
      consent: function () { return el.consent && el.consent.checked ? '' : 'Tick the box so we can reply to you.'; }
    };

    function isRequired(name) { return !!(el[name] && el[name].required); }

    function setError(name, text) {
      var input = el[name];
      if (!input) return;
      var wrap = input.closest('.lead-field');
      var msg = form.querySelector('[data-error-for="' + name + '"]');
      if (msg) { msg.textContent = text || ''; msg.hidden = !text; }
      if (wrap) wrap.classList.toggle('has-error', !!text);
      if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }

    function validate(onlyName) {
      var firstBad = null;
      Object.keys(fields).forEach(function (name) {
        if (!el[name] || (onlyName && onlyName !== name)) return;
        var value = el[name].type === 'checkbox' ? '' : el[name].value;
        var msg = fields[name](value);
        setError(name, msg);
        if (msg && !firstBad) firstBad = name;
      });
      return firstBad;
    }

    function showFormError(html) {
      if (!formError) return;
      formError.innerHTML = html || '';
      formError.hidden = !html;
    }

    /* ---- Events ---- */
    Array.prototype.forEach.call(form.elements, function (input) {
      if (!input.name || input.type === 'hidden' || input.type === 'submit') return;
      var evt = input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input';
      input.addEventListener(evt, function () {
        if (!started) { started = true; track('lead_form_start', { offer: offer }); }
        if (fields[input.name]) setError(input.name, '');
        showFormError('');
      });
      input.addEventListener('blur', function () {
        if (fields[input.name] && input.type !== 'checkbox' && (input.value || input.getAttribute('aria-invalid'))) validate(input.name);
      });
    });

    // Buttons elsewhere on the page can pre-select the interest (the product card's "Request a demo").
    Array.prototype.forEach.call(document.querySelectorAll('[data-select-interest]'), function (btn) {
      btn.addEventListener('click', function () {
        if (el.interest) { el.interest.value = btn.getAttribute('data-select-interest'); setError('interest', ''); }
      });
    });

    /* ---- Submit ---- */
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;
      showFormError('');

      var firstBad = validate();
      if (firstBad) { el[firstBad].focus(); return; }

      sending = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      var attr = attribution();
      var value = function (name) { return el[name] ? el[name].value.trim() : ''; };
      var payload = {
        offer: offer,
        full_name: value('full_name'),
        email: value('email').toLowerCase(),
        phone: normalisePhone(value('phone')) || '',
        business_name: value('business_name'),
        staff_band: value('staff_band'),
        sector: value('sector'),
        interest: value('interest'),
        message: value('message'),
        past_work: value('past_work'),
        consent: true,
        page_url: window.location.href.split('#')[0].slice(0, 300),
        referrer: attr.referrer,
        source: attr.source,
        utm_source: attr.utm_source, utm_medium: attr.utm_medium, utm_campaign: attr.utm_campaign, utm_term: attr.utm_term,
        submitted_at: new Date().toISOString(),
        elapsed_ms: Date.now() - renderedAt,
        website: value('website') // honeypot: must stay empty
      };

      var wait = Math.max(0, MIN_MS - (Date.now() - renderedAt));
      setTimeout(function () { send(payload); }, wait);
    });

    function fail(html) {
      sending = false;
      submitBtn.textContent = submitLabel;
      submitBtn.disabled = false;
      showFormError(html);
    }

    function send(payload) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 25000) : null;
      payload.elapsed_ms = Date.now() - renderedAt;

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data }; });
      }).catch(function () {
        return { status: 0, data: {} };
      }).then(function (r) {
        if (timer) clearTimeout(timer);
        var d = r.data || {};

        if (r.status === 200 && d.ok) {
          track('lead_form_submit', { offer: offer });
          try { sessionStorage.setItem(LEAD_FLAG, offer); } catch (e) { /* the thank-you page then counts it anyway */ }
          window.location.href = '/thanks/' + offer;
          return;
        }
        if (r.status === 400 && d.fields) {
          var first = null;
          Object.keys(d.fields).forEach(function (k) { setError(k, d.fields[k]); if (!first && el[k]) first = k; });
          fail('');
          if (first) el[first].focus();
          return;
        }
        track('lead_form_error', { offer: offer, status: String(r.status) });
        if (r.status === 429) {
          fail('Too many attempts. Please wait a few minutes, or <a href="' + WHATSAPP + '" target="_blank" rel="noopener noreferrer">message us on WhatsApp</a>.');
        } else {
          fail('That did not go through, and nothing was lost on your side. Try again, or <a href="' + WHATSAPP + '" target="_blank" rel="noopener noreferrer">message us on WhatsApp</a>.');
        }
      });
    }
  });
})();
