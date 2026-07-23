import { Plug } from 'lucide-react';
import {
  parseAggregatorAmount,
  sumAggregatorCash,
  sumAggregatorCard,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import { formatMoneyAsYouType } from '../../lib/workCenterMoneyInput';
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
  manualCardByChannel: Record<string, string>;
  onManualCardChange: (channel: string, value: string) => void;
  title?: string;
  /** Número del primer paso (Glovo = startStep, Uber = startStep+1…). */
  startStep?: number;
}

/**
 * Cierre TPV: por app → pizzas / burgers / tacos + efectivo + tarjeta.
 * Solo el efectivo se suma al arqueo de caja física.
 */
export function AggregatorClosingEditor({
  autoRows,
  foodByChannel,
  manualFoodByChannel,
  onManualFoodChange,
  manualCashByChannel,
  onManualCashChange,
  manualCardByChannel,
  onManualCardChange,
  title = 'Integraciones',
  startStep = 2,
}: AggregatorClosingEditorProps) {
  const displayRows = autoRows.map((row) => {
    const ch = row.platform.channel;
    const parsedCash = parseAggregatorAmount(manualCashByChannel[ch] ?? '');
    const parsedCard = parseAggregatorAmount(manualCardByChannel[ch] ?? '');
    return {
      ...row,
      cashSales: parsedCash != null ? parsedCash : row.cashSales,
      cardSales: parsedCard != null ? parsedCard : row.cardSales,
    };
  });
  const cashTotal = sumAggregatorCash(displayRows);
  const cardTotal = sumAggregatorCard(displayRows);
  const foodTotals = autoRows.reduce(
    (acc, row) => {
      const ch = row.platform.channel;
      const autoFood = foodByChannel[ch] || emptyFoodFamilyCounts();
      const food = manualFoodByChannel[ch] || {
        pizza: String(autoFood.pizza || 0),
        burger: String(autoFood.burger || 0),
        taco: String(autoFood.taco || 0),
      };
      const n = (raw: string, fallback: number) => {
        const t = String(raw ?? '').trim();
        if (!t) return fallback;
        const v = Number.parseInt(t, 10);
        return Number.isFinite(v) && v >= 0 ? v : fallback;
      };
      acc.pizza += n(food.pizza, autoFood.pizza);
      acc.burger += n(food.burger, autoFood.burger);
      acc.taco += n(food.taco, autoFood.taco);
      return acc;
    },
    { pizza: 0, burger: 0, taco: 0 },
  );
  const appsMoneyTotal = Math.round((cashTotal + cardTotal) * 100) / 100;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wider">
          <Plug className="w-3.5 h-3.5 text-purple-600" /> {title}
        </div>
        <div className="text-right text-[11px] font-semibold tabular-nums space-y-0.5">
          <div className="text-emerald-700 dark:text-emerald-300">Efectivo apps → caja: {cashTotal.toFixed(2)}€</div>
          <div className="text-blue-700 dark:text-blue-300">Tarjeta apps: {cardTotal.toFixed(2)}€</div>
        </div>
      </div>

      <p className="px-3 pt-2 text-[11px] text-gray-500 dark:text-gray-400">
        Por cada app: unidades, efectivo (suma al arqueo) y tarjeta (solo registro).
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

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
                    onChange={(e) => onManualCashChange(ch, formatMoneyAsYouType(e.target.value, true))}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-emerald-200 dark:border-emerald-800 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Entra en caja</span>
                </label>
                <label className="rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 p-2 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300">💳 Tarjeta (€)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={manualCardByChannel[ch] ?? ''}
                    onChange={(e) => onManualCardChange(ch, formatMoneyAsYouType(e.target.value, true))}
                    className="w-full px-2 py-1.5 text-sm font-bold tabular-nums border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <span className="text-[9px] text-gray-400">Solo registro</span>
                </label>
              </div>
            </div>
          );
        })}

        <div className="rounded-xl border-2 border-gray-900 dark:border-gray-200 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 p-3 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">Total apps</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="rounded-lg bg-white/10 dark:bg-black/5 px-2 py-1.5">
              <p className="text-[10px] opacity-70">🍕 Pizzas</p>
              <p className="text-base font-bold tabular-nums">{foodTotals.pizza}</p>
            </div>
            <div className="rounded-lg bg-white/10 dark:bg-black/5 px-2 py-1.5">
              <p className="text-[10px] opacity-70">🍔 Burgers</p>
              <p className="text-base font-bold tabular-nums">{foodTotals.burger}</p>
            </div>
            <div className="rounded-lg bg-white/10 dark:bg-black/5 px-2 py-1.5">
              <p className="text-[10px] opacity-70">🌮 Tacos</p>
              <p className="text-base font-bold tabular-nums">{foodTotals.taco}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/20 dark:bg-emerald-600/15 px-2 py-1.5">
              <p className="text-[10px] opacity-70">💵 Efectivo</p>
              <p className="text-base font-bold tabular-nums">{cashTotal.toFixed(2)}€</p>
            </div>
            <div className="rounded-lg bg-blue-500/20 dark:bg-blue-600/15 px-2 py-1.5">
              <p className="text-[10px] opacity-70">💳 Tarjeta</p>
              <p className="text-base font-bold tabular-nums">{cardTotal.toFixed(2)}€</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/15 dark:border-black/10">
            <span className="text-xs font-semibold opacity-80">Suma efectivo + tarjeta apps</span>
            <span className="text-lg font-bold tabular-nums">{appsMoneyTotal.toFixed(2)}€</span>
          </div>
        </div>
      </div>
    </div>
  );
}
