/**
 * Lista cajas TPV abiertas (sobre todo de días anteriores). Solo lectura.
 *   node scripts/diag-open-tpv-sessions.mjs
 * Remoto: node scripts/remote-diag-open-tpv-sessions.mjs
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

const { getDeliveryDbName, getAllDocuments } = await import('../services/couchdb.js');

const today = new Date().toISOString().slice(0, 10);
const db = getDeliveryDbName();
const docs = await getAllDocuments(req, db);
const open = docs.filter((d) => d?.type === 'tpv_register_session' && !d?.deletedAt && d.status === 'open');
const stale = open.filter((s) => String(s.openedAt || '').slice(0, 10) < today);

console.log(`Hoy (UTC date): ${today}`);
console.log(`Abiertas: ${open.length} | De día anterior: ${stale.length}\n`);

for (const s of [...stale, ...open.filter((x) => !stale.includes(x))].slice(0, 80)) {
  const day = String(s.openedAt || '').slice(0, 10);
  const mark = day < today ? 'STALE' : 'today';
  console.log(
    `[${mark}] ${s._id} | user=${s.user_id || '—'} | biz=${s.business_id || s.businessId || '—'} | pdv=${s.pointOfSaleId || '—'} | ${s.pointOfSaleName || '—'} | opened=${s.openedAt} | worker=${s.workerName || '—'}`,
  );
}
