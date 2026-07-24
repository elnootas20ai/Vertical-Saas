export interface DeliveryTicketBusinessInfo {
  name: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  city?: string;
  phone?: string;
}

export type DeliveryTicketVariant = 'customer' | 'kitchen' | 'delivery';

export interface DeliveryOrderLike {
  _id: string;
  orderNumber?: string;
  ticketNumber?: string;
  /** PDV del pedido: permite resolver su impresora aunque no haya sesión TPV activa. */
  salesPointId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryType?: string;
  salesPointName?: string;
  takenByName?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  /** Importe recibido en efectivo (calculadora de cambio TPV). */
  amountReceived?: number;
  /** Cambio dado al cliente (calculadora de cambio TPV). */
  changeGiven?: number;
  totalAmount?: number;
  paidAmount?: number;
  /** Gastos de envío (domicilio); van en el total pero deben verse como línea. */
  deliveryFee?: number;
  refundAmount?: number;
  refundReason?: string;
  paidAt?: string;
  createdAt?: string;
  updatedAt?: string;
  refundedAt?: string;
  notes?: string;
  items?: Array<{
    quantity?: number;
    name?: string;
    total?: number;
    notes?: string;
    extras?: string[];
    ingredients?: { name: string; quantity: string }[];
  }>;
}

export interface DeliveryTicketPrintOptions {
  order: DeliveryOrderLike;
  business: DeliveryTicketBusinessInfo;
  salesPointName?: string;
  cashierName?: string;
  vatRate?: number;
  isRefund?: boolean;
  variant?: DeliveryTicketVariant;
}
