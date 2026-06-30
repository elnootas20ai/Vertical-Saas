/**
 * Auditoría: ingredientes catálogo → TPV (misma lógica que parseCatalogIngredients).
 * node scripts/audit-catalog-ingredients.mjs [--user=UUID] [--apply-fixes]
 */
const COUCH = process.env.COUCH_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || 'uriel12345'}`,
  ).toString('base64');
const PREFIX = (process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'BBDDsaas').toLowerCase();
const CATALOG_DB = `${PREFIX}-catalog`;
const APPLY = process.argv.includes('--apply-fixes');
const USER_FILTER = process.argv.find((a) => a.startsWith('--user='))?.slice('--user='.length) || '';

const PLACEHOLDERS = new Set([
  'ver carta', 'ver menu', 'ver menú', 'ver la carta', 'consultar carta', 'see menu', 'ver',
  '-', '—', 'n/a', 'na', 'sin ingredientes',
]);

function parseIngredients(raw) {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((n) => !PLACEHOLDERS.has(n.toLowerCase()));
}

function isTpvConfigurable(item) {
  const cat = `${item.category || ''} ${item.name || ''}`.toLowerCase();
  if (item.customFields?.halfHalf === true || /mitad\s*y\s*mitad/i.test(item.name || '')) return false;
  if (item.customFields?.buildYourOwn === true) return false;
  if (/bebida|postre|complemento|entrante|ensalada|bebidas|postres|combo/.test(cat)) return false;
  if (/pizza|pizzas|burger|hamburguesa|top burger|calzone|bowl/.test(cat)) return true;
  return false;
}

function tpvIngredients(item, catalog) {
  const fromFicha = parseIngredients(item.customFields?.ingredients);
  if (fromFicha.length > 0) return { source: 'ficha', list: fromFicha };

  if (item.itemType === 'combo' && Array.isArray(item.comboItems)) {
    const byId = new Map(catalog.map((c) => [c._id, c]));
    const seen = new Set();
    const out = [];
    for (const ref of item.comboItems) {
      const comp = byId.get(String(ref.productId || '').trim());
      if (!comp) continue;
      for (const n of parseIngredients(comp.customFields?.ingredients)) {
        const k = n.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(n);
      }
    }
    if (out.length > 0) return { source: 'combo', list: out };
  }
  return { source: 'empty', list: [] };
}

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function putDoc(db, doc) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/${encodeURIComponent(doc._id)}`, {
    method: 'PUT',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

async function main() {
  const all = await allDocs(CATALOG_DB);
  const catalog = all.filter(
    (d) => d.type === 'catalog_item' && (!USER_FILTER || String(d.user_id || '') === USER_FILTER),
  );
  const active = catalog.filter((d) => !d.deletedAt && d.active !== false);
  const configurable = active.filter(isTpvConfigurable);

  let ok = 0;
  let fail = 0;
  let ghostDeleted = 0;
  let placeholderOnly = 0;
  const fixes = [];

  console.log(`\n=== Auditoría ingredientes TPV | DB=${CATALOG_DB} | productos=${catalog.length} ===\n`);

  for (const item of configurable) {
    const { source, list } = tpvIngredients(item, catalog);
    if (list.length > 0) {
      ok += 1;
      continue;
    }
    fail += 1;
    const raw = String(item.customFields?.ingredients || '').trim();
    const isPh = raw && parseIngredients(raw).length === 0;
    if (isPh) placeholderOnly += 1;
    console.log(`FAIL  [${item.category}] ${item.name} | ficha="${raw || '—'}" | TPV=0 ingredientes`);
  }

  for (const item of catalog) {
    if (item.deletedAt && item.active !== false && isTpvConfigurable(item)) {
      ghostDeleted += 1;
      console.log(`GHOST deletedAt pero active  [${item.category}] ${item.name}`);
      if (APPLY) {
        fixes.push(async () => {
          const doc = { ...item, deletedAt: null, updatedAt: new Date().toISOString() };
          const r = await putDoc(CATALOG_DB, doc);
          console.log(r.ok ? `  OK restaurado ${item.name}` : `  FAIL ${item.name}`);
        });
      }
    }
    const raw = String(item.customFields?.ingredients || '').trim();
    if (raw && parseIngredients(raw).length === 0 && isTpvConfigurable(item) && !item.deletedAt) {
      if (APPLY) {
        fixes.push(async () => {
          const doc = {
            ...item,
            customFields: { ...(item.customFields || {}), ingredients: '' },
            updatedAt: new Date().toISOString(),
          };
          const r = await putDoc(CATALOG_DB, doc);
          console.log(r.ok ? `  OK limpiado placeholder ${item.name}` : `  FAIL ${item.name}`);
        });
      }
    }
  }

  console.log(`\n--- Resumen ---`);
  console.log(`Configurables activos: ${configurable.length}`);
  console.log(`OK (TPV ve ingredientes): ${ok}`);
  console.log(`FAIL (TPV vacío): ${fail}`);
  console.log(`  de ellos solo placeholder en ficha: ${placeholderOnly}`);
  console.log(`Fantasma deletedAt+active: ${ghostDeleted}`);

  if (APPLY && fixes.length) {
    console.log(`\nAplicando ${fixes.length} corrección(es)...\n`);
    for (const fn of fixes) await fn();
  } else if (!APPLY && (ghostDeleted || placeholderOnly)) {
    console.log('\nSimulación. Para limpiar placeholders y restaurar borrados: --apply-fixes\n');
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
