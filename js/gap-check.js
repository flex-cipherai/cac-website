/* ============================================
   SDFM GROUP LIMITED — Automation Scoper
   The free assessment tool on /ai-gap-check. Three stages: details, conversation, report.
   Everything goes through the gap-assessment Edge Function, which holds the AI key and the rules;
   this file only shows what comes back. All text from the server is written with textContent, never
   innerHTML, because it was produced by an AI model.
   ============================================ */

(function () {
  'use strict';

  var root = document.getElementById('gc');
  if (!root) return;

  var ENDPOINT = 'https://kvlietqeafjtwojkqnqa.supabase.co/functions/v1/gap-assessment';
  // Public anon key (same one forms.js and the analytics tracker use). It only lets the browser call the function.
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2bGlldHFlYWZqdHdvamtxbnFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNzM0MDQsImV4cCI6MjEwMzk0OTQwNH0.S_TbT7Fnm83PCdrUoiNksgvtZaSDaDjoALnJzA8NoGk';
  var WHATSAPP = '254757230579';
  var TOKEN_KEY = 'sdfm_gc_token';
  var MIN_MS = 3000; // the server ignores anything faster than this, so wait it out rather than lose a quick typist
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var state = {
    token: null, name: '', company: '', stage: 'details', busy: false, canFinish: false, ready: false,
    atLimit: false, report: null, messages: 0, replies: 0, pdfBusy: false
  };

  var $ = function (sel, ctx) { return (ctx || root).querySelector(sel); };
  var panels = {
    details: $('[data-panel="details"]'), chat: $('[data-panel="chat"]'),
    working: $('[data-panel="working"]'), report: $('[data-panel="report"]')
  };
  var form = $('#gc-form');
  var log = $('#gc-log');
  var suggest = $('#gc-suggest');
  var readyNote = $('#gc-ready');
  var compose = $('#gc-compose');
  var input = $('#gc-input');
  var sendBtn = $('#gc-send');
  var chatError = $('#gc-chat-error');
  var finishBtn = $('#gc-finish');
  var areasList = $('#gc-areas');
  var reportBox = $('#gc-report');

  /* ---------- helpers ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svgEl(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function kes(n) { return 'KES ' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

  function track(type, props) {
    try {
      if (window.sdfm && window.sdfm.__loaded && window.sdfm.track) window.sdfm.track(type, props || {});
      else { window.sdfmq = window.sdfmq || []; window.sdfmq.push(['track', type, props || {}]); }
    } catch (e) { /* analytics must never break the tool */ }
    try { (window.dataLayer = window.dataLayer || []).push({ event: type, tool: 'ai_gap_check' }); } catch (e) { /* same */ }
  }

  function store(token) {
    try { if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode: the page just cannot restore itself */ }
  }

  function savedToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function attribution() {
    var out = {};
    try { out = JSON.parse(sessionStorage.getItem('sdfm_attribution') || 'null') || {}; } catch (e) { out = {}; }
    return {
      referrer: (out.referrer || document.referrer || '').slice(0, 300),
      utm_source: out.utm_source || '', utm_medium: out.utm_medium || '',
      utm_campaign: out.utm_campaign || '', utm_term: out.utm_term || ''
    };
  }

  function api(action, payload, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 70000) : null;
    var body = { action: action };
    Object.keys(payload || {}).forEach(function (k) { body[k] = payload[k]; });
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
      body: JSON.stringify(body),
      keepalive: action === 'event', // a CTA click navigates away; let the request finish anyway
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data || {} }; });
    }).catch(function () {
      return { status: 0, data: {} };
    }).then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  function whatsappLink(text) { return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text); }

  function setAlert(node, html) {
    // html here is only ever our own fixed strings, never model or visitor text.
    node.innerHTML = html || '';
    node.hidden = !html;
  }

  var HELP = ' <a href="' + whatsappLink("Hi SDFM, I tried the automation scoper on your website and it didn't work.") + '" target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>.';

  function setStage(name, noScroll) {
    state.stage = name;
    root.setAttribute('data-stage', name);
    Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== name; });
    var step = name === 'working' ? 'chat' : name;
    Array.prototype.forEach.call(root.querySelectorAll('.gc-steps li'), function (li) {
      var s = li.getAttribute('data-step');
      var order = ['details', 'chat', 'report'];
      li.classList.toggle('is-done', order.indexOf(s) < order.indexOf(step));
      if (s === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (!noScroll) {
      var top = root.getBoundingClientRect().top + window.pageYOffset - 88;
      window.scrollTo({ top: Math.max(0, top), behavior: REDUCED ? 'auto' : 'smooth' });
    }
  }

  /* ---------- stage 1: details ---------- */

  var renderedAt = Date.now();
  var started = false;
  var sending = false;
  var submitBtn = form.querySelector('button[type="submit"]');
  var submitLabel = submitBtn.innerHTML;
  var formError = form.querySelector('[data-form-error]');

  function setFieldError(name, text) {
    var inputEl = form.elements[name];
    if (!inputEl) return;
    var msg = form.querySelector('[data-error-for="' + name + '"]');
    if (msg) { msg.textContent = text || ''; msg.hidden = !text; }
    var wrap = inputEl.closest('.gc-field');
    if (wrap) wrap.classList.toggle('has-error', !!text);
    if (text) inputEl.setAttribute('aria-invalid', 'true'); else inputEl.removeAttribute('aria-invalid');
  }

  var validators = {
    full_name: function (v) { return v.trim().length >= 2 ? '' : 'Enter your full name.'; },
    email: function (v) { return EMAIL_RE.test(v.trim()) ? '' : 'Enter your work email, like name@company.co.ke'; },
    company_name: function (v) { return v.trim() ? '' : 'Enter your company name.'; },
    website: function (v) { var s = v.trim(); return s && /\./.test(s) && !/\s/.test(s) ? '' : 'Enter your website, like www.company.co.ke'; },
    consent: function () { return form.elements.consent.checked ? '' : 'Tick the box to continue.'; }
  };

  function validateAll() {
    var first = null;
    Object.keys(validators).forEach(function (name) {
      var v = form.elements[name].type === 'checkbox' ? '' : form.elements[name].value;
      var msg = validators[name](v);
      setFieldError(name, msg);
      if (msg && !first) first = name;
    });
    return first;
  }

  Array.prototype.forEach.call(form.elements, function (f) {
    if (!f.name || f.type === 'submit' || f.name === 'hp') return;
    f.addEventListener(f.type === 'checkbox' ? 'change' : 'input', function () {
      if (!started) { started = true; track('gap_check_form_start'); }
      setFieldError(f.name, '');
      setAlert(formError, '');
    });
    f.addEventListener('blur', function () {
      if (f.type !== 'checkbox' && f.value && validators[f.name]) setFieldError(f.name, validators[f.name](f.value));
    });
  });

  function startFailed(html) {
    sending = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = submitLabel;
    setAlert(formError, html);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    setAlert(formError, '');
    var bad = validateAll();
    if (bad) { form.elements[bad].focus(); return; }

    sending = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Starting…';

    var attr = attribution();
    var payload = {
      full_name: form.elements.full_name.value.trim(),
      email: form.elements.email.value.trim().toLowerCase(),
      company_name: form.elements.company_name.value.trim(),
      website: form.elements.website.value.trim(),
      consent: true,
      page_url: window.location.href.split('#')[0].slice(0, 300),
      referrer: attr.referrer, utm_source: attr.utm_source, utm_medium: attr.utm_medium,
      utm_campaign: attr.utm_campaign, utm_term: attr.utm_term,
      hp: form.elements.hp.value
    };
    var wait = Math.max(0, MIN_MS - (Date.now() - renderedAt));
    setTimeout(function () {
      payload.elapsed_ms = Date.now() - renderedAt;
      api('start', payload, 80000).then(function (r) {
        var d = r.data;
        if (r.status === 200 && d.ok && d.token) {
          state.token = d.token;
          state.name = payload.full_name;
          state.company = payload.company_name;
          store(d.token);
          sending = false;
          submitBtn.disabled = false;
          submitBtn.innerHTML = submitLabel;
          resetChat();
          (d.messages || []).forEach(function (m) { addMessage(m.role, m.content); });
          applyProgress(d.progress, false);
          renderSuggestions(d.suggested_replies);
          setStage('chat');
          track('gap_check_start');
          setTimeout(function () { input.focus({ preventScroll: true }); }, 350);
          return;
        }
        if (r.status === 400 && d.fields) {
          var firstField = null;
          Object.keys(d.fields).forEach(function (k) { setFieldError(k, d.fields[k]); if (!firstField && form.elements[k]) firstField = k; });
          startFailed('');
          if (firstField) form.elements[firstField].focus();
          return;
        }
        track('gap_check_error', { stage: 'start', status: String(r.status), code: String(d.error || '') });
        var msg = {
          rate_limited: 'Too many tries from your network. Please wait a while, or' + HELP,
          email_limit: 'This email address has already used the check three times today. Try again tomorrow, or' + HELP,
          capacity: "We've reached today's limit for free checks. Please come back tomorrow, or" + HELP,
          disabled: 'The automation scoper is paused right now. <a href="/contact">Contact us</a> and we will run it with you.'
        }[d.error] || 'That did not go through, and nothing was lost on your side. Try again, or' + HELP;
        startFailed(msg);
      });
    }, wait);
  });

  /* ---------- stage 2: conversation ---------- */

  function resetChat() {
    log.textContent = '';
    suggest.textContent = '';
    suggest.hidden = true;
    readyNote.hidden = true;
    setAlert(chatError, '');
    input.value = '';
    input.disabled = false;
    sendBtn.disabled = false;
    autosize();
    state.canFinish = false; state.ready = false; state.atLimit = false; state.messages = 0; state.replies = 0;
  }

  function scrollLog() {
    log.scrollTop = log.scrollHeight;
  }

  function addMessage(role, text, extraClass) {
    var wrap = el('div', 'gc-msg gc-msg-' + (role === 'user' ? 'user' : 'bot') + (extraClass ? ' ' + extraClass : ''));
    var who = el('span', 'gc-msg-who', role === 'user' ? (state.name ? state.name.split(/\s+/)[0] : 'You') : 'SDFM assistant');
    var body = el('p', '', text);
    wrap.appendChild(who);
    wrap.appendChild(body);
    log.appendChild(wrap);
    state.messages++;
    scrollLog();
    return wrap;
  }

  function showTyping() {
    var t = el('div', 'gc-msg gc-msg-bot gc-typing');
    t.setAttribute('aria-label', 'The assistant is typing');
    t.appendChild(el('span', 'gc-msg-who', 'SDFM assistant'));
    var dots = el('p', 'gc-dots');
    dots.innerHTML = '<i></i><i></i><i></i>';
    t.appendChild(dots);
    log.appendChild(t);
    scrollLog();
    return t;
  }

  function renderSuggestions(list) {
    suggest.textContent = '';
    var items = (list || []).filter(Boolean).slice(0, 4);
    items.forEach(function (text) {
      var b = el('button', 'gc-chip', text);
      b.type = 'button';
      b.addEventListener('click', function () { send(text); });
      suggest.appendChild(b);
    });
    suggest.hidden = !items.length;
  }

  function applyProgress(p, ready) {
    if (!p) return;
    areasList.textContent = '';
    (p.areas || []).forEach(function (a) {
      var li = el('li', a.covered ? 'is-covered' : '', a.label);
      areasList.appendChild(li);
    });
    $('#gc-covered').textContent = String(p.covered_count);
    $('#gc-total').textContent = String(p.total_areas);
    $('#gc-meter-fill').style.width = Math.round((p.covered_count / Math.max(1, p.total_areas)) * 100) + '%';
    state.canFinish = !!p.can_finish;
    state.atLimit = !!p.at_limit;
    state.ready = !!ready || state.atLimit;
    finishBtn.disabled = !(state.canFinish || state.atLimit);
    finishBtn.classList.toggle('is-ready', state.ready);
    readyNote.hidden = !state.ready;
    $('#gc-rail-note').textContent = state.ready
      ? 'You can build your report now.'
      : state.canFinish ? 'You can build your report whenever you like, or keep going for a fuller one.' : 'Your report unlocks after a few more answers.';
    if (state.atLimit) {
      input.disabled = true; sendBtn.disabled = true;
      input.placeholder = 'That is the most we can cover. Build your report below.';
      suggest.hidden = true;
    }
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 168) + 'px';
  }
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); compose.requestSubmit ? compose.requestSubmit() : submitCompose(); }
  });
  compose.addEventListener('submit', function (e) { e.preventDefault(); submitCompose(); });
  function submitCompose() { send(input.value); }

  var CHAT_ERRORS = {
    ai_busy: 'The assistant is busy right now. Your answer is still in the box: press send again in a few seconds.',
    ai_unavailable: 'The assistant could not answer just now. Your answer is still in the box: try again, or' + HELP,
    busy: 'One moment, the assistant is still working on your last answer.',
    rate_limited: 'You are sending answers very quickly. Wait a minute and try again.',
    not_found: 'This session has expired. <button type="button" class="gc-linkbtn" data-restart>Start again</button>',
    default: 'That did not send. Your answer is still in the box: check your connection and try again.'
  };

  function send(raw) {
    var text = String(raw || '').trim();
    if (!text || state.busy || state.atLimit) return;
    state.busy = true;
    setAlert(chatError, '');
    suggest.hidden = true;
    var bubble = addMessage('user', text);
    input.value = '';
    autosize();
    input.disabled = true; sendBtn.disabled = true; finishBtn.disabled = true;
    var typing = showTyping();

    api('chat', { token: state.token, message: text }, 60000).then(function (r) {
      var d = r.data;
      state.busy = false;
      typing.remove();
      input.disabled = state.atLimit; sendBtn.disabled = state.atLimit;

      if (r.status === 200 && d.ok) {
        state.replies++;
        if (state.replies === 1) track('gap_check_first_answer');
        addMessage('assistant', d.reply);
        applyProgress(d.progress, d.ready);
        renderSuggestions(d.suggested_replies);
        if (!input.disabled) input.focus({ preventScroll: true });
        return;
      }
      // Not delivered: take the bubble back and give the text to the visitor to resend.
      bubble.remove(); state.messages--;
      input.value = text; autosize();
      finishBtn.disabled = !(state.canFinish || state.atLimit);
      if (d.error === 'turn_limit') {
        input.value = ''; autosize();
        applyProgress(d.progress || { areas: [], covered_count: 0, total_areas: 8, can_finish: true, at_limit: true }, true);
        setAlert(chatError, 'That is the most we can cover in one check. Build your report below.');
        return;
      }
      if (d.error === 'finished') { resume(); return; }
      track('gap_check_error', { stage: 'chat', status: String(r.status), code: String(d.error || '') });
      setAlert(chatError, CHAT_ERRORS[d.error] || CHAT_ERRORS['default']);
      if (!input.disabled) input.focus({ preventScroll: true });
    });
  }

  chatError.addEventListener('click', function (e) {
    if (e.target.closest('[data-restart]')) restart();
  });

  /* ---------- report building ---------- */

  var WORKING_LINES = [
    'Reading back through your answers…',
    'Grouping what you told us by area of the business…',
    'Working out the hours and money behind each gap…',
    'Checking the numbers are realistic for a business your size…',
    'Writing it up…'
  ];
  var workTimer = null;

  function buildReport() {
    if (state.busy) return;
    state.busy = true;
    setStage('working');
    var line = $('#gc-working-line');
    var errBox = $('#gc-working-error');
    var retry = $('#gc-retry');
    setAlert(errBox, ''); retry.hidden = true;
    $('#gc-working-title').textContent = 'Building your report';
    var i = 0;
    line.textContent = WORKING_LINES[0];
    clearInterval(workTimer);
    workTimer = setInterval(function () { i = Math.min(i + 1, WORKING_LINES.length - 1); line.textContent = WORKING_LINES[i]; }, 5000);
    track('gap_check_report_requested');

    api('report', { token: state.token }, 150000).then(function (r) {
      clearInterval(workTimer);
      state.busy = false;
      var d = r.data;
      if (r.status === 200 && d.ok && d.report) {
        state.report = d.report;
        renderReport(d.report);
        setStage('report');
        track('gap_check_report', { gaps: d.report.gaps.length, readiness: d.report.readiness.score });
        var h = $('#gc-report-title');
        if (h) setTimeout(function () { h.focus({ preventScroll: true }); }, 400);
        return;
      }
      track('gap_check_error', { stage: 'report', status: String(r.status), code: String(d.error || '') });
      if (d.error === 'not_ready') { setStage('chat'); setAlert(chatError, 'A few more answers are needed before the report can be built.'); return; }
      if (d.error === 'not_found') { setStage('chat'); setAlert(chatError, CHAT_ERRORS.not_found); return; }
      $('#gc-working-title').textContent = 'The report did not finish';
      line.textContent = '';
      setAlert(errBox, (d.error === 'ai_busy' || d.error === 'busy'
        ? 'The assistant is busy right now. Your answers are saved: try again in a minute.'
        : 'Something went wrong while building the report. Your answers are saved: try again, or') + (d.error === 'ai_busy' || d.error === 'busy' ? '' : HELP));
      retry.hidden = false;
    });
  }

  finishBtn.addEventListener('click', buildReport);
  $('#gc-retry').addEventListener('click', buildReport);

  /* ---------- stage 3: report ---------- */

  function scoreRing(score) {
    var wrap = el('div', 'gcr-score');
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', 'Readiness score ' + score + ' out of 100');
    var svg = svgEl('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
    var C = 2 * Math.PI * 44;
    svg.appendChild(svgEl('circle', { cx: 50, cy: 50, r: 44, class: 'gcr-ring-bg' }));
    svg.appendChild(svgEl('circle', {
      cx: 50, cy: 50, r: 44, class: 'gcr-ring', transform: 'rotate(-90 50 50)',
      'stroke-dasharray': (C * Math.max(0, Math.min(100, score)) / 100).toFixed(1) + ' ' + C.toFixed(1)
    }));
    wrap.appendChild(svg);
    var num = el('div', 'gcr-score-num');
    num.appendChild(el('strong', '', String(score)));
    num.appendChild(el('span', '', '/ 100'));
    wrap.appendChild(num);
    return wrap;
  }

  function roiStat(label, value, sub) {
    var d = el('div', 'gcr-stat');
    d.appendChild(el('span', 'gcr-stat-label', label));
    d.appendChild(el('strong', 'gcr-stat-value', value));
    if (sub) d.appendChild(el('span', 'gcr-stat-sub', sub));
    return d;
  }

  function section(title, id) {
    var s = el('section', 'gcr-section');
    var h = el('h3', 'gcr-h', title);
    if (id) h.id = id;
    s.appendChild(h);
    return s;
  }

  function ctaButton(label, href, cls, kind, newTab) {
    var a = el('a', cls, label);
    a.href = href;
    if (newTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    a.setAttribute('data-sdfm-cta', '');
    a.setAttribute('data-sdfm-label', 'gapcheck_report_' + kind);
    a.addEventListener('click', function () {
      track('gap_check_cta', { kind: kind });
      api('event', { token: state.token, event: 'cta_clicked', kind: kind }, 8000);
    });
    return a;
  }

  function renderReport(report) {
    reportBox.textContent = '';
    var r = report.roi;

    /* Head */
    var head = el('header', 'gcr-head');
    head.appendChild(scoreRing(report.readiness.score));
    var info = el('div', 'gcr-head-info');
    info.appendChild(el('p', 'gcr-eyebrow', 'Automation Scoper report'));
    var title = el('h2', 'gcr-title', report.company.name);
    title.id = 'gc-report-title';
    title.tabIndex = -1;
    info.appendChild(title);
    info.appendChild(el('p', 'gcr-label', report.readiness.label + ' readiness for AI'));
    if (report.readiness.summary) info.appendChild(el('p', 'gcr-summary', report.readiness.summary));
    head.appendChild(info);
    var actions = el('div', 'gcr-actions');
    var pdf = el('button', 'btn-primary', 'Download PDF');
    pdf.type = 'button';
    pdf.id = 'gc-pdf';
    pdf.setAttribute('data-sdfm-cta', '');
    pdf.setAttribute('data-sdfm-label', 'gapcheck_report_pdf');
    pdf.addEventListener('click', downloadPdf);
    actions.appendChild(pdf);
    head.appendChild(actions);
    reportBox.appendChild(head);
    if (report.company.summary) reportBox.appendChild(el('p', 'gcr-company', report.company.summary));

    /* Projected return */
    var roi = el('section', 'gcr-roi');
    roi.appendChild(el('h3', 'gcr-roi-h', 'Projected return of closing these gaps'));
    if (r.quantified_gaps) {
      roi.appendChild(el('p', 'gcr-roi-big', kes(r.annual_low) + ' to ' + kes(r.annual_high)));
      roi.appendChild(el('p', 'gcr-roi-sub', 'a year in time and revenue recovered. Most likely ' + kes(r.annual_expected) + '.'));
      var stats = el('div', 'gcr-stats');
      stats.appendChild(roiStat('Time back', r.hours_per_week_recovered + ' h', 'every week'));
      stats.appendChild(roiStat('First-year ROI', r.roi_pct_low + '% to ' + r.roi_pct_high + '%', 'after what it takes to do the work'));
      stats.appendChild(roiStat('Payback', r.payback_months_best + ' to ' + r.payback_months_worst, 'months'));
      roi.appendChild(stats);
      roi.appendChild(el('p', 'gcr-roi-note', 'Counts ' + r.quantified_gaps + ' of the ' + report.gaps.length + ' gaps below, the ones where your answers gave enough figures. Prioritisation and cost estimates for each opportunity are not part of this free report.'));
    } else {
      roi.appendChild(el('p', 'gcr-roi-sub', 'Your answers did not include enough figures (people, hours, lost sales) to put a reliable value on these gaps. A full assessment would measure them.'));
    }
    reportBox.appendChild(roi);

    /* Gaps, grouped by area, in the order of the business areas (not ranked) */
    var gaps = section('Gaps we found (' + report.gaps.length + ')');
    if (!report.gaps.length) gaps.appendChild(el('p', 'gcr-empty', 'No specific gaps came out of this conversation. That can mean the business is well run, or that the answers were brief.'));
    var lastArea = null;
    report.gaps.forEach(function (g) {
      if (g.area_label !== lastArea) { lastArea = g.area_label; gaps.appendChild(el('p', 'gcr-area-label', g.area_label)); }
      var card = el('article', 'gcr-gap');
      var top = el('div', 'gcr-gap-top');
      top.appendChild(el('span', 'gcr-tag', g.solution_label));
      card.appendChild(top);
      card.appendChild(el('h4', '', g.title));
      card.appendChild(el('p', '', g.finding));
      if (g.evidence) card.appendChild(el('p', 'gcr-evidence', 'You told us: ' + g.evidence));
      var dl = el('dl', 'gcr-dl');
      if (g.impact) { dl.appendChild(el('dt', '', 'Impact')); dl.appendChild(el('dd', '', g.impact)); }
      if (g.opportunity) { dl.appendChild(el('dt', '', 'Opportunity')); dl.appendChild(el('dd', '', g.opportunity)); }
      if (dl.children.length) card.appendChild(dl);
      var foot = el('div', 'gcr-gap-foot');
      if (g.roi && g.roi.quantified) {
        foot.appendChild(el('strong', '', kes(g.roi.annual_low) + ' to ' + kes(g.roi.annual_high) + ' a year'));
        foot.appendChild(el('span', '', g.roi.hours_per_week_recovered + ' h/week back · ' + g.confidence + ' confidence'));
        if (g.basis) foot.appendChild(el('span', 'gcr-basis', 'How we got this: ' + g.basis));
      } else {
        foot.appendChild(el('span', '', 'Not enough figures to put a value on this one.'));
      }
      card.appendChild(foot);
      gaps.appendChild(card);
    });
    reportBox.appendChild(gaps);

    /* Areas */
    var areas = section('How each area scored');
    var grid = el('div', 'gcr-areas');
    report.areas.forEach(function (a) {
      var row = el('div', 'gcr-arearow');
      var hd = el('div', 'gcr-arearow-head');
      hd.appendChild(el('span', '', a.label));
      hd.appendChild(el('span', 'gcr-arearow-score', a.score == null ? 'Not discussed' : a.score + ' / 5'));
      row.appendChild(hd);
      if (a.score != null) {
        var bar = el('div', 'gcr-bar');
        bar.setAttribute('aria-hidden', 'true');
        var fill = el('span');
        fill.style.width = (a.score * 20) + '%';
        bar.appendChild(fill);
        row.appendChild(bar);
      }
      row.appendChild(el('p', '', a.finding));
      grid.appendChild(row);
    });
    areas.appendChild(grid);
    reportBox.appendChild(areas);

    if (report.strengths && report.strengths.length) {
      var str = section('Already working well');
      var ul = el('ul', 'gcr-list');
      report.strengths.forEach(function (s) { ul.appendChild(el('li', '', s)); });
      str.appendChild(ul);
      reportBox.appendChild(str);
    }

    /* What is not in this report */
    var next = el('section', 'gcr-next');
    next.appendChild(el('h3', '', 'What this report does not include'));
    next.appendChild(el('p', '', 'This report shows the gaps and what closing them is worth. It does not put the gaps in priority order, and it does not give a cost estimate for each opportunity.'));
    next.appendChild(el('p', 'gcr-next-ask', 'Want those details? Contact us and we will take you through them.'));
    var btns = el('div', 'btn-row');
    btns.appendChild(ctaButton('Contact us', '/contact', 'btn-primary btn-large', 'contact'));
    next.appendChild(btns);
    reportBox.appendChild(next);

    var notes = el('div', 'gcr-notes');
    (report.notes || []).forEach(function (n) { notes.appendChild(el('p', '', n)); });
    var again = el('button', 'gc-linkbtn', 'Start a new check');
    again.type = 'button';
    again.addEventListener('click', restart);
    notes.appendChild(again);
    reportBox.appendChild(notes);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function downloadPdf() {
    if (state.pdfBusy || !state.report) return;
    state.pdfBusy = true;
    var btn = $('#gc-pdf');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Preparing PDF…';
    var ready = window.SDFMGapPdf && (window.jspdf || window.jsPDF)
      ? Promise.resolve()
      : loadScript('/js/vendor/jspdf.umd.min.js').then(function () { return loadScript('/js/gap-check-pdf.js?v=3'); });
    ready.then(function () {
      return window.SDFMGapPdf.download(state.report, { name: state.name });
    }).then(function () {
      track('gap_check_pdf');
      api('event', { token: state.token, event: 'pdf_downloaded' }, 8000);
      btn.textContent = 'Downloaded. Download again';
    }).catch(function () {
      track('gap_check_error', { stage: 'pdf' });
      btn.textContent = label;
      var existing = reportBox.querySelector('.gcr-pdf-error');
      if (!existing) {
        var p = el('p', 'gcr-pdf-error', 'The PDF could not be made on this device. You can still print this page (Ctrl+P) and choose Save as PDF.');
        btn.parentNode.appendChild(p);
      }
    }).then(function () {
      state.pdfBusy = false;
      btn.disabled = false;
    });
  }

  /* ---------- resume and restart ---------- */

  function resume() {
    var token = savedToken();
    if (!token) return;
    state.token = token;
    panels.details.hidden = true;
    api('resume', { token: token }, 20000).then(function (r) {
      var d = r.data;
      if (r.status === 200 && d.ok) {
        state.name = (d.company && d.company.full_name) || '';
        state.company = (d.company && d.company.name) || '';
        if (d.report) {
          state.report = d.report;
          renderReport(d.report);
          setStage('report', true);
          return;
        }
        resetChat();
        (d.messages || []).forEach(function (m) { addMessage(m.role, m.content); });
        applyProgress(d.progress, d.ready);
        setStage('chat', true);
        return;
      }
      if (r.status === 404) store(null);
      state.token = null;
      setStage('details', true);
    });
  }

  function restart() {
    store(null);
    state.token = null; state.report = null; state.busy = false;
    resetChat();
    reportBox.textContent = '';
    form.elements.consent.checked = false;
    renderedAt = Date.now();
    setAlert(formError, '');
    setStage('details');
    form.elements.full_name.focus({ preventScroll: true });
  }

  setStage('details', true);
  if (savedToken()) resume();
})();
