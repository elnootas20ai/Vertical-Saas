#!/usr/bin/env node
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(`${process.env.COUCHDB_USER || ''}:${process.env.COUCHDB_PASSWORD || ''}`).toString(
    'base64',
  );
const IDS = [
  'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec',
  'brand-e99413ea-59df-4382-8a06-1d56fac890e0',
];
const BUSINESS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

async function couch(path, init) {
  const res = await fetch(`${COUCH}${path}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const dbs = (await couch('/_all_dbs')).data || [];
for (const id of IDS) {
  console.log('===', id);
  for (const db of dbs) {
    const { ok, data } = await couch(`/${encodeURIComponent(db)}/${encodeURIComponent(id)}`);
    if (!ok) continue;
    console.log('FOUND', db, {
      name: data.name,
      type: data.type,
      businessId: data.businessId || data.business_id,
      shortCode: data.shortCode,
      active: data.active,
    });
  }
}

for (const db of ['bbddsaas-delivery', 'bbddsaas', 'bbddsaas-brands']) {
  const { ok, data } = await couch(`/${db}/_find`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selector: { type: 'brand_billing_config' },
      limit: 50,
    }),
  });
  if (!ok) continue;
  for (const doc of data.docs || []) {
    const bid = String(doc.business_id || doc.businessId || '').replace(/^business:/, '');
    if (bid && bid !== BUSINESS) continue;
    console.log('BILLING', db, doc._id, {
      business_id: bid,
      sheets: (doc.sheets || []).map((s) => ({
        label: s.label,
        brandIds: s.brandIds,
      })),
      sharedSplitMode: doc.sharedSplitMode,
      orphanMode: doc.orphanMode,
    });
  }
}

// name hints from catalog items
const catDbs = dbs.filter((d) => /catalog|product|delivery/i.test(d));
const nameHits = new Map();
for (const db of catDbs.slice(0, 12)) {
  const { ok, data } = await couch(
    `/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=20000`,
  );
  if (!ok) continue;
  for (const row of data.rows || []) {
    const d = row.doc;
    if (!d) continue;
    const brands = d.brandIds || d.brands || [];
    if (!Array.isArray(brands)) continue;
    for (const id of IDS) {
      if (!brands.map(String).includes(id)) continue;
      const key = `${id}::${db}`;
      const prev = nameHits.get(key) || { samples: [], count: 0 };
      prev.count += 1;
      if (prev.samples.length < 3) prev.samples.push(d.name || d.title || d._id);
      nameHits.set(key, prev);
    }
  }
}
console.log('CATALOG HITS');
for (const [k, v] of nameHits) console.log(k, v);
