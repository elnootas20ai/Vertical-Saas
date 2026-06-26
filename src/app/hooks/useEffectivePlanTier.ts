import { useMemo } from 'react';
import { useApp, readDevPlanOverride, userCanUseDevPlanOverride } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  resolveEffectivePlanTier,
  type SubscriptionPlanTier,
} from '../lib/pointOfSaleLimits';

/**
 * Plan efectivo para gates de UI (dashboard, informes, CRM…).
 * - Simulación dev (Básico/Mediano/Pro): respeta el override explícito.
 * - Dev Ilimitado, billingExempt, adminProAccess o suscripción Pro: Pro completo.
 */
export function useEffectivePlanTier(): SubscriptionPlanTier {
  const { subscription, devUnlimitedPdv } = useApp();
  const { user } = useAuth();

  return useMemo(() => {
    const canDev = userCanUseDevPlanOverride(user);
    const override = canDev ? readDevPlanOverride() : null;
    return resolveEffectivePlanTier(subscription, {
      devSimulatedTier: override,
      devUnlimitedFeatures: canDev && devUnlimitedPdv,
    });
  }, [
    subscription,
    devUnlimitedPdv,
    user,
  ]);
}

export type { SubscriptionPlanTier };
