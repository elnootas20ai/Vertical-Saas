import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import { listCatalogItemsRequest, type CatalogItem } from '../lib/deliveryApi';
import { filterCatalogItemsForBusinessScope } from '../lib/catalogBusinessScope';
import { listBrandsRequest } from '../lib/brandsApi';
import { resolveBusinessScopeId } from '../lib/deliverySetup';
import { filterStockInventoryItems } from '../lib/stockInventoryScope';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
import {
  createWarehouseRequest,
  listWarehousesRequest,
  updateWarehouseRequest,
  type Warehouse,
} from '../lib/warehouseApi';
import { quantityForWarehouse, storeWarehouseDisplayName } from '../lib/warehouseStockQty';
import type { BusinessType } from '../lib/businessApi';

export type StockWorkspaceScopeInput = {
  dataUserId?: string;
  storeLabel?: string;
  /** PDV del TPV abierto: manda sobre el del sidebar global. */
  salesPointId?: string;
};

function findWarehouseForSalesPoint(warehouses: Warehouse[], salesPointId: string): Warehouse | null {
  const pdvId = String(salesPointId || '').trim();
  if (!pdvId) return null;
  return (
    warehouses.find(
      (w) => w.active !== false && String(w.salesPointId || '').trim() === pdvId,
    ) || null
  );
}

async function ensureClientStoreWarehouses(
  userId: string,
  pointsOfSale: Array<{ _id: string; name?: string; code?: string; active?: boolean; deletedAt?: string | null }>,
  existing: Warehouse[],
): Promise<Warehouse[]> {
  const uid = String(userId || '').trim();
  if (!uid) return existing;
  let warehouses = [...existing];
  const pdvs = pointsOfSale.filter((p) => p && !p.deletedAt && p.active !== false);

  for (const pdv of pdvs) {
    const pdvId = String(pdv._id || '').trim();
    if (!pdvId) continue;
    const desiredName = storeWarehouseDisplayName(pdv.name || pdv.code || 'Tienda');
    const linked = findWarehouseForSalesPoint(warehouses, pdvId);
    if (linked) {
      if (String(linked.name || '').trim() !== desiredName) {
        try {
          const updated = await updateWarehouseRequest(uid, { ...linked, name: desiredName });
          warehouses = warehouses.map((w) => (w._id === updated._id ? updated : w));
        } catch {
          /* noop */
        }
      }
      continue;
    }

    const byName = warehouses.find(
      (w) =>
        w.active !== false &&
        !String(w.salesPointId || '').trim() &&
        String(w.name || '').trim().toLowerCase() === desiredName.toLowerCase(),
    );
    if (byName) {
      try {
        const updated = await updateWarehouseRequest(uid, {
          ...byName,
          name: desiredName,
          salesPointId: pdvId,
          warehouseType: 'store',
        });
        warehouses = warehouses.map((w) => (w._id === updated._id ? updated : w));
      } catch {
        /* noop */
      }
      continue;
    }

    try {
      const created = await createWarehouseRequest(uid, {
        name: desiredName,
        salesPointId: pdvId,
        warehouseType: 'store',
        isDefault: warehouses.filter((w) => w.active !== false).length === 0,
        active: true,
      });
      warehouses.push(created);
    } catch {
      /* noop */
    }
  }

  return warehouses;
}

export function useStockWorkspace(scopeInput?: StockWorkspaceScopeInput) {
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const activeStore = useActiveStoreScope();

  const dataUserId = scopeInput?.dataUserId || resolveBusinessDataUserId(user, currentBusiness);
  const businessId = resolveBusinessScopeId(currentBusiness);
  const businessType = (currentBusiness?.businessType || '') as BusinessType;
  const ready = businessesFetchSettled && Boolean(dataUserId);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  const activeSalesPointId = String(activeStore.activeSalesPointId || '').trim();

  const storeLabel = useMemo(() => {
    if (scopeInput?.storeLabel) return scopeInput.storeLabel;
    if (activeSalesPointId) {
      const pdv = activeStore.pointsOfSale.find((p) => p._id === activeSalesPointId);
      if (pdv?.name) return storeWarehouseDisplayName(pdv.name);
    }
    if (activeStore.displayLabelForActive) return storeWarehouseDisplayName(activeStore.displayLabelForActive);
    if (currentBusiness?.name) return currentBusiness.name;
    return 'Almacén';
  }, [
    scopeInput?.storeLabel,
    activeSalesPointId,
    activeStore.pointsOfSale,
    activeStore.displayLabelForActive,
    currentBusiness?.name,
  ]);

  const storeWarehouseId = useMemo(() => {
    const activeWh = warehouses.filter((w) => w.active !== false);
    if (activeSalesPointId) {
      const linked = findWarehouseForSalesPoint(activeWh, activeSalesPointId);
      if (linked) return linked._id;
    }
    const label = storeLabel.toLowerCase();
    const byName = activeWh.find((w) => label && w.name.toLowerCase().includes(label.split(/\s+/)[0] || ''));
    return byName?._id || activeWh.find((w) => w.isDefault)?._id || activeWh[0]?._id || '';
  }, [warehouses, storeLabel, activeSalesPointId]);

  const stockItems = useMemo(() => filterStockInventoryItems(items), [items]);

  const stockedCount = useMemo(
    () =>
      stockItems.filter(
        (i) => i.active && !i.deletedAt && quantityForWarehouse(i, storeWarehouseId) > 0,
      ).length,
    [stockItems, storeWarehouseId],
  );

  const reload = useCallback(async () => {
    if (!dataUserId) {
      setItems([]);
      setWarehouses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [catalogItems, wh, brands] = await Promise.all([
        listCatalogItemsRequest(dataUserId),
        listWarehousesRequest(dataUserId).catch(() => [] as Warehouse[]),
        businessId ? listBrandsRequest(businessId).catch(() => []) : Promise.resolve([]),
      ]);
      const scoped = businessId
        ? filterCatalogItemsForBusinessScope(catalogItems, businessId, brands, {
            accountBusinessCount: businesses.length,
            activeBusinessType: currentBusiness?.businessType,
          })
        : catalogItems;
      const ensured = await ensureClientStoreWarehouses(
        dataUserId,
        activeStore.pointsOfSale || [],
        wh,
      );
      setItems(scoped);
      setWarehouses(ensured);
    } catch {
      setItems([]);
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  }, [
    businessId,
    businesses.length,
    currentBusiness?.businessType,
    dataUserId,
    activeStore.pointsOfSale,
  ]);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, reload]);

  return {
    dataUserId: dataUserId || '',
    businessType,
    storeLabel,
    storeWarehouseId,
    warehouses,
    stockItems,
    stockedCount,
    loading: !ready || loading,
    reload,
  };
}
