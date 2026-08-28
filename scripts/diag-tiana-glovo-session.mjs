#!/usr/bin/env node
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from(`${process.env.COUCHDB_USER || process.env.COUCH_USER}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD}`).toString('base64');

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, { headers: { Authorization: AUTH } });
  return (await res.json()).rows.map((r) => r.doc).filter(Boolean);
}

const sessions = (await allDocs('bbddsaas-delivery')).filter((d) =>
  d?.type?.includes('tpv_register') && String(d._id || '').includes('5402b94c'),
);

for (const s of sessions) {
  console.log(JSON.stringify({
    id: s._id,
    day: s.workDayKey || s.openedAt,
    pdv: s.pointOfSaleName,
    glovoTotal: s.aggregatorClosingTotals?.glovo,
    glovoBrand: s.aggregatorClosingBrandTotals?.glovo,
    closingBrandSheetIds: s.closingBrandSheetIds,
    closingBrandLabels: s.closingBrandLabels,
    closingBrandTpvTotals: s.closingBrandTpvTotals,
    productClosingCounts: s.productClosingCounts,
  }, null, 2));
}

// brands config
const brands = await allDocs('brands').catch(() => allDocs('bbddsaas-brands').catch(() => []));
for (const b of brands) {
  const id = String(b._id || b.id || '');
  if (id.includes('e99413ea') || id.includes('96a8d7ce')) {
    console.log('BRAND', b._id, b.name, b.label);
  }
}
