import { useMemo, useState, useEffect } from 'react';
import {
  Banknote, CreditCard, Phone as PhoneIcon, Wifi, Wallet, TrendingUp, TrendingDown,
  Clock, User, Store,
} from 'lucide-react';
import type { DeliveryOrder, TpvRegisterSession, TpvRegisterSummary } from '../../lib/deliveryApi';
import { fetchShiftOrdersForSession } from '../../lib/registerShiftOrders';
import {
  AGGREGATOR_PLATFORMS,
  aggregatorRowsFromClosingTotals,
  getClosingAggregatorPlatforms,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import { AggregatorCashSummary } from './AggregatorCashSummary';
import { RegisterShiftSalesBreakdown } from './RegisterShiftSalesBreakdown';
import { buildTpvRegisterSummary, sumCashReturns, sumCashStaffConsumption } from '../../lib/tpvCajaMath';
import {
  buildShiftFoodFamilyReportForSession,
  emptyFoodFamilyCounts,
  type FoodFamilyCounts,
} from '../../lib/shiftFoodFamilyCounts';
import { buildShiftBrandRevenue } from '../../lib/registerShiftBrandBilling';
import { listBrandsRequest } from '../../lib/brandApi';
import { getBrandBillingConfigRequest } from '../../lib/brandBillingApi';
import {
  splitRulesFromBillingConfig,
  type BrandBillingSplitRules,
} from '../../lib/brandBillingConfig';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { ShiftBrandBillingSummary } from './ShiftBrandBillingSummary';
import { DeliveryFoodUnitLabel } from './delivery/DeliveryFoodUnitIcon';

const METHOD_CHIP =
  'bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600';

const METHOD_BADGES: Record<string, { icon: typeof Banknote; color: string; label: string }> = {
  efectivo: { icon: Banknote, color: METHOD_CHIP, label: 'Efectivo' },
  tarjeta: { icon: CreditCard, color: METHOD_CHIP, label: 'Tarjeta' },
  bizum: { icon: PhoneIcon, color: METHOD_CHIP, label: 'Bizum' },
  online: { icon: Wifi, color: METHOD_CHIP, label: 'Online' },
  otro: { icon: Wallet, color: METHOD_CHIP, label: 'Otros' },
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
  const { currentBusiness } = useBusiness();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const summary = useMemo(() => resolveSessionSummary(session), [session]);
  const transactions = session.transactions || [];
  const cashCounts = session.cashCounts || [];
  const incidents = session.incidents || [];
  const [shiftOrders, setShiftOrders] = useState<DeliveryOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [brandLabels, setBrandLabels] = useState<Record<string, string>>({});
  const [billingRules, setBillingRules] = useState<BrandBillingSplitRules>(() =>
    splitRulesFromBillingConfig(null),
  );

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

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    void Promise.all([
      listBrandsRequest(businessId),
      getBrandBillingConfigRequest(businessId).catch(() => null),
    ])
      .then(([brands, billingConfig]) => {
        if (cancelled) return;
        const labels: Record<string, string> = {};
        for (const b of brands) {
          const id = String(b._id || b.id || '').trim();
          if (id) labels[id] = b.name;
        }
        setBrandLabels(labels);
        setBillingRules(splitRulesFromBillingConfig(billingConfig));
      })
      .catch(() => {
        if (!cancelled) {
          setBrandLabels({});
          setBillingRules(splitRulesFromBillingConfig(null));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const brandBilling = useMemo(
    () => buildShiftBrandRevenue(session, shiftOrders, brandLabels, billingRules),
    [session, shiftOrders, brandLabels, billingRules],
  );

  const aggregatorRows = useMemo(() => {
    if (aggregatorRowsProp?.length) return aggregatorRowsProp;
    const totals = session.aggregatorClosingTotals || summary.salesByChannel;
    return aggregatorRowsFromClosingTotals(
      getClosingAggregatorPlatforms(),
      totals,
      session.aggregatorClosingCash,
      session.aggregatorClosingCard,
    );
  }, [
    aggregatorRowsProp,
    session.aggregatorClosingTotals,
    session.aggregatorClosingCash,
    session.aggregatorClosingCard,
    summary.salesByChannel,
  ]);

  /** Conteos por app: los del cierre si existen; si no, estimado desde pedidos del turno. */
  const aggregatorFoodByChannel = useMemo(() => {
    const saved = session.productClosingCounts?.byChannel;
    const out: Record<string, FoodFamilyCounts> = {};
    for (const platform of AGGREGATOR_PLATFORMS) {
      const ch = platform.channel;
      const fromSaved = saved?.[ch];
      if (fromSaved) {
        out[ch] = {
          pizza: Math.max(0, Math.floor(Number(fromSaved.pizza) || 0)),
          burger: Math.max(0, Math.floor(Number(fromSaved.burger) || 0)),
          taco: Math.max(0, Math.floor(Number(fromSaved.taco) || 0)),
        };
      } else {
        out[ch] = emptyFoodFamilyCounts();
      }
    }
    const hasSaved = Object.values(out).some((c) => c.pizza + c.burger + c.taco > 0);
    if (hasSaved) return out;
    const fromOrders = buildShiftFoodFamilyReportForSession(session, shiftOrders).byAggregator;
    for (const platform of AGGREGATOR_PLATFORMS) {
      const ch = platform.channel;
      out[ch] = fromOrders[ch] || emptyFoodFamilyCounts();
    }
    return out;
  }, [session, shiftOrders]);

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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          {
            label: 'Ventas TPV',
            value: `${fmtMoney(summary.totalSales)}€`,
            icon: <TrendingUp className="w-3 h-3" />,
          },
          {
            label: 'Devoluciones',
            value: `${fmtMoney(summary.totalReturns)}€`,
            icon: <TrendingDown className="w-3 h-3" />,
          },
          { label: 'Entradas efectivo', value: `${fmtMoney(summary.totalCashIn)}€` },
          { label: 'Salidas efectivo', value: `${fmtMoney(summary.totalCashOut)}€` },
        ].map((card) => (
          <div
            key={card.label}
            className="p-3 rounded-lg border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/50"
          >
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              {card.icon}
              {card.label}
            </div>
            <div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 flex-wrap text-xs">
        {Object.entries(summary.salesByMethod).map(([method, amount]) => {
          if (amount <= 0) return null;
          const badge = METHOD_BADGES[method];
          if (!badge) return null;
          const Icon = badge.icon;
          return (
            <span key={method} className={`px-2 py-0.5 rounded-md font-medium flex items-center gap-1 ${badge.color}`}>
              <Icon className="w-3 h-3 opacity-70" /> {badge.label}: {fmtMoney(amount)}€
            </span>
          );
        })}
        <span className={`px-2 py-0.5 rounded-md font-medium ${METHOD_CHIP}`}>
          {summary.totalTransactions} operaciones
        </span>
      </div>

      <RegisterShiftSalesBreakdown
        session={session}
        orders={shiftOrders}
        loading={ordersLoading}
        registerSummary={summary}
      />

      {!ordersLoading && (brandBilling.rows.length > 0 || brandBilling.unbranded > 0) ? (
        <ShiftBrandBillingSummary
          rows={brandBilling.rows}
          unbranded={brandBilling.unbranded}
          total={brandBilling.total}
        />
      ) : null}

      {(session.productClosingCounts || shiftOrders.length > 0) && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-900/40 p-3">
          <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
            Conteo pizzas / burgers / tacos
          </p>
          <div className="flex flex-wrap gap-3 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            <DeliveryFoodUnitLabel unit="pizza" count={session.productClosingCounts?.pizza ?? '—'} />
            <DeliveryFoodUnitLabel unit="burger" count={session.productClosingCounts?.burger ?? '—'} />
            <DeliveryFoodUnitLabel unit="taco" count={session.productClosingCounts?.taco ?? '—'} />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/50 p-4 space-y-2 text-sm">
        <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Arqueo de efectivo</p>
        <div className="flex justify-between"><span className="text-zinc-500">Fondo de apertura</span><span className="font-semibold tabular-nums">{fmtMoney(session.initialCashAmount)}€</span></div>
        <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">+ Cobros en efectivo</span><span className="font-semibold tabular-nums">{fmtMoney(summary.salesByMethod.efectivo)}€</span></div>
        {cashStaffConsumption > 0 && (
          <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">+ Consumo equipo (efectivo)</span><span className="font-semibold tabular-nums">{fmtMoney(cashStaffConsumption)}€</span></div>
        )}
        <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">+ Entradas de efectivo</span><span className="font-semibold tabular-nums">{fmtMoney(summary.totalCashIn)}€</span></div>
        <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">− Devoluciones efectivo</span><span className="font-semibold tabular-nums">{fmtMoney(cashReturns)}€</span></div>
        <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">− Salidas de efectivo</span><span className="font-semibold tabular-nums">{fmtMoney(summary.totalCashOut)}€</span></div>
        {(() => {
          const cashOuts = transactions
            .filter((t) => t.type === 'cash_out' || t.type === 'expense')
            .slice()
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          if (cashOuts.length === 0) return null;
          return (
            <div className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 p-2.5 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Detalle salidas (motivo)
              </p>
              {cashOuts.map((tx) => (
                <div key={tx.id} className="flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 break-words">
                      {tx.description?.trim() || 'Sin motivo indicado'}
                    </p>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      {new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}
                      {tx.registeredBy ? ` · ${tx.registeredBy}` : ''}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200 shrink-0">
                    −{fmtMoney(tx.amount)}€
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
        <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 flex justify-between">
          <span className="text-zinc-700 dark:text-zinc-300 font-medium">Efectivo esperado</span>
          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{fmtMoney(session.expectedCash)}€</span>
        </div>
        {aggregatorCashTotal > 0 ? (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Incluye {fmtMoney(aggregatorCashTotal)}€ de efectivo de integradores
          </p>
        ) : null}
        <div className="flex justify-between">
          <span className="text-zinc-700 dark:text-zinc-300 font-medium">Efectivo contado</span>
          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{fmtMoney(session.finalCashAmount)}€</span>
        </div>
        <div
          className={`flex justify-between p-2 rounded-lg border ${
            session.difference === 0
              ? 'border-zinc-200 bg-zinc-100/80 dark:border-zinc-600 dark:bg-zinc-800/60'
              : 'border-zinc-300 bg-zinc-100 dark:border-zinc-500 dark:bg-zinc-800'
          }`}
        >
          <span className="font-semibold text-zinc-800 dark:text-zinc-100">Diferencia</span>
          <span
            className={`font-semibold tabular-nums ${
              session.difference === 0
                ? 'text-zinc-700 dark:text-zinc-200'
                : 'text-zinc-900 dark:text-zinc-50 underline decoration-zinc-400 underline-offset-2'
            }`}
          >
            {(Number(session.difference) || 0) >= 0 ? '+' : ''}{fmtMoney(session.difference)}€
          </span>
        </div>
      </div>

      <AggregatorCashSummary
        rows={aggregatorRows}
        foodByChannel={aggregatorFoodByChannel}
        title="Cajas agregadores (declarado en cierre)"
      />

      {transactions.some((t) => t.type === 'cash_in' || t.type === 'cash_out' || t.type === 'return') && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Movimientos de caja</h4>
          <div className="space-y-1">
            {transactions
              .filter((t) => t.type === 'cash_in' || t.type === 'cash_out' || t.type === 'return')
              .slice()
              .reverse()
              .map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-xs p-2 rounded-lg border border-zinc-100 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-zinc-400 shrink-0">{new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${METHOD_CHIP}`}>
                      {TPV_TX_LABELS[tx.type] || tx.type}
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-400 truncate">{tx.description || '—'}</span>
                  </div>
                  <span className="font-semibold tabular-nums shrink-0 text-zinc-900 dark:text-zinc-100">
                    {tx.type === 'cash_in' ? '+' : '−'}{fmtMoney(tx.amount)}€
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {cashCounts.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Arqueos intermedios</h4>
          <div className="space-y-1">
            {cashCounts.map((cc) => (
              <div key={cc.id} className="flex items-center justify-between text-xs p-2 rounded-lg border border-zinc-100 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50">
                <span className="text-zinc-500">{new Date(cc.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {cc.countedBy}{cc.notes ? ` · ${cc.notes}` : ''}</span>
                <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {(Number(cc.difference) || 0) >= 0 ? '+' : ''}{fmtMoney(cc.difference)}€
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {incidents.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Incidencias</h4>
          <div className="space-y-1">
            {incidents.map((inc) => (
              <div key={inc.id} className="flex items-center justify-between text-xs p-2 rounded-lg border border-zinc-100 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${METHOD_CHIP}`}>
                    {inc.severity === 'high' ? 'Alta' : inc.severity === 'medium' ? 'Media' : 'Baja'}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400 truncate">{inc.description}</span>
                </div>
                {inc.amount != null && <span className="font-semibold tabular-nums shrink-0 ml-2">{fmtMoney(inc.amount)}€</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {session.closingNotes && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/40 p-3">
          <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-1">Notas del trabajador</div>
          <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{session.closingNotes}</div>
        </div>
      )}

      {session.closingValidationNotes && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/40 p-3">
          <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-1">Notas del gerente</div>
          <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{session.closingValidationNotes}</div>
        </div>
      )}
    </div>
  );
}
