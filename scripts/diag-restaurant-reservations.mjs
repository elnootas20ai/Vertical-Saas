/**
 * Read-only: list rst_reservation docs across restaurant DBs.
 * Usage (in deploy-app-1): node /app/scripts/diag-restaurant-reservations.mjs
 */
const BASE = String(process.env.COUCHDB_URL || 'http://couchdb:5984').replace(/\/+$/, '');
const AUTH =
  process.env.COUCHDB_USER && process.env.COUCHDB_PASSWORD
    ? 'Basic ' + Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')
    : '';

async function getJson(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

const dbs = await getJson('/_all_dbs');
const rest = dbs.filter((d) => /restaurant/i.test(d));
console.log('rest_dbs', rest.join(','));
console.log('now_iso', new Date().toISOString());

for (const name of rest) {
  const data = await getJson(`/${encodeURIComponent(name)}/_all_docs?include_docs=true`);
  const docs = (data.rows || [])
    .map((r) => r.doc)
    .filter((d) => d && d.type === 'rst_reservation' && !String(d._id).startsWith('_design'));
  console.log('DB', name, 'count', docs.length);
  docs.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  for (const d of docs.slice(0, 100)) {
    let hist = [];
    try {
      hist = JSON.parse(d.history || '[]');
    } catch {
      /* ignore */
    }
    console.log(
      JSON.stringify({
        db: name,
        guest: d.guestName,
        date: d.date,
        time: d.time,
        status: d.status,
        updatedAt: d.updatedAt,
        businessId: d.businessId,
        hist: hist.slice(0, 8).map((h) => `${h.action || ''} @ ${h.at || ''}`),
      }),
    );
  }
}
