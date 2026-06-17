import { ChefHat, Receipt, Truck } from 'lucide-react';
import { printDeliveryTicket } from '../../lib/deliveryTicketPrint';
import { buildOrderTicketOptions } from '../../lib/deliveryTicketHelpers';
import type {
  DeliveryOrderLike,
  DeliveryTicketBusinessInfo,
  DeliveryTicketVariant,
} from '../../lib/deliveryTicketTypes';

type OrderTicketButtonsProps = {
  order: DeliveryOrderLike;
  business: DeliveryTicketBusinessInfo;
  salesPointName?: string;
  cashierName?: string;
  layout?: 'row' | 'grid';
  showDelivery?: boolean;
  className?: string;
};

const BTN =
  'flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50';

export function OrderTicketButtons({
  order,
  business,
  salesPointName,
  cashierName,
  layout = 'row',
  showDelivery,
  className = '',
}: OrderTicketButtonsProps) {
  const isDomicilio = order.deliveryType === 'domicilio';
  const showDeliveryBtn = showDelivery ?? isDomicilio;

  const print = (variant: DeliveryTicketVariant) => {
    printDeliveryTicket(
      buildOrderTicketOptions(order, business, {
        salesPointName,
        cashierName,
        variant,
      }),
    );
  };

  const containerClass =
    layout === 'grid'
      ? 'grid grid-cols-2 gap-2'
      : 'flex flex-wrap gap-2';

  return (
    <div className={`${containerClass} ${className}`}>
      <button type="button" onClick={() => print('kitchen')} className={BTN}>
        <ChefHat className="w-4 h-4 shrink-0" />
        Cocina
      </button>
      {showDeliveryBtn && (
        <button type="button" onClick={() => print('delivery')} className={BTN}>
          <Truck className="w-4 h-4 shrink-0" />
          Reparto
        </button>
      )}
      <button
        type="button"
        onClick={() => print('customer')}
        className={`${BTN} ${layout === 'grid' ? 'col-span-2 border-gray-900 dark:border-gray-300 font-semibold' : ''}`}
      >
        <Receipt className="w-4 h-4 shrink-0" />
        Ticket
      </button>
    </div>
  );
}
