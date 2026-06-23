import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useBusiness } from '../context/BusinessContext';
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
  const { subscription } = useApp();
  const { businesses } = useBusiness();

  return useMemo(
    () =>
      resolveTenantEntitlements(
        subscription,
        {
          businesses: businesses.length,
          pointOfSales: options?.pointOfSaleCount ?? 0,
          commercialBrands: options?.commercialBrandCount ?? 0,
        },
      ),
    [
      subscription,
      businesses.length,
      options?.pointOfSaleCount,
      options?.commercialBrandCount,
    ],
  );
}

export { countCommercialBrands };
