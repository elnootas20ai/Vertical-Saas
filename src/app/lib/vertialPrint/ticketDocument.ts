import type { DeliveryTicketPrintOptions } from '../deliveryTicketTypes';

export interface TicketDocument {
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
  cashierName: string;
  lines: Array<{ qty: number; name: string; total: number }>;
  base: number;
  vat: number;
  vatRate: number;
  total: number;
  paymentLabel: string;
  refundReason: string;
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
}: DeliveryTicketPrintOptions): TicketDocument {
  const amount = isRefund
    ? Number(order.refundAmount || order.paidAmount || order.totalAmount || 0)
    : Number(order.totalAmount || 0);
  const { base, vat } = splitTicketVat(amount, vatRate);
  const date = new Date(isRefund ? (order.refundedAt || order.updatedAt) : (order.paidAt || order.createdAt))
    .toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

  return {
    title: isRefund ? 'DEVOLUCION' : 'TICKET',
    ticketNo: order.ticketNumber || order.orderNumber || order._id.slice(-8),
    dateLabel: date,
    issuer: business.legalName || business.name || 'Negocio',
    taxId: business.taxId || '',
    addressLine: [business.address, business.city].filter(Boolean).join(', '),
    phone: business.phone || '',
    salesPointName: salesPointName || order.salesPointName || '',
    orderNumber: order.orderNumber || '',
    customerName: order.customerName || '-',
    cashierName: cashierName || order.takenByName || '',
    lines: (order.items || []).map((item) => ({
      qty: Number(item.quantity || 0),
      name: item.name || '',
      total: Number(item.total || 0),
    })),
    base,
    vat,
    vatRate,
    total: amount,
    paymentLabel: PAYMENT_LABELS[order.paymentMethod || ''] || order.paymentMethod || '-',
    refundReason: isRefund ? (order.refundReason || '') : '',
    footer: 'Documento interno de venta',
    isRefund: Boolean(isRefund),
  };
}
