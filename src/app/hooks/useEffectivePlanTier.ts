import { useMemo } from 'react';
import {
  readDevPlanOverride,
  useApp,
  userCanUseDevPlanOverride,
} from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  resolveEffectivePlanTier,
  resolvePlanTier,
  type SubscriptionPlanTier,
} from '../lib/pointOfSaleLimits';

/**
 * Plan efectivo para gates (sidebar, dashboard, cupos…).
 * Admin con Mi plan / atajo: el plan elegido manda (no billingExempt → Pro).
 */
export function useEffectivePlanTier(): SubscriptionPlanTier {
  const { subscription, devUnlimitedPdv, devPlanOverride } = useApp();
  const { user } = useAuth();

  return useMemo(() => {
    const canDev = userCanUseDevPlanOverride(user);

    // Ilimitado = Pro completo (solo atajo admin).
    if (canDev && devUnlimitedPdv) {
      return 'pro';
    }

    // Plan elegido en Mi plan / atajo: manda sí o sí.
    if (canDev) {
      const override = devPlanOverride ?? readDevPlanOverride();
      if (override === 'basic' || override === 'normal' || override === 'pro') {
        return override;
      }
      const sid = String(subscription.selectedPlanId || '').toLowerCase();
      if (sid === 'basic' || sid === 'normal' || sid === 'pro') {
        return sid;
      }
      return resolvePlanTier(sid, subscription.planName || '');
    }

    return resolveEffectivePlanTier(subscription, {
      devSimulatedTier: null,
      devUnlimitedFeatures: false,
    });
  }, [subscription, devUnlimitedPdv, devPlanOverride, user]);
}

export type { SubscriptionPlanTier };
