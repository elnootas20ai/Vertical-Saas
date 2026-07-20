/**
 * Al borrar una empresa: soft-delete PDV, centros, sesiones de caja y
 * marcas/productos de esa empresa. No borra pedidos (histórico).
 */
import {
  ensureDatabase,
  getAllDocuments,
  getCatalogDbName,
  getDeliveryDbName,
  getWorkCentersDbName,
  softDeleteDocument,
} from '../services/couchdb.js';

function normalizeBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function docBusinessId(doc) {
  return normalizeBusinessId(doc?.business_id || doc?.businessId);
}

async function softDeleteMatching(req, dbName, predicate, label) {
  await ensureDatabase(req, dbName);
  const docs = await getAllDocuments(req, dbName);
  let count = 0;
  for (const doc of docs) {
    if (!doc || String(doc._id || '').startsWith('_design/')) continue;
    if (doc.deletedAt) continue;
    if (!predicate(doc)) continue;
    try {
      await softDeleteDocument(req, dbName, doc._id);
      count += 1;
    } catch (err) {
      console.error(`[deleteBusiness cascade] ${label} ${doc._id}:`, err?.message || err);
    }
  }
  return count;
}

/**
 * @param {object} req
 * @param {string} businessId
 * @param {string} [ownerUserId] — si se pasa, limita a docs de ese user_id (más seguro)
 */
export async function cascadeSoftDeleteBusinessData(req, businessId, ownerUserId = '') {
  const bid = normalizeBusinessId(businessId);
  if (!bid) return { salesPoints: 0, deliveryPdvs: 0, sessions: 0, catalog: 0 };

  const owner = String(ownerUserId || '').trim();
  const matchesOwner = (doc) => !owner || String(doc.user_id || '').trim() === owner;
  const matchesBiz = (doc) => docBusinessId(doc) === bid;

  const salesPointsDb = getWorkCentersDbName(); // `${prefix}-sales-points`
  const deliveryDb = getDeliveryDbName();
  const catalogDb = getCatalogDbName();

  const salesPoints = await softDeleteMatching(
    req,
    salesPointsDb,
    (doc) =>
      matchesOwner(doc) &&
      matchesBiz(doc) &&
      (doc.type === 'sales_point' || doc.type === 'work_center'),
    'sales-point',
  );

  const deliveryPdvs = await softDeleteMatching(
    req,
    deliveryDb,
    (doc) => matchesOwner(doc) && matchesBiz(doc) && doc.type === 'point_of_sale',
    'point_of_sale',
  );

  const sessions = await softDeleteMatching(
    req,
    deliveryDb,
    (doc) => matchesOwner(doc) && matchesBiz(doc) && doc.type === 'tpv_register_session',
    'tpv_session',
  );

  // Cerrar visualmente: softDelete ya marca deletedAt; status open queda colgando en UI si se lista sin deletedAt filter — OK

  const catalog = await softDeleteMatching(
    req,
    catalogDb,
    (doc) =>
      matchesOwner(doc) &&
      matchesBiz(doc) &&
      (doc.type === 'catalog_item' || doc.type === 'brand'),
    'catalog',
  );

  return { salesPoints, deliveryPdvs, sessions, catalog };
}
