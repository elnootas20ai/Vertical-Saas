/**
 * Diagnóstico cajas BADALONA / Pau (hoy). Solo lectura.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const req = {
  couchUser: process.env.COUCHDB_USER,
  couchPass: process.env.COUCHDB_PASSWORD,
  couchUrl: process.env.COUCHDB_URL || process.env.COUCHDB_HOST,
};

const PAU = '13e49ef6-183a-4afa-a17b-7730917fe685';
const PDV = 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6';
const KEEP = 'tpvreg-fd2f0e47-68a6-4b06-8143-20f0ede8480c';

const { getDeliveryDbName, getAllDocuments } = await import('../services/couchdb.js');
const docs = await getAllDocuments(req, getDeliveryDbName());
const sessions = docs.filter(
  (d) =>
    d?.type === 'tpv_register_session' &&
    !d?.deletedAt &&
    (d.user_id === PAU || String(d.pointOfSaleId || '') === PDV || String(d._id || '').includes('fd2f0e47')),
);

const relevant = sessions
  .filter(
    (s) =>
      String(s.pointOfSaleId || '') === PDV ||
      String(s._id) === KEEP ||
      (s.user_id === PAU && String(s.openedAt || '').startsWith('2026-07-22')),
  )
  .sort((a, b) => String(b.openedAt || '').localeCompare(String(a.openedAt || '')));

console.log(`Sesiones relevantes: ${relevant.length}\n`);
for (const s of relevant.slice(0, 25)) {
  const txs = Array.isArray(s.transactions) ? s.transactions.length : 0;
  const linked = Array.isArray(s.linkedOrderIds) ? s.linkedOrderIds.length : 0;
  console.log(
    `${s._id}\n  status=${s.status} opened=${s.openedAt} closed=${s.closedAt || '—'} biz=${s.business_id || s.businessId || '—'}\n  worker=${s.workerName || '—'} pdv=${s.pointOfSaleName || s.pointOfSaleId}\n  txs=${txs} linkedOrders=${linked} notes=${String(s.closingNotes || '').slice(0, 80)}\n`,
  );
}

const keep = docs.find((d) => d._id === KEEP);
if (keep) {
  console.log('--- KEEP doc ---');
  console.log(
    JSON.stringify(
      {
        _id: keep._id,
        status: keep.status,
        openedAt: keep.openedAt,
        closedAt: keep.closedAt,
        business_id: keep.business_id || keep.businessId,
        txs: (keep.transactions || []).length,
        linked: (keep.linkedOrderIds || []).length,
        closingNotes: keep.closingNotes,
      },
      null,
      2,
    ),
  );
}
