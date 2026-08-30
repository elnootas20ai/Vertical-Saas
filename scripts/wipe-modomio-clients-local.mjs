/**
 * LOCAL ONLY — soft-delete clientes de modomio (imports masivos).
 *   node scripts/wipe-modomio-clients-local.mjs --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

const APPLY = process.argv.includes('--apply');
const BID = 'ec241315-4209-47f9-b7f3-f8cf1695e2b0'; // modomio
const DB = 'urielsaas-clients';
const BASE = String(process.env.COUCHDB_URL || 'http://127.0.0.1:5984').replace(/\/+$/, '');
const USER = process.env.COUCHDB_USER;
const PASS = process.env.COUCHDB_PASSWORD;

if (!/127\.0\.0\.1|localhost/i.test(BASE)) {
  console.error('ABORT: solo local (127.0.0.1/localhost). Couch actual:', BASE);
  process.exit(1);
}

const AUTH = `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`;

async function couch(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${typeof data === 'object' ? JSON.stringify(data) : text}`);
  }
  return data;
}

async function collectIds() {
  const ids = [];
  let bookmark;
  for (;;) {
    const body = {
      selector: {
        type: 'client',
        $or: [{ business_id: BID }, { businessId: BID }],
      },
      fields: ['_id', '_rev', 'deletedAt', 'name'],
      limit: 500,
    };
    if (bookmark) body.bookmark = bookmark;
    const page = await couch('POST', `/${DB}/_find`, body);
    const docs = page.docs || [];
    for (const d of docs) {
      if (d.deletedAt) continue;
      ids.push({ _id: d._id, _rev: d._rev });
    }
    if (docs.length < 500) break;
    bookmark = page.bookmark;
    if (ids.length % 2000 === 0) console.log('…encontrados activos', ids.length);
  }
  return ids;
}

async function softDeleteAll(rows) {
  const now = new Date().toISOString();
  let removed = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const slice = rows.slice(i, i + 400);
    // Re-get full docs for this chunk (need full doc for soft-delete put)
    const keys = slice.map((r) => r._id);
    const bulk = await couch('POST', `/${DB}/_all_docs`, {
      keys,
      include_docs: true,
    });
    const docs = (bulk.rows || [])
      .map((r) => r.doc)
      .filter((d) => d && d.type === 'client' && !d.deletedAt)
      .map((d) => ({ ...d, deletedAt: now, updatedAt: now, active: false }));
    if (docs.length === 0) continue;
    const result = await couch('POST', `/${DB}/_bulk_docs`, { docs });
    const ok = (result || []).filter((x) => x.ok).length;
    removed += ok;
    console.log(`lote ${i / 400 + 1}: ${ok}/${docs.length} (total ${removed})`);
  }
  return removed;
}

console.log('Couch', BASE, 'MODE', APPLY ? 'APPLY' : 'DRY-RUN');
console.log('Empresa modomio', BID);
const rows = await collectIds();
console.log('Clientes activos a borrar:', rows.length);
if (!APPLY) {
  console.log('Dry-run OK. Relanza con --apply para soft-delete.');
  process.exit(0);
}
const removed = await softDeleteAll(rows);
console.log('DONE soft-deleted', removed);
