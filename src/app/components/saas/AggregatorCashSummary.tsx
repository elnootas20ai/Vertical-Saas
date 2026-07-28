import { Plug, Receipt } from 'lucide-react';
import type { AggregatorCashRow } from '../../lib/deliveryIntegrationsUi';
import { sumAggregatorRows } from '../../lib/deliveryIntegrationsUi';
import type { FoodFamilyCounts } from '../../lib/shiftFoodFamilyCounts';
import { emptyFoodFamilyCounts } from '../../lib/shiftFoodFamilyCounts';

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
          <span
            key={row.platform.channel}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${row.platform.colorClass}`}
          >
            {row.platform.label}: {fmtMoney(row.totalSales)}€ ({row.orderCount})
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-900/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
          <Plug className="w-3.5 h-3.5" /> {title}
        </div>
        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 tabular-nums">
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
              className={`rounded-xl border bg-white dark:bg-gray-800 p-3 ${row.platform.accentClass}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${row.platform.colorClass}`}>
                  {row.platform.label}
                </span>
                <Receipt className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                {fmtMoney(row.totalSales)}€
              </div>
              {(Number(row.cashSales) || 0) > 0 ? (
                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 mt-0.5 tabular-nums">
                  Efectivo en caja: {fmtMoney(row.cashSales)}€
                </div>
              ) : null}
              {(Number(row.cardSales) || 0) > 0 ? (
                <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 mt-0.5 tabular-nums">
                  Tarjeta: {fmtMoney(row.cardSales)}€
                </div>
              ) : null}
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {row.orderCount} pedido{row.orderCount === 1 ? '' : 's'}
                {row.orderCount > 0 ? ` · ticket ${fmtMoney(row.avgTicket)}€` : ''}
              </div>
              {foodUnits > 0 || Boolean(foodByChannel) ? (
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold tabular-nums text-gray-800 dark:text-gray-100">
                  <span>🍕 {food.pizza}</span>
                  <span>🍔 {food.burger}</span>
                  <span>🌮 {food.taco}</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        El efectivo declarado de cada plataforma suma al arqueo de la caja TPV.
        {foodByChannel
          ? ' Los conteos 🍕🍔🌮 son los del cierre (o los estimados del turno si no se guardaron).'
          : ''}
      </p>
    </div>
  );
}
