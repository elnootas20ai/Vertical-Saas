/** SOLO LECTURA — nombres marcas Badalona JE */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const IDS = [
  'brand-96a8d7ce-e9af-459c-b8a9-48ffc55949ec',
  'brand-e99413ea-59df-4382-8a06-1d56fac890e0',
  '96a8d7ce-e9af-459c-b8a9-48ffc55949ec',
  'e99413ea-59df-4382-8a06-1d56fac890e0',
];

async function tryGet(db, id) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH },
  });
  if (!res.ok) return null;
  return res.json();
}

const dbsRes = await fetch(`${COUCH}/_all_dbs`, { headers: { Authorization: AUTH } });
const dbs = await dbsRes.json();
const brandDbs = dbs.filter((d) => /brand|bbddsaas/i.test(d));

const found = {};
for (const db of brandDbs) {
  for (const id of IDS) {
    const doc = await tryGet(db, id);
    if (doc && !doc.error) {
      found[`${db}::${id}`] = {
        name: doc.name || doc.label || doc.title,
        deliveryLineKind: doc.deliveryLineKind,
        type: doc.type,
      };
    }
  }
}

// also scan delivery for brand docs
const all = await fetch(`${COUCH}/bbddsaas-delivery/_all_docs?include_docs=true&limit=100000`, {
  headers: { Authorization: AUTH },
}).then((r) => r.json());
for (const row of all.rows || []) {
  const d = row.doc;
  if (!d) continue;
  const id = String(d._id || '');
  if (IDS.some((x) => id.includes(x.replace(/^brand-/, '')) || id === x)) {
    found[`delivery::${id}`] = { name: d.name || d.label, type: d.type, kind: d.deliveryLineKind };
  }
}

console.log(JSON.stringify({ found, brandDbs: brandDbs.slice(0, 40) }, null, 2));
