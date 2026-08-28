#!/usr/bin/env node
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(`${process.env.COUCHDB_USER || process.env.COUCH_USER}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD}`).toString('base64');
const DAY = '2026-08-07';
const MM = 'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec';

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, { headers: { Authorization: AUTH } });
  return (await res.json()).rows.map((r) => r.doc).filter(Boolean);
}
function day(s) {
  const d = new Date(s.workDayKey || s.businessDayKey || s.openedAt || '');
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
}

const sessions = (await allDocs('bbddsaas-delivery')).filter((d) =>
  d?.type?.includes('tpv_register') && !d.deletedAt && day(d) === DAY,
);

for (const s of sessions) {
  const m = s.summary?.salesByMethod || {};
  const tpv = s.closingBrandTpvTotals || {};
  const mmTpv = tpv[MM] || {};
  const agg = s.aggregatorClosingBrandTotals || {};
  const ch = (name) => {
    const map = agg[name] || {};
    return r2(map[MM] || 0);
  };
  console.log('\n===', s.pointOfSaleName, s._id.slice(-8), '===');
  console.log('TIENDA salesByMethod:', { efectivo: m.efectivo, tarjeta: m.tarjeta, bizum: m.bizum, otro: m.otro });
  console.log('Caja1 Total MM:', mmTpv);
  console.log('Caja1 ALL brands:', JSON.stringify(tpv));
  console.log('Caja2 MM:', {
    justeat: ch('justeat'),
    ubereats: ch('ubereats'),
    glovo: ch('glovo'),
    flipdish: ch('flipdish'),
    app: ch('app'),
  });
  console.log('Caja2 ALL glovo:', agg.glovo);
  console.log('Caja2 ALL flipdish:', agg.flipdish);
  console.log('aggregatorClosingTotals:', s.aggregatorClosingTotals);
  console.log('pizzas:', s.productClosingCounts?.pizza);
  console.log('closingBrandSheetIds:', s.closingBrandSheetIds);
}

console.log('\n--- Excel manual ref (si MM Tiana ago día 7) ---');
console.log({ efectivo: 133.85, tpv: 495.19, justEat: 178.1, uber: 87.78, app: 95.6, glovo: 0 });

console.log('\n--- Foto usuario (izq real / der nuestro) ---');
console.log('real:    ef 18.9 | visa 284.83 | JE 54.48 | uber 39.15 | glovo 164.14 | flip 87.6 | total 609.1');
console.log('nuestro: ef 18.9 | visa 262.01 | JE 54.48 | uber 39.15 | glovo 164.14 | flip 67.6  | total 606.28');
