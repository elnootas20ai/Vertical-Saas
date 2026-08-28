#!/usr/bin/env node
/** SOLO LECTURA — 06 ago Badalona MM: cierre vs export */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || process.env.COUCH_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD || ''}`,
  ).toString('base64');

const DAY = '2026-08-06';
const BADALONA = /badalona|\bbdn\b/i;

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${db} ${res.status}`);
  const json = await res.json();
  return (json.rows || []).map((r) => r.doc).filter(Boolean);
}

function madridDay(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return String(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

function sessionDay(s) {
  return madridDay(s.workDayKey || s.businessDayKey || s.openedAt || s.createdAt);
}

function sumBrandTpv(map) {
  let ef = 0;
  let tj = 0;
  for (const pay of Object.values(map || {})) {
    ef += Number(pay?.efectivo) || 0;
    tj += Number(pay?.tarjeta) || 0;
  }
  return { efectivo: r2(ef), tarjeta: r2(tj) };
}

const sessions = (await allDocs('bbddsaas-delivery')).filter((d) => {
  if (!d || d.deletedAt) return false;
  if (d.type !== 'tpv_register_session' && d.type !== 'tpv_caja_session') return false;
  if (sessionDay(d) !== DAY) return false;
  const name = `${d.pointOfSaleName || ''} ${d.salesPointName || ''}`;
  return BADALONA.test(name) || BADALONA.test(String(d.pointOfSaleId || ''));
});

console.log(JSON.stringify({ day: DAY, badalonaSessions: sessions.length }, null, 2));

for (const s of sessions) {
  const m = s.summary?.salesByMethod || {};
  const brandTpv = s.closingBrandTpvTotals || {};
  const brandSum = sumBrandTpv(brandTpv);
  console.log('\n---', s._id, '---');
  console.log('pdv:', s.pointOfSaleName, s.pointOfSaleId, 'status:', s.status);
  console.log('salesByMethod (tienda total):', {
    efectivo: m.efectivo,
    tarjeta: m.tarjeta,
    bizum: m.bizum,
    otro: m.otro,
  });
  console.log('sum closingBrandTpvTotals:', brandSum);
  console.log('delta session-brand:', {
    efectivo: r2((m.efectivo || 0) - brandSum.efectivo),
    tarjeta: r2((m.tarjeta || 0) - brandSum.tarjeta),
  });
  console.log('closingBrandTpvTotals:', JSON.stringify(brandTpv, null, 2));
  console.log('closingBrandSheetIds:', s.closingBrandSheetIds);
  console.log('closingBrandLabels:', s.closingBrandLabels);
  for (const ch of ['glovo', 'flipdish', 'justeat', 'ubereats']) {
    const bt = s.aggregatorClosingBrandTotals?.[ch];
    if (bt && Object.keys(bt).length) {
      console.log(`aggregatorClosingBrandTotals.${ch}:`, bt);
    }
  }
  console.log('productClosingCounts:', s.productClosingCounts);
}
