/**
 * Buscar imapHost / purchase_invoice en todas las DBs.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

const dbs = await couch('/_all_dbs');
console.log('dbs', dbs);

const hits = [];
for (const db of dbs) {
  if (String(db).startsWith('_')) continue;
  const data = await couch(`/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=200000`);
  if (data.error) {
    console.log('skip', db, data.error);
    continue;
  }
  let pdv = 0;
  let inv = 0;
  let imap = 0;
  for (const row of data.rows || []) {
    const d = row.doc;
    if (!d) continue;
    if (d.type === 'point_of_sale') pdv++;
    if (d.type === 'purchase_invoice') inv++;
    const s = JSON.stringify(d);
    if (/imapHost|imapUser|supplierInvoiceConfig/i.test(s)) {
      imap++;
      if (hits.length < 40) {
        hits.push({
          db,
          id: d._id,
          type: d.type,
          name: d.name || d.email || '',
          enabled: d.supplierInvoiceConfig?.enabled,
          host: d.supplierInvoiceConfig?.imapHost || d.imapHost,
          user: String(d.supplierInvoiceConfig?.imapUser || d.imapUser || '').replace(/(^.).+(@.*)$/, '$1***$2'),
          cursor: d.supplierInvoiceConfig?.imapCursorUid,
          hasPass: Boolean(d.supplierInvoiceConfig?.imapPassword),
        });
      }
    }
  }
  if (pdv || inv || imap) console.log(JSON.stringify({ db, pdv, inv, imapDocs: imap }));
}
console.log('hits', JSON.stringify(hits, null, 2));
