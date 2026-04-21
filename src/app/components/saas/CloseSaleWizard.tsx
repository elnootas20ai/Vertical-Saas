import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, ChevronRight, X } from 'lucide-react';
import type { SaleClosureData, SaleRecord } from '../../lib/salesTypes';
import { getSaleFinalMargin, getSalePendingAmount, isSaleReadyToClose } from '../../lib/salesTypes';

type Step = 1 | 2 | 3;

interface Props {
  isOpen: boolean;
  sale: SaleRecord;
  userId: string;
  userName: string;
  canCloseWithExceptions: boolean;
  onClose: () => void;
  onConfirm: (data: {
    closureData: SaleClosureData;
    associatedCosts: number;
    commissionAmount: number;
    commissionAgent: string;
    exceptionReason: string;
  }) => Promise<void>;
}

export function CloseSaleWizard(props: Props) {
  const { isOpen, sale, userId, userName, canCloseWithExceptions, onClose, onConfirm } = props;
  const [step, setStep] = useState<Step>(1);
  const [associatedCosts, setAssociatedCosts] = useState('0');
  const [commissionAmount, setCommissionAmount] = useState('');
  const [commissionAgent, setCommissionAgent] = useState('');
  const [closureNotes, setClosureNotes] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [forceClose, setForceClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ready = useMemo(() => isSaleReadyToClose(sale), [sale]);
  const pending = getSalePendingAmount(sale);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setAssociatedCosts('0');
    setCommissionAmount('');
    setCommissionAgent('');
    setClosureNotes('');
    setExceptionReason('');
    setForceClose(false);
    setSaving(false);
    setError('');
  }, [isOpen, sale.id]);

  if (!isOpen) return null;

  const associatedNum = Number(String(associatedCosts).replace(',', '.')) || 0;
  const commissionNum = Number(String(commissionAmount).replace(',', '.')) || 0;
  const saleWithClosure = {
    ...sale,
    closureData: {
      ...(sale.closureData || {}),
      commissionAmount: commissionNum,
    } as SaleClosureData,
  };
  const marginNet = getSaleFinalMargin(saleWithClosure, associatedNum);

  const handleStep1Next = () => {
    if (!ready.ready && !canCloseWithExceptions) {
      setError('Hay requisitos pendientes. Un gerente debe autorizar el cierre.');
      return;
    }
    if (!ready.ready && canCloseWithExceptions && !forceClose) {
      setError('Marca la casilla de autorización o completa los requisitos.');
      return;
    }
    if (!ready.ready && canCloseWithExceptions && forceClose && !exceptionReason.trim()) {
      setError('Indica el motivo de cierre con requisitos pendientes.');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const closureData: SaleClosureData = {
        closedAt: now,
        closedBy: userId || userName,
        approvedBy: !ready.ready && canCloseWithExceptions ? userName : undefined,
        paymentComplete: pending <= 0,
        contractSigned: sale.generatedDocuments.some((d) => d.type === 'contract' && d.status === 'ok'),
        documentationComplete: true,
        closureNotes: closureNotes.trim(),
        finalPrice: sale.totalPrice,
        finalMargin: marginNet,
        finalMarginPercent: sale.totalPrice > 0 ? Math.round((marginNet / sale.totalPrice) * 100) : 0,
        associatedCosts: associatedNum,
        commissionAmount: commissionNum > 0 ? commissionNum : undefined,
        commissionAgent: commissionNum > 0 ? commissionAgent.trim() : undefined,
      };

      await onConfirm({
        closureData,
        associatedCosts: associatedNum,
        commissionAmount: commissionNum,
        commissionAgent: commissionAgent.trim(),
        exceptionReason: exceptionReason.trim(),
      });
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cerrar la venta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-2 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Cierre de venta</p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{sale.vehicleName}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {step === 1 && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Verificación antes de cerrar como vendido</p>
            <ul className="space-y-2">
              <li className={`flex items-center gap-2 text-sm ${pending <= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {pending <= 0 ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                Cobro: {pending <= 0 ? 'Completo' : `Pendiente ${pending.toLocaleString('es-ES')} €`}
              </li>
              <li className={`flex items-center gap-2 text-sm ${sale.generatedDocuments.some((d) => d.type === 'contract' && d.status === 'ok') ? 'text-emerald-700' : 'text-amber-700'}`}>
                {sale.generatedDocuments.some((d) => d.type === 'contract' && d.status === 'ok') ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                Contrato de compraventa
              </li>
              <li className={`flex items-center gap-2 text-sm ${sale.generatedDocuments.some((d) => d.type === 'invoice' && d.status === 'ok') ? 'text-emerald-700' : 'text-amber-700'}`}>
                {sale.generatedDocuments.some((d) => d.type === 'invoice' && d.status === 'ok') ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                Factura de venta
              </li>
            </ul>

            {!ready.ready && canCloseWithExceptions && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={forceClose} onChange={(e) => setForceClose(e.target.checked)} className="mt-1" />
                  <span>Autorizo el cierre con requisitos pendientes (motivo obligatorio)</span>
                </label>
                <textarea
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  placeholder="Motivo de la excepción"
                  rows={2}
                  className="w-full text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-white dark:bg-gray-800"
                />
              </div>
            )}

            {!ready.ready && !canCloseWithExceptions && (
              <p className="text-sm text-red-600">No puedes cerrar: faltan requisitos. Sube documentación o cobra el pendiente.</p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-sm font-medium">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleStep1Next}
                disabled={!ready.ready && !canCloseWithExceptions}
                className="flex-1 py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-6 space-y-4">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Resumen y margen</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="text-xs text-gray-500">Costes asociados (€)</label>
                <input
                  value={associatedCosts}
                  onChange={(e) => setAssociatedCosts(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Comisión (€)</label>
                <input
                  value={commissionAmount}
                  onChange={(e) => setCommissionAmount(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Comercial / agente</label>
                <input
                  value={commissionAgent}
                  onChange={(e) => setCommissionAgent(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Observaciones de cierre</label>
              <textarea
                value={closureNotes}
                onChange={(e) => setClosureNotes(e.target.value)}
                rows={3}
                className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm"
              />
            </div>
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4">
              <p className="text-xs text-emerald-800 dark:text-emerald-200 font-semibold uppercase">Margen neto estimado</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{marginNet.toLocaleString('es-ES')} €</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(1)} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-sm font-medium">
                Atrás
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
            <p className="font-bold text-gray-900 dark:text-gray-100">Venta cerrada</p>
            <p className="text-sm text-gray-500">Vehículo marcado como vendido, ingreso en finanzas y estado del vehículo actualizado.</p>
            <button type="button" onClick={onClose} className="px-6 py-3 rounded-2xl bg-gray-900 text-white text-sm font-semibold">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
