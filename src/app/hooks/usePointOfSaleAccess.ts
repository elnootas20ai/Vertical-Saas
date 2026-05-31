import { useApp } from '../context/AppContext';
import { userCanUseDevPlanOverride } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  PLAN_TIER_LABELS,
  getEffectivePointOfSaleLimit,
  resolvePlanTier,
  subscriptionHasProAccess,
  type SubscriptionPlanTier,
} from '../lib/pointOfSaleLimits';

export type { SubscriptionPlanTier };
export { POINT_OF_SALE_LIMITS, PLAN_TIER_LABELS };

export interface PointOfSaleAccess {
  planTier: SubscriptionPlanTier;
  planLabel: string;
  hasProAccess: boolean;
  includedPointOfSaleLimit: number;
  canCreatePointOfSale: boolean;
  /** Modo Ilimitado activo en Plan (dev) — sin tope de PDV ni bloqueo multi-centro. */
  devUnlimitedPdv: boolean;
  /** Hay que subir de plan (basic/normal → pro) para crear el siguiente PDV. */
  needsProUpgrade: boolean;
  /** Plan PRO con el cupo agotado; el siguiente PDV es un add-on de pago. */
  needsPointOfSaleAddon: boolean;
}

export function usePointOfSaleAccess(pointOfSaleCount: number): PointOfSaleAccess {
  const { subscription, devUnlimitedPdv: devUnlimitedPdvState } = useApp();
  const { user } = useAuth();
  const planTier = resolvePlanTier(subscription.selectedPlanId || '', subscription.planName || '');
  const includedPointOfSaleLimit = getEffectivePointOfSaleLimit(subscription);
  const hasProAccess = subscriptionHasProAccess(subscription);
  const devUnlimitedPdv = userCanUseDevPlanOverride(user) && devUnlimitedPdvState;
  const canCreatePointOfSale = devUnlimitedPdv || pointOfSaleCount < includedPointOfSaleLimit;

  return {
    planTier,
    planLabel: PLAN_TIER_LABELS[planTier],
    hasProAccess,
    includedPointOfSaleLimit,
    canCreatePointOfSale,
    devUnlimitedPdv,
    needsProUpgrade: !hasProAccess && !devUnlimitedPdv && pointOfSaleCount >= includedPointOfSaleLimit,
    needsPointOfSaleAddon: hasProAccess && !devUnlimitedPdv && pointOfSaleCount >= includedPointOfSaleLimit,
  };
}
