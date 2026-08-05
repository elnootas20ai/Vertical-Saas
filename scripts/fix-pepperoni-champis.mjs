/**
 * Solo Pepperoni → asegurar Champiñones quitables (sin tocar Moniato/Individual).
 * Uso VPS: node scripts/fix-pepperoni-champis.mjs [--apply]
 * Uso local: BUSINESS_ID=... COUCH_DB=urielsaas-catalog node scripts/fix-pepperoni-champis.mjs [--apply]
 */
const COUCH = process.env.COUCH || 'http://127.0.0.1:5984';
const USER = process.env.COUCHDB_USER || 'vertialadmin';
const PASS = process.env.COUCHDB_PASSWORD || 'uriel12345';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const DB = process.env.COUCH_DB || 'bbddsaas-catalog';
const BUSINESS = (process.env.BUSINESS_ID || 'ed846f31-aee7-4568-ac03-fa25ff3ad773').replace(/^business:/, '');
const APPLY = process.argv.includes('--apply');

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error || res.status} ${data.reason || ''}`);
  return data;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function parseIngredients(raw) {
  return String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function mergeIngredient(list, name) {
  const folded = fold(name);
  if (list.some((x) => fold(x) === folded)) return list;
  return [...list, name];
}

async function main() {
  const data = await couch('GET', `/${DB}/_all_docs?include_docs=true&limit=50000`);
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const pizza = docs.find((d) => {
    if (d.deletedAt || bid(d) !== BUSINESS || d.type !== 'catalog_item') return false;
    if (d.itemType === 'combo') return false;
    const n = fold(d.name);
    const cat = fold(d.category);
    if (cat === 'ingredientes') return false;
    return n === 'peperoni' || n === 'pepperoni' || n === 'pizza peperoni' || n === 'pizza pepperoni';
  });

  console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
  console.log({ db: DB, business: BUSINESS });

  if (!pizza) {
    console.error('No hay pizza Pepperoni en carta');
    process.exit(1);
  }

  const currentIng = parseIngredients(pizza.customFields?.ingredients);
  const nextIng = mergeIngredient(currentIng, 'Champiñones');
  const changed = nextIng.join(', ') !== currentIng.join(', ');

  console.log(`→ ${pizza.name} (${pizza._id})`);
  console.log(`  actual: "${currentIng.join(', ')}"`);
  console.log(`  nuevo:  "${nextIng.join(', ')}"`);
  console.log(changed ? '  (falta Champiñones → se añadirá)' : '  (ya está; se tocará updatedAt para forzar sync)');

  if (!APPLY) {
    console.log('No se modifica nada. Añade --apply para guardar.');
    return;
  }

  const next = {
    ...pizza,
    updatedAt: new Date().toISOString(),
    customFields: {
      ...(pizza.customFields || {}),
      ingredients: nextIng.join(', '),
    },
  };
  await couch('PUT', `/${DB}/${encodeURIComponent(pizza._id)}`, next);
  console.log('✓ Pepperoni con Champiñones quitables. Recarga TPV (forzada).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
