const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');

async function allDocs(db) {
  const r = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`, { headers: { Authorization: AUTH } });
  return ((await r.json()).rows || []).map((x) => x.doc).filter(Boolean);
}

async function main() {
  for (const db of ['cards', 'accounts', 'businesses']) {
    const docs = await allDocs(db);
    const hits = docs.filter((d) => JSON.stringify(d).includes('4e1a9f0b-7687-47f7-a366-9c5c766398ea'));
    console.log(`\n${db}: ${hits.length}`);
    for (const h of hits.slice(0, 5)) {
      console.log(JSON.stringify({ _id: h._id, type: h.type, email: h.email, user_id: h.user_id, name: h.name }));
    }
  }
}

main();
