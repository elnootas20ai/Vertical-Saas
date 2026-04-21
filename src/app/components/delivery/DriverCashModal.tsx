import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  listDriverCashSessionsRequest,
  createDriverCashSessionRequest,
  updateDriverCashSessionRequest,
  getDriverCashConfigRequest,
  saveDriverCashConfigRequest,
  type DriverCashSession,
  type CashTransaction,
  type DeliveryOrder,
  type DriverCashConfig,
  DEFAULT_DRIVER_CASH_CONFIG,
} from '../../lib/deliveryApi';
import {
  Plus, X, Lock, Unlock, Wallet, TrendingUp, TrendingDown, DollarSign,
  Receipt, CreditCard, Phone, Banknote, Wifi, ChevronRight,
  MessageSquare, Settings, AlertTriangle, Edit3, Trash2, Check,
  RotateCcw, Filter, Clock, Zap,
} from 'lucide-react';

const PAY_LABELS: Record<string, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', online: 'Online', bizum: 'Bizum' };

function hoursSince(d: string) { return (Date.now() - new Date(d).getTime()) / 3600000; }

function calcTotals(s: DriverCashSession) {
  const cashIn = s.transactions.filter(t => t.type === 'cobro' && t.paymentMethod === 'efectivo').reduce((a, t) => a + t.amount, 0);
  const cashOut = s.transactions.filter(t => t.type === 'gasto').reduce((a, t) => a + t.amount, 0);
  const adj = s.transactions.filter(t => t.type === 'ajuste').reduce((a, t) => a + t.amount, 0);
  const expected = s.initialFloat + cashIn - cashOut + adj;
  const sales = s.transactions.filter(t => t.type === 'cobro').reduce((a, t) => a + t.amount, 0);
  const card = s.transactions.filter(t => t.type === 'cobro' && t.paymentMethod === 'tarjeta').reduce((a, t) => a + t.amount, 0);
  const bizum = s.transactions.filter(t => t.type === 'cobro' && t.paymentMethod === 'bizum').reduce((a, t) => a + t.amount, 0);
  const online = s.transactions.filter(t => t.type === 'cobro' && t.paymentMethod === 'online').reduce((a, t) => a + t.amount, 0);
  return { cashIn, cashOut, adj, expected, sales, card, bizum, online };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDriverCashSessions(userId: string | undefined) {
  const [sessions, setSessions] = useState<DriverCashSession[]>([]);
  const [config, setConfig] = useState<DriverCashConfig>(DEFAULT_DRIVER_CASH_CONFIG);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [s, c] = await Promise.all([listDriverCashSessionsRequest(userId), getDriverCashConfigRequest(userId)]);
      setSessions(s); setConfig(c);
    } catch { toast.error('Error al cargar sesiones de caja'); } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const openSessions = useMemo(() => sessions.filter(s => s.status === 'open'), [sessions]);
  const pendingReview = useMemo(() => sessions.filter(s => s.status === 'pending_review'), [sessions]);
  const closed = useMemo(() => sessions.filter(s => s.status === 'closed'), [sessions]);

  return { sessions, setSessions, config, setConfig, loading, reload: load, openSessions, pendingReview, closed };
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-700 dark:text-gray-300">{label}</label>
      <button onClick={() => onChange(!value)} className={`w-11 h-6 rounded-full transition-colors relative ${value ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <div className="w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform" style={{ transform: value ? 'translateX(22px)' : 'translateX(2px)' }} />
      </button>
    </div>
  );
}

// ─── Config Panel ────────────────────────────────────────────────────────────

function ConfigPanel({ config, onSave, onClose }: { config: DriverCashConfig; onSave: (c: DriverCashConfig) => void; onClose: () => void }) {
  const [c, setC] = useState({ ...config });
  const s = (k: keyof DriverCashConfig, v: number | boolean) => setC(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Settings className="w-5 h-5 text-gray-500" /> Configuración de caja repartidor</h3>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X className="w-5 h-5" /></button>
      </div>
      <div className="space-y-4">
        <Section title="Apertura">
          <NumRow label="Fondo por defecto" value={c.defaultFloat} onChange={v => s('defaultFloat', v)} unit="€" />
          <Toggle label="Bloquear sesión duplicada" value={c.blockDuplicateSession} onChange={v => s('blockDuplicateSession', v)} />
        </Section>
        <Section title="Automatización">
          <Toggle label="Auto-registrar cobro al entregar" value={c.autoRegisterDeliveryPayments} onChange={v => s('autoRegisterDeliveryPayments', v)} />
          <Toggle label="Integrar cierre con Finanzas" value={c.integrateWithFinance} onChange={v => s('integrateWithFinance', v)} />
        </Section>
        <Section title="Cierre y control">
          <Toggle label="Requerir aprobación del gerente" value={c.requireManagerApproval} onChange={v => s('requireManagerApproval', v)} />
          <NumRow label="Umbral descuadre para incidencia" value={c.mismatchIncidentThreshold} onChange={v => s('mismatchIncidentThreshold', v)} unit="€" />
          <NumRow label="Justificante obligatorio desde" value={c.requireJustificationAbove} onChange={v => s('requireJustificationAbove', v)} unit="€" />
        </Section>
        <Section title="Alertas">
          <NumRow label="Alerta caja sin cerrar tras" value={c.driverSessionMaxOpenHours} onChange={v => s('driverSessionMaxOpenHours', v)} unit="h" min={1} />
          <Toggle label="Alerta descuadre" value={c.driverMismatchAlertEnabled} onChange={v => s('driverMismatchAlertEnabled', v)} />
          <Toggle label="Alerta cobro sin registrar" value={c.unregisteredCashAlertEnabled} onChange={v => s('unregisteredCashAlertEnabled', v)} />
        </Section>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setC({ ...DEFAULT_DRIVER_CASH_CONFIG })} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-medium">Restaurar valores</button>
        <button onClick={() => onSave(c)} className="flex-1 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-semibold text-sm hover:opacity-90">Guardar configuración</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl space-y-3"><h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{title}</h4>{children}</div>;
}

function NumRow({ label, value, onChange, unit, min = 0 }: { label: string; value: number; onChange: (n: number) => void; unit: string; min?: number }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-700 dark:text-gray-300">{label}</label>
      <div className="flex items-center gap-1">
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} min={min} step="1" className="w-20 px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-right bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none" />
        <span className="text-sm text-gray-500">{unit}</span>
      </div>
    </div>
  );
}

// ─── Open Form ───────────────────────────────────────────────────────────────

function OpenForm({ onOpen, orders, config, openSessions }: { onOpen: (n: string, a: number) => void; orders: DeliveryOrder[]; config: DriverCashConfig; openSessions: DriverCashSession[] }) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(String(config.defaultFloat));
  useEffect(() => { setAmount(String(config.defaultFloat)); }, [config.defaultFloat]);
  const drivers = [...new Set(orders.map(o => o.assignedDriver).filter(Boolean))].sort();
  const dup = openSessions.find(s => s.driverName === name && s.status === 'open');

  if (!show) return <button onClick={() => setShow(true)} className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm transition-colors"><Unlock className="w-4 h-4" /> Abrir caja de repartidor</button>;

  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl p-5 space-y-4">
      <h4 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Unlock className="w-4 h-4 text-emerald-600" /> Abrir nueva caja</h4>
      <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Repartidor *</label>
        <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Nombre del repartidor" value={name} onChange={e => setName(e.target.value)} autoFocus />
        {drivers.length > 0 && <div className="flex gap-1.5 flex-wrap mt-2">{drivers.map(d => <button key={d} onClick={() => setName(d)} className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${name === d ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>{d}</button>)}</div>}
        {dup && config.blockDuplicateSession && <div className="mt-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{name} ya tiene una caja abierta desde {new Date(dup.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })}</div>}
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Fondo de caja inicial (€) *</label>
        <div className="flex gap-2">
          {['20', '30', '50', '100'].map(v => <button key={v} onClick={() => setAmount(v)} className={`px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${amount === v ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'}`}>{v}€</button>)}
          <input type="number" className="flex-1 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="Otro" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="0.01" />
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={() => { setShow(false); setName(''); setAmount(String(config.defaultFloat)); }} className="px-5 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
        <button onClick={() => { if (!name.trim()) { toast.error('Indica el nombre del repartidor'); return; } onOpen(name.trim(), Number(amount) || 0); setShow(false); setName(''); setAmount(String(config.defaultFloat)); }} disabled={!name.trim() || !amount || (!!dup && config.blockDuplicateSession)} className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${name.trim() && amount && !(dup && config.blockDuplicateSession) ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'}`}><Unlock className="w-4 h-4" /> Abrir caja con {Number(amount || 0).toFixed(2)}€</button>
      </div>
    </div>
  );
}

// ─── Active Session ──────────────────────────────────────────────────────────

function ActiveSession({ session, orders, onUpdate, onClose, config, userName }: { session: DriverCashSession; orders: DeliveryOrder[]; onUpdate: (s: DriverCashSession) => void; onClose: (s: DriverCashSession, cash: number, notes: string) => void; config: DriverCashConfig; userName?: string }) {
  const [showTx, setShowTx] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [txType, setTxType] = useState<CashTransaction['type']>('cobro');
  const [txMethod, setTxMethod] = useState<CashTransaction['paymentMethod']>('efectivo');
  const [txAmt, setTxAmt] = useState('');
  const [txDesc, setTxDesc] = useState('');
  const [txOrd, setTxOrd] = useState('');
  const [closeCash, setCloseCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editAmt, setEditAmt] = useState('');
  const [editMeth, setEditMeth] = useState<CashTransaction['paymentMethod']>('efectivo');
  const [editDsc, setEditDsc] = useState('');
  const [txReceipt, setTxReceipt] = useState<{ name: string; dataUrl: string } | null>(null);

  const t = calcTotals(session);
  const delivered = orders.filter(o => o.assignedDriver === session.driverName && o.status === 'delivered' && o.deliveredAt && new Date(o.deliveredAt) >= new Date(session.openedAt));
  const charged = new Set(session.transactions.filter(tx => tx.orderId).map(tx => tx.orderId));
  const pending = delivered.filter(o => !charged.has(o._id));
  const hrs = hoursSince(session.openedAt);

  const handleReceiptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('El justificante no puede superar 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setTxReceipt({ name: file.name, dataUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const submitTx = () => {
    const a = Number(txAmt);
    if (!a || a <= 0) { toast.error('Importe inválido'); return; }
    if (a >= config.requireJustificationAbove && !txReceipt && txType === 'gasto') { toast.error(`Los gastos de ${config.requireJustificationAbove}€ o más requieren justificante`); return; }
    const tx: CashTransaction = {
      id: `tx-${Date.now()}`, type: txType, paymentMethod: txMethod, amount: a,
      description: txDesc || `${txType === 'cobro' ? 'Cobro' : txType === 'gasto' ? 'Gasto' : 'Ajuste'}${txOrd ? ` - ${txOrd}` : ''}`,
      orderNumber: txOrd || undefined, date: new Date().toISOString(),
      ...(txReceipt ? { receiptUrl: txReceipt.dataUrl, receiptName: txReceipt.name } : {}),
    };
    onUpdate({ ...session, transactions: [...session.transactions, tx] });
    setTxAmt(''); setTxDesc(''); setTxOrd(''); setTxReceipt(null); setShowTx(false);
  };
  const quickCharge = (o: DeliveryOrder, m: CashTransaction['paymentMethod']) => { onUpdate({ ...session, transactions: [...session.transactions, { id: `tx-${Date.now()}`, type: 'cobro', paymentMethod: m, amount: o.totalAmount, description: `Cobro ${o.orderNumber} — ${o.customerName}`, orderNumber: o.orderNumber, orderId: o._id, date: new Date().toISOString() }] }); };
  const deleteTx = (id: string) => { if (!confirm('¿Eliminar este movimiento?')) return; onUpdate({ ...session, transactions: session.transactions.filter(tx => tx.id !== id) }); };
  const saveEdit = (id: string) => { const a = Number(editAmt); if (!a || a <= 0) { toast.error('Importe inválido'); return; } onUpdate({ ...session, transactions: session.transactions.map(tx => tx.id !== id ? tx : { ...tx, amount: a, paymentMethod: editMeth, description: editDsc || tx.description, originalAmount: tx.originalAmount ?? tx.amount, editedAt: new Date().toISOString(), editedBy: userName || '' }) }); setEditId(null); };

  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">{session.driverName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>
          <div>
            <div className="font-bold text-gray-900 dark:text-gray-100">{session.driverName}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <span>Abierta {new Date(session.openedAt).toLocaleString('es-ES', { timeStyle: 'short', dateStyle: 'short' })}</span>
              {hrs >= (config.driverSessionMaxOpenHours || 10) && <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-[10px] font-bold flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{Math.floor(hrs)}h</span>}
            </div>
          </div>
        </div>
        <div className="text-right"><div className="text-xs text-gray-500 dark:text-gray-400">Efectivo esperado</div><div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{t.expected.toFixed(2)}€</div></div>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Fondo inicial" value={`${session.initialFloat.toFixed(2)}€`} />
          <KpiCard label="Ventas totales" value={`${t.sales.toFixed(2)}€`} color="green" icon={<TrendingUp className="w-3 h-3" />} />
          <KpiCard label="Gastos" value={`${t.cashOut.toFixed(2)}€`} color="red" icon={<TrendingDown className="w-3 h-3" />} />
          <KpiCard label="Entregas" value={String(delivered.length)} color="blue" />
        </div>
        {t.sales > 0 && <div className="flex gap-3 flex-wrap text-xs">
          {t.cashIn > 0 && <Badge icon={<Banknote className="w-3 h-3" />} color="green">Efectivo: {t.cashIn.toFixed(2)}€</Badge>}
          {t.card > 0 && <Badge icon={<CreditCard className="w-3 h-3" />} color="blue">Tarjeta: {t.card.toFixed(2)}€</Badge>}
          {t.bizum > 0 && <Badge icon={<Phone className="w-3 h-3" />} color="purple">Bizum: {t.bizum.toFixed(2)}€</Badge>}
          {t.online > 0 && <Badge icon={<Wifi className="w-3 h-3" />} color="cyan">Online: {t.online.toFixed(2)}€</Badge>}
        </div>}
        {pending.length > 0 && <div>
          <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5" /> Pedidos sin cobrar ({pending.length})</h5>
          <div className="space-y-2 max-h-48 overflow-y-auto">{pending.map(o => <div key={o._id} className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{o.orderNumber}</span><span className="text-xs text-gray-500">{o.customerName}</span></div><div className="text-sm font-bold text-gray-900 dark:text-gray-100">{o.totalAmount.toFixed(2)}€</div></div>
            <div className="flex gap-1.5 shrink-0">{(['efectivo', 'tarjeta', 'bizum'] as const).map(m => <button key={m} onClick={() => quickCharge(o, m)} className="px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors">{m === 'efectivo' ? '💵' : m === 'tarjeta' ? '💳' : '📱'} {PAY_LABELS[m]}</button>)}</div>
          </div>)}</div>
        </div>}
        {session.transactions.length > 0 && <div>
          <h5 className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Movimientos ({session.transactions.length})</h5>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">{[...session.transactions].reverse().map(tx => <div key={tx.id} className="group">
            {editId === tx.id ? <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
              <div className="flex gap-2"><input type="number" value={editAmt} onChange={e => setEditAmt(e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none" /><select value={editMeth} onChange={e => setEditMeth(e.target.value as CashTransaction['paymentMethod'])} className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none">{Object.entries(PAY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <input value={editDsc} onChange={e => setEditDsc(e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none" placeholder="Descripción" />
              <div className="flex gap-2"><button onClick={() => setEditId(null)} className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400">Cancelar</button><button onClick={() => saveEdit(tx.id)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-medium">Guardar</button></div>
            </div> : <div className="flex items-center gap-3 py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${tx.type === 'cobro' ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : tx.type === 'gasto' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>{tx.type === 'cobro' ? <TrendingUp className="w-3 h-3" /> : tx.type === 'gasto' ? <TrendingDown className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}</div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 dark:text-gray-100 truncate flex items-center gap-1.5">{tx.description}{tx.auto && <span className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-[10px] font-bold"><Zap className="w-2.5 h-2.5 inline" /> Auto</span>}{tx.editedAt && <span className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded text-[10px] font-bold">Editado</span>}{tx.receiptUrl && <span className="px-1 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded text-[10px] font-bold"><Receipt className="w-2.5 h-2.5 inline" /> Justif.</span>}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500"><span>{new Date(tx.date).toLocaleTimeString('es-ES', { timeStyle: 'short' })}</span><span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-gray-600 dark:text-gray-300">{PAY_LABELS[tx.paymentMethod] || tx.paymentMethod}</span></div>
              </div>
              <span className={`font-bold shrink-0 ${tx.type === 'cobro' ? 'text-green-700 dark:text-green-400' : tx.type === 'gasto' ? 'text-red-700 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>{tx.type === 'gasto' ? '-' : '+'}{tx.amount.toFixed(2)}€</span>
              <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                <button onClick={() => { setEditId(tx.id); setEditAmt(String(tx.amount)); setEditMeth(tx.paymentMethod); setEditDsc(tx.description); }} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"><Edit3 className="w-3 h-3" /></button>
                <button onClick={() => deleteTx(tx.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>}
          </div>)}</div>
        </div>}
        {showTx ? <div className="p-4 bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
          <h5 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Nuevo movimiento</h5>
          <div className="flex gap-2">{(['cobro', 'gasto', 'ajuste'] as const).map(tp => <button key={tp} onClick={() => setTxType(tp)} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border-2 ${txType === tp ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>{tp === 'cobro' ? 'Cobro' : tp === 'gasto' ? 'Gasto' : 'Ajuste'}</button>)}</div>
          <div className="flex gap-2">{(['efectivo', 'tarjeta', 'bizum', 'online'] as const).map(m => <button key={m} onClick={() => setTxMethod(m)} className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${txMethod === m ? 'border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}>{PAY_LABELS[m]}</button>)}</div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="Importe €" value={txAmt} onChange={e => setTxAmt(e.target.value)} min="0" step="0.01" />
            <input className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="Nº pedido (opc.)" value={txOrd} onChange={e => setTxOrd(e.target.value)} />
          </div>
          <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="Descripción (opc.)" value={txDesc} onChange={e => setTxDesc(e.target.value)} />
          <div>
            <label className="flex items-center gap-2 px-3 py-2.5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
              <Receipt className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-gray-400">{txReceipt ? txReceipt.name : 'Adjuntar justificante (opc.)'}</span>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleReceiptFile} />
              {txReceipt && <button type="button" onClick={e => { e.preventDefault(); setTxReceipt(null); }} className="ml-auto text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>}
            </label>
            {txType === 'gasto' && Number(txAmt) >= config.requireJustificationAbove && !txReceipt && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Justificante obligatorio para gastos de {config.requireJustificationAbove}€+</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowTx(false); setTxAmt(''); setTxDesc(''); setTxOrd(''); setTxReceipt(null); }} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-medium">Cancelar</button>
            <button onClick={submitTx} className="flex-1 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-semibold text-sm hover:opacity-90">Registrar movimiento</button>
          </div>
        </div> : <div className="flex gap-2">
          <button onClick={() => setShowTx(true)} className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Añadir movimiento</button>
          <button onClick={() => { setShowCloseForm(true); setCloseCash(t.expected.toFixed(2)); }} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><Lock className="w-4 h-4" /> Cerrar caja</button>
        </div>}
        {showCloseForm && <div className="p-4 bg-red-50 dark:bg-red-900/10 border-2 border-red-200 dark:border-red-800 rounded-xl space-y-3">
          <h5 className="font-bold text-red-800 dark:text-red-300 flex items-center gap-2"><Lock className="w-4 h-4" /> Cerrar caja de {session.driverName}</h5>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <MiniStat label="Fondo inicial" value={`${session.initialFloat.toFixed(2)}€`} />
            <MiniStat label="Cobros efectivo" value={`${t.cashIn.toFixed(2)}€`} color="green" />
            <MiniStat label="Gastos" value={`${t.cashOut.toFixed(2)}€`} color="red" />
            <MiniStat label="Efectivo esperado" value={`${t.expected.toFixed(2)}€`} color="emerald" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-1.5">Efectivo real contado *</label>
            <input type="number" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" value={closeCash} onChange={e => setCloseCash(e.target.value)} min="0" step="0.01" />
            {closeCash && <div className={`mt-2 text-sm font-bold ${Number(closeCash) - t.expected === 0 ? 'text-green-600' : Number(closeCash) - t.expected > 0 ? 'text-blue-600' : 'text-red-600'}`}>Diferencia: {Number(closeCash) - t.expected >= 0 ? '+' : ''}{(Number(closeCash) - t.expected).toFixed(2)}€{Number(closeCash) - t.expected === 0 && ' — Cuadra perfectamente'}</div>}
          </div>
          {closeCash && Math.abs(Number(closeCash) - t.expected) >= config.mismatchIncidentThreshold && <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />Se generará una incidencia por descuadre de {Math.abs(Number(closeCash) - t.expected).toFixed(2)}€</div>}
          <div>
            <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase mb-1.5">Notas de cierre</label>
            <textarea rows={2} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none text-sm" placeholder="Observaciones..." value={closeNotes} onChange={e => setCloseNotes(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowCloseForm(false)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-medium">Cancelar</button>
            <button onClick={() => { onClose(session, Number(closeCash) || 0, closeNotes); setShowCloseForm(false); }} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><Lock className="w-4 h-4" />{config.requireManagerApproval ? 'Enviar para revisión' : 'Confirmar cierre'}</button>
          </div>
        </div>}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: React.ReactNode }) {
  const bg = color === 'green' ? 'bg-green-50 dark:bg-green-900/20' : color === 'red' ? 'bg-red-50 dark:bg-red-900/20' : color === 'blue' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-700/50';
  const txt = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : color === 'blue' ? 'text-blue-600' : 'text-gray-500 dark:text-gray-400';
  const val = color === 'green' ? 'text-green-700 dark:text-green-400' : color === 'red' ? 'text-red-700 dark:text-red-400' : color === 'blue' ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100';
  return <div className={`p-3 ${bg} rounded-xl`}><div className={`text-xs ${txt} flex items-center gap-1`}>{icon}{label}</div><div className={`text-lg font-bold ${val}`}>{value}</div></div>;
}

function Badge({ icon, color, children }: { icon: React.ReactNode; color: string; children: React.ReactNode }) {
  const cls = color === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : color === 'purple' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' : 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400';
  return <span className={`px-2.5 py-1 ${cls} rounded-lg font-medium flex items-center gap-1`}>{icon}{children}</span>;
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const val = color === 'green' ? 'text-green-700' : color === 'red' ? 'text-red-700' : color === 'emerald' ? 'text-emerald-700' : 'text-gray-900 dark:text-gray-100';
  return <div className="p-2 bg-white dark:bg-gray-800 rounded-lg"><div className="text-xs text-gray-500">{label}</div><div className={`font-bold ${val}`}>{value}</div></div>;
}

// ─── Pending Review ──────────────────────────────────────────────────────────

function ReviewCard({ session, onApprove, onReject }: { session: DriverCashSession; onApprove: (s: DriverCashSession, cash?: number, notes?: string) => void; onReject: (s: DriverCashSession, notes: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejNotes, setRejNotes] = useState('');
  const [adjCash, setAdjCash] = useState(String(session.actualCash));
  const [appNotes, setAppNotes] = useState('');

  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-amber-200 dark:border-amber-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xs shrink-0">{session.driverName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>
          <div><div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{session.driverName}</div><div className="text-xs text-gray-500">Cerrada a las {session.closedAt ? new Date(session.closedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' }) : '—'}</div></div>
        </div>
        <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-bold">Pendiente</span>
      </div>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <MiniStat label="Esperado" value={`${session.expectedCash.toFixed(2)}€`} />
          <MiniStat label="Contado" value={`${session.actualCash.toFixed(2)}€`} />
          <MiniStat label="Diferencia" value={`${session.difference >= 0 ? '+' : ''}${session.difference.toFixed(2)}€`} color={session.difference === 0 ? 'green' : session.difference < 0 ? 'red' : undefined} />
          <MiniStat label="Movimientos" value={String(session.transactions.length)} />
        </div>
        {session.closingNotes && <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg"><MessageSquare className="w-3 h-3 inline mr-1" />{session.closingNotes}</div>}
        <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ajustar efectivo</label><input type="number" value={adjCash} onChange={e => setAdjCash(e.target.value)} min="0" step="0.01" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none" /></div>
        <input value={appNotes} onChange={e => setAppNotes(e.target.value)} placeholder="Notas del gerente (opc.)" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none" />
        {rejecting ? <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg space-y-2">
          <textarea rows={2} value={rejNotes} onChange={e => setRejNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none resize-none" placeholder="Motivo del rechazo *" />
          <div className="flex gap-2"><button onClick={() => setRejecting(false)} className="px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400">Cancelar</button><button onClick={() => { if (!rejNotes.trim()) { toast.error('Indica el motivo'); return; } onReject(session, rejNotes); }} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold">Confirmar rechazo</button></div>
        </div> : <div className="flex gap-2">
          <button onClick={() => setRejecting(true)} className="px-4 py-2.5 border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20"><X className="w-4 h-4 inline mr-1" />Rechazar</button>
          <button onClick={() => onApprove(session, Number(adjCash) || undefined, appNotes || undefined)} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" />Aprobar cierre</button>
        </div>}
      </div>
    </div>
  );
}

// ─── Closed Summary ──────────────────────────────────────────────────────────

function ClosedSummary({ session, onReopen }: { session: DriverCashSession; onReopen?: (s: DriverCashSession, reason: string) => void }) {
  const [exp, setExp] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [reason, setReason] = useState('');
  const sales = session.transactions.filter(t => t.type === 'cobro').reduce((a, t) => a + t.amount, 0);
  const cash = session.transactions.filter(t => t.type === 'cobro' && t.paymentMethod === 'efectivo').reduce((a, t) => a + t.amount, 0);
  const expenses = session.transactions.filter(t => t.type === 'gasto').reduce((a, t) => a + t.amount, 0);
  const canReopen = onReopen && session.closedAt && hoursSince(session.closedAt) < 24;

  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button onClick={() => setExp(!exp)} className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 font-bold text-xs shrink-0">{session.driverName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>
        <div className="flex-1 min-w-0"><div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{session.driverName}</div><div className="text-xs text-gray-500 dark:text-gray-400">{new Date(session.openedAt).toLocaleDateString('es-ES', { dateStyle: 'short' })} · {new Date(session.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })} → {session.closedAt ? new Date(session.closedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' }) : '—'}</div></div>
        <div className="flex items-center gap-4 shrink-0"><div className="text-right"><div className="text-xs text-gray-500">Ventas</div><div className="text-sm font-bold text-green-700 dark:text-green-400">{sales.toFixed(2)}€</div></div><div className="text-right"><div className="text-xs text-gray-500">Diferencia</div><div className={`text-sm font-bold ${session.difference === 0 ? 'text-green-600' : session.difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>{session.difference >= 0 ? '+' : ''}{session.difference.toFixed(2)}€</div></div><ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${exp ? 'rotate-90' : ''}`} /></div>
      </button>
      {exp && <div className="px-5 pb-5 pt-0 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
          <MiniStat label="Fondo" value={`${session.initialFloat.toFixed(2)}€`} />
          <MiniStat label="Efectivo cobrado" value={`${cash.toFixed(2)}€`} color="green" />
          <MiniStat label="Esperado" value={`${session.expectedCash.toFixed(2)}€`} />
          <MiniStat label="Real contado" value={`${session.actualCash.toFixed(2)}€`} />
        </div>
        {expenses > 0 && <div className="text-xs text-red-600">Gastos: {expenses.toFixed(2)}€</div>}
        {session.closingNotes && <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg"><MessageSquare className="w-3 h-3 inline mr-1" />{session.closingNotes}</div>}
        {session.reviewedBy && <div className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded-lg"><Check className="w-3 h-3 inline mr-1" />Aprobado{session.reviewedAt ? ` el ${new Date(session.reviewedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : ''}{session.reviewNotes ? ` — ${session.reviewNotes}` : ''}</div>}
        {session.reopenHistory && session.reopenHistory.length > 0 && <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg"><RotateCcw className="w-3 h-3 inline mr-1" />Reabierta {session.reopenHistory.length} vez(ces)</div>}
        {session.transactions.length > 0 && <div><h5 className="text-xs font-bold text-gray-500 uppercase mb-1.5">Movimientos ({session.transactions.length})</h5><div className="space-y-1 max-h-40 overflow-y-auto">{session.transactions.map(tx => <div key={tx.id} className="flex items-center justify-between text-xs py-1.5 px-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"><span className="text-gray-700 dark:text-gray-300 truncate flex items-center gap-1">{tx.description}{tx.auto && <span className="text-[10px] text-yellow-600 font-bold">⚡</span>}</span><span className={`font-bold shrink-0 ml-2 ${tx.type === 'cobro' ? 'text-green-700' : tx.type === 'gasto' ? 'text-red-700' : 'text-blue-700'}`}>{tx.type === 'gasto' ? '-' : '+'}{tx.amount.toFixed(2)}€</span></div>)}</div></div>}
        {canReopen && !showReopen && <button onClick={() => setShowReopen(true)} className="w-full py-2 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center justify-center gap-1.5"><RotateCcw className="w-3 h-3" />Reabrir caja</button>}
        {showReopen && <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
          <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">Motivo de reapertura *</p>
          <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none outline-none" placeholder="Ej: Error en el conteo..." />
          <div className="flex gap-2"><button onClick={() => { setShowReopen(false); setReason(''); }} className="px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400">Cancelar</button><button onClick={() => { if (!reason.trim()) { toast.error('Indica el motivo'); return; } onReopen?.(session, reason); setShowReopen(false); setReason(''); }} className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold">Confirmar reapertura</button></div>
        </div>}
      </div>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface DriverCashModalProps {
  open: boolean;
  onClose?: () => void;
  userId: string;
  embedded?: boolean;
  orders: DeliveryOrder[];
  userName?: string;
  onSessionClosed?: (session: DriverCashSession) => void;
  workerMode?: boolean;
  workerDriverName?: string;
}

export function DriverCashModal({ open, onClose, userId, embedded, orders, userName, onSessionClosed, workerMode, workerDriverName }: DriverCashModalProps) {
  const { sessions, setSessions, config, setConfig, loading, openSessions, pendingReview, closed } = useDriverCashSessions(userId);
  const [showCfg, setShowCfg] = useState(false);
  const [filterDriver, setFilterDriver] = useState('');
  const [filterMismatch, setFilterMismatch] = useState(false);
  const [limit, setLimit] = useState(20);

  const wName = workerMode ? workerDriverName : undefined;
  const myOpen = wName ? openSessions.filter(s => s.driverName === wName) : openSessions;
  const myClosed = wName ? closed.filter(s => s.driverName === wName) : closed;

  const drivers = useMemo(() => [...new Set(sessions.map(s => s.driverName))].sort(), [sessions]);
  const filtered = useMemo(() => { let l = myClosed; if (filterDriver) l = l.filter(s => s.driverName === filterDriver); if (filterMismatch) l = l.filter(s => s.difference !== 0); return l; }, [myClosed, filterDriver, filterMismatch]);

  const alerts = useMemo(() => {
    const a: Array<{ msg: string; level: 'warning' | 'alert' }> = [];
    for (const s of openSessions) { const h = hoursSince(s.openedAt); if (h >= (config.driverSessionMaxOpenHours || 10)) a.push({ msg: `${s.driverName} lleva abierta la caja desde las ${new Date(s.openedAt).toLocaleTimeString('es-ES', { timeStyle: 'short' })} (${Math.floor(h)}h)`, level: h >= (config.driverSessionMaxOpenHours || 10) * 1.5 ? 'alert' : 'warning' }); }
    for (const s of closed.slice(0, 5)) { if (Math.abs(s.difference) >= (config.mismatchIncidentThreshold || 5) && s.closedAt && hoursSince(s.closedAt) < 24) a.push({ msg: `Último cierre de ${s.driverName} tuvo descuadre de ${s.difference >= 0 ? '+' : ''}${s.difference.toFixed(2)}€`, level: 'warning' }); }
    return a;
  }, [openSessions, closed, config]);

  const handleOpen = async (name: string, float: number) => { try { const c = await createDriverCashSessionRequest(userId, { driverName: name, initialFloat: float, status: 'open', transactions: [] } as Partial<DriverCashSession>); setSessions(p => [c, ...p]); toast.success(`Caja abierta para ${name} con ${float.toFixed(2)}€`); } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Error al abrir caja'); } };
  const handleUpdate = async (s: DriverCashSession) => { try { const u = await updateDriverCashSessionRequest(userId, s); setSessions(p => p.map(x => x._id === u._id ? u : x)); } catch { toast.error('Error al actualizar sesión'); } };
  const handleClose = async (s: DriverCashSession, cash: number, notes: string) => { const { expected } = calcTotals(s); const diff = Number((cash - expected).toFixed(2)); const st = config.requireManagerApproval ? 'pending_review' : 'closed'; try { const u = await updateDriverCashSessionRequest(userId, { ...s, status: st as DriverCashSession['status'], closedAt: new Date().toISOString(), expectedCash: expected, actualCash: cash, difference: diff, closingNotes: notes }); setSessions(p => p.map(x => x._id === u._id ? u : x)); toast.success(st === 'pending_review' ? `Caja de ${s.driverName} enviada para revisión` : `Caja de ${s.driverName} cerrada`); if (st === 'closed') onSessionClosed?.(u); } catch { toast.error('Error al cerrar caja'); } };
  const handleApprove = async (s: DriverCashSession, cash?: number, notes?: string) => { const ac = cash ?? s.actualCash; const diff = Number((ac - s.expectedCash).toFixed(2)); try { const u = await updateDriverCashSessionRequest(userId, { ...s, status: 'closed', actualCash: ac, difference: diff, reviewedBy: userName || 'Gerente', reviewedAt: new Date().toISOString(), reviewNotes: notes || '' }); setSessions(p => p.map(x => x._id === u._id ? u : x)); toast.success(`Cierre de ${s.driverName} aprobado`); onSessionClosed?.(u); } catch { toast.error('Error al aprobar'); } };
  const handleReject = async (s: DriverCashSession, notes: string) => { try { const u = await updateDriverCashSessionRequest(userId, { ...s, status: 'open', closedAt: '', expectedCash: 0, actualCash: 0, difference: 0, closingNotes: '', reviewNotes: `Rechazado: ${notes}` }); setSessions(p => p.map(x => x._id === u._id ? u : x)); toast.success(`Cierre rechazado — caja reabierta`); } catch { toast.error('Error al rechazar'); } };
  const handleReopen = async (s: DriverCashSession, reason: string) => { try { const u = await updateDriverCashSessionRequest(userId, { ...s, status: 'open', reopenHistory: [...(s.reopenHistory || []), { reopenedAt: new Date().toISOString(), reopenedBy: userName || 'Gerente', reason, previousClosedAt: s.closedAt, previousDifference: s.difference }], closedAt: '', expectedCash: 0, actualCash: 0, difference: 0, closingNotes: '', reviewedBy: '', reviewedAt: '', reviewNotes: '' }); setSessions(p => p.map(x => x._id === u._id ? u : x)); toast.success(`Caja de ${s.driverName} reabierta`); } catch { toast.error('Error al reabrir'); } };
  const handleSaveCfg = async (c: DriverCashConfig) => { try { const s = await saveDriverCashConfigRequest(userId, c); setConfig(s); setShowCfg(false); toast.success('Configuración guardada'); } catch { toast.error('Error al guardar configuración'); } };

  if (!open) return null;

  const content = (
    <div className="space-y-5">
      {showCfg && !workerMode ? <ConfigPanel config={config} onSave={handleSaveCfg} onClose={() => setShowCfg(false)} /> : <>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center"><Wallet className="w-5 h-5 text-emerald-600" /></div><div><h3 className="font-bold text-gray-900 dark:text-gray-100">{workerMode ? 'Mi caja' : 'Caja de repartidores'}</h3><p className="text-sm text-gray-500 dark:text-gray-400">{myOpen.length} abierta(s){!workerMode && pendingReview.length > 0 ? ` · ${pendingReview.length} pendiente(s)` : ''}</p></div></div>
          <div className="flex items-center gap-2">{!workerMode && <button onClick={() => setShowCfg(true)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><Settings className="w-5 h-5" /></button>}{!embedded && onClose && <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>}</div>
        </div>

        {!workerMode && alerts.length > 0 && <div className="space-y-2">{alerts.map((a, i) => <div key={i} className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${a.level === 'alert' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'}`}><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{a.msg}</div>)}</div>}

        {!workerMode && <OpenForm onOpen={handleOpen} orders={orders} config={config} openSessions={openSessions} />}
        {workerMode && myOpen.length === 0 && wName && <OpenForm onOpen={(_, a) => handleOpen(wName, a)} orders={orders} config={config} openSessions={openSessions} />}

        {myOpen.length > 0 && <div className="space-y-4"><h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{workerMode ? 'Tu caja activa' : 'Cajas abiertas'}</h4>{myOpen.map(s => <ActiveSession key={s._id} session={s} orders={orders} config={config} userName={userName} onUpdate={handleUpdate} onClose={handleClose} />)}</div>}

        {!workerMode && pendingReview.length > 0 && <div className="space-y-4"><h4 className="text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Pendientes de revisión ({pendingReview.length})</h4>{pendingReview.map(s => <ReviewCard key={s._id} session={s} onApprove={handleApprove} onReject={handleReject} />)}</div>}

        {filtered.length > 0 && <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Historial</h4>
            <div className="flex items-center gap-2">
              {drivers.length > 1 && <select value={filterDriver} onChange={e => setFilterDriver(e.target.value)} className="px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none"><option value="">Todos</option>{drivers.map(d => <option key={d} value={d}>{d}</option>)}</select>}
              <button onClick={() => setFilterMismatch(!filterMismatch)} className={`px-2.5 py-1.5 border rounded-lg text-xs font-medium ${filterMismatch ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}><Filter className="w-3 h-3 inline mr-1" />Descuadres</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-center"><div className="text-xs text-gray-500">Sesiones</div><div className="text-lg font-bold text-gray-900 dark:text-gray-100">{filtered.length}</div></div>
            <div className="p-2.5 bg-green-50 dark:bg-green-900/20 rounded-xl text-center"><div className="text-xs text-green-600">Ventas</div><div className="text-lg font-bold text-green-700 dark:text-green-400">{filtered.reduce((a, s) => a + s.transactions.filter(tx => tx.type === 'cobro').reduce((b, tx) => b + tx.amount, 0), 0).toFixed(2)}€</div></div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center"><div className="text-xs text-emerald-600">Efectivo</div><div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{filtered.reduce((a, s) => a + s.actualCash, 0).toFixed(2)}€</div></div>
            <div className="p-2.5 bg-red-50 dark:bg-red-900/20 rounded-xl text-center"><div className="text-xs text-red-600">Gastos</div><div className="text-lg font-bold text-red-700 dark:text-red-400">{filtered.reduce((a, s) => a + s.transactions.filter(tx => tx.type === 'gasto').reduce((b, tx) => b + tx.amount, 0), 0).toFixed(2)}€</div></div>
            <div className="p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-center"><div className="text-xs text-gray-500">Descuadre</div><div className={`text-lg font-bold ${filtered.reduce((a, s) => a + s.difference, 0) === 0 ? 'text-green-600' : 'text-red-600'}`}>{filtered.reduce((a, s) => a + s.difference, 0).toFixed(2)}€</div></div>
          </div>
          {filtered.slice(0, limit).map(s => <ClosedSummary key={s._id} session={s} onReopen={workerMode ? undefined : handleReopen} />)}
          {filtered.length > limit && <button onClick={() => setLimit(p => p + 20)} className="w-full py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">Cargar más ({filtered.length - limit} restantes)</button>}
        </div>}

        {sessions.length === 0 && !loading && <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700"><Wallet className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" /><p className="font-semibold">Sin sesiones de caja</p><p className="text-sm mt-1">Abre una caja para un repartidor al inicio de su turno</p></div>}
      </>}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl my-8 p-6">{content}</div>
    </div>
  );
}
