const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');

async function get(id) {
  const r = await fetch(`${COUCH}/accounts/${encodeURIComponent(id)}`, { headers: { Authorization: AUTH } });
  return r.ok ? r.json() : null;
}

async function allAccounts() {
  const r = await fetch(`${COUCH}/accounts/_all_docs?include_docs=true&limit=50000`, { headers: { Authorization: AUTH } });
  return ((await r.json()).rows || []).map((x) => x.doc).filter(Boolean);
}

async function main() {
  const acc = await get('account:4e1a9f0b-7687-47f7-a366-9c5c766398ea');
  console.log('account:4e1a9f0b...', acc ? acc.email : 'NOT FOUND');

  const all = await allAccounts();
  const u = all.filter((a) => String(a.user_id || '').includes('4e1a9f0b') || String(a._id || '').includes('4e1a9f0b'));
  console.log('related docs:', u.map((a) => ({ _id: a._id, type: a.type, email: a.email })));

  const setup = await get('setup_progress:4e1a9f0b-7687-47f7-a366-9c5c766398ea');
  console.log('setup business_id:', setup?.business_id);
}

main();
