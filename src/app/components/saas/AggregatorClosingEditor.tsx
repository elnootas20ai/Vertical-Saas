import { Plug, Receipt } from 'lucide-react';
import { sumAggregatorRows, type AggregatorCashRow } from '../../lib/deliveryIntegrationsUi';

interface AggregatorClosingEditorProps {
  autoRows: AggregatorCashRow[];
  manualByChannel: Record<string, string>;
  onManualChange: (channel: string, value: string) => void;
  title?: string;
}

export function AggregatorClosingEditor({
  autoRows,
  manualByChannel,
  onManualChange,
  title = 'Cajas agregadores (turno)',
}: AggregatorClosingEditorProps) {
  const displayRows = autoRows.map((row) => {
    const raw = manualByChannel[row.platform.channel];
    const parsed = raw != null && raw.trim() !== '' ? Number(String(raw).replace(',', '.')) : NaN;
    const totalSales = Number.isFinite(parsed) && parsed >= 0 ? parsed : row.totalSales;
    return { ...row, totalSales };
  });
  const totals = sumAggregatorRows(displayRows);

  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-800/40 bg-purple-50/50 dark:bg-purple-900/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
          <Plug className="w-3.5 h-3.5" /> {title}
        </div>
        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 tabular-nums">
          Total: {totals.totalSales.toFixed(2)}€
        </span>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Escribe o ajusta el total de cada plataforma. No entran en el arqueo de efectivo del TPV.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {autoRows.map((row) => {
          const ch = row.platform.channel;
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
              <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Total turno (€)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={manualByChannel[ch] ?? ''}
                onChange={(e) => onManualChange(ch, e.target.value)}
                className="w-full px-3 py-2 text-sm font-semibold tabular-nums border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
              <p className="text-[10px] text-gray-400 mt-1">{autoHint}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
