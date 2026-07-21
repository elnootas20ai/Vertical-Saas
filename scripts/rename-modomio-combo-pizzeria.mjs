/**
 * Renombra combo «Pizzeria» → «Combo Modomio» en carta Modomio.
 * Uso VPS: node scripts/rename-modomio-combo-pizzeria.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const MODOMIO_BIZ = '33821959-ae50-4e52-bfea-ea2b145faeac';
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

function bizId(item) {
  return String(item.business_id || item.businessId || '')
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

function isPizzeriaCombo(item) {
  if (item.deletedAt) return false;
  if (bizId(item) !== MODOMIO_BIZ) return false;
  const name = fold(item.name);
  const isCombo =
    item.itemType === 'combo' ||
    fold(item.category) === 'combos' ||
    fold(item.category) === 'combo' ||
    fold(item.category) === 'menus' ||
    fold(item.category) === 'menu';
  if (!isCombo) return false;
  // Nombre viejo «pizzeria» o el individual Vesuvio (menú estándar 1 pizza).
  return (
    name.includes('pizzeria') ||
    name === 'combo pizzeria' ||
    name === 'combo individual vesuvio' ||
    (name.includes('individual') && name.includes('vesuvio'))
  );
}

async function main() {
  const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000');
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const hits = docs.filter(isPizzeriaCombo);

  console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
  console.log(`Encontrados: ${hits.length}`);
  for (const h of hits) {
    console.log(`  · ${h.name} → Combo Modomio | ${h._id}`);
  }

  if (!APPLY) {
    console.log('No se modifica nada. Usa --apply');
    return;
  }
  if (hits.length === 0) {
    console.log('Nada que renombrar.');
    return;
  }

  const now = new Date().toISOString();
  for (const item of hits) {
    const next = {
      ...item,
      name: 'Combo Modomio',
      updatedAt: now,
    };
    await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(item._id)}`, next);
    console.log(`  ✓ ${item.name} → Combo Modomio`);
  }
  console.log('Listo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
