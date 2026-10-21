/* ============================================
   SDFM GROUP LIMITED — Automation Scoper PDF
   Builds the downloadable report from the report JSON with jsPDF (js/vendor/jspdf.umd.min.js).
   Loaded only when the visitor presses Download, so the page itself stays light.
   window.SDFMGapPdf.download(report, who) -> Promise that resolves once the file has been saved.
   ============================================ */

(function () {
  'use strict';

  var INK = [20, 18, 17];
  var RED = [216, 42, 16];
  var EMBER = [255, 90, 63];
  var BODY = [74, 70, 66];
  var MUTED = [106, 100, 94];
  var RULE = [220, 215, 208];
  var PAPER = [250, 248, 245];
  var WHITE = [255, 255, 255];

  var PAGE_W = 210, PAGE_H = 297, MARGIN = 18, FOOT = 16;
  var CONTENT_W = PAGE_W - MARGIN * 2;

  var CONTACT_EMAIL = 'flex@sdfmgroup.com';
  var CONTACT_PHONE = '+254 757 230 579';

  // jsPDF's built-in fonts only cover Latin-1. Map the typographic characters models like to use and
  // drop anything else, so a stray symbol never prints as a broken glyph.
  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/[‘’‛]/g, "'").replace(/[“”‟]/g, '"')
      .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[   ]/g, ' ')
      .replace(/→/g, '->').replace(/[•●]/g, '-')
      .replace(/[^\n\x20-\x7E¡-ÿ]/g, '');
  }

  function kes(n) { return 'KES ' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function build(report, who, logo) {
    var JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    var doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
    var y = 0;

    function fill(c) { doc.setFillColor(c[0], c[1], c[2]); }
    function stroke(c) { doc.setDrawColor(c[0], c[1], c[2]); }
    function ink(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function font(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); }

    function ensure(h) {
      if (y + h > PAGE_H - FOOT - 4) { doc.addPage(); y = MARGIN; }
    }

    // Writes wrapped text at the left margin (or x) and moves y down. Returns the height used.
    function para(str, o) {
      o = o || {};
      var size = o.size || 10, lh = o.lh || size * 0.5, x = o.x == null ? MARGIN : o.x, w = o.w || CONTENT_W;
      font(o.style || 'normal', size);
      ink(o.color || BODY);
      var lines = doc.splitTextToSize(clean(str), w);
      var start = y;
      for (var i = 0; i < lines.length; i++) {
        ensure(lh);
        doc.text(lines[i], x, y + size * 0.3);
        y += lh;
      }
      y += o.after == null ? 0 : o.after;
      return y - start;
    }

    function heading(str) {
      ensure(16);
      y += 5;
      font('bold', 8.5); ink(MUTED);
      doc.setCharSpace(0.6);
      doc.text(clean(str).toUpperCase(), MARGIN, y);
      doc.setCharSpace(0);
      y += 2;
      stroke(RULE); doc.setLineWidth(0.3); doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 5;
    }

    // ── Cover band ───────────────────────────────────────────────
    fill(INK); doc.rect(0, 0, PAGE_W, 50, 'F');
    fill(RED); doc.rect(0, 50, PAGE_W, 1.2, 'F');
    if (logo) {
      var lw = 34, lh = lw * (logo.h / logo.w);
      doc.addImage(logo.data, 'PNG', MARGIN, 11, lw, lh);
    } else {
      font('bold', 15); ink(WHITE); doc.text('SDFM Group', MARGIN, 20);
    }
    font('bold', 8); ink(EMBER); doc.setCharSpace(0.8);
    doc.text('AUTOMATION SCOPER', PAGE_W - MARGIN, 16, { align: 'right' });
    doc.setCharSpace(0);
    font('bold', 22); ink(WHITE);
    doc.text(clean(report.company.name).slice(0, 44), MARGIN, 36);
    font('normal', 10); ink([207, 201, 195]);
    var dateStr = new Date(report.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(clean('Gap report prepared for ' + who.name + '  |  ' + dateStr), MARGIN, 44);
    y = 62;

    // ── Readiness ────────────────────────────────────────────────
    var score = report.readiness.score;
    fill(PAPER); stroke(RULE); doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, CONTENT_W, 30, 3, 3, 'FD');
    fill(INK); doc.circle(MARGIN + 17, y + 15, 10.5, 'F');
    font('bold', 18); ink(WHITE); doc.text(String(score), MARGIN + 17, y + 17.2, { align: 'center' });
    font('bold', 12); ink(INK); doc.text(clean(report.readiness.label + ' readiness for AI'), MARGIN + 34, y + 10);
    font('normal', 9.5); ink(BODY);
    var rl = doc.splitTextToSize(clean(report.readiness.summary || report.company.summary), CONTENT_W - 40).slice(0, 4);
    for (var i = 0; i < rl.length; i++) doc.text(rl[i], MARGIN + 34, y + 16 + i * 4.4);
    y += 38;

    if (report.company.summary && report.readiness.summary) {
      para(report.company.summary, { size: 10, lh: 5, after: 2 });
    }

    // ── Projected return ─────────────────────────────────────────
    var r = report.roi;
    heading('Projected return of closing these gaps');
    if (r.quantified_gaps) {
      ensure(40);
      fill(INK); doc.roundedRect(MARGIN, y, CONTENT_W, 42, 3, 3, 'F');
      font('normal', 8.5); ink([163, 157, 151]); doc.setCharSpace(0.5);
      doc.text('VALUE PER YEAR', MARGIN + 8, y + 9); doc.setCharSpace(0);
      font('bold', 19); ink(WHITE);
      doc.text(clean(kes(r.annual_low) + '  to  ' + kes(r.annual_high)), MARGIN + 8, y + 20);
      font('normal', 9); ink([207, 201, 195]);
      doc.text(clean('Most likely ' + kes(r.annual_expected)), MARGIN + 8, y + 27);
      var cols = [
        [String(r.hours_per_week_recovered) + ' h', 'back per week'],
        [r.roi_pct_low + '% to ' + r.roi_pct_high + '%', 'first-year ROI'],
        [r.payback_months_best + ' to ' + r.payback_months_worst + ' mo', 'payback']
      ];
      var cw = (CONTENT_W - 16) / 3;
      for (var c = 0; c < cols.length; c++) {
        font('bold', 11); ink(EMBER); doc.text(clean(cols[c][0]), MARGIN + 8 + c * cw, y + 34.5);
        font('normal', 7.5); ink([163, 157, 151]); doc.text(clean(cols[c][1]), MARGIN + 8 + c * cw, y + 38.3);
      }
      y += 48;
      para('Based on ' + r.quantified_gaps + ' of the ' + report.gaps.length + ' gaps below, using the figures you gave us.', { size: 9, lh: 4.4, color: MUTED, after: 1 });
    } else {
      para('Your answers did not include enough figures (people, hours, lost sales) to put a reliable value on these gaps. A full assessment would measure them.', { size: 10, lh: 5, after: 1 });
    }

    // ── Gaps ─────────────────────────────────────────────────────
    heading('Gaps we found (' + report.gaps.length + ')');
    if (!report.gaps.length) para('No specific gaps came out of this conversation.', { size: 10, lh: 5 });
    var lastArea = null;
    report.gaps.forEach(function (g, idx) {
      var inner = CONTENT_W - 10;
      font('normal', 9.5);
      var parts = [
        { t: g.finding, s: 'normal', c: BODY },
        g.evidence ? { t: 'You told us: ' + g.evidence, s: 'italic', c: MUTED } : null,
        g.impact ? { t: 'Impact: ' + g.impact, s: 'normal', c: BODY } : null,
        g.opportunity ? { t: 'Opportunity: ' + g.opportunity, s: 'normal', c: BODY } : null
      ].filter(Boolean);
      var h = 14;
      parts.forEach(function (p) { font(p.s, 9.5); h += doc.splitTextToSize(clean(p.t), inner).length * 4.5 + 1.5; });
      h += 9;
      ensure(Math.min(h, 46));
      if (g.area_label !== lastArea) {
        lastArea = g.area_label;
        ensure(14);
        font('bold', 8); ink(RED); doc.setCharSpace(0.5);
        doc.text(clean(g.area_label).toUpperCase(), MARGIN, y + 2); doc.setCharSpace(0);
        y += 6;
      }
      var top = y;
      font('bold', 11); ink(INK);
      var titleLines = doc.splitTextToSize(clean(g.title), inner - 2);
      ensure(10 + titleLines.length * 5);
      y += 1.5;
      for (var t = 0; t < titleLines.length; t++) { doc.text(titleLines[t], MARGIN + 6, y + 3.5); y += 5; }
      y += 0.5;
      parts.forEach(function (p) {
        para(p.t, { size: 9.5, lh: 4.5, style: p.s, color: p.c, x: MARGIN + 6, w: inner, after: 1.5 });
      });
      var value = g.roi && g.roi.quantified
        ? kes(g.roi.annual_low) + ' to ' + kes(g.roi.annual_high) + ' a year  |  ' + g.roi.hours_per_week_recovered + ' h/week back'
        : 'Not enough figures to put a value on this one';
      ensure(8);
      font('bold', 9); ink(g.roi && g.roi.quantified ? RED : MUTED);
      doc.text(clean(value), MARGIN + 6, y + 3);
      y += 6;
      // Left rule alongside the card (drawn on the first page the card started on).
      fill(RED); doc.rect(MARGIN, top, 1.2, Math.max(8, y - top - 1), 'F');
      y += 4;
    });

    // ── Areas ────────────────────────────────────────────────────
    heading('How each area scored');
    report.areas.forEach(function (a) {
      var lines = doc.splitTextToSize(clean(a.finding), CONTENT_W - 50);
      ensure(10 + lines.length * 4.2);
      font('bold', 9.5); ink(INK); doc.text(clean(a.label), MARGIN, y + 3);
      font('normal', 9); ink(MUTED); doc.text(a.score == null ? 'n/a' : a.score + ' / 5', PAGE_W - MARGIN, y + 3, { align: 'right' });
      if (a.score != null) {
        fill([232, 228, 222]); doc.roundedRect(MARGIN + 95, y + 1.2, 38, 2.4, 1.2, 1.2, 'F');
        fill(INK); doc.roundedRect(MARGIN + 95, y + 1.2, 38 * (a.score / 5), 2.4, 1.2, 1.2, 'F');
      }
      y += 6;
      font('normal', 9); ink(BODY);
      for (var l = 0; l < lines.length; l++) { doc.text(lines[l], MARGIN, y + 2); y += 4.2; }
      y += 2.5;
    });

    if (report.strengths && report.strengths.length) {
      heading('Already working well');
      report.strengths.forEach(function (s) { para('-  ' + s, { size: 9.5, lh: 4.6, after: 1 }); });
    }

    // ── What this report does not include ────────────────────────
    var boxLines = doc.splitTextToSize(clean('This report lists the gaps and the value of closing them. It does not put the gaps in priority order, and it does not include a cost estimate for each opportunity. To get those details, contact us and we will take you through them.'), CONTENT_W - 14);
    var boxH = 30 + boxLines.length * 4.6;
    ensure(boxH + 6);
    y += 6;
    fill(PAPER); stroke(RULE); doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 3, 3, 'FD');
    fill(RED); doc.rect(MARGIN, y, 1.6, boxH, 'F');
    font('bold', 11.5); ink(INK); doc.text('What this report does not include', MARGIN + 8, y + 9);
    font('normal', 9.5); ink(BODY);
    for (var b = 0; b < boxLines.length; b++) doc.text(boxLines[b], MARGIN + 8, y + 16 + b * 4.6);
    var by = y + 16 + boxLines.length * 4.6 + 3;
    font('bold', 9.5); ink(INK);
    doc.text('Contact us:  sdfmgroup.com/contact', MARGIN + 8, by);
    font('normal', 9.5); ink(BODY);
    doc.text(clean('Or reach us directly:  ' + CONTACT_EMAIL + '  |  WhatsApp ' + CONTACT_PHONE), MARGIN + 8, by + 5.2);
    y += boxH + 4;

    // ── Notes ────────────────────────────────────────────────────
    (report.notes || []).forEach(function (n) { para(n, { size: 8, lh: 3.8, color: MUTED, after: 1.5 }); });

    // ── Footer on every page ─────────────────────────────────────
    var total = doc.getNumberOfPages();
    for (var p = 1; p <= total; p++) {
      doc.setPage(p);
      stroke(RULE); doc.setLineWidth(0.3); doc.line(MARGIN, PAGE_H - FOOT, PAGE_W - MARGIN, PAGE_H - FOOT);
      font('normal', 7.5); ink(MUTED);
      doc.text('SDFM Group Limited  |  sdfmgroup.com  |  Indicative figures, based on your answers', MARGIN, PAGE_H - FOOT + 5);
      doc.text(p + ' / ' + total, PAGE_W - MARGIN, PAGE_H - FOOT + 5, { align: 'right' });
    }
    return doc;
  }

  function fileName(report) {
    var slug = String(report.company.name || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'report';
    return 'sdfm-automation-scoper-' + slug + '.pdf';
  }

  window.SDFMGapPdf = {
    build: build,
    fileName: fileName,
    download: function (report, who) {
      return loadImage('/assets/logo-white.png').then(function (logo) {
        var doc = build(report, who || { name: '' }, logo);
        doc.save(fileName(report));
      });
    }
  };
})();
