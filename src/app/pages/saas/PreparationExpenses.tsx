import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import type { PreparationExpense, PreparationExpenseType, PreparationExpenseStatus, Vehicle } from '../../context/AppContext';
import { listVehiclesRequest } from '../../lib/vehicleApi';
import {
  listPreparationExpenses,
  getPreparationExpenseSummary,
  createPreparationExpense,
  updatePreparationExpense,
  validatePreparationExpense,
  deletePreparationExpense,
  registerExpensePayment,
  type ExpenseSummary,
} from '../../lib/preparationExpenseApi';
import {
  Plus,
  Search,
  X,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  DollarSign,
  Clock,
  Car,
  TrendingUp,
  Wrench,
  Sparkles,
  Paintbrush,
  Truck,
  FileText,
  Fuel,
  ClipboardCheck,
  MoreHorizontal,
  AlertTriangle,
  Filter,
  ChevronDown,
  ChevronUp,
  Eye,
  Receipt,
  Banknote,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

// ─── Constants ───────────────────────────────────────────────────────────────

const EXPENSE_TYPE_CONFIG: Record<PreparationExpenseType, { label: string; icon: typeof Wrench; color: string; bg: string }> = {
  taller:      { label: 'Taller',      icon: Wrench,         color: 'text-indigo-700 dark:text-indigo-400',  bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  limpieza:    { label: 'Limpieza',    icon: Sparkles,       color: 'text-cyan-700 dark:text-cyan-400',      bg: 'bg-cyan-100 dark:bg-cyan-900/40' },
  pintura:     { label: 'Pintura',     icon: Paintbrush,     color: 'text-purple-700 dark:text-purple-400',  bg: 'bg-purple-100 dark:bg-purple-900/40' },
  transporte:  { label: 'Transporte',  icon: Truck,          color: 'text-amber-700 dark:text-amber-400',    bg: 'bg-amber-100 dark:bg-amber-900/40' },
  gestoria:    { label: 'Gestoría',    icon: FileText,       color: 'text-teal-700 dark:text-teal-400',      bg: 'bg-teal-100 dark:bg-teal-900/40' },
  combustible: { label: 'Combustible', icon: Fuel,           color: 'text-orange-700 dark:text-orange-400',  bg: 'bg-orange-100 dark:bg-orange-900/40' },
  itv:         { label: 'ITV',         icon: ClipboardCheck, color: 'text-blue-700 dark:text-blue-400',      bg: 'bg-blue-100 dark:bg-blue-900/40' },
  otro:        { label: 'Otro',        icon: MoreHorizontal, color: 'text-gray-600 dark:text-gray-400',      bg: 'bg-gray-100 dark:bg-gray-700' },
};

const STATUS_CONFIG: Record<PreparationExpenseStatus, { label: string; color: string; bg: string }> = {
  pendiente:  { label: 'Pendiente',  color: 'text-yellow-800 dark:text-yellow-300', bg: 'bg-yellow-100 dark:bg-yellow-900/40' },
  revisado:   { label: 'Revisado',   color: 'text-blue-800 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/40' },
  validado:   { label: 'Validado',   color: 'text-green-800 dark:text-green-300',   bg: 'bg-green-100 dark:bg-green-900/40' },
  rechazado:  { label: 'Rechazado',  color: 'text-red-800 dark:text-red-300',       bg: 'bg-red-100 dark:bg-red-900/40' },
};

const ALL_EXPENSE_TYPES: PreparationExpenseType[] = ['taller', 'limpieza', 'pintura', 'transporte', 'gestoria', 'combustible', 'itv', 'otro'];
const ALL_STATUSES: PreparationExpenseStatus[] = ['pendiente', 'revisado', 'validado', 'rechazado'];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

// ─── Create / Edit Modal ─────────────────────────────────────────────────────

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<PreparationExpense>) => Promise<void>;
  editItem?: PreparationExpense | null;
  vehicles: Vehicle[];
}

function ExpenseModal({ isOpen, onClose, onSave, editItem, vehicles }: ExpenseModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    vehicleId: '', expenseType: 'otro' as PreparationExpenseType,
    amount: '', date: new Date().toISOString().slice(0, 10),
    supplierName: '', invoiceNumber: '', notes: '',
  });
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  useEffect(() => {
    if (editItem) {
      setForm({
        vehicleId: editItem.vehicleId, expenseType: editItem.expenseType,
        amount: String(editItem.amount), date: editItem.date || new Date().toISOString().slice(0, 10),
        supplierName: editItem.supplierName || '', invoiceNumber: editItem.invoiceNumber || '',
        notes: editItem.notes || '',
      });
      setVehicleSearch(`${editItem.vehiclePlate} - ${editItem.vehicleLabel}`);
    } else {
      setForm({ vehicleId: '', expenseType: 'otro', amount: '', date: new Date().toISOString().slice(0, 10), supplierName: '', invoiceNumber: '', notes: '' });
      setVehicleSearch('');
    }
  }, [editItem, isOpen]);
  useModalClose(isOpen, onClose);

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.toLowerCase();
    return vehicles.filter(v =>
      v.registrationPlate.toLowerCase().includes(q) ||
      v.brand.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q),
    ).slice(0, 10);
  }, [vehicles, vehicleSearch]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicleId) { toast.error('Selecciona un vehículo'); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('El importe debe ser mayor que 0'); return; }
    if (!form.date) { toast.error('La fecha es obligatoria'); return; }
    setSubmitting(true);
    try {
      await onSave({ ...form, amount: Number(form.amount) } as unknown as Partial<PreparationExpense>);
    } finally {
      setSubmitting(false);
    }
  };

  const selectVehicle = (v: Vehicle) => {
    setForm(f => ({ ...f, vehicleId: v.id }));
    setVehicleSearch(`${v.registrationPlate} - ${v.brand} ${v.model}`);
    setShowVehicleDropdown(false);
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
  const labelClass = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editItem ? 'Editar gasto' : 'Nuevo gasto de preparación'}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{editItem ? 'Modifica los datos del gasto' : 'Registra un nuevo gasto asociado a un vehículo'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Vehicle selector */}
          <div className="relative">
            <label className={labelClass}>Vehículo *</label>
            <input
              className={inputClass}
              placeholder="Buscar por matrícula, marca o modelo…"
              value={vehicleSearch}
              onChange={e => { setVehicleSearch(e.target.value); setShowVehicleDropdown(true); setForm(f => ({ ...f, vehicleId: '' })); }}
              onFocus={() => setShowVehicleDropdown(true)}
            />
            {showVehicleDropdown && filteredVehicles.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {filteredVehicles.map(v => (
                  <button key={v.id} type="button" onClick={() => selectVehicle(v)} className="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-sm flex items-center gap-3">
                    <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{v.registrationPlate}</span>
                    <span className="text-gray-500 dark:text-gray-400">{v.brand} {v.model} ({v.year})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Expense type chips */}
          <div>
            <label className={labelClass}>Tipo de gasto *</label>
            <div className="flex flex-wrap gap-2">
              {ALL_EXPENSE_TYPES.map(t => {
                const cfg = EXPENSE_TYPE_CONFIG[t];
                const Icon = cfg.icon;
                const selected = form.expenseType === t;
                return (
                  <button key={t} type="button" onClick={() => setForm(f => ({ ...f, expenseType: t }))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${selected ? `${cfg.bg} ${cfg.color} border-current` : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                    <Icon className="w-3.5 h-3.5" />{cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Importe (€) *</label>
              <input type="number" step="0.01" min="0" className={`${inputClass} font-semibold`} placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Fecha *</label>
              <input type="date" className={inputClass} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Proveedor</label>
              <input className={inputClass} placeholder="Nombre del proveedor" value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Nº Factura</label>
              <input className={`${inputClass} font-mono`} placeholder="Ej: FA-2025-001" value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Observaciones</label>
            <textarea rows={2} className={`${inputClass} resize-none`} placeholder="Notas adicionales sobre este gasto…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
            <button type="submit" disabled={submitting} className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait">
              {submitting ? 'Guardando…' : editItem ? 'Guardar cambios' : 'Registrar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Validate Modal ──────────────────────────────────────────────────────────

function ValidateModal({ isOpen, onClose, expense, onValidate }: {
  isOpen: boolean; onClose: () => void; expense: PreparationExpense | null;
  onValidate: (status: 'validado' | 'rechazado', reason?: string, registerPay?: boolean) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [registerPay, setRegisterPay] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useModalClose(isOpen, onClose);

  useEffect(() => { setReason(''); setRegisterPay(false); }, [isOpen]);
  if (!isOpen || !expense) return null;

  const cfg = EXPENSE_TYPE_CONFIG[expense.expenseType] || EXPENSE_TYPE_CONFIG.otro;
  const Icon = cfg.icon;

  const handle = async (s: 'validado' | 'rechazado') => {
    setSubmitting(true);
    try { await onValidate(s, reason, s === 'validado' && registerPay); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Validar gasto</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className={`flex items-center gap-3 p-4 rounded-xl ${cfg.bg}`}>
            <Icon className={`w-5 h-5 ${cfg.color}`} />
            <div>
              <p className={`font-semibold ${cfg.color}`}>{cfg.label} — {formatCurrency(expense.amount)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{expense.vehiclePlate} · {expense.vehicleLabel} · {expense.date}</p>
            </div>
          </div>
          {expense.supplierName && <p className="text-sm text-gray-600 dark:text-gray-400">Proveedor: <strong>{expense.supplierName}</strong></p>}
          {expense.notes && <p className="text-sm text-gray-500 dark:text-gray-400 italic">"{expense.notes}"</p>}

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Motivo (opcional)</label>
            <textarea rows={2} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none"
              placeholder="Motivo de aprobación o rechazo…" value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={registerPay} onChange={e => setRegisterPay(e.target.checked)} className="rounded border-gray-300 dark:border-gray-600" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Registrar como pago en Finanzas</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button disabled={submitting} onClick={() => handle('rechazado')} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl font-semibold hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-60">
              <XCircle className="w-4 h-4" />Rechazar
            </button>
            <button disabled={submitting} onClick={() => handle('validado')} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-60">
              <CheckCircle2 className="w-4 h-4" />Validar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function PreparationExpenses() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [expenses, setExpenses] = useState<PreparationExpense[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<PreparationExpense | null>(null);
  const [validatingExpense, setValidatingExpense] = useState<PreparationExpense | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showVehicleSummary, setShowVehicleSummary] = useState(true);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<PreparationExpenseType | ''>('');
  const [filterStatus, setFilterStatus] = useState<PreparationExpenseStatus | ''>(searchParams.get('status') as PreparationExpenseStatus || '');
  const [filterVehicle, setFilterVehicle] = useState(searchParams.get('vehicleId') || '');
  const [showFilters, setShowFilters] = useState(false);
    const accountRole = (user as Record<string, unknown>)?.role as string || '';
  const userIsManager = ['Admin', 'Gerente'].includes(accountRole);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filterType) params.expenseType = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterVehicle) params.vehicleId = filterVehicle;

      const [expRes, sumRes, vehRes] = await Promise.all([
        listPreparationExpenses(user.id, Object.keys(params).length > 0 ? params : undefined),
        getPreparationExpenseSummary(user.id),
        listVehiclesRequest(user.id),
      ]);
      setExpenses(expRes.expenses || []);
      setSummary(sumRes.summary || null);
      setVehicles(vehRes.vehicles || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [user?.id, filterType, filterStatus, filterVehicle]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Filtered list ─────────────────────────────────────────────────────────

  const filteredExpenses = useMemo(() => {
    const q = search.toLowerCase();
    return expenses.filter(e => {
      if (q && !(
        e.vehiclePlate.toLowerCase().includes(q) ||
        e.vehicleLabel.toLowerCase().includes(q) ||
        (e.supplierName || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q) ||
        (e.invoiceNumber || '').toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [expenses, search]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = async (data: Partial<PreparationExpense>) => {
    if (!user?.id) return;
    await createPreparationExpense(user.id, data);
    toast.success('Gasto registrado correctamente');
    setShowCreateModal(false);
    fetchData();
  };

  const handleUpdate = async (data: Partial<PreparationExpense>) => {
    if (!user?.id || !editingExpense) return;
    await updatePreparationExpense(user.id, editingExpense.id, data);
    toast.success('Gasto actualizado');
    setEditingExpense(null);
    fetchData();
  };

  const handleValidate = async (status: 'validado' | 'rechazado', reason?: string, registerPay?: boolean) => {
    if (!user?.id || !validatingExpense) return;
    await validatePreparationExpense(user.id, validatingExpense.id, status, reason);
    if (registerPay && status === 'validado') {
      try { await registerExpensePayment(user.id, validatingExpense.id); toast.success('Pago registrado en Finanzas'); }
      catch { toast.error('Gasto validado, pero error al registrar pago'); }
    }
    toast.success(status === 'validado' ? 'Gasto validado' : 'Gasto rechazado');
    setValidatingExpense(null);
    fetchData();
  };

  const handleDelete = async (expense: PreparationExpense) => {
    if (!user?.id) return;
    if (!confirm(`¿Eliminar gasto de ${EXPENSE_TYPE_CONFIG[expense.expenseType]?.label} (${formatCurrency(expense.amount)}) para ${expense.vehiclePlate}?`)) return;
    try {
      await deletePreparationExpense(user.id, expense.id);
      toast.success('Gasto eliminado');
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout title="Gastos de preparación">
      <div className="max-w-[1400px] mx-auto space-y-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-white/20 rounded-xl"><DollarSign className="w-5 h-5" /></div>
            </div>
            <p className="text-2xl font-bold">{summary ? formatCurrency(summary.grandTotal) : '—'}</p>
            <p className="text-sm text-blue-100 mt-1">Total gastado</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/40 rounded-xl"><Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" /></div>
              {(summary?.pendingReview || 0) > 0 && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500" /></span>}
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary?.pendingReview ?? '—'}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pendientes de revisar</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl"><Car className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /></div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary?.vehiclesWithExpenses ?? '—'}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Vehículos con gastos</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-xl"><TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" /></div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary?.totalExpenses ?? '—'}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total registros</p>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none"
                placeholder="Buscar por matrícula, proveedor, notas…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button onClick={() => setShowFilters(f => !f)} className={`flex items-center gap-1.5 px-3 py-2.5 border-2 rounded-xl text-sm font-medium transition-colors ${showFilters ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}`}>
              <Filter className="w-4 h-4" />Filtros
            </button>
          </div>
          <AddButtonDropdown
                label="Nuevo gasto"
                onQuickAdd={() => { setEditingExpense(null); setShowCreateModal(true); }}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de gasto"
              />
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Tipo</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value as PreparationExpenseType | '')} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none">
                <option value="">Todos</option>
                {ALL_EXPENSE_TYPES.map(t => <option key={t} value={t}>{EXPENSE_TYPE_CONFIG[t].label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Estado</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as PreparationExpenseStatus | '')} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none">
                <option value="">Todos</option>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Vehículo</label>
              <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none">
                <option value="">Todos</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.registrationPlate} - {v.brand} {v.model}</option>)}
              </select>
            </div>
            <button onClick={() => { setFilterType(''); setFilterStatus(''); setFilterVehicle(''); }} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Limpiar</button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Main table */}
          <div className="xl:col-span-3">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-gray-100 rounded-full animate-spin" />
                </div>
              ) : filteredExpenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-2xl mb-4"><Receipt className="w-8 h-8 text-gray-400" /></div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sin gastos de preparación</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">Registra el primer gasto para empezar a controlar la inversión en tus vehículos.</p>
                  <button onClick={() => setShowCreateModal(true)} className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-semibold text-sm hover:bg-black dark:hover:bg-white transition-colors">
                    <Plus className="w-4 h-4" />Nuevo gasto
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Vehículo</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Tipo</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Importe</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Fecha</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide hidden lg:table-cell">Proveedor</th>
                        <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide hidden md:table-cell">Doc</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">Estado</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {filteredExpenses.map(exp => {
                        const typeCfg = EXPENSE_TYPE_CONFIG[exp.expenseType] || EXPENSE_TYPE_CONFIG.otro;
                        const statusCfg = STATUS_CONFIG[exp.status] || STATUS_CONFIG.pendiente;
                        const TypeIcon = typeCfg.icon;
                        const isExpanded = expandedRow === exp.id;

                        return (
                          <tr key={exp.id} className="group">
                            <td className="px-4 py-3">
                              <button onClick={() => setExpandedRow(isExpanded ? null : exp.id)} className="text-left">
                                <p className="font-mono font-bold text-gray-900 dark:text-gray-100 text-xs">{exp.vehiclePlate}</p>
                                <p className="text-gray-500 dark:text-gray-400 text-xs">{exp.vehicleLabel}</p>
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${typeCfg.bg} ${typeCfg.color}`}>
                                <TypeIcon className="w-3 h-3" />{typeCfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(exp.amount)}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{exp.date}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs hidden lg:table-cell">{exp.supplierName || '—'}</td>
                            <td className="px-4 py-3 text-center hidden md:table-cell">
                              {exp.documentId ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : <AlertTriangle className="w-4 h-4 text-yellow-500 mx-auto" />}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setExpandedRow(isExpanded ? null : exp.id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title="Ver detalle"><Eye className="w-3.5 h-3.5 text-gray-400" /></button>
                                {(userIsManager || (exp.status === 'pendiente' && exp.createdBy === user?.id)) && (
                                  <button onClick={() => setEditingExpense(exp)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title="Editar"><Edit3 className="w-3.5 h-3.5 text-gray-400" /></button>
                                )}
                                {userIsManager && exp.status === 'pendiente' && (
                                  <button onClick={() => setValidatingExpense(exp)} className="p-1.5 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg" title="Validar"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /></button>
                                )}
                                {userIsManager && (
                                  <button onClick={() => handleDelete(exp)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg" title="Eliminar"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Vehicle summary sidebar */}
          <div className="xl:col-span-1">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
              <button onClick={() => setShowVehicleSummary(s => !s)} className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2"><Car className="w-4 h-4 text-indigo-600" />Resumen por vehículo</h3>
                {showVehicleSummary ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {showVehicleSummary && summary?.totalByVehicle && (
                <div className="divide-y divide-gray-50 dark:divide-gray-800 max-h-[600px] overflow-y-auto">
                  {summary.totalByVehicle.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Sin datos</p>
                  ) : (
                    summary.totalByVehicle.map(v => {
                      const vehicle = vehicles.find(vh => vh.id === v.vehicleId);
                      const purchasePrice = vehicle?.purchasePrice || 0;
                      const costPct = purchasePrice > 0 ? (v.total / purchasePrice) * 100 : 0;
                      const isHigh = costPct > 30;
                      return (
                        <button key={v.vehicleId} onClick={() => { setFilterVehicle(v.vehicleId); setShowFilters(true); }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{v.plate}</span>
                            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(v.total)}</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{v.label} · {v.count} gastos</p>
                          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${isHigh ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(costPct, 100)}%` }} />
                          </div>
                          {purchasePrice > 0 && (
                            <p className={`text-xs mt-1 ${isHigh ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>
                              {costPct.toFixed(1)}% del precio de compra
                            </p>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* By type summary */}
            {summary?.totalByType && summary.totalByType.length > 0 && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm mt-4">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2"><Banknote className="w-4 h-4 text-green-600" />Por tipo de gasto</h3>
                </div>
                <div className="p-4 space-y-2">
                  {summary.totalByType.map(t => {
                    const cfg = EXPENSE_TYPE_CONFIG[t.expenseType as PreparationExpenseType] || EXPENSE_TYPE_CONFIG.otro;
                    const Icon = cfg.icon;
                    const pct = summary.grandTotal > 0 ? (t.total / summary.grandTotal) * 100 : 0;
                    return (
                      <div key={t.expenseType} className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${cfg.bg}`}><Icon className={`w-3.5 h-3.5 ${cfg.color}`} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{cfg.label}</span>
                            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(t.total)}</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1 mt-1">
                            <div className={`h-1 rounded-full ${cfg.bg.replace('bg-', 'bg-').replace('/40', '')}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <ExpenseModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSave={handleCreate} vehicles={vehicles} />
      <ExpenseModal isOpen={!!editingExpense} onClose={() => setEditingExpense(null)} onSave={handleUpdate} editItem={editingExpense} vehicles={vehicles} />
      <ValidateModal isOpen={!!validatingExpense} onClose={() => setValidatingExpense(null)} expense={validatingExpense} onValidate={handleValidate} />
    </Layout>
  );
}
