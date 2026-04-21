import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  AlertCircle,
  Banknote,
  Check,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  Download,
  FileText,
  Filter,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import type { AuthUser } from '../../lib/authApi';
import {
  createStaffExpenseRequest,
  deleteStaffExpenseRequest,
  listStaffExpensesRequest,
  STAFF_EXPENSE_CATEGORY_LABELS,
  STAFF_EXPENSE_STATUS_LABELS,
  updateStaffExpenseRequest,
  type StaffExpense,
  type StaffExpenseCategory,
  type StaffExpenseStatus,
} from '../../lib/staffExpensesApi';

function formatCurrency(amount: number): string {
  return amount.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const CATEGORY_COLORS: Record<StaffExpenseCategory, string> = {
  dietas: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700',
  transporte: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
  material: 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700',
  formacion: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700',
  anticipo: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  bonus: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  otros: 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600',
};

const STATUS_COLORS: Record<StaffExpenseStatus, string> = {
  pendiente: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  aprobado: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  rechazado: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  pagado: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
};

// ─── Create Expense Modal ───────────────────────────────────────────────────

interface CreateExpenseModalProps {
  members: AuthUser[];
  currentUser: AuthUser;
  onClose: () => void;
  onCreated: (expense: StaffExpense) => void;
}

function CreateExpenseModal({ members, currentUser, onClose, onCreated }: CreateExpenseModalProps) {
  useModalClose(true, onClose);
  const [workerId, setWorkerId] = useState('');
  const [category, setCategory] = useState<StaffExpenseCategory>('dietas');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeMembers = members.filter((m) => m.status !== 'inactive');

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!workerId) { setError('Selecciona un trabajador.'); return; }
    if (!concept.trim()) { setError('Indica un concepto.'); return; }
    if (!amount || Number(amount) <= 0) { setError('Indica un importe válido.'); return; }

    const worker = members.find((m) => m.user_id === workerId);

    setIsSubmitting(true);
    try {
      let fileData: string | undefined;
      let mimeType: string | undefined;
      let fileName: string | undefined;
      let size: number | undefined;

      if (file) {
        const reader = new FileReader();
        fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        mimeType = file.type;
        fileName = file.name;
        size = file.size;
      }

      const expense = await createStaffExpenseRequest({
        worker_id: workerId,
        worker_name: worker?.fullName || workerId,
        category,
        status: 'pendiente',
        concept: concept.trim(),
        amount: Number(amount),
        date,
        notes: notes.trim() || undefined,
        fileData,
        mimeType,
        fileName,
        size,
        createdBy: currentUser.user_id,
        createdByName: currentUser.fullName,
      });
      onCreated(expense);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el gasto.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Registrar gasto</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Trabajador <span className="text-red-500">*</span>
            </label>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            >
              <option value="">Seleccionar trabajador...</option>
              {activeMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.fullName}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as StaffExpenseCategory)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
              >
                {(Object.entries(STAFF_EXPENSE_CATEGORY_LABELS) as [StaffExpenseCategory, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Fecha <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Concepto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Ej. Dieta comida cliente Madrid"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Importe (€) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Notas
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Notas adicionales..."
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all resize-none"
            />
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-all ${
              isDragging
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                : file
                  ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex flex-col items-center gap-1">
                <FileText className="w-5 h-5 text-emerald-500" />
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{file.name}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Justificante (opcional) — arrastra o haz clic
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-gray-100 px-5 py-2 text-sm font-semibold text-white dark:text-gray-900 hover:bg-black dark:hover:bg-white transition-colors disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 dark:border-gray-900/30 border-t-white dark:border-t-gray-900 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Registrar gasto
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirmation ────────────────────────────────────────────────────

interface DeleteConfirmProps {
  expense: StaffExpense;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

function DeleteConfirm({ expense, onCancel, onConfirm, isDeleting }: DeleteConfirmProps) {
  useModalClose(true, onCancel);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-900/30">
            <Trash2 className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Eliminar gasto</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Esta acción no se puede deshacer</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          ¿Seguro que quieres eliminar <span className="font-semibold text-gray-900 dark:text-gray-100">"{expense.concept}"</span> ({formatCurrency(expense.amount)})?
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60"
          >
            {isDeleting ? (
              <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface StaffExpensesTabProps {
  members: AuthUser[];
  currentUser: AuthUser;
  isAdmin: boolean;
}

export function StaffExpensesTab({ members, currentUser, isAdmin }: StaffExpensesTabProps) {
  const [expenses, setExpenses] = useState<StaffExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<StaffExpense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [filterWorker, setFilterWorker] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<StaffExpenseCategory | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<StaffExpenseStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setIsLoading(true);
    try {
      const workerFilter = !isAdmin ? currentUser.user_id : undefined;
      const docs = await listStaffExpensesRequest(workerFilter);
      setExpenses(docs);
    } catch {
      // empty state on error
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, currentUser.user_id]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  function handleCreated(expense: StaffExpense) {
    setExpenses((prev) => [expense, ...prev]);
    setMessage(`Gasto "${expense.concept}" registrado correctamente.`);
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleDelete() {
    if (!expenseToDelete) return;
    setIsDeleting(true);
    try {
      await deleteStaffExpenseRequest(expenseToDelete);
      setExpenses((prev) => prev.filter((d) => d._id !== expenseToDelete._id));
      setMessage(`Gasto "${expenseToDelete.concept}" eliminado.`);
      setTimeout(() => setMessage(null), 4000);
      setExpenseToDelete(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo eliminar.');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleStatusChange(expense: StaffExpense, newStatus: StaffExpenseStatus) {
    try {
      const updated = await updateStaffExpenseRequest({
        ...expense,
        status: newStatus,
        ...(newStatus === 'aprobado' || newStatus === 'pagado'
          ? { approvedBy: currentUser.user_id, approvedByName: currentUser.fullName, approvedAt: new Date().toISOString() }
          : {}),
      });
      setExpenses((prev) => prev.map((e) => (e._id === updated._id ? updated : e)));
      setMessage(`Gasto "${expense.concept}" → ${STAFF_EXPENSE_STATUS_LABELS[newStatus]}`);
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
      setTimeout(() => setMessage(null), 4000);
    }
  }

  function handleDownload(expense: StaffExpense) {
    if (!expense.fileData) return;
    const link = window.document.createElement('a');
    link.href = expense.fileData;
    link.download = expense.fileName || expense.concept;
    link.click();
  }

  const filteredExpenses = expenses.filter((exp) => {
    if (filterWorker !== 'all' && exp.worker_id !== filterWorker) return false;
    if (filterCategory !== 'all' && exp.category !== filterCategory) return false;
    if (filterStatus !== 'all' && exp.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !exp.concept.toLowerCase().includes(q) &&
        !exp.worker_name.toLowerCase().includes(q) &&
        !(exp.notes || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const totalFiltered = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingCount = expenses.filter((e) => e.status === 'pendiente').length;

  const workerOptions = members.filter((m) =>
    expenses.some((d) => d.worker_id === m.user_id),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-900/30">
            <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-bold text-gray-900 dark:text-gray-100">Gastos del personal</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {expenses.length} gasto{expenses.length !== 1 ? 's' : ''} registrado{expenses.length !== 1 ? 's' : ''}
              {pendingCount > 0 && (
                <span className="ml-2 text-amber-600 dark:text-amber-400 font-semibold">
                  · {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-semibold text-white dark:text-gray-900 hover:bg-black dark:hover:bg-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Registrar gasto
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total gastos</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Pendientes</p>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
            {formatCurrency(expenses.filter((e) => e.status === 'pendiente').reduce((s, e) => s + e.amount, 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Aprobados</p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(expenses.filter((e) => e.status === 'aprobado').reduce((s, e) => s + e.amount, 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Pagados</p>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {formatCurrency(expenses.filter((e) => e.status === 'pagado').reduce((s, e) => s + e.amount, 0))}
          </p>
        </div>
      </div>

      {message && (
        <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar gastos..."
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
          />
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
            <select
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            >
              <option value="all">Todos los trabajadores</option>
              {workerOptions.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.fullName}</option>
              ))}
            </select>
          </div>
        )}

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as StaffExpenseCategory | 'all')}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
        >
          <option value="all">Todas las categorías</option>
          {(Object.entries(STAFF_EXPENSE_CATEGORY_LABELS) as [StaffExpenseCategory, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as StaffExpenseStatus | 'all')}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
        >
          <option value="all">Todos los estados</option>
          {(Object.entries(STAFF_EXPENSE_STATUS_LABELS) as [StaffExpenseStatus, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {(filterWorker !== 'all' || filterCategory !== 'all' || filterStatus !== 'all' || searchQuery) && (
          <p className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            {filteredExpenses.length} resultado{filteredExpenses.length !== 1 ? 's' : ''} · {formatCurrency(totalFiltered)}
          </p>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {isLoading ? (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="h-9 w-9 rounded-xl bg-gray-100 dark:bg-gray-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-48 rounded bg-gray-100 dark:bg-gray-700" />
                  <div className="h-3 w-32 rounded bg-gray-50 dark:bg-gray-800" />
                </div>
                <div className="h-6 w-20 rounded-full bg-gray-100 dark:bg-gray-700" />
              </div>
            ))}
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-700/50">
              <Banknote className="w-7 h-7 text-gray-300 dark:text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                {expenses.length === 0 ? 'Aún no hay gastos registrados' : 'No se encontraron resultados'}
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {expenses.length === 0
                  ? isAdmin ? 'Registra el primer gasto usando el botón "Registrar gasto".' : 'No tienes gastos asignados.'
                  : 'Prueba ajustando los filtros o la búsqueda.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-800/80">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Concepto</th>
                  {isAdmin && <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Trabajador</th>}
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Categoría</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Fecha</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">Importe</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Estado</th>
                  <th className="w-28 px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {filteredExpenses.map((exp) => (
                  <tr key={exp._id} className="group hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/30">
                          <DollarSign className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{exp.concept}</p>
                          {exp.notes && <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[200px]">{exp.notes}</p>}
                        </div>
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{exp.worker_name}</td>
                    )}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[exp.category]}`}>
                        {STAFF_EXPENSE_CATEGORY_LABELS[exp.category]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(exp.date)}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-900 dark:text-gray-100 text-right">
                      {formatCurrency(exp.amount)}
                    </td>
                    <td className="px-5 py-4">
                      {isAdmin ? (
                        <select
                          value={exp.status}
                          onChange={(e) => handleStatusChange(exp, e.target.value as StaffExpenseStatus)}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold border-0 outline-none cursor-pointer ${STATUS_COLORS[exp.status]}`}
                        >
                          {(Object.entries(STAFF_EXPENSE_STATUS_LABELS) as [StaffExpenseStatus, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[exp.status]}`}>
                          {STAFF_EXPENSE_STATUS_LABELS[exp.status]}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {exp.fileData && (
                          <button
                            type="button"
                            onClick={() => handleDownload(exp)}
                            title="Descargar justificante"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setExpenseToDelete(exp)}
                            title="Eliminar"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800 md:hidden">
              {filteredExpenses.map((exp) => (
                <div key={exp._id} className="px-4 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/30">
                        <DollarSign className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{exp.concept}</p>
                        {isAdmin && <p className="text-xs text-gray-500 dark:text-gray-400">{exp.worker_name}</p>}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatCurrency(exp.amount)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_COLORS[exp.category]}`}>
                        {STAFF_EXPENSE_CATEGORY_LABELS[exp.category]}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[exp.status]}`}>
                        {STAFF_EXPENSE_STATUS_LABELS[exp.status]}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(exp.date)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {exp.fileData && (
                        <button
                          type="button"
                          onClick={() => handleDownload(exp)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setExpenseToDelete(exp)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateExpenseModal
          members={members}
          currentUser={currentUser}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {expenseToDelete && (
        <DeleteConfirm
          expense={expenseToDelete}
          onCancel={() => setExpenseToDelete(null)}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
