import type { DeliveryOrder, TpvRegisterSession } from './deliveryApi';
import {
  attributeOrderRevenueByBrand,
  lineQuantity,
  lineRevenueAmount,
} from '../../../shared/delivery/orderLineRevenueSplit.js';
import {
  filterOrdersForRegisterSession,
  resolveOrderCashCardAmounts,
} from './registerShiftSalesBreakdown';
import {
  splitRulesFromBillingConfig,
  type BrandBillingConfig,
  type BrandBillingSplitRules,
} from './brandBillingConfig';

function orderRevenue(order: DeliveryOrder): number {
  const total = Number((order as { totalAmount?: number }).totalAmount ?? order.total);
  if (Number.isFinite(total) && total > 0) return total;
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((s, item) => s + lineRevenueAmount(item), 0);
}

function itemBrandIds(item: { brandIds?: string[] }): string[] {
  return Array.isArray(item?.brandIds)
    ? item.brandIds.map((b) => String(b || '').trim()).filter(Boolean)
    : [];
}

export type ShiftBrandRevenueRow = {
  brandId: string;
  name: string;
  revenue: number;
  /** € cobrados en efectivo atribuidos a esta marca */
  revenueEfectivo: number;
  /** € cobrados con tarjeta atribuidos a esta marca */
  revenueTarjeta: number;
  /** € de líneas con esa marca */
  ownRevenue: number;
  /** € compartidos (bebidas…) asignados a esta marca */
  sharedAssigned: number;
  orderCount: number;
  sharePercent: number;
  /** Texto corto del “por qué” */
  why: string;
};

function buildWhy(own: number, shared: number, orderCount: number): string {
  const parts: string[] = [];
  if (own > 0) {
    parts.push(`${own.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € productos`);
  }
  if (shared > 0) {
    parts.push(
      `${shared.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € compartidos (dominante)`,
    );
  }
  if (orderCount > 0) {
    parts.push(`${orderCount} ped.`);
  }
  return parts.join(' · ') || 'Sin ventas';
}

/**
 * € del turno por marca (mismos pedidos que el cierre), con reglas Facturación
 * y desglose propios / compartidos.
 */
export function buildShiftBrandRevenue(
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status' | 'pointOfSaleId'>,
  orders: DeliveryOrder[],
  brandLabels: Record<string, string> = {},
  rules?: BrandBillingSplitRules | Pick<BrandBillingConfig, 'sharedSplitMode' | 'monoBrandTakesAll'> | null,
): { rows: ShiftBrandRevenueRow[]; unbranded: number; total: number } {
  const splitRules = splitRulesFromBillingConfig(rules || null);
  const shiftOrders = filterOrdersForRegisterSession(session, orders);
  const byBrand: Record<string, number> = {};
  const cashByBrand: Record<string, number> = {};
  const cardByBrand: Record<string, number> = {};
  const ownByBrand: Record<string, number> = {};
  const sharedByBrand: Record<string, number> = {};
  const orderCountByBrand: Record<string, number> = {};
  let unbranded = 0;
  let total = 0;

  for (const order of shiftOrders) {
    const orderRev = orderRevenue(order);
    total += orderRev;
    const pay = resolveOrderCashCardAmounts(order, orderRev);
    const payDenom = Math.max(0, pay.efectivo) + Math.max(0, pay.tarjeta);
    const cashRatio = payDenom > 0 ? Math.max(0, pay.efectivo) / payDenom : 0;
    const cardRatio = payDenom > 0 ? Math.max(0, pay.tarjeta) / payDenom : 0;

    const items = Array.isArray(order.items) ? order.items : [];
    const ownOnly: Record<string, number> = {};
    for (const item of items) {
      const amount = lineRevenueAmount(item);
      if (amount <= 0) continue;
      const brands = itemBrandIds(item);
      if (brands.length === 0) continue;
      const share = amount / brands.length;
      for (const bid of brands) {
        ownOnly[bid] = (ownOnly[bid] || 0) + share;
      }
    }

    const attributed = attributeOrderRevenueByBrand(order, splitRules);
    const attributedSum =
      Object.values(attributed.byBrand).reduce((s, n) => s + (Number(n) || 0), 0)
      + (Number(attributed.unbranded) || 0);
    const scale = attributedSum > 0 && orderRev > 0 ? orderRev / attributedSum : 1;

    let hitBrand = false;
    for (const [bid, amt] of Object.entries(attributed.byBrand)) {
      const v = (Number(amt) || 0) * scale;
      if (v <= 0) continue;
      byBrand[bid] = (byBrand[bid] || 0) + v;
      cashByBrand[bid] = (cashByBrand[bid] || 0) + v * cashRatio;
      cardByBrand[bid] = (cardByBrand[bid] || 0) + v * cardRatio;
      const ownRaw = (ownOnly[bid] || 0) * scale;
      const own = Math.min(ownRaw, v);
      const shared = Math.max(0, v - own);
      ownByBrand[bid] = (ownByBrand[bid] || 0) + own;
      sharedByBrand[bid] = (sharedByBrand[bid] || 0) + shared;
      orderCountByBrand[bid] = (orderCountByBrand[bid] || 0) + 1;
      hitBrand = true;
    }
    if (!hitBrand && Object.keys(ownOnly).length > 0) {
      // safety: shouldn't happen
    }
    unbranded += (Number(attributed.unbranded) || 0) * scale;
  }

  total = Math.round(total * 100) / 100;
  unbranded = Math.round(unbranded * 100) / 100;

  const rows: ShiftBrandRevenueRow[] = Object.entries(byBrand)
    .map(([brandId, revenue]) => {
      const ownRevenue = Math.round((ownByBrand[brandId] || 0) * 100) / 100;
      const sharedAssigned = Math.round((sharedByBrand[brandId] || 0) * 100) / 100;
      const orderCount = orderCountByBrand[brandId] || 0;
      const rev = Math.round(revenue * 100) / 100;
      const revenueEfectivo = Math.round((cashByBrand[brandId] || 0) * 100) / 100;
      const revenueTarjeta = Math.round((cardByBrand[brandId] || 0) * 100) / 100;
      return {
        brandId,
        name: String(brandLabels[brandId] || '').trim() || brandId,
        revenue: rev,
        revenueEfectivo,
        revenueTarjeta,
        ownRevenue,
        sharedAssigned,
        orderCount,
        sharePercent: total > 0 ? Math.round((revenue / total) * 1000) / 10 : 0,
        why: buildWhy(ownRevenue, sharedAssigned, orderCount),
      };
    })
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  return { rows, unbranded, total };
}

export type OrderBrandShare = {
  brandId: string;
  name: string;
  amount: number;
  ownRevenue: number;
  sharedAssigned: number;
  /** Texto corto: productos + compartidos y por qué */
  why: string;
};

function fmtEuro(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildOrderBrandWhy(
  own: number,
  shared: number,
  sharedReason: 'none' | 'mono' | 'majority' | 'equal',
): string {
  const parts: string[] = [];
  if (own > 0) parts.push(`${fmtEuro(own)} € productos`);
  if (shared > 0) {
    if (sharedReason === 'mono') {
      parts.push(`${fmtEuro(shared)} € compartidos (única marca del ticket)`);
    } else if (sharedReason === 'majority') {
      parts.push(`${fmtEuro(shared)} € compartidos (dominante: más uds / €)`);
    } else if (sharedReason === 'equal') {
      parts.push(`${fmtEuro(shared)} € compartidos (a medias)`);
    } else {
      parts.push(`${fmtEuro(shared)} € compartidos`);
    }
  }
  return parts.join(' · ') || 'Sin importe';
}

/** € por marca de un solo pedido (mismas reglas Facturación) + porqué. */
export function getOrderBrandShares(
  order: DeliveryOrder,
  brandLabels: Record<string, string> = {},
  rules?: BrandBillingSplitRules | Pick<BrandBillingConfig, 'sharedSplitMode' | 'monoBrandTakesAll'> | null,
): OrderBrandShare[] {
  const splitRules = splitRulesFromBillingConfig(rules || null);
  const orderRev = orderRevenue(order);
  const items = Array.isArray(order.items) ? order.items : [];

  const ownOnly: Record<string, number> = {};
  for (const item of items) {
    const amount = lineRevenueAmount(item);
    if (amount <= 0) continue;
    const brands = itemBrandIds(item);
    if (brands.length === 0) continue;
    const share = amount / brands.length;
    for (const bid of brands) {
      ownOnly[bid] = (ownOnly[bid] || 0) + share;
    }
  }

  const attributed = attributeOrderRevenueByBrand(order, splitRules);
  const attributedSum =
    Object.values(attributed.byBrand).reduce((s, n) => s + (Number(n) || 0), 0)
    + (Number(attributed.unbranded) || 0);
  const scale = attributedSum > 0 && orderRev > 0 ? orderRev / attributedSum : 1;
  const brandCount = (attributed.presentBrandIds || []).length;
  const mode = splitRules.sharedSplitMode === 'equal' ? 'equal' : 'majority';
  const sharedReason: 'none' | 'mono' | 'majority' | 'equal' =
    brandCount === 1 ? 'mono' : brandCount >= 2 ? mode : 'none';

  const shares: OrderBrandShare[] = [];
  for (const [bid, amt] of Object.entries(attributed.byBrand)) {
    const amount = Math.round((Number(amt) || 0) * scale * 100) / 100;
    if (amount <= 0) continue;
    const ownRaw = (ownOnly[bid] || 0) * scale;
    const ownRevenue = Math.round(Math.min(ownRaw, amount) * 100) / 100;
    const sharedAssigned = Math.round(Math.max(0, amount - ownRevenue) * 100) / 100;
    shares.push({
      brandId: bid,
      name: String(brandLabels[bid] || '').trim() || bid,
      amount,
      ownRevenue,
      sharedAssigned,
      why: buildOrderBrandWhy(
        ownRevenue,
        sharedAssigned,
        sharedAssigned > 0 ? sharedReason : 'none',
      ),
    });
  }
  const unbranded = Math.round((Number(attributed.unbranded) || 0) * scale * 100) / 100;
  if (unbranded > 0) {
    shares.push({
      brandId: '',
      name: 'Sin marca',
      amount: unbranded,
      ownRevenue: 0,
      sharedAssigned: unbranded,
      why: `${fmtEuro(unbranded)} € sin marca asignada`,
    });
  }
  return shares.sort((a, b) => b.amount - a.amount);
}

/** @deprecated helper kept for callers that only need qty presence */
export function shiftOrderHasBrandLines(order: DeliveryOrder): boolean {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.some((it) => itemBrandIds(it).length > 0 && lineQuantity(it) > 0);
}
