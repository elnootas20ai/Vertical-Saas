import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Plus, X, Trash2, Edit3, Building2, CreditCard,
  Check, AlertTriangle, Loader2, Star, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  listBankAccounts,
  saveBankAccount,
  deleteBankAccount,
} from '../../../lib/bankAccountsApi';
import type {
  BankAccount,
  CreateBankAccountPayload,
} from '../../../lib/bankAccountTypes';
import {
  getTotalBalance,
  maskIban,
  formatIban,
  createBankAccountRecord,
} from '../../../lib/bankAccountTypes';

// ─── Constants ───────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#06b6d4', '#ec4899', '#64748b',
];

const EMPTY_FORM: FormState = {
  name: '',
  bankName: '',
  iban: '',
  currency: 'EUR',
  initialBalance: 0,
  color: PRESET_COLORS[0],
  isDefault: false,
  notes: '',
};

interface FormState {
  name: string;
  bankName: string;
  iban: string;
  currency: string;
  initialBalance: number;
  color: string;
  isDefault: boolean;
  notes: string;
}

interface BankAccountsWidgetProps {
  userId: string;
  onBalanceChange?: (total: number) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

function balanceColor(n: number): string {
  if (n > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (n < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BankAccountsWidget({ userId, onBalanceChange }: BankAccountsWidgetProps) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const balanceRef = useRef<number | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // ── Load accounts ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const list = await listBankAccounts(userId);
      setAccounts(list);
      const total = getTotalBalance(list);
      if (balanceRef.current !== total) {
        balanceRef.current = total;
        onBalanceChange?.(total);
      }
    } catch {
      toast.error('Error al cargar cuentas bancarias');
    } finally {
      setLoading(false);
    }
  }, [userId, onBalanceChange]);

  useEffect(() => { load(); }, [load]);

  // ── Modal helpers ────────────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditingAccount(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((account: BankAccount) => {
    setEditingAccount(account);
    setForm({
      name: account.name,
      bankName: account.bankName,
      iban: account.iban,
      currency: account.currency,
      initialBalance: account.initialBalance,
      color: account.color,
      isDefault: account.isDefault,
      notes: account.notes,
    });
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingAccount(null);
    setForm(EMPTY_FORM);
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) closeModal();
  }, [closeModal]);

  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen, closeModal]);

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      if (editingAccount) {
        await saveBankAccount(userId, {
          ...editingAccount,
          name: form.name.trim(),
          bankName: form.bankName.trim(),
          iban: form.iban.trim(),
          currency: form.currency,
          initialBalance: form.initialBalance,
          color: form.color,
          isDefault: form.isDefault,
          notes: form.notes.trim(),
          updatedAt: new Date().toISOString(),
        }, editingAccount);
        toast.success('Cuenta actualizada');
      } else {
        const payload: CreateBankAccountPayload = {
          user_id: userId,
          name: form.name.trim(),
          bankName: form.bankName.trim(),
          iban: form.iban.trim(),
          currency: form.currency,
          initialBalance: form.initialBalance,
          color: form.color,
          isDefault: form.isDefault,
          notes: form.notes.trim(),
        };
        await saveBankAccount(userId, payload);
        toast.success('Cuenta creada');
      }
      closeModal();
      await load();
    } catch {
      toast.error('Error al guardar la cuenta');
    } finally {
      setSaving(false);
    }
  }, [form, editingAccount, userId, closeModal, load]);

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (accountId: string) => {
    setDeleting(true);
    try {
      await deleteBankAccount(userId, accountId);
      toast.success('Cuenta eliminada');
      setDeleteConfirmId(null);
      setExpandedId(null);
      await load();
    } catch {
      toast.error('Error al eliminar la cuenta');
    } finally {
      setDeleting(false);
    }
  }, [userId, load]);

  // ── Form updater ─────────────────────────────────────────────────────────

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  const totalBalance = getTotalBalance(accounts);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Cuentas bancarias
          </h3>
          <p className={`text-2xl font-extrabold tracking-tight mt-0.5 ${balanceColor(totalBalance)}`}>
            {loading ? '...' : fmtCurrency(totalBalance)}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Account list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No hay cuentas bancarias</p>
          <button
            onClick={openCreate}
            className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Añadir primera cuenta
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(account => {
            const isExpanded = expandedId === account._id;
            const isDeleting = deleteConfirmId === account._id;

            return (
              <div
                key={account._id}
                className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden transition-all"
              >
                {/* Card header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : account._id)}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: account.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
                        {account.name}
                      </span>
                      {account.isDefault && (
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {account.bankName && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {account.bankName}
                        </span>
                      )}
                      {account.iban && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">
                          {maskIban(account.iban)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${balanceColor(account.currentBalance)}`}>
                    {fmtCurrency(account.currentBalance)}
                  </span>
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  }
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3 bg-gray-50/50 dark:bg-gray-800/30">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">IBAN</span>
                        <p className="font-mono text-gray-900 dark:text-white mt-0.5">
                          {account.iban ? formatIban(account.iban) : '—'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Moneda</span>
                        <p className="text-gray-900 dark:text-white mt-0.5">{account.currency}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Saldo inicial</span>
                        <p className="text-gray-900 dark:text-white mt-0.5">
                          {fmtCurrency(account.initialBalance)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Estado</span>
                        <p className="mt-0.5">
                          {account.active
                            ? <span className="text-emerald-600 dark:text-emerald-400">Activa</span>
                            : <span className="text-gray-400">Inactiva</span>
                          }
                        </p>
                      </div>
                    </div>

                    {account.notes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        {account.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => openEdit(account)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-3 h-3" />
                        Editar
                      </button>

                      {isDeleting ? (
                        <div className="flex items-center gap-1.5 ml-auto">
                          <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                            ¿Eliminar?
                          </span>
                          <button
                            onClick={() => handleDelete(account._id)}
                            disabled={deleting}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Sí
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(account._id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors ml-auto"
                        >
                          <Trash2 className="w-3 h-3" />
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal ───────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          ref={backdropRef}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h4 className="text-base font-bold text-gray-900 dark:text-white">
                {editingAccount ? 'Editar cuenta' : 'Nueva cuenta bancaria'}
              </h4>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => updateField('name', e.target.value)}
                  placeholder="Cuenta principal"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                />
              </div>

              {/* Bank name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Banco
                </label>
                <input
                  type="text"
                  value={form.bankName}
                  onChange={e => updateField('bankName', e.target.value)}
                  placeholder="BBVA, Santander..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                />
              </div>

              {/* IBAN */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  IBAN
                </label>
                <input
                  type="text"
                  value={form.iban}
                  onChange={e => updateField('iban', e.target.value)}
                  placeholder="ES00 0000 0000 0000 0000 0000"
                  className="w-full px-3 py-2 text-sm font-mono rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                />
              </div>

              {/* Currency + Initial balance */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Moneda
                  </label>
                  <select
                    value={form.currency}
                    onChange={e => updateField('currency', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Saldo inicial
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.initialBalance}
                    onChange={e => updateField('initialBalance', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  />
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Color
                </label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateField('color', c)}
                      className={`w-7 h-7 rounded-full transition-all ${
                        form.color === c
                          ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-blue-500 scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Default checkbox */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                    form.isDefault
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                  }`}
                  onClick={() => updateField('isDefault', !form.isDefault)}
                >
                  {form.isDefault && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Cuenta predeterminada
                </span>
              </label>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Notas
                </label>
                <textarea
                  value={form.notes}
                  onChange={e => updateField('notes', e.target.value)}
                  rows={2}
                  placeholder="Notas opcionales..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none"
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors shadow-sm"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingAccount ? 'Guardar cambios' : 'Crear cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
