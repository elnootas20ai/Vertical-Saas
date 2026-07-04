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

  useEffect(() => {
    if (!enabled || !businessId || !currentBusiness) {
      setFallbackRows([]);
      return;
    }
    if (!businessesFetchSettled) {
      setFallbackRows([]);
      return;
    }

    if (rowsFromScope.length > 0) {
      setFallbackRows([]);
      writeRestaurantRetailCache(
        businessId,
        {
          rows: rowsFromScope,
          retailWorkCenters: scopedRetail,
          allPointsOfSale: scopedPdvs,
          savedAt: Date.now(),
        },
        currentBusiness,
        businesses,
      );
      return;
    }

    const cached = readRestaurantRetailCache(businessId, currentBusiness, businesses);
    setFallbackRows(cached?.rows ?? []);
  }, [
    enabled,
    businessId,
    businessesFetchSettled,
    rowsFromScope,
    scopedRetail,
    scopedPdvs,
    currentBusiness,
    businesses,
  ]);

  useEffect(() => {
    if (!enabled || !dataUserId || !businessId || !currentBusiness) return;
    if (!businessesFetchSettled) return;
    if (rowsFromScope.length > 0) return;
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
        setFallbackRows(rows);
        if (rows.length > 0) {
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
          if (activeStore.allPointsOfSale.length === 0) {
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
      setFallbackLoading(false);
    };
  }, [
    enabled,
    dataUserId,
    businessId,
    businessesFetchSettled,
    businesses,
    rowsFromScope.length,
    activeStore.allPointsOfSale.length,
    activeStore.refresh,
    currentBusiness,
  ]);

  const rows = rowsFromScope.length > 0 ? rowsFromScope : fallbackRows;
  const loading =
    enabled &&
    rows.length === 0 &&
    (!businessesFetchSettled || activeStore.loading || fallbackLoading);

  return { rows, loading };
}
