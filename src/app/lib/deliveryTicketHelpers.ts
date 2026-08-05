import type {
  DeliveryTicketBusinessInfo,
  DeliveryTicketPrintOptions,
  DeliveryTicketVariant,
  DeliveryOrderLike,
} from './deliveryTicketTypes';
import type { DeliveryOrderItem } from './deliveryApi';

/** Etiqueta cocina/ticket al quitar un ingrediente (nunca “menos” / “DE MENOS”). */
export function formatRemovedIngredientLabel(name: string): string {
  const n = String(name || '').trim();
  if (!n) return '';
  // Evitar "SIN SIN cebolla" si ya venía con prefijo.
  const bare = n.replace(/^(?:-\s*)?(?:sin\s+)/i, '').trim() || n;
  return `SIN ${bare}`;
}

/** Etiqueta cocina al añadir un extra de pago (nunca “DE MÁS” / “DE MAS”). */
export function formatKitchenExtraLabel(name: string): string {
  const n = String(name || '').trim();
  if (!n) return '';
  const bare =
    n
      .replace(/^(?:\+\s*)?(?:extra\s+(?:de\s+)?|de\s+m[aá]s\s+)/i, '')
      .trim() || n;
  return `EXTRA ${bare}`;
}

/** Parsea líneas guardadas: "SIN X", "- sin X", "- X". */
function parseRemovedIngredientLine(text: string): string | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const sinUpper = trimmed.match(/^SIN\s+(.+)$/i);
  if (sinUpper) return String(sinUpper[1] || '').trim() || null;
  const sinDash = trimmed.match(/^-\s*sin\s+(.+)$/i);
  if (sinDash) return String(sinDash[1] || '').trim() || null;
  if (trimmed.startsWith('-') && !trimmed.startsWith('+')) {
    const name = trimmed.slice(1).trim().replace(/^sin\s+/i, '').trim();
    return name || null;
  }
  return null;
}

/** Líneas de personalización guardadas en el ítem (+ extras, SIN ingrediente). */
export function orderItemCustomizationDetail(
  item: Pick<DeliveryOrderItem, 'extras' | 'ingredients'>,
): string[] {
  const lines: string[] = [];
  const removedKeys = new Set<string>();

  if (Array.isArray(item.ingredients)) {
    for (const ing of item.ingredients) {
      if (String(ing.quantity || '').toLowerCase() !== 'sin') continue;
      const name = String(ing.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (removedKeys.has(key)) continue;
      removedKeys.add(key);
      lines.push(formatRemovedIngredientLabel(name));
    }
  }

  if (Array.isArray(item.extras)) {
    for (const e of item.extras) {
      const text = String(e || '').trim();
      if (!text) continue;
      const removedName = parseRemovedIngredientLine(text);
      if (removedName) {
        const key = removedName.toLowerCase();
        // Ya está en ingredients (quantity:sin) o repetido en extras
        if (removedKeys.has(key)) continue;
        removedKeys.add(key);
        lines.push(formatRemovedIngredientLabel(removedName));
        continue;
      }
      lines.push(text);
    }
  }

  return lines;
}

export type OrderItemCustomizationParts = {
  /** Componentes del menú/combo (▸ pizza, guarnición…) y mitades (½). */
  composition: string[];
  added: string[];
  removed: string[];
  note: string;
};

/** Etiqueta legible para ticket (ASCII-safe en cocina). */
function compositionLabelFromExtra(trimmed: string): string | null {
  if (/^▸/.test(trimmed)) {
    const name = trimmed.replace(/^▸\s*/, '').trim();
    return name || null;
  }
  if (/^½/.test(trimmed) || /^1\s*\/\s*2\b/i.test(trimmed)) {
    const name = trimmed.replace(/^½\s*/, '').replace(/^1\s*\/\s*2\s*/i, '').trim();
    return name ? `1/2 ${name}` : null;
  }
  if (/^·/.test(trimmed)) {
    const name = trimmed.replace(/^·\s*/, '').trim();
    return name ? `Nota: ${name}` : null;
  }
  return null;
}

/** Desglose para UI e impresión (combo ▸, extras, sin ingredientes, nota cocina). */
export function orderItemCustomizationParts(
  item: Pick<DeliveryOrderItem, 'notes' | 'extras' | 'ingredients'>,
): OrderItemCustomizationParts {
  const composition: string[] = [];
  const compositionKeys = new Set<string>();
  const added: string[] = [];
  const removed: string[] = [];
  const removedKeys = new Set<string>();
  const addedKeys = new Set<string>();
  for (const line of orderItemCustomizationDetail(item)) {
    const trimmed = line.trim();
    const compositionLabel = compositionLabelFromExtra(trimmed);
    if (compositionLabel) {
      const key = compositionLabel.toLowerCase();
      if (compositionKeys.has(key)) continue;
      compositionKeys.add(key);
      composition.push(compositionLabel);
      continue;
    }
    if (trimmed.startsWith('+')) {
      const name = trimmed.slice(1).trim();
      const key = name.toLowerCase();
      if (!name || addedKeys.has(key)) continue;
      addedKeys.add(key);
      added.push(name);
      continue;
    }
    const removedName = parseRemovedIngredientLine(trimmed);
    if (removedName) {
      const key = removedName.toLowerCase();
      if (removedKeys.has(key)) continue;
      removedKeys.add(key);
      removed.push(removedName);
    }
  }
  return {
    composition,
    added,
    removed,
    note: String(item.notes || '').trim(),
  };
}

/** Notas de cocina / detalle: nota del ítem + menú + quitar + extras. */
export function orderItemKitchenNotes(
  item: Pick<DeliveryOrderItem, 'notes' | 'extras' | 'ingredients'>,
): string {
  const { composition, added, removed, note } = orderItemCustomizationParts(item);
  const lines = [
    ...composition.map((n) => `> ${n}`),
    ...added.map((n) => `+ ${n}`),
    ...removed.map((n) => formatRemovedIngredientLabel(n)),
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

/** Pedidos a domicilio (o sin tipo) → ticket cliente al salir a repartidor.
 * Recogida (pickup/takeaway) y sala (dine-in) → no ticket cliente automático.
 * Al marcar entregado no se imprime solo. */
export function shouldPrintCustomerTicketOnDispatch(
  order: Pick<DeliveryOrderLike, 'deliveryType'> | null | undefined,
): boolean {
  const t = String(order?.deliveryType || 'domicilio').trim().toLowerCase();
  return t !== 'recogida' && t !== 'sala';
}
