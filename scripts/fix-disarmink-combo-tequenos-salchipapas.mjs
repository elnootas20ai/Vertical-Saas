/**
 * DISARMINK (Pau): Tequeños (+1,50) y Salchipapas (+1) como complemento
 * con suplemento en Individual, Dúo, Family y Combo Modomio.
 *
 * - Individual: añade ambos a la allowlist de complementos (junto a patatas).
 * - Los 4 menús: customFields.comboSlotSurcharges.side = { [id]: precio }.
 *
 *   node scripts/fix-disarmink-combo-tequenos-salchipapas.mjs
 *   node scripts/fix-disarmink-combo-tequenos-salchipapas.mjs --apply
 * Remoto (dry): node scripts/remote-fix-disarmink-combo-tequenos-salchipapas.mjs
 * Remoto apply: node scripts/remote-fix-disarmink-combo-tequenos-salchipapas.mjs --apply
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const APPLY = process.argv.includes('--apply');

const SURCHARGES = {
  tequenos: 1.5,
  salchipapas: 1,
};

const MENU_MATCHERS = [
  { key: 'individual', match: (n) => n === 'individual' },
  { key: 'duo', match: (n) => n === 'duo' || n === 'dúo' },
  { key: 'family', match: (n) => n === 'family' || n === 'familiar' },
  { key: 'combo_modomio', match: (n) => n === 'combo modomio' },
];

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

async function main() {
  const data = await couch('GET', '/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000');
  const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
  const biz = docs.filter((d) => !d.deletedAt && bid(d) === DISARMINK && d.type === 'catalog_item');

  const tequenos = biz.find((d) => fold(d.name) === 'tequenos' && fold(d.category) === 'complementos');
  const salchipapas = biz.find((d) => {
    const n = fold(d.name);
    return (
      fold(d.category) === 'complementos' &&
      (n === 'salchipapas' || n === 'salchipapas supreme' || /^salchipapas\b/.test(n))
    );
  });

  if (!tequenos || !salchipapas) {
    console.error('Faltan productos Complementos:', {
      tequenos: tequenos?.name || null,
      salchipapas: salchipapas?.name || null,
    });
    process.exit(1);
  }

  const deluxe = biz.find((d) => fold(d.name) === 'patatas deluxe' && fold(d.category) === 'complementos');
  const monalisa = biz.find(
    (d) => fold(d.name) === 'patatas monalisa' && fold(d.category) === 'complementos',
  );
  const moniato = biz.find((d) => fold(d.name) === 'patatas moniato' && fold(d.category) === 'complementos');

  const sideSurcharges = {
    [tequenos._id]: SURCHARGES.tequenos,
    [salchipapas._id]: SURCHARGES.salchipapas,
  };

  console.log(APPLY ? '=== APPLY ===' : '=== DRY (sin escribir) ===');
  console.log('Productos:', {
    tequenos: { id: tequenos._id, name: tequenos.name, surcharge: SURCHARGES.tequenos },
    salchipapas: {
      id: salchipapas._id,
      name: salchipapas.name,
      surcharge: SURCHARGES.salchipapas,
    },
  });

  const now = new Date().toISOString();
  const toWrite = [];

  for (const cfg of MENU_MATCHERS) {
    const combo = biz.find((d) => d.itemType === 'combo' && cfg.match(fold(d.name)));
    if (!combo) {
      console.log(`⚠ No encontrado: ${cfg.key}`);
      continue;
    }

    const prevAllow = combo.customFields?.comboSlotAllowlists?.side;
    let nextAllow = Array.isArray(prevAllow) ? [...prevAllow] : null;

    if (cfg.key === 'individual') {
      const base = [
        deluxe?._id,
        monalisa?._id,
        moniato?._id,
        ...(Array.isArray(prevAllow) ? prevAllow : []),
        tequenos._id,
        salchipapas._id,
      ].filter(Boolean);
      nextAllow = [...new Set(base)];
    }

    const nextStructure = Array.isArray(combo.customFields?.comboStructure)
      ? combo.customFields.comboStructure.map((s) => {
          if (s.slotKind !== 'side' || cfg.key !== 'individual') return { ...s };
          return {
            ...s,
            label: 'Patatas, Tequeños o Salchipapas',
            required: true,
            expectedCount: Math.max(1, Number(s.expectedCount) || 1),
          };
        })
      : combo.customFields?.comboStructure;

    const next = {
      ...combo,
      updatedAt: now,
      customFields: {
        ...(combo.customFields || {}),
        comboStructureConfirmed: true,
        ...(nextStructure ? { comboStructure: nextStructure } : {}),
        comboSlotSurcharges: {
          ...(combo.customFields?.comboSlotSurcharges &&
          typeof combo.customFields.comboSlotSurcharges === 'object'
            ? combo.customFields.comboSlotSurcharges
            : {}),
          side: {
            ...((combo.customFields?.comboSlotSurcharges &&
              typeof combo.customFields.comboSlotSurcharges.side === 'object' &&
              combo.customFields.comboSlotSurcharges.side) ||
              {}),
            ...sideSurcharges,
          },
        },
        ...(nextAllow
          ? {
              comboSlotAllowlists: {
                ...(combo.customFields?.comboSlotAllowlists || {}),
                side: nextAllow,
              },
            }
          : {}),
      },
    };

    console.log(`→ ${combo.name}:`, {
      surcharges: next.customFields.comboSlotSurcharges.side,
      allowSide: next.customFields.comboSlotAllowlists?.side?.length || null,
    });
    toWrite.push(next);
  }

  if (!APPLY) {
    console.log(`\nSimulación: ${toWrite.length} combos. Usa --apply para guardar en CouchDB.`);
    return;
  }

  for (const doc of toWrite) {
    await couch('PUT', `/bbddsaas-catalog/${encodeURIComponent(doc._id)}`, doc);
  }
  console.log(`✓ Actualizados ${toWrite.length} combos. Recarga TPV.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
