/**
 * Por qué faltan pizzas en combos TPV (Pau / DISARMINK).
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';

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

function isExcluded(item) {
  const name = fold(item.name);
  const cat = fold(item.category);
  if (item.customFields?.halfHalf === true) return 'halfHalf';
  if (/^receta\b/.test(name)) return 'receta';
  if (/mitad\s*y\s*mitad|half\s*and\s*half/.test(name)) return 'mitad';
  if (['envases', 'ingredientes', 'consumibles', 'reventa'].includes(cat)) return 'cat:' + cat;
  if (/caja\s*pizza/.test(name)) return 'caja';
  return null;
}

function looksPizza(item) {
  const cat = fold(item.category);
  const name = fold(item.name);
  if (/^(pizzas?|premium|especialidad(es)?|calzones?)$/.test(cat)) return true;
  if (/pizza|calzone/.test(cat)) return true;
  return /pizza|calzone/.test(name);
}

const data = await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
}).then((r) => r.json());

const docs = (data.rows || []).map((r) => r.doc).filter(Boolean);
const biz = docs.filter((d) => !d.deletedAt && bid(d) === DISARMINK && d.type === 'catalog_item');

const pizzaish = biz.filter(
  (d) =>
    d.itemType !== 'combo' &&
    d.itemType !== 'service' &&
    looksPizza(d),
);

const rows = pizzaish.map((d) => {
  const excl = isExcluded(d);
  const selectable =
    d.active !== false &&
    d.isStockItem !== true &&
    !excl &&
    d.module !== 'inventory';
  return {
    name: d.name,
    category: d.category,
    active: d.active !== false,
    isStockItem: d.isStockItem === true,
    module: d.module || 'catalog',
    excl,
    selectable,
    brands: d.brandIds || [],
  };
});

const selectable = rows.filter((r) => r.selectable);
const blocked = rows.filter((r) => !r.selectable);

const combos = biz.filter((d) => d.itemType === 'combo' && /individual|duo|dúo|family|familiar/i.test(d.name || ''));

console.log(
  JSON.stringify(
    {
      pizzaish: rows.length,
      selectable: selectable.length,
      blockedCount: blocked.length,
      blockedSample: blocked.slice(0, 25),
      categoriesSelectable: [...new Set(selectable.map((r) => r.category))].sort(),
      combos: combos.map((c) => ({
        name: c.name,
        structure: c.customFields?.comboStructure,
        allowlists: c.customFields?.comboSlotAllowlists || null,
        isStockItem: c.isStockItem,
        active: c.active,
      })),
    },
    null,
    2,
  ),
);
