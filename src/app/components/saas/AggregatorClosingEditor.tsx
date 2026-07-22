import { Plug } from 'lucide-react';
import {
  parseAggregatorAmount,
  sumAggregatorCash,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import type { FoodFamilyCounts } from '../../lib/shiftFoodFamilyCounts';
import { emptyFoodFamilyCounts } from '../../lib/shiftFoodFamilyCounts';

export type ManualFoodByChannel = Record<string, { pizza: string; burger: string; taco: string }>;

interface AggregatorClosingEditorProps {
  autoRows: AggregatorCashRow[];
  /** Conteo sistema por canal (pizzas / burgers / tacos). */
  foodByChannel: Record<string, FoodFamilyCounts>;
  manualFoodByChannel: ManualFoodByChannel;
  onManualFoodChange: (channel: string, key: keyof FoodFamilyCounts, value: string) => void;
  manualCashByChannel: Record<string, string>;
  onManualCashChange: (channel: string, value: string) => void;
  title?: string;
  /** Número del primer paso (Glovo = startStep, Uber = startStep+1…). */
  startStep?: number;
}

/**
 * Cierre TPV: por app → pizzas / burgers / tacos + efectivo (suma al arqueo).
 */
export function AggregatorClosingEditor({
  autoRows,
  foodByChannel,
  manualFoodByChannel,
  onManualFoodChange,
  manualCashByChannel,
  onManualCashChange,
  title = 'Integraciones',
  startStep = 2,
}: AggregatorClosingEditorProps) {
  const cashTotal = sumAggregatorCash(
    autoRows.map((row) => {
      const ch = row.platform.channel;
      const parsedCash = parseAggregatorAmount(manualCashByChannel[ch] ?? '');
      const cashSales = parsedCash != null ? parsedCash : row.cashSales;
      return { ...row, cashSales };
    }),
  );

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wider">
          <Plug className="w-3.5 h-3.5 text-purple-600" /> {title}
        </div>
        <div className="text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
          Efectivo apps → caja: {cashTotal.toFixed(2)}€
        </div>
      </div>

      <p className="px-3 pt-2 text-[11px] text-gray-500 dark:text-gray-400">
        Por cada app: unidades y el efectivo que ha entrado en caja (se suma al arqueo).
      </p>

      <div className="p-3 space-y-3">
        {autoRows.map((row, index) => {
          const ch = row.platform.channel;
          const autoFood = foodByChannel[ch] || emptyFoodFamilyCounts();
          const food = manualFoodByChannel[ch] || {
            pizza: String(autoFood.pizza || 0),
            burger: String(autoFood.burger || 0),
            taco: String(autoFood.taco || 0),
          };
          const stepNum = startStep + index;
          const autoHint =
            row.orderCount > 0
              ? `${row.orderCount} ped. · ${row.totalSales.toFixed(2)}€`
              : row.totalSales > 0
                ? `${row.totalSales.toFixed(2)}€`
                : 'Sin ventas';

          return (
            <div
              key={ch}
              className={`rounded-xl border bg-gray-50/80 dark:bg-gray-800/60 p-3 ${row.platform.accentClass}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 tabular-nums">
                    {stepNum}.
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${row.platform.colorClass}`}>
                    {row.platform.label}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 truncate shrink-0">{autoHint}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="rounded-lg border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 p-2 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-amber-800 dark:text-amber-200">🍕 Pizzas</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={food.pizza}
                    onChange={(e) => onManualFoodChange(ch, 'pizza', e.target.value.replace(/[^\d]/g, ''))}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/40 dark:bg-amber-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Sist. {autoFood.pizza}</span>
                </label>
                <label className="rounded-lg border border-orange-200 dark:border-orange-800 bg-white dark:bg-gray-900 p-2 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-orange-800 dark:text-orange-200">🍔 Burgers</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={food.burger}
                    onChange={(e) => onManualFoodChange(ch, 'burger', e.target.value.replace(/[^\d]/g, ''))}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50/40 dark:bg-orange-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Sist. {autoFood.burger}</span>
                </label>
                <label className="rounded-lg border border-lime-200 dark:border-lime-800 bg-white dark:bg-gray-900 p-2 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-lime-800 dark:text-lime-200">🌮 Tacos</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={food.taco}
                    onChange={(e) => onManualFoodChange(ch, 'taco', e.target.value.replace(/[^\d]/g, ''))}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-lime-200 dark:border-lime-800 rounded-lg bg-lime-50/40 dark:bg-lime-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Sist. {autoFood.taco}</span>
                </label>
                <label className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-900 p-2 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">💵 Efectivo (€)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={manualCashByChannel[ch] ?? ''}
                    onChange={(e) => onManualCashChange(ch, e.target.value)}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-emerald-200 dark:border-emerald-800 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Entra en caja</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
