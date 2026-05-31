import { useCallback, useEffect, useState } from 'react';
import { useAuthOptional } from '../context/AuthContext';
import { useBusinessOptional } from '../context/BusinessContext';
import { listBrandsRequest } from '../lib/brandApi';
import { isBrandSetupComplete, isDefaultCommercialBrand } from '../lib/brandUtils';
import { isDeliveryStoreAndPdvReady } from '../lib/deliveryActivationGates';
import { DELIVERY_WORK_CENTERS_CHANGED, isDeliveryBusinessType, loadDeliveryStores } from '../lib/deliverySetup';

/**
 * Flags para bloquear navegación delivery (sidebar, pestañas Ajustes).
 */
export function useDeliveryActivationNav() {
  const user = useAuthOptional()?.user ?? null;
  const currentBusiness = useBusinessOptional()?.currentBusiness ?? null;
  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const businessId = currentBusiness?.business_id || '';
  const [pdvReady, setPdvReady] = useState(!isDelivery);
  const [brandReady, setBrandReady] = useState(!isDelivery);
  const [loading, setLoading] = useState(isDelivery);

  const reload = useCallback(async () => {
    if (!isDelivery || !user) {
      setPdvReady(true);
      setBrandReady(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const state = await loadDeliveryStores(user, currentBusiness);
      const retailActive = state.workCenters.filter(
        (wc) =>
          wc.active !== false &&
          (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
      );
      const pdvOk = isDeliveryStoreAndPdvReady({
        hasActiveRetailStore: retailActive.length > 0,
        hasActivePdv: state.pointsOfSale.length > 0,
      });
      setPdvReady(pdvOk);

      if (!pdvOk || !businessId) {
        setBrandReady(false);
        return;
      }

      const brands = await listBrandsRequest(businessId).catch(() => []);
      const primary =
        brands.find((b) => isDefaultCommercialBrand(b)) ??
        brands.find((b) => b.active !== false) ??
        brands[0] ??
        null;
      setBrandReady(
        primary ? isBrandSetupComplete(primary, { isDelivery: true, retailStoreCount: retailActive.length }) : false,
      );
    } catch {
      setPdvReady(false);
      setBrandReady(false);
    } finally {
      setLoading(false);
    }
  }, [isDelivery, user, currentBusiness, businessId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!isDelivery) return;
    const onChanged = () => void reload();
    window.addEventListener(DELIVERY_WORK_CENTERS_CHANGED, onChanged);
    window.addEventListener('work-centers:changed', onChanged);
    return () => {
      window.removeEventListener(DELIVERY_WORK_CENTERS_CHANGED, onChanged);
      window.removeEventListener('work-centers:changed', onChanged);
    };
  }, [isDelivery, reload]);

  return { isDelivery, pdvReady, brandReady, loading, reload };
}
