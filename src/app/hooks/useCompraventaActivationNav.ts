import { useCallback, useMemo } from 'react';
import { useAuthOptional } from '../context/AuthContext';
import { useBusinessOptional } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import {
  isCompraventaBusinessType,
  listCompraventaSidebarWorkCenters,
  snapshotCompraventaStoreActivation,
} from '../lib/compraventaSetup';
import {
  filterPointsOfSaleForWorkCenters,
  resolveBusinessScopeId,
} from '../lib/businessStoreScope';
import { dedupePointsOfSale } from '../lib/pointsOfSaleApi';

/**
 * Flags para bloquear navegación compraventa (sidebar) hasta expositor + PDV.
 */
export function useCompraventaActivationNav() {
  const user = useAuthOptional()?.user ?? null;
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;
  const isCompraventa = isCompraventaBusinessType(currentBusiness?.businessType);
  const activeStore = useActiveStoreScope();
  const businessScopeId = resolveBusinessScopeId(currentBusiness);

  const storeReady = useMemo(() => {
    if (!isCompraventa) return true;
    if (!businessesFetchSettled || !businessScopeId) return false;

    const workCenters = listCompraventaSidebarWorkCenters(
      activeStore.retailWorkCenters.filter((wc) => !wc.deletedAt),
    );
    const pointsOfSale = filterPointsOfSaleForWorkCenters(
      dedupePointsOfSale(activeStore.allPointsOfSale || []),
      workCenters,
      { businessId: businessScopeId },
    );
    const snap = snapshotCompraventaStoreActivation({ workCenters, pointsOfSale });
    return snap.hasActiveRetailStore && snap.hasActivePdv;
  }, [
    isCompraventa,
    businessesFetchSettled,
    businessScopeId,
    activeStore.retailWorkCenters,
    activeStore.allPointsOfSale,
  ]);

  const loading = Boolean(
    isCompraventa &&
      (!businessesFetchSettled ||
        !businessScopeId ||
        (activeStore.loading &&
          activeStore.retailWorkCenters.length === 0 &&
          activeStore.allPointsOfSale.length === 0)),
  );

  const reload = useCallback(async () => {
    await activeStore.refresh();
  }, [activeStore.refresh]);

  return {
    isCompraventa,
    storeReady,
    pdvReady: storeReady,
    loading: loading && Boolean(user),
    reload,
  };
}
