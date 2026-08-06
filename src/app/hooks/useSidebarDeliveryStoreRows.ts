import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  resolveBusinessScopeId,
  knownBusinessIdsFromList,
  rescueRetailForBusinessWithoutStores,
} from '../lib/deliverySetup';
import { listWorkCentersForDelivery } from '../lib/workCentersApi';
import { readSidebarRetailCache, writeSidebarRetailCache } from '../lib/sidebarRetailCache';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';

function readCachedSidebarRows(
  businessId: string,
  accountBusinessCount?: number,
): DeliverySidebarStoreRow[] {
  const withCount = readSidebarRetailCache(
    businessId,
    accountBusinessCount !== undefined ? { accountBusinessCount } : undefined,
  );
  if (withCount?.rows.length) return withCount.rows;
  return readSidebarRetailCache(businessId)?.rows ?? [];
}

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
  const stableRowsRef = useRef<DeliverySidebarStoreRow[]>([]);
  const stableBusinessIdRef = useRef<string | null>(null);
  const scopeSyncRequestedRef = useRef<string | null>(null);
  const currentBusinessRef = useRef(currentBusiness);
  currentBusinessRef.current = currentBusiness;
  const businessesRef = useRef(businesses);
  businessesRef.current = businesses;

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

  useLayoutEffect(() => {
    // Delivery off (otro vertical): no borrar caché local — al volver a Modomio deben reaparecer.
    if (!enabled || !businessId) {
      return;
    }
    if (stableBusinessIdRef.current !== businessId) {
      stableBusinessIdRef.current = businessId;
      scopeSyncRequestedRef.current = null;
      stableRowsRef.current = readCachedSidebarRows(businessId, accountBusinessCount);
      setFallbackRows(stableRowsRef.current);
    } else {
      const cached = readCachedSidebarRows(businessId, accountBusinessCount);
      if (cached.length > 0) {
        stableRowsRef.current = cached;
        setFallbackRows(cached);
      }
    }
  }, [enabled, businessId, accountBusinessCount]);

  useEffect(() => {
    if (!enabled || !businessId) return;

    const liveRows = rowsFromScope.length > 0 ? rowsFromScope : fallbackRows;
    if (liveRows.length > 0) {
      stableRowsRef.current = liveRows;
      writeSidebarRetailCache(
        businessId,
        {
          rows: liveRows,
          retailWorkCenters: activeStore.retailWorkCenters,
          allPointsOfSale: activeStore.allPointsOfSale,
          savedAt: Date.now(),
        },
        accountBusinessCount !== undefined ? { accountBusinessCount } : undefined,
      );
    }
  }, [
    enabled,
    businessId,
    accountBusinessCount,
    rowsFromScope,
    fallbackRows,
    activeStore.retailWorkCenters,
    activeStore.allPointsOfSale,
  ]);

  useEffect(() => {
    if (!enabled || !dataUserId || !businessId) return;
    if (!businessesFetchSettled) return;
    if (rowsFromScope.length > 0) return;
    if (inflightRef.current) return;

    let cancelled = false;
    inflightRef.current = true;
    setFallbackLoading(true);

    void (async () => {
      try {
        const accountN = businesses.length > 0 ? businesses.length : 1;
        const biz = currentBusinessRef.current;
        const bizList = businessesRef.current;
        const [rawPdvs, allWcs] = await Promise.all([
          listPointsOfSaleRequest(dataUserId).catch(() => []),
          listWorkCentersForDelivery(dataUserId, biz ?? null).catch(() => []),
        ]);
        if (cancelled) return;
        const knownIds = knownBusinessIdsFromList(bizList);
        const preparedWcs = rescueRetailForBusinessWithoutStores(allWcs, businessId, knownIds);
        const scopedWcs = filterWorkCentersForBusinessScope(preparedWcs, businessId, {
          accountBusinessCount: accountN,
        });
        // Delivery: incluir retail aunque `active === false` en listado; UI marca inactive.
        const retail = dedupeRetailWorkCentersForBusiness(scopedWcs).filter(
          (wc) =>
            !wc.deletedAt &&
            (wc.centerType === 'punto_de_venta' || wc.centerType === 'almacen'),
        );
        const scopedPdvs = filterPointsOfSaleForWorkCenters(rawPdvs, retail, {
          businessId,
        });
        const rows = buildDeliverySidebarStoreRows(retail, scopedPdvs);
        if (rows.length > 0) {
          stableRowsRef.current = rows;
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
          // Una sola sync suave al scope (no force) para no borrar filas ni spinear infinito.
          if (
            scopeSyncRequestedRef.current !== businessId &&
            activeStore.allPointsOfSale.length === 0 &&
            activeStore.retailWorkCenters.length === 0
          ) {
            scopeSyncRequestedRef.current = businessId;
            void activeStore.refresh({ force: false });
          }
        }
      } finally {
        inflightRef.current = false;
        // Siempre apagar: si el effect se canceló por re-render, no dejar spinner eterno.
        setFallbackLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // No resetear inflight aquí: evita storm de fetches por identidad de BusinessContext.
    };
  }, [
    enabled,
    dataUserId,
    businessId,
    businessesFetchSettled,
    businesses.length,
    rowsFromScope.length,
    activeStore.allPointsOfSale.length,
    activeStore.retailWorkCenters.length,
    activeStore.refresh,
  ]);

  const liveRows = rowsFromScope.length > 0 ? rowsFromScope : fallbackRows;
  if (liveRows.length > 0) {
    stableRowsRef.current = liveRows;
  }
  const rows = liveRows.length > 0 ? liveRows : stableRowsRef.current;

  const waitingForBusinessList = !businessesFetchSettled;
  const waitingForStores =
    Boolean(businessId) && rows.length === 0 && (activeStore.loading || fallbackLoading);
  const loading = enabled && rows.length === 0 && (waitingForBusinessList || waitingForStores);

  return { rows, loading };
}
