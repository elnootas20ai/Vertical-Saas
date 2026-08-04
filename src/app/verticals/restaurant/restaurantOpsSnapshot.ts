/**
 * Agregados del Centro operativo bar/restaurante (solo sala/caja).
 * No usa DeliveryOps ni /api/delivery/ops-center.
 */
import type { Brand } from '../../lib/brandsApi';
import { brandsForBilling } from '../../lib/brandBillingConfig';
import { isDefaultBrandNamePlaceholder, isDefaultCommercialBrand } from '../../lib/brandUtils';
import type { DiningOrder, DiningTable, DiningTableStatus, SalaRoomConfig } from '../../lib/salaApi';
import type { TpvRegisterSession } from '../../lib/deliveryApi';
import { attributeOrderRevenueByBrand } from '../../../../shared/delivery/orderLineRevenueSplit.js';
import {
  buildKitchenTickets,
  kitchenTicketMinutes,
  type KitchenTicket,
} from './restaurantKitchen';

const OCCUPIED: ReadonlySet<DiningTableStatus> = new Set([
  'occupied',
  'pending_order',
  'served',
  'pending_payment',
]);

export type RestaurantOpsPipelineKey =
  | 'free'
  | 'occupied'
  | 'kitchen'
  | 'ready'
  | 'to_pay';

export type RestaurantOpsPipeline = Record<RestaurantOpsPipelineKey, number>;

export type RestaurantOpsAlert = {
  id: string;
  severity: 'warn' | 'danger';
  title: string;
  detail: string;
  href: string;
};

export type RestaurantOpsBrandRow = {
  id: string;
  label: string;
  amount: number;
};

export type RestaurantOpsTableDwell = {
  tableId: string;
  tableLabel: string;
  status: 'open' | 'closed';
  guests: number;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
};

export type RestaurantOpsSnapshot = {
  pipeline: RestaurantOpsPipeline;
  tablesTotal: number;
  guests: number;
  openOrders: number;
  kitchenTickets: number;
  kitchenOvertime: number;
  paidTodayEuro: number;
  cashOpen: number;
  waitlistActive: number;
  alerts: RestaurantOpsAlert[];
  /** 0 = no mostrar; 1 = una marca; 2+ = varias (como delivery). */
  brands: RestaurantOpsBrandRow[];
  /** Mesas ocupadas ahora + cerradas hoy, con minutos sentados → salida. */
  tableDwells: RestaurantOpsTableDwell[];
  avgClosedDwellMinutes: number | null;
};

function isVisibleTable(t: DiningTable): boolean {
  if (t.active === false || t.visible === false) return false;
  if (t.status === 'hidden' || t.status === 'unavailable') return false;
  return true;
}

function orderBusinessOk(order: DiningOrder, businessId?: string): boolean {
  const scope = String(businessId || '').trim();
  if (!scope) return true;
  const bid = String(order.businessId || '').trim();
  return !bid || bid === scope;
}

function tableBusinessOk(table: DiningTable, businessId?: string): boolean {
  const scope = String(businessId || '').trim();
  if (!scope) return true;
  const bid = String(table.businessId || '').trim();
  return !bid || bid === scope;
}

/** Resuelve el PDV de una mesa vía zona (rooms del plano). */
export function resolveTablePdvId(
  table: Pick<DiningTable, 'roomId' | 'zone'>,
  rooms: Array<Pick<SalaRoomConfig, 'id' | 'name' | 'pdvId'>> = [],
): string {
  const roomId = String(table.roomId || '').trim();
  const zone = String(table.zone || '').trim().toLowerCase();
  const room =
    (roomId ? rooms.find((r) => String(r.id || '').trim() === roomId) : undefined)
    || (zone
      ? rooms.find((r) => String(r.name || '').trim().toLowerCase() === zone)
      : undefined);
  return String(room?.pdvId || '').trim();
}

/**
 * Filtra mesas/comandas/turnos de un local (PDV).
 * Misma regla que el plano TPV: zona sin pdvId cuenta para todos.
 */
export function scopeRestaurantOpsByPdv(input: {
  tables: DiningTable[];
  orders: DiningOrder[];
  sessions: TpvRegisterSession[];
  rooms?: Array<Pick<SalaRoomConfig, 'id' | 'name' | 'pdvId'>>;
  pdvId?: string | null;
}): {
  tables: DiningTable[];
  orders: DiningOrder[];
  sessions: TpvRegisterSession[];
} {
  const pdvId = String(input.pdvId || '').trim();
  const rooms = input.rooms || [];
  if (!pdvId) {
    return {
      tables: input.tables || [],
      orders: input.orders || [],
      sessions: input.sessions || [],
    };
  }

  const tables = (input.tables || []).filter((t) => {
    const tablePdv = resolveTablePdvId(t, rooms);
    return !tablePdv || tablePdv === pdvId;
  });
  const tableIds = new Set(
    tables.map((t) => String(t._id || t.id || '').trim()).filter(Boolean),
  );
  const roomNames = new Set(
    rooms
      .filter((r) => {
        const rp = String(r.pdvId || '').trim();
        return !rp || rp === pdvId;
      })
      .map((r) => String(r.name || '').trim().toLowerCase())
      .filter(Boolean),
  );

  const orders = (input.orders || []).filter((o) => {
    const tid = String(o.tableId || '').trim();
    if (tid && tableIds.has(tid)) return true;
    const zone = String(o.zone || '').trim().toLowerCase();
    if (zone && roomNames.has(zone)) return true;
    // Sin mesa/zona: no mezclar en vistas multi-PDV.
    return false;
  });

  const sessions = (input.sessions || []).filter((s) => {
    const sid = String(
      (s as TpvRegisterSession & { salesPointId?: string }).pointOfSaleId
        || (s as TpvRegisterSession & { salesPointId?: string }).salesPointId
        || '',
    ).trim();
    return !sid || sid === pdvId;
  });

  return { tables, orders, sessions };
}

function paidTodayTotal(orders: DiningOrder[], dayKey: string): number {
  let sum = 0;
  for (const order of orders) {
    if (order.status !== 'paid' && order.status !== 'closed') continue;
    for (const pay of order.payments || []) {
      const at = String(pay.paidAt || '').slice(0, 10);
      if (at === dayKey) sum += Number(pay.amount) || 0;
    }
    if ((order.payments || []).length === 0) {
      const end = String(order.closedAt || order.paidAt || '').slice(0, 10);
      if (end === dayKey) sum += Number(order.total) || 0;
    }
  }
  return Math.round(sum * 100) / 100;
}

function opsBrands(brands: Brand[] | null | undefined): Brand[] {
  return brandsForBilling(brands || []).filter(
    (b) => !(isDefaultCommercialBrand(b) && isDefaultBrandNamePlaceholder(b.name)),
  );
}

function diningOrderToBrandSplitInput(order: DiningOrder) {
  const items = (order.comandas || []).flatMap((c) =>
    (c.items || [])
      .filter((it) => it.status !== 'cancelled')
      .map((it) => ({
        brandIds: Array.isArray(it.brandIds) ? it.brandIds : [],
        quantity: Number(it.quantity) || 0,
        unitPrice: Number(it.price) || 0,
        total: (Number(it.price) || 0) * (Number(it.quantity) || 0),
        category: it.category || '',
        name: it.name || '',
      })),
  );
  return { items, total: Number(order.total) || 0 };
}

export function buildRestaurantOpsBrandRows(
  orders: DiningOrder[],
  brands: Brand[] | null | undefined,
  dayKey: string,
): RestaurantOpsBrandRow[] {
  const eligible = opsBrands(brands);
  if (eligible.length === 0) return [];

  const labels = new Map(
    eligible.map((b) => [String(b._id || b.id || '').trim(), String(b.name || '').trim()] as const),
  );
  const amounts = new Map<string, number>();
  for (const b of eligible) {
    const id = String(b._id || b.id || '').trim();
    if (id) amounts.set(id, 0);
  }

  const dayOrders = orders.filter((o) => {
    if (o.status !== 'paid' && o.status !== 'closed') return false;
    const end = String(o.closedAt || o.paidAt || '').slice(0, 10);
    if (end === dayKey) return true;
    return (o.payments || []).some((p) => String(p.paidAt || '').slice(0, 10) === dayKey);
  });

  if (eligible.length === 1) {
    const only = String(eligible[0]._id || eligible[0].id || '').trim();
    const total = paidTodayTotal(dayOrders, dayKey);
    return [{
      id: only,
      label: labels.get(only) || eligible[0].name || 'Marca',
      amount: total,
    }];
  }

  for (const order of dayOrders) {
    const { byBrand } = attributeOrderRevenueByBrand(diningOrderToBrandSplitInput(order));
    for (const [bid, amt] of Object.entries(byBrand || {})) {
      const id = String(bid || '').trim();
      if (!id || !amounts.has(id)) continue;
      amounts.set(id, Math.round(((amounts.get(id) || 0) + (Number(amt) || 0)) * 100) / 100);
    }
  }

  return eligible
    .map((b) => {
      const id = String(b._id || b.id || '').trim();
      return {
        id,
        label: labels.get(id) || b.name || id,
        amount: amounts.get(id) || 0,
      };
    })
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'es'));
}

function minutesBetween(startIso: string, endMs: number): number {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start) || start <= 0) return 0;
  return Math.max(0, Math.floor((endMs - start) / 60_000));
}

function tableLabel(table?: DiningTable | null, order?: DiningOrder | null): string {
  if (table?.name) return table.name;
  if (table?.number) return `Mesa ${table.number}`;
  if (order?.tableName) return order.tableName;
  if (order?.tableNumber) return `Mesa ${order.tableNumber}`;
  return 'Mesa';
}

export function buildRestaurantOpsTableDwells(input: {
  tables: DiningTable[];
  orders: DiningOrder[];
  dayKey: string;
  nowMs?: number;
}): { dwells: RestaurantOpsTableDwell[]; avgClosedMinutes: number | null } {
  const nowMs = input.nowMs ?? Date.now();
  const tables = input.tables || [];
  const orders = input.orders || [];
  const byTableId = new Map(tables.map((t) => [String(t._id || t.id || ''), t] as const));

  const openOrders = orders.filter((o) =>
    o.status === 'open' || o.status === 'served' || o.status === 'pending_payment',
  );
  const dwells: RestaurantOpsTableDwell[] = [];

  for (const order of openOrders) {
    const tid = String(order.tableId || '').trim();
    const table = byTableId.get(tid);
    const startedAt = String(
      table?.occupiedAt || order.createdAt || '',
    ).trim();
    if (!startedAt) continue;
    dwells.push({
      tableId: tid || order._id,
      tableLabel: tableLabel(table, order),
      status: 'open',
      guests: Math.max(0, Number(table?.currentGuests || order.guests) || 0),
      startedAt,
      endedAt: null,
      minutes: minutesBetween(startedAt, nowMs),
    });
  }

  // Mesas ocupadas sin pedido aún (solo sentados).
  for (const table of tables) {
    if (!OCCUPIED.has(table.status)) continue;
    const tid = String(table._id || table.id || '');
    if (dwells.some((d) => d.tableId === tid && d.status === 'open')) continue;
    const startedAt = String(table.occupiedAt || '').trim();
    if (!startedAt) continue;
    dwells.push({
      tableId: tid,
      tableLabel: tableLabel(table, null),
      status: 'open',
      guests: Math.max(0, Number(table.currentGuests) || 0),
      startedAt,
      endedAt: null,
      minutes: minutesBetween(startedAt, nowMs),
    });
  }

  const closedToday = orders.filter((o) => {
    if (o.status !== 'paid' && o.status !== 'closed') return false;
    const end = String(o.closedAt || o.paidAt || '').slice(0, 10);
    return end === input.dayKey;
  });

  for (const order of closedToday) {
    const startedAt = String(order.createdAt || '').trim();
    const endedAt = String(order.closedAt || order.paidAt || '').trim();
    if (!startedAt || !endedAt) continue;
    const endMs = Date.parse(endedAt);
    if (!Number.isFinite(endMs)) continue;
    const tid = String(order.tableId || order._id);
    const table = byTableId.get(String(order.tableId || ''));
    dwells.push({
      tableId: tid,
      tableLabel: tableLabel(table, order),
      status: 'closed',
      guests: Math.max(0, Number(order.guests) || 0),
      startedAt,
      endedAt,
      minutes: minutesBetween(startedAt, endMs),
    });
  }

  dwells.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.minutes - a.minutes;
  });

  const closedMins = dwells.filter((d) => d.status === 'closed').map((d) => d.minutes);
  const avgClosedMinutes = closedMins.length
    ? Math.round(closedMins.reduce((s, n) => s + n, 0) / closedMins.length)
    : null;

  return { dwells, avgClosedMinutes };
}

export function formatDwellMinutes(mins: number): string {
  const m = Math.max(0, Math.floor(Number(mins) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function buildRestaurantOpsSnapshot(input: {
  tables: DiningTable[];
  orders: DiningOrder[];
  sessions: TpvRegisterSession[];
  brands?: Brand[] | null;
  waitlistActiveCount?: number;
  businessId?: string;
  dayKey: string;
  nowMs?: number;
  kitchenOvertimeMinutes?: number;
}): RestaurantOpsSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const overtimeMin = input.kitchenOvertimeMinutes ?? 20;
  const businessId = input.businessId;
  const tables = (input.tables || []).filter(
    (t) => isVisibleTable(t) && tableBusinessOk(t, businessId),
  );
  const orders = (input.orders || []).filter((o) => orderBusinessOk(o, businessId));
  const sessions = (input.sessions || []).filter((s) => {
    const scope = String(businessId || '').trim();
    if (!scope) return true;
    const bid = String(
      (s as TpvRegisterSession & { businessId?: string }).business_id
        || (s as TpvRegisterSession & { businessId?: string }).businessId
        || '',
    ).trim();
    return !bid || bid === scope;
  });

  const free = tables.filter((t) => t.status === 'available' || t.status === 'reserved').length;
  const occupied = tables.filter((t) => OCCUPIED.has(t.status)).length;
  const toPay = tables.filter((t) => t.status === 'pending_payment').length
    + orders.filter((o) => o.status === 'pending_payment').length;

  const tickets = buildKitchenTickets(orders, businessId);
  const kitchen = tickets.filter((t) =>
    t.status === 'sent_to_kitchen' || t.status === 'in_preparation',
  ).length;
  const ready = tickets.filter((t) => t.status === 'ready').length;
  const kitchenOvertime = tickets.filter((t) => kitchenTicketMinutes(t, nowMs) >= overtimeMin).length;

  const openOrders = orders.filter((o) =>
    o.status === 'open' || o.status === 'served' || o.status === 'pending_payment',
  ).length;
  const guests = tables
    .filter((t) => OCCUPIED.has(t.status))
    .reduce((s, t) => s + Math.max(0, Number(t.currentGuests) || 0), 0);

  const cashOpen = sessions.filter((s) => String(s.status || '').toLowerCase() === 'open').length;
  const waitlistActive = Math.max(0, Number(input.waitlistActiveCount) || 0);
  const paidTodayEuro = paidTodayTotal(orders, input.dayKey);
  const brands = buildRestaurantOpsBrandRows(orders, input.brands, input.dayKey);
  const { dwells: tableDwells, avgClosedMinutes: avgClosedDwellMinutes } = buildRestaurantOpsTableDwells({
    tables,
    orders,
    dayKey: input.dayKey,
    nowMs,
  });

  const alerts: RestaurantOpsAlert[] = [];
  if (kitchenOvertime > 0) {
    alerts.push({
      id: 'kitchen-overtime',
      severity: 'danger',
      title: 'Cocina atrasada',
      detail: `${kitchenOvertime} comanda${kitchenOvertime === 1 ? '' : 's'} con más de ${overtimeMin} min`,
      href: '/saas/cocina',
    });
  }
  if (cashOpen === 0 && occupied > 0) {
    alerts.push({
      id: 'cash-closed',
      severity: 'warn',
      title: 'Caja cerrada',
      detail: 'Hay mesas ocupadas y no hay turno de caja abierto. Ábrelo en el TPV de sala.',
      href: '/saas/caja/tpv',
    });
  }
  if (toPay > 0) {
    alerts.push({
      id: 'to-pay',
      severity: 'warn',
      title: 'Pendiente de cobro',
      detail: `${toPay} mesa${toPay === 1 ? '' : 's'} / cuenta${toPay === 1 ? '' : 's'} por cobrar`,
      href: '/saas/caja/tpv',
    });
  }
  if (waitlistActive > 0) {
    alerts.push({
      id: 'waitlist',
      severity: 'warn',
      title: 'Lista de espera',
      detail: `${waitlistActive} grupo${waitlistActive === 1 ? '' : 's'} esperando mesa`,
      href: '/saas/lista-espera',
    });
  }

  return {
    pipeline: { free, occupied, kitchen, ready, to_pay: toPay },
    tablesTotal: tables.length,
    guests,
    openOrders,
    kitchenTickets: tickets.length,
    kitchenOvertime,
    paidTodayEuro,
    cashOpen,
    waitlistActive,
    alerts,
    brands,
    tableDwells,
    avgClosedDwellMinutes,
  };
}

export function kitchenTicketsForOps(
  orders: DiningOrder[],
  businessId?: string,
): KitchenTicket[] {
  return buildKitchenTickets(orders, businessId);
}
