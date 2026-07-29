import { Plug, Receipt } from 'lucide-react';
import type { AggregatorCashRow } from '../../lib/deliveryIntegrationsUi';
import { sumAggregatorRows } from '../../lib/deliveryIntegrationsUi';
import type { FoodFamilyCounts } from '../../lib/shiftFoodFamilyCounts';
import { emptyFoodFamilyCounts } from '../../lib/shiftFoodFamilyCounts';
import { DeliveryFoodUnitLabel } from './delivery/DeliveryFoodUnitIcon';

function fmtMoney(value: number | undefined | null): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

interface AggregatorCashSummaryProps {
  rows: AggregatorCashRow[];
  title?: string;
  compact?: boolean;
  /** Conteo pizzas/burgers/tacos por canal (como en el cierre TPV). */
  foodByChannel?: Record<string, FoodFamilyCounts>;
}

const chipClass =
  'px-2 py-0.5 rounded-md text-[10px] font-semibold border border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200';

export function AggregatorCashSummary({
  rows,
  title = 'Cajas agregadores',
  compact = false,
  foodByChannel,
}: AggregatorCashSummaryProps) {
  if (rows.length === 0) return null;

  const totals = sumAggregatorRows(rows);

  if (compact) {
    return (
      <div className="flex gap-2 flex-wrap">
        {rows.map((row) => (
          <span key={row.platform.channel} className={`${chipClass} text-xs`}>
            {row.platform.label}: {fmtMoney(row.totalSales)}€ ({row.orderCount})
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
          <Plug className="w-3.5 h-3.5 opacity-70" /> {title}
        </div>
        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
          Total: {fmtMoney(totals.totalSales)}€ · {totals.orderCount} pedidos
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map((row) => {
          const food = foodByChannel?.[row.platform.channel] || emptyFoodFamilyCounts();
          const foodUnits = food.pizza + food.burger + food.taco;
          return (
            <div
              key={row.platform.channel}
              className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={chipClass}>{row.platform.label}</span>
                <Receipt className="w-3.5 h-3.5 text-zinc-400" />
              </div>
              <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {fmtMoney(row.totalSales)}€
              </div>
              {(Number(row.cashSales) || 0) > 0 ? (
                <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mt-0.5 tabular-nums">
                  Efectivo en caja: {fmtMoney(row.cashSales)}€
                </div>
              ) : null}
              {(Number(row.cardSales) || 0) > 0 ? (
                <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mt-0.5 tabular-nums">
                  Tarjeta: {fmtMoney(row.cardSales)}€
                </div>
              ) : null}
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {row.orderCount} pedido{row.orderCount === 1 ? '' : 's'}
                {row.orderCount > 0 ? ` · ticket ${fmtMoney(row.avgTicket)}€` : ''}
              </div>
              {foodUnits > 0 || Boolean(foodByChannel) ? (
                <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                  <DeliveryFoodUnitLabel unit="pizza" count={food.pizza} size="xs" />
                  <DeliveryFoodUnitLabel unit="burger" count={food.burger} size="xs" />
                  <DeliveryFoodUnitLabel unit="taco" count={food.taco} size="xs" />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
        El efectivo declarado de cada plataforma suma al arqueo de la caja TPV.
        {foodByChannel
          ? ' Los conteos son los del cierre (o los estimados del turno si no se guardaron).'
          : ''}
      </p>
    </div>
  );
}
