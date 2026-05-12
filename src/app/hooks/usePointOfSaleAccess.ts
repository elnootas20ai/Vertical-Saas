import { useApp } from '../context/AppContext';

export type SubscriptionPlanTier = 'basic' | 'normal' | 'pro';

/**
 * Cuántos PDV trae cada plan de serie.
 *
 * - `basic`  → 1 PDV. Para crear más, hay que subir a PRO.
 * - `normal` → 1 PDV. Para crear más, hay que subir a PRO.
 * - `pro`    → 2 PDV. Para crear un tercero, hay que contratar una ampliación.
 */
export const POINT_OF_SALE_LIMITS: Record<SubscriptionPlanTier, number> = {
  basic: 1,
  normal: 1,
  pro: 2,
};

export const PLAN_TIER_LABELS: Record<SubscriptionPlanTier, string> = {
  basic: 'Básico',
  normal: 'Normal',
  pro: 'Pro',
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'subscription_active',
  'trial_active',
  'trial_expiring',
]);

function resolvePlanTier(planId: string, planName: string): SubscriptionPlanTier {
  const id = planId.toLowerCase();
  const name = planName.toLowerCase();
  if (id === 'pro' || name.includes('pro')) return 'pro';
  if (id === 'normal' || name.includes('normal')) return 'normal';
  return 'basic';
}

export interface PointOfSaleAccess {
  planTier: SubscriptionPlanTier;
  planLabel: string;
  hasProAccess: boolean;
  includedPointOfSaleLimit: number;
  canCreatePointOfSale: boolean;
  /** Hay que subir de plan (basic/normal → pro) para crear el siguiente PDV. */
  needsProUpgrade: boolean;
  /** Plan PRO con el cupo agotado; el siguiente PDV es un add-on de pago. */
  needsPointOfSaleAddon: boolean;
}

export function usePointOfSaleAccess(pointOfSaleCount: number): PointOfSaleAccess {
  const { subscription } = useApp();
  const planTier = ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)
    ? resolvePlanTier(subscription.selectedPlanId || '', subscription.planName || '')
    : 'basic';
  const includedPointOfSaleLimit = POINT_OF_SALE_LIMITS[planTier];
  const hasProAccess = planTier === 'pro';
  const canCreatePointOfSale = pointOfSaleCount < includedPointOfSaleLimit;

  return {
    planTier,
    planLabel: PLAN_TIER_LABELS[planTier],
    hasProAccess,
    includedPointOfSaleLimit,
    canCreatePointOfSale,
    needsProUpgrade: !hasProAccess && pointOfSaleCount >= includedPointOfSaleLimit,
    needsPointOfSaleAddon: hasProAccess && pointOfSaleCount >= includedPointOfSaleLimit,
  };
}
