/**
 * LOCAL ONLY — limpia catálogo/ingredientes de urieladmin delivery.
 * Deja solo carbonara + barbacoa (y sus docs recipe).
 * Vacía storeIngredients.
 *
 *   node scripts/wipe-urieladmin-delivery-catalog-local.mjs
 *   node scripts/wipe-urieladmin-delivery-catalog-local.mjs --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

const APPLY = process.argv.includes('--apply');
const UID = '1e73c3f5-8be3-49a9-8b81-3e51e433dfac';
const BID = 'ec241315-4209-47f9-b7f3-f8cf1695e2b0';
const CFG_ID = `dlvconf-${UID}`;
const CATALOG_DB = 'urielsaas-catalog';
const DELIVERY_DB = 'urielsaas-delivery';

/** Los 2 artículos de carta que Uriel quiere conservar. */
const KEEP_CATALOG_IDS = new Set([
  'catitem-e013080c-c396-419b-9c59-68a9bf920f28', // carbonara
  'catitem-37c94dad-780e-4a96-8499-efad219ebd7f', // barbacoa
]);
const KEEP_RECIPE_IDS = new Set([
  'recipe-20830e07-2bbe-4771-a77b-bc617797aa33', // Receta carbonara
  'recipe-52cdee31-50ca-4a9e-b5ad-b2f8691d4836', // Receta barbacoa
]);

const BASE = String(process.env.COUCHDB_URL || 'http://127.0.0.1:5984').replace(/\/+$/, '');
const USER = process.env.COUCHDB_USER;
const PASS = process.env.COUCHDB_PASSWORD;

if (!/127\.0\.0\.1|localhost/i.test(BASE)) {
  console.error('ABORT: solo local. Couch:', BASE);
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

function belongsToUrieladmin(doc) {
  const u = String(doc.user_id || doc.userId || '');
  const b = String(doc.business_id || doc.businessId || '');
  return u === UID || b === BID;
}

function shouldSoftDelete(doc) {
  if (!doc || doc.deletedAt) return false;
  if (String(doc._id || '').startsWith('_design')) return false;
  if (!belongsToUrieladmin(doc)) return false;

  // No tocar marcas ni almacenes físicos
  if (doc.type === 'brand' || doc.type === 'warehouse') return false;

  if (KEEP_CATALOG_IDS.has(doc._id) || KEEP_RECIPE_IDS.has(doc._id)) return false;

  // Catálogo / stock / recetas sueltas / inventory
  if (
    doc.type === 'catalog_item' ||
    doc.type === 'product' ||
    doc.type === 'recipe' ||
    doc.type === 'inventory_item' ||
    doc.stockCategory
  ) {
    return true;
  }

  return false;
}

async function main() {
  console.log('MODE', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log('Couch', BASE);
  console.log('Motivo: basura antigua (Excel/demo). Conservar solo carbonara+barbacoa. Vaciar ingredientes.');

  const cfg = await couch('GET', `/${DELIVERY_DB}/${encodeURIComponent(CFG_ID)}`);
  const beforeIngs = Array.isArray(cfg.storeIngredients) ? cfg.storeIngredients.length : 0;
  console.log('storeIngredients ahora:', beforeIngs);

  const all = await couch('GET', `/${CATALOG_DB}/_all_docs?include_docs=true&limit=50000`);
  const docs = (all.rows || []).map((r) => r.doc).filter(Boolean);
  const toDelete = docs.filter(shouldSoftDelete);
  const keepers = docs.filter(
    (d) =>
      belongsToUrieladmin(d) &&
      !d.deletedAt &&
      (KEEP_CATALOG_IDS.has(d._id) || KEEP_RECIPE_IDS.has(d._id) || d.type === 'brand' || d.type === 'warehouse'),
  );

  const byType = {};
  for (const d of toDelete) {
    const k = `${d.type || 'notype'}:${d.stockCategory || '-'}`;
    byType[k] = (byType[k] || 0) + 1;
  }
  console.log('soft-delete candidatos:', toDelete.length, byType);
  console.log(
    'conservar:',
    keepers.map((d) => `${d.type || '?'} ${d.name || d._id}`),
  );

  if (!APPLY) {
    console.log('Dry-run OK. Pasa --apply para escribir.');
    return;
  }

  const now = new Date().toISOString();
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 200) {
    const slice = toDelete.slice(i, i + 200);
    const payload = {
      docs: slice.map((d) => ({
        ...d,
        deletedAt: now,
        updatedAt: now,
        active: false,
      })),
    };
    const res = await couch('POST', `/${CATALOG_DB}/_bulk_docs`, payload);
    const ok = (res || []).filter((r) => r.ok).length;
    deleted += ok;
    console.log(`…bulk ${i}-${i + slice.length - 1} ok=${ok}`);
  }

  const freshCfg = await couch('GET', `/${DELIVERY_DB}/${encodeURIComponent(CFG_ID)}`);
  const nextCfg = {
    ...freshCfg,
    storeIngredients: [],
    tpvBrandSupplements: [],
    tpvBrandCategorySupplements: [],
    updatedAt: now,
  };
  await couch('PUT', `/${DELIVERY_DB}/${encodeURIComponent(CFG_ID)}`, nextCfg);

  console.log(`DONE: soft-deleted ${deleted} docs; storeIngredients ${beforeIngs} → 0.`);
  console.log('Recarga con Ctrl+F5 → Catálogo / Ingredientes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
