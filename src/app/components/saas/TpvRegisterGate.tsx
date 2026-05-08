import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  listTpvRegisterSessionsRequest,
  createTpvRegisterSessionRequest,
  updateTpvRegisterSessionRequest,
  listPointsOfSaleRequest,
  type TpvRegisterSession,
  type TpvRegisterTransaction,
  type CashDenominationCount,
  type TpvCashCount,
  type TpvRegisterSummary,
  type PointOfSale,
  type TerminalConfig,
} from '../../lib/deliveryApi';
import {
  Lock, Unlock, Banknote, CreditCard, Phone as PhoneIcon, Wifi, User, Monitor,
  Printer, Smartphone, CheckCircle2, X, AlertTriangle, Calculator, ChevronDown,
  ChevronUp, Clock, TrendingUp, TrendingDown, DollarSign, Receipt, BarChart3,
  MapPin, Store,
} from 'lucide-react';

// ─── Denomination config (EUR) ──────────────────────────────────────────────

const DENOMINATIONS: { key: keyof CashDenominationCount; label: string; value: number; type: 'bill' | 'coin' }[] = [
  { key: 'bills_500', label: '500€', value: 500, type: 'bill' },
  { key: 'bills_200', label: '200€', value: 200, type: 'bill' },
  { key: 'bills_100', label: '100€', value: 100, type: 'bill' },
  { key: 'bills_50', label: '50€', value: 50, type: 'bill' },
  { key: 'bills_20', label: '20€', value: 20, type: 'bill' },
  { key: 'bills_10', label: '10€', value: 10, type: 'bill' },
  { key: 'bills_5', label: '5€', value: 5, type: 'bill' },
  { key: 'coins_2', label: '2€', value: 2, type: 'coin' },
  { key: 'coins_1', label: '1€', value: 1, type: 'coin' },
  { key: 'coins_050', label: '0,50€', value: 0.50, type: 'coin' },
  { key: 'coins_020', label: '0,20€', value: 0.20, type: 'coin' },
  { key: 'coins_010', label: '0,10€', value: 0.10, type: 'coin' },
  { key: 'coins_005', label: '0,05€', value: 0.05, type: 'coin' },
  { key: 'coins_002', label: '0,02€', value: 0.02, type: 'coin' },
  { key: 'coins_001', label: '0,01€', value: 0.01, type: 'coin' },
];

function calcDenominationTotal(counts: CashDenominationCount): number {
  return DENOMINATIONS.reduce((sum, d) => sum + (counts[d.key] || 0) * d.value, 0);
}

function calcExpectedCash(session: TpvRegisterSession): number {
  const cashSales = session.transactions
    .filter(t => t.type === 'sale' && t.paymentMethod === 'efectivo')
    .reduce((s, t) => s + t.amount, 0);
  const cashReturns = session.transactions
    .filter(t => t.type === 'return' && t.paymentMethod === 'efectivo')
    .reduce((s, t) => s + t.amount, 0);
  const cashIn = session.transactions
    .filter(t => t.type === 'cash_in')
    .reduce((s, t) => s + t.amount, 0);
  const cashOut = session.transactions
    .filter(t => t.type === 'cash_out' || t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
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

// ─── Cash Count Grid ────────────────────────────────────────────────────────

function CashCountGrid({ counts, onChange }: {
  counts: CashDenominationCount;
  onChange: (counts: CashDenominationCount) => void;
}) {
  const total = calcDenominationTotal(counts);
  const bills = DENOMINATIONS.filter(d => d.type === 'bill');
  const coins = DENOMINATIONS.filter(d => d.type === 'coin');

  const updateCount = (key: keyof CashDenominationCount, val: number) => {
    onChange({ ...counts, [key]: Math.max(0, val) });
  };

  const renderRow = (d: typeof DENOMINATIONS[0]) => {
    const qty = counts[d.key] || 0;
    const subtotal = qty * d.value;
    return (
      <div key={d.key} className="flex items-center gap-2">
        <span className={`w-14 text-right text-sm font-semibold ${d.type === 'bill' ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>{d.label}</span>
        <span className="text-gray-400 text-xs">×</span>
        <div className="flex items-center gap-1">
          <button onClick={() => updateCount(d.key, qty - 1)} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">-</button>
          <input type="number" min="0" value={qty || ''} onChange={e => updateCount(d.key, parseInt(e.target.value) || 0)}
            className="w-14 h-7 text-center border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none" />
          <button onClick={() => updateCount(d.key, qty + 1)} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">+</button>
        </div>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400 w-16 text-right">{subtotal > 0 ? `${subtotal.toFixed(2)}€` : '—'}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <h5 className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Banknote className="w-3.5 h-3.5" /> Billetes</h5>
          <div className="space-y-1.5">{bills.map(renderRow)}</div>
        </div>
        <div>
          <h5 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Monedas</h5>
          <div className="space-y-1.5">{coins.map(renderRow)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between p-3 bg-gray-900 dark:bg-gray-100 rounded-xl">
        <span className="font-bold text-white dark:text-gray-900 flex items-center gap-2"><Calculator className="w-4 h-4" /> Total contado</span>
        <span className="text-2xl font-bold text-white dark:text-gray-900">{total.toFixed(2)}€</span>
      </div>
    </div>
  );
}

// ─── Context for active register ────────────────────────────────────────────

interface TpvRegisterContextType {
  session: TpvRegisterSession;
  addTransaction: (tx: Omit<TpvRegisterTransaction, 'id' | 'date'>) => Promise<void>;
  performCashCount: (countedBy: string, denominations: CashDenominationCount, notes?: string) => Promise<void>;
  addIncident: (incident: Omit<import('../../lib/deliveryApi').TpvIncident, 'id' | 'date'>) => Promise<void>;
  requestClose: () => void;
  requestCashCount: () => void;
  requestIncident: () => void;
  expectedCash: number;
}

const TpvRegisterContext = createContext<TpvRegisterContextType | null>(null);

export function useTpvRegister() {
  const ctx = useContext(TpvRegisterContext);
  if (!ctx) throw new Error('useTpvRegister must be used within TpvRegisterGate');
  return ctx;
}

// ─── Opening Screen ─────────────────────────────────────────────────────────

interface OpeningData {
  workerName: string;
  pointOfSaleId: string;
  pointOfSaleName: string;
  terminalId: string;
  terminalName: string;
  datafonName: string;
  printerName: string;
  counts: CashDenominationCount;
}

function OpeningScreen({ onOpen, loading: parentLoading, pointsOfSale, workerOptions }: {
  onOpen: (data: OpeningData) => void;
  loading: boolean;
  pointsOfSale: PointOfSale[];
  workerOptions: { id: string; name: string }[];
}) {
  const [workerName, setWorkerName] = useState('');
  const [selectedPdvId, setSelectedPdvId] = useState('');
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [counts, setCounts] = useState<CashDenominationCount>({});
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(() => (workerOptions.length === 1 ? workerOptions[0].id : ''));
  const total = calcDenominationTotal(counts);
  const hasCounted = total > 0 || Object.values(counts).some(v => v !== undefined && v > 0);

  const hasPdvs = pointsOfSale.length > 0;
  const selectedPdv = pointsOfSale.find(p => p._id === selectedPdvId);
  const availableTerminals = selectedPdv?.terminals.filter(t => t.active) || [];
  const selectedTerminal = availableTerminals.find(t => t.id === selectedTerminalId);

  const effectiveTerminalName = selectedTerminal ? (selectedTerminal.code || selectedTerminal.name) : '';
  const effectiveDatafon = selectedTerminal?.datafonName || '';
  const effectivePrinter = selectedTerminal?.printerName || '';

  const effectiveWorkerName = useCallback(() => {
    const w = workerOptions.find((x) => x.id === selectedWorkerId);
    return (w?.name || '').trim();
  }, [workerOptions, selectedWorkerId]);

  const hasWorkers = workerOptions.length > 0;
  const canOpen = hasWorkers && effectiveWorkerName() && !!selectedPdv && !!selectedTerminal;

  useEffect(() => {
    if (workerOptions.length === 0) return;
    if (selectedWorkerId) return;
    // Intenta seleccionar por nombre cacheado
    const cached = (() => {
      try { return localStorage.getItem('vertial.tpvRapido.cashierName') || ''; } catch { return ''; }
    })().trim().toLowerCase();
    if (!cached) return;
    const match = workerOptions.find((w) => w.name.trim().toLowerCase() === cached);
    if (match) setSelectedWorkerId(match.id);
  }, [workerOptions, selectedWorkerId]);

  const handleSelectPdv = (pdvId: string) => {
    setSelectedPdvId(pdvId);
    setSelectedTerminalId('');
  };

  const handleSubmit = () => {
    const wName = effectiveWorkerName();
    onOpen({
      workerName: wName,
      pointOfSaleId: selectedPdv?._id || '',
      pointOfSaleName: selectedPdv?.name || '',
      terminalId: selectedTerminal?.id || '',
      terminalName: effectiveTerminalName,
      datafonName: effectiveDatafon,
      printerName: effectivePrinter,
      counts,
    });
  };

  const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 text-center relative">
          <button
            type="button"
            onClick={() => {
              try {
                if (window.history.length > 1) window.history.back();
                else window.location.href = '/saas/delivery-ops';
              } catch {
                // ignore
              }
            }}
            className="absolute right-3 top-3 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Unlock className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Apertura de caja</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Selecciona punto de venta, terminal y cuenta el efectivo</p>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 pb-24">
          {/* Worker */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Trabajador *</label>
            {hasWorkers ? (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className={`${inputCls} pl-10`}
                  autoFocus
                >
                  <option value="">Selecciona…</option>
                  {workerOptions.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200">
                No se detecta ningún miembro en <span className="font-bold">Equipo</span>. No puedes abrir caja hasta conectar el equipo.
              </div>
            )}
          </div>

          {/* Point of Sale selection */}
          {hasPdvs && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2"><MapPin className="w-3 h-3 inline mr-1" />Punto de venta</label>
              <div className="grid grid-cols-2 gap-2">
                {pointsOfSale.filter(p => p.active).map(pdv => (
                  <button key={pdv._id} onClick={() => handleSelectPdv(pdv._id)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${selectedPdvId === pdv._id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-1.5"><Store className="w-3.5 h-3.5 text-emerald-600" />{pdv.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{pdv.code} · {pdv.terminals.filter(t => t.active).length} TPV{pdv.terminals.length !== 1 ? 's' : ''}</div>
                    {pdv.address && <div className="text-xs text-gray-400 mt-0.5 truncate">{pdv.address}</div>}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Terminal, datáfono e impresora quedan ligados al PDV seleccionado.
                </p>
                <button
                  type="button"
                  onClick={() => { try { window.location.href = '/saas/settings/centros-de-trabajo'; } catch { /* ignore */ } }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                  title="Configurar PDV/terminales (PRO)"
                >
                  Multi-PDV (PRO)
                </button>
              </div>
            </div>
          )}
          {!hasPdvs && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">No hay PDV configurados</p>
              <p className="text-xs text-amber-700/90 dark:text-amber-200/90 mt-1">
                Para abrir caja necesitas configurar al menos 1 punto de venta y su terminal.
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => { try { window.location.href = '/saas/settings/centros-de-trabajo'; } catch { /* ignore */ } }}
                  className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold"
                >
                  Configurar PDV
                </button>
                <button
                  type="button"
                  onClick={() => { try { window.location.href = '/saas/settings/centros-de-trabajo'; } catch { /* ignore */ } }}
                  className="px-4 py-2 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-sm font-semibold"
                >
                  Activar multi-PDV (PRO)
                </button>
              </div>
            </div>
          )}

          {/* Terminal selection from PDV (required) */}
          {selectedPdv ? (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2"><Monitor className="w-3 h-3 inline mr-1" />Terminal *</label>
              {availableTerminals.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableTerminals.map(t => (
                    <button key={t.id} onClick={() => setSelectedTerminalId(t.id)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${selectedTerminalId === t.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                      <div className="font-bold text-sm text-gray-900 dark:text-gray-100">{t.code || t.name}</div>
                      {t.name && t.code && <div className="text-xs text-gray-500 dark:text-gray-400">{t.name}</div>}
                      <div className="flex gap-2 mt-1 text-xs text-gray-400">
                        {t.datafonName && <span className="flex items-center gap-0.5"><Smartphone className="w-2.5 h-2.5" />{t.datafonName}</span>}
                        {t.printerName && <span className="flex items-center gap-0.5"><Printer className="w-2.5 h-2.5" />{t.printerName}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200">
                  Este PDV no tiene terminales activos. Configúralos en Ajustes.
                </div>
              )}
            </div>
          ) : null}

          {/* Selected terminal info summary */}
          {selectedTerminal && (
            <div className="flex gap-2 flex-wrap text-xs">
              <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 rounded-lg font-medium flex items-center gap-1"><Monitor className="w-3 h-3" />{selectedTerminal.code || selectedTerminal.name}</span>
              {effectiveDatafon && <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 rounded-lg font-medium flex items-center gap-1"><Smartphone className="w-3 h-3" />{effectiveDatafon}</span>}
              {effectivePrinter && <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg font-medium flex items-center gap-1"><Printer className="w-3 h-3" />{effectivePrinter}</span>}
            </div>
          )}

          {/* Cash count */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Conteo de efectivo *</label>
              {hasCounted && <span className="text-xs font-bold text-emerald-600">Contado: {total.toFixed(2)}€</span>}
            </div>
            <CashCountGrid counts={counts} onChange={setCounts} />
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur sticky bottom-0">
          <button
            type="button"
            onClick={() => {
              try {
                if (window.history.length > 1) window.history.back();
                else window.location.href = '/saas/delivery-ops';
              } catch {
                // ignore
              }
            }}
            className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Volver
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canOpen || parentLoading}
            className={`flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${canOpen ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}
          >
            <Unlock className="w-4 h-4" /> Abrir caja{selectedPdv ? ` — ${selectedPdv.name}` : ''} — {total.toFixed(2)}€ de fondo
          </button>
          {!hasCounted && canOpen && (
            <p className="text-xs text-amber-600 mt-2 text-center flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" /> Cuenta el efectivo antes de abrir</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Closing Screen ─────────────────────────────────────────────────────────

function ClosingScreen({ session, onClose, onCancel }: {
  session: TpvRegisterSession;
  onClose: (counts: CashDenominationCount, notes: string) => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<CashDenominationCount>({});
  const [notes, setNotes] = useState('');
  const countedTotal = calcDenominationTotal(counts);
  const expected = calcExpectedCash(session);
  const diff = countedTotal - expected;
  const summary = buildSummary(session);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Lock className="w-5 h-5 text-red-500" /> Cierre de caja</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{session.pointOfSaleName ? `${session.pointOfSaleName} · ` : ''}{session.terminalName} · {session.workerName} · Abierta {new Date(session.openedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</p>
            </div>
            <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <div className="text-xs text-green-600 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Ventas</div>
              <div className="text-lg font-bold text-green-700 dark:text-green-400">{summary.totalSales.toFixed(2)}€</div>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <div className="text-xs text-red-600 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Devoluciones</div>
              <div className="text-lg font-bold text-red-700 dark:text-red-400">{summary.totalReturns.toFixed(2)}€</div>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <div className="text-xs text-blue-600">Entradas</div>
              <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{summary.totalCashIn.toFixed(2)}€</div>
            </div>
            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
              <div className="text-xs text-orange-600">Salidas</div>
              <div className="text-lg font-bold text-orange-700 dark:text-orange-400">{summary.totalCashOut.toFixed(2)}€</div>
            </div>
          </div>

          {/* Sales by method */}
          <div className="flex gap-2 flex-wrap text-xs">
            {summary.salesByMethod.efectivo > 0 && <span className="px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 rounded-lg font-medium flex items-center gap-1"><Banknote className="w-3 h-3" /> Efectivo: {summary.salesByMethod.efectivo.toFixed(2)}€</span>}
            {summary.salesByMethod.tarjeta > 0 && <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 rounded-lg font-medium flex items-center gap-1"><CreditCard className="w-3 h-3" /> Tarjeta: {summary.salesByMethod.tarjeta.toFixed(2)}€</span>}
            {summary.salesByMethod.bizum > 0 && <span className="px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 rounded-lg font-medium flex items-center gap-1"><PhoneIcon className="w-3 h-3" /> Bizum: {summary.salesByMethod.bizum.toFixed(2)}€</span>}
            {summary.salesByMethod.online > 0 && <span className="px-2.5 py-1 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 rounded-lg font-medium flex items-center gap-1"><Wifi className="w-3 h-3" /> Online: {summary.salesByMethod.online.toFixed(2)}€</span>}
            <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg font-medium flex items-center gap-1"><Receipt className="w-3 h-3" /> {summary.totalTransactions} operaciones</span>
          </div>

          {/* Cash flow summary */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Fondo de apertura</span><span className="font-semibold text-gray-900 dark:text-gray-100">{session.initialCashAmount.toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-green-600">+ Cobros en efectivo</span><span className="font-semibold text-green-700">{summary.salesByMethod.efectivo.toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-blue-600">+ Entradas de efectivo</span><span className="font-semibold text-blue-700">{summary.totalCashIn.toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-red-600">− Devoluciones efectivo</span><span className="font-semibold text-red-700">{session.transactions.filter(t => t.type === 'return' && t.paymentMethod === 'efectivo').reduce((s, t) => s + t.amount, 0).toFixed(2)}€</span></div>
            <div className="flex justify-between"><span className="text-orange-600">− Salidas de efectivo</span><span className="font-semibold text-orange-700">{summary.totalCashOut.toFixed(2)}€</span></div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold">
              <span className="text-gray-900 dark:text-gray-100">= Efectivo esperado</span>
              <span className="text-emerald-700 dark:text-emerald-400 text-base">{expected.toFixed(2)}€</span>
            </div>
          </div>

          {/* Cash count */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Conteo de efectivo de cierre</h4>
            <CashCountGrid counts={counts} onChange={setCounts} />
          </div>

          {/* Difference */}
          {countedTotal > 0 && (
            <div className={`p-4 rounded-xl border-2 ${diff === 0 ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : diff > 0 ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Diferencia</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{countedTotal.toFixed(2)}€ contado − {expected.toFixed(2)}€ esperado</div>
                </div>
                <div className={`text-2xl font-bold ${diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{diff.toFixed(2)}€
                </div>
              </div>
              {diff === 0 && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> La caja cuadra perfectamente</p>}
              {diff !== 0 && <p className="text-xs mt-1 flex items-center gap-1 {diff > 0 ? 'text-blue-600' : 'text-red-600'}"><AlertTriangle className="w-3 h-3" /> {diff > 0 ? 'Hay un sobrante de efectivo' : 'Falta efectivo en la caja'}</p>}
            </div>
          )}

          {session.cashCounts.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Arqueos realizados</h4>
              <div className="space-y-1.5">
                {session.cashCounts.map(cc => (
                  <div key={cc.id} className="flex items-center justify-between text-xs p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">{new Date(cc.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {cc.countedBy}</span>
                      {cc.notes && <span className="text-gray-400 ml-2">· {cc.notes}</span>}
                    </div>
                    <span className={`font-semibold ${cc.difference === 0 ? 'text-green-600' : cc.difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {cc.difference >= 0 ? '+' : ''}{cc.difference.toFixed(2)}€ {cc.difference === 0 ? '✓' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(session.incidents?.length || 0) > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Incidencias ({session.incidents.length})</h4>
              <div className="space-y-1.5">
                {session.incidents.map(inc => (
                  <div key={inc.id} className="flex items-center justify-between text-xs p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${inc.severity === 'high' ? 'bg-red-100 text-red-700' : inc.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{inc.severity === 'high' ? 'Alta' : inc.severity === 'medium' ? 'Media' : 'Baja'}</span>
                      <span className="text-gray-600 dark:text-gray-400 truncate max-w-[200px]">{inc.description}</span>
                    </div>
                    {inc.amount != null && <span className="font-semibold text-gray-700 dark:text-gray-300">{inc.amount.toFixed(2)}€</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notas de cierre</label>
            <textarea rows={2} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
              placeholder="Observaciones del cierre..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex-shrink-0 p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button onClick={onCancel} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={() => onClose(counts, notes)}
            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" /> Confirmar cierre de caja
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status Bar (shown when register is open) ───────────────────────────────

function RegisterStatusBar({ session, onRequestClose, onRequestCashCount, onRequestIncident }: {
  session: TpvRegisterSession;
  onRequestClose: () => void;
  onRequestCashCount: () => void;
  onRequestIncident: () => void;
}) {
  const expected = calcExpectedCash(session);
  const txCount = session.transactions.length;
  const incidentCount = session.incidents?.filter(i => !i.resolvedAt).length || 0;

  return (
    <div className="bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 px-4 py-2 flex items-center justify-between text-xs">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Caja abierta</span>
        <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1"><User className="w-3 h-3" /> {session.workerName}</span>
        {session.pointOfSaleName && <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> {session.pointOfSaleName}</span>}
        <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1"><Monitor className="w-3 h-3" /> {session.terminalName}</span>
        <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(session.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })}</span>
        {txCount > 0 && <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {txCount} ops</span>}
        <span className="font-semibold text-emerald-700 dark:text-emerald-400"><Banknote className="w-3 h-3 inline mr-0.5" />{expected.toFixed(2)}€</span>
        {incidentCount > 0 && <span className="text-red-600 font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {incidentCount}</span>}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onRequestCashCount} className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1">
          <Calculator className="w-3 h-3" /> Arqueo
        </button>
        <button onClick={onRequestIncident} className="px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Incidencia
        </button>
        <button onClick={onRequestClose} className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg font-semibold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1">
          <Lock className="w-3 h-3" /> Cerrar caja
        </button>
      </div>
    </div>
  );
}

// ─── Cash Count Modal ────────────────────────────────────────────────────────

function CashCountModal({ session, onConfirm, onCancel }: {
  session: TpvRegisterSession;
  onConfirm: (denominations: CashDenominationCount, notes: string) => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<CashDenominationCount>({});
  const [notes, setNotes] = useState('');
  const countedTotal = calcDenominationTotal(counts);
  const expected = calcExpectedCash(session);
  const diff = countedTotal - expected;
  const hasCounted = countedTotal > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Calculator className="w-5 h-5 text-blue-500" /> Arqueo intermedio</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{session.pointOfSaleName ? `${session.pointOfSaleName} · ` : ''}{session.terminalName} · {new Date().toLocaleTimeString('es-ES', { timeStyle: 'short' })}</p>
            </div>
            <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl flex justify-between items-center">
            <span className="text-sm text-gray-500">Efectivo esperado</span>
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{expected.toFixed(2)}€</span>
          </div>

          <CashCountGrid counts={counts} onChange={setCounts} />

          {hasCounted && (
            <div className={`p-4 rounded-xl border-2 ${diff === 0 ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : diff > 0 ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100">Diferencia</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{countedTotal.toFixed(2)}€ contado − {expected.toFixed(2)}€ esperado</div>
                </div>
                <div className={`text-2xl font-bold ${diff === 0 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{diff.toFixed(2)}€
                </div>
              </div>
              {diff === 0 && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> La caja cuadra perfectamente</p>}
              {diff !== 0 && <p className="text-xs mt-1 flex items-center gap-1 text-gray-500"><AlertTriangle className="w-3 h-3" /> {diff > 0 ? 'Sobrante de efectivo' : 'Falta efectivo en la caja'}</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notas</label>
            <textarea rows={2} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
              placeholder="Observaciones del arqueo..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {session.cashCounts.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Arqueos anteriores</h4>
              <div className="space-y-1.5">
                {session.cashCounts.map(cc => (
                  <div key={cc.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <span className="text-gray-600 dark:text-gray-400">{new Date(cc.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {cc.countedBy}</span>
                    <span className={`font-semibold ${cc.difference === 0 ? 'text-green-600' : cc.difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {cc.difference >= 0 ? '+' : ''}{cc.difference.toFixed(2)}€
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button onClick={onCancel} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={() => onConfirm(counts, notes)} disabled={!hasCounted}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${hasCounted ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
            <Calculator className="w-4 h-4" /> Registrar arqueo
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Incident Modal ──────────────────────────────────────────────────────────

const INCIDENT_TYPES: { value: import('../../lib/deliveryApi').IncidentType; label: string }[] = [
  { value: 'cash_discrepancy', label: 'Descuadre de efectivo' },
  { value: 'card_issue', label: 'Problema con datáfono/tarjeta' },
  { value: 'refund', label: 'Devolución significativa' },
  { value: 'void_transaction', label: 'Transacción anulada' },
  { value: 'system_error', label: 'Error del sistema' },
  { value: 'other', label: 'Otro' },
];

function IncidentModal({ session, onConfirm, onCancel }: {
  session: TpvRegisterSession;
  onConfirm: (incident: Omit<import('../../lib/deliveryApi').TpvIncident, 'id' | 'date'>) => void;
  onCancel: () => void;
}) {
  const [incidentType, setIncidentType] = useState<import('../../lib/deliveryApi').IncidentType>('other');
  const [severity, setSeverity] = useState<import('../../lib/deliveryApi').IncidentSeverity>('medium');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');

  const canSubmit = description.trim().length > 0;

  const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
  const severityOptions: { value: import('../../lib/deliveryApi').IncidentSeverity; label: string; color: string }[] = [
    { value: 'low', label: 'Baja', color: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' },
    { value: 'medium', label: 'Media', color: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700' },
    { value: 'high', label: 'Alta', color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Registrar incidencia</h2>
            <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Tipo *</label>
            <div className="grid grid-cols-2 gap-2">
              {INCIDENT_TYPES.map(t => (
                <button key={t.value} onClick={() => setIncidentType(t.value)}
                  className={`p-2.5 rounded-xl border-2 text-left text-sm transition-all ${incidentType === t.value ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 font-semibold' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Gravedad *</label>
            <div className="flex gap-2">
              {severityOptions.map(s => (
                <button key={s.value} onClick={() => setSeverity(s.value)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${severity === s.value ? s.color : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Importe afectado</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="number" step="0.01" min="0" className={`${inputCls} pl-10`} placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Descripción *</label>
            <textarea rows={3} className={`${inputCls} resize-none`}
              placeholder="Describe la incidencia..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          {session.transactions.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Transacción vinculada</label>
              <select className={inputCls} value={transactionId} onChange={e => setTransactionId(e.target.value)}>
                <option value="">Ninguna</option>
                {session.transactions.slice(-20).reverse().map(tx => (
                  <option key={tx.id} value={tx.id}>
                    {new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })} — {tx.type} — {tx.amount.toFixed(2)}€ — {tx.description?.slice(0, 30) || tx.paymentMethod}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button onClick={onCancel} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={() => onConfirm({ type: incidentType, severity, description, reportedBy: session.workerName, amount: amount ? parseFloat(amount) : undefined, transactionId: transactionId || undefined })}
            disabled={!canSubmit}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${canSubmit ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}>
            <AlertTriangle className="w-4 h-4" /> Registrar incidencia
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Gate Component ────────────────────────────────────────────────────

export function TpvRegisterGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const { currentBusiness } = useBusiness();

  const [sessions, setSessions] = useState<TpvRegisterSession[]>([]);
  const [pointsOfSale, setPointsOfSale] = useState<PointOfSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClosing, setShowClosing] = useState(false);
  const [showCashCount, setShowCashCount] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [postCloseSession, setPostCloseSession] = useState<TpvRegisterSession | null>(null);

  const activeSession = sessions.find(s => s.status === 'open') || null;

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [sessData, pdvData] = await Promise.all([
        listTpvRegisterSessionsRequest(userId),
        listPointsOfSaleRequest(userId),
      ]);
      setSessions(sessData);
      setPointsOfSale(pdvData);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpen = async (data: OpeningData) => {
    if (!userId) return;
    const total = calcDenominationTotal(data.counts);
    try {
      const created = await createTpvRegisterSessionRequest(userId, {
        workerName: data.workerName,
        pointOfSaleId: data.pointOfSaleId,
        pointOfSaleName: data.pointOfSaleName,
        terminalId: data.terminalId,
        terminalName: data.terminalName,
        datafonName: data.datafonName,
        printerName: data.printerName,
        openedBy: data.workerName,
        openingCashCount: data.counts,
        initialCashAmount: total,
        status: 'open',
        transactions: [],
        cashCounts: [],
        incidents: [],
        linkedOrderIds: [],
        salesByChannel: {},
      } as Partial<TpvRegisterSession>);
      setSessions(prev => [created, ...prev]);
      toast.success(`Caja abierta: ${data.pointOfSaleName ? `${data.pointOfSaleName} / ` : ''}${data.terminalName} — ${total.toFixed(2)}€`);
    } catch {
      toast.error('Error al abrir la caja');
    }
  };

  const handleClose = async (counts: CashDenominationCount, notes: string) => {
    if (!userId || !activeSession) return;
    const finalAmount = calcDenominationTotal(counts);
    const expected = calcExpectedCash(activeSession);
    const diff = finalAmount - expected;
    const summary = buildSummary(activeSession);
    try {
      const updated = await updateTpvRegisterSessionRequest(userId, {
        ...activeSession,
        status: 'closed',
        closedAt: new Date().toISOString(),
        closedBy: activeSession.workerName,
        closingCashCount: counts,
        finalCashAmount: finalAmount,
        expectedCash: expected,
        difference: diff,
        closingNotes: notes,
        summary,
      });
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setShowClosing(false);
      setPostCloseSession(updated);
      toast.success(`Caja cerrada. Diferencia: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}€`);
    } catch {
      toast.error('Error al cerrar la caja');
    }
  };

  const addTransaction = useCallback(async (tx: Omit<TpvRegisterTransaction, 'id' | 'date'>) => {
    if (!userId || !activeSession) return;
    const fullTx: TpvRegisterTransaction = { ...tx, id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: new Date().toISOString() };
    const updatedTxs = [...activeSession.transactions, fullTx];
    const salesByChannel: Record<string, number> = {};
    for (const t of updatedTxs) {
      if (t.type === 'sale' && t.channel) salesByChannel[t.channel] = (salesByChannel[t.channel] || 0) + t.amount;
    }
    const linkedOrderIds = [...(activeSession.linkedOrderIds || [])];
    if (fullTx.linkedDeliveryOrderId && !linkedOrderIds.includes(fullTx.linkedDeliveryOrderId)) {
      linkedOrderIds.push(fullTx.linkedDeliveryOrderId);
    }
    try {
      const updated = await updateTpvRegisterSessionRequest(userId, { ...activeSession, transactions: updatedTxs, salesByChannel, linkedOrderIds });
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
    } catch {
      toast.error('Error al registrar operación');
    }
  }, [userId, activeSession]);

  const performCashCount = useCallback(async (countedBy: string, denominations: CashDenominationCount, notes?: string) => {
    if (!userId || !activeSession) return;
    const actualCash = calcDenominationTotal(denominations);
    const expectedCash = calcExpectedCash(activeSession);
    const difference = Number((actualCash - expectedCash).toFixed(2));
    const cashCount: TpvCashCount = {
      id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString(),
      countedBy,
      denominations,
      expectedCash,
      actualCash,
      difference,
      notes,
    };
    const updatedCounts = [...activeSession.cashCounts, cashCount];
    const updatedIncidents = [...(activeSession.incidents || [])];
    if (Math.abs(difference) > 20) {
      updatedIncidents.push({
        id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: new Date().toISOString(),
        type: 'cash_discrepancy',
        severity: Math.abs(difference) > 100 ? 'high' : 'medium',
        description: `Descuadre de ${difference >= 0 ? '+' : ''}${difference.toFixed(2)}€ detectado en arqueo intermedio`,
        reportedBy: countedBy,
        amount: Math.abs(difference),
      });
    }
    try {
      const updated = await updateTpvRegisterSessionRequest(userId, { ...activeSession, cashCounts: updatedCounts, incidents: updatedIncidents });
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setShowCashCount(false);
      toast.success(`Arqueo registrado. Diferencia: ${difference >= 0 ? '+' : ''}${difference.toFixed(2)}€`);
    } catch {
      toast.error('Error al registrar arqueo');
    }
  }, [userId, activeSession]);

  const addIncident = useCallback(async (incident: Omit<import('../../lib/deliveryApi').TpvIncident, 'id' | 'date'>) => {
    if (!userId || !activeSession) return;
    const fullIncident = {
      ...incident,
      id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString(),
    };
    const updatedIncidents = [...(activeSession.incidents || []), fullIncident];
    try {
      const updated = await updateTpvRegisterSessionRequest(userId, { ...activeSession, incidents: updatedIncidents });
      setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
      setShowIncident(false);
      toast.success('Incidencia registrada');
    } catch {
      toast.error('Error al registrar incidencia');
    }
  }, [userId, activeSession]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando caja...</p>
        </div>
      </div>
    );
  }

  if (!activeSession && postCloseSession) {
    const expected = calcExpectedCash(postCloseSession);
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 text-center relative">
            <button
              type="button"
              onClick={() => {
                // Salir sin forzar apertura; volvemos a la vista anterior.
                try {
                  if (window.history.length > 1) window.history.back();
                  else window.location.href = '/saas/delivery-ops';
                } catch {
                  // ignore
                }
              }}
              className="absolute right-3 top-3 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Cerrar"
              title="Cerrar"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Caja cerrada</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {postCloseSession.pointOfSaleName ? `${postCloseSession.pointOfSaleName} · ` : ''}{postCloseSession.terminalName}
            </p>
          </div>
          <div className="p-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Efectivo esperado</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{expected.toFixed(2)}€</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Efectivo contado</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{Number(postCloseSession.finalCashAmount || 0).toFixed(2)}€</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Diferencia</span>
              <span className={`font-bold ${Number(postCloseSession.difference || 0) === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {(postCloseSession.difference || 0) >= 0 ? '+' : ''}{Number(postCloseSession.difference || 0).toFixed(2)}€
              </span>
            </div>
          </div>
          <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setPostCloseSession(null)}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Abrir otra caja
            </button>
            <button
              onClick={() => {
                try { window.location.href = '/saas/vertical/delivery/caja'; } catch { /* ignore */ }
              }}
              className="flex-1 py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
            >
              Ir a Caja
            </button>
            <button
              onClick={() => {
                try {
                  if (window.history.length > 1) window.history.back();
                  else window.location.href = '/saas/delivery-ops';
                } catch { /* ignore */ }
              }}
              className="flex-1 py-3 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeSession) {
    const members = (currentBusiness?.members || []).map((m: any) => ({
      id: String(m.user_id || m.id || '').trim(),
      name: String(m.fullName || m.email || 'Trabajador').trim(),
    })).filter((m: any) => m.id && m.name);
    const uniq = new Map<string, { id: string; name: string }>();
    for (const m of members) uniq.set(m.id, m);
    if (user?.id) uniq.set(String(user.id), { id: String(user.id), name: String(user.fullName || user.email || 'Gerente').trim() });
    const workerOptions = Array.from(uniq.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return <OpeningScreen onOpen={handleOpen} loading={loading} pointsOfSale={pointsOfSale} workerOptions={workerOptions} />;
  }

  return (
    <TpvRegisterContext.Provider value={{
      session: activeSession,
      addTransaction,
      performCashCount,
      addIncident,
      requestClose: () => setShowClosing(true),
      requestCashCount: () => setShowCashCount(true),
      requestIncident: () => setShowIncident(true),
      expectedCash: calcExpectedCash(activeSession),
    }}>
      <div className="flex flex-col min-h-screen">
        <RegisterStatusBar
          session={activeSession}
          onRequestClose={() => setShowClosing(true)}
          onRequestCashCount={() => setShowCashCount(true)}
          onRequestIncident={() => setShowIncident(true)}
        />
        <div className="flex-1">{children}</div>
      </div>
      {showClosing && <ClosingScreen session={activeSession} onClose={handleClose} onCancel={() => setShowClosing(false)} />}
      {showCashCount && <CashCountModal session={activeSession} onConfirm={(d, n) => performCashCount(activeSession.workerName, d, n)} onCancel={() => setShowCashCount(false)} />}
      {showIncident && <IncidentModal session={activeSession} onConfirm={addIncident} onCancel={() => setShowIncident(false)} />}
    </TpvRegisterContext.Provider>
  );
}
