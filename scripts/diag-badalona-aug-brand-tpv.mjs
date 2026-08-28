#!/usr/bin/env node
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(`${process.env.COUCHDB_USER || process.env.COUCH_USER}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD}`).toString('base64');
const BADALONA = /badalona|\bbdn\b/i;
const MONTH = '2026-08';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, { headers: { Authorization: AUTH } });
  const json = await res.json();
  return (json.rows || []).map((r) => r.doc).filter(Boolean);
}
function day(s) {
  const raw = s.workDayKey || s.businessDayKey || s.openedAt || '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? String(raw).slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}
function sumTpv(map) {
  let e = 0, t = 0;
  for (const p of Object.values(map || {})) { e += Number(p?.efectivo) || 0; t += Number(p?.tarjeta) || 0; }
  return { e, t };
}

const sessions = (await allDocs('bbddsaas-delivery')).filter((d) => {
  if (!d || d.deletedAt || d.type !== 'tpv_register_session') return false;
  if (!day(d).startsWith(MONTH)) return false;
  return BADALONA.test(`${d.pointOfSaleName || ''}`) || BADALONA.test(String(d.pointOfSaleId || ''));
});

for (const s of sessions.sort((a, b) => day(a).localeCompare(day(b)))) {
  const m = s.summary?.salesByMethod || {};
  const bt = sumTpv(s.closingBrandTpvTotals);
  console.log(day(s), 'ef', m.efectivo, 'tj', m.tarjeta, '| brand ef', bt.e, 'brand tj', bt.t, '| delta ef', (m.efectivo||0)-bt.e, 'delta tj', (m.tarjeta||0)-bt.t, '| hasBrandTpv', bt.e>0||bt.t>0, s._id.slice(-8));
}
