/**
 * Soft-delete pizzas de DISARMINK/Modomio que Uriel quiere fuera de
 * combos Individual / Dúo / Family (y Premium Modomio):
 * Primavera Premium, Marinera (Premium), Mamaia*, Mitad y Mitad,
 * Trufada Premium, Modomio, Modomio Premium.
 *
 * No toca marcas, ingredientes ni el menú «Combo Modomio».
 *
 * Uso VPS: node scripts/remove-modomio-combo-pizzas.mjs [--apply]
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const BIZ_IDS = new Set([
  '33821959-ae50-4e52-bfea-ea2b145faeac', // Modomio
  'ed846f31-aee7-4568-ac03-fa25ff3ad773', // DISARMINK
]);
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

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function bizId(item) {
  return String(item.business_id || item.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

/**
 * @returns {string|null} etiqueta legible o null si no aplica
 */
function matchTarget(doc) {
  if (doc.type && doc.type !== 'catalog_item') return null;
  if (doc.itemType === 'combo') return null;
  const cat = fold(doc.category);
  if (['ingredientes', 'envases', 'consumibles', 'reventa'].includes(cat)) return null;

  const n = fold(doc.name);
  if (!n) return null;

  // Premium Modomio
  if (n === 'modomio premium' || n === 'premium modomio' || n === 'pizza modomio premium') {
    return 'Modomio Premium';
  }
  // Pizza Modomio (carta)
  if (n === 'modomio' || n === 'pizza modomio') return 'Modomio';
  if (n === 'primavera' || n === 'primavera premium' || n === 'pizza primavera') return 'Primavera';
  if (n === 'marinera' || n === 'marinera premium' || n === 'pizza marinera') return 'Marinera';
  if (n === 'mamaia' || n === 'mamaia premium' || n === 'pizza mamaia' || n === 'mamai') return 'Mamaia';
  if (n === 'trufada' || n === 'trufada premium' || n === 'pizza trufada') return 'Trufada';
  // Solo el producto mitad y mitad de carta (Premium), no “al gusto”
  if (n === 'mitad y mitad' || n === 'pizza mitad y mitad') return 'Mitad y Mitad';
  return null;
}

async function main() {
  const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000');
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const hits = docs.filter((d) => {
    if (d.deletedAt) return false;
    if (!BIZ_IDS.has(bizId(d))) return false;
    return Boolean(matchTarget(d));
  });

  console.log(APPLY ? '=== APPLY ===' : '=== DRY (añade --apply) ===');
  console.log(`Encontrados: ${hits.length}`);
  for (const h of hits.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))) {
    console.log(
      `  · ${h.name} | ${h.category || '—'} | biz=${bizId(h).slice(0, 8)}… | ${h._id}`,
    );
  }

  // Mamaia: avisar si no hay match
  const labels = new Set(hits.map((h) => matchTarget(h)));
  for (const expected of ['Primavera', 'Marinera', 'Mamaia', 'Mitad y Mitad', 'Trufada', 'Modomio', 'Modomio Premium']) {
    if (!labels.has(expected)) console.log(`  (no encontrado: ${expected})`);
  }

  if (!APPLY) {
    console.log('No se modifica nada.');
    return;
  }
  if (hits.length === 0) {
    console.log('Nada que borrar.');
    return;
  }

  const now = new Date().toISOString();
  for (const item of hits) {
    const label = matchTarget(item) || item.name;
    const next = {
      ...item,
      active: false,
      available: false,
      deletedAt: now,
      updatedAt: now,
      deletedReason: `Retirada combos/carta: ${label} (pedido Uriel)`,
    };
    await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(item._id)}`, next);
    console.log(`  ✓ soft-delete ${item.name}`);
  }
  console.log('Listo. Recarga catálogo/TPV (Ctrl+Shift+R).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
