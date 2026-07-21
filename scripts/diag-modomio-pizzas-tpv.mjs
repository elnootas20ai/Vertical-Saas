/**
 * Solo lectura: pizzas de Modomio (Pau) y por qué podrían no salir en TPV.
 * En VPS: node scripts/diag-modomio-pizzas-tpv.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const MODOMIO_BIZ = '33821959-ae50-4e52-bfea-ea2b145faeac';
const ADMIN = 'e94ccc03-5399-40a8-8e92-740bd66f38e0';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error} ${data.reason || ''}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isPizzaLike(item) {
  const cat = fold(item.category);
  const name = fold(item.name);
  return /pizza|calzone|pizzer/.test(cat) || /pizza|calzone/.test(name);
}

function bizId(item) {
  return String(item.business_id || item.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function reasonsHiddenFromTpv(item, brandIdSet) {
  const reasons = [];
  if (item.deletedAt) reasons.push('borrado (deletedAt)');
  if (item.active === false) reasons.push('active=false');
  if ((item.module || 'catalog') !== 'catalog') reasons.push(`module=${item.module}`);
  if (item.isStockItem === true) reasons.push('isStockItem');
  if (item.itemType && item.itemType !== 'product' && item.itemType !== 'combo') {
    reasons.push(`itemType=${item.itemType}`);
  }
  const bid = bizId(item);
  if (bid && bid !== MODOMIO_BIZ) reasons.push(`business_id=${bid} (otra empresa)`);
  if (!bid) {
    const brands = (item.brandIds || []).map((id) => String(id).trim()).filter(Boolean);
    if (brands.length === 0) reasons.push('sin business_id ni brandIds');
    else if (!brands.some((id) => brandIdSet.has(id))) reasons.push('brandIds no de Modomio');
  }
  const v = fold(item.vertical);
  if (v && v !== 'delivery') reasons.push(`vertical=${item.vertical}`);
  return reasons;
}

async function main() {
  const [accounts, businesses, catalog, brandsRaw] = await Promise.all([
    allDocs('accounts'),
    allDocs('businesses'),
    allDocs('bbddsaas-catalog'),
    allDocs('bbddsaas-brands').catch(() => []),
  ]);

  let account =
    accounts.find((a) => String(a.user_id || '') === ADMIN) ||
    accounts.find((a) => /pau|royo|modomio|disarmink|hoypecamos/i.test(`${a.email} ${a.fullName} ${a.companyName}`));

  const biz =
    businesses.find((b) => String(b.business_id || b._id || '').replace(/^business:/, '') === MODOMIO_BIZ) ||
    businesses.find((b) => /modomio/i.test(String(b.name || '')));

  const ownerId = String(biz?.owner_user_id || account?.user_id || ADMIN).trim();
  if (!account) account = accounts.find((a) => String(a.user_id || '') === ownerId);

  console.log('=== Cuenta / empresa ===');
  console.log({
    email: account?.email || null,
    name: account?.fullName || account?.companyName || null,
    user_id: ownerId,
    empresa: biz?.name || null,
    business_id: MODOMIO_BIZ,
    businessType: biz?.businessType || null,
  });

  const brands = (brandsRaw || []).filter(
    (b) =>
      !b.deletedAt &&
      (String(b.business_id || b.businessId || '').replace(/^business:/, '') === MODOMIO_BIZ ||
        String(b.user_id || '') === ownerId),
  );
  const brandIdSet = new Set(brands.map((b) => String(b._id || '').trim()).filter(Boolean));
  console.log(
    'Marcas:',
    brands.map((b) => `${b.name}(${b._id?.slice(0, 8)})`).join(', ') || '(ninguna en bbddsaas-brands)',
  );

  const owned = catalog.filter(
    (d) =>
      d.type === 'catalog_item' &&
      !d.deletedAt &&
      (String(d.user_id || '') === ownerId || bizId(d) === MODOMIO_BIZ),
  );

  const inBiz = owned.filter((d) => {
    const bid = bizId(d);
    if (bid) return bid === MODOMIO_BIZ;
    const brandsOk = (d.brandIds || []).some((id) => brandIdSet.has(String(id).trim()));
    return brandsOk || (!bid && String(d.user_id || '') === ownerId);
  });

  const sellable = inBiz.filter((d) => (d.module || 'catalog') === 'catalog');
  const pizzas = sellable.filter(isPizzaLike);

  console.log('\n=== Totales ===');
  console.log({
    catalog_cuenta: owned.length,
    en_modomio_aprox: inBiz.length,
    sellable_catalog: sellable.length,
    pizzas_like: pizzas.length,
  });

  const byCat = new Map();
  for (const p of pizzas) {
    const k = String(p.category || '(vacío)').trim() || '(vacío)';
    byCat.set(k, (byCat.get(k) || 0) + 1);
  }
  console.log(
    'Pizzas por categoría:',
    [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}(${v})`)
      .join(', '),
  );

  const hidden = [];
  const visible = [];
  for (const p of pizzas) {
    const why = reasonsHiddenFromTpv(p, brandIdSet);
    const row = {
      name: p.name,
      category: p.category || '',
      sku: p.sku || '',
      active: p.active !== false,
      available: p.available !== false,
      price: Number(p.unitPrice || 0),
      brandIds: (p.brandIds || []).length,
      business_id: bizId(p) || null,
      vertical: p.vertical || null,
      itemType: p.itemType || 'product',
      why,
    };
    if (why.length) hidden.push(row);
    else visible.push(row);
  }

  console.log(`\n=== Pizzas VISIBLES TPV (aprox): ${visible.length} ===`);
  for (const p of visible.sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
    console.log(`  OK  ${p.name} | ${p.category} | ${p.price.toFixed(2)}€ | active=${p.active} available=${p.available}`);
  }

  console.log(`\n=== Pizzas OCULTAS / dudosas: ${hidden.length} ===`);
  for (const p of hidden.sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
    console.log(`  !!  ${p.name} | ${p.category} | motivos: ${p.why.join('; ')}`);
  }

  const inactive = pizzas.filter((p) => p.active === false);
  const unavailable = pizzas.filter((p) => p.available === false);
  console.log('\n=== Resumen problemas ===');
  console.log({
    active_false: inactive.length,
    available_false: unavailable.length,
    hidden_total: hidden.length,
    visible_total: visible.length,
  });
  if (inactive.length) {
    console.log('active=false:', inactive.map((p) => p.name).join(' · '));
  }
  if (unavailable.length) {
    console.log('available=false (sigue en TPV si active):', unavailable.map((p) => p.name).join(' · '));
  }

  console.log('\n=== Detalle ocultas (flags) ===');
  for (const p of pizzas) {
    const why = reasonsHiddenFromTpv(p, brandIdSet);
    if (!why.length) continue;
    console.log(
      JSON.stringify({
        name: p.name,
        isStockItem: p.isStockItem === true,
        module: p.module || 'catalog',
        stockCategory: p.stockCategory || null,
        itemType: p.itemType || null,
        active: p.active !== false,
        unitPrice: Number(p.unitPrice || 0),
        brandIds: (p.brandIds || []).length,
        why,
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
