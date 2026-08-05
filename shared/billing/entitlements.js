/**
 * Límites comerciales Vertial (fuente compartida backend + alineada con tenantEntitlements.ts).
 */

export const POINT_OF_SALE_LIMITS = {
  basic: 1,
  normal: 1,
  pro: 2,
};

export const INCLUDED_BUSINESSES = {
  basic: 1,
  normal: 1,
  pro: 2,
};

export const INCLUDED_COMMERCIAL_BRANDS = {
  basic: 1,
  normal: 1,
  pro: 2,
};

/** Trabajadores incluidos por plan (sin contar al dueño). Alineado con planCatalog.maxUsers. */
export const WORKER_SEAT_LIMITS = {
  basic: 2,
  normal: 6,
  pro: 12,
};

export const PLAN_TIER_LABELS = {
  basic: 'Básico',
  normal: 'Normal',
  pro: 'Pro',
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'subscription_active',
  'trial_active',
  'trial_expiring',
]);

function subField(subscription, field, fallback = '') {
  if (!subscription || typeof subscription !== 'object') return fallback;
  const value = subscription[field];
  return value === undefined || value === null ? fallback : value;
}

export function resolvePlanTier(planId, planName) {
  const id = String(planId || '').toLowerCase();
  const name = String(planName || '').toLowerCase();
  if (id === 'pro' || name.includes('pro')) return 'pro';
  if (id === 'normal' || name.includes('normal') || name.includes('mediano')) return 'normal';
  return 'basic';
}

export function clampExtraPointOfSaleSlots(value) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(99, n));
}

export function clampExtraCommercialBrandSlots(value) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(99, n));
}

export function clampExtraBusinessSlots(value) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(99, n));
}

export function clampExtraWorkerSlots(value) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(999, n));
}

export function getBasePointOfSaleLimit(planTier) {
  return POINT_OF_SALE_LIMITS[planTier] || POINT_OF_SALE_LIMITS.basic;
}

export function getBaseWorkerSeatLimit(planTier) {
  return WORKER_SEAT_LIMITS[planTier] || WORKER_SEAT_LIMITS.basic;
}

export function getEffectivePointOfSaleLimit(subscription) {
  const status = String(subField(subscription, 'status', ''));
  if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    return POINT_OF_SALE_LIMITS.basic;
  }
  const tier = resolvePlanTier(subField(subscription, 'selectedPlanId'), subField(subscription, 'planName'));
  const extra = clampExtraPointOfSaleSlots(subField(subscription, 'extraPointOfSaleSlots', 0));
  return getBasePointOfSaleLimit(tier) + extra;
}

export function getEffectiveBusinessLimit(subscription) {
  const tier = resolvePlanTier(subField(subscription, 'selectedPlanId'), subField(subscription, 'planName'));
  const extra = clampExtraBusinessSlots(subField(subscription, 'extraBusinessSlots', 0));
  return (INCLUDED_BUSINESSES[tier] || 1) + extra;
}

export function getEffectiveCommercialBrandLimit(subscription) {
  const tier = resolvePlanTier(subField(subscription, 'selectedPlanId'), subField(subscription, 'planName'));
  const extra = clampExtraCommercialBrandSlots(subField(subscription, 'extraCommercialBrandSlots', 0));
  return (INCLUDED_COMMERCIAL_BRANDS[tier] || 0) + extra;
}

/**
 * Cupo de trabajadores = plan + extras contratados/admin.
 * billingExempt → sin tope práctico.
 */
export function getEffectiveWorkerSeatLimit(subscription) {
  if (subscription && subscription.billingExempt) {
    return 999;
  }
  const status = String(subField(subscription, 'status', ''));
  if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    return WORKER_SEAT_LIMITS.basic;
  }
  const tier = resolvePlanTier(subField(subscription, 'selectedPlanId'), subField(subscription, 'planName'));
  const extra = clampExtraWorkerSlots(subField(subscription, 'extraWorkerSlots', 0));
  return getBaseWorkerSeatLimit(tier) + extra;
}

export function subscriptionHasAdminProAccess(subscription) {
  return Boolean(subscription && subscription.adminProAccess);
}

export function subscriptionHasProAccess(subscription) {
  const status = String(subField(subscription, 'status', ''));
  if (!subscription || !ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    return false;
  }
  if (subscriptionHasAdminProAccess(subscription)) return true;
  return resolvePlanTier(subField(subscription, 'selectedPlanId'), subField(subscription, 'planName')) === 'pro';
}

export function resolveTenantEntitlements(subscription, counts) {
  const planTier = resolvePlanTier(subField(subscription, 'selectedPlanId'), subField(subscription, 'planName'));
  const hasProAccess = subscriptionHasProAccess(subscription);
  const businessLimit = getEffectiveBusinessLimit(subscription);
  const pdvLimit = getEffectivePointOfSaleLimit(subscription);
  const brandLimit = getEffectiveCommercialBrandLimit(subscription);
  const workerLimit = getEffectiveWorkerSeatLimit(subscription);
  const safeCounts = counts || { businesses: 0, pointOfSales: 0, commercialBrands: 0, workers: 0 };

  return {
    planTier,
    planLabel: PLAN_TIER_LABELS[planTier] || planTier,
    hasProAccess,
    businesses: businessLimit,
    pointOfSales: pdvLimit,
    commercialBrands: brandLimit,
    workers: workerLimit,
    canCreateBusiness: safeCounts.businesses < businessLimit,
    canCreatePointOfSale: safeCounts.pointOfSales < pdvLimit,
    canCreateCommercialBrand: safeCounts.commercialBrands < brandLimit,
    canInviteWorker: (safeCounts.workers || 0) < workerLimit,
  };
}
