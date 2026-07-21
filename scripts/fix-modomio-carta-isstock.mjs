/**
 * Prod: quita isStockItem de productos de CARTA (module catalog) en Modomio.
 * No toca module=stock (inventario real).
 *
 * Uso en VPS:
 *   node scripts/fix-modomio-carta-isstock.mjs --dry
 *   node scripts/fix-modomio-carta-isstock.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const MODOMIO_BIZ = '33821959-ae50-4e52-bfea-ea2b145faeac';
const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;

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

async function allDocs(db) {
  const data = await couch('GET', `/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function bizId(item) {
  return String(item.business_id || item.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function isCartaCandidate(item) {
  if (item.deletedAt) return false;
  if (item.type && item.type !== 'catalog_item') return false;
  if ((item.module || 'catalog') !== 'catalog') return false;
  if (item.isStockItem !== true) return false;
  const t = item.itemType || 'product';
  return t === 'product' || t === 'combo' || t === 'service';
}

async function main() {
  console.log(DRY ? '=== DRY (añade --apply) ===' : '=== APPLY ===');
  const catalog = await allDocs('bbddsaas-catalog');
  const targets = catalog.filter(
    (d) => bizId(d) === MODOMIO_BIZ && isCartaCandidate(d),
  );

  console.log(`Candidatos carta con isStockItem=true: ${targets.length}`);
  for (const item of targets.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))) {
    console.log(
      `  · ${item.name} | ${item.category || '—'} | stockCategory=${item.stockCategory || '—'} | price=${Number(item.unitPrice || 0)}`,
    );
  }

  if (DRY) {
    console.log('\nNo se modifica nada. Ejecuta con --apply.');
    return;
  }

  let patched = 0;
  const now = new Date().toISOString();
  for (const item of targets) {
    const next = {
      ...item,
      isStockItem: false,
      // Carta vendible, no almacén
      stockCategory:
        item.stockCategory === 'ingredient' ||
        item.stockCategory === 'packaging' ||
        item.stockCategory === 'cleaning' ||
        item.stockCategory === 'consumable'
          ? 'finished_product'
          : item.stockCategory === 'other' || !item.stockCategory
            ? 'finished_product'
            : item.stockCategory,
      updatedAt: now,
      cartaStockFlagClearedAt: now,
    };
    await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(item._id)}`, next);
    patched += 1;
    console.log(`  ✓ ${item.name}`);
  }
  console.log(`\nListo: ${patched} producto(s). Recarga el TPV (o cierra/abre) para limpiar caché.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
