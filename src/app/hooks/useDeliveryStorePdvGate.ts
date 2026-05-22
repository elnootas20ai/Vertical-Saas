import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusinessOptional } from '../context/BusinessContext';
import { isDeliveryStoreAndPdvReady } from '../lib/deliveryActivationGates';
import { DELIVERY_WORK_CENTERS_CHANGED, isDeliveryBusinessType, loadDeliveryStores } from '../lib/deliverySetup';

export function useDeliveryStorePdvGate() {
  const { user } = useAuth();
  const currentBusiness = useBusinessOptional()?.currentBusiness ?? null;
  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const [ready, setReady] = useState(!isDelivery);
  const [loading, setLoading] = useState(isDelivery);

  const reload = useCallback(async () => {
    if (!isDelivery || !user) {
      setReady(true);
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
      setReady(
        isDeliveryStoreAndPdvReady({
          hasActiveRetailStore: retailActive.length > 0,
          hasActivePdv: state.pointsOfSale.length > 0,
        }),
      );
    } catch {
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, [isDelivery, user, currentBusiness]);

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

  return { isDelivery, ready, loading, reload };
}
