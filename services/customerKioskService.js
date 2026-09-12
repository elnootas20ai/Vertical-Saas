import { createHash, randomBytes } from 'node:crypto';
import {
  ensureDatabase,
  ensureIndex,
  findDocuments,
  getDocument,
  getWebConfigByBusinessId,
  getWebDbName,
  listScopedPointsOfSaleForBusiness,
  putDocument,
  sanitizePointOfSalePublicOrderingConfig,
} from './couchdb.js';

function normalizeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function tokenHash(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

function kioskId() {
  return `customer-kiosk-${randomBytes(12).toString('hex')}`;
}

async function ensureKioskIndex(req, db) {
  await ensureIndex(req, db, ['type', 'tokenHash'], 'idx-customer-kiosk-token').catch(() => {});
  await ensureIndex(req, db, ['type', 'business_id', 'salesPointId'], 'idx-customer-kiosk-store').catch(() => {});
}

export async function listCustomerKiosks(req, { ownerUserId, businessId }) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  await ensureKioskIndex(req, db);
  const docs = await findDocuments(req, db, {
    type: 'customer_kiosk',
    business_id: normalizeId(businessId),
  }, { pageSize: 100, maxDocs: 500 });
  return docs
    .filter((doc) => !doc.deletedAt && (!ownerUserId || doc.user_id === ownerUserId))
    .map((doc) => ({
      id: doc._id,
      name: doc.name || 'Tablet clientes',
      salesPointId: doc.salesPointId || '',
      active: doc.active !== false,
      createdAt: doc.createdAt || '',
      updatedAt: doc.updatedAt || '',
    }));
}

export async function issueCustomerKioskToken(req, {
  ownerUserId,
  businessId,
  salesPointId,
  name,
}) {
  const bid = normalizeId(businessId);
  const pdvId = String(salesPointId || '').trim();
  const pdvs = await listScopedPointsOfSaleForBusiness(req, ownerUserId, bid);
  const pdv = pdvs.find((item) => String(item._id) === pdvId && item.active !== false && !item.deletedAt);
  if (!pdv) {
    const error = new Error('La tienda no pertenece a este negocio');
    error.status = 400;
    throw error;
  }
  const config = sanitizePointOfSalePublicOrderingConfig(pdv.publicOrderingConfig);
  if (!config.customerKioskEnabled || !config.pickupEnabled) {
    const error = new Error('Activa la tablet de autoservicio y la recogida en esta tienda');
    error.status = 409;
    throw error;
  }
  const token = `kt_${randomBytes(32).toString('base64url')}`;
  const now = new Date().toISOString();
  const doc = {
    _id: kioskId(),
    type: 'customer_kiosk',
    user_id: ownerUserId,
    business_id: bid,
    salesPointId: pdvId,
    name: String(name || 'Tablet clientes').trim().slice(0, 80),
    tokenHash: tokenHash(token),
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  const db = getWebDbName();
  await ensureDatabase(req, db);
  await ensureKioskIndex(req, db);
  const result = await putDocument(req, db, doc._id, doc);
  return {
    kiosk: {
      id: doc._id,
      name: doc.name,
      salesPointId: pdvId,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    token,
    rev: result.rev,
  };
}

export async function revokeCustomerKiosk(req, { businessId, kioskId: id }) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  const current = await getDocument(req, db, id);
  if (
    !current
    || current.type !== 'customer_kiosk'
    || normalizeId(current.business_id) !== normalizeId(businessId)
  ) {
    const error = new Error('Tablet no encontrada');
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  const saved = { ...current, active: false, revokedAt: now, updatedAt: now };
  await putDocument(req, db, saved._id, saved);
}

export async function resolveCustomerKioskContext(req, { token, businessId, slug }) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  await ensureKioskIndex(req, db);
  const docs = await findDocuments(req, db, {
    type: 'customer_kiosk',
    tokenHash: tokenHash(token),
  }, { pageSize: 2, maxDocs: 2 });
  const kiosk = docs.find((doc) => doc.active !== false && !doc.deletedAt);
  if (!kiosk) {
    const error = new Error('Tablet no válida o revocada');
    error.status = 403;
    throw error;
  }
  const bid = normalizeId(kiosk.business_id);
  if (businessId && bid !== normalizeId(businessId)) {
    const error = new Error('La tablet no pertenece a este negocio');
    error.status = 403;
    throw error;
  }
  const web = await getWebConfigByBusinessId(req, bid);
  if (!web?.enabled || (slug && web.slug !== slug)) {
    const error = new Error('La web de pedidos no está activa');
    error.status = 403;
    throw error;
  }
  const pdvs = await listScopedPointsOfSaleForBusiness(req, kiosk.user_id, bid);
  const pdv = pdvs.find((item) => String(item._id) === String(kiosk.salesPointId));
  const config = sanitizePointOfSalePublicOrderingConfig(pdv?.publicOrderingConfig);
  if (!pdv || pdv.active === false || !config.customerKioskEnabled || !config.pickupEnabled) {
    const error = new Error('La tablet está desactivada en esta tienda');
    error.status = 403;
    throw error;
  }
  return {
    kiosk,
    businessId: bid,
    salesPointId: pdv._id,
    salesPointName: pdv.name || pdv.code || '',
    webSlug: web.slug,
    storeName: web.storeName || pdv.name || '',
    fulfillment: config,
    token: String(token || ''),
  };
}
