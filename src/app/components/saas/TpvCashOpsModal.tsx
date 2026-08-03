import { useState } from 'react';
import { Loader2, X, ArrowDownCircle, ArrowUpCircle, RotateCcw } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import type { TpvRegisterTransaction } from '../../lib/deliveryApi';
import { DecimalNumpadField } from './DecimalNumpadField';
import { parseDecimalPadValue } from '../../lib/decimalNumpadInput';
import { VERTIAL_BTN_PRIMARY } from '../../lib/vertialUiTokens';

const TPV_MODAL_Z = 'z-[100]';

type CashOpType = 'cash_in' | 'cash_out' | 'return';

/** Atajos opcionales; el importe es libre (numpad / teclado). */
const QUICK_AMOUNTS = [10, 20, 50, 100, 200] as const;

const OP_CONFIG: Record<CashOpType, { label: string; icon: typeof ArrowUpCircle; color: string }> = {
  cash_in: {
    label: 'Entrada de efectivo',
    icon: ArrowDownCircle,
    color: 'text-emerald-600',
  },
  cash_out: {
    label: 'Salida de efectivo',
    icon: ArrowUpCircle,
    color: 'text-amber-600',
  },
  return: {
    label: 'Devolución',
    icon: RotateCcw,
    color: 'text-red-600',
  },
};

function roundCashAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

export function TpvCashOpsModal({
  onConfirm,
  onClose,
  loading,
  registeredBy,
}: {
  onConfirm: (op: Omit<TpvRegisterTransaction, 'id' | 'date'>) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
  registeredBy?: string;
}) {
  useModalClose(!loading, onClose);
  const [opType, setOpType] = useState<CashOpType>('cash_in');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parsed = parseDecimalPadValue(amount);
  const cashAmount = Number.isFinite(parsed) ? roundCashAmount(parsed) : Number.NaN;
  const valid = Number.isFinite(cashAmount) && cashAmount > 0 && description.trim().length >= 2;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({
        type: opType,
        paymentMethod: 'efectivo',
        amount: cashAmount,
        description: description.trim(),
        registeredBy: registeredBy || 'Tablet',
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loading || submitting;

  return (
    <div className={`fixed inset-0 ${TPV_MODAL_Z} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-5">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Movimiento de caja</h3>
        <p className="text-sm text-gray-500 mb-4">Entrada, salida o devolución en efectivo</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {(Object.keys(OP_CONFIG) as CashOpType[]).map((key) => {
            const cfg = OP_CONFIG[key];
            const Icon = cfg.icon;
            const selected = opType === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setOpType(key)}
                disabled={busy}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-colors ${
                  selected
                    ? 'border-gray-900 dark:border-gray-200 bg-gray-50 dark:bg-gray-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
                }`}
              >
                <Icon className={`w-5 h-5 ${cfg.color}`} />
                {key === 'cash_in' ? 'Entrada' : key === 'cash_out' ? 'Salida' : 'Devolución'}
              </button>
            );
          })}
        </div>

        <label className="block text-xs font-semibold text-gray-500 mb-1">Importe (€)</label>
        <p className="text-[11px] text-stone-400 mb-1.5">Cualquier cantidad — o atajo:</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {QUICK_AMOUNTS.map((n) => {
            const selected = cashAmount === n;
            return (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => setAmount(String(n))}
                className={`min-h-11 min-w-[3.25rem] px-3 rounded-xl text-sm font-bold tabular-nums border transition-colors ${
                  selected
                    ? 'border-blue-600 bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40 dark:border-blue-500'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-blue-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200'
                }`}
              >
                {n}€
              </button>
            );
          })}
        </div>
        <DecimalNumpadField
          value={amount}
          onChange={setAmount}
          placeholder="0.00"
          disabled={busy}
          showNumpad
          inputClassName="w-full mb-3 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-lg font-semibold tabular-nums"
        />

        <label className="block text-xs font-semibold text-gray-500 mb-1">
          {opType === 'cash_out' ? 'Motivo de la salida' : opType === 'return' ? 'Motivo de la devolución' : 'Motivo'}
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            opType === 'cash_out'
              ? 'Ej. compra de hielo, pagar proveedor, cambio…'
              : 'Ej. cambio de monedas, devolución pedido #123'
          }
          disabled={busy}
          className="w-full mb-4 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
        />

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!valid || busy}
          className={`w-full ${VERTIAL_BTN_PRIMARY}`}
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          Registrar movimiento
          {valid ? ` · ${cashAmount.toFixed(2)}€` : ''}
        </button>
      </div>
    </div>
  );
}
