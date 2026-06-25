import type { DeliveryOrderItem } from '../../lib/deliveryApi';
import { orderItemCustomizationParts } from '../../lib/deliveryTicketHelpers';

type OrderItemDetailCardProps = {
  item: DeliveryOrderItem;
  formatPrice: (n: number) => string;
  /** tablet = legible en desktop; compact = modal TPV tablet denso */
  variant?: 'default' | 'tablet' | 'compact';
};

export function OrderItemDetailCard({ item, formatPrice, variant = 'default' }: OrderItemDetailCardProps) {
  const { added, removed, note } = orderItemCustomizationParts(item);
  const lineTotal = Number(item.unitPrice || 0) * Number(item.quantity || 0);
  const chips = [
    ...added.map((name) => ({ key: `+${name}`, label: `+ ${name}`, tone: 'add' as const })),
    ...removed.map((name) => ({ key: `-${name}`, label: `sin ${name}`, tone: 'rem' as const })),
    ...(note ? [{ key: 'note', label: note, tone: 'note' as const }] : []),
  ];

  if (variant === 'compact') {
    return (
      <article className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-2">
        <div className="flex items-start gap-2">
          <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-bold tabular-nums shrink-0">
            {item.quantity}×
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug">{item.name}</h4>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                {formatPrice(lineTotal)}
              </span>
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {chips.map((chip) => (
                  <span
                    key={chip.key}
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold leading-tight ${
                      chip.tone === 'add'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : chip.tone === 'rem'
                          ? 'bg-red-50 text-red-700 line-through dark:bg-red-950/40 dark:text-red-300'
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                    }`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  if (variant === 'tablet') {
    return (
      <article className="rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-12 min-w-[3rem] items-center justify-center rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xl font-bold tabular-nums shrink-0">
            {item.quantity}×
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{item.name}</h4>
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                {formatPrice(lineTotal)}
              </span>
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2.5">
                {chips.map((chip) => (
                  <span
                    key={chip.key}
                    className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold leading-tight ${
                      chip.tone === 'add'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : chip.tone === 'rem'
                          ? 'bg-red-50 text-red-700 line-through dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900'
                          : 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100 border border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-xl border border-gray-200/80 dark:border-gray-700 bg-white dark:bg-gray-800/80 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-3.5">
        <span className="flex h-10 min-w-[2.5rem] items-center justify-center rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold tabular-nums shrink-0">
          {item.quantity}×
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">{item.name}</h4>
            <span className="text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
              {formatPrice(lineTotal)}
            </span>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {chips.map((chip) => (
                <span
                  key={chip.key}
                  className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${
                    chip.tone === 'add'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : chip.tone === 'rem'
                        ? 'bg-red-50 text-red-700 line-through dark:bg-red-950/40 dark:text-red-300'
                        : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                  }`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
