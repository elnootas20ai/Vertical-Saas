import { useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import {
  DELIVERY_ACTIVE_STORE_CHANGED,
  pickDefaultActivePdvId,
  readDeliveryOpsSelectedPdvId,
  resolvePreferenceToPdvId,
} from '../lib/deliveryOpsPdvSelection';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';

type PdvLike = { _id: string; workCenterId?: string; active?: boolean };

/**
 * Alinea un filtro local de PDV con la tienda activa del admin (Topbar / sidebar / Ops).
 * Siempre alinea con la tienda activa (Topbar/sidebar); si no hay preferencia, usa el PDV principal.
 */
export function useSyncDeliveryPdvFilter(
  pointsOfSale: PdvLike[],
  onPdvId: (pdvId: string | undefined) => void,
  options?: { clearWhenUnset?: boolean },
): void {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStore = useActiveStoreScope();
  const clearWhenUnset = options?.clearWhenUnset ?? false;

  const apply = useCallback(() => {
    const active = pointsOfSale.filter((p) => p.active !== false);
    if (active.length === 0) {
      if (clearWhenUnset) onPdvId(undefined);
      return;
    }

    const fromScope = activeStore.activeSalesPointId?.trim();
    if (fromScope && active.some((p) => p._id === fromScope)) {
      onPdvId(fromScope);
      return;
    }

    const bid = String(currentBusiness?.business_id || currentBusiness?.id || '');
    const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
    if (bid && dataUserId) {
      const saved = readDeliveryOpsSelectedPdvId(bid, dataUserId);
      const resolved = resolvePreferenceToPdvId(active, saved);
      if (resolved) {
        onPdvId(resolved);
        return;
      }
    }

    const fallback = pickDefaultActivePdvId(active);
    if (fallback) {
      onPdvId(fallback);
      return;
    }

    if (clearWhenUnset) onPdvId(undefined);
  }, [
    pointsOfSale,
    activeStore.activeSalesPointId,
    currentBusiness,
    user,
    onPdvId,
    clearWhenUnset,
  ]);

  useEffect(() => {
    if (!pointsOfSale.length) return;
    apply();
  }, [apply, pointsOfSale.length]);

  useEffect(() => {
    const onChange = () => apply();
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onChange);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onChange);
  }, [apply]);
}
