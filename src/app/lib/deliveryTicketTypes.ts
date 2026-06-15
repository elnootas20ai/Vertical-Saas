export interface DeliveryTicketBusinessInfo {
  name: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  city?: string;
  phone?: string;
}

export interface DeliveryOrderLike {
  _id: string;
  orderNumber?: string;
  ticketNumber?: string;
  customerName?: string;
  salesPointName?: string;
  takenByName?: string;
  paymentMethod?: string;
  totalAmount?: number;
  paidAmount?: number;
  refundAmount?: number;
  refundReason?: string;
  paidAt?: string;
  createdAt?: string;
  updatedAt?: string;
  refundedAt?: string;
  items?: Array<{ quantity?: number; name?: string; total?: number }>;
}

export interface DeliveryTicketPrintOptions {
  order: DeliveryOrderLike;
  business: DeliveryTicketBusinessInfo;
  salesPointName?: string;
  cashierName?: string;
  vatRate?: number;
  isRefund?: boolean;
}
