import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Package, Receipt, ShoppingBag, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { DeliveryOrder, TpvRegisterSession, TpvRegisterSummary } from '../../lib/deliveryApi';
import {
  buildShiftSalesBreakdown,
  filterOrdersForRegisterSession,
  type ShiftCategoryGroup,
  type ShiftOrderLine,
} from '../../lib/registerShiftSalesBreakdown';
import { reconcileRegisterTotals } from '../../lib/tpvCajaMath';

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

function ExpandPill({ open, tone }: { open: boolean; tone: 'indigo' | 'emerald' | 'amber' | 'slate' }) {
  const closedStyles = {
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200',
    emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  }[tone];
  const openStyles = {
    indigo: 'bg-white/25 text-white',
    emerald: 'bg-white/25 text-white',
    amber: 'bg-white/25 text-white',
    slate: 'bg-white/20 text-white',
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 ${
        open ? openStyles : closedStyles
      }`}
    >
      {open ? 'Plegar' : 'Ver'}
      {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
    </span>
  );
}

function CategoryBlock({ group }: { group: ShiftCategoryGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded-xl overflow-hidden transition-all ${
        open
          ? 'border-2 border-emerald-500 dark:border-emerald-600 shadow-sm shadow-emerald-100/80 dark:shadow-none'
          : 'border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/40'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 px-3 py-3 text-left transition-colors ${
          open
            ? 'bg-emerald-600 dark:bg-emerald-700 text-white'
            : 'bg-white dark:bg-gray-900/60 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black tabular-nums ${
              open ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
            }`}
          >
            {group.products.length}
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-bold truncate ${open ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
              {group.category}
            </p>
            <p className={`text-[11px] ${open ? 'text-emerald-100' : 'text-gray-500 dark:text-gray-400'}`}>
              {group.quantity} uds · {group.products.length} producto{group.products.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm font-bold tabular-nums ${open ? 'text-white' : 'text-emerald-700 dark:text-emerald-400'}`}>
            {fmtMoney(group.revenue)}€
          </span>
          <ExpandPill open={open} tone="emerald" />
        </div>
      </button>
      {open && (
        <div className="bg-emerald-50/40 dark:bg-emerald-950/15 border-t border-emerald-200 dark:border-emerald-900">
          <div className="divide-y divide-emerald-100 dark:divide-emerald-900/60">
            {group.products.map((p) => (
              <div key={p.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm bg-white/70 dark:bg-gray-900/30">
                <div className="min-w-0 pl-1 border-l-2 border-emerald-400 dark:border-emerald-600">
                  <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                  <p className="text-[11px] text-gray-500">{p.quantity} uds</p>
                </div>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100 shrink-0">{fmtMoney(p.revenue)}€</span>
              </div>
            ))}
          </div>
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
    <div
      className={`ml-2 rounded-lg overflow-hidden transition-all ${
        open
          ? 'border border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-900/40'
          : 'border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-gray-900/30'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
          open ? 'bg-slate-600 dark:bg-slate-700 text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
        }`}
      >
        <div className="min-w-0">
          <p className={`text-xs font-semibold truncate ${open ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
            #{order.orderNumber} · {order.customerName}
          </p>
          <p className={`text-[10px] ${open ? 'text-slate-200' : 'text-gray-500'}`}>
            {time} · {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod} · {order.itemCount} uds
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-bold tabular-nums ${open ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
            {fmtMoney(order.total)}€
          </span>
          <ExpandPill open={open} tone="slate" />
        </div>
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 space-y-1 border-t border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-gray-900/50">
          {order.items.map((item, idx) => (
            <div key={`${item.name}-${idx}`} className="flex justify-between gap-2 text-[11px] py-1 pl-2 border-l border-slate-300 dark:border-slate-600">
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
  registerSummary,
}: {
  session: Pick<TpvRegisterSession, 'openedAt' | 'closedAt' | 'status'>;
  orders: DeliveryOrder[];
  loading?: boolean;
  registerSummary?: Pick<TpvRegisterSummary, 'totalSales' | 'totalReturns'>;
}) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [ordersOpen, setOrdersOpen] = useState(true);

  const breakdown = useMemo(() => {
    const scoped = filterOrdersForRegisterSession(session, orders);
    return buildShiftSalesBreakdown(scoped);
  }, [session, orders]);

  const reconciliation = useMemo(
    () => (registerSummary ? reconcileRegisterTotals(registerSummary, breakdown) : null),
    [registerSummary, breakdown],
  );

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
    <section
      className={`rounded-2xl overflow-hidden transition-all ${
        sectionOpen
          ? 'border-2 border-indigo-500 dark:border-indigo-600 shadow-md shadow-indigo-100/60 dark:shadow-none'
          : 'border-2 border-dashed border-indigo-300 dark:border-indigo-800'
      }`}
    >
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors ${
          sectionOpen
            ? 'bg-indigo-600 dark:bg-indigo-700 text-white'
            : 'bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100/80 dark:hover:bg-indigo-950/60'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              sectionOpen ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'
            }`}
          >
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-bold ${sectionOpen ? 'text-white' : 'text-indigo-950 dark:text-indigo-100'}`}>
              Recuento de lo vendido
            </p>
            <p className={`text-xs mt-0.5 ${sectionOpen ? 'text-indigo-100' : 'text-indigo-800/80 dark:text-indigo-300/80'}`}>
              {breakdown.orderCount} pedido{breakdown.orderCount === 1 ? '' : 's'} · {breakdown.totalUnits} uds ·{' '}
              <strong>{fmtMoney(breakdown.totalRevenue)}€</strong>
            </p>
          </div>
        </div>
        <ExpandPill open={sectionOpen} tone="indigo" />
      </button>

      {sectionOpen && (
        <div className="px-4 pb-4 space-y-4 bg-indigo-50/40 dark:bg-indigo-950/20 border-t border-indigo-200 dark:border-indigo-900">
          <div className="grid grid-cols-3 gap-2 pt-3">
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-gray-900/60 px-3 py-2 text-center">
              <p className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400">Pedidos</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{breakdown.orderCount}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-gray-900/60 px-3 py-2 text-center">
              <p className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400">Unidades</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{breakdown.totalUnits}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-gray-900/60 px-3 py-2 text-center">
              <p className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Total</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{fmtMoney(breakdown.totalRevenue)}€</p>
            </div>
          </div>

          {reconciliation && (
            <div
              className={`rounded-xl px-3 py-2.5 text-xs flex items-start gap-2 ${
                reconciliation.aligned
                  ? 'bg-green-50 border border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-900 dark:text-green-200'
                  : 'bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-100'
              }`}
            >
              {reconciliation.aligned ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div>
                {reconciliation.aligned ? (
                  <p>
                    Cuadra con ventas netas de caja: <strong>{fmtMoney(reconciliation.netRegisterSales)}€</strong>
                    {' '}({reconciliation.orderCount} pedido{reconciliation.orderCount === 1 ? '' : 's'})
                  </p>
                ) : (
                  <p>
                    Recuento pedidos: <strong>{fmtMoney(reconciliation.breakdownTotal)}€</strong>
                    {' · '}Ventas netas caja: <strong>{fmtMoney(reconciliation.netRegisterSales)}€</strong>
                    {' · '}Diferencia: <strong>{reconciliation.difference >= 0 ? '+' : ''}{fmtMoney(reconciliation.difference)}€</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-white/60 dark:bg-gray-900/30 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              Por categoría y producto
            </p>
            <div className="space-y-2">
              {breakdown.categories.map((g) => (
                <CategoryBlock key={g.category} group={g} />
              ))}
            </div>
          </div>

          <div
            className={`rounded-xl overflow-hidden transition-all ${
              ordersOpen
                ? 'border-2 border-amber-500 dark:border-amber-600'
                : 'border-2 border-dashed border-amber-300 dark:border-amber-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setOrdersOpen((v) => !v)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-3 transition-colors ${
                ordersOpen
                  ? 'bg-amber-500 dark:bg-amber-600 text-white'
                  : 'bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100/80 dark:hover:bg-amber-950/50'
              }`}
            >
              <span className={`inline-flex items-center gap-2 text-sm font-bold ${ordersOpen ? 'text-white' : 'text-amber-950 dark:text-amber-100'}`}>
                <Receipt className="w-4 h-4 shrink-0" />
                Desglose por pedido
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                    ordersOpen ? 'bg-white/25 text-white' : 'bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
                  }`}
                >
                  {breakdown.orders.length}
                </span>
              </span>
              <ExpandPill open={ordersOpen} tone="amber" />
            </button>
            {ordersOpen && (
              <div className="border-t border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/10">
                <div className="p-3 space-y-2">
                  {breakdown.orders.map((order, idx) => (
                    <OrderBlock key={`${order.orderId || order.orderNumber}-${idx}`} order={order} />
                  ))}
                </div>
                <div className="px-3 py-2 border-t border-amber-200/80 dark:border-amber-900/60 text-[11px] text-amber-900/80 dark:text-amber-200/80 flex items-center justify-between gap-2">
                  <span>{breakdown.orders.length} pedido{breakdown.orders.length === 1 ? '' : 's'} en el turno</span>
                  <span className="font-bold tabular-nums">{fmtMoney(breakdown.totalRevenue)}€</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
