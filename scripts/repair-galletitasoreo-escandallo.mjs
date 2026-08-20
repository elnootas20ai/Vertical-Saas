/**
 * GALLETITASoreo (prod):
 * 1) Restaura productos soft-deleted de BeStrong + foodisgood (+ carta del biz)
 * 2) Marcas → deliveryLineKind=mixed_restaurant
 * 3) Genera escandallo (receta o coste fijo aprox.)
 *
 * Dry-run:  node scripts/remote-run-script.mjs repair-galletitasoreo-escandallo.mjs
 * Aplicar:  node scripts/remote-run-script.mjs repair-galletitasoreo-escandallo.mjs -- --apply
 */
const APPLY = process.argv.includes('--apply');
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const USER = process.env.COUCHDB_USER || 'vertialadmin';
const PASS = process.env.COUCHDB_PASSWORD || 'uriel12345';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

const BIZ = '64182188-d625-4e5e-86ae-fdba1c47d373';
const OWNER = 'e94ccc03-5399-40a8-8e92-740bd66f38e0';
const CATALOG_DB = 'bbddsaas-catalog';
const DELIVERY_DB = 'bbddsaas-delivery';
const TARGET_KIND = 'mixed_restaurant';
const BRAND_IDS = [
  'brand-114aef23-c3dd-462c-8c85-b77d57943036', // BeStrong
  'brand-e893fd42-124d-4149-bc24-a64ab2abcc3a', // foodisgood
];

async function couch(method, path, body) {
  const res = await fetch(`${COUCH}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data.error || ''} ${data.reason || ''}`);
  return data;
}

async function allDocs(db) {
  const data = await couch('GET', `/${encodeURIComponent(db)}/_all_docs?include_docs=true`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIngredients(raw) {
  return String(raw || '')
    .split(/[,;\n|]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

const CAT_FIXED = [
  { p: [/bebida/, /cerveza/, /vino/, /combinado/], cost: 0.55 },
  { p: [/cafe/, /desayuno/, /bolleria/], cost: 0.35 },
  { p: [/postre/, /dulce/], cost: 1.2 },
  { p: [/complemento/, /guarnicion/], cost: 1.15 },
  { p: [/tapa/, /picoteo/], cost: 2.2 },
  { p: [/ensalada/], cost: 2.4 },
  { p: [/burger/, /hamburguesa/], cost: 2.6 },
  { p: [/wrap/], cost: 2.8 },
  { p: [/bowl/, /poke/], cost: 3.4 },
  { p: [/pasta/], cost: 3.6 },
  { p: [/plato/, /principal/, /carne/, /pescado/], cost: 4.2 },
  { p: [/combo/, /menu/, /menú/, /pack/, /brunch/], cost: 5.5 },
];

function fixedForCategory(category, unitPrice) {
  const cat = fold(category);
  for (const row of CAT_FIXED) {
    if (row.p.some((re) => re.test(cat))) return row.cost;
  }
  const sale = Number(unitPrice) || 0;
  if (sale > 0) return Math.round(Math.min(Math.max(sale * 0.3, 0.9), sale * 0.42) * 100) / 100;
  return 1.5;
}

function findIng(name, store) {
  const f = fold(name);
  if (!f) return null;
  const exact = store.find((i) => fold(i.name) === f);
  if (exact) return exact;
  const partial = store
    .filter((i) => {
      const n = fold(i.name);
      return n.includes(f) || f.includes(n);
    })
    .sort((a, b) => fold(a.name).length - fold(b.name).length);
  return partial[0] || null;
}

function buildRecipe(item, store) {
  const names = parseIngredients(item.customFields?.ingredients);
  if (!names.length) return null;
  const lines = [];
  const used = new Set();
  for (const raw of names) {
    const ing = findIng(raw, store);
    if (!ing || used.has(ing.id)) continue;
    used.add(ing.id);
    const unit = String(ing.unit || 'ud');
    const qty = unit === 'kg' || unit === 'l' ? 0.05 : 1;
    lines.push({
      ingredientId: ing.id,
      name: ing.name,
      quantity: qty,
      unit,
    });
  }
  return lines.length ? lines : null;
}

function recipeCost(lines, storeById) {
  let total = 0;
  for (const line of lines) {
    const ing = storeById.get(line.ingredientId);
    const base = Number(ing?.baseCost) || 0;
    total += base * (Number(line.quantity) || 0);
  }
  return Math.round(total * 100) / 100;
}

async function putDoc(db, doc) {
  return couch('PUT', `/${encodeURIComponent(db)}/${encodeURIComponent(doc._id)}`, doc);
}

function isGalletitasProduct(d) {
  if (!d || String(d.user_id || '') !== OWNER) return false;
  if (d.type === 'brand') return false;
  if (d.module && d.module !== 'catalog') return false;
  if (Array.isArray(d.brandIds) && d.brandIds.some((id) => BRAND_IDS.includes(id))) return true;
  if (String(d.business_id || d.businessId || '') === BIZ) return true;
  return false;
}

async function main() {
  console.log(APPLY ? '=== APPLY ===' : '=== DRY-RUN (no escribe) ===');
  const docs = await allDocs(CATALOG_DB);
  const brands = docs.filter((d) => BRAND_IDS.includes(d._id));
  console.log(
    'marcas',
    brands.map((b) => ({ id: b._id, name: b.name, kind: b.deliveryLineKind || null, deletedAt: b.deletedAt || null })),
  );

  const targets = docs.filter(isGalletitasProduct);
  const deleted = targets.filter((d) => d.deletedAt);
  const active = targets.filter((d) => !d.deletedAt);
  console.log('productos GALLETITAS', { total: targets.length, active: active.length, deleted: deleted.length });

  const delDocs = await allDocs(DELIVERY_DB);
  const cfg = delDocs.find(
    (d) => d._id === `dlvconf-${OWNER}` || (d.type === 'delivery_config' && d.user_id === OWNER),
  );
  const store = Array.isArray(cfg?.storeIngredients) ? cfg.storeIngredients : [];
  const storeById = new Map(store.map((i) => [i.id, i]));
  console.log('storeIngredients', store.length);

  let brandsPatched = 0;
  for (const brand of brands) {
    if (String(brand.deliveryLineKind || '') === TARGET_KIND) continue;
    console.log(`marca ${brand.name}: ${brand.deliveryLineKind || '(vacío)'} → ${TARGET_KIND}`);
    if (APPLY) {
      await putDoc(CATALOG_DB, {
        ...brand,
        deliveryLineKind: TARGET_KIND,
        updatedAt: new Date().toISOString(),
      });
    }
    brandsPatched += 1;
  }

  let restored = 0;
  let recipe = 0;
  let fixed = 0;
  let skipped = 0;
  let written = 0;

  for (const item of targets) {
    let next = { ...item, customFields: { ...(item.customFields || {}) } };
    let changed = false;

    if (next.deletedAt) {
      delete next.deletedAt;
      next.active = true;
      restored += 1;
      changed = true;
      console.log(`restore ${next.name}`);
    }

    const cf = next.customFields;
    const hasRecipe = cf.costingType === 'recipe' && Array.isArray(cf.costingRecipe) && cf.costingRecipe.length > 0;
    const hasFixed = cf.costingType === 'fixed' && (Number(next.costPrice) || 0) > 0;
    if (hasRecipe || hasFixed) {
      skipped += 1;
    } else {
      const lines = buildRecipe(next, store);
      if (lines) {
        const cost = recipeCost(lines, storeById);
        const fallback = fixedForCategory(next.category, next.unitPrice);
        const useCost = cost > 0.05 ? cost : fallback;
        next.customFields.costingType = 'recipe';
        next.customFields.costingRecipe = lines;
        next.costPrice = useCost;
        recipe += 1;
        changed = true;
        console.log(`recipe  ${next.name} → ${useCost}€ (${lines.length} ing)`);
      } else {
        const cost = fixedForCategory(next.category, next.unitPrice);
        next.customFields.costingType = 'fixed';
        delete next.customFields.costingRecipe;
        next.costPrice = cost;
        fixed += 1;
        changed = true;
        console.log(`fixed   ${next.name} → ${cost}€`);
      }
    }

    if (!changed) continue;
    next.updatedAt = new Date().toISOString();
    if (APPLY) {
      await putDoc(CATALOG_DB, next);
      written += 1;
    }
  }

  console.log('\nRESUMEN', {
    brandsPatched,
    restored,
    recipe,
    fixed,
    skippedCostingOk: skipped,
    written: APPLY ? written : 0,
    apply: APPLY,
  });
  if (!APPLY) console.log('\nPara escribir en prod: -- --apply');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
