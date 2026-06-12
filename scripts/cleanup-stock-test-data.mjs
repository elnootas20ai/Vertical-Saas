/**
 * Elimina datos de prueba del flujo Stock (ingredientes TEST + revisiones draft de test).
 * Uso: node scripts/cleanup-stock-test-data.mjs
 */
import '../config/env.js';
import {
  getCatalogDbName,
  getAllDocuments,
  getDocument,
  putDocument,
  findAccountByEmail,
} from '../services/couchdb.js';

const EMAIL = String(process.env.SAAS_LOGIN_EMAIL || 'uriel@admin.com').trim().toLowerCase();
const TEST_ITEM_PREFIX = 'TEST Ingrediente';
const TEST_COUNT_PREFIX = 'Test revisión';

const req = {
  couchUser: process.env.COUCHDB_USER,
  couchPass: process.env.COUCHDB_PASSWORD,
  couchUrl: process.env.COUCHDB_URL || process.env.COUCHDB_HOST,
};

async function softDeleteDoc(db, docId) {
  const doc = await getDocument(req, db, docId);
  if (!doc || doc.deletedAt) return false;
  const now = new Date().toISOString();
  await putDocument(req, db, docId, { ...doc, deletedAt: now, updatedAt: now });
  return true;
}

async function main() {
  const account = await findAccountByEmail(req, EMAIL);
  if (!account?.user_id) {
    console.error(`No hay cuenta ${EMAIL}`);
    process.exit(1);
  }
  const userId = account.user_id;
  const db = getCatalogDbName();
  const docs = await getAllDocuments(req, db);

  const testItems = docs.filter(
    (d) =>
      d.type === 'catalog_item' &&
      d.user_id === userId &&
      !d.deletedAt &&
      String(d.name || '').startsWith(TEST_ITEM_PREFIX),
  );

  let deletedItems = 0;
  for (const item of testItems) {
    const ok = await softDeleteDoc(db, item._id);
    if (ok) {
      console.log(`✅ Artículo eliminado: ${item.name}`);
      deletedItems += 1;
    }
  }

  const testCounts = docs.filter(
    (d) =>
      d.type === 'stock_count' &&
      d.user_id === userId &&
      !d.deletedAt &&
      String(d.name || '').startsWith(TEST_COUNT_PREFIX) &&
      (d.status === 'draft' || d.status === 'in_progress'),
  );

  let deletedCounts = 0;
  for (const count of testCounts) {
    const ok = await softDeleteDoc(db, count._id);
    if (ok) {
      console.log(`✅ Revisión de prueba eliminada: ${count.name}`);
      deletedCounts += 1;
    }
  }

  if (deletedItems === 0 && deletedCounts === 0) {
    console.log('No había datos de prueba que borrar.');
  } else {
    console.log(`\nListo: ${deletedItems} ingrediente(s) y ${deletedCounts} revisión(es) de prueba eliminados.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
