const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const USER = '4e1a9f0b-7687-47f7-a366-9c5c766398ea';
const BID = 'b41d7afb-7f1d-41f9-912b-3d635dd96e55';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) return null;
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function main() {
  const dbs = ['businesses', 'bbddsaas-businesses', 'accounts', 'bbddsaas-accounts', 'cards'];
  for (const db of dbs) {
    const docs = await allDocs(db);
    if (!docs) {
      console.log(db, 'NO EXISTE');
      continue;
    }
    const acc = docs.filter(
      (x) =>
        String(x.user_id || x._id || '') === USER ||
        String(x.email || '').toLowerCase().includes('urielarnau'),
    );
    const biz = docs.filter(
      (x) =>
        String(x.owner_user_id || '') === USER ||
        String(x.business_id || x._id || '') === BID ||
        String(x.name || '').toLowerCase().includes('pizza'),
    );
    if (acc.length || biz.length) {
      console.log('\n===', db, '===');
      for (const a of acc.slice(0, 3)) {
        console.log('account:', a.email, a.user_id || a._id);
      }
      for (const b of biz.slice(0, 5)) {
        console.log('business:', b.name, b.business_id || b._id, 'owner=', b.owner_user_id);
      }
    }
  }
}

main();
