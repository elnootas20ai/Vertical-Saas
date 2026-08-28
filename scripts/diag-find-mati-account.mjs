/**
 * Buscar cuentas / PDV con mati, vertial demo, ceo-delivery en CouchDB local (prod via docker).
 */
const COUCH = process.env.COUCH_URL || 'http://127.0.0.1:5984';
const user = process.env.COUCHDB_USER || 'vertialadmin';
const pass = process.env.COUCHDB_PASSWORD || 'uriel12345';
const AUTH = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

const acc = await couch('/accounts/_all_docs?include_docs=true');
const accountHits = [];
for (const row of acc.rows || []) {
  const d = row.doc;
  if (!d) continue;
  const blob = JSON.stringify(d).toLowerCase();
  if (/mati|matias|ceo-delivery|vertial demo|demo delivery/.test(blob)) {
    accountHits.push({
      id: d._id,
      userId: d.userId,
      email: d.email,
      name: d.fullName || d.name,
      businessName: d.businessName,
    });
  }
}
console.log('account_hits', JSON.stringify(accountHits, null, 2));

const emailLike = (acc.rows || [])
  .filter((r) => r.doc?.email)
  .map((r) => ({
    id: r.doc._id,
    email: r.doc.email,
    userId: r.doc.userId,
    name: r.doc.fullName || r.doc.name,
  }))
  .filter((x) => /mati|vertial|ceo|demo/i.test(JSON.stringify(x)));
console.log('email_like', JSON.stringify(emailLike, null, 2));

const pdvData = await couch('/bbddsaas-delivery/_all_docs?include_docs=true&limit=500000');
const pdvHits = [];
for (const row of pdvData.rows || []) {
  const d = row.doc;
  if (!d || d.type !== 'point_of_sale') continue;
  const blob = JSON.stringify(d).toLowerCase();
  if (/mati|vertial|ceo-delivery|demo/.test(blob)) {
    pdvHits.push({
      id: d._id,
      name: d.name,
      user_id: d.user_id,
      imapUser: d.supplierInvoiceConfig?.imapUser,
      enabled: d.supplierInvoiceConfig?.enabled,
    });
  }
}
console.log('pdv_hits', JSON.stringify(pdvHits.slice(0, 30), null, 2));

const MATI_UID = 'f9e580d9-ca94-4b95-8c83-45f785a190f2';
const matiAcc = await couch(`/accounts/account:${MATI_UID}`);
console.log(
  'mati_account_detail',
  JSON.stringify(
    {
      _id: matiAcc._id,
      userId: matiAcc.userId,
      email: matiAcc.email,
      name: matiAcc.fullName || matiAcc.name,
      businessName: matiAcc.businessName,
      supplierInvoiceConfig: matiAcc.supplierInvoiceConfig,
      onboarding: matiAcc.onboardingData,
    },
    null,
    2,
  ),
);

const matiPdvs = (pdvData.rows || [])
  .filter(
    (r) =>
      r.doc &&
      (r.doc.user_id === MATI_UID || r.doc.user_id === matiAcc.userId),
  )
  .map((r) => ({
    id: r.doc._id,
    name: r.doc.name,
    user_id: r.doc.user_id,
    supplierInvoiceConfig: r.doc.supplierInvoiceConfig,
  }));
console.log('mati_pdvs', JSON.stringify(matiPdvs, null, 2));
