import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Package, Receipt, ShoppingBag } from 'lucide-react';
import type { DeliveryOrder, TpvRegisterSession } from '../../lib/deliveryApi';
import {
  buildShiftSalesBreakdown,
  filterOrdersForRegisterSession,
  type ShiftCategoryGroup,
  type ShiftOrderLine,
} from '../../lib/registerShiftSalesBreakdown';

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  bizum: 'Bizum',
  online: 'Online',
  otro: 'Otro',
};

function fmtMoney(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

function CategoryBlock({ group }: { group: ShiftCategoryGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 dark:bg-gray-900/60 text-left hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{group.category}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {group.quantity} uds · {group.products.length} producto{group.products.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(group.revenue)}€</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {group.products.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                <p className="text-[11px] text-gray-500">{p.quantity} uds</p>
              </div>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100 shrink-0">{fmtMoney(p.revenue)}€</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderBlock({ order }: { order: ShiftOrderLine }) {
  const [open, setOpen] = useState(false);
  const time = order.createdAt
    ? new Date(order.createdAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })
    : '—';
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50"
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
            #{order.orderNumber} · {order.customerName}
          </p>
          <p className="text-[10px] text-gray-500">
            {time} · {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod} · {order.itemCount} uds
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-bold tabular-nums">{fmtMoney(order.total)}€</span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1 border-t border-gray-100 dark:border-gray-800">
          {order.items.map((item, idx) => (
            <div key={`${item.name}-${idx}`} className="flex justify-between gap-2 text-[11px] py-1">
              <span className="text-gray-600 dark:text-gray-400 min-w-0 truncate">
                {item.quantity}× {item.name}
                {item.extras.length > 0 ? ` (${item.extras.join(', ')})` : ''}
              </span>
              <span className="font-medium tabular-nums shrink-0">{fmtMoney(item.total)}€</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RegisterShiftSalesBreakdown({
  session,
  orders,
  loading = false,
}: {
  session: Pick<TpvRegisterSession, 'linkedOrderIds' | 'transactions'>;
  orders: DeliveryOrder[];
  loading?: boolean;
}) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [ordersOpen, setOrdersOpen] = useState(false);

  const breakdown = useMemo(() => {
    const scoped = filterOrdersForRegisterSession(session, orders);
    return buildShiftSalesBreakdown(scoped);
  }, [session, orders]);

  if (loading) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-4 text-center text-sm text-gray-500">
        Cargando recuento de ventas…
      </div>
    );
  }

  if (breakdown.orderCount === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 text-sm text-gray-500 text-center">
        Sin pedidos registrados en este turno
      </div>
    );
  }

  return (
    <section className="rounded-xl border-2 border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-indigo-950 dark:text-indigo-100">Recuento de lo vendido</p>
            <p className="text-xs text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
              {breakdown.orderCount} pedido{breakdown.orderCount === 1 ? '' : 's'} · {breakdown.totalUnits} uds ·{' '}
              <strong>{fmtMoney(breakdown.totalRevenue)}€</strong>
            </p>
          </div>
        </div>
        {sectionOpen ? <ChevronUp className="w-5 h-5 text-indigo-600 shrink-0" /> : <ChevronDown className="w-5 h-5 text-indigo-600 shrink-0" />}
      </button>

      {sectionOpen && (
        <div className="px-4 pb-4 space-y-4 border-t border-indigo-200/80 dark:border-indigo-900">
          <div className="grid grid-cols-3 gap-2 pt-3">
            <div className="rounded-lg bg-white/80 dark:bg-gray-900/60 px-3 py-2 text-center">
              <p className="text-[10px] uppercase font-bold text-gray-500">Pedidos</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{breakdown.orderCount}</p>
            </div>
            <div className="rounded-lg bg-white/80 dark:bg-gray-900/60 px-3 py-2 text-center">
              <p className="text-[10px] uppercase font-bold text-gray-500">Unidades</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{breakdown.totalUnits}</p>
            </div>
            <div className="rounded-lg bg-white/80 dark:bg-gray-900/60 px-3 py-2 text-center">
              <p className="text-[10px] uppercase font-bold text-gray-500">Total</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{fmtMoney(breakdown.totalRevenue)}€</p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              Por categoría y producto
            </p>
            <div className="space-y-2">
              {breakdown.categories.map((g) => (
                <CategoryBlock key={g.category} group={g} />
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setOrdersOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2"
            >
              <span className="inline-flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                Desglose por pedido ({breakdown.orders.length})
              </span>
              {ordersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {ordersOpen && (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {breakdown.orders.map((order) => (
                  <OrderBlock key={order.orderId} order={order} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
