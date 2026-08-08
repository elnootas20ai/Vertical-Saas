import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useFinanceUserId } from '../../hooks/useFinanceUserId';
import { useActiveBusinessScope } from '../../hooks/useActiveBusinessScope';
import {
  listFinanceMovements,
  createFinanceMovementInCouch,
  updateFinanceMovementInCouch,
  deleteFinanceMovementFromCouch,
  markMovementPaid,
  fetchCategorySuggestion,
  fetchReconciliationSuggestions,
  type ReconciliationSuggestion,
} from '../../lib/financeApi';
import type {
  FinanceMovementRecord,
  CreateFinanceMovementPayload,
  FinanceMovementDocType,
  FinanceMovementStatus,
} from '../../lib/financeTypes';
import {
  Plus, Search, X, Trash2, Edit3, TrendingUp, TrendingDown,
  DollarSign, ArrowUpDown, Calendar, Download, BarChart3,
  CheckCircle2, Clock, Paperclip, Link2,
  Check, AlertTriangle, Filter, Sparkles, ScanLine,
} from 'lucide-react';
import { SAAS__OcrScanModal } from '../../components/design-system/SAAS__OcrScanModal';

// ─── Constants ───────────────────────────────────────────────────────────────

const INCOME_CATEGORIES = [
  { value: 'ventas', label: 'Ventas', icon: '🛒' },
  { value: 'servicios', label: 'Servicios', icon: '🔧' },
  { value: 'comisiones', label: 'Comisiones', icon: '🤝' },
  { value: 'alquiler', label: 'Alquiler', icon: '🏠' },
  { value: 'intereses', label: 'Intereses', icon: '🏦' },
  { value: 'otros_ingresos', label: 'Otros ingresos', icon: '📦' },
];

const EXPENSE_CATEGORIES = [
  { value: 'personal', label: 'Personal', icon: '👥' },
  { value: 'alquiler', label: 'Alquiler', icon: '🏠' },
  { value: 'suministros', label: 'Suministros', icon: '💡' },
  { value: 'materiales', label: 'Materiales', icon: '🧱' },
  { value: 'seguros', label: 'Seguros', icon: '🛡️' },
  { value: 'marketing', label: 'Marketing', icon: '📣' },
  { value: 'impuestos', label: 'Impuestos', icon: '🏛️' },
  { value: 'transporte', label: 'Transporte', icon: '🚛' },
  { value: 'mantenimiento', label: 'Mantenimiento', icon: '🔩' },
  { value: 'software', label: 'Software', icon: '💻' },
  { value: 'asesoría', label: 'Asesoría', icon: '📋' },
  { value: 'otros_gastos', label: 'Otros gastos', icon: '📦' },
];

const PAY_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'domiciliacion', label: 'Domiciliación' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'otro', label: 'Otro' },
];

const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCatIcon(category: string) {
  return ALL_CATEGORIES.find(c => c.value === category)?.icon || '📁';
}

function getCatLabel(category: string) {
  return ALL_CATEGORIES.find(c => c.value === category)?.label || category;
}

// ─── Source badge ────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  if (source === 'manual' || !source) return null;
  const map: Record<string, { label: string; color: string }> = {
    invoice: { label: 'Factura', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
    ocr: { label: 'OCR', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
    sale: { label: 'Venta', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    realestate_contract: { label: 'Inmobiliaria', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
    realestate_appraisal: { label: 'Tasación', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
    labor_month: { label: 'Nómina', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  };
  const info = map[source];
  if (!info) return null;
  return <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md ${info.color}`}>{info.label}</span>;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  gradient: string;
  iconBg: string;
  textColor: string;
  labelColor: string;
}

function KpiCard({ icon, value, label, gradient, iconBg, textColor, labelColor }: KpiCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 ${gradient} border border-white/20 dark:border-white/5 shadow-sm`}>
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${iconBg} mb-3`}>
        {icon}
      </div>
      <div className={`text-2xl font-extrabold tracking-tight ${textColor}`}>{value}</div>
      <div className={`text-xs font-medium mt-1 ${labelColor}`}>{label}</div>
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status, dueDate }: { status: FinanceMovementStatus; dueDate?: string }) {
  const isOverdue = status === 'pending' && dueDate && new Date(dueDate) < new Date();
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <CheckCircle2 className="w-3 h-3" /> Pagado
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${isOverdue
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    }`}>
      <Clock className="w-3 h-3" /> {isOverdue ? 'Vencido' : 'Pendiente'}
    </span>
  );
}

// ─── Create / Edit Modal ─────────────────────────────────────────────────────

interface CreateMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateFinanceMovementPayload) => void;
  editItem?: FinanceMovementRecord | null;
  defaultType?: FinanceMovementDocType;
  userId?: string;
  businessId?: string;
  businessName?: string;
  workCenters?: { id: string; name: string }[];
}

function CreateMovementModal({
  isOpen, onClose, onCreate, editItem, defaultType, userId,
  businessId, businessName, workCenters = [],
}: CreateMovementModalProps) {
  const [form, setForm] = useState({
    type: (defaultType || 'cobro') as FinanceMovementDocType,
    concept: '', reference: '', category: '', amountBase: '', taxRate: '21',
    date: new Date().toISOString().slice(0, 10), payMethod: 'transferencia',
    notes: '', companyName: '',
    status: 'paid' as FinanceMovementStatus,
    dueDate: '',
    workCenterId: '',
  });
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (editItem) {
      setForm({
        type: editItem.type, concept: editItem.concept, reference: editItem.reference,
        category: editItem.category, amountBase: String(editItem.amountBase),
        taxRate: String(editItem.taxRate), date: editItem.date.slice(0, 10),
        payMethod: editItem.payMethod, notes: editItem.notes, companyName: editItem.companyName || '',
        status: editItem.status || 'paid',
        dueDate: editItem.dueDate || '',
        workCenterId: editItem.workCenterId || '',
      });
    } else {
      setForm({
        type: defaultType || 'cobro', concept: '', reference: '', category: '',
        amountBase: '', taxRate: '21', date: new Date().toISOString().slice(0, 10),
        payMethod: 'transferencia', notes: '', companyName: '',
        status: 'paid', dueDate: '',
        workCenterId: '',
      });
    }
    setSuggestedCategory(null);
  }, [editItem, isOpen, defaultType]);

  useEffect(() => {
    if (!userId || !isOpen) return;
    const search = form.companyName || form.concept;
    if (!search || search.length < 3) { setSuggestedCategory(null); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const cat = await fetchCategorySuggestion(userId, {
          concept: form.concept, companyName: form.companyName, type: form.type,
        });
        if (cat && cat !== form.category) setSuggestedCategory(cat);
        else setSuggestedCategory(null);
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [form.companyName, form.concept, form.type, userId, isOpen, form.category]);

  if (!isOpen) return null;

  const base = Number(form.amountBase) || 0;
  const tax = Number(form.taxRate) || 0;
  const taxAmount = Number((base * (tax / 100)).toFixed(2));
  const total = Number((base + taxAmount).toFixed(2));
  const categories = form.type === 'cobro' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.concept.trim()) { toast.error('El concepto es obligatorio'); return; }
    if (!form.category) { toast.error('Selecciona una categoría'); return; }
    if (base <= 0) { toast.error('El importe debe ser mayor que 0'); return; }
    const wc = workCenters.find((w) => w.id === form.workCenterId);
    onCreate({
      type: form.type, concept: form.concept, reference: form.reference,
      category: form.category, amountBase: base, taxRate: tax,
      date: form.date, payMethod: form.payMethod, notes: form.notes,
      companyName: form.companyName, user_id: '',
      status: form.status,
      dueDate: form.status === 'pending' ? form.dueDate : undefined,
      paidAt: form.status === 'paid' ? new Date().toISOString() : undefined,
      businessId: businessId || undefined,
      businessName: businessName || undefined,
      workCenterId: form.workCenterId || undefined,
      workCenterName: wc?.name || undefined,
    });
  };

  const inputClass = 'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-all text-sm';
  const labelClass = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editItem ? 'Editar movimiento' : 'Nuevo movimiento'}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{editItem ? 'Modifica los datos del movimiento' : 'Registra un ingreso o gasto'}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Type selector */}
          <div className="flex gap-2">
            {(['cobro', 'pago'] as const).map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t, category: '' }))}
                className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm border transition-all ${form.type === t
                  ? t === 'cobro'
                    ? 'bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                    : 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 shadow-sm'
                  : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                {t === 'cobro' ? '↑ Ingreso' : '↓ Gasto'}
              </button>
            ))}
          </div>

          {/* Status + Due date */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className={labelClass}>Estado</label>
              <div className="flex gap-2">
                {(['paid', 'pending'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: s }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${form.status === s
                      ? s === 'paid'
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400'
                        : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:border-gray-300'}`}>
                    {s === 'paid' ? <><CheckCircle2 className="w-3.5 h-3.5" /> Pagado</> : <><Clock className="w-3.5 h-3.5" /> Pendiente</>}
                  </button>
                ))}
              </div>
            </div>
            {form.status === 'pending' && (
              <div className="flex-1">
                <label className={labelClass}>Vencimiento</label>
                <input type="date" className={inputClass} value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            )}
          </div>

          {/* Concept + Company */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Concepto *</label>
              <input className={inputClass} placeholder="Descripción del movimiento" value={form.concept} onChange={e => setForm(f => ({ ...f, concept: e.target.value }))} autoFocus />
            </div>
            <div>
              <label className={labelClass}>Empresa / Cliente</label>
              <input className={inputClass} placeholder="Nombre de la empresa" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
            </div>
          </div>

          {workCenters.length > 0 && (
            <div>
              <label className={labelClass}>Tienda / centro</label>
              <select
                className={inputClass}
                value={form.workCenterId}
                onChange={(e) => setForm((f) => ({ ...f, workCenterId: e.target.value }))}
              >
                <option value="">Sin asignar (central)</option>
                {workCenters.map((wc) => (
                  <option key={wc.id} value={wc.id}>{wc.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Base imponible (€) *</label>
              <input type="number" step="0.01" className={inputClass} placeholder="0.00" value={form.amountBase} onChange={e => setForm(f => ({ ...f, amountBase: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>% IVA</label>
              <input type="number" className={inputClass} placeholder="21" value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Total</label>
              <div className={`px-3 py-2.5 border rounded-xl font-bold text-lg ${form.type === 'cobro'
                ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 text-red-700 dark:text-red-400'}`}>
                {total.toFixed(2)}€
              </div>
            </div>
          </div>

          {/* Category + Date + PayMethod */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Categoría *</label>
              <select className={inputClass} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {categories.map(c => (<option key={c.value} value={c.value}>{c.icon} {c.label}</option>))}
              </select>
              {suggestedCategory && (
                <button type="button"
                  onClick={() => { setForm(f => ({ ...f, category: suggestedCategory })); setSuggestedCategory(null); }}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
                  <Sparkles className="w-3 h-3" /> Sugerencia: {getCatLabel(suggestedCategory)}
                </button>
              )}
            </div>
            <div>
              <label className={labelClass}>Fecha</label>
              <input type="date" className={inputClass} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Método de pago</label>
              <select className={inputClass} value={form.payMethod} onChange={e => setForm(f => ({ ...f, payMethod: e.target.value }))}>
                {PAY_METHODS.map(m => (<option key={m.value} value={m.value}>{m.label}</option>))}
              </select>
            </div>
          </div>

          {/* Reference + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Referencia</label>
              <input className={inputClass} placeholder="Nº factura, referencia..." value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Notas</label>
              <input className={inputClass} placeholder="Notas adicionales..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm">
              Cancelar
            </button>
            <button type="submit" className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all text-white text-sm shadow-sm ${form.type === 'cobro'
              ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700'
              : 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700'}`}>
              {editItem ? 'Guardar cambios' : form.type === 'cobro' ? 'Registrar ingreso' : 'Registrar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Filters Panel ───────────────────────────────────────────────────────────

interface FilterState {
  dateFrom: string;
  dateTo: string;
  category: string;
  status: string;
  payMethod: string;
  amountMin: string;
  amountMax: string;
  reconciled: string;
  hasDocument: string;
}

const emptyFilters: FilterState = {
  dateFrom: '', dateTo: '', category: '', status: '', payMethod: '',
  amountMin: '', amountMax: '', reconciled: '', hasDocument: '',
};

function FiltersPanel({ filters, onChange, onReset, type }: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onReset: () => void;
  type: string;
}) {
  const cats = type === 'income' ? INCOME_CATEGORIES : type === 'expense' ? EXPENSE_CATEGORIES : [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
  const inputClass = 'w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all';
  const labelClass = 'block text-[10px] font-semibold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider';

  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5" /> Filtros avanzados
          {activeCount > 0 && <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-md text-[10px] font-bold">{activeCount}</span>}
        </span>
        {activeCount > 0 && (
          <button onClick={onReset} className="text-[10px] text-red-500 hover:text-red-600 font-semibold">Limpiar filtros</button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div><label className={labelClass}>Desde</label><input type="date" className={inputClass} value={filters.dateFrom} onChange={e => onChange({ ...filters, dateFrom: e.target.value })} /></div>
        <div><label className={labelClass}>Hasta</label><input type="date" className={inputClass} value={filters.dateTo} onChange={e => onChange({ ...filters, dateTo: e.target.value })} /></div>
        <div>
          <label className={labelClass}>Categoría</label>
          <select className={inputClass} value={filters.category} onChange={e => onChange({ ...filters, category: e.target.value })}>
            <option value="">Todas</option>
            {cats.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Estado</label>
          <select className={inputClass} value={filters.status} onChange={e => onChange({ ...filters, status: e.target.value })}>
            <option value="">Todos</option>
            <option value="paid">Pagado</option>
            <option value="pending">Pendiente</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Método pago</label>
          <select className={inputClass} value={filters.payMethod} onChange={e => onChange({ ...filters, payMethod: e.target.value })}>
            <option value="">Todos</option>
            {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div><label className={labelClass}>Importe mín</label><input type="number" step="0.01" className={inputClass} placeholder="0" value={filters.amountMin} onChange={e => onChange({ ...filters, amountMin: e.target.value })} /></div>
        <div><label className={labelClass}>Importe máx</label><input type="number" step="0.01" className={inputClass} placeholder="∞" value={filters.amountMax} onChange={e => onChange({ ...filters, amountMax: e.target.value })} /></div>
        <div>
          <label className={labelClass}>Conciliado</label>
          <select className={inputClass} value={filters.reconciled} onChange={e => onChange({ ...filters, reconciled: e.target.value })}>
            <option value="">Todos</option>
            <option value="yes">Sí</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Actions Bar ────────────────────────────────────────────────────────

function BulkActionsBar({ count, onMarkPaid, onDelete, onDeselect }: {
  count: number;
  onMarkPaid: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
      <span className="font-semibold text-blue-700 dark:text-blue-300">{count} seleccionado{count > 1 ? 's' : ''}</span>
      <div className="flex-1" />
      <button onClick={onMarkPaid} className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-semibold hover:bg-emerald-200 transition-colors flex items-center gap-1">
        <CheckCircle2 className="w-3.5 h-3.5" /> Marcar pagado
      </button>
      <button onClick={onDelete} className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-xs font-semibold hover:bg-red-200 transition-colors flex items-center gap-1">
        <Trash2 className="w-3.5 h-3.5" /> Eliminar
      </button>
      <button onClick={onDeselect} className="px-2 py-1.5 text-gray-500 hover:text-gray-700 text-xs font-medium">
        Deseleccionar
      </button>
    </div>
  );
}

// ─── Category chart (simple horizontal bars) ─────────────────────────────────

function CategoryChart({ movements, type }: { movements: FinanceMovementRecord[]; type: 'cobro' | 'pago' }) {
  const data = useMemo(() => {
    const map: Record<string, number> = {};
    movements.filter(m => m.type === type).forEach(m => {
      map[m.category] = (map[m.category] || 0) + m.totalAmount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [movements, type]);

  const max = data[0]?.[1] || 1;
  const color = type === 'cobro' ? 'bg-emerald-500' : 'bg-red-500';

  if (data.length === 0) return null;
  return (
    <div className="space-y-2">
      {data.map(([cat, amount]) => (
        <div key={cat} className="flex items-center gap-2">
          <span className="text-xs w-20 truncate text-gray-600 dark:text-gray-400 text-right">{getCatIcon(cat)} {getCatLabel(cat)}</span>
          <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${(amount / max) * 100}%` }} />
          </div>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-20 text-right">{fmt(amount)}€</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function IncomeExpensesPage() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const financeUserId = useFinanceUserId();
  const { businessId, businessName, isMultiBusiness } = useActiveBusinessScope();
  const navigate = useNavigate();
  const [movements, setMovements] = useState<FinanceMovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [ocrFinanceType, setOcrFinanceType] = useState<'income' | 'expense'>('expense');
  const [showIncomeMenu, setShowIncomeMenu] = useState(false);
  const [showExpenseMenu, setShowExpenseMenu] = useState(false);
  const [editingItem, setEditingItem] = useState<FinanceMovementRecord | null>(null);
  const [defaultType, setDefaultType] = useState<FinanceMovementDocType>('cobro');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [showFilters, setShowFilters] = useState(false);
  const [advFilters, setAdvFilters] = useState<FilterState>(emptyFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showChart, setShowChart] = useState(false);
  const [reconcSuggestions, setReconcSuggestions] = useState<ReconciliationSuggestion[]>([]);

  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');

  const businessWorkCenters = useMemo(
    () =>
      activeWorkCenters
        .filter((wc) => !businessId || !wc.businessId || wc.businessId === businessId)
        .map((wc) => ({ id: wc._id || wc.id, name: wc.name })),
    [activeWorkCenters, businessId],
  );

  const loadData = useCallback(async () => {
    if (!financeUserId) return;
    setLoading(true);
    try {
      const [movs, suggestions] = await Promise.all([
        listFinanceMovements(financeUserId, businessId || undefined),
        fetchReconciliationSuggestions(financeUserId).catch(() => []),
      ]);
      setMovements(movs);
      setReconcSuggestions(suggestions);
    } catch {
      toast.error('Error al cargar movimientos');
    } finally {
      setLoading(false);
    }
  }, [financeUserId, businessId]);

  useEffect(() => { loadData(); }, [loadData]);
  useModalClose(showCreate, () => { setShowCreate(false); setEditingItem(null); });

  const handleCreate = async (data: CreateFinanceMovementPayload) => {
    if (!financeUserId) return;
    try {
      if (editingItem) {
        const updated = await updateFinanceMovementInCouch(financeUserId, { ...editingItem, ...data, user_id: financeUserId });
        setMovements(prev => prev.map(m => m._id === updated._id ? updated : m));
        toast.success('Movimiento actualizado');
      } else {
        const created = await createFinanceMovementInCouch(financeUserId, {
          ...data,
          user_id: financeUserId,
          businessId: businessId || undefined,
          businessName: businessName || undefined,
        });
        setMovements(prev => [created, ...prev]);
        toast.success(data.type === 'cobro' ? 'Ingreso registrado' : 'Gasto registrado');
      }
      setShowCreate(false); setEditingItem(null);
    } catch { toast.error('Error al guardar el movimiento'); }
  };

  const handleDelete = async (m: FinanceMovementRecord) => {
    if (!financeUserId || !confirm(`¿Eliminar "${m.concept}"?`)) return;
    try {
      await deleteFinanceMovementFromCouch(financeUserId, m._id);
      setMovements(prev => prev.filter(x => x._id !== m._id));
      setSelected(prev => { const n = new Set(prev); n.delete(m._id); return n; });
      toast.success('Movimiento eliminado');
    } catch { toast.error('Error al eliminar'); }
  };

  const handleMarkPaid = async (m: FinanceMovementRecord) => {
    if (!financeUserId) return;
    try {
      const updated = await markMovementPaid(financeUserId, m._id);
      setMovements(prev => prev.map(x => x._id === updated._id ? updated : x));
      toast.success('Marcado como pagado');
    } catch { toast.error('Error al actualizar'); }
  };

  const handleBulkMarkPaid = async () => {
    if (!financeUserId) return;
    const pending = [...selected].map(id => movements.find(m => m._id === id)).filter((m): m is FinanceMovementRecord => !!m && m.status === 'pending');
    for (const m of pending) await handleMarkPaid(m);
    setSelected(new Set());
  };

  const handleBulkDelete = async () => {
    if (!financeUserId || !confirm(`¿Eliminar ${selected.size} movimiento(s)?`)) return;
    for (const id of selected) {
      const m = movements.find(x => x._id === id);
      if (m) await deleteFinanceMovementFromCouch(financeUserId, m._id);
    }
    setMovements(prev => prev.filter(m => !selected.has(m._id)));
    setSelected(new Set());
    toast.success('Movimientos eliminados');
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const filtered = useMemo(() => {
    let items = movements;
    if (filterWorkCenter !== 'all') items = items.filter(item => item.workCenterId === filterWorkCenter);
    if (filterMonth) items = items.filter(m => m.date.startsWith(filterMonth));
    if (activeTab === 'income') items = items.filter(m => m.type === 'cobro');
    else if (activeTab === 'expense') items = items.filter(m => m.type === 'pago');
    else if (activeTab === 'pending') items = items.filter(m => m.status === 'pending');
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(m =>
        m.concept.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) ||
        m.reference?.toLowerCase().includes(q) || m.companyName?.toLowerCase().includes(q),
      );
    }
    // Advanced filters
    if (advFilters.dateFrom) items = items.filter(m => m.date >= advFilters.dateFrom);
    if (advFilters.dateTo) items = items.filter(m => m.date <= advFilters.dateTo);
    if (advFilters.category) items = items.filter(m => m.category === advFilters.category);
    if (advFilters.status) items = items.filter(m => m.status === advFilters.status);
    if (advFilters.payMethod) items = items.filter(m => m.payMethod === advFilters.payMethod);
    if (advFilters.amountMin) items = items.filter(m => m.totalAmount >= Number(advFilters.amountMin));
    if (advFilters.amountMax) items = items.filter(m => m.totalAmount <= Number(advFilters.amountMax));
    if (advFilters.reconciled === 'yes') items = items.filter(m => m.reconciled);
    if (advFilters.reconciled === 'no') items = items.filter(m => !m.reconciled);
    return items;
  }, [movements, activeTab, search, filterMonth, filterWorkCenter, advFilters]);

  const kpis = useMemo(() => {
    const monthMvs = filterMonth ? movements.filter(m => m.date.startsWith(filterMonth)) : movements;
    const income = monthMvs.filter(m => m.type === 'cobro').reduce((s, m) => s + m.totalAmount, 0);
    const expenses = monthMvs.filter(m => m.type === 'pago').reduce((s, m) => s + m.totalAmount, 0);
    const pendingAmount = monthMvs.filter(m => m.status === 'pending').reduce((s, m) => s + m.totalAmount, 0);
    const pendingCount = monthMvs.filter(m => m.status === 'pending').length;
    return { income, expenses, balance: income - expenses, count: monthMvs.length, pendingAmount, pendingCount };
  }, [movements, filterMonth]);

  const exportCsv = () => {
    const header = 'Fecha,Tipo,Concepto,Categoría,Base,IVA %,IVA €,Total,Método,Estado,Referencia,Empresa\n';
    const rows = filtered.map(m =>
      `${m.date},${m.type === 'cobro' ? 'Ingreso' : 'Gasto'},"${m.concept}","${m.category}",${m.amountBase.toFixed(2)},${m.taxRate},${m.taxAmount.toFixed(2)},${m.totalAmount.toFixed(2)},"${m.payMethod}","${m.status === 'paid' ? 'Pagado' : 'Pendiente'}","${m.reference}","${m.companyName || ''}"`
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ingresos-gastos-${filterMonth || 'todos'}.csv`; a.click();
  };

  const reconMap = useMemo(() => {
    const map: Record<string, ReconciliationSuggestion> = {};
    for (const s of reconcSuggestions) map[s.movementId] = s;
    return map;
  }, [reconcSuggestions]);

  const tabsConfig = [
    { id: 'all', label: 'Todos', count: movements.length || undefined },
    { id: 'income', label: 'Ingresos' },
    { id: 'expense', label: 'Gastos' },
    { id: 'pending', label: 'Pendientes', count: kpis.pendingCount || undefined },
  ];

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest?.('[data-ie-menu]')) return;
      setShowIncomeMenu(false);
      setShowExpenseMenu(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  return (
    <Layout
      title="Ingresos y Gastos"
      subtitle={
        isMultiBusiness && businessName
          ? `Control detallado · ${businessName}`
          : 'Control detallado de todos tus movimientos financieros'
      }
    >
      <div className="space-y-5">
        {isMultiBusiness && businessName && (
          <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 px-4 py-3 dark:border-teal-800 dark:from-teal-950/40 dark:to-emerald-950/30">
            <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">
              Viendo movimientos de <span className="text-teal-700 dark:text-teal-300">{businessName}</span>
            </p>
            <p className="mt-0.5 text-xs text-teal-700/90 dark:text-teal-300">
              Al cambiar de empresa arriba se recargan ingresos y gastos de esa empresa.
            </p>
          </div>
        )}

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard
            icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
            value={`${fmt(kpis.income)}€`}
            label="Ingresos"
            gradient="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/30"
            iconBg="bg-emerald-100 dark:bg-emerald-900/50"
            textColor="text-emerald-800 dark:text-emerald-200"
            labelColor="text-emerald-600 dark:text-emerald-400"
          />
          <KpiCard
            icon={<TrendingDown className="w-5 h-5 text-red-600" />}
            value={`${fmt(kpis.expenses)}€`}
            label="Gastos"
            gradient="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/30"
            iconBg="bg-red-100 dark:bg-red-900/50"
            textColor="text-red-800 dark:text-red-200"
            labelColor="text-red-600 dark:text-red-400"
          />
          <KpiCard
            icon={<ArrowUpDown className="w-5 h-5 text-blue-600" />}
            value={`${fmt(kpis.balance)}€`}
            label="Balance"
            gradient={kpis.balance >= 0
              ? 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30'
              : 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30'}
            iconBg={kpis.balance >= 0 ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-amber-100 dark:bg-amber-900/50'}
            textColor={kpis.balance >= 0 ? 'text-blue-800 dark:text-blue-200' : 'text-amber-800 dark:text-amber-200'}
            labelColor={kpis.balance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}
          />
          <KpiCard
            icon={<Clock className="w-5 h-5 text-amber-600" />}
            value={`${fmt(kpis.pendingAmount)}€`}
            label={`${kpis.pendingCount} pendiente${kpis.pendingCount !== 1 ? 's' : ''}`}
            gradient="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/30"
            iconBg="bg-amber-100 dark:bg-amber-900/50"
            textColor="text-amber-800 dark:text-amber-200"
            labelColor="text-amber-600 dark:text-amber-400"
          />
          <KpiCard
            icon={<BarChart3 className="w-5 h-5 text-violet-600" />}
            value={String(kpis.count)}
            label="Movimientos"
            gradient="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/30"
            iconBg="bg-violet-100 dark:bg-violet-900/50"
            textColor="text-violet-800 dark:text-violet-200"
            labelColor="text-violet-600 dark:text-violet-400"
          />
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-56 transition-all"
                placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400 ml-2" />
              <input type="month" className="px-2 py-1.5 bg-transparent text-xs text-gray-700 dark:text-gray-300 outline-none" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
              {filterMonth && (
                <button onClick={() => setFilterMonth('')} className="text-[10px] text-blue-500 hover:text-blue-600 pr-2 font-semibold">Todo</button>
              )}
            </div>
            {hasWorkCenters && (
              <select
                className="px-2.5 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/20 outline-none"
                value={filterWorkCenter} onChange={e => setFilterWorkCenter(e.target.value)}
              >
                <option value="all">Todos los centros</option>
                {activeWorkCenters.map(wc => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
              </select>
            )}
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`px-3 py-2 border rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${showFilters
                ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> Filtros
              {Object.values(advFilters).filter(Boolean).length > 0 && (
                <span className="w-4 h-4 bg-blue-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                  {Object.values(advFilters).filter(Boolean).length}
                </span>
              )}
            </button>
            <button onClick={() => setShowChart(c => !c)}
              className={`px-3 py-2 border rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${showChart
                ? 'border-violet-300 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-700 text-violet-600 dark:text-violet-400'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Gráfico
            </button>
            <button onClick={exportCsv} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5 font-medium">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative" data-ie-menu>
              <button
                onClick={() => { setShowIncomeMenu(v => !v); setShowExpenseMenu(false); }}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl flex items-center gap-1.5 font-semibold text-sm transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" /> Ingreso <span className="ml-1 opacity-80">▾</span>
              </button>
              {showIncomeMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl overflow-hidden z-20">
                  <button
                    onClick={() => { setShowIncomeMenu(false); setDefaultType('cobro'); setEditingItem(null); setShowCreate(true); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-emerald-600" /> Manual
                  </button>
                  <button
                    onClick={() => { setShowIncomeMenu(false); setOcrFinanceType('income'); setShowOcr(true); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                  >
                    <ScanLine className="w-4 h-4 text-emerald-600" /> OCR (foto/PDF)
                  </button>
                </div>
              )}
            </div>

            <div className="relative" data-ie-menu>
              <button
                onClick={() => { setShowExpenseMenu(v => !v); setShowIncomeMenu(false); }}
                className="px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white rounded-xl flex items-center gap-1.5 font-semibold text-sm transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" /> Gasto <span className="ml-1 opacity-80">▾</span>
              </button>
              {showExpenseMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl overflow-hidden z-20">
                  <button
                    onClick={() => { setShowExpenseMenu(false); setDefaultType('pago'); setEditingItem(null); setShowCreate(true); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-rose-600" /> Manual
                  </button>
                  <button
                    onClick={() => { setShowExpenseMenu(false); setOcrFinanceType('expense'); setShowOcr(true); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                  >
                    <ScanLine className="w-4 h-4 text-rose-600" /> OCR (foto/PDF)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Filters panel ── */}
        {showFilters && (
          <FiltersPanel
            filters={advFilters}
            onChange={setAdvFilters}
            onReset={() => setAdvFilters(emptyFilters)}
            type={activeTab}
          />
        )}

        {/* ── Chart ── */}
        {showChart && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">Ingresos por categoría</h3>
              <CategoryChart movements={filtered} type="cobro" />
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <h3 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-3">Gastos por categoría</h3>
              <CategoryChart movements={filtered} type="pago" />
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />

        {/* ── Bulk actions ── */}
        <BulkActionsBar
          count={selected.size}
          onMarkPaid={handleBulkMarkPaid}
          onDelete={handleBulkDelete}
          onDeselect={() => setSelected(new Set())}
        />

        {/* ── Table / Cards ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full mr-3" />
            Cargando movimientos...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
            <DollarSign className="w-14 h-14 text-gray-200 dark:text-gray-700 mb-4" />
            <p className="font-semibold text-gray-500 dark:text-gray-400">Sin movimientos</p>
            <p className="text-sm mt-1">Registra tu primer ingreso o gasto</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1200px]">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="px-3 py-3 text-left w-10">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 dark:border-gray-600"
                          checked={filtered.length > 0 && filtered.every(m => selected.has(m._id))}
                          onChange={e => {
                            if (e.target.checked) setSelected(new Set(filtered.map(m => m._id)));
                            else setSelected(new Set());
                          }}
                        />
                      </th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Fecha</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Tipo</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Concepto</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Categoría</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Total</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Estado</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Método</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-10" title="Documento"><Paperclip className="w-3.5 h-3.5 mx-auto text-gray-400" /></th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-10" title="Conciliado"><Link2 className="w-3.5 h-3.5 mx-auto text-gray-400" /></th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {filtered.map(m => {
                      const hasDoc = (m.linkedDocuments?.length > 0) || !!m.attachmentUrl;
                      const reconSugg = reconMap[m._id];
                      return (
                        <tr key={m._id} className={`group transition-colors ${selected.has(m._id) ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/30'}`}>
                          <td className="px-3 py-3">
                            <input type="checkbox" className="rounded border-gray-300 dark:border-gray-600"
                              checked={selected.has(m._id)} onChange={() => toggleSelect(m._id)} />
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {new Date(m.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${m.type === 'cobro'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                              {m.type === 'cobro' ? '↑' : '↓'} {m.type === 'cobro' ? 'Ingreso' : 'Gasto'}
                            </span>
                          </td>
                          <td className="px-3 py-3 max-w-[250px]">
                            <div className="flex items-center gap-2">
                              <div className={`w-1 h-8 rounded-full flex-shrink-0 ${m.type === 'cobro' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                              <div className="min-w-0">
                                <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate flex items-center gap-1.5">
                                  {m.concept}
                                  <SourceBadge source={m.source} />
                                </div>
                                {m.companyName && <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{m.companyName}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[11px] font-medium rounded-lg">
                              {getCatIcon(m.category)} {getCatLabel(m.category)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className={`text-sm font-bold tabular-nums ${m.type === 'cobro' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {m.type === 'cobro' ? '+' : '-'}{fmt(m.totalAmount)}€
                            </span>
                            {m.taxRate > 0 && (
                              <div className="text-[10px] text-gray-400">{fmt(m.amountBase)}€ + {m.taxRate}%</div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <StatusBadge status={m.status} dueDate={m.dueDate} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 capitalize">{m.payMethod}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {hasDoc && <Paperclip className="w-3.5 h-3.5 text-blue-500 mx-auto" />}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {m.reconciled ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                            ) : reconSugg ? (
                              <span title={reconSugg.matchReason}>
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mx-auto" />
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {m.status === 'pending' && (
                                <button onClick={() => handleMarkPaid(m)} className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-lg transition-colors" title="Marcar como pagado">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                </button>
                              )}
                              <button onClick={() => { setEditingItem(m); setDefaultType(m.type); setShowCreate(true); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" title="Editar">
                                <Edit3 className="w-4 h-4 text-gray-500" />
                              </button>
                              <button onClick={() => handleDelete(m)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar">
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map(m => {
                const hasDoc = (m.linkedDocuments?.length > 0) || !!m.attachmentUrl;
                return (
                  <div key={m._id}
                    className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 transition-colors ${selected.has(m._id) ? 'ring-2 ring-blue-400' : ''}`}
                    onClick={() => toggleSelect(m._id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`w-1.5 h-12 rounded-full flex-shrink-0 mt-0.5 ${m.type === 'cobro' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate flex items-center gap-1.5">
                            {m.concept}
                            <SourceBadge source={m.source} />
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] text-gray-400">{new Date(m.date).toLocaleDateString('es-ES')}</span>
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 text-[10px] font-medium rounded">
                              {getCatIcon(m.category)} {getCatLabel(m.category)}
                            </span>
                            <StatusBadge status={m.status} dueDate={m.dueDate} />
                            {hasDoc && <Paperclip className="w-3 h-3 text-blue-500" />}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-bold ${m.type === 'cobro' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {m.type === 'cobro' ? '+' : '-'}{fmt(m.totalAmount)}€
                        </div>
                        <div className="flex items-center gap-1 mt-1.5 justify-end">
                          {m.status === 'pending' && (
                            <button onClick={e => { e.stopPropagation(); handleMarkPaid(m); }} className="p-1 hover:bg-emerald-100 rounded">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); setEditingItem(m); setDefaultType(m.type); setShowCreate(true); }} className="p-1 hover:bg-gray-100 rounded">
                            <Edit3 className="w-4 h-4 text-gray-400" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleDelete(m); }} className="p-1 hover:bg-red-100 rounded">
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Results count */}
            <div className="text-center text-xs text-gray-400 pt-2">
              {filtered.length} movimiento{filtered.length !== 1 ? 's' : ''} {filterMonth ? `en ${new Date(filterMonth + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}` : ''}
            </div>
          </>
        )}
      </div>

      <CreateMovementModal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setEditingItem(null); }}
        onCreate={handleCreate}
        editItem={editingItem}
        defaultType={defaultType}
        userId={user?.id}
        businessId={businessId}
        businessName={businessName || currentBusiness?.name}
        workCenters={businessWorkCenters}
      />

      <SAAS__OcrScanModal
        isOpen={showOcr}
        onClose={() => setShowOcr(false)}
        targetModule="finanzas"
        context={{ financeType: ocrFinanceType }}
        autoOpenCamera={false}
        onDocumentCreated={async () => { setShowOcr(false); await loadData(); toast.success('Documento procesado por OCR'); }}
      />
    </Layout>
  );
}
