#!/usr/bin/env node
/** SOLO LECTURA — MM TIANA: ¿hay Glovo Modomio en cierres? */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(`${process.env.COUCHDB_USER || process.env.COUCH_USER}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD}`).toString('base64');

const TIANA = /tiana/i;
const MM = 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec';
const BB = 'brand-e99413ea-59df-4382-8a06-1d56fac890e0';

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function day(s) {
  const raw = s.workDayKey || s.businessDayKey || s.openedAt || '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, { headers: { Authorization: AUTH } });
  return (await res.json()).rows.map((r) => r.doc).filter(Boolean);
}

const sessions = (await allDocs('bbddsaas-delivery')).filter((d) => {
  if (!d?.type?.includes('tpv_register') || d.deletedAt) return false;
  const name = `${d.pointOfSaleName || ''}`;
  return TIANA.test(name) || TIANA.test(String(d.pointOfSaleId || ''));
}).sort((a, b) => day(a).localeCompare(day(b)));

let mmGlovoDays = 0;
let bbGlovoDays = 0;
let mmGlovoSum = 0;
let bbGlovoSum = 0;

console.log('=== Días Tiana con Glovo por marca (lo que sale en MM TIANA / BB TIANA) ===');
for (const s of sessions) {
  const g = s.aggregatorClosingBrandTotals?.glovo || {};
  const mm = r2(g[MM] || g['96a8d7ce-e9af-459c-b8a9-48ffc55949ec'] || 0);
  const bb = r2(g[BB] || g['e99413ea-59df-4382-8a06-1d56fac890e0'] || 0);
  if (mm <= 0 && bb <= 0) continue;
  if (mm > 0) { mmGlovoDays += 1; mmGlovoSum = r2(mmGlovoSum + mm); }
  if (bb > 0) { bbGlovoDays += 1; bbGlovoSum = r2(bbGlovoSum + bb); }
  console.log(day(s), '| MM:', mm || '-', '| BB:', bb || '-');
}

console.log('\n=== RESUMEN (todo el historial Tiana) ===');
console.log({
  cierresTiana: sessions.length,
  diasConGlovoMM: mmGlovoDays,
  totalGlovoMM: mmGlovoSum,
  diasConGlovoBB: bbGlovoDays,
  totalGlovoBB: bbGlovoSum,
});

// Excel manual Uriel agosto (MM TIANA) — referencia
const EXCEL_AGO_MM_GLOVO = [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map((d) => ({ d, glovo: 0 }));
console.log('\nExcel manual MM TIANA agosto (Uriel): Glovo = 0 en todos los días 3-21');
