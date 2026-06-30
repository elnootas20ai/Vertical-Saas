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
  for (const db of ['bbddsaas-catalog', 'bbddsaas-delivery']) {
    const docs = await allDocs(db);
    const hits = docs.filter(
      (d) =>
        String(d.user_id || '') === USER &&
        /doble|vegan/i.test(String(d.name || '')),
    );
    if (hits.length) {
      console.log('\nDB', db);
      for (const d of hits) {
        console.log(JSON.stringify({
          _id: d._id,
          name: d.name,
          category: d.category,
          ingredients: d.customFields?.ingredients || d.ingredients || null,
          customFields: d.customFields,
        }, null, 2));
      }
    }
  }
}

main();
