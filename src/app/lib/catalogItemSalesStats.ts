import type { CatalogItem, DeliveryOrder, DeliveryOrderItem } from './deliveryApi';

export type CatalogItemSalesBucket = {
  label: string;
  units: number;
  revenue: number;
};

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
  /** ISO datetime de la última venta con este producto. */
  lastSoldAt: string | null;
  /** ISO datetime de la primera venta detectada. */
  firstSoldAt: string | null;
  /** Media diaria de unidades en los últimos 7 días. */
  avgDailyUnits7d: number;
  /** Pedidos donde hubo extra o ingrediente quitado. */
  customizedOrderCount: number;
  extrasHits: number;
  removedHits: number;
  byChannel: CatalogItemSalesBucket[];
  byOrderType: CatalogItemSalesBucket[];
  byPayment: CatalogItemSalesBucket[];
  byStore: CatalogItemSalesBucket[];
};

const EXCLUDED_STATUSES = new Set(['cancelled', 'devuelto', 'incident']);

const ORDER_TYPE_LABELS: Record<string, string> = {
  domicilio: 'Domicilio',
  recogida: 'Recogida',
  sala: 'Sala',
};

const CHANNEL_LABELS: Record<string, string> = {
  direct: 'Directo',
  phone: 'Teléfono',
  web: 'Web',
  app: 'App',
  tpv: 'TPV',
  glovo: 'Glovo',
  justeat: 'Just Eat',
  ubereats: 'Uber Eats',
  flipdish: 'Flipdish',
};

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  online: 'Online',
  mixed: 'Mixto',
};

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

function bumpBucket(
  map: Map<string, { units: number; revenue: number }>,
  label: string,
  units: number,
  revenue: number,
) {
  const key = String(label || '').trim() || 'Sin dato';
  const prev = map.get(key) || { units: 0, revenue: 0 };
  map.set(key, {
    units: prev.units + units,
    revenue: Math.round((prev.revenue + revenue) * 100) / 100,
  });
}

function topEntries(map: Map<string, number>, limit = 5): Array<{ label: string; count: number }> {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function topBuckets(
  map: Map<string, { units: number; revenue: number }>,
  limit = 5,
): CatalogItemSalesBucket[] {
  return [...map.entries()]
    .map(([label, row]) => ({ label, units: row.units, revenue: row.revenue }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .slice(0, limit);
}

function labelChannel(raw: string): string {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return 'Sin canal';
  return CHANNEL_LABELS[key] || raw;
}

function labelOrderType(raw: string): string {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return 'Sin tipo';
  return ORDER_TYPE_LABELS[key] || raw;
}

function labelPayment(raw: string): string {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return 'Sin pago';
  return PAYMENT_LABELS[key] || raw;
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
  let customizedOrderCount = 0;
  let extrasHits = 0;
  let removedHits = 0;
  let lastSoldAt: string | null = null;
  let firstSoldAt: string | null = null;
  const extrasMap = new Map<string, number>();
  const removedMap = new Map<string, number>();
  const channelMap = new Map<string, { units: number; revenue: number }>();
  const orderTypeMap = new Map<string, { units: number; revenue: number }>();
  const paymentMap = new Map<string, { units: number; revenue: number }>();
  const storeMap = new Map<string, { units: number; revenue: number }>();

  for (const order of orders) {
    if (EXCLUDED_STATUSES.has(String(order.status || ''))) continue;
    const items = Array.isArray(order.items) ? order.items : [];
    let matchedInOrder = false;
    let orderHadCustomization = false;
    let orderUnits = 0;
    let orderRevenue = 0;
    const createdDay = String(order.createdAt || '').slice(0, 10);
    const createdAt = String(order.createdAt || '').trim();

    for (const orderItem of items) {
      if (!orderMatchesItem(orderItem, item)) continue;
      matchedInOrder = true;
      const qty = Number(orderItem.quantity || 0);
      if (qty <= 0) continue;
      const revenue = lineRevenue(orderItem);

      totalUnits += qty;
      totalRevenue += revenue;
      orderUnits += qty;
      orderRevenue += revenue;
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
        if (text.startsWith('+')) {
          bumpCount(extrasMap, text.replace(/^\+\s*/, ''), qty);
          extrasHits += qty;
          orderHadCustomization = true;
        } else if (text.startsWith('-')) {
          bumpCount(removedMap, text.replace(/^-\s*sin\s*/i, ''), qty);
          removedHits += qty;
          orderHadCustomization = true;
        }
      }
      for (const ing of orderItem.ingredients || []) {
        if (String(ing.quantity || '').toLowerCase() === 'sin') {
          bumpCount(removedMap, String(ing.name || ''), qty);
          removedHits += qty;
          orderHadCustomization = true;
        }
      }
    }

    if (matchedInOrder) {
      orderCount += 1;
      if (orderHadCustomization) customizedOrderCount += 1;
      if (createdAt) {
        if (!lastSoldAt || createdAt > lastSoldAt) lastSoldAt = createdAt;
        if (!firstSoldAt || createdAt < firstSoldAt) firstSoldAt = createdAt;
      }
      bumpBucket(channelMap, labelChannel(String(order.channel || '')), orderUnits, orderRevenue);
      bumpBucket(orderTypeMap, labelOrderType(String(order.deliveryType || '')), orderUnits, orderRevenue);
      bumpBucket(paymentMap, labelPayment(String(order.paymentMethod || '')), orderUnits, orderRevenue);
      bumpBucket(
        storeMap,
        String(order.salesPointName || order.salesPointId || 'Sin tienda').trim() || 'Sin tienda',
        orderUnits,
        orderRevenue,
      );
    }
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
    lastSoldAt,
    firstSoldAt,
    avgDailyUnits7d: Math.round((weekUnits / 7) * 100) / 100,
    customizedOrderCount,
    extrasHits,
    removedHits,
    byChannel: topBuckets(channelMap),
    byOrderType: topBuckets(orderTypeMap),
    byPayment: topBuckets(paymentMap),
    byStore: topBuckets(storeMap),
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
