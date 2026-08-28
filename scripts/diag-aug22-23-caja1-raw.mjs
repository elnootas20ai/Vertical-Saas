#!/usr/bin/env node
/** SOLO LECTURA — qué hay guardado vs qué escupe Excel (22/23 ago Tiana) */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || process.env.COUCH_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD || 'uriel12345'}`,
  ).toString('base64');

const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const DAYS = ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23'];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function bid(d) {
  return String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
}
function dayKeyOpened(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
function sumCaja1(map) {
  let e = 0;
  let t = 0;
  for (const pay of Object.values(map || {})) {
    if (!pay) continue;
    e += Number(pay.efectivo) || 0;
    t += Number(pay.tarjeta) || 0;
  }
  return { e: r2(e), t: r2(t), tot: r2(e + t) };
}
function chTot(s, ch) {
  const a = Number(s.aggregatorClosingTotals?.[ch] || 0);
  if (a > 0) return r2(a);
  return r2(Number(s.summary?.salesByChannel?.[ch] || 0));
}

async function main() {
  const res = await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=100000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);

  for (const day of DAYS) {
    const list = docs.filter(
      (d) =>
        d?.type === 'tpv_register_session'
        && bid(d) === DIS
        && dayKeyOpened(d.openedAt) === day
        && /tiana/i.test(`${d.pointOfSaleName || ''} ${d.salesPointName || ''}`),
    );
    console.log(`\n======== ${day} (${list.length}) ========`);
    for (const s of list) {
      const m = s.summary?.salesByMethod || {};
      const p = s.productClosingCounts || {};
      const c1 = s.closingBrandTpvTotals;
      const labels = s.closingBrandLabels || {};
      const sheetIds = s.closingBrandSheetIds || {};
      const storeEf = r2(m.efectivo);
      const storeTj = r2(m.tarjeta);
      const storeX = r2((m.bizum || 0) + (m.otro || 0));
      const storeVert = r2(storeEf + storeTj + storeX);
      const c1sum = sumCaja1(c1);
      const apps = r2(chTot(s, 'flipdish') + chTot(s, 'app') + chTot(s, 'ubereats') + chTot(s, 'justeat') + chTot(s, 'glovo'));

      console.log('--- session', s._id);
      console.log('pdv:', s.pointOfSaleName);
      console.log('opened:', s.openedAt, 'closed:', s.closedAt);
      console.log('workDayKey:', s.workDayKey, 'businessDayKey:', s.businessDayKey);
      console.log('store ef/tj/x/vert:', storeEf, storeTj, storeX, storeVert, '| apps:', apps, '| total:', r2(storeVert + apps));
      console.log('pizza/burger/taco:', p.pizza, p.burger, p.taco);
      console.log('closingBrandTpvTotals raw:', JSON.stringify(c1));
      console.log('caja1 sum ef+visa:', c1sum);
      console.log('delta storeVert - caja1:', r2(storeVert - c1sum.tot));
      console.log('closingBrandLabels:', JSON.stringify(labels));
      console.log('closingBrandSheetIds:', JSON.stringify(sheetIds));
      if (c1 && typeof c1 === 'object') {
        for (const [id, pay] of Object.entries(c1)) {
          console.log(
            '  marca',
            labels[id] || id,
            '→ ef',
            pay?.efectivo,
            'tj',
            pay?.tarjeta,
            'sheet',
            sheetIds[id] || '?',
          );
        }
      }
      const brandApps = s.aggregatorClosingBrandTotals || {};
      for (const ch of ['glovo', 'justeat', 'ubereats', 'flipdish', 'app']) {
        const map = brandApps[ch];
        if (!map || !Object.keys(map).length) continue;
        console.log(' appsByBrand', ch, JSON.stringify(map));
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
