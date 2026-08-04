import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { toast } from 'sonner';
import { salesListPathForBusiness } from '../../lib/compraventaPaths';
import { CloseSaleWizard } from '../../components/saas/CloseSaleWizard';
import { useSalePermissions } from '../../hooks/useSalePermissions';
import { syncVehicleWithSale } from '../../lib/vehicleSaleSync';
import { ensureSaleIncomeFromClosure, ensureCommissionExpense } from '../../lib/saleFinanceSync';
import { downloadDeliveryActa } from '../../lib/deliveryActaPdfGenerator';
import {
  ArrowLeft, CheckCircle2, ChevronRight,
  FileText, Pencil, Phone, Mail, Banknote,
  Calendar, Clock, Upload, Plus, ChevronDown,
  AlertCircle, CircleDot, Eye, Trash2, X,
  Calculator, Truck, ClipboardCheck, TrendingDown,
  ShieldAlert, History, ChevronUp,
} from 'lucide-react';
import { getSaleRecord, updateSaleInCouch } from '../../lib/salesApi';
import {
  getSaleCoveredAmount,
  getSalePendingAmount,
  getSaleFinalMargin,
  SALE_STAGE_LABELS,
  DEFAULT_DELIVERY_CHECKLIST,
  type SaleRecord,
  type SaleStage,
  type SaleDeliveryChecklistItem,
  type SalePriceHistoryEntry,
  type SaleDeliveryData,
  type SaleClosureData,
} from '../../lib/salesTypes';
import { parseLocaleNumber } from '../../lib/numberFormat';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'resumen' | 'cobros' | 'documentos' | 'entrega' | 'historial';
type SaleData = SaleRecord;

// ─── Design Tokens ────────────────────────────────────────────────────────────

const STAGES: Array<{ id: SaleStage; label: string }> = [
  { id: 'interested',    label: 'Interesado' },
  { id: 'reserved',      label: 'Reserva' },
  { id: 'documentation', label: 'Documentación' },
  { id: 'sold',          label: 'Vendido' },
  { id: 'delivered',     label: 'Entregado' },
];

const STAGE_TOKEN: Record<SaleStage, {
  dot: string; badgeBg: string; badgeText: string;
  accentBorder: string; activeBg: string; activeText: string;
  progressBar: string;
}> = {
  interested:    { dot: 'bg-slate-400',   badgeBg: 'bg-slate-100',  badgeText: 'text-slate-600',  accentBorder: 'border-l-slate-400',   activeBg: 'bg-slate-500',   activeText: 'text-slate-700',  progressBar: 'bg-slate-400' },
  reserved:      { dot: 'bg-blue-500',    badgeBg: 'bg-blue-50',    badgeText: 'text-blue-700',   accentBorder: 'border-l-blue-500',    activeBg: 'bg-blue-500',    activeText: 'text-blue-700',   progressBar: 'bg-blue-500' },
  documentation: { dot: 'bg-amber-500',   badgeBg: 'bg-amber-50',   badgeText: 'text-amber-700',  accentBorder: 'border-l-amber-500',   activeBg: 'bg-amber-500',   activeText: 'text-amber-700',  progressBar: 'bg-amber-500' },
  sold:          { dot: 'bg-violet-500',  badgeBg: 'bg-violet-50',  badgeText: 'text-violet-700', accentBorder: 'border-l-violet-500',  activeBg: 'bg-violet-500',  activeText: 'text-violet-700', progressBar: 'bg-violet-500' },
  delivered:     { dot: 'bg-emerald-500', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700',accentBorder: 'border-l-emerald-500', activeBg: 'bg-emerald-500', activeText: 'text-emerald-700',progressBar: 'bg-emerald-500' },
};

function stageIdx(s: SaleStage) { return STAGES.findIndex(x => x.id === s); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (seconds < 60) return `hace ${seconds} segundo${seconds !== 1 ? 's' : ''}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} minuto${minutes !== 1 ? 's' : ''}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} hora${hours !== 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} día${days !== 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months !== 1 ? 'es' : ''}`;
  const years = Math.floor(months / 12);
  return `hace ${years} año${years !== 1 ? 's' : ''}`;
}

function StagePill({ stage }: { stage: SaleStage }) {
  const t = STAGE_TOKEN[stage];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${t.badgeBg} ${t.badgeText}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
      {STAGES[stageIdx(stage)].label}
    </span>
  );
}

function buildAutoClosureDataOnFullPayment(
  sale: SaleData,
  closedById: string,
  closedByName: string,
): SaleClosureData {
  const now = new Date().toISOString();
  const margin = getSaleFinalMargin(sale, 0);
  return {
    closedAt: now,
    closedBy: closedById || closedByName,
    paymentComplete: getSalePendingAmount(sale) <= 0,
    contractSigned: sale.generatedDocuments.some((d) => d.type === 'contract' && d.status === 'ok'),
    documentationComplete: true,
    closureNotes: 'Cierre automático al completar el cobro.',
    finalPrice: sale.totalPrice,
    finalMargin: margin,
    finalMarginPercent: sale.totalPrice > 0 ? Math.round((margin / sale.totalPrice) * 100) : 0,
    associatedCosts: 0,
  };
}

function getNextAction(stage: SaleStage, hasPending: boolean) {
  if (stage === 'interested')    return { label: 'El cliente está interesado. Formaliza la reserva para asegurar la operación.', cta: 'Pasar a reserva', variant: 'blue' };
  if (stage === 'reserved')      return { label: 'Reserva activa. Registra el importe recibido e inicia la gestión documental.', cta: 'Registrar pago', variant: 'amber' };
  if (stage === 'documentation') return { label: hasPending ? 'Documentación en proceso. Completa el pago pendiente.' : 'Documentos listos. Puedes cerrar la venta.', cta: hasPending ? 'Registrar pago' : 'Cerrar venta', variant: 'amber' };
  if (stage === 'sold' && hasPending) return { label: 'Operación cerrada con pago pendiente. Registra el pago para preparar la entrega.', cta: 'Registrar pago', variant: 'red' };
  if (stage === 'sold')          return { label: 'Todo cobrado. Coordina la entrega del vehículo con el cliente.', cta: 'Preparar entrega', variant: 'green' };
  return { label: 'Vehículo entregado. Operación completada correctamente.', cta: 'Ver documentos', variant: 'green' };
}

// ─── Change Stage Modal ───────────────────────────────────────────────────────

function ChangeStageModal({ isOpen, onClose, currentStage, onConfirm }:
  { isOpen: boolean; onClose: () => void; currentStage: SaleStage; onConfirm: (s: SaleStage) => void }) {
  const [sel, setSel] = useState<SaleStage>(currentStage);
  useEffect(() => { setSel(currentStage); }, [currentStage, isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-1">Cambiar fase</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Selecciona la nueva fase de la operación</p>
          <div className="space-y-2">
            {STAGES.map(({ id, label }) => {
              const t = STAGE_TOKEN[id];
              const active = sel === id;
              return (
                <button key={id} onClick={() => setSel(id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-sm transition-all ${
                    active ? `${t.badgeBg} border-current ${t.badgeText}` : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.dot}`} />
                  <span className="flex-1 text-left font-medium">{label}</span>
                  {active && <CheckCircle2 className="w-4 h-4" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancelar
          </button>
          <button onClick={() => { onConfirm(sel); onClose(); }} disabled={sel === currentStage}
            className="flex-1 py-3 rounded-2xl bg-gray-900 hover:bg-black text-white text-sm font-medium transition-colors disabled:opacity-40">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Register Payment Modal ───────────────────────────────────────────────────

function RegisterPaymentModal({
  isOpen,
  onClose,
  pendingAmount,
  defaultMethod,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  pendingAmount: number;
  defaultMethod: string;
  onConfirm: (payload: { amount: number; method: string; note: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount(String(pendingAmount || ''));
      setMethod(defaultMethod || 'Transferencia');
      setNote('');
      setError('');
      setSaving(false);
    }
  }, [defaultMethod, isOpen, pendingAmount]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const parsedAmount = parseLocaleNumber(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('El importe indicado no es válido. Revísalo e inténtalo de nuevo.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onConfirm({
        amount: parsedAmount,
        method: method.trim() || 'Transferencia',
        note: note.trim(),
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Registrar pago</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Importe pendiente actual: {pendingAmount.toLocaleString('es-ES')}€
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Importe a registrar
            </label>
            <input
              type="text"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(''); }}
              placeholder="0"
              className="w-full px-3.5 py-2.5 border-2 border-gray-100 dark:border-gray-800 focus:border-blue-400 rounded-xl text-sm focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Metodo de pago aplicado
            </label>
            <input
              type="text"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3.5 py-2.5 border-2 border-gray-100 dark:border-gray-800 focus:border-blue-400 rounded-xl text-sm focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              Observaciones de la operacion
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-3.5 py-2.5 border-2 border-gray-100 dark:border-gray-800 focus:border-blue-400 rounded-xl text-sm focus:outline-none transition-colors resize-none"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-gray-900 hover:bg-black text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Sale Modal ──────────────────────────────────────────────────────────

interface EditSaleForm {
  totalPrice: string;
  purchasePrice: string;
  expectedDelivery: string;
  responsible: string;
  notes: string;
  paymentMethod: string;
  financingBank: string;
  financingAmount: string;
  operationType: string;
  priceChangeReason: string;
  managerApproval: string;
}

function EditSaleModal({ isOpen, onClose, sale, onSave }: {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleData;
  onSave: (updates: Partial<SaleData>) => Promise<void>;
}) {
  const [form, setForm] = useState<EditSaleForm>({
    totalPrice: '',
    purchasePrice: '',
    expectedDelivery: '',
    responsible: '',
    notes: '',
    paymentMethod: '',
    financingBank: '',
    financingAmount: '',
    operationType: '',
    priceChangeReason: '',
    managerApproval: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm({
        totalPrice: String(sale.totalPrice),
        purchasePrice: String(sale.purchasePrice),
        expectedDelivery: sale.expectedDelivery || '',
        responsible: sale.responsible,
        notes: sale.notes,
        paymentMethod: sale.paymentMethod || '',
        financingBank: sale.financingBank || '',
        financingAmount: String(sale.financingAmount || 0),
        operationType: sale.operationType || '',
        priceChangeReason: '',
        managerApproval: '',
      });
      setError('');
    }
  }, [isOpen, sale]);

  if (!isOpen) return null;

  const newTotalPrice   = parseLocaleNumber(form.totalPrice);
  const parsedPurchasePrice = parseLocaleNumber(form.purchasePrice);
  const purchasePrice   = Number.isFinite(parsedPurchasePrice) ? parsedPurchasePrice : sale.purchasePrice;
  const priceChanged    = Number.isFinite(newTotalPrice) && newTotalPrice !== sale.totalPrice;
  const minimumPrice    = sale.minimumPrice ?? sale.purchasePrice;
  const belowMinimum    = priceChanged && newTotalPrice < minimumPrice;

  const field = (label: string, key: keyof EditSaleForm, type = 'text') => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setError(''); }}
        className="w-full px-3.5 py-2.5 border-2 border-gray-100 dark:border-gray-800 focus:border-blue-400 rounded-xl text-sm focus:outline-none transition-colors"
      />
    </div>
  );

  const handleSave = async () => {
    const totalPrice = parseLocaleNumber(form.totalPrice);
    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      setError('El precio total debe ser un número mayor que cero.');
      return;
    }
    if (priceChanged && !form.priceChangeReason.trim()) {
      setError('Indica el motivo del cambio de precio.');
      return;
    }
    if (belowMinimum && !form.managerApproval.trim()) {
      setError('Se requiere el nombre del responsable que aprueba la reducción de precio.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const newPriceHistoryEntry: SalePriceHistoryEntry | null = priceChanged
        ? {
            id: `price-${uuidv4()}`,
            previousPrice: sale.totalPrice,
            newPrice: totalPrice,
            reason: form.priceChangeReason.trim(),
            date: now,
            user: sale.responsible,
            approvedBy: belowMinimum ? form.managerApproval.trim() : undefined,
            belowMinimum,
          }
        : null;

      await onSave({
        totalPrice,
        purchasePrice: purchasePrice,
        expectedDelivery: form.expectedDelivery,
        responsible: form.responsible || sale.responsible,
        notes: form.notes,
        paymentMethod: form.paymentMethod,
        financingBank: form.financingBank,
        financingAmount: (() => {
          const parsedFinancingAmount = parseLocaleNumber(form.financingAmount);
          return Number.isFinite(parsedFinancingAmount) ? parsedFinancingAmount : 0;
        })(),
        operationType: form.operationType,
        ...(newPriceHistoryEntry
          ? { priceHistory: [newPriceHistoryEntry, ...(sale.priceHistory || [])] }
          : {}),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Editar venta</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Modifica los datos de la operación</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field('Total acordado (€)', 'totalPrice', 'number')}
            {field('Precio de compra (€)', 'purchasePrice', 'number')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('Financiación (€)', 'financingAmount', 'number')}
            {field('Banco financiación', 'financingBank')}
          </div>
          {field('Responsable', 'responsible')}
          {field('Método de pago', 'paymentMethod')}
          {field('Tipo de operación', 'operationType')}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Entrega prevista</label>
            <input
              type="date"
              value={form.expectedDelivery}
              onChange={e => setForm(f => ({ ...f, expectedDelivery: e.target.value }))}
              className="w-full px-3.5 py-2.5 border-2 border-gray-100 dark:border-gray-800 focus:border-blue-400 rounded-xl text-sm focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Notas</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3.5 py-2.5 border-2 border-gray-100 dark:border-gray-800 focus:border-blue-400 rounded-xl text-sm focus:outline-none transition-colors resize-none"
              placeholder="Observaciones sobre esta operación…"
            />
          </div>

          {priceChanged && (
            <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-4">
              <div className="flex items-center gap-2 mb-1">
                <History className="w-4 h-4 text-amber-500" />
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Cambio de precio detectado</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="line-through text-gray-400 dark:text-gray-500">{sale.totalPrice.toLocaleString('es-ES')}€</span>
                <span className="text-gray-400 dark:text-gray-500">→</span>
                <span className={`font-bold ${newTotalPrice < sale.totalPrice ? 'text-red-600' : 'text-emerald-600'}`}>
                  {newTotalPrice.toLocaleString('es-ES')}€
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${newTotalPrice < sale.totalPrice ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                  {newTotalPrice < sale.totalPrice ? '-' : '+'}{Math.abs(newTotalPrice - sale.totalPrice).toLocaleString('es-ES')}€
                </span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Motivo del cambio <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.priceChangeReason}
                  onChange={e => { setForm(f => ({ ...f, priceChangeReason: e.target.value })); setError(''); }}
                  placeholder="ej. Negociación con el cliente, incluye extras…"
                  className="w-full px-3.5 py-2.5 border-2 border-amber-200 focus:border-amber-400 rounded-xl text-sm focus:outline-none transition-colors"
                />
              </div>
              {belowMinimum && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">
                      <strong>Precio por debajo del mínimo</strong> ({minimumPrice.toLocaleString('es-ES')}€). Se requiere aprobación de gerencia.
                    </p>
                  </div>
                  <input
                    type="text"
                    value={form.managerApproval}
                    onChange={e => { setForm(f => ({ ...f, managerApproval: e.target.value })); setError(''); }}
                    placeholder="Nombre del responsable que aprueba…"
                    className="w-full px-3.5 py-2.5 border-2 border-red-200 focus:border-red-400 rounded-xl text-sm focus:outline-none transition-colors"
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-xl">{error}</p>
          )}
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => { void handleSave(); }}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-gray-900 hover:bg-black text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Workflow Bar ─────────────────────────────────────────────────────────────

function WorkflowBar({ stage }: { stage: SaleStage }) {
  const cur = stageIdx(stage);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4">
      {/* Desktop */}
      <div className="hidden sm:flex items-center">
        {STAGES.map(({ id, label }, idx) => {
          const done   = idx < cur;
          const active = idx === cur;
          const t      = STAGE_TOKEN[id];
          return (
            <div key={id} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                  done   ? `${t.activeBg} border-transparent text-white` :
                  active ? `${t.activeBg} border-transparent text-white ring-4 ring-offset-1 ring-opacity-20 ${t.progressBar.replace('bg-', 'ring-')}` :
                           'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-300'
                }`}>
                  {done
                    ? <CheckCircle2 className="w-4 h-4" />
                    : <span className="text-xs font-bold">{idx + 1}</span>
                  }
                </div>
                <span className={`text-[11px] font-semibold whitespace-nowrap ${
                  done ? 'text-emerald-600' : active ? t.activeText : 'text-gray-300'
                }`}>{label}</span>
              </div>
              {idx < STAGES.length - 1 && (
                <div className={`flex-1 h-px mx-2 mb-5 ${done ? t.progressBar.replace('bg-', 'bg-') : 'bg-gray-100 dark:bg-gray-700'}`} />
              )}
            </div>
          );
        })}
      </div>
      {/* Mobile */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">Fase {cur + 1} de {STAGES.length}</span>
          <StagePill stage={stage} />
        </div>
        <div className="flex gap-1">
          {STAGES.map((_, idx) => {
            const t = STAGE_TOKEN[STAGES[idx].id];
            return (
              <div key={idx} className={`flex-1 h-1.5 rounded-full ${
                idx < cur ? 'bg-emerald-400' : idx === cur ? t.progressBar : 'bg-gray-100 dark:bg-gray-700'
              }`} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Edit Dropdown ────────────────────────────────────────────────────────────

function EditDropdown({ isOpen, onClose, onChangeStage, onEditSale, onOpenCalculator }:
  { isOpen: boolean; onClose: () => void; onChangeStage: () => void; onEditSale: () => void; onOpenCalculator: () => void }) {
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-56 py-1.5 overflow-hidden">
        <button onClick={() => { onChangeStage(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left transition-colors group">
          <div className="w-8 h-8 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
            <CircleDot className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cambiar fase</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Actualizar estado</p>
          </div>
        </button>
        <button onClick={() => { onEditSale(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors group">
          <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 group-hover:bg-gray-200 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
            <Pencil className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Editar venta</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Modificar datos</p>
          </div>
        </button>
        <button onClick={() => { onOpenCalculator(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left transition-colors group">
          <div className="w-8 h-8 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
            <Calculator className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Calcular financiación</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Simular cuotas TIN/TAE</p>
          </div>
        </button>
      </div>
    </>
  );
}

// ─── Financing Calculator Modal (SA-01) ───────────────────────────────────────

interface FinancingForm {
  capital: string;
  entrada: string;
  tin: string;
  plazo: string;
}

function calcMonthlyPayment(capital: number, tin: number, months: number): number {
  if (tin <= 0) return months > 0 ? capital / months : 0;
  const r = tin / 100 / 12;
  return (capital * r) / (1 - Math.pow(1 + r, -months));
}

function calcTAE(tin: number): number {
  const r = tin / 100 / 12;
  return (Math.pow(1 + r, 12) - 1) * 100;
}

function FinancingCalculatorModal({
  isOpen,
  onClose,
  sale,
  onApply,
}: {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleData;
  onApply: (financingAmount: number, bank: string) => void;
}) {
  const [form, setForm] = useState<FinancingForm>({ capital: '', entrada: '', tin: '6.5', plazo: '48' });
  const [bank, setBank] = useState(sale.financingBank || '');
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const pending = Math.max(0, sale.totalPrice - sale.depositPaid);
      setForm({ capital: String(sale.totalPrice), entrada: String(sale.depositPaid || 0), tin: '6.5', plazo: '48' });
      setBank(sale.financingBank || '');
      setShowTable(false);
      void pending;
    }
  }, [isOpen, sale]);

  const parsedTotalPrice = parseLocaleNumber(form.capital);
  const parsedEntrada = parseLocaleNumber(form.entrada);
  const parsedTin = parseLocaleNumber(form.tin);
  const totalPrice   = Number.isFinite(parsedTotalPrice) ? parsedTotalPrice : 0;
  const entrada      = Number.isFinite(parsedEntrada) ? parsedEntrada : 0;
  const tin          = Number.isFinite(parsedTin) ? parsedTin : 0;
  const plazo        = parseInt(form.plazo) || 0;
  const capital      = Math.max(0, totalPrice - entrada);
  const cuota        = plazo > 0 && capital > 0 ? calcMonthlyPayment(capital, tin, plazo) : 0;
  const tae          = calcTAE(tin);
  const totalPagar   = cuota * plazo + entrada;
  const costeFin     = cuota * plazo - capital;
  const valid        = capital > 0 && plazo > 0 && cuota > 0;

  const amortRows = useMemo(() => {
    if (!valid || plazo > 120) return [] as { mes: number; cuota: number; interest: number; principal: number; pending: number }[];
    const r    = tin / 100 / 12;
    let pendingBalance = capital;
    const rows: { mes: number; cuota: number; interest: number; principal: number; pending: number }[] = [];
    for (let i = 1; i <= Math.min(plazo, 12); i++) {
      const interest  = pendingBalance * r;
      const principal = cuota - interest;
      pendingBalance  = Math.max(0, pendingBalance - principal);
      rows.push({ mes: i, cuota, interest, principal, pending: pendingBalance });
    }
    return rows;
  }, [valid, plazo, capital, cuota, tin]);

  const field = (label: string, key: keyof FinancingForm, suffix?: string) => (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full px-3.5 py-2.5 border-2 border-gray-100 dark:border-gray-800 focus:border-blue-400 rounded-xl text-sm focus:outline-none transition-colors pr-10"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 font-semibold">{suffix}</span>}
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Calculator className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Calculadora de financiación</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Simula la cuota mensual para el cliente</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {field('Precio total (€)', 'capital', '€')}
            {field('Entrada / señal (€)', 'entrada', '€')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {field('TIN (%)', 'tin', '%')}
            {field('Plazo (meses)', 'plazo', 'meses')}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Banco financiador</label>
            <input
              type="text"
              value={bank}
              onChange={e => setBank(e.target.value)}
              placeholder="ej. Santander Consumer, BBVA…"
              className="w-full px-3.5 py-2.5 border-2 border-gray-100 dark:border-gray-800 focus:border-blue-400 rounded-xl text-sm focus:outline-none transition-colors"
            />
          </div>

          {valid && (
            <>
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
                <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider mb-3">Resultado de la simulación</p>
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-4xl font-bold leading-none">{cuota.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€</p>
                    <p className="text-blue-200 text-sm mt-1">/ mes · {plazo} meses</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">{tae.toFixed(2)}%</p>
                    <p className="text-blue-200 text-xs">TAE</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-blue-500/40">
                  {[
                    { label: 'Capital', value: `${capital.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€` },
                    { label: 'Total a pagar', value: `${totalPagar.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€` },
                    { label: 'Coste financiero', value: `+${costeFin.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€` },
                  ].map(row => (
                    <div key={row.label} className="text-center">
                      <p className="text-sm font-bold text-white">{row.value}</p>
                      <p className="text-[10px] text-blue-200 mt-0.5">{row.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {amortRows.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowTable(v => !v)}
                    className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 py-2 transition-colors"
                  >
                    <span>Tabla de amortización (12 primeras cuotas)</span>
                    {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showTable && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
                      <table className="w-full text-xs min-w-[700px]">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            {['Mes', 'Cuota', 'Intereses', 'Capital', 'Pendiente'].map(h => (
                              <th key={h} className="px-3 py-2 text-right font-semibold text-gray-500 dark:text-gray-400 first:text-left">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {amortRows.map(row => (
                            <tr key={row.mes} className="hover:bg-white transition-colors">
                              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{row.mes}</td>
                              <td className="px-3 py-2 text-right font-medium text-gray-800 dark:text-gray-200">{row.cuota.toFixed(0)}€</td>
                              <td className="px-3 py-2 text-right text-amber-600">{row.interest.toFixed(0)}€</td>
                              <td className="px-3 py-2 text-right text-emerald-600">{row.principal.toFixed(0)}€</td>
                              <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{row.pending.toFixed(0)}€</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cerrar
          </button>
          {valid && (
            <button
              onClick={() => { onApply(capital, bank); onClose(); }}
              className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              Aplicar financiación
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Resumen ─────────────────────────────────────────────────────────────

function TabResumen({ sale, stage, onChangeStage, setActiveTab, navigate }:
  { sale: SaleData; stage: SaleStage; onChangeStage: () => void; setActiveTab: (t: TabId) => void; navigate: (p: string) => void }) {
  const margin    = sale.totalPrice - sale.purchasePrice;
  const marginPct = Math.round((margin / sale.totalPrice) * 100);
  const pending   = sale.totalPrice - sale.depositPaid - (sale.financingAmount ?? 0);
  const action    = getNextAction(stage, pending > 0);

  const variantMap = {
    blue:  { card: 'bg-blue-50 border-blue-200', icon: 'text-blue-500', btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
    amber: { card: 'bg-amber-50 border-amber-200', icon: 'text-amber-500', btn: 'bg-amber-500 hover:bg-amber-600 text-white' },
    red:   { card: 'bg-red-50 border-red-200', icon: 'text-red-500', btn: 'bg-gray-900 hover:bg-black text-white' },
    green: { card: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-500', btn: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  };
  const v = variantMap[action.variant as keyof typeof variantMap];

  return (
    <div className="space-y-4">
      {/* Acción recomendada */}
      <div className={`rounded-2xl border p-4 ${v.card}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${v.icon}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Próximo paso</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{action.label}</p>
            <button
              onClick={action.cta.includes('cobro') || action.cta.includes('pago') || action.cta.includes('señal')
                ? () => setActiveTab('cobros')
                : action.cta === 'Ver documentos'
                ? () => setActiveTab('documentos')
                : action.cta === 'Preparar entrega'
                ? () => setActiveTab('entrega')
                : onChangeStage}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${v.btn}`}
            >
              {action.cta}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left — vehicle + client */}
        <div className="lg:col-span-3 space-y-4">
          {/* Vehicle */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Vehículo</p>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center flex-shrink-0 text-3xl">
                🚗
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">{sale.vehicleName}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="font-mono bg-blue-600 text-white px-2 py-0.5 rounded-lg text-xs font-bold">{sale.vehiclePlate}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {sale.vehicleYear || '—'} · {sale.vehicleMileage ? `${sale.vehicleMileage.toLocaleString('es-ES')} km` : 'Kilometraje pendiente'} · {sale.vehicleFuel || 'Combustible pendiente'}
                  </span>
                </div>
              </div>
              <button onClick={() => navigate(`/saas/vehicles/${sale.vehicleId}`)}
                className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5 transition-colors">
                Ver <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Client */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Cliente</p>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-white">{sale.clientName.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-gray-100 text-base">{sale.clientName}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Cliente particular</p>
              </div>
              <button onClick={() => navigate(`/saas/clients/${sale.clientId}`)}
                className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5 transition-colors">
                Ver <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <a href={`tel:${sale.clientPhone}`}
                className="flex items-center gap-2.5 p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors group">
                <Phone className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-blue-700 truncate transition-colors">{sale.clientPhone}</span>
              </a>
              <a href={`mailto:${sale.clientEmail}`}
                className="flex items-center gap-2.5 p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors group">
                <Mail className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-blue-700 truncate transition-colors">{sale.clientEmail}</span>
              </a>
            </div>
          </div>
        </div>

        {/* Right — meta + margin */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100">
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Estado</p>
              <StagePill stage={stage} />
            </div>
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Responsable</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gray-900 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-white">
                    {sale.responsible.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sale.responsible}</span>
              </div>
            </div>
            {sale.expectedDelivery && (
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Entrega prevista</p>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  {new Date(sale.expectedDelivery).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
              </div>
            )}
            {sale.deliveredAt && (
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Entregado</p>
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  {new Date(sale.deliveredAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
              </div>
            )}
          </div>

          {/* Margin */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Margen estimado</p>
            <div className="flex items-end justify-between mb-2.5">
              <span className="text-2xl font-bold text-emerald-600">{margin.toLocaleString('es-ES')}€</span>
              <span className="text-sm font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-lg">{marginPct}%</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(marginPct * 2, 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-2">
              <span>Compra {sale.purchasePrice.toLocaleString('es-ES')}€</span>
              <span>Venta {sale.totalPrice.toLocaleString('es-ES')}€</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Cobros ──────────────────────────────────────────────────────────────

function TabCobros({ sale, onRegisterPayment, onOpenCalculator }: { sale: SaleData; onRegisterPayment: () => void; onOpenCalculator: () => void }) {
  const financing    = sale.financingAmount ?? 0;
  const totalCovered = sale.depositPaid + financing;
  const pending      = sale.totalPrice - totalCovered;
  const pct          = Math.min(100, Math.round((totalCovered / sale.totalPrice) * 100));
  const [showFiscal, setShowFiscal] = useState(false);
  const margin    = sale.totalPrice - sale.purchasePrice;
  const marginPct = Math.round((margin / sale.totalPrice) * 100);
  const baseImponible = sale.totalPrice / 1.21;
  const iva           = sale.totalPrice - baseImponible;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Main */}
      <div className="lg:col-span-3 space-y-4">
        {/* Hero status */}
        <div className={`rounded-2xl p-6 ${pct === 100 ? 'bg-emerald-600' : 'bg-gray-900'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${pct === 100 ? 'text-emerald-200' : 'text-gray-400 dark:text-gray-500'}`}>
            {pct === 100 ? 'Cobro completado' : 'Estado del cobro'}
          </p>
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-white text-3xl font-bold">{sale.totalPrice.toLocaleString('es-ES')}€</p>
              <p className={`text-xs mt-1 ${pct === 100 ? 'text-emerald-200' : 'text-gray-400 dark:text-gray-500'}`}>total acordado</p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${pct === 100 ? 'text-white' : 'text-amber-400'}`}>{pct}%</p>
              <p className={`text-xs ${pct === 100 ? 'text-emerald-200' : 'text-gray-400 dark:text-gray-500'}`}>cobrado</p>
            </div>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${pct === 100 ? 'bg-emerald-500/40' : 'bg-white/10'}`}>
            <div className={`h-full rounded-full ${pct === 100 ? 'bg-white dark:bg-gray-800' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs mt-2">
            <span className={pct === 100 ? 'text-emerald-200' : 'text-gray-400 dark:text-gray-500'}>
              Recibido: {totalCovered.toLocaleString('es-ES')}€
            </span>
            {pending > 0 && <span className="text-red-300">Pendiente: {pending.toLocaleString('es-ES')}€</span>}
          </div>
        </div>

        {/* Desglose */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${sale.depositPaid > 0 ? 'bg-emerald-50' : 'bg-gray-100 dark:bg-gray-700'}`}>
              <Banknote className={`w-5 h-5 ${sale.depositPaid > 0 ? 'text-emerald-600' : 'text-gray-400 dark:text-gray-500'}`} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Señal / entrada</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{sale.depositPaid > 0 ? new Date(sale.createdAt).toLocaleDateString('es-ES') : 'Sin señal registrada'}</p>
            </div>
            <span className={`font-bold text-sm ${sale.depositPaid > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>
              {sale.depositPaid.toLocaleString('es-ES')}€
            </span>
          </div>
          {financing > 0 && (
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Financiación</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{sale.financingBank}</p>
              </div>
              <span className="font-bold text-sm text-blue-700">{financing.toLocaleString('es-ES')}€</span>
            </div>
          )}
          {pending > 0 && (
            <div className="flex items-center gap-4 px-5 py-4 bg-red-50">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pendiente</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">A cobrar antes de la entrega</p>
              </div>
              <span className="font-bold text-sm text-red-600">{pending.toLocaleString('es-ES')}€</span>
            </div>
          )}
          <div className="flex items-center gap-4 px-5 py-4 bg-gray-50 dark:bg-gray-800">
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Total acordado</p>
            </div>
            <span className="font-bold text-lg text-gray-900 dark:text-gray-100">{sale.totalPrice.toLocaleString('es-ES')}€</span>
          </div>
        </div>

        {/* Fiscal collapsible */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button onClick={() => setShowFiscal(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Desglose fiscal (IVA 21%)</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${showFiscal ? 'rotate-180' : ''}`} />
          </button>
          {showFiscal && (
            <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4 space-y-2.5">
              {[
                { label: 'Base imponible', value: `${baseImponible.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€` },
                { label: 'IVA (21%)', value: `${iva.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€` },
                { label: 'Total con IVA', value: `${sale.totalPrice.toLocaleString('es-ES')}€`, bold: true },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{row.label}</span>
                  <span className={row.bold ? 'font-bold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="lg:col-span-2 space-y-4">
        {pending > 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 p-5">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Pendiente de cobro</p>
            <p className="text-3xl font-bold text-red-600 mb-1">{pending.toLocaleString('es-ES')}€</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Registra el pago para actualizar el estado de la operación.</p>
            <button onClick={onRegisterPayment} className="w-full flex items-center justify-center gap-2 py-3 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" /> Registrar pago
            </button>
            <button onClick={onOpenCalculator} className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 border-2 border-blue-200 text-blue-700 hover:bg-blue-50 rounded-xl text-sm font-medium transition-colors">
              <Calculator className="w-4 h-4" /> Simular financiación
            </button>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-emerald-900 mb-0.5">Cobro completado</p>
            <p className="text-xs text-emerald-600">Operación totalmente cobrada</p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Margen estimado</p>
          <div className="flex items-end justify-between mb-2.5">
            <span className="text-2xl font-bold text-emerald-600">{margin.toLocaleString('es-ES')}€</span>
            <span className="text-sm font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-lg">{marginPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(marginPct * 2, 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-2">
            <span>Compra {sale.purchasePrice.toLocaleString('es-ES')}€</span>
            <span>Venta {sale.totalPrice.toLocaleString('es-ES')}€</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Documentos ──────────────────────────────────────────────────────────

const REQUIRED_DOC_DEFS = [
  { type: 'contract',  name: 'Contrato de compraventa',        emoji: '📄' },
  { type: 'invoice',   name: 'Factura de venta',               emoji: '🧾' },
  { type: 'worksheet', name: 'Hoja de encargo - Transferencia', emoji: '📋' },
  { type: 'delivery',  name: 'Acta de entrega',                emoji: '✍️' },
] as const;

const REQUIRED_TYPES = REQUIRED_DOC_DEFS.map(d => d.type);

function TabDocumentos({
  sale,
  onUploadDocument,
  onViewDocument,
  onDeleteDocument,
}: {
  sale: SaleData;
  onUploadDocument: (documentType: string, file: File) => Promise<void>;
  onViewDocument: (documentId: string) => void;
  onDeleteDocument: (documentId: string) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocType, setPendingDocType] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [uploading, setUploading] = useState(false);

  const requiredRows = REQUIRED_DOC_DEFS.map((def) => {
    const saved = sale.generatedDocuments.find(d => d.type === def.type);
    return {
      id: saved?.id ?? def.type,
      name: saved?.name ?? def.name,
      size: saved?.size ?? '—',
      date: saved?.date ?? '',
      emoji: def.emoji,
      status: saved?.status ?? 'pending',
      docType: def.type,
      hasFile: Boolean(saved?.fileData),
      isRequired: true,
    };
  });

  const customDocs = sale.generatedDocuments
    .filter(d => !REQUIRED_TYPES.includes(d.type as typeof REQUIRED_TYPES[number]))
    .map(d => ({
      id: d.id,
      name: d.name,
      size: d.size,
      date: d.date,
      emoji: '📎',
      status: d.status,
      docType: d.type,
      hasFile: Boolean(d.fileData),
      isRequired: false,
    }));

  const allDocs = [...requiredRows, ...customDocs];
  const ready = requiredRows.filter(d => d.status === 'ok').length;

  const triggerUpload = (docType: string) => {
    setPendingDocType(docType);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && pendingDocType) {
      setUploading(true);
      try {
        await onUploadDocument(pendingDocType, file);
      } finally {
        setUploading(false);
      }
    }
    setPendingDocType('');
    e.target.value = '';
  };

  const handleDelete = async (docId: string) => {
    setDeletingId(docId);
    try {
      await onDeleteDocument(docId);
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf,image/jpeg,image/jpg,image/png"
        className="hidden"
        onChange={e => { void handleFileChange(e); }}
      />

      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">Documentación</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{ready} de {REQUIRED_DOC_DEFS.length} documentos requeridos listos</p>
        </div>
        <button
          onClick={() => triggerUpload(`custom-${uuidv4()}`)}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          {uploading ? 'Subiendo…' : 'Subir documento'}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 overflow-hidden">
        {allDocs.map((doc) => (
          <div
            key={doc.id}
            className={`flex items-center gap-4 px-5 py-4 transition-colors ${
              doc.status === 'ok' ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : 'bg-amber-50 hover:bg-amber-100/70'
            }`}
          >
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl ${
              doc.status === 'ok' ? 'bg-emerald-50' : 'bg-amber-100'
            }`}>
              {doc.emoji}
            </div>

            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${doc.status === 'ok' ? 'text-gray-900 dark:text-gray-100' : 'text-amber-800'}`}>
                {doc.name}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {doc.status === 'ok' && doc.date
                  ? `PDF · ${doc.size} · ${timeAgo(doc.date)}`
                  : doc.isRequired ? 'Pendiente de subir' : 'Documento adicional pendiente'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {doc.status === 'ok' && doc.hasFile ? (
                <>
                  <button
                    onClick={() => onViewDocument(doc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-medium transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> Ver
                  </button>
                  <button
                    onClick={() => { void handleDelete(doc.id); }}
                    disabled={deletingId === doc.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-medium transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deletingId === doc.id ? '…' : 'Eliminar'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => triggerUpload(doc.docType)}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" /> Subir
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Entrega (SA-06) ─────────────────────────────────────────────────────

function DeliverySignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const coords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    last.current = coords(e);
  };

  const drawLine = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const p = coords(e);
    const prev = last.current;
    if (prev) {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div className="space-y-2">
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          width={640}
          height={240}
          className="w-full max-w-md h-[120px] cursor-crosshair"
          onMouseDown={start}
          onMouseMove={drawLine}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={drawLine}
          onTouchEnd={end}
        />
      </div>
      <button type="button" onClick={clear} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 underline">
        Borrar firma
      </button>
    </div>
  );
}

function TabEntrega({
  sale,
  onUpdateChecklist,
  onConfirmDelivery,
  canDeliver,
}: {
  sale: SaleData;
  onUpdateChecklist: (items: SaleDeliveryChecklistItem[]) => Promise<void>;
  onConfirmDelivery: (data: SaleDeliveryData) => Promise<void>;
  canDeliver: boolean;
}) {
  const checklist = useMemo(
    () => (sale.deliveryChecklist.length > 0
      ? sale.deliveryChecklist
      : DEFAULT_DELIVERY_CHECKLIST.map(item => ({ ...item, checked: false, notes: '' }))),
    [sale.deliveryChecklist],
  );

  const [items, setItems] = useState<SaleDeliveryChecklistItem[]>(() => checklist);
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingChecklist, setSavingChecklist] = useState(false);

  const dd = sale.deliveryData;
  const [scheduledDate, setScheduledDate] = useState(() =>
    (dd?.scheduledDate || sale.expectedDelivery || '').slice(0, 10),
  );
  const [deliveryLocation, setDeliveryLocation] = useState(dd?.deliveryLocation || '');
  const [deliveredBy, setDeliveredBy] = useState(dd?.deliveredBy || sale.responsible);
  const [receivedBy, setReceivedBy] = useState(dd?.receivedBy || sale.clientName);
  const [receivedByDni, setReceivedByDni] = useState(dd?.receivedByDni || sale.clientDni || '');
  const [receivedByPhone, setReceivedByPhone] = useState(dd?.receivedByPhone || sale.clientPhone);
  const [deliveryNotes, setDeliveryNotes] = useState(dd?.deliveryNotes || '');
  const [conditionNotes, setConditionNotes] = useState(dd?.conditionNotes || '');
  const [mileageAtDelivery, setMileageAtDelivery] = useState(
    dd?.mileageAtDelivery != null
      ? String(dd.mileageAtDelivery)
      : sale.vehicleMileage != null
        ? String(sale.vehicleMileage)
        : '',
  );
  const [fuelLevel, setFuelLevel] = useState(dd?.fuelLevel || sale.vehicleFuel || '');
  const [signatureData, setSignatureData] = useState(dd?.signatureData || '');

  useEffect(() => { setItems(checklist); }, [checklist]);

  useEffect(() => {
    const d = sale.deliveryData;
    setScheduledDate((d?.scheduledDate || sale.expectedDelivery || '').slice(0, 10));
    setDeliveryLocation(d?.deliveryLocation || '');
    setDeliveredBy(d?.deliveredBy || sale.responsible);
    setReceivedBy(d?.receivedBy || sale.clientName);
    setReceivedByDni(d?.receivedByDni || sale.clientDni || '');
    setReceivedByPhone(d?.receivedByPhone || sale.clientPhone);
    setDeliveryNotes(d?.deliveryNotes || '');
    setConditionNotes(d?.conditionNotes || '');
    setMileageAtDelivery(
      d?.mileageAtDelivery != null
        ? String(d.mileageAtDelivery)
        : sale.vehicleMileage != null
          ? String(sale.vehicleMileage)
          : '',
    );
    setFuelLevel(d?.fuelLevel || sale.vehicleFuel || '');
    setSignatureData(d?.signatureData || '');
  }, [sale.id]);

  const allChecked  = items.every(i => i.checked);
  const checkedCount = items.filter(i => i.checked).length;
  const pct          = Math.round((checkedCount / items.length) * 100);

  const persistChecklist = useCallback((next: SaleDeliveryChecklistItem[]) => {
    setSavingChecklist(true);
    void onUpdateChecklist(next).finally(() => setSavingChecklist(false));
  }, [onUpdateChecklist]);

  const toggle = (id: string) => {
    setItems((prev) => {
      const next = prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i);
      persistChecklist(next);
      return next;
    });
  };

  const updateNote = (id: string, notes: string) => {
    setItems((prev) => {
      const next = prev.map(i => i.id === id ? { ...i, notes } : i);
      persistChecklist(next);
      return next;
    });
  };

  const setNoteDraft = (id: string, notes: string) => {
    setItems((prev) => prev.map(i => i.id === id ? { ...i, notes } : i));
  };

  const handleConfirm = async () => {
    if (!allChecked) return;
    if (!signatureData) {
      toast.error('Firma del receptor obligatoria para generar el acta.');
      return;
    }
    if (!canDeliver) {
      toast.error('No tienes permiso para registrar la entrega.');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const km = parseLocaleNumber(mileageAtDelivery);
      const scheduledIso = scheduledDate
        ? `${scheduledDate}T12:00:00.000Z`
        : now;
      await onConfirmDelivery({
        scheduledDate: scheduledIso,
        actualDate: now,
        deliveredBy: deliveredBy.trim() || sale.responsible,
        receivedBy: receivedBy.trim() || sale.clientName,
        receivedByDni: receivedByDni.trim() || undefined,
        receivedByPhone: receivedByPhone.trim() || undefined,
        deliveryLocation: deliveryLocation.trim() || 'Concesionario',
        deliveryNotes: deliveryNotes.trim(),
        conditionNotes: conditionNotes.trim() || undefined,
        signatureData,
        mileageAtDelivery: Number.isFinite(km) ? km : sale.vehicleMileage,
        fuelLevel: fuelLevel.trim() || undefined,
      });
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-4">
      {sale.stage !== 'delivered' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Datos del acta de entrega</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Fecha prevista</span>
              <input
                type="date"
                value={scheduledDate.slice(0, 10)}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Lugar de entrega</span>
              <input
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                placeholder="Ej. Concesionario"
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Entregado por</span>
              <input
                value={deliveredBy}
                onChange={(e) => setDeliveredBy(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Recibido por</span>
              <input
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">DNI receptor</span>
              <input
                value={receivedByDni}
                onChange={(e) => setReceivedByDni(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Teléfono</span>
              <input
                value={receivedByPhone}
                onChange={(e) => setReceivedByPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Km en entrega</span>
              <input
                value={mileageAtDelivery}
                onChange={(e) => setMileageAtDelivery(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Combustible</span>
              <input
                value={fuelLevel}
                onChange={(e) => setFuelLevel(e.target.value)}
                placeholder="Ej. 1/2"
                className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900"
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-gray-500">Observaciones de entrega</span>
            <textarea
              rows={2}
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 dark:border-gray-700 text-sm resize-none"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-gray-500">Estado / incidencias</span>
            <textarea
              rows={2}
              value={conditionNotes}
              onChange={(e) => setConditionNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border-2 border-gray-100 dark:border-gray-700 text-sm resize-none"
            />
          </label>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">Checklist de entrega</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{checkedCount} de {items.length} puntos verificados</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-bold px-3 py-1.5 rounded-xl ${allChecked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {pct}%
          </div>
          {sale.stage === 'delivered' && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" /> Entregado
            </div>
          )}
        </div>
      </div>

      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {items.map((item, idx) => (
          <div key={item.id} className={`border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${item.checked ? '' : 'bg-amber-50/40'}`}>
            <div className="flex items-center gap-4 px-5 py-4">
              <button
                onClick={() => { toggle(item.id); }}
                className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 flex-shrink-0 transition-all ${
                  item.checked
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-gray-300 hover:border-emerald-400'
                }`}
              >
                {item.checked && <CheckCircle2 className="w-4 h-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.checked ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100 font-medium'}`}>
                  {item.label}
                </p>
                {item.notes && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">{item.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-400 dark:text-gray-500">{idx + 1}/{items.length}</span>
                <button
                  onClick={() => setNotesOpen(notesOpen === item.id ? null : item.id)}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                    notesOpen === item.id
                      ? 'bg-blue-100 text-blue-700'
                      : item.notes
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600'
                  }`}
                >
                  {item.notes ? '📝 Nota' : '+ Nota'}
                </button>
              </div>
            </div>
            {notesOpen === item.id && (
              <div className="px-5 pb-4">
                <textarea
                  rows={2}
                  value={item.notes}
                  onChange={(e) => { setNoteDraft(item.id, e.target.value); }}
                  onBlur={(e) => { updateNote(item.id, e.target.value); }}
                  placeholder="Observación opcional para este punto…"
                  className="w-full text-xs border-2 border-blue-100 focus:border-blue-400 rounded-xl p-2.5 focus:outline-none resize-none transition-colors placeholder-gray-300"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {savingChecklist && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Guardando checklist...</p>
      )}

      {sale.stage !== 'delivered' && (
        <div className={`rounded-2xl border p-5 ${allChecked ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
          {allChecked ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <ClipboardCheck className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-emerald-900">Todo listo para la entrega</p>
                  <p className="text-xs text-emerald-700 mt-0.5">Todos los puntos del checklist han sido verificados.</p>
                </div>
              </div>
              {!confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!canDeliver}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Truck className="w-4 h-4" /> Confirmar entrega al cliente
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-gray-800 border border-emerald-300 rounded-xl p-3 text-sm text-emerald-800">
                    ¿Confirmas que el vehículo <strong>{sale.vehicleName}</strong> ha sido entregado a <strong>{sale.clientName}</strong>? Se generará el acta en PDF y la venta quedará como entregada.
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Firma del receptor (obligatoria)</p>
                    <DeliverySignaturePad onChange={setSignatureData} />
                  </div>
                  {!canDeliver && (
                    <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">No tienes permiso para registrar la entrega. Pide a un responsable.</p>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => setConfirming(false)} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      Cancelar
                    </button>
                    <button
                      onClick={() => { void handleConfirm(); }}
                      disabled={saving || !canDeliver}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Procesando…' : 'Sí, confirmar entrega'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Checklist incompleto</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Faltan <strong>{items.length - checkedCount}</strong> punto{items.length - checkedCount !== 1 ? 's' : ''} por verificar antes de confirmar la entrega.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {sale.stage === 'delivered' && sale.deliveredAt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Truck className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="font-bold text-emerald-900">Vehículo entregado</p>
            <p className="text-sm text-emerald-700 mt-0.5">
              Entregado el {new Date(sale.deliveredAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Historial ───────────────────────────────────────────────────────────

function TabHistorial({
  sale,
  stage,
  onSaveNote,
}: {
  sale: SaleData;
  stage: SaleStage;
  onSaveNote: (text: string) => Promise<void> | void;
}) {
  const [note, setNote] = useState('');
  const cur = stageIdx(stage);

  const events = [
    ...sale.stageHistory.map((event) => ({
      id: event.id,
      color: event.type === 'stage' ? 'bg-blue-500' : 'bg-slate-400',
      type: event.type === 'stage' ? 'Estado' : 'Inicio',
      title: event.title,
      desc: event.description,
      user: event.user,
      date: event.date,
    })),
    ...sale.paymentHistory.map((payment) => ({
      id: payment.id,
      color: 'bg-amber-500',
      type: 'Cobro',
      title: 'Pago registrado',
      desc: `${payment.amount.toLocaleString('es-ES')}€ · ${payment.method}${payment.note ? ` · ${payment.note}` : ''}`,
      user: sale.responsible,
      date: payment.date,
    })),
    ...sale.generatedDocuments.map((document) => ({
      id: document.id,
      color: 'bg-violet-500',
      type: 'Documento',
      title: document.name,
      desc: document.status === 'ok' ? 'Documento subido correctamente' : 'Documento pendiente',
      user: sale.responsible,
      date: document.date,
    })),
    ...sale.internalNotes.map((savedNote) => ({
      id: savedNote.id,
      color: 'bg-emerald-500',
      type: 'Nota',
      title: 'Nota interna añadida',
      desc: savedNote.text,
      user: savedNote.user,
      date: savedNote.date,
    })),
    ...(sale.priceHistory || []).map((entry) => ({
      id: entry.id,
      color: entry.belowMinimum ? 'bg-red-500' : 'bg-orange-400',
      type: 'Precio',
      title: entry.newPrice < entry.previousPrice ? 'Precio reducido' : 'Precio actualizado',
      desc: `${entry.previousPrice.toLocaleString('es-ES')}€ → ${entry.newPrice.toLocaleString('es-ES')}€ · ${entry.reason}${entry.approvedBy ? ` · Aprobado por: ${entry.approvedBy}` : ''}`,
      user: entry.user,
      date: entry.date,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Timeline */}
      <div className="lg:col-span-2">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <p className="font-semibold text-gray-900 dark:text-gray-100">Línea de tiempo</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{events.length} eventos registrados</p>
          </div>
          <div className="p-5">
            <div className="relative">
              <div className="absolute left-5 top-2 bottom-2 w-px bg-gray-100 dark:bg-gray-700" />
              <div className="space-y-3">
                {events.map((ev, idx) => (
                  <div key={ev.id} className="relative pl-14">
                    <div className={`absolute left-3.5 top-4 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 ${ev.color}`} />
                    <div className={`p-4 rounded-2xl border ${idx === 0 ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-800 hover:border-gray-200'} transition-colors`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{ev.type}</span>
                          {idx === 0 && (
                            <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">Último</span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{ev.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ev.desc}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                        <span>👤 {ev.user}</span>
                        <span title={new Date(ev.date).toLocaleString('es-ES')}>
                          🕐 {timeAgo(ev.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes + stats */}
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Nota interna</p>
          <textarea
            rows={4} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Añade una nota sobre esta operación…"
            className="w-full text-sm border-2 border-gray-100 dark:border-gray-800 focus:border-blue-400 rounded-xl p-3 focus:outline-none resize-none transition-colors placeholder-gray-300"
          />
          <button
            disabled={!note.trim()}
            onClick={async () => {
              await onSaveNote(note);
              setNote('');
            }}
            className="mt-2 w-full py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-30">
            Guardar nota
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Actividad</p>
          <div className="space-y-3">
            {[
              { label: 'Días en pipeline', value: `${Math.max(1, Math.floor((Date.now() - new Date(sale.createdAt).getTime()) / 86400000))}d`, icon: Clock },
              { label: 'Eventos', value: `${events.length}`, icon: FileText },
              { label: 'Progreso', value: `${cur + 1} / 5 fases`, icon: CheckCircle2 },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <Icon className="w-4 h-4 text-gray-300" />
                  {label}
                </div>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'resumen',    label: 'Resumen' },
  { id: 'cobros',     label: 'Cobros' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'entrega',    label: 'Entrega' },
  { id: 'historial',  label: 'Historial' },
];

export function SaleDetail() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { createNotification } = useApp();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const salesListPath = salesListPathForBusiness(currentBusiness?.businessType);
  const salePerms = useSalePermissions();
  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const [showStageModal, setShowStageModal] = useState(false);
  const [showCloseWizard, setShowCloseWizard] = useState(false);
  const [showEditSaleModal, setShowEditSaleModal] = useState(false);
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [showFinancingCalc, setShowFinancingCalc] = useState(false);
  const [showRegisterPaymentModal, setShowRegisterPaymentModal] = useState(false);
  const editBtnRef = useRef<HTMLDivElement>(null);
  const [sale, setSale] = useState<SaleData | null>(null);
  const saleRef = useRef<SaleData | null>(null);
  const persistQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useModalClose(showStageModal, () => setShowStageModal(false));
  useModalClose(showCloseWizard, () => setShowCloseWizard(false));
  useModalClose(showEditSaleModal, () => setShowEditSaleModal(false));
  useModalClose(showFinancingCalc, () => setShowFinancingCalc(false));
  useModalClose(showRegisterPaymentModal, () => setShowRegisterPaymentModal(false));

  const loadSale = useCallback(async () => {
    if (!id) {
      setSale(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const nextSale = await getSaleRecord(id);
      setSale(nextSale);
      saleRef.current = nextSale;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar la venta');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadSale();
  }, [loadSale]);

  useEffect(() => {
    saleRef.current = sale;
  }, [sale]);

  // Deep-link desde módulo Ventas: Confirmar venta → abre el asistente de cierre.
  useEffect(() => {
    if (!sale || isLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('close') !== '1') return;
    if (sale.stage === 'sold' || sale.stage === 'delivered') return;
    if (!salePerms.canClose) {
      toast.error('No tienes permiso para cerrar ventas.');
      return;
    }
    setShowCloseWizard(true);
    params.delete('close');
    const next = params.toString();
    const path = `${window.location.pathname}${next ? `?${next}` : ''}`;
    window.history.replaceState({}, '', path);
  }, [sale, isLoading, salePerms.canClose]);

  // Deep-link desde módulo Ventas: Editar → abre el modal de edición.
  useEffect(() => {
    if (!sale || isLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') !== '1') return;
    setShowEditSaleModal(true);
    params.delete('edit');
    const next = params.toString();
    const path = `${window.location.pathname}${next ? `?${next}` : ''}`;
    window.history.replaceState({}, '', path);
  }, [sale, isLoading]);

  const persistSale = useCallback(async (updater: (current: SaleData) => SaleData) => {
    const runUpdate = async () => {
      const currentSale = saleRef.current;
      if (!currentSale) {
        return null;
      }
      const savedSale = await updateSaleInCouch(updater(currentSale));
      saleRef.current = savedSale;
      setSale(savedSale);
      return savedSale;
    };

    const scheduled = persistQueueRef.current.then(runUpdate, runUpdate);
    persistQueueRef.current = scheduled.then(() => undefined, () => undefined);
    return scheduled as Promise<SaleData | null>;
  }, []);

  const handleStageChange = useCallback(async (nextStage: SaleStage) => {
    if (!sale || nextStage === sale.stage) {
      return;
    }

    if (nextStage === 'sold' && sale.stage !== 'sold') {
      if (!salePerms.canClose) {
        toast.error('No tienes permiso para cerrar ventas.');
        return;
      }
      setShowCloseWizard(true);
      return;
    }

    const now = new Date().toISOString();
    const savedSale = await persistSale((current) => ({
      ...current,
      stage: nextStage,
      deliveredAt: nextStage === 'delivered' ? now : current.deliveredAt,
      stageHistory: [
        {
          id: `hist-${uuidv4()}`,
          type: 'stage',
          title: 'Fase actualizada',
          description: `La venta pasó de ${SALE_STAGE_LABELS[current.stage]} a ${SALE_STAGE_LABELS[nextStage]}.`,
          date: now,
          user: current.responsible,
        },
        ...current.stageHistory,
      ],
    }));
    if (nextStage === 'delivered') {
      setActiveTab('entrega');
    }
    if (savedSale && (nextStage === 'sold' || nextStage === 'delivered')) {
      await createNotification({
        level: 'success',
        category: 'sale',
        title: nextStage === 'delivered' ? 'Vehículo entregado' : 'Venta completada',
        message: `${savedSale.vehicleName} ${nextStage === 'delivered' ? `entregado a ${savedSale.clientName}` : `vendido a ${savedSale.clientName}`}`,
        entityId: savedSale.id,
        entityType: 'sale',
        route: `/saas/sales/${savedSale.id}`,
      });
    }
  }, [createNotification, persistSale, sale, salePerms.canClose]);

  const handleCloseWizardConfirm = useCallback(
    async (payload: {
      closureData: SaleClosureData;
      associatedCosts: number;
      commissionAmount: number;
      commissionAgent: string;
      exceptionReason: string;
    }) => {
      if (!sale) return;

      let closure: SaleClosureData = { ...payload.closureData };
      if (payload.exceptionReason.trim()) {
        const extra = `Excepción: ${payload.exceptionReason.trim()}`;
        closure = {
          ...closure,
          closureNotes: closure.closureNotes.trim() ? `${closure.closureNotes.trim()}\n${extra}` : extra,
        };
      }

      const uid = user?.user_id || user?.id || '';
      const now = new Date().toISOString();
      const savedSale = await persistSale((current) => ({
        ...current,
        stage: 'sold' as SaleStage,
        closureData: closure,
        vehicleBlocked: true,
        vehicleBlockReason: 'sold' as const,
        stageHistory: [
          {
            id: `hist-${uuidv4()}`,
            type: 'stage',
            title: 'Venta cerrada',
            description: payload.exceptionReason.trim()
              ? `Cierre con excepción: ${payload.exceptionReason.trim()}`
              : 'Venta cerrada mediante el asistente de cierre.',
            date: now,
            user: current.responsible,
          },
          ...current.stageHistory,
        ],
      }));

      if (!savedSale) {
        throw new Error('No se pudo guardar la venta');
      }

      if (uid) {
        try {
          await syncVehicleWithSale(uid, savedSale);
          await ensureSaleIncomeFromClosure(uid, savedSale);
          await ensureCommissionExpense(uid, savedSale);
          await persistSale((c) =>
            c.id === savedSale.id ? { ...c, financeIncomeCreated: true } : c,
          );
        } catch (err) {
          console.error(err);
          toast.error(err instanceof Error ? err.message : 'Error al sincronizar vehículo o finanzas');
        }
      }

      await createNotification({
        level: 'success',
        category: 'sale',
        title: 'Venta completada',
        message: `${savedSale.vehicleName} vendido a ${savedSale.clientName}`,
        entityId: savedSale.id,
        entityType: 'sale',
        route: `/saas/sales/${savedSale.id}`,
      });
      toast.success('Venta cerrada correctamente');
    },
    [createNotification, persistSale, sale, user?.id, user?.user_id],
  );

  const openRegisterPaymentModal = useCallback(() => {
    if (!sale) {
      return;
    }
    setShowRegisterPaymentModal(true);
  }, [sale]);

  const handleRegisterPayment = useCallback(async ({
    amount,
    method,
    note,
  }: {
    amount: number;
    method: string;
    note: string;
  }) => {
    if (!sale) {
      return;
    }

    const now = new Date().toISOString();
    let transitionedToSold = false;

    const savedSale = await persistSale((current) => {
      const financingPayment = /financi|leasing|renting/i.test(method);
      const nextDepositPaid = financingPayment ? current.depositPaid : current.depositPaid + amount;
      const nextFinancingAmount = financingPayment ? current.financingAmount + amount : current.financingAmount;
      const covered = nextDepositPaid + nextFinancingAmount;
      const nextStage =
        covered >= current.totalPrice && ['reserved', 'documentation'].includes(current.stage)
          ? 'sold'
          : current.stage;

      const merged: SaleData = {
        ...current,
        stage: nextStage,
        depositPaid: nextDepositPaid,
        financingAmount: nextFinancingAmount,
        paymentMethod: method,
        paymentHistory: [
          {
            id: `pay-${uuidv4()}`,
            amount,
            method,
            date: now,
            note,
          },
          ...current.paymentHistory,
        ],
        stageHistory:
          nextStage !== current.stage
            ? [
                {
                  id: `hist-${uuidv4()}`,
                  type: 'stage',
                  title: 'Venta cerrada',
                  description: 'El cobro completó la operación y la venta pasó a Vendido.',
                  date: now,
                  user: current.responsible,
                },
                ...current.stageHistory,
              ]
            : current.stageHistory,
      };

      if (nextStage === 'sold' && current.stage !== 'sold') {
        transitionedToSold = true;
        const byId = user?.user_id || user?.id || '';
        const byName = user?.fullName || current.responsible;
        merged.closureData = buildAutoClosureDataOnFullPayment(merged, byId, byName);
        merged.vehicleBlocked = true;
        merged.vehicleBlockReason = 'sold';
      }

      return merged;
    });

    if (savedSale && transitionedToSold) {
      const uid = user?.user_id || user?.id || '';
      if (uid) {
        try {
          await syncVehicleWithSale(uid, savedSale);
          await ensureSaleIncomeFromClosure(uid, savedSale);
          await ensureCommissionExpense(uid, savedSale);
          await persistSale((c) =>
            c.id === savedSale.id ? { ...c, financeIncomeCreated: true } : c,
          );
        } catch (err) {
          console.error(err);
          toast.error(err instanceof Error ? err.message : 'Error al sincronizar cierre automático');
        }
      }
      await createNotification({
        level: 'success',
        category: 'sale',
        title: 'Venta completada',
        message: `${savedSale.vehicleName} vendido a ${savedSale.clientName}`,
        entityId: savedSale.id,
        entityType: 'sale',
        route: `/saas/sales/${savedSale.id}`,
      });
      toast.success('Cobro registrado y venta cerrada');
    }
  }, [createNotification, persistSale, sale, user?.fullName, user?.id, user?.user_id]);

  const handleSaveNote = useCallback(async (text: string) => {
    const value = text.trim();
    if (!value) {
      return;
    }

    const now = new Date().toISOString();
    await persistSale((current) => ({
      ...current,
      notes: value,
      internalNotes: [
        {
          id: `note-${uuidv4()}`,
          text: value,
          date: now,
          user: current.responsible,
        },
        ...current.internalNotes,
      ],
    }));
  }, [persistSale]);

  const handleUploadDocument = useCallback(async (documentType: string, file: File) => {
    if (!sale) return;

    const labels: Record<string, string> = {
      contract:  'Contrato de compraventa',
      invoice:   'Factura de venta',
      worksheet: 'Hoja de encargo - Transferencia',
      delivery:  'Acta de entrega',
    };

    const docName = labels[documentType] ?? file.name.replace(/\.[^.]+$/, '') ?? 'Documento adicional';
    const sizeMB  = (file.size / 1024 / 1024).toFixed(2);

    const fileData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsDataURL(file);
    });

    const now = new Date().toISOString();
    const savedSale = await persistSale((current) => {
      const existing = current.generatedDocuments.find(d => d.type === documentType);
      const nextDocuments = existing
        ? current.generatedDocuments.map(d =>
            d.type === documentType
              ? { ...d, name: docName, status: 'ok' as const, date: now, size: `${sizeMB} MB`, fileData, mimeType: file.type }
              : d,
          )
        : [
            {
              id: `doc-${uuidv4()}`,
              name: docName,
              status: 'ok' as const,
              type: documentType,
              size: `${sizeMB} MB`,
              date: now,
              fileData,
              mimeType: file.type,
            },
            ...current.generatedDocuments,
          ];

      return { ...current, generatedDocuments: nextDocuments };
    });

    if (savedSale) {
      await createNotification({
        level: 'success',
        category: 'document',
        title: 'Documento subido',
        message: `${docName} guardado correctamente`,
        entityId: savedSale.id,
        entityType: 'sale',
        route: `/saas/sales/${savedSale.id}`,
      });
    }
  }, [createNotification, persistSale, sale]);

  const handleViewDocument = useCallback((documentId: string) => {
    if (!sale) return;
    const doc = sale.generatedDocuments.find(d => d.id === documentId);
    if (!doc?.fileData) return;

    const parts = doc.fileData.split(',');
    const mime  = parts[0].match(/:(.*?);/)?.[1] ?? doc.mimeType ?? 'application/pdf';
    const bstr  = atob(parts[1]);
    const bytes = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) bytes[i] = bstr.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }, [sale]);

  const handleDeleteDocument = useCallback(async (documentId: string) => {
    if (!sale) return;
    await persistSale((current) => ({
      ...current,
      generatedDocuments: current.generatedDocuments.map(d =>
        d.id === documentId
          ? { ...d, status: 'pending' as const, fileData: undefined, mimeType: undefined }
          : d,
      ),
    }));
  }, [persistSale, sale]);

  const handleSaveEditSale = useCallback(async (updates: Partial<SaleData>) => {
    await persistSale((current) => ({ ...current, ...updates }));
  }, [persistSale]);

  const handleApplyFinancing = useCallback(async (financingAmount: number, bank: string) => {
    await persistSale((current) => ({
      ...current,
      financingAmount,
      financingBank: bank,
    }));
  }, [persistSale]);

  const handleUpdateChecklist = useCallback(async (items: SaleDeliveryChecklistItem[]) => {
    await persistSale((current) => ({ ...current, deliveryChecklist: items }));
  }, [persistSale]);

  const handleConfirmDelivery = useCallback(
    async (deliveryData: SaleDeliveryData) => {
      if (!sale) return;
      const now = new Date().toISOString();
      const savedSale = await persistSale((current) => ({
        ...current,
        stage: 'delivered' as SaleStage,
        deliveredAt: now,
        deliveryData: {
          ...deliveryData,
          actualDate: deliveryData.actualDate || now,
        },
        stageHistory: [
          {
            id: `hist-${uuidv4()}`,
            type: 'stage' as const,
            title: 'Vehículo entregado',
            description: `Entrega confirmada (acta digital). ${current.deliveryChecklist.length} puntos de checklist verificados.`,
            date: now,
            user: current.responsible,
          },
          ...current.stageHistory,
        ],
      }));
      if (savedSale) {
        const uid = user?.user_id || user?.id || '';
        if (uid) {
          try {
            await syncVehicleWithSale(uid, savedSale);
          } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : 'No se pudo actualizar el vehículo');
          }
        }
        try {
          downloadDeliveryActa(savedSale);
        } catch (err) {
          console.error(err);
          toast.error('No se pudo generar el PDF del acta');
        }
        await createNotification({
          level: 'success',
          category: 'sale',
          title: 'Vehículo entregado',
          message: `${savedSale.vehicleName} entregado a ${savedSale.clientName}`,
          entityId: savedSale.id,
          entityType: 'sale',
          route: `/saas/sales/${savedSale.id}`,
        });
        toast.success('Entrega registrada. Se ha descargado el acta.');
      }
    },
    [createNotification, persistSale, sale, user?.id, user?.user_id],
  );

  if (isLoading) {
    return (
      <Layout title={t('sales.detail.loading')} subtitle="">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-12 text-center max-w-md mx-auto mt-12">
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando datos de la venta desde CouchDB...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title={t('sales.detail.error')} subtitle="">
        <div className="bg-red-50 border border-red-200 rounded-3xl p-10 text-center max-w-md mx-auto mt-12">
          <h3 className="text-lg font-semibold text-red-900 mb-2">No se pudo abrir la venta</h3>
          <p className="text-sm text-red-700 mb-6">{error}</p>
          <button onClick={() => void loadSale()}
            className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors">
            Reintentar
          </button>
        </div>
      </Layout>
    );
  }

  const baseSale = sale;
  const stage = baseSale?.stage ?? 'interested';

  if (!baseSale) {
    return (
      <Layout title={t('sales.detail.notFound')} subtitle="">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-16 text-center max-w-sm mx-auto mt-12">
          <div className="text-5xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Venta no encontrada</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">Esta operación no existe o fue eliminada.</p>
          <button onClick={() => navigate(salesListPath)}
            className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors">
            Volver a ventas
          </button>
        </div>
      </Layout>
    );
  }

  const depositPaid = baseSale.depositPaid;
  const financing   = baseSale.financingAmount ?? 0;
  const pending     = getSalePendingAmount(baseSale);
  const pct         = baseSale.totalPrice ? Math.min(100, Math.round((getSaleCoveredAmount(baseSale) / baseSale.totalPrice) * 100)) : 0;
  const stageToken  = STAGE_TOKEN[stage];

  return (
    <Layout title={`${baseSale.vehicleName}`} subtitle={`${baseSale.clientName} · ${baseSale.vehiclePlate}`}>
      <div className="space-y-3 pb-10">

        {/* Back */}
        <button onClick={() => navigate(salesListPath)}
          className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t('sales.title')}
        </button>

        {/* ── 1. Workflow bar ── */}
        <WorkflowBar stage={stage} />

        {/* ── 2. Summary card ── */}
        <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 ${stageToken.accentBorder} overflow-hidden`}>
          <div className="p-5 sm:p-6">
            {/* Top row: stage pill + edit */}
            <div className="flex items-center justify-between mb-4">
              <StagePill stage={stage} />
              <div className="relative" ref={editBtnRef}>
                <button
                  onClick={() => setShowEditMenu(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                    showEditMenu
                      ? 'bg-gray-900 border-gray-900 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                  <ChevronDown className={`w-3 h-3 transition-transform ${showEditMenu ? 'rotate-180' : ''}`} />
                </button>
                <EditDropdown
                  isOpen={showEditMenu}
                  onClose={() => setShowEditMenu(false)}
                  onChangeStage={() => { setShowEditMenu(false); setShowStageModal(true); }}
                  onEditSale={() => { setShowEditSaleModal(true); }}
                  onOpenCalculator={() => { setShowFinancingCalc(true); }}
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
              {/* Left: vehicle + client */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0 text-xl">🚗</div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-gray-100 leading-tight">{baseSale.vehicleName}</p>
                    <span className="font-mono bg-blue-600 text-white px-1.5 py-0.5 rounded-md text-xs font-bold">{baseSale.vehiclePlate}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white">{baseSale.clientName.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{baseSale.clientName}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{baseSale.responsible}</p>
                  </div>
                </div>
              </div>

              {/* Right: amounts */}
              <div className="sm:text-right">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Total acordado</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 leading-none">{baseSale.totalPrice.toLocaleString('es-ES')}€</p>
                <div className="flex sm:justify-end gap-4 mt-3">
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">Cobrado</p>
                    <p className="text-base font-bold text-emerald-600">{(depositPaid + financing).toLocaleString('es-ES')}€</p>
                  </div>
                  {pending > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">Pendiente</p>
                      <p className="text-base font-bold text-red-500">{pending.toLocaleString('es-ES')}€</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1.5">
                <span>{pct}% cobrado</span>
                {baseSale.expectedDelivery && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Entrega: {new Date(baseSale.expectedDelivery).toLocaleDateString('es-ES')}
                  </span>
                )}
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. Tabs ── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Tab nav */}
          <div className="flex border-b border-gray-100 dark:border-gray-800 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 sm:flex-none px-5 sm:px-7 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-amber-500 text-amber-800 bg-amber-50/50'
                    : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab body */}
          <div className="p-5 sm:p-6">
            {activeTab === 'resumen'    && <TabResumen    sale={baseSale} stage={stage} onChangeStage={() => setShowStageModal(true)} setActiveTab={setActiveTab} navigate={navigate} />}
            {activeTab === 'cobros'     && <TabCobros     sale={baseSale} onRegisterPayment={openRegisterPaymentModal} onOpenCalculator={() => setShowFinancingCalc(true)} />}
            {activeTab === 'documentos' && (
              <TabDocumentos
                sale={baseSale}
                onUploadDocument={handleUploadDocument}
                onViewDocument={handleViewDocument}
                onDeleteDocument={handleDeleteDocument}
              />
            )}
            {activeTab === 'entrega' && (
              <TabEntrega
                sale={baseSale}
                onUpdateChecklist={handleUpdateChecklist}
                onConfirmDelivery={handleConfirmDelivery}
                canDeliver={salePerms.canDeliver}
              />
            )}
            {activeTab === 'historial'  && <TabHistorial  sale={baseSale} stage={stage} onSaveNote={handleSaveNote} />}
          </div>
        </div>
      </div>

      <ChangeStageModal
        isOpen={showStageModal}
        onClose={() => setShowStageModal(false)}
        currentStage={stage}
        onConfirm={(nextStage) => { void handleStageChange(nextStage); }}
      />

      {baseSale && (
        <EditSaleModal
          isOpen={showEditSaleModal}
          onClose={() => setShowEditSaleModal(false)}
          sale={baseSale}
          onSave={handleSaveEditSale}
        />
      )}

      {baseSale && (
        <RegisterPaymentModal
          isOpen={showRegisterPaymentModal}
          onClose={() => setShowRegisterPaymentModal(false)}
          pendingAmount={getSalePendingAmount(baseSale)}
          defaultMethod={baseSale.paymentMethod || 'Transferencia'}
          onConfirm={handleRegisterPayment}
        />
      )}

      {baseSale && (
        <FinancingCalculatorModal
          isOpen={showFinancingCalc}
          onClose={() => setShowFinancingCalc(false)}
          sale={baseSale}
          onApply={handleApplyFinancing}
        />
      )}

      {baseSale && (
        <CloseSaleWizard
          isOpen={showCloseWizard}
          sale={baseSale}
          userId={user?.user_id || user?.id || ''}
          userName={user?.fullName || 'Usuario'}
          canCloseWithExceptions={salePerms.canCloseWithExceptions}
          onClose={() => setShowCloseWizard(false)}
          onConfirm={handleCloseWizardConfirm}
        />
      )}
    </Layout>
  );
}
