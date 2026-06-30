const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const USER = '4e1a9f0b-7687-47f7-a366-9c5c766398ea';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=20000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) return [];
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function main() {
  const settings = await allDocs('bbddsaas-settings');
  const brands = await allDocs('businesses');
  const biz = brands.find((b) => String(b.owner_user_id || '') === USER && /pizza/i.test(b.name || ''));
  console.log('business', biz?.name, biz?.business_id);

  for (const doc of settings) {
    if (String(doc.user_id || '') !== USER) continue;
    const type = doc.type || doc.docType || '';
    if (!/ingredient|brand|tpv|store/i.test(type + JSON.stringify(doc).slice(0, 200))) continue;
    const ing = doc.storeIngredients || doc.ingredients || doc.tpvStoreIngredients;
    if (Array.isArray(ing) && ing.length) {
      console.log('\n', type, doc._id, 'count', ing.length);
      console.log(ing.filter((i) => /beyond|vegan|burger|hambur/i.test(JSON.stringify(i))).slice(0, 20));
    }
  }

  const catalog = await allDocs('bbddsaas-catalog');
  const brandDocs = catalog.filter((d) => d.type === 'brand' && String(d.user_id || '') === USER);
  console.log('\nbrands in catalog', brandDocs.map((b) => ({ name: b.name, id: b._id, line: b.deliveryLineKind })));
}

main();
