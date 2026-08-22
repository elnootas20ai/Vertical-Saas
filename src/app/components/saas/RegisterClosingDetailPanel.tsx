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
import { buildBrandLabelsMap } from '../../lib/brandLabels';
import { DeliveryFoodUnitLabel } from './delivery/DeliveryFoodUnitIcon';
import { CajaCashMovementsList } from './caja/CajaCashMovementsList';
import { sessionToCajaAmounts } from '../../lib/cajaFacturacionExcelExport';
import { formatMoneyEs } from '../../lib/formatNumberEs';
import { cashWithdrawnAtClose } from '../../lib/tpvCajaScope';

const METHOD_CHIP =
  'bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600';

const METHOD_BADGES: Record<string, { icon: typeof Banknote; color: string; label: string }> = {
  efectivo: { icon: Banknote, color: METHOD_CHIP, label: 'Efectivo' },
  tarjeta: { icon: CreditCard, color: METHOD_CHIP, label: 'Tarjeta' },
  bizum: { icon: PhoneIcon, color: METHOD_CHIP, label: 'Bizum' },
  online: { icon: Wifi, color: METHOD_CHIP, label: 'Online' },
  otro: { icon: Wallet, color: METHOD_CHIP, label: 'Otros' },
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
  /** Bar/restaurante: sin Apps / Caja 2 / conteo delivery. */
  variant?: 'delivery' | 'restaurant';
}

export function RegisterClosingDetailPanel({
  session,
  aggregatorRows: aggregatorRowsProp,
  variant = 'delivery',
}: RegisterClosingDetailPanelProps) {
  const isRestaurant = variant === 'restaurant';
  const { currentBusiness } = useBusiness();
  const businessId =
    resolveBusinessScopeId(currentBusiness)
    || String(session.business_id || (session as { businessId?: string }).businessId || '').trim();
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
        setBrandLabels({
          ...(session.closingBrandLabels || {}),
          ...buildBrandLabelsMap(brands),
        });
        setBillingRules(splitRulesFromBillingConfig(billingConfig));
      })
      .catch(() => {
        if (!cancelled) {
          setBrandLabels({ ...(session.closingBrandLabels || {}) });
          setBillingRules(splitRulesFromBillingConfig(null));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, session.closingBrandLabels]);

  const brandBilling = useMemo(
    () => buildShiftBrandRevenue(session, shiftOrders, brandLabels, billingRules),
    [session, shiftOrders, brandLabels, billingRules],
  );

  const aggregatorRows = useMemo(() => {
    if (isRestaurant) return [] as AggregatorCashRow[];
    if (aggregatorRowsProp?.length) return aggregatorRowsProp;
    const totals = session.aggregatorClosingTotals || summary.salesByChannel;
    return aggregatorRowsFromClosingTotals(
      getClosingAggregatorPlatforms(),
      totals,
      session.aggregatorClosingCash,
      session.aggregatorClosingCard,
    );
  }, [
    isRestaurant,
    aggregatorRowsProp,
    session.aggregatorClosingTotals,
    session.aggregatorClosingCash,
    session.aggregatorClosingCard,
    summary.salesByChannel,
  ]);

  /** Conteos por app: los del cierre si existen; si no, estimado desde pedidos del turno. */
  const aggregatorFoodByChannel = useMemo(() => {
    if (isRestaurant) return {} as Record<string, FoodFamilyCounts>;
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
  }, [isRestaurant, session, shiftOrders]);

  const cashReturns = sumCashReturns(session);
  const cashStaffConsumption = sumCashStaffConsumption(session);
  const aggregatorCashTotal = useMemo(
    () => aggregatorRows.reduce((s, r) => s + (Number(r.cashSales) || 0), 0),
    [aggregatorRows],
  );
  const appsTotal = useMemo(
    () => (isRestaurant ? 0 : aggregatorRows.reduce((s, r) => s + (Number(r.totalSales) || 0), 0)),
    [isRestaurant, aggregatorRows],
  );
  /** Mismo TOTAL que el resumen Excel / «Caja cerrada» del TPV. */
  const excelAmounts = useMemo(() => sessionToCajaAmounts(session), [session]);
  const totalFacturacion = isRestaurant
    ? Number(summary.totalSales) || 0
    : Number(excelAmounts.total) || 0;
  const salaTotal = Math.round(
    (
      Number(excelAmounts.efectivo || 0)
      + Number(excelAmounts.tpv || 0)
      + Number(excelAmounts.x || 0)
    ) * 100,
  ) / 100;
  const tiendaTotal = isRestaurant ? totalFacturacion : salaTotal;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> {session.pointOfSaleName || 'Local'} · {session.terminalName}</span>
        <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" /> {session.workerName}</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {new Date(session.openedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
          {session.closedAt ? ` → ${new Date(session.closedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
        </span>
      </div>

      {/* 1) TOTAL facturación */}
      <div className="rounded-2xl border border-zinc-900/10 dark:border-zinc-100/10 bg-zinc-900 dark:bg-zinc-100 px-4 py-4 text-white dark:text-zinc-900">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 dark:text-zinc-500">
          Total facturación
        </p>
        <p className="mt-1 text-3xl font-black tabular-nums tracking-tight">
          {formatMoneyEs(totalFacturacion)}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-zinc-200 dark:text-zinc-600">
          {isRestaurant ? (
            <span>Sala {formatMoneyEs(tiendaTotal)}</span>
          ) : (
            <>
              <span>Tienda {formatMoneyEs(tiendaTotal)}</span>
              <span>Apps {formatMoneyEs(appsTotal)}</span>
            </>
          )}
          {(summary.totalReturns || 0) > 0 ? (
            <span className="inline-flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              Dev. {formatMoneyEs(summary.totalReturns)}
            </span>
          ) : null}
        </div>
      </div>

      {/* 2) Entradas y salidas */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/40 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Entradas y salidas
          </p>
          <div className="flex gap-2 text-[11px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-600" />
              In {formatMoneyEs(summary.totalCashIn)}
            </span>
            <span className="inline-flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-rose-600" />
              Out {formatMoneyEs(summary.totalCashOut)}
            </span>
          </div>
        </div>
        <CajaCashMovementsList session={session} title="" />
      </div>

      {/* 3) Desglose */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Desglose del total
        </p>
        <div className={`grid grid-cols-1 gap-2.5 ${isRestaurant ? '' : 'sm:grid-cols-2'}`}>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                {!isRestaurant ? (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Caja 1</p>
                ) : null}
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {isRestaurant ? 'Sala (TPV)' : 'Tienda (TPV)'}
                </p>
              </div>
              <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {formatMoneyEs(summary.totalSales)}
              </p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-2 text-emerald-700 dark:text-emerald-300">
                <span className="font-semibold">Efectivo</span>
                <span className="font-semibold tabular-nums">{formatMoneyEs(summary.salesByMethod.efectivo)}</span>
              </div>
              <div className="flex justify-between gap-2 text-sky-700 dark:text-sky-300">
                <span className="font-semibold">Tarjeta</span>
                <span className="font-semibold tabular-nums">{formatMoneyEs(summary.salesByMethod.tarjeta)}</span>
              </div>
              {(summary.salesByMethod.bizum || 0) > 0 ? (
                <div className="flex justify-between gap-2 text-zinc-500">
                  <span>Bizum</span>
                  <span className="font-semibold tabular-nums">{formatMoneyEs(summary.salesByMethod.bizum)}</span>
                </div>
              ) : null}
              {(summary.salesByMethod.otro || 0) > 0 ? (
                <div className="flex justify-between gap-2 text-zinc-500">
                  <span>Otros</span>
                  <span className="font-semibold tabular-nums">{formatMoneyEs(summary.salesByMethod.otro)}</span>
                </div>
              ) : null}
            </div>
            {!ordersLoading && brandBilling.rows.length > 0 ? (
              <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1.5 space-y-0.5">
                {brandBilling.rows.map((row) => (
                  <div key={row.brandId} className="flex justify-between gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                    <span className="truncate">{row.name}</span>
                    <span className="tabular-nums font-semibold shrink-0">{formatMoneyEs(row.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {!isRestaurant ? (
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/30 p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-500/80">Caja 2</p>
                  <p className="text-sm font-bold text-blue-950 dark:text-blue-50">Apps (hecho en app)</p>
                </div>
                <p className="text-lg font-semibold tabular-nums text-blue-950 dark:text-blue-50">
                  {formatMoneyEs(appsTotal)}
                </p>
              </div>
              <div className="space-y-1 text-xs">
                {aggregatorRows.map((r) => {
                  const amt = Number(r.totalSales) || 0;
                  if (amt <= 0) return null;
                  return (
                    <div key={r.platform.channel} className="flex justify-between gap-2 text-blue-900/80 dark:text-blue-100/80">
                      <span className="font-semibold truncate">{r.platform.label}</span>
                      <span className="font-semibold tabular-nums shrink-0">{formatMoneyEs(amt)}</span>
                    </div>
                  );
                })}
                {aggregatorCashTotal > 0 ? (
                  <div className="flex justify-between gap-2 text-emerald-700 dark:text-emerald-300">
                    <span className="font-semibold">No pagado efectivo → cajón</span>
                    <span className="font-semibold tabular-nums">{formatMoneyEs(aggregatorCashTotal)}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap text-xs">
        {Object.entries(summary.salesByMethod).map(([method, amount]) => {
          if (amount <= 0) return null;
          const badge = METHOD_BADGES[method];
          if (!badge) return null;
          const Icon = badge.icon;
          return (
            <span key={method} className={`px-2 py-0.5 rounded-md font-medium flex items-center gap-1 ${badge.color}`}>
              <Icon className="w-3 h-3 opacity-70" /> {badge.label}: {formatMoneyEs(amount)}
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
          title={isRestaurant ? 'Ventas por marca' : 'Caja 1 · por marca'}
        />
      ) : null}

      {!isRestaurant && (session.productClosingCounts || shiftOrders.length > 0) ? (
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
      ) : null}

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/50 p-4 space-y-2 text-sm">
        <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Arqueo de efectivo</p>
        <div className="flex justify-between"><span className="text-zinc-500">Fondo de apertura</span><span className="font-semibold tabular-nums">{formatMoneyEs(session.initialCashAmount)}</span></div>
        <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">+ Cobros en efectivo</span><span className="font-semibold tabular-nums">{formatMoneyEs(summary.salesByMethod.efectivo)}</span></div>
        {cashStaffConsumption > 0 && (
          <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">+ Consumo equipo (efectivo)</span><span className="font-semibold tabular-nums">{formatMoneyEs(cashStaffConsumption)}</span></div>
        )}
        <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">+ Entradas de efectivo</span><span className="font-semibold tabular-nums">{formatMoneyEs(summary.totalCashIn)}</span></div>
        <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">− Devoluciones efectivo</span><span className="font-semibold tabular-nums">{formatMoneyEs(cashReturns)}</span></div>
        <div className="flex justify-between"><span className="text-zinc-600 dark:text-zinc-300">− Salidas de efectivo</span><span className="font-semibold tabular-nums">{formatMoneyEs(summary.totalCashOut)}</span></div>
        <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 flex justify-between">
          <span className="text-zinc-700 dark:text-zinc-300 font-medium">Efectivo esperado</span>
          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatMoneyEs(session.expectedCash)}</span>
        </div>
        {!isRestaurant && aggregatorCashTotal > 0 ? (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            Incluye {formatMoneyEs(aggregatorCashTotal)} de efectivo de integradores
          </p>
        ) : null}
        <div className="flex justify-between">
          <span className="text-zinc-700 dark:text-zinc-300 font-medium">Efectivo contado</span>
          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{formatMoneyEs(session.finalCashAmount)}</span>
        </div>
        {session.nextDayInitialCash != null ? (
          <div className="flex justify-between">
            <span className="text-emerald-700 dark:text-emerald-300 font-medium">Fondo que queda en caja</span>
            <span className="font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
              {formatMoneyEs(session.nextDayInitialCash)}
            </span>
          </div>
        ) : null}
        {(() => {
          const withdrawn = cashWithdrawnAtClose(session);
          if (withdrawn == null) return null;
          return (
            <div className="flex justify-between">
              <span className="text-rose-700 dark:text-rose-300 font-medium">Se retira</span>
              <span className="font-semibold tabular-nums text-rose-700 dark:text-rose-300">
                {formatMoneyEs(withdrawn)}
              </span>
            </div>
          );
        })()}
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
            {(Number(session.difference) || 0) >= 0 ? '+' : ''}{formatMoneyEs(session.difference)}
          </span>
        </div>
      </div>

      {!isRestaurant ? (
        <AggregatorCashSummary
          rows={aggregatorRows}
          foodByChannel={aggregatorFoodByChannel}
          title="Caja 2 · apps (declarado en cierre)"
        />
      ) : null}

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
