import { useMemo } from 'react';
import {
  Banknote, CreditCard, Phone as PhoneIcon, Wifi, TrendingUp, TrendingDown,
  Clock, User, Store,
} from 'lucide-react';
import type { TpvRegisterSession, TpvRegisterSummary } from '../../lib/deliveryApi';
import {
  aggregatorRowsFromClosingTotals,
  getClosingAggregatorPlatforms,
  type AggregatorCashRow,
} from '../../lib/deliveryIntegrationsUi';
import { AggregatorCashSummary } from './AggregatorCashSummary';

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

function buildSummary(session: TpvRegisterSession): TpvRegisterSummary {
  const transactions = session.transactions || [];
  const sales = transactions.filter((t) => t.type === 'sale');
  const returns = transactions.filter((t) => t.type === 'return');
  const totalSales = sales.reduce((s, t) => s + Number(t.amount || 0), 0);
  const salesByChannel: Record<string, number> = {};
  for (const tx of sales) {
    if (tx.channel) salesByChannel[tx.channel] = (salesByChannel[tx.channel] || 0) + Number(tx.amount || 0);
  }
  return {
    totalSales,
    salesByMethod: {
      efectivo: sales.filter((t) => t.paymentMethod === 'efectivo').reduce((s, t) => s + Number(t.amount || 0), 0),
      tarjeta: sales.filter((t) => t.paymentMethod === 'tarjeta').reduce((s, t) => s + Number(t.amount || 0), 0),
      bizum: sales.filter((t) => t.paymentMethod === 'bizum').reduce((s, t) => s + Number(t.amount || 0), 0),
      online: sales.filter((t) => t.paymentMethod === 'online').reduce((s, t) => s + Number(t.amount || 0), 0),
      otro: sales.filter((t) => t.paymentMethod === 'otro').reduce((s, t) => s + Number(t.amount || 0), 0),
    },
    salesByChannel,
    totalReturns: returns.reduce((s, t) => s + Number(t.amount || 0), 0),
    returnCount: returns.length,
    totalCashIn: transactions.filter((t) => t.type === 'cash_in').reduce((s, t) => s + Number(t.amount || 0), 0),
    totalCashOut: transactions.filter((t) => t.type === 'cash_out' || t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0),
    totalTips: transactions.filter((t) => t.type === 'tip').reduce((s, t) => s + Number(t.amount || 0), 0),
    totalTransactions: transactions.length,
    averageTicket: sales.length > 0 ? totalSales / sales.length : 0,
    incidentCount: session.incidents?.length || 0,
  };
}

function resolveSessionSummary(session: TpvRegisterSession): TpvRegisterSummary {
  const built = buildSummary(session);
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

  const aggregatorRows = useMemo(() => {
    if (aggregatorRowsProp?.length) return aggregatorRowsProp;
    const totals = session.aggregatorClosingTotals || summary.salesByChannel;
    return aggregatorRowsFromClosingTotals(getClosingAggregatorPlatforms(), totals);
  }, [aggregatorRowsProp, session.aggregatorClosingTotals, summary.salesByChannel]);

  const cashReturns = transactions
    .filter((t) => t.type === 'return' && t.paymentMethod === 'efectivo')
    .reduce((s, t) => s + Number(t.amount || 0), 0);

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

      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2 text-sm">
        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Arqueo de efectivo</p>
        <div className="flex justify-between"><span className="text-gray-500">Fondo de apertura</span><span className="font-semibold">{fmtMoney(session.initialCashAmount)}€</span></div>
        <div className="flex justify-between"><span className="text-green-600">+ Cobros en efectivo</span><span className="font-semibold text-green-700">{fmtMoney(summary.salesByMethod.efectivo)}€</span></div>
        <div className="flex justify-between"><span className="text-blue-600">+ Entradas de efectivo</span><span className="font-semibold text-blue-700">{fmtMoney(summary.totalCashIn)}€</span></div>
        <div className="flex justify-between"><span className="text-red-600">− Devoluciones efectivo</span><span className="font-semibold text-red-700">{fmtMoney(cashReturns)}€</span></div>
        <div className="flex justify-between"><span className="text-orange-600">− Salidas de efectivo</span><span className="font-semibold text-orange-700">{fmtMoney(summary.totalCashOut)}€</span></div>
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between">
          <span className="text-gray-700 dark:text-gray-300 font-medium">Efectivo esperado</span>
          <span className="font-bold text-emerald-700 dark:text-emerald-400">{fmtMoney(session.expectedCash)}€</span>
        </div>
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
