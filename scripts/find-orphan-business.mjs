const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const USER = '4e1a9f0b-7687-47f7-a366-9c5c766398ea';
const BID = 'b41d7afb-7f1d-41f9-912b-3d635dd96e55';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) return [];
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function main() {
  const dbs = ['businesses', 'bbddsaas-catalog', 'bbddsaas-delivery', 'bbddsaas-sales-points', 'accounts', 'notifications'];
  for (const db of dbs) {
    const docs = await allDocs(db);
    const bidHits = docs.filter((d) => JSON.stringify(d).includes(BID.slice(0, 8)));
    const userHits = docs.filter((d) => String(d.user_id || d.owner_user_id || '') === USER);
    if (bidHits.length || (userHits.length && db !== 'bbddsaas-catalog')) {
      console.log(`\n${db}: bid=${bidHits.length} user=${userHits.length}`);
      for (const d of bidHits.slice(0, 5)) {
        console.log(' ', d.type || d.docType, d._id?.slice(0, 40), d.name || d.email || '');
      }
    }
  }

  const cat = await allDocs('bbddsaas-catalog');
  const brands = cat.filter((d) => d.type === 'brand' && String(d.user_id) === USER);
  console.log('\nbrands user:', brands.map((b) => b.name));

  const bizAll = await allDocs('businesses');
  const pizza = bizAll.filter((b) => /pizza|grande/i.test(String(b.name || '')));
  console.log('\npizza businesses:', pizza.map((b) => ({ name: b.name, id: b.business_id || b._id, owner: b.owner_user_id })));
}

main();
