/**
 * LOCAL ONLY — urieladmin: vacía lista maestra de ingredientes y la regenera
 * desde la columna ingredientes de la carta (catálogo).
 *
 *   node scripts/reset-urieladmin-ingredients-from-carta-local.mjs
 *   node scripts/reset-urieladmin-ingredients-from-carta-local.mjs --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

const APPLY = process.argv.includes('--apply');
const UID = '1e73c3f5-8be3-49a9-8b81-3e51e433dfac';
const BID = 'ec241315-4209-47f9-b7f3-f8cf1695e2b0';
const CFG_ID = `dlvconf-${UID}`;
const CATALOG_DB = 'urielsaas-catalog';
const DELIVERY_DB = 'urielsaas-delivery';

const BASE = String(process.env.COUCHDB_URL || 'http://127.0.0.1:5984').replace(/\/+$/, '');
const USER = process.env.COUCHDB_USER;
const PASS = process.env.COUCHDB_PASSWORD;

if (!/127\.0\.0\.1|localhost/i.test(BASE)) {
  console.error('ABORT: solo local. Couch:', BASE);
  process.exit(1);
}

const AUTH = `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`;

const PLACEHOLDERS = new Set([
  'ver carta',
  'ver menu',
  'ver menú',
  'ver la carta',
  'consultar carta',
  'see menu',
  'ver',
  '-',
  '—',
  'n/a',
  'na',
  'sin ingredientes',
]);

function fold(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIngredients(raw) {
  if (typeof raw !== 'string') return [];
  const out = [];
  const seen = new Set();
  for (const chunk of raw.split(/[,;\n/]+/)) {
    const name = chunk.trim();
    if (!name) continue;
    const key = fold(name);
    if (!key || PLACEHOLDERS.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

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

function isCatalogProduct(doc) {
  if (!doc || doc.deletedAt) return false;
  if (doc.type === 'warehouse' || doc.type === 'inventory_item') return false;
  if (doc.type === 'catalog_item' || doc.type === 'product') return true;
  return Boolean(doc.category || doc.customFields || doc.sku);
}

async function main() {
  console.log('MODE', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log('Couch', BASE);
  console.log('UID', UID, 'BID', BID);

  const cfg = await couch('GET', `/${DELIVERY_DB}/${encodeURIComponent(CFG_ID)}`);
  const before = Array.isArray(cfg.storeIngredients) ? cfg.storeIngredients.length : 0;
  console.log('storeIngredients actuales:', before);

  const all = await couch('GET', `/${CATALOG_DB}/_all_docs?include_docs=true&limit=50000`);
  const products = (all.rows || [])
    .map((r) => r.doc)
    .filter(isCatalogProduct)
    .filter((d) => {
      const u = String(d.user_id || d.userId || '');
      const b = String(d.business_id || d.businessId || '');
      return u === UID || b === BID;
    });

  const byKey = new Map();
  let productsWithText = 0;
  for (const item of products) {
    const text = String(item.customFields?.ingredients || '').trim();
    if (!text) continue;
    productsWithText += 1;
    for (const name of parseIngredients(text)) {
      const key = fold(name);
      if (!byKey.has(key)) byKey.set(key, name);
    }
  }

  const names = [...byKey.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  const storeIngredients = names.map((name, idx) => ({
    id: `ing-carta-${idx + 1}`,
    name,
    role: 'extra',
    tpvChargeExtra: true,
    tpvAllowRemove: true,
  }));

  console.log('productos cuenta:', products.length);
  console.log('con columna ingredientes:', productsWithText);
  console.log('nombres únicos desde carta:', storeIngredients.length);
  console.log('muestra:', storeIngredients.slice(0, 12).map((i) => i.name));

  if (!APPLY) {
    console.log('Dry-run OK. Pasa --apply para: vaciar lista basura + cargar solo estos de la carta.');
    return;
  }

  const now = new Date().toISOString();
  const next = {
    ...cfg,
    storeIngredients,
    tpvBrandIngredients: {},
    tpvBrandSupplements: {},
    tpvBrandCategorySupplements: {},
    tpvDefaultExtraPrice:
      cfg.tpvDefaultExtraPrice != null && Number.isFinite(Number(cfg.tpvDefaultExtraPrice))
        ? Number(cfg.tpvDefaultExtraPrice)
        : 0,
    updatedAt: now,
  };

  // Quitar supplements de plantillas legacy (pizzas/hamburguesas) si existen.
  if (next.tpvCategoryTemplates && typeof next.tpvCategoryTemplates === 'object') {
    const templates = { ...next.tpvCategoryTemplates };
    for (const key of Object.keys(templates)) {
      const row = templates[key];
      if (!row || typeof row !== 'object') continue;
      templates[key] = { ...row, supplements: [] };
    }
    next.tpvCategoryTemplates = templates;
  }

  const put = await couch('PUT', `/${DELIVERY_DB}/${encodeURIComponent(CFG_ID)}`, next);
  console.log('GUARDADO', put.id || CFG_ID, 'rev', put.rev);
  console.log(`DONE: ${before} → ${storeIngredients.length} ingredientes (desde carta). Recarga Catálogo → Ingredientes.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
