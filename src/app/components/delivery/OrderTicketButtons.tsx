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
  layout?: 'row' | 'grid' | 'compact' | 'tablet';
  showDelivery?: boolean;
  className?: string;
};

const BTN =
  'flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50';

const BTN_COMPACT =
  'flex flex-1 items-center justify-center gap-1 px-1.5 py-1 min-h-[32px] rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[10px] font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 touch-manipulation';

const BTN_TABLET =
  'flex flex-1 items-center justify-center gap-1.5 px-2.5 py-2.5 min-h-[44px] rounded-lg border-2 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 touch-manipulation';

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
      : layout === 'compact' || layout === 'tablet'
        ? 'flex gap-2 w-full'
        : 'flex flex-wrap gap-2';

  const btnClass =
    layout === 'tablet' ? BTN_TABLET : layout === 'compact' ? BTN_COMPACT : BTN;

  return (
    <div className={`${containerClass} ${className}`}>
      <button type="button" onClick={() => print('kitchen')} className={btnClass}>
        <ChefHat className={`shrink-0 ${layout === 'tablet' ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
        Cocina
      </button>
      {showDeliveryBtn && (
        <button type="button" onClick={() => print('delivery')} className={btnClass}>
          <Truck className={`shrink-0 ${layout === 'tablet' ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
          Reparto
        </button>
      )}
      <button
        type="button"
        onClick={() => print('customer')}
        className={`${btnClass} ${layout === 'grid' ? 'col-span-2 border-gray-900 dark:border-gray-300 font-semibold' : ''}`}
      >
        <Receipt className={`shrink-0 ${layout === 'tablet' ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
        Ticket
      </button>
    </div>
  );
}
