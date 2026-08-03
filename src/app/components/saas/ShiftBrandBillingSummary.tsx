/**
 * Totales € por marca en cierre de caja, con efectivo/tarjeta y desglose expandible.
 */
import { useState } from 'react';
import { Banknote, ChevronDown, ChevronUp, CreditCard, Tag } from 'lucide-react';
import type { ShiftBrandRevenueRow } from '../../lib/registerShiftBrandBilling';

function fmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  rows: ShiftBrandRevenueRow[];
  unbranded?: number;
  total?: number;
  loading?: boolean;
  compact?: boolean;
};

export function ShiftBrandBillingSummary({
  rows,
  unbranded = 0,
  total = 0,
  loading = false,
  compact = false,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading) {
    return <p className="text-[11px] text-gray-500">Calculando marcas…</p>;
  }
  if (rows.length === 0 && unbranded <= 0) return null;

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 ${
        compact ? 'p-2.5' : 'p-3'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5" />
          Totales por marca
        </p>
        {total > 0 ? (
          <p className="text-xs font-black tabular-nums text-gray-900 dark:text-gray-100">
            {fmt(total)} €
          </p>
        ) : null}
      </div>
      <p className="mt-0.5 text-[10px] text-gray-400">Efectivo y tarjeta por marca · toca para más detalle</p>

      <div className={`mt-2 ${compact ? 'space-y-1.5' : 'space-y-2'}`}>
        {rows.map((row) => {
          const open = openId === row.brandId;
          const cash = Number(row.revenueEfectivo) || 0;
          const card = Number(row.revenueTarjeta) || 0;
          return (
            <div
              key={row.brandId}
              className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-800/40"
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : row.brandId)}
                className={`flex w-full items-start justify-between gap-2 px-2.5 py-2.5 text-left transition-all active:scale-[0.99] cursor-pointer ${
                  open
                    ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                    : 'hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
                }`}
              >
                <div className="min-w-0 flex items-start gap-1.5">
                  {open ? (
                    <ChevronUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white" />
                  ) : (
                    <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  )}
                  <div className="min-w-0">
                    <p className={`truncate text-xs font-bold ${open ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
                      {row.name}
                    </p>
                    {!open ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/80 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100">
                          <Banknote className="h-3 w-3 shrink-0" />
                          Efectivo {fmt(cash)} €
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md border border-sky-300/80 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100">
                          <CreditCard className="h-3 w-3 shrink-0" />
                          Tarjeta {fmt(card)} €
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-black tabular-nums ${open ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
                    {fmt(row.revenue)} €
                  </p>
                  <p className={`text-[10px] font-semibold ${open ? 'text-indigo-100' : 'text-gray-400'}`}>{row.sharePercent}%</p>
                </div>
              </button>

              {open ? (
                <div className="space-y-1 border-t border-gray-100 px-2.5 py-2 dark:border-gray-800">
                  <div className="flex justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 dark:text-emerald-300">
                      <Banknote className="h-3.5 w-3.5" /> Efectivo
                    </span>
                    <span className="tabular-nums font-black text-emerald-900 dark:text-emerald-100">
                      {fmt(cash)} €
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 font-semibold text-sky-800 dark:text-sky-300">
                      <CreditCard className="h-3.5 w-3.5" /> Tarjeta
                    </span>
                    <span className="tabular-nums font-black text-sky-900 dark:text-sky-100">
                      {fmt(card)} €
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-dashed border-gray-200 pt-1.5 text-[11px] dark:border-gray-700">
                    <span className="text-gray-500">Productos de la marca</span>
                    <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                      {fmt(row.ownRevenue)} €
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-[11px]">
                    <span className="text-gray-500">
                      Compartidos (bebidas/postres)
                      {row.sharedAssigned > 0 ? (
                        <span className="block text-[10px] text-gray-400">
                          Asignados por marca dominante
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                      {fmt(row.sharedAssigned)} €
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-[11px]">
                    <span className="text-gray-500">Pedidos con esta marca</span>
                    <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                      {row.orderCount}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-dashed border-gray-200 pt-1.5 text-[11px] dark:border-gray-700">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Total marca</span>
                    <span className="tabular-nums font-black text-gray-900 dark:text-gray-100">
                      {fmt(row.revenue)} €
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {unbranded > 0 ? (
          <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-gray-500">
            <span>Sin marca asignada</span>
            <span className="tabular-nums font-semibold">{fmt(unbranded)} €</span>
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
        Efectivo/tarjeta siguen el cobro del pedido. Compartidos van a la marca dominante.
        Reglas en Empresa → Marca → Facturación.
      </p>
    </div>
  );
}
