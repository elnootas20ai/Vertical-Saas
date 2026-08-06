/**
 * Totales € por marca en cierre de caja, con efectivo/tarjeta y desglose expandible.
 */
import { useState } from 'react';
import { Banknote, ChevronDown, ChevronUp, CreditCard, Tag } from 'lucide-react';
import type { ShiftBrandRevenueRow } from '../../lib/registerShiftBrandBilling';
import { VERTIAL_CASH_TEXT, VERTIAL_CARD_TEXT } from '../../lib/vertialUiTokens';

function fmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  rows: ShiftBrandRevenueRow[];
  unbranded?: number;
  total?: number;
  loading?: boolean;
  compact?: boolean;
  /** Cierre en pasos: filas planas, sin expandir, mínima altura. */
  dense?: boolean;
  /** Título del bloque (dense / normal). */
  title?: string;
};

export function ShiftBrandBillingSummary({
  rows,
  unbranded = 0,
  total = 0,
  loading = false,
  compact = false,
  dense = false,
  title = 'Marcas',
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading) {
    return <p className="text-[11px] text-gray-500">Calculando marcas…</p>;
  }
  if (rows.length === 0 && unbranded <= 0) return null;

  if (dense) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white px-2.5 py-2 dark:border-stone-700 dark:bg-stone-900">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500 flex items-center gap-1">
            <Tag className="h-3 w-3" />
            {title}
          </p>
          {total > 0 ? (
            <p className="text-sm font-black tabular-nums text-stone-900 dark:text-stone-100">{fmt(total)}€</p>
          ) : null}
        </div>
        <div className="space-y-0.5">
          {rows.map((row) => {
            const cash = Number(row.revenueEfectivo) || 0;
            const card = Number(row.revenueTarjeta) || 0;
            return (
              <div
                key={row.brandId}
                className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-2 py-1 dark:bg-stone-800/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-stone-900 dark:text-stone-100">{row.name}</p>
                  <p className="text-[10px] font-semibold tabular-nums">
                    <span className={VERTIAL_CASH_TEXT}>Efectivo {fmt(cash)}€</span>
                    <span className="mx-1 text-stone-300">·</span>
                    <span className={VERTIAL_CARD_TEXT}>Tarjeta {fmt(card)}€</span>
                  </p>
                </div>
                <p className="shrink-0 text-sm font-black tabular-nums text-stone-900 dark:text-stone-100">
                  {fmt(row.revenue)}€
                </p>
              </div>
            );
          })}
          {unbranded > 0 ? (
            <div className="flex justify-between px-1 text-[10px] text-stone-500">
              <span>Sin marca</span>
              <span className="tabular-nums font-semibold">{fmt(unbranded)}€</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900 ${
        compact ? 'p-2' : 'p-3'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1">
          <Tag className="h-3.5 w-3.5" />
          {title === 'Marcas' ? 'Totales por marca' : title}
        </p>
        {total > 0 ? (
          <p className="text-lg font-black tabular-nums text-stone-900 dark:text-stone-100">
            {fmt(total)}€
          </p>
        ) : null}
      </div>

      <div className={`mt-2 ${compact ? 'space-y-1.5' : 'space-y-2'}`}>
        {rows.map((row) => {
          const open = openId === row.brandId;
          const cash = Number(row.revenueEfectivo) || 0;
          const card = Number(row.revenueTarjeta) || 0;
          return (
            <div
              key={row.brandId}
              className="overflow-hidden rounded-xl border border-slate-200 bg-stone-50/80 dark:border-slate-800 dark:bg-stone-900/40"
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : row.brandId)}
                className={`flex w-full min-h-11 items-center justify-between gap-2 px-2.5 py-2 text-left touch-manipulation active:scale-[0.99] ${
                  open
                    ? 'bg-[var(--v-blue,#2563eb)] text-white'
                    : 'hover:bg-blue-50/60 dark:hover:bg-blue-950/30'
                }`}
              >
                <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {open ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-white" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" />
                    )}
                    <p className={`truncate text-sm font-bold ${open ? 'text-white' : 'text-stone-900 dark:text-stone-100'}`}>
                      {row.name}
                    </p>
                  </div>
                  {!open ? (
                    <span className="text-xs font-semibold tabular-nums pl-5 sm:pl-0">
                      <span className={VERTIAL_CASH_TEXT}>Efectivo {fmt(cash)}€</span>
                      <span className="mx-1 text-stone-300">·</span>
                      <span className={VERTIAL_CARD_TEXT}>Tarjeta {fmt(card)}€</span>
                    </span>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-lg font-black tabular-nums ${open ? 'text-white' : 'text-stone-900 dark:text-stone-100'}`}>
                    {fmt(row.revenue)}€
                  </p>
                  <p className={`text-[11px] font-semibold ${open ? 'text-blue-100' : 'text-stone-400'}`}>{row.sharePercent}%</p>
                </div>
              </button>

              {open ? (
                <div className="space-y-1.5 border-t border-slate-100 px-2.5 py-2.5 dark:border-slate-800">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className={`inline-flex items-center gap-1 font-semibold ${VERTIAL_CASH_TEXT}`}>
                      <Banknote className="h-4 w-4" /> Efectivo
                    </span>
                    <span className={`tabular-nums text-lg font-black ${VERTIAL_CASH_TEXT}`}>
                      {fmt(cash)}€
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className={`inline-flex items-center gap-1 font-semibold ${VERTIAL_CARD_TEXT}`}>
                      <CreditCard className="h-4 w-4" /> Tarjeta
                    </span>
                    <span className={`tabular-nums text-lg font-black ${VERTIAL_CARD_TEXT}`}>
                      {fmt(card)}€
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

      <p className={`leading-snug text-stone-400 dark:text-stone-500 ${compact ? 'mt-1.5 text-[10px]' : 'mt-2 text-[10px]'}`}>
        Solo TPV/tienda (cajón). Apps Glovo/Uber van aparte en Integradores.
        {!compact ? ' Efectivo/tarjeta siguen el cobro. Compartidos → marca dominante.' : ''}
      </p>
    </div>
  );
}
