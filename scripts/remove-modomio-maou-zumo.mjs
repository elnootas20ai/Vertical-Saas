/**
 * Soft-delete Maou / Zumo de naranja de la carta Modomio.
 * Uso VPS: node scripts/remove-modomio-maou-zumo.mjs --apply
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

function matchTarget(name) {
  const n = fold(name);
  if (!n) return null;
  // Maou / Mahou (cerveza)
  if (/\bmahou\b/.test(n) || /\bmaou\b/.test(n) || n.startsWith('mahou') || n.startsWith('maou')) {
    return 'mahou';
  }
  // Zumo de naranja (no zumos de otros sabores)
  if (
    n === 'zumo de naranja' ||
    n.startsWith('zumo de naranja') ||
    n.includes('zumo naranja') ||
    /zumo.*naranja/.test(n)
  ) {
    return 'zumo';
  }
  return null;
}

async function main() {
  const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000');
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const hits = docs.filter((d) => !d.deletedAt && bizId(d) === MODOMIO_BIZ && matchTarget(d.name));

  console.log(APPLY ? '=== APPLY ===' : '=== DRY (añade --apply) ===');
  console.log(`Encontrados: ${hits.length}`);
  for (const h of hits) {
    console.log(`  · ${h.name} | ${h.category || '—'} | ${matchTarget(h.name)} | ${h._id}`);
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
    const kind = matchTarget(item.name);
    const next = {
      ...item,
      active: false,
      available: false,
      deletedAt: now,
      updatedAt: now,
      deletedReason: `Retirada carta: ${kind} (pedido Uriel)`,
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
