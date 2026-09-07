import {
  ensureDatabase,
  ensureIndex,
  findDocuments,
  getDocument,
  getWebDbName,
  putDocument,
} from './couchdb.js';

const ORDER_TYPE = 'uber_sandbox_order';
const EVENT_TYPE = 'uber_webhook_event';
const indexReady = new Set();

function clean(value) {
  return String(value || '').trim();
}

function encoded(value) {
  return Buffer.from(clean(value), 'utf8').toString('base64url');
}

export function uberSandboxOrderDocumentId(businessId, externalOrderId) {
  const bid = clean(businessId);
  const oid = clean(externalOrderId);
  if (!bid || !oid) throw new Error('Falta empresa u order ID de Uber');
  return `uber-sandbox-order:${encoded(bid)}:${encoded(oid)}`;
}

function eventDocumentId(environment, eventId) {
  return `uber-event:${clean(environment).toLowerCase() || 'sandbox'}:${encoded(eventId)}`;
}

export function sanitizeUberSandboxOrder(doc) {
  if (!doc || doc.type !== ORDER_TYPE || doc.deletedAt) return null;
  return {
    id: clean(doc._id),
    businessId: clean(doc.business_id),
    environment: clean(doc.environment) || 'sandbox',
    bindingId: clean(doc.bindingId),
    storeId: clean(doc.storeId),
    storeName: clean(doc.storeName),
    brandId: clean(doc.brandId),
    brandName: clean(doc.brandName),
    salesPointId: clean(doc.salesPointId),
    salesPointName: clean(doc.salesPointName),
    externalOrderId: clean(doc.externalOrderId),
    orderNumber: clean(doc.orderNumber),
    customerName: clean(doc.customerName),
    deliveryType: clean(doc.deliveryType) === 'recogida' ? 'recogida' : 'domicilio',
    items: Array.isArray(doc.items) ? doc.items.map((item) => ({
      id: clean(item?.id),
      name: clean(item?.name),
      quantity: Number(item?.quantity || 0),
      unitPrice: Number(item?.unitPrice || 0),
      total: Number(item?.total || 0),
    })) : [],
    totalAmount: Number(doc.totalAmount || 0),
    status: clean(doc.status) || 'received',
    scheduledFor: clean(doc.scheduledFor),
    receivedAt: clean(doc.receivedAt),
    acceptedAt: clean(doc.acceptedAt),
    deniedAt: clean(doc.deniedAt),
    readyAt: clean(doc.readyAt),
    cancelledAt: clean(doc.cancelledAt),
    readyTimeUpdatedAt: clean(doc.readyTimeUpdatedAt),
    canAdjustReadyTime: typeof doc.canAdjustReadyTime === 'boolean' ? doc.canAdjustReadyTime : null,
    prepMinutes: Number(doc.prepMinutes || 0),
    pickupTime: Number(doc.pickupTime || 0),
    lastError: clean(doc.lastError),
    updatedAt: clean(doc.updatedAt),
  };
}

async function ensureSandboxOrderIndex(req) {
  const db = getWebDbName();
  if (indexReady.has(db)) return;
  await ensureDatabase(req, db);
  await ensureIndex(
    req,
    db,
    ['type', 'business_id', 'environment'],
    'idx-web-uber-sandbox-order-business-env',
  ).catch(() => null);
  indexReady.add(db);
}

export async function listUberSandboxOrders(req, businessId, environment = 'sandbox') {
  const bid = clean(businessId);
  if (!bid) return [];
  await ensureSandboxOrderIndex(req);
  const docs = await findDocuments(req, getWebDbName(), {
    type: ORDER_TYPE,
    business_id: bid,
    environment: clean(environment).toLowerCase() || 'sandbox',
  }, {
    pageSize: 100,
    maxDocs: 500,
  });
  return docs
    .map(sanitizeUberSandboxOrder)
    .filter(Boolean)
    .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
}

export async function getUberSandboxOrder(req, businessId, externalOrderId) {
  try {
    const doc = await getDocument(
      req,
      getWebDbName(),
      uberSandboxOrderDocumentId(businessId, externalOrderId),
    );
    return sanitizeUberSandboxOrder(doc);
  } catch {
    return null;
  }
}

export async function saveUberSandboxOrder(req, data) {
  const businessId = clean(data.businessId);
  const externalOrderId = clean(data.externalOrderId);
  const id = uberSandboxOrderDocumentId(businessId, externalOrderId);
  const db = getWebDbName();
  await ensureDatabase(req, db);
  let existing = null;
  try {
    existing = await getDocument(req, db, id);
  } catch {
    existing = null;
  }
  const now = new Date().toISOString();
  const items = Array.isArray(data.items)
    ? data.items.map((item, index) => ({
      id: clean(item?.id) || `item-${index + 1}`,
      name: clean(item?.name) || `Producto ${index + 1}`,
      quantity: Math.max(0, Number(item?.quantity || 0)),
      unitPrice: Number(item?.unitPrice || 0),
      total: Number(item?.total || 0),
    }))
    : (existing?.items || []);
  const totalAmount = Number.isFinite(Number(data.totalAmount))
    ? Number(data.totalAmount)
    : items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const requestedStatus = clean(data.status);
  const status = requestedStatus === 'received' && existing?.status && existing.status !== 'received'
    ? existing.status
    : (requestedStatus || existing?.status || 'received');
  const doc = {
    ...(existing || {}),
    _id: id,
    _rev: existing?._rev,
    type: ORDER_TYPE,
    business_id: businessId,
    environment: clean(data.environment) || existing?.environment || 'sandbox',
    bindingId: clean(data.bindingId ?? existing?.bindingId),
    storeId: clean(data.storeId ?? existing?.storeId),
    storeName: clean(data.storeName ?? existing?.storeName),
    brandId: clean(data.brandId ?? existing?.brandId),
    brandName: clean(data.brandName ?? existing?.brandName),
    salesPointId: clean(data.salesPointId ?? existing?.salesPointId),
    salesPointName: clean(data.salesPointName ?? existing?.salesPointName),
    externalOrderId,
    orderNumber: clean(data.orderNumber ?? existing?.orderNumber) || externalOrderId,
    customerName: clean(data.customerName ?? existing?.customerName),
    deliveryType: clean(data.deliveryType ?? existing?.deliveryType) === 'recogida'
      ? 'recogida'
      : 'domicilio',
    items,
    totalAmount,
    status,
    scheduledFor: clean(data.scheduledFor ?? existing?.scheduledFor),
    receivedAt: existing?.receivedAt || clean(data.receivedAt) || now,
    acceptedAt: clean(data.acceptedAt ?? existing?.acceptedAt),
    deniedAt: clean(data.deniedAt ?? existing?.deniedAt),
    readyAt: clean(data.readyAt ?? existing?.readyAt),
    cancelledAt: clean(data.cancelledAt ?? existing?.cancelledAt),
    readyTimeUpdatedAt: clean(data.readyTimeUpdatedAt ?? existing?.readyTimeUpdatedAt),
    canAdjustReadyTime: typeof data.canAdjustReadyTime === 'boolean'
      ? data.canAdjustReadyTime
      : (typeof existing?.canAdjustReadyTime === 'boolean' ? existing.canAdjustReadyTime : null),
    prepMinutes: Number(data.prepMinutes ?? existing?.prepMinutes ?? 0),
    pickupTime: Number(data.pickupTime ?? existing?.pickupTime ?? 0),
    lastError: clean(data.lastError ?? existing?.lastError),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const saved = await putDocument(req, db, id, doc);
  return sanitizeUberSandboxOrder({ ...doc, _rev: saved.rev });
}

export async function hasProcessedUberEvent(req, environment, eventId) {
  if (!clean(eventId)) return false;
  try {
    const doc = await getDocument(req, getWebDbName(), eventDocumentId(environment, eventId));
    return Boolean(doc && doc.type === EVENT_TYPE);
  } catch {
    return false;
  }
}

export async function recordProcessedUberEvent(req, {
  environment,
  eventId,
  eventType,
  storeId,
  businessId,
}) {
  if (!clean(eventId)) return;
  const db = getWebDbName();
  await ensureDatabase(req, db);
  const id = eventDocumentId(environment, eventId);
  const doc = {
    _id: id,
    type: EVENT_TYPE,
    environment: clean(environment) || 'sandbox',
    eventId: clean(eventId),
    eventType: clean(eventType),
    storeId: clean(storeId),
    business_id: clean(businessId),
    processedAt: new Date().toISOString(),
  };
  try {
    await putDocument(req, db, id, doc);
  } catch (error) {
    if (!/conflict|409/i.test(error?.message || '')) throw error;
  }
}
