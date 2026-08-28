#!/usr/bin/env node
/** SOLO LECTURA — Tiana MM: ¿hay Glovo en cierres? */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(`${process.env.COUCHDB_USER || process.env.COUCH_USER}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD}`).toString('base64');
const TIANA = /tiana/i;
const MONTH = process.argv[2] || '2026-08';

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, { headers: { Authorization: AUTH } });
  const json = await res.json();
  return (json.rows || []).map((r) => r.doc).filter(Boolean);
}

function day(s) {
  const raw = s.workDayKey || s.businessDayKey || s.openedAt || '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

function glovoByBrand(s) {
  const map = s.aggregatorClosingBrandTotals?.glovo || {};
  const entries = Object.entries(map).filter(([, v]) => Number(v) > 0);
  const sum = r2(entries.reduce((a, [, v]) => a + Number(v), 0));
  return { entries, sum };
}

function glovoTotal(s) {
  return r2(Number(s.aggregatorClosingTotals?.glovo || 0));
}

const sessions = (await allDocs('bbddsaas-delivery')).filter((d) => {
  if (!d?.type?.includes('tpv_register') || d.deletedAt) return false;
  if (!day(d).startsWith(MONTH)) return false;
  const name = `${d.pointOfSaleName || ''} ${d.salesPointName || ''}`;
  return TIANA.test(name) || TIANA.test(String(d.pointOfSaleId || ''));
}).sort((a, b) => day(a).localeCompare(day(b)));

console.log(JSON.stringify({ month: MONTH, tianaSessions: sessions.length }, null, 2));
console.log('día | glovoTotal | glovoPorMarca | mmLabels | id');

let daysWithGlovoTotal = 0;
let daysWithGlovoBrand = 0;

for (const s of sessions) {
  const d = day(s);
  const gt = glovoTotal(s);
  const gb = glovoByBrand(s);
  if (gt > 0) daysWithGlovoTotal += 1;
  if (gb.sum > 0) daysWithGlovoBrand += 1;
  if (gt > 0 || gb.sum > 0) {
    console.log(
      d,
      '| total:', gt,
      '| porMarca:', gb.sum,
      gb.entries.length ? JSON.stringify(Object.fromEntries(gb.entries)) : '{}',
      '|', String(s._id).slice(-12),
    );
  }
}

console.log('\nResumen:', {
  diasConGlovoTotal: daysWithGlovoTotal,
  diasConGlovoPorMarca: daysWithGlovoBrand,
  diasSinGlovoEnExcel: daysWithGlovoTotal - daysWithGlovoBrand,
});
