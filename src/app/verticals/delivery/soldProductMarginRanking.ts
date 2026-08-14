/**
 * Ranking de productos vendidos (pedidos delivery) con coste/margen de escandallo.
 * Solo agrega lo vendido en el periodo — no lista la carta completa.
 */
import type { CatalogItem, DeliveryOrder, DeliveryOrderItem } from '../../lib/deliveryApi';
import type { StoreIngredient } from '../../lib/catalogCustomization';
import {
  productCostingStatus,
  resolveProductUnitCost,
  storeIngredientsById,
} from '../../lib/catalogCosting';
import {
  listMonthToDateDayKeys,
  listTrailingDayKeys,
} from '../../lib/portfolioMetrics';
import { localCalendarDayKey } from '../../lib/tpvCajaScope';

export type SoldMarginPeriod = 'week' | 'month';

export type SoldMarginStoreOpt = {
  id: string;
  name: string;
};

export type SoldMarginRankRow = {
  key: string;
  catalogItemId: string | null;
  name: string;
  isCombo: boolean;
  units: number;
  revenue: number;
  /** null = falta escandallo / sin coste fiable */
  unitCost: number | null;
  cost: number | null;
  margin: number | null;
  marginPct: number | null;
  hasEscandallo: boolean;
};

export type SoldMarginRankResult = {
  rows: SoldMarginRankRow[];
  missingEscandalloCount: number;
  totalUnits: number;
  totalRevenue: number;
  /** Solo filas con escandallo */
  totalCost: number;
  totalMargin: number;
  stores: SoldMarginStoreOpt[];
};

function foldName(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function orderDayKey(order: DeliveryOrder): string {
  const raw = String(order.deliveredAt || order.createdAt || order.updatedAt || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return localCalendarDayKey(d);
}

export function soldMarginPeriodDayKeys(
  period: SoldMarginPeriod,
  todayKey: string = localCalendarDayKey(),
): string[] {
  if (period === 'week') return listTrailingDayKeys(todayKey, 7);
  return listMonthToDateDayKeys(todayKey);
}

function lineRevenue(item: DeliveryOrderItem): number {
  const total = Number(item.total);
  if (Number.isFinite(total) && total >= 0) return total;
  const qty = Number(item.quantity) || 0;
  const unit = Number(item.unitPrice) || 0;
  return Math.round(qty * unit * 100) / 100;
}

function productAggKey(item: DeliveryOrderItem): string {
  const id = String(item.catalogItemId || '').trim();
  if (id) return `id:${id}`;
  const name = foldName(item.name);
  return name ? `name:${name}` : `name:sin-nombre`;
}

type CatalogIndex = {
  byId: Map<string, CatalogItem>;
  byName: Map<string, CatalogItem>;
};

export function buildSoldMarginCatalogIndex(catalog: CatalogItem[]): CatalogIndex {
  const byId = new Map<string, CatalogItem>();
  const byName = new Map<string, CatalogItem>();
  for (const item of catalog) {
    if (item.module === 'stock') continue;
    if (item.itemType !== 'product' && item.itemType !== 'combo') continue;
    const id = String(item.id || item._id || '').trim();
    const alt = String(item._id || '').trim();
    if (id) byId.set(id, item);
    if (alt && alt !== id) byId.set(alt, item);
    const nm = foldName(item.name);
    if (nm && !byName.has(nm)) byName.set(nm, item);
  }
  return { byId, byName };
}

function resolveCatalogItem(
  item: DeliveryOrderItem,
  index: CatalogIndex,
): CatalogItem | null {
  const id = String(item.catalogItemId || '').trim();
  if (id) {
    const hit = index.byId.get(id);
    if (hit) return hit;
  }
  const nm = foldName(item.name);
  if (!nm) return null;
  return index.byName.get(nm) || null;
}

/**
 * IDs/nombres vendidos en el periodo (para filtrar catálogo antes de costear).
 */
export function collectSoldCatalogHints(
  orders: DeliveryOrder[],
  dayKeys: Set<string>,
  storeId?: string | null,
): { ids: Set<string>; names: Set<string> } {
  const ids = new Set<string>();
  const names = new Set<string>();
  const storeFilter = String(storeId || '').trim();
  for (const order of orders) {
    if (String(order.status || '').toLowerCase() === 'cancelled') continue;
    if (!dayKeys.has(orderDayKey(order))) continue;
    if (storeFilter && String(order.salesPointId || '').trim() !== storeFilter) continue;
    for (const item of order.items || []) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      const id = String(item.catalogItemId || '').trim();
      if (id) ids.add(id);
      const nm = foldName(item.name);
      if (nm) names.add(nm);
    }
  }
  return { ids, names };
}

/** Reduce la carta a lo vendido (+ refs de id/nombre). */
export function filterCatalogToSoldHints(
  catalog: CatalogItem[],
  hints: { ids: Set<string>; names: Set<string> },
): CatalogItem[] {
  if (hints.ids.size === 0 && hints.names.size === 0) return [];
  return catalog.filter((item) => {
    if (item.module === 'stock') return false;
    if (item.itemType !== 'product' && item.itemType !== 'combo') return false;
    const id = String(item.id || '').trim();
    const alt = String(item._id || '').trim();
    if (id && hints.ids.has(id)) return true;
    if (alt && hints.ids.has(alt)) return true;
    const nm = foldName(item.name);
    return Boolean(nm && hints.names.has(nm));
  });
}

export function listStoresFromSoldOrders(
  orders: DeliveryOrder[],
  dayKeys: Set<string>,
): SoldMarginStoreOpt[] {
  const map = new Map<string, string>();
  for (const order of orders) {
    if (String(order.status || '').toLowerCase() === 'cancelled') continue;
    if (!dayKeys.has(orderDayKey(order))) continue;
    const id = String(order.salesPointId || '').trim();
    if (!id) continue;
    const name = String(order.salesPointName || id).trim() || id;
    if (!map.has(id)) map.set(id, name);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function buildSoldProductMarginRanking(opts: {
  orders: DeliveryOrder[];
  period: SoldMarginPeriod;
  storeId?: string | null;
  catalog: CatalogItem[];
  storeIngredients: StoreIngredient[];
  brands?: Array<{ _id: string; deliveryLineKind?: string }>;
  todayKey?: string;
}): SoldMarginRankResult {
  const todayKey = opts.todayKey || localCalendarDayKey();
  const dayKeyList = soldMarginPeriodDayKeys(opts.period, todayKey);
  const dayKeys = new Set(dayKeyList);
  const storeFilter = String(opts.storeId || '').trim();
  const stores = listStoresFromSoldOrders(opts.orders, dayKeys);

  const hints = collectSoldCatalogHints(opts.orders, dayKeys, storeFilter || null);
  const soldCatalog = filterCatalogToSoldHints(opts.catalog, hints);
  const index = buildSoldMarginCatalogIndex(soldCatalog);
  const ingredientsById = storeIngredientsById(opts.storeIngredients);

  type Acc = {
    key: string;
    catalogItemId: string | null;
    name: string;
    isCombo: boolean;
    units: number;
    revenue: number;
    unitCost: number | null;
    hasEscandallo: boolean;
  };

  const byKey = new Map<string, Acc>();

  for (const order of opts.orders) {
    if (String(order.status || '').toLowerCase() === 'cancelled') continue;
    if (!dayKeys.has(orderDayKey(order))) continue;
    if (storeFilter && String(order.salesPointId || '').trim() !== storeFilter) continue;

    for (const item of order.items || []) {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      const key = productAggKey(item);
      const catalogItem = resolveCatalogItem(item, index);
      const status = catalogItem ? productCostingStatus(catalogItem) : 'none';
      const hasEscandallo = status !== 'none';
      let unitCost: number | null = null;
      if (catalogItem && hasEscandallo) {
        unitCost = resolveProductUnitCost(catalogItem, ingredientsById, opts.brands);
        if (!(unitCost >= 0) || !Number.isFinite(unitCost)) unitCost = null;
      }

      const prev = byKey.get(key);
      if (prev) {
        prev.units += qty;
        prev.revenue = Math.round((prev.revenue + lineRevenue(item)) * 100) / 100;
        if (!prev.name && item.name) prev.name = String(item.name);
        continue;
      }

      byKey.set(key, {
        key,
        catalogItemId: catalogItem
          ? String(catalogItem.id || catalogItem._id || '').trim() || null
          : String(item.catalogItemId || '').trim() || null,
        name: String(item.name || catalogItem?.name || 'Producto').trim() || 'Producto',
        isCombo: catalogItem?.itemType === 'combo',
        units: qty,
        revenue: lineRevenue(item),
        unitCost,
        hasEscandallo: Boolean(catalogItem && hasEscandallo && unitCost != null),
      });
    }
  }

  const rows: SoldMarginRankRow[] = [...byKey.values()]
    .map((acc) => {
      const hasEscandallo = acc.hasEscandallo && acc.unitCost != null;
      const cost = hasEscandallo
        ? Math.round((acc.unitCost as number) * acc.units * 100) / 100
        : null;
      const margin = cost != null ? Math.round((acc.revenue - cost) * 100) / 100 : null;
      const marginPct =
        margin != null && acc.revenue > 0
          ? Math.round(((margin / acc.revenue) * 1000)) / 10
          : null;
      return {
        key: acc.key,
        catalogItemId: acc.catalogItemId,
        name: acc.name,
        isCombo: acc.isCombo,
        units: acc.units,
        revenue: Math.round(acc.revenue * 100) / 100,
        unitCost: hasEscandallo ? acc.unitCost : null,
        cost,
        margin,
        marginPct,
        hasEscandallo,
      };
    })
    .sort((a, b) => {
      if (b.units !== a.units) return b.units - a.units;
      return b.revenue - a.revenue;
    });

  let totalUnits = 0;
  let totalRevenue = 0;
  let totalCost = 0;
  let totalMargin = 0;
  let missingEscandalloCount = 0;
  for (const row of rows) {
    totalUnits += row.units;
    totalRevenue += row.revenue;
    if (!row.hasEscandallo) {
      missingEscandalloCount += 1;
      continue;
    }
    totalCost += row.cost || 0;
    totalMargin += row.margin || 0;
  }

  return {
    rows,
    missingEscandalloCount,
    totalUnits,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalMargin: Math.round(totalMargin * 100) / 100,
    stores,
  };
}
