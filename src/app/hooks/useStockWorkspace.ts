import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { restaurantWarehouseViaExcelOnly } from '../verticals/restaurant/restaurantWarehousePolicy';

export type StockWorkspaceScopeInput = {
  dataUserId?: string;
  storeLabel?: string;
  /** PDV del TPV abierto: manda sobre el del sidebar global. */
  salesPointId?: string;
  /**
   * Artículos de stock ya cargados en la página (p. ej. Carta).
   * Si vienen, el Almacén pinta al instante y refresca en segundo plano.
   */
  seedStockItems?: CatalogItem[];
};

type StorePdv = { _id: string; name?: string; code?: string; active?: boolean; deletedAt?: string | null };

function findWarehouseForSalesPoint(warehouses: Warehouse[], salesPointId: string): Warehouse | null {
  const pdvId = String(salesPointId || '').trim();
  if (!pdvId) return null;
  return (
    warehouses.find(
      (w) => w.active !== false && String(w.salesPointId || '').trim() === pdvId,
    ) || null
  );
}

function warehousesCoverAllStores(warehouses: Warehouse[], pointsOfSale: StorePdv[]): boolean {
  const pdvs = pointsOfSale.filter((p) => p && !p.deletedAt && p.active !== false);
  return pdvs.every((pdv) => {
    const pdvId = String(pdv._id || '').trim();
    if (!pdvId) return true;
    const desiredName = storeWarehouseDisplayName(pdv.name || pdv.code || 'Tienda');
    const linked = findWarehouseForSalesPoint(warehouses, pdvId);
    return Boolean(linked && String(linked.name || '').trim() === desiredName);
  });
}

async function ensureClientStoreWarehouses(
  userId: string,
  pointsOfSale: StorePdv[],
  existing: Warehouse[],
): Promise<Warehouse[]> {
  const uid = String(userId || '').trim();
  if (!uid) return existing;
  if (warehousesCoverAllStores(existing, pointsOfSale)) return existing;

  const warehouses = [...existing];
  const pdvs = pointsOfSale.filter((p) => p && !p.deletedAt && p.active !== false);

  const results = await Promise.all(
    pdvs.map(async (pdv) => {
      const pdvId = String(pdv._id || '').trim();
      if (!pdvId) return null;
      const desiredName = storeWarehouseDisplayName(pdv.name || pdv.code || 'Tienda');
      const linked = findWarehouseForSalesPoint(warehouses, pdvId);
      if (linked) {
        if (String(linked.name || '').trim() === desiredName) return null;
        try {
          return await updateWarehouseRequest(uid, { ...linked, name: desiredName });
        } catch {
          return null;
        }
      }

      const byName = warehouses.find(
        (w) =>
          w.active !== false &&
          !String(w.salesPointId || '').trim() &&
          String(w.name || '').trim().toLowerCase() === desiredName.toLowerCase(),
      );
      if (byName) {
        try {
          return await updateWarehouseRequest(uid, {
            ...byName,
            name: desiredName,
            salesPointId: pdvId,
            warehouseType: 'store',
          });
        } catch {
          return null;
        }
      }

      try {
        return await createWarehouseRequest(uid, {
          name: desiredName,
          salesPointId: pdvId,
          warehouseType: 'store',
          isDefault: warehouses.filter((w) => w.active !== false).length === 0,
          active: true,
        });
      } catch {
        return null;
      }
    }),
  );

  const next = [...warehouses];
  for (const updated of results) {
    if (!updated?._id) continue;
    const idx = next.findIndex((w) => w._id === updated._id);
    if (idx >= 0) next[idx] = updated;
    else next.push(updated);
  }
  return next;
}

export function useStockWorkspace(scopeInput?: StockWorkspaceScopeInput) {
  const { user } = useAuth();
  const { currentBusiness, businesses, businessesFetchSettled } = useBusiness();
  const activeStore = useActiveStoreScope();

  const dataUserId = scopeInput?.dataUserId || resolveBusinessDataUserId(user, currentBusiness);
  const businessId = resolveBusinessScopeId(currentBusiness);
  const businessType = (currentBusiness?.businessType || '') as BusinessType;
  const ready = businessesFetchSettled && Boolean(dataUserId);

  const seedStockItems = scopeInput?.seedStockItems;
  const seedKey = useMemo(
    () =>
      (seedStockItems || [])
        .map((i) => `${i._id}:${i._rev || i.updatedAt || ''}`)
        .join('|'),
    [seedStockItems],
  );

  const [items, setItems] = useState<CatalogItem[]>(() =>
    Array.isArray(seedStockItems) ? filterStockInventoryItems(seedStockItems) : [],
  );
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(() => !Array.isArray(seedStockItems));
  const [loadDetail, setLoadDetail] = useState('Leyendo almacén…');
  const pointsOfSaleRef = useRef(activeStore.pointsOfSale);
  pointsOfSaleRef.current = activeStore.pointsOfSale;
  const hasPaintedRef = useRef(Array.isArray(seedStockItems));

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

  const posKey = useMemo(
    () =>
      (activeStore.pointsOfSale || [])
        .map((p) => `${p._id}:${p.name || p.code || ''}`)
        .join('|'),
    [activeStore.pointsOfSale],
  );

  useEffect(() => {
    if (!Array.isArray(seedStockItems)) return;
    // Solo pintura inicial: si el padre refresca con datos viejos (carga lenta en prod),
    // no reponer artículos ya eliminados del almacén.
    if (hasPaintedRef.current) return;
    setItems(filterStockInventoryItems(seedStockItems));
    setLoading(false);
    setLoadDetail('');
    hasPaintedRef.current = true;
  }, [seedKey]);

  const reload = useCallback(async () => {
    if (!dataUserId) {
      setItems([]);
      setWarehouses([]);
      setLoading(false);
      setLoadDetail('');
      return;
    }
    const hasSeed = hasPaintedRef.current;
    if (!hasSeed) {
      setLoading(true);
      setLoadDetail('Leyendo almacén…');
    }
    const watchdog = window.setTimeout(() => {
      setLoading(false);
      setLoadDetail('');
    }, 45_000);
    try {
      const [stockCatalog, wh, brands] = await Promise.all([
        listCatalogItemsRequest(dataUserId, 'stock'),
        listWarehousesRequest(dataUserId).catch(() => [] as Warehouse[]),
        businessId ? listBrandsRequest(businessId).catch(() => []) : Promise.resolve([]),
      ]);
      const scoped = businessId
        ? filterCatalogItemsForBusinessScope(stockCatalog, businessId, brands, {
            accountBusinessCount: businesses.length,
            activeBusinessType: currentBusiness?.businessType,
          })
        : stockCatalog;
      setItems(scoped);
      setWarehouses(wh);
      hasPaintedRef.current = true;
      setLoading(false);
      setLoadDetail('');
      if (restaurantWarehouseViaExcelOnly(businessType)) {
        return;
      }
      const pos = pointsOfSaleRef.current || [];
      if (!warehousesCoverAllStores(wh, pos)) {
        void ensureClientStoreWarehouses(dataUserId, pos, wh).then((ensured) => {
          setWarehouses(ensured);
        });
      }
    } catch {
      if (!hasPaintedRef.current) {
        setItems([]);
        setWarehouses([]);
      }
      setLoading(false);
      setLoadDetail('');
    } finally {
      window.clearTimeout(watchdog);
    }
  }, [
    businessId,
    businesses.length,
    currentBusiness?.businessType,
    dataUserId,
    posKey,
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
    loadDetail,
    reload,
  };
}
