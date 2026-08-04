/**
 * Solo lectura: qué hay en TPV de la empresa Modomio (y marcas) vs Excel limpio.
 * En VPS: node scripts/diag-modomio-tpv-vs-excel.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const HOYPECAMOS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const MODOMIO_BIZ = '33821959-ae50-4e52-bfea-ea2b145faeac';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=120000`, {
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

function bizId(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

/** Familias del Excel que NO van a marca (import limpia brandIds). */
function isExcelSharedFamily(category) {
  const c = fold(category);
  return (
    c === 'bebidas' ||
    c === 'bebida' ||
    c === 'complementos' ||
    c === 'complemento' ||
    c === 'extras' ||
    c === 'postres' ||
    c === 'postre' ||
    c === 'salsas' ||
    c === 'otros' ||
    /cerveza/.test(c) ||
    /^vinos?$/.test(c) ||
    c === 'vino'
  );
}

function isTpvSellable(d) {
  if (!d || d.deletedAt) return false;
  if (d.active === false) return false;
  if (d.type && d.type !== 'catalog_item') return false;
  if (d.itemType !== 'product' && d.itemType !== 'combo') return false;
  const mod = d.module || 'catalog';
  if (mod === 'stock') return false;
  if (d.isStockItem === true && String(d.stockCategory || '') === 'ingredient') return false;
  return true;
}

function flagsUnusual(item, brandById, pizzaBrandIds) {
  const flags = [];
  const cat = String(item.category || '').trim();
  const catF = fold(cat);
  const nameF = fold(item.name);
  const brandIds = (item.brandIds || []).map((id) => String(id).trim()).filter(Boolean);
  const onPizzaLine = brandIds.some((id) => pizzaBrandIds.has(id)) || brandIds.length === 0;

  if (isExcelSharedFamily(cat) && brandIds.length > 0) {
    flags.push(`familia_excel_sin_marca_pero_con_marca:[${brandIds.map((id) => brandById.get(id) || id.slice(0, 8)).join(',')}]`);
  }
  if (
    onPizzaLine &&
    (/burger|hamburg|taco|wrap|nugget|hot.?dog/i.test(catF)
      || (/burger|hamburg|taco|crispy|smash/i.test(nameF) && !/pizza|calzone|modomio/i.test(nameF)))
  ) {
    flags.push('parece_blackburger_en_linea_pizza');
  }
  if (/especialidad/.test(catF)) flags.push('categoria_Especialidad_(deberia_Pizzas?)');
  if (!cat) flags.push('sin_categoria');
  if (brandIds.length === 0 && !isExcelSharedFamily(cat) && /pizza|calzone|combo|entrante|pasta/i.test(catF)) {
    flags.push('linea_comercial_sin_marca');
  }
  if (brandIds.length > 1) flags.push(`multi_marca:${brandIds.length}`);
  if (item.isStockItem === true) flags.push('isStockItem');
  if ((item.module || 'catalog') !== 'catalog') flags.push(`module=${item.module}`);
  return flags;
}

async function main() {
  const [catalog, brandsRaw, businesses] = await Promise.all([
    allDocs('bbddsaas-catalog'),
    allDocs('bbddsaas-brands').catch(() => []),
    allDocs('businesses'),
  ]);

  // Foco principal: empresa «modomio». También listamos hoypecamos por contraste.
  const focusBiz = MODOMIO_BIZ;
  const contrastBiz = HOYPECAMOS;
  const bizIds = new Set([focusBiz, contrastBiz]);
  const bizList = businesses.filter((b) => bizIds.has(bizId(b)));
  console.log('=== Empresas Pau relevantes ===');
  for (const biz of bizList) {
    console.log({
      name: biz?.name || null,
      business_id: bizId(biz),
      businessType: biz?.businessType || null,
    });
  }

  const brandsAll = (brandsRaw || []).filter((b) => !b.deletedAt && bizIds.has(bizId(b)));
  const brands = brandsAll.filter((b) => bizId(b) === focusBiz);
  const brandsHoy = brandsAll.filter((b) => bizId(b) === contrastBiz);
  const brandById = new Map(brandsAll.map((b) => [String(b._id), b.name]));

  console.log('\n=== Marcas empresa modomio ===');
  if (brands.length === 0) console.log('(ninguna)');
  for (const b of brands) {
    console.log(`- ${b.name} (${b._id}) cats=[${(b.catalogCategories || []).join(' | ')}]`);
  }
  console.log('\n=== Marcas empresa hoypecamos (contraste) ===');
  for (const b of brandsHoy) {
    console.log(`- ${b.name} (${b._id}) cats=[${(b.catalogCategories || []).join(' | ')}]`);
  }

  // Línea pizza: marcas cuyo nombre es modomio / default / pizza-ish, o todas si solo hay una
  const pizzaBrandIds = new Set(
    brands
      .filter((b) => /modomio|pizza|default|principal/i.test(String(b.name || '')) || brands.length === 1)
      .map((b) => String(b._id)),
  );
  if (pizzaBrandIds.size === 0) {
    for (const b of brands) pizzaBrandIds.add(String(b._id));
  }
  console.log('\n=== IDs tratados como línea pizza/Modomio ===', [...pizzaBrandIds]);

  const sharedOnMultipleBrands = new Map();
  for (const b of brands) {
    for (const cat of b.catalogCategories || []) {
      const k = fold(cat);
      if (!sharedOnMultipleBrands.has(k)) sharedOnMultipleBrands.set(k, []);
      sharedOnMultipleBrands.get(k).push(b.name);
    }
  }
  console.log('\n=== Organizadores en reglas de VARIAS marcas ===');
  for (const [k, names] of [...sharedOnMultipleBrands.entries()].sort()) {
    if (new Set(names).size >= 2) {
      console.log(`  · ${k}: ${[...new Set(names)].join(', ')}`);
    }
  }

  const inBiz = catalog.filter(
    (d) => d.type === 'catalog_item' && !d.deletedAt && bizIds.has(bizId(d)),
  );
  const sellable = inBiz.filter(isTpvSellable);

  const onModomioBrand = sellable.filter((d) =>
    (d.brandIds || []).map(String).includes(modomioId),
  );

  // Lo que verías dentro de pestaña Modomio si ocultamos organizadores multi-marca
  // (misma idea que tpvCatalogNavigation).
  const multiBrandCats = new Set(
    [...sharedOnMultipleBrands.entries()]
      .filter(([, names]) => new Set(names).size >= 2)
      .map(([k]) => k),
  );
  // también por productos de 2+ marcas
  const catToBrandIds = new Map();
  for (const d of sellable) {
    const k = fold(d.category);
    if (!k) continue;
    if (!catToBrandIds.has(k)) catToBrandIds.set(k, new Set());
    for (const id of d.brandIds || []) catToBrandIds.get(k).add(String(id));
  }
  for (const [k, ids] of catToBrandIds) {
    if (ids.size >= 2) multiBrandCats.add(k);
  }

  const insideModomioTab = onModomioBrand.filter((d) => {
    const k = fold(d.category);
    return !k || !multiBrandCats.has(k);
  });

  console.log('\n=== Totales TPV Disarmink ===');
  console.log({
    catalog_empresa: inBiz.length,
    sellable_tpv: sellable.length,
    con_brandIds_Modomio: onModomioBrand.length,
    visibles_en_pestana_Modomio_tras_sacar_compartidos: insideModomioTab.length,
  });

  // Agrupar pestaña Modomio
  const byCat = new Map();
  for (const d of insideModomioTab) {
    const cat = String(d.category || '(sin categoría)').trim() || '(sin categoría)';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(d);
  }

  console.log('\n=== Dentro de pestaña Modomio (por organizador) ===');
  for (const cat of [...byCat.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
    const items = byCat.get(cat).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
    console.log(`\n[${cat}] (${items.length})`);
    for (const d of items) {
      const price = Number(d.unitPrice || 0).toFixed(2);
      console.log(`  - ${d.name} | ${price}€ | type=${d.itemType}`);
    }
  }

  // Fuera de lo común vs Excel
  const unusual = [];
  for (const d of onModomioBrand) {
    const f = flagsUnusual(d, brandById);
    if (f.length) unusual.push({ d, f });
  }
  // también sellable compartidos mal etiquetados que "contaminan" vista Todos/Modomio mentalmente
  for (const d of sellable) {
    if ((d.brandIds || []).map(String).includes(modomioId)) continue;
    const cat = String(d.category || '');
    if (!isExcelSharedFamily(cat)) continue;
    // no listar todos los genéricos; solo si alguien los espera en Modomio
  }

  console.log('\n=== FUERA DE LO COMÚN (tienen Modomio y no encajan con Excel limpio) ===');
  if (unusual.length === 0) {
    console.log('(ninguno)');
  } else {
    unusual.sort((a, b) => String(a.d.name).localeCompare(String(b.d.name), 'es'));
    for (const { d, f } of unusual) {
      console.log(
        `  · ${d.name} | cat=${d.category || '-'} | ${Number(d.unitPrice || 0).toFixed(2)}€ | ${f.join(' + ')}`,
      );
    }
  }

  // Resumen: categorías en Modomio que Excel no pondría en marca
  const badCats = [...new Set(unusual.map(({ d }) => String(d.category || '').trim()).filter(Boolean))];
  console.log('\n=== Resumen categorías raras con brand Modomio ===');
  console.log(badCats.length ? badCats.join(', ') : '(ninguna)');

  // Productos en pestaña Modomio que NO son pizza/combo/entrante típicos
  console.log('\n=== En pestaña Modomio: nombres/cats poco típicos de Excel pizza ===');
  const oddInTab = insideModomioTab.filter((d) => {
    const cat = fold(d.category);
    const name = fold(d.name);
    const okCat = /pizza|calzone|combo|entrante|pasta|focaccia|especialidad|mitad/.test(cat);
    const okName = /pizza|calzone|combo|modomio|mitad|focaccia/.test(name);
    return !okCat && !okName;
  });
  if (oddInTab.length === 0) console.log('(ninguno raro por nombre/categoría)');
  else {
    for (const d of oddInTab.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))) {
      console.log(`  · ${d.name} | cat=${d.category} | ${Number(d.unitPrice || 0).toFixed(2)}€`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
