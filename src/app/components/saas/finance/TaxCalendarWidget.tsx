import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  FileCheck,
  Plus,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  listTaxObligations,
  saveTaxObligation,
  deleteTaxObligation,
  markFiled,
  markPaid,
  generateCalendarFromPresets,
} from '../../../lib/taxCalendarApi';
import type {
  TaxObligation,
  TaxObligationStatus,
  TaxModel,
} from '../../../lib/taxCalendarTypes';
import {
  TAX_MODEL_NAMES,
  daysUntilDue,
  getUpcomingDeadlines,
  getOverdueObligations,
} from '../../../lib/taxCalendarTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_CONFIG: Record<TaxObligationStatus, { label: string; classes: string }> = {
  pending: {
    label: 'Pendiente',
    classes: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  },
  in_progress: {
    label: 'En curso',
    classes: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
  },
  filed: {
    label: 'Presentado',
    classes: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  },
  paid: {
    label: 'Pagado',
    classes: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700',
  },
  overdue: {
    label: 'Vencido',
    classes: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700',
  },
};

const MODEL_KEYS = Object.keys(TAX_MODEL_NAMES) as TaxModel[];

function daysLabel(days: number): { text: string; classes: string } {
  if (days < 0) return { text: `${Math.abs(days)}d vencido`, classes: 'text-red-600 dark:text-red-400' };
  if (days === 0) return { text: 'Hoy', classes: 'text-red-600 dark:text-red-400' };
  if (days <= 3) return { text: `${days}d`, classes: 'text-red-600 dark:text-red-400' };
  if (days <= 7) return { text: `${days}d`, classes: 'text-amber-600 dark:text-amber-400' };
  return { text: `${days}d`, classes: 'text-gray-500 dark:text-gray-400' };
}

// ─── Form modal ─────────────────────────────────────────────────────────────

interface FormState {
  model: TaxModel;
  period: string;
  dueDate: string;
  estimatedAmount: string;
  notes: string;
  reminderDaysBefore: string;
}

const EMPTY_FORM: FormState = {
  model: 'modelo_303',
  period: '',
  dueDate: '',
  estimatedAmount: '',
  notes: '',
  reminderDaysBefore: '7',
};

function formFromObligation(ob: TaxObligation): FormState {
  return {
    model: ob.model,
    period: ob.period,
    dueDate: ob.dueDate,
    estimatedAmount: ob.estimatedAmount != null ? String(ob.estimatedAmount) : '',
    notes: ob.notes,
    reminderDaysBefore: String(ob.reminderDaysBefore),
  };
}

interface ObligationModalProps {
  editing: TaxObligation | null;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  saving: boolean;
}

function ObligationModal({ editing, onClose, onSave, saving }: ObligationModalProps) {
  const [form, setForm] = useState<FormState>(editing ? formFromObligation(editing) : EMPTY_FORM);

  useEffect(() => {
    setForm(editing ? formFromObligation(editing) : EMPTY_FORM);
  }, [editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSave(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base">
            {editing ? 'Editar obligación' : 'Nueva obligación fiscal'}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Model */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Modelo
            </label>
            <select
              value={form.model}
              onChange={(e) => set('model', e.target.value as TaxModel)}
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 rounded-xl outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
            >
              {MODEL_KEYS.map((k) => (
                <option key={k} value={k}>{TAX_MODEL_NAMES[k]}</option>
              ))}
            </select>
          </div>

          {/* Period + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Período
              </label>
              <input
                type="text"
                placeholder="ej. 2026-Q1"
                value={form.period}
                onChange={(e) => set('period', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 rounded-xl outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Fecha límite
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 rounded-xl outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Amount + Reminder */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Importe estimado (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.estimatedAmount}
                onChange={(e) => set('estimatedAmount', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 rounded-xl outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Recordar (días antes)
              </label>
              <input
                type="number"
                min="0"
                value={form.reminderDaysBefore}
                onChange={(e) => set('reminderDaysBefore', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 rounded-xl outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
              Notas
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 rounded-xl outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-semibold hover:border-gray-300 dark:hover:border-gray-600 transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !form.period || !form.dueDate}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear obligación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete confirmation ────────────────────────────────────────────────────

interface DeleteConfirmProps {
  obligation: TaxObligation;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  deleting: boolean;
}

function DeleteConfirm({ obligation, onClose, onConfirm, deleting }: DeleteConfirmProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/50 rounded-2xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base">Eliminar obligación</h3>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">Esta acción no se puede deshacer</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            ¿Eliminar <span className="font-semibold text-gray-900 dark:text-gray-100">{obligation.modelName}</span>{' '}
            ({obligation.periodLabel})?
          </p>
        </div>
        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm font-semibold hover:border-gray-300 dark:hover:border-gray-600 transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={() => void onConfirm()}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Widget ────────────────────────────────────────────────────────────

interface TaxCalendarWidgetProps {
  userId: string;
}

export default function TaxCalendarWidget({ userId }: TaxCalendarWidgetProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [obligations, setObligations] = useState<TaxObligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaxObligation | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TaxObligation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [generating, setGenerating] = useState(false);

  // ── Fetch ──
  const fetchObligations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTaxObligations(userId, year);
      setObligations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar obligaciones');
    } finally {
      setLoading(false);
    }
  }, [userId, year]);

  useEffect(() => { void fetchObligations(); }, [fetchObligations]);

  // ── Derived ──
  const overdue = useMemo(() => getOverdueObligations(obligations), [obligations]);
  const upcoming = useMemo(() => getUpcomingDeadlines(obligations), [obligations]);

  // ── Handlers ──
  const handleSave = async (form: FormState) => {
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        model: form.model,
        period: form.period,
        dueDate: form.dueDate,
        estimatedAmount: form.estimatedAmount ? parseFloat(form.estimatedAmount) : undefined,
        notes: form.notes,
        reminderDaysBefore: form.reminderDaysBefore ? parseInt(form.reminderDaysBefore, 10) : 7,
      };
      await saveTaxObligation(userId, payload, editing ?? undefined);
      setModalOpen(false);
      setEditing(null);
      await fetchObligations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTaxObligation(userId, deleteTarget._id);
      setDeleteTarget(null);
      await fetchObligations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkFiled = async (ob: TaxObligation) => {
    try {
      await markFiled(userId, ob._id, new Date().toISOString().slice(0, 10));
      await fetchObligations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al marcar como presentado');
    }
  };

  const handleMarkPaid = async (ob: TaxObligation) => {
    try {
      await markPaid(userId, ob._id);
      await fetchObligations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al marcar como pagado');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateCalendarFromPresets(userId, year);
      await fetchObligations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar calendario');
    } finally {
      setGenerating(false);
    }
  };

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (ob: TaxObligation) => { setEditing(ob); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {overdue.length === 1
                ? 'Tienes 1 obligación vencida'
                : `Tienes ${overdue.length} obligaciones vencidas`}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              {overdue.map((o) => o.modelName).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Header card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">
              Calendario Fiscal
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Year nav */}
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button
                onClick={() => setYear((y) => y - 1)}
                className="px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <span className="px-3 text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                {year}
              </span>
              <button
                onClick={() => setYear((y) => y + 1)}
                className="px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <button
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {generating ? 'Generando…' : 'Auto-generar'}
            </button>

            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-5 mt-4 flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="px-5 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            Cargando obligaciones…
          </div>
        )}

        {/* Empty */}
        {!loading && obligations.length === 0 && (
          <div className="px-5 py-12 text-center">
            <Calendar className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No hay obligaciones fiscales para {year}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Pulsa "Auto-generar" para crear el calendario estándar
            </p>
          </div>
        )}

        {/* List */}
        {!loading && obligations.length > 0 && (
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {obligations.map((ob) => {
              const days = daysUntilDue(ob);
              const dl = daysLabel(days);
              const st = STATUS_CONFIG[ob.status];
              const isDone = ob.status === 'filed' || ob.status === 'paid';

              return (
                <div
                  key={ob._id}
                  className={`px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors ${isDone ? 'opacity-60' : ''}`}
                >
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center gap-1 w-6 flex-shrink-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        ob.status === 'paid'
                          ? 'bg-green-400'
                          : ob.status === 'filed'
                            ? 'bg-emerald-400'
                            : ob.status === 'overdue' || days < 0
                              ? 'bg-red-400'
                              : ob.status === 'in_progress'
                                ? 'bg-blue-400'
                                : 'bg-amber-400'
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {ob.modelName}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {ob.periodLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(ob.dueDate)}
                      </span>
                      {ob.estimatedAmount != null && (
                        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Wallet className="w-3 h-3" />
                          {formatCurrency(ob.estimatedAmount)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Days remaining */}
                  {!isDone && (
                    <span className={`text-xs font-semibold tabular-nums ${dl.classes}`}>
                      {dl.text}
                    </span>
                  )}

                  {/* Status badge */}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-lg border ${st.classes}`}>
                    {st.label}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {ob.status !== 'filed' && ob.status !== 'paid' && (
                      <button
                        onClick={() => void handleMarkFiled(ob)}
                        title="Marcar presentado"
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {ob.status !== 'paid' && (
                      <button
                        onClick={() => void handleMarkPaid(ob)}
                        title="Marcar pagado"
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(ob)}
                      title="Editar"
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(ob)}
                      title="Eliminar"
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary footer */}
        {!loading && obligations.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{obligations.length} obligaciones</span>
            {overdue.length > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium">
                {overdue.length} vencida{overdue.length > 1 ? 's' : ''}
              </span>
            )}
            {upcoming.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {upcoming.length} próxima{upcoming.length > 1 ? 's' : ''} (30d)
              </span>
            )}
            <span className="ml-auto font-medium text-gray-700 dark:text-gray-300">
              Est. total:{' '}
              {formatCurrency(
                obligations.reduce((sum, o) => sum + (o.estimatedAmount ?? 0), 0),
              )}
            </span>
          </div>
        )}
      </div>

      {/* Modals */}
      {modalOpen && (
        <ObligationModal
          editing={editing}
          onClose={closeModal}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          obligation={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}
    </div>
  );
}
