import { useMemo } from 'react';
import { useApp, userCanUseDevPlanOverride } from '../context/AppContext';
import { useAuthOptional } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { isVertialSuperAdminEmail } from '../lib/superAdmin';
import {
  countCommercialBrands,
  resolveTenantEntitlements,
  type TenantEntitlementAccess,
} from '../lib/tenantEntitlements';
import { useEffectivePlanTier } from './useEffectivePlanTier';

export type { TenantEntitlementAccess };

/**
 * Cupos de facturación para la cuenta + empresa activa.
 * Usar en Ajustes (Tienda, Marca, Empresas) y gates de alta.
 */
export function useTenantEntitlements(options?: {
  pointOfSaleCount?: number;
  commercialBrandCount?: number;
}): TenantEntitlementAccess {
  const { subscription, devUnlimitedPdv, devPlanOverride } = useApp();
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const { businesses } = useBusiness();

  const canDev = userCanUseDevPlanOverride(user);
  const simulatingPlan = Boolean(canDev && devPlanOverride);
  const devUnlimited = canDev && devUnlimitedPdv;
  const superAdmin = isVertialSuperAdminEmail(user?.email);
  // Con plan simulado (Mi plan / Plan dev): respetar cupos; no bypass super-admin.
  const bypassLimits = (devUnlimited || superAdmin) && !simulatingPlan;
  const featurePlanTier = useEffectivePlanTier();

  return useMemo(
    () =>
      resolveTenantEntitlements(
        subscription,
        {
          businesses: businesses.length,
          pointOfSales: options?.pointOfSaleCount ?? 0,
          commercialBrands: options?.commercialBrandCount ?? 0,
        },
        {
          devUnlimitedBrands: bypassLimits,
          devUnlimitedBusinesses: bypassLimits,
          featurePlanTier,
        },
      ),
    [
      subscription,
      businesses.length,
      options?.pointOfSaleCount,
      options?.commercialBrandCount,
      bypassLimits,
      featurePlanTier,
    ],
  );
}

export { countCommercialBrands };
