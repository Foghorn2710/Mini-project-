'use strict';
const fs = require('fs');
const crypto = require('crypto');
const config = require('./config');

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];
const STATUSES = ['Draft', 'Sent', 'Paid'];

const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const num = (v, min, max, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : '');

/** Clean up untrusted invoice input into a known shape. */
function sanitize(raw) {
  const i = raw && typeof raw === 'object' ? raw : {};
  const party = (p) => ({
    name: str(p && p.name, 120),
    email: str(p && p.email, 120),
    addr: str(p && p.addr, 400),
  });
  const items = (Array.isArray(i.items) ? i.items : []).slice(0, 200).map((it) => ({
    desc: str(it && it.desc, 300),
    qty: num(it && it.qty, 0, 1e6),
    rate: num(it && it.rate, 0, 1e9),
  }));
  return {
    from: party(i.from),
    to: party(i.to),
    number: str(i.number, 40) || 'INV-0001',
    issue: date(i.issue),
    due: date(i.due),
    currency: CURRENCIES.includes(i.currency) ? i.currency : 'INR',
    taxLabel: str(i.taxLabel, 30) || 'Tax',
    taxRate: num(i.taxRate, 0, 100),
    discount: num(i.discount, 0, 100),
    notes: str(i.notes, 1000),
    items,
  };
}

function totals(inv) {
  const sub = inv.items.reduce((s, it) => s + it.qty * it.rate, 0);
  const disc = (sub * inv.discount) / 100;
  const base = sub - disc;
  const tax = (base * inv.taxRate) / 100;
  return { sub, disc, tax, total: base + tax };
}

/* ---------- tiny JSON file store ---------- */
let records = [];

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(config.invoicesFile, 'utf8'));
    records = Array.isArray(data) ? data : [];
  } catch (e) {
    records = [];
  }
}

function save() {
  const tmp = config.invoicesFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2));
  fs.renameSync(tmp, config.invoicesFile); // atomic replace
}

const list = () => records;

/** Create an invoice, or update the one that has the same invoice number. */
function upsert(raw) {
  const inv = sanitize(raw);
  const existing = records.find((r) => r.inv.number === inv.number);
  if (existing) {
    existing.inv = inv;
    existing.updated = Date.now();
    save();
    return existing;
  }
  const rec = { id: crypto.randomBytes(8).toString('hex'), status: 'Draft', inv, updated: Date.now() };
  records.unshift(rec);
  save();
  return rec;
}

function setStatus(id, status) {
  const rec = records.find((r) => r.id === id);
  if (!rec || !STATUSES.includes(status)) return null;
  rec.status = status;
  rec.updated = Date.now();
  save();
  return rec;
}

function remove(id) {
  const n = records.length;
  records = records.filter((r) => r.id !== id);
  if (records.length !== n) save();
  return records.length !== n;
}

module.exports = { sanitize, totals, load, list, upsert, setStatus, remove, STATUSES };
