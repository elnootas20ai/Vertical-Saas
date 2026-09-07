const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const uid = '79e28923-5db1-498d-b340-6871232bf5e4';

async function allDocs(db) {
  const r = await fetch(`http://127.0.0.1:5984/${encodeURIComponent(db)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return r.json();
}

const data = await allDocs('businesses');
const hits = (data.rows || [])
  .map((x) => x.doc)
  .filter(
    (d) =>
      d &&
      !d._deleted &&
      (String(d.owner_user_id || '') === uid ||
        (d.members || []).some((m) => String(m.user_id || '') === uid)),
  )
  .map((d) => ({
    id: d._id,
    name: d.name,
    type: d.businessType,
    owner: d.owner_user_id,
    deletedAt: d.deletedAt || null,
    status: d.status || null,
    members: (d.members || []).length,
  }));
console.log(JSON.stringify({ count: hits.length, hits }, null, 2));
