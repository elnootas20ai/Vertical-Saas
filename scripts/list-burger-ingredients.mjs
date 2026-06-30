const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const USER = '4e1a9f0b-7687-47f7-a366-9c5c766398ea';

async function main() {
  const res = await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH },
  });
  const docs = ((await res.json()).rows || []).map((r) => r.doc).filter(Boolean);
  const burgers = docs.filter(
    (d) =>
      String(d.user_id || '') === USER &&
      /burger/i.test(d.category || '') &&
      d.customFields?.ingredients &&
      !/ver carta/i.test(d.customFields.ingredients),
  );
  console.log('Burgers WITH real ingredients:');
  for (const b of burgers) {
    console.log(`  ${b.name}: ${b.customFields.ingredients}`);
  }
}

main();
