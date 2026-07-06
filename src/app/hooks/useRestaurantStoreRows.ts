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
  filterPointsOfSaleForWorkCenters,
  resolveBusinessScopeId,
} from '../lib/deliverySetup';
import { listWorkCentersForDelivery } from '../lib/workCentersApi';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
import { filterRetailWorkCentersForScope } from '../verticals/retailScopeRegistry';
import {
  readRestaurantRetailCache,
  writeRestaurantRetailCache,
} from '../verticals/restaurant/restaurantRetailCache';

/** Sidebar centros de trabajo — vertical restaurante (delivery intacto). */
export function useRestaurantStoreRows(enabled: boolean) {
  const { user } = useAuth();
  const { currentBusiness, businessesFetchSettled, businesses } = useBusiness();
  const activeStore = useActiveStoreScope();
  const [fallbackRows, setFallbackRows] = useState<DeliverySidebarStoreRow[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const inflightRef = useRef(false);
  const stableRowsRef = useRef<DeliverySidebarStoreRow[]>([]);
  const stableBusinessIdRef = useRef<string | null>(null);

  const businessId = resolveBusinessScopeId(currentBusiness);
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);

  const scopedRetail = useMemo(() => {
    if (!enabled || !currentBusiness || !businessesFetchSettled) return [];
    return filterRetailWorkCentersForScope(activeStore.retailWorkCenters, {
      business: currentBusiness,
      businesses,
    });
  }, [
    enabled,
    currentBusiness,
    businessesFetchSettled,
    businesses,
    activeStore.retailWorkCenters,
  ]);

  const scopedPdvs = useMemo(
    () => filterPointsOfSaleForWorkCenters(activeStore.allPointsOfSale, scopedRetail),
    [activeStore.allPointsOfSale, scopedRetail],
  );

  const rowsFromScope = useMemo(
    () => (enabled ? buildDeliverySidebarStoreRows(scopedRetail, scopedPdvs) : []),
    [enabled, scopedRetail, scopedPdvs],
  );

  useLayoutEffect(() => {
    if (!enabled || !businessId || !currentBusiness) {
      stableRowsRef.current = [];
      stableBusinessIdRef.current = null;
      setFallbackRows([]);
      return;
    }
    if (stableBusinessIdRef.current !== businessId) {
      stableBusinessIdRef.current = businessId;
      const cached = readRestaurantRetailCache(businessId, currentBusiness, businesses);
      stableRowsRef.current = cached?.rows ?? [];
      setFallbackRows(stableRowsRef.current);
    } else {
      const cached = readRestaurantRetailCache(businessId, currentBusiness, businesses);
      if (cached?.rows.length) {
        stableRowsRef.current = cached.rows;
        setFallbackRows(cached.rows);
      }
    }
  }, [enabled, businessId, currentBusiness, businesses]);

  useEffect(() => {
    if (!enabled || !businessId || !currentBusiness || !businessesFetchSettled) return;

    const liveRows = rowsFromScope.length > 0 ? rowsFromScope : fallbackRows;
    if (liveRows.length > 0) {
      stableRowsRef.current = liveRows;
      writeRestaurantRetailCache(
        businessId,
        {
          rows: liveRows,
          retailWorkCenters: scopedRetail,
          allPointsOfSale: scopedPdvs,
          savedAt: Date.now(),
        },
        currentBusiness,
        businesses,
      );
    }
  }, [
    enabled,
    businessId,
    businessesFetchSettled,
    rowsFromScope,
    fallbackRows,
    scopedRetail,
    scopedPdvs,
    currentBusiness,
    businesses,
  ]);

  useEffect(() => {
    if (!enabled || !dataUserId || !businessId || !currentBusiness) return;
    if (!businessesFetchSettled) return;
    if (rowsFromScope.length > 0) return;
    if (stableRowsRef.current.length > 0) return;
    if (inflightRef.current) return;

    let cancelled = false;
    inflightRef.current = true;
    setFallbackLoading(true);

    void (async () => {
      try {
        const [rawPdvs, allWcs] = await Promise.all([
          listPointsOfSaleRequest(dataUserId).catch(() => []),
          listWorkCentersForDelivery(dataUserId, currentBusiness).catch(() => []),
        ]);
        if (cancelled) return;
        const retail = filterRetailWorkCentersForScope(allWcs, {
          business: currentBusiness,
          businesses,
        });
        const pdvs = filterPointsOfSaleForWorkCenters(rawPdvs, retail);
        const rows = buildDeliverySidebarStoreRows(retail, pdvs);
        if (rows.length > 0) {
          stableRowsRef.current = rows;
          setFallbackRows(rows);
          writeRestaurantRetailCache(
            businessId,
            {
              rows,
              retailWorkCenters: retail,
              allPointsOfSale: pdvs,
              savedAt: Date.now(),
            },
            currentBusiness,
            businesses,
          );
          if (activeStore.allPointsOfSale.length === 0 && activeStore.retailWorkCenters.length === 0) {
            void activeStore.refresh();
          }
        }
      } finally {
        inflightRef.current = false;
        if (!cancelled) setFallbackLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      inflightRef.current = false;
    };
  }, [
    enabled,
    dataUserId,
    businessId,
    businessesFetchSettled,
    businesses,
    rowsFromScope.length,
    activeStore.allPointsOfSale.length,
    activeStore.retailWorkCenters.length,
    activeStore.refresh,
    currentBusiness,
  ]);

  const liveRows = rowsFromScope.length > 0 ? rowsFromScope : fallbackRows;
  if (liveRows.length > 0) {
    stableRowsRef.current = liveRows;
  }
  const rows = liveRows.length > 0 ? liveRows : stableRowsRef.current;

  const loading =
    enabled
    && rows.length === 0
    && (!businessesFetchSettled || activeStore.loading || fallbackLoading);

  return { rows, loading };
}
