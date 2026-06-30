/**
 * Migra centros de trabajo desde DBs legacy (udar, vertial…) a la DB activa.
 * Uso en VPS: node scripts/migrate-legacy-work-centers.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const TARGET = 'bbddsaas-sales-points';
const LEGACY = ['udar-sales-points', 'vertial-sales-points', 'urielsaas-sales-points'];
const APPLY = process.argv.includes('--apply');
const USER_FILTER = process.argv.find((a) => a.startsWith('--user='))?.slice('--user='.length) || '';

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, ok: res.ok };
}

async function allDocs(db) {
  const res = await couch('GET', `/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=10000`);
  if (!res.ok) return [];
  return (res.data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function main() {
  const targetDocs = await allDocs(TARGET);
  const targetIds = new Set(targetDocs.map((d) => d._id));

  let toMigrate = [];
  for (const db of LEGACY) {
    const docs = await allDocs(db);
    for (const doc of docs) {
      if (doc.type !== 'sales_point' || doc.deletedAt) continue;
      if (USER_FILTER && String(doc.user_id || '') !== USER_FILTER) continue;
      if (targetIds.has(doc._id)) continue;
      toMigrate.push({ from: db, doc });
    }
  }

  console.log(`\nMigrar ${toMigrate.length} centro(s) → ${TARGET}\n`);
  for (const { from, doc } of toMigrate) {
    console.log(`  ${doc.name} (${doc._id}) user=${doc.user_id} from=${from} businessId=${doc.businessId || doc.business_id || '—'}`);
  }

  if (!APPLY || toMigrate.length === 0) {
    console.log(APPLY ? '\nNada que migrar.\n' : '\nSimulación. Añade --apply para ejecutar.\n');
    return;
  }

  await couch('PUT', `/${encodeURIComponent(TARGET)}`).catch(() => null);

  for (const { doc } of toMigrate) {
    const { _rev, ...body } = doc;
    const put = await couch('PUT', `/${encodeURIComponent(TARGET)}/${encodeURIComponent(doc._id)}`, body);
    if (put.ok) console.log(`OK  ${doc.name}`);
    else console.error(`FAIL ${doc.name}:`, put.data?.error || put.status);
  }
  console.log('\nMigración hecha. Recarga la app.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
