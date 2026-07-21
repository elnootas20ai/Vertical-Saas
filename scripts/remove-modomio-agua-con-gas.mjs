/**
 * Soft-delete «Agua con gas» (y variantes) de la carta Modomio.
 * Uso VPS: node scripts/remove-modomio-agua-con-gas.mjs --apply
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

function isAguaConGas(name) {
  const n = fold(name);
  return (
    n === 'agua con gas' ||
    n.includes('agua con gas') ||
    n.includes('agua con gas') ||
    /agua.*gas/.test(n)
  );
}

async function main() {
  const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000');
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const hits = docs.filter(
    (d) => !d.deletedAt && bizId(d) === MODOMIO_BIZ && isAguaConGas(d.name),
  );

  console.log(APPLY ? '=== APPLY ===' : '=== DRY (añade --apply) ===');
  console.log(`Encontrados: ${hits.length}`);
  for (const h of hits) {
    console.log(`  · ${h.name} | ${h.category || '—'} | ${h._id}`);
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
    const next = {
      ...item,
      active: false,
      available: false,
      deletedAt: now,
      updatedAt: now,
      deletedReason: 'Retirada carta: Agua con gas (pedido Uriel)',
    };
    await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(item._id)}`, next);
    console.log(`  ✓ soft-delete ${item.name}`);
  }
  console.log('Listo. Recarga catálogo/TPV.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
