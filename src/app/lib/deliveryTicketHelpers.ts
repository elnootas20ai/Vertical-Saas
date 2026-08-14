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

/** Un componente del menú (pizza, guarnición…) con sus extras debajo. */
export type CompositionBlock = {
  label: string;
  added: string[];
  removed: string[];
  note: string;
};

export type OrderItemCustomizationParts = {
  /** Etiquetas planas (compat / numerar menús repetidos). */
  composition: string[];
  /** Bloques anidados: extras/SIN van bajo la pizza que toca. */
  compositionBlocks: CompositionBlock[];
  /** Extras a nivel de línea (fuera de un ▸ / ½). */
  added: string[];
  removed: string[];
  note: string;
};

/** Etiqueta legible para ticket (ASCII-safe en cocina). Solo ▸ / ½ — no notas. */
function compositionLabelFromExtra(trimmed: string): string | null {
  if (/^▸/.test(trimmed)) {
    const name = trimmed.replace(/^▸\s*/, '').trim();
    // × de cantidad (Aquarius ×3) → x ASCII; la térmica si no imprime "?3".
    return name ? name.replace(/[×✕✖⨉]/g, 'x') : null;
  }
  if (/^½/.test(trimmed) || /^1\s*\/\s*2\b/i.test(trimmed)) {
    const name = trimmed.replace(/^½\s*/, '').replace(/^1\s*\/\s*2\s*/i, '').trim();
    return name ? `1/2 ${name.replace(/[×✕✖⨉]/g, 'x')}` : null;
  }
  return null;
}

function emptyCompositionBlock(label: string): CompositionBlock {
  return { label, added: [], removed: [], note: '' };
}

/** Desglose para UI e impresión (combo ▸, extras, sin ingredientes, nota cocina). */
export function orderItemCustomizationParts(
  item: Pick<DeliveryOrderItem, 'notes' | 'extras' | 'ingredients'>,
): OrderItemCustomizationParts {
  const compositionBlocks: CompositionBlock[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const removedKeys = new Set<string>();
  const addedKeys = new Set<string>();
  let currentBlock: CompositionBlock | null = null;

  const pushAdded = (name: string, intoBlock: CompositionBlock | null) => {
    const key = name.toLowerCase();
    if (!name) return;
    if (intoBlock) {
      if (intoBlock.added.some((x) => x.toLowerCase() === key)) return;
      intoBlock.added.push(name);
      return;
    }
    if (addedKeys.has(key)) return;
    addedKeys.add(key);
    added.push(name);
  };

  const pushRemoved = (name: string, intoBlock: CompositionBlock | null) => {
    const key = name.toLowerCase();
    if (!name) return;
    if (intoBlock) {
      if (intoBlock.removed.some((x) => x.toLowerCase() === key)) return;
      intoBlock.removed.push(name);
      return;
    }
    if (removedKeys.has(key)) return;
    removedKeys.add(key);
    removed.push(name);
  };

  for (const line of orderItemCustomizationDetail(item)) {
    const trimmed = line.trim();
    const compositionLabel = compositionLabelFromExtra(trimmed);
    if (compositionLabel) {
      // Cada ▸ es un bloque propio (2 Margaritas en el mismo menú no se fusionan).
      const block = emptyCompositionBlock(compositionLabel);
      compositionBlocks.push(block);
      // Mitades (½): extras siguientes son de la pizza entera, no de una sola mitad.
      currentBlock = /^1\/2\s/i.test(compositionLabel) ? null : block;
      continue;
    }
    if (/^·/.test(trimmed)) {
      const noteText = trimmed.replace(/^·\s*/, '').trim();
      if (!noteText) continue;
      if (currentBlock) {
        currentBlock.note = currentBlock.note
          ? `${currentBlock.note} · ${noteText}`
          : noteText;
      }
      continue;
    }
    if (trimmed.startsWith('+')) {
      pushAdded(trimmed.slice(1).trim(), currentBlock);
      continue;
    }
    const removedName = parseRemovedIngredientLine(trimmed);
    if (removedName) {
      pushRemoved(removedName, currentBlock);
    }
  }

  return {
    composition: compositionBlocks.map((b) => b.label),
    compositionBlocks,
    added,
    removed,
    note: String(item.notes || '').trim(),
  };
}

/** Notas de cocina / detalle: menú con extras bajo cada componente. */
export function orderItemKitchenNotes(
  item: Pick<DeliveryOrderItem, 'notes' | 'extras' | 'ingredients'>,
): string {
  const { compositionBlocks, added, removed, note } = orderItemCustomizationParts(item);
  const lines: string[] = [];
  for (const block of compositionBlocks) {
    lines.push(`> ${block.label}`);
    for (const n of block.added) lines.push(`  + ${n}`);
    for (const n of block.removed) lines.push(`  ${formatRemovedIngredientLabel(n)}`);
    if (block.note) lines.push(`  NOTA: ${block.note}`);
  }
  for (const n of added) lines.push(`+ ${n}`);
  for (const n of removed) lines.push(formatRemovedIngredientLabel(n));
  if (note) lines.push(note);
  return lines.filter(Boolean).join(' · ');
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
