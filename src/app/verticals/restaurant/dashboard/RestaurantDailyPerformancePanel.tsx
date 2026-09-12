import { useMemo, useState } from 'react';
import type { DiningOrder } from '../../../lib/salaApi';
import { formatMoneyEs, formatNumberEs } from '../../../lib/formatNumberEs';
import { localCalendarDayKey } from '../../../lib/tpvCajaScope';
import { filterBilledOrders } from '../restaurantReports';

type Props = {
  orders: DiningOrder[];
  businessId: string;
};

function orderDay(order: DiningOrder): string {
  return String(order.paidAt || order.closedAt || order.createdAt || '').slice(0, 10);
}

function dayLabel(day: string): string {
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function buildRestaurantDailyRows(
  orders: DiningOrder[],
  businessId: string,
  range: 7 | 30,
  today: string = localCalendarDayKey(),
) {
  const endMs = new Date(`${today}T12:00:00`).getTime();
  const daysInRange = range === 30 ? Math.max(1, Number(today.slice(8, 10)) || 1) : 7;
  const byDay = new Map<string, { sales: number; tickets: number; guests: number }>();
  for (const order of filterBilledOrders(orders, businessId)) {
    const day = orderDay(order);
    const rowMs = new Date(`${day}T12:00:00`).getTime();
    if (!day || !Number.isFinite(rowMs) || rowMs < endMs - (daysInRange - 1) * 86_400_000 || rowMs > endMs) {
      continue;
    }
    const row = byDay.get(day) || { sales: 0, tickets: 0, guests: 0 };
    row.sales += Number(order.total) || 0;
    row.tickets += 1;
    row.guests += Number(order.guests) || 0;
    byDay.set(day, row);
  }
  return Array.from({ length: daysInRange }, (_, index) => {
    const date = new Date(endMs - (daysInRange - 1 - index) * 86_400_000);
    const day = localCalendarDayKey(date);
    const row = byDay.get(day) || { sales: 0, tickets: 0, guests: 0 };
    return {
      day,
      ...row,
      avgTicket: row.tickets > 0 ? row.sales / row.tickets : 0,
    };
  });
}

export function RestaurantDailyPerformancePanel({ orders, businessId }: Props) {
  const [range, setRange] = useState<7 | 30>(7);
  const rows = useMemo(
    () => buildRestaurantDailyRows(orders, businessId, range),
    [businessId, orders, range],
  );

  const visible = range === 7 ? rows : rows.slice(-14);
  const maxSales = Math.max(1, ...visible.map((row) => row.sales));
  const totals = rows.reduce(
    (acc, row) => ({
      sales: acc.sales + row.sales,
      tickets: acc.tickets + row.tickets,
      guests: acc.guests + row.guests,
    }),
    { sales: 0, tickets: 0, guests: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-stone-500">Ventas</p>
            <p className="font-black tabular-nums text-stone-900 dark:text-stone-100">
              {formatMoneyEs(totals.sales)}
            </p>
          </div>
          <div>
            <p className="text-stone-500">Cuentas</p>
            <p className="font-black tabular-nums text-stone-900 dark:text-stone-100">{totals.tickets}</p>
          </div>
          <div>
            <p className="text-stone-500">Comensales</p>
            <p className="font-black tabular-nums text-stone-900 dark:text-stone-100">{totals.guests}</p>
          </div>
        </div>
        <div className="flex rounded-xl bg-stone-100 p-1 dark:bg-stone-800">
          {([7, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRange(days)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                range === days
                  ? 'bg-white text-blue-700 shadow-sm dark:bg-stone-700 dark:text-blue-300'
                  : 'text-stone-500'
              }`}
            >
              {days === 7 ? '7 días' : 'Mes'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {visible.map((row) => (
          <div key={row.day} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate capitalize text-stone-500">{dayLabel(row.day)}</span>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
              <div
                className="h-full rounded-full bg-[var(--v-blue,#2563eb)]"
                style={{ width: `${Math.max(row.sales > 0 ? 3 : 0, (row.sales / maxSales) * 100)}%` }}
              />
            </div>
            <span className="w-40 text-right font-semibold tabular-nums text-stone-800 dark:text-stone-100">
              {formatMoneyEs(row.sales)} · {row.tickets} · {formatNumberEs(row.avgTicket, { maxFraction: 2 })} €
            </span>
          </div>
        ))}
      </div>
      {range === 30 ? (
        <p className="text-[11px] text-stone-400">Se muestran los últimos 14 días; los totales incluyen el mes en curso.</p>
      ) : null}
    </div>
  );
}
