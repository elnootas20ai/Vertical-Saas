const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const ID = 'tpvreg-f7965d40-fd87-408c-b79c-9d6dbbcf8021';
const res = await fetch(COUCH + '/bbddsaas-delivery/' + ID, { headers: { Authorization: AUTH } });
const s = await res.json();
const brands = await fetch(COUCH + '/bbddsaas-brands/_all_docs?include_docs=true&limit=5000', { headers: { Authorization: AUTH } }).then(r=>r.json()).catch(()=>({rows:[]}));
const brandNames = {};
for (const row of brands.rows || []) {
  const d = row.doc; if (!d) continue;
  brandNames[d._id] = d.name || d.label || d._id;
  if (d.id) brandNames[d.id] = d.name || d.label;
}
console.log(JSON.stringify({
  aggregatorClosingBrandTotals: s.aggregatorClosingBrandTotals || null,
  salesByChannel: s.salesByChannel || null,
  productClosingCounts: s.productClosingCounts,
  summary: s.summary,
  expectedCash: s.expectedCash ?? s.summary?.expectedCash,
  countedCash: s.countedCash ?? s.summary?.countedCash,
  brandNameHints: brandNames,
}, null, 2));
