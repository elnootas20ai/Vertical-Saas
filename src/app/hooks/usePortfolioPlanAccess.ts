import { useMemo } from 'react';
import { useBusiness } from '../context/BusinessContext';
import { portfolioViewAllowed } from '../lib/tenantEntitlements';
import type { SubscriptionPlanTier } from '../lib/pointOfSaleLimits';
import { useTenantEntitlements } from './useTenantEntitlements';

/**
 * Límites de multi-empresa y vista portfolio según plan (Básico/Normal = 1, Pro = 2).
 */
export function usePortfolioPlanAccess() {
  const { businesses } = useBusiness();
  const entitlements = useTenantEntitlements();
  const count = businesses.length;

  return useMemo(() => {
    const maxBusinesses = entitlements.businesses;
    const planTier = entitlements.planTier;
    const canUsePortfolioView = portfolioViewAllowed(planTier, count);
    const portfolioLocked = count > 1 && !canUsePortfolioView;
    const atBusinessLimit = count >= maxBusinesses;
    const slotsRemaining = Math.max(0, maxBusinesses - count);

    return {
      planTier,
      planLabel: entitlements.planLabel,
      maxBusinesses,
      currentBusinesses: count,
      slotsRemaining,
      canCreateBusiness: entitlements.canCreateBusiness,
      canUsePortfolioView,
      /** Tiene 2+ empresas pero plan solo permite 1 — mostrar candado en Visión general. */
      portfolioLocked,
      atBusinessLimit,
      isSingleBusinessPlan: maxBusinesses <= 1,
      isProPlan: planTier === 'pro',
    };
  }, [entitlements, count]);
}

export type { SubscriptionPlanTier };
