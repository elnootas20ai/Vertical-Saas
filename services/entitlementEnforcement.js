import {
  findAccountByUserId,
  findBusinessById,
  getWorkCentersDbName,
  listBrandsByBusiness,
  listBusinessesByUser,
  listPointsOfSaleByUser,
  ensureDatabase,
  getAllDocuments,
  getDocument,
} from './couchdb.js';
import { isDefaultCommercialBrandName } from '../shared/brand/constants.js';
import {
  getEffectivePointOfSaleLimit,
  PLAN_TIER_LABELS,
  resolveTenantEntitlements,
} from '../shared/billing/entitlements.js';
import {
  canCreateDeliveryPointOfSale,
  countEffectiveRetailPointOfSaleSlots,
} from '../shared/billing/pointOfSaleSlotCount.js';
import { isVertialSuperAdminEmail } from '../utils/superAdmin.js';

function normalizeBusinessScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function workCenterDocMatchesUser(doc, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return true;
  const docUser = String(doc?.user_id || '').trim();
  if (!docUser) return true;
  const norm = (v) => (v.startsWith('account:') ? v.slice('account:'.length) : v);
  return docUser === uid || norm(docUser) === norm(uid);
}

function isWorkCentersDb(dbName) {
  return normalizeDbNameCompare(dbName) === normalizeDbNameCompare(getWorkCentersDbName());
}

function normalizeDbNameCompare(name) {
  return String(name || '').trim().toLowerCase();
}

function forbidden(message, code = 'PLAN_LIMIT_REACHED') {
  return { ok: false, status: 403, error: message, code };
}

export function shouldBypassEntitlementEnforcement(actorEmail) {
  return isVertialSuperAdminEmail(actorEmail);
}

export async function resolveBillingAccount(req, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  return findAccountByUserId(req, uid);
}

export async function resolveBillingAccountForBusiness(req, businessId) {
  const business = await findBusinessById(req, businessId);
  if (!business) return null;
  const ownerId = String(business.owner_user_id || business.ownerUserId || '').trim();
  if (!ownerId) return null;
  return findAccountByUserId(req, ownerId);
}

async function countBusinessesForAccount(req, account) {
  const list = await listBusinessesByUser(req, account.user_id);
  return list.filter((b) => !b.deletedAt).length;
}

async function countCommercialBrandsForBusiness(req, businessId) {
  const brands = await listBrandsByBusiness(req, businessId);
  return brands.filter((b) => !b.isDefault && !isDefaultCommercialBrandName(b.name)).length;
}

async function countPdvWorkCentersForAccount(req, account, excludeDocId = '') {
  const userId = account.user_id;
  const businesses = await listBusinessesByUser(req, userId);
  const businessIds = new Set(
    businesses.map((b) => normalizeBusinessScopeId(b._id || b.business_id)),
  );
  const db = getWorkCentersDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  const exclude = String(excludeDocId || '').trim();
  return docs.filter((d) => {
    if (d?.type !== 'sales_point' || d?.deletedAt) return false;
    if (String(d._id || '') === exclude) return false;
    if (d?.centerType !== 'punto_de_venta') return false;
    const wb = normalizeBusinessScopeId(d.businessId || d.business_id);
    if (wb && businessIds.has(wb)) return true;
    return workCenterDocMatchesUser(d, userId);
  }).length;
}

async function countActiveDeliveryPdvsForAccount(req, account, excludeDocId = '') {
  const pdvs = await listPointsOfSaleByUser(req, account.user_id);
  const exclude = String(excludeDocId || '').trim();
  return pdvs.filter((p) => !p.deletedAt && String(p._id || '') !== exclude).length;
}

async function listActiveDeliveryPdvsForAccount(req, account, excludeDocId = '') {
  const pdvs = await listPointsOfSaleByUser(req, account.user_id);
  const exclude = String(excludeDocId || '').trim();
  return pdvs.filter((p) => !p.deletedAt && String(p._id || '') !== exclude);
}

async function listPdvWorkCentersForAccount(req, account, excludeDocId = '') {
  const userId = account.user_id;
  const businesses = await listBusinessesByUser(req, userId);
  const businessIds = new Set(
    businesses.map((b) => normalizeBusinessScopeId(b._id || b.business_id)),
  );
  const db = getWorkCentersDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  const exclude = String(excludeDocId || '').trim();
  return docs.filter((d) => {
    if (d?.type !== 'sales_point' || d?.deletedAt) return false;
    if (String(d._id || '') === exclude) return false;
    if (d?.centerType !== 'punto_de_venta') return false;
    const wb = normalizeBusinessScopeId(d.businessId || d.business_id);
    if (wb && businessIds.has(wb)) return true;
    return workCenterDocMatchesUser(d, userId);
  });
}

/** Tienda + caja enlazada = 1 cupo (no max(wc, pdv) que bloqueaba «Activar caja»). */
async function countEffectiveRetailPointOfSaleSlotsForAccount(req, account, excludeDocId = '') {
  const pdvs = await listActiveDeliveryPdvsForAccount(req, account, excludeDocId);
  const linkedWorkCenterIds = pdvs
    .map((p) => String(p.workCenterId || '').trim())
    .filter(Boolean);
  const linkedSet = new Set(linkedWorkCenterIds);
  const orphanPdvCount = pdvs.filter((p) => !String(p.workCenterId || '').trim()).length;
  const workCenters = await listPdvWorkCentersForAccount(req, account, excludeDocId);
  const unlinkedWorkCenterCount = workCenters.filter(
    (wc) => !linkedSet.has(String(wc._id || '').trim()),
  ).length;
  return countEffectiveRetailPointOfSaleSlots({
    linkedWorkCenterIds,
    orphanPdvCount,
    unlinkedWorkCenterCount,
  });
}

async function isLinkingDeliveryPdvToExistingStore(req, account, workCenterId, excludeDocId = '') {
  const wcId = String(workCenterId || '').trim();
  if (!wcId) return false;
  const pdvs = await listActiveDeliveryPdvsForAccount(req, account, excludeDocId);
  if (pdvs.some((p) => String(p.workCenterId || '').trim() === wcId)) return false;
  const workCenters = await listPdvWorkCentersForAccount(req, account, excludeDocId);
  return workCenters.some((wc) => String(wc._id || '').trim() === wcId);
}

function formatLimitMessage(kind, entitlements) {
  const label = entitlements.planLabel || 'tu plan';
  if (kind === 'business') {
    return `Has alcanzado el límite de ${entitlements.businesses} empresa(s) del plan ${label}. Contrata una ampliación o sube de plan en Facturación.`;
  }
  if (kind === 'pdv') {
    return `Has alcanzado el límite de ${entitlements.pointOfSales} PDV del plan ${label}. Contrata una ampliación en Facturación.`;
  }
  return `Has alcanzado el límite de ${entitlements.commercialBrands} marca(s) comercial(es) del plan ${label}. Contrata una ampliación en Facturación.`;
}

export async function assertCanCreateBusiness(req, userId, actorEmail) {
  if (shouldBypassEntitlementEnforcement(actorEmail)) return { ok: true };
  const account = await resolveBillingAccount(req, userId);
  if (!account) return { ok: true };
  const subscription = account.subscription || {};
  const counts = {
    businesses: await countBusinessesForAccount(req, account),
    pointOfSales: 0,
    commercialBrands: 0,
  };
  const entitlements = resolveTenantEntitlements(subscription, counts);
  if (entitlements.canCreateBusiness) return { ok: true };
  return forbidden(formatLimitMessage('business', entitlements));
}

export async function assertCanCreateCommercialBrand(req, businessId, brandPayload, actorEmail) {
  if (shouldBypassEntitlementEnforcement(actorEmail)) return { ok: true };
  const name = String(brandPayload?.name || '').trim();
  if (!name || isDefaultCommercialBrandName(name)) return { ok: true };

  const account = await resolveBillingAccountForBusiness(req, businessId);
  if (!account) return { ok: true };
  const subscription = account.subscription || {};
  const brandCount = await countCommercialBrandsForBusiness(req, businessId);
  const entitlements = resolveTenantEntitlements(subscription, {
    businesses: 0,
    pointOfSales: 0,
    commercialBrands: brandCount,
  });
  if (entitlements.canCreateCommercialBrand) return { ok: true };
  return forbidden(formatLimitMessage('brand', entitlements));
}

export async function assertCanCreatePointOfSale(req, userId, actorEmail, excludeDocId = '') {
  if (shouldBypassEntitlementEnforcement(actorEmail)) return { ok: true };
  const account = await resolveBillingAccount(req, userId);
  if (!account) return { ok: true };
  const subscription = account.subscription || {};
  const workCenterId = String(req?.body?.pointOfSale?.workCenterId || '').trim();
  const effectiveCount = await countEffectiveRetailPointOfSaleSlotsForAccount(
    req,
    account,
    excludeDocId,
  );
  const pdvLimit = getEffectivePointOfSaleLimit(subscription);
  const isLinkingExistingStore = workCenterId
    ? await isLinkingDeliveryPdvToExistingStore(req, account, workCenterId, excludeDocId)
    : false;
  const entitlements = resolveTenantEntitlements(subscription, {
    businesses: 0,
    pointOfSales: pdvLimit,
    commercialBrands: 0,
  });
  if (
    canCreateDeliveryPointOfSale({
      effectiveCount,
      limit: pdvLimit,
      isLinkingExistingStore,
    })
  ) {
    return { ok: true };
  }
  return forbidden(formatLimitMessage('pdv', entitlements));
}

/**
 * Valida escrituras Couch en la DB de centros (sales-points) al crear o convertir a PDV.
 */
export async function validateWorkCenterEntitlementWrite(req, dbName, docBody, docId, actorEmail) {
  if (!isWorkCentersDb(dbName)) return { ok: true };
  if (shouldBypassEntitlementEnforcement(actorEmail)) return { ok: true };

  const body = docBody || {};
  if (body.type !== 'sales_point' || body.deletedAt) return { ok: true };

  const nextType = String(body.centerType || 'punto_de_venta');
  if (nextType !== 'punto_de_venta') return { ok: true };

  let existing = null;
  if (docId) {
    const db = getWorkCentersDbName();
    await ensureDatabase(req, db);
    existing = await getDocument(req, db, docId);
  }

  const wasPdv = existing?.centerType === 'punto_de_venta' && !existing?.deletedAt;
  if (wasPdv) return { ok: true };

  const ownerUserId = String(body.user_id || existing?.user_id || req.authUser?.userId || req.authUser?.user_id || '').trim();
  const businessId = normalizeBusinessScopeId(body.businessId || body.business_id || existing?.businessId);

  let account = null;
  if (businessId) {
    account = await resolveBillingAccountForBusiness(req, businessId);
  }
  if (!account && ownerUserId) {
    account = await resolveBillingAccount(req, ownerUserId);
  }
  if (!account) return { ok: true };

  const subscription = account.subscription || {};
  const effectiveCount = await countEffectiveRetailPointOfSaleSlotsForAccount(
    req,
    account,
    String(docId || body._id || ''),
  );
  const pdvLimit = getEffectivePointOfSaleLimit(subscription);
  const entitlements = resolveTenantEntitlements(subscription, {
    businesses: 0,
    pointOfSales: pdvLimit,
    commercialBrands: 0,
  });
  if (
    canCreateDeliveryPointOfSale({
      effectiveCount,
      limit: pdvLimit,
      isLinkingExistingStore: false,
    })
  ) {
    return { ok: true };
  }
  return forbidden(formatLimitMessage('pdv', entitlements));
}

export { PLAN_TIER_LABELS, resolveTenantEntitlements };
