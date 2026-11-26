'use strict';
const PDFDocument = require('pdfkit');
const { totals } = require('./invoices');

const ORANGE = '#ff4f1f';
const INK = '#14141a';
const MUTED = '#6b6b76';
const LINE = '#e5e5ec';

function makeMoney(currency) {
  let f;
  try {
    // "INR 1,000.00": the code is used because the built-in PDF fonts have no rupee sign.
    f = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency, currencyDisplay: 'code',
    });
  } catch (e) {
    f = null;
  }
  return (n) => (f ? f.format(n || 0).replace(/ /g, ' ') : (n || 0).toFixed(2));
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Stream a finished invoice PDF into `stream` (an HTTP response or a file). */
function renderInvoice(inv, stream) {
  const money = makeMoney(inv.currency);
  const t = totals(inv);
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'Invoice ' + inv.number } });
  doc.pipe(stream);

  const left = 48;
  const right = doc.page.width - 48;
  const width = right - left;

  // header
  doc.rect(0, 0, doc.page.width, 8).fill(ORANGE);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(28).text('INVOICE', left, 40, { characterSpacing: 1 });
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(inv.number, left, 74);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(inv.from.name, left, 44, { width, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(inv.from.email, left, 62, { width, align: 'right' });

  // parties
  const colW = (width - 24) / 2;
  let y = 120;
  const block = (label, p, x) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { characterSpacing: 1 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(p.name, x, y + 14, { width: colW });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text([p.email, p.addr].filter(Boolean).join('\n'), x, doc.y + 2, { width: colW });
    return doc.y;
  };
  const yA = block('From', inv.from, left);
  const yB = block('Billed to', inv.to, left + colW + 24);
  y = Math.max(yA, yB) + 20;

  // dates
  const dateBlock = (label, value, x) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { characterSpacing: 1 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(value || '-', x, y + 14, { width: colW });
  };
  dateBlock('Issued', fmtDate(inv.issue), left);
  dateBlock('Due', fmtDate(inv.due), left + colW + 24);
  y += 52;

  // table
  const cQty = { x: left + 250, w: 50 };
  const cRate = { x: left + 310, w: 80 };
  const cAmt = { x: left + 400, w: width - 400 };
  const head = () => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
    doc.text('DESCRIPTION', left, y, { width: 240, characterSpacing: 1 });
    doc.text('QTY', cQty.x, y, { width: cQty.w, align: 'right', characterSpacing: 1 });
    doc.text('RATE', cRate.x, y, { width: cRate.w, align: 'right', characterSpacing: 1 });
    doc.text('AMOUNT', cAmt.x, y, { width: cAmt.w, align: 'right', characterSpacing: 1 });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.7).strokeColor(LINE).stroke();
    y += 8;
  };
  head();
  doc.font('Helvetica').fontSize(10);
  const rows = inv.items.filter((it) => it.desc || it.rate);
  if (!rows.length) {
    doc.fillColor(MUTED).text('No items', left, y);
    y += 22;
  }
  rows.forEach((it) => {
    doc.font('Helvetica').fontSize(10);
    const h = Math.max(doc.heightOfString(it.desc || '-', { width: 240 }), 14);
    if (y + h + 12 > doc.page.height - 130) { doc.addPage(); y = 60; head(); doc.font('Helvetica').fontSize(10); }
    doc.fillColor(INK).text(it.desc || '-', left, y, { width: 240 });
    doc.text(String(it.qty), cQty.x, y, { width: cQty.w, align: 'right' });
    doc.text(money(it.rate), cRate.x, y, { width: cRate.w, align: 'right' });
    doc.text(money(it.qty * it.rate), cAmt.x, y, { width: cAmt.w, align: 'right' });
    y += h + 8;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(LINE).stroke();
    y += 8;
  });

  // totals
  if (y > doc.page.height - 170) { doc.addPage(); y = 60; }
  y += 6;
  const tx = left + 300;
  const tw = width - 300;
  const line = (label, value) => {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(label, tx, y, { width: tw / 2 });
    doc.fillColor(INK).text(value, tx + tw / 2, y, { width: tw / 2, align: 'right' });
    y += 18;
  };
  line('Subtotal', money(t.sub));
  if (inv.discount) line(`Discount (${inv.discount}%)`, '-' + money(t.disc));
  if (inv.taxRate) line(`${inv.taxLabel} (${inv.taxRate}%)`, money(t.tax));
  y += 4;
  doc.roundedRect(tx - 8, y - 6, tw + 16, 34, 6).fill('#ffe8de');
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text('Total', tx, y + 4, { width: tw / 2 });
  doc.text(money(t.total), tx + tw / 2, y + 4, { width: tw / 2, align: 'right' });
  y += 50;

  // notes
  if (inv.notes) {
    if (y > doc.page.height - 110) { doc.addPage(); y = 60; }
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('NOTES', left, y, { characterSpacing: 1 });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(inv.notes, left, y + 14, { width });
  }

  doc.end();
}

module.exports = { renderInvoice };
