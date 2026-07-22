import { Plug } from 'lucide-react';
import {
  parseAggregatorAmount,
  sumAggregatorCash,
  sumAggregatorRows,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';

interface AggregatorClosingEditorProps {
  autoRows: AggregatorCashRow[];
  manualByChannel: Record<string, string>;
  manualCashByChannel: Record<string, string>;
  onManualChange: (channel: string, value: string) => void;
  onManualCashChange: (channel: string, value: string) => void;
  title?: string;
}

/**
 * Cierre TPV: una fila por integración (total + efectivo).
 * El efectivo se suma al arqueo junto con el efectivo del TPV.
 */
export function AggregatorClosingEditor({
  autoRows,
  manualByChannel,
  manualCashByChannel,
  onManualChange,
  onManualCashChange,
  title = 'Integraciones',
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

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-800 dark:text-gray-100 uppercase tracking-wider">
          <Plug className="w-3.5 h-3.5 text-purple-600" /> {title}
        </div>
        <div className="text-right text-[11px] font-semibold tabular-nums space-y-0.5">
          <div className="text-gray-600 dark:text-gray-300">Ventas: {totals.totalSales.toFixed(2)}€</div>
          <div className="text-emerald-700 dark:text-emerald-300">Efectivo → caja: {cashTotal.toFixed(2)}€</div>
        </div>
      </div>

      <p className="px-3 pt-2 text-[11px] text-gray-500 dark:text-gray-400">
        Total = todo lo facturado en la app. Efectivo = lo que ha entrado en la caja física (suma al arqueo).
      </p>

      <div className="p-3 space-y-2">
        {autoRows.map((row) => {
          const ch = row.platform.channel;
          const display = displayRows.find((r) => r.platform.channel === ch) || row;
          const cashOver =
            parseAggregatorAmount(manualCashByChannel[ch] ?? '') != null &&
            (parseAggregatorAmount(manualCashByChannel[ch] ?? '') || 0) > display.totalSales;
          const autoHint =
            row.orderCount > 0
              ? `Sistema: ${row.totalSales.toFixed(2)}€ · ${row.orderCount} ped.`
              : row.totalSales > 0
                ? `Sistema: ${row.totalSales.toFixed(2)}€`
                : 'Sin ventas en sistema';

          return (
            <div
              key={ch}
              className={`rounded-lg border bg-gray-50/80 dark:bg-gray-800/60 p-2.5 ${row.platform.accentClass}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${row.platform.colorClass}`}>
                  {row.platform.label}
                </span>
                <span className="text-[10px] text-gray-400 truncate">{autoHint}</span>
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
                    className="w-full px-2.5 py-2 text-sm font-semibold tabular-nums border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30"
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
                    className="w-full px-2.5 py-2 text-sm font-semibold tabular-nums border border-emerald-200 dark:border-emerald-800 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>
              {cashOver ? (
                <p className="text-[10px] text-amber-600 mt-1">El efectivo no puede superar el total (se ajusta solo).</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
