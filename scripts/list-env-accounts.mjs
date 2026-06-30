/** Lista cuentas local vs prod hint. node scripts/list-env-accounts.mjs */
const COUCH = process.env.COUCH_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const PREFIX = (process.env.COUCHDB_DB || process.env.VITE_COUCHDB_DB || 'BBDDsaas').toLowerCase();

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) return [];
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function main() {
  console.log(`\nCouch: ${COUCH} | prefijo BD: ${PREFIX}\n`);

  const accounts = await allDocs('accounts');
  const loginAccounts = accounts.filter((a) => a.type === 'account' && a.email);
  console.log(`=== Cuentas login (${loginAccounts.length}) ===`);
  for (const a of loginAccounts.slice(0, 15)) {
    console.log(`  ${a.email} → user_id=${a.user_id}`);
  }

  const businesses = await allDocs('businesses');
  const owners = businesses.filter((b) => b.type === 'business' && !b.deletedAt);
  console.log(`\n=== Empresas (${owners.length}) ===`);
  for (const b of owners.slice(0, 10)) {
    console.log(`  ${b.name} (${b.business_id || b._id}) owner=${b.owner_user_id}`);
  }

  const cat = await allDocs(`${PREFIX}-catalog`);
  const items = cat.filter((c) => c.type === 'catalog_item' && !c.deletedAt && c.active !== false);
  console.log(`\n=== Catálogo ${PREFIX}-catalog: ${items.length} productos activos ===`);

  const wcs = await allDocs(`${PREFIX}-sales-points`);
  const stores = wcs.filter((w) => w.type === 'sales_point' && !w.deletedAt);
  console.log(`=== Tiendas: ${stores.length} ===`);
  for (const w of stores.slice(0, 5)) {
    console.log(`  ${w.name} user=${w.user_id?.slice(0, 8)}… bid=${(w.businessId || w.business_id || '?').slice(0, 8)}…`);
  }
  console.log('');
}

main().catch(console.error);
