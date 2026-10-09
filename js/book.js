/* ============================================
   SDFM GROUP LIMITED — Booking page (/book)

   Flow: details -> pick a time -> done (+ optional prep questions).
   The page never touches the database. It calls four Supabase Edge Functions
   (booking-info, booking-start, booking-confirm, booking-prep) that validate,
   check availability and write server-side.
   ============================================ */

(function () {
  'use strict';

  var API = 'https://kvlietqeafjtwojkqnqa.supabase.co/functions/v1/';
  // Public anon key (same one the analytics tracker uses). It only lets the
  // browser call these functions; it grants no database access.
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2bGlldHFlYWZqdHdvamtxbnFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNzM0MDQsImV4cCI6MjEwMzk0OTQwNH0.S_TbT7Fnm83PCdrUoiNksgvtZaSDaDjoALnJzA8NoGk';
  var WHATSAPP_NUMBER = '254757230579';
  var STORAGE_KEY = 'sdfm_booking';
  // LinkedIn conversion fired when a call is booked (previously: a qualified lead).
  // To also count "contact details saved", create a second conversion in Campaign
  // Manager and put its id in LINKEDIN_CONTACT_CONVERSION_ID.
  var LINKEDIN_BOOKED_CONVERSION_ID = 31302201;
  var LINKEDIN_CONTACT_CONVERSION_ID = null;

  // Option values must match supabase/functions/_shared/booking.ts.
  var QUESTIONS = [
    { key: 'q1', text: "What is your company's approximate annual revenue?", options: [
      ['below_10m', 'Below KES 10 million'], ['10m_50m', 'KES 10 million – 50 million'],
      ['50m_100m', 'KES 50 million – 100 million'], ['100m_500m', 'KES 100 million – 500 million'],
      ['above_500m', 'Above KES 500 million'] ] },
    { key: 'q2', text: 'What best describes your current business challenge?', options: [
      ['curious', 'Curious about AI, no specific problem'], ['process_issue', "A process that isn't working well"],
      ['tried_fix', "Tried to fix a problem, solutions haven't worked"],
      ['costly_manual', 'A manual process is costing us significant time or money and we need it fixed'] ] },
    { key: 'q3', text: 'What is your role in this decision?', options: [
      ['researcher', "I'm researching options on behalf of someone else"],
      ['influencer', 'I influence the decision but need approval from someone above me'],
      ['decision_maker', "I'm the decision-maker with budget authority"] ] },
    { key: 'q4', text: 'What matters most to you in this project?', options: [
      ['lowest_price', 'Getting the lowest possible price'], ['speed', 'Getting it done as fast as possible'],
      ['tailored', 'Getting a solution tailored to how my business actually operates'],
      ['results', 'Achieving measurable results — time saved, costs reduced or revenue increased'] ] },
    { key: 'q5', text: 'How soon are you looking to get started?', options: [
      ['exploring', 'Just exploring — no specific timeline'], ['3_6_months', 'Within the next 3 to 6 months'],
      ['1_3_months', 'Within the next 1 to 3 months'], ['asap', 'As soon as possible'] ] },
  ];

  var COMMON_TIMEZONES = [
    'Africa/Nairobi', 'Africa/Kampala', 'Africa/Dar_es_Salaam', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Cairo',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore',
    'Asia/Shanghai', 'Australia/Sydney', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC',
  ];

  /* ---------- Time zone helpers (pure; exposed for testing) ---------- */

  var dtfCache = {};
  function partsFormatter(zone) {
    if (!dtfCache[zone]) {
      dtfCache[zone] = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    }
    return dtfCache[zone];
  }

  // Minutes east of UTC that `zone` is at the given instant.
  function zoneOffsetMinutes(utcMs, zone) {
    var map = {};
    partsFormatter(zone).formatToParts(new Date(utcMs)).forEach(function (p) { map[p.type] = p.value; });
    var asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour % 24, +map.minute, +map.second);
    return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
  }

  // 'YYYY-MM-DD' + 'HH:MM' read as wall-clock time in `zone` -> epoch ms.
  function zonedToUtcMs(dateStr, timeStr, zone) {
    var d = dateStr.split('-').map(Number);
    var t = timeStr.split(':').map(Number);
    var guess = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
    var offset = zoneOffsetMinutes(guess, zone);
    var utc = guess - offset * 60000;
    var offset2 = zoneOffsetMinutes(utc, zone);
    if (offset2 !== offset) utc = guess - offset2 * 60000;
    return utc;
  }

  function isoDateIn(utcMs, zone) {
    var map = {};
    partsFormatter(zone).formatToParts(new Date(utcMs)).forEach(function (p) { map[p.type] = p.value; });
    return map.year + '-' + map.month + '-' + map.day;
  }

  function formatTime(utcMs, zone) {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(utcMs));
  }
  function formatDayShort(utcMs, zone) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(utcMs));
  }
  function dayParts(utcMs, zone) {
    var out = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' })
      .formatToParts(new Date(utcMs)).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }
  function formatDayLong(utcMs, zone) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(utcMs));
  }
  function zoneLabel(zone) {
    var abbr = '';
    try {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date());
      parts.forEach(function (p) { if (p.type === 'timeZoneName') abbr = p.value; });
    } catch (e) { /* ignore */ }
    return zone.replace(/_/g, ' ') + (abbr ? ' (' + abbr + ')' : '');
  }

  function icsStamp(ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }

  function buildIcs(startMs, minutes, summary, description, location, uid) {
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SDFM Group Limited//Booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid + '@sdfmgroup.com',
      'DTSTAMP:' + icsStamp(Date.now()),
      'DTSTART:' + icsStamp(startMs),
      'DTEND:' + icsStamp(startMs + minutes * 60000),
      'SUMMARY:' + icsEscape(summary),
      'DESCRIPTION:' + icsEscape(description),
      'LOCATION:' + icsEscape(location),
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:SDFM discovery call in 30 minutes', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
  }

  function detectSource(search, referrer) {
    var params = new URLSearchParams(search || '');
    var explicit = params.get('source');
    var utm = params.get('utm_source');
    if (explicit) return explicit.slice(0, 60);
    if (utm) {
      var map = { linkedin: 'LinkedIn', facebook: 'Facebook', twitter: 'Twitter', instagram: 'Instagram', google: 'Google', email: 'Email', whatsapp: 'WhatsApp' };
      return (map[utm.toLowerCase()] || utm).slice(0, 60);
    }
    var ref = (referrer || '').toLowerCase();
    if (ref.indexOf('linkedin.com') > -1) return 'LinkedIn';
    if (ref.indexOf('facebook.com') > -1 || ref.indexOf('fb.com') > -1) return 'Facebook';
    if (ref.indexOf('twitter.com') > -1 || ref.indexOf('x.com') > -1 || ref.indexOf('t.co/') > -1) return 'Twitter';
    if (ref.indexOf('instagram.com') > -1) return 'Instagram';
    if (ref.indexOf('google.') > -1) return 'Google';
    return 'Website';
  }

  var helpers = {
    zoneOffsetMinutes: zoneOffsetMinutes, zonedToUtcMs: zonedToUtcMs, isoDateIn: isoDateIn,
    formatTime: formatTime, formatDayShort: formatDayShort, dayParts: dayParts, buildIcs: buildIcs, detectSource: detectSource,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers; // Node tests
  if (typeof document === 'undefined' || !document.getElementById('book-app')) return;

  /* ---------- Analytics ---------- */
  // Events carry no personal data: step numbers, durations, option values and the
  // lead id (only so a visit can be tied to the lead it produced).
  function track(type, props) {
    try {
      if (window.sdfm && window.sdfm.__loaded && window.sdfm.track) window.sdfm.track(type, props || {});
      else { window.sdfmq = window.sdfmq || []; window.sdfmq.push(['track', type, props || {}]); }
    } catch (e) { /* analytics must never break the page */ }
  }

  // Ad-platform events. These only exist once the visitor has accepted cookies.
  function adEvent(kind) {
    try {
      if (kind === 'contact') {
        if (typeof window.fbq === 'function') window.fbq('track', 'Lead');
        if (LINKEDIN_CONTACT_CONVERSION_ID && typeof window.lintrk === 'function') window.lintrk('track', { conversion_id: LINKEDIN_CONTACT_CONVERSION_ID });
      } else if (kind === 'booked') {
        if (typeof window.fbq === 'function') window.fbq('track', 'Schedule');
        if (typeof window.lintrk === 'function') window.lintrk('track', { conversion_id: LINKEDIN_BOOKED_CONVERSION_ID });
      }
    } catch (e) { /* ignore */ }
  }

  /* ---------- State ---------- */
  var root = document.getElementById('book-app');
  var views = {};
  Array.prototype.forEach.call(root.querySelectorAll('[data-view]'), function (el) { views[el.getAttribute('data-view')] = el; });
  var stepsEl = document.getElementById('book-steps');

  var state = {
    leadId: null, token: null, firstName: '', email: '',
    config: { duration_minutes: 30, team_timezone: 'Africa/Nairobi' },
    slots: {},                       // { 'YYYY-MM-DD': ['09:00', ...] } in team time
    zone: detectZone(),
    selectedDate: null, selectedTime: null,
    openedAt: Date.now(), stepStartedAt: Date.now(), started: false,
    booking: null,                   // server response once booked
    answers: {},
  };

  function detectZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi'; } catch (e) { return 'Africa/Nairobi'; }
  }

  function saveSession() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ leadId: state.leadId, token: state.token })); } catch (e) { /* ignore */ }
  }
  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { return null; }
  }
  function clearSession() { try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ } }

  function whatsappLink(text) {
    return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text || "Hi SDFM, I'd like to talk about a free AI Gap Assessment.");
  }

  /* ---------- API ---------- */
  function call(name, body) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 25000) : null;
    return fetch(API + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
      body: JSON.stringify(body || {}),
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { status: res.status, data: data }; });
    }).catch(function () {
      return { status: 0, data: { error: 'network' } };
    }).then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  /* ---------- View helpers ---------- */
  function show(name, step) {
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
    var showSteps = name === 'details' || name === 'time' || name === 'done';
    stepsEl.hidden = !showSteps;
    if (showSteps) {
      var n = name === 'details' ? 1 : name === 'time' ? 2 : 3;
      Array.prototype.forEach.call(stepsEl.children, function (li) {
        var s = +li.getAttribute('data-step');
        li.className = s === n ? 'active' : s < n ? 'done' : '';
        if (s === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
      track('form_step_view', { step: String(step || n) });
      state.stepStartedAt = Date.now();
    }
    var heading = views[name].querySelector('.book-title');
    if (heading && name !== 'loading') { try { heading.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    var top = root.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.5) root.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  function showMessage(title, body, opts) {
    opts = opts || {};
    document.getElementById('message-title').textContent = title;
    document.getElementById('message-body').textContent = body;
    document.getElementById('message-wa').href = whatsappLink(opts.waText);
    var retry = document.getElementById('message-retry');
    retry.hidden = !opts.onRetry;
    retry.onclick = opts.onRetry || null;
    show('message');
  }

  function setError(name, text) {
    var el = root.querySelector('[data-error-for="' + name + '"]');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    var field = el.closest('.book-field');
    if (field) field.classList.toggle('has-error', !!text);
    var input = field && field.querySelector('input, textarea');
    if (input) { if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
  }

  function markStarted() {
    if (state.started) return;
    state.started = true;
    track('form_start');
  }

  var networkMessage = ['We could not reach the booking system', 'Check your connection and try again, or message us on WhatsApp and we will book you in by hand.'];

  /* ---------- Step 1: details ---------- */
  var detailsForm = document.getElementById('details-form');

  Array.prototype.forEach.call(detailsForm.elements, function (el) {
    el.addEventListener('input', function () { markStarted(); setError(el.name, ''); setError('form', ''); });
  });

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validateDetails() {
    var f = detailsForm.elements, errors = {};
    if (f.full_name.value.trim().length < 2) errors.full_name = 'Please enter your full name.';
    if (!f.company_name.value.trim()) errors.company_name = 'Please enter your company name.';
    if (!EMAIL_RE.test(f.email.value.trim())) errors.email = 'Please enter a valid email address.';
    var digits = f.phone.value.replace(/\D/g, '');
    if (!/^[0-9+()\-.\s]+$/.test(f.phone.value.trim()) || digits.length < 7 || digits.length > 15) errors.phone = 'Please enter a valid phone number.';
    return errors;
  }

  detailsForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var errors = validateDetails();
    ['full_name', 'company_name', 'email', 'phone'].forEach(function (k) { setError(k, errors[k]); });
    setError('form', '');
    var firstBad = Object.keys(errors)[0];
    if (firstBad) { detailsForm.elements[firstBad].focus(); return; }

    var btn = detailsForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving…';
    var f = detailsForm.elements;

    call('booking-start', {
      full_name: f.full_name.value, company_name: f.company_name.value, email: f.email.value,
      phone: f.phone.value, has_whatsapp: f.has_whatsapp.checked, challenge_notes: f.challenge_notes.value,
      website: f.website.value, timezone: state.zone, source: detectSource(location.search, document.referrer),
    }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Continue: pick a time';
      var d = r.data || {};
      if (r.status === 200 && d.lead_id) {
        state.leadId = d.lead_id; state.token = d.token;
        state.firstName = f.full_name.value.trim().split(/\s+/)[0];
        state.email = f.email.value.trim();
        saveSession();
        track('form_step_complete', { step: '1', duration_ms: Date.now() - state.stepStartedAt });
        track('form_lead_captured', { lead_id: state.leadId });
        adEvent('contact');
        loadTimes();
      } else if (r.status === 400 && d.fields) {
        Object.keys(d.fields).forEach(function (k) { setError(k, d.fields[k]); });
        var first = Object.keys(d.fields)[0];
        if (detailsForm.elements[first]) detailsForm.elements[first].focus();
      } else if (r.status === 409 && d.error === 'already_booked') {
        track('form_error', { stage: 'already_booked' });
        showMessage('You already have a call booked', 'A discovery call is already booked with this email address. Check your inbox for the confirmation, or message us on WhatsApp if you need to change the time.', { waText: 'Hi SDFM, I already booked a call and need to change it.' });
      } else if (r.status === 429) {
        track('form_error', { stage: 'rate_limited' });
        setError('form', 'Too many attempts. Please wait a few minutes, or message us on WhatsApp.');
      } else {
        track('form_error', { stage: 'start' });
        setError('form', 'Something went wrong on our side. Please try again, or message us on WhatsApp.');
      }
    });
  });

  /* ---------- Step 2: pick a time ---------- */
  var daysEl = document.getElementById('book-days');
  var timesEl = document.getElementById('book-times');
  var tzSelect = document.getElementById('f-tz');
  var confirmBtn = document.getElementById('confirm-btn');

  function loadTimes() {
    show('loading');
    call('booking-info', { lead_id: state.leadId, token: state.token }).then(function (r) {
      if (r.status !== 200 || !r.data.slots) {
        showMessage.apply(null, networkMessage.concat([{ onRetry: loadTimes }]));
        return;
      }
      state.config = r.data.config || state.config;
      state.slots = r.data.slots;
      state.selectedDate = null; state.selectedTime = null;
      buildTzSelect();
      renderDays();
      document.getElementById('time-greeting').textContent =
        (state.firstName ? 'Thanks, ' + state.firstName + '. ' : '') +
        'Pick a day and time for your ' + state.config.duration_minutes + '-minute call on Google Meet.';
      show('time', 2);
    });
  }

  function buildTzSelect() {
    var zones = COMMON_TIMEZONES.slice();
    if (zones.indexOf(state.zone) === -1) zones.unshift(state.zone);
    tzSelect.innerHTML = '';
    zones.forEach(function (z) {
      var o = document.createElement('option');
      o.value = z; o.textContent = zoneLabel(z);
      if (z === state.zone) o.selected = true;
      tzSelect.appendChild(o);
    });
  }
  tzSelect.addEventListener('change', function () {
    state.zone = tzSelect.value;
    renderTimes();
    updateSummary();
  });

  function slotMs(date, time) { return zonedToUtcMs(date, time, state.config.team_timezone); }

  function renderDays() {
    var dates = Object.keys(state.slots).sort();
    var empty = document.getElementById('time-empty');
    var picker = document.getElementById('time-picker');
    daysEl.innerHTML = ''; timesEl.innerHTML = '';
    document.getElementById('time-label').hidden = true;
    empty.hidden = dates.length > 0;
    picker.hidden = dates.length === 0;
    document.getElementById('time-empty-wa').href = whatsappLink('Hi SDFM, I tried to book a discovery call but there were no open times. Can we find a time?');
    confirmBtn.hidden = dates.length === 0;
    confirmBtn.disabled = true;
    document.getElementById('time-summary').hidden = true;

    dates.forEach(function (date) {
      var ms = slotMs(date, state.slots[date][0]);
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'book-day'; b.setAttribute('aria-pressed', 'false'); b.dataset.date = date;
      var p = dayParts(ms, state.config.team_timezone);
      b.innerHTML = '<small></small><strong></strong>';
      b.querySelector('small').textContent = p.weekday + ' · ' + p.month;
      b.querySelector('strong').textContent = p.day;
      b.setAttribute('aria-label', formatDayLong(ms, state.config.team_timezone));
      b.addEventListener('click', function () { selectDate(date); });
      daysEl.appendChild(b);
    });
  }

  function selectDate(date) {
    markStarted();
    state.selectedDate = date; state.selectedTime = null;
    Array.prototype.forEach.call(daysEl.children, function (b) { b.setAttribute('aria-pressed', b.dataset.date === date ? 'true' : 'false'); });
    confirmBtn.disabled = true;
    document.getElementById('time-label').hidden = false;
    renderTimes();
    updateSummary();
    var firstTime = timesEl.querySelector('.book-time');
    if (firstTime && window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
      timesEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function renderTimes() {
    timesEl.innerHTML = '';
    if (!state.selectedDate) return;
    (state.slots[state.selectedDate] || []).forEach(function (time) {
      var ms = slotMs(state.selectedDate, time);
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'book-time'; b.dataset.time = time;
      b.setAttribute('aria-pressed', state.selectedTime === time ? 'true' : 'false');
      var sameDay = isoDateIn(ms, state.zone) === state.selectedDate;
      b.textContent = formatTime(ms, state.zone);
      if (!sameDay) {
        var s = document.createElement('small'); s.textContent = formatDayShort(ms, state.zone); b.appendChild(s);
      }
      b.addEventListener('click', function () { selectTime(time); });
      timesEl.appendChild(b);
    });
  }

  function selectTime(time) {
    markStarted();
    state.selectedTime = time;
    track('form_slot_selected');
    Array.prototype.forEach.call(timesEl.children, function (b) { b.setAttribute('aria-pressed', b.dataset.time === time ? 'true' : 'false'); });
    confirmBtn.disabled = false;
    updateSummary();
  }

  function updateSummary() {
    var el = document.getElementById('time-summary');
    if (!state.selectedDate || !state.selectedTime) { el.hidden = true; return; }
    var ms = slotMs(state.selectedDate, state.selectedTime);
    el.textContent = formatDayLong(ms, state.zone) + ' at ' + formatTime(ms, state.zone) + ' (' + state.config.duration_minutes + ' min)';
    el.hidden = false;
  }

  confirmBtn.addEventListener('click', function () {
    if (!state.selectedDate || !state.selectedTime) return;
    setError('time', '');
    confirmBtn.disabled = true; confirmBtn.textContent = 'Booking…';
    call('booking-confirm', {
      lead_id: state.leadId, token: state.token, date: state.selectedDate, time: state.selectedTime, timezone: state.zone,
    }).then(function (r) {
      confirmBtn.textContent = 'Confirm my call';
      var d = r.data || {};
      if (r.status === 200 && d.ok) {
        track('form_step_complete', { step: '2', duration_ms: Date.now() - state.stepStartedAt });
        track('form_submit', { lead_id: state.leadId, duration_ms: Date.now() - state.openedAt });
        adEvent('booked');
        state.booking = d;
        showDone(true);
      } else if (r.status === 409 && d.error === 'slot_unavailable') {
        track('form_error', { stage: 'slot_taken' });
        loadTimes();
        setTimeout(function () { setError('time', 'Sorry, that time was just taken. Here are the times that are still open.'); }, 400);
      } else if (r.status === 409 && d.error === 'already_booked') {
        resume();
      } else if (r.status === 429) {
        confirmBtn.disabled = false;
        setError('time', 'Too many attempts. Please wait a few minutes, or message us on WhatsApp.');
      } else {
        track('form_error', { stage: 'confirm' });
        confirmBtn.disabled = false;
        setError('time', 'We could not book that time. Please try again, or message us on WhatsApp.');
      }
    });
  });

  /* ---------- Step 3: done ---------- */
  function showDone(justBooked, info) {
    var b = state.booking;
    var startMs = Date.parse(b.starts_at);
    var minutes = b.duration_minutes || state.config.duration_minutes;

    document.getElementById('done-title').textContent = (state.firstName ? "You're booked, " + state.firstName : "You're booked");
    document.getElementById('done-sub').textContent = justBooked && state.email
      ? 'A confirmation is on its way to ' + state.email + '.'
      : 'Your discovery call is confirmed.';
    document.getElementById('done-when').textContent = b.local_day + ' at ' + b.local_time + ' (' + b.local_zone + ')';
    document.getElementById('done-length').textContent = minutes + ' minutes';

    var where = document.getElementById('done-where');
    where.textContent = '';
    if (b.meeting_link) {
      var a = document.createElement('a');
      a.href = b.meeting_link; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = 'Join on Google Meet'; where.appendChild(a);
    } else {
      where.textContent = 'Google Meet (we will email you the link)';
    }

    var gcal = document.getElementById('done-gcal');
    gcal.href = b.calendar_link || '#'; gcal.hidden = !b.calendar_link;
    document.getElementById('done-wa').href = whatsappLink("Hi SDFM, I have a question about my booked call.");

    document.getElementById('done-ics').onclick = function () {
      var ics = buildIcs(startMs, minutes, 'SDFM discovery call',
        'Free AI Gap Assessment call with SDFM Group.' + (b.meeting_link ? '\nJoin: ' + b.meeting_link : '\nWe will email you the meeting link.'),
        b.meeting_link || 'Google Meet', state.leadId || String(startMs));
      var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url; link.download = 'sdfm-discovery-call.ics';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      track('click', { kind: 'button', label: 'download_ics' });
    };

    var prepDone = info && info.prep_done;
    document.getElementById('prep').hidden = !!prepDone;
    document.getElementById('prep-thanks').hidden = !prepDone;
    if (!prepDone) { renderPrep(); track('prep_view'); }

    show('done', 3);
    if (info && info.focusPrep && !prepDone) {
      setTimeout(function () { document.getElementById('prep-title').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
    }
  }

  function renderPrep() {
    var form = document.getElementById('prep-form');
    if (form.childElementCount) return;
    QUESTIONS.forEach(function (q, i) {
      var fs = document.createElement('fieldset');
      var lg = document.createElement('legend');
      var num = document.createElement('span'); num.textContent = (i + 1) + '.';
      lg.appendChild(num); lg.appendChild(document.createTextNode(q.text));
      fs.appendChild(lg);
      q.options.forEach(function (o) {
        var label = document.createElement('label'); label.className = 'book-option';
        var input = document.createElement('input'); input.type = 'radio'; input.name = q.key; input.value = o[0];
        input.addEventListener('change', function () {
          state.answers[q.key] = o[0];
          track('form_answer', { q: q.key, value: o[0] });
          document.getElementById('prep-send').disabled = false;
        });
        label.appendChild(input); label.appendChild(document.createTextNode(o[1]));
        fs.appendChild(label);
      });
      form.appendChild(fs);
    });
  }

  function finishPrep() {
    document.getElementById('prep').hidden = true;
    document.getElementById('prep-thanks').hidden = false;
  }

  document.getElementById('prep-send').addEventListener('click', function () {
    var btn = this;
    setError('prep', '');
    btn.disabled = true; btn.textContent = 'Sending…';
    call('booking-prep', { lead_id: state.leadId, token: state.token, answers: state.answers }).then(function (r) {
      btn.textContent = 'Send my answers';
      if (r.status === 200 && r.data.ok) {
        track('prep_complete', { answered: String(Object.keys(state.answers).length) });
        finishPrep();
      } else {
        btn.disabled = false;
        setError('prep', 'We could not save your answers. Please try again, or skip this for now.');
      }
    });
  });
  document.getElementById('prep-skip').addEventListener('click', function () {
    track('prep_skip');
    document.getElementById('prep').hidden = true;
  });

  /* ---------- Resume (links in emails, page refresh) ---------- */
  function resume(focusPrep) {
    show('loading');
    call('booking-info', { lead_id: state.leadId, token: state.token }).then(function (r) {
      if (r.status !== 200) { showMessage.apply(null, networkMessage.concat([{ onRetry: function () { resume(focusPrep); } }])); return; }
      var lead = r.data.lead;
      if (!lead) { clearSession(); state.leadId = null; state.token = null; startFresh(); return; }
      state.config = r.data.config || state.config;
      state.slots = r.data.slots || {};
      state.firstName = lead.first_name || '';
      if (lead.booked) {
        var start = zonedToUtcMs(lead.scheduled_date, lead.scheduled_time, state.config.team_timezone);
        var zone = state.zone;
        state.booking = {
          starts_at: new Date(start).toISOString(), duration_minutes: state.config.duration_minutes,
          local_day: formatDayLong(start, zone), local_time: formatTime(start, zone),
          local_zone: zoneLabel(zone).replace(/^.*\((.*)\)$/, '$1'),
          meeting_link: lead.meeting_link, calendar_link: lead.calendar_link,
        };
        showDone(false, { prep_done: lead.prep_done, focusPrep: focusPrep });
      } else {
        buildTzSelect(); renderDays();
        document.getElementById('time-greeting').textContent =
          (state.firstName ? 'Welcome back, ' + state.firstName + '. ' : '') +
          'Pick a day and time for your ' + state.config.duration_minutes + '-minute call on Google Meet.';
        track('form_resume');
        show('time', 2);
      }
    });
  }
  function startFresh() {
    track('form_view');
    show('details', 1);
  }

  /* ---------- Boot ---------- */
  (function init() {
    var params = new URLSearchParams(location.search);
    var urlLead = params.get('lead'), urlToken = params.get('t');
    var stored = loadSession();

    // Keep the secret token out of the address bar, history and any shared URL.
    if (urlLead || urlToken) {
      try {
        var clean = new URL(location.href);
        clean.searchParams.delete('lead'); clean.searchParams.delete('t'); clean.searchParams.delete('prep');
        history.replaceState(history.state, '', clean.pathname + clean.search + clean.hash);
      } catch (e) { /* ignore */ }
    }

    if (urlLead && urlToken) {
      state.leadId = urlLead; state.token = urlToken; saveSession();
      track('form_view');
      resume(params.get('prep') === '1');
    } else if (stored && stored.leadId && stored.token) {
      state.leadId = stored.leadId; state.token = stored.token;
      track('form_view');
      resume(false);
    } else {
      startFresh();
    }
  })();
})();
