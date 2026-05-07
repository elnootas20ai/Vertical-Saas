import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import {
  listTpvRegisterSessionsRequest,
  updateTpvRegisterSessionRequest,
  listPointsOfSaleRequest,
  listDriverCashSessionsRequest,
  getDeliveryConfigRequest,
  updateDeliveryConfigRequest,
  type TpvRegisterSession,
  type TpvRegisterSummary,
  type PointOfSale,
  type DriverCashSession,
  type TpvIncident,
  type DeliveryConfig,
} from '../../lib/deliveryApi';
import {
  Banknote, CreditCard, Phone as PhoneIcon, Wifi, User, Monitor,
  Store, Clock, BarChart3, AlertTriangle, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Filter, Download, Calendar, Eye,
  ShieldCheck, ShieldX, MessageSquare, TrendingUp, TrendingDown, Hash,
  Truck, MapPin, Settings, Save, Bell,
  ArrowLeft,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcExpectedCash(session: TpvRegisterSession): number {
  const cashSales = session.transactions
    .filter(t => t.type === 'sale' && t.paymentMethod === 'efectivo')
    .reduce((s, t) => s + t.amount, 0);
  const cashReturns = session.transactions
    .filter(t => t.type === 'return' && t.paymentMethod === 'efectivo')
    .reduce((s, t) => s + t.amount, 0);
  const cashIn = session.transactions.filter(t => t.type === 'cash_in').reduce((s, t) => s + t.amount, 0);
  const cashOut = session.transactions.filter(t => t.type === 'cash_out' || t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return session.initialCashAmount + cashSales - cashReturns + cashIn - cashOut;
}

function buildSummary(session: TpvRegisterSession): TpvRegisterSummary {
  const sales = session.transactions.filter(t => t.type === 'sale');
  const returns = session.transactions.filter(t => t.type === 'return');
  const totalSales = sales.reduce((s, t) => s + t.amount, 0);
  const salesByChannel: Record<string, number> = {};
  for (const tx of sales) {
    if (tx.channel) salesByChannel[tx.channel] = (salesByChannel[tx.channel] || 0) + tx.amount;
  }
  return {
    totalSales,
    salesByMethod: {
      efectivo: sales.filter(t => t.paymentMethod === 'efectivo').reduce((s, t) => s + t.amount, 0),
      tarjeta: sales.filter(t => t.paymentMethod === 'tarjeta').reduce((s, t) => s + t.amount, 0),
      bizum: sales.filter(t => t.paymentMethod === 'bizum').reduce((s, t) => s + t.amount, 0),
      online: sales.filter(t => t.paymentMethod === 'online').reduce((s, t) => s + t.amount, 0),
      otro: sales.filter(t => t.paymentMethod === 'otro').reduce((s, t) => s + t.amount, 0),
    },
    salesByChannel,
    totalReturns: returns.reduce((s, t) => s + t.amount, 0),
    returnCount: returns.length,
    totalCashIn: session.transactions.filter(t => t.type === 'cash_in').reduce((s, t) => s + t.amount, 0),
    totalCashOut: session.transactions.filter(t => t.type === 'cash_out' || t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    totalTips: session.transactions.filter(t => t.type === 'tip').reduce((s, t) => s + t.amount, 0),
    totalTransactions: session.transactions.length,
    averageTicket: sales.length > 0 ? totalSales / sales.length : 0,
    incidentCount: session.incidents?.length || 0,
  };
}

const METHOD_BADGES: Record<string, { icon: typeof Banknote; color: string; label: string }> = {
  efectivo: { icon: Banknote, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: 'Efectivo' },
  tarjeta: { icon: CreditCard, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Tarjeta' },
  bizum: { icon: PhoneIcon, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: 'Bizum' },
  online: { icon: Wifi, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', label: 'Online' },
};

// ─── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'gray' }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    green: 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800',
    gray: 'bg-gray-50 dark:bg-gray-900/30 border-gray-100 dark:border-gray-800',
  };
  return (
    <div className={`p-4 rounded-xl border ${colors[color] || colors.gray}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</div>
      <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Open Register Card ──────────────────────────────────────────────────────

function RegisterCard({ session, isDriver = false }: { session: TpvRegisterSession | DriverCashSession; isDriver?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  if (isDriver) {
    const ds = session as DriverCashSession;
    const expected = ds.initialFloat + (ds.transactions?.reduce((s, t) => s + (t.type === 'collection' ? t.amount : -t.amount), 0) || 0);
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Truck className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {ds.driverName}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${ds.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{ds.status === 'open' ? 'Abierta' : 'Cerrada'}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <span>Flotante: {ds.initialFloat.toFixed(2)}€</span>
                <span>·</span>
                <span>Esperado: {expected.toFixed(2)}€</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const ts = session as TpvRegisterSession;
  const expected = calcExpectedCash(ts);
  const summary = buildSummary(ts);
  const incidentCount = ts.incidents?.filter(i => !i.resolvedAt).length || 0;
  const lastCount = ts.cashCounts[ts.cashCounts.length - 1];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ts.status === 'open' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
              <Store className={`w-5 h-5 ${ts.status === 'open' ? 'text-emerald-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {ts.pointOfSaleName ? `${ts.pointOfSaleName} — ` : ''}{ts.terminalName}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${ts.status === 'open' ? 'bg-green-100 text-green-700' : ts.closingValidationStatus === 'validated' ? 'bg-blue-100 text-blue-700' : ts.closingValidationStatus === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                  {ts.status === 'open' ? 'Abierta' : ts.closingValidationStatus === 'validated' ? 'Validada' : ts.closingValidationStatus === 'rejected' ? 'Rechazada' : 'Cerrada'}
                </span>
                {incidentCount > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">{incidentCount} inc.</span>}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1"><User className="w-3 h-3" /> {ts.workerName}</span>
                <span>·</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(ts.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })}{ts.closedAt ? ` — ${new Date(ts.closedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })}` : ''}</span>
                <span>·</span>
                <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {summary.totalTransactions} ops</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{summary.totalSales.toFixed(2)}€</div>
              <div className="text-xs text-gray-500">
                {ts.status === 'closed' && (
                  <span className={`font-semibold ${ts.difference === 0 ? 'text-green-600' : Math.abs(ts.difference) > 20 ? 'text-red-600' : 'text-amber-600'}`}>
                    Dif: {ts.difference >= 0 ? '+' : ''}{ts.difference.toFixed(2)}€
                  </span>
                )}
                {ts.status === 'open' && <span className="text-emerald-600 font-semibold">Efectivo: {expected.toFixed(2)}€</span>}
              </div>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>

        <div className="flex gap-1.5 flex-wrap mt-3">
          {Object.entries(summary.salesByMethod).map(([method, amount]) => {
            if (amount <= 0) return null;
            const badge = METHOD_BADGES[method];
            if (!badge) return null;
            const Icon = badge.icon;
            return (
              <span key={method} className={`px-2 py-0.5 rounded-lg text-[11px] font-medium flex items-center gap-1 ${badge.color}`}>
                <Icon className="w-3 h-3" /> {badge.label}: {amount.toFixed(2)}€
              </span>
            );
          })}
          {lastCount && (
            <span className={`px-2 py-0.5 rounded-lg text-[11px] font-medium ${lastCount.difference === 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              Último arqueo: {lastCount.difference >= 0 ? '+' : ''}{lastCount.difference.toFixed(2)}€
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-4">
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Transacciones recientes</h4>
            <div className="space-y-1">
              {ts.transactions.slice(-10).reverse().map(tx => (
                <div key={tx.id} className="flex items-center justify-between text-xs py-1.5 px-2 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-10">{new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tx.type === 'sale' ? 'bg-green-100 text-green-700' : tx.type === 'return' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{tx.type}</span>
                    <span className="text-gray-600 dark:text-gray-400 truncate max-w-[200px]">{tx.description || tx.orderNumber || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {tx.channel && <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{tx.channel}</span>}
                    <span className={`font-semibold ${tx.type === 'return' || tx.type === 'cash_out' || tx.type === 'expense' ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                      {tx.type === 'return' || tx.type === 'cash_out' || tx.type === 'expense' ? '-' : '+'}{tx.amount.toFixed(2)}€
                    </span>
                    <span className="text-[10px] text-gray-400">{tx.paymentMethod}</span>
                  </div>
                </div>
              ))}
              {ts.transactions.length === 0 && <div className="text-xs text-gray-400 text-center py-4">Sin transacciones</div>}
            </div>
          </div>

          {ts.cashCounts.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Arqueos</h4>
              <div className="space-y-1">
                {ts.cashCounts.map(cc => (
                  <div key={cc.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <span className="text-gray-500">{new Date(cc.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {cc.countedBy}{cc.notes ? ` · ${cc.notes}` : ''}</span>
                    <span className={`font-semibold ${cc.difference === 0 ? 'text-green-600' : cc.difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {cc.difference >= 0 ? '+' : ''}{cc.difference.toFixed(2)}€
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(ts.incidents?.length || 0) > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Incidencias</h4>
              <div className="space-y-1">
                {ts.incidents.map(inc => (
                  <div key={inc.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${inc.severity === 'high' ? 'bg-red-100 text-red-700' : inc.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                        {inc.severity === 'high' ? 'Alta' : inc.severity === 'medium' ? 'Media' : 'Baja'}
                      </span>
                      <span className="text-gray-600 truncate max-w-[250px]">{inc.description}</span>
                    </div>
                    <span className={`text-[10px] font-semibold ${inc.resolvedAt ? 'text-green-600' : 'text-amber-600'}`}>{inc.resolvedAt ? 'Resuelta' : 'Abierta'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Validation Modal ──────────────────────────────────────────────────────

function ValidationModal({ session, onValidate, onReject, onCancel }: {
  session: TpvRegisterSession;
  onValidate: (notes: string) => void;
  onReject: (notes: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState('');
  const summary = buildSummary(session);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-blue-500" /> Validar cierre de caja</h2>
          <p className="text-xs text-gray-500 mt-1">{session.pointOfSaleName ? `${session.pointOfSaleName} · ` : ''}{session.terminalName} · {session.workerName} · {new Date(session.closedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <div className="text-xs text-green-600">Ventas</div>
              <div className="text-lg font-bold text-green-700">{summary.totalSales.toFixed(2)}€</div>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <div className="text-xs text-red-600">Devoluciones</div>
              <div className="text-lg font-bold text-red-700">{summary.totalReturns.toFixed(2)}€</div>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <div className="text-xs text-blue-600">Operaciones</div>
              <div className="text-lg font-bold text-blue-700">{summary.totalTransactions}</div>
            </div>
            <div className={`p-3 rounded-xl ${session.difference === 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              <div className="text-xs text-gray-600">Diferencia</div>
              <div className={`text-lg font-bold ${session.difference === 0 ? 'text-green-700' : 'text-red-700'}`}>{session.difference >= 0 ? '+' : ''}{session.difference.toFixed(2)}€</div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Fondo apertura</span><span className="font-semibold">{session.initialCashAmount.toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Efectivo esperado</span><span className="font-semibold">{session.expectedCash.toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Efectivo contado</span><span className="font-semibold">{session.finalCashAmount.toFixed(2)}€</span></div>
          </div>

          <div className="flex gap-1.5 flex-wrap text-xs">
            {Object.entries(summary.salesByMethod).map(([method, amount]) => {
              if (amount <= 0) return null;
              const badge = METHOD_BADGES[method];
              if (!badge) return null;
              const Icon = badge.icon;
              return <span key={method} className={`px-2 py-0.5 rounded-lg font-medium flex items-center gap-1 ${badge.color}`}><Icon className="w-3 h-3" /> {badge.label}: {amount.toFixed(2)}€</span>;
            })}
          </div>

          {session.cashCounts.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Arqueos realizados</h4>
              {session.cashCounts.map(cc => (
                <div key={cc.id} className="text-xs text-gray-500 py-1">{new Date(cc.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — Dif: <span className={cc.difference === 0 ? 'text-green-600' : 'text-red-600'}>{cc.difference >= 0 ? '+' : ''}{cc.difference.toFixed(2)}€</span></div>
              ))}
            </div>
          )}

          {session.closingNotes && (
            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl">
              <div className="text-xs font-bold text-amber-700 mb-1">Notas del trabajador</div>
              <div className="text-sm text-gray-700 dark:text-gray-300">{session.closingNotes}</div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notas del gerente</label>
            <textarea rows={2} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
              placeholder="Observaciones..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex-shrink-0 p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button onClick={onCancel} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={() => onReject(notes)} className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"><ShieldX className="w-4 h-4" /> Rechazar</button>
          <button onClick={() => onValidate(notes)} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"><ShieldCheck className="w-4 h-4" /> Validar cierre</button>
        </div>
      </div>
    </div>
  );
}

// ─── Config Tab ──────────────────────────────────────────────────────────────

function CashRegisterConfigTab({ config, onSave, saving }: {
  config?: DeliveryConfig['cashRegisterAlerts'];
  onSave: (cfg: DeliveryConfig['cashRegisterAlerts']) => void;
  saving: boolean;
}) {
  const [local, setLocal] = useState<NonNullable<DeliveryConfig['cashRegisterAlerts']>>({
    registerNotOpenedEnabled: true,
    registerNotOpenedCheckHour: 10,
    registerNotClosedEnabled: true,
    registerNotClosedCheckHour: 23,
    discrepancyEnabled: true,
    discrepancyThreshold: 20,
    highReturnEnabled: true,
    highReturnThreshold: 50,
    unpaidDeliveryEnabled: true,
    autoCreateFinanceOnClose: true,
    ...config,
  });

  const update = (key: string, val: boolean | number) => setLocal(prev => ({ ...prev, [key]: val }));

  const inputCls = 'w-20 px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-center text-sm font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none';

  const toggleCls = (enabled: boolean) =>
    `relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`;

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" className={toggleCls(checked)} onClick={() => onChange(!checked)}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Bell className="w-4 h-4 text-blue-500" /> Alertas de caja</h3>
          <p className="text-xs text-gray-500 mt-1">Configura cuándo se generan alertas automáticas</p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Caja sin abrir</div>
              <div className="text-xs text-gray-500 mt-0.5">Alerta si un terminal no abre su caja antes de una hora determinada</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Hora:</span>
                <input type="number" min={6} max={14} className={inputCls} value={local.registerNotOpenedCheckHour} onChange={e => update('registerNotOpenedCheckHour', Number(e.target.value))} />
                <span>h</span>
              </div>
              <Toggle checked={!!local.registerNotOpenedEnabled} onChange={v => update('registerNotOpenedEnabled', v)} />
            </div>
          </div>

          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Caja sin cerrar</div>
              <div className="text-xs text-gray-500 mt-0.5">Alerta si una caja lleva más de 14h abierta</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Verificar a las:</span>
                <input type="number" min={18} max={23} className={inputCls} value={local.registerNotClosedCheckHour} onChange={e => update('registerNotClosedCheckHour', Number(e.target.value))} />
                <span>h</span>
              </div>
              <Toggle checked={!!local.registerNotClosedEnabled} onChange={v => update('registerNotClosedEnabled', v)} />
            </div>
          </div>

          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Descuadre de caja</div>
              <div className="text-xs text-gray-500 mt-0.5">Alerta cuando la diferencia de cierre supera un umbral</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Umbral:</span>
                <input type="number" min={1} step={5} className={inputCls} value={local.discrepancyThreshold} onChange={e => update('discrepancyThreshold', Number(e.target.value))} />
                <span>€</span>
              </div>
              <Toggle checked={!!local.discrepancyEnabled} onChange={v => update('discrepancyEnabled', v)} />
            </div>
          </div>

          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Devolución elevada</div>
              <div className="text-xs text-gray-500 mt-0.5">Alerta cuando las devoluciones del día superan un importe</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Umbral:</span>
                <input type="number" min={10} step={10} className={inputCls} value={local.highReturnThreshold} onChange={e => update('highReturnThreshold', Number(e.target.value))} />
                <span>€</span>
              </div>
              <Toggle checked={!!local.highReturnEnabled} onChange={v => update('highReturnEnabled', v)} />
            </div>
          </div>

          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pedido entregado sin cobrar</div>
              <div className="text-xs text-gray-500 mt-0.5">Alerta cuando un pedido de delivery se entrega sin registrar cobro</div>
            </div>
            <Toggle checked={!!local.unpaidDeliveryEnabled} onChange={v => update('unpaidDeliveryEnabled', v)} />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Settings className="w-4 h-4 text-gray-500" /> Automatización</h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          <div className="p-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Generar asiento financiero al cerrar</div>
              <div className="text-xs text-gray-500 mt-0.5">Crea automáticamente un movimiento de cobro en Finanzas al cerrar cada caja</div>
            </div>
            <Toggle checked={!!local.autoCreateFinanceOnClose} onChange={v => update('autoCreateFinanceOnClose', v)} />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => onSave(local)} disabled={saving}
          className="px-6 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50">
          <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

type TabId = 'estado' | 'historial' | 'incidencias' | 'configuracion';

export function CajaPage() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<TpvRegisterSession[]>([]);
  const [driverSessions, setDriverSessions] = useState<DriverCashSession[]>([]);
  const [pointsOfSale, setPointsOfSale] = useState<PointOfSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('estado');
  const [filterPdv, setFilterPdv] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'closed'>('all');
  const [validatingSession, setValidatingSession] = useState<TpvRegisterSession | null>(null);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [sessData, pdvData, driverData, cfgData] = await Promise.all([
        listTpvRegisterSessionsRequest(userId),
        listPointsOfSaleRequest(userId),
        listDriverCashSessionsRequest(userId),
        getDeliveryConfigRequest(userId).catch(() => null),
      ]);
      setSessions(sessData);
      setPointsOfSale(pdvData);
      setDriverSessions(driverData);
      if (cfgData) setDeliveryConfig(cfgData);
    } catch {
      toast.error('Error al cargar datos de caja');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const todaySessions = useMemo(() => sessions.filter(s => s.openedAt?.startsWith(todayStr)), [sessions, todayStr]);
  const openSessions = useMemo(() => sessions.filter(s => s.status === 'open'), [sessions]);
  const openDriverSessions = useMemo(() => driverSessions.filter(s => s.status === 'open'), [driverSessions]);
  const pendingValidation = useMemo(() => sessions.filter(s => s.status === 'closed' && s.closingValidationStatus === 'pending'), [sessions]);
  const totalTerminals = useMemo(() => pointsOfSale.reduce((sum, p) => sum + p.terminals.filter(t => t.active).length, 0), [pointsOfSale]);

  const todayTotalSales = useMemo(() => todaySessions.reduce((sum, s) => {
    const sm = buildSummary(s);
    return sum + sm.totalSales;
  }, 0), [todaySessions]);

  const todayCashInRegisters = useMemo(() => openSessions.reduce((sum, s) => sum + calcExpectedCash(s), 0), [openSessions]);

  const todayByMethod = useMemo(() => {
    const result = { efectivo: 0, tarjeta: 0, bizum: 0, online: 0, otro: 0 };
    for (const s of todaySessions) {
      const sm = buildSummary(s);
      result.efectivo += sm.salesByMethod.efectivo;
      result.tarjeta += sm.salesByMethod.tarjeta;
      result.bizum += sm.salesByMethod.bizum;
      result.online += sm.salesByMethod.online;
      result.otro += sm.salesByMethod.otro;
    }
    return result;
  }, [todaySessions]);

  const todayDifference = useMemo(() => todaySessions.filter(s => s.status === 'closed').reduce((sum, s) => sum + (s.difference || 0), 0), [todaySessions]);

  const filteredSessions = useMemo(() => {
    let result = tab === 'estado' ? sessions : sessions;
    if (filterPdv) result = result.filter(s => s.pointOfSaleId === filterPdv);
    if (filterStatus !== 'all') result = result.filter(s => s.status === filterStatus);
    return result;
  }, [sessions, filterPdv, filterStatus, tab]);

  const allIncidents = useMemo(() => {
    const incs: (TpvIncident & { sessionTerminal: string; sessionWorker: string })[] = [];
    for (const s of sessions) {
      for (const inc of (s.incidents || [])) {
        incs.push({ ...inc, sessionTerminal: `${s.pointOfSaleName ? `${s.pointOfSaleName} / ` : ''}${s.terminalName}`, sessionWorker: s.workerName });
      }
    }
    return incs.sort((a, b) => b.date.localeCompare(a.date));
  }, [sessions]);

  const handleValidate = async (notes: string) => {
    if (!validatingSession || !userId) return;
    try {
      const updated = await updateTpvRegisterSessionRequest(userId, {
        ...validatingSession,
        closingValidatedBy: user?.name || user?.email || 'Gerente',
        closingValidatedAt: new Date().toISOString(),
        closingValidationStatus: 'validated',
        closingValidationNotes: notes,
      });
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setValidatingSession(null);
      toast.success('Cierre validado correctamente');
    } catch {
      toast.error('Error al validar cierre');
    }
  };

  const handleReject = async (notes: string) => {
    if (!validatingSession || !userId) return;
    try {
      const updated = await updateTpvRegisterSessionRequest(userId, {
        ...validatingSession,
        closingValidatedBy: user?.name || user?.email || 'Gerente',
        closingValidatedAt: new Date().toISOString(),
        closingValidationStatus: 'rejected',
        closingValidationNotes: notes,
      });
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setValidatingSession(null);
      toast.success('Cierre rechazado');
    } catch {
      toast.error('Error al rechazar cierre');
    }
  };

  const handleSaveConfig = async (updates: DeliveryConfig['cashRegisterAlerts']) => {
    if (!userId || !deliveryConfig) return;
    setSavingConfig(true);
    try {
      const updated = await updateDeliveryConfigRequest(userId, { ...deliveryConfig, cashRegisterAlerts: updates });
      setDeliveryConfig(updated);
      toast.success('Configuración de caja guardada');
    } catch {
      toast.error('Error al guardar configuración');
    } finally {
      setSavingConfig(false);
    }
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'estado', label: 'Estado actual', count: openSessions.length },
    { id: 'historial', label: 'Historial' },
    { id: 'incidencias', label: 'Incidencias', count: allIncidents.filter(i => !i.resolvedAt).length || undefined },
    { id: 'configuracion', label: 'Configuración' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando cajas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => {
              // Si la ruta fue abierta "directa" (sin historial), volvemos al hub de Delivery.
              if (typeof window !== 'undefined' && window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/saas/vertical/delivery');
              }
            }}
            className="mt-0.5 inline-flex items-center justify-center w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            aria-label="Volver"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Caja</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Control de efectivo y cobros de cada TPV</p>
          </div>
        </div>

        {/* Pending validations banner */}
        {pendingValidation.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm mb-2"><ShieldCheck className="w-4 h-4" /> {pendingValidation.length} cierre{pendingValidation.length > 1 ? 's' : ''} pendiente{pendingValidation.length > 1 ? 's' : ''} de validación</div>
            <div className="space-y-1.5">
              {pendingValidation.map(s => (
                <div key={s._id} className="flex items-center justify-between text-xs bg-white dark:bg-gray-800 p-2.5 rounded-lg">
                  <span className="text-gray-700 dark:text-gray-300">
                    {s.pointOfSaleName ? `${s.pointOfSaleName} / ` : ''}{s.terminalName} · {s.workerName} · {new Date(s.closedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })} · Dif: <span className={s.difference === 0 ? 'text-green-600' : 'text-red-600 font-semibold'}>{s.difference >= 0 ? '+' : ''}{s.difference.toFixed(2)}€</span>
                  </span>
                  <button onClick={() => setValidatingSession(s)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1"><Eye className="w-3 h-3" /> Revisar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Cajas abiertas" value={`${openSessions.length + openDriverSessions.length}/${totalTerminals || '—'}`} color="green" sub={openDriverSessions.length > 0 ? `${openDriverSessions.length} repartidor${openDriverSessions.length > 1 ? 'es' : ''}` : undefined} />
          <KpiCard label="Ventas hoy" value={`${todayTotalSales.toFixed(2)}€`} color="blue" sub={`${todaySessions.reduce((s, se) => s + se.transactions.filter(t => t.type === 'sale').length, 0)} operaciones`} />
          <KpiCard label="Efectivo en caja" value={`${todayCashInRegisters.toFixed(2)}€`} color="green" />
          <KpiCard label="Tarjeta hoy" value={`${todayByMethod.tarjeta.toFixed(2)}€`} color="blue" sub={todayByMethod.bizum > 0 ? `Bizum: ${todayByMethod.bizum.toFixed(2)}€` : undefined} />
          <KpiCard label="Descuadre hoy" value={`${todayDifference >= 0 ? '+' : ''}${todayDifference.toFixed(2)}€`} color={todayDifference === 0 ? 'green' : Math.abs(todayDifference) > 20 ? 'red' : 'amber'} />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${tab === t.id ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
              {t.count != null && t.count > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Filters */}
        {(tab === 'estado' || tab === 'historial') && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-gray-500"><Filter className="w-3.5 h-3.5" /> Filtrar:</div>
            {pointsOfSale.length > 1 && (
              <select value={filterPdv} onChange={e => setFilterPdv(e.target.value)}
                className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                <option value="">Todos los PDV</option>
                {pointsOfSale.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            )}
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
              className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              <option value="all">Todas</option>
              <option value="open">Abiertas</option>
              <option value="closed">Cerradas</option>
            </select>
          </div>
        )}

        {/* Tab content */}
        {tab === 'estado' && (
          <div className="space-y-3">
            {openSessions.length === 0 && openDriverSessions.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Store className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No hay cajas abiertas</p>
              </div>
            )}
            {openSessions.map(s => <RegisterCard key={s._id} session={s} />)}
            {openDriverSessions.map(s => <RegisterCard key={s._id} session={s as any} isDriver />)}
          </div>
        )}

        {tab === 'historial' && (
          <div className="space-y-3">
            {filteredSessions.filter(s => s.status === 'closed').length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Sin sesiones cerradas</p>
              </div>
            )}
            {filteredSessions.filter(s => s.status === 'closed').map(s => (
              <RegisterCard key={s._id} session={s} />
            ))}
          </div>
        )}

        {tab === 'incidencias' && (
          <div className="space-y-2">
            {allIncidents.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Sin incidencias</p>
              </div>
            )}
            {allIncidents.map(inc => (
              <div key={inc.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${inc.severity === 'high' ? 'bg-red-100 text-red-700' : inc.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {inc.severity === 'high' ? 'Alta' : inc.severity === 'medium' ? 'Media' : 'Baja'}
                  </span>
                  <div>
                    <div className="text-sm text-gray-900 dark:text-gray-100">{inc.description}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {new Date(inc.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })} · {inc.sessionTerminal} · {inc.reportedBy}
                      {inc.amount != null && <span className="ml-2 font-semibold">{inc.amount.toFixed(2)}€</span>}
                    </div>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${inc.resolvedAt ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {inc.resolvedAt ? 'Resuelta' : 'Abierta'}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'configuracion' && <CashRegisterConfigTab config={deliveryConfig?.cashRegisterAlerts} onSave={handleSaveConfig} saving={savingConfig} />}
      </div>

      {validatingSession && (
        <ValidationModal
          session={validatingSession}
          onValidate={handleValidate}
          onReject={handleReject}
          onCancel={() => setValidatingSession(null)}
        />
      )}
    </div>
  );
}
