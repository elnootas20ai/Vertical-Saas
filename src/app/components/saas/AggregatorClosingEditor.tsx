import { Plug, Receipt } from 'lucide-react';
import {
  parseAggregatorAmount,
  sumAggregatorCash,
  sumAggregatorRows,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import type { FoodFamilyCounts, ShiftFoodFamilyReport } from '../../lib/shiftFoodFamilyCounts';
import { emptyFoodFamilyCounts } from '../../lib/shiftFoodFamilyCounts';

interface AggregatorClosingEditorProps {
  autoRows: AggregatorCashRow[];
  manualByChannel: Record<string, string>;
  manualCashByChannel: Record<string, string>;
  onManualChange: (channel: string, value: string) => void;
  onManualCashChange: (channel: string, value: string) => void;
  title?: string;
  foodReport?: ShiftFoodFamilyReport | null;
  /** Totales de cierre editados (slots); si hay, sustituyen al auto en el resumen. */
  closingFoodTotal?: FoodFamilyCounts | null;
}

function FoodMiniCounts({ counts }: { counts: FoodFamilyCounts }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200 tabular-nums">
        🍕 {counts.pizza}
      </span>
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200 tabular-nums">
        🍔 {counts.burger}
      </span>
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-lime-100 text-lime-800 dark:bg-lime-950/50 dark:text-lime-200 tabular-nums">
        🌮 {counts.taco}
      </span>
    </div>
  );
}

export function AggregatorClosingEditor({
  autoRows,
  manualByChannel,
  manualCashByChannel,
  onManualChange,
  onManualCashChange,
  title = 'Cajas agregadores (turno)',
  foodReport = null,
  closingFoodTotal = null,
}: AggregatorClosingEditorProps) {
  const displayRows = autoRows.map((row) => {
    const ch = row.platform.channel;
    const parsedTotal = parseAggregatorAmount(manualByChannel[ch] ?? '');
    const parsedCash = parseAggregatorAmount(manualCashByChannel[ch] ?? '');
    const totalSales = parsedTotal != null ? parsedTotal : row.totalSales;
    let cashSales = parsedCash != null ? parsedCash : row.cashSales;
    if (cashSales > totalSales) cashSales = totalSales;
    return { ...row, totalSales, cashSales };
  });
  const totals = sumAggregatorRows(displayRows);
  const cashTotal = sumAggregatorCash(displayRows);
  const foodTotal = closingFoodTotal || foodReport?.total || emptyFoodFamilyCounts();

  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-900/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
          <Plug className="w-3.5 h-3.5" /> {title}
        </div>
        <div className="text-right text-xs font-semibold text-purple-700 dark:text-purple-300 tabular-nums space-y-0.5">
          <div>Total: {totals.totalSales.toFixed(2)}€</div>
          <div className="text-emerald-700 dark:text-emerald-300">Efectivo → caja: {cashTotal.toFixed(2)}€</div>
        </div>
      </div>
      {foodReport || closingFoodTotal ? (
        <div className="rounded-lg border border-purple-200/80 dark:border-purple-800 bg-white/70 dark:bg-gray-900/40 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
            {closingFoodTotal ? 'Conteo total (slots de cierre)' : 'Conteo total del turno'}
          </p>
          <FoodMiniCounts counts={foodTotal} />
        </div>
      ) : null}
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Total = todo lo del integrador. Efectivo = lo que ha entrado en la caja física (se suma al arqueo).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {autoRows.map((row) => {
          const ch = row.platform.channel;
          const food = foodReport?.byAggregator?.[ch] || emptyFoodFamilyCounts();
          const display = displayRows.find((r) => r.platform.channel === ch) || row;
          const cashOver =
            parseAggregatorAmount(manualCashByChannel[ch] ?? '') != null &&
            (parseAggregatorAmount(manualCashByChannel[ch] ?? '') || 0) > display.totalSales;
          const autoHint = row.orderCount > 0
            ? `Sistema: ${row.totalSales.toFixed(2)}€ · ${row.orderCount} ped.`
            : row.totalSales > 0
              ? `Sistema: ${row.totalSales.toFixed(2)}€`
              : 'Sin ventas en sistema';
          return (
            <div
              key={ch}
              className={`rounded-xl border bg-white dark:bg-gray-800 p-3 ${row.platform.accentClass}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${row.platform.colorClass}`}>
                  {row.platform.label}
                </span>
                <Receipt className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    Total (€)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={manualByChannel[ch] ?? ''}
                    onChange={(e) => onManualChange(ch, e.target.value)}
                    className="w-full px-2.5 py-2 text-sm font-semibold tabular-nums border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                    Efectivo (€)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={manualCashByChannel[ch] ?? ''}
                    onChange={(e) => onManualCashChange(ch, e.target.value)}
                    className="w-full px-2.5 py-2 text-sm font-semibold tabular-nums border border-emerald-200 dark:border-emerald-800 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>
              {cashOver ? (
                <p className="text-[10px] text-amber-600 mt-1">El efectivo no puede superar el total (se ajusta solo).</p>
              ) : null}
              <p className="text-[10px] text-gray-400 mt-1">{autoHint}</p>
              {foodReport ? <FoodMiniCounts counts={food} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
