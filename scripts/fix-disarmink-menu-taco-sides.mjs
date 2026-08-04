/**
 * DISARMINK: Menú Taco → 3 patatas (Deluxe / Monalisa / Moniato) + bebidas como Individual.
 *
 *   node scripts/fix-disarmink-menu-taco-sides.mjs
 *   node scripts/fix-disarmink-menu-taco-sides.mjs --apply
 * Remoto dry:   node scripts/remote-fix-disarmink-menu-taco-sides.mjs
 * Remoto apply: node scripts/remote-fix-disarmink-menu-taco-sides.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');

const POTATO_NAMES = ['patatas deluxe', 'patatas monalisa', 'patatas moniato'];

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
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

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

async function main() {
  const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=80000');
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const biz = docs.filter((d) => !d.deletedAt && bid(d) === DISARMINK && d.type === 'catalog_item');

  const taco = biz.find((d) => d.itemType === 'combo' && /menu\s*taco/.test(fold(d.name)));
  if (!taco) {
    console.error('No encontrado: Menú Taco');
    process.exit(1);
  }

  const potatoes = POTATO_NAMES.map((want) => {
    const p = biz.find(
      (d) =>
        d.itemType !== 'combo' &&
        fold(d.category) === 'complementos' &&
        fold(d.name) === want &&
        d.active !== false,
    );
    return p || null;
  });

  const missing = POTATO_NAMES.filter((_, i) => !potatoes[i]);
  if (missing.length) {
    console.error('Faltan patatas en carta:', missing);
    process.exit(1);
  }

  const sideIds = potatoes.map((p) => p._id);
  const prevAllow = Array.isArray(taco.customFields?.comboSlotAllowlists?.side)
    ? taco.customFields.comboSlotAllowlists.side
    : [];

  const nextStructure = Array.isArray(taco.customFields?.comboStructure)
    ? taco.customFields.comboStructure.map((s) => {
        if (s.slotKind !== 'side') return { ...s };
        return {
          ...s,
          label: 'Patatas',
          required: true,
          expectedCount: Math.max(1, Number(s.expectedCount) || 1),
        };
      })
    : [
        { slotKind: 'main', label: 'Taco', required: true, expectedCount: 1 },
        { slotKind: 'side', label: 'Patatas', required: true, expectedCount: 1 },
        { slotKind: 'drink', label: 'Bebida', required: true, expectedCount: 1 },
      ];

  const nextAllowlists = {
    ...(taco.customFields?.comboSlotAllowlists || {}),
    side: sideIds,
  };
  // Bebidas igual que Individual: sin allowlist → todas las de carta.
  if (Array.isArray(nextAllowlists.drink)) delete nextAllowlists.drink;

  const next = {
    ...taco,
    updatedAt: new Date().toISOString(),
    customFields: {
      ...(taco.customFields || {}),
      comboStructureConfirmed: true,
      comboStructure: nextStructure,
      comboSlotAllowlists: nextAllowlists,
    },
  };

  console.log(APPLY ? '=== APPLY ===' : '=== DRY (sin escribir) ===');
  console.log('Menú:', taco.name, taco._id);
  console.log(
    'Antes side allow:',
    prevAllow.map((id) => biz.find((x) => x._id === id)?.name || id),
  );
  console.log(
    'Después side allow:',
    sideIds.map((id) => biz.find((x) => x._id === id)?.name || id),
  );
  console.log('Drink allow: (sin lista = todas las bebidas, como Individual)');
  console.log(
    'Structure side label:',
    nextStructure.find((s) => s.slotKind === 'side')?.label,
  );

  if (!APPLY) {
    console.log('\nSimulación OK. Usa --apply para guardar en CouchDB.');
    return;
  }

  await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(next._id)}`, next);
  console.log('Guardado.');
}

await main();
