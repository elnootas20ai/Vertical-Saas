import type {
  ComandaStatus,
  DiningComanda,
  DiningOrder,
  RestaurantProductionArea,
} from '../../lib/salaApi';
import { orderItemCustomizationParts } from '../../lib/deliveryTicketHelpers';

/** Comanda de sala aplanada para el panel de cocina (KDS restaurante). */
export interface KitchenTicket {
  key: string;
  orderId: string;
  comandaId: string;
  comandaNumber: number;
  productionArea: RestaurantProductionArea;
  tableNumber: number;
  tableName: string;
  zone: string;
  status: ComandaStatus;
  sentToKitchenAt: string;
  preparationStartedAt: string;
  readyAt: string;
  notes: string;
  createdByName: string;
  items: {
    id: string;
    productId: string;
    name: string;
    quantity: number;
    notes: string;
    modifiers: string[];
    extras: string[];
    ingredients: { name: string; quantity: string }[];
  }[];
}

export function buildKitchenItemInstructions(item: KitchenTicket['items'][number]): {
  lines: string[];
  note: string;
} {
  const parts = orderItemCustomizationParts({
    notes: item.notes,
    extras: item.extras.length > 0 ? item.extras : item.modifiers,
    ingredients: item.ingredients,
  });
  const lines: string[] = [];
  for (const block of parts.compositionBlocks) {
    lines.push(`▸ ${block.label}`);
    for (const name of block.added) lines.push(`  + ${name}`);
    for (const name of block.removed) lines.push(`  SIN ${name}`);
    if (block.note) lines.push(`  · ${block.note}`);
  }
  for (const name of parts.added) lines.push(`+ ${name}`);
  for (const name of parts.removed) lines.push(`SIN ${name}`);
  return { lines, note: String(parts.note || '').trim() };
}

export const KITCHEN_ACTIVE_STATUSES: readonly ComandaStatus[] = [
  'sent_to_kitchen',
  'in_preparation',
  'ready',
];

/** Estado siguiente en el flujo de cocina; null si ya no avanza más aquí. */
export function nextKitchenStatus(status: ComandaStatus): ComandaStatus | null {
  if (status === 'sent_to_kitchen') return 'in_preparation';
  if (status === 'in_preparation') return 'ready';
  if (status === 'ready') return 'served';
  return null;
}

function isActiveDiningOrder(order: DiningOrder): boolean {
  return order.status === 'open' || order.status === 'served' || order.status === 'pending_payment';
}

export function kitchenVisibleOrderNote(value: string): string {
  return String(value || '')
    .replace(/\[public-order:[^\]]+\]\s*/gi, '')
    .trim();
}

function comandaToTicket(order: DiningOrder, comanda: DiningComanda): KitchenTicket {
  return {
    key: `${order._id}:${comanda.id}`,
    orderId: order._id,
    comandaId: comanda.id,
    comandaNumber: Number(comanda.orderNumber) || 0,
    productionArea: comanda.productionArea === 'bar' ? 'bar' : 'kitchen',
    tableNumber: Number(order.tableNumber) || 0,
    tableName: order.tableName || '',
    zone: order.zone || '',
    status: comanda.status,
    sentToKitchenAt: comanda.sentToKitchenAt || comanda.createdAt || '',
    preparationStartedAt: comanda.preparationStartedAt || '',
    readyAt: comanda.readyAt || '',
    notes: kitchenVisibleOrderNote(comanda.notes || ''),
    createdByName: comanda.createdByName || '',
    items: (comanda.items || [])
      .filter((item) => item.status !== 'cancelled')
      .map((item) => {
        const extras = Array.isArray(item.extras) && item.extras.length > 0
          ? item.extras
          : (item.modifiers || []);
        return {
          id: item.id,
          productId: String(item.productId || '').trim(),
          name: item.name,
          quantity: Number(item.quantity) || 1,
          notes: item.notes || '',
          modifiers: item.modifiers || extras,
          extras,
          ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
        };
      }),
  };
}

/**
 * Aplana pedidos de sala en tickets de cocina activos, más antiguos primero.
 *
 * Qué entra en cocina (origen: TPV sala):
 * - Comandas con status `sent_to_kitchen` | `in_preparation` | `ready`
 * - De pedidos de sala abiertos (mesa), filtrados por empresa activa
 * - Ítems no cancelados de esa comanda
 *
 * Qué NO entra:
 * - Pedidos Delivery / KDS delivery
 * - Borradores de comanda no enviados
 * - Comandas ya servidas o canceladas
 */
export function buildKitchenTickets(
  orders: DiningOrder[],
  scopeBusinessId?: string,
  productionArea: RestaurantProductionArea = 'kitchen',
): KitchenTicket[] {
  const scope = String(scopeBusinessId || '').trim();
  const tickets: KitchenTicket[] = [];
  for (const order of orders || []) {
    if (!isActiveDiningOrder(order)) continue;
    if (scope && order.businessId && order.businessId !== scope) continue;
    for (const comanda of order.comandas || []) {
      if (!KITCHEN_ACTIVE_STATUSES.includes(comanda.status)) continue;
      const ticket = comandaToTicket(order, comanda);
      if (ticket.productionArea !== productionArea) continue;
      if (ticket.items.length === 0) continue;
      tickets.push(ticket);
    }
  }
  return tickets.sort((a, b) => a.sentToKitchenAt.localeCompare(b.sentToKitchenAt));
}

/** Al bajar de PRO, las comandas de Barra ya activas siguen visibles en Cocina. */
export function buildAccessibleKitchenTickets(
  orders: DiningOrder[],
  scopeBusinessId: string | undefined,
  productionArea: RestaurantProductionArea,
  hasProAccess: boolean,
): KitchenTicket[] {
  if (hasProAccess) {
    return buildKitchenTickets(orders, scopeBusinessId, productionArea);
  }
  return [
    ...buildKitchenTickets(orders, scopeBusinessId, 'kitchen'),
    ...buildKitchenTickets(orders, scopeBusinessId, 'bar'),
  ].sort((a, b) => a.sentToKitchenAt.localeCompare(b.sentToKitchenAt));
}

/** Minutos transcurridos desde que la comanda entró en cocina. */
export function kitchenTicketMinutes(ticket: KitchenTicket, nowMs: number): number {
  const sent = Date.parse(ticket.sentToKitchenAt);
  if (Number.isNaN(sent)) return 0;
  return Math.max(0, Math.floor((nowMs - sent) / 60000));
}

/** Tiempo transcurrido en el estado actual, con fallback para comandas históricas. */
export function kitchenTicketStatusMinutes(ticket: KitchenTicket, nowMs: number): number {
  const statusStartedAt =
    ticket.status === 'ready'
      ? ticket.readyAt || ticket.preparationStartedAt || ticket.sentToKitchenAt
      : ticket.status === 'in_preparation'
        ? ticket.preparationStartedAt || ticket.sentToKitchenAt
        : ticket.sentToKitchenAt;
  const started = Date.parse(statusStartedAt);
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((nowMs - started) / 60000));
}

export function kitchenTicketTimerLabel(ticket: KitchenTicket, nowMs: number): string {
  const minutes = kitchenTicketStatusMinutes(ticket, nowMs);
  const value = minutes < 1
    ? 'ahora'
    : minutes < 60
      ? `${minutes} min`
      : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  if (ticket.status === 'ready') return `Lista hace ${value}`;
  if (ticket.status === 'in_preparation') return `Preparando ${value}`;
  return `Esperando ${value}`;
}
