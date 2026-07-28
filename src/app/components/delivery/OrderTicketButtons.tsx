import { useState } from 'react';
import { ChefHat, Loader2, Receipt, Truck } from 'lucide-react';
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
  const [printing, setPrinting] = useState<DeliveryTicketVariant | null>(null);
  const isDomicilio = order.deliveryType === 'domicilio';
  const showDeliveryBtn = showDelivery ?? isDomicilio;

  const print = (variant: DeliveryTicketVariant) => {
    if (printing) return;
    setPrinting(variant);
    // Encola sin bloquear; el spinner es solo feedback visual corto.
    void printDeliveryTicket(
      buildOrderTicketOptions(order, business, {
        salesPointName,
        cashierName,
        variant,
      }),
    );
    window.setTimeout(() => {
      setPrinting((cur) => (cur === variant ? null : cur));
    }, 600);
  };

  const containerClass =
    layout === 'grid'
      ? 'grid grid-cols-2 gap-2'
      : layout === 'compact' || layout === 'tablet'
        ? 'flex gap-2 w-full'
        : 'flex flex-wrap gap-2';

  const btnClass =
    layout === 'tablet' ? BTN_TABLET : layout === 'compact' ? BTN_COMPACT : BTN;

  const iconClass = `shrink-0 ${layout === 'tablet' ? 'w-4 h-4' : 'w-3.5 h-3.5'}`;

  return (
    <div className={`${containerClass} ${className}`}>
      <button
        type="button"
        onClick={() => print('kitchen')}
        disabled={Boolean(printing)}
        className={btnClass}
        title="Comanda cocina: productos y notas, sin precios"
      >
        {printing === 'kitchen' ? (
          <Loader2 className={`${iconClass} animate-spin`} />
        ) : (
          <ChefHat className={iconClass} />
        )}
        Cocina
      </button>
      {showDeliveryBtn && (
        <button
          type="button"
          onClick={() => print('delivery')}
          disabled={Boolean(printing)}
          className={btnClass}
          title="Hoja de reparto: dirección, productos y total"
        >
          {printing === 'delivery' ? (
            <Loader2 className={`${iconClass} animate-spin`} />
          ) : (
            <Truck className={iconClass} />
          )}
          Reparto
        </button>
      )}
      <button
        type="button"
        onClick={() => print('customer')}
        disabled={Boolean(printing)}
        className={`${btnClass} ${layout === 'grid' ? 'col-span-2 border-gray-900 dark:border-gray-300 font-semibold' : ''}`}
        title="Ticket cliente: productos, IVA y total"
      >
        {printing === 'customer' ? (
          <Loader2 className={`${iconClass} animate-spin`} />
        ) : (
          <Receipt className={iconClass} />
        )}
        Ticket cliente
      </button>
    </div>
  );
}
