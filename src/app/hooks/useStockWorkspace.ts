import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useActiveStoreScope } from '../context/ActiveStoreScopeContext';
import { listCatalogItemsRequest, type CatalogItem } from '../lib/deliveryApi';
import { filterStockInventoryItems } from '../lib/stockInventoryScope';
import { resolveBusinessDataUserId } from '../lib/tenantUserId';
import { listWarehousesRequest, type Warehouse } from '../lib/warehouseApi';
import type { BusinessType } from '../lib/businessApi';

export type StockWorkspaceScopeInput = {
  dataUserId?: string;
  storeLabel?: string;
};

export function useStockWorkspace(scopeInput?: StockWorkspaceScopeInput) {
  const { user } = useAuth();
  const { currentBusiness, businessesFetchSettled } = useBusiness();
  const activeStore = useActiveStoreScope();

  const dataUserId = scopeInput?.dataUserId || resolveBusinessDataUserId(user, currentBusiness);
  const businessType = (currentBusiness?.businessType || '') as BusinessType;
  const ready = businessesFetchSettled && Boolean(dataUserId);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  const storeLabel = useMemo(() => {
    if (scopeInput?.storeLabel) return scopeInput.storeLabel;
    if (activeStore.activeSalesPointId) {
      const pdv = activeStore.pointsOfSale.find((p) => p._id === activeStore.activeSalesPointId);
      if (pdv?.name) return pdv.name;
    }
    if (activeStore.displayLabelForActive) return activeStore.displayLabelForActive;
    if (currentBusiness?.name) return currentBusiness.name;
    return 'Almacén';
  }, [
    scopeInput?.storeLabel,
    activeStore.activeSalesPointId,
    activeStore.pointsOfSale,
    activeStore.displayLabelForActive,
    currentBusiness?.name,
  ]);

  const storeWarehouseId = useMemo(() => {
    const activeWh = warehouses.filter((w) => w.active);
    const label = storeLabel.toLowerCase();
    const byName = activeWh.find((w) => label && w.name.toLowerCase().includes(label.split(/\s+/)[0] || ''));
    return byName?._id || activeWh.find((w) => w.isDefault)?._id || activeWh[0]?._id || '';
  }, [warehouses, storeLabel]);

  const stockItems = useMemo(() => filterStockInventoryItems(items), [items]);

  const stockedCount = useMemo(
    () => stockItems.filter((i) => i.active && !i.deletedAt && Number(i.stockQuantity || 0) > 0).length,
    [stockItems],
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
      const [catalogItems, wh] = await Promise.all([
        listCatalogItemsRequest(dataUserId),
        listWarehousesRequest(dataUserId).catch(() => [] as Warehouse[]),
      ]);
      setItems(catalogItems);
      setWarehouses(wh);
    } catch {
      setItems([]);
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  }, [dataUserId]);

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
