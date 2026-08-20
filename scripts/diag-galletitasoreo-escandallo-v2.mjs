/**
 * Diagnóstico fino GALLETITASoreo: marcas del business + escandallo por marca.
 * Remoto: node scripts/remote-run-script.mjs diag-galletitasoreo-escandallo-v2.mjs
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const USER = process.env.COUCHDB_USER || 'vertialadmin';
const PASS = process.env.COUCHDB_PASSWORD || 'uriel12345';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const BIZ = '64182188-d625-4e5e-86ae-fdba1c47d373';
const OWNER = 'e94ccc03-5399-40a8-8e92-740bd66f38e0';
const CATALOG_DB = 'bbddsaas-catalog';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function costingStatus(item) {
  const cf = item?.customFields || {};
  const type = String(cf.costingType || '').trim();
  const recipe = Array.isArray(cf.costingRecipe) ? cf.costingRecipe : [];
  if (type === 'recipe' && recipe.length > 0) return 'recipe';
  if (type === 'fixed') return 'fixed';
  if ((Number(item?.costPrice) || 0) > 0) return 'fixed';
  if (recipe.length > 0) return 'recipe';
  return 'none';
}

async function main() {
  const docs = await allDocs(CATALOG_DB);
  const brands = docs.filter(
    (d) => d.type === 'brand' && !d.deletedAt && String(d.business_id || d.businessId || '') === BIZ,
  );
  console.log('=== BRANDS GALLETITASoreo ===');
  for (const b of brands) {
    console.log(
      JSON.stringify({
        _id: b._id,
        name: b.name,
        deliveryLineKind: b.deliveryLineKind || null,
        active: b.active !== false,
        catalogCategories: b.catalogCategories || [],
      }),
    );
  }
  const brandIds = new Set(brands.map((b) => b._id));

  const items = docs.filter(
    (d) =>
      d &&
      !d.deletedAt &&
      String(d.user_id || '') === OWNER &&
      d.module === 'catalog' &&
      (d.itemType === 'product' || d.itemType === 'combo' || !d.itemType),
  );

  const scoped = items.filter((it) => {
    const bids = Array.isArray(it.brandIds) ? it.brandIds : [];
    if (bids.some((id) => brandIds.has(id))) return true;
    // items with business_id
    if (String(it.business_id || it.businessId || '') === BIZ) return true;
    return false;
  });

  const sharedNoBrand = items.filter((it) => {
    const bids = Array.isArray(it.brandIds) ? it.brandIds : [];
    return bids.length === 0 && !it.business_id && !it.businessId;
  });

  console.log('\nitems owner catalog', items.length);
  console.log('scoped to GALLETITAS brands/biz', scoped.length);
  console.log('owner sin marca (compartidos?)', sharedNoBrand.length);

  const status = { recipe: 0, fixed: 0, none: 0 };
  const byBrand = new Map();
  for (const it of scoped) {
    const st = costingStatus(it);
    status[st] += 1;
    const bids = Array.isArray(it.brandIds) ? it.brandIds : [];
    const key = bids.filter((id) => brandIds.has(id)).join(',') || '(sin marca biz)';
    const cur = byBrand.get(key) || { total: 0, recipe: 0, fixed: 0, none: 0, cats: new Set() };
    cur.total += 1;
    cur[st] += 1;
    cur.cats.add(String(it.category || ''));
    byBrand.set(key, cur);
  }
  console.log('\n=== COSTING SCOPED ===', status);
  for (const [k, v] of byBrand) {
    const names = k
      .split(',')
      .map((id) => brands.find((b) => b._id === id)?.name || id)
      .join(' | ');
    console.log(
      JSON.stringify({
        brands: names,
        total: v.total,
        recipe: v.recipe,
        fixed: v.fixed,
        none: v.none,
        categories: [...v.cats].sort(),
      }),
    );
  }

  // delivery config ingredients
  const deliveryDb = 'bbddsaas-delivery';
  const delDocs = await allDocs(deliveryDb);
  const configs = delDocs.filter(
    (d) =>
      (d.type === 'delivery_config' || d._id?.includes('config') || d.storeIngredients) &&
      String(d.user_id || '') === OWNER,
  );
  console.log('\n=== DELIVERY CONFIGS ===', configs.length);
  for (const c of configs) {
    const ings = Array.isArray(c.storeIngredients) ? c.storeIngredients : [];
    console.log(
      JSON.stringify({
        _id: c._id,
        type: c.type,
        ingredients: ings.length,
        sample: ings.slice(0, 8).map((i) => i.name || i.id),
      }),
    );
  }

  console.log('\n=== SAMPLE SCOPED NONE ===');
  for (const it of scoped.filter((x) => costingStatus(x) === 'none').slice(0, 15)) {
    console.log(
      JSON.stringify({
        name: it.name,
        category: it.category,
        brandIds: it.brandIds,
        unitPrice: it.unitPrice,
        ingredients: (it.ingredients || it.customFields?.ingredients || '').toString().slice(0, 80),
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
