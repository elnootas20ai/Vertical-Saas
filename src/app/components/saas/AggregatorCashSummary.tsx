import { Plug, Receipt } from 'lucide-react';
import type { AggregatorCashRow } from '../../lib/deliveryIntegrationsUi';
import { sumAggregatorRows } from '../../lib/deliveryIntegrationsUi';

function fmtMoney(value: number | undefined | null): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

interface AggregatorCashSummaryProps {
  rows: AggregatorCashRow[];
  title?: string;
  compact?: boolean;
}

export function AggregatorCashSummary({ rows, title = 'Cajas agregadores', compact = false }: AggregatorCashSummaryProps) {
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
        {rows.map((row) => (
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
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {row.orderCount} pedido{row.orderCount === 1 ? '' : 's'}
              {row.orderCount > 0 ? ` · ticket ${fmtMoney(row.avgTicket)}€` : ''}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500">
        Cobros gestionados por la plataforma; no entran en el arqueo de efectivo del TPV.
      </p>
    </div>
  );
}
