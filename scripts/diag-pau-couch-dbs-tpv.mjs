#!/usr/bin/env node
/** Lista DBs Couch + ubica pedidos/cajas/clockins Pau. */
import '../config/env.js';

const BID = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const POL = 'ad18303c-393a-468e-8c01-0cb8d0af5f9e';
const BAD_PDV = 'wc-16361270-5794-4b95-89e5-644685f36e24';

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw || '127.0.0.1:5984'}`;
  const u = new URL(href);
  const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
  return `${u.origin}${pathPart}`.replace(/\/+$/, '');
}

const BASE = couchBaseUrl();
const AUTH = `Basic ${Buffer.from(
  `${process.env.COUCHDB_USER || ''}:${process.env.COUCHDB_PASSWORD || ''}`,
).toString('base64')}`;

function madridDay(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

async function allDocs(db, limit = 50000) {
  const res = await fetch(
    `${BASE}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=${limit}`,
    { headers: { Authorization: AUTH, Accept: 'application/json' } },
  );
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function mentionsPau(d) {
  const blob = JSON.stringify(d);
  return blob.includes(BID) || blob.includes(PAU) || blob.includes(POL) || blob.includes(BAD_PDV);
}

async function main() {
  const today = madridDay(new Date().toISOString());
  const dbsRes = await fetch(`${BASE}/_all_dbs`, { headers: { Authorization: AUTH } });
  const dbs = await dbsRes.json();
  console.log('DB count', dbs.length);
  console.log(
    dbs.filter((n) => /order|clock|regist|tpv|sale|delivery|pdv|caja|ticket/i.test(n)).join('\n'),
  );
  console.log('\n--- ALL DBS ---');
  console.log(dbs.join('\n'));

  const interesting = dbs.filter((n) =>
    /order|clock|regist|tpv|delivery|ticket|sale|pdv|caja|session|kitchen/i.test(n),
  );

  for (const db of interesting) {
    try {
      const docs = await allDocs(db, 100000);
      const pauDocs = docs.filter(mentionsPau);
      const todayDocs = pauDocs.filter((d) => {
        const raw = `${d.date || ''} ${d.openedAt || ''} ${d.createdAt || ''} ${d.updatedAt || ''} ${d.completedAt || ''}`;
        return raw.includes(today) || madridDay(d.updatedAt) === today || madridDay(d.openedAt) === today;
      });
      if (pauDocs.length || todayDocs.length) {
        console.log(`\n=== ${db}: pau=${pauDocs.length} todayish=${todayDocs.length} total=${docs.length} ===`);
        const sample = (todayDocs.length ? todayDocs : pauDocs).slice(0, 5);
        for (const d of sample) {
          console.log(
            JSON.stringify({
              _id: d._id,
              type: d.type || d.docType,
              status: d.status,
              salesPointId: d.salesPointId || d.pointOfSaleId || d.pdvId,
              userId: d.userId || d.user_id,
              updatedAt: d.updatedAt || d.openedAt || d.createdAt,
            }),
          );
        }
      }
    } catch (e) {
      console.log(`skip ${db}: ${e.message}`);
    }
  }

  // Full clockin doc by id
  const clockDb = interesting.find((n) => /clockin/i.test(n)) || 'bbddsaas-clockins';
  try {
    const id =
      'clockin:ed846f31-aee7-4568-ac03-fa25ff3ad773:ad18303c-393a-468e-8c01-0cb8d0af5f9e:2026-08-05:1785946054516';
    const res = await fetch(`${BASE}/${encodeURIComponent(clockDb)}/${encodeURIComponent(id)}`, {
      headers: { Authorization: AUTH },
    });
    console.log(`\n=== FULL CLOCKIN ${clockDb} ===`);
    console.log(JSON.stringify(await res.json(), null, 2));
  } catch (e) {
    console.log('clock fetch', e.message);
  }

  // Badalona PDV full
  try {
    const res = await fetch(
      `${BASE}/bbddsaas-sales-points/${encodeURIComponent(BAD_PDV)}`,
      { headers: { Authorization: AUTH } },
    );
    console.log('\n=== FULL PDV BADALONA ===');
    console.log(JSON.stringify(await res.json(), null, 2));
  } catch (e) {
    console.log('pdv', e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
