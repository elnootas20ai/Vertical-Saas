/**
 * Soft-delete: Cerveza Nacional (Mahou), Cerveza Sin Alcohol,
 * Zumo de naranja, Agua con gas — carta Modomio.
 * Uso VPS: node scripts/remove-modomio-bebidas-uri.mjs --apply
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
  if (/\bmahou\b/.test(n) || /\bmaou\b/.test(n) || n.startsWith('cerveza nacional')) return 'mahou';
  if (/cerveza sin alcohol/.test(n) || /sin alcohol/.test(n)) return 'sin_alcohol';
  if (/zumo.*naranja/.test(n) || n.includes('zumo naranja')) return 'zumo';
  if (/agua con gas/.test(n) || (/agua/.test(n) && /gas/.test(n) && !/sin gas/.test(n))) return 'agua_gas';
  return null;
}

async function main() {
  const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000');
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const hits = docs.filter((d) => !d.deletedAt && bizId(d) === MODOMIO_BIZ && matchTarget(d.name));

  console.log(APPLY ? '=== APPLY ===' : '=== DRY ===');
  console.log(`Encontrados: ${hits.length}`);
  for (const h of hits) {
    console.log(`  · ${h.name} | ${matchTarget(h.name)} | ${h._id}`);
  }

  if (!APPLY) {
    console.log('No se modifica nada. Usa --apply');
    return;
  }
  if (hits.length === 0) {
    console.log('Nada pendiente (quizá ya borrados).');
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
  console.log('Listo. Recarga TPV.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
