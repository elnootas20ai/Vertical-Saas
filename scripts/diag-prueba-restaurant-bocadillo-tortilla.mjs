/**
 * Solo lectura: bocadillo de tortilla en demo restaurant prod.
 * node scripts/remote-run-script.mjs diag-prueba-restaurant-bocadillo-tortilla.mjs
 */
import '../config/env.js';

const EMAIL = 'prueba-restaurant@test.local';
const OWNER_HINT = '5e36c59f-6e27-4843-8f16-e5a6d721eff0';

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  if (!raw) return '';
  try {
    const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
    const u = new URL(href);
    const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.origin}${pathPart}`.replace(/\/+$/, '');
  } catch {
    return raw.replace(/^(https?:\/\/)(?:[^/@]+)@/i, '$1').replace(/\/+$/, '');
  }
}

const BASE = couchBaseUrl();
const AUTH =
  process.env.COUCHDB_USER && process.env.COUCHDB_PASSWORD
    ? `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`
    : '';

async function couchJson(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
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
  if (!res.ok) throw new Error(`${res.status} ${typeof data === 'object' ? JSON.stringify(data) : text}`);
  return data;
}

async function findAll(db, selector, limit = 200) {
  const data = await couchJson('POST', `/${db}/_find`, { selector, limit });
  return data?.docs || [];
}

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Falta CouchDB env');
    process.exit(1);
  }
  const accounts = await findAll('accounts', { type: 'account', email: EMAIL }, 5);
  const acc = accounts.find((a) => !a.deletedAt) || accounts[0];
  const ownerId = acc?.user_id || OWNER_HINT;

  const items = await findAll('bbddsaas-catalog', { type: 'catalog_item', user_id: ownerId }, 500);
  const hits = items.filter((i) => {
    const n = fold(i.name);
    return n.includes('bocadillo') && n.includes('tortilla');
  });
  const related = items.filter((i) => {
    const n = fold(i.name);
    return n.includes('tortilla') || n.includes('bocadillo');
  });

  console.log('\n=== HITS BOCADILLO TORTILLA ===');
  console.log(
    JSON.stringify(
      hits.map((i) => ({
        _id: i._id,
        name: i.name,
        category: i.category,
        module: i.module,
        unit: i.unit,
        unitPrice: i.unitPrice,
        costPrice: i.costPrice,
        ingredients: i.customFields?.ingredients,
        costingType: i.customFields?.costingType,
        costingRecipe: i.customFields?.costingRecipe,
        supplements: i.customFields?.supplements,
        sku: i.sku,
      })),
      null,
      2,
    ),
  );

  console.log('\n=== RELATED (nombre) ===');
  console.log(
    JSON.stringify(
      related.map((i) => ({
        name: i.name,
        module: i.module,
        unit: i.unit,
        ingredients: i.customFields?.ingredients,
        recipeLen: Array.isArray(i.customFields?.costingRecipe)
          ? i.customFields.costingRecipe.length
          : 0,
      })),
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
