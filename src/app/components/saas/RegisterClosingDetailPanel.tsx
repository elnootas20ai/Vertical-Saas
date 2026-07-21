import { useMemo, useState, useEffect } from 'react';
import {
  Banknote, CreditCard, Phone as PhoneIcon, Wifi, TrendingUp, TrendingDown,
  Clock, User, Store,
} from 'lucide-react';
import type { DeliveryOrder, TpvRegisterSession, TpvRegisterSummary } from '../../lib/deliveryApi';
import { fetchShiftOrdersForSession } from '../../lib/registerShiftOrders';
import {
  aggregatorRowsFromClosingTotals,
  getClosingAggregatorPlatforms,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import { AggregatorCashSummary } from './AggregatorCashSummary';
import { RegisterShiftSalesBreakdown } from './RegisterShiftSalesBreakdown';
import { buildTpvRegisterSummary, sumCashReturns, sumCashStaffConsumption } from '../../lib/tpvCajaMath';

const METHOD_BADGES: Record<string, { icon: typeof Banknote; color: string; label: string }> = {
  efectivo: { icon: Banknote, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: 'Efectivo' },
  tarjeta: { icon: CreditCard, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Tarjeta' },
  bizum: { icon: PhoneIcon, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: 'Bizum' },
  online: { icon: Wifi, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', label: 'Online' },
};

const TPV_TX_LABELS: Record<string, string> = {
  sale: 'Venta',
  return: 'Devolución',
  cash_in: 'Entrada',
  cash_out: 'Salida',
  expense: 'Gasto',
  tip: 'Propina',
};

function fmtMoney(value: number | undefined | null): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function resolveSessionSummary(session: TpvRegisterSession): TpvRegisterSummary {
  const built = buildTpvRegisterSummary(session);
  const stored = session.summary;
  if (!stored) return built;
  return {
    totalSales: stored.totalSales ?? built.totalSales,
    salesByMethod: {
      efectivo: stored.salesByMethod?.efectivo ?? built.salesByMethod.efectivo,
      tarjeta: stored.salesByMethod?.tarjeta ?? built.salesByMethod.tarjeta,
      bizum: stored.salesByMethod?.bizum ?? built.salesByMethod.bizum,
      online: stored.salesByMethod?.online ?? built.salesByMethod.online,
      otro: stored.salesByMethod?.otro ?? built.salesByMethod.otro,
    },
    salesByChannel: { ...built.salesByChannel, ...(stored.salesByChannel || {}) },
    totalReturns: stored.totalReturns ?? built.totalReturns,
    returnCount: stored.returnCount ?? built.returnCount,
    totalCashIn: stored.totalCashIn ?? built.totalCashIn,
    totalCashOut: stored.totalCashOut ?? built.totalCashOut,
    totalTips: stored.totalTips ?? built.totalTips,
    totalTransactions: stored.totalTransactions ?? built.totalTransactions,
    averageTicket: stored.averageTicket ?? built.averageTicket,
    incidentCount: stored.incidentCount ?? built.incidentCount,
  };
}

interface RegisterClosingDetailPanelProps {
  session: TpvRegisterSession;
  /** Filas agregador ya resueltas; si no, se leen de la sesión cerrada. */
  aggregatorRows?: AggregatorCashRow[];
}

export function RegisterClosingDetailPanel({ session, aggregatorRows: aggregatorRowsProp }: RegisterClosingDetailPanelProps) {
  const summary = useMemo(() => resolveSessionSummary(session), [session]);
  const transactions = session.transactions || [];
  const cashCounts = session.cashCounts || [];
  const incidents = session.incidents || [];
  const [shiftOrders, setShiftOrders] = useState<DeliveryOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    const userId = String(session.user_id || '').trim();
    if (!userId || !session.openedAt) return;
    let cancelled = false;
    setOrdersLoading(true);
    void fetchShiftOrdersForSession(userId, session)
      .then((orders) => {
        if (!cancelled) setShiftOrders(orders);
      })
      .catch(() => {
        if (!cancelled) setShiftOrders([]);
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.user_id, session.pointOfSaleId, session.openedAt, session.closedAt, session.status]);

  const aggregatorRows = useMemo(() => {
    if (aggregatorRowsProp?.length) return aggregatorRowsProp;
    const totals = session.aggregatorClosingTotals || summary.salesByChannel;
    return aggregatorRowsFromClosingTotals(
      getClosingAggregatorPlatforms(),
      totals,
      session.aggregatorClosingCash,
    );
  }, [aggregatorRowsProp, session.aggregatorClosingTotals, session.aggregatorClosingCash, summary.salesByChannel]);

  const cashReturns = sumCashReturns(session);
  const cashStaffConsumption = sumCashStaffConsumption(session);
  const aggregatorCashTotal = useMemo(
    () => aggregatorRows.reduce((s, r) => s + (Number(r.cashSales) || 0), 0),
    [aggregatorRows],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> {session.pointOfSaleName || 'PDV'} · {session.terminalName}</span>
        <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" /> {session.workerName}</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {new Date(session.openedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
          {session.closedAt ? ` → ${new Date(session.closedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
          <div className="text-xs text-green-600 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Ventas TPV</div>
          <div className="text-lg font-bold text-green-700 dark:text-green-400">{fmtMoney(summary.totalSales)}€</div>
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
          <div className="text-xs text-red-600 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Devoluciones</div>
          <div className="text-lg font-bold text-red-700 dark:text-red-400">{fmtMoney(summary.totalReturns)}€</div>
        </div>
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
          <div className="text-xs text-blue-600">Entradas efectivo</div>
          <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{fmtMoney(summary.totalCashIn)}€</div>
        </div>
        <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
          <div className="text-xs text-orange-600">Salidas efectivo</div>
          <div className="text-lg font-bold text-orange-700 dark:text-orange-400">{fmtMoney(summary.totalCashOut)}€</div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap text-xs">
        {Object.entries(summary.salesByMethod).map(([method, amount]) => {
          if (amount <= 0) return null;
          const badge = METHOD_BADGES[method];
          if (!badge) return null;
          const Icon = badge.icon;
          return (
            <span key={method} className={`px-2 py-0.5 rounded-lg font-medium flex items-center gap-1 ${badge.color}`}>
              <Icon className="w-3 h-3" /> {badge.label}: {fmtMoney(amount)}€
            </span>
          );
        })}
        <span className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">
          {summary.totalTransactions} operaciones
        </span>
      </div>

      <RegisterShiftSalesBreakdown
        session={session}
        orders={shiftOrders}
        loading={ordersLoading}
        registerSummary={summary}
      />

      {(session.productClosingCounts || shiftOrders.length > 0) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-3">
          <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200 uppercase tracking-wider mb-2">
            Conteo pizzas / burgers / tacos
          </p>
          <div className="flex flex-wrap gap-2 text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
            <span>🍕 {session.productClosingCounts?.pizza ?? '—'}</span>
            <span>🍔 {session.productClosingCounts?.burger ?? '—'}</span>
            <span>🌮 {session.productClosingCounts?.taco ?? '—'}</span>
          </div>
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2 text-sm">
        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Arqueo de efectivo</p>
        <div className="flex justify-between"><span className="text-gray-500">Fondo de apertura</span><span className="font-semibold">{fmtMoney(session.initialCashAmount)}€</span></div>
        <div className="flex justify-between"><span className="text-green-600">+ Cobros en efectivo</span><span className="font-semibold text-green-700">{fmtMoney(summary.salesByMethod.efectivo)}€</span></div>
        {cashStaffConsumption > 0 && (
          <div className="flex justify-between"><span className="text-green-600">+ Consumo equipo (efectivo)</span><span className="font-semibold text-green-700">{fmtMoney(cashStaffConsumption)}€</span></div>
        )}
        <div className="flex justify-between"><span className="text-blue-600">+ Entradas de efectivo</span><span className="font-semibold text-blue-700">{fmtMoney(summary.totalCashIn)}€</span></div>
        <div className="flex justify-between"><span className="text-red-600">− Devoluciones efectivo</span><span className="font-semibold text-red-700">{fmtMoney(cashReturns)}€</span></div>
        <div className="flex justify-between"><span className="text-orange-600">− Salidas de efectivo</span><span className="font-semibold text-orange-700">{fmtMoney(summary.totalCashOut)}€</span></div>
        {(() => {
          const cashOuts = transactions
            .filter((t) => t.type === 'cash_out' || t.type === 'expense')
            .slice()
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          if (cashOuts.length === 0) return null;
          return (
            <div className="mt-2 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/80 dark:bg-orange-950/30 p-2.5 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                Detalle salidas (motivo)
              </p>
              {cashOuts.map((tx) => (
                <div key={tx.id} className="flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 break-words">
                      {tx.description?.trim() || 'Sin motivo indicado'}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}
                      {tx.registeredBy ? ` · ${tx.registeredBy}` : ''}
                    </p>
                  </div>
                  <span className="font-bold tabular-nums text-orange-700 dark:text-orange-300 shrink-0">
                    −{fmtMoney(tx.amount)}€
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between">
          <span className="text-gray-700 dark:text-gray-300 font-medium">Efectivo esperado</span>
          <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmtMoney(session.expectedCash)}€</span>
        </div>
        {aggregatorCashTotal > 0 ? (
          <p className="text-[10px] text-purple-600 dark:text-purple-300">
            Incluye {fmtMoney(aggregatorCashTotal)}€ de efectivo de integradores
          </p>
        ) : null}
        <div className="flex justify-between">
          <span className="text-gray-700 dark:text-gray-300 font-medium">Efectivo contado</span>
          <span className="font-bold text-gray-900 dark:text-gray-100">{fmtMoney(session.finalCashAmount)}€</span>
        </div>
        <div className={`flex justify-between p-2 rounded-lg ${session.difference === 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
          <span className="font-semibold">Diferencia</span>
          <span className={`font-bold ${session.difference === 0 ? 'text-green-700' : 'text-red-700'}`}>
            {(Number(session.difference) || 0) >= 0 ? '+' : ''}{fmtMoney(session.difference)}€
          </span>
        </div>
      </div>

      <AggregatorCashSummary rows={aggregatorRows} title="Cajas agregadores (declarado en cierre)" />

      {transactions.some((t) => t.type === 'cash_in' || t.type === 'cash_out' || t.type === 'return') && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Movimientos de caja</h4>
          <div className="space-y-1">
            {transactions
              .filter((t) => t.type === 'cash_in' || t.type === 'cash_out' || t.type === 'return')
              .slice()
              .reverse()
              .map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-400 shrink-0">{new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${tx.type === 'cash_in' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                      {TPV_TX_LABELS[tx.type] || tx.type}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 truncate">{tx.description || '—'}</span>
                  </div>
                  <span className={`font-semibold shrink-0 ${tx.type === 'cash_in' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'cash_in' ? '+' : '−'}{fmtMoney(tx.amount)}€
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {cashCounts.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Arqueos intermedios</h4>
          <div className="space-y-1">
            {cashCounts.map((cc) => (
              <div key={cc.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <span className="text-gray-500">{new Date(cc.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {cc.countedBy}{cc.notes ? ` · ${cc.notes}` : ''}</span>
                <span className={`font-semibold ${cc.difference === 0 ? 'text-green-600' : cc.difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {(Number(cc.difference) || 0) >= 0 ? '+' : ''}{fmtMoney(cc.difference)}€
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {incidents.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Incidencias</h4>
          <div className="space-y-1">
            {incidents.map((inc) => (
              <div key={inc.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${inc.severity === 'high' ? 'bg-red-100 text-red-700' : inc.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {inc.severity === 'high' ? 'Alta' : inc.severity === 'medium' ? 'Media' : 'Baja'}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400 truncate">{inc.description}</span>
                </div>
                {inc.amount != null && <span className="font-semibold shrink-0 ml-2">{fmtMoney(inc.amount)}€</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {session.closingNotes && (
        <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl">
          <div className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">Notas del trabajador</div>
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{session.closingNotes}</div>
        </div>
      )}

      {session.closingValidationNotes && (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl">
          <div className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">Notas del gerente</div>
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{session.closingValidationNotes}</div>
        </div>
      )}
    </div>
  );
}
