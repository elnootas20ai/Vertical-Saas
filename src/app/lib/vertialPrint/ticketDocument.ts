import type { DeliveryTicketPrintOptions, DeliveryTicketVariant } from '../deliveryTicketTypes';
import { resolveDeliveryOrderChargeTotal, orderItemCustomizationParts } from '../deliveryTicketHelpers';

export interface TicketLine {
  qty: number;
  name: string;
  total: number;
  note?: string;
  /** Componentes del menú/combo (pizzas, guarnición, bebida…) y mitades. */
  composition?: string[];
  added?: string[];
  removed?: string[];
}

export interface TicketDocument {
  variant: DeliveryTicketVariant;
  title: string;
  ticketNo: string;
  dateLabel: string;
  issuer: string;
  taxId: string;
  addressLine: string;
  phone: string;
  salesPointName: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  /** true = envío a domicilio → dirección un poco más marcada en el ticket */
  emphasizeCustomerAddress: boolean;
  deliveryTypeLabel: string;
  cashierName: string;
  lines: TicketLine[];
  base: number;
  vat: number;
  vatRate: number;
  total: number;
  paymentLabel: string;
  paymentStatusLabel: string;
  refundReason: string;
  orderNotes: string;
  footer: string;
  isRefund: boolean;
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  online: 'Online',
  otro: 'Otro',
  otros: 'Otro',
};

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  domicilio: 'Envío a domicilio',
  recogida: 'Recogida en local',
};

/** Normaliza paymentMethod del pedido a etiqueta legible (Efectivo / Tarjeta…). */
export function resolveTicketPaymentMethodLabel(
  paymentMethod: string | undefined | null,
): string {
  const raw = String(paymentMethod || '').trim().toLowerCase();
  if (!raw) return '';
  return PAYMENT_LABELS[raw] || String(paymentMethod || '').trim();
}

/**
 * Cobro en ticket cliente/reparto. Cocina: vacío (no se imprime).
 * Si hay método (efectivo/tarjeta), siempre se muestra aunque el cobro esté pendiente.
 * En efectivo, si hay cambio de la calculadora → «Efectivo (2.50€)».
 */
export function resolveTicketPaymentFields(input: {
  variant: DeliveryTicketVariant;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  changeGiven?: number | null;
}): { paymentLabel: string; paymentStatusLabel: string } {
  if (input.variant === 'kitchen') {
    return { paymentLabel: '', paymentStatusLabel: '' };
  }
  const method = resolveTicketPaymentMethodLabel(input.paymentMethod);
  const isPaid = String(input.paymentStatus || '').toLowerCase() === 'paid';
  const paymentStatusLabel = isPaid ? 'Cobrado' : 'Pendiente de cobro';
  const change = Number(input.changeGiven);
  const withChange =
    method &&
    /efectivo/i.test(method) &&
    Number.isFinite(change) &&
    change > 0.001
      ? `${method} (${change.toFixed(2)}€)`
      : method;
  if (withChange) {
    return {
      paymentLabel: withChange,
      paymentStatusLabel,
    };
  }
  return {
    paymentLabel: isPaid ? 'Cobrado' : 'Pendiente',
    paymentStatusLabel,
  };
}

/**
 * Nombre que sale arriba del ticket (marca / comercial).
 * Caso Pau Royo / DISARMINK: en ticket debe verse "hoypecamos", no la razón social.
 */
export function resolveTicketIssuer(business: {
  name?: string;
  legalName?: string;
  taxId?: string;
}): string {
  const name = String(business.name || '').trim();
  const legal = String(business.legalName || '').trim();
  const taxId = String(business.taxId || '')
    .replace(/\s/g, '')
    .toUpperCase();
  if (
    taxId === 'B67284315' ||
    /disarmink/i.test(name) ||
    /disarmink/i.test(legal)
  ) {
    return 'hoypecamos';
  }
  // Preferir nombre comercial si difiere de la razón social
  if (name && legal && name.toLowerCase() !== legal.toLowerCase()) {
    return name;
  }
  return legal || name || 'Negocio';
}

/**
 * En ticket solo el nombre de pila (sin apellidos).
 * "pau royo del amor" → "pau"; "María García" → "María".
 */
export function ticketFirstName(value: string | undefined | null): string {
  const raw = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw || raw === '-') return raw || '-';
  const first = raw.split(' ')[0] || raw;
  return first;
}

export function splitTicketVat(total: number, vatRate: number) {
  const gross = Number(total || 0);
  const base = gross / (1 + vatRate / 100);
  const vat = gross - base;
  return { base, vat, gross };
}

export function buildTicketDocument({
  order,
  business,
  salesPointName,
  cashierName,
  vatRate = 10,
  isRefund = false,
  variant: requestedVariant,
}: DeliveryTicketPrintOptions): TicketDocument {
  const variant: DeliveryTicketVariant = isRefund
    ? 'customer'
    : (requestedVariant || 'customer');
  const amount = isRefund
    ? Number(order.refundAmount || order.paidAmount || order.totalAmount || 0)
    : resolveDeliveryOrderChargeTotal(order);
  const { base, vat } = splitTicketVat(amount, vatRate);
  const date = new Date(isRefund ? (order.refundedAt || order.updatedAt) : (order.paidAt || order.createdAt))
    .toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const deliveryType = String(order.deliveryType || '').trim().toLowerCase();
  const deliveryTypeLabel = DELIVERY_TYPE_LABELS[deliveryType] || order.deliveryType || '';
  const isPickup = deliveryType === 'recogida';
  const isHomeDelivery = deliveryType === 'domicilio';
  const isPaid = order.paymentStatus === 'paid';
  const { paymentLabel, paymentStatusLabel } = resolveTicketPaymentFields({
    variant,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    changeGiven: order.changeGiven,
  });

  const lines: TicketLine[] = (order.items || [])
    .map((item) => {
      const parts = orderItemCustomizationParts(item);
      return {
        qty: Number(item.quantity || 0),
        name: String(item.name || '').trim(),
        total: Number(item.total || 0),
        note: parts.note || undefined,
        composition: parts.composition.length > 0 ? parts.composition : undefined,
        added: parts.added.length > 0 ? parts.added : undefined,
        removed: parts.removed.length > 0 ? parts.removed : undefined,
      };
    })
    .filter((line) => line.name && line.qty > 0);

  const deliveryFee = Math.max(0, Number(order.deliveryFee || 0));
  if (deliveryFee > 0 && variant !== 'kitchen') {
    lines.push({
      qty: 1,
      name: 'Envio a domicilio',
      total: deliveryFee,
    });
  }

  // Recogida: no imprimir calle del cliente. Domicilio: sí, un poco más marcada.
  const customerAddress = isPickup
    ? ''
    : String(order.customerAddress || '').trim();

  const shared = {
    variant,
    ticketNo: order.ticketNumber || order.orderNumber || order._id.slice(-8),
    dateLabel: date,
    issuer: resolveTicketIssuer(business),
    taxId: business.taxId || '',
    addressLine: [business.address, business.city].filter(Boolean).join(', '),
    phone: business.phone || '',
    salesPointName: salesPointName || order.salesPointName || '',
    orderNumber: order.orderNumber || '',
    customerName: ticketFirstName(order.customerName || '-'),
    customerPhone: String(order.customerPhone || '').trim(),
    customerAddress,
    emphasizeCustomerAddress: Boolean(isHomeDelivery && customerAddress),
    deliveryTypeLabel,
    cashierName: ticketFirstName(cashierName || order.takenByName || ''),
    lines,
    base: variant === 'kitchen' ? 0 : base,
    vat: variant === 'kitchen' ? 0 : vat,
    vatRate,
    total: variant === 'kitchen' ? 0 : amount,
    paymentLabel,
    paymentStatusLabel,
    refundReason: isRefund ? (order.refundReason || '') : '',
    orderNotes: order.notes || '',
    isRefund: Boolean(isRefund),
  };

  if (variant === 'kitchen') {
    return {
      ...shared,
      title: 'COMANDA',
      footer: 'Comanda cocina / montaje',
    };
  }

  if (variant === 'delivery') {
    return {
      ...shared,
      title: 'REPARTO',
      footer: 'Hoja de reparto',
    };
  }

  return {
    ...shared,
    title: isRefund ? 'DEVOLUCION' : 'TICKET',
    footer: isPaid ? 'Ticket para el cliente' : 'Documento provisional (sin cobro)',
  };
}
