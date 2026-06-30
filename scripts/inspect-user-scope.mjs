const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const USER = '4e1a9f0b-7687-47f7-a366-9c5c766398ea';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH },
  });
  return ((await res.json()).rows || []).map((r) => r.doc).filter(Boolean);
}

async function main() {
  const accounts = await allDocs('accounts');
  const hits = accounts.filter(
    (a) =>
      String(a.user_id || '') === USER ||
      String(a._id || '') === USER ||
      String(a.email || '').toLowerCase().includes('urielarnau'),
  );
  console.log('accounts match:', hits.length);
  for (const a of hits) console.log(JSON.stringify(a, null, 2));

  const businesses = await allDocs('businesses');
  const bizHits = businesses.filter((b) => String(b.owner_user_id || '') === USER);
  console.log('\nowner businesses:', bizHits.length);
  for (const b of bizHits) console.log(JSON.stringify({ _id: b._id, name: b.name, business_id: b.business_id, owner: b.owner_user_id }));

  const cat = await allDocs('bbddsaas-catalog');
  const sample = cat.find((c) => c.type === 'catalog_item' && String(c.user_id) === USER);
  console.log('\ncatalog sample business_id:', sample?.business_id);

  const cards = await allDocs('cards');
  const cardHits = cards.filter((c) => String(c.user_id || c.owner_user_id || '') === USER);
  console.log('\ncards:', cardHits.slice(0, 2).map((c) => ({ _id: c._id, name: c.name, business_id: c.business_id })));
}

main();
