import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import {
  buildDeliverySidebarStoreRows,
  listPointsOfSaleRequest,
  type DeliverySidebarStoreRow,
} from '../lib/deliveryApi';
import {
  dedupeRetailWorkCentersForBusiness,
  filterPointsOfSaleForWorkCenters,
  filterWorkCentersForBusinessScope,
  isRetailWorkCenter,
  resolveBusinessScopeId,
} from '../lib/deliverySetup';
import { listWorkCentersForDelivery } from '../lib/workCentersApi';
import { readSidebarRetailCache, writeSidebarRetailCache } from '../lib/sidebarRetailCache';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';

/**
 * Filas de tiendas para el sidebar: usa ActiveStoreScope y, si hace falta,
 * caché local + fetch directo de PDV (nunca dejar el menú vacío por una carga fallida).
 */
export function useSidebarDeliveryStoreRows(enabled: boolean) {
  const { user } = useAuth();
  const { currentBusiness, businessesFetchSettled, businesses } = useBusiness();
  const activeStore = useActiveStoreScope();
  const [fallbackRows, setFallbackRows] = useState<DeliverySidebarStoreRow[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const inflightRef = useRef(false);

  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const accountBusinessCount = businessesFetchSettled ? businesses.length : undefined;

  const rowsFromScope = useMemo(
    () =>
      enabled
        ? buildDeliverySidebarStoreRows(activeStore.retailWorkCenters, activeStore.allPointsOfSale)
        : [],
    [enabled, activeStore.retailWorkCenters, activeStore.allPointsOfSale],
  );

  useEffect(() => {
    if (!enabled || !businessId) {
      setFallbackRows([]);
      return;
    }

    if (rowsFromScope.length > 0) {
      setFallbackRows([]);
      writeSidebarRetailCache(
        businessId,
        {
          rows: rowsFromScope,
          retailWorkCenters: activeStore.retailWorkCenters,
          allPointsOfSale: activeStore.allPointsOfSale,
          savedAt: Date.now(),
        },
        accountBusinessCount !== undefined ? { accountBusinessCount } : undefined,
      );
      return;
    }

    const cached = readSidebarRetailCache(
      businessId,
      accountBusinessCount !== undefined ? { accountBusinessCount } : undefined,
    );
    if (cached?.rows.length) {
      setFallbackRows(cached.rows);
    }
  }, [
    enabled,
    businessId,
    accountBusinessCount,
    rowsFromScope,
    activeStore.retailWorkCenters,
    activeStore.allPointsOfSale,
  ]);

  useEffect(() => {
    if (!enabled || !dataUserId || !businessId) return;
    if (rowsFromScope.length > 0) return;
    if (!businessesFetchSettled && activeStore.loading) return;
    if (inflightRef.current) return;

    let cancelled = false;
    inflightRef.current = true;
    setFallbackLoading(true);

    void (async () => {
      try {
        const accountN = businessesFetchSettled ? businesses.length : 1;
        const [rawPdvs, allWcs] = await Promise.all([
          listPointsOfSaleRequest(dataUserId).catch(() => []),
          listWorkCentersForDelivery(dataUserId, currentBusiness ?? null).catch(() => []),
        ]);
        if (cancelled) return;
        const scopedWcs = filterWorkCentersForBusinessScope(allWcs, businessId, {
          accountBusinessCount: accountN,
        });
        const retail = dedupeRetailWorkCentersForBusiness(scopedWcs).filter(isRetailWorkCenter);
        const scopedPdvs = filterPointsOfSaleForWorkCenters(rawPdvs, retail);
        const rows = buildDeliverySidebarStoreRows(retail, scopedPdvs);
        if (rows.length > 0) {
          setFallbackRows(rows);
          writeSidebarRetailCache(
            businessId,
            {
              rows,
              retailWorkCenters: retail,
              allPointsOfSale: scopedPdvs,
              savedAt: Date.now(),
            },
            { accountBusinessCount: accountN },
          );
          if (activeStore.allPointsOfSale.length === 0) {
            void activeStore.refresh();
          }
        }
      } finally {
        inflightRef.current = false;
        if (!cancelled) {
          setFallbackLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      inflightRef.current = false;
      setFallbackLoading(false);
    };
  }, [
    enabled,
    dataUserId,
    businessId,
    businessesFetchSettled,
    businesses.length,
    rowsFromScope.length,
    activeStore.loading,
    activeStore.allPointsOfSale.length,
    activeStore.refresh,
    currentBusiness,
  ]);

  const rows = rowsFromScope.length > 0 ? rowsFromScope : fallbackRows;
  const waitingForBusinessList = !businessesFetchSettled;
  const waitingForStores =
    Boolean(businessId) && (activeStore.loading || fallbackLoading);
  const loading = enabled && rows.length === 0 && (waitingForBusinessList || waitingForStores);

  return { rows, loading };
}
