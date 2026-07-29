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

/** Pastilla de abrir/plegar: se nota que se puede tocar. */
function ExpandPill({ open }: { open: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide shrink-0 border-2 shadow-sm ${
        open
          ? 'border-white/30 bg-white/20 text-white'
          : 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-200'
      }`}
    >
      {open ? 'Plegar' : 'Toca'}
      {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
    </span>
  );
}

function fmtMoney(value: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

function CategoryBlock({ group }: { group: ShiftCategoryGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded-lg overflow-hidden border transition-colors ${
        open
          ? 'border-zinc-300 dark:border-zinc-600'
          : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/40'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-all active:scale-[0.99] cursor-pointer ${
          open
            ? 'bg-indigo-600 text-white dark:bg-indigo-500'
            : 'bg-white hover:bg-indigo-50 dark:bg-zinc-900/60 dark:hover:bg-indigo-950/40 border-b border-transparent hover:border-indigo-200'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold tabular-nums ${
              open
                ? 'bg-white/20 text-white'
                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200'
            }`}
          >
            {group.products.length}
          </span>
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${open ? 'text-white' : 'text-zinc-900 dark:text-zinc-100'}`}>
              {group.category}
            </p>
            <p className={`text-[11px] ${open ? 'text-indigo-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
              {group.quantity} uds · {group.products.length} producto{group.products.length === 1 ? '' : 's'}
            </p>
            <p
              className={`text-[11px] font-medium tabular-nums mt-0.5 ${
                open ? 'text-indigo-50' : 'text-zinc-600 dark:text-zinc-300'
              }`}
            >
              Efectivo {fmtMoney(group.revenueEfectivo)}€ · Tarjeta {fmtMoney(group.revenueTarjeta)}€
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm font-semibold tabular-nums ${open ? 'text-white' : 'text-zinc-900 dark:text-zinc-100'}`}>
            {fmtMoney(group.revenue)}€
          </span>
          <ExpandPill open={open} />
        </div>
      </button>
      {open && (
        <div className="bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-700">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {group.products.map((p) => (
              <div key={p.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 pl-2 border-l border-zinc-300 dark:border-zinc-600">
                  <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{p.name}</p>
                  <p className="text-[11px] text-zinc-500">{p.quantity} uds</p>
                </div>
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 shrink-0">
                  {fmtMoney(p.revenue)}€
                </span>
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
      className={`ml-1 rounded-lg overflow-hidden border transition-colors ${
        open
          ? 'border-zinc-300 dark:border-zinc-600'
          : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/30'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
          open
            ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
        }`}
      >
        <div className="min-w-0">
          <p className={`text-xs font-semibold truncate ${open ? 'text-inherit' : 'text-zinc-900 dark:text-zinc-100'}`}>
            #{order.orderNumber} · {order.customerName}
          </p>
          <p className={`text-[10px] ${open ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-500'}`}>
            {time} · {PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod} · {order.itemCount} uds
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-semibold tabular-nums ${open ? 'text-inherit' : 'text-zinc-900 dark:text-zinc-100'}`}>
            {fmtMoney(order.total)}€
          </span>
          <ExpandPill open={open} />
        </div>
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 space-y-1 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/40">
          {order.items.map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              className="flex justify-between gap-2 text-[11px] py-1 pl-2 border-l border-zinc-300 dark:border-zinc-600"
            >
              <span className="text-zinc-600 dark:text-zinc-400 min-w-0 truncate">
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
  const [ordersOpen, setOrdersOpen] = useState(false);

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
      <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 p-4 text-center text-sm text-zinc-500">
        Cargando recuento de ventas…
      </div>
    );
  }

  if (breakdown.orderCount === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 p-4 text-sm text-zinc-500 text-center">
        Sin pedidos registrados en este turno
      </div>
    );
  }

  return (
    <section
      className={`rounded-xl overflow-hidden border-2 transition-colors shadow-sm ${
        sectionOpen
          ? 'border-indigo-400 dark:border-indigo-500'
          : 'border-indigo-200 dark:border-indigo-800'
      }`}
    >
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-all active:scale-[0.99] cursor-pointer shadow-sm ${
          sectionOpen
            ? 'bg-indigo-600 text-white dark:bg-indigo-500'
            : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-950/70'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              sectionOpen
                ? 'bg-white/20 text-white'
                : 'bg-indigo-200 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-bold ${sectionOpen ? 'text-white' : 'text-indigo-950 dark:text-indigo-100'}`}>
              Recuento de lo vendido
            </p>
            <p className={`text-xs mt-0.5 ${sectionOpen ? 'text-indigo-100' : 'text-indigo-700/80 dark:text-indigo-300/80'}`}>
              {breakdown.orderCount} pedido{breakdown.orderCount === 1 ? '' : 's'} · {breakdown.totalUnits} uds ·{' '}
              <strong className={sectionOpen ? 'text-white' : 'text-indigo-900 dark:text-indigo-100'}>
                {fmtMoney(breakdown.totalRevenue)}€
              </strong>
            </p>
          </div>
        </div>
        <ExpandPill open={sectionOpen} />
      </button>

      {sectionOpen && (
        <div className="px-4 pb-4 space-y-3 bg-white dark:bg-zinc-950/40 border-t border-zinc-200 dark:border-zinc-700">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
            {[
              { label: 'Pedidos', value: String(breakdown.orderCount) },
              { label: 'Unidades', value: String(breakdown.totalUnits) },
              { label: 'Efectivo', value: `${fmtMoney(breakdown.totalEfectivo)}€` },
              { label: 'Tarjeta', value: `${fmtMoney(breakdown.totalTarjeta)}€` },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/60 px-3 py-2 text-center"
              >
                <p className="text-[10px] uppercase tracking-wide font-semibold text-zinc-500 dark:text-zinc-400">
                  {card.label}
                </p>
                <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{card.value}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-center text-zinc-500 dark:text-zinc-400 -mt-1">
            Total recuento:{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">{fmtMoney(breakdown.totalRevenue)}€</strong>
          </p>

          {reconciliation && (
            <div
              className={`rounded-lg px-3 py-2.5 text-xs flex items-start gap-2 border ${
                reconciliation.aligned
                  ? 'bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-900/40 dark:border-zinc-700 dark:text-zinc-300'
                  : 'bg-zinc-100 border-zinc-300 text-zinc-800 dark:bg-zinc-800/60 dark:border-zinc-600 dark:text-zinc-200'
              }`}
            >
              {reconciliation.aligned ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-zinc-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-zinc-600" />
              )}
              <div>
                {reconciliation.aligned ? (
                  <p>
                    Cuadra con ventas netas de caja:{' '}
                    <strong>{fmtMoney(reconciliation.netRegisterSales)}€</strong>
                    {' '}({reconciliation.orderCount} pedido{reconciliation.orderCount === 1 ? '' : 's'})
                  </p>
                ) : (
                  <p>
                    Recuento pedidos: <strong>{fmtMoney(reconciliation.breakdownTotal)}€</strong>
                    {' · '}Ventas netas caja: <strong>{fmtMoney(reconciliation.netRegisterSales)}€</strong>
                    {' · '}Diferencia:{' '}
                    <strong>
                      {reconciliation.difference >= 0 ? '+' : ''}
                      {fmtMoney(reconciliation.difference)}€
                    </strong>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1.5">
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
            className={`rounded-lg overflow-hidden border transition-colors ${
              ordersOpen
                ? 'border-zinc-300 dark:border-zinc-600'
                : 'border-zinc-200 dark:border-zinc-700'
            }`}
          >
            <button
              type="button"
              onClick={() => setOrdersOpen((v) => !v)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-3 transition-all active:scale-[0.99] cursor-pointer ${
                ordersOpen
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-950/70'
              }`}
            >
              <span
                className={`inline-flex items-center gap-2 text-sm font-bold ${
                  ordersOpen ? 'text-white' : 'text-indigo-950 dark:text-indigo-100'
                }`}
              >
                <Receipt className="w-4 h-4 shrink-0 opacity-80" />
                Desglose por pedido
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums border ${
                    ordersOpen
                      ? 'border-white/30 bg-white/20 text-white'
                      : 'border-indigo-200 bg-white text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-200'
                  }`}
                >
                  {breakdown.orders.length}
                </span>
              </span>
              <ExpandPill open={ordersOpen} />
            </button>
            {ordersOpen && (
              <div className="border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950/30">
                <div className="p-3 space-y-2">
                  {breakdown.orders.map((order, idx) => (
                    <OrderBlock key={`${order.orderId || order.orderNumber}-${idx}`} order={order} />
                  ))}
                </div>
                <div className="px-3 py-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 flex items-center justify-between gap-2">
                  <span>
                    {breakdown.orders.length} pedido{breakdown.orders.length === 1 ? '' : 's'} en el turno
                  </span>
                  <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                    {fmtMoney(breakdown.totalRevenue)}€
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
