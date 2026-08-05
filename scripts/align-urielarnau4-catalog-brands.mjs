/**
 * LOCAL ONLY — urielarnau4 / empresa pizzeria.
 * Alinea catálogo + Excel con marcas existentes (pizzeria, Burger, Tacos, Sushi)
 * para que el conteo P/B/T y el import por columna «linea» funcionen.
 *
 *   node scripts/align-urielarnau4-catalog-brands.mjs           # dry-run
 *   node scripts/align-urielarnau4-catalog-brands.mjs --apply   # escribe Couch local + Excel
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import '../config/env.js';

const APPLY = process.argv.includes('--apply');
const EMAIL = 'urielarnau4@gmail.com';
const CATALOG_DB = process.env.VITE_CATALOG_DB || 'urielsaas-catalog';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_EXCEL = path.join(
  process.env.USERPROFILE || process.env.HOME || '.',
  'Desktop',
  'catalogo_urielarnau4_alineado.xlsx',
);

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  if (!raw) return '';
  try {
    const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
    const u = new URL(href);
    const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.origin}${pathPart}`.replace(/\/+$/, '');
  } catch {
    return raw.replace(/^(https?:\/\/)(?:[^/@]+)@/i, '$1').replace(/\/+$/, '');
  }
}

const BASE = couchBaseUrl();
const AUTH =
  process.env.COUCHDB_USER && process.env.COUCHDB_PASSWORD
    ? `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`
    : '';

async function couchJson(method, pathName, body) {
  const res = await fetch(`${BASE}${pathName}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(typeof data === 'object' && data?.reason ? data.reason : `${res.status} ${text}`);
  }
  return data;
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isSharedCategory(category) {
  const c = fold(category);
  return (
    c === 'bebidas' ||
    c === 'bebida' ||
    c === 'cervezas' ||
    c === 'vinos' ||
    c === 'complementos' ||
    c === 'complemento' ||
    c === 'postres' ||
    c === 'postre' ||
    c === 'ingredientes' ||
    c === 'envases' ||
    c === 'consumibles' ||
    c === 'extras' ||
    c === 'salsas' ||
    c === 'otros'
  );
}

/** Heurística: a qué marca comercial va cada producto (por categoría/nombre). */
function guessLineaName(item, brandNames) {
  const cat = fold(item.category);
  const nm = fold(item.name);
  if (isSharedCategory(item.category)) return '';
  if (/taco|mexica|burrito|quesadilla/.test(cat) || /\btacos?\b|\bburritos?\b/.test(nm)) {
    return brandNames.tacos;
  }
  if (/burger|hamburg|smash|top burger/.test(cat) || /burger|hamburg|smash/.test(nm)) {
    return brandNames.burger;
  }
  if (
    /pizza|calzone|premium|especialidad|pizzer/.test(cat) ||
    /pizza|calzone|vesuvio|modomio/.test(nm) ||
    cat === 'combos' ||
    cat === 'combo'
  ) {
    // Combos con “blackburger” → Burger
    if (/black\s*burger|blackburger|burger/.test(nm) && !/pizza|vesuvio|modomio/.test(nm)) {
      return brandNames.burger;
    }
    return brandNames.pizza;
  }
  if (/sushi|roll|poke|nigiri|maki/.test(cat) || /sushi|roll|nigiri|maki/.test(nm)) {
    return brandNames.sushi;
  }
  return '';
}

function ingredientsText(doc) {
  let ing = doc.customFields?.ingredients ?? doc.ingredients ?? '';
  if (Array.isArray(ing)) {
    ing = ing
      .map((x) => (typeof x === 'object' ? x.name || '' : String(x || '')))
      .filter(Boolean)
      .join(', ');
  }
  return String(ing || '').trim();
}

async function main() {
  if (!BASE || !AUTH) throw new Error('Falta COUCHDB_URL / credenciales en .env');

  const accounts = (await couchJson('GET', '/accounts/_all_docs?include_docs=true')).rows
    .map((r) => r.doc)
    .filter(Boolean);
  const acc = accounts.find((a) => fold(a.email) === fold(EMAIL));
  if (!acc) throw new Error(`Cuenta no encontrada: ${EMAIL}`);
  const uid = String(acc.user_id || acc._id).trim();

  const businesses = (await couchJson('GET', '/businesses/_all_docs?include_docs=true')).rows
    .map((r) => r.doc)
    .filter(Boolean);
  const biz = businesses.find(
    (b) => !b.deletedAt && String(b.owner_user_id || '') === uid && fold(b.name) === 'pizzeria',
  );
  if (!biz) throw new Error('Empresa pizzeria no encontrada para urielarnau4');
  const bid = String(biz.business_id || biz._id).trim();

  const allDocs = (await couchJson('GET', `/${CATALOG_DB}/_all_docs?include_docs=true`)).rows
    .map((r) => r.doc)
    .filter(Boolean);

  const brands = allDocs.filter((d) => d.type === 'brand' && String(d.business_id) === bid && !d.deletedAt);
  const byFold = Object.fromEntries(brands.map((b) => [fold(b.name), b]));
  const pizzaBrand = byFold.pizzeria;
  const burgerBrand = byFold.burger;
  const tacosBrand = byFold.tacos;
  const sushiBrand = byFold.sushi;
  if (!pizzaBrand || !burgerBrand || !tacosBrand) {
    throw new Error(
      `Marcas incompletas. Hay: ${brands.map((b) => b.name).join(', ')}`,
    );
  }

  const brandNames = {
    pizza: pizzaBrand.name,
    burger: burgerBrand.name,
    tacos: tacosBrand.name,
    sushi: sushiBrand?.name || 'Sushi',
  };
  const brandIdByLinea = {
    [fold(brandNames.pizza)]: pizzaBrand._id,
    [fold(brandNames.burger)]: burgerBrand._id,
    [fold(brandNames.tacos)]: tacosBrand._id,
    [fold(brandNames.sushi)]: sushiBrand?._id,
  };

  console.log('Cuenta', EMAIL, 'uid', uid);
  console.log('Empresa', biz.name, bid);
  console.log('Marcas', brands.map((b) => `${b.name}[${b.deliveryLineKind || '∅'}]`).join(' · '));
  console.log(APPLY ? 'MODO: APPLY (escribe local)' : 'MODO: dry-run (sin escribir)');

  const patches = [];

  // 1) Tipo de marca pizza vacío → pizza (fallback del conteo P/B/T en combos).
  if (String(pizzaBrand.deliveryLineKind || '').trim() !== 'pizza') {
    patches.push({
      doc: { ...pizzaBrand, deliveryLineKind: 'pizza', updatedAt: new Date().toISOString() },
      why: `marca «${pizzaBrand.name}» → deliveryLineKind=pizza`,
    });
  }

  const items = allDocs.filter(
    (d) => d.type === 'catalog_item' && String(d.business_id) === bid && !d.deletedAt,
  );

  for (const item of items) {
    const next = { ...item };
    let changed = false;
    const reasons = [];

    // Taco Vegano estaba como stock → no cuenta ni se vende bien en TPV.
    if (fold(item.name) === 'taco vegano' && item.isStockItem === true) {
      next.isStockItem = false;
      changed = true;
      reasons.push('isStockItem false (era stock por error)');
    }

    // Pizzas colgadas de marca Tacos → pizzeria.
    const ids = (item.brandIds || []).map(String);
    if (
      ids.includes(tacosBrand._id) &&
      /pizza|premium|especialidad/.test(fold(item.category)) &&
      !/taco/.test(fold(item.category)) &&
      !/\btaco\b/.test(fold(item.name))
    ) {
      next.brandIds = [pizzaBrand._id];
      changed = true;
      reasons.push(`brandIds → ${pizzaBrand.name} (es pizza, no taco)`);
    }

    // Asignar marca por categoría si falta (comida vendible).
    const guessed = guessLineaName(item, brandNames);
    const wantId = guessed ? brandIdByLinea[fold(guessed)] : '';
    const currentIds = (next.brandIds || []).map(String);
    const skipStockMeta =
      fold(item.category) === 'ingredientes' ||
      fold(item.category) === 'envases' ||
      fold(item.category) === 'consumibles';

    if (wantId && !skipStockMeta && !isSharedCategory(item.category)) {
      if (currentIds.length === 0 || (currentIds.length === 1 && currentIds[0] !== wantId && reasons.length === 0)) {
        // Solo rellenar si vacío; no pisar asignaciones manuales salvo el caso pizza↔tacos de arriba.
        if (currentIds.length === 0) {
          next.brandIds = [wantId];
          changed = true;
          reasons.push(`brandIds ← ${guessed} (sin marca)`);
        }
      }
    }

    // Compartidos: sin marca.
    if (isSharedCategory(item.category) && currentIds.length > 0 && !skipStockMeta) {
      // Bebidas/postres/complementos suelen ir sin pestaña de marca comercial.
      if (['bebidas', 'cervezas', 'vinos', 'postres', 'complementos'].includes(fold(item.category))) {
        next.brandIds = [];
        changed = true;
        reasons.push('brandIds [] (familia compartida)');
      }
    }

    if (changed) {
      next.updatedAt = new Date().toISOString();
      patches.push({ doc: next, why: `${item.name}: ${reasons.join('; ')}` });
    }
  }

  console.log(`\nCambios previstos: ${patches.length}`);
  for (const p of patches.slice(0, 40)) console.log(' -', p.why);
  if (patches.length > 40) console.log(` ... +${patches.length - 40} más`);

  if (APPLY && patches.length) {
    const bulk = await couchJson('POST', `/${CATALOG_DB}/_bulk_docs`, {
      docs: patches.map((p) => p.doc),
    });
    const fails = (bulk || []).filter((r) => r.error);
    if (fails.length) {
      console.error('Errores bulk', fails.slice(0, 5));
      throw new Error(`${fails.length} docs fallaron al guardar`);
    }
    console.log(`\nGuardados ${patches.length} docs en ${CATALOG_DB}`);
  }

  // Excel alineado con marcas reales (para reimportar o verificar).
  const sellable = items.filter((d) => {
    if (d.active === false) return false;
    if (fold(d.category) === 'ingredientes') return false;
    if (fold(d.category) === 'envases') return false;
    if (fold(d.category) === 'consumibles') return false;
    return Boolean(d.name);
  });

  // Tras patches en memoria:
  const patchedById = new Map(patches.map((p) => [p.doc._id, p.doc]));
  const effective = sellable.map((d) => patchedById.get(d._id) || d);

  const headers = ['nombre', 'codigo', 'categoria', 'linea', 'precio', 'ingredientes', 'descripcion'];
  const rows = [headers];
  for (const it of effective.sort((a, b) => fold(a.category).localeCompare(fold(b.category)) || fold(a.name).localeCompare(fold(b.name)))) {
    const ids = (it.brandIds || []).map(String);
    let linea = '';
    if (ids.includes(pizzaBrand._id)) linea = pizzaBrand.name;
    else if (ids.includes(burgerBrand._id)) linea = burgerBrand.name;
    else if (ids.includes(tacosBrand._id)) linea = tacosBrand.name;
    else if (sushiBrand && ids.includes(sushiBrand._id)) linea = sushiBrand.name;
    else {
      linea = guessLineaName(it, brandNames);
      if (isSharedCategory(it.category)) linea = '';
    }
    rows.push([
      String(it.name || '').trim(),
      String(it.sku || '').trim(),
      String(it.category || '').trim(),
      linea,
      it.unitPrice ?? it.price ?? '',
      ingredientsText(it),
      String(it.description || '').trim(),
    ]);
  }

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 28 },
    { wch: 10 },
    { wch: 16 },
    { wch: 12 },
    { wch: 8 },
    { wch: 36 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, sheet, 'catalogo');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Excel alineado urielarnau4 (local)'],
      ['Marcas existentes: pizzeria · Burger · Tacos · Sushi'],
      ['Columna linea = nombre exacto de Ajustes → Marca (no BlackBurger/modomio de Pau).'],
      ['Bebidas/postres/complementos: linea vacía (pestaña compartida).'],
      ['Conteo P/B/T usa categoría/nombre + tipo de marca (deliveryLineKind).'],
    ]),
    'info',
  );

  if (APPLY) {
    fs.mkdirSync(path.dirname(OUT_EXCEL), { recursive: true });
    XLSX.writeFile(wb, OUT_EXCEL);
    console.log('\nExcel:', OUT_EXCEL, `(${rows.length - 1} productos)`);
  } else {
    console.log(`\n(Dry-run) Excel se escribiría en ${OUT_EXCEL} con ${rows.length - 1} productos`);
  }

  // Simulación conteo tras parches
  function classify(cat, name, kind) {
    const c = fold(cat);
    const nm = fold(name);
    if (/taco|mexica|burrito|quesadilla|nacho/.test(c) || /\btacos?\b|\bburritos?\b/.test(nm)) return 'taco';
    if (/burger|hamburg|smash|fast\s*food/.test(c) || /burger|hamburg|smash/.test(nm)) return 'burger';
    if (/postre|dessert|helado|tiramisu/.test(c)) return null;
    if (/pizza|calzone|premium|especialidad|pizzer/.test(c) || /pizza|calzone/.test(nm)) return 'pizza';
    if (kind === 'pizza') return 'pizza';
    if (kind === 'burger_fastfood') return 'burger';
    if (kind === 'tacos_mexican') return 'taco';
    return null;
  }
  const kindById = {
    [pizzaBrand._id]: APPLY || patches.some((p) => p.doc._id === pizzaBrand._id)
      ? 'pizza'
      : pizzaBrand.deliveryLineKind || 'pizza',
    [burgerBrand._id]: burgerBrand.deliveryLineKind || '',
    [tacosBrand._id]: tacosBrand.deliveryLineKind || '',
  };
  const counts = { pizza: 0, burger: 0, taco: 0, null: 0 };
  for (const it of effective) {
    if (it.isStockItem === true) continue;
    if (isSharedCategory(it.category) && !/taco|burger|pizza/.test(fold(it.category))) continue;
    const kind = (it.brandIds || []).map((id) => kindById[id]).find(Boolean) || '';
    const fam = classify(it.category, it.name, kind);
    counts[fam || 'null']++;
  }
  console.log('\nConteo potencial (productos catalogados, no ventas):', counts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
