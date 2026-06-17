import type {
  DeliveryTicketBusinessInfo,
  DeliveryTicketPrintOptions,
  DeliveryTicketVariant,
  DeliveryOrderLike,
} from './deliveryTicketTypes';

type BusinessLike = {
  name?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  city?: string;
  phone?: string;
};

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
