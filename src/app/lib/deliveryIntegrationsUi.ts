import type { DeliveryIntegrations } from './webApi';
import type { DeliveryOrder, TpvRegisterSession } from './deliveryApi';
import {
  isCancelledDeliveryOrder,
  isCompletedShiftOrder,
  isRefundedDeliveryOrder,
  orderInRegisterSession,
} from './tpvCajaScope';

export type AggregatorIntegrationKey = 'globo' | 'uber' | 'justead' | 'flipdish';

export interface AggregatorPlatformDef {
  integrationKey: AggregatorIntegrationKey;
  channel: 'glovo' | 'ubereats' | 'justeat' | 'flipdish';
  label: string;
  colorClass: string;
  accentClass: string;
}

export const AGGREGATOR_PLATFORMS: AggregatorPlatformDef[] = [
  {
    integrationKey: 'globo',
    channel: 'glovo',
    label: 'Glovo',
    colorClass: 'bg-[#00A082] text-white',
    accentClass: 'border-[#00A082]/20',
  },
  {
    integrationKey: 'uber',
    channel: 'ubereats',
    label: 'Uber Eats',
    colorClass: 'bg-black text-white',
    accentClass: 'border-black/20',
  },
  {
    integrationKey: 'justead',
    channel: 'justeat',
    label: 'Just Eat',
    colorClass: 'bg-[#FF8000] text-white',
    accentClass: 'border-[#FF8000]/20',
  },
  {
    integrationKey: 'flipdish',
    channel: 'flipdish',
    label: 'Flipdish',
    colorClass: 'bg-[#E32B2B] text-white',
    accentClass: 'border-[#E32B2B]/20',
  },
];

export const DEFAULT_DELIVERY_INTEGRATIONS: DeliveryIntegrations = {
  uber: { enabled: false, token: '' },
  globo: { enabled: false, token: '' },
  justead: { enabled: false, token: '' },
  flipdish: { enabled: false, token: '' },
};

const INTEGRATION_KEYS = ['uber', 'globo', 'justead', 'flipdish'] as const;

/** Fusiona respuesta API (parcial o null) con defaults para que la UI nunca lea `undefined`. */
export function normalizeDeliveryIntegrations(
  raw: Partial<DeliveryIntegrations> | null | undefined,
): DeliveryIntegrations {
  const out = { ...DEFAULT_DELIVERY_INTEGRATIONS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of INTEGRATION_KEYS) {
    const entry = raw[key];
    if (!entry || typeof entry !== 'object') continue;
    out[key] = {
      ...DEFAULT_DELIVERY_INTEGRATIONS[key],
      ...entry,
      enabled: Boolean(entry.enabled),
      token: String(entry.token ?? ''),
    };
  }
  return out;
}

/** Alguna integración delivery activa (el token no es necesario para la caja). */
export function hasAnyDeliveryIntegrationEnabled(integrations: DeliveryIntegrations | null | undefined): boolean {
  if (!integrations) return false;
  return AGGREGATOR_PLATFORMS.some((p) => Boolean(integrations[p.integrationKey]?.enabled));
}

/** Plataformas con toggle activo (p. ej. webhooks). */
export function getActiveAggregatorPlatforms(integrations: DeliveryIntegrations | null | undefined): AggregatorPlatformDef[] {
  if (!integrations) return [];
  return AGGREGATOR_PLATFORMS.filter((p) => Boolean(integrations[p.integrationKey]?.enabled));
}

/** Siempre las 4 plataformas al cerrar / revisar caja TPV. */
export function getClosingAggregatorPlatforms(): AggregatorPlatformDef[] {
  return AGGREGATOR_PLATFORMS;
}

/** Cajas agregador en panel CEO (opcional si hay integración activa). */
export function getAggregatorCajaPlatforms(integrations: DeliveryIntegrations | null | undefined): AggregatorPlatformDef[] {
  return hasAnyDeliveryIntegrationEnabled(integrations) ? AGGREGATOR_PLATFORMS : [];
}

export interface AggregatorCashRow {
  platform: AggregatorPlatformDef;
  totalSales: number;
  /** Efectivo declarado del integrador (entra en arqueo de caja). */
  cashSales: number;
  /** Tarjeta declarada del integrador (informativo; no entra en arqueo de efectivo). */
  cardSales: number;
  orderCount: number;
  avgTicket: number;
  manualOverride?: boolean;
}

/** Líneas de cierre por canal (total legacy + desglose por marca). */
export type AggregatorClosingChannelLines = {
  total: string;
  totalByBrand?: Record<string, string>;
};

/** Suma totales por marca del borrador. -1 si ninguno rellenado. */
export function sumClosingBrandTotals(
  lines: AggregatorClosingChannelLines | undefined,
  brandIds: string[],
): number {
  if (!lines || brandIds.length === 0) return -1;
  const byBrand = lines.totalByBrand || {};
  let sum = 0;
  let any = false;
  for (const id of brandIds) {
    const p = parseAggregatorAmount(String(byBrand[id] ?? ''));
    if (p != null) {
      sum += p;
      any = true;
    }
  }
  return any ? Math.round(sum * 100) / 100 : -1;
}

/**
 * Total Caja 2 de un canal al cerrar.
 * Con marcas activas, no reutiliza `total` legacy si las marcas quedaron vacías
 * (evita 2 € fantasma en Uber/Glovo tras borrar el input visible).
 */
export function resolveClosingChannelTotalSales(
  lines: AggregatorClosingChannelLines,
  systemTotal: number,
  brandIds: string[],
): { totalSales: number; fromBrands: boolean } {
  const brandSum = sumClosingBrandTotals(lines, brandIds);
  if (brandIds.length > 0) {
    if (brandSum >= 0) return { totalSales: brandSum, fromBrands: true };
    return { totalSales: 0, fromBrands: false };
  }
  if (brandSum >= 0) return { totalSales: brandSum, fromBrands: true };
  const parsedTotal = parseAggregatorAmount(lines.total);
  if (parsedTotal != null) return { totalSales: parsedTotal, fromBrands: false };
  return { totalSales: Math.max(0, systemTotal), fromBrands: false };
}

export function parseAggregatorAmount(raw: string): number | null {
  const s = String(raw || '').replace(/\s/g, '').trim();
  if (!s) return null;

  // es-ES: miles con punto, decimales con coma (1.400,50) o solo coma (90,5).
  if (s.includes(',')) {
    const lastComma = s.lastIndexOf(',');
    const intDigits = s.slice(0, lastComma).replace(/\D/g, '');
    const decDigits = s.slice(lastComma + 1).replace(/\D/g, '').slice(0, 2);
    const base = intDigits || '0';
    const n = Number(decDigits ? `${base}.${decDigits}` : base);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
  }

  // Solo dígitos y puntos: "90.5" (decimal) o "1.400" (miles).
  const dots = (s.match(/\./g) || []).length;
  if (dots === 1) {
    const [left, right = ''] = s.split('.');
    const intDigits = left.replace(/\D/g, '');
    const decDigits = right.replace(/\D/g, '');
    // 1–2 decimales → decimal; 3 dígitos tras el punto → miles (1.400).
    if (decDigits.length > 0 && decDigits.length <= 2) {
      const n = Number(`${intDigits || '0'}.${decDigits}`);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.round(n * 100) / 100;
    }
  }

  const intDigits = s.replace(/\D/g, '');
  if (!intDigits) return null;
  const n = Number(intDigits);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function applyManualAggregatorTotals(
  rows: AggregatorCashRow[],
  manualByChannel: Record<string, string>,
  manualCashByChannel: Record<string, string> = {},
  manualCardByChannel: Record<string, string> = {},
): AggregatorCashRow[] {
  return rows.map((row) => {
    const ch = row.platform.channel;
    const parsedTotal = parseAggregatorAmount(manualByChannel[ch] ?? '');
    const parsedCash = parseAggregatorAmount(manualCashByChannel[ch] ?? '');
    const parsedCard = parseAggregatorAmount(manualCardByChannel[ch] ?? '');
    let cashSales = parsedCash != null ? parsedCash : row.cashSales;
    let cardSales = parsedCard != null ? parsedCard : row.cardSales;
    let totalSales = parsedTotal != null ? parsedTotal : row.totalSales;
    const declaredParts = Math.round((cashSales + cardSales) * 100) / 100;
    // Cierre manual (Pau): si no hay pedidos de apps en sistema (totalSales=0) pero sí
    // escriben efectivo/tarjeta, esos importes deben contar en «TOTAL DE TODO».
    // Antes se recortaban a totalSales y el total final salía sin apps.
    if (declaredParts > totalSales) {
      totalSales = declaredParts;
    }
    return {
      ...row,
      totalSales,
      cashSales,
      cardSales,
      manualOverride: parsedTotal != null || parsedCash != null || parsedCard != null,
    };
  });
}

export function sumAggregatorCash(rows: AggregatorCashRow[]): number {
  return Math.round(rows.reduce((s, r) => s + (Number(r.cashSales) || 0), 0) * 100) / 100;
}

export function sumAggregatorCard(rows: AggregatorCashRow[]): number {
  return Math.round(rows.reduce((s, r) => s + (Number(r.cardSales) || 0), 0) * 100) / 100;
}

function sessionWindowMs(session: TpvRegisterSession): { from: number; to: number } {
  const from = new Date(session.openedAt).getTime();
  const to = session.closedAt
    ? new Date(session.closedAt).getTime()
    : Date.now();
  return { from, to };
}

function orderInSessionWindow(order: DeliveryOrder, session: TpvRegisterSession): boolean {
  if (!orderInRegisterSession(order, session)) return false;
  if (isCancelledDeliveryOrder(order) || isRefundedDeliveryOrder(order)) return false;
  if (!isCompletedShiftOrder(order)) return false;
  const pdv = String(session.pointOfSaleId || '').trim();
  if (pdv) {
    const orderPdv = String(order.salesPointId || '').trim();
    if (orderPdv && orderPdv !== pdv) return false;
  }
  return true;
}

export function isAggregatorChannel(channel: string): boolean {
  return AGGREGATOR_PLATFORMS.some((p) => p.channel === channel);
}

function orderKeys(order: DeliveryOrder): { id: string; docId: string } {
  return {
    id: String(order.id || '').trim(),
    docId: String(order._id || '').trim(),
  };
}

function txMatchesPlatformTx(
  tx: { type: string; channel?: string; orderId?: string; linkedDeliveryOrderId?: string },
  platform: AggregatorPlatformDef,
  orderIdSet: Set<string>,
  orderDocIdSet: Set<string>,
): boolean {
  if (tx.type !== 'sale') return false;
  if (String(tx.channel || '') === platform.channel) return true;
  const linked = String(tx.linkedDeliveryOrderId || '').trim();
  const oid = String(tx.orderId || '').trim();
  if (linked && orderDocIdSet.has(linked)) return true;
  if (oid && orderIdSet.has(oid)) return true;
  return false;
}

function collectAggregatorMetricsForPlatform(
  platform: AggregatorPlatformDef,
  channelOrders: DeliveryOrder[],
  transactions: Array<{ type: string; channel?: string; amount?: number; orderId?: string; linkedDeliveryOrderId?: string }>,
): { totalSales: number; orderCount: number } {
  const orderIdSet = new Set(channelOrders.map((o) => orderKeys(o).id).filter(Boolean));
  const orderDocIdSet = new Set(channelOrders.map((o) => orderKeys(o).docId).filter(Boolean));
  const orderTotal = channelOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

  let extraTxTotal = 0;
  let extraTxCount = 0;
  for (const tx of transactions) {
    if (!txMatchesPlatformTx(tx, platform, orderIdSet, orderDocIdSet)) continue;
    if (String(tx.channel || '') !== platform.channel) continue;
    if (tx.linkedDeliveryOrderId && orderDocIdSet.has(String(tx.linkedDeliveryOrderId))) continue;
    if (tx.orderId && orderIdSet.has(String(tx.orderId))) continue;
    extraTxTotal += Number(tx.amount) || 0;
    extraTxCount += 1;
  }

  const totalSales = orderTotal + extraTxTotal;
  const orderCount = channelOrders.length + extraTxCount;
  return { totalSales, orderCount };
}

export function buildAggregatorCashRows(
  activePlatforms: AggregatorPlatformDef[],
  session: TpvRegisterSession,
  orders: DeliveryOrder[] = [],
): AggregatorCashRow[] {
  return activePlatforms.map((platform) => {
    const channelOrders = orders.filter(
      (o) => String(o.channel || '') === platform.channel && orderInSessionWindow(o, session),
    );
    const { totalSales, orderCount } = collectAggregatorMetricsForPlatform(
      platform,
      channelOrders,
      session.transactions || [],
    );
    return {
      platform,
      totalSales,
      cashSales: 0,
      cardSales: 0,
      orderCount,
      avgTicket: orderCount > 0 ? totalSales / orderCount : 0,
    };
  });
}

export function aggregatorRowsFromClosingTotals(
  platforms: AggregatorPlatformDef[],
  totals: Record<string, number> | undefined,
  cashByChannel?: Record<string, number> | undefined,
  cardByChannel?: Record<string, number> | undefined,
): AggregatorCashRow[] {
  return platforms.map((platform) => {
    const totalSales = Number(totals?.[platform.channel] || 0);
    const cashSales = Math.min(totalSales, Math.max(0, Number(cashByChannel?.[platform.channel] || 0)));
    const cardSales = Math.min(totalSales, Math.max(0, Number(cardByChannel?.[platform.channel] || 0)));
    return {
      platform,
      totalSales,
      cashSales,
      cardSales,
      orderCount: totalSales > 0 ? 1 : 0,
      avgTicket: totalSales,
      manualOverride: true,
    };
  });
}

export function sumAggregatorRows(rows: AggregatorCashRow[]): { totalSales: number; orderCount: number } {
  return rows.reduce(
    (acc, row) => ({
      totalSales: acc.totalSales + row.totalSales,
      orderCount: acc.orderCount + row.orderCount,
    }),
    { totalSales: 0, orderCount: 0 },
  );
}

export function buildDailyAggregatorRows(
  activePlatforms: AggregatorPlatformDef[],
  orders: DeliveryOrder[],
  dayKey: string,
  sessions: TpvRegisterSession[] = [],
): AggregatorCashRow[] {
  const daySessions = sessions.filter((s) => {
    const openDay = String(s.openedAt || '').slice(0, 10);
    const closeDay = String(s.closedAt || '').slice(0, 10);
    return openDay === dayKey || closeDay === dayKey;
  });
  const dayTransactions = daySessions.flatMap((s) => s.transactions || []);

  return activePlatforms.map((platform) => {
    const channelOrders = orders.filter((o) => {
      if (String(o.channel || '') !== platform.channel) return false;
      if (o.status === 'cancelled') return false;
      const day = String(o.createdAt || o.updatedAt || '').slice(0, 10);
      return day === dayKey;
    });
    const { totalSales, orderCount } = collectAggregatorMetricsForPlatform(
      platform,
      channelOrders,
      dayTransactions,
    );
    return {
      platform,
      totalSales,
      cashSales: 0,
      cardSales: 0,
      orderCount,
      avgTicket: orderCount > 0 ? totalSales / orderCount : 0,
    };
  });
}
