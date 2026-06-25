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

export type { TenantEntitlementAccess };

/**
 * Cupos de facturación para la cuenta + empresa activa.
 * Usar en Ajustes (Tienda, Marca, Empresas) y gates de alta.
 */
export function useTenantEntitlements(options?: {
  pointOfSaleCount?: number;
  commercialBrandCount?: number;
}): TenantEntitlementAccess {
  const { subscription, devUnlimitedPdv } = useApp();
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const { businesses } = useBusiness();

  const devUnlimited = userCanUseDevPlanOverride(user) && devUnlimitedPdv;
  const superAdmin = isVertialSuperAdminEmail(user?.email);
  const bypassLimits = devUnlimited || superAdmin;

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
        },
      ),
    [
      subscription,
      businesses.length,
      options?.pointOfSaleCount,
      options?.commercialBrandCount,
      bypassLimits,
    ],
  );
}

export { countCommercialBrands };
