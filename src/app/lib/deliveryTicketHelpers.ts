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
  const lines: string[] = [];
  if (Array.isArray(item.extras)) {
    for (const e of item.extras) {
      const text = String(e || '').trim();
      if (text) lines.push(text);
    }
  }
  if (Array.isArray(item.ingredients)) {
    for (const ing of item.ingredients) {
      if (String(ing.quantity || '').toLowerCase() !== 'sin') continue;
      const name = String(ing.name || '').trim();
      if (name) lines.push(`- sin ${name}`);
    }
  }
  return lines;
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

/** Teléfono legible para ticket (prefijo + número). */
export function formatTicketCustomerPhone(
  phone?: string | null,
  phonePrefix?: string | null,
): string {
  const digits = String(phone || '').trim();
  if (!digits) return '';
  const prefix = String(phonePrefix || '').trim();
  if (!prefix) return digits;
  if (digits.startsWith('+') || digits.startsWith(prefix)) return digits;
  return `${prefix} ${digits}`.replace(/\s+/g, ' ').trim();
}

/** Calle + CP + ciudad en una sola línea para el ticket. */
export function formatTicketCustomerAddress(parts: {
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  fallback?: string | null;
}): string {
  const street = String(parts.street || '').trim();
  const postal = String(parts.postalCode || '').trim();
  const city = String(parts.city || '').trim();
  const composed = [street, [postal, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (composed) return composed;
  return String(parts.fallback || '').trim();
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
