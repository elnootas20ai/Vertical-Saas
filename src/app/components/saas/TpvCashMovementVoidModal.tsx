import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import { VERTIAL_BTN_DANGER, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import type { TpvRegisterTransaction } from '../../lib/deliveryApi';

const TPV_MODAL_Z = 'z-[100]';

const TX_LABELS: Record<string, string> = {
  cash_in: 'Entrada',
  cash_out: 'Salida',
  return: 'Devolución',
};

/** Motivo obligatorio al anular un movimiento de caja (sobre todo salidas). */
export function TpvCashMovementVoidModal({
  tx,
  onConfirm,
  onClose,
  loading,
}: {
  tx: TpvRegisterTransaction;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
}) {
  useModalClose(!loading, onClose);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const valid = reason.trim().length >= 2;
  const busy = Boolean(loading || submitting);
  const label = TX_LABELS[tx.type] || 'Movimiento';
  const amount = Number(tx.amount || 0);

  useEffect(() => {
    setReason('');
  }, [tx.id]);

  const handleSubmit = async () => {
    if (!valid || busy) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`fixed inset-0 ${TPV_MODAL_Z} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-5 border border-stone-200 dark:border-stone-700">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute top-3 right-3 p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
        >
          <X className="w-5 h-5 text-stone-500" />
        </button>

        <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100 mb-1 pr-8">
          Eliminar {label.toLowerCase()}
        </h3>
        <p className="text-sm text-stone-500 mb-3">
          Indica el motivo. Quedará anotado en el cierre de caja.
        </p>

        <div className="mb-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 px-3 py-2.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-stone-800 dark:text-stone-100">{label}</span>
            <span className={`font-bold tabular-nums ${tx.type === 'cash_in' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {tx.type === 'cash_in' ? '+' : '−'}
              {amount.toFixed(2)}€
            </span>
          </div>
          {tx.description?.trim() ? (
            <p className="mt-1 text-xs text-stone-500 break-words">Motivo original: {tx.description.trim()}</p>
          ) : null}
        </div>

        <label className="block text-xs font-semibold text-stone-500 mb-1">Motivo de la eliminación</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej. error de importe, duplicada, no salió el dinero…"
          disabled={busy}
          autoFocus
          className="w-full mb-4 px-3 py-2.5 min-h-11 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit();
          }}
        />

        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={`flex-1 ${VERTIAL_BTN_SECONDARY}`}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!valid || busy}
            className={`flex-1 ${VERTIAL_BTN_DANGER}`}
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
