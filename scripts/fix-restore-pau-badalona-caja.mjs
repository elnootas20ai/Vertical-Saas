/**
 * Restaura la caja de hoy de BADALONA (Pau) con pedidos y cierra la vacía nueva.
 *   node scripts/fix-restore-pau-badalona-caja.mjs
 *   node scripts/fix-restore-pau-badalona-caja.mjs --apply
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.development') });
dotenv.config({ path: path.join(root, '.env') });

const APPLY = process.argv.includes('--apply');
const KEEP_ID = 'tpvreg-fd2f0e47-68a6-4b06-8143-20f0ede8480c';
const CLOSE_NEW_ID = 'tpvreg-522b0e33-5a5e-46f4-b571-ac5e6be631c8';

const req = {
  couchUser: process.env.COUCHDB_USER,
  couchPass: process.env.COUCHDB_PASSWORD,
  couchUrl: process.env.COUCHDB_URL || process.env.COUCHDB_HOST,
};

const {
  getDeliveryDbName,
  getDocument,
  putDocument,
  autoCloseTpvRegisterSessionDocument,
} = await import('../services/couchdb.js');

const db = getDeliveryDbName();
const keep = await getDocument(req, db, KEEP_ID);
const neu = await getDocument(req, db, CLOSE_NEW_ID);

if (!keep) {
  console.error('No existe la caja a restaurar', KEEP_ID);
  process.exit(1);
}

console.log('KEEP (la de antes):', {
  id: keep._id,
  status: keep.status,
  openedAt: keep.openedAt,
  biz: keep.business_id || keep.businessId,
  pdv: keep.pointOfSaleId,
  name: keep.pointOfSaleName,
  txs: (keep.transactions || []).length,
  linked: (keep.linkedOrderIds || []).length,
});

if (neu) {
  console.log('NEW (vacía a cerrar):', {
    id: neu._id,
    status: neu.status,
    openedAt: neu.openedAt,
    biz: neu.business_id || neu.businessId,
    pdv: neu.pointOfSaleId,
    name: neu.pointOfSaleName,
    txs: (neu.transactions || []).length,
    linked: (neu.linkedOrderIds || []).length,
  });
} else {
  console.log('NEW: ya no existe', CLOSE_NEW_ID);
}

if (!APPLY) {
  console.log('\nSimulación. Ejecuta con --apply para aplicar.');
  process.exit(0);
}

// 1) Asegurar keep abierta
if (keep.status !== 'open') {
  const reopened = {
    ...keep,
    status: 'open',
    closedAt: '',
    closedBy: '',
    closingNotes: '',
    expectedCash: undefined,
    finalCashAmount: undefined,
    difference: undefined,
    closingValidationStatus: undefined,
    updatedAt: new Date().toISOString(),
  };
  await putDocument(req, db, reopened._id, reopened);
  console.log('Reabierta KEEP');
} else {
  console.log('KEEP ya estaba abierta');
}

// 2) Cerrar la nueva vacía (solo si no tiene ventas)
if (neu && neu.status === 'open') {
  const txs = Array.isArray(neu.transactions) ? neu.transactions.length : 0;
  const linked = Array.isArray(neu.linkedOrderIds) ? neu.linkedOrderIds.length : 0;
  if (txs > 0 || linked > 0) {
    console.error('ABORT: la caja nueva tiene movimiento; no la cierro a ciegas.');
    process.exit(2);
  }
  const closed = autoCloseTpvRegisterSessionDocument(
    neu.user_id,
    neu,
    `Cierre automático: se restaura turno previo ${KEEP_ID}`,
    'Mantenimiento',
  );
  await putDocument(req, db, closed._id, closed);
  console.log('Cerrada NEW vacía');
}

console.log('Listo.');
