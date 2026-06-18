import type { CatalogItem, DeliveryOrder, DeliveryOrderItem } from './deliveryApi';

export type CatalogItemSalesStats = {
  totalUnits: number;
  totalRevenue: number;
  orderCount: number;
  todayUnits: number;
  todayRevenue: number;
  weekUnits: number;
  weekRevenue: number;
  monthUnits: number;
  monthRevenue: number;
  topExtras: Array<{ label: string; count: number }>;
  topRemoved: Array<{ label: string; count: number }>;
};

const EXCLUDED_STATUSES = new Set(['cancelled', 'devuelto', 'incident']);

function normalizeName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function lineRevenue(item: DeliveryOrderItem): number {
  const total = Number(item.total);
  if (Number.isFinite(total) && total >= 0) return total;
  const qty = Number(item.quantity || 0);
  const unit = Number(item.unitPrice || 0);
  return Math.round(qty * unit * 100) / 100;
}

function orderMatchesItem(orderItem: DeliveryOrderItem, item: CatalogItem): boolean {
  const catalogId = String(item._id || item.id || '').trim();
  const orderCatalogId = String(orderItem.catalogItemId || '').trim();
  if (catalogId && orderCatalogId && catalogId === orderCatalogId) return true;
  return normalizeName(orderItem.name) === normalizeName(item.name);
}

function bumpCount(map: Map<string, number>, label: string, qty: number) {
  const key = String(label || '').trim();
  if (!key) return;
  map.set(key, (map.get(key) || 0) + qty);
}

function topEntries(map: Map<string, number>, limit = 5): Array<{ label: string; count: number }> {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function computeCatalogItemSalesStats(
  item: CatalogItem,
  orders: DeliveryOrder[],
  now = new Date(),
): CatalogItemSalesStats {
  const todayKey = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const monthStart = `${todayKey.slice(0, 7)}-01`;

  let totalUnits = 0;
  let totalRevenue = 0;
  let orderCount = 0;
  let todayUnits = 0;
  let todayRevenue = 0;
  let weekUnits = 0;
  let weekRevenue = 0;
  let monthUnits = 0;
  let monthRevenue = 0;
  const extrasMap = new Map<string, number>();
  const removedMap = new Map<string, number>();

  for (const order of orders) {
    if (EXCLUDED_STATUSES.has(String(order.status || ''))) continue;
    const items = Array.isArray(order.items) ? order.items : [];
    let matchedInOrder = false;
    const createdDay = String(order.createdAt || '').slice(0, 10);

    for (const orderItem of items) {
      if (!orderMatchesItem(orderItem, item)) continue;
      matchedInOrder = true;
      const qty = Number(orderItem.quantity || 0);
      if (qty <= 0) continue;
      const revenue = lineRevenue(orderItem);

      totalUnits += qty;
      totalRevenue += revenue;
      if (createdDay === todayKey) {
        todayUnits += qty;
        todayRevenue += revenue;
      }
      if (createdDay >= weekAgo) {
        weekUnits += qty;
        weekRevenue += revenue;
      }
      if (createdDay >= monthStart) {
        monthUnits += qty;
        monthRevenue += revenue;
      }

      for (const extra of orderItem.extras || []) {
        const text = String(extra || '').trim();
        if (text.startsWith('+')) bumpCount(extrasMap, text.replace(/^\+\s*/, ''), qty);
        else if (text.startsWith('-')) bumpCount(removedMap, text.replace(/^-\s*sin\s*/i, ''), qty);
      }
      for (const ing of orderItem.ingredients || []) {
        if (String(ing.quantity || '').toLowerCase() === 'sin') {
          bumpCount(removedMap, String(ing.name || ''), qty);
        }
      }
    }

    if (matchedInOrder) orderCount += 1;
  }

  return {
    totalUnits,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    orderCount,
    todayUnits,
    todayRevenue: Math.round(todayRevenue * 100) / 100,
    weekUnits,
    weekRevenue: Math.round(weekRevenue * 100) / 100,
    monthUnits,
    monthRevenue: Math.round(monthRevenue * 100) / 100,
    topExtras: topEntries(extrasMap),
    topRemoved: topEntries(removedMap),
  };
}

export function buildCatalogSalesIndex(
  catalogItems: CatalogItem[],
  orders: DeliveryOrder[],
): Map<string, CatalogItemSalesStats> {
  const out = new Map<string, CatalogItemSalesStats>();
  for (const item of catalogItems) {
    const id = String(item._id || item.id || '').trim();
    if (!id) continue;
    out.set(id, computeCatalogItemSalesStats(item, orders));
  }
  return out;
}
