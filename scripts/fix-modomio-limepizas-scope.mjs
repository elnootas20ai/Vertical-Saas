#!/usr/bin/env node
/**
 * Producción: pedidos TPV mal colgados en limepizas (cleaning) → modomio (delivery).
 * Soft-delete de limepizas para no confundir el Gate.
 *
 * Uso local → VPS: node scripts/remote-fix-modomio-scope.mjs
 * En VPS: NODE_ENV=production node scripts/fix-modomio-limepizas-scope.mjs
 */
import '../config/env.js';

const base = String(process.env.COUCHDB_URL || '').replace(/\/+$/, '');
const auth =
  'Basic ' +
  Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64');

const LIME = '070fd908-9979-4468-a560-7f3fa7d784b5';
const MODO = '33821959-ae50-4e52-bfea-ea2b145faeac';
const ADMIN = 'e94ccc03-5399-40a8-8e92-740bd66f38e0';
const DRY = process.argv.includes('--dry');

async function couch(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.error !== 'not_found') {
    throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  }
  return data;
}

async function allDocs(db) {
  const data = await couch('GET', `/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function putDoc(db, doc) {
  if (DRY) {
    console.log('[dry] PUT', db, doc._id);
    return doc;
  }
  const saved = await couch('PUT', `/${encodeURIComponent(db)}/${encodeURIComponent(doc._id)}`, doc);
  return { ...doc, _rev: saved.rev };
}

async function main() {
  if (!base || !process.env.COUCHDB_USER) {
    console.error('Falta COUCHDB_URL / credenciales');
    process.exit(1);
  }
  console.log(DRY ? '=== DRY RUN ===' : '=== APPLY ===');
  console.log('Couch:', base);

  const deliveryDb = 'bbddsaas-delivery';
  const orders = (await allDocs(deliveryDb)).filter(
    (d) =>
      d.type === 'delivery_order' &&
      !d.deletedAt &&
      d.user_id === ADMIN &&
      String(d.business_id || d.businessId || '') === LIME,
  );
  console.log(`Pedidos admin en limepizas → modomio: ${orders.length}`);
  for (const o of orders) {
    const next = {
      ...o,
      business_id: MODO,
      businessId: MODO,
      updatedAt: new Date().toISOString(),
      scopeFixedAt: new Date().toISOString(),
      scopeFixedFrom: LIME,
    };
    await putDoc(deliveryDb, next);
    console.log('  ✓', o.orderNumber || o._id);
  }

  const missing = (await allDocs(deliveryDb)).filter(
    (d) =>
      d.type === 'delivery_order' &&
      !d.deletedAt &&
      d.user_id === ADMIN &&
      !String(d.business_id || d.businessId || '').trim(),
  );
  console.log(`Pedidos admin sin business_id → modomio: ${missing.length}`);
  for (const o of missing) {
    await putDoc(deliveryDb, {
      ...o,
      business_id: MODO,
      businessId: MODO,
      updatedAt: new Date().toISOString(),
      scopeFixedAt: new Date().toISOString(),
      scopeFixedFrom: '(empty)',
    });
    console.log('  ✓', o.orderNumber || o._id);
  }

  // Soft-delete limepizas (empresa basura cleaning sin catálogo)
  const limeDoc = await couch('GET', `/businesses/${encodeURIComponent('business:' + LIME)}`);
  if (limeDoc && !limeDoc.error && !limeDoc.deletedAt) {
    console.log('Soft-delete empresa limepizas sl (cleaning fantasma)');
    await putDoc('businesses', {
      ...limeDoc,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedReason: 'scope-fix: pedidos/catálogo viven en modomio delivery',
    });
  } else {
    console.log('limepizas ya borrada o no encontrada');
  }

  // Retag PDVs huérfanos en DBs legacy si apuntan a lime
  for (const db of ['vertial-sales-points', 'udar-sales-points', 'bbddsaas-sales-points']) {
    const docs = await allDocs(db);
    const bad = docs.filter(
      (d) =>
        (d.type === 'sales_point' || d.type === 'work_center') &&
        !d.deletedAt &&
        d.user_id === ADMIN &&
        String(d.businessId || d.business_id || '') === LIME,
    );
    if (!bad.length) continue;
    console.log(`${db}: retag ${bad.length} PDV lime → modomio`);
    for (const d of bad) {
      await putDoc(db, {
        ...d,
        businessId: MODO,
        business_id: MODO,
        updatedAt: new Date().toISOString(),
      });
      console.log('  ✓', d.name || d._id);
    }
  }

  console.log('\\nListo. Entra en producción con modomio y revisa pedidos TPV.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
