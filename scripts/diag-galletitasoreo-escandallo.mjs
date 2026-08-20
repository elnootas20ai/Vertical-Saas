/**
 * Diagnóstico solo lectura: empresa galletitasoreo + marcas + escandallo.
 * Remoto: node scripts/remote-run-script.mjs diag-galletitasoreo-escandallo.mjs
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const USER = process.env.COUCHDB_USER || 'vertialadmin';
const PASS = process.env.COUCHDB_PASSWORD || 'uriel12345';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');
const NEEDLE = String(process.argv[2] || 'galletitas').toLowerCase();

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error} ${data.reason || ''}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function matchText(...parts) {
  return parts.map((p) => String(p || '').toLowerCase()).join(' ').includes(NEEDLE);
}

function costingStatus(item) {
  const cf = item?.customFields || {};
  const type = String(cf.costingType || '').trim();
  const recipe = Array.isArray(cf.costingRecipe) ? cf.costingRecipe : [];
  if (type === 'recipe' && recipe.length > 0) return 'recipe';
  if (type === 'fixed' || (Number(item?.costPrice) || 0) > 0) return 'fixed';
  if (recipe.length > 0) return 'recipe';
  return 'none';
}

async function main() {
  console.log('COUCH', COUCH, 'needle', NEEDLE);
  const [businesses, accounts, brandsDb] = await Promise.all([
    allDocs('businesses'),
    allDocs('accounts'),
    allDocs('bbddsaas-brands').catch(() => allDocs('brands').catch(() => [])),
  ]);

  const bizHits = businesses.filter(
    (b) => !b.deletedAt && matchText(b.name, b.slug, b.companyName, b.legalName),
  );
  const accHits = accounts.filter(
    (a) => matchText(a.email, a.name, a.companyName, a.businessName) || matchText(a.email?.split('@')[0]),
  );

  console.log('\n=== BUSINESSES ===');
  for (const b of bizHits) {
    console.log(
      JSON.stringify({
        name: b.name,
        business_id: b.business_id || b._id,
        businessType: b.businessType,
        owner_user_id: b.owner_user_id,
        vertical: b.vertical || b.catalogVertical || null,
      }),
    );
  }
  if (!bizHits.length) {
    console.log('(ninguna). Buscando en accounts…');
    for (const a of accHits.slice(0, 20)) {
      console.log(JSON.stringify({ email: a.email, user_id: a.user_id || a._id, name: a.name }));
    }
    // fuzzy: list all business names containing oreo / galleta
    const fuzzy = businesses.filter(
      (b) =>
        !b.deletedAt &&
        /oreo|galleta|galleti/i.test(String(b.name || '') + String(b.slug || '')),
    );
    console.log('\n=== FUZZY businesses oreo/galleta ===');
    for (const b of fuzzy) {
      console.log(JSON.stringify({ name: b.name, business_id: b.business_id || b._id, owner: b.owner_user_id, type: b.businessType }));
    }
  }

  const owners = new Set(
    [...bizHits, ...accHits]
      .map((x) => String(x.owner_user_id || x.user_id || x._id || '').trim())
      .filter(Boolean),
  );
  for (const b of bizHits) owners.add(String(b.owner_user_id || '').trim());

  // If still empty, try email local-part
  if (!owners.size) {
    for (const a of accounts) {
      const local = String(a.email || '').split('@')[0].toLowerCase();
      if (local.includes(NEEDLE) || /galletitas|oreo/.test(local)) {
        owners.add(String(a.user_id || a._id || '').trim());
        console.log('ACCOUNT HIT', a.email, a.user_id || a._id);
      }
    }
  }

  const ownerBiz = businesses.filter(
    (b) => !b.deletedAt && owners.has(String(b.owner_user_id || '').trim()),
  );
  console.log('\n=== OWNER BUSINESSES ===');
  for (const b of ownerBiz) {
    console.log(
      JSON.stringify({
        name: b.name,
        business_id: b.business_id || b._id,
        type: b.businessType,
        owner: b.owner_user_id,
      }),
    );
  }

  const brandDocs = (brandsDb || []).filter((d) => d && !d.deletedAt && (d.type === 'brand' || d.deliveryLineKind || d.name));
  const relevantBrands = brandDocs.filter((br) => {
    const bid = String(br.businessId || br.business_id || '').trim();
    const uid = String(br.user_id || br.owner_user_id || '').trim();
    return ownerBiz.some((b) => String(b.business_id || b._id) === bid) || owners.has(uid);
  });

  console.log('\n=== BRANDS ===');
  for (const br of relevantBrands) {
    console.log(
      JSON.stringify({
        _id: br._id,
        name: br.name,
        deliveryLineKind: br.deliveryLineKind || null,
        businessId: br.businessId || br.business_id || null,
        active: br.active !== false,
      }),
    );
  }

  // Catalog DB naming: often bbddsaas-catalog or per-user
  const dbsRes = await fetch(`${COUCH}/_all_dbs`, { headers: { Authorization: AUTH } });
  const dbs = await dbsRes.json();
  const catalogDbs = dbs.filter((d) => /catalog/i.test(d));
  console.log('\n=== CATALOG DBS (sample) ===', catalogDbs.slice(0, 15), 'total', catalogDbs.length);

  for (const owner of owners) {
    if (!owner) continue;
    console.log('\n=== OWNER', owner, '===');
    const acc = accounts.find((a) => String(a.user_id || a._id) === owner);
    if (acc) console.log('email', acc.email);

    // Try common catalog db patterns
    const candidates = [
      `bbddsaas-catalog-${owner}`,
      `catalog-${owner}`,
      `bbddsaas_catalog_${owner}`,
      ...catalogDbs.filter((d) => d.includes(owner.slice(0, 8))),
    ];
    let items = [];
    let usedDb = null;
    for (const db of [...new Set(candidates)]) {
      if (!dbs.includes(db)) continue;
      try {
        const docs = await allDocs(db);
        const catalog = docs.filter(
          (d) =>
            d &&
            !d.deletedAt &&
            (d.type === 'catalog_item' || d.module === 'catalog' || d.itemType === 'product'),
        );
        if (catalog.length) {
          items = catalog;
          usedDb = db;
          break;
        }
      } catch (e) {
        console.log('skip db', db, e.message);
      }
    }

    // Fallback: shared catalog db filtered by user_id
    if (!items.length) {
      for (const db of catalogDbs) {
        try {
          const docs = await allDocs(db);
          const catalog = docs.filter(
            (d) =>
              d &&
              !d.deletedAt &&
              String(d.user_id || '') === owner &&
              (d.module === 'catalog' || d.type === 'catalog_item' || d.itemType === 'product'),
          );
          if (catalog.length > items.length) {
            items = catalog;
            usedDb = db;
          }
        } catch {
          /* ignore */
        }
      }
    }

    console.log('catalogDb', usedDb, 'items', items.length);
    const byBrand = new Map();
    const statusCounts = { recipe: 0, fixed: 0, none: 0 };
    const sampleNone = [];
    for (const item of items) {
      if (item.module === 'stock' || item.itemType === 'ingredient') continue;
      const st = costingStatus(item);
      statusCounts[st] += 1;
      const bids = Array.isArray(item.brandIds) ? item.brandIds : [];
      const key = bids.length ? bids.sort().join(',') : '(sin marca)';
      const cur = byBrand.get(key) || { total: 0, recipe: 0, fixed: 0, none: 0 };
      cur.total += 1;
      cur[st] += 1;
      byBrand.set(key, cur);
      if (st === 'none' && sampleNone.length < 12) {
        sampleNone.push({
          name: item.name,
          category: item.category,
          brandIds: bids,
          costPrice: item.costPrice,
          costingType: item.customFields?.costingType || null,
        });
      }
    }
    console.log('status', statusCounts);
    console.log('byBrandIds');
    for (const [k, v] of [...byBrand.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 20)) {
      const names = k
        .split(',')
        .map((id) => relevantBrands.find((b) => b._id === id)?.name || id)
        .join(' | ');
      console.log(JSON.stringify({ brands: names, ...v }));
    }
    console.log('sample none', JSON.stringify(sampleNone, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
