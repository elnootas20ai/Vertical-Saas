import type {
  DeliveryTicketBusinessInfo,
  DeliveryTicketPrintOptions,
  DeliveryTicketVariant,
  DeliveryOrderLike,
} from './deliveryTicketTypes';
import type { DeliveryOrderItem } from './deliveryApi';

/** Líneas de personalización guardadas en el ítem (+ extras, - sin ingrediente). */
export function orderItemCustomizationDetail(
  item: Pick<DeliveryOrderItem, 'extras' | 'ingredients'>,
): string[] {
  if (Array.isArray(item.extras) && item.extras.length > 0) {
    return item.extras.map((e) => String(e || '').trim()).filter(Boolean);
  }
  if (!Array.isArray(item.ingredients)) return [];
  return item.ingredients
    .filter((ing) => String(ing.quantity || '').toLowerCase() === 'sin')
    .map((ing) => `- sin ${ing.name}`);
}

export type OrderItemCustomizationParts = {
  added: string[];
  removed: string[];
  note: string;
};

/** Desglose para UI e impresión (extras, sin ingredientes, nota cocina). */
export function orderItemCustomizationParts(
  item: Pick<DeliveryOrderItem, 'notes' | 'extras' | 'ingredients'>,
): OrderItemCustomizationParts {
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of orderItemCustomizationDetail(item)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('+')) {
      added.push(trimmed.slice(1).trim());
    } else if (/^-\s*sin\s/i.test(trimmed)) {
      removed.push(trimmed.replace(/^-\s*sin\s*/i, '').trim());
    } else if (trimmed.startsWith('-')) {
      removed.push(trimmed.slice(1).trim());
    }
  }
  return { added, removed, note: String(item.notes || '').trim() };
}

/** Notas de cocina / detalle: nota del ítem + quitar + extras. */
export function orderItemKitchenNotes(
  item: Pick<DeliveryOrderItem, 'notes' | 'extras' | 'ingredients'>,
): string {
  const { added, removed, note } = orderItemCustomizationParts(item);
  const lines = [
    ...added.map((n) => `+ ${n}`),
    ...removed.map((n) => `- sin ${n}`),
    note,
  ].filter(Boolean);
  return lines.join(' · ');
}

type BusinessLike = {
  name?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  city?: string;
  phone?: string;
};

type ChargeTotalOrder = {
  totalAmount?: number;
  paidAmount?: number;
  paymentStatus?: string;
  paymentCollected?: boolean;
};

/** Importe a cobrar o ya cobrado (con descuento si lo hubo). */
export function resolveDeliveryOrderChargeTotal(order: ChargeTotalOrder): number {
  const total = Number(order.totalAmount || 0);
  const paid = Number(order.paidAmount || 0);
  const isPaid =
    order.paymentStatus === 'paid' ||
    Boolean(order.paymentCollected) ||
    (paid > 0 && total > 0 && paid >= total);
  if (isPaid && paid > 0) return paid;
  return total;
}

export function businessTicketInfoFrom(business: BusinessLike): DeliveryTicketBusinessInfo {
  return {
    name: business.name || '',
    legalName: business.legalName,
    taxId: business.taxId,
    address: business.address,
    city: business.city,
    phone: business.phone,
  };
}

export function buildOrderTicketOptions(
  order: DeliveryOrderLike,
  business: DeliveryTicketBusinessInfo,
  options?: {
    salesPointName?: string;
    cashierName?: string;
    variant?: DeliveryTicketVariant;
    isRefund?: boolean;
  },
): DeliveryTicketPrintOptions {
  return {
    order,
    business,
    salesPointName: options?.salesPointName ?? order.salesPointName,
    cashierName: options?.cashierName ?? order.takenByName,
    variant: options?.variant,
    isRefund: options?.isRefund,
  };
}
