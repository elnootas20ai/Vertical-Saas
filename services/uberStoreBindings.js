import {
  ensureDatabase,
  ensureIndex,
  findDocuments,
  getDocument,
  getWebDbName,
  putDocument,
} from './couchdb.js';

const TYPE = 'uber_store_binding';
const indexReady = new Set();

function clean(value) {
  return String(value || '').trim();
}

export function uberBindingDocumentId(environment, storeId) {
  const env = clean(environment).toLowerCase() || 'sandbox';
  const sid = clean(storeId);
  if (!sid) throw new Error('Falta Store ID de Uber');
  return `uber-binding:${env}:${Buffer.from(sid, 'utf8').toString('base64url')}`;
}

export function uberIntegratorStoreId(businessId, storeId) {
  const businessPart = Buffer.from(clean(businessId), 'utf8').toString('base64url').slice(0, 18);
  const storePart = Buffer.from(clean(storeId), 'utf8').toString('base64url').slice(0, 18);
  return `vt-${businessPart}-${storePart}`;
}

export function sanitizeUberStoreBinding(doc) {
  if (!doc || doc.type !== TYPE || doc.deletedAt) return null;
  return {
    id: clean(doc._id),
    environment: clean(doc.environment) || 'sandbox',
    businessId: clean(doc.business_id),
    storeId: clean(doc.storeId),
    storeName: clean(doc.storeName),
    brandId: clean(doc.brandId),
    brandName: clean(doc.brandName),
    salesPointId: clean(doc.salesPointId),
    salesPointName: clean(doc.salesPointName),
    workCenterId: clean(doc.workCenterId),
    active: doc.active !== false,
    primary: Boolean(doc.primary),
    defaultPrepMinutes: Math.min(180, Math.max(5, Number(doc.defaultPrepMinutes) || 20)),
    posIntegrationEnabled: Boolean(doc.posIntegrationEnabled),
    provisionedAt: clean(doc.provisionedAt),
    menuPushedAt: clean(doc.menuPushedAt),
    menuItemCount: Number(doc.menuItemCount || 0),
    lastStoreStatus: clean(doc.lastStoreStatus),
    lastStoreStatusAt: clean(doc.lastStoreStatusAt),
    lastWebhookAt: clean(doc.lastWebhookAt),
    lastWebhookType: clean(doc.lastWebhookType),
    lastOrderAt: clean(doc.lastOrderAt),
    lastOrderStatus: clean(doc.lastOrderStatus),
    lastOrderAcceptedAt: clean(doc.lastOrderAcceptedAt),
    lastOrderDeniedAt: clean(doc.lastOrderDeniedAt),
    lastOrderCancelledAt: clean(doc.lastOrderCancelledAt),
    lastOrderReadyAt: clean(doc.lastOrderReadyAt),
    createdAt: clean(doc.createdAt),
    updatedAt: clean(doc.updatedAt),
  };
}

async function ensureBindingIndex(req) {
  const db = getWebDbName();
  if (indexReady.has(db)) return;
  await ensureDatabase(req, db);
  await ensureIndex(
    req,
    db,
    ['type', 'business_id', 'environment'],
    'idx-web-uber-binding-business-env',
  ).catch(() => null);
  indexReady.add(db);
}

export async function getUberStoreBinding(req, environment, storeId) {
  const db = getWebDbName();
  await ensureDatabase(req, db);
  try {
    const doc = await getDocument(req, db, uberBindingDocumentId(environment, storeId));
    return sanitizeUberStoreBinding(doc);
  } catch {
    return null;
  }
}

export async function listUberStoreBindings(req, businessId, environment = '') {
  const bid = clean(businessId);
  if (!bid) return [];
  await ensureBindingIndex(req);
  const selector = {
    type: TYPE,
    business_id: bid,
    ...(environment ? { environment: clean(environment).toLowerCase() } : {}),
  };
  const docs = await findDocuments(req, getWebDbName(), selector, {
    pageSize: 100,
    maxDocs: 500,
  });
  return docs
    .map(sanitizeUberStoreBinding)
    .filter(Boolean)
    .sort((a, b) => Number(b.primary) - Number(a.primary)
      || a.storeName.localeCompare(b.storeName, 'es'));
}

export async function saveUberStoreBinding(req, data) {
  const environment = clean(data.environment).toLowerCase() || 'sandbox';
  const businessId = clean(data.businessId);
  const storeId = clean(data.storeId);
  if (!businessId) throw new Error('Falta empresa del binding Uber');
  if (!storeId) throw new Error('Falta Store ID del binding Uber');

  const db = getWebDbName();
  await ensureDatabase(req, db);
  const id = uberBindingDocumentId(environment, storeId);
  let existing = null;
  try {
    existing = await getDocument(req, db, id);
  } catch {
    existing = null;
  }
  if (existing && !existing.deletedAt && clean(existing.business_id) !== businessId) {
    const error = new Error('Esta tienda Uber ya está vinculada a otra empresa');
    error.status = 409;
    throw error;
  }
  if (existing?.deletedAt) {
    // Al reasignar una tienda desvinculada no se heredan marca/PDV de otra empresa.
    existing = { _id: id, _rev: existing._rev };
  }

  const now = new Date().toISOString();
  const doc = {
    ...(existing || {}),
    _id: id,
    _rev: existing?._rev,
    type: TYPE,
    environment,
    business_id: businessId,
    storeId,
    storeName: clean(data.storeName ?? existing?.storeName) || storeId,
    brandId: clean(data.brandId ?? existing?.brandId),
    brandName: clean(data.brandName ?? existing?.brandName),
    salesPointId: clean(data.salesPointId ?? existing?.salesPointId),
    salesPointName: clean(data.salesPointName ?? existing?.salesPointName),
    workCenterId: clean(data.workCenterId ?? existing?.workCenterId),
    active: data.active !== undefined ? Boolean(data.active) : existing?.active !== false,
    primary: data.primary !== undefined ? Boolean(data.primary) : Boolean(existing?.primary),
    defaultPrepMinutes: Math.min(
      180,
      Math.max(5, Number(data.defaultPrepMinutes ?? existing?.defaultPrepMinutes) || 20),
    ),
    posIntegrationEnabled: data.posIntegrationEnabled !== undefined
      ? Boolean(data.posIntegrationEnabled)
      : Boolean(existing?.posIntegrationEnabled),
    provisionedAt: clean(data.provisionedAt ?? existing?.provisionedAt),
    menuPushedAt: clean(data.menuPushedAt ?? existing?.menuPushedAt),
    menuItemCount: Number(data.menuItemCount ?? existing?.menuItemCount ?? 0),
    lastStoreStatus: clean(data.lastStoreStatus ?? existing?.lastStoreStatus),
    lastStoreStatusAt: clean(data.lastStoreStatusAt ?? existing?.lastStoreStatusAt),
    lastWebhookAt: clean(data.lastWebhookAt ?? existing?.lastWebhookAt),
    lastWebhookType: clean(data.lastWebhookType ?? existing?.lastWebhookType),
    lastOrderAt: clean(data.lastOrderAt ?? existing?.lastOrderAt),
    lastOrderStatus: clean(data.lastOrderStatus ?? existing?.lastOrderStatus),
    lastOrderAcceptedAt: clean(data.lastOrderAcceptedAt ?? existing?.lastOrderAcceptedAt),
    lastOrderDeniedAt: clean(data.lastOrderDeniedAt ?? existing?.lastOrderDeniedAt),
    lastOrderCancelledAt: clean(data.lastOrderCancelledAt ?? existing?.lastOrderCancelledAt),
    lastOrderReadyAt: clean(data.lastOrderReadyAt ?? existing?.lastOrderReadyAt),
    deletedAt: null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const saved = await putDocument(req, db, id, doc);
  return sanitizeUberStoreBinding({ ...doc, _rev: saved.rev });
}

export async function deleteUberStoreBinding(req, environment, storeId, businessId) {
  const db = getWebDbName();
  const id = uberBindingDocumentId(environment, storeId);
  const existing = await getDocument(req, db, id);
  if (!existing || existing.type !== TYPE || existing.deletedAt) return false;
  if (clean(existing.business_id) !== clean(businessId)) {
    const error = new Error('El binding Uber no pertenece a esta empresa');
    error.status = 403;
    throw error;
  }
  const now = new Date().toISOString();
  await putDocument(req, db, id, {
    ...existing,
    active: false,
    deletedAt: now,
    updatedAt: now,
  });
  return true;
}

export function legacyUberBinding(uber, businessId) {
  const storeId = clean(uber?.storeId);
  if (!storeId) return null;
  return {
    id: '',
    environment: clean(uber?.env) || 'sandbox',
    businessId: clean(businessId),
    storeId,
    storeName: clean(uber?.storeName) || storeId,
    brandId: '',
    brandName: '',
    salesPointId: clean(uber?.salesPointId),
    salesPointName: '',
    workCenterId: '',
    active: uber?.enabled !== false,
    primary: true,
    defaultPrepMinutes: 20,
    posIntegrationEnabled: Boolean(uber?.posIntegrationEnabled),
    provisionedAt: clean(uber?.provisionedAt),
    menuPushedAt: clean(uber?.menuPushedAt),
    menuItemCount: Number(uber?.menuItemCount || 0),
    lastStoreStatus: clean(uber?.lastStoreStatus),
    lastStoreStatusAt: clean(uber?.lastStoreStatusAt),
    lastWebhookAt: clean(uber?.lastWebhookAt),
    lastWebhookType: clean(uber?.lastWebhookType),
    lastOrderAt: clean(uber?.lastOrderAt),
    lastOrderStatus: clean(uber?.lastOrderStatus),
    lastOrderAcceptedAt: clean(uber?.lastOrderAcceptedAt),
    lastOrderDeniedAt: clean(uber?.lastOrderDeniedAt),
    lastOrderCancelledAt: clean(uber?.lastOrderCancelledAt),
    lastOrderReadyAt: clean(uber?.lastOrderReadyAt),
    createdAt: '',
    updatedAt: '',
  };
}
