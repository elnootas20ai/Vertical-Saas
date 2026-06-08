import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthOptional } from '../context/AuthContext';
import { useBusinessOptional } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import { listBrandsRequest } from '../lib/brandApi';
import { isBrandSetupComplete, isDefaultCommercialBrand } from '../lib/brandUtils';
import { buildDeliverySidebarStoreRows } from '../lib/deliveryApi';
import { isDeliveryBusinessType, resolveBusinessScopeId } from '../lib/deliverySetup';

/**
 * Flags para bloquear navegación delivery (sidebar, pestañas Ajustes).
 */
export function useDeliveryActivationNav() {
  const user = useAuthOptional()?.user ?? null;
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;
  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const businessId = currentBusiness?.business_id || '';
  const activeStore = useActiveStoreScope();
  const [brandReady, setBrandReady] = useState(!isDelivery);
  const [brandLoading, setBrandLoading] = useState(isDelivery);

  const businessScopeId = resolveBusinessScopeId(currentBusiness);

  const pdvReady = useMemo(() => {
    if (!isDelivery) return true;
    if (!businessesFetchSettled || !businessScopeId) return false;

    const retailActive = activeStore.retailWorkCenters.filter((wc) => wc.active !== false);
    if (retailActive.length === 0) return false;

    const rows = buildDeliverySidebarStoreRows(
      activeStore.retailWorkCenters,
      activeStore.allPointsOfSale,
    );
    return rows.some((row) => !row.needsPdv && !row.inactive);
  }, [
    isDelivery,
    businessesFetchSettled,
    businessScopeId,
    activeStore.retailWorkCenters,
    activeStore.allPointsOfSale,
  ]);

  const loading = Boolean(
    isDelivery &&
      (brandLoading ||
        !businessesFetchSettled ||
        !businessScopeId ||
        (activeStore.loading &&
          activeStore.retailWorkCenters.length === 0 &&
          activeStore.allPointsOfSale.length === 0)),
  );

  const reloadBrands = useCallback(async () => {
    if (!isDelivery || !user) {
      setBrandReady(true);
      setBrandLoading(false);
      return;
    }
    if (!pdvReady || !businessId) {
      setBrandReady(false);
      setBrandLoading(false);
      return;
    }

    setBrandLoading(true);
    try {
      const brands = await listBrandsRequest(businessId).catch(() => []);
      const retailActive = activeStore.retailWorkCenters.filter((wc) => wc.active !== false);
      const primary =
        brands.find((b) => isDefaultCommercialBrand(b)) ??
        brands.find((b) => b.active !== false) ??
        brands[0] ??
        null;
      setBrandReady(
        primary ? isBrandSetupComplete(primary, { isDelivery: true, retailStoreCount: retailActive.length }) : false,
      );
    } catch {
      setBrandReady(false);
    } finally {
      setBrandLoading(false);
    }
  }, [isDelivery, user, pdvReady, businessId, activeStore.retailWorkCenters]);

  useEffect(() => {
    void reloadBrands();
  }, [reloadBrands]);

  const reload = useCallback(async () => {
    await activeStore.refresh();
    await reloadBrands();
  }, [activeStore.refresh, reloadBrands]);

  return { isDelivery, pdvReady, brandReady, loading, reload };
}
