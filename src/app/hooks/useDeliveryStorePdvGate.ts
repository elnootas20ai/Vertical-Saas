import { useCallback, useMemo } from 'react';
import { useAuthOptional } from '../context/AuthContext';
import { useBusinessOptional } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import { buildDeliverySidebarStoreRows, type PointOfSale } from '../lib/deliveryApi';
import {
  isDeliveryBusinessType,
  peekDeliveryPdvSessionConfirmed,
  resolveBusinessScopeId,
  snapshotDeliveryStoreActivation,
} from '../lib/deliverySetup';
import { readRetailScopeCache } from '../lib/retailScopeCache';
import { readSidebarRetailCache } from '../lib/sidebarRetailCache';
import type { WorkCenter } from '../lib/workCentersApi';

function pickStoreSnapshot(
  businessId: string,
  scopeRetail: WorkCenter[],
  scopePdvs: PointOfSale[],
  accountBusinessCount?: number,
): { workCenters: WorkCenter[]; pdvs: PointOfSale[] } {
  if (scopeRetail.length > 0 || scopePdvs.length > 0) {
    return { workCenters: scopeRetail, pdvs: scopePdvs };
  }
  if (!businessId) return { workCenters: scopeRetail, pdvs: scopePdvs };

  const cacheOpts =
    accountBusinessCount !== undefined ? { accountBusinessCount } : undefined;
  const cached = readRetailScopeCache(businessId, cacheOpts);
  if (cached && (cached.retailWorkCenters.length > 0 || cached.allPointsOfSale.length > 0)) {
    return { workCenters: cached.retailWorkCenters, pdvs: cached.allPointsOfSale };
  }
  const sidebar = readSidebarRetailCache(businessId, cacheOpts);
  if (sidebar && (sidebar.retailWorkCenters.length > 0 || sidebar.allPointsOfSale.length > 0)) {
    return { workCenters: sidebar.retailWorkCenters, pdvs: sidebar.allPointsOfSale };
  }
  return { workCenters: scopeRetail, pdvs: scopePdvs };
}

function evaluatePdvReady(workCenters: WorkCenter[], pdvPool: PointOfSale[]): boolean {
  const snapshot = snapshotDeliveryStoreActivation({
    workCenters,
    pointsOfSale: pdvPool,
  });
  // Marca y ajustes: basta con tener tienda visible; el PDV se crea al guardar/editar.
  if (snapshot.hasActiveRetailStore) return true;

  const activePdvs = pdvPool.filter((p) => p.active !== false);
  if (activePdvs.length > 0) return true;

  const retailActive = workCenters.filter((wc) => wc.active !== false);
  if (retailActive.length === 0) return false;

  const rows = buildDeliverySidebarStoreRows(workCenters, pdvPool);
  return rows.some((row) => !row.needsPdv && !row.inactive);
}

/**
 * Gate delivery: tienda retail activa + PDV enlazado.
 * Usa ActiveStoreScope + caché local (misma fuente que el sidebar) para no bloquear Marca
 * cuando ya ves la tienda en el menú lateral.
 */
export function useDeliveryStorePdvGate() {
  const auth = useAuthOptional();
  const businessCtx = useBusinessOptional();
  const currentBusiness = businessCtx?.currentBusiness ?? null;
  const businessesFetchSettled = businessCtx?.businessesFetchSettled ?? false;
  const accountBusinessCount = businessCtx?.businessesFetchSettled
    ? (businessCtx?.businesses?.length ?? 0)
    : undefined;
  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const activeStore = useActiveStoreScope();

  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = String(auth?.user?.user_id || auth?.user?.id || '').trim();
  const sessionPdvConfirmed = peekDeliveryPdvSessionConfirmed(dataUserId);

  const scopePdvs =
    activeStore.allPointsOfSale.length > 0
      ? activeStore.allPointsOfSale
      : activeStore.pointsOfSale;

  const picked = useMemo(
    () =>
      pickStoreSnapshot(
        businessId,
        activeStore.retailWorkCenters,
        scopePdvs,
        accountBusinessCount,
      ),
    [businessId, activeStore.retailWorkCenters, scopePdvs, accountBusinessCount],
  );

  const hasCachedStores = useMemo(() => {
    if (!businessId) return false;
    const cacheOpts =
      accountBusinessCount !== undefined ? { accountBusinessCount } : undefined;
    const cached = readRetailScopeCache(businessId, cacheOpts);
    if (cached && (cached.retailWorkCenters.length > 0 || cached.allPointsOfSale.length > 0)) {
      return true;
    }
    const sidebar = readSidebarRetailCache(businessId, cacheOpts);
    return Boolean(
      sidebar && (sidebar.retailWorkCenters.length > 0 || sidebar.allPointsOfSale.length > 0),
    );
  }, [businessId, accountBusinessCount]);

  const loading = Boolean(
    isDelivery &&
      (!businessesFetchSettled ||
        !businessId ||
        (!hasCachedStores &&
          !sessionPdvConfirmed &&
          activeStore.loading &&
          picked.workCenters.length === 0 &&
          picked.pdvs.length === 0)),
  );

  const ready = useMemo(() => {
    if (!isDelivery) return true;
    if (!businessesFetchSettled || !businessId) return false;
    return evaluatePdvReady(picked.workCenters, picked.pdvs);
  }, [isDelivery, businessesFetchSettled, businessId, picked.workCenters, picked.pdvs]);

  const reload = useCallback(async () => {
    await activeStore.refresh();
  }, [activeStore.refresh]);

  return { isDelivery, ready, loading, reload };
}
