#!/usr/bin/env node
/**
 * Diagnóstico producción: combos BlackBurger / Tacos (solo lectura).
 *   node scripts/diag-blackburger-taco-combo.mjs
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=80000`, {
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

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

const [accounts, businessesDb, catalog, brands] = await Promise.all([
  allDocs('accounts').catch(() => []),
  allDocs('businesses').catch(() => []),
  allDocs('bbddsaas-catalog'),
  allDocs('bbddsaas-brands').catch(() => []),
]);

const businesses = [
  ...accounts.filter((d) => d.type === 'business' && !d.deletedAt),
  ...businessesDb.filter((d) => (d.type === 'business' || d.name) && !d.deletedAt),
];
const byId = new Map();
for (const b of businesses) {
  const id = String(b.business_id || b._id || '')
    .replace(/^business:/, '')
    .trim();
  if (!id) continue;
  if (!byId.has(id)) byId.set(id, b);
}

const hits = [...byId.values()].filter((b) => {
  const n = fold(b.name || '');
  return (
    n.includes('black') ||
    n.includes('burger') ||
    n.includes('taco') ||
    n.includes('disarmink') ||
    n.includes('modomio') ||
    n.includes('pau')
  );
});

console.log('=== EMPRESAS ===');
for (const b of hits) {
  const id = String(b.business_id || b._id || '').replace(/^business:/, '');
  console.log(`- ${b.name} id=${id} type=${b.businessType || b.type}`);
}

const catItems = catalog.filter((d) => d?.type === 'catalog_item' && !d.deletedAt);

// También localizar por productos "taco" / combos con black en brand name
const tacoBizIds = new Set();
for (const d of catItems) {
  const n = fold(d.name || '');
  const c = fold(d.category || '');
  if (/taco|burrito|quesadilla/.test(`${n} ${c}`)) tacoBizIds.add(bid(d));
}

const focusIds = new Set(
  hits
    .filter((b) => {
      const n = fold(b.name || '');
      return n.includes('black') || n.includes('taco') || (n.includes('burger') && !n.includes('disarmink'));
    })
    .map((b) =>
      String(b.business_id || b._id || '')
        .replace(/^business:/, '')
        .trim(),
    )
    .filter(Boolean),
);
for (const id of tacoBizIds) {
  if (id) focusIds.add(id);
}

for (const id of focusIds) {
  const b = byId.get(id) || { name: `(sin nombre) ${id}`, business_id: id };
  const bizBrands = brands.filter((br) => bid(br) === id && !br.deletedAt);
  const bizItems = catItems.filter((d) => bid(d) === id);
  const combos = bizItems.filter((d) => d.itemType === 'combo');
  const tacoish = bizItems.filter((d) => /\btaco|burrito|quesadilla|nacho/.test(fold([d.name, d.category].join(' '))));
  if (combos.length === 0 && tacoish.length === 0) continue;

  console.log(`\n######## ${b.name} (${id}) ########`);
  console.log(
    'Marcas:',
    bizBrands.map((br) => `${br.name}[${br.deliveryLineKind || '?'}]`).join(' · ') || '(ninguna)',
  );
  console.log(`ítems=${bizItems.length} combos=${combos.length} tacoish=${tacoish.length}`);

  for (const c of combos) {
    const structure = c.customFields?.comboStructure || [];
    const allowMain = c.customFields?.comboSlotAllowlists?.main || [];
    const allowSide = c.customFields?.comboSlotAllowlists?.side || [];
    const byProd = new Map(bizItems.map((x) => [x._id, x]));
    console.log(`\n--- COMBO: ${c.name} active=${c.active !== false} ---`);
    console.log(
      'structure:',
      (structure || []).map((s) => `${s.slotKind}×${s.expectedCount || 1}「${s.label}」`).join(' · ') || '(default)',
    );
    console.log(`main allow (${allowMain.length}):`);
    for (const pid of allowMain) {
      const p = byProd.get(pid);
      console.log(`  - ${p?.name || pid} cat=${p?.category || '?'}`);
    }
    if (!allowMain.length) {
      const mains = bizItems.filter((d) => {
        if (d.itemType === 'combo' || d.active === false) return false;
        const cat = fold(d.category);
        const name = fold(d.name);
        return /taco|pizza|burger|hamburg|principal|burrito|quesadilla/.test(`${cat} ${name}`);
      });
      console.log(`  (sin allowlist; candidatos: ${mains.length})`);
      for (const p of mains.slice(0, 20)) {
        console.log(`    · ${p.name} cat=${p.category}`);
      }
    }
    console.log(`side allow (${allowSide.length}):`);
    for (const pid of allowSide.slice(0, 20)) {
      const p = byProd.get(pid);
      console.log(`  - ${p?.name || pid}`);
    }
  }

  console.log(`\nTaco-ish (${tacoish.length}):`);
  for (const t of tacoish.slice(0, 40)) {
    console.log(`  - ${t.name} type=${t.itemType} cat=${t.category} active=${t.active !== false}`);
  }

  const cats = [...new Set(bizItems.map((d) => d.category).filter(Boolean))].sort();
  console.log('Categorías:', cats.join(' · '));
}
