const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const USER = '4e1a9f0b-7687-47f7-a366-9c5c766398ea';
const BIZ = 'b41d7afb-7f1d-41f9-912b-3d635dd96e55';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=10000`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) return [];
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function main() {
  const dbs = [
    'bbddsaas-sales-points',
    'urielsaas-sales-points',
    'vertial-sales-points',
  ];

  for (const db of dbs) {
    const docs = await allDocs(db);
    const mine = docs.filter(
      (d) =>
        d.type === 'sales_point' &&
        !d.deletedAt &&
        String(d.user_id || '') === USER,
    );
    console.log(`\n${db}: ${mine.length} WC(s) for user`);
    for (const wc of mine) {
      console.log(JSON.stringify({
        _id: wc._id,
        name: wc.name,
        businessId: wc.businessId || wc.business_id || null,
        centerType: wc.centerType,
        address: wc.address,
      }));
    }
  }

  const pdvs = await allDocs('bbddsaas-delivery');
  const minePdv = pdvs.filter(
    (p) =>
      (p.type === 'point_of_sale' || p.docType === 'point_of_sale') &&
      String(p.user_id || '') === USER,
  );
  console.log(`\nbbddsaas-delivery PDV: ${minePdv.length}`);
  for (const p of minePdv) {
    console.log(JSON.stringify({ _id: p._id, name: p.name, code: p.code, workCenterId: p.workCenterId, active: p.active }));
  }

  const biz = await allDocs('businesses');
  const mineBiz = biz.filter((b) => String(b.owner_user_id || '') === USER);
  console.log(`\nEmpresas del usuario: ${mineBiz.length}`);
  for (const b of mineBiz) {
    console.log(JSON.stringify({ name: b.name, business_id: b.business_id || b._id, type: b.businessType }));
  }
}

main();
