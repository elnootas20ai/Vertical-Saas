/**
 * Soft-delete affiliate requests (pending + rejected) from the affiliates DB.
 * Usage: node scripts/clear-affiliate-requests.js
 */
import 'dotenv/config';

const COUCH_URL = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const COUCH_USER = process.env.COUCHDB_USER || 'admin';
const COUCH_PASS = process.env.COUCHDB_PASSWORD || '';
const AFFILIATES_DB = 'affiliates';
const TARGET_STATUSES = new Set(['pending', 'rejected']);

const AUTH_HEADER = COUCH_PASS
  ? 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64')
  : null;

async function couch(path, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
  if (AUTH_HEADER) headers.Authorization = AUTH_HEADER;
  const res = await fetch(`${COUCH_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${text}`);
  }
  return res.json();
}

async function main() {
  await couch(`/${AFFILIATES_DB}`, { method: 'PUT' }).catch(() => {});
  const data = await couch(`/${AFFILIATES_DB}/_all_docs?include_docs=true`);
  const now = new Date().toISOString();
  let removed = 0;

  for (const row of data.rows || []) {
    const doc = row.doc;
    if (!doc || doc.type !== 'affiliate' || doc.deletedAt) continue;
    if (!TARGET_STATUSES.has(doc.status)) continue;

    await couch(`/${AFFILIATES_DB}/${encodeURIComponent(doc._id)}`, {
      method: 'PUT',
      body: JSON.stringify({ ...doc, deletedAt: now, updatedAt: now }),
    });
    removed += 1;
    console.log(`  ✓ ${doc.name} (${doc.email}) — ${doc.status}`);
  }

  console.log(`\nEliminadas ${removed} solicitud(es) pendiente(s)/rechazada(s).`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
