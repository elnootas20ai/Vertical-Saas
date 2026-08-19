import type { ComandaStatus, DiningComanda, DiningOrder } from '../../lib/salaApi';

/** Comanda de sala aplanada para el panel de cocina (KDS restaurante). */
export interface KitchenTicket {
  key: string;
  orderId: string;
  comandaId: string;
  comandaNumber: number;
  tableNumber: number;
  tableName: string;
  zone: string;
  status: ComandaStatus;
  sentToKitchenAt: string;
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

function comandaToTicket(order: DiningOrder, comanda: DiningComanda): KitchenTicket {
  return {
    key: `${order._id}:${comanda.id}`,
    orderId: order._id,
    comandaId: comanda.id,
    comandaNumber: Number(comanda.orderNumber) || 0,
    tableNumber: Number(order.tableNumber) || 0,
    tableName: order.tableName || '',
    zone: order.zone || '',
    status: comanda.status,
    sentToKitchenAt: comanda.sentToKitchenAt || comanda.createdAt || '',
    notes: comanda.notes || '',
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
): KitchenTicket[] {
  const scope = String(scopeBusinessId || '').trim();
  const tickets: KitchenTicket[] = [];
  for (const order of orders || []) {
    if (!isActiveDiningOrder(order)) continue;
    if (scope && order.businessId && order.businessId !== scope) continue;
    for (const comanda of order.comandas || []) {
      if (!KITCHEN_ACTIVE_STATUSES.includes(comanda.status)) continue;
      const ticket = comandaToTicket(order, comanda);
      if (ticket.items.length === 0) continue;
      tickets.push(ticket);
    }
  }
  return tickets.sort((a, b) => a.sentToKitchenAt.localeCompare(b.sentToKitchenAt));
}

/** Minutos transcurridos desde que la comanda entró en cocina. */
export function kitchenTicketMinutes(ticket: KitchenTicket, nowMs: number): number {
  const sent = Date.parse(ticket.sentToKitchenAt);
  if (Number.isNaN(sent)) return 0;
  return Math.max(0, Math.floor((nowMs - sent) / 60000));
}
