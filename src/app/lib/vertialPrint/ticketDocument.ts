import type { DeliveryTicketPrintOptions, DeliveryTicketVariant } from '../deliveryTicketTypes';
import { resolveDeliveryOrderChargeTotal, orderItemCustomizationParts } from '../deliveryTicketHelpers';

export interface TicketLine {
  qty: number;
  name: string;
  total: number;
  note?: string;
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
};

const DELIVERY_TYPE_LABELS: Record<string, string> = {
  domicilio: 'Envío a domicilio',
  recogida: 'Recogida en local',
};

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
  vatRate = 21,
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
  const deliveryTypeLabel = DELIVERY_TYPE_LABELS[order.deliveryType || ''] || order.deliveryType || '';
  const paymentMethodLabel = PAYMENT_LABELS[order.paymentMethod || ''] || order.paymentMethod || '';
  const isPaid = order.paymentStatus === 'paid';
  const paymentStatusLabel = isPaid ? 'Cobrado' : 'Pendiente de cobro';
  const paymentLabel = isPaid
    ? paymentMethodLabel || 'Cobrado'
    : (variant === 'customer' ? 'Pendiente' : '-');

  const lines: TicketLine[] = (order.items || []).map((item) => {
    const parts = orderItemCustomizationParts(item);
    return {
      qty: Number(item.quantity || 0),
      name: item.name || '',
      total: Number(item.total || 0),
      note: parts.note || undefined,
      added: parts.added.length > 0 ? parts.added : undefined,
      removed: parts.removed.length > 0 ? parts.removed : undefined,
    };
  });

  const shared = {
    variant,
    ticketNo: order.ticketNumber || order.orderNumber || order._id.slice(-8),
    dateLabel: date,
    issuer: business.legalName || business.name || 'Negocio',
    taxId: business.taxId || '',
    addressLine: [business.address, business.city].filter(Boolean).join(', '),
    phone: business.phone || '',
    salesPointName: salesPointName || order.salesPointName || '',
    orderNumber: order.orderNumber || '',
    customerName: order.customerName || '-',
    customerPhone: order.customerPhone || '',
    customerAddress: order.customerAddress || '',
    deliveryTypeLabel,
    cashierName: cashierName || order.takenByName || '',
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
    footer: isPaid ? 'Documento interno de venta' : 'Documento provisional (sin cobro)',
  };
}
