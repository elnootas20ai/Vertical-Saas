/**
 * Cuenta de mesa en el TPV sala.
 * El pedido se crea/abre al entrar y permanece hasta cobro.
 * Carta / cocina / cobro se irán añadiendo aquí.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Receipt, Users } from 'lucide-react';
import type { DiningOrder, DiningTable } from '../../lib/salaApi';
import { loadOpenDiningOrderForTable } from '../../lib/restaurantDiningTpv';

type Props = {
  userId: string;
  table: DiningTable;
  order: DiningOrder;
  onBack: () => void;
  onOrderChange: (order: DiningOrder) => void;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value || 0));
}

export function RestaurantTpvTableAccount({
  userId,
  table,
  order,
  onBack,
  onOrderChange,
}: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const onOrderChangeRef = useRef(onOrderChange);
  onOrderChangeRef.current = onOrderChange;

  const tableLabel = table.name || `Mesa ${table.number}`;
  const tableId = String(table._id || table.id || '').trim();
  const itemCount = (order.comandas || []).reduce(
    (acc, c) => acc + (c.items || []).reduce((n, i) => n + Number(i.quantity || 0), 0),
    0,
  );

  useEffect(() => {
    let cancelled = false;
    if (!userId || !tableId) return;
    setRefreshing(true);
    void loadOpenDiningOrderForTable(userId, tableId)
      .then((fresh) => {
        if (!cancelled && fresh) onOrderChangeRef.current(fresh);
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, tableId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-50 dark:bg-stone-950">
      <header className="shrink-0 border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            aria-label="Volver al plano"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">
              Cuenta abierta
            </p>
            <h1 className="truncate text-lg font-semibold text-stone-900 dark:text-stone-50">
              {tableLabel}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-stone-900 dark:text-stone-50">
              {formatMoney(order.total)}
            </p>
            {refreshing ? (
              <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-stone-400" />
            ) : (
              <p className="text-xs text-stone-500">{itemCount} ítems</p>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-5">
        <div className="mb-4 flex flex-wrap gap-2 text-sm text-stone-600 dark:text-stone-300">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 dark:border-stone-700 dark:bg-stone-900">
            <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
            {order.guests || table.currentGuests || 0} comensales
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 dark:border-stone-700 dark:bg-stone-900">
            <Receipt className="h-3.5 w-3.5" strokeWidth={1.75} />
            Pedido {String(order.status || 'open')}
          </span>
        </div>

        {(order.comandas || []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center dark:border-stone-700 dark:bg-stone-900">
            <Receipt className="mx-auto h-8 w-8 text-stone-300" strokeWidth={1.5} />
            <p className="mt-3 text-base font-semibold text-stone-900 dark:text-stone-50">
              Pedido listo para ir añadiendo
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-stone-500">
              Esta cuenta queda abierta hasta que se cobre. La carta, el envío a cocina y el
              cobro se montan aquí en los siguientes pasos.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(order.comandas || []).map((comanda, idx) => (
              <div
                key={comanda.id || String(idx)}
                className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                    Comanda {idx + 1}
                  </p>
                  <span className="text-xs font-medium uppercase tracking-wide text-stone-400">
                    {comanda.status || 'draft'}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {(comanda.items || []).map((item) => (
                    <li
                      key={item.id}
                      className="flex items-baseline justify-between gap-3 text-sm text-stone-700 dark:text-stone-200"
                    >
                      <span>
                        <span className="font-medium tabular-nums">{item.quantity}×</span>{' '}
                        {item.name}
                      </span>
                      <span className="tabular-nums text-stone-500">
                        {formatMoney(Number(item.price || 0) * Number(item.quantity || 0))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
