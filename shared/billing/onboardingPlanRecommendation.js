/**
 * Plan mínimo obligatorio en onboarding (backend). Mantener alineado con onboardingPlanRecommendation.ts.
 */

const PLAN_RANK = { basic: 0, normal: 1, pro: 2 };

function normalizeInfrastructureMetrics(metrics = {}) {
  return {
    userCount: Math.max(1, Math.floor(Number(metrics.userCount) || 1)),
    locationCount: Math.max(1, Math.floor(Number(metrics.locationCount) || 1)),
    businessCount: Math.max(1, Math.floor(Number(metrics.businessCount) || 1)),
    commercialBrandCount: Math.max(0, Math.floor(Number(metrics.commercialBrandCount) || 0)),
  };
}

function countEnabledModules(modules = {}) {
  return Object.values(modules).filter(Boolean).length;
}

function countDeliveryNeeds(needs = {}) {
  return Object.values(needs).filter(Boolean).length;
}

function modulesFromDeliveryNeeds(needs = {}) {
  return {
    inventory: !!needs.catalogStock,
    sales: !!(needs.tpv || needs.deliveryOrders || needs.autoShipping),
    crm: !!(needs.clients || needs.team),
    documentation: !!needs.invoicing,
    analytics: !!(needs.reports),
    workshop: false,
  };
}

/**
 * @param {object} params
 * @returns {'basic'|'normal'|'pro'|}
 */
export function minimumOnboardingPlanId(params = {}) {
  const metrics = normalizeInfrastructureMetrics(params);
  const businessType = String(params.businessType || '');
  const modules =
    params.modules && typeof params.modules === 'object'
      ? params.modules
      : modulesFromDeliveryNeeds(params.deliveryNeeds || {});
  const moduleCount = countEnabledModules(modules);
  const deliveryCount =
    businessType === 'delivery' || businessType === 'restaurant'
      ? countDeliveryNeeds(params.deliveryNeeds || {})
      : 0;

  let rank = 0;
  if (metrics.userCount > 2 || moduleCount >= 3) rank = Math.max(rank, 1);
  if (
    metrics.commercialBrandCount > 0 ||
    metrics.businessCount > 1 ||
    metrics.locationCount > 1 ||
    metrics.userCount > 5 ||
    moduleCount >= 5 ||
    deliveryCount >= 6 ||
    (moduleCount >= 4 && metrics.userCount > 3)
  ) {
    rank = Math.max(rank, 2);
  }

  return rank === 2 ? 'pro' : rank === 1 ? 'normal' : 'basic';
}

export function clampOnboardingPlanId(planId, onboardingData = {}) {
  const requested = String(planId || '').trim().toLowerCase();
  const safe =
    requested === 'basic' || requested === 'normal' || requested === 'pro' ? requested : 'basic';
  const floor = minimumOnboardingPlanId({
    businessType: onboardingData.businessType,
    userCount: onboardingData.businessMetrics?.userCount,
    locationCount: onboardingData.businessMetrics?.locationCount,
    businessCount: onboardingData.businessMetrics?.businessCount,
    commercialBrandCount: onboardingData.businessMetrics?.commercialBrandCount,
    modules: onboardingData?.requestedModules,
    deliveryNeeds: onboardingData.deliveryNeeds,
  });
  return PLAN_RANK[safe] >= PLAN_RANK[floor] ? safe : floor;
}
