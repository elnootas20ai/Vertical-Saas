/**
 * Helpers compartidos para smoke tests SaaS.
 * Espejan la lógica de src/app/lib/tenantUserId.ts y deliverySetup.ts (filtro tiendas).
 */

export function normalizeBusinessScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

export function normalizeTenantUserId(userId) {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

/** Misma regla que resolveBusinessDataUserId (sin normalizar account: en tenant global). */
export function resolveBusinessDataUserId(authUser, business) {
  const selfId = String(authUser?.user_id || authUser?.id || '').trim();
  if (!selfId) return '';
  const ownerId = String(business?.owner_user_id || '').trim();
  if (!ownerId || ownerId === selfId) return selfId;
  const members = business?.members || [];
  const isMember = members.some((m) => String(m.user_id || '').trim() === selfId);
  return isMember ? ownerId : selfId;
}

export function readWorkCenterBusinessId(wc) {
  return normalizeBusinessScopeId(wc.businessId || wc.business_id);
}

export function isDeliveryBusinessType(businessType) {
  return String(businessType || '').trim() === 'delivery';
}

export function filterWorkCentersForBusinessScope(workCenters, businessId, options = {}) {
  const bid = normalizeBusinessScopeId(businessId);
  if (!bid) return [];

  const active = workCenters.filter((wc) => !wc.deletedAt);
  const mine = active.filter((wc) => readWorkCenterBusinessId(wc) === bid);
  const accountN = options.accountBusinessCount;

  if (accountN === undefined) {
    return mine;
  }
  if (accountN >= 2) {
    return mine;
  }
  if (accountN === 1) {
    const isRetail = (wc) =>
      wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen';
    const legacy = active.filter((wc) => !readWorkCenterBusinessId(wc) && isRetail(wc));
    const merged = new Map();
    for (const wc of [...mine, ...legacy]) merged.set(wc._id, wc);
    return [...merged.values()];
  }
  return mine;
}

export function normalizeAccountUserId(userId) {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

export function addAllowedUserId(allowed, userId) {
  const id = String(userId || '').trim();
  if (!id) return;
  allowed.add(id);
  allowed.add(normalizeAccountUserId(id));
  if (!id.startsWith('account:')) allowed.add(`account:${id}`);
}

export function isAllowedUserId(allowed, userId) {
  const raw = String(userId || '').trim();
  if (!raw) return false;
  return allowed.has(raw) || allowed.has(normalizeAccountUserId(raw));
}

export function listWorkCentersForSmoke(allDocs, dataUserId, business) {
  const id = String(dataUserId || '').trim();
  if (!id) return [];

  const allowed = new Set();
  addAllowedUserId(allowed, id);
  addAllowedUserId(allowed, String(business?.owner_user_id || '').trim());
  for (const m of business?.members || []) {
    addAllowedUserId(allowed, String(m.user_id || '').trim());
  }

  return (allDocs || [])
    .filter(
      (doc) =>
        doc?.type === 'sales_point' &&
        !doc?.deletedAt &&
        isAllowedUserId(allowed, doc.user_id),
    )
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}
