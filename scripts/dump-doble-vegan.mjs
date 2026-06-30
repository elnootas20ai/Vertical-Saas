const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const USER = '4e1a9f0b-7687-47f7-a366-9c5c766398ea';

async function main() {
  const res = await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true&limit=20000`, {
    headers: { Authorization: AUTH },
  });
  const docs = ((await res.json()).rows || []).map((r) => r.doc).filter(Boolean);
  const item = docs.find((d) => d._id === 'catitem-23e56738-2cc5-47de-a2bf-7992a209f7ae');
  console.log(JSON.stringify(item, null, 2));
}

main();
