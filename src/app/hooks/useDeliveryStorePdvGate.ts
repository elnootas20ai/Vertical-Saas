import { useCallback, useMemo } from 'react';
import { useBusinessOptional } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import { buildDeliverySidebarStoreRows } from '../lib/deliveryApi';
import {
  isDeliveryBusinessType,
  resolveBusinessScopeId,
  snapshotDeliveryStoreActivation,
} from '../lib/deliverySetup';

/**
 * Gate delivery: tienda retail activa + PDV enlazado.
 * Lee la misma fuente que el sidebar (ActiveStoreScope) para no bloquear el catálogo
 * cuando ya ves centros con caja en el menú lateral.
 */
export function useDeliveryStorePdvGate() {
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;
  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const activeStore = useActiveStoreScope();

  const businessId = resolveBusinessScopeId(currentBusiness);

  const loading = Boolean(
    isDelivery &&
      (!businessesFetchSettled ||
        !businessId ||
        (activeStore.loading &&
          activeStore.retailWorkCenters.length === 0 &&
          activeStore.allPointsOfSale.length === 0)),
  );

  const ready = useMemo(() => {
    if (!isDelivery) return true;
    if (!businessesFetchSettled || !businessId) return false;

    const pdvPool =
      activeStore.allPointsOfSale.length > 0
        ? activeStore.allPointsOfSale
        : activeStore.pointsOfSale;

    const snapshot = snapshotDeliveryStoreActivation({
      workCenters: activeStore.retailWorkCenters,
      pointsOfSale: pdvPool,
    });
    if (snapshot.hasActiveRetailStore && snapshot.hasActivePdv) return true;

    const activePdvs = pdvPool.filter((p) => p.active !== false);
    if (activePdvs.length > 0) return true;

    const retailActive = activeStore.retailWorkCenters.filter((wc) => wc.active !== false);
    if (retailActive.length === 0) return false;

    const rows = buildDeliverySidebarStoreRows(
      activeStore.retailWorkCenters,
      pdvPool,
    );
    return rows.some((row) => !row.needsPdv && !row.inactive);
  }, [
    isDelivery,
    businessesFetchSettled,
    businessId,
    activeStore.pointsOfSale,
    activeStore.allPointsOfSale,
    activeStore.retailWorkCenters,
  ]);

  const reload = useCallback(async () => {
    await activeStore.refresh();
  }, [activeStore.refresh]);

  return { isDelivery, ready, loading, reload };
}
